// X-456 — THE EVALS ON A PHONE. The page shows an agent's runs (evals.runs asks manage), so it
// asks manage to open and to act, like evals.add / evals.delete. A run's confirmation is asked on
// the phone and the phone is told how far it got and what it found — no PC dialog, progress toast
// or report document; a case's delete is asked there too. The A/B (it ends in the PC's report
// and may rewrite the agent's CLAUDE.md), the file picker, the guide and another page stay on the
// PC; the farm's refresh reaches the view; it never becomes the desktop's tab.
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
const pcSide = [];
const vscodeStub = {
    EventEmitter,
    Uri: { joinPath: (b, ...parts) => fileUri([b.path, ...parts].join('/')), file: fileUri, parse: fileUri },
    ViewColumn: { One: 1, Active: -1 },
    ProgressLocation: { Notification: 15 },
    env: { openExternal: u => { pcSide.push('external:' + u); return Promise.resolve(true); } },
    window: {
        createWebviewPanel: () => { throw new Error('no desktop tab for a phone'); },
        showErrorMessage: m => { pcSide.push('error:' + m); return Promise.resolve(undefined); },
        showInformationMessage: m => { pcSide.push('info:' + m); return Promise.resolve(undefined); },
        showWarningMessage: m => { pcSide.push('warn:' + m); return Promise.resolve(undefined); },
        showQuickPick: () => { pcSide.push('pick'); return Promise.resolve(undefined); },
        showInputBox: () => { pcSide.push('input'); return Promise.resolve(undefined); },
        showOpenDialog: () => { pcSide.push('open-dialog'); return Promise.resolve(undefined); },
        showTextDocument: () => { pcSide.push('editor'); return Promise.resolve(undefined); },
        withProgress: (_o, fn) => { pcSide.push('progress'); return fn({ report: () => undefined }); }
    },
    commands: { executeCommand: (...a) => { pcSide.push('command:' + a[0]); return Promise.resolve(undefined); } },
    workspace: {
        getConfiguration: () => ({ get: (_k, d) => d }), workspaceFolders: [],
        openTextDocument: o => { pcSide.push('doc'); return Promise.resolve(o); }
    }
};
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') { return vscodeStub; }
    return origLoad.apply(this, arguments);
};
const { EvalsPanel } = require(path.join(ROOT, 'out', 'panels', 'evalsPanel.js'));
const { runEvalsFor } = require(path.join(ROOT, 'out', 'panels', 'evalsRun.js'));
const { RemoteViews, messageScope } = require(path.join(ROOT, 'out', 'panels', 'remoteViews.js'));
const { remotePages } = require(path.join(ROOT, 'out', 'panels', 'remotePages.js'));
const { EvalStore } = require(path.join(ROOT, 'out', 'core', 'evals.js'));
Module._load = origLoad;
const { scopeAtLeast, requiredScope } = require(path.join(ROOT, 'out', 'remote', 'scopes.js'));

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'af-evalsphone-'));
const store = new EvalStore(path.join(TMP, 'evals.json'));
const agents = [
    { id: 'dev', name: 'developer', dir: TMP, claudeMdPath: path.join(TMP, 'CLAUDE.md') },
    { id: 'asi', name: 'asistan', dir: TMP }
];
store.addCase({ agentId: 'dev', agentName: 'developer', title: 'Türkçe cevap', input: 'Merhaba', expectation: 'Türkçe yanıt verir', source: { kind: 'manual' } });
const sets = [];
let ids = 0;
const env = {
    store, runArgs: () => '--model haiku', newId: () => 'r' + (++ids),
    runSet: async (dir, args, cases, log) => {
        sets.push({ dir, args, n: cases.length });
        log(`case 1/${cases.length}`);
        return cases.map(c => ({ caseId: c.id, title: c.title, pass: true, reason: 'ok', outputSnippet: '', durationMs: 5 }));
    }
};
const deps = {
    extensionUri: fileUri(ROOT),
    getAgents: () => agents,
    store,
    candidates: () => [],
    run: (agentId, on) => runEvalsFor(agents.find(a => a.id === agentId), env, on),
    abTest: async () => { pcSide.push('ab'); return undefined; },
    suggestions: () => [],
    runArgs: () => '--model haiku'
};
const settle = () => new Promise(r => setTimeout(r, 20));
const alive = setInterval(() => undefined, 1000);

