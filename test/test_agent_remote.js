// X-456 — AN AGENT'S PAGE ON A PHONE. The same AgentDetailPanel, drawn on a
// phone's view: it opens for an agent the farm knows (and is "unavailable" for
// one it does not), loads from /res/, a read device reads and cannot write a
// duty, a manage device adds one and the CLAUDE.md offer and a delete's
// question are asked ON THE PHONE, nothing a phone sends opens a picker, a
// file, a session, the sidebar or another page on the PC, the view follows the
// farm while open and stops when closed, it never becomes a desktop tab, and an
// agent's name on any phone page opens this page.
'use strict';
const fs = require('fs');
const os = require('os');
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
        getConfiguration: () => ({ get: (_k, d) => d, update: async () => { pcSide.push('pricing-written'); } }),
        workspaceFolders: [], onDidChangeConfiguration: new EventEmitter().event
    }
};
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') { return vscodeStub; }
    return origLoad.apply(this, arguments);
};
const { AgentDetailPanel } = require(path.join(ROOT, 'out', 'panels', 'agentDetail.js'));
const { RemoteViews, messageScope } = require(path.join(ROOT, 'out', 'panels', 'remoteViews.js'));
const { remotePages } = require(path.join(ROOT, 'out', 'panels', 'remotePages.js'));
const { discoverAgents } = require(path.join(ROOT, 'out', 'core', 'agents.js'));
Module._load = origLoad;
const { scopeAtLeast } = require(path.join(ROOT, 'out', 'remote', 'index.js'));

// ---------- one real agent folder: a CLAUDE.md that does not mention DUTIES.md yet ----------
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'af-agent-remote-'));
const dir = path.join(root, 'tarlaci');
fs.mkdirSync(dir);
const claudeMd = path.join(dir, 'CLAUDE.md');
fs.writeFileSync(claudeMd, '# Tarlacı\n\nTarlayı sular.\n', 'utf8');
const dutiesFile = path.join(dir, 'DUTIES.md');
let agents = discoverAgents([root]);
const agent = agents[0];
const indexUpdated = new EventEmitter();
const deps = {
    extensionUri: uri('/ext'),
    getAgents: () => agents,
    index: {
        forAgent: () => [], forAgentWithExternal: () => [], isAgentActive: () => false, isSessionActive: () => false,
        onDidUpdate: indexUpdated.event
    },
    getInsights: () => [],
    getPricing: () => ({ costFor: () => 0, currentRules: () => [] }),
    contextBudget: () => 0,
    taskRecords: () => [],
    refreshAll: () => { agents = discoverAgents([root]); }
};
const settle = () => new Promise(r => setTimeout(r, 10));
const alive = setInterval(() => undefined, 1000);
const duties = () => (fs.existsSync(dutiesFile) ? fs.readFileSync(dutiesFile, 'utf8') : '');

