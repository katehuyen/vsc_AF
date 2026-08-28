// A-18 step 2 — the edges that WANT THE USER, and which kind of wanting.
//
// The farm could only say "your turn". This checks the thing that replaces it:
// one emit per CROSSING, the event that names what happened, and the two
// endings that wear the same `waiting-input` status told apart by whether the
// turn is parked on a question.
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
Module._load = function (request) {
    if (request === 'vscode') { return fakeVscode; }
    return origLoad.apply(this, arguments);
};

const { LiveMonitor } = require(path.resolve(__dirname, '../out/core/live.js'));

let pass = 0, fail = 0;
function eq(name, got, want) {
    const g = JSON.stringify(got), w = JSON.stringify(want);
    if (g === w) { pass++; }
    else { fail++; console.log(`  FAIL ${name}: got ${g} want ${w}`); }
}

/** One monitor, one recorder. `asks` is the set of session ids the host says
 *  are parked on a question — exactly what `pendingAskOf` answers for. */
function rig(over = {}) {
    const seen = [];
    const turns = [];
    const asks = new Set();
    const cfg = Object.assign({
        enabled: true, port: 0, stuckThresholdMs: 999999,
        notifyPermission: false, notifyStuck: false, notifyTurnEnd: false,
        onAttention: (s, event) => seen.push(`${s.sessionId}:${event}`),
        onTurnReady: (s) => turns.push(s.sessionId),
        pendingAskOf: (id) => asks.has(id)
    }, over);
    const live = new LiveMonitor(() => cfg, () => ({ agentId: 'a1', agentName: 'dev' }));
    const ev = (id, name, extra) => live.handle(
        Object.assign({ session_id: id, cwd: '/x', hook_event_name: name }, extra));
    return { live, cfg, seen, turns, asks, ev };
}

// ---------------------------------------------------------------- turn-ready
{
    const { seen, turns, ev } = rig();
    ev('S1', 'SessionStart', {});
    ev('S1', 'UserPromptSubmit', { prompt: 'hi' });
    ev('S1', 'Stop');
    eq('a finished turn is turn-ready', seen, ['S1:turn-ready']);
    // ‼️ ONE EMIT SITE FEEDS BOTH CALLBACKS — the narrow view cannot disagree
    // with the wide one about whether an edge happened.
    eq('onTurnReady rides the same edge', turns, ['S1']);

    // The "waiting" Notification behind the Stop is the SAME crossing.
    ev('S1', 'Notification', { message: 'agent is waiting for your input' });
    eq('parked in the state does not re-emit', seen.length, 1);

    // A genuinely new turn is a new crossing.
    ev('S1', 'UserPromptSubmit', { prompt: 'again' });
    ev('S1', 'Stop');
    eq('a new turn emits again', seen, ['S1:turn-ready', 'S1:turn-ready']);
}

// ------------------------------------------------------------------ question
{
    const { seen, turns, ev } = rig();
    ev('S1', 'SessionStart', {});
    ev('S1', 'UserPromptSubmit', { prompt: 'hi' });
    ev('S1', 'Notification', { message: 'permission needed to run bash' });
    eq('a permission ask is a question', seen, ['S1:question']);
    // ‼️ AND IT IS NOT "YOUR TURN". The old callback's whole contract was the
    // turn ending; a tool waiting to run has not ended anything.
    eq('a question does not fire onTurnReady', turns, []);

    ev('S1', 'Notification', { message: 'still needs permission' });
    eq('parked on the ask does not re-emit', seen.length, 1);

    // ‼️ A SECOND ASK IN THE SAME TURN IS A SECOND CROSSING. The user who
    // answered the first one and walked away must be told about this one.
    ev('S1', 'PreToolUse', { tool_name: 'Bash' });
    ev('S1', 'Notification', { message: 'permission needed to run rm' });
    eq('a second ask emits again', seen, ['S1:question', 'S1:question']);
}

// -------------------------------- the two endings that share `waiting-input`
{
    const { seen, turns, asks, ev } = rig();
    ev('S1', 'SessionStart', {});
    ev('S1', 'UserPromptSubmit', { prompt: 'hi' });
    asks.add('S1');                       // the turn is parked on an AskUserQuestion
    ev('S1', 'Stop');
    eq('waiting-input with a parked ask is a question', seen, ['S1:question']);
    eq('…and not the turn ending', turns, []);

    // ‼️ THE AGENT SPEAKING UNPARKS THE LANE. Without this the turn's real
    // ending is no crossing at all and rings nothing.
    asks.delete('S1');
    ev('S1', 'AssistantMessage', { message: 'here is what I found' });
    ev('S1', 'Stop');
    eq('the real ending after an answer is turn-ready', seen, ['S1:question', 'S1:turn-ready']);
    eq('onTurnReady rides that one', turns, ['S1']);
}

// --------------------------------------------------------------------- ended
{
    const { seen, ev } = rig();
    ev('S1', 'SessionStart', {});
    ev('S1', 'UserPromptSubmit', { prompt: 'hi' });
    ev('S1', 'SessionEnd', { reason: 'closed' });
    eq('a closed session is ended', seen, ['S1:ended']);
}

// ------------------------------------------------------------------- stalled
{
    // A threshold below zero makes "any elapsed time at all" stalled, so the
    // sweep can be driven in one tick without a sleep deciding the result.
    const { live, cfg, seen, ev } = rig({ stuckThresholdMs: -1 });
    ev('S1', 'SessionStart', {});
    ev('S1', 'UserPromptSubmit', { prompt: 'hi' });
    eq('working session has emitted nothing yet', seen, []);
    live.checkStuck();
    eq('crossing into stalled emits once', seen, ['S1:stalled']);
    // ‼️ THE STATUS IS REWRITTEN ON EVERY SWEEP while it stays stuck, so the
    // edge is the "already told you" flag and not the assignment.
    live.checkStuck();
    eq('staying stalled does not re-emit', seen, ['S1:stalled']);
    eq('cfg untouched', cfg.stuckThresholdMs, -1);
}

// ------------------------------- a host that throws must not break the farm
{
    const { seen, ev } = rig({
        onAttention: (s, event) => { seen.push(`${s.sessionId}:${event}`); throw new Error('boom'); },
        pendingAskOf: () => { throw new Error('the console is gone'); }
    });
    ev('S1', 'SessionStart', {});
    ev('S1', 'UserPromptSubmit', { prompt: 'hi' });
    ev('S1', 'Stop');
    // A host that cannot answer "is it parked?" is not a parked turn, and a
    // subscriber that throws does not stop the next event being handled.
    eq('a throwing pendingAskOf reads as a finished turn', seen, ['S1:turn-ready']);
    ev('S1', 'UserPromptSubmit', { prompt: 'again' });
    ev('S1', 'Stop');
    eq('a throwing subscriber does not wedge the monitor', seen.length, 2);
}

// ------------------------ nothing wired: the monitor is silent, not broken
{
    const { live, ev } = rig({ onAttention: undefined, onTurnReady: undefined, pendingAskOf: undefined });
    ev('S1', 'SessionStart', {});
    ev('S1', 'UserPromptSubmit', { prompt: 'hi' });
    ev('S1', 'Stop');
    eq('an unwired monitor still tracks the session', live.sessions().length, 1);
    eq('…and still reaches waiting-input', live.sessions()[0].status, 'waiting-input');
}

console.log(`\n${pass} passed, ${fail} failed`);
Module._load = origLoad;
process.exit(fail ? 1 : 0);
