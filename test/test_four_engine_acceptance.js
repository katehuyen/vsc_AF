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
    // ‼️ B-12 — TWO ENGINES QUOTE A PRICE NOW, and this assertion was the place
    // that said otherwise in code. OpenCode publishes `usage_update.cost.amount`
    // on the wire and `cost` in its headless JSONL, so `costSource: 'cli'` is
    // the measured answer for it too — and a zero on a free model is a real zero
    // rather than "unknown". The engines are named from the registry, so the day
    // a sixth arrives this fails instead of quietly excluding it.
    ok('the engines that quote a price say `cli`; the rest state tokens',
        [ENGINES.claude, ENGINES.opencode]
            .every(e => e.reportsCost === true && e.costSource === 'cli')
        && [ENGINES.codex, ENGINES.gemini, ENGINES.agy]
            .every(e => e.reportsCost === false && e.costSource === 'tokens'));
    ok('…and every engine in the registry answers the question one way or the other',
        Object.values(ENGINES).every(e => typeof e.reportsCost === 'boolean'
            && (e.reportsCost ? e.costSource === 'cli' : e.costSource !== 'cli')));
    ok('‼️ and NO engine row claims a billing arrangement — that is read from the '
        + 'credential by core/engines.ts, not asserted by a transport flag',
        !Object.values(ENGINES).some(e => /on a plan|subscription|free/i.test(e.label)));
}

// ---------------------------------------------------------------------------
// B-12 — the BRIDGE contract for the fifth engine, run rather than read
// ---------------------------------------------------------------------------
//
// ‼️ WHY THIS BLOCK EXISTS. `farm.ops` IS the contract an agent reads before it
// calls anything, so a catalogue that names four engines is not a cosmetic
// staleness: a caller with a real OpenCode job reads it, concludes the engine is
// unsupported, and never tries — while `bridgeRunDimensions` would have accepted
// it and run it. The validator and the sentence describing the validator had
// drifted apart, and only one of the two was tested.
{
    const {
        ENGINE_ENUM, ENGINE_ENUM_SPACED, enginesWithoutEffort, engineChangeNote,
        engineModeNote, engineTakesEffort
    } = require(path.join(__dirname, '..', 'out/core/consoleEngine.js'));
    const fsx = require('fs');

    // ---- the enum every contract prints is the registry, not a list ----
    ok('‼️ the printed engine enum is every engine this build has',
        ENGINE_ENUM === Object.keys(ENGINES).join('|')
        && ENGINE_ENUM_SPACED === Object.keys(ENGINES).join(' | ')
        && ENGINE_ENUM.includes('opencode'));
    // …and no contract in the source still spells a SUBSET of them by hand. This
    // is the failure the whole block is about: fourteen describes carried
    // `claude|codex|gemini|agy` long after a fifth engine had shipped end to end.
    {
        const files = ['src/extension.ts', 'src/core/turns.ts', 'src/core/settingsBridge.ts'];
        const ids = Object.keys(ENGINES);
        const stale = [];
        for (const f of files) {
            // ‼️ CONTRACTS ONLY. A comment explaining the fault this test pins
            // has to be free to QUOTE the wrong sentence — that is what makes it
            // readable three months later — and a scan that cannot tell a
            // contract from an explanation would force the explanation out.
            const text = fsx.readFileSync(path.join(__dirname, '..', f), 'utf8')
                .split('\n')
                .filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l))
                .join('\n');
            for (const sep of ['|', ' | ', ', ']) {
                // any run of 2+ engine ids joined by `sep` that is NOT all of them
                for (let n = 2; n < ids.length; n++) {
                    const probe = ids.slice(0, n).join(sep);
                    let at = text.indexOf(probe);
                    while (at >= 0) {
                        const after = text.slice(at + probe.length, at + probe.length + 12);
                        // a prefix of the full list is fine — it is the full list
                        if (!after.startsWith(sep + ids[n])) { stale.push(`${f}: ${probe}`); }
                        at = text.indexOf(probe, at + 1);
                    }
                }
            }
        }
        ok('‼️ no bridge contract spells a SUBSET of the engines by hand',
            stale.length === 0, stale.slice(0, 3).join(' · '));
    }

    // ---- opencode really does round-trip through the one reader ----
    const dims = bridgeRunDimensions({
        engine: 'OpenCode', model: 'opencode/big-pickle',
        permissionMode: 'acceptEdits', workDir: 'D:/x', priority: 3
    });
    ok('‼️ engine:"opencode" is accepted and normalised, exactly like the other four',
        dims.engine === 'opencode' && dims.model === 'opencode/big-pickle'
        && dims.permissionMode === 'acceptEdits');
    ok('…and a provider-qualified model id survives the trip intact',
        bridgeDimsOut({ ...dims }).model === 'opencode/big-pickle');
    // ‼️ …and the effort it does NOT have is refused rather than swallowed. ACP
    // 1.18.18 declares only `model` and `mode`, and no reachable model publishes
    // a variant — so accepting an effort would let a caller believe a run was
    // throttled when nothing is.
    ok('‼️ an effort on OpenCode is refused, the same way it is on Gemini',
        threw(() => bridgeRunDimensions({ engine: 'opencode', effort: 'high' }))
        && threw(() => bridgeRunDimensions({ engine: 'gemini', effort: 'high' })));
    ok('…and the contract NAMES both of them rather than one',
        /gemini/.test(enginesWithoutEffort()) && /opencode/.test(enginesWithoutEffort())
        && Object.keys(ENGINES).filter(id => !engineTakesEffort(id)).length === 2);
    // ‼️ An unknown engine falls through to NOTHING, never to another engine:
    // silently running a job on Claude because "opencodee" was a typo is the
    // failure mode this refusal exists for.
    ok('‼️ an unknown engine is refused, never quietly swapped for a working one',
        threw(() => bridgeRunDimensions({ engine: 'opencodee' })));

    // ---- what a mid-conversation change MEANS, per shape ----
    ok('‼️ the three shapes give three different answers about where a change lands',
        new Set(['claude', 'opencode', 'codex'].map(engineChangeNote)).size === 3
        && /running process/.test(engineChangeNote('claude'))
        && /live connection/.test(engineChangeNote('opencode'))
        && /no running process/.test(engineChangeNote('codex')));
    // ‼️ …and Claude's permission sentence is CLAUDE'S. `engineModeNote` routed
    // it to `codexModeNote`, so asking what a Claude session's mode meant
    // answered "Codex cannot stop and ask" — the wrong engine's name on the
    // wrong claim about the one engine that can. Nothing reached that branch
    // until a contract asked every engine the same question.
    ok('‼️ every engine answers the permission question in its OWN name',
        Object.keys(ENGINES).every(id => {
            const note = engineModeNote(id, '');
            const others = Object.values(ENGINES)
                .filter(e => e.id !== id)
                .map(e => e.label);
            return note.length > 20 && !others.some(label => note.startsWith(label));
        }));
    ok('…and OpenCode\'s says the thing an unattended caller has to know',
        /once \/ always \/ reject/.test(engineModeNote('opencode', ''))
        && /refused/.test(engineModeNote('opencode', '')));
}

