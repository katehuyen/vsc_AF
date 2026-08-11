/**
 * The Projects page on the Analysis, Code and Backfill screens.
 *
 * ‼️ THE SHAPE IS THE POINT, TWICE OVER. A fixture where every block has enough
 * data makes the layout look complete and hides the case that actually matters:
 * a young project where the rhythm, the cycle time and the pace are all BELOW
 * their minimums and the tab is four "not enough yet" sentences. Both variants
 * are here, because the second one is what a project looks like in its first
 * fortnight and it has to read as an answer rather than as a broken page.
 */
const T = new Date(2026, 7, 11, 14, 0, 0).getTime();
const DAY = 86400000;

/** A Monday key, the way core/projectAnalysis.ts computes it. */
function week(back) {
    const d = new Date(T - back * 7 * DAY);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Twelve weeks with a real distribution: a quiet start, a burst, a plateau. */
function weeks() {
    const shape = [
        [1, 12, 2.4, 2, 1, 0], [0, 0, 0, 0, 0, 0], [2, 26, 6.1, 5, 3, 1],
        [4, 61, 14.2, 11, 5, 4], [6, 94, 22.8, 14, 6, 7], [3, 40, 9.9, 6, 2, 5],
        [0, 0, 0, 1, 0, 0], [5, 78, 19.4, 12, 4, 6], [7, 110, 28.1, 18, 9, 8],
        [4, 66, 15.7, 9, 3, 6], [6, 91, 21.3, 15, 5, 7], [2, 31, 7.2, 4, 2, 3]
    ];
    return shape.map((s, i) => ({
        week: week(shape.length - 1 - i),
        sessions: s[0], turns: s[1], cost: s[2], commits: s[3], opened: s[4], closed: s[5]
    }));
}

/** A rhythm with the shape a real one has: evenings and a weekend tail. */
function cells() {
    const out = [];
    const push = (dow, hour, turns) => out.push({ dow, hour, turns, sessions: Math.ceil(turns / 9) });
    [[1, 10, 34], [1, 14, 51], [1, 21, 40], [2, 9, 28], [2, 15, 62], [2, 22, 55],
    [3, 11, 44], [3, 16, 39], [3, 23, 71], [4, 10, 30], [4, 14, 48], [4, 20, 33],
    [5, 13, 26], [5, 17, 22], [6, 12, 18], [6, 23, 29], [0, 15, 24], [0, 22, 37]]
        .forEach(x => push(x[0], x[1], x[2]));
    return out;
}

const analysis = () => ({
    state: 'ok',
    generatedAt: T,
    weeks: weeks(),
    rhythm: {
        cells: cells(),
        peak: { dow: 3, hour: 23, turns: 71 },
        outOfHours: 0.463,
        total: 691
    },
    cycle: { n: 34, medianDays: 3.5, p90Days: 21.2, fastestDays: 0.1, slowestDays: 64.8 },
    files: [
        { key: 'D:\\dev\\git\\vsc_AgentFarm\\src\\extension.ts', n: 214, share: 0.31 },
        { key: 'D:\\dev\\git\\vsc_AgentFarm\\media\\projects.js', n: 138, share: 0.2 },
        { key: 'D:\\dev\\git\\vsc_AgentFarm\\CHANGELOG.md', n: 62, share: 0.09 },
        { key: 'D:\\dev\\git\\vsc_AgentFarm\\docs\\BLUEPRINT.tr.md', n: 47, share: 0.068 },
        { key: 'D:\\dev\\git\\vsc_AgentFarm\\media\\common.css', n: 39, share: 0.056 },
        { key: 'D:\\dev\\git\\vsc_AgentFarm\\src\\core\\tasks.ts', n: 31, share: 0.045 }
    ],
    agents: [
        { key: 'developer', n: 612, share: 0.886 },
        { key: 'manager', n: 79, share: 0.114 }
    ],
    totals: { sessions: 40, turns: 691, cost: 168.4, commits: 97, items: 58, closedItems: 34, files: 214 },
    pace: {
        recentPerWeek: 4.75, allPerWeek: 3.33,
        recentCostPerSession: 3.84, allCostPerSession: 4.21, weeksCovered: 12
    }
});

/** The other half of the honest distribution: a project two weeks old. */
const thinAnalysis = () => ({
    state: 'ok',
    generatedAt: T,
    weeks: [
        { week: week(1), sessions: 1, turns: 9, cost: 1.2, commits: 2, opened: 3, closed: 0 },
        { week: week(0), sessions: 2, turns: 14, cost: 2.8, commits: 5, opened: 1, closed: 1 }
    ],
    files: [{ key: 'D:\\dev\\new\\src\\index.ts', n: 6, share: 1 }],
    agents: [{ key: 'developer', n: 23, share: 1 }],
    totals: { sessions: 3, turns: 23, cost: 4, commits: 7, items: 4, closedItems: 1, files: 1 }
});

const code = () => ({
    state: 'ok',
    generatedAt: T,
    roots: [
        {
            root: 'D:\\zone\\dev\\git\\miropharm\\vsc_AgentFarm',
            commits: 97, lastCommitTs: T - 3600000,
            authors: [{ key: 'miropharm', n: 91, share: 0.938 }, { key: 'murat', n: 6, share: 0.062 }],
            perWeek: [1, 4, 9, 14, 11, 6, 12, 18, 9, 13].map((n, i) => ({ week: week(9 - i), n }))
        },
        {
            root: 'D:\\zone\\dev\\git\\miropharm\\muvu_talkScribe',
            missing: true, commits: 0, lastCommitTs: 0, authors: [], perWeek: []
        }
    ],
    sessionWrites: [
        { key: 'D:\\dev\\git\\vsc_AgentFarm\\src\\extension.ts', n: 214, share: 0.4 },
        { key: 'D:\\dev\\git\\vsc_AgentFarm\\media\\projects.js', n: 138, share: 0.26 },
        { key: 'D:\\zone\\know\\note\\obsidian\\00_AGENT_AREA\\Worklog.md', n: 44, share: 0.08 },
        { key: 'D:\\dev\\git\\vsc_AgentFarm\\media\\common.css', n: 39, share: 0.073 }
    ],
    totals: { roots: 2, missing: 1, commits: 97, writtenFiles: 214, writes: 531 }
});

const backfill = () => ({
    generatedAt: T,
    scanned: 63, noEvidence: 19, refused: 4,
    suggestions: [
        {
            sessionId: 'aaaa1111-2222-3333-4444-555566667777',
            title: 'ZEN sürüm notları ve mağaza metni',
            agentName: 'developer', cwd: 'D:\\agents\\developer',
            lastTs: T - 2 * 3600000, cost: 3.42,
            projectId: 'p2', projectName: 'TalkScribe', score: 60,
            signals: [
                { kind: 'files', weight: 60, detail: 'wrote 11 of 11 files under d:/zone/dev/git/miropharm/muvu_talkscribe' }
            ]
        },
        {
            sessionId: 'bbbb1111-2222-3333-4444-555566667777',
            title: 'köprü op listesini gözden geçir',
            agentName: 'developer', cwd: 'D:\\zone\\dev\\git\\miropharm',
            lastTs: T - 26 * 3600000, cost: 1.1,
            projectId: 'p1', projectName: 'PRS.MuratVural_DEV_VSC.AgentFarm', score: 52,
            signals: [
                { kind: 'cwd-cohort', weight: 45, detail: '9 other sessions from this exact folder are filed here' },
                { kind: 'name', weight: 15, detail: 'its title mentions "agentfarm"' }
            ]
        },
        {
            sessionId: 'cccc1111-2222-3333-4444-555566667777',
            title: 'kısa bir bakış',
            agentName: 'manager', cwd: 'D:\\zone\\dev\\git\\miropharm',
            lastTs: T - 3 * DAY, cost: 0.4,
            projectId: 'p1', projectName: 'PRS.MuratVural_DEV_VSC.AgentFarm', score: 27,
            alsoId: 'p2', alsoName: 'TalkScribe', alsoScore: 25, contested: true,
            signals: [
                { kind: 'cwd-cohort', weight: 22, detail: '5 of 9 sessions from this exact folder are filed here — the folder is split' },
                { kind: 'agent', weight: 5, detail: '52% of manager\'s filed sessions are in this project' }
            ]
        },
        {
            sessionId: 'dddd1111-2222-3333-4444-555566667777',
            title: 'akşam üstü kısa bir düzeltme turu',
            agentName: 'developer', cwd: 'D:\\agents\\developer',
            lastTs: T - 5 * DAY, cost: 0.9,
            projectId: 'p1', projectName: 'PRS.MuratVural_DEV_VSC.AgentFarm', score: 31,
            signals: [
                { kind: 'files', weight: 31, detail: 'wrote 3 of 6 files under d:/zone/dev/git/miropharm/vsc_agentfarm' }
            ]
        }
    ]
});

const project = {
    id: 'p1', name: 'PRS.MuratVural_DEV_VSC.AgentFarm', status: 'active', kind: 'product',
    summary: 'Claude Code başta olmak üzere yapay zeka ajanlarını yönetmek için kurulmuş bir VSCode eklentisi',
    folder: 'D:\\zone\\know\\note\\obsidian\\00_AGENT_AREA\\10_PROJECTS\\PRS.MuratVural_DEV_VSC.AgentFarm',
    folderState: 'ok', repos: ['D:\\zone\\dev\\git\\miropharm\\vsc_AgentFarm'], parentId: null,
    tags: ['ajan', 'agent'], people: [{ name: 'Murat Vural', role: 'owner' }], agentRules: [],
    budgetUSD: 0, budgetTotalUSD: 0, sessions: 40, cost: 168.4, todayCost: 12.2,
    tokens: 41200000, lastTs: T, warnings: []
};
const second = {
    id: 'p2', name: 'TalkScribe', status: 'active', kind: 'product',
    summary: 'Sesli dikte ürün ailesi', folder: '', folderState: 'unset',
    repos: ['D:\\zone\\dev\\git\\miropharm\\muvu_talkScribe'], parentId: null,
    tags: [], people: [], agentRules: [], budgetUSD: 0, budgetTotalUSD: 0,
    sessions: 12, cost: 40.1, todayCost: 0, tokens: 9000000, lastTs: T - DAY, warnings: []
};

const data = (over) => Object.assign({
    generatedAt: T, projects: [project, second], agents: ['developer', 'manager'], activeId: 'p1',
    activeName: 'PRS.MuratVural_DEV_VSC.AgentFarm',
    projectsRoot: 'D:\\zone\\know\\note\\obsidian\\00_AGENT_AREA\\10_PROJECTS',
    unassigned: { sessions: 63, cost: 41.8 }, unfiledKinds: [], docPath: '',
    docOpen: { mode: 'obsidian', modes: ['vscode', 'preview', 'obsidian'], labels: { vscode: 'Editor', preview: 'Preview', obsidian: 'Obsidian' } },
    focusId: null, newForm: null, tab: 'analysis', tabProject: 'p1',
    tabData: { analysis: analysis() }
}, over || {});

/** Press the ⊘ Unassigned row — the same click a reader makes. */
const openBackfill = (r) => {
    const b = r.query('[data-act="backfill"]')[0];
    if (!b) { throw new Error('no backfill row'); }
    b.click();
};

module.exports = {
    script: 'projects.js',
    data, analysis, thinAnalysis, code, backfill,
    variants: () => [
        { id: 'analysis', label: 'Analysis', data: data() },
        {
            id: 'thin', label: 'Analysis → a two-week-old project',
            data: data({ tabData: { analysis: thinAnalysis() } })
        },
        { id: 'code', label: 'Code', data: data({ tab: 'code', tabData: { code: code() } }) },
        {
            id: 'backfill', label: 'Backfill',
            // The screen needs the report in `tabData` AND the page's own flag,
            // which the click sets — the same two-step the host does.
            data: data({ tabData: { backfill: backfill() } }),
            act: openBackfill
        }
    ]
};
