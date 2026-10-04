// X-466 — THE WORK QUEUE ON A PHONE. The same QueuePanel, drawn on a phone's view: a
// read device reads the lanes; an answer device answers a blocked item; a manage
// device captures, edits, routes, files, re-urges, drops and deletes — and the two
// "not handled yet" warnings are told ON THE PHONE. The source notice, a report or
// answer file and its open-with setting, a project's page, a link and the terminal
// hand-off never open anything on the PC from a phone; a change made on either side
// reaches the other, and the desktop keeps its one tab.
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const src = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

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
    env: {
        clipboard: { writeText: t => { pcSide.push('clipboard:' + t); return Promise.resolve(); } },
        openExternal: u => { pcSide.push('external:' + u.path); return Promise.resolve(true); }
    },
    window: {
        createWebviewPanel: (viewType) => {
            const disposed = new EventEmitter(), inbox = new EventEmitter(), state = new EventEmitter();
            const panel = {
                viewType, title: 'Queue', visible: true, revealed: 0, inbox, sent: [],
                webview: {
                    html: '', cspSource: 'vscode-webview:', asWebviewUri: u => ({ toString: () => 'vscode-webview:' + u.path }),
                    postMessage: m => { panel.sent.push(m); return Promise.resolve(true); }, onDidReceiveMessage: inbox.event
                },
                onDidDispose: disposed.event, onDidChangeViewState: state.event,
                reveal() { this.revealed++; }, dispose() { disposed.fire(); }
            };
            tabs.push(panel);
            return panel;
        },
        showErrorMessage: m => { pcSide.push('error:' + m); return Promise.resolve(undefined); },
        showInformationMessage: m => { pcSide.push('info:' + m); return Promise.resolve(undefined); },
        showWarningMessage: m => { pcSide.push('warn:' + m); return Promise.resolve(undefined); },
        showOpenDialog: () => { pcSide.push('openDialog'); return Promise.resolve(undefined); }
    },
    commands: { executeCommand: (...a) => { pcSide.push('command:' + a[0]); return Promise.resolve(undefined); } },
    workspace: { getConfiguration: () => ({ get: (_k, d) => d, update: async () => { } }), workspaceFolders: [] }
};
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') { return vscodeStub; }
    return origLoad.apply(this, arguments);
};
const { QueuePanel } = require(path.join(ROOT, 'out', 'panels', 'queuePanel.js'));
const { RemoteViews, messageScope } = require(path.join(ROOT, 'out', 'panels', 'remoteViews.js'));
const { remotePages } = require(path.join(ROOT, 'out', 'panels', 'remotePages.js'));
const { WorkQueueStore } = require(path.join(ROOT, 'out', 'core', 'workqueue.js'));
Module._load = origLoad;
const { scopeAtLeast } = require(path.join(ROOT, 'out', 'remote', 'index.js'));

// ---------- the rule ----------
const LOOKS = ['refresh'];
const ANSWERS = ['answer'];
const MANAGE = ['add', 'setProject', 'edit', 'setRoute', 'setUrgency', 'drop', 'remove', 'removeMany', 'clearHandled'];
const PC_ONLY = ['openNotice', 'openFile', 'configureDocOpen', 'openProject', 'openExternal', 'handoff', 'afnav'];
const none = () => undefined;
const makers = { needs: none, console: none, now: none, sessions: none, tasks: none, session: () => true,
    notices: none, dashboard: none, missions: none, chains: none, queue: none };
const rule = remotePages(makers).queue;
ok('the phone has a Work Queue page, opened at read and acted on at manage', !!rule && rule.open === 'read' && rule.act === 'manage');
ok('the lanes are a look', LOOKS.every(t => messageScope(rule, t) === 'read'));
ok('answering a blocked item is an answer', ANSWERS.every(t => messageScope(rule, t) === 'answer'));
ok('capturing, filing, editing, routing, the urgency, dropping and deleting are manage', MANAGE.every(t => messageScope(rule, t) === 'manage'));
ok('the source notice, a file and its open-with setting, a project\'s page, a link and the hand-off stay on the PC',
    PC_ONLY.every(t => messageScope(rule, t) === null));
