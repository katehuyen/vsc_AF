/**
 * The Console with TWO ENGINES ON SCREEN AT ONCE (X-18 / X-19).
 *
 * ‼️ THIS IS THE STATE THE FEATURE EXISTS FOR, AND THE ONE NOBODY HAD DRAWN.
 * One window, two live conversations: a Claude session that reports what each
 * turn cost, and a Codex session that runs against a plan and states no price at
 * all. Every difference between them has to be readable from the cards without
 * opening either — which engine, whether a message typed now steers or is held,
 * and whether the figure on the row is money or tokens.
 *
 * The third engine is deliberately NOT ready: the composer's picker has to show
 * an engine that cannot run here as an offered-but-disabled row carrying the one
 * thing to do about it, and an option nobody can see is an option nobody can
 * check.
 */
const NOW = Date.parse('2026-08-10T14:20:00Z');

const ENGINES = [
    {
        id: 'claude', label: 'Claude Code', ready: true, auth: 'subscription',
        shape: 'persistent', steerable: true, reportsCost: true,
        billing: 'A Claude Pro or Max plan, signed in once in the browser.',
        next: 'Ready, on a plan. Nothing to pay per token and no key to keep.',
        note: 'One long-lived process: a message typed mid-turn steers that turn, and model, '
            + 'effort and permissions can be changed while it runs. It reports what each turn cost.'
    },
    {
        id: 'codex', label: 'Codex', ready: true, auth: 'subscription',
        shape: 'perTurn', steerable: false, reportsCost: false,
        billing: 'A ChatGPT Plus, Pro, Team or Business plan, signed in once in the browser.',
        next: 'Ready, on a plan. Nothing to pay per token and no key to keep.',
        note: 'One process per turn: a message typed mid-turn is HELD until the turn ends, the '
            + 'pickers are the NEXT turn\'s flags, and the permission mode becomes a sandbox chosen '
            + 'up front — this engine cannot stop and ask. It runs on a plan, so it counts tokens '
            + 'and states no price.'
    },
    {
        id: 'gemini', label: 'Gemini', ready: false, auth: 'none',
        shape: 'perTurn', steerable: false, reportsCost: false,
        billing: 'An API key. The "sign in with Google" route this CLI used to have was retired in June 2026.',
        next: 'Put GEMINI_API_KEY in the vault. This engine has no plan sign-in.',
        note: 'One process per turn: a message typed mid-turn is HELD until the turn ends.'
    }
];

const msgs = () => ([
    { id: 'm1', ts: NOW - 90000, role: 'user', text: 'Read note.txt and tell me what is in it.' },
    {
        id: 'm2', ts: NOW - 84000, role: 'tool', kind: 'local',
        tool: { name: 'Bash', detail: 'powershell.exe -Command "Get-ChildItem -Force"' },
        stepTokens: 0
    },
    {
        id: 'm3', ts: NOW - 80000, role: 'toolResult', kind: 'local',
        text: 'Mode Length LastWriteTime Name\n-a---- 26 note.txt'
    },
    { id: 'm4', ts: NOW - 75000, role: 'agent', kind: 'say', text: '`note.txt` contains: “hello from agent farm”.' },
    {
        id: 'm5', ts: NOW - 74000, role: 'result', text: 'done',
        ms: 16400, tokens: 3921, cost: 0
    },
    { id: 'm6', ts: NOW - 20000, role: 'user', text: 'Now count the words in it.' }
]);

/** A session shaped exactly as ConsolePanel.data() builds one. */
const session = (o) => Object.assign({
    id: 'cs1', agentId: 'a-dev', agentName: 'developer', sessionId: '019fe7bc-545c-70d2',
    cwd: 'D:\\zone\\dev\\git\\miropharm\\vsc_AgentFarm', title: 'note.txt okuma turu',
    status: 'idle', cost: 0, turns: 2, queued: [], tokens: 0, wTokens: 0,
    engine: 'claude', engineLabel: 'Claude Code', turnShape: 'persistent',
    steerable: true, reportsCost: true,
    model: '', effort: '', permissionMode: '', contextTokens: 0, lastTs: NOW - 20000,
    turnStartedAt: 0, turnTokens: 0, turnWTokens: 0, turnApiCalls: 0, turnSteps: 0,
    turnThinking: 0, turnCost: 0, turnModel: '', turnEffort: '', lastTurn: null,
    pendingPermission: null, pendingAsk: null, exitReason: '',
    projectId: '', projectName: '', projectIcon: '', messages: []
}, o);

