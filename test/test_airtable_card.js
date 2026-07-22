// Toolbox page — Airtable Engine card webview: status badges (registered /
// needs repair / not staged), folder rows with live instance counts, defaults
// row, the instances table, and the message routing of every card action.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const code = fs.readFileSync(path.resolve(__dirname, '../media/pageHeader.js'), 'utf8')
    + '\n' + fs.readFileSync(path.resolve(__dirname, '../media/toolbox.js'), 'utf8');

let posted = [];
let msgHandler = null;
const wired = {};
const els = {};
function getEl(id) {
    if (!els[id]) {
        els[id] = {
            id, listeners: {}, style: {}, value: '', _html: '',
            addEventListener(ev, fn) { this.listeners[ev] = fn; },
            focus() { }, setSelectionRange() { },
            set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; }
        };
    }
    return els[id];
}

const AIR = {
    settings: {
        rawDatabaseRoots: ['%USERPROFILE%\\zome\\db'],
        rawMediaRoots: [],
        databaseRoots: ['C:/Users/demo/zome/db'],
        mediaRoots: [],
        defaultInstance: 'stem',
        defaultLang: 'TR',
        requestTimeoutMs: 8000
    },
    registration: { registered: true, upToDate: false, currentPath: 'C:/old/2.87.0/index.js', configFile: 'C:/Users/demo/.claude.json' },
    staging: { dir: 'C:/store/mcp/airtable', version: '3.0.0', extensionVersion: '3.0.0' },
    configFile: 'C:/store/airtable-config.json',
    instances: [
        {
            name: 'stem', dir: 'C:/Users/demo/zome/db/stem', host: 'localhost', port: 3003,
            alive: true, title: 'STEM Engine', isDefault: true, url: 'http://localhost:3003/',
            stats: { lessons: 7, sentences: 770, media: 25 }
        },
        {
            name: 'draft', dir: 'C:/Users/demo/zome/db/draft', host: 'localhost', port: 3004,
            alive: false, error: 'ECONNREFUSED', isDefault: false, url: 'http://localhost:3004/'
        }
    ]
};
const DATA = {
    generatedAt: Date.now(),
    agents: [{ id: 'a1', name: 'developer' }],
    counts: { skill: { user: 0, agent: 0 }, subagent: { user: 0, agent: 0 }, command: { user: 0, agent: 0 }, mcp: { user: 1, agent: 0 }, hook: { user: 0, agent: 0 }, plugin: { user: 0, agent: 0 }, style: { user: 0, agent: 0 }, settings: { user: 0, agent: 0 } },
    items: [],
    probeCache: { 'user::airtable': { ok: true, tools: new Array(10).fill({}), probedAt: Date.now() - 60000 } },
    airtable: AIR,
    paths: { userClaudeDir: 'C:/Users/demo/.claude', userConfigJson: 'C:/Users/demo/.claude.json' }
};

const sandbox = {
    acquireVsCodeApi: () => ({ postMessage: (m) => posted.push(m), getState() { }, setState() { } }),
    window: {
        AFCharts: { esc: (s) => String(s) },
        __DATA__: DATA,
        addEventListener: (ev, fn) => { if (ev === 'message') { msgHandler = fn; } }
    },
    document: {
        getElementById: getEl,
        querySelectorAll: (sel) => {
            const m = /\[data-([a-z]+)\]/.exec(sel);
            if (!m) { return []; }
            const attr = m[1];
            const list = [];
            const tagRe = /<button\b[^>]*>/g;
            let t;
            while ((t = tagRe.exec(getEl('app')._html))) {
                const tag = t[0];
                const val = new RegExp(`data-${attr}="([^"]*)"`).exec(tag);
                if (!val) { continue; }
                const dataset = {};
                const dre = /data-([a-z]+)="([^"]*)"/g;
                let d;
                while ((d = dre.exec(tag))) { dataset[d[1]] = d[2]; }
                const el = { dataset };
                el.addEventListener = (_e, fn) => { el._click = fn; };
                list.push(el);
            }
            wired[attr] = list;
            return list;
        }
    },
    setTimeout: () => 0, clearTimeout: () => { }, console, Date
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox); // render()

const html = () => getEl('app')._html;
// wire() populated `wired.air` during the last render — those objects carry _click
const air = (val) => (wired.air || []).find(e => e.dataset.air === val);

// ---------- rendering ----------
ok('card renders with title', html().includes('Airtable Engine'));
ok('needs-repair badge when registration is version-pinned', html().includes('MCP needs repair'));
ok('staged version badge', html().includes('staged v3.0.0'));
ok('probe summary from cache', html().includes('10 tools verified'));
ok('db folder row shows raw (tokenized) path + live count', html().includes('%USERPROFILE%\\zome\\db')
    && html().includes('2 instance(s), 1 live'));
ok('instances table: live + down rows', html().includes('STEM Engine')
    && html().includes('ECONNREFUSED') && html().includes('start_admin.bat'));
ok('default instance marked', html().includes('>default</span>'));
ok('Repair + Unregister offered (not plain Register)', !!air('register') && !!air('unregister')
    && html().includes('Repair registration'));

// ---------- action routing ----------
const fire = (el) => el._click();
posted = []; fire(air('register'));
ok('repair posts airtable-register', posted[0] && posted[0].type === 'airtable-register');
posted = []; fire(air('add-root'));
ok('+ Add folder posts airtable-add-root', posted[0] && posted[0].type === 'airtable-add-root');
posted = []; fire(air('remove-root'));
ok('remove folder carries the raw value', posted[0] && posted[0].type === 'airtable-remove-root'
    && posted[0].value === '%USERPROFILE%\\zome\\db');
posted = []; fire(air('open-ui'));
ok('Open UI posts openExternal with the url', posted[0] && posted[0].type === 'openExternal'
    && posted[0].url === 'http://localhost:3003/');
posted = []; fire(air('set-default'));
ok('Set default posts airtable-set defaultInstance', posted[0] && posted[0].type === 'airtable-set'
    && posted[0].key === 'defaultInstance' && posted[0].value === 'draft');
posted = []; fire(air('probe'));
ok('Probe posts the standard user-scope probe', posted[0] && posted[0].type === 'probe'
    && posted[0].scope === 'user' && posted[0].server === 'airtable');
posted = []; fire(air('reprobe'));
ok('Refresh instances posts airtable-reprobe', posted[0] && posted[0].type === 'airtable-reprobe');

// defaults inputs post on change
posted = [];
const lang = getEl('air-deflang');
lang.value = 'EN';
lang.listeners.change();
ok('language change posts airtable-set', posted[0] && posted[0].type === 'airtable-set'
    && posted[0].key === 'defaultLang' && posted[0].value === 'EN');

// ---------- async instance merge ----------
msgHandler({ data: { type: 'airtable-instances', rows: [] } });
ok('instances message re-renders (none found note)', html().includes('No instances found'));

// not-registered state
msgHandler({
    data: {
        type: 'data', data: {
            ...DATA,
            airtable: { ...AIR, instances: undefined, registration: { registered: false, upToDate: false, configFile: 'x' } }
        }
    }
});
ok('unregistered state offers Register MCP + checking note', html().includes('MCP not registered')
    && html().includes('Register MCP') && html().includes('Checking instances…'));

console.log(`${pass} passed, ${fail} failed`);
if (fail) { process.exit(1); }
