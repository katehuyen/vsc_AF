// X-456 — THE ENGINES AND THE ACCOUNTS PAGES ON A PHONE. The same two panels,
// drawn on a phone's view. accounts, providers, engines and policies are admin
// namespaces even to look (src/remote/scopes.ts), so the pages ask what their
// ops ask: a phone paired at manage cannot open them, an admin device can. On
// it a quota reading and a test turn run, forgetting a sign-in is asked ON THE
// PHONE, and nothing a phone sends opens a terminal, the PC's password box, the
// Secrets page or a link on the PC. Neither becomes the desktop's tab.
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
    env: {
        clipboard: { writeText: t => { pcSide.push('clipboard:' + t); return Promise.resolve(); } },
        openExternal: u => { pcSide.push('external:' + u); return Promise.resolve(true); }
    },
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
        getConfiguration: () => ({ get: (_k, d) => d, update: async () => { } }), workspaceFolders: [],
        onDidChangeConfiguration: new EventEmitter().event
    }
};
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') { return vscodeStub; }
    return origLoad.apply(this, arguments);
};
const { EnginesPanel } = require(path.join(ROOT, 'out', 'panels', 'enginesPanel.js'));
const { AccountsPanel } = require(path.join(ROOT, 'out', 'panels', 'accountsPanel.js'));
const { RemoteViews, messageScope } = require(path.join(ROOT, 'out', 'panels', 'remoteViews.js'));
const { remotePages } = require(path.join(ROOT, 'out', 'panels', 'remotePages.js'));
Module._load = origLoad;
const { scopeAtLeast } = require(path.join(ROOT, 'out', 'remote', 'index.js'));
const { requiredScope } = require(path.join(ROOT, 'out', 'remote', 'scopes.js'));

const calls = [];
const deps = {
    extensionUri: uri('/ext'),
    engines: () => [{ id: 'claude', label: 'Claude Code', ready: true, auth: { mode: 'subscription' }, cli: { found: true } }],
    test: async id => { calls.push('test:' + id); return { id, ok: true, ms: 1, at: Date.now() }; },
    command: c => { calls.push('command:' + c); },
    key: n => { calls.push('key:' + n); },
    profiles: () => [], ownership: () => [], providerHealth: async () => [],
    providerTest: async (e, p) => { calls.push('providerTest:' + p); },
    accounts: () => [{ id: 'work-1', engine: 'claude', label: 'work@studio' }],
    accountEngines: () => [], autoRefresh: () => true, policies: () => ({ rows: [] }),
    readAccounts: async () => undefined, accountBeatMs: () => 600000, setAutoRefresh: async () => undefined,
    captureAccount: async () => '', activateAccount: async () => '',
    forgetAccount: async (id, ask) => {
        calls.push('forget:' + id);
        const pick = await (ask || { warn: () => Promise.resolve(undefined) }).warn('Forget work@studio (' + id + ')?', { modal: true },
            'Forget and delete folder', 'Forget, keep folder');
        calls.push('forgot:' + pick);
        return '';
    },
    reauthAccount: async id => { calls.push('reauth:' + id); return ''; },
    repairAccountSettings: () => [], completeAccount: () => [],
    queueAccountRefresh: ids => { calls.push('quota:' + ids.join()); },
    openSession: f => { calls.push('openSession:' + f); },
    savePolicy: async () => '', deletePolicy: async () => '',
    saveProfile: async () => [], removeProfile: async () => [], copyProfile: async () => [],
    profileKey: id => { calls.push('profileKey:' + id); },
    engineLabels: { claude: 'Claude Code' }
};
const settle = () => new Promise(r => setTimeout(r, 10));
const alive = setInterval(() => undefined, 1000);

