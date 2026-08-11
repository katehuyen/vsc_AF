// DOM-stub test for the ANALYSIS, CODE and BACKFILL screens of media/projects.js.
//
// What is asserted is everything a regex over the source cannot see —
//
//   * ‼️ a block below its minimum is replaced by a SENTENCE saying what is
//     missing and how much of it, never by a chart of six points;
//   * ‼️ the backlog "net" is words, not a sign: "−7" leaves the reader guessing
//     which way the subtraction ran, and both readings are plausible;
//   * ‼️ the Code tab never sums commits with session writes, and a root that is
//     not on this machine is MISSING rather than a repo with no commits;
//   * ‼️ on the backfill screen the EVIDENCE is drawn, not the score — a
//     percentage is a number the reader cannot check;
//   * ‼️ "select all" ticks the clear rows only, and a contested row can still
//     be ticked BY HAND — the engine could not answer it, the person can;
//   * ‼️ applying sends IDS ONLY, so a stale page cannot write a project the
//     engine no longer proposes;
//   * the ticked set survives a repaint, because this page repaints on every
//     fleet refresh and losing forty boxes to one is unusable.
const path = require('path');
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));
const fixture = require(path.join(__dirname, 'fixtures', 'analysis.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const run = (over) => runPage('projects.js', fixture.data(over));
const els = (r, attr) => r.query(`[data-${attr}]`);
const el = (r, attr, value) => els(r, attr)
    .find(e => e.dataset[attr.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] === value);
const last = (r) => r.posted[r.posted.length - 1];
/** The markup with its indentation collapsed.
 *
 *  ‼️ A sentence written across three lines of a template literal carries the
 *  source's own newlines and leading spaces into the HTML, so asserting on a
 *  phrase that happens to straddle a line break fails for a reason that has
 *  nothing to do with the page. The browser collapses this whitespace; so does
 *  this. */
const flat = (r) => r.html().replace(/\s+/g, ' ');

// ---------------------------------------------------------------------------
// Analysis — it draws, and it draws the caveats
// ---------------------------------------------------------------------------
{
    const h = run().html();
    ok('the tab is on the bar and open', /class="pj-tab tb-analysis on" data-tab="analysis"/.test(h));
    ok('‼️ a recent pace is printed BESIDE the project\'s own average — a rate with no control is not a claim',
        h.includes('sessions per week · last 4') && h.includes('per week over 12 week(s)'));
    ok('cost per session is stated both ways too',
        h.includes('per session · last 4') && h.includes('per session, all of it'));
    ok('every chart is inside the height cap, or one tab owns the whole screen',
        (h.match(/class="pj-chart"/g) || []).length === 2);
    ok('a bar list is inside the width cap, or two rows scale to headline size',
        (h.match(/class="pj-bars"/g) || []).length === 2);
    ok('the rhythm names its busiest cell in words, not as a cell index',
        /Busiest: <b>Wednesday 23:00<\/b>/.test(h));
    ok('…and says what it counted and when', /46%<\/b> of 691 turns fall outside/.test(h));
    ok('the cycle time carries its spread, not only the middle',
        h.includes('90th percentile') && h.includes('fastest') && h.includes('slowest'));
    ok('the footer says what the whole fold was built from',
        /Built from 40 session\(s\) · 691 turn\(s\)/.test(h));
    ok('…and that the weeks are local and Monday-based', /Weeks are LOCAL and start on Monday/.test(h));
}
{
    // ‼️ The sign. 47 closed − 40 opened = 7, and "−7" could mean seven fewer
    // items or seven fewer closures. The words cannot be read both ways.
    const h = run().html();
    ok('‼️ the backlog net is WORDS, not a sign', h.includes('7 fewer open over the period')
        && !h.includes('net −7'));
    const other = run({ tabData: { analysis: fixture.thinAnalysis() } }).html();
    ok('…and it says the other direction just as plainly', other.includes('3 more open over the period'));
}
{
    // The young project: every minimum missed, and each one says what is short.
    const r = run({ tabData: { analysis: fixture.thinAnalysis() } });
    const h = flat(r);
    ok('‼️ no rhythm below the minimum — and the sentence says how many turns there are',
        /Not enough turns yet to see a rhythm — 23 so far/.test(h));
    ok('‼️ no cycle time below the minimum — and it says how many of how many closed',
        /Not enough closed items yet — 1 of 4 tracked/.test(h));
    ok('‼️ no pace comparison from two weeks — a "recent" figure with no control is not one',
        /Not enough weeks yet to compare/.test(h));
    ok('what CAN be drawn still is', h.includes('class="pj-chart"'));
}
{
    const h = run({ tabData: { analysis: { state: 'ok', weeks: [], files: [], agents: [], totals: {} } } }).html();
    ok('a project nothing has happened to says so, and says which three sources it folds',
        /no sessions, no commits/.test(h) && /no backlog item with a recorded event/.test(h));
    const reading = run({ tabData: {} }).html();
    ok('a payload for another tab reads as "reading…", not as empty',
        reading.includes('Reading the project…'));
}

// ---------------------------------------------------------------------------
// Code — two sources, never summed
// ---------------------------------------------------------------------------
{
    const h = run({ tab: 'code', tabData: { code: fixture.code() } }).html();
    ok('the tab draws its roots', h.includes('vsc_AgentFarm'));
    ok('‼️ a root that is not on this machine is MISSING, not a quiet repo',
        /This folder is not on this machine/.test(h));
    ok('the commit count and the write count are printed as separate figures',
        h.includes('commits read') && h.includes("files this project's sessions wrote"));
    ok('‼️ and the tab says in words that they are never summed',
        /never summed/.test(h) && /a third number that means nothing/.test(h));
    ok('it also says the commits come from a cache with a beat',
        /refreshed at most once a minute/.test(h));

    const noRoots = run({ tab: 'code', tabData: { code: { state: 'no-roots' } } }).html();
    ok('‼️ no code roots is an INSTRUCTION, not an empty page — it says what declaring one does',
        /declares no code roots/.test(noRoots) && /what makes a git commit belong/.test(noRoots));
}

// ---------------------------------------------------------------------------
// Backfill — the evidence is the argument
// ---------------------------------------------------------------------------
const openBf = () => {
    const r = run({ tabData: { backfill: fixture.backfill() } });
    el(r, 'act', 'backfill').click();
    return r;
};
{
    const r = openBf();
    const h = r.html();
    ok('pressing ⊘ Unassigned opens the screen', h.includes('data-bf-act="close"'));
    ok('…and tells the host, so the report is built', r.posted.some(m => m.type === 'view' && m.backfill === true));
    ok('the header says how much is left and where the rest went',
        /63<\/b> loose session\(s\) looked at/.test(h) && /19<\/b> with no evidence/.test(h));
    ok('‼️ the sessions the user REFUSED are counted separately, so the number is not read as a gap',
        /4<\/b> you refused/.test(h));
    ok('‼️ the EVIDENCE is drawn, in the words the engine wrote',
        h.includes('wrote 11 of 11 files under d:/zone/dev/git/miropharm/muvu_talkscribe'));
    ok('‼️ and no score is printed anywhere — a number a reader cannot check is not an argument',
        !/\bscore\b/i.test(h.replace(/data-[a-z-]+="[^"]*"/g, '')));
    ok('a contested row names the runner-up and says why it is left', h.includes('too close to call'));
    ok('…and is marked as a class the eye can find', h.includes('pj-bf-row  contested')
        || /class="pj-bf-row[^"]*contested/.test(h));
    ok('the footer explains all four signals in the order they weigh',
        /Four signals, in the order they weigh/.test(h));
}
{
    const r = openBf();
    el(r, 'bf-act', 'all').click();
    const h = r.html();
    ok('‼️ "select all" ticks the CLEAR rows only — a bulk gesture must not resolve what the engine could not',
        (h.match(/data-bf="[^"]*" checked/g) || []).length === 3);
    ok('the bar says what the approval is about to do, per project',
        /1 → TalkScribe · 2 → PRS/.test(h) || /2 → PRS.*· 1 → TalkScribe/.test(h));

    el(r, 'bf-act', 'apply').click();
    const msg = last(r);
    ok('‼️ applying sends IDS ONLY — a stale page cannot name a project the engine no longer proposes',
        msg.type === 'applyBackfill' && Array.isArray(msg.ids) && msg.ids.length === 3
        && !('projectId' in msg) && !('project' in msg));
    ok('…and the selection is cleared afterwards, so a second press cannot re-file the same set',
        !/data-bf="[^"]*" checked/.test(r.html()));
}
{
    // ‼️ A contested row can still be ticked BY HAND. The engine could not
    // answer it; the person reading the row often can, and a screen that
    // refused them would send them to file it one session at a time elsewhere.
    const r = openBf();
    const contested = els(r, 'bf').find(e => e.dataset.bf.startsWith('cccc'));
    contested.checked = true;
    contested._listeners.change.forEach(fn => fn({ target: contested }));
    ok('a contested row can be ticked by hand', /data-bf="cccc[^"]*" checked/.test(r.html()));
    el(r, 'bf-act', 'apply').click();
    ok('…and it is applied like any other', last(r).ids.includes('cccc1111-2222-3333-4444-555566667777'));
}
{
    const r = openBf();
    el(r, 'bf-act', 'all').click();
    // The page repaints on every fleet refresh; the reader's ticks are the
    // page's own state and must survive one.
    r.send({ type: 'data', data: fixture.data({ tabData: { backfill: fixture.backfill() } }) });
    ok('‼️ the ticked set survives a repaint — losing forty boxes to a refresh is unusable',
        (r.html().match(/data-bf="[^"]*" checked/g) || []).length === 3);

    el(r, 'bf-act', 'none').click();
    ok('Clear empties it', !/data-bf="[^"]*" checked/.test(r.html()));
    ok('and File is refused with nothing ticked', /data-bf-act="apply" disabled/.test(r.html()));
}
{
    const r = run({ tabData: { backfill: { generatedAt: 0, scanned: 41, noEvidence: 41, refused: 2, suggestions: [] } } });
    el(r, 'act', 'backfill').click();
    const h = flat(r);
    ok('‼️ nothing proposable is a real ANSWER — it names all four signals it looked for',
        /Nothing can be proposed/.test(h) && /no files written inside a declared code root/.test(h));
    ok('…and says why that is better than a list of guesses',
        /a list of guesses, which is the one thing this screen must not be/.test(h));
}
{
    const r = openBf();
    el(r, 'bf-act', 'close').click();
    ok('Close puts the project back', !r.html().includes('data-bf-act="apply"'));
    ok('…and tells the host to stop building the report',
        r.posted.filter(m => m.type === 'view').pop().backfill === false);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
