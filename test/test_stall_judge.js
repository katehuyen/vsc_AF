// X-452 — a silent session is not stalled while it waits on its own work: a
// wait the Console already draws purple, or a call the CLI times out by itself
// that is still inside its own limit. Everything else past the threshold is a
// stall exactly as before, and a usage-limit wall is named as one.
'use strict';
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
    window: { showInformationMessage: () => Promise.resolve(undefined), showWarningMessage: () => Promise.resolve(undefined) },
    commands: { executeCommand: () => Promise.resolve(undefined) }
};
const origLoad = Module._load;
Module._load = function (request) { return request === 'vscode' ? fakeVscode : origLoad.apply(this, arguments); };

const J = require(path.resolve(__dirname, '../out/core/stallJudge.js'));
const { LiveMonitor } = require(path.resolve(__dirname, '../out/core/live.js'));

let pass = 0, fail = 0;
const eq = (name, got, want) => {
    const g = JSON.stringify(got), w = JSON.stringify(want);
    if (g === w) { pass++; } else { fail++; console.log(`  FAIL ${name}: got ${g} want ${w}`); }
};
const MIN = 60000;
const T = 4 * MIN;

// ---- the call's own limit ----
eq('a shell call with no timeout has the CLI default', J.callLimitOf('Bash', { command: 'npm test' }), { wait: false, limitMs: 120000 });
eq('…its own timeout when it states one', J.callLimitOf('PowerShell', { command: 'x', timeout: 600000 }), { wait: false, limitMs: 600000 });
eq('a sleep loop is a wait', J.callLimitOf('Bash', { command: 'until test -f x; do sleep 2; done' }).wait, true);
eq('a background start is not a wait', J.callLimitOf('Bash', { command: 'sleep 30', run_in_background: true }).wait, false);
eq('TaskOutput waits, up to its ceiling', J.callLimitOf('TaskOutput', { task_id: 'b1' }), { wait: true, limitMs: 600000 });
eq('a tool the CLI does not time out has no limit', J.callLimitOf('Edit', { file_path: 'a' }), undefined);
eq('no name, no limit', J.callLimitOf(undefined, {}), undefined);

// ---- ‼️ the regression table: with nothing to excuse it, the verdict is the old rule exactly ----
{
    let same = 0, all = 0;
    for (const status of ['working', 'tool', 'waiting-input', 'waiting-task', 'idle', 'stalled']) {
        for (const silentMs of [0, T - 1, T, T + 1, 30 * MIN]) {
            for (const threshold of [0, -1, NaN, T]) {
                all++;
                const old = (status === 'working' || status === 'tool') && threshold > 0 && silentMs > threshold;
                if (J.stallVerdict({ status, silentMs }, threshold).stalled === old) { same++; }
            }
        }
    }
    eq('no call, no host, nothing said: the old rule on every combination', same, all);
}

// ---- what excuses a silence ----
eq('‼️ the Console says the turn is blocked in a wait (the purple card): not stalled, however long',
    J.stallVerdict({ status: 'tool', silentMs: 60 * MIN, hostWaiting: true }, T), { stalled: false, why: 'waiting on its own work' });
eq('…on a working turn too', J.stallVerdict({ status: 'working', silentMs: 60 * MIN, hostWaiting: true }, T).stalled, false);
eq('a test suite under a 10 min timeout, 8 min in: not stalled',
    J.stallVerdict({ status: 'tool', silentMs: 8 * MIN, call: { wait: false, limitMs: 10 * MIN } }, T),
    { stalled: false, why: 'its command is still inside its own 10 min limit' });
eq('…still not at its limit plus the grace',
    J.stallVerdict({ status: 'tool', silentMs: 11 * MIN, call: { wait: false, limitMs: 10 * MIN } }, T).stalled, false);
eq('…stalled once the CLI should long have ended it',
    J.stallVerdict({ status: 'tool', silentMs: 11 * MIN + 1, call: { wait: false, limitMs: 10 * MIN } }, T), { stalled: true, why: '' });
eq('a wait loop inside its limit says it is waiting',
    J.stallVerdict({ status: 'tool', silentMs: 150000, call: { wait: true, limitMs: 120000 } }, 1).why, 'waiting on its own work');
eq('a call limit means nothing once the call has answered (working)',
    J.stallVerdict({ status: 'working', silentMs: 8 * MIN, call: { wait: false, limitMs: 10 * MIN } }, T).stalled, true);