(async () => {
    // ---- what each message needs ----
    const pages = remotePages({ engines: () => undefined, accounts: () => undefined });
    const eng = pages.engines, acc = pages.accounts;
    ok('‼️ the pages ask what their ops ask: accounts, providers, engines and policies are admin even to look',
        !!eng && !!acc && ['accounts.list', 'providers.list', 'engines.list', 'policies.list'].every(op => requiredScope(op) === 'admin')
        && [eng, acc].every(p => p.open === requiredScope('accounts.list') && p.act === requiredScope('accounts.forget')));
    ok('the page and a quota reading are its looks', [eng, acc].every(p => ['refresh', 'accountRefresh'].every(t => messageScope(p, t) === 'admin')));
    const ACTS = ['engineTest', 'providerTest', 'providerSave', 'providerRemove', 'providerCopy', 'accountCapture', 'accountActivate',
        'accountsAutoRefresh', 'accountFixSettings', 'accountComplete', 'accountForget', 'policySave', 'policyDelete'];
    ok('a test turn, a route, a capture, a switch, the repairs, the forget and the rules are acts', ACTS.every(t => messageScope(eng, t) === 'admin'));
    const PC = ['engineCommand', 'engineKey', 'providerKey', 'engineDocs', 'accountReauth', 'accountOpenSession', 'afnav'];
    ok('‼️ a CLI\'s terminal, a key typed on the PC, the Secrets page, a docs link and a sign-in\'s renewal never run from a phone',
        PC.every(t => messageScope(eng, t) === null) && ['accountReauth', 'accountOpenSession', 'afnav'].every(t => messageScope(acc, t) === null));

    // ---- the pages on a phone ----
    const made = {};
    const views = new RemoteViews({
        media: uri('/ext/media'), atLeast: scopeAtLeast, waitMs: 60,
        pages: remotePages({
            engines: host => { made.engines = host; EnginesPanel.openOn(host, deps); },
            accounts: host => { made.accounts = host; AccountsPanel.openOn(host, deps); }
        })
    });
    const manager = { device: 'dev_m', scope: 'manage' };
    ok('‼️ a phone paired at manage cannot open them', views.open(manager, 'm1', 'engines', undefined, () => undefined) === false
        && views.open(manager, 'm2', 'accounts', undefined, () => undefined) === false && !made.engines && !made.accounts);

    const admin = { device: 'dev_a', scope: 'admin' };
    const toE = [];
    ok('an admin device opens the Engines page', views.open(admin, 'e1', 'engines', undefined, m => toE.push(m)) === true);
    ok('‼️ a phone\'s view never becomes the desktop\'s tab', EnginesPanel.current === undefined && made.engines && made.engines.remote === true);
    const page = (await views.page('/view/engines?view=e1', admin)).body;
    ok('its page and script load from /res/, with the farm\'s sign-ins in it', page.includes('src="/res/engines.js"')
        && page.includes('href="/res/common.css"') && !/vscode-webview:|file:\/\//.test(page) && page.includes('work@studio'));

    calls.length = 0;
    views.message(admin, 'e1', { type: 'accountRefresh', ids: ['work-1'] });
    views.message(admin, 'e1', { type: 'engineTest', id: 'claude' });
    await settle();
    ok('a quota reading and a test turn run from the phone', calls.includes('quota:work-1') && calls.includes('test:claude'));

    calls.length = 0; pcSide.length = 0;
    views.message(admin, 'e1', { type: 'accountForget', id: 'work-1' });
    await settle();
    const q = toE.find(m => m.type === 'afAsk' && /Forget work@studio/.test(String(m.message)));
    ok('‼️ forgetting a sign-in asks ON THE PHONE, never on the PC', !!q && pcSide.length === 0 && calls.includes('forget:work-1') && !calls.some(c => c.startsWith('forgot:')));
    views.message(admin, 'e1', { type: 'afAskAnswer', id: q && q.id, value: 1 });
    await settle();
    ok('…and the phone\'s choice is the one carried out', calls.includes('forgot:Forget, keep folder'));

    calls.length = 0; pcSide.length = 0;
    for (const t of PC) { views.message(admin, 'e1', { type: t, command: 'npm i -g x', name: 'GEMINI_API_KEY', id: 'work-1', label: 'k', url: 'https://example.com', file: 'C:/x.jsonl', to: 'dashboard' }); }
    await settle();
    ok('‼️ nothing a phone sends opens a terminal, a password box, the Secrets page, a link or a sign-in on the PC',
        pcSide.length === 0 && calls.length === 0);

    const before = toE.filter(m => m.type === 'data').length;
    EnginesPanel.refreshIfOpen();
    await settle();
    ok('the farm\'s refresh reaches the phone\'s Engines view', toE.filter(m => m.type === 'data').length === before + 1);

    const toA = [];
    ok('an admin device opens the Accounts page, never as the desktop\'s tab', views.open(admin, 'a1', 'accounts', undefined, m => toA.push(m)) === true
        && AccountsPanel.current === undefined && made.accounts && made.accounts.remote === true);
    const apage = (await views.page('/view/accounts?view=a1', admin)).body;
    ok('…its page from /res/ with the sign-ins', apage.includes('src="/res/accounts.js"') && apage.includes('work@studio'));
    calls.length = 0; pcSide.length = 0;
    views.message(admin, 'a1', { type: 'accountForget', id: 'work-1' });
    await settle();
    ok('‼️ the Accounts page asks the forget on the phone too', toA.some(m => m.type === 'afAsk' && /Forget work@studio/.test(String(m.message))) && pcSide.length === 0);
    const aBefore = toA.filter(m => m.type === 'data').length;
    AccountsPanel.refreshIfOpen();
    await settle();
    ok('the farm\'s refresh reaches the phone\'s Accounts view', toA.filter(m => m.type === 'data').length === aBefore + 1);

    views.close(admin, 'e1');
    views.close(admin, 'a1');
    ok('a closed view leaves no instance behind to refresh', EnginesPanel.phones.size === 0 && AccountsPanel.phones.size === 0);

    // ---- the host's wiring, read off the source ----
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('the phone and the palette open the pages from the same deps',
        /engines: host => EnginesPanel\.openOn\(host, enginesPanelDeps\)/.test(ext) && /EnginesPanel\.show\(enginesPanelDeps\)/.test(ext)
        && /accounts: host => AccountsPanel\.openOn\(host, accountsPanelDeps\)/.test(ext) && /AccountsPanel\.show\(accountsPanelDeps\)/.test(ext));
    ok('‼️ the forget asks whoever is looking, the desktop\'s window by default',
        /forgetAccount: \(id: string, ask\?: PanelAsk\): Promise<string> => forgetAccountFromPage\(id, ask\)/.test(ext)
        && /const forgetAccountFromPage = async \(id: string, ask: PanelAsk = desktopAsk\(\)\)/.test(ext)
        && /const pick = await ask\.warn\(lines\.join\('\\n'\), \{ modal: true \},/.test(ext));
    const ep = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'enginesPanel.ts'), 'utf8');
    const ap = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'accountsPanel.ts'), 'utf8');
    ok('the desktop tabs are made through desktopHost(), and a phone view closing leaves them alone',
        /desktopHost\(\{ viewType: 'agentfarm\.engines'/.test(ep) && /if \(EnginesPanel\.current === this\) \{ EnginesPanel\.current = undefined; \}/.test(ep)
        && /desktopHost\(\{ viewType: 'agentfarm\.accounts'/.test(ap) && /if \(AccountsPanel\.current === this\) \{ AccountsPanel\.current = undefined; \}/.test(ap));

    // ---- on a phone ----
    const ejs = fs.readFileSync(path.join(ROOT, 'media', 'engines.js'), 'utf8');
    ok('the ownership table scrolls in its own box (it was 423px on a 360px screen)',
        /html\.af-phone \.potab \{ display:block; max-width:100%; overflow-x:auto; \}/.test(ejs));
    ok('a CLI\'s install or sign-in, a key, a docs link and a route\'s key are not drawn on the phone',
        /html\.af-phone \[data-engcmd\], html\.af-phone \[data-engkey\], html\.af-phone \[data-engdocs\],\s*html\.af-phone \[data-pokey\] \{ display:none; \}/.test(ejs));
    const ajs = fs.readFileSync(path.join(ROOT, 'media', 'afAccounts.js'), 'utf8');
    ok('a sign-in\'s renewal (a PC terminal) is not drawn on the phone',
        /html\.af-phone \.af-tipw:has\(> \[data-acreauth\]\), html\.af-phone \[data-acreauth\] \{ display:none; \}/.test(ajs));
    const rjs = fs.readFileSync(path.join(ROOT, 'media', 'afRemote.js'), 'utf8');
    ok('a card\'s last session opens as the phone\'s session page', /var READS = \{[^}]*accountOpenSession: true[^}]*\};/.test(rjs));

    clearInterval(alive);
    console.log(`\nengines and accounts on a phone: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL threw: ' + (e && e.stack || e)); process.exit(1); });
