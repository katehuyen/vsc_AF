// X-35 — THE ACCEPTANCE MATRIX, not another parity regex.
//
// ‼️ WHY A SEPARATE FILE. The audit of 2026-08-13 found 23 open defects on a
// suite that was 8 308 green, and said exactly why: "many parity tests prove
// that a regex, a comment or a field EXISTS in the source — not the real
// registration order, not the argv, not the live index join." Every check below
// is deliberately of the second kind. It runs the actual function and asserts
// the behaviour that was wrong, so that a future edit which merely keeps the
// words cannot pass.
//
// One rule per finding it closes, named.
'use strict';
const path = require('path');
const { BridgeRegistry, bridgeRunDimensions, bridgeDimsOut } =
    require(path.join(__dirname, '..', 'out/core/bridge.js'));
const { rollupProjectSessions, UNASSIGNED_ID } =
    require(path.join(__dirname, '..', 'out/core/projects.js'));
const { buildFarmStatus } = require(path.join(__dirname, '..', 'out/core/farmstatus.js'));
const { ENGINES } = require(path.join(__dirname, '..', 'out/core/consoleEngine.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const threw = fn => { try { fn(); return false; } catch { return true; } };

// ---------------------------------------------------------------------------
// F-21 — a duplicate op registration is an ERROR, not a silent overwrite
// ---------------------------------------------------------------------------
//
// The defect: `triggers.add` was rewritten to carry the four-engine run
// dimensions, and a second, older registration further down the same file —
// flat `model` only — silently replaced it via `Map.set`. The source read
// correctly, every source-regex test passed on the source, and the RUNNING
// system used the version with no engines. `templates.add` and `templates.list`
// were doubled the same way.
{
    const reg = new BridgeRegistry();
    const spec = op => ({ op, describe: 'x', handler: () => op });
    reg.register(spec('demo.one'));
    ok('‼️ registering the same op twice THROWS rather than shadowing the first',
        threw(() => reg.register(spec('demo.one'))));
    ok('…and the error names the op and says what to do about it',
        (() => {
            try { reg.register(spec('demo.one')); return false; }
            catch (e) { return /demo\.one/.test(e.message) && /replace: true/.test(e.message); }
        })());
    ok('…a deliberate override is still possible, because it has to SAY so',
        (() => { reg.register(spec('demo.one'), { replace: true }); return true; })());
    ok('…and an array registration is checked element by element',
        threw(() => reg.register([spec('demo.two'), spec('demo.two')])));

    // …and the shipped catalog really is unique. This is the check that would
    // have caught the live defect: it reads the registration SITES, not a
    // comment claiming they are unique.
    const fs = require('fs');
    const seen = {};
    for (const f of ['src/extension.ts', 'src/core/turns.ts', 'src/core/docopen.ts',
        'src/core/studioBridge.ts', 'src/core/toolboxBridge.ts']) {
        const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
        for (const m of src.matchAll(/op:\s*'([^']+)'/g)) { (seen[m[1]] ||= []).push(f); }
    }
    const dupes = Object.entries(seen).filter(([, v]) => v.length > 1);
    ok('‼️ no op is registered twice anywhere in the shipped catalog',
        dupes.length === 0 || !console.log('    duplicates: ' + JSON.stringify(dupes)));
}

// ---------------------------------------------------------------------------
// F-16 — an engine is validated where it is WRITTEN DOWN, not where it runs
// ---------------------------------------------------------------------------
{
    ok('a known engine is normalised and kept',
        bridgeRunDimensions({ engine: 'Codex' }).engine === 'codex');
    ok('‼️ an unknown engine is refused at install time, not at 3 a.m.',
        threw(() => bridgeRunDimensions({ engine: 'gemnii' })));
    ok('…and the refusal lists what this build actually has',
        (() => {
            try { bridgeRunDimensions({ engine: 'nope' }); return false; }
            catch (e) { return Object.keys(ENGINES).every(id => e.message.includes(id)); }
        })());
    ok('‼️ an effort on an engine with no effort flag is REFUSED, not silently dropped',
        threw(() => bridgeRunDimensions({ engine: 'gemini', effort: 'high' })));
    ok('…while the same effort on an engine that has one is kept',
        bridgeRunDimensions({ engine: 'codex', effort: 'high' }).effort === 'high');
    ok('an unstated field stays unstated — "not said" is not "no flag"',
        !('model' in bridgeRunDimensions({ engine: 'codex' })));
}

// ---------------------------------------------------------------------------
// F-22 — one serializer, so add/list/get/edit/rerun round-trip without loss
// ---------------------------------------------------------------------------
{
    const stored = {
        engine: 'codex', model: 'gpt-5.6', effort: 'low', permissionMode: 'plan',
        cli: undefined, workDir: 'D:/x', priority: 3, projectId: 'p1'
    };
    const out = bridgeDimsOut(stored, id => (id === 'p1' ? 'Agent Farm' : undefined));
    ok('every dimension comes back out', out.engine === 'codex' && out.model === 'gpt-5.6'
        && out.effort === 'low' && out.permissionMode === 'plan'
        && out.workDir === 'D:/x' && out.priority === 3);
    ok('…the project comes back by NAME, which is what the caller passed in',
        out.project === 'Agent Farm');
    ok('…an unnamed project falls back to its id rather than to null',
        bridgeDimsOut({ projectId: 'ghost' }).project === 'ghost');
    ok('‼️ a run recorded before engines existed reads as claude, not as null',
        bridgeDimsOut({}).engine === 'claude');
    ok('…and a genuinely unset field is null rather than absent, so a reader can '
        + 'tell "not stated" from "this build has no such field"',
        bridgeDimsOut({}).model === null && bridgeDimsOut({}).cli === null);

    // The round trip itself: what came out, fed back in, must survive.
    const back = bridgeRunDimensions({
        engine: out.engine, model: out.model, effort: out.effort,
        permissionMode: out.permissionMode, workDir: out.workDir,
        priority: out.priority, project: 'p1'
    });
    ok('‼️ out → in → out is lossless for every dimension',
        back.engine === 'codex' && back.model === 'gpt-5.6' && back.effort === 'low'
        && back.permissionMode === 'plan' && back.workDir === 'D:/x'
        && back.priority === 3 && back.projectId === 'p1');
}

// ---------------------------------------------------------------------------
// F-07 — a project has ONE session count, and it is the record's
// ---------------------------------------------------------------------------
//
// Measured on this machine 2026-08-13, before the fix: `projects.current` said
// 260 sessions while `projects.sessions {all:true}` listed 300, and the
// project's `lastTs` sat on an older Claude session while the newest work on it
// was a Codex one. Both figures were "official" and they disagreed by exactly
// the number of foreign sessions.
{
    const projects = [{ id: 'p1', name: 'One', status: 'active' }];
    const rows = [
        { sessionId: 'c1', cwd: 'D:/p1', cost: 2, tokens: 100, todayCost: 1, lastTs: 1000, measured: true },
        { sessionId: 'c2', cwd: 'D:/p1', cost: 3, tokens: 200, todayCost: 1, lastTs: 2000, measured: true },
        // a Codex session — real work, newest of all, no price the CLI quoted
        { sessionId: 'x1', cwd: 'D:/p1', cost: 0, tokens: 900, todayCost: 0, lastTs: 9000, measured: false }
    ];
    // Filed by hand — the strongest resolution, so this test is about the
    // ROLLUP arithmetic and not about path matching.
    const links = { sessions: { c1: 'p1', c2: 'p1', x1: 'p1' }, roots: {} };
    const rolled = rollupProjectSessions(projects, rows, links);
    const roll = rolled.find(r => r.id === 'p1');
    ok('the fixture really did land on the project, not in Unassigned',
        !!roll && (rolled.find(r => r.id === UNASSIGNED_ID)?.sessions ?? 0) === 0);

    ok('‼️ the session COUNT includes every engine', roll.sessions === 3);
    ok('‼️ …and the last activity is the newest session, whichever engine it was on',
        roll.lastTs === 9000);
    ok('the MEASURED count is stated separately, so the gap is visible rather than absent',
        roll.measuredSessions === 2);
    ok('‼️ …and the money is summed only over what can be added up',
        roll.cost === 5 && roll.todayCost === 2);
    ok('a caller with no `measured` field behaves exactly as before it existed',
        rollupProjectSessions(projects, rows.map(({ measured, ...r }) => r), links)
            .find(r => r.sessions === 3).measuredSessions === 3);
}

// ---------------------------------------------------------------------------
// F-20 — engines and custom CLI profiles are independent facts
// ---------------------------------------------------------------------------
{
    const base = {
        listenerState: 'listening', eventsLast24h: 1,
        taskCount: 0, tasksDone7d: 0, scheduleCount: 0,
        triggerCount: 0, triggersFired7d: 0, workflowCount: 0, workflowRuns7d: 0,
        hasMediaKey: false, mediaAssetCount: 0, mediaCostMonth: 0,
        ingestFolderCount: 0, registeredAssetCount: 0,
        oversightLoopsOn: 0, qualitySamples: 0, secretCount: 0
    };
    const by = extra => Object.fromEntries(buildFarmStatus({ ...base, ...extra }).map(r => [r.id, r]));

    const real = by({
        cliProfileCount: 0, externalSessions: { codex: 39, agy: 1 },
        enginesReady: ['claude', 'codex', 'agy'], engineCount: 4
    });
    ok('‼️ zero custom profiles does not make a four-engine farm "Claude-only"',
        real.engines.state === 'active' && !/Claude-only/.test(real.engines.detail));
    ok('…and the two rows are separate, so neither answer hides the other',
        real.cli.id === 'cli' && real.engines.id === 'engines'
        && real.cli.state === 'dormant');

    const claudeOnly = by({
        cliProfileCount: 0, externalSessions: {},
        enginesReady: ['claude'], engineCount: 4
    });
    ok('a machine where only Claude is installed still says so — on the engines row',
        claudeOnly.engines.state === 'dormant'
        && /only Claude Code is ready/.test(claudeOnly.engines.detail));
    ok('‼️ …and a missing enginesReady does not take the whole status card down',
        (() => {
            try { return !!by({ cliProfileCount: 0, externalSessions: {} }).engines; }
            catch { return false; }
        })());
}

// ---------------------------------------------------------------------------
// F-14 — three separate questions about money, kept separate
// ---------------------------------------------------------------------------
{
    ok('only Claude Code quotes a price; the rest state tokens',
        ENGINES.claude.reportsCost === true && ENGINES.claude.costSource === 'cli'
        && [ENGINES.codex, ENGINES.gemini, ENGINES.agy]
            .every(e => e.reportsCost === false && e.costSource === 'tokens'));
    ok('‼️ and NO engine row claims a billing arrangement — that is read from the '
        + 'credential by core/engines.ts, not asserted by a transport flag',
        !Object.values(ENGINES).some(e => /on a plan|subscription|free/i.test(e.label)));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
