// ‼️ M-18 (X-32) — THE LEAD IS TOLD WHICH PROJECT IT IS PLANNING FOR.
//
// Every delegation a mission makes has carried the project since the wave was
// written. The one participant that never did was the LEAD — which is the wrong
// way round: a delegate does one prompt's worth of work and the lead decides
// what the whole run is for. It planned against the goal sentence alone, with
// no idea what the project is, what is already open on it, or which document
// holds which role.
//
// Two halves, and both are needed:
//
//   1. the generated brief reaches the planner through its SYSTEM PROMPT — the
//      same file and the same flag every other Claude surface gets, so there is
//      one brief and one budget for it and never a copy pasted into the
//      briefing prose. ‼️ On the FIRST call only: every later round is a
//      `--resume` of that session, and repeating it would pay for the same
//      tokens once per round for the whole run.
//   2. the briefing says what the lead's PART in the project is, which a brief
//      cannot: the planner has no write tools on purpose, so the project's own
//      records are updated by DELEGATION or not at all. A run that moved a
//      project and recorded nothing leaves the next session blind.
'use strict';
const path = require('path');
const fs = require('fs');
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

const LIMITS = { maxRounds: 4, maxTasks: 6, maxCostUSD: 5, maxTokens: 2000000, maxMinutes: 60, maxParallel: 2 };
const spec = (over = {}) => ({
    id: 'm1', title: 'a mission', goal: 'ship the thing',
    leadAgentId: 'lead', leadAgentName: 'Lead',
    team: [{ agentId: 'a1', agentName: 'Ada' }],
    limits: LIMITS, approvalMode: 'auto', createdAt: 1, ...over
});
const run = () => ({ id: 'r', specId: 'm1', status: 'running', rounds: [], ledger: [], totalCostUSD: 0, startedAt: 0 });
const deps = (over = {}) => ({
    runPlanner: async () => ({ ok: false, error: 'not called' }),
    delegateWave: async () => { },
    readOutputBody: () => '',
    requestApproval: async () => true,
    askUser: async () => undefined,
    onUpdate: () => { },
    now: () => 0,
    ...over
});
/** The briefing as the lead actually receives it — through the engine, because
 *  the project block is inserted there and not by the protocol. */
const brief = (s, d) => {
    const e = new M.MissionEngine(s, run(), [{ name: 'Ada' }], deps(d));
    return e.briefingText(M.remainingBudget(s, run(), 0));
};

