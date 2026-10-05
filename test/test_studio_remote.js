// X-456 — THE STUDIO ON A PHONE. Its bridge ops (studio.productions, studio.assets,
// studio.library, studio.rerun …) ask manage, so the page asks the same to open and to
// act. Its pictures reach the phone by the view's own tokens; a ↻ runs on the phone's
// word and is told there; a scene's status is picked on the phone; an export, a new
// recipe, opening a file, registering one and a setting stay on the PC; the farm's
// refresh reaches the view; it never becomes the desktop's tab.
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
    env: { openExternal: u => { pcSide.push('external:' + u); return Promise.resolve(true); } },
    window: {
        createWebviewPanel: () => { throw new Error('no desktop tab for a phone'); },
        showErrorMessage: m => { pcSide.push('error:' + m); return Promise.resolve(undefined); },
        showInformationMessage: m => { pcSide.push('info:' + m); return Promise.resolve(undefined); },
        showWarningMessage: m => { pcSide.push('warn:' + m); return Promise.resolve(undefined); },
        showQuickPick: () => { pcSide.push('pick'); return Promise.resolve(undefined); },
        showInputBox: () => { pcSide.push('input'); return Promise.resolve(undefined); },
        showOpenDialog: () => { pcSide.push('open-dialog'); return Promise.resolve(undefined); },
        showSaveDialog: () => { pcSide.push('save-dialog'); return Promise.resolve(undefined); },
        showTextDocument: () => { pcSide.push('editor'); return Promise.resolve(undefined); },
        setStatusBarMessage: m => { pcSide.push('status:' + m); return { dispose() { } }; }
    },
    commands: { executeCommand: (...a) => { pcSide.push('command:' + a[0]); return Promise.resolve(undefined); } },
    workspace: { getConfiguration: () => ({ get: (_k, d) => d }), workspaceFolders: [] }
};
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') { return vscodeStub; }
    return origLoad.apply(this, arguments);
};
const { StudioPanel } = require(path.join(ROOT, 'out', 'panels', 'studioPanel.js'));
const { RemoteViews, messageScope } = require(path.join(ROOT, 'out', 'panels', 'remoteViews.js'));
const { remotePages } = require(path.join(ROOT, 'out', 'panels', 'remotePages.js'));
const { newProduction, writeProduction, PRODUCTION_FILENAME } = require(path.join(ROOT, 'out', 'core', 'production.js'));
Module._load = origLoad;
const { scopeAtLeast, requiredScope } = require(path.join(ROOT, 'out', 'remote', 'scopes.js'));

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'af-studiophone-'));
const OUT = path.join(TMP, 'outputs'), AGENT = path.join(TMP, 'kanal');
fs.mkdirSync(OUT); fs.mkdirSync(AGENT);
const PIC = path.join(OUT, 'kedi.png');
fs.writeFileSync(PIC, 'PNG-KEDI');
fs.writeFileSync(path.join(OUT, 't1.media.json'), JSON.stringify({
    taskId: 't1', title: 'Kedi', model: 'fal-ai/flux', input: '{"prompt":"kedi"}', assetFiles: [PIC], estCost: 0.01, ts: Date.now()
}));
const prod = newProduction('Kanal A', ['Açılış']);
writeProduction(path.join(AGENT, PRODUCTION_FILENAME), prod);
const runs = [];
const deps = {
    extensionUri: fileUri(path.join(ROOT)),
    tasks: { outputsDir: OUT, runMediaAdhoc: (...a) => { runs.push(a); } },
    getAgents: () => [{ id: 'kanal', name: 'kanal', dir: AGENT }],
    ingestFolders: () => [], mediaBudget: () => 0, providerKeys: () => ({ fal: true, replicate: false })
};
const settle = () => new Promise(r => setTimeout(r, 20));
const alive = setInterval(() => undefined, 1000);

