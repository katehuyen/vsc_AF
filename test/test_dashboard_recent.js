// Dashboard "Recent sessions" table: pickSessionRows (compiled TS) produces the
// top-by-cost and most-recent lists with one shared row shape, and the dashboard
// webview renders both tables with clickable rows.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// ---------- part 1: pickSessionRows ordering, cap, shape ----------
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
    const { pickSessionRows } = require(path.join(__dirname, '..', 'out', 'panels', 'dashboard.js'));
    Module._load = origLoad;

    const usage = i => ({ input: i, output: 0, cacheWrite: 0, cacheRead: 0 });
    const sessions = [];
    for (let i = 1; i <= 13; i++) {
        sessions.push({
            file: `f${i}`, agentName: 'dev', machine: i === 1 ? 'laptop' : undefined,
            title: `t${i}`, firstTs: 1000, lastTs: 1000 + i * 60000, mtime: 500,
            usage: usage(i), cost: 13 - i, isSidechain: false
        });
    }
    // no lastTs at all → recency must fall back to mtime
    sessions.push({
        file: 'f14', agentName: 'ops', title: 'fresh', firstTs: 0, lastTs: 0,
        mtime: 99999999999, usage: usage(0), cost: 0, isSidechain: true
    });

    const { topSessions, recentSessions } = pickSessionRows(sessions);
    ok('top capped at 12', topSessions.length === 12);
    ok('top sorted by cost desc', topSessions[0].file === 'f1' && topSessions[0].cost === 12 && topSessions[11].file === 'f12');
    ok('machine suffix kept', topSessions[0].agent === 'dev ⇄ laptop');
    ok('durationMin computed', topSessions.find(r => r.file === 'f2').durationMin === 2);
    ok('recent capped at 12', recentSessions.length === 12);
    ok('recent sorted by last activity desc', recentSessions[1].file === 'f13' && recentSessions[11].file === 'f3');
    ok('missing lastTs falls back to mtime', recentSessions[0].file === 'f14');
    ok('sidechain flag carried', recentSessions[0].sidechain === true);
    ok('both lists share one row shape',
        JSON.stringify(Object.keys(topSessions[0])) === JSON.stringify(Object.keys(recentSessions[0])));
}

// ---------- part 2: dashboard webview renders both tables ----------
{
    const code = fs.readFileSync(path.resolve(__dirname, '../media/dashboard.js'), 'utf8');
    let posted = [];
    let lastHtml = '';
    const appEl = { set innerHTML(v) { lastHtml = v; }, get innerHTML() { return lastHtml; } };
    const stubEl = { addEventListener() { } };

    let sessionRowEls = []; // captured from the render-time querySelectorAll call
    function rowsForSelector(sel) {
        if (sel !== '[data-session]') { return []; }
        const els = [];
        const re = /data-session="([^"]*)"/g;
        let m;
        while ((m = re.exec(lastHtml))) {
            const el = { dataset: { session: m[1] } };
            el.addEventListener = (_e, fn) => { el._click = fn; };
            els.push(el);
        }
        sessionRowEls = els;
        return els;
    }

    const sandbox = {
        acquireVsCodeApi: () => ({ postMessage: (m) => posted.push(m), getState() { }, setState() { } }),
        window: {
            AFCharts: {
                esc: (s) => String(s), fmtTok: (n) => String(n || 0), fmtUSD: (n) => '$' + (n || 0),
                stackedBars: () => '', donut: () => '', hbars: () => '', heatmap: () => '', sparkline: () => ''
            },
            __DATA__: {
                generatedAt: Date.now(), today: '2026-07-15', agents: [],
                modelTotals: {}, tokenTypes: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 },
                heat: new Array(168).fill(0),
                topSessions: [{ file: 'a.jsonl', agent: 'dev', title: 'expensive', ts: Date.now(), durationMin: 5, tokens: 10, cost: 9, sidechain: false }],
                recentSessions: [{ file: 'b.jsonl', agent: 'ops', title: 'fresh one', ts: Date.now(), durationMin: 1, tokens: 2, cost: 0.1, sidechain: false }],
                window: { tokens: 0, msgs: 0, cost: 0, limit: 0 },
                fleetBudget: 0, mediaCost: { today: 0, month: 0 },
                insightTotals: { error: 0, warning: 0, info: 0 },
                unknownModels: [], farmStatus: [], externalSessions: {}
            },
            addEventListener() { }
        },
        document: {
            getElementById: (id) => id === 'app' ? appEl : stubEl,
            querySelectorAll: rowsForSelector
        },
        setInterval: () => 0, console
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox); // runs render() once

    const iTop = lastHtml.indexOf('Top sessions by cost');
    const iRecent = lastHtml.indexOf('Recent sessions');
    ok('both headings rendered, Recent below Top', iTop !== -1 && iRecent !== -1 && iRecent > iTop);
    ok('recent table holds its row', lastHtml.indexOf('fresh one') > iRecent);
    ok('top table holds its row before Recent', lastHtml.indexOf('expensive') > iTop && lastHtml.indexOf('expensive') < iRecent);
    ok('two session-table headers rendered', lastHtml.split('<th class="num">When</th>').length - 1 === 2);

    const rows = sessionRowEls;
    ok('both rows are click targets', rows.length === 2);
    posted = [];
    rows.find(r => r.dataset.session === 'b.jsonl')._click();
    ok('recent row click opens its session', posted.length === 1 && posted[0].type === 'openSession' && posted[0].file === 'b.jsonl');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
