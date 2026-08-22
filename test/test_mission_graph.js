// ‼️ M-16 (X-32) — THE ADAPTIVE LEAD LOOP, AND THE GRAPH OF WHAT IT ACTUALLY DID.
//
// M-15 gave an adaptive run a CONTRACT (an objective instead of a recipe) and
// X-45 gave it a JOURNAL. This item spends them: the lead now answers with what
// it is doing and why, the run keeps versions of its strategy, and everything
// that really happened becomes a graph of identified nodes.
//
// Four claims are easy to make and easy to get wrong, so they are the ones
// measured here:
//
//   * a STRATEGY VERSION is cut when the approach MOVED, never once per round.
//     A lead that restates the same plan five times has one strategy; a version
//     number that ticked per round would say the opposite and look just as
//     plausible on the screen.
//   * the GRAPH IS NOT DRAWN IN ADVANCE. Parallel work of one round shares a
//     parent (so it branches) and the decision that read several results back
//     carries them in inputRefs (so a fan-in is a fact, not an inference from
//     timestamps).
//   * a FAILED DELEGATION IS EVIDENCE. The lead is handed six named options and
//     told plainly that finishing is one of them, not the default.
//   * GUIDANCE LANDS EXACTLY ONCE, at a planner boundary, and never pretends to
//     have reached work already in flight.
//
// And the fifth, which is the obligation the other four inherit: a classic run
// does not notice any of it.
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

const LIMITS = { maxRounds: 8, maxTasks: 12, maxCostUSD: 5, maxTokens: 0, maxMinutes: 120, maxParallel: 3 };
const spec = (over = {}) => ({
    id: 'm', title: 'objective', goal: 'the API is documented',
    leadAgentId: 'lead', leadAgentName: 'Lead',
    mode: 'adaptive', team: [],
    pool: [{ agentId: 'a1', agentName: 'Ada' }, { agentId: 'a2', agentName: 'Bo' }],
    constraints: [], successCriteria: [{ id: 'c1', text: 'every op documented', required: true }],
    autonomy: 'ask-when-unsure',
    limits: { ...LIMITS }, approvalMode: 'auto', createdAt: 1,
    ...over
});
const newRun = (id = 'r') => ({
    id, specId: 'm', status: 'running', rounds: [], ledger: [], totalCostUSD: 0, startedAt: 0
});

/** A planner that replies with the given scripted objects, in order. */
function scripted(replies) {
    let i = 0;
    const prompts = [];
    return {
        prompts,
        calls: () => i,
        runPlanner: async (prompt) => {
            prompts.push(prompt);
            const r = replies[Math.min(i, replies.length - 1)];
            i++;
            return { ok: true, costUSD: 0, tokens: 0, raw: typeof r === 'string' ? r : JSON.stringify(r) };
        }
    };
}

/**
 * ‼️ The wave is where the world happens, and the world — not the engine —
 * writes `action.started` / `action.settled` (extension.ts does it off the task
 * manager's own record). A fake that skipped those lines would leave every
 * delegation node reading `open` for ever and the test would be measuring a
 * fiction, so this one keeps the real shape: it settles the steps AND says so.
 */
function deps(planner, over = {}) {
    const seen = [];
    let clock = 100;
    const trace = (type, payload) => seen.push({ type, ...payload });
    const settleAs = (verdict) => async (_run, steps) => {
        for (const s of steps) {
            trace('action.started', { actionId: s.id, kind: 'task', refId: 't-' + s.id });
            s.status = typeof verdict === 'function' ? verdict(s) : verdict;
            trace('action.settled', {
                actionId: s.id, kind: 'task', outcome: s.status,
                refId: 't-' + s.id, costUSD: 0, tokens: 0
            });
        }
    };
    return {
        seen,
        settleAs,
        d: {
            runPlanner: planner.runPlanner,
            delegateWave: settleAs('done'),
            readOutputBody: () => '',
            requestApproval: async () => true,
            askUser: async () => 'go on',
            onUpdate: () => { },
            trace,
            now: () => clock++,
            ...over
        }
    };
}

