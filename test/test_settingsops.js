// Farm Settings: schema-driven model (category coverage incl. auto "Other"),
// value sanitizing, profile snapshot/apply-plan/import — plus the settings page
// rendering, edit routing and the focus deep-link.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const SO = require(path.join(__dirname, '..', 'out', 'core', 'settingsops.js'));
const { charts } = require('./lib_charts_stub.js');

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

    // ‼️ U-84 (d) — AND "THIS ONE IS A NAME THAT HAS TO EXIST" TRAVELS THE SAME
    // WAY. A string whose only correct values are the agents on THIS machine
    // cannot be a schema `enum`, so the schema names a source and the host fills
    // it in. Same reason as the browse flag above; same `x-` prefix, because a
    // keyword VS Code recognises and cannot validate makes it refuse the whole
    // property (which cost a release once already).
    const picks = SO.buildSettingsModel({
        'agentFarm.anAgent': { type: 'string', 'x-af-values': 'agent', default: '', description: 'a' },
        'agentFarm.plainText': { type: 'string', default: '', description: 't' }
    }, () => '').flatMap(c => c.items);
    ok('a setting that names a value source gets one',
        picks.find(i => i.key === 'agentFarm.anAgent').values === 'agent');
    ok('…and an ordinary string does not',
        picks.find(i => i.key === 'agentFarm.plainText').values === undefined);
    for (const k of ['agentFarm.telegram.defaultAgent', 'agentFarm.wikiAgent']) {
        ok(`${k} asks for the agent picker in the real manifest`,
            props[k] && props[k]['x-af-values'] === 'agent');
    }

    // ‼️ SAVED PROMPTS HAS ITS OWN SECTION. It shipped as one more row under
    // "Display & Labels" and was indistinguishable from a setting nobody had
    // filled in — which is exactly what it looked like for a week while VS Code
    // quietly refused to hand back its default.
    const promptCat = model.find(c => c.id === 'prompts');
    ok('‼️ the prompts file has a section of its own, not a row under Display',
        promptCat && promptCat.items.length === 1
        && promptCat.items[0].key === 'agentFarm.promptSnippetsFile');

    // ‼️ AND ITS DEFAULT IS NOT A PATH. The manifest default was the user's own
    // vault path and the feature depended on the settings registry serving it
    // back; it never did. The path now lives in core/prompts.ts, where it is
    // ours and testable, and the manifest says the honest thing: nothing chosen.
    ok('‼️ the manifest promises no path it cannot deliver',
        props['agentFarm.promptSnippetsFile'].default === '');

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
            AFCharts: charts({ esc: (s) => String(s) }),
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
                        el.addEventListener = (_e, fn) => { if (_e !== 'keydown') { el._fn = fn; } };
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
            AFCharts: charts({ esc: (s) => String(s) }),
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
                    el.addEventListener = (_e, fn) => { if (_e !== 'keydown') { el._fn = fn; } };
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
    // U-224 — typing redraws #setbody alone, so the answer is in that region
    const fhtml = getEl('setbody')._html;
    ok('filter keeps the root containing the match, drops others',
        fhtml.includes('D:/zone/agent/ajanlar') && !fhtml.includes('D:/solo'));
}

