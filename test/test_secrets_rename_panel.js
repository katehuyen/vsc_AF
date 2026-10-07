// X-487 — A RENAMED SECRET TAKES THE ROUTES THAT SIGN IN WITH IT ALONG, AND A REFUSED SAVE MOVES NOTHING.
//
// The Secrets page saves through SecretsPanel.save: a different name on an edit renames the vault
// entry, then asks the host to carry what Agent Farm owns (each route's secretRef). This drives the
// real panel with the real vault and the real ProviderKeys, wired the way extension.ts wires them.
//
//   node test/test_secrets_rename_panel.js
'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

let onMsg = null;
const posted = [];
const fakePanel = {
    webview: {
        html: '', cspSource: '',
        asWebviewUri: u => u,
        postMessage: async m => { posted.push(m); return true; },
        onDidReceiveMessage: cb => { onMsg = cb; return { dispose() { } }; }
    },
    onDidDispose: () => ({ dispose() { } }),
    reveal() { }
};
const vscodeStub = {
    Uri: { joinPath: (u, ...p) => ({ path: p.join('/'), toString: () => p.join('/') }) },
    ViewColumn: { One: 1 },
    window: { createWebviewPanel: () => fakePanel },
    workspace: { getConfiguration: () => ({ get: (k, d) => d, inspect: () => undefined }) },
    env: { language: 'en' }, commands: {}
};
const origLoad = Module._load;
Module._load = function (request) { return request === 'vscode' ? vscodeStub : origLoad.apply(this, arguments); };
const { SecretsPanel } = require(path.join(ROOT, 'out', 'panels', 'secretsPanel.js'));
const { SecretsVault } = require(path.join(ROOT, 'out', 'core', 'secrets.js'));
const { ProviderKeys } = require(path.join(ROOT, 'out', 'core', 'providerKeys.js'));
Module._load = origLoad;

const store = () => { const m = new Map(); return { m, get: async k => m.get(k), store: async (k, v) => { m.set(k, v); }, delete: async k => { m.delete(k); } }; };
const memento = () => { const m = new Map(); return { m, get: (k, d) => (m.has(k) ? m.get(k) : d), update: async (k, v) => { m.set(k, v); } }; };
const LABELS = { openrouter: 'OpenRouter', 'openrouter-r1': 'OpenRouter R1', kimi: 'Kimi' };

