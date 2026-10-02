// X-456 — THE DASHBOARD ON A PHONE. The same DashboardPanel, drawn on a phone's
// view instead of a VS Code tab: its page loads from /res/, a read device reads
// the board (ranges, the sessions table's size, a turn breakdown, the agent
// comparison, the plan usage) but cannot pin or stop a session, a manage device
// may, nothing a phone sends opens an agent's page, a terminal, the guide, a
// settings editor or another tab on the PC or changes the status bar's engine,
// the plan-usage beat and a new session reach every phone, and the desktop keeps
// its one tab however many phones have the page open.
'use strict';
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

class EventEmitter {
    constructor() { this.listeners = []; }
    get event() {
        return (fn, thisArg, bag) => {
            const f = thisArg ? fn.bind(thisArg) : fn;
            this.listeners.push(f);
            const d = { dispose: () => { this.listeners = this.listeners.filter(x => x !== f); } };
            if (Array.isArray(bag)) { bag.push(d); }
            return d;
        };
    }
    fire(e) { for (const f of [...this.listeners]) { f(e); } }
    dispose() { this.listeners = []; }
}
const uri = p => ({ path: p, fsPath: p, toString: () => 'file://' + p });
const pcSide = [];
const tabs = [];
const toTab = [];
const vscodeStub = {
    EventEmitter,
    Uri: { joinPath: (b, ...parts) => uri([b.path, ...parts].join('/')), file: uri, parse: uri },
    ViewColumn: { One: 1, Active: -1 },
    ConfigurationTarget: { Global: 1 },
    env: { clipboard: { writeText: t => { pcSide.push('clipboard:' + t); return Promise.resolve(); } } },
    window: {
        createWebviewPanel: (viewType) => {
            const disposed = new EventEmitter(), inbox = new EventEmitter(), state = new EventEmitter();
            const panel = {
                viewType, title: 'Dashboard', visible: true, revealed: 0, inbox,
                webview: {
                    html: '', cspSource: 'vscode-webview:', asWebviewUri: u => ({ toString: () => 'vscode-webview:' + u.path }),
                    postMessage: m => { toTab.push(m); return Promise.resolve(true); }, onDidReceiveMessage: inbox.event
                },
                onDidDispose: disposed.event, onDidChangeViewState: state.event,
                reveal() { this.revealed++; }, dispose() { disposed.fire(); }
            };
            tabs.push(panel);
            return panel;
        },
        showErrorMessage: m => { pcSide.push('error:' + m); return Promise.resolve(undefined); },
        showInformationMessage: m => { pcSide.push('info:' + m); return Promise.resolve(undefined); },
        showWarningMessage: m => { pcSide.push('warn:' + m); return Promise.resolve(undefined); }
    },
    commands: { executeCommand: (...a) => { pcSide.push('command:' + a[0]); return Promise.resolve(undefined); } },
    workspace: { getConfiguration: () => ({ get: (_k, d) => d, update: async () => { } }), workspaceFolders: [] }
};
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') { return vscodeStub; }
    return origLoad.apply(this, arguments);
};
const { DashboardPanel } = require(path.join(ROOT, 'out', 'panels', 'dashboard.js'));
const { RemoteViews } = require(path.join(ROOT, 'out', 'panels', 'remoteViews.js'));
const { remotePages } = require(path.join(ROOT, 'out', 'panels', 'remotePages.js'));
Module._load = origLoad;
const { scopeAtLeast } = require(path.join(ROOT, 'out', 'remote', 'index.js'));

const updated = new EventEmitter();
let usageReads = 0;
const deps = {
    extensionUri: uri('/ext'),
    getAgents: () => ([{ id: 'a-dev', name: 'developer', dir: 'D:/ajan/developer', contextLoad: { total: 0 }, memoryFiles: [], duties: [] }]),
    index: {
        all: () => [], allWithExternal: () => [], external: () => [], forAgent: () => [], forAgentWithExternal: () => [],
        windowUsage: now => ({ tokens: 0, wTokens: 0, cost: 0, msgs: 0, windowStart: now - 5 * 3600000 }),
        isSessionActive: () => false, isAgentActive: () => false, onDidUpdate: updated.event
    },
    getInsights: () => [],
    getPricing: () => ({ unknownModels: new Set(), costFor: () => 0 }),
    windowTokenLimit: () => 0,
    budgets: () => ({}),
    mediaCost: () => ({ today: 0, month: 0 }),
    farmStatus: () => [{ id: 'eng', label: 'Engines', state: 'ready', detail: 'x', action: { kind: 'command', value: 'agentfarm.openEngines', label: 'Engines' } }],
    planUsage: () => undefined,
    refreshPlanUsage: async () => { usageReads++; return undefined; },
    planUsageBeat: () => ({ ms: 300000, active: false }),
    planUsageEngine: () => 'claude'
};

const settle = () => new Promise(r => setTimeout(r, 5));
const alive = setInterval(() => undefined, 1000);

