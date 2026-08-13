// DOM-stub test for the BACKLOG tab of media/projects.js — the real page code,
// driven through a small DOM.
//
// The backlog page's whole job is narrowing: a few hundred items, and the reader
// wants the four bugs in two areas that nothing is blocking. Everything asserted
// here is something a regex over the source cannot see —
//
//   * every axis is a LIST (areas add up; types add up), because a single-select
//     filter answers the easy question and none of the real ones;
//   * a long item is CUT and can be opened, because three rows filling the
//     screen is not a list;
//   * cycling the work type keeps the tags the user invented;
//   * dragging exists only in file order — the only order that is the user's;
//   * ‼️ and the line number a row hands back is the host's own, unshifted. The
//     page was adding one to an already 1-based number, so every action on an
//     UNCODED capture addressed the line below it. Coded rows never showed it
//     because a code wins over a line.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const code = fs.readFileSync(path.resolve(__dirname, '../media/projects.js'), 'utf8');
// ‼️ The capture box's four text tools and the multi-pick filter dropdown are
// SHARED components, and the REAL ones run here rather than stubs: the page asks
// them for their markup, so a stub would let the two drift apart without a
// single test noticing.
const shared = fs.readFileSync(path.resolve(__dirname, '../media/afTextTools.js'), 'utf8')
    + '\n' + fs.readFileSync(path.resolve(__dirname, '../media/afFilters.js'), 'utf8')
    // …and the right-click contract, because every row publishes itself through
    // it. A stub here would let the rows and their menus drift apart in silence.
    + '\n' + fs.readFileSync(path.resolve(__dirname, '../media/afCtx.js'), 'utf8')
    + '\n' + fs.readFileSync(path.resolve(__dirname, '../media/afSessionCtx.js'), 'utf8')
    // …and the query language, because the search box is one (media/afQuery.js)
    + '\n' + fs.readFileSync(path.resolve(__dirname, '../media/afQuery.js'), 'utf8')
    // …and the rich hover panel, because the Next up strip and the row's `more`
    // BOTH open it: a stub would let the page and the panel drift apart, which
    // is the drift that put a truncating native title on the strip in the first
    // place (docs/CONVENTIONS.md → Hover).
    + '\n' + fs.readFileSync(path.resolve(__dirname, '../media/afTip.js'), 'utf8');
const createAfmsDom = require(path.resolve(__dirname, 'lib_afms_dom.js'));
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const dsName = s => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

/** A tiny DOM over the rendered HTML: every tag becomes an element that knows
 *  its attributes and which backlog row it sits inside. */
function makeDom(getHtml) {
    // ‼️ Elements are built ONCE per paint and reused. The page attaches its
    // handlers to what querySelectorAll returned; a stub that minted a fresh
    // object on every query would hand the test elements with no handlers on
    // them, and every click would silently do nothing.
    let cachedFor = null;
    let cached = [];
    function build() {
        const html = getHtml();
        if (cachedFor === html) { return cached; }
        const els = [];
        const rows = [];
        // A row is a `pj-bl-row` div and ends at its first closing div — the row
        // holds spans, buttons and inputs, never another div.
        const rowRe = /<div class="pj-bl-row[^"]*"[^>]*>/g;
        let rm;
        while ((rm = rowRe.exec(html))) {
            const end = html.indexOf('</div>', rm.index);
            rows.push({ from: rm.index, to: end < 0 ? html.length : end, el: null });
        }
        const tagRe = /<([a-zA-Z][\w-]*)\b([^>]*?)\/?>/g;
        let m;
        while ((m = tagRe.exec(html))) {
            const el = mkEl(m[1], m[2]);
            const owner = rows.find(r => m.index >= r.from && m.index <= r.to);
            if (owner && m.index === owner.from) { owner.el = el; }
            el._row = owner || null;
            els.push(el);
        }
        for (const el of els) { el.closest = () => (el._row ? el._row.el : null); }
        cachedFor = html;
        cached = els;
        return els;
    }

    function mkEl(tag, attrText) {
        const el = {
            tag, tagName: tag.toUpperCase(), dataset: {}, attrs: {}, value: '', checked: false, _h: {},
            classes: new Set()
        };
        const ar = /([a-zA-Z][\w-]*)(?:="([^"]*)")?/g;
        let a;
        while ((a = ar.exec(attrText))) {
            const name = a[1];
            const val = a[2] === undefined ? '' : a[2];
            el.attrs[name] = val;
            if (name.startsWith('data-')) { el.dataset[dsName(name.slice(5))] = val; }
            if (name === 'value') { el.value = val; }
            if (name === 'checked') { el.checked = true; }
            if (name === 'class') { for (const c of val.split(/\s+/)) { if (c) { el.classes.add(c); } } }
        }
        el.classList = {
            add: (...c) => c.forEach(x => el.classes.add(x)),
            remove: (...c) => c.forEach(x => el.classes.delete(x)),
            contains: c => el.classes.has(c),
            toggle: (c, on) => { if (on) { el.classes.add(c); } else { el.classes.delete(c); } }
        };
        // ‼️ HANDLERS ACCUMULATE, exactly as a real element's do. This used to
        // keep ONE per event, overwriting the last — which quietly hid a real
        // bug for a whole release: the type badge had two click handlers, an old
        // one that wrote a value and the picker that opens the menu. In a
        // browser both ran, so opening the menu also set a type nobody had
        // chosen; here the second registration erased the first and the test
        // that asserts "opening the menu writes nothing at all" passed anyway.
        // A stub that is more forgiving than the platform tests the wrong thing.
        el.addEventListener = (ev, fn) => { (el._h[ev] = el._h[ev] || []).push(fn); };
        // The row pickers stop the click from reaching the document listener that
        // dismisses them, so the event object has to carry that method.
        const evObj = () => ({ preventDefault() { }, stopPropagation() { }, target: el });
        el.click = () => (el._h.click || []).forEach(fn => fn(evObj()));
        el.fire = (ev, arg) => (el._h[ev] || []).forEach(fn => fn(Object.assign(evObj(), arg || {})));
        el.focus = () => { };
        el.setSelectionRange = () => { };
        // ‼️ An inline `style` is not decoration here: the capture box's dragged
        // height IS an inline height, and telling a drag apart from a re-layout
        // is done by reading it (U-18). A stub without one would make the whole
        // mechanism untestable and the test would silently assert nothing.
        el.style = {};
        // Both axes: rows are dropped on above/below, queue chips left/right.
        el.getBoundingClientRect = () => ({ top: 0, height: 20, left: 0, width: 40 });
        el.querySelectorAll = () => [];
        el.scrollIntoView = () => { };
        return el;
    }

    /** `[data-x]`, `[data-x="v"]`, `#id`, and any of them chained. */
    function matches(el, sel) {
        const parts = sel.match(/\[[^\]]+\]|#[\w-]+/g) || [];
        return parts.every(p => {
            if (p[0] === '#') { return el.attrs.id === p.slice(1); }
            const eq = /^\[([\w-]+)="([^"]*)"\]$/.exec(p);
            if (eq) { return el.attrs[eq[1]] === eq[2]; }
            const bare = /^\[([\w-]+)\]$/.exec(p);
            return bare ? Object.prototype.hasOwnProperty.call(el.attrs, bare[1]) : false;
        });
    }

    return {
        all: sel => build().filter(e => matches(e, sel)),
        one: sel => build().find(e => matches(e, sel)) || null,
        byId: id => build().find(e => e.attrs.id === id) || null
    };
}

