// X-517 E — a route lent to OpenCode is checked and tested like a Claude route: its health row is
// matched under the WIRE id (af-<id>), it is available from our own data even before the engine's
// catalog is read, and a test turn on it asks for exactly one model. Pure, plus the wiring's shape.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`, JSON.stringify(got) === JSON.stringify(want));

const H = require(path.join(ROOT, 'out', 'core', 'providerHealth.js'));
const R = require(path.join(ROOT, 'out', 'core', 'providerRegistry.js'));
const T = require(path.join(ROOT, 'out', 'core', 'engineTest.js'));
const O = require(path.join(ROOT, 'out', 'core', 'opencodeRoutes.js'));

const nemotron = { id: 'or-nemotron', label: 'Nemotron', engines: ['claude', 'opencode'], providerId: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/', authKind: 'api-key', tiers: { haiku: 'nvidia/nano:free', opus: 'nvidia/nemotron:free' }, revision: 4 };
const claudeOnly = { id: 'mm', label: 'MiniMax', engines: ['claude'], providerId: 'minimax', baseUrl: 'https://m.example',
    tiers: { opus: 'm2' }, revision: 1 };
const noAddress = { id: 'na', label: 'No address', engines: ['opencode'], providerId: 'x', tiers: { opus: 'x1' }, revision: 1 };
const engineText = [
    'opencode/big-pickle',
    JSON.stringify({ id: 'big-pickle', providerID: 'opencode', name: 'Big Pickle', limit: { context: 1000, output: 100 }, capabilities: {} }, null, 2)
].join('\n');
const KEYS = { 'or-nemotron': 'sk-canary-health-e' };
const AF = 'af-or-nemotron';
const REF = 'af-or-nemotron/nvidia/nemotron:free';

const input = (over = {}) => {
    const all = over.profiles ?? [nemotron, claudeOnly, noAddress];
    const secrets = over.secrets ?? KEYS;
    const adapter = R.adapterFor('opencode', {
        profiles: all, secretFor: id => secrets[id], inheritedEnv: {},
        ...(over.unread ? {} : { openCodeCatalogText: engineText })
    });
    return {
        engine: 'opencode', adapter, catalog: adapter.catalog(),
        profiles: O.routeProfilesOn('opencode', all),
        hasSecret: id => all.some(p => O.routeIdOn('opencode', p.id) === id && !!secrets[p.id]),
        cli: { present: true, version: '1.18.35' }, inheritedEnv: {},
        ...(over.engineCredentials ? { engineCredentials: over.engineCredentials } : {}),
        ...(over.records ? { records: over.records } : {})
    };
};
const rowOf = (report, id) => report.rows.find(r => r.providerId === id);

// ---------- E1 one model per test turn (the measured 'j.split is not a function') ----------
{
    const rt = input().adapter.resolveRuntime({ engine: 'opencode', providerId: AF, modelId: REF });
    eq('the adapter itself names the model in its args', rt.args, ['-m', REF]);
    const a = T.aimedArgs('opencode', [], { providerId: AF, modelRef: REF, args: rt.args });
    eq('‼️ exactly one -m reaches OpenCode', a.filter(x => x === '-m').length, 1);
    eq('…and it names the aimed model', a[a.indexOf('-m') + 1], REF);
    const b = T.aimedArgs('opencode', [], { providerId: 'p', modelRef: 'p/m', args: ['--model', 'p/other', '--variant', 'high'] });
    ok('a --model pair goes too, any other flag of the adapter stays',
        b.filter(x => x === '-m' || x === '--model').length === 1 && !b.includes('p/other') && b.join(' ').includes('--variant high'));
    eq('the Claude line is untouched', T.aimedArgs('claude', ['-p', 'x', '--model', 'haiku'], { providerId: 'kimi', modelRef: 'm', args: ['--settings', 'none'] }),
        ['-p', 'x', '--model', 'm', '--settings', 'none']);
}

// ---------- E2 the row is matched under the wire id ----------
{
    eq('OpenCode is handed only lendable routes, under the wire id', O.routeProfilesOn('opencode', [nemotron, claudeOnly, noAddress]).map(p => p.id), [AF]);
    eq('every other engine keeps the bare id and its own routes', O.routeProfilesOn('claude', [nemotron, claudeOnly, noAddress]).map(p => p.id), ['or-nemotron', 'mm']);
    ok('…a copy: the stored route keeps its id', nemotron.id === 'or-nemotron');
    eq('the id a route is filed under, per engine', [O.routeIdOn('opencode', 'kimi'), O.routeIdOn('claude', 'kimi')], ['af-kimi', 'kimi']);
    eq('whose data a pick names: a lent route by its wire id, or by a model under it with no provider',
        [O.routeSourceOf('opencode', AF), O.routeSourceOf('opencode', '', REF), O.routeSourceOf('opencode', 'opencode', REF), O.routeSourceOf('opencode', '', 'opencode/big-pickle')],
        ['agent-farm-route', 'agent-farm-route', 'engine-native', 'engine-native']);
    eq('…and never on another engine, whatever the id looks like', O.routeSourceOf('claude', 'af-kimi'), 'engine-native');
    const keyless = input({ secrets: {} }).adapter;
    ok('(e) a keyless lent route is refused by its wire id…', /no stored key/.test(keyless.preflight({ engine: 'opencode', providerId: AF })[0]));
    ok('…and by a model alone, which is what the task gate asks with no provider', /no stored key/.test(keyless.preflight({ engine: 'opencode', providerId: '', modelId: REF })[0]));

    const rep = H.providerHealth(input());
    const r = rowOf(rep, AF);
    eq('a lent route: who declares it, where it came from, available with its key', [r.configuredBy, r.origin, r.available], ['a route Agent Farm holds', 'agent-farm-route', 'yes']);
    eq('…the engine\'s own provider says so too', rowOf(rep, 'opencode').origin, 'engine-native');
    eq('…its models default first (the opus tier)', r.modelRefs, [REF, 'af-or-nemotron/nvidia/nano:free']);
    ok('a route not lendable to OpenCode is no OpenCode row', !rep.rows.some(x => /^(af-)?(mm|na)$/.test(x.providerId)));

    const un = H.providerHealth(input({ unread: true }));
    eq('‼️ the engine\'s catalog unread: the route row is still available — the data is ours', [un.source, rowOf(un, AF).available], ['not-fetched', 'yes']);
    const nk = rowOf(H.providerHealth(input({ secrets: {} })), AF);
    ok('no key → not available, in the adapter\'s own words', nk.available === 'no' && /no stored key/.test(nk.problems[0]));
    eq('…and unread does not lift that', rowOf(H.providerHealth(input({ secrets: {}, unread: true })), AF).available, 'no');

    const ec = H.providerHealth(input({ engineCredentials: { file: '~/auth.json', present: false, entries: 0 } }));
    const engineNote = n => /no credential is stored for this engine/.test(n);
    ok('the engine\'s empty credential file is no note on a lent route — its key is ours', !rowOf(ec, AF).notes.some(engineNote));
    ok('…and still is on the engine\'s own provider', rowOf(ec, 'opencode').notes.some(engineNote));
}

// ---------- E3 the verdict is filed by engine + route + model + CLI + revision ----------
{
    const k = H.keyFor(input(), AF, REF);
    eq('the key', [k.engine, k.providerId, k.modelId, k.cli, k.revision], ['opencode', AF, REF, '1.18.35', 4]);
    const rec = { key: k, ok: true, at: 1, ms: 5, detail: 'answered' };
    eq('a pass is read back on its row', rowOf(H.providerHealth(input({ records: [rec] })), AF).tested.ok, true);
    const sup = rowOf(H.providerHealth(input({ records: [{ ...rec, key: { ...k, revision: 3 } }] })), AF);
    ok('…and an edited route turns it into a superseded one, with the reason', !sup.tested && /edited since/.test(sup.testedSupersededWhy));
    const recs = [{ key: { engine: 'opencode', providerId: AF } }, { key: { engine: 'claude', providerId: 'or-nemotron' } }, { key: { engine: 'opencode', providerId: 'opencode' } }];
    eq('removing the route drops its OpenCode verdicts by the wire id, nothing else',
        H.dropTestsFor(recs, 'opencode', O.routeIdOn('opencode', 'or-nemotron')).map(x => x.key.providerId), ['or-nemotron', 'opencode']);
}

// ---------- E4 which model a test turn asks for ----------
{
    const r = rowOf(H.providerHealth(input()), AF);
    eq('no model → the route\'s default', H.testModelRef(r, ''), REF);
    eq('a bare model id of the route → its reference', H.testModelRef(r, 'nvidia/nano:free'), 'af-or-nemotron/nvidia/nano:free');
    eq('a reference is kept', H.testModelRef(r, 'af-or-nemotron/nvidia/nano:free'), 'af-or-nemotron/nvidia/nano:free');
    ok('‼️ a model the route does not serve is refused before anything runs', /does not serve/.test(H.smokeRefusal(r, 'af-or-nemotron/other')));
    eq('…a served one is not', H.smokeRefusal(r, 'af-or-nemotron/nvidia/nano:free'), '');
    const claudeRow = { providerId: 'kimi', available: 'yes', problems: [], modelRefs: ['a', 'b'] };
    eq('a Claude row: the named model as given, none → the first', [H.testModelRef(claudeRow, 'zzz'), H.testModelRef(claudeRow, '')], ['zzz', 'a']);
    eq('…and no route check on it', H.smokeRefusal(claudeRow, 'zzz'), '');
    eq('no row, no model → nothing', H.testModelRef(undefined, ''), '');
}

// ---------- E5 the wiring ----------
{
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8').replace(/\r\n/g, '\n');
    const at = ext.indexOf('const providerHealthInput = async');
    const body = ext.slice(at, ext.indexOf('\n    };', at));
    ok('the health input hands each engine its routes under the id it files them by', /profiles: routeProfilesOn\(engine, providerProfiles\(\)\)/.test(body));
    ok('…and hasSecret answers by that id', /routeIdOn\(engine, p\.id\) === id/.test(body));
    const fa = ext.indexOf('const forgetProviderTests');
    ok('removing a route forgets its verdicts by that id', fa > 0 && /dropTestsFor\(all, engine, routeIdOn\(engine, routeId\)\)/.test(ext.slice(fa, fa + 500)));
    const ra = ext.indexOf('const runProviderTest = async (');
    ok('the test turn asks testModelRef for its model', ra > 0 && /testModelRef\(row, model\)/.test(ext.slice(ra, ra + 2000)));
    ok('the test runner joins a route\'s OPENCODE_CONFIG_CONTENT as a launch does', /routeValue\(name, value, process\.env\[name\]\)/.test(ext));
    const ta = ext.indexOf("op: 'providers.test'");
    ok('providers.test tells an agent how an OpenCode route is named', ta > 0 && /af-<id>/.test(ext.slice(ta, ta + 4200)));
    const sa = ext.indexOf("op: 'providers.status'");
    ok('providers.status names the origin field', sa > 0 && /origin/.test(ext.slice(sa, ext.indexOf('handler:', sa))));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