// ---------------------------------------------------------------------------
// B-12 — the run a caller WRITES is the run it READS BACK, capabilities and all
// ---------------------------------------------------------------------------
//
// ‼️ THE RULE THIS PINS is the panel–bridge equivalence one: work set up over
// the bridge has to come back out of it without loss. `bridgeDimsOut` is the
// one serializer every read op goes through (tasks.get, schedules.list,
// triggers.list, templates, workflow steps), so a capability answered there is
// answered on all of them at once — and answered NOWHERE if it is left to each
// op, which is how `console.sessions` came to describe five engines' figures
// without ever saying which engine a row was.
{
    const { engineTakesEffort } = require(path.join(__dirname, '..', 'out/core/consoleEngine.js'));

    for (const id of Object.keys(ENGINES)) {
        const written = bridgeRunDimensions({
            engine: id,
            model: id === 'opencode' ? 'opencode/big-pickle' : 'some-model',
            ...(engineTakesEffort(id) ? { effort: 'high' } : {}),
            permissionMode: 'plan', workDir: 'D:/x', priority: 2
        });
        const read = bridgeDimsOut(written);
        ok(`‼️ ${id}: what was written is what is read back`,
            read.engine === id
            && read.model === written.model
            && read.effort === (engineTakesEffort(id) ? 'high' : null)
            && read.permissionMode === 'plan'
            && read.workDir === 'D:/x' && read.priority === 2);
        // …and the capability answer travels WITH it, so nothing has to call a
        // second op to know what the first one's figures mean.
        ok(`…${id}: and its capabilities travel on the same row`,
            read.engineLabel === ENGINES[id].label
            && read.turnShape === ENGINES[id].shape
            && read.reportsCost === ENGINES[id].reportsCost
            && read.costSource === ENGINES[id].costSource
            && read.takesEffort === engineTakesEffort(id));
    }
    // ‼️ AND A ROW WITH NO ENGINE ON IT IS CLAUDE'S, not an empty answer. Every
    // run recorded before there was a second engine is one of these, and a
    // reader that got `null` here would have to guess.
    {
        const old = bridgeDimsOut({ model: 'sonnet' });
        ok('‼️ a run from before there was a second engine reads back as claude, with claude\'s capabilities',
            old.engine === 'claude' && old.reportsCost === true
            && old.costSource === 'cli' && old.turnShape === 'persistent');
    }

    // ---- the refusals, which are half of a contract ----
    ok('‼️ a permission mode this build does not have is refused on every engine',
        Object.keys(ENGINES).every(id =>
            threw(() => bridgeRunDimensions({ engine: id, permissionMode: 'sudo' }))));
    // ‼️ …and an OpenCode "variant" is an EFFORT here, not a second dimension.
    // The engine carries it on `--variant`, which is why U-59 mapped effort onto
    // it — but no reachable model publishes one, so the honest answer is that
    // this engine takes no effort at all and says so rather than sending a flag
    // the model will ignore.
    ok('‼️ a variant/effort on OpenCode is refused rather than sent and ignored',
        threw(() => bridgeRunDimensions({ engine: 'opencode', effort: 'low' }))
        && threw(() => bridgeRunDimensions({ engine: 'opencode', effort: 'max' })));

    // ---- ‼️ NO CREDENTIAL LEAVES THROUGH THE BRIDGE ----
    //
    // The one security promise this whole surface makes (`_REF/bridge.md`: the
    // secret vault is deliberately not on the bridge). It is asserted against
    // the SOURCE of the ops that touch credentials rather than against a live
    // call, because the failure it guards is a field being added — an engine
    // row gaining `apiKey` or `token` the day somebody wires a fifth engine's
    // sign-in — and that is visible in what the handler returns.
    {
        const fs = require('fs');
        const ext = fs.readFileSync(path.join(__dirname, '..', 'src/extension.ts'), 'utf8');
        const at = (op, n) => ext.slice(ext.indexOf(`op: '${op}'`), ext.indexOf(`op: '${op}'`) + n);
        const status = at('engines.status', 3000);
        ok('‼️ engines.status returns whether a credential EXISTS, never what it is',
            /NO CREDENTIAL VALUE IS EVER RETURNED/.test(status)
            && !/apiKey:|token:|secretValue|\.value\b/.test(status.replace(/\/\/.*$/gm, '')));
        // …and the engine matrix it serves is built from presence, not content.
        const engines = fs.readFileSync(path.join(__dirname, '..', 'src/core/engines.ts'), 'utf8');
        ok('…and the matrix behind it never carries a secret VALUE either',
            !/\bkeyValue\b|\bapiKey\b\s*:/.test(engines));
        // ‼️ …and an agent cannot settle its own permission request. Two engines
        // really do stop and ask now, so this stopped being theoretical: the
        // one-off decision stays in the panel and only the STANDING rule is a
        // bridge dimension. What the session is stuck on is readable.
        const answer = at('console.answer', 2500);
        ok('‼️ console.answer refuses a PERMISSION request — an agent may not grant itself a tool',
            /is asking for PERMISSION, not for an answer/.test(answer)
            && /ask!\.questions\.length/.test(answer));
        // 16000: this op's contract paragraph alone runs past 6 000 characters, and
        // a window that stops inside it stops covering the handler it is about.
        const sessions = at('console.sessions', 16000);
        ok('…and what it is waiting on is READABLE, so it can be reported without being settled',
            /pendingPermission: s\.pendingPermission\?\.detail \?\? null/.test(sessions)
            && /kind: s\.pendingAsk\.questions\.length \? 'question' : 'permission'/.test(sessions));
        // ---- and every console row says which engine it is ----
        ok('‼️ console.sessions names the engine and its capabilities on every row',
            /engine: engineOf\(s\.engine\)\.id/.test(sessions)
            && /turnShape: engineOf\(s\.engine\)\.shape/.test(sessions)
            && /steerable: engineOf\(s\.engine\)\.liveControls/.test(sessions)
            && /takesEffort: engineTakesEffort\(s\.engine\)/.test(sessions));
        // ---- ‼️ AND THE CONTRACT NAMES EVERY DIMENSION THE HANDLER TAKES ----
        //
        // `schedules.add` read `engine` off its args through
        // `bridgeRunDimensions` and its `describe` listed every OTHER dimension
        // — so a caller planning a nightly OpenCode run read the catalogue,
        // concluded a schedule cannot pick an engine, and built it as a task.
        // One handler with two contracts is exactly what `farm.ops` exists to
        // stop, and `schedules.edit` had been naming the engine all along.
        const schedAdd = at('schedules.add', 3000);
        ok('‼️ schedules.add names the engine its handler has always accepted',
            /engine\? \('/.test(schedAdd) && /ENGINE_ENUM/.test(schedAdd)
            && /enginesWithoutEffort\(\)/.test(schedAdd));
        ok('…and a workflow STEP names it too, with the list rather than "(per step)"',
            /ENGINE_ENUM/.test(at('workflows.step.add', 2500)));
        // …and the read-backs say what `bridgeDimsOut` now puts on them, from
        // one string rather than four copies of a sentence.
        ok('‼️ every read-back contract carries the capability note, built once',
            ['schedules.list', 'triggers.list', 'templates.list', 'tasks.get']
                .every(op => /DIMS_OUT_NOTE/.test(at(op, 2500))));

        // ---- …and stopping a turn says WHICH of the three acts happened ----
        const interrupt = at('console.interrupt', 2500);
        ok('‼️ console.interrupt reports the mechanism, which differs on all three shapes',
            /asked to stop \(session\/cancel\)/.test(interrupt)
            && /interrupted over the control channel/.test(interrupt)
            && /the turn was its process/.test(interrupt));
    }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
