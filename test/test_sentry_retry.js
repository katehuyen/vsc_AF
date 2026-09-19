// X-312 — A SENTRY ROUND IS REOPENED BY ITS CAMPAIGN, NEVER BY THE RETRY POLICY.
//
// Measured in X-309's fire drill (scenario 1, campaign `sc-mu3psbkz`): a round
// opened on a pool account, met a WEEKLY wall and ended `failed`. The task
// layer then retried it by itself, and the retry escaped the campaign in both
// directions at once:
//
//   · OUT OF THE POOL. The retry's account came from `carryOnAccount`, which
//     ranks every captured sign-in on the machine and has never heard of a
//     campaign pool. The work carried on to an account the user had fenced OUT,
//     and spent it all night.
//   · OFF THE LEDGER. `runExtras` carries a run's DIMENSIONS and not its
//     lineage, so the retry was born without `sentryOf`. The campaign went on
//     counting two rounds, saw nothing come out of them and stopped on the
//     failure brake — while the retry it could not see was writing to the
//     project and closing backlog items.
//
// Narrowing the handover to the pool would have fixed the first half and left
// the second, so the whole reopening decision goes back to the one place that
// owns it. The campaign's own next round IS the retry: a fresh reading of the
// backlog, on an account `campaignPick` chose. This is the same rule the
// watchdog already states for the round that goes quiet (X-178), asked now of
// every ending rather than one of them.
//
// What is pinned here, and why each one is a separate claim:
//   · the gate holds on the real door (`finish`), not only on the helper;
//   · the campaign is still driven, or the rule would trade a rogue retry for a
//     round that nobody ever reopens — which is worse;
//   · the gate is NARROW: an ordinary headless run still retries, and still
//     carries on to a sign-in with room. X-226 is untouched;
//   · and the ROOT CAUSE is pinned directly, so a later change to `runExtras`
//     cannot quietly make this file's reasoning obsolete without failing.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');

// ---- fake vscode (the test_account_handover.js pattern) ----
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

