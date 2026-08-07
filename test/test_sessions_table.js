// DOM-stub test for the shared Sessions table (media/sessionsTable.js):
// sorting (incl. the Ctx-now criterion), the turn accordion (fold → host
// request → turn rows → turn jump), single-open mode, expand/collapse,
// the ⌨ jump-to-terminal button, the origin scope (🧑 user / 🤖 auto column,
// its one-click switch and its filter chips), and per-page state persistence.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const shared = require(path.join(__dirname, 'lib_shared_media.js'));
const code = shared.sharedMedia()
    + fs.readFileSync(path.resolve(__dirname, '../media/sessionsTable.js'), 'utf8');
const createAfmsDom = require(path.join(__dirname, 'lib_afms_dom.js'));
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// ---------- fake DOM: one container per id, selector queries via regex ----------
function makeContainer() {
    const c = {
        _html: '', _els: {},
        set innerHTML(v) { this._html = v; this._els = {}; },
        get innerHTML() { return this._html; },
        querySelector(sel) {
            // the shared multi-pick control has its own shim (lib_afms_dom.js)
            if (sel.indexOf('[data-afms') === 0) { return this.ms.querySelector(sel); }
            return this.querySelectorAll(sel)[0] || null;
        },
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
            } else if (sel === '[data-sel]') {
                grab(/data-sel="([^"]*)"/g, m => ({ sel: m[1] }));
            } else if (sel === '[data-pin]') {
                grab(/data-pin="([^"]*)" data-pinned="([^"]*)"/g, m => ({ pin: m[1], pinned: m[2] }));
            } else if (sel === '[data-stop]') {
                grab(/data-stop="([^"]*)" data-stopagent="([^"]*)"/g,
                    m => ({ stop: m[1], stopagent: m[2] }));
            }
            this._els[sel] = list;
            return list;
        }
    };
    c.ms = createAfmsDom(() => c._html);
    return c;
}

