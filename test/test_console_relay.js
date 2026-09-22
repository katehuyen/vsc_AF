// S-82 (3/4) — THE CONSOLE'S SIDE OF A BATON RELAY, driven against the real panel.
//
// ‼️ The page had been drawing "Continue from handover", ⑂ n and ✕ Stop chain
// from `contextSignalView` / `batonView` since S-64 / S-77 — and the panel had
// never handed it either: only the console.sessions op and the fixtures built
// them. So the card's status line and both buttons existed in photographs only.
// This drives the panel's own data() and message handlers with a fake webview.
'use strict';
const path = require('path');
const Module = require('module');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const panels = [];
const makeWebview = () => ({
    _html: '', posted: [], onMsgs: [],
    cspSource: 'vscode-webview:',
    asWebviewUri: (u) => ({ toString: () => 'vscode-webview://' + String(u.path || u) }),
    onDidReceiveMessage(fn) { this.onMsgs.push(fn); return { dispose() { } }; },
    postMessage(m) { this.posted.push(m); return Promise.resolve(true); },
    set html(v) { this._html = v; },
    get html() { return this._html; }
});
const makePanel = () => {
    const p = {
        webview: makeWebview(), title: 'Console', visible: true,
        reveal() { }, onDispose: null,
        onDidDispose(fn) { this.onDispose = fn; return { dispose() { } }; },
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
                showInformationMessage: (m) => { infos.push(m); return Promise.resolve(undefined); },
                showWarningMessage: (m) => { warns.push(m); return Promise.resolve(undefined); }
            },
            commands: { executeCommand: () => Promise.resolve(undefined) },
            workspace: { getConfiguration: () => ({ get: (_k, d) => d, update: async () => { } }), workspaceFolders: [] }
        };
    }
    return origLoad.apply(this, arguments);
};
const { ConsolePanel } = require(path.resolve(__dirname, '../out/panels/consolePanel.js'));

const seat = (o) => Object.assign({
    id: 'seat-1', agentId: 'a-dev', agentName: 'developer', sessionId: 'sid-live-1', cwd: 'D:/repo',
    engine: 'claude', model: '', effort: '', permissionMode: 'default', status: 'idle',
    tokens: 0, costUsd: 0, turns: 0, messages: [], lastTs: 0
}, o);
const seats = [seat(), seat({ id: 'seat-2', sessionId: undefined, status: 'starting' })];
const asked = [];
const attachAsked = [], sentTo = [], infos = [], warns = [];
let attachAnswer = { ok: true, sentence: 'Session sid-live is now leg 1 of chain chn_x: …' };
let sendAnswer = { queued: false };
const VIEWS = { contextSignalView: { chip: 'CONVERGE' }, bridgeGuardView: null, batonView: { chip: '⑂ 1' } };
const deps = {
    extensionUri: { path: 'D:/repo' },
    host: {
        list: () => seats, onChange: () => ({ dispose() { } }), start: () => 'seat-9',
        get: (id) => seats.find(s => s.id === id),
        send: (id, text) => { sentTo.push([id, text]); return sendAnswer; }
    },
    getAgents: () => ([{ id: 'a-dev', name: 'developer', dir: 'D:/ajan/developer' }]),
    index: { all: () => [], external: () => [] },
    colorFor: () => '',
    modelAliases: () => [],
    engines: () => ([{ id: 'claude', label: 'Claude Code', ready: true, auth: 'subscription' }]),
    launchDefaults: () => ({ engine: 'claude', model: '', effort: '', permissionMode: 'default' }),
    lastLaunch: () => undefined, rememberLaunch: () => { }, liveOwners: () => [],
    history: () => [], olderHistory: () => ({ messages: [], more: false }),
    lastWindow: () => [], forgetLastWindow: () => { },
    leftoverOwner: () => undefined, endLeftover: async () => false, estimateCost: () => 0,
    projects: () => [], projectContextText: () => '', superpowersText: () => '',
    superpowersHealth: () => ({ usable: true, why: '', skills: 3 }), superpowersDefault: () => false,
    sessionProject: () => '', promptSnippets: () => ({ items: [], scopes: [] }),
    batonStopChain: () => 0,
    cardViews: (sid) => { asked.push(sid); return VIEWS; },
    batonAttach: async (sid, account, maxHops) => { attachAsked.push([sid, account, maxHops]); return attachAnswer; },
    batonPassNowText: (sid) => 'PASS NOW for ' + sid,
    batonMaxLegs: () => 6
};

const lastData = () => {
    const posted = panels[panels.length - 1].webview.posted.filter(m => m.type === 'data');
    return posted.length ? posted[posted.length - 1].data : undefined;
};

