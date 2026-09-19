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
    // ‼️ X-226 (round 2) — THE SWITCH SHIPS OFF. Every case below opts in with
    // `want: '@emptiest'`, which is what the first cut did for everyone,
    // unasked; the cases at the end are the default, and the default STAYS.
    const carry = (i) => carryOnAccount({ want: '@emptiest', ...i });

    const d = carry({ from: 'c1', engine: 'claude', usage: pool, waitUntil: NOW + 4 * HOUR, now: NOW });
    ok('‼️ the work moves to the account with the most room instead of sleeping',
        d.slotId === 'c2');
    ok('…and says so in words a reader finds on the row', /c2/.test(d.why) && /c1/.test(d.why));

    ok('‼️ never back to the account that just refused it, whatever its last read says',
        carry({
            from: 'c1', engine: 'claude', usage: [at('c1', 3), at('c2', 90)],
            ceiling: 95, waitUntil: NOW + 4 * HOUR, now: NOW
        }).slotId === 'c2');

    ok('‼️ never to another engine — a carried-on run resumes a transcript, and a '
        + 'transcript belongs to one CLI',
        carry({
            from: 'c1', engine: 'claude', usage: [at('c1', 99), at('x1', 2, 'codex')],
            waitUntil: NOW + 4 * HOUR, now: NOW
        }).slotId === undefined);

    ok('an engine nobody named is claude, exactly as the reset lookup reads it',
        carry({ from: 'c1', usage: pool, waitUntil: NOW + 4 * HOUR, now: NOW }).slotId === 'c2');

    ok('‼️ no measured account is not a handover — the absence of a slot is the '
        + 'main sign-in (X-172), and it cannot be asked how much room it has',
        carry({ from: 'c1', engine: 'claude', usage: [], waitUntil: NOW + 4 * HOUR, now: NOW })
            .slotId === undefined);

    const walled = carry({
        from: 'c1', engine: 'claude', usage: [at('c1', 99), at('c2', 96), at('c3', 97)],
        ceiling: 95, waitUntil: NOW + 4 * HOUR, now: NOW
    });
    ok('every other account is walled too, so the wait stands', walled.slotId === undefined);
    ok('…and the reason names the ceiling that refused them', /95/.test(walled.why));

    ok('a sign-in that has never answered is not a place to send work',
        carry({
            from: 'c1', engine: 'claude',
            usage: [at('c1', 99), { ...at('c2', -1), state: 'no-auth' }],
            waitUntil: NOW + 4 * HOUR, now: NOW
        }).slotId === undefined);

    ok('‼️ a wait shorter than the handover\'s own floor buys nothing, so it is not made',
        carry({ from: 'c1', engine: 'claude', usage: pool, waitUntil: NOW + 30_000, now: NOW })
            .slotId === undefined);
    ok('…and a wait that has already passed is not a wait at all',
        carry({ from: 'c1', engine: 'claude', usage: pool, waitUntil: NOW - HOUR, now: NOW })
            .slotId === undefined);

    ok('‼️ a run PINNED to the machine\'s own identity is never moved — "nothing is '
        + 'injected" is an instruction, and a handover would inject one',
        carry({
            from: MACHINE_ACCOUNT, engine: 'claude', usage: pool, waitUntil: NOW + 4 * HOUR, now: NOW
        }).slotId === undefined);

    ok('a run that named no account at all is still carried on — it is the '
        + 'commonest night run, and the active sign-in is the one that was refused',
        carry({ engine: 'claude', usage: pool, waitUntil: NOW + 4 * HOUR, now: NOW })
            .slotId === 'c2');

    // ‼️ X-226 (round 2) — NOTHING ASKED FOR IS NOTHING DONE.
    const stay = carryOnAccount({ from: 'c1', engine: 'claude', usage: pool, waitUntil: NOW + 4 * HOUR, now: NOW });
    ok('‼️ with no `want` the run STAYS on its own sign-in, whatever room the others have',
        stay.slotId === undefined && /carryOn/.test(stay.why) && /waits for its own reset/.test(stay.why));
    ok('…and an empty `want` is the same silence',
        carryOnAccount({ from: 'c1', engine: 'claude', usage: pool, waitUntil: NOW + 4 * HOUR, now: NOW, want: '  ' }).slotId === undefined);
    // A NAMED ACCOUNT: that one and no substitute.
    ok('a named slot with room is the one chosen, not the emptiest',
        carry({ from: 'c1', engine: 'claude', usage: pool, waitUntil: NOW + 4 * HOUR, now: NOW, want: 'c3' }).slotId === 'c3');
    const namedWalled = carry({ from: 'c1', engine: 'claude', usage: [at('c1', 99), at('c2', 5), at('c3', 97)], ceiling: 95, waitUntil: NOW + 4 * HOUR, now: NOW, want: 'c3' });
    ok('‼️ a named slot that is walled too means the wait stands — never a substitute the user did not name',
        namedWalled.slotId === undefined && /c3/.test(namedWalled.why) && /97%/.test(namedWalled.why));
    ok('a named slot that is the walled one itself is refused by name',
        /c1/.test(carry({ from: 'c1', engine: 'claude', usage: pool, waitUntil: NOW + 4 * HOUR, now: NOW, want: 'c1' }).why)
        && carry({ from: 'c1', engine: 'claude', usage: pool, waitUntil: NOW + 4 * HOUR, now: NOW, want: 'c1' }).slotId === undefined);
    ok('a named slot nobody captured is refused by name',
        /zz/.test(carry({ from: 'c1', engine: 'claude', usage: pool, waitUntil: NOW + 4 * HOUR, now: NOW, want: 'zz' }).why));
    // A RULE: the host's resolver decides, over the pool WITHOUT the walled one.
    const seen = [];
    const viaRule = carry({ from: 'c1', engine: 'claude', usage: pool, waitUntil: NOW + 4 * HOUR, now: NOW, want: '@round-robin',
        resolve: (id, p) => { seen.push([id, p.map(u => u.slotId).join(',')]); return { id: 'c3', note: 'next in line' }; } });
    ok('‼️ a policy id is handed to the resolver with the pool minus the walled account',
        viaRule.slotId === 'c3' && seen.length === 1 && seen[0][0] === '@round-robin' && seen[0][1] === 'c2,c3');
    const refused = carry({ from: 'c1', engine: 'claude', usage: pool, waitUntil: NOW + 4 * HOUR, now: NOW, want: '@night',
        resolve: () => ({ id: '', refusal: 'every listed sign-in is walled' }) });
    ok('…and a refusal from the rule is a wait, with the rule\'s own sentence on it',
        refused.slotId === undefined && /@night/.test(refused.why) && /every listed sign-in is walled/.test(refused.why));
    ok('a rule other than @emptiest with no resolver cannot be answered here, and says so',
        carry({ from: 'c1', engine: 'claude', usage: pool, waitUntil: NOW + 4 * HOUR, now: NOW, want: '@round-robin' }).slotId === undefined);

    // ‼️ NOT A SECOND ROTATION RULE. The choice inside the engine is `pickAccount`'s
    // — this is measured by giving it a pool whose answer only `mostRoom` gives
    // (the first row is not the emptiest) and reading the source for the call.
    const src = fs.readFileSync(path.join(ROOT, 'src', 'core', 'accountUsage.ts'), 'utf8');
    const body = src.slice(src.indexOf('export function carryOnAccount'));
    ok('‼️ X-226 — the handover ASKS `pickAccount` rather than choosing for itself',
        /pickAccount\(/.test(body.slice(0, 6000)));
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
        retry: { max: 3, delayMin: 40, when: 'limit', resetAware: true, carryOn: '@emptiest' }, ...extra
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
        { retry: { max: 3, delayMin: 40, when: 'limit', carryOn: '@emptiest' }, account: 'c1' });
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
    const t = failed(m, BROKE, { account: 'c1', retry: { max: 2, delayMin: 5, when: 'any', carryOn: '@emptiest' } });
    m.maybeScheduleRetry(t);
    const row = m.tasks.find(x => x.retryOf === t.id);
    ok('‼️ a run that failed for its OWN reasons is not moved — a broken script '
        + 'breaks the same way on every sign-in, and moving it spends a second plan '
        + 'to prove it',
        !!row && row.account === 'c1');
    m.dispose();
}