const handled = [...src('src/panels/queuePanel.ts').matchAll(/case '([\w-]+)':/g)].map(m => m[1]);
const sorted = [...LOOKS, ...ANSWERS, ...MANAGE, ...PC_ONLY];
const unsorted = handled.filter(t => !sorted.includes(t));
ok(`‼️ every message the page's panel answers is placed on purpose — a new one cannot slip in as manage (${unsorted.join(' ') || 'none'})`,
    handled.length >= 17 && unsorted.length === 0 && sorted.every(t => handled.includes(t)));

// ---------- the page on phones ----------
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'afq-'));
const store = new WorkQueueStore(path.join(dir, 'work-queue.json'));
store.load();
const blocked = store.add({ text: 'which branch?', author: 'developer' });
store.stamp(blocked.id, { status: 'blocked' });
const live = store.add({ text: 'still open', author: 'user' });
const pcCalls = [];
let changes = 0;
const deps = {
    extensionUri: uri('/ext'), store,
    targets: () => ['vsc_AgentFarm'], agentNames: () => ['developer'],
    projects: () => [], activeProjectId: () => 'p1',
    onChange: () => { changes++; },
    openProject: id => pcCalls.push('project:' + id),
    openNotice: id => pcCalls.push('notice:' + id),
    handoff: n => pcCalls.push('handoff:' + n.id),
    openDoc: p => pcCalls.push('doc:' + p),
    configureDocOpen: () => pcCalls.push('configureDocOpen')
};
const item = id => store.get(id) || {};
const settle = () => new Promise(r => setTimeout(r, 5));
const alive = setInterval(() => undefined, 1000);

