// DOM-stub test for the shared Sessions table (media/sessionsTable.js):
// sorting (incl. the Ctx-now criterion), the turn accordion (fold → host
// request → turn rows → turn jump), single-open mode, expand/collapse,
// the ⌨ jump-to-terminal button, the origin scope (🧑 user / 🤖 auto column,
// its one-click switch and its filter chips), and per-page state persistence.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const code = fs.readFileSync(path.resolve(__dirname, '../media/sessionsTable.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// ---------- fake DOM: one container per id, selector queries via regex ----------
function makeContainer() {
    const c = {
        _html: '', _els: {},
        set innerHTML(v) { this._html = v; this._els = {}; },
        get innerHTML() { return this._html; },
        querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
        querySelectorAll(sel) {
            if (this._els[sel]) { return this._els[sel]; }
            const mk = ds => { const e = { dataset: ds }; e.addEventListener = (_t, fn) => { e._fn = fn; }; return e; };
            const list = [];
            const grab = (re, map) => { let m; while ((m = re.exec(this._html))) { list.push(mk(map(m))); } };
            if (sel.startsWith('.af-')) { // any component control class (sort, chips, filter inputs…)
                if (this._html.includes(sel.slice(1))) { list.push(mk({})); }
            } else if (sel === '[data-session]') {
                grab(/data-session="([^"]*)"/g, m => ({ session: m[1] }));
            } else if (sel === '[data-fold]') {
                grab(/data-fold="([^"]*)"/g, m => ({ fold: m[1] }));
            } else if (sel === '[data-term]') {
                grab(/data-term="([^"]*)" data-sid="([^"]*)" data-cwd="([^"]*)"/g,
                    m => ({ term: m[1], sid: m[2], cwd: m[3] }));
            } else if (sel === '[data-turnjump]') {
                grab(/data-turnjump="([^"]*)" data-turnts="(\d+)"/g,
                    m => ({ turnjump: m[1], turnts: m[2] }));
            }
            this._els[sel] = list;
            return list;
        }
    };
    return c;
}

