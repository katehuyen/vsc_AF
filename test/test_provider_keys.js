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
    ok('‼️ the launch reads the key from its owner, not the vault', /secretFor: \(id: string\) => providerKeys\.get\(id\),/.test(ext)
        && !/vault\.get\(secretKeyFor/.test(ext));
    ok('the keys are loaded before activation goes on', /const providerKeys = new ProviderKeys\(context\.secrets, context\.globalState\);\s*await providerKeys\.load\(\);/.test(ext));
    ok('every launch path refuses what the adapter refuses (a route with no key)',
        /return adapterFor\(engineId, registryDeps\(\)\)\.preflight\(\{ engine: engineId, providerId, \.\.\.\(tier \? \{ tier \} : \{\}\) \}\)\[0\];/.test(ext));

    console.log(`\ntest_provider_keys: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
