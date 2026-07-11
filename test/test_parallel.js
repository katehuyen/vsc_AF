// Ad-hoc tests for Dalga 3b — parallel step groups + fan-in (2.20.0).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const ROOT = require('path').resolve(__dirname, '..');

class FakeEmitter {
    constructor() { this._cbs = []; }
    get event() { return (cb) => { this._cbs.push(cb); return { dispose() { } }; }; }
    fire(v) { for (const cb of this._cbs) { cb(v); } }
    dispose() { }
}
const fakeVscode = {
    EventEmitter: FakeEmitter,
    window: {
        showInformationMessage: () => Promise.resolve(undefined),
        showWarningMessage: () => Promise.resolve(undefined),
        createTerminal: () => ({ show() { }, sendText() { }, dispose() { } }),
        onDidCloseTerminal: () => ({ dispose() { } })
    }
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') { return fakeVscode; }
    return origLoad.call(this, request, parent, isMain);
};
const { TaskManager } = require(path.join(ROOT, 'out/core/tasks.js'));

let pass = 0, fail = 0;
const check = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-par-'));
const agentDir = path.join(tmp, 'agent'); fs.mkdirSync(agentDir, { recursive: true });
const agent = { id: 'a1', name: 'yazar', dir: agentDir };
const agents = () => [agent];

// Give a deferred branch task a fake archived output, then complete it.
let outN = 0;
function completeWith(mgr, task, body) {
    const f = path.join(tmp, `out${outN++}.md`);
    fs.writeFileSync(f, `# ${task.title}\n\n- x\n\n---\n\n${body}\n\n---\nFinished: now · exit 0\n`);
    task.outputFile = f;
    mgr.completeTask(task);
}
function failBranch(mgr, task) {
    task.status = 'failed';
    mgr.advanceWorkflow(task, 'failed'); // private, reachable at runtime — same path a real failure takes
}
const step = (title, over = {}) => ({ agentId: 'a1', agentName: 'yazar', title, prompt: title, mode: 'headless', ...over });
const branchOf = (mgr, wId, idx) => mgr.tasks.find(t => t.workflowId === wId && t.stepIndex === idx && t.status === 'queued');

const mgr = new TaskManager(path.join(tmp, 'f.json'), agents, () => false, () => '', { quotaCheck: () => 'hold' });

// ---- 1. fan-out: entering a parallel group launches all branches ----
const w1 = mgr.addWorkflow('W1', [
    step('A', { parallel: true }),
    step('B', { parallel: true }),
    step('C', { prompt: 'merged: {prev_text}' })
]);
mgr.runWorkflow(w1);
const a0 = branchOf(mgr, w1.id, 0), b0 = branchOf(mgr, w1.id, 1);
check('fan-out: both branches launched (deferred under quota hold)', !!a0 && !!b0);
check('fan-out: consumer NOT started until fan-in', !branchOf(mgr, w1.id, 2));

// ---- 2. fan-in: consumer runs after ALL branches, with merged outputs ----
completeWith(mgr, a0, 'BRANCH-A-OUT');
check('fan-in: consumer waits while one branch still pending', !branchOf(mgr, w1.id, 2));
completeWith(mgr, b0, 'BRANCH-B-OUT');
const c = branchOf(mgr, w1.id, 2);
check('fan-in: consumer queued once all branches done', !!c);
check('fan-in: merged handoff carries both branch outputs',
    c && /BRANCH-A-OUT/.test(c.prompt) && /BRANCH-B-OUT/.test(c.prompt));
check('fan-in: merged text is labeled by step title', c && /## A/.test(c.prompt) && /## B/.test(c.prompt));

// ---- 3. group failure with onFail=stop halts the chain ----
const w2 = mgr.addWorkflow('W2', [
    step('A', { parallel: true }),      // group start carries the group's onFail (default stop)
    step('B', { parallel: true }),
    step('C', {})
]);
mgr.runWorkflow(w2);
completeWith(mgr, branchOf(mgr, w2.id, 0), 'ok');
failBranch(mgr, branchOf(mgr, w2.id, 1));
check('group-fail/stop: consumer never runs when a branch fails', !branchOf(mgr, w2.id, 2));

// ---- 4. group failure with onFail=continue advances past the group ----
const w3 = mgr.addWorkflow('W3', [
    step('A', { parallel: true, onFail: 'continue' }),
    step('B', { parallel: true }),
    step('C', {})
]);
mgr.runWorkflow(w3);
completeWith(mgr, branchOf(mgr, w3.id, 0), 'ok');
failBranch(mgr, branchOf(mgr, w3.id, 1));
check('group-fail/continue: consumer still reached', !!branchOf(mgr, w3.id, 2));

// ---- 5. per-branch runIf skip ----
const w4 = mgr.addWorkflow('W4', [
    step('S', {}),                                   // seq producer feeds the group
    step('A', { parallel: true }),
    step('B', { parallel: true, runIf: 'ALARM' }),   // only runs if upstream text has ALARM
    step('C', {})
]);
mgr.runWorkflow(w4);
completeWith(mgr, branchOf(mgr, w4.id, 0), 'all clear'); // no ALARM → B should be skipped
const a1p = branchOf(mgr, w4.id, 1), b1p = branchOf(mgr, w4.id, 2);
check('runIf: matching branch A launched', !!a1p);
check('runIf: non-matching branch B skipped (no task created)', !b1p);
completeWith(mgr, a1p, 'done-a');
check('runIf: group fans in with only the live branch → consumer reached', !!branchOf(mgr, w4.id, 3));

// ---- 6. all branches skipped → group fans in immediately ----
const w5 = mgr.addWorkflow('W5', [
    step('S', {}),
    step('A', { parallel: true, runIf: 'X' }),
    step('B', { parallel: true, runIf: 'Y' }),
    step('C', {})
]);
mgr.runWorkflow(w5);
completeWith(mgr, branchOf(mgr, w5.id, 0), 'neither'); // no X/Y
check('all-skipped: consumer reached without any branch running',
    !!branchOf(mgr, w5.id, 3) && !branchOf(mgr, w5.id, 1) && !branchOf(mgr, w5.id, 2));

// ---- 7. sequential workflows still behave exactly as before ----
const w6 = mgr.addWorkflow('W6', [step('P', {}), step('Q', { prompt: 'q: {prev_text}' })]);
mgr.runWorkflow(w6);
const p = branchOf(mgr, w6.id, 0);
check('sequential: only the first step runs initially', !!p && !branchOf(mgr, w6.id, 1));
completeWith(mgr, p, 'P-OUT');
const qy = branchOf(mgr, w6.id, 1);
check('sequential: second step runs after first with its handoff', qy && /P-OUT/.test(qy.prompt));

mgr.dispose();
Module._load = origLoad;
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