const containers = {};
let posted = [];
let state = {};
const sandbox = {
    window: {},
    document: { getElementById: id => containers[id] || (containers[id] = makeContainer()) },
    setTimeout: () => 0, clearTimeout: () => { },
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
            fmtTokW(n, w) { return this.fmtTok(n || 0) + (w > 0 ? ' [w' + this.fmtTok(Math.round(w)) + ']' : ''); },
            fmtTokWText(n, w) { return this.fmtTok(n || 0) + (w > 0 ? ' (w' + this.fmtTok(Math.round(w)) + ')' : ''); },
            WEIGHTED_TIP: 'weighted',
    // rounded like the real one (charts.js): a per-hour rate is a division, and
    // a stub that prints 24.000000000000004 tests the stub, not the page
    fmtUSD: v => '$' + Math.round(v * 100) / 100,
    fmtDur: ms => Math.round(ms / 1000) + 's',
    fmtSteps: (calls, steps) => (calls ? calls + 'api·' : '') + steps + 'steps',
    STEPS_TIP: 'two measurements of the SAME turn'
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

    ok('agent column rendered', html().includes('>Agent</th>'));
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

// ---------- S-6 / S-17: every column is a READOUT on hover ----------
// The row's tooltip used to be the only one, so all eleven cells said
// "right-click for session actions" and the figures they covered — when the
// session ran, what a turn cost — were reachable only by opening it. S-17 then
// took the hint back OUT of the cells (one sentence appended to eleven tooltips
// on every row is the same waste in a smaller font; it is said once, above the
// table) and finally took the PROSE out too: a cell hover is `Label: value`
// lines, the way a spreadsheet says it, and anything that is TEXT — a prompt, a
// project's details — moves to the rich panel where it can actually be read.
{
    posted = []; state = {};
    const t = sandbox.window.AFSessionsTable.create({
        vscode: vscodeStub, C, containerId: 'tips',
        columns: ['origin', 'agent', 'title', 'when', 'duration', 'turns', 'tools', 'errors', 'tokens', 'ctx', 'cost'],
        stateKey: 'tips'
    });
    // a session with both ends known: 4 turns over 20 minutes, $8, 400 tokens,
    // 8 round trips, a token split and the two tools it mostly reached for
    t.setRows([mkRow(1, {
        firstTs: NOW - 20 * 60000, ts: NOW, durationMin: 20, turns: 4,
        toolCalls: 12, errors: 3, tokens: 400, wTokens: 900, ctx: 90000, cost: 8,
        apiCalls: 8, files: 2, branch: 'master', permissionMode: 'acceptEdits',
        version: '2.0.31', entrypoint: 'cli', models: ['claude-opus-5'],
        usage: { input: 100, output: 100, cacheRead: 160, cacheWrite: 40 },
        topTools: [{ name: 'Read', n: 7 }, { name: 'Edit', n: 5 }]
    })], 10);
    const html = () => containers.tips.innerHTML;

    ok('the row still says a right-click has more',
        html().includes('title="right-click for session actions"'));
    // ‼️ ONCE. The row keeps it (a cell with its own title overrides it anyway)
    // and the strip above the table says it in words — but no cell repeats it.
    ok('…and it is not repeated under every figure on the row',
        (html().match(/right-click for session actions/g) || []).length <= 2);
    ok('…while the strip above the table says it in words for the whole table',
        /class="muted small">[^<]*right-click for session actions/.test(html()));
    ok('When says the whole date and both ends',
        /title="[^"]*Last activity:[^"]*Started:[^"]*Ran for: 20 min/.test(html()));
    ok('Duration derives the per-turn average', html().includes('Per turn: 5 min'));
    ok('Duration says it is wall clock — as a value, not a lecture',
        html().includes('Duration: 20 min (wall clock)'));
    ok('Turns derives what one turn costs',
        html().includes('Tokens per turn: 100t') && html().includes('Cost per turn: $2'));
    ok('Turns separates the prompts you sent from the round trips they took',
        html().includes('API calls: 8') && html().includes('Calls per turn: 2'));
    ok('Tokens separates the raw total from the weighted one',
        /title="Raw total: 400t[^"]*Weighted \(plan\): 900t/.test(html()));
    // ‼️ Two sessions with the same total differ by an order of magnitude in
    // money when one is cache reads and the other is output.
    ok('Tokens splits the total the way it is billed',
        html().includes('In: 100 (25%)') && html().includes('Out: 100 (25%)')
        && html().includes('Cache read: 160 (40%)') && html().includes('Cache write: 40 (10%)'));
    ok('…and the weight ratio is a figure, not a warning',
        html().includes('Weight ratio: 2.3×'));
    ok('Tools says WHAT it did, not only how much',
        html().includes('Top: Read 7 · Edit 5'));
    ok('Errors says what share of the tool calls they are',
        html().includes('Share of tool calls: 25%'));
    ok('Ctx opens up instead of showing one number',
        html().includes('Context now: 90000t') && html().includes('Of a 200k window: 45%')
        && html().includes('Share of the total:'));
    ok('Cost derives a rate from every denominator it has',
        html().includes('Per turn: $2') && html().includes('Per API call: $1')
        && html().includes('Per 1M tokens: $20000'));
    // ‼️ …and NOT from one that is not worth dividing by. A 20-minute session
    // has no hourly rate; the old tooltip clamped the divisor to one hour and
    // printed the session's whole cost as its "per hour" figure.
    ok('a session under an hour is not given an hourly rate',
        !html().includes('Per hour:'));
    ok('Cost names the model the price came from', html().includes('Models: opus-5'));
    ok('Agent carries the circumstances of the run',
        html().includes('Branch: master') && html().includes('Permissions: acceptEdits')
        && html().includes('CLI: 2.0.31'));
    ok('By shows its own evidence rather than asking to be trusted',
        html().includes('Entrypoint: cli'));

    // ‼️ THE POINT OF THE PASS: no cell explains itself. These are the exact
    // sentences that used to be repeated under every figure on every row.
    const PROSE = [
        'not time spent working', 'prompts you sent', 'carried them',
        'a plan session is not billed this way', 'after the last reply',
        'Cache reads are', 'is a long one even if', 'an error is not always a fault',
        'Resolved in a fixed order', 'open the session to see the changes'
    ];
    // Only the CELLS — a `<th>` is where a column's one definition belongs, and
    // that is the whole point of taking the definitions out of the cells.
    const cellTips = (html().match(/<td[^>]*title="[^"]*"/g) || []).join(' ');
    ok('no cell tooltip explains itself — figures only',
        PROSE.every(p => !cellTips.includes(p)));
    ok('…and no cell tooltip has grown into a paragraph',
        (html().match(/<td[^>]*title="([^"]*)"/g) || [])
            .filter(t => t.indexOf('right-click') < 0)
            .every(t => t.length < 800));

    // …and the selection bar is where "what would a right-click do to all of
    // them" is answered — with the count, once, not in every cell.
    const box = containers.tips.querySelectorAll('[data-sel]')[0];
    box.checked = true;
    box._fn({ stopPropagation() { }, shiftKey: false });
    const sel = containers.tips.innerHTML;
    ok('a selection says the menu acts on all of them — once, on its own bar',
        sel.includes('1 session selected — right-click to act on all of them')
        && (sel.match(/1 session selected/g) || []).length <= 2);
}

