// X-517 D — the one door: a lent route's model names its route, the model sent is always one of the
// route's, and every door that holds a model hands it to the resolver. Pure functions plus source checks.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`, JSON.stringify(got) === JSON.stringify(want));
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const L = require(path.join(ROOT, 'out', 'core', 'launchSelection.js'));
const G = require(path.join(ROOT, 'out', 'core', 'providerRegistry.js'));
const M = require(path.join(ROOT, 'out', 'core', 'routeModels.js'));
const P = require(path.join(ROOT, 'out', 'core', 'launchProvider.js'));
const RG = require(path.join(ROOT, 'out', 'core', 'resumeGate.js'));

const kimi = { id: 'kimi', label: 'Kimi', engines: ['claude', 'opencode'], providerId: 'moonshot', baseUrl: 'https://k.example/anthropic',
    authKind: 'api-key', tiers: { opus: 'k2', haiku: 'k2-mini' }, revision: 3 };
const deps = { profiles: [kimi], secretFor: id => (id === 'kimi' ? 'sk-k' : undefined), inheritedEnv: {},
    openCodeCatalogText: 'opencode/big-pickle\n' + JSON.stringify({ id: 'big-pickle', providerID: 'opencode', name: 'Big Pickle', capabilities: {} }, null, 2) };
const sel = (engine, route, standing = { providerId: '', tier: '' }) =>
    L.launchSelection(engine, route, () => standing, s => G.resolveRuntime(engine, s, deps));

// ---------- D1 the door ----------
{
    const byModel = sel('opencode', { model: 'af-kimi/k2-mini' }, { providerId: 'opencode', tier: '' });
    eq('‼️ a lent route\'s model with no route named IS the chosen route — before the agent\'s standing one',
        [byModel.routed, byModel.rt.identity.providerProfileId, byModel.rt.identity.requestedModelRef], [true, 'kimi', 'af-kimi/k2-mini']);
    ok('…and it is lent: the route\'s config and key variable', Object.keys(byModel.rt.spawnEnv).includes('AF_ROUTE_KEY_KIMI'));
    const named = sel('opencode', { providerId: 'af-kimi' });
    eq('a named route with no model: routed, its default is the model', [named.routed, named.rt.modelRule.defaultRef], [true, 'af-kimi/k2']);
    eq('…with a model of its own: the identity names that one', sel('opencode', { providerId: 'af-kimi', model: 'af-kimi/k2-mini' }).rt.identity.requestedModelRef, 'af-kimi/k2-mini');
    const engineOwn = sel('opencode', { model: 'opencode/big-pickle' }, { providerId: 'opencode', tier: '' });
    eq('an engine model is no route: the agent\'s standing provider answers, with no model in the selection',
        [engineOwn.routed, engineOwn.sel, engineOwn.rt.spawnEnv], [true, { engine: 'opencode', providerId: 'opencode' }, undefined]);
    const pinned = sel('opencode', { providerId: '', pinned: true, model: 'af-kimi/k2' }, { providerId: 'opencode', tier: '' });
    eq('‼️ a pinned empty route stays empty — the model does not reopen it', [pinned.routed, pinned.sel], [false, { engine: 'opencode' }]);
    const claude = sel('claude', { providerId: 'kimi', tier: 'opus', model: 'claude-opus-5-5' });
    eq('‼️ Claude: the model never enters the selection — the identity and env are what they were',
        [claude.sel, claude.rt.identity.requestedModelRef, claude.rt.modelRule], [{ engine: 'claude', providerId: 'kimi', tier: 'opus' }, 'k2', undefined]);
    eq('…and with no route named, the standing one as before', sel('claude', { model: 'opus' }, { providerId: 'kimi', tier: '' }).sel, { engine: 'claude', providerId: 'kimi' });
}

