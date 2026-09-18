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
    // ‼️ S-53 — three duration figures, because the column now shows the third.
    // `durationMin` is the wall clock, `activeMin` is it less any absence, and
    // `busyMin` is the turns' own time added up — which on an ordinary session
    // worked at a keyboard is roughly half the span, the rest being somebody
    // reading the answer and typing the next thing.
    durationMin: 17 + n, activeMin: 17 + n, busyMin: 8 + n,
    turns: 4 + n, toolCalls: 11 + n, errors: 0,
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
        // X-102 - a run whose launch WAS recorded: the Engine cell can say what
        // it was asked to be beside what answered. A third-party route, so the
        // profile revision matters and the models genuinely came from elsewhere.
        row(1, {
            engine: '', models: ['claude-opus-5'],
            launch: {
                route: 'Kimi (work)', revision: 3, requested: 'tier opus - kimi-k2-thinking',
                // X-251 — whose plan paid; the row below deliberately has none,
                // because a run that injected no sign-in must stay silent.
                account: 'claude-work',
                surface: 'terminal', at: NOW - 400000, agreement: 'matched', note: '',
                // X-110 - and the identity behind that route, which is what the
                // CHIP is drawn from. A row with a route and no identity would
                // photograph the cell as it was before the chip existed.
                identity: {
                    providerId: 'kimi', providerLabel: 'Kimi (work)', binding: 'declared',
                    proof: 'matched', reportedProviderIds: ['kimi'],
                    providerProfileRevision: 3, requestedModelRef: 'kimi-k2-thinking'
                }
            }
        }),
        // ...and one where the two halves disagree, which is the only case the
        // Note line ever appears in. It reads as a reason to LOOK, never a verdict.
        row(2, {
            engine: 'codex', models: ['gpt-5.6-sol'],
            launch: {
                route: 'inherited route', revision: null, requested: 'gpt-5.6-thinking',
                surface: 'console', at: NOW - 900000, agreement: 'unproven',
                note: 'the model that answered is not one of the names the launch asked for'
            }
        }),
        // ‼️ X-110 - THE RUN THAT CHANGED PROVIDER BETWEEN TURNS. The chip must
        // COUNT here rather than name one of them, and a page that only ever
        // draws the single-provider case photographs neither the count nor the
        // fact that it wears no provider hue.
        row(6, {
            engine: 'opencode', models: ['claude-opus-5', 'gpt-5.6-sol'],
            title: 'Oturum 6 - saglayici tur sinirinda degisti',
            launch: {
                route: 'anthropic', revision: null, requested: 'anthropic/claude-opus-5',
                surface: 'console', at: NOW - 600000, agreement: 'matched', note: '',
                identity: {
                    providerId: 'anthropic', providerLabel: 'anthropic', binding: 'declared',
                    proof: 'matched', multiProvider: true, turnScope: true,
                    reportedProviderIds: ['anthropic', 'openai'],
                    requestedModelRef: 'claude-opus-5'
                }
            }
        }),
        row(3, { engine: 'agy', models: ['gemini-3.5-flash'] }),
        row(4, { engine: 'gemini', models: ['gemini-2.5-pro'] }),
        // ‼️ S-32 — the row whose transcript was too large to read. Its figures
        // are unread zeros, so the badge has to be visible enough that nobody
        // takes the row for a session that ran and did nothing.
        row(5, {
            engine: 'codex', models: ['gpt-5.6-sol'],
            title: 'Oturum 5 — transcript tarama sınırının üstünde',
            turns: 0, toolCalls: 0, tokens: 0, wTokens: 0, ctx: 0, cost: 0,
            // ‼️ S-53 — and its duration figures are ABSENT rather than zero-ish:
            // a transcript nobody could read has no turns to add up, and the
            // host only sends `busyMin` where it was measured. Leaving the base
            // row's figures on here drew "13m" beside "0 turns", which is the
            // reading this row exists to prevent.
            files: 0, apiCalls: 0, durationMin: 0, activeMin: 0, busyMin: undefined,
            usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            scanLimit: { bytes: 31_457_280, limit: 24 * 1024 * 1024 }
        }),
        // ‼️ S-52 — THE SESSION THAT WAS SLEPT ON. Picked up again the next
        // morning, so its wall clock is more than a day and the work inside it
        // is fifty minutes. The cell has to show the fifty and mark the gap
        // legibly enough at this size that nobody reads "50m" as the whole
        // story — the ⋯ and the figures behind it are the whole point of the
        // item, and a mark too faint to see is the bug unfixed.
        row(11, {
            engine: '', models: ['claude-opus-5'],
            title: 'Oturum 11 — dün akşam başladı, bu sabah devam etti',
            firstTs: NOW - 26 * 3600000,
            // ‼️ S-53 — and of the fifty it was here for, thirty-two were the
            // engine answering. The cell leads with the thirty-two; the ⋯ still
            // carries the wall clock, and the panel accounts for the eighteen
            // in between so the figure is not seen to shrink for no reason.
            durationMin: 1550, activeMin: 50, busyMin: 32, awayMin: 1500, breaks: 2,
            turns: 9, apiCalls: 26, cost: 6.4
        }),
        // ‼️ S-35 — the two robots that used to look identical. Both are
        // origin 'auto'; only the first ran with no terminal behind it, and the
        // 🌙 that says so has to be legible at 9px beside the 🤖 it qualifies.
        row(6, {
            engine: '', models: ['claude-haiku-4-5'], origin: 'auto', headless: true,
            title: 'Oturum 6 — zamanlanmış headless koşu',
            entrypoint: 'sdk-cli',
            launchedBy: { kind: 'schedule', label: 'Backlog ilerleme' }
        }),
        row(7, {
            engine: '', models: ['claude-opus-5'], origin: 'auto', headless: false,
            title: 'Oturum 7 — görev, ama gerçek bir terminalde',
            entrypoint: 'cli',
            // S-41 — `mode` is what the host now sends for such a run, and it
            // is what makes the row Auto without the moon.
            launchedBy: { kind: 'task', label: 'ZEN sürüm notu', mode: 'interactive' }
        }),
        // ‼️ X-95 — the third kind of row. Two missions, so the picker has
        // something to choose BETWEEN and the 🎯 chip has a count to draw; both
        // are hidden by default, which is exactly why they are in the fixture —
        // the only way to look at them is the chip that admits they are gone.
        row(8, {
            engine: '', models: ['claude-opus-5'], origin: 'auto', headless: true,
            title: 'Oturum 8 — misyon planlayıcısının kendi hattı',
            entrypoint: 'sdk-cli',
            launchedBy: { kind: 'mission', label: 'Görüntüleyiciyi bitir — planner' },
            mission: { id: 'run-a', title: 'Görüntüleyiciyi bitir' }
        }),
        row(9, {
            engine: 'codex', models: ['gpt-5.6-sol'], origin: 'auto', headless: true,
            title: 'Oturum 9 — misyonun bir delegasyonu',
            entrypoint: 'sdk-cli',
            launchedBy: { kind: 'mission', label: 'Testleri yaz' },
            mission: { id: 'run-a', title: 'Görüntüleyiciyi bitir' }
        }),
        row(10, {
            engine: '', models: ['claude-haiku-4-5'], origin: 'auto', headless: true,
            title: 'Oturum 10 — başka bir misyonun delegasyonu',
            entrypoint: 'sdk-cli',
            launchedBy: { kind: 'mission', label: 'Belgeleri güncelle' },
            mission: { id: 'run-b', title: 'Belgeleri yeniden yaz' }
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
    },
    // S-35 — compare You and Auto with both independent categories switched on;
    // otherwise the default You-only table has no robot in it at all.
    {
        id: 'origins', label: 'Sessions — every origin, filters open (🧑 · 🤖 · 🤖🌙)',
        data: data(),
        act: (r) => { r.query('.af-cat-auto')[0].click(); r.query('.af-filter')[0].click(); }
    },
    // ‼️ X-95 — the mission rows and the row of controls that governs them. They
    // are invisible in every variant above, by design: this is the only one that
    // shows what the 🎯 chip is hiding, the glyph it is hiding it behind, and
    // the picker that lets one mission through at a time.
    {
        id: 'missions', label: 'Sessions — mission sessions listed (🎯), filters open',
        data: data(),
        act: (r) => { r.query('.af-cat-mission')[0].click(); r.query('.af-filter')[0].click(); }
    },
    // …and what a mission's own Sessions button opens: this run and nothing
    // else, with its category and specific-mission picker visible.
    {
        id: 'mission-scope', label: 'Sessions — opened from one mission',
        data: Object.assign(data(), {
            scope: {
                project: '', agentName: '',
                missionId: 'run-a', missionTitle: 'Görüntüleyiciyi bitir'
            }
        })
    }
];

module.exports = { script: 'sessionsPage.js', data, variants };
