// M-39 — a workflow run keeps every finished step on its board; any later step reads it by stable id.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const ROOT = path.resolve(__dirname, '..');
const fakeVscode = {
    EventEmitter: class { constructor() { this.c = []; } get event() { return cb => { this.c.push(cb); return { dispose() { } }; }; } fire(v) { this.c.forEach(cb => cb(v)); } dispose() { } },
    window: {
        showInformationMessage: () => Promise.resolve(), showWarningMessage: () => Promise.resolve(),
        createTerminal: () => ({ show() { }, sendText() { }, dispose() { } }), onDidCloseTerminal: () => ({ dispose() { } })
    }
};
const origLoad = Module._load;
Module._load = function (r, p, m) { return r === 'vscode' ? fakeVscode : origLoad.call(this, r, p, m); };
const B = require(path.join(ROOT, 'out/core/runContext.js'));
const W = require(path.join(ROOT, 'out/core/workflowInputs.js'));
const { TaskManager } = require(path.join(ROOT, 'out/core/tasks.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`, JSON.stringify(got) === JSON.stringify(want));

/* ---------- ids ---------- */
{
    const st = [{}, { id: 'kes' }, { id: 'kes' }, { id: '9bad' }];
    ok('missing, repeated or malformed ids are replaced and it says so', B.ensureStepIds(st) === true);
    eq('…each by the first free s<n>, the original kept', st.map(s => s.id), ['s1', 'kes', 's3', 's4']);
    ok('a second pass changes nothing', B.ensureStepIds(st) === false);
    const moved = [{ id: 's2' }, { id: 's1' }];
    B.ensureStepIds(moved);
    eq('‼️ an id stays when the step moves', moved.map(s => s.id), ['s2', 's1']);
}

/* ---------- templates ---------- */
{
    let b = B.boardWrite(undefined, { id: 's1', index: 0, title: 'a', status: 'done', json: { a: { b: 'DERIN' } }, text: 'metin', costUSD: 0.25, at: 1 });
    b = B.boardWrite(b, { id: 's2', index: 1, title: 'b', status: 'done', file: 'D:/x.md', verdict: 'pass', costUSD: 0.5, at: 2 });
    eq('text · json field · file · verdict · run cost', B.fillBoard('{steps.s1.text}|{steps.s1.json.a.b}|{steps.s2.file}|{steps.s2.verdict}|{run.cost}', b),
        'metin|DERIN|D:/x.md|pass|0.75');
    eq('a step not on the board yet reads empty; other braces are left alone', B.fillBoard('[{steps.s9.text}] {prev_text}', b), '[] {prev_text}');
    const big = B.boardWrite(undefined, { id: 's1', index: 0, title: 'a', status: 'done', text: 'x'.repeat(30000), json: { v: 'y'.repeat(50000) }, at: 1 });
    eq('a long text is kept to 20,000; a JSON too big is dropped, not cut', [big.steps.s1.text.length, 'json' in big.steps.s1], [20000, false]);
    ok('‼️ a save naming a step the chain lacks is refused', /\{steps\.nope…\}/.test(W.checkWorkflowInputs([], [{ id: 's1', prompt: '{steps.nope.text}' }]).error));
}

/* ---------- the runtime: three steps, the third reads the first ---------- */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-board-'));
const agentDir = path.join(tmp, 'agent'); fs.mkdirSync(agentDir, { recursive: true });
const agent = { id: 'a1', name: 'yazar', dir: agentDir };
let chars = 1500;
const mgr = new TaskManager(path.join(tmp, 'f.json'), () => [agent], () => false, () => '', { quotaCheck: () => 'hold', prevTextChars: () => chars });
const step = (title, prompt) => ({ agentId: 'a1', agentName: 'yazar', title, prompt, mode: 'headless' });
let n = 0;
const complete = (task, body) => {
    const f = path.join(tmp, `out${n++}.md`);
    fs.writeFileSync(f, `# ${task.title}\n\n- x\n\n---\n\n${body}\n\n---\nFinished: now · exit 0\n`);
    task.outputFile = f; task.costUSD = 0.25;
    mgr.completeTask(task);
};
const at = (wId, i) => mgr.tasks.find(t => t.workflowId === wId && t.stepIndex === i && t.status === 'queued');
{
    const w = mgr.addWorkflow('Üç', [step('bir', 'başla'), step('iki', 'önceki: {prev_text}'), step('üç', 'derin: {steps.s1.json.a.b} · maliyet {run.cost}')]);
    eq('ids are given when the chain is saved', w.steps.map(s => s.id), ['s1', 's2', 's3']);
    const run = mgr.runWorkflow(w);
    complete(at(w.id, 0), '{"a":{"b":"DERIN"}}');
    eq('‼️ REGRESSION: {prev_text} works exactly as before', at(w.id, 1).prompt, 'önceki: {"a":{"b":"DERIN"}}');
    complete(at(w.id, 1), 'ikinci adımın metni');
    eq('‼️ a JSON field from TWO steps back is read', at(w.id, 2).prompt, 'derin: DERIN · maliyet 0.50');
    const board = mgr.workflowRunState(run).board;
    eq('workflows.status answers with the board', Object.keys(board.steps), ['s1', 's2']);
    const saved = JSON.parse(fs.readFileSync(path.join(tmp, 'f.json'), 'utf8'));
    eq('the board is on the saved run record (survives a reload)', Object.keys(saved.workflowRuns[run].board.steps), ['s1', 's2']);
}
{
    chars = 5;
    const w = mgr.addWorkflow('Kısa', [step('a', 'x'), step('b', '{prev_text}')]);
    mgr.runWorkflow(w);
    complete(at(w.id, 0), '1234567890');
    eq('the {prev_text} cut is the setting', at(w.id, 1).prompt, '12345');
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