// ---------- settings page: Saved prompts section ----------
//
// The section exists to answer "does it work?" with the file's own contents.
// A path in a box could not: it looked identical whether the feature was
// reading two prompts or nothing at all.
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
    const promptCat = {
        id: 'prompts', label: 'Saved prompts', items: [{
            key: 'agentFarm.promptSnippetsFile', type: 'string', browse: 'file',
            default: '', description: 'the file', value: '', modified: false
        }]
    };
    const mkSandbox = (prompts, chosen) => {
        const cat = JSON.parse(JSON.stringify(promptCat));
        cat.items[0].value = chosen || '';
        cat.items[0].modified = !!chosen;
        return {
            acquireVsCodeApi: () => ({ postMessage: (m) => posted.push(m), getState() { }, setState() { } }),
            window: {
                AFCharts: charts({ esc: (s) => String(s) }),
                __DATA__: { focus: '', profiles: [], categories: [cat], prompts },
                addEventListener() { }
            },
            document: { getElementById: getEl, querySelector: () => null, querySelectorAll: () => [] },
            setTimeout: () => 0, clearTimeout: () => { }, console, Date
        };
    };

    const run = (prompts, chosen) => {
        for (const k of Object.keys(els)) { delete els[k]; }
        posted = [];
        const sandbox = mkSandbox(prompts, chosen);
        sandbox.globalThis = sandbox;
        vm.createContext(sandbox);
        vm.runInContext(code, sandbox);
        return getEl('app')._html;
    };

    // -- the working case: the blocks themselves are on the page --
    let html = run({
        file: 'D:\\vault\\Prompts.md', source: 'built-in', builtIn: 'D:\\vault\\Prompts.md', empty: 1,
        items: [
            { label: 'Kod incelemesi', group: 'Review', text: 'Read the flow before you change it.', line: 4 },
            { label: 'Türkçe cevap', group: 'Review', text: 'Answer in Turkish, code in English.', line: 12 }
        ]
    });
    ok('the section has its own heading and nav link',
        html.includes('id="cat-prompts"') && html.includes('data-cat="prompts"'));
    ok('‼️ the section shows what was READ, not just the path',
        html.includes('Kod incelemesi') && html.includes('Read the flow before you change it.')
        && html.includes('<b>2</b> prompt'));
    ok('the heading a block sits under is drawn once, above it', html.includes('promptgrp">Review'));
    ok('empty fenced blocks are accounted for, not silently dropped',
        html.includes('1 empty block'));
    ok('the file it is actually reading is named', html.includes('D:\\vault\\Prompts.md'));
    ok('a built-in path says so rather than looking chosen', html.includes('>built-in<'));
    ok('the path is still hand-editable through the ordinary route',
        html.includes('data-set="agentFarm.promptSnippetsFile"'));
    ok('an unchosen file offers no "back to the built-in path" button',
        !html.includes('id="promptsdefault"'));

    // -- the buttons: the same three gestures the Console picker has --
    posted = [];
    getEl('promptspick').listeners.click();
    getEl('promptsopen').listeners.click();
    getEl('promptsreload').listeners.click();
    ok('Choose · Open · Re-read each post their own message',
        posted.map(m => m.type).join(',') === 'promptsPick,promptsOpen,promptsReload');

    // -- nothing set anywhere: the page says what to do, and where --
    html = run({ file: '', source: 'none', builtIn: 'D:\\vault\\Prompts.md', items: [] });
    ok('with no file the section explains the fix instead of drawing an empty box',
        html.includes('Choose a file…') && html.includes('D:\\vault\\Prompts.md'));
    ok('Open is dead while there is nothing to open', /id="promptsopen"[^>]*disabled/.test(html));

    // -- a chosen file that has gone: the error, and the way back --
    html = run({
        file: '', source: 'none', builtIn: 'D:\\vault\\Prompts.md', items: [],
        error: 'there is no file at D:\\gone.md — your setting still points there'
    });
    ok('a missing chosen file is reported in words, on the page',
        html.includes('⚠ there is no file at D:\\gone.md'));

    // -- the filter finds it by the words a person would actually type --
    html = run({ file: 'D:\\vault\\Prompts.md', source: 'setting', builtIn: 'D:\\b.md', items: [] },
        'D:\\vault\\Prompts.md');
    ok('a chosen file can be handed back to the built-in one', html.includes('id="promptsdefault"'));
    posted = [];
    getEl('promptsdefault').listeners.click();
    ok('…and that posts promptsUseDefault, which REMOVES the key rather than blanking it',
        posted[0] && posted[0].type === 'promptsUseDefault');
    const filterEl = getEl('filter');
    filterEl.value = 'kalıp';
    filterEl.listeners.input();
    ok('filtering by what the feature IS (not its key) keeps the section',
        getEl('setbody')._html.includes('id="cat-prompts"'));
    filterEl.value = 'right-click';
    filterEl.listeners.input();
    ok('…and so does the gesture it hangs off',
        getEl('setbody')._html.includes('id="cat-prompts"'));
}

