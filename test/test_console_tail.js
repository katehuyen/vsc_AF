// K-19 — THE NEW-LINE BADGE AND THE READING POSITION, MEASURED AS PIXELS.
//
// ‼️ WHY THIS FILE EXISTS SEPARATELY FROM test_console_page.js. Every other
// Console test reads the markup as a string, and both halves of this bug are
// invisible there: a badge that never appears is a `hidden` flag nobody asserts,
// and a reading position that slides is `scrollTop` against a `scrollHeight`
// that a string shim does not have at all. So this file gives `#talk` a real
// geometry — row heights, a viewport, a clamped scrollTop — and drives the page
// the way a reader does: scroll up, let the turn run, look at what happened.
//
// The model is deliberately crude and deliberately honest: a row is as many
// LINE_H-tall lines as its text has, the viewport is VIEW_H, and scrollTop is
// clamped exactly as a browser clamps it. Nothing here knows what the page does
// about it — the assertions are all "where is the reader, and what does the
// badge say".
'use strict';
const path = require('path');
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const LINE_H = 20;
const VIEW_H = 300;
const NOW = Date.parse('2026-08-14T09:00:00Z');

/** The test's own model of how tall a row draws — see the note above. */
function rowLines(m) {
    if (!m) { return 1; }
    if (m.role === 'tool' && m.tool) { return 1; }
    return 1 + String(m.text || '').split('\n').length - 1;
}

const session = (messages, o) => Object.assign({
    id: 'cs1', agentId: 'a-dev', agentName: 'developer', sessionId: 'S1',
    cwd: 'D:\\repo', title: 'uzun akis', status: 'working', cost: 0, turns: 1,
    queued: [], tokens: 0, wTokens: 0, engine: 'claude', engineLabel: 'Claude Code',
    turnShape: 'persistent', steerable: true, reportsCost: true,
    model: '', effort: '', permissionMode: '', contextTokens: 0, lastTs: NOW,
    turnStartedAt: NOW - 5000, turnTokens: 0, turnWTokens: 0, turnApiCalls: 0,
    turnSteps: 0, turnThinking: 0, turnCost: 0, turnModel: '', turnEffort: '',
    lastTurn: null, pendingPermission: null, pendingAsk: null, exitReason: '',
    projectId: '', projectName: '', projectIcon: '', messages
}, o);

const shell = (messages) => ({
    generatedAt: NOW, selected: 'cs1', presetAgent: '',
    sessions: [session(messages)],
    agents: [{ id: 'a-dev', name: 'developer', dir: 'D:\\ajan' }],
    models: [{ id: '', label: 'Default' }], efforts: [{ id: '', label: 'Default' }],
    engineModels: {}, permissions: [{ id: '', label: 'Default' }],
    livePermissions: [{ id: '', label: 'Default' }], grants: [],
    engines: [{
        id: 'claude', label: 'Claude Code', ready: true, auth: 'subscription',
        shape: 'persistent', steerable: true, reportsCost: true,
        billing: '', next: '', note: ''
    }],
    engine: 'claude', defaults: { engine: '', model: '', effort: '', permissionMode: '' },
    dropZone: true, attachMax: 20, owned: [], lastWindow: [], projects: [],
    activeProjectId: '', chipProjectId: '', projectContext: '', pinnedAgent: '',
    resumable: [], resumeTotal: 0, resumeAgents: [], resumeMax: 60,
    resumeDefaultN: 15, resumeFiltered: false
});

/** Forty rows of ordinary traffic, then the answer the agent is still writing. */
function baseMessages() {
    const out = [];
    for (let i = 0; i < 20; i++) {
        out.push({ id: 'u' + i, ts: NOW - 100000 + i * 1000, role: 'user', text: 'soru ' + i });
        out.push({
            id: 'a' + i, ts: NOW - 99000 + i * 1000, role: 'agent', kind: 'say',
            text: 'cevap ' + i
        });
    }
    out.push({ id: 'stream', ts: NOW, role: 'agent', kind: 'say', text: 'ilk satir' });
    return out;
}

