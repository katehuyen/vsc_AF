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
    item('K-9', 'Konsol kısayolu vazgeçildi', { state: 'cancelled', kinds: ['chore'], closedAt: null }),
    // ‼️ U-106 — ARCHIVED ROWS BESIDE MERELY CLOSED ONES, which is the whole
    // picture: closed and archived were drawn identically (grey, struck
    // through), so "is this recent work or is this history?" could not be
    // answered by looking. Two of them, under the archive heading, so the mark
    // is judged in a column and not on one lonely row.
    item('U-12', 'Arşive kaldırılmış eski satır — tarihî kayıt, kodu asla yeniden verilmez',
        { state: 'done', closedAt: T - 240 * 86400000, archived: true, section: '🗄 Archive' }),
    item('P-3', 'Arşivdeki vazgeçilmiş satır',
        { state: 'cancelled', closedAt: T - 300 * 86400000, archived: true, section: '🗄 Archive' })
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
        },
        {
            // ‼️ U-62 — the counting mode is a STATE, and a state has to be
            // visible in both of its positions. The pair is what gets judged:
            // 'every line' plain, 'wholes only' marked, side by side.
            //
            // ‼️ M-31 — and the LIST is part of the same judgement now: one
            // press marks the strip, ticks the family axis and drops the parts
            // out of the rows. What has to read as one thought is the headline
            // figure, the ⚙ filters (1) chip that says why the list is shorter,
            // and the rows themselves all agreeing.
            id: 'rollup', label: 'Backlog — counting wholes only (⊟), list narrowed to match',
            data: data(), act: (r) => { r.query('.pj-bl-cnt')[0].click(); }
        },
        {
            // ‼️ U-107 — the chip pressed ONCE: the archive is out of the list
            // and the chip says so. What is judged is that a list with the same
            // closed rows in it is now shorter, and that the reason is on
            // screen — a narrowed list with nothing saying why is the failure
            // this whole strip exists to avoid.
            id: 'archive-hidden', label: 'Backlog — archive hidden by the chip',
            data: data(),
            act: (r) => {
                showClosed(r);
                const chip = r.query('[data-act="blArch"]')[0];
                if (!chip) { throw new Error('no archive chip'); }
                chip.click();
            }
        }
    ]
};