(async () => {
    // ---- what each message needs ----
    const S = remotePages({ studio: () => undefined }).studio;
    ok('‼️ the Studio asks manage to open and to act — its bridge ops ask the same',
        S && S.open === 'manage' && S.act === 'manage'
        && ['studio.productions', 'studio.assets', 'studio.library', 'studio.rerun', 'studio.triage'].every(op => requiredScope(op) === 'manage'));
    ok('a tab, a production and the wall\'s filter only change what the view shows',
        ['refresh', 'tab', 'project', 'libraryView'].every(t => S.looks.includes(t)));
    ok('a card\'s save, a ↻, a scene\'s status, a triage, the wall\'s ✓ ✗ ✎ ↑ and a brand kit are its acts',
        ['studio-save', 'rerun', 'setSceneStatus', 'triageDecision', 'libEdit', 'libPromote', 'brand:set', 'brand:save']
            .every(t => messageScope(S, t) === 'manage'));
    const PC = ['openAsset', 'openFile', 'generate', 'registerAsset', 'vary', 'feedback', 'openSettings', 'openGuide', 'afnav'];
    ok('‼️ opening a file, a new recipe, registering a file, the vary / feedback commands, a setting, the guide and another page never run from a phone',
        PC.every(t => messageScope(S, t) === null));

    // ---- the page on a phone ----
    const made = {};
    const views = new RemoteViews({
        media: fileUri(path.join(ROOT, 'media')), atLeast: scopeAtLeast, waitMs: 60,
        pages: remotePages({ studio: host => { made.s = host; StudioPanel.openOn(host, deps); } })
    });
    const reader = { device: 'dev_r', scope: 'read' }, manager = { device: 'dev_m', scope: 'manage' };
    ok('‼️ a phone paired to read does not open it', views.open(reader, 'r1', 'studio', undefined, () => undefined) === false && !made.s);
    const toM = [];
    ok('a manage phone opens it, never as the desktop\'s tab', views.open(manager, 's1', 'studio', undefined, m => toM.push(m)) === true
        && made.s && made.s.remote === true && StudioPanel.current === undefined);
    const body = (await views.page('/view/studio?view=s1', manager)).body;
    const addr = (/\/res\/~\/s1\/[a-f0-9]{24}/.exec(body) || [])[0];
    ok('…from /res/, its picture given the view\'s own address', body.includes('src="/res/studio.js"') && !!addr);
    const pic = addr && await views.page(addr, manager);
    ok('‼️ the picture reaches the phone that opened the view', pic && pic.status === 200 && pic.body.toString() === 'PNG-KEDI');
    ok('…and no other phone', addr && (await views.page(addr, reader)) === null);

    pcSide.length = 0;
    views.message(manager, 's1', { type: 'rerun', taskId: 't1' });
    await settle();
    ok('‼️ a ↻ from the phone runs the same model again and says so on the phone, not in a PC toast',
        runs.length === 1 && runs[0][0] === 'Kedi (re-run)' && runs[0][1] === 'fal-ai/flux'
        && toM.some(m => m.type === 'studio-msg' && m.ok === true) && pcSide.length === 0);
    views.message(manager, 's1', { type: 'studio-save', form: { kind: 'export', projectId: prod.id } });
    await settle();
    ok('‼️ an export from the phone writes nothing and says it is picked on the PC',
        toM.some(m => m.type === 'studio-msg' && /on the PC/.test(m.text)) && !pcSide.includes('save-dialog'));
    views.message(manager, 's1', { type: 'setSceneStatus', projectId: prod.id, sceneId: prod.scenes[0].id });
    await settle();
    ok('‼️ a scene\'s status is picked on the phone', toM.some(m => m.type === 'afAsk' && m.kind === 'pick') && !pcSide.includes('pick'));
    for (const t of PC) { views.message(manager, 's1', { type: t, path: PIC, focus: 'agentFarm.mediaBudgetMonthUSD', taskId: 't1', to: 'tasks' }); }
    await settle();
    ok('‼️ nothing PC-only a phone sends opens, runs or prompts anything on the PC', pcSide.length === 0 && runs.length === 1);
    const datas = () => toM.filter(m => m.type === 'data').length;
    const n0 = datas();
    StudioPanel.refreshIfOpen();
    await settle();
    ok('the farm\'s refresh reaches the phone', datas() > n0);
    views.close(manager, 's1');
    ok('a closed view leaves no instance behind', StudioPanel.phones.size === 0);

    // ---- the host's wiring and the phone's page ----
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('the phone opens the Studio from the palette\'s own deps', /studio: host => StudioPanel\.openOn\(host, studioDeps\)/.test(ext));
    const panel = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'studioPanel.ts'), 'utf8');
    const acts = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'studioLibraryActions.ts'), 'utf8');
    ok('the wall\'s ✎ and ↑ ask whoever is looking', !/from 'vscode'/.test(acts) && /await ask\.pick\(/.test(acts) && /await ask\.input\(/.test(acts) && /askEdit\(msg, tell\.ask\)/.test(acts)
        && /this\.libSay\(\)/.test(panel));
    ok('the desktop keeps growing its webview roots; a phone has none', /const desk = this\.desk;\s*if \(newDirs && desk\)/.test(panel));
    const base = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'base.ts'), 'utf8');
    ok('‼️ a page may play its own clips and sounds — the policy names media', /img-src \$\{webview\.cspSource\} data:; media-src \$\{webview\.cspSource\};/.test(base));
    const page = fs.readFileSync(path.join(ROOT, 'media', 'studio.js'), 'utf8');
    ok('‼️ the PC\'s buttons are not drawn on a phone, and a picture is not wired to the PC\'s editor there',
        page.includes('html.af-phone #register, html.af-phone #editmanifest, html.af-phone #exportseq,')
        && page.includes('html.af-phone [data-settings], html.af-phone [data-act="generate"], html.af-phone button[data-open] { display:none; }')
        && /if \(!ON_PHONE_HOST\) \{ on\('\[data-open\]'/.test(page));
    ok('a source row wraps on a phone', page.includes('html.af-phone .srcrow { flex-wrap:wrap; }'));

    clearInterval(alive);
    fs.rmSync(TMP, { recursive: true, force: true });
    console.log(`\nstudio on a phone: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL threw: ' + (e && e.stack || e)); process.exit(1); });
