// ‼️ M-18 (X-32) — A DELEGATION IS A LAUNCH, SO IT RESOLVES ITS DIMENSIONS
// LIKE ONE.
//
// The hole: open agent `X` from the Agent Farm UI and it runs on the model and
// effort configured FOR that agent (`agentFarm.agentEngineDefaults`, then
// `agentFarm.launchDefaults` — the whole point of U-29/U-33). Hand the SAME
// agent the same work through a mission and none of it applied: the delegation
// read three fields off the team member and nothing else. The same agent
// behaved differently depending on who asked.
//
// What is pinned here:
//
//   * the LADDER, per field, in order — member → mission → this agent on this
//     engine → the fleet → the CLI;
//   * the engine is resolved FIRST, because the per-agent store is keyed by it
//     and nothing can look it up before it is known;
//   * Claude's model and effort SKIP the per-agent layer, the same carve-out
//     `withAgentEngineDefaults` makes for a launch — Claude Code reads that
//     agent's own settings file itself, and passing the value back would be a
//     second source of truth over a file the user may have edited by hand;
//   * an unresolved field is ABSENT, never `''` — an empty string is a claim
//     that somebody chose nothing, and it is what would reach a command line;
//   * `origin` says WHO decided each field, so "why did that delegate run on
//     gpt-5?" has an answer on the run rather than in a settings file nobody
//     remembers writing;
//   * a POOL member states the same five as a team member — the type has
//     carried them since M-14 and nothing could ever write them.
'use strict';
const path = require('path');
const Module = require('module');
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') {
        return { Uri: {}, window: {}, workspace: { getConfiguration: () => ({ get: (_k, d) => d }) } };
    }
    return origLoad.apply(this, arguments);
};
const M = require(path.join(__dirname, '..', 'out', 'core', 'missions.js'));
Module._load = origLoad;

