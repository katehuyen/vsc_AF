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
    // ‼️ X-213 — and whose sign-in is paying for it. The default is the state
    // the picture has to make ordinary: the machine's own, NAMED, on an engine
    // that could hold another. `accountNext` empty = nothing pending.
    account: '@machine', accountLabel: 'Machine Global',
    accountNext: '', accountNextLabel: '', accountAxis: true, accountRows: []
}, o);

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
            contextTokens: 28874, contextWindowTokens: 258400,
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
            lastTs: NOW - 300000,
            route: {
                id: 'kimi', label: 'Kimi', noun: 'Route', tier: 'sonnet',
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
            tokens: 48200, lastTs: NOW - 200000,
            route: {
                id: 'opencode', label: 'opencode', noun: 'Provider',
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
        variantsWhy: 'a hosted card is spoken to over ACP, which declares only model and mode'
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
    composerIntent: intentOf({ engine: 'claude', providerId: 'kimi', tier: 'opus', account: 'personal' }),
    // ‼️ X-213 — the axis is a fact about the ENGINE, so it is stated rather
    // than inferred from the length of the list above.
    composerAccountAxis: true
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

module.exports = {
    script: 'console.js',
    data,
    variants: () => [
        { id: 'console', label: 'Console — two engines at once', data: data() },
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
            label: 'Console — the composer picks the route the session is served by (X-105)',
            data: routedComposerData()
        },
        {
            id: 'console-account',
            label: 'Console — and which sign-in pays for it, on a machine rotating three (X-169)',
            data: accountComposerData()
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
        }
    ]
};

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
