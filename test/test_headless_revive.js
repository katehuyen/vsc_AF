// B-03.8 — THE HEADLESS SIDE OF SURVIVING A RESTART OF THE EXTENSION HOST.
//
// ‼️ WHY THIS FILE EXISTS, IN THE USER'S OWN TERMS. The thing being built is
// "the agent restarts the host and, with nobody there, the work carries on".
// X-232 delivered that for a Console card and it was tested live and passed.
// The headless half was tested once and never got a verdict: the run died on a
// weekly plan limit before the restart could even be fired.
//
// When it was finally measured, what the headless side did was worse than the
// audit ledger recorded. The ledger said a cut run "goes back on the queue and
// the pump runs it again from the start". It does not: `launch()` clears
// `autoStart` before it spawns, and `pump()` only ever picks up rows that have
// it — so a run cut by a restart sits `queued` with `autoStart` false, which is
// a row NOTHING relaunches. The manager's own comment says exactly this about
// the terminal case ("nothing on this earth relaunches it"); the plain headless
// case had the same hole and a sentence addressed to a person instead — "press
// start to run it again" — which at three in the morning is nobody.
//
// So the two halves pinned here are:
//   (a) a cut run IS picked back up — in its own conversation, with the
//       continuation words, never the original prompt; and
//   (b) it happens ONLY when the restart asked for continuity, because
//       spawning CLI processes that spend money on every window reload is not
//       a default anybody chose.
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
const warnings = [];
const fakeVscode = {
    EventEmitter: FakeEmitter,
    Disposable: { from: () => ({ dispose() { } }) },
    window: {
        showInformationMessage: () => Promise.resolve(undefined),
        showWarningMessage: (m) => { warnings.push(m); return Promise.resolve(undefined); },
        createTerminal: () => ({ show() { }, sendText() { }, dispose() { } }),
        onDidCloseTerminal: () => ({ dispose() { } })
    }
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'vscode') { return fakeVscode; }
    return origLoad.call(this, request, parent, isMain);
};

const { TaskManager, REVIVE_MAX_ATTEMPTS } = require(path.join(ROOT, 'out/core/tasks.js'));
const { DEFAULT_CONTINUATION_PROMPT } = require(path.join(ROOT, 'out/core/retry.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-hrevive-'));
const agentDir = path.join(tmp, 'agent');
fs.mkdirSync(agentDir, { recursive: true });
const agents = () => [{ id: 'a1', name: 'yazar', dir: agentDir }];

/** ‼️ NOTHING IS EVER SPAWNED HERE. `launch` is the one thing this file must
 *  not do for real — it starts a CLI. It is replaced with a recorder, so what
 *  is measured is the DECISION and the row it was made on. */
function reload(tasks) {
    const dir = fs.mkdtempSync(path.join(tmp, 'w-'));
    const storage = path.join(dir, 'farm-tasks.json');
    fs.writeFileSync(storage, JSON.stringify({ tasks }), 'utf8');
    const mgr = new TaskManager(storage, agents, () => false, () => '', {});
    const launched = [];
    mgr.launch = function (task) {
        launched.push(task);
        task.status = 'running';
        task.startedAt = Date.now();
        return true;
    };
    return { mgr, launched, storage };
}

const base = {
    agentId: 'a1', agentName: 'yazar', prompt: 'count to 120', status: 'running',
    mode: 'headless', engine: 'claude', model: 'haiku', effort: 'low',
    createdAt: Date.now() - 60_000, startedAt: Date.now() - 50_000,
    // ‼️ NO `autoStart`, deliberately — `launch()` clears it before it spawns,
    // so this is the state every run that actually ran comes back in.
    runSessionId: 'sess-abc',
    events: [{ ts: Date.now() - 50_000, kind: 'started', note: 'headless' }]
};
const kinds = t => (t.events || []).map(e => e.kind);

// ---------- the hole, still open when nobody asked for continuity ----------
{
    const { mgr, launched } = reload([{ ...base, id: 't1', title: 'a long count' }]);
    const cut = mgr.tasks[0];
    ok('an ordinary reload still parks the run exactly as M-21 left it',
        cut.status === 'queued' && !cut.autoStart);
    // The failure in one line: this row is what nothing pumps.
    mgr.pump && mgr.pump();
    ok('‼️ …and the pump does NOT pick it up — the ledger said it did, and it does not',
        launched.length === 0);
    mgr.dispose();
}

