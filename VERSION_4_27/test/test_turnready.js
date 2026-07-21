// Smoke test: LiveMonitor fires onTurnReady exactly on transitions INTO waiting-input.
const Module = require('module');
const path = require('path');

// ---- fake vscode ----
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
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') { return fakeVscode; }
    return origLoad.apply(this, arguments);
};

const OUT = path.join(require('path').resolve(__dirname, '../out/core/live.js'));
const { LiveMonitor } = require(OUT);

let pass = 0, fail = 0;
function eq(name, got, want) {
    if (got === want) { pass++; }
    else { fail++; console.log(`  FAIL ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
}

const fires = [];
const cfg = {
    enabled: true, port: 0, stuckThresholdMs: 999999,
    notifyPermission: false, notifyStuck: false, notifyTurnEnd: false,
    onTurnReady: (s) => fires.push(s.agentName || s.sessionId)
};
const live = new LiveMonitor(() => cfg, (cwd) =>
    cwd === '/solo' ? { agentId: 'b1', agentName: 'solo' } : { agentId: 'a1', agentName: 'dev' });

const ev = (name, extra) => live.handle(Object.assign({ session_id: 'S1', cwd: '/x', hook_event_name: name }, extra));

// A full turn ending in Stop → one fire.
ev('SessionStart', { source: 'startup' });
ev('UserPromptSubmit', { prompt: 'hi' });
ev('PreToolUse', { tool_name: 'Read' });
ev('PostToolUse', { tool_name: 'Read' });
ev('Stop');
eq('stop fires once', fires.length, 1);
eq('fire carries agent name', fires[0], 'dev');

// A 'waiting' Notification while already waiting-input → no new fire.
ev('Notification', { message: 'agent is waiting for your input' });
eq('no double fire while already waiting', fires.length, 1);

// New turn: prompt → working, then Stop → second fire.
ev('UserPromptSubmit', { prompt: 'again' });
ev('Stop');
eq('new turn fires again', fires.length, 2);

// Permission notification must NOT count as YOUR TURN.
ev('UserPromptSubmit', { prompt: 'p' });
ev('Notification', { message: 'permission needed to run bash' });
eq('permission does not fire turn-ready', fires.length, 2);

// Fresh session reaching waiting-input via a 'waiting' Notification (no Stop) → fires.
const ev2 = (name, extra) => live.handle(Object.assign({ session_id: 'S2', cwd: '/y', hook_event_name: name }, extra));
ev2('SessionStart', {});
ev2('UserPromptSubmit', { prompt: 'q' });
ev2('Notification', { message: 'idle — waiting for input' });
eq('waiting notification fires', fires.length, 3);

// ---- multi-session of the same agent: labels + aggregate session count ----
// S1 and S2 both resolve to agent 'dev' → labelOf must disambiguate with #k
// (ordered by start time), and agentStatus must report how many are tracked.
const sess = live.sessions();
const s1 = sess.find(s => s.sessionId === 'S1');
const s2 = sess.find(s => s.sessionId === 'S2');
eq('labelOf adds #1 for the older session', live.labelOf(s1), 'dev #1');
eq('labelOf adds #2 for the newer session', live.labelOf(s2), 'dev #2');
eq('agentStatus counts sessions', live.agentStatus('a1').sessions, 2);

// An agent with a single session keeps its plain name (no #1 noise).
live.handle({ session_id: 'S3', cwd: '/solo', hook_event_name: 'SessionStart' });
const s3 = live.sessions().find(s => s.sessionId === 'S3');
eq('single session keeps plain label', live.labelOf(s3), 'solo');
eq('solo agentStatus counts one', live.agentStatus('b1').sessions, 1);

console.log(`\n${pass} passed, ${fail} failed`);
Module._load = origLoad;
process.exit(fail ? 1 : 0);
