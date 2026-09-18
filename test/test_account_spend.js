/**
 * X-252 — SPEND, GROUPED BY THE SIGN-IN THAT PAID FOR IT.
 *
 * The defect this closes is an ABSENCE, so the assertions are mostly about what
 * the module refuses to do: it does not guess an account onto a session that
 * has no manifest, it does not slice a session total across a window boundary,
 * and it does not let an engine that publishes no price look like a free run.
 *
 *   node test/test_account_spend.js
 */
const path = require('path');

const {
    spendByAccount, todayWindow, lastDaysWindow
} = require(path.join(__dirname, '..', 'out', 'core', 'accountSpend.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

const DAY = 86_400_000;
const NOW = new Date(2026, 8, 14, 12, 0, 0).getTime();
const key = (ts) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const TODAY = key(NOW), YESTERDAY = key(NOW - DAY);

const session = (o) => Object.assign({
    sessionId: 's', cost: 0, wTokens: 0, firstTs: NOW, lastTs: NOW
}, o);

// The reader the extension hands in: a manifest, or nothing at all.
const from = (map) => (s) => map[s.sessionId]
    ? { id: map[s.sessionId], label: map[s.sessionId] + '@x' } : undefined;

// ---------------------------------------------------------------- attribution
{
    const rows = [
        session({ sessionId: 'a', cost: 3, wTokens: 300, daily: { [TODAY]: { cost: 3, wTokens: 300 } } }),
        session({ sessionId: 'b', cost: 1, wTokens: 100, daily: { [TODAY]: { cost: 1, wTokens: 100 } } }),
        session({ sessionId: 'c', cost: 5, wTokens: 500, daily: { [TODAY]: { cost: 5, wTokens: 500 } } })
    ];
    const r = spendByAccount(rows, from({ a: 'work', b: 'work' }), todayWindow(NOW));
    ok('a sign-in\'s sessions are summed under it',
        r.rows.length === 1 && r.rows[0].account === 'work'
        && r.rows[0].cost === 4 && r.rows[0].wTokens === 400 && r.rows[0].sessions === 2);
    ok('…and it carries the label the reader gave it', r.rows[0].label === 'work@x');
    ok('‼️ A SESSION WITH NO MANIFEST IS NOT GUESSED ONTO ANYBODY',
        r.unattributed.cost === 5 && r.unattributed.sessions === 1
        && !r.rows.some(x => x.account === ''));
    ok('…and the unattributed row says what it is', r.unattributed.label === 'not attributed');
}

// ------------------------------------------------------------------ the day
{
    const over = session({
        sessionId: 'm', cost: 10, wTokens: 1000,
        daily: { [YESTERDAY]: { cost: 7, wTokens: 700 }, [TODAY]: { cost: 3, wTokens: 300 } }
    });
    const t = spendByAccount([over], from({ m: 'work' }), todayWindow(NOW));
    ok('‼️ A CONVERSATION OVER MIDNIGHT IS SPLIT WHERE IT REALLY FELL',
        t.rows[0].cost === 3 && t.rows[0].wTokens === 300);
    const both = spendByAccount([over], from({ m: 'work' }), lastDaysWindow(NOW, 2));
    ok('…and both of its days are there over a wider window', both.rows[0].cost === 10);
    const older = spendByAccount([over], from({ m: 'work' }), { from: '2026-01-01', to: '2026-01-31' });
    ok('…and none of it lands in a window it did not touch', older.rows.length === 0);
}

// ------------------------------------------- a session with no daily buckets
{
    const whole = session({
        sessionId: 'w', cost: 4, wTokens: 400, source: 'codex',
        firstTs: NOW - 3600_000, lastTs: NOW
    });
    const inside = spendByAccount([whole], from({ w: 'work' }), todayWindow(NOW));
    ok('an engine that writes no day buckets still counts when it fits the window',
        inside.rows[0].cost === 4 && inside.rows[0].unsplit === 0
        && inside.rows[0].engines.join() === 'codex');

    const straddle = session({
        sessionId: 'x', cost: 4, wTokens: 400, source: 'codex',
        firstTs: NOW - DAY, lastTs: NOW
    });
    const cut = spendByAccount([straddle], from({ x: 'work' }), todayWindow(NOW));
    ok('‼️ AND IS NEVER SLICED BY A RATIO NOBODY MEASURED — it is reported instead',
        cut.rows[0].cost === 0 && cut.rows[0].unsplit === 1 && cut.rows[0].sessions === 0);
}

// ------------------------------------------------------------- zero vs free
{
    const rows = [session({
        sessionId: 'g', cost: 0, wTokens: 90, source: 'antigravity',
        daily: { [TODAY]: { cost: 0, wTokens: 90 } }
    })];
    const r = spendByAccount(rows, from({ g: 'work' }), todayWindow(NOW),
        (e) => e !== 'antigravity');
    ok('‼️ A ZERO FROM AN ENGINE THAT STATES NO PRICE IS COUNTED AS ONE',
        r.rows[0].unpriced === 1 && r.rows[0].sessions === 1 && r.rows[0].cost === 0);
    const priced = spendByAccount(rows, from({ g: 'work' }), todayWindow(NOW));
    ok('…and an engine that does state one is not marked', priced.rows[0].unpriced === 0);
}

// -------------------------------------------------------- what is not counted
{
    const rows = [
        session({ sessionId: 'p', cost: 9, daily: { [TODAY]: { cost: 9, wTokens: 0 } } }),
        session({ sessionId: 'q', cost: 9, isSidechain: true, daily: { [TODAY]: { cost: 9, wTokens: 0 } } }),
        session({ sessionId: 'r', cost: 9, aliasOf: 'p', daily: { [TODAY]: { cost: 9, wTokens: 0 } } })
    ];
    const r = spendByAccount(rows, from({ p: 'work', q: 'work', r: 'work' }), todayWindow(NOW));
    ok('a sidechain and an import alias are not charged a second time',
        r.rows[0].cost === 9 && r.rows[0].sessions === 1);
}

// ------------------------------------------------------------------ ordering
{
    const rows = [
        session({ sessionId: 'a', cost: 1, daily: { [TODAY]: { cost: 1, wTokens: 0 } } }),
        session({ sessionId: 'b', cost: 8, daily: { [TODAY]: { cost: 8, wTokens: 0 } } })
    ];
    const r = spendByAccount(rows, from({ a: 'small', b: 'big' }), todayWindow(NOW));
    ok('the heaviest sign-in is first', r.rows.map(x => x.account).join() === 'big,small');
}

// ------------------------------------------ X-112: a route that is not the plan
{
    // Three runs the same sign-in sealed: one on its plan, one through Kimi,
    // one on an Anthropic API key. Kimi's tokens never touched the plan window
    // and Claude's dollar figure for it is at the Anthropic tariff — not a
    // bill; the key's tokens are on no window either, but its dollars ARE the
    // bill. Every one of them is still this sign-in's run.
    const rows = [
        session({ sessionId: 'plan', cost: 2, wTokens: 200, daily: { [TODAY]: { cost: 2, wTokens: 200 } } }),
        session({ sessionId: 'kimi', cost: 5, wTokens: 500, daily: { [TODAY]: { cost: 5, wTokens: 500 } } }),
        session({ sessionId: 'key', cost: 3, wTokens: 300, daily: { [TODAY]: { cost: 3, wTokens: 300 } } })
    ];
    const billing = {
        plan: { mode: 'plan', planWindow: true, cost: 'estimate' },
        kimi: { mode: 'third-party', planWindow: false, cost: 'none' },
        key: { mode: 'api', planWindow: false, cost: 'engine-reported' }
    };
    const r = spendByAccount(rows, from({ plan: 'work', kimi: 'work', key: 'work' }), todayWindow(NOW),
        () => true, s => billing[s.sessionId]);
    const w = r.rows[0];
    ok('‼️ a Kimi run\'s ⚖ tokens are NOT on the plan window, and neither are a key\'s',
        w.wTokens === 200);
    ok('‼️ Claude\'s Anthropic-tariff figure for the Kimi run is not added as a bill; the key\'s bill is',
        w.cost === 5);
    ok('…all three are still the sign-in\'s runs, and the two off-plan ones are counted as such',
        w.sessions === 3 && w.offPlan === 2);
    ok('…and a Codex run on its own sign-in keeps its own weighting — it is not "off-plan"',
        (() => {
            const c = spendByAccount([session({ sessionId: 'cx', source: 'codex', cost: 1, wTokens: 90, daily: { [TODAY]: { cost: 1, wTokens: 90 } } })],
                from({ cx: 'gpt' }), todayWindow(NOW), () => true,
                () => ({ mode: 'engine', planWindow: false, cost: 'estimate' }));
            return c.rows[0].wTokens === 90 && c.rows[0].offPlan === 0;
        })());
    const plain = spendByAccount(rows, from({ plan: 'work', kimi: 'work', key: 'work' }), todayWindow(NOW));
    ok('without a billing reader every run is on its plan, as before routes existed',
        plain.rows[0].wTokens === 1000 && plain.rows[0].offPlan === 0);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) { process.exitCode = 1; }
