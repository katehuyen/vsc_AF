// Toolbox webview — the Airtable Engine card (media/toolbox.js). Runs the real
// page script in a vm sandbox and checks the card renders per state and its
// buttons post the right messages. The card is a PERMANENT, functional config
// section (folder manager: add / remove / list with counts) — no Hide.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const code = fs.readFileSync(path.resolve(__dirname, '../media/pageHeader.js'), 'utf8') + '\n'
    + fs.readFileSync(path.resolve(__dirname, '../media/toolbox.js'), 'utf8');

function run(airtable) {
    let posted = [];
    const els = {};
    function getEl(id) {
        if (!els[id]) {
            els[id] = {
                id, listeners: {}, _html: '',
                set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; },
                addEventListener(e, f) { this.listeners[e] = f; }, focus() { }, setSelectionRange() { }
            };
        }
        return els[id];
    }
    let wiredAt = [];
    // capture the FULL data-* set on each matched tag (so data-path etc. survive)
    function parseEls(html, key) {
        const out = [];
        const tagRe = new RegExp(`<[a-z]+[^>]*\\bdata-${key}="[^"]*"[^>]*>`, 'g');
        let t;
        while ((t = tagRe.exec(html))) {
            const ds = {}; let a; const aRe = /data-([a-z]+)="([^"]*)"/g;
            while ((a = aRe.exec(t[0]))) { ds[a[1]] = a[2]; }
            out.push({ dataset: ds, addEventListener(_e, f) { this._fn = f; } });
        }
        return out;
    }
    const sandbox = {
        acquireVsCodeApi: () => ({ postMessage: (m) => posted.push(m), getState() { }, setState() { } }),
        window: {
            AFCharts: { esc: (s) => String(s === undefined || s === null ? '' : s) },
            __DATA__: {
                generatedAt: 0, agents: [], counts: {}, items: [], probeCache: {},
                paths: { userClaudeDir: 'C:/u/.claude', userConfigJson: 'C:/u/.claude.json' },
                airtable
            },
            addEventListener() { }
        },
        document: {
            getElementById: getEl,
            querySelector: () => null,
            querySelectorAll: (sel) => {
                const m = /^\[data-(at|tab|afnav|act|new|exp)\]$/.exec(sel);
                if (!m) { return []; }
                const list = parseEls(getEl('app')._html, m[1]);
                if (m[1] === 'at') { wiredAt = list; }
                return list;
            }
        },
        setTimeout: () => 0, clearTimeout: () => { }, console, Date
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);
    return { html: getEl('app')._html, posted: () => posted, at: (name) => wiredAt.find((e) => e.dataset.at === name) };
}

// not registered → folder manager + Register + Discover + Add-folder + Settings, NO Hide
{
    const r = run({ registered: false, serverExists: true, folders: [{ path: 'W:/zome/db', instances: 5 }] });
    ok('card renders', r.html.includes('Airtable Engine') && r.html.includes('data-at="register"'));
    ok('shows discover + add-folder + settings, not unregister',
        r.html.includes('data-at="discover"') && r.html.includes('data-at="addfolder"') &&
        r.html.includes('data-at="opensettings"') && !r.html.includes('data-at="unregister"'));
    ok('NO Hide/Show on the functional card', !r.html.includes('data-at="hide"') && !r.html.includes('data-at="show"'));
    ok('lists the engine folder with its instance count', r.html.includes('W:/zome/db') && r.html.includes('5 instance'));
    ok('folder has a Remove button carrying its path', r.html.includes('data-at="removefolder"') && r.html.includes('data-path="W:/zome/db"'));
    r.at('register')._fn();
    ok('Register posts airtableRegister', r.posted().some(m => m.type === 'airtableRegister'));
    r.at('addfolder')._fn();
    ok('Add folder posts airtableAddFolder', r.posted().some(m => m.type === 'airtableAddFolder'));
    r.at('removefolder')._fn();
    ok('Remove posts airtableRemoveFolder WITH the path', r.posted().some(m => m.type === 'airtableRemoveFolder' && m.path === 'W:/zome/db'));
    r.at('opensettings')._fn();
    ok('Settings posts airtableOpenSettings', r.posted().some(m => m.type === 'airtableOpenSettings'));
}

// multiple folders in different places → each listed with its own count + Remove
{
    const r = run({ registered: true, serverExists: true, folders: [{ path: 'W:/zome/db', instances: 5 }, { path: 'X:/other/engines', instances: 2 }] });
    ok('both folders listed with counts', r.html.includes('W:/zome/db') && r.html.includes('5 instance') && r.html.includes('X:/other/engines') && r.html.includes('2 instance'));
    ok('one Remove button per folder', (r.html.match(/data-at="removefolder"/g) || []).length === 2);
    ok('remove buttons carry each path', r.html.includes('data-path="W:/zome/db"') && r.html.includes('data-path="X:/other/engines"'));
}

// no engine folder configured (product default) → clear add prompt, NO hardcoded path
{
    const r = run({ registered: false, serverExists: true, folders: [] });
    ok('no folder → warns + offers add', /No engine folder yet/i.test(r.html) && r.html.includes('data-at="addfolder"'));
    ok('does NOT invent a default path', !r.html.includes('W:/zome/db'));
}

// registered → Unregister, not Register
{
    const r = run({ registered: true, serverExists: true, folders: [{ path: 'W:/zome/db', instances: 5 }] });
    ok('registered shows unregister + status, not register',
        r.html.includes('data-at="unregister"') && r.html.includes('registered') && !r.html.includes('data-at="register"'));
    r.at('unregister')._fn();
    ok('Unregister posts airtableUnregister', r.posted()[0] && r.posted()[0].type === 'airtableUnregister');
    r.at('discover')._fn();
    ok('Discover posts airtableDiscover', r.posted().some(m => m.type === 'airtableDiscover'));
}

// server module missing → warning + disabled Register
{
    const r = run({ registered: false, serverExists: false, folders: [{ path: 'W:/zome/db', instances: 5 }] });
    ok('missing module warns + disables register',
        /module missing/.test(r.html) && /data-at="register"[^>]*disabled/.test(r.html));
}

// no airtable data → no card, page still renders
{
    const r = run(null);
    ok('no airtable data → no card, page renders', !r.html.includes('Airtable Engine') && r.html.includes('Two scopes'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
