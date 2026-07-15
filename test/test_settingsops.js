// Farm Settings: schema-driven model (category coverage incl. auto "Other"),
// value sanitizing, profile snapshot/apply-plan/import — plus the settings page
// rendering, edit routing and the focus deep-link.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const SO = require(path.join(__dirname, '..', 'out', 'core', 'settingsops.js'));

// ---------- category coverage against the REAL manifest ----------
{
    const pkg = require(path.join(__dirname, '..', 'package.json'));
    const props = pkg.contributes.configuration.properties;
    const model = SO.buildSettingsModel(props, () => undefined);
    const listed = model.reduce((a, c) => a + c.items.length, 0);
    ok('every manifest setting appears exactly once', listed === Object.keys(props).length);
    const other = model.find(c => c.id === 'other');
    ok('no known setting leaks into Other', !other || other.items.length === 0);
    ok('categories come in declared order', model.every((c, i) =>
        i === 0 || SO.CATEGORY_LABELS.findIndex(l => l[0] === c.id) > SO.CATEGORY_LABELS.findIndex(l => l[0] === model[i - 1].id)));

    // a setting invented tomorrow lands in Other automatically
    const m2 = SO.buildSettingsModel({ ...props, 'agentFarm.futureThing': { type: 'string', default: 'x', description: 'd' } }, () => undefined);
    const other2 = m2.find(c => c.id === 'other');
    ok('an unknown new setting lands in Other automatically', other2 && other2.items.some(i => i.key === 'agentFarm.futureThing'));
}

// ---------- model values + modified flags ----------
{
    const props = {
        'agentFarm.livePort': { type: 'number', default: 0, description: 'port' },
        'agentFarm.guideLanguage': { type: 'string', enum: ['en', 'tr'], default: 'en', description: 'lang' },
        'agentFarm.agentRoots': { type: 'array', default: [], description: 'roots' }
    };
    const values = { 'agentFarm.livePort': 9000, 'agentFarm.guideLanguage': 'en', 'agentFarm.agentRoots': ['D:/a'] };
    const model = SO.buildSettingsModel(props, k => values[k]);
    const flat = model.flatMap(c => c.items);
    ok('modified flag set only for non-default values',
        flat.find(i => i.key === 'agentFarm.livePort').modified === true &&
        flat.find(i => i.key === 'agentFarm.guideLanguage').modified === false &&
        flat.find(i => i.key === 'agentFarm.agentRoots').modified === true);
    ok('enum carried into the item', JSON.stringify(flat.find(i => i.key === 'agentFarm.guideLanguage').enum) === '["en","tr"]');
}

// ---------- sanitizeValue ----------
{
    ok('number parses', SO.sanitizeValue({ type: 'number' }, '42').value === 42);
    ok('bad number rejected', SO.sanitizeValue({ type: 'number' }, 'abc').ok === false);
    ok('boolean from checkbox', SO.sanitizeValue({ type: 'boolean' }, true).value === true && SO.sanitizeValue({ type: 'boolean' }, 'false').value === false);
    ok('enum enforced', SO.sanitizeValue({ type: 'string', enum: ['a', 'b'] }, 'c').ok === false && SO.sanitizeValue({ type: 'string', enum: ['a', 'b'] }, 'b').value === 'b');
    ok('array JSON parses', JSON.stringify(SO.sanitizeValue({ type: 'array' }, '[1,2]').value) === '[1,2]');
    ok('array rejects an object', SO.sanitizeValue({ type: 'array' }, '{"x":1}').ok === false);
    ok('object rejects an array', SO.sanitizeValue({ type: 'object' }, '[1]').ok === false);
    ok('broken JSON reports the error', SO.sanitizeValue({ type: 'array' }, '[oops').ok === false);
    ok('empty JSON text falls back to the empty shape', JSON.stringify(SO.sanitizeValue({ type: 'array' }, ' ').value) === '[]');
    ok('structured value accepted as-is (profile apply)', JSON.stringify(SO.sanitizeValue({ type: 'array' }, ['x']).value) === '["x"]');
}

// ---------- profiles: snapshot, apply plan, import ----------
{
    const cats = [{
        id: 'core', label: 'Core', items: [
            { key: 'agentFarm.a', type: 'number', default: 0, description: '', value: 5, modified: true },
            { key: 'agentFarm.b', type: 'string', default: 'x', description: '', value: 'x', modified: false },
            { key: 'agentFarm.c', type: 'string', default: '', description: '', value: 'set', modified: true }
        ]
    }];
    const prof = SO.snapshotProfile('  work mode  ', cats);
    ok('snapshot keeps only non-default values', JSON.stringify(prof.values) === '{"agentFarm.a":5,"agentFarm.c":"set"}');
    ok('snapshot trims the name', prof.name === 'work mode');

    // profile mentions a but not c → plan sets a (new value) and RESETS c
    const plan = SO.profileApplyPlan({ name: 'p', savedAt: 1, values: { 'agentFarm.a': 9, 'agentFarm.zzz': 1 } }, cats);
    ok('apply plan sets known profile values', plan.some(s => s.key === 'agentFarm.a' && s.value === 9));
    ok('apply plan skips stale unknown keys', !plan.some(s => s.key === 'agentFarm.zzz'));
    ok('apply plan resets modified keys the profile omits (profile = full state)',
        plan.some(s => s.key === 'agentFarm.c' && s.value === undefined) && plan.length === 2);

    const imp = SO.parseImportedProfiles(JSON.stringify([
        { name: 'good', values: { 'agentFarm.a': 1 } },
        { name: 42, values: {} },
        'garbage'
    ]));
    ok('import keeps valid profiles, drops junk', imp.length === 1 && imp[0].name === 'good' && typeof imp[0].savedAt === 'number');
    ok('import survives non-JSON', SO.parseImportedProfiles('not json').length === 0);
}

