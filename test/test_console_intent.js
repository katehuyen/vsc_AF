// X-152 — THE COMPOSER'S INTENT HAS ONE OWNER, AND IT IS THE HOST.
//
// The strip's answers used to live half in `ConsolePanel` (engine, route,
// sign-in, discipline) and half in the page's own state (model, effort,
// permission mode), narrowed on whichever side held them and stitched back
// together at Send. What is measured here is the record that replaces that:
// every dimension of the next session in ONE `LaunchIntent` on the host,
// seeded by the door that opened the panel, narrowed by the one rule
// (`core/aflaunch.ts` = `media/afLaunch.js`), changed by one message
// (`setIntent`), and pushed to the page whole (`composerIntent`).
//
// The page is a pure view of it (step 2: it draws `composerIntent` and posts
// `setIntent`; step 3: the per-field messages and the one-at-a-time fields
// are gone from the wire). Nothing here is about what the page draws.
'use strict';
const path = require('path');
const Module = require('module');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// ---------------------------------------------------------------- vscode stub
const panels = [];
const makeWebview = () => ({
    _html: '',
    posted: [],
    _listeners: [],
    cspSource: 'vscode-webview:',
    asWebviewUri: (u) => ({ toString: () => 'vscode-webview://' + String(u.path || u) }),
    // more than one listener is registered (the shared pickers add theirs);
    // every one is called, as the real webview would
    onDidReceiveMessage(fn) { this._listeners.push(fn); return { dispose() { } }; },
    _onMsg(m) { this._listeners.forEach(fn => fn(m)); },
    postMessage(m) { this.posted.push(m); return Promise.resolve(true); },
    set html(v) { this._html = v; },
    get html() { return this._html; }
});
const makePanel = () => {
    const p = {
        webview: makeWebview(), title: 'Console', revealed: 0,
        reveal() { this.revealed++; },
        onDidDispose: () => ({ dispose() { } }),
        onDidChangeViewState: () => ({ dispose() { } }),
        dispose() { }
    };
    panels.push(p);
    return p;
};
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') {
        return {
            Uri: { joinPath: (base, ...rest) => ({ path: [base.path, ...rest].join('/') }) },
            ViewColumn: { Active: -1 },
            ConfigurationTarget: { Global: 1 },
            env: {},
            EventEmitter: class { constructor() { this.event = () => ({ dispose() { } }); } fire() { } },
            window: {
                createWebviewPanel: () => makePanel(),
                showErrorMessage: () => Promise.resolve(undefined),
                showInformationMessage: () => Promise.resolve(undefined),
                showWarningMessage: () => Promise.resolve(undefined)
            },
            commands: { executeCommand: () => Promise.resolve(undefined) },
            workspace: {
                getConfiguration: () => ({ get: (_k, d) => d, update: async () => { } }),
                workspaceFolders: []
            }
        };
    }
    return origLoad.apply(this, arguments);
};

const { ConsolePanel } = require(path.resolve(__dirname, '../out/panels/consolePanel.js'));