// ---------- D2 the model sent ----------
{
    const rule = { modelRule: { refs: ['af-kimi/k2', 'af-kimi/k2-mini'], defaultRef: 'af-kimi/k2' } };
    eq('‼️ on a lent route the model sent is always one of the route\'s', [M.routedModel('af-kimi/k2-mini', rule), M.routedModel('', rule),
        M.routedModel('opencode/big-pickle', rule), M.routedModel('x', rule, { live: true })], ['af-kimi/k2-mini', 'af-kimi/k2', 'af-kimi/k2', 'af-kimi/k2']);
    eq('…and with no rule nothing changes', [M.routedModel('opencode/big-pickle', undefined), M.routedModel('', { spawnEnv: {} })], ['opencode/big-pickle', '']);
}

// ---------- the form: a route model fills its provider; Default names the route's model ----------
{
    const a = G.adapterFor('opencode', deps);
    const r = P.pruneProviderPick(a, { model: 'af-kimi/k2-mini' }, 'run');
    eq('a lent route\'s model picked with the provider empty fills the provider and keeps the model', [r.pick.providerId, r.pick.model, r.dropped], ['af-kimi', 'af-kimi/k2-mini', []]);
    eq('…an engine model fills nothing', P.pruneProviderPick(a, { model: 'opencode/big-pickle' }, 'run').pick.providerId, undefined);
    const form = P.launchProviderForm(a, { providerId: 'af-kimi' }, 'run');
    ok('on a lent route "Default" is the route\'s default, never the engine\'s', /the route's default — k2/.test(form.sub.choices[0].detail));
}

// ---------- the resume gate: a lent route resumes by its wire id ----------
{
    const a = G.adapterFor('opencode', deps);
    const prior = { identity: { engine: 'opencode', providerId: 'moonshot', origin: 'agent-farm-profile', scope: 'turn', providerProfileId: 'kimi',
        providerProfileRevision: 3, requestedModelRef: 'af-kimi/k2', proof: 'launch-declared' } };
    const g = RG.resumeRoute(a, 'declared', prior, {}, { providerId: '', tier: '' }, 'run', { profileRevision: () => 3 });
    eq('‼️ a session that ran on a lent route resumes pinned on it', [g.act, g.providerId, g.pinned], ['pinned', 'af-kimi', true]);
}

// ---------- every door that holds a model hands it over (source) ----------
{
    const ext = read('src/extension.ts');
    const tasks = read('src/core/tasks.ts');
    const host = read('src/core/consolehost.ts');
    eq('the extension\'s resolveLaunchRoute calls that hold a model pass it',
        (ext.match(/resolveLaunchRoute\([^;]*model: (o\.options|run\.options|merged)\.model/g) || []).length
        + (ext.match(/resolveLaunchRoute\(ownerAgent\?\.id \?\? '', engine, withModel\(gatedRoute\(gate\), merged\.model\)\)/g) || []).length, 6);
    ok('…the terminal launch\'s route carries it', /const route = \{ providerId: merged\.providerId, tier: merged\.tier, pinned: merged\.routePinned, model: merged\.model \};/.test(ext));
    ok('the runtime a door gets carries the model rule', /\.\.\.\(r\.modelRule \? \{ modelRule: r\.modelRule \} : \{\}\)/.test(ext)
        && /\.\.\.\(routed && rt\.modelRule \? \{ modelRule: rt\.modelRule \} : \{\}\)/.test(ext));
    ok('a task\'s route carries its model, and every non-Claude task model goes through the rule',
        /const model = task\.model \? \{ model: task\.model \} : \{\};/.test(tasks) && (tasks.match(/model: this\.askedModel\(task, agent\.id\)/g) || []).length === 3);
    ok('the Console asks with the model on the first spawn and on a live switch',
        /pinned: init\.routePinned, model: init\.model/.test(host) && /pinned: h\.state\.routePinned, model: model\.trim\(\)/.test(host));
    const at = ext.indexOf("op: 'providers.runtime'");
    ok('providers.runtime takes model= and answers the model rule, through the door', /const model = optStr\(args, 'model'\);/.test(ext.slice(at, at + 3200))
        && /launchSelectionFor\(agent\.dir, engine, model \? \{ model \} : undefined, rdeps\)/.test(ext.slice(at, at + 3200))
        && /modelRule: rt\.modelRule/.test(ext.slice(at, at + 3200)));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
