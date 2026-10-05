// X-456 — THE SEARCH PAGE ON A PHONE. The same SearchPanel, drawn on a phone's
// view: it loads from /res/, a read device searches every transcript and is
// answered with its own seq, nothing a phone sends opens a file, the Timeline,
// the id picker, the index build, the settings or the guide on the PC, and it
// never becomes the desktop's tab.
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
    env: { clipboard: { writeText: t => { pcSide.push('clipboard:' + t); return Promise.resolve(); } } },
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
const { SearchPanel } = require(path.join(ROOT, 'out', 'panels', 'searchPanel.js'));
const { RemoteViews, messageScope } = require(path.join(ROOT, 'out', 'panels', 'remoteViews.js'));
const { remotePages } = require(path.join(ROOT, 'out', 'panels', 'remotePages.js'));
Module._load = origLoad;
const { scopeAtLeast } = require(path.join(ROOT, 'out', 'remote', 'index.js'));

const session = {
    sessionId: '5e4c1b2a-0000-4000-8000-000000000001', file: 'C:/t/tarla.jsonl', cwd: 'D:/agents/tarlaci',
    agentName: 'tarlaci', title: 'tarlayı sula', mtime: Date.now(), lastTs: Date.now(), models: [], engine: 'claude'
};
const searched = [];
const deps = {
    extensionUri: uri('/ext'),
    index: { allWithExternal: () => [session], all: () => [session] },
    getAgentNames: () => ['tarlaci'],
    getMemoryFiles: () => [],
    liveEventsFile: () => path.join(ROOT, 'test', 'no-such-live-events.jsonl'),
    semanticSearch: async () => ({ hits: [], matchesFound: 0, matchesShown: 0 }),
    semanticStatus: () => ({ provider: 'off', sessions: 0, chunks: 0 }),
    textSearch: {
        search: async (sessions, query) => {
            searched.push(query);
            return {
                hits: [{ file: session.file, sessionId: session.sessionId, agentName: 'tarlaci', title: session.title, role: 'user', ts: Date.now(), text: 'tarlayı sabah sula', snippet: 'tarlayı sabah sula' }],
                matchesFound: 1, matchesShown: 1, filesScanned: sessions.length
            };
        }
    }
};
const settle = () => new Promise(r => setTimeout(r, 10));
const alive = setInterval(() => undefined, 1000);

(async () => {
    // ---- what each message needs ----
    const spec = remotePages({ search: () => undefined }).search;
    ok('the Search page is a phone page, and searching is a look', !!spec && spec.open === 'read' && messageScope(spec, 'search') === 'read');
    const PC = ['openSession', 'openFile', 'openTimeline', 'findSession', 'buildIndex', 'openFarmSettings', 'openGuide', 'afnav'];
    ok('a file, the Timeline, the id picker, building the index, the settings and the guide never run from a phone',
        PC.every(t => messageScope(spec, t) === null));

    // ---- the page on a phone ----
    let made;
    const views = new RemoteViews({
        media: uri('/ext/media'), atLeast: scopeAtLeast, waitMs: 60,
        pages: remotePages({ search: host => { made = host; SearchPanel.openOn(host, deps); } })
    });
    const reader = { device: 'dev_r', scope: 'read' };
    const toReader = [];
    ok('the Search page opens on a phone', views.open(reader, 's1', 'search', undefined, m => toReader.push(m)) === true);
    ok('‼️ a phone\'s view never becomes the desktop\'s tab', SearchPanel.current === undefined && made && made.remote === true);
    const page = (await views.page('/view/search?view=s1', reader)).body;
    ok('its page and script load from /res/', page.includes('src="/res/search.js"') && page.includes('href="/res/common.css"') && !/vscode-webview:|file:\/\//.test(page));
    ok('…with the farm\'s agents in its filters', page.includes('tarlaci'));

    views.message(reader, 's1', { type: 'search', query: 'sabah', seq: 7, filters: {} });
    await settle();
    const res = toReader.find(m => m.type === 'results');
    ok('a read device searches every transcript and hears its own answer', searched.includes('sabah') && !!res && res.seq === 7
        && res.result.hits.some(h => h.text === 'tarlayı sabah sula'));

    pcSide.length = 0;
    for (const t of PC) { views.message(reader, 's1', { type: t, file: session.file, q: '5e4c1b2a', focus: 'search', anchor: 'arama' }); }
    await settle();
    ok('‼️ nothing a phone sends opens a file, a tab, a picker, the index build, the settings or the guide on the PC', pcSide.length === 0);
    views.close(reader, 's1');

    // ---- the host's wiring, read off the source ----
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('the phone and the palette open the page from the same deps',
        /search: host => SearchPanel\.openOn\(host, searchPageDeps\(\)\)/.test(ext) && /SearchPanel\.show\(searchPageDeps\(\),/.test(ext));
    const panel = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'searchPanel.ts'), 'utf8');
    ok('the desktop tab is made through desktopHost(), and a phone view closing leaves it alone',
        /desktopHost\(\{ viewType: 'agentfarm\.search'/.test(panel) && /if \(SearchPanel\.current === this\) \{ SearchPanel\.current = undefined; \}/.test(panel));

    // ---- on a phone: nothing wider than the screen, nothing that would act on the PC ----
    const js = fs.readFileSync(path.join(ROOT, 'media', 'search.js'), 'utf8');
    ok('‼️ the filter row is one column (its first box asked for 420px), the quick scope wraps, a session\'s figures go under its name',
        /html\.af-phone \.filter-row\{grid-template-columns:minmax\(0,1fr\)\}/.test(js) && /html\.af-phone \.preset-group\{flex-wrap:wrap;/.test(js)
        && /html\.af-phone \.sesshead \.meta\{flex:1 1 100%;/.test(js));
    ok('the id picker, the index build and its settings are not drawn on the phone',
        /html\.af-phone #find-session,html\.af-phone #sem-settings,html\.af-phone #build-index\{display:none\}/.test(js));

    clearInterval(alive);
    console.log(`\nsearch on a phone: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL threw: ' + (e && e.stack || e)); process.exit(1); });