// ------------------------------------------------------------------ deps stub
//
// Two engines with real catalogues, so narrowing has something to narrow: on
// Claude `opus` publishes high|max (default high) and `sonnet` low|medium
// (default low); Antigravity publishes one model and no per-model efforts.
const CLAUDE = {
    models: [{ id: 'opus', label: 'Opus' }, { id: 'sonnet', label: 'Sonnet' }],
    efforts: { opus: [{ id: 'high' }, { id: 'max' }], sonnet: [{ id: 'low' }, { id: 'medium' }] },
    defaultEffort: { opus: 'high', sonnet: 'low' }
};
const AGY = { models: [{ id: 'gemini-2.5-pro' }], efforts: {}, defaultEffort: {} };
const REMEMBERED = {
    'a-dev': {
        engine: 'agy', model: 'gemini-2.5-pro', effort: 'high', permissionMode: 'plan',
        superpowers: true,
        // X-145 — one row per engine; Claude was last run as sonnet/medium/acceptEdits
        byEngine: { claude: { model: 'sonnet', effort: 'medium', permissionMode: 'acceptEdits' } }
    }
};
const started = [];
const deps = {
    extensionUri: { path: 'D:/repo' },
    host: {
        list: () => [], onChange: () => ({ dispose() { } }),
        start: (init) => { started.push(init); return 'cs1'; }
    },
    getAgents: () => ([{ id: 'a-dev', name: 'developer', dir: 'D:/ajan/developer' }]),
    index: { all: () => [], external: () => [] },
    colorFor: () => '',
    modelAliases: () => [],
    engineModels: () => ({ claude: CLAUDE, agy: AGY }),
    engines: () => ([
        { id: 'claude', label: 'Claude Code', ready: true, auth: 'subscription' },
        { id: 'agy', label: 'Antigravity', ready: true, auth: 'subscription' }
    ]),
    launchDefaults: () => ({ engine: 'claude', model: '', effort: '', permissionMode: '' }),
    lastLaunch: (id) => REMEMBERED[id],
    rememberLaunch: () => { },
    // the agent's own per-engine setting in Farm Settings (X-145)
    agentSeedDefaults: (_dir, engine) => engine === 'claude' ? { model: 'opus', effort: 'max' } : { model: '', effort: '' },
    agentEngineDefaults: (_dir, engine) => engine === 'claude' ? { model: 'opus', effort: 'max' } : {},
    // the adapter's pruning (X-105): only Antigravity has a provider axis here
    prunePick: (engine, pick) => engine === 'agy' ? pick : {},
    liveOwners: () => [],
    history: () => [],
    olderHistory: () => ({ messages: [], more: false }),
    lastWindow: () => [],
    forgetLastWindow: () => { },
    leftoverOwner: () => undefined,
    endLeftover: async () => false,
    estimateCost: () => 0,
    projects: () => [],
    projectContextText: () => '',
    superpowersText: () => '',
    superpowersHealth: () => ({ usable: true, why: '', skills: 3 }),
    superpowersDefault: () => false,
    sessionProject: () => '',
    promptSnippets: () => ({ items: [], scopes: [] })
};

const bootstrap = (p) => {
    const m = /window\.__DATA__ = ([\s\S]*?); window\.__AFUI__/.exec(p.webview.html || '');
    return m ? JSON.parse(m[1]) : null;
};
const lastData = (p) => (p.webview.posted.filter(m => m && m.type === 'data').pop() || {}).data;
// the panel registers `m => void this.onMessage(m)`, so the handler's promise
// is not handed back; the push it ends in lands a few ticks later
const settle = () => new Promise(r => setTimeout(r, 20));
const send = async (p, msg) => {
    const before = p.webview.posted.length;
    p.webview._onMsg(msg);
    for (let i = 0; i < 25 && p.webview.posted.length === before; i++) { await settle(); }
    return lastData(p);
};

