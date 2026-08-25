// X-124 — "what it actually ran with" is a fact about a TURN, not about a whole
// conversation. A resumed lane serves several delegations and a lead's lane can
// be older than the mission; reading the session aggregate meant every step
// listed models from rounds it had nothing to do with, and the mismatch check
// found the requested model in some unrelated turn and reported agreement —
// hiding the one case it exists for.
const path = require('path');
const fs = require('fs');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const { appliedInWindow, turnsInWindow } =
    require(path.join(__dirname, '..', 'out', 'core', 'appliedTurn.js'));

/** One turn: opened at `ts`, lasting `ms`, served by `models`. */
const T = (n, ts, ms, models, permissionMode) => ({
    n, label: 't' + n, ts, ms, tokens: 0, wTokens: 0, cost: 0, apiCalls: 0,
    steps: 0, thinking: 0, endCtx: 0, tools: 0, errors: 0,
    models: models || [], ...(permissionMode ? { permissionMode } : {})
});

// A lane that was resumed: an old conversation on haiku, then this mission's
// two rounds on opus, then a later one on sonnet.
const LANE = {
    models: ['claude-haiku-4-5', 'claude-opus-5', 'claude-sonnet-5'],
    permissionMode: 'bypassPermissions',
    turns: [
        T(1, 1000, 500, ['claude-haiku-4-5'], 'plan'),
        T(2, 5000, 500, ['claude-opus-5'], 'acceptEdits'),
        T(3, 6000, 500, ['claude-opus-5'], 'acceptEdits'),
        T(4, 9000, 500, ['claude-sonnet-5'], 'bypassPermissions')
    ]
};

console.log('-- binding turns to a window');
{
    ok('the turns inside the window are the ones bound',
        turnsInWindow(LANE.turns, { from: 4900, to: 6600 }).map(t => t.n).join() === '2,3');
    ok('‼️ a turn that STRADDLES an edge counts — the work is not outside its own turn',
        turnsInWindow(LANE.turns, { from: 5200, to: 5300 }).map(t => t.n).join() === '2');
    ok('an open window (still running) takes everything from its start',
        turnsInWindow(LANE.turns, { from: 5500 }).map(t => t.n).join() === '2,3,4');
    ok('‼️ an open LAST turn owns the time after it — otherwise live work binds nothing',
        turnsInWindow([T(1, 1000, 0, ['m'])], { from: 90000, to: 91000 }).map(t => t.n).join() === '1');
    ok('a window before the lane existed binds nothing',
        turnsInWindow(LANE.turns, { from: 10, to: 100 }).length === 0);
    ok('a window with no honest start binds nothing rather than everything',
        turnsInWindow(LANE.turns, { from: 0, to: 99999 }).length === 0);
}

console.log('\n-- the three scopes, kept apart');
{
    ok('no session at all is still null — an absence the callers already handle',
        appliedInWindow(undefined, { from: 1, to: 2 }) === null);

    const lane = appliedInWindow(LANE);
    ok('no window = the LANE\'s reading, and it says so',
        lane.scope === 'session' && lane.models.length === 3 && lane.turns === undefined);

    const bound = appliedInWindow(LANE, { from: 4900, to: 6600 });
    ok('‼️ a window bound to turns reports ONLY those turns\' models',
        bound.scope === 'turn' && bound.models.join() === 'claude-opus-5' && bound.turns === 2);
    ok('…and the permission mode those turns ran under, not the lane\'s last one',
        bound.permissionMode === 'acceptEdits' && LANE.permissionMode === 'bypassPermissions');

    const none = appliedInWindow(LANE, { from: 100000, to: 100001 });
    ok('‼️ a window that binds no turn is UNATTRIBUTED, never the lane\'s totals',
        none.scope === 'unattributed' && none.models.length === 0 && none.permissionMode === null);

    const noTurns = appliedInWindow({ models: ['m'], permissionMode: 'plan' }, { from: 1, to: 2 });
    ok('‼️ a session with no turns cannot be bound either — the aggregate does not wear a window',
        noTurns.scope === 'unattributed');
}

console.log('\n-- the cases X-124 was written from');
{
    // "requested A but the mission turn ran B": the lane HAS A, in a turn that
    // belongs to somebody else. The aggregate reading found it and called it
    // agreement; the bound reading does not have it to find.
    const missionTurn = appliedInWindow(LANE, { from: 8900, to: 9600 });
    ok('‼️ requested A, this turn ran B — A is in the lane but NOT in this window',
        missionTurn.models.join() === 'claude-sonnet-5'
        && !missionTurn.models.includes('claude-haiku-4-5'));
    ok('…while the lane\'s own reading still contains it, which is exactly the trap',
        appliedInWindow(LANE).models.includes('claude-haiku-4-5'));

    // A model switch INSIDE one piece of work is not a lie — both really served
    // it — so both are reported.
    const switched = appliedInWindow({
        models: ['a', 'b'],
        turns: [T(1, 1000, 500, ['a'], 'plan'), T(2, 1600, 500, ['b'], 'plan')]
    }, { from: 900, to: 2200 });
    ok('a model switch inside one window reports both, in the order they served',
        switched.models.join() === 'a,b' && switched.turns === 2);

    // ‼️ A MODE THAT CHANGED HAS NO SINGLE VALUE. Picking one of the two would
    // be a coin toss on the fact somebody is reading the row to check.
    const modes = appliedInWindow({
        turns: [T(1, 1000, 500, ['a'], 'plan'), T(2, 1600, 500, ['a'], 'bypassPermissions')]
    }, { from: 900, to: 2200 });
    ok('‼️ a permission mode that changed mid-window has no single value…',
        modes.permissionMode === null);
    ok('…and both are kept, in order, so the change is readable instead of lost',
        modes.permissionModes.join() === 'plan,bypassPermissions');

    ok('a lane that never stated a mode says nothing rather than defaulting',
        appliedInWindow({ turns: [T(1, 1000, 500, ['a'])] }, { from: 900, to: 1600 })
            .permissionMode === null);
    ok('effort is null on every scope — no engine reports it anywhere today',
        appliedInWindow(LANE).effort === null
        && appliedInWindow(LANE, { from: 4900, to: 6600 }).effort === null
        && appliedInWindow(LANE, { from: 1e9 }).effort === null);
}

console.log('\n-- the turn carries the mode it ran under');
{
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'sessions.ts'), 'utf8');
    ok('‼️ a turn opens carrying whatever mode the transcript had last stated',
        /\.\.\.\(info\.permissionMode \? \{ permissionMode: info\.permissionMode \} : \{\}\)/.test(src));
    ok('…and a mode changed MID-turn governs the rest of that turn',
        /if \(open\) \{ open\.permissionMode = line\.permissionMode; \}/.test(src));

    const host = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    ok('‼️ the host binds a delegation to its own task\'s stretch',
        /appliedDimensions\(byIdSess \?\? sess, stepWindow\(t\)\)/.test(host));
    ok('‼️ …and the orchestrator to the RUN\'s, so an older lead lane cannot testify',
        (host.match(/plannerWindow\(r(un)?\)/g) || []).length === 2);
    ok('the aggregate reading is no longer built by hand anywhere',
        !/models: sess\.models \?\? \[\]/.test(host));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
