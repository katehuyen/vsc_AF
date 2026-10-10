// X-456 — THE TOOLBOX ON A PHONE. It carries the farm's configuration (MCP
// definitions, the Telegram, web and phone-app services, the hooks), so only an
// admin phone opens it; there the hooks' and the cards' confirmations are asked
// ON THE PHONE and a notice is told there; a file, a folder, a link, a skill's
// scope, the constitution sync, the Telegram token, the phone app's reach, its
// firewall prompt and the PC clipboard never run from a phone; the farm's
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
const uri = p => ({ path: p, fsPath: p, toString: () => 'file://' + p });
const pcSide = [];
const vscodeStub = {
    EventEmitter,
    Uri: { joinPath: (b, ...parts) => uri([b.path, ...parts].join('/')), file: uri, parse: uri },
    ViewColumn: { One: 1, Active: -1 },
    ConfigurationTarget: { Global: 1 },
    ProgressLocation: { Notification: 15 },
    env: { openExternal: u => { pcSide.push('external:' + u); return Promise.resolve(true); }, clipboard: { writeText: t => { pcSide.push('clipboard:' + t); return Promise.resolve(); } } },
    window: {
        createWebviewPanel: () => { throw new Error('no desktop tab for a phone'); },
        showErrorMessage: m => { pcSide.push('error:' + m); return Promise.resolve(undefined); },
        showInformationMessage: m => { pcSide.push('info:' + m); return Promise.resolve(undefined); },
        showWarningMessage: m => { pcSide.push('warn:' + m); return Promise.resolve(undefined); },
        showTextDocument: () => { pcSide.push('editor'); return Promise.resolve(undefined); },
        withProgress: (_o, fn) => { pcSide.push('progress'); return fn(); }
    },
    commands: { executeCommand: (...a) => { pcSide.push('command:' + a[0]); return Promise.resolve(undefined); } },
    workspace: {
        getConfiguration: () => ({ get: (_k, d) => d, update: async () => { pcSide.push('config'); } }), workspaceFolders: [],
        onDidChangeConfiguration: new EventEmitter().event
    }
};
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') { return vscodeStub; }
    return origLoad.apply(this, arguments);
};
const { ToolboxPanel } = require(path.join(ROOT, 'out', 'panels', 'toolboxPanel.js'));
const { webCardMessage } = require(path.join(ROOT, 'out', 'panels', 'toolboxWeb.js'));
const { remoteCardMessage } = require(path.join(ROOT, 'out', 'panels', 'toolboxRemote.js'));
const { RemoteViews, messageScope } = require(path.join(ROOT, 'out', 'panels', 'remoteViews.js'));
const { remotePages } = require(path.join(ROOT, 'out', 'panels', 'remotePages.js'));
Module._load = origLoad;
const { scopeAtLeast } = require(path.join(ROOT, 'out', 'remote', 'index.js'));

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'af-toolboxphone-'));
const calls = [];
const deps = {
    extensionUri: uri('/ext'), getAgents: () => [], index: {}, cacheFile: path.join(HOME, 'probe.json'),
    refreshTrees: () => undefined, home: HOME,
    hooks: {
        snapshot: () => ({ listener: 'listening', port: 8377, command: 'node hook.js', targets: [] }),
        holder: () => ({ canStop: false }),
        install: async scope => { calls.push('install:' + scope); return { installed: 1, failed: 0, note: 'ok' }; },
        remove: async scope => { calls.push('remove:' + scope); return { removed: 1, note: 'ok' }; },
        clearPort: () => ({ ok: false }), restart: () => { calls.push('restart'); }
    }
};
const settle = () => new Promise(r => setTimeout(r, 15));
const alive = setInterval(() => undefined, 1000);

