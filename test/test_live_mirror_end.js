// X-300 — A CARD REMOVED WHILE IT WAS LIVE CLOSES ITS OWN LANE.
//
// The Console mirror says SessionEnd when the seat's status turns `ended`. But
// "End & Remove Session" (`forget`, and `console.close forget=true`) on a RUNNING
// card closes it silently and fires once with the seat already gone — S-29's one
// gesture, one repaint — so the status pass never ran and the lane stayed open on
// the Live Timeline for ever. Measured 2026-09-13 on a Codex lane, the engine
// whose wire declares no SessionEnd, so the mirror was the only thing that could
// ever have closed it.
//
// Pinned here: (1) the host contract the defect lives in — forget on a live seat
// fires exactly once and there is nothing to read by then; (2) the mirror keeps
// enough of the lane to close it from memory; (3) the monitor honours that end.
const Module = require('module');
const path = require('path');
const fs = require('fs');
const cp = require('child_process');
const { EventEmitter } = require('events');

class Emitter {
    constructor() { this.handlers = []; }
    get event() { return (fn) => { this.handlers.push(fn); return { dispose() { } }; }; }
    fire(v) { for (const h of this.handlers) h(v); }
    dispose() { }
}
const fakeVscode = {
    EventEmitter: Emitter,
    window: {
        showInformationMessage: () => Promise.resolve(undefined),
        showWarningMessage: () => Promise.resolve(undefined)
    },
    commands: { executeCommand: () => Promise.resolve(undefined) }
};
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') { return fakeVscode; }
    return origLoad.apply(this, arguments);
};

// The host must never reach a real process here.
function fakeChild() {
    const child = new EventEmitter();
    const pipe = () => { const s = new EventEmitter(); s.setEncoding = () => { }; s.destroy = () => { }; return s; };
    child.stdout = pipe(); child.stderr = pipe();
    child.stdin = { write: () => true, end: () => { } };
    child.pid = 4321; child.kill = () => { };
    return child;
}
cp.spawn = () => fakeChild();
cp.exec = (_c, cb) => { if (typeof cb === 'function') { cb(null, '', ''); } };
cp.execSync = () => '';
cp.execFile = (_c, _a, _o, cb) => {
    const done = typeof _o === 'function' ? _o : cb;
    if (typeof done === 'function') { done(null, '', ''); }
    return new EventEmitter();
};

const { ConsoleHost } = require(path.resolve(__dirname, '../out/core/consolehost.js'));
const { LiveMonitor, mirrorOwns } = require(path.resolve(__dirname, '../out/core/live.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// ---------- (1) the host contract: forget on a live seat fires once, seat gone ----------
{
    const host = new ConsoleHost(() => 'codex');
    const id = host.start({
        agentId: 'dev', agentName: 'developer', cwd: process.cwd(),
        engine: 'codex', permissionMode: 'default', resume: '01a09b7b-live'
    });
    ok('the seat is live and named before it is removed',
        host.get(id) !== undefined && host.get(id).sessionId === '01a09b7b-live'
        && host.get(id).status !== 'ended');
    const seenAtFire = [];
    host.onChange(cid => { seenAtFire.push({ cid, state: host.get(cid) }); });
    host.forget(id);
    ok('‼️ forget on a LIVE seat fires exactly once (S-29) …',
        seenAtFire.length === 1 && seenAtFire[0].cid === id);
    ok('‼️ … and by then there is NO state to read — so a status-driven SessionEnd '
        + 'can never fire for this gesture; that is the defect',
        seenAtFire[0].state === undefined);
}

// ---------- (2) the mirror closes the lane from what it remembered ----------
{
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    const at = src.indexOf('const mirrorConsoleToLive = (id: string): void => {');
    ok('the mirror is where it was', at > 0);
    const body = src.slice(at, at + 4000);
    ok('‼️ a lane remembers what its payloads are stamped with',
        /base: \{ session_id: string; cwd\?: string; engine: string \}/.test(src.slice(at - 1500, at)));
    ok('‼️ a seat that is gone is looked up in the lane table, not returned from',
        /if \(!s\) \{[\s\S]{0,900}const gone = liveMirror\.get\(id\);[\s\S]{0,200}liveMirror\.delete\(id\);/.test(body));
    ok('‼️ … and the lane says SessionEnd from its own memory of the seat',
        /say\(\{ \.\.\.gone\.base, hook_event_name: 'SessionEnd', reason: 'session closed' \}\)/.test(body));
    ok('an open tool span is closed before the lane ends, as on every other ending',
        /if \(gone\.openTool\) \{ say\(\{ \.\.\.gone\.base, hook_event_name: 'PostToolUse', tool_name: gone\.openTool \}\); \}/.test(body));
    ok('the closing still yields to a wire that reports SessionEnd itself (X-297)',
        /const heard = learnWireHeard\(gone\.base\.engine,\s*live\.realHookKinds\(gone\.base\.session_id\)\.filter\(k => gone\.wire\.has\(k\)\)\)/.test(body)
        && /if \(mirrorOwns\(p\.hook_event_name, heard\)\) \{ live\.handle\(p\); \}/.test(body));
    ok('and a lane that never opened has nothing to close — no invented end',
        /const gone = liveMirror\.get\(id\);\s*if \(!gone\) \{ return; \}/.test(body));

    // The transcript sweep (X-271) sat behind the same early return.
    const sweep = src.slice(src.indexOf('const sweptAfterEnd = new Set<string>();'),
        src.indexOf('const sweptAfterEnd = new Set<string>();') + 1200);
    ok('‼️ the after-end transcript sweep treats a vanished seat as ended too',
        /if \(s && s\.status !== 'ended' && s\.status !== 'error'\) \{ return; \}/.test(sweep)
        && !/if \(!s \|\| \(s\.status/.test(sweep));
}

// ---------- (3) the monitor honours a mirrored end on a Codex lane ----------
{
    const cfg = { enabled: true, port: 0, stuckThresholdMs: 999999, notifyPermission: false, notifyStuck: false, notifyTurnEnd: false };
    const live = new LiveMonitor(() => cfg, () => ({ agentId: 'a1', agentName: 'dev' }));
    const base = { session_id: 'CX-1', cwd: '/x', engine: 'codex' };
    live.handle({ ...base, hook_event_name: 'SessionStart', source: 'startup' });
    live.handle({ ...base, hook_event_name: 'UserPromptSubmit', prompt: 'go' });
    // The seven Codex hooks measured on this machine: no SessionEnd among them.
    const codexWire = ['PreToolUse', 'PostToolUse', 'PreCompact', 'SessionStart', 'UserPromptSubmit', 'SubagentStop', 'Stop'];
    ok('SessionEnd is the mirror\'s to say on a Codex lane', mirrorOwns('SessionEnd', codexWire) === true);
    const before = live.sessions().find(s => s.sessionId === 'CX-1');
    ok('the lane is open', !!before && before.status !== 'ended');
    live.handle({ ...base, hook_event_name: 'SessionEnd', reason: 'session closed' });
    const after = live.sessions().find(s => s.sessionId === 'CX-1');
    ok('‼️ a mirrored SessionEnd closes the lane', !!after && after.status === 'ended');
}

Module._load = origLoad;
console.log(`test_live_mirror_end: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
