/**
 * The Projects page, on the Work tab, with five stores shaped like real ones.
 *
 * ‼️ THE SHAPE IS THE POINT. A fixture with one running task and one done one
 * makes any layout look balanced; a real project's work is mostly FINISHED,
 * with two or three things alive and a long tail behind them — which is exactly
 * how a card that shouts on `done` turns the page into one flat green, and how
 * a "Done" group with no cap becomes the whole page. So the rows here follow
 * the real distribution: a couple running, a few needing you, a queue that is
 * mostly closed, and Turkish text at the length people actually write.
 */
const T = Date.parse('2026-08-11T09:20:00Z');
const H = 3600000;
const DAY = 86400000;

let n = 0;
const id = (p) => p + '_' + (++n).toString(36) + 'k7q';

const TASKS = [
    {
        id: id('t'), title: 'ZEN sürüm notlarını hazırla ve mağaza metnini güncelle',
        agent: 'developer', status: 'running', mode: 'headless', engine: '', model: 'opus',
        createdAt: T - 2 * H, startedAt: T - 40 * 60000, endedAt: 0, costUSD: 1.82,
        missionId: null, live: true, held: ''
    },
    {
        id: id('t'), title: 'Backlog kalemlerini kod sırasına göre topla', agent: 'manager',
        status: 'running', mode: 'headless', engine: 'codex', model: '',
        createdAt: T - 3 * H, startedAt: T - 12 * 60000, endedAt: 0, costUSD: 0,
        missionId: null, live: true, held: ''
    },
    {
        id: id('t'), title: 'Haftalık proje özetini çıkar', agent: 'manager', status: 'queued',
        mode: 'headless', engine: '', model: 'haiku', createdAt: T - 20 * 60000,
        startedAt: 0, endedAt: 0, costUSD: 0, missionId: null, live: false,
        held: 'concurrency: 2 running'
    },
    {
        id: id('t'), title: 'Türkçe karakter bozulmasını akış okuyucusunda doğrula',
        agent: 'developer', status: 'queued', mode: 'headless', engine: '', model: '',
        createdAt: T - 8 * 60000, startedAt: 0, endedAt: 0, costUSD: 0,
        missionId: null, live: false, held: 'agent busy (developer)'
    }
];

// The tail: what a project of this age really has behind it.
const DONE = [
    ['Konsol şeridini iki satıra çıkar', 'developer', 'done', 4.12, 6 * H],
    ['Motor rozetini her yüzeye indir', 'developer', 'done', 2.6, 9 * H],
    ['agy models çağrısını stdin kapalı dene', 'developer', 'done', 0.44, DAY],
    ['Proje seçicisini sol panele bağla', 'developer', 'failed', 0.9, DAY + 2 * H],
    ['Eski ProjectDef adaptörünü kaldır', 'developer', 'done', 1.75, 2 * DAY],
    ['Backloglog Track sekmesi taslağı', 'developer', 'done', 6.4, 3 * DAY],
    ['Bildirim panosuna yıldız ekle', 'manager', 'cancelled', 0.12, 3 * DAY],
    ['Kuyruk olgunluk eşiklerini ölç', 'manager', 'done', 0.83, 4 * DAY]
].map(([title, agent, status, cost, ago]) => ({
    id: id('t'), title, agent, status, mode: 'headless', engine: '', model: 'sonnet',
    createdAt: T - ago - H, startedAt: T - ago - 30 * 60000, endedAt: T - ago,
    costUSD: cost, missionId: null, live: false, held: ''
}));

const MISSIONS = [
    {
        id: id('m'), title: 'Faz 5 — iş ekseni', status: 'running', lead: 'developer',
        team: ['developer', 'manager'], startedAt: T - 90 * 60000, endedAt: 0,
        costUSD: 3.4, tokens: 1840000, rounds: 3, verdict: '', via: 'stamped'
    },
    {
        id: id('m'), title: 'Sağ tık menüleri denetimi', status: 'done', lead: 'manager',
        team: ['developer'], startedAt: T - 5 * DAY, endedAt: T - 5 * DAY + 2 * H,
        costUSD: 7.9, tokens: 4200000, rounds: 6, verdict: 'partial', via: 'delegated'
    }
];

const NOTICES = [
    {
        id: id('n'), ts: T - 25 * 60000, level: 3, type: 'question', agent: 'developer',
        title: 'Backlog arşivini 90_Archive altına mı taşıyayım, yoksa dosyada mı bırakayım?',
        read: false, status: 'open', handled: false
    },
    {
        id: id('n'), ts: T - 2 * H, level: 4, type: 'warning', agent: 'manager',
        title: 'Günlük bütçenin %92\'si harcandı — üç oturum hâlâ açık',
        read: false, status: '', handled: false
    },
    {
        id: id('n'), ts: T - 5 * H, level: 1, type: 'update', agent: 'developer',
        title: '3.106.0 paketlendi ve kuruldu', read: true, status: '', handled: false
    },
    {
        id: id('n'), ts: T - DAY, level: 2, type: 'result', agent: 'developer',
        title: 'Türkçe harf bozulmasının kaynağı akış okuyucusuymuş', read: true,
        status: '', handled: false
    },
    {
        id: id('n'), ts: T - 2 * DAY, level: 1, type: 'report', agent: 'manager',
        title: 'Haftalık maliyet dağılımı raporu', read: true, status: '', handled: false
    }
];

