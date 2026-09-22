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

    // ------------------------------------------ 7. S-50 — a COLD page draws the record
    //
    // Everything above is the host's answer. This is what a reader actually
    // gets: a page opened with no memory of its own, whose boxes can come from
    // nowhere but the bootstrap payload. And the page BEFORE this item kept
    // four of them in `afConsole`, so the scene hands over a saved state that
    // still carries them — which is what every reader upgrading has on disk.
    const { runPage } = require(path.resolve(__dirname, 'lib_page_dom.js'));
    const fixture = require(path.resolve(__dirname, 'fixtures', 'console.js'));
    const SHOWN = {
        engine: 'claude', model: 'opus', effort: 'high', permissionMode: 'plan',
        providerId: '', tier: '', account: 'work-1', superpowers: true
    };
    const composerScene = (intent) => Object.assign(fixture.data(), {
        selected: '', sessions: [], chipProjectId: '', projectContext: '',
        superpowersOn: undefined, composerPrompt: '', composerAgent: 'a-dev',
        composerIntent: Object.assign({}, SHOWN, intent || {})
    });
    const STALE = {
        afConsole: {
            agentId: 'a-mgr', model: 'haiku', effort: 'low',
            permissionMode: 'bypassPermissions'
        }
    };
    const cold2 = runPage('console.js', composerScene(), undefined, STALE);
    const coldHtml = cold2.html();
    ok('‼️ S-50 — a page with no state of its own draws every box from the record it was handed',
        /value="claude" selected/.test(coldHtml) && /value="opus" selected/.test(coldHtml)
        && /value="high" selected/.test(coldHtml) && /value="plan" selected/.test(coldHtml)
        && /value="a-dev" selected/.test(coldHtml));
    ok('…including the two the strip only draws where they exist — the sign-in and the discipline',
        /value="work-1" selected/.test(coldHtml) && /Superpowers/.test(coldHtml));
    ok('‼️ …and a setup left behind by the build before this one is not drawn anywhere',
        !/value="haiku" selected/.test(coldHtml) && !/value="low" selected/.test(coldHtml)
        && !/value="bypassPermissions" selected/.test(coldHtml)
        && !/value="a-mgr" selected/.test(coldHtml));

    // ------------------------------------------ 8. THE MATRIX — every box asks, every ask is answered
    //
    // ‼️ X-148 IS THE MEASUREMENT BEHIND THIS ONE: `providerId` and `tier` were
    // added to the type, wired into the launcher, and simply never given a box
    // in the Console composer — and nothing went red, because nothing counted.
    // Here the page's boxes and the host's doors are read out of the two files
    // and compared against the dimension list, so a dimension arriving with no
    // box, a box nobody answers, and a door nobody can reach are all red.
    const fs = require('fs');
    const pageSrc = fs.readFileSync(path.resolve(__dirname, '../media/console.js'), 'utf8');
    const hostSrc = fs.readFileSync(path.resolve(__dirname, '../src/panels/consolePanel.ts'), 'utf8');
    const uniq = (a) => Array.from(new Set(a)).sort();
    const asked = uniq((pageSrc.match(/askIntent\(\s*'([a-zA-Z]+)'/g) || [])
        .map(m => /'([a-zA-Z]+)'/.exec(m)[1]));
    const applySrc = (/const apply: Record<string, \(\) => void> = \{[\s\S]*?\r?\n {8}\};/
        .exec(hostSrc) || [''])[0];
    const doors = uniq((applySrc.match(/^\s+([a-zA-Z]+):\s*\(\)\s*=>/gm) || [])
        .map(m => /([a-zA-Z]+):/.exec(m)[1]));
    const D = require(path.resolve(__dirname, '../media/afDimensions.js'));
    ok('both sides were really read', asked.length > 5 && doors.length > 5);
    ok('‼️ every box the composer draws is a door the host holds open — a control that silently '
        + 'does nothing is the shape of this bug',
        asked.every(f => doors.indexOf(f) >= 0));
    ok('‼️ …and every door the host holds open is reachable from a box, so none is dead',
        doors.every(f => asked.indexOf(f) >= 0));

    // The five the strip does NOT hold, each with the reason it is its own door
    // instead. Named rather than assumed: a dimension added to the list lands
    // in neither set and turns the line below red by arriving.
    const NOT_IN_THE_STRIP = {
        name: 'names THIS session, and the composer takes it from the agent and the first line',
        prompt: 'content, not intent — it travels with Send (`start {text}`)',
        resume: 'its own message (`resume {sessionId}`); the shelf is where a session is picked',
        continueLast: 'the same door, said without naming the session',
        cli: 'M-22 — a CLI profile REPLACES the command line rather than sitting beside the engine'
    };
    const userAnswers = D.LAUNCH_DIMENSIONS.filter(x => x.owner === 'user').map(x => x.id);
    ok('‼️ every dimension the USER answers is either a box in the composer or named as not one',
        userAnswers.every(id => doors.indexOf(id) >= 0
            || Object.prototype.hasOwnProperty.call(NOT_IN_THE_STRIP, id)));
    ok('…and every exemption is a real dimension that really has no door',
        Object.keys(NOT_IN_THE_STRIP).every(id =>
            userAnswers.indexOf(id) >= 0 && doors.indexOf(id) < 0));
    ok('‼️ …while a dimension the PROGRAM or this extension answers has no box at all, by definition',
        D.LAUNCH_DIMENSIONS.filter(x => x.owner !== 'user').every(x => doors.indexOf(x.id) < 0));
    // S-82 — the relay pair is not one either: the process spawns exactly the
    // same, the card is only sealed as leg 1 once it runs (composerRelay)
    ok('…and the doors that are not dimensions are the agent (WHO rather than how) and the relay (what happens AFTER the spawn)',
        doors.filter(f => D.ids().indexOf(f) < 0).join() === 'agentId,baton,batonMaxHops');
    ok('‼️ …and the page keeps a copy of none of them: what a previous build stored is stripped '
        + 'by the list rather than by four names somebody has to keep up to date',
        /AFDimensions\.ids\(\)\.concat\(\['agentId'\]\)\.forEach\(k => \{ delete st\[k\]; \}\)/.test(pageSrc));

    // ------------------------------------------ 9. …and the page draws the ANSWER, not the pick
    const conv = runPage('console.js', composerScene(), undefined, {});
    const box = (id) => conv.sandbox.document.getElementById(id);
    conv.posted.length = 0;
    const modelBox = box('c-model');
    modelBox.value = 'sonnet';
    modelBox.fire('change');
    ok('‼️ a box changed asks for that one field and draws nothing on its own meanwhile',
        conv.posted.length === 1 && conv.posted[0].type === 'setIntent'
        && conv.posted[0].field === 'model' && conv.posted[0].value === 'sonnet'
        && /value="opus" selected/.test(conv.html()));
    // the host's answer REFUSES the pick — the record comes back on Default
    // with the effort dropped under the model (section 4 above, host-side)
    conv.send({ type: 'data', data: composerScene({ model: '', effort: '' }) });
    ok('‼️ …and when the answer refuses it, the page converges on the ANSWER rather than keeping '
        + 'the value the hand chose',
        !/value="sonnet" selected/.test(conv.html()) && box('c-model').value !== 'sonnet');

    console.log(`${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL threw: ' + (e && e.stack || e)); process.exit(1); });