(async () => {
    // ------------------------------------------ 1. a door seeds the record
    ConsolePanel.show(deps, {
        agentId: 'a-dev', pinAgent: true, engine: 'agy',
        launch: {
            model: 'gemini-2.5-pro', effort: 'high', permissionMode: 'plan',
            prompt: 'ilk soru', superpowers: true, providerId: 'google', tier: 'pro'
        }
    });
    const p = panels[0];
    const cold = bootstrap(p);
    ok('‼️ X-152 — the whole intent is in the bootstrap payload, narrowed, as one record',
        cold && cold.composerIntent
        && cold.composerIntent.engine === 'agy'
        && cold.composerIntent.model === 'gemini-2.5-pro'
        && cold.composerIntent.effort === 'high'
        && cold.composerIntent.permissionMode === 'plan'
        && cold.composerIntent.providerId === 'google'
        && cold.composerIntent.tier === 'pro'
        && cold.composerIntent.superpowers === true);
    ok('…and it says who it is for', cold && cold.composerAgent === 'a-dev');
    ok('…the first prompt travels apart from it, as content (composerPrompt)',
        cold && cold.composerPrompt === 'ilk soru');
    ok('‼️ step 3 — the one-at-a-time fields are off the wire: the record is the only statement',
        cold && !('engine' in cold) && !('composerPick' in cold) && !('composerAccount' in cold)
        && !('superpowersChoice' in cold) && !('composerLaunch' in cold) && !('defaults' in cold)
        && !('presetAgent' in cold));

    // ------------------------------------------ 2. one message changes one field
    let d = await send(p, { type: 'setIntent', field: 'permissionMode', value: 'acceptEdits' });
    ok('‼️ setIntent changes the field it names and nothing else',
        d.composerIntent.permissionMode === 'acceptEdits'
        && d.composerIntent.model === 'gemini-2.5-pro' && d.composerIntent.engine === 'agy');
    d = await send(p, { type: 'setIntent', field: 'superpowers', value: null });
    ok('…superpowers back to "the agent\'s own" is null on the wire',
        d.composerIntent.superpowers === null);
    d = await send(p, { type: 'setIntent', field: 'nonsense', value: 'x' });
    ok('…a dimension the record does not hold is ignored, not stored',
        !('nonsense' in d.composerIntent) && d.composerIntent.model === 'gemini-2.5-pro');

    // ------------------------------------------ 3. the engine moves: answered again, HERE
    d = await send(p, { type: 'setIntent', field: 'engine', value: 'claude' });
    ok('‼️ moving the engine re-answers model/effort/permission from THIS agent\'s row for the new engine (X-145)',
        d.composerIntent.engine === 'claude'
        && d.composerIntent.model === 'sonnet' && d.composerIntent.effort === 'medium'
        && d.composerIntent.permissionMode === 'acceptEdits');
    ok('…and a route that belongs to the old engine is gone with it (X-105)',
        d.composerIntent.providerId === '' && d.composerIntent.tier === '');
    // ‼️ step 3 — the older per-field doors are gone: a message by one of their
    // names is not a door any more and changes nothing
    const was = JSON.stringify(d.composerIntent);
    p.webview._onMsg({ type: 'setEngine', id: 'agy' });
    p.webview._onMsg({ type: 'setRoute', providerId: 'google' });
    p.webview._onMsg({ type: 'setSuperpowers', on: true });
    await settle();
    ok('‼️ setEngine / setRoute / setAccount / setSuperpowers are not doors any more',
        JSON.stringify(lastData(p).composerIntent) === was);

    // ------------------------------------------ 4. narrowing is the host's
    d = await send(p, { type: 'setIntent', field: 'model', value: 'opus' });
    ok('‼️ a model picked by hand takes its own default effort (preferModelDefault)',
        d.composerIntent.model === 'opus' && d.composerIntent.effort === 'high');
    d = await send(p, { type: 'setIntent', field: 'effort', value: 'max' });
    ok('…an effort picked by hand is kept', d.composerIntent.effort === 'max');
    d = await send(p, { type: 'setIntent', field: 'model', value: 'gpt-nonsense' });
    ok('‼️ a model this engine does not offer is dropped to Default, and the effort follows the model',
        d.composerIntent.model === '' && d.composerIntent.effort === '');

    // ------------------------------------------ 5. a plain door: memory → own setting → fleet
    // Claude, no launch handed over: the record for Claude has model sonnet
    // but the agent's OWN Claude setting says opus/max — memory wins per field.
    ConsolePanel.show(deps, { agentId: 'a-dev', engine: 'claude' });
    d = lastData(p);
    ok('‼️ a plain door seeds the record from the memory, then the agent\'s own setting, then the fleet',
        d.composerIntent.engine === 'claude'
        && d.composerIntent.model === 'sonnet' && d.composerIntent.effort === 'medium'
        && d.composerIntent.permissionMode === 'acceptEdits');
    ok('…and no prompt rides with a plain door', d.composerPrompt === '');

    // ------------------------------------------ 6. Send: the record knows who, and what clears
    await send(p, { type: 'setIntent', field: 'providerId', value: 'anthropic' });
    // step 2 — Send carries content only; the record says who and what
    d = await send(p, { type: 'start', text: 'merhaba' });
    ok('a session was started', started.length === 1 && started[0].agentId === 'a-dev');
    ok('‼️ after Send the route, the sign-in and the discipline are cleared for the NEXT session…',
        d.composerIntent.providerId === '' && d.composerIntent.superpowers === null
        && d.composerIntent.account !== undefined);
    ok('…while the engine and the boxes on screen stay where the reader left them',
        d.composerIntent.engine === 'claude' && d.composerIntent.model === 'sonnet');
    ok('…and the record still says who', d.composerAgent === 'a-dev');

    console.log(`${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL threw: ' + (e && e.stack || e)); process.exit(1); });
