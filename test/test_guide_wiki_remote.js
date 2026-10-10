// X-456 — THE GUIDE AND THE WIKI ON A PHONE. The two panels, drawn on a phone's
// view: they load from /res/, a page's ? opens the phone's own guide at its
// heading, the guide's language switch redraws the phone and leaves the PC's
// setting alone, a link is copied to the phone, a raw file or an unknown help
// document is "unavailable"; a read device changes no mark, a manage device
// edits one, and a rename asks its questions ON THE PHONE; nothing a phone
// sends opens a page, a file, a folder, the settings or a link on the PC; the
// farm's refresh reaches the wiki's view; none becomes the desktop's tab.
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
const uri = p => ({ path: p, fsPath: p, toString: () => 'file://' + p });
const pcSide = [];
const configWrites = [];
const vscodeStub = {
    EventEmitter,
    Uri: { joinPath: (b, ...parts) => uri([b.path, ...parts].join('/')), file: uri, parse: uri },
    ViewColumn: { One: 1, Beside: -2, Active: -1 },
    ConfigurationTarget: { Global: 1 },
    InputBoxValidationSeverity: { Warning: 2 },
    env: { openExternal: u => { pcSide.push('external:' + u); return Promise.resolve(true); }, clipboard: { writeText: () => Promise.resolve() } },
    window: {
        createWebviewPanel: () => { throw new Error('no desktop tab for a phone'); },
        showErrorMessage: m => { pcSide.push('error:' + m); return Promise.resolve(undefined); },
        showInformationMessage: m => { pcSide.push('info:' + m); return Promise.resolve(undefined); },
        showWarningMessage: m => { pcSide.push('warn:' + m); return Promise.resolve(undefined); },
        showQuickPick: () => { pcSide.push('pick'); return Promise.resolve(undefined); },
        showInputBox: () => { pcSide.push('input'); return Promise.resolve(undefined); }
    },
    commands: { executeCommand: (...a) => { pcSide.push('command:' + a[0]); return Promise.resolve(undefined); } },
    workspace: {
        getConfiguration: () => ({ get: (_k, d) => d, update: async (k, v) => { configWrites.push(k + '=' + v); } }), workspaceFolders: [],
        onDidChangeConfiguration: new EventEmitter().event
    }
};
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') { return vscodeStub; }
    return origLoad.apply(this, arguments);
};
const { GuidePanel } = require(path.join(ROOT, 'out', 'panels', 'guide.js'));
const { WikiPanel } = require(path.join(ROOT, 'out', 'panels', 'wikiPanel.js'));
const { RemoteViews, messageScope } = require(path.join(ROOT, 'out', 'panels', 'remoteViews.js'));
const { remotePages } = require(path.join(ROOT, 'out', 'panels', 'remotePages.js'));
const W = require(path.join(ROOT, 'out', 'core', 'wiki.js'));
Module._load = origLoad;
const { scopeAtLeast } = require(path.join(ROOT, 'out', 'remote', 'index.js'));

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'af-wikiphone-'));
const root = path.join(TMP, '00_WIKI');
fs.mkdirSync(path.join(root, 'Tarim'), { recursive: true });
const store = new W.WikiStore(path.join(TMP, 'pool.json'));
const mark = store.add({ sessionId: 's1', fromTurn: 1, toTurn: 2, topics: ['Tarim'], note: 'sulama' }).candidate;
const calls = [];
const wikiDeps = {
    extensionUri: uri(ROOT),
    store: () => store,
    wiki: () => ({ store: () => store, root: () => root, sessions: () => [] }),
    openSession: id => { calls.push('openSession:' + id); },
    openDoc: f => { calls.push('openDoc:' + f); }
};
const settle = () => new Promise(r => setTimeout(r, 10));
const alive = setInterval(() => undefined, 1000);

