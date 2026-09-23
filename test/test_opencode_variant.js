// X-330 — OPENCODE'S REASONING LEVEL IS `--variant`, PUBLISHED PER MODEL, AND
// CARRIED ONLY BY A HEADLESS RUN.
//
// One rule (core/opencodeVariant.ts), asked by every door: the catalog read
// (`opencode models --verbose`) becomes a per-model effort list that offers a
// model its own variants and nothing to a model that publishes none; a headless
// run may carry one of them and nothing else; a terminal or a Console card may
// carry none; and a catalog that has not answered refuses nothing.
'use strict';
const path = require('path');
const Module = require('module');
const out = (m) => path.join(__dirname, '..', 'out', 'core', m);

// consoleEngine pulls vscode in transitively; a stand-in is enough for pure calls.
const orig = Module._load;
Module._load = function (r) {
    if (r === 'vscode') {
        return {
            Uri: {}, window: {}, EventEmitter: class { get event() { return () => ({ dispose() { } }); } fire() { } },
            workspace: { getConfiguration: () => ({ get: (_k, d) => d }) }, ViewColumn: {}, ConfigurationTarget: {}, env: {}
        };
    }
    return orig.apply(this, arguments);
};
const V = require(out('opencodeVariant.js'));
const CE = require(out('consoleEngine.js'));
const M = require(out('models.js'));
const { validateLaunch } = require(out('launch.js'));
const { bridgeRunDimensions } = require(out('bridge.js'));
Module._load = orig;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const threw = (fn) => { try { fn(); return false; } catch { return true; } };

// ---------- the catalog, per model ----------
const map = V.variantsByRef([
    { ref: 'opencode/ling-3.0-flash', variants: ['low', 'medium', 'high', 'low'] },
    { ref: 'opencode/muse-spark', variants: ['minimal', 'low', 'medium', 'high', 'xhigh'] },
    { ref: 'opencode/big-pickle', variants: [] },
    { ref: '', variants: ['high'] }
]);
ok('variants are keyed by ref, deduplicated, and a model with none keeps its empty answer',
    map['opencode/ling-3.0-flash'].join() === 'low,medium,high' && map['opencode/big-pickle'].length === 0
    && !('' in map));
ok('a model with no variants draws no rows at all', V.variantEffortRows('Big Pickle', []).length === 0);
const rows = V.variantEffortRows('Muse Spark', map['opencode/muse-spark']);
ok('a model with variants draws Default first, then its own levels',
    rows[0].id === '' && rows.slice(1).map(r => r.id).join() === 'minimal,low,medium,high,xhigh'
    && /--variant/.test(rows[1].detail));

const probe = { readHome: () => undefined };
const em = M.readEngineModels(probe, ['sonnet'], undefined, {
    models: [
        { id: 'opencode/ling-3.0-flash', label: 'Ling 3.0 Flash' },
        { id: 'opencode/muse-spark', label: 'Muse Spark' },
        { id: 'opencode/big-pickle', label: 'Big Pickle' }
    ],
    fetchedAt: Date.now(), via: 'cli', variants: map
}).opencode;
ok('the engine catalog offers each model its own variants',
    M.effortsFor(em, 'opencode/ling-3.0-flash').map(r => r.id).join() === ',low,medium,high'
    && M.effortsFor(em, 'opencode/muse-spark').some(r => r.id === 'minimal'));
ok('…and nothing to a model that publishes none, or to one it does not name',
    M.effortsFor(em, 'opencode/big-pickle').length === 0 && M.effortsFor(em, 'opencode/nobody').length === 0
    && M.effortsFor(em, '').length === 0);
ok('the box note says how many models publish variants, and where they go',
    /2 of them publish reasoning variants/.test(em.note) && /headless task/.test(em.note));
const none = M.readEngineModels(probe, ['sonnet'], undefined, {
    models: [{ id: 'opencode/big-pickle', label: 'Big Pickle' }], via: 'cli'
}).opencode;
ok('a catalog with no variants says there is no level to pick', /no level to pick/.test(none.note));

// ---------- which transport carries one ----------
ok('only a headless run takes a level on OpenCode',
    CE.engineTakesEffort('opencode', 'run') && !CE.engineTakesEffort('opencode')
    && !CE.engineTakesEffort('opencode', 'tui') && !CE.engineTakesEffort('opencode', 'hosted'));
ok('…and the other engines are unchanged',
    CE.engineTakesEffort('claude') && CE.engineTakesEffort('codex', 'run')
    && !CE.engineTakesEffort('gemini', 'run') && !CE.engineTakesEffort('gemini'));

// ---------- the refusal ----------
const of = (m) => map[m];
const R = (effort, o) => CE.headlessEffortRefusal('opencode', effort, undefined, o);
ok('a published variant on a headless run is carried', R('xhigh', { model: 'opencode/muse-spark', variantsOf: of }) === '');
ok('an unpublished one is refused with the model\'s own list',
    /has no "xhigh" variant \(it publishes: low, medium, high\)/.test(R('xhigh', { model: 'opencode/ling-3.0-flash', variantsOf: of })));
ok('a model that publishes none refuses any level',
    /publishes no reasoning variants/.test(R('low', { model: 'opencode/big-pickle', variantsOf: of })));
ok('ignorance refuses nothing: no catalog, or a model it does not name, or the default model',
    R('high', { model: 'opencode/ling-3.0-flash' }) === '' && R('high', { model: 'x/unknown', variantsOf: of }) === ''
    && R('high', { variantsOf: of }) === '');
ok('a terminal is refused by name — the TUI has no --variant',
    /TUI has no --variant flag/.test(R('high', { transport: 'tui', model: 'opencode/muse-spark', variantsOf: of })));
ok('a Console card is refused by name — ACP declares only model and mode',
    /ACP, which declares only model and mode/.test(R('high', { transport: 'hosted' })));
ok('no level, nothing to refuse; a CLI profile is left alone',
    R('', { transport: 'tui' }) === '' && CE.headlessEffortRefusal('opencode', 'high', 'my-profile', { transport: 'tui' }) === '');
ok('Gemini still has no setting at all', /no reasoning-effort flag/.test(CE.headlessEffortRefusal('gemini', 'high')));

// ---------- the write-time doors ----------
ok('validateLaunch leaves an OpenCode level to the catalog (minimal is a real one)',
    !validateLaunch({ engine: 'opencode', effort: 'minimal' }).some(e => /effort/.test(e))
    && validateLaunch({ engine: 'claude', effort: 'minimal' }).some(e => /effort "minimal"/.test(e)));
ok('the bridge takes a level on a headless OpenCode run and refuses it on an interactive one',
    !threw(() => bridgeRunDimensions({ engine: 'opencode', effort: 'minimal' }))
    && threw(() => bridgeRunDimensions({ engine: 'opencode', effort: 'high', mode: 'interactive' })));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
