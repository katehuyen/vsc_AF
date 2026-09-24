// X-368 — THE FLEX RESOLVER (src/core/flexResolve.ts) AND flex.list / flex.get.
//
// Every level wins over everything below it and loses to everything above it; a
// blank inherits; a value at a level the point does not declare, or one its type
// cannot hold, is reported, never used. And the launch resolvers that already
// exist keep their ladders — this checks their precedence agrees with the chain.
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`, JSON.stringify(got) === JSON.stringify(want));

const R = require(path.join(ROOT, 'out', 'core', 'flexResolve.js'));
const P = require(path.join(ROOT, 'out', 'core', 'flexPoints.js'));
const { resolveDelegateRun } = require(path.join(ROOT, 'out', 'core', 'missionMode.js'));
const { resolvePlannerLaunch } = require(path.join(ROOT, 'out', 'core', 'plannerLaunch.js'));
const { BridgeRegistry } = require(path.join(ROOT, 'out', 'core', 'bridge.js'));
const { registerFlexOps } = require(path.join(ROOT, 'out', 'core', 'flexBridge.js'));

const LV = P.FLEX_LEVELS;
const rank = l => LV.indexOf(l);

/* ---------- ‼️ every level wins over the ones below and loses to the ones above ---------- */
{
    // A synthetic point settable at every level, so each rung is exercised.
    const all = {};
    LV.filter(l => l !== 'builtin').forEach(l => { all[l] = { surface: 's', bridge: 'b' }; });
    const pt = { id: 't.all', label: 'T', type: 'text', default: 'D', remembered: false, levels: all };
    eq('the synthetic point is sound', P.flexProblems([pt]), []);

    const settable = LV.filter(l => l !== 'builtin');
    for (const win of settable) {
        const layers = {};
        settable.filter(l => rank(l) <= rank(win)).forEach(l => { layers[l] = 'v-' + l; });
        const r = R.resolveFlex(pt, layers);
        eq(`${win} wins over everything below it`, [r.value, r.from], ['v-' + win, win]);
        eq(`…and lists what it beat, highest first`, r.overridden.map(o => o.level),
            settable.filter(l => rank(l) < rank(win)).reverse());
        const above = settable.find(l => rank(l) === rank(win) + 1);
        if (above) {
            eq(`${win} loses to ${above}`, R.resolveFlex(pt, Object.assign({}, layers, { [above]: 'v-' + above })).from, above);
        }
    }
    const none = R.resolveFlex(pt, {});
    eq('nothing given = the built-in default', [none.value, none.from, none.overridden.length], ['D', 'builtin', 0]);
    eq('a blank inherits rather than winning', R.resolveFlex(pt, { settings: 'S', run: '  ' }).from, 'settings');
    eq('null and undefined inherit too', R.resolveFlex(pt, { agent: null, run: undefined, settings: 'S' }).from, 'settings');
}

/* ---------- ‼️ nothing is silently used: wrong level, wrong type ---------- */
{
    const judge = R.resolveFlex('judge.args', { settings: '--model x', workflow: '--model y' });
    eq('a level the point does not declare is not counted', [judge.value, judge.from], ['--model x', 'settings']);
    ok('…and says so', judge.ignored.length === 1 && judge.ignored[0].level === 'workflow'
        && /cannot be set at the workflow level/.test(judge.ignored[0].why));
    const calls = R.resolveFlex('retry.supervisor.maxCalls', { settings: 3, run: 9 });
    eq('a value the type cannot hold is not counted', [calls.value, calls.from], [3, 'settings']);
    ok('…and says so', calls.ignored.length === 1 && /not a valid number/.test(calls.ignored[0].why));
    ok('an unknown point is refused', (() => { try { R.resolveFlex('no.such', {}); return false; } catch { return true; } })());
}

/* ---------- the sentence every surface writes ---------- */
{
    eq('winner and what it beat', R.resolveFlex('retry.supervisor.model', { settings: 'sonnet', run: 'opus' }).sentence,
        'opus — set for this run; Farm Settings said sonnet');
    eq('winner over the shipped default', R.resolveFlex('retry.supervisor.maxCalls', { settings: 4 }).sentence,
        '4 — from Farm Settings; built-in default 2');
    eq('the default alone', R.resolveFlex('retry.supervisor.maxCalls', {}).sentence, '2 — built-in default');
    eq('a tri value names its state', R.resolveFlex('retry.supervisor.lowConfidence', { run: 'park' }).sentence,
        'ask (park) — set for this run; built-in default auto (smart)');
    eq('an empty default says so', R.resolveFlex('sentry.leaderModel', {}).sentence, '(empty) — built-in default');
}

/* ---------- the Farm Settings layer reads what the user wrote, down a path ---------- */
{
    const written = { 'agentFarm.taskRetry': { max: 2, supervisor: { engine: 'codex', maxCalls: 4 } }, 'agentFarm.judgeArgs': '--model q' };
    const read = k => written[k];
    eq('a nested field is read down its path', R.settingsLayer(P.flexPoint('retry.supervisor.maxCalls'), read), 4);
    eq('a flat key is read as it is', R.settingsLayer(P.flexPoint('judge.args'), read), '--model q');
    eq('an untouched field is undefined, so the default stays built-in',
        R.settingsLayer(P.flexPoint('retry.supervisor.model'), read), undefined);
    eq('an untouched object is undefined all the way down', R.settingsLayer(P.flexPoint('retry.supervisor.model'), () => undefined), undefined);
}

/* ---------- ‼️ the launch resolvers already in use agree with the chain ---------- */
{
    ok('every DelegateOrigin is placed on the chain', ['member', 'mission', 'agent', 'fleet', 'cli', 'extra-args', 'settings']
        .every(o => LV.indexOf(R.levelOfOrigin(o)) >= 0));
    // Peel the winner off one rung at a time and read which rung answers next.
    const ladder = (layersFor, rungs, read) => {
        const seen = [];
        for (let i = 0; i < rungs.length; i++) { seen.push(read(layersFor(rungs.slice(i)))); }
        return seen;
    };
    const engineOrder = ladder(on => resolveDelegateRun(
        on.includes('member') ? { engine: 'codex' } : {}, on.includes('mission') ? { engine: 'gemini' } : {},
        on.includes('fleet') ? { launch: { engine: 'agy' } } : {}), ['member', 'mission', 'fleet', 'cli'], r => r.origin.engine);
    eq('resolveDelegateRun engine ladder', engineOrder, ['member', 'mission', 'fleet', 'cli']);
    const modelOrder = ladder(on => resolveDelegateRun(
        Object.assign({ engine: 'codex' }, on.includes('member') ? { model: 'm1' } : {}), {},
        { farm: () => (on.includes('agent') ? { model: 'm2' } : undefined), launch: on.includes('fleet') ? { model: 'm3' } : {} }),
    ['member', 'agent', 'fleet', 'cli'], r => r.origin.model);
    eq('resolveDelegateRun model ladder', modelOrder, ['member', 'agent', 'fleet', 'cli']);
    const plannerOrder = ladder(on => resolvePlannerLaunch(
        on.includes('mission') ? { plannerModel: 'opus' } : {}, on.includes('extra-args') ? '--model sonnet' : '',
        on.includes('settings') ? [{ id: 'user', file: 'settings.json', text: '{"model":"haiku"}' }] : []),
    ['mission', 'extra-args', 'settings', 'cli'], r => r.model.origin);
    eq('resolvePlannerLaunch model ladder', plannerOrder, ['mission', 'extra-args', 'settings', 'cli']);
    for (const [name, order] of [['engine', engineOrder], ['model', modelOrder], ['planner', plannerOrder]]) {
        const ranks = order.map(o => rank(R.levelOfOrigin(o)));
        ok(`${name}: each rung sits no lower on the chain than the one it beats (${ranks})`,
            ranks.every((r, i) => i === 0 || ranks[i - 1] >= r));
    }
}

/* ---------- flex.list / flex.get on the bridge ---------- */
(async () => {
    const written = { 'agentFarm.taskRetry': { supervisor: { engine: 'claude', model: 'sonnet' } } };
    const reg = new BridgeRegistry();
    registerFlexOps(reg, { readSetting: k => written[k] });
    const list = await reg.dispatch('flex.list', { ctx: { retryBehavior: 'smart' } });
    ok('flex.list answers', list.ok);
    eq('…with the chain', list.result.levels.map(l => l.level), LV);
    eq('…and every point', list.result.points.map(p => p.id), P.flexPointIds());
    const m = list.result.points.find(p => p.id === 'retry.supervisor.model');
    eq('…each level with its surface and bridge key', m.levels.map(l => [l.level, !!l.surface, !!l.bridge]),
        [['settings', true, true], ['run', true, true]]);
    eq('…and applies under the given facts', m.applies.ok, false);

    const got = await reg.dispatch('flex.get', { point: 'retry.supervisor.model', layers: { run: 'opus' } });
    eq('flex.get reads the user\'s Farm Settings value and lets the run beat it',
        [got.result.value, got.result.from, got.result.overridden], ['opus', 'run', [{ level: 'settings', value: 'sonnet' }]]);
    const own = await reg.dispatch('flex.get', { point: 'retry.supervisor.model', layers: { settings: 'haiku' } });
    eq('a settings layer the caller passes replaces the read', own.result.value, 'haiku');
    const untouched = await reg.dispatch('flex.get', { point: 'judge.args' });
    eq('an untouched setting resolves built-in', untouched.result.from, 'builtin');
    const bad = await reg.dispatch('flex.get', { point: 'no.such' });
    ok('an unknown point is refused by name', !bad.ok && /not a flex point/.test(bad.error));
    const badLayers = await reg.dispatch('flex.get', { point: 'judge.args', layers: 'run' });
    ok('layers must be an object', !badLayers.ok);

    console.log(`${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
