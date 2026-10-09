// U-224 — the Settings page's results view (media/afSettingResults.js): what a query or the
// Changed chip shows, that typing redraws #setbody only (the box is never rebuilt), the box's
// keys, and the empty state. Drawn over EVERY setting package.json declares.
const path = require('path');
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

const R = require('../media/afSettingResults.js');
const S = require('../media/afSettingSearch.js');
const { buildSettingsModel } = require('../out/core/settingsops.js');
const fx = require(path.join(__dirname, 'fixtures', 'jsonsettings.js'));

const pkg = require('../package.json');
const props = {};
for (const c of [].concat(pkg.contributes.configuration)) { Object.assign(props, c.properties || {}); }
const CHANGED = 'agentFarm.livePort';
const model = () => buildSettingsModel(props, k => (k === CHANGED ? 12345 : props[k].default));
// U-226 — each row already carries its place (Section › Group), filed by the catalog
const flat = model().flatMap(c => c.items);

// ---------- the module ----------
{
    const cats = model();
    const none = R.view(cats, '', false);
    ok('no query: every section in the page\'s own order',
        none.cats.map(c => c.id).join() === cats.filter(c => c.items.length).map(c => c.id).join());
    const changed = R.view(cats, '', true);
    ok('Changed alone: only the changed row', changed.count === 1 && changed.cats[0].items[0].key === CHANGED);
    const port = R.view(cats, 'port', false);
    const order = port.cats.flatMap(c => c.items.map(it => it.key));
    ok('a query: the count is the ranker\'s', port.count === S.rank(flat, 'port').length && order.length === port.count);
    ok('…the best result\'s section comes first', port.cats[0].items[0].key === S.rank(flat, 'port')[0].item.key);
    ok('…each result knows its section and group, for the location line',
        port.cats.every(c => c.items.every(it => it.place === c.label + ' › ' + (c.groups.find(g => g.id === it.group) || {}).label)));
    ok('…and the page\'s data is not touched', port.cats.every(c => c.items.every(it => !cats.some(m => m.items.includes(it)))));
    ok('the location line names the section', R.placeHtml({ where: 'Live' }, String) === '<div class="setplace">Live</div>');
    ok('…and nothing outside a result', R.placeHtml({ key: 'x' }, String) === '');
    ok('Changed and a query together', R.view(cats, 'port', true).count === 1);
}

{
    // leading edge at once (the tests stay synchronous); the rest coalesce into one trailing call
    const timers = [];
    global.setTimeout = (fn) => { timers.push(fn); return timers.length; };
    let n = 0;
    const run = R.throttle(() => { n++; }, 120);
    run(); run(); run();
    ok('throttle: the first call runs at once, the next two wait', n === 1);
    timers.shift()();
    ok('…and land as ONE call when the window closes', n === 2);
    timers.shift()();
    ok('…and nothing more is owed', n === 2 && timers.length === 0);
}

{
    let on = null;
    const doc = { addEventListener: (ev, fn) => { if (ev === 'keydown') { on = fn; } } };
    let focused = 0, prevented = 0;
    const box = { focus: () => { focused++; }, select() { } };
    R.keys(doc, () => box);
    const press = (key, target, extra) => on(Object.assign({ key, target, preventDefault: () => { prevented++; } }, extra));
    press('/', { tagName: 'DIV' });
    ok('"/" on the page puts the caret in the search box', focused === 1 && prevented === 1);
    press('/', { tagName: 'INPUT' });
    ok('…but "/" typed into a box is a slash', focused === 1);
    press('f', { tagName: 'INPUT' }, { ctrlKey: true });
    ok('Ctrl+F reaches the box from anywhere, a box included', focused === 2 && prevented === 2);
    R.keys({}, () => box);
    ok('a document with no listener API is left alone', true);
}

// ---------- the page ----------
const open = (extra) => runPage(fx.script, Object.assign(fx.data(), { folders: null, categories: model() }, extra || {}));
const keysOn = p => [...p.html().matchAll(/data-item="([^"]+)"/g)].map(m => m[1]);
const type = (p, q) => {
    const box = p.sandbox.document.getElementById('filter');
    box.value = q;
    box.fire('input');
    return box;
};

