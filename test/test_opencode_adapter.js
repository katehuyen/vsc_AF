// X-517 C — the OpenCode adapter lends a route beside the engine's own providers: the catalog, the
// runtime, the identity, the preflight and the billing. Pure; no engine is started.
'use strict';
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`, JSON.stringify(got) === JSON.stringify(want));

const G = require(path.join(ROOT, 'out', 'core', 'providerRegistry.js'));

const nemotron = { id: 'or-nemotron', label: 'Nemotron', engines: ['claude', 'opencode'], providerId: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/', authKind: 'api-key', tiers: { opus: 'nvidia/nemotron:free' }, revision: 4,
    description: 'free tier' };
const kimi = { id: 'kimi', label: 'Kimi', engines: ['opencode'], providerId: 'moonshot', baseUrl: 'https://k.example/anthropic',
    opencodeUrl: 'https://k.example/v1/', authKind: 'oauth', tiers: { haiku: 'k2-mini', opus: 'k2' }, context: 200000, output: 8192, revision: 2 };
const claudeOnly = { id: 'mm', label: 'MiniMax', engines: ['claude'], providerId: 'minimax', baseUrl: 'https://m.example',
    tiers: { opus: 'm2' }, revision: 1 };
const noModel = { id: 'empty', label: 'Empty', engines: ['opencode'], providerId: 'x', baseUrl: 'https://e.example', tiers: {}, revision: 1 };
const engineText = [
    'opencode/big-pickle',
    JSON.stringify({ id: 'big-pickle', providerID: 'opencode', name: 'Big Pickle', limit: { context: 1000, output: 100 }, capabilities: {} }, null, 2),
    'af-or-nemotron/rogue',
    JSON.stringify({ id: 'rogue', providerID: 'af-or-nemotron', name: 'Rogue', capabilities: {} }, null, 2)
].join('\n');
const SECRETS = { 'or-nemotron': 'sk-nemo', kimi: 'sk-kimi' };
const deps = (over = {}) => ({
    profiles: [nemotron, kimi, claudeOnly, noModel], secretFor: id => SECRETS[id], inheritedEnv: {},
    openCodeCatalogText: engineText, lastRouteVendor: id => (id === 'gone' ? 'deepseek' : undefined), ...over
});
const oc = (over) => G.adapterFor('opencode', deps(over));

// ---------- C1 the catalog ----------
{
    const cat = oc().catalog();
    eq('the engine\'s providers first, then every lendable route by its wire id', cat.providers.map(p => p.providerId), ['opencode', 'af-or-nemotron', 'af-kimi']);
    eq('…each says where it came from', cat.providers.map(p => p.origin), ['engine-native', 'agent-farm-route', 'agent-farm-route']);
    ok('‼️ an af- entry in the engine\'s own listing is dropped — the profiles are the one source', !cat.rows.some(r => r.ref === 'af-or-nemotron/rogue'));
    const n = cat.providers[1];
    eq('a route entry: its label, its references, its note, the address OpenCode goes to',
        [n.providerLabel, n.models, n.note, n.route], ['Nemotron', ['af-or-nemotron/nvidia/nemotron:free'], 'free tier', { baseUrl: 'https://openrouter.ai/api', authKind: 'api-key' }]);
    eq('…an OpenCode endpoint is the address, and its key goes as a Bearer', cat.providers[2].route, { baseUrl: 'https://k.example/v1', authKind: 'oauth' });
    const rows = cat.rows.filter(r => r.providerId.startsWith('af-'));
    eq('one row per model: ref, wire provider, model id, name', rows.map(r => [r.ref, r.providerId, r.modelId, r.label]), [
        ['af-or-nemotron/nvidia/nemotron:free', 'af-or-nemotron', 'nvidia/nemotron:free', 'Nemotron'],
        ['af-kimi/k2', 'af-kimi', 'k2', 'k2'], ['af-kimi/k2-mini', 'af-kimi', 'k2-mini', 'k2-mini']]);
    eq('…the limits the route states, none it does not', [rows[0].limit, rows[1].limit], [{}, { context: 200000, output: 8192 }]);
    ok('‼️ …and no cost — not stated is not free', rows.every(r => !('cost' in r) && !r.variants.length));
    eq('the engine\'s own reading is still the source', cat.source, 'engine-reported');
    ok('the routes\' fingerprint joins the revision and moves with a route',
        /^routes:[0-9a-f]{16}$/.test(cat.revision) && cat.revision !== oc({ profiles: [{ ...nemotron, revision: 5 }, kimi] }).catalog().revision);
    const unread = oc({ openCodeCatalogText: undefined }).catalog();
    eq('with the engine not asked yet the routes are still offered, and nothing is claimed of the engine',
        [unread.source, unread.providers.map(p => p.providerId)], ['not-fetched', ['af-or-nemotron', 'af-kimi']]);
    eq('no lendable route → the engine\'s listing alone', oc({ profiles: [claudeOnly] }).catalog().providers.map(p => p.providerId), ['opencode']);
}

// ---------- C2 the runtime ----------
{
    const r = oc().resolveRuntime({ engine: 'opencode', providerId: 'af-kimi', modelId: 'af-kimi/k2-mini' });
    const frag = JSON.parse(r.spawnEnv.OPENCODE_CONFIG_CONTENT);
    eq('‼️ only the picked route is lent, and only its key', [Object.keys(frag.provider), Object.keys(r.spawnEnv).sort()],
        [['af-kimi'], ['AF_ROUTE_KEY_KIMI', 'OPENCODE_CONFIG_CONTENT']]);
    eq('…the key travels in its variable, the fragment names it', [r.spawnEnv.AF_ROUTE_KEY_KIMI, frag.provider['af-kimi'].options.apiKey], ['sk-kimi', '{env:AF_ROUTE_KEY_KIMI}']);
    ok('…no value of the key is anywhere in the fragment', !r.spawnEnv.OPENCODE_CONFIG_CONTENT.includes('sk-kimi'));
    eq('the args are unchanged', r.args, ['-m', 'af-kimi/k2-mini']);
    eq('the model rule: the route\'s references and its default', r.modelRule, { refs: ['af-kimi/k2', 'af-kimi/k2-mini'], defaultRef: 'af-kimi/k2' });
    const byModel = oc().resolveRuntime({ engine: 'opencode', modelId: 'af-or-nemotron/nvidia/nemotron:free' });
    ok('a model that is a route\'s reference finds its route with no provider picked', JSON.parse(byModel.spawnEnv.OPENCODE_CONFIG_CONTENT).provider['af-or-nemotron']);
    const plain = oc().resolveRuntime({ engine: 'opencode', providerId: 'opencode', modelId: 'opencode/big-pickle' });
    eq('the engine\'s own provider gets no environment of ours', [plain.spawnEnv, plain.modelRule, plain.args], [undefined, undefined, ['-m', 'opencode/big-pickle']]);
    eq('no key, no key variable (the preflight refuses it)', Object.keys(oc({ secretFor: () => undefined }).resolveRuntime({ engine: 'opencode', providerId: 'af-kimi' }).spawnEnv), ['OPENCODE_CONFIG_CONTENT']);
    eq('a route not lent to OpenCode gets nothing', oc().resolveRuntime({ engine: 'opencode', providerId: 'af-mm' }).spawnEnv, undefined);
}

// ---------- C3 the identity ----------
{
    const r = oc().resolveRuntime({ engine: 'opencode', providerId: 'af-kimi' });
    eq('the shape a Claude route writes: vendor, label, profile and revision, declared', [r.identity.providerId, r.identity.providerLabel,
        r.identity.origin, r.identity.providerProfileId, r.identity.providerProfileRevision, r.identity.scope, r.identity.proof],
        ['moonshot', 'Kimi', 'agent-farm-profile', 'kimi', 2, 'turn', 'launch-declared']);
    eq('…the model asked for is the route\'s default when none is picked', r.identity.requestedModelRef, 'af-kimi/k2');
    const gone = oc().resolveRuntime({ engine: 'opencode', providerId: 'af-gone', modelId: 'm' }).identity;
    eq('‼️ a gone route\'s af- id is never written as a provider', [gone.providerId, gone.origin], ['', 'unknown']);
    const ev = oc().identityFromEvents([{ providerID: 'af-kimi', modelID: 'k2' }, { providerID: 'af-gone', modelID: 'x' }, { providerID: 'opencode', modelID: 'big-pickle' }]);
    eq('reported af- ids read back as the route\'s company — the gone one by its last record', ev.reportedProviderIds, ['moonshot', 'deepseek', 'opencode']);
    ok('…so the declared and the reported agree, and no af- id reaches a surface', !JSON.stringify(ev).includes('"af-'));
    const acp = oc().identityFromEvents([{ configOptions: [{ id: 'model', currentValue: 'af-kimi/k2' }] }]);
    eq('an ACP current value on a lent route is cut by the catalog and mapped the same way', [acp.reportedProviderIds, acp.reportedModels], [['moonshot'], ['k2']]);
}

// ---------- C4 the preflight ----------
{
    const pf = (sel, over) => oc(over).preflight({ engine: 'opencode', ...sel });
    eq('a lendable route with its key passes', pf({ providerId: 'af-kimi' }), []);
    ok('a gone route is refused by name', /"gone" no longer exists/.test(pf({ providerId: 'af-gone' })[0]));
    ok('a route not marked for OpenCode', /not marked for OpenCode/.test(pf({ providerId: 'af-mm' })[0]));
    ok('a route with no model', /names no model/.test(pf({ providerId: 'af-empty' })[0]));
    ok('a route with no address', /no address OpenCode can reach/.test(pf({ providerId: 'af-x' }, { profiles: [{ ...kimi, id: 'x', baseUrl: '', opencodeUrl: '' }] })[0]));
    eq('‼️ no key: the Claude route\'s own sentence, with the address OpenCode would reach', pf({ providerId: 'af-kimi' }, { secretFor: () => undefined }),
        ['"Kimi" has no stored key, so a run on it would reach https://k.example/v1 unauthenticated.']);
    ok('a key given for another address', /was given for https:\/\/old\.example/.test(
        pf({ providerId: 'af-kimi' }, { keyState: () => ({ has: false, heldFor: 'https://old.example' }) })[0]));
    ok('…and a model-only pick of a route is held to the same', /no stored key/.test(pf({ modelId: 'af-kimi/k2' }, { secretFor: () => undefined })[0]));
    eq('a pick of the engine\'s own is refused as it always was', pf({ providerId: 'opencode', modelId: 'opencode/nope' }),
        ['model "opencode/nope" is no longer offered by opencode']);
}

// ---------- C5 the billing ----------
{
    const b = oc();
    eq('a lent route: the engine\'s 0 is not measured, and no plan is spent', b.billingPolicy({ engine: 'opencode', providerId: 'af-kimi' }),
        { engineCostIsAuthoritative: false, countsAgainstPlanQuota: false });
    eq('the engine\'s own provider: as before', b.billingPolicy({ engine: 'opencode', providerId: 'opencode' }),
        { engineCostIsAuthoritative: true, countsAgainstPlanQuota: false });
    eq('…and with nothing picked', b.billingPolicy(), { engineCostIsAuthoritative: true, countsAgainstPlanQuota: false });
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