const containers = {};
let posted = [];
let state = {};
const sandbox = {
    window: {},
    document: { getElementById: id => containers[id] || (containers[id] = makeContainer()) },
    console
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const vscodeStub = {
    postMessage: m => posted.push(m),
    getState: () => state,
    setState: s => { state = s; }
};
const C = {
    esc: s => String(s === undefined || s === null ? '' : s).replace(/</g, '&lt;'),
    fmtTok: v => v + 't',
    fmtUSD: v => '$' + v
};
const ev = () => ({ stopPropagation() { } });
const click = el => el._fn(ev());

const NOW = Date.now();
const mkRow = (i, extra) => Object.assign({
    file: 'f' + i, agent: 'dev', agentName: 'dev', sessionId: 'sid' + i, cwd: 'D:/a/dev',
    title: 'title' + i, ts: NOW - i * 60000, durationMin: i, turns: i,
    toolCalls: i * 2, errors: 0, tokens: i * 100, ctx: 0, cost: i,
    sidechain: false, active: false
}, extra);

// ---------- part 1: rendering, Ctx column, sorting ----------
{
    posted = []; state = {};
    const t = sandbox.window.AFSessionsTable.create({
        vscode: vscodeStub, C, containerId: 'dash',
        columns: ['agent', 'title', 'when', 'duration', 'turns', 'tools', 'errors', 'tokens', 'ctx', 'cost'],
        stateKey: 'dash'
    });
    const rows = [mkRow(1), mkRow(2, { ctx: 180000, active: true }), mkRow(3), mkRow(4), mkRow(5)];
    t.setRows(rows, 3);
    const html = () => containers.dash.innerHTML;

    ok('agent column rendered', html().includes('<th>Agent</th>'));
    ok('Ctx now header + sort option present',
        html().includes('>Ctx now</th>') && html().includes('<option value="ctx"'));
    ok('ctx cell formatted (~) when known, — when not',
        html().includes('~180000t') && html().includes('>—</td>'));
    ok('tableN respected: 3 of 5 rows shown',
        containers.dash.querySelectorAll('[data-fold]').length === 3);
    ok('default recent sort: newest first',
        html().indexOf('title1') >= 0 && html().indexOf('title1') < html().indexOf('title2'));
    // a terminal can be open while the session idles — every row gets ⌨,
    // the ● dot alone marks the active one
    ok('⌨ on every row', (html().match(/data-term=/g) || []).length === 3);
    ok('● only on the active row', (html().match(/dot on/g) || []).length === 1);

    // sort by Ctx now → the ctx champion (f2) leads and the state persists
    const sel = containers.dash.querySelector('.af-sort');
    sel._fn({ target: { value: 'ctx' } });
    ok('ctx sort puts the champion first',
        html().indexOf('title2') < html().indexOf('title1'));
    ok('sort persisted under the page key', state.afSess && state.afSess.dash.sort === 'ctx');

    // ⌨ posts the session identity, not just the agent name
    click(containers.dash.querySelectorAll('[data-term]')[0]);
    const term = posted.find(p => p.type === 'focusTerminal');
    ok('⌨ posts sessionId + cwd + agent', term && term.sessionId === 'sid2' && term.cwd === 'D:/a/dev' && term.agentName === 'dev');

    // row click opens the transcript
    click(containers.dash.querySelectorAll('[data-session]')[0]);
    ok('row click posts openSession', posted.some(p => p.type === 'openSession' && p.file === 'f2'));
}

// ---------- part 2: turn accordion — fold, host round-trip, turn jump ----------
{
    posted = []; state = {};
    const t = sandbox.window.AFSessionsTable.create({
        vscode: vscodeStub, C, containerId: 'acc',
        columns: ['title', 'when', 'tokens', 'ctx', 'cost'], stateKey: 'agent'
    });
    t.setRows([mkRow(1), mkRow(2)], 10);
    const html = () => containers.acc.innerHTML;

    ok('no Agent column on the agent page variant', !html().includes('<th>Agent</th>'));
    click(containers.acc.querySelectorAll('[data-fold]')[0]); // f1
    ok('fold requests turns from the host',
        posted.some(p => p.type === 'sessionTurns' && p.file === 'f1'));
    ok('loading placeholder shown', html().includes('Loading turns…'));

    const handled = t.onMessage({ data: { type: 'sessionTurns', file: 'f1', turns: [{ n: 1, label: 'fix the bug', ts: 777, models: ['claude-x'], tokens: 5, cost: 1 }] } });
    ok('sessionTurns message consumed', handled === true);
    ok('turn row rendered with model tag', html().includes('fix the bug') && html().includes('>x</span>'));
    ok('foreign messages not consumed', t.onMessage({ data: { type: 'data' } }) === false);

    click(containers.acc.querySelectorAll('[data-turnjump]')[0]);
    const jump = posted.filter(p => p.type === 'openSession').pop();
    ok('turn jump opens the transcript at the turn', jump && jump.file === 'f1' && jump.ts === 777);
}

// ---------- part 3: single-open, expand all, collapse all ----------
{
    posted = []; state = {};
    const t = sandbox.window.AFSessionsTable.create({
        vscode: vscodeStub, C, containerId: 'modes',
        columns: ['title', 'cost'], stateKey: 'dash'
    });
    t.setRows([mkRow(1), mkRow(2), mkRow(3)], 10);
    const cont = containers.modes;
    const openCount = () => (cont.innerHTML.match(/sessrow open/g) || []).length;

    ok('the table opens with every row folded and single-open on',
        openCount() === 0 && cont.innerHTML.includes('af-single on'));

    click(cont.querySelector('.af-single'));   // off — so two rows can be open at once
    click(cont.querySelectorAll('[data-fold]')[0]);
    click(cont.querySelectorAll('[data-fold]')[1]);
    ok('two rows open without single-open', openCount() === 2);

    click(cont.querySelector('.af-single'));
    ok('entering single-open keeps only the first open row', openCount() === 1);
    click(cont.querySelectorAll('[data-fold]')[2]);
    ok('single-open: unfolding a session folds the previous one',
        openCount() === 1 && cont.innerHTML.includes('data-fold="f3" title="Hide'));

    click(cont.querySelector('.af-expand'));
    ok('expand all opens every shown row', openCount() === 3);
    click(cont.querySelector('.af-collapse'));
    ok('collapse all closes everything', openCount() === 0);
}

// ---------- part 4: persisted state round-trip + legacy fallback ----------
{
    posted = [];
    state = { afSess: { dash: { sort: 'cost', single: true } } };
    const t = sandbox.window.AFSessionsTable.create({
        vscode: vscodeStub, C, containerId: 'persist',
        columns: ['title', 'cost'], stateKey: 'dash'
    });
    t.setRows([mkRow(1), mkRow(3), mkRow(2)], 10);
    const html = containers.persist.innerHTML;
    ok('persisted sort restored (cost-desc)', html.indexOf('title3') < html.indexOf('title1'));
    ok('persisted single-open restored', html.includes('af-single on'));
    // the important direction now that single-open is the default: an explicit
    // "off" must survive, or the user's choice never sticks
    state = { afSess: { dash: { sort: 'cost', single: false } } };
    const tOff = sandbox.window.AFSessionsTable.create({
        vscode: vscodeStub, C, containerId: 'persistoff',
        columns: ['title', 'cost'], stateKey: 'dash'
    });
    tOff.setRows([mkRow(1)], 10);
    ok('persisted single-open OFF beats the default', !containers.persistoff.innerHTML.includes('af-single on'));

    // pre-2.57 dashboards persisted sessSort/sessSingle at the top level
    state = { sessSort: 'turns', sessSingle: true };
    const t2 = sandbox.window.AFSessionsTable.create({
        vscode: vscodeStub, C, containerId: 'legacy',
        columns: ['title', 'turns', 'cost'], stateKey: 'dash',
        fallbackSort: state.sessSort, fallbackSingle: state.sessSingle
    });
    t2.setRows([mkRow(1), mkRow(9), mkRow(2)], 10);
    const html2 = containers.legacy.innerHTML;
    ok('legacy fallback sort honored (turns-desc)', html2.indexOf('title9') < html2.indexOf('title1'));
    ok('legacy fallback single-open honored', html2.includes('af-single on'));
}

// ---------- part: Show box — row count control (number / All, host round-trip) ----------
{
    posted = []; state = {};
    const t = sandbox.window.AFSessionsTable.create({
        vscode: vscodeStub, C, containerId: 'cnt',
        columns: ['title', 'cost'], stateKey: 'cnt'
    });
    t.setRows([mkRow(1), mkRow(2), mkRow(3), mkRow(4), mkRow(5)], 3);
    const html = () => containers.cnt.innerHTML;
    const q = sel => containers.cnt.querySelector(sel);
    const shownRows = () => containers.cnt.querySelectorAll('[data-fold]').length;

    ok('Show box renders with the host-shipped N', html().includes('class="af-count"') && html().includes('value="3"'));
    ok('All chip present and off while a count is set', html().includes('af-allrows') && !html().includes('af-allrows on'));

    const inp = q('.af-count'); inp.value = '2'; inp._fn(ev());
    ok('typing a count narrows the table at once', shownRows() === 2);
    ok('…and asks the host to rebuild the pool for that N',
        posted.some(p => p.type === 'setTableN' && p.n === 2));

    posted = [];
    click(q('.af-allrows'));
    ok('All shows every row and posts n=0', shownRows() === 5
        && posted.some(p => p.type === 'setTableN' && p.n === 0));
    ok('All chip lights up, count box empties to its "all" placeholder',
        html().includes('af-allrows on') && html().includes('placeholder="all"') && !html().includes('value="2"'));

    posted = [];
    click(q('.af-allrows'));
    ok('clicking All again returns to the default N', posted.some(p => p.type === 'setTableN' && p.n === 12));

    // host-shipped 0 (e.g. restored panel) also means "all"
    t.setRows([mkRow(1), mkRow(2), mkRow(3), mkRow(4), mkRow(5)], 0);
    ok('setRows with n=0 keeps every row visible', shownRows() === 5 && html().includes('af-allrows on'));
}

// ---------- part: advanced filters (text, agent, flags, ranges, dates) ----------
{
    posted = []; state = {};
    const t = sandbox.window.AFSessionsTable.create({
        vscode: vscodeStub, C, containerId: 'flt',
        columns: ['agent', 'title', 'when', 'tokens', 'cost'], stateKey: 'flt'
    });
    const rows = [
        mkRow(1, { errors: 2, tokens: 100 }),
        mkRow(2, { agentName: 'psy', agent: 'psy', active: true, tokens: 90000 }),
        mkRow(3, { sidechain: true })
    ];
    t.setRows(rows, 10);
    const html = () => containers.flt.innerHTML;
    const q = sel => containers.flt.querySelector(sel);

    ok('Filters chip renders in the chip row', html().includes('af-filter'));
    click(q('.af-filter'));
    ok('filter panel opens with text, agent, flags, ranges and dates',
        html().includes('af-ftext') && html().includes('af-fagent') && html().includes('af-factive')
        && html().includes('af-fr-tokens-min') && html().includes('af-ffrom') && html().includes('af-fclear'));
    click(q('.af-factive'));
    ok('Active-now flag narrows to the live session and shows the count',
        html().includes('title2') && !html().includes('title1') && html().includes('1/3 sessions'));
    click(q('.af-factive'));
    click(q('.af-ferrors'));
    ok('Has-errors flag keeps only erroring sessions', html().includes('title1') && !html().includes('title2'));
    click(q('.af-ferrors'));
    click(q('.af-fmain'));
    ok('Main-only hides sidechain sessions', !html().includes('title3') && html().includes('title1'));
    click(q('.af-fmain'));
    const txt = q('.af-ftext'); txt.value = 'title2'; txt._fn(ev());
    ok('text filter matches the title', html().includes('title2') && !html().includes('title1'));
    click(q('.af-fclear'));
    const min = q('.af-fr-tokens-min'); min.value = '5000'; min._fn(ev());
    ok('token min-range hides small sessions', html().includes('title2') && !html().includes('title1'));
    ok('filter state persisted under the page key',
        state.afSess && state.afSess.flt.filters.ranges.tokens.min === 5000);
    const ag = q('.af-fagent'); ag.value = 'dev'; ag._fn(ev());
    ok('agent selection combines with the range (nothing matches → honest row)',
        html().includes('No sessions match the filters.'));
    click(q('.af-fclear'));
    ok('Clear restores every row', html().includes('title1') && html().includes('title2') && html().includes('title3'));
}

// ---------- part: origin scope — the column, the one-click switch, the chips ----------
{
    posted = []; state = {};
    const t = sandbox.window.AFSessionsTable.create({
        vscode: vscodeStub, C, containerId: 'orig',
        columns: ['origin', 'agent', 'title', 'when', 'cost'], stateKey: 'orig'
    });
    // two of the user's own dialogs, three automation runs
    t.setRows([
        mkRow(1, { origin: 'user' }), mkRow(2, { origin: 'auto' }), mkRow(3, { origin: 'auto' }),
        mkRow(4, { origin: 'user' }), mkRow(5, { origin: 'auto' })
    ], 10);
    const html = () => containers.orig.innerHTML;
    const q = sel => containers.orig.querySelector(sel);
    const shownRows = () => containers.orig.querySelectorAll('[data-fold]').length;

    ok('origin column rendered with its own header', html().includes('>By</th>'));
    ok('the table opens scoped to your own sessions',
        shownRows() === 2 && html().includes('title1') && html().includes('title4') && !html().includes('title2'));
    ok('…and says how many rows that hides', html().includes('2/5 sessions'));
    ok('user rows carry the 🧑 glyph, and no 🤖 is on screen',
        html().includes('🧑</td>') && !html().includes('🤖</td>'));
    ok('the scope switch shows the current scope and is lit', html().includes('af-oswitch on'));

    click(q('.af-oswitch'));
    ok('one click on the switch shows everything', shownRows() === 5 && html().includes('title2'));
    ok('…automation rows carry the 🤖 glyph', html().includes('🤖</td>'));
    ok('…the switch goes quiet and the row count note disappears',
        !html().includes('af-oswitch on') && !html().includes('/5 sessions'));
    ok('scope persisted under the page key', state.afSess.orig.filters.origin === '');

    click(q('.af-oswitch'));
    ok('clicking again returns to your own sessions', shownRows() === 2);

    // the filter panel carries the three-way scope, incl. Auto (the switch has no third stop)
    click(q('.af-filter'));
    ok('filter panel offers all three scopes',
        html().includes('af-forig-all') && html().includes('af-forig-user') && html().includes('af-forig-auto'));
    click(q('.af-forig-auto'));
    ok('Auto shows only automation runs',
        shownRows() === 3 && html().includes('title2') && !html().includes('title1'));
    ok('…and the switch reflects the narrowed scope', html().includes('af-oswitch on'));
    click(q('.af-oswitch'));
    ok('the switch does what its label says from any scope: Auto → All', shownRows() === 5);
    click(q('.af-oswitch'));
    ok('…and the next click lands back on your own sessions', shownRows() === 2);
    ok('the Filters chip is NOT inflated by the scope', !html().includes('Filters ('));
    click(q('.af-fclear'));
    ok('Clear restores the default scope, not "all"', shownRows() === 2);

    // a row without an origin field (older host, external CLI) counts as yours
    t.setRows([mkRow(9)], 10);
    ok('a row with no origin stays visible in the User scope',
        containers.orig.querySelectorAll('[data-fold]').length === 1);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
