// X-456 — THE TASKS PAGE ON A PHONE. The same TasksPanel, drawn on a phone's
// view instead of a VS Code tab: a read device reads, an answer device settles
// a permission, a manage device makes, runs and switches work; every
// confirmation, pick and typed answer is asked ON THE PHONE (never a dialog on
// the PC); what opens a file, an editor, a browser or another tab stays on the
// PC; and the desktop keeps its one tab however many phones have the page open.
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
const commands = [];
const tabs = [];
const pcDialog = name => (...a) => { pcSide.push(name + ':' + a[0]); return Promise.resolve(undefined); };
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
                viewType, title: 'Tasks', visible: true, revealed: 0, posted: [],
                webview: {
                    html: '', cspSource: 'vscode-webview:', asWebviewUri: u => ({ toString: () => 'vscode-webview:' + u.path }),
                    postMessage(m) { panel.posted.push(m); return Promise.resolve(true); }, onDidReceiveMessage: inbox.event
                },
                inbox, onDidDispose: disposed.event, onDidChangeViewState: state.event,
                reveal() { this.revealed++; }, dispose() { disposed.fire(); }
            };
            tabs.push(panel);
            return panel;
        },
        showErrorMessage: pcDialog('error'), showInformationMessage: pcDialog('info'), showWarningMessage: pcDialog('warn'),
        showQuickPick: pcDialog('pick'), showInputBox: pcDialog('input'), showOpenDialog: pcDialog('open'),
        showSaveDialog: pcDialog('save'), showTextDocument: pcDialog('doc')
    },
    commands: { executeCommand: (...a) => { commands.push(a); return Promise.resolve(undefined); } },
    workspace: { getConfiguration: () => ({ get: (_k, d) => d, update: async () => { } }), workspaceFolders: [] }
};
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') { return vscodeStub; }
    return origLoad.apply(this, arguments);
};
const { TasksPanel } = require(path.join(ROOT, 'out', 'panels', 'tasksPanel.js'));
const { RemoteViews } = require(path.join(ROOT, 'out', 'panels', 'remoteViews.js'));
const { RemoteAsk } = require(path.join(ROOT, 'out', 'panels', 'panelAsk.js'));
const { remotePages } = require(path.join(ROOT, 'out', 'panels', 'remotePages.js'));
Module._load = origLoad;
const { scopeAtLeast } = require(path.join(ROOT, 'out', 'remote', 'index.js'));

// ---------- the store behind the page: just what these acts touch ----------
const did = [];
const changed = new EventEmitter();
const task = { id: 't1', title: 'Nightly', prompt: 'p', status: 'queued', agentName: 'developer', mode: 'headless', createdAt: 1 };
const store = {
    tasks: [task],
    schedules: [{ id: 's1', title: 'Morning', agentName: 'developer', kind: 'daily', hour: 9, minute: 0, enabled: true, prompt: 'p' }],
    triggers: [],
    workflows: [{ id: 'w1', title: 'Chain', steps: [{ title: 'one', prompt: 'x' }], inputs: [{ name: 'topic', type: 'text' }] }],
    templates: [{ id: 'tp1', title: 'Again', prompt: 'p', mode: 'headless' }],
    automation: {}, automationLog: [],
    onDidChange: changed.event,
    archivedMonths: () => [],
    setAutomationState: s => { did.push('gate:' + JSON.stringify(s)); },
    deletePlanRows: rows => { did.push('deletePlanRows:' + rows.length); return rows.map(r => ({ ...r, title: 'Morning' })); },
    restorePlanRows: rows => rows.length,
    revealTerminal: () => { did.push('revealTerminal'); },
    answerSupervision: (_t, how, text) => { did.push('supervision:' + how + ':' + (text || '')); return { ok: true }; },
    startTask: () => { did.push('startTask'); },
    persist: () => undefined
};
const manager = new Proxy(store, {
    get: (t, k) => (k in t ? t[k] : (typeof k === 'string' && /^[a-z]/.test(k) ? () => [] : undefined))
});
const approvals = [];
const base = {
    extensionUri: uri('/ext'),
    manager,
    getAgents: () => ([{ id: 'a-dev', name: 'developer', dir: 'D:/ajan/developer' }]),
    onDidChangeNeeds: new EventEmitter().event,
    settleApproval: (id, yes) => { approvals.push(id + ':' + yes); },
    runCommandText: async t => { did.push('command:' + t); },
    showrunner: () => '',
    activeProjectId: () => undefined
};
const deps = new Proxy(base, { get: (t, k) => (k in t ? t[k] : () => []) });

const settle = () => new Promise(r => setImmediate(r));
const alive = setInterval(() => undefined, 1000);

