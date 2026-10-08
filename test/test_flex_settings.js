// U-152 — Farm Settings ▸ Flow & Content: the card is DERIVED from the flex
// registry (a new point gains its row with nobody touching the page), a value is
// written where its point says — inside an object setting without disturbing its
// other fields — and the card's messages call the same actions as flex.set and
// presets.*.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`, JSON.stringify(got) === JSON.stringify(want));

const Flex = require(path.join(ROOT, 'media', 'afFlex.js'));
const A = require(path.join(ROOT, 'out', 'core', 'flexActions.js'));
const { flexCardMessage } = require(path.join(ROOT, 'out', 'panels', 'settingsFlex.js'));
const { BridgeRegistry } = require(path.join(ROOT, 'out', 'core', 'bridge.js'));
const { registerFlexOps } = require(path.join(ROOT, 'out', 'core', 'flexBridge.js'));

const store = (init) => {
    const s = JSON.parse(JSON.stringify(init || {}));
    return { s, deps: { readSetting: k => s[k], writeSetting: async (k, v) => { if (v === undefined) { delete s[k]; } else { s[k] = v; } } } };
};

// The page, in a sandbox, with a stand-in for the few helpers it uses.
const sandbox = { window: { AFTip: { wrap: (t) => t } } };
for (const f of ['afRecipes.js', 'afFlex.js', 'afFlexForms.js', 'afFlexSettings.js']) {
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'media', f), 'utf8'), sandbox);
}
const Page = sandbox.window.AFFlexSettings;
const C = {
    esc: s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'),
    option: (v, label, o) => `<option value="${v}"${o && o.selected ? ' selected' : ''}>${label}</option>`
};

/* ---------- ‼️ the card is derived from the registry ---------- */
{
    const { deps } = store();
    const st = A.flexSettingsState(deps);
    eq('one row per point with a Farm Settings level, in registry order', st.points.map(p => p.id),
        Flex.POINTS.filter(p => p.levels.settings).map(p => p.id));
    ok('untouched = every row built-in', st.points.every(p => p.from === 'builtin'));
    ok('…and Balanced is in effect', st.presets.find(p => p.name === 'Balanced').matches);

    Flex.POINTS.push({
        id: 'test.newPoint', label: 'A point added tomorrow', type: 'number', default: 7, remembered: false,
        levels: { settings: { surface: 'setting:agentFarm.testNew', bridge: 'settings.set:agentFarm.testNew' } }
    });
    try {
        const grown = A.flexSettingsState(deps);
        ok('‼️ a point added to the registry gains its row with nobody touching the card',
            grown.points.length === st.points.length + 1 && grown.points.some(p => p.id === 'test.newPoint'));
        ok('…and the page draws it', /A point added tomorrow/.test(Page.html(grown, C, '')));
    } finally { Flex.POINTS.pop(); }
}

