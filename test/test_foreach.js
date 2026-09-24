// M-40 — a for-each step: one branch per element of a list, a policy for the one that fails, a fan-in in list order.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const ROOT = path.resolve(__dirname, '..');
const warnings = [];
const fakeVscode = {
    EventEmitter: class { constructor() { this.c = []; } get event() { return cb => { this.c.push(cb); return { dispose() { } }; }; } fire(v) { this.c.forEach(cb => cb(v)); } dispose() { } },
    window: {
        showInformationMessage: () => Promise.resolve(), showWarningMessage: (m) => { warnings.push(m); return Promise.resolve(); },
        createTerminal: () => ({ show() { }, sendText() { }, dispose() { } }), onDidCloseTerminal: () => ({ dispose() { } })
    }
};
const origLoad = Module._load;
Module._load = function (r, p, m) { return r === 'vscode' ? fakeVscode : origLoad.call(this, r, p, m); };
const FE = require(path.join(ROOT, 'out/core/forEachStep.js'));
const B = require(path.join(ROOT, 'out/core/runContext.js'));
const W = require(path.join(ROOT, 'out/core/workflowInputs.js'));
const { TaskManager } = require(path.join(ROOT, 'out/core/tasks.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`, JSON.stringify(got) === JSON.stringify(want));

/* ---------- the list ---------- */
{
    const board = B.boardWrite(undefined, { id: 'split', index: 0, title: 'b', status: 'done', json: { parts: ['a', 'b'] }, text: '- bir\n2. iki\n\nüç', at: 1 });
    eq('an earlier step\'s JSON array', FE.resolveList('{steps.split.json.parts}', { board }).items, ['a', 'b']);
    eq('a text is one item per line, bullets and numbers dropped', FE.resolveList('{steps.split.text}', { board }).items, ['bir', 'iki', 'üç']);
    eq('the previous step\'s JSON', FE.resolveList('{prev_json.x}', { prevJson: { x: [1, 2, 3] } }).items, [1, 2, 3]);
    eq('an input holding a JSON array', FE.resolveList('{input.files}', { inputs: { files: '["p.mp4","q.mp4"]' } }).items, ['p.mp4', 'q.mp4']);
    ok('a step not on the board yet is an error, in words', /has not finished/.test(FE.resolveList('{steps.nope.json.x}', { board }).error));
    ok('an object is not a list', /not a list/.test(FE.resolveList('{prev_json.x}', { prevJson: { x: { a: 1 } } }).error));
}

/* ---------- the policy, the cap, the refusals ---------- */
{
    const p = FE.forEachPolicy({ list: '{prev_json.x}' });
    eq('built-in policy', [p.concurrency, p.onBranchFail, p.retries, p.cap, p.capMode, p.budgetUSD], [4, 'continue', 0, 20, 'soft', 0]);
    ok('the policy says where each value came from', /concurrency 4/.test(p.origin) && /built-in/.test(p.origin));
    const soft = FE.planForEach([1, 2, 3, 4, 5], { ...p, cap: 3 }, 2).run;
    eq('soft cap: the first N run, the total is kept', [soft.branches.length, soft.total, soft.stepIndex], [3, 5, 2]);
    ok('hard cap: refused, and it says the numbers', /5 items and the cap is 3/.test(FE.planForEach([1, 2, 3, 4, 5], { ...p, cap: 3, capMode: 'hard' }, 0).refusal));
    const R = (fe, ids = ['s1'], par) => FE.forEachRefusal({ forEach: fe, parallel: par }, ids);
    eq('a good one is fine', R({ list: '{steps.s1.json.parts}', concurrency: 2 }), '');
    ok('not a list reference', /one list reference/.test(R({ list: 'parts' })));
    ok('a step that does not run before it', /does not run before/.test(R({ list: '{steps.s3.json.x}' })));
    ok('inside a parallel group', /parallel group/.test(R({ list: '{prev_text}' }, [], true)));
    ok('‼️ a policy value out of range is refused, not silently defaulted', /concurrency 0 is refused/.test(R({ list: '{prev_text}', concurrency: 0 })));
    ok('an unknown failure policy is refused', /onBranchFail "retry" is refused/.test(R({ list: '{prev_text}', onBranchFail: 'retry' })));
    ok('the save refuses it with the step number', /^step 2: /.test(W.checkWorkflowInputs([], [{ id: 's1' }, { id: 's2', forEach: { list: '{steps.s2.text}' } }]).error));
}

/* ---------- branches: concurrency, retry, drop, budget, fan-in ---------- */
{
    const pol = { ...FE.forEachPolicy({ list: '{prev_text}' }), concurrency: 2, retries: 1 };
    const run = FE.planForEach(['a', 'b', 'c'], pol, 0).run;
    eq('concurrency 2 starts two', FE.launchable(run), [0, 1]);
    FE.launchable(run).forEach(i => FE.markLaunched(run, i));
    eq('…and none while both run', FE.launchable(run), []);
    eq('a branch done → launch the next', FE.branchEnded(run, 0, { ok: true, text: 'A' }), 'launch');
    eq('…which is the third', FE.launchable(run), [2]);
    FE.branchEnded(run, 1, { ok: false, reason: 'failed' });
    eq('retries 1: the failed branch waits for its second go', run.branches[1].status, 'waiting');
    FE.markLaunched(run, 1); FE.markLaunched(run, 2);
    FE.branchEnded(run, 1, { ok: false, reason: 'failed' });
    eq('the second failure is final', run.branches[1].status, 'failed');
    eq('continue: the last branch ending finishes the fan-in', FE.branchEnded(run, 2, { ok: true, text: 'C', json: { v: 3 } }), 'done');
    const f = FE.fanIn(run, 'Parça');
    eq('fan-in: every branch in list order', f.json.items.map(i => [i.index, i.item, i.status]), [[0, 'a', 'done'], [1, 'b', 'failed'], [2, 'c', 'done']]);
    ok('…and as text, the failed one named', /\[2\/3\] — failed: failed/.test(f.text) && /## Parça \[3\/3\]\nC/.test(f.text));
    const drop = FE.planForEach(['a', 'b'], { ...pol, onBranchFail: 'drop', retries: 0 }, 0).run;
    FE.markLaunched(drop, 0); FE.markLaunched(drop, 1);
    eq('drop: one final failure drops the step', FE.branchEnded(drop, 0, { ok: false, reason: 'failed' }), 'dropped');
    eq('…and nothing more starts', FE.launchable(drop), []);
    const money = FE.planForEach(['a'], { ...pol, retries: 0, budgetUSD: 0.1 }, 0).run;
    FE.markLaunched(money, 0);
    FE.branchEnded(money, 0, { ok: true, costUSD: 0.25 });
    ok('a branch over its budget counts as failed, and says so', money.branches[0].status === 'failed' && /\$0\.25 of its \$0\.10/.test(money.branches[0].reason));
    eq('{item} {item.x} {index}', FE.fillItem('{item.name}/{index}/{item}', { name: 'n' }, 2), 'n/2/{"name":"n"}');
    const cut = FE.planForEach(['a', 'b'], pol, 0).run;
    FE.markLaunched(cut, 0);
    FE.resumeForEach(cut);
    eq('a reload: running goes back to waiting, that attempt not counted', [cut.branches[0].status, cut.branches[0].attempts], ['waiting', 0]);
}

/* ---------- the step card: blank boxes stay unset, so the defaults apply ---------- */
{
    const P = require(path.join(ROOT, 'out/panels/tasksPanel.js'));
    const card = (extra) => P.stepFromDraft(Object.assign({ stype: 'agent', title: 'x', agent: 'yazar', prompt: 'p',
        feConc: '', feFail: '', feRetries: '', feCap: '', feCapMode: '', feBudget: '' }, extra), [{ id: 'a1', name: 'yazar' }], 2).step;
    eq('the card: only what was typed is stored', card({ feList: '{prev_json.parts}', feConc: '2', feFail: 'drop', feBudget: '0.5' }).forEach,
        { list: '{prev_json.parts}', concurrency: 2, onBranchFail: 'drop', budgetUSD: 0.5 });
    eq('an empty list box = an ordinary step', card({ feList: '', feConc: '3' }).forEach, undefined);
}

/* ---------- the runtime: 4 parts open 4 branches; one fails; a reload resumes the rest ---------- */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-foreach-'));
const agentDir = path.join(tmp, 'agent'); fs.mkdirSync(agentDir, { recursive: true });
const agent = { id: 'a1', name: 'yazar', dir: agentDir };
const store = path.join(tmp, 'f.json');
const make = () => new TaskManager(store, () => [agent], () => false, () => '', { quotaCheck: () => 'hold' });
let mgr = make();
const step = (title, prompt, extra) => ({ agentId: 'a1', agentName: 'yazar', title, prompt, mode: 'headless', ...(extra || {}) });
let n = 0;
const write = (task, body) => {
    const f = path.join(tmp, `out${n++}.md`);
    fs.writeFileSync(f, `# ${task.title}\n\n- x\n\n---\n\n${body}\n\n---\nFinished: now · exit 0\n`);
    task.outputFile = f; task.costUSD = 0.1;
};
const complete = (task, body) => { write(task, body); mgr.completeTask(task); };
const failIt = (task) => { write(task, 'olmadı'); mgr.finish(task, 'failed'); };
const queued = (m, wId, i) => m.tasks.filter(t => t.workflowId === wId && t.stepIndex === i && t.status === 'queued');
{
    const w = mgr.addWorkflow('Parçala', [
        step('böl', 'böl'),
        step('işle', 'parça {index}: {item}', { forEach: { list: '{steps.s1.json.parts}', concurrency: 4 } }),
        step('birleştir', 'hepsi: {prev_json.items.1.text} · {steps.s2.json.total}')
    ]);
    const run = mgr.runWorkflow(w);
    complete(queued(mgr, w.id, 0)[0], '{"parts":["p1","p2","p3","p4"]}');
    const br = queued(mgr, w.id, 1);
    eq('‼️ a 4-part list opens 4 branches', br.map(t => t.prompt), ['parça 0: p1', 'parça 1: p2', 'parça 2: p3', 'parça 3: p4']);
    ok('each row says which element it is', br.every((t, i) => t.branchIndex === i && t.title.endsWith(`[${i + 1}/4]`)));
    complete(br[0], 'bir'); failIt(br[2]);
    const st = mgr.workflowRunState(run).forEach;
    eq('workflows.status shows the fan-out in flight', [st.branches, st.done, st.failed, st.running], [4, 1, 1, 2]);
    // the window closes here: a new manager over the same store
    mgr = make();
    const persisted = mgr.workflowRunState(run).forEach;
    eq('‼️ the fan-out survives a reload', [persisted.done, persisted.failed], [1, 1]);
    mgr.resumeWorkflowFromTask(mgr.tasks.find(t => t.workflowRunId === run && t.stepIndex === 1));
    const again = queued(mgr, w.id, 1);
    eq('‼️ the resume re-runs only the branches that had not finished', again.map(t => t.branchIndex), [1, 3]);
    ok('…and the rows left from before the reload are cancelled, not run twice', mgr.tasks.filter(t => t.workflowRunId === run && t.stepIndex === 1 && t.status === 'cancelled').length === 2);
    complete(again[0], 'iki'); complete(again[1], 'dört');
    const next = queued(mgr, w.id, 2)[0];
    eq('continue (default): the fan-in hands on every branch in order', next && next.prompt, 'hepsi: iki · 4');
    const board = mgr.workflowRunState(run).board.steps.s2;
    eq('the fan-in is on the board under the step id', board.json.items.map(i => i.status), ['done', 'done', 'failed', 'done']);
}
{
    const w = mgr.addWorkflow('Düşür', [
        step('böl', 'böl'),
        step('işle', '{item}', { forEach: { list: '{prev_json.parts}', onBranchFail: 'drop', concurrency: 1 } }),
        step('son', 'son')
    ]);
    const run = mgr.runWorkflow(w);
    complete(queued(mgr, w.id, 0)[0], '{"parts":["a","b","c"]}');
    eq('concurrency 1 is sequential', queued(mgr, w.id, 1).length, 1);
    failIt(queued(mgr, w.id, 1)[0]);
    const s = mgr.workflowRunState(run);
    ok('‼️ drop: one failed branch stops the run (the step\'s onFail is stop)', s.status === 'failed' && /for each: branch 1\/3 failed/.test(s.reason));
    eq('…and nothing after it started', queued(mgr, w.id, 2).length + queued(mgr, w.id, 1).length, 0);
}
{
    const w = mgr.addWorkflow('Boş', [step('böl', 'böl'), step('işle', '{item}', { forEach: { list: '{prev_json.parts}' } }), step('son', 'n={prev_json.total}')]);
    mgr.runWorkflow(w);
    complete(queued(mgr, w.id, 0)[0], '{"parts":[]}');
    eq('an empty list runs no branch and goes on', queued(mgr, w.id, 2).map(t => t.prompt), ['n=0']);
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