// ---------- S-17: the text columns hover into the RICH PANEL ----------
// A native tooltip repeats what the row already drew and then stops wherever
// the platform feels like stopping — which is the worst possible treatment of
// the two cells whose content is words. Title and Project open the same panel
// the backlog's `more` proved out (media/afTip.js): the whole opening prompt,
// the project's own folders, scrollable, pointer can go in.
{
    posted = []; state = {};
    const t = sandbox.window.AFSessionsTable.create({
        vscode: vscodeStub, C, containerId: 'box',
        columns: ['title', 'project', 'when', 'cost'], stateKey: 'box'
    });
    const PROMPT = 'do the top seven items of the backlog. '.repeat(60);   // ~2400 chars
    t.setRows([mkRow(1, {
        title: 'backlog ilerleme', firstPrompt: PROMPT, turns: 4,
        project: 'AgentFarm', projectIcon: '◧', projectColor: '#f80',
        projectDetail: 'Status: active · product\nDocs: D:\\zone\\know\\PRS\nCode: D:\\zone\\dev\\vsc_AgentFarm',
        cliName: 'nightly', tags: ['zen'], sessionId: 'sidX'
    })], 10);
    const html = () => containers.box.innerHTML;

    ok('the title cell opens the rich panel, not a native title',
        html().includes('class="af-tipw"') && html().includes('class="af-tipb"'));
    // ‼️ THE WHOLE PROMPT. Not eighty characters of it, not a platform's idea
    // of enough — the reason the panel exists at all.
    ok('…carrying the opening prompt whole',
        html().indexOf(PROMPT.trim()) > 0);
    ok('…with the identity facts above it, as Label: value',
        html().includes('Session: sidX') && html().includes('Turns: 4')
        && html().includes('Started as: nightly'));
    // the count is grouped by the user's own locale (2,280 · 2.280 · 2 280),
    // so the assertion must not pin one country's separator
    ok('…and a head that says how big the thing you are reading is',
        /first prompt [\d.,\s  ]+ characters/.test(html()));
    ok('the project cell carries what the project IS, folders first',
        html().includes('Docs: D:\\zone\\know\\PRS') && html().includes('Code: D:'));
    ok('…headed by the project name', html().includes('Project · AgentFarm'));
    // A session with no project must not open an empty box on hover.
    t.setRows([mkRow(2, { project: '', projectDetail: '' })], 10);
    ok('a session with no project opens nothing',
        !containers.box.innerHTML.includes('Project · '));
}