(async () => {
    // ---- what each message needs ----
    const pages = remotePages({ guide: () => true, wiki: () => undefined });
    const G = pages.guide, K = pages.wiki;
    ok('the guide and the wiki are phone pages a read device opens', [G, K].every(p => p && p.open === 'read'));
    ok('reading the guide and switching its language are looks', messageScope(G, 'setLang') === 'read' && messageScope(K, 'refresh') === 'read');
    ok('compiling, editing, dropping, a category, its rename, starting the wiki and the shape check are manage',
        ['compile', 'edit', 'remove', 'category', 'renameCategory', 'wikiInit', 'lint'].every(t => messageScope(K, t) === 'manage'));
    const GPC = ['openExternal', 'afnav'];
    const KPC = ['openSession', 'openPage', 'openWikiFile', 'revealWikiPath', 'openSettings', 'openGuide', 'afnav'];
    ok('‼️ a link, a page, the wiki\'s files and folders, a dropped document, the settings and the guide never run from a phone',
        GPC.every(t => messageScope(G, t) === null) && KPC.every(t => messageScope(K, t) === null));

    // ---- the guide on a phone ----
    const made = {};
    const views = new RemoteViews({
        media: uri(ROOT + '/media'), atLeast: scopeAtLeast, waitMs: 60,
        pages: remotePages({
            guide: (host, args) => { made.g = host; return GuidePanel.openOn(host, uri(ROOT), args); },
            wiki: (host, args) => { made.w = host; WikiPanel.openOn(host, wikiDeps, args && typeof args.focus === 'string' ? args.focus : undefined); }
        })
    });
    const reader = { device: 'dev_r', scope: 'read' }, manager = { device: 'dev_m', scope: 'manage' };
    const toG = [];
    ok('a read device opens the guide at a heading, never as the desktop\'s tab',
        views.open(reader, 'g1', 'guide', { anchor: 'hizli-baslangic' }, m => toG.push(m)) === true && made.g && made.g.remote === true);
    let g = (await views.page('/view/guide?view=g1', reader)).body;
    ok('…its page loads from /res/ with the phone\'s acquireVsCodeApi before its own script',
        g.includes('href="/res/common.css"') && g.indexOf('src="/res/afRemote.js"') > 0
        && g.indexOf('src="/res/afRemote.js"') < g.indexOf('acquireVsCodeApi()'));
    ok('U-238 — …and the light sheet the phone switches on', g.includes('href="/res/theme-phone.css"'));
    ok('…drawn for a phone, scrolled to the heading', /<html lang="\w+" class="af-phone">/.test(g) && g.includes('name="viewport"')
        && g.includes('"hizli-baslangic"'));
    ok('…a link is copied on the phone rather than opened on the PC', /PHONE\) \{ vscode\.postMessage\(\{ type: 'afClipboard'/.test(g));
    const before = g;
    views.message(reader, 'g1', { type: 'setLang', lang: before.includes('<html lang="en"') ? 'tr' : 'en' });
    await settle();
    g = (await views.page('/view/guide?view=g1', reader)).body;
    ok('‼️ the language switch redraws the phone\'s guide and never writes the PC\'s guideLanguage', g !== before && configWrites.length === 0);
    pcSide.length = 0;
    for (const t of GPC) { views.message(reader, 'g1', { type: t, href: 'https://example.com', to: 'dashboard' }); }
    await settle();
    ok('‼️ nothing the guide sends from a phone opens anything on the PC', pcSide.length === 0);
    ok('‼️ a raw file or an unknown help document is unavailable on a phone',
        views.open(reader, 'g2', 'guide', { doc: 'BLUEPRINT.en.md' }, () => undefined) === false
        && views.open(reader, 'g3', 'guide', { doc: '../package.json' }, () => undefined) === false);
    ok('…the examples are a help document a phone opens', views.open(reader, 'g4', 'guide', { doc: 'examples' }, () => undefined) === true);

    // ---- the wiki on a phone ----
    const toR = [];
    ok('a read device opens the wiki, never as the desktop\'s tab', views.open(reader, 'w1', 'wiki', undefined, m => toR.push(m)) === true
        && made.w && made.w.remote === true);
    const page = (await views.page('/view/wiki?view=w1', reader)).body;
    ok('…from /res/ with its marks', page.includes('src="/res/wiki.js"') && page.includes('sulama'));
    views.message(reader, 'w1', { type: 'edit', id: mark.id, note: 'okuyucu' });
    await settle();
    ok('‼️ a read device changes no mark', store.get(mark.id).note === 'sulama');
    const toM = [];
    views.open(manager, 'w2', 'wiki', undefined, m => toM.push(m));
    await views.page('/view/wiki?view=w2', manager);
    views.message(manager, 'w2', { type: 'edit', id: mark.id, note: 'telefondan' });
    await settle();
    ok('a manage device edits a mark', store.get(mark.id).note === 'telefondan');
    pcSide.length = 0; toM.length = 0;
    views.message(manager, 'w2', { type: 'renameCategory', from: 'Tarim' });
    await settle();
    const q = toM.find(m => m.type === 'afAsk' && m.kind === 'pick');
    ok('‼️ a rename asks which category ON THE PHONE', !!q && pcSide.length === 0);
    if (q) { views.message(manager, 'w2', { type: 'afAskAnswer', id: q.id, value: 0 }); }
    await settle();
    const box = toM.find(m => m.type === 'afAsk' && m.kind === 'input');
    ok('…and its new name there too', !!box && pcSide.length === 0);
    if (box) { views.message(manager, 'w2', { type: 'afAskAnswer', id: box.id, value: '   ' }); }
    await settle();
    ok('‼️ an empty name is refused on the phone, nothing renamed', toM.some(m => m.type === 'afAsk' && /needs a name/.test(String(m.message)))
        && fs.existsSync(path.join(root, 'Tarim')) && pcSide.length === 0);
    views.message(manager, 'w2', { type: 'compile', ids: ['nope'] });
    await settle();
    ok('‼️ a refused compile is told ON THE PHONE', toM.some(m => m.type === 'afAsk' && m.kind === 'note') && pcSide.length === 0);
    calls.length = 0; pcSide.length = 0;
    for (const t of KPC) { views.message(manager, 'w2', { type: t, id: mark.id, page: 'x.md', which: 'root', focus: 'agentFarm.wikiRoot', anchor: 'g', to: 'dashboard' }); }
    await settle();
    ok('‼️ nothing a phone sends from the wiki opens anything on the PC', calls.length === 0 && pcSide.length === 0);
    const datas = () => toM.filter(m => m.type === 'data').length;
    const n0 = datas();
    WikiPanel.refreshIfOpen();
    await settle();
    ok('the farm\'s refresh reaches the wiki on the phone', datas() === n0 + 1);
    for (const [d, v] of [[reader, 'g1'], [reader, 'g4'], [reader, 'w1'], [manager, 'w2']]) { views.close(d, v); }
    ok('a closed view leaves no instance behind', GuidePanel.phones.size === 0 && WikiPanel.phones.size === 0);

    // ---- the host's wiring and the phone's page ----
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('the phone and the palette open the wiki from the same deps; the guide from the extension',
        /wiki: \(host, args\) => WikiPanel\.openOn\(host, wikiPageDeps\(\), typeof args\?\.focus === 'string'/.test(ext)
        && /WikiPanel\.show\(wikiPageDeps\(\), focus\)/.test(ext)
        && /guide: \(host, args\) => GuidePanel\.openOn\(host, context\.extensionUri, args\)/.test(ext));
    const media = n => fs.readFileSync(path.join(ROOT, 'media', n), 'utf8');
    ok('‼️ on a phone a page\'s ? opens the phone\'s own guide at the heading it names',
        /function guideOf\(m\)/.test(media('afRemote.js')) && /to: 'guide', args: args/.test(media('afRemote.js'))
        && /readOf\(m\) \|\| chainOf\(m\) \|\| agentOf\(m\) \|\| guideOf\(m\) \|\| linkOf\(m\) \|\| fileOf\(m\) \|\| m;/.test(media('afRemote.js')));
    ok('a mark\'s transcript opens the phone\'s session page; a dropped document does not',
        /\\bwk-rawsess\\b\/\.test\(e\.currentTarget\.className/.test(media('wiki.js')) && /sessionId: id/.test(media('wiki.js')));
    const wk = media('wiki.js');
    ok('‼️ the marks are a card per mark on a phone, every figure under its column\'s name, the editor full width',
        /<table class="wktable" data-afcards>/.test(wk) && /<tr data-afcardhead>/.test(wk) && /\$\{st\.cls\}" data-afcard>/.test(wk)
        && (wk.match(/COL\.(state|source|topics|marked|pages)\)\}/g) || []).length === 5 && /'wk-label', 'data-lead'/.test(wk)
        && /<td class="wk-pick" data-first>/.test(wk) && /<tr class="wk-erow" data-afcardmore><td data-first>/.test(wk));
    ok('…its buttons drawn whole and its words wrapped there',
        /html\.af-phone \.wk-act \.mini \{ opacity:1;/.test(wk) && /html\.af-phone \.wktable td\.wk-label \{ max-width:none; white-space:normal;/.test(wk));
    const css = fs.readFileSync(path.join(ROOT, 'media', 'common.css'), 'utf8');
    ok('the guide on a phone is one column whose long words wrap (nothing past 360px)',
        /html\.af-phone body\.guide \{ display: block;/.test(css) && /html\.af-phone body\.guide #content \{[^}]*overflow-wrap: anywhere;/.test(css));

    clearInterval(alive);
    fs.rmSync(TMP, { recursive: true, force: true });
    console.log(`\nguide and wiki on a phone: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL threw: ' + (e && e.stack || e)); process.exit(1); });
