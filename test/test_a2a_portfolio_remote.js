// X-456 — THE A2A BOARDS AND THE AGENTS PAGE ON A PHONE. The same three panels,
// drawn on a phone's view: they load from /res/, a read device changes nothing,
// a manage device resolves a note, promotes it (never opening the A2A Tasks tab
// on the PC), runs a task now, and every refusal is told ON THE PHONE; nothing a
// phone sends opens a file, a link, another board's tab, a session, a picker or
// a new agent's editor on the PC; the farm's refresh reaches each view; none
// becomes the desktop's tab.
'use strict';
const fs = require('fs');
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
const vscodeStub = {
    EventEmitter,
    Uri: { joinPath: (b, ...parts) => uri([b.path, ...parts].join('/')), file: uri, parse: uri },
    ViewColumn: { One: 1, Active: -1 },
    ConfigurationTarget: { Global: 1 },
    env: { openExternal: u => { pcSide.push('external:' + u); return Promise.resolve(true); }, clipboard: { writeText: () => Promise.resolve() } },
    window: {
        createWebviewPanel: () => { throw new Error('no desktop tab for a phone'); },
        showErrorMessage: m => { pcSide.push('error:' + m); return Promise.resolve(undefined); },
        showInformationMessage: m => { pcSide.push('info:' + m); return Promise.resolve(undefined); },
        showWarningMessage: m => { pcSide.push('warn:' + m); return Promise.resolve(undefined); },
        showQuickPick: () => { pcSide.push('pick'); return Promise.resolve(undefined); }
    },
    commands: { executeCommand: (...a) => { pcSide.push('command:' + a[0]); return Promise.resolve(undefined); } },
    workspace: {
        getConfiguration: () => ({ get: (_k, d) => d, update: async () => { } }), workspaceFolders: [],
        onDidChangeConfiguration: new EventEmitter().event
    }
};
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') { return vscodeStub; }
    return origLoad.apply(this, arguments);
};
const { A2ANotesPanel } = require(path.join(ROOT, 'out', 'panels', 'a2aNotesPanel.js'));
const { A2ATasksPanel } = require(path.join(ROOT, 'out', 'panels', 'a2aTasksPanel.js'));
const { PortfolioPanel } = require(path.join(ROOT, 'out', 'panels', 'portfolioPanel.js'));
const { RemoteViews, messageScope } = require(path.join(ROOT, 'out', 'panels', 'remoteViews.js'));
const { remotePages } = require(path.join(ROOT, 'out', 'panels', 'remotePages.js'));
Module._load = origLoad;
const { scopeAtLeast } = require(path.join(ROOT, 'out', 'remote', 'index.js'));

const calls = [];
const note = { id: 'n1', title: 'tarlayı sula', body: 'sabah', contextFiles: ['D:/x.md'], project: 'p', subsystem: '', topic: '', targetRole: 'manager', strictness: 'normal' };
let liveTask = null;
const tasksDone = { id: 't9', state: 'done', title: 'bitti' };
const notes = {
    load: () => undefined, notes: [note], get: id => (id === 'n1' ? note : undefined),
    resolve: (id, v) => { calls.push(`resolve:${id}:${v}`); return true; },
    pin: () => true, remove: () => true, clear: () => true, direct: () => true
};
const tasks = {
    load: () => undefined,
    list: () => (liveTask ? [liveTask, tasksDone] : [tasksDone]),
    add: t => { calls.push('add:' + t.sourceNoteId); return { id: 't1', state: 'queued', ...t }; },
    get: id => (id === 't9' ? tasksDone : liveTask && liveTask.id === id ? liveTask : undefined),
    cancel: () => true, remove: () => ({ held: [], deleted: 0 }), clear: () => true, direct: () => true,
    handoff: () => ({ refused: 'no' })
};
const notesDeps = {
    extensionUri: uri('/ext'), notes, tasks, projects: () => [], promoter: () => 'user',
    openTask: id => { calls.push('openTaskTab:' + id); }, openFile: f => { calls.push('openFile:' + f); }
};
const tasksDeps = {
    extensionUri: uri('/ext'), tasks, notes, projects: () => [], agentNames: () => ['manager'],
    runTaskNow: t => { calls.push('run:' + t.id); return { agent: 'manager', surface: 'console' }; },
    openNote: id => { calls.push('openNoteTab:' + id); }, openQueueItem: id => { calls.push('openQueue:' + id); }
};
const indexChanged = new EventEmitter();
const portfolioDeps = {
    extensionUri: uri('/ext'), index: { onDidUpdate: indexChanged.event, all: () => [], allWithExternal: () => [] },
    getAgents: () => [], projects: () => [], getInsights: () => [], budgets: () => ({}),
    createAgent: () => { calls.push('createAgent'); return {}; }
};
const settle = () => new Promise(r => setTimeout(r, 10));
const alive = setInterval(() => undefined, 1000);