(async () => {
    ok('the fixture is an agent the farm knows', !!agent && agent.name === 'tarlaci');

    // ---- what each message needs ----
    const spec = remotePages({ agent: () => true }).agent;
    ok('an agent\'s page is a phone page: open to read, changing it to manage',
        !!spec && spec.open === 'read' && spec.act === 'manage');
    ok('the page, its sessions table and a row\'s turns are looks',
        ['refresh', 'setTableN', 'sessionTurns'].every(t => messageScope(spec, t) === 'read'));
    ok('a duty\'s form and acts, the model rates and a session\'s pin or stop are manage (as duties.* and pricing.set are)',
        ['duty-save', 'duty-act', 'savePricing', 'pinSession', 'interruptSession'].every(t => messageScope(spec, t) === 'manage'));
    const PC = ['af-browse', 'openFile', 'openSession', 'focusTerminal', 'startSession', 'launchSession', 'consoleSession',
        'continueSession', 'reveal', 'openMemoryGraph', 'memCard', 'openDashboard', 'openTimeline', 'openGuide', 'afnav'];
    ok('a picker, a file, a new or continued session, the sidebar, the memory graph, another page and the guide never run from a phone',
        PC.every(t => messageScope(spec, t) === null));

    // ---- the page on a phone ----
    const views = new RemoteViews({
        media: uri('/ext/media'), atLeast: scopeAtLeast, waitMs: 60,
        pages: remotePages({ agent: (host, args) => AgentDetailPanel.openOn(host, typeof args?.agentId === 'string' ? args.agentId : '', deps) })
    });
    const reader = { device: 'dev_r', scope: 'read' };
    const toReader = [];
    ok('‼️ an agent the farm does not know is "unavailable"', views.open(reader, 'x1', 'agent', { agentId: path.join(root, 'yok') }, () => undefined) === false);
    ok('an agent\'s page opens on a phone', views.open(reader, 'r1', 'agent', { agentId: agent.id }, m => toReader.push(m)) === true);
    ok('‼️ a phone\'s view never becomes a desktop tab', AgentDetailPanel.open.size === 0 && AgentDetailPanel.phones.size === 1);
    const page = (await views.page('/view/agent?view=r1', reader)).body;
    ok('its page and script load from /res/', page.includes('src="/res/agentDetail.js"') && page.includes('href="/res/common.css"') && !/vscode-webview:|file:\/\//.test(page));
    ok('…with that agent in it', page.includes('tarlaci'));

    views.message(reader, 'r1', { type: 'refresh' });
    views.message(reader, 'r1', { type: 'duty-save', duty: { mode: 'new', title: 'Okuyucu yazamaz', action: 'hiçbir şey' } });
    await settle();
    ok('a read device reads the page', toReader.some(m => m.type === 'data'));
    ok('‼️ …and writes no duty', duties() === '');

    const manager = { device: 'dev_m', scope: 'manage' };
    const toM = [];
    views.open(manager, 'm1', 'agent', { agentId: agent.id }, m => toM.push(m));
    await views.page('/view/agent?view=m1', manager);
    pcSide.length = 0;
    views.message(manager, 'm1', { type: 'duty-save', duty: { mode: 'new', title: 'Sabah sulaması', action: 'tarlayı sula', cadence: 'daily' } });
    await settle();
    ok('a manage device adds a duty', /Sabah sulaması/.test(duties()));
    const offer = toM.find(m => m.type === 'afAsk' && /Append a short instruction section/.test(String(m.message)));
    ok('‼️ the CLAUDE.md offer is asked ON THE PHONE, never on the PC', !!offer && pcSide.length === 0);
    views.message(manager, 'm1', { type: 'afAskAnswer', id: offer && offer.id, value: 0 });
    await settle();
    ok('…and the phone\'s yes appends the reference', /DUTIES\.md/.test(fs.readFileSync(claudeMd, 'utf8')));
    ok('the form hears the receipt', toM.some(m => m.type === 'duty-msg' && m.ok === true));

    views.message(manager, 'm1', { type: 'duty-act', act: 'del', title: 'Sabah sulaması' });
    await settle();
    const del = toM.find(m => m.type === 'afAsk' && /Delete duty "Sabah sulaması"/.test(String(m.message)));
    ok('‼️ deleting a duty asks on the phone', !!del && pcSide.length === 0 && /Sabah sulaması/.test(duties()));
    views.message(manager, 'm1', { type: 'afAskAnswer', id: del && del.id, value: 0 });
    await settle();
    ok('…and the phone\'s yes deletes it', !/Sabah sulaması/.test(duties()));

    views.message(manager, 'm1', { type: 'savePricing', rules: [{ match: 'opus', input: 15, output: 75 }] });
    await settle();
    ok('the model rates are written, and their receipt is said on the phone',
        pcSide.join() === 'pricing-written' && toM.some(m => m.type === 'afAsk' && /model rates saved/.test(String(m.message))));

    pcSide.length = 0;
    for (const t of PC) { views.message(manager, 'm1', { type: t, path: 'C:/x.md', file: 'C:/x.jsonl', surface: 'console', to: 'search', card: 'copy' }); }
    await settle();
    ok('‼️ nothing a phone sends opens a picker, a file, a session, the sidebar or another page on the PC', pcSide.length === 0);

    const before = toM.filter(m => m.type === 'data').length;
    AgentDetailPanel.refreshIfOpen();
    indexUpdated.fire();
    await settle();
    ok('the farm\'s refresh and the index reach the phone\'s view while it is open', toM.filter(m => m.type === 'data').length === before + 2);
    views.close(manager, 'm1');
    views.close(reader, 'r1');
    const closed = toM.length;
    AgentDetailPanel.refreshIfOpen();
    indexUpdated.fire();
    await settle();
    ok('…and stops once it is closed: no closed view is kept', toM.length === closed && AgentDetailPanel.phones.size === 0
        && indexUpdated.listeners.length === 0);

    // ---- the host's wiring, read off the source ----
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('the host makes the phone\'s agent page from the page\'s own deps',
        /agent: \(host, args\) => AgentDetailPanel\.openOn\(host, typeof args\?\.agentId === 'string' \? args\.agentId : '', detailDeps\)/.test(ext));
    const panel = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'agentDetail.ts'), 'utf8');
    ok('the desktop tab is made through desktopHost(), and the page\'s questions ask its host',
        /desktopHost\(\{ viewType: 'agentfarm\.agentDetail'/.test(panel) && /ensureDutiesReference\(agent, this\.host\.ask\)/.test(panel)
        && /const yes = await this\.host\.ask\.warn\(\s*`Delete duty/.test(panel) && /\.then\(\(\) => this\.host\.ask\.info\(/.test(panel));

    // ---- on a phone: nothing that would act on the PC, the dense tables as cards ----
    const js = fs.readFileSync(path.join(ROOT, 'media', 'agentDetail.js'), 'utf8');
    ok('‼️ the start, launch and continue menus, the folder and the file buttons are off the phone',
        /html\.af-phone \[data-afclaim="start"\], html\.af-phone \[data-afclaim="launch"\],\s*html\.af-phone \[data-afclaim="continue"\], html\.af-phone #reveal, html\.af-phone button\[data-file\] \{ display:none; \}/.test(js));
    ok('the duty table is cards: its head, every row, the state first, the title leading, every figure under its column\'s name',
        /<table data-afcards>\s*<tr data-afcardhead><th><\/th><th>Duty<\/th>/.test(js) && /<tr data-afcard style=/.test(js)
        && /<td data-first>\$\{d\.missing/.test(js) && /<td data-lead><strong>\$\{C\.esc\(d\.title\)\}/.test(js)
        && ['Cadence', 'Watch', 'Do', 'Status'].every(l => js.includes(`data-label="${l}"`)));
    ok('…and so is the memory table',
        /<table data-afcards>\s*<tr data-afcardhead><th>File<\/th>/.test(js) && /<tr class="click" data-afcard data-file=/.test(js)
        && /<td data-lead>\$\{C\.esc\(f\.name\)\}/.test(js) && ['Size', 'Tokens', 'Modified', 'Recalls 30d'].every(l => js.includes(`data-label="${l}"`)));

    // ---- an agent's name on any phone page ----
    const posted = [];
    const win = { afShell: { post: s => posted.push(JSON.parse(s)) }, sessionStorage: { getItem: () => null, setItem: () => undefined } };
    win.window = win;
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'media', 'afRemote.js'), 'utf8'), Object.assign(win, { location: { pathname: '/view/dashboard', search: '?view=a' } }));
    win.acquireVsCodeApi().postMessage({ type: 'openAgent', agentId: 'd:/zone/agent/ajanlar/developer' });
    win.acquireVsCodeApi().postMessage({ type: 'openAgent', cwd: 'D:/x' });
    ok('‼️ an agent\'s name, card or row opens that agent\'s page on the phone',
        JSON.stringify(posted[0]) === JSON.stringify({ type: 'afnav', to: 'agent', args: { agentId: 'd:/zone/agent/ajanlar/developer' } }));
    ok('…one that names no agent goes to the farm unchanged (and stays on the PC)', posted[1] && posted[1].type === 'openAgent');

    fs.rmSync(root, { recursive: true, force: true });
    clearInterval(alive);
    console.log(`\nan agent's page on a phone: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL threw: ' + (e && e.stack || e)); try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* */ } process.exit(1); });
