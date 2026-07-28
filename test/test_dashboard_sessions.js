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
    // Show box "All" (n=0) and any n covering the list ship every session
    ok('n=0 ships every session (Show → All)', sessionRowPool(sessions, undefined, 0).length === 30);
    ok('n beyond the list ships every session', sessionRowPool(sessions, undefined, 500).length === 30);
    ok('turns carried from userTurns', pool.find(r => r.file === 'f15').turns === 99);
    ok('active flag from callback', pool.find(r => r.file === 'f30').active === true && r1.active === false);
    ok('wire order is newest first', files[0] === 'f30');

    // no lastTs at all → recency key falls back to mtime
    const p2 = sessionRowPool([{ file: 'x', agentName: 'a', title: '', firstTs: 0, lastTs: 0, mtime: 777, usage: usage(0), cost: 0, isSidechain: false, userTurns: 0 }]);
    ok('missing lastTs falls back to mtime for ts', p2[0].ts === 777);
}

// ---------- part 1a: origin — 🧑 your dialogs vs 🤖 automation runs ----------
{
    const Module = require('module');
    const origLoad = Module._load;
    Module._load = function (request) {
        if (request === 'vscode') {
            return { Uri: {}, window: {}, workspace: { getConfiguration: () => ({ get: (_k, d) => d }) }, ViewColumn: {}, ConfigurationTarget: {}, env: {} };
        }
        return origLoad.apply(this, arguments);
    };
    const { sessionRowPool } = require(path.join(__dirname, '..', 'out', 'panels', 'dashboard.js'));
    const { sessionOrigin } = require(path.join(__dirname, '..', 'out', 'core', 'sessions.js'));
    Module._load = origLoad;

    // the entrypoint the transcript itself recorded is the ONLY signal
    ok('sdk-cli (claude -p / SDK) reads as automation', sessionOrigin({ entrypoint: 'sdk-cli' }) === 'auto');
    ok('an interactive terminal reads as user', sessionOrigin({ entrypoint: 'cli' }) === 'user');
    ok('the desktop app reads as user', sessionOrigin({ entrypoint: 'claude-desktop' }) === 'user');
    ok('a future sdk-* entrypoint still reads as automation', sessionOrigin({ entrypoint: 'sdk-ts' }) === 'auto');
    ok('unknown/absent entrypoint reads as user (never hide a real dialog)',
        sessionOrigin({}) === 'user' && sessionOrigin({ entrypoint: '' }) === 'user');
    // The Console is a person typing, over the very channel a headless run
    // uses. Reading only the entrypoint filed every conversation held in the
    // panel as automation — and the tables, which default to the User scope,
    // showed no sign it had ever happened.
    ok('a session the Console hosted is a person talking, whatever the entrypoint says',
        sessionOrigin({ entrypoint: 'sdk-cli', consoleHosted: true }) === 'user');
    ok('…and a headless run over the same channel is still automation',
        sessionOrigin({ entrypoint: 'sdk-cli', consoleHosted: false }) === 'auto');

    const usage = i => ({ input: i, output: 0, cacheWrite: 0, cacheRead: 0 });
    // 20 automation runs are the newest AND the most expensive; 3 user dialogs
    // sit far below them. A pool built over the mixed list would leave the
    // (default) User scope of the table nearly empty.
    const mixed = [];
    for (let i = 1; i <= 20; i++) {
        mixed.push({
            file: `a${i}`, agentName: 'dev', sessionId: `sa${i}`, title: `auto ${i}`,
            entrypoint: 'sdk-cli', firstTs: 5000, lastTs: 900000 + i * 1000, mtime: 0,
            usage: usage(500), cost: 100, isSidechain: false, toolCalls: 1, errors: 0, userTurns: 1
        });
    }
    for (let i = 1; i <= 3; i++) {
        mixed.push({
            file: `u${i}`, agentName: 'dev', sessionId: `su${i}`, title: `mine ${i}`,
            entrypoint: 'cli', firstTs: 1000, lastTs: 1000 + i, mtime: 0,
            usage: usage(1), cost: 1, isSidechain: false, toolCalls: 1, errors: 0, userTurns: 1
        });
    }
    const pool = sessionRowPool(mixed, undefined, 5);
    const files = pool.map(r => r.file);
    ok('origin carried on every row',
        pool.find(r => r.file === 'a1').origin === 'auto' && pool.find(r => r.file === 'u1').origin === 'user');
    ok('the user lane survives a pool dominated by automation',
        files.includes('u1') && files.includes('u2') && files.includes('u3'));
    ok('…and the automation lane keeps its own top-N',
        files.includes('a20') && files.includes('a19'));
    ok('the union stays a shortcut, not the whole list', pool.length < mixed.length);
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
    ok('a transcript with no entrypoint opens as your own session', data.origin === 'user');

    // the viewer states the origin too — an sdk-cli transcript is an automation run
    const autoTmp = path.join(require('os').tmpdir(), `af-origin-${Date.now()}.jsonl`);
    fs.writeFileSync(autoTmp, JSON.stringify({
        type: 'user', timestamp: t1, entrypoint: 'sdk-cli', message: { content: 'scheduled sweep' }
    }));
    const autoData = viewer.buildData(autoTmp, {
        extensionUri: {}, getPricing: () => ({ costFor: () => 0 }), maxMessages: () => 5, contextLimitFor: () => 0
    });
    fs.unlinkSync(autoTmp);
    ok('an sdk-cli transcript opens as an automation run', autoData.origin === 'auto');

    // ---- "Context now" survives a synthetic last row (see core/pricing.ts) ----
    // Measured on a real transcript: the last assistant row was a synthetic one
    // with an all-zero usage block, so the card read "—" on a session whose
    // window actually held 78 512 tokens.
    const ctxTmp = path.join(require('os').tmpdir(), `af-ctxzero-${Date.now()}.jsonl`);
    fs.writeFileSync(ctxTmp, [
        { type: 'assistant', timestamp: t1, message: { id: 'c1', model: 'claude-x', content: [{ type: 'text', text: 'a' }], usage: { input_tokens: 12, cache_read_input_tokens: 78500, output_tokens: 0 } } },
        { type: 'assistant', timestamp: t2, message: { id: 'c2', model: '<synthetic>', content: [{ type: 'text', text: 'interrupted' }], usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }
    ].map(l => JSON.stringify(l)).join('\n'));
    const ctxData = viewer.buildData(ctxTmp, {
        extensionUri: {}, getPricing: () => ({ costFor: () => 0 }), maxMessages: () => 5, contextLimitFor: () => 200000
    });
    fs.unlinkSync(ctxTmp);
    ok('the transcript page keeps the last REAL context, not the synthetic zero',
        ctxData.context.tokens === 78512);

    // ---- the /context breakdown captured from a system/local_command line ----
    // Claude Code records `/context` as an ANSI-colored gauge; buildData strips the
    // ANSI + glyph column and reads the labelled category rows on the right.
    const cx1 = '2026-07-15T11:00:00.000Z', cx2 = '2026-07-15T11:30:00.000Z';
    const esc = String.fromCharCode(27); // real ANSI escape (\u001b) — buildData must strip these
    const ctxContent = '<local-command-stdout> ' + esc + '[1mContext Usage' + esc + '[22m\n'
        + esc + '[38;2;153;153;153m⛁ ⛁ ⛁' + esc + '[39m   Sonnet 5\n'
        + '⛶ ⛶ ⛶   84.7k/967k tokens (9%)\n'
        + 'Estimated usage by category\n'
        + esc + '[38;2;136;136;136m⛁' + esc + '[39m System prompt: 9.4k tokens (1.0%)\n'
        + '⛁ MCP tools: 2.6k tokens (0.3%)\n'
        + '⛁ Memory files: 23.4k tokens (2.4%)\n'
        + '⛶ Free space: 849.3k (87.8%)\n'
        + '⛝ Autocompact buffer: 33k tokens (3.4%)\n'
        + 'Auto-compact window: 967k tokens\n'
        + '</local-command-stdout>';
    // Two snapshots — the LATEST one must win.
    const ctxLines = [
        { type: 'user', timestamp: cx1, message: { content: 'ask' } },
        { type: 'system', subtype: 'local_command', timestamp: cx1,
            content: ctxContent.replace('84.7k/967k tokens (9%)', '10k/967k tokens (1%)') },
        { type: 'system', subtype: 'local_command', timestamp: cx2, content: ctxContent }
    ].map(l => JSON.stringify(l)).join('\n');
    const tmp2 = path.join(require('os').tmpdir(), `af-ctx-${Date.now()}.jsonl`);
    fs.writeFileSync(tmp2, ctxLines);
    const cdata = viewer.buildData(tmp2, {
        extensionUri: {}, getPricing: () => ({ costFor: () => 0 }),
        maxMessages: () => 50, contextLimitFor: () => 0
    });
    fs.unlinkSync(tmp2);

    const cr = cdata.contextReport;
    ok('contextReport parsed from the local_command line', !!cr);
    ok('latest /context snapshot wins', cr && cr.tokens === 84700 && cr.pct === 9);
    ok('total window parsed', cr && cr.limit === 967000);
    ok('snapshot carries its own timestamp', cr && cr.ts === Date.parse(cx2));
    const cat = l => cr && cr.categories.find(c => c.label === l);
    ok('token suffixes decoded (k → thousands)',
        cat('System prompt') && cat('System prompt').tokens === 9400
        && cat('Memory files').tokens === 23400);
    ok('rows without the word "tokens" still parse (Free space)',
        cat('Free space') && cat('Free space').tokens === 849300 && cat('Free space').pct === 87.8);
    ok('fractional percents preserved', cat('MCP tools') && cat('MCP tools').pct === 0.3);
    ok('Auto-compact window line is not mistaken for a category', !cat('Auto-compact window'));
    ok('exactly the five emitted rows captured, none spurious',
        // System prompt, MCP tools, Memory files, Free space, Autocompact buffer
        cr && cr.categories.length === 5 && !!cat('Autocompact buffer'));

    // a session with no /context run leaves contextReport null (button hidden)
    const tmp3 = path.join(require('os').tmpdir(), `af-noctx-${Date.now()}.jsonl`);
    fs.writeFileSync(tmp3, JSON.stringify({ type: 'user', timestamp: cx1, message: { content: 'hi' } }));
    const ndata = viewer.buildData(tmp3, {
        extensionUri: {}, getPricing: () => ({ costFor: () => 0 }), maxMessages: () => 5, contextLimitFor: () => 0
    });
    fs.unlinkSync(tmp3);
    ok('no /context run → contextReport is null', ndata.contextReport === null);

    // ---- the PRINT-mode shape (claude -p "/context" → markdown tables) ----
    // This is what a Capture-now run returns on stdout AND what print mode writes
    // into the transcript's system/local_command line — real fixture from a live run.
    const mdOut = [
        '## Context Usage', '',
        '**Model:** claude-haiku-4-5-20251001  ',
        '**Tokens:** 20.2k / 200k (10%)', '',
        '### Estimated usage by category', '',
        '| Category | Tokens | Percentage |',
        '|----------|--------|------------|',
        '| System prompt | 6.6k | 3.3% |',
        '| MCP tools (deferred) | 6.9k | 3.4% |',
        '| Messages | 8 | 0.0% |',
        '| Free space | 179.8k | 89.9% |', '',
        '### MCP Tools', '',
        '| Tool | Server | Tokens |',
        '|------|--------|--------|',
        '| mcp__airtable__airtable_get | airtable | 188 |', '',
        '### Skills', '',
        '| Skill | Source | Tokens |',
        '|-------|--------|--------|',
        '| dataviz | Built-in | ~290 |'
    ].join('\n');
    const md = viewer.parseContextReport(mdOut);
    ok('print-mode markdown parses', !!md && md.categories.length === 4);
    const mcat = l => md && md.categories.find(c => c.label === l);
    ok('md: labels with parentheses kept verbatim',
        mcat('MCP tools (deferred)') && mcat('MCP tools (deferred)').tokens === 6900);
    ok('md: plain-number token cell parses', mcat('Messages') && mcat('Messages').tokens === 8 && mcat('Messages').pct === 0);
    ok('md: total from the **Tokens:** line', md && md.tokens === 20200 && md.limit === 200000 && md.pct === 10);
    ok('md: header/divider rows not categories', !mcat('Category') && !md.categories.some(c => /^-/.test(c.label)));
    ok('md: per-tool MCP + Skills tables excluded',
        !md.categories.some(c => /^mcp__|dataviz/.test(c.label)));
    ok('md: "Tokens" total line not miscounted as a category', !mcat('Tokens'));

    // print-mode capture recorded in a transcript line parses through buildData too
    const tmp4 = path.join(require('os').tmpdir(), `af-mdctx-${Date.now()}.jsonl`);
    fs.writeFileSync(tmp4, JSON.stringify({
        type: 'system', subtype: 'local_command', timestamp: cx2,
        content: '<local-command-stdout>' + mdOut + '</local-command-stdout>'
    }));
    const mdata = viewer.buildData(tmp4, {
        extensionUri: {}, getPricing: () => ({ costFor: () => 0 }), maxMessages: () => 5, contextLimitFor: () => 0
    });
    fs.unlinkSync(tmp4);
    ok('buildData captures a print-mode transcript line',
        mdata.contextReport && mdata.contextReport.categories.length === 4
        && mdata.contextReport.ts === Date.parse(cx2));
}

// ---------- part 2: webview — dashboard drives the shared sessions table ----------
// The table itself (sorting, accordion, single-open, ⌨) is covered in depth by
// test_sessions_table.js; here we prove the dashboard page loads the component
// with its rows/columns and routes its messages both ways.
{
    const headerCode = fs.readFileSync(path.resolve(__dirname, '../media/pageHeader.js'), 'utf8') + '\n' + fs.readFileSync(path.resolve(__dirname, '../media/afFilters.js'), 'utf8');
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
                    if (['.af-sort', '.af-expand', '.af-collapse', '.af-single', '.af-count', '.af-allrows'].includes(sel)) {
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
                sessionRows: rows, sessionTableN: 20,
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

    // ---- Show box: All → host round-trip (the host rebuilds the pool) ----
    ok('Show box renders with the shipped N', sessHtml().includes('class="af-count"') && sessHtml().includes('value="20"'));
    posted = [];
    sess().querySelector('.af-allrows')._click(evStub);
    ok('All posts setTableN 0 to the host', posted.some(p => p.type === 'setTableN' && p.n === 0));
    msgHandler({ data: { type: 'data', data: Object.assign({}, sandbox.window.__DATA__, { sessionTableN: 0 }) } });
    ok('host echo n=0 lights the All chip', sessHtml().includes('af-allrows on'));

    // ---- Agent comparison: Show box slices the sorted rows (client-side) ----
    const mkAgent = i => ({
        id: 'm' + i, name: 'agent' + i, active: false, lastActivity: now,
        contextLoad: 0, memoryFiles: 0, sessions: i, daily: {},
        totalCost: i, totalTokens: i * 10, errors: 0, toolCalls: 0,
        usage: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 },
        insightCounts: { error: 0, warning: 0, info: 0 },
        duties: 0, pendingDuties: 0, qualityCount: 0
    });
    const agents14 = []; for (let i = 1; i <= 14; i++) { agents14.push(mkAgent(i)); }
    msgHandler({ data: { type: 'data', data: Object.assign({}, sandbox.window.__DATA__, { agents: agents14 }) } });
    const cmpRows = () => (lastHtml.match(/data-agent-row=/g) || []).length;
    ok('comparison defaults to 12 of 14 with an honest note',
        cmpRows() === 12 && lastHtml.includes('Showing 12 of 14 agents.'));
    ok('default cost sort keeps the true top rows', lastHtml.includes('data-agent-row="m14"') && !lastHtml.includes('data-agent-row="m2"'));
    getEl('cmp-all').listeners.click();
    ok('comparison All lists every agent', cmpRows() === 14 && !lastHtml.includes('Showing 14 of 14'));
    const cc = getEl('cmp-count'); cc.value = '5'; cc.listeners.change();
    ok('comparison count box narrows to the top 5', cmpRows() === 5 && lastHtml.includes('Showing 5 of 14 agents.'));
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
