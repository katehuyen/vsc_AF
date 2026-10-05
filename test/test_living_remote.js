// X-456 — THE LIVING PAGE ON A PHONE. Its bridge ops (living.pulse, living.checks,
// living.check.add/remove) ask manage, so the page asks the same to open and to act.
// There a signal's arrow opens that page on the phone; the checks editor saves from the
// phone; the file picker, settings.json and the PC's own pages stay on the PC; the farm's
// refresh and its change events reach the view; it never becomes the desktop's tab.
'use strict';
const fs = require('fs');
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
const uri = p => ({ path: p, fsPath: p, toString: () => 'file://' + p });
const pcSide = [];
const vscodeStub = {
    EventEmitter,
    Uri: { joinPath: (b, ...parts) => uri([b.path, ...parts].join('/')), file: uri, parse: uri },
    ViewColumn: { One: 1, Active: -1 },
    env: { openExternal: u => { pcSide.push('external:' + u); return Promise.resolve(true); } },
    window: {
        createWebviewPanel: () => { throw new Error('no desktop tab for a phone'); },
        showErrorMessage: m => { pcSide.push('error:' + m); return Promise.resolve(undefined); },
        showInformationMessage: m => { pcSide.push('info:' + m); return Promise.resolve(undefined); },
        showWarningMessage: m => { pcSide.push('warn:' + m); return Promise.resolve(undefined); },
        showOpenDialog: () => { pcSide.push('open-dialog'); return Promise.resolve(undefined); },
        showTextDocument: () => { pcSide.push('editor'); return Promise.resolve(undefined); }
    },
    commands: { executeCommand: (...a) => { pcSide.push('command:' + a[0]); return Promise.resolve(undefined); } },
    workspace: { getConfiguration: () => ({ get: (_k, d) => d }), workspaceFolders: [] }
};
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') { return vscodeStub; }
    return origLoad.apply(this, arguments);
};
const { LivingPanel } = require(path.join(ROOT, 'out', 'panels', 'livingPanel.js'));
const { RemoteViews, messageScope } = require(path.join(ROOT, 'out', 'panels', 'remoteViews.js'));
const { remotePages } = require(path.join(ROOT, 'out', 'panels', 'remotePages.js'));
Module._load = origLoad;
const { scopeAtLeast, requiredScope } = require(path.join(ROOT, 'out', 'remote', 'scopes.js'));

const changed = new EventEmitter();
const saved = [];
const deps = {
    extensionUri: uri('/ext'),
    snapshot: () => ({ notices: [], queue: [], automations: [], duties: [], automationLog: [], checks: [] }),
    onDidChange: changed.event,
    checks: () => [{ label: 'Inbox empties', when: { kind: 'folderHasFiles', path: 'D:/inbox' }, level: 'warn' }],
    setChecks: async next => { saved.push(next); }
};
const settle = () => new Promise(r => setTimeout(r, 15));
const alive = setInterval(() => undefined, 1000);

(async () => {
    // ---- what each message needs ----
    const L = remotePages({ living: () => undefined }).living;
    ok('‼️ the Living page asks manage to open and to act — its bridge ops ask the same',
        L && L.open === 'manage' && L.act === 'manage'
        && ['living.pulse', 'living.checks', 'living.check.add', 'living.check.remove'].every(op => requiredScope(op) === 'manage'));
    ok('a refresh only looks; saving the checks is its act', L.looks.join() === 'refresh' && messageScope(L, 'refresh') === 'manage' && messageScope(L, 'checks-save') === 'manage');
    const PC = ['af-browse', 'openSettingsJson', 'openGuide', 'afnav'];
    ok('‼️ the file picker, settings.json, the guide and another page never run from a phone', PC.every(t => messageScope(L, t) === null));

    // ---- the page on a phone ----
    const made = {};
    const views = new RemoteViews({
        media: uri('/ext/media'), atLeast: scopeAtLeast, waitMs: 60,
        pages: remotePages({ living: host => { made.l = host; LivingPanel.openOn(host, deps); } })
    });
    const reader = { device: 'dev_r', scope: 'read' }, manager = { device: 'dev_m', scope: 'manage' };
    ok('‼️ a phone paired to read does not open it', views.open(reader, 'r1', 'living', undefined, () => undefined) === false && !made.l);
    const toM = [];
    ok('a manage phone opens it, never as the desktop\'s tab', views.open(manager, 'm1', 'living', undefined, m => toM.push(m)) === true
        && made.l && made.l.remote === true && LivingPanel.current === undefined);
    const body = (await views.page('/view/living?view=m1', manager)).body;
    ok('…from /res/, with the checks it edits', body.includes('src="/res/livingPage.js"') && body.includes('Inbox empties'));
    views.message(manager, 'm1', { type: 'checks-save', checks: [{ label: 'Inbox empties', kind: 'folderHasFiles', path: 'D:/inbox', level: 'alert' }] });
    await settle();
    ok('the checks editor saves from a manage phone and says so there', saved.length === 1 && saved[0][0].level === 'alert'
        && toM.some(m => m.type === 'checks-msg' && m.ok === true));
    pcSide.length = 0;
    for (const t of PC) { views.message(manager, 'm1', { type: t, key: 'path', kind: 'folder', to: 'notices', anchor: 'yasam-panosu' }); }
    await settle();
    ok('‼️ nothing PC-only a phone sends opens a picker, an editor, a command or a page on the PC', pcSide.length === 0);
    const datas = () => toM.filter(m => m.type === 'data').length;
    let n0 = datas();
    LivingPanel.refreshIfOpen();
    await settle();
    ok('the farm\'s refresh reaches the phone', datas() === n0 + 1);
    n0 = datas();
    changed.fire();
    await settle();
    ok('…and so does a change in the tasks, notices or queue', datas() === n0 + 1);
    views.close(manager, 'm1');
    ok('a closed view leaves no instance behind', LivingPanel.phones.size === 0 && changed.listeners.length === 0);

    // ---- the host's wiring and the phone's page ----
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('the phone opens Living from the palette\'s own deps', /living: host => LivingPanel\.openOn\(host, livingDeps\)/.test(ext));
    const page = fs.readFileSync(path.join(ROOT, 'media', 'livingPage.js'), 'utf8');
    ok('‼️ a signal\'s arrow is the header\'s own page link, so on a phone it opens that page there',
        !/type: 'goto'/.test(page) && (page.match(/post\(\{ type: 'afnav', to: /g) || []).length === 3);
    ok('‼️ the file picker and the settings.json button are not drawn on a phone',
        page.includes('html.af-phone [data-afbrowse], html.af-phone [data-chk="json"] { display:none; }'));
    ok('the automation tail is a list of cards on a phone', /<table data-afcards>/.test(page)
        && /<tr data-afcardhead>/.test(page) && /<tr class="\$\{e\.outcome\}" data-afcard>/.test(page) && /<td data-lead>/.test(page));
    const css = fs.readFileSync(path.join(ROOT, 'media', 'common.css'), 'utf8');
    ok('a check\'s buttons take their own line on a phone, so its name and path keep the width',
        css.includes('html.af-phone .affrow { flex-wrap: wrap; }') && css.includes('html.af-phone .affra { flex: 1 1 100%;'));

    clearInterval(alive);
    console.log(`\nliving on a phone: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL threw: ' + (e && e.stack || e)); process.exit(1); });
