// ‼️ M-15 (X-32) — THE ADAPTIVE CONTRACT, AND THE CLASSIC RUN THAT MUST NOT
// NOTICE IT EXISTS.
//
// A classic mission is a RECIPE: here is the team, delegate round by round,
// finish. An adaptive one is an OBJECTIVE: here is what must be true at the
// end, here is what you may not do, here is who you may draw on — work the
// rest out. This item builds the CONTRACT for the second, and its first
// obligation is to the first: every mission ever written is in the store with
// no `mode` field, and not one of them may behave differently tomorrow.
//
// So what is pinned here is mostly about the OLD shape:
//
//   * an old record loads, round-trips and runs byte-for-behaviour classic —
//     no field added, none defaulted in, nothing normalised onto it;
//   * a criterion's id is stable: evaluations point at it across rounds and a
//     re-normalise must never renumber one or hand out an id twice;
//   * an objective that cannot be judged never starts — every fault reported
//     at once, before a planner turn is spent;
//   * the lead default is DETERMINISTIC, because a default nobody can predict
//     is a default nobody can correct;
//   * and the split is a protocol, not an `if (adaptive)`: the two modes
//     disagree about what the lead is TOLD and what its reply is CHECKED
//     against, and about nothing else.
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
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

const LIMITS = { maxRounds: 8, maxTasks: 12, maxCostUSD: 5, maxTokens: 2000000, maxMinutes: 120, maxParallel: 2 };
const classicSpec = () => ({
    id: 'm1', title: 'old one', goal: 'ship the thing',
    leadAgentId: 'lead', leadAgentName: 'Lead',
    team: [{ agentId: 'a1', agentName: 'Ada' }, { agentId: 'a2', agentName: 'Bo' }],
    limits: LIMITS, approvalMode: 'each-round', createdAt: 1
});
const adaptiveSpec = (over = {}) => ({
    id: 'm2', title: 'objective', goal: 'the docs and the code agree',
    leadAgentId: 'lead', leadAgentName: 'Lead', team: [],
    mode: 'adaptive',
    successCriteria: [{ id: 'c1', text: 'every public op is documented', required: true }],
    constraints: ['do not touch the published extension'],
    pool: [{ agentId: 'a1', agentName: 'Ada', role: 'writer' }, { agentId: 'a2', agentName: 'Bo' }],
    autonomy: 'ask-when-unsure',
    limits: LIMITS, approvalMode: 'auto', createdAt: 2, ...over
});
const REM = { rounds: 5, tasks: 9, costUSD: 4, tokens: Infinity, minutes: 90 };

// ================================= 1. absent means classic, and costs nothing
{
    console.log('\n-- the old record');
    const old = classicSpec();
    eq('a spec with no mode is classic', M.missionModeOf(old), 'classic');
    eq('…and so is one with rubbish in the field', M.missionModeOf({ mode: 'objective' }), 'classic');
    eq('nothing is adaptive by accident', M.isAdaptive(old), false);
    ok('‼️ the migration does not touch a classic spec — same object, byte for byte',
        JSON.stringify(M.migrateSpec(old)) === JSON.stringify(old));
    ok('…and it is the SAME object, so nothing downstream can be handed a copy',
        M.migrateSpec(old) === old);
    ok('normalizing a classic spec produces no adaptive fields',
        Object.keys(M.normalizeObjective(old)).length === 0);
    ok('a classic spec is never validated as an objective',
        M.validateObjective(old).length === 0);
    eq('a classic lead may delegate to its team and nobody else',
        M.allowedAgents(old).map(m => m.agentName).join(','), 'Ada,Bo');

    // The store, on a real file with a real old record in it.
    const tmp = path.join(os.tmpdir(), 'af-missions-' + Date.now() + '.json');
    fs.writeFileSync(tmp, JSON.stringify({ specs: [old], runs: [] }), 'utf8');
    const store = new M.MissionStore(tmp);
    store.load();
    ok('‼️ an old store loads unchanged', JSON.stringify(store.specs[0]) === JSON.stringify(old));
    store.save(); store.load();
    ok('…and survives a save/load round trip unchanged',
        JSON.stringify(store.specs[0]) === JSON.stringify(old));
    fs.unlinkSync(tmp);
}

