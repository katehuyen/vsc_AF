// S-50 — A DOOR THAT OPENS THE CONSOLE HANDS OVER ITS SETUP, AND THE SETUP IS
// IN THE PAGE THE MOMENT THE PAGE LOADS.
//
// `ConsolePanel.show` was written for a panel that is ALREADY open: it applied
// the caller's options to the instance and posted a fresh payload, which an
// already-loaded page reads. On the cold path — the Console is closed and this
// very call is what creates it — the shell HTML was built inside the
// constructor, i.e. BEFORE the options were applied, so the bootstrap
// `window.__DATA__` carried none of them; and the follow-up `postMessage`
// landed in a webview whose script had not run yet, so it was dropped on the
// floor. `presetAgent` is deliberately ONE-SHOT (`data()` consumes it), so that
// dropped payload did not merely arrive late — it took the agent with it and
// nothing could ever redeliver it. The same call from an open Console worked
// perfectly, which is exactly why the bug read as "it only fails the first
// time".
//
// What is measured here is the ONE fact that separates the two paths: what the
// page is handed at load. Nothing about the composer's own behaviour is this
// file's subject (test_console_show.js and the page tests own that) — only that
// the agent, the engine and the launcher's setup are in the bootstrap payload
// of a Console the door itself had to create.
'use strict';
const path = require('path');
const Module = require('module');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// ---------------------------------------------------------------- vscode stub
//
// Only what the panel and `htmlShell` actually touch. The webview records the
// two channels a page can be reached on — the HTML it is loaded with, and the
// messages pushed to it afterwards — because the whole of this item is which
// one the setup travels on.
const panels = [];
const makeWebview = () => ({
    _html: '',
    posted: [],
    cspSource: 'vscode-webview:',
    asWebviewUri: (u) => ({ toString: () => 'vscode-webview://' + String(u.path || u) }),
    onDidReceiveMessage: () => ({ dispose() { } }),
    postMessage(m) { this.posted.push(m); return Promise.resolve(true); },
    set html(v) { this._html = v; },
    get html() { return this._html; }
});
const makePanel = () => {
    const p = {
        webview: makeWebview(), title: 'Console', revealed: 0,
        reveal() { this.revealed++; },
        onDidDispose: () => ({ dispose() { } }),
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
// An EMPTY farm on purpose: no hosted session, no live process, nothing to
// resume. That is the state the cold path is actually reached in, and it is the
// state in which no host event will ever fire — which is why a payload dropped
// at open time is a payload that never arrives at all.
const REMEMBERED = {
    'a-dev': {
        engine: 'agy', model: 'gemini-2.5-pro', effort: 'high',
        permissionMode: 'plan', superpowers: true
    }
};
const deps = {
    extensionUri: { path: 'D:/repo' },
    host: { list: () => [], onChange: () => ({ dispose() { } }) },
    getAgents: () => ([{ id: 'a-dev', name: 'developer', dir: 'D:/ajan/developer' }]),
    index: { all: () => [], external: () => [] },
    colorFor: () => '',
    modelAliases: () => [],
    engineModels: () => ({}),
    engines: () => ([
        { id: 'claude', label: 'Claude Code', ready: true, auth: 'subscription' },
        { id: 'agy', label: 'Antigravity', ready: true, auth: 'subscription' }
    ]),
    launchDefaults: () => ({ engine: 'claude', model: '', effort: '', permissionMode: '' }),
    lastLaunch: (id) => REMEMBERED[id],
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

/** The payload the page reads the instant it loads — `window.__DATA__`. */
const bootstrap = (p) => {
    const m = /window\.__DATA__ = ([\s\S]*?); window\.__AFUI__/.exec(p.webview.html || '');
    return m ? JSON.parse(m[1]) : null;
};

// ------------------------------------------------- 1. the cold path (S-50)
//
// The Console is CLOSED. This is the agent row's play button and the launcher's
// Start, whose whole job is to arrive with the answers already given.
ConsolePanel.show(deps, {
    agentId: 'a-dev', pinAgent: true, engine: 'agy',
    launch: {
        model: 'gemini-2.5-pro', effort: 'high', permissionMode: 'plan',
        prompt: 'ilk soru', superpowers: true, providerId: 'google', tier: 'pro'
    },
    projectId: 'prj_x'
});

ok('a closed Console is created by the door that was pressed', panels.length === 1);
const cold = bootstrap(panels[0]);
ok('…and it is loaded with a payload at all', !!cold);
ok('‼️ S-50 — the agent the door named is IN the bootstrap payload',
    cold && cold.presetAgent === 'a-dev');
ok('‼️ S-50 — …and so is the engine it settled', cold && cold.engine === 'agy');
ok('‼️ S-50 — …and the composer seed that makes the page read the setup',
    cold && Number(cold.composerSeed) > 0);
ok('‼️ S-50 — …and the launcher\'s whole setup', cold && cold.composerLaunch
    && cold.composerLaunch.model === 'gemini-2.5-pro'
    && cold.composerLaunch.effort === 'high'
    && cold.composerLaunch.permissionMode === 'plan'
    && cold.composerLaunch.prompt === 'ilk soru'
    && cold.composerLaunch.engine === 'agy');
ok('…the pin, so the agent cannot be lost by accident',
    cold && cold.pinnedAgent === 'a-dev');
ok('…the Superpowers answer the door made', cold && cold.superpowersChoice === 'on');
ok('…and the project it is to be started under', cold && cold.activeProjectId === 'prj_x');

// ‼️ THE ONE-SHOT IS THE REASON THIS WAS UNRECOVERABLE. `presetAgent` is
// consumed by whichever payload carries it; if that payload is the dropped one,
// no later refresh can say the agent again. Having spent it on the bootstrap,
// the next refresh must NOT still be claiming it.
ConsolePanel.refreshIfOpen();
const after = panels[0].webview.posted.filter(m => m && m.type === 'data').pop();
ok('the one-shot agent is spent exactly once — on the payload the page read',
    after && after.data.presetAgent === '');
ok('…while the seed and the setup, which are not one-shot, stay',
    after && Number(after.data.composerSeed) === Number(cold.composerSeed)
    && after.data.composerLaunch && after.data.composerLaunch.model === 'gemini-2.5-pro');

// ------------------------------------------------- 2. the warm path, unbroken
//
// The case that always worked, measured in the same file so a fix to the cold
// path cannot quietly cost it: an OPEN Console is revealed, not recreated, and
// the new door's answers reach it by push with a HIGHER seed (the page applies
// the setup on the seed's edge — an unchanged seed is ignored by design).
const seedWas = Number(cold.composerSeed);
ConsolePanel.show(deps, {
    agentId: 'a-dev', engine: 'claude',
    launch: { model: 'opus', effort: 'low', permissionMode: 'default' }
});
ok('an open Console is reused, never opened a second time', panels.length === 1);
ok('…and revealed, so the door still brings it to the front', panels[0].revealed > 0);
const warm = panels[0].webview.posted.filter(m => m && m.type === 'data').pop();
ok('the second door\'s agent arrives by push', warm && warm.data.presetAgent === 'a-dev');
ok('…on its own engine', warm && warm.data.engine === 'claude');
ok('…with a HIGHER seed, or the page would ignore the setup',
    warm && Number(warm.data.composerSeed) > seedWas);
ok('…and the second door\'s setup, not the first\'s',
    warm && warm.data.composerLaunch && warm.data.composerLaunch.model === 'opus'
    && warm.data.composerLaunch.engine === 'claude');

// ------------------------------------------------- 3. the plain door
//
// "Open Console" with nothing to say must stay a plain open: no agent pinned,
// no setup seeded. A fix that seeds the bootstrap unconditionally would show up
// here as an agent nobody asked for.
ConsolePanel.current = undefined;   // as if the panel had been closed
ConsolePanel.show(deps);
ok('a plain Open Console opens a plain composer', panels.length === 2);
const plain = bootstrap(panels[1]);
ok('…with nobody preselected', plain && plain.presetAgent === '' && plain.pinnedAgent === '');
ok('…and no setup handed over', plain && !plain.composerLaunch);

Module._load = origLoad;
console.log(`test_console_cold_open: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