(async () => {
    const views = new RemoteViews({
        media: uri('/ext/media'), atLeast: scopeAtLeast, waitMs: 60,
        pages: remotePages({
            needs: () => undefined, console: () => undefined, now: () => undefined, sessions: () => undefined,
            tasks: () => undefined, session: () => false, notices: () => undefined,
            dashboard: host => DashboardPanel.openOn(host, deps)
        })
    });
    const reader = { device: 'dev_r', scope: 'read' }, manager = { device: 'dev_m', scope: 'manage' };
    const toReader = [], toManager = [];
    ok('the Dashboard opens on a phone', views.open(reader, 's1', 'dashboard', undefined, m => toReader.push(m)) === true);
    views.open(manager, 's2', 'dashboard', undefined, m => toManager.push(m));
    const page = (await views.page('/view/dashboard?view=s1', reader)).body;
    ok('its page loads from /res/, the page\'s own script too', page.includes('src="/res/dashboard.js"')
        && page.includes('href="/res/common.css"') && !/vscode-webview:|file:\/\//.test(page));
    ok('no desktop tab was made for a phone', tabs.length === 0);

    views.message(reader, 's1', { type: 'refresh' });
    views.message(reader, 's1', { type: 'setTableN', n: 50 });
    views.message(reader, 's1', { type: 'compareWindow', from: 1, to: 2 });
    views.message(reader, 's1', { type: 'planUsage', force: true });
    views.message(reader, 's1', { type: 'sessionTurns', file: 'C:/not-in-the-index.jsonl' });
    await settle();
    ok('a read device reads the board, pages its table, compares agents and reads the plan usage',
        toReader.filter(m => m.type === 'data').length === 2 && toReader.filter(m => m.type === 'data').pop().data.sessionTableN === 50
        && toReader.some(m => m.type === 'compareWindow' && m.rows.length === 1)
        && toReader.some(m => m.type === 'planUsage') && usageReads === 1);
    ok('‼️ a turn breakdown is read only for a transcript the index knows', !toReader.some(m => m.type === 'sessionTurns') && pcSide.length === 0);
    updated.fire();
    await settle();
    ok('a new session reaches every open phone', toReader.filter(m => m.type === 'data').length === 3 && toManager.some(m => m.type === 'data'));
    DashboardPanel.pushPlanUsage(undefined, { ms: 1, active: true }, [], 'claude', '');
    ok('‼️ the status bar\'s plan-usage beat reaches every phone', toReader.filter(m => m.type === 'planUsage' && m.push === true).length === 1
        && toManager.some(m => m.type === 'planUsage' && m.push === true));

    views.message(reader, 's1', { type: 'pinSession', sessionId: 'abc', pinned: true });
    views.message(reader, 's1', { type: 'interruptSession', sessionId: 'abc' });
    await settle();
    ok('a read device cannot pin or stop a session', pcSide.length === 0);
    views.message(manager, 's2', { type: 'pinSession', sessionId: 'abc', pinned: true });
    views.message(manager, 's2', { type: 'interruptSession', sessionId: 'abc' });
    await settle();
    ok('a manage device can', pcSide.join() === 'command:agentfarm.pinSession,command:agentfarm.interruptSession');

    pcSide.length = 0;
    for (const m of [{ type: 'openAgent', agentId: 'a-dev' }, { type: 'headerAction', action: 'openWebView' },
        { type: 'openSession', file: 'C:/x.jsonl' }, { type: 'startSession', agentId: 'a-dev' }, { type: 'newAgent' },
        { type: 'openGuide', anchor: 'dashboard' }, { type: 'openTimeline' }, { type: 'openSearch' }, { type: 'openFarmSettings' },
        { type: 'afnav', to: 'sessions' }, { type: 'focusTerminal', sessionId: 'abc' }, { type: 'manageProjects' },
        { type: 'setUsageEngine', id: 'codex' }, { type: 'statusAction', kind: 'command', value: 'agentfarm.openEngines' },
        { type: 'statusAction', kind: 'command', value: 'agentfarm.deleteEverything' },
        { type: 'statusAction', kind: 'settings', value: 'agentFarm.pricing' }]) {
        views.message({ device: 'dev_m', scope: 'admin' }, 's2', m);
    }
    await settle();
    ok('‼️ nothing a phone sends opens a page, a terminal, the guide, settings or a dialog on the PC, or switches its status bar', pcSide.length === 0);

    DashboardPanel.show(deps);
    DashboardPanel.show(deps);
    ok('the desktop still has its one Dashboard tab beside the phones', tabs.length === 1 && tabs[0].revealed === 1 && tabs[0].viewType === 'agentfarm.dashboard');
    tabs[0].inbox.fire({ type: 'statusAction', kind: 'command', value: 'agentfarm.deleteEverything' });
    await settle();
    ok('on the PC a refused status button still says so, through the host', pcSide.length === 1 && /^warn:.*was refused/.test(pcSide[0]));
    const before = toReader.length;
    DashboardPanel.refreshIfOpen();
    await settle();
    ok('a refresh reaches the tab and every phone', toReader.length === before + 1 && toTab.some(m => m.type === 'data'));
    views.close(manager, 's2');
    views.close(reader, 's1');
    DashboardPanel.show(deps);
    ok('closing the phones\' views leaves the desktop tab alone', tabs.length === 1 && tabs[0].revealed === 2);
    const n0 = toReader.length;
    DashboardPanel.refreshIfOpen();
    await settle();
    ok('a closed phone view is refreshed no more', toReader.length === n0);
    tabs[0].dispose();
    DashboardPanel.show(deps);
    ok('closing the tab lets the next show make a new one', tabs.length === 2);

    clearInterval(alive);
    console.log(`\ndashboard on a phone: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL threw: ' + (e && e.stack || e)); process.exit(1); });
