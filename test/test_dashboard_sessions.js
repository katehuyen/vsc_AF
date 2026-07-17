// Dashboard unified Sessions table: sessionRowPool (compiled TS) ships the union
// of per-criterion top-N rows with active flags; the webview sorts by the picked
// criterion (Recent default), marks active sessions, and folds each row open into
// a lazy-loaded per-turn breakdown with Expand all / Collapse all / Single-open.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// ---------- part 1: sessionRowPool — union of top-N per criterion, row shape ----------
{
    // let the compiled panel load in plain node by mocking the 'vscode' import
    const Module = require('module');
    const origLoad = Module._load;
    Module._load = function (request) {
        if (request === 'vscode') {
            return { Uri: {}, window: {}, workspace: { getConfiguration: () => ({ get: (_k, d) => d }) }, ViewColumn: {}, ConfigurationTarget: {}, env: {} };
        }
        return origLoad.apply(this, arguments);
    };
    const { sessionRowPool, SESSION_TABLE_N } = require(path.join(__dirname, '..', 'out', 'panels', 'dashboard.js'));
    Module._load = origLoad;

    const usage = i => ({ input: i, output: 0, cacheWrite: 0, cacheRead: 0 });
    // 30 sessions: recency and cost pull in OPPOSITE directions (newest = cheapest),
    // so the true top-12 of each criterion are disjoint-ish sets — the pool must
    // contain both. Turn counts (i === 15) and Ctx-now (i === 14) each pick yet
    // another champion that is mid-pack on every other criterion.
    const sessions = [];
    for (let i = 1; i <= 30; i++) {
        sessions.push({
            file: `f${i}`, agentName: 'dev', machine: i === 1 ? 'laptop' : undefined,
            sessionId: `sid${i}`, cwd: i === 1 ? 'D:/agents/dev' : undefined,
            title: `t${i}`, firstTs: 1000, lastTs: 1000 + i * 60000, mtime: 900,
            usage: usage(i), cost: 30 - i, isSidechain: false,
            toolCalls: i, errors: i === 2 ? 3 : 0,
            lastCtxTokens: i === 14 ? 180000 : 0,
            userTurns: i === 15 ? 99 : 1
        });
    }

    const pool = sessionRowPool(sessions, s => s.file === 'f30');
    const files = pool.map(r => r.file);
    ok('pool smaller than the full list', pool.length < 30 && pool.length >= SESSION_TABLE_N);
    ok('true top-cost sessions present (oldest/most expensive)', files.includes('f1') && files.includes('f12'));
    ok('true most-recent sessions present (newest/cheapest)', files.includes('f30') && files.includes('f19'));
    ok('turn-count champion present even though mid-pack otherwise', files.includes('f15'));
    ok('ctx-now champion present even though mid-pack otherwise', files.includes('f14'));
    ok('mid sessions outside every top-12 stay out', !files.includes('f13') && !files.includes('f16'));
    const r1 = pool.find(r => r.file === 'f1');
    ok('machine suffix kept', r1.agent === 'dev ⇄ laptop');
    // the ⌨ focus button needs the session's identity, not just the agent name
    ok('sessionId carried for terminal focus', r1.sessionId === 'sid1');
    ok('cwd carried (empty when unknown)', r1.cwd === 'D:/agents/dev' && pool.find(r => r.file === 'f30').cwd === '');
    ok('ctx carried from lastCtxTokens (0 when absent)',
        pool.find(r => r.file === 'f14').ctx === 180000 && r1.ctx === 0);
    ok('toolCalls/errors carried for the shared table',
        r1.toolCalls === 1 && pool.find(r => r.file === 'f2').errors === 3);

    // custom pool size: n=2 keeps only each criterion's true top-2 (agent page uses n=50)
    const small = sessionRowPool(sessions, undefined, 2).map(r => r.file);
    ok('custom n honored: top-2 of recency/cost/ctx present',
        small.includes('f30') && small.includes('f29') && small.includes('f1') && small.includes('f2') && small.includes('f14'));
    ok('custom n honored: mid rows stay out', !small.includes('f10') && small.length <= 12);
    ok('turns carried from userTurns', pool.find(r => r.file === 'f15').turns === 99);
    ok('active flag from callback', pool.find(r => r.file === 'f30').active === true && r1.active === false);
    ok('wire order is newest first', files[0] === 'f30');

    // no lastTs at all → recency key falls back to mtime
    const p2 = sessionRowPool([{ file: 'x', agentName: 'a', title: '', firstTs: 0, lastTs: 0, mtime: 777, usage: usage(0), cost: 0, isSidechain: false, userTurns: 0 }]);
    ok('missing lastTs falls back to mtime for ts', p2[0].ts === 777);
}

