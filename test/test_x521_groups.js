// X-521 part 8 — OpenCode's provider and model boxes in two headed groups ('Agent Farm routes' ·
// 'OpenCode's own'), by the catalog entry's origin, on every door; Claude's box is not grouped.
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const F = require(path.join(ROOT, 'out', 'core', 'launchProvider.js'));
const G = require(path.join(ROOT, 'out', 'core', 'providerRegistry.js'));
const PG = require(path.join(ROOT, 'out', 'core', 'providerGroups.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const row = (id, providerID, name) => [providerID + '/' + id, JSON.stringify({
    id, providerID, name, cost: { input: 0, output: 0 }, limit: { context: 128000 }, capabilities: {}, variants: {}
}, null, 2)];
const OC_VERBOSE = [...row('big-pickle', 'opencode', 'Big Pickle'), ...row('claude-opus-5', 'anthropic', 'Claude Opus 5')].join('\n');
const PROFILES = [
    {
        id: 'or-nemotron', label: 'Nemotron-Ultra', engines: ['claude', 'opencode'], providerId: 'openrouter',
        baseUrl: 'https://openrouter.ai/api', authKind: 'api-key', tiers: { opus: 'nvidia/nemo:free' }, revision: 2
    },
    {
        id: 'kimi-three', label: 'Kimi trio', engines: ['opencode'], providerId: 'kimi', baseUrl: 'https://api.moonshot.ai/anthropic',
        authKind: 'api-key', tiers: { opus: 'kimi-k2-thinking', sonnet: 'kimi-k2', haiku: 'kimi-k2' }, revision: 1
    }
];
const deps = (over = {}) => ({ profiles: PROFILES, secretFor: () => 'sk-test', inheritedEnv: {}, openCodeCatalogText: OC_VERBOSE, ...over });
const R = PG.ROUTES_GROUP, O = PG.OWN_GROUP;

// ---------- the pure rule ----------
{
    ok('the two headings', R === 'Agent Farm routes' && O === 'OpenCode\'s own');
    const g = PG.grouped([{ id: '', label: 'Default', detail: '' }, { id: 'a', label: 'a', detail: '' },
        { id: 'r1', label: 'r1', detail: '' }, { id: 'b', label: 'b', detail: '' }, { id: 'r2', label: 'r2', detail: '' }],
    id => (id.startsWith('r') ? R : O));
    ok('Default leads unheaded, the routes come first, each group keeps its order',
        g.map(r => r.id).join(',') === ',r1,r2,a,b' && !('group' in g[0]) && g[1].group === R && g[3].group === O);
    ok('a lent route serving several models names the slots each fills', PG.slotsNote(['sonnet', 'haiku']) === 'slots: sonnet, haiku' && PG.slotsNote([]) === '');
}

// ---------- the form every door reads ----------
{
    const oc = G.adapterFor('opencode', deps());
    const form = F.launchProviderForm(oc);
    const ids = form.providers.map(p => p.id);
    ok('‼️ OpenCode\'s provider box: Default, then Agent Farm routes, then OpenCode\'s own — never one mixed list',
        ids.join(',') === ',af-or-nemotron,af-kimi-three,opencode,anthropic'
        && form.providers.slice(1, 3).every(p => p.group === R) && form.providers.slice(3).every(p => p.group === O) && !form.providers[0].group);
    const all = form.sub.choices;
    ok('…the full model list (no provider picked) is grouped the same way',
        !all[0].group && all.slice(1).map(c => c.group).join('|') === [R, R, R, O, O].join('|')
        && all[1].id.startsWith('af-or-nemotron/') && all[4].id === 'opencode/big-pickle');
    const one = F.launchProviderForm(oc, { providerId: 'af-or-nemotron' }).sub.choices.filter(c => c.id);
    ok('a single-model route\'s model reads as the route', one.length === 1 && one[0].label === 'Nemotron-Ultra' && !/slots:/.test(one[0].detail));
    const three = F.launchProviderForm(oc, { providerId: 'af-kimi-three' }).sub.choices.filter(c => c.id);
    ok('…a route with several: each model\'s own id, its detail naming the slots it fills',
        three.length === 2 && three[0].label === 'kimi-k2-thinking' && /^slots: opus/.test(three[0].detail)
        && three[1].label === 'kimi-k2' && /^slots: sonnet, haiku/.test(three[1].detail));
    const claude = F.launchProviderForm(G.adapterFor('claude', deps()));
    ok('‼️ Claude\'s box is unchanged: no heading on any row', claude.providers.length > 1 && claude.providers.every(p => !('group' in p)));
}

// ---------- the doors ----------
{
    const win = {};
    vm.runInNewContext(read('media/afProvider.js'), { window: win });
    const html = win.AFProvider.optgroups([{ id: '', label: 'D' }, { id: 'r', label: 'r', group: R }, { id: 'o', label: 'o', group: O }],
        r => '<option value="' + r.id + '">' + r.label + '</option>');
    ok('AFProvider.optgroups: unheaded rows first, then each heading in the host\'s order',
        html === '<option value="">D</option><optgroup label="Agent Farm routes"><option value="r">r</option></optgroup>'
            + '<optgroup label="OpenCode\'s own"><option value="o">o</option></optgroup>');
    ok('the task form and the mission form draw the route box through it',
        /window\.AFProvider\.optgroups\(routeForm\.providers, p =>/.test(read('media/tasksPage.js'))
        && /window\.AFProvider\.optgroups\(routeRowsFor\(engine\), p =>/.test(read('media/missions.js')));
    const con = read('media/console.js');
    ok('the Console composer heads its provider box and its model box',
        /cls: 'tip-route', \.\.\.headed\(rows, r => r\.group, f\.providers\)/.test(con) && /\.\.\.composerModelGroups\(list\)/.test(con)
        && /g\.label \? o\.axis \+ ' · ' \+ g\.label : o\.axis/.test(con));
    const ext = read('src/extension.ts');
    ok('the launcher heads each run of rows with a separator',
        /c\.group && c\.group !== choices\[i - 1\]\?\.group\s*\? \[\{ label: c\.group, kind: vscode\.QuickPickItemKind\.Separator, id: '' \}\]/.test(ext));
    ok('the task/mission matrix carries the heading', /id: p\.id, label: p\.label, detail: p\.detail \?\? '', \.\.\.\(p\.group \? \{ group: p\.group \} : \{\}\),/.test(ext));
    const at = ext.indexOf("op: 'launch.form'");
    ok('‼️ the bridge answers the same form: launch.form calls providerFormFor, the door\'s own reader',
        at > 0 && /return providerFormFor\(engine, \{/.test(ext.slice(at, at + 2200)) && /transport as ProviderTransport\)/.test(ext.slice(at, at + 2200)));
}

console.log(`test_x521_groups: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