/**
 * Give the page a viewport.
 *
 * ‼️ THE LAYOUT FOLLOWS THE DOM WRITE, NOT THE DATA — and getting that wrong
 * makes the whole file lie. A message growing in the host's snapshot changes
 * nothing on screen until `talkinner` is actually rewritten; a model that
 * re-measures off the live data instead reports the new heights early, so the
 * page's own before-and-after readings come out identical and a broken anchor
 * passes. So the heights are snapshotted when the html is written, exactly as a
 * browser lays out when the nodes change.
 */
function attachGeometry(r, live) {
    const doc = r.sandbox.document;
    const talk = doc.getElementById('talk');
    const inner = doc.getElementById('talkinner');
    let scrollTop = 0;
    let laid = {};

    const relayout = () => {
        laid = {};
        (live.messages || []).forEach(m => { laid[m.id] = rowLines(m); });
    };
    const html = Object.getOwnPropertyDescriptor(inner, 'innerHTML');
    Object.defineProperty(inner, 'innerHTML', {
        get: html.get,
        set(v) { html.set.call(this, v); relayout(); },
        configurable: true
    });
    relayout();

    const rows = () => {
        const re = /data-mid="([^"]*)"( data-top="1")?/g;
        const found = [];
        let m;
        const html = inner.innerHTML || '';
        while ((m = re.exec(html))) { found.push({ mid: m[1], top: m[2] ? '1' : undefined }); }
        let y = 0;
        return found.map(f => {
            const h = (laid[f.mid] || 1) * LINE_H;
            const top = y;
            y += h;
            return {
                dataset: { mid: f.mid, top: f.top }, _top: top, _h: h,
                getBoundingClientRect: () => ({ top: top - scrollTop, bottom: top + h - scrollTop })
            };
        });
    };
    const height = () => rows().reduce((a, x) => a + x._h, 0);
    const maxScroll = () => Math.max(0, height() - VIEW_H);

    Object.defineProperty(inner, 'children', { get: rows, configurable: true });
    inner.querySelector = (sel) => {
        const m = /data-mid="([^"]*)"/.exec(String(sel));
        if (!m) { return null; }
        const want = m[1].replace(/\\/g, '');
        return rows().filter(x => x.dataset.mid === want)[0] || null;
    };
    Object.defineProperty(talk, 'scrollHeight', { get: height, configurable: true });
    Object.defineProperty(talk, 'clientHeight', { get: () => VIEW_H, configurable: true });
    Object.defineProperty(talk, 'scrollTop', {
        get: () => scrollTop,
        set: v => { scrollTop = Math.max(0, Math.min(maxScroll(), Number(v) || 0)); },
        configurable: true
    });
    talk.getBoundingClientRect = () => ({ top: 0, bottom: VIEW_H });
    return { talk, inner, rows, maxScroll };
}

const badge = (r) => {
    const b = r.sandbox.document.getElementById('c-jump');
    return { hidden: !!(b && b.hidden), text: (b && b.textContent) || '' };
};
/** The badge's own number, or 0 while it is hidden. */
const unseen = (r) => {
    const b = badge(r);
    if (b.hidden) { return 0; }
    return Number((/(\d+)/.exec(b.text) || [, 0])[1]);
};
/** Where a row sits relative to the top of the viewport — the reading position. */
const rowTop = (g, mid) => {
    const hit = g.rows().filter(x => x.dataset.mid === mid)[0];
    return hit ? hit.getBoundingClientRect().top : null;
};