// ---------- S-17: the TURN rows are where the detail actually lives ----------
{
    posted = []; state = {};
    const t = sandbox.window.AFSessionsTable.create({
        vscode: vscodeStub, C, containerId: 'trn',
        columns: ['title', 'when', 'cost'], stateKey: 'trn'
    });
    t.setRows([mkRow(1)], 10);
    click(containers.trn.querySelectorAll('[data-fold]')[0]);
    const TP = 'fix the encoding bug in the packager, and explain why. '.repeat(30);
    t.onMessage({
        data: {
            type: 'sessionTurns', file: 'f1', turns: [
                {
                    n: 1, label: 'fix the encoding bug', prompt: TP, ts: NOW - 3600000,
                    models: ['claude-opus-5'], tokens: 300, wTokens: 700, cost: 3,
                    apiCalls: 6, steps: 18, ms: 90000, endCtx: 40000,
                    tools: 9, errors: 1, topTools: [{ name: 'Edit', n: 5 }, { name: 'Bash', n: 3 }]
                },
                { n: 2, label: 'and the tests', prompt: 'and the tests', ts: NOW, tokens: 100, cost: 1 }
            ]
        }
    });
    const html = () => containers.trn.innerHTML;

    ok('the turn prompt opens the rich panel with the whole ask',
        html().includes('class="af-tipb"') && html().indexOf(TP.trim()) > 0);
    ok('…headed by the turn and its size', /Turn 1 · .* · [\d.,\s  ]+ characters/.test(html()));
    ok('a turn row carries the figures the session row is a SUM of',
        html().includes('Tool calls: 9') && html().includes('Top tools: Edit 5 · Bash 3')
        && html().includes('Errors: 1') && html().includes('Steps per call: 3'));
    ok('…and each turn against the session it is part of',
        html().includes('Share of session tokens: 75%')
        && html().includes('Share of session cost: 75%'));
    ok('…and the turn columns keep their own headings',
        html().includes('>steps</th>') && html().includes('>prompt</th>'));
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

    ok('no Agent column on the agent page variant', !html().includes('>Agent</th>'));
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
    const ms = containers.flt.ms;
    ok('filter panel opens with text, agent picker, flags, ranges and dates',
        html().includes('af-ftext') && ms.has('sess-agents-flt') && html().includes('af-factive')
        && html().includes('af-fr-tokens-min') && html().includes('af-ffrom') && html().includes('af-fclear'));
    ok('the agent picker opens unfiltered, every agent ticked',
        ms.label('sess-agents-flt') === 'Agents: all' && ms.ticked('sess-agents-flt').length === 2);
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
    ms.only('sess-agents-flt', ['dev']);
    ok('agent pick combines with the range (nothing matches → honest row)',
        html().includes('No sessions match the filters.'));
    ok('one-agent pick names the agent on the button', ms.label('sess-agents-flt') === 'Agents: dev');
    click(q('.af-fclear'));
    ok('Clear restores every row', html().includes('title1') && html().includes('title2') && html().includes('title3'));
    // any subset, not just all-or-one: Clear then tick both is the same as all
    ms.only('sess-agents-flt', ['dev', 'psy']);
    ok('ticking every agent means no filter at all',
        ms.label('sess-agents-flt') === 'Agents: all'
        && state.afSess.flt.filters.agents === null
        && html().includes('title1') && html().includes('title2'));
    ms.clear('sess-agents-flt');
    ok('Clear on the picker honestly matches nothing',
        ms.label('sess-agents-flt') === 'Agents: none' && html().includes('No sessions match the filters.'));
    click(q('.af-fclear'));
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

// ---------- part: the shelf — ★ column, pinned-first, exempt from the row limit ----------
{
    posted = []; state = {};
    const t = sandbox.window.AFSessionsTable.create({
        vscode: vscodeStub, C, containerId: 'pin',
        columns: ['title', 'when', 'cost'], stateKey: 'pin'
    });
    // f5 is the OLDEST and cheapest — bottom of every sort — and pinned.
    t.setRows([
        mkRow(1), mkRow(2), mkRow(3), mkRow(4),
        mkRow(5, { pinned: true, tags: ['zen', 'release'] })
    ], 2);
    const html = () => containers.pin.innerHTML;
    const q = sel => containers.pin.querySelector(sel);
    const rowsShown = () => containers.pin.querySelectorAll('[data-fold]').length;

    ok('the ★ column has its own header', html().includes('class="pincell"') && html().includes('>★</th>'));
    ok('every row carries a pin toggle', containers.pin.querySelectorAll('[data-pin]').length === rowsShown());
    ok('a pinned row shows a filled star, unpinned an outline',
        html().includes('pinbtn on') && html().includes('>☆</button>'));
    ok('the pinned session leads, whatever the sort says',
        html().indexOf('title5') < html().indexOf('title1'));
    ok('…and it does NOT eat one of the N rows (2 + the pinned one)', rowsShown() === 3);
    ok('its labels are on the row', html().includes('>zen</span>') && html().includes('>release</span>'));

    // ★ click: optimistic locally + persisted by the host
    click(containers.pin.querySelectorAll('[data-pin]')[0]);   // the pinned f5 → unpin
    const off = posted.find(p => p.type === 'pinSession');
    ok('★ posts the session id and the wanted state',
        off && off.sessionId === 'sid5' && off.pinned === false);
    ok('the row flips at once, without waiting for the host',
        !html().includes('pinbtn on') && rowsShown() === 2);
    ok('…and the unpinned session falls back out of the top-N', !html().includes('title5'));

    posted = [];
    click(containers.pin.querySelectorAll('[data-pin]')[0]);   // pin the first visible row
    ok('pinning back posts pinned:true',
        posted.some(p => p.type === 'pinSession' && p.pinned === true));

    // labels are searchable text
    t.setRows([mkRow(1), mkRow(2, { tags: ['customer x'] })], 10);
    click(q('.af-filter'));
    const txt = q('.af-ftext'); txt.value = 'customer'; txt._fn(ev());
    ok('the text filter searches labels too',
        html().includes('title2') && !html().includes('title1'));
    txt.value = ''; txt._fn(ev());

    // the ★ Pinned filter = the shelf on its own
    t.setRows([mkRow(1), mkRow(2, { pinned: true }), mkRow(3)], 10);
    click(q('.af-fpin'));
    ok('★ Pinned narrows to the shelf',
        html().includes('title2') && !html().includes('title1') && !html().includes('title3'));
    ok('…and it counts as an active filter', html().includes('Filters ('));
    click(q('.af-fclear'));
    ok('Clear restores everything', html().includes('title1') && html().includes('title3'));
}

// ---------- part: ⎋ interrupt — only where there is something to stop ----------
{
    posted = []; state = {};
    const t = sandbox.window.AFSessionsTable.create({
        vscode: vscodeStub, C, containerId: 'stop',
        columns: ['title', 'cost'], stateKey: 'stop'
    });
    t.setRows([mkRow(1, { active: true }), mkRow(2)], 10);
    const stops = () => containers.stop.querySelectorAll('[data-stop]');

    ok('the interrupt button is on the running row only', stops().length === 1);
    click(stops()[0]);
    const msg = posted.find(p => p.type === 'interruptSession');
    ok('⎋ posts the session identity', msg && msg.sessionId === 'sid1' && msg.agentName === 'dev');

    t.setRows([mkRow(1), mkRow(2)], 10);
    ok('nothing running, nothing to interrupt', stops().length === 0);
}

// ---------- part 7: the session right-click contract on every row ----------
// Right-clicking a row on the Dashboard / an agent page used to offer nothing
// but Copy/Paste, while the same session on a Console card or a Timeline lane
// had eleven actions. The rows now carry the shared contract (afSessionCtx.js).
{
    posted = []; state = {};
    const t = sandbox.window.AFSessionsTable.create({
        vscode: vscodeStub, C, containerId: 'ctx',
        columns: ['title', 'cost'], stateKey: 'ctx'
    });
    t.setRows([mkRow(1), mkRow(2)], 10);
    const html = containers.ctx.innerHTML;

    ok('every session row carries data-vscode-context',
        (html.match(/data-vscode-context=/g) || []).length === 2);
    ok('the shared session section is used', html.includes('afSessionRow'));
    ok('the row publishes the identity the menu commands need',
        html.includes('&quot;sessionId&quot;:&quot;sid1&quot;')
        && html.includes('&quot;file&quot;:&quot;f1&quot;')
        && html.includes('&quot;cwd&quot;:&quot;D:/a/dev&quot;')
        && html.includes('&quot;agentName&quot;:&quot;dev&quot;'));
    ok('the page keeps its own Copy/Paste menu',
        html.includes('preventDefaultContextMenuItems&quot;:false'));

    // …and the menu is discoverable at all
    ok('rows say a right-click has actions', html.includes('right-click for session actions'));
}

// ---------- part 8: the menu itself is declared for the shared section ----------
// A row that publishes a section nothing listens to is a right-click that still
// shows only Copy/Paste — the contract has two halves and both must exist.
{
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));
    const web = pkg.contributes.menus['webview/context'];
    // ‼️ The question is "is this drawn on a session row", not "is it spelled
    // this way". The session menu is a FAMILY of sections — a Needs row that
    // names a transcript is a session too — so its clause is a regex, and a
    // test that pinned one spelling would break every time the family grows
    // while proving nothing about what the user actually gets.
    const drawsOnSessionRow = (when) => {
        if (when === "webviewSection == 'afSessionRow'") { return true; }
        const m = /^webviewSection =~ \/(.+)\/$/.exec(String(when || ''));
        return !!m && new RegExp(m[1]).test('afSessionRow');
    };
    const onRow = id => web.some(m => m.command === id && drawsOnSessionRow(m.when));
    const FULL = [
        'agentfarm.openSession', 'agentfarm.resumeSession', 'agentfarm.resumeInConsole',
        'agentfarm.focusSessionTerminal', 'agentfarm.renameSession', 'agentfarm.pinSession',
        'agentfarm.tagSession', 'agentfarm.copySessionId', 'agentfarm.interruptSession',
        'agentfarm.endSession', 'agentfarm.dismissSession'
    ];
    FULL.forEach(c => ok('afSessionRow menu has ' + c, onRow(c)));
    // both ways of picking a session back up, everywhere a session is listed
    ok('Timeline cards can also resume in a terminal',
        web.some(m => m.command === 'agentfarm.resumeSession'
            && m.when === "webviewSection == 'afTimelineSession'"));
}

