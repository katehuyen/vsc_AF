// ‼️ THE AGENT'S OWN DEFAULT REACHES THE SESSION THE COMPOSER STARTS.
//
// Farm Settings draws a model box and an effort box on every agent chip and
// writes `agentFarm.agentEngineDefaults[<agent>][<engine>]`. Every launch door
// resolves through that layer — the ▶ on an agent row, `sessions.start` on the
// bridge, a terminal start — except one: the Console composer read
// `launchDefaults()` and nothing else, so an empty box jumped STRAIGHT OVER the
// per-agent answer to the fleet-wide one.
//
// Measured before the repair: an agent whose Settings row said `effort: xhigh`
// started at the fleet's effort, and nothing on the screen said so. That is the
// U-29 shape — a control that stores what it is told and changes nothing.
//
// What is measured here is the VALUE THAT REACHES `host.start`, not the source
// of the panel: the boxes are empty, the fleet says one thing, the agent's own
// row says another, and the session must start on the agent's.
'use strict';
const path = require('path');
const Module = require('module');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// ---------------------------------------------------------------- vscode stub
//
// Only what the panel touches. The webview keeps the message handler the panel
// registers, because sending it a `start` is the whole measurement.
const panels = [];
const makeWebview = () => ({
    _html: '', posted: [], onMsgs: [],
    cspSource: 'vscode-webview:',
    asWebviewUri: (u) => ({ toString: () => 'vscode-webview://' + String(u.path || u) }),
    // ‼️ EVERY LISTENER, NOT THE LAST ONE. The panel is not the only thing that
    // subscribes to this webview — the shared page helpers register their own —
    // and a stub that kept a single handler silently threw the panel's away, so
    // a `start` sent here reached nobody and the measurement read as a repair
    // that had not worked.
    onDidReceiveMessage(fn) { this.onMsgs.push(fn); return { dispose() { } }; },
    postMessage(m) { this.posted.push(m); return Promise.resolve(true); },
    set html(v) { this._html = v; },
    get html() { return this._html; }
});
const makePanel = () => {
    const p = {
        webview: makeWebview(), title: 'Console', visible: true, revealed: 0,
        reveal() { this.revealed++; },
        onDispose: null,
        onDidDispose(fn) { this.onDispose = fn; return { dispose() { } }; },
        dispose() { }
    };
    panels.push(p);
    return p;
};

const warnings = [];
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
                showWarningMessage: (m) => { warnings.push(m); return Promise.resolve(undefined); }
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

