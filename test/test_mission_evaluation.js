// ‼️ M-17 (X-32) — "THE AGENT FINISHED" IS NOT "THE OBJECTIVE IS MET".
//
// Until this item those were the same sentence: an adaptive run ended because
// its last delegation exited zero, which answers a different question — did the
// work RUN — and answers it as if it were the one that was asked.
//
// So `finish + success` is now a claim that has to be backed, and what backs it
// is a CURRENT evaluation of every required criterion. Five things are easy to
// get wrong here and each is measured:
//
//   * a required criterion opens the gate only with a PASS — `unknown` and
//     `unjudged` are not passes, and neither is the absence of a complaint;
//   * an evaluation EXPIRES when the work it judged moves on. A verdict about
//     an artefact that has since been rewritten is the one thing that would let
//     a run revise and still finish on the old version's pass;
//   * a review that could not be READ says nothing about the work — not `fail`,
//     which blames the delegate for the reviewer's timeout, and not silence;
//   * an OPTIONAL criterion that failed does not hold the door, or the
//     `required` flag would mean nothing;
//   * and the run stops HONESTLY: a lead that insists on success it cannot back
//     is not fought to the call cap, it is recorded as partial with the unmet
//     criteria named.
//
// Classic is untouched: it has no criteria, no gate and no evaluation.
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

const CRITERIA = [
    { id: 'c1', text: 'every op is documented', required: true },
    { id: 'c2', text: 'the tone matches the guide', required: false }
];
const LIMITS = { maxRounds: 8, maxTasks: 12, maxCostUSD: 5, maxTokens: 0, maxMinutes: 120, maxParallel: 3 };
const spec = (over = {}) => ({
    id: 'm', title: 'objective', goal: 'the API is documented',
    leadAgentId: 'lead', leadAgentName: 'Lead', mode: 'adaptive', team: [],
    pool: [{ agentId: 'a1', agentName: 'Ada' }, { agentId: 'a2', agentName: 'Rev' }],
    constraints: [], successCriteria: CRITERIA, autonomy: 'ask-when-unsure',
    limits: { ...LIMITS }, approvalMode: 'auto', createdAt: 1, ...over
});
const newRun = (id = 'r') => ({
    id, specId: 'm', status: 'running', rounds: [], ledger: [], totalCostUSD: 0, startedAt: 0
});
const reflect = (over = {}) => ({
    rationale: 'r', currentPhase: 'p', strategy: 'delegate then verify', basedOn: [], ...over
});

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

/** `outputs` maps a step title to the body its review/work produced. */
function deps(planner, outputs = {}, over = {}) {
    const seen = [];
    let clock = 100;
    const trace = (type, payload) => seen.push({ type, ...payload });
    const bodies = {};
    const settle = (verdict) => async (_run, steps) => {
        for (const s of steps) {
            trace('action.started', { actionId: s.id, kind: 'task', refId: 't-' + s.id });
            s.status = typeof verdict === 'function' ? verdict(s) : verdict;
            if (s.status === 'done' && outputs[s.agentName] !== undefined) {
                s.outputFile = '/out/' + s.id;
                bodies[s.outputFile] = outputs[s.agentName];
            }
            trace('action.settled', { actionId: s.id, kind: 'task', outcome: s.status, refId: 't-' + s.id });
        }
    };
    return {
        seen, settle,
        d: {
            runPlanner: planner.runPlanner,
            delegateWave: settle('done'),
            readOutputBody: (f) => bodies[f] ?? '',
            requestApproval: async () => true,
            askUser: async () => 'ok',
            onUpdate: () => { },
            trace,
            now: () => clock++,
            ...over
        }
    };
}

const DELEGATE = { ...reflect(), thought: 'write', action: 'delegate', tasks: [{ agent: 'Ada', title: 'write docs', prompt: 'do it', criteria: ['c1'] }] };
const selfEval = (findings, advice = 'finish') => ({ ...reflect(), thought: 'judge', action: 'evaluate', targets: [], findings, advice });
const FINISH_OK = { ...reflect(), thought: 'done', action: 'finish', verdict: 'success', summary: 'shipped', stopReason: 'criteria-satisfied' };

