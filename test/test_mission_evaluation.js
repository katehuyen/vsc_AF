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

/**
 * ‼️ X-67 — the ids a lead may name are RUNTIME ids, so a scripted reply may be
 * a FUNCTION of the prompt it is answering. That is what a real lead does: the
 * round message carries `[id: …]` for every result, and an evaluation has to
 * name one of them or it is a verdict bound to nothing.
 */
const idsIn = (prompt) => [...String(prompt).matchAll(/\[id: ([^\]]+)\]/g)].map(m => m[1]);

function scripted(replies) {
    let i = 0;
    const prompts = [];
    return {
        prompts,
        calls: () => i,
        runPlanner: async (prompt) => {
            prompts.push(prompt);
            let r = replies[Math.min(i, replies.length - 1)];
            i++;
            if (typeof r === 'function') { r = r(prompt); }
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
// ‼️ X-67 — a self-evaluation names the results it read, off the prompt it was
// given. It used to send `targets: []`, which the engine accepted — and a
// verdict bound to nothing can never go stale, so it was a permanent pass.
const selfEval = (findings, advice = 'finish') => (prompt) => ({
    ...reflect(), thought: 'judge', action: 'evaluate', targets: idsIn(prompt), findings, advice
});
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

    // ‼️ X-67 — AND THE SECOND WITNESS: LINEAGE. A criteria label is OPTIONAL on
    // an adaptive delegation, so the artefact could be rewritten by work that
    // named none at all and this pass stayed CURRENT — holding the success gate
    // open on a judgement of a version nobody could still produce.
    ok('‼️ a successor of what it judged, carrying NO criteria label → stale',
        M.isStale(ev, [{ id: 's2', at: 200, sources: ['s1'] }]));
    ok('…and the version it pinned counts as much as the target it named',
        M.isStale(
            { ...ev, targets: [], targetVersions: [{ id: 's1', at: 90 }] },
            [{ id: 's2', at: 200, sources: ['s1'] }]));
    ok('…while a successor of something ELSE leaves it standing',
        !M.isStale(ev, [{ id: 's3', at: 200, sources: ['sX'] }]));
    ok('…and unrelated work with no label and no lineage never touches it',
        !M.isStale(ev, [{ id: 's4', at: 200 }]));
    ok('…nor does a successor that settled BEFORE the verdict',
        !M.isStale(ev, [{ id: 's2', at: 50, sources: ['s1'] }]));

    // ‼️ X-92 — the witness that needs no label. Both of the rules above are
    // things the LEAD chose to write down, so an ordinary delegation that wrote
    // neither could rewrite the artefact and leave the pass standing. The old
    // test suite never caught it because it only ever measured a `revise`,
    // which always names its sources.
    ok('‼️ a WRITER that declared nothing takes the verdict with it',
        M.isStale(ev, [{ id: 's5', at: 200, writes: true }]));
    ok('…and it does not matter that it named no criteria and no sources',
        M.isStale(ev, [{ id: 's5', at: 200, writes: true, criteria: [], sources: [] }]));
    ok('‼️ work that changed nothing never stales anything, whatever else it says',
        !M.isStale(ev, [{ id: 's6', at: 200, writes: false }]));
    ok('‼️ a writer that DECLARED its reach and it lies elsewhere leaves it standing',
        !M.isStale(ev, [{ id: 's7', at: 200, writes: true, criteria: ['c2'] }]));
    ok('…while a writer that declared THIS criterion stales it, as it always did',
        M.isStale(ev, [{ id: 's8', at: 200, writes: true, criteria: ['c1'] }]));
    ok('‼️ a record written before the mark existed keeps the old two-witness rule',
        !M.isStale(ev, [{ id: 's9', at: 200 }]));
    ok('…and a writer BEFORE the verdict is what the verdict looked at',
        !M.isStale(ev, [{ id: 's10', at: 50, writes: true }]));
    ok('‼️ and the gate really closes: a pass with an undeclared writer after it',
        !M.successGate(CRITERIA,
            M.currentEvaluations([ev], [{ id: 's5', at: 200, writes: true }])).ok);

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

        // required "unknown" lands in the same place. ‼️ X-67 — the delegation
        // in front of it is not decoration: an evaluation names what it looked
        // at, so there has to be something to look at first.
        const p2 = scripted([DELEGATE, selfEval([{ criterion: 'c1', verdict: 'unknown', gap: 'could not open the file' }], 'partial'), FINISH_OK]);
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
    const REVIEW = (prompt) => ({ ...reflect(), thought: 'get a second pair of eyes', action: 'evaluate', targets: idsIn(prompt), reviewer: 'Rev' });
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

        // ‼️ a review that cannot be read says nothing about the WORK. The
        // delegation under it settles `done` with a body in both cases — the
        // subject here is the REVIEWER coming back unreadable, and X-88 makes
        // an unreadable failure an unnameable target, which is a different
        // rule and is measured on its own below.
        const cases = [
            ['prose instead of JSON', { Ada: 'the docs', Rev: 'Looks good to me!' }],
            ['a review that failed outright', { Ada: 'the docs', Rev: '' }]
        ];
        const runOne = ([name, outputs]) => {
            // ‼️ X-67 — the delegation first: a review names the results it
            // was sent to read, and there has to be one.
            const pp = scripted([DELEGATE, REVIEW, { ...reflect(), thought: 'honest', action: 'finish', verdict: 'partial', summary: 'unverified', stopReason: 'no-new-information' }]);
            const dd = deps(pp, outputs);
            dd.d.delegateWave = dd.settle(s => (s.evaluates && outputs.Rev === '' ? 'failed' : 'done'));
            const rr = newRun('r5-' + name.slice(0, 4));
            return new M.MissionEngine(spec(), rr, [], dd.d).execute().then(() => {
                ok(`‼️ ${name}: unknown on every criterion — never a fail the delegate did not earn`,
                    rr.evaluations[0].findings.every(f => f.verdict === 'unknown'));
                ok(`   …and the reason is on the record`, /could not be read/.test(rr.evaluations[0].note));
                ok(`   …and it does not open the gate`, rr.result.verdict === 'partial');
            });
        };
        return runOne(cases[0]).then(() => runOne(cases[1])).then(x88).then(part6);
    });
}