// ============================================ 2. the objective round-trips
{
    console.log('\n-- the new record');
    const a = adaptiveSpec();
    eq('an adaptive spec says so', M.missionModeOf(a), 'adaptive');
    const tmp = path.join(os.tmpdir(), 'af-missions-a-' + Date.now() + '.json');
    fs.writeFileSync(tmp, JSON.stringify({ specs: [a], runs: [] }), 'utf8');
    const store = new M.MissionStore(tmp);
    store.load();
    const back = store.specs[0];
    eq('the criteria survive', back.successCriteria.length, 1);
    eq('…with their ids', back.successCriteria[0].id, 'c1');
    eq('the constraints survive', back.constraints[0], 'do not touch the published extension');
    eq('the pool survives', back.pool.length, 2);
    eq('the autonomy survives', back.autonomy, 'ask-when-unsure');
    store.save(); store.load();
    ok('‼️ the migration is idempotent — a second load changes nothing',
        JSON.stringify(store.specs[0]) === JSON.stringify(back));
    fs.unlinkSync(tmp);

    eq('an adaptive lead may delegate to the POOL',
        M.allowedAgents(a).map(m => m.agentName).join(','), 'Ada,Bo');
    eq('…and the pool member\'s role travels with it', M.allowedAgents(a)[0].role, 'writer');
    eq('an adaptive spec whose pool was never resolved falls back to its team, not to anybody',
        M.allowedAgents(adaptiveSpec({ pool: [], team: [{ agentId: 'x', agentName: 'Zed' }] }))[0].agentName,
        'Zed');
}

// ==================================== 3. the id outlives the wording
{
    console.log('\n-- stable criterion ids');
    const first = M.normalizeCriteria([{ text: 'a' }, { text: 'b' }, { text: 'c' }]);
    eq('ids are handed out in order', first.map(c => c.id).join(','), 'c1,c2,c3');
    const edited = M.normalizeCriteria([
        { id: 'c1', text: 'a, reworded entirely' },
        { id: 'c2', text: 'b' },
        { id: 'c3', text: 'c' }
    ]);
    eq('‼️ rewriting the text does not renumber the id', edited[0].id, 'c1');
    const gapped = M.normalizeCriteria([{ id: 'c1', text: 'a' }, { id: 'c3', text: 'c' }, { text: 'new' }]);
    ok('‼️ a new criterion never takes an id another one already answers to',
        gapped[2].id !== 'c1' && gapped[2].id !== 'c3');
    eq('…and the two that had ids kept them', gapped.map(c => c.id).slice(0, 2).join(','), 'c1,c3');
    const clash = M.normalizeCriteria([{ id: 'c1', text: 'a' }, { id: 'c1', text: 'b' }]);
    ok('a duplicate id in the input is broken, not honoured', clash[0].id !== clash[1].id);
    eq('absent "required" means REQUIRED — an all-optional objective judges nothing',
        M.normalizeCriteria([{ text: 'a' }])[0].required, true);
    eq('…and an explicit false is honoured',
        M.normalizeCriteria([{ text: 'a', required: false }])[0].required, false);
    eq('an empty criterion is dropped rather than given an id',
        M.normalizeCriteria([{ text: '  ' }, { text: 'real' }]).length, 1);
    eq('a non-array is not a crash', M.normalizeCriteria(undefined).length, 0);
}

// =========================== 4. an objective that cannot be judged never runs
{
    console.log('\n-- refused before a penny is spent');
    const errsOf = over => M.validateObjective(adaptiveSpec(over));
    eq('a good objective has nothing to say', errsOf({}).length, 0);
    ok('no criteria → refused', errsOf({ successCriteria: [] }).some(e => /success criterion/.test(e)));
    ok('every criterion optional → refused, because nothing decides "done"',
        errsOf({ successCriteria: [{ id: 'c1', text: 'nice to have', required: false }] })
            .some(e => /every success criterion is optional/.test(e)));
    ok('two criteria with one id → refused',
        errsOf({ successCriteria: [{ id: 'c1', text: 'a', required: true }, { id: 'c1', text: 'b', required: true }] })
            .some(e => /share the id/.test(e)));
    ok('a nameless lead → refused, always',
        errsOf({ leadAgentName: '' }).some(e => /nameless lead/.test(e)));
    ok('an empty pool → refused',
        errsOf({ pool: [] }).some(e => /pool is empty/.test(e)));
    ok('no goal → refused', errsOf({ goal: '  ' }).some(e => /needs a goal/.test(e)));
    ok('an unknown autonomy → refused', errsOf({ autonomy: 'yolo' }).some(e => /unknown autonomy/.test(e)));
    ok('‼️ every fault at once, not one per attempt',
        errsOf({ goal: '', successCriteria: [], pool: [] }).length >= 3);
}

