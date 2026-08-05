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
            tag, dataset: {}, attrs: {}, value: '', checked: false, _h: {},
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
        el.addEventListener = (ev, fn) => { el._h[ev] = fn; };
        // The row pickers stop the click from reaching the document listener that
        // dismisses them, so the event object has to carry that method.
        const evObj = () => ({ preventDefault() { }, stopPropagation() { } });
        el.click = () => el._h.click && el._h.click(evObj());
        el.fire = (ev, arg) => el._h[ev] && el._h[ev](Object.assign(evObj(), arg || {}));
        el.focus = () => { };
        el.setSelectionRange = () => { };
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

    const sandbox = {
        acquireVsCodeApi: () => ({ postMessage: m => posted.push(m), getState: () => ({}), setState() { } }),
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
            querySelector: sel => (dom ? dom.one(sel) : null),
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
    vm.runInContext(code, sandbox);

    return {
        posted,
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
        parent: null, line: 9, depth: 0, section: '📥 Gelen', kinds: [], priority: 'normal',
        effort: null, blockedBy: [], plan: null, from: null, due: null, score: 0.5,
        container: false, inbox: true
    },
    {
        code: 'P-1', text: 'the work layer', state: 'open', area: 'P', parent: null, line: 13,
        depth: 0, section: 'P — Projeler', kinds: ['feat'], priority: 'high', effort: 'M',
        blockedBy: [], plan: 'afprj-05', from: null, due: null, score: 1, container: true, inbox: false
    },
    {
        code: 'P-2', text: LONG, state: 'open', area: 'P', parent: 'P-1', line: 14, depth: 4,
        section: 'P — Projeler', kinds: ['bug', 'regression'], priority: 'highest', effort: 'S',
        blockedBy: [], plan: null, from: null, due: '2026-08-09', score: 2.5, container: false, inbox: false
    },
    {
        code: 'K-1', text: 'measure what the counter actually sees', state: 'open', area: 'K',
        parent: null, line: 18, depth: 0, section: 'K — Konsol', kinds: ['research'],
        priority: 'medium', effort: 'XS', blockedBy: [], plan: null, from: null, due: null,
        score: 3, container: false, inbox: false
    },
    {
        code: 'K-2', text: 'end and remove session', state: 'open', area: 'K', parent: null,
        line: 19, depth: 0, section: 'K — Konsol', kinds: [], priority: 'normal', effort: null,
        blockedBy: ['K-1'], plan: null, from: null, due: null, score: 0.5, container: false, inbox: false
    },
    {
        code: 'U-1', text: 'a finished one', state: 'done', area: 'U', parent: null, line: 23,
        depth: 0, section: 'U — Arayüz', kinds: ['ux'], priority: 'low', effort: 'L',
        blockedBy: [], plan: null, from: null, due: null, score: 0.125, container: false, inbox: false
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
    ok('every live item is a row', codesIn(r.html()).join() === 'P-1,P-2,K-1,K-2');
    ok('the closed one is folded away until asked for', !/data-code="U-1"/.test(r.html()));
    ok('the count says how much of the pile is on screen', /5 of 6<\/span>/.test(r.html()));
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
    ok('a chip carries the words in its hover, so a code is recognisable',
        chips[0].attrs.title.includes(LONG.slice(0, 120)));
    ok('…cut, so one thousand-word item cannot become the tooltip',
        chips[0].attrs.title.includes('…') && !chips[0].attrs.title.includes(LONG.slice(-40)));
    ok('…and says where in the queue it is, and what it would cost',
        /#1 in your queue/.test(chips[0].attrs.title) && /size S/.test(chips[0].attrs.title));

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

    // Dragging in the strip is the SAME reorder the row handles do — one order.
    const r3 = run(data());
    const from = r3.els('blnext').find(e => e.dataset.blnext === 'K-1');
    from.fire('dragstart', { dataTransfer: { setData() { }, effectAllowed: '' } });
    const onto = r3.els('blnext').find(e => e.dataset.blnext === 'P-2');
    onto.fire('dragover', { clientX: 2 });
    ok('the left half of a chip means "in front of this one"',
        onto.classList.contains('drop-left'));
    onto.fire('drop');
    const msg = r3.posted.filter(m => m.type === 'backlogReorder').pop();
    ok('dropping goes through the same op the row drag uses',
        msg && msg.code === 'K-1' && msg.destCode === 'P-2' && msg.place === 'before');
}

// ---------- areas add up ----------
{
    const r = run(data());
    r.els('blarea').find(e => e.dataset.blarea === 'P').click();
    ok('one area narrows to that area', codesIn(r.html()).join() === 'P-1,P-2');
    r.els('blarea').find(e => e.dataset.blarea === 'K').click();
    ok('‼️ a second area ADDS to the first rather than replacing it',
        codesIn(r.html()).join() === 'P-1,P-2,K-1,K-2');
    r.els('blarea').find(e => e.dataset.blarea === 'P').click();
    ok('clicking an area that is on takes it off again', codesIn(r.html()).join() === 'K-1,K-2');
    r.els('blarea').find(e => e.dataset.blarea === '').click();
    ok('"all areas" is a reset, not an area of its own',
        codesIn(r.html()).join() === 'P-1,P-2,K-1,K-2');
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

    const set = (name, v) => {
        const el = r.els('blf').find(e => e.dataset.blf === name);
        el.value = v;
        el.fire('change');
    };
    set('blocked', 'no');
    ok('"startable now" drops what is waiting on something', codesIn(r.html()).join() === 'P-1,P-2,K-1');
    set('blocked', '');
    set('epics', 'hide');
    ok('"leaves only" drops the containers', codesIn(r.html()).join() === 'P-2,K-1,K-2');
    set('epics', 'only');
    ok('…and "containers only" is the other half', codesIn(r.html()).join() === 'P-1');
    set('epics', '');
    set('plan', 'yes');
    ok('the plan link filters', codesIn(r.html()).join() === 'P-1');
    set('plan', '');
    set('due', 'yes');
    ok('so does having a date', codesIn(r.html()).join() === 'P-2');
    ok('the chip counts the axes that are narrowing the list', /⚙ filters \(1\)/.test(r.html()));
    r.els('act').find(e => e.dataset.act === 'blClear').click();
    ok('clear puts every axis back, including the ones outside the panel',
        codesIn(r.html()).join() === 'P-1,P-2,K-1,K-2' && !/⚙ filters \(/.test(r.html()));
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
        codesIn(r.html()).join() === 'P-1,P-2,K-1,K-2');
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
    ok('and back', codesIn(r.html()).join() === 'P-1,P-2,K-1,K-2');
}

// ---------- long items are cut, and open ----------
{
    // What the ROW actually DRAWS, as opposed to what its tooltip carries.
    // Anchored on data-key, or the queue strip's own P-2 chip — which comes
    // first in the paint — sends the search past the row entirely.
    const drawn = html => {
        const m = /<span class="pj-bl-t" title="[^"]*">([\s\S]*?)<\/span>/.exec(
            html.slice(html.indexOf('data-key="P-2"')));
        return m ? m[1] : '';
    };
    const r = run(data());
    const body = drawn(r.html());
    ok('a long item is cut', body.length < LONG.length && body.endsWith('…')
        || /…\s*<button class="pj-bl-more"/.test(body));
    const visible = body.replace(/\s*<button[\s\S]*$/, '').replace(/…$/, '');
    ok('…the cut is a real prefix of the item, at a word boundary',
        LONG.startsWith(visible) && (LONG[visible.length] === ' ' || LONG[visible.length] === undefined));
    ok('…and no longer than the cut asked for', visible.length <= 220);
    ok('…with the whole of it on hover, exactly once',
        (r.html().split(LONG).length - 1) === 1);
    // A short item is drawn whole, carries no hover copy of itself and offers
    // nothing to open — the cut must be invisible on everything it does not hit.
    const shortRow = /<span class="pj-bl-t" title="([^"]*)">([\s\S]*?)<\/span>/.exec(
        r.html().slice(r.html().indexOf('data-key="P-1"')));
    ok('a short item keeps all of its words, with nothing to expand',
        !!shortRow && shortRow[1] === '' && shortRow[2] === 'the work layer');

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

