/**
 * The Missions page: the New Mission form, and a run open on its detail.
 *
 * ‼️ THE FORM IS THE POINT, and the team rows more than the rest of it. A member
 * row is a flex line that now carries four controls — the checkbox, the role,
 * the engine picker, the permissions picker and the model box — and every one of
 * them was added by a commit whose tests read the markup as strings. A row that
 * wraps, or a picker squeezed to the width of its arrow, passes all of them.
 *
 * The run variant is here for the chips under the title: engine, model and
 * permissions ride on the same team chip, and three of them on one line is the
 * case that has to stay readable.
 */

const AGENTS = [
    { id: 'a0', name: 'manager' },
    { id: 'a1', name: 'developer' },
    { id: 'a2', name: 'basit' }
];

/** The host's own PERMISSION_CHOICES — the form must never carry a copy. */
const PERMISSIONS = [
    { id: '', label: 'Default', detail: 'no --permission-mode flag — asks before acting, as configured' },
    { id: 'plan', label: 'plan', detail: 'plans only, changes nothing until you approve' },
    { id: 'acceptEdits', label: 'acceptEdits', detail: 'file edits auto-approved, everything else still asks' },
    { id: 'auto', label: 'auto', detail: 'the CLI decides what is safe to run unattended' },
    { id: 'manual', label: 'manual', detail: 'asks for every action' },
    { id: 'dontAsk', label: 'dontAsk', detail: 'stops instead of asking when it would need permission' },
    { id: 'bypassPermissions', label: '⚠ bypassPermissions', detail: 'EVERY action auto-approved — no prompts at all' }
];

/** The host's own EFFORT_CHOICES (M-18) — same rule: never a copy in the page. */
const EFFORTS = [
    { id: '', label: 'Default', detail: 'no --effort flag — the CLI decides' },
    { id: 'low', label: 'low', detail: 'shortest reasoning — cheap, for mechanical work' },
    { id: 'medium', label: 'medium', detail: 'balanced' },
    { id: 'high', label: 'high', detail: 'more reasoning per turn' },
    { id: 'xhigh', label: 'xhigh', detail: 'deep reasoning — slower, pricier' },
    { id: 'max', label: 'max', detail: 'maximum reasoning — the expensive end' }
];

const ENGINES = [
    { id: 'claude', label: 'Claude Code', ready: true, next: null, takesEffort: true },
    { id: 'codex', label: 'Codex', ready: true, next: null, takesEffort: true },
    // ‼️ U-64 — the engine with NO effort setting, on purpose: the member row's
    // effort box has to draw itself dead on this one, and a fixture where every
    // engine takes an effort could never show that.
    { id: 'opencode', label: 'OpenCode', ready: true, next: null, takesEffort: false },
    { id: 'gemini', label: 'Gemini', ready: false, next: 'npm i -g @google/gemini-cli', takesEffort: true },
    { id: 'agy', label: 'Antigravity', ready: true, next: null, takesEffort: true }
];

/** ‼️ U-64 — WHAT EACH ENGINE OFFERS, in the shape `afEngine.js` reads. The
 *  form used to suggest four Claude aliases whatever engine the row was set
 *  to; these rows are what the model box and the effort box now narrow to. */
