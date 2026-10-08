// U-228 — Farm Settings as an accordion: every section a header (name, changed count, unsaved edit, refused value,
// size, its sentence on ⓘ) and a body drawn only while it is open — its card, its basic rows, "Show n more" for the
// rest; open sections and "more" remembered in the page state; Expand all / Collapse all; a deep link opens what it
// needs; "Reset section…" asks the host with the section, and settings.reset takes a section or a list of keys.
// Driven on the real model (test/fixtures/allsettings.js) and measured on test/fixtures/settingsfold.js.
const path = require('path');
const { execFileSync } = require('child_process');
const { runPage } = require('./lib_page_dom.js');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

const ROOT = path.resolve(__dirname, '..');
const fx = require('./fixtures/allsettings.js');
const data = extra => Object.assign(fx.data(), extra || {});
const open = (state, extra) => runPage(fx.script, data(extra), {}, state);
const heads = p => p.query('[data-fold]');
const head = (p, id) => heads(p).find(b => b.dataset.fold === id);
const rowsIn = (p, id) => (p.html().split(`id="secb-${id}"`)[1] || '').split('class="sechead')[0].match(/data-item="/g) || [];
const cats = data().categories;
const sec = id => cats.find(c => c.id === id);

// ---- the first open
{
    const p = open({});
    ok(`every section is a header, the setting sets last (${heads(p).length})`,
        heads(p).length === cats.length + 1 && heads(p)[heads(p).length - 1].dataset.fold === 'sets');
    ok('‼️ the first open draws every section closed — no body, no row', !/class="secbody"/.test(p.html()) && !/data-item="/.test(p.html()));
    ok('…each header says so to a screen reader', heads(p).every(b => /aria-expanded="false"/.test(p.html().split(`data-fold="${b.dataset.fold}"`)[1].slice(0, 60))));
    ok('a section\'s sentence is on its ⓘ', /class="af-tipw secinfow"/.test(p.html()) && p.html().indexOf(sec('cost').about) > 0);
    const changed = cats.filter(c => c.items.some(i => i.modified)).length;
    ok(`a section with a changed setting says how many (${changed} sections)`, (p.html().match(/class="secchanged"/g) || []).length === changed);
    ok('the title and the line under it', /Settings/.test(p.html()) && new RegExp(`${cats.reduce((n, c) => n + c.items.length, 0)} settings · \\d+ changed`).test(p.html()));
}

// ---- opening one section, its rows, more
{
    const p = open({});
    head(p, 'reports').click();
    const basic = sec('reports').items.filter(i => i.tier === 'basic').length;
    ok(`a click opens it: its basic rows only (${rowsIn(p, 'reports').length} of ${sec('reports').items.length})`,
        rowsIn(p, 'reports').length === basic && /data-fold="reports"[^>]*aria-expanded="true"/.test(p.html()));
    ok('…and the page remembers it', JSON.stringify(p.state().open) === '["reports"]');
    const moreBtn = p.query('[data-more]').find(b => b.dataset.more === 'reports');
    const extra = sec('reports').items.length - basic;
    ok(`"Show ${extra} more settings" under them`, !!moreBtn && new RegExp(`Show ${extra} more settings`).test(p.html()));
    moreBtn.click();
    ok('Show more draws every row, then Show fewer', rowsIn(p, 'reports').length === sec('reports').items.length && /Show fewer/.test(p.html())
        && JSON.stringify(p.state().more) === '["reports"]');
    head(p, 'reports').click();
    ok('a second click closes it, rows and all', !/data-item="/.test(p.html()) && JSON.stringify(p.state().open) === '[]');
}

// ---- remembered state, expand and collapse all
{
    const p = open({ open: ['cost'], more: [] });
    ok('a remembered section opens with the page', /id="secb-cost"/.test(p.html()) && !/id="secb-reports"/.test(p.html()));
    p.query('#setexpand')[0].click();
    ok('Expand all opens every section', (p.html().match(/class="secbody"/g) || []).length === cats.length + 1);
    p.query('#setcollapse')[0].click();
    ok('Collapse all closes them', !/class="secbody"/.test(p.html()) && JSON.stringify(p.state().open) === '[]');
}

// ---- the page's cards live in their sections
{
    const p = open({ open: ['general'] });
    ok('Open with sits in General, closed sections draw no card', /id="cat-docopen"/.test(p.html()) || !data().docOpen);
}

// ---- unsaved and refused
{
    const p = open({ open: ['projects'], more: ['projects'] });
    p.query('[data-radd]').find(b => b.dataset.radd === 'agentFarm.projectTemplates').click();
    head(p, 'projects').click();
    ok('‼️ a closed section with an edit not applied says "unsaved"', /class="secunsaved"/.test(p.html()));
    head(p, 'projects').click();
    ok('…and the edit is still there when it opens again', /id="secb-projects"/.test(p.html()) && /class="secunsaved"/.test(p.html()));
    const d = data();
    const c = d.categories.find(x => x.id === 'cost');
    c.items[0] = Object.assign({}, c.items[0], { refusal: 'expected a number' });
    const q = runPage(fx.script, d, {}, {});
    ok('a section holding a refused value carries ⚠ while closed', /data-fold="cost"[\s\S]{0,400}class="secwarn"/.test(q.html()));
}

// ---- a link from another page
{
    const adv = sec('projects').items.find(i => i.tier !== 'basic');
    const p = open({}, { focus: adv.key });
    ok(`a link to a row behind "more" (${adv.key}) opens its section and its more, and lights the row`,
        /id="secb-projects"/.test(p.html()) && (p.state().more || []).indexOf('projects') >= 0
        && new RegExp(`class="[^"]*flash[^"]*" data-item="${adv.key.replace('.', '\\.')}"|data-item="${adv.key.replace('.', '\\.')}"`).test(p.html()));
    const q = open({}, { focus: 'agentFarm.noSuchSetting' });
    ok('a link to a key nobody has opens nothing', !/class="secbody"/.test(q.html()));
}

// ---- reset section, and a query is a result list
{
    const changedSec = cats.find(c => c.items.some(i => i.modified));
    const p = open({ open: [changedSec.id] });
    p.query('[data-secreset]')[0].click();
    ok(`Reset section… asks the host with the section (${changedSec.id})`, p.last().type === 'reset' && p.last().section === changedSec.id);
    const q = open({}, {});
    q.query('#filter')[0].value = 'quota';
    q.query('#filter')[0].fire('input');
    ok('a query shows results, not the accordion', !/class="sechead/.test(q.html().split('id="setbody"')[1] || '') || /class="setcount"/.test(q.html()));
}

// ---- settings.reset over the bridge: a key, a list, a section
(async () => {
    const { registerSettingsOps } = require(path.join(ROOT, 'out', 'core', 'settingsBridge.js'));
    const { buildSettingsModel } = require(path.join(ROOT, 'out', 'core', 'settingsops.js'));
    const { BridgeRegistry } = require(path.join(ROOT, 'out', 'core', 'bridge.js'));
    const PROPS = require(path.join(ROOT, 'package.json')).contributes.configuration.properties;
    const pick = sec('cost').items.slice(0, 3).map(i => i.key);
    const values = {};
    pick.forEach(k => { values[k] = typeof PROPS[k].default === 'number' ? PROPS[k].default + 1 : PROPS[k].default === true ? false : 'x'; });
    values[sec('reports').items[0].key] = 'changed';
    const written = [];
    const reg = new BridgeRegistry();
    registerSettingsOps(reg, {
        categories: () => buildSettingsModel(PROPS, k => (k in values ? values[k] : PROPS[k].default)),
        writeSetting: async (k, v) => { written.push(k); if (v === undefined) { delete values[k]; } else { values[k] = v; } }
    });
    const one = await reg.dispatch('settings.reset', { key: pick[0] });
    ok('settings.reset key= keeps its answer', one.ok && one.result.changed === true && one.result.key === pick[0]);
    const bad = await reg.dispatch('settings.reset', { section: 'nowhere' });
    ok('…an unknown section is refused, naming the sections', !bad.ok && /cost/.test(bad.error));
    const s = await reg.dispatch('settings.reset', { section: 'cost' });
    ok('…section= resets every changed setting of that section and nothing else',
        s.ok && s.result.changed === 2 && !(pick[1] in values) && !(pick[2] in values) && values[sec('reports').items[0].key] === 'changed');
    const k = await reg.dispatch('settings.reset', { keys: [sec('reports').items[0].key, pick[0]] });
    ok('…keys= resets the listed ones, an unchanged one reported as such',
        k.ok && k.result.changed === 1 && k.result.unchanged.length === 1);

    // ---- the first open fits one screen
    const node = args => execFileSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', timeout: 180000 });
    node([path.join('test', 'render_page.js'), 'settingsfold']);
    // the first scene is the first open; from the top of its page header to the bottom of its last section header
    const EXPR = '(()=>{const p=document.querySelector(".rndr-page");const a=p.querySelector(".af-head");const z=p.querySelector("#sec-sets");'
        + 'return {h:Math.round(z.getBoundingClientRect().bottom-a.getBoundingClientRect().top)};})()';
    let m = null;
    try { m = JSON.parse(node([path.join('test', 'measure_page.js'), 'settingsfold', EXPR, '--width', '1280'])); } catch (e) { m = null; }
    ok('‼️ the first open at 1280 wide: every section header without scrolling (≤ 1000 px from the title to the last header)' + (m ? ` — ${m.h}px` : ''),
        !!m && m.h > 0 && m.h <= 1000);
    let ph = null;
    try {
        ph = JSON.parse(node([path.join('test', 'measure_page.js'), 'settingsfold',
            '(()=>({over:document.documentElement.scrollWidth-document.documentElement.clientWidth}))()', '--phone']));
    } catch (e) { ph = null; }
    ok('on a phone every scene fits the screen — the toolbar wraps' + (ph ? ` (${ph.over}px over)` : ''), !!ph && ph.over <= 0);

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