// ------------------------------------------------------------------ the farm
//
// ‼️ THE THREE LAYERS ARE THREE DIFFERENT VALUES ON PURPOSE, so the answer names
// which one won rather than merely being plausible.
//   · the box      — left EMPTY, which is a person saying "the default, please"
//   · the agent    — `gpt-5.6-terra` / `xhigh`, its row in Farm Settings
//   · the fleet    — `sonnet` / `low`, `agentFarm.launchDefaults`
const AGENT_ROW = {
    'D:/ajan/developer': { model: 'gpt-5.6-terra', effort: 'xhigh' },
    'D:/ajan/basit': {}   // an agent with no row of its own: the fleet must win
};
const started = [];
const deps = {
    extensionUri: { path: 'D:/repo' },
    host: {
        list: () => [],
        onChange: () => ({ dispose() { } }),
        start: (init) => { started.push(init); return 'seat-' + started.length; }
    },
    getAgents: () => ([
        { id: 'a-dev', name: 'developer', dir: 'D:/ajan/developer' },
        { id: 'a-bas', name: 'basit', dir: 'D:/ajan/basit' }
    ]),
    index: { all: () => [], external: () => [] },
    colorFor: () => '',
    modelAliases: () => [],
    engineModels: () => ({}),
    engines: () => ([
        { id: 'claude', label: 'Claude Code', ready: true, auth: 'subscription' },
        { id: 'codex', label: 'Codex', ready: true, auth: 'subscription' }
    ]),
    launchDefaults: () => ({ engine: 'codex', model: 'sonnet', effort: 'low', permissionMode: 'default' }),
    // ‼️ THE DEP UNDER TEST. In the extension this is `withAgentEngineDefaults`;
    // here it answers out of the table above with the same contract — a record
    // that is not there answers with empty strings, never undefined.
    agentEngineDefaults: (dir, _engine) => ({
        model: (AGENT_ROW[dir] || {}).model || '',
        effort: (AGENT_ROW[dir] || {}).effort || ''
    }),
    lastLaunch: () => undefined,
    rememberLaunch: () => { },
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

ConsolePanel.show(deps);
/** ‼️ THE HANDLER IS ASYNC, so the measurement has to let it finish. The panel
 *  registers `m => void this.onMessage(m)`, which answers instantly and leaves
 *  the work on the microtask queue; reading `started` on the next line measures
 *  a session that has not been asked for yet. */
const send = async (msg) => {
    for (const fn of panels[panels.length - 1].webview.onMsgs) { fn(msg); }
    await new Promise(r => setImmediate(r));
};

async function main() {

// ------------------------------------------------- 1. empty boxes, own row
//
// The case the repair is about: nothing typed in the composer, and the agent has
// a row of its own in Farm Settings.
await send({
    type: 'start', agentId: 'a-dev', text: 'go',
    engine: 'codex', model: '', effort: '', permissionMode: ''
});
const one = started[0];
ok('the composer started a session at all', !!one);
ok('‼️ AN EMPTY EFFORT BOX TAKES THE AGENT\'S OWN SETTING, NOT THE FLEET\'S'
    + ' (got ' + (one && one.effort) + ')', !!one && one.effort === 'xhigh');
ok('‼️ …and the same for the model (got ' + (one && one.model) + ')',
    !!one && one.model === 'gpt-5.6-terra');

// ------------------------------------------------- 2. the box still wins
//
// The layer is UNDER the box, never over it: a value the person actually typed
// is the answer, and a per-agent default that overrode it would be a picker
// that cannot pick.
await send({
    type: 'start', agentId: 'a-dev', text: 'go',
    engine: 'codex', model: 'gpt-5.6-sol', effort: 'medium', permissionMode: ''
});
const two = started[1];
ok('what the box says still wins over the agent\'s row (model)',
    !!two && two.model === 'gpt-5.6-sol');
ok('…and over it for the effort too', !!two && two.effort === 'medium');

// ------------------------------------------------- 3. no row → the fleet
//
// The layer is inserted, not substituted: an agent with nothing of its own must
// still fall through to `agentFarm.launchDefaults` exactly as before.
await send({
    type: 'start', agentId: 'a-bas', text: 'go',
    engine: 'codex', model: '', effort: '', permissionMode: ''
});
const three = started[2];
ok('an agent with no row of its own still falls through to the fleet (model)',
    !!three && three.model === 'sonnet');
ok('…and to the fleet effort', !!three && three.effort === 'low');

// ------------------------------------------------- 4. the host may be silent
//
// Every read dep on this panel is optional, and this one is no exception: a host
// that cannot answer must leave the chain exactly as it was rather than throw.
const quiet = { ...deps, agentEngineDefaults: undefined };
started.length = 0;
// The panel keeps the deps it was OPENED with, so the silent host needs a
// Console of its own: close this one the way VS Code would.
panels[panels.length - 1].onDispose();
ConsolePanel.show(quiet);
await send({
    type: 'start', agentId: 'a-dev', text: 'go',
    engine: 'codex', model: '', effort: '', permissionMode: ''
});
ok('a host that answers nothing leaves the fleet default in place'
    + ' (got ' + JSON.stringify(started[0] && [started[0].model, started[0].effort]) + ')',
    !!started[0] && started[0].model === 'sonnet' && started[0].effort === 'low');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
}

main().catch(e => { console.log('  FAIL threw: ' + e.stack); process.exit(1); });
