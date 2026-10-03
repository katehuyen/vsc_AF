// S-125 — THE CHAINS PAGE ON A PHONE. The same ChainsPanel, drawn on a phone's
// view: it loads from /res/, opens on the chain a ⑂ link named, a read device
// reads the board and a chain's legs but presses nothing, a manage device runs
// every control, the leg-ceiling menu and the "close a working leg?" question
// are asked ON THE PHONE (never as a dialog on the PC), nothing a phone sends
// opens a tab on the PC, and the desktop's `chains:<id>` link reaches the phone
// as its own Chains page (a page id has no colon).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
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
    env: { clipboard: { writeText: t => { pcSide.push('clipboard:' + t); return Promise.resolve(); } } },
    window: {
        createWebviewPanel: () => { throw new Error('no desktop tab for a phone'); },
        showErrorMessage: m => { pcSide.push('error:' + m); return Promise.resolve(undefined); },
        showInformationMessage: m => { pcSide.push('info:' + m); return Promise.resolve(undefined); },
        showWarningMessage: m => { pcSide.push('warn:' + m); return Promise.resolve(undefined); },
        showQuickPick: items => { pcSide.push('pick'); return Promise.resolve(Array.isArray(items) ? undefined : undefined); },
        showInputBox: () => { pcSide.push('input'); return Promise.resolve(undefined); }
    },
    commands: { executeCommand: (...a) => { pcSide.push('command:' + a[0]); return Promise.resolve(undefined); } },
    workspace: { getConfiguration: () => ({ get: (_k, d) => d, update: async () => { } }), workspaceFolders: [] }
};
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') { return vscodeStub; }
    return origLoad.apply(this, arguments);
};
const { ChainsPanel } = require(path.join(ROOT, 'out', 'panels', 'chainsPanel.js'));
const { RemoteViews, messageScope } = require(path.join(ROOT, 'out', 'panels', 'remoteViews.js'));
const { remotePages } = require(path.join(ROOT, 'out', 'panels', 'remotePages.js'));
const { pickChainLegs } = require(path.join(ROOT, 'out', 'batonLegsUi.js'));
Module._load = origLoad;
const { scopeAtLeast } = require(path.join(ROOT, 'out', 'remote', 'index.js'));

const changed = new EventEmitter();
const calls = [];
const deps = {
    extensionUri: uri('/ext'),
    build: () => ({ generatedAt: 1, counts: { total: 0, attention: 0, running: 0, waiting: 0, parked: 0, done: 0, stopped: 0 }, chains: [], hangMs: 60000, waitMs: 60000 }),
    projects: () => [],
    legs: id => { calls.push(['legs', id]); return []; },
    stop: id => { calls.push(['stop', id]); return 1; },
    lastLeg: (sid, on) => { calls.push(['lastLeg', sid, on]); return { ok: true, sentence: 'braked' }; },
    startNow: id => { calls.push(['now', id]); return { ok: true }; },
    ceiling: async (id, on) => { calls.push(['ceiling', id, on]); },
    cont: q => { calls.push(['continue', q]); return { ok: true, text: 'continued' }; },
    end: async (q, on) => { calls.push(['end', q, on]); return { ok: true, text: 'ended' }; },
    onDidChange: changed.event
};
const settle = () => new Promise(r => setTimeout(r, 5));
const alive = setInterval(() => undefined, 1000);

