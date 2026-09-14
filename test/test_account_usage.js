// X-170 — HOW MUCH ROOM IS LEFT, PER ACCOUNT, WITHOUT MULTIPLYING THE REQUESTS.
//
// ‼️ The failure this suite exists to prevent: one PlanUsageService per slot.
// It looks like the obvious build and it silently multiplies every ceiling in
// planusage.ts by the number of accounts — the 5-second floor becomes 5 seconds
// EACH. The endpoint does not see three accounts, it sees this machine. Asking
// how much quota is left would become the thing that burns it.
//
// ‼️ X-278 — AND THE BACKOFF IS THE ONE CEILING THAT IS **NOT** SHARED, which
// is the opposite of what this file used to pin. The politeness lives in the
// FLOOR (one request per interval, whatever N is); a 429 is about a token, and
// holding three accounts because one of them ran out of queries blinded two
// counters that were fine. So each account backs off alone, and the fleet backs
// off only once a SECOND account is refused while the first is still held —
// the shape a limit about the machine really has.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const {
    AccountUsageService, mostRoom, pickAccount, accountOrder, roomOrder, nextResetAt, slotIsUsable, usageFrom,
    unreadUsage, fiveHourBar, FIVE_HOUR
} = require(path.join(__dirname, '..', 'out', 'core', 'accountUsage.js'));
const { RATE_LIMIT_BACKOFF_START_MS } = require(path.join(__dirname, '..', 'out', 'core', 'planusage.js'));

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
    const refreshes = [];
    const reads = [];
    let clock = NOW;
    const service = new AccountUsageService({
        slots: () => slots,
        ttlMs: () => (opts.ttlMs === undefined ? 60_000 : opts.ttlMs),
        now: () => clock,
        readCreds: (file) => {
            if (opts.creds === false) { return undefined; }
            reads.push(file);
            const life = opts.credLife ? opts.credLife(reads.length)
                : (opts.credLifeMs === undefined ? 3600_000 : opts.credLifeMs);
            return {
                token: 'tok-' + path.basename(path.dirname(file)) + (opts.credLife ? '-r' + reads.length : ''),
                expiresAt: clock + life, plan: 'pro'
            };
        },
        fetchImpl: async (token) => {
            calls.push(token);
            return opts.reply
                ? opts.reply(token, calls.length)
                : { status: 200, body: payload(10, clock + 3600_000) };
        },
        // X-204 — the default is the harsh answer, so a suite that says nothing
        // about refreshing still measures the state a person has to fix.
        refreshImpl: async (file) => {
            refreshes.push(file);
            return opts.refresh
                ? opts.refresh(file, refreshes.length)
                : { kind: 'rejected', reason: 'the stored sign-in carries no refresh token' };
        },
        busy: opts.busy,
        onRead: opts.onRead
    });
    return { service, calls, refreshes, reads, tick: (ms) => { clock += ms; } };
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

    // ---------- ‼️ X-278 — a 429 is about a TOKEN, until the machine says it twice ----------
    {
        // Only account `a` is ever refused; `b` and `c` are fine. Before this
        // item, `a`'s first 429 froze all three counters.
        const { service, calls, tick } = svc([slot('a'), slot('b'), slot('c')], {
            reply: (t) => (t === 'tok-a'
                ? { status: 429, body: '' }
                : { status: 200, body: payload(5, NOW + 3600_000) })
        });
        await service.beat();
        ok('a 429 is recorded as a backoff, not swallowed', service.rateLimitedFor('a') > NOW);
        ok('‼️ X-278: …and it is THIS account\'s hold, not the fleet\'s',
            service.rateLimitedUntil() === 0);
        ok('…the note says whose allowance ran out, and that the others keep being read',
            /THIS account/.test(service.current().find(u => u.slotId === 'a').note || ''));

        tick(10_000); await service.beat();
        tick(10_000); await service.beat();
        ok('‼️ X-278: the accounts that were never refused keep being read',
            calls.filter(t => t !== 'tok-a').length === 2);
        ok('…and the held one is SKIPPED rather than handed the fleet\'s one request',
            calls.filter(t => t === 'tok-a').length === 1);
        ok('…so the counters that were fine are not blind',
            service.current().filter(u => u.state === 'ok').length === 2);

        // Its own turn comes back when its own hold runs out — nobody else's.
        tick(RATE_LIMIT_BACKOFF_START_MS + 61_000);
        ok('the held account is due again once its own backoff expires, and not before',
            service.rateLimitedFor('a') === 0);
    }

    // ---------- ‼️ S-63 — a 429 that says how long is believed, per account ----------
    // The GET used to return {status, body} and nothing else, so every 429 was
    // answered with the invented curve. The endpoint's Retry-After is the hold
    // now, for the account that was told it — and it is said on the card.
    {
        let aRefusals = 0;
        const { service, tick } = svc([slot('a'), slot('b')], {
            reply: (t) => {
                if (t !== 'tok-a') { return { status: 200, body: payload(5, NOW + 3600_000) }; }
                // first refusal names a wait; the second does not
                return ++aRefusals === 1
                    ? { status: 429, body: '', retryAfterMs: 42_000 }
                    : { status: 429, body: '' };
            }
        });
        await service.beat();
        ok('‼️ the account holds for exactly what the endpoint asked, not the curve',
            service.rateLimitedFor('a') === NOW + 42_000);
        ok('…and the card says so in the endpoint\'s figure',
            /asked for 42 s/.test(service.current().find(u => u.slotId === 'a').note || ''));
        ok('the account it did not say it to is untouched', service.rateLimitedFor('b') === 0);
        // the beat reads one account per interval, so `a` comes round on the
        // second beat after its hold; the curve's start is measured from there
        tick(42_000 + 10_000); await service.beat();
        tick(10_000); await service.beat();
        const start = service.rateLimitedFor('a') - RATE_LIMIT_BACKOFF_START_MS;
        ok('‼️ the hold the endpoint named did not feed the curve: an unexplained 429 after it starts the curve afresh',
            aRefusals === 2 && start >= NOW + 52_000 && start <= NOW + 62_000
            && /did not say how long/.test(service.current().find(u => u.slotId === 'a').note || ''));
    }

    // ---------- …and a SECOND account refused while the first is held IS the machine ----------
    {
        const { service, calls, tick } = svc([slot('a'), slot('b'), slot('c')], {
            reply: (t) => (t === 'tok-c'
                ? { status: 200, body: payload(5, NOW + 3600_000) }
                : { status: 429, body: '' })
        });
        await service.beat();
        ok('the first refusal holds one account only', service.rateLimitedUntil() === 0);
        tick(10_000); await service.beat();
        ok('‼️ X-278: a SECOND account refused while the first is held stops the FLEET',
            service.rateLimitedUntil() > NOW);
        ok('…and the note says that is what a limit on the machine looks like',
            /limit on this machine/.test(service.current().find(u => u.slotId === 'b').note || ''));

        const spent = calls.length;
        tick(10_000); await service.beat();
        ok('…so the third account, never refused, is not spent on either', calls.length === spent);
        ok('‼️ …and finding that out cost exactly ONE extra request, not N', spent === 2);

        // A person clicking ⟳ has decided to spend one request; the alternative
        // is a control that silently refuses for a quarter of an hour, which is
        // a control that has taught you it does not work.
        await service.refresh();
        ok('‼️ a PERSON may still ask — and still spends one request, not N', calls.length === spent + 1);
    }

    // ---------- a read that got through is the plainest evidence there is ----------
    {
        let refuse = true;
        const { service, tick } = svc([slot('a'), slot('b')], {
            reply: () => (refuse ? { status: 429, body: '' } : { status: 200, body: payload(5, NOW + 3600_000) })
        });
        await service.beat();
        tick(10_000); await service.beat();
        ok('both accounts held and the fleet with them', service.rateLimitedUntil() > NOW);
        refuse = false;
        tick(60_000);
        await service.refresh();
        ok('‼️ X-278: an answered request clears the fleet hold — the machine plainly is not the limit',
            service.rateLimitedUntil() === 0);
        ok('…and the account that was answered is no longer held either',
            service.current().some(u => u.state === 'ok'));
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

    // ---------- X-204: an aged-out access token is NOT a signed-out account ----------
    //
    // ‼️ THE INVERSION THIS BLOCK EXISTS TO PREVENT. Until X-204 the 401 above
    // was the ONLY reading of an expired access token, `slotIsUsable` refused
    // the slot, and a healthy account left the fleet while the user was sent to
    // a browser to fix nothing. The grant has two halves and only the long one
    // is a person's job.
    {
        const live = () => ({ kind: 'refreshed', token: 'tok-fresh' });
        const { service, calls, refreshes } = svc([slot('a')], {
            refresh: live,
            reply: (token) => (token === 'tok-fresh'
                ? { status: 200, body: payload(37, NOW + 3600_000) }
                : { status: 401, body: '' })
        });
        await service.refresh();
        const u = service.current()[0];
        ok('‼️ a 401 is refreshed and retried, not reported as a signed-out account',
            u.state === 'ok' && u.percent === 37);
        ok('…which cost exactly one refresh and one extra read', refreshes.length === 1 && calls.length === 2);
        ok('…and the account stays usable, which is the damage the bug actually did',
            slotIsUsable(u));
    }
    {
        // The clock already says the token is gone, so a request that is KNOWN
        // to come back 401 is never spent from the machine's shared budget.
        const { service, calls, refreshes } = svc([slot('a')], {
            credLifeMs: -1000,
            refresh: () => ({ kind: 'refreshed', token: 'tok-fresh' })
        });
        await service.refresh();
        ok('‼️ a token that is expired ON THE CLOCK is refreshed BEFORE the endpoint is asked',
            refreshes.length === 1 && calls.length === 1 && calls[0] === 'tok-fresh');
        ok('…and the figure is live', service.current()[0].state === 'ok');
    }
    {
        // Somebody else — a CLI session in the same slot — refreshed it first.
        const { service, calls } = svc([slot('a')], {
            credLifeMs: -1000,
            refresh: () => ({ kind: 'live', token: 'tok-someone-elses' })
        });
        await service.refresh();
        ok('a grant another process already refreshed is used as it stands',
            calls[0] === 'tok-someone-elses' && service.current()[0].state === 'ok');
    }
    {
        // ‼️ WEATHER IS NOT A SIGN-OUT. The endpoint being unreachable says
        // nothing about the account, so the slot must stay in the fleet.
        const { service } = svc([slot('a')], {
            reply: () => ({ status: 401, body: '' }),
            refresh: () => ({ kind: 'unavailable', reason: 'the token endpoint could not be reached (ENOTFOUND)' })
        });
        await service.refresh();
        const u = service.current()[0];
        ok('‼️ a refresh that FAILED for machine reasons leaves the slot usable, not expired',
            u.state === 'error' && slotIsUsable(u));
        ok('…and the note says the account is fine and will refresh itself',
            /account is fine/.test(u.note || '') && /aged out/.test(u.note || ''));
    }
    {
        // A token minted seconds ago and still refused: now it really is a
        // person's job, and saying so is the whole value of the state.
        const { service, refreshes } = svc([slot('a')], {
            reply: () => ({ status: 401, body: '' }),
            refresh: () => ({ kind: 'refreshed', token: 'tok-fresh' })
        });
        await service.refresh();
        const u = service.current()[0];
        ok('a FRESHLY refreshed token that is still refused is a real sign-out',
            u.state === 'expired' && !slotIsUsable(u) && /freshly refreshed/.test(u.note || ''));
        ok('…and it is not retried for ever — one refresh, then the verdict', refreshes.length === 1);
    }
    {
        const { service, calls } = svc([slot('a')], {
            credLifeMs: -1000,
            refresh: () => ({ kind: 'rejected', reason: 'the refresh token expired on 2026-08-01' })
        });
        await service.refresh();
        const u = service.current()[0];
        ok('a dead refresh token is the sign-out — and the endpoint is never asked',
            u.state === 'expired' && calls.length === 0 && /expired on 2026-08-01/.test(u.note || ''));
    }

    // ---------- ‼️ X-204: a percentage is never bought with somebody's session ----------
    //
    // MEASURED against the live endpoint: an exchange ROTATES the refresh token
    // and REVOKES the access token in force. Refreshing a slot to read a figure
    // would therefore take the token away from a session running on it, mid
    // turn. A busy slot is left alone — and loses nothing, because the engine
    // using it refreshes the grant itself.
    {
        const { service, refreshes, calls } = svc([slot('a')], {
            credLifeMs: -1000,
            busy: () => true,
            refresh: () => ({ kind: 'refreshed', token: 'tok-fresh' })
        });
        await service.refresh();
        ok('‼️ a slot with a session running on it is NEVER exchanged',
            refreshes.length === 0);
        ok('…and the stale figure is reported as unknown-but-fine, not as a sign-out',
            service.current()[0].state !== 'expired' && slotIsUsable(service.current()[0]));
        ok('…having still tried the stored token once, in case it works', calls.length === 1);
    }
    {
        // The running session refreshes the grant itself, so a busy slot is
        // RE-READ rather than exchanged — and very often that is enough: the
        // second read finds the token the CLI in that slot wrote a moment ago.
        const { service, refreshes, calls, reads } = svc([slot('a')], {
            credLife: (n) => (n === 1 ? -1000 : 3600_000),
            busy: () => true
        });
        await service.refresh();
        ok('‼️ a busy slot is re-READ from disk, which costs nothing and revokes nothing',
            refreshes.length === 0 && reads.length === 2);
        ok('…and the token the running session wrote is the one that gets used',
            calls.length === 1 && calls[0] === 'tok-a-r2' && service.current()[0].state === 'ok');
    }

    // ---------- X-206: a person asked for THIS one ----------
    {
        const { service, calls, tick } = svc([slot('a'), slot('b'), slot('c')]);
        await service.refreshSlot('c');
        ok('‼️ the slot NAMED is the slot read — not whichever the round robin thinks is stalest',
            calls.length === 1 && calls[0] === 'tok-c');
        ok('…and it is the only figure that moved',
            service.current().filter(u => u.state === 'ok').map(u => u.slotId).join(',') === 'c');

        // Naming a slot buys no extra request: the floor is per MACHINE, and a
        // queue that could ignore it would be `refreshAll` wearing a hat.
        await service.refreshSlot('a');
        ok('‼️ …and it still spends nothing inside the shared floor', calls.length === 1);
        tick(6000); await service.refreshSlot('a');
        ok('past the floor the named slot is read', calls.length === 2 && calls[1] === 'tok-a');

        tick(6000); await service.refreshSlot('nobody');
        ok('a slot that is not captured is not invented into a request', calls.length === 2);
        tick(6000); await service.refreshSlot('');
        ok('…and neither is an empty name', calls.length === 2);
    }
    {
        const { service, calls } = svc([slot('cx', 'codex')]);
        await service.refreshSlot('cx');
        ok('an engine that publishes no figure is not fetched even when NAMED', calls.length === 0);
    }

    // ---------- an engine with no readable allowance costs ZERO requests ----------
    {
        const { service, calls } = svc([slot('cx', 'codex'), slot('gm', 'gemini')]);
        await service.refresh();
        ok('‼️ an engine that publishes no quota is never fetched — no wasted request',
            calls.length === 0);
        const u = service.current();
        /*
         * ‼️ X-215 CHANGED WHAT THESE TWO ROWS MEAN, and the difference is the
         * whole item. Codex publishes nothing to an ENDPOINT and is not silent:
         * it writes the figure into its own transcript, so its slot is now an
         * unread readable one rather than a `no-source` dead end. Gemini really
         * does publish nothing, and still says so in its adapter's own words.
         * Neither of them costs a request either way, which is what the
         * assertion above is about.
         */
        const cx = u.find(x => x.slotId === 'cx');
        const gm = u.find(x => x.slotId === 'gm');
        ok('‼️ X-215 — Codex is no longer told it has nothing to read',
            cx.state === 'error' && /costs no request/.test(cx.note || ''));
        ok('…and an engine that genuinely publishes nothing still says WHY, in the '
            + 'adapter\'s own words, instead of a blank bar',
            gm.state === 'no-source' && (gm.note || '').length > 30);
        // ‼️ NOT KNOWING IS NOT BEING BLOCKED. Codex states a plan it simply does
        // not publish; refusing to start a session there would turn "we cannot
        // see it" into "you cannot use it".
        ok('‼️ …and a slot with no readable figure is still usable', u.every(x => slotIsUsable(x)));
        ok('nothing is ever due on an engine with no figure to read',
            service.dueNext() === undefined);
        ok('a slot nobody has read yet is stated, not missing',
            unreadUsage(slot('z')).state === 'error' && unreadUsage(slot('z')).percent === -1);
    }

    // ---------- X-212: the indicator reads the account that is STANDING ----------
    //
    // ‼️ The failure this section exists to prevent is the quiet one: the status
    // bar goes on quoting the main sign-in's window while every session runs on
    // a standing slot, and the heading — which now carries a name — puts the new
    // account's name over the old account's figures. Two numbers, one of them
    // for a plan nobody is spending.
    {
        const { slotCredentialsFile } = require(
            path.join(__dirname, '..', 'out', 'core', 'accountUsage.js'));
        const { MACHINE_GLOBAL, accountLabelOf, slotLabel } = require(
            path.join(__dirname, '..', 'out', 'core', 'accountStore.js'));
        const { canIsolateAccounts } = require(
            path.join(__dirname, '..', 'out', 'core', 'engineAccounts.js'));

        ok('a Claude slot names the credentials file inside its own directory',
            slotCredentialsFile(slot('a')) === path.join('D:/slots/a', '.credentials.json'));
        ok('‼️ no slot is the MAIN sign-in and answers with nothing to read',
            slotCredentialsFile(undefined) === '');
        ok('…and so does an engine that keeps no readable credential',
            slotCredentialsFile(slot('cx', 'codex')) === '');

        ok('the absence of a slot has a NAME rather than being a blank',
            accountLabelOf(undefined) === MACHINE_GLOBAL && MACHINE_GLOBAL.length > 0);
        ok('…and a slot answers with what a person calls it',
            accountLabelOf({ id: 'a', engine: 'claude', dir: 'x', label: 'work' }) === 'work'
            && slotLabel({ id: 'a', engine: 'claude', dir: 'x', label: 'work' }) === 'work');

        // The axis exists where a variable can move the config directory, and
        // NOWHERE else — "no accounts captured" and "no such thing here" are
        // different answers and only the first deserves a Machine Global row.
        ok('‼️ the account axis is a fact about the engine, not about the list',
            canIsolateAccounts('claude') === true && canIsolateAccounts('codex') === true
            && canIsolateAccounts('gemini') === false && canIsolateAccounts('nosuch') === false);
    }

    // ---------- X-212: a cached percentage belongs to the sign-in it was read for ----------
    {
        const { PlanUsageService } = require(
            path.join(__dirname, '..', 'out', 'core', 'planusage.js'));
        let file = 'D:/home/.claude/.credentials.json';
        const read = [];
        const fetched = [];
        let clock = NOW;
        const service = new PlanUsageService({
            ttlMs: () => 300_000,
            now: () => clock,
            credentialsFile: () => file,
            readCreds: (f) => {
                read.push(f);
                // the dead slot answers the way a directory nobody signed into
                // does — and that answer must be stamped with ITS file too
                return /dead/.test(f)
                    ? undefined
                    : { token: 'tok', expiresAt: NOW + 3600_000, plan: 'max' };
            },
            fetchImpl: async () => {
                fetched.push(file);
                return { status: 200, body: payload(fetched.length * 10, NOW + 3600_000) };
            }
        });

        const first = await service.get();
        ok('the first read answers from the file it was pointed at', first.state === 'ok'
            && first.bars[0].percent === 10 && fetched[0] === 'D:/home/.claude/.credentials.json');

        clock += 1000;
        await service.get();
        ok('a second read inside the TTL costs nothing, as it always did', fetched.length === 1);

        // the standing account moves — the same instant, not at the next beat
        file = 'D:/slots/work/.credentials.json';
        clock += 1000;
        const after = await service.get();
        ok('‼️ the account moved, so the cached snapshot is DROPPED rather than aged out',
            fetched.length === 2 && fetched[1] === 'D:/slots/work/.credentials.json');
        ok('…and what comes back is the new account\'s figure, not the old one\'s',
            after.bars[0].percent === 20);

        clock += 1000;
        await service.get();
        ok('the new account then caches like any other', fetched.length === 2);

        // ‼️ and a FAILURE is stamped with its source too: an unreadable slot
        // must not look like a fresh cache for whoever the user moves to next.
        file = 'D:/slots/dead/.credentials.json';
        clock += 1000;
        const dead = await service.get();
        ok('an account with no sign-in in it says so instead of showing the last one\'s bars',
            dead.state === 'no-auth' && fetched.length === 2);
        file = 'D:/slots/work/.credentials.json';
        clock += 1000;
        const back = await service.get();
        ok('‼️ moving back off an unreadable account re-reads rather than serving its snapshot',
            fetched.length === 3 && back.state === 'ok' && back.bars[0].percent === 30);
        ok('every read named the file it was pointed at, in order',
            read.length === 4 && read[3] === 'D:/slots/work/.credentials.json');
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

    // ---------- X-207: the pool the user allowed, and how it is walked --------
    /*
     * ‼️ `mostRoom` answers one question — who has the most room — and the
     * campaign now has a second: WHOSE TURN IS IT, given that the user picked
     * these accounts in this order and asked for one of two strategies. The two
     * are separate functions rather than a flag on one, because the free pool
     * IS `mostRoom` and a strategy that reimplemented it would drift from it.
     */
    {
        const at = (id, pct, engine = 'claude', resets = 0, state = 'ok') => ({
            slotId: id, engine, state, percent: pct, resetsAt: resets, plan: 'pro', fetchedAt: NOW
        });
        // Two engines, and the fullest account happens to be on the primary.
        const mixed = [at('c1', 70), at('c2', 40), at('x1', 5, 'codex'), at('x2', 60, 'codex')];

        ok('the free pool ignores the engine and takes the most room anywhere',
            pickAccount(mixed, { rotation: 'free' }).slotId === 'x1');
        ok('…which is what an unset strategy does, because that is the old behaviour',
            pickAccount(mixed, {}).slotId === 'x1');

        // ‼️ TIERED IS A PROMISE NOT TO WANDER. The whole point of the second
        // strategy is that a usable primary account is spent BEFORE a roomier
        // secondary one — otherwise it is the free pool with extra words.
        ok('‼️ tiered stays in the first tier while anything there is usable',
            pickAccount(mixed, { rotation: 'tiered' }).slotId === 'c2');
        ok('…and picks the most room WITHIN that tier, not merely the first listed',
            pickAccount([at('c1', 70), at('c2', 40), at('x1', 5, 'codex')],
                { rotation: 'tiered' }).slotId === 'c2');

        // The fallback the item exists for: the primary is walled, so rather
        // than sleeping the night away the campaign moves to the next engine.
        const walled = [at('c1', 95), at('c2', 97), at('x1', 20, 'codex'), at('x2', 8, 'codex')];
        ok('‼️ the whole first tier being walled is what moves it to the second',
            pickAccount(walled, { rotation: 'tiered', ceiling: 90 }).slotId === 'x2');
        ok('…and every tier walled offers nothing, so the campaign can sleep',
            pickAccount([at('c1', 95), at('x1', 99, 'codex')],
                { rotation: 'tiered', ceiling: 90 }) === undefined);

        // ‼️ THE ORDER OF THE POOL IS THE ORDER OF THE TIERS. The user picks
        // accounts in a list; that list is the priority, so no second field
        // states it and the two can never disagree.
        ok('‼️ tier order is first-appearance order in the list',
            pickAccount([at('x1', 60, 'codex'), at('c1', 5)], { rotation: 'tiered' }).slotId === 'x1');
        ok('…and a named primary engine outranks that order',
            pickAccount([at('x1', 60, 'codex'), at('c1', 5)],
                { rotation: 'tiered', engine: 'claude' }).slotId === 'c1');
        // A primary that is not in the pool at all is not a tier — it is a
        // campaign whose engine the user simply did not include.
        ok('a primary engine with no account in the pool does not invent a tier',
            pickAccount([at('x1', 60, 'codex'), at('x2', 20, 'codex')],
                { rotation: 'tiered', engine: 'claude' }).slotId === 'x2');

        ok('one engine makes tiered a free pool over that engine, not a refusal',
            pickAccount([at('c1', 70), at('c2', 40)], { rotation: 'tiered' }).slotId === 'c2');

        /* ---------- X-258 — the rotation as a LINE, so a card can draw it ----
         *
         * ‼️ THE ASSERTION THAT MATTERS IS THE IDENTITY, not the ordering.
         * The card has to say who is NEXT, and the only honest way is to ask the
         * thing that will really decide — so `pickAccount` is the HEAD of this
         * line rather than a second implementation beside it. If those two ever
         * part company the page starts describing a rotation the campaign does
         * not perform, which is the whole defect the item was opened for.
         * ------------------------------------------------------------------ */
        const ids = l => l.map(u => u.slotId);
        const head = (l, o) => {
            const pick = pickAccount(l, o);
            const line = accountOrder(l, o);
            return (pick ? pick.slotId : undefined) === (line[0] ? line[0].slotId : undefined);
        };
        ok('‼️ X-258 — pickAccount IS the head of the line, under every strategy',
            head(mixed, { rotation: 'free' }) && head(mixed, {})
            && head(mixed, { rotation: 'tiered' })
            && head(walled, { rotation: 'tiered', ceiling: 90 })
            && head([at('x1', 60, 'codex'), at('c1', 5)], { rotation: 'tiered', engine: 'claude' })
            && head([], { rotation: 'tiered' }));
        ok('the free pool\u2019s line is emptiest-first',
            JSON.stringify(ids(accountOrder(mixed, { rotation: 'free' })))
                === JSON.stringify(['x1', 'c2', 'x2', 'c1']));
        // ‼️ AND IT IS TRUE ACROSS A TIER BOUNDARY, which is exactly the moment
        // the user cannot work out for themselves: the whole primary tier first,
        // emptiest-first inside it, then the next engine's.
        ok('‼️ …and tiered lays each tier\u2019s line end to end, primary first',
            JSON.stringify(ids(accountOrder(mixed, { rotation: 'tiered' })))
                === JSON.stringify(['c2', 'c1', 'x1', 'x2']));
        // ‼️ A WALLED ACCOUNT IS OUT OF THE LINE, NOT LAST IN IT. Drawing it as
        // last would offer the reader a turn the rotation will never give it.
        ok('‼️ an account at the ceiling is not in the line at all',
            JSON.stringify(ids(accountOrder(walled, { rotation: 'tiered', ceiling: 90 })))
                === JSON.stringify(['x2', 'x1']));
        // A MEASURED account beats an unread one wherever both are usable — the
        // rule `mostRoom` has always followed, now visible along the whole line.
        const unread = { slotId: 'u1', engine: 'claude', state: 'ok', percent: -1, resetsAt: 0, plan: 'pro', fetchedAt: 0 };
        ok('an unread account sits behind every measured one, never in front',
            JSON.stringify(ids(roomOrder([unread, at('c1', 70), at('c2', 40)])))
                === JSON.stringify(['c2', 'c1', 'u1']));
        // …and among equals the user's own list order stands (the sort is stable),
        // which is the same rule the tiers themselves follow.
        ok('equal figures keep the order the user listed them in',
            JSON.stringify(ids(roomOrder([at('c1', 40), at('c2', 40), at('c3', 40)])))
                === JSON.stringify(['c1', 'c2', 'c3']));
        ok('an empty pool offers nothing under either strategy',
            pickAccount([], { rotation: 'tiered' }) === undefined
            && pickAccount([], { rotation: 'free' }) === undefined);
        // Same rule as `mostRoom`: a measured account beats a guess, and it must
        // hold inside a tier too or the fallback would jump on an unread slot.
        ok('a measured account still beats an unread one inside a tier',
            pickAccount([{ ...at('unread', -1), state: 'no-source' }, at('known', 44)],
                { rotation: 'tiered' }).slotId === 'known');
    }

    // ---------- X-261: the measurer TELLS somebody, campaign or not -------
    // The announcement of a fallen sign-in used to live inside the sentry
    // turn, behind `if (!this.sentry) return`, so a token that died while the
    // user was working by hand across three accounts was said by nobody. The
    // seam belongs on the only thing that measures, and it fires on EVERY
    // settled figure — judging what changed is the listener's business.
    {
        const heard = [];
        const { service, tick } = svc([slot('a'), slot('b')], { onRead: u => heard.push(u) });
        await service.beat();
        ok('‼️ a settled figure tells the listener, with nothing running',
            heard.length === 1 && Array.isArray(heard[0]) && heard[0].length === 2);
        tick(10 * 60_000);
        await service.beat();
        ok('…and again on the next one, so nothing depends on a campaign', heard.length === 2);
        ok('…and it is handed everything known, not only the slot just read',
            heard[1].every(u => typeof u.slotId === 'string'));
    }
    {
        // A listener that throws must never break a read: the figure is the
        // product's, the announcement is a courtesy on top of it.
        const { service } = svc([slot('a')], { onRead: () => { throw new Error('boom'); } });
        const out = await service.beat();
        ok('‼️ a listener that throws does not cost the figure', out.length === 1);
    }
    {
        // And the live wire, which is the half that gets forgotten: the
        // extension really hands the seam in, and the campaign no longer
        // posts the sentence itself (two announcers = two notices per fall).
        const ext = require('fs').readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
        ok('‼️ extension.ts wires the announcement onto the thing that measures',
            ext.includes('onRead: usage => announceSlotHealth(usage)'));
        ok('…the fleet remembers what it already said, outliving every campaign',
            ext.includes('DOWN_SLOTS_KEY') && ext.includes('globalState.update(DOWN_SLOTS_KEY'));
        ok('…and the sentry turn no longer posts it itself',
            !ext.includes('for (const id of health?.newlyDown'));
    }

    console.log(`${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.log('  FAIL threw: ' + (e && e.stack || e)); process.exit(1); });
