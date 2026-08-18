// Ad-hoc tests for Dalga 2 task lifecycle (retry / resume / priority / dedup) — 2.18.0.
// Fakes the vscode module via Module._load so the compiled TaskManager loads.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const ROOT = require('path').resolve(__dirname, '..');

// ---- fake vscode ----
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
    if (cond) { pass++; console.log('  ok  ' + name); }
    else { fail++; console.log('FAIL  ' + name); }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-life-'));
const storage = path.join(tmp, 'farm-tasks.json');
const agentDir = path.join(tmp, 'agent'); fs.mkdirSync(agentDir, { recursive: true });
const agent = { id: 'a1', name: 'yazar', dir: agentDir };
const agents = () => [agent];

// quotaCheck always holds → startTask defers instead of spawning a real process.
const mgr = new TaskManager(storage, agents, () => false, () => '', {
    quotaCheck: () => 'test hold'
});

// ---- 1. queuedDuplicate ----
const t1 = mgr.addTask(agent, 'İş', 'raporu   yaz', 'headless');
check('dedup: finds identical queued (whitespace-normalized)', mgr.queuedDuplicate('a1', ' raporu yaz ') === t1);
check('dedup: different prompt → none', !mgr.queuedDuplicate('a1', 'başka iş'));
check('dedup: different agent → none', !mgr.queuedDuplicate('a2', 'raporu yaz'));

// ---- 2. retryTask (standalone) ----
t1.status = 'done'; t1.endedAt = Date.now();
const r1 = mgr.retryTask(t1);
check('retry: fresh copy queued', r1 && r1.status === 'queued' && r1.id !== t1.id);
check('retry: (retry 1) title + attempt 1', /\(retry 1\)$/.test(r1.title) && r1.attempt === 1);
check('retry: same prompt copied', r1.prompt === t1.prompt);
check('retry: original untouched', t1.status === 'done');
r1.status = 'failed'; r1.endedAt = Date.now();
const r2 = mgr.retryTask(r1);
check('retry: suffix does not stack, bumps to (retry 2)', /İş \(retry 2\)$/.test(r2.title) && r2.attempt === 2);
const r3 = mgr.retryTask(t1, 'düzeltilmiş prompt');
check('retry-edit: uses the edited prompt', r3.prompt === 'düzeltilmiş prompt');
// ‼️ M-14 — AN EMPTY STRING IS NOT "NOT STATED", AND THE MERGE CANNOT TELL.
// `newPrompt ?? task.prompt` keeps '' because '' is not nullish, so a caller
// that hands over an empty string gets a task with NO prompt — which OpenCode
// refuses outright ("You must provide a message or a command") and other
// engines spend a run on. Found by actually running a bridge retry. The rule is
// enforced at the caller (`extension.ts` — `optStr(...) || undefined`); this
// pins the behaviour it has to protect against, so a future merge that starts
// treating '' as absent does not quietly make that guard look unnecessary.
const rEmpty = mgr.retryTask(t1, '');
check('retry: an EMPTY prompt really does win over the original — the caller must '
    + 'fold blank into absent, because this merge cannot', rEmpty.prompt === '');
const rAbsent = mgr.retryTask(t1, undefined);
check('retry: undefined is what "not stated" looks like here', rAbsent.prompt === t1.prompt);

// ---- 3. runTaskNext + priority ----
const q1 = mgr.addTask(agent, 'A', 'a', 'headless');
const q2 = mgr.addTask(agent, 'B', 'b', 'headless');
const q3 = mgr.addTask(agent, 'C', 'c', 'headless');
mgr.runTaskNext(q3);
check('runNext: bumps priority above peers', (q3.priority ?? 0) > (q1.priority ?? 0) && (q3.priority ?? 0) > (q2.priority ?? 0));
check('runNext: nextQueuedFor returns the bumped task', mgr.nextQueuedFor('a1') === q3);
check('runNext: no-op on non-queued', (() => { const before = q3.priority; q3.status = 'running'; mgr.runTaskNext(q3); q3.status = 'queued'; return q3.priority === before; })());

// ---- 4. priority aging (via nextQueuedFor, same comparator as pump) ----
const mgr2 = new TaskManager(path.join(tmp, 'f2.json'), agents, () => false, () => '', { quotaCheck: () => 'hold' });
const aged = mgr2.addTask(agent, 'Old', 'old', 'headless');
const fresh = mgr2.addTask(agent, 'New', 'new', 'headless');
aged.createdAt = Date.now() - 91 * 60_000; // ~3 aging points
fresh.priority = 1; fresh.createdAt = Date.now();
check('aging: an old low-prio task overtakes a fresh prio-1 task', mgr2.nextQueuedFor('a1') === aged);

