// U-84 — THE TELEGRAM BRIDGE COCKPIT, AND THE STATE IT IS ALLOWED TO CLAIM.
//
// ‼️ WHAT THIS SUITE IS ACTUALLY WATCHING. A management card is a claim about a
// running service, and a card that says "Connected" while nothing is listening
// is worse than no card at all — the person stops checking. So the card draws
// NOTHING it works out for itself: every badge, every figure and every refusal
// comes from a pure function here, measured against what `applyChatBridge()`
// (extension.ts) really does.
//
// The one subtlety worth writing down, because it was MEASURED rather than
// assumed: an empty allowlist does NOT stop the poller. `applyChatBridge` warns
// and starts it anyway, and every message is then refused by `isAllowed`. So
// "running" and "usable" are two different questions, and a card that collapsed
// them into one badge would tell the truth about neither.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`,
    JSON.stringify(got) === JSON.stringify(want));

const T = require(path.join(ROOT, 'out', 'core', 'telegramCockpit.js'));

// ---------- THE BADGE: five states, and each one names what to do next ----------
{
    const st = o => T.bridgeStatus(Object.assign(
        { enabled: true, hasToken: true, allowCount: 1 }, o));

    eq('switched off is its own state, not an error',
        st({ enabled: false }).state, 'disabled');
    ok('…and an off bridge is not running', st({ enabled: false }).running === false);

    eq('no token is the first thing that stops it',
        st({ hasToken: false }).state, 'no-token');
    ok('…and it says how to get one',
        /Connect Telegram/i.test(st({ hasToken: false }).next || ''));

    // ‼️ MEASURED, NOT ASSUMED — see the header. The poller starts with an empty
    // allowlist; it just refuses everything that arrives.
    eq('an empty allowlist is a warning, not a stop',
        st({ allowCount: 0 }).state, 'no-chats');
    ok('…and the poller really is running in that state',
        st({ allowCount: 0 }).running === true);

    eq('a healthy bridge is connected', st({}).state, 'connected');
    ok('…and running', st({}).running === true);

    eq('a poll failure is shown as an error',
        st({ lastError: 'getaddrinfo ENOTFOUND' }).state, 'error');
    // The poller backs off and retries rather than giving up, so it is alive.
    ok('…and an erroring poller is still alive, because it backs off and retries',
        st({ lastError: 'boom' }).running === true);

    // ‼️ PRECEDENCE IS A DECISION. A bridge that is switched off has no token
    // problem, no chat problem and no network problem — reporting one of those
    // would send somebody to fix a thing that is not wrong.
    eq('off beats every other complaint',
        st({ enabled: false, hasToken: false, allowCount: 0, lastError: 'boom' }).state, 'disabled');
    eq('a missing token beats a network error, because it explains it',
        st({ hasToken: false, lastError: 'boom' }).state, 'no-token');
    eq('an error beats an empty allowlist — the network is the louder problem',
        st({ allowCount: 0, lastError: 'boom' }).state, 'error');

    // The four tones are what the page paints. Kept as an answer rather than an
    // `if` on the page, so a sixth state cannot arrive with no colour.
    eq('every state carries a tone the page can paint',
        ['disabled', 'no-token', 'no-chats', 'connected', 'error'].map(s => T.TONE_OF[s]),
        ['off', 'bad', 'warn', 'ok', 'bad']);
    ok('every state has a sentence a person can read',
        ['disabled', 'no-token', 'no-chats', 'connected', 'error']
            .every(s => typeof T.DETAIL_OF[s] === 'string' && T.DETAIL_OF[s].length > 20));
}

// ---------- ADDING A CHAT ID: the refusals are the feature ----------
{
    const p = (t, list) => T.parseChatId(t, list || []);

    ok('a plain id is accepted', p('12345').ok === true);
    eq('…and comes back as a number, not the text somebody typed', p(' 12345 ').id, 12345);

    // ‼️ A GROUP CHAT ID IS NEGATIVE. Refusing the minus sign would make the
    // whole feature unusable for exactly the case it is most wanted in.
    ok('a group id is negative and must be accepted', p('-1001234567890').ok === true);
    eq('…and keeps its sign', p('-1001234567890').id, -1001234567890);

    ok('empty is refused', p('').ok === false);
    ok('a bot name is not a chat id', p('@my_bot').ok === false);
    ok('…and the refusal says what a chat id looks like',
        /number/i.test(p('@my_bot').error || ''));
    ok('a decimal is not a chat id', p('12.5').ok === false);
    ok('a number too large to be exact is refused rather than rounded',
        p('123456789012345678901').ok === false);

    // A duplicate is refused by NAME rather than silently deduped: pressing add
    // and seeing nothing happen is indistinguishable from a broken button.
    ok('an id already on the list is refused', p('99', [99]).ok === false);
    ok('…and the refusal says it is already there',
        /already/i.test(p('99', [99]).error || ''));
    ok('a different id is still fine with a populated list', p('100', [99]).ok === true);
}