const ENGINE_MODELS = {
    claude: {
        models: [
            { id: '', label: 'Default', detail: 'no --model flag' },
            { id: 'opus', label: 'opus', detail: 'the deep one' },
            { id: 'sonnet', label: 'sonnet', detail: 'the everyday one' },
            { id: 'haiku', label: 'haiku', detail: 'the cheap one' }
        ],
        efforts: { '': EFFORTS },
        defaultEffort: {},
        source: 'settings',
        note: 'Claude Code — your model aliases.'
    },
    opencode: {
        models: [
            { id: '', label: 'Default', detail: 'no -m flag' },
            { id: 'opencode/grok-code', label: 'Grok Code', detail: 'free tier' },
            { id: 'opencode/nemotron-3.5-lightning-free', label: 'Nemotron 3.5 Lightning', detail: 'free tier' }
        ],
        efforts: {},
        defaultEffort: {},
        source: 'cli',
        note: 'OpenCode — read from the CLI catalog.'
    },
    codex: {
        models: [
            { id: '', label: 'Default', detail: 'no -m flag' },
            { id: 'gpt-5-codex', label: 'gpt-5-codex', detail: '' }
        ],
        efforts: { '': EFFORTS.filter(e => ['', 'low', 'medium', 'high'].includes(e.id)) },
        defaultEffort: { '': 'medium' },
        source: 'cli',
        note: 'Codex — read from the CLI catalog.'
    },
    gemini: { models: [], efforts: {}, defaultEffort: {}, source: 'none', note: 'not fetched' },
    agy: { models: [], efforts: {}, defaultEffort: {}, source: 'none', note: 'not fetched' }
};

const LIMITS = {
    maxRounds: 8, maxTasks: 12, maxCostUSD: 5, maxTokens: 2000000,
    maxMinutes: 120, maxParallel: 2
};

/** One finished-ish run whose team spends all three delegation dimensions. */
const SPEC = {
    id: 'spec1',
    title: 'OpenCode ailesini uçtan uca doğrula',
    goal: 'Run the OpenCode engine through every production path and prove each one with a real run, not a string test.',
    leadAgentId: 'a0', leadAgentName: 'manager', plannerModel: 'opus',
    team: [
        {
            agentId: 'a1', agentName: 'developer', role: 'implements',
            engine: 'opencode', model: 'grok-code', permissionMode: 'acceptEdits'
        },
        { agentId: 'a2', agentName: 'basit', role: 'reviewer', permissionMode: 'plan' }
    ],
    workdir: 'D:\\zone\\dev\\git\\miropharm\\vsc_AgentFarm',
    engine: 'opencode',
    limits: LIMITS, approvalMode: 'each-round', createdAt: 1755300000000
};

const RUN = {
    id: 'run1', specId: 'spec1', status: 'running', plannerSessionId: 'S1',
    startedAt: Date.now() - 41 * 60000,
    totalCostUSD: 1.42, totalTokens: 486000, ledger: [],
    rounds: [
        {
            n: 1, thought: 'Split it: one writes the resume path, one reads it back.',
            action: 'delegate', plannerCostUSD: 0.18, plannerTokens: 21000,
            at: Date.now() - 40 * 60000,
            steps: [
                {
                    id: 's1', round: 1, agentId: 'a1', agentName: 'developer',
                    title: 'wire the resume path', prompt: 'p', status: 'done',
                    costUSD: 0, tokens: 214000, outputFile: 'D:/out/s1.md'
                },
                {
                    id: 's2', round: 1, agentId: 'a2', agentName: 'basit',
                    title: 'read the transcript back', prompt: 'p', readonly: true,
                    status: 'done', costUSD: 0, tokens: 88000
                }
            ]
        },
        {
            n: 2, thought: 'Resume returns the same session id — now prove cancel.',
            action: 'delegate', plannerCostUSD: 0.14, plannerTokens: 19000,
            at: Date.now() - 9 * 60000,
            steps: [
                {
                    id: 's3', round: 2, agentId: 'a1', agentName: 'developer',
                    title: 'cancel stops only its own tree', prompt: 'p', status: 'running',
                    // ‼️ M-18 — what it RAN with and who decided each part. On
                    // the Agent cell, because a row that has to say this out
                    // loud would be four columns wider for a fact most rows do
                    // not need.
                    runNote: 'engine opencode · model grok-code · effort high (agent) · permissions acceptEdits'
                },
                {
                    // ‼️ M-18 — a FAILED step, because "failed" was the same
                    // word for four different situations and the row could not
                    // tell them apart. The class rides next to the status; the
                    // panel carries what was attempted, the original sentence,
                    // the evidence and what to do.
                    id: 's4', round: 2, agentId: 'a2', agentName: 'ghost',
                    title: 'read the cancel transcript', prompt: 'p', status: 'failed',
                    note: 'agent not found',
                    failure: {
                        class: 'agent-missing',
                        attempted: 'delegation to ghost — "read the cancel transcript"',
                        detail: 'no agent named "ghost" is in this fleet',
                        refs: { taskId: 'tk_884' }
                    }
                }
            ]
        }
    ]
};

