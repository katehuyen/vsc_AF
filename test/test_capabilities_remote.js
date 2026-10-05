// X-456 — THE CAPABILITY MATRIX ON A PHONE. The inventory it draws reads at read over the bridge
// (toolbox.list), so a phone paired to read opens it; a copy onto an agent is manage, as
// toolbox.copy, toolbox.enable, memory.copy and duties.add are. Its source is picked or confirmed
// on the phone, and so is the CLAUDE.md question a duty's copy asks; a file in the PC's editor,
// the task history, the guide and another page stay on the PC; it never becomes the desktop's tab.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'af-capphone-'));
// the user-scope skills live under the home: this one, never the machine's
process.env.USERPROFILE = TMP; process.env.HOME = TMP;

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
    env: { openExternal: u => { pcSide.push('external:' + u); return Promise.resolve(true); } },
    window: {
        createWebviewPanel: () => { throw new Error('no desktop tab for a phone'); },
        showErrorMessage: m => { pcSide.push('error:' + m); return Promise.resolve(undefined); },
        showInformationMessage: m => { pcSide.push('info:' + m); return Promise.resolve(undefined); },
        showWarningMessage: m => { pcSide.push('warn:' + m); return Promise.resolve(undefined); },
        showQuickPick: () => { pcSide.push('pick'); return Promise.resolve(undefined); },
        showInputBox: () => { pcSide.push('input'); return Promise.resolve(undefined); },
        showTextDocument: () => { pcSide.push('editor'); return Promise.resolve(undefined); }
    },
    commands: { executeCommand: (...a) => { pcSide.push('command:' + a[0]); return Promise.resolve(undefined); } },
    workspace: { getConfiguration: () => ({ get: (_k, d) => d }), workspaceFolders: [] }
};
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') { return vscodeStub; }
    return origLoad.apply(this, arguments);
};
const { CapabilitiesPanel } = require(path.join(ROOT, 'out', 'panels', 'capabilities.js'));
const { RemoteViews, messageScope } = require(path.join(ROOT, 'out', 'panels', 'remoteViews.js'));
const { remotePages } = require(path.join(ROOT, 'out', 'panels', 'remotePages.js'));
Module._load = origLoad;
const { scopeAtLeast, requiredScope } = require(path.join(ROOT, 'out', 'remote', 'scopes.js'));

const agentDir = id => { const d = path.join(TMP, id); fs.mkdirSync(path.join(d, 'memory'), { recursive: true }); return d; };
const memFile = (dir, text, mtime) => {
    const p = path.join(dir, 'memory', 'notlar.md');
    fs.writeFileSync(p, text);
    return { name: 'notlar.md', path: p, mtime, tokens: 20 };
};
const dev = { id: 'dev', name: 'developer', dir: agentDir('dev'), duties: [{ title: 'Günlük kontrol', cadence: 'daily', paused: false }] };
dev.memoryFiles = [memFile(dev.dir, 'Geliştirici notu', 2000)];
const pz = { id: 'pz', name: 'pazarlama', dir: agentDir('pz'), duties: [] };
pz.memoryFiles = [memFile(pz.dir, 'Pazarlama notu', 1000)];
const asi = { id: 'asi', name: 'asistan', dir: agentDir('asi'), duties: [], memoryFiles: [] };
asi.claudeMdPath = path.join(asi.dir, 'CLAUDE.md');
fs.writeFileSync(asi.claudeMdPath, '# Asistan\n');
const agents = [dev, pz, asi];
let trees = 0;
const deps = {
    extensionUri: fileUri(ROOT), getAgents: () => agents, index: { forAgent: () => [] },
    refreshTrees: () => { trees++; }, taskRecords: () => []
};
const settle = () => new Promise(r => setTimeout(r, 20));
const alive = setInterval(() => undefined, 1000);

