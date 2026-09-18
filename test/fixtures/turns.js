/**
 * The Turns page with FOUR ENGINES' turns on it (X-35).
 *
 * ‼️ WHAT THIS FIXTURE IS THE PROOF OF. `buildTurnRows` maps over
 * `SessionInfo.turns`, which only the Claude parse ever filled — so this page,
 * which calls itself "the whole farm unrolled one row per turn", held exactly
 * one engine's turns, and widening it to the external list alone would have
 * added nothing because the rows did not exist. The Codex rollout states every
 * boundary the shape needs, so `parseCodexFile` now builds them; the rows below
 * are what that produces beside Claude's.
 *
 * The picture is for the new Engine column beside Agent, its four distinct badge
 * colours, and the Engines filter in the panel.
 */
// ‼️ Relative to the real clock, like the timeline fixture and for the same
// reason: the When column counts against `Date.now()`, so a pinned stamp draws
// every row as "-12145s ago". Measured while writing this file.
const NOW = Date.now();
const min = n => NOW - n * 60000;

const rows = () => ([
    {
        file: 'C:\\Users\\x\\.claude\\projects\\vsc_AgentFarm\\407c78cb.jsonl',
        sessionId: '407c78cb-2f1a-4d55-9e10-1b2c3d4e5f60',
        cwd: 'D:\\zone\\dev\\git\\miropharm\\vsc_AgentFarm',
        agent: 'developer', agentName: 'developer',
        session: 'X-35 multi motor adaptasyonu artık tam olsun',
        n: 14, of: 14,
        label: 'Live Timeline\'a motor filtresi ekle ve lane satırlarına rozet koy',
        ts: min(6), durationMs: 6 * 60000, ms: 5 * 60000,
        apiCalls: 31, steps: 84, thinking: 19, endCtx: 186_400,
        ctxWindow: 1_000_000, ctxWindowSource: 'model',
        tokens: 412_900, wTokens: 168_300, cost: 0.61,
        tools: 22, errors: 1, models: ['claude-opus-5'],
        sidechain: false, origin: 'user', active: true,
        engine: 'claude'
    },
    {
        // ‼️ A CODEX TURN — the row class that could not exist before X-35.
        // Its figures come from `last_token_usage`, the request that finished,
        // never from the thread's running total.
        file: 'C:\\Users\\x\\.codex\\sessions\\2026\\08\\12\\rollout-019ff43f.jsonl',
        sessionId: '019ff43f-ff3d-7790-9431-63799a45b1b2',
        cwd: 'D:\\zone\\dev\\git\\miropharm\\vsc_AgentFarm',
        agent: 'developer', agentName: 'developer',
        session: 'rewrite the rollout parser and run the suite',
        n: 6, of: 6,
        label: 'now run the whole suite and report only the failures',
        ts: min(11), durationMs: 11 * 60000, ms: 9 * 60000,
        apiCalls: 1, steps: 14, thinking: 4, endCtx: 93_625,
        ctxWindow: 258_400, ctxWindowSource: 'engine',
        tokens: 93_625, wTokens: 0, cost: 0,
        tools: 9, errors: 0, models: ['gpt-5.6-sol'],
        sidechain: false, origin: 'user', active: true,
        engine: 'codex'
    },
    {
        file: '',
        sessionId: 'agy-9d21c4e7-55ab-4f01-8c33-77e0a1b2c3d4',
        cwd: 'D:\\zone\\agent\\ajanlar\\basit',
        agent: 'basit', agentName: 'basit',
        session: 'summarise the backlog block I pasted',
        n: 3, of: 3,
        label: 'summarise the backlog block I pasted',
        ts: min(24), durationMs: 4 * 60000, ms: 2 * 60000,
        apiCalls: 1, steps: 5, thinking: 0, endCtx: 25_595,
        ctxWindow: 0, ctxWindowSource: '',
        tokens: 25_595, wTokens: 0, cost: 0,
        tools: 2, errors: 0, models: ['gemini-3.1-pro'],
        sidechain: false, origin: 'user', active: false,
        engine: 'agy'
    },
    {
        file: '',
        sessionId: 'gemini-8f10c2ab',
        cwd: 'D:\\zone\\agent\\ajanlar\\psikolog',
        agent: 'psikolog', agentName: 'psikolog',
        session: 'gemini session',
        n: 2, of: 2,
        label: 'bugünün notlarını topla',
        ts: min(51), durationMs: 9 * 60000, ms: 3 * 60000,
        apiCalls: 1, steps: 3, thinking: 0, endCtx: 18_204,
        ctxWindow: 0, ctxWindowSource: '',
        tokens: 18_204, wTokens: 0, cost: 0.02,
        tools: 0, errors: 0, models: ['gemini-2.5-pro'],
        sidechain: false, origin: 'user', active: false,
        engine: 'gemini'
    },
    {
        // An automation run, so the origin strip has both glyphs in the picture.
        file: 'C:\\Users\\x\\.claude\\projects\\ajanlar\\9c22ab41.jsonl',
        sessionId: '9c22ab41-77de-4a90-b0e1-5f6a7b8c9d01',
        cwd: 'D:\\zone\\agent\\ajanlar\\manager',
        agent: 'manager', agentName: 'manager',
        session: 'nightly fleet report',
        n: 1, of: 1,
        label: '/report — fleet, 7 days',
        ts: min(240), durationMs: 3 * 60000, ms: 2.4 * 60000,
        apiCalls: 6, steps: 11, thinking: 3, endCtx: 42_800,
        ctxWindow: 200_000, ctxWindowSource: 'model',
        tokens: 88_120, wTokens: 31_400, cost: 0.14,
        tools: 4, errors: 0, models: ['claude-haiku-4-5'],
        sidechain: false, origin: 'auto', active: false,
        engine: 'claude'
    },
    {
        // ‼️ U-59 — AN OPENCODE TURN. Two things about it are unlike every row
        // above: its session id is the engine's own `ses_…` rather than a UUID,
        // and its model is a `provider/model` id — the longest value the Model
        // column has ever been asked to hold. The price is the ENGINE'S own
        // figure (it publishes `cost`), so it belongs in the same column as
        // Claude's and not in the derived one.
        file: '',
        sessionId: 'ses_7f2c1a90d4e8b6',
        cwd: 'D:\\zone\\agent\\ajanlar\\manager',
        agent: 'manager', agentName: 'manager',
        session: 'queue triage',
        n: 2, of: 2,
        label: 'now write the three that are blocked into the queue',
        ts: min(14), durationMs: 4 * 60000, ms: 2 * 60000,
        apiCalls: 4, steps: 9, thinking: 2, endCtx: 31_004,
        ctxWindow: 0, ctxWindowSource: '',
        tokens: 63_411, wTokens: 0, cost: 0.0184,
        tools: 3, errors: 0, models: ['opencode/big-pickle'],
        // X-110 - the provider the ENGINE named for this turn. The chip is drawn
        // from this and from nothing else: a turn's declared route is the
        // session's, and reading a provider out of "opencode/big-pickle" is the
        // one inference this family forbids.
        providerIds: ['opencode'],
        sidechain: false, origin: 'user', active: false,
        engine: 'opencode'
    },
    {
        // ‼️ X-110 - THE TURN THE ENGINE NAMED TWO PROVIDERS FOR. The chip must
        // COUNT here rather than name one of them, and a page that only draws
        // the single-provider turn photographs neither the count nor the fact
        // that it wears no provider hue.
        file: '',
        sessionId: 'ses_9a41c7b2e05f3d',
        cwd: 'D:\\zone\\agent\\ajanlar\\manager',
        agent: 'manager', agentName: 'manager',
        session: 'saglayici tur icinde degisti',
        n: 5, of: 5,
        label: 'bu turu bitir, sonra digerine gec',
        ts: min(19), durationMs: 5 * 60000, ms: 3 * 60000,
        apiCalls: 7, steps: 14, thinking: 3, endCtx: 44_210,
        ctxWindow: 0, ctxWindowSource: '',
        tokens: 88_120, wTokens: 0, cost: 0.0311,
        tools: 5, errors: 0, models: ['anthropic/claude-opus-5', 'openai/gpt-5.6-sol'],
        providerIds: ['anthropic', 'openai'],
        sidechain: false, origin: 'user', active: false,
        engine: 'opencode'
    }
]);

const base = () => ({ generatedAt: NOW, rows: rows(), tableN: 200 });

const data = base;

/** One picture with the filter panel closed (the Engine column beside Agent) and
 *  one with it open (the new Engines picker beside Agents).
 *
 *  ‼️ X-113 — AND THE CTX PANEL, IN BOTH OF ITS ARITIES. The cell used to
 *  divide every row by 200 000 and print a percentage; now it takes the
 *  fraction against the ROW'S own ceiling and, where nobody stated one, prints
 *  no fraction at all. Those are two different panels and only the second one
 *  is new, so both are photographed — the emptier one first. */
const variants = () => ([
    { id: 'turns', label: 'Turns — every engine, one row per turn', data: base() },
    {
        id: 'turns-ctx-unknown',
        label: 'Turns — ctx panel, engine states no window and the model is unknown: NO fraction, and it says why',
        tip: 'ctxcell:3',
        data: base()
    },
    {
        id: 'turns-ctx-known',
        label: 'Turns — ctx panel on a Codex turn: the fraction is of ITS 258.4k window, not 200k',
        tip: 'ctxcell:2',
        data: base()
    }
]);

module.exports = { script: 'turns.js', data, variants, rows };
