// X-441 — THE CONSOLE ON A PHONE. The same ConsolePanel, drawn on a phone's
// view instead of a VS Code tab: its page loads from /res/, a read device may
// read the conversation but not start or send, a manage device may, and what
// would open a dialog or an editor on the PC never runs from the phone. The
// desktop keeps its one tab regardless of how many phones have the page open.
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
                viewType, title: 'Console', visible: true, revealed: 0,
                webview: {
                    html: '', cspSource: 'vscode-webview:', asWebviewUri: u => ({ toString: () => 'vscode-webview:' + u.path }),
                    postMessage: () => Promise.resolve(true), onDidReceiveMessage: inbox.event
                },
                onDidDispose: disposed.event, onDidChangeViewState: state.event,
                reveal() { this.revealed++; }, dispose() { disposed.fire(); }
            };
            tabs.push(panel);
            return panel;
        },
        showOpenDialog: () => { pcSide.push('openDialog'); return Promise.resolve(undefined); },
        showTextDocument: () => { pcSide.push('showTextDocument'); return Promise.resolve(undefined); },
        showErrorMessage: () => Promise.resolve(undefined),
        showInformationMessage: () => Promise.resolve(undefined),
        showWarningMessage: () => Promise.resolve(undefined)
    },
    commands: { executeCommand: (...a) => { pcSide.push('command:' + a[0]); return Promise.resolve(undefined); } },
    workspace: {
        getConfiguration: () => ({ get: (_k, d) => d, update: async () => { } }),
        openTextDocument: () => { pcSide.push('openTextDocument'); return Promise.resolve({}); },
        workspaceFolders: []
    }
};
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') { return vscodeStub; }
    return origLoad.apply(this, arguments);
};
const { ConsolePanel } = require(path.join(ROOT, 'out', 'panels', 'consolePanel.js'));
const { RemoteViews } = require(path.join(ROOT, 'out', 'panels', 'remoteViews.js'));
const { remotePages } = require(path.join(ROOT, 'out', 'panels', 'remotePages.js'));
Module._load = origLoad;
const { scopeAtLeast } = require(path.join(ROOT, 'out', 'remote', 'index.js'));

const started = [];
const deps = {
    extensionUri: uri('/ext'),
    host: {
        list: () => [],
        get: () => undefined,
        onChange: () => ({ dispose() { } }),
        start: (init) => { started.push(init); return 'seat-' + started.length; }
    },
    getAgents: () => ([{ id: 'a-dev', name: 'developer', dir: 'D:/ajan/developer' }]),
    index: { all: () => [], external: () => [] },
    colorFor: () => '',
    modelAliases: () => [],
    engineModels: () => ({ claude: { models: [{ id: 'sonnet' }], efforts: { sonnet: [{ id: 'low' }] }, defaultEffort: {} } }),
    engines: () => ([{ id: 'claude', label: 'Claude Code', ready: true, auth: 'subscription' }]),
    launchDefaults: () => ({ engine: 'claude', model: 'sonnet', effort: 'low', permissionMode: 'default' }),
    agentEngineDefaults: () => ({ model: '', effort: '' }),
    agentSeedDefaults: () => ({ model: '', effort: '' }),
    lastLaunch: () => undefined,
    rememberLaunch: () => { },
    liveOwners: () => [],
    history: () => [],
    olderHistory: () => ({ messages: [], more: false }),
    lastWindow: () => [],
    forgetLastWindow: () => { },
    leftoverOwner: () => undefined,
    endLeftover: async () => false,
    estimateCost: () => 0,
    projects: () => [],
    projectContextText: () => '',
    superpowersText: () => '',
    superpowersHealth: () => ({ usable: true, why: '', skills: 3 }),
    superpowersDefault: () => false,
    sessionProject: () => '',
    promptSnippets: () => ({ items: [], scopes: [] })
};

const settle = () => new Promise(r => setImmediate(r));
const alive = setInterval(() => undefined, 1000);

(async () => {
    const views = new RemoteViews({
        media: uri('/ext/media'), atLeast: scopeAtLeast, waitMs: 60,
        pages: remotePages({ needs: () => undefined, console: host => ConsolePanel.openOn(host, deps) })
    });
    const reader = { device: 'dev_r', scope: 'read' }, manager = { device: 'dev_m', scope: 'manage' };
    const toReader = [], toManager = [];
    ok('the Console opens on a phone', views.open(reader, 'c1', 'console', undefined, m => toReader.push(m)) === true);
    views.open(manager, 'c2', 'console', undefined, m => toManager.push(m));
    const page = (await views.page('/view/console?view=c1', reader)).body;
    ok('its page loads from /res/, the Console\'s own script too', page.includes('src="/res/console.js"')
        && page.includes('href="/res/common.css"') && !/vscode-webview:|file:\/\//.test(page));
    ok('the phone\'s acquireVsCodeApi comes first', page.indexOf('/res/afRemote.js') > 0 && page.indexOf('/res/afRemote.js') < page.indexOf('window.__DATA__'));
    ok('U-238 — the phone\'s page carries the light sheet, after the theme layer',
        page.indexOf('href="/res/theme.css"') > 0 && page.indexOf('href="/res/theme-phone.css"') > page.indexOf('href="/res/theme.css"'));
    ok('no desktop tab was made for a phone', tabs.length === 0);

    views.message(reader, 'c1', { type: 'refresh' });
    await settle();
    ok('a read device gets the conversation data', toReader.some(m => m.type === 'data'));

    const startFrom = async (caller, view) => {
        for (const [field, value] of [['agentId', 'a-dev'], ['engine', 'claude'], ['model', ''], ['effort', ''], ['permissionMode', '']]) {
            views.message(caller, view, { type: 'setIntent', field, value });
            await settle();
        }
        views.message(caller, view, { type: 'start', text: 'hello from the phone' });
        await settle(); await settle();
    };
    await startFrom(reader, 'c1');
    ok('a read device cannot start a session', started.length === 0);
    await startFrom(manager, 'c2');
    ok('a manage device can, with the words it typed', started.length === 1 && JSON.stringify(started[0]).includes('hello from the phone'));

    for (const type of ['attachPick', 'openFile', 'openTranscript', 'openProject', 'openGuide', 'afnav']) {
        views.message({ device: 'dev_m', scope: 'admin' }, 'c2', { type, path: 'C:/x.txt', to: 'dashboard', id: 's1' });
    }
    await settle(); await settle();
    ok('nothing a phone sends opens a dialog, an editor or a tab on the PC', pcSide.length === 0);

    ConsolePanel.show(deps);
    ConsolePanel.show(deps);
    ok('the desktop still has its one Console tab beside the phones', tabs.length === 1 && tabs[0].revealed === 1 && tabs[0].viewType === 'agentfarm.console');
    views.close(manager, 'c2');
    views.close(reader, 'c1');
    ConsolePanel.show(deps);
    ok('closing the phones\' views leaves the desktop tab alone', tabs.length === 1 && tabs[0].revealed === 2);
    tabs[0].dispose();
    ConsolePanel.show(deps);
    ok('closing the tab lets the next show make a new one', tabs.length === 2);

    clearInterval(alive);
    console.log(`\nconsole on a phone: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL threw: ' + (e && e.stack || e)); process.exit(1); });
