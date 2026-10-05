// X-456 — THE SOUND PAGE ON A PHONE. It reads at read, as alerts.status does; every
// switch, tone, voice and rehearsal is manage, as the alerts.* ops are. A new sound's
// file picker and the sounds folder never run from a phone — on this page, on the
// Console's and on the Timeline's sound panels alike; a channel's setting stays on the
// PC; the farm's refresh reaches the view; it never becomes the desktop's tab; its
// tables are cards on a phone and the picker and the folder are not drawn there.
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
    ConfigurationTarget: { Global: 1 },
    env: { openExternal: u => { pcSide.push('external:' + u); return Promise.resolve(true); } },
    window: {
        createWebviewPanel: () => { throw new Error('no desktop tab for a phone'); },
        showErrorMessage: m => { pcSide.push('error:' + m); return Promise.resolve(undefined); },
        showInformationMessage: m => { pcSide.push('info:' + m); return Promise.resolve(undefined); },
        showWarningMessage: m => { pcSide.push('warn:' + m); return Promise.resolve(undefined); },
        showOpenDialog: () => { pcSide.push('open-dialog'); return Promise.resolve(undefined); }
    },
    commands: { executeCommand: (...a) => { pcSide.push('command:' + a[0]); return Promise.resolve(undefined); } },
    workspace: {
        getConfiguration: () => ({ get: (_k, d) => d, update: async () => { pcSide.push('config'); } }), workspaceFolders: [],
        onDidChangeConfiguration: new EventEmitter().event
    }
};
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') { return vscodeStub; }
    return origLoad.apply(this, arguments);
};
const { SoundPanel } = require(path.join(ROOT, 'out', 'panels', 'soundPanel.js'));
const { RemoteViews, messageScope } = require(path.join(ROOT, 'out', 'panels', 'remoteViews.js'));
const { remotePages } = require(path.join(ROOT, 'out', 'panels', 'remotePages.js'));
Module._load = origLoad;
const { scopeAtLeast } = require(path.join(ROOT, 'out', 'remote', 'index.js'));

const calls = [];
const deps = {
    extensionUri: uri('/ext'), notify: () => ({}), alerts: () => null, sessions: () => [], agents: () => [], channels: () => [],
    alertsSetOn: async (e, on) => { calls.push(`on:${e}:${on}`); },
    alertsVoiceAdd: async () => { calls.push('add'); },
    alertsOpenFolder: async () => { calls.push('folder'); },
    alertsLoadSpeechVoices: async () => { calls.push('voices'); },
    alertsSessionView: sid => { calls.push('view:' + sid); return {}; },
    alertsSetAgentVoice: async () => { calls.push('agent-voice'); }
};
const settle = () => new Promise(r => setTimeout(r, 15));
const alive = setInterval(() => undefined, 1000);

