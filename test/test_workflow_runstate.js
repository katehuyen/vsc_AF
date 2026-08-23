// ‼️ M-18 — A WORKFLOW RUN BECOMES SOMETHING YOU CAN ASK ABOUT.
//
// `runWorkflow` returned `void` and announced its ending in a toast, which is
// enough for a person watching the window and useless to everything else: a
// caller could start a chain and had no way to learn its id, whether it
// finished, where it stopped, or what it produced. A mission that wanted a
// workflow as one of its steps therefore could not have one — the only route
// left was a second workflow engine inside missions.
//
// So the run answers now, and the two properties that make the answer worth
// having are measured here:
//
//   * the STATUS IS DERIVED from the tasks, which are persisted, rather than
//     stored beside them — a stored status is a second copy of a fact and
//     disagrees with it on the first reload;
//   * …except the REASON a run ended early, which the tasks genuinely cannot
//     say: a chain stopped by the loop guard and one that simply ran out of
//     steps leave rows that look identical.
//
// And the run's result is the LAST COMPLETED STEP'S HANDOFF — the file and the
// text it passed on. That is what a parent reads, and there is nothing else to
// read: walking the chain's tasks from outside would be a second opinion about
// the same run.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const ROOT = path.resolve(__dirname, '..');

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
const ok = (n, c) => { if (c) { pass++; console.log('  ok   ' + n); } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + (got === want ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`), got === want);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-wfs-'));
const agentDir = path.join(tmp, 'agent'); fs.mkdirSync(agentDir, { recursive: true });
const agent = { id: 'a1', name: 'yazar', dir: agentDir };
const agents = () => [agent];

let outN = 0;
function completeWith(mgr, task, body) {
    const f = path.join(tmp, `out${outN++}.md`);
    fs.writeFileSync(f, `# ${task.title}\n\n- x\n\n---\n\n${body}\n\n---\nFinished: now · exit 0\n`);
    task.outputFile = f;
    task.costUSD = 0.25;
    task.tokens = 1000;
    mgr.completeTask(task);
}
function failStep(mgr, task) {
    task.status = 'failed';
    // The real failure path writes the row before it routes; the fixture has to
    // do the same or the reload case below would be measuring the fixture.
    mgr.persist();
    mgr.advanceWorkflow(task, 'failed');
}
const step = (title, over = {}) => ({ agentId: 'a1', agentName: 'yazar', title, prompt: title, mode: 'headless', ...over });
const queued = (mgr, wId, idx) => mgr.tasks.find(t => t.workflowId === wId && t.stepIndex === idx && t.status === 'queued');

const mgr = new TaskManager(path.join(tmp, 'f.json'), agents, () => false, () => '', { quotaCheck: () => 'hold' });

// ---- 1. the id comes back, and it is the handle to everything else ----
console.log('\n-- runWorkflow answers');
const w1 = mgr.addWorkflow('W1', [step('one'), step('two')]);
const r1 = mgr.runWorkflow(w1);
ok('‼️ starting a chain returns its run id', typeof r1 === 'string' && r1.length > 0);
const empty = mgr.addWorkflow('Empty', []);
eq('an empty chain returns undefined — nothing started, rather than a run nobody can name',
    mgr.runWorkflow(empty), undefined);
eq('an id nothing ever ran under has no state', mgr.workflowRunState('nope'), undefined);

// ---- 2. running, then done ----
console.log('\n-- while it runs, and when it is over');
let s1 = mgr.workflowRunState(r1);
eq('a chain with a step still to settle is running', s1.status, 'running');
eq('it names the workflow it came from', s1.title, 'W1');
eq('and lists the step that exists so far', s1.steps.length, 1);
ok('nothing is claimed to have been produced yet', s1.handoff === undefined || s1.handoff.text === undefined);

completeWith(mgr, queued(mgr, w1.id, 0), 'STEP-ONE-OUT');
s1 = mgr.workflowRunState(r1);
eq('the second step is queued, so the run is still running', s1.status, 'running');
eq('and the handoff already carries what the finished step passed on', s1.handoff.text, 'STEP-ONE-OUT');

completeWith(mgr, queued(mgr, w1.id, 1), 'STEP-TWO-OUT');
s1 = mgr.workflowRunState(r1);
eq('‼️ reaching the end of the chain is "done"', s1.status, 'done');
eq('the RESULT is the last completed step\'s output, not the first', s1.handoff.text, 'STEP-TWO-OUT');
ok('with the real file behind it, not just the text', typeof s1.handoff.file === 'string');
eq('every step is listed', s1.steps.length, 2);
ok('each with the task it really was', s1.steps.every(x => typeof x.taskId === 'string' && x.taskId));
eq('‼️ the cost is added up ONCE across the whole run', s1.costUSD, 0.5);
eq('…and so are the tokens', s1.tokens, 2000);
ok('and it says when it ended', typeof s1.endedAt === 'number');

// ---- 3. a stopped chain says where and why ----
console.log('\n-- a chain that stopped short says so, and says where');
const w2 = mgr.addWorkflow('W2', [step('one'), step('two'), step('three')]);
const r2 = mgr.runWorkflow(w2);
completeWith(mgr, queued(mgr, w2.id, 0), 'FIRST');
failStep(mgr, queued(mgr, w2.id, 1));
const s2 = mgr.workflowRunState(r2);
eq('a failed step with onFail=stop makes the run failed', s2.status, 'failed');
eq('‼️ and it names the step it died on, which the rows alone cannot say', s2.stoppedAtStep, 1);
ok('with the reason in words', /step 2 failed/.test(s2.reason || ''));
eq('the last thing it did produce is still readable', s2.handoff.text, 'FIRST');
ok('the third step never existed', !s2.steps.some(x => x.index === 2));

// ---- 4. what survives when the memo does not ----
console.log('\n-- ‼️ derived, so it still answers after a reload');
const forgotten = new TaskManager(path.join(tmp, 'f.json'), agents, () => false, () => '', { quotaCheck: () => 'hold' });
const reloaded = forgotten.workflowRunState(r1);
ok('a fresh manager reading the same store still finds the run', !!reloaded);
eq('and still says it finished — from the tasks, not from a memo it never had',
    reloaded.status, 'done');
eq('the result survives too', reloaded.handoff.text, 'STEP-TWO-OUT');
const reloadedFail = forgotten.workflowRunState(r2);
eq('a failed run is still failed after the reload', reloadedFail.status, 'failed');
// ‼️ X-71 — and the REASON survives with it now. It used to die with the
// window, on the grounds that a derived answer is more honest than a stored
// one — but the reason a chain stopped is exactly what the rows cannot derive,
// so what the reader actually got was "failed" and no answer to "where".
ok('‼️ X-71 the reason the chain stopped survives the reload',
    /step 2 failed/.test(reloadedFail.reason || ''));
eq('…and so does the step it died on', reloadedFail.stoppedAtStep, 1);

// ---- 5. whose work the chain is ----
console.log('\n-- ‼️ a chain started FOR a project is that project\'s work, from step 1');
const w5 = mgr.addWorkflow('W5', [step('one'), step('two')]);
const r5 = mgr.runWorkflow(w5, { projectId: 'prj_x' });
const first5 = queued(mgr, w5.id, 0);
eq('the first step already carries it — not inherited from a task that does not exist yet',
    first5.projectId, 'prj_x');
completeWith(mgr, first5, 'A');
eq('and so does the next one', queued(mgr, w5.id, 1).projectId, 'prj_x');
const w6 = mgr.addWorkflow('W6', [step('one')]);
mgr.runWorkflow(w6);
ok('a chain nobody stamped is left exactly as it was',
    queued(mgr, w6.id, 0).projectId === undefined);

// ---- 5b. X-73: three states, every kind of step, and a reload ----
//
// The binding was a truthy in-memory map: an EXPLICIT "no project" was
// indistinguishable from a caller who said nothing, the memo died with the
// window, and the four step kinds that mint their own task row (webhook,
// media, approval, select) never asked for it at all — so one approval in
// the middle of a chain filed itself under Unassigned while the agent steps
// around it were the project's work.
console.log('\n-- ‼️ X-73 the run\'s project is one binding, in three states');
let windowProject = 'prj_window';
const wfile = path.join(tmp, 'w73.json');
const mkMgr = () => new TaskManager(wfile, agents, () => false, () => '',
    { quotaCheck: () => 'hold', activeProjectId: () => windowProject });
const mgrW = mkMgr();

// (a) said nothing = the window, resolved AT THE START and pinned
const w73a = mgrW.addWorkflow('W73a', [step('one'), step('two')]);
const r73a = mgrW.runWorkflow(w73a);
eq('a chain started by a person takes the window\'s project',
    queued(mgrW, w73a.id, 0).projectId, 'prj_window');
completeWith(mgrW, queued(mgrW, w73a.id, 0), 'A');
windowProject = 'prj_somewhere_else';
eq('‼️ and the step made after the window moved on belongs to the same run',
    queued(mgrW, w73a.id, 1).projectId, 'prj_window');

// (b) the key passed empty = a real "no project", not "inherit"
const w73b = mgrW.addWorkflow('W73b', [step('one')]);
mgrW.runWorkflow(w73b, { projectId: undefined });
ok('‼️ an explicit no-project run does not borrow the window',
    queued(mgrW, w73b.id, 0).projectId === undefined);

// (c) every kind of step, not only the agent ones
const w73c = mgrW.addWorkflow('W73c', [
    step('gate', { agentId: '', agentName: '', approval: { message: 'ok?' } }),
    step('after')
]);
const r73c = mgrW.runWorkflow(w73c, { projectId: 'prj_x' });
const gate = mgrW.tasks.find(t => t.workflowRunId === r73c && t.stepIndex === 0);
eq('‼️ an approval row is the run\'s work too — it used to file as Unassigned',
    gate && gate.projectId, 'prj_x');

// (d) the binding outlives the window that made it
mgrW.persist();
const mgrR = mkMgr();
const w73aR = mgrR.workflows.find(x => x.title === 'W73a');
completeWith(mgrR, mgrR.tasks.find(t => t.workflowRunId === r73a && t.stepIndex === 1), 'B');
const w73d = mgrR.addWorkflow('W73d', [step('one'), step('two')]);
const r73d = mgrR.runWorkflow(w73d, { projectId: 'prj_keep' });
mgrR.persist();
const mgrR2 = mkMgr();
completeWith(mgrR2, mgrR2.tasks.find(t => t.workflowRunId === r73d && t.stepIndex === 0), 'A');
eq('‼️ after a reload the next step still belongs to the run\'s project',
    mgrR2.tasks.find(t => t.workflowRunId === r73d && t.stepIndex === 1).projectId, 'prj_keep');
ok('and the reloaded manager can still name the run',
    !!mgrR2.workflowRunState(r73d) && !!w73aR);

// ---- 5c. X-71: the runs the rows cannot describe ----
//
// `workflowRunState` began by filtering the task rows and returning undefined
// when there were none. Two real chains produce none: one whose every step is
// skipped by `runIf`, and one whose first step names an agent that is gone.
// Both are OVER — one done, one failed — and both came back "undefined", which
// a parent mission reads as "still working" and polls for ever.
console.log('\n-- ‼️ X-71 a run with no rows is still an answer');
const w71a = mgr.addWorkflow('W71a', [
    step('skipped', { runIf: 'NEVER-MATCHES' }),
    step('also skipped', { runIf: 'NEVER-MATCHES' })
]);
const r71a = mgr.runWorkflow(w71a);
const s71a = mgr.workflowRunState(r71a);
ok('‼️ a chain whose every step was skipped is answerable at all', !!s71a);
eq('…and it is DONE, not "still running"', s71a && s71a.status, 'done');
eq('…with no steps, honestly', s71a && s71a.steps.length, 0);
ok('…and it names the workflow it was', s71a && s71a.title === 'W71a');

const w71b = mgr.addWorkflow('W71b', [step('gone', { agentId: 'ghost', agentName: 'Ghost' })]);
const r71b = mgr.runWorkflow(w71b);
const s71b = mgr.workflowRunState(r71b);
eq('‼️ a first step whose agent is gone FAILS the run, it does not hang it',
    s71b && s71b.status, 'failed');
ok('…saying which agent it could not find', s71b && /Ghost/.test(s71b.reason || ''));
eq('an id nothing was ever started under is still undefined',
    mgr.workflowRunState('never-ran'), undefined);

console.log('\n-- ‼️ X-71 an abandoned attempt does not outvote the one that worked');
const w71c = mgr.addWorkflow('W71c', [step('one'), step('two')]);
const r71c = mgr.runWorkflow(w71c);
completeWith(mgr, queued(mgr, w71c.id, 0), 'A');
failStep(mgr, queued(mgr, w71c.id, 1));
eq('the chain failed on its second step', mgr.workflowRunState(r71c).status, 'failed');
// the resume: a NEW row for the same step, under the same run id
mgr.addTask(agent, 'retry two', 'p', 'headless',
    { workflowId: w71c.id, workflowRunId: r71c, stepIndex: 1 });
const retry = mgr.tasks[mgr.tasks.length - 1];
retry.startedAt = Date.now() + 1000;
completeWith(mgr, retry, 'B');
eq('‼️ the successful retry is what its step says now',
    mgr.workflowRunState(r71c).status, 'done');
mgr.persist();
const after = new TaskManager(path.join(tmp, 'f.json'), agents, () => false, () => '', { quotaCheck: () => 'hold' });
eq('‼️ …and it still says so after a reload, with the failed attempt still on file',
    after.workflowRunState(r71c).status, 'done');
ok('the abandoned attempt is kept as history, not erased',
    after.workflowRunState(r71c).steps.filter(x => x.index === 1).length === 2);

// ---- 6. the tasks outrank the memo ----
console.log('\n-- a resumed chain is running again, whatever an earlier ending said');
const w3 = mgr.addWorkflow('W3', [step('one'), step('two')]);
const r3 = mgr.runWorkflow(w3);
completeWith(mgr, queued(mgr, w3.id, 0), 'A');
completeWith(mgr, queued(mgr, w3.id, 1), 'B');
eq('it finished once', mgr.workflowRunState(r3).status, 'done');
mgr.addTask(agent, 'again', 'p', 'headless');
const revived = mgr.tasks[mgr.tasks.length - 1];
revived.workflowId = w3.id; revived.workflowRunId = r3; revived.stepIndex = 1; revived.status = 'queued';
eq('‼️ a queued task on the same run id means running, memo or not',
    mgr.workflowRunState(r3).status, 'running');

// ---- 7. ‼️ X-74 the run is named before it is started ----
//
// A caller that has to write down WHICH chain it started — a mission step is
// the one that does — could not: the id came back from the same call that had
// already made the first task, so the bond reached the disk strictly after real
// work was running. A window closing in that gap left a chain working for
// nobody. Two calls with the caller's own save in between fix it, and the start
// is idempotent because the caller in between may have crashed and come back.
console.log('\n-- ‼️ X-74 a run is named before it is started, and starting it is idempotent');
const w9 = mgr.addWorkflow('W9', [step('one'), step('two')]);
const mine = (r) => mgr.tasks.filter(t => t.workflowRunId === r).length;
const r9 = mgr.prepareWorkflowRun(w9);
ok('preparing a run answers with the id the caller will write down',
    typeof r9 === 'string' && r9.length > 0);
eq('‼️ …and NOTHING has been started under it', mine(r9), 0);
const prepared = mgr.workflowRunState(r9);
ok('the run is already something the reload can ask about', !!prepared && prepared.title === 'W9');
eq('…with no steps to its name yet', prepared.steps.length, 0);
eq('an empty chain still cannot be prepared — nothing to allocate an id for',
    mgr.prepareWorkflowRun(mgr.addWorkflow('W9empty', [])), undefined);

mgr.startWorkflowRun(r9, w9);
eq('starting it makes its first step, exactly one', mine(r9), 1);
mgr.startWorkflowRun(r9, w9);
eq('‼️ starting it AGAIN buys nothing — the allocate/save/start order can be replayed',
    mine(r9), 1);
completeWith(mgr, queued(mgr, w9.id, 0), 'ONE');
mgr.startWorkflowRun(r9, w9);
eq('…nor does a replay part-way through the chain restart it from the top',
    mgr.workflowRunState(r9).steps.filter(x => x.index === 0).length, 1);

const before2 = mine(r2);
mgr.startWorkflowRun(r2, w2);
eq('a run that already ended is not restarted by asking again', mine(r2), before2);
mgr.startWorkflowRun('never-prepared', w9);
ok('an id nobody prepared starts nothing at all', mine('never-prepared') === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
