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

const ENGINES = [
    { id: 'claude', label: 'Claude Code', ready: true, next: null },
    { id: 'codex', label: 'Codex', ready: true, next: null },
    { id: 'opencode', label: 'OpenCode', ready: true, next: null },
    { id: 'gemini', label: 'Gemini', ready: false, next: 'npm i -g @google/gemini-cli' },
    { id: 'agy', label: 'Antigravity', ready: true, next: null }
];

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
                    title: 'cancel stops only its own tree', prompt: 'p', status: 'running'
                }
            ]
        }
    ]
};

const data = (over) => Object.assign({
    newForm: false,
    specs: [SPEC],
    runs: [RUN],
    agents: AGENTS,
    modelAliases: ['haiku', 'sonnet', 'opus', 'fable', 'grok-code'],
    engines: ENGINES,
    permissions: PERMISSIONS,
    defaults: LIMITS,
    pending: { questions: [], approvals: [] },
    live: { agents: [], events: [] },
    plannerTranscripts: {}
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
            id: 'form', label: 'New Mission — team rows with engine + permissions',
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
                // ticking a member is what re-reads the form and redraws it —
                // the same path a hand takes, so the picture is of real state
                fire(el('tm-1'), 'change');
            }
        },
        {
            id: 'run', label: 'A running mission, open on its detail',
            data: data({}),
            act: (r) => fire(r.query('.mrow')[0], 'click')
        }
    ]
};