// ---------- part 1b: the viewer's turn table carries ts (the deep-link contract) ----------
{
    const Module = require('module');
    const origLoad = Module._load;
    Module._load = function (request) {
        if (request === 'vscode') {
            return { Uri: {}, window: {}, workspace: { getConfiguration: () => ({ get: (_k, d) => d }) }, ViewColumn: {}, ConfigurationTarget: {}, env: {} };
        }
        return origLoad.apply(this, arguments);
    };
    const viewer = require(path.join(__dirname, '..', 'out', 'panels', 'sessionViewer.js'));
    Module._load = origLoad;

    const t1 = '2026-07-15T10:00:00.000Z', t2 = '2026-07-15T10:05:00.000Z';
    const lines = [
        { type: 'user', timestamp: t1, message: { content: 'first ask' } },
        { type: 'assistant', timestamp: t1, message: { id: 'a1', model: 'claude-x', content: [{ type: 'text', text: 'hi' }], usage: { input_tokens: 10, output_tokens: 5 } } },
        { type: 'user', timestamp: t2, message: { content: 'second ask' } },
        { type: 'assistant', timestamp: t2, message: { id: 'a2', model: 'claude-x', content: [{ type: 'text', text: 'yo' }], usage: { input_tokens: 20, output_tokens: 1 } } }
    ].map(l => JSON.stringify(l)).join('\n');
    const tmp = path.join(require('os').tmpdir(), `af-turnts-${Date.now()}.jsonl`);
    fs.writeFileSync(tmp, lines);
    const data = viewer.buildData(tmp, {
        extensionUri: {}, getPricing: () => ({ costFor: () => 0.5 }),
        maxMessages: () => 1, contextLimitFor: () => 0
    });
    fs.unlinkSync(tmp);

    ok('turn table exposes each turn opening timestamp', data.turns.length === 2
        && data.turns[0].ts === Date.parse(t1) && data.turns[1].ts === Date.parse(t2));
    ok('turn table still carries label/tokens/cost', data.turns[0].label === 'first ask' && data.turns[0].tokens === 15 && data.turns[0].cost === 0.5);
    ok('turns are computed before the maxMessages cut', data.messages.length === 1 && data.turnCount === 2);
}

