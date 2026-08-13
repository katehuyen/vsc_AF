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
        /class="pj-tab tb-track on" data-tab="track"/.test(h));
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
    const closing = els(r, 'trackturn').find(e =>
        (e.className || '').indexOf('pj-trk-stamp') >= 0);
    ok('P-13: the closing stamp is itself a transcript button',
        !!closing && closing.dataset.trackturn === 'D:\\t\\b.jsonl');
    if (closing) { closing.click(); }
    ok('…and it opens that session in Track reading mode',
        r.last() && r.last().type === 'openSession' && r.last().file === 'D:\\t\\b.jsonl'
        && r.last().view === 'track' && r.last().ts === undefined);
    ok('the human\'s own note is shown', h.includes('closed by lower-casing both sides'));
    ok('a record with no session says so rather than inventing one',
        h.includes('no session'));
    ok('the ledger is named, so the raw data is findable',
        h.includes('backlog-track.jsonl'));
    ok('the size badge carries the turns it actually took — the one figure that needs both files',
        /L · 5t/.test(h));
}

// ---------------------------------------------------------------------------
// ‼️ P-14 — WHAT THE CARD SAYS ABOUT ITS OWN DOUBT, AND ABOUT ITS ENDING
//
// Two complaints, one card. Almost every row wore a bare "uncertain" while
// naming a session, printing its id and linking to it — which reads as a
// contradiction, and a warning a reader cannot place is one they stop reading.
// And the note an agent writes when it CLOSES an item — the answer to the
// question this whole tab exists for — never reached the page at all: the row
// carried `closedTs`, `closedEvent` and `closedBy`, and not the sentence.
// ---------------------------------------------------------------------------
{
    const rows = track();
    rows.rows[0].doubts = ['multi'];
    rows.rows[0].closedNote = 'Kapatıldı: iki tarafı da küçük harfe çevirerek. '
        + 'Sonradan bakan biri için: eşleşme artık büyük/küçük harf duyarsız, '
        + 'yani eski kayıtlar da bulunuyor.';
    rows.rows[1].doubts = ['guess', 'none'];
    const r = run({ tabData: { track: rows } });
    const h = r.html();

    ok('‼️ P-14 — the doubt badge NAMES what it is unsure of',
        h.includes('>multi?</span>') && !/>uncertain<\/span>/.test(h));
    ok('…and a card with two reasons says both', h.includes('>guess?</span>')
        && h.includes('>none?</span>'));
    ok('…with what that reason means in the panel, not a word repeated on every card',
        h.includes('More than one live session'));

    ok('‼️ P-14 — the closing note is DRAWN, not buried one hover deep',
        h.includes('class="pj-trk-close"') && h.includes('Kapatıldı: iki tarafı da küçük harfe'));
    ok('…said to be the closer\'s, next to the human\'s own which is a different thing',
        h.includes('closed by lower-casing both sides') && h.includes('class="pj-trk-note"'));
    ok('…and a long one is cut visibly rather than silently',
        h.includes('…') && h.includes('Sonradan bakan biri için'));

    ok('‼️ P-14 — an event chip that carries a note LOOKS like it does',
        /class="pj-trk-ev e-touch noted"/.test(h) && h.includes('pj-trk-notemark'));
    ok('…and one that carries nothing is left plain',
        /class="pj-trk-ev e-doing"[^>]*title=/.test(h));
}

// ---------------------------------------------------------------------------
// ‼️ X-36 — AN ITEM ASKED FOR MORE THAN ONCE SAYS SO, AND SAYS WHAT IT ASKED
//
// A backlog line holds ONE text: whatever it says now. So an item reopened
// twice said only the third thing, the two askings that made a third necessary
// existed nowhere, and every agent handed it started from a blank slate on work
// that had already failed twice. The reopen now takes the words with it.
// ---------------------------------------------------------------------------
{
    const rows = track();
    rows.rows[0].round = 3;
    rows.rows[0].rounds = [
        { ts: T - 4 * DAY, text: 'ilk isteğim: eşleşme büyük/küçük harfe takılıyor' },
        { ts: T - 2 * DAY, text: 'ikinci kez: yalnız bir yer düzeltilmiş, arama hâlâ bulmuyor' }
    ];
    const r = run({ tabData: { track: rows } });
    const h = r.html();

    ok('‼️ X-36 — a card on its third go says which round it is',
        h.includes('class="pj-trk-round"') && h.includes('round 3'));
    ok('…and carries what was asked each earlier time, dated',
        h.includes('Round 1 — asked') && h.includes('eşleşme büyük/küçük harfe takılıyor')
        && h.includes('ikinci kez'));
    ok('…and an item nobody reopened wears nothing — round 1 is the normal case',
        (h.match(/class="pj-trk-round"/g) || []).length === 1);

    // An item reopened before any of this was recorded has a round count and no
    // earlier wording. It says that rather than drawing an empty panel.
    const older = track();
    older.rows[1].round = 2;
    older.rows[1].rounds = [];
    const r2 = run({ tabData: { track: older } });
    ok('…and one reopened before the snapshot existed admits the wording is gone',
        r2.html().includes('the earlier wording was not kept'));
}