(async () => {
    // ---- what each message needs ----
    const spec = remotePages({ chains: () => undefined }).chains;
    ok('the Chains page is a phone page: open to read, its controls to manage',
        !!spec && spec.open === 'read' && spec.act === 'manage');
    ok('the board and a chain\'s legs are looks', messageScope(spec, 'refresh') === 'read' && messageScope(spec, 'legs') === 'read');
    ok('every control is manage', ['stop', 'now', 'lastLeg', 'ceiling', 'continue', 'end'].every(t => messageScope(spec, t) === 'manage'));
    ok('opening a transcript and another tab never run from a phone', messageScope(spec, 'openSession') === null && messageScope(spec, 'afnav') === null);

    // ---- the page on a phone ----
    let made;
    const views = new RemoteViews({
        media: uri('/ext/media'), atLeast: scopeAtLeast, waitMs: 60,
        pages: remotePages({ chains: (host, args) => { made = host; ChainsPanel.openOn(host, deps, typeof args?.chain === 'string' ? args.chain : undefined); } })
    });
    const reader = { device: 'dev_r', scope: 'read' }, manager = { device: 'dev_m', scope: 'manage' };
    const toReader = [], toManager = [];
    ok('the Chains page opens on a phone', views.open(reader, 's1', 'chains', { chain: 'chn_1' }, m => toReader.push(m)) === true);
    const readerHost = made;
    views.open(manager, 's2', 'chains', undefined, m => toManager.push(m));
    const managerHost = made;
    const page = (await views.page('/view/chains?view=s1', reader)).body;
    ok('its page and script load from /res/', page.includes('src="/res/chains.js"') && page.includes('href="/res/common.css"') && !/vscode-webview:|file:\/\//.test(page));
    ok('…and it opens on the chain the ⑂ link named', page.includes('"focusChain":"chn_1"'));

    views.message(reader, 's1', { type: 'refresh' });
    views.message(reader, 's1', { type: 'legs', chainId: 'chn_1' });
    await settle();
    ok('a read device reads the board and a chain\'s legs', toReader.some(m => m.type === 'data') && toReader.some(m => m.type === 'legs' && m.chainId === 'chn_1'));
    const before = calls.length;
    for (const m of [{ type: 'stop', chainId: 'chn_1' }, { type: 'now', chainId: 'chn_1', batonId: 'b1' }, { type: 'lastLeg', chainId: 'chn_1', sessionId: 's', on: true },
        { type: 'ceiling', chainId: 'chn_1' }, { type: 'continue', chainId: 'chn_1' }, { type: 'end', chainId: 'chn_1', endSession: true }]) {
        views.message(reader, 's1', m);
    }
    await settle();
    ok('‼️ a read device presses nothing', calls.length === before);

    views.message(manager, 's2', { type: 'stop', chainId: 'chn_1' });
    views.message(manager, 's2', { type: 'now', chainId: 'chn_1', batonId: 'b1' });
    views.message(manager, 's2', { type: 'lastLeg', chainId: 'chn_1', sessionId: 's9', on: true });
    views.message(manager, 's2', { type: 'continue', chainId: 'chn_1', prompt: 'go on' });
    views.message(manager, 's2', { type: 'ceiling', chainId: 'chn_1' });
    views.message(manager, 's2', { type: 'end', chainId: 'chn_1', endSession: true });
    await settle();
    const kinds = calls.slice(before).map(c => c[0]).join();
    ok('a manage device runs every control', kinds === 'stop,now,lastLeg,continue,ceiling,end' && toManager.filter(m => m.type === 'done').length >= 5);
    const ceil = calls.find(c => c[0] === 'ceiling'), end = calls.find(c => c[0] === 'end');
    ok('‼️ the ceiling menu and end\'s question are handed the PHONE\'s surface, not the PC\'s',
        ceil[2] === managerHost && ceil[2].remote === true && end[2] === managerHost && typeof end[2].ask.warn === 'function');

    pcSide.length = 0;
    views.message(manager, 's2', { type: 'openSession', sessionId: 's9' });
    views.message(manager, 's2', { type: 'afnav', to: 'sessions' });
    await settle();
    ok('‼️ nothing a phone sends opens a transcript or another tab on the PC', pcSide.length === 0);
    void readerHost;

    // ---- the legs menu, asked of the phone ----
    const asked = [];
    const phoneAsk = {
        info: m => { asked.push('info:' + m); return Promise.resolve(undefined); },
        warn: m => { asked.push('warn:' + m); return Promise.resolve(undefined); },
        error: m => { asked.push('error:' + m); return Promise.resolve(undefined); },
        pick: (items, o) => { asked.push({ pick: items.map(i => i.label), title: o && o.title }); return Promise.resolve(undefined); },
        input: () => Promise.resolve(undefined),
        open: () => Promise.resolve(undefined)
    };
    const from = sid => ({ sessionId: sid, agentId: 'dev', engine: 'claude', cwd: 'D:\\repo', launchId: 'l' });
    const mk = (id, hop, state, sid, to, extra) => ({ id, chainId: 'chn_1', hop, state, prompt: 'p', why: 'w', from: from(sid),
        inherit: { surface: 'console' }, want: { surface: 'inherit', account: '@emptiest' }, ...(to ? { toSessionId: to } : {}), createdAt: 1, updatedAt: 1, ...extra });
    const batons = [mk('s0', 0, 'started', 'L1', 'L1', { maxLegs: 12 }), mk('b1', 1, 'started', 'L1', 'L2')];
    const legsDeps = { store: { all: () => batons }, fallback: () => 6, alive: () => true, lastLeg: () => ({ ok: true, sentence: 'x' }), openLeg: () => asked.push('openLeg') };
    pcSide.length = 0;
    await pickChainLegs(legsDeps, { chainId: 'chn_1' }, () => ({ ok: true, sentence: 'set' }), { ask: phoneAsk, remote: true });
    const phoneMenu = asked.find(a => a.pick);
    ok('‼️ on a phone the legs menu is asked there, and nothing is shown on the PC', !!phoneMenu && phoneMenu.pick.length > 0 && pcSide.length === 0);
    ok('…without the row that would open the leg in a PC tab', !phoneMenu.pick.some(l => /Open the running leg/.test(l)));
    asked.length = 0;
    await pickChainLegs(legsDeps, { chainId: 'chn_1' }, () => ({ ok: true, sentence: 'set' }), { ask: phoneAsk, remote: false });
    ok('…which a desktop tab still offers', asked.find(a => a.pick).pick.some(l => /Open the running leg/.test(l)));
    pcSide.length = 0;
    await pickChainLegs(legsDeps, { chainId: 'chn_1' }, () => ({ ok: true, sentence: 'set' }));
    ok('with no surface named it is the VS Code window, as before (the palette, the status bar, the card)', pcSide.includes('pick'));

    // ---- the host wires the phone's answer, the bridge keeps the PC's ----
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('the host makes the phone\'s Chains page on the named chain',
        /chains: \(host, args\) => ChainsPanel\.openOn\(host, chainsDeps, typeof args\?\.chain === 'string' \? args\.chain : undefined\)/.test(ext));
    ok('end\'s question is asked through the pressing surface\'s ask; the ceiling menu too',
        /confirm: LegConfirm = async \(question, yes\) => await on\.ask\.warn\(question, \{ modal: true \}, yes\) === yes/.test(ext)
        && /pickChainLegs\(batonLegsDeps, \{ chainId \}, \(c, n\) => applyChainLegs\(batonLegsDeps, c, n\), \{ ask: on\.ask, remote: on\.remote \}\)/.test(ext));
    ok('…and closeLeg asks through it when given, the PC\'s modal otherwise (chains.end from the bridge)',
        /const yes = confirm \? await confirm\(question, 'Close it'\)\s*: await vscode\.window\.showWarningMessage\(question, \{ modal: true \}, 'Close it'\) === 'Close it';/.test(ext));
    const ops = fs.readFileSync(path.join(ROOT, 'src', 'core', 'chainBoardOps.ts'), 'utf8');
    ok('endOnBoard hands its question on to closeLeg', /deps\.closeLeg\(r\.sessionId, r\.why, q\.confirm\)/.test(ops));

    // ---- the desktop's chain link, on the phone ----
    const posted = [];
    const win = { afShell: { post: s => posted.push(JSON.parse(s)) }, sessionStorage: { getItem: () => null, setItem: () => undefined } };
    win.window = win;
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'media', 'afRemote.js'), 'utf8'), Object.assign(win, { location: { pathname: '/view/console', search: '?view=a' } }));
    const api = win.acquireVsCodeApi();
    api.postMessage({ type: 'afnav', to: 'chains:chn_muqmf6q7001io2' });
    api.postMessage({ type: 'afnav', to: 'chains' });
    api.postMessage({ type: 'afnav', to: 'needs' });
    api.postMessage({ type: 'openSession', sessionId: 'sid-3' });
    ok('‼️ a ⑂ mark\'s chains:<id> becomes the phone\'s Chains page with the chain in its args',
        JSON.stringify(posted[0]) === JSON.stringify({ type: 'afnav', to: 'chains', args: { chain: 'chn_muqmf6q7001io2' } }));
    ok('…a plain page link is left as it is', posted[1].to === 'chains' && !posted[1].args && posted[2].to === 'needs');
    ok('…and a leg\'s ↗ on the Chains page opens the phone\'s session page', posted[3].type === 'afnav' && posted[3].to === 'session' && posted[3].args.sessionId === 'sid-3');

    views.close(manager, 's2');
    views.close(reader, 's1');
    clearInterval(alive);
    console.log(`\nchains on a phone: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL threw: ' + (e && e.stack || e)); process.exit(1); });
