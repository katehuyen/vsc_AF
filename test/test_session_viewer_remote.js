// X-456 — A SESSION'S TRANSCRIPT ON A PHONE. The same SessionViewerPanel, drawn
// on a phone's view: the phone names a session by id or by path and only one the
// index knows opens (anything else is "unavailable"); a read device reads, a
// manage device renames, pins and resumes it in the Console with every question
// asked on the phone; files, the raw JSONL, the terminal, the export and the PC
// clipboard never run from a phone; the desktop keeps its tab per transcript
// however many phones read the same one; and on the phone a page's "open this
// transcript" becomes the shell's afnav (media/afRemote.js).
'use strict';
const fs = require('fs');
const os = require('os');
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
const commandArgs = [];
const tabs = [];
const vscodeStub = {
    EventEmitter,
    Uri: { joinPath: (b, ...parts) => uri([b.path, ...parts].join('/')), file: uri, parse: uri },
    ViewColumn: { One: 1, Active: -1 },
    ConfigurationTarget: { Global: 1 },
    env: { clipboard: { writeText: t => { pcSide.push('clipboard:' + t); return Promise.resolve(); } } },
    window: {
        createWebviewPanel: (viewType, title) => {
            const disposed = new EventEmitter(), inbox = new EventEmitter(), state = new EventEmitter();
            const panel = {
                viewType, title, visible: true, revealed: 0,
                webview: {
                    html: '', cspSource: 'vscode-webview:', asWebviewUri: u => ({ toString: () => 'vscode-webview:' + u.path }),
                    postMessage: () => Promise.resolve(true), onDidReceiveMessage: inbox.event
                },
                onDidDispose: disposed.event, onDidChangeViewState: state.event,
                reveal() { this.revealed++; }, dispose() { disposed.fire(); }
            };
            tabs.push(panel);
            return panel;
        },
        showErrorMessage: () => { pcSide.push('dialog'); return Promise.resolve(undefined); },
        showInformationMessage: () => { pcSide.push('dialog'); return Promise.resolve(undefined); },
        showWarningMessage: () => { pcSide.push('dialog'); return Promise.resolve(undefined); },
        showInputBox: () => { pcSide.push('dialog'); return Promise.resolve(undefined); },
        showQuickPick: () => { pcSide.push('dialog'); return Promise.resolve(undefined); },
        showSaveDialog: () => { pcSide.push('dialog'); return Promise.resolve(undefined); },
        showTextDocument: () => { pcSide.push('editor'); return Promise.resolve(undefined); }
    },
    commands: { executeCommand: (...a) => { pcSide.push('command:' + a[0]); commandArgs.push(a); return Promise.resolve(undefined); } },
    workspace: {
        getConfiguration: () => ({ get: (_k, d) => d, update: async () => { } }), workspaceFolders: [],
        onDidChangeConfiguration: () => ({ dispose: () => undefined })
    }
};
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') { return vscodeStub; }
    return origLoad.apply(this, arguments);
};
const { SessionViewerPanel } = require(path.join(ROOT, 'out', 'panels', 'sessionViewer.js'));
const { RemoteViews } = require(path.join(ROOT, 'out', 'panels', 'remoteViews.js'));
const { remotePages, sessionPageTarget } = require(path.join(ROOT, 'out', 'panels', 'remotePages.js'));
Module._load = origLoad;
const { scopeAtLeast } = require(path.join(ROOT, 'out', 'remote', 'index.js'));

const T = s => `2026-10-01T09:0${s}:00.000Z`;
const file = path.join(os.tmpdir(), `af-viewer-remote-${process.pid}.jsonl`);
fs.writeFileSync(file, [
    { type: 'user', timestamp: T(1), cwd: 'D:/x', sessionId: 'sid-1', message: { content: 'merhaba' } },
    {
        type: 'assistant', timestamp: T(2), sessionId: 'sid-1',
        message: { id: 'a1', model: 'claude-opus-5', content: [{ type: 'text', text: 'selam' }], usage: { input_tokens: 10, output_tokens: 4 } }
    }
].map(l => JSON.stringify(l)).join('\n'));
const known = [{ sessionId: 'sid-1', file }];
const deps = {
    extensionUri: uri('/ext'), getPricing: () => ({ costFor: () => 0 }),
    maxMessages: () => 50, contextLimitFor: () => 0
};

