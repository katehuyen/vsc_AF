// U-247 — 📱 MOBILE: the global row's 'now' button is the Mobile group, its strip holds Now, Web and Devices,
// and the Toolbox's web view and phone app cards are pages of their own — on the PC, and on an admin phone.
//
// What this guards: the strip is a GROUP the page finds by its own id (the inbox strip drawn exactly as it
// was), every tab reaches its page by afnav, the palette and a registered command, each Mobile page draws
// its one card WITH the shared service-card look, the phone draws no strip, the two pages keep the gates the
// Toolbox held for those cards, and neither the Toolbox nor the Dashboard still draws them.
'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));
const FX = require(path.join(__dirname, 'fixtures', 'mobile.js'));
const TB = require(path.join(__dirname, 'fixtures', 'toolbox.js'));
const navs = html => (html.match(/data-afnav="([^"]+)"/g) || []).map(m => m.slice(12, -1));
const count = (s, needle) => s.split(needle).length - 1;

// ---------- the header: one row button, two strips ----------
const webPage = runPage('mobile.js', FX.onWeb(FX.web()));
const H = webPage.sandbox.window.AFHeader;
const strip = id => H.tabs(id).replace(/<style>[\s\S]*?<\/style>/, '');
const nowBtn = H.pages().find(p => p.id === 'now');
ok('the global row\'s now button reads Mobile, its id kept', !!nowBtn && nowBtn.label === '📱 Mobile');
ok('…and says the three tabs it holds', /Now \(/.test(nowBtn.tip) && /Web \(/.test(nowBtn.tip) && /Devices \(/.test(nowBtn.tip));
ok('Web and Devices are tabs of the group, not destinations of the global row', !H.pages().some(p => p.id === 'web' || p.id === 'devices'));
ok('the phone\'s tab bar keeps Now: on the phone the group has no strip', /\{ id: 'now', icon: '◉', label: 'Now' \}/.test(read('media/afMobile.js')));
ok('…and the Now page is still titled Now', /title: t\('Now'\)/.test(read('media/now.js')));
for (const id of ['now', 'web', 'devices']) {
    ok(`the ${id} page draws the Mobile strip, ${id} marked`, navs(strip(id)).join() === 'now,web,devices'
        && new RegExp(`class="af-tab on" data-afnav="${id}"`).test(strip(id)) && /class="af-tabs af-tabs-mobile"/.test(strip(id)));
}
const INBOX = '<div class="af-tabs">'
    + '<button class="af-tab on" data-afnav="notices">🔔 Notices<span class="af-tab-n" data-afcount="notices"></span></button>'
    + '<button class="af-tab " data-afnav="queue">📥 Queue<span class="af-tab-n" data-afcount="queue"></span></button>'
    + '<span class="af-tab-sep" aria-hidden="true"></span>'
    + '<button class="af-tab " data-afnav="a2anotes">🤖 A2A Notes<span class="af-tab-n af-tab-grey" data-afcount="a2anotes"></span></button>'
    + '<button class="af-tab " data-afnav="a2atasks">⚡ A2A Tasks<span class="af-tab-n af-tab-grey" data-afcount="a2atasks"></span></button>'
    + '</div>';
ok('‼️ the inbox strip is drawn exactly as before', strip('notices') === INBOX);
ok('…and a page outside every group still gets the inbox, never the Mobile strip', navs(strip('dashboard')).join() === 'notices,queue,a2anotes,a2atasks');
ok('‼️ the phone draws no Mobile strip', /html\.af-phone \.af-tabs-mobile \{ display:none; \}/.test(read('media/pageHeader.js'))
    && !/af-tabs-mobile/.test(strip('queue')));
ok('the Now page draws the strip', /\$\{window\.AFHeader\.tabs\('now'\)\}/.test(read('media/now.js')));

// ---------- every tab reaches its page three ways ----------
const base = read('src/panels/base.ts');
const pkg = JSON.parse(read('package.json'));
const contributed = new Set(pkg.contributes.commands.map(c => c.command));
const ext = read('src/extension.ts');
for (const id of ['now', 'web', 'devices']) {
    const m = new RegExp(`\\b${id}: '(agentfarm\\.\\w+)'`).exec(base.slice(base.indexOf('export function handleAfNav')));
    const cmd = m && m[1];
    ok(`${id}: afnav routes it (${cmd})`, !!cmd);
    ok(`${id}: the palette offers it`, !!cmd && contributed.has(cmd));
    // ‼️ by its literal id: a command registered under a computed id is a door the parity gate cannot see
    ok(`${id}: a command is registered for it, by name`, !!cmd && ext.indexOf(`registerCommand('${cmd}'`) >= 0);
}
ok('…and each Mobile command opens its own view', /registerCommand\('agentfarm\.openMobileWeb', \(\) => MobilePanel\.show\(MOBILE_VIEW\.web, mobileDeps\(\)\)\)/.test(ext)
    && /registerCommand\('agentfarm\.openMobileDevices', \(\) => MobilePanel\.show\(MOBILE_VIEW\.devices, mobileDeps\(\)\)\)/.test(ext));

// ---------- one card per page, with the service cards' look ----------
const cards = h => count(h, 'class="card svc-card"');
const web = webPage.html();
ok('the Web page draws one card: the web view\'s', cards(web) === 1 && /id="web-bind"/.test(web) && !/class="rm-devices"/.test(web));
const dev = runPage('mobile.js', FX.variants().find(v => v.id === 'mobile-devices-pair').data).html();
ok('the Devices page draws one card: the phone app\'s', cards(dev) === 1 && /class="rm-devices"/.test(dev) && !/id="web-bind"/.test(dev));
ok('the Web and Devices pages draw the Mobile strip, their own tab marked', /<div class="af-tabs af-tabs-mobile">[\s\S]*class="af-tab on" data-afnav="web"/.test(web)
    && /<div class="af-tabs af-tabs-mobile">[\s\S]*class="af-tab on" data-afnav="devices"/.test(dev));
ok('‼️ each card wears the shared service-card look (AFTelegram.css)', [web, dev].every(h => /\.svc-head \{ align-items: center; display: flex;/.test(h)
    && /\.svc-msg\.ok \{/.test(h) && /\.svc-card \.mini \{/.test(h)));
ok('a window with no web host says so in the card', /web view is not available in this window/.test(runPage('mobile.js', { view: 'web' }).html()));
ok('…and one with no phone host, in the phone app card\'s own words', /phone app is not available in this window/.test(runPage('mobile.js', { view: 'devices' }).html()));
const said = runPage('mobile.js', FX.onWeb(FX.web()));
said.send({ type: 'web-said', ok: false, text: 'the port is taken' });
ok('what the host did is said in the card', /class="svc-msg bad">the port is taken</.test(said.html()));

// ---------- the Toolbox and the Dashboard no longer draw them ----------
const tb = runPage('toolbox.js', TB.data()).html();
ok('‼️ the Toolbox draws neither card', !/class="webbody"/.test(tb) && !/class="rm-devices"/.test(tb) && !/Agent Farm app/.test(tb));
ok('…but points at both from Services', /data-afnav="web">🌐 Web</.test(tb) && /data-afnav="devices">🔗 Devices</.test(tb));
ok('the Toolbox panel neither composes nor answers them', !/toolboxWeb|toolboxRemote|web-said|remote-said/.test(read('src/panels/toolboxPanel.ts')));
ok('the Dashboard no longer carries the web button, nor an answer for it',
    !/openWebView/.test(read('media/dashboard.js')) && !/headerAction/.test(read('src/panels/dashboard.ts')));

// ---------- the phone's copies ----------
const EventEmitter = class { constructor() { this.l = []; } get event() { return (fn, t, bag) => { this.l.push(fn); const d = { dispose: () => undefined }; if (Array.isArray(bag)) { bag.push(d); } return d; }; } fire(e) { this.l.forEach(f => f(e)); } dispose() { this.l = []; } };
const uri = p => ({ path: p, fsPath: p, toString: () => 'file://' + p });
const pcSide = [];
const vscodeStub = {
    EventEmitter,
    Uri: { joinPath: (b, ...parts) => uri([b.path, ...parts].join('/')), file: uri, parse: uri },
    ViewColumn: { One: 1, Active: -1 },
    env: { openExternal: u => { pcSide.push('external:' + u); return Promise.resolve(true); }, clipboard: { writeText: t => { pcSide.push('clipboard:' + t); return Promise.resolve(); } } },
    window: {
        createWebviewPanel: () => { throw new Error('no desktop tab for a phone'); },
        showErrorMessage: m => { pcSide.push('error:' + m); return Promise.resolve(undefined); },
        showInformationMessage: m => { pcSide.push('info:' + m); return Promise.resolve(undefined); },
        showWarningMessage: m => { pcSide.push('warn:' + m); return Promise.resolve(undefined); }
    },
    commands: { executeCommand: (...a) => { pcSide.push('command:' + a[0]); return Promise.resolve(undefined); } },
    workspace: { getConfiguration: () => ({ get: (_k, d) => d }), workspaceFolders: [], onDidChangeConfiguration: new EventEmitter().event }
};
const origLoad = Module._load;
Module._load = function (request) { return request === 'vscode' ? vscodeStub : origLoad.apply(this, arguments); };
const { MobilePanel, MOBILE_VIEW } = require(path.join(ROOT, 'out', 'panels', 'mobilePanel.js'));
const { RemoteViews, messageScope } = require(path.join(ROOT, 'out', 'panels', 'remoteViews.js'));
const { remotePages } = require(path.join(ROOT, 'out', 'panels', 'remotePages.js'));
Module._load = origLoad;
const { scopeAtLeast } = require(path.join(ROOT, 'out', 'remote', 'index.js'));
ok('the views are named as the panel draws them', MOBILE_VIEW.web === 'web' && MOBILE_VIEW.devices === 'devices');

const settle = () => new Promise(r => setTimeout(r, 15));
const alive = setInterval(() => undefined, 1000);
(async () => {
    const P = remotePages({});
    ok('‼️ both pages ask admin to open and to act, as the Toolbox did for these cards',
        ['web', 'devices'].every(v => P[v] && P[v].open === 'admin' && P[v].act === 'admin'));
    ok('the web view\'s switches, binding and token are acts', ['web-start', 'web-stop', 'web-bind', 'web-token'].every(t => messageScope(P.web, t) === 'admin'));
    ok('pairing, a phone\'s scope and revoking are acts', ['remote-pair', 'remote-scope', 'remote-revoke', 'remote-revoke-all'].every(t => messageScope(P.devices, t) === 'admin'));
    ok('‼️ the PC clipboard, the reach and the firewall prompt never run from a phone',
        messageScope(P.web, 'web-copy') === null && ['remote-listen', 'remote-firewall-allow', 'remote-copy-link'].every(t => messageScope(P.devices, t) === null)
        && messageScope(P.web, 'afnav') === null && messageScope(P.devices, 'afnav') === null);
    ok('the Toolbox no longer holds their gates', ['web-copy', 'remote-listen', 'remote-firewall-allow', 'remote-copy-link'].every(t => messageScope(P.toolbox, t) === 'admin'));
    ok('the phone opens them with the Mobile deps', /web: host => MobilePanel\.openOn\(host, MOBILE_VIEW\.web, mobileDeps\(\)\)/.test(ext)
        && /devices: host => MobilePanel\.openOn\(host, MOBILE_VIEW\.devices, mobileDeps\(\)\)/.test(ext));

    const calls = [];
    const deps = {
        extensionUri: uri('/ext'),
        web: { snapshot: () => ({ enabled: true, port: 8378, bind: 'lan', token: 'abc', serving: true, lanAddress: '192.168.1.40' }),
            enableWebView: async () => { calls.push('web-on'); }, disableWebView: async () => { calls.push('web-off'); },
            setWebBind: async () => { calls.push('bind'); }, newWebToken: async () => { calls.push('token'); } }
    };
    const views = new RemoteViews({
        media: uri('/ext/media'), atLeast: scopeAtLeast, waitMs: 60,
        pages: remotePages({ web: host => MobilePanel.openOn(host, 'web', deps), devices: host => MobilePanel.openOn(host, 'devices', deps) })
    });
    const manager = { device: 'dev_m', scope: 'manage' }, admin = { device: 'dev_a', scope: 'admin' };
    ok('‼️ a phone paired to manage opens neither', views.open(manager, 'm1', 'web', undefined, () => undefined) === false
        && views.open(manager, 'm2', 'devices', undefined, () => undefined) === false);
    const toA = [];
    ok('an admin phone opens the Web page', views.open(admin, 'a1', 'web', undefined, m => toA.push(m)) === true);
    ok('…from /res/', (await views.page('/view/web?view=a1', admin)).body.includes('src="/res/mobile.js"'));
    views.message(admin, 'a1', { type: 'web-token' });
    await settle();
    const q = toA.find(m => m.type === 'afAsk' && m.modal === true);
    ok('‼️ a new token asks ON THE PHONE first', !!q && pcSide.length === 0 && !calls.includes('token'));
    if (q) { views.message(admin, 'a1', { type: 'afAskAnswer', id: q.id, value: 0 }); }
    await settle();
    ok('…and mints on its answer, said in the card', calls.includes('token') && toA.some(m => m.type === 'web-said'));
    pcSide.length = 0;
    views.message(admin, 'a1', { type: 'web-copy' });
    views.message(admin, 'a1', { type: 'afnav', to: 'dashboard' });
    await settle();
    ok('‼️ nothing PC-only a phone sends copies or opens anything on the PC', pcSide.length === 0);
    const n0 = toA.filter(m => m.type === 'data').length;
    views.message(admin, 'a1', { type: 'refresh' });
    await settle();
    ok('the page\'s refresh reaches the phone', toA.filter(m => m.type === 'data').length === n0 + 1);
    const toD = [];
    ok('an admin phone opens the Devices page', views.open(admin, 'a2', 'devices', undefined, m => toD.push(m)) === true
        && /"view":"devices"/.test((await views.page('/view/devices?view=a2', admin)).body));

    clearInterval(alive);
    console.log(`\nu-247 mobile: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL threw: ' + (e && e.stack || e)); process.exit(1); });
