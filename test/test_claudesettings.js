// Claude Code settings bridge: curated catalog model, path patching (with
// empty-parent pruning), value coercion per kind, raw validation — plus the
// settings page's Claude section rendering and edit routing.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const CC = require(path.join(__dirname, '..', 'out', 'core', 'claudesettings.js'));
const { charts } = require('./lib_charts_stub.js');

// ---------- model building ----------
{
    const json = {
        model: 'opus',
        env: { CLAUDE_CODE_USE_POWERSHELL_TOOL: '1', OTHER_VAR: 'keep' },
        permissions: { defaultMode: 'bypassPermissions', allow: ['Bash'] },
        hooks: { Stop: [{ hooks: [] }] }
    };
    const items = CC.buildClaudeModel(json);
    const by = id => items.find(i => i.id === id);
    ok('set values read from their paths', by('model').value === 'opus' && by('model').set === true);
    ok('nested env flag read', by('psTool').value === '1' && by('psTool').set === true);
    ok('nested permission mode read', by('defaultMode').value === 'bypassPermissions');
    ok('unset items honestly unset', by('maxThinking').set === false && by('cleanupPeriodDays').set === false);
    ok('every catalog item modeled', items.length === CC.CC_CATALOG.length);
}

// ---------- patching preserves everything else ----------
{
    const json = { env: { KEEP: 'x' }, hooks: { Stop: ['h'] }, permissions: { allow: ['Bash'] } };
    const p1 = CC.patchClaudeSettings(json, ['env', 'MAX_THINKING_TOKENS'], '30000');
    ok('set writes the leaf', p1.env.MAX_THINKING_TOKENS === '30000');
    ok('siblings survive', p1.env.KEEP === 'x' && JSON.stringify(p1.hooks) === JSON.stringify({ Stop: ['h'] }));
    ok('input object untouched (immutable patch)', json.env.MAX_THINKING_TOKENS === undefined);

    const p2 = CC.patchClaudeSettings(p1, ['env', 'MAX_THINKING_TOKENS'], undefined);
    ok('clear removes the leaf, keeps siblings', p2.env.MAX_THINKING_TOKENS === undefined && p2.env.KEEP === 'x');

    const p3 = CC.patchClaudeSettings({ env: { ONLY: '1' } }, ['env', 'ONLY'], undefined);
    ok('emptied parent object is pruned', p3.env === undefined);

    const p4 = CC.patchClaudeSettings({}, ['permissions', 'defaultMode'], 'plan');
    ok('missing parents are created', p4.permissions.defaultMode === 'plan');

    const p5 = CC.patchClaudeSettings('garbage', ['model'], 'opus');
    ok('non-object input starts fresh', p5.model === 'opus');
}

// ---------- value coercion ----------
{
    const item = id => CC.CC_CATALOG.find(i => i.id === id);
    ok('flag on → "1"', CC.coerceClaudeValue(item('psTool'), true).value === '1');
    ok('flag off → removed', CC.coerceClaudeValue(item('psTool'), false).value === undefined);
    ok('env number stays a string in the file', CC.coerceClaudeValue(item('maxThinking'), '30000').value === '30000');
    ok('top-level number stays a number', CC.coerceClaudeValue(item('cleanupPeriodDays'), '90').value === 90);
    ok('bad number rejected', CC.coerceClaudeValue(item('maxThinking'), 'abc').ok === false);
    ok('enum enforced', CC.coerceClaudeValue(item('defaultMode'), 'yolo').ok === false
        && CC.coerceClaudeValue(item('defaultMode'), 'plan').value === 'plan');
    ok('boolean coerced', CC.coerceClaudeValue(item('includeCoAuthoredBy'), 'false').value === false);
    ok('empty string clears', CC.coerceClaudeValue(item('model'), '').value === undefined);
}

// ---------- raw validation ----------
{
    ok('valid object accepted', CC.validateRawClaudeSettings('{"model":"opus"}').ok === true);
    ok('array rejected', CC.validateRawClaudeSettings('[1]').ok === false);
    ok('broken JSON rejected with message', CC.validateRawClaudeSettings('{oops').ok === false);
}