const { TaskManager, runExtras } = require(path.join(ROOT, 'out/core/tasks.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const HOUR = 3600_000;
const NOW = Date.now();

// The two sign-ins of the measured case: the pool account that hit the wall,
// and the emptier one OUTSIDE the pool that the escaped retry ran on.
const at = (id, pct) => ({
    slotId: id, engine: 'claude', percent: pct, state: 'ok', resetsAt: NOW + HOUR
});
const USAGE = [at('pool-a', 100), at('outsider', 4)];

// The wall the round actually met. A weekly limit, not a five-hour one — the
// exact output that started this.
const WALL = 'Claude usage limit reached. You\'ve hit your weekly limit · resets 6:59pm';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-sentry-retry-'));
const agentDir = path.join(tmp, 'agent');
fs.mkdirSync(agentDir, { recursive: true });
const agent = { id: 'a1', name: 'developer', dir: agentDir };

const drives = [];
const mk = (name) => new TaskManager(
    path.join(tmp, name + '.json'), () => [agent], () => false, () => '', {
        isRunner: () => true,
        // holds every launch, so no real process is ever spawned
        quotaCheck: () => 'test hold',
        limitResetAt: () => Date.now() + 4 * HOUR,
        measuredAccounts: () => USAGE,
        sentryTick: (t) => drives.push(t ? t.id : '(poll)'),
        // X-226 (round 2) — the handover is opt-in; this suite opts the
        // ordinary run in, so the sentry's refusal is measured against a run
        // that WOULD have moved.
        defaultRetry: () => ({ max: 3, delayMin: 40, when: 'limit', resetAware: true, carryOn: '@emptiest' })
    });

/** Put the given output on a row's own file, exactly as the runner leaves it. */
const withOutput = (m, t, out) => {
    t.outputFile = path.join(tmp, t.id + '.out.txt');
    fs.writeFileSync(t.outputFile, out, 'utf8');
    t.status = 'running';
    t.startedAt = Date.now() - 60_000;
    t.autoStart = false;
    return t;
};

// ===========================================================================
// 1) THE MEASURED CASE — a round walled on a pool account
// ===========================================================================
{
    const m = mk('round');
    m.startSentryCampaign({ project: 'p1', agent: 'developer', pool: ['pool-a'] });
    const round = withOutput(m, m.openSentryRound(agent, {
        code: 'P-1', round: 1, title: 'Sentry R1 · P-1', prompt: 'go', slotId: 'pool-a'
    }), WALL);
    drives.length = 0;

    // The real door, not the helper: this is how a run that ended arrives.
    m.finish(round, 'failed');

    const spawned = m.tasks.filter(x => x.id !== round.id);
    ok('‼️ X-312 — a sentry round that hit the wall opens NO retry of its own',
        !spawned.some(x => x.retryOf === round.id));
    ok('‼️ …so nothing of the campaign\'s is handed to a sign-in outside its pool',
        !spawned.some(x => x.account === 'outsider'));
    ok('‼️ …and no row is born that the campaign cannot see (no `sentryOf`, no ledger)',
        !spawned.some(x => !x.sentryOf));
    ok('…the round\'s own record says which rule stopped the retry, not silence',
        (round.events || []).some(e => /no retry/.test(String(e.note || ''))
            && /campaign/.test(String(e.note || ''))));
    ok('‼️ …and the campaign IS driven, so the work is reopened rather than dropped',
        drives.includes(round.id));
    m.dispose();
}

// ===========================================================================
// 2) THE ROOT CAUSE, PINNED — lineage does not travel with the dimensions
// ===========================================================================
{
    // `runExtras` is the shape a retry inherits (X-227). It carries what a run
    // RUNS AS and deliberately not what it BELONGS TO — which is correct, and
    // is exactly why a retry of a round could never have been a round. If this
    // ever changes, the reasoning above needs rewriting, so it fails here.
    const ex = runExtras({
        engine: 'claude', model: 'haiku', account: 'pool-a',
        sentryOf: 'sc-1', roundOf: 'P-1'
    });
    ok('‼️ X-312 — `runExtras` carries the account but never the campaign lineage',
        ex.account === 'pool-a' && ex.sentryOf === undefined);
}

// ===========================================================================
// 3) THE GATE IS NARROW — an ordinary run is untouched (X-226 still holds)
// ===========================================================================
{
    const m = mk('ordinary');
    // Same campaign on the board, so the only difference between this row and
    // the round above is the one field the gate reads.
    m.startSentryCampaign({ project: 'p1', agent: 'developer', pool: ['pool-a'] });
    const t = withOutput(m, m.addTask(agent, 'gece', 'iş', 'headless', { account: 'pool-a' }), WALL);
    drives.length = 0;

    m.finish(t, 'failed');

    const row = m.tasks.find(x => x.retryOf === t.id);
    ok('an ordinary headless run that met the same wall is still retried',
        !!row && row.retryAttempt === 1);
    ok('‼️ …and, having opted in (carryOn: @emptiest), still carries on to the sign-in with room — X-226 is untouched',
        !!row && row.account === 'outsider');
    // The campaign's ordinary poll still happens on this beat (`pump` asks it
    // on every tick); what must NOT happen is this row arriving as a ROUND.
    ok('…and it reaches the campaign as nothing, because it is not one of its rounds',
        !drives.includes(t.id));
    m.dispose();
}

// ===========================================================================
// 4) THE OTHER HALF OF THE SAME NIGHT — whose turn closed the item
// ===========================================================================
//
// The escaped retry closed P-1 through `projects.backlog.check`, and the stamp
// landed on a DIFFERENT session of the same agent: `[closed:: 2145c0a0#3]`
// pointed a reader at a transcript where nothing of the sort happened.
// `attributeTrack` ranks the agent's live sessions and takes the freshest,
// which is a coin toss whenever two are alive — and the wrong row looks exactly
// as certain as a right one.
//
// The caller already says who it is: X-310 put `from.sessionId` in every bridge
// envelope, read from what the CLI published to its own children. Both doors
// into the ledger were throwing it away. `callerSession` lives inside
// `activate()` and cannot be imported, so the wiring is read off the source —
// the same way `test_account_handover.js` pins `carryOnAccount`'s one call.
{
    const src = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    /** One registered op's block, from its name to the start of the next one. */
    const opBlock = (op) => {
        const at = src.indexOf(`op: '${op}'`);
        if (at < 0) { return ''; }
        const next = src.indexOf('op: \'', at + 8);
        return src.slice(at, next < 0 ? src.length : next);
    };
    for (const op of ['projects.backlog.check', 'projects.track']) {
        const body = opBlock(op);
        ok(`‼️ X-312 — \`${op}\` takes the caller the bridge handed it`,
            /handler:\s*\(args,\s*from\)/.test(body));
        ok(`‼️ …and stamps the ledger with it rather than guessing at a live session`,
            /callerSession\(args,\s*from\)/.test(body)
            && !/session:\s*optStr\(args,\s*'session'\)/.test(body));
    }
    // And the helper prefers what the caller SAID over what its environment
    // published — naming a session is a deliberate answer to this question.
    const helper = src.slice(src.indexOf('const callerSession ='));
    ok('‼️ …an explicit `session` argument still wins over the environment',
        /optStr\(args, 'session'\) \|\| String\(from\?\.sessionId/.test(helper.slice(0, 300)));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
