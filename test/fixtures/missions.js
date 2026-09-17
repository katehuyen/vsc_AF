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
    // ‼️ U-104 — what the PLANNER'S own session says it ran on. The spec asks
    // for opus; the transcript is the only witness that it got it, and the
    // orchestrator's applied profile had never been on this page at all.
    // ‼️ X-124 — over the RUN'S own window, not the lead lane's whole history.
    // The lead's conversation can be older than the mission; only the turns
    // inside this run testify about it.
    plannerApplied: {
        models: ['claude-opus-5'], permissionMode: null, permissionModes: [],
        effort: null, scope: 'turn', turns: 3
    },
    // ‼️ M-29 — WHAT THE ORCHESTRATOR ACTUALLY LAUNCHED WITH, kept by the run.
    // The interesting shape, on purpose: the mission's own `opus` won rung 1 and
    // therefore took the user's `--model sonnet` OFF the command line, while the
    // effort nobody overrode came from that same taskExtraArgs string. Drawing
    // it proves the panel names the source and reports the displaced flag; the
    // adaptive run below deliberately has no record, which is the other case.
    plannerLaunch: {
        model: { value: 'opus', origin: 'mission' },
        effort: { value: 'high', origin: 'extra-args', source: '--effort high' },
        extraArgs: '--effort high',
        displaced: ['--model sonnet']
    },
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
                    costUSD: 0, tokens: 214000, outputFile: 'D:/out/s1.md',
                    // ‼️ X-96 — a step that left BOTH kinds of evidence: the
                    // session it ran in (resolved to a file by the host) and the
                    // output it wrote. The row draws the pair; s3 below has
                    // neither, which is the other case worth picturing.
                    runSessionId: 'ses_9f31c0a4', transcript: 'D:/sessions/sess-dev-1.jsonl',
                    // ‼️ U-104 — THE MISMATCH, which is the one case a reader must
                    // not have to hover to notice: grok-code was asked for and
                    // the session was served by a different model entirely, and
                    // the permission mode came back narrower than requested. The
                    // row wears ≠ and the panel puts the two side by side.
                    //
                    // ‼️ An ALIAS would NOT be a mismatch — `grok-code` served by
                    // `grok-code-fast-1` is the CLI expanding a short name, and
                    // flagging that would put ≠ on nearly every row. See
                    // sameModel().
                    // X-225/X-107 - and the two the panel could not print until
                    // they were on its own list: whose plan paid, and WHICH
                    // ENDPOINT served it. The route is the one dimension here
                    // that no transcript preserves, so a scene without it
                    // photographs the panel's only permanent blind spot.
                    ran: {
                        engine: 'opencode', model: 'grok-code', effort: 'high',
                        permissionMode: 'acceptEdits', workDir: 'D:/zone/dev/git/miropharm/vsc_AgentFarm',
                        account: 'work@studio', providerId: 'kimi-work', tier: 'opus',
                        origin: {
                            engine: 'member', model: 'member', effort: 'agent',
                            permissionMode: 'fleet', workDir: 'mission',
                            account: 'mission', providerId: 'member'
                        }
                    },
                    // ‼️ X-124 — evidence BOUND to the two turns this delegation's own
                    // task occupied. The ≠ mark is only drawn on turn-bound
                    // evidence: the lane's aggregate holds every model it ever
                    // used, so a comparison against it hides the mismatch.
                    applied: {
                        models: ['claude-haiku-4-5'], permissionMode: 'plan',
                        permissionModes: ['plan'], effort: null, scope: 'turn', turns: 2
                    }
                },
                {
                    id: 's2', round: 1, agentId: 'a2', agentName: 'basit',
                    title: 'read the transcript back', prompt: 'p', readonly: true,
                    status: 'done', costUSD: 0, tokens: 88000,
                    // ‼️ U-104 — THE COMMONEST DELEGATION OF ALL: every dimension
                    // left to the CLI. `runNote` drew NOTHING for this, so the
                    // row that most needed to say "nobody decided this" was the
                    // one that said least. No mark, and the panel says it in
                    // words on all five lines.
                    ran: {
                        engine: 'claude',
                        origin: {
                            engine: 'cli', model: 'cli', effort: 'cli',
                            permissionMode: 'cli', workDir: 'cli'
                        }
                    },
                    // ‼️ X-124 — the other case: this step's task row is gone, so
                    // there is no window to bind it to and what is shown is the
                    // LANE'S reading, labelled as the lane's. No verdict is drawn
                    // on it, whatever it says.
                    applied: {
                        models: ['claude-haiku-4-5'], permissionMode: null,
                        permissionModes: [], effort: null, scope: 'session'
                    }
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
                    // ‼️ U-104 — a step recorded BEFORE the resolver's answer was
                    // kept. It has the old lossy line and nothing else, and the
                    // panel has to say so rather than drawing five empty rows.
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
    // ‼️ U-65 — THE REAL RECORD, not a sketch of one.
    //
    // What was here before did not exist anywhere outside this file: a council
    // pointing at its conversation through `conversation` (the record's field
    // is `conversationId`), a message whose state was `'said'` (the record's
    // states are pending / delivered / failed / cancelled), a conversation with
    // `messages` and `open` counts it never carries and a `closed` flag that
    // is really `closedAt` + `closeReason`. Every string test passed, because
    // the page had been written against the sketch — so on a REAL run the
    // council never matched its conversation at all.
    //
    // This is the shape MissionConversation / MissionCouncil / MissionMessage
    // actually have, and the exchange it draws is the one U-65 has to render:
    // an independent opening round, a challenge that names what it is about, a
    // response, a concession, a one-to-many question, a synthesis over real
    // refs, two votes, and a turn that failed and therefore never spoke.
    conversations: [
        {
            id: 'c1', sourceActionId: 'd2',
            objective: 'Is a $0.00 reading a missing price or a free turn?',
            participants: ['a1', 'a2'],
            openedAt: Date.now() - 34 * 60000
        },
        {
            id: 'c2', sourceActionId: 'd3',
            objective: 'Which of the two transcripts is the one a user would open first?',
            participants: ['a1', 'a2'],
            openedAt: Date.now() - 12 * 60000,
            closedAt: Date.now() - 9 * 60000,
            closeReason: 'answered in one turn'
        }
    ],
    councils: [
        {
            id: 'k1', sourceActionId: 'd2', conversationId: 'c1',
            question: 'Is a $0.00 reading a missing price or a free turn?',
            chair: 'a2', members: ['a1', 'a2'],
            options: ['missing price', 'free turn'],
            maxTurns: 12,
            votes: [
                { member: 'a1', choice: 'missing price' },
                { member: 'a2', unclear: true }
            ],
            verdictRefs: ['m6'],
            openedAt: Date.now() - 34 * 60000
        }
    ],
    messages: [
        {
            id: 'm1', conversationId: 'c1', sourceActionId: 'd2',
            from: 'a1', fromName: 'developer', to: [], intent: 'proposal', refs: [],
            ask: 'State your reading of a $0.00 line, without seeing anyone else\'s.',
            excerpt: 'A $0.00 line on an engine that states no price is a MISSING price, not a free turn. '
                + 'The two look identical on the row and only the engine table can tell them apart, '
                + 'so the row has to say which it is rather than print a zero and stop.',
            taskId: 't-m1', sessionId: 'sess-dev-1', carried: 'new',
            transcript: 'D:/sessions/sess-dev-1.jsonl', outputFile: 'D:/out/m1.md',
            orderedAt: Date.now() - 34 * 60000, settledAt: Date.now() - 31 * 60000, state: 'delivered'
        },
        {
            id: 'm2', conversationId: 'c1', sourceActionId: 'd2',
            from: 'a2', fromName: 'basit', to: [], intent: 'proposal', refs: [],
            ask: 'State your reading of a $0.00 line, without seeing anyone else\'s.',
            excerpt: 'A zero is a zero. If the CLI printed 0.00 the turn cost nothing and the row '
                + 'should say so; inventing a second meaning for it is the thing that would confuse a reader.',
            taskId: 't-m2', sessionId: 'sess-basit-1', carried: 'new',
            orderedAt: Date.now() - 34 * 60000, settledAt: Date.now() - 30 * 60000, state: 'delivered'
        },
        {
            id: 'm3', conversationId: 'c1',
            from: 'a1', fromName: 'developer', to: ['a2'], intent: 'challenge', refs: ['m2'],
            excerpt: 'That holds only for an engine that REPORTS a price. On the free OpenCode models '
                + 'the field is absent and the reader is shown 0.00 for a run that had no figure at all — '
                + 'measured on run2, where the same line meant both things on two rows.',
            taskId: 't-m3', sessionId: 'sess-dev-1', carried: 'resumed',
            transcript: 'D:/sessions/sess-dev-1.jsonl', outputFile: 'D:/out/m3.md',
            orderedAt: Date.now() - 29 * 60000, settledAt: Date.now() - 27 * 60000, state: 'delivered'
        },
        {
            id: 'm4', conversationId: 'c1',
            from: 'a2', fromName: 'basit', to: ['a1'], intent: 'response', refs: ['m3'],
            excerpt: 'Accepted for engines with no price field. I still say a reporting engine\'s 0.00 '
                + 'is a real zero and should not be hedged.',
            taskId: 't-m4', sessionId: 'sess-basit-1', carried: 'handoff',
            orderedAt: Date.now() - 26 * 60000, settledAt: Date.now() - 24 * 60000, state: 'delivered'
        },
        {
            id: 'm5', conversationId: 'c1',
            from: 'a2', fromName: 'basit', to: ['a1'], intent: 'concede', refs: ['m3'],
            excerpt: 'Conceded: the row cannot print 0.00 for both cases. Whether it says so with a '
                + 'badge or a different figure is a separate question.',
            taskId: 't-m5', sessionId: 'sess-basit-1', carried: 'resumed',
            orderedAt: Date.now() - 23 * 60000, settledAt: Date.now() - 22 * 60000, state: 'delivered'
        },
        {
            id: 'm6', conversationId: 'c1',
            from: 'lead', fromName: 'manager', to: [], intent: 'synthesis', refs: ['m1', 'm2', 'm5'],
            excerpt: 'Where it stands: both now agree a bare 0.00 cannot mean two things. They still '
                + 'disagree on whether a reporting engine\'s zero needs any mark at all.',
            orderedAt: Date.now() - 21 * 60000, settledAt: Date.now() - 21 * 60000, state: 'delivered'
        },
        {
            id: 'm7', conversationId: 'c1',
            from: 'a1', fromName: 'developer', to: [], intent: 'vote', refs: ['m6'],
            excerpt: 'missing price — because that is the case a reader cannot recover from. '
                + 'Confidence: high; it is measured on run2 rather than argued.',
            taskId: 't-m7', sessionId: 'sess-dev-1', carried: 'resumed',
            orderedAt: Date.now() - 20 * 60000, settledAt: Date.now() - 19 * 60000, state: 'delivered'
        },
        {
            id: 'm8', conversationId: 'c1',
            from: 'a2', fromName: 'basit', to: [], intent: 'vote', refs: ['m6'],
            excerpt: 'Either reading is defensible depending on the engine, so I will not pick one.',
            taskId: 't-m8', sessionId: 'sess-basit-1', carried: 'resumed',
            orderedAt: Date.now() - 19 * 60000, settledAt: Date.now() - 18 * 60000, state: 'delivered'
        },
        {
            id: 'm9', conversationId: 'c1',
            from: 'a1', fromName: 'developer', to: ['a2'], intent: 'question', refs: ['m8'],
            ask: 'Ask what would change the answer.',
            taskId: 't-m9',
            orderedAt: Date.now() - 17 * 60000, settledAt: Date.now() - 16 * 60000,
            state: 'failed', note: 'the delegate exited 1 without writing an output file'
        },
        {
            id: 'm11', conversationId: 'c1',
            from: 'a1', fromName: 'developer', to: ['a2'], intent: 'challenge', refs: ['m4'],
            excerpt: 'You are still treating "the engine reported 0.00" as a fact the row can rely on. '
                + 'It is a fact about the RUN, not about the engine, and nothing on the row says which one it is.',
            taskId: 't-m11', sessionId: 'sess-dev-1', carried: 'resumed',
            transcript: 'D:/sessions/sess-dev-1.jsonl',
            orderedAt: Date.now() - 15 * 60000, settledAt: Date.now() - 14 * 60000, state: 'delivered'
        },
        {
            id: 'm10', conversationId: 'c2',
            from: 'a2', fromName: 'basit', to: [], intent: 'evidence', refs: [],
            excerpt: 'The index opens the newest first, so the transcript a user sees is whichever '
                + 'ran last — not the one the mission thinks is primary.',
            taskId: 't-m10', sessionId: 'sess-basit-2', carried: 'new',
            orderedAt: Date.now() - 12 * 60000, settledAt: Date.now() - 10 * 60000, state: 'delivered'
        },
        {
            // ‼️ X-81 — a turn that is ORDERED and still out. It is neither a
            // speaker nor a silence, and the fixture carries one so the third
            // state is something a reader can actually be shown.
            id: 'm11', conversationId: 'c1', from: 'a1', fromName: 'developer', to: ['a2'],
            intent: 'response', refs: [],
            ask: 'Say which of the two transcripts the row should link to, and why.',
            orderedAt: Date.now() - 9 * 60000, state: 'pending'
        }
    ],
    rounds: [
        {
            n: 1, thought: 'Start with the path a user hits first: open a session and answer one turn.',
            action: 'delegate', plannerCostUSD: 0.04, plannerTokens: 9000,
            phase: 'exploring', strategyVersion: 1, at: Date.now() - 60 * 60000,
            steps: [{
                id: 's1', round: 1, agentId: 'a1', agentName: 'developer', title: 'open a session, answer a turn',
                prompt: 'p', status: 'done', criteria: ['c1'], costUSD: 0.4, tokens: 260000,
                outputFile: 'D:/out/s1.md',
                // ‼️ X-96 — both kinds of evidence on one row: the session it ran
                // in and the file it wrote. Other steps here have neither, which
                // is the case the picture also has to show honestly.
                runSessionId: 'ses_9f31c0a4', transcript: 'D:/sessions/sess-dev-1.jsonl'
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
        { id: 'g1', kind: 'guidance', status: 'done', actor: 'user', label: 'do not spend another round on the catalog', parentRefs: ['d2'], inputRefs: [], outputRefs: [], createdAt: Date.now() - 20 * 60000, strategyVersion: 2 },
        // ‼️ X-88 — the verdict is a vertex: a later decision may rest on `e3-1`,
        // and an edge into a node that is not drawn is an edge into nothing.
        // ONE node for the whole evaluation however many criteria it judged.
        { id: 'e3-1', kind: 'evaluation', status: 'done', actor: 'a2', label: '3 criteria — 2 met · revise', parentRefs: ['d3'], inputRefs: ['a1', 'a3'], outputRefs: [], createdAt: Date.now() - 2 * 60000, settledAt: Date.now() - 2 * 60000, strategyVersion: 3 }
    ]
};

/**
 * ‼️ A-17 — WHAT THE FARM HAS RECORDED, in the distribution the strip exists to
 * draw honestly. Four shapes on purpose:
 *  · shapes with enough runs behind them — the case a figure may be read from;
 *  · one UNDER `minSample`, which must be drawn as a count with "too few to
 *    read" and never as a percentage, because a rate over two runs is exactly
 *    what this feature refuses to state;
 *  · a classic side big enough that the comparison is actually computed, since
 *    the null case (what a young farm has) is what every other variant shows;
 *  · `more`, so the panel's "these are not all of them" line is in the picture.
 * `total` deliberately exceeds both the run rows in this fixture and the sum of
 * the groups shown: outcomes outlive rows and only the top shapes are sent, and
 * a fixture where those three numbers matched would prove none of it.
 */
const OUTCOMES = {
    total: 71,
    minSample: 3,
    signatureVersions: [1],
    more: 2,
    health: 'ok',
    degraded: null,
    compare: {
        classic: { runs: 26, success: 18, enough: true },
        adaptive: { runs: 45, success: 29, enough: true },
        successRate: { classic: 0.692, adaptive: 0.644 },
        note: '26 classic and 45 adaptive runs in this scope.'
    },
    groups: [
        {
            signature: 's1|delegate>evaluate>finish|review', signatureV: 1, mode: 'adaptive',
            features: ['review'], runs: 24, enough: true,
            success: 18, partial: 4, failed: 2, cancelled: 0,
            requiredSatisfaction: 0.82, avgRounds: 4.2, avgTasks: 6.7,
            avgStrategyChanges: 0.9, avgUserInterventions: 0.4,
            featureUse: { review: 24 }, avgDurationMs: 1920000,
            avgCostUSD: 1.83, avgTokens: 412000, lastAt: Date.now() - 3600000
        },
        {
            signature: 's1|delegate>parallel>evaluate>revise>finish|branching,replan,review',
            signatureV: 1, mode: 'adaptive',
            features: ['branching', 'replan', 'review'], runs: 17, enough: true,
            success: 9, partial: 5, failed: 3, cancelled: 0,
            requiredSatisfaction: 0.61, avgRounds: 7.8, avgTasks: 14.2,
            avgStrategyChanges: 1.6, avgUserInterventions: 1.1,
            featureUse: { branching: 17, replan: 17, review: 12 }, avgDurationMs: 5400000,
            avgCostUSD: 6.42, avgTokens: 1380000, lastAt: Date.now() - 86400000
        },
        {
            signature: 's1|delegate>finish|', signatureV: 1, mode: 'classic',
            features: [], runs: 20, enough: true,
            success: 14, partial: 3, failed: 2, cancelled: 1,
            requiredSatisfaction: null, avgRounds: 2.1, avgTasks: 3.4,
            avgStrategyChanges: 0, avgUserInterventions: 0.2,
            featureUse: {}, avgDurationMs: 900000,
            avgCostUSD: 0.94, avgTokens: 208000, lastAt: Date.now() - 172800000
        },
        {
            signature: 's1|delegate>council>evaluate>abort|conversation,council,human',
            signatureV: 1, mode: 'adaptive',
            features: ['conversation', 'council', 'human'], runs: 2, enough: false,
            success: 0, partial: 1, failed: 1, cancelled: 0,
            requiredSatisfaction: 0.25, avgRounds: 9.5, avgTasks: 4,
            avgStrategyChanges: 2, avgUserInterventions: 3.5,
            featureUse: { conversation: 2, council: 2, human: 2 }, avgDurationMs: 7200000,
            avgCostUSD: 11.07, avgTokens: 2140000, lastAt: Date.now() - 259200000
        }
    ]
};

/**
 * ‼️ X-177 — THE SENTRY BLOCK. Three states worth drawing, because they are
 * three different pages: nothing set up yet (the block has to explain what a
 * campaign IS before anybody presses a button), the setup form (four rows of
 * controls, the case that wraps), and a campaign that is really working — which
 * is the one carrying the live strip, the round table and the chips that have
 * to stay readable side by side.
 */
const SENTRY_DEFAULTS = {
    // ‼️ X-194 — `leader` is what the SETTINGS say, not what the campaign asked
    // for: the three leader boxes are empty until somebody types in one, and
    // MIRROR needs a figure to put on the first line of each panel.
    defaults: {
        ceiling: 95, safetyBufferMin: 3, failLimit: 3,
        // ‼️ X-250 — `engine` is which catalogue the leader's model box offers.
        // The host answers it from `LEADER_ENGINE`, the one place that knows
        // what the leader runner can actually spawn.
        // ‼️ X-249 (2/n) — `engine` is now what the SETTING answers and `engines`
        // is what the box may be moved to. One entry means no box is drawn: a
        // select with a single option is a control that cannot be used.
        leader: { model: 'haiku', dailyUsd: 2, maxUsd: 0.25, engine: 'claude', engines: ['claude'] }
    },
    idlePollMin: 10,
    permissionModes: [
        { id: 'default', label: 'default', detail: 'asks before anything that is not read-only' },
        { id: 'acceptEdits', label: 'acceptEdits', detail: 'file edits auto-approved' },
        { id: 'plan', label: 'plan', detail: 'plans only' },
        { id: 'dontAsk', label: 'dontAsk', detail: 'stops instead of asking' },
        { id: 'bypassPermissions', label: '⚠ bypassPermissions', detail: 'EVERY action auto-approved' }
    ],
    // ‼️ X-194 — THE DICTIONARY, READ OUT OF THE REAL ONE. A fixture that typed
    // its own fields would photograph a form nobody will ever see: the page
    // draws whatever `core/sentryPolicy.ts` declares, so that is what the
    // picture has to be taken against. `presetConditions` is called, not
    // copied, for the same reason.
    ...(() => {
        const P = require('../../out/core/sentryPolicy.js');
        return {
            policyFields: P.FIELDS,
            policyOperators: P.OPERATORS,
            policyPresets: P.PRESETS,
            policyPresetConditions: Object.fromEntries(
                P.PRESETS.map(p => [p.id, P.presetConditions(p.id)])),
            // ‼️ X-194 — WHAT THE LAST ROUND MEASURED, taken through the real
            // `factsSnapshot` for the same reason: the row shows the figure the
            // verdict will be compared against, so a fixture that typed its own
            // would photograph a reading the evaluator disagrees with. This one
            // is a round that ended badly — no handover, a dirty repo — which is
            // the state the hybrid set exists to catch.
            policyFacts: P.factsSnapshot({
                diagnosis: {
                    sessionId: '2280dda6-a2ec', session: '2280dda6',
                    outcome: 'nothing-to-continue', rule: 'no-note', why: '',
                    evidence: [], unknown: ['code'], limit: false, policy: {}
                },
                handover: { found: false, source: '', score: 0 },
                repo: { dirty: 3, untracked: 0 },
                round: { index: 7, failed: false, barren: true, consecutiveBarren: 1 },
                quota: { percent: 62 },
                accounts: { usable: 2 },
                output: 'the window is spent; nothing left to continue',
                code: { closed: false }
            }),
            policyFactsAt: Date.now() - 12 * 60 * 1000,
            /**
             * ‼️ X-207 — THE ACCOUNTS THE POOL PICKER OFFERS, with the
             * distribution the control exists for: two engines, so the picker
             * really has to group; one account already past a sensible ceiling,
             * so "which of these can actually run tonight" is a question the row
             * answers; and one nobody has read, because an unread account is
             * usable and must not be drawn as 0%.
             */
            // ‼️ audit B-04.3 — AND WHICH WINDOW EACH PERCENTAGE IS OF. The
            // leader picker's panel used to say "41% of its five-hour window is
            // used" about a Codex slot whose window is a WEEK — the same figure
            // under two window names, one of them a lie with a real number in
            // it. The host names it now and the row carries the name.
            accountPool: [
                { id: 'slot-1', label: 'wmmuratvural@gmail.com', engine: 'claude', percent: 23, state: 'ok',
                    window: 'five-hour window' },
                { id: 'slot-2', label: 'aicozums@gmail.com', engine: 'claude', percent: 4, state: 'ok',
                    window: 'five-hour window' },
                { id: 'slot-3', label: 'murvietnam@gmail.com', engine: 'claude', percent: 97, state: 'ok',
                    window: 'five-hour window' },
                { id: 'slot-x1', label: 'murposta@gmail.com', engine: 'codex', percent: null, state: 'no-source',
                    window: 'usage window' },
                { id: 'slot-x2', label: 'murposta2@gmail.com', engine: 'codex', percent: 41, state: 'ok',
                    window: 'Current week' }
            ]
        };
    })()
};

const SENTRY_OFF = Object.assign({ campaign: null, running: false, rounds: [] }, SENTRY_DEFAULTS);

const SENTRY_LIVE = Object.assign({
    campaign: {
        id: 'sc-1', project: 'prj_9ujsbtzr', agent: 'a1', status: 'running',
        startedAt: Date.now() - 5 * 3600 * 1000, rounds: 7, engine: 'claude', model: 'sonnet',
        permissionMode: 'bypassPermissions', ceiling: 95, failLimit: 3, failStreak: 1,
        lastAction: 'start', lastRule: 'has-room', lastAt: Date.now() - 12 * 60 * 1000,
        lastWhy: 'slot-2 has the most room left, so X-178 starts there',
        taken: ['X-174', 'X-175', 'X-176', 'X-177', 'X-178'],
        // ‼️ X-195 — what the thinking has cost today, with the turn-by-turn
        // ledger the strip's panel draws. A failed turn is IN it: a turn that
        // gave nothing usable still spent money, and a log that dropped it
        // would make the total unexplainable.
        leader: {
            day: '2026-09-06', spentUsd: 0.42, turns: 3, failStreak: 0,
            log: [
                { model: 'claude-sonnet-5', ms: 21400, costUsd: 0.18, at: Date.now() - 3 * 3600 * 1000, ok: true },
                { model: 'claude-sonnet-5', ms: 9100, costUsd: 0.06, at: Date.now() - 2 * 3600 * 1000, ok: false, note: 'answered prose, not a decision' },
                { model: 'claude-sonnet-5', ms: 26800, costUsd: 0.18, at: Date.now() - 12 * 60 * 1000, ok: true }
            ]
        }
        // ‼️ NO `carry` HERE, and that is the honest state: this campaign has a
        // round on the board, and the words were SPENT the moment that row
        // existed. A fixture showing both would be drawing something the code
        // cannot produce.
    },
    running: true,
    rotatesAccounts: true,
    failLimit: 3,
    failStreak: 1,
    projectName: 'PRS.MuratVural_DEV_VSC.AgentFarm',
    agentName: 'developer',
    nextWords: null,
    live: {
        id: 't9', title: 'Sentry R7 · X-178', status: 'running',
        startedAt: Date.now() - 12 * 60 * 1000,
        account: 'slot-2', accountPercent: 38, accountWindow: 'five-hour window',
        accountResetsAt: Date.now() + 2 * 3600 * 1000
    },
    // ‼️ X-195 — ALL FOUR STATES OF THE RECORD ARE HERE, because the mark is the
    // whole point and three of the four are indistinguishable if only one is
    // drawn: a round from BEFORE the record existed (no `why` at all, and it
    // says so rather than being drawn as free), a mechanical round nobody
    // asked a model about, one where the leader WAS asked and gave nothing
    // usable, and one a leader really decided.
    rounds: [
        { id: 't5', title: 'Sentry R4 · X-175', status: 'done', createdAt: Date.now() - 4 * 3600 * 1000, endedAt: Date.now() - 3 * 3600 * 1000, account: 'slot-1' },
        {
            id: 't6', title: 'Sentry R5 · X-176', status: 'done', createdAt: Date.now() - 3 * 3600 * 1000, endedAt: Date.now() - 2 * 3600 * 1000, account: 'slot-1',
            whyMark: 'M',
            why: {
                path: 'mechanical', fired: [], problems: [], outcome: 'finished',
                opening: 'Take the next item on PRS.MuratVural_DEV_VSC.AgentFarm: X-176.',
                why: 'nothing fired — the routine continuation template'
            }
        },
        {
            id: 't7', title: 'Sentry R6 · X-177', status: 'failed', createdAt: Date.now() - 2 * 3600 * 1000, endedAt: Date.now() - 100 * 60 * 1000, account: '',
            whyMark: 'M!',
            why: {
                path: 'mechanical', fired: ['round.failed is true'],
                problems: ['quota.percent — nothing measured it this round'],
                outcome: 'failed',
                opening: 'The previous round failed. Read what it left behind before you start.',
                assist: { model: 'claude-sonnet-5', ms: 9100, costUsd: 0.06, at: Date.now() - 2 * 3600 * 1000, ok: false, note: 'answered prose, not a decision' },
                why: 'the leader was asked and answered prose · quota.percent could not be judged'
            }
        },
        {
            id: 't9', title: 'Sentry R7 · X-178', status: 'running', createdAt: Date.now() - 12 * 60 * 1000, endedAt: null, account: 'slot-2',
            whyMark: 'L',
            why: {
                path: 'leader', fired: ['round.barren is true', 'repo.dirty is more than 0'],
                problems: [], outcome: 'barren',
                handover: { found: true, source: 'vault', path: '00_OUTPUT/01_CEVAPLAR/2026-09-05_devir_07_bf9a77b6.md', score: 92 },
                opening: 'The last round changed nothing. Before taking X-178, find out why.',
                assist: { model: 'claude-sonnet-5', ms: 26800, costUsd: 0.18, at: Date.now() - 12 * 60 * 1000, ok: true },
                why: 'two rounds in a row left the tree dirty and produced no commit — the leader took it in hand'
            }
        }
    ]
}, SENTRY_DEFAULTS);

/**
 * ‼️ B-02 — A SCENE WITH NOTHING ON THE BOARD MAY NOT SHOW A ROUND STILL
 * RUNNING. Every state below `sentry-live` is derived from it and sets
 * `running: false, live: null` — and every one of them went on inheriting a
 * round table whose last row said `running` with no `endedAt`. Five pictures,
 * each of a campaign that is simultaneously idle and mid-round, and each of
 * them signed off. This settles the open round the way the real one would be:
 * it ended, and the table says when. */
const settled = (endedMinsAgo) => SENTRY_LIVE.rounds.map(r => r.status !== 'running' ? r
    // ‼️ AND IT MOVES THE START TOO. The live round opened 12 minutes ago; a
    // scene that ended it "36 minutes ago" and left that start where it was drew
    // `Took -24m` on the screen — a round that finished before it began. The
    // whole row moves: it ran its hour and ended when this scene says it did.
    : Object.assign({}, r, {
        status: 'done',
        createdAt: Date.now() - (endedMinsAgo + 60) * 60 * 1000,
        endedAt: Date.now() - endedMinsAgo * 60 * 1000
    }));

/** Paused, asleep, and carrying the words it will open on when it is let go. */
const SENTRY_HELD = Object.assign({}, SENTRY_LIVE, {
    campaign: Object.assign({}, SENTRY_LIVE.campaign, {
        status: 'paused', pausedAt: Date.now() - 30 * 60 * 1000,
        lastAction: 'sleep', lastRule: 'wait-for-reset',
        lastWhy: 'every account is at or above 95% of its five-hour window — sleeping until the '
            + 'earliest reset plus 3 minutes of safety',
        wakeAt: Date.now() + 96 * 60 * 1000
    }),
    rounds: settled(31), running: false,
    live: null,
    nextWords: {
        code: 'X-178',
        at: Date.now() - 30 * 60 * 1000,
        prompt: 'The previous session (878ae65b) finished its work: X-177. Nothing is outstanding.\n\n'
            + 'Take the next item on PRS.MuratVural_DEV_VSC.AgentFarm: X-178 — NÖBET GÜVENLİĞİ '
            + '(effort M). Read what has already been fought over it before you start.'
    }
});

/**
 * ‼️ A-12.8 — THE FOUR STATES OF THE CHIP THAT COULD NOT BE DRAWN.
 *
 * X-196's whole claim is that each word on the sentry chip now carries a panel
 * saying what it means — WAITING and SLEEPING being the pair a reader cannot
 * tell apart without one. `sentryChip` answers seven words, and until now the
 * fixtures could reach three of them: OFF, PAUSED and RUNNING.
 *
 * `SENTRY_HELD` is why, and it is the trap worth naming: it was labelled
 * "paused, asleep" and carries `lastAction: 'sleep'`, but the chip tests
 * `status === 'paused'` FIRST, so it has only ever drawn PAUSED. The state the
 * item was really about was never on any screen.
 *
 * Each of these turns exactly one of the chip's branches on, so the picture is
 * of that branch and nothing else.
 */

/** Sitting out a quota wall — the state WAITING is confused with. */
const SENTRY_SLEEPING = Object.assign({}, SENTRY_LIVE, {
    campaign: Object.assign({}, SENTRY_LIVE.campaign, {
        status: 'running', lastAction: 'sleep', lastRule: 'wait-for-reset',
        lastWhy: 'every account is at or above 95% of its five-hour window',
        wakeAt: Date.now() + 96 * 60 * 1000
    }),
    rounds: settled(36), running: false, live: null
});

/** It wanted to open a round and could not — a block is not a stop.
 *
 * ‼️ B-02 — THE RULE AND THE SENTENCE ARE THE PRODUCT'S OWN, VERBATIM. This
 * scene used to draw `no-item` and a sentence ending in a bare `⛔`, and neither
 * exists: the product writes seven blocked rules (`user-paused` · `gate:*` ·
 * `no-prompt` · `no-usable-account` · `pool-empty` · `no-agent` · `no-backlog`)
 * and an empty backlog is not one of them at all — that case is `idle` /
 * `nothing-to-take`, because only the user ends a campaign. So the picture
 * A-12.8 added to prove "the panel has to carry the reason" was carrying a
 * reason nobody could ever meet, and the reader met a sentence that reads as
 * cut off. `pool-empty` is used here because it is the longest one the product
 * really writes, which makes it the honest test of how this line wraps.
 * Source: src/core/sentryRun.ts and the `applySentry` calls in src/extension.ts.
 */
const SENTRY_BLOCKED = Object.assign({}, SENTRY_LIVE, {
    campaign: Object.assign({}, SENTRY_LIVE.campaign, {
        status: 'running', lastAction: 'blocked', lastRule: 'pool-empty',
        lastWhy: 'none of the accounts this campaign is allowed to use is captured any more '
            + '(murvietnam@gmail.com, murposta2@gmail.com) — capture them again on the Engines '
            + 'page, or stop the campaign and start it on a pool that exists'
    }),
    rounds: settled(18), running: false, live: null
});

/** Between rounds: nothing on the board and nothing in the way.
 *
 * ‼️ B-02 — IT KEEPS THE PLAN THAT STARTED THE ROUND THAT JUST ENDED, because
 * that is the last plan there was. It used to say `finish` / `round-ended`, and
 * neither exists: `SentryAction` is `start | sleep | idle | blocked | stopped`
 * (`finish` belongs to MISSIONS, a different machine), and no rule of that name
 * is written anywhere. The chip reaches WAITING as the FALL-THROUGH — not sleep,
 * not blocked, not running — so an invented action landed on the right picture
 * for the wrong reason, and the panel's own header read "finish — round-ended"
 * over a `why` about starting X-178. */
const SENTRY_WAITING = Object.assign({}, SENTRY_LIVE, {
    campaign: Object.assign({}, SENTRY_LIVE.campaign, { status: 'running' }),
    rounds: settled(5), running: false, live: null,
    nextWords: {
        code: 'X-178', at: Date.now() - 4 * 60 * 1000,
        prompt: 'Take the next item on PRS.MuratVural_DEV_VSC.AgentFarm: X-178.'
    }
});

/** Over — by a hand or by the failure brake, and it says which. */
const SENTRY_STOPPED = Object.assign({}, SENTRY_LIVE, {
    campaign: Object.assign({}, SENTRY_LIVE.campaign, {
        status: 'stopped', stoppedAt: Date.now() - 18 * 60 * 1000,
        stoppedWhy: 'three rounds failed in a row — the failure brake stopped it',
        failStreak: 3
    }),
    rounds: settled(19), running: false, live: null
});

const data = (over) => Object.assign({
    newForm: false,
    sentry: SENTRY_OFF,
    specs: [SPEC],
    runs: [RUN],
    agents: AGENTS,
    /**
     * ‼️ X-94 — THE PROJECTS THE FORM MAY FILE THIS RUN UNDER, with a real
     * distribution: a long name, a short one, and a window that IS sitting on
     * one — which is the case the control exists for, because it is the one
     * that used to happen silently.
     */
    projects: [
        { id: 'prj_9ujsbtzr', name: 'PRS.MuratVural_DEV_VSC.AgentFarm' },
        { id: 'prj_talk', name: 'TalkScribe' },
        { id: 'prj_z', name: 'Zone' }
    ],
    activeProject: { id: 'prj_9ujsbtzr', name: 'PRS.MuratVural_DEV_VSC.AgentFarm' },
    modelAliases: ['haiku', 'sonnet', 'opus', 'fable', 'grok-code'],
    engines: ENGINES,
    engineModels: ENGINE_MODELS,
    permissions: PERMISSIONS,
    efforts: EFFORTS,
    // ‼️ X-225 — the sign-ins this machine holds, per engine, in the shape the
    // host's one matrix publishes. Only Claude has any: an engine with nothing
    // captured draws no box, and the picture has to show a row where the
    // sixth control is there beside one where it is not.
    accounts: {
        claude: [
            { id: 'work-1', label: 'work@studio', health: 'ready', active: true },
            { id: 'personal', label: 'personal@gmail', health: 'stale', active: false }
        ]
    },
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
    traces: {},
    outcomes: OUTCOMES
}, over || {});

/**
 * ‼️ U-65 — A REAL LONG EXCHANGE, because the compact default is a claim about
 * a size no hand-written fixture reaches. Two hundred delivered turns in one
 * council: what a reader gets is the newest handful and one click to the rest,
 * and what must NOT happen is two hundred rows drawn into a run detail.
 */
const LONG_TALK_RUN = (() => {
    const CAST = [['a1', 'developer'], ['a2', 'basit']];
    const INTENTS = ['proposal', 'challenge', 'response', 'evidence', 'question', 'concede'];
    const msgs = [];
    for (let i = 1; i <= 200; i++) {
        const [id, name] = CAST[i % 2];
        msgs.push({
            id: 'x' + i, conversationId: 'c9',
            from: id, fromName: name, to: i % 3 === 0 ? [] : [CAST[(i + 1) % 2][0]],
            intent: INTENTS[i % INTENTS.length],
            refs: i > 1 ? ['x' + (i - 1)] : [],
            excerpt: 'Turn ' + i + ' — the same argument, one notch further on: '
                + 'whether a figure the engine never stated may be drawn as a number at all.',
            taskId: 't-x' + i, sessionId: i % 2 ? 'sess-dev-1' : 'sess-basit-1',
            carried: i > 2 ? 'resumed' : 'new',
            orderedAt: Date.now() - (210 - i) * 60000,
            settledAt: Date.now() - (209 - i) * 60000,
            state: 'delivered'
        });
    }
    return {
        ...ADAPTIVE_RUN,
        conversations: [{
            id: 'c9', sourceActionId: 'd2',
            objective: 'May a figure the engine never stated be drawn as a number at all?',
            participants: ['a1', 'a2'],
            openedAt: Date.now() - 210 * 60000
        }],
        councils: [{
            id: 'k9', conversationId: 'c9',
            question: 'May a figure the engine never stated be drawn as a number at all?',
            chair: 'a2', members: ['a1', 'a2'],
            options: ['never', 'with a mark'],
            maxTurns: 240, openedAt: Date.now() - 210 * 60000
        }],
        messages: msgs
    };
})();

/** Fire a wired handler the way a hand would, through the shim's own listeners. */
const fire = (el, ev) => {
    if (el && el._listeners && el._listeners[ev]) { el._listeners[ev].forEach(fn => fn()); }
};

module.exports = {
    script: 'missions.js',
    /**
     * ‼️ B-02.2 — THE DEBOUNCE IS RUN, so a scene can answer the question the
     * page actually asked.
     *
     * The form debounces its `preview` request by 220ms, and the shim's
     * `setTimeout` never fires — so the request was never posted and the token
     * it carries (`previewSeq`) never left the page. A scene that then invented
     * `seq: 0` was thrown away by the page's own staleness guard, because the
     * first render has already moved `previewSeq` past 0. The one picture that
     * exists to prove the refusal list therefore showed a form with NO host
     * resolution at all — measured, and for its whole life.
     *
     * Running the timer inline makes the request real. `preview` and
     * `sentryProbe` are the only two timers this page has, both are debounced
     * posts, and the shim's `postMessage` only records — so nothing re-enters.
     */
    window: { setTimeout: (fn) => { fn(); return 0; } },
    data,
    variants: () => [
        {
            /**
             * ‼️ X-225 — THE NEW-MISSION FORM WITH ITS SIXTH CONTROL.
             *
             * A member row now carries engine · model · effort · permissions ·
             * account, and the orchestrator block carries model · effort ·
             * account. Both are the kind of change every string test passes on
             * and an eye does not: whether the row still reads as one row when
             * it wraps, and whether the two blocks still look like two
             * questions rather than one long shelf of pickers.
             */
            id: 'mission-accounts', label: 'Missions — the new-mission form, with whose plan pays (X-225)',
            data: data({}),
            act: (r) => {
                const d = r.sandbox.document;
                fire(d.getElementById('newmission'), 'click');
                const tick = d.getElementById('tm-1');
                if (tick) { tick.checked = true; fire(tick, 'change'); }
            }
        },
        {
            // ‼️ X-177 — the block with NOTHING set up. It has to explain what a
            // campaign is before anybody presses a button, and it is the state
            // every reader meets first.
            id: 'sentry-off', label: 'Sentry — no campaign, and what one would do',
            data: data({})
        },
        {
            // The setup form: four rows of controls plus the opening words. The
            // case that wraps, and the one where a squeezed picker hides.
            id: 'sentry-form', label: 'Sentry — the campaign setup form',
            data: data({}),
            act: (r) => { fire(r.sandbox.document.getElementById('s-new'), 'click'); }
        },
        {
            // ‼️ X-194 — the same form with a MODE PICKED, which is the state
            // the condition editor exists for. `sentry-form` above draws it
            // empty and proves the block explains itself with nothing in it;
            // this one is the picture the five rows have to stay readable in,
            // including the row whose operator takes no value at all.
            id: 'sentry-policy', label: 'Sentry — the hybrid mode, with its conditions open',
            data: data({}),
            act: (r) => {
                const d = r.sandbox.document;
                fire(d.getElementById('s-new'), 'click');
                const hybrid = d.querySelectorAll('[data-spreset]')
                    .filter(e => e.dataset.spreset === 'hybrid')[0];
                if (hybrid) { fire(hybrid, 'click'); }
            }
        },
        {
            // ‼️ X-194 — AN AND GROUP, which is the shape the flat list could
            // never draw. The gutter, the "and" on the part and the group's own
            // controls sitting on its FIRST row are all things a string test
            // passes on and an eye does not: this is the picture that says
            // whether a grouped line still reads as one line.
            id: 'sentry-group', label: 'Sentry — a line whose parts are ANDed',
            data: data({}),
            act: (r) => {
                const d = r.sandbox.document;
                fire(d.getElementById('s-new'), 'click');
                const hybrid = d.querySelectorAll('[data-spreset]')
                    .filter(e => e.dataset.spreset === 'hybrid')[0];
                if (hybrid) { fire(hybrid, 'click'); }
                const and = d.querySelectorAll('[data-sand]')[1];
                if (and) { fire(and, 'click'); }
            }
        },
        {
            // A campaign really working: the live strip, the chips and the round
            // table side by side — the picture that has to stay readable.
            id: 'sentry-live', label: 'Sentry — a campaign on its seventh round',
            data: data({ sentry: SENTRY_LIVE })
        },
        {
            // PAUSED — you stopped the next round by hand, and it carries the
            // words it will open on when it is let go. ‼️ It is NOT the sleeping
            // picture: the chip tests `status === 'paused'` before it looks at
            // `lastAction`, so this scene can only ever draw PAUSED (A-12.8).
            id: 'sentry-held', label: 'Sentry — paused, holding its next sentence',
            data: data({ sentry: SENTRY_HELD })
        },
        {
            // ‼️ A-12.8 — SLEEPING, the word WAITING is confused with. The whole
            // difference is the clock, so the picture exists to show that the
            // panel really carries a wake time.
            id: 'sentry-sleeping', label: 'Sentry — sitting out a quota wall',
            data: data({ sentry: SENTRY_SLEEPING })
        },
        {
            // ‼️ A-12.8 — WAITING, the other half of that pair. Same chip
            // colour, same shape, and only the panel separates them.
            id: 'sentry-waiting', label: 'Sentry — between rounds',
            data: data({ sentry: SENTRY_WAITING })
        },
        {
            // ‼️ A-12.8 — BLOCKED, which used to say nothing at all about what
            // was blocking it. The panel has to carry the reason.
            id: 'sentry-blocked', label: 'Sentry — it could not open a round',
            data: data({ sentry: SENTRY_BLOCKED })
        },
        {
            // ‼️ A-12.8 — STOPPED, and the panel says by whose hand.
            id: 'sentry-stopped', label: 'Sentry — over, and why',
            data: data({ sentry: SENTRY_STOPPED })
        },
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
            // ‼️ U-103 — THE HOST'S RESOLUTION, DRAWN. Two things this picture
            // is the only proof of: the refusal list a draft collects BEFORE
            // Start (an engine this machine cannot run, an effort that engine
            // has no flag for — together, not one per press), and that a row
            // whose engine came from a FLEET default draws that engine's
            // catalogue rather than Claude's. Both are strings every test
            // passes on; neither is a layout anybody has looked at.
            id: 'form-preview', label: 'New Mission — the draft resolved by the host, refusals and all',
            data: data({ newForm: true }),
            act: (r) => {
                const el = (id) => r.sandbox.document.getElementById(id);
                const worker = (id, name, eff, origin, note, problems) => ({
                    agentId: id, agentName: name, kind: 'worker',
                    requested: {}, effective: eff, origin, note, problems
                });
                // ‼️ THE DRAFT IS TYPED FIRST, AND THE ANSWER COMES BACK TO THE
                // DRAFT THAT ASKED. The page only accepts a resolution whose
                // token matches the draft as it stands, so the boxes are filled,
                // the change is fired, and only then is the request the page
                // itself posted answered — with ITS `seq`, which is all the host
                // ever does with it (`missionsPanel.ts` case 'preview').
                el('f-goal').value = SPEC.goal;
                el('f-lead').value = 'a0';
                el('tm-1').checked = true;
                el('tm-2').checked = true;
                el('rl-1').value = 'implements';
                el('rl-2').value = 'reviewer';
                el('pm-2').value = 'plan';
                el('ef-2').value = 'high';
                fire(el('tm-1'), 'change');
                const asked = r.posted.filter(m => m && m.type === 'preview').pop();
                if (!asked) { throw new Error('the form never asked for a preview — the debounce did not run'); }
                r.send({
                    type: 'preview', seq: asked.seq,
                    preview: {
                        ok: false, mode: 'classic', title: '', goal: SPEC.goal,
                        lead: { agentId: 'a0', agentName: 'manager', origin: 'requested' },
                        planner: worker('a0', 'manager', { engine: 'claude', workDir: 'D:/agents/manager' },
                            { engine: 'cli', model: 'cli', effort: 'cli', permissionMode: 'cli' }, '', []),
                        workers: [
                            worker('a1', 'developer', { engine: 'opencode' },
                                { engine: 'fleet', model: 'cli', effort: 'cli', permissionMode: 'cli' },
                                'engine opencode (fleet)', []),
                            worker('a2', 'basit', { engine: 'claude', model: 'haiku', effort: 'high', permissionMode: 'plan' },
                                { engine: 'cli', model: 'agent', effort: 'member', permissionMode: 'member' },
                                'model haiku (agent) · effort high · permissions plan', [])
                        ],
                        problems: [
                            'developer: OpenCode cannot run on this machine — install it with npm i -g opencode-ai',
                            'basit: this run asks for effort "high" and OpenCode has no reasoning-effort flag at all — clear the effort, or run it on an engine that has one'
                        ]
                    }
                });
            }
        },
        {
            // ‼️ U-101 — THE ROWS ARE THE ANSWER, so the two surfaces that make
            // them one are the ones nobody has looked at: the bulk profile OPEN
            // (four dimensions, each with its own "don't change") and the strip
            // that names what an engine change would take away instead of taking
            // it. Both are layout, and both are new.
            id: 'form-profile', label: 'New Mission — the bulk profile open, and a row that no longer fits',
            data: data({ newForm: true }),
            act: (r) => {
                const el = (id) => r.sandbox.document.getElementById(id);
                // ‼️ The profile is opened FIRST and the boxes are filled after,
                // so the LAST event is the one that reads them. This shim hands
                // out a fresh element per repaint, so anything assigned before a
                // later fire is a value nothing ever read.
                fire(el('f-profile'), 'click');
                // A row put on an engine that publishes neither of its words —
                // the case the strip exists for.
                el('tm-1').checked = true;
                el('tm-2').checked = true;
                el('rl-1').value = 'implements';
                el('rl-2').value = 'reviewer';
                el('f-goal').value = SPEC.goal;
                el('f-lead').value = 'a0';
                el('md-1').value = 'opus';
                el('ef-1').value = 'high';
                el('en-1').value = 'opencode';
                fire(el('en-1'), 'change');
            }
        },
        {
            id: 'run', label: 'A running mission, open on its detail',
            data: data({}),
            act: (r) => fire(r.query('.mrow')[0], 'click')
        },
        {
            // ‼️ A-17 — THE HISTORY PANEL OPEN. The strip itself is one line and
            // a string test can read it; what cannot be read is the panel, which
            // is a table of four shapes with a rate, four verdict counts, four
            // averages and a cost caveat on each — the exact thing that looks
            // fine as text and comes out as a wall. Shoot it with
            // `render_page.js missions --only history --tip tip-hist`.
            id: 'history', label: 'The recorded history strip, panel open',
            // ‼️ B-02.2 — AND IT IS REALLY OPEN NOW. This scene had no `act` and
            // no tip, so it rendered exactly the page above it and its label was
            // the only place the panel existed. `tip-hist` is the class
            // `outcomeStripHtml` puts on the wrapper for precisely this.
            tip: 'tip-hist',
            data: data({})
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
                // ‼️ U-65 — AND THE TRANSCRIPT ITSELF OPEN. The room's row is
                // one line; the thing that can overflow is the exchange under
                // it — speaker, intent, refs, lane, timestamp and two links on
                // one head, with the words wrapping under them.
                fire(r.query('[data-cvthread]')[0], 'click');
            }
        },
        {
            // ‼️ U-65 — A LONG EXCHANGE, which is the case the compact default
            // exists for. 200 messages drawn whole is a page nobody can find
            // anything in; this pictures what a reader actually gets.
            id: 'run-conversation', label: 'A 200-message council, compact by default',
            data: data({
                specs: [ADAPTIVE_SPEC, SPEC],
                runs: [LONG_TALK_RUN, RUN],
                traces: { run2: ADAPTIVE_TRACE }
            }),
            act: (r) => {
                fire(r.query('.mrow')[1], 'click');
                fire(r.sandbox.document.getElementById('cv-toggle-run2'), 'click');
                fire(r.query('[data-cvthread]')[0], 'click');
            }
        }
    ]
};
