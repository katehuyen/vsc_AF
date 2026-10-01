// X-453 — A PHONE IS LET THROUGH WINDOWS FIREWALL BY ONE CLICK, never by a
// network setting: the verdict (core/firewallVerdict), the PowerShell that reads
// the facts and adds the one rule behind Windows' admin prompt (core/firewallWin).
'use strict';
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const OUT = path.join(__dirname, '..', 'out', 'core');
const V = require(path.join(OUT, 'firewallVerdict.js'));
const W = require(path.join(OUT, 'firewallWin.js'));

const facts = o => Object.assign({ active: ['Private'], enabled: ['Domain', 'Private', 'Public'], shields: [], allow: [], block: [], ourPorts: [], ourProfiles: [] }, o || {});
const v = (o, port) => V.firewallVerdict(facts(o), port || 7443);

// ---------- a rule's profile ----------
ok('Any covers every profile', ['Domain', 'Private', 'Public'].every(p => V.coversProfile('Any', p)));
ok('a comma list covers what it names, nothing else', V.coversProfile('Private, Public', 'Public') && !V.coversProfile('Private, Public', 'Domain'));
ok('PowerShell\'s single item (a bare string) reads as a list', JSON.stringify(V.readFacts({ active: 'Public', allow: 'Private' }).active) === '["Public"]'
    && V.readFacts({}).block.length === 0 && V.readFacts(null) === undefined);

// ---------- the verdict ----------
const first = v({ active: ['Public'], allow: ['Private', 'Private'] });
ok('the first live case: a Public network, VS Code allowed on Private only = closed, one click fixes it',
    first.state === 'closed' && first.cause === 'no-rule' && first.canFix && JSON.stringify(first.closed) === '["Public"]'
    && /public network/.test(first.text) && /7443/.test(first.text) && /No network setting changes/.test(first.text));
ok('the same machine on a Private network is open', v({ allow: ['Private'] }).state === 'open');
ok('nothing allows VS Code at all: closed', v({}).state === 'closed' && v({}).cause === 'no-rule');
ok('our own rule on our port lets it in on any profile', v({ active: ['Public'], ourPorts: ['7443'], ourProfiles: ['Any'] }).state === 'open');
ok('our rule for another port does not', v({ active: ['Public'], ourPorts: ['8443'], ourProfiles: ['Any'] }, 7443).state === 'closed');
ok('a port list naming ours counts', v({ ourPorts: ['80, 7443'], ourProfiles: ['Private'] }).state === 'open');
const blk = v({ active: ['Public'], ourPorts: ['7443'], ourProfiles: ['Any'], block: ['Public'] });
ok('a block rule on VS Code wins over every allow (Windows\' own precedence)', blk.state === 'closed' && blk.cause === 'blocked-by-rule' && blk.canFix
    && /blocks VS Code/.test(blk.text));
const sh = v({ active: ['Public'], shields: ['Public'], allow: ['Any'] });
ok('"block all incoming" cannot be fixed by a rule: no button, says where to untick', sh.state === 'closed' && sh.cause === 'shields' && !sh.canFix
    && /Block all incoming/.test(sh.text));
ok('a profile whose firewall is off lets it in', v({ active: ['Public'], enabled: ['Domain', 'Private'] }).state === 'open');
const two = v({ active: ['Private', 'Public'], allow: ['Private'] });
ok('two networks: only the closed one is named', JSON.stringify(two.closed) === '["Public"]');
ok('no network: unknown, no button', v({ active: [] }).state === 'unknown' && !v({ active: [] }).canFix);
ok('facts that could not be read: unknown', V.firewallVerdict(undefined, 7443).state === 'unknown');

// ---------- the PowerShell ----------
const EXE = "C:\\Program Files\\Bob's Code\\Code.exe";
const fs1 = W.factsScript(EXE);
ok('facts script: a quote in the path is doubled, never breaks the string', fs1.includes("'C:\\Program Files\\Bob''s Code\\Code.exe'"));
ok('facts script reads the effective (ActiveStore) rules and writes one JSON line', /Get-NetFirewallProfile -PolicyStore ActiveStore/.test(fs1)
    && /Get-NetFirewallApplicationFilter -PolicyStore ActiveStore/.test(fs1) && /ConvertTo-Json -Compress\n$/.test(fs1));