// ---------- part 2: webview — dashboard drives the shared sessions table ----------
// The table itself (sorting, accordion, single-open, ⌨) is covered in depth by
// test_sessions_table.js; here we prove the dashboard page loads the component
// with its rows/columns and routes its messages both ways.
{
    const headerCode = fs.readFileSync(path.resolve(__dirname, '../media/pageHeader.js'), 'utf8');
    const sessCode = fs.readFileSync(path.resolve(__dirname, '../media/sessionsTable.js'), 'utf8');
    const code = fs.readFileSync(path.resolve(__dirname, '../media/dashboard.js'), 'utf8');
    let posted = [];
    let lastHtml = '';
    let msgHandler = null;
    let savedState = null;
    let stopped = 0;
    const evStub = { stopPropagation() { stopped++; } };

    // elements with regex-backed selector queries so the shared component can
    // wire itself against its container ('sessblock') like on the real page
    const els = {};
    function getEl(id) {
        if (!els[id]) {
            els[id] = {
                id, listeners: {}, style: {}, value: '', _html: '', _sel: {},
                addEventListener(ev, fn) { this.listeners[ev] = fn; },
                set innerHTML(v) { if (id === 'app') { lastHtml = v; } this._html = v; this._sel = {}; },
                get innerHTML() { return this._html; },
                querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
                querySelectorAll(sel) {
                    if (this._sel[sel]) { return this._sel[sel]; }
                    const mk = ds => { const e = { dataset: ds }; e.addEventListener = (_t, fn) => { e._click = fn; }; return e; };
                    const list = [];
                    const grab = (re, map) => { let m; while ((m = re.exec(this._html))) { list.push(mk(map(m))); } };
                    if (['.af-sort', '.af-expand', '.af-collapse', '.af-single'].includes(sel)) {
                        if (this._html.includes(sel.slice(1))) { list.push(mk({})); }
                    } else if (sel === '[data-session]') { grab(/data-session="([^"]*)"/g, m => ({ session: m[1] })); }
                    else if (sel === '[data-fold]') { grab(/data-fold="([^"]*)"/g, m => ({ fold: m[1] })); }
                    else if (sel === '[data-term]') { grab(/data-term="([^"]*)" data-sid="([^"]*)" data-cwd="([^"]*)"/g, m => ({ term: m[1], sid: m[2], cwd: m[3] })); }
                    else if (sel === '[data-turnjump]') { grab(/data-turnjump="([^"]*)" data-turnts="([^"]*)"/g, m => ({ turnjump: m[1], turnts: m[2] })); }
                    this._sel[sel] = list;
                    return list;
                }
            };
        }
        return els[id];
    }
    const sess = () => getEl('sessblock');
    const sessHtml = () => sess()._html;
    const clickFold = (file) => sess().querySelectorAll('[data-fold]').find(e => e.dataset.fold === file)._click(evStub);

    const now = Date.now();
    const rows = [
        { file: 'new.jsonl', agent: 'dev', agentName: 'dev', sessionId: 's-new', cwd: 'D:/a/dev', title: 'newest cheap', ts: now, durationMin: 1, turns: 2, toolCalls: 4, errors: 0, tokens: 5, ctx: 0, cost: 0.1, sidechain: false, active: true },
        { file: 'mid.jsonl', agent: 'ops', agentName: 'ops', sessionId: 's-mid', cwd: '', title: 'middle', ts: now - 60000, durationMin: 9, turns: 40, toolCalls: 1, errors: 0, tokens: 50, ctx: 155000, cost: 1, sidechain: false, active: false },
        { file: 'old.jsonl', agent: 'dev', agentName: 'dev', sessionId: 's-old', cwd: '', title: 'old expensive', ts: now - 120000, durationMin: 3, turns: 5, toolCalls: 9, errors: 2, tokens: 999, ctx: 0, cost: 42, sidechain: false, active: false }
    ];
    const sandbox = {
        acquireVsCodeApi: () => ({
            postMessage: (m) => posted.push(m),
            getState: () => savedState,
            setState: (s) => { savedState = s; }
        }),
        window: {
            AFCharts: {
                esc: (s) => String(s === undefined || s === null ? '' : s), fmtTok: (n) => String(n || 0), fmtUSD: (n) => '$' + (n || 0),
                stackedBars: () => '', donut: () => '', hbars: () => '', heatmap: () => '', sparkline: () => ''
            },
            __DATA__: {
                generatedAt: now, today: '2026-07-15', agents: [],
                modelTotals: {}, tokenTypes: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 },
                heat: new Array(168).fill(0),
                sessionRows: rows, sessionTableN: 12,
                window: { tokens: 0, msgs: 0, cost: 0, limit: 0 },
                fleetBudget: 0, mediaCost: { today: 0, month: 0 },
                insightTotals: { error: 0, warning: 0, info: 0 },
                unknownModels: [], farmStatus: [], externalSessions: {}
            },
            addEventListener: (ev, fn) => { if (ev === 'message') { msgHandler = fn; } }
        },
        document: {
            getElementById: getEl,
            querySelectorAll: () => []
        },
        setInterval: () => 0, console
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(headerCode, sandbox); // htmlShell loads the shared components first
    vm.runInContext(sessCode, sandbox);
    vm.runInContext(code, sandbox);       // runs render() once

    const order = () => ['new.jsonl', 'mid.jsonl', 'old.jsonl']
        .map(f => [f, sessHtml().indexOf(`data-session="${f}"`)])
        .sort((a, b) => a[1] - b[1]).map(x => x[0]);

    ok('page hosts the sessions container', lastHtml.includes('<h2>Sessions</h2>') && lastHtml.includes('id="sessblock"'));
    ok('component rendered with sort select', sessHtml().includes('af-sort'));
    ok('full column set incl. Agent / Tools / Err / Ctx now',
        ['<th>Agent</th>', '>Tools</th>', '>Err</th>', '>Ctx now</th>'].every(h => sessHtml().includes(h)));
    ok('default sort is Recent (newest row first)', order().join(',') === 'new.jsonl,mid.jsonl,old.jsonl');
    ok('active session carries the green dot + ⌨', /dot on[^>]*><\/span> dev/.test(sessHtml()) && sessHtml().includes('data-sid="s-new"'));
    ok('ctx cell rendered (~ known, — unknown)', sessHtml().includes('~155000') && sessHtml().includes('>—</td>'));
    ok('every row folds', sess().querySelectorAll('[data-fold]').length === 3);
    ok('session rows are tinted apart from nested turn content',
        sessHtml().split('class="click sessrow"').length - 1 === 3 && sessHtml().includes('tr.sessrow > td { background:'));

    // sort criteria drive the order; ctx is a first-class criterion
    sess().querySelector('.af-sort')._click({ target: { value: 'cost' } });
    ok('cost sort puts the expensive session on top', order()[0] === 'old.jsonl');
    ok('sort choice persisted', savedState && savedState.afSess && savedState.afSess.dash.sort === 'cost');
    sess().querySelector('.af-sort')._click({ target: { value: 'ctx' } });
    ok('ctx sort puts the fullest context on top', order()[0] === 'mid.jsonl');
    sess().querySelector('.af-sort')._click({ target: { value: 'recent' } });

    // fold → host request → loading → the host's reply lands via the page's
    // message handler (the dashboard delegates to the component)
    posted = [];
    clickFold('old.jsonl');
    ok('fold click requests the turn breakdown', posted.length === 1 && posted[0].type === 'sessionTurns' && posted[0].file === 'old.jsonl');
    ok('open row shows loading state', sessHtml().includes('Loading turns…') && sessHtml().includes('class="sessturns"'));
    msgHandler({ data: { type: 'sessionTurns', file: 'old.jsonl', turns: [{ n: 1, label: 'first ask', ts: 111, tokens: 700, cost: 30 }, { n: 2, label: 'second ask', ts: 222, tokens: 299, cost: 12 }] } });
    ok('turn breakdown rendered with label + cost', sessHtml().includes('first ask') && sessHtml().includes('$30') && sessHtml().includes('second ask'));

    // turn row → open the transcript AT that turn (viewer reveals + scrolls)
    posted = [];
    const before = stopped;
    sess().querySelectorAll('[data-turnjump]').find(e => e.dataset.turnts === '222')._click(evStub);
    ok('turn row click posts openSession with the turn timestamp',
        posted.length === 1 && posted[0].type === 'openSession' && posted[0].file === 'old.jsonl' && posted[0].ts === 222);
    ok('…and does not also trigger the session row underneath', stopped === before + 1);

    // ⌨ posts the exact session identity
    posted = [];
    sess().querySelectorAll('[data-term]')[0]._click(evStub);
    ok('⌨ posts sessionId for the exact terminal',
        posted.length === 1 && posted[0].type === 'focusTerminal' && posted[0].sessionId === 's-new' && posted[0].cwd === 'D:/a/dev');

    // a data refresh re-feeds the component (rows survive the full re-render)
    msgHandler({ data: { type: 'data', data: sandbox.window.__DATA__ } });
    ok('data refresh re-renders the table', sess().querySelectorAll('[data-fold]').length === 3);
}

