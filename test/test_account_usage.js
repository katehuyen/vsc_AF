// X-170 — HOW MUCH ROOM IS LEFT, PER ACCOUNT, WITHOUT MULTIPLYING THE REQUESTS.
//
// ‼️ The failure this suite exists to prevent: one PlanUsageService per slot.
// It looks like the obvious build and it silently multiplies every ceiling in
// planusage.ts by the number of accounts — the 5-second floor becomes 5 seconds
// EACH, and a 429 backs off one token while the other two keep knocking. The
// endpoint does not see three accounts, it sees this machine. Asking how much
// quota is left would become the thing that burns it.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const {
    AccountUsageService, mostRoom, nextResetAt, slotIsUsable, usageFrom,
    unreadUsage, fiveHourBar, FIVE_HOUR
} = require(path.join(__dirname, '..', 'out', 'core', 'accountUsage.js'));

const NOW = Date.parse('2026-09-04T12:00:00Z');
const slot = (id, engine = 'claude') => ({ id, engine, dir: 'D:/slots/' + id });

/** The endpoint's shape, with the five-hour row at a given percentage. */
const payload = (pct, resetsAt) => JSON.stringify({
    five_hour: { utilization: pct, resets_at: new Date(resetsAt).toISOString() },
    seven_day: { utilization: 12, resets_at: new Date(resetsAt + 86400_000).toISOString() }
});

/** A service wired to counted fakes — no disk, no network, no clock. */
function svc(slots, opts = {}) {
    const calls = [];
    let clock = NOW;
    const service = new AccountUsageService({
        slots: () => slots,
        ttlMs: () => (opts.ttlMs === undefined ? 60_000 : opts.ttlMs),
        now: () => clock,
        readCreds: (file) => (opts.creds === false ? undefined
            : { token: 'tok-' + path.basename(path.dirname(file)), expiresAt: clock + 3600_000, plan: 'pro' }),
        fetchImpl: async (token) => {
            calls.push(token);
            return opts.reply
                ? opts.reply(token, calls.length)
                : { status: 200, body: payload(10, clock + 3600_000) };
        }
    });
    return { service, calls, tick: (ms) => { clock += ms; } };
}

