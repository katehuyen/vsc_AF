// U-111 — THE AGENT PAGE CAN BE ASKED ABOUT A PERIOD.
//
// The dashboard has had a range row for a long time; the agent page — the one
// place you go to ask about ONE agent — was frozen at "last 30 days" for its
// chart and "all time" for every figure above it. "What did this agent cost me
// last week" was not a question the page could be asked.
//
// ‼️ THE TRAP THIS SUITE EXISTS FOR. The obvious way to count "sessions in this
// period" is to filter `DATA.sessions` — and it is WRONG. That array is a
// POOL: `sessionRowPool` ships the union of the true top-N per sortable
// criterion (50 by default) for a table the reader sorts. On a busy agent the
// count would silently stop growing at the cap, and it would look perfectly
// right on every quiet agent and every fixture — the worst kind of wrong.
// `sessionSpans` exists for exactly this, and the first check below is that
// the pool really does truncate.
//
// ‼️ AND OVERLAP, NOT "ENDED IN". A conversation opened on Monday and still
// being written on Friday belongs to every day in between. Counting by the
// last timestamp alone drops it out of "that week in July" entirely, and
// counting by the first drops it out of "this week".
'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`,
    JSON.stringify(got) === JSON.stringify(want));
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const js = read('media', 'agentDetail.js');
const ts = read('src', 'panels', 'agentDetail.ts');

// ============================== 1. the pool really is a cap
{
    const origLoad = Module._load;
    Module._load = function (request) {
        if (request === 'vscode') {
            return { Uri: {}, window: {}, workspace: { getConfiguration: () => ({ get: (_k, d) => d }) }, ViewColumn: {}, ConfigurationTarget: {}, env: {} };
        }
        return origLoad.apply(this, arguments);
    };
    const { sessionRowPool, AGENT_SESSION_TABLE_N } =
        require(path.join(ROOT, 'out', 'panels', 'dashboard.js'));
    Module._load = origLoad;

    const NOW = Date.parse('2026-08-12T00:00:00Z');
    const DAY = 86400000;
    const many = [];
    for (let i = 0; i < 200; i++) {
        many.push({
            sessionId: 's' + i, file: 'f' + i, title: 't' + i, agentName: 'developer',
            firstTs: NOW - i * DAY, lastTs: NOW - i * DAY + 3600000, mtime: NOW - i * DAY,
            cost: i, usage: {}, wTokens: i, models: [], toolCalls: i, errors: 0,
            tools: {}, skillCalls: {}, memoryReads: {}, filesEdited: {}, daily: {},
            turns: [], events: [], recentMsgs: [], userTurns: 1, assistantMsgs: 1
        });
    }
    const pool = sessionRowPool(many, () => false, AGENT_SESSION_TABLE_N);
    ok('200 sessions do not become 200 rows — the pool is a cap', pool.length < many.length);
    ok('…so counting a period off it would report a floor',
        pool.length <= AGENT_SESSION_TABLE_N * 8 && pool.length >= 1);
}

