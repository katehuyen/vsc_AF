/**
 * Faz 7 on the Projects page — sub-projects, the template picker, and the
 * button that moves a folder.
 *
 * ‼️ THE SHAPE IS THE POINT. A parent with one tidy part makes any layout look
 * fine; the real case is a product with two apps whose figures are LARGER than
 * the parent's own — which is exactly how a "+$40 in 2 parts" chip next to a
 * "$3.20 total" reads as a contradiction unless it says what it is. So the
 * parts here carry most of the money, one of them is finished while its parent
 * is active, and the names are the length people actually use.
 */
const T = Date.parse('2026-08-11T09:20:00Z');
const H = 3600000;
const DAY = 86400000;

const parent = {
    id: 'p1', name: 'TalkScribe', status: 'active', kind: 'product',
    summary: 'Sesli dikte ürün ailesi — mağazada iki canlı uygulama',
    folder: 'D:\\zone\\know\\note\\obsidian\\00_AGENT_AREA\\10_PROJECTS\\TalkScribe',
    folderState: 'ok', repos: ['D:\\zone\\dev\\git\\miropharm\\muvu_talkScribe'],
    parentId: null, parent: null,
    children: [
        { id: 'p2', name: 'TalkScribe ZEN', status: 'active', sessions: 41, cost: 62.8, lastTs: T - 2 * H },
        { id: 'p3', name: 'TalkScribe ZEP', status: 'done', sessions: 18, cost: 21.35, lastTs: T - 26 * DAY }
    ],
    parts: { n: 2, sessions: 59, cost: 84.15, todayCost: 1.4, lastTs: T - 2 * H },
    archived: false,
    tags: ['ses', 'dikte'], people: [{ name: 'Murat Vural', role: 'owner' }], agentRules: ['developer'],
    budgetUSD: 0, budgetTotalUSD: 0, sessions: 9, cost: 11.6, todayCost: 0.8,
    tokens: 4100000, lastTs: T - 5 * H, warnings: []
};

const zen = {
    id: 'p2', name: 'TalkScribe ZEN', status: 'active', kind: 'product',
    summary: 'Chrome eklentisi — Web Store\'da yayında',
    folder: 'D:\\zone\\know\\note\\obsidian\\00_AGENT_AREA\\10_PROJECTS\\TalkScribe ZEN',
    folderState: 'ok', repos: ['D:\\zone\\dev\\git\\miropharm\\muvu_talkScribe\\ZEN'],
    parentId: 'p1', parent: { id: 'p1', name: 'TalkScribe', status: 'active' },
    children: [], parts: null, archived: false,
    tags: ['chrome'], people: [], agentRules: [],
    budgetUSD: 0, budgetTotalUSD: 0, sessions: 41, cost: 62.8, todayCost: 1.4,
    tokens: 22400000, lastTs: T - 2 * H, warnings: []
};

const zep = {
    id: 'p3', name: 'TalkScribe ZEP', status: 'done', kind: 'product',
    summary: 'Android uygulaması — Google Play\'de yayında',
    folder: 'D:\\zone\\know\\note\\obsidian\\00_AGENT_AREA\\99_ARCHIVE\\10_PROJECTS_ARCHIVE\\TalkScribe ZEP',
    folderState: 'ok', repos: [], parentId: 'p1',
    parent: { id: 'p1', name: 'TalkScribe', status: 'active' },
    children: [], parts: null, archived: true,
    tags: [], people: [], agentRules: [],
    budgetUSD: 0, budgetTotalUSD: 0, sessions: 18, cost: 21.35, todayCost: 0,
    tokens: 8100000, lastTs: T - 26 * DAY, warnings: []
};

/** The Overview tab's own payload — the same shape the host builds. */
const overview = () => ({
    activity: {
        running: [
            {
                title: 'ZEN sürüm notlarını hazırla', what: 'task', agent: 'developer',
                since: T - 40 * 60000
            }
        ],
        next: [
            { title: 'Mağaza metnini güncelle', agent: 'developer', createdAt: T - 20 * 60000, held: '' }
        ]
    },
    cost: {
        total: 11.6, today: 0.8,
        burn: { todayPct: 0, perDay7: 1.4, projectedAtDue: null, daysToBudget: null }
    },
    recent: [
        {
            ts: T - 5 * H, kind: 'session', title: 'Faz 7 — devir belgesi',
            detail: 'developer', agent: 'developer', cost: 0.42, tone: '', link: null
        },
        {
            ts: T - 30 * H, kind: 'deliverable', title: 'ZEN 1.4 — Chrome Web Store',
            detail: '1.4.0', agent: '', cost: 0, tone: 'ok', link: null
        },
        {
            ts: T - 3 * DAY, kind: 'decision', title: 'Bir oturum tam olarak bir projeye aittir',
            detail: '20_Decisions/one-session.md', agent: '', cost: 0, tone: '', link: null
        }
    ]
});

const TEMPLATES = [
    {
        name: 'Ürün projesi', description: 'mağazaya çıkan bir uygulama',
        carries: 'product · 1 repo · 1 agent rule · 4 plan items · 3 backlog items'
    },
    { name: 'Müşteri işi', description: '', carries: 'customer · 2 person/people · a budget' }
];

const data = (over) => Object.assign({
    generatedAt: T,
    projects: [parent, zen, zep],
    agents: ['developer', 'manager'],
    activeId: 'p1', activeName: 'TalkScribe',
    projectsRoot: 'D:\\zone\\know\\note\\obsidian\\00_AGENT_AREA\\10_PROJECTS',
    archiveRoot: 'D:\\zone\\know\\note\\obsidian\\00_AGENT_AREA\\99_ARCHIVE\\10_PROJECTS_ARCHIVE',
    templates: TEMPLATES,
    unassigned: { sessions: 2, cost: 3.1 }, unfiledKinds: [], docPath: '',
    docOpen: {
        mode: 'obsidian', modes: ['vscode', 'preview', 'obsidian'],
        labels: { vscode: 'Editor', preview: 'Preview', obsidian: 'Obsidian' }
    },
    focusId: null, newForm: null, tab: 'overview', tabProject: 'p1',
    tabData: overview()
}, over || {});

module.exports = {
    script: 'projects.js',
    data,
    overview,
    variants: () => [
        {
            id: 'parent', label: 'Overview → a project with parts',
            data: data()
        },
        {
            // the part's OWN figures, not its parent's — a fixture that reused
            // them would make the two pages look identical, which is exactly
            // the confusion this feature has to avoid
            id: 'child', label: 'Overview → one of the parts (Part of …)',
            data: data({
                focusId: 'p2', tabProject: 'p2',
                tabData: Object.assign(overview(), {
                    cost: {
                        total: 62.8, today: 1.4,
                        burn: { todayPct: 0, perDay7: 3.9, projectedAtDue: null, daysToBudget: null }
                    }
                })
            })
        },
        {
            id: 'settings', label: 'Settings → archive the folder',
            data: data({ tab: 'settings', tabData: {} })
        },
        {
            id: 'settings-archived', label: 'Settings → already archived (restore)',
            data: data({ focusId: 'p3', tabProject: 'p3', tab: 'settings', tabData: {} })
        }
    ]
};
