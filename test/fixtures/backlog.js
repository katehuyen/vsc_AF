/**
 * The Projects backlog toolbar at the density of the real Agent Farm project.
 * The fixture exists for the controls string tests cannot judge: Tidy/Gather
 * order and the two archive paths must remain readable when the bar wraps.
 */
const T = Date.parse('2026-08-11T18:20:00Z');

const project = {
    id: 'p1', name: 'PRS.MuratVural_DEV_VSC.AgentFarm', status: 'active', kind: 'product',
    summary: 'Claude Code başta olmak üzere yapay zeka ajanlarını yönetmek için kurulmuş bir VSCode eklentisi',
    folder: 'D:\\zone\\know\\note\\obsidian\\00_AGENT_AREA\\10_PROJECTS\\PRS.MuratVural_DEV_VSC.AgentFarm',
    folderState: 'ok', repos: ['D:\\zone\\dev\\git\\miropharm\\vsc_AgentFarm'], parentId: null,
    tags: ['ajan', 'agent'], people: [], agentRules: ['developer'], budgetUSD: 0,
    budgetTotalUSD: 0, sessions: 246, cost: 11913, todayCost: 644, tokens: 6100000000,
    lastTs: T, warnings: []
};

const item = (code, text, over) => Object.assign({
    code, text, state: 'open', area: code.split('-')[0], line: 20,
    section: `${code.split('-')[0]} — Alan`, kinds: ['ux'], priority: 'normal', effort: 'S',
    blockedBy: [], plan: null, from: null, parent: null, children: [], due: null,
    score: 1, inbox: false, closedAt: null
}, over || {});

const items = () => [
    item('U-46', 'Project sayfası sekmelerinde Overview adını Home diye değiştir ve Settings sekmesini yalnız ikon kadar daralt.', { priority: 'low' }),
    item('U-44', 'Backlog Gather families butonunu Tidy file order butonundan sonra getir.', { parent: 'U-46', effort: 'XS' }),
    item('U-47', 'Konsol akışında Codex modelinin ayırt edici son ekini göster.', { effort: 'M' }),
    item('U-48', 'Notice satırı tek çarpıyla silinebilsin.'),
    // U-60 — parked by hand. Its ⛔ is the one row action that stays on screen
    // without a hover, so the picture has to carry one or the colour is being
    // judged on a rule nobody drew.
    item('U-45', 'Motor matrisinde ücretsiz sağlayıcıların kotası ayrı sütun olsun.', { onHold: true, effort: 'M' }),
    item('P-13', 'Track Closed at damgası tıklanıp ilgili turnü açabilsin.'),
    item('M-4', 'Archive closed hem hepsini hem girilen günden eski olanları arşivleyebilsin.', { kinds: ['feat'], effort: 'M' }),
    item('U-40', 'Dün kapanan satır', { state: 'done', closedAt: T - 86400000 }),
    item('U-39', 'Bir ay önce kapanan satır', { state: 'done', closedAt: T - 30 * 86400000 }),
    // U-58 — and a closing that was not a finish, beside two that were: the
    // whole question is whether the two boxes read apart at a glance.
    item('U-37', 'Vazgeçilen satır — kodu harcanmış olarak dosyada kalır', { state: 'cancelled', closedAt: T - 3 * 86400000 }),
    item('K-9', 'Konsol kısayolu vazgeçildi', { state: 'cancelled', kinds: ['chore'], closedAt: null })
];

const data = () => ({
    generatedAt: T, projects: [project], agents: ['developer'], activeId: 'p1',
    activeName: project.name, projectsRoot: 'D:\\zone\\know\\note\\obsidian\\00_AGENT_AREA\\10_PROJECTS',
    unassigned: { sessions: 0, cost: 0 }, unfiledKinds: [], docPath: '', focusId: null,
    newForm: null, tab: 'backlog', tabProject: 'p1',
    docOpen: { mode: 'obsidian', modes: ['vscode', 'preview', 'obsidian'], labels: {} },
    tabData: {
        backlog: {
            state: 'ok', path: 'Backlog.md', folder: project.folder,
            counts: { open: 7, doing: 0, done: 2, cancelled: 2, unclassified: 0 },
            areas: [
                { code: 'U', label: 'Arayüz', line: 20, open: 5, total: 8 },
                { code: 'P', label: 'Projeler', line: 60, open: 1, total: 1 },
                { code: 'M', label: 'Görevler', line: 100, open: 1, total: 1 },
                { code: 'K', label: 'Konsol', line: 140, open: 0, total: 1 }
            ],
            items: items(), next: [
                { code: 'U-46', line: 20 }, { code: 'U-44', line: 21 },
                { code: 'U-47', line: 22 }, { code: 'U-48', line: 23 },
                { code: 'P-13', line: 60 }, { code: 'M-4', line: 100 }
            ],
            nextDefault: 5,
            // ‼️ U-45 is in the ORDER and out of `next`: a hold does not take an
            // item out of the queue, it stops it being handed out.
            queue: ['U-46', 'U-44', 'U-47', 'U-45', 'U-48', 'P-13', 'M-4'],
            staleQueue: [], blocked: [], held: ['U-45']
        }
    }
});

/** Bring the closed rows onto the screen — the reader's own gesture (the
 *  ordering says so and widens the state filter itself). */
const showClosed = (r) => {
    const sel = r.query('#bl-sort')[0];
    if (!sel) { throw new Error('no sort box'); }
    sel.value = 'closed';
    sel.fire('change');
};

module.exports = {
    script: 'projects.js',
    data,
    variants: () => [
        { id: 'toolbar', label: 'Backlog — toolbar and archive age', data: data() },
        {
            // ‼️ The two closings side by side. A fixture with only open items
            // makes any palette look balanced; what has to be judged here is a
            // done tick and a cancelled cross in one column.
            id: 'closed', label: 'Backlog — done, cancelled and held in one list',
            data: data(), act: showClosed
        }
    ]
};
