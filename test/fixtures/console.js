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
        {
            id: 'a-dev', name: 'developer', dir: 'D:\\zone\\agent\\ajanlar\\developer', superpowers: true,
            // ‼️ S-34 — what this one was last started with. It rides on the
            // agent row so the picker can resolve it without a round trip; see
            // seedFromAgent in media/console.js.
            lastLaunch: {
                engine: 'claude', model: 'opus', effort: 'high',
                permissionMode: 'plan', superpowers: true, surface: 'console'
            }
        },
        {
            id: 'a-mgr', name: 'manager', dir: 'D:\\zone\\agent\\ajanlar\\manager', superpowers: false,
            // …and one that has never been started, which falls through to the
            // fleet defaults. `null` is a different answer from an empty record.
            lastLaunch: null
        }
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
    superpowersChoice: '',
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
    superpowersOn: undefined, superpowersChoice: ''
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
    // the picture: `ConsolePanel.show` seeds both from the SAME record, and the
    // page then drops a model the chosen engine does not offer (reconcileComposer).
    // A fixture that remembered `opus` on Codex would draw "Default" and look
    // like the bug this item fixes.
    engine: 'claude',
    composerSeed: 1,
    composerLaunch: { model: 'opus', effort: 'high', permissionMode: 'plan' },
    superpowersChoice: 'on'
});

/** ‼️ U-59 — the same composer with the SHARED-ACP engine chosen, which is the
 *  only state in which the effort box is absent and the permission tooltip says
 *  the engine can stop and ask. Five boxes become four; that is the picture. */
const opencodeComposerData = () => Object.assign(composerData(), { engine: 'opencode' });

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
                        { name: '/clear', description: 'Start the conversation over, keeping the session', scope: 'engine', engine: 'claude', args: '', reported: true },
                        { name: '/compact', description: 'Summarise the conversation so far and carry on from the summary', scope: 'engine', engine: 'claude', args: '[instructions]', reported: true },
                        { name: '/context', description: 'What the window is holding, by category', scope: 'engine', engine: 'claude', args: '', reported: true },
                        { name: '/cost', description: 'What this session has cost so far', scope: 'engine', engine: 'claude', args: '', reported: true },
                        { name: '/model', description: 'Pick the model this session runs on', scope: 'engine', engine: 'claude', args: '[model]', tui: true, reported: true },
                        { name: '/git:cleanup', description: 'Delete every local branch already merged into main', scope: 'local', engine: '', args: '[remote]', source: '.claude/commands/git/cleanup.md' },
                        { name: '/handover', description: 'Write the cold-start letter for the next session', scope: 'local', engine: '', args: '', source: '.claude/commands/handover.md' },
                        { name: '/dataviz', description: 'The chart rules — read before the first line of chart code', scope: 'skill', engine: '', args: '' },
                        { name: '/account-signup', description: 'Sign one Google account up to a list of web services', scope: 'skill', engine: '', args: '<service>' }
                    ]
                });
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
            id: 'console-no-skills',
            label: 'Console — the Superpowers folder cannot supply the hook',
            data: noSkillsData()
        }
    ]
};
