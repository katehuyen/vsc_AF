// X-178 — THE WATCHDOG AND SLOT HEALTH. Both pure, both decided for nothing.
//
// The campaign's own loop is driven by rounds ENDING (`sentryDue` is
// deliberately false while one is on the board). That leaves exactly one state
// nobody can see from outside and nothing can recover from: a round that will
// never end. An unattended session parked on a permission prompt at three in
// the morning is the shape it takes (K-22 says a session CAN stop and ask), and
// without a watchdog it holds the campaign for ever — the quota never stops it,
// because a session that is waiting spends nothing.
//
//   · ‼️ NOTHING IS KILLED ON NO EVIDENCE. A round with no moment to measure
//     from is not stalled, it is unmeasured — the same rule the rest of this
//     subsystem is built on.
//   · ‼️ A FALLEN SIGN-IN IS NOT A STOPPED CAMPAIGN. `slotIsUsable` already
//     refuses an expired slot, so the work carries on with the rest; what was
//     missing is that nobody was TOLD. Told once per fall, not once per tick.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const OUT = path.join(__dirname, '..', 'out', 'core');
const {
    stalledRound, slotHealth, SENTRY_DEFAULT_STALL_MIN
} = require(path.join(OUT, 'sentryWatch.js'));

const MIN = 60 * 1000;
const NOW = Date.UTC(2026, 8, 4, 3, 0, 0);

const round = (over) => Object.assign({ id: 't9', status: 'running', startedAt: NOW - 90 * MIN }, over || {});
const slot = (id, over) => Object.assign({
    slotId: id, engine: 'claude', state: 'ok', percent: 10,
    resetsAt: NOW + 60 * MIN, plan: 'pro', fetchedAt: NOW - MIN
}, over || {});

// ---- the watchdog ----------------------------------------------------------
{
    const v = stalledRound({ round: round(), lastActivityAt: NOW - 61 * MIN, limitMin: 45, now: NOW });
    ok('a round that has said nothing for longer than the limit is stalled', v.stalled);
    ok('...and it says how long the silence was, so the record is a measurement',
        v.quietMs === 61 * MIN && /61 min/.test(v.why));

    const alive = stalledRound({ round: round(), lastActivityAt: NOW - 3 * MIN, limitMin: 45, now: NOW });
    ok('a round that spoke three minutes ago is left alone', !alive.stalled);

    ok('‼️ the newest moment WINS: a round that started long ago but spoke just now is alive',
        !stalledRound({
            round: round({ startedAt: NOW - 5 * 60 * MIN }), lastActivityAt: NOW - MIN,
            limitMin: 45, now: NOW
        }).stalled);

    ok('‼️ ...and a round nobody has heard from since it STARTED is measured from its start',
        stalledRound({ round: round({ startedAt: NOW - 50 * MIN }), limitMin: 45, now: NOW }).stalled);

    ok('‼️ a round with no moment to measure from is UNMEASURED, not stalled',
        !stalledRound({ round: round({ startedAt: 0 }), limitMin: 45, now: NOW }).stalled);

    ok('a queued round is waiting for the gate, not going quiet — it is never killed',
        !stalledRound({ round: round({ status: 'queued' }), lastActivityAt: NOW - 500 * MIN, limitMin: 45, now: NOW }).stalled);

    ok('‼️ a limit of 0 switches the watchdog off, and says so rather than deciding',
        !stalledRound({ round: round(), lastActivityAt: NOW - 900 * MIN, limitMin: 0, now: NOW }).stalled);

    ok('the default limit is stated rather than magic', SENTRY_DEFAULT_STALL_MIN > 0);
}

// ---- slot health -----------------------------------------------------------
{
    const usage = [slot('a'), slot('b', { state: 'expired', percent: -1 }), slot('c')];
    const h = slotHealth([], usage);
    ok('a slot whose sign-in was rejected is DOWN', h.down.length === 1 && h.down[0] === 'b');
    ok('...and it is new, so it is worth telling the user about', h.newlyDown.length === 1);
    ok('‼️ ...and the campaign carries on, because two accounts are still usable', h.anyUsable);

    const again = slotHealth(['b'], usage);
    ok('‼️ the same slot on the next tick is NOT announced again — once per fall, not once per poll',
        again.down.length === 1 && again.newlyDown.length === 0);

    const back = slotHealth(['b'], [slot('a'), slot('b'), slot('c')]);
    ok('a slot that has been signed in again is recovered and the alarm re-arms',
        back.down.length === 0 && back.recovered.length === 1 && back.recovered[0] === 'b');

    const allGone = slotHealth([], [slot('a', { state: 'expired' }), slot('b', { state: 'no-auth' })]);
    ok('‼️ every account rejected is the case that CANNOT pass silently',
        allGone.down.length === 2 && !allGone.anyUsable);

    ok('a machine that has captured no account at all is not "every account down" — '
        + 'no slot is the MAIN sign-in (X-172)',
        slotHealth([], []).anyUsable && !slotHealth([], []).down.length);

    ok('an account merely at its ceiling is a WALL, not a fallen sign-in — it comes back by itself',
        slotHealth([], [slot('a', { percent: 99 })]).down.length === 0);

    ok('...and an engine that publishes no allowance is usable, never down',
        slotHealth([], [slot('a', { state: 'no-source', percent: -1 })]).down.length === 0);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
