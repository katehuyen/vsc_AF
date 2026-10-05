// X-456 — THE TASK ANALYTICS ON A PHONE. Its forecast asks manage over the bridge
// (schedules.forecast), so the page asks manage to look; it has no act of its own there. The spend
// by sign-in is the Accounts' data, which a phone sees only at admin, so a phone's view is built
// without it while the PC's tab keeps it. The task history, the full forecast, the Tasks page, a
// Markdown export, the guide and another page stay on the PC; it never becomes the desktop's tab.
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
const fileUri = p => ({ scheme: 'file', path: p.replace(/\\/g, '/'), fsPath: p, toString: () => 'file://' + p });
const pcSide = [];
const vscodeStub = {
    EventEmitter,
    Uri: { joinPath: (b, ...parts) => fileUri([b.path, ...parts].join('/')), file: fileUri, parse: fileUri },
    ViewColumn: { One: 1, Active: -1 },
    env: { openExternal: u => { pcSide.push('external:' + u); return Promise.resolve(true); } },
    window: {
        createWebviewPanel: () => { throw new Error('no desktop tab for a phone'); },
        showErrorMessage: m => { pcSide.push('error:' + m); return Promise.resolve(undefined); },
        showInformationMessage: m => { pcSide.push('info:' + m); return Promise.resolve(undefined); },
        showSaveDialog: () => { pcSide.push('save-dialog'); return Promise.resolve(undefined); },
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
const { TaskAnalyticsPanel } = require(path.join(ROOT, 'out', 'panels', 'taskAnalyticsPanel.js'));
const { RemoteViews, messageScope } = require(path.join(ROOT, 'out', 'panels', 'remoteViews.js'));
const { remotePages } = require(path.join(ROOT, 'out', 'panels', 'remotePages.js'));
Module._load = origLoad;
const { scopeAtLeast, requiredScope } = require(path.join(ROOT, 'out', 'remote', 'scopes.js'));

const changed = new EventEmitter();
let spendAsked = 0;
const deps = {
    extensionUri: fileUri(ROOT),
    manager: { tasks: [], schedules: [], triggers: [] },
    allRecords: () => [],
    forecastDays: () => 7,
    onDidChange: changed.event,
    accountSpend: () => { spendAsked++; return { from: 0, to: 1, rows: [{ account: 'gizli@hesap', engine: 'claude', costUsd: 41.88 }], unattributed: { sessions: 0, unsplit: 0 } }; }
};
const settle = () => new Promise(r => setTimeout(r, 20));
const alive = setInterval(() => undefined, 1000);

(async () => {
    // ---- what each message needs ----
    const A = remotePages({ analytics: () => undefined }).analytics;
    ok('‼️ the analytics ask manage to look — the forecast it draws asks the same over the bridge',
        A && A.open === 'manage' && requiredScope('schedules.forecast') === 'manage' && requiredScope('tasks.history') === 'read');
    const PC = ['open-history', 'open-forecast', 'open-tasks', 'export-md', 'openGuide', 'afnav'];
    ok('‼️ the task history, the full forecast, the Tasks page, an export, the guide and another page never run from a phone',
        PC.every(t => messageScope(A, t) === null) && A.looks.includes('refresh'));

    // ---- the page on a phone ----
    const made = {};
    const views = new RemoteViews({
        media: fileUri(path.join(ROOT, 'media')), atLeast: scopeAtLeast, waitMs: 60,
        pages: remotePages({ analytics: host => { made.a = host; TaskAnalyticsPanel.openOn(host, deps); } })
    });
    const reader = { device: 'dev_r', scope: 'read' }, manager = { device: 'dev_m', scope: 'manage' };
    ok('‼️ a phone paired to read does not open it', views.open(reader, 'r1', 'analytics', undefined, () => undefined) === false && !made.a);
    const toM = [];
    ok('a manage phone opens it, never as the desktop\'s tab', views.open(manager, 'a1', 'analytics', undefined, m => toM.push(m)) === true
        && made.a && made.a.remote === true && TaskAnalyticsPanel.current === undefined);
    const body = (await views.page('/view/analytics?view=a1', manager)).body;
    ok('…from /res/', body.includes('src="/res/taskAnalytics.js"'));
    ok('‼️ the spend by sign-in is not built for a phone, and no account reaches it', spendAsked === 0 && !body.includes('gizli@hesap'));

    pcSide.length = 0;
    for (const t of PC) { views.message(manager, 'a1', { type: t, to: 'tasks', cols: ['a'], rows: [['1']], name: 'x' }); }
    await settle();
    ok('‼️ nothing PC-only a phone sends opens, saves or runs anything on the PC', pcSide.length === 0);
    const datas = () => toM.filter(m => m.type === 'data').length;
    let n0 = datas();
    changed.fire();
    await settle();
    ok('a task change reaches the phone', datas() > n0);
    n0 = datas();
    TaskAnalyticsPanel.refreshIfOpen();
    await settle();
    ok('the farm\'s refresh reaches the phone, still without the spend', datas() > n0 && spendAsked === 0
        && toM.filter(m => m.type === 'data').every(m => m.data.accountSpend === undefined));
    const desk = { refresh: () => undefined };
    TaskAnalyticsPanel.current = desk;
    views.close(manager, 'a1');
    ok('a closed view leaves no instance behind, nor its task listener, and the desktop\'s tab alone',
        TaskAnalyticsPanel.phones.size === 0 && TaskAnalyticsPanel.current === desk && changed.listeners.length === 0);
    TaskAnalyticsPanel.current = undefined;

    // ---- the host's wiring and the phone's page ----
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('the phone and the palette open it from the same deps, the PC\'s with the spend', /analytics: host => TaskAnalyticsPanel\.openOn\(host, analyticsDeps\)/.test(ext)
        && /TaskAnalyticsPanel\.show\(analyticsDeps\)/.test(ext) && /accountSpend: \(days: number\) => accountSpendOver\(days\)/.test(ext));
    const page = fs.readFileSync(path.join(ROOT, 'media', 'taskAnalytics.js'), 'utf8');
    ok('‼️ the PC\'s links and the export are not drawn on a phone', page.includes('html.af-phone [data-go], html.af-phone [data-texport] { display:none; }'));

    clearInterval(alive);
    console.log(`\nanalytics on a phone: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL threw: ' + (e && e.stack || e)); process.exit(1); });
