// Toolbox webview — the Airtable Engine card (media/toolbox.js). Runs the real
// page script in a vm sandbox (like test_settingsops does for settings.js) and
// checks the card renders per state and its buttons post the right messages.
// This is what catches a typo in the card HTML, a wrong data-at name, or a
// broken hide/show branch without needing a live VS Code.
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
                const app = getEl('app');
                const m = /^\[data-(at|tab|afnav|act|new|exp)\]$/.exec(sel);
                if (!m) { return []; }
                const key = m[1];
                const list = [];
                const re = new RegExp(`data-${key}="([^"]*)"`, 'g');
                let hit;
                while ((hit = re.exec(app._html))) {
                    const el = { dataset: { [key]: hit[1] } };
                    el.addEventListener = (_e, fn) => { el._fn = fn; };
                    list.push(el);
                }
                if (key === 'at') { wiredAt = list; }
                return list;
            }
        },
        setTimeout: () => 0, clearTimeout: () => { }, console, Date
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox); // render() + wire()
    return { html: getEl('app')._html, posted: () => posted, at: (name) => wiredAt.find((e) => e.dataset.at === name) };
}

// not registered → Register + Discover + Hide + Add-folder + Settings, no Unregister
{
    const r = run({ registered: false, hidden: false, serverExists: true, defaultInstance: '', roots: ['W:/zome/db'] });
    ok('card renders (not hidden)', r.html.includes('Airtable Engine') && r.html.includes('data-at="register"'));
    ok('shows discover + hide + add-folder + settings, not unregister',
        r.html.includes('data-at="discover"') && r.html.includes('data-at="hide"') &&
        r.html.includes('data-at="addfolder"') && r.html.includes('data-at="opensettings"') &&
        !r.html.includes('data-at="unregister"'));
    ok('configured engine folder shown', r.html.includes('W:/zome/db'));
    r.at('register')._fn();
    ok('Register posts airtableRegister', r.posted()[0] && r.posted()[0].type === 'airtableRegister');
    r.at('addfolder')._fn();
    ok('Add folder posts airtableAddFolder', r.posted().some(m => m.type === 'airtableAddFolder'));
    r.at('opensettings')._fn();
    ok('Settings posts airtableOpenSettings', r.posted().some(m => m.type === 'airtableOpenSettings'));
}

// no engine folder configured (product default = empty roots) → prompt, NO hardcoded path
{
    const r = run({ registered: false, hidden: false, serverExists: true, defaultInstance: '', roots: [] });
    ok('no folder set → warns + offers add', /No engine folder set/i.test(r.html) && r.html.includes('data-at="addfolder"'));
    ok('does NOT invent a default path (no W:/zome/db hardcode in UI)', !r.html.includes('W:/zome/db'));
}

// registered → Unregister, not Register
{
    const r = run({ registered: true, hidden: false, serverExists: true, defaultInstance: '', roots: ['W:/zome/db'] });
    ok('registered shows unregister + status, not register',
        r.html.includes('data-at="unregister"') && r.html.includes('registered') && !r.html.includes('data-at="register"'));
    r.at('unregister')._fn();
    ok('Unregister posts airtableUnregister', r.posted()[0] && r.posted()[0].type === 'airtableUnregister');
    r.at('discover')._fn();
    ok('Discover posts airtableDiscover', r.posted().some(m => m.type === 'airtableDiscover'));
}

// hide button posts hidden:true
{
    const r = run({ registered: false, hidden: false, serverExists: true, defaultInstance: '', roots: [] });
    r.at('hide')._fn();
    ok('Hide posts airtableHide hidden:true', r.posted()[0] && r.posted()[0].type === 'airtableHide' && r.posted()[0].hidden === true);
}

// hidden + not registered → minimized with Show
{
    const r = run({ registered: false, hidden: true, serverExists: true, defaultInstance: '', roots: [] });
    ok('hidden+unregistered minimized with show', r.html.includes('data-at="show"') && !r.html.includes('data-at="register"'));
    r.at('show')._fn();
    ok('Show posts airtableHide hidden:false', r.posted()[0] && r.posted()[0].type === 'airtableHide' && r.posted()[0].hidden === false);
}

// hidden + registered → still shows the full card (they use it)
{
    const r = run({ registered: true, hidden: true, serverExists: true, defaultInstance: '', roots: ['W:/zome/db'] });
    ok('hidden+registered still shows status', r.html.includes('data-at="unregister"') && !r.html.includes('data-at="show"'));
}

// server module missing → warning + disabled Register
{
    const r = run({ registered: false, hidden: false, serverExists: false, defaultInstance: '', roots: ['W:/zome/db'] });
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
