// X-107 — WHICH ENDPOINT A MISSION'S WORK IS REALLY SERVED BY.
//
// ‼️ WHAT THIS SUITE IS WATCHING. A mission is written once and then runs for
// hours with nobody at a window: the planner is called round after round, and
// each round fires delegations that are ordinary headless tasks. Every other
// run dimension a member states — engine (X-18), permission mode (M-14), effort
// (M-18), sign-in (X-225) — travels down that path. The ROUTE did not, so
// "these delegations go through the Kimi endpoint, the orchestrator stays on
// Anthropic's" could not be said anywhere at all, and every participant took
// whichever standing route its agent happened to have at 3 a.m.
//
// Five ways that goes wrong, and each is held here:
//
//   1. THE TIER RIDES SOMEBODY ELSE'S ROUTE. `opus` is `kimi-k2-thinking` on
//      one endpoint and `MiniMax-M2` on another (X-101). A member's tier
//      applied to the MISSION's route resolves a word through an endpoint it
//      was never chosen against — so a tier is taken from whichever rung named
//      the route, and a tier with no route is dropped.
//   2. THE PLANNER IS FORGOTTEN. It is not a delegation: one long-lived
//      headless claude carrying the run from round to round, and the most
//      expensive thing a mission does. Measured before X-225: it spawned with
//      NO environment at all.
//   3. A DIMENSION IS DROPPED BY A HAND-WRITTEN LIST. Three mappings between
//      the bridge and the wave copy a member field by field, and every one of
//      them had already fallen behind by one — `account` was silently thrown
//      away by two of them.
//   4. THE ROW IS MADE BEFORE ITS DIMENSIONS ARE KNOWN. `addTask` says the
//      dimensions are part of MAKING a task; since X-106 a route written one
//      line later is also a route the enqueue seal never saw.
//   5. THE REFUSAL COMES AT THE THIRD ROUND. A route this machine cannot point
//      at must be refused before the mission exists, not once per planning call
//      for the rest of the run.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`,
    JSON.stringify(got) === JSON.stringify(want));

const M = require(path.join(ROOT, 'out', 'core', 'missionMode.js'));

console.log('\n== X-107 — the route resolves on the member, then the mission, and nowhere else ==');
{
    const run = (member, spec) => M.resolveDelegateRun(member, spec, {});

    eq('nothing stated names no route at all',
        [run({}, {}).providerId, run({}, {}).tier, run({}, {}).origin.providerId],
        [undefined, undefined, 'cli']);
    eq('the mission answers when the member states none',
        (r => [r.providerId, r.tier, r.origin.providerId])(
            run({}, { providerId: 'kimi-work', tier: 'opus' })),
        ['kimi-work', 'opus', 'mission']);
    eq('‼️ the member outranks the mission, and brings ITS OWN tier',
        (r => [r.providerId, r.tier, r.origin.providerId])(
            run({ providerId: 'minimax', tier: 'sonnet' }, { providerId: 'kimi-work', tier: 'opus' })),
        ['minimax', 'sonnet', 'member']);
    eq('‼️ A MEMBER THAT OVERRIDES THE ROUTE AND NOT THE TIER TAKES NO TIER — the mission\'s belonged to the mission\'s endpoint',
        (r => [r.providerId, r.tier])(
            run({ providerId: 'minimax' }, { providerId: 'kimi-work', tier: 'opus' })),
        ['minimax', undefined]);
    eq('‼️ …and a member tier with no member route does NOT ride the mission\'s route',
        (r => [r.providerId, r.tier])(run({ tier: 'opus' }, { providerId: 'kimi-work' })),
        ['kimi-work', undefined]);
    eq('a tier nobody gave a route to is not carried',
        (r => [r.providerId, r.tier])(run({ tier: 'opus' }, {})),
        [undefined, undefined]);
    // ‼️ THE RUNG UNDER THE MISSION IS THE SPAWN'S OWN, not a third one here:
    // `resolveLaunchRoute` already falls through to the agent's standing record,
    // and answering the same question twice is how the two answers disagree.
    eq('there is no agent or fleet rung for a route — the spawn owns that fall-through',
        run({}, {}, { farm: () => ({ providerId: 'from-agent' }), launch: { providerId: 'from-fleet' } })
            .providerId,
        undefined);

    // …and the line a person reads
    ok('‼️ the run note names the endpoint, with its tier',
        /route kimi-work\/opus/.test(M.describeDelegateRun(run({}, { providerId: 'kimi-work', tier: 'opus' }))));
    ok('…a route with no tier says just the route',
        /route minimax(?!\/)/.test(M.describeDelegateRun(run({ providerId: 'minimax' }, {}))));
    ok('…and a run that named none says nothing about routes',
        !/route/.test(M.describeDelegateRun(run({ model: 'haiku' }, {}))));
}