const data = () => ({
    generatedAt: NOW,
    selected: 'cs2',
    presetAgent: '',
    sessions: [
        // ‼️ The Codex one is SELECTED: its composer is what has to be looked at
        // (a held message, next-turn pickers, tokens where the dollars go).
        session({
            id: 'cs2', agentId: 'a-dev', agentName: 'developer',
            sessionId: '019fe859-3b4d-7b03', title: 'ikinci motor turu',
            engine: 'codex', engineLabel: 'Codex', turnShape: 'perTurn',
            steerable: false, reportsCost: false,
            status: 'working', turns: 2, tokens: 46210, wTokens: 46210,
            contextTokens: 28874, turnStartedAt: NOW - 34000,
            turnTokens: 14310, turnWTokens: 14310, turnApiCalls: 3, turnSteps: 7,
            turnThinking: 2, turnCost: 0, turnModel: 'gpt-5.6-terra', turnEffort: 'low',
            model: 'gpt-5.6-terra', effort: 'low', permissionMode: 'acceptEdits',
            queued: ['bir de testleri koştur'],
            projectId: 'prj_9ujsbtzr', projectName: 'Agent Farm', projectIcon: '🚜',
            messages: msgs()
        }),
        session({
            id: 'cs1', tokens: 812000, wTokens: 640000, cost: 0.31, contextTokens: 92000,
            lastTurn: {
                outcome: 'done', ms: 41200, cost: 0.084, tokens: 51200, wTokens: 42100,
                apiCalls: 6, steps: 19, thinking: 4, model: 'claude-opus-5-20260514', effort: 'high'
            }
        }),
        session({
            id: 'cs3', agentName: 'manager', sessionId: '', title: '',
            engine: 'codex', engineLabel: 'Codex', turnShape: 'perTurn',
            steerable: false, reportsCost: false,
            status: 'idle', turns: 0, tokens: 0, lastTs: NOW - 400000
        })
    ],
    agents: [
        { id: 'a-dev', name: 'developer', dir: 'D:\\zone\\agent\\ajanlar\\developer' },
        { id: 'a-mgr', name: 'manager', dir: 'D:\\zone\\agent\\ajanlar\\manager' }
    ],
    models: [
        { id: '', label: 'Default' }, { id: 'haiku', label: 'haiku' },
        { id: 'sonnet', label: 'sonnet' }, { id: 'opus', label: 'opus' },
        { id: 'gpt-5.6-terra', label: 'gpt-5.6-terra' }
    ],
    efforts: [
        { id: '', label: 'Default' }, { id: 'low', label: 'low' },
        { id: 'medium', label: 'medium' }, { id: 'high', label: 'high' }
    ],
    permissions: [
        { id: '', label: 'Default' }, { id: 'plan', label: 'plan' },
        { id: 'acceptEdits', label: 'acceptEdits' },
        { id: 'bypassPermissions', label: '⚠ bypassPermissions' }
    ],
    livePermissions: [
        { id: '', label: 'Default' }, { id: 'plan', label: 'plan' },
        { id: 'acceptEdits', label: 'acceptEdits' }
    ],
    grants: [{ mode: 'acceptEdits', label: 'Allow edits', detail: 'file edits auto-approved' }],
    engines: ENGINES,
    engine: 'codex',
    defaults: { engine: '', model: '', effort: '', permissionMode: '' },
    dropZone: true,
    attachMax: 20,
    owned: [],
    lastWindow: [],
    projects: [{ id: 'prj_9ujsbtzr', name: 'Agent Farm', icon: '🚜', color: '' }],
    activeProjectId: 'prj_9ujsbtzr',
    chipProjectId: 'prj_9ujsbtzr',
    projectContext: '=== AGENT FARM PROJECT CONTEXT ===\nThis session belongs to the project "Agent Farm".',
    pinnedAgent: '',
    resumable: [], resumeTotal: 0, resumeAgents: [], resumeMax: 60,
    resumeDefaultN: 15, resumeFiltered: false
});

/** The composer, with no session selected — the one place the engine PICKER is
 *  drawn, including the row that cannot be chosen. */
const composerData = () => Object.assign(data(), {
    selected: '', sessions: [], chipProjectId: '', projectContext: ''
});

module.exports = {
    script: 'console.js',
    data,
    variants: () => [
        { id: 'console', label: 'Console — two engines at once', data: data() },
        { id: 'console-composer', label: 'Console — the engine picker', data: composerData() }
    ]
};