(async () => {
    // ---------- the pure half: which routes follow ----------
    const pk0 = new ProviderKeys(store(), memento());
    await pk0.bind('a', { baseUrl: 'https://a', secretRef: 'K' });
    await pk0.bind('b', { baseUrl: '' });
    ok('refsTo names the routes signing in with the secret, and nothing for an empty name',
        pk0.refsTo('K').join() === 'a' && pk0.refsTo('').length === 0 && pk0.refsTo('b').length === 0);
    ok('a no-op or an empty new name moves nothing',
        (await pk0.followRename('K', 'K')).length === 0 && (await pk0.followRename('K', '')).length === 0 && pk0.bindOf('a').secretRef === 'K');

    // ---------- the page: a real save through the panel ----------
    const vault = new SecretsVault(store(), memento());
    const keys = new ProviderKeys(store(), memento());
    await vault.set('OR_KEY', 'sk-or', { description: 'openrouter' });
    await vault.set('KIMI_KEY', 'sk-kimi');
    await vault.set('TELEGRAM_BOT_TOKEN', 'tg');
    await keys.bind('openrouter', { baseUrl: 'https://openrouter.ai/api', secretRef: 'OR_KEY' });
    await keys.bind('openrouter-r1', { baseUrl: 'https://openrouter.ai/api', secretRef: 'OR_KEY' });
    await keys.bind('kimi', { baseUrl: 'https://kimi', secretRef: 'KIMI_KEY' });
    await keys.set('anthropic', 'sk-own', '');
    const routeLabel = id => LABELS[id] || id;
    const deps = {
        extensionUri: { path: '' }, vault, getAgents: () => [{ id: 'a1', name: 'developer' }],
        routesUsing: name => keys.refsTo(name).map(id => ({ id, label: routeLabel(id) })),
        readers: name => (name === 'TELEGRAM_BOT_TOKEN' ? ['the phone bridge (Telegram bot token)'] : []),
        renamed: async (from, to) => (await keys.followRename(from, to)).map(routeLabel)
    };
    SecretsPanel.show(deps);
    // the panel fires its handler and forgets it (void this.onMessage), so the reply is waited for
    const reply = () => posted.filter(m => m.type === 'sec-msg').pop();
    const save = async secret => {
        posted.length = 0; onMsg({ type: 'sec-save', secret });
        for (let i = 0; i < 200 && !reply(); i++) { await new Promise(res => setImmediate(res)); }
        return reply() || {};
    };
    const binds = () => JSON.stringify(keys.binds());

    const data0 = JSON.parse(JSON.stringify(posted));
    ok('the page is drawn and listens', typeof onMsg === 'function' && Array.isArray(data0));

    let before = binds();
    let r = await save({ mode: 'edit', from: 'OR_KEY', name: 'KIMI_KEY', reach: 'all' });
    ok('‼️ a rename onto a name that exists is refused, and nothing moves',
        r.ok === false && /already exists/.test(r.text) && binds() === before && vault.get('OR_KEY') === 'sk-or');

    r = await save({ mode: 'edit', from: 'OR_KEY', name: 'OR_WORK', reach: 'some', agents: [] });
    ok('‼️ Chosen agents with none ticked is refused before the rename, and nothing moves',
        r.ok === false && /tick at least one/.test(r.text) && binds() === before && vault.names().includes('OR_KEY') && !vault.names().includes('OR_WORK'));

    r = await save({ mode: 'edit', from: 'OR_KEY', name: 'OR_WORK', reach: 'all', description: 'openrouter' });
    const b = keys.binds();
    ok('‼️ a rename carries both routes signing in with it to the new name, their endpoint kept',
        b.openrouter.secretRef === 'OR_WORK' && b['openrouter-r1'].secretRef === 'OR_WORK'
        && b.openrouter.baseUrl === 'https://openrouter.ai/api' && keys.refsTo('OR_KEY').length === 0);
    ok('…a route on another secret and a route with its own key are untouched',
        b.kimi.secretRef === 'KIMI_KEY' && b.anthropic.secretRef === undefined && keys.get('anthropic') === 'sk-own');
    ok('…the value moves with the name', vault.get('OR_WORK') === 'sk-or' && vault.get('OR_KEY') === undefined);
    ok('…and the page is told which routes now use the new name',
        r.ok === true && /Renamed from "OR_KEY"; OpenRouter, OpenRouter R1 now use the new name\./.test(r.text));
    const data = posted.filter(m => m.type === 'data').pop();
    ok('the redrawn row lists the routes under the new name',
        !!data && data.data.secrets.find(s => s.name === 'OR_WORK').routes.map(x => x.label).join() === 'OpenRouter,OpenRouter R1');

    r = await save({ mode: 'edit', from: 'TELEGRAM_BOT_TOKEN', name: 'TG_TOKEN', reach: 'all' });
    ok('‼️ a rename Agent Farm cannot follow says so: the fixed lookup still asks for the old name',
        r.ok === true && /Agent Farm still looks for "TELEGRAM_BOT_TOKEN" for: the phone bridge/.test(r.text) && !/now use/.test(r.text));

    // ---------- X-451 — a key only Agent Farm reads starts farm-only, whatever reach the new card had ----------
    const FCM = 'FCM_SERVICE_ACCOUNT_JSON';
    const fcmRow = () => vault.list().find(s => s.name === FCM);
    r = await save({ mode: 'new', name: FCM, value: '{"type":"service_account"}', reach: 'all' });
    ok('‼️ X-451 a new key only Agent Farm reads starts farm-only: no agent task receives it',
        r.ok === true && fcmRow().farmOnly && !(FCM in vault.env('a1')) && /Open its row to let agents have it too/.test(r.text));
    r = await save({ mode: 'edit', from: FCM, name: FCM, reach: 'all' });
    ok('…and its row can widen it: an edit is the person\'s own choice', r.ok === true && !fcmRow().farmOnly && FCM in vault.env('a1'));
    r = await save({ mode: 'new', name: 'OTHER_KEY', value: 'v', reach: 'all' });
    ok('any other new key keeps the reach it was given', r.ok === true && !vault.list().find(s => s.name === 'OTHER_KEY').farmOnly);

    // ---------- the host wires the panel to these two, not to a copy of them ----------
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('extension.ts: routesUsing and renamed are ProviderKeys.refsTo / followRename',
        /routesUsing: \(name: string\) => providerKeys\.refsTo\(name\)/.test(ext)
        && /renamed: async \(from: string, to: string\) => \(await providerKeys\.followRename\(from, to\)\)\.map\(routeLabel\)/.test(ext));

    console.log(`\ntest_secrets_rename_panel: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
