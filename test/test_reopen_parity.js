// S-109 — REOPEN PARITY: every door that reopens a session asks ONE answer.
//
// ‼️ WHY THIS FILE EXISTS. "A reopened session opens with what it closed
// with" was repaired door by door (S-45, S-102 …) and each repair left the
// door it had not listed open: the baton read only the launch manifest, the
// session page ran a bare `claude --resume`, Continue took the agent's last
// launch. `src/launch/reopenDoors.ts` lists the doors; this measures the
// source against that list, so a new door, a door that orders the layers by
// hand again, or a new launch dimension with no reopen answer fails the build.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`,
    JSON.stringify(got) === JSON.stringify(want));
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const D = require(path.join(ROOT, 'out', 'launch', 'reopenDoors.js'));
const DIMS = require(path.join(ROOT, 'media', 'afDimensions.js'));

function walk(dir, out) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { walk(p, out); } else if (e.name.endsWith('.ts')) { out.push(p); }
    }
    return out;
}
const SRC = {};
for (const f of walk(path.join(ROOT, 'src'), [])) {
    SRC[path.relative(ROOT, f).split(path.sep).join('/')] = fs.readFileSync(f, 'utf8');
}

/** [start, end) of the block an anchor opens: to the next op for a bridge op, else to the closing line at its indent. */
function blockOf(text, anchor) {
    const at = text.indexOf(anchor);
    if (at < 0 || text.indexOf(anchor, at + 1) >= 0) { return null; }
    if (anchor.startsWith("op: '")) {
        const next = text.indexOf("op: '", at + anchor.length);
        return [at, next < 0 ? text.length : next];
    }
    const lineStart = text.lastIndexOf('\n', at) + 1;
    const indent = text.slice(lineStart, at).match(/^\s*/)[0].length;
    const re = /\n( *)(\S)/g;
    re.lastIndex = at;
    let m;
    while ((m = re.exec(text))) {
        if (m[1].length <= indent && m[2] === '}') { return [at, m.index + 1 + m[0].length]; }
        if (m[1].length < indent) { return [at, m.index]; }
    }
    return [at, text.length];
}