// ---------- part 9: the other session surfaces publish the contract too ----------
{
    const read = f => fs.readFileSync(path.resolve(__dirname, '../media/' + f), 'utf8');
    ['turns.js', 'search.js', 'missions.js'].forEach(f =>
        ok(f + ' rows carry the session contract', /AFSessionCtx\.row\(/.test(read(f))));
    // one implementation, not five copies of the escaping
    ['console.js', 'timeline.js', 'sessionsTable.js'].forEach(f =>
        ok(f + ' uses the shared helper, not its own escaper',
            /AFSessionCtx\./.test(read(f)) && !/JSON\.stringify\(o\)\s*\n?\s*\.replace/.test(read(f))));
    // and it ships to every page — the shell and the test loader agree
    ok('afSessionCtx.js is loaded by the shared shell',
        /afSessionCtx\.js/.test(fs.readFileSync(path.resolve(__dirname, '../src/panels/base.ts'), 'utf8')));
    ok('the test shared-media list still matches htmlShell', shared.matchesShell());
}

// ---------- part 10: multi-select, and what it hands the right-click menu ----------
// ‼️ The selection does not get an action bar of its own. The row's menu is
// already the whole session action set; the selection rides ALONG on the row's
// `data-vscode-context`, so every one of those commands becomes a bulk command
// with no new message and nothing for a host that embeds this table to answer.
{
    posted = []; state = {};
    const t = sandbox.window.AFSessionsTable.create({
        vscode: vscodeStub, C, containerId: 'multi',
        columns: ['title', 'when', 'cost'], stateKey: 'multi'
    });
    const rows = [mkRow(1), mkRow(2), mkRow(3), mkRow(4)];
    t.setRows(rows, 0);
    const html = () => containers.multi.innerHTML;
    const boxes = () => containers.multi.querySelectorAll('[data-sel]');
    const pick = (file, shift) => {
        const el = boxes().find(b => b.dataset.sel === file);
        el.checked = true;
        el._fn({ stopPropagation() { }, shiftKey: !!shift });
    };
    const ctxOf = file => {
        const at = html().indexOf(`data-session="${file}"`);
        const tag = html().slice(at, html().indexOf('>', at));
        const m = /data-vscode-context="([^"]*)"/.exec(tag);
        return m ? JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&amp;/g, '&')) : null;
    };

    ok('every row carries a selection box', boxes().length === 4);
    ok('nothing is selected to begin with', !/class="af-selbar"/.test(html()));
    ok('an unselected row\'s menu is about that row alone', !ctxOf('f1').afSelectedSessions);

    pick('f1');
    ok('picking one shows the bar and counts it', /class="af-selbar"/.test(html()) && /<b>1<\/b> selected/.test(html()));
    ok('…and that row now hands the menu the selection',
        ctxOf('f1').afSelectedSessions.join() === 'sid1');
    ok('…while a row outside the selection still does not',
        !ctxOf('f3').afSelectedSessions);

    // ‼️ shift extends over what is ON SCREEN, in the order the reader sees
    pick('f3', true);
    ok('shift-click takes the whole range, not just the two ends',
        ctxOf('f2').afSelectedSessions.join() === 'sid1,sid2,sid3');
    ok('the bar counts the range', /<b>3<\/b> selected/.test(html()));
    ok('the transcript paths travel too — a session with no id yet is still in it',
        ctxOf('f2').afSelectedFiles.join() === 'f1,f2,f3');

    // select-all covers what is listed, then clears
    containers.multi.querySelector('.af-selall')._fn({ stopPropagation() { } });
    ok('select-all takes every listed row', ctxOf('f4').afSelectedSessions.length === 4);
    containers.multi.querySelector('.af-selall')._fn({ stopPropagation() { } });
    ok('…and pressing it again clears them', !/class="af-selbar"/.test(html()));

    // ‼️ a selection must not outlive the row it points at
    pick('f1'); pick('f2');
    t.setRows([mkRow(2), mkRow(3)], 0);
    ok('a row that left the pool leaves the selection with it',
        /<b>1<\/b> selected/.test(html()) && ctxOf('f2').afSelectedSessions.join() === 'sid2');

    // the checkbox must not open the transcript underneath it
    ok('selecting posts nothing — it is not a navigation',
        !posted.some(p => p.type === 'openSession'));
}