const reflect = (over = {}) => ({
    rationale: 'because the docs are missing',
    currentPhase: 'building',
    strategy: 'delegate the writing, then verify',
    basedOn: [],
    ...over
});

// ============================================ 1. a small objective ends after one delegation
{
    console.log('\n-- a small objective is one delegation and a finish');
    // ‼️ M-17 moved the finish line, not the claim: ONE delegation still does
    // it, but "success" now needs a verdict on the criteria — a delegate
    // exiting cleanly says the work ran, not that the objective is met.
    const p = scripted([
        { ...reflect(), thought: 'one writer will do', action: 'delegate', tasks: [{ agent: 'Ada', title: 'write docs', prompt: 'document every op', expect: 'c1', criteria: ['c1'], readonly: false }] },
        { ...reflect({ currentPhase: 'verifying' }), thought: 'check it', action: 'evaluate', targets: [], findings: [{ criterion: 'c1', verdict: 'pass', evidence: 'all nine ops have a paragraph' }], advice: 'finish' },
        { ...reflect({ currentPhase: 'verifying' }), thought: 'it is done', action: 'finish', verdict: 'success', summary: 'documented', stopReason: 'criteria-satisfied' }
    ]);
    const { seen, d } = deps(p);
    const run = newRun();
    const s = spec();
    return new M.MissionEngine(s, run, [], d).execute().then(() => {
        eq('the run is done', run.status, 'done');
        eq('with an honest verdict', run.result.verdict, 'success');
        eq('and it says WHY it stopped', run.result.stopReason, 'criteria-satisfied');
        eq('one delegation, no more', run.rounds.filter(r => r.action === 'delegate').length, 1);
        eq('three rounds: do it, judge it, finish', run.rounds.length, 3);
        eq('and the round carries the lead\'s own phase label', run.rounds[1].phase, 'verifying');
        eq('‼️ the strategy never moved, so there is exactly ONE version',
            seen.filter(e => e.type === 'strategy.changed').length, 1);
        eq('and the run says which one it is following', run.strategy.version, 1);
        eq('the phase on the run follows the lead even when the strategy holds',
            run.strategy.phase, 'verifying');

        const g = M.projectTrace(seen.map((e, i) => ({ v: 2, seq: i + 1, ts: i + 1, ...e })));
        eq('the graph has a node per decision, per delegation and one ending',
            g.graph.length, 5);
        const d1 = g.graph.find(n => n.id === 'd1');
        const d2 = g.graph.find(n => n.id === 'd2');
        const del = g.graph.find(n => n.kind === 'delegation');
        eq('the first decision hangs under nothing', d1.parentRefs.length, 0);
        eq('the delegation hangs under the decision that ordered it', del.parentRefs[0], 'd1');
        eq('the second decision hangs under the first', d2.parentRefs[0], 'd1');
        ok('‼️ and it names the result it read back — the fan-in is a fact, not a guess',
            d2.inputRefs.length === 1 && d2.inputRefs[0] === del.id);
        eq('the delegation settled as done', del.status, 'done');
        eq('the ending is a node too', g.graph[g.graph.length - 1].kind, 'finish');
        eq('the lead is the actor of a decision', d1.actor, 'lead');
        eq('and the agent is the actor of its own delegation', del.actor, 'a1');
        return part2();
    });
}