{
    const p = open();
    const before = p.sandbox.document.getElementById('filter');
    ok('the body is its own region', /<div id="setbody">/.test(p.html()));
    // U-226 — every row carries its place now; only a RESULT draws it
    ok('‼️ with no query no row draws a location line', !/class="setplace"/.test(p.html()));
    type(p, 'sound');
    ok('‼️ typing does not rebuild the search box (the same element, once in the page)',
        p.sandbox.document.getElementById('filter') === before && p.html().split('id="filter"').length === 2);
    const top = keysOn(p).slice(0, 5);
    ok('‼️ "sound": the sound settings are the first five results (' + top.join(', ') + ')',
        top.length === 5 && top.every(k => /^agentFarm\.alerts\./.test(k)));
    const n = S.rank(flat, 'sound').length;
    ok('the count says how many settings matched', p.html().includes(`<div class="setcount" role="status">${n} settings</div>`));
    ok('each result carries its location line', /class="setplace"/.test(p.html()));

    type(p, 'port');
    const order = keysOn(p);
    const named = ['agentFarm.livePort', 'agentFarm.web.port', 'agentFarm.remote.port'].map(k => order.indexOf(k));
    const report = order.findIndex(k => /report/i.test(k));
    ok('‼️ "port": livePort, web.port and remote.port before every key that only says report',
        named.every(i => i >= 0) && (report < 0 || Math.max(...named) < report));

    // two body redraws later, a control still answers ONCE
    p.posted.length = 0;
    ok('the hit is marked in the name and the summary',
        /class="setname">[^<]*<mark>port<\/mark>/i.test(p.html()) && /class="setsum">[^<]*<mark>port<\/mark>/i.test(p.html()));
    // (the shim reads a dot in a selector as a class, so the key is matched off the dataset)
    const box = p.query('[data-set]').filter(e => e.dataset.set === 'agentFarm.livePort');
    ok('one control per row after the body was redrawn twice', box.length === 1);
    box[0].value = '4242';
    box[0].fire('change');
    ok('…and it posts its change once', p.posted.filter(m => m.type === 'set' && m.key === 'agentFarm.livePort').length === 1);

    p.sandbox.document.getElementById('filter').fire('keydown', { key: 'ArrowDown' });
    const first = order[0].replace(/^agentFarm\./, '');
    ok('ArrowDown from the box goes to the first result\'s control',
        p.sandbox.document.activeElement && p.sandbox.document.activeElement.id === 'c-' + first);
}

{
    const p = open();
    const all = keysOn(p).length;
    type(p, 'zzzqqq');
    ok('nothing found: the empty state says the query back', /No setting matches (&quot;|")zzzqqq(&quot;|")\./.test(p.html()));
    ok('…with no count above it', !/class="setcount"/.test(p.html()));
    p.sandbox.document.getElementById('setclear').fire('click');
    ok('…and Show all brings every section back with an empty box',
        p.sandbox.document.getElementById('filter').value === '' && all > 100 && keysOn(p).length === all);
}

{
    const p = open();
    ok('the Changed chip counts the changed settings', /id="setchanged"[^>]*>Changed \(1\)</.test(p.html()));
    const chip = () => p.sandbox.document.getElementById('setchanged');
    chip().fire('click');
    ok('‼️ Changed: only the changed setting is shown', keysOn(p).join() === CHANGED);
    ok('…the chip is drawn pressed, and keeps the focus it was pressed with',
        /class="secondary small setchip on" id="setchanged" aria-pressed="true"/.test(p.html())
        && p.sandbox.document.activeElement === chip());
    type(p, 'sound');
    ok('Changed with a query that misses it: the empty state says so',
        /No setting matches/.test(p.html()) && /only changed settings are searched/.test(p.html()));
    type(p, 'port');
    ok('Changed with a query that finds it: that one row', keysOn(p).join() === CHANGED);
    chip().fire('click');
    ok('…and off again: every port result, the query kept in the box',
        keysOn(p).length === S.rank(flat, 'port').length && /id="filter"[^>]*value="port"/.test(p.html()));
}

{
    const p = runPage(fx.script, Object.assign(fx.data(), { folders: null,
        categories: buildSettingsModel(props, k => props[k].default) }));
    ok('nothing changed: no chip', !/id="setchanged"/.test(p.html()));
}

{
    // the palette's Find Setting…: one row per setting — the name its key implies, its section, its key
    const Module = require('module');
    const load = Module._load;
    Module._load = function (req, ...rest) { return req === 'vscode' ? {} : load.call(this, req, ...rest); };
    const { settingPicks } = require('../out/findSetting.js');
    Module._load = load;
    const picks = settingPicks(model());
    const live = picks.find(p => p.key === CHANGED);
    ok('Find Setting… lists every setting', picks.length === flat.length);
    ok('…by its name, with its section (and that it is changed) and its key',
        live && live.label === require('../out/core/settingsCatalog/index.js').catalogEntry('livePort').label
        && /· changed$/.test(live.description) && live.detail === CHANGED);
    const cmd = pkg.contributes.commands.find(c => c.command === 'agentfarm.findSetting');
    ok('…and it is in the command palette as Agent Farm: Find Setting…', cmd && cmd.category === 'Agent Farm' && /^Find Setting/.test(cmd.title));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
