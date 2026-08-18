/**
 * U-27 — the Dashboard's Plan usage card, with its engine strip.
 *
 * ‼️ THREE VARIANTS BECAUSE THE POINT IS THAT THEY DIFFER. The card used to
 * answer for Claude with nothing on it saying so; now it has one tab per engine
 * and each engine answers from what it actually publishes. The three shapes
 * below are the three ANSWERS — a live endpoint, a figure read off a
 * transcript, and an engine whose quota nobody can read — and the third is the
 * one worth photographing: it must not look like an engine at 0%.
 */
const NOW = Date.parse('2026-08-11T09:00:00Z');

const engines = () => ([
    {
        id: 'claude', label: 'Claude Code', state: 'ok', plan: 'max', fetchedAt: NOW - 60000,
        bars: [
            { id: 'five_hour', title: 'Current session', percent: 86, resetsAt: NOW + 3 * 3600e3 },
            { id: 'seven_day', title: 'Current week (all models)', percent: 41, resetsAt: NOW + 4 * 86400e3 }
        ],
        note: 'Read from Anthropic\u2019s own usage endpoint \u2014 the figures /usage prints in the CLI.'
    },
    {
        id: 'codex', label: 'Codex', state: 'ok', plan: 'plus', fetchedAt: NOW - 40 * 60000,
        bars: [{ id: 'codex_primary', title: 'Current week', percent: 7, resetsAt: NOW + 5 * 86400e3 }],
        note: 'Read from Codex\u2019s own transcript, which records the limit the service returned on its '
            + 'last turn. It costs nothing and asks nothing \u2014 but it is as old as that turn.'
    },
    {
        id: 'gemini', label: 'Gemini', state: 'no-plan', plan: '', fetchedAt: 0, bars: [],
        note: 'This engine is billed per token against an API key, so there is no plan window to be a '
            + 'percentage of. What it has spent is in the cost figures, not here.'
    },
    {
        id: 'agy', label: 'Antigravity', state: 'not-published', plan: '', fetchedAt: 0, bars: [],
        note: 'Antigravity publishes no quota figure this machine can read: its CLI refreshes one '
            + 'internally and writes it to no file. Its usage is visible in the Antigravity app itself.'
    },
    {
        // ‼️ U-59 — THE FIFTH TAB, AND THE WIDTH IS THE POINT. U-40 cut these
        // handles down to bare NAMES because four of them would not fit a 340px
        // card and the fourth dropped to a second line, which read as broken
        // rather than as full. A fifth arrives here; if the strip cannot hold it
        // the picture says so, and nothing else would have.
        id: 'opencode', label: 'OpenCode', state: 'no-plan', plan: '', fetchedAt: 0, bars: [],
        headline: 'priced per turn',
        note: 'OpenCode runs each model against whichever provider it belongs to, so there is no single '
            + 'plan window here to be a percentage of — and no quota to read on a built-in free model. '
            + 'It states the price of every turn itself, so what it has spent is in the cost figures.'
    }
]);

const agent = (id, name) => ({
    id, name, dir: 'D:/a/' + name, active: false, lastActivity: NOW - 1000,
    sessions: 2, contextLoad: 1000, duties: 0, pendingDuties: 0, budget: 0,
    daily: {}, usage: { input: 1, output: 1, cacheRead: 1, cacheWrite: 1 },
    totalCost: 1, totalTokens: 10, totalWTokens: 10, toolCalls: 2, errors: 0,
    insightCounts: { error: 0, warning: 0 }, quality: null, qualityCount: 0
});

const base = (engine) => ({
    generatedAt: NOW, today: '2026-08-11',
    agents: [agent('a1', 'developer')],
    modelTotals: {}, tokenTypes: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 },
    heat: new Array(168).fill(0), sessionRows: [], sessionTableN: 20,
    window: { tokens: 0, msgs: 0, cost: 0, limit: 0 },
    fleetBudget: 0, mediaCost: { today: 0, month: 0 },
    insightTotals: { error: 0, warning: 0, info: 0 },
    unknownModels: [], externalSessions: {}, farmStatus: [],
    planUsage: {
        state: 'ok', plan: 'max', fetchedAt: NOW - 60000,
        bars: engines()[0].bars, note: ''
    },
    planUsageBeat: { ms: 300000, active: false },
    planUsageEngines: engines(),
    planUsageEngine: engine
});

const data = () => base('claude');

const variants = () => ([
    { id: 'planusage', label: 'Plan usage — Claude (a live endpoint)', data: base('claude') },
    { id: 'planusage-codex', label: 'Plan usage — Codex (read off its own transcript)', data: base('codex') },
    {
        id: 'planusage-agy',
        label: 'Plan usage — Antigravity (‼️ not published, and NOT 0%)',
        data: base('agy')
    },
    {
        // ‼️ U-59 — "no plan window" is a THIRD answer, and it is not the same
        // as Antigravity's "not published": nothing is being withheld here.
        id: 'planusage-opencode',
        label: 'Plan usage — OpenCode (‼️ no single window to be a percentage of — five tabs on one line)',
        data: base('opencode')
    }
]);

module.exports = { script: 'dashboard.js', data, variants, engines };
