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
        // ‼️ U-59 — the flag names exactly as `engineFlagFor` derives them
        // (measured). Claude abstains: its line is built as a string and never
        // goes through `runArgs`, so the box names no flag rather than another
        // engine's vocabulary wearing Claude's name.
        modelFlag: '', effortFlag: '', takesEffort: true,
        billing: 'A Claude Pro or Max plan, signed in once in the browser.',
        next: 'Ready, on a plan. Nothing to pay per token and no key to keep.',
        note: 'One long-lived process: a message typed mid-turn steers that turn, and model, '
            + 'effort and permissions can be changed while it runs. It reports what each turn cost.'
    },
    {
        id: 'codex', label: 'Codex', ready: true, auth: 'subscription',
        shape: 'perTurn', steerable: false, reportsCost: false,
        // …and Codex's effort is a CONFIG ASSIGNMENT rather than a flag, so
        // there is nothing to put in the parenthesis and none is drawn.
        modelFlag: '-m', effortFlag: '', takesEffort: true,
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
        modelFlag: '-m', effortFlag: '', takesEffort: false,
        billing: 'An API key. The "sign in with Google" route this CLI used to have was retired in June 2026.',
        next: 'Put GEMINI_API_KEY in the vault. This engine has no plan sign-in.',
        note: 'One process per turn: a message typed mid-turn is HELD until the turn ends.'
    },
    {
        // S-60 — the engine that cannot ask: its permission box draws fewer rows.
        id: 'agy', label: 'Antigravity', ready: true, auth: 'app',
        shape: 'perTurn', steerable: false, reportsCost: false,
        modelFlag: '--model', effortFlag: '--effort', takesEffort: true,
        billing: 'The Antigravity app\'s own sign-in.',
        next: 'Ready.',
        note: 'One process per turn. It takes its permissions from the Antigravity app rather than from this box.'
    },
    {
        // ‼️ U-59 — THE THIRD SHAPE, IN THE PICTURE. The composer's tooltips
        // branch on it and the effort box disappears for it, and neither of
        // those was visible in any fixture: a page whose only engines are one
        // persistent and two per-turn cannot show a reviewer that a shared-ACP
        // engine draws four boxes instead of five and says something different
        // about permissions.
        id: 'opencode', label: 'OpenCode', ready: true, auth: 'builtin',
        shape: 'sharedAcp', steerable: false, reportsCost: true,
        modelFlag: '-m', effortFlag: '', takesEffort: false,
        billing: 'No sign-in at all: its own connected provider serves free models. Add a key for the paid ones.',
        next: 'Ready. No credential is needed for its built-in free models.',
        note: 'One shared process carries every OpenCode card at once, each conversation told apart inside it. '
            + 'A message typed mid-turn is HELD until the turn ends — this protocol has no way to speak into a running turn — '
            + 'but the model and the session mode are changed on the live connection at the next turn boundary, '
            + 'Stop asks the engine to stop rather than killing it, and it can genuinely stop and ask you before it acts. '
            + 'It states the price of each turn itself.'
    }
];

const msgs = () => ([
    // ‼️ K-23 — the scrollback BOUNDARY, which is what a resumed long session
    // actually opens on. It has to be in the picture: the row is faded italic
    // commentary and the action inside it must not read as part of the sentence.
    {
        id: 'xh-start', ts: NOW - 95000, role: 'system',
        text: '↑ 940 older message(s) are in the transcript — "Open transcript" has the whole session.',
        more: { older: 940, chunk: 200, stamp: '4.1 MB · 10 Aug 14:02' }
    },
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

/**
 * ‼️ X-152 — THE NEXT SESSION'S SETUP, WHOLE, exactly as `ConsolePanel`
 * pushes it (`composerIntentShown`): every dimension present, `''` for the
 * "Default" row, `superpowers: null` for "the agent's own". The page draws
 * its strip from this and nothing else, so a scene that wants a box to read
 * a value says it HERE.
 */
const intentOf = (o) => Object.assign({
    engine: 'claude', model: '', effort: '', permissionMode: '',
    providerId: '', tier: '', account: '', superpowers: null
}, o || {});

// ‼️ X-112 — THE FIXTURE ASKS THE PRODUCT, IT DOES NOT RETELL IT. A hand-written
// billing block is a second wording of the one rule; a scene built on one
// photographs a page nobody ships.
const { billingOf } = require(require('path').join(__dirname, '..', '..', 'out', 'core', 'billing.js'));
const identity = (v) => Object.assign({
    binding: 'declared', proof: 'launch-declared', scope: 'session',
    reportedProviderIds: [], reportedModels: [], multiProvider: false, turnScope: false,
    billing: billingOf(Object.assign({ engine: 'claude', binding: 'declared' }, v))
}, v);

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
    projectId: '', projectName: '', projectIcon: '', messages: [],
    // X-105 - most cards have no route, and that is the ordinary answer.
    route: null,
    // X-112 - the panel gives every card one; the engine alone already
    // decides the billing when no route was declared.
    identity: null,
    // ‼️ X-213 — and whose sign-in is paying for it. The default is the state
    // the picture has to make ordinary: the machine's own, NAMED, on an engine
    // that could hold another. `accountNext` empty = nothing pending.
    account: '@machine', accountLabel: 'Machine Global',
    accountNext: '', accountNextLabel: '', accountAxis: true, accountRows: []
}, o, o && o.identity === undefined
    ? { identity: identity({ engine: (o && o.engine) || 'claude', providerId: '' }) } : {});

