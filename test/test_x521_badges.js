// X-521 — the second badge says what answers: a lent route's label (both engines), OpenCode's own model by its
// catalog name, nothing on a Claude run with no route; the service name never, and Claude's output byte for byte.
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const T = require(path.join(ROOT, 'out', 'core', 'turnRuntime.js'));
const N = require(path.join(ROOT, 'out', 'core', 'routeName.js'));
const M = require(path.join(ROOT, 'out', 'core', 'launchManifest.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const manifest = identity => M.manifestFor({
    launchId: 'lch_x521', at: 1_700_000_000_000, engine: identity.engine, identity, options: {},
    agentId: 'a1', agentName: 'developer', mechanism: 'session', cwd: 'D:/work', surface: 'terminal'
});
const MODELS = { 'opencode/big-pickle': 'Big Pickle', 'opencode/nemotron-3.5-lightning-free': 'Nemotron 3.5 Lightning Free' };
const NAMES = { current: {}, last: {}, models: MODELS };
const NATIVE = {
    engine: 'opencode', providerId: 'opencode', providerLabel: 'opencode', origin: 'engine-native', scope: 'turn',
    requestedModelRef: 'opencode/big-pickle', proof: 'launch-declared'
};
const OC_ROUTE = {
    engine: 'opencode', providerId: 'openrouter', providerLabel: 'or-nemotron', origin: 'agent-farm-profile', scope: 'turn',
    providerProfileId: 'or-nemotron', providerProfileRevision: 4, requestedModelRef: 'af-or-nemotron/nvidia/nemo:free',
    proof: 'launch-declared'
};
const CLAUDE_ROUTE = {
    engine: 'claude', providerId: 'kimi', providerLabel: 'Kimi (work)', origin: 'agent-farm-profile', scope: 'session',
    providerProfileId: 'kimi-work', providerProfileRevision: 3, requestedModelRef: 'kimi-k2-thinking', proof: 'launch-declared'
};

// ---------- (1) the label, pure ----------
{
    ok('OpenCode\'s own model: the reported model\'s catalog name',
        N.runModelLabel('opencode', 'engine-native', ['opencode'], ['big-pickle'], 'opencode/x', MODELS) === 'Big Pickle');
    ok('…the requested one when nothing was reported',
        N.runModelLabel('opencode', 'engine-native', [], [], 'opencode/nemotron-3.5-lightning-free', MODELS) === 'Nemotron 3.5 Lightning Free');
    ok('…the reference itself when the catalog has no row', N.runModelLabel('opencode', 'engine-native', [], [], 'opencode/new-one', MODELS) === 'opencode/new-one');
    ok('…a bare model with several providers is matched by reference, never by cutting a display name',
        N.runModelLabel('opencode', 'engine-native', [], ['big-pickle'], '', MODELS) === 'Big Pickle');
    ok('a route\'s run carries no model label (the route\'s label stands)', N.runModelLabel('opencode', 'agent-farm-profile', [], ['m'], 'af-x/m', MODELS) === '');
    ok('a Claude run carries none', N.runModelLabel('claude', 'engine-native', [], ['opus'], 'opus', MODELS) === '');
}

// ---------- (1) on the identity ----------
{
    const own = T.runIdentity(manifest(NATIVE), 'opencode', [{ n: 1, models: ['big-pickle'], providerIds: ['opencode'] }], { names: NAMES });
    ok('‼️ an OpenCode run on its own model carries modelLabel', own.modelLabel === 'Big Pickle');
    const lent = T.runIdentity(manifest(OC_ROUTE), 'opencode', [], { names: NAMES });
    ok('…a run on a lent route does not', !('modelLabel' in lent));
    const before = T.runIdentity(manifest(CLAUDE_ROUTE), 'claude', [], { names: { current: {}, last: {} } });
    const after = T.runIdentity(manifest(CLAUDE_ROUTE), 'claude', [], { names: NAMES });
    ok('‼️ a Claude run\'s identity is byte for byte what it was', JSON.stringify(before) === JSON.stringify(after) && !('modelLabel' in after));
}

