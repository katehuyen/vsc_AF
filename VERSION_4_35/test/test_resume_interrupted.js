// F1: interrupted workflow runs — load-time detection, resume offer, honest states.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const ROOT = require('path').resolve(__dirname, '..');

const infoMsgs = [], warnMsgs = [];
class FakeEmitter {
    constructor() { this._cbs = []; }
    get event() { return (cb) => { this._cbs.push(cb); return { dispose() { } }; }; }
    fire(v) { for (const cb of this._cbs) { cb(v); } }
    dispose() { }
}
const fakeVscode = {
    EventEmitter: FakeEmitter,
    Disposable: { from: () => ({ dispose() { } }) },
    window: {
        showInformationMessage: (m) => { infoMsgs.push(m); return Promise.resolve(undefined); },
        showWarningMessage: (m) => { warnMsgs.push(m); return Promise.resolve(undefined); },
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
function check(name, cond) {
    if (cond) { pass++; }
    else { fail++; console.log('FAIL  ' + name); }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-f1-'));
const storage = path.join(tmp, 'farm-tasks.json');
const outputs = path.join(tmp, 'task-outputs'); fs.mkdirSync(outputs, { recursive: true });
const agentDir = path.join(tmp, 'agent'); fs.mkdirSync(agentDir, { recursive: true });
const agent = { id: 'a1', name: 'yazar', dir: agentDir };

// Previous-window state written straight to the storage file:
// w1 3-step workflow — step0 done (output on disk), step1 was RUNNING (cut).
// w2 parallel group — steps 0+1 both RUNNING (cut).
// adhoc media run — workflow NOT in store (runMediaAdhoc pattern).
// plain task RUNNING (not a workflow member).
const doneOut = path.join(outputs, 'prev.md');
fs.writeFileSync(doneOut, '# t\n\n- meta\n\n---\nadım çıktısı burda\n\n---\nFinished: x\n', 'utf8');
const runningOut = path.join(outputs, 'cut.md');
fs.writeFileSync(runningOut, '# cut\n\n---\nyarım kalan\n', 'utf8');
const store = {
    tasks: [
        { id: 't0', agentId: 'a1', agentName: 'yazar', title: 'W1 1/3: hazırla', prompt: 'p', mode: 'headless', status: 'done', createdAt: 1, endedAt: 2, outputFile: doneOut, workflowId: 'w1', workflowRunId: 'run1', stepIndex: 0 },
        { id: 't1', agentId: 'a1', agentName: 'yazar', title: 'W1 2/3: yaz', prompt: 'p', mode: 'headless', status: 'running', createdAt: 3, startedAt: 4, outputFile: runningOut, workflowId: 'w1', workflowRunId: 'run1', stepIndex: 1 },
        { id: 'p0', agentId: 'a1', agentName: 'yazar', title: 'W2 1/2: dal A', prompt: 'p', mode: 'headless', status: 'running', createdAt: 5, startedAt: 6, workflowId: 'w2', workflowRunId: 'run2', stepIndex: 1 },
        { id: 'p1', agentId: 'a1', agentName: 'yazar', title: 'W2 2/2: dal B', prompt: 'p', mode: 'headless', status: 'running', createdAt: 5, startedAt: 6, workflowId: 'w2', workflowRunId: 'run2', stepIndex: 0 },
        { id: 'm0', agentId: '', agentName: 'media', title: 'Ad-hoc: görsel', prompt: 'fal-ai/flux', mode: 'headless', status: 'running', createdAt: 7, startedAt: 8, workflowId: 'ghost', workflowRunId: 'run3', stepIndex: 0 },
        { id: 'x0', agentId: 'a1', agentName: 'yazar', title: 'Düz iş', prompt: 'p', mode: 'headless', status: 'running', createdAt: 9, startedAt: 10 }
    ],
    schedules: [], templates: [], triggers: [],
    workflows: [
        { id: 'w1', title: 'Rapor Zinciri', steps: [
            { agentId: 'a1', agentName: 'yazar', title: 'hazırla', prompt: 'a', mode: 'headless' },
            { agentId: 'a1', agentName: 'yazar', title: 'yaz', prompt: 'önceki: {prev_text}', mode: 'headless' },
            { agentId: 'a1', agentName: 'yazar', title: 'bitir', prompt: 'c', mode: 'headless' }
        ] },
        { id: 'w2', title: 'Paralel', steps: [
            { agentId: 'a1', agentName: 'yazar', title: 'dal A', prompt: 'a', mode: 'headless', parallel: true },
            { agentId: 'a1', agentName: 'yazar', title: 'dal B', prompt: 'b', mode: 'headless', parallel: true }
        ] }
    ]
};
fs.writeFileSync(storage, JSON.stringify(store), 'utf8');

const mgr = new TaskManager(storage, () => [agent], () => false, () => '', {
    quotaCheck: () => 'test hold' // resume creates tasks but nothing actually spawns
});

// -- load-time states --
const t1 = mgr.tasks.find(t => t.id === 't1');
check('interrupted workflow task → cancelled', t1.status === 'cancelled' && !!t1.endedAt);
check('interrupted note appended to archive', /Interrupted: the VS Code window closed/.test(fs.readFileSync(runningOut, 'utf8')));
check('done task untouched', mgr.tasks.find(t => t.id === 't0').status === 'done');
check('plain running task → queued (old behavior)', mgr.tasks.find(t => t.id === 'x0').status === 'queued');
check('adhoc media task → cancelled too', mgr.tasks.find(t => t.id === 'm0').status === 'cancelled');

// -- interruptedRuns: ghost workflow filtered, parallel keeps earliest step --
const runs = mgr.interruptedRuns();
check('two resumable runs (ghost adhoc excluded)', runs.length === 2 && !runs.some(r => r.runId === 'run3'));
const r1 = runs.find(r => r.runId === 'run1');
check('run1 points at step 2', r1 && r1.stepIndex === 1 && r1.stepTitle === 'yaz' && r1.workflowTitle === 'Rapor Zinciri');
const r2 = runs.find(r => r.runId === 'run2');
check('parallel run resumes from earliest step', r2 && r2.stepIndex === 0);

// -- resume run1: new step-1 task with handoff from step-0 output --
const before = mgr.tasks.length;
mgr.resumeInterrupted('run1');
const resumed = mgr.tasks.slice(before).find(t => t.workflowRunId === 'run1' && t.stepIndex === 1);
check('resume creates fresh step task on same run', !!resumed && resumed.status === 'queued');
check('handoff rebuilt from previous done step', !!resumed && resumed.prompt.includes('adım çıktısı burda'));
check('resumed run cleared from the offer list', mgr.interruptedRuns().length === 1);

// -- resume run2: parallel group re-fans both branches --
const before2 = mgr.tasks.length;
mgr.resumeInterrupted('run2');
const branches = mgr.tasks.slice(before2).filter(t => t.workflowRunId === 'run2');
check('parallel resume re-fans the whole group', branches.length === 2 &&
    branches.some(t => t.stepIndex === 0) && branches.some(t => t.stepIndex === 1));

// -- dismiss --
mgr.dismissInterrupted();
check('dismiss clears everything', mgr.interruptedRuns().length === 0);
mgr.resumeInterrupted('run1');
check('resume after dismiss is a no-op', mgr.tasks.length === before2 + 2);

// -- B9: interrupted task archived away (MAX_TASKS overflow) → resume falls back to coordinates --
const storage3 = path.join(tmp, 'farm-tasks3.json');
fs.writeFileSync(storage3, JSON.stringify({
    ...store,
    tasks: store.tasks.filter(t => ['t0', 't1'].includes(t.id))
        .map(t => t.id === 't1' ? { ...t, status: 'running' } : t)
}), 'utf8');
const mgr3 = new TaskManager(storage3, () => [agent], () => false, () => '', { quotaCheck: () => 'hold' });
check('B9 setup: run detected', mgr3.interruptedRuns().length === 1);
mgr3.tasks = mgr3.tasks.filter(t => t.id !== 't1'); // simulate archive drop
const b9Before = mgr3.tasks.length;
mgr3.resumeInterrupted('run1');
const b9Task = mgr3.tasks.slice(b9Before).find(t => t.workflowRunId === 'run1' && t.stepIndex === 1);
check('B9: resume works without the task, from stored coordinates', !!b9Task);
check('B9: handoff rebuilt from disk on fallback path', !!b9Task && b9Task.prompt.includes('adım çıktısı burda'));
mgr3.dispose();

// -- second load: no double-detection (statuses already final) --
mgr.dispose();
const mgr2 = new TaskManager(storage, () => [agent], () => false, () => '', { quotaCheck: () => 'hold' });
check('reload after save → nothing newly interrupted', mgr2.interruptedRuns().length === 0);
mgr2.dispose();

console.log(`\n${pass} passed, ${fail} failed`);
Module._load = origLoad;
process.exit(fail ? 1 : 0);
