// M-21 — WHAT A RUN IS AFTER THE WINDOW THAT STARTED IT HAS GONE.
//
// ‼️ WHY THIS FILE EXISTS. A VS Code reload is not a rare event — an extension
// update is one, and the user installs a build every few minutes. Every task
// that is `running` at that moment has to be given a state by hand, because the
// process handle that would have told us is gone with the host. There are three
// different right answers and the store cannot tell them apart by itself:
//
//   · an OS terminal OUTLIVES the extension host, so its run is still going
//     and its exit file is still the file it always was — it is picked back up;
//   · a Console session is a process THIS host spawned and read over a pipe, so
//     it died with the host and can never report again;
//   · a plain headless run died with its host too, and goes back on the queue.
//
// The failure this pins was measured, not reasoned about: the sweep that
// decides all three runs inside `load()`, which is called from the FIRST line
// of the constructor — so the re-arm sitting a few lines below it never saw a
// single `running` task with an exit file. An interactive run in a Windows
// Terminal came back as `queued` with `autoStart` already cleared by its own
// launch, which means nothing on this earth relaunches it, while the terminal
// finished the work minutes later into an exit file nobody was reading.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');

// ---- fake vscode (the manager only touches windows and emitters here) ----
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
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-reload-'));
const agentDir = path.join(tmp, 'agent');
fs.mkdirSync(agentDir, { recursive: true });
const agents = () => [{ id: 'a1', name: 'yazar', dir: agentDir }];

/** Write a store as a window that died mid-run would have left it, then open a
 *  new manager on it — which is exactly what a reload does. */
function reload(tasks, opts) {
    const dir = fs.mkdtempSync(path.join(tmp, 'w-'));
    const storage = path.join(dir, 'farm-tasks.json');
    fs.writeFileSync(storage, JSON.stringify({ tasks }), 'utf8');
    const mgr = new TaskManager(storage, agents, () => false, () => '', opts || {});
    return { mgr, storage, dir };
}

const base = {
    agentId: 'a1', agentName: 'yazar', prompt: 'hi', status: 'running',
    createdAt: Date.now() - 60_000, startedAt: Date.now() - 50_000,
    // ‼️ NO `autoStart` ON PURPOSE — `launch()` clears it before it spawns, so
    // this is what every task that actually ran carries. A test that sets it
    // would be measuring a state no launched run is ever in.
    events: [{ ts: Date.now() - 50_000, kind: 'started', note: 'interactive' }]
};
const kinds = t => (t.events || []).map(e => e.kind);

// ---------- the OS terminal: still going, still watched ----------
{
    const exitFile = path.join(tmp, 'ext.exit');
    const { mgr } = reload([{
        ...base, id: 't-ext', title: 'in the OS terminal', mode: 'interactive',
        interactiveTarget: 'external', interactiveClose: 'stay-open', exitFile
    }]);
    const t = mgr.tasks[0];
    ok('an OS-terminal run is still running after the reload', t.status === 'running');
    ok('…and keeps the moment it started, because it never stopped', !!t.startedAt);
    ok('…and the watch is armed on it, which is the whole point',
        mgr.externalWatch instanceof Set && mgr.externalWatch.has('t-ext'));
    ok('…and the row says it was picked back up, not started again',
        kinds(t).includes('resumed') && !kinds(t).includes('parked')
        && kinds(t).filter(k => k === 'started').length === 1);
    // The failure in full: `queued` + no autoStart is a row nothing relaunches.
    ok('…so it is NOT sitting on a queue nothing pumps',
        !(t.status === 'queued' && !t.autoStart));
    mgr.dispose();
}

// ---------- the exit file that was already written while we were away ----------
{
    const exitFile = path.join(tmp, 'ext-done.exit');
    fs.writeFileSync(exitFile, '4\r\n', 'utf8');
    const { mgr } = reload([{
        ...base, id: 't-done', title: 'finished while the window was shut',
        mode: 'interactive', interactiveTarget: 'external', exitFile
    }]);
    // The 2s watch tick is the manager's own; drive it once directly so the
    // test measures the reading, not the clock.
    mgr.pumpExternalWatch();
    const t = mgr.tasks[0];
    ok('a run that ended while the window was shut is read off its exit file',
        t.status === 'failed');
    ok('…with the code the terminal actually reported',
        (t.events || []).some(e => e.kind === 'finished' && /exited with 4/.test(e.note || '')));
    mgr.dispose();
}

