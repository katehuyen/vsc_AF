// X-456 — THE TURNS PAGE ON A PHONE. The same TurnsPanel, drawn on a phone's
// view: it loads from /res/, a read device reads the table and folds a turn
// open (only a transcript the index lists), keeping a turn for the wiki needs
// manage, nothing a phone sends opens a tab, a terminal, the guide or a save
// dialog on the PC, the view follows the index while open and stops when
// closed, a phone's view never becomes the desktop's tab, and a row's click
// reaches the phone as its own session page at that turn.
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
const configChanged = new EventEmitter();
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
        showSaveDialog: () => { pcSide.push('save'); return Promise.resolve(undefined); },
        showTextDocument: () => { pcSide.push('doc'); return Promise.resolve(undefined); }
    },
    commands: { executeCommand: (...a) => { pcSide.push('command:' + a[0]); return Promise.resolve(undefined); } },
    workspace: {
        getConfiguration: () => ({ get: (_k, d) => d, update: async () => { } }), workspaceFolders: [],
        onDidChangeConfiguration: configChanged.event
    }
};
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') { return vscodeStub; }
    return origLoad.apply(this, arguments);
};
const { TurnsPanel } = require(path.join(ROOT, 'out', 'panels', 'turnsPanel.js'));
const { RemoteViews, messageScope } = require(path.join(ROOT, 'out', 'panels', 'remoteViews.js'));
const { remotePages } = require(path.join(ROOT, 'out', 'panels', 'remotePages.js'));
const { parseSessionFile } = require(path.join(ROOT, 'out', 'core', 'sessions.js'));
Module._load = origLoad;
const { scopeAtLeast } = require(path.join(ROOT, 'out', 'remote', 'index.js'));

// ---------- a transcript the index lists: two turns ----------
const now = Date.now();
const iso = msAgo => new Date(now - msAgo).toISOString();
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-turns-remote-'));
const file = path.join(dir, 'sess1.jsonl');
fs.writeFileSync(file, [
    { type: 'user', timestamp: iso(600000), cwd: 'D:\\agents\\dev', message: { role: 'user', content: 'giriş hatasını düzelt' } },
    { type: 'assistant', timestamp: iso(590000), requestId: 'r1', message: { id: 'a1', model: 'claude-opus-4-8', usage: { input_tokens: 10, output_tokens: 5 }, content: [{ type: 'text', text: 'bakıyorum' }] } },
    { type: 'user', timestamp: iso(300000), message: { role: 'user', content: 'şimdi testleri çalıştır' } },
    { type: 'assistant', timestamp: iso(290000), requestId: 'r2', message: { id: 'a2', model: 'claude-opus-4-8', usage: { input_tokens: 10, output_tokens: 5 }, content: [{ type: 'text', text: 'hepsi geçti' }] } }
].map(l => JSON.stringify(l)).join('\n'), 'utf8');
const pricing = { costFor: () => 0 };
const info = parseSessionFile(file, pricing, 0);

const indexUpdated = new EventEmitter();
const deps = {
    extensionUri: uri('/ext'),
    index: { allWithExternal: () => [info], isSessionActive: () => false, onDidUpdate: indexUpdated.event },
    getPricing: () => pricing,
    launchManifests: () => []
};
const settle = () => new Promise(r => setTimeout(r, 5));
const alive = setInterval(() => undefined, 1000);

