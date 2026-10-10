'use strict';
// X-522 (2) — THE WINDOW A ROUTE STATES IS THE METER'S DENOMINATOR. One rule (pricing.ts contextWindowOf) takes it
// as its `route` answer; routeWindow.ts says which route that is for a turn and for a session; and every surface
// that draws a percentage — and the guard that takes the handover thresholds — hands it over. A route stating no
// window adds nothing: a model nobody knows still gets no percentage (X-113).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
// the compiled core loads in plain node: turns.js reaches sessions.js, which imports vscode
const Module = require('module');
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') {
        return { Uri: {}, window: {}, workspace: { getConfiguration: () => ({ get: (_k, d) => d }) }, ViewColumn: {}, ConfigurationTarget: {}, env: {}, EventEmitter: function () { this.event = () => ({ dispose() {} }); this.fire = () => {}; } };
    }
    return origLoad.apply(this, arguments);
};
const out = f => require(path.join(ROOT, 'out', 'core', f));
const { contextWindowOf } = out('pricing.js');
const { routeNames } = out('routeName.js');
const { routeWindowOf, sessionRouteWindow, statesRouteWindow } = out('routeWindow.js');
const { turnRowsFor } = out('turns.js');
const { sessionIdentity } = out('turnRuntime.js');
const M = out('launchManifest.js');
Module._load = origLoad;
const read =f => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const is = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)} want ${JSON.stringify(want)})`, JSON.stringify(got) === JSON.stringify(want));

// ---------- 1) the rule: forced > engine > route > model table > nothing ----------
is('a route\'s window answers where the engine and the reader are silent',
    contextWindowOf(0, 'kimi-k2-thinking', 0, 1000000), { tokens: 1000000, source: 'route' });
is('the reader\'s override still outranks it', contextWindowOf(0, 'kimi-k2', 500000, 1000000).source, 'forced');
is('…and so does what the engine stated for this very session', contextWindowOf(258400, 'kimi-k2', 0, 1000000).source, 'engine');
is('‼️ it outranks the table: a known model name behind a route is still that route\'s window',
    contextWindowOf(0, 'claude-opus-5', 0, 200000), { tokens: 200000, source: 'route' });
is('‼️ a route stating none adds nothing — an unknown model still has no ceiling',
    contextWindowOf(0, 'kimi-k2', 0, 0), { tokens: 0, source: '' });
is('…and a known one keeps the table\'s answer', contextWindowOf(0, 'claude-opus-5', 0, 0).source, 'model');
is('a negative figure is not a window', contextWindowOf(0, 'kimi-k2', 0, -1).source, '');

// ---------- 2) the profiles' windows travel with their names ----------
const PROFILES = [
    { id: 'Kimi-Work', label: 'Kimi (work)', providerId: 'kimi', context: 1000000 },
    { id: 'bare', label: 'Bare', providerId: 'x' },
    { id: 'or-nemo', label: 'Nemo', providerId: 'openrouter', context: 262144.9 }
];
const NAMES = routeNames(PROFILES, []);
is('a stated window is carried, as a whole number', [NAMES.current['kimi-work'].context, NAMES.current['or-nemo'].context], [1000000, 262144]);
ok('a profile stating none carries no such field at all', !('context' in NAMES.current.bare));
ok('some profile states one', statesRouteWindow(NAMES));
ok('…none does: no profile, or only ones without a window',
    !statesRouteWindow(undefined) && !statesRouteWindow(routeNames([PROFILES[1]], [])));

// ---------- 3) which route answers for ONE TURN ----------
is('Claude: the declared profile, whatever case its id is written in', [routeWindowOf('claude', 'Kimi-Work', [], NAMES), routeWindowOf('claude', 'kimi-work', [], NAMES)], [1000000, 1000000]);
is('…a profile that states none', routeWindowOf('claude', 'bare', [], NAMES), 0);
is('…no profile', [routeWindowOf('claude', '', [], NAMES), routeWindowOf('claude', undefined, undefined, NAMES)], [0, 0]);
is('…a profile that was removed', routeWindowOf('claude', 'gone', [], NAMES), 0);
is('…no names', routeWindowOf('claude', 'kimi-work', [], undefined), 0);
is('only OpenCode\'s report names a route: any other engine keeps its declared profile',
    routeWindowOf('codex', 'kimi-work', ['openai'], NAMES), 1000000);
is('‼️ OpenCode: the turn\'s own lent route decides, not the launch\'s', routeWindowOf('opencode', 'kimi-work', ['af-or-nemo'], NAMES), 262144);
is('‼️ OpenCode: a turn on its own model is on no route', routeWindowOf('opencode', 'kimi-work', ['opencode'], NAMES), 0);
is('OpenCode: two providers in one turn name no single route', routeWindowOf('opencode', 'kimi-work', ['af-or-nemo', 'opencode'], NAMES), 0);
is('OpenCode: a turn that named nothing falls back to the launch', routeWindowOf('opencode', 'or-nemo', [' '], NAMES), 262144);

// ---------- 4) …and for a SESSION, off the launch record ----------
const identityOf = (engine, profileId) => ({
    engine, providerId: 'kimi', providerLabel: 'Kimi (work)', origin: 'agent-farm-profile', scope: 'session',
    providerProfileId: profileId, providerProfileRevision: 3, requestedModelRef: 'kimi-k2-thinking', proof: 'launch-declared'
});
const manifest = (launchId, engine, profileId) => M.manifestFor({
    launchId, at: 1_700_000_000_000, engine, identity: identityOf(engine, profileId), options: {},
    agentId: 'a1', agentName: 'developer', mechanism: 'session', cwd: 'D:/work', surface: 'terminal'
});
const MANIFESTS = [manifest('lch_ctx', 'claude', 'kimi-work'), manifest('lch_bare', 'claude', 'bare'), manifest('lch_oc', 'opencode', 'kimi-work')];
is('a Claude session on a route with a window', sessionRouteWindow({ launchId: 'lch_ctx', turns: [{ providerIds: [] }] }, MANIFESTS, NAMES), 1000000);
is('…on a route without one', sessionRouteWindow({ launchId: 'lch_bare' }, MANIFESTS, NAMES), 0);
is('…on no record at all', [sessionRouteWindow({ launchId: 'lch_none' }, MANIFESTS, NAMES), sessionRouteWindow({}, MANIFESTS, NAMES),
    sessionRouteWindow({ launchId: 'lch_ctx' }, undefined, NAMES), sessionRouteWindow(undefined, MANIFESTS, NAMES)], [0, 0, 0, 0]);
const ocTurns = (...ids) => ({ launchId: 'lch_oc', source: 'opencode', turns: ids.map(providerIds => ({ providerIds })) });
is('‼️ OpenCode: the last turn the engine named a provider for decides', [
    sessionRouteWindow(ocTurns(['opencode'], ['af-or-nemo'], []), MANIFESTS, NAMES),
    sessionRouteWindow(ocTurns(['af-or-nemo'], ['opencode'], []), MANIFESTS, NAMES),
    sessionRouteWindow(ocTurns([], []), MANIFESTS, NAMES)
], [262144, 0, 1000000]);
is('the caller\'s word for the engine wins over the transcript\'s',
    sessionRouteWindow({ launchId: 'lch_oc', turns: [{ providerIds: ['opencode'] }] }, MANIFESTS, NAMES, 'opencode'), 0);
is('with no profile stating a window nothing is looked up', sessionRouteWindow({ launchId: 'lch_ctx' }, MANIFESTS, routeNames([PROFILES[1]], [])), 0);

// ---------- 5) the meter's three cases, on the row a page draws ----------
const turn = (n, models, providerIds = []) => ({
    n, label: 'turn ' + n, ts: 1000 * n, ms: 10, apiCalls: 1, steps: 1, thinking: 0,
    endCtx: 100000, tokens: 50, wTokens: 50, cost: 0, tools: 0, errors: 0, models, providerIds
});
const session = extra => Object.assign({
    file: 'f', sessionId: 'sid', cwd: 'D:/a', agentName: 'dev', title: 't', lastTs: 9999, isSidechain: false,
    turns: [turn(1, ['kimi-k2-thinking'])]
}, extra);
const rowsOf = (s, forced = 0) => turnRowsFor(s, false, forced, sessionIdentity(s, MANIFESTS, NAMES), undefined, '', NAMES);
const win = r => [r.ctxWindow, r.ctxWindowSource];
is('‼️ a route with a window: that is the denominator, and the row says where it came from',
    win(rowsOf(session({ launchId: 'lch_ctx' }))[0]), [1000000, 'route']);
is('‼️ a route without one: no ceiling, so the page draws no percentage', win(rowsOf(session({ launchId: 'lch_bare' }))[0]), [0, '']);
is('‼️ no route: exactly as before', win(rowsOf(session({}))[0]), [0, '']);
is('a known model on a route without a window keeps the table\'s answer',
    win(rowsOf(session({ launchId: 'lch_bare', turns: [turn(1, ['claude-opus-5'])] }))[0]), [1000000, 'model']);
is('the reader\'s override still wins on a routed row', win(rowsOf(session({ launchId: 'lch_ctx' }), 42000)[0]), [42000, 'forced']);
is('…and so does a window the engine stated', win(rowsOf(session({ launchId: 'lch_ctx', ctxWindow: 258400 }))[0]), [258400, 'engine']);
is('OpenCode: each turn against the route IT ran on', rowsOf(session({
    launchId: 'lch_oc', source: 'opencode',
    turns: [turn(1, ['kimi-k2'], []), turn(2, ['nemo'], ['af-or-nemo']), turn(3, ['nobody-knows'], ['opencode'])]
})).map(win), [[1000000, 'route'], [262144, 'route'], [0, '']]);

// ---------- 6) every surface hands the route over (read from the source, not from a list) ----------
const strip = src => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
/** The argument count of every call of `name` in `src`. */
function callArgs(src, name) {
    const counts = [];
    const re = new RegExp('(?<![\\w$])' + name + '\\(', 'g');
    for (let m = re.exec(src); m; m = re.exec(src)) {
        let depth = 1, args = 0, some = false, quote = '';
        for (let i = m.index + m[0].length; i < src.length && depth > 0; i++) {
            const c = src[i];
            if (quote) { if (c === '\\') { i++; } else if (c === quote) { quote = ''; } continue; }
            if (c === '\'' || c === '"' || c === '`') { quote = c; some = true; continue; }
            if ('([{'.includes(c)) { depth++; some = true; continue; }
            if (')]}'.includes(c)) { depth--; continue; }
            if (c === ',' && depth === 1) { args++; continue; }
            if (/\S/.test(c)) { some = true; }
        }
        counts.push(some ? args + 1 : 0);
    }
    return counts;
}
const tsFiles = dir => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? tsFiles(dir + '/' + e.name) : e.name.endsWith('.ts') ? [dir + '/' + e.name] : []);
{
    const sites = [];
    for (const f of tsFiles('src')) {
        if (f === 'src/core/pricing.ts') { continue; }
        for (const n of callArgs(strip(read(f)), 'contextWindowOf')) { sites.push([f, n]); }
    }
    ok('the scan sees the surfaces at all (guard, card, resume list, dashboard, viewer, turns)', sites.length >= 6);
    const short = sites.filter(([, n]) => n !== 4).map(([f, n]) => `${f}:${n}`);
    ok('‼️ every call of the rule passes the route — a surface that leaves it out answers a different percentage: ' + short.join(', '),
        short.length === 0);

    const ext = strip(read('src/extension.ts'));
    const guard = callArgs(ext, 'contextLimitForModel');
    ok('the guard\'s three readings all pass it — the handover thresholds use the same denominator',
        guard.length === 3 && guard.every(n => n === 3));
    ok('…and each asks for THIS session\'s route', (ext.match(/contextLimitForModel\([^;]*routeWindowFor\(sessionId/g) || []).length === 3);
    ok('the Console is given the reader', /\n\s*routeWindowFor,\n/.test(ext));
    ok('…and asks it for the live card and for the resume list',
        (strip(read('src/panels/consolePanel.ts')).match(/this\.deps\.routeWindowFor\?\.\(/g) || []).length === 2);
    ok('the viewer cannot ask for a ceiling without naming the session',
        /contextLimitFor\(model: string, stated: number, sessionId: string\): number;/.test(read('src/panels/sessionViewer.ts'))
        && callArgs(strip(read('src/panels/sessionViewer.ts')), 'deps\\.contextLimitFor').every(n => n === 3));
    ok('‼️ editing a route\'s Context rebuilds the names every surface reads',
        /ps\.map\(p => \[p\.id, p\.label, p\.providerId, p\.context\]\)/.test(ext));
    ok('no lookup happens while no profile states a window',
        /statesRouteWindow\(names\) \? sessionRouteWindow\(sessionRowOf\(sessionId\), launchManifests\(\), names, engine\) : 0/.test(ext));
}

// ---------- 7) the words ----------
{
    const box = vm.createContext({ window: {} });
    vm.runInContext(read('media/charts.js'), box);
    const C = box.window.AFCharts;
    ok('the route\'s window has a sentence of its own',
        new Set(['forced', 'engine', 'route', 'model', ''].map(s => C.ctxWindowIs(s))).size === 5 && /route/.test(C.ctxWindowIs('route')));
    box.window.AFI18n = { t: s => '«' + s + '»' };
    ok('…which goes through t(), and the older three are left as they were',
        C.ctxWindowIs('route').startsWith('«') && !C.ctxWindowIs('engine').startsWith('«'));
    ok('the route form says what Claude Code and the meter do with Context',
        /t\('The context window of the route\\'s models[^\n]*Claude Code is told this window[^\n]*no percentage[^\n]*'\)/.test(read('media/afRouteForm.js')));
}

console.log(`test_x522_meter: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