// ====================== 6b. ‼️ X-88 — a target is something that can be READ
//
// `results` counted `failed` as settled and stopped there, so a delegation that
// came back with NOTHING could be named as an evaluation target — and a
// self-evaluation would record a `pass` against it. That is the success gate
// opening on a verdict about an artefact that does not exist. The line is drawn
// at failures: a `done` step did the work that was ordered, and how thin its
// archive is, is a judgement for the evaluation to make.
function x88() {
    console.log('\n-- ‼️ X-88: a failure that left nothing cannot be evaluated');

    // the lead tries to pass itself on a failure that produced nothing
    const passOnAsh = selfEval([{ criterion: 'c1', verdict: 'pass', evidence: 'looks fine' }]);
    const p = scripted([DELEGATE, passOnAsh, passOnAsh,
        { ...reflect(), thought: 'honest', action: 'finish', verdict: 'partial', summary: 'unverified', stopReason: 'no-new-information' }]);
    const dd = deps(p, {});                      // no bodies at all
    dd.d.delegateWave = dd.settle('failed');
    const run = newRun('x88a');
    return new M.MissionEngine(spec(), run, [], dd.d).execute().then(() => {
        ok('‼️ THE BUG: no pass is recorded against a failure that produced nothing',
            !(run.evaluations ?? []).length);
        ok('…so the success gate never opens on it', run.result.verdict !== 'success');
        ok('…and the lead is TOLD why, rather than silently ignored',
            p.prompts.some(t => /nothing that can be read|No result of this run/i.test(t)));
        ok('the failed step is still in the record as a step',
            run.rounds[0].steps[0].status === 'failed');
    }).then(() => {
        // …but a failure that DID leave a readable archive is judgeable: the
        // rule is about what can be read, not about the word "failed".
        const pp = scripted([DELEGATE, selfEval([{ criterion: 'c1', verdict: 'fail', gap: 'it crashed halfway' }], 'revise'),
            { ...reflect(), thought: 'honest', action: 'finish', verdict: 'partial', summary: 'unverified', stopReason: 'no-new-information' }]);
        const d2 = deps(pp, {});
        d2.d.delegateWave = async (_run, steps) => {
            for (const s of steps) {
                s.status = 'failed';
                s.resultText = 'crashed after writing three of nine ops';
                d2.d.trace('action.settled', { actionId: s.id, kind: 'task', outcome: 'failed' });
            }
        };
        const r2 = newRun('x88b');
        return new M.MissionEngine(spec(), r2, [], d2.d).execute().then(() => {
            ok('a failure that DID hand something back can be judged',
                (r2.evaluations ?? []).length === 1
                && r2.evaluations[0].targets[0] === r2.rounds[0].steps[0].id);
        });
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
    const p = scripted([{ thought: 'done', action: 'finish', verdict: 'success', stopReason: 'criteria-satisfied', summary: 'shipped' }]);
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

        // ================================================================
        // ‼️ X-68 — EVERY ADAPTIVE ENDING SAYS WHY, AND WHAT IS STILL OPEN.
        //
        // `unmet` used to be filled in exactly one place: a lead claimed
        // "success", the gate refused, the lead insisted, and the verdict came
        // down to partial. Every other way a run can end short — an honest
        // partial, an explicit failed, an abort, a ceiling reached mid-wave —
        // recorded no structured gaps at all and left saying what was missing
        // to whatever prose the model happened to write. The SAME partial
        // verdict sometimes told the reader which criteria were open and
        // sometimes could not, from the same surface.
        return (async () => {
            console.log('\n-- ‼️ X-68 stopReason is required, and unmet is on every terminal that fell short');

            // ---- the field is required, not merely validated when offered
            const noReason = M.parseAdaptiveDecision(JSON.stringify({
                rationale: 'r', currentPhase: 'p', strategy: 's',
                action: 'finish', verdict: 'partial', summary: 'as far as it went'
            }), spec());
            ok('‼️ an adaptive finish that does not say why it stopped is refused',
                !noReason.ok && /must say WHY it is stopping/.test(noReason.error));
            ok('…and the refusal lists the words it may use',
                /criteria-satisfied/.test(noReason.error) && /hard-limit/.test(noReason.error));
            const noReasonAbort = M.parseAdaptiveDecision(JSON.stringify({
                rationale: 'r', currentPhase: 'p', strategy: 's',
                action: 'abort', verdict: 'failed', summary: 'giving up'
            }), spec());
            ok('…an abort is held to the same rule', !noReasonAbort.ok);

            /** Run one adaptive mission to a terminal and hand back the run. */
            const endWith = async (id, terminal, waveVerdict) => {
                const p = scripted([
                    { ...reflect(), thought: 'go', action: 'delegate', tasks: [{ agent: 'Ada', title: 'write', prompt: 'p', criteria: ['c1'] }] },
                    { ...reflect(), ...terminal }
                ]);
                const dd = deps(p, { Ada: 'body' });
                const run = newRun(id);
                if (waveVerdict) { dd.d.delegateWave = dd.settle(waveVerdict); }
                await new M.MissionEngine(spec(), run, [], dd.d).execute();
                return { run, seen: dd.seen };
            };

            // ---- an HONEST partial: nobody claimed success, so nothing was gated
            const honest = await endWith('x68-a', {
                thought: 'out of rope', action: 'finish', verdict: 'partial',
                summary: 'got most of the way', stopReason: 'no-new-information'
            });
            eq('an honest partial keeps its own reason', honest.run.result.stopReason, 'no-new-information');
            ok('‼️ …and now carries the criteria it never met',
                !!honest.run.result.unmet && honest.run.result.unmet.some(u => u.id === 'c1'));
            eq('…with the verdict that made them open', honest.run.result.unmet[0].verdict, 'unjudged');
            ok('…and the summary says so even though the model did not',
                /Still open: \[c1\]/.test(honest.run.result.summary));
            ok('…an optional criterion never holds the door', 
                !honest.run.result.unmet.some(u => u.id === 'c2'));

            // ---- an EXPLICIT failed
            const failed = await endWith('x68-b', {
                thought: 'it cannot be done', action: 'finish', verdict: 'failed',
                summary: 'the source is missing', stopReason: 'sufficient-evidence'
            });
            eq('an explicit failure says why too', failed.run.result.stopReason, 'sufficient-evidence');
            ok('…and names what was left open', !!failed.run.result.unmet.length);

            // ---- an ABORT
            const aborted = await endWith('x68-c', {
                thought: 'stop', action: 'abort', verdict: 'failed',
                summary: 'the constraints cannot be met', stopReason: 'execution-over-discussion'
            });
            eq('an abort ends the run as failed', aborted.run.status, 'failed');
            eq('…carrying its reason', aborted.run.result.stopReason, 'execution-over-discussion');
            ok('…and its open criteria', !!aborted.run.result.unmet.length);

            // ---- a COERCED partial: the one path that always worked, still does
            const coerced = await endWith('x68-d', {
                thought: 'done', action: 'finish', verdict: 'success',
                summary: 'shipped', stopReason: 'criteria-satisfied'
            });
            eq('an insisted success is recorded as partial', coerced.run.result.verdict, 'partial');
            ok('…with the gate\'s own list', coerced.run.result.unmet.some(u => u.id === 'c1'));
            ok('…and the reason the lead gave is not overwritten',
                coerced.run.result.stopReason === 'criteria-satisfied');

            // ---- ‼️ AND THE PARITY THIS ITEM IS ABOUT: four different ways to
            // end short, one shape of answer.
            const all = [honest.run, failed.run, aborted.run, coerced.run];
            ok('every terminal that fell short says WHY', all.every(r => !!r.result.stopReason));
            ok('…and every one of them lists what is still open',
                all.every(r => Array.isArray(r.result.unmet) && r.result.unmet.length > 0));
            ok('…each entry carrying id, text and verdict, never a bare id',
                all.every(r => r.result.unmet.every(u => !!u.id && !!u.text && !!u.verdict)));
            ok('…and the journal records the reason for each',
                [honest, failed, aborted, coerced].every(x =>
                    x.seen.some(e => e.type === 'run.finished' && !!e.reason)));

            // ---- a run that really met its criteria carries no open list
            const clean = scripted([
                { ...reflect(), thought: 'go', action: 'delegate', tasks: [{ agent: 'Ada', title: 'write', prompt: 'p', criteria: ['c1'] }] },
                (prompt) => ({ ...reflect(), thought: 'judge', action: 'evaluate', targets: idsIn(prompt), findings: [{ criterion: 'c1', verdict: 'pass', evidence: 'all documented' }], advice: 'finish' }),
                { ...reflect(), thought: 'done', action: 'finish', verdict: 'success', summary: 'shipped', stopReason: 'criteria-satisfied' }
            ]);
            const cd = deps(clean, { Ada: 'body' });
            const cleanRun = newRun('x68-e');
            await new M.MissionEngine(spec(), cleanRun, [], cd.d).execute();
            eq('a real success is still a success', cleanRun.result.verdict, 'success');
            ok('‼️ …and carries no open list at all — an empty one would read as a doubt',
                cleanRun.result.unmet === undefined);
            ok('…and its summary is the lead\'s own words, untouched',
                !/Still open/.test(cleanRun.result.summary));

            // ============================================================
            // ‼️ X-67 — AN EVALUATION IS BOUND TO A VERSION, OR IT IS A
            // PERMANENT PASS.
            //
            // The top of this file has said since M-17 that every evaluation
            // names what it looked at, and gave the reason: a verdict bound to
            // nothing can never go out of date, and one that can never go out
            // of date is a permanent pass — exactly how a run revises its work
            // and still finishes on a judgement of the old version. Nothing
            // enforced it. The type allowed [], the engine took it, and these
            // very tests used it.
            console.log('\n-- ‼️ X-67 a verdict names the version it judged, and dies with it');

            const bare = scripted([
                { ...reflect(), thought: 'judge', action: 'evaluate', targets: [], findings: [{ criterion: 'c1', verdict: 'pass', evidence: 'trust me' }], advice: 'finish' },
                FINISH_OK
            ]);
            const bd = deps(bare);
            const bareRun = newRun('x67-bare');
            await new M.MissionEngine(spec(), bareRun, [], bd.d).execute();
            ok('‼️ an evaluation that names nothing is refused',
                bareRun.ledger.some(l => /evaluate rejected — it named nothing to judge/.test(l)));
            ok('…in the words the rule was already written in',
                bare.prompts.some(t => /permanent pass/.test(t)));
            ok('…and before anything has run, it is told there is nothing to evaluate yet',
                bare.prompts.some(t => /Nothing has settled in this run yet/.test(t)));
            ok('…so no verdict was ever recorded on nothing',
                (bareRun.evaluations ?? []).length === 0);

            // ---- a real verdict pins the version it judged
            const bound = scripted([DELEGATE, selfEval([{ criterion: 'c1', verdict: 'pass', evidence: 'read it' }]), FINISH_OK]);
            const bnd = deps(bound, { Ada: 'the docs' });
            const boundRun = newRun('x67-bound');
            await new M.MissionEngine(spec(), boundRun, [], bnd.d).execute();
            const written = boundRun.rounds[0].steps[0].id;
            eq('a verdict names the result it read', boundRun.evaluations[0].targets.join(), written);
            ok('‼️ …and pins WHICH VERSION of it, so a reader can prove what was judged',
                boundRun.evaluations[0].targetVersions
                && boundRun.evaluations[0].targetVersions[0].id === written
                && typeof boundRun.evaluations[0].targetVersions[0].at === "number");
            eq('and the run really does finish on it', boundRun.result.verdict, 'success');

            // ---- ‼️ AND THE FAILURE THIS ITEM IS ABOUT: a revise that carries no
            // criteria label used to leave the old pass CURRENT, so the gate
            // opened on a judgement of a version the run had already replaced.
            let judged;
            const revised = scripted([
                DELEGATE,
                (prompt) => { judged = idsIn(prompt); return { ...reflect(), thought: 'judge', action: 'evaluate', targets: judged, findings: [{ criterion: 'c1', verdict: 'pass', evidence: 'read it' }], advice: 'finish' }; },
                () => ({ ...reflect(), thought: 'one more pass', action: 'revise', agent: 'Ada', targets: judged, ask: 'tighten it' }),
                FINISH_OK
            ]);
            const rvd = deps(revised, { Ada: 'the docs' });
            const revisedRun = newRun('x67-revise');
            await new M.MissionEngine(spec(), revisedRun, [], rvd.d).execute();

            const first = revisedRun.evaluations[0];
            const settled = M.settledCriteriaWork(revisedRun);
            ok('the revise names what it revises', settled.some(w => (w.sources || []).includes(judged[0])));
            ok('‼️ …so the verdict on the version it replaced is STALE',
                M.isStale(first, settled));
            eq('…and no longer speaks for the work', M.currentEvaluations([first], settled).length, 0);
            eq('‼️ …so the run cannot finish as success on it', revisedRun.result.verdict, 'partial');
            ok('…and says which criterion is open', revisedRun.result.unmet.some(u => u.id === 'c1'));

        })().then(() => {
            console.log(`\n${pass} passed, ${fail} failed`);
            process.exit(fail ? 1 : 0);
        });
    });
}
