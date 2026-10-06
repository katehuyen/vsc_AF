// U-199 — the transcript panel's side of reading aloud: a step's 🔊 and the Read
// aloud menus reach the ONE reading channel (readerOps.readNow / readingAct, the
// bodies of alerts.readNow / alerts.reading) naming THIS transcript; a refusal
// comes back as a toast; every change of the channel reaches every open view;
// and a phone's view cannot make the PC speak.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const ROOT = path.join(__dirname, '..');

class EventEmitter {
    constructor() { this.listeners = []; this.event = f => { this.listeners.push(f); return { dispose: () => undefined }; }; }
    fire(e) { for (const f of [...this.listeners]) { f(e); } }
    dispose() { this.listeners = []; }
}
const uri = p => ({ path: p, fsPath: p, toString: () => 'file://' + p });
const tabs = [];
const vscodeStub = {
    EventEmitter,
    Uri: { joinPath: (b, ...parts) => uri([b.path, ...parts].join('/')), file: uri, parse: uri },
    ViewColumn: { One: 1, Active: -1 },
    ConfigurationTarget: { Global: 1 },
    env: { clipboard: { writeText: () => Promise.resolve() } },
    window: {
        createWebviewPanel: (viewType, title) => {
            const disposed = new EventEmitter(), inbox = new EventEmitter(), state = new EventEmitter();
            const panel = {
                viewType, title, visible: true, inbox, posted: [],
                webview: {
                    html: '', cspSource: 'vscode-webview:', asWebviewUri: u => ({ toString: () => 'vscode-webview:' + u.path }),
                    postMessage(m) { panel.posted.push(m); return Promise.resolve(true); }, onDidReceiveMessage: inbox.event
                },
                onDidDispose: disposed.event, onDidChangeViewState: state.event,
                reveal() { }, dispose() { disposed.fire(); }
            };
            tabs.push(panel);
            return panel;
        }
    },
    commands: { executeCommand: () => Promise.resolve(undefined) },
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
const { remotePages } = require(path.join(ROOT, 'out', 'panels', 'remotePages.js'));
const { messageScope } = require(path.join(ROOT, 'out', 'panels', 'remoteViews.js'));
Module._load = origLoad;
const { ReadingNow } = require(path.join(ROOT, 'out', 'core', 'soundCard.js'));
const { EN_PHRASES } = require(path.join(ROOT, 'out', 'core', 'speechPhrases.js'));

const file = path.join(os.tmpdir(), `af-viewer-read-${process.pid}.jsonl`);
fs.writeFileSync(file, [
    { type: 'user', uuid: 'u1', timestamp: '2026-10-06T09:01:00.000Z', cwd: 'D:/x', sessionId: 'sid-1', message: { content: 'merhaba' } },
    {
        type: 'assistant', uuid: 'a1', timestamp: '2026-10-06T09:02:00.000Z', sessionId: 'sid-1',
        message: { id: 'm1', model: 'claude-opus-5', content: [{ type: 'text', text: 'Selam, buradayım.' }], usage: { input_tokens: 10, output_tokens: 4 } }
    }
].map(l => JSON.stringify(l)).join('\n'));

const asked = [], spoke = [], acts = [];
let stops = 0, gone = false;
const at = { paragraph: 0, paragraphs: 1, paused: false, live: true };
const reading = new ReadingNow();
const reader = {
    conversation: ref => {
        asked.push(ref);
        return gone ? { error: 'The transcript is not on this machine any more.' }
            : { sessionId: 'sid-1', label: 'developer', steps: [{ role: 'user', text: 'merhaba', turn: 1, uuid: 'u1' }, { role: 'assistant', text: 'Selam, buradayım.', turn: 1, uuid: 'a1' }] };
    },
    voiceOf: () => '',
    fleet: () => ({ on: false, voice: '', rate: 0, volume: 100, events: [], template: '' }),
    speechFor: async w => ({ voice: w, words: EN_PHRASES }),
    dialogue: {
        speaking: true, get state() { return at; },
        act: a => { acts.push(a); return true; }, setRate: () => true,
        speak: paras => { spoke.push([].concat(paras).join(' ')); return new Promise(() => undefined); }
    },
    readingNow: reading,
    stop: () => { stops++; reading.stop(); return true; }
};
const deps = { extensionUri: uri('/ext'), getPricing: () => ({ costFor: () => 0 }), maxMessages: () => 50, contextLimitFor: () => 0, reader };
const settle = () => new Promise(r => setTimeout(r, 20));

(async () => {
    SessionViewerPanel.show(file, deps);
    const tab = tabs[0];
    ok('the panel opens with nothing being read', /"reading":null/.test(tab.webview.html));

    tab.inbox.fire({ type: 'readAloud', pick: { msg: 'a1' } });
    await settle();
    ok('‼️ a step\'s 🔊 reaches the one reading channel naming THIS transcript', asked[0] === file);
    ok('…and that step is read, whole', spoke[0] === 'Selam, buradayım.');
    ok('…as a reading the transcript asked for', reading.source && reading.source.surface === 'transcript' && reading.source.msg === 'a1');

    tab.posted.length = 0;
    SessionViewerPanel.readingChanged();
    const r = tab.posted.find(m => m.type === 'reading');
    ok('every change of the channel reaches the open view: the step being read, by its key',
        !!r && r.reading.sessionId === 'sid-1' && r.reading.key === 'a1' && r.reading.paused === false);
    at.paused = true;
    SessionViewerPanel.readingChanged();
    ok('…paused, when it is', tab.posted.filter(m => m.type === 'reading').pop().reading.paused === true);
    SessionViewerPanel.refreshOpen();
    const pushed = tab.posted.filter(m => m.type === 'data').pop();
    ok('a data push carries it too, so a repaint draws it',
        !!pushed && JSON.stringify(pushed.data.reading) === '{"sessionId":"sid-1","key":"a1","paused":true}');

    tab.inbox.fire({ type: 'readControl', action: 'resume' });
    tab.inbox.fire({ type: 'readControl', action: 'stop' });
    await settle();
    ok('▶ resumes and ■ stops through the bodies of alerts.reading', acts.includes('resume') && stops === 1);

    tab.posted.length = 0;
    tab.inbox.fire({ type: 'readControl', action: 'shout' });
    gone = true;
    tab.inbox.fire({ type: 'readAloud', pick: { msg: 'a1' } });
    await settle();
    const refused = tab.posted.filter(m => m.type === 'readRefused').map(m => m.error);
    ok('a refusal comes back to the page in the host\'s own words',
        refused.some(e => /not known/.test(e)) && refused.some(e => /not on this machine/.test(e)));

    SessionViewerPanel.readingChanged();
    ok('nothing being read is drawn as nothing', tab.posted.filter(m => m.type === 'reading').pop().reading === null);

    const session = remotePages({}).session;
    ok('‼️ a phone\'s view cannot make the PC speak — its 🔊 is the phone\'s own voice',
        messageScope(session, 'readAloud') === null && messageScope(session, 'readControl') === null);

    tab.dispose();
    try { fs.unlinkSync(file); } catch { /* gone */ }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