// ================================= 1. a mission with no project reads as before
{
    console.log('\n-- a mission that is work for nobody reads exactly as it did');
    const text = brief(spec(), {});
    ok('no project section at all', !/## Project/.test(text));
    ok('and the answer schema is still the last thing it is told',
        text.trimEnd().endsWith('- Mind the remaining budget; prefer finishing with a partial result over burning it.'));
    ok('a dep that returns undefined is the same as no dep',
        !/## Project/.test(brief(spec({ projectId: 'p1' }), { project: () => undefined })));
}

// ============================================= 2. the lead is told, by name
{
    console.log('\n-- the lead is told which project, and what its part in it is');
    const text = brief(spec({ projectId: 'p1' }), { project: () => ({ name: 'Agent Farm' }) });
    ok('the project is named', /## Project — this run is work for "Agent Farm"/.test(text));
    ok('…and the lead is told the brief is already in its instructions, not repeated here',
        /already in your instructions above/.test(text));
    ok('‼️ …that it CANNOT write, and that this is deliberate',
        /You cannot write to it/.test(text) && /no write tools, deliberately/.test(text));
    ok('‼️ …so recording what changed is a DELEGATION like any other',
        /RECORDING THAT IS A DELEGATION/.test(text));
    ok('…and the delegate will know where, because it gets the same map',
        /runs under this project and is given the same map/.test(text));
    /**
     * ‼️ X-94 — AND IT IS TOLD WHAT IS **NOT** IN THE BRIEF.
     *
     * The lead used to be told its instructions carried "what is open on it",
     * which was true and is now deliberately false: the mission copy of the
     * brief has no plan items, no backlog, no worklog and no decisions in it.
     * A briefing that goes on promising them sends the lead reading files
     * looking for a list that was removed on purpose — the drift that turns one
     * fix into two bugs.
     */
    ok('‼️ the lead is told the project\'s OPEN WORK is deliberately not in its brief',
        /WHAT IS OPEN ON THAT PROJECT IS NOT IN IT, on purpose/.test(text));
    ok('‼️ …and told not to go looking for it',
        /Do not go and read them looking for something to do/.test(text));
    ok('…while the promise it still makes is the one that survives — the MAP, not the queues',
        /where its code is, and which document holds which role/.test(text)
        && !/what is open on it/.test(text));
}

// ================================== 3. the block goes BEFORE the answer schema
{
    console.log('\n-- text that follows a JSON block gets read as part of it');
    const text = brief(spec({ projectId: 'p1' }), { project: () => ({ name: 'Agent Farm' }) });
    ok('the project block comes before "How to answer"',
        text.indexOf('## Project') < text.indexOf('## How to answer'));
    ok('and the schema is still last', text.indexOf('## How to answer') > 0);
}

// ============================= 4. it composes with the workflow block, not instead
{
    console.log('\n-- two inserted blocks are two blocks, not a race for one slot');
    const s = spec({ projectId: 'p1', mode: 'adaptive', successCriteria: [{ id: 'c1', text: 'it works' }] });
    const text = brief(s, {
        project: () => ({ name: 'Agent Farm' }),
        workflows: () => [{ id: 'w1', title: 'nightly', steps: 3 }]
    });
    ok('the project block is there', /## Project — this run is work for "Agent Farm"/.test(text));
    ok('and so is the workflow list', /## Workflows you may run/.test(text));
    ok('both before the schema',
        text.indexOf('## Project') < text.indexOf('## How to answer')
        && text.indexOf('## Workflows') < text.indexOf('## How to answer'));
    ok('a workflow list with no project still works on its own',
        !/## Project/.test(brief(s, { workflows: () => [{ id: 'w1', title: 'nightly', steps: 3 }] })));
}

// ================================ 5. the brief reaches the planner as a FILE
{
    console.log('\n-- the brief rides the same flag every other Claude surface uses');
    const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    const plannerSrc = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'core', 'plannerLaunch.ts'), 'utf8');
    ok('the planner call asks for the project\'s context file',
        /const ctxFile = resumeSessionId \? undefined : systemPromptFileFor\(spec\.projectId, 'mission'\);/.test(ext));
    // ‼️ X-94 — AND IT ASKS FOR THE MISSION'S COPY, which is a different text:
    // no open plan items, no backlog, no worklog, no write-back protocol. The
    // audience argument is the whole of that difference, so a refactor that
    // drops it silently puts the project's standing queues back in front of
    // every planner call and every delegation.
    ok('‼️ …the MISSION\'s copy of it, not a session\'s',
        /systemPromptFileFor\(spec\.projectId, 'mission'\)/.test(ext));
    ok('‼️ …and a mission DELEGATION reads the same copy — `missionId` is the discriminator',
        /systemPromptFileFor\(\s*\n?\s*task\.projectId, task\.missionId \? 'mission' : 'session',/.test(ext));
    ok('‼️ …and ONLY when it is not resuming — a resume already has it in the conversation',
        /resumeSessionId \? undefined :/.test(ext));
    // ‼️ X-121 — the planner's command line is built by `core/plannerLaunch.ts`
    // now, so that is where these two claims are read. The claim is unchanged:
    // the brief is passed as a QUOTED FILE, and a path that would break the
    // quoting is dropped rather than escaped into a shell.
    ok('…passed as a file, quoted, on the flag Claude reads it with',
        /--append-system-prompt-file "\$\{parts\.contextFile\}" /.test(plannerSrc));
    ok('…and a path with a quote in it is dropped rather than smuggled into a shell',
        /parts\.contextFile && !parts\.contextFile\.includes\('"'\)/.test(plannerSrc));
    ok('…and the caller only offers it on a FRESH round, so the resume never repeats it',
        /\.\.\.\(ctxFile \? \{ contextFile: ctxFile \} : \{\}\)/.test(ext));
    ok('the dep is read at briefing time, never cached — a renamed project is a '
        + 'name the lead would otherwise keep repeating',
        /project: \(\) => \{\s*\n\s*const p = spec\.projectId \? projectStore\.get\(spec\.projectId\) : undefined;/.test(ext));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
