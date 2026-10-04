// X-466 — THE MISSIONS PAGE ON A PHONE. The same MissionsPanel, drawn on a phone's
// view: a read device reads the runs, a draft's resolved launch, a sentry draft's
// probe and a step's output tail; an answer device answers a question and settles
// an approval; a manage device starts, steers, pauses, cancels, runs again and
// deletes a mission and switches the sentry — every confirmation asked ON THE
// PHONE. The folder picker, a file, a run's Sessions page, an agent's page or
// Console, the guide and a link never open anything on the PC from a phone, and
// the desktop keeps its one tab.
'use strict';
const path = require('path');
const fs = require('fs');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const src = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

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
const tabs = [];
const vscodeStub = {
    EventEmitter,
    Uri: { joinPath: (b, ...parts) => uri([b.path, ...parts].join('/')), file: uri, parse: uri },
    ViewColumn: { One: 1, Active: -1 },
    env: { clipboard: { writeText: t => { pcSide.push('clipboard:' + t); return Promise.resolve(); } } },
    window: {
        createWebviewPanel: (viewType) => {
            const disposed = new EventEmitter(), inbox = new EventEmitter(), state = new EventEmitter();
            const panel = {
                viewType, title: 'Missions', visible: true, revealed: 0, inbox,
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
        showErrorMessage: m => { pcSide.push('error:' + m); return Promise.resolve(undefined); },
        showInformationMessage: m => { pcSide.push('info:' + m); return Promise.resolve(undefined); },
        showWarningMessage: m => { pcSide.push('warn:' + m); return Promise.resolve(undefined); },
        showOpenDialog: () => { pcSide.push('openDialog'); return Promise.resolve(undefined); }
    },
    commands: { executeCommand: (...a) => { pcSide.push('command:' + a[0]); return Promise.resolve(undefined); } },
    workspace: { getConfiguration: () => ({ get: (_k, d) => d, update: async () => { } }), workspaceFolders: [] }
};
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') { return vscodeStub; }
    return origLoad.apply(this, arguments);
};
const { MissionsPanel } = require(path.join(ROOT, 'out', 'panels', 'missionsPanel.js'));
const { RemoteViews, messageScope } = require(path.join(ROOT, 'out', 'panels', 'remoteViews.js'));
const { remotePages } = require(path.join(ROOT, 'out', 'panels', 'remotePages.js'));
Module._load = origLoad;
const { scopeAtLeast } = require(path.join(ROOT, 'out', 'remote', 'index.js'));

// ---------- the rule ----------
const LOOKS = ['refresh', 'preview', 'sentryProbe', 'tail'];
const ANSWERS = ['answer', 'approve', 'reject'];
const MANAGE = ['create', 'control', 'sentryStart', 'sentryControl', 'guide', 'rerun', 'delete'];
const PC_ONLY = ['pickFolder', 'openFile', 'missionSessions', 'openSession', 'openAgent', 'consoleAgent', 'openGuide', 'afnav'];
const none = () => undefined;
const rule = remotePages({ needs: none, console: none, now: none, sessions: none, tasks: none, session: () => true,
    notices: none, dashboard: none, missions: none, chains: none }).missions;
ok('the phone has a Missions page, opened at read and acted on at manage', !!rule && rule.open === 'read' && rule.act === 'manage');
ok('the runs, a draft\'s resolution, a sentry probe and an output tail are looks', LOOKS.every(t => messageScope(rule, t) === 'read'));
ok('a question, an approval and a rejection are answers', ANSWERS.every(t => messageScope(rule, t) === 'answer'));
ok('starting, steering, pausing and cancelling, running again, deleting and the sentry\'s switch are manage',
    MANAGE.every(t => messageScope(rule, t) === 'manage'));
ok('the folder picker, a file, the Sessions page, an agent\'s page or Console, the guide and a link stay on the PC',
    PC_ONLY.every(t => messageScope(rule, t) === null));
const handled = [...src('src/panels/missionsPanel.ts').matchAll(/case '([\w-]+)':/g)].map(m => m[1]);
const sorted = [...LOOKS, ...ANSWERS, ...MANAGE, ...PC_ONLY];
const unsorted = handled.filter(t => !sorted.includes(t));
ok(`‼️ every message the page's panel answers is placed on purpose — a new one cannot slip in as manage (${unsorted.join(' ') || 'none'})`,
    handled.length >= 20 && unsorted.length === 0 && sorted.every(t => handled.includes(t)));

// ---------- the page on phones ----------
const changed = new EventEmitter();
const calls = [];
const asks = [];
const deps = {
    extensionUri: uri('/ext'),
    data: () => ({ specs: [], runs: [], agents: [], defaults: {} }),
    create: input => { calls.push('create:' + (input && input.goal)); return input && input.goal ? undefined : 'a mission needs a goal'; },
    preview: () => ({ engine: 'claude' }),
    control: (action, runId) => calls.push('control:' + action + ':' + runId),
    rerun: (runId, ask) => { calls.push('rerun:' + runId); asks.push(ask); },
    remove: (runId, ask) => { calls.push('delete:' + runId); asks.push(ask); },
    answer: (runId, text) => calls.push('answer:' + runId + ':' + text),
    guide: (runId) => { calls.push('guide:' + runId); return { note: 'lands next round' }; },
    settleApproval: (runId, yes) => calls.push((yes ? 'approve:' : 'reject:') + runId),
    sentryStart: () => { calls.push('sentryStart'); return undefined; },
    sentryProbe: () => ({ results: [] }),
    sentryControl: action => calls.push('sentry:' + action),
    pickFolder: () => { calls.push('pickFolder'); return Promise.resolve('C:/x'); },
    readTail: () => ({ text: 'tail', size: 4 }),
    onDidChange: changed.event
};
const settle = () => new Promise(r => setTimeout(r, 5));
const alive = setInterval(() => undefined, 1000);

(async () => {
    const views = new RemoteViews({
        media: uri('/ext/media'), atLeast: scopeAtLeast, waitMs: 60,
        pages: remotePages({ needs: none, console: none, now: none, sessions: none, tasks: none, session: () => false,
            notices: none, dashboard: none, chains: none, missions: host => MissionsPanel.openOn(host, deps) })
    });
    const reader = { device: 'dev_r', scope: 'read' }, answerer = { device: 'dev_a', scope: 'answer' }, manager = { device: 'dev_m', scope: 'manage' };
    const toR = [], toA = [], toM = [];
    ok('the Missions page opens on a phone', views.open(reader, 'v1', 'missions', undefined, m => toR.push(m)) === true);
    views.open(answerer, 'v2', 'missions', undefined, m => toA.push(m));
    views.open(manager, 'v3', 'missions', undefined, m => toM.push(m));
    const page = (await views.page('/view/missions?view=v1', reader)).body;
    ok('its page loads from /res/, its own script too', page.includes('src="/res/missions.js"') && !/vscode-webview:|file:\/\//.test(page));
    ok('no desktop tab was made for a phone', tabs.length === 0);

    views.message(reader, 'v1', { type: 'refresh' });
    views.message(reader, 'v1', { type: 'preview', seq: 7, input: {} });
    views.message(reader, 'v1', { type: 'tail', file: 'C:/out/a.md' });
    views.message(reader, 'v1', { type: 'sentryProbe', seq: 3, conditions: [] });
    await settle();
    ok('a read device reads the runs, a draft\'s resolution (its own token back), a sentry probe and an output tail',
        toR.some(m => m.type === 'data') && toR.some(m => m.type === 'preview' && m.seq === 7)
        && toR.some(m => m.type === 'tail' && m.text === 'tail') && toR.some(m => m.type === 'sentryProbe' && m.seq === 3));
    for (const m of [{ type: 'create', input: { goal: 'g' } }, { type: 'answer', runId: 'r1', text: 'yes' },
        { type: 'approve', runId: 'r1' }, { type: 'control', action: 'pause', runId: 'r1' }]) {
        views.message(reader, 'v1', m);
    }
    await settle();
    ok('a read device can neither answer nor manage', calls.length === 0);

    views.message(answerer, 'v2', { type: 'answer', runId: 'r1', text: 'Postgres' });
    views.message(answerer, 'v2', { type: 'approve', runId: 'r1' });
    views.message(answerer, 'v2', { type: 'reject', runId: 'r2' });
    views.message(answerer, 'v2', { type: 'create', input: { goal: 'g' } });
    views.message(answerer, 'v2', { type: 'guide', runId: 'r1', text: 'faster' });
    await settle();
    ok('an answer device answers a question and settles approvals, and starts or steers nothing',
        calls.join() === 'answer:r1:Postgres,approve:r1,reject:r2');

    calls.length = 0;
    views.message(manager, 'v3', { type: 'create', input: { goal: 'ship it' } });
    views.message(manager, 'v3', { type: 'guide', runId: 'r1', text: 'faster' });
    views.message(manager, 'v3', { type: 'control', action: 'pause', runId: 'r1' });
    views.message(manager, 'v3', { type: 'sentryControl', action: 'pause' });
    await settle();
    ok('a manage device starts, steers and pauses a mission and pauses the sentry',
        calls.join() === 'create:ship it,guide:r1,control:pause:r1,sentry:pause'
        && toM.some(m => m.type === 'created') && toM.some(m => m.type === 'guided' && m.note === 'lands next round'));

    calls.length = 0;
    views.message(manager, 'v3', { type: 'control', action: 'cancel', runId: 'r1' });
    await settle();
    const q = toM.find(m => m.type === 'afAsk' && /Cancel this mission\?/.test(String(m.message)));
    ok('‼️ cancelling asks ON THE PHONE, not on the PC', !!q && q.modal === true && pcSide.length === 0 && calls.length === 0);
    views.message(manager, 'v3', { type: 'afAskAnswer', id: q && q.id, value: 0 });
    await settle();
    ok('and the phone\'s yes cancels it', calls.join() === 'control:cancel:r1');

    calls.length = 0;
    views.message(manager, 'v3', { type: 'sentryControl', action: 'stop' });
    await settle();
    ok('stopping the sentry asks on the phone too', toM.some(m => m.type === 'afAsk' && /Stop the sentry campaign\?/.test(String(m.message)))
        && pcSide.length === 0 && calls.length === 0);

    views.message(manager, 'v3', { type: 'rerun', runId: 'r9' });
    views.message(manager, 'v3', { type: 'delete', runId: 'r9' });
    await settle();
    ok('running again and deleting are handed the PHONE\'s asker', calls.join() === 'rerun:r9,delete:r9' && asks.length === 2 && asks.every(a => a && typeof a.warn === 'function'));
    const n0 = toM.length;
    void asks[0].warn('Run mission "x" again?', { modal: true }, 'Run again');
    await settle();
    ok('…which asks on the phone and opens nothing on the PC', toM.length === n0 + 1 && toM[n0].type === 'afAsk' && pcSide.length === 0);

    calls.length = 0;
    for (const m of [{ type: 'pickFolder' }, { type: 'openFile', file: 'C:/out/a.md' }, { type: 'missionSessions', runId: 'r1' },
        { type: 'openSession', file: 'C:/x.jsonl' }, { type: 'openAgent', agentId: 'a1' }, { type: 'consoleAgent', agentId: 'a1' },
        { type: 'openGuide', anchor: 'missions' }, { type: 'afnav', to: 'sessions' }]) {
        views.message({ device: 'dev_m', scope: 'admin' }, 'v3', m);
    }
    await settle();
    ok('‼️ nothing a phone sends opens a picker, a file, a page, an agent, a Console or the guide on the PC', pcSide.length === 0 && calls.length === 0);

    MissionsPanel.show(deps);
    MissionsPanel.show(deps);
    ok('the desktop still has its one Missions tab beside the phones', tabs.length === 1 && tabs[0].revealed === 1 && tabs[0].viewType === 'agentfarm.missions');
    tabs[0].inbox.fire({ type: 'control', action: 'cancel', runId: 'r1' });
    await settle();
    ok('on the PC cancelling still asks on the PC', pcSide.length === 1 && /^warn:Cancel this mission\?/.test(pcSide[0]));
    tabs[0].inbox.fire({ type: 'rerun', runId: 'r5' });
    await settle();
    ok('and the PC\'s run-again is handed the PC\'s asker', calls.pop() === 'rerun:r5' && asks.length === 3 && asks[2] && asks[2] !== asks[0]);
    const before = toR.length;
    changed.fire();
    await settle();
    ok('a change reaches every open phone', toR.length === before + 1 && toR[toR.length - 1].type === 'data');
    views.close(manager, 'v3'); views.close(answerer, 'v2'); views.close(reader, 'v1');
    MissionsPanel.show(deps);
    ok('closing the phones\' views leaves the desktop tab alone', tabs.length === 1 && tabs[0].revealed === 2);
    const n1 = toR.length;
    MissionsPanel.refreshIfOpen();
    await settle();
    ok('a closed phone view is refreshed no more', toR.length === n1);
    ok('‼️ and the page lets go of it — a phone opening and closing the page all day leaks nothing', MissionsPanel.phones.size === 0);

    // ---------- the host ----------
    const ext = src('src/extension.ts');
    ok('the extension makes the page for a phone from the desktop\'s own deps',
        /missions: host => MissionsPanel\.openOn\(host, missionsPanelDeps\),/.test(ext));
    const cmd = (id) => { const i = ext.indexOf(`registerCommand('${id}'`); return ext.slice(i, ext.indexOf('}),', i)); };
    ok('‼️ run again and delete confirm through the asker they are handed, the desktop only when none',
        ['agentfarm.missionRerun', 'agentfarm.missionDelete'].every(id => /node\?: MissionNode & \{ ask\?: PanelAsk \}/.test(cmd(id))
            && /await \(node\?\.ask \?\? desktopAsk\(\)\)\.warn\(/.test(cmd(id)) && !/vscode\.window\.show/.test(cmd(id))));
    ok('the page\'s deps pass the view\'s asker on',
        /executeCommand\('agentfarm\.missionRerun', \{ kind: 'run', run, ask \}\)/.test(ext)
        && /executeCommand\('agentfarm\.missionDelete', \{ kind: 'run', run, ask \}\)/.test(ext));

    clearInterval(alive);
    console.log(`\nmissions on a phone: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL threw: ' + (e && e.stack || e)); process.exit(1); });