// ---------- the restart that asked for continuity ----------
{
    const { mgr, launched, storage } = reload([{ ...base, id: 't1', title: 'a long count' }]);
    const out = mgr.reviveCutRuns();
    ok('a cut headless run is carried on', out.resumed.length === 1 && out.skipped.length === 0);
    ok('…and something was actually launched, not merely queued', launched.length === 1);
    // ‼️ A REGRESSION HERE MUST REPORT, NOT CRASH. Measured: dropping the line
    // in `load()` that remembers the cut rows makes `launched` empty, and every
    // assertion below then threw on `undefined` — so the suite died before it
    // could say which claim broke.
    const copy = launched[0] ?? {};
    ok('‼️ …in the run\'s OWN conversation — the id the launch binding wrote down',
        copy.resumeSessionId === 'sess-abc' && copy.resumedEngine === 'claude');
    ok('‼️ …with the CONTINUATION words, never the original prompt — the whole point',
        copy.prompt === DEFAULT_CONTINUATION_PROMPT && copy.prompt !== 'count to 120');
    ok('…and it says it was picked up, not that it failed three times',
        kinds(copy).includes('resumed') && !kinds(copy).includes('retried'));
    ok('…and the board does not call it a retry either',
        copy.title === 'a long count (continued)' && !/retry/i.test(copy.title));
    // ‼️ B-03.16 — AND THE ROW IT WAS CARRIED ON FROM SAYS SO. Nothing pinned
    // this half: the sweep writes "back on the queue, press start to run it
    // again" minutes before the carry-on is decided, and until B-03.17 nobody
    // went back and corrected it — so the row a person reads asked them to pay
    // for a second run of work that was already going on in the copy. A refusal
    // was written onto the row; a carry-on was not.
    const original = mgr.tasks.find(t => t.id === 't1') || {};
    const events = original.events || [];
    ok('‼️ …and the ORIGINAL row says it was carried on, instead of asking for a press',
        events.some(e => e.kind === 'resumed'
            && /carried on after the restart as "a long count \(continued\)"/.test(e.note || '')
            && /nothing to start here/.test(e.note || '')));
    ok('…and that is the LAST thing it says, so "press start" is not what a reader sees',
        !/press start to run it again/.test((events[events.length - 1] || {}).note || ''));
    // ‼️ …AND IT REACHED THE DISK. `save()` used to be called only when
    // something was SKIPPED, so the carry-on note lived in memory and the row
    // the next window read still asked for a press. The board is rebuilt from
    // this file, so a note that is not in it was never written.
    const onDisk = JSON.parse(fs.readFileSync(storage, 'utf8')).tasks
        .find(t => t.id === 't1') || {};
    ok('‼️ …and the note is in the file the board is rebuilt from, not only in memory',
        (onDisk.events || []).some(e => e.kind === 'resumed'
            && /carried on after the restart/.test(e.note || '')));
    // ‼️ A RESURRECTION IS ONLY AS HONEST AS ITS DIMENSIONS (consoleRevive's
    // rule, and the same one here): a run brought back on another engine or
    // model is a different run wearing the same name.
    ok('‼️ …and it runs the way the original ran',
        copy.engine === 'claude' && copy.model === 'haiku' && copy.effort === 'low'
        && copy.mode === 'headless');
    ok('…and the original row still says what happened to it',
        kinds(mgr.tasks[0]).includes('parked'));
    mgr.dispose();
}

// ---------- asked twice: the list describes ONE reload ----------
{
    const { mgr, launched } = reload([{ ...base, id: 't1', title: 'a long count' }]);
    mgr.reviveCutRuns();
    const again = mgr.reviveCutRuns();
    ok('‼️ asking a second time carries nothing on — the list is one reload\'s, not a standing offer',
        again.resumed.length === 0 && again.skipped.length === 0 && launched.length === 1);
    mgr.dispose();
}