console.log('\n== X-107 — a pool member states the same dimensions, and keeps no orphan tier ==');
{
    const one = raw => M.normalizePool([Object.assign({ agentId: 'a1', agentName: 'dev' }, raw)])[0];
    eq('the route and its tier survive normalization',
        (m => [m.providerId, m.tier])(one({ providerId: 'kimi-work', tier: 'opus' })),
        ['kimi-work', 'opus']);
    eq('‼️ a tier with no route is dropped — a word with no referent is not stored',
        (m => [m.providerId, m.tier])(one({ tier: 'opus' })),
        [undefined, undefined]);
    eq('…and the sign-in beside it still travels', one({ account: 'work' }).account, 'work');
}

console.log('\n== X-107 — nothing is dropped between the bridge, the door and the wave ==');
{
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    const missionsTs = fs.readFileSync(path.join(ROOT, 'src', 'core', 'missions.ts'), 'utf8');
    const modeTs = fs.readFileSync(path.join(ROOT, 'src', 'core', 'missionMode.ts'), 'utf8');

    // ‼️ THE LIST IS READ OUT OF THE TYPE, never typed out here. Three mappings
    // copy a member field by field and two of them had already lost `account`.
    const at = missionsTs.indexOf('export interface MissionTeamMember');
    const dims = [...missionsTs.slice(at, missionsTs.indexOf('\n}', at))
        .matchAll(/^ {4}([a-zA-Z][\w]*)\??:/gm)].map(m => m[1])
        .filter(f => f !== 'agentId' && f !== 'agentName');
    ok('MissionTeamMember was found and states more than the two names', at > 0 && dims.length >= 6);

    const cast = (() => {
        const a = ext.indexOf('const CAST_DIMENSIONS = [');
        return a < 0 ? '' : ext.slice(a, ext.indexOf('] as const;', a));
    })();
    ok('‼️ the bridge\'s cast list carries EVERY dimension a member may state (missing: '
        + dims.filter(f => !new RegExp(`'${f}'`).test(cast)).join(', ') + ')',
        cast.length > 20 && dims.every(f => new RegExp(`'${f}'`).test(cast)));
    ok('…and both the team and the pool go through it, rather than through two copies',
        (ext.match(/\.map\(\w+ => castDims\(/g) || []).length === 2
        && !/agentId: findAgent\(String\(t\.agent \?\? ''\)\)\.id, role: t\.role/.test(ext));

    // the wave: the dimensions are what the row is MADE with
    const wave = (() => {
        const a = ext.indexOf('const dims = resolveDelegateRun(member, spec, {');
        return a < 0 ? '' : ext.slice(a, ext.indexOf('step.taskId = task.id;', a));
    })();
    ok('the delegation spawn was found', wave.length > 300);
    ok('‼️ the delegation is MADE with its dimensions, by the shape — not patched afterwards',
        /taskManager\.addTask\([\s\S]{0,200}\.\.\.runExtras\(\{[\s\S]{0,160}engine: dims\.engine === 'claude' \? undefined : dims\.engine/.test(wave));
    ok('…and no dimension is written onto the returned row, where the enqueue seal could not see it',
        !/task\.model = dims\./.test(wave) && !/task\.account = dims\./.test(wave)
        && !/task\.providerId = /.test(wave) && !/task\.effort = dims\./.test(wave));
    ok('…the project stays explicit, because it is not a dimension',
        /projectId: spec\.projectId/.test(wave));

    // the planner: its own route, injected where the runtime belongs
    ok('‼️ the planner spawn takes the ROUTE RUNTIME, which was `undefined` in that slot',
        /engineRuntimeFor\(spec\.leadAgentId, 'claude', routeOf\(\{\s*\n\s*providerId: spec\.plannerProviderId, tier: spec\.plannerTier\s*\n\s*\}\)\)/.test(ext));
    ok('…and its sign-in layer is still beside it, not replaced by it',
        /launchAccountEnv\(\{ engine: 'claude', account: spec\.plannerAccount \}\)/.test(ext));
    ok('the planner route is a field of its own on the spec, not the delegates\'',
        /plannerProviderId\?: string;/.test(missionsTs) && /plannerTier\?: string;/.test(missionsTs));

    // ‼️ ONE REFUSAL, THREE DOORS. A second copy of "is this a route this engine
    // can be pointed at" is a second answer the day an adapter changes its mind.
    // ‼️ Measured by the SENTENCE, not by the helper it calls: `pruneProviderPick`
    // also narrows a picker's draft, which is a different job with no refusal in
    // it. Two copies of this sentence would be two answers the day an adapter
    // changes its mind about what it can be pointed at.
    ok('‼️ the route refusal is written once',
        /const launchRouteRefusal = \(/.test(ext)
        && (ext.match(/is not a route \$\{engineOf\(engine\)\.id\} can be pointed at/g) || []).length === 1);
    ok('…and the automation door, the planner, the mission and every member all ask it',
        /route: launchRouteRefusal,/.test(ext)
        && /launchRouteRefusal\('claude', plannerProviderId, plannerTier\)/.test(ext)
        && /launchRouteRefusal\(\s*\n?\s*missionEngine \|\| 'claude', missionProviderId, missionTier\)/.test(ext)
        && /launchRouteRefusal\(\s*\n?\s*m\.engine \|\| missionEngine \|\| 'claude', m\.providerId \?\? '', m\.tier \?\? ''\)/.test(ext));

    // the preview: it takes the member, so it cannot report a dimension it never saw
    ok('‼️ the preview row takes the MEMBER, not a copy of the fields somebody remembered',
        /const memberView = \(member: MissionTeamMember\): MissionPreviewMember =>/.test(ext)
        && /cast\.map\(m => memberView\(m\)\)/.test(ext));
    ok('…and it reports the sign-in and the route it resolved, on both halves',
        /\.\.\.\(member\.account \? \{ account: member\.account \} : \{\}\)/.test(ext)
        && /\.\.\.\(dims\.account \? \{ account: dims\.account \} : \{\}\)/.test(ext)
        && /\.\.\.\(dims\.providerId\s*\n\s*\? \{ providerId: dims\.providerId, \.\.\.\(dims\.tier \? \{ tier: dims\.tier \} : \{\}\) \}/.test(ext));
    ok('…and the origin record is the RESOLVER\'s own, so a new rung cannot be reported under a shorter list',
        /origin: DelegateRun\['origin'\];/.test(missionsTs));
    ok('…the planner card answers for its own two rather than leaving them blank',
        /account: spec\.plannerAccount \? 'mission' : 'cli',/.test(ext)
        && /providerId: spec\.plannerProviderId \? 'mission' : 'cli'/.test(ext));

    // readable back, or a caller cannot tell a default from a value that never arrived
    ok('‼️ the list op hands the route and the sign-in back, each falling back to the mission\'s',
        /account: m\.account \?\? sp\?\.account \?\? null,/.test(ext)
        && /providerId: m\.providerId \?\? sp\?\.providerId \?\? null,/.test(ext)
        && /tier: m\.providerId \? \(m\.tier \?\? null\) : \(sp\?\.tier \?\? null\)/.test(ext));
    ok('…and the orchestrator\'s own beside them', /plannerProviderId: sp\?\.plannerProviderId \?\? null,/.test(ext));
    ok('the ops describe both, so a caller reading `farm.ops` knows they exist',
        /providerId\?\/tier\? \(X-107/.test(ext) && /plannerProviderId\?\/plannerTier\? \(X-107/.test(ext));

    // the resolver's own shape
    ok('‼️ `DelegateRun` states the route and its origin, so the trace keeps the unsummarised answer',
        /providerId\?: string;/.test(modeTs) && /'account' \| 'providerId',/.test(modeTs));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