/**
 * ‼️ U-64 — AN ADAPTIVE RUN, because the classic one above cannot show any of
 * what this item added. Its detail carries seven sections the classic detail
 * has never drawn, and each of them can overflow: a criterion is a sentence, a
 * strategy revision carries its reason, a graph node carries its fan-in.
 */
const ADAPTIVE_SPEC = {
    id: 'spec2', mode: 'adaptive',
    title: 'OpenCode motoru üretime hazır mı',
    goal: 'The OpenCode engine is production-ready on this machine: every path a user can reach works, '
        + 'and each one is proved by a real run rather than by a string test.',
    leadAgentId: 'a0', leadAgentName: 'manager', plannerModel: 'haiku',
    team: [],
    pool: [
        { agentId: 'a1', agentName: 'developer', role: 'runs the paths', engine: 'opencode' },
        { agentId: 'a2', agentName: 'basit', role: 'reads the evidence back', permissionMode: 'plan' }
    ],
    constraints: [
        'Do not modify anything outside src/engines and its tests.',
        'No new dependency without saying why in the run.'
    ],
    successCriteria: [
        { id: 'c1', text: 'A real OpenCode session starts, answers a turn and resumes with the same session id.', required: true },
        { id: 'c2', text: 'The cost the page shows for that session matches what the CLI itself stated.', required: true },
        { id: 'c3', text: 'The resume path is covered by a test that would fail if it regressed.', required: false }
    ],
    autonomy: 'ask-when-unsure',
    engine: 'opencode',
    limits: LIMITS, approvalMode: 'auto', createdAt: 1755300000000
};