// ============================== 2. the host ships every span
ok('the panel sends a span per session, from the FULL list',
    /sessionSpans: tableSessions\.map\(/.test(ts));
ok('…not from the claude-only list, and not from the pool',
    !/sessionSpans: sessions\.map\(/.test(ts) && !/sessionSpans: sessionRowPool/.test(ts));
ok('…and a session with no first timestamp still gets a span rather than a zero',
    /s\.firstTs \|\| s\.lastTs \|\| s\.mtime \|\| 0/.test(ts));

// ============================== 3. the page counts the spans, not the pool
ok('the count reads sessionSpans', /DATA\.sessionSpans \|\| \[\]/.test(js));
ok('‼️ …and never the table pool', !/DATA\.sessions \|\| \[\]\)\s*\n?\s*\.filter/.test(js));
ok('overlap is tested on BOTH bounds, or a long session falls out of a week',
    /last >= spanFrom && first <= spanTo/.test(js));

// ============================== 4. the row itself, matching the dashboard's
{
    const dash = read('media', 'dashboard.js');
    const bar = js.slice(js.indexOf('function rangeControls'), js.indexOf('function render'));
    ok('the first week is day by day, as on the dashboard', /\[1, 2, 3, 4, 5, 6, 7\]/.test(bar));
    ok('…and the longer spans are the same five', /\[14, 30, 90, 180, 365\]/.test(bar));
    ok('…and two dates are a range you can pick', /data-range="custom"/.test(bar));
    // ‼️ One control, one unit — a lone "5" beside "14d" reads as anything but
    // five days. The dashboard learned this once; the copy must not unlearn it.
    ok('every range button carries its unit',
        /\$\{r\}d<\/button>/.test(bar) && !/\$\{r\}<\/button>/.test(bar));
    // The date inputs must NOT collide with the dashboard's — both pages are
    // built by the same shell and an id is a document-wide name.
    ok('the date boxes have this page\'s own ids',
        /id="ag-from"/.test(bar) && /id="ag-to"/.test(bar)
        && !/id="dash-from"/.test(js));
    ok('the dashboard keeps its own', /id="dash-from"/.test(dash));
    ok('the row is handed to the shared header, not drawn loose',
        /controls: rangeControls\(\)/.test(js));
}

// ============================== 5. what the row actually governs
ok('the daily chart is the chosen span, not a fixed thirty days',
    /Daily cost — \$\{rangeLabel\(\)\}/.test(js) && !/Daily cost — last 30 days/.test(js));
ok('…with weekly buckets past 120 days, or 365 bars would be 1px each',
    /if \(days\.length > 120\)/.test(js) && /weekly buckets/.test(js));
ok('the cost card is the span, and still says the all-time figure',
    /Cost · \$\{rangeLabel\(\)\}/.test(js) && /\$\{C\.fmtUSD\(rangeCost\)\}/.test(js)
    && /all time<\/div>/.test(js));
ok('the sessions card is the span, and still says the all-time count',
    /Sessions · \$\{rangeLabel\(\)\}/.test(js) && /\$\{rangeSessions\}/.test(js));
// ‼️ A page where some cards are scoped and others silently are not is worse
// than one where none are. Tool calls are kept per session, not per day, so
// there is no honest way to cut them by a span — and they SAY so.
ok('a card the row cannot govern says it is all time',
    /\$\{t\.errors\} errors · all time/.test(js));
ok('…and one that is a picture of the present says that',
    /files · now/.test(js));
ok('the cards sum the same daily buckets the chart draws',
    /const inRange = \(field\) => days\.reduce/.test(js));

// ============================== 6. the default changes nothing on arrival
ok('the page opens on the thirty days it already drew', /let range = 30;/.test(js));
ok('a custom range that makes no sense falls back to the same thirty',
    /return dayKeysBack\(30\);/.test(js));

// ============================== 7. the picture has to be able to show it
//
// ‼️ A fixture without the field renders the new card as ZERO next to another
// card saying 61 — and the screenshot would document a form nobody shipped.
{
    const fx = require(path.join(ROOT, 'test', 'fixtures', 'agentdetail.js'));
    const data = fx.data();
    ok('the fixture carries spans', Array.isArray(data.sessionSpans) && data.sessionSpans.length > 0);
    eq('…one per session it claims to have',
        data.sessionSpans.length, data.totals.allSessions);
    ok('…more of them than the table pool ships, which is the whole point',
        data.sessionSpans.length > (data.sessions || []).length);
    // and they must actually spread, or every range button draws the same number
    const NOW = new Date();
    const back = (n) => {
        const from = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - (n - 1)).getTime();
        const to = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate()).getTime() + 86399000;
        return data.sessionSpans.filter(([a, b]) => b >= from && a <= to).length;
    };
    const counts = [7, 30, 90, 365].map(back);
    ok(`the spans spread across the buttons (${counts.join(' < ')})`,
        counts[0] < counts[1] && counts[1] < counts[2] && counts[2] <= counts[3]
        && counts[3] === data.totals.allSessions);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