// ---------------------------------------------------------------------------
// ‼️ THIS FILE IS ABOUT THE TAIL, NOT THE FILTER. The panel's standing default
// shows the dialog only, so a tool row pushed below would never be drawn and
// every anchor measurement here would be measuring the filter instead. Seeded
// with every kind on — on the CARD, because the panel default is Dialog and is
// not a setting (K-40) — deliberately: what the filter does is measured in
// test_console_show.js, and what it must NOT do is measured further down.
const ALL_KINDS = ['user', 'agent', 'tool', 'result', 'error', 'system', 'ask'];
const live = { messages: baseMessages() };
const r = runPage('console.js', shell(live.messages), undefined, { afConsole: { kindsBy: { cs1: ALL_KINDS } } });
const g = attachGeometry(r, live);

/** Push a new data snapshot and let the page repaint, as the host does. */
function push() {
    r.send({ type: 'data', data: shell(live.messages) });
}

// Land at the tail, the way a freshly opened Console does.
g.talk.scrollTop = g.maxScroll();
push();
ok('at the tail, nothing is unseen', unseen(r) === 0 && badge(r).hidden);

// ---- the reader scrolls up ------------------------------------------------
const parked = g.maxScroll() - 260;
g.talk.scrollTop = parked;
g.talk.fire('scroll');
ok('scrolled up, the badge is still empty — nothing new has arrived yet',
    unseen(r) === 0);

const anchorMid = g.rows().filter(x => x.getBoundingClientRect().bottom > 1)[0].dataset.mid;
const anchorAt = rowTop(g, anchorMid);

// ---- ‼️ THE RARE ONE: the SAME message grows -------------------------------
// A long answer streams into one object. The row count never moves, which is
// why the badge used to stay hidden through an entire paragraph.
live.messages[live.messages.length - 1].text = 'ilk satir\nikinci\nucuncu\ndorduncu';
push();
ok('‼️ K-19 — three lines streamed into the SAME row are three new lines',
    unseen(r) === 3);
ok('…and the reader has not been moved', g.talk.scrollTop === parked);
ok('…so the row they were reading is on the same pixel',
    rowTop(g, anchorMid) === anchorAt);

// ---- a new message object, the path that always worked --------------------
live.messages.push({ id: 't1', ts: NOW + 1000, role: 'tool', kind: 'local', tool: { name: 'Read', detail: 'x.ts' } });
push();
ok('a new row still counts as one line', unseen(r) === 4);
ok('…and still does not move the reader', g.talk.scrollTop === parked);

// ---- ‼️ THE OTHER RARE ONE: something ABOVE the fold changes height --------
// This is the half `scrollTop` alone cannot survive. Leaving the scroll offset
// alone preserves the view only while the pixels above the fold stay the same
// pixels; when a row up there re-wraps, gains a chip, or comes back a line
// taller for any reason, the same offset is a different place in the
// conversation and the reader slides. It only ever happens ALONGSIDE a repaint
// — no repaint, no rebuilt rows, nothing to shift — so the two arrive together
// here, exactly as they would in a running turn.
const grew = live.messages[2];
grew.text = grew.text + '\nek satir\nbir daha';        // +2 lines, well above the fold
live.messages.push({ id: 'r1', ts: NOW + 1500, role: 'result', text: 'done', ms: 1200, tokens: 90 });
push();
ok('‼️ K-19 — a row that grew ABOVE the reader does not drag the page under them',
    rowTop(g, anchorMid) === anchorAt);
ok('…and the correction is a real scroll, not a coincidence',
    g.talk.scrollTop === parked + 2 * LINE_H);

// ---- the badge is the way back --------------------------------------------
const jump = r.query('#c-jump')[0];
jump.click();
ok('the badge lands at the tail', g.talk.scrollTop === g.maxScroll());
ok('…and clears itself', unseen(r) === 0 && badge(r).hidden);

// ---- and coming back on foot clears it too --------------------------------
g.talk.scrollTop = g.maxScroll() - 400;
g.talk.fire('scroll');
live.messages.push({ id: 'u99', ts: NOW + 2000, role: 'user', text: 'bir sey daha' });
push();
ok('away from the tail it counts again', unseen(r) === 1);
g.talk.scrollTop = g.maxScroll();
g.talk.fire('scroll');
ok('scrolling back down clears the badge without a click',
    unseen(r) === 0 && badge(r).hidden);

