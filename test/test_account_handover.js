// X-226 — A RUN THAT HIT THE WALL DOES NOT SLEEP WHILE ANOTHER SIGN-IN IS FREE.
//
// The X-211 family's promise was "when the quota runs out mid-work, change
// account and carry on". It was built into the Console window only (X-213), and
// the Console is the surface that needs it LEAST: a person is sitting there and
// can move the card by hand. The surface that needs it most is the one with
// nobody in front of it — a headless run at 03:00 that meets a usage limit.
//
// Measured before this: `maybeScheduleRetry` asks `retryDecision` when to try
// again, gets ONE plan's reset back (M-10) and parks the retry until then. Three
// signed-in accounts can sit at 4% all night while the work sleeps until 07:50.
//
// The rule this file pins, in both halves:
//   · the DECISION is one function, and it does not invent a second rotation
//     rule — it asks `pickAccount`, which is X-207's own choice of whose turn it
//     is. Two answers to "which account should carry this" is how the sentry and
//     the queue come to disagree about the same night.
//   · a run may only be moved to a sign-in that is MEASURED and has room, on the
//     SAME engine, and never to the one that just refused it.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');

// ---- fake vscode (the test_task_events.js pattern) ----
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

const { carryOnAccount } = require(path.join(ROOT, 'out/core/accountUsage.js'));
const { MACHINE_ACCOUNT } = require(path.join(ROOT, 'out/core/accountStore.js'));
const { TaskManager } = require(path.join(ROOT, 'out/core/tasks.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const NOW = Date.now();
const HOUR = 3600_000;
const at = (id, pct, engine = 'claude', resets = NOW + HOUR, state = 'ok') => ({
    slotId: id, engine, state, percent: pct, resetsAt: resets, plan: 'pro', fetchedAt: NOW
});

// ===========================================================================
// 1) THE DECISION — pure, shared, and refusing more often than it agrees
// ===========================================================================
{
    const pool = [at('c1', 98), at('c2', 12), at('c3', 55)];

    const d = carryOnAccount({ from: 'c1', engine: 'claude', usage: pool, waitUntil: NOW + 4 * HOUR, now: NOW });
    ok('‼️ the work moves to the account with the most room instead of sleeping',
        d.slotId === 'c2');
    ok('…and says so in words a reader finds on the row', /c2/.test(d.why) && /c1/.test(d.why));

    ok('‼️ never back to the account that just refused it, whatever its last read says',
        carryOnAccount({
            from: 'c1', engine: 'claude', usage: [at('c1', 3), at('c2', 90)],
            ceiling: 95, waitUntil: NOW + 4 * HOUR, now: NOW
        }).slotId === 'c2');

    ok('‼️ never to another engine — a carried-on run resumes a transcript, and a '
        + 'transcript belongs to one CLI',
        carryOnAccount({
            from: 'c1', engine: 'claude', usage: [at('c1', 99), at('x1', 2, 'codex')],
            waitUntil: NOW + 4 * HOUR, now: NOW
        }).slotId === undefined);

    ok('an engine nobody named is claude, exactly as the reset lookup reads it',
        carryOnAccount({ from: 'c1', usage: pool, waitUntil: NOW + 4 * HOUR, now: NOW }).slotId === 'c2');

    ok('‼️ no measured account is not a handover — the absence of a slot is the '
        + 'main sign-in (X-172), and it cannot be asked how much room it has',
        carryOnAccount({ from: 'c1', engine: 'claude', usage: [], waitUntil: NOW + 4 * HOUR, now: NOW })
            .slotId === undefined);

    const walled = carryOnAccount({
        from: 'c1', engine: 'claude', usage: [at('c1', 99), at('c2', 96), at('c3', 97)],
        ceiling: 95, waitUntil: NOW + 4 * HOUR, now: NOW
    });
    ok('every other account is walled too, so the wait stands', walled.slotId === undefined);
    ok('…and the reason names the ceiling that refused them', /95/.test(walled.why));

    ok('a sign-in that has never answered is not a place to send work',
        carryOnAccount({
            from: 'c1', engine: 'claude',
            usage: [at('c1', 99), { ...at('c2', -1), state: 'no-auth' }],
            waitUntil: NOW + 4 * HOUR, now: NOW
        }).slotId === undefined);

    ok('‼️ a wait shorter than the handover\'s own floor buys nothing, so it is not made',
        carryOnAccount({ from: 'c1', engine: 'claude', usage: pool, waitUntil: NOW + 30_000, now: NOW })
            .slotId === undefined);
    ok('…and a wait that has already passed is not a wait at all',
        carryOnAccount({ from: 'c1', engine: 'claude', usage: pool, waitUntil: NOW - HOUR, now: NOW })
            .slotId === undefined);

    ok('‼️ a run PINNED to the machine\'s own identity is never moved — "nothing is '
        + 'injected" is an instruction, and a handover would inject one',
        carryOnAccount({
            from: MACHINE_ACCOUNT, engine: 'claude', usage: pool, waitUntil: NOW + 4 * HOUR, now: NOW
        }).slotId === undefined);

    ok('a run that named no account at all is still carried on — it is the '
        + 'commonest night run, and the active sign-in is the one that was refused',
        carryOnAccount({ engine: 'claude', usage: pool, waitUntil: NOW + 4 * HOUR, now: NOW })
            .slotId === 'c2');

    // ‼️ NOT A SECOND ROTATION RULE. The choice inside the engine is `pickAccount`'s
    // — this is measured by giving it a pool whose answer only `mostRoom` gives
    // (the first row is not the emptiest) and reading the source for the call.
    const src = fs.readFileSync(path.join(ROOT, 'src', 'core', 'accountUsage.ts'), 'utf8');
    const body = src.slice(src.indexOf('export function carryOnAccount'));
    ok('‼️ X-226 — the handover ASKS `pickAccount` rather than choosing for itself',
        /pickAccount\(/.test(body.slice(0, 2500)));
}

// ===========================================================================
// 2) THE WIRING — the retry nobody is watching
// ===========================================================================
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-carry-'));
const agentDir = path.join(tmp, 'agent'); fs.mkdirSync(agentDir, { recursive: true });
const agent = { id: 'a1', name: 'developer', dir: agentDir };
const agents = () => [agent];
const mk = (name, opts) =>
    new TaskManager(path.join(tmp, name + '.json'), agents, () => false, () => '', opts);

const LIMIT = 'Claude usage limit reached. You have hit your session limit · resets 6:50pm';
const BROKE = 'Error: ENOENT: no such file or directory';
const RESET = () => Date.now() + 4 * HOUR;

/** A failed headless run with real output on disk, exactly as the runner leaves it. */
const failed = (m, out, extra) => {
    const t = m.addTask(agent, 'gece', 'iş', 'headless', {
        retry: { max: 3, delayMin: 40, when: 'limit', resetAware: true }, ...extra
    });
    t.outputFile = path.join(tmp, t.id + '.out.txt');
    fs.writeFileSync(t.outputFile, out, 'utf8');
    t.status = 'failed'; t.endedAt = Date.now();
    return t;
};

{
    const usage = [at('c1', 99), at('c2', 8)];
    const m = mk('carry', {
        isRunner: () => true,
        limitResetAt: () => RESET(),
        measuredAccounts: () => usage
    });
    const t = failed(m, LIMIT, { account: 'c1' });
    m.maybeScheduleRetry(t);
    const row = m.tasks.find(x => x.retryOf === t.id);
    ok('‼️ X-226 — the retry runs as the account that still has room', !!row && row.account === 'c2');
    ok('‼️ …and it does NOT sleep until the other plan\'s window reopens',
        !!row && row.notBefore < Date.now() + 5 * 60_000);
    ok('‼️ …and it is not labelled as waiting for a reset it is no longer waiting for',
        !!row && row.resetAt === undefined);
    ok('the row says where the work went, in the reason the board draws',
        !!row && /c2/.test(row.notBeforeWhy || ''));
    ok('…and so does the record of the run that was refused',
        t.events.some(e => /c2/.test(e.note || '') && /c1/.test(e.note || '')));
    ok('‼️ …and the retry still carries everything else the original ran with',
        !!row && row.retryAttempt === 1 && row.retry && row.retry.delayMin === 40);
    m.dispose();
}

{
    const usage = [at('c1', 99), at('c2', 97)];
    const m = mk('nocarry', {
        isRunner: () => true,
        limitResetAt: () => RESET(),
        measuredAccounts: () => usage
    });
    const t = failed(m, LIMIT, { account: 'c1' });
    m.maybeScheduleRetry(t);
    const row = m.tasks.find(x => x.retryOf === t.id);
    ok('‼️ every account walled — M-10 is untouched: it waits for the reset',
        !!row && row.notBefore > Date.now() + HOUR && row.resetAt > 0);
    ok('…on the account it was already running as', !!row && row.account === 'c1');
    m.dispose();
}

{
    // ‼️ THE CASE THAT MATTERS MOST, because `resetAware` ships OFF: an
    // unconfigured run does not wait for a window at all, it waits its policy's
    // forty minutes — on a plan that is walled for four hours — and then fails
    // again. There is no reset here to be aware of; there is another account.
    const usage = [at('c1', 99), at('c2', 8)];
    const m = mk('plainwait', {
        isRunner: () => true,
        measuredAccounts: () => usage
    });
    const t = m.addTask(agent, 'gece', 'is', 'headless',
        { retry: { max: 3, delayMin: 40, when: 'limit' }, account: 'c1' });
    t.outputFile = path.join(tmp, t.id + '.out.txt');
    fs.writeFileSync(t.outputFile, LIMIT, 'utf8');
    t.status = 'failed'; t.endedAt = Date.now();
    m.maybeScheduleRetry(t);
    const row = m.tasks.find(x => x.retryOf === t.id);
    ok('‼️ X-226 — an ordinary wait is a wait too: the forty minutes are not '
        + 'served on a walled plan when another one is open',
        !!row && row.account === 'c2' && row.notBefore < Date.now() + 5 * 60_000);
    m.dispose();
}

{
    const m = mk('nopool', { isRunner: () => true, limitResetAt: () => RESET() });
    const t = failed(m, LIMIT, { account: 'c1' });
    m.maybeScheduleRetry(t);
    const row = m.tasks.find(x => x.retryOf === t.id);
    ok('a machine that has captured nothing behaves exactly as it did before',
        !!row && row.account === 'c1' && row.resetAt > 0);
    m.dispose();
}

{
    const usage = [at('c1', 99), at('c2', 8)];
    const m = mk('notlimit', {
        isRunner: () => true,
        measuredAccounts: () => usage,
        defaultRetry: () => ({ max: 2, delayMin: 5, when: 'any' })
    });
    const t = failed(m, BROKE, { account: 'c1', retry: { max: 2, delayMin: 5, when: 'any' } });
    m.maybeScheduleRetry(t);
    const row = m.tasks.find(x => x.retryOf === t.id);
    ok('‼️ a run that failed for its OWN reasons is not moved — a broken script '
        + 'breaks the same way on every sign-in, and moving it spends a second plan '
        + 'to prove it',
        !!row && row.account === 'c1');
    m.dispose();
}

// ===========================================================================
// 3) THE SURFACE — the board says whose plan the night is billed to
// ===========================================================================
{
    const panel = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'tasksPanel.ts'), 'utf8');
    const setup = panel.slice(panel.indexOf('function runSetup'), panel.indexOf('function buildRuns'));
    ok('‼️ X-226 — the run\'s own setup names the ACCOUNT, which it never did',
        /label: 'Account'/.test(setup));
    ok('‼️ …and says when that account was handed the work at a wall',
        /accountHandover/.test(setup));
}

{
    /*
     * ‼️ AND THE SAME FACT ON THE BRIDGE, because the reader of a night run is
     * as often an agent as a person. Measured: `bridgeDimsOut` serialized the
     * engine, the model, the effort, the route and the tier — and NOT the
     * account, so `tasks.get` could not answer "whose plan paid for this" about
     * the very runs nobody watched. The sixth hand-written dimension list.
     */
    const bridge = fs.readFileSync(path.join(ROOT, 'src', 'core', 'bridge.ts'), 'utf8');
    const dims = bridge.slice(bridge.indexOf('export function bridgeDimsOut'));
    ok('‼️ X-226 — the bridge says whose sign-in a run spent',
        /account: o\.account/.test(dims.slice(0, dims.indexOf('\n}'))));
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('‼️ …and that it was handed over at a wall, beside the reset it is not waiting for',
        /accountHandover: task\.accountHandover/.test(ext));
}

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp */ }
Module._load = origLoad;
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