// ---------- settings page: render, edit routing, focus ----------
{
    const code = fs.readFileSync(path.resolve(__dirname, '../media/settings.js'), 'utf8');
    let posted = [];
    let msgHandler = null;
    let flashed = null;
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
    let setEls = [], resetEls = [];
    const sandbox = {
        acquireVsCodeApi: () => ({ postMessage: (m) => posted.push(m), getState() { }, setState() { } }),
        window: {
            AFCharts: { esc: (s) => String(s) },
            __DATA__: {
                focus: '',
                profiles: [{ name: 'work', savedAt: 1, count: 2 }],
                categories: [{
                    id: 'live', label: 'Live Monitoring & Alerts', items: [
                        { key: 'agentFarm.livePort', type: 'number', default: 0, description: 'listener port', value: 9000, modified: true },
                        { key: 'agentFarm.liveMonitor', type: 'boolean', default: true, description: 'enable', value: true, modified: false },
                        { key: 'agentFarm.guideLanguage', type: 'string', enum: ['en', 'tr'], default: 'en', description: 'guide lang', value: 'en', modified: false },
                        { key: 'agentFarm.agentRoots', type: 'array', default: [], description: 'roots', value: ['D:/x'], modified: true }
                    ]
                }]
            },
            addEventListener: (ev, fn) => { if (ev === 'message') { msgHandler = fn; } }
        },
        document: {
            getElementById: getEl,
            querySelector: (sel) => {
                const m = /data-item="([^"]*)"/.exec(sel);
                if (!m) { return null; }
                flashed = { key: m[1], classes: [], scrollIntoView() { this.scrolled = true; }, classList: { add: (c) => flashed.classes.push(c), remove: () => { } } };
                return flashed;
            },
            querySelectorAll: (sel) => {
                const app = getEl('app');
                const list = [];
                const mk = (re, dsKey) => {
                    let m;
                    while ((m = re.exec(app._html))) {
                        const el = { dataset: { [dsKey]: m[1] }, type: '', value: '', checked: false };
                        el.addEventListener = (_e, fn) => { el._fn = fn; };
                        list.push(el);
                    }
                };
                if (sel === '[data-set]') { mk(/data-set="([^"]*)"/g, 'set'); setEls = list; }
                else if (sel === '[data-reset]') { mk(/data-reset="([^"]*)"/g, 'reset'); resetEls = list; }
                return list;
            }
        },
        setTimeout: () => 0, clearTimeout: () => { }, console, Date
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox); // render()

    const html = getEl('app')._html;
    ok('modified setting marked + resettable', html.includes('class="setitem modified"') && html.includes('data-reset="agentFarm.livePort"'));
    ok('tooltip carries full key + default', html.includes('agentFarm.livePort — default: 0'));
    ok('enum renders as a select with options', /<select[^>]*data-set="agentFarm.guideLanguage"/.test(html) && html.includes('<option value="tr"'));
    ok('array renders as JSON editor with apply', html.includes('data-json="agentFarm.agentRoots"') && html.includes('data-apply="agentFarm.agentRoots"'));
    ok('profile bar lists the saved set', html.includes('work (2)') && html.includes('id="profapply"'));
    ok('unmodified setting has no reset button', !html.includes('data-reset="agentFarm.liveMonitor"'));

    // edit routing: change a number → posts set
    posted = [];
    const port = setEls.find(e => e.dataset.set === 'agentFarm.livePort');
    port.type = 'number'; port.value = '9500';
    port._fn();
    ok('changing a value posts set with the raw value', posted[0] && posted[0].type === 'set' && posted[0].key === 'agentFarm.livePort' && posted[0].value === '9500');

    posted = [];
    resetEls.find(e => e.dataset.reset === 'agentFarm.livePort')._fn();
    ok('reset posts reset', posted[0] && posted[0].type === 'reset' && posted[0].key === 'agentFarm.livePort');

    // host-side validation error surfaces inline at the item
    msgHandler({ data: { type: 'error', key: 'agentFarm.agentRoots', error: 'invalid JSON: boom' } });
    ok('validation error rendered inline', getEl('app')._html.includes('⚠ invalid JSON: boom'));
    ok('error focuses the offending item', flashed && flashed.key === 'agentFarm.agentRoots' && flashed.classes.includes('flash'));

    // deep-link focus message
    flashed = null;
    msgHandler({ data: { type: 'focus', key: 'agentFarm.livePort' } });
    ok('focus message scrolls + flashes the setting', flashed && flashed.key === 'agentFarm.livePort' && flashed.scrolled === true);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
