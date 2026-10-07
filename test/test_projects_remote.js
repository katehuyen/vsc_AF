// X-456 — THE PROJECTS PAGE ON A PHONE. The same ProjectsPanel, drawn on a
// phone's view: it loads from /res/, a read device reads the list and a tab and
// cannot change anything, a manage device edits the backlog and removes a
// project with the question asked ON THE PHONE, nothing a phone sends opens a
// picker, an editor, a terminal or another page on the PC, the view follows the
// farm's refresh while open and stops when closed, it never becomes the
// desktop's tab, and a timeline row's transcript reaches the phone as its own
// session page.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
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
    env: { clipboard: { writeText: t => { pcSide.push('clipboard:' + t); return Promise.resolve(); } } },
    window: {
        createWebviewPanel: () => { throw new Error('no desktop tab for a phone'); },
        showErrorMessage: m => { pcSide.push('error:' + m); return Promise.resolve(undefined); },
        showInformationMessage: m => { pcSide.push('info:' + m); return Promise.resolve(undefined); },
        showWarningMessage: m => { pcSide.push('warn:' + m); return Promise.resolve(undefined); },
        showQuickPick: () => { pcSide.push('pick'); return Promise.resolve(undefined); },
        showInputBox: () => { pcSide.push('input'); return Promise.resolve(undefined); },
        showOpenDialog: () => { pcSide.push('open'); return Promise.resolve(undefined); },
        showTextDocument: () => { pcSide.push('doc'); return Promise.resolve(undefined); }
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
const { ProjectsPanel } = require(path.join(ROOT, 'out', 'panels', 'projectsPanel.js'));
const { RemoteViews, messageScope } = require(path.join(ROOT, 'out', 'panels', 'remoteViews.js'));
const { remotePages } = require(path.join(ROOT, 'out', 'panels', 'remotePages.js'));
Module._load = origLoad;
const { scopeAtLeast } = require(path.join(ROOT, 'out', 'remote', 'index.js'));

// ---------- the host's side: what the page reads, and a log of what it was asked to do ----------
const calls = [];
const project = {
    id: 'p1', name: 'Tarla Projesi', status: 'active', kind: 'product', summary: 'çiftlik',
    folder: 'D:\\v\\p', folderState: 'ok', repos: [], parentId: null, tags: [], people: [],
    agentRules: [], budgetUSD: 0, budgetTotalUSD: 0, sessions: 1, cost: 0, todayCost: 0, tokens: 0, lastTs: Date.now(), warnings: []
};
const logged = name => (...a) => { calls.push(name); return {}; };
const onPc = name => (...a) => { pcSide.push('dep:' + name); return Promise.resolve(undefined); };
const deps = {
    extensionUri: uri('/ext'),
    data: () => ({
        generatedAt: Date.now(), projects: [project], agents: ['developer'], activeId: 'p1', activeName: project.name,
        projectsRoot: 'D:\\v', unassigned: { sessions: 0, cost: 0 }, unfiledKinds: []
    }),
    tabData: req => { calls.push('tab:' + req.tab); return {}; },
    docOpenModes: () => ({ mode: 'vscode', modes: ['vscode'], labels: {} }),
    sessionTurns: () => [],
    suggestFolder: name => 'D:\\v\\' + name,
    backlogAdd: (id, input) => { calls.push('backlogAdd:' + id + ':' + input.text); return { code: 'P-9' }; },
    backlogMove: (id, code, dir, by, to) => { calls.push(['backlogMove', id, code, dir, by, to].join(':')); return {}; },
    backlogState: logged('backlogState'), planCheck: logged('planCheck'), savePeople: () => { calls.push('savePeople'); return undefined; },
    remove: id => { calls.push('remove:' + id); },
    // everything below opens something on the PC
    openLink: onPc('openLink'), browseFolder: onPc('browseFolder'), pickFolder: onPc('pickFolder'),
    revealFolder: onPc('revealFolder'), openSessions: onPc('openSessions'), rescan: onPc('rescan'),
    handover: onPc('handover'), archive: onPc('archive'), saveTemplate: onPc('saveTemplate'),
    openProjectDoc: onPc('openProjectDoc'), backlogOpenItem: onPc('backlogOpenItem'),
    startSession: onPc('startSession'), newTask: onPc('newTask'), newSchedule: onPc('newSchedule'),
    newTrigger: onPc('newTrigger'), openTask: onPc('openTask'), openMission: onPc('openMission'),
    openNotice: onPc('openNotice'), openQueueItem: onPc('openQueueItem'), openSchedule: onPc('openSchedule'),
    openTrigger: onPc('openTrigger')
};
const settle = () => new Promise(r => setTimeout(r, 5));
const alive = setInterval(() => undefined, 1000);

(async () => {
    // ---- what each message needs ----
    const spec = remotePages({ projects: () => undefined }).projects;
    ok('the Projects page is a phone page: open to read, changing anything to manage',
        !!spec && spec.open === 'read' && spec.act === 'manage');
    ok('the list, a tab, a document, the sessions table, a row\'s turns and a folder suggestion are looks',
        ['refresh', 'view', 'setTableN', 'sessionTurns', 'selectDoc', 'suggestFolder'].every(t => messageScope(spec, t) === 'read'));
    ok('creating, editing, removing, the plan, the backlog, the track, the people, filing, a task\'s retry and a session\'s pin or stop are manage',
        ['create', 'save', 'delete', 'setActive', 'recreateFolder', 'newDoc', 'planCheck', 'planAdd', 'backlogAdd', 'backlogState',
            'backlogHold', 'backlogSet', 'backlogMove', 'backlogReorder', 'backlogGather', 'backlogJoinParent', 'backlogTidy',
            'backlogCode', 'backlogArchive', 'trackRecord', 'trackBackfill', 'trackRebuild', 'savePeople', 'applyBackfill',
            'taskAction', 'pinSession', 'interruptSession'].every(t => messageScope(spec, t) === 'manage'));
    const PC = ['openLink', 'openSession', 'focusTerminal', 'browseFolder', 'pickFolder', 'revealFolder', 'openSessions', 'rescan',
        'handover', 'archive', 'saveTemplate', 'openDoc', 'backlogOpenItem', 'queueAdd', 'startSession', 'newTask',
        'newSchedule', 'newTrigger', 'openWorkRow', 'afnav'];
    ok('a picker, an editor, a terminal, a new session, a Tasks form and another page never run from a phone',
        PC.every(t => messageScope(spec, t) === null));

    // ---- the page on a phone ----
    let made;
    const views = new RemoteViews({
        media: uri('/ext/media'), atLeast: scopeAtLeast, waitMs: 60,
        pages: remotePages({ projects: host => { made = host; ProjectsPanel.openOn(host, deps); } })
    });
    const reader = { device: 'dev_r', scope: 'read' };
    const toReader = [];
    ok('the Projects page opens on a phone', views.open(reader, 'r1', 'projects', undefined, m => toReader.push(m)) === true);
    ok('‼️ a phone\'s view never becomes the desktop\'s tab', ProjectsPanel.current === undefined && made && made.remote === true);
    const page = (await views.page('/view/projects?view=r1', reader)).body;
    ok('its page and script load from /res/', page.includes('src="/res/projects.js"') && page.includes('href="/res/common.css"') && !/vscode-webview:|file:\/\//.test(page));
    ok('…with the farm\'s projects in it', page.includes('Tarla Projesi'));

    views.message(reader, 'r1', { type: 'view', project: 'p1', tab: 'backlog', kinds: [] });
    await settle();
    ok('a read device opens a project\'s tab: the host builds that tab', calls.includes('tab:backlog')
        && toReader.some(m => m.type === 'data' && m.data.tab === 'backlog' && m.data.tabProject === 'p1'));
    views.message(reader, 'r1', { type: 'backlogAdd', id: 'p1', text: 'okuyucu yazamaz' });
    views.message(reader, 'r1', { type: 'delete', id: 'p1', name: 'Tarla Projesi' });
    await settle();
    ok('‼️ a read device changes nothing', !calls.some(c => /^backlogAdd|^remove/.test(c)) && !toReader.some(m => m.type === 'afAsk'));

    const manager = { device: 'dev_m', scope: 'manage' };
    const toM = [];
    views.open(manager, 'm1', 'projects', undefined, m => toM.push(m));
    await views.page('/view/projects?view=m1', manager);
    views.message(manager, 'm1', { type: 'backlogAdd', id: 'p1', text: 'telefondan not' });
    await settle();
    ok('a manage device adds to the backlog, and hears how it went', calls.includes('backlogAdd:p1:telefondan not')
        && toM.some(m => m.type === 'result' && /P-9/.test(String(m.ok))));
    views.message(manager, 'm1', { type: 'backlogMove', id: 'p1', code: 'k-1', to: 33 });
    await settle();
    ok('U-240 — a place in the queue reaches the host as one: the code and the place, no steps',
        calls.includes('backlogMove:p1:K-1:up::33'));

    pcSide.length = 0;
    views.message(manager, 'm1', { type: 'delete', id: 'p1', name: 'Tarla Projesi' });
    await settle();
    const q = toM.find(m => m.type === 'afAsk' && /Remove "Tarla Projesi"/.test(String(m.message)));
    ok('‼️ removing a project asks ON THE PHONE, never on the PC', !!q && pcSide.length === 0 && !calls.includes('remove:p1'));
    views.message(manager, 'm1', { type: 'afAskAnswer', id: q && q.id, value: 0 });
    await settle();
    ok('…and the phone\'s yes removes it', calls.includes('remove:p1') && toM.some(m => m.type === 'result' && /removed/.test(String(m.ok))));

    pcSide.length = 0;
    for (const t of PC) { views.message(manager, 'm1', { type: t, id: 'p1', rowId: 'x', what: 'task', link: { to: 'file', path: 'C:/x' }, file: 'C:/x.jsonl' }); }
    await settle();
    ok('‼️ nothing a phone sends opens a picker, an editor, a terminal or another page on the PC', pcSide.length === 0);

    const before = toM.filter(m => m.type === 'data').length;
    ProjectsPanel.refreshIfOpen();
    await settle();
    ok('the farm\'s refresh reaches the phone\'s view while it is open', toM.filter(m => m.type === 'data').length === before + 1);
    views.close(manager, 'm1');
    views.close(reader, 'r1');
    const closed = toM.length;
    ProjectsPanel.refreshIfOpen();
    await settle();
    ok('…and stops once it is closed: no closed view is kept', toM.length === closed && ProjectsPanel.phones.size === 0);

    // ---- the host's wiring, read off the source ----
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('the host makes the phone\'s Projects page from the page\'s own deps', /projects: host => ProjectsPanel\.openOn\(host, projectsPanelDeps\(\)\)/.test(ext));
    const panel = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'projectsPanel.ts'), 'utf8');
    ok('the desktop tab is made through desktopHost(), and the removal asks its host',
        /desktopHost\(\{ viewType: 'agentfarm\.projects'/.test(panel) && /await this\.host\.ask\.warn\(\s*`Remove "/.test(panel));

    // ---- on a phone: one column, nothing that would act on the PC, rows that read at 360px ----
    const js = fs.readFileSync(path.join(ROOT, 'media', 'projects.js'), 'utf8');
    ok('the list stands above the open project, a form is one field wide',
        /html\.af-phone \.pj-wrap \{ flex-direction:column;/.test(js) && /html\.af-phone \.pj-list \{ flex:none; width:100%;/.test(js)
        && /html\.af-phone \.pj-grid \{ grid-template-columns:minmax\(0,1fr\); \}/.test(js));
    const hidden = (/\/\* what opens a picker[^*]*\*\/([\s\S]*?)\{ display:none; \}/.exec(js) || [])[1] || '';
    ok('‼️ every PC-only button of the page is off the phone',
        ['rescan', 'nBrowse', 'pickFolder', 'revealFolder', 'handover', 'saveTemplate', 'archive', 'restore', 'openSessions']
            .every(a => hidden.includes(`[data-act="${a}"]`)) && /\[data-work\]/.test(hidden)
        && /button\[data-open\]/.test(hidden) && /button\[data-blgo\]/.test(hidden));
    ok('a backlog row wraps its words over its badges and keeps its actions on screen',
        /html\.af-phone \.pj-bl-row \{ flex-wrap:wrap;/.test(js) && /html\.af-phone \.pj-bl-act \{ visibility:visible; \}/.test(js));
    ok('‼️ a timeline row\'s areas are its own: a work row shares the cell classes and has its own areas',
        /html\.af-phone \.pj-ev > \.pj-ev-g \{ grid-area:g; \}/.test(js) && !/html\.af-phone \.pj-ev-g \{/.test(js)
        && /html\.af-phone \.pj-wrow \{ grid-template-columns:18px minmax\(0,1fr\) auto;\s*grid-template-areas:'g t a' '\. m m';/.test(js));

    // ---- a timeline row's transcript, on the phone ----
    const posted = [];
    const win = { afShell: { post: s => posted.push(JSON.parse(s)) }, sessionStorage: { getItem: () => null, setItem: () => undefined } };
    win.window = win;
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'media', 'afRemote.js'), 'utf8'), Object.assign(win, { location: { pathname: '/view/projects', search: '?view=a' } }));
    win.acquireVsCodeApi().postMessage({ type: 'openLink', link: { to: 'session', file: 'C:/t/sess1.jsonl', ts: 1790000000000 } });
    win.acquireVsCodeApi().postMessage({ type: 'openLink', link: { to: 'file', path: 'C:/t/a.md' } });
    ok('‼️ a timeline row\'s transcript opens the phone\'s session page at that moment',
        JSON.stringify(posted[0]) === JSON.stringify({ type: 'afnav', to: 'session', args: { file: 'C:/t/sess1.jsonl', ts: 1790000000000 } }));
    ok('…any other link goes to the farm unchanged (and stays on the PC)', posted[1] && posted[1].type === 'openLink');

    clearInterval(alive);
    console.log(`\nprojects on a phone: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL threw: ' + (e && e.stack || e)); process.exit(1); });