/** Every resuming Console spawn: `<x>.start({ … resume … })`. */
function resumingSpawns(text) {
    const out = [];
    const re = /\b(?:consoleHost|host|this\.host)\.start\(\{/g;
    let m;
    while ((m = re.exec(text))) {
        const lineStart = text.lastIndexOf('\n', m.index) + 1;
        const indent = text.slice(lineStart, m.index).match(/^\s*/)[0];
        const close = text.indexOf('\n' + indent + '})', m.index);
        const body = text.slice(m.index, close < 0 ? m.index + 3000 : close);
        if (/\n\s*resume\s*[:,]|[{,]\s*resume\s*[:,}]/.test(body)) { out.push(m.index); }
    }
    return out;
}

/** The whole check, so it can be shown to fail on a mutated source. */
function violations(src) {
    const bad = [];
    const blocks = {};
    for (const d of D.REOPEN_DOORS) {
        const text = src[d.file];
        const b = text ? blockOf(text, d.anchor) : null;
        if (!b) { bad.push(`${d.id}: anchor not found exactly once in ${d.file}`); continue; }
        (blocks[d.file] = blocks[d.file] || []).push(b);
        const body = text.slice(b[0], b[1]);
        if (d.via === 'reopenFor') {
            if (!/reopenFor\(|reopenSetup\b|reopenLate\b/.test(body)) { bad.push(`${d.id}: does not ask the one reopen answer`); }
            if (/lastRunDimensions\(/.test(body)) { bad.push(`${d.id}: orders the layers itself (lastRunDimensions)`); }
            if (/sessionAccountOf\(/.test(body)) { bad.push(`${d.id}: reads the account around the resolver`); }
        }
        if (d.via === 'delegate' && !/executeCommand\('agentfarm\.(resumeSession|resumeInConsole)'/.test(body)) {
            bad.push(`${d.id}: delegates to no reopen door`);
        }
    }
    for (const n of D.NOT_REOPENS) {
        const b = src[n.file] ? blockOf(src[n.file], n.anchor) : null;
        if (!b) { bad.push(`not-a-reopen "${n.anchor}": anchor not found exactly once`); continue; }
        (blocks[n.file] = blocks[n.file] || []).push(b);
    }
    const inside = (file, i) => (blocks[file] || []).some(([a, z]) => i >= a && i < z);
    for (const [file, text] of Object.entries(src)) {
        for (const i of resumingSpawns(text)) {
            if (!inside(file, i)) {
                const line = text.slice(0, i).split('\n').length;
                bad.push(`${file}:${line}: a Console spawn resumes a session outside every registered door`);
            }
        }
    }
    return bad;
}

// ---------- the source as it stands ----------
{
    const bad = violations(SRC);
    for (const b of bad) { console.log('  ' + b); }
    eq('every reopen door is registered, found, and asks the one answer', bad.length, 0);
}

// ---------- the guard bites: an unregistered door fails ----------
{
    const mutated = { ...SRC };
    mutated['src/extension.ts'] = SRC['src/extension.ts']
        + '\nfunction sneaky() {\n    const id = consoleHost.start({\n        agentId: "", resume: "abc"\n    });\n}\n';
    ok('a new resuming spawn outside the register breaks the build',
        violations(mutated).some(v => /outside every registered door/.test(v)));
    const handOrdered = { ...SRC };
    handOrdered['src/core/tasks.ts'] = SRC['src/core/tasks.ts'].replace(
        'if (task.resumeSessionId && this.opts.reopenSetup) {',
        'if (task.resumeSessionId && this.opts.reopenSetup) { lastRunDimensions(x);');
    ok('a registered door that orders the layers by hand again breaks the build',
        violations(handOrdered).some(v => /orders the layers itself/.test(v)));
}

// ---------- the index's raw reading stays inside the resolver ----------
{
    const allowed = [
        ['src/core/sessions.ts', 'export function lastRunDimensions('],
        ['src/extension.ts', 'const reopenDeps: ReopenDeps = {'],
        ...D.NOT_REOPENS.map(n => [n.file, n.anchor])
    ];
    const stray = [];
    for (const [file, text] of Object.entries(SRC)) {
        const re = /lastRunDimensions\(/g;
        let m;
        while ((m = re.exec(text))) {
            const okHere = allowed.some(([f, a]) => {
                if (f !== file) { return false; }
                if (a.startsWith('export function')) { return text.indexOf(a) === m.index - 'export function '.length; }
                const b = blockOf(text, a);
                return !!b && m.index >= b[0] && m.index < b[1];
            });
            if (!okHere) { stray.push(`${file}:${text.slice(0, m.index).split('\n').length}`); }
        }
    }
    eq('lastRunDimensions is read only by the resolver (and the /context measurement)', stray, []);
}

// ---------- the baton leg runs on the closing answer ----------
{
    const ext = SRC['src/extension.ts'];
    const b = blockOf(ext, 'door: opener => {');
    ok('the baton door overlays what its predecessor closed with', !!b && /batonOnClosing\(opener/.test(ext.slice(b[0], b[1])));
    const callers = Object.entries(SRC).filter(([f, t]) => /\binheritFrom\(/.test(t.replace(/export function inheritFrom\(/, '')))
        .map(([f]) => f).sort();
    eq('inheritFrom builds the record only; the successor is launched through the door', callers, ['src/core/baton.ts', 'src/core/batonSeal.ts']);
}

// ---------- no bare CLI resume outside the engines' argv builders ----------
{
    const argv = ['src/core/launch.ts', 'src/core/consoleproto.ts', 'src/core/consoleEngine.ts',
        'src/core/gemini.ts', 'src/core/agy.ts', 'src/core/oneShot.ts'];
    const measured = (f, t) => D.NOT_REOPENS.some(n => {
        if (n.file !== f) { return false; }
        const b = blockOf(t, n.anchor);
        return !!b && !/['"]--resume['"]|`claude --resume \$\{/.test(t.slice(0, b[0]) + t.slice(b[1]));
    });
    const bare = Object.entries(SRC)
        .filter(([f, t]) => !argv.includes(f) && /['"]--resume['"]|`claude --resume \$\{/.test(t) && !measured(f, t))
        .map(([f]) => f);
    eq('only the engines\' argv builders write --resume', bare, []);
}

// ---------- every launch dimension says how it comes back ----------
{
    const ids = DIMS.ids().slice().sort();
    const declared = Object.keys(D.REOPEN_DIMENSIONS).sort();
    eq('every dimension in afDimensions.js has a reopen answer (and no stale one)', declared, ids);
    for (const d of ['model', 'effort', 'permissionMode', 'account']) {
        ok(`${d} comes back as it closed`, /^closing/.test(D.REOPEN_DIMENSIONS[d]));
    }
}

console.log(`test_reopen_parity: ${pass} passed, ${fail} failed`);
if (fail) { process.exit(1); }
