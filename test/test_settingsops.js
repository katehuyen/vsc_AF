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

    // the work-queue feature's settings live under their own category
    const queue = model.find(c => c.id === 'queue');
    ok('work queue settings categorised (not leaking to Other)', queue &&
        ['agentFarm.answerDir', 'agentFarm.queue.groupSize', 'agentFarm.queue.maxAgeHours', 'agentFarm.queue.targets']
            .every(k => queue.items.some(i => i.key === k)));

    // a setting invented tomorrow lands in Other automatically
    const m2 = SO.buildSettingsModel({ ...props, 'agentFarm.futureThing': { type: 'string', default: 'x', description: 'd' } }, () => undefined);
    const other2 = m2.find(c => c.id === 'other');
    ok('an unknown new setting lands in Other automatically', other2 && other2.items.some(i => i.key === 'agentFarm.futureThing'));

    // ‼️ S-11: "this one is a path" travels in the SCHEMA, like everything else
    // this page renders — a hand-written list of path keys on the page would go
    // stale the first time somebody forgot to add to it.
    const paths = SO.buildSettingsModel({
        'agentFarm.aFile': { type: 'string', 'x-af-browse': 'file', default: '', description: 'f' },
        'agentFarm.aFolder': { type: 'string', 'x-af-browse': 'folder', default: '', description: 'd' },
        'agentFarm.plainText': { type: 'string', default: '', description: 't' }
    }, () => '').flatMap(c => c.items);
    ok('a file setting earns a file picker',
        paths.find(i => i.key === 'agentFarm.aFile').browse === 'file');
    ok('…a folder setting a folder one',
        paths.find(i => i.key === 'agentFarm.aFolder').browse === 'folder');
    ok('…and an ordinary string stays an ordinary box',
        paths.find(i => i.key === 'agentFarm.plainText').browse === undefined);
    ok('the prompt snippets file declares itself a path in the real manifest',
        props['agentFarm.promptSnippetsFile']
        && props['agentFarm.promptSnippetsFile']['x-af-browse'] === 'file');

    // ‼️ AND NOT WITH `format`, WHICH VS CODE REFUSES THE WHOLE PROPERTY OVER —
    // the setting then has no registered default and its box draws empty, which
    // is exactly what it looked like. Checked across the manifest, so the next
    // path setting cannot reintroduce it.
    const withFormat = Object.entries(props).filter(([, p]) => p.format !== undefined);
    ok('‼️ no agentFarm setting uses `format` — VS Code drops the property',
        withFormat.length === 0);
    for (const [k] of withFormat) { console.log('    · ' + k + ' declares a `format` VS Code will choke on'); }
    ok('every setting the manifest offers still has a default',
        Object.entries(props).every(([, p]) => p.default !== undefined));
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
    const code = require(path.join(__dirname, 'lib_shared_media.js')).sharedMedia()
        + fs.readFileSync(path.resolve(__dirname, '../media/settings.js'), 'utf8');
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