const settle = () => new Promise(r => setImmediate(r));
const alive = setInterval(() => undefined, 1000);

(async () => {
    // ---- which transcript a phone may name ----
    ok('a phone names a session by its id', sessionPageTarget({ sessionId: 'sid-1' }, known)?.file === file);
    ok('or by the path its page was handed', sessionPageTarget({ file }, known)?.file === file);
    ok('a path the index does not know opens nothing', sessionPageTarget({ file: 'C:/Windows/win.ini' }, known) === undefined
        && sessionPageTarget({ sessionId: 'nope' }, known) === undefined && sessionPageTarget(undefined, known) === undefined);
    const t = sessionPageTarget({ sessionId: 'sid-1', ts: 1234, roles: ['user', 7, 'assistant'] }, known);
    ok('the moment and the roles travel, cleaned', t.focusTs === 1234 && t.roles.join() === 'user,assistant'
        && !('focusTs' in sessionPageTarget({ sessionId: 'sid-1', ts: -1 }, known)));

    const views = new RemoteViews({
        media: uri('/ext/media'), atLeast: scopeAtLeast, waitMs: 60,
        pages: remotePages({
            needs: () => undefined, console: () => undefined, now: () => undefined, sessions: () => undefined, tasks: () => undefined,
            session: (host, args) => {
                const to = sessionPageTarget(args, known);
                if (to) { SessionViewerPanel.openOn(host, to.file, deps, to.focusTs, to.roles); }
                return !!to;
            }
        })
    });
    const reader = { device: 'dev_r', scope: 'read' }, manager = { device: 'dev_m', scope: 'manage' };
    const admin = { device: 'dev_m', scope: 'admin' };
    const toReader = [], toManager = [];
    ok('an unknown session is refused, and no view is kept for it',
        views.open(reader, 'x0', 'session', { sessionId: 'nope' }, () => undefined) === false && views.count() === 0
        && (await views.page('/view/session?view=x0', reader)) === null);
    ok('a known one opens on a phone', views.open(reader, 'v1', 'session', { sessionId: 'sid-1' }, m => toReader.push(m)) === true);
    views.open(manager, 'v2', 'session', { file }, m => toManager.push(m));
    const page = (await views.page('/view/session?view=v1', reader)).body;
    ok('its page loads from /res/, the viewer\'s own script too', page.includes('src="/res/sessionViewer.js"')
        && !/vscode-webview:|file:\/\//.test(page) && page.includes('merhaba'));
    ok('no desktop tab was made for a phone', tabs.length === 0);

    views.message(reader, 'v1', { type: 'refresh' });
    views.message(reader, 'v1', { type: 'sessionFileEdits', file: 'x.ts' });
    await settle();
    ok('a read device reads the transcript', toReader.some(m => m.type === 'data') && toReader.some(m => m.type === 'sessionFileEdits'));

    for (const type of ['pinSession', 'renameSession', 'resumeConsole', 'wikiMark']) {
        views.message(reader, 'v1', { type, pinned: true });
    }
    await settle();
    ok('a read device cannot rename, pin or resume it', pcSide.length === 0);

    views.message(manager, 'v2', { type: 'pinSession', pinned: true });
    views.message(manager, 'v2', { type: 'renameSession' });
    views.message(manager, 'v2', { type: 'resumeConsole' });
    await settle();
    ok('a manage device can', pcSide.join() === 'command:agentfarm.pinSession,command:agentfarm.renameSession,command:agentfarm.resumeInConsole');
    const rename = commandArgs.find(a => a[0] === 'agentfarm.renameSession')[1];
    const resume = commandArgs.find(a => a[0] === 'agentfarm.resumeInConsole')[1];
    ok('renaming names the session it shows', rename.sessionId === path.basename(file, '.jsonl'));
    rename.ask.info('hello phone');
    resume.ask.info('resume note');
    await settle();
    ok('the rename and the resume ask the phone, not the PC', toManager.filter(m => m.type === 'afAsk').length === 2
        && !pcSide.includes('dialog'));

    pcSide.length = 0;
    for (const type of ['openRaw', 'copyStep', 'openEditedFile', 'revealFile', 'exportChoose', 'resume', 'focusTerminal',
        'openAgent', 'openDashboard', 'openTimeline', 'chainGo', 'openGuide', 'afnav']) {
        views.message(admin, 'v2', { type, file: 'C:/x.ts', text: 'secret', idx: 1, sessionId: 'sid-1', to: 'dashboard', view: {} });
    }
    await settle();
    ok('nothing a phone sends opens a file, a terminal, a dialog or the PC clipboard', pcSide.length === 0);

    const before = toManager.filter(m => m.type === 'data').length;
    SessionViewerPanel.refreshOpen();
    await settle();
    ok('a rename anywhere reaches the phones reading it', toManager.filter(m => m.type === 'data').length === before + 1);

    // ---- the desktop keeps its tab per transcript ----
    SessionViewerPanel.show(file, deps);
    SessionViewerPanel.show(file, deps);
    ok('the desktop has its one tab for the transcript beside the phones', tabs.length === 1 && tabs[0].revealed === 1 && tabs[0].viewType === 'agentfarm.session');
    views.close(manager, 'v2');
    views.close(reader, 'v1');
    SessionViewerPanel.show(file, deps);
    ok('closing the phones\' views leaves the desktop tab alone', tabs.length === 1 && tabs[0].revealed === 2);
    tabs[0].dispose();
    SessionViewerPanel.show(file, deps);
    ok('closing the tab lets the next show make a new one', tabs.length === 2);
    tabs[1].dispose();

    // ---- on the phone a page's "open this transcript" is the shell's afnav ----
    const posted = [];
    const win = { afShell: { post: s => posted.push(JSON.parse(s)) }, sessionStorage: { getItem: () => null, setItem: () => undefined } };
    win.window = win;
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'media', 'afRemote.js'), 'utf8'), Object.assign(win, { location: { pathname: '/view/sessions', search: '?view=a' } }));
    const api = win.acquireVsCodeApi();
    api.postMessage({ type: 'openSession', file: 'C:/t/a.jsonl', ts: 5, roles: ['user', 3] });
    api.postMessage({ type: 'chainGo', sessionId: 'sid-2' });
    api.postMessage({ type: 'open-transcript', file: 'C:/t/b.jsonl' });
    api.postMessage({ type: 'openSession' });
    api.postMessage({ type: 'pinSession', sessionId: 'sid-1' });
    ok('a transcript click becomes afnav to the session page', JSON.stringify(posted[0]) === JSON.stringify({ type: 'afnav', to: 'session', args: { file: 'C:/t/a.jsonl', ts: 5, roles: ['user'] } })
        && posted[1].to === 'session' && posted[1].args.sessionId === 'sid-2'
        && posted[2].args.file === 'C:/t/b.jsonl');
    ok('a click naming no transcript, and every other message, go to the farm unchanged', posted[3].type === 'openSession' && posted[4].type === 'pinSession');

    // ---- what the phone does not draw ----
    const js = fs.readFileSync(path.join(ROOT, 'media', 'sessionViewer.js'), 'utf8');
    ok('the PC-only controls are not drawn on a phone', ['id="resume"${PC_ONLY}', 'id="focusterm"${PC_ONLY}', 'id="exportmd"${PC_ONLY}',
        'id="raw"${PC_ONLY}', 'id="agentpage"${PC_ONLY}', 'data-openfile="${C.esc(f.file)}"${PC_ONLY}', 'data-difffile="${C.esc(f.file)}"${PC_ONLY}'].every(s => js.includes(s)));
    ok('a copy on the phone goes to the phone\'s clipboard', (js.match(/if \(ON_PHONE_HOST\) \{ window\.AFCtx\.copy\(text/g) || []).length === 2);

    try { fs.unlinkSync(file); } catch { /* gone */ }
    clearInterval(alive);
    console.log(`\nsession viewer on a phone: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL threw: ' + (e && e.stack || e)); process.exit(1); });
