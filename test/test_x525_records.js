'use strict';
// X-525 (1) — every saved record that names a route, collected from the stores' own
// rows, and the one way they are moved, cleared or (launch profiles) deleted.
const { collectRouteRecords, applyRouteChange } = require('../out/core/routeRecords.js');
const { routeDependents } = require('../out/core/savedRoutes.js');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const snap = () => ({
    agentNames: { 'd:/a/dev': 'developer', 'dev-id': 'developer', 'd:/a/ops': 'ops', 'ops-id': 'ops' },
    agentDefaults: {
        'd:/a/dev': { claude: { providerId: 'or-qwen38', tier: 'opus', model: 'opus' }, opencode: { providerId: 'af-or-qwen38' } },
        'd:/a/gone': { claude: { providerId: 'or-qwen38' } },
        'd:/a/ops': { claude: { model: 'sonnet' } }
    },
    launchProfiles: [
        { name: 'Genel Qwen3.8', engine: 'claude', providerId: 'or-qwen38', tier: 'sonnet' },
        { name: 'OC Qwen', engine: 'opencode', model: 'af-or-qwen38/qwen/qwen3.8:free' },
        { name: 'Kimi native', engine: 'opencode', providerId: 'kimi' },
        { name: 'Other', providerId: 'or-nemotron' },
        { engine: 'claude', providerId: 'or-qwen38' }
    ],
    lastLaunch: {
        'dev-id': { engine: 'claude', providerId: 'or-qwen38', tier: 'opus',
            byEngine: { claude: { providerId: 'or-qwen38', tier: 'opus' }, opencode: { model: 'af-or-nemotron/m' } } },
        'ops-id': { engine: 'claude', providerId: 'or-nemotron', byEngine: { claude: { providerId: 'or-qwen38' } } },
        'gone-id': { engine: 'claude', providerId: 'or-qwen38' }
    },
    tasks: [
        { title: 'waiting', status: 'queued', providerId: 'or-qwen38' },
        { title: 'ran', status: 'done', providerId: 'or-qwen38' },
        { title: 'running', status: 'running', providerId: 'or-qwen38' }
    ],
    schedules: [{ title: 'Gece', engine: 'opencode', providerId: 'af-or-qwen38', model: 'af-or-qwen38/x' }],
    templates: [{ title: 'Tpl', providerId: 'or-qwen38', tier: 'haiku' }],
    workflows: [{ title: 'WF', steps: [{ title: 's1' }, { title: 's2', providerId: 'or-qwen38' }] }],
    triggers: [
        { title: 'Watch', action: { kind: 'task', providerId: 'or-qwen38' } },
        { title: 'Chain', action: { kind: 'workflow', workflowId: 'w' } },
        { title: 'Disp', action: { kind: 'dispatch', engine: 'opencode', providerId: 'af-or-qwen38' } }
    ],
    missions: [{
        title: 'M', engine: 'claude', providerId: 'or-qwen38',
        team: [{ agentName: 'rev', providerId: 'or-qwen38' }, { agentName: 'oc', engine: 'opencode', providerId: 'af-or-qwen38' }],
        pool: [{ agentName: 'pool1', providerId: 'or-nemotron' }]
    }],
    batons: [
        { chainId: 'c1', hop: 1, state: 'parked', from: { engine: 'claude' }, inherit: { providerId: 'or-qwen38', tier: 'opus' } },
        { chainId: 'c1', hop: 0, state: 'started', from: { engine: 'claude' }, inherit: { providerId: 'or-qwen38' } },
        { chainId: 'c2', hop: 2, state: 'waiting-end', from: { engine: 'opencode' }, inherit: { providerId: 'af-or-qwen38' } }
    ]
});

/* ---------- collect */
const all = collectRouteRecords(snap());
const deps = routeDependents('or-qwen38', all);
const names = deps.map(d => `${d.kind}:${d.label}:${d.engine}`);
const want = [
    'agent default:developer:claude', 'agent default:developer:opencode',
    'launch profile:Genel Qwen3.8:claude', 'launch profile:OC Qwen:opencode',
    'last used setup:developer:claude', 'last used setup:ops:claude',
    'queued task:waiting:claude', 'schedule:Gece:opencode', 'task template:Tpl:claude',
    'workflow step:WF · step 2:claude', 'trigger:Watch:claude', 'trigger:Disp:opencode',
    'mission:M:claude', 'mission:M · rev:claude', 'mission:M · oc:opencode',
    'waiting baton leg:chain c1 · leg 2:claude', 'waiting baton leg:chain c2 · leg 3:opencode'
];
ok('every kind naming the route is found, in both spellings, and nothing else: ' + names.join(' | '),
    names.join('|') === want.join('|'));
ok('history is not a dependent: a finished or running task, a started leg', !names.some(n => /ran|running|leg 1/.test(n)));
ok('an agent no longer in the fleet names nothing that runs', !all.some(r => /gone/.test(r.label)));
ok('a nameless launch profile is not a record anybody can pick', all.filter(r => r.kind === 'launch profile').length === 4);
ok('a trigger that starts a workflow carries no route of its own', !all.some(r => r.label === 'Chain'));
ok('the engine\'s own provider is collected for health but depends on no route of ours',
    all.some(r => r.label === 'Kimi native' && r.providerId === 'kimi') && routeDependents('kimi', all).length === 0);