(async () => {
    // ---- what each message needs ----
    const K = remotePages({ capabilities: () => undefined }).capabilities;
    ok('‼️ the matrix opens at read like the inventory it draws (toolbox.list); a copy is manage like its ops',
        K && K.open === 'read' && K.act === 'manage' && requiredScope('toolbox.list') === 'read'
        && ['toolbox.copy', 'toolbox.enable', 'memory.copy', 'duties.add'].every(op => requiredScope(op) === 'manage'));
    ok('the four copies are its acts', ['copySkill', 'copyMcp', 'copyMemory', 'copyDuty'].every(t => messageScope(K, t) === 'manage'));
    const PC = ['open', 'openTaskHistory', 'openGuide', 'afnav'];
    ok('‼️ a file in the PC\'s editor, the task history, the guide and another page never run from a phone', PC.every(t => messageScope(K, t) === null));

    // ---- the page on a phone ----
    const made = [];
    const views = new RemoteViews({
        media: fileUri(path.join(ROOT, 'media')), atLeast: scopeAtLeast, waitMs: 60,
        pages: remotePages({ capabilities: host => { made.push(host); CapabilitiesPanel.openOn(host, deps); } })
    });
    const reader = { device: 'dev_r', scope: 'read' }, manager = { device: 'dev_m', scope: 'manage' };
    const toR = [];
    ok('a phone paired to read opens it, never as the desktop\'s tab', views.open(reader, 'r1', 'capabilities', undefined, m => toR.push(m)) === true
        && made.length === 1 && made[0].remote === true && CapabilitiesPanel.current === undefined);
    const body = (await views.page('/view/capabilities?view=r1', reader)).body;
    ok('…from /res/, with the agents\' memory files in its data', body.includes('src="/res/capabilities.js"') && body.includes('notlar.md'));
    views.message(reader, 'r1', { type: 'copyDuty', title: 'Günlük kontrol', toAgentId: 'asi' });
    await settle();
    ok('‼️ …and copies nothing from there', !fs.existsSync(path.join(asi.dir, 'DUTIES.md')) && !toR.some(m => m.type === 'afAsk' && m.kind === 'message'));

    const toM = [];
    ok('a manage phone opens it too', views.open(manager, 'm1', 'capabilities', undefined, m => toM.push(m)) === true);
    pcSide.length = 0;
    const asks = kind => toM.filter(m => m.type === 'afAsk' && m.kind === kind);
    views.message(manager, 'm1', { type: 'copyMemory', name: 'notlar.md', toAgentId: 'asi' });
    await settle();
    const pk = asks('pick').pop();
    ok('‼️ two differing copies: the source is picked on the phone, newest first and lettered',
        pk && pk.items.map(i => i.label).join() === 'developer,pazarlama' && /variant/.test(pk.items[0].description) && pcSide.length === 0);
    views.message(manager, 'm1', { type: 'afAskAnswer', id: pk.id, value: 0 });
    await settle();
    ok('…and the picked one is copied onto the agent', fs.readFileSync(path.join(asi.dir, 'memory', 'notlar.md'), 'utf8') === 'Geliştirici notu'
        && trees === 1 && pcSide.length === 0);

    views.message(manager, 'm1', { type: 'copyDuty', title: 'Günlük kontrol', toAgentId: 'asi' });
    await settle();
    const cf = asks('message').pop();
    ok('‼️ one donor: the copy is confirmed on the phone, naming it', cf && cf.modal === true && cf.buttons.join() === 'Copy'
        && /from developer to asistan/.test(cf.message) && pcSide.length === 0);
    views.message(manager, 'm1', { type: 'afAskAnswer', id: cf.id, value: 0 });
    await settle();
    const ap = asks('message').pop();
    ok('‼️ the duty lands, and the CLAUDE.md question is asked on the phone',
        /Günlük kontrol/.test(fs.readFileSync(path.join(asi.dir, 'DUTIES.md'), 'utf8'))
        && ap && ap !== cf && ap.level === 'warn' && ap.buttons.join() === 'Append to CLAUDE.md' && pcSide.length === 0);
    views.message(manager, 'm1', { type: 'afAskAnswer', id: ap.id, value: 0 });
    await settle();
    ok('…and answered there', /DUTIES\.md/.test(fs.readFileSync(asi.claudeMdPath, 'utf8')) && pcSide.length === 0);

    for (const t of PC) { views.message(manager, 'm1', { type: t, path: asi.claudeMdPath, to: 'tasks' }); }
    await settle();
    ok('‼️ nothing PC-only a phone sends opens anything on the PC', pcSide.length === 0);
    const datas = () => toM.filter(m => m.type === 'data').length;
    const n0 = datas();
    CapabilitiesPanel.refreshIfOpen();
    await settle();
    ok('the farm\'s refresh reaches the phone', datas() > n0);
    const desk = { refresh: () => undefined };
    CapabilitiesPanel.current = desk;
    views.close(manager, 'm1');
    views.close(reader, 'r1');
    ok('closed views leave no instance behind, and the desktop\'s tab alone', CapabilitiesPanel.phones.size === 0 && CapabilitiesPanel.current === desk);
    CapabilitiesPanel.current = undefined;

    // ---- the host's wiring and the phone's page ----
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('the phone and the palette open it from the same deps', /capabilities: host => CapabilitiesPanel\.openOn\(host, capabilitiesDeps\)/.test(ext)
        && /CapabilitiesPanel\.show\(capabilitiesDeps\)/.test(ext));
    const page = fs.readFileSync(path.join(ROOT, 'media', 'capabilities.js'), 'utf8');
    ok('‼️ a phone\'s cell is not wired to the PC\'s editor or the task history', /if \(!ON_PHONE_HOST\) \{\s*document\.querySelectorAll\('\[data-taskhist\]'\)/.test(page)
        && /document\.querySelectorAll\('\[data-open\]'\)[\s\S]{0,200}\}\)\);\s*\}/.test(page));
    ok('a row\'s name stays in sight while a phone scrolls the agents', page.includes('html.af-phone .matrix th.name, html.af-phone .matrix td.name { min-width: 120px; max-width: 132px; overflow-wrap: anywhere; position: sticky; left: 0;'));

    clearInterval(alive);
    fs.rmSync(TMP, { recursive: true, force: true });
    console.log(`\ncapabilities on a phone: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL threw: ' + (e && e.stack || e)); process.exit(1); });