// ---------- THE BUDGET READING: one source of truth, shared with the rule ----------
{
    const day = '2026-08-30';
    const r = T.budgetReading({ day, usd: 0.4 }, 1, day);
    eq('spent today', r.spent, 0.4);
    eq('cap', r.cap, 1);
    eq('remaining', r.remaining, 0.6);
    eq('percentage of the cap used', r.pct, 40);
    ok('there is room, so runs are allowed', r.blocked === false);

    // Yesterday's total is not today's spend — the ledger rolls over.
    const stale = T.budgetReading({ day: '2026-08-29', usd: 5 }, 1, day);
    eq('yesterday spend does not count against today', stale.spent, 0);
    ok('…so today is not blocked by it', stale.blocked === false);

    const over = T.budgetReading({ day, usd: 1.2 }, 1, day);
    ok('over the cap is blocked', over.blocked === true);
    eq('…and remaining never goes negative', over.remaining, 0);
    eq('…and the bar does not run past full', over.pct, 100);

    // A cap of 0 means "no chat-started runs at all" (messaging.withinBudget).
    const zero = T.budgetReading({ day, usd: 0 }, 0, day);
    ok('a cap of zero blocks everything', zero.blocked === true);
    eq('…and reads as full rather than as an empty bar', zero.pct, 100);

    // ‼️ DERIVED, NOT RESTATED. The rule that decides whether a run may start
    // lives in messaging.ts and is used by the chat handler; a card that
    // re-implemented the comparison would drift from it silently.
    const src = fs.readFileSync(path.join(ROOT, 'src', 'core', 'telegramCockpit.ts'), 'utf8');
    ok('the card asks the same rule the bridge obeys, rather than copying it',
        /withinBudget/.test(src) && /from '\.\/messaging'/.test(src));
}

// ---------- ‼️ THE BADGE MUST STOP LYING WHEN THE NETWORK COMES BACK ----------
//
// The card shows the poller's last complaint. Clearing that complaint when a
// MESSAGE arrives is not enough and the difference is not academic: a bridge
// nobody is texting polls all day and receives nothing, so an error from this
// morning would still be on the badge at teatime, sending somebody to fix a
// connection that healed hours ago. The signal has to be "a poll completed",
// not "a poll produced work".
{
    const { TelegramPoller } = require(path.join(ROOT, 'out', 'core', 'telegram.js'));

    const runPoller = async (replies, waitMs) => {
        const seen = { polls: 0, errors: [], messages: 0 };
        let i = 0;
        const p = new TelegramPoller({
            token: 'x', offset: 0,
            onMessages: () => { seen.messages++; },
            onError: e => { seen.errors.push(e.message); },
            onPoll: () => { seen.polls++; },
            // The transport, injected. Without this the only way to exercise the
            // loop is a real network call, which is why it was never tested.
            fetch: async () => {
                const r = replies[Math.min(i++, replies.length - 1)];
                if (r instanceof Error) { throw r; }
                return r;
            }
        });
        p.start();
        await new Promise(r => setTimeout(r, waitMs || 60));
        p.stop();
        return seen;
    };

    const empty = { ok: true, result: [] };

    return runPoller([empty]).then(async seen => {
        ok('a poll that returned nothing still reports that it completed', seen.polls >= 1);
        ok('…and reports no error', seen.errors.length === 0);
        ok('…and does not invent a message', seen.messages === 0);

        // ‼️ 2.3s ON PURPOSE. The first retry after a failure waits the
        // poller's own 2s backoff, so this exercises the REAL recovery path
        // rather than a shortened imitation of it — which is the path the badge
        // depends on and the only one worth proving.
        const failed = await runPoller([new Error('ENOTFOUND'), empty], 2300);
        ok('a failed poll is reported as an error', failed.errors.length >= 1);
        ok('…and the poll that succeeds after it reports completion, so the badge can clear',
            failed.polls >= 1);

        console.log(`${pass} passed, ${fail} failed`);
        process.exit(fail ? 1 : 0);
    });
}
