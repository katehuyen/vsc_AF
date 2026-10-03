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
    await keys.set('openrouter-r1', 'sk-or-real', 'https://openrouter.ai/api');
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
        && !/vault\.get\(secretKeyFor/.test(ext));
    ok('the keys are loaded before activation goes on', /const providerKeys = new ProviderKeys\(context\.secrets, context\.globalState\);\s*await providerKeys\.load\(\);/.test(ext));
    ok('every launch path refuses what the adapter refuses (a route with no key)',
        /return adapterFor\(engineId, registryDeps\(\)\)\.preflight\(\{ engine: engineId, providerId, \.\.\.\(tier \? \{ tier \} : \{\}\) \}\)\[0\];/.test(ext));

    // ---------- X-488 / X-492 — which key, bound to the endpoint it was given for ----------
    const { routeKeyFor, keyHint, keyPickItems } = require(path.join(OUT, 'routeKey.js'));
    const { PROVIDER_KEY_BINDS } = require(path.join(OUT, 'providerKeys.js'));
    const kc2 = keychain(), st2 = memento();
    const k2 = new ProviderKeys(kc2, st2);
    await k2.set('r', 'own-key-value-123456', 'https://openrouter.ai/api');
    ok('a typed key is bound to the endpoint it was given for, beside the keychain (not in settings)',
        JSON.stringify(st2.m.get(PROVIDER_KEY_BINDS)) === JSON.stringify({ r: { baseUrl: 'https://openrouter.ai/api' } }));
    const named = n => (n === 'OpenRouter-ahmet' ? 'sk-or-v1-0123456789abcdef4444' : undefined);
    const ownOf = id => k2.get(id);
    const route = { id: 'r', baseUrl: 'https://openrouter.ai/api' };
    ok('at its endpoint the route signs in with its own key', routeKeyFor(route, k2.bindOf('r'), ownOf, named).value === 'own-key-value-123456');
    const moved = routeKeyFor({ ...route, baseUrl: 'https://evil.example/api' }, k2.bindOf('r'), ownOf, named);
    ok('‼️ X-492 — a key NEVER follows its route to a new host, whatever wrote the change',
        moved.value === undefined && moved.heldFor === 'https://openrouter.ai/api');
    await k2.delete('r');
    await k2.bind('r', { baseUrl: 'https://openrouter.ai/api', secretRef: 'OpenRouter-ahmet' });
    const a = routeKeyFor(route, k2.bindOf('r'), ownOf, named);
    ok('‼️ a Farm Secret named by the route is its key', a.value === 'sk-or-v1-0123456789abcdef4444' && a.from === 'secret' && a.secretRef === 'OpenRouter-ahmet');
    ok('…and a moved one is no key either', routeKeyFor({ ...route, baseUrl: 'https://x.example' }, k2.bindOf('r'), ownOf, named).value === undefined);
    await k2.bind('r', { baseUrl: 'https://openrouter.ai/api', secretRef: 'deleted' });
    // an own key IS there to fall back to — so a fall back would show
    const gone = routeKeyFor(route, k2.bindOf('r'), () => 'own-fallback-key-000000', named);
    ok('‼️ a named secret that is gone is NO key — never a quiet fall back to another one', gone.value === undefined && gone.from === 'secret');
    ok('no bind, no key — a secretRef typed into settings binds nothing', routeKeyFor({ id: 'z', secretRef: 'OpenRouter-ahmet' }, undefined, ownOf, named).value === undefined);
    await k2.delete('r');
    ok('removing the key lets the bind go too', k2.bindOf('r') === undefined);
    // adoption: a key stored before binds existed is bound to the endpoint its route has at that start
    const st3 = memento(); st3.m.set(PROVIDER_SECRET_IDS, ['old', 'orphan']);
    const k3 = new ProviderKeys(keychain(), st3);
    const adopted = await k3.adopt([{ id: 'old', baseUrl: 'https://api.moonshot.ai/anthropic' }, { id: 'new' }]);
    ok('a key from before binds is bound to its route\'s endpoint once', adopted.join() === 'old'
        && k3.bindOf('old').baseUrl === 'https://api.moonshot.ai/anthropic' && k3.bindOf('orphan') === undefined);
    ok('…and only once', (await k3.adopt([{ id: 'old', baseUrl: 'https://elsewhere' }])).length === 0
        && k3.bindOf('old').baseUrl === 'https://api.moonshot.ai/anthropic');

    ok('the masked hint tells keys apart and gives none away', keyHint('sk-or-v1-0123456789abcdef4444') === 'sk-or-…4444'
        && keyHint('short-key') === '…ey' && keyHint('') === '' && keyHint(undefined) === '');
    ok('…and a canary never survives into it', !/CANARY/.test(keyHint('sk-ant-api03-CANARYx115CANARYx115CANARYx115')));
    const secrets = [{ name: 'OpenRouter-ahmet', description: 'ahmet hesabı', agents: [], farmOnly: false },
        { name: 'TYPESAFE_API_KEY', description: '', agents: [], farmOnly: true }];
    const items = keyPickItems({ from: 'secret', secretRef: 'OpenRouter-ahmet', value: 'x' }, secrets, true);
    ok('the picker offers typing, every Farm Secret by name, and removing', items.map(i => i.action).join(',') === 'type,secret,secret,remove'
        && items[1].name === 'OpenRouter-ahmet' && /in use/.test(items[1].description) && /ahmet hesabı/.test(items[1].description));
    ok('…each secret says who else receives it', /every agent/.test(items[1].detail) && /Farm-only/.test(items[2].detail));
    ok('…removing a named secret says the secret stays in the vault', /stays in the vault/.test(items[3].detail));
    ok('no key yet: nothing to remove', !keyPickItems({ from: 'none' }, secrets, false).some(i => i.action === 'remove'));
    const movedItems = keyPickItems({ from: 'route', heldFor: 'https://old.example' }, secrets, true);
    ok('a moved key is confirmed first, naming where it was given for', movedItems[0].action === 'confirm' && /old\.example/.test(movedItems[0].detail));
    ok('…but never offered when the key itself is gone', !keyPickItems({ from: 'route', heldFor: 'h' }, secrets, false).some(i => i.action === 'confirm'));
    ok('‼️ no item carries a value', !JSON.stringify(keyPickItems({ from: 'secret', secretRef: 'OpenRouter-ahmet' }, secrets, true)).includes('sk-or-v1'));

    ok('‼️ the binds are read where the launch reads the key', /routeKeyFor\(p, providerKeys\.bindOf\(p\.id\), id => providerKeys\.get\(id\), name => vault\.get\(name\)\)/.test(ext));
    ok('keys from before binds are adopted at activation, right after the load',
        /await providerKeys\.load\(\);\s*\/\/[^\n]*\n\s*await providerKeys\.adopt\(readProfiles\(cfg\(\)\.get<unknown\[\]>\('providerProfiles', \[\]\)\)\);/.test(ext));
    ok('a typed key is bound to the route\'s endpoint as it is now', /await providerKeys\.set\(id, value, route\.baseUrl \?\? ''\);/.test(ext));
    ok('naming a Farm Secret collects the own key and binds the name to this endpoint',
        /await providerKeys\.delete\(id\);\s*await providerKeys\.bind\(id, \{ baseUrl: route\.baseUrl \?\? '', secretRef: name \}\);/.test(ext));
    ok('every surface sees a route through one builder (hasSecret, keyHint, secretRef, keyHeldFor)',
        /const publicProviderProfiles = \(\) => providerProfiles\(\)\.map\(publicRoute\);/.test(ext)
        && (ext.match(/publicRoute\(w\.profile!\)/g) || []).length === 3 && !/publicProfiles\(\[w\.profile/.test(ext));
    ok('‼️ no bridge op names a key or binds one', !ext.split(/\n\s*\{\s*\n\s*op: '/).filter(s => /^providers\./.test(s))
        .some(s => /providerKeys\.(bind|set)|useFarmSecretForRoute|confirmRouteKey/.test(s)));

    // ---------- X-495 — an Anthropic model on a third-party route is asked for by its alias ----------
    const { routedModel } = require(path.join(OUT, 'routeModels.js'));
    const third = { spawnEnv: { ANTHROPIC_BASE_URL: 'https://openrouter.ai/api', ANTHROPIC_DEFAULT_OPUS_MODEL: 'x/opus', ANTHROPIC_DEFAULT_HAIKU_MODEL: 'x/haiku' } };
    ok('‼️ a full Anthropic id becomes its family alias on a third-party route', routedModel('claude-opus-5-5', third) === 'opus'
        && routedModel('claude-opus-5-5[1m]', third) === 'opus' && routedModel('claude-haiku-4-5-20251001', third) === 'haiku');
    ok('…an alias stays an alias', routedModel('opus', third) === 'opus' && routedModel('haiku', third) === 'haiku');
    ok('‼️ a family the route maps no model for is dropped — the route\'s default answers, never a model it cannot serve',
        routedModel('claude-sonnet-5', third) === '' && routedModel('sonnet', third) === '' && routedModel('claude-mystery-1', third) === '');
    ok('the route\'s own model id passes untouched', routedModel('deepseek/deepseek-r1', third) === 'deepseek/deepseek-r1');
    ok('nothing changes off a third-party route (first-party route, no route, no runtime)',
        routedModel('claude-opus-5-5', { spawnEnv: { ANTHROPIC_API_KEY: 'k' } }) === 'claude-opus-5-5'
        && routedModel('claude-opus-5-5', undefined) === 'claude-opus-5-5' && routedModel('', third) === '');
    // X-493 — a tier picked on the route sets ANTHROPIC_MODEL, and the CLI ranks --model above it
    const tiered = { spawnEnv: { ...third.spawnEnv, ANTHROPIC_MODEL: 'x/haiku' } };
    ok('‼️ at a spawn the picked tier decides: a leftover model is not sent over it',
        routedModel('opus', tiered) === '' && routedModel('claude-opus-5-5', tiered) === '' && routedModel('deepseek/deepseek-r1', tiered) === '');
    ok('…while a live switch on that card still asks for what the person picks',
        routedModel('opus', tiered, { live: true }) === 'opus' && routedModel('claude-sonnet-5', tiered, { live: true }) === '');
    ok('‼️ …and the same on a route with no base URL that maps tiers: the picked tier is the answer there too',
        routedModel('opus', { spawnEnv: { ANTHROPIC_MODEL: 'claude-opus-4-1' } }) === ''
        && routedModel('claude-opus-5-5', { spawnEnv: { ANTHROPIC_API_KEY: 'k', ANTHROPIC_MODEL: 'claude-opus-4-1' } }) === '');
    ok('…a live switch there is still asked as picked',
        routedModel('claude-opus-5-5', { spawnEnv: { ANTHROPIC_MODEL: 'claude-opus-4-1' } }, { live: true }) === 'claude-opus-5-5');
    const { routeModelNote } = require(path.join(OUT, 'routeModels.js'));
    ok('X-493 — routeModelNote: no sentence without a base URL of its own (the Model box still means something)',
        routeModelNote(undefined) === undefined && routeModelNote({ label: 'Anthropic key', tiers: ['opus'] }) === undefined);
    ok('…on a third-party route with tiers it points at them, with none it says there is nothing to choose and how to give it some',
        /^Kimi decides the model: pick one of its tiers\./.test(routeModelNote({ label: 'Kimi', baseUrl: 'https://k', tiers: ['opus'] }))
        && /^MiniMax maps no tiers, so there is no model to choose here.*Providers page, Edit/.test(routeModelNote({ label: 'MiniMax', baseUrl: 'https://m', tiers: [] })));

    const host = fs.readFileSync(path.join(ROOT, 'src', 'core', 'consolehost.ts'), 'utf8');
    const tasksTs = fs.readFileSync(path.join(ROOT, 'src', 'core', 'tasks.ts'), 'utf8');
    ok('‼️ the Console asks with the runtime its environment is built from',
        /const args = hostArgs\(\{ \.\.\.init, model: routedModel\(init\.model, routeRt\),/.test(host)
        && /\[this\.accountLayer\?\.\(engine\.id, init\.account\)\], routeRt\)/.test(host));
    ok('…and a live switch on a running card too, as a live one', /const asked = routedModel\(model\.trim\(\), this\.engineRuntime\?\.\(h\.state\.agentId/.test(host)
        && /pinned: h\.state\.routePinned\s*\}\), \{ live: true \}\);/.test(host)
        && /controlLine\(requestId, 'set_model', \{ model: asked \}\)/.test(host));
    ok('tasks: the picked model and the policy\'s both, on both spawn shapes',
        /const m = routedModel\(flag\[1\], this\.opts\.engineRuntime\?\.\(agentId, task\.engine \?\? 'claude', this\.spawnRouteOf\(task\)\)\);/.test(tasksTs)
        && (tasksTs.match(/this\.modelArgs\(task, agent\.id\)/g) || []).length === 2 && !/this\.modelArgs\(task\)/.test(tasksTs));
    ok('terminal launch, launcher preview and terminal resume',
        (ext.match(/model: routedModel\(merged\.model, resolveLaunchRoute\(/g) || []).length === 3);
    ok('the mission planner, with the runtime its environment uses',
        /launch: \{ \.\.\.launch, model: \{ \.\.\.launch\.model, value: routedModel\(launch\.model\.value, plannerRt\) \} \}/.test(ext)
        && /\[launchAccountEnv\(\{ engine: 'claude', account: spec\.plannerAccount \}\)\],\s*plannerRt\)/.test(ext));

    console.log(`\ntest_provider_keys: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
