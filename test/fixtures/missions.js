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
    plannerApplied: { models: ['claude-opus-5'], permissionMode: null, effort: null },
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
                    ran: {
                        engine: 'opencode', model: 'grok-code', effort: 'high',
                        permissionMode: 'acceptEdits', workDir: 'D:/zone/dev/git/miropharm/vsc_AgentFarm',
                        origin: {
                            engine: 'member', model: 'member', effort: 'agent',
                            permissionMode: 'fleet', workDir: 'mission'
                        }
                    },
                    applied: { models: ['claude-haiku-4-5'], permissionMode: 'plan', effort: null }
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
                    applied: { models: ['claude-haiku-4-5'], permissionMode: null, effort: null }
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

const data = (over) => Object.assign({
    newForm: false,
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
                r.send({
                    // seq 0 is the token a host PUSH carries; the debounced
                    // ask that normally raises the number needs a real timer.
                    type: 'preview', seq: 0,
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
                // The typing comes AFTER the answer: a host message re-reads the
                // form, and this shim's textarea does not carry its own value
                // back out of the markup — so filling the boxes first would
                // photograph a form that had been emptied by the shim rather
                // than by the page.
                el('f-goal').value = SPEC.goal;
                el('f-lead').value = 'a0';
                el('tm-1').checked = true;
                el('tm-2').checked = true;
                el('rl-1').value = 'implements';
                el('rl-2').value = 'reviewer';
                el('pm-2').value = 'plan';
                el('ef-2').value = 'high';
                fire(el('tm-1'), 'change');
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
