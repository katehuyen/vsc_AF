// ‼️ X-70 (X-59) — A SPENT CEILING STOPS ALL WORK, NOT THE ONE WORD.
//
// The budget guard asked `d.action === 'delegate'`. That was the whole
// vocabulary when it was written and has not been since M-18, which added
// `parallel`, `review`, `compare`, `revise`, a reviewer'd `evaluate`,
// `run_workflow` and `run_mission` — every one of them work that costs money.
//
// MEASURED ON THE BUILD BEFORE THIS FILE EXISTED, with the cost budget fully
// spent: `parallel`, `review`, `revise` and `evaluate + reviewer` each started
// a real wave and wrote a real `action.created`. `compare`, `run_workflow` and
// `run_mission` take the identical branch and were stopped, in that harness,
// only by unrelated validation — not by the guard.
//
// The in-flight guard (X-46b) does catch them, but it catches them AFTER the
// work has begun and up to one guard interval of spending and side effects has
// happened. Work that must not run should never begin.
//
// So the question is answered by the PRIMITIVE REGISTRY — a primitive whose
// `shape` is `work` orders work — rather than by a list of names somebody has
// to remember to grow. The next primitive is covered on the day it is declared.
//
// ‼️ ONE EXEMPTION, and it is not an oversight: an `evaluate` with NO reviewer
// is the lead judging what it ALREADY holds, in the same round, ordering
// nothing — and it is exactly what a run needs to close honestly as `partial`
// with real verdicts instead of a guess. Refusing it at a spent ceiling would
// block the one action that makes the ending true.
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

const LIMITS = { maxRounds: 8, maxTasks: 12, maxCostUSD: 5, maxTokens: 0, maxMinutes: 120, maxParallel: 3 };
const spec = () => ({
    id: 'm', title: 'o', goal: 'g', leadAgentId: 'lead', leadAgentName: 'Lead',
    mode: 'adaptive', team: [],
    pool: [{ agentId: 'a1', agentName: 'Ada' }, { agentId: 'a2', agentName: 'Bo' }],
    constraints: [], successCriteria: [{ id: 'c1', text: 'done', required: true }],
    autonomy: 'ask-when-unsure', limits: { ...LIMITS }, approvalMode: 'auto', createdAt: 1
});
const r = (o = {}) => ({ rationale: 'r', currentPhase: 'p', strategy: 's', basedOn: [], ...o });
/** The ids a real lead reads off the round message it was just handed. */
const idsIn = (p) => [...String(p).matchAll(/\[id: ([^\]]+)\]/g)].map(m => m[1]);

const FIRST = { ...r(), thought: 'go', action: 'delegate', tasks: [{ agent: 'Ada', title: 'x', prompt: 'p' }] };
const FINISH = { ...r(), thought: 'stop', action: 'finish', verdict: 'partial', summary: 's', stopReason: 'hard-limit' };

/**
 * Round 1 runs normally and ITS wave spends the whole ceiling — which is how
 * this happens in life. Round 2 is the primitive under test, against a budget
 * that is genuinely gone.
 */
function spentAfterFirst(second, spend, specOver) {
    const seen = [];
    let waves = 0, i = 0, spent = false;
    const run = { id: 'r', specId: 'm', status: 'running', rounds: [], ledger: [], totalCostUSD: 0, startedAt: 0 };
    const deps = {
        runPlanner: async (prompt) => {
            i++;
            const reply = i === 1 ? FIRST : (i === 2 ? second(prompt) : FINISH);
            return { ok: true, costUSD: 0, tokens: 0, raw: JSON.stringify(reply) };
        },
        delegateWave: async (_run, steps) => {
            waves++;
            for (const st of steps) { st.status = 'done'; }
            if (!spent) { spent = true; (spend || (() => { run.totalCostUSD = 99; }))(run); }
        },
        readOutputBody: () => 'body',
        requestApproval: async () => true,
        askUser: async () => 'ok',
        onUpdate: () => { },
        trace: (type, payload) => seen.push({ type, ...payload }),
        now: () => 100
    };
    return new M.MissionEngine({ ...spec(), ...(specOver || {}) }, run, [], deps).execute()
        .then(() => ({ run, seen, waves, calls: i }));
}

