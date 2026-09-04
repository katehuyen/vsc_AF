// S-52 — A SESSION RESUMED TOMORROW DID NOT RUN FOR A DAY.
//
// The sessions table's Duration is `lastTs - firstTs`, so a conversation picked
// up again the next morning reads as "1 512m". Nothing is wrong with that
// figure — it is a true wall clock — but it is the ONLY figure the row carries,
// so the number the eye lands on says the session took a day when it took
// forty minutes, and every rate derived from it (cost per hour) is divided by a
// night's sleep.
//
// The turns page has held BOTH figures all along (`durationMs` runs to the next
// turn, `ms` is what the turn itself ran); this is the same pair at session
// level, derived from the turn timeline that is already in the index.
//
//   · ‼️ AWAY IS MEASURED BETWEEN TURNS, NEVER INSIDE ONE. A three-hour
//     headless round is WORK, and a watchdog that called it absence would be
//     subtracting the very thing the figure is for.
//   · ‼️ NOTHING IS SUBTRACTED ON NO EVIDENCE. A session whose turns were not
//     recorded is UNMEASURED, so active falls back to the wall clock rather
//     than to a guess.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const OUT = path.join(__dirname, '..', 'out', 'core');
const { sessionSpan, SESSION_BREAK_MIN } = require(path.join(OUT, 'sessionSpan.js'));

const MIN = 60 * 1000, HOUR = 60 * MIN;
const T0 = Date.UTC(2026, 8, 3, 9, 0, 0);

/** turns as the index holds them: when the prompt went in, and how long it ran */
const turn = (n, ts, ms) => ({ n, label: 't' + n, ts, ms, tokens: 0, wTokens: 0, cost: 0,
    apiCalls: 0, steps: 0, thinking: 0, endCtx: 0, tools: 0, errors: 0, models: [] });
const sess = (turns, over) => Object.assign({
    firstTs: turns.length ? turns[0].ts : 0,
    lastTs: turns.length ? turns[turns.length - 1].ts + turns[turns.length - 1].ms : 0,
    turns
}, over || {});

/* ---- the ordinary session is untouched ---------------------------------- */
{
    // three turns over forty minutes, the longest pause between them 6 min
    const s = sess([turn(1, T0, 4 * MIN), turn(2, T0 + 10 * MIN, 5 * MIN), turn(3, T0 + 30 * MIN, 10 * MIN)]);
    const v = sessionSpan(s, 30);
    ok('a session worked straight through reads exactly as it always did',
        v.activeMs === v.wallMs && v.wallMs === 40 * MIN);
    ok('...and nothing is called a break', v.awayMs === 0 && v.breaks === 0);
}

/* ---- the item's own case ------------------------------------------------- */
{
    // forty minutes yesterday morning, picked up again a day later for twenty
    const s = sess([
        turn(1, T0, 5 * MIN), turn(2, T0 + 20 * MIN, 20 * MIN),
        turn(3, T0 + 25 * HOUR, 5 * MIN), turn(4, T0 + 25 * HOUR + 10 * MIN, 10 * MIN)
    ]);
    const v = sessionSpan(s, 30);
    ok('the wall clock still says what it always said — more than a day',
        v.wallMs === 25 * HOUR + 20 * MIN);
    ok('...but the night between the two sittings is AWAY, not work',
        v.awayMs === 24 * HOUR + 20 * MIN);
    ok('...so the session reads as the hour it actually ran',
        v.activeMs === 60 * MIN);
    ok('...and the reader is told how many times it was put down', v.breaks === 1);
}

/* ---- a long round is work ------------------------------------------------ */
{
    // one turn that ran for three hours: an unattended headless round
    const s = sess([turn(1, T0, 3 * HOUR), turn(2, T0 + 3 * HOUR, 5 * MIN)]);
    const v = sessionSpan(s, 30);
    ok('‼️ a three-hour ROUND is work, never absence — away is measured between turns',
        v.awayMs === 0 && v.activeMs === v.wallMs);
}

/* ---- the threshold ------------------------------------------------------- */
{
    const s = sess([turn(1, T0, 1 * MIN), turn(2, T0 + 29 * MIN, 1 * MIN)]);
    ok('a pause under the limit is a person thinking, and it counts as the session',
        sessionSpan(s, 30).awayMs === 0);
    const wider = sess([turn(1, T0, 1 * MIN), turn(2, T0 + 90 * MIN, 1 * MIN)]);
    ok('...and over it, only the pause itself is taken off, never the turns around it',
        sessionSpan(wider, 30).awayMs === 89 * MIN);
    ok('0 switches the whole question off — active is the wall clock again',
        sessionSpan(wider, 0).activeMs === sessionSpan(wider, 0).wallMs);
    ok('a limit nobody stated falls back to the one this file names',
        SESSION_BREAK_MIN > 0 && sessionSpan(wider).awayMs === sessionSpan(wider, SESSION_BREAK_MIN).awayMs);
}

/* ---- nothing is subtracted on no evidence -------------------------------- */
{
    ok('a session whose turns were never recorded is unmeasured, not idle',
        sessionSpan({ firstTs: T0, lastTs: T0 + 30 * HOUR, turns: [] }, 30).activeMs === 30 * HOUR);
    ok('...and one with no clock at all answers zero rather than a negative',
        sessionSpan({ firstTs: 0, lastTs: 0, turns: [] }, 30).wallMs === 0);
    const stampless = sess([turn(1, T0, MIN), turn(2, 0, 0), turn(3, T0 + 5 * HOUR, MIN)]);
    ok('a turn with no timestamp is skipped rather than measured from zero',
        sessionSpan(stampless, 30).awayMs === 5 * HOUR - MIN);
}

/* ---- active never exceeds the wall clock --------------------------------- */
{
    // a turn whose recorded run overruns the session's own last stamp
    const s = { firstTs: T0, lastTs: T0 + 10 * MIN, turns: [turn(1, T0, 99 * HOUR)] };
    const v = sessionSpan(s, 30);
    ok('active is never longer than the wall clock it is carved out of',
        v.activeMs <= v.wallMs && v.awayMs >= 0);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
