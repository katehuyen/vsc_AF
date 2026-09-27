// X-369 — THE PRESET LIBRARY (src/core/flexPresets.ts) AND presets.* ON THE BRIDGE.
//
// A preset is a named set of flex point values applied at one level. Balanced
// IS the shipped behaviour, so it is pinned to the registry's defaults; the
// user's presets are checked point by point before they are stored; applying
// one says so in the origin ("preset: Economy"); editing afterwards never
// changes the preset ("Balanced + 2 changes"). Launch profiles and the sentry
// presets are only LISTED, each with the door that applies it.
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`, JSON.stringify(got) === JSON.stringify(want));
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };

const X = require(path.join(ROOT, 'out', 'core', 'flexPresets.js'));
const P = require(path.join(ROOT, 'out', 'core', 'flexPoints.js'));
const R = require(path.join(ROOT, 'out', 'core', 'flexResolve.js'));
const { PRESETS: SENTRY } = require(path.join(ROOT, 'out', 'core', 'sentryPolicy.js'));
const { BridgeRegistry } = require(path.join(ROOT, 'out', 'core', 'bridge.js'));
const { registerFlexOps } = require(path.join(ROOT, 'out', 'core', 'flexBridge.js'));

/* ---------- the built-in presets ---------- */
{
    eq('the cost family is Economy · Balanced · Quality', X.BUILTIN_PRESETS.filter(p => p.family === 'cost').map(p => p.name),
        ['Economy', 'Balanced', 'Quality']);
    ok('every built-in preset is sound', X.BUILTIN_PRESETS.every(p => X.presetError(p) === ''));
    const bal = X.BUILTIN_PRESETS.find(p => p.name === 'Balanced');
    ok('‼️ Balanced IS the shipped behaviour: every value is its point\'s default',
        Object.entries(bal.values).every(([id, v]) => JSON.stringify(P.flexPoint(id).default) === JSON.stringify(v)));
    eq('the three set the same points, so switching family members leaves nothing behind',
        [...new Set(X.BUILTIN_PRESETS.map(p => Object.keys(p.values).sort().join(',')))].length, 1);
}

/* ---------- a preset is checked before it is stored ---------- */
{
    const good = { name: 'Mine', values: { 'retry.supervisor.maxCalls': 4 }, scope: 'global' };
    eq('a sound preset', X.presetError(good), '');
    ok('no name is refused', /needs a name/.test(X.presetError({ ...good, name: ' ' })));
    ok('no values is refused', /at least one/.test(X.presetError({ ...good, values: {} })));
    ok('an unknown point is refused by name', /"no.such" is not a flex point/.test(X.presetError({ ...good, values: { 'no.such': 1 } })));
    ok('a value its point cannot hold is refused', /not a valid number/.test(X.presetError({ ...good, values: { 'retry.supervisor.maxCalls': 9 } })));
    ok('a project preset names its project', /names its project/.test(X.presetError({ ...good, scope: 'project' })));
    eq('the stored list is normalised; a malformed entry is dropped, never half-read',
        X.normalizePresets([good, { name: 'Bad', values: { 'no.such': 1 } }, 'junk', null]).map(p => p.name), ['Mine']);
    eq('a stored list that is not a list is empty', X.normalizePresets({}), []);
}

/* ---------- save / rename / delete ---------- */
{
    const a = { name: 'Night', values: { 'sentry.leaderBudgetUsd': 3 }, scope: 'global' };
    let list = X.savePreset([], a);
    eq('saved', list.map(p => p.name), ['Night']);
    list = X.savePreset(list, { ...a, values: { 'sentry.leaderBudgetUsd': 4 } });
    eq('saving the same name replaces it', [list.length, list[0].values['sentry.leaderBudgetUsd']], [1, 4]);
    list = X.savePreset(list, { ...a, name: 'Late' }, 'Night');
    eq('renameFrom renames', list.map(p => p.name), ['Late']);
    list = X.savePreset(list, { ...a, name: 'Other' });
    ok('a rename onto a name already there is refused', throws(() => X.savePreset(list, { ...a, name: 'Other' }, 'Late'), /already exists/));
    ok('a built-in name is refused', throws(() => X.savePreset(list, { ...a, name: 'balanced' }), /built-in/));
    const proj = X.savePreset(list, { ...a, name: 'Late', scope: 'project', project: 'prj_1' });
    eq('a project preset of the same name lives beside the global one', proj.filter(p => p.name === 'Late').length, 2);
    eq('…and wins inside its project', X.findPreset(proj, 'late', 'prj_1').scope, 'project');
    eq('…and outside it the global one answers', X.findPreset(proj, 'Late').scope, 'global');
    eq('another project does not see it', X.presetsFor(proj, 'prj_2').filter(p => p.scope === 'project').length, 0);
    ok('a built-in preset cannot be deleted', throws(() => X.deletePreset(proj, 'Economy'), /built-in/));
    ok('deleting what is not there says so', throws(() => X.deletePreset(proj, 'Nope'), /No preset named "Nope"/));
    eq('delete removes only the one in that scope', X.deletePreset(proj, 'Late', 'prj_1').filter(p => p.name === 'Late').map(p => p.scope), ['global']);
}

/* ---------- "Balanced + 2 changes" ---------- */
{
    const bal = X.BUILTIN_PRESETS.find(p => p.name === 'Balanced');
    eq('untouched reads as the preset', X.presetDiff(bal, { ...bal.values }).label, 'Balanced');
    eq('one change', X.presetDiff(bal, { ...bal.values, 'retry.supervisor.maxCalls': 3 }).label, 'Balanced + 1 change');
    const two = X.presetDiff(bal, { ...bal.values, 'retry.supervisor.maxCalls': 3, 'sentry.leaderBudgetUsd': 9 });
    eq('two changes, named', [two.label, two.changed.sort()], ['Balanced + 2 changes', ['retry.supervisor.maxCalls', 'sentry.leaderBudgetUsd']]);
    eq('the preset itself was not touched', bal.values['retry.supervisor.maxCalls'], 2);
}

/* ---------- applying = each value at its level's bridge key ---------- */
{
    const eco = X.BUILTIN_PRESETS.find(p => p.name === 'Economy');
    const s = X.presetArgs(eco, 'settings');
    eq('at Farm Settings: grouped under settings.set, objects nested down their path', s.ops, {
        'settings.set': {
            'agentFarm.judgeArgs': '--model claude-haiku-4-5-20251001',
            'agentFarm.judgeLadder': 'haiku',
            'agentFarm.taskRetry': { supervisor: { maxCalls: 1, budgetUsd: 0.5 } },
            'agentFarm.sentryLeaderBudgetUsd': 1,
            'agentFarm.workflowSpendCap': 5
        }
    });
    eq('…nothing skipped', s.skipped, []);
    const r = X.presetArgs(eco, 'run');
    eq('at run start: the args for tasks.add, and (A-27) a workflow run\'s ladder and cap', r.ops, { 'workflows.run': { judgeLadder: 'haiku', spendCap: 5 }, 'tasks.add': { retry: { supervisor: { maxCalls: 1, budgetUsd: 0.5 } } } });
    eq('…and what a run cannot hold is skipped with the reason', r.skipped.map(x => x.point).sort(), ['judge.args', 'sentry.leaderBudgetUsd']);
    ok('…named', r.skipped.every(x => /cannot be set at the run start level/.test(x.why)));
    eq('the origin names the preset', R.resolveFlex('retry.supervisor.maxCalls', { settings: 1 }, { settings: 'Economy' }).sentence,
        '1 — from Farm Settings (preset: Economy); built-in default 2');
    eq('…only when the preset\'s level won', R.resolveFlex('retry.supervisor.maxCalls', { settings: 1, run: 3 }, { settings: 'Economy' }).preset,
        undefined);
}

/* ---------- the library lists the other two families, with their doors ---------- */
{
    const lib = X.presetLibrary([], undefined, [{ name: 'usual' }], SENTRY);
    eq('flex, then launch, then sentry', [...new Set(lib.map(e => e.kind))], ['flex', 'launch', 'sentry']);
    eq('the sentry presets are the wake family', lib.filter(e => e.kind === 'sentry').map(e => [e.name, e.family]),
        SENTRY.map(s => [s.label, 'wake']));
    ok('each names the door that applies it', lib.filter(e => e.kind === 'sentry').every(e => /^sentry\.start preset=/.test(e.appliedBy))
        && /launch\.profiles/.test(lib.find(e => e.kind === 'launch').appliedBy));
}

/* ---------- presets.* on the bridge ---------- */
(async () => {
    const store = {
        'agentFarm.taskRetry': { max: 3, supervisor: { engine: 'claude', model: 'sonnet' } },
        'agentFarm.launchProfiles': [{ name: 'usual' }, { nope: 1 }]
    };
    const writes = [];
    const reg = new BridgeRegistry();
    registerFlexOps(reg, {
        readSetting: k => store[k],
        writeSetting: async (k, v) => { writes.push(k); store[k] = v; }
    });
    const list = await reg.dispatch('presets.list', {});
    eq('presets.list: built-in, launch profiles and sentry presets', list.result.presets.map(e => e.kind + ':' + e.name).slice(0, 4),
        ['flex:Economy', 'flex:Balanced', 'flex:Quality', 'launch:usual']);

    const saved = await reg.dispatch('presets.save', { name: 'Cheap run', values: { 'retry.supervisor.maxCalls': 1 } });
    eq('presets.save stores it', [saved.ok, store['agentFarm.flexPresets'].map(p => p.name)], [true, ['Cheap run']]);
    const refused = await reg.dispatch('presets.save', { name: 'Quality', values: { 'retry.supervisor.maxCalls': 1 } });
    ok('…and refuses a built-in name', !refused.ok && /built-in/.test(refused.error));
    const badVal = await reg.dispatch('presets.save', { name: 'X', values: { 'retry.supervisor.maxCalls': 99 } });
    ok('…and a value its point cannot hold', !badVal.ok && /not a valid number/.test(badVal.error));

    writes.length = 0;
    const dry = await reg.dispatch('presets.apply', { name: 'economy', dryRun: true });
    eq('a dry run writes nothing', [dry.result.written, writes.length], [false, 0]);
    const ap = await reg.dispatch('presets.apply', { name: 'Economy' });
    eq('presets.apply at Farm Settings writes each key', writes.sort(),
        ['agentFarm.judgeArgs', 'agentFarm.judgeLadder', 'agentFarm.sentryLeaderBudgetUsd', 'agentFarm.taskRetry', 'agentFarm.workflowSpendCap']);
    eq('‼️ …merging into an object setting instead of replacing it', store['agentFarm.taskRetry'],
        { max: 3, supervisor: { engine: 'claude', model: 'sonnet', maxCalls: 1, budgetUsd: 0.5 } });
    ok('…and every point says it came from the preset', ap.result.points.every(p => /\(preset: Economy\)/.test(p.sentence)));

    writes.length = 0;
    const run = await reg.dispatch('presets.apply', { name: 'Cheap run', level: 'run' });
    eq('at run start nothing is written; the args for tasks.add come back', [writes.length, run.result.args],
        [0, { 'tasks.add': { retry: { supervisor: { maxCalls: 1 } } } }]);
    eq('…with the run beating Farm Settings, by name', run.result.points[0].sentence,
        '1 — set for this run (preset: Cheap run); Farm Settings said 1');
    const unknown = await reg.dispatch('presets.apply', { name: 'Hybrid' });
    ok('a sentry preset is not applied here — the answer names where', !unknown.ok && /own doors/.test(unknown.error));
    const badLevel = await reg.dispatch('presets.apply', { name: 'Economy', level: 'builtin' });
    ok('builtin is not a level to apply at', !badLevel.ok);

    const del = await reg.dispatch('presets.delete', { name: 'Cheap run' });
    eq('presets.delete removes it', [del.ok, store['agentFarm.flexPresets'].length], [true, 0]);
    const delBuiltin = await reg.dispatch('presets.delete', { name: 'Balanced' });
    ok('…and refuses a built-in one', !delBuiltin.ok && /built-in/.test(delBuiltin.error));

    console.log(`${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