// ============================================ X-54 — budgets, and whose farm this is
//
// Two faults in one section. The budget example named a real person's agent, in
// Turkish, in a manifest that ships to everybody — and there was no way to
// suspend a budget short of deleting the figures and typing them back in.
{
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    const props = pkg.contributes.configuration.properties;
    const text = Object.values(props)
        .map(p => `${p.description || ''} ${p.markdownDescription || ''}`).join('\n');

    // ‼️ THE SETTINGS MANIFEST IS THE PRODUCT'S FACE. A hard-coded example is
    // read by every user this is ever installed for, so an example naming this
    // installation's own agents — or written in this installation's language —
    // is a private note left in a shipped file. Generic names only.
    ok('‼️ no shipped example names one of THIS farm\'s agents',
        !/\bpsikolog\b/i.test(text));
    ok('…and no example is written in the user\'s own language',
        !/uyku|kaygı|örnek/i.test(text));
    ok('the budget example uses a generic agent name instead',
        /agent_one/.test(props['agentFarm.budgets'].description));

    // The switch: it suspends, it does not clear. A user who has to delete
    // their figures to turn a cap off has to remember them to turn it back on.
    const u = props['agentFarm.budgetsUnlimited'];
    ok('there is a switch that suspends every budget', !!u && u.type === 'boolean');
    ok('…off by default — a ceiling is not removed by an upgrade', u.default === false);
    ok('…and it says the figures are kept, not cleared', /kept, not cleared/.test(u.description));
    // Asked of the model the page actually draws, not of a map the module may
    // or may not export — a check that can quietly answer `true` is not one.
    const cost = SO.buildSettingsModel(props, () => undefined).find(c => c.id === 'cost');
    ok('…and it is drawn in the section with the budgets it suspends',
        !!cost && cost.items.some(i => i.key === 'agentFarm.budgetsUnlimited')
        && cost.items.some(i => i.key === 'agentFarm.budgets'));

    // ‼️ PRINCIPLE 1: a switch honoured in six of seven places is worse than no
    // switch — the cap looks off and something still refuses to run. This is
    // what makes that fail the build rather than somebody's memory.
    const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    const raw = ext.split("get<Record<string, number>>('budgets'").length - 1;
    ok('‼️ every budget reader goes through the one door that honours the switch',
        raw === 1 && /function budgetsNow\(\)/.test(ext));
    ok('…and that door returns an empty map while it is on',
        /budgetsUnlimited', false\)\) \{ return \{\}; \}/.test(ext));
}


// ---------- ‼️ THE KEY VS CODE DROPS, AND THE FILE THAT ANSWERS FOR IT ----------
// Exactly one of the 124 settings this build contributes is missing from the
// running window's configuration registry — `get()` returns undefined instead
// of the declared default and `update()` refuses it by name. A setting that
// vanishes is not a setting, so the reader falls back to the user's own
// settings.json, which is JSONC: comments, trailing commas, and a `//` inside
// every path and URL in the file.
{
    const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    const props = require(path.join(__dirname, '..', 'package.json')).contributes.configuration.properties;
    const jsonc = [
        '{',
        '  // the fleet cap, off while the marathon runs',
        '  "agentFarm.budgetsUnlimited": true,',
        '  "http.proxy": "http://example.test//not-a-comment",',
        '  /* and a block comment */',
        '  "editor.rulers": [80, 120,],',
        '}'
    ].join('\n');
    const stripped = SO.stripJsonc(jsonc);
    ok('a comment does not survive the strip', !/the fleet cap/.test(stripped));
    ok('…but a // inside a string does', /example\.test\/\/not-a-comment/.test(stripped));
    ok('a trailing comma is dropped so the file parses at all',
        (() => { try { JSON.parse(stripped); return true; } catch { return false; } })());
    ok('a comma inside a string is not a trailing comma',
        JSON.parse(SO.stripJsonc('{"a": "one, two" }')).a === 'one, two');

    ok('the switch is read out of the file the registry lost it from',
        SO.readFlatSetting(jsonc, 'agentFarm.budgetsUnlimited').value === true);
    ok('‼️ false is told apart from absent — that is why there is a found flag',
        JSON.stringify(SO.readFlatSetting('{"agentFarm.budgetsUnlimited": false}', 'agentFarm.budgetsUnlimited'))
        === '{"found":true,"value":false}'
        && SO.readFlatSetting(jsonc, 'agentFarm.livePort').found === false);
    ok('the nested spelling VS Code also accepts is read too',
        SO.readFlatSetting('{"agentFarm": {"budgetsUnlimited": true}}', 'agentFarm.budgetsUnlimited').value === true);
    ok('a settings.json somebody broke answers nothing rather than throwing',
        SO.readFlatSetting('{ not json at all', 'agentFarm.budgetsUnlimited').found === false);

    ok('‼️ the budget door reads through the fallback, not the registry alone',
        /cfgValue<boolean>\('agentFarm\.budgetsUnlimited', false\)/.test(ext));
    const panelSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'panels', 'settingsPanel.ts'), 'utf8');
    ok('…and every value the settings page draws comes through the same door',
        /buildSettingsModel\(\s*settingsSchema\(\), cfgValueRaw, settingRowNotes\)/.test(ext) && /refusalOf: cfgRefusal,/.test(ext)
        // X-470 — the page draws the host's ONE model; it once built its own through cfg.get and never saw a refusal
        && /categories: settingsCategories,/.test(ext) && /return this\.deps\.categories\(\);/.test(panelSrc) && !/buildSettingsModel\(/.test(panelSrc));
    // M-28: the refusal used to end in a line for the user to paste. The write
    // side now has the same fallback the read side has (test_jsonc_patch.js).
    ok('a refusal is answered by writing the file, not by handing the user a line',
        /not a registered configuration/i.test(ext) && /patchUserSetting\(key, value\)/.test(ext));
    ok('…and 0 in a budgets figure is documented as the second way to lift a cap',
        /A figure of 0 means NO CAP/.test(props['agentFarm.budgets'].description));
}