// ============================================ 1. pure functions
{
    console.log('\n-- the gate, and what it refuses to call a pass');
    const g1 = M.successGate(CRITERIA, [{ id: 'e1', targets: [], evaluator: { kind: 'lead' }, at: 1, advice: 'finish', findings: [{ criterionId: 'c1', verdict: 'pass' }] }]);
    ok('every required criterion passing opens it', g1.ok && g1.unmet.length === 0);
    const g2 = M.successGate(CRITERIA, [{ id: 'e1', targets: [], evaluator: { kind: 'lead' }, at: 1, advice: 'revise', findings: [{ criterionId: 'c1', verdict: 'unknown' }] }]);
    ok('‼️ "unknown" is not a pass — an evaluator that could not tell has not said yes',
        !g2.ok && g2.unmet[0].verdict === 'unknown');
    const g3 = M.successGate(CRITERIA, []);
    ok('and neither is silence — an unjudged criterion is named as such',
        !g3.ok && g3.unmet[0].verdict === 'unjudged');
    const g4 = M.successGate(CRITERIA, [{ id: 'e1', targets: [], evaluator: { kind: 'lead' }, at: 1, advice: 'finish', findings: [{ criterionId: 'c1', verdict: 'pass' }, { criterionId: 'c2', verdict: 'fail' }] }]);
    ok('‼️ an OPTIONAL criterion that failed does not hold the door', g4.ok);
    const g5 = M.successGate(CRITERIA, [
        { id: 'e1', targets: [], evaluator: { kind: 'lead' }, at: 1, advice: 'revise', findings: [{ criterionId: 'c1', verdict: 'fail' }] },
        { id: 'e2', targets: [], evaluator: { kind: 'lead' }, at: 2, advice: 'finish', findings: [{ criterionId: 'c1', verdict: 'pass' }] }
    ]);
    ok('a later verdict replaces an earlier one — an evaluation is a statement, not a vote', g5.ok);

    console.log('\n-- staleness is the work moving, not the clock');
    const ev = { id: 'e', targets: ['s1'], evaluator: { kind: 'lead' }, at: 100, advice: 'finish', findings: [{ criterionId: 'c1', verdict: 'pass' }] };
    ok('nothing settled since → still speaks for the work', !M.isStale(ev, []));
    ok('work for ANOTHER criterion settling does not touch it',
        !M.isStale(ev, [{ at: 200, criteria: ['c2'] }]));
    ok('‼️ work for a criterion it judged, settling AFTER it → stale',
        M.isStale(ev, [{ at: 200, criteria: ['c1'] }]));
    ok('…but not work that settled BEFORE it — that is what it looked at',
        !M.isStale(ev, [{ at: 50, criteria: ['c1'] }]));
    eq('and currentEvaluations drops exactly those',
        M.currentEvaluations([ev], [{ at: 200, criteria: ['c1'] }]).length, 0);

    console.log('\n-- the parser has one definition of a verdict, whoever wrote it');
    const p1 = M.parseEvaluation('{"findings":[{"criterion":"c1","verdict":"pass","evidence":"saw it"}],"advice":"finish"}', CRITERIA);
    ok('a clean reply parses', p1.ok && p1.value.findings[0].evidence === 'saw it');
    ok('no score is required', p1.ok && p1.value.confidence === undefined);
    const p2 = M.parseEvaluation('{"findings":[{"criterion":"c9","verdict":"pass"}],"advice":"finish"}', CRITERIA);
    ok('an invented criterion is refused by name', !p2.ok && /unknown criterion "c9"/.test(p2.error));
    const p3 = M.parseEvaluation('{"findings":[{"criterion":"c1","verdict":"yes"}],"advice":"finish"}', CRITERIA);
    ok('so is a verdict that is not one of the three', !p3.ok && /pass, fail or unknown/.test(p3.error));
    const p4 = M.parseEvaluation('{"findings":[{"criterion":"c1","verdict":"pass"},{"criterion":"c1","verdict":"fail"}],"advice":"finish"}', CRITERIA);
    ok('‼️ and one evaluation cannot disagree with itself', !p4.ok && /judged twice/.test(p4.error));
    const p5 = M.parseEvaluation('{"findings":[{"criterion":"c1","verdict":"pass"}],"advice":"ship it"}', CRITERIA);
    ok('an advice outside the list is refused', !p5.ok && /must be one of/.test(p5.error));
    const p6 = M.parseEvaluation('{"findings":[{"criterion":"c1","verdict":"pass"}],"advice":"finish","confidence":"high"}', CRITERIA);
    ok('a non-numeric confidence is DROPPED, not refused — nothing depends on it',
        p6.ok && p6.value.confidence === undefined);
    const u = M.unreadableEvaluation(CRITERIA, 'the review timed out');
    ok('‼️ an unreadable review is unknown on every criterion, never fail',
        u.findings.every(f => f.verdict === 'unknown') && /timed out/.test(u.findings[0].gap));
}