(async () => {
    // ---- what each message needs ----
    const B = remotePages({ toolbox: () => undefined }).toolbox;
    ok('‼️ the Toolbox asks admin to open and to act — its reads carry the farm\'s configuration', B && B.open === 'admin' && B.act === 'admin');
    ok('the page and a server\'s full definition are its looks', messageScope(B, 'refresh') === 'admin' && messageScope(B, 'mcp-def') === 'admin');
    ok('the hooks, a tool, the plugins, the services\' switches and the phones are its acts',
        ['hooks-install', 'hooks-remove', 'hooks-restart', 'remove', 'tool-save', 'togglePlugin', 'toggleMcp', 'probe',
            'svc-verify', 'svc-set'].every(t => messageScope(B, t) === 'admin'));
    const PC = ['open', 'reveal', 'openExternal', 'skillScope', 'headerAction', 'svc-connect', 'openGuide', 'afnav'];
    ok('‼️ a file, a folder, a link, a skill\'s scope, the sync and the token never run from a phone',
        PC.every(t => messageScope(B, t) === null));

    // ---- the page on a phone ----
    const made = {};
    const views = new RemoteViews({
        media: uri('/ext/media'), atLeast: scopeAtLeast, waitMs: 60,
        pages: remotePages({ toolbox: host => { made.t = host; ToolboxPanel.openOn(host, deps); } })
    });
    const manager = { device: 'dev_m', scope: 'manage' }, admin = { device: 'dev_a', scope: 'admin' };
    ok('‼️ a phone paired to manage does not open it', views.open(manager, 'm1', 'toolbox', undefined, () => undefined) === false && !made.t);
    const toA = [];
    ok('an admin phone opens it, never as the desktop\'s tab', views.open(admin, 'a1', 'toolbox', undefined, m => toA.push(m)) === true
        && made.t && made.t.remote === true && ToolboxPanel.current === undefined);
    ok('…from /res/', (await views.page('/view/toolbox?view=a1', admin)).body.includes('src="/res/toolbox.js"'));
    pcSide.length = 0;
    views.message(admin, 'a1', { type: 'hooks-install', scope: 'user' });
    await settle();
    const q = toA.find(m => m.type === 'afAsk' && m.kind === 'message' && m.modal === true && /live hooks/.test(String(m.message)));
    ok('‼️ installing the hooks asks ON THE PHONE first', !!q && pcSide.length === 0 && !calls.includes('install:user'));
    if (q) { views.message(admin, 'a1', { type: 'afAskAnswer', id: q.id, value: 0 }); }
    await settle();
    ok('…and installs on its answer, the result drawn on the card', calls.includes('install:user') && toA.some(m => m.type === 'hooks-said'));
    toA.length = 0; pcSide.length = 0;
    views.message(admin, 'a1', { type: 'remove', item: { kind: 'skill', name: 'x', scope: 'user' } });
    await settle();
    ok('‼️ removing a tool asks ON THE PHONE', toA.some(m => m.type === 'afAsk' && m.modal === true && /Remove skill "x"/.test(String(m.message))) && pcSide.length === 0);
    toA.length = 0;
    views.message(admin, 'a1', { type: 'togglePlugin', key: 'p@m', on: true });
    await settle();
    ok('‼️ a plugin switch is told ON THE PHONE', toA.some(m => m.type === 'afAsk' && m.kind === 'note') && pcSide.length === 0);
    calls.length = 0; pcSide.length = 0;
    for (const t of PC) { views.message(admin, 'a1', { type: t, path: 'C:/x.md', url: 'https://example.com', link: 'agentfarm://pair?x', mode: 'off', action: 'syncConstitution', agentId: 'a', name: 'n', to: 'dashboard' }); }
    await settle();
    ok('‼️ nothing PC-only a phone sends opens, copies, prompts or switches anything on the PC', calls.length === 0 && pcSide.length === 0);
    const datas = () => toA.filter(m => m.type === 'data').length;
    const n0 = datas();
    ToolboxPanel.refreshIfOpen();
    await settle();
    ok('the farm\'s refresh reaches the phone', datas() === n0 + 1);
    views.close(admin, 'a1');
    ok('a closed view leaves no instance behind', ToolboxPanel.phones.size === 0);

    // ---- the cards' confirmations go to whoever is looking ----
    const asked = [];
    const ask = { warn: async (m, _o, yes) => { asked.push(m); return yes; } };
    const web = { enableWebView: async () => { calls.push('web-on'); }, newWebToken: async () => { calls.push('token'); } };
    pcSide.length = 0;
    await webCardMessage({ type: 'web-token' }, { host: web, say: () => undefined, ask });
    await webCardMessage({ type: 'web-start', bind: 'lan' }, { host: web, say: () => undefined, ask });
    ok('‼️ a new web token and serving the network ask the page\'s own asker', asked.length === 2 && calls.includes('token') && calls.includes('web-on') && pcSide.length === 0);
    const devices = { revoke: id => { calls.push('revoke:' + (id || 'all')); return 1; }, setScope: () => ({ ok: true, from: 'manage' }) };
    asked.length = 0;
    await remoteCardMessage({ type: 'remote-revoke', device: 'd1', name: 'Pixel' }, { host: devices, setPair: () => undefined, say: () => undefined, ask });
    await remoteCardMessage({ type: 'remote-scope', device: 'd1', name: 'Pixel', scope: 'admin' }, { host: devices, setPair: () => undefined, say: () => undefined, ask });
    await remoteCardMessage({ type: 'remote-revoke-all' }, { host: devices, setPair: () => undefined, say: () => undefined, ask });
    ok('‼️ revoking a phone, making one admin and revoking all ask the page\'s own asker', asked.length === 3
        && calls.includes('revoke:d1') && calls.includes('revoke:all') && pcSide.length === 0);

    // ---- the host's wiring and the phone's page ----
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('the phone opens the Toolbox from the palette\'s own deps', /toolbox: host => ToolboxPanel\.openOn\(host, toolboxDeps\)/.test(ext));
    const media = n => fs.readFileSync(path.join(ROOT, 'media', n), 'utf8');
    const tb = media('toolbox.js');
    ok('‼️ a tool row is a card on a phone, its name leading and every figure under its column\'s name',
        /function cardRow\(html, cols\)/.test(tb) && /<table class="tb" data-afcards>\s*<tr data-afcardhead>/.test(tb)
        && /rows\.map\(x => cardRow\(rowFn\(x\), cols\)\)/.test(tb) && /\.map\(r => cardRow\(r, PLUGIN_COLS\)\)/.test(tb)
        && /'<td data-lead'/.test(tb) && /data-afcardmore/.test(tb));
    ok('…a file, a folder and a homepage are not drawn there; the hook paths wrap',
        /html\.af-phone \[data-act="open"\], html\.af-phone \[data-act="reveal"\], html\.af-phone \[data-act="home"\] \{ display: none; \}/.test(tb)
        && /html\.af-phone \.hkpath \{[^}]*overflow-wrap: anywhere;/.test(tb));
    ok('‼️ the token, the PC clipboard and the firewall prompt are not drawn on a phone; the reach is shown, not changed',
        /html\.af-phone \[data-svc="connect"\] \{ display: none; \}/.test(media('afTelegram.js'))
        && /html\.af-phone \[data-web=copy\] \{ display:none; \}/.test(media('afWeb.js'))
        && /html\.af-phone \[data-remote="firewall-allow"\], html\.af-phone \[data-remote="copy-link"\] \{ display:none; \}/.test(media('afPhoneApp.js'))
        && /<select id="remote-mode"\$\{PHONE\(\) \? ' disabled' : ''\}>/.test(media('afPhoneApp.js')));
    ok('a service row\'s label takes its own line on a phone', /html\.af-phone \.svc-lbl \{ flex: 1 1 100%;/.test(media('afTelegram.js')));

    clearInterval(alive);
    fs.rmSync(HOME, { recursive: true, force: true });
    console.log(`\ntoolbox on a phone: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL threw: ' + (e && e.stack || e)); process.exit(1); });
