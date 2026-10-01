// X-456 — THE NOTICES PAGE ON A PHONE. The same NoticesPanel, drawn on a phone's
// view instead of a VS Code tab: its page loads from /res/, a read device reads
// the board but changes nothing, an answer device answers and declines questions
// and marks what it read, a manage device pins, stars, files, edits, dismisses
// and undoes; nothing a phone sends opens a save dialog, a report, a browser, a
// terminal or another tab on the PC; a change made anywhere reaches every open
// phone; the desktop keeps its one tab however many phones have the page open.
'use strict';
const fs = require('fs');
const os = require('os');
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
    env: {
        clipboard: { writeText: t => { pcSide.push('clipboard:' + t); return Promise.resolve(); } },
        openExternal: u => { pcSide.push('browser:' + u.path); return Promise.resolve(true); }
    },
    window: {
        createWebviewPanel: (viewType) => {
            const disposed = new EventEmitter(), inbox = new EventEmitter(), state = new EventEmitter();
            const panel = {
                viewType, title: 'Notices', visible: true, revealed: 0,
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
        showSaveDialog: () => { pcSide.push('save-dialog'); return Promise.resolve(undefined); },
        showQuickPick: () => { pcSide.push('quick-pick'); return Promise.resolve(undefined); },
        showTextDocument: () => { pcSide.push('editor'); return Promise.resolve(undefined); },
        showErrorMessage: () => Promise.resolve(undefined),
        showInformationMessage: () => { pcSide.push('pc-toast'); return Promise.resolve(undefined); },
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
const { NoticesPanel } = require(path.join(ROOT, 'out', 'panels', 'noticesPanel.js'));
const { RemoteViews } = require(path.join(ROOT, 'out', 'panels', 'remoteViews.js'));
const { remotePages } = require(path.join(ROOT, 'out', 'panels', 'remotePages.js'));
const { NoticesStore } = require(path.join(ROOT, 'out', 'core', 'notices.js'));
Module._load = origLoad;
const { scopeAtLeast } = require(path.join(ROOT, 'out', 'remote', 'index.js'));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-notices-remote-'));
const store = new NoticesStore(path.join(dir, 'notices.json'));
const news = store.add({ agentName: 'developer', title: 'Build installed', body: 'see [the run](https://example.com/run)', type: 'update', level: 2, reportPath: path.join(dir, 'r.md') });
const q1 = store.add({ agentName: 'developer', title: 'Which name?', body: 'A or B', type: 'question', level: 3 });
const q2 = store.add({ agentName: 'developer', title: 'Ship tonight?', body: 'yes / no', type: 'question', level: 2 });
const byId = id => store.list({ limit: 0 }).find(n => n.id === id);
const calls = [];
const deps = {
    extensionUri: uri('/ext'),
    store,
    agentNames: () => ['developer'],
    projects: () => [{ id: 'prj_a', name: 'Alpha' }],
    activeProjectId: () => '',
    openProject: id => pcSide.push('project:' + id),
    onChange: () => calls.push('badge'),
    convertToQueue: a => calls.push('queue:' + a.noticeId + ':' + a.text),
    handoffNotice: n => pcSide.push('terminal:' + n.id),
    openQueueItem: id => pcSide.push('queue-page:' + id),
    openDoc: (p, mode) => pcSide.push('doc:' + p + ':' + (mode || '')),
    docOpenConfig: () => ({ mode: 'vscode', hasCustom: false }),
    configureDocOpen: () => pcSide.push('doc-config')
};

const settle = () => new Promise(r => setImmediate(r));
const alive = setInterval(() => undefined, 1000);

(async () => {
    const views = new RemoteViews({
        media: uri('/ext/media'), atLeast: scopeAtLeast, waitMs: 60,
        pages: remotePages({
            needs: () => undefined, console: () => undefined, now: () => undefined, sessions: () => undefined,
            tasks: () => undefined, session: () => false,
            notices: host => NoticesPanel.openOn(host, deps)
        })
    });
    const reader = { device: 'dev_r', scope: 'read' }, answerer = { device: 'dev_a', scope: 'answer' }, manager = { device: 'dev_m', scope: 'manage' };
    const toReader = [], toAnswerer = [], toManager = [];
    ok('the Notices page opens on a phone', views.open(reader, 's1', 'notices', undefined, m => toReader.push(m)) === true);
    views.open(answerer, 's2', 'notices', undefined, m => toAnswerer.push(m));
    views.open(manager, 's3', 'notices', undefined, m => toManager.push(m));
    const page = (await views.page('/view/notices?view=s1', reader)).body;
    ok('its page loads from /res/, the page\'s own script too', page.includes('src="/res/notices.js"')
        && page.includes('href="/res/common.css"') && !/vscode-webview:|file:\/\//.test(page));
    ok('the phone\'s acquireVsCodeApi comes first', page.indexOf('/res/afRemote.js') > 0 && page.indexOf('/res/afRemote.js') < page.indexOf('window.__DATA__'));
    ok('the board is in the page it opens with', page.includes('Which name?') && page.includes('Ship tonight?'));
    ok('no desktop tab was made for a phone', tabs.length === 0);

    views.message(reader, 's1', { type: 'refresh' });
    await settle();
    ok('a read device reads the board', toReader.some(m => m.type === 'data' && m.data.notices.length === 3));
    for (const m of [{ type: 'markRead', id: news.id }, { type: 'answer', id: q1.id, text: 'A' }, { type: 'decline', id: q2.id },
        { type: 'pin', id: news.id, pinned: true }, { type: 'dismiss', id: news.id }, { type: 'markAllRead' }]) {
        views.message(reader, 's1', m);
    }
    await settle();
    ok('‼️ a read device changes nothing', !byId(news.id).read && !byId(news.id).pinned && !!byId(q2.id) && byId(q2.id).status !== 'declined'
        && store.list({ limit: 0 }).length === 3 && calls.length === 0);

    views.message(answerer, 's2', { type: 'markRead', id: news.id });
    views.message(answerer, 's2', { type: 'answer', id: q1.id, text: 'A' });
    views.message(answerer, 's2', { type: 'decline', id: q2.id });
    await settle();
    ok('an answer device marks what it read', byId(news.id).read === true);
    ok('…answers a question (it becomes a queue item, the PC opens nothing)', calls.includes('queue:' + q1.id + ':A') && pcSide.length === 0);
    ok('…and declines one', byId(q2.id).status === 'declined');
    views.message(answerer, 's2', { type: 'pin', id: news.id, pinned: true });
    views.message(answerer, 's2', { type: 'dismiss', id: news.id });
    await settle();
    ok('…but cannot pin or dismiss', !byId(news.id).pinned && !!byId(news.id));

    views.message(manager, 's3', { type: 'pin', id: news.id, pinned: true });
    views.message(manager, 's3', { type: 'setStars', id: news.id, stars: 2 });
    views.message(manager, 's3', { type: 'setProject', id: news.id, project: 'prj_a' });
    await settle();
    ok('a manage device pins, stars and files a notice', byId(news.id).pinned === true && byId(news.id).stars === 2 && byId(news.id).projectId === 'prj_a');
    views.message(manager, 's3', { type: 'dismiss', id: news.id });
    await settle();
    ok('…dismisses one', !byId(news.id));
    views.message(manager, 's3', { type: 'undo' });
    await settle();
    ok('…and takes it back', !!byId(news.id));
    ok('‼️ a change reaches every open phone', toReader.filter(m => m.type === 'data').length >= 3 && toAnswerer.some(m => m.type === 'data'));

    const before = toReader.filter(m => m.type === 'data').length;
    store.add({ agentName: 'tester', title: 'From the bridge', body: 'x', type: 'update', level: 1 });
    NoticesPanel.refreshIfOpen();
    await settle();
    ok('‼️ a notice posted elsewhere (refreshIfOpen) reaches the phones too', toReader.filter(m => m.type === 'data').length === before + 1
        && toReader[toReader.length - 1].data.notices.some(n => n.title === 'From the bridge'));

    pcSide.length = 0;
    for (const m of [{ type: 'exportChoose', shown: [news.id], open: [] }, { type: 'exportOne', id: news.id },
        { type: 'openReport', id: news.id }, { type: 'openReport', id: news.id, mode: 'external' }, { type: 'configureDocOpen' },
        { type: 'openExternal', url: 'https://example.com/run' }, { type: 'handoffNotice', id: news.id },
        { type: 'openQueueItem', id: 'q_1' }, { type: 'openProject', project: 'prj_a' }, { type: 'afnav', to: 'needs' }]) {
        views.message({ device: 'dev_x', scope: 'admin' }, 's3', m);
    }
    await settle();
    ok('‼️ nothing a phone sends opens a save dialog, a report, a browser, a terminal or a tab on the PC', pcSide.length === 0);

    NoticesPanel.show(deps);
    NoticesPanel.show(deps);
    ok('the desktop still has its one Notices tab beside the phones', tabs.length === 1 && tabs[0].revealed === 1 && tabs[0].viewType === 'agentfarm.notices');
    views.close(manager, 's3');
    views.close(answerer, 's2');
    views.close(reader, 's1');
    NoticesPanel.show(deps);
    ok('closing the phones\' views leaves the desktop tab alone', tabs.length === 1 && tabs[0].revealed === 2);
    const n0 = toReader.length;
    NoticesPanel.refreshIfOpen();
    await settle();
    ok('a closed phone view is refreshed no more', toReader.length === n0);
    tabs[0].dispose();
    NoticesPanel.show(deps);
    ok('closing the tab lets the next show make a new one', tabs.length === 2);

    clearInterval(alive);
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temp */ }
    console.log(`\ntest_notices_remote: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
