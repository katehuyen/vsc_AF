// X-456 — THE MEMORY GRAPH ON A PHONE. Its looks include the index repair plan and the shared files,
// which ask manage over the bridge (memory.index.plan, memory.duplicates), so the page asks manage to
// look and to act like the memory.* ops. A new memory, a copy, an index repair, a fleet question (no
// progress toast on the PC) and a sync (its overwrite asked on the phone) are the acts, told on the
// phone. A file in the PC's editor, a distillation (it ends in the PC's diff editor and its decision,
// so a phone's view is built without it), a comparison and a merge draft (the PC's editor), the guide
// and another page stay on the PC; it never becomes the desktop's tab.
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
const fileUri = p => ({ scheme: 'file', path: p.replace(/\\/g, '/'), fsPath: p, toString: () => 'file://' + p });
const pcSide = [];
const vscodeStub = {
    EventEmitter,
    Uri: { joinPath: (b, ...parts) => fileUri([b.path, ...parts].join('/')), file: fileUri, parse: fileUri },
    ViewColumn: { One: 1, Active: -1 },
    ProgressLocation: { Notification: 15 },
    env: { openExternal: u => { pcSide.push('external:' + u); return Promise.resolve(true); } },
    window: {
        createWebviewPanel: () => { throw new Error('no desktop tab for a phone'); },
        showErrorMessage: m => { pcSide.push('error:' + m); return Promise.resolve(undefined); },
        showInformationMessage: m => { pcSide.push('info:' + m); return Promise.resolve(undefined); },
        showWarningMessage: m => { pcSide.push('warn:' + m); return Promise.resolve(undefined); },
        showOpenDialog: () => { pcSide.push('open-dialog'); return Promise.resolve(undefined); },
        showTextDocument: () => { pcSide.push('editor'); return Promise.resolve(undefined); },
        withProgress: (_o, fn) => { pcSide.push('progress'); return fn({ report: () => undefined }); }
    },
    commands: { executeCommand: (...a) => { pcSide.push('command:' + a[0]); return Promise.resolve(undefined); } },
    workspace: {
        getConfiguration: () => ({ get: (_k, d) => d }), workspaceFolders: [],
        openTextDocument: () => { pcSide.push('untitled'); return Promise.resolve({}); }
    }
};
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') { return vscodeStub; }
    return origLoad.apply(this, arguments);
};
const { MemoryGraphPanel } = require(path.join(ROOT, 'out', 'panels', 'memoryGraph.js'));
const { RemoteViews, messageScope } = require(path.join(ROOT, 'out', 'panels', 'remoteViews.js'));
const { remotePages } = require(path.join(ROOT, 'out', 'panels', 'remotePages.js'));
const { discoverAgents } = require(path.join(ROOT, 'out', 'core', 'agents.js'));
Module._load = origLoad;
const { scopeAtLeast, requiredScope } = require(path.join(ROOT, 'out', 'remote', 'scopes.js'));
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'af-memphone-'));
const AGENTS = path.join(TMP, 'agents');
const agentDir = (name, files) => {
    const dir = path.join(AGENTS, name), mem = path.join(dir, 'memory');
    fs.mkdirSync(mem, { recursive: true });
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# ' + name + '\n');
    for (const [f, text] of Object.entries(files)) { fs.writeFileSync(path.join(mem, f), text); }
    return dir;
};
const DEV = agentDir('dev', {
    'MEMORY.md': '- [Project X](project-x.md) — a project\n- [Shared](shared.md) — shared\n',
    'project-x.md': '---\nname: project-x\ndescription: a project\nmetadata:\n  type: project\n---\nSee [[shared]].\n',
    'orphan.md': '---\nname: orphan\ndescription: nobody points here\n---\nalone\n',
    'shared.md': 'the dev copy\n'
});
const MGR = agentDir('manager', { 'MEMORY.md': '- [Shared](shared.md) — shared\n', 'shared.md': 'the manager copy, older\n' });
const getAgents = () => discoverAgents([AGENTS]);
const asked = [];
let merged = null, distilled = 0, refreshed = 0;
const deps = {
    extensionUri: fileUri(ROOT), getAgents, index: { forAgent: () => [] },
    refreshAll: () => { refreshed++; },
    staleDays: () => 45, embeddingsOn: () => true,
    setPendingMerge: (name, files) => { merged = { name, files }; },
    askMemory: (query, onPc) => {
        asked.push({ query, onPc });
        return Promise.resolve({ hits: [{ agent: 'dev', title: 'Project X', score: 0.8, text: 'a project', file: path.join(DEV, 'memory', 'project-x.md') }] });
    },
    distill: () => { distilled++; return Promise.resolve({ applied: false }); }
};
const settle = (ms = 30) => new Promise(r => setTimeout(r, ms));
const alive = setInterval(() => undefined, 1000);

