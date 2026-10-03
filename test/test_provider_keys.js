// X-491 — A ROUTE'S KEY IS READ FROM WHERE IT IS WRITTEN, AND A RUN NEVER STARTS WITHOUT IT.
//
// Measured 2026-10-03: the key was stored under agentFarm.providerProfile.<id> in the keychain and
// read back through the Farm Secrets vault's cache, which never holds that name — every route ran
// with no key (OpenRouter: "401 Missing Authentication header") while hasSecret said true.
//
//   node test/test_provider_keys.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'out', 'core');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const { ProviderKeys, PROVIDER_SECRET_IDS } = require(path.join(OUT, 'providerKeys.js'));
const { routeModelEnv } = require(path.join(OUT, 'routeModels.js'));
const R = require(path.join(OUT, 'providerRuntime.js'));

const keychain = () => { const m = new Map(); return { m, get: async k => m.get(k), store: async (k, v) => { m.set(k, v); }, delete: async k => { m.delete(k); } }; };
const memento = () => { const m = new Map(); return { m, get: (k, d) => (m.has(k) ? m.get(k) : d), update: async (k, v) => { m.set(k, v); } }; };

(async () => {
    const kc = keychain(), st = memento();
    const keys = new ProviderKeys(kc, st);
    await keys.set('openrouter-r1', 'sk-or-real');
    ok('‼️ a stored key is read back by its profile id', keys.get('openrouter-r1') === 'sk-or-real');
    ok('…from the keychain name X-100 chose, never the vault\'s', kc.m.get('agentFarm.providerProfile.openrouter-r1') === 'sk-or-real'
        && ![...kc.m.keys()].some(k => k.startsWith('agentfarm.secret.')));
    ok('the id index says it has one (hasSecret)', keys.has('openrouter-r1') && st.m.get(PROVIDER_SECRET_IDS).includes('openrouter-r1'));
    const again = new ProviderKeys(kc, st);
    ok('a fresh window has nothing before it loads', again.get('openrouter-r1') === undefined);
    await again.load();
    ok('‼️ …and the key after the load activation waits for', again.get('openrouter-r1') === 'sk-or-real');
    st.m.set(PROVIDER_SECRET_IDS, ['openrouter-r1', 'gone']);
    await again.load();
    ok('an index entry whose key is gone is not a key', again.get('gone') === undefined);
    await again.delete('openrouter-r1');
    ok('removing takes the key, the cache and the index entry', again.get('openrouter-r1') === undefined
        && !kc.m.has('agentFarm.providerProfile.openrouter-r1') && !again.has('openrouter-r1'));

    // ---------- the tiers as the CLI's aliases ----------
    const env = routeModelEnv({ opus: 'deepseek/deepseek-r1:free', haiku: 'x/fast', odd: 'y' });
    ok('‼️ every mapped tier answers for its alias', env.ANTHROPIC_DEFAULT_OPUS_MODEL === 'deepseek/deepseek-r1:free'
        && env.ANTHROPIC_DEFAULT_HAIKU_MODEL === 'x/fast' && env.ANTHROPIC_SMALL_FAST_MODEL === 'x/fast');
    ok('an unmapped alias and an unknown tier name nothing', env.ANTHROPIC_DEFAULT_SONNET_MODEL === undefined && Object.keys(env).length === 3);
    const run = R.claudeRouteRuntime({ id: 'r', label: 'R', engine: 'claude', providerId: 'anthropic', baseUrl: 'https://openrouter.ai/api',
        authKind: 'oauth', tiers: { opus: 'm/opus', sonnet: 'm/sonnet' }, revision: 1 }, 'tok', {}, '');
    ok('a run with no tier chosen still stays on the route for every alias', run.spawnEnv.ANTHROPIC_MODEL === undefined
        && run.spawnEnv.ANTHROPIC_DEFAULT_OPUS_MODEL === 'm/opus' && run.spawnEnv.ANTHROPIC_DEFAULT_SONNET_MODEL === 'm/sonnet'
        && run.spawnEnv.ANTHROPIC_AUTH_TOKEN === 'tok');

    // ---------- the wiring ----------
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('‼️ the launch reads the key from its owner, not the vault\'s cache under the keychain name',
        /secretFor: \(id: string\) => \{\s*const p = providerProfiles\(\)\.find\(x => x\.id === id\);\s*return p \? routeKeyOf\(p\)\.value : undefined;/.test(ext)
        && /routeKeyFor\(p, id => providerKeys\.get\(id\), name => vault\.get\(name\)\)/.test(ext)
        && !/vault\.get\(secretKeyFor/.test(ext));
    ok('the keys are loaded before activation goes on', /const providerKeys = new ProviderKeys\(context\.secrets, context\.globalState\);\s*await providerKeys\.load\(\);/.test(ext));
    ok('every launch path refuses what the adapter refuses (a route with no key)',
        /return adapterFor\(engineId, registryDeps\(\)\)\.preflight\(\{ engine: engineId, providerId, \.\.\.\(tier \? \{ tier \} : \{\}\) \}\)\[0\];/.test(ext));

    // ---------- X-488 — a Farm Secret named by the route ----------
    const { routeKeyFor, keyHint, keyPickItems } = require(path.join(OUT, 'providerKeys.js'));
    const own = id => (id === 'r' ? 'own-key-value-123456' : undefined);
    const named = n => (n === 'OpenRouter-ahmet' ? 'sk-or-v1-0123456789abcdef4444' : undefined);
    const a = routeKeyFor({ id: 'r', secretRef: 'OpenRouter-ahmet' }, own, named);
    ok('‼️ a named Farm Secret is the key, and it wins over a key of the route\'s own',
        a.value === 'sk-or-v1-0123456789abcdef4444' && a.from === 'secret' && a.secretRef === 'OpenRouter-ahmet');
    const gone = routeKeyFor({ id: 'r', secretRef: 'deleted' }, own, named);
    ok('‼️ a named secret that is gone is NO key — never a quiet fall back to another one',
        gone.value === undefined && gone.from === 'secret');
    ok('no name: the route\'s own key', routeKeyFor({ id: 'r' }, own, named).value === 'own-key-value-123456');
    ok('the masked hint tells keys apart and gives none away', keyHint('sk-or-v1-0123456789abcdef4444') === 'sk-or-…4444'
        && keyHint('short-key') === '…ey' && keyHint('') === '' && keyHint(undefined) === '');
    ok('…and a canary never survives into it', !/CANARY/.test(keyHint('sk-ant-api03-CANARYx115CANARYx115CANARYx115')));
    const secrets = [{ name: 'OpenRouter-ahmet', description: 'ahmet hesabı', agents: [], farmOnly: false },
        { name: 'TYPESAFE_API_KEY', description: '', agents: [], farmOnly: true }];
    const items = keyPickItems({ secretRef: 'OpenRouter-ahmet' }, secrets, true);
    ok('the picker offers typing, every Farm Secret by name, and removing', items.map(i => i.action).join(',') === 'type,secret,secret,remove'
        && items[1].name === 'OpenRouter-ahmet' && /in use/.test(items[1].description) && /ahmet hesabı/.test(items[1].description));
    ok('…each secret says who else receives it', /every agent/.test(items[1].detail) && /Farm-only/.test(items[2].detail));
    ok('…removing a named secret says the secret stays in the vault', /stays in the vault/.test(items[3].detail));
    ok('no key yet: nothing to remove', !keyPickItems({}, secrets, false).some(i => i.action === 'remove'));
    ok('‼️ no item carries a value', !JSON.stringify(keyPickItems({}, secrets, true)).includes('sk-or-v1'));

    ok('‼️ only the host picker names a Farm Secret: the page form and both bridge writes drop it',
        (ext.match(/withoutSecretRef\(args as Record<string, unknown>\)/g) || []).length === 2
        && /const form = withoutSecretRef\(input\);/.test(ext));
    ok('picking a Farm Secret collects the route\'s own key; typing one lets the secret go',
        /if \(providerKeys\.has\(id\)\) \{ await providerKeys\.delete\(id\); \}/.test(ext)
        && /const \{ secretRef: _was, \.\.\.own \} = list\[at\];\s*next\[at\] = bumpRevision\(own\);/.test(ext));
    ok('every surface sees a route through one builder (hasSecret + keyHint)',
        /const publicProviderProfiles = \(\) => providerProfiles\(\)\.map\(publicRoute\);/.test(ext)
        && (ext.match(/publicRoute\(w\.profile!\)/g) || []).length === 3 && !/publicProfiles\(\[w\.profile/.test(ext));

    console.log(`\ntest_provider_keys: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
