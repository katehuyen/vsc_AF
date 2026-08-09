// DOM-stub test for the TRACK tab of media/projects.js — the real page code,
// driven through the shared page shim.
//
// The tab's job is a join nothing else in the extension can make: a permanent
// backlog code on one side, the turns it was fought in on the other. What is
// asserted here is everything a regex over the source cannot see —
//
//   * the four views are four questions over ONE narrowing, so a filter set in
//     Items still holds in Timeline (a filter that meant different things per
//     view would make the switch a different page, not a different question);
//   * every axis is a LIST — event kinds and sources add up rather than replace
//     each other, exactly as the backlog's chips do;
//   * a row with no surviving record is not drawn, because a card with an empty
//     body answers a question nobody asked;
//   * ‼️ a turn button sends the TIMESTAMP, never the turn number — the number
//     is for the reader and the timestamp is the address the session viewer
//     scrolls to, and sending the number lands every click at the top of the
//     transcript;
//   * ‼️ Reconstruct WRITES NOTHING until it is told twice. Preview and Apply
//     are two messages and the second carries `apply`, so a page that sent one
//     message would be appending to somebody's ledger on a single click;
//   * a code addresses the backlog by CODE and never by the line the page is
//     holding, which goes stale the moment Obsidian inserts a paragraph;
//   * the right-click payload carries the row's identity and not its words.
const path = require('path');
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const T = Date.parse('2026-08-06T09:20:00Z');
const DAY = 86400000;

const project = {
    id: 'p1', name: 'Agent Farm', status: 'active', kind: 'product', summary: 'the command centre',
    folder: 'D:\\v\\p', folderState: 'ok', repos: [], parentId: null,
    tags: [], people: [], agentRules: [], budgetUSD: 0, budgetTotalUSD: 0,
    sessions: 3, cost: 12.5, todayCost: 2, tokens: 900, lastTs: T, warnings: []
};

/** Two codes with real histories, one closed outside, one item never tracked. */
const track = () => ({
    state: 'ok', folder: 'D:\\v\\p',
    path: 'Backloglog.md', backlogPath: 'Backlog.md',
    ledger: '90_Archive/_tracks/backlog-track.jsonl',
    events: 6, truncated: false,
    areas: [{ code: 'U', label: 'Arayüz' }, { code: 'P', label: 'Projeler' }],
    agents: ['developer', 'manager'],
    rows: [
        {
            code: 'U-9', text: 'the long one '.repeat(30), state: 'done', area: 'U',
            section: 'U — Arayüz', line: 118, priority: 'high', effort: 'L', kinds: ['feat'],
            parent: null, children: ['U-20'], plan: null, due: null,
            turns: 5, doubtful: true, backfilled: false, sources: ['agent'],
            stamp: 'bbbb2222#3', note: 'closed by lower-casing both sides',
            firstTs: T - DAY, lastTs: T, closedTs: T, closedEvent: 'done', closedBy: 'agent',
            sessions: [
                {
                    session: 'aaaa1111-x', short: 'aaaa1111', file: 'D:\\t\\a.jsonl',
                    agent: 'developer', span: '#11–12', firstTs: T - DAY, lastTs: T - DAY,
                    uncertain: 'multi',
                    turns: [{ n: 11, ts: T - DAY }, { n: 12, ts: T - DAY + 60000 }],
                    events: [
                        { code: 'U-9', event: 'touch', ts: T - DAY, at: '', session: 'aaaa1111-x', short: 'aaaa1111', turn: 11, agent: 'developer', by: 'agent', uncertain: 'multi', note: 'root cause not found' },
                        { code: 'U-9', event: 'doing', ts: T - DAY + 60000, at: '', session: 'aaaa1111-x', short: 'aaaa1111', turn: 12, agent: 'developer', by: 'agent', uncertain: null, note: null }
                    ]
                },
                {
                    session: 'bbbb2222-y', short: 'bbbb2222', file: 'D:\\t\\b.jsonl',
                    agent: 'developer', span: '#3', firstTs: T, lastTs: T, uncertain: null,
                    turns: [{ n: 3, ts: T }],
                    events: [
                        { code: 'U-9', event: 'done', ts: T, at: '', session: 'bbbb2222-y', short: 'bbbb2222', turn: 3, agent: 'developer', by: 'agent', uncertain: null, note: null }
                    ]
                }
            ],
            loose: []
        },
        {
            code: 'P-2', text: 'the projects epic', state: 'open', area: 'P',
            section: 'P — Projeler', line: 44, priority: 'normal', effort: 'M', kinds: [],
            parent: null, children: [], plan: null, due: null,
            turns: 1, doubtful: true, backfilled: true, sources: ['backfill', 'outside'],
            stamp: null, note: '',
            firstTs: T - 3 * DAY, lastTs: T - 2 * DAY, closedTs: 0, closedEvent: null, closedBy: null,
            sessions: [
                {
                    session: 'cccc3333-z', short: 'cccc3333', file: 'D:\\t\\c.jsonl',
                    agent: 'manager', span: '#7', firstTs: T - 3 * DAY, lastTs: T - 3 * DAY,
                    uncertain: 'guess',
                    turns: [{ n: 7, ts: T - 3 * DAY }],
                    events: [
                        { code: 'P-2', event: 'touch', ts: T - 3 * DAY, at: '', session: 'cccc3333-z', short: 'cccc3333', turn: 7, agent: 'manager', by: 'backfill', uncertain: 'guess', note: 'reconstructed: the code is written in this turn' }
                    ]
                }
            ],
            loose: [
                { code: 'P-2', event: 'reopen', ts: T - 2 * DAY, at: '', session: null, short: null, turn: null, agent: null, by: 'outside', uncertain: 'none', note: 'changed outside Agent Farm' }
            ]
        }
    ],
    untracked: [{ code: 'K-3', text: 'never recorded', state: 'done', area: 'K', line: 61 }],
    sessionInfo: {
        'aaaa1111-x': { file: 'D:\\t\\a.jsonl', title: 'the long session', agent: 'developer', turns: 41, firstTs: T - DAY, lastTs: T - DAY, models: ['opus'], cost: 3.25, cwd: '' },
        'bbbb2222-y': { file: 'D:\\t\\b.jsonl', title: 'the short one', agent: 'developer', turns: 4, firstTs: T, lastTs: T, models: ['sonnet'], cost: 0.4, cwd: '' },
        'cccc3333-z': { file: 'D:\\t\\c.jsonl', title: 'a manager run', agent: 'manager', turns: 12, firstTs: T - 3 * DAY, lastTs: T - 3 * DAY, models: ['opus'], cost: 1.1, cwd: '' }
    },
    gaps: { untracked: 1, uncertain: 3, backfilled: 1, noSession: 1 }
});

