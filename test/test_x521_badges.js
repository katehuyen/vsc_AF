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

// ---------- (6) a lent route read back from the record, and every surface ----------
{
    const decl = { providerProfileId: 'or-nemotron', providerId: 'openrouter' };
    ok('‼️ OpenCode\'s af-<route> is read back as the company the launch declared', N.routeVendorOf('af-or-nemotron', decl, undefined) === 'openrouter');
    ok('…another route by the profile now, then the last launch on it',
        N.routeVendorOf('af-kimi-b', decl, { current: { 'kimi-b': { label: 'K', providerId: 'kimi' } }, last: {} }) === 'kimi'
        && N.routeVendorOf('af-gone', decl, { current: {}, last: { gone: { label: 'G', providerId: 'zai' } } }) === 'zai');
    ok('…an unknown one by its bare id, anything not ours untouched',
        N.routeVendorOf('af-nobody', decl, NAMES) === 'nobody' && N.routeVendorOf('opencode', decl, NAMES) === 'opencode');

    const turnsOn = ids => [{ n: 1, models: ['nvidia/nemo:free'], providerIds: ids }];
    const lent = T.runIdentity(manifest(OC_ROUTE), 'opencode', turnsOn(['af-or-nemotron']), { names: NAMES });
    ok('‼️ an OpenCode route session\'s record agrees with its launch (no false "served by af-…")',
        JSON.stringify(lent.reportedProviderIds) === '["openrouter"]' && !lent.multiProvider);
    const win = {};
    vm.runInNewContext(read('media/afProvider.js'), { window: win });
    const P = win.AFProvider;
    const text = html => String(html).replace(/<[^>]+>/g, '');
    ok('…so its chip is the route\'s label in its company\'s colour on every session surface',
        text(P.chip(lent, '', P.CARD_MAX)) === 'or-nemotron' && P.chip(lent).includes(P.cls({ providerId: 'openrouter' })));
    const claudeRaw = T.runIdentity(manifest(CLAUDE_ROUTE), 'claude', turnsOn(['af-kimi-work']), { names: NAMES });
    ok('a Claude record is never read back', JSON.stringify(claudeRaw.reportedProviderIds) === '["af-kimi-work"]');
    ok('runLines gives a self-worded hover the same two lines', P.runLines({ ...lent, binding: 'declared' })[0] === 'Origin: Agent Farm route · lent at launch'
        && P.runLines(CLAUDE_ROUTE).every(l => l === ''));

    const Module = require('module');
    const orig = Module._load;
    Module._load = function (req) { return req === 'vscode' ? {} : orig.apply(this, arguments); };
    const { turnRowsFor } = require(path.join(ROOT, 'out', 'core', 'turns.js'));
    Module._load = orig;
    const sess = (source, turns) => ({ file: 'f', sessionId: 'sid', cwd: 'D:/a', agentName: 'dev', title: 't', lastTs: 9, isSidechain: false, source, turns });
    const own = T.runIdentity(manifest(NATIVE), 'opencode', [{ n: 1, models: ['big-pickle'], providerIds: ['opencode'] }], { names: NAMES });
    const ownRow = turnRowsFor(sess('opencode', [{ n: 1, ts: 1, models: ['big-pickle'], providerIds: ['opencode'] }]), false, 0, own, undefined, '', NAMES)[0];
    ok('‼️ a Turns row of OpenCode\'s own model carries its catalog name', ownRow.modelLabel === 'Big Pickle' && JSON.stringify(ownRow.servedBy) === '["opencode"]');
    const lentRow = turnRowsFor(sess('opencode', [{ n: 1, ts: 1, models: ['nvidia/nemo:free'], providerIds: ['af-or-nemotron'] }]), false, 0, lent, undefined, '', NAMES)[0];
    ok('…a lent route\'s turn is served by its company, and the Providers filter finds it there',
        JSON.stringify(lentRow.servedBy) === '["openrouter"]' && lentRow.providers.includes('openrouter') && lentRow.modelLabel === ''
        && JSON.stringify(lentRow.providerIds) === '["af-or-nemotron"]');
    const claudeRow = turnRowsFor(sess(undefined, [{ n: 1, ts: 1, models: ['claude-opus-5'] }]), false, 0,
        T.runIdentity(manifest(CLAUDE_ROUTE), 'claude', [], { names: NAMES }), undefined, '', NAMES)[0];
    ok('‼️ a Claude turn: nothing served, no label — its row draws no chip, as before', claudeRow.servedBy.length === 0 && claudeRow.modelLabel === '');

    const turnsJs = read('media/turns.js');
    ok('the Turns chip wears the read-back provider, the route label and the model name',
        /providerId: served\.length \? r\.route \|\| '' : '', providerLabel: r\.routeLabel \|\| ''/.test(turnsJs)
        && /reportedProviderIds: served, modelLabel: r\.modelLabel \|\| '', servedLabel: r\.servedLabel \|\| '',\s*multiProvider: served\.length > 1/.test(turnsJs));
    const table = read('media/sessionsTable.js');
    ok('the Sessions table hover carries the origin lines, and its search finds what the chip says',
        /\.\.\.window\.AFProvider\.nameLines\(I\),\s*\.\.\.window\.AFProvider\.runLines\(I\),/.test(table)
        && /\(identityOf\(r\) \|\| \{\}\)\.modelLabel/.test(table));
    ok('the Console card hover carries them too', /\.\.\.window\.AFProvider\.runLines\(s\.identity\),/.test(read('media/console.js')));
    const ext = read('src/extension.ts');
    ok('every host builder passes the names: the Turns op, the identity op\'s rows', /projectOf: sessionProjectName,\s*routeNames: \(\) => routeNamesNow\(\),/.test(ext)
        && /providerIds: t\.providerIds \}\)\), routeNamesNow\(\)\);/.test(ext));
    ok('…the Sessions rows\' drift', (read('src/panels/dashboard.ts').match(/turnRuntimes\(m, engine, reports, names\)/g) || []).length === 2);
}

