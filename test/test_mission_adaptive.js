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

// ============ 7b. X-91 — a terminal that contradicts itself, and a cancel
//
// Action, verdict and reason were each checked alone, so one ending could
// give two opposite answers to "how did this go?". And a cancel was not an
// ending at all: `status: cancelled` and nothing else — no verdict, no
// reason, no list of what was still open — from the same surface that
// explains every other terminal in full.
{
    console.log('\n-- ‼️ X-91 the three parts of an ending must agree');
    // The adaptive parse is the one that has a stopReason to contradict.
    const term = (o) => M.parseAdaptiveDecision(
        JSON.stringify({ thought: 't', summary: 's', currentPhase: 'p', strategy: 'st', ...o }), adaptiveSpec());
    const bad = (name, o, rx) => {
        const r = term(o);
        ok(name, !r.ok && rx.test(r.error));
    };
    bad('‼️ an "abort" cannot claim success',
        { action: 'abort', verdict: 'success', stopReason: 'sufficient-evidence' },
        /cannot both be true/);
    bad('‼️ "criteria-satisfied" cannot sit on a partial',
        { action: 'finish', verdict: 'partial', stopReason: 'criteria-satisfied' },
        /says the objective was met/);
    bad('…nor on a failure',
        { action: 'abort', verdict: 'failed', stopReason: 'criteria-satisfied' },
        /says the objective was met/);
    bad('‼️ the lead may not decide a PERSON stopped the run',
        { action: 'abort', verdict: 'failed', stopReason: 'user-stop' },
        /not yours to give/);
    bad('‼️ a ceiling and a success cannot both be true',
        { action: 'finish', verdict: 'success', stopReason: 'hard-limit' },
        /cannot both be true/);
    ok('the refusal offers the reasons that ARE the lead\'s to give',
        /criteria-satisfied \| sufficient-evidence/.test(
            term({ action: 'abort', verdict: 'failed', stopReason: 'user-stop' }).error));
    ok('‼️ but the ceiling IS the lead\'s to give — the guard nudges it with that word',
        term({ action: 'finish', verdict: 'partial', stopReason: 'hard-limit' }).ok);
    ok('an honest partial still passes',
        term({ action: 'finish', verdict: 'partial', stopReason: 'no-new-information' }).ok);
    ok('…and so does an honest success',
        term({ action: 'finish', verdict: 'success', stopReason: 'criteria-satisfied' }).ok);
    ok('a CLASSIC run is untouched — it has no stopReason to contradict',
        M.parsePlannerDecision(JSON.stringify(
            { thought: 't', action: 'abort', verdict: 'success', summary: 's' }), classicSpec()).ok);

    console.log('\n-- ‼️ X-91 a cancel is an ending like any other');
    const runOf = (over = {}) => ({
        id: 'r1', specId: 'm2', status: 'running', rounds: [], ledger: [],
        totalCostUSD: 0, startedAt: 1, ...over
    });
    const bare = M.cancelledResult(adaptiveSpec(), runOf());
    eq('a run stopped before it did anything is a failure, not a partial', bare.verdict, 'failed');
    eq('‼️ and it says WHY it stopped', bare.stopReason, 'user-stop');
    ok('…in words as well', /Cancelled by the user/.test(bare.summary));
    const worked = M.cancelledResult(adaptiveSpec(), runOf({
        rounds: [{ n: 1, action: 'delegate', thought: 't', steps: [
            { id: 's1', kind: 'task', agentId: 'a1', agentName: 'Ada', title: 'x', ask: 'x', status: 'done' }
        ], plannerCostUSD: 0, at: 5 }]
    }));
    eq('a run that settled real work is a partial', worked.verdict, 'partial');
    ok('‼️ and it carries the criteria that were still open when the hand came down',
        Array.isArray(worked.unmet) && worked.unmet.some(u => u.id === 'c1'));
    ok('…which the summary repeats, so a reader who sees only prose still learns it',
        /Still open: \[c1\]/.test(worked.summary));
    const classicCancel = M.cancelledResult(classicSpec(), runOf());
    eq('a classic run cancels the same way', classicCancel.stopReason, 'user-stop');
    ok('…without inventing criteria it never had', classicCancel.unmet === undefined);
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

// ‼️ X-90 (M-15/X-60) — PRESENCE, TYPE AND VALUE ARE THREE DIFFERENT FACTS.
// The raw check answered all three with `!== undefined && !== null`, so the
// faults below walked straight past it into the lossy normaliser — which is
// the one thing this validator exists to stop.
{
    console.log('\n-- ‼️ X-90 an explicit null is not silence, and a list has items with shapes');

    const FLEET = ['a1', 'a2'];
    const bad = (raw) => M.validateMissionInput(raw, { agentIds: FLEET, engines: ['claude', 'codex'] });

    // ---- omitted vs. explicitly empty: the same key, two different requests
    eq('an OMITTED mode is silence, and silence is classic', bad({}).length, 0);
    ok('…while an explicit mode:null is refused, not read as silence',
        bad({ mode: null }).some(e => /"mode" was sent as null/.test(e)));
    ok('…and a blank mode too — a cleared field is not a choice',
        bad({ mode: '   ' }).some(e => /"mode" was sent as blank/.test(e)));
    ok('a mode sent as a number is refused by shape',
        bad({ mode: 3 }).some(e => /"mode" was sent as number/.test(e)));
    eq('an OMITTED autonomy still takes the documented default', bad({ mode: 'adaptive' }).length, 0);
    ok('…while autonomy:null and autonomy:"" are refused',
        bad({ autonomy: null }).some(e => /"autonomy" was sent as null/.test(e))
        && bad({ autonomy: '' }).some(e => /"autonomy" was sent as blank/.test(e)));
    eq('an OMITTED pool really does mean the whole fleet', bad({ mode: 'adaptive' }).length, 0);
    ok('…while pool:null and team:null are refused, not read as "not given"',
        bad({ pool: null }).some(e => /"pool" must be a list — it was sent as null/.test(e))
        && bad({ team: null }).some(e => /"team" must be a list — it was sent as null/.test(e)));

    // ---- ‼️ the lead: an unknown one used to fall through to the first of the
    // pool, so an adaptive run was led by an agent the caller never named
    ok('an unknown leadAgentId is refused by name',
        bad({ mode: 'adaptive', leadAgentId: 'ghost' }).some(e => /no agent in this fleet is "ghost" \(leadAgentId\)/.test(e)));
    eq('…while an adaptive run that names NO lead is still the feature',
        bad({ mode: 'adaptive', leadAgentId: '' }).length, 0);
    eq('…and a real lead passes', bad({ leadAgentId: 'a1' }).length, 0);
    ok('a leadAgentId sent as a list is refused by shape',
        bad({ leadAgentId: ['a1'] }).some(e => /"leadAgentId" must be an agent id/.test(e)));

    // ---- ‼️ mixed known + unknown: the unknown ones used to be FILTERED OUT,
    // so a team of five could start as a team of two without a word
    ok('an unknown member of a CLASSIC team is refused, not filtered away',
        bad({ team: [{ agentId: 'a1' }, { agentId: 'ghost' }] })
            .some(e => /no agent in this fleet is "ghost" \(in team\)/.test(e)));
    ok('…and the same on an adaptive pool, alongside a real member',
        bad({ mode: 'adaptive', pool: [{ agentId: 'a1' }, { agentId: 'ghost' }] })
            .some(e => /no agent in this fleet is "ghost" \(in pool\)/.test(e)));
    eq('a team of real agents passes', bad({ team: [{ agentId: 'a1' }, { agentId: 'a2' }] }).length, 0);

    // ---- ‼️ items with no shape: `["coder"]` is what a caller naturally writes,
    // and every normaliser downstream read it as one anonymous member
    for (const junk of ['coder', 7, null, ['a1']]) {
        ok(`a pool item sent as ${JSON.stringify(junk)} is refused rather than read as {}`,
            bad({ mode: 'adaptive', pool: [junk] }).some(e => /pool\[0\] must be an object naming an agentId/.test(e)));
        ok(`…and a team item sent as ${JSON.stringify(junk)} too`,
            bad({ team: [junk] }).some(e => /team\[0\] must be an object naming an agentId/.test(e)));
    }
    ok('an object member that names no agentId is refused',
        bad({ team: [{ role: 'reviewer' }] }).some(e => /team\[0\] names no agentId/.test(e)));
    ok('a constraint sent as an object is refused, not stringified into "[object Object]"',
        bad({ constraints: [{ text: 'no force push' }] }).some(e => /constraints\[0\] must be text/.test(e)));
    ok('a criterion sent as a bare string is refused, not read as an empty one',
        bad({ successCriteria: ['it works'] }).some(e => /successCriteria\[0\] must be an object with text/.test(e)));

    // ---- ‼️ and the same refusal on both paths. `missions.start` spreads the
    // caller's args into the identical function the panel reaches, so a shape
    // the bridge accepts and the panel refuses would be two products.
    const { BridgeRegistry, need } = require(path.join(__dirname, '..', 'out', 'core', 'bridge.js'));
    const reg = new BridgeRegistry();
    reg.register([{
        op: 'missions.start', describe: 'Start a mission. args: goal, mode?, pool?, team?',
        handler: (args) => {
            const errs = M.validateMissionInput(args, { agentIds: FLEET, engines: ['claude', 'codex'] });
            need(!errs.length, 'This mission cannot start — ' + errs.join('; ') + '.');
            return { ok: true };
        }
    }]);
    (async () => {
        for (const [name, args, rx] of [
            ['an explicit mode:null', { goal: 'g', mode: null }, /"mode" was sent as null/],
            ['an unknown lead', { goal: 'g', leadAgentId: 'ghost' }, /"ghost" \(leadAgentId\)/],
            ['a half-unknown team', { goal: 'g', team: [{ agentId: 'a1' }, { agentId: 'ghost' }] }, /"ghost" \(in team\)/],
            ['a pool item that is a bare string', { goal: 'g', mode: 'adaptive', pool: ['a1'] }, /pool\[0\] must be an object/]
        ]) {
            const r = await reg.dispatch('missions.start', args);
            ok(`the bridge refuses ${name} exactly as the panel does`, !r.ok && rx.test(r.error));
        }
        console.log(`\n${pass} passed, ${fail} failed`);
        process.exit(fail ? 1 : 0);
    })();
}
