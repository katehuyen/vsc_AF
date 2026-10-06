// X-456 — THE LIVE TIMELINE ON A PHONE. The same TimelinePanel, drawn on a
// phone's view: it loads from /res/, a read device reads it and a long range's
// history, a manage device interrupts and clears a session and sets its alerts
// (a refusal and a rename asked ON THE PHONE), nothing a phone sends opens a
// terminal, ends or kills a session behind a PC modal, installs the hooks or
// opens a tab on the PC, the farm's refresh reaches the phone, and it never
// becomes the desktop's tab.
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
const commands = [];
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
        showQuickPick: () => { pcSide.push('pick'); return Promise.resolve(undefined); },
        showInputBox: () => { pcSide.push('input'); return Promise.resolve(undefined); }
    },
    commands: { executeCommand: (...a) => { commands.push(a); pcSide.push('command:' + a[0]); return Promise.resolve(undefined); } },
    workspace: {
        getConfiguration: () => ({ get: (_k, d) => d, update: async () => { } }), workspaceFolders: [],
        onDidChangeConfiguration: new EventEmitter().event
    }
};
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') { return vscodeStub; }
    return origLoad.apply(this, arguments);
};
const { TimelinePanel } = require(path.join(ROOT, 'out', 'panels', 'timeline.js'));
const { RemoteViews, messageScope } = require(path.join(ROOT, 'out', 'panels', 'remoteViews.js'));
const { remotePages } = require(path.join(ROOT, 'out', 'panels', 'remotePages.js'));
Module._load = origLoad;
const { scopeAtLeast } = require(path.join(ROOT, 'out', 'remote', 'index.js'));

const SID = '407c78cb-2f1a-4d55-9e10-1b2c3d4e5f60';
const liveSession = {
    sessionId: SID, agentName: 'tarlaci', status: 'running', startedAt: Date.now() - 600000, lastEventTs: Date.now(),
    prompts: 2, toolCalls: 5, compactions: 0, subagentStops: 0, errors: 0, cwd: 'D:/agents/tarlaci', lastPrompt: 'tarlayı sula'
};
const liveChanged = new EventEmitter(), tasksChanged = new EventEmitter(), indexChanged = new EventEmitter();
const alertCalls = [];
let alertAnswer = { ok: true };
const deps = {
    extensionUri: uri('/ext'),
    live: {
        sessions: () => [liveSession], events: () => [], labelOf: s => s.agentName, listenerState: 'listening', activePort: 8123,
        density: () => ({ lanes: [], totalEvents: 0, buckets: 0 }), onDidUpdate: liveChanged.event
    },
    tasks: { onDidChange: tasksChanged.event, workflowRuns: () => [] },
    index: { allWithExternal: () => [], onDidUpdate: indexChanged.event },
    liveOwners: () => [], ownersKnown: () => true, hostedIds: () => [], stuckMs: () => 240000,
    getSessionAlerts: () => ({}),
    setSessionAlert: (sessionId, action, enabled) => { alertCalls.push(`${sessionId}:${action}:${enabled}`); return alertAnswer; },
    resolveSessionVoice: () => ({ voice: 'chime', label: 'Chime', origin: 'default', originLabel: 'default', playable: true, chosen: '', skipped: [] }),
    alertGate: () => ({ muted: false, quiet: { configured: false, inside: false, from: '', to: '' }, mutedSessions: [] }),
    testSessionAlert: async () => ({ ok: true }),
    // the session panel's ▶ Read last answer reaches the reader through the sound host (U-200, U-209)
    sound: () => ({ reader: { conversation: ref => { asked.push(ref); return { error: 'no conversation ' + ref }; } } })
};
const asked = [];
const settle = () => new Promise(r => setTimeout(r, 10));
const alive = setInterval(() => undefined, 1000);