(async () => {
    // ---- what each message needs ----
    const pages = remotePages({ sound: () => undefined });
    const S = pages.sound;
    ok('the Sound page reads at read and acts at manage, as the alerts.* ops do', S && S.open === 'read' && S.act === 'manage');
    ok('the page, the machine\'s voices (asked on opening) and a session\'s sound panel are its looks',
        ['refresh', 'alertSpeakVoices', 'alertSessionOpen'].every(t => messageScope(S, t) === 'read'));
    ok('every switch, tone, voice, rename, removal, ▶ and rehearsal is manage',
        ['alertOn', 'alertVoice', 'alertPlay', 'alertVoiceRename', 'alertVoiceRemove', 'alertMute', 'alertQuiet', 'alertNudge',
            'alertSpeak', 'alertSpeakTest', 'alertNotify', 'alertToneVolume', 'alertSessionApply', 'alertSessionTest',
            'alertReadStop', 'alertAgentVoice', 'alertUnmuteSession'].every(t => messageScope(S, t) === 'manage'));
    const PC = ['alertVoiceAdd', 'alertFolder', 'openSettings', 'afnav'];
    ok('‼️ a new sound\'s file picker, the sounds folder and a channel\'s setting never run from a phone', PC.every(t => messageScope(S, t) === null));
    ok('‼️ …nor the picker and the folder from the Console\'s and the Timeline\'s sound panels',
        ['alertVoiceAdd', 'alertFolder'].every(t => messageScope(pages.console, t) === null && messageScope(pages.timeline, t) === null));

    // ---- the page on a phone ----
    const made = {};
    const views = new RemoteViews({
        media: uri('/ext/media'), atLeast: scopeAtLeast, waitMs: 60,
        pages: remotePages({ sound: host => { made.s = host; SoundPanel.openOn(host, deps); } })
    });
    const reader = { device: 'dev_r', scope: 'read' }, manager = { device: 'dev_m', scope: 'manage' }, admin = { device: 'dev_a', scope: 'admin' };
    const toR = [];
    ok('a phone paired to read opens it, never as the desktop\'s tab', views.open(reader, 'r1', 'sound', undefined, m => toR.push(m)) === true
        && made.s && made.s.remote === true && SoundPanel.current === undefined);
    ok('…from /res/', (await views.page('/view/sound?view=r1', reader)).body.includes('src="/res/sound.js"'));
    views.message(reader, 'r1', { type: 'alertSpeakVoices' });
    views.message(reader, 'r1', { type: 'alertSessionOpen', sessionId: 's1' });
    await settle();
    ok('a reader\'s phone asks for the voices and opens a session\'s panel', calls.includes('voices') && calls.includes('view:s1'));
    const refused = views.message(reader, 'r1', { type: 'alertOn', event: 'question', on: true });
    await settle();
    ok('‼️ a reader cannot switch an alert', refused && refused.ran === false && !calls.some(c => c.startsWith('on:')));
    views.open(manager, 'm1', 'sound', undefined, () => undefined);
    views.message(manager, 'm1', { type: 'alertOn', event: 'question', on: true });
    views.message(manager, 'm1', { type: 'alertAgentVoice', agent: 'developer', event: 'question', voice: 'x' });
    await settle();
    ok('a manage phone switches an alert and an agent\'s tone', calls.includes('on:question:true') && calls.includes('agent-voice'));
    calls.length = 0; pcSide.length = 0;
    views.open(admin, 'a1', 'sound', undefined, () => undefined);
    for (const t of PC) { views.message(admin, 'a1', { type: t, focus: 'agentFarm.remote.listen', to: 'settings' }); }
    await settle();
    ok('‼️ nothing PC-only a phone sends picks, opens or steers anything on the PC, not even an admin\'s', calls.length === 0 && pcSide.length === 0);
    const datas = () => toR.filter(m => m.type === 'data').length;
    const n0 = datas();
    SoundPanel.refreshIfOpen();
    await settle();
    ok('the farm\'s refresh reaches the phone', datas() === n0 + 1);
    for (const [c, v] of [[reader, 'r1'], [manager, 'm1'], [admin, 'a1']]) { views.close(c, v); }
    ok('a closed view leaves no instance behind', SoundPanel.phones.size === 0);

    // ---- the host's wiring and the phone's page ----
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('the phone opens the Sound page from the palette\'s own deps', /sound: host => SoundPanel\.openOn\(host, soundPageDeps\)/.test(ext));
    const media = n => fs.readFileSync(path.join(ROOT, 'media', n), 'utf8');
    const card = media('afSoundCard.js');
    ok('‼️ an event is a card on a phone, its name leading and every switch under its column\'s name',
        /<table class="settbl alerttbl" data-afcards>\s*<thead><tr data-afcardhead>/.test(card)
        && /<tr data-afcard>\s*<td data-lead>\$\{name\}<\/td>/.test(card)
        && ['Ring', 'Tone', 'Say who', 'Notification'].every(l => card.includes(`data-label="${l}"`))
        && /<tr class="alertgrp" data-afcardmore>/.test(card));
    const ses = media('afSoundSessions.js');
    ok('…a live session too', /<table class="settbl sstbl" data-afcards><thead><tr data-afcardhead>/.test(ses)
        && /<tr data-afcard \$\{ctx\}>\s*<td data-lead>/.test(ses) && /html\.af-phone \.sstbl td \{ white-space:normal;/.test(ses));
    const ag = media('afSoundAgents.js');
    ok('…and an agent, each tone under its event\'s name', /<table class="settbl sstbl sagtbl" data-afcards><thead><tr data-afcardhead>/.test(ag)
        && /<tr data-afcard><td data-lead>/.test(ag) && /<td data-label="\$\{C\.esc\(evName\(t\.event\)\)\}">/.test(ag));
    const page = media('sound.js');
    ok('‼️ the file picker and the folder are not drawn on a phone; a tone takes its card\'s whole line',
        /html\.af-phone #alertadd, html\.af-phone #alertfolder \{ display:none; \}/.test(page)
        && /html\.af-phone \.alerttbl td\.alerttone \{ flex:1 1 100%; \}/.test(page));
    const voice = media('afSoundVoice.js');
    ok('the voice rows stack and a session\'s own voice wraps on a phone',
        /html\.af-phone \.svrow \{ grid-template-columns:minmax\(0, 1fr\);/.test(voice)
        && /html\.af-phone \.svreader \{ white-space:normal;/.test(voice)
        && /html\.af-phone \.svline #alertspeakvoice \{ flex:1 1 100%; min-width:0;/.test(voice));

    clearInterval(alive);
    console.log(`\nsound on a phone: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL threw: ' + (e && e.stack || e)); process.exit(1); });