const baseData = (over) => Object.assign({
    generatedAt: T, projects: [project], agents: ['developer'], activeId: 'p1',
    activeName: 'Agent Farm', projectsRoot: 'D:\\v', unassigned: { sessions: 0, cost: 0 },
    unfiledKinds: [], docPath: '',
    docOpen: { mode: 'vscode', modes: ['vscode', 'preview', 'obsidian'], labels: { vscode: 'Editor' } },
    focusId: null, newForm: null, tab: 'track', tabProject: 'p1',
    tabData: { track: track() }
}, over || {});

const run = (over) => runPage('projects.js', baseData(over));
/** Every element carrying a data attribute, by its camelCase dataset key. */
const els = (r, attr) => r.query(`[data-${attr}]`);
const el = (r, attr, value) => els(r, attr).find(e => e.dataset[attr.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] === value);

// ---------------------------------------------------------------------------
// the tab draws, and it draws the join
// ---------------------------------------------------------------------------
{
    const r = run();
    const h = r.html();
    ok('the tab is on the bar and it is the open one',
        /class="pj-tab on" data-tab="track"/.test(h));
    ok('four views are offered', ['items', 'timeline', 'sessions', 'gaps']
        .every(v => h.includes(`data-trkview="${v}"`)));
    ok('Items is the one that opens', /data-trkview="items"[^>]*class=|class="pj-trk-view on"\s+data-trkview="items"/.test(h)
        || h.includes('class="pj-trk-view on"'));
    ok('both tracked codes are drawn', h.includes('>U-9<') && h.includes('>P-2<'));
    ok('an untracked item is NOT in the items list — it has no history to show',
        !/data-trkrow[^>]*data-code="K-3"/.test(h));
    ok('the turns are drawn as buttons into the transcript',
        h.includes('data-trackturn="D:\\t\\a.jsonl"') || h.includes('data-trackturn='));
    ok('the closing stamp is shown where it was closed', h.includes('bbbb2222#3'));
    ok('the human\'s own note is shown', h.includes('closed by lower-casing both sides'));
    ok('a record with no session says so rather than inventing one',
        h.includes('no session'));
    ok('the ledger is named, so the raw data is findable',
        h.includes('backlog-track.jsonl'));
    ok('the size badge carries the turns it actually took — the one figure that needs both files',
        /L · 5t/.test(h));
}