(async () => {
    const devId = getAgents().find(a => a.name === 'dev').id;
    ok('the fixture is two agents with memory', getAgents().length === 2 && !!devId);

    // ---- what each message needs ----
    const R = remotePages({ memgraph: () => undefined }).memgraph;
    ok('‼️ the page asks manage to open and to act — its index repair plan and its shared files ask the same over the bridge',
        R && R.open === 'manage' && R.act === 'manage'
        && ['memory.index.plan', 'memory.duplicates', 'memory.add', 'memory.copy', 'memory.index.fix', 'memory.sync', 'memory.ask']
            .every(op => requiredScope(op) === 'manage'));
    ok('a new memory, a copy, an index repair, a question and a sync are its acts',
        ['mem-save', 'mem-fix', 'mem-ask', 'mem-sync'].every(t => messageScope(R, t) === 'manage') && messageScope(R, 'refresh') === 'manage');
    const PC = ['open', 'mem-distill', 'openGuide', 'afnav'];
    ok('‼️ a file in the PC\'s editor, a distillation, the guide and another page never run from a phone',
        PC.every(t => messageScope(R, t) === null));

    // ---- the page on a phone ----
    const made = {};
    const views = new RemoteViews({
        media: fileUri(path.join(ROOT, 'media')), atLeast: scopeAtLeast, waitMs: 60,
        pages: remotePages({ memgraph: (host, args) => { made.m = host; MemoryGraphPanel.openOn(host, deps, typeof args?.agentId === 'string' ? args.agentId : undefined); } })
    });
    const reader = { device: 'dev_r', scope: 'read' }, manager = { device: 'dev_m', scope: 'manage' };
    ok('‼️ a phone paired to read does not open it', views.open(reader, 'r1', 'memgraph', undefined, () => undefined) === false && !made.m);
    const toM = [];
    ok('a manage phone opens it, never as the desktop\'s tab', views.open(manager, 'm1', 'memgraph', { agentId: devId }, m => toM.push(m)) === true
        && made.m && made.m.remote === true && MemoryGraphPanel.current === undefined);
    const body = (await views.page('/view/memgraph?view=m1', manager)).body;
    ok('…from /res/, with the agents\' memory', body.includes('src="/res/memgraph.js"') && body.includes('project-x.md') && body.includes('orphan.md'));
    ok('…on the agent it was asked for', body.includes('"selectAgentId":' + JSON.stringify(devId)));
    ok('‼️ a phone\'s view is built without the distillation — it ends in the PC\'s diff editor', body.includes('"canDistill":false'));

    pcSide.length = 0;
    const toOther = [];
    views.open(manager, 'm2', 'memgraph', undefined, m => toOther.push(m));
    const msgs = () => toM.filter(m => m.type === 'mem-msg');
    views.message(manager, 'm1', { type: 'mem-save', mem: { mode: 'new', agentId: devId, name: 'from-phone', type: 'project', description: 'written on a phone' } });
    await settle();
    ok('‼️ a new memory lands from the phone, indexed, with no editor opened on the PC',
        fs.existsSync(path.join(DEV, 'memory', 'from-phone.md')) && /from-phone\.md/.test(fs.readFileSync(path.join(DEV, 'memory', 'MEMORY.md'), 'utf8'))
        && !pcSide.includes('editor'));
    ok('…and the phone is told its body is written on the PC', msgs().some(m => m.ok === true && /on the PC/.test(m.text)));
    ok('‼️ a change made on one view redraws every other view of the page', toOther.some(m => m.type === 'data' && JSON.stringify(m.data).includes('from-phone.md')));
    views.close(manager, 'm2');

    const plan = JSON.parse(body.match(/window\.__DATA__ = (\{[\s\S]*?\}); window\.__AFUI__/)?.[1] || '{}');
    const devEntry = (plan.agents || []).find(a => a.id === devId);
    const addOrphan = devEntry && devEntry.fixes.find(f => f.target === 'orphan.md');
    views.message(manager, 'm1', { type: 'mem-fix', agentId: devId, lines: addOrphan ? [addOrphan.line] : [] });
    await settle();
    ok('an index repair lands from the phone', !!addOrphan && /orphan\.md/.test(fs.readFileSync(path.join(DEV, 'memory', 'MEMORY.md'), 'utf8')));

    views.message(manager, 'm1', { type: 'mem-ask', query: 'what is project x' });
    await settle();
    ok('‼️ a fleet question from the phone runs with no progress toast on the PC', asked.length === 1 && asked[0].onPc === false && !pcSide.includes('progress'));
    ok('…and its answers reach the phone', toM.some(m => m.type === 'mem-hits' && m.hits.length === 1));

    const devShared = path.join(DEV, 'memory', 'shared.md'), mgrShared = path.join(MGR, 'memory', 'shared.md');
    views.message(manager, 'm1', { type: 'mem-sync', act: 'diff', name: 'shared.md', left: devShared, right: mgrShared });
    views.message(manager, 'm1', { type: 'mem-sync', act: 'merge', name: 'shared.md' });
    await settle();
    ok('‼️ a comparison and a merge draft open nothing on the PC from a phone, and say where they are done',
        !pcSide.some(s => /^command:|untitled/.test(s)) && merged === null && msgs().filter(m => !m.ok && /PC/.test(m.text)).length === 2);

    const asks = () => toM.filter(m => m.type === 'afAsk' && m.kind === 'message');
    views.message(manager, 'm1', { type: 'mem-sync', act: 'sync', name: 'shared.md', source: devShared });
    await settle();
    const q = asks().pop();
    ok('‼️ the overwrite is asked on the phone', q && q.modal === true && q.level === 'warn' && q.buttons.join() === 'Sync' && !pcSide.some(s => /^warn:/.test(s)));
    views.message(manager, 'm1', { type: 'afAskAnswer', id: q.id, value: 0 });
    await settle();
    ok('…and done there', fs.readFileSync(mgrShared, 'utf8') === 'the dev copy\n' && msgs().some(m => m.ok === true && /synced/.test(m.text)));

    for (const t of PC) { views.message(manager, 'm1', { type: t, path: devShared, agentId: devId, to: 'tasks' }); }
    await settle();
    ok('‼️ nothing PC-only a phone sends opens or distils anything on the PC', pcSide.length === 0 && distilled === 0);
    const datas = () => toM.filter(m => m.type === 'data').length;
    const n0 = datas();
    MemoryGraphPanel.refreshIfOpen();
    await settle();
    ok('the farm\'s refresh reaches the phone', datas() > n0 && refreshed > 0);
    const desk = { refresh: () => undefined };
    MemoryGraphPanel.current = desk;
    views.close(manager, 'm1');
    ok('a closed view leaves no instance behind, and the desktop\'s tab alone', MemoryGraphPanel.phones.size === 0 && MemoryGraphPanel.current === desk);
    MemoryGraphPanel.current = undefined;

    // ---- the page as a phone draws it ----
    const DATA = { ...plan, selectAgentId: devId };
    const phone = runPage('memgraph.js', DATA, { __AFUI__: { remote: true } });
    phone.query('[data-memcard="sync"]')[0].click();
    ok('‼️ the shared card on a phone offers the source of truth, not the PC\'s comparison or merge draft',
        phone.html().includes('data-af="source"') && !phone.html().includes('data-memact='));
    phone.query('[data-memcard="ask"]')[0].click();
    phone.send({ type: 'mem-hits', query: 'x', hits: [{ agent: 'dev', title: 'Project X', score: 0.8, text: 'a project', file: devShared }] });
    ok('…an answer on a phone is read there, not opened in the PC\'s editor', phone.html().includes('Project X') && !phone.html().includes('data-memopen='));
    const before = phone.posted.length;
    (phone.query('[data-open]')[0] || { click: () => undefined }).click();
    ok('…and a node or a name is not a link to the PC\'s editor there', phone.posted.length === before
        && !phone.html().includes('data-open=') && phone.html().includes('<style>.pcclick { display:none }</style>'));
    const src = fs.readFileSync(path.join(ROOT, 'media', 'memgraph.js'), 'utf8');
    ok('‼️ on a phone the graph keeps its size and scrolls sideways, opened on its middle once afMobile.js has marked the phone',
        src.includes('html.af-phone .chartbox { overflow-x:auto }') && src.includes('html.af-phone .chartbox svg { min-width:900px }')
        && /box\.scrollLeft = \(box\.scrollWidth - box\.clientWidth\) \/ 2/.test(src)
        && src.includes("document.addEventListener('DOMContentLoaded', centreGraph)"));
    const desktop = runPage('memgraph.js', DATA);
    desktop.query('[data-memcard="sync"]')[0].click();
    ok('the desktop keeps its comparison and merge draft', desktop.html().includes('data-memact="diff"') && desktop.html().includes('data-memact="merge"'));
    ok('…and its nodes and names still open their file', desktop.html().includes('<g class="node" data-open="')
        && desktop.html().includes('<button class="linkish" data-open="'));

    // ---- the host's wiring ----
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('the phone and the palette open it from the same deps', /memgraph: \(host, args\) => MemoryGraphPanel\.openOn\(host, memGraphDeps,/.test(ext)
        && /MemoryGraphPanel\.show\(memGraphDeps, agentId\)/.test(ext));
    ok('‼️ a phone\'s question reaches the fleet search without the PC\'s progress', /askMemory: \(query: string, onPc\?: boolean\) => askFleetMemory\(query, 12, onPc\)/.test(ext)
        && /return !onPc \? await run\(\(\) => undefined\) : await vscode\.window\.withProgress\(/.test(ext));

    clearInterval(alive);
    fs.rmSync(TMP, { recursive: true, force: true });
    console.log(`\nmemory graph on a phone: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL threw: ' + (e && e.stack || e)); process.exit(1); });
