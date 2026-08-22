// X-70 proof, round two: let round 1 run normally so there IS a settled result
// to name, and let the wave spend the ceiling. Round 2 then tries each work
// primitive against a ceiling that is genuinely exhausted.
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

const LIMITS = { maxRounds: 8, maxTasks: 12, maxCostUSD: 5, maxTokens: 0, maxMinutes: 120, maxParallel: 3 };
const spec = () => ({
    id: 'm', title: 'o', goal: 'g', leadAgentId: 'lead', leadAgentName: 'Lead',
    mode: 'adaptive', team: [],
    pool: [{ agentId: 'a1', agentName: 'Ada' }, { agentId: 'a2', agentName: 'Bo' }],
    constraints: [], successCriteria: [{ id: 'c1', text: 'done', required: true }],
    autonomy: 'ask-when-unsure', limits: { ...LIMITS }, approvalMode: 'auto', createdAt: 1
});
const reflect = (o = {}) => ({ rationale: 'r', currentPhase: 'p', strategy: 's', basedOn: [], ...o });
const ids = (p) => [...String(p).matchAll(/\[id: ([^\]]+)\]/g)].map(m => m[1]);

const FIRST = { ...reflect(), thought: 'go', action: 'delegate', tasks: [{ agent: 'Ada', title: 'x', prompt: 'p' }] };
const FINISH = { ...reflect(), thought: 'stop', action: 'finish', verdict: 'partial', summary: 's', stopReason: 'hard-limit' };

function run(second) {
    const seen = [];
    let waves = 0, i = 0, spent = false;
    const prompts = [];
    const r = { id: 'r', specId: 'm', status: 'running', rounds: [], ledger: [], totalCostUSD: 0, startedAt: 0 };
    const d = {
        runPlanner: async (prompt) => {
            prompts.push(prompt);
            i++;
            const reply = i === 1 ? FIRST : (i === 2 ? second(prompt) : FINISH);
            return { ok: true, costUSD: 0, tokens: 0, raw: JSON.stringify(reply) };
        },
        delegateWave: async (_run, steps) => {
            waves++;
            for (const s of steps) { s.status = 'done'; }
            // ‼️ the FIRST wave spends the whole ceiling — the real case
            if (!spent) { spent = true; r.totalCostUSD = 99; }
        },
        runWorkflowByName: async () => ({ ok: true, runId: 'w1' }),
        readOutputBody: () => 'body',
        requestApproval: async () => true,
        askUser: async () => 'ok',
        onUpdate: () => { },
        trace: (type, payload) => seen.push({ type, ...payload }),
        now: () => 100
    };
    return new M.MissionEngine(spec(), r, [], d).execute()
        .catch(e => ({ threw: String(e).slice(0, 80) }))
        .then(() => ({ r, seen, waves, prompts }));
}

const CASES = {
    parallel: () => ({ ...reflect(), thought: 't', action: 'parallel', tasks: [{ agent: 'Ada', title: 'x2', prompt: 'p' }, { agent: 'Bo', title: 'y', prompt: 'p' }] }),
    review: (p) => ({ ...reflect(), thought: 't', action: 'review', agent: 'Bo', targets: ids(p), ask: 'look' }),
    compare: (p) => ({ ...reflect(), thought: 't', action: 'compare', agent: 'Bo', targets: ids(p), ask: 'weigh' }),
    revise: (p) => ({ ...reflect(), thought: 't', action: 'revise', agent: 'Ada', targets: ids(p), ask: 'fix' }),
    evaluate_rev: (p) => ({ ...reflect(), thought: 't', action: 'evaluate', targets: ids(p), reviewer: 'Bo' }),
    run_workflow: () => ({ ...reflect(), thought: 't', action: 'run_workflow', workflow: 'Deploy' }),
    run_mission: () => ({ ...reflect(), thought: 't', action: 'run_mission', goal: 'a nested goal that needs its own planning', agent: 'Ada' }),
    delegate: () => ({ ...reflect(), thought: 't', action: 'delegate', tasks: [{ agent: 'Ada', title: 'z', prompt: 'p' }] })
};

(async () => {
    for (const [name, second] of Object.entries(CASES)) {
        const out = await run(second);
        // round 1 legitimately made 1 wave and 1 action; anything beyond is
        // work started AFTER the ceiling was spent
        const created = out.seen.filter(e => e.type === 'action.created').length;
        const extraWaves = out.waves - 1;
        const extraCreated = created - 1;
        const bad = extraWaves > 0 || extraCreated > 0;
        console.log(
            String(name).padEnd(14),
            'extra waves=' + extraWaves,
            'extra action.created=' + extraCreated,
            'status=' + out.r.status,
            bad ? '  <-- WORK STARTED UNDER A SPENT CEILING' : '');
        if (!bad) {
            const why = out.r.ledger.filter(l => /rejected|Not allowed/.test(l)).slice(-1)[0];
            if (why) { console.log('               stopped by:', why.slice(0, 90)); }
        }
    }
})();
