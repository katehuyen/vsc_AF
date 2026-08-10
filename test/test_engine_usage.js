// U-27 — what is left on THIS engine's plan.
//
// The complaint: the status bar's remaining-limit figure was Claude's, on a
// machine running four engines, with nothing on it saying so. These assertions
// are about the two halves of the answer — the engine that publishes a real
// quota where nobody had looked (Codex writes it into its own transcripts), and
// the engines that publish none, which must say "not published" and never 0%.
//
// The fixture is the REAL shape, read off this machine 2026-08-10 from
// ~/.codex/sessions/2026/08/10/rollout-*.jsonl.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const { readCodexLimits, readCodexUsage, readEngineUsage, usageSummary, windowTitle } =
    require(path.join(__dirname, '..', 'out', 'core', 'engineUsage.js'));

const NULL_LINE = JSON.stringify({
    timestamp: '2026-07-19T09:06:06.611Z', type: 'event_msg',
    payload: { type: 'token_count', info: { total_token_usage: { total_tokens: 19340 } }, rate_limits: null }
});
const REAL_LINE = JSON.stringify({
    timestamp: '2026-08-10T18:28:59.000Z', type: 'event_msg',
    payload: {
        type: 'token_count',
        info: { total_token_usage: { total_tokens: 51230 } },
        rate_limits: {
            limit_id: 'codex', limit_name: null,
            primary: { used_percent: 7, window_minutes: 10080, resets_at: 1786903688 },
            secondary: null,
            credits: { has_credits: false, unlimited: false, balance: '0' },
            individual_limit: null, spend_control_reached: null,
            plan_type: 'plus', rate_limit_reached_type: null
        }
    }
});
const LATER_LINE = REAL_LINE.replace('"used_percent":7', '"used_percent":23');

// ---------- the block itself ----------
{
    const l = readCodexLimits([NULL_LINE, REAL_LINE].join('\n'));
    ok('the quota Codex wrote down is found', !!l && l.used === 7);
    ok('…with its window and its plan', l.windowMinutes === 10080 && l.plan === 'plus');
    ok('‼️ resets_at is SECONDS on this engine, and is read as such',
        l.resetsAt === 1786903688 * 1000);
    ok('a null rate_limits is not an answer', readCodexLimits(NULL_LINE) === undefined);
    ok('…and does not shadow a real one later in the file',
        readCodexLimits([REAL_LINE, NULL_LINE].join('\n')).used === 7);
    ok('‼️ the LAST reading wins — a quota is a moving figure',
        readCodexLimits([REAL_LINE, LATER_LINE].join('\n')).used === 23);
    ok('rubbish is not a reading', readCodexLimits('{nope') === undefined);
    ok('nothing is not a reading', readCodexLimits(undefined) === undefined);
}

// ---------- window names are derived, not invented ----------
{
    ok('10080 minutes is a week', windowTitle(10080) === 'Current week');
    ok('300 minutes is a 5h window', windowTitle(300) === 'Current 5h window');
    ok('1440 minutes is a day', windowTitle(1440) === 'Current day');
    ok('an unstated window still has a name', windowTitle(0) === 'Current window');
}

// ---------- Codex, through the probe ----------
const probe = (files, tails) => ({
    newestFiles: () => files,
    readTail: (p) => tails[p]
});
{
    const u = readCodexUsage(
        probe(['a.jsonl'], { 'a.jsonl': [NULL_LINE, REAL_LINE].join('\n') }),
        () => 1786903000000);
    ok('Codex reports a real reading', u.state === 'ok' && u.bars.length === 1);
    ok('…as a percentage with a reset time', u.bars[0].percent === 7 && u.bars[0].resetsAt > 0);
    ok('…named after the window it covers', u.bars[0].title === 'Current week');
    ok('‼️ …stamped with the TURN\'s time, not the time we read the file',
        u.fetchedAt === 1786903000000);
    ok('…and the note says it costs nothing and is as old as that turn',
        /costs nothing/.test(u.note) && /as old as that turn/.test(u.note));

    // a file that only ever carried nulls must not stop the search
    const stepped = readCodexUsage(
        probe(['new.jsonl', 'old.jsonl'], { 'new.jsonl': NULL_LINE, 'old.jsonl': REAL_LINE }),
        () => 1);
    ok('a rollout with no reading is stepped past', stepped.state === 'ok' && stepped.bars[0].percent === 7);

    const none = readCodexUsage(probe([], {}), () => 0);
    ok('‼️ never run = "not read yet", never 0%', none.state === 'unknown' && !none.bars.length);
    ok('…and the note says what to do about it', /run one turn/.test(none.note));
}

// ---------- the matrix ----------
{
    const all = readEngineUsage(
        probe(['a.jsonl'], { 'a.jsonl': REAL_LINE }),
        () => 1786903000000,
        { state: 'ok', bars: [{ id: 'five_hour', title: 'Current session', percent: 86, resetsAt: 0 }],
            plan: 'max', fetchedAt: 123, note: 'from the usage endpoint' });
    const by = Object.fromEntries(all.map(u => [u.id, u]));
    ok('all four engines answer', all.length === 4 && by.claude && by.codex && by.gemini && by.agy);
    ok('Claude\'s answer is passed in, never fetched here', by.claude.bars[0].percent === 86);
    ok('Codex reads its own transcript', by.codex.state === 'ok');

    // ‼️ THE ASSERTION THIS FILE EXISTS FOR. An engine nobody can measure must
    // never be drawn as an engine at 0%.
    ok('‼️ Antigravity says NOT PUBLISHED, and shows no bar',
        by.agy.state === 'not-published' && by.agy.bars.length === 0);
    ok('…and says where the figure does live', /Antigravity app/.test(by.agy.note));
    ok('‼️ Gemini says there is no plan to be a percentage of',
        by.gemini.state === 'no-plan' && by.gemini.bars.length === 0);

    ok('a summary never prints a number it does not have',
        usageSummary(by.agy) === 'not published'
        && usageSummary(by.gemini) === 'no plan — per-token'
        && /week 7%/.test(usageSummary(by.codex)));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