// ---- pinned at the bottom, the tail follows -------------------------------
live.messages.push({ id: 'a99', ts: NOW + 3000, role: 'agent', kind: 'say', text: 'son soz' });
push();
ok('pinned at the bottom, new lines are read as they land',
    unseen(r) === 0 && g.talk.scrollTop === g.maxScroll());

// ---- the identity the anchor rides on -------------------------------------
ok('every row publishes its message id',
    (r.sandbox.document.getElementById('talkinner').innerHTML.match(/data-mid="/g) || []).length
    === live.messages.length);

// ---------------------------------------------------------------------------
// K-23 — and the same anchor is what makes "load older" bearable.
//
// A chunk arriving in front of the conversation moves EVERY row the reader can
// see. Without the anchor they are thrown two hundred messages back up the
// thread they had just scrolled down through; with it the line they were on
// stays under their eye and the new part is above, waiting.
// ---------------------------------------------------------------------------
{
    const head = (older) => ({
        id: 'xh-start', ts: NOW - 200000, role: 'system',
        text: older ? `↑ ${older} older message(s) are in the transcript.` : '↑ the start of this session',
        ...(older ? { more: { older, chunk: 200, stamp: '1.2 MB · 14 Aug 09:00' } } : {})
    });
    const older = (from, to) => {
        const out = [];
        for (let i = from; i < to; i++) {
            out.push({ id: 'xh' + i, ts: NOW - 100000 + i, role: i % 2 ? 'agent' : 'user', text: 'eski ' + i });
        }
        return out;
    };

    const live2 = { messages: [head(400), ...older(600, 640)] };
    const r2 = runPage('console.js', shell(live2.messages));
    const g2 = attachGeometry(r2, live2);
    const push2 = () => r2.send({ type: 'data', data: shell(live2.messages) });
    g2.talk.scrollTop = g2.maxScroll();
    push2();

    const html = () => r2.sandbox.document.getElementById('talkinner').innerHTML || '';
    // ‼️ AND THIS ONE IS LEFT ON THE STANDING DEFAULT (Dialog) ON PURPOSE. The
    // boundary is written as a system line, so the day the default stopped
    // showing system lines the door to the older transcript stopped being drawn
    // — measured, and green in every string test, because no test had ever
    // opened this card with the filter a reader actually gets.
    ok('‼️ the way back survives the DEFAULT filter, which hides system lines',
        r2.query('[data-older]').length === 1);
    ok('‼️ K-23 — the head row offers the way further back', /data-older="1"/.test(html()));
    ok('…and says how many one press brings', /↑ load 200 older/.test(html()));
    ok('…while the boundary marker is flagged as not being conversation',
        /data-mid="xh-start" data-top="1"/.test(html()));

    // the reader walks up to the top of what the card holds
    g2.talk.scrollTop = 0;
    g2.talk.fire('scroll');
    const reading = 'xh601';
    const wasAt = rowTop(g2, reading);

    r2.query('[data-older]')[0].click();
    const sent = r2.posted[r2.posted.length - 1];
    ok('‼️ K-23 — pressing it asks the host for the older piece',
        sent && sent.type === 'loadOlder' && sent.id === 'cs1');

    // …and the host answers, exactly as ConsolePanel does: a new head, the
    // chunk, then everything that was already there.
    live2.messages = [head(200), ...older(400, 600), ...live2.messages.slice(1)];
    push2();

    ok('the older piece is drawn', /data-mid="xh400"/.test(html()));
    ok('…once, and only once', (html().match(/data-mid="xh600"/g) || []).length === 1);
    ok('‼️ K-23 — and the line the reader was on has not moved',
        rowTop(g2, reading) === wasAt);
    ok('…which took a real scroll, because everything above it grew',
        g2.talk.scrollTop === 200 * LINE_H);
    ok('the head row now says what is still above', /↑ load 200 older/.test(html())
        && /200 older message\(s\)/.test(html()));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