// ============================================ 2. the gate in the engine
{
    console.log('\n-- all required pass → success');
    const p = scripted([DELEGATE, selfEval([{ criterion: 'c1', verdict: 'pass', evidence: 'nine of nine' }]), FINISH_OK]);
    const { d } = deps(p);
    const run = newRun('r1');
    return new M.MissionEngine(spec(), run, [], d).execute().then(() => {
        eq('the run succeeds', run.result.verdict, 'success');
        eq('and says why it stopped', run.result.stopReason, 'criteria-satisfied');
        ok('nothing is recorded as unmet', run.result.unmet === undefined);
        eq('the verdict is on the run', run.evaluations.length, 1);
        eq('with its evaluator named', run.evaluations[0].evaluator.kind, 'lead');
        eq('and the round points at it', run.rounds[1].evaluationId, run.evaluations[0].id);
        return part2();
    });
}

// ============================================ 3. one fail → refused, then revise
function part2() {
    console.log('\n-- a required criterion that failed refuses "success" and asks for the gap to be closed');
    const p = scripted([
        DELEGATE,
        selfEval([{ criterion: 'c1', verdict: 'fail', evidence: 'three ops missing', gap: 'ops 7-9' }], 'revise'),
        FINISH_OK,                                    // refused
        { ...reflect(), thought: 'close the gap', action: 'delegate', tasks: [{ agent: 'Ada', title: 'add ops 7-9', prompt: 'add them', criteria: ['c1'] }] },
        selfEval([{ criterion: 'c1', verdict: 'pass', evidence: 'nine of nine now' }]),
        FINISH_OK
    ]);
    const { d } = deps(p);
    const run = newRun('r2');
    return new M.MissionEngine(spec(), run, [], d).execute().then(() => {
        ok('‼️ the refusal names the criterion and its verdict',
            /\[c1\] every op is documented → fail/.test(p.prompts[3]));
        ok('…and offers the two honest ways out', /targeted "revise"/.test(p.prompts[3]) && /"partial"/.test(p.prompts[3]));
        eq('the run got there in the end', run.result.verdict, 'success');
        eq('two evaluations on the record — the fail is not erased', run.evaluations.length, 2);
        eq('the first said revise', run.evaluations[0].advice, 'revise');
        return part3();
    });
}

// ============================================ 4. a revised artefact stales its pass
function part3() {
    console.log('\n-- changing the work invalidates the verdict about it');
    const p = scripted([
        DELEGATE,
        selfEval([{ criterion: 'c1', verdict: 'pass', evidence: 'looks complete' }]),
        { ...reflect(), thought: 'one more pass', action: 'delegate', tasks: [{ agent: 'Ada', title: 'rewrite intro', prompt: 'rewrite', criteria: ['c1'] }] },
        FINISH_OK,                                     // refused: the pass is stale
        { ...reflect(), thought: 'honest', action: 'finish', verdict: 'partial', summary: 'rewritten but unverified', stopReason: 'sufficient-evidence' }
    ]);
    const { d } = deps(p);
    const run = newRun('r3');
    return new M.MissionEngine(spec(), run, [], d).execute().then(() => {
        // one round more than part2: do it · judge it · redo it · refused · finish
        ok('‼️ the pass no longer opens the gate once the work moved on',
            /\[c1\] every op is documented → unjudged/.test(p.prompts[4]));
        ok('and the lead is told what stale means',
            /goes stale when work for its criteria settles after it/.test(p.prompts[4]));
        eq('the run closes honestly instead', run.result.verdict, 'partial');
        eq('with its own stop reason', run.result.stopReason, 'sufficient-evidence');
        eq('the stale evaluation is KEPT — "we checked, then changed it" is the history',
            run.evaluations.length, 1);
        return part4();
    });
}