// ---------- part: the declared column widths ----------
//
// ‼️ THE TABLE USED TO BE LAID OUT BY WHATEVER WAS IN IT. `table-layout: auto`
// makes every column's width a function of the listed CONTENT, so the very same
// component rendered the same column at a different width on the Dashboard
// (20 rows) and on the Sessions page (200 rows) — measured in headless Chromium
// at a 1314px table: Title 462px against 457px, Cost 41px against 48px. Nobody
// chose that. These assertions are about the choice that replaced it.
{
    const DASH = ['origin', 'agent', 'project', 'title', 'when', 'duration', 'turns',
        'tools', 'files', 'errors', 'tokens', 'ctx', 'cost'];
    const mk = (id, cols, n) => {
        const t = sandbox.window.AFSessionsTable.create({
            vscode: vscodeStub, C, containerId: id, columns: cols, stateKey: id
        });
        t.setRows([mkRow(1, { project: 'P' }), mkRow(2, { project: '' })], n);
        return containers[id].innerHTML;
    };
    const colgroup = html => (/<colgroup>[\s\S]*?<\/colgroup>/.exec(html) || [''])[0];
    const widths = html => (colgroup(html).match(/width:([^"]+)"/g) || [])
        .map(s => s.replace(/width:|"/g, ''));

    const dash = mk('wdash', DASH, 20);
    const page = mk('wpage', DASH, 200);
    ok('the layout is declared, not inferred', /table class="sesstable"/.test(dash));
    ok('…and every column has a width', widths(dash).length === DASH.length + 3);
    // THE point of the exercise: the Dashboard's table and the Sessions page's
    // table are the same table. Same columns in, same widths out — whatever the
    // row cap is, whatever happens to be listed.
    ok('‼️ the Dashboard and the Sessions page cannot disagree about a column',
        colgroup(dash) === colgroup(page));

    // The shares sum to the whole of what is left after the px columns —
    // a `<col>` percentage is resolved against that remainder, so anything
    // short of 100 would leave the browser distributing the rest by its own
    // rules and the declared proportions would stop being the real ones.
    const pcts = widths(dash).filter(w => w.endsWith('%')).map(parseFloat);
    ok('the shares are normalised to the space they divide',
        Math.abs(pcts.reduce((a, b) => a + b, 0) - 100) < 0.01);
    // …and they normalise again for a page that shows fewer columns, without
    // changing the proportion between the columns both pages do show.
    const agentPage = mk('wagent', ['origin', 'title', 'project', 'when', 'duration', 'turns',
        'tools', 'files', 'errors', 'tokens', 'ctx', 'cost'], 50);
    const share = (html, col, cols) => parseFloat(widths(html)[3 + cols.indexOf(col)]);
    const AGENT_COLS = ['origin', 'title', 'project', 'when', 'duration', 'turns',
        'tools', 'files', 'errors', 'tokens', 'ctx', 'cost'];
    ok('a page with fewer columns keeps the same proportions',
        Math.abs(share(dash, 'title', DASH) / share(dash, 'project', DASH)
            - share(agentPage, 'title', AGENT_COLS) / share(agentPage, 'project', AGENT_COLS)) < 0.01);

    // The one deliberate change to the measured baseline: Title gives up a
    // quarter of itself. It held 462px of the 1210px the px columns leave in a
    // 1314px table — 38.15% — and a quarter off that is 28.61%, which comes back
    // out of the browser as 346px (re-measured, same conditions).
    ok('‼️ Title is a quarter narrower than the layout it replaced',
        Math.abs(share(dash, 'title', DASH) - 28.61) < 0.1);

    // A glyph column is px, not a share: a share would make the checkbox column
    // grow with the monitor.
    ok('the glyph columns are fixed, not shares',
        /^<colgroup><col style="width:23px"><col style="width:32px"><col style="width:23px"><col style="width:26px">/
            .test(colgroup(dash)));

    // S-5: the grey dot in front of a project name meant nothing on a project
    // with no colour of its own — it was the panel border, on every row.
    ok('‼️ the project dot is drawn only where there is a colour to draw',
        !/<span class="af-pdot"/.test(mk('wnodot', ['project'], 5)));
    ok('…and it is drawn where there is', /<span class="af-pdot" style="background:#f00"/.test(
        (() => {
            const t = sandbox.window.AFSessionsTable.create({
                vscode: vscodeStub, C, containerId: 'wdot', columns: ['project'], stateKey: 'wdot'
            });
            t.setRows([mkRow(1, { project: 'P', projectColor: '#f00' })], 5);
            return containers.wdot.innerHTML;
        })()));
    // The words are the only part of a text cell allowed to shrink; the ⌨ and ⎋
    // buttons at the end of the line are controls, and a control that gets
    // clipped is not a control.
    ok('a text cell shrinks its words, not its buttons',
        /class="cellline"/.test(dash) && /class="ctext"/.test(dash));
}

// ---------- part: the agent page carries the Project column too (S-5) ----------
{
    const js = fs.readFileSync(path.resolve(__dirname, '../media/agentDetail.js'), 'utf8');
    ok('‼️ the agent page lists a session\'s project', /'title', 'project'/.test(js));
    const ts = fs.readFileSync(path.resolve(__dirname, '../src/panels/agentDetail.ts'), 'utf8');
    ok('…and the host actually resolves one', /agentProjects\?\(\)/.test(ts)
        && /projectStyle\?\.\(name\)/.test(ts));
    const ext = fs.readFileSync(path.resolve(__dirname, '../src/extension.ts'), 'utf8');
    const deps = ext.slice(ext.indexOf('const detailDeps = {'), ext.indexOf('const detailDeps = {') + 900);
    ok('…off the same project axis the other two pages use',
        /agentProjects: \(\) => agentProjectNames\(/.test(deps) && /projectStyle: /.test(deps));
}

// ---------- part 11: the host side of a bulk action ----------
{
    const ext = fs.readFileSync(path.resolve(__dirname, '../src/extension.ts'), 'utf8');
    ok('the host reads the selection off the context, under the contract\'s own key',
        /afSelectedSessions/.test(ext) && /afSelectedFiles/.test(ext));
    ok('a command with no selection still acts on the row that was clicked',
        /const one = sessionFromArg\(arg\);/.test(ext));
    // ‼️ The table sends ids AND paths, and they name the same sessions. Without
    // de-duplication every bulk action would run twice on every row — and "end
    // 12 sessions" would ask twenty-four times.
    ok('‼️ ids and paths naming the same session are collapsed to one',
        /if \(!s \|\| !mark \|\| seen\.has\(mark\)\) \{ continue; \}/.test(ext));
    const endCmd = ext.slice(ext.indexOf("registerCommand('agentfarm.endSession'"),
        ext.indexOf("registerCommand('agentfarm.endSession'") + 1600);
    ok('‼️ ending a whole selection asks first, and names the number',
        /showWarningMessage\(\s*`End \$\{list\.length\} sessions\?`/.test(endCmd)
        && /modal: true/.test(endCmd));
    const dismissCmd = ext.slice(ext.indexOf("registerCommand('agentfarm.dismissSession'"),
        ext.indexOf("registerCommand('agentfarm.dismissSession'") + 2600);
    ok('clearing a selection does not ask — it destroys nothing — but reports honestly',
        /cleared \$\{cleared\} of \$\{list\.length\}/.test(dismissCmd));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
