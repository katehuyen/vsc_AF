// X-456 — THE AIRTABLE ENGINE PAGE ON A PHONE. Opening it probes the live instances, which asks
// manage over the bridge (airtable.instances), so the page asks manage to look and to act like the
// airtable.* ops. A default, a folder's removal, the MCP registration (its question asked on the
// phone), a tools probe (no progress toast on the PC) and a start are the acts, told on the phone; a
// folder is added with the PC's picker, and the engine's web panel, a folder, the config file, the
// guide and another page stay on the PC; it never becomes the desktop's tab.
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
    workspace: { getConfiguration: () => ({ get: (_k, d) => d }), workspaceFolders: [] }
};
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') { return vscodeStub; }
    if (/core[\\/]reveal(\.js)?$/.test(request)) { return { revealPath: p => { pcSide.push('reveal:' + p); return Promise.resolve(); } }; }
    return origLoad.apply(this, arguments);
};
const { AirtablePanel } = require(path.join(ROOT, 'out', 'panels', 'airtablePanel.js'));
const { RemoteViews, messageScope } = require(path.join(ROOT, 'out', 'panels', 'remoteViews.js'));
const { remotePages } = require(path.join(ROOT, 'out', 'panels', 'remotePages.js'));
const { loadStore, saveStore } = require(path.join(ROOT, 'out', 'core', 'airtable.js'));
Module._load = origLoad;
const { scopeAtLeast, requiredScope } = require(path.join(ROOT, 'out', 'remote', 'scopes.js'));

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'af-airphone-'));
const STORE = path.join(TMP, 'storage'), HOME = path.join(TMP, 'home');
fs.mkdirSync(STORE); fs.mkdirSync(HOME);
saveStore(STORE, { mediaRoots: ['D:\\zone\\medya\\çekimler'] });
// a registration whose server dies at once: the probe answers quickly, and fails
fs.writeFileSync(path.join(HOME, '.claude.json'), JSON.stringify({ mcpServers: { airtable: { type: 'stdio', command: process.execPath, args: ['-e', 'process.exit(3)'] } } }));
const deps = { extensionUri: fileUri(ROOT), storageDir: STORE, extVersion: '9.9.9', cacheFile: path.join(TMP, 'cache.json'), home: HOME };
const settle = (ms = 30) => new Promise(r => setTimeout(r, ms));
const alive = setInterval(() => undefined, 1000);