const WORK = {
    parallel: () => ({ ...r(), thought: 't', action: 'parallel', tasks: [{ agent: 'Ada', title: 'x2', prompt: 'p' }, { agent: 'Bo', title: 'y', prompt: 'p' }] }),
    review: (p) => ({ ...r(), thought: 't', action: 'review', agent: 'Bo', targets: idsIn(p), ask: 'look' }),
    revise: (p) => ({ ...r(), thought: 't', action: 'revise', agent: 'Ada', targets: idsIn(p), ask: 'fix' }),
    'evaluate+reviewer': (p) => ({ ...r(), thought: 't', action: 'evaluate', targets: idsIn(p), reviewer: 'Bo' }),
    run_workflow: () => ({ ...r(), thought: 't', action: 'run_workflow', workflow: 'Deploy' }),
    run_mission: () => ({ ...r(), thought: 't', action: 'run_mission', goal: 'a nested goal that needs its own planning', agent: 'Ada' }),
    delegate: () => ({ ...r(), thought: 't', action: 'delegate', tasks: [{ agent: 'Ada', title: 'z', prompt: 'p' }] })
};

/** Each ceiling on its own — the guard names five and every one must bite. */
const CEILINGS = {
    cost: (run) => { run.totalCostUSD = 99; },
    // maxTokens 0 means UNLIMITED (v11.22), so this ceiling needs a real cap
    tokens: (run) => { run.totalTokens = 5_000_000; },
    tasks: (run) => { run.rounds.forEach(rd => { rd.steps = rd.steps.concat(Array.from({ length: 20 }, (_, k) => ({ id: 'pad' + k, round: rd.n, agentId: 'a1', agentName: 'Ada', title: 'pad', prompt: 'p', status: 'done' }))); }); },
    minutes: (run) => { run.startedAt = -200 * 60_000; }
};

(async () => {
    console.log('\n-- ‼️ X-70 no work primitive begins once the budget is gone');
    for (const name of Object.keys(WORK)) {
        const out = await spentAfterFirst(WORK[name]);
        const created = out.seen.filter(e => e.type === 'action.created').length;
        // round 1 legitimately made ONE wave and ONE action; anything past that
        // is work begun after the ceiling was already gone
        ok(`‼️ "${name}" begins nothing — no wave, no action.created`,
            out.waves - 1 === 0 && created - 1 === 0);
        ok('   …and the run ends on the ceiling, saying so',
            out.run.status === 'done' && out.run.result.stopReason === 'hard-limit');
    }

    console.log('\n-- and every ceiling the guard names does it, not only cost');
    for (const which of Object.keys(CEILINGS)) {
        const out = await spentAfterFirst(WORK.parallel, CEILINGS[which], which === 'tokens' ? { limits: { ...LIMITS, maxTokens: 2_000_000 } } : undefined);
        const created = out.seen.filter(e => e.type === 'action.created').length;
        ok(`‼️ a spent ${which} ceiling stops the next round's work too`,
            out.waves - 1 === 0 && created - 1 === 0);
    }

    console.log('\n-- the one exemption, and why it is one');
    // ‼️ An `evaluate` with no reviewer orders NOTHING: the lead judges what it
    // already holds, in the same round. It is what lets a run close honestly as
    // partial with real verdicts, and refusing it would make the ending a guess.
    const selfJudge = await spentAfterFirst((p) => ({
        ...r(), thought: 't', action: 'evaluate', targets: idsIn(p),
        findings: [{ criterion: 'c1', verdict: 'fail', gap: 'the budget ran out first' }], advice: 'partial'
    }));
    ok('‼️ a self-evaluation is still allowed — it orders nothing',
        (selfJudge.run.evaluations || []).length === 1);
    ok('   …and its verdict is what the honest ending reports',
        !!selfJudge.run.result.unmet && selfJudge.run.result.unmet[0].verdict === 'fail');
    ok('   …while starting no work of its own',
        selfJudge.waves - 1 === 0);

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