const ADAPTIVE_RUN = {
    id: 'run2', specId: 'spec2', status: 'running', plannerSessionId: 'S2',
    startedAt: Date.now() - 62 * 60000,
    totalCostUSD: 2.14, totalTokens: 812000, ledger: [],
    strategy: {
        version: 3, phase: 'verifying', at: Date.now() - 11 * 60000,
        text: 'Prove the three reachable paths one at a time against a real CLI, then have a second agent '
            + 'read the transcripts back rather than trusting the first one\'s own report.'
    },
    roles: [
        {
            agentId: 'a1', agentName: 'developer', brief: 'runs each reachable path against the real CLI',
            engine: 'opencode', model: 'opencode/grok-code', permissionMode: 'acceptEdits',
            boundAt: Date.now() - 58 * 60000
        },
        {
            agentId: 'a2', agentName: 'basit', brief: 'reads the transcripts back and says what they do NOT show',
            permissionMode: 'plan', effort: 'low', boundAt: Date.now() - 30 * 60000
        }
    ],
    evaluations: [
        {
            id: 'e1', targets: ['d1'], evaluator: { kind: 'lead' },
            findings: [
                { criterionId: 'c1', verdict: 'pass', evidence: 'session S-88 resumed with the same id, twice' },
                { criterionId: 'c2', verdict: 'unknown', gap: 'the CLI stated no cost on the resumed turn' }
            ],
            advice: 'revise', note: 'the resume path holds; the price does not answer yet',
            at: Date.now() - 40 * 60000
        },
        {
            id: 'e2', targets: ['d2'], evaluator: { kind: 'agent', agentId: 'a2', agentName: 'basit' },
            findings: [
                { criterionId: 'c2', verdict: 'fail', gap: 'the page reads $0.00 where the CLI printed $0.014' },
                { criterionId: 'c3', verdict: 'unknown', gap: 'no test touches the resume path yet' }
            ],
            advice: 'replan', confidence: 0.8,
            at: Date.now() - 14 * 60000
        }
    ],
    guidance: [
        { id: 'g1', text: 'Do not spend another round on the catalog — the price is the open question.', at: Date.now() - 20 * 60000, appliedAt: Date.now() - 18 * 60000 },
        { id: 'g2', text: 'If the cost cannot be read from the CLI, say so as a failed criterion rather than as unknown.', at: Date.now() - 3 * 60000 }
    ],
    conversations: [
        {
            id: 'c1', objective: 'Is a $0.00 reading a missing price or a free turn?',
            participants: ['a1', 'a2'], messages: 4, open: 1, closed: null
        }
    ],
    councils: [
        {
            id: 'k1', question: 'Is a $0.00 reading a missing price or a free turn?',
            conversation: 'c1', chair: 'a2', members: ['a1', 'a2'],
            turns: 4, maxTurns: 8, votes: 2, exit: null
        }
    ],
    messages: [
        { id: 'm1', conversationId: 'c1', from: 'a1', state: 'said' },
        { id: 'm2', conversationId: 'c1', from: 'a2', state: 'said' },
        { id: 'm3', conversationId: 'c1', from: 'a1', state: 'said' },
        { id: 'm4', conversationId: 'c1', from: 'a2', state: 'failed' }
    ],
    rounds: [
        {
            n: 1, thought: 'Start with the path a user hits first: open a session and answer one turn.',
            action: 'delegate', plannerCostUSD: 0.04, plannerTokens: 9000,
            phase: 'exploring', strategyVersion: 1, at: Date.now() - 60 * 60000,
            steps: [{
                id: 's1', round: 1, agentId: 'a1', agentName: 'developer', title: 'open a session, answer a turn',
                prompt: 'p', status: 'done', criteria: ['c1'], costUSD: 0.4, tokens: 260000,
                outputFile: 'D:/out/s1.md'
            }]
        },
        {
            n: 2, thought: 'The resume held. Now the price — and a second pair of eyes on the transcript.',
            action: 'parallel', plannerCostUSD: 0.06, plannerTokens: 11000,
            phase: 'verifying', strategyVersion: 3, at: Date.now() - 13 * 60000,
            steps: [
                {
                    id: 's2', round: 2, agentId: 'a1', agentName: 'developer', title: 'read the price back off the CLI',
                    prompt: 'p', status: 'running', criteria: ['c2'], sources: ['s1']
                },
                {
                    id: 's3', round: 2, agentId: 'a2', agentName: 'basit', title: 'say what the transcript does NOT show',
                    prompt: 'p', status: 'done', readonly: true, evaluates: true, intent: 'review',
                    criteria: ['c2', 'c3'], sources: ['s1'], tokens: 74000
                }
            ]
        }
    ],
    trace: { file: 'D:/store/missions/run2.jsonl', v: 1, lastSeq: 41 }
};

/** The journal's half of the answer: the reason each strategy version was cut,
 *  and the graph of what actually happened. Neither is in the run record. */
