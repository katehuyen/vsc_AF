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

    /**
     * ‼️ U-142 — A NEXT STEP NAMES THE SETTING AND NEVER SAYS "HERE".
     *
     * This card is drawn on Farm Settings, on the Telegram page and in the
     * bridge's own answers, so "here" meant a different place on each of them.
     * On Farm Settings it pointed at a card carrying no control at all, while
     * the box it meant was a separate row further down — a reader who followed
     * it found nothing to type into. The rule is measured across EVERY state,
     * not patched on the one that was reported.
     */
    [['disabled', { enabled: false }], ['no-token', { hasToken: false }],
        ['no-chats', { allowCount: 0 }], ['over-budget', { blocked: true }],
        ['error', { lastError: 'socket hang up' }]].forEach(([s, input]) => {
        const got = st(input);
        const text = String(got.next || '');
        eq(`the "${s}" input really is that state`, got.state, s);
        ok(`…and its next step does not send the reader "here"`,
            text !== '' && !/\bhere\b/.test(text));
    });
    ok('…and the empty-allowlist one names the setting the id goes into',
        /agentFarm\.telegram\.allowedChats/.test(String(st({ allowCount: 0 }).next || '')));

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

    /**
     * ‼️ audit B-05 — THE CEILING IS A STATE, and it was not one.
     *
     * `dist/render/tgsettings.s4.png` — the scene whose own title is "the day's
     * ceiling is reached" — drew `$0.4102 / $0.25` with the bar in red under a
     * green `● connected` badge reading "Polling Telegram and answering the
     * chats on the allowlist". `chatRunPrompt` refuses every prompt in that
     * state ("Today's chat budget is used up"), so the badge was telling
     * somebody their phone could start a run when it could not.
     */
    eq('a bridge at its daily ceiling is not "connected"',
        st({ blocked: true }).state, 'over-budget');
    ok('…and the poller is still alive, because it is the RUNS that are refused',
        st({ blocked: true }).running === true);
    ok('…and it says which number to raise',
        /maxDailyUSD/.test(st({ blocked: true }).next || ''));
    eq('…but an empty allowlist beats it — nothing reaches the budget at all',
        st({ blocked: true, allowCount: 0 }).state, 'no-chats');
    eq('…and a network error beats it too',
        st({ blocked: true, lastError: 'boom' }).state, 'error');

    // The tones are what the page paints. Kept as an answer rather than an `if`
    // on the page, so a new state cannot arrive with no colour — and the list
    // is READ off the answer rather than typed here, which is how the sixth
    // state was added with this assertion still green.
    const STATES = Object.keys(T.TONE_OF);
    ok(`every state the module declares carries a tone (${STATES.length})`,
        STATES.length >= 6
        && STATES.every(s => ['off', 'ok', 'warn', 'bad'].indexOf(T.TONE_OF[s]) >= 0));
    ok('every state has a sentence a person can read',
        STATES.every(s => typeof T.DETAIL_OF[s] === 'string' && T.DETAIL_OF[s].length > 20));
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

// ---------- ONE CARD, TWO SURFACES: the composer both pages go through ----------
//
// ‼️ WHAT THIS SECTION IS WATCHING. U-84 asks for this card in the Toolbox AND
// in Farm Settings, and a card written twice disagrees the first day one copy is
// touched — in green, on the page nobody updated. `telegramCard` is the single
// composer; these checks are what makes a second one impossible to add quietly.
{
    const day = '2026-08-30';
    const card = o => T.telegramCard(Object.assign({
        enabled: true, hasToken: true, allowedChats: [-1001, 88], maxDailyUSD: 1,
        defaultAgent: 'developer', ledger: { day, usd: 0.25 }, day
    }, o));

    const c = card({ botUsername: 'muvu_farm_bot' });
    eq('the composed card carries the badge the core decided', c.status.state, 'connected');
    eq('…and the same tone the badge is painted with', c.status.tone, 'ok');
    eq('…and the budget the ledger really shows', c.budget.spent, 0.25);
    eq('…and the bot name, when something has asked Telegram for it', c.botUsername, 'muvu_farm_bot');

    // ‼️ NEVER THE TOKEN. The card travels into a webview; a token that reached
    // this object would be one JSON.stringify away from the page.
    ok('the card carries whether there is a token, never the token',
        Object.keys(c).indexOf('token') < 0 && c.hasToken === true);

    // The allowlist decides the badge, so a card that quietly kept a junk entry
    // would report "connected" for a list that admits nobody.
    const junk = card({ allowedChats: [88, 'x', null, NaN, 1e21] });
    eq('a chat id that is not a real number is dropped rather than counted',
        junk.allowedChats, [88, 1e21]);

    const empty = card({ allowedChats: [] });
    eq('an empty allowlist is polling-but-deaf, not off', empty.status.state, 'no-chats');
    ok('…and the poller is still reported as alive, because it is', empty.status.running === true);

    const off = card({ enabled: false });
    eq('switched off outranks everything else', off.status.state, 'disabled');
    ok('…and nothing is polled', off.status.running === false);

    // ‼️ THE COMPOSER IS THE ONE BOTH PANELS USE. The check is on the source
    // rather than on behaviour, because the failure it guards against is a
    // second panel quietly growing its own four lines of `enabled && hasToken`.
    const base = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'base.ts'), 'utf8');
    ok('the shared panel module composes the card through the core',
        /telegramCard\(/.test(base));
    for (const p of ['toolboxPanel.ts', 'settingsPanel.ts']) {
        const src = fs.readFileSync(path.join(ROOT, 'src', 'panels', p), 'utf8');
        ok(`${p} asks for the shared card rather than deriving one`,
            /telegramCardData\(/.test(src) && !/bridgeStatus\(/.test(src));
        ok(`${p} hands the card's messages to the shared handler`,
            /telegramCardMessage\(/.test(src));
    }
    // And the page draws it from one file too — a second card in HTML is the
    // same defect one layer up.
    for (const p of ['toolbox.js', 'settings.js']) {
        const src = p === 'settings.js' ? require('./lib_settings_source').settingsPageSource() : fs.readFileSync(path.join(ROOT, 'media', p), 'utf8');
        ok(`media/${p} draws the card with the shared component`,
            /window\.AFTelegram\.card\(/.test(src));
    }
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