// ============================================ 2. a failed result produces strategy v2
function part2() {
    console.log('\n-- a failure is evidence, and the approach may change because of it');
    const p = scripted([
        { ...reflect(), thought: 'try the writer', action: 'delegate', tasks: [{ agent: 'Ada', title: 'write docs', prompt: 'document every op', expect: 'c1' }] },
        {
            ...reflect({ strategy: 'read the source first, then write', changeReason: 'Ada had nothing to read', currentPhase: 'triage', basedOn: [] }),
            thought: 'replan', action: 'replan'
        },
        { ...reflect({ strategy: 'read the source first, then write' }), thought: 'now delegate the reading', action: 'delegate', tasks: [{ agent: 'Bo', title: 'read the source', prompt: 'list every op', expect: 'c1', readonly: true }] },
        { ...reflect({ strategy: 'read the source first, then write' }), thought: 'good enough', action: 'finish', verdict: 'partial', summary: 'listed, not written' }
    ]);
    const { seen, d, settleAs } = deps(p);
    d.delegateWave = settleAs(s => s.agentName === 'Ada' ? 'failed' : 'done');
    const run = newRun('r2');
    return new M.MissionEngine(spec(), run, [], d).execute().then(() => {
        eq('the failure did NOT end the mission', run.rounds.length, 4);
        eq('it finished on its own terms', run.status, 'done');
        eq('with the honest verdict', run.result.verdict, 'partial');
        const changes = seen.filter(e => e.type === 'strategy.changed');
        eq('‼️ exactly two strategy versions — the first and the revision', changes.length, 2);
        eq('the revision is v2', changes[1].version, 2);
        eq('and it says WHY', changes[1].reason, 'Ada had nothing to read');
        eq('pointing back at the decision it came out of', changes[1].sourceAction, 'd2');
        eq('restating v2 in the two rounds after it cuts no new version', run.strategy.version, 2);

        ok('‼️ the lead was told a failure is evidence, with the options named',
            /is a RESULT, not the end of the objective/.test(p.prompts[1])
            && /- retry —/.test(p.prompts[1]) && /- replan —/.test(p.prompts[1])
            && /finish with "partial"/.test(p.prompts[1]));
        ok('and the result carried an id it could point at', /\[id: /.test(p.prompts[1]));
        eq('the replan round ordered no work', run.rounds[1].steps.length, 0);
        eq('and is recorded as its own action', run.rounds[1].action, 'replan');
        ok('the lead was told the revision was recorded',
            /Recorded as strategy v2/.test(p.prompts[2]));

        const g = M.projectTrace(seen.map((e, i) => ({ v: 2, seq: i + 1, ts: i + 1, ...e })));
        eq('the version history is kept in order', g.strategies.map(s => s.n).join(','), '1,2');
        eq('the latest is the one in force', g.strategy.version, 2);
        eq('the current phase is the last one the lead stated', g.phase, 'building');
        const bad = g.graph.find(n => n.kind === 'delegation' && n.actor === 'a1');
        eq('‼️ the failed delegation is in the graph as failed, not missing', bad.status, 'failed');
        return part3();
    });
}

// ============================================ 3. parallel work branches, fan-in converges
function part3() {
    console.log('\n-- parallel work branches from one parent and converges on the next decision');
    const p = scripted([
        {
            ...reflect(), thought: 'both at once', action: 'delegate', tasks: [
                { agent: 'Ada', title: 'read A', prompt: 'read a', readonly: true },
                { agent: 'Bo', title: 'read B', prompt: 'read b', readonly: true }
            ]
        },
        { ...reflect(), thought: 'done', action: 'finish', verdict: 'success', summary: 'both read' }
    ]);
    const { seen, d } = deps(p);
    const run = newRun('r3');
    return new M.MissionEngine(spec(), run, [], d).execute().then(() => {
        const g = M.projectTrace(seen.map((e, i) => ({ v: 2, seq: i + 1, ts: i + 1, ...e })));
        const dels = g.graph.filter(n => n.kind === 'delegation');
        eq('two delegations', dels.length, 2);
        ok('‼️ …and they branch from the SAME parent, which is what "parallel" means here',
            dels[0].parentRefs[0] === 'd1' && dels[1].parentRefs[0] === 'd1');
        const d2 = g.graph.find(n => n.id === 'd2');
        eq('‼️ the next decision fans them BOTH in', d2.inputRefs.length, 2);
        ok('by their own ids', d2.inputRefs.includes(dels[0].id) && d2.inputRefs.includes(dels[1].id));
        const end = g.graph.find(n => n.kind === 'finish');
        eq('and the ending hangs under the last decision', end.parentRefs[0], 'd2');

        // the lead may name its own fan-in, and then that is what is recorded
        const p2 = scripted([
            { ...reflect(), thought: 'both', action: 'delegate', tasks: [{ agent: 'Ada', title: 'x', prompt: 'x' }] },
            { ...reflect({ basedOn: ['made-up-id'] }), thought: 'done', action: 'finish', verdict: 'success', summary: 'ok' }
        ]);
        const two = deps(p2);
        const run2 = newRun('r3b');
        return new M.MissionEngine(spec(), run2, [], two.d).execute().then(() => {
            const gg = M.projectTrace(two.seen.map((e, i) => ({ v: 2, seq: i + 1, ts: i + 1, ...e })));
            eq('‼️ when the lead names what it built on, THAT is the edge — not what we assumed',
                gg.graph.find(n => n.id === 'd2').inputRefs.join(), 'made-up-id');
            return part4();
        });
    });
}

// ============================================ 4. guidance lands exactly once
function part4() {
    console.log('\n-- a steer is injected once, at a planner boundary, and never twice');
    const p = scripted([
        { ...reflect(), thought: 'go', action: 'delegate', tasks: [{ agent: 'Ada', title: 'x', prompt: 'x' }] },
        { ...reflect(), thought: 'again', action: 'delegate', tasks: [{ agent: 'Bo', title: 'y', prompt: 'y' }] },
        { ...reflect(), thought: 'done', action: 'finish', verdict: 'success', summary: 'ok' }
    ]);
    const { seen, d } = deps(p);
    const run = newRun('r4');
    const g = M.addGuidance(run, 'prefer the shorter form', 50);
    eq('a steer starts out due', M.pendingGuidance(run).length, 1);
    ok('and carries its own id', !!g.id);
    return new M.MissionEngine(spec(), run, [], d).execute().then(async () => {
        const carried = p.prompts.filter(t => t.includes('prefer the shorter form'));
        eq('‼️ exactly one prompt carried it', carried.length, 1);
        ok('the first one — a steer waits for the next boundary, not the next mission',
            carried[0] === p.prompts[0]);
        ok('and it says plainly that it does not reach work in flight',
            /NOT an instruction to work already in flight/.test(carried[0]));
        eq('nothing is left due', M.pendingGuidance(run).length, 0);
        ok('the run records when it landed', run.guidance[0].appliedAt >= 100);

        const guided = seen.filter(e => e.type === 'human.guided');
        eq('the journal says it was applied', guided.length, 1);
        eq('and marks it as such', guided[0].applied, true);

        // ‼️ the planner session can die and be re-seeded from the briefing —
        // the steer was already marked applied, so it must ride the fallback
        {
            let n = 0;
            const p3 = {
                prompts: [],
                runPlanner: async (prompt, resume) => {
                    p3.prompts.push(prompt);
                    n++;
                    if (n === 2) { return { ok: false, error: 'session gone' }; }
                    return {
                        ok: true, costUSD: 0, sessionId: 'sess',
                        raw: JSON.stringify(n <= 2
                            ? { ...reflect(), thought: 'go', action: 'delegate', tasks: [{ agent: 'Ada', title: 'x', prompt: 'x' }] }
                            : { ...reflect(), thought: 'done', action: 'finish', verdict: 'success', summary: 'ok' })
                    };
                }
            };
            const three = deps(p3);
            const run3 = newRun('r4c');
            M.addGuidance(run3, 'keep it terse', 10);
            await new M.MissionEngine(spec(), run3, [], three.d).execute();
            eq('‼️ a lost planner session does not swallow the steer',
                p3.prompts.filter(t => /keep it terse/.test(t)).length, 2);
            const reseed = p3.prompts.find(t => /already in force/.test(t));
            ok('the second time is the re-seeded briefing, not a second round',
                !!reseed && /You are the LEAD of an OBJECTIVE/.test(reseed));
            ok('…and it is labelled as already in force, so it is not acted on twice',
                /not new instructions/.test(reseed));
        }

        // a steer that arrives mid-run waits for the NEXT boundary
        const p2 = scripted([
            { ...reflect(), thought: 'go', action: 'delegate', tasks: [{ agent: 'Ada', title: 'x', prompt: 'x' }] },
            { ...reflect(), thought: 'done', action: 'finish', verdict: 'success', summary: 'ok' }
        ]);
        const run2 = newRun('r4b');
        const two = deps(p2);
        const settle = two.settleAs('done');
        two.d.delegateWave = async (r, steps) => {
            // the human types while the wave is running
            M.addGuidance(run2, 'use British spelling', 200);
            await settle(r, steps);
        };
        return new M.MissionEngine(spec(), run2, [], two.d).execute().then(() => {
            ok('‼️ a steer sent mid-wave reaches the NEXT planner call, not the running task',
                !/British/.test(p2.prompts[0]) && /British/.test(p2.prompts[1]));
            eq('and only that one', p2.prompts.filter(t => /British/.test(t)).length, 1);

            // replay: the journal alone must not double-apply it
            const ev = two.seen.map((e, i) => ({ v: 2, seq: i + 1, ts: i + 1, ...e }));
            const proj = M.projectTrace(ev.concat(ev));
            eq('a replayed journal still shows ONE steer', proj.guidance.length, 1);
            ok('still marked applied', proj.guidance[0].appliedAt !== undefined);
            eq('and one guidance node', proj.graph.filter(n => n.kind === 'guidance').length, 1);
            eq('‼️ and a replay does not invent strategy versions either',
                proj.strategies.length, M.projectTrace(ev).strategies.length);
            return part5();
        });
    });
}

// ============================================ 5. one correction, then an open failure
function part5() {
    console.log('\n-- an invalid reply gets one correction, then fails in the open');
    const p = scripted(['not json at all']);
    const { d } = deps(p);
    const run = newRun('r5');
    return new M.MissionEngine(spec(), run, [], d).execute().then(() => {
        eq('the run failed', run.status, 'failed');
        ok('saying exactly what was wrong', /invalid decision twice/.test(run.note));
        eq('after exactly two planner calls — one correction, no more', p.calls(), 2);
        ok('and the correction was fed back in the model\'s own terms',
            /Your last reply was invalid/.test(p.prompts[1]));

        // a reply missing the M-16 fields is invalid in the same way
        const p2 = scripted([{ thought: 'x', action: 'finish', verdict: 'success', summary: 'ok' }]);
        const two = deps(p2);
        const run2 = newRun('r5b');
        return new M.MissionEngine(spec(), run2, [], two.d).execute().then(() => {
            eq('an adaptive reply with no rationale/phase/strategy is refused', run2.status, 'failed');
            ok('and the lead is told which fields are missing, by name',
                /"currentPhase"/.test(p2.prompts[1]) && /"strategy"/.test(p2.prompts[1]));
            ok('…but a plain "thought" stands in AS the rationale — it is a sentence to show, not a second one to write',
                !/"rationale"/.test(p2.prompts[1]));

            // ‼️ …and the SAME reply is perfectly valid for a classic mission.
            const classic = {
                id: 'c', title: 'c', goal: 'g', leadAgentId: 'l', leadAgentName: 'L',
                team: [{ agentId: 'a1', agentName: 'Ada' }],
                limits: { ...LIMITS }, approvalMode: 'auto', createdAt: 1
            };
            const p3 = scripted([{ thought: 'x', action: 'finish', verdict: 'success', summary: 'ok' }]);
            const three = deps(p3);
            const run3 = newRun('r5c');
            return new M.MissionEngine(classic, run3, [], three.d).execute().then(() => {
                eq('‼️ a classic run is not asked for any of it and finishes first time', run3.status, 'done');
                eq('on one planner call', p3.calls(), 1);
                const r = M.parsePlannerDecision(JSON.stringify({ action: 'replan', thought: 'x' }), classic);
                ok('and a classic lead that invents "replan" gets today\'s error, unchanged',
                    !r.ok && r.error === 'unknown "action": "replan" (use delegate | finish | ask_user | abort)');
                return part6();
            });
        });
    });
}

// ============================================ 6. the limits still have the last word
function part6() {
    console.log('\n-- past the limit, delegation is refused and an honest ending is forced');
    const keepsDelegating = {
        ...reflect(), thought: 'more', action: 'delegate',
        tasks: [{ agent: 'Ada', title: 'again', prompt: 'again' }]
    };
    const p = scripted([keepsDelegating]);
    const { d } = deps(p);
    const run = newRun('r6');
    const s = spec({ limits: { ...LIMITS, maxRounds: 1 } });
    return new M.MissionEngine(s, run, [], d).execute().then(() => {
        eq('the run did not run past its budget', run.status, 'failed');
        ok('and says so honestly rather than claiming success',
            run.result.verdict === 'partial' && /budget limit/.test(run.result.summary));
        // the ceiling binds on the round AFTER the last one it allowed, so the
        // finish-only note lands on call 2 and the single nudge on call 3
        ok('the lead was told delegation was no longer allowed',
            /"delegate" is no longer allowed/.test(p.prompts[1]));
        ok('and was nudged once before being stopped',
            /Not allowed:/.test(p.prompts[2]));
        eq('three planner calls and no spinning', p.calls(), 3);

        // one honest finish at the limit is accepted
        const p2 = scripted([
            { ...reflect(), thought: 'out of rope', action: 'finish', verdict: 'partial', summary: 'as far as it went' }
        ]);
        const two = deps(p2);
        const run2 = newRun('r6b');
        return new M.MissionEngine(spec({ limits: { ...LIMITS, maxRounds: 1 } }), run2, [], two.d).execute().then(() => {
            eq('a lead that finishes when told to is let through', run2.status, 'done');
            eq('with the verdict it actually gave', run2.result.verdict, 'partial');
            return part7();
        });
    });
}

// ============================================ 7. a resumed run keeps its strategy
function part7() {
    console.log('\n-- a reload is not a change of mind');
    const p = scripted([
        { ...reflect(), thought: 'carry on', action: 'finish', verdict: 'success', summary: 'ok' }
    ]);
    const { seen, d } = deps(p);
    const run = newRun('r7');
    // what a run looks like after a window reload: rounds and strategy on the
    // snapshot, engine state gone
    run.rounds = [{ n: 1, thought: 't', action: 'delegate', steps: [{ id: 's1', round: 1, agentId: 'a1', agentName: 'Ada', title: 'x', prompt: 'x', status: 'done' }], plannerCostUSD: 0, at: 1 }];
    run.strategy = { version: 3, text: 'delegate the writing, then verify', at: 1 };
    return new M.MissionEngine(spec(), run, [], d).execute('resumed').then(() => {
        eq('‼️ restating the same strategy after a reload cuts NO new version', run.strategy.version, 3);
        eq('and the journal records none', seen.filter(e => e.type === 'strategy.changed').length, 0);
        const dec = seen.find(e => e.type === 'decision.made');
        eq('the decision still carries the version in force', dec.version, 3);
        eq('and hangs under the round that was already there', dec.parentRefs[0], 'd1');
        eq('reading back the work that had already settled', dec.inputRefs[0], 's1');
        return part8();
    });
}

// ============================================ 8. the projection is honest about damage
function part8() {
    console.log('\n-- the graph survives a journal that is missing its beginning');
    const ev = [
        { v: 2, seq: 5, ts: 5, type: 'action.created', actionId: 's9', kind: 'task', agentName: 'Ada', title: 'orphan' },
        { v: 2, seq: 6, ts: 6, type: 'action.settled', actionId: 's9', outcome: 'done', refId: 't-1', outputFile: '/out/a.md' }
    ];
    const g = M.projectTrace(ev);
    const n = g.graph[0];
    eq('a delegation whose decision was lost is still a node', g.graph.length, 1);
    eq('with no parent it can honestly name', n.parentRefs.length, 0);
    eq('and both of the records it produced', n.outputRefs.length, 2);
    ok('the task id and the output file', n.outputRefs.includes('t-1') && n.outputRefs.includes('/out/a.md'));

    const twice = M.projectTrace(ev.concat(ev));
    eq('‼️ and a replayed settle does not duplicate what it produced',
        twice.graph[0].outputRefs.length, 2);

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
}