// ---------------------------------------------------------------------------
// X-23: every Track door opens one neutral transcript reading view
// ---------------------------------------------------------------------------
{
    const r = run();
    const turns = els(r, 'trackturn').filter(e => e.dataset.trackts);
    ok('there is a turn to press', turns.length >= 3);
    turns[0].click();
    const m = r.last();
    ok('it opens a session', m && m.type === 'openSession');
    ok('…without selecting a turn, and asks for the Track reading view',
        m && m.ts === undefined && m.view === 'track');
    ok('…and it names the transcript file', m && /\.jsonl$/.test(m.file));
    // Source timestamps still identify the ledger rows; the click contract
    // deliberately does not forward them to the viewer.
    const chips = els(r, 'trackturn').filter(e =>
        e.dataset.trackts && (e.className || '').indexOf('pj-trk-turn') >= 0);
    ok('each ledger turn still carries its own recorded moment',
        chips.length >= 2 && chips[0].dataset.trackts !== chips[1].dataset.trackts);
}

// ---------------------------------------------------------------------------
// ‼️ and the session ID itself opens the transcript (A-5)
// ---------------------------------------------------------------------------
{
    const r = run();
    const sid = els(r, 'trackturn').filter(e =>
        (e.className || '').indexOf('pj-trk-sid') >= 0)[0];
    ok('the session id is a button, not a caption', !!sid);
    sid.click();
    const m = r.last();
    ok('…and pressing it opens that session', m && m.type === 'openSession');
    ok('…in the same neutral Track reading view',
        m && m.view === 'track' && m.ts === undefined);
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
        r.html().includes('class="pj-tab tb-backlog on" data-tab="backlog"'));
}