{
    // ‼️ X-226 (round 2) — THE DEFAULT. A run whose policy says nothing about a
    // handover keeps the sign-in it was given and waits for ITS reset, however
    // much room the others have. This is the case the round was opened for.
    const usage = [at('c1', 99), at('c2', 8)];
    const m = mk('stay', {
        isRunner: () => true,
        limitResetAt: () => RESET(),
        measuredAccounts: () => usage
    });
    const t = failed(m, LIMIT, { account: 'c1', retry: { max: 3, delayMin: 40, when: 'limit', resetAware: true } });
    m.maybeScheduleRetry(t);
    const row = m.tasks.find(x => x.retryOf === t.id);
    ok('‼️ X-226 (round 2) — with no carryOn the retry STAYS on the chosen sign-in', !!row && row.account === 'c1');
    ok('…and waits for that plan\'s reset, exactly as M-10 promised', !!row && row.resetAt > 0 && row.notBefore > Date.now() + HOUR);
    ok('…and nothing on the record claims a handover', !t.events.some(e => /c2/.test(e.note || '')));
    m.dispose();
}

{
    // …and the user's DEFAULT policy can opt every run in, like every other retry field.
    const usage = [at('c1', 99), at('c2', 8)];
    const m = mk('dflt', {
        isRunner: () => true,
        limitResetAt: () => RESET(),
        measuredAccounts: () => usage,
        defaultRetry: () => ({ max: 3, delayMin: 40, when: 'limit', carryOn: '@emptiest' })
    });
    const t = failed(m, LIMIT, { account: 'c1', retry: { max: 3, delayMin: 40, when: 'limit' } });
    m.maybeScheduleRetry(t);
    const row = m.tasks.find(x => x.retryOf === t.id);
    ok('the default policy\'s carryOn falls through to a run that states none', !!row && row.account === 'c2');
    m.dispose();
}