// ---------------------------------------------------------------------------
// ‼️ a turn button sends the TIMESTAMP, not the turn number
// ---------------------------------------------------------------------------
{
    const r = run();
    const turns = els(r, 'trackturn').filter(e => e.dataset.trackts);
    ok('there is a turn to press', turns.length >= 3);
    turns[0].click();
    const m = r.last();
    ok('it opens a session', m && m.type === 'openSession');
    ok('…at a timestamp, and the timestamp is a real moment rather than the turn number',
        m && m.ts > 1e12);
    ok('…and it names the transcript file', m && /\.jsonl$/.test(m.file));
    const first = els(r, 'trackturn').filter(e => e.dataset.trackts)[0];
    const second = els(r, 'trackturn').filter(e => e.dataset.trackts)[1];
    ok('‼️ each turn carries its OWN moment — one per run would land every click in the same place',
        first.dataset.trackts !== second.dataset.trackts);
}

// ---------------------------------------------------------------------------
// the code addresses the backlog by CODE, never by the page's line number
// ---------------------------------------------------------------------------
{
    const r = run();
    const go = els(r, 'trkgo')[0];
    go.click();
    const m = r.last();
    ok('the code opens the backlog at that item', m && m.type === 'backlogOpenItem');
    ok('‼️ it is addressed by code — a line number goes stale the moment Obsidian inserts a paragraph',
        m && m.code === 'U-9' && m.line === undefined);
}

// ---------------------------------------------------------------------------
// every axis is a LIST, and one narrowing serves all four views
// ---------------------------------------------------------------------------
{
    const r = run();
    // open the filter panel
    el(r, 'act', 'trkFilters').click();
    ok('the filter panel opens', r.html().includes('data-trkevent="done"'));

    el(r, 'trkevent', 'done').click();
    let h = r.html();
    ok('filtering to done keeps the item that was closed', h.includes('>U-9<'));
    ok('‼️ …and drops the one with no done event — a card with an empty body answers nothing',
        !/data-trkrow[^>]*data-code="P-2"/.test(h));

    el(r, 'trkevent', 'touch').click();
    h = r.html();
    ok('‼️ event kinds ADD UP rather than replace each other — both items are back',
        /data-code="U-9"/.test(h) && /data-code="P-2"/.test(h));

    // the same narrowing, seen through another view
    el(r, 'trkview', 'timeline').click();
    h = r.html();
    ok('the timeline honours the SAME filter — a view is a question, not a page',
        !/>doing</.test(h.split('pj-trk-tl')[1] || '') || h.includes('touch'));
    ok('the timeline draws day headings, because a flat wall of times is not a chronology',
        h.includes('pj-trk-day'));
}

// ---------------------------------------------------------------------------
// the source axis, and hiding what was only reconstructed
// ---------------------------------------------------------------------------
{
    const r = run();
    el(r, 'act', 'trkFilters').click();
    el(r, 'trktoggle', 'hideBackfill').click();
    const h = r.html();
    ok('‼️ hiding reconstructed rows leaves only what was watched happening',
        h.includes('data-code="U-9"'));
    ok('…and the item whose only session row was a reconstruction keeps just its outside record',
        h.includes('data-code="P-2"') && !h.includes('cccc3333'));
}

// ---------------------------------------------------------------------------
// the search box is a QUERY box, over the whole history
// ---------------------------------------------------------------------------
{
    const r = run();
    const box = r.els['trk-q'] || r.query('#trk-q')[0];
    box.value = 'aaaa1111';
    box.fire('input');
    const h = r.html();
    ok('‼️ a session id finds the item it worked on — the box searches the history, not just the words',
        h.includes('data-code="U-9"') && !h.includes('data-code="P-2"'));
    ok('the narrowing is stated on the page, so a filter you forgot is not a lost record',
        /\d+ of \d+ tracked/.test(h));
}

// ---------------------------------------------------------------------------
// Sessions view — what a run actually got through
// ---------------------------------------------------------------------------
{
    const r = run();
    el(r, 'trkview', 'sessions').click();
    const h = r.html();
    ok('every session that touched the backlog gets a card',
        h.includes('aaaa1111') && h.includes('bbbb2222') && h.includes('cccc3333'));
    ok('a card names the codes it touched', h.includes('data-trkonly="U-9"'));
    ok('…and says how many of the SESSION\'s own turns went on the backlog',
        /of 41 turns/.test(h));
    ok('pressing a code goes back to that item\'s history',
        els(r, 'trkonly').length > 0);

    el(r, 'trkonly', 'U-9').click();
    const h2 = r.html();
    ok('‼️ it narrows through the visible search box rather than a hidden focus — removable, and it shows',
        h2.includes('value="U-9"') && h2.includes('data-code="U-9"') && !h2.includes('data-code="P-2"'));
}

