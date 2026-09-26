// Airtable Engine page webview: status chips + header actions per registration
// state, instance cards (live/down/default), folder lists with instance
// counts, defaults/connection blocks, the agent-tools panel, and the message
// routing of every action.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { charts } = require('./lib_charts_stub.js');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// The shared scripts htmlShell ships to every page, from ONE list.
const code = require(path.join(__dirname, 'lib_shared_media.js')).sharedMedia()
    + fs.readFileSync(path.resolve(__dirname, '../media/airtablePage.js'), 'utf8');

let posted = [];
// ‼️ A LIST: the page listens twice — host messages, and the right-click relay.
const msgHandlers = [];
const msgHandler = (ev) => msgHandlers.forEach(fn => fn(ev));
const wired = {};
const els = {};
function getEl(id) {
    if (!els[id]) {
        els[id] = {
            id, listeners: {}, style: {}, value: '', _html: '',
            addEventListener(ev, fn) { this.listeners[ev] = fn; },
            focus() { },
            set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; }
        };
    }
    return els[id];
}

const DATA = {
    generatedAt: Date.now(),
    store: {
        databaseRoots: ['%USERPROFILE%\\zome\\db'],
        mediaRoots: ['D:/zome/media'],
        defaultInstance: 'stem',
        defaultLang: 'TR',
        requestTimeoutMs: 8000
    },
    expandedRoots: ['C:/Users/demo/zome/db'],
    registration: {
        registered: true, upToDate: false,
        currentPath: 'C:/old/2.87.0/index.js', configFile: 'C:/Users/demo/.claude.json',
        current: { command: 'node', args: ['${APPDATA}/old/index.js'] }
    },
    staging: { dir: 'C:/store/mcp/airtable', version: '3.1.0', extensionVersion: '3.1.0' },
    configFile: 'C:\\Users\\demo\\AppData\\Roaming\\Code\\User\\globalStorage\\muvusoft.agent-farm\\airtable-config.json',
    configFileToken: '${APPDATA}\\Code\\User\\globalStorage\\muvusoft.agent-farm\\airtable-config.json',
    probe: { ok: true, tools: [{ name: 'airtable_media_save', description: 'CREATE a media record. More text here.' }], probedAt: Date.now() - 120000 },
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

const sandbox = {
    acquireVsCodeApi: () => ({ postMessage: (m) => posted.push(m), getState() { }, setState() { } }),
    window: {
        AFCharts: charts({ esc: (s) => String(s) }),
        __DATA__: DATA,
        addEventListener: (ev, fn) => { if (ev === 'message') { msgHandlers.push(fn); } }
    },
    document: {
        getElementById: getEl,
        querySelectorAll: (sel) => {
            const m = /\[data-([a-z-]+)\]/.exec(sel);
            if (!m) { return []; }
            const attr = m[1];
            const camel = attr.replace(/-([a-z])/g, (_x, c) => c.toUpperCase());
            const list = [];
            const tagRe = /<(?:button|a)\b[^>]*>/g;
            let t;
            while ((t = tagRe.exec(getEl('app')._html))) {
                const tag = t[0];
                const val = new RegExp(`data-${attr}="([^"]*)"`).exec(tag);
                if (!val) { continue; }
                const dataset = {};
                const dre = /data-([a-z-]+)="([^"]*)"/g;
                let d;
                while ((d = dre.exec(tag))) {
                    dataset[d[1].replace(/-([a-z])/g, (_x, c) => c.toUpperCase())] = d[2];
                }
                const el = { dataset };
                el.addEventListener = (_e, fn) => { el._click = fn; };
                list.push(el);
            }
            wired[camel] = list;
            return list;
        }
    },
    setTimeout: () => 0, clearTimeout: () => { }, console, Date
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox); // render()

const html = () => getEl('app')._html;
const one = (attr, val) => (wired[attr] || []).find(e =>
    val === undefined || Object.values(e.dataset).includes(val));

