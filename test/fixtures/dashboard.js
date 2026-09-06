/**
 * The Dashboard, with a fleet that is NOT all Claude (X-35).
 *
 * ‼️ WHAT THIS FIXTURE IS THE PROOF OF. The Agent comparison table's Sessions
 * column printed the Claude-only count — the one every other figure on the row
 * is measured from, correctly — while the agent's own page had already learned
 * to count every engine. Same agent, two surfaces, two numbers, and nothing
 * anywhere to explain the gap: an agent mostly driven through Codex read as
 * barely used here and showed a full table one click away. The cell now carries
 * both, and the picture is for whether "5 of 12" still reads as a number rather
 * than as clutter in a right-aligned column.
 *
 * ‼️ THE CLOCK IS THE REAL ONE. The page draws "last activity" and its daily
 * chart against `Date.now()`, so a pinned stamp produces an empty graph and a
 * row of nonsense ages — the same trap the Turns and Timeline fixtures document.
 */
const NOW = Date.now();
const DAY = 86400000;

/** Fourteen days of spend, so the chart has a shape rather than one spike. */
function daily(scale) {
    const out = {};
    for (let i = 13; i >= 0; i--) {
        const d = new Date(NOW - i * DAY);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const wave = 0.4 + 0.6 * Math.abs(Math.sin(i * 1.1));
        out[key] = {
            cost: Math.round(scale * wave * 100) / 100,
            tokens: Math.round(scale * wave * 420000),
            wTokens: Math.round(scale * wave * 160000),
            msgs: Math.round(scale * wave * 24)
        };
    }
    return out;
}

const agent = (o) => Object.assign({
    active: false, lastActivity: NOW - DAY, contextLoad: 12400, memoryFiles: 9,
    daily: {}, errors: 0, toolCalls: 0,
    usage: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 },
    insightCounts: { error: 0, warning: 0, info: 0 },
    duties: 0, pendingDuties: 0, qualityCount: 0, sessionsAll: 0
}, o);

const agents = () => ([
    agent({
        id: 'a1', name: 'developer', active: true, lastActivity: NOW - 4 * 60000,
        // 41 Claude sessions, 6 elsewhere — the ordinary case: the gap is small
        // and the figures beside it are almost the whole story.
        sessions: 41, sessionsAll: 47,
        daily: daily(3.1), totalCost: 128.4, totalTokens: 41_200_000, totalWTokens: 8_900_000,
        errors: 12, toolCalls: 1840,
        usage: { input: 1_900_000, output: 420_000, cacheWrite: 2_100_000, cacheRead: 36_800_000 },
        insightCounts: { error: 1, warning: 2, info: 3 },
        duties: 4, pendingDuties: 1, quality: 4.3, qualityCount: 11, budget: 20
    }),
    agent({
        // ‼️ THE ROW THIS EXISTS FOR. Five Claude sessions and thirty-one
        // elsewhere: the cost column is honestly near zero and, without the
        // second number, this agent looked idle.
        id: 'a2', name: 'manager', active: true, lastActivity: NOW - 22 * 60000,
        sessions: 5, sessionsAll: 36,
        daily: daily(0.4), totalCost: 6.12, totalTokens: 2_400_000, totalWTokens: 510_000,
        errors: 2, toolCalls: 210,
        usage: { input: 180_000, output: 41_000, cacheWrite: 96_000, cacheRead: 2_080_000 },
        insightCounts: { error: 0, warning: 1, info: 1 },
        duties: 3, pendingDuties: 0, quality: 3.9, qualityCount: 4
    }),
    agent({
        id: 'a3', name: 'psikolog', lastActivity: NOW - 3 * DAY,
        sessions: 18, sessionsAll: 18,
        daily: daily(0.9), totalCost: 31.7, totalTokens: 9_600_000, totalWTokens: 2_100_000,
        errors: 1, toolCalls: 320,
        usage: { input: 520_000, output: 190_000, cacheWrite: 280_000, cacheRead: 8_610_000 },
        duties: 2, pendingDuties: 0, quality: 4.8, qualityCount: 7
    }),
    agent({
        // Never used any other engine, and never scored: both blanks must stay
        // readable next to the rows that have figures.
        id: 'a4', name: 'basit', lastActivity: NOW - 9 * DAY,
        sessions: 3, sessionsAll: 3,
        daily: daily(0.05), totalCost: 0.41, totalTokens: 180_000, totalWTokens: 44_000,
        errors: 0, toolCalls: 11,
        usage: { input: 22_000, output: 6_000, cacheWrite: 9_000, cacheRead: 143_000 },
        duties: 1, pendingDuties: 0
    })
]);