// ---------- (2) the chip and (5) the hover ----------
{
    const win = {};
    vm.runInNewContext(read('media/afProvider.js'), { window: win });
    const P = win.AFProvider;
    const text = html => String(html).replace(/<[^>]+>/g, '');
    const own = { ...NATIVE, binding: 'declared', modelLabel: 'Nemotron 3.5 Lightning Free', reportedProviderIds: ['opencode'] };
    ok('‼️ OpenCode + its own model: the chip is the model, never "opencode"', text(P.chip(own, '', P.CARD_MAX)) === 'Nemotron 3.5 L…');
    ok('…in the engine provider\'s colour', P.chip(own).includes(P.cls({ providerId: 'opencode' })));
    ok('…and the hover opens with the whole name', /^Nemotron 3\.5 Lightning Free — /.test(P.title(own)));
    const route = { ...OC_ROUTE, binding: 'declared', reportedModels: ['nvidia/nemo:free'] };
    ok('a lent route: the route\'s label', text(P.chip(route)) === 'or-nemotron');
    ok('…in its company\'s colour, the same chip a Claude run on it wears',
        P.chip(route).includes(P.cls({ providerId: 'openrouter' })) && P.cls(route) === P.cls({ ...CLAUDE_ROUTE, providerId: 'openrouter' }));
    const ownTip = P.tipLines(own).filter(Boolean);
    ok('the hover names the origin (the service only there) on OpenCode\'s own model', ownTip.some(l => /^Origin: OpenCode's own provider · /.test(l)));
    const routeTip = P.tipLines(route).filter(Boolean);
    ok('…and on a route: lent at launch, and the model running', routeTip.includes('Origin: Agent Farm route · lent at launch')
        && routeTip.includes('Model running: nvidia/nemo:free') && routeTip.some(l => /^Answered with: /.test(l)));
    const claude = { ...CLAUDE_ROUTE, binding: 'declared' };
    ok('‼️ a Claude route\'s chip and hover are unchanged (no origin, no running line)',
        text(P.chip(claude)) === 'Kimi (work)' && !P.tipLines(claude).some(l => /^(Origin|Model running):/.test(l)));
}

// ---------- (4) the Console card, read off the source (it lives in the extension's closure) ----------
{
    const ext = read('src/extension.ts');
    const fn = ext.slice(ext.indexOf('const consoleRouteOf = ('), ext.indexOf('const consoleRouteOf = (') + 6200);
    ok('‼️ on OpenCode a lent route is named by its label in its company\'s colour',
        /const rid = routeIdOfWire\(pid\);/.test(fn) && /label: p\?\.label \|\| n\?\.label \|\| labelOf\(pid\), shape: p\?\.providerId \|\| n\?\.providerId \|\| pid/.test(fn));
    ok('…OpenCode\'s own model by its catalog name, else its reference', /label: \(routeNamesNow\(\)\.models \?\? \{\}\)\[m\] \|\| m \|\| labelOf\(pid\), shape: pid/.test(fn));
    ok('…and `now` and `lastTurn` ask the same rule', /lastTurn: \{ id: servedLast, label: ocMark\(servedLast, reportedModelRef\)/.test(fn)
        && /now: \{ id: servingNow, label: ocMark\(servingNow, modelRef\)/.test(fn));
    ok('a card started on a lent route finds its profile by the bare id, on OpenCode only',
        /const bareId = engineOf\(engine\)\.id === 'opencode' \? \(routeIdOfWire\(id\) \|\| id\) : id;/.test(fn));
    ok('the names every surface passes carry OpenCode\'s own catalog names, never a route\'s `af-` rows',
        /if \(!r\.providerId\.startsWith\('af-'\) && r\.label\) \{ models\[r\.ref\] = r\.label; \}/.test(ext));
}

console.log(`test_x521_badges: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