(async () => {
    // ---- what each message needs ----
    const R = remotePages({ airtable: () => undefined }).airtable;
    ok('‼️ the page asks manage to open and to act — its live instances and its writes ask the same over the bridge',
        R && R.open === 'manage' && R.act === 'manage'
        && ['airtable.instances', 'airtable.config.set', 'airtable.folders.remove', 'airtable.register', 'airtable.unregister', 'airtable.start']
            .every(op => requiredScope(op) === 'manage'));
    ok('a default, a removal, the registration, a probe and a start are its acts',
        ['set', 'remove-root', 'remove-media', 'register', 'unregister', 'probe-tools', 'start'].every(t => messageScope(R, t) === 'manage'));
    const PC = ['add-root', 'add-media', 'open-ui', 'reveal', 'open-config', 'openGuide', 'afnav'];
    ok('‼️ the folder picker, the engine\'s web panel, a folder, the config file, the guide and another page never run from a phone',
        PC.every(t => messageScope(R, t) === null));

    // ---- the page on a phone ----
    const made = {};
    const views = new RemoteViews({
        media: fileUri(path.join(ROOT, 'media')), atLeast: scopeAtLeast, waitMs: 60,
        pages: remotePages({ airtable: host => { made.a = host; AirtablePanel.openOn(host, deps); } })
    });
    const reader = { device: 'dev_r', scope: 'read' }, manager = { device: 'dev_m', scope: 'manage' };
    ok('‼️ a phone paired to read does not open it', views.open(reader, 'r1', 'airtable', undefined, () => undefined) === false && !made.a);
    const toM = [];
    ok('a manage phone opens it, never as the desktop\'s tab', views.open(manager, 'a1', 'airtable', undefined, m => toM.push(m)) === true
        && made.a && made.a.remote === true && AirtablePanel.current === undefined);
    const body = (await views.page('/view/airtable?view=a1', manager)).body;
    ok('…from /res/, with its store', body.includes('src="/res/airtablePage.js"') && body.includes('medya'));
    await settle();
    ok('the instances it probes reach the phone', toM.some(m => m.type === 'instances'));

    pcSide.length = 0;
    views.message(manager, 'a1', { type: 'set', key: 'defaultLang', value: 'EN' });
    views.message(manager, 'a1', { type: 'remove-media', value: 'D:\\zone\\medya\\çekimler' });
    await settle();
    ok('‼️ a default and a folder\'s removal land from the phone', loadStore(STORE).defaultLang === 'EN' && loadStore(STORE).mediaRoots.length === 0 && pcSide.length === 0);

    const notes = () => toM.filter(m => m.type === 'afAsk' && m.kind === 'note');
    const asks = () => toM.filter(m => m.type === 'afAsk' && m.kind === 'message');
    views.message(manager, 'a1', { type: 'unregister' });
    await settle();
    const q = asks().pop();
    ok('‼️ the unregistration is asked on the phone', q && q.modal === true && q.level === 'warn' && q.buttons.join() === 'Unregister' && pcSide.length === 0);
    views.message(manager, 'a1', { type: 'afAskAnswer', id: q.id, value: 0 });
    await settle();
    ok('…and done there', !JSON.parse(fs.readFileSync(path.join(HOME, '.claude.json'), 'utf8')).mcpServers.airtable && pcSide.length === 0);
    views.message(manager, 'a1', { type: 'probe-tools' });
    await settle();
    ok('‼️ a probe with nothing registered says so on the phone', notes().some(n => n.level === 'warn' && /not registered yet/.test(n.message)) && pcSide.length === 0);

    fs.writeFileSync(path.join(HOME, '.claude.json'), JSON.stringify({ mcpServers: { airtable: { type: 'stdio', command: process.execPath, args: ['-e', 'process.exit(3)'] } } }));
    views.message(manager, 'a1', { type: 'probe-tools' });
    for (let i = 0; i < 100 && !notes().some(n => /probe failed/.test(n.message)); i++) { await settle(50); }
    ok('‼️ a probe from the phone runs with no progress toast on the PC and its failure is told on the phone',
        notes().some(n => n.level === 'warn' && /probe failed/.test(n.message)) && pcSide.length === 0);
    views.message(manager, 'a1', { type: 'start', name: 'yok' });
    await settle(100);
    ok('‼️ a start that cannot run is told on the phone, not in a PC toast', notes().some(n => n.level === 'error' && /starting yok failed/.test(n.message)) && pcSide.length === 0);

    for (const t of PC) { views.message(manager, 'a1', { type: t, url: 'http://127.0.0.1:3003', path: STORE, to: 'tasks' }); }
    await settle();
    ok('‼️ nothing PC-only a phone sends opens, picks or reveals anything on the PC', pcSide.length === 0);
    const datas = () => toM.filter(m => m.type === 'data').length;
    const n0 = datas();
    AirtablePanel.refreshIfOpen();
    await settle();
    ok('the farm\'s refresh reaches the phone', datas() > n0);
    const desk = { refresh: () => undefined };
    AirtablePanel.current = desk;
    views.close(manager, 'a1');
    ok('a closed view leaves no instance behind, and the desktop\'s tab alone', AirtablePanel.phones.size === 0 && AirtablePanel.current === desk);
    AirtablePanel.current = undefined;

    // ---- the host's wiring and the phone's page ----
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('the phone and the palette open it from the same deps', /airtable: host => AirtablePanel\.openOn\(host, airtableDeps\)/.test(ext)
        && /AirtablePanel\.show\(airtableDeps\)/.test(ext));
    const page = fs.readFileSync(path.join(ROOT, 'media', 'airtablePage.js'), 'utf8');
    ok('‼️ the PC\'s buttons are not drawn on a phone and the config file is not a link there',
        page.includes('html.af-phone [data-do="add-root"], html.af-phone [data-do="add-media"], html.af-phone [data-open-ui], html.af-phone [data-reveal] { display:none; }')
        && page.includes('html.af-phone [data-openconfig] { pointer-events:none; }'));
    ok('the tool list is one column and the connection rows wrap on a phone', page.includes('html.af-phone .air-tools { grid-template-columns: 1fr; }')
        && page.includes('html.af-phone .air-conn > a { min-width: 0; max-width: 100%; }'));

    clearInterval(alive);
    fs.rmSync(TMP, { recursive: true, force: true });
    console.log(`\nairtable on a phone: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL threw: ' + (e && e.stack || e)); process.exit(1); });