// ---------------------------------------------------------------------------
// U-25: the ordering control reaches every view, or says it cannot
//
// It used to reach `trkItemsHtml` and nothing else while being drawn on all
// four views — so on three of them "last worked" and "first worked" produced
// the same page, which is what the ordering looked like: broken.
// ---------------------------------------------------------------------------
{
    // ‼️ `r.els` and not `r.query`: the page re-wires through getElementById,
    // which keeps handing back the element it first saw, while a fresh query
    // after a repaint builds a NEW one with no listeners on it. Firing at that
    // one changes nothing and the assertion blames the page.
    const setSort = (r, v) => {
        const s = r.els['trk-sort'] || r.query('#trk-sort')[0];
        s.value = v; s.fire('change');
    };
    const axisOn = h => (/<option value="([a-z]+)"[^>]*selected/.exec(h) || [])[1];
    const offers = (h, id) => new RegExp(`<option value="${id}"`).test(h);
    /** The rows on screen, in the order they are drawn — items and timeline
     *  alike, both of which publish the code they are about. */
    const rowsIn = h => (h.match(/data-trkrow data-code="([^"]+)"/g) || [])
        .map(s => s.replace(/.*"([^"]+)"/, '$1'));

    /**
     * ‼️ AN ITEM THAT STARTED LAST AND FINISHED FIRST — the fixture the two date
     * axes need. U-9 and P-2 happen to run in the same order on both, which is
     * exactly why the bug survived: on data like that a broken "first worked"
     * looks right. S-1 is a short job late in the week, so it is newest by
     * `first` and only second by `last`.
     */
    const withShortLateItem = () => {
        const t = track();
        t.rows.push({
            code: 'S-1', text: 'started last, finished first', state: 'done', area: 'S',
            section: 'S — Oturumlar', line: 70, priority: 'normal', effort: 'S', kinds: [],
            parent: null, children: [], plan: null, due: null,
            turns: 1, doubtful: false, backfilled: false, sources: ['agent'],
            stamp: null, note: '',
            firstTs: T - 7200000, lastTs: T - 3600000, closedTs: T - 3600000,
            closedEvent: 'done', closedBy: 'agent',
            sessions: [{
                session: 'dddd4444-w', short: 'dddd4444', file: 'D:\\t\\d.jsonl',
                agent: 'developer', span: '#2', firstTs: T - 7200000, lastTs: T - 3600000,
                uncertain: null, turns: [{ n: 2, ts: T - 7200000 }],
                events: [
                    { code: 'S-1', event: 'touch', ts: T - 7200000, at: '', session: 'dddd4444-w', short: 'dddd4444', turn: 2, agent: 'developer', by: 'agent', uncertain: null, note: null },
                    { code: 'S-1', event: 'done', ts: T - 3600000, at: '', session: 'dddd4444-w', short: 'dddd4444', turn: 2, agent: 'developer', by: 'agent', uncertain: null, note: null }
                ]
            }],
            loose: []
        });
        return { tabData: { track: t } };
    };

    // ---- Items: first worked and last worked are different questions -------
    {
        const r = run(withShortLateItem());
        const h0 = r.html();
        ok('the Items view offers every axis',
            ['last', 'first', 'turns', 'sessions', 'span', 'closed', 'code', 'state', 'area']
                .every(a => offers(h0, a)));
        setSort(r, 'last');
        const byLast = rowsIn(r.html())[0];
        setSort(r, 'first');
        const byFirst = rowsIn(r.html())[0];
        ok('‼️ "last worked" and "first worked" are two different orders',
            byLast === 'U-9' && byFirst === 'S-1');
        setSort(r, 'code');
        ok('…and an axis that is not a date is honoured too — descending, as the arrow says',
            rowsIn(r.html()).join(',') === 'U-9,S-1,P-2');
        setSort(r, 'state');
        ok('…as is one that is neither a date nor a name', axisOn(r.html()) === 'state');
        setSort(r, 'span');
        ok('…and "span" puts the long-running item at the top',
            rowsIn(r.html())[0] === 'P-2');
    }

    // ---- Timeline: no axis, but the direction is real ----------------------
    {
        const r = run();
        el(r, 'trkview', 'timeline').click();
        const h = r.html();
        ok('the Timeline offers no axis — it is ordered by when things happened',
            !r.query('#trk-sort').length && h.includes('chronological'));
        ok('…and it still draws its records', (h.match(/class="pj-trk-tl /g) || []).length > 1);
        const firstCode = rowsIn(h)[0];
        el(r, 'act', 'trkDir').click();
        const flipped = rowsIn(r.html())[0];
        ok('‼️ the ↑↓ button turns the timeline round — it used to be drawn and inert',
            firstCode === 'U-9' && flipped === 'P-2');
    }

    // ---- Sessions: the axes a session card can answer ----------------------
    {
        const r = run();
        el(r, 'trkview', 'sessions').click();
        const h = r.html();
        ok('the Sessions view offers the axes a session HAS',
            offers(h, 'last') && offers(h, 'first') && offers(h, 'turns') && offers(h, 'span'));
        ok('…and not the ones it does not — a run has no single code or state',
            !offers(h, 'state') && !offers(h, 'code') && !offers(h, 'area'));
        // bbbb2222 ran today, cccc3333 three days ago.
        setSort(r, 'last');
        ok('‼️ ordering the session cards actually reorders them',
            r.html().indexOf('bbbb2222') < r.html().indexOf('cccc3333'));
        el(r, 'act', 'trkDir').click();
        ok('…and the direction flips them',
            r.html().indexOf('cccc3333') < r.html().indexOf('bbbb2222'));
    }

    // ---- the choice survives a view that cannot honour it ------------------
    {
        const r = run();
        setSort(r, 'state');
        el(r, 'trkview', 'sessions').click();
        ok('a view that cannot answer "state" falls back rather than refusing',
            axisOn(r.html()) === 'last');
        el(r, 'trkview', 'items').click();
        ok('‼️ …and the reader gets their own choice back on the view that has it',
            axisOn(r.html()) === 'state');
    }
}

// ---------------------------------------------------------------------------
// U-25: the colour system, and the columns that used to wrap
// ---------------------------------------------------------------------------
{
    const r = run();
    const h = r.html();
    ok('an item card is ruled by its STATE', /class="pj-trk-item st-done/.test(h)
        && /class="pj-trk-item st-open/.test(h));
    ok('…and a history that was reconstructed rather than watched is marked as such',
        /class="pj-trk-item st-open backfilled"/.test(h));

    el(r, 'trkview', 'timeline').click();
    const tl = r.html();
    ok('a timeline row is ruled by what happened on it',
        /class="pj-trk-tl e-done"/.test(tl) && /class="pj-trk-tl e-touch"/.test(tl));
    ok('‼️ the note is the only column that flexes — the rest are given their width',
        /af-tipw tl-note/.test(tl) && /af-tipw tl-code/.test(tl));
    ok('…and a row with no session keeps the column instead of collapsing it',
        /pj-trk-turn" style="visibility:hidden"/.test(tl));
    ok('the words hang off the rich panel, not a native title that would cut',
        !/class="pj-trk-code"[^>]*title="[^"]{200,}/.test(tl));

    el(r, 'trkview', 'sessions').click();
    const ss = r.html();
    ok('a session that closed something says so in green',
        /class="pj-trk-item st-done"/.test(ss) && /pj-trk-m closed/.test(ss));
    ok('…and each code chip is coloured by what that run DID to it',
        /pj-trk-scode c-done/.test(ss));

    el(r, 'trkview', 'gaps').click();
    ok('a code with no history at all is drawn as the hole it is',
        /pj-trk-scode c-gap/.test(r.html()));
}

// ---------------------------------------------------------------------------
// "where has this been worked?" from the BACKLOG lands ON the item
// ---------------------------------------------------------------------------
{
    const r = run({ tab: 'backlog', tabData: { track: track() } });
    r.send({ type: 'afctx', act: 'blTrack', ctx: { code: 'P-2', key: 'P-2', line: 44 } });
    const h = r.html();
    ok('it opens the Track tab', h.includes('class="pj-tab tb-track on" data-tab="track"'));
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

// ---------------------------------------------------------------------------
// ‼️ A-5 — ONE LOOK, ONE ANCHOR, AND NO ATTRIBUTE THAT SWALLOWS THE ROW
//
// Three invariants a regex over the source cannot check and every one of which
// has already been broken once on this page:
//   · a backlog code is drawn as the same chip on all four views;
//   · every rich panel is measured against its BLOCK, so one near the right of
//     the panel opens exactly where one near the left does;
//   · no native tooltip carries a paragraph, and no attribute is left unclosed
//     — the summary badge on every Items card was invisible for four releases
//     because one closing quote was missing and the attribute ate the row.
// ---------------------------------------------------------------------------
{
    const views = ['items', 'timeline', 'sessions', 'gaps'];
    for (const view of views) {
        const r = run();
        el(r, 'trkview', view).click();
        const h = r.html();

        // an attribute that never closes swallows everything up to the next
        // quote — including the text it was supposed to describe
        const swallowed = /(title|data-[a-z]+)="[^"]*<[a-z/]/i.exec(h);
        ok(`${view}: no attribute swallows the markup after it`, !swallowed);

        // every rich panel on this page is anchored to its row or card
        const loose = [...h.matchAll(/class="af-tipw([^"]*)"/g)]
            .filter(m => !/\btip-block\b|\btip-free\b/.test(m[1]));
        ok(`${view}: every rich hover is measured against its block`, loose.length === 0);

        // ‼️ ON A ROW a native tooltip is for FIGURES and nothing else. The
        // controls ABOVE the list are exempt on purpose: a control's own hover
        // is where that control is defined, once. What is banned is the
        // paragraph repeated on two hundred rows, which is what the platform
        // tooltip is worst at and what the rich panel exists for.
        const essay = [...h.matchAll(
            /class="[^"]*\bpj-trk-(?:code|ev|sid|state|kind|m|doubt|stamp|sum|turn|scode|words|tl[a-z]*)\b[^"]*"[^>]*title="([^"]{240,})"/g)];
        ok(`${view}: no row tooltip carries an essay`, essay.length === 0);
    }

    const r = run();
    ok('‼️ a code is the same chip on Items as on the Backlog tab',
        /class="pj-trk-code"/.test(r.html()));
    el(r, 'trkview', 'gaps').click();
    ok('…and the Gaps rows that name a code carry it too — the view whose whole '
        + 'job is to say what is missing used to leave the reader unable to see WHICH',
        /class="pj-trk-code"/.test(r.html()));
}

// ---------------------------------------------------------------------------
// U-52: the state axis here is the SAME axis as the backlog's, so it has the
// same two words. A named subset offered on one tab and not on its neighbour is
// the reader learning a gesture and then losing it.
// ---------------------------------------------------------------------------
{
    const r = run();
    ok('the state axis declares Active and Passive here too',
        r.ms.presets('trk-states').join() === 'active,passive');
    r.ms.preset('trk-states', 'passive');
    ok('‼️ …and pressing one really narrows to those two states',
        r.ms.ticked('trk-states').join() === 'done,cancelled');
    r.ms.preset('trk-states', 'active');
    ok('…the other way round as well',
        r.ms.ticked('trk-states').join() === 'open,doing');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