/* ---------- a value is written where its point says ---------- */
(async () => {
    {
        const { s, deps } = store({ 'agentFarm.taskRetry': { max: 3, supervisor: { engine: 'claude' } } });
        const r = await A.setFlexSetting(deps, 'retry.supervisor.maxCalls', 4);
        eq('‼️ inside an object setting, its other fields kept', s['agentFarm.taskRetry'], { max: 3, supervisor: { engine: 'claude', maxCalls: 4 } });
        eq('…and it answers resolved', r.sentence, '4 — from Farm Settings; built-in default 2');
        await A.setFlexSetting(deps, 'retry.supervisor.maxCalls', undefined);
        eq('back to inherited removes only that field', s['agentFarm.taskRetry'], { max: 3, supervisor: { engine: 'claude' } });
        await A.setFlexSetting(deps, 'judge.args', '--model x');
        eq('a flat setting is written as it is', s['agentFarm.judgeArgs'], '--model x');
        await A.setFlexSetting(deps, 'judge.args', undefined);
        ok('…and removed as it is', !('agentFarm.judgeArgs' in s));
        const into = store({});
        await A.setFlexSetting(into.deps, 'retry.supervisor.minConfidence', 0.8);
        eq('into a setting that was never written, the object is made', into.s['agentFarm.taskRetry'], { supervisor: { minConfidence: 0.8 } });
        let err = '';
        try { await A.setFlexSetting(deps, 'retry.supervisor.maxCalls', 9); } catch (e) { err = e.message; }
        ok('a value the point cannot hold is refused', /not a valid number/.test(err));
    }

    /* ---------- the card's messages = the bridge's actions ---------- */
    {
        const { s, deps } = store({});
        const refused = [];
        const say = e => refused.push(e);
        eq('flexSet', [await flexCardMessage({ type: 'flexSet', point: 'sentry.leaderBudgetUsd', value: 3 }, deps, say), s['agentFarm.sentryLeaderBudgetUsd']], [true, 3]);
        await flexCardMessage({ type: 'flexReset', point: 'sentry.leaderBudgetUsd' }, deps, say);
        ok('flexReset', !('agentFarm.sentryLeaderBudgetUsd' in s));
        await flexCardMessage({ type: 'presetApply', name: 'Economy' }, deps, say);
        eq('presetApply writes the preset', [s['agentFarm.sentryLeaderBudgetUsd'], s['agentFarm.taskRetry'].supervisor.maxCalls], [1, 1]);
        await flexCardMessage({ type: 'presetSave', name: 'Mine' }, deps, say);
        const mine = s['agentFarm.flexPresets'][0];
        eq('presetSave keeps every value in the table', [mine.name, mine.values['sentry.leaderBudgetUsd'], Object.keys(mine.values).length],
            ['Mine', 1, Flex.POINTS.filter(p => p.levels.settings).length]);
        ok('…and the card reads it as in effect', A.flexSettingsState(deps).presets.find(p => p.name === 'Mine').matches);
        await flexCardMessage({ type: 'presetDelete', name: 'Mine' }, deps, say);
        eq('presetDelete', s['agentFarm.flexPresets'], []);
        eq('no refusal so far', refused, []);
        ok('a refusal goes back to the card, handled', await flexCardMessage({ type: 'presetDelete', name: 'Balanced' }, deps, say)
            && /built-in/.test(refused[0]));
        eq('a message that is not the card\'s is left to the page', await flexCardMessage({ type: 'set' }, deps, say), false);
        const panel = require('./lib_settings_source').settingsPanelSource();
        ok('the panel posts the card\'s state and hands it its messages',
            /flex: this\.deps\.flex \? flexSettingsState\(this\.deps\.flex\)/.test(panel) && /const flex = this\.deps\.flex && this\.host\.remote \? phoneFlex\(this\.deps\.flex, skipped\) : this\.deps\.flex;/.test(panel)
            && /await flexCardMessage\(msg, flex, flexError\)/.test(panel));
    }

    /* ---------- flex.set on the bridge ---------- */
    {
        const { s, deps } = store({});
        const reg = new BridgeRegistry();
        registerFlexOps(reg, deps);
        const set = await reg.dispatch('flex.set', { point: 'retry.supervisor.lowConfidence', value: 'park' });
        eq('flex.set writes at Farm Settings', [set.ok, s['agentFarm.taskRetry']], [true, { supervisor: { lowConfidence: 'park' } }]);
        const back = await reg.dispatch('flex.set', { point: 'retry.supervisor.lowConfidence', value: null });
        eq('null = back to inherited', [back.result.from, s['agentFarm.taskRetry']], ['builtin', { supervisor: {} }]);
        const run = await reg.dispatch('flex.set', { point: 'retry.supervisor.model', level: 'run', value: 'opus' });
        ok('a level with no store is refused, and says where the value goes instead', !run.ok && /no store yet/.test(run.error));
        const bad = await reg.dispatch('flex.set', { point: 'no.such', value: 1 });
        ok('an unknown point is refused by name', !bad.ok && /not a flex point/.test(bad.error));
    }

    /* ---------- the page ---------- */
    {
        const own = { id: 'a.b', label: 'Mine', type: 'number', default: 2, value: 4, from: 'settings', sentence: '4 — from Farm Settings', key: 'agentFarm.x' };
        const inh = { ...own, id: 'c.d', label: 'Theirs', value: 2, from: 'builtin', sentence: '2 — built-in default' };
        const tri = { ...own, id: 'e.f', type: 'tri', value: 'park', states: { ask: 'park', auto: 'smart', never: 'stop' } };
        const html = Page.html({ points: [own, inh, tri], presets: [
            { name: 'Balanced', builtin: true, family: 'cost', values: { 'a.b': 2 }, matches: false, reads: 'Balanced + 1 change' },
            { name: 'Mine', builtin: false, family: '', values: { 'a.b': 4 }, matches: true, reads: 'Mine' }
        ] }, C, 'no.');
        ok('a value you set is drawn solid with ↺; an inherited one faint and without', /flexrow own[\s\S]*?data-flex-reset="a\.b"/.test(html)
            && /flexrow inherited/.test(html) && !/data-flex-reset="c\.d"/.test(html));
        ok('the origin column is the resolver\'s sentence', /4 — from Farm Settings/.test(html) && /2 — built-in default/.test(html));
        ok('a tri point is ask / auto / never, storing its values', /<option value="park" selected>ask me \(park\)/.test(html)
            && /automatic \(smart\)/.test(html) && /never \(stop\)/.test(html));
        ok('the preset in effect is marked, the other reads its distance', /● Mine/.test(html) && /Balanced \+ 1 change/.test(html));
        ok('only your own preset can be deleted', /data-preset-delete="Mine"/.test(html) && !/data-preset-delete="Balanced"/.test(html));
        ok('a refusal is shown on the card', /class="flexerr">no\./.test(html));
        eq('no state, no card', Page.html(null, C, ''), '');
        const el = (v, t) => ({ value: v, getAttribute: () => t });
        eq('a box reads back as its type; empty = inherited',
            [Page.valueOf(el('4', 'number')), Page.valueOf(el('true', 'boolean')), Page.valueOf(el('x', 'text')), Page.valueOf(el(' ', 'number'))],
            [4, true, 'x', undefined]);
    }

    console.log(`${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
