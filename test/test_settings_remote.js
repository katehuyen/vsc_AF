// X-456 — THE SETTINGS PAGE ON A PHONE. The settings namespace is admin even to look,
// so only an admin phone opens it. There the phone's own reach and port are never
// written (a row, its reset, the Flow & Content card, a preset or a setting set alike —
// a new one would cut the phone off); Claude Code's raw settings.json never travels (its
// env block can hold a key); every picker, editor, terminal, folder, link and the vault
// stay on the PC; the farm's refresh reaches the view; it never becomes the desktop's tab.
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
const uri = p => ({ path: p, fsPath: p, toString: () => 'file://' + p });
const pcSide = [];
const writes = [];
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
        showOpenDialog: () => { pcSide.push('open-dialog'); return Promise.resolve(undefined); },
        showSaveDialog: () => { pcSide.push('save-dialog'); return Promise.resolve(undefined); },
        showTextDocument: () => { pcSide.push('editor'); return Promise.resolve(undefined); }
    },
    commands: { executeCommand: (...a) => { pcSide.push('command:' + a[0]); return Promise.resolve(undefined); } },
    workspace: {
        getConfiguration: () => ({ get: (_k, d) => d, update: async (k, v) => { writes.push(`${k}=${JSON.stringify(v)}`); } }),
        workspaceFolders: [], onDidChangeConfiguration: new EventEmitter().event
    }
};
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') { return vscodeStub; }
    return origLoad.apply(this, arguments);
};
const { FarmSettingsPanel } = require(path.join(ROOT, 'out', 'panels', 'settingsPanel.js'));
const { phoneFlex, phoneLocked, PHONE_LOCKED_SETTINGS } = require(path.join(ROOT, 'out', 'panels', 'settingsPhone.js'));
const { RemoteViews, messageScope } = require(path.join(ROOT, 'out', 'panels', 'remoteViews.js'));
const { remotePages } = require(path.join(ROOT, 'out', 'panels', 'remotePages.js'));
Module._load = origLoad;
const { scopeAtLeast } = require(path.join(ROOT, 'out', 'remote', 'index.js'));

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'af-settingsphone-'));
const CLAUDE = path.join(HOME, 'settings.json');
fs.writeFileSync(CLAUDE, JSON.stringify({ model: 'opus', env: { ANTHROPIC_API_KEY: 'sk-ant-SECRET-VALUE' } }), 'utf8');
const calls = [];
const deps = {
    extensionUri: uri('/ext'),
    schema: () => ({
        'agentFarm.remote.listen': { type: 'string', enum: ['off', 'lan', 'tailscale'] },
        'agentFarm.remote.port': { type: 'number' },
        'agentFarm.workArea': { type: 'string' }
    }),
    categories: () => [], getProfiles: () => [], setProfiles: async () => { calls.push('profiles'); },
    claudeSettingsFile: () => CLAUDE,
    engineCommand: c => calls.push('terminal:' + c), engineKey: n => calls.push('vault:' + n),
    openEngines: () => calls.push('engines'), openAccounts: () => calls.push('accounts'), openSecrets: () => calls.push('secrets'),
    openWiki: () => calls.push('wiki'), setPromptSnippetsFile: async f => { calls.push('prompts:' + f); },
    alertsVoiceAdd: async () => { calls.push('voice-add'); }, alertsOpenFolder: async () => { calls.push('folder'); }
};
const settle = () => new Promise(r => setTimeout(r, 15));
const alive = setInterval(() => undefined, 1000);