(async () => {
    // ---- what each message needs ----
    const E = remotePages({ evals: () => undefined }).evals;
    ok('‼️ the Evals asks manage to open and to act — the runs it shows and its writes ask the same over the bridge',
        E && E.open === 'manage' && E.act === 'manage'
        && ['evals.runs', 'evals.add', 'evals.delete'].every(op => requiredScope(op) === 'manage'));
    ok('switching the agent only changes what the view shows', ['refresh', 'ev-agent'].every(t => E.looks.includes(t)));
    ok('a new case, a delete and a run are its acts', ['ev-case-save', 'ev-case-delete', 'ev-run'].every(t => messageScope(E, t) === 'manage'));
    const PC = ['ev-ab', 'af-browse', 'openGuide', 'afnav'];
    ok('‼️ the A/B, the file picker, the guide and another page never run from a phone', PC.every(t => messageScope(E, t) === null));

    // ---- the page on a phone ----
    const made = {};
    const views = new RemoteViews({
        media: fileUri(path.join(ROOT, 'media')), atLeast: scopeAtLeast, waitMs: 60,
        pages: remotePages({ evals: host => { made.e = host; EvalsPanel.openOn(host, deps); } })
    });
    const reader = { device: 'dev_r', scope: 'read' }, manager = { device: 'dev_m', scope: 'manage' };
    ok('‼️ a phone paired to read does not open it', views.open(reader, 'r1', 'evals', undefined, () => undefined) === false && !made.e);
    const toM = [];
    ok('a manage phone opens it, never as the desktop\'s tab', views.open(manager, 'e1', 'evals', undefined, m => toM.push(m)) === true
        && made.e && made.e.remote === true && EvalsPanel.current === undefined);
    const body = (await views.page('/view/evals?view=e1', manager)).body;
    ok('…from /res/', body.includes('src="/res/evals.js"'));

    const lastData = () => toM.filter(m => m.type === 'data').pop();
    views.message(manager, 'e1', { type: 'ev-agent', agentId: 'asi' });
    await settle();
    ok('switching the agent redraws this view on that agent', lastData() && lastData().data.agentId === 'asi');
    views.message(manager, 'e1', { type: 'ev-agent', agentId: 'dev' });
    await settle();

    pcSide.length = 0;
    views.message(manager, 'e1', { type: 'ev-case-save', form: { input: 'Bekleyen soruları listele', expectation: 'notices.list ile okur' } });
    await settle();
    ok('‼️ a case saved on the phone is added and said there', store.casesFor('dev').length === 2
        && toM.some(m => m.type === 'ev-msg' && m.ok === true && /Case added/.test(m.text)) && pcSide.length === 0);

    const asks = () => toM.filter(m => m.type === 'afAsk' && m.kind === 'message');
    views.message(manager, 'e1', { type: 'ev-run' });
    await settle();
    const q = asks().pop();
    ok('‼️ a run is confirmed on the phone, with what it spends', q && q.modal === true && q.buttons.join() === 'Run'
        && /Run 2 eval case\(s\) against developer/.test(q.message) && /--model haiku/.test(q.message) && pcSide.length === 0);
    views.message(manager, 'e1', { type: 'afAskAnswer', id: q && q.id });
    await settle();
    ok('…and a dismissed question runs nothing', sets.length === 0 && store.runs.length === 0);
    views.message(manager, 'e1', { type: 'ev-run' });
    await settle();
    views.message(manager, 'e1', { type: 'afAskAnswer', id: asks().pop().id, value: 0 });
    await settle();
    ok('‼️ a run from the phone replays the set and stores it', sets.length === 1 && sets[0].n === 2 && store.runs.length === 1);
    ok('‼️ the phone is told how far it got and what it found — no PC progress, report or toast',
        toM.some(m => m.type === 'ev-msg' && m.text === 'case 1/2') && toM.some(m => m.type === 'ev-msg' && /developer: 2\/2 passed/.test(m.text))
        && pcSide.length === 0);
    ok('…and the view draws the new run', lastData().data.runs.length === 1);

    const del = store.casesFor('dev')[1].id;
    views.message(manager, 'e1', { type: 'ev-case-delete', id: del });
    await settle();
    const dq = asks().pop();
    ok('‼️ a delete is asked on the phone', dq && dq.level === 'warn' && dq.modal === true && dq.buttons.join() === 'Delete' && pcSide.length === 0);
    views.message(manager, 'e1', { type: 'afAskAnswer', id: dq.id, value: 0 });
    await settle();
    ok('…and done there', store.casesFor('dev').length === 1 && !store.cases.some(c => c.id === del) && pcSide.length === 0);

    for (const t of PC) { views.message(manager, 'e1', { type: t, to: 'tasks', key: 'file', kind: 'file', form: { from: 'rule', rule: 'x', prompts: 'a' } }); }
    await settle();
    ok('‼️ nothing PC-only a phone sends opens, runs or prompts anything on the PC', pcSide.length === 0);
    const datas = () => toM.filter(m => m.type === 'data').length;
    const n0 = datas();
    EvalsPanel.refreshIfOpen();
    await settle();
    ok('the farm\'s refresh reaches the phone', datas() > n0);
    const desk = { refresh: () => undefined };
    EvalsPanel.current = desk;
    views.close(manager, 'e1');
    ok('a closed view leaves no instance behind, and the desktop\'s tab alone', EvalsPanel.phones.size === 0 && EvalsPanel.current === desk);
    EvalsPanel.current = undefined;

    // ---- the PC's own run is what it was ----
    pcSide.length = 0;
    const pcAsk = { info: (m, o, b) => { pcSide.push('confirm:' + (o && o.modal)); return Promise.resolve(b); } };
    const said = await runEvalsFor(agents[0], env, { ask: pcAsk, remote: false, progress: () => pcSide.push('phone-progress') });
    ok('‼️ on the PC a run keeps its modal, its progress toast, its report document and its summary toast',
        pcSide.join() === `confirm:true,progress,doc,editor,info:${said}` && /developer: 1\/1 passed/.test(said));

    // ---- the host's wiring and the phone's page ----
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('the phone opens the Evals from the palette\'s own deps', /evals: host => EvalsPanel\.openOn\(host, evalsDeps\)/.test(ext));
    ok('the palette and the phone run through the one door', /runEvalsFor\(agent, evalRunEnv, on\)/.test(ext));
    const page = fs.readFileSync(path.join(ROOT, 'media', 'evals.js'), 'utf8');
    ok('‼️ the A/B button is not drawn on a phone', page.includes('html.af-phone #abtest { display:none; }'));
    ok('a case is a card on a phone, its title the lead', page.includes('<table class="grid" data-afcards>') && page.includes('<td class="main" data-lead>')
        && /<tr data-afcardhead><th>Case<\/th>/.test(page) && page.includes('html.af-phone td.main .small { font-weight:400; }'));

    clearInterval(alive);
    fs.rmSync(TMP, { recursive: true, force: true });
    console.log(`\nevals on a phone: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL threw: ' + (e && e.stack || e)); process.exit(1); });