let pass = 0, fail = 0;
const ok = (msg, cond) => { if (cond) { pass++; console.log('  ok   ' + msg); } else { fail++; console.log('  FAIL ' + msg); } };
const eq = (msg, got, want) => ok(msg + (got === want ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`), got === want);

const R = M.resolveDelegateRun;

// ============================================ 1. nothing set anywhere = before
{
    console.log('\n-- an empty member on an empty farm is exactly what it was');
    const r = R(undefined, undefined, {});
    eq('the engine floor is still claude', r.engine, 'claude');
    ok('no model is written', r.model === undefined);
    ok('no effort is written', r.effort === undefined);
    ok('no permission mode is written', r.permissionMode === undefined);
    ok('no workdir is written', r.workDir === undefined);
    eq('and every field says so', r.origin.model, 'cli');
    eq('nothing to say about a run nobody configured', M.describeDelegateRun(r), '');
}

// ============================================================ 2. the member wins
{
    console.log('\n-- what the member says beats every layer under it');
    const r = R(
        { model: 'opus', engine: 'codex', effort: 'low', permissionMode: 'plan' },
        { engine: 'gemini', workdir: 'D:/x' },
        {
            farm: () => ({ model: 'gpt-5', effort: 'high' }),
            launch: { engine: 'antigravity', model: 'fleet-model', effort: 'max', permissionMode: 'auto' }
        });
    eq('engine', r.engine, 'codex');
    eq('model', r.model, 'opus');
    eq('effort', r.effort, 'low');
    eq('permission mode', r.permissionMode, 'plan');
    eq('workdir is the mission\'s — a member has no folder of its own', r.workDir, 'D:/x');
    eq('and the origin names the member', r.origin.model, 'member');
    eq('the line reads without a source when the member said it',
        M.describeDelegateRun(r), 'engine codex · model opus · effort low · permissions plan');
}

// ========================================= 3. the mission is the engine layer
{
    console.log('\n-- a silent member falls to the MISSION for the engine, and only the engine');
    const r = R({}, { engine: 'Codex' }, { launch: { engine: 'gemini' } });
    eq('the mission engine beats the fleet\'s', r.engine, 'codex');
    eq('lower-cased on the way through, so a typed capital is not a new engine',
        r.origin.engine, 'mission');
    ok('and a mission states no model — that would overrule per-agent model policy',
        r.model === undefined);
}

// ================================= 4. the agent's own per-engine default layer
{
    console.log('\n-- then THIS agent, on the engine it actually landed on');
    let askedFor = '';
    const r = R({ engine: 'codex' }, {}, {
        farm: (engine) => { askedFor = engine; return { model: 'gpt-5-codex', effort: 'high' }; },
        launch: { model: 'fleet-model', effort: 'max' }
    });
    eq('the store is asked for the RESOLVED engine, not the fleet default', askedFor, 'codex');
    eq('its model wins over the fleet\'s', r.model, 'gpt-5-codex');
    eq('its effort wins over the fleet\'s', r.effort, 'high');
    eq('and the origin says which layer', r.origin.model, 'agent');
    eq('the line names a source the user did not type here',
        M.describeDelegateRun(r), 'engine codex · model gpt-5-codex (agent) · effort high (agent)');
}

// ================================================== 5. the fleet is the floor
{
    console.log('\n-- then the fleet, which is what launchDefaults has always been');
    const r = R({}, {}, {
        farm: () => ({}),
        launch: { engine: 'codex', model: 'gpt-5', effort: 'medium', permissionMode: 'acceptEdits' }
    });
    eq('engine', r.engine, 'codex');
    eq('model', r.model, 'gpt-5');
    eq('effort', r.effort, 'medium');
    eq('permission mode', r.permissionMode, 'acceptEdits');
    eq('origin', r.origin.permissionMode, 'fleet');
}

// ======================================= 6. ‼️ Claude skips the per-agent layer
{
    console.log('\n-- ‼️ CLAUDE\'S MODEL AND EFFORT SKIP THE PER-AGENT STORE');
    let asked = false;
    const r = R({}, {}, {
        farm: () => { asked = true; return { model: 'sonnet', effort: 'high' }; },
        launch: { model: 'fleet-model' }
    });
    eq('the engine is claude', r.engine, 'claude');
    ok('the store is not even consulted — Claude Code reads that agent\'s own file itself',
        asked === false);
    eq('so the fleet default is what applies', r.model, 'fleet-model');
    eq('and it is honestly labelled', r.origin.model, 'fleet');
    ok('a member that names claude explicitly is the same case',
        R({ engine: 'claude' }, {}, { farm: () => ({ model: 'x' }) }).model === undefined);
}

// ============================================ 7. absent is absent, never empty
{
    console.log('\n-- an unresolved field is ABSENT, because "" is a flag');
    const r = R({ model: '   ', effort: '', permissionMode: '  ' }, { workdir: '  ' }, {
        launch: { model: '  ', effort: '' }
    });
    ok('whitespace is not a model', !('model' in r));
    ok('whitespace is not an effort', !('effort' in r));
    ok('whitespace is not a permission mode', !('permissionMode' in r));
    ok('whitespace is not a workdir', !('workDir' in r));
    eq('and the engine still floors at claude', r.engine, 'claude');
}

// ============================ 8. permission mode has no per-agent layer to use
{
    console.log('\n-- permission mode goes member → fleet, because the store holds no third answer');
    let seen = null;
    const r = R({}, {}, {
        farm: () => { seen = { permissionMode: 'bypassPermissions' }; return seen; },
        launch: { engine: 'codex', permissionMode: 'plan' }
    });
    eq('the fleet\'s is what applies', r.permissionMode, 'plan');
    eq('and it is not attributed to the agent', r.origin.permissionMode, 'fleet');
}

// ================================================ 9. the pool takes the five too
{
    console.log('\n-- a POOL member carries the same five dimensions a team member does');
    const [m] = M.normalizePool([{
        agentId: 'a1', agentName: 'Ada', role: 'reviewer',
        model: 'haiku', engine: 'codex', effort: 'low', permissionMode: 'plan'
    }]);
    eq('effort survives normalisation', m.effort, 'low');
    const spec = {
        id: 'm1', title: 't', goal: 'g', leadAgentId: 'l', leadAgentName: 'L',
        mode: 'adaptive', team: [], pool: [m],
        limits: { maxRounds: 1, maxTasks: 1, maxCostUSD: 1, maxTokens: 1, maxMinutes: 1, maxParallel: 1 },
        approvalMode: 'auto', createdAt: 1
    };
    const cast = M.allowedAgents(spec);
    eq('and reaches the delegation through allowedAgents, which is the list an '
        + 'adaptive spec actually keeps its cast in', cast[0].effort, 'low');
    eq('with its permission mode', cast[0].permissionMode, 'plan');
    eq('a blank field is dropped rather than stored as ""',
        M.normalizePool([{ agentId: 'a', agentName: 'A', effort: '  ' }])[0].effort, undefined);
}

// ====================================== 10. the runtime role records the four
{
    console.log('\n-- a bound runtime role records the effort too');
    const roles = M.bindRuntimeRole([], {
        agentId: 'a1', agentName: 'Ada', model: 'haiku', engine: 'codex',
        effort: 'low', permissionMode: 'plan'
    }, 'reviewing', 100);
    eq('effort is on the binding', roles[0].effort, 'low');
    eq('and the binding time is the moment it was first bound', roles[0].boundAt, 100);
    const again = M.bindRuntimeRole(roles, { agentId: 'a1', agentName: 'Ada' }, 'still reviewing', 200);
    eq('rebinding does not open a second row', again.length, 1);
    eq('and does not move the binding time', again[0].boundAt, 100);
}

// =========================================== 11. it is REACHABLE, on every surface
{
    console.log('\n-- a dimension nobody can type is a dimension that does not exist');
    const fs = require('fs');
    const at = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
    const ext = at('src', 'extension.ts');
    const media = at('media', 'missions.js');

    ok('the form offers the effort from the host\'s ONE list, never a copy',
        /efforts: EFFORT_CHOICES/.test(ext) && /DATA\.efforts \|\| \[\]/.test(media));
    ok('…as a control on the member row',
        /id="ef-\$\{i\}"/.test(media) && /effortOpts\(form\.efforts\[a\.id\] \|\| ''\)/.test(media));
    ok('…MIRROR: the control is too narrow to say what it is, so the tooltip '
        + 'opens with what it holds now',
        /const effortTitle = \(sel\) => \{/.test(media)
        && /\(sel \|\| 'resolved'\)/.test(media));
    ok('…the form reads it back and sends it',
        /form\.efforts\[a\.id\] = document\.getElementById\('ef-' \+ i\)\.value;/.test(media)
        && /effort: form\.efforts\[a\.id\] \|\| ''/.test(media));
    ok('…and the run detail reads the chosen effort back',
        /m\.effort \? ` ~\$\{m\.effort\}` : ''/.test(media)
        && /delegation effort/.test(media));

    ok('creation refuses a typo instead of dropping it, the same way the '
        + 'permission mode is refused',
        /validateLaunch\(\{ permissionMode: memberPerm, effort: memberEffort \}\)/.test(ext));
    ok('…and empty stays empty — the resolver, not "", is what fills it',
        /effort: memberEffort \|\| undefined/.test(ext));

    ok('‼️ the delegation reads the cast from allowedAgents, so an ADAPTIVE '
        + 'run\'s pool dimensions are no longer silently dropped',
        /const cast = allowedAgents\(spec\);/.test(ext));
    ok('‼️ and the store is asked for the engine the delegate actually landed on',
        /farm: \(engine\) => storedDefault\(/.test(ext)
        && /'agentEngineDefaults'/.test(ext));
    ok('what it ran with is written on the step, so the run can answer "why '
        + 'that model?" without a settings file nobody remembers',
        /const dimNote = describeDelegateRun\(dims\);/.test(ext)
        && /s\.runNote/.test(media));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