// ================================ 5. the lead default, and why it is boring
{
    console.log('\n-- the deterministic lead');
    const fleet = [{ id: 'z1', name: 'Zoe' }, { id: 'a1', name: 'Ada' }];
    const pool = [{ agentId: 'a1', agentName: 'Ada' }, { agentId: 'z1', agentName: 'Zoe' }];
    eq('the first of the pool leads', M.resolveLead(fleet, pool).agentId, 'a1');
    eq('…the fleet only decides when there is no pool', M.resolveLead(fleet, []).agentId, 'z1');
    ok('the same input gives the same lead, every time',
        M.resolveLead(fleet, pool).agentId === M.resolveLead(fleet, pool).agentId);
    ok('an empty fleet resolves nobody rather than inventing one',
        M.resolveLead([], []) === undefined);
    eq('the whole fleet becomes a pool when nobody was named',
        M.poolFromFleet(fleet).map(m => m.agentName).join(','), 'Zoe,Ada');
    eq('…and a duplicate agent cannot appear twice in it',
        M.poolFromFleet([{ id: 'a', name: 'A' }, { id: 'a', name: 'A' }]).length, 1);
}

// ================================= 6. the protocol, not an if (adaptive)
{
    console.log('\n-- two protocols, one lifecycle');
    const c = M.protocolFor(classicSpec());
    const a = M.protocolFor(adaptiveSpec());
    eq('a classic spec gets the classic protocol', c.mode, 'classic');
    eq('an adaptive one gets the adaptive protocol', a.mode, 'adaptive');
    const cb = c.briefing(classicSpec(), [{ name: 'Ada', role: 'writer' }], REM);
    const ab = a.briefing(adaptiveSpec(), [], REM);
    ok('‼️ the classic briefing is untouched — it still says LEAD of a mission and lists the Team',
        /You are the LEAD of a mission\./.test(cb) && /## Team/.test(cb));
    ok('the classic briefing knows nothing about criteria',
        !/Success criteria/.test(cb) && !/Objective/.test(cb));
    ok('the adaptive briefing states the OUTCOME, not a procedure',
        /LEAD of an OBJECTIVE/.test(ab) && /## Success criteria/.test(ab));
    ok('…every criterion by its stable id, so a delegation can name one',
        ab.includes('[c1] every public op is documented'));
    ok('…the constraints as a fence', /## Constraints/.test(ab) && ab.includes('do not touch the published extension'));
    ok('…the pool as candidates rather than an assigned team',
        /## Who you may draw on/.test(ab) && /candidates, not an assigned team/.test(ab));
    ok('…and the autonomy in one line', /ASK WHEN UNSURE/.test(ab));
    ok('decide-alone says the other thing',
        /DECIDE ALONE/.test(a.briefing(adaptiveSpec({ autonomy: 'decide-alone' }), [], REM)));
    // ‼️ M-16 — the two schemas DO differ now, and exactly where they should.
    // What forks is what the lead must SAY about itself (so a run is
    // observable) and the fifth action; what must not fork is the engine's
    // guarantees, so those sentences are checked to be word-for-word the same
    // in both. A schema is the contract — drift here is a silent behaviour
    // change, which is why it is measured rather than trusted.
    const SHARED = [
        'You are the PLANNER, not the worker.',
        'Each task prompt must be self-contained',
        'Never delegate the same prompt to the same agent twice.',
        'Mind the remaining budget; prefer finishing with a partial result over burning it.'
    ];
    ok('the engine\'s own guarantees are stated identically in both schemas',
        SHARED.every(s => cb.includes(s) && ab.includes(s)));
    ok('‼️ only the adaptive lead is asked what it is doing and why',
        /"rationale"/.test(ab) && /"currentPhase"/.test(ab) && /"strategy"/.test(ab)
        && !/"rationale"/.test(cb) && !/"currentPhase"/.test(cb));
    ok('‼️ and only the adaptive lead may say "replan"',
        /replan/.test(ab) && !/replan/.test(cb));
    ok('a failed delegation is named as evidence only in the adaptive schema',
        /is evidence, not a verdict/.test(ab) && !/is evidence/.test(cb));
    ok('the round message is the shared one — a wave reads the same in both modes',
        c.roundMessage([], REM) === a.roundMessage([], REM));
}

// ============================ 7. the reply is checked against the right list
{
    console.log('\n-- whom the lead may name');
    const reply = agent => JSON.stringify({
        thought: 't', action: 'delegate',
        tasks: [{ agent, title: 'do it', prompt: 'the whole instruction' }]
    });
    const c = M.parsePlannerDecision(reply('Ada'), classicSpec());
    ok('a classic lead may name its team', c.ok && c.decision.tasks[0].agent === 'Ada');
    const cBad = M.parsePlannerDecision(reply('Zoe'), classicSpec());
    ok('…and nobody else', !cBad.ok && /unknown agent "Zoe"/.test(cBad.error));
    ok('…the refusal names the TEAM', !cBad.ok && /the team is: Ada, Bo/.test(cBad.error));
    const a = M.parsePlannerDecision(reply('Ada'), adaptiveSpec());
    ok('an adaptive lead may name its pool', a.ok && a.decision.tasks[0].agent === 'Ada');
    const aBad = M.parsePlannerDecision(reply('Zoe'), adaptiveSpec());
    ok('…and the refusal names the POOL', !aBad.ok && /the pool is: Ada, Bo/.test(aBad.error));
    ok('an adaptive spec with an empty pool does NOT mean "anybody"',
        !M.parsePlannerDecision(reply('Zoe'), adaptiveSpec({ pool: [], team: [] })).ok);
    // Everything else about the parse is one contract for both.
    ok('the finish action is the same in both modes',
        M.parsePlannerDecision(JSON.stringify({ action: 'finish', verdict: 'success', stopReason: 'criteria-satisfied', summary: 's' }), adaptiveSpec()).ok);
    ok('an unknown action is refused in both',
        !M.parsePlannerDecision(JSON.stringify({ action: 'improvise' }), adaptiveSpec()).ok);
}

// ================================== 8. the role is a binding, not a folder
{
    console.log('\n-- runtime roles');
    const ada = { agentId: 'a1', agentName: 'Ada', model: 'haiku' };
    let roles = M.bindRuntimeRole([], ada, 'writes the docs', 1000);
    eq('the first delegation binds a role', roles.length, 1);
    eq('…with the lead\'s own words', roles[0].brief, 'writes the docs');
    eq('…and the run dimensions the pool member carried', roles[0].model, 'haiku');
    eq('…stamped when it was bound', roles[0].boundAt, 1000);
    roles = M.bindRuntimeRole(roles, ada, 'writes the docs and the changelog', 2000);
    eq('‼️ the same agent twice is one role continuing, not a second one', roles.length, 1);
    eq('…the brief is refreshed to the lead\'s current wording', roles[0].brief, 'writes the docs and the changelog');
    eq('…and the binding time is NOT — that is when the cast was decided', roles[0].boundAt, 1000);
    roles = M.bindRuntimeRole(roles, { agentId: 'a2', agentName: 'Bo' }, 'reviews it', 3000);
    eq('a second agent is a second role', roles.length, 2);
    ok('the input list is never mutated',
        M.bindRuntimeRole([], ada, 'x', 1).length === 1);
}

// ================================= 9. the engine is constructed from the mode
{
    console.log('\n-- the engine picks its protocol once');
    const deps = {
        runPlanner: async () => ({ ok: false, error: 'not called' }),
        delegateWave: async () => { },
        readOutputBody: () => '',
        requestApproval: async () => true,
        askUser: async () => undefined,
        onUpdate: () => { },
        now: () => 0
    };
    const run = { id: 'r', specId: 'm', status: 'running', rounds: [], ledger: [], totalCostUSD: 0, startedAt: 0 };
    eq('a classic spec builds a classic engine',
        new M.MissionEngine(classicSpec(), run, [], deps).protocol.mode, 'classic');
    eq('an adaptive spec builds an adaptive engine',
        new M.MissionEngine(adaptiveSpec(), run, [], deps).protocol.mode, 'adaptive');
    ok('a classic run carries no roles — nothing was added to its shape',
        run.roles === undefined);
}

// ‼️ X-60 (M-15) — THE REQUEST IS JUDGED ON WHAT WAS SENT, NOT ON WHAT IT
// BECAME. createMission normalised first and validated its own output, so
// every fault below was already gone by the time anything looked for it — and
// each one produced a DIFFERENT, valid-looking mission the caller was told was
// theirs.
{
    console.log('\n-- ‼️ X-60 a bad request is refused, not quietly turned into a different one');

    const FLEET = ['a1', 'a2'];
    const ENGINES = ['claude', 'codex', 'gemini'];
    const bad = (raw) => M.validateMissionInput(raw, { agentIds: FLEET, engines: ENGINES });

    // ---- a misspelled mode used to start a CLASSIC mission
    ok('‼️ a misspelled mode is refused, never read as classic',
        bad({ mode: 'adptive' }).some(e => /unknown mode "adptive"/.test(e)));
    eq('the two real modes pass', bad({ mode: 'adaptive' }).length + bad({ mode: 'classic' }).length, 0);
    // ‼️ AND AN ABSENT MODE IS STILL CLASSIC. A classic Start sends no `mode`
    // key at all (M-15) — refusing that would break every caller ever written.
    eq('an absent mode is not a fault', bad({}).length, 0);

    // ---- an unknown autonomy used to become the default
    ok('an unknown autonomy is refused',
        bad({ autonomy: 'yolo' }).some(e => /unknown autonomy "yolo"/.test(e)));
    eq('an omitted one still takes the documented default', bad({ mode: 'adaptive' }).length, 0);

    // ---- ‼️ two criteria the CALLER gave one id used to be renumbered, so the
    // run judged two things under names the caller never used
    ok('a duplicate criterion id the caller chose is refused', bad({
        successCriteria: [{ id: 'c1', text: 'one' }, { id: 'c1', text: 'two' }]
    }).some(e => /two success criteria were given the id "c1"/.test(e)));
    eq('…while criteria with no ids are still the normaliser\'s job', bad({
        successCriteria: [{ text: 'one' }, { text: 'two' }]
    }).length, 0);

    // ---- ‼️ a pool of agents that do not exist used to become the WHOLE FLEET
    ok('an unknown pool member is refused by name', bad({
        pool: [{ agentId: 'ghost' }, { agentId: 'a1' }]
    }).some(e => /no agent in this fleet is "ghost"/.test(e)));
    eq('a pool of real agents passes', bad({ pool: [{ agentId: 'a1' }] }).length, 0);
    // and "nobody asked for" is still the whole fleet — that is the feature
    eq('an ABSENT pool is not a fault', bad({ mode: 'adaptive', goal: 'g' }).length, 0);

    // ---- an unknown engine used to be dropped and the member ran on the default
    ok('an unknown member engine is refused, not dropped', bad({
        pool: [{ agentId: 'a1', engine: 'nope' }]
    }).some(e => /unknown engine "nope" in pool/.test(e)));
    ok('…and the same on a classic team', bad({
        team: [{ agentId: 'a1', engine: 'nope' }]
    }).some(e => /unknown engine "nope" in team/.test(e)));
    eq('a known engine passes', bad({ pool: [{ agentId: 'a1', engine: 'codex' }] }).length, 0);

    // ---- a dimension sent as the wrong type used to be read as empty
    for (const k of ['pool', 'team', 'constraints', 'successCriteria']) {
        ok(`a "${k}" that is not a list is refused`,
            bad({ [k]: 'not a list' }).some(e => new RegExp('"' + k + '" must be a list').test(e)));
    }

    // ---- ‼️ every fault at once, because a form filled in four times is a
    // form nobody fills in
    const many = bad({
        mode: 'adptive', autonomy: 'yolo', constraints: 'one',
        pool: [{ agentId: 'ghost', engine: 'nope' }],
        successCriteria: [{ id: 'c1', text: 'a' }, { id: 'c1', text: 'b' }]
    });
    ok('all of them are reported together', many.length >= 5);

    // ---- ‼️ AND THE ORDER IS THE WHOLE ITEM: the raw check must come BEFORE
    // the normaliser, because after it there is nothing left to catch.
    const dupe = { mode: 'adaptive', successCriteria: [{ id: 'c1', text: 'a' }, { id: 'c1', text: 'b' }] };
    const normalised = M.normalizeObjective(dupe);
    eq('the normaliser renames the duplicate away, exactly as it always did',
        normalised.successCriteria.map(c => c.id).join(), 'c1,c2');
    eq('…so validateObjective on its output finds nothing wrong',
        M.validateObjective({ mode: 'adaptive', goal: 'g', leadAgentId: 'l', leadAgentName: 'L', ...normalised, pool: [{ agentId: 'a1', agentName: 'A' }] })
            .filter(e => /share the id/.test(e)).length, 0);
    ok('…and only the RAW check ever sees it', bad(dupe).some(e => /given the id "c1"/.test(e)));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
