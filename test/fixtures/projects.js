/**
 * The Projects page: three projects (one a part of another), opened on the
 * Overview. Shapes as test_projects_tabs.js builds them; the other tabs have
 * their own fixtures (backlog, track, work, analysis, parts, templates). The
 * picture is the phone: the list above the open project at 360px, the tab strip.
 */
const NOW = Date.now();
const min = n => NOW - n * 60000;

const project = (id, name, extra) => ({
    id, name, status: 'active', kind: 'product', summary: '', folder: 'D:\\v\\' + name, folderState: 'ok',
    repos: [], parentId: null, tags: [], people: [], agentRules: [], budgetUSD: 0, budgetTotalUSD: 0,
    sessions: 0, cost: 0, todayCost: 0, tokens: 0, lastTs: min(30), warnings: [], ...extra
});

const projects = () => ([
    project('p1', 'PRS.MuratVural_DEV_VSC.AgentFarm', {
        summary: 'Claude Code başta olmak üzere yapay zeka ajanlarını yönetmek için bir VS Code eklentisi',
        repos: ['D:\\zone\\dev\\git\\miropharm\\vsc_AgentFarm'], tags: ['ajan', 'agents'],
        sessions: 412, cost: 1834.2, todayCost: 41.7, tokens: 912_000_000, lastTs: min(2), budgetUSD: 50
    }),
    project('p2', 'PRS.MuratVural_DEV_AND.AgentFarm', {
        summary: 'Agent Farm\'ın Android eşlikçisi', parentId: 'p1', sessions: 96, cost: 310.4, todayCost: 3.2, lastTs: min(90)
    }),
    project('p3', 'TalkScribe', {
        status: 'paused', summary: 'sesle yazma ürün ailesi', sessions: 58, cost: 120, lastTs: min(60 * 24 * 9)
    })
]);

const data = () => ({
    generatedAt: NOW, projects: projects(), agents: ['developer', 'manager'], activeId: 'p1',
    activeName: 'PRS.MuratVural_DEV_VSC.AgentFarm', projectsRoot: 'D:\\v', unassigned: { sessions: 14, cost: 22.5 },
    unfiledKinds: ['notice', 'queue'],
    docOpen: { mode: 'vscode', modes: ['vscode', 'preview', 'obsidian'], labels: {} }, docPath: '',
    focusId: 'p1', newForm: null, tab: 'overview', tabProject: 'p1',
    tabData: { activity: { running: [], next: [] }, recent: [], cost: { total: 1834.2, today: 41.7, burn: {} } }
});

const ev = (kind, m, title, detail, agent, cost, link) => ({ kind, ts: min(m), title, detail, agent, cost, ...(link ? { link } : {}) });
const timeline = () => ({
    ...data(), tab: 'timeline',
    tabData: {
        feed: {
            counts: { turn: 3, commit: 1, mission: 1, notice: 1 },
            events: [
                ev('turn', 2, 'Projects sayfası telefonda tek sütun olsun', 'developer · 14 adım', 'developer', 1.42,
                    { to: 'session', file: 'C:/t/a.jsonl', ts: min(2) }),
                ev('commit', 25, 'v11.955 - 3.835.0: the turns page opens on the phone', '12 files · +424 −193', 'developer', 0),
                ev('mission', 70, 'Gece mesaisi zinciri', 'leg 31 of 49 · passed', 'manager', 0.3),
                ev('notice', 95, 'Uzaktan günlük bütçe ne olsun?', 'question', 'developer', 0),
                ev('turn', 130, 'X-490 denetimi: OpenRouter rotası uçtan uca çalışıyor', 'developer · 41 adım', 'developer', 6.08,
                    { to: 'session', file: 'C:/t/b.jsonl', ts: min(130) })
            ],
            truncated: false
        }
    }
});

const variants = () => ([
    { id: 'projects', label: 'Projects — the list and the open project on its Overview', data: data() },
    { id: 'projects-timeline', label: 'Projects — the Timeline tab: turns, a commit, a mission, a notice', data: timeline() }
]);

module.exports = { script: 'projects.js', data, variants };