const ADAPTIVE_TRACE = {
    phase: 'verifying', degraded: null,
    strategies: [
        { n: 1, summary: 'Walk the paths in the order a user meets them.', phase: 'exploring', at: Date.now() - 60 * 60000 },
        {
            n: 2, summary: 'Prove each path against a real CLI rather than a fixture.', phase: 'proving',
            reason: 'the first pass proved a mock, which is the failure this objective exists to avoid',
            at: Date.now() - 38 * 60000, sourceAction: 'd2'
        },
        {
            n: 3, summary: 'Prove the three reachable paths one at a time, then have a second agent read the transcripts back.',
            phase: 'verifying',
            reason: 'the runner kept reporting its own work as evidence; an independent reader is the only thing that settles it',
            at: Date.now() - 11 * 60000, sourceAction: 'd3'
        }
    ],
    graph: [
        { id: 'd1', kind: 'decision', status: 'done', actor: 'lead', label: 'open a session and answer one turn', parentRefs: [], inputRefs: [], outputRefs: ['a1'], createdAt: Date.now() - 60 * 60000, phase: 'exploring', strategyVersion: 1 },
        { id: 'a1', kind: 'delegation', status: 'done', actor: 'a1', label: 'developer — open a session, answer a turn', parentRefs: ['d1'], inputRefs: [], outputRefs: [], createdAt: Date.now() - 59 * 60000, settledAt: Date.now() - 44 * 60000, strategyVersion: 1 },
        { id: 'd2', kind: 'decision', status: 'done', actor: 'lead', label: 'the mock proved nothing — go at the real CLI', parentRefs: ['d1'], inputRefs: ['a1'], outputRefs: [], createdAt: Date.now() - 38 * 60000, phase: 'proving', strategyVersion: 2 },
        { id: 'd3', kind: 'decision', status: 'done', actor: 'lead', label: 'add an independent reader', parentRefs: ['d2'], inputRefs: ['a1'], outputRefs: [], createdAt: Date.now() - 11 * 60000, phase: 'verifying', strategyVersion: 3 },
        { id: 'a2', kind: 'delegation', status: 'running', actor: 'a1', label: 'developer — read the price back off the CLI', parentRefs: ['d3'], inputRefs: ['a1'], outputRefs: [], createdAt: Date.now() - 10 * 60000, strategyVersion: 3 },
        { id: 'a3', kind: 'delegation', status: 'done', actor: 'a2', label: 'basit — say what the transcript does NOT show', parentRefs: ['d3'], inputRefs: ['a1'], outputRefs: [], createdAt: Date.now() - 10 * 60000, settledAt: Date.now() - 2 * 60000, strategyVersion: 3 },
        { id: 'g1', kind: 'guidance', status: 'done', actor: 'user', label: 'do not spend another round on the catalog', parentRefs: ['d2'], inputRefs: [], outputRefs: [], createdAt: Date.now() - 20 * 60000, strategyVersion: 2 }
    ]
};

const data = (over) => Object.assign({
    newForm: false,
    specs: [SPEC],
    runs: [RUN],
    agents: AGENTS,
    modelAliases: ['haiku', 'sonnet', 'opus', 'fable', 'grok-code'],
    engines: ENGINES,
    engineModels: ENGINE_MODELS,
    permissions: PERMISSIONS,
    efforts: EFFORTS,
    /** The host's own FAILURE_KINDS (M-18) — the page must never carry a copy,
     *  or the reader and the lead get told different things about one failure. */
    failureKinds: {
        'agent-missing': {
            retry: 'different',
            says: 'That agent is not in this fleet. Name one of the agents you were listed, '
                + 'or drop the step — asking again will fail identically.'
        }
    },
    defaults: LIMITS,
    pending: { questions: [], approvals: [] },
    live: { agents: [], events: [] },
    plannerTranscripts: {},
    traces: {}
}, over || {});

/** Fire a wired handler the way a hand would, through the shim's own listeners. */
const fire = (el, ev) => {
    if (el && el._listeners && el._listeners[ev]) { el._listeners[ev].forEach(fn => fn()); }
};