// ---------- part 3: agentWindowTotals — hour-exact vs day-granularity ----------
{
    const { agentWindowTotals } = require(path.join(__dirname, '..', 'out', 'panels', 'dashboard.js'));
    const now = Date.now();
    const u = t => ({ input: t, output: 0, cacheWrite: 0, cacheRead: 0 });
    const dayKey = ts => {
        const d = new Date(ts);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const sessions = [
        { // live-ish session: today's daily bucket + per-message log
            firstTs: now - 2 * 3600e3, lastTs: now - 300e3,
            daily: { [dayKey(now)]: { cost: 5, usage: u(5000), assistantMsgs: 9 } },
            recentMsgs: [
                { ts: now - 90 * 60e3, tokens: 1000, cost: 1 },
                { ts: now - 30 * 60e3, tokens: 200, cost: 0.5 }
            ]
        },
        { // old session, 9-10 days back — only daily buckets left
            firstTs: now - 10 * 86400e3, lastTs: now - 9 * 86400e3,
            daily: { [dayKey(now - 9.5 * 86400e3)]: { cost: 3, usage: u(3000), assistantMsgs: 4 } },
            recentMsgs: []
        }
    ];
    const hour = agentWindowTotals(sessions, now - 3600e3, now, now);
    ok('1h window is hour-exact from the message log',
        hour.exact === true && hour.tokens === 200 && hour.cost === 0.5 && hour.msgs === 1);
    ok('1h window counts only overlapping sessions', hour.sessions === 1);
    const twoW = agentWindowTotals(sessions, now - 14 * 86400e3, now, now);
    ok('2w window sums daily buckets at day granularity',
        twoW.exact === false && twoW.tokens === 8000 && twoW.msgs === 13 && twoW.sessions === 2);
    const oldOnly = agentWindowTotals(sessions, now - 14 * 86400e3, now - 5 * 86400e3, now);
    ok('a bounded old window keeps only its own days and sessions',
        oldOnly.exact === false && oldOnly.tokens === 3000 && oldOnly.sessions === 1);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