(async () => {
    // ---- what each message needs ----
    const spec = remotePages({ turns: () => undefined }).turns;
    ok('the Turns page is a phone page: open to read, keeping a turn for the wiki to manage',
        !!spec && spec.open === 'read' && spec.act === 'manage');
    ok('the table, a turn folded open and the wiki tagger\'s question are looks',
        ['refresh', 'turnDetail', 'wikiAsk'].every(t => messageScope(spec, t) === 'read'));
    ok('keeping a turn for the wiki and its category are manage',
        messageScope(spec, 'wikiMark') === 'manage' && messageScope(spec, 'wikiCategory') === 'manage');
    ok('a transcript tab, a terminal, the guide, the export dialog and another tab never run from a phone',
        ['openSession', 'focusTerminal', 'openGuide', 'exportChoose', 'afnav'].every(t => messageScope(spec, t) === null));

    // ---- the page on a phone ----
    let made;
    const views = new RemoteViews({
        media: uri('/ext/media'), atLeast: scopeAtLeast, waitMs: 60,
        pages: remotePages({ turns: host => { made = host; TurnsPanel.openOn(host, deps); } })
    });
    const reader = { device: 'dev_r', scope: 'read' };
    const toReader = [];
    ok('the Turns page opens on a phone', views.open(reader, 's1', 'turns', undefined, m => toReader.push(m)) === true);
    ok('‼️ a phone\'s view never becomes the desktop\'s tab', TurnsPanel.current === undefined && made && made.remote === true);
    const page = (await views.page('/view/turns?view=s1', reader)).body;
    ok('its page and script load from /res/', page.includes('src="/res/turns.js"') && page.includes('href="/res/common.css"') && !/vscode-webview:|file:\/\//.test(page));
    ok('…with the farm\'s turns in it', page.includes('giriş hatasını düzelt') && page.includes('şimdi testleri çalıştır'));

    views.message(reader, 's1', { type: 'refresh' });
    views.message(reader, 's1', { type: 'turnDetail', file, n: 2 });
    await settle();
    ok('a read device reads the table', toReader.some(m => m.type === 'data' && Array.isArray(m.data.rows) && m.data.rows.length === 2));
    const detail = toReader.find(m => m.type === 'turnDetail');
    ok('…and folds a turn open: that turn\'s own messages', !!detail && detail.n === 2
        && detail.msgs.some(x => x.text === 'hepsi geçti') && !detail.msgs.some(x => x.text === 'bakıyorum'));
    const heard = toReader.length;
    views.message(reader, 's1', { type: 'turnDetail', file: path.join(dir, 'not-indexed.jsonl'), n: 1 });
    views.message(reader, 's1', { type: 'turnDetail', file, n: 0 });
    await settle();
    ok('‼️ a file the index does not list, or no turn, is never read', toReader.length === heard);

    pcSide.length = 0;
    for (const m of [{ type: 'openSession', file, ts: 5 }, { type: 'focusTerminal', sessionId: 'x' }, { type: 'openGuide', anchor: 'turns' },
        { type: 'exportChoose', shown: [{ file, n: 1 }], open: [], roles: [] }, { type: 'afnav', to: 'sessions' }]) {
        views.message(reader, 's1', m);
    }
    await settle();
    ok('‼️ nothing a phone sends opens a tab, a terminal, the guide or a save dialog on the PC', pcSide.length === 0);

    const before = toReader.filter(m => m.type === 'data').length;
    indexUpdated.fire();
    await settle();
    ok('the view follows the index while it is open', toReader.filter(m => m.type === 'data').length === before + 1);
    views.close(reader, 's1');
    const closed = toReader.length;
    indexUpdated.fire();
    await settle();
    ok('…and lets go of it once closed', toReader.length === closed && indexUpdated.listeners.length === 0);

    // ---- the host's wiring, read off the source ----
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('the host makes the phone\'s Turns page from the page\'s own deps', /turns: host => TurnsPanel\.openOn\(host, turnsPageDeps\(\)\)/.test(ext));
    const panel = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'turnsPanel.ts'), 'utf8');
    ok('the desktop tab is made through desktopHost()', /desktopHost\(\{ viewType: 'agentfarm\.turns'/.test(panel));

    // ---- on a phone a row is a card (media/afMobile.js: table[data-afcards]) ----
    const js = fs.readFileSync(path.join(ROOT, 'media', 'turns.js'), 'utf8');
    ok('‼️ the table is marked for cards: the table, its head, every row, the unfolded body',
        /<table class="turnstable" data-afcards>/.test(js) && /<tr data-afcardhead>/.test(js)
        && /data-ts="\$\{r\.ts \|\| 0\}" data-afcard\b/.test(js) && /<tr class="turnbody" data-afcardmore>/.test(js));
    ok('…every cell carries its column, the prompt leads, a figure wears its heading\'s own label',
        /COLUMNS\.map\(c => tagCell\(CELL\[c\]\(r\), c\)\)/.test(js) && /col === 'label' \? ' data-lead'/.test(js)
        && /const shown = \/<span class="af-tipw/.test(js));

    // ---- a row's click, on the phone ----
    const posted = [];
    const win = { afShell: { post: s => posted.push(JSON.parse(s)) }, sessionStorage: { getItem: () => null, setItem: () => undefined } };
    win.window = win;
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'media', 'afRemote.js'), 'utf8'), Object.assign(win, { location: { pathname: '/view/turns', search: '?view=a' } }));
    win.acquireVsCodeApi().postMessage({ type: 'openSession', file: 'C:/t/sess1.jsonl', ts: 1790000000000 });
    ok('‼️ a turn\'s row opens the phone\'s session page at that turn',
        JSON.stringify(posted[0]) === JSON.stringify({ type: 'afnav', to: 'session', args: { file: 'C:/t/sess1.jsonl', ts: 1790000000000 } }));

    fs.rmSync(dir, { recursive: true, force: true });
    clearInterval(alive);
    console.log(`\nturns on a phone: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL threw: ' + (e && e.stack || e)); process.exit(1); });