const data = () => ({
    generatedAt: NOW,
    selected: 'cs2',
    sessions: [
        // ‼️ The Codex one is SELECTED: its composer is what has to be looked at
        // (a held message, next-turn pickers, tokens where the dollars go).
        session({
            id: 'cs2', agentId: 'a-dev', agentName: 'developer',
            sessionId: '019fe859-3b4d-7b03', title: 'ikinci motor turu',
            engine: 'codex', engineLabel: 'Codex', turnShape: 'perTurn',
            steerable: false, reportsCost: false,
            status: 'working', turns: 2, tokens: 46210, wTokens: 46210,
            // ‼️ X-43 — the Codex card is the one that showed the bug, so the
            // fixture carries the whole reading: what the window holds, the
            // capacity that session reports (its OWN 258 400, not the model's
            // published ceiling) and where the figure was read. `tokens` above
            // is the spend and is deliberately a different number.
            contextTokens: 28874, contextWindowTokens: 258400, contextWindowSource: 'engine',
            contextSource: 'rollout-last-token-usage', contextMeasuredAt: NOW - 4000,
            turnStartedAt: NOW - 34000,
            turnTokens: 14310, turnWTokens: 14310, turnApiCalls: 3, turnSteps: 7,
            turnThinking: 2, turnCost: 0, turnModel: 'gpt-5.6-terra', turnEffort: 'low',
            model: 'gpt-5.6-terra', effort: 'low', permissionMode: 'acceptEdits',
            queued: ['bir de testleri koştur'],
            projectId: 'prj_9ujsbtzr', projectName: 'Agent Farm', projectIcon: '🚜',
            // K-35 — the user's own colour on this session. Two of the three
            // cards carry one and the third cannot (no session id yet), which
            // is the whole of what the picture has to answer.
            color: '#3d8bfd',
            messages: msgs()
        }),
        session({
            id: 'cs1', tokens: 812000, wTokens: 640000, cost: 0.31, contextTokens: 92000,
            // ‼️ X-113 - a Claude card with a bare `ctx 92.0k` and no ceiling
            // is a state the host can no longer produce: Claude states no
            // window, and the model table answers for it. The picture kept
            // certifying the defect.
            contextWindowTokens: 1000000, contextWindowSource: 'model',
            color: '#e05252',
            lastTurn: {
                outcome: 'done', ms: 41200, cost: 0.084, tokens: 51200, wTokens: 42100,
                apiCalls: 6, steps: 19, thinking: 4, model: 'claude-opus-5-20260514', effort: 'high'
            }
        }),
        // X-105 - THE ROUTED CARD. A still page with no route on it would
        // photograph none of this: the mark is drawn only when there is one,
        // so the scene has to contain the case it exists for.
        session({
            id: 'cs4', agentName: 'developer', sessionId: '019fe860-11aa-4c02',
            title: 'Kimi rotasinda tur', status: 'idle', turns: 1, tokens: 12800,
            wTokens: 9400, cost: 0.42, lastTs: NOW - 300000,
            identity: identity({
                providerId: 'kimi', providerLabel: 'Kimi', origin: 'agent-farm-profile',
                route: { baseUrl: 'https://api.moonshot.ai/anthropic', authKind: 'api-key' }
            }),
            route: {
                id: 'kimi', shape: 'kimi', label: 'Kimi', noun: 'Route', tier: 'sonnet',
                baseUrl: 'https://api.moonshot.ai/anthropic', authKind: 'apiKey',
                scopeNote: 'fixed for the session - a different route is a different program, so a resume across one forks'
            }
        }),
        // X-105 - AND THE CARD THAT MOVED. On the engine that qualifies a model
        // (provider/model) a mid-session model change moves the provider, and
        // the pill then names a DIFFERENT one from the launch record. Drawn only
        // in that state, so the scene has to contain it or the difference
        // between the two pills is photographed by nobody.
        session({
            id: 'cs5', agentName: 'gozcu', sessionId: 'ses_7c31f0aa',
            engine: 'opencode', engineLabel: 'OpenCode', turnShape: 'sharedAcp',
            reportsCost: false, model: 'anthropic/claude-opus-5',
            title: 'Saglayici tur sinirinda degisti', status: 'idle', turns: 4,
            tokens: 48200, wTokens: 31700, lastTs: NOW - 200000,
            identity: identity({
                engine: 'opencode', providerId: 'anthropic', providerLabel: 'anthropic',
                origin: 'engine-native', scope: 'turn'
            }),
            route: {
                id: 'opencode', shape: 'opencode', label: 'opencode', noun: 'Provider',
                now: { id: 'anthropic', label: 'anthropic' },
                // X-105 - the REPORTED half. The change landed at the boundary
                // and the next turn has not run yet, so the engine's own events
                // still name the provider that served turn 4. Two true
                // statements about one card, which is the state the pair exists
                // for and the one a still picture has to contain.
                lastTurn: { id: 'opencode', label: 'opencode' },
                scopeNote: 'the engine may change this at a turn boundary, and records it as a new turn identity'
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
        // X-133 — the per-agent default rides on the agent's own row: the page
        // resolves the switch against whichever agent the picker is showing.
        // X-152 — the memory and the Settings layer no longer ride on the row:
        // the host reads both when the engine moves and pushes the record.
        { id: 'a-dev', name: 'developer', dir: 'D:\\zone\\agent\\ajanlar\\developer', superpowers: true },
        { id: 'a-mgr', name: 'manager', dir: 'D:\\zone\\agent\\ajanlar\\manager', superpowers: false }
    ],
    // The flat pair is the pre-engine FALLBACK, so it stays Claude's own.
    models: [
        { id: '', label: 'Default' }, { id: 'haiku', label: 'haiku' },
        { id: 'sonnet', label: 'sonnet' }, { id: 'opus', label: 'opus' }
    ],
    efforts: [
        { id: '', label: 'Default' }, { id: 'low', label: 'low' },
        { id: 'medium', label: 'medium' }, { id: 'high', label: 'high' }
    ],
    // S-20 — what each engine is offering TODAY. Drawn so the picture answers
    // the question the item asked: with Codex in play, is the model box showing
    // Codex's models or Claude's aliases?
    engineModels: {
        claude: {
            models: [
                { id: '', label: 'Default' }, { id: 'haiku', label: 'haiku' },
                { id: 'sonnet', label: 'sonnet' }, { id: 'opus', label: 'opus' },
                { id: 'claude-fable-5[1m]', label: 'Fable', detail: 'Most capable for your hardest tasks' }
            ],
            efforts: { '': [{ id: '', label: 'Default' }, { id: 'low', label: 'low' }, { id: 'high', label: 'high' }] },
            defaultEffort: {}, source: 'catalog',
            note: 'Your aliases plus 1 model Claude Code has recorded for this account.'
        },
        codex: {
            models: [
                { id: '', label: 'Default' },
                { id: 'gpt-5.6-sol', label: 'GPT-5.6-Sol', detail: 'Latest frontier agentic coding model. · gpt-5.6-sol' },
                { id: 'gpt-5.6-terra', label: 'GPT-5.6-Terra', detail: 'Balanced agentic coding model for everyday work. · gpt-5.6-terra' },
                { id: 'gpt-5.6-luna', label: 'GPT-5.6-Luna', detail: 'Fast and affordable agentic coding model. · gpt-5.6-luna' },
                { id: 'gpt-5.5', label: 'GPT-5.5', detail: 'Frontier model for complex coding. · gpt-5.5' },
                { id: 'gpt-5.4', label: 'GPT-5.4', detail: 'Strong model for everyday coding. · gpt-5.4' },
                { id: 'gpt-5.4-mini', label: 'GPT-5.4-Mini', detail: 'Small, fast and cost-efficient. · gpt-5.4-mini' }
            ],
            efforts: {
                '': [{ id: '', label: 'Default' }, { id: 'low', label: 'low' }, { id: 'high', label: 'high' }],
                'gpt-5.6-terra': [
                    { id: '', label: 'Default' }, { id: 'low', label: 'low' }, { id: 'medium', label: 'medium' },
                    { id: 'high', label: 'high' }, { id: 'xhigh', label: 'xhigh' },
                    { id: 'max', label: 'max' }, { id: 'ultra', label: 'ultra' }
                ]
            },
            defaultEffort: { 'gpt-5.6-terra': 'medium' }, source: 'catalog',
            note: '6 models, read from Codex\'s own catalog — the same rows its /model offers. Refreshed today.'
        },
        gemini: {
            models: [{ id: '', label: 'Default' }, { id: 'sonnet', label: 'sonnet' }],
            efforts: {}, defaultEffort: {}, source: 'settings',
            note: 'This engine states no model catalog.'
        },
        opencode: {
            models: [
                { id: '', label: 'Default' },
                { id: 'opencode/big-pickle', label: 'Big Pickle', detail: 'opencode/big-pickle' },
                { id: 'opencode/grok-code-free', label: 'Grok Code (free)', detail: 'opencode/grok-code-free' },
                { id: 'opencode/qwen3-coder-free', label: 'Qwen3 Coder (free)', detail: 'opencode/qwen3-coder-free' }
            ],
            // ‼️ NO EFFORT VOCABULARY AT ALL — the measured answer, and the one
            // the picture has to show: this engine gets no effort box.
            efforts: { '': [] }, defaultEffort: {}, source: 'catalog',
            note: '3 models, as OpenCode itself listed them when the session opened — the handshake hands the '
                + 'whole catalog over, so nothing is spawned to ask. This engine has no reasoning-effort setting '
                + 'to go with them. Refreshed today.'
        }
    },
    permissions: [
        { id: '', label: 'Default' }, { id: 'plan', label: 'plan' },
        { id: 'acceptEdits', label: 'acceptEdits' },
        { id: 'manual', label: 'manual', detail: 'asks for every action' },
        { id: 'dontAsk', label: 'dontAsk', detail: 'stops instead of asking' },
        { id: 'bypassPermissions', label: '⚠ bypassPermissions' }
    ],
    // S-60 — the rows an engine can keep, where they differ (the host derives
    // this from the engine's own rule; the fixture states the shape).
    permissionsByEngine: {
        agy: [
            { id: '', label: 'Default', detail: 'no flag — whatever the Antigravity app allows' },
            { id: 'plan', label: 'plan', detail: 'asked to plan — steering, not a restraint' },
            { id: 'acceptEdits', label: 'acceptEdits' },
            { id: 'bypassPermissions', label: '⚠ bypassPermissions' }
        ]
    },
    livePermissions: [
        { id: '', label: 'Default' }, { id: 'plan', label: 'plan' },
        { id: 'acceptEdits', label: 'acceptEdits' }
    ],
    grants: [{ mode: 'acceptEdits', label: 'Allow edits', detail: 'file edits auto-approved' }],
    engines: ENGINES,
    composerIntent: intentOf({ engine: 'codex', account: 'work-1' }),
    composerAgent: '',
    /**
     * ‼️ X-263 — THE ACCOUNT BOX, so it can actually be LOOKED AT.
     *
     * The composer's account picker had never been drawn in the looking glass:
     * no fixture carried a sign-in, so the box was skipped ("a picker with no
     * referent draws nothing") and every change to it shipped blind. These three
     * rows are the three states the box has to survive — a measured standing
     * choice, a slot nobody has read a figure for, and one whose sign-in has
     * fallen over — which is also the widest label the box will ever hold.
     */
    composerAccountAxis: true,
    composerAccounts: [
        { id: 'work-1', label: 'murvietnam-2', health: 'ready', active: true,
            percent: 91, resetsAt: Date.now() + 42 * 60000 },
        { id: 'spare', label: 'aicozums', health: 'ready', active: false, percent: -1 },
        { id: 'old', label: 'claude-murvietnam', health: 'needs-signin', active: false,
            percent: 12, resetsAt: Date.now() + 3 * 3600000 }
    ],
    dropZone: true,
    attachMax: 20,
    owned: [],
    // K-35 — the ten fixed swatches, exactly as ConsolePanel sends them
    // (core/sessionmarks.ts owns the list; the page never writes one of its own).
    sessionColors: [
        '#e05252', '#e08a3c', '#d9b310', '#5fb85f', '#2eb6b6',
        '#3d8bfd', '#8b6ddb', '#d15fa8', '#9c7a5c', '#8a94a6'
    ],
    lastWindow: [{
        sessionId: '019fe4aa-1c2d-70f1', agentName: 'manager', title: 'kota raporu',
        cwd: 'D:\\zone\\agent\\ajanlar\\manager', endedAt: NOW - 3 * 3600000, color: '#5fb85f'
    }],
    projects: [{ id: 'prj_9ujsbtzr', name: 'Agent Farm', icon: '🚜', color: '' }],
    activeProjectId: 'prj_9ujsbtzr',
    chipProjectId: 'prj_9ujsbtzr',
    projectContext: '=== AGENT FARM PROJECT CONTEXT ===\nThis session belongs to the project "Agent Farm".',
    // X-133 — the OTHER half of the same appended system prompt: what this
    // session is told ABOUT, and how it is expected to WORK.
    superpowersOn: true,
    superpowersText: '# Superpowers — engineering discipline\n\nInvoke the relevant skill BEFORE any response.\n\n## The skills, and where they are\n\n- **test-driven-development** — Use when writing any code: RED, GREEN, REFACTOR\n- **systematic-debugging** — Use when something is broken: find the root cause',
    superpowersHealth: { usable: true, why: '', skills: 14 },
    pinnedAgent: '',
    resumable: [], resumeTotal: 0, resumeAgents: [], resumeMax: 60,
    resumeDefaultN: 15, resumeFiltered: false
});

/**
 * ‼️ K-42 (round 2) — THE RESUME LIST HAD NEVER BEEN DRAWN IN ANY SCENE.
 * `resumable` was `[]` everywhere, so the measured guard that holds "a card's
 * badge sits on its header line and inside its card" was reading live cards
 * only — and the defect the user reported is on the PASSIVE ones: a long title
 * pushed the engine pill out through the right edge of the 250px column.
 *
 * The variable on these rows is the TITLE, so the scene carries its arities:
 * one that fits, one that does not, and the worst case — a pinned title with
 * no space in it to break at, beside the widest engine pill.
 */
const resumeRow = (o) => Object.assign({
    sessionId: '019fe000-0000-0000-0000-000000000000', title: '', agentName: 'developer',
    engine: 'claude', cwd: 'D:\\zone\\dev\\git\\miropharm\\vsc_AgentFarm', pinned: false,
    ts: NOW - 3600000, cost: 0.12, color: '', tokens: 184000, wTokens: 151000,
    contextTokens: 96000, contextWindowTokens: 1000000, contextWindowSource: 'model',
    contextSource: 'transcript-last-call',
    firstPrompt: 'devir notunu okuyup kaldığın yerden devam et', startedAt: NOW - 5 * 3600000,
    turns: 14, tools: 63, errors: 0, models: ['claude-opus-5'], tags: [],
    identity: null
}, o, o && o.identity === undefined
    ? { identity: identity({ engine: (o && o.engine) || 'claude', providerId: '' }) } : {});

const RESUME_ROWS = [
    resumeRow({ sessionId: '019fe511-aa01-70f1-9c02-1a2b3c4d5e6f', title: 'kota raporu', turns: 3 }),
    resumeRow({
        sessionId: '019fe512-bb02-70f1-9c02-1a2b3c4d5e6f',
        title: 'K-42 konsol sol panel oturum kartları sabit satır mimarisi ve rozet yerleşimi',
        agentName: 'developer', engine: 'codex', color: '#3d8bfd'
    }),
    resumeRow({
        sessionId: '019fe513-cc03-70f1-9c02-1a2b3c4d5e6f',
        title: 'Sağlayıcı-kimliği-omurgası-çok-motorlu-rota-ve-hesap-çözünürlüğü-tek-parça-başlık',
        agentName: 'gozcu', engine: 'opencode', pinned: true, tokens: 912000, wTokens: 740000,
        contextTokens: 412000, turns: 41, tools: 210, errors: 2,
        identity: identity({
            engine: 'opencode', providerId: 'anthropic', providerLabel: 'anthropic',
            origin: 'engine-native', scope: 'turn'
        })
    })
];

/** The resume list open, with rows on it — the passive half of the card list. */
const resumeData = () => Object.assign(data(), {
    resumable: RESUME_ROWS, resumeTotal: 128,
    resumeAgents: ['developer', 'gozcu', 'manager'],
    owned: ['019fe511-aa01-70f1-9c02-1a2b3c4d5e6f']
});

/** The composer, with no session selected — the one place the engine PICKER is
 *  drawn, including the row that cannot be chosen. */
const composerData = () => Object.assign(data(), {
    selected: '', sessions: [], chipProjectId: '', projectContext: '',
    // In composer mode the switch is a CHOICE, and untouched it follows the
    // agent the picker is showing rather than any answer of its own.
    superpowersOn: undefined
});

/** ‼️ X-133 — the same composer with the skills folder UNABLE to supply the
 *  hook. The switch cannot be honoured at all, and the picture is the proof
 *  that it says so instead of looking merely unticked: an unticked box would be
 *  a lie about why nothing is being added. */
const noSkillsData = () => Object.assign(composerData(), {
    superpowersHealth: {
        usable: false, skills: 0,
        why: 'using-superpowers\\SKILL.md is missing — that file IS the hook; without it there is nothing to put in front of a model.'
    }
});

/**
 * ‼️ S-34 — THE COMPOSER OPENED ON WHAT THIS AGENT LAST RAN AS.
 *
 * The picture is the whole point of the item: five boxes that used to read
 * "Default · Default · Default" for an agent that has been running on opus at
 * high effort in plan mode all week. `composerSeed` is what makes the page read
 * the handed-over setup (K-34's edge), so a fixture without it draws the
 * defaults and proves nothing.
 */
const rememberedComposerData = () => Object.assign(composerData(), {
    // ‼️ THE ENGINE IS PART OF THE RECORD, and it has to agree with the model in
    // the picture: `ConsolePanel.show` seeds both from the SAME record and
    // narrows the model by the engine (X-152). A fixture that remembered
    // `opus` on Codex would draw "Default" and look like the bug this item fixes.
    composerSeed: 1,
    composerIntent: intentOf({
        engine: 'claude', model: 'opus', effort: 'high', permissionMode: 'plan',
        account: 'work-1', superpowers: true
    }),
    composerAgent: 'a-dev'
});

/** S-82 — the composer with ⑂ Relay on: its chip names the pool (the Account box's rule) and the max-legs box the setting. */
const relayComposerData = (account) => Object.assign(composerData(), {
    composerIntent: intentOf({ engine: 'claude', account, baton: true, batonMaxHops: '' }),
    composerAgent: 'a-dev',
    batonMaxLegs: 6
});

/** ‼️ U-59 — the same composer with the SHARED-ACP engine chosen, which is the
 *  only state in which the effort box is absent and the permission tooltip says
 *  the engine can stop and ask. Five boxes become four; that is the picture. */
const opencodeComposerData = () => Object.assign(composerData(), {
    composerIntent: intentOf({ engine: 'opencode', account: 'work-1' })
});
/** S-60 — the composer with Antigravity chosen: the permission box draws only
 *  the rows that engine can keep — no `manual`, no `dontAsk`. */
const agyComposerData = () => Object.assign(composerData(), {
    composerIntent: intentOf({ engine: 'agy', account: 'work-1' })
});

/**
 * ‼️ X-105 — THE COMPOSER WITH A ROUTE PICKED, which is the only state the two
 * new boxes exist in.
 *
 * A picture of a composer with no route set up shows none of this change: the
 * boxes are drawn only where the engine HAS the axis and something is actually
 * configured, which is the rule that keeps the row unchanged for everybody who
 * has never made a route. So the fixture makes one, picks it, and answers with
 * the tiers under it — that is the whole of what a reader has to look at: two
 * more controls in a row measured at nowrap, and whether they still fit.
 */
const routedComposerData = () => Object.assign(composerData(), {
    composerIntent: intentOf({ engine: 'claude', providerId: 'kimi', tier: 'opus', account: 'work-1' }),
    composerForm: {
        engine: 'claude', applies: true, noun: 'Route', scope: 'session',
        scopeNote: 'a route is fixed for the whole session on this engine',
        providers: [
            { id: '', label: 'Default', detail: 'this window\'s own environment — nothing injected, nothing cleared' },
            { id: 'kimi', label: 'Kimi', detail: 'https://api.moonshot.ai/anthropic' },
            { id: 'minimax', label: 'MiniMax', detail: 'https://api.minimax.io/anthropic' }
        ],
        sub: {
            kind: 'tier', label: 'Tier',
            note: 'which model "Kimi" serves — the route decides, not the name',
            choices: [
                { id: '', label: 'Default', detail: 'the route\'s own choice' },
                { id: 'opus', label: 'opus', detail: 'kimi serves kimi-k2-thinking for "opus"' },
                { id: 'sonnet', label: 'sonnet', detail: 'kimi serves kimi-k2-turbo for "sonnet"' }
            ]
        },
        variants: [],
        variantsWhy: 'a hosted card is spoken to over ACP, which declares only model and mode',
        // ‼️ X-113 - THE REFUSAL, ON THE SCENE WHERE THE ROUTE IS PICKED. The
        // adapter has answered this since X-99 and no picture had ever drawn it,
        // because no surface asked. A key that is not stored is the refusal that
        // matters most here: the run reaches a stranger's endpoint and the error
        // a person then reads is about authentication rather than about the
        // profile with nothing in it.
        refusals: [
            '"Kimi (work)" has no stored key, so a run on it would reach '
                + 'https://api.moonshot.ai/anthropic unauthenticated.'
        ]
    }
});

/**
 * ‼️ X-169 — THE SAME COMPOSER WITH THREE SIGN-INS CAPTURED, which is the state
 * this whole family exists for: a person rotating plans has to see whose one the
 * next session will spend BEFORE they press Send, and the row is already eight
 * pickers wide. The picture is the only thing that says whether a ninth fits.
 *
 * One slot is deliberately not `ready`: a token that has fallen over is a fact
 * the reader needs before they start, and it has to be visible as a WARNING
 * rather than as a row that merely reads slightly differently.
 */
const accountComposerData = () => Object.assign(routedComposerData(), {
    composerAccounts: [
        { id: 'work-1', label: 'work@studio', health: 'ready', active: true, percent: 91 },
        { id: 'personal', label: 'personal@gmail', health: 'ready', active: false, percent: 12 },
        { id: 'spare', label: 'spare@gmail', health: 'needs-signin', active: false, percent: -1 }
    ],
    /**
     * ‼️ X-305 — AND THE RULES, or the two groups ship unphotographed.
     *
     * The box now offers two KINDS of answer under two headings, and a fixture
     * with no rules takes the flat branch — so the grouped drawing, which is
     * the whole page half of this item, would never be in a picture.
     *
     * Four rows, because they are the four shapes the group has to survive: a
     * rule that comes to a slot, one that comes to the MAIN sign-in (no slot at
     * all), one that can choose NOTHING right now (the label says so where a
     * slot name would be), and one of the user's own with a name of its own.
     */
    composerPolicies: [
        { id: '@emptiest', label: '@emptiest', picks: 'personal@gmail', refusal: '',
            note: 'personal@gmail — @emptiest: the claude sign-in with the most room right now '
                + '(12% of its five-hour window); next would be work@studio (91%).',
            detail: 'The sign-in of this engine with the most of its five-hour window left at '
                + 'the moment the session starts. A measured account beats an unread one; '
                + 'anything at or past the ceiling is out.' },
        { id: '@standing', label: '@standing', picks: 'Main account', refusal: '',
            note: 'the main sign-in — @standing: nothing is set for this agent and nothing '
                + 'standing for claude, so nothing is injected.',
            detail: 'This agent’s own standing sign-in, else the machine-wide "use this '
                + 'next", else the main sign-in.' },
        { id: '@pool', label: '@pool', picks: '', note: '',
            refusal: '@pool: no sentry campaign pool is running on this machine — pick '
                + '@emptiest, a named rule, or an account.',
            detail: 'The next account with room in the running sentry campaign’s pool, '
                + 'walked the way the campaign walks it.' },
        { id: '@Night', label: '@Night', picks: 'work@studio', refusal: '',
            note: 'work@studio — @Night step 2 of 3 (91% of its five-hour window, wall 95%).',
            detail: 'Spare first, then the big plan, then whatever has room.' }
    ],
    composerIntent: intentOf({ engine: 'claude', providerId: 'kimi', tier: 'opus', account: 'personal' }),
    // ‼️ X-213 — the axis is a fact about the ENGINE, so it is stated rather
    // than inferred from the length of the list above.
    composerAccountAxis: true
});

/**
 * ‼️ X-305 — THE STATE THE READER HAS TO LEARN TO RECOGNISE: a RULE is what the
 * box is set to, not a sign-in.
 *
 * The scene above has a slot picked and could be drawn before this item existed.
 * This one is the new thing and it is the one that can go wrong in a picture:
 * the closed box has to read `@emptiest → personal@gmail` — the rule AND what it
 * comes to — in a strip that is already eight pickers wide. A box that clipped
 * to `@emptiest` would hide the plan about to be spent; one that clipped to the
 * slot would hide that the answer moves at the next launch. Only the photograph
 * says which half survives.
 */
const policyComposerData = () => Object.assign(accountComposerData(), {
    composerIntent: intentOf({
        engine: 'claude', providerId: 'kimi', tier: 'opus', account: '@emptiest'
    })
});

/**
 * ‼️ X-213 — THE STATE THAT USED TO LIE: an engine that can hold a second
 * sign-in, and nothing captured for it yet.
 *
 * The box was hidden here, so the one machine with no answer on file was the
 * one machine that was told nothing — while every session ran on the identity
 * it happens to be signed in as. The picture has to show the box present, with
 * the machine's own sign-in NAMED and selected.
 */
const machineGlobalComposerData = () => Object.assign(routedComposerData(), {
    composerAccounts: [],
    composerIntent: intentOf({ engine: 'claude', providerId: 'kimi', tier: 'opus', account: '@machine' }),
    composerAccountAxis: true
});

/**
 * ‼️ X-177 — THE SENTRY STRIP, WHICH IS THE ONE THING ON THIS PAGE NOBODY IS
 * WATCHING WHEN IT MATTERS.
 *
 * It is drawn for a night that already happened: a campaign seven rounds in,
 * running unattended on the second sign-in with a third of that window spent.
 * Everything the strip claims has to be readable in the picture at the width
 * the header sets — the state in one word, who is working, which account, what
 * is LEFT of it, and what the next round is already holding.
 */
const CAMPAIGN = {
    id: 'sc-1', project: 'prj_9ujsbtzr', agent: 'dev', status: 'running', rounds: 7,
    engine: 'claude', permissionMode: 'bypassPermissions', superpowers: true,
    startedAt: NOW - 6 * 3600 * 1000, lastAction: 'start', lastRule: 'has-room',
    lastAt: NOW - 12 * 60 * 1000,
    lastWhy: 'slot-2 has the most room left, so X-178 starts there'
};
const sentryData = () => Object.assign(data(), {
    sentry: {
        campaign: CAMPAIGN, running: true, rotatesAccounts: true,
        failLimit: 3, failStreak: 0, idlePollMin: 10,
        projectName: 'AgentFarm', agentName: 'developer',
        nextWords: null,
        live: {
            id: 't9', title: 'Sentry R7 · X-178', status: 'running',
            startedAt: NOW - 12 * 60 * 1000, account: 'slot-2',
            accountPercent: 38, accountResetsAt: NOW + 2 * 3600 * 1000
        },
        // ‼️ X-195 — the round on the board, WITH the account of why it opened
        // on the words it did. The strip's panel draws the last of these; a
        // campaign sentence alone is the PLAN and says nothing about the round.
        rounds: [{
            id: 't9', title: 'Sentry R7 · X-178', status: 'running',
            createdAt: NOW - 12 * 60 * 1000, endedAt: null, account: 'slot-2',
            whyMark: 'L',
            why: {
                path: 'leader', fired: ['round.barren is true', 'repo.dirty is more than 0'],
                problems: [], outcome: 'barren',
                handover: { found: true, source: 'vault', path: '00_OUTPUT/01_CEVAPLAR/2026-09-05_devir_07_bf9a77b6.md', score: 92 },
                opening: 'The last round changed nothing. Before taking X-178, find out why.',
                assist: { model: 'claude-sonnet-5', ms: 26800, costUsd: 0.18, at: NOW - 12 * 60 * 1000, ok: true },
                why: 'two rounds in a row left the tree dirty and produced no commit — the leader took it in hand'
            }
        }],
        defaults: { ceiling: 95, safetyBufferMin: 3, failLimit: 3 }
    }
});
/**
 * ‼️ …AND THE STATE THE WHOLE ITEM EXISTS FOR: every account is walled, so
 * nothing is running and nothing is wrong. The strip has to say when it wakes,
 * why it is waiting IN THE CAMPAIGN'S OWN WORDS, and that the round it will
 * open is already holding its sentence — otherwise a reader at midnight cannot
 * tell a sleeping campaign from a broken one.
 */
const sentryAsleepData = () => Object.assign(data(), {
    sentry: {
        campaign: {
            ...CAMPAIGN, rounds: 9, lastAction: 'sleep', lastRule: 'wait-for-reset',
            wakeAt: NOW + 3 * 3600 * 1000 + 3 * 60 * 1000,
            lastWhy: 'every account is at or above 95% of its five-hour window — sleeping until '
                + 'the earliest reset plus 3 minutes of safety'
        },
        running: false, rotatesAccounts: true, failLimit: 3, failStreak: 0, idlePollMin: 10,
        projectName: 'AgentFarm', agentName: 'developer', live: null,
        nextWords: {
            code: 'X-178', at: NOW - 40 * 60 * 1000,
            prompt: 'The previous session finished its work: X-177. Nothing is outstanding.\n\n'
                + 'Take the next item on AgentFarm: X-178 — NOBET BEKCISI (effort S).'
        },
        rounds: [], defaults: { ceiling: 95, safetyBufferMin: 3, failLimit: 3 }
    }
});

/** …and the state the strip was ASKED for: what happened while nobody looked. */
const sentryStoppedData = () => Object.assign(data(), {
    sentry: {
        campaign: {
            ...CAMPAIGN, status: 'stopped', stoppedAt: NOW - 3 * 3600 * 1000, rounds: 11,
            lastAction: 'stopped', lastRule: 'fail-streak',
            stoppedWhy: '3 rounds in a row produced nothing — the campaign stops rather than '
                + 'opening more empty sessions.'
        },
        running: false, rotatesAccounts: true, failLimit: 3, failStreak: 3, idlePollMin: 10,
        projectName: 'AgentFarm', agentName: 'developer', nextWords: null, live: null,
        rounds: [], defaults: { ceiling: 95, safetyBufferMin: 3, failLimit: 3 }
    }
});

/**
 * ‼️ THE CARD THAT HOLDS THE TURN, WHICH HAD NEVER BEEN DRAWN.
 *
 * Every other state of this panel has a picture and this one — the only thing
 * on the page that stops a running session dead — did not, because the fixture
 * left `pendingAsk` null everywhere. Four questions with described options is
 * the shape that gave the card its ceiling and its scroller (and, with U-133,
 * its fold): it is exactly the case where the card takes half the window and
 * buries the paragraphs the questions are ABOUT.
 */
const askingData = () => {
    const d = data();
    d.sessions = d.sessions.map(s => (s.id !== 'cs2' ? s : Object.assign({}, s, {
        status: 'working',
        pendingAsk: {
            requestId: 'ask-1',
            tool: 'AskUserQuestion',
            displayName: 'AskUserQuestion',
            questions: [
                {
                    question: 'Hangi hesapla devam edelim?', header: 'Hesap', multiSelect: false,
                    options: [
                        { label: 'work@studio', description: 'max20x — five-hour window 91% gone' },
                        { label: 'personal@gmail', description: 'pro — 12% gone, resets at 05:40' }
                    ]
                },
                {
                    question: 'Which of these should the run touch?', header: 'Scope', multiSelect: true,
                    options: [
                        { label: 'the panel', description: 'media/console.js and its page tests' },
                        { label: 'the core', description: 'src/core/consoleproto.ts' },
                        { label: 'the bridge', description: 'a new op and its dispatch test' }
                    ]
                },
                {
                    question: 'How far should it go before checking back?', header: 'Leash', multiSelect: false,
                    options: [
                        { label: 'one step', description: 'stop after the first green test' },
                        { label: 'the whole item', description: 'package and install, then report' }
                    ]
                },
                {
                    question: 'What happens if the quota wall is hit halfway?', header: 'Wall', multiSelect: false,
                    options: [
                        { label: 'hand over', description: 'write the letter and stop' },
                        { label: 'wait it out', description: 'sleep until the window turns over' }
                    ]
                }
            ]
        }
    })));
    return d;
};

/**
 * ‼️ U-133 — ONE QUESTION, WHICH IS THE ARITY THE CARD IS USUALLY IN.
 *
 * The scene above asks four, and four is the one shape where the old header
 * layout came out right: the answered count is only drawn when there is more
 * than one question, and the count was what pushed the right-hand end of the
 * row to the right. So every picture ever taken of this card showed the fold
 * control neatly in the corner, while the card the user actually gets put it
 * mid-row, straight after the words "is asking". A fixture that only ever
 * draws the easy arity is a fixture that certifies the bug.
 */
const askingOneData = () => {
    const d = data();
    d.sessions = d.sessions.map(s => (s.id !== 'cs2' ? s : Object.assign({}, s, {
        status: 'working',
        pendingAsk: {
            requestId: 'ask-one',
            tool: 'AskUserQuestion',
            displayName: 'AskUserQuestion',
            questions: [
                {
                    question: 'Hangi hesapla devam edelim?', header: 'Hesap', multiSelect: false,
                    options: [
                        { label: 'work@studio', description: 'max20x — five-hour window 91% gone' },
                        { label: 'personal@gmail', description: 'pro — 12% gone, resets at 05:40' }
                    ]
                }
            ]
        }
    })));
    return d;
};

/**
 * K-43 — the countdown under ONE question (the arity the card is usually in):
 * the host's view as the panel hands it over, with the option the agent marked.
 */
const askingTimerData = (view, options) => {
    const d = askingOneData();
    d.sessions = d.sessions.map(s => {
        if (s.id !== 'cs2') { return s; }
        const q = Object.assign({}, s.pendingAsk.questions[0], options ? { options } : {});
        return Object.assign({}, s, {
            pendingAsk: Object.assign({}, s.pendingAsk, { questions: [q] }),
            autoAnswer: Object.assign({ requestId: 'ask-one', timeoutSeconds: 300, why: '', picks: [] }, view)
        });
    });
    return d;
};

module.exports = {
    script: 'console.js',
    data,
    variants: () => [
        { id: 'console', label: 'Console — two engines at once', data: data() },
        /**
         * ‼️ K-42 (round 2) — the passive cards, which no scene had ever drawn.
         * The list is opened by the page's own state rather than by a press,
         * because the press asks the HOST to compute the rows and this harness
         * has no host to answer it.
         */
        {
            id: 'console-resume',
            label: 'Console — the resume list open: the longest title still leaves its engine pill pinned right',
            data: resumeData(),
            state: { afConsole: { showResume: true } }
        },
        /**
         * ‼️ K-35 — THE COLOUR LABEL. Three cards, and the picture has to answer
         * all three states at once: a session with a colour, another with a
         * different one, and the one that CANNOT have one because it has not
         * written a session id yet.
         *
         * ‼️ THE PALETTE ITSELF IS NOT IN THIS PICTURE, and the reason is a gap
         * in the harness rather than a choice. It only exists after a press, and
         * this page repaints by SLOT: `lib_page_dom`'s `html()` reads `#app`
         * plus the elements it memoised, while a second `slot()` write lands on
         * the object the markup scan hands back — so everything after the first
         * paint of a slot is invisible here. Reordering that lookup was tried
         * and broke two whole-page fixtures, which is the bug the current order
         * was written against. Until the shim holds ONE identity per id, a
         * slotted page's post-press state is photographed on its own.
         */
        {
            id: 'console-color',
            // ‼️ A DECLARED TWIN, and the paragraph above is why: the palette
            // this scene is named for only exists after a press this harness
            // cannot make. Saying so on the scene is what keeps
            // test/test_scenes_differ.js honest — an UNdeclared duplicate is a
            // promise nobody kept, this one is a gap somebody measured.
            twin: 'console',
            label: 'Console — the colour label on every card kind in the panel',
            data: data()
        },
        /**
         * ‼️ K-30 — THE "/" PICKER, WHICH IS ONLY EVER REACHED BY TYPING ONE.
         * A picture of this composer with nothing open cannot answer the
         * questions the item was about: does a command, its argument hint and
         * its description fit on ONE line at 11.5px, does the list read as a
         * column or as a wall, and is the highlighted row visible without
         * being loud. So the variant PRESSES the trigger and answers the
         * catalog request the way the host would.
         *
         * The commands below are the shape a real merge produces — the CLI's
         * own, a file somebody wrote under `commands/`, an installed skill and
         * an engine workflow — because a list of five `/foo`s would flatter a
         * layout that has to survive `/wiki:compile-category`.
         */
        {
            id: 'console-slash',
            label: 'Console — the "/" command picker, open over the composer',
            data: data(),
            act: r => {
                r.query('#c-slash').forEach(b => b.fire('click'));
                const ask = r.posted.filter(m => m.type === 'slashCommands').pop() || {};
                r.send({
                    type: 'slashCommands',
                    engine: ask.engine || 'claude', agent: ask.agent || '', session: ask.session || '',
                    commands: [
                        { name: '/account-signup', description: 'Sign one Google account up to a list of web services', scope: 'skill', engine: '', args: '<service>' },
                        { name: '/approvals', description: 'How much Codex may do without asking', scope: 'engine', engine: 'codex', args: '', tui: true, reported: true },
                        { name: '/dataviz', description: 'The chart rules — read before the first line of chart code', scope: 'skill', engine: '', args: '' },
                        { name: '/git:cleanup', description: 'Delete every local branch already merged into main', scope: 'local', engine: '', args: '[remote]', source: '.claude/commands/git/cleanup.md' },
                        { name: '/handover', description: 'Write the cold-start letter for the next session', scope: 'local', engine: '', args: '', source: '.claude/commands/handover.md' },
                        { name: '/model', description: 'Which model answers the next turn', scope: 'engine', engine: 'codex', args: '[name]', tui: true, reported: true },
                        { name: '/new', description: 'Start a fresh thread', scope: 'engine', engine: 'codex', args: '', reported: true },
                        { name: '/review', description: 'Read the diff on this branch and report what is wrong with it', scope: 'workflow', engine: '', args: '[path]', source: '.agents/workflows/review.md' }
                    ]
                });
                // ‼️ K-31 — the highlight is walked onto a TUI command on
                // purpose. The warning is drawn for the row IN HAND, so a
                // picture taken on `/clear` would be a picture of the one state
                // that has nothing to say about the constraint.
                for (let i = 0; i < 5; i++) {
                    r.query('#c-text').forEach(t => t.fire('keydown', { key: 'ArrowDown' }));
                }
            }
        },
        { id: 'console-composer', label: 'Console — the engine picker', data: composerData() },
        {
            id: 'console-lastlaunch',
            label: 'Console — the composer opened on what this agent last ran as (S-34)',
            data: rememberedComposerData()
        },
        {
            id: 'console-composer-relay',
            label: 'Console — S-82: the composer with ⑂ Relay on, the Account box naming a single slot (pool @emptiest), its panel open',
            tip: 'relaychip',
            data: relayComposerData('work-1')
        },
        {
            id: 'console-opencode',
            label: 'Console — OpenCode chosen: no effort box, and permissions it can really ask about',
            data: opencodeComposerData()
        },
        {
            id: 'console-agy',
            label: 'Console — Antigravity chosen: only the permission rows it can keep (S-60)',
            data: agyComposerData()
        },
        {
            id: 'console-no-skills',
            label: 'Console — the Superpowers folder cannot supply the hook',
            data: noSkillsData()
        },
        {
            id: 'console-route',
            // ‼️ X-113 - the panel is the point of this scene now: it carries the
            // refusal, and a closed panel photographs none of it.
            tip: 'tip-route',
            label: 'Console — the composer picks the route, and says what the pick would be refused for (X-105/X-113)',
            data: routedComposerData()
        },
        {
            // ‼️ X-112 — THE ROUTED CARD, SELECTED. Every other scene has a card
            // on the Claude plan or on another engine selected, so the one state
            // this item exists for — the Claude CLI answered by somebody else's
            // endpoint — was drawn by no picture at all. The strip under the
            // conversation is where its ⚖ and its $ are written.
            id: 'console-offplan',
            label: 'Console — the routed card selected: its ⚖ fills NO plan window (X-112)',
            data: Object.assign(data(), { selected: 'cs4' })
        },
        {
            id: 'console-account',
            label: 'Console — and which sign-in pays for it, on a machine rotating three (X-169)',
            data: accountComposerData()
        },
        {
            id: 'console-account-policy',
            label: 'Console — the account box set to a RULE, which says what it comes to (X-305)',
            data: policyComposerData()
        },
        {
            // ‼️ K-41 — THE CARD'S OWN BADGE WHEN THE SEAL IS A RULE. The scene
            // above is the composer's BOX; this is the pill on a running card,
            // which is where the bug was drawn and which no scene had ever
            // shown. It used to read `⚠ not on this machine: @emptiest` — a
            // deleted-account warning over a session running perfectly.
            id: 'console-card-policy',
            label: 'Console — a live card sealed to a RULE, not a sign-in (K-41)',
            data: Object.assign(data(), {
                selected: 'cs1',
                sessions: [session({
                    id: 'cs1', status: 'idle',
                    account: '@emptiest', accountLabel: '@emptiest', accountIsPolicy: true,
                    accountNext: '', accountNextLabel: '',
                    accountAxis: true,
                    accountRows: [
                        { id: 'work-1', label: 'work@studio', health: 'ready', active: true, percent: 97 },
                        { id: 'personal', label: 'personal@gmail', health: 'ready', active: false, percent: 12 }
                    ],
                    messages: [
                        { id: 'm1', ts: NOW - 60000, role: 'user', text: 'devam et' },
                        { id: 'm2', ts: NOW - 30000, role: 'assistant', text: 'Tamam, devam ediyorum.' }
                    ]
                })]
            })
        },
        {
            // ‼️ X-213 — the swap the whole family exists for, caught mid-promise:
            // a live conversation whose next message moves to the other account
            // because this one has run out. The label carries the arrow, so the
            // picture has to show it standing out at strip width.
            id: 'console-reseal',
            label: 'Console — a live conversation whose NEXT message moves account (X-213)',
            data: Object.assign(data(), {
                selected: 'cs1',
                sessions: [session({
                    id: 'cs1', status: 'idle',
                    account: 'work-1', accountLabel: 'work@studio',
                    accountNext: 'personal', accountNextLabel: 'personal@gmail',
                    accountAxis: true,
                    accountRows: [
                        { id: 'work-1', label: 'work@studio', health: 'ready', active: true, percent: 97 },
                        { id: 'personal', label: 'personal@gmail', health: 'ready', active: false, percent: 12 }
                    ],
                    messages: [
                        { id: 'm1', ts: NOW - 60000, role: 'user', text: 'devam et' },
                        {
                            id: 'm2', ts: NOW - 30000, role: 'system',
                            text: 'next message runs on personal@gmail — Claude Code seals an account into '
                                + 'the process, so this one is ended and the same conversation is resumed on it'
                        }
                    ]
                })]
            })
        },
        {
            id: 'console-machine-global',
            label: 'Console — nothing captured yet, and the box says so BY NAME (X-213)',
            data: machineGlobalComposerData()
        },
        {
            id: 'console-sentry',
            label: 'Console — the sentry is working through the backlog while nobody watches (X-177)',
            data: sentryData()
        },
        {
            id: 'console-sentry-asleep',
            label: 'Console — the sentry waiting out a quota wall, holding the next round words (X-177)',
            data: sentryAsleepData()
        },
        {
            id: 'console-sentry-stopped',
            label: 'Console — …and the strip that explains a night that ended at three (X-177)',
            data: sentryStoppedData()
        },
        {
            id: 'console-asking-one',
            label: 'Console — ONE question: the arity the fold control has to survive (U-133)',
            data: askingOneData()
        },
        {
            id: 'console-asking-timer',
            label: 'Console — ONE question with the auto-answer clock running, and its Stop timer (K-43)',
            data: askingTimerData({
                state: 'armed', reason: 'armed', dueAt: Date.now() + 272000,
                picks: ['personal@gmail (Recommended)']
            }, [
                { label: 'work@studio', description: 'max20x — five-hour window 91% gone' },
                { label: 'personal@gmail (Recommended)', description: 'pro — 12% gone, resets at 05:40' }
            ])
        },
        {
            id: 'console-asking-timer-held',
            label: 'Console — …the same question after Stop timer: it waits for you (K-43)',
            data: askingTimerData({
                state: 'held', reason: 'armed', dueAt: Date.now() + 272000, heldAt: Date.now(),
                picks: ['personal@gmail (Recommended)'],
                why: 'waiting for you — the timer was stopped, so nothing will be chosen for you.'
            })
        },
        {
            id: 'console-asking-timer-refused',
            label: 'Console — a question that reads as destructive gets no clock, and says which word stopped it (K-43)',
            data: askingTimerData({
                state: 'waiting', reason: 'destructive', dueAt: 0,
                why: 'waiting for you — this question says "delete", and a choice that may not be undone is yours to make.'
            }, [
                { label: 'Delete the branch (Recommended)', description: 'it is merged' },
                { label: 'Keep it', description: 'look at it later' }
            ])
        },
        {
            id: 'console-asking',
            label: 'Console — a question holding the turn: the card that can be folded down to its line (U-133)',
            data: askingData()
        },
        /**
         * ‼️ U-133 ROUND 3 — THE SCENE THE USER IS ACTUALLY LOOKING AT.
         *
         * Their report is one sentence: the "50 line(s) hidden by show" note is
         * sitting on the ask card's top-left corner, on top of what is there.
         * No picture in this repo could ever have shown it, because that note
         * only exists when the card's `show` filter is set — and the filter is
         * STORED state, which every fixture started without. So the two things
         * that collide were never in one frame.
         *
         * One question, because that is the arity an agent usually asks in and
         * the one round 2 was caught by.
         */
        {
            id: 'console-asking-hidden',
            label: 'Console — one question AND a show filter: the note and the card in one frame (U-133)',
            data: askingOneData(),
            state: { afConsole: { kindsBy: { cs2: ['user', 'ask'] } } }
        },
        /**
         * ‼️ A RUNNING SESSION ON A MODEL THE CATALOGUE DOES NOT PUBLISH.
         *
         * The one state the running row drew as its own opposite. Claude's
         * catalogue publishes four ALIASES (`haiku` `sonnet` `opus` `fable`) and
         * the CLI reports back the RESOLVED id (`claude-opus-5`), so the box
         * matched no `<option>` and the `<select>` fell to its first row — which
         * reads `Default`. Measured on the user's own session: the bridge said
         * `model: claude-opus-5` and the box beside it said `Default`.
         *
         * The scene is the reading, so the model on the card is deliberately an
         * id the `engineModels.claude` list above does NOT contain. Nothing else
         * about the card matters here; what has to be looked at is one box.
         */
        {
            id: 'console-resolved-model',
            label: 'Console — the running row names the model the CLI reported, not "Default"',
            data: Object.assign(data(), {
                selected: 'cs1',
                sessions: [session({
                    id: 'cs1', status: 'working', turns: 3,
                    engine: 'claude', engineLabel: 'Claude Code',
                    // ‼️ NOT an alias — this is what the CLI reports and what the
                    // host stores, and the catalogue has never published it.
                    model: 'claude-opus-5', effort: 'xhigh',
                    turnModel: 'claude-opus-5', turnEffort: 'xhigh',
                    permissionMode: 'bypassPermissions',
                    turnStartedAt: NOW - 41000, turnTokens: 38210, turnApiCalls: 5,
                    tokens: 612000, wTokens: 540000, contextTokens: 136102,
                    account: 'aicozums', accountLabel: 'aicozums',
                    messages: msgs()
                })]
            })
        },
        /**
         * ‼️ THE OPEN STATE OF THE `show` PICKER IS NOT A SCENE — IT IS `--menu`.
         *
         * The page shim does not wire `AFFilter.multi` (its stub menus have no
         * `querySelectorAll`), so an `act` that presses the button changes
         * nothing and a scene labelled "open" would photograph a shut one — the
         * exact failure `docs/CONVENTIONS.md` names. The renderer has the flag
         * for it and it is the only honest route:
         *
         *   node test/render_page.js console --menu c-kinds
         *   node test/shoot_page.js console --scene 1
         *
         * Worth looking at after any change to `.crow .afms`: the menu must come
         * down as a COLUMN of tickable kinds under its tools line. It stood
         * permanently open, laid out as a ROW, because `.crow .afms > *` set
         * `display:flex` on it and a class selector outranks the browser's own
         * `[hidden] { display:none }`.
         */
        /**
         * ‼️ AN ENGINE SWITCHED TO, WITH NOTHING REMEMBERED AND SOMETHING SET.
         *
         * `a-dev`'s record names Claude; Codex has no row in it. That used to
         * empty both boxes — right about the MEMORY and wrong about the box,
         * because Farm Settings says this agent runs Codex on `gpt-5.6-sol` at
         * `xhigh`. ‼️ X-152 — the rule is the HOST's now (`moveEngine`, run in
         * test_console_intent.js), so pressing the picker here would only post
         * `setIntent` into a harness with nobody to answer it. What the reader
         * meets is the answer the host pushes back, and that is the scene.
         */
        {
            id: 'console-engine-switch-default',
            label: 'Console — switching engine falls to what Farm Settings says, not to "Default"',
            data: Object.assign(composerData(), {
                composerIntent: intentOf({ engine: 'codex', model: 'gpt-5.6-sol', effort: 'xhigh', account: 'work-1' }),
                composerAgent: 'a-dev'
            })
        },
        /**
         * ‼️ S-62 — THE COMMANDS STILL RUNNING BEHIND THE TURN. Measured: a Bash
         * call backgrounded with run_in_background survives Stop, and when it
         * finishes the CLI opens a new turn by itself. The strip has to say it
         * while the turn runs (with the Interrupt button counting what else it
         * will end) AND after the turn is over — which is the arity the reader
         * actually meets, and the one with no Interrupt button to press, so
         * the ✕ on the chip is the only way out. Three scenes because a count,
         * a wrap and a missing button are three layouts.
         */
        {
            id: 'console-background-two',
            label: 'Console — a running turn with TWO commands in the background; Interrupt says +2',
            data: backgroundData('working', 2)
        },
        {
            id: 'console-background-after',
            label: 'Console — the turn is over, ONE command is still running behind it; no Interrupt, only the ✕',
            data: backgroundData('idle', 1)
        },
        {
            id: 'console-background-none',
            // The same Claude card running with nothing behind the turn: no chip
            // may be drawn and the button is the plain one — the absence is the
            // proof, photographed under the same eye as the two above.
            label: 'Console — nothing in the background: no chip, the plain Interrupt',
            data: backgroundData('working', 0)
        },
        /**
         * ‼️ S-64 — THE DISCIPLINE SIGNAL ON THE STATUS STRIP, three states and
         * three scenes, because the difference between them is the whole point:
         * a run that was told, a run that was told to STOP, and a run the
         * sentence could never reach. The third is the one that must not look
         * like the first two and must not look like silence either — a Codex
         * card sitting past the line with no mark reads as an agent ignoring
         * the law it was never read.
         *
         * The strip only draws the window pair when `contextTokens` is set, so
         * every scene here carries a reading; the words themselves come from
         * the host (`contextSignalView`) exactly as `console.sessions` sends
         * them, never re-derived on the page.
         */
        {
            id: 'console-ctxsig-converge',
            label: 'Console — CONTEXT CONVERGE delivered: the run was told to start nothing new',
            data: ctxSignalData('converge')
        },
        {
            id: 'console-ctxsig-handover',
            label: 'Console — CONTEXT HANDOVER delivered and the note written: the run was told to stop',
            data: ctxSignalData('handover')
        },
        {
            id: 'console-ctxsig-undelivered',
            label: 'Console — a Codex run past the line the sentence cannot reach: ✕, never silence',
            data: ctxSignalData('undelivered')
        },
        /**
         * S-75 — the account's 5-hour window crossed while the conversation's
         * window is quiet: the quota chip alone (the smallest arity), with
         * its own panel; then an engine the sentence cannot reach.
         */
        {
            id: 'console-quotasig-handover',
            label: 'Console — QUOTA HANDOVER delivered, the window quiet: 5h 91% HANDOVER, its own panel, Continue offered',
            tip: 'tip-quota',
            data: quotaSignalData('handover')
        },
        {
            id: 'console-baton-leg',
            label: 'Console — leg 2 of a baton relay, its successor waiting: ⑂ 2 on the strip, the chain in its panel',
            tip: 'tip-baton',
            data: batonData()
        },
        {
            id: 'console-baton-brake',
            label: 'Console — a relay leg told to hand over: ✕ Stop chain BESIDE Continue from handover, the brake\'s panel open',
            tip: 'tip-batonstop',
            data: batonData(true)
        },
        {
            id: 'console-baton-passnow',
            label: 'Console — S-82: a relay leg\'s ⑂ Pass now beside ✕ Stop chain, its panel open (the order is the host\'s)',
            tip: 'tip-batonpass',
            data: batonData(true)
        },
        {
            id: 'console-baton-card',
            label: 'Console — S-91: the relay leg on the CARD in the list, ⑂ 2 beside the sign-in, the chain in its panel',
            tip: 'tip-batoncard',
            data: batonData()
        },
        {
            id: 'console-lastleg-off',
            label: 'Console — S-99: a running relay leg, ⑂⊣ Last leg OFF on the strip for the whole leg, its panel open',
            tip: 'tip-lastleg',
            data: lastLegData('off')
        },
        {
            id: 'console-lastleg-on',
            label: 'Console — S-99: ⑂⊣ Last leg PRESSED — drawn pressed, ⑂ 2⊣ on the strip, its panel says how to take it back',
            tip: 'tip-lastleg',
            data: lastLegData('on')
        },
        {
            id: 'console-lastleg-card',
            label: 'Console — S-99: the braked leg on the CARD in the list: ⑂ 2⊣, "last leg" in the chain panel',
            tip: 'tip-batoncard',
            data: lastLegData('on')
        },
        {
            id: 'console-lastleg-locked',
            label: 'Console — S-99: a braked pass recorded — ⑂⊣ locked, the chain ended at this leg',
            tip: 'tip-lastleg',
            data: lastLegData('locked')
        },
        {
            id: 'console-baton-card-bare',
            label: 'Console — S-91: a relay card with no sign-in pill: ⑂ 2 alone at the start of line 2',
            data: (() => { const d = batonData(); d.sessions[0].accountAxis = false; return d; })()
        },
        {
            id: 'console-relay-attach',
            label: 'Console — S-82: a live run outside any relay, ⑂ Attach relay pressed: the pool picker and the max-legs box under the status row',
            data: relayAttachData(),
            act: r => { r.query('#c-baton-attach').forEach(b => b.fire('click')); }
        },
        {
            id: 'console-quotasig-undelivered',
            label: 'Console — a Codex run past the quota line: 5h 93% HANDOVER ✕, never silence',
            tip: 'tip-quota',
            data: quotaSignalData('undelivered')
        },
        /**
         * B-23 — the searches for a session id the bridge guard stopped on
         * this session. One refusal first (the smallest arity), then a run
         * stopped more times than the panel lists.
         */
        {
            id: 'console-guard-one',
            label: 'Console — the bridge guard stopped one search for a session id: guard 1 on the strip',
            tip: 'tip-guard',
            data: guardData(1)
        },
        {
            id: 'console-guard-many',
            label: 'Console — stopped seven times: the panel lists five and says how many it left out',
            tip: 'tip-guard',
            data: guardData(7)
        },
        /** The strip's hands are frameless icon chips; every panel reads state · title · paragraph. */
        {
            id: 'console-continue-tip',
            label: 'Console — ↪ Continue from handover, its panel open: the state line, then the title, then the paragraph',
            tip: 'tip-continue',
            data: quotaSignalData('handover')
        },
        {
            id: 'console-relay-attach-tip',
            label: 'Console — ⑂+ Attach relay before it is pressed, its panel open',
            tip: 'tip-batonattach',
            data: relayAttachData()
        },
        {
            id: 'console-attach-tip',
            label: 'Console — 📎 Attach files, its panel open',
            tip: 'tip-attach',
            data: relayAttachData()
        }
    ]
};

/** The host's own words (`bridgeGuardView`), on a Claude card under the lines. */
function guardData(n) {
    const G = require('../../out/core/bridgeGuard.js');
    const ids = ['b19bd67f-c086-436a-8261-db239491084b', '116f35f0', 'a3a3b54d-e696-4fa6-abd6-5cb22113bc35'];
    const catches = Array.from({ length: n }, (_, i) => ({
        ts: NOW - (n - i) * 60000,
        id: ids[i % ids.length],
        how: ids[i % ids.length].length === 8 ? 'known' : 'full',
        tool: ['Grep', 'Bash', 'Glob'][i % 3],
        reason: '',
        sessionId: 'cs1'
    }));
    const d = data();
    d.selected = 'cs1';
    d.sessions = [session({
        id: 'cs1', status: 'working', turns: 4,
        engine: 'claude', engineLabel: 'Claude Code',
        model: 'claude-opus-5', effort: 'high', turnModel: 'claude-opus-5', turnEffort: 'high',
        permissionMode: 'bypassPermissions',
        turnStartedAt: NOW - 38000, turnTokens: 24100, turnApiCalls: 4,
        tokens: 406000, wTokens: 320000, cost: 0.82,
        contextTokens: 182000, contextWindowTokens: 1000000, contextWindowSource: 'model',
        contextSource: 'stream-last-call', contextMeasuredAt: NOW - 30000,
        bridgeGuardView: G.bridgeGuardView(catches, ts => Math.round((NOW - ts) / 60000) + 'm'),
        account: 'aicozums', accountLabel: 'aicozums',
        messages: msgs()
    })];
    return d;
}

/**
 * The three signal states, each on a card that really carries a window
 * reading. `contextSignalView` is the host's; these are its outputs verbatim,
 * so a change to the words shows up here rather than in a second copy.
 */
function ctxSignalData(state) {
    const d = data();
    d.selected = 'cs1';
    const LAW = 'Lines: converge 35% · hand over 40% (agentFarm.contextConvergePct / contextHandoverPct).';
    const view = state === 'converge'
        ? {
            state: 'delivered', level: 'converge', chip: 'CONVERGE', handedOver: false,
            lines: [
                'Discipline signal: CONTEXT CONVERGE 36% delivered — 4m ago, through the Claude live hook (PostToolUse).',
                'CONTEXT HANDOVER 40%: not reached — the run may still work, but starts nothing new.',
                'Handed over: not yet — the note that closes this run names it here.',
                LAW
            ]
        }
        : state === 'handover'
            ? {
                state: 'delivered', level: 'handover', chip: 'HANDOVER', handedOver: true,
                lines: [
                    'Discipline signal: CONTEXT HANDOVER 41% delivered — 1m ago, through the Claude live hook (UserPromptSubmit).',
                    'CONTEXT CONVERGE 36% had gone out earlier — 9m ago.',
                    'Handed over: yes — 30s ago — 2026-09-17_devir_05_116f35f0_s64.md',
                    LAW
                ]
            }
            : {
                state: 'undelivered', level: 'handover', chip: 'HANDOVER ✕', handedOver: false,
                lines: [
                    'Discipline signal: CONTEXT HANDOVER 44% — ‼️ NEVER REACHED THIS RUN — 2m ago.',
                    'codex hooks carry no additionalContext — the signal has no way into that session',
                    'The reading is here and the sentence is not: this run was not told, so its '
                        + 'silence is not obedience. Watch it yourself, or hand it over by hand.',
                    LAW
                ]
            };
    const codex = state === 'undelivered';
    d.sessions = [session({
        id: 'cs1', status: 'working', turns: 6,
        engine: codex ? 'codex' : 'claude', engineLabel: codex ? 'Codex CLI' : 'Claude Code',
        model: codex ? 'gpt-5-codex' : 'claude-opus-5', effort: 'high',
        turnModel: codex ? 'gpt-5-codex' : 'claude-opus-5', turnEffort: 'high',
        permissionMode: 'bypassPermissions',
        turnStartedAt: NOW - 38000, turnTokens: 24100, turnApiCalls: 4,
        tokens: 906000, wTokens: 720000, cost: 1.42,
        // The figure and the word must agree: a card reading 40% beside a
        // CONVERGE chip is the page contradicting itself in one line.
        contextTokens: codex ? 113600 : (state === 'handover' ? 410000 : 360000),
        contextWindowTokens: codex ? 258400 : 1000000,
        // ‼️ X-113 - Codex states its own operational window every turn;
        // Claude never states one, so its million is the model table's answer
        // and the card's panel says which.
        contextWindowSource: codex ? 'engine' : 'model',
        contextSource: codex ? 'rollout-last-token-usage' : 'stream-last-call',
        contextMeasuredAt: NOW - 30000,
        contextSignalView: view,
        account: 'aicozums', accountLabel: 'aicozums',
        messages: msgs()
    })];
    return d;
}

/** S-77 — the host's own words (`batonCardView`) for a middle leg that has passed. */
function batonData(handover) {
    const V = require('../../out/core/batonView.js');
    const d = ctxSignalData(handover ? 'handover' : 'converge');
    const sid = d.sessions[0].sessionId || 's-this';
    d.sessions[0].sessionId = sid;
    const mk = (id, state, hop, from, extra) => ({
        id, chainId: 'chn_muq2k1', hop, state, prompt: 'p', why: 'w',
        from: { sessionId: from, agentId: 'd:/zone/agent/ajanlar/developer', engine: 'claude', cwd: 'D:\\x', launchId: 'l' },
        inherit: { surface: 'console' }, want: { surface: 'inherit', account: '@emptiest' },
        createdAt: NOW, updatedAt: NOW, ...extra
    });
    if (!handover) { d.sessions[0].contextSignalView = null; }
    d.sessions[0].batonView = V.batonCardView([
        mk('b1', 'started', 1, '22597c33-aaaa', { toSessionId: sid }),
        mk('b2', 'waiting-end', 2, sid, { note: 'S-77 surfaces, card chip done' })
    ], sid);
    return d;
}

/** S-99 — a RUNNING leg that has not passed: its ⑂⊣ Last leg brake off, on, or locked after a braked pass. */
function lastLegData(state) {
    const V = require('../../out/core/batonView.js');
    const d = ctxSignalData('converge');
    const sid = d.sessions[0].sessionId || 's-this';
    d.sessions[0].sessionId = sid;
    d.sessions[0].contextSignalView = null;
    const mk = (id, st, hop, from, extra) => ({
        id, chainId: 'chn_muq2k1', hop, state: st, prompt: 'p', why: 'w',
        from: { sessionId: from, agentId: 'd:/zone/agent/ajanlar/developer', engine: 'claude', cwd: 'D:\\x', launchId: 'l' },
        inherit: { surface: 'console' }, want: { surface: 'inherit', account: '@emptiest' },
        createdAt: NOW, updatedAt: NOW, ...extra
    });
    const flag = state === 'off' ? {} : { lastLeg: { at: NOW - 600000, by: 'the user (Console card)' } };
    const list = [mk('b1', 'started', 1, '22597c33-aaaa', { toSessionId: sid, ...flag })];
    if (state === 'locked') { list.push(mk('b2', 'stopped', 2, sid, { why: 'braked — last leg' })); }
    d.sessions[0].batonView = V.batonCardView(list, sid);
    return d;
}

/** S-82 — a live card no baton touched, with this engine's rules for the pool picker. */
function relayAttachData() {
    const d = ctxSignalData('converge');
    const s = d.sessions[0];
    s.sessionId = s.sessionId || 's-this';
    s.contextSignalView = null;
    s.batonView = null;
    s.policyRows = [
        { id: '@emptiest', label: '@emptiest', picks: 'personal@gmail', note: '', refusal: '',
            detail: 'The sign-in of this engine with the most of its five-hour window left at the moment the session starts.' },
        { id: '@round-robin', label: '@round-robin', picks: 'work@studio', note: '', refusal: '',
            detail: 'The usable sign-ins of this engine in turn, one after another across launches.' }
    ];
    d.batonMaxLegs = 6;
    return d;
}

/** S-75 — the host's own words (`contextSignalView`) for a quota crossing. */
function quotaSignalData(state) {
    const G = require('../../out/core/contextGuard.js');
    const codex = state === 'undelivered';
    const d = ctxSignalData('converge');
    const del = (pct, ago, via) => ({ ts: NOW - ago, pct, tokens: 0, window: 0, channel: 'claude-hook', via, account: 'aicozums' });
    const rec = {
        sessionId: 's', lastPct: 18,
        quota: codex
            ? { account: 'aicozums', lastPct: 93, lastTs: NOW - 20000, resetsAt: NOW + 5400000,
                undelivered: { level: 'handover', ts: NOW - 120000, pct: 93, why: 'codex hooks carry no additionalContext — the signal has no way into that session' } }
            : { account: 'aicozums', lastPct: 91, lastTs: NOW - 20000, resetsAt: NOW + 5400000,
                converge: del(86, 1500000, 'PostToolUse'), handover: del(91, 60000, 'PostToolUse') }
    };
    const s = d.sessions[0];
    Object.assign(s, {
        engine: codex ? 'codex' : 'claude', engineLabel: codex ? 'Codex CLI' : 'Claude Code',
        model: codex ? 'gpt-5-codex' : 'claude-opus-5', turnModel: codex ? 'gpt-5-codex' : 'claude-opus-5',
        contextTokens: codex ? 46500 : 180000, contextWindowTokens: codex ? 258400 : 1000000,
        contextWindowSource: codex ? 'engine' : 'model',
        contextSource: codex ? 'rollout-last-token-usage' : 'stream-last-call',
        contextSignalView: G.contextSignalView(rec, G.DEFAULT_CONTEXT_THRESHOLDS, ts => Math.round((NOW - ts) / 60000) + 'm ago')
    });
    return d;
}

/**
 * S-62 — the Claude card selected, working or just finished, with N commands
 * the CLI reports as running behind the turn (its own `background_tasks_changed`
 * shape, as the panel forwards it).
 */
function backgroundData(status, count) {
    const d = data();
    const tasks = [
        { id: 'b5gi6nosu', kind: 'local_bash', description: 'Start the dev server on port 5173', startedAt: NOW - 42000, toolUseId: 'toolu_01Shhitd9M7rmjxEvQkfuKmg' },
        { id: 'b82kuyjhy', kind: 'local_bash', description: 'node -e "setTimeout(function(){console.log(77)},8000)"', startedAt: NOW - 6000, toolUseId: 'toolu_01YWxxCcCdEpV9i2jPzoVP6Z' }
    ].slice(0, count);
    d.selected = 'cs1';
    d.sessions = d.sessions.map(s => (s.id !== 'cs1' ? s : Object.assign({}, s, status === 'working'
        ? {
            status: 'working', lastTurn: null, turnStartedAt: NOW - 51000,
            turnTokens: 9100, turnWTokens: 9100, turnApiCalls: 2, turnSteps: 4, turnThinking: 1,
            turnCost: 0.02, turnModel: 'claude-opus-5-20260514', turnEffort: 'high',
            backgroundTasks: tasks,
            messages: msgs().concat([{
                id: 'm-bg', ts: NOW - 42000, role: 'tool', kind: 'local',
                tool: { name: 'Bash', detail: 'npm run dev' }
            }])
        }
        : {
            status: 'idle',
            backgroundTasks: tasks,
            messages: msgs().concat([{
                id: 'm-bg-done', ts: NOW - 3000, role: 'error', text: 'turn interrupted'
            }])
        })));
    return d;
}