(async () => {
    // ---- what each message needs ----
    const pages = remotePages({ a2anotes: () => undefined, a2atasks: () => undefined, portfolio: () => undefined });
    const N = pages.a2anotes, T = pages.a2atasks, P = pages.portfolio;
    ok('the two A2A boards and the Agents page are phone pages a read device opens', [N, T, P].every(p => p && p.open === 'read' && messageScope(p, 'refresh') === 'read'));
    ok('resolving, pinning, deleting, clearing, promoting and the supervisor\'s word are manage',
        ['resolve', 'unresolve', 'pin', 'delete', 'deleteMany', 'clear', 'toTask', 'directiveSet', 'directiveRemove'].every(t => messageScope(N, t) === 'manage'));
    ok('cancelling, deleting, rerouting, the word and Run now are manage',
        ['cancel', 'delete', 'deleteMany', 'clear', 'directiveSet', 'directiveRemove', 'reroute', 'runNow'].every(t => messageScope(T, t) === 'manage'));
    const NPC = ['openTask', 'openFile', 'openExternal', 'afnav'], TPC = ['openNote', 'openQueueItem', 'openExternal', 'afnav'];
    const PPC = ['openAgent', 'startSession', 'assignProject', 'manageProjects', 'reveal', 'openGuide', 'agent-new', 'afnav'];
    ok('‼️ a file, a link, the other board\'s tab, a queue item, a session, a project pick, the folder and a new agent never run from a phone',
        NPC.every(t => messageScope(N, t) === null) && TPC.every(t => messageScope(T, t) === null) && PPC.every(t => messageScope(P, t) === null));

    // ---- the pages on a phone ----
    const made = {};
    const views = new RemoteViews({
        media: uri('/ext/media'), atLeast: scopeAtLeast, waitMs: 60,
        pages: remotePages({
            a2anotes: (host, args) => { made.n = host; A2ANotesPanel.openOn(host, notesDeps, args && args.focusId); },
            a2atasks: (host, args) => { made.t = host; A2ATasksPanel.openOn(host, tasksDeps, args && args.focusId); },
            portfolio: host => { made.p = host; PortfolioPanel.openOn(host, portfolioDeps); }
        })
    });
    const reader = { device: 'dev_r', scope: 'read' }, manager = { device: 'dev_m', scope: 'manage' };
    const toR = [];
    ok('a read device opens the notes on one note', views.open(reader, 'r1', 'a2anotes', { focusId: 'n1' }, m => toR.push(m)) === true
        && A2ANotesPanel.current === undefined && made.n && made.n.remote === true);
    const page = (await views.page('/view/a2anotes?view=r1', reader)).body;
    ok('its page loads from /res/ with the note and its focus', page.includes('src="/res/a2aNotes.js"') && page.includes('tarlayı sula') && /"focusId":"n1"/.test(page));
    calls.length = 0;
    views.message(reader, 'r1', { type: 'resolve', id: 'n1' });
    await settle();
    ok('‼️ a read device changes nothing', calls.length === 0);

    const toM = [];
    views.open(manager, 'm1', 'a2anotes', undefined, m => toM.push(m));
    await views.page('/view/a2anotes?view=m1', manager);
    views.message(manager, 'm1', { type: 'resolve', id: 'n1' });
    await settle();
    ok('a manage device resolves a note', calls.includes('resolve:n1:true'));
    calls.length = 0; pcSide.length = 0;
    liveTask = { id: 't2', state: 'claimed', sourceNoteId: 'n1', title: 'x' };
    views.message(manager, 'm1', { type: 'toTask', id: 'n1' });
    await settle();
    ok('‼️ a note that already has a live task is told so ON THE PHONE', toM.some(m => m.type === 'afAsk' && /already has a live task \(t2, claimed\)/.test(String(m.message)))
        && pcSide.length === 0 && !calls.some(c => c.startsWith('add:')));
    liveTask = null; calls.length = 0;
    views.message(manager, 'm1', { type: 'toTask', id: 'n1' });
    await settle();
    ok('‼️ a phone\'s promotion makes the task and never opens the A2A Tasks tab on the PC', calls.includes('add:n1') && !calls.some(c => c.startsWith('openTaskTab:')));
    calls.length = 0; pcSide.length = 0;
    for (const t of NPC) { views.message(manager, 'm1', { type: t, id: 'n1', file: 'D:/x.md', url: 'https://example.com', to: 'dashboard' }); }
    await settle();
    ok('‼️ nothing a phone sends from the notes opens anything on the PC', calls.length === 0 && pcSide.length === 0);

    const toT = [];
    ok('the tasks open on one task', views.open(manager, 'm2', 'a2atasks', { focusId: 't9' }, m => toT.push(m)) === true && A2ATasksPanel.current === undefined);
    await views.page('/view/a2atasks?view=m2', manager);
    pcSide.length = 0;
    views.message(manager, 'm2', { type: 'reroute', id: 't9', targetRole: 'developer' });
    views.message(manager, 'm2', { type: 'runNow', id: 't9' });
    await settle();
    ok('‼️ a closed task\'s reroute and Run now are refused ON THE PHONE', toT.filter(m => m.type === 'afAsk' && /t9 is done/.test(String(m.message))).length === 2 && pcSide.length === 0);
    liveTask = { id: 't3', state: 'queued', title: 'y' }; calls.length = 0;
    views.message(manager, 'm2', { type: 'runNow', id: 't3' });
    await settle();
    ok('Run now starts the task\'s session from the phone', calls.includes('run:t3'));
    calls.length = 0; pcSide.length = 0;
    for (const t of TPC) { views.message(manager, 'm2', { type: t, id: 'n1', url: 'https://example.com', to: 'dashboard' }); }
    await settle();
    ok('‼️ nothing a phone sends from the tasks opens anything on the PC', calls.length === 0 && pcSide.length === 0);

    const toP = [];
    ok('the Agents page opens on a phone, never as the desktop\'s tab', views.open(reader, 'r2', 'portfolio', undefined, m => toP.push(m)) === true
        && PortfolioPanel.current === undefined && made.p && made.p.remote === true);
    ok('…from /res/', (await views.page('/view/portfolio?view=r2', reader)).body.includes('src="/res/portfolio.js"'));
    calls.length = 0; pcSide.length = 0;
    views.open(manager, 'm3', 'portfolio', undefined, () => undefined);
    for (const t of PPC) { views.message(manager, 'm3', { type: t, agentId: 'a1', form: { name: 'x' }, anchor: 'g', to: 'dashboard' }); }
    await settle();
    ok('‼️ nothing a phone sends from the Agents page starts, assigns, reveals or makes an agent on the PC', calls.length === 0 && pcSide.length === 0);

    const counts = () => [toM, toT, toP].map(a => a.filter(m => m.type === 'data').length);
    const before = counts();
    A2ANotesPanel.refreshIfOpen(); A2ATasksPanel.refreshIfOpen(); PortfolioPanel.refreshIfOpen();
    await settle();
    ok('the farm\'s refresh reaches every phone view', counts().every((n, i) => n === before[i] + 1));
    for (const [d, v] of [[reader, 'r1'], [manager, 'm1'], [manager, 'm2'], [reader, 'r2'], [manager, 'm3']]) { views.close(d, v); }
    ok('a closed view leaves no instance behind', A2ANotesPanel.phones.size === 0 && A2ATasksPanel.phones.size === 0 && PortfolioPanel.phones.size === 0);

    // ---- the host's wiring and the phone's page ----
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('the phone and the palette open the boards from the same deps, the focus carried',
        /A2ANotesPanel\.openOn\(host, a2aNotesPageDeps\(\), typeof args\?\.focusId === 'string'/.test(ext) && /A2ANotesPanel\.show\(a2aNotesPageDeps\(\), focusId\)/.test(ext)
        && /A2ATasksPanel\.openOn\(host, a2aTasksPageDeps\(\), typeof args\?\.focusId === 'string'/.test(ext) && /A2ATasksPanel\.show\(a2aTasksPageDeps\(\), focusId\)/.test(ext)
        && /portfolio: host => PortfolioPanel\.openOn\(host, portfolioDeps\)/.test(ext));
    const media = n => fs.readFileSync(path.join(ROOT, 'media', n), 'utf8');
    ok('on a phone a note\'s task, a task\'s note and Manage projects open the phone\'s own pages',
        /ON_PHONE_HOST \? \{ type: 'afnav', to: 'a2atasks', args: \{ focusId: b\.dataset\.task \} \}/.test(media('a2aNotes.js'))
        && /ON_PHONE_HOST \? \{ type: 'afnav', to: 'a2anotes', args: \{ focusId: x\.dataset\.note \} \}/.test(media('a2aTasks.js'))
        && /ON_PHONE_HOST \? \{ type: 'afnav', to: 'projects' \}/.test(media('portfolio.js')));
    const pf = media('portfolio.js');
    ok('‼️ the Agents table is a card per agent on a phone, every figure under its column\'s name',
        /<table class="pf" data-afcards>/.test(pf) && /<tr data-afcardhead>/.test(pf) && /data-afcard data-agent=/.test(pf)
        && /<td class="agentcell" data-lead>/.test(pf) && (pf.match(/\$\{L\(\d+\)\}/g) || []).length === 24);
    ok('…its PC buttons and a new agent are not drawn there, a project\'s head runs the card\'s width',
        /html\.af-phone table\.pf tr\[data-afcard\] > td\.pfact, html\.af-phone #pf-new \{ display:none; \}/.test(pf)
        && /<tr class="grouphead" data-afcardmore>/.test(pf) && !/tr\.grouphead[^{]*\{ display:block/.test(pf));
    ok('a task\'s lease wraps its words under its bar (it was 421px on a 360px screen)',
        /html\.af-phone \.a2a-leasew \{ display:flex; flex-wrap:wrap; max-width:100%; \}/.test(media('afA2A.js')));

    clearInterval(alive);
    console.log(`\na2a boards and agents on a phone: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL threw: ' + (e && e.stack || e)); process.exit(1); });
