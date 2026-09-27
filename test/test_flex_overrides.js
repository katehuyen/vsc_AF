// U-151 — a flex value for ONE agent or ONE project (src/core/flexOverrides.ts,
// agentFarm.flexOverrides): stored safely, laid over Farm Settings in the chain's
// order (agent < project < the run), read by the runtime and by the bridge.
'use strict';
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`, JSON.stringify(got) === JSON.stringify(want));

const O = require(path.join(ROOT, 'out', 'core', 'flexOverrides.js'));
const A = require(path.join(ROOT, 'out', 'core', 'flexActions.js'));
const R = require(path.join(ROOT, 'out', 'core', 'retry.js'));
const { registerFlexOps } = require(path.join(ROOT, 'out', 'core', 'flexBridge.js'));
const { BridgeRegistry } = require(path.join(ROOT, 'out', 'core', 'bridge.js'));

const store = (init) => {
    const s = Object.assign({}, init);
    return { s, deps: { readSetting: k => s[k], writeSetting: async (k, v) => { if (v === undefined) { delete s[k]; } else { s[k] = v; } } } };
};

(async () => {
    console.log('\n== the store is made safe ==');
    {
        const raw = {
            agent: { developer: { 'retry.supervisor.engine': 'codex', 'no.such.point': 1 }, '': { 'retry.supervisor.model': 'x' }, basit: 'nope' },
            project: { prj_a: { 'retry.supervisor.maxCalls': 4, 'retry.supervisor.model': null } },
            team: { x: {} }
        };
        eq('unknown levels, blank targets, non-objects, non-points and nulls dropped', O.normalizeOverrides(raw),
            { agent: { developer: { 'retry.supervisor.engine': 'codex' } }, project: { prj_a: { 'retry.supervisor.maxCalls': 4 } } });
        eq('nothing at all is two empty levels', O.normalizeOverrides(undefined), { agent: {}, project: {} });
        const once = O.withOverride(undefined, 'agent', 'developer', 'retry.supervisor.engine', 'codex');
        eq('one value set', once.agent, { developer: { 'retry.supervisor.engine': 'codex' } });
        eq('back to inherited empties the target away', O.withOverride(once, 'agent', 'developer', 'retry.supervisor.engine', undefined).agent, {});
    }

    console.log('\n== the chain: Farm Settings < agent < project < the run ==');
    const over = {
        agent: { developer: { 'retry.supervisor.engine': 'codex', 'retry.supervisor.maxCalls': 3 } },
        project: { prj_a: { 'retry.supervisor.maxCalls': 5, 'retry.supervisor.lowConfidence': 'park' } }
    };
    {
        eq('agent only', O.supervisorOverrides(over, 'developer'), { engine: 'codex', maxCalls: 3 });
        eq('‼️ the project beats the agent, field by field', O.supervisorOverrides(over, 'developer', 'prj_a'),
            { engine: 'codex', maxCalls: 5, lowConfidence: 'park' });
        eq('an agent nobody set says nothing', O.supervisorOverrides(over, 'basit'), undefined);
        const read = k => ({ 'agentFarm.taskRetry': { max: 2, supervisor: { engine: 'claude', model: 'haiku', minConfidence: 0.8 } },
            'agentFarm.flexOverrides': over })[k];
        const d = O.retryDefaultFor(read, { agentName: 'developer', projectId: 'prj_a' });
        eq('the run\'s default keeps Farm Settings\' other fields', d.max, 2);
        eq('…and lays the agent and the project over its supervisor', d.supervisor,
            { engine: 'codex', model: 'haiku', minConfidence: 0.8, maxCalls: 5, lowConfidence: 'park' });
        const run = R.resolveRetry(R.normalizeRetry({ behavior: 'supervisor', supervisor: { maxCalls: 1 } }), d);
        eq('‼️ the run\'s own value beats them all; the rest is inherited', [run.behavior, run.supervisor.engine, run.supervisor.maxCalls, run.supervisor.model],
            ['supervisor', 'codex', 1, 'haiku']);
        eq('no agent, no project = Farm Settings alone', O.retryDefaultFor(read, {}).supervisor.engine, 'claude');
        const map = O.supervisorOverrideMap(over);
        eq('the page gets each agent\'s and project\'s supervisor fields', map,
            { agent: { developer: { engine: 'codex', maxCalls: 3 } }, project: { prj_a: { maxCalls: 5, lowConfidence: 'park' } } });
    }

    console.log('\n== setting it: flexActions and the bridge ==');
    {
        const { s, deps } = store();
        const r = await A.setFlexOverride(deps, 'retry.supervisor.engine', 'agent', 'developer', 'codex');
        eq('written into agentFarm.flexOverrides', s['agentFarm.flexOverrides'].agent, { developer: { 'retry.supervisor.engine': 'codex' } });
        ok('and resolved from the agent level', r.from === 'agent' && r.value === 'codex' && r.target === 'developer');
        const refused = async (fn, re) => { try { await fn(); return false; } catch (e) { return re.test(e.message); } };
        ok('no target is refused', await refused(() => A.setFlexOverride(deps, 'retry.supervisor.engine', 'agent', ' ', 'x'), /target/));
        const before = JSON.stringify(s);
        ok('‼️ a Farm-wide value that is not a VS Code setting is refused, naming its op, and nothing is written',
            await refused(() => A.setFlexSetting(deps, 'library.base', 'appX'), /airtable\.config\.set/) && JSON.stringify(s) === before);
        ok('a value the point refuses is refused', await refused(() => A.setFlexOverride(deps, 'retry.supervisor.maxCalls', 'project', 'prj_a', 99), /not a valid/));
        ok('a point not set per agent is refused, naming where it is set',
            await refused(() => A.setFlexOverride(deps, 'judge.args', 'agent', 'developer', 'x'), /is not set per agent/));

        const reg = new BridgeRegistry();
        registerFlexOps(reg, deps);
        const set = await reg.dispatch('flex.set', { point: 'retry.supervisor.maxCalls', level: 'project', target: 'prj_a', value: 4 });
        ok('flex.set level=project target=… writes it', set.ok && s['agentFarm.flexOverrides'].project.prj_a['retry.supervisor.maxCalls'] === 4);
        const get = await reg.dispatch('flex.get', { point: 'retry.supervisor.maxCalls', agent: 'developer', project: 'prj_a' });
        ok('flex.get agent=/project= reads the store: the project wins', get.ok && get.result.value === 4 && get.result.from === 'project');
        const clear = await reg.dispatch('flex.set', { point: 'retry.supervisor.maxCalls', level: 'project', target: 'prj_a', value: null });
        ok('null takes it back to inherited', clear.ok && !s['agentFarm.flexOverrides'].project.prj_a);
        const noTarget = await reg.dispatch('flex.set', { point: 'retry.supervisor.engine', level: 'agent', value: 'codex' });
        ok('the bridge refuses a level with no target', !noTarget.ok);
    }

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
