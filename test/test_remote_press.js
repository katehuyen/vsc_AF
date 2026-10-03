// A press on the phone that the farm does not run is SAID on the phone, never dropped in silence.
// media/afRemote.js marks what the user's own press posts (afPress); src/panels/remoteViews.ts takes
// the mark off before the page sees it and, when the message is the PC's own or above the phone's
// scope, answers with an afAsk note. What a page sends by itself stays silent.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

class EventEmitter {
    constructor() { this.listeners = []; this.event = f => { this.listeners.push(f); return { dispose: () => { this.listeners = this.listeners.filter(x => x !== f); } }; }; }
    fire(e) { for (const f of [...this.listeners]) { f(e); } }
    dispose() { this.listeners = []; }
}
const uri = p => ({ path: p, fsPath: p, toString: () => 'file://' + p });
const vscodeStub = { EventEmitter, Uri: { joinPath: (b, ...parts) => uri([b.path, ...parts].join('/')), file: uri } };
const origLoad = Module._load;
Module._load = function (request) { return request === 'vscode' ? vscodeStub : origLoad.apply(this, arguments); };
const { RemoteViews, refusedNote } = require(path.join(ROOT, 'out', 'panels', 'remoteViews.js'));
Module._load = origLoad;
const { scopeAtLeast } = require(path.join(ROOT, 'out', 'remote', 'index.js'));

// ---------- (1) THE HOST ----------
const got = [];
const views = new RemoteViews({
    media: uri('/ext/media'), atLeast: scopeAtLeast, waitMs: 60,
    pages: {
        probe: {
            open: 'read', act: 'manage', looks: ['refresh'], answers: ['answer'], pcOnly: ['openReport'],
            make: host => { host.webview.onDidReceiveMessage(m => got.push(m)); }
        }
    }
});
const reader = { device: 'dev_r', scope: 'read' }, manager = { device: 'dev_m', scope: 'manage' };
const toR = [], toM = [];
views.open(reader, 'v1', 'probe', undefined, m => toR.push(m));
views.open(manager, 'v2', 'probe', undefined, m => toM.push(m));
const notes = list => list.filter(m => m.type === 'afAsk' && m.kind === 'note');

views.message(manager, 'v2', { type: 'refresh', afPress: true });
ok('‼️ the mark never reaches the page', got.length === 1 && got[0].type === 'refresh' && !('afPress' in got[0]));
ok('a press that ran says nothing', notes(toM).length === 0);

views.message(manager, 'v2', { type: 'openReport', id: 'n1', afPress: true });
ok('‼️ a pressed PC-only action is said on the phone', notes(toM).length === 1 && notes(toM)[0].message === refusedNote(null, 'manage')
    && /on the PC/.test(notes(toM)[0].message));
ok('…and still never runs', got.length === 1);

views.message(reader, 'v1', { type: 'pin', afPress: true });
ok('‼️ a pressed action above the phone\'s scope names both scopes and where to change it', notes(toR).length === 1
    && /may read; this needs manage/.test(notes(toR)[0].message) && /Agent Farm app/.test(notes(toR)[0].message));
views.message(reader, 'v1', { type: 'answer', afPress: true });
ok('an answer needs answer', /this needs answer/.test((notes(toR)[1] || {}).message));

const before = toR.length + toM.length;
views.message(reader, 'v1', { type: 'pin' });
views.message(manager, 'v2', { type: 'openReport', id: 'n1' });
views.message(reader, 'v1', { type: 'pin', afPress: 'yes' });
ok('‼️ what a page sends by itself (no mark, or a forged one) stays silent', toR.length + toM.length === before);
ok('a refused message is still reported as refused', views.message(reader, 'v1', { type: 'pin', afPress: true }).ran === false);

// ---------- (2) THE PAGE ----------
const listeners = {};
const posted = [];
const timers = [];
const win = {
    addEventListener: (t, f, capture) => { (listeners[t + (capture ? ':cap' : ':bub')] = listeners[t + (capture ? ':cap' : ':bub')] || []).push(f); },
    afShell: { post: s => posted.push(JSON.parse(s)) },
    sessionStorage: { getItem: () => null, setItem: () => undefined }
};
const ctx = { window: win, location: { pathname: '/view/probe', search: '?view=v1' }, setTimeout: f => { timers.push(f); }, Object, JSON, Array };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'media', 'afRemote.js'), 'utf8'), ctx);
const api = win.acquireVsCodeApi();
const dispatch = (type, e, during) => {
    for (const f of listeners[type + ':cap'] || []) { f(Object.assign({ type }, e)); }
    during();
    for (const f of listeners[type + ':bub'] || []) { f(Object.assign({ type }, e)); }
};

api.postMessage({ type: 'refresh' });
ok('a message sent by the page itself carries no mark', posted[0].afPress === undefined);
const own = { type: 'pin', id: 'x' };
dispatch('click', {}, () => api.postMessage(own));
ok('‼️ a message sent while a click is handled carries afPress', posted[1].type === 'pin' && posted[1].afPress === true);
ok('…on a copy: the page\'s own object is untouched', own.afPress === undefined);
api.postMessage({ type: 'tick' });
ok('the press ends with its event', posted[2].afPress === undefined);
dispatch('keydown', { key: 'a' }, () => api.postMessage({ type: 'typed' }));
ok('a keystroke is not a press', posted[3].afPress === undefined);
dispatch('keydown', { key: 'Enter' }, () => api.postMessage({ type: 'send' }));
ok('Enter is a press', posted[4].afPress === true);
dispatch('change', {}, () => undefined);
listeners['change:cap'][0]({ type: 'change' });
for (const f of timers.splice(0)) { f(); }
api.postMessage({ type: 'late' });
ok('a press whose bubble never came (stopPropagation) still ends on the next turn', posted[5].afPress === undefined);
dispatch('click', {}, () => api.postMessage({ type: 'afnav', to: 'chains:c1' }));
ok('a shell request (the phone answers it, the farm never sees it) is not marked', posted[6].type === 'afnav' && posted[6].to === 'chains'
    && posted[6].args.chain === 'c1' && posted[6].afPress === undefined);
dispatch('click', {}, () => api.postMessage({ type: 'afVoice', token: 'v1' }));
ok('…a dictation tap neither', JSON.stringify(posted[7]) === JSON.stringify({ type: 'afVoice', token: 'v1' }));

console.log(`\ntest_remote_press: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