// ---------- ‼️ X-84: the fallback read is not a second settings engine ----------
{
    const pkg = require(path.join(__dirname, '..', 'package.json'));
    const props = pkg.contributes.configuration.properties;

    // --- which file: the profile is already in the path the host handed us ---
    const G = SO.userFolderFromGlobalStorage;
    ok('default profile → the User folder above globalStorage',
        G('C:\\Users\\x\\AppData\\Roaming\\Code\\User\\globalStorage\\muvusoft.agent-farm')
        === 'C:\\Users\\x\\AppData\\Roaming\\Code\\User');
    ok('‼️ a NAMED profile resolves to its own folder, not the default one',
        G('C:\\Users\\x\\AppData\\Roaming\\Code\\User\\profiles\\-1a2b3c\\globalStorage\\muvusoft.agent-farm')
        === 'C:\\Users\\x\\AppData\\Roaming\\Code\\User\\profiles\\-1a2b3c');
    ok('Insiders is a different user-data root and is followed there',
        G('C:\\Users\\x\\AppData\\Roaming\\Code - Insiders\\User\\globalStorage\\muvusoft.agent-farm')
        === 'C:\\Users\\x\\AppData\\Roaming\\Code - Insiders\\User');
    ok('a portable install keeps its own data folder',
        G('D:/apps/VSCode/data/user-data/User/globalStorage/muvusoft.agent-farm')
        === 'D:/apps/VSCode/data/user-data/User');
    ok('posix separators survive as posix',
        G('/home/x/.config/Code/User/globalStorage/ext') === '/home/x/.config/Code/User');
    ok('a shape we do not recognise falls back rather than inventing a path',
        G('') === undefined && G('/tmp/whatever') === undefined);

    // --- which scope: folder over workspace over user, the way VS Code does ---
    const files = {
        '/ws/.vscode/settings.json': '{ "agentFarm.livePort": 1 }',
        '/ws/team.code-workspace': '{ "settings": { "agentFarm.livePort": 2, "agentFarm.claudeDir": "/w" } }',
        '/user/settings.json': '{ "agentFarm.livePort": 3, "agentFarm.claudeDir": "/u", "agentFarm.guideLanguage": "tr" }'
    };
    const read = f => files[f] || '';
    const chain = [
        { file: '/ws/.vscode/settings.json' },
        { file: '/ws/team.code-workspace', nested: 'settings' },
        { file: '/user/settings.json' }
    ];
    ok('the folder value wins over the workspace and the user file',
        SO.readSettingScoped(chain, read, 'agentFarm.livePort').value === 1);
    ok('‼️ a .code-workspace carries its settings under one key and is read there',
        SO.readSettingScoped(chain, read, 'agentFarm.claudeDir').value === '/w');
    ok('…and the user file still answers what no closer scope set',
        SO.readSettingScoped(chain, read, 'agentFarm.guideLanguage').value === 'tr');
    ok('a key nobody set is not found — not defaulted here',
        SO.readSettingScoped(chain, read, 'agentFarm.nothing').found === false);
    ok('a missing or unreadable file is skipped, not fatal',
        SO.readSettingScoped([{ file: '/gone' }, { file: '/user/settings.json' }], read,
            'agentFarm.livePort').value === 3);
    ok('the scope that answered is named, so a refusal can say where',
        SO.readSettingScoped(chain, read, 'agentFarm.claudeDir').file === '/ws/team.code-workspace');

    // --- which shape: the manifest's, or it is refused ---
    const boolSpec = props['agentFarm.budgetsUnlimited'];
    ok('‼️ THE BUG: a quoted "false" is NOT a boolean and does not lift every cap',
        SO.schemaCheck(boolSpec, 'false').ok === false);
    ok('…nor does a quoted "true" sneak in the other way',
        SO.schemaCheck(boolSpec, 'true').ok === false);
    ok('a real boolean passes, both ways round',
        SO.schemaCheck(boolSpec, true).value === true && SO.schemaCheck(boolSpec, false).value === false);
    ok('a number typed as a string is refused rather than cast',
        SO.schemaCheck({ type: 'number' }, '8080').ok === false
        && SO.schemaCheck({ type: 'number' }, 8080).value === 8080);
    ok('an object where an array was declared is refused, and vice versa',
        SO.schemaCheck({ type: 'array' }, { a: 1 }).ok === false
        && SO.schemaCheck({ type: 'object' }, [1]).ok === false
        && SO.schemaCheck({ type: 'array' }, [1]).ok === true
        && SO.schemaCheck({ type: 'object' }, { a: 1 }).ok === true);
    ok('an enum only accepts what it lists',
        SO.schemaCheck({ type: 'string', enum: ['en', 'tr'] }, 'de').ok === false
        && SO.schemaCheck({ type: 'string', enum: ['en', 'tr'] }, 'tr').value === 'tr');
    ok('null in the file is not a value — it is an absence',
        SO.schemaCheck({ type: 'string' }, null).ok === false);
    ok('an integer satisfies a number, and NaN satisfies nothing',
        SO.schemaCheck({ type: 'number' }, 3).ok === true
        && SO.schemaCheck({ type: 'number' }, NaN).ok === false);
    ok('a key the manifest does not declare has no contract to break',
        SO.schemaCheck(undefined, 'anything').value === 'anything');
    ok('a refusal says what was expected, so the page can print it',
        /expected boolean, got string/.test(SO.schemaCheck(boolSpec, 'false').reason));

    // --- every real setting in the manifest survives its own default ---
    let selfRefused = [];
    for (const [k, p] of Object.entries(props)) {
        if (p.default === undefined || p.default === null) { continue; }
        if (!SO.schemaCheck(p, p.default).ok) { selfRefused.push(k); }
    }
    ok('‼️ no manifest default is refused by the check that guards it: ' + selfRefused.join(', '),
        selfRefused.length === 0);

    // --- the refusal is not held in private ---
    const model = SO.buildSettingsModel(
        { 'agentFarm.budgetsUnlimited': props['agentFarm.budgetsUnlimited'] },
        () => undefined,
        { refusalOf: k => (k === 'agentFarm.budgetsUnlimited' ? 'settings.json: expected boolean, got string' : undefined) });
    ok('a refused value reaches the page as a refusal on that row',
        /expected boolean/.test(model[0].items[0].refusal || ''));
    ok('…and a key with nothing to refuse carries no note',
        SO.buildSettingsModel({ 'agentFarm.budgetsUnlimited': props['agentFarm.budgetsUnlimited'] },
            () => true)[0].items[0].refusal === undefined);
    const page = fs.readFileSync(path.join(__dirname, '..', 'media', 'settings.js'), 'utf8');
    ok('the page actually draws it', /it\.refusal/.test(page));

    // --- and every reader is behind the door, not beside it ---
    const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    ok('‼️ cfg() IS the door — the ~200 readers cannot see a different value than the page',
        /const cfg = afConfig;/.test(ext));
    const strays = [];
    for (const f of ['src/extension.ts', 'src/panels/base.ts', 'src/panels/consolePanel.ts',
        'src/panels/dashboard.ts', 'src/panels/guide.ts', 'src/panels/turnsPanel.ts', 'src/views/trees.ts']) {
        // a call broken across lines is one call — join it back before judging
        const t = fs.readFileSync(path.join(__dirname, '..', f), 'utf8')
            .replace(/getConfiguration\((['"])agentFarm\1\)\s*\n\s*/g, "getConfiguration('agentFarm')");
        for (const line of t.split('\n')) {
            // writes must stay with the real configuration; only READS are the bug
            if (/getConfiguration\(['"]agentFarm['"]\)/.test(line) && !/getConfiguration\(['"]agentFarm['"]\)\s*\.update\(/.test(line)) {
                strays.push(f + ': ' + line.trim().slice(0, 60));
            }
        }
    }
    ok('‼️ no reader goes round the door: ' + strays.join(' | '), strays.length === 0);
    ok('the door is installed before the first setting is read',
        ext.indexOf('installSettingsDoor(context)') > 0
        && ext.indexOf('installSettingsDoor(context)') < ext.indexOf('let agents: AgentInfo[]'));
}

// ---- X-193 — which settings take PATHS, and what those paths really are -----
//
// DENSITY: a row that holds `${vault}/00_AGENT_AREA/…` must show the folder it
// actually opens, in the row, without a click. Two rules make that safe to
// build: WHICH settings get the treatment is derived from their own schema (a
// hand-written list of keys goes stale the first time somebody adds one — the
// disease `x-af-browse` was introduced to cure), and the resolver is asked ONCE
// per setting rather than once per row.
{
    const cats = [{
        id: 'sentry', label: 'Sentry — unattended campaigns', items: [
            {
                key: 'agentFarm.sentryTemplatesFile', type: 'string', browse: 'file',
                value: '${vault}/nobet.md', default: '', modified: true, description: ''
            },
            {
                key: 'agentFarm.handoverFolders', type: 'array',
                shape: { kind: 'list', itemType: 'string', itemBrowse: 'folder' },
                value: ['${vault}/x', '${nope}/y'], default: [], modified: true, description: ''
            },
            {
                key: 'agentFarm.sentryLeaderModel', type: 'string',
                value: 'haiku', default: '', modified: true, description: ''
            }
        ]
    }];
    const asked = [];
    const out = SO.pathPreviews(cats, (ts) => {
        asked.push(ts);
        return ts.map(t => ({ template: t, path: t ? 'R:' + t : '', ok: !!t, why: '' }));
    });
    ok('a setting whose schema names a browse target is a path setting',
        !!out['agentFarm.sentryTemplatesFile'] && !!out['agentFarm.handoverFolders']);
    ok('...and one that does not is left alone — no hand-written list of keys',
        !out['agentFarm.sentryLeaderModel']);
    ok('a scalar path is previewed as one row',
        out['agentFarm.sentryTemplatesFile'].length === 1
        && out['agentFarm.sentryTemplatesFile'][0].path === 'R:${vault}/nobet.md');
    ok('a list is previewed row by row, in the order it is drawn',
        out['agentFarm.handoverFolders'].map(r => r.template).join('|') === '${vault}/x|${nope}/y');
    ok('‼️ the resolver is asked ONCE per setting, never once per row',
        asked.length === 2);
    ok('a path setting that is empty asks nothing rather than asking for nothing',
        !SO.pathPreviews([{
            id: 'sentry', label: 'S', items: [{
                key: 'agentFarm.sentryTemplatesFile', type: 'string', browse: 'file',
                value: '', default: '', modified: false, description: ''
            }]
        }], () => { throw new Error('must not be asked'); })['agentFarm.sentryTemplatesFile']);
}

// S-82 — a text the schema says is several lines gets a text box, read off the schema
{
    const cats = SO.buildSettingsModel({
        'agentFarm.batonHandoverTemplate': { type: 'string', default: '', editPresentation: 'multilineText', description: 't' },
        'agentFarm.agentsRoot': { type: 'string', default: '', description: 'r' }
    }, () => '');
    const items = [].concat(...cats.map(c => c.items));
    const tpl = items.find(i => i.key === 'agentFarm.batonHandoverTemplate');
    ok('S-82: editPresentation multilineText marks the item multiline', !!tpl && tpl.multiline === true);
    ok('…and filed under the handover discipline', cats.some(c => c.id === 'discipline' && c.items.includes(tpl)));
    ok('…a plain string is not', !items.find(i => i.key === 'agentFarm.agentsRoot').multiline);
    const page = require('fs').readFileSync(path.join(__dirname, '..', 'media', 'settings.js'), 'utf8');
    ok('…and the page draws it as a textarea that saves like any other box (data-set)',
        /if \(it\.multiline\) \{[\s\S]{0,200}<textarea id="\$\{id\}" data-set=/.test(page));
    ok('…in its own group of the discipline page', /keys: \['batonHandoverTemplate', 'batonInjectedDirective'\]/.test(page));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
