// X-517 A — a route lent to OpenCode: the wire id, the fragment, the key's variable, the merge,
// the fingerprint, the route's model and the route a pick names. Pure functions, no engine.
'use strict';
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`, JSON.stringify(got) === JSON.stringify(want));

const R = require(path.join(ROOT, 'out', 'core', 'opencodeRoutes.js'));

const nemotron = { id: 'or-nemotron', label: 'Nemotron', engines: ['claude', 'opencode'], providerId: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/', authKind: 'api-key', tiers: { opus: 'nvidia/nemotron:free' }, revision: 4 };
const two = { id: 'kimi', label: 'Kimi', engines: ['opencode'], providerId: 'kimi', baseUrl: 'https://k.example/anthropic',
    authKind: 'oauth', tiers: { haiku: 'k2-mini', opus: 'k2' }, context: 200000, output: 8192, revision: 2 };

// ---------- A1 the wire id ----------
{
    eq('a route\'s OpenCode provider is af- + its id', R.wireIdOf('or-nemotron'), 'af-or-nemotron');
    eq('…and back, stripping exactly one prefix', [R.routeIdOfWire('af-or-nemotron'), R.routeIdOfWire('af-af-x106-check'), R.routeIdOfWire('openrouter'), R.routeIdOfWire('')],
        ['or-nemotron', 'af-x106-check', '', '']);
    eq('a model reference is the wire id, a slash, the model id', R.modelRefOf('or-nemotron', 'nvidia/nemotron:free'), 'af-or-nemotron/nvidia/nemotron:free');
}

// ---------- A2 the fragment ----------
{
    const j = JSON.parse(R.fragmentFor([nemotron, two]));
    eq('‼️ only af- providers are written', Object.keys(j.provider), ['af-or-nemotron', 'af-kimi']);
    const n = j.provider['af-or-nemotron'];
    eq('an Anthropic-style route: the Anthropic SDK at the endpoint + /v1, the key as x-api-key by reference',
        [n.npm, n.options], ['@ai-sdk/anthropic', { baseURL: 'https://openrouter.ai/api/v1', apiKey: '{env:AF_ROUTE_KEY_OR_NEMOTRON}' }]);
    eq('…one model, named by the route', n.models, { 'nvidia/nemotron:free': { name: 'Nemotron' } });
    const k = j.provider['af-kimi'];
    eq('an oauth route sends the key as a Bearer alone', k.options, { baseURL: 'https://k.example/anthropic/v1', authToken: '{env:AF_ROUTE_KEY_KIMI}' });
    eq('‼️ different models on different tiers stay different, named by their ids, with both limits',
        k.models, { k2: { name: 'k2', limit: { context: 200000, output: 8192 } }, 'k2-mini': { name: 'k2-mini', limit: { context: 200000, output: 8192 } } });
    const oc = JSON.parse(R.fragmentFor([{ ...nemotron, opencodeUrl: 'https://openrouter.ai/api/v1/' }])).provider['af-or-nemotron'];
    eq('with an OpenCode endpoint: the OpenAI-style SDK there, the key as a Bearer', [oc.npm, oc.options],
        ['@ai-sdk/openai-compatible', { baseURL: 'https://openrouter.ai/api/v1', apiKey: '{env:AF_ROUTE_KEY_OR_NEMOTRON}' }]);
    ok('‼️ a context with no output writes no limit at all', !('limit' in JSON.parse(R.fragmentFor([{ ...two, output: undefined }])).provider['af-kimi'].models.k2));
    const text = R.fragmentFor([nemotron, two]);
    ok('‼️ never small_model, never a cost, never a header', !/small_model|"cost"|headers|Authorization/.test(text));
    ok('a route that cannot be lent is left out, and none at all gives no fragment',
        R.fragmentFor([{ ...nemotron, engines: ['claude'] }]) === undefined && R.fragmentFor([]) === undefined);
}

// ---------- A3 the key's variable ----------
eq('one variable per route, upper-case, everything else an underscore', R.routeKeyEnvName('or-nemotron.2'), 'AF_ROUTE_KEY_OR_NEMOTRON_2');

// ---------- A4 the merge ----------
{
    const constitution = JSON.stringify({ $schema: 'https://opencode.ai/config.json', instructions: ['D:/a/AGENTS.md'] });
    const m = JSON.parse(R.mergeConfigContent(constitution, R.fragmentFor([nemotron])));
    ok('‼️ the constitution survives the route', m.instructions.join() === 'D:/a/AGENTS.md' && !!m.provider['af-or-nemotron']);
    const mine = JSON.stringify({ instructions: ['x', 'y'], provider: { openrouter: { a: 1 }, 'af-or-nemotron': { old: 1 } }, model: 'm' });
    const m2 = JSON.parse(R.mergeConfigContent(mine, JSON.stringify({ instructions: ['y', 'z'], provider: { 'af-or-nemotron': { new: 1 }, openrouter: { b: 2 } } })));
    eq('instructions once each, the existing first', m2.instructions, ['x', 'y', 'z']);
    eq('‼️ an existing non-af provider is never touched; the same af- id becomes ours', m2.provider, { openrouter: { a: 1 }, 'af-or-nemotron': { new: 1 } });
    eq('…and every other key of the existing one is kept', m2.model, 'm');
    eq('an existing text that is not JSON gives way', R.mergeConfigContent('not json', '{"a":1}'), '{"a":1}');
}

// ---------- A5 the fingerprint ----------
{
    const f = R.routesFingerprint([nemotron, two], () => true);
    ok('stable whatever the order', f === R.routesFingerprint([two, nemotron], () => true) && /^[0-9a-f]{16}$/.test(f));
    ok('it moves with a revision, a model, a limit and whether a key exists',
        f !== R.routesFingerprint([{ ...nemotron, revision: 5 }, two], () => true)
        && f !== R.routesFingerprint([{ ...nemotron, tiers: { opus: 'x/y' } }, two], () => true)
        && f !== R.routesFingerprint([nemotron, { ...two, output: 4096 }], () => true)
        && f !== R.routesFingerprint([nemotron, two], id => id === 'kimi'));
    ok('…and a label is not part of it', f === R.routesFingerprint([{ ...nemotron, label: 'N2' }, two], () => true));
}

// ---------- A6 / A7 the route's model, the route a pick names ----------
{
    eq('the wanted model when it is the route\'s', R.routeModelRef(two, 'af-kimi/k2-mini'), 'af-kimi/k2-mini');
    eq('‼️ otherwise — empty or another route\'s — the route\'s default', [R.routeModelRef(two, ''), R.routeModelRef(two, 'opencode/big-pickle')],
        ['af-kimi/k2', 'af-kimi/k2']);
    const routes = [nemotron, two];
    eq('a pick names its route by the af- provider', R.routeOfSelection({ providerId: 'af-kimi' }, routes).id, 'kimi');
    eq('…or, with no provider, by a model that is one of the route\'s', R.routeOfSelection({ modelId: 'af-or-nemotron/nvidia/nemotron:free' }, routes).id, 'or-nemotron');
    ok('…and an engine provider, a gone route or a foreign model name none',
        !R.routeOfSelection({ providerId: 'openrouter' }, routes) && !R.routeOfSelection({ providerId: 'af-gone' }, routes)
        && !R.routeOfSelection({ modelId: 'opencode/big-pickle' }, routes));
}

// ---------- B the route's config joins the constitution's, on both spawn shapes ----------
{
    const fs = require('fs');
    const RT = require(path.join(ROOT, 'out', 'core', 'providerRuntime.js'));
    const CC = 'OPENCODE_CONFIG_CONTENT';
    const constitution = JSON.stringify({ instructions: ['D:/a/CLAUDE.md'] });
    const fragment = R.fragmentFor([nemotron]);
    const rt = { spawnEnv: { [CC]: fragment, AF_ROUTE_KEY_OR_NEMOTRON: 'k', ANTHROPIC_BASE_URL: 'route' } };
    const both = j => j.instructions?.[0] === 'D:/a/CLAUDE.md' && !!j.provider?.['af-or-nemotron'];

    const env = RT.spawnEnvironment({ PATH: 'p' }, [{ [CC]: constitution, ANTHROPIC_BASE_URL: 'layer' }], rt);
    ok('‼️ a spawn keeps the constitution\'s layer AND gets the route', both(JSON.parse(env[CC])));
    eq('…every other name is still written over, the key variable beside it', [env.ANTHROPIC_BASE_URL, env.AF_ROUTE_KEY_OR_NEMOTRON], ['route', 'k']);
    eq('…an inherited config joins the same way', JSON.parse(RT.spawnEnvironment({ [CC]: constitution }, [], rt)[CC]).instructions, ['D:/a/CLAUDE.md']);
    eq('with nothing there the route\'s text goes as it is', RT.spawnEnvironment({}, [], rt)[CC], fragment);
    eq('…and a cleared name is nothing to join', RT.spawnEnvironment({ [CC]: constitution }, [], { ...rt, clearEnv: [CC] })[CC], fragment);

    const win = { [CC]: constitution };
    ok('‼️ a terminal joins the WINDOW\'s config when no layer set one', both(JSON.parse(RT.terminalEnvOverlay([], rt, { windowEnv: win })[CC])));
    const layered = JSON.parse(RT.terminalEnvOverlay([{ [CC]: JSON.stringify({ instructions: ['L'] }) }], rt, { windowEnv: win })[CC]);
    eq('…a layer\'s config is the one joined, not the window\'s', layered.instructions, ['L']);
    eq('…a layer that removes it leaves the route\'s alone', RT.terminalEnvOverlay([{ [CC]: null }], rt, { windowEnv: win })[CC], fragment);
    eq('…and without the window it is written as before', RT.terminalEnvOverlay([], rt)[CC], fragment);

    const tasks = fs.readFileSync(path.join(ROOT, 'src', 'core', 'tasks.ts'), 'utf8');
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    const callOf = (src, head) => { const i = src.indexOf(head); return i < 0 ? '' : src.slice(i, src.indexOf('\n        if (', i)); };
    ok('both terminal launches hand the window\'s environment over',
        callOf(tasks, 'const env = terminalEnvOverlay(').includes('{ windowEnv: process.env }')
        && callOf(ext, 'const termEnv = terminalEnvOverlay(').includes('{ windowEnv: process.env }'));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