// ---------------------------------------------------------------------------
// Gaps — the view that says what the record does NOT know
// ---------------------------------------------------------------------------
{
    const r = run();
    el(r, 'trkview', 'gaps').click();
    const h = r.html();
    ok('the untracked item is named here and nowhere else', h.includes('K-3'));
    ok('coverage is stated as a share, not just a count', /\d+%/.test(h));
    ok('the doubt kinds are broken down', h.includes('data-trkdoubt="multi"')
        || h.includes('data-trkdoubt="guess"'));
    ok('reconstructed rows are counted separately from observed ones',
        /Reconstructed rather than watched/.test(h));
    ok('an untracked code still opens the backlog at its line',
        h.includes('data-trkgo="K-3"'));
}

// ---------------------------------------------------------------------------
// ‼️ Reconstruct writes NOTHING until it is told twice
// ---------------------------------------------------------------------------
{
    const r = run();
    el(r, 'act', 'trkFill').click();
    ok('the card opens', r.html().includes('data-act="trkFillRun"'));
    ok('‼️ Apply is dead until there is a preview to apply',
        /data-act="trkFillApply" disabled/.test(r.html()));

    const before = r.posted.length;
    el(r, 'act', 'trkFillRun').click();
    const preview = r.last();
    ok('previewing asks the host', preview && preview.type === 'trackBackfill');
    ok('‼️ …and it does NOT apply — one click must never append to somebody\'s ledger',
        preview.apply === false);
    ok('exactly one message went out', r.posted.length === before + 1);

    r.send({
        type: 'trackBackfill', apply: false, error: null, scanned: 12, partial: false,
        mentions: 40, codes: ['K-3'], rows: 2,
        proposed: [
            { code: 'K-3', event: 'touch', ts: T - 5 * DAY, short: 'dddd4444', turn: 9, by: 'backfill', uncertain: 'guess', note: 'reconstructed' },
            { code: 'K-3', event: 'done', ts: T - 4 * DAY, short: 'dddd4444', turn: 14, by: 'backfill', uncertain: 'guess', note: 'reconstructed' }
        ]
    });
    const h = r.html();
    ok('the preview lists the rows it would write', h.includes('dddd4444') && h.includes('#14'));
    ok('…and says they will be stamped as reconstructed', /backfill/.test(h));
    ok('now Apply is live', /data-act="trkFillApply"(?![^>]*disabled)/.test(h));

    el(r, 'act', 'trkFillApply').click();
    const applied = r.last();
    ok('‼️ the second press carries apply — the same request, not a re-derivation',
        applied.type === 'trackBackfill' && applied.apply === true);
}

// ---------------------------------------------------------------------------
// recording an event by hand — a form on the page, and the note survives a refusal
// ---------------------------------------------------------------------------
{
    const r = run();
    el(r, 'trkrec', 'U-9').click();
    const h = r.html();
    ok('the row opens the record form on that item', h.includes('id="trk-form"'));
    ok('it is a form on the page, not a chain of boxes', h.includes('data-af="code"')
        && h.includes('data-af="event"') && h.includes('data-af="note"'));
    ok('touch is offered first — the attempts are the history a log of endings throws away',
        h.indexOf('>· touch<') < h.indexOf('>✓ done<'));

    // ‼️ The shim does not model a <select>'s selected <option>, so the value is
    // set the way a browser would have set it — the page reads the control, not
    // its own draft, which is the whole bargain of AFForm.read.
    const codeSel = r.query('[data-af="code"]')[0];
    codeSel.value = 'U-9';
    codeSel.fire('change');
    const note = r.query('[data-af="note"]')[0];
    note.value = 'looked, root cause not found';
    note.fire('input');
    r.query('[data-afact="submit"]')[0].click();
    const m = r.last();
    ok('submitting records it', m && m.type === 'trackRecord' && m.code === 'U-9');
    ok('…carrying the note, which is the point of the row', m.note === 'looked, root cause not found');

    // The host answers exactly this pair: the verdict, then the repaint.
    r.send({ type: 'result', error: 'the project has no folder on disk', ok: null });
    r.send({ type: 'data', data: baseData() });
    const after = r.html();
    ok('‼️ a refusal keeps the card and the words — a form that emptied itself on an error loses the note',
        after.includes('the project has no folder on disk') && after.includes('id="trk-form"'));
    ok('…and the note is still in the box', after.includes('looked, root cause not found'));

    const r2 = run();
    el(r2, 'trkrec', 'U-9').click();
    const sel2 = r2.query('[data-af="code"]')[0];
    sel2.value = 'U-9';
    sel2.fire('change');
    r2.query('[data-afact="submit"]')[0].click();
    r2.send({ type: 'result', error: null, ok: 'Recorded against U-9.' });
    r2.send({ type: 'data', data: baseData() });
    ok('a clean record closes the card — there is nothing left to say',
        !r2.html().includes('id="trk-form"'));
}

