// M-7/M-8 — A TASK KEEPS ITS OWN RECORD, AND A CEILING THAT HOLDS IT SAYS SO.
//
// The complaint these tests are written from: a scheduled run whose time came
// and went, a row that said "parked" and never said why, a toast that announced
// "scheduled task started" for a run that had not started, and a ✕ that dropped
// the only route a HAND takes with no way back. Every one of those is a fact the
// manager knew at the moment it decided, so every one of them is asserted here
// at the moment it is decided — not through the page that draws it.
//
// Fakes the vscode module via Module._load so the compiled TaskManager loads
// (the test_lifecycle.js pattern).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');

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

const { TaskManager, noteTaskEvent, TASK_EVENTS_MAX } =
    require(path.join(ROOT, 'out/core/tasks.js'));

let pass = 0, fail = 0;
const check = (name, cond) => {
    if (cond) { pass++; } else { fail++; console.log('  FAIL ' + name); }
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-ev-'));
const agentDir = path.join(tmp, 'agent'); fs.mkdirSync(agentDir, { recursive: true });
const agent = { id: 'a1', name: 'developer', dir: agentDir };
const agents = () => [agent];
const kinds = t => (t.events || []).map(e => e.kind);
const mk = (name, opts) =>
    new TaskManager(path.join(tmp, name + '.json'), agents, () => false, () => '', opts);

// ---------------------------------------------------------------- the record
{
    const m = mk('rec', { quotaCheck: () => 'test hold' });

    const byHand = m.addTask(agent, 'elle', 'iş', 'headless');
    check('a task is born with a line saying so', kinds(byHand).join() === 'created');
    check('…and the line says WHO made it — the one fact the id cannot give back later',
        byHand.events[0].note === 'by you');

    const fromSched = m.addTask(agent, 'gece', 'iş', 'headless', { fromSchedule: 's1' });
    check('a schedule\'s task says a schedule made it', fromSched.events[0].note === 'by a schedule');
    const fromWf = m.addTask(agent, 'adım', 'iş', 'headless', { workflowId: 'w1', stepIndex: 1 });
    check('…a workflow step says which step', fromWf.events[0].note === 'by a workflow (step 2)');

    // the whole point: the ORDER survives, where three timestamps could not
    m.startTask(byHand);                      // quota holds → parked
    check('a held launch is written down', kinds(byHand).join() === 'created,parked');
    check('…with the ceiling that held it, in its own words',
        byHand.events[1].note === 'test hold');
    m.startTask(byHand);
    check('‼️ the same reason twice is ONE line — a 30s pump must not bury the transitions',
        kinds(byHand).join() === 'created,parked');

    m.cancelTask(byHand);
    check('cancelling closes the record', kinds(byHand).join() === 'created,parked,cancelled');

    m.dispose();
}

// ------------------------------------------------------------- the cap holds
{
    const t = { id: 'x', events: [] };
    for (let i = 0; i < TASK_EVENTS_MAX + 15; i++) { noteTaskEvent(t, 'parked', 'n' + i); }
    check('a task ping-ponging against a ceiling cannot grow without bound',
        t.events.length === TASK_EVENTS_MAX);
    check('…and it is the NEWEST that survive — the old ones are the ones nobody reads',
        t.events[t.events.length - 1].note === 'n' + (TASK_EVENTS_MAX + 14));
}

// --------------------------------------------------- "run it whatever it costs"
//
// Asked of `launchBlock`, which is where the decision is made. Going through
// `startTask` would answer the question by SPAWNING the run it lets through —
// a real process, in a test, on the machine of whoever runs the suite.
{
    const m = mk('budget', { budgetCheck: () => 'daily budget spent (developer: $4.10 of $4.00)' });
    const normal = m.addTask(agent, 'normal', 'iş', 'headless');
    const waived = m.addTask(agent, 'mutlaka', 'iş', 'headless', { ignoreBudget: true });
    // ‼️ M-11 — launchBlock answers with {code, reason}: the sentence for the
    // reader, the code for the dedupe. See the block at the end of this file.
    check('the budget is a brake: a plain task stops at it',
        /daily budget spent/.test(m.launchBlock(normal).reason));
    check('‼️ a task marked "run it whatever the budget says" walks through it',
        m.launchBlock(waived) === undefined);
    m.dispose();

    // the quota guard protects the PLAN WINDOW and the concurrency limits
    // protect the MACHINE — neither is a number the user set about money
    const q = mk('quota', { quotaCheck: () => '5-hour quota guard', budgetCheck: () => 'budget' });
    check('…and the waiver is NARROW: the 5-hour quota guard still holds it',
        q.launchBlock(q.addTask(agent, 'kota', 'iş', 'headless', { ignoreBudget: true })).reason
        === '5-hour quota guard');
    q.dispose();

    const c = mk('conc', { maxConcurrent: () => 1, budgetCheck: () => 'budget' });
    c.tasks.push({
        id: 'busy', agentId: 'other', agentName: 'x', title: 'r', prompt: 'p',
        mode: 'headless', status: 'running', createdAt: Date.now()
    });
    check('…and so does this machine\'s own limit',
        /concurrency/.test(c.launchBlock(c.addTask(agent, 'eş', 'iş', 'headless', { ignoreBudget: true })).reason));
    c.dispose();
}

// --------------------------------------------- nobody is watching at 09:00
{
    const announced = [];
    const m = mk('announce', { quotaCheck: () => 'daily budget spent', announce: n => announced.push(n) });

    m.startTask(m.addTask(agent, 'elle', 'iş', 'headless'));
    check('a task a HAND parked says nothing on the board — the user is looking at it',
        !announced.length);

    const sched = m.addTask(agent, 'sabah13', 'raporu yaz', 'headless', { fromSchedule: 's9' });
    m.startTask(sched);
    check('‼️ an UNATTENDED run that could not start puts it on the board',
        announced.length === 1 && /did not start/.test(announced[0].title));
    // ‼️ M-11 — the key is task : park EPISODE : blocker CODE. A check that
    // returns a bare sentence (as this one does) is its own code, which is the
    // pre-M-11 behaviour kept on purpose; the episode number is what tells a
    // second park apart from the first.
    check('…keyed on the task, the park and the blocker, so a 30-second pump cannot repeat it',
        announced[0].key === 'task-parked:' + sched.id + ':1:daily budget spent');
    check('…and it says what to do about it, not only that it happened',
        /run even if the budget is spent/.test(announced[0].body)
        && /not waivable/.test(announced[0].body));
    check('…at the level an unattended hold deserves', announced[0].level === 3);
    m.startTask(sched);
    check('…and it is said once', announced.length === 1);
    m.dispose();
}

// ------------------------------------- M-7 (V3): the pump keeps the reason
// current, and a CHANGED ceiling is news again
{
    const announced = [];
    let block = 'concurrency: 2 running';
    const m = mk('blockchange', {
        quotaCheck: () => block, announce: n => announced.push(n),
        isRunner: () => true
    });
    const t = m.addTask(agent, 'sabah13', 'raporu yaz', 'headless', { fromSchedule: 's9' });
    m.startTask(t);
    check('‼️ the first ceiling is on the record', t.deferredReason === 'concurrency: 2 running'
        && t.events.filter(e => e.kind === 'parked').length === 1);
    m.pump();
    check('…and the pump does not repeat an unchanged one',
        t.events.filter(e => e.kind === 'parked').length === 1 && announced.length === 1);
    block = 'fleet daily budget spent ($388.91 of $300.00)';
    m.pump();
    check('‼️ …but a DIFFERENT ceiling replaces the reason on the row',
        t.deferredReason === 'fleet daily budget spent ($388.91 of $300.00)');
    check('…writes a second line on its record',
        t.events.filter(e => e.kind === 'parked').length === 2);
    check('…and is announced again, keyed on the new blocker', announced.length === 2
        && announced[1].key === 'task-parked:' + t.id + ':1:' + block);
    m.dispose();
}

// ---------------------------------------------------------------------------
// ‼️ M-11 — THE DOLLAR FIGURE MOVES; THE PARK DOES NOT.
//
// 3.129.0 keyed the notice on `task-parked:<id>:<deferredReason>`, and the
// fleet-budget reason quotes today's spend — "$388.91 of $300.00". Every cent
// anything on the farm spent therefore produced a NEW key: a fresh level-3
// notice and a fresh `parked` event, about one ceiling that had not moved.
//
// The three rules, in order: a moved figure is not news · a different KIND of
// blocker is · and the same blocker after a release is news again, because that
// is a second park and not a continuation of the first.
// ---------------------------------------------------------------------------
{
    const announced = [];
    let answer = { code: 'budget:fleet', reason: 'fleet daily budget spent ($388.91 of $300.00)' };
    const m = mk('m11', {
        quotaCheck: () => answer, announce: n => announced.push(n), isRunner: () => true
    });
    const t = m.addTask(agent, 'gece raporu', 'yaz', 'headless', { fromSchedule: 's9' });
    m.startTask(t);
    const parks = () => t.events.filter(e => e.kind === 'parked').length;
    check('the first park is one event and one notice',
        parks() === 1 && announced.length === 1);
    check('‼️ …and the notice key carries the CODE, never the money',
        announced[0].key === 'task-parked:' + t.id + ':1:budget:fleet'
        && !/388/.test(announced[0].key));
    check('…while the row shows the money', t.deferredReason === answer.reason);

    // The figure ticks up — the exact case from the item.
    answer = { code: 'budget:fleet', reason: 'fleet daily budget spent ($389.02 of $300.00)' };
    m.pump();
    check('‼️ $388.91 → $389.02 is NOT a new park event',
        parks() === 1);
    check('‼️ …and NOT a new notice', announced.length === 1);
    check('…but the row and its hover follow the money',
        t.deferredReason === 'fleet daily budget spent ($389.02 of $300.00)');
    check('…and the blocker is still the blocker', t.deferredCode === 'budget:fleet');

    // A different KIND of ceiling is a different fact.
    answer = { code: 'concurrency:fleet', reason: 'concurrency: 2 running' };
    m.pump();
    check('‼️ concurrency after budget IS a second event and a second notice',
        parks() === 2 && announced.length === 2
        && announced[1].key === 'task-parked:' + t.id + ':1:concurrency:fleet');

    // Released, then caught by the same ceiling again — a NEW park episode.
    answer = undefined;
    t.notBefore = Date.now() + 60_000;   // stop the pump from spawning a real process
    m.pump();
    t.notBefore = undefined;
    check('a release clears both halves of the hold',
        t.deferredCode === undefined || t.deferredCode.indexOf('wait:') === 0);
    // Clear the clock-park the line above left behind, so the next block is the
    // first of a genuinely new episode.
    t.deferredCode = undefined; t.deferredReason = undefined;
    const before = t.parkEpisode;
    answer = { code: 'concurrency:fleet', reason: 'concurrency: 2 running' };
    m.pump();
    check('‼️ the SAME ceiling after a release is a new park episode',
        t.parkEpisode === before + 1);
    check('…so it is news again, under a key that says which park it is',
        announced.length === 3
        && announced[2].key === 'task-parked:' + t.id + ':' + t.parkEpisode + ':concurrency:fleet');
    m.dispose();
}

// ---------------------- M-3 (V3): the retry decision is ONE store write, and
// its own clock is not announced as a ceiling
{
    const announced = [];
    const m = mk('retryatomic', { announce: n => announced.push(n), isRunner: () => true });
    let writes = 0;
    const realWrite = m.writeStore.bind(m);
    m.writeStore = t => { writes++; return realWrite(t); };
    const t = m.addTask(agent, 'gece', 'iş', 'headless',
        { retry: { max: 2, delayMin: 5, when: 'any' } });
    t.status = 'failed'; t.endedAt = Date.now();
    writes = 0;
    announced.length = 0;
    m.maybeScheduleRetry(t);
    const row = m.tasks.find(x => x.retryOf === t.id);
    check('‼️ the failed run and the retry it made land in ONE store write',
        !!row && writes === 1);
    check('…the original says it retried', t.events.some(e => e.kind === 'retried'));
    check('…and the new row is parked on its own clock',
        row.status === 'queued' && row.notBefore > Date.now()
        && /^waiting until /.test(row.deferredReason));
    check('‼️ …which is NOT announced as a run that could not start', !announced.length);
    m.dispose();
}

// M-3 (V3): a retry the policy asked for but nothing could make says so
{
    const m = mk('retrynoagent', { isRunner: () => true });
    const t = m.addTask(agent, 'gece', 'iş', 'headless',
        { retry: { max: 2, delayMin: 5, when: 'any' } });
    t.agentId = 'gone';
    t.status = 'running';
    m.finish(t, 'failed');
    check('‼️ a retry that could not be made is written on the run, not swallowed',
        t.events.some(e => e.kind === 'finished' && /not in the fleet any more/.test(e.note || '')));
    check('…and no orphan row was created', !m.tasks.some(x => x.retryOf === t.id));
    m.dispose();
}

// ----------------------------------------- the toast tells the truth (M-7)
{
    const m = mk('fire', { budgetCheck: () => 'daily budget spent', announce: () => { } });
    const s = {
        id: 's1', agentId: 'a1', agentName: 'developer', title: 'sabah13',
        prompt: 'raporu yaz', mode: 'headless', kind: 'daily', hour: 9, minute: 0, enabled: true
    };
    m.schedules.push(s);
    const info0 = infoMsgs.length, warn0 = warnMsgs.length;
    m.fireSchedule(s, '2026-8-13', false);
    check('‼️ a run that was HELD is not announced as "started"',
        infoMsgs.length === info0 && warnMsgs.length === warn0 + 1);
    check('…the warning names the ceiling', /could NOT start/.test(warnMsgs[warnMsgs.length - 1])
        && /daily budget spent/.test(warnMsgs[warnMsgs.length - 1]));
    const last = m.automationLog[m.automationLog.length - 1];
    check('…and the automation log stops recording a clean "fired" over the top of it',
        last.outcome === 'fired' && /HELD: daily budget spent/.test(last.reason));

    // Run Now is the same event with a person in front of it — same honesty
    const warn1 = warnMsgs.length;
    m.runScheduleNow(s);
    const now = m.automationLog[m.automationLog.length - 1];
    check('Run Now says it too, rather than logging a fired run that never began',
        /HELD/.test(now.reason) && warnMsgs.length === warn1 + 1);
    m.dispose();
}

// ------------------------------------------------- a deleted row is filed (M-8)
{
    const m = mk('del', { quotaCheck: () => 'hold' });
    const t = m.addTask(agent, 'yanlışlıkla', 'iş', 'headless');
    const outFile = path.join(tmp, 'out.md');
    fs.writeFileSync(outFile, 'output');
    t.outputFile = outFile;
    t.status = 'done'; t.endedAt = Date.now();

    const removed = m.deleteTask(t);
    check('the row leaves the board', !m.tasks.some(x => x.id === t.id));
    check('…and comes back as the caller\'s undo', removed && removed.id === t.id);

    const month = new Date(t.createdAt);
    const file = path.join(m.historyDir,
        `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}.jsonl`);
    check('‼️ …and it is FILED, not burned — the one deletion a hand makes was the only one that was not',
        fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes(t.id));

    check('restoring puts it back', m.restoreTasks([removed]) === 1
        && m.tasks.some(x => x.id === t.id));
    check('…without a dead "output" button, because that file went with the row',
        !m.tasks.find(x => x.id === t.id).outputFile);
    check('…and a second press cannot duplicate the row', m.restoreTasks([removed]) === 0
        && m.tasks.filter(x => x.id === t.id).length === 1);
    m.dispose();
}

// ------------------------------------------- a retry is another one of the same
{
    const m = mk('retry', { quotaCheck: () => 'hold' });
    const t = m.addTask(agent, 'iş', 'p', 'headless', { ignoreBudget: true });
    t.status = 'failed'; t.endedAt = Date.now();
    const again = m.retryTask(t);
    check('a retry carries the budget waiver — the original would not have run without it',
        again.ignoreBudget === true);
    check('…and says in its own record which run it is a retry of',
        kinds(again).includes('retried') && /attempt 1 of "iş"/.test(again.events.find(e => e.kind === 'retried').note));
    check('a retry can drop the waiver when the form says so',
        m.retryTask(t, undefined, { ignoreBudget: false }).ignoreBudget === false);
    m.dispose();
}

// ---------------------------------------- M-8 (reopened): the runs that were
// already there get a history too, and the archive stops double-counting
{
    const { migrateTaskEvents } = require(path.join(ROOT, 'out/core/tasks.js'));
    const base = {
        id: 't1', agentId: 'a', agentName: 'yazar', title: 'iş', prompt: 'p',
        status: 'queued', mode: 'headless', createdAt: 1000
    };

    const parked = Object.assign({}, base, { deferredReason: 'fleet daily budget spent ($388.91 of $300.00)' });
    check('‼️ M-8: a task made before the log existed still gets one',
        migrateTaskEvents(parked) && kinds(parked).join() === 'created,parked');
    check('‼️ …and it carries the ceiling that is holding it RIGHT NOW — the thing being asked about',
        parked.events[1].note.includes('daily budget'));
    check('‼️ …and every rebuilt line SAYS it was rebuilt, because it is not a witness',
        parked.events.every(e => e.migrated === true));

    const ran = Object.assign({}, base, {
        status: 'done', startedAt: 2000, endedAt: 5000, fromSchedule: 's1'
    });
    migrateTaskEvents(ran);
    check('…a run that finished gets its three moments in order',
        kinds(ran).join() === 'created,started,finished'
        && ran.events[0].ts === 1000 && ran.events[2].ts === 5000);
    check('…and where it came from is the one thing the timestamps cannot say',
        ran.events[0].note === 'queued — a schedule');
    const stopped = Object.assign({}, base, { status: 'cancelled', endedAt: 5000 });
    migrateTaskEvents(stopped);
    check('…a cancelled run says cancelled, not "finished — cancelled"',
        kinds(stopped).join() === 'created,cancelled');

    // Idempotent: a task that HAS a record is never rewritten, so this can run
    // on every load and the first save makes it permanent.
    const witnessed = Object.assign({}, base, { events: [{ ts: 9, kind: 'created' }] });
    check('‼️ …and a task that already has a record is left exactly as it was',
        migrateTaskEvents(witnessed) === false && witnessed.events.length === 1);

    // The manager does it on load, once, for the tasks it finds in the store.
    const store = path.join(tmp, 'mig.json');
    fs.writeFileSync(store, JSON.stringify({
        tasks: [Object.assign({}, base, { id: 'old', status: 'done', endedAt: 4000 })]
    }), 'utf8');
    const m2 = new TaskManager(store, agents, () => false, () => '', {});
    check('‼️ M-8: loading the store rebuilds the records it finds without one',
        kinds(m2.tasks[0]).join() === 'created,finished');
    const written = JSON.parse(fs.readFileSync(store, 'utf8'));
    check('…and the runner window writes them down, so it happens once',
        (written.tasks[0].events || []).length === 2);
    m2.dispose();
}

// ---------------------------------------- M-8/M-9: delete, undo, and the file
{
    const m = mk('arch', {});
    const t = m.addTask(agent, 'silinecek', 'iş', 'headless');
    t.status = 'done'; t.endedAt = Date.now();
    m.deleteTask(t);
    check('‼️ M-9: a deleted run is readable again, as a task and not as a file',
        m.archivedTasks().filter(x => x.id === t.id).length === 1);
    check('…and the month it went into is named', m.archivedMonths.length === 1);

    m.restoreTasks([t]);
    check('‼️ M-8: Undo takes it back OUT of the archive — it is on the live list again',
        m.archivedTasks().filter(x => x.id === t.id).length === 0
        && m.tasks.some(x => x.id === t.id));

    m.deleteTask(m.tasks.find(x => x.id === t.id));
    check('‼️ …and deleting it a second time files it once, not twice',
        m.archivedTasks().filter(x => x.id === t.id).length === 1);
    m.dispose();
}

// ------------------------------------------------ the window that cannot fire
{
    const follower = mk('follower', { isRunner: () => false });
    check('‼️ a window that does not run the queue can SAY so — it was silent before',
        follower.runsTheQueue === false);
    const leader = mk('leader', {});
    check('…and the one that does says that', leader.runsTheQueue === true);
    follower.dispose(); leader.dispose();
}

// ---------------------------------------------------------------------------
// ‼️ M-3 (reopened) — A RETRY IS A ROW ON THE BOARD, NOT A CLOSURE IN A TIMER.
//
// It was a `setTimeout` holding the whole decision: nothing existed anywhere
// for forty minutes, and closing the window in between threw the retry away in
// silence while the failed task's own record already said "retried". The
// default policy spans four hours, so that was the ordinary case, not the edge.
// ---------------------------------------------------------------------------
{
    const m = mk('retrywait', {});
    const t = m.addTask(agent, 'düşecek', 'iş', 'headless', {
        ignoreBudget: true, retry: { max: 2, delayMin: 5, when: 'any' }
    });
    t.status = 'running'; t.startedAt = Date.now();
    m.finish(t, 'failed');

    const again = m.tasks.find(x => x.retryOf === t.id);
    check('‼️ M-3: the retry exists the moment the failure does — in the queue, on the board',
        !!again && again.status === 'queued' && again.retryAttempt === 1);
    check('…carrying the moment it may start, so the 30s pump is the timer',
        !!again && again.notBefore > Date.now() && again.notBefore <= Date.now() + 5 * 60_000 + 1000);
    check('…and it survives a reload, because it is in the store and not in a closure',
        JSON.parse(fs.readFileSync(path.join(tmp, 'retrywait.json'), 'utf8'))
            .tasks.some(x => x.retryOf === t.id && x.notBefore > 0));
    check('‼️ …the row SAYS it is waiting, and says until when',
        /^waiting until /.test(again.deferredReason || '') && again.autoStart === true);
    check('…its record says a retry made it — nobody pressed anything',
        /by the retry policy \(attempt 1\)/.test((again.events[0] || {}).note || ''));
    check('…and the clock is what is holding it: nothing launched',
        again.status === 'queued' && !m.tasks.some(x => x.status === 'running'));

    // The clock, and only the clock — with the moment past, the run is free.
    again.notBefore = Date.now() - 1000;
    check('‼️ …and once the moment passes nothing holds it any more',
        m.launchBlock(again) === undefined);
    check('a run that never asked to wait is not held', m.launchBlock(t) === undefined);
    m.dispose();
}

// ---------------------------------------------------------------------------
// M-8 (V2) — THE THREE WAYS A DELETION USED TO COME APART.
//
// Each of these is a real failure path with no test before: a follower window,
// a store that cannot be written, and a tombstone that cannot be appended. They
// are asserted on the FILES and the MEMORY together, because the whole
// complaint is that those two stopped agreeing with each other.
// ---------------------------------------------------------------------------

// 1. the follower window is refused at the door
{
    let warned = 0;
    const f = mk('fdel', { isRunner: () => false, onFollowerWrite: () => { warned++; } });
    const t = f.addTask(agent, 'takipçi', 'iş', 'headless');
    const outFile = path.join(tmp, 'fdel-out.md');
    fs.writeFileSync(outFile, 'output');
    t.outputFile = outFile;
    t.status = 'done'; t.endedAt = Date.now();

    // …from here, because making the task already tried (and was refused) a save
    const before = warned;
    let threw = '';
    try { f.deleteTask(t); } catch (e) { threw = String(e); }
    check('‼️ M-8: a follower window REFUSES the delete instead of half-doing it',
        /runs the task queue/.test(threw));
    check('…the row is still there', f.tasks.some(x => x.id === t.id));
    check('‼️ …and the output file it used to delete BEFORE noticing is still there',
        fs.existsSync(outFile));
    check('…nothing was filed in the archive for a deletion that did not happen',
        f.archivedTasks().filter(x => x.id === t.id).length === 0);
    check('…and the user was told why, once', warned === before + 1);

    let undo = '';
    try { f.restoreTasks([t]); } catch (e) { undo = String(e); }
    check('…an undo is refused the same way rather than looking like a dead button',
        /runs the task queue/.test(undo));
    f.dispose();
}

// 2. the store cannot be written — the archive is rolled back and NOTHING moves
{
    const store = path.join(tmp, 'wfail.json');
    const m = mk('wfail', {});
    const t = m.addTask(agent, 'yazılamaz', 'iş', 'headless');
    const outFile = path.join(tmp, 'wfail-out.md');
    fs.writeFileSync(outFile, 'output');
    t.outputFile = outFile;
    t.status = 'done'; t.endedAt = Date.now();

    // A directory where the atomic write wants its temp file: writeFileSync
    // fails, deterministically, on every platform.
    fs.mkdirSync(store + '.tmp', { recursive: true });
    let threw = '';
    try { m.deleteTask(t); } catch (e) { threw = String(e); }
    fs.rmSync(store + '.tmp', { recursive: true, force: true });

    check('‼️ M-8: a store that cannot be written FAILS THE DELETE — it was swallowed',
        /task list could not be written/.test(threw));
    check('…the row is still in memory, so the screen and the disk still agree',
        m.tasks.some(x => x.id === t.id));
    check('‼️ …and its output survives, because the unlink is the LAST step now',
        fs.existsSync(outFile));
    check('‼️ …and the archive does not claim a deletion that never happened',
        m.archivedTasks().filter(x => x.id === t.id).length === 0);

    // and with the obstruction gone it goes through cleanly
    const gone = m.deleteTask(m.tasks.find(x => x.id === t.id));
    check('…the same press works once the disk does', gone.id === t.id
        && !m.tasks.some(x => x.id === t.id)
        && m.archivedTasks().filter(x => x.id === t.id).length === 1
        && !fs.existsSync(outFile));
    m.dispose();
}

// 3. undo puts the row back, but the tombstone cannot be written — and it SAYS so
{
    const drifts = [];
    const m = mk('drift', { onArchiveDrift: msg => drifts.push(msg) });
    const t = m.addTask(agent, 'geri al', 'iş', 'headless');
    t.status = 'done'; t.endedAt = Date.now();
    const removed = m.deleteTask(t);

    const month = new Date(t.createdAt);
    const file = path.join(m.historyDir,
        `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}.jsonl`);
    // The month file becomes a directory: the record is archived, the tombstone
    // that would take it back cannot be appended.
    fs.rmSync(file, { force: true });
    fs.mkdirSync(file, { recursive: true });
    const back = m.restoreTasks([removed]);
    fs.rmSync(file, { recursive: true, force: true });

    check('‼️ M-8: the run itself is safe — undo is not failed by a broken archive',
        back === 1 && m.tasks.some(x => x.id === t.id));
    check('‼️ …and the divergence is SAID, where it used to be a console.warn',
        drifts.length === 1 && /still lists them as deleted/.test(drifts[0]));

    // ‼️ M-8 (V3) — …AND THEN IT IS FIXED. A locked month file is a moment, not
    // a verdict, so the failed tombstone is queued and retried rather than left
    // as a permanent divergence maintained by a warning nobody can act on.
    check('the failed tombstone is kept, not thrown away',
        m.archiveRepair.length === 1 && m.archiveRepair[0].id === t.id);
    check('…and it survives a restart — a restart is often what clears the disk',
        mk('drift').archiveRepair.length === 1);
    m.pumpArchiveRepair();
    check('‼️ …the retry writes it once the disk allows it', !m.archiveRepair.length);
    check('…and the user is TOLD it healed, so the earlier warning is taken back',
        drifts.length === 2 && /agrees with the board again/.test(drifts[1]));
    check('…the archive really does list the row as live again',
        m.archivedTasks().filter(x => x.id === t.id).length === 0);
    m.dispose();
}

Module._load = origLoad;
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
