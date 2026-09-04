// X-178 — THE WATCHDOG ON A REAL BOARD.
//
// `sentryWatch.ts` decides; this is the half that carries it out, and every
// claim here is about the MANAGER: which beat asks the question, what ending a
// stalled round is recorded as, and — the one that matters most — that ending
// it does NOT end the campaign.
//
//   · ‼️ FAILED, NEVER CANCELLED. Cancelling the round the sentry is running is
//     the USER saying stop, and the driver reads it that way and switches the
//     campaign off. A watchdog that used that door would end the night it
//     exists to save. Failed is a barren round, so three stalls in a row still
//     hit the failure brake.
//   · ‼️ AND NOT RETRIED. The row a retry would re-run is the row that went
//     quiet, with the same prompt into the same parked prompt — and it would
//     hold the campaign for another watchdog period while it did it.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');

// ---- fake vscode (the same shim every TaskManager test uses) ----
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

const MIN = 60 * 1000;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-sentry-watch-'));
const agentDir = path.join(tmp, 'agent');
fs.mkdirSync(agentDir, { recursive: true });
const agent = { id: 'a1', name: 'developer', dir: agentDir };

const announced = [];
const drives = [];
/** A board with a campaign running and one round on it, quiet for `quietMin`. */
function board(quietMin, o) {
    const opts = o || {};
    const storage = path.join(tmp, `farm-${Math.random().toString(36).slice(2)}.json`);
    const mgr = new TaskManager(storage, () => [agent], () => false, () => '', {
        // holds every launch, so no real process is ever spawned
        quotaCheck: () => 'test hold',
        sentryStallMin: () => (opts.limitMin === undefined ? 45 : opts.limitMin),
        sentryTick: (t) => drives.push(t ? t.id : '(poll)'),
        announce: (n) => announced.push(n),
        defaultRetry: () => ({ max: 3, delayMin: 1 })
    });
    mgr.startSentryCampaign({ project: 'p1', agent: 'developer' });
    const row = mgr.openSentryRound(agent, {
        code: 'X-178', round: 1, title: 'Sentry R1 · X-178', prompt: 'go'
    });
    // The state the watchdog exists for: a session that started, printed the
    // permission question and then nothing. The output file's own mtime is the
    // heartbeat, so it is stamped as far back as the case being drawn.
    const out = path.join(tmp, `${row.id}.out.txt`);
    fs.writeFileSync(out, 'waiting for permission…', 'utf8');
    const quiet = Date.now() - quietMin * MIN;
    fs.utimesSync(out, new Date(quiet), new Date(quiet));
    row.status = 'running';
    row.startedAt = quiet;
    row.outputFile = out;
    row.autoStart = false;
    return { mgr, row };
}

// ---- a round that went quiet is ended, and the campaign lives -------------
{
    const { mgr, row } = board(90);
    announced.length = 0; drives.length = 0;
    mgr.pump();

    ok('a round that has said nothing for longer than the limit is ended',
        row.status === 'failed');
    ok('‼️ ...as FAILED, never cancelled — cancelled is the user hand and would stop the campaign',
        row.status !== 'cancelled' && mgr.sentry.status === 'running');
    ok('...and the reason is on the row, so the morning reader does not have to guess',
        (row.events || []).some(e => /watchdog/.test(String(e.note || ''))));
    ok('‼️ ...the user is told rather than finding a stopped campaign in the morning',
        announced.some(n => /^sentry-stall:/.test(n.key) && /nothing has come out/.test(n.body)));
    ok('...and the campaign is driven, so the next round opens on the same beat',
        drives.includes(row.id));
    ok('‼️ ...and nothing is RETRIED: a retry would re-run the row that went quiet',
        !mgr.tasks.some(t => t.id !== row.id && /retry/i.test(t.title)));
}

// ---- and a round that is working is left alone ---------------------------
{
    const { mgr, row } = board(2);
    announced.length = 0;
    mgr.pump();
    ok('a round that printed something two minutes ago is left alone',
        row.status === 'running' && !announced.length);
}

// ---- the switch ----------------------------------------------------------
{
    const { mgr, row } = board(900, { limitMin: 0 });
    mgr.pump();
    ok('‼️ a limit of 0 switches the watchdog off — nothing is ended however long the silence',
        row.status === 'running');
}

// ---- a paused campaign is not policed ------------------------------------
{
    const { mgr, row } = board(90);
    mgr.holdSentryCampaign(true);
    announced.length = 0;
    mgr.pump();
    ok('a paused campaign holds its round rather than having it killed underneath it',
        row.status === 'running' && !announced.length);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