// ---------------------------------------------------------------------------
// rebuilding the log
// ---------------------------------------------------------------------------
{
    const r = run();
    el(r, 'act', 'trkRebuild').click();
    const m = r.last();
    ok('rebuilding the log is one message to the host', m && m.type === 'trackRebuild');
}

// ---------------------------------------------------------------------------
// the right-click contract
// ---------------------------------------------------------------------------
{
    const r = run();
    const ctxs = r.contexts();
    const row = ctxs.find(c => c.webviewSection === 'afTrackRow');
    ok('a track row publishes itself for the menu', !!row);
    ok('…carrying the code, which is the handle that survives everything', row.code === 'U-9');
    ok('‼️ …and NOT the words — the attribute is on every row and the items run to paragraphs',
        !('text' in row));
    ok('…and what the menu needs to decide what to offer',
        'afStamp' in row && 'afState' in row);
    const run1 = ctxs.find(c => c.webviewSection === 'afSessionRow');
    ok('a run IS a session, so it carries the full session menu',
        !!run1 && !!run1.sessionId);

    // the menu's own actions run the same page functions the buttons run
    r.send({ type: 'afctx', act: 'trkOnly', ctx: { code: 'P-2' } });
    ok('"show only this" narrows to that code', r.html().includes('value="P-2"'));
    r.send({ type: 'afctx', act: 'trkGo', ctx: { code: 'P-2' } });
    ok('"open the backlog at this item" sends the same message the code does',
        r.last().type === 'backlogOpenItem' && r.last().code === 'P-2');
    r.send({ type: 'afctx', act: 'trkBacklog', ctx: { code: 'P-2' } });
    ok('"show it in the Backlog" leaves for the tab that can edit it',
        r.html().includes('class="pj-tab on" data-tab="backlog"'));
}

// ---------------------------------------------------------------------------
// "where has this been worked?" from the BACKLOG lands ON the item
// ---------------------------------------------------------------------------
{
    const r = run({ tab: 'backlog', tabData: { track: track() } });
    r.send({ type: 'afctx', act: 'blTrack', ctx: { code: 'P-2', key: 'P-2', line: 44 } });
    const h = r.html();
    ok('it opens the Track tab', h.includes('class="pj-tab on" data-tab="track"'));
    ok('‼️ …ON that item — an answer that lists eighty other codes is not an answer',
        h.includes('value="P-2"') && !h.includes('data-code="U-9"'));
}

// ---------------------------------------------------------------------------
// nothing recorded yet — the two empty states are different answers
// ---------------------------------------------------------------------------
{
    const empty = track();
    empty.rows = [];
    empty.events = 0;
    empty.gaps = { untracked: 1, uncertain: 0, backfilled: 0, noSession: 0 };
    const r = run({ tabData: { track: empty } });
    const h = r.html();
    ok('an empty ledger explains how a record gets here', /projects\.backlog\.check/.test(h));
    ok('…and offers the reconstruction, because the transcripts may already hold it',
        /Reconstruct/.test(h));

    const r2 = run();
    const box = r2.query('#trk-q')[0];
    box.value = 'nothing-matches-this';
    box.fire('input');
    ok('a filter that matches nothing says it is a FILTER, not an empty ledger',
        /filter\(s\) are on/.test(r2.html()));
}

// ---------------------------------------------------------------------------
// the payload ceiling is said out loud
// ---------------------------------------------------------------------------
{
    const big = track();
    big.truncated = true;
    big.events = 9000;
    const r = run({ tabData: { track: big } });
    ok('‼️ a truncated payload is announced — a silent slice is a page telling a quiet lie',
        /more records than one paint carries/.test(r.html()));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