const QUEUE = [
    {
        id: id('q'), ts: T - 3 * H, status: 'blocked', urgency: 'urgent', author: 'user',
        text: 'Konsolda proje kutusu Start Session\'a basınca No Project\'e dönüyor — hangi yolda kayboluyor?',
        target: 'developer', handledAt: 0, stamp: ''
    },
    {
        id: id('q'), ts: T - 4 * H, status: 'captured', urgency: 'soon', author: 'user',
        text: 'Backlog satırlarının sonundaki more linkinin tool tip genişliği dar kalıyor',
        target: '', handledAt: 0, stamp: ''
    },
    {
        id: id('q'), ts: T - 6 * H, status: 'delegated', urgency: 'normal', author: 'manager',
        text: 'Proje sayfası Work sekmesi için fixture yaz', target: 'developer',
        handledAt: 0, stamp: ''
    },
    {
        id: id('q'), ts: T - 2 * DAY, status: 'done', urgency: 'normal', author: 'user',
        text: 'Sol panele backlog kısayol ikonu', target: 'developer',
        handledAt: T - DAY, stamp: '-DONE- AGENTS satırına eklendi'
    },
    {
        id: id('q'), ts: T - 4 * DAY, status: 'dropped', urgency: 'normal', author: 'user',
        text: 'zdb adını dene', target: '', handledAt: T - 4 * DAY + H,
        stamp: '-DROPPED- motorun adı Airtable Motoru'
    }
];

const work = () => ({
    tasks: TASKS.concat(DONE),
    missions: MISSIONS,
    notices: NOTICES,
    queue: QUEUE,
    schedules: [
        {
            id: id('s'), title: 'Sabah proje taraması', agent: 'manager', kind: 'daily',
            hour: 8, minute: 30, dow: null, onceAt: 0, enabled: true, fireIf: true
        },
        {
            id: id('s'), title: 'Haftalık özet', agent: 'manager', kind: 'weekly',
            hour: 19, minute: 0, dow: 0, onceAt: 0, enabled: false, fireIf: false
        }
    ],
    triggers: [
        {
            id: id('g'), title: 'Backlog.md değişince tara', type: 'watch', enabled: true,
            watchPath: 'D:\\zone\\know\\note\\obsidian\\00_AGENT_AREA\\10_PROJECTS\\PRS.MuratVural_DEV_VSC.AgentFarm\\Backlog.md',
            hookEvent: '', fireCount: 41, skipCount: 12, lastFiredAt: T - 3 * H
        }
    ],
    agents: ['developer', 'manager']
});

const project = {
    id: 'p1', name: 'PRS.MuratVural_DEV_VSC.AgentFarm', status: 'active', kind: 'product',
    summary: 'Claude Code başta olmak üzere yapay zeka ajanlarını yönetmek için kurulmuş bir VSCode eklentisi',
    folder: 'D:\\zone\\know\\note\\obsidian\\00_AGENT_AREA\\10_PROJECTS\\PRS.MuratVural_DEV_VSC.AgentFarm',
    folderState: 'ok', repos: ['D:\\zone\\dev\\git\\miropharm\\vsc_AgentFarm'], parentId: null,
    tags: ['ajan', 'agent'], people: [{ name: 'Murat Vural', role: 'owner' }], agentRules: [],
    budgetUSD: 0, budgetTotalUSD: 0, sessions: 34, cost: 128.4, todayCost: 12.2,
    tokens: 41200000, lastTs: T, warnings: []
};

const data = (over) => Object.assign({
    generatedAt: T, projects: [project], agents: ['developer', 'manager'], activeId: 'p1',
    activeName: 'PRS.MuratVural_DEV_VSC.AgentFarm',
    projectsRoot: 'D:\\zone\\know\\note\\obsidian\\00_AGENT_AREA\\10_PROJECTS',
    unassigned: { sessions: 2, cost: 3.1 }, unfiledKinds: [], docPath: '',
    docOpen: { mode: 'obsidian', modes: ['vscode', 'preview', 'obsidian'], labels: { vscode: 'Editor', preview: 'Preview', obsidian: 'Obsidian' } },
    focusId: null, newForm: null, tab: 'work', tabProject: 'p1',
    tabData: { work: work() }
}, over || {});

module.exports = {
    script: 'projects.js',
    data,
    work,
    variants: () => [
        { id: 'work', label: 'Work', data: data() },
        // The other half of the honest distribution: a project nobody has
        // stamped anything under yet. Every card is empty, so the tab is one
        // toolbar and one paragraph — which is what it MUST look like, because
        // that is what a new project sees on its first day.
        {
            id: 'empty', label: 'Work → nothing stamped yet',
            data: data({
                tabData: {
                    work: {
                        tasks: [], missions: [], notices: [], queue: [],
                        schedules: [], triggers: [], agents: ['developer', 'manager']
                    }
                }
            })
        }
    ]
};