// ---------- rendering ----------
ok('page renders with instance cards first', html().indexOf('Instances') < html().indexOf('Folders'));
ok('needs-repair chip when registration is version-pinned', html().includes('needs repair'));
ok('staged version chip', html().includes('server v3.1.0'));
ok('probe chip shows verified tool count', html().includes('1 tools verified'));
ok('live instance card: stats + default badge', html().includes('STEM Engine')
    && html().includes('<b>770</b> sentences') && html().includes('>default</span>'));
ok('down instance card: dimmed + start hint', html().includes('air-down')
    && html().includes('start_admin.bat'));
ok('live/total counter in the heading', html().includes('1 live / 2'));
ok('engine folder row: raw token + instance count', html().includes('%USERPROFILE%\\zome\\db')
    && html().includes('2 instance(s) · 1 live'));
ok('connection block shows registration path', html().includes('${APPDATA}/old/index.js'));
ok('module config shown as a PORTABLE token, not a raw C:\\Users path',
    html().includes('${APPDATA}\\Code\\User\\globalStorage\\muvusoft.agent-farm\\airtable-config.json')
    && !/<code>[^<]*Users\\demo[^<]*airtable-config/.test(html()));
ok('resolved config path still available for the open action + tooltip',
    html().includes('data-openconfig="C:\\Users\\demo\\AppData\\Roaming\\Code\\User\\globalStorage\\muvusoft.agent-farm\\airtable-config.json"'));
ok('agent access panel is live-verified', html().includes('live-verified')
    && html().includes('airtable_media_save'));
ok('Repair + Unregister offered for a pinned registration',
    html().includes('Repair registration') && html().includes('Unregister'));

// ---------- action routing ----------
posted = [];
one('do', 'register')._click();
ok('Repair posts register', posted[0] && posted[0].type === 'register');
posted = [];
one('do', 'add-root')._click();
ok('+ Add folder posts add-root', posted[0] && posted[0].type === 'add-root');
posted = [];
one('remove', 'remove-root:%USERPROFILE%\\zome\\db')._click();
ok('folder remove posts remove-root with the raw value',
    posted[0] && posted[0].type === 'remove-root' && posted[0].value === '%USERPROFILE%\\zome\\db');
posted = [];
one('openUi')._click();
ok('Open UI posts open-ui with the url', posted[0] && posted[0].type === 'open-ui'
    && posted[0].url === 'http://localhost:3003/');
posted = [];
one('setdef', 'draft')._click();
ok('Set default posts set/defaultInstance', posted[0] && posted[0].type === 'set'
    && posted[0].key === 'defaultInstance' && posted[0].value === 'draft');
posted = [];
ok('X-416 — a down instance offers Start, a live one does not', /data-start="draft"/.test(html()) && !/data-start="stem"/.test(html()));
ok('…its hover says what it runs and what it skips', /Start draft&#10;&#10;Runs node server.js[^"]*no browser tab/.test(html()));
one('start', 'draft')._click();
ok('Start posts start with the instance name', posted[0] && posted[0].type === 'start' && posted[0].name === 'draft');
posted = [];
one('do', 'probe-tools')._click();
ok('Probe tools posts probe-tools', posted[0] && posted[0].type === 'probe-tools');
posted = [];
const lang = getEl('def-lang');
lang.value = 'EN';
lang.listeners.change();
ok('language change posts set/defaultLang', posted[0] && posted[0].type === 'set'
    && posted[0].key === 'defaultLang' && posted[0].value === 'EN');

// ---------- host messages ----------
msgHandler({ data: { type: 'instances', rows: [] } });
ok('empty instances → guidance mentions config.json', html().includes('config.json'));
msgHandler({
    data: {
        type: 'data', data: {
            ...DATA, instances: undefined, probe: undefined,
            store: { ...DATA.store, databaseRoots: [] }, expandedRoots: [],
            registration: { registered: false, upToDate: false, configFile: 'x' }
        }
    }
});
ok('fresh data starts at "checking instances"', html().includes('Checking instances…'));
msgHandler({ data: { type: 'instances', rows: [] } });
ok('unregistered empty state: Register MCP + add-folder guidance + expected tool surface',
    html().includes('Register MCP') && html().includes('Add your engine folder')
    && html().includes('expected surface') && html().includes('airtable_knowledge_save'));

console.log(`${pass} passed, ${fail} failed`);
if (fail) { process.exit(1); }