ok('a model-only OpenCode record reports its route under the wire id', all.find(r => r.label === 'OC Qwen').providerId === 'af-or-qwen38');
const devLast = deps.find(d => d.kind === 'last used setup' && d.label === 'developer');
ok('the last used setup is ONE record per agent and engine, holding the flat row and the engine row', devLast.rows.length === 2);
ok('a flat row and an engine row naming different routes are two records', routeDependents('or-nemotron', all)
    .some(d => d.kind === 'last used setup' && d.label === 'ops') && deps.some(d => d.kind === 'last used setup' && d.label === 'ops'));
ok('the OpenCode last used setup under another route is that route\'s', routeDependents('or-nemotron', all)
    .some(d => d.kind === 'last used setup' && d.label === 'developer' && d.engine === 'opencode'));

/* ---------- repoint */
{
    const s = snap();
    const r = applyRouteChange(s, 'or-qwen38', { kind: 'repoint', to: 'or-qwen-b' });
    ok('repoint touches the stores of the records it moved', r.stores.slice().sort().join(',') === 'agentDefaults,batons,lastLaunch,launchProfiles,missions,tasks');
    ok('a Claude record moves to the bare id and keeps its tier', s.agentDefaults['d:/a/dev'].claude.providerId === 'or-qwen-b'
        && s.agentDefaults['d:/a/dev'].claude.tier === 'opus' && s.agentDefaults['d:/a/dev'].claude.model === 'opus');
    ok('an OpenCode record moves to the wire id', s.agentDefaults['d:/a/dev'].opencode.providerId === 'af-or-qwen-b');
    ok('an OpenCode model under the route moves with it', s.launchProfiles[1].model === 'af-or-qwen-b/qwen/qwen3.8:free'
        && s.schedules[0].model === 'af-or-qwen-b/x' && s.schedules[0].providerId === 'af-or-qwen-b');
    ok('both rows of a last used setup move', s.lastLaunch['dev-id'].providerId === 'or-qwen-b' && s.lastLaunch['dev-id'].byEngine.claude.providerId === 'or-qwen-b');
    ok('a row naming another route is left as it was', s.lastLaunch['ops-id'].providerId === 'or-nemotron'
        && s.lastLaunch['ops-id'].byEngine.claude.providerId === 'or-qwen-b' && s.lastLaunch['dev-id'].byEngine.opencode.model === 'af-or-nemotron/m');
    ok('history keeps the route it ran on', s.tasks[1].providerId === 'or-qwen38' && s.tasks[2].providerId === 'or-qwen38'
        && s.batons[1].inherit.providerId === 'or-qwen38');
    ok('mission, members, steps, triggers and waiting legs move', s.missions[0].providerId === 'or-qwen-b'
        && s.missions[0].team[0].providerId === 'or-qwen-b' && s.missions[0].team[1].providerId === 'af-or-qwen-b'
        && s.missions[0].pool[0].providerId === 'or-nemotron' && s.workflows[0].steps[1].providerId === 'or-qwen-b'
        && s.triggers[2].action.providerId === 'af-or-qwen-b' && s.batons[0].inherit.providerId === 'or-qwen-b'
        && s.batons[2].inherit.providerId === 'af-or-qwen-b');
    ok('nothing names the old route afterwards', routeDependents('or-qwen38', collectRouteRecords(s)).length === 0);
}

/* ---------- clear */
{
    const s = snap();
    applyRouteChange(s, 'or-qwen38', { kind: 'clear' });
    const d = s.agentDefaults['d:/a/dev'].claude;
    ok('clear drops a Claude route and the tier that travels with it, never the model', !('providerId' in d) && !('tier' in d) && d.model === 'opus');
    ok('clear drops an OpenCode route and a model under it', !('providerId' in s.agentDefaults['d:/a/dev'].opencode)
        && !('model' in s.launchProfiles[1]) && !('model' in s.schedules[0]));
    ok('clear keeps every launch profile', s.launchProfiles.length === 5 && !('providerId' in s.launchProfiles[0]) && !('tier' in s.launchProfiles[0]));
    ok('…and leaves other routes alone', s.launchProfiles[3].providerId === 'or-nemotron' && s.launchProfiles[2].providerId === 'kimi');
}

/* ---------- delete */
{
    const s = snap();
    const r = applyRouteChange(s, 'or-qwen38', { kind: 'delete' });
    ok('delete removes the launch profiles naming it, and only those', s.launchProfiles.map(p => p.name || '-').join(',') === 'Kimi native,Other,-');
    ok('…and clears every other record', !('providerId' in s.missions[0]) && !('providerId' in s.tasks[0]) && !('tier' in s.templates[0]));
    ok('the answer still names the deleted profiles among the changed records', r.changed.filter(c => c.kind === 'launch profile').length === 2);
}

/* ---------- a route with no dependents */
{
    const s = snap();
    const before = JSON.stringify(s);
    const r = applyRouteChange(s, 'nobody', { kind: 'clear' });
    ok('a route nothing names changes nothing and touches no store', r.changed.length === 0 && r.stores.length === 0 && JSON.stringify(s) === before);
}

console.log(`test_x525_records: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
