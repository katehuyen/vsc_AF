/**
 * X-252 (b) — SPEND BY SIGN-IN, on the page where a month is read.
 *
 * The Engines card answers "today", live, beside a percentage. This answers the
 * other half — which sign-in runs cheap and which runs expensive — and until
 * this section existed the question had no home at all, because cost was split
 * by ENGINE and by nothing else.
 *
 * What is pinned here is the shape of the claim: the engine stays a COLUMN
 * rather than being replaced, every refusal the core makes is visible on the
 * page rather than only in the data, and the section is absent (not empty, not
 * zeroed) when the host cannot answer.
 *
 *   node test/test_task_analytics_spend.js
 */
'use strict';
const path = require('path');
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const fixture = require(path.join(__dirname, 'fixtures', 'taskanalytics.js'));
const scenes = fixture.variants();
const htmlOf = (data) => runPage('taskAnalytics.js', data).html();

// ---------------------------------------------------------- the full table
{
    const h = htmlOf(scenes[0].data);
    ok('the page draws a spend section', /Spend by sign-in \(30d\)/.test(h));
    ok('‼️ THE ENGINE IS A COLUMN, NOT THE AXIS — an account is under one engine, '
        + 'and replacing the coarser answer would throw it away',
        />Engine</.test(h) && h.includes('>claude<') && h.includes('>codex<'));
    ok('a priced sign-in shows its money, its weighted tokens and its runs',
        h.includes('$41.88') && h.includes('18.4M') && h.includes('>63<'));
    ok('…and what a run on it usually costs', h.includes('$0.665'));

    // ‼️ The three refusals, each visible rather than merely true in the data.
    ok('‼️ A ROW WHOSE RUNS ALL CAME FROM AN ENGINE THAT STATES NO PRICE SAYS SO'
        + ' — $0.00 there would read as a cheap month',
        h.includes('no price') && !/>\$0\.00</.test(h));
    ok('…and the runs that could not be priced are counted', h.includes('7 unpriced'));
    ok('…and the ones left out of the window rather than sliced are counted',
        h.includes('2 not placed'));
    ok('‼️ AND THE PART OF THE MONTH THAT BELONGS TO NOBODY IS A ROW, not a footnote',
        h.includes('not attributed') && h.includes('this farm did not start them'));
    ok('…and the page says WHY a run can have no owner, in the manifest\'s terms',
        h.includes('launch manifest'));
    ok('‼️ …AND KEEPS SPEND AND THE PLAN WINDOW APART', h.includes('not the same measure'));
}

// ------------------------------------------- nothing attributed, and no host
{
    const empty = htmlOf(scenes[1].data);
    ok('a window with nothing attributed says so in words rather than drawing an empty table',
        /Nothing has been attributed to a sign-in/.test(empty)
        && /Spend by sign-in/.test(empty));

    const none = htmlOf(scenes[2].data);
    ok('‼️ A HOST THAT CANNOT ANSWER DRAWS NO SECTION AT ALL — an empty table nobody '
        + 'can explain is worse than no table',
        !/Spend by sign-in/.test(none));
    ok('…and the rest of the page is unharmed by its absence',
        /Per-agent scorecard/.test(none) && /Forecast/.test(none));
}

// --------------------------------------------------- the way in, from a card
{
    const fs = require('fs');
    const ROOT = path.resolve(__dirname, '..');
    // X-236 — the card is drawn by media/afAccounts.js on both pages now.
    const eng = fs.readFileSync(path.join(ROOT, 'media', 'engines.js'), 'utf8')
        + '\n' + fs.readFileSync(path.join(ROOT, 'media', 'afAccounts.js'), 'utf8');
    ok('‼️ THE ENGINES CARD\'S SPEND LINE IS THE DOOR — no control was added beside it',
        /class="acspend go" data-afnav="analytics"/.test(eng));
    ok('…and its panel says where pressing it goes, because a surface that acts '
        + 'without saying so is one nobody presses',
        /Press this line for the 30-day breakdown/.test(eng));
    const base = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'base.ts'), 'utf8');
    ok('…and the page is reachable by that name at all',
        /analytics: 'agentfarm\.openTaskAnalytics'/.test(base));
}

console.log(`test_task_analytics_spend: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
