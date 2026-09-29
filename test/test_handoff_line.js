// "Hand to agent" types `claude <text>` into a terminal for the user to review.
// The text comes from queue items and notice titles that agents write, so it is
// untrusted: it must arrive as ONE literal argument, and nothing in it may press
// Enter, Tab or run anything. Checked against the real shells on this machine.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const fc = require('fast-check');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const ROOT = process.env.AF_ROOT || path.join(__dirname, '..');
const H = require(path.join(ROOT, 'out', 'core', 'handoffLine.js'));

const C = String.fromCharCode;
const NASTY = ["'", '"', '`', '$', '$(calc)', '${x}', ';', '&', '|', '%PATH%', '!x!', '^', '<', '>', '\\', '(', ')',
    '#', '@', '*', ' ', 'ş', 'İ', 'ğ', '🙂', C(13), C(10), C(9), C(0x2028), C(0x2029), C(0x1b) + '[2J', C(0x9b),
    C(0x2018), C(0x2019), C(0x201a), C(0x201b), C(0x201c), C(0x201d), "'; Write-Output PWNED; '", "'\"$(whoami)\"'"];
const nasty = fc.array(fc.oneof(fc.constantFrom(...NASTY), fc.string({ unit: 'grapheme', maxLength: 4 })), { maxLength: 12 })
    .map(a => a.join(''));
const flat = t => String(t).replace(/[\r\n\u2028\u2029]+/g, ' ').replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').trim().slice(0, 2000);

console.log('\n== which shell ==');
ok('pwsh / powershell paths', H.shellKindOf('C:\\Program Files\\PowerShell\\7\\pwsh.exe', 'win32') === 'powershell'
    && H.shellKindOf('C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', 'win32') === 'powershell');
ok('cmd', H.shellKindOf('C:\\WINDOWS\\system32\\cmd.exe', 'win32') === 'cmd');
ok('bash / zsh / git bash are posix', H.shellKindOf('/bin/zsh', 'darwin') === 'posix'
    && H.shellKindOf('C:\\Program Files\\Git\\bin\\bash.exe', 'win32') === 'posix');
ok('unknown default: PowerShell on Windows, posix elsewhere',
    H.shellKindOf('', 'win32') === 'powershell' && H.shellKindOf(undefined, 'linux') === 'posix');

console.log('\n== nothing in the line can press a key ==');
for (const kind of ['powershell', 'posix', 'cmd']) {
    const r = fc.check(fc.property(nasty, t => !/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(H.handoffCommand(t, kind))), { numRuns: 1000 });
    ok(`${kind}: no line break, tab or control byte survives`, !r.failed);
}
ok('the length cap applies to the text, not to its escaped form',
    H.handoffCommand("'".repeat(3000), 'powershell').length === 'claude '.length + 2 + 2 * 2000);

// ------------------------------------------------------------ real shells
function runScript(ext, body, argv) {
    const f = path.join(os.tmpdir(), `af-handoff-${process.pid}-${Date.now()}.${ext}`);
    fs.writeFileSync(f, body, 'utf8');
    try { return spawnSync(argv[0], argv.slice(1).concat([f]), { encoding: 'utf8', timeout: 60000 }); }
    finally { try { fs.unlinkSync(f); } catch { /* temp */ } }
}
const samples = fc.sample(nasty, { numRuns: 150, seed: 42 }).concat(NASTY, [NASTY.join('')]);
const SEP = '<<AF-SEP>>';

console.log('\n== PowerShell reads exactly one literal argument ==');
if (process.platform === 'win32') {
    const lines = ['[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false'];
    for (const t of samples) {
        lines.push('$a = ' + H.handoffCommand(t, 'powershell').slice('claude '.length));
        lines.push(`[Console]::Out.Write($a + '${SEP}')`);
    }
    const r = runScript('ps1', '\uFEFF' + lines.join('\r\n') + '\r\n',
        ['powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File']);
    const got = String(r.stdout || '').split(SEP).slice(0, -1);
    ok(`powershell ran every sample (${got.length}/${samples.length})${r.stderr ? ' — ' + r.stderr.slice(0, 200) : ''}`,
        got.length === samples.length && !r.stderr);
    const bad = samples.findIndex((t, i) => got[i] !== flat(t));
    ok('…and each one came back as the text itself' + (bad >= 0 ? ` — first difference: ${JSON.stringify(samples[bad])} → ${JSON.stringify(got[bad])}` : ''), bad < 0);
} else { console.log('  (not Windows — PowerShell oracle not run)'); }

console.log('\n== a POSIX shell reads exactly one literal argument ==');
const bash = ['C:\\Program Files\\Git\\bin\\bash.exe', '/bin/bash', '/usr/bin/bash'].find(p => fs.existsSync(p));
if (bash) {
    const lines = samples.map(t => 'a=' + H.handoffCommand(t, 'posix').slice('claude '.length) + `; printf '%s${SEP}' "$a"`);
    const r = spawnSync(bash, ['--noprofile', '--norc'], { input: lines.join('\n') + '\n', encoding: 'utf8', timeout: 60000 });
    const got = String(r.stdout || '').split(SEP).slice(0, -1);
    ok(`bash ran every sample (${got.length}/${samples.length})`, got.length === samples.length);
    const bad = samples.findIndex((t, i) => got[i] !== flat(t));
    ok('…and each one came back as the text itself' + (bad >= 0 ? ` — first difference: ${JSON.stringify(samples[bad])} → ${JSON.stringify(got[bad])}` : ''), bad < 0);
} else { console.log('  (no bash on this machine — POSIX oracle not run)'); }

console.log('\n== cmd cannot expand or end the quoted text ==');
if (process.platform === 'win32') {
    const ascii = samples.map(t => flat(t).replace(/[^\x20-\x7e]/g, '').trim()).filter(Boolean);
    const lines = ['@echo off'].concat(ascii.map(t => 'echo ' + H.handoffCommand(t, 'cmd').slice('claude '.length) + SEP.replace(/[<>]/g, '^$&')));
    const r = runScript('cmd', lines.join('\r\n') + '\r\n', ['cmd.exe', '/d', '/c']);
    const got = String(r.stdout || '').split(/\r?\n/).filter(l => l.includes(SEP)).map(l => l.slice(0, l.indexOf(SEP)));
    const want = ascii.map(t => '"' + t.replace(/["%!]/g, ' ') + '"');
    ok(`cmd ran every sample (${got.length}/${ascii.length})`, got.length === ascii.length);
    const bad = want.findIndex((w, i) => got[i] !== w);
    ok('…and each one printed as quoted literal text' + (bad >= 0 ? ` — ${JSON.stringify(ascii[bad])} → ${JSON.stringify(got[bad])}` : ''), bad < 0);
} else { console.log('  (not Windows — cmd oracle not run)'); }

console.log('\n== the door uses it ==');
const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
const door = ext.slice(ext.indexOf('const handoffToAgent'), ext.indexOf('const handoffToAgent') + 1500);
ok('handoffToAgent types handoffCommand(…) for the terminal\'s own shell',
    /handoffCommand\(/.test(door) && /shellKindOf\(/.test(door) && !/replace\(\/"\/g/.test(door));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