// ---- 5. resumeWorkflowFromTask ----
const w = mgr.addWorkflow('W', [
    { agentId: 'a1', agentName: 'yazar', title: 'topla', prompt: 'topla', mode: 'headless' },
    { agentId: 'a1', agentName: 'yazar', title: 'özetle', prompt: 'kullan: {prev_text}', mode: 'headless' }
]);
// step0 done, with an archived output the resume must feed forward
const outFile = path.join(tmp, 'step0.md');
fs.writeFileSync(outFile, '# W 1/2\n\n- Agent: yazar\n\n---\n\nRESULT-XYZ\n\n---\nFinished: now · exit 0 · 1 min\n');
mgr.tasks.push({
    id: 'step0', agentId: 'a1', agentName: 'yazar', title: 'W 1/2: topla', prompt: 'topla',
    mode: 'headless', status: 'done', createdAt: Date.now() - 1000, endedAt: Date.now() - 500,
    workflowId: w.id, workflowRunId: 'run1', stepIndex: 0, outputFile: outFile
});
const failedStep1 = {
    id: 'step1', agentId: 'a1', agentName: 'yazar', title: 'W 2/2: özetle', prompt: 'kullan: {prev_text}',
    mode: 'headless', status: 'failed', createdAt: Date.now(), endedAt: Date.now(),
    workflowId: w.id, workflowRunId: 'run1', stepIndex: 1
};
mgr.tasks.push(failedStep1);
const before = mgr.tasks.length;
mgr.resumeWorkflowFromTask(failedStep1);
const resumed = mgr.tasks.find(t => t.workflowRunId === 'run1' && t.stepIndex === 1 && t.status === 'queued' && t.id !== 'step1');
check('resume: new task created at the same step of the same run', !!resumed && mgr.tasks.length === before + 1);
check('resume: previous step output fed into the handoff', resumed && /RESULT-XYZ/.test(resumed.prompt));
check('resume: keeps workflow identity', resumed && resumed.workflowId === w.id && resumed.stepIndex === 1);