// ---------- a card opened on OpenCode's own model and moved onto a lent route at a turn boundary ----------
{
    const named = { current: { 'or-nemotron': { label: 'Nemotron-Ultra', providerId: 'openrouter' } }, last: {}, models: MODELS };
    const moved = T.runIdentity(manifest(NATIVE), 'opencode',
        [{ n: 1, models: ['nvidia/nemo:free'], providerIds: ['af-or-nemotron'] }], { names: named });
    ok('‼️ the record names the route it moved onto, never a model reference cut from it', moved.servedLabel === 'Nemotron-Ultra' && !('modelLabel' in moved));
    const win = {};
    vm.runInNewContext(read('media/afProvider.js'), { window: win });
    const P = win.AFProvider;
    const I = { ...moved, binding: 'declared' };
    ok('…its chip is that route\'s label in its company\'s colour, never "OpenRouter"',
        String(P.chip(I, '', P.CARD_MAX)).replace(/<[^>]+>/g, '') === 'Nemotron-Ultra' && P.chip(I).includes(P.cls({ providerId: 'openrouter' })));
    ok('…the hover opens with it and says the route was chosen during the run, with the model running',
        /^Nemotron-Ultra — the route this run moved onto/.test(P.title(I))
        && P.runLines(I)[0] === 'Origin: Agent Farm route · chosen during the run' && P.runLines(I)[1] === 'Model running: nvidia/nemo:free');
    const back = T.runIdentity(manifest(NATIVE), 'opencode', [{ n: 1, models: ['nvidia/nemo:free'], providerIds: ['af-or-nemotron'] },
        { n: 2, models: ['big-pickle'], providerIds: ['opencode'] }], { names: named });
    ok('…back on its own model, the model\'s name again (the chip counts two providers)', back.modelLabel === 'Big Pickle' && !('servedLabel' in back) && back.multiProvider);
    ok('…a removed route by the last name a launch gave it, an unknown one by its id',
        N.badgeNames('opencode', NATIVE, [{ providerIds: ['af-gone'] }], [], { current: {}, last: { gone: { label: 'Old name', providerId: 'zai' } } }).servedLabel === 'Old name'
        && N.badgeNames('opencode', NATIVE, [{ providerIds: ['af-gone'] }], [], undefined).servedLabel === 'gone');
    const declared = T.runIdentity(manifest(OC_ROUTE), 'opencode', [{ n: 1, models: ['m'], providerIds: ['af-or-nemotron'] }], { names: named });
    ok('a run declared on the route carries no servedLabel (its own label stands)', !('servedLabel' in declared) && declared.providerLabel === 'Nemotron-Ultra');
    ok('a Claude run never carries one', N.badgeNames('claude', CLAUDE_ROUTE, [{ providerIds: ['af-x'] }], [], named).servedLabel === '');
    const { turnRowsFor } = require(path.join(ROOT, 'out', 'core', 'turns.js'));
    const row = turnRowsFor({ file: 'f', sessionId: 's', cwd: 'D:/a', agentName: 'dev', title: 't', lastTs: 9, isSidechain: false, source: 'opencode',
        turns: [{ n: 1, ts: 1, models: ['nvidia/nemo:free'], providerIds: ['af-or-nemotron'] }] }, false, 0, moved, undefined, '', named)[0];
    ok('…and that turn\'s row on the Turns page names the route too', row.servedLabel === 'Nemotron-Ultra' && row.modelLabel === '');
}

console.log(`test_x521_badges: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