const sessionRows = () => ([
    {
        file: 'C:\\Users\\x\\.claude\\projects\\vsc_AgentFarm\\407c78cb.jsonl',
        sessionId: '407c78cb-2f1a-4d55-9e10-1b2c3d4e5f60', agent: 'developer', agentName: 'developer',
        title: 'X-35 kalan denetim listesini kapat', ts: NOW - 4 * 60000, active: true,
        cost: 2.14, tokens: 1_840_000, wTokens: 610_000, ctxNow: 186_400,
        tools: 22, errors: 1, models: ['claude-opus-5'], durMin: 41, turns: 14,
        engine: 'claude', origin: 'user'
    },
    {
        file: 'C:\\Users\\x\\.codex\\sessions\\2026\\08\\12\\rollout-019ff43f.jsonl',
        sessionId: '019ff43f-ff3d-7790-9431-63799a45b1b2', agent: 'manager', agentName: 'manager',
        title: 'rollout ayrıştırıcısını yeniden yaz', ts: NOW - 38 * 60000, active: false,
        cost: 0, tokens: 93_625, wTokens: 0, ctxNow: 93_625,
        tools: 9, errors: 0, models: ['gpt-5.6-sol'], durMin: 12, turns: 6,
        engine: 'codex', origin: 'user'
    },
    {
        file: '', sessionId: 'agy-9d21c4e7', agent: 'basit', agentName: 'basit',
        title: 'yapıştırdığım backlog bloğunu özetle', ts: NOW - 180 * 60000, active: false,
        cost: 0, tokens: 0, wTokens: 0, ctxNow: 0,
        tools: 2, errors: 0, models: [], durMin: 1, turns: 3,
        engine: 'agy', origin: 'user'
    }
]);

const data = () => ({
    generatedAt: NOW,
    today: new Date(NOW).toISOString().slice(0, 10),
    agents: agents(),
    modelTotals: {
        'claude-opus-5': { cost: 121.2, tokens: 38_400_000, wTokens: 8_100_000 },
        'claude-haiku-4-5': { cost: 14.1, tokens: 9_200_000, wTokens: 1_900_000 },
        'gpt-5.6-sol': { cost: 0, tokens: 3_100_000, wTokens: 0 }
    },
    tokenTypes: { input: 2_620_000, output: 657_000, cacheWrite: 2_485_000, cacheRead: 47_633_000 },
    heat: new Array(168).fill(0).map((_, i) => (i % 24 > 8 && i % 24 < 22 ? (i * 7) % 40 : 0)),
    sessionRows: sessionRows(), sessionTableN: 20,
    window: { tokens: 4_100_000, msgs: 210, cost: 18.4, limit: 0 },
    fleetBudget: 50, mediaCost: { today: 0.9, month: 12.4 },
    // X-231 — a fleet held up by one of each: a clock nobody has to act on,
    // an event that ends when a session does, and a person who has not looked.
    waits: [
        { kind: 'task-clock', subject: { kind: 'task', id: 't1', name: 'nightly sweep' },
            reason: 'waiting until 03:20 — retry 2 (account handover · no other claude '
                + 'account is captured on this machine)',
            since: NOW - 5 * 60000, until: NOW + 20 * 60000, blockedBy: [],
            clearedBy: 'clock', op: 'tasks.unpark' },
        { kind: 'restart-armed', subject: { kind: 'window', id: 'extensionHost', name: 'extensionHost' },
            reason: 'Waiting for 1 live console session(s) (developer) to finish',
            since: NOW - 30000, blockedBy: ['session:cs1'], clearedBy: 'event',
            op: 'farm.restartExtensionHost' },
        { kind: 'mission-approval', subject: { kind: 'mission', id: 'm1', name: 'audit' },
            reason: 'waiting for your approval (round 2)',
            since: NOW - 40 * 60000, blockedBy: [], clearedBy: 'human', op: 'missions.approve' }
    ],
    insightTotals: { error: 1, warning: 3, info: 4 },
    unknownModels: [],
    /**
     * ‼️ X-203 — THE FARM STATUS CARD, DRAWN FROM THE REAL BUILDER.
     *
     * It was an empty array, so the card the user was complaining about — "you
     * said there is a button at the end of the Engines row, but there isn't" —
     * could not be looked at in any render at all. Built through the real
     * `buildFarmStatus` for the same reason the missions fixture takes its
     * conditions from the real dictionary: a fixture that typed its own rows
     * would photograph a card the code cannot produce, which is how the missing
     * button survived a page anybody could have shot.
     *
     * The machine described is this one: three engines ready and sessions of
     * two of them on disk, which is the ACTIVE state — the exact state in which
     * the Engines button used to disappear.
     */
    farmStatus: require('../../out/core/farmstatus.js').buildFarmStatus({
        listenerState: 'listening', eventsLast24h: 4200,
        taskCount: 6, tasksDone7d: 14, scheduleCount: 2,
        triggerCount: 1, triggersFired7d: 3,
        workflowCount: 0, workflowRuns7d: 0,
        hasMediaKey: false, mediaAssetCount: 0, mediaCostMonth: 0,
        cliProfileCount: 0, externalSessions: { codex: 31, agy: 4 },
        enginesReady: ['claude', 'codex', 'agy'], engineCount: 4,
        ingestFolderCount: 0, registeredAssetCount: 0,
        oversightLoopsOn: 1, qualitySamples: 12,
        secretCount: 3,
        // X-256 — the row for what actually limits the farm: three sign-ins on
        // two engines, one of them fallen out, so the card has to show both the
        // room the rotation will find and the account it cannot use.
        accounts: [
            { slotId: 'work@studio', engine: 'claude', percent: 23, health: 'ready', fetchedAt: 1 },
            { slotId: 'personal', engine: 'claude', percent: 91, health: 'ready', fetchedAt: 1 },
            { slotId: 'codex-work', engine: 'codex', percent: -1, health: 'unreadable', fetchedAt: 1 }
        ]
    }),
    // ‼️ The honest one-liner under the page: what is NOT in the money above.
    externalSessions: { codex: 31, agy: 4, gemini: 2 }
});

const variants = () => ([
    { id: 'dashboard', label: 'Dashboard — an agent driven mostly through another engine', data: data() }
]);

module.exports = { script: 'dashboard.js', data, variants, agents, sessionRows };
