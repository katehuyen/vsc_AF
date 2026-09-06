/**
 * The Notices board, with the toolbar as a real farm actually loads it.
 *
 * ‼️ THE SHAPE IS THE POINT, AND HERE THE SHAPE IS THE PROJECT NAMES. The
 * toolbar's "File under…" picker is a `<select>`, which is sized by its WIDEST
 * OPTION — so a fixture with projects called "A" and "B" makes any width look
 * fine, and the row only breaks on the machine of somebody whose projects are
 * called `PRS.MuratVural_DEV_VSC.AgentFarm`. The names below are that length on
 * purpose (X-28), and the notices carry Turkish text at the length people
 * actually write, which is what these cards really hold.
 */
const T = Date.parse('2026-08-11T16:40:00Z');
const H = 3600000;

const projects = [
    {
        id: 'p1', name: 'PRS.MuratVural_DEV_VSC.AgentFarm', icon: '◧', color: '#7c3aed',
        status: 'active', kind: 'product',
        summary: 'Claude Code başta olmak üzere yapay zeka ajanlarını yönetmek için kurulmuş bir VSCode eklentisi',
        folder: 'D:\\zone\\know\\note\\obsidian\\00_AGENT_AREA\\10_PROJECTS\\PRS.MuratVural_DEV_VSC.AgentFarm',
        repos: ['D:\\zone\\dev\\git\\miropharm\\vsc_AgentFarm'], tags: ['ajan', 'agent']
    },
    {
        id: 'p2', name: 'PRS.MuratVural_DEV_TalkScribe.ZEN', icon: '🎙', color: '#d18616',
        status: 'active', kind: 'product',
        summary: 'Chrome mağazasında yayında olan sesli dikte eklentisi',
        folder: 'D:\\zone\\know\\note\\obsidian\\00_AGENT_AREA\\10_PROJECTS\\PRS.TalkScribe',
        repos: ['D:\\zone\\dev\\git\\miropharm\\muvu_talkScribe'], tags: ['ürün']
    },
    {
        id: 'p3', name: 'LifeOS', icon: '🗓', color: '#89d185',
        status: 'active', kind: 'system', summary: 'Günlük/haftalık plan-rapor döngüsü',
        folder: 'D:\\zone\\know\\note\\obsidian\\00_AGENT_AREA\\10_PROJECTS\\LifeOS',
        repos: [], tags: []
    }
];

const notices = [
    {
        id: 'n1', ts: T - 20 * 60000, agentName: 'developer', type: 'question', level: 3,
        title: 'Antigravity rozet rengi: kırmızı mı, başka bir ton mu?',
        body: 'Yeşil zaten eklentinin kendi sinyal rengi. Mavi Gemini\'de. Kırmızıya geçtim ama '
            + 'onaylamanı istiyorum çünkü hata rengiyle aynı aileden.',
        status: 'open', tags: ['ux'], projectId: 'p1', stars: 2, account: 'claude-wmmuratvural'
    },
    {
        id: 'n2', ts: T - 2 * H, agentName: 'developer', type: 'report', level: 2,
        title: 'Oturum tablosu artık dört motorun da oturumlarını listeliyor',
        body: 'Dashboard, Sessions sayfası, ajan sayfası ve proje sayfası — dördü de aynı bileşeni '
            + 'kullanıyordu ve dördü de yalnızca Claude oturumlarını besliyordu.',
        read: true, tags: ['bug', 'motor'], projectId: 'p1', account: 'claude-wmmuratvural'
    },
    {
        id: 'n3', ts: T - 5 * H, agentName: 'manager', type: 'info', level: 1,
        title: 'Haftalık özet hazır', read: true, projectId: null
    },
    {
        id: 'n4', ts: T - 9 * H, agentName: 'developer', type: 'report', level: 4,
        title: 'ZEN 2.4.1 mağazaya gönderildi — inceleme bekliyor',
        body: 'Sürüm notları ve mağaza metni güncellendi.',
        pinned: true, tags: ['release'], projectId: 'p2', account: 'claude-murvietnam-2'
    },
    {
        id: 'n5', ts: T - 26 * H, agentName: 'psikolog', type: 'info', level: 1,
        title: 'Günlük not dosyaya işlendi', read: true, projectId: 'p3'
    }
];

const data = (over) => Object.assign({
    generatedAt: T,
    notices,
    unread: notices.filter(n => !n.read).length,
    openQuestions: notices.filter(n => n.type === 'question' && n.status === 'open').length,
    agents: ['developer', 'manager', 'psikolog'],
    projects,
    activeProjectId: 'p1',
    docOpen: { mode: 'obsidian', hasCustom: true },
    focusId: null
}, over || {});

module.exports = {
    script: 'notices.js',
    data,
    variants: () => [
        { id: 'board', label: 'Notices — toolbar and cards', data: data() },
        // ‼️ The other end of the range the picker has to survive: no projects at
        // all. The box must still be the same width and must say what to do.
        {
            id: 'noprojects', label: 'Notices — nothing declared to file under',
            data: data({ projects: [], activeProjectId: '', notices: notices.map(n => ({ ...n, projectId: null })) })
        }
    ]
};