(async () => {
    const views = new RemoteViews({
        media: uri('/ext/media'), atLeast: scopeAtLeast, waitMs: 60,
        pages: remotePages({
            needs: () => undefined, console: () => undefined, now: () => undefined, sessions: () => undefined,
            tasks: host => TasksPanel.openOn(host, deps),
            board: host => TasksPanel.openOn(host, deps, 'board')
        })
    });
    // X-456 — the board is the Tasks page on its Run tab, under the Tasks' own rule
    const P = remotePages({ tasks: () => undefined, board: () => undefined });
    ok('the board opens under the Tasks page\'s own rule', ['open', 'act', 'looks', 'answers', 'pcOnly'].every(k => JSON.stringify(P.board[k]) === JSON.stringify(P.tasks[k])));
    views.open({ device: 'dev_b', scope: 'read' }, 'b1', 'board', undefined, () => undefined);
    const boardPage = (await views.page('/view/board?view=b1', { device: 'dev_b', scope: 'read' })).body;
    ok('…and lands on the Run tab', boardPage.includes('src="/res/tasksPage.js"') && /"tab":"run"/.test(boardPage));
    const extSrc = require('fs').readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('the phone opens the board from the palette\'s own deps', /board: host => TasksPanel\.openOn\(host, tasksDeps, 'board'\)/.test(extSrc));
    const reader = { device: 'dev_r', scope: 'read' }, answerer = { device: 'dev_a', scope: 'answer' }, manager_ = { device: 'dev_m', scope: 'manage' };
    const toReader = [], toAnswerer = [], toManager = [];
    ok('the Tasks page opens on a phone', views.open(reader, 'r1', 'tasks', undefined, m => toReader.push(m)) === true);
    views.open(answerer, 'a1', 'tasks', undefined, m => toAnswerer.push(m));
    views.open(manager_, 'm1', 'tasks', undefined, m => toManager.push(m));
    const page = (await views.page('/view/tasks?view=r1', reader)).body;
    ok('its page loads from /res/, the page\'s own script too', page.includes('src="/res/tasksPage.js"')
        && !/vscode-webview:|file:\/\//.test(page));
    ok('no desktop tab was made for a phone', tabs.length === 0);

    // ---- reading
    views.message(reader, 'r1', { type: 'refresh' });
    await settle();
    ok('a read device reads the page', toReader.some(m => m.type === 'data'));
    views.message(reader, 'r1', { type: 'gate', act: 'pause' });
    views.message(reader, 'r1', { type: 'task', act: 'start', id: 't1' });
    views.message(reader, 'r1', { type: 'approve', approvalId: 'ap1', ok: true });
    await settle();
    ok('a read device cannot switch, run or approve anything', did.length === 0 && approvals.length === 0);

    // ---- answering a permission
    views.message(answerer, 'a1', { type: 'approve', approvalId: 'ap1', ok: true });
    views.message(answerer, 'a1', { type: 'gate', act: 'pause' });
    await settle();
    ok('an answer device settles a permission and nothing more', approvals.join() === 'ap1:true' && did.length === 0);

    // ---- managing
    views.message(manager_, 'm1', { type: 'gate', act: 'pause', text: 'night' });
    await settle();
    ok('a manage device switches the farm\'s gate', did.some(d => d.startsWith('gate:') && d.includes('"paused":true')));

    did.length = 0; toManager.length = 0;
    views.message(manager_, 'm1', { type: 'bulk', act: 'delete', rows: [{ kind: 'schedule', id: 's1' }] });
    await settle();
    const confirm = toManager.find(m => m.type === 'afAsk' && m.kind === 'message');
    ok('a bulk delete is confirmed ON THE PHONE, naming what it counted', !!confirm && confirm.modal === true
        && /Morning/.test(confirm.message) && confirm.buttons.join() === 'Delete' && did.length === 0);
    views.message(manager_, 'm1', { type: 'afAskAnswer', id: confirm && confirm.id, value: 0 });
    await settle();
    ok('…and the phone\'s yes deletes it, offering the undo on the phone too', did.includes('deletePlanRows:1')
        && toManager.some(m => m.type === 'afAsk' && /deleted/.test(m.message || '') && (m.buttons || []).join() === 'Undo'));

    toManager.length = 0;
    views.message(manager_, 'm1', { type: 'task', act: 'supEdit', id: 't1' });
    await settle();
    const typed = toManager.find(m => m.type === 'afAsk' && m.kind === 'input');
    ok('a supervised retry\'s prompt is typed on the phone', !!typed && typed.value === 'p');
    views.message(manager_, 'm1', { type: 'afAskAnswer', id: typed && typed.id, value: 'better words' });
    await settle();
    ok('…and the typed words are the answer', did.includes('supervision:edit:better words'));

    toManager.length = 0; did.length = 0;
    views.message(manager_, 'm1', { type: 'task', act: 'terminal', id: 't1' });
    views.message(manager_, 'm1', { type: 'plan', act: 'export', kind: 'schedule', id: 's1' });
    await settle();
    ok('a terminal or a Windows scheduled task is said to be on the PC, never opened there', !did.includes('revealTerminal')
        && !commands.some(c => c[0] === 'agentfarm.exportSchtask')
        && toManager.filter(m => m.type === 'afAsk' && m.kind === 'note' && /on the PC/.test(m.message)).length === 2);

    views.message(manager_, 'm1', { type: 'plan', act: 'run', kind: 'workflow', id: 'w1' });
    views.message(manager_, 'm1', { type: 'plan', act: 'run', kind: 'template', id: 'tp1' });
    views.message(manager_, 'm1', { type: 'wfstep', act: 'delete', id: 'w1', index: 0 });
    await settle();
    const asks = ['agentfarm.runWorkflow', 'agentfarm.runTemplate', 'agentfarm.deleteWorkflowStep']
        .map(name => commands.find(c => c[0] === name));
    ok('a workflow\'s inputs, a template\'s agent and a step\'s delete are asked by the phone that pressed them',
        asks.every(c => c && c[1] && c[1].ask instanceof RemoteAsk));

    // ---- what stays on the PC
    commands.length = 0; did.length = 0;
    for (const type of ['browserLogin', 'open-output', 'open-transcript', 'open-needs', 'open-analytics', 'open-history',
        'export-md', 'command', 'openPromptSnippets', 'pickPromptSnippets', 'openGuide', 'afnav']) {
        views.message({ device: 'dev_m', scope: 'admin' }, 'm1', { type, file: 'C:/x.md', text: 'run it', recipe: 'x', to: 'dashboard', cols: ['a'], rows: [] });
    }
    await settle();
    ok('nothing a phone sends opens a file, an editor, a browser or a tab on the PC', commands.length === 0 && did.length === 0);
    ok('…and no dialog was ever shown on the PC for a phone', pcSide.length === 0);
    const pageSrc = require('fs').readFileSync(path.join(ROOT, 'media', 'tasksPage.js'), 'utf8');
    ok('the page drawn on a phone leaves out what only works at the PC (the command bar, ⬇ MD, a run\'s output)',
        /ON_PHONE_HOST = !!\(window\.__AFUI__ && window\.__AFUI__\.remote === true\)/.test(pageSrc)
        && /id="runs-export"\$\{ON_PHONE_HOST \? ' hidden' : ''\}/.test(pageSrc)
        && /<div class="cmdbar"\$\{ON_PHONE_HOST \? ' hidden' : ''\}>/.test(pageSrc)
        && /r\.hasOutput && !ON_PHONE_HOST/.test(pageSrc));
    // X-456 — the Analytics and the Needs pages are the phone's too: their links open them there
    ok('‼️ Analytics is drawn on a phone', /<button class="secondary" data-open="open-analytics" title=/.test(pageSrc));
    const shellSaw = [];
    const shellWin = { afShell: { post: s => shellSaw.push(JSON.parse(s)) }, sessionStorage: { getItem: () => null, setItem: () => undefined } };
    shellWin.window = shellWin;
    require('vm').runInNewContext(require('fs').readFileSync(path.join(ROOT, 'media', 'afRemote.js'), 'utf8'),
        Object.assign(shellWin, { location: { pathname: '/view/tasks', search: '?view=t' } }));
    for (const type of ['open-analytics', 'open-needs', 'open-tasks', 'open-history']) { shellWin.acquireVsCodeApi().postMessage({ type }); }
    ok('‼️ …and on the phone Analytics, "need you" and the way back to Tasks open those pages there, a PC-only link still goes to the farm (refused)',
        JSON.stringify(shellSaw) === JSON.stringify([{ type: 'afnav', to: 'analytics' }, { type: 'afnav', to: 'needs' }, { type: 'afnav', to: 'tasks' }, { type: 'open-history' }]));

    // ---- the desktop keeps its one tab
    TasksPanel.show(deps);
    TasksPanel.show(deps);
    ok('the desktop still has its one Tasks tab beside the phones', tabs.length === 1 && tabs[0].revealed === 1 && tabs[0].viewType === 'agentfarm.tasks');
    tabs[0].inbox.fire({ type: 'plan', act: 'run', kind: 'workflow', id: 'w1' });
    await settle();
    const deskRun = commands.find(c => c[0] === 'agentfarm.runWorkflow');
    ok('on the desktop the same Run asks through vscode.window', !!deskRun && !(deskRun[1].ask instanceof RemoteAsk)
        && typeof deskRun[1].ask.input === 'function');
    for (const [who, v] of [[manager_, 'm1'], [answerer, 'a1'], [reader, 'r1']]) { views.close(who, v); }
    TasksPanel.show(deps);
    ok('closing the phones\' views leaves the desktop tab alone', tabs.length === 1 && tabs[0].revealed === 2);
    tabs[0].dispose();
    TasksPanel.show(deps);
    ok('closing the tab lets the next show make a new one', tabs.length === 2);

    clearInterval(alive);
    console.log(`\ntasks on a phone: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL threw: ' + (e && e.stack || e)); process.exit(1); });