(async () => {
    // ---- what each message needs ----
    const S = remotePages({ settings: () => undefined }).settings;
    ok('‼️ the Settings page asks admin to open and to act — the settings namespace is admin even to look', S && S.open === 'admin' && S.act === 'admin');
    ok('a row, its reset, a setting set, the cards, Claude\'s curated rows and the folders are its acts',
        ['set', 'reset', 'saveProfile', 'applyProfile', 'deleteProfile', 'flexSet', 'presetApply', 'svc-set', 'ccSet', 'ccClear',
            'kapiciMcp', 'wikiInit', 'rootRemove', 'rootCleanDupes', 'agentExclude', 'agentModel', 'spDefault', 'docOpenSet', 'alertOn']
            .every(t => messageScope(S, t) === 'admin'));
    const PC = ['browse', 'browseRow', 'promptsPick', 'promptsOpen', 'openSettingsUi', 'openSettingsJson', 'engineCommand', 'engineKey',
        'engineDocs', 'openEngines', 'openAccounts', 'openSecrets', 'exportProfiles', 'importProfiles', 'ccRaw', 'ccOpenFile', 'rootAdd',
        'rootReveal', 'wikiReveal', 'wikiOpen', 'spReveal', 'openAgent', 'openGuide', 'afnav', 'svc-connect', 'alertVoiceAdd', 'alertFolder'];
    ok('‼️ every picker, editor, terminal, the vault, the raw file, the export and import, a folder, a page, a link and the token never run from a phone',
        PC.every(t => messageScope(S, t) === null));

    // ---- the locks themselves ----
    ok('the phone\'s own reach and port are the locked settings', PHONE_LOCKED_SETTINGS.join() === 'agentFarm.remote.listen,agentFarm.remote.port'
        && phoneLocked('agentFarm.remote.port') && !phoneLocked('agentFarm.workArea'));
    const flexWrites = [], skipped = [];
    const guarded = phoneFlex({ readSetting: () => undefined, writeSetting: async (k, v) => { flexWrites.push(k + '=' + v); } }, skipped);
    await guarded.writeSetting('agentFarm.remote.listen', 'off');
    await guarded.writeSetting('agentFarm.workArea', 'D:/w');
    ok('‼️ the Flow & Content card skips a locked key from a phone and writes the rest', flexWrites.join() === 'agentFarm.workArea=D:/w'
        && skipped.join() === 'agentFarm.remote.listen');

    // ---- the page on a phone ----
    const made = {};
    const views = new RemoteViews({
        media: uri('/ext/media'), atLeast: scopeAtLeast, waitMs: 60,
        pages: remotePages({ settings: host => { made.s = host; FarmSettingsPanel.openOn(host, deps); } })
    });
    const manager = { device: 'dev_m', scope: 'manage' }, admin = { device: 'dev_a', scope: 'admin' };
    ok('‼️ a phone paired to manage does not open it', views.open(manager, 'm1', 'settings', undefined, () => undefined) === false && !made.s);
    const toA = [];
    ok('an admin phone opens it, never as the desktop\'s tab', views.open(admin, 'a1', 'settings', undefined, m => toA.push(m)) === true
        && made.s && made.s.remote === true && FarmSettingsPanel.current === undefined);
    const body = (await views.page('/view/settings?view=a1', admin)).body;
    ok('…from /res/', body.includes('src="/res/settings.js"'));
    ok('‼️ Claude Code\'s raw settings.json never reaches a phone; its curated rows do',
        !body.includes('sk-ant-SECRET-VALUE') && body.includes('"phoneLocked":["agentFarm.remote.listen","agentFarm.remote.port"]'));
    writes.length = 0;
    views.message(admin, 'a1', { type: 'set', key: 'agentFarm.remote.listen', value: 'off' });
    views.message(admin, 'a1', { type: 'reset', key: 'agentFarm.remote.port' });
    await settle();
    const refusals = toA.filter(m => m.type === 'error' && /changed on the PC only/.test(String(m.error)));
    ok('‼️ the phone\'s reach and port are refused from a phone — a row and its reset alike, told on the row',
        writes.length === 0 && refusals.some(m => m.key === 'agentFarm.remote.listen') && refusals.some(m => m.key === 'agentFarm.remote.port'));
    views.message(admin, 'a1', { type: 'set', key: 'agentFarm.workArea', value: 'D:/w' });
    await settle();
    ok('any other row writes from an admin phone', writes.join() === 'agentFarm.workArea="D:/w"');
    calls.length = 0; pcSide.length = 0;
    for (const t of PC) { views.message(admin, 'a1', { type: t, key: 'agentFarm.workArea', command: 'claude login', name: 'K', url: 'https://x.dev', root: HOME, agentId: 'a', to: 'x', text: '{}' }); }
    await settle();
    ok('‼️ nothing PC-only a phone sends opens, writes or prompts anything on the PC', calls.length === 0 && pcSide.length === 0);
    const datas = () => toA.filter(m => m.type === 'data').length;
    const n0 = datas();
    FarmSettingsPanel.refreshIfOpen();
    await settle();
    ok('the farm\'s refresh reaches the phone', datas() === n0 + 1);
    views.close(admin, 'a1');
    ok('a closed view leaves no instance behind', FarmSettingsPanel.phones.size === 0);

    // ---- the host's wiring and the phone's page ----
    const src = require('./lib_settings_source').settingsPanelSource();
    ok('the desktop still gets the whole file; a phone gets none of it', /raw: this\.host\.remote \? '' : cc\.raw/.test(src));
    ok('‼️ a setting set applied from a phone leaves the reach and port alone and says so on the phone',
        /if \(error && phoneLocked\(step\.key\)\) \{ locked\.push\(step\.key\); \}/.test(src)
        && /if \(locked\.length\) \{ void (?:this|s)\.host\.ask\.info\('Agent Farm: ' \+ lockedNote\(locked\)\); \}/.test(src));
    ok('…and the Flow & Content card is handed the guarded writes on a phone, its skips told',
        /this\.deps\.flex && this\.host\.remote \? phoneFlex\(this\.deps\.flex, skipped\) : this\.deps\.flex/.test(src)
        && /if \(skipped\.length\) \{ flexError\(lockedNote\(skipped\)\); \}/.test(src));
    ok('no dialog of the page is the desktop\'s own', !/vscode\.window\.show(Information|Warning|Error)Message|vscode\.window\.showOpenDialog/.test(src));
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('the phone opens Settings from the palette\'s own deps', /settings: host => FarmSettingsPanel\.openOn\(host, farmSettingsDeps\(\)\)/.test(ext)
        && /FarmSettingsPanel\.show\(farmSettingsDeps\(\), /.test(ext) && /const farmSettingsDeps = \(\): FarmSettingsDeps => \(\{/.test(ext));
    const page = require('./lib_settings_source').settingsPageSource();
    ok('‼️ the PC\'s pickers, editors, terminals, folders, links and the raw file are not drawn on a phone',
        ['[data-browse]', '[data-lbrowse]', '#rootadd', '[data-rootreveal]', '#ccopen', '#ccrawbox', '#profexport', '#profimport',
            '#opensettingsjson', '[data-engcmd]', '[data-engkey]', '[data-engdocs]', '#openengines', '#openaccounts', '#promptspick',
            '#promptsopen', '#wikireveal', '#wikiopen', '#spreveal'].every(s => page.includes('html.af-phone ' + s))
        && /<details class="setitem" id="ccrawbox"/.test(page));
    ok('the reach and port rows are drawn but disabled on a phone',
        /\((?:X\.)?DATA\.phoneLocked \|\| \[\]\)\.forEach\(k => \['data-set', 'data-reset'\]\.forEach/.test(page) && /el\.disabled = true;/.test(page));
    ok('a form field stacks and an agent\'s chip wraps on a phone', /html\.af-phone \.setfrow \{ flex-wrap:wrap; \}/.test(page)
        && /html\.af-phone \.setfrow > input, html\.af-phone \.setfrow > select \{ flex:1 1 100%; \}/.test(page)
        && /html\.af-phone \.agchip \{ white-space:normal;/.test(page));
    const flexCss = fs.readFileSync(path.join(ROOT, 'media', 'afFlexSettings.js'), 'utf8');
    ok('a Flow & Content row is a card on a phone, its box the whole line', /html\.af-phone \.flextable tr \{ display:flex;/.test(flexCss)
        && /html\.af-phone \.flextable td\.flexbox, html\.af-phone \.flexorigin \{ flex:1 1 100%;/.test(flexCss));

    clearInterval(alive);
    fs.rmSync(HOME, { recursive: true, force: true });
    console.log(`\nsettings on a phone: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL threw: ' + (e && e.stack || e)); process.exit(1); });