(async () => {
    // ---- what each message needs ----
    const spec = remotePages({ timeline: () => undefined }).timeline;
    ok('the Live Timeline is a phone page; the page and a long range\'s history are looks',
        !!spec && spec.open === 'read' && ['refresh', 'history'].every(t => messageScope(spec, t) === 'read'));
    const MANAGE = ['interruptSession', 'dismissSession', 'clearGone', 'renameSession', 'setTurnAlert', 'testTurnAlert',
        'alertSessionOpen', 'alertSessionApply', 'alertSessionTest', 'alertPlay', 'alertReadStop'];
    ok('interrupting and clearing a session, renaming it, its alerts, their test and its sound panel are manage',
        MANAGE.every(t => messageScope(spec, t) === 'manage'));
    const PC = ['openSession', 'focusTerminal', 'endSession', 'forceKillSession', 'installHooks', 'workflowLive',
        'revealFolder', 'openDashboard', 'openGuide', 'afnav'];
    ok('‼️ a terminal, End and Force kill (a PC modal), the hooks install, a folder, a workflow\'s settings, another tab and the guide never run from a phone',
        PC.every(t => messageScope(spec, t) === null));

    // ---- the page on a phone ----
    let made;
    const views = new RemoteViews({
        media: uri('/ext/media'), atLeast: scopeAtLeast, waitMs: 60,
        pages: remotePages({ timeline: host => { made = host; TimelinePanel.openOn(host, deps); } })
    });
    const reader = { device: 'dev_r', scope: 'read' };
    const toReader = [];
    ok('the Live Timeline opens on a phone', views.open(reader, 'r1', 'timeline', undefined, m => toReader.push(m)) === true);
    ok('‼️ a phone\'s view never becomes the desktop\'s tab', TimelinePanel.current === undefined && made && made.remote === true);
    const page = (await views.page('/view/timeline?view=r1', reader)).body;
    ok('its page and script load from /res/', page.includes('src="/res/timeline.js"') && page.includes('href="/res/common.css"') && !/vscode-webview:|file:\/\//.test(page));
    ok('…with the farm\'s live session in it', page.includes('tarlaci') && page.includes(SID));

    views.message(reader, 'r1', { type: 'history', hours: 72 });
    views.message(reader, 'r1', { type: 'refresh' });
    await settle();
    ok('a read device reads a long range\'s history and the page', toReader.some(m => m.type === 'history' && m.hours === 72)
        && toReader.some(m => m.type === 'data' && m.data.sessions.some(s => s.sessionId === SID)));
    commands.length = 0; pcSide.length = 0;
    views.message(reader, 'r1', { type: 'interruptSession', sessionId: SID, agentName: 'tarlaci' });
    views.message(reader, 'r1', { type: 'setTurnAlert', sessionId: SID, action: 'sound', enabled: true });
    await settle();
    ok('‼️ a read device changes nothing', commands.length === 0 && alertCalls.length === 0);
    views.message(reader, 'r1', { type: 'readAloud', sessionId: SID, pick: {}, surface: 'soundPanel' });
    await settle();
    ok('‼️ the session panel\'s ▶ never makes the PC speak from a phone', asked.length === 0);
    views.message(reader, 'r1', { type: 'readFor', token: 'p1', sessionId: SID, pick: {}, surface: 'soundPanel' });
    await settle();
    ok('…its readFor is answered for the phone\'s own voice, under its token', asked.includes(SID)
        && toReader.some(m => m.type === 'readRefused' && m.token === 'p1' && /no conversation/.test(m.error)));
    views.close(reader, 'r1');

    const manager = { device: 'dev_m', scope: 'manage' };
    const toM = [];
    views.open(manager, 'm1', 'timeline', undefined, m => toM.push(m));
    await views.page('/view/timeline?view=m1', manager);
    commands.length = 0;
    views.message(manager, 'm1', { type: 'interruptSession', sessionId: SID, agentName: 'tarlaci' });
    views.message(manager, 'm1', { type: 'dismissSession', sessionId: SID, agentName: 'tarlaci' });
    await settle();
    ok('a manage device interrupts and clears a session, by its id', commands.some(c => c[0] === 'agentfarm.interruptSession' && c[1].sessionId === SID)
        && commands.some(c => c[0] === 'agentfarm.dismissSession' && c[1].sessionId === SID));

    commands.length = 0;
    views.message(manager, 'm1', { type: 'renameSession', sessionId: SID, title: 'tarla' });
    await settle();
    const rename = commands.find(c => c[0] === 'agentfarm.renameSession');
    ok('‼️ a rename asks its name ON THE PHONE (the page\'s own host, not the PC\'s window)', !!rename && rename[1].ask === made.ask && made.remote === true);

    pcSide.length = 0; alertAnswer = { ok: false, error: 'that session is not watched' };
    views.message(manager, 'm1', { type: 'setTurnAlert', sessionId: SID, action: 'sound', enabled: true });
    await settle();
    ok('a turn alert is set for its one session and action', alertCalls.includes(`${SID}:sound:true`));
    ok('‼️ its refusal is told ON THE PHONE, never on the PC',
        toM.some(m => m.type === 'afAsk' && /refused — that session is not watched/.test(String(m.message))) && !pcSide.some(p => p.startsWith('warn:')));
    alertAnswer = { ok: true };

    pcSide.length = 0;
    for (const t of PC) { views.message(manager, 'm1', { type: t, sessionId: SID, agentName: 'tarlaci', file: 'C:/x.jsonl', cwd: 'D:/x', runId: 'r', anchor: 'canli-gozlem', to: 'dashboard' }); }
    await settle();
    ok('‼️ nothing a phone sends opens a terminal, a PC modal, the hooks install, a folder or a tab on the PC', pcSide.length === 0);

    const before = toM.filter(m => m.type === 'data').length;
    TimelinePanel.refreshIfOpen();
    await settle();
    ok('the farm\'s refresh reaches the phone\'s view while it is open', toM.filter(m => m.type === 'data').length === before + 1);
    views.close(manager, 'm1');
    const after = toM.length;
    TimelinePanel.refreshIfOpen();
    await settle();
    ok('…and nothing after it closed: a closed view leaves no instance behind to refresh', toM.length === after && TimelinePanel.phones.size === 0);

    // ---- the host's wiring, read off the source ----
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('the phone and the palette open the page from the same deps',
        /timeline: host => TimelinePanel\.openOn\(host, timelinePageDeps\(\)\)/.test(ext) && /TimelinePanel\.show\(timelinePageDeps\(\)\)/.test(ext));
    const panel = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'timeline.ts'), 'utf8');
    ok('the desktop tab is made through desktopHost(), and a phone view closing leaves it alone',
        /desktopHost\(\{ viewType: 'agentfarm\.timeline'/.test(panel) && /if \(TimelinePanel\.current === this\) \{ TimelinePanel\.current = undefined; \}/.test(panel));

    // ---- on a phone: charts at their own size, nothing that would act on the PC ----
    const js = fs.readFileSync(path.join(ROOT, 'media', 'timeline.js'), 'utf8');
    ok('‼️ a chart keeps the size it is drawn at and scrolls sideways in its box (shrunk to a third it could not be read)',
        /html\.af-phone \.chartbox \{ overflow-x:auto; \}/.test(js)
        && /html\.af-phone \.chartbox > svg, html\.af-phone \.chartbox > \.lanes-wrap \{ min-width:900px; \}/.test(js)
        && /const W = 900, labelW = 100, rowH = 50/.test(js));
    ok('the terminal, End, Force kill, the hooks install, a workflow\'s live settings and the guide are not drawn on the phone',
        /html\.af-phone \.af-tipw:has\(> \[data-focusterm\]\)/.test(js) && /html\.af-phone \.af-tipw:has\(> \[data-endsess\]\)/.test(js)
        && /html\.af-phone \.af-tipw:has\(> \[data-killsess\]\)/.test(js)
        && /html\.af-phone #install, html\.af-phone \[data-guide\],\s*html\.af-phone \[data-svlive\] \{ display:none; \}/.test(js));

    clearInterval(alive);
    console.log(`\ntimeline on a phone: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL threw: ' + (e && e.stack || e)); process.exit(1); });