async function main() {
    // ---------- the shared budget: N accounts, still one request ----------
    {
        const { service, calls, tick } = svc([slot('a'), slot('b'), slot('c')]);
        await service.beat();
        ok('the first beat spends exactly one request, not one per account', calls.length === 1);

        // ‼️ THE FLOOR IS PER MACHINE. Another beat inside the interval buys
        // nobody anything, however many accounts were added since.
        await service.beat();
        ok('‼️ a second beat inside the floor spends nothing, whatever N is', calls.length === 1);

        // …and past the floor the turn goes to the account whose figures are
        // oldest — round robin, not "everyone at once".
        tick(10_000); await service.beat();
        tick(10_000); await service.beat();
        ok('past the floor the next turn goes to the next account', calls.length === 3);
        ok('‼️ …and each account was read once, in staleness order', new Set(calls).size === 3);

        // Every slot has a figure now and none is older than the TTL, so a beat
        // has nothing to do: three slots on a 60 s TTL cost three requests a
        // minute at most, not three per beat.
        tick(10_000); await service.beat();
        ok('nothing is due while every account is inside its own TTL', calls.length === 3);

        tick(60_000); await service.beat();
        ok('once a slot goes stale it takes the next turn, alone', calls.length === 4);

        const list = service.current();
        ok('every slot is reported, read or not', list.length === 3);
        ok('the five-hour figure is what a row shows',
            list.every(u => u.state === 'ok' && u.percent === 10));
        ok('…and the account it belongs to is named on it',
            list.map(u => u.slotId).join(',') === 'a,b,c');
    }

    // ---------- a 429 stops the FLEET, because the limit is about this caller ----------
    {
        const { service, calls, tick } = svc([slot('a'), slot('b')], {
            reply: (t, n) => (n === 1 ? { status: 429, body: '' } : { status: 200, body: payload(5, NOW + 3600_000) })
        });
        await service.beat();
        ok('a 429 is recorded as a backoff, not swallowed', service.rateLimitedUntil() > NOW);
        tick(10_000);
        await service.beat();
        ok('‼️ the backoff protects EVERY account, not just the one that hit it', calls.length === 1);
        ok('…and the note says the whole machine is backing off',
            /every account/i.test(service.current().find(u => u.slotId === 'a').note || ''));

        // A person clicking ⟳ has decided to spend one request; the alternative
        // is a control that silently refuses for a quarter of an hour, which is
        // a control that has taught you it does not work.
        await service.refresh();
        ok('‼️ a PERSON may still ask — and still spends one request, not N', calls.length === 2);
    }

    // ---------- the states a person has to act on ----------
    {
        const { service } = svc([slot('a')], { reply: () => ({ status: 401, body: '' }) });
        await service.refresh();
        const u = service.current()[0];
        ok('‼️ a rejected login is its own state — the one a person must fix',
            u.state === 'expired' && /sign(ing)? in/i.test(u.note || ''));
        ok('…and an account that needs a person is not offered to a runner', !slotIsUsable(u));

        const empty = svc([slot('a')], { creds: false });
        await empty.service.refresh();
        ok('a slot directory with no sign-in in it says so without asking the endpoint',
            empty.service.current()[0].state === 'no-auth' && empty.calls.length === 0);
    }

    // ---------- an engine with no readable allowance costs ZERO requests ----------
    {
        const { service, calls } = svc([slot('cx', 'codex'), slot('gm', 'gemini')]);
        await service.refresh();
        ok('‼️ an engine that publishes no quota is never fetched — no wasted request',
            calls.length === 0);
        const u = service.current();
        ok('…and it says WHY, in the adapter\'s own words, instead of a blank bar',
            u.every(x => x.state === 'no-source' && (x.note || '').length > 30));
        // ‼️ NOT KNOWING IS NOT BEING BLOCKED. Codex states a plan it simply does
        // not publish; refusing to start a session there would turn "we cannot
        // see it" into "you cannot use it".
        ok('‼️ …and a slot with no readable figure is still usable', u.every(x => slotIsUsable(x)));
        ok('nothing is ever due on an engine with no figure to read',
            service.dueNext() === undefined);
        ok('a slot nobody has read yet is stated, not missing',
            unreadUsage(slot('z')).state === 'error' && unreadUsage(slot('z')).percent === -1);
    }

    // ---------- the queue is visible, because a hidden one cannot be trusted ----------
    {
        const { service, tick } = svc([slot('a'), slot('b')]);
        ok('the next account the budget will spend itself on is nameable', service.dueNext().id === 'a');
        await service.beat();
        tick(10_000);
        ok('…and it moves on once that one is fresh', service.dueNext().id === 'b');
    }

    // ---------- the derivative the runner actually asks for ----------
    {
        const at = (id, pct, resets = 0, state = 'ok') => ({
            slotId: id, engine: 'claude', state, percent: pct, resetsAt: resets, plan: 'pro', fetchedAt: NOW
        });
        ok('the account with the most room is the one with the lowest five-hour figure',
            mostRoom([at('a', 80), at('b', 12), at('c', 55)]).slotId === 'b');
        ok('an account past the ceiling is not offered',
            mostRoom([at('a', 95), at('b', 40)], 90).slotId === 'b');
        ok('…and when every account is full, nothing is offered rather than the least bad one',
            mostRoom([at('a', 95), at('b', 99)], 90) === undefined);
        // ‼️ A MEASURED ACCOUNT BEATS AN UNMEASURED ONE. Both are usable, but
        // picking the unread one over a slot provably at 4% is choosing a guess
        // over a fact — and the guess is what ends the session ten minutes in.
        ok('‼️ a measured account is preferred over one nobody has read',
            mostRoom([{ ...at('unread', -1), state: 'no-source' }, at('known', 4)]).slotId === 'known');
        ok('…but an unmeasured account is still better than none at all',
            mostRoom([{ ...at('unread', -1), state: 'no-source' }]).slotId === 'unread');

        // ‼️ THE SLEEP. Every account full is not a failure, it is a WAIT — and
        // the wait has an exact end, so X-176 can spend zero tokens until then.
        const t = NOW + 42 * 60_000;
        ok('the earliest reset among the exhausted accounts is when to wake up',
            nextResetAt([at('a', 95, NOW + 90 * 60_000), at('b', 99, t)], 90, NOW) === t);
        ok('nothing waiting on a reset is zero, not a date in the past',
            nextResetAt([at('a', 10, NOW + 60_000)], 90, NOW) === 0);
        ok('a reset already behind us is not a wake-up time',
            nextResetAt([at('a', 95, NOW - 60_000)], 90, NOW) === 0);

        // The narrowing every surface uses.
        const snap = {
            state: 'ok', plan: 'max', fetchedAt: NOW, bars: [
                { id: FIVE_HOUR, title: 'Current session', percent: 33, resetsAt: t },
                { id: 'seven_day', title: 'Current week', percent: 71, resetsAt: t + 86400_000 }
            ]
        };
        ok('a row shows the five-hour window, not the weekly one',
            usageFrom(slot('a'), snap).percent === 33 && fiveHourBar(snap).percent === 33);
        ok('…and carries the reset the countdown needs', usageFrom(slot('a'), snap).resetsAt === t);
    }

    console.log(`${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.log('  FAIL threw: ' + (e && e.stack || e)); process.exit(1); });