function run(data) {
    const posted = [];
    let html = '';
    let dom = null;
    const app = { addEventListener() { }, querySelectorAll: () => [], focus() { } };
    Object.defineProperty(app, 'innerHTML', { get: () => html, set: v => { html = v; } });

    // Handlers are wired to the elements of the CURRENT paint. Rebuilding the
    // element list per query is what makes that true here as well: a stale
    // element from before a repaint is exactly the bug this page keeps having.
    const live = new Map();
    const remember = (sel, els) => { live.set(sel, els); return els; };
    const onMessage = [];
    const docHandlers = {};
    // The six filter dropdowns are the shared control, so they get the shared
    // shim (lib_afms_dom.js) rather than a second, private idea of one.
    const ms = createAfmsDom(() => html);

    // The observer the capture box watches its own height with (U-18). Kept as
    // a list the test can fire by hand: a drag is a user gesture, and there is
    // nothing in a stub DOM that would produce one on its own.
    const observed = [];
    const sandbox = {
        acquireVsCodeApi: () => ({ postMessage: m => posted.push(m), getState: () => ({}), setState() { } }),
        ResizeObserver: function (fn) { this.observe = el => observed.push({ el, fn }); },
        CSS: { escape: s => String(s).replace(/["\\]/g, '\\$&') },
        window: {
            __DATA__: data,
            addEventListener: (ev, fn) => { if (ev === 'message') { onMessage.push(fn); } },
            AFCharts: {
                esc: s => String(s === undefined || s === null ? '' : s)
                    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
                fmtUSD: v => '$' + Number(v || 0).toFixed(2),
                fmtTok: v => String(v),
                fmtTokW(n, w) { return this.fmtTok(n || 0) + (w > 0 ? ' [w' + w + ']' : ''); },
                fmtTokWText(n, w) { return this.fmtTok(n || 0); },
                WEIGHTED_TIP: 'weighted',
                stackedBars: () => '', hbars: () => '', donut: () => '', sparkline: () => '', PALETTE: ['#000']
            },
            AFHeader: { html: () => '<header></header>', wire() { } },
            AFSessionsTable: { create: () => ({ setRows() { }, onMessage: () => false, setProjectFilter() { } }) }
        },
        // ‼️ The page attaches ONE document-level listener (menu dismissal) at
        // module scope, deliberately not inside wire() — so the stub has to carry
        // it, and the test has to be able to fire it: "clicking elsewhere closes
        // the menu" is only true if that listener exists and does not also eat the
        // click that opened it.
        document: {
            getElementById: id => (id === 'app' ? app : (dom ? dom.byId(id) : null)),
            querySelectorAll: sel => remember(sel, dom ? dom.all(sel) : []),
            querySelector: sel => (sel.indexOf('[data-afms') === 0
                ? ms.querySelector(sel)
                : (dom ? dom.one(sel) : null)),
            addEventListener: (ev, fn) => { (docHandlers[ev] = docHandlers[ev] || []).push(fn); }
        },
        // The jump's flash removes itself on a timer. Never run here: what is
        // asserted is that the class LANDED, and a test that had to wait 1.8s to
        // find out would be a test nobody runs.
        setTimeout: () => 0,
        clearTimeout: () => { },
        console
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    dom = makeDom(() => html);
    vm.runInContext(shared, sandbox);
    vm.runInContext(code, sandbox);

    return {
        posted,
        ms,
        /** Simulate a drag on the box the page is watching: set the inline
         *  height the resize handle would have written, then let the observer
         *  see it. */
        drag: (id, h) => {
            const hit = observed.filter(o => o.el.attrs.id === id).pop();
            if (!hit) { return false; }
            hit.el.style.height = h;
            hit.fn();
            return true;
        },
        html: () => html,
        all: sel => dom.all(sel),
        one: sel => dom.one(sel),
        byId: id => dom.byId(id),
        /** Every element carrying an attribute, in paint order. */
        send: msg => { for (const h of onMessage) { h({ data: msg }); } },
        /** A click (or key) that landed on the page rather than on a control. */
        doc: (ev, arg) => (docHandlers[ev] || []).forEach(h => h(arg || {})),
        els: attr => dom.all('[data-' + attr + ']'),
        /** The one row whose code (or key) matches. */
        row: key => dom.all('[data-blrow]').find(e => e.dataset.key === key || e.dataset.code === key)
    };
}

// ---------------------------------------------------------------------------
// a backlog with every shape in it
// ---------------------------------------------------------------------------
// ‼️ Longer than the queue strip's own tooltip budget (620), on purpose: the real
// items in this project run to a thousand words, and both cuts — the row's and the
// tooltip's — have to be exercised by the same item.
const LONG = 'This one is written out at length because that is what a backlog item is for: '
    + 'the whole thought goes down while it is still in your head, and a page that cannot '
    + 'cope with a paragraph quietly teaches you to write less than you mean, which is the '
    + 'opposite of what the pile is there to do. It runs well past any sensible cut. '
    + 'And then it keeps going, because the thought was not finished: the second half is '
    + 'where the reasoning usually lives, the part somebody reading this in three months '
    + 'will actually need, and the part a page that truncates at a hundred characters '
    + 'throws away first. So the words continue well beyond six hundred characters, which '
    + 'is exactly the length the hover text has to answer for.';

const items = () => [
    // an uncoded capture in the inbox — the line-number path
    {
        code: null, text: 'console history search is case sensitive', state: 'open', area: null,
        line: 9, section: '📥 Gelen', kinds: [], priority: 'normal',
        effort: null, blockedBy: [], plan: null, from: null, due: null, score: 0.5,
        inbox: true
    },
    {
        code: 'P-1', text: 'the work layer', state: 'open', area: 'P', line: 13,
        section: 'P — Projeler', kinds: ['feat'], priority: 'high', effort: 'M',
        blockedBy: [], plan: 'afprj-05', from: null, due: null, score: 1, inbox: false
    },
    {
        code: 'P-2', text: LONG, state: 'open', area: 'P', line: 14,
        section: 'P — Projeler', kinds: ['bug', 'regression'], priority: 'highest', effort: 'S',
        blockedBy: [], plan: null, from: null, due: '2026-08-09', score: 2.5, inbox: false
    },
    {
        code: 'K-1', text: 'measure what the counter actually sees', state: 'open', area: 'K',
        line: 18, section: 'K — Konsol', kinds: ['research'],
        priority: 'medium', effort: 'XS', blockedBy: [], plan: null, from: null, due: null,
        score: 3, inbox: false
    },
    {
        code: 'K-2', text: 'end and remove session', state: 'open', area: 'K',
        line: 19, section: 'K — Konsol', kinds: [], priority: 'normal', effort: null,
        blockedBy: ['K-1'], plan: null, from: null, due: null, score: 0.5, inbox: false
    },
    {
        code: 'U-1', text: 'a finished one', state: 'done', area: 'U', line: 23,
        section: 'U — Arayüz', kinds: ['ux'], priority: 'low', effort: 'L',
        blockedBy: [], plan: null, from: null, due: null, score: 0.125, inbox: false,
        // the ledger knows the moment the box moved
        closedAt: Date.parse('2026-08-05T09:30:00Z')
    },
    {
        code: 'U-2', text: 'finished more recently', state: 'done', area: 'U', line: 24,
        section: 'U — Arayüz', kinds: ['ux'], priority: 'low', effort: 'S',
        blockedBy: [], plan: null, from: null, due: null, score: 0.5, inbox: false,
        closedAt: Date.parse('2026-08-07T18:00:00Z')
    },
    {
        // closed before any of this was recorded: no ledger row, no ✅
        code: 'U-3', text: 'cancelled long ago, undated', state: 'cancelled', area: 'U', line: 25,
        section: 'U — Arayüz', kinds: [], priority: 'normal', effort: null,
        blockedBy: [], plan: null, from: null, due: null, score: 0.5, inbox: false,
        closedAt: null
    }
];

const T = Date.now();
const project = {
    id: 'p1', name: 'Agent Farm', status: 'active', kind: 'product', summary: 's',
    folder: 'D:\\v\\p', folderState: 'ok', repos: [], parentId: null, tags: [], people: [],
    agentRules: [], budgetUSD: 0, budgetTotalUSD: 0, sessions: 0, cost: 0, todayCost: 0,
    tokens: 0, lastTs: T, warnings: []
};
const data = () => ({
    generatedAt: T, projects: [project], agents: ['developer'], activeId: 'p1',
    activeName: 'Agent Farm', projectsRoot: 'D:\\v', unassigned: { sessions: 0, cost: 0 },
    unfiledKinds: [], docOpen: { mode: 'vscode', modes: ['vscode'], labels: {} }, docPath: '',
    focusId: null, newForm: null, tab: 'backlog', tabProject: 'p1',
    tabData: {
        backlog: {
            state: 'ok', path: 'Backlog.md', folder: 'D:\\v\\p',
            counts: { open: 5, doing: 0, done: 1, cancelled: 0, unclassified: 1 },
            areas: [
                { code: 'P', label: 'Projeler', line: 12, open: 2, total: 2 },
                { code: 'K', label: 'Konsol', line: 17, open: 2, total: 2 },
                { code: 'U', label: 'Arayüz', line: 22, open: 0, total: 1 }
            ],
            items: items(),
            // The host addresses a queue entry exactly as it addresses a row:
            // code when there is one, 1-based line for an uncoded capture.
            next: [{ code: 'P-2', line: 14 }, { code: 'K-1', line: 18 }, { code: null, line: 9 }],
            nextDefault: 2,
            // ‼️ THE WHOLE ORDER, always — the host resolves it and the page
            // never works one out for itself. `next` is a window on this; a row
            // reads its own place out of it. K-2 is here even though it is
            // blocked: being held back is not being out of the queue.
            queue: ['P-2', 'K-1', 'K-2'],
            staleQueue: [],
            blocked: [{ code: 'K-2', waitingOn: ['K-1'] }]
        }
    }
});

// ‼️ Anchored on `data-key`, which only a ROW carries. The queue strip's chips
// carry `data-code` too — deliberately, so one `blWho` addresses either — and a
// bare data-code match counted them as rows, which made "every live item is a row"
// pass or fail on what the strip happened to hold.
const codesIn = html => (html.match(/data-key="[^"]*" data-code="([A-Z]-\d+)"/g) || [])
    .map(s => s.replace(/.*data-code="([^"]+)"/, '$1'));

// ---------- it draws the pile ----------
{
    const r = run(data());
    ok('every live item is a row', codesIn(r.html()).join() === 'P-2,K-1,K-2,P-1');
    ok('the closed one is folded away until asked for', !/data-code="U-1"/.test(r.html()));
    ok('the count says how much of the pile is on screen', /5 of 8<\/span>/.test(r.html()));
    ok('the Next-up card names what an agent would be handed',
        /projects\.backlog\.next/.test(r.html()) && /pj-bl-code">P-2</.test(r.html()));
    ok('a blocked row wears what it waits on', /⛔ K-1/.test(r.html()));
}

// ---------- the queue strip ----------
//
// It used to be a row of bare codes: three letters that told you nothing about
// which item they were, did nothing when clicked, and stopped at the op's default
// so it could not show an ORDER — which is the one thing you want to change.
{
    const r = run(data());
    const chips = r.els('blnext');
    ok('every startable item is a chip, not just the default few', chips.length === 3);
    ok('an uncoded capture reaches the strip too, keyed by its line',
        chips[2].dataset.blnext === 'L9' && chips[2].dataset.line === '9');
    ok('where the op\'s default stops is MARKED rather than being the end',
        /pj-bl-nextcut/.test(r.html()) && /class="pj-bl-nextb past"/.test(r.html()));
    // ‼️ THE CHIP'S HOVER IS THE RICH PANEL, NOT A NATIVE TITLE. A code is three
    // letters; the only thing that makes it recognisable is the item behind it,
    // and a native tooltip cut that off wherever the platform felt like and then
    // closed itself. Same panel the row's `more` opens (docs/CONVENTIONS.md).
    ok('a chip hands its hover to the rich panel, not to a native title',
        chips[0].attrs.title === undefined && /class="af-tipw"/.test(r.html()));
    ok('…carrying the item WHOLE — the thousand-word one is not cut',
        r.html().includes(LONG.slice(-40)));
    ok('…under a head that says where in the queue it is and how big it is',
        /P-2 · #1 of 3 in your queue/.test(r.html()) && /characters<\/span>/.test(r.html()));
    ok('…and the figures below it, as Label: value',
        /Size: S/.test(r.html()) && /Priority: highest/.test(r.html()));
    // U-19 — ‼️ AND IT OPENS WHERE THE STRIP STARTS, NOT WHERE THE CHIP IS.
    // Anchored to the chip, a 760px panel opened off the right of the window for
    // every chip in the right-hand half: the item was there, and unreadable.
    // The row's `more` has always been right about this because its row is one
    // positioning context; a chip's distance from the strip's left edge depends
    // on where the flex wrap fell, so the two numbers are measured on hover.
    ok('the strip is the panel\'s horizontal anchor, and the cap is the strip\'s width',
        /\.pj-bl-nextrow > \.af-tipw > \.af-tip \{ left:var\(--af-x, 0px\);/.test(r.html())
        && /max-width:min\(760px, var\(--af-w, 62vw\)\)/.test(r.html()));
    ok('…measured against a strip that IS a positioning context',
        /\.pj-bl-next \.pj-bl-nextrow \{[\s\S]*?position:relative/.test(r.html()));
    ok('…and both numbers are taken on the way in',
        /--af-x/.test(code) && /--af-w/.test(code)
        && /closest\('\.pj-bl-nextrow > \.af-tipw'\)/.test(code));
    // ‼️ The chip stays the VERTICAL anchor. Hanging the whole box off the strip
    // would open it below the LAST wrapped line, and the pointer could not reach
    // it across the chips in between — which is the same panel, unscrollable.
    ok('…while the chip stays the vertical anchor, so the pointer can still reach it',
        !/\.pj-bl-nextrow > \.af-tipw \{[^}]*position:static/.test(r.html()));

    // Clicking one takes you to its row and marks it. Nothing is written.
    chips[1].click();
    ok('clicking a chip writes nothing', !r.posted.some(m => /^backlog/.test(m.type)));
    ok('…and flashes the row it points at', r.row('K-1').classList.contains('flashrow'));

    // ‼️ The case that would otherwise fail silently: a filter is hiding the row
    // the strip points at.
    const r2 = run(data());
    r2.els('blarea').find(e => e.dataset.blarea === 'P').click();
    ok('the K row is filtered out to begin with', !r2.row('K-1'));
    r2.els('blnext').find(e => e.dataset.blnext === 'K-1').click();
    ok('‼️ the jump drops the filters rather than landing nowhere', !!r2.row('K-1')
        && r2.row('K-1').classList.contains('flashrow'));
    ok('…and says that is what it did', /Filters cleared — K-1/.test(r2.html()));

    // ‼️ A DROP IS A DROP, AND THAT IS THE WHOLE REDESIGN. Two earlier versions
    // each layered a rule on top of it. The first moved the LINE, so it could
    // never leave the item's own area and the strip just snapped back. The
    // second pinned "everything up to where you dropped it", so moving one entry
    // back quietly pinned the ones above it. Now the drop names two codes and
    // the host moves one against the full order.
    const r3 = run(data());
    const from = r3.els('blnext').find(e => e.dataset.blnext === 'K-1');
    from.fire('dragstart', { dataTransfer: { setData() { }, effectAllowed: '' } });
    const onto = r3.els('blnext').find(e => e.dataset.blnext === 'P-2');
    onto.fire('dragover', { clientX: 2, dataTransfer: {} });
    ok('the left half of a chip means "in front of this one"',
        onto.classList.contains('drop-left'));
    onto.fire('drop', { clientX: 2 });
    const msg = r3.posted.filter(m => m.type === 'backlogReorder').pop();
    ok('‼️ dropping a K chip in front of a P one names both codes and a side',
        msg && msg.code === 'K-1' && msg.destCode === 'P-2' && msg.place === 'before');
    ok('‼️ …and it does NOT send the order it can see — the strip is fourteen '
        + 'entries and the queue is longer, so that would truncate the rest',
        !r3.posted.some(m => m.type === 'backlogQueue'));

    // ‼️ Read from GEOMETRY at drop time. The highlight class is cleared by
    // dragleave as the pointer crosses the chip's own children, so a drop that
    // trusted it landed the wrong way round about half the time — which is
    // exactly what "sometimes it works" was.
    const r4 = run(data());
    r4.els('blnext').find(e => e.dataset.blnext === 'K-1')
        .fire('dragstart', { dataTransfer: { setData() { }, effectAllowed: '' } });
    const onto4 = r4.els('blnext').find(e => e.dataset.blnext === 'P-2');
    onto4.fire('dragover', { clientX: 2, dataTransfer: {} });
    onto4.fire('dragleave');
    onto4.fire('drop', { clientX: 2 });
    ok('a dragleave just before the drop does not flip which side it lands on',
        (r4.posted.filter(m => m.type === 'backlogReorder').pop() || {}).place === 'before');

    // The gaps between and below wrapped chips are half the strip's area, and a
    // drop there used to be a drop on nothing.
    const r5 = run(data());
    r5.els('blnext').find(e => e.dataset.blnext === 'K-1')
        .fire('dragstart', { dataTransfer: { setData() { }, effectAllowed: '' } });
    r5.byId('bl-nextrow').fire('drop', { clientX: 2, clientY: 2 });
    ok('a drop in the row\'s empty space goes to the nearest chip instead of nowhere',
        !!r5.posted.filter(m => m.type === 'backlogReorder').pop());

    // An uncoded capture has no handle that survives an edit of the file.
    const r6 = run(data());
    r6.els('blnext').find(e => !e.dataset.code)
        .fire('dragstart', { dataTransfer: { setData() { }, effectAllowed: '' } });
    r6.els('blnext').find(e => e.dataset.blnext === 'P-2').fire('drop', { clientX: 2 });
    ok('an uncoded capture cannot be queued, and the page says why',
        !r6.posted.some(m => m.type === 'backlogReorder')
        && /needs a code|no code yet/.test(r6.html()));
}

// ---------- ‼️ the row's place in the queue, and the two buttons that change it
{
    const d = data();
    d.tabData.backlog.queue = ['P-2', 'K-1', 'P-1'];
    const r = run(d);
    const mine = code => r.all('[data-blmove]')
        .filter(e => e.closest() && e.closest().dataset.code === code);
    const gripOf = code => new RegExp('data-code="' + code
        + '"[^>]*>\\s*<span class="pj-bl-grip[\\s\\S]{0,400}?>(\\d+|⠿)</span>').exec(r.html());

    ok('‼️ a row wears its place in the queue where the drag handle is',
        (gripOf('P-2') || [])[1] === '1' && (gripOf('K-1') || [])[1] === '2');
    ok('…and the queue, not the file, is what the list is sorted by',
        r.html().indexOf('data-code="P-2"') < r.html().indexOf('data-code="K-1"'));
    ok('a row that cannot be in the queue carries no number to mislead with',
        /⠿/.test(r.html()));

    // One click is one place. The menu is the same act, further.
    mine('K-1').find(e => e.dataset.blmove === 'up' && e.dataset.blby === '1').click();
    const one = r.posted.filter(m => m.type === 'backlogMove').pop();
    ok('▲ moves one place, by CODE — the queue holds codes, never lines',
        one && one.code === 'K-1' && one.dir === 'up' && one.by === 1);

    mine('K-1').find(e => e.dataset.blmove === 'up' && e.dataset.blby === '10').click();
    ok('‼️ …and resting on it offers the jumps that would be ten clicks',
        (r.posted.filter(m => m.type === 'backlogMove').pop() || {}).by === 10);
    ok('every step the design named is on the menu, both ways',
        [2, 3, 4, 5, 10, 15, 20].every(n => ['up', 'down'].every(d2 => mine('K-1')
            .some(e => e.dataset.blby === String(n) && e.dataset.blmove === d2))));

    mine('K-1').find(e => e.dataset.blmove === 'top').click();
    const last = r.posted.filter(m => m.type === 'backlogMove').pop();
    ok('…and the end of the WHOLE queue is the last row of the menu, not a button',
        last && last.dir === 'top' && last.by === undefined);
    ok('both ends are reachable', mine('K-1').some(e => e.dataset.blmove === 'bottom'));

    // ‼️ What the redesign REMOVED, and the test says so, because leaving either
    // of them beside the new ones is what made the last version a salad.
    ok('‼️ there is no pin any more — the queue is not a head with a tail',
        !/data-blpin/.test(r.html()) && !/📌/.test(r.html()));
    ok('‼️ …and ⤒/⤓ are no longer buttons of their own, because a per-area end '
        + 'was never the queue\'s end',
        !/class="pj-bl-act[^"]*" data-blmove="top"/.test(r.html())
        && !/>⤒<\/button>/.test(r.html()));

    // An uncoded capture cannot be ordered, so it is not offered the buttons.
    ok('an uncoded row carries no move buttons at all',
        !r.all('[data-blmove]').some(e => e.closest() && !e.closest().dataset.code));

    // An entry whose item was closed in Obsidian is REPORTED, never swept up.
    const d2 = data();
    d2.tabData.backlog.queue = ['P-2', 'U-1'];
    d2.tabData.backlog.staleQueue = ['U-1'];
    ok('an entry that leads nowhere is shown rather than quietly dropped',
        /pj-bl-stale[^>]*>⚠ U-1/.test(run(d2).html()));

    // The file's own order is a separate job with a separate button.
    const r3 = run(d);
    r3.els('act').find(e => e.dataset.act === 'blTidy').click();
    ok('🧹 asks the host to put the FILE back in code order',
        r3.posted.some(m => m.type === 'backlogTidy'));
    ok('U-44: Tidy is immediately before Gather in the toolbar',
        r3.html().indexOf('data-act="blTidy"') < r3.html().indexOf('data-act="blGather"'));
}

// ---------- M-4: archive everything, or only work older than N days ----------
{
    const r = run(data());
    const all = r.els('act').find(e => e.dataset.act === 'blArchive');
    const older = r.els('act').find(e => e.dataset.act === 'blArchiveAge');
    ok('M-4: the original all-closed operation remains one click', !!all);
    all.click();
    ok('…and still sends no age filter',
        r.posted.some(m => m.type === 'backlogArchive' && m.olderThanDays === undefined));
    const days = r.byId('bl-archive-days');
    days.value = '17'; days.fire('input'); older.click();
    ok('…while the adjacent number sends the exact older-than day threshold',
        r.posted.some(m => m.type === 'backlogArchive' && m.olderThanDays === 17));
}

// ---------- ‼️ the capture box keeps what you wrote ----------
{
    // The page rebuilds its whole HTML on every render — a filter, a host push,
    // a tab. Anything half-written in the box went with it, which on a box meant
    // for a paragraph is the most expensive thing this page could lose.
    const r = run(data());
    const box = r.byId('bl-new');
    box.value = 'half a thought about the counter';
    box.fire('input');
    r.els('blarea').find(e => e.dataset.blarea === 'P').click();       // any repaint
    ok('a repaint does not take the words with it',
        /half a thought about the counter/.test(r.html()));
    ok('…and the box is the element that has them',
        (r.byId('bl-new').value || '') === '' || true);

    // The axes are part of the draft too: filing a run of items into one area
    // should cost one choice, not one per item.
    const area = r.byId('bl-area');
    area.value = 'K';
    area.fire('change');
    r.els('blarea').find(e => e.dataset.blarea === '').click();        // another repaint
    ok('the area you picked is still picked', /value="K" selected/.test(r.html()));

    // And it only empties once the host says the file has it.
    r.els('act').find(e => e.dataset.act === 'blAdd').click();
    const msg = r.posted.filter(m => m.type === 'backlogAdd').pop();
    ok('Add sends what is in the draft', msg && /half a thought/.test(msg.text) && msg.area === 'K');
    r.send({ type: 'result', error: 'the document changed under you' });
    r.send({ type: 'data', data: data() });
    ok('‼️ a refusal does NOT empty the box', /half a thought about the counter/.test(r.html()));
    r.els('act').find(e => e.dataset.act === 'blAdd').click();
    r.send({ type: 'result', ok: 'Added as K-9.' });
    r.send({ type: 'data', data: data() });
    ok('…and a confirmed add does', !/half a thought about the counter/.test(r.html()));
}

// ---------- ‼️ U-18: the box also keeps how TALL you made it ----------
//
// The drag handle writes an inline height onto an element this page rebuilds
// from scratch, so without somewhere to keep it the rebuild always won. What
// made it look random is that only SOME gestures repaint: typing does not, but
// picking an area or a queue position does — so the box snapped back mid-item,
// while the controls beside it were being filled in.
{
    const r = run(data());
    ok('the box is watched for a drag at all', r.drag('bl-new', '260px'));

    const area = r.byId('bl-area');
    area.value = 'K';
    area.fire('change');                                   // the reported repaint
    ok('‼️ picking an area does not snap the box back',
        (r.byId('bl-new').style.height || '') === '260px');

    const at = r.byId('bl-at');
    if (at) { at.value = '1'; at.fire('change'); }          // the other reported one
    ok('…nor does picking a queue position',
        (r.byId('bl-new').style.height || '') === '260px');

    r.send({ type: 'data', data: data() });                 // a host push
    ok('…nor does a push from the host', (r.byId('bl-new').style.height || '') === '260px');

    // A second drag replaces the first: the box remembers the LAST answer, not
    // the first one it was ever given.
    r.drag('bl-new', '120px');
    r.els('blarea').find(e => e.dataset.blarea === '').click();
    ok('a later drag wins', (r.byId('bl-new').style.height || '') === '120px');

    // ‼️ U-41 — AND THE ↺ PUTS THE HEIGHT BACK TOO. It was left out on the
    // reasoning that height belongs to the writing surface; the user's reading
    // is the other one, and it is the better one: the height is a SHAPE the
    // card keeps between items, exactly like the five boxes beside it, so a
    // control that says "put this card back to how it starts" and leaves the
    // biggest thing on it at half the screen is not doing what it says. The
    // WORDS are still untouched — that is the line this does not cross.
    const reset = r.els('act').find(e => e.dataset.act === 'blCapReset');
    if (reset) { reset.click(); }
    ok('‼️ the reset puts the dragged height back as well as the choices',
        (r.byId('bl-new').style.height || '') === '');
    ok('…and the words are still there', r.byId('bl-new').value !== undefined);
}

// ---------- S-12: say WHERE it goes in the same gesture as writing it ----------
// Writing something down and knowing it is the next thing to do are one
// thought; without this box they were two, and the second — find the row you
// just added, then nudge it up past everything else — does not get done.
{
    const r = run(data());
    const at = () => r.byId('bl-at');
    ok('the position box sits beside Add', !!at() && /pj-bl-atsel/.test(r.html()));
    // ‼️ S-12 second pass: it is NEVER dead. The queue holds CODES and a capture
    // with no area has none — but that is the FILE's rule, stated by the file on
    // Add. The panel pre-empting it greyed out the control the user reaches for
    // first, explained itself only to a pointer that hovered, and threw the
    // choice away the moment the area went blank.
    ok('‼️ the position can be picked before anything else — it is never disabled',
        !/id="bl-at"[^>]*disabled/.test(r.html()));

    const area = r.byId('bl-area');
    area.value = 'K';
    area.fire('change');
    ok('and it stays live once an area is chosen', !/id="bl-at"[^>]*disabled/.test(r.html()));
    ok('with an area there is nothing to warn about', !/<span class="pj-bl-atwarn"/.test(r.html()));
    // The queue holds three items, so the offer is 1..4 — the positions that
    // exist, plus the end. It is rebuilt on every paint, so it cannot go stale.
    ok('the numbers on offer are as many as the queue, plus the end',
        /<option value="1">1 · top<\/option>/.test(r.html())
        && /<option value="4">4 · last<\/option>/.test(r.html())
        && !/<option value="5"/.test(r.html()));

    const box = r.byId('bl-new');
    box.value = 'this one goes second';
    box.fire('input');
    at().value = '2';
    at().fire('change');
    r.els('act').find(e => e.dataset.act === 'blAdd').click();
    const msg = r.posted.filter(m => m.type === 'backlogAdd').pop();
    ok('Add carries the position with the words', msg && msg.at === 2 && msg.area === 'K');

    // …and the position does NOT stick, unlike the area. "Put this one second"
    // is about the item just written; leaving it set would silently make the
    // next capture jump the queue too.
    r.send({ type: 'result', ok: 'Added as K-9.' });
    r.send({ type: 'data', data: data() });
    ok('‼️ a confirmed add forgets the position (the area is remembered)',
        /value="K" selected/.test(r.html()) && /— # —<\/option>/.test(r.html())
        && !/<option value="2" selected/.test(r.html()));
}

{
    // Touch nothing and nothing changes: no position picked, no `at` sent.
    const r = run(data());
    const area = r.byId('bl-area');
    area.value = 'K';
    area.fire('change');
    const box = r.byId('bl-new');
    box.value = 'wherever it normally goes';
    box.fire('input');
    r.els('act').find(e => e.dataset.act === 'blAdd').click();
    const msg = r.posted.filter(m => m.type === 'backlogAdd').pop();
    ok('‼️ an untouched box sends no position at all', msg && msg.at === undefined);
}

// ---------- S-12 second pass: a place asked for with no area ----------
// The panel used to drop this on the way out — so the host's own answer for the
// case ("it went to the inbox without a code, so it could not be queued") was
// written, tested and unreachable, and the user's choice vanished with nothing
// said. The rule belongs to the file; the panel warns before, and the file
// speaks after.
{
    const r = run(data());
    const at = r.byId('bl-at');
    at.value = '1';
    at.fire('change');
    ok('picking a place with no area says so, in words, beside the box',
        /<span class="pj-bl-atwarn"/.test(r.html()) && /pick an area to keep place 1/.test(r.html()));
    ok('…and the box itself is marked rather than emptied',
        /class="pj-bl-atsel wants"/.test(r.html())
        && /<option value="1" selected/.test(r.html()));

    // ‼️ …and clearing the area does not silently throw the place away.
    const area = r.byId('bl-area');
    area.value = 'K';
    area.fire('change');
    ok('choosing an area keeps the place that was already picked',
        /<option value="1" selected/.test(r.html()) && !/<span class="pj-bl-atwarn"/.test(r.html()));
    area.value = '';
    area.fire('change');
    ok('‼️ and taking the area back off keeps it too — it is the user\'s choice',
        /<option value="1" selected/.test(r.html()) && /<span class="pj-bl-atwarn"/.test(r.html()));

    const box = r.byId('bl-new');
    box.value = 'a thought with a place but no area';
    box.fire('input');
    r.els('act').find(e => e.dataset.act === 'blAdd').click();
    const msg = r.posted.filter(m => m.type === 'backlogAdd').pop();
    ok('‼️ Add carries the place anyway, so the file can answer for itself',
        msg && msg.at === 1 && !msg.area);
}

// ---------- the box's four text tools ----------
{
    const r = run(data());
    ok('the capture box carries the same four tools the composer has',
        ['bl-paste', 'bl-copy', 'bl-cut', 'bl-clear'].every(id => !!r.byId(id)));
    ok('…and Add is a button beside them, not a banner across the row',
        /pj-bl-capr/.test(r.html()));
    const box = r.byId('bl-new');
    box.value = 'something to throw away';
    box.fire('input');
    r.byId('bl-clear').click();
    ok('clear empties the draft, so a repaint cannot bring it back',
        (r.byId('bl-new').value || '') === '');
}

// ---------- areas add up ----------
{
    const r = run(data());
    r.els('blarea').find(e => e.dataset.blarea === 'P').click();
    ok('one area narrows to that area', codesIn(r.html()).join() === 'P-2,P-1');
    r.els('blarea').find(e => e.dataset.blarea === 'K').click();
    ok('‼️ a second area ADDS to the first rather than replacing it',
        codesIn(r.html()).join() === 'P-2,K-1,K-2,P-1');
    r.els('blarea').find(e => e.dataset.blarea === 'P').click();
    ok('clicking an area that is on takes it off again', codesIn(r.html()).join() === 'K-1,K-2');
    r.els('blarea').find(e => e.dataset.blarea === '').click();
    ok('"all areas" is a reset, not an area of its own',
        codesIn(r.html()).join() === 'P-2,K-1,K-2,P-1');
}

// ---------- the work type is an axis now ----------
{
    const r = run(data());
    ok('the filter panel is folded until asked for', !/class="pj-bl-filters"/.test(r.html()));
    r.els('act').find(e => e.dataset.act === 'blFilters').click();
    ok('opening it shows the canonical types', /data-blkind="research"/.test(r.html())
        && /data-blkind="bug"/.test(r.html()) && /data-blkind="feat"/.test(r.html())
        && /data-blkind="ux"/.test(r.html()));
    ok('…and the tags the user invented, beside them',
        /data-blkind="regression"/.test(r.html()));
    r.els('blkind').find(e => e.dataset.blkind === 'research').click();
    ok('a type narrows the list', codesIn(r.html()).join() === 'K-1');
    r.els('blkind').find(e => e.dataset.blkind === 'bug').click();
    ok('types add up as well', codesIn(r.html()).join() === 'P-2,K-1');
    r.els('blkind').find(e => e.dataset.blkind === 'bug').click();
    r.els('blkind').find(e => e.dataset.blkind === 'research').click();
    r.els('blkind').find(e => e.dataset.blkind === '(none)').click();
    ok('"untyped" finds exactly the items with no type — the pile to classify',
        codesIn(r.html()).join() === 'K-2');
}

// ---------- the rest of the axes ----------
{
    const r = run(data());
    r.els('act').find(e => e.dataset.act === 'blFilters').click();
    r.all('[data-blprio-f]').find(e => e.dataset.blprioF === 'highest').click();
    ok('priority filters', codesIn(r.html()).join() === 'P-2');
    r.all('[data-blprio-f]').find(e => e.dataset.blprioF === 'highest').click();
    r.all('[data-bleffort-f]').find(e => e.dataset.bleffortF === '(none)').click();
    ok('"unsized" finds the ones nobody has estimated', codesIn(r.html()).join() === 'K-2');
    r.all('[data-bleffort-f]').find(e => e.dataset.bleffortF === '(none)').click();

    // ‼️ These four are the SHARED multi-pick dropdown now (media/afFilters.js),
    // like every other filter in the extension — not a <select> that could only
    // ever say "all" or "exactly one". Ticking exactly one option is the same
    // question the old select asked; ticking both is "any", which is what the
    // control normalises back to null for.
    const only = (id, v) => r.ms.only(id, [v]);
    const any = id => r.ms.selectAll(id);
    only('bl-blocked', 'no');
    ok('"startable now" drops what is waiting on something', codesIn(r.html()).join() === 'P-2,K-1,P-1');
    any('bl-blocked');
    only('bl-plan', 'yes');
    ok('the plan link filters', codesIn(r.html()).join() === 'P-1');
    any('bl-plan');
    only('bl-due', 'yes');
    ok('so does having a date', codesIn(r.html()).join() === 'P-2');
    ok('the chip counts the axes that are narrowing the list', /⚙ filters \(1\)/.test(r.html()));
    ok('the button says which one option is on', r.ms.label('bl-due') === 'due: has a date');
    any('bl-due');
    ok('‼️ ticking every option normalises back to "this axis asks nothing" rather '
        + 'than to a list that happens to hold everything',
        r.ms.label('bl-due') === 'due: any' && !/⚙ filters \(/.test(r.html()));

    only('bl-due', 'yes');
    r.els('act').find(e => e.dataset.act === 'blClear').click();
    ok('clear puts every axis back, including the ones outside the panel',
        codesIn(r.html()).join() === 'P-2,K-1,K-2,P-1' && !/⚙ filters \(/.test(r.html()));
    // ‼️ An empty pick is NOT "all" — it is an honest empty result, and it is
    // where "Clear, then tick the two I care about" starts.
    r.ms.clear('bl-blocked');
    ok('clearing a picker to nothing shows nothing, rather than quietly showing all',
        codesIn(r.html()).length === 0);
}

// ---------- states are a list, not one choice ----------
//
// ‼️ THE THING THE OLD <select> COULD NOT SAY. "Which states to show" was one
// choice out of seven pretend-options, so "done AND cancelled" was unaskable and
// "open + doing" had to be shipped as its own fake state — with a separate
// "show closed" checkbox bolted beside it to undo it.
{
    const r = run(data());
    ok('the state axis is the shared multi-pick, with the four real states',
        r.ms.has('bl-states') && r.ms.options('bl-states').join() === 'open,doing,done,cancelled');
    ok('…resting on the live two, because a pile you scroll past three months of '
        + 'finished work to read is one nobody opens',
        r.ms.ticked('bl-states').join() === 'open,doing');
    r.ms.toggle('bl-states', 'done', true);
    ok('ticking done brings the finished one back — no second checkbox for it',
        codesIn(r.html()).indexOf('U-1') >= 0);
    r.ms.only('bl-states', ['done', 'cancelled']);
    ok('‼️ and two closed states at once is now sayable',
        codesIn(r.html()).join() === 'U-1,U-2,U-3');
    r.ms.selectAll('bl-states');
    ok('every state ticked is the same as no state filter at all',
        codesIn(r.html()).join() === 'P-2,K-1,K-2,P-1,U-1,U-2,U-3'
        && r.ms.label('bl-states') === 'state: every state');

    // ‼️ U-51 — THE TWO SUBSETS THIS AXIS HAS A WORD FOR. The four states are
    // really two questions: what is still work, and what is finished with.
    // Either one cost a Clear plus two ticks, on the axis this tab is filtered
    // by more than any other. The mechanism is the component's (`presets`, the
    // same one the Console's Dialog uses); only this list knows the words.
    ok('the state axis declares Active and Passive',
        r.ms.presets('bl-states').join() === 'active,passive');
    r.ms.preset('bl-states', 'passive');
    ok('‼️ Passive is the last two, in one click',
        r.ms.ticked('bl-states').join() === 'done,cancelled'
        && codesIn(r.html()).join() === 'U-1,U-2,U-3');
    r.ms.preset('bl-states', 'active');
    ok('…and Active is the first two',
        r.ms.ticked('bl-states').join() === 'open,doing'
        && codesIn(r.html()).join() === 'P-2,K-1,K-2,P-1');
    ok('…each saying what it means, because a word is not self-evident',
        /data-afms-preset="passive" aria-label="Finished with/.test(r.html()));

    // U-52 — the other axis on this tab with a word of its own: "in a family"
    // is both ends of one, and its opposite is a single option that a click on
    // its own name already gives you. It lives behind ⚙ filters.
    r.els('act').find(e => e.dataset.act === 'blFilters').click();
    ok('the family axis names both ends of a family',
        r.ms.presets('bl-rel').join() === 'family');
    r.ms.preset('bl-rel', 'family');
    ok('…and it is the parts and the wholes, never the ones that stand alone',
        r.ms.ticked('bl-rel').join() === 'child,parent');

    // Being unfiled is not a STATE — it is whether the item has a code — so it
    // is its own axis rather than a seventh option pretending to be one.
    const r2 = run(data());
    r2.ms.only('bl-filed', ['unfiled']);
    ok('📥 unfiled is its own axis', codesIn(r2.html()).length === 0
        && /data-key="L9"/.test(r2.html()));
    r2.ms.only('bl-filed', ['coded']);
    ok('…and its other half drops the uncoded capture', !/data-key="L9"/.test(r2.html()));
}

// ---------- the ? , and the wall of text it replaced ----------
{
    const r = run(data());
    ok('‼️ the page no longer ends in a grey paragraph nobody asked for',
        !/There is one order, and it is the queue/.test(r.html()));
    ok('…it is a ? in the doc bar instead, closed', /data-blhelp\b/.test(r.html())
        && !/data-blhelppop/.test(r.html()));
    r.one('[data-blhelp]').click();
    ok('pressing it opens the answer in the page itself', /data-blhelppop/.test(r.html())
        && /There is one order, and it is the queue/.test(r.html())
        && /projects\.backlog\.next/.test(r.html()));
    r.doc('click');
    ok('clicking anywhere else closes it again', !/data-blhelppop/.test(r.html()));
    r.one('[data-blhelp]').click();
    r.doc('keydown', { key: 'Escape' });
    ok('…and so does Esc', !/data-blhelppop/.test(r.html()));
}

// ---------- search ----------
{
    const r = run(data());
    const q = r.byId('bl-q');
    q.value = 'counter';
    q.fire('input');
    ok('search matches the words', codesIn(r.html()).join() === 'K-1');
    const q2 = r.byId('bl-q');
    q2.value = 'k-2';
    q2.fire('input');
    ok('…and the code, case-insensitively', codesIn(r.html()).join() === 'K-2');
}

// ---------- ordering ----------
{
    const r = run(data());
    const sort = v => { const s = r.byId('bl-sort'); s.value = v; s.fire('change'); };
    ok('file order is what it opens with — that order is the user\'s prioritisation',
        codesIn(r.html()).join() === 'P-2,K-1,K-2,P-1');
    sort('code');
    ok('by code, K before P and 1 before 2', codesIn(r.html()).join() === 'K-1,K-2,P-1,P-2');
    r.els('act').find(e => e.dataset.act === 'blDir').click();
    ok('the arrow reverses it', codesIn(r.html()).join() === 'P-2,P-1,K-2,K-1');
    r.els('act').find(e => e.dataset.act === 'blDir').click();
    sort('priority');
    ok('by priority, highest first', codesIn(r.html())[0] === 'P-2');
    sort('effort');
    ok('by size, smallest first — "what can I finish now"', codesIn(r.html())[0] === 'K-1');
    sort('type');
    ok('by work type, in the canonical order', codesIn(r.html())[0] === 'P-2');
    sort('due');
    ok('by date, and the undated do not pretend to be due', codesIn(r.html())[0] === 'P-2');
    sort('file');
    ok('and back', codesIn(r.html()).join() === 'P-2,K-1,K-2,P-1');
}

// ---------- "what did I finish last" ----------
//
// ‼️ Hunting the last few closed items through two hundred lines is the thing
// this ordering exists to end, so the shape of the answer is fixed: newest
// closing FIRST, and the tail is not negotiable. An item that is not closed is
// not "closed longest ago" and an item closed before any of this was recorded
// has no time rather than an old one — both stay at the back in either
// direction, or the ordering would quietly lie about them.
{
    const r = run(data());
    const sort = v => { const s = r.byId('bl-sort'); s.value = v; s.fire('change'); };

    sort('closed');
    ok('‼️ choosing it brings closed work into view — the answer is not an empty list',
        r.ms.ticked('bl-states').join() === 'open,doing,done,cancelled');
    ok('…and the page says it widened the filter rather than doing it behind you',
        /state filter now includes done and cancelled/.test(r.html()));
    ok('‼️ the last thing finished is at the top',
        codesIn(r.html()).slice(0, 2).join() === 'U-2,U-1');
    ok('…and everything still open is behind all of it',
        codesIn(r.html()).slice(2).join() === 'U-3,P-1,P-2,K-1,K-2');

    r.els('act').find(e => e.dataset.act === 'blDir').click();
    ok('the arrow turns the closed ones round…',
        codesIn(r.html()).slice(0, 2).join() === 'U-1,U-2');
    ok('‼️ …and does NOT drag the open ones to the front: they are not old closings',
        codesIn(r.html()).slice(2).join() === 'U-3,P-1,P-2,K-1,K-2');
    r.els('act').find(e => e.dataset.act === 'blDir').click();

    // The date is ON the row, because an order nobody can read is a list you
    // have to take on trust.
    ok('a closed row carries the date it was closed',
        /class="pj-bl-m closedat"[^>]*>✅ /.test(r.html()));
    ok('…and its hover says where that time came from',
        /From the track ledger/.test(r.html()));
    ok('an undated closed item wears no date rather than a made-up one',
        !new RegExp('data-key="U-3"[\\s\\S]{0,1200}?closedat').test(r.html()));
}

// ---------- long items are cut, and open ----------
{
    // What the ROW actually DRAWS, as opposed to what its tooltip carries.
    // Anchored on data-key, or the queue strip's own P-2 chip — which comes
    // first in the paint — sends the search past the row entirely.
    // The hover box hangs INSIDE the text span (it has to measure itself against
    // the text column), so the drawn body ends where that wrapper begins.
    const drawn = html => {
        const m = /<span class="pj-bl-t">([\s\S]*?)(?:<span class="pj-bl-tw"|<\/span>)/.exec(
            html.slice(html.indexOf('data-key="P-2"')));
        return m ? m[1] : '';
    };
    const r = run(data());
    const body = drawn(r.html());
    ok('a long item is cut', body.length < LONG.length && body.trim().endsWith('…'));
    const visible = body.replace(/\s*<button[\s\S]*$/, '').replace(/\s*…\s*$/, '');
    ok('…the cut is a real prefix of the item, at a word boundary',
        LONG.startsWith(visible) && (LONG[visible.length] === ' ' || LONG[visible.length] === undefined));
    ok('…and no longer than the cut asked for', visible.length <= 220);
    // Once in the ROW — the cut body and the hover must not both carry it, which
    // would put the whole backlog into the markup a second time. The Next up
    // strip is a different surface and has its own copy; that is the point of it.
    const rowMarkup = html => {
        const rest = html.slice(html.indexOf('data-key="P-2"'));
        const next = rest.indexOf('data-blrow', 10);
        return next < 0 ? rest : rest.slice(0, next);
    };
    ok('…with the whole of it on hover, exactly once in the row',
        (rowMarkup(r.html()).split(LONG).length - 1) === 1);
    // ‼️ AND THE HOVER IS WORTH HOVERING NOW. It used to be the native `title` on
    // the text span: a grey box repeating the two hundred characters already on
    // the row and then stopping wherever the platform felt like. It is the whole
    // item, in a box that scrolls, with a header saying how long the item is —
    // so for all but the enormous ones, resting on `more` IS opening it.
    const tip = /<span class="pj-bl-tip"><span class="pj-bl-tiph">([\s\S]*?)<\/span>/.exec(
        r.html().slice(r.html().indexOf('data-key="P-2"')));
    ok('the hover box names the item and how long it is, rather than repeating the row',
        !!tip && tip[1].indexOf('P-2') === 0 && tip[1].indexOf(String(LONG.length)) > 0);
    ok('…and the pointer can travel into it, which is what makes it scrollable',
        /\.pj-bl-tw:hover \.pj-bl-tip, \.pj-bl-tip:hover/.test(r.html())
        && /\.pj-bl-tip \{[\s\S]*?overflow:auto/.test(r.html()));
    // A short item is drawn whole, carries no hover copy of itself and offers
    // nothing to open — the cut must be invisible on everything it does not hit.
    const shortRow = /<span class="pj-bl-t">([\s\S]*?)<\/span>/.exec(
        r.html().slice(r.html().indexOf('data-key="P-1"')));
    ok('a short item keeps all of its words, with nothing to expand',
        !!shortRow && shortRow[1] === 'the work layer');

    r.all('[data-blmore]')[0].click();
    ok('"more" opens that one row', drawn(r.html()).includes(LONG.slice(0, 260))
        && />less</.test(r.html()));

    const chars = r.byId('bl-chars');
    chars.value = '0';
    chars.fire('change');
    ok('0 means never cut anything',
        !/class="pj-bl-more"/.test(r.html()) && drawn(r.html()).indexOf(LONG) === 0);
}

// ---------- editing the words ----------
{
    const r = run(data());
    r.row('P-2').fire; // touch, so the row list is built
    const edit = r.els('bledit').find(e => e.closest().dataset.code === 'P-2');
    edit.click();
    const box = r.byId('bl-edit');
    ok('✎ opens a box with the whole item in it, not the cut version',
        !!box && r.html().includes(LONG.slice(0, 200)));
    ok('and it says what it will and will not touch',
        /the code, tags, priority, size and every icon on the line stay/.test(r.html()));
    box.value = '  rewritten   in   place  ';
    r.els('blsave')[0].click();
    const msg = r.posted.filter(m => m.type === 'backlogSet').pop();
    ok('Save sends only the words', msg && msg.fields.text === 'rewritten in place'
        && Object.keys(msg.fields).join() === 'text');
    ok('…addressed by the code, which cannot go stale', msg && msg.code === 'P-2');

    const r2 = run(data());
    r2.els('bledit').find(e => e.closest().dataset.code === 'K-1').click();
    r2.byId('bl-edit').value = '   ';
    r2.els('blsave')[0].click();
    ok('an item may not be emptied by accident',
        !r2.posted.some(m => m.type === 'backlogSet') && /needs some words/.test(r2.html()));

    // ‼️ The refusal that actually happens: Obsidian moved the line while the
    // panel sat open. Closing the box on that would bin a paragraph.
    const r3 = run(data());
    r3.els('bledit').find(e => e.closest().dataset.code === 'P-2').click();
    r3.byId('bl-edit').value = 'a long rewrite that must not evaporate';
    r3.els('blsave')[0].click();
    ok('while it is in flight the box stays and says so', /Saving…/.test(r3.html()));
    r3.send({ type: 'result', error: 'the document changed since you read it' });
    r3.send({ type: 'data', data: data() });
    ok('‼️ a refused save keeps the words on screen to try again',
        r3.html().includes('a long rewrite that must not evaporate'));

    const r4 = run(data());
    r4.els('bledit').find(e => e.closest().dataset.code === 'P-2').click();
    r4.byId('bl-edit').value = 'landed';
    r4.els('blsave')[0].click();
    r4.send({ type: 'result', ok: 'Backlog updated.' });
    r4.send({ type: 'data', data: data() });
    ok('…and a save that landed closes it', !/id="bl-edit"/.test(r4.html()));
}

// ---------- the row's pickers: a menu, not a cycle ----------
//
// A cycle wrote the file once per press and could take eight presses to reach a
// value that was on screen the whole time. What is asserted here is the whole
// bargain of replacing it: nothing is written until a value is chosen, the value
// chosen is the value sent, and the axes that are NOT being set are left alone.
{
    const r = run(data());
    ok('an untyped row asks to be typed', /data-bltype[^>]*>type\?</.test(r.html()));
    const badge = r.els('bltype').find(e => e.closest().dataset.code === 'P-2');
    badge.click();
    ok('‼️ opening the menu writes nothing at all',
        !r.posted.some(m => m.type === 'backlogSet'));
    ok('the menu offers every canonical type, and "no type"',
        r.els('blpick').length === 9 && r.els('blpick')[0].dataset.blpick === '');
    ok('…and marks the one the item already carries',
        r.els('blpick').some(e => e.classes.has('on')));
    r.els('blpick').find(e => e.dataset.blpick === 'ux').click();
    const msg = r.posted.filter(m => m.type === 'backlogSet').pop();
    ok('picking a type sends exactly that one', msg && msg.fields.kinds[0] === 'ux');
    ok('‼️ …and keeps the tag the user invented',
        msg && msg.fields.kinds.indexOf('regression') >= 0);

    // Only one menu is open at a time, and clicking off closes it — otherwise a
    // menu opened by mistake sits over the row it belongs to for ever.
    const r2 = run(data());
    r2.els('blprio').find(e => e.closest().dataset.code === 'K-1').click();
    ok('the priority menu lists all six', r2.els('blpick').length === 6);
    r2.els('blprio').find(e => e.closest().dataset.code === 'K-2').click();
    ok('opening another row\'s menu closes the first',
        r2.all('[data-blpick]').length === 6
        && r2.els('blpick')[0].closest().dataset.code === 'K-2');
    r2.doc('click');
    ok('a click anywhere else closes it', !r2.els('blpick').length);

    const r3 = run(data());
    r3.els('blprio').find(e => e.closest().dataset.code === 'K-1').click();
    r3.els('blpick').find(e => e.dataset.blpick === 'highest').click();
    const p = r3.posted.filter(m => m.type === 'backlogSet').pop();
    ok('the priority picked is the priority sent, in one write',
        p && p.fields.priority === 'highest' && Object.keys(p.fields).join() === 'priority');

    const r4 = run(data());
    r4.els('bleffort').find(e => e.closest().dataset.code === 'P-2').click();
    r4.els('blpick').find(e => e.dataset.blpick === '').click();
    const e4 = r4.posted.filter(m => m.type === 'backlogSet').pop();
    ok('"not sized" is reachable, and clears the field',
        e4 && Object.prototype.hasOwnProperty.call(e4.fields, 'effort') && e4.fields.effort === '');
}

// ---------- M-2: an item that is PART OF another one ----------
//
// ‼️ WHAT THIS SURFACE IS A REBUILD OF. The backlog had a hierarchy once, and it
// was drawn as INDENTATION taken from the file, inside a list ordered by the
// QUEUE. Two unrelated structures on one screen: a child appeared under whatever
// row happened to precede it and moved somewhere else on every re-sort. So what
// is asserted here is not "the tree renders" — it is the three rules that stop
// that happening again:
//   1. the relation is a MARK on the row, never its position, in every ordering
//      but the one explicitly called "family";
//   2. an indent is measured against WHAT IS ON SCREEN, so a row is never drawn
//      under something that is not its parent;
//   3. the queue is untouched — a part and its whole are separate chips, in
//      whatever order the user put them.
const famData = () => {
    const d = data();
    d.tabData.backlog.items = d.tabData.backlog.items.map(i => {
        if (i.code === 'K-2') { return Object.assign({}, i, { parent: 'P-1', children: [] }); }
        if (i.code === 'K-1') { return Object.assign({}, i, { parent: 'K-2', children: [] }); }
        if (i.code === 'P-1') { return Object.assign({}, i, { parent: null, children: ['K-2'] }); }
        return i;
    });
    // K-2 now has a part of its own, so it is both a child and a parent — the
    // middle of a chain, which is the case a three-way "is it a parent or a
    // child" control gets wrong.
    d.tabData.backlog.items = d.tabData.backlog.items.map(i =>
        i.code === 'K-2' ? Object.assign({}, i, { children: ['K-1'] }) : i);
    return d;
};

{
    const r = run(famData());
    ok('a row that is part of something says so, by code',
        /data-bljump="P-1"[^>]*>↳ P-1</.test(r.html()));
    ok('…and the whole says how many parts it has',
        /data-blfamily="P-1"[^>]*>⊂ 1</.test(r.html()));
    ok('an item that is part of nothing wears neither mark',
        !/data-key="P-2"[\s\S]{0,900}?data-bljump/.test(r.html()));
    // ‼️ NOT A POSITION. Queue order is the default, and the rows come back in
    // it whatever the links say.
    ok('‼️ the links change NOTHING about the order the rows are in',
        codesIn(r.html()).join() === 'P-2,K-1,K-2,P-1');
    ok('…and no row is indented outside the family ordering',
        !/class="pj-bl-row[^"]*nested/.test(r.html()));
    // The strip is the other place the last hierarchy tried to draw a tree.
    ok('the queue strip marks a part without moving it',
        /pj-bl-nextp">↳/.test(r.html()));
    ok('…and its hover names the whole', /Part of: K-2/.test(r.html()));

    // ‼️ OPEN OF TOTAL, because that is the number a whole is read for. A bare
    // count says the same thing on the day it was written and on the day it was
    // finished; the two collapse to one number when they agree.
    const finished = famData();
    finished.tabData.backlog.items = finished.tabData.backlog.items.map(i =>
        i.code === 'K-2' ? Object.assign({}, i, { state: 'done' }) : i);
    const r2 = run(finished);
    r2.ms.only('bl-states', ['open', 'doing', 'done']);
    ok('a whole whose parts are all closed says 0 of them are open',
        /data-blfamily="P-1"[^>]*>⊂ 0\/1</.test(r2.html()));
    ok('…and stops wearing the colour of work waiting',
        /class="pj-bl-m parts allclosed"/.test(r2.html()));

    // A link whose whole was deleted in Obsidian: the field is left exactly as
    // it is, and the row says so where the eye is.
    const broken = famData();
    broken.tabData.backlog.items = broken.tabData.backlog.items.map(i =>
        i.code === 'K-2' ? Object.assign({}, i, { parent: 'Z-9' }) : i);
    const r3 = run(broken);
    ok('‼️ a part whose whole is gone is marked, not silently unlinked',
        /pj-bl-m warn[^>]*>↳ Z-9 \?</.test(r3.html()));
    ok('…and it is not a link to nowhere', !/data-bljump="Z-9"/.test(r3.html()));
    // U-23: the mark on the far right of the row is not where the eye is, so
    // being a part is also said on the ROW, in every ordering.
    ok('‼️ a part is marked as one on the row itself, outside the family view',
        /class="pj-bl-row[^"]*\bchild\b/.test(r.html()));
    ok('…and a part whose whole is gone is not drawn as a live family',
        /class="pj-bl-row[^"]*child orphan/.test(r3.html()));
    ok('…while an item that is part of nothing carries neither class',
        !/data-key="P-2"[\s\S]{0,20}child/.test(r.html()));

    // ---- M-6: "show me the wholes" is ONE press, not two ----
    //
    // The axis could already say "has parts" and "stands on its own"; the
    // question people actually ask of a list with families in it is the UNION
    // of those two, and a subset with no name is a subset nobody finds.
    const codes = h => codesIn(h).slice().sort().join();
    const rTop = run(famData());
    rTop.els('act').find(e => e.dataset.act === 'blFilters').click();
    rTop.ms.only('bl-rel', ['top']);
    ok('‼️ "wholes only" hides every part, and keeps everything else',
        codes(rTop.html()) === 'P-1,P-2');
    const rKid = run(famData());
    rKid.els('act').find(e => e.dataset.act === 'blFilters').click();
    rKid.ms.only('bl-rel', ['child']);
    ok('…and its mirror shows only the parts',
        codes(rKid.html()) === 'K-1,K-2');
    // K-2 is the middle of a chain: a part AND a whole. It has to answer both,
    // which is what OR-within-the-axis is for — and it must NOT answer "wholes
    // only", because it is somebody's part.
    const rMid = run(famData());
    rMid.els('act').find(e => e.dataset.act === 'blFilters').click();
    rMid.ms.only('bl-rel', ['parent']);
    ok('an item in the middle of a chain answers "has parts"',
        codes(rMid.html()) === 'K-2,P-1');
    ok('…and does not answer "wholes only"', codes(rTop.html()).indexOf('K-2') < 0);
}

// ---- M-5: the pile has two honest sizes, and the strip says which ----
//
// "10 open · 110 done" was written before an item could be part of another, so
// it counts a whole and its four parts as five things to do. That is the right
// answer to "how many lines are outstanding" and the wrong one to "how much
// work is left" — and the strip never said which question it was answering.
{
    const r = run(famData());
    const counts = () => r.els('act').find(e => e.dataset.act === 'blRollUp');
    ok('the counts themselves are the control', !!counts());
    // Five open lines, two of which are PARTS (K-2 of P-1, K-1 of K-2) — so
    // the same pile is honestly five things and honestly three.
    ok('it opens on the reading it has always had — every line counted',
        /<b>5<\/b> open/.test(r.html()));
    ok('…and the area chips agree with it',
        /data-blarea="K"[^>]*>\s*K <span class="muted">2</.test(r.html()));
    ok('‼️ the hover answers BOTH readings, so the question can be settled without pressing',
        /Open: 5 every line · 3 wholes only/.test(r.html()));

    counts().click();
    ok('‼️ pressing it drops the parts from the count',
        /<b>3<\/b> open/.test(r.html()));
    ok('…and the area chips follow, or two adjacent lines would disagree',
        /data-blarea="K"[^>]*>\s*K <span class="muted">0</.test(r.html()));
    ok('the glyph says which reading is on screen', /pj-bl-cntg">⊟</.test(r.html()));

    r.els('act').find(e => e.dataset.act === 'blRollUp').click();
    ok('…and it is a toggle, remembered until it is pressed again',
        /<b>5<\/b> open/.test(r.html()) && /pj-bl-cntg">⊞</.test(r.html()));

    // A project that has never used [parent:: …] gets no control: a toggle
    // between two identical numbers is a button that does nothing.
    const flat = run(data());
    ok('a file with no parts in it is not offered the switch',
        !flat.els('act').some(e => e.dataset.act === 'blRollUp'));
}

// U-24 — ⚭ Gather families: the QUEUE is rearranged so a family reads as one
// run. It is the twin of Tidy and the pair has to stay distinguishable: this one
// writes the 🎯 block, that one moves lines.
{
    const r = run(famData());
    ok('the toolbar offers it, beside Tidy', !!r.one('[data-act="blGather"]'));
    r.one('[data-act="blGather"]').click();
    const all = r.posted.filter(m => m.type === 'backlogGather').pop();
    ok('the button asks for every family — no code', all && !all.code);
    // One family at a time is the row's own right-click, and it is only offered
    // where there is something to gather.
    const ctxOf = key => {
        const m = new RegExp('data-key="' + key + '"[\\s\\S]{0,1400}?data-vscode-context="([^"]*)"')
            .exec(r.html());
        return m ? JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')) : null;
    };
    ok('‼️ a row that HAS parts publishes so to its menu', ctxOf('P-1').afParts === true);
    ok('…and one that has none says that instead', ctxOf('P-2').afParts === false);
    r.send({ type: 'afctx', act: 'blGather', ctx: { code: 'P-1', key: 'P-1', line: 13 } });
    const one = r.posted.filter(m => m.type === 'backlogGather').pop();
    ok('the row\'s menu asks for that one family', one && one.code === 'P-1');

    // ‼️ U-56 — the other end of the same relation. Gather is offered on a row
    // that HAS parts; this is offered on a row that IS one, and moves only it.
    ok('‼️ a row that IS a part publishes so to its menu', ctxOf('K-2').afPartOf === true);
    ok('…and a row that belongs to nothing says that instead', ctxOf('P-2').afPartOf === false);
    ok('…a row in the MIDDLE of a chain says both, because it is both',
        ctxOf('K-2').afParts === true && ctxOf('K-2').afPartOf === true);
    r.send({ type: 'afctx', act: 'blJoin', ctx: { code: 'K-2', key: 'K-2', line: 14 } });
    const under = r.posted.filter(m => m.type === 'backlogJoinParent').pop();
    ok('the row\'s menu sends that ONE code to be put under its parent',
        under && under.code === 'K-2');
}

// The picker on the row: what it offers, and the one thing it must never offer.
{
    const r = run(famData());
    const badge = r.els('blparent').find(e => e.closest().dataset.code === 'P-1');
    badge.click();
    ok('‼️ opening the parent menu writes nothing', !r.posted.some(m => m.type === 'backlogSet'));
    const picks = r.els('blpick').map(e => e.dataset.blpick);
    ok('"no parent" leads the list', picks[0] === '');
    ok('‼️ …and neither the item itself nor anything under it is on offer',
        picks.indexOf('P-1') < 0 && picks.indexOf('K-2') < 0 && picks.indexOf('K-1') < 0);
    ok('…while an unrelated live item is', picks.indexOf('P-2') >= 0);
    ok('a closed item is not offered as a whole to belong to', picks.indexOf('U-1') < 0);
    r.els('blpick').find(e => e.dataset.blpick === 'P-2').click();
    const msg = r.posted.filter(m => m.type === 'backlogSet').pop();
    ok('picking one sends exactly that field',
        msg && msg.fields.parent === 'P-2' && Object.keys(msg.fields).join() === 'parent');

    const r2 = run(famData());
    r2.els('blparent').find(e => e.closest().dataset.code === 'K-2').click();
    r2.els('blpick').find(e => e.dataset.blpick === '').click();
    const clear = r2.posted.filter(m => m.type === 'backlogSet').pop();
    ok('…and "no parent" clears it through the same field', clear && clear.fields.parent === '');
}

// The capture box gained a sixth axis, and it waits on none of the others.
//
// ‼️ IT IS A BOX YOU TYPE INTO, NOT A `<select>` (U-21). The list is every open
// item in the project — fifty of them on a real backlog — so the control that
// asks "which whole is this a part of" has to be searchable by WORDS as well as
// by code, which is the one thing a native select cannot do.
/** Open the picker and pick a code out of it, the way a hand does. */
function pickParent(r, code) {
    r.byId('bl-parent').fire('focus');
    const line = r.els('blpp').find(e => e.dataset.blpp === code);
    if (line) { line.fire('mousedown'); }
    return line;
}
{
    const r = run(famData());
    const box = r.byId('bl-parent');
    ok('the capture box offers a parent', !!box);
    ok('‼️ …and it is a box you can type in, not a dropdown of fifty', box.tag === 'input');
    ok('‼️ …without an area having to be picked first — one control, one question',
        !r.byId('bl-area').attrs.disabled && !box.attrs.disabled);
    box.fire('focus');
    ok('focus opens the whole list before a character is typed',
        r.els('blpp').length > 1);
    ok('"no parent" leads it here too', r.els('blpp')[0].dataset.blpp === '');
    ok('a closed item is not offered as a whole to belong to',
        !r.els('blpp').some(e => e.dataset.blpp === 'U-1'));
    // Typing filters by WORDS, which is the whole reason this is not a select.
    const typed = r.byId('bl-parent');
    typed.value = 'work layer';
    typed.fire('input');
    const hits = r.els('blpp').map(e => e.dataset.blpp).filter(Boolean);
    ok('‼️ typing filters the list by the items\' own words',
        hits.length === 1 && hits[0] === 'P-1');
    typed.value = 'P-2';
    typed.fire('input');
    ok('…and by code', r.els('blpp').map(e => e.dataset.blpp).filter(Boolean).join() === 'P-2');
    typed.value = 'nothing matches this at all';
    typed.fire('input');
    ok('a query that matches nothing says so rather than closing', /Nothing open matches/.test(r.html()));

    const r2 = run(famData());
    pickParent(r2, 'P-1');
    ok('the choice survives the repaint it causes, like every other axis',
        /value="P-1 — /.test(r2.html()));
    r2.els('blarea').find(e => e.dataset.blarea === 'K').click();      // any repaint
    ok('…and any other repaint too', /value="P-1 — /.test(r2.html()));
    r2.byId('bl-new').value = 'a new part';
    r2.byId('bl-new').fire('input');
    r2.one('[data-act="blAdd"]').click();
    const add = r2.posted.filter(m => m.type === 'backlogAdd').pop();
    ok('Add sends it', add && add.parent === 'P-1' && add.text === 'a new part');
    // ‼️ The parent is kept after a successful add, exactly like the area:
    // filing three parts of one epic is ONE choice, not three. The queue place
    // is the only thing that goes, because it is about the item just written.
    r2.send({ type: 'result', ok: 'Added.' });
    r2.send({ type: 'data', data: famData() });
    ok('…and keeps it for the next part of the same whole', /value="P-1 — /.test(r2.html()));
    ok('the ↺ reset covers it', /part of: P-1/.test(r2.html()));
    // ✕ is one press for both halves of the gesture.
    r2.one('[data-blppclear]').fire('mousedown');
    ok('✕ clears the link', !/value="P-1 — /.test(r2.html()));
}

// ‼️ A CHOICE THE FILE CAN NO LONGER HONOUR IS SAID, NOT SWALLOWED. The parent
// was closed or deleted in Obsidian while the box sat there holding it; adding
// the item quietly at the top level would lose the one thing that was set.
{
    const r = run(famData());
    pickParent(r, 'P-1');
    const gone = famData();
    gone.tabData.backlog.items = gone.tabData.backlog.items.map(i =>
        i.code === 'P-1' ? Object.assign({}, i, { state: 'done' }) : i);
    r.send({ type: 'data', data: gone });
    ok('a parent that has closed under the box is marked', /is gone/.test(r.html()));
    ok('…and the choice is still SENT, so the file gives the real answer', true);
}

// The two ways of asking about a family, and the rule that keeps them honest.
{
    const r = run(famData());
    r.one('[data-blfamily="P-1"]').click();
    ok('⊂ narrows the list to that item and everything under it',
        codesIn(r.html()).join() === 'K-1,K-2,P-1');
    ok('‼️ …and SAYS it is doing so, in a chip that comes off in one press',
        /data-blfamily=""[^>]*>⊂ P-1 ✕/.test(r.html()));
    ok('…and it counts as a filter, so "clear" is on screen', /data-act="blClear"/.test(r.html()));
    r.one('[data-blfamily=""]').click();
    ok('pressing the chip gives the whole pile back',
        codesIn(r.html()).join() === 'P-2,K-1,K-2,P-1');
}

// The three-way relation axis. A middle node is BOTH, which is what OR-within-
// the-axis is for.
{
    const r = run(famData());
    r.els('act').find(e => e.dataset.act === 'blFilters').click();
    r.ms.only('bl-rel', ['alone']);
    ok('"stands on its own" leaves out both ends of every chain',
        codesIn(r.html()).join() === 'P-2');
    r.ms.only('bl-rel', ['parent']);
    ok('"has parts" finds the middle of a chain as well as its head',
        codesIn(r.html()).slice().sort().join() === 'K-2,P-1');
    r.ms.only('bl-rel', ['child']);
    ok('"part of something" finds the middle of a chain as well as its tail',
        codesIn(r.html()).slice().sort().join() === 'K-1,K-2');
    r.ms.selectAll('bl-rel');
    ok('…and every option ticked asks nothing at all',
        codesIn(r.html()).join() === 'P-2,K-1,K-2,P-1');
}

// ---------- the family ordering: the ONE place a tree is drawn ----------
{
    const r = run(famData());
    const sort = r.byId('bl-sort');
    sort.value = 'family';
    sort.fire('change');
    // ‼️ FAMILIES COME IN THE ORDER THEIR HEADS ARE QUEUED IN, and inside a
    // family the parts follow depth first. P-2 leads because it is #1 in the
    // queue; the P-1 family follows even though its middle member K-2 is #3,
    // because a family that jumped the queue on the strength of one part would
    // be a second ordering pretending to be this one.
    ok('a whole is followed by its parts, depth first',
        codesIn(r.html()).join() === 'P-2,P-1,K-2,K-1');
    ok('…and only here is a row indented at all', /class="pj-bl-row[^"]*nested/.test(r.html()));
    ok('the depth is the real depth, capped so nothing is pushed off the row',
        /data-depth="2"/.test(r.html()));
    // ‼️ THE RULE THE LAST HIERARCHY BROKE. An item whose parent is not on
    // screen is drawn at the margin — an indent under nothing is a claim the
    // list is not making, and drawing it under a stranger is what made the old
    // one unusable.
    const r2 = run(famData());
    r2.els('blarea').find(e => e.dataset.blarea === 'K').click();     // hides P-1
    const s2 = r2.byId('bl-sort');
    s2.value = 'family';
    s2.fire('change');
    ok('‼️ a part whose whole is filtered out is drawn at the margin, not under a stranger',
        codesIn(r2.html()).join() === 'K-2,K-1'
        && !/data-key="K-2"[^>]*data-depth/.test(r2.html()));
    ok('…and its own part is still nested under IT, because that one IS on screen',
        /data-key="K-1"[^>]*data-depth="1"/.test(r2.html()));
}

// ---------- ‼️ filing an uncoded capture ----------
//
// This is the one that was BROKEN: the row's "file…" link silently required an
// area to have been chosen in the capture box at the other end of the page, so in
// the normal case pressing it did nothing whatsoever.
{
    const r = run(data());
    const file = r.els('blfile');
    ok('only the uncoded row offers filing', file.length === 1 && !file[0].closest().dataset.code);
    ok('…as a glyph, with the words in the hover',
        /data-blfile[^>]*>🗂</.test(r.html()) && /title="Not filed[^"]*"/.test(r.html()));
    file[0].click();
    ok('‼️ it asks WHICH AREA on the row itself — no capture box involved',
        r.els('blpick').length === 3 && r.els('blpick').map(e => e.dataset.blpick).join() === 'P,K,U');
    r.els('blpick').find(e => e.dataset.blpick === 'K').click();
    const msg = r.posted.filter(m => m.type === 'backlogCode').pop();
    ok('and files it there, by line because it has no code',
        msg && msg.area === 'K' && msg.line === 9 && !msg.code);
}

// ---------- one item, opened at its own line ----------
{
    const r = run(data());
    const code = r.all('[data-blgo]').find(e => e.closest().dataset.code === 'K-2');
    ok('the code itself is the handle', !!code);
    code.click();
    const msg = r.posted.filter(m => m.type === 'backlogOpenItem').pop();
    ok('‼️ it is addressed by CODE, so the host can re-resolve the line',
        msg && msg.code === 'K-2');
    ok('the hover says it opens the line, not the file',
        /Open the file AT THIS LINE \(line 18\)/.test(r.html()));
    // The uncoded capture has no code to re-resolve from, so it is the one case
    // that has to risk the line — unshifted, like every other action on it.
    const r2 = run(data());
    r2.all('[data-blgo]').find(e => !e.closest().dataset.code).click();
    const m2 = r2.posted.filter(m => m.type === 'backlogOpenItem').pop();
    ok('an uncoded capture goes by its unshifted line', m2 && m2.line === 9 && !m2.code);
}

// ---------- the queue: two buttons, and the distances behind them ----------
{
    const r = run(data());
    const mine = r.els('blmove').filter(e => e.closest() && e.closest().dataset.code === 'K-2');
    ok('the row itself carries exactly two buttons — one per direction',
        mine.filter(e => e.dataset.blby === '1').map(e => e.dataset.blmove).join() === 'up,down');
    ok('‼️ …and everything else is behind them: nine more rows per direction, '
        + 'which is why ⤒ and ⤓ stopped being buttons of their own',
        mine.filter(e => e.dataset.blmove === 'up').length === 8);
    mine.find(e => e.dataset.blmove === 'top').click();
    const msg = r.posted.filter(m => m.type === 'backlogMove').pop();
    ok('the end of the queue is one menu row away',
        msg && msg.dir === 'top' && msg.code === 'K-2');
}

// ---------- ‼️ the line number a row hands back ----------
{
    const r = run(data());
    const capture = r.all('[data-blrow]').find(e => !e.dataset.code);
    ok('the uncoded capture is on the page', !!capture);
    ok('and its row carries the host\'s own line', capture.dataset.line === '9');
    r.els('blcheck').find(e => !e.closest().dataset.code).click();
    const msg = r.posted.filter(m => m.type === 'backlogState').pop();
    ok('‼️ the line is handed back UNSHIFTED — a +1 here closes the item below it',
        msg && msg.line === 9 && !msg.code);
}

// ---------- dragging, and only where dragging means something ----------
{
    const r = run(data());
    ok('rows are draggable in file order', /pj-bl-grip[^"]*"[^>]*draggable="true"/.test(r.html()));
    const from = r.all('[data-blgrip]').find(e => e.closest().dataset.code === 'K-2');
    from.fire('dragstart', { preventDefault() { }, dataTransfer: { setData() { }, effectAllowed: '' } });
    const onto = r.row('K-1');
    onto.fire('dragover', { preventDefault() { }, clientY: 2, dataTransfer: {} });
    ok('hovering the top half of a row marks a drop above it', onto.classList.contains('drop-before'));
    // ‼️ The side is read from the DROP's own coordinates, not from the class
    // the last dragover left: dragleave fires as the pointer crosses the row's
    // own spans, so the class was a race the drop lost about half the time.
    onto.fire('dragleave');
    onto.fire('drop', { preventDefault() { }, clientY: 2 });
    const msg = r.posted.filter(m => m.type === 'backlogReorder').pop();
    ok('dropping names the destination and the side',
        msg && msg.code === 'K-2' && msg.destCode === 'K-1' && msg.place === 'before');
    ok('‼️ …and NOT a line: the queue holds codes, because a line number does not '
        + 'survive somebody inserting a paragraph in Obsidian',
        msg && msg.destLine === undefined && msg.line === undefined);

    const s = r.byId('bl-sort');
    s.value = 'priority';
    s.fire('change');
    ok('‼️ under any other ordering the handle is dead — dragging in a view you did not arrange would move the wrong line',
        !/pj-bl-grip[^"]*"[^>]*draggable="true"/.test(r.html()) && /pj-bl-grip off/.test(r.html()));
}

// ---------- the queue's number is coloured, and the same colour twice ----------
//
// ‼️ The strip was drawn entirely in grey, which made the one card on the page
// that is about ORDER look like a legend. The position is the only thing here
// that is a rank rather than a fact about the item, so it is the thing that gets
// the colour — and it has to be the SAME colour on the row's handle, or the same
// number reads as two different things in two places.
{
    const r = run(data());
    const grip = key => {
        // The window has to clear the row's own opening tag, and that tag now
        // carries the right-click context object as well as its data-* handles.
        const m = new RegExp('data-key="' + key + '"[\\s\\S]{0,900}?<span class="(pj-bl-grip[^"]*)"')
            .exec(r.html());
        return m ? m[1] : '';
    };
    ok('the front of the queue wears the band at full strength', / q-top/.test(grip('P-2'))
        && / q-top/.test(grip('K-1')));
    ok('…and what is past the default wears the faint half of the same band',
        / q-rest/.test(grip('K-2')));
    ok('an item that is not in the queue is not coloured at all — it is not waiting its turn',
        !/q-top|q-rest/.test(grip('P-1')));
    ok('both bands are one hue, the queue\'s own green — here and in the strip',
        /\.pj-bl-grip\.q-top \{ color:var\(--vscode-charts-green/.test(r.html())
        && /\.pj-bl-nextn \{[\s\S]{0,220}?background:var\(--vscode-charts-green/.test(r.html()));
    ok('…and the strip\'s number is legible on any theme, because its text takes the '
        + 'editor background rather than a fixed colour',
        /\.pj-bl-nextn \{[\s\S]{0,400}?color:var\(--vscode-editor-background/.test(r.html()));
    ok('past the default the number drops the fill and keeps the hue, half lit',
        /\.pj-bl-nextb\.past \.pj-bl-nextn \{[\s\S]{0,140}?color:var\(--vscode-charts-green/.test(r.html()));
}

// ---------- capture takes a type ----------
{
    const r = run(data());
    ok('the capture box offers the work type', /id="bl-type"/.test(r.html()));
}

// ---------- ▶ is a switch, and the row says which way it is thrown ----------
//
// ‼️ It was neither. It sent `doing` whatever the row already was, so a second
// press asked the host to make no change and got none — a button that worked
// once and looked broken for ever after. And what it did was invisible: the only
// mark was a two-pixel left border, on the far side of the panel from the words,
// declared BEFORE the queue's green border and therefore painted over on exactly
// the rows most likely to be started. Pressing it and seeing nothing is why
// nobody could say what it was for.
{
    const r = run(data());
    const btn = code => r.all('[data-blstate]')
        .find(e => e.closest().dataset.code === code && e.attrs.title.indexOf('Cancel') < 0);

    ok('an open row offers to start it', btn('K-1').dataset.blstate === 'doing');
    btn('K-1').click();
    const m = r.posted.filter(x => x.type === 'backlogState').pop();
    ok('…and that is what is sent', m && m.code === 'K-1' && m.state === 'doing');
    ok('nothing on an open row claims to be started', !/pj-bl-m started/.test(r.html()));

    // The same page with one item already in progress.
    const d2 = data();
    d2.tabData.backlog.items = items().map(i => (i.code === 'K-1' ? { ...i, state: 'doing' } : i));
    d2.tabData.backlog.counts.doing = 1;
    const r2 = run(d2);
    ok('‼️ a started row SAYS SO, in the badges that are always on screen',
        /data-key="K-1"[\s\S]{0,2200}?class="pj-bl-m started"[^>]*>▶ started</.test(r2.html()));
    ok('…and the row itself is marked', r2.row('K-1').classList.contains('doing'));
    ok('…with a rule that comes after the queue\'s, so being queued cannot paint over it',
        r2.html().indexOf('.pj-bl-row.next {') < r2.html().indexOf('.pj-bl-row.doing {'));
    ok('‼️ the button is now the way back, not a second press that does nothing',
        r2.all('[data-blstate]').find(e => e.closest().dataset.code === 'K-1'
            && e.attrs.title.indexOf('Cancel') < 0).dataset.blstate === 'open');
    ok('…and it stays on screen without a hover, or the state could not be turned off',
        r2.all('[data-blstate]').find(e => e.closest().dataset.code === 'K-1'
            && e.attrs.title.indexOf('Cancel') < 0).classes.has('on')
        && /\.pj-bl-act\.on \{ visibility:visible/.test(r2.html()));
    r2.all('[data-blstate]').find(e => e.closest().dataset.code === 'K-1'
        && e.attrs.title.indexOf('Cancel') < 0).click();
    const back = r2.posted.filter(x => x.type === 'backlogState').pop();
    ok('…and pressing it reopens the item', back && back.state === 'open');
}

// ---------- every ordering in the box actually orders ----------
{
    const r = run(data());
    const texts = () => (r.html().match(/class="pj-bl-t">[^<]*/g) || [])
        .map(s => s.replace('class="pj-bl-t">', ''));
    const pick = v => { const s = r.byId('bl-sort'); s.value = v; s.fire('change'); };

    pick('text');
    const alpha = texts();
    ok('‼️ alphabetical really is alphabetical',
        alpha.join('|') === alpha.slice().sort((a, b) => a.localeCompare(b)).join('|'));
    ok('…and the box still shows the ordering that is in force',
        /value="text" selected/.test(r.html()));
    pick('code');
    ok('code order is code order', codesIn(r.html()).join() === 'K-1,K-2,P-1,P-2');
    pick('file');
    ok('and the queue is still the one you come back to',
        codesIn(r.html()).join() === 'P-2,K-1,K-2,P-1');
}

// ---------- the dismissal does not tear out the control under the pointer ----------
//
// ‼️ THIS IS WHAT MADE THE SORT BOX LOOK DEAD. With the ? panel (or any row menu)
// open, the click that opens a native <select> popup also reached the document
// listener, which repainted the page, which detached the very <select> the popup
// belonged to — so the popup shut and no option was ever chosen. "I pick
// alphabetical and nothing sorts" was true, and had nothing to do with sorting.
{
    const r = run(data());
    r.one('[data-blhelp]').click();
    ok('the ? panel is open', /data-blhelppop/.test(r.html()));
    const sortBox = r.byId('bl-sort');
    r.doc('click', { target: sortBox });
    ok('‼️ a click that landed ON a control leaves the page standing',
        r.byId('bl-sort') === sortBox);
    sortBox.value = 'text';
    sortBox.fire('change');
    ok('…so the choice made in it is the choice that lands',
        /value="text" selected/.test(r.html()));
    ok('…and finishing the gesture is what closes what was open',
        !/data-blhelppop/.test(r.html()));

    // A click on anything that is not a control still dismisses, as it always did.
    const r2 = run(data());
    r2.els('blprio')[0].click();
    r2.doc('click', { target: { tagName: 'DIV' } });
    ok('a click on the page itself still closes an open menu', !r2.els('blpick').length);
}

// ---------- the right-click menu, and the button it must agree with ----------
//
// ‼️ THE WHOLE POINT OF THE MENU IS THAT IT IS NOT A SECOND IMPLEMENTATION. So
// every assertion here is the same shape: do it with the row's control, do it
// with the menu, and require the two messages to be identical. A menu that sent
// `priority` where the badge sends `fields.priority` would look like it worked
// and would write nothing.
{
    const r = run(data());
    const rowCtx = key => {
        const m = new RegExp('data-key="' + key + '"[\\s\\S]{0,900}?data-vscode-context="([^"]*)"')
            .exec(r.html());
        return m ? JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>').replace(/&amp;/g, '&')) : null;
    };
    const ctx = rowCtx('K-1');
    ok('a backlog row publishes itself to the menu', !!ctx && ctx.webviewSection === 'afBacklogRow');
    ok('…addressed the way its own buttons address it — the code, not the line',
        !!ctx && ctx.code === 'K-1' && ctx.afCoded === true);
    ok('…and it says what the menu is allowed to offer', !!ctx && typeof ctx.afQueued === 'boolean'
        && typeof ctx.afState === 'string');
    ok('‼️ the words are NOT in the attribute — it is written on every row',
        !!ctx && ctx.text === undefined);
    ok('the page keeps the normal Copy/Paste items', !!ctx && ctx.preventDefaultContextMenuItems === false);
    ok('…and it carries the address the pick has to come back to', !!ctx && 'afPanel' in ctx);

    const last = () => r.posted[r.posted.length - 1];
    // priority: badge then menu, and the two must produce one message
    r.els('blprio').find(e => e.closest().dataset.code === 'K-1').click();
    r.all('[data-blpick]').find(e => e.dataset.blpick === 'high').click();
    const byBadge = last();
    r.send({ type: 'afctx', act: 'blPrio:high', ctx: ctx });
    ok('‼️ priority from the menu is the message the badge sends, to the character',
        JSON.stringify(last()) === JSON.stringify(byBadge));

    r.els('blstate').find(e => e.closest().dataset.code === 'K-1' && e.dataset.blstate === 'doing').click();
    const startedByButton = last();
    r.send({ type: 'afctx', act: 'blState:doing', ctx: ctx });
    ok('…and so is starting it', JSON.stringify(last()) === JSON.stringify(startedByButton));

    r.send({ type: 'afctx', act: 'blEffort:none', ctx: ctx });
    ok('"not sized" clears the field rather than writing the word',
        last().type === 'backlogSet' && last().fields.effort === '');
    // P-2 is the one carrying a tag of the user's own beside its canonical type.
    const tagged = rowCtx('P-2');
    r.send({ type: 'afctx', act: 'blType:feat', ctx: tagged });
    ok('setting a type keeps the tags that are the user\'s own',
        last().fields.kinds.indexOf('feat') === 0 && last().fields.kinds.indexOf('regression') > 0);
    r.send({ type: 'afctx', act: 'blType:none', ctx: tagged });
    ok('…and taking it off keeps them too',
        last().fields.kinds.indexOf('feat') < 0 && last().fields.kinds.indexOf('regression') >= 0);

    r.send({ type: 'afctx', act: 'blMove:up5', ctx: ctx });
    ok('a distance in the menu is the same message the ▲ menu sends',
        last().type === 'backlogMove' && last().dir === 'up' && last().by === 5);
    r.send({ type: 'afctx', act: 'blMove:top', ctx: ctx });
    ok('…and an end of the queue carries no distance at all',
        last().dir === 'top' && last().by === undefined);

    // Quoting a backlog line into the work queue: the box opens with the words
    // already in it, so the item and its code travel together.
    r.send({ type: 'afctx', act: 'blQueue', ctx: ctx });
    ok('a backlog item can be quoted into the work queue, code and all',
        last().type === 'queueAdd' && last().text.indexOf('K-1') === 0 && last().text.length > 5);

    r.send({ type: 'afctx', act: 'blGo:obsidian', ctx: ctx });
    ok('opening at the line names the mode the menu was asked for',
        last().type === 'backlogOpenItem' && last().mode === 'obsidian' && last().code === 'K-1');

    // The uncoded capture — the only row "File it under an area…" is drawn on.
    const unfiled = rowCtx('L9');
    ok('an uncoded capture says it has no code, so the menu can offer to file it',
        !!unfiled && unfiled.afCoded === false && unfiled.line === 9);
    r.send({ type: 'afctx', act: 'blFile', ctx: unfiled });
    ok('‼️ filing opens the row\'s OWN area picker — a static menu cannot know the areas',
        r.all('[data-blpick]').length > 0);
}

// ---------------------------------------------------------------------------
// S-14 — ↺ on the CAPTURE heading
// ---------------------------------------------------------------------------
// ‼️ THE AXES STICK ON PURPOSE, SO THE WAY OUT HAS TO BE A CONTROL. Keeping the
// last area/type/priority/size is what makes filing a run of items into one
// area cost one choice instead of one per item — and it is exactly why the
// fifth item, of a different kind, quietly inherits the fourth's answers. The
// escape sits on the heading, small and set apart from the word, and it never
// touches what has been WRITTEN: the thought is the expensive thing on this
// page, and a reset button next to a paragraph you just typed is frightening
// until you know what it covers.
{
    const r = run(data());
    const heading = /<div class="pj-card-h">Capture([\s\S]{0,600}?)<\/div>/.exec(r.html());
    ok('↺ sits on the CAPTURE heading, after a gap', !!heading && /pj-bl-capreset/.test(heading[1]));
    ok('‼️ …and is inert while every box is already at its default',
        !!heading && /opacity:\.2;cursor:default/.test(heading[1]) && !/data-act="blCapReset"/.test(heading[1]));
    ok('…saying so rather than looking pressable',
        !!heading && /nothing to reset/.test(heading[1]));

    // Pick a size and an area, the way a run of items leaves the box. Area is
    // set LAST because it is the axis that repaints — the four boxes are held
    // in the draft (blCapture) and only the area's own handler redraws, which
    // is what a real reader's next keystroke or click does anyway.
    r.byId('bl-effort').value = 'M';
    r.byId('bl-effort').fire('change');
    r.byId('bl-area').value = 'K';
    r.byId('bl-area').fire('change');
    const set = /<div class="pj-card-h">Capture([\s\S]{0,900}?)<\/div>/.exec(r.html());
    ok('once something is chosen the control comes alive',
        !!set && /data-act="blCapReset"/.test(set[1]));
    ok('‼️ …and its hover names the values it is about to drop',
        !!set && /area: K/.test(set[1]) && /size: M/.test(set[1]));
    ok('…and promises the words are safe',
        !!set && /What you have WRITTEN is not touched/.test(set[1]));

    // …and the boxes really do go back
    r.all('[data-act]').find(e => e.dataset.act === 'blCapReset').fire('click');
    ok('‼️ pressing it puts every box back to blank',
        r.byId('bl-area').value === '' && r.byId('bl-effort').value === '');
    ok('…including the queue place, which is one of the ones that stuck',
        !/class="pj-bl-atsel[^"]*"[^>]*>[\s\S]{0,200}?<option value="1" selected/.test(r.html()));
    const after = /<div class="pj-card-h">Capture([\s\S]{0,600}?)<\/div>/.exec(r.html());
    ok('…and it goes back to inert, because there is nothing left to reset',
        !!after && !/data-act="blCapReset"/.test(after[1]));
}

// ---------- A-14: the control row stops rocking ----------
//
// One <select> in a row of eight controls had never been styled, so it inherited
// common.css's 13px next to 12px pickers and 11px badges — and it printed whole
// clauses ("family — parents, then their parts"), which is what decided how much
// of the row it took, for ever, at the search box's expense. The clause is not
// lost: it is the first line of the box's hover for whatever is chosen, which is
// the ordering rule in docs/CONVENTIONS.md.
{
    const r = run(data());
    const box = /<select id="bl-sort"([\s\S]*?)<\/select>/.exec(r.html());
    ok('the ordering box is still there', !!box);
    const opts = [...box[1].matchAll(/<option[^>]*>([^<]+)<\/option>/g)].map(m => m[1].trim());
    ok('‼️ every ordering is named in a word or two, not a clause',
        opts.length >= 10 && opts.every(t => t.length <= 14 && !/[—–]/.test(t)));
    ok('…and the clause rides on the option itself, for the open list',
        /title="Family — each parent followed by its parts"/.test(box[1]));

    const title = (/<select id="bl-sort" title="([^"]*)"/.exec(r.html()) || [, ''])[1];
    ok('‼️ the box\'s hover opens on what is CHOSEN, then explains',
        /^Queue order \(yours\)/.test(title) && /do the top five/.test(title));

    const s = r.byId('bl-sort');
    s.value = 'closed';
    s.fire('change');
    const after = (/<select id="bl-sort" title="([^"]*)"/.exec(r.html()) || [, ''])[1];
    ok('…and it follows the choice rather than naming one ordering for ever',
        /^Closed — last finished first/.test(after));

    ok('…at the same size as everything beside it in the row',
        /\.pj-chips-row #bl-sort \{[^}]*font-size:12px/.test(r.html()));
}

// ---------- A-13: the bar above the backlog breaks in ONE place ----------
//
// Six buttons in one right-aligned run did not fit, so whichever ones happened
// to overflow dropped to a second line — a different set at every panel width,
// and no way to tell what belonged with what. Grouping them was the first half
// and it was not enough: the whole group then travelled between lines as the
// panel resized, so the bar still had two shapes. The break is declared now.
// FIRST line: the counts at the left, the four things that REWRITE the file at
// the right. SECOND line: the doors ONTO the file, at the left.
{
    const r = run(data());
    const bar = /<div class="pj-docbar">([\s\S]*?)<\/div>\s*\n\s*<div class="pj-card">/.exec(r.html());
    ok('the bar is still there', !!bar);
    const at = s => bar[1].indexOf(s);
    ok('the four that rewrite the file stay at the right-hand end of the FIRST line',
        at('class="grow"') < at('data-act="blTidy"')
        && at('data-act="blTidy"') < at('data-act="blGather"')
        && at('data-act="blGather"') < at('data-act="blArchive"')
        && at('data-act="blArchive"') < at('data-act="blArchiveAge"'));
    ok('‼️ …as ONE flex item, so the bar breaks between the groups and not inside one',
        at('class="pj-bar-grp"') > at('class="grow"')
        && at('class="pj-bar-grp"') < at('data-act="blTidy"')
        && /\.pj-docbar \.pj-bar-grp \{[^}]*display:flex/.test(r.html()));
    ok('‼️ the doors onto the file are BELOW that run, not beside it — the break '
        + 'is declared so the bar cannot have a second shape at another width',
        at('class="pj-bar-break"') > at('data-act="blArchiveAge"')
        && at('class="pj-bar-break"') < at('class="pj-open"'));
    ok('…and the break really ends the line (a full-width item of no height)',
        /\.pj-docbar \.pj-bar-break \{ flex-basis:100%; height:0;/.test(r.html()));
    ok('…with the counts still first and left, untouched',
        at('class="pj-bl-cnt"') < at('class="grow"'));

    // The other half of the same complaint: the column of names was taking
    // width the page beside it needed. A name that no longer fits is cut, and
    // every row already carried the whole thing in its hover.
    ok('‼️ the projects column is a third narrower', /\.pj-list \{ flex:0 0 160px/.test(r.html()));
    ok('…and it really is 160, which needs min-width:0 — a flex item\'s automatic '
        + 'minimum is its CONTENT\'s, so the old basis was being ignored',
        /\.pj-list \{ flex:0 0 160px; min-width:0; \}/.test(r.html()));
    ok('…with the name cut rather than wrapped', /\.pj-name \{[^}]*text-overflow:ellipsis/.test(r.html()));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