async function main() {
    ConsolePanel.show(deps);
    ConsolePanel.refreshIfOpen();
    await new Promise(r => setImmediate(r));
    const d = lastData();
    ok('the panel posted its data at all', !!d && Array.isArray(d.sessions));
    const one = d && d.sessions.find(s => s.id === 'seat-1');
    const two = d && d.sessions.find(s => s.id === 'seat-2');
    ok('‼️ A CARD WITH A SESSION ID CARRIES THE HOST\'S BATON VIEW', !!one && one.batonView && one.batonView.chip === '⑂ 1');
    ok('…and the context signal\'s words (Continue from handover draws from them)', !!one && one.contextSignalView && one.contextSignalView.chip === 'CONVERGE');
    ok('…and the bridge guard view key, even when it is null', !!one && 'bridgeGuardView' in one);
    ok('the builder is asked by session id', asked.includes('sid-live-1'));
    ok('a card with no session id yet asks nothing and carries no views', !!two && !('batonView' in two) && !asked.includes(undefined));
    // …and the extension hands the page the SAME builder the op answers from
    const ext = require('fs').readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    ok('‼️ consoleDeps.cardViews is the console.sessions op\'s own builder', /cardViews: \(sessionId: string\) => consoleCardViews\(sessionId\)/.test(ext)
        && /\.\.\.consoleCardViews\(s\.sessionId\)/.test(ext));
    ok('a baton store change repaints the Console', /batonStore\.onDidChange\(\(\) => \{ updateBatonBar\(\); ConsolePanel\.refreshIfOpen\(\); \}\)/.test(ext));

    // ---- S-82 (b): the card's two relay hands, through the panel's handlers
    const send = async (msg) => {
        for (const fn of panels[panels.length - 1].webview.onMsgs) { fn(msg); }
        await new Promise(r => setImmediate(r));
    };
    await send({ type: 'batonAttach', id: 'seat-1', account: '@pool', maxHops: '3' });
    ok('‼️ ⑂ Attach relay hands baton.attach\'s body the card\'s SESSION, the pool and the ceiling',
        attachAsked.length === 1 && attachAsked[0][0] === 'sid-live-1' && attachAsked[0][1] === '@pool' && attachAsked[0][2] === '3');
    ok('…and says the host\'s sentence', infos.some(m => /is now leg 1 of chain chn_x/.test(m)));
    attachAnswer = { ok: false, why: 'session sid-live is already in chain chn_y' };
    await send({ type: 'batonAttach', id: 'seat-1', account: '', maxHops: '' });
    ok('…a refusal is said as a warning, in the host\'s words', warns.some(m => /already in chain chn_y/.test(m)));
    await send({ type: 'batonAttach', id: 'seat-2', account: '@pool' });
    ok('…a card with no session yet attaches nothing', attachAsked.length === 2);

    await send({ type: 'batonPassNow', id: 'seat-1' });
    ok('‼️ ⑂ Pass now says the HOST\'s order into this card\'s run, through host.send (console.send\'s door)',
        sentTo.length === 1 && sentTo[0][0] === 'seat-1' && sentTo[0][1] === 'PASS NOW for sid-live-1');
    sendAnswer = undefined;
    await send({ type: 'batonPassNow', id: 'seat-1' });
    ok('…an ended run is said, not swallowed', warns.some(m => /there is no run to pass from/.test(m)));
    await send({ type: 'batonPassNow', id: 'seat-2' });
    ok('…and a card with no session says nothing into anything', sentTo.length === 2);
    ok('the fleet ceiling reaches the page for the empty boxes', lastData().batonMaxLegs === 6);

    const bb = require('fs').readFileSync(path.join(__dirname, '..', 'src', 'core', 'batonBridge.ts'), 'utf8');
    ok('‼️ the card\'s Attach and baton.attach run ONE body (attachRelay) over one set of deps',
        /batonAttach: \(sessionId: string, account: string, maxHops: unknown\) =>\s*attachRelay\(batonAttachDeps,/.test(ext)
        && /registerBatonOps\(bridge, \{\s*\.\.\.batonAttachDeps,/.test(ext) && /await attachRelay\(\{ \.\.\.deps, now \}/.test(bb));
    ok('…and Pass now words the relay the whisper would (batonRelayOf + the user\'s orders)',
        /passNowText\(batonRelayOf\(batonStore\.all\(\), sessionId\), contextGuard\.orders\(\)\)/.test(ext));

    // ---- the words themselves (src/core/batonAttach.ts)
    const A = require(path.join(__dirname, '..', 'out', 'core', 'batonAttach.js'));
    const inRelay = A.passNowText({ chainId: 'chn_a', hop: 3, passed: false });
    ok('passNowText heads with PASS NOW and who pressed', /^PASS NOW — the user pressed Pass now on this session's Console card\. /.test(inRelay));
    ok('…a runner is told to pass the baton, in its own chain', /pass the baton/.test(inRelay) && /chain chn_a, hop 3/.test(inRelay));
    ok('…one that already passed is told to end', /already passed/.test(A.passNowText({ chainId: 'chn_a', hop: 3, passed: true })));
    ok('…and one outside a relay (a stopped chain) to write its note', /write the handover note/.test(A.passNowText(undefined)));
    ok('…the user\'s own orders are the words when set', /MY ORDER/.test(A.passNowText({ chainId: 'c', hop: 1, passed: false }, { relayHandover: 'MY ORDER' })));

    console.log(`test_console_relay: ${pass} passed, ${fail} failed`);
    if (fail) { process.exitCode = 1; }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