// ---------- settings page: Claude section render + routing ----------
{
    // The shared scripts htmlShell ships to every page — from ONE list
    // (lib_shared_media.js), because a copy of it in each test file is how
    // adding a shared component breaks five suites at once.
    const code = require(path.join(__dirname, 'lib_shared_media.js')).sharedMedia()
        + fs.readFileSync(path.resolve(__dirname, '../media/settings.js'), 'utf8');
    let posted = [];
    let msgHandler = null;
    const els = {};
    function getEl(id) {
        if (!els[id]) {
            els[id] = {
                id, listeners: {}, style: {}, value: '', checked: false, _html: '',
                addEventListener(ev, fn) { this.listeners[ev] = fn; },
                focus() { }, setSelectionRange() { },
                set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; }
            };
        }
        return els[id];
    }
    let ccSetEls = [], ccClearEls = [];
    const sandbox = {
        acquireVsCodeApi: () => ({ postMessage: (m) => posted.push(m), getState() { }, setState() { } }),
        window: {
            AFCharts: charts({ esc: (s) => String(s) }),
            __DATA__: {
                focus: '', profiles: [],
                categories: [{
                    id: 'core', label: 'Core & Agents', items: [
                        { key: 'agentFarm.agentRoots', type: 'array', default: [], description: 'roots', value: [], modified: false }
                    ]
                }],
                claude: {
                    file: 'C:/u/.claude/settings.json',
                    parseError: '',
                    raw: '{\n  "model": "opus"\n}',
                    items: (() => {
                        const items = CC.buildClaudeModel({ model: 'opus', env: { CLAUDE_CODE_USE_POWERSHELL_TOOL: '1' } });
                        return JSON.parse(JSON.stringify(items));
                    })()
                }
            },
            addEventListener: (ev, fn) => { if (ev === 'message') { msgHandler = fn; } }
        },
        document: {
            getElementById: getEl,
            querySelector: () => null,
            querySelectorAll: (sel) => {
                const app = getEl('app');
                const list = [];
                const mk = (re, key) => {
                    let m;
                    while ((m = re.exec(app._html))) {
                        const el = { dataset: { [key]: m[1] }, type: '', value: '', checked: false };
                        el.addEventListener = (_e, fn) => { el._fn = fn; };
                        list.push(el);
                    }
                };
                if (sel === '[data-ccset]') { mk(/data-ccset="([^"]*)"/g, 'ccset'); ccSetEls = list; }
                else if (sel === '[data-ccclear]') { mk(/data-ccclear="([^"]*)"/g, 'ccclear'); ccClearEls = list; }
                return list;
            }
        },
        setTimeout: () => 0, clearTimeout: () => { }, console, Date
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);

    const html = getEl('app')._html;
    ok('Claude Code section rendered with nav chip', html.includes('Claude Code (claude CLI)') && html.includes('data-cat="claude"'));
    ok('the PowerShell-tip setting is there, checked', /data-ccset="psTool"[^>]*checked/.test(html));
    ok('set item shows the clear button, unset does not', html.includes('data-ccclear="model"') && !html.includes('data-ccclear="maxThinking"'));
    ok('file path + backup note shown', html.includes('C:/u/.claude/settings.json') && html.includes('.agentfarm-backup'));
    ok('raw editor present with the file contents', html.includes('id="ccraw"') && html.includes('&quot;model&quot;') === false && html.includes('"model"'));

    posted = [];
    const flag = ccSetEls.find(e => e.dataset.ccset === 'psTool');
    flag.type = 'checkbox'; flag.checked = false;
    flag._fn();
    ok('unchecking the flag posts ccSet false', posted[0] && posted[0].type === 'ccSet' && posted[0].id === 'psTool' && posted[0].value === false);

    posted = [];
    ccClearEls.find(e => e.dataset.ccclear === 'model')._fn();
    ok('clear posts ccClear', posted[0] && posted[0].type === 'ccClear' && posted[0].id === 'model');

    // raw apply error surfaces under the raw editor
    msgHandler({ data: { type: 'ccError', id: '__raw__', error: 'invalid JSON: x' } });
    ok('raw error rendered', getEl('app')._html.includes('⚠ invalid JSON: x'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
