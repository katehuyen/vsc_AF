/**
 * U-39 / X-27 — the Sessions page under the content that broke it.
 *
 * A short project name cannot prove that the Project cell stays inside its
 * declared column, and one engine cannot prove the shared filter exists. Keep
 * both stresses in the visual fixture: Turkish project text much wider than
 * the column, and one row from every engine (including Claude's empty id).
 */
const NOW = Date.parse('2026-08-11T13:00:00Z');

const row = (n, extra) => Object.assign({
    file: `session-${n}.jsonl`, sessionId: `session-${n}`, agent: 'developer',
    agentName: 'developer', cwd: 'D:/zone/agent/ajanlar/developer',
    title: `Oturum ${n} — uzun başlık proje sütununun yanında okunabilmeli`,
    autoTitle: '', ts: NOW - n * 60000, firstTs: NOW - n * 360000,
    durationMin: 17 + n, turns: 4 + n, toolCalls: 11 + n, errors: 0,
    tokens: 12000 + n * 900, wTokens: 8000 + n * 700, ctx: 64000 + n * 1000,
    cost: 1.2 + n / 10, sidechain: false, origin: 'user', pinned: false,
    tags: [], project: 'PRS.MuratVural_DEV_VSC.AgentFarm — çok uzun proje adı',
    projectIcon: '◧', projectColor: '#8b5cf6', files: 3, active: n === 1,
    models: ['model-' + n], apiCalls: 8,
    usage: { input: 3000, output: 1200, cacheRead: 7000, cacheWrite: 800 },
    topTools: []
}, extra || {});

const data = () => ({
    generatedAt: NOW,
    agents: ['developer', 'manager'],
    totals: { sessions: 4, active: 1 },
    scope: { project: '', agentName: '' },
    sessions: [
        row(1, { engine: '', models: ['claude-opus-5'] }),
        row(2, { engine: 'codex', models: ['gpt-5.6-sol'] }),
        row(3, { engine: 'agy', models: ['gemini-3.5-flash'] }),
        row(4, { engine: 'gemini', models: ['gemini-2.5-pro'] }),
        // ‼️ S-32 — the row whose transcript was too large to read. Its figures
        // are unread zeros, so the badge has to be visible enough that nobody
        // takes the row for a session that ran and did nothing.
        row(5, {
            engine: 'codex', models: ['gpt-5.6-sol'],
            title: 'Oturum 5 — transcript tarama sınırının üstünde',
            turns: 0, toolCalls: 0, tokens: 0, wTokens: 0, ctx: 0, cost: 0,
            files: 0, apiCalls: 0, durationMin: 0,
            usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            scanLimit: { bytes: 31_457_280, limit: 24 * 1024 * 1024 }
        })
    ],
    sessionTableN: 200
});

// X-33 — the filter panel is a surface of its own and had never been looked at:
// its controls carried thin native tooltips, and three of them carried none.
const variants = () => [
    { id: 'table', label: 'Sessions — the table', data: data() },
    {
        id: 'filters', label: 'Sessions — the filter panel open', data: data(),
        act: (r) => { r.query('.af-filter')[0].click(); }
    }
];

module.exports = { script: 'sessionsPage.js', data, variants };
