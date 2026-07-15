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
    // contain both. Turn counts pick yet another champion (i === 15).
    const sessions = [];
    for (let i = 1; i <= 30; i++) {
        sessions.push({
            file: `f${i}`, agentName: 'dev', machine: i === 1 ? 'laptop' : undefined,
            title: `t${i}`, firstTs: 1000, lastTs: 1000 + i * 60000, mtime: 900,
            usage: usage(i), cost: 30 - i, isSidechain: false,
            userTurns: i === 15 ? 99 : 1
        });
    }

    const pool = sessionRowPool(sessions, s => s.file === 'f30');
    const files = pool.map(r => r.file);
    ok('pool smaller than the full list', pool.length < 30 && pool.length >= SESSION_TABLE_N);
    ok('true top-cost sessions present (oldest/most expensive)', files.includes('f1') && files.includes('f12'));
    ok('true most-recent sessions present (newest/cheapest)', files.includes('f30') && files.includes('f19'));
    ok('turn-count champion present even though mid-pack otherwise', files.includes('f15'));
    ok('mid sessions outside every top-12 stay out', !files.includes('f13') && !files.includes('f14'));
    const r1 = pool.find(r => r.file === 'f1');
    ok('machine suffix kept', r1.agent === 'dev ⇄ laptop');
    ok('turns carried from userTurns', pool.find(r => r.file === 'f15').turns === 99);
    ok('active flag from callback', pool.find(r => r.file === 'f30').active === true && r1.active === false);
    ok('wire order is newest first', files[0] === 'f30');

    // no lastTs at all → recency key falls back to mtime
    const p2 = sessionRowPool([{ file: 'x', agentName: 'a', title: '', firstTs: 0, lastTs: 0, mtime: 777, usage: usage(0), cost: 0, isSidechain: false, userTurns: 0 }]);
    ok('missing lastTs falls back to mtime for ts', p2[0].ts === 777);
}

// ---------- part 2: webview — sort select, active dot, turn accordion ----------
{
    const code = fs.readFileSync(path.resolve(__dirname, '../media/dashboard.js'), 'utf8');
    let posted = [];
    let lastHtml = '';
    let msgHandler = null;
    let savedState = null;
    const els = {};
    function getEl(id) {
        if (!els[id]) {
            els[id] = {
                id, listeners: {}, style: {}, value: '', _html: '',
                addEventListener(ev, fn) { this.listeners[ev] = fn; },
                set innerHTML(v) { if (id === 'app') { lastHtml = v; } this._html = v; },
                get innerHTML() { return this._html; }
            };
        }
        return els[id];
    }

    let foldEls = [];
    function elsForSelector(sel) {
        if (sel !== '[data-fold]') { return []; }
        const list = [];
        const re = /data-fold="([^"]*)"/g;
        let m;
        while ((m = re.exec(lastHtml))) {
            const el = { dataset: { fold: m[1] } };
            el.addEventListener = (_e, fn) => { el._click = fn; };
            list.push(el);
        }
        foldEls = list;
        return list;
    }
    const evStub = { stopPropagation() { } };
    const clickFold = (file) => foldEls.find(e => e.dataset.fold === file)._click(evStub);

    const now = Date.now();
    const rows = [
        { file: 'new.jsonl', agent: 'dev', title: 'newest cheap', ts: now, durationMin: 1, turns: 2, tokens: 5, cost: 0.1, sidechain: false, active: true },
        { file: 'mid.jsonl', agent: 'ops', title: 'middle', ts: now - 60000, durationMin: 9, turns: 40, tokens: 50, cost: 1, sidechain: false, active: false },
        { file: 'old.jsonl', agent: 'dev', title: 'old expensive', ts: now - 120000, durationMin: 3, turns: 5, tokens: 999, cost: 42, sidechain: false, active: false }
    ];
    const sandbox = {
        acquireVsCodeApi: () => ({
            postMessage: (m) => posted.push(m),
            getState: () => savedState,
            setState: (s) => { savedState = s; }
        }),
        window: {
            AFCharts: {
                esc: (s) => String(s), fmtTok: (n) => String(n || 0), fmtUSD: (n) => '$' + (n || 0),
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
            querySelectorAll: elsForSelector
        },
        setInterval: () => 0, console
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox); // runs render() once

    const order = () => ['new.jsonl', 'mid.jsonl', 'old.jsonl']
        .map(f => [f, lastHtml.indexOf(`data-session="${f}"`)])
        .sort((a, b) => a[1] - b[1]).map(x => x[0]);

    ok('single Sessions table with sort select', lastHtml.includes('<h2>Sessions</h2>') && lastHtml.includes('id="sesssort"') && !lastHtml.includes('Top sessions by cost'));
    ok('default sort is Recent (newest row first)', order().join(',') === 'new.jsonl,mid.jsonl,old.jsonl');
    ok('active session carries the green dot', /dot on[^>]*><\/span> dev/.test(lastHtml) && lastHtml.split('dot on').length - 1 === 1);
    ok('turns column rendered', lastHtml.includes('<th class="num">Turns</th>') && lastHtml.includes('<td class="num">40</td>'));
    ok('every row folds', foldEls.length === 3);

    // sort by cost → most expensive first; by turns → mid first
    getEl('sesssort').listeners.change({ target: { value: 'cost' } });
    ok('cost sort puts the expensive session on top', order()[0] === 'old.jsonl');
    ok('sort choice persisted', savedState && savedState.sessSort === 'cost');
    getEl('sesssort').listeners.change({ target: { value: 'turns' } });
    ok('turn-count sort puts the 40-turn session on top', order()[0] === 'mid.jsonl');
    getEl('sesssort').listeners.change({ target: { value: 'recent' } });

    // fold open → asks host for turns, shows loading, then renders the mini table
    posted = [];
    clickFold('old.jsonl');
    ok('fold click requests the turn breakdown', posted.length === 1 && posted[0].type === 'sessionTurns' && posted[0].file === 'old.jsonl');
    ok('open row shows loading state', lastHtml.includes('Loading turns…') && lastHtml.includes('class="sessturns"'));
    msgHandler({ data: { type: 'sessionTurns', file: 'old.jsonl', turns: [{ n: 1, label: 'first ask', tokens: 700, cost: 30 }, { n: 2, label: 'second ask', tokens: 299, cost: 12 }] } });
    ok('turn breakdown rendered with label + cost', lastHtml.includes('first ask') && lastHtml.includes('$30') && lastHtml.includes('second ask'));
    posted = [];
    clickFold('new.jsonl');
    ok('second fold stays open alongside (multi mode)', lastHtml.split('class="sessturns"').length - 1 === 2);
    ok('fresh cache is not re-requested on re-render', posted.filter(p => p.type === 'sessionTurns' && p.file === 'old.jsonl').length === 0);

    // single-open: entering keeps only the first open row; next fold swaps
    getEl('s-singleopen').listeners.click();
    ok('single-open keeps one panel', lastHtml.split('class="sessturns"').length - 1 === 1);
    ok('single-open persisted', savedState && savedState.sessSingle === true);
    clickFold('mid.jsonl');
    ok('unfolding another session folds the previous one', lastHtml.split('class="sessturns"').length - 1 === 1 && /data-session="mid\.jsonl"[\s\S]*class="sessturns"/.test(lastHtml));

    // expand all / collapse all
    getEl('s-expandall').listeners.click();
    ok('expand all opens every row', lastHtml.split('class="sessturns"').length - 1 === 3);
    getEl('s-collapseall').listeners.click();
    ok('collapse all closes every row', lastHtml.indexOf('class="sessturns"') === -1);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