ok('facts script changes nothing', !/New-NetFirewallRule|Remove-NetFirewallRule|Disable-NetFirewallRule|Set-Net/.test(fs1));
const al = W.allowScript(EXE, 7443);
ok('the rule: this program, this port, TCP, inbound allow', /-Direction Inbound -Action Allow -Protocol TCP -LocalPort 7443 -Program 'C:\\Program Files\\Bob''s Code\\Code.exe'/.test(al));
ok('the rule only lets in the local subnet and the tailnet', /-RemoteAddress 'LocalSubnet','100\.64\.0\.0\/10'/.test(al));
ok('the rule replaces our old one by its Name, never stacks', al.indexOf("Remove-NetFirewallRule -Name 'AgentFarmPhoneLink'") < al.indexOf('New-NetFirewallRule -Name'));
ok('only BLOCK rules on this program are switched off, in the editable store', /\$prog \| Where-Object \{ \$_\.Action -eq 'Block' \} \| Disable-NetFirewallRule/.test(al)
    && !/Disable[\s\S]*ActiveStore/.test(al.slice(al.indexOf('$want'))));
ok('no network profile is touched', !/Set-NetConnectionProfile|NetworkCategory/.test(al));
let threw = false;
try { W.allowScript(EXE, 0); } catch { threw = true; }
ok('a port that is not a port is refused before anything runs', threw);
const el = W.elevateScript('exit 0');
ok('elevation is Windows\' own prompt and waits for its exit code', /-Verb RunAs -WindowStyle Hidden -Wait -PassThru/.test(el) && /exit \$p\.ExitCode/.test(el));
ok('a No to the prompt is told apart (1223)', /NativeErrorCode -eq 1223\) \{ exit 1223 \}/.test(el));
ok('-EncodedCommand is UTF-16LE base64', Buffer.from(W.encode('Write-Output ş'), 'base64').toString('utf16le') === 'Write-Output ş');

// ---------- the guard, over a stand-in PowerShell ----------
(async () => {
    const ran = [];
    let factsOut = facts({ active: ['Public'], allow: ['Private'] });
    let allowCode = 0;
    const run = async (script) => {
        ran.push(script.includes('-Verb RunAs') ? 'elevate' : 'facts');
        if (script.includes('-Verb RunAs')) { if (allowCode === 0) { factsOut = facts({ active: ['Public'], ourPorts: ['7443'], ourProfiles: ['Any'] }); } return { code: allowCode, stdout: '', stderr: allowCode === 2 ? 'Access is denied.' : '' }; }
        return { code: 0, stdout: JSON.stringify(factsOut) + '\r\n', stderr: '' };
    };
    const off = W.firewallGuard({ exe: 'x', port: () => 7443, platform: 'linux', run });
    ok('off Windows nothing runs and there is no verdict', (await off.check()) === undefined && off.verdict() === undefined && ran.length === 0);

    const g = W.firewallGuard({ exe: 'x', port: () => 7443, platform: 'win32', run });
    ok('no verdict before the first check', g.verdict() === undefined);
    const c = await g.check();
    ok('check reads the facts and keeps the verdict', c.state === 'closed' && g.verdict() === c && ran.pop() === 'facts');

    allowCode = 1223;
    let r = await g.allow();
    ok('a No: not ok, cancelled, the verdict re-read and still closed', !r.ok && r.cancelled && r.verdict.state === 'closed'
        && ran.join() === 'elevate,facts');
    ran.length = 0;
    allowCode = 2;
    r = await g.allow();
    ok('a failure carries Windows\' words and the exit code', !r.ok && !r.cancelled && /Access is denied\. \(exit 2\)/.test(r.error));
    allowCode = 0;
    r = await g.allow();
    ok('a Yes: the rule is in, the verdict re-read says open', r.ok && r.verdict.state === 'open' && g.verdict().state === 'open');

    factsOut = facts({ active: ['Public'], block: ['Any'] });
    const stuck = W.firewallGuard({ exe: 'x', port: () => 7443, platform: 'win32',
        run: async s => s.includes('-Verb RunAs') ? { code: 0, stdout: '', stderr: '' } : { code: 0, stdout: JSON.stringify(factsOut), stderr: '' } });
    r = await stuck.allow();
    ok('a rule that went in but did not open it is not called a success', !r.ok && /still stops a phone/.test(r.error));

    const broken = W.firewallGuard({ exe: 'x', port: () => 7443, platform: 'win32', run: async () => ({ code: 1, stdout: 'garbage', stderr: 'boom' }) });
    ok('facts that cannot be read are unknown, never open', (await broken.check()).state === 'unknown');

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL threw ' + (e && e.stack)); process.exit(1); });
