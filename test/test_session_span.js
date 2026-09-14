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

/* =========================================================================
 * S-53 — AND THE DURATION IS THE TURNS' OWN TIME, ADDED UP.
 *
 * The user's correction to the figure above, in their own words: "a session's
 * duration is not the span from its first turn to its last, it is the sum of
 * the turns' active durations." `activeMs` is right about ABSENCES and says
 * nothing about the rest — every gap shorter than the break limit is still
 * inside it, and on a conversation worked in bursts that is most of the number.
 *
 * The three make a ladder, and the ladder is the assertion: busy ≤ active ≤
 * wall, because a turn's own time is inside the clock and an absence is between
 * turns.
 * ========================================================================= */
{
    // Forty minutes of wall clock, nineteen of it actually answering.
    const s = sess([turn(1, T0, 4 * MIN), turn(2, T0 + 10 * MIN, 5 * MIN), turn(3, T0 + 30 * MIN, 10 * MIN)]);
    const v = sessionSpan(s, 30);
    ok('‼️ the duration is the turns\' own time, not the span they sit in',
        v.busyMs === 19 * MIN && v.wallMs === 40 * MIN);
    ok('…and it is measured, so the row may lead with it', v.busyMeasured === true);
    ok('‼️ …while the gaps that are too short to be an absence are still not RUN time '
        + '— which is the whole of what this item moved',
        v.activeMs === 40 * MIN && v.activeMs - v.busyMs === 21 * MIN);
    ok('the three are a ladder: busy ≤ active ≤ wall',
        v.busyMs <= v.activeMs && v.activeMs <= v.wallMs);
}

/* ---- and the night is still out, on top of the gaps --------------------- */
{
    const s = sess([turn(1, T0, 10 * MIN), turn(2, T0 + 20 * HOUR, 30 * MIN)]);
    const v = sessionSpan(s, 30);
    ok('‼️ a session resumed the next day ran for the forty minutes it worked',
        v.busyMs === 40 * MIN);
    ok('…and the night is named as away rather than folded into the run',
        v.breaks === 1 && v.awayMs === 20 * HOUR - 10 * MIN);
}

/* ---- not measured is not zero ------------------------------------------- */
{
    // an import: the endpoints are known, the turns carry no duration
    const bare = { firstTs: T0, lastTs: T0 + 40 * MIN, turns: [turn(1, T0, 0), turn(2, T0 + 20 * MIN, 0)] };
    const v = sessionSpan(bare, 30);
    ok('‼️ a transcript whose turns carry no duration falls back rather than reading 0m',
        v.busyMs === v.activeMs && v.busyMs === 40 * MIN);
    ok('…and SAYS it was not measured, so a surface can choose not to lead with it',
        v.busyMeasured === false);
    const none = sessionSpan({ firstTs: T0, lastTs: T0 + 30 * HOUR, turns: [] }, 30);
    ok('…same for a session with no turns at all',
        none.busyMs === none.activeMs && none.busyMeasured === false);
}

/* ---- the break rule is about ABSENCES and nothing else ------------------ */
{
    const s = sess([turn(1, T0, 10 * MIN), turn(2, T0 + 20 * HOUR, 30 * MIN)]);
    const off = sessionSpan(s, 0);
    ok('‼️ switching the absence rule off does not also forget the turns — two '
        + 'unrelated decisions, and tying them would make the figure depend on a '
        + 'setting that is not about it',
        off.busyMs === 40 * MIN && off.busyMeasured === true && off.awayMs === 0);
}

/* ---- and it can never outrun the clock it sits inside ------------------- */
{
    // a sidechain writing after the turn was accounted can overrun the stamp
    const s = { firstTs: T0, lastTs: T0 + 10 * MIN, turns: [turn(1, T0, 99 * HOUR)] };
    const v = sessionSpan(s, 30);
    ok('‼️ a "ran for" longer than the wall clock would make the whole ladder untrustworthy',
        v.busyMs <= v.activeMs && v.busyMs === 10 * MIN);
}

/* ---- the table reads the ladder, and reads it in ONE place -------------- */
{
    const fs = require('fs');
    const js = fs.readFileSync(path.join(__dirname, '..', 'media', 'sessionsTable.js'), 'utf8');
    ok('‼️ the page has one reader for "how long it ran", with all three rungs',
        /const ranOf = r => \(typeof r\.busyMin === 'number' \? r\.busyMin\s*\n\s*: \(typeof r\.activeMin === 'number' \? r\.activeMin : \(r\.durationMin \|\| 0\)\)\);/.test(js));
    ok('…and nothing on the page reaches past it for the old figure',
        !/key: r => activeOf\(r\)/.test(js) && !/get: r => activeOf\(r\)/.test(js)
        && !/\$\{activeOf\(r\) \|\| 0\}m/.test(js));
    ok('‼️ …and the panel accounts for the difference rather than letting the '
        + 'figure shrink unexplained',
        /line\('Between turns', betweenOf\(r\)/.test(js));
    const dash = fs.readFileSync(path.join(__dirname, '..', 'src', 'panels', 'dashboard.ts'), 'utf8');
    ok('‼️ the host sends the figure only where it was really measured — an absent '
        + 'field is what makes the ladder fall back instead of printing a borrowed 0',
        /\.\.\.\(v\.busyMeasured \? \{ busyMin: Math\.round\(v\.busyMs \/ 60000\) \} : \{\}\)/.test(dash));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