// ============================================ 5. insistence becomes an honest partial
function part4() {
    console.log('\n-- a lead that insists on success it cannot back is recorded, not fought');
    const p = scripted([FINISH_OK]);
    const { d } = deps(p);
    const run = newRun('r4');
    return new M.MissionEngine(spec(), run, [], d).execute().then(() => {
        eq('the run ends', run.status, 'done');
        eq('‼️ …as partial, which is what actually happened', run.result.verdict, 'partial');
        ok('and the summary says so in the open', /"success" was claimed without a current pass on c1/.test(run.result.summary));
        eq('the unmet criteria ride along in the record, not only in prose', run.result.unmet.length, 1);
        eq('by id', run.result.unmet[0].id, 'c1');
        eq('refused once, taken the second time — no standoff', p.calls(), 2);

        // required "unknown" lands in the same place
        const p2 = scripted([selfEval([{ criterion: 'c1', verdict: 'unknown', gap: 'could not open the file' }], 'partial'), FINISH_OK]);
        const two = deps(p2);
        const run2 = newRun('r4b');
        return new M.MissionEngine(spec(), run2, [], two.d).execute().then(() => {
            eq('‼️ a required criterion nobody could judge ends the run as partial', run2.result.verdict, 'partial');
            eq('naming it', run2.result.unmet[0].verdict, 'unknown');
            return part5();
        });
    });
}