// resume via retryTask on a workflow-step task routes to resume (no standalone copy)
const before2 = mgr.tasks.length;
mgr.retryTask(failedStep1);
const added = mgr.tasks.length - before2;
check('retry on workflow-step routes to resume (one new step task, no (retry) copy)',
    added === 1 && !mgr.tasks.some(t => /özetle \(retry/.test(t.title)));

// ---- 5b. M-14: the handoff is the ANSWER, not the transcript ----
// ‼️ On Claude the archived body IS the answer, so `{prev_text}` could be the
// body itself. OpenCode's archive is deliberately the engine's own JSONL event
// stream, so that same line handed the next step a wall of `step_start` /
// `tool_use` / `step_finish` objects with the answer buried in one of them.
// Measured on a real two-step chain before it was fixed. The lines below are
// real output from that run, trimmed — a hand-written shape would not have
// caught it, because the bug was that the shape was never read at all.
{
    const oc = [
        '{"type":"step_start","timestamp":1,"sessionID":"ses_x","part":{"type":"step-start"}}',
        '{"type":"tool_use","timestamp":2,"sessionID":"ses_x","part":{"type":"tool","tool":"read",'
        + '"state":{"status":"completed","input":{"filePath":"kanit.txt"},"output":"ZARFIL-M14"}}}',
        '{"type":"text","timestamp":3,"sessionID":"ses_x","part":{"type":"text","text":"ZARFIL-M14"}}',
        '{"type":"step_finish","timestamp":4,"sessionID":"ses_x","part":{"type":"step-finish",'
        + '"reason":"stop","tokens":{"total":10,"input":8,"output":2,"cache":{"read":0,"write":0}},"cost":0}}'
    ].join('\n');
    const ocFile = path.join(tmp, 'oc-step0.md');
    fs.writeFileSync(ocFile, `# OC 1/2\n\n- Agent: yazar\n\n---\n\n${oc}\n\n---\nFinished: now · exit 0 · 0 min\n`);
    const w2 = mgr.addWorkflow('OC', [
        { agentId: 'a1', agentName: 'yazar', title: 'oku', prompt: 'oku', mode: 'headless', engine: 'opencode' },
        { agentId: 'a1', agentName: 'yazar', title: 'ilet', prompt: 'al: {prev_text}', mode: 'headless', engine: 'opencode' }
    ]);
    mgr.tasks.push({
        id: 'oc0', agentId: 'a1', agentName: 'yazar', title: 'OC 1/2: oku', prompt: 'oku',
        mode: 'headless', status: 'done', engine: 'opencode',
        createdAt: Date.now() - 1000, endedAt: Date.now() - 500,
        workflowId: w2.id, workflowRunId: 'ocrun', stepIndex: 0, outputFile: ocFile
    });
    const ocFail = {
        id: 'oc1', agentId: 'a1', agentName: 'yazar', title: 'OC 2/2: ilet', prompt: 'al: {prev_text}',
        mode: 'headless', status: 'failed', engine: 'opencode', createdAt: Date.now(), endedAt: Date.now(),
        workflowId: w2.id, workflowRunId: 'ocrun', stepIndex: 1
    };
    mgr.tasks.push(ocFail);
    mgr.resumeWorkflowFromTask(ocFail);
    const next = mgr.tasks.find(t => t.workflowRunId === 'ocrun' && t.stepIndex === 1
        && t.status === 'queued' && t.id !== 'oc1');
    check('M-14: an OpenCode step hands the next one the ANSWER',
        !!next && next.prompt === 'al: ZARFIL-M14');
    check('‼️ M-14: …and NOT the JSONL event stream it was archived as',
        !!next && !/step_finish|"type":"tool"|sessionID/.test(next.prompt));

    // ‼️ …AND THE SAME FAULT ON ANTIGRAVITY. `agy --output-format json` prints
    // ONE envelope and the answer is `response`; the generic unwrap knows only
    // `result` (Claude's word), so the whole envelope — id, status, timings —
    // used to travel as `{prev_text}`. Found by reading every archive on this
    // machine, which is a cheaper measurement than running the engine again.
    const agyEnv = JSON.stringify({
        conversation_id: 'd0d65360-326c-4935-a209-94171b00edc3', status: 'SUCCESS',
        response: 'ZARFIL-M14', duration_seconds: 21.85, num_turns: 1, usage: { input: 10, output: 2 }
    });
    const agyFile = path.join(tmp, 'agy-step0.md');
    fs.writeFileSync(agyFile, `# AGY 1/2\n\n- Agent: yazar\n\n---\n\n${agyEnv}\n\n---\nFinished: now · exit 0 · 0 min\n`);
    const w3 = mgr.addWorkflow('AGY', [
        { agentId: 'a1', agentName: 'yazar', title: 'oku', prompt: 'oku', mode: 'headless', engine: 'agy' },
        { agentId: 'a1', agentName: 'yazar', title: 'ilet', prompt: 'al: {prev_text}', mode: 'headless', engine: 'agy' }
    ]);
    mgr.tasks.push({
        id: 'agy0', agentId: 'a1', agentName: 'yazar', title: 'AGY 1/2: oku', prompt: 'oku',
        mode: 'headless', status: 'done', engine: 'agy',
        createdAt: Date.now() - 1000, endedAt: Date.now() - 500,
        workflowId: w3.id, workflowRunId: 'agyrun', stepIndex: 0, outputFile: agyFile
    });
    const agyFail = {
        id: 'agy1', agentId: 'a1', agentName: 'yazar', title: 'AGY 2/2: ilet', prompt: 'al: {prev_text}',
        mode: 'headless', status: 'failed', engine: 'agy', createdAt: Date.now(), endedAt: Date.now(),
        workflowId: w3.id, workflowRunId: 'agyrun', stepIndex: 1
    };
    mgr.tasks.push(agyFail);
    mgr.resumeWorkflowFromTask(agyFail);
    const agyNext = mgr.tasks.find(t => t.workflowRunId === 'agyrun' && t.stepIndex === 1
        && t.status === 'queued' && t.id !== 'agy1');
    check('M-14: an Antigravity step hands the next one `response`, not the envelope',
        !!agyNext && agyNext.prompt === 'al: ZARFIL-M14');
    check('‼️ M-14: …so no conversation id, status or timing rides along as if it were the answer',
        !!agyNext && !/conversation_id|SUCCESS|duration_seconds/.test(agyNext.prompt));
}

// resume at first step → empty handoff, no crash
const failedStep0 = {
    id: 'step0b', agentId: 'a1', agentName: 'yazar', title: 'W 1/2: topla', prompt: 'topla',
    mode: 'headless', status: 'failed', createdAt: Date.now(), endedAt: Date.now(),
    workflowId: w.id, workflowRunId: 'run2', stepIndex: 0
};
mgr.tasks.push(failedStep0);
mgr.resumeWorkflowFromTask(failedStep0);
check('resume: first step resumes with empty handoff',
    mgr.tasks.some(t => t.workflowRunId === 'run2' && t.stepIndex === 0 && t.status === 'queued' && t.id !== 'step0b'));

// deleted workflow → graceful warning, no throw
const orphan = { id: 'o1', agentId: 'a1', agentName: 'yazar', title: 'X', prompt: 'x', mode: 'headless',
    status: 'failed', createdAt: Date.now(), workflowId: 'gone', workflowRunId: 'r', stepIndex: 0 };
mgr.tasks.push(orphan);
const warnsBefore = warnMsgs.length;
mgr.resumeWorkflowFromTask(orphan);
check('resume: missing workflow warns, does not throw', warnMsgs.length === warnsBefore + 1);

// ---- N. which tasks the window's active project speaks for ----
// A task carries the project it was created under, and that project's context
// goes into its system prompt. The stamp is only honest for a task A PERSON just
// made: a schedule firing at 03:00, a trigger, a retry minutes later — nobody
// was looking at the window then, and telling an unattended run "work on this
// project and record what you did in its worklog" is worse than telling it
// nothing.
{
    const pstore = path.join(tmp, 'farm-tasks-proj.json');
    let active = 'prj_alpha';
    const pm = new TaskManager(pstore, agents, () => false, () => '', {
        quotaCheck: () => 'test hold',
        activeProjectId: () => active
    });

    const byHand = pm.addTask(agent, 'elle', 'iş', 'headless');
    check('project: a task made by hand takes the window\'s active project',
        byHand.projectId === 'prj_alpha');

    // the retry must not follow the window somewhere else
    byHand.status = 'failed'; byHand.endedAt = Date.now();
    active = 'prj_beta';
    const again = pm.retryTask(byHand);
    check('project: a retry keeps the ORIGINAL\'s project, not whatever is active now',
        again.projectId === 'prj_alpha');

    // and a retry of a projectless task must not acquire one
    const orphanTask = pm.addTask(agent, 'projesiz', 'iş2', 'headless', { projectId: undefined });
    check('project: an explicit "no project" beats the window stamp', !orphanTask.projectId);
    orphanTask.status = 'failed'; orphanTask.endedAt = Date.now();
    check('project: retrying a projectless task does not give it one',
        !pm.retryTask(orphanTask).projectId);

    // a schedule fires from a timer — see fireSchedule
    const sched = {
        id: 's1', title: 'gece taraması', prompt: 'tara', mode: 'headless', agentId: 'a1',
        kind: 'daily', at: '03:00', enabled: true
    };
    pm.schedules.push(sched);
    pm.runScheduleNow(sched);
    const fired = pm.tasks.find(t => t.fromSchedule === 's1');
    check('‼️ project: a schedule\'s task gets NO project, whatever the window shows',
        !!fired && !fired.projectId);

    pm.dispose();
}

// ---- B-4: an exact place in the queue, and releasing a held run ----
// Both gestures existed only under a pointer: the tree moved a row one step and
// the page released a park inline, so neither could be asked for by instruction.
{
    const mstore = path.join(tmp, 'farm-tasks-move.json');
    const mm = new TaskManager(mstore, agents, () => false, () => '', { quotaCheck: () => 'test hold' });
    const a = mm.addTask(agent, 'A', 'a', 'headless');
    const b = mm.addTask(agent, 'B', 'b', 'headless');
    const c = mm.addTask(agent, 'C', 'c', 'headless');
    const d = mm.addTask(agent, 'D', 'd', 'headless');
    const queue = () => mm.tasks.filter(t => t.status === 'queued').map(t => t.title).join('');

    check('move: the queue starts in the order it was filled', queue() === 'ABCD');
    check('move: to an exact place, and it reports where it landed', mm.moveTaskTo(d, 1) === 1 && queue() === 'ADBC');
    check('move: a place past the end means last, not an error', mm.moveTaskTo(a, 99) === 3 && queue() === 'DBCA');
    check('move: a negative place means first', mm.moveTaskTo(c, -5) === 0 && queue() === 'CDBA');
    check('move: the same place is a no-op', mm.moveTaskTo(c, 0) === 0 && queue() === 'CDBA');
    // ‼️ the one-step move is the SAME code now — the tree and the bridge
    // cannot drift into two orderings.
    mm.moveTask(b, -1);
    check('move: one step up is the same reorder', queue() === 'CBDA');
    mm.moveTask(c, -1);
    check('move: …and it stops at the top instead of wrapping', queue() === 'CBDA');
    b.status = 'running';
    check('move: a row that is no longer queued has no place', mm.moveTaskTo(b, 0) === -1);
    b.status = 'queued';

    // A held run: quotaCheck holds every launch, so this is the real park path.
    const held = mm.addTask(agent, 'HELD', 'h', 'headless');
    mm.startTask(held);
    check('park: a ceiling holds the launch and says which', held.status === 'queued'
        && held.autoStart === true && !!held.deferredCode);
    const episode = held.parkEpisode;
    const started = mm.unparkTask(held);
    check('unpark: it does not claim to have started when the ceiling is still there', started === false);
    check('‼️ unpark: the episode ENDS, so the same ceiling catching it again is news again',
        held.parkEpisode === episode + 1);
    check('unpark: and the row carries the current reason, not a stale one', !!held.deferredReason);
    held.status = 'done';
    check('unpark: a task that is not queued is left alone', mm.unparkTask(held) === false);

    mm.dispose();
}

mgr.dispose();
mgr2.dispose();
Module._load = origLoad;
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