// ---------- the queue: ends, not just steps ----------
{
    const r = run(data());
    const moves = r.els('blmove').filter(e => e.closest().dataset.code === 'K-2')
        .map(e => e.dataset.blmove);
    ok('a row offers both ends as well as both steps',
        moves.join() === 'top,up,down,bottom');
    r.els('blmove').find(e => e.dataset.blmove === 'top' && e.closest().dataset.code === 'K-2').click();
    const msg = r.posted.filter(m => m.type === 'backlogMove').pop();
    ok('⤒ asks the host for the top of the section', msg && msg.dir === 'top' && msg.code === 'K-2');
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
    ok('rows are draggable in file order', /pj-bl-grip"[^>]*draggable="true"/.test(r.html()));
    const from = r.all('[data-blgrip]').find(e => e.closest().dataset.code === 'K-2');
    from.fire('dragstart', { preventDefault() { }, dataTransfer: { setData() { }, effectAllowed: '' } });
    const onto = r.row('K-1');
    onto.fire('dragover', { preventDefault() { }, clientY: 2 });
    ok('hovering the top half of a row marks a drop above it', onto.classList.contains('drop-before'));
    onto.fire('drop', { preventDefault() { } });
    const msg = r.posted.filter(m => m.type === 'backlogReorder').pop();
    ok('dropping names the destination and the side',
        msg && msg.code === 'K-2' && msg.destCode === 'K-1' && msg.place === 'before');
    ok('…and the destination line rides along unshifted too', msg && msg.destLine === 18);

    const s = r.byId('bl-sort');
    s.value = 'priority';
    s.fire('change');
    ok('‼️ under any other ordering the handle is dead — dragging in a view you did not arrange would move the wrong line',
        !/pj-bl-grip"[^>]*draggable="true"/.test(r.html()) && /pj-bl-grip off/.test(r.html()));
}

// ---------- capture takes a type ----------
{
    const r = run(data());
    ok('the capture box offers the work type', /id="bl-type"/.test(r.html()));
}

// ---------- closed work ----------
{
    const r = run(data());
    const c = r.byId('bl-closed');
    c.checked = true;
    c.fire('change');
    ok('show closed brings the finished one back', codesIn(r.html()).indexOf('U-1') >= 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