// ============================================ 6. the independent reviewer
function part5() {
    console.log('\n-- an independent review is an ordinary delegation, judged by the same parser');
    const REVIEW = { ...reflect(), thought: 'get a second pair of eyes', action: 'evaluate', targets: [], reviewer: 'Rev' };
    const p = scripted([DELEGATE, REVIEW, FINISH_OK]);
    const { d, seen } = deps(p, {
        Rev: JSON.stringify({ findings: [{ criterion: 'c1', verdict: 'pass', evidence: 'checked all nine' }], advice: 'finish' }),
        Ada: 'the docs'
    });
    const run = newRun('r5');
    return new M.MissionEngine(spec(), run, [], d).execute().then(() => {
        eq('the run succeeds on the reviewer\'s word', run.result.verdict, 'success');
        eq('the verdict names who gave it', run.evaluations[0].evaluator.agentName, 'Rev');
        eq('as an agent, not the lead', run.evaluations[0].evaluator.kind, 'agent');
        const step = run.rounds[1].steps[0];
        ok('‼️ the review ran as an ordinary task — same budget, same waves', !!step && step.evaluates === true);
        ok('read-only, because a reviewer that edits is not reviewing', step.readonly === true);
        ok('and its prompt is self-contained: objective, criteria by id, and what to look at',
            /## The criteria/.test(step.prompt) && /\[c1\]/.test(step.prompt) && /the docs/.test(step.prompt));
        ok('the journal records the finding under the evaluation id',
            seen.some(e => e.type === 'evaluation.recorded' && e.actionId === run.evaluations[0].id && e.verdict === 'pass'));

        // ‼️ a review that cannot be read says nothing about the WORK
        const cases = [
            ['prose instead of JSON', { Rev: 'Looks good to me!' }, 'done'],
            ['a review that failed outright', { Rev: '' }, 'failed']
        ];
        const runOne = ([name, outputs, status]) => {
            const pp = scripted([REVIEW, { ...reflect(), thought: 'honest', action: 'finish', verdict: 'partial', summary: 'unverified', stopReason: 'no-new-information' }]);
            const dd = deps(pp, outputs);
            dd.d.delegateWave = dd.settle(status);
            const rr = newRun('r5-' + name.slice(0, 4));
            return new M.MissionEngine(spec(), rr, [], dd.d).execute().then(() => {
                ok(`‼️ ${name}: unknown on every criterion — never a fail the delegate did not earn`,
                    rr.evaluations[0].findings.every(f => f.verdict === 'unknown'));
                ok(`   …and the reason is on the record`, /could not be read/.test(rr.evaluations[0].note));
                ok(`   …and it does not open the gate`, rr.result.verdict === 'partial');
            });
        };
        return runOne(cases[0]).then(() => runOne(cases[1])).then(part6);
    });
}

// ============================================ 7. limits still outrank the model
function part6() {
    console.log('\n-- at the hard limit only an honest final is possible');
    const p = scripted([{ ...reflect(), thought: 'more', action: 'delegate', tasks: [{ agent: 'Ada', title: 'again', prompt: 'again', criteria: ['c1'] }] }]);
    const { d } = deps(p);
    const run = newRun('r6');
    return new M.MissionEngine(spec({ limits: { ...LIMITS, maxRounds: 1 } }), run, [], d).execute().then(() => {
        eq('the run stops', run.status, 'failed');
        eq('as partial, not success', run.result.verdict, 'partial');
        eq('‼️ and the reason is the ceiling, said in the closed vocabulary', run.result.stopReason, 'hard-limit');

        // an out-of-list stop reason is refused by name rather than coerced
        const p2 = scripted([{ ...reflect(), thought: 'x', action: 'finish', verdict: 'partial', summary: 's', stopReason: 'i got bored' }]);
        const two = deps(p2);
        const run2 = newRun('r6b');
        return new M.MissionEngine(spec(), run2, [], two.d).execute().then(() => {
            ok('a stop reason outside the list is refused, with the list',
                /"stopReason" must be one of: criteria-satisfied/.test(p2.prompts[1]));
            return part7();
        });
    });
}

// ============================================ 8. classic does not know any of this
function part7() {
    console.log('\n-- a classic mission has no criteria, no gate and no evaluation');
    const classic = {
        id: 'c', title: 'c', goal: 'g', leadAgentId: 'l', leadAgentName: 'L',
        team: [{ agentId: 'a1', agentName: 'Ada' }],
        limits: { ...LIMITS }, approvalMode: 'auto', createdAt: 1
    };
    const p = scripted([{ thought: 'done', action: 'finish', verdict: 'success', summary: 'shipped' }]);
    const { d } = deps(p);
    const run = newRun('r7');
    return new M.MissionEngine(classic, run, [], d).execute().then(() => {
        eq('‼️ it finishes as success on its own word, first time', run.result.verdict, 'success');
        eq('on one planner call — no gate stood in the way', p.calls(), 1);
        ok('nothing was recorded on it', run.evaluations === undefined && run.result.unmet === undefined);
        ok('and it carries no stop reason it never stated', run.result.stopReason === undefined);
        const r = M.parsePlannerDecision(JSON.stringify({ action: 'evaluate', thought: 'x' }), classic);
        ok('a classic lead that invents "evaluate" gets today\'s error, unchanged',
            !r.ok && r.error === 'unknown "action": "evaluate" (use delegate | finish | ask_user | abort)');
        const r2 = M.parsePlannerDecision(JSON.stringify({ action: 'finish', thought: 'x', verdict: 'success', summary: 's', stopReason: 'nonsense' }), classic);
        ok('…and a stop reason on a classic reply is simply ignored, as it always was', r2.ok);

        // the adaptive parse refuses a self-evaluation with no verdict attached
        const bad = M.parseAdaptiveDecision(JSON.stringify({
            rationale: 'r', currentPhase: 'p', strategy: 's', action: 'evaluate', targets: []
        }), spec());
        ok('‼️ "I will judge it myself" with nothing attached is refused — it would cost a round and record nothing',
            !bad.ok && /must carry the verdict/.test(bad.error));
        const badCrit = M.parseAdaptiveDecision(JSON.stringify({
            rationale: 'r', currentPhase: 'p', strategy: 's', action: 'delegate',
            tasks: [{ agent: 'Ada', title: 't', prompt: 'p', criteria: ['c9'] }]
        }), spec());
        ok('a delegation aimed at a criterion that does not exist is refused by name',
            !badCrit.ok && /unknown criterion "c9"/.test(badCrit.error));

        console.log(`\n${pass} passed, ${fail} failed`);
        process.exit(fail ? 1 : 0);
    });
}