// ---------- the Console: the session died with the host ----------
{
    const { mgr } = reload([{
        ...base, id: 't-con', title: 'in the Console', mode: 'interactive',
        interactiveTarget: 'console', interactiveClose: 'auto-close',
        consoleSessionId: 'sess-9'
    }]);
    const t = mgr.tasks[0];
    ok('a Console-hosted run goes back on the queue', t.status === 'queued');
    // ‼️ The id is the trap: kept, the row offers a conversation whose process
    // this host has no map entry for and can never resume.
    ok('…and its dead session id goes with the session', !t.consoleSessionId);
    ok('…and the row says why', (t.events || []).some(
        e => e.kind === 'parked' && /Console card it was hosted in went with it/.test(e.note || '')));
    ok('…and no timer is left watching a session that can never answer',
        !mgr.tasks.some(x => x.status === 'running' && x.consoleSessionId));
    mgr.dispose();
}

// ---------- a plain headless run: back on the queue, and it says so ----------
{
    const { mgr } = reload([{
        ...base, id: 't-plain', title: 'a headless run', mode: 'headless',
        events: [{ ts: Date.now() - 50_000, kind: 'started', note: 'headless' }]
    }]);
    const t = mgr.tasks[0];
    ok('a headless run cut by the window close is queued again', t.status === 'queued');
    ok('…and the reason is on its record, not only in the status',
        (t.events || []).some(e => e.kind === 'parked' && /window closed mid-run/.test(e.note || '')));
    // ‼️ M-8 — the `started` line keeps its own timestamp, so clearing
    // `startedAt` does not erase the fact that the run happened.
    ok('…and the run it already had is still in its history',
        kinds(t).includes('started') && !t.startedAt);
    mgr.dispose();
}

// ---------- a workflow member is still cancelled, and still resumable ----------
{
    const { mgr } = reload([{
        ...base, id: 't-step', title: 'step 2', mode: 'headless',
        workflowId: 'w1', workflowRunId: 'run1', stepIndex: 1
    }]);
    const t = mgr.tasks[0];
    ok('a workflow member cut mid-run is cancelled, not queued', t.status === 'cancelled');
    ok('…and it gets exactly one reason, not two',
        !(t.events || []).some(e => e.kind === 'parked'));
    mgr.dispose();
}

// ---------- what the page can draw ----------
{
    // ‼️ A KIND THE PAGE HAS NO WORD FOR PRINTS ITS OWN NAME. `EVENT_WORD` is
    // the whole vocabulary of the timeline, and adding a kind to the core
    // without adding it there degrades silently to the raw identifier.
    const tasksTs = fs.readFileSync(path.join(ROOT, 'src', 'core', 'tasks.ts'), 'utf8');
    const pageJs = fs.readFileSync(path.join(ROOT, 'media', 'tasksPage.js'), 'utf8');
    const union = /export type TaskEventKind =([\s\S]*?);/.exec(tasksTs);
    const declared = union ? [...union[1].matchAll(/'([a-z]+)'/g)].map(m => m[1]) : [];
    const wordBlock = /const EVENT_WORD = \{([\s\S]*?)\};/.exec(pageJs);
    const worded = wordBlock ? [...wordBlock[1].matchAll(/(\w+)\s*:/g)].map(m => m[1]) : [];
    ok('every event kind is declared', declared.length >= 7);
    ok('every event kind the core can write has a word on the page',
        declared.length > 0 && declared.every(k => worded.includes(k)));
    ok('…and the page invents none the core cannot write',
        worded.length > 0 && worded.every(k => declared.includes(k)));
}

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* windows */ }
Module._load = origLoad;
console.log(`test_task_reload: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
