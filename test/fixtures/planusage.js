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
        // X-306 — the REAL reading off `agy -p /usage --output-format json`
        // (2026-09-19): two pools on one account, each with a 5-hour and a
        // weekly window. Four bars is the arity this card had never drawn.
        id: 'agy', label: 'Antigravity', state: 'ok', plan: '', fetchedAt: NOW - 2 * 60000,
        bars: [
            { id: 'gemini-weekly', title: 'Current week (Gemini Models)', percent: 36, resetsAt: NOW + 3 * 86400e3 + 13 * 3600e3 },
            { id: 'gemini-5h', title: 'Current 5h window (Gemini Models)', percent: 1, resetsAt: NOW + 4 * 3600e3 + 18 * 60000 },
            { id: '3p-weekly', title: 'Current week (Claude and GPT models)', percent: 0, resetsAt: NOW + 7 * 86400e3 },
            { id: '3p-5h', title: 'Current 5h window (Claude and GPT models)', percent: 0, resetsAt: NOW + 5 * 3600e3 }
        ],
        note: 'Read from Antigravity’s own `/usage` (`agy -p /usage`, a local command — no turn, no '
            + 'token). Two pools share the account: Gemini models, and Claude and GPT models; each has '
            + 'a 5-hour and a weekly window, and the figure is what the CLI prints, as used rather than remaining.'
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
    planUsageEngine: engine,
    // X-212 — whose sign-in the card is showing. Claude carries an address (the
    // long case the head has to survive); everything else answers '' because it
    // cannot hold a second sign-in, and that must draw nothing at all.
    planUsageAccount: engine === 'claude' ? 'murvietnam@gmail.com' : '',
    // ‼️ X-244 — the pickable sign-ins. One per engine except Claude, which has
    // three: the standing one, one nearly full (the reason to look at all) and
    // one nobody has read yet, which must not draw as 0%.
    planUsageAccounts: accounts()
});

/** ‼️ X-244 — and the three arities the picker has, in one fixture: an engine
 *  with several sign-ins (a `<select>`), one with a single sign-in (the X-212
 *  label, unchanged) and one with none at all (nothing in the head). */
const accounts = () => ([
    {
        id: 'claude-murvietnam', engine: 'claude', label: 'murvietnam', standing: true,
        state: 'ok', percent: 86, plan: 'max', fetchedAt: NOW - 60000, note: '',
        health: 'ready', bars: engines()[0].bars
    },
    {
        id: 'claude-kateanhkim', engine: 'claude', label: 'kateanhkim', standing: false,
        state: 'ok', percent: 97, plan: 'pro', fetchedAt: NOW - 8 * 60000, health: 'ready',
        note: 'Read from this sign-in’s own record, on the accounts beat.',
        bars: [
            { id: 'five_hour', title: 'Current session', percent: 97, resetsAt: NOW + 22 * 60e3 },
            { id: 'seven_day', title: 'Current week (all models)', percent: 73, resetsAt: NOW + 2 * 86400e3 }
        ]
    },
    {
        id: 'claude-aicozums', engine: 'claude', label: 'aicozums', standing: false,
        state: 'unknown', percent: -1, plan: '', fetchedAt: 0, bars: [], health: 'ready',
        note: 'This sign-in has not been read yet — the Accounts page reads it.'
    },
    {
        id: 'codex-murposta', engine: 'codex', label: 'murposta', standing: true,
        state: 'ok', percent: 7, plan: 'plus', fetchedAt: NOW - 40 * 60000, note: '',
        health: 'ready', bars: engines()[1].bars
    }
]);

const data = () => base('claude');

const variants = () => ([
    { id: 'planusage', label: 'Plan usage — Claude (a live endpoint)', data: base('claude') },
    { id: 'planusage-codex', label: 'Plan usage — Codex (read off its own transcript)', data: base('codex') },
    {
        id: 'planusage-agy',
        label: 'Plan usage — Antigravity (‼️ two pools × two windows, read from its own /usage)',
        data: base('agy')
    },
    {
        // ‼️ THE ARITY THAT MUST NOT LOOK LIKE 0%. Before the first background
        // read lands the row is `unknown`: no bar, and the note says how the
        // figure is read rather than pretending it cannot be.
        id: 'planusage-agy-unread',
        label: 'Plan usage — Antigravity before its first read (‼️ not read yet, and NOT 0%)',
        data: (() => {
            const d = base('agy');
            d.planUsageEngines = d.planUsageEngines.map(e => e.id !== 'agy' ? e : {
                ...e, state: 'unknown', fetchedAt: 0, bars: [],
                note: 'Antigravity answers `/usage` in print mode (`agy -p /usage`, ~4 s, no token) and that '
                    + 'answer has not arrived here yet. It is read in the background; Check now asks at once.'
            });
            return d;
        })()
    },
    {
        // ‼️ U-59 — "no plan window" is a THIRD answer, and it is not the same
        // as Antigravity's "not published": nothing is being withheld here.
        id: 'planusage-opencode',
        label: 'Plan usage — OpenCode (‼️ no single window to be a percentage of — five tabs on one line)',
        data: base('opencode')
    },
    {
        // ‼️ X-244 — THE STATE THE PICKER EXISTS FOR, pressed rather than
        // posed: the card parked on a sign-in that is NOT the standing one.
        // Its bars, its plan, its reading time and its own note — and the head
        // still fits, which is the thing a picture answers and a string cannot.
        id: 'planusage-picked',
        label: 'Plan usage — parked on a sign-in that is not the standing one (‼️ picker changed)',
        data: base('claude'),
        act: (r) => {
            const sel = (r.query('#pu-account') || [])[0];
            if (!sel) { return; }
            sel.value = 'claude-kateanhkim';
            sel.fire('change');
        }
    },
    {
        // ‼️ X-244 — and the one nobody has read. A blank percentage here reads
        // as 0%, which is the figure that would send somebody to start a long
        // turn on an account nobody knows anything about.
        id: 'planusage-picked-unread',
        label: 'Plan usage — parked on a sign-in nobody has read yet (‼️ not 0%)',
        data: base('claude'),
        act: (r) => {
            const sel = (r.query('#pu-account') || [])[0];
            if (!sel) { return; }
            sel.value = 'claude-aicozums';
            sel.fire('change');
        }
    },
    {
        // ‼️ X-212 — the absence of a standing account is a NAME, not a gap.
        // Drawn beside the long-address case above so the head can be checked
        // at both extremes in one picture.
        id: 'planusage-global',
        label: 'Plan usage — the machine\'s own sign-in (‼️ named, never a blank)',
        data: { ...base('claude'), planUsageAccount: 'Machine Global' }
    }
]);

module.exports = { script: 'dashboard.js', data, variants, engines };
