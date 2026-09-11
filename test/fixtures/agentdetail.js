/**
 * The AGENT page — the one major surface with no picture until now.
 *
 * ‼️ THE SHAPE IS AN AGENT DRIVEN ON MORE THAN ONE ENGINE. That is the case the
 * page's own hedges exist for: the money, the model split and the daily chart
 * are measured off Claude's transcript format, the Sessions table lists every
 * engine, and the Health findings are counted from the Claude half only. A
 * fixture that is all Claude draws none of those sentences and would have let
 * the scope line under "Health & optimization" ship unseen.
 *
 * Turkish text at the length people actually write, and a findings list with
 * the real distribution: a couple of warnings worth acting on and a tail of
 * info rows, not one tidy example of each severity.
 */
const dash = require('./dashboard.js');

/**
 * ‼️ THIS PAGE'S SUBJECT IS "THE LAST N DAYS", SO ITS CLOCK CANNOT BE FROZEN.
 *
 * It was pinned to a date, and the page computes its 7 / 30 / 90 / 365 ranges
 * from the REAL clock — so the fixture aged out of its own picture. Measured
 * exactly thirty days after that date: the 7d and 30d cards both drew ZERO next
 * to a card saying 61 all-time, which is the very form the spans were added to
 * stop the screenshot documenting, and `test_agent_range.js` went red for the
 * calendar rather than for the code.
 *
 * A frozen clock is right for a fixture whose subject is a fixed moment (a
 * refresh time, a due date). Where the subject is a WINDOW ending now, `now` is
 * the only anchor that stays true — which is what `console`, `dashboard`,
 * `missions`, `tasks`, `timeline` and `turns` all already do.
 */
const NOW = Date.now();
const DAY = 86400000;

// The same scope sentence `claudeOnlyScopeNote` builds, verbatim — the page is
// given one line for the whole table, not one per finding.
const SCOPE = 'This figure covers Claude Code only — 37 sessions on other engines '
    + '(Codex ×31 · Antigravity ×4 · Gemini ×2) are not in it, because the measurement '
    + 'is defined against Claude\'s transcript format and would read zero or read wrong '
    + 'on a foreign one. They are listed on the Sessions page.';

const memoryFiles = [
    { path: 'D:/zone/agent/ajanlar/developer/memory/MEMORY.md', name: 'MEMORY.md', size: 4210, mtime: NOW - 2 * DAY, tokens: 1180, recalls: -1, orphan: false },
    { path: 'D:/zone/agent/ajanlar/developer/memory/proje_talkscribe.md', name: 'proje_talkscribe.md', size: 18400, mtime: NOW - 5 * DAY, tokens: 5120, recalls: 14, orphan: false },
    { path: 'D:/zone/agent/ajanlar/developer/memory/feedback_agentfarm_cross_engine.md', name: 'feedback_agentfarm_cross_engine.md', size: 2600, mtime: NOW - 60 * DAY, tokens: 720, recalls: 0, orphan: false },
    { path: 'D:/zone/agent/ajanlar/developer/memory/reference_edit_araci_nul_tuzagi.md', name: 'reference_edit_araci_nul_tuzagi.md', size: 1900, mtime: NOW - 88 * DAY, tokens: 540, recalls: 0, orphan: true }
];

const duties = [
    {
        title: 'Sürüm sonrası mağaza notlarını güncelle', cadence: 'weekly', paused: false,
        watch: 'D:/zone/dev/git/miropharm/muvu_talkScribe/ZEN/CHANGELOG.md', action: 'yeni sürüm varsa mağaza metnini tazele',
        note: '', status: '1 dosya beklemede', pending: true, missing: false
    },
    {
        title: 'Notices üzerindeki cevaplanmış soruları kapat', cadence: 'every-turn', paused: false,
        watch: '', action: 'cevaplananı uygula ve resolve et', note: '',
        status: '—', pending: false, missing: false
    },
    {
        title: 'Antigravity oturum arşivini tara', cadence: 'daily', paused: true,
        watch: 'D:/zone/agent/ajanlar/developer/arsiv', action: 'yeni konuşma varsa özetle',
        note: 'motor tarafı netleşene kadar duraklatıldı', status: 'paused', pending: false, missing: false
    }
];

