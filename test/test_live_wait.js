// U-148 — a turn that ended with a background command still running behind it
// is NOT the user's turn: the CLI wakes the session by itself when the command
// finishes. The live monitor calls that state `waiting-task`, asks the host
// (`backgroundOf`) exactly as it asks `pendingAskOf`, and never rings for it.
const Module = require('module');
const path = require('path');

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

const { LiveMonitor } = require(path.resolve(__dirname, '../out/core/live.js'));
const { settleWait } = require(path.resolve(__dirname, '../out/core/liveWait.js'));

let pass = 0, fail = 0;
function eq(name, got, want) {
    const g = JSON.stringify(got), w = JSON.stringify(want);
    if (g === w) { pass++; }
    else { fail++; console.log(`  FAIL ${name}: got ${g} want ${w}`); }
}

// ------------------------------------------------------------ the pure rule
eq('no host → untouched', settleWait('waiting-input', undefined, false), 'waiting-input');
eq('host, nothing behind → untouched', settleWait('waiting-input', { tasks: 0, working: false }, false), 'waiting-input');
eq('work behind a finished turn → waiting-task', settleWait('waiting-input', { tasks: 2, working: false }, false), 'waiting-task');
eq('at the Stop edge the host may still say working — still waiting-task',
    settleWait('waiting-input', { tasks: 1, working: true }, false), 'waiting-task');
eq('a parked question wins — it IS your turn', settleWait('waiting-input', { tasks: 1, working: false }, true), 'waiting-input');
eq('drained and idle → your turn', settleWait('waiting-task', { tasks: 0, working: false }, false), 'waiting-input');
eq('drained while the CLI runs its own turn → stays waiting-task (no false "your turn" flash)',
    settleWait('waiting-task', { tasks: 0, working: true }, false), 'waiting-task');
eq('host gone → your turn', settleWait('waiting-task', undefined, false), 'waiting-input');
eq('a question arriving on a waiting-task session → your turn', settleWait('waiting-task', { tasks: 1, working: false }, true), 'waiting-input');
for (const st of ['working', 'tool', 'waiting-permission', 'stalled', 'idle', 'ended']) {
    eq(`${st} is never touched`, settleWait(st, { tasks: 3, working: false }, false), st);
}

// ------------------------------------------------------------ in the monitor
function rig() {
    const seen = [];
    const hosted = new Map();   // sessionId → { tasks, working }
    const asks = new Set();
    let updates = 0;
    const cfg = {
        enabled: true, port: 0, stuckThresholdMs: 999999,
        notifyPermission: false, notifyStuck: false, notifyTurnEnd: false,
        onAttention: (s, event) => seen.push(`${s.sessionId}:${event}`),
        pendingAskOf: (id) => asks.has(id),
        backgroundOf: (id) => hosted.get(id)
    };
    const live = new LiveMonitor(() => cfg, () => ({ agentId: 'a1', agentName: 'dev' }));
    live.onDidUpdate(() => updates++);
    const ev = (id, name, extra) => live.handle(
        Object.assign({ session_id: id, cwd: '/x', hook_event_name: name }, extra));
    const st = (id) => (live.sessions().find(s => s.sessionId === id) || {}).status;
    return { live, seen, hosted, asks, ev, st, updates: () => updates };
}

{
    const r = rig();
    r.ev('S1', 'SessionStart', {});
    r.ev('S1', 'UserPromptSubmit', { prompt: 'run the suite in the background' });
    r.hosted.set('S1', { tasks: 1, working: true });   // the turn started a command
    r.ev('S1', 'Stop');
    eq('a turn that ended with a command behind it is waiting-task', r.st('S1'), 'waiting-task');
    eq('‼️ and it does NOT ring "your turn"', r.seen, []);

    r.ev('S1', 'Notification', { message: 'Claude is waiting for your input' });
    eq('the idle Notification does not turn it yellow', r.st('S1'), 'waiting-task');
    eq('nor ring', r.seen, []);

    // the command finishes; the CLI opens its own turn to hand the result over
    r.hosted.set('S1', { tasks: 0, working: true });
    r.live.settleWaits();
    eq('drained while the CLI runs its own turn → still not your turn', r.st('S1'), 'waiting-task');
    r.ev('S1', 'PreToolUse', { tool_name: 'Read' });
    eq('the woken turn is a tool call', r.st('S1'), 'tool');
    r.hosted.set('S1', { tasks: 0, working: false });
    r.ev('S1', 'Stop');
    eq('the turn that really ends is your turn', r.st('S1'), 'waiting-input');
    eq('and THAT one rings', r.seen, ['S1:turn-ready']);
}

{
    // the user stops the background command with ✕ — no new turn follows
    const r = rig();
    r.ev('S2', 'SessionStart', {});
    r.ev('S2', 'UserPromptSubmit', { prompt: 'watch the log' });
    r.hosted.set('S2', { tasks: 1, working: true });
    r.ev('S2', 'Stop');
    eq('S2 waits on its command', r.st('S2'), 'waiting-task');
    const before = r.updates();
    r.hosted.set('S2', { tasks: 0, working: false });
    eq('the host poke reports a change', r.live.settleWaits(), true);
    eq('drained and idle → your turn', r.st('S2'), 'waiting-input');
    eq('the poke refreshes the views', r.updates() > before, true);
    eq('a settle on a READ never rings (the user did it themselves)', r.seen, []);
    eq('a second poke changes nothing', r.live.settleWaits(), false);
}

{
    // a question parked on a turn that also left a command running
    const r = rig();
    r.ev('S3', 'SessionStart', {});
    r.ev('S3', 'UserPromptSubmit', { prompt: 'x' });
    r.hosted.set('S3', { tasks: 1, working: true });
    r.asks.add('S3');
    r.ev('S3', 'Stop');
    eq('a parked question is your turn even with work behind it', r.st('S3'), 'waiting-input');
    eq('and it rings as a question', r.seen, ['S3:question']);
}

{
    // a terminal session: no host knows it — the old behaviour, exactly
    const r = rig();
    r.ev('T1', 'SessionStart', {});
    r.ev('T1', 'UserPromptSubmit', { prompt: 'x' });
    r.ev('T1', 'Stop');
    eq('no host → waiting-input as always', r.st('T1'), 'waiting-input');
    eq('and it rings as always', r.seen, ['T1:turn-ready']);
}

{
    // a host whose answer throws is "nothing behind it", never a broken timeline
    const seen = [];
    const cfg = {
        enabled: true, port: 0, stuckThresholdMs: 999999,
        notifyPermission: false, notifyStuck: false, notifyTurnEnd: false,
        onAttention: (s, event) => seen.push(event),
        backgroundOf: () => { throw new Error('host gone'); }
    };
    const live = new LiveMonitor(() => cfg, () => ({}));
    live.handle({ session_id: 'E1', cwd: '/x', hook_event_name: 'UserPromptSubmit', prompt: 'x' });
    live.handle({ session_id: 'E1', cwd: '/x', hook_event_name: 'Stop' });
    eq('a throwing host leaves the old answer', live.sessions()[0].status, 'waiting-input');
    eq('a throwing host still rings', seen, ['turn-ready']);
}

{
    // the per-agent roll-up ranks it between working and your turn
    const r = rig();
    r.ev('A', 'SessionStart', {});
    r.ev('A', 'UserPromptSubmit', { prompt: 'x' });
    r.hosted.set('A', { tasks: 1, working: false });
    r.ev('A', 'Stop');
    eq('agentStatus says waiting-task', (r.live.agentStatus('a1') || {}).status, 'waiting-task');
}

console.log(`test_live_wait.js: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