(async () => {
    ok('the fixture has a blocked item', item(blocked.id).status === 'blocked');
    const views = new RemoteViews({
        media: uri('/ext/media'), atLeast: scopeAtLeast, waitMs: 60,
        pages: remotePages(Object.assign({}, makers, { session: () => false, queue: host => QueuePanel.openOn(host, deps) }))
    });
    const reader = { device: 'dev_r', scope: 'read' }, answerer = { device: 'dev_a', scope: 'answer' }, manager = { device: 'dev_m', scope: 'manage' };
    const toR = [], toA = [], toM = [];
    ok('the Work Queue page opens on a phone', views.open(reader, 'v1', 'queue', undefined, m => toR.push(m)) === true);
    views.open(answerer, 'v2', 'queue', undefined, m => toA.push(m));
    views.open(manager, 'v3', 'queue', undefined, m => toM.push(m));
    const page = (await views.page('/view/queue?view=v1', reader)).body;
    ok('its page loads from /res/, its own script too', page.includes('src="/res/queue.js"') && !/vscode-webview:|file:\/\//.test(page));
    ok('no desktop tab was made for a phone', tabs.length === 0);

    views.message(reader, 'v1', { type: 'refresh' });
    await settle();
    ok('a read device reads the lanes', toR.some(m => m.type === 'data' && Array.isArray(m.data.items) && m.data.items.length === 2));
    const count = store.list({ limit: 0 }).length;
    for (const m of [{ type: 'add', text: 'x' }, { type: 'answer', id: blocked.id, text: 'main' },
        { type: 'drop', id: live.id }, { type: 'setUrgency', id: live.id, urgency: 'urgent' }]) {
        views.message(reader, 'v1', m);
    }
    await settle();
    ok('a read device can neither answer nor manage', store.list({ limit: 0 }).length === count && item(blocked.id).status === 'blocked'
        && item(live.id).status === 'captured' && item(live.id).urgency !== 'urgent' && changes === 0);

    views.message(answerer, 'v2', { type: 'add', text: 'sneaked in' });
    views.message(answerer, 'v2', { type: 'drop', id: live.id });
    views.message(answerer, 'v2', { type: 'answer', id: blocked.id, text: 'main' });
    await settle();
    ok('an answer device answers a blocked item back into the pipeline, and captures or drops nothing',
        item(blocked.id).userReply === 'main' && item(blocked.id).status === 'captured'
        && store.list({ limit: 0 }).length === count && item(live.id).status === 'captured');

    const n0 = toR.length;
    views.message(manager, 'v3', { type: 'add', text: 'from the phone', urgency: 'soon' });
    await settle();
    const added = store.list({ limit: 0 }).find(n => n.text === 'from the phone');
    ok('a manage device captures — stamped with the window\'s project like the PC\'s box', !!added && added.urgency === 'soon' && added.projectId === 'p1');
    ok('‼️ the capture reaches the other phones too', toR.length > n0 && toR[toR.length - 1].type === 'data');
    views.message(manager, 'v3', { type: 'edit', id: live.id, patch: { text: 'still open, edited' } });
    views.message(manager, 'v3', { type: 'setRoute', id: live.id, engine: 'codex' });
    views.message(manager, 'v3', { type: 'setUrgency', id: live.id, urgency: 'urgent' });
    await settle();
    ok('it edits, routes and re-urges an item', item(live.id).text === 'still open, edited' && item(live.id).engine === 'codex' && item(live.id).urgency === 'urgent');

    views.message(manager, 'v3', { type: 'remove', id: live.id });
    await settle();
    ok('‼️ deleting an unhandled item is refused with the reason told ON THE PHONE, not on the PC',
        toM.some(m => m.type === 'afAsk' && /isn't handled yet/.test(String(m.message))) && pcSide.length === 0 && !!store.get(live.id));
    views.message(manager, 'v3', { type: 'removeMany', ids: [live.id] });
    await settle();
    ok('…and so is a bulk delete that keeps it', toM.some(m => m.type === 'afAsk' && /kept — not handled yet/.test(String(m.message))) && pcSide.length === 0);
    views.message(manager, 'v3', { type: 'drop', id: live.id });
    views.message(manager, 'v3', { type: 'remove', id: live.id });
    await settle();
    ok('dropped, it deletes', !store.get(live.id));

    for (const m of [{ type: 'openNotice', id: 'n1' }, { type: 'openFile', id: blocked.id, kind: 'answer' }, { type: 'configureDocOpen' },
        { type: 'openProject', project: 'p1' }, { type: 'openExternal', url: 'https://example.com' }, { type: 'handoff', id: blocked.id },
        { type: 'afnav', to: 'tasks' }]) {
        views.message({ device: 'dev_m', scope: 'admin' }, 'v3', m);
    }
    await settle();
    ok('‼️ nothing a phone sends opens a notice, a file, a project, a link or a terminal on the PC', pcSide.length === 0 && pcCalls.length === 0);

    QueuePanel.show(deps);
    QueuePanel.show(deps);
    ok('the desktop still has its one Work Queue tab beside the phones', tabs.length === 1 && tabs[0].revealed === 1 && tabs[0].viewType === 'agentfarm.queue');
    const sentBefore = tabs[0].sent.length;
    views.message(manager, 'v3', { type: 'setUrgency', id: added.id, urgency: 'urgent' });
    await settle();
    ok('‼️ a phone\'s change reaches the PC\'s tab', tabs[0].sent.length > sentBefore && tabs[0].sent[tabs[0].sent.length - 1].type === 'data');
    const r0 = toR.length;
    tabs[0].inbox.fire({ type: 'setUrgency', id: added.id, urgency: 'normal' });
    await settle();
    ok('…and the PC\'s change reaches the phones', toR.length > r0 && toR[toR.length - 1].type === 'data');
    tabs[0].inbox.fire({ type: 'remove', id: added.id });
    await settle();
    ok('on the PC the refusal is still told on the PC', pcSide.length === 1 && /^warn:Agent Farm: this item isn't handled yet/.test(pcSide[0]));
    tabs[0].inbox.fire({ type: 'handoff', id: added.id });
    await settle();
    ok('on the PC the hand-off still runs', pcCalls.join() === 'handoff:' + added.id);
    ok('a change tells the host (the bell, the Notices board)', changes > 0);

    views.close(manager, 'v3'); views.close(answerer, 'v2'); views.close(reader, 'v1');
    QueuePanel.show(deps);
    ok('closing the phones\' views leaves the desktop tab alone', tabs.length === 1 && tabs[0].revealed === 2);
    const n1 = toR.length;
    QueuePanel.refreshIfOpen();
    await settle();
    ok('a closed phone view is refreshed no more', toR.length === n1);
    ok('‼️ and the page lets go of it — a phone opening and closing the queue all day leaks nothing', QueuePanel.phones.size === 0);

    // ---------- the host ----------
    const ext = src('src/extension.ts');
    ok('the extension makes the page for a phone from the desktop\'s own deps',
        /queue: host => QueuePanel\.openOn\(host, queuePageDeps\(\)\),/.test(ext)
        && /const showQueuePanel = \(focusItem\?: string\): void => QueuePanel\.show\(queuePageDeps\(\), focusItem\);/.test(ext));

    clearInterval(alive);
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`\nwork queue on a phone: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL threw: ' + (e && e.stack || e)); process.exit(1); });
