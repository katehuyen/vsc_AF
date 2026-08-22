// X-70 proof: with a ceiling already spent, does a non-`delegate` work
// primitive still start work? Run against the CURRENT code before changing it.
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

// ‼️ the ceiling is ALREADY spent when the run starts
const spentRun = (id) => ({
    id, specId: 'm', status: 'running', rounds: [], ledger: [],
    totalCostUSD: 99, startedAt: 0
});

function deps(replies) {
    const seen = [];
    let waves = 0, i = 0;
    const d = {
        runPlanner: async () => {
            const r = replies[Math.min(i, replies.length - 1)];
            i++;
            return { ok: true, costUSD: 0, tokens: 0, raw: JSON.stringify(r) };
        },
        delegateWave: async (_run, steps) => {
            waves++;
            for (const s of steps) { s.status = 'done'; }
        },
        readOutputBody: () => '',
        requestApproval: async () => true,
        askUser: async () => 'ok',
        onUpdate: () => { },
        trace: (type, payload) => seen.push({ type, ...payload }),
        now: () => 100
    };
    return { d, seen, waves: () => waves, calls: () => i };
}

const CASES = {
    parallel: { ...reflect(), thought: 't', action: 'parallel', tasks: [{ agent: 'Ada', title: 'x', prompt: 'p' }, { agent: 'Bo', title: 'y', prompt: 'p' }] },
    review: { ...reflect(), thought: 't', action: 'review', agent: 'Ada', targets: ['s1'], ask: 'look' },
    run_workflow: { ...reflect(), thought: 't', action: 'run_workflow', workflow: 'Deploy' },
    run_mission: { ...reflect(), thought: 't', action: 'run_mission', goal: 'a nested goal', agent: 'Ada' },
    evaluate_reviewer: { ...reflect(), thought: 't', action: 'evaluate', targets: ['s1'], reviewer: 'Ada' },
    delegate: { ...reflect(), thought: 't', action: 'delegate', tasks: [{ agent: 'Ada', title: 'x', prompt: 'p' }] }
};

(async () => {
    for (const [name, decision] of Object.entries(CASES)) {
        const finish = { ...reflect(), thought: 'stop', action: 'finish', verdict: 'partial', summary: 's', stopReason: 'hard-limit' };
        const h = deps([decision, finish]);
        const run = spentRun('r-' + name);
        await new M.MissionEngine(spec(), run, [], h.d).execute().catch(e => console.log(name, 'threw', String(e).slice(0, 60)));
        const created = h.seen.filter(e => e.type === 'action.created').length;
        console.log(
            String(name).padEnd(18),
            'waves=' + h.waves(),
            'action.created=' + created,
            'status=' + run.status,
            (h.waves() || created) ? '  <-- WORK STARTED UNDER A SPENT CEILING' : '');
    }
})();
