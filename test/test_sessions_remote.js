// X-456 — THE SESSIONS PAGE ON A PHONE. The same SessionsPanel, drawn on a
// phone's view instead of a VS Code tab: its page loads from /res/, a read
// device may read and page the table but not pin or stop a session, a manage
// device may, opening a transcript or a terminal never runs on the PC from a
// phone, the page opens narrowed by the phone's arguments, and the desktop keeps
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
                viewType, title: 'Sessions', visible: true, revealed: 0,
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
        showErrorMessage: () => Promise.resolve(undefined),
        showInformationMessage: () => Promise.resolve(undefined),
        showWarningMessage: () => Promise.resolve(undefined)
    },
    commands: { executeCommand: (...a) => { pcSide.push('command:' + a[0]); return Promise.resolve(undefined); } },
    workspace: { getConfiguration: () => ({ get: (_k, d) => d, update: async () => { } }), workspaceFolders: [] }
};
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') { return vscodeStub; }
    return origLoad.apply(this, arguments);
};
const { SessionsPanel } = require(path.join(ROOT, 'out', 'panels', 'sessionsPanel.js'));
const { RemoteViews } = require(path.join(ROOT, 'out', 'panels', 'remoteViews.js'));
const { remotePages } = require(path.join(ROOT, 'out', 'panels', 'remotePages.js'));
Module._load = origLoad;
const { scopeAtLeast } = require(path.join(ROOT, 'out', 'remote', 'index.js'));

const updated = new EventEmitter();
const deps = {
    extensionUri: uri('/ext'),
    getAgents: () => ([{ id: 'a-dev', name: 'developer', dir: 'D:/ajan/developer' }]),
    index: { allWithExternal: () => [], isSessionActive: () => false, onDidUpdate: updated.event },
    getPricing: () => ({})
};

const settle = () => new Promise(r => setImmediate(r));
const alive = setInterval(() => undefined, 1000);

(async () => {
    const views = new RemoteViews({
        media: uri('/ext/media'), atLeast: scopeAtLeast, waitMs: 60,
        pages: remotePages({
            needs: () => undefined, console: () => undefined, now: () => undefined,
            sessions: (host, args) => SessionsPanel.openOn(host, deps, args)
        })
    });
    const reader = { device: 'dev_r', scope: 'read' }, manager = { device: 'dev_m', scope: 'manage' };
    const toReader = [], toManager = [];
    ok('the Sessions page opens on a phone', views.open(reader, 's1', 'sessions', undefined, m => toReader.push(m)) === true);
    views.open(manager, 's2', 'sessions', { chain: 'chn_test' }, m => toManager.push(m));
    const page = (await views.page('/view/sessions?view=s1', reader)).body;
    ok('its page loads from /res/, the page\'s own script too', page.includes('src="/res/sessionsPage.js"')
        && page.includes('href="/res/common.css"') && !/vscode-webview:|file:\/\//.test(page));
    ok('the phone\'s acquireVsCodeApi comes first', page.indexOf('/res/afRemote.js') > 0 && page.indexOf('/res/afRemote.js') < page.indexOf('window.__DATA__'));
    ok('no desktop tab was made for a phone', tabs.length === 0);
    ok('a phone\'s arguments narrow the page it opens', (await views.page('/view/sessions?view=s2', manager)).body.includes('chn_test'));

    views.message(reader, 's1', { type: 'refresh' });
    views.message(reader, 's1', { type: 'setTableN', n: 20 });
    await settle();
    ok('a read device reads and pages the table', toReader.filter(m => m.type === 'data').length === 2
        && toReader[toReader.length - 1].data.sessionTableN === 20);
    updated.fire();
    await settle();
    ok('a new session reaches every open phone', toReader.filter(m => m.type === 'data').length === 3 && toManager.some(m => m.type === 'data'));

    views.message(reader, 's1', { type: 'pinSession', sessionId: 'abc', pinned: true });
    views.message(reader, 's1', { type: 'interruptSession', sessionId: 'abc' });
    await settle();
    ok('a read device cannot pin or stop a session', pcSide.length === 0);
    views.message(manager, 's2', { type: 'pinSession', sessionId: 'abc', pinned: true });
    views.message(manager, 's2', { type: 'interruptSession', sessionId: 'abc' });
    await settle();
    ok('a manage device can', pcSide.join() === 'command:agentfarm.pinSession,command:agentfarm.interruptSession');

    pcSide.length = 0;
    for (const type of ['openSession', 'focusTerminal', 'openGuide', 'afnav']) {
        views.message({ device: 'dev_m', scope: 'admin' }, 's2', { type, file: 'C:/x.jsonl', sessionId: 'abc', to: 'dashboard', anchor: 'x' });
    }
    await settle();
    ok('nothing a phone sends opens a transcript, a terminal or a tab on the PC', pcSide.length === 0);

    SessionsPanel.show(deps);
    SessionsPanel.show(deps);
    ok('the desktop still has its one Sessions tab beside the phones', tabs.length === 1 && tabs[0].revealed === 1 && tabs[0].viewType === 'agentfarm.sessions');
    views.close(manager, 's2');
    views.close(reader, 's1');
    SessionsPanel.show(deps);
    ok('closing the phones\' views leaves the desktop tab alone', tabs.length === 1 && tabs[0].revealed === 2);
    tabs[0].dispose();
    SessionsPanel.show(deps);
    ok('closing the tab lets the next show make a new one', tabs.length === 2);

    clearInterval(alive);
    console.log(`\nsessions on a phone: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL threw: ' + (e && e.stack || e)); process.exit(1); });
