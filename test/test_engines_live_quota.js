// X-187 — THE ENGINES PAGE ASKS FOR A LIVE QUOTA READING; IT DOES NOT WAIT TO
// BE TOLD.
//
// `AccountUsageService` was built with three doors — `beat()` for a timer,
// `readOnEdge()` for a turn that just ended and `refresh()` for a person — and
// on the day it shipped exactly ONE of them was wired: the bridge's own
// `accounts.list`. The page that the whole Accounts section lives on read
// `current()`, which never touches the network, so on a cold extension host it
// drew every card from an EMPTY cache: percent -1, resetsAt 0, no bar and no
// countdown. The user's report was "yakalattığım hesabın limitle ilgili
// bilgisini o sayfada göremiyorum" — and the page was right, it had nothing.
//
// What is pinned here is the wiring, because the wiring is the whole defect:
//   * opening the page asks for a reading, and revealing an open one asks again;
//   * the answer LANDS — a fresh payload is posted once the read resolves, or
//     the figures would arrive in a cache nobody redraws from;
//   * every account gesture (capture / stand up / forget) asks too, since each
//     changes which accounts there are to have figures for;
//   * ONE timer for the page, not one per account — the service already takes
//     the slots in turn behind a single machine-wide floor, and a timer per card
//     would be the "three accounts, three times the requests" mistake X-170
//     exists to forbid;
//   * and the timer stops when the page does.
//
// ‼️ NOT the same question as the engine-test verdict cache above it in the
// panel. A verdict costs a real turn against an engine and is therefore spent
// only on a press; a usage reading is a free GET already governed by the shared
// floor and backoff inside the service. Automating one is not a precedent for
// automating the other.
'use strict';
const path = require('path');
const Module = require('module');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// ---------------------------------------------------------------- vscode stub
const panels = [];
const timers = { made: 0, cleared: 0, fns: [] };

const makeWebview = () => ({
    _html: '',
    posted: [],
    handler: undefined,
    cspSource: 'vscode-webview:',
    asWebviewUri: (u) => ({ toString: () => 'vscode-webview://' + String(u.path || u) }),
    onDidReceiveMessage(fn) { this.handler = fn; return { dispose() { } }; },
    postMessage(m) { this.posted.push(m); return Promise.resolve(true); },
    set html(v) { this._html = v; },
    get html() { return this._html; }
});
const makePanel = () => {
    const p = {
        webview: makeWebview(), title: 'Engines', revealed: 0, disposeFn: undefined,
        reveal() { this.revealed++; },
        onDidDispose(fn) { this.disposeFn = fn; return { dispose() { } }; },
        dispose() { if (this.disposeFn) { this.disposeFn(); } }
    };
    panels.push(p);
    return p;
};

const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') {
        return {
            Uri: { joinPath: (base, ...rest) => ({ path: [base.path, ...rest].join('/') }) },
            ViewColumn: { One: 1 },
            ConfigurationTarget: { Global: 1 },
            env: { openExternal: () => Promise.resolve(true) },
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

// ‼️ The timer is counted, not run. What matters is that ONE is armed for the
// page and that it is cleared when the page closes; how often it ticks is the
// service's own interval and is not this file's subject.
const realSetInterval = global.setInterval;
const realClearInterval = global.clearInterval;
global.setInterval = (fn, ms) => {
    timers.made++; timers.fns.push({ fn, ms });
    const h = realSetInterval(() => { }, 1 << 30);
    realClearInterval(h);
    return { __af: timers.made };
};
global.clearInterval = (h) => { if (h && h.__af) { timers.cleared++; } };

const { EnginesPanel } = require(path.resolve(__dirname, '../out/panels/enginesPanel.js'));

// ------------------------------------------------------------------ deps stub
const reads = [];
let resolveRead = () => { };
const ACCOUNTS = [{
    id: 'claude-pro-1', engine: 'claude', label: 'pro-1', email: 'a@b.c', plan: 'pro',
    health: 'ok', active: true, percent: -1, resetsAt: 0, usageState: 'unread',
    note: '', capturedAt: 1, dir: 'D:/slots/1'
}];
const deps = {
    extensionUri: { path: 'D:/repo' },
    engines: () => ([{
        id: 'claude', label: 'Claude Code', ready: true,
        auth: { mode: 'subscription' }
    }]),
    test: () => Promise.resolve({ id: 'claude', ok: true, at: 1 }),
    command: () => { },
    key: () => { },
    profiles: () => [],
    accounts: () => ACCOUNTS,
    accountEngines: () => ([{
        engine: 'claude', support: 'full', variable: 'CLAUDE_CONFIG_DIR',
        canCapture: true, why: '', layout: 'dir'
    }]),
    captureAccount: async () => '',
    activateAccount: async () => '',
    forgetAccount: async () => '',
    policies: () => ({ engines: ['claude'], builtIn: [], rules: [], ceiling: 95 }),
    savePolicy: async () => '',
    deletePolicy: async () => '',
    ownership: () => [],
    saveProfile: async () => [],
    removeProfile: async () => [],
    copyProfile: async () => [],
    profileKey: () => { },
    accountBeatMs: () => 60000,
    autoRefresh: () => ({ on: true, beat: [] }),
    setAutoRefresh: async () => ({ on: true, beat: [] }),
    // ‼️ THE DEP THIS ITEM ADDS. One live reading, the service's own round
    // robin behind it; the panel never names an account and never counts.
    readAccounts: () => {
        reads.push(Date.now());
        return new Promise(res => { resolveRead = res; });
    }
};

const tick = () => new Promise(res => setTimeout(res, 0));

(async () => {
    // ---- opening the page asks -------------------------------------------
    EnginesPanel.show(deps);
    const p = panels[panels.length - 1];
    ok('opening the Engines page asks for a live reading', reads.length === 1);

    const before = p.webview.posted.length;
    resolveRead();
    await tick();
    ok('…and the answer lands as a fresh payload the page redraws from',
        p.webview.posted.length > before
        && p.webview.posted.some(m => m && m.type === 'data'));

    // ---- one timer for the page, cleared with it --------------------------
    ok('one timer is armed for the page, not one per account', timers.made === 1);

    // ---- revealing an already-open page asks again ------------------------
    EnginesPanel.show(deps);
    ok('revealing an open page asks again', reads.length === 2);
    resolveRead();
    await tick();
    ok('…and does not arm a second timer', timers.made === 1);

    // ---- every account gesture asks ---------------------------------------
    for (const [type, extra] of [
        ['accountCapture', { engine: 'claude', label: 'pro-2' }],
        ['accountActivate', { id: 'claude-pro-1', engine: 'claude' }],
        ['accountForget', { id: 'claude-pro-1' }]
    ]) {
        const n = reads.length;
        p.webview.handler(Object.assign({ type }, extra));
        await tick();
        ok(`${type} asks for a fresh reading`, reads.length === n + 1);
        resolveRead();
        await tick();
    }

    // ---- and the timer stops when the page does ---------------------------
    p.dispose();
    ok('closing the page clears its timer', timers.cleared === 1);

    global.setInterval = realSetInterval;
    global.clearInterval = realClearInterval;
    Module._load = origLoad;
    console.log(`test_engines_live_quota: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