module.exports = {
    script: 'missions.js',
    data,
    variants: () => [
        {
            // ‼️ The team rows with members PICKED, because an unchecked row
            // draws every control disabled and a disabled select hides exactly
            // the width problem this picture exists to catch.
            id: 'form', label: 'New Mission — team rows with engine + permissions + effort',
            data: data({ newForm: true }),
            act: (r) => {
                const el = (id) => r.sandbox.document.getElementById(id);
                el('f-goal').value = SPEC.goal;
                el('f-lead').value = 'a0';
                el('tm-1').checked = true;
                el('tm-2').checked = true;
                el('rl-1').value = 'implements';
                el('rl-2').value = 'reviewer';
                el('en-1').value = 'opencode';
                el('pm-1').value = 'acceptEdits';
                el('pm-2').value = 'plan';
                el('md-1').value = 'grok-code';
                // ‼️ M-18 — the FIFTH control on the row. This picture exists
                // because each of the others arrived in a commit whose tests
                // read the markup as strings, and a row that wraps passes all
                // of them; a fifth is exactly when it starts to.
                el('ef-1').value = 'high';
                el('ef-2').value = 'low';
                // ticking a member is what re-reads the form and redraws it —
                // the same path a hand takes, so the picture is of real state
                fire(el('tm-1'), 'change');
            }
        },
        {
            // ‼️ U-64 — THE OTHER KIND OF MISSION, with its Advanced fold OPEN.
            // Adaptive adds three repeatable-row blocks above a fold and the
            // whole classic form below it; a picture of the folded state would
            // prove nothing about the case that can actually overflow.
            id: 'form-adaptive', label: 'New Objective — outcome, constraints, criteria + Advanced open',
            data: data({ newForm: true }),
            act: (r) => {
                const el = (id) => r.sandbox.document.getElementById(id);
                fire(el('f-mode-adaptive'), 'click');
                el('f-goal').value = 'The OpenCode engine is production-ready on this machine: every path a user can '
                    + 'reach works, and each one is proved by a real run rather than by a string test.';
                fire(el('cn-add'), 'click');
                el('cn-0').value = 'Do not touch anything outside src/engines and its tests.';
                el('cn-1').value = 'No new dependency without saying why in the run.';
                fire(el('cr-add'), 'click');
                el('cr-0').value = 'A real OpenCode session starts, answers a turn and resumes with the same session id.';
                el('cr-1').value = 'The cost the page shows for that session matches what the CLI itself stated.';
                el('cq-1').checked = false;
                fire(el('f-adv'), 'click');
                el('tm-1').checked = true;
                el('tm-2').checked = true;
                el('rl-1').value = 'runs the paths';
                el('rl-2').value = 'reads the evidence back';
                // ‼️ The member on the engine with NO effort setting — its
                // effort box has to draw itself dead and say which engine
                // decided that, and its model box has to offer OpenCode's
                // catalog rather than the Claude aliases.
                el('en-1').value = 'opencode';
                el('pm-2').value = 'plan';
                fire(el('en-1'), 'change');
            }
        },
        {
            id: 'run', label: 'A running mission, open on its detail',
            data: data({}),
            act: (r) => fire(r.query('.mrow')[0], 'click')
        },
        {
            // ‼️ U-64 — THE ADAPTIVE DETAIL, which is the half of this item that
            // cannot be checked by reading strings: seven sections, three of
            // them tables or timelines, and a run row that has to say which
            // kind it is in one badge.
            id: 'run-adaptive', label: 'An adaptive objective, open on its strategy and its verdicts',
            data: data({
                specs: [ADAPTIVE_SPEC, SPEC],
                runs: [ADAPTIVE_RUN, RUN],
                traces: { run2: ADAPTIVE_TRACE }
            }),
            act: (r) => {
                // the list sorts by recency, so the adaptive run is the SECOND
                // row — targeting index 0 would picture the classic one
                fire(r.query('.mrow')[1], 'click');
                const el = (id) => r.sandbox.document.getElementById(id);
                // every fold open: the picture exists to catch a section that
                // overflows, and a folded one cannot overflow
                ['ev-toggle-run2', 'ca-toggle-run2', 'gr-toggle-run2', 'cv-toggle-run2', 'gd-toggle-run2']
                    .forEach(id => fire(el(id), 'click'));
            }
        }
    ]
};