{
    // A NAMED ACCOUNT on the policy: that one, and the record says so.
    const usage = [at('c1', 99), at('c2', 8), at('c3', 40)];
    const m = mk('named', {
        isRunner: () => true,
        limitResetAt: () => RESET(),
        measuredAccounts: () => usage
    });
    const t = failed(m, LIMIT, { account: 'c1', retry: { max: 3, delayMin: 40, when: 'limit', carryOn: 'c3' } });
    m.maybeScheduleRetry(t);
    const row = m.tasks.find(x => x.retryOf === t.id);
    ok('‼️ a policy naming one account carries on with THAT one, not the emptiest', !!row && row.account === 'c3');
    m.dispose();
}

{
    // A RULE on the policy goes through the host's resolver, and a refusal is a wait that says why.
    const usage = [at('c1', 99), at('c2', 8)];
    const asked = [];
    const m = mk('rule', {
        isRunner: () => true,
        limitResetAt: () => RESET(),
        measuredAccounts: () => usage,
        resolveCarryOn: (id, engine, agentId, pool) => { asked.push([id, engine, agentId, pool.map(u => u.slotId).join(',')]); return { id: '', refusal: 'the rule lists nobody with room' }; }
    });
    const t = failed(m, LIMIT, { account: 'c1', retry: { max: 3, delayMin: 40, when: 'limit', resetAware: true, carryOn: '@night' } });
    m.maybeScheduleRetry(t);
    const row = m.tasks.find(x => x.retryOf === t.id);
    ok('‼️ a rule is resolved by the host, over the pool minus the walled account, for the run\'s engine and agent',
        asked.length === 1 && asked[0][0] === '@night' && asked[0][1] === 'claude' && asked[0][2] === 'a1' && asked[0][3] === 'c2');
    ok('…and its refusal keeps the run where it was, waiting', !!row && row.account === 'c1' && row.resetAt > 0);
    ok('…with the rule\'s sentence on the record of the refused run', t.events.some(e => /@night/.test(e.note || '') && /lists nobody with room/.test(e.note || '')));
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