// ---------- the three refusals, each with its reason on the row ----------
{
    // (1) the engine never named the session — there is nothing to resume BY
    const { mgr, launched } = reload([{ ...base, id: 't1', title: 'never bound', runSessionId: undefined }]);
    const out = mgr.reviveCutRuns();
    ok('a run whose session was never named is refused, not faked',
        out.resumed.length === 0 && out.skipped.length === 1 && launched.length === 0);
    ok('…and the reason names the engine and says it stays on the queue',
        /claude never named/.test(out.skipped[0]?.reason ?? '') && /stays on the queue/.test(out.skipped[0]?.reason ?? ''));
    ok('‼️ …and the reason is on the ROW, not only in a toast that disappears',
        (mgr.tasks[0].events || []).some(
            e => e.kind === 'parked' && /not carried on after the restart/.test(e.note || '')));
    ok('…and the row is still there to be started by hand', mgr.tasks[0].status === 'queued');
    mgr.dispose();
}
{
    // (2) the restart loop guard
    const { mgr, launched } = reload([{
        ...base, id: 't1', title: 'round and round', attempt: REVIVE_MAX_ATTEMPTS
    }]);
    const out = mgr.reviveCutRuns();
    ok('‼️ a run already picked up REVIVE_MAX_ATTEMPTS times is not spawned again',
        out.resumed.length === 0 && launched.length === 0
        && /restart loop/.test(out.skipped[0]?.reason ?? ''));
    ok('…and one attempt below the ceiling still comes back', (() => {
        const w = reload([{ ...base, id: 't2', title: 'nearly', attempt: REVIVE_MAX_ATTEMPTS - 1 }]);
        const r = w.mgr.reviveCutRuns();
        w.mgr.dispose();
        return r.resumed.length === 1;
    })());
    mgr.dispose();
}
{
    // (3) somebody got there first
    const { mgr, launched } = reload([{ ...base, id: 't1', title: 'started by hand' }]);
    mgr.tasks[0].status = 'running';
    const out = mgr.reviveCutRuns();
    ok('a run somebody already started is left alone',
        out.resumed.length === 0 && launched.length === 0
        && /not on the queue any more/.test(out.skipped[0]?.reason ?? ''));
    // ‼️ And NOT marked "not carried on" — that line under a live run would be
    // the board contradicting itself.
    ok('…and no refusal is written under a run that is live',
        !(mgr.tasks[0].events || []).some(e => /not carried on/.test(e.note || '')));
    mgr.dispose();
}

// ---------- what is NOT in scope, and stays that way ----------
{
    // A Console-hosted task: X-232 brings its CARD back, and the card is where
    // the conversation is. Spawning a headless copy of it as well would run the
    // same work twice.
    const { mgr, launched } = reload([{
        ...base, id: 't-con', title: 'in the Console', mode: 'interactive',
        interactiveTarget: 'console', consoleSessionId: 'sess-9'
    }]);
    const out = mgr.reviveCutRuns();
    ok('‼️ a Console-hosted run is NOT revived headlessly — its card is what comes back',
        out.resumed.length === 0 && out.skipped.length === 0 && launched.length === 0);
    mgr.dispose();
}
{
    // A workflow member keeps the decision that was taken deliberately: it is
    // cancelled and OFFERED to a person, because a resumed run spends money and
    // the chain behind it may already have moved on. Changing that is a
    // separate decision and is not made here.
    const { mgr, launched } = reload([{
        ...base, id: 't-step', title: 'step 2', workflowId: 'w1', workflowRunId: 'run1', stepIndex: 1
    }]);
    const out = mgr.reviveCutRuns();
    ok('a workflow step is still cancelled and offered, not silently resumed',
        mgr.tasks[0].status === 'cancelled' && out.resumed.length === 0 && launched.length === 0);
    mgr.dispose();
}
{
    // An OS terminal outlived the host — it never stopped, so there is nothing
    // to carry on.
    const exitFile = path.join(tmp, 'ext.exit');
    const { mgr, launched } = reload([{
        ...base, id: 't-ext', title: 'in the OS terminal', mode: 'interactive',
        interactiveTarget: 'external', interactiveClose: 'stay-open', exitFile
    }]);
    const out = mgr.reviveCutRuns();
    ok('a run still going in an OS terminal is not restarted underneath itself',
        mgr.tasks[0].status === 'running' && out.resumed.length === 0 && launched.length === 0);
    mgr.dispose();
}

// ---------- the wiring, read off the source ----------
{
    // ‼️ THE DECISION THIS PINS IS "WHEN", AND IT LIVES IN extension.ts. A test
    // that only proved the manager can revive would leave the one thing the
    // user actually asked about — that an ordinary reload does NOT spawn
    // anything — resting on a comment.
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('the revive is asked for only on a restart that carried the resume intent',
        /const askedForResume = Array\.isArray\(stamp\?\.revive\);/.test(ext)
        && /askedForResume\s*\n?\s*\?\s*taskManager\.reviveCutRuns\(\)/.test(ext));
    ok('…and the intent is written ONLY when the restart said resume',
        /writeRestartStamp\(kind, resume \? planRevive\(consoleHost\.list\(\)\) : undefined\)/.test(ext));
    ok('…and what came back is reported to the reader, not done in silence',
        /headless run\(s\) carried on/.test(ext));
}

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* windows */ }
Module._load = origLoad;
console.log(`test_headless_revive: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
