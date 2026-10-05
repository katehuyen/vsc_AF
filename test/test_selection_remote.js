// X-456 — A WORKFLOW'S SELECTION STEP ON A PHONE. Keeping some of the candidate assets, or cancelling
// the step, settles the same wait workflows.select settles, which asks manage over the bridge, so the
// page asks manage to look and to act. The open selection is named by its id, or it is the one asked
// first; none open is "unavailable". Its pictures reach the phone by the view's own tokens. A phone's
// choice meets the step's own rule; leaving the view cancels nothing (closing the PC's tab still
// does), and an answer from another door is told on the phone rather than closing its view.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
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
const fileUri = p => ({ scheme: 'file', path: p.replace(/\\/g, '/'), fsPath: p, toString: () => 'file://' + p });
const tabs = [];
const vscodeStub = {
    EventEmitter,
    Uri: { joinPath: (b, ...parts) => fileUri([b.path, ...parts].join('/')), file: fileUri, parse: fileUri },
    ViewColumn: { One: 1, Active: -1 },
    window: {
        // the PC's tab, for the desktop half
        createWebviewPanel: (viewType, title, _col, options) => {
            const disposed = new EventEmitter(), inbox = new EventEmitter();
            const panel = {
                viewType, title, options, visible: true, disposedN: 0,
                webview: {
                    html: '', cspSource: 'csp', posted: [],
                    asWebviewUri: u => ({ toString: () => 'vscode-resource:' + u.fsPath }),
                    postMessage(m) { this.posted.push(m); return Promise.resolve(true); },
                    onDidReceiveMessage: inbox.event, send: m => inbox.fire(m)
                },
                reveal: () => undefined,
                onDidDispose: disposed.event,
                onDidChangeViewState: () => ({ dispose: () => undefined }),
                dispose() { if (!panel.disposedN++) { disposed.fire(); } }
            };
            tabs.push(panel);
            return panel;
        }
    },
    workspace: { getConfiguration: () => ({ get: (_k, d) => d }), workspaceFolders: [] }
};
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') { return vscodeStub; }
    return origLoad.apply(this, arguments);
};
const { SelectionPanel } = require(path.join(ROOT, 'out', 'panels', 'selectionPanel.js'));
const { RemoteViews, messageScope } = require(path.join(ROOT, 'out', 'panels', 'remoteViews.js'));
const { remotePages } = require(path.join(ROOT, 'out', 'panels', 'remotePages.js'));
Module._load = origLoad;
const { SelectionWaits } = require(path.join(ROOT, 'out', 'core', 'selectionWaits.js'));
const { scopeAtLeast, requiredScope } = require(path.join(ROOT, 'out', 'remote', 'scopes.js'));

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'af-selphone-'));
const PIC = path.join(TMP, 'kare-1.png');
fs.writeFileSync(PIC, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
const extUri = fileUri(ROOT);
const ask = (title) => ({
    title, message: 'keep the best', min: 1, max: 2,
    candidates: [
        { taskId: 't1', title: 'first', url: 'https://x/1', file: PIC, kind: 'image' },
        { taskId: 't2', title: 'second', url: 'https://x/2', kind: 'image' },
        { taskId: 't3', title: 'third', url: 'https://x/3', kind: 'image' }
    ]
});
const settle = (ms = 20) => new Promise(r => setTimeout(r, ms));
// a wait that never settles must fail here, not let the process drain and exit 0
const within = (p, ms = 1000) => Promise.race([p, new Promise(r => setTimeout(() => r('never settled'), ms))]);
let finished = false;
process.on('beforeExit', () => { if (!finished) { console.log('  FAIL the test ended before its last check'); process.exit(1); } });

(async () => {
    // ---- what each message needs ----
    const R = remotePages({ selection: () => true }).selection;
    ok('‼️ the page asks manage to open and to act — its wait is settled by workflows.select, which asks the same',
        R && R.open === 'manage' && R.act === 'manage' && requiredScope('workflows.select') === 'manage');
    ok('keeping and cancelling are its acts', ['confirm', 'cancel'].every(t => messageScope(R, t) === 'manage'));

    const waits = new SelectionWaits();
    const views = new RemoteViews({
        media: fileUri(path.join(ROOT, 'media')), atLeast: scopeAtLeast, waitMs: 60,
        pages: remotePages({ selection: (host, args) => SelectionPanel.openOn(host, extUri, waits, typeof args?.id === 'string' ? args.id : undefined) })
    });
    const reader = { device: 'dev_r', scope: 'read' }, manager = { device: 'dev_m', scope: 'manage' };
    ok('‼️ with nothing to pick the phone is told it is unavailable', views.open(manager, 'n1', 'selection', undefined, () => undefined) === false);

    const a = waits.add(ask('Cover'), 1000), b = waits.add(ask('Thumbnail'), 2000);
    ok('a phone paired to read does not open it', views.open(reader, 'r1', 'selection', undefined, () => undefined) === false);
    const toA = [], toB = [];
    ok('a manage phone opens the one asked first, never as a tab on the PC', views.open(manager, 's1', 'selection', undefined, m => toA.push(m)) === true && tabs.length === 0);
    const body = (await views.page('/view/selection?view=s1', manager)).body;
    ok('…from /res/, with that step\'s candidates', body.includes('src="/res/selection.js"') && body.includes('"title":"Cover"') && body.includes('https://x/3'));
    const tok = /"src":"(\/res\/~\/s1\/[a-f0-9]{24})"/.exec(body);
    const served = tok && await views.page(tok[1], manager);
    ok('‼️ a candidate\'s file reaches the phone by the view\'s own token', !!served && served.status === 200 && served.type === 'image/png' && !body.includes(PIC.replace(/\\/g, '\\\\')));
    ok('a named selection opens that one', views.open(manager, 's2', 'selection', { id: b.id }, m => toB.push(m)) === true
        && (await views.page('/view/selection?view=s2', manager)).body.includes('"title":"Thumbnail"'));
    ok('a selection nobody has open is unavailable', views.open(manager, 's3', 'selection', { id: 'sel-nope' }, () => undefined) === false);

    views.message(manager, 's1', { type: 'confirm', urls: ['https://x/1', 'https://x/2', 'https://x/3'] });
    views.message(manager, 's1', { type: 'confirm', urls: ['https://elsewhere/9'] });
    await settle();
    const refused = toA.filter(m => m.type === 'refused');
    ok('‼️ a phone\'s choice meets the step\'s own rule: too many and a stranger are refused, the step still open',
        refused.length === 2 && /at most 2/.test(refused[0].text) && /not one of its candidates/.test(refused[1].text) && waits.get(a.id));

    views.close(manager, 's2');
    await settle();
    ok('‼️ leaving a phone\'s view cancels nothing', !!waits.get(b.id));

    views.message(manager, 's1', { type: 'confirm', urls: ['https://x/2'] });
    ok('a fitting choice from the phone settles the step', JSON.stringify(await within(a.promise)) === '["https://x/2"]' && !waits.get(a.id));
    await settle();
    ok('…and the phone is told it was answered', toA.some(m => m.type === 'answered'));

    const toC = [];
    views.open(manager, 's4', 'selection', { id: b.id }, m => toC.push(m));
    waits.settle(b.id, null);
    await settle();
    ok('‼️ an answer from another door is told on the phone, not a closed view', toC.some(m => m.type === 'answered')
        && (await views.page('/view/selection?view=s4', manager)) !== null);

    // ---- the PC's tab keeps its contract ----
    const c = waits.add(ask('Banner'), 3000);
    SelectionPanel.pick(extUri, waits.get(c.id), waits, c.promise);
    const tab = tabs[0];
    ok('the PC opens its own tab, its file\'s folder a resource root', tab && tab.viewType === 'agentfarm.selection'
        && tab.options.localResourceRoots.some(u => u.fsPath === TMP) && tab.webview.html.includes('vscode-resource:'));
    const d = waits.add(ask('Poster'), 4000);
    views.open(manager, 's5', 'selection', { id: c.id }, () => undefined);
    views.message(manager, 's5', { type: 'confirm', urls: ['https://x/1'] });
    await within(c.promise);
    await settle();
    ok('‼️ the PC\'s tab closes when a phone answered first', tab.disposedN === 1);
    SelectionPanel.pick(extUri, waits.get(d.id), waits, d.promise);
    tabs[1].dispose();
    ok('…and closing it unanswered still cancels', (await within(d.promise)) === null);

    // ---- the host's wiring ----
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('the phone opens a selection from the same store the bridge and the PC settle',
        /selection: \(host, args\) => SelectionPanel\.openOn\(host, context\.extensionUri, selectionWaits,/.test(ext)
        && /SelectionPanel\.pick\(context\.extensionUri, selectionWaits\.get\(id\)!, selectionWaits, promise\)/.test(ext));

    fs.rmSync(TMP, { recursive: true, force: true });
    finished = true;
    console.log(`\nselection on a phone: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL threw: ' + (e && e.stack || e)); process.exit(1); });