// ---------- settings page: Agent folders section ----------
{
    const code = require(path.join(__dirname, 'lib_shared_media.js')).sharedMedia()
        + fs.readFileSync(path.resolve(__dirname, '../media/settings.js'), 'utf8');
    let posted = [];
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
    const wired = {}; // selector-ish key -> [{dataset, _fn}]
    const sandbox = {
        acquireVsCodeApi: () => ({ postMessage: (m) => posted.push(m), getState() { }, setState() { } }),
        window: {
            AFCharts: { esc: (s) => String(s) },
            __DATA__: {
                focus: '', profiles: [], categories: [],
                folders: {
                    reports: [
                        {
                            root: 'D:/zone/agent/ajanlar', kind: 'nest', duplicate: false,
                            candidates: [
                                { dir: 'D:/zone/agent/ajanlar/dev', name: 'dev', excluded: false, agentId: 'id-dev' },
                                { dir: 'D:/zone/agent/ajanlar/psikolog', name: 'psikolog', excluded: true, agentId: '' }
                            ]
                        },
                        { root: 'd:/zone/agent/ajanlar', kind: 'plain', duplicate: true, candidates: [] },
                        { root: 'D:/gone', kind: 'missing', duplicate: false, candidates: [] },
                        {
                            root: 'D:/solo', kind: 'single-agent', duplicate: false,
                            candidates: [{ dir: 'D:/solo', name: 'solo', excluded: false, agentId: 'id-solo' }]
                        }
                    ],
                    excludes: ['D:\\zone\\agent\\ajanlar\\PSIKOLOG', 'D:/stale/old']
                }
            },
            addEventListener() { }
        },
        document: {
            getElementById: getEl,
            querySelector: () => null,
            querySelectorAll: (sel) => {
                const app = getEl('app');
                const m = /^\[data-(rootremove|rootreveal|exclude|include|openagent)\]$/.exec(sel);
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
                wired[key] = list;
                return list;
            }
        },
        setTimeout: () => 0, clearTimeout: () => { }, console, Date
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox); // render()

    const html = getEl('app')._html;
    ok('folders section + nav link rendered', html.includes('id="cat-folders"') && html.includes('data-cat="folders"'));
    ok('nest badge counts live + excluded', html.includes('nest · 1 agent(s) · 1 excluded'));
    ok('nest explanation says shared instructions, not an agent', html.includes('shared instructions'));
    ok('duplicate root warns + offers cleanup', html.includes('duplicate entry') && html.includes('id="afcleandupes"'));
    ok('missing root badged', html.includes('folder missing'));
    ok('single-agent root badged', html.includes('single agent'));
    ok('excluded agent greyed with Include', /class="agchip agexcl"[^>]*psikolog/.test(html.replace(/\n/g, ' '))
        && html.includes('data-include="D:/zone/agent/ajanlar/psikolog"'));
    ok('live agent links to its page + offers Exclude', html.includes('data-openagent="id-dev"')
        && html.includes('data-exclude="D:/zone/agent/ajanlar/dev"'));
    ok('stale exclude listed for removal (norm-insensitive match keeps psikolog out)',
        html.includes('D:/stale/old') && !html.includes('data-include="D:\\zone\\agent\\ajanlar\\PSIKOLOG"'));

    // click routing
    posted = [];
    getEl('rootadd').listeners.click();
    ok('+ Add root posts rootAdd', posted[0] && posted[0].type === 'rootAdd');
    posted = [];
    getEl('afcleandupes').listeners.click();
    ok('Clean duplicates posts rootCleanDupes', posted[0] && posted[0].type === 'rootCleanDupes');
    posted = [];
    wired.rootremove.find(e => e.dataset.rootremove === 'D:/gone')._fn();
    ok('Remove posts rootRemove with the root', posted[0] && posted[0].type === 'rootRemove' && posted[0].root === 'D:/gone');
    posted = [];
    wired.exclude.find(e => e.dataset.exclude === 'D:/zone/agent/ajanlar/dev')._fn();
    ok('Exclude posts agentExclude with the dir', posted[0] && posted[0].type === 'agentExclude' && posted[0].dir === 'D:/zone/agent/ajanlar/dev');
    posted = [];
    wired.include.find(e => e.dataset.include === 'D:/stale/old')._fn();
    ok('stale Remove posts agentInclude', posted[0] && posted[0].type === 'agentInclude' && posted[0].dir === 'D:/stale/old');
    posted = [];
    wired.openagent.find(e => e.dataset.openagent === 'id-dev')._fn();
    ok('agent name opens the agent page', posted[0] && posted[0].type === 'openAgent' && posted[0].agentId === 'id-dev');
    posted = [];
    wired.rootreveal.find(e => e.dataset.rootreveal === 'D:/solo')._fn();
    ok('Reveal posts rootReveal', posted[0] && posted[0].type === 'rootReveal' && posted[0].root === 'D:/solo');

    // filter narrows to matching roots/agents only
    const filterEl = getEl('filter');
    filterEl.value = 'psikolog';
    filterEl.listeners.input();
    const fhtml = getEl('app')._html;
    ok('filter keeps the root containing the match, drops others',
        fhtml.includes('D:/zone/agent/ajanlar') && !fhtml.includes('D:/solo'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