eq('a tool with no limit of its own is judged by the threshold',
    J.stallVerdict({ status: 'tool', silentMs: 5 * MIN }, T).stalled, true);
eq('‼️ a usage-limit wall is still flagged, and named as what it is',
    J.stallVerdict({ status: 'working', silentMs: 10 * MIN, lastSaid: "You've hit your session limit · resets 8pm (Asia/Bangkok)" }, T),
    { stalled: true, why: 'hit its usage limit' });
eq('…an ordinary last line is not a wall',
    J.stallVerdict({ status: 'working', silentMs: 10 * MIN, lastSaid: 'Running the suite now.' }, T), { stalled: true, why: '' });

// ---- the monitor wired to it ----
function rig(over = {}) {
    const seen = [], said = [];
    const cfg = Object.assign({
        enabled: true, port: 0, stuckThresholdMs: 1,
        notifyPermission: false, notifyStuck: false, notifyTurnEnd: false,
        onAttention: (s, event) => seen.push(`${s.sessionId}:${event}`),
        forward: (kind, text) => said.push(`${kind}:${text}`)
    }, over);
    const live = new LiveMonitor(() => cfg, () => ({ agentId: 'a1', agentName: 'dev' }));
    const ev = (id, name, extra) => live.handle(Object.assign({ session_id: id, cwd: '/x', hook_event_name: name }, extra));
    const age = (id, ms) => { live.sessionsMap.get(id).lastEventTs = Date.now() - ms; };
    return { live, seen, said, ev, age };
}
const spin = () => { const t = Date.now(); while (Date.now() - t < 3) { /* spin */ } };
{
    const { live, seen, ev, age } = rig();
    ev('S1', 'SessionStart', {});
    ev('S1', 'UserPromptSubmit', { prompt: 'run the suite' });
    ev('S1', 'PreToolUse', { tool_name: 'Bash', tool_input: { command: 'node test/run-all.js', timeout: 600000 } });
    spin();
    live.checkStuck();
    eq('‼️ a suite running under its own 10 min timeout is not called stalled', seen, []);
    eq('…and stays on its tool', live.sessions().find(s => s.sessionId === 'S1').status, 'tool');
    age('S1', 12 * MIN);
    live.checkStuck();
    eq('…until it outlives its own limit', seen, ['S1:stalled']);
}
{
    const { live, seen, ev, age } = rig({ backgroundOf: (id) => id === 'S2' ? { tasks: 1, working: true, waiting: true } : undefined });
    ev('S2', 'SessionStart', {});
    ev('S2', 'UserPromptSubmit', { prompt: 'wait for it' });
    ev('S2', 'PreToolUse', { tool_name: 'Monitor', tool_input: { command: 'tail -f log' } });
    age('S2', 30 * MIN);
    live.checkStuck();
    eq('‼️ a turn the Console draws purple is never called stalled', seen, []);
}
{
    const { live, seen, ev, age } = rig({ backgroundOf: () => { throw new Error('the console is gone'); } });
    ev('S3', 'SessionStart', {});
    ev('S3', 'UserPromptSubmit', { prompt: 'x' });
    age('S3', 10 * MIN);
    live.checkStuck();
    eq('a host that throws leaves the old rule in charge', seen, ['S3:stalled']);
}
{
    const { live, said, ev, age } = rig();
    ev('S4', 'SessionStart', {});
    ev('S4', 'UserPromptSubmit', { prompt: 'x' });
    live.handle({ session_id: 'S4', hook_event_name: 'AssistantMessage', message: "You've hit your session limit · resets 8pm" });
    age('S4', 10 * MIN);
    live.checkStuck();
    eq('‼️ the alert names the usage-limit wall instead of "looks stalled"', said, ['stalled:dev hit its usage limit']);
}
{
    const { live, said, ev, age } = rig();
    ev('S5', 'SessionStart', {});
    ev('S5', 'UserPromptSubmit', { prompt: 'x' });
    live.handle({ session_id: 'S5', hook_event_name: 'AssistantMessage', message: "You've hit your session limit · resets 8pm" });
    ev('S5', 'UserPromptSubmit', { prompt: 'go on' });
    age('S5', 10 * MIN);
    live.checkStuck();
    eq('a new prompt clears the old wall', said, ['stalled:dev looks stalled']);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