const insights = [
    {
        severity: 'warning', category: 'duties',
        message: 'Agent had 6 session(s) this week but never read DUTIES.md — its 2 standing duties may be ignored.',
        filePath: 'D:/zone/agent/ajanlar/developer/DUTIES.md', anchor: 'nobet-gorevleri'
    },
    {
        severity: 'warning', category: 'trend',
        message: 'Weekly cost trend: $84.20 this week vs $31.10 last week (2.7x).',
        filePath: '', anchor: 'trend-uyarilari'
    },
    {
        severity: 'info', category: 'mcp',
        message: 'MCP server "chrome-devtools" is defined but unused in the last 30 days — consider removing it (it may still cost startup time/context).',
        filePath: 'D:/zone/agent/ajanlar/developer/.mcp.json', anchor: 'mcp-yonetimi'
    },
    {
        severity: 'info', category: 'skills',
        message: 'Skill "account-signup" was not invoked in the last 30 days — its description still rides along in every session; remove or merge it if it earns nothing.',
        filePath: 'D:/zone/agent/ajanlar/developer/.claude/skills/account-signup/SKILL.md', anchor: 'skill-yonetimi'
    },
    {
        severity: 'info', category: 'memory-index',
        message: 'memory/reference_edit_araci_nul_tuzagi.md is on disk but not in MEMORY.md — it will never be recalled on purpose.',
        filePath: 'D:/zone/agent/ajanlar/developer/memory/MEMORY.md', anchor: 'hafiza-indeksi'
    }
];

const daily = {};
for (let i = 13; i >= 0; i--) {
    const key = new Date(NOW - i * DAY).toISOString().slice(0, 10);
    const weekend = [0, 6].indexOf(new Date(NOW - i * DAY).getUTCDay()) >= 0;
    daily[key] = {
        cost: weekend ? 0.4 + (i % 3) * 0.2 : 4.2 + (i % 5) * 2.6,
        tokens: weekend ? 220000 : 1_400_000 + (i % 4) * 380_000,
        wTokens: weekend ? 48000 : 310_000 + (i % 4) * 61_000,
        msgs: weekend ? 9 : 74 + (i % 6) * 11
    };
}

