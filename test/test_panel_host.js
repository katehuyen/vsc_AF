// X-441 — THE PANEL HOST. A page is drawn on a PanelHost, never on a
// vscode.WebviewPanel: the desktop tab is one host, a phone's view another.
// Here: (1) the gate — a panel that makes its own tab with createWebviewPanel
// is red unless it is one of the older panels listed below, and that list may
// only shrink; (2) the phone's views — owned per device, scope-checked, served
// once their open arrives; (3) the Needs page drawn on a phone's view.
'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// ---------- (1) THE GATE, derived from the source ----------
// Panels that still make their own tab. Move one to desktopHost() and take it
// off this list in the same commit; nothing is ever added to it.
const LEGACY = [
    'airtablePanel', 'capabilities',
    'evalsPanel', 'livingPanel', 'memoryGraph',
    'secretsPanel', 'selectionPanel', 'studioPanel',
    'taskAnalyticsPanel'
].map(n => `src/panels/${n}.ts`);
const HOST_FILE = 'src/panels/panelHost.ts';

const makesTab = text => /\bcreateWebviewPanel\s*\(/.test(
    text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1'));
ok('gate: sees a direct call', makesTab('const p = vscode.window.createWebviewPanel(\n  "x", "y");'));
ok('gate: ignores a comment and a name in a list', !makesTab("// createWebviewPanel(x)\nconst names = ['createWebviewPanel', 'a'];"));

function walk(dir) {
    const out = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { out.push(...walk(p)); } else if (/\.ts$/.test(e.name)) { out.push(p); }
    }
    return out;
}
const callers = walk(path.join(ROOT, 'src'))
    .map(f => path.relative(ROOT, f).replace(/\\/g, '/'))
    .filter(rel => rel !== HOST_FILE && makesTab(fs.readFileSync(path.join(ROOT, rel), 'utf8')));
for (const rel of callers) {
    ok(`${rel} makes its tab through desktopHost() (src/panels/panelHost.ts), not createWebviewPanel`, LEGACY.includes(rel));
}
for (const rel of LEGACY) {
    ok(`${rel} no longer calls createWebviewPanel — take it off LEGACY in test_panel_host.js`, callers.includes(rel));
}
for (const p of ['needsPanel', 'consolePanel', 'sessionsPanel', 'tasksPanel']) {
    ok(`the ${p} is on the host`, !callers.includes(`src/panels/${p}.ts`)
        && /desktopHost\(/.test(fs.readFileSync(path.join(ROOT, `src/panels/${p}.ts`), 'utf8')));
}

// ---------- a vscode stand-in, just what these modules touch ----------
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
const executed = [];
const clipboard = [];
const tabs = [];
const vscodeStub = {
    EventEmitter,
    Uri: { joinPath: (b, ...parts) => uri([b.path, ...parts].join('/')), file: uri, parse: uri },
    ViewColumn: { One: 1 },
    window: {
        createWebviewPanel: (viewType, title, column, options) => {
            const disposed = new EventEmitter(), inbox = new EventEmitter();
            const panel = {
                viewType, title, options, revealed: 0,
                webview: {
                    html: '', cspSource: 'vscode-webview:', asWebviewUri: u => ({ toString: () => 'vscode-webview:' + u.path }),
                    posted: [], postMessage(m) { this.posted.push(m); return Promise.resolve(true); }, onDidReceiveMessage: inbox.event
                },
                onDidDispose: disposed.event, reveal() { this.revealed++; }, dispose() { disposed.fire(); }
            };
            tabs.push(panel);
            return panel;
        },
        showWarningMessage: () => undefined
    },
    workspace: { getConfiguration: () => ({ get: (_k, d) => d }), onDidChangeConfiguration: () => ({ dispose() { } }) },
    commands: { executeCommand: (...a) => { executed.push(a); return Promise.resolve(); } },
    env: { clipboard: { writeText: t => { clipboard.push(t); return Promise.resolve(); } } },
    ConfigurationTarget: { Global: 1 }
};
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') { return vscodeStub; }
    return origLoad.apply(this, arguments);
};
const { RemoteViews, messageScope } = require(path.join(ROOT, 'out', 'panels', 'remoteViews.js'));
const { remotePages } = require(path.join(ROOT, 'out', 'panels', 'remotePages.js'));
const { NeedsPanel } = require(path.join(ROOT, 'out', 'panels', 'needsPanel.js'));
Module._load = origLoad;
const { scopeAtLeast } = require(path.join(ROOT, 'out', 'remote', 'index.js'));

const tick = () => new Promise(r => setTimeout(r, 0));

// A view that never opens waits on an unref()d timer; keep the test alive while it does.
const alive = setInterval(() => undefined, 1000);
(async () => {
    // ---------- (2) THE PHONE'S VIEWS ----------
    ok('scopes rank read < answer < manage < admin', scopeAtLeast('answer', 'read') && !scopeAtLeast('read', 'answer')
        && scopeAtLeast('admin', 'manage') && !scopeAtLeast('bogus', 'read') && !scopeAtLeast('admin', 'bogus'));
    const made = [];
    const media = uri('/ext/media');
    const views = new RemoteViews({
        media, atLeast: scopeAtLeast, waitMs: 60,
        pages: {
            probe: {
                open: 'read', act: 'answer', looks: ['refresh'], answers: [], pcOnly: ['afnav'],
                make: (host, args) => {
                    const rec = { host, args, got: [], disposed: 0 };
                    host.webview.html = '<p>probe ' + made.length + '</p>';
                    host.webview.onDidReceiveMessage(m => rec.got.push(m));
                    host.onDidDispose(() => rec.disposed++);
                    made.push(rec);
                }
            }
        }
    });
    const A = { device: 'dev_a', scope: 'read' }, B = { device: 'dev_b', scope: 'answer' };
    const postsA = [];
    ok('an unknown page does not open', views.open(A, 'v0', 'nope', undefined, () => undefined) === false);
    ok('…nor does an inherited name', views.open(A, 'v0', 'toString', undefined, () => undefined) === false);
    ok('a device without a known scope opens nothing', views.open({ device: 'x', scope: 'guest' }, 'v0', 'probe', undefined, () => undefined) === false);
    ok('a readable page opens for a read device, with its args', views.open(A, 'v1', 'probe', { q: 1 }, m => postsA.push(m)) === true
        && made.length === 1 && made[0].args.q === 1 && made[0].host.remote === true);
    const served = await views.page('/view/probe?view=v1', A);
    ok('its HTML is served to its device', served && served.status === 200 && served.body === '<p>probe 0</p>' && /text\/html/.test(served.type));
    ok('…not to another device using the same view id', (await views.page('/view/probe?view=v1', B)) === null);
    ok('…nor under another page name', (await views.page('/view/other?view=v1', A)) === null);
    ok('a url that is not a view is not served', (await views.page('/view/probe', A)) === null && (await views.page('/res/x.js', A)) === null);

    views.message(A, 'v1', { type: 'refresh' });
    views.message(A, 'v1', { type: 'clear', all: true });
    ok('a read device may only look: its refresh arrives, its clear does not', made[0].got.length === 1 && made[0].got[0].type === 'refresh');
    views.message(B, 'v1', { type: 'refresh' });
    ok('another device cannot talk to this view', made[0].got.length === 1);
    views.message({ device: 'dev_a', scope: 'admin' }, 'v1', { type: 'afnav', to: 'x' });
    ok('a pcOnly message never arrives, not even from an admin', made[0].got.length === 1);
    ok('the page posts to its phone', await made[0].host.webview.postMessage({ type: 'data' }) === true && postsA[0].type === 'data');

    ok('a media file is a relative /res/ address', String(made[0].host.webview.asWebviewUri(uri('/ext/media/common.css'))) === '/res/common.css'
        && String(made[0].host.webview.asWebviewUri(uri('/ext/media/icons/a b.svg'))) === '/res/icons/a%20b.svg');
    ok('…and a file outside media is no address at all', String(made[0].host.webview.asWebviewUri(uri('/ext/package.json'))) === '/res/-');
    ok('the view draws with self as its CSP source', made[0].host.webview.cspSource === "'self'");

    const late = views.page('/view/probe?view=v2', B);
    views.open(B, 'v2', 'probe', undefined, () => undefined);
    const lateServed = await late;
    ok('a page fetched before its open arrives is served once it does', lateServed && lateServed.body === '<p>probe 1</p>');
    views.message(B, 'v2', { type: 'clear' });
    ok('an answer device acts', made[1].got.length === 1 && made[1].got[0].type === 'clear');

    views.open(A, 'v1', 'probe', undefined, m => postsA.push(m));
    ok('reopening a view id replaces the old instance, which is disposed', made.length === 3 && made[0].disposed === 1
        && (await views.page('/view/probe?view=v1', A)).body === '<p>probe 2</p>');
    ok('a disposed view posts nothing', await made[0].host.webview.postMessage({ x: 1 }) === false);
    views.close(A, 'v1');
    ok('closing a view disposes it and stops serving it', made[2].disposed === 1 && (await views.page('/view/probe?view=v1', A)) === null);
    views.close(A, 'v1');
    ok('closing twice is harmless', made[2].disposed === 1);
    ok('views are counted across devices', views.count() === 1);

    // ---------- the real page list ----------
    const real = remotePages({ needs: () => undefined, console: () => undefined, now: () => undefined, sessions: () => undefined, tasks: () => undefined, session: () => true, notices: () => undefined, dashboard: () => undefined, missions: () => undefined, queue: () => undefined });
    ok('the phone has the Needs, the Console, the Now, the Sessions, the Tasks, a session\'s, the Notices, the Dashboard, the Missions, the Work Queue, the Chains, the Turns, the Projects, an agent\'s, the Search, the Live Timeline, the Engines, the Accounts, the two A2A boards, the Agents, the Guide, the Wiki, the Toolbox, the Sound and the Settings pages', Object.keys(real).sort().join() === 'a2anotes,a2atasks,accounts,agent,chains,console,dashboard,engines,guide,missions,needs,notices,now,portfolio,projects,queue,search,session,sessions,settings,sound,tasks,timeline,toolbox,turns,wiki');
    ok('Dashboard: the board, its table, a turn breakdown, the comparison and the plan usage are looks, pinning and stopping a session need manage, an agent\'s page, a new session or agent, the guide, settings, the Farm Status doors, a terminal and the status bar\'s engine stay on the PC',
        real.dashboard.open === 'read' && ['refresh', 'planUsage', 'setTableN', 'sessionTurns', 'compareWindow'].every(t => messageScope(real.dashboard, t) === 'read')
        && ['pinSession', 'interruptSession'].every(t => messageScope(real.dashboard, t) === 'manage')
        && ['openAgent', 'headerAction', 'openSession', 'startSession', 'newAgent', 'openGuide', 'openTimeline', 'openSearch',
            'openFarmSettings', 'afnav', 'focusTerminal', 'manageProjects', 'setUsageEngine', 'statusAction'].every(t => messageScope(real.dashboard, t) === null));
    ok('Notices: reading looks, a question is answered and what was read is marked at answer, the board is managed at manage, files, reports, links, terminals and other tabs stay on the PC',
        real.notices.open === 'read' && messageScope(real.notices, 'refresh') === 'read'
        && ['answer', 'decline', 'markRead', 'markReadMany', 'markAllRead'].every(t => messageScope(real.notices, t) === 'answer')
        && ['pin', 'setStars', 'setProject', 'convertToQueue', 'dismiss', 'dismissMany', 'clearRead', 'undo', 'edit']
            .every(t => messageScope(real.notices, t) === 'manage')
        && ['exportChoose', 'exportOne', 'openReport', 'configureDocOpen', 'openExternal', 'handoffNotice', 'openQueueItem', 'openProject', 'afnav']
            .every(t => messageScope(real.notices, t) === null));
    ok('A session: reading looks, renaming, pinning, resuming and the wiki need manage, files, the terminal, the export and the PC clipboard stay on the PC',
        real.session.open === 'read' && ['refresh', 'sessionFileEdits', 'wikiAsk'].every(t => messageScope(real.session, t) === 'read')
        && ['renameSession', 'pinSession', 'resumeConsole', 'ctxCapture', 'wikiMark', 'wikiCategory'].every(t => messageScope(real.session, t) === 'manage')
        && ['openRaw', 'copyStep', 'openEditedFile', 'revealFile', 'exportChoose', 'resume', 'focusTerminal', 'openAgent', 'chainGo', 'afnav']
            .every(t => messageScope(real.session, t) === null));
    ok('Tasks: reading looks, a permission is answered, making and running work needs manage, files and other tabs stay on the PC',
        real.tasks.open === 'read' && ['refresh', 'promptSnippets', 'runs-archive', 'chooser-pick'].every(t => messageScope(real.tasks, t) === 'read')
        && messageScope(real.tasks, 'approve') === 'answer'
        && ['plan', 'wfstep', 'plan-save', 'bulk', 'gate', 'task', 'task-new', 'task-undo', 'clear-finished', 'cancel-queued', 'flexPromote']
            .every(t => messageScope(real.tasks, t) === 'manage')
        && ['browserLogin', 'open-output', 'open-transcript', 'export-md', 'command', 'pickPromptSnippets', 'afnav']
            .every(t => messageScope(real.tasks, t) === null));
    ok('Sessions: reading and paging look, pinning and stopping need manage, a transcript or a terminal stays on the PC',
        real.sessions.open === 'read' && ['refresh', 'setTableN', 'sessionTurns'].every(t => messageScope(real.sessions, t) === 'read')
        && ['pinSession', 'interruptSession'].every(t => messageScope(real.sessions, t) === 'manage')
        && ['openSession', 'focusTerminal', 'openGuide', 'afnav'].every(t => messageScope(real.sessions, t) === null));
    ok('Needs: open to read, a refresh looks, a clear or an action needs answer',
        real.needs.open === 'read' && messageScope(real.needs, 'refresh') === 'read'
        && messageScope(real.needs, 'clear') === 'answer' && messageScope(real.needs, 'action') === 'answer');
    ok('Console: reading the conversation looks, a question is answered at answer, a send or a start needs manage',
        real.console.open === 'read' && messageScope(real.console, 'select') === 'read' && messageScope(real.console, 'loadOlder') === 'read'
        && messageScope(real.console, 'askAnswer') === 'answer' && messageScope(real.console, 'send') === 'manage'
        && messageScope(real.console, 'start') === 'manage' && messageScope(real.console, 'interrupt') === 'manage');
    ok('…a type nobody listed needs the page\'s act scope (a new message is never readable by accident)',
        messageScope(real.console, 'somethingNew') === 'manage' && messageScope(real.needs, 'somethingNew') === 'answer');
    ok('what would open a dialog or a tab on the PC never runs from a phone',
        ['attachPick', 'openFile', 'openTranscript', 'afnav'].every(t => messageScope(real.console, t) === null)
        && ['afnav', 'openGuide', 'openAgent'].every(t => messageScope(real.needs, t) === null));
    ok('the shell\'s copy request only looks, on every page', messageScope(real.needs, 'afClipboard') === 'read' && messageScope(real.console, 'afClipboard') === 'read');

    // ---------- (3) THE NEEDS PAGE ON A PHONE ----------
    const changed = new EventEmitter();
    const acted = [], cleared = [];
    const item = { urgency: 1, kind: 'permission', agentName: 'dev', title: 'Allow Bash?', detail: 'Bash', ts: 1, ref: { sessionId: 's1' } };
    const deps = {
        extensionUri: uri('/ext'),
        buildItems: () => [item],
        onAction: async (id, it) => { acted.push(id); },
        onClear: async keys => { cleared.push(keys === undefined ? 'all' : keys.join(',')); return 1; },
        onRestore: async () => 0,
        hiddenCount: () => 0,
        onDidChange: changed.event
    };
    const phone = new RemoteViews({
        media: uri('/ext/media'), atLeast: scopeAtLeast, waitMs: 60,
        pages: remotePages({ needs: host => NeedsPanel.openOn(host, deps), console: () => undefined })
    });
    const reader = { device: 'dev_r', scope: 'read' }, answerer = { device: 'dev_w', scope: 'answer' };
    const postsR = [], postsW = [];
    ok('the Needs page opens on a phone', phone.open(reader, 'n1', 'needs', undefined, m => postsR.push(m)) === true);
    phone.open(answerer, 'n2', 'needs', undefined, m => postsW.push(m));
    const page = (await phone.page('/view/needs?view=n1', reader)).body;
    ok('its shell loads everything from /res/, its own script too', page.includes('src="/res/needs.js"') && page.includes('href="/res/common.css"')
        && !/vscode-webview:|file:\/\//.test(page));
    ok('the phone\'s acquireVsCodeApi loads before anything asks for it',
        page.indexOf('src="/res/afRemote.js"') > 0 && page.indexOf('src="/res/afRemote.js"') < page.indexOf('window.__DATA__'));
    ok('its CSP names self', /style-src 'self'/.test(page) && /img-src 'self' data:/.test(page));
    ok('the page carries the queue', page.includes('Allow Bash?'));

    phone.message(reader, 'n1', { type: 'refresh' });
    ok('a refresh from the phone is answered with the data', postsR.length === 1 && postsR[0].type === 'data' && postsR[0].data.items.length === 1);
    phone.message(reader, 'n1', { type: 'clear', all: true });
    phone.message(reader, 'n1', { type: 'action', actionId: 'approve', item });
    await tick();
    ok('a read device cannot clear or act', cleared.length === 0 && acted.length === 0);
    phone.message(answerer, 'n2', { type: 'clear', keys: ['k1'] });
    phone.message(answerer, 'n2', { type: 'action', actionId: 'approve', item });
    await tick(); await tick();
    ok('an answer device clears and acts, and gets the fresh data', cleared[0] === 'k1' && acted[0] === 'approve' && postsW.filter(m => m.type === 'data').length >= 2);
    phone.message(answerer, 'n2', { type: 'afnav', to: 'dashboard' });
    phone.message(answerer, 'n2', { type: 'openAgent', agentId: 'dev' });
    ok('navigation from the phone does not open anything on the PC', executed.length === 0);
    phone.message(answerer, 'n2', { type: 'afClipboard', token: 't1', text: 'hello' });
    await tick();
    const copy = postsW.find(m => m.type === 'afClipboardDone');
    ok('a copy from the phone never lands on the PC clipboard, and says so', clipboard.length === 0 && copy && copy.ok === false && copy.token === 't1');

    const before = postsR.length;
    changed.fire();
    ok('a change in the queue reaches every open phone view', postsR.length === before + 1);
    phone.close(reader, 'n1');
    changed.fire();
    ok('a closed view stops listening', postsR.length === before + 1);

    NeedsPanel.show(deps);
    const tab = tabs[tabs.length - 1];
    ok('the desktop opens its tab through the host', tab && tab.viewType === 'agentfarm.needs' && tab.options.enableScripts && tab.options.retainContextWhenHidden
        && /vscode-webview:\/ext\/media\/needs\.js/.test(tab.webview.html));
    NeedsPanel.show(deps);
    ok('…and keeps one tab: a second show reveals it', tabs.length === 1 && tab.revealed === 1);
    tab.dispose();
    NeedsPanel.show(deps);
    ok('closing the tab lets the next show make a new one — the phone views never held it', tabs.length === 2);
    phone.close(answerer, 'n2');

    clearInterval(alive);
    console.log(`\npanel host:${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL threw: ' + (e && e.stack || e)); process.exit(1); });