const data = () => ({
    agent: {
        id: 'developer', name: 'developer', dir: 'D:/zone/agent/ajanlar/developer',
        active: true,
        contextLoad: { total: 24800, claudeMd: 6100, memory: 9400, tools: 3100, settings: 900, duties: 5300 },
        contextBudget: 20000,
        permissionSummary: '12 allow · 3 ask · 1 deny',
        claudeMdPath: 'D:/zone/agent/ajanlar/developer/CLAUDE.md',
        memoryIndexPath: 'D:/zone/agent/ajanlar/developer/memory/MEMORY.md',
        memoryFiles,
        toolFiles: [{ path: 'D:/zone/agent/ajanlar/developer/tools/paket.md', name: 'paket.md' }],
        dutiesPath: 'D:/zone/agent/ajanlar/developer/DUTIES.md',
        duties
    },
    /**
     * ‼️ X-262 — what the three start controls would actually run as, so the
     * MIRROR hover on them can be LOOKED AT. Without this the fixture exercises
     * only the documented absent case (a page built before the host sent it),
     * which is the one shape that was never the bug.
     */
    nextLaunch: {
        engine: 'claude', model: 'opus', effort: 'xhigh',
        permissionMode: 'bypassPermissions',
        remembered: true, accountAxis: true, accountStated: false,
        account: {
            id: 'claude-murvietnam-2', label: 'murvietnam-2', health: 'ready',
            active: true, percent: 91, resetsAt: NOW + 42 * 60000
        }
    },
    contextHealth: {
        memory: { files: 3, tokens: 6380, orphans: 1, notRecalled: 2, stale: 2 },
        skills: { total: 4, unused: 1 },
        mcp: { total: 5, unused: 1, disabled: 1 },
        duties: { active: 2, paused: 1, lastReadTs: NOW - 9 * DAY, sessionsThisWeek: 6 }
    },
    taskHealth: {
        total: 46, done: 38, failed: 5, cancelled: 1, queued: 0, running: 2,
        successRate: 0.83, medianDurationMs: 7 * 60000, retries: 4, failStreak: 2,
        lastFailure: { title: 'ZEP sürüm notunu hazırla', ts: NOW - 5 * 3600000 },
        verifyPass: 21, verifyFail: 3, mediaCostUsd: 1.4,
        sources: { task: 30, schedule: 9, trigger: 5, mission: 2 }
    },
    totals: {
        cost: 268.4, sessions: 24, toolCalls: 3180, errors: 41,
        avgCostPerSession: 268.4 / 24,
        byEngine: { claude: 24, codex: 31, agy: 4, gemini: 2 },
        measuredSessions: 24, allSessions: 61
    },
    daily,
    tools: {
        Read: 940, Edit: 612, Bash: 588, Grep: 402, Write: 188, Glob: 151,
        Task: 44, WebFetch: 31, TodoWrite: 22
    },
    models: {
        'claude-opus-5': { cost: 214.6, tokens: 41_200_000, wTokens: 9_100_000 },
        'claude-haiku-4-5': { cost: 53.8, tokens: 12_400_000, wTokens: 2_050_000 }
    },
    pricing: [
        { match: 'opus', input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
        { match: 'haiku', input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 }
    ],
    insights,
    // ‼️ THE LINE THIS FIXTURE EXISTS TO SHOW. Said once, above the table.
    insightScope: SCOPE,
    sessions: dash.sessionRows(),
    sessionTableN: 20,
    /**
     * ‼️ U-111 — ALL 61 SESSIONS' SPANS, not the table pool's three.
     *
     * The "Sessions - <range>" card counts these, deliberately: `sessions`
     * above is a POOL capped at the table's N, so counting it would draw a
     * floor. A fixture that left this out would render the card as ZERO on a
     * page whose other card says 61 all time - and the picture would document
     * a form nobody could have shipped.
     *
     * Shaped like real history rather than evenly: most of the work is in the
     * last fortnight, a tail runs back three months, and two of them SPAN a
     * day boundary, which is the case the overlap rule exists for.
     */
    sessionSpans: (() => {
        const out = [];
        // 34 in the last 14 days - the busy stretch the 30d default shows
        for (let i = 0; i < 34; i++) {
            const end = NOW - Math.floor(i * 0.4) * DAY - (i % 5) * 3600000;
            out.push([end - (20 + (i % 7) * 15) * 60000, end]);
        }
        // 18 more across the previous two months
        for (let i = 0; i < 18; i++) {
            const end = NOW - (16 + i * 3) * DAY;
            out.push([end - 90 * 60000, end]);
        }
        // 7 older still, out past 90 days
        for (let i = 0; i < 7; i++) {
            const end = NOW - (95 + i * 9) * DAY;
            out.push([end - 45 * 60000, end]);
        }
        // the two that cross midnight: a session opened yesterday evening and
        // finished this morning belongs to BOTH days
        out.push([NOW - 30 * 3600000, NOW - 20 * 3600000]);
        out.push([NOW - 8 * DAY - 4 * 3600000, NOW - 7 * DAY - 21 * 3600000]);
        return out;   // 61, matching totals.allSessions
    })(),
    dutyMeta: {
        cadences: ['every-turn', 'session-start', 'daily', 'weekly', 'monthly']
            .map(c => ({ id: c, label: c, title: '' })),
        templates: [
            { id: '0', label: 'Klasör nöbeti', detail: 'bir klasöre düşeni işle', watchKind: 'folder', title: 'Gelen kutusunu boşalt', cadence: 'daily', action: 'dosyayı incele ve dosyala' }
        ],
        agents: [{ id: 'manager', name: 'manager', titles: ['Günlük özet'] }]
    }
});

const variants = () => ([
    {
        id: 'agentdetail',
        label: 'Agent page — an agent driven on four engines, findings scoped once',
        data: data()
    }
]);

module.exports = { script: 'agentDetail.js', data, variants };
