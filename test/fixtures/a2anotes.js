/**
 * The A2A Notes board — what agents leave for each other (N-6).
 *
 * ‼️ THE SHAPE IS THE POINT. A row is a flex line carrying a category, a title
 * at real length, five coordinate chips, an author, a reader count and an age
 * — so the notes here carry all of that in Turkish at the length agents really
 * write, one is a broadcast on every axis (every chip reads "any"), one is
 * resolved, one expired, one promoted to a task and one carries a supervisor
 * directive. And the SMALLEST scenes first: empty, then one.
 */
const T = Date.parse('2026-09-20T15:10:00Z');
const M = 60000;

const projects = [
    {
        id: 'prj_9ujsbtzr', name: 'PRS.MuratVural_DEV_VSC.AgentFarm', icon: '◧', color: '#7c3aed',
        status: 'active', kind: 'product',
        summary: 'Claude Code başta olmak üzere yapay zeka ajanlarını yönetmek için kurulmuş bir VSCode eklentisi',
        folder: 'D:\\zone\\know\\note\\obsidian\\00_AGENT_AREA\\10_PROJECTS\\PRS.MuratVural_DEV_VSC.AgentFarm',
        repos: ['D:\\zone\\dev\\git\\miropharm\\vsc_AgentFarm'], tags: ['ajan']
    },
    {
        id: 'prj_talk', name: 'PRS.MuratVural_DEV_TalkScribe.ZEN', icon: '🎙', color: '#d18616',
        status: 'active', kind: 'product', summary: 'Sesli dikte eklentisi', folder: '', repos: [], tags: []
    }
];

const note = (over) => Object.assign({
    id: 'n-' + Math.random().toString(36).slice(2, 8), ts: T - 30 * M, fromAgent: 'developer',
    project: 'prj_9ujsbtzr', subsystem: 'src/panels', topic: 'a2a', targetRole: '*', targetSession: '*',
    strictness: 'preferred', category: 'info', title: 'başlık', body: '', contextFiles: [],
    expiresAt: 0, resolved: false, readBy: []
}, over);

const one = note({
    id: 'n-mu9p1', ts: T - 12 * M, fromAgent: 'developer', category: 'discovery', strictness: 'hard',
    topic: 'x-153', subsystem: 'D:\\zone\\agent', targetRole: 'manager',
    title: 'Ajan reposunu boğan transkriptler değil, motorların her turda baştan yazdığı SQLite ikilileriydi',
    body: 'Ölçüldü: `opencode.db` 61 MB, 247 antigravity `conversations/*.db` **854 MB**, `thread_history_1.sqlite` 28,5 MB.\n\n'
        + '- Konuşmalar zaten düz metin: `opencode-exports/` 151/155, `brain/…/transcript.jsonl` 245/246\n'
        + '- Ham transkriptlere dokunulmadı\n\n'
        + 'Pack küçültme (`git filter-repo` + force push) AYRI bir karar — bkz. https://git-scm.com/docs/git-filter-repo',
    contextFiles: ['D:\\zone\\agent\\.gitignore', 'D:\\zone\\agent\\_setup\\Snapshot-OpencodeDb.js'],
    readBy: ['manager']
});

const many = [
    one,
    note({
        id: 'n-mu9p2', ts: T - 3 * M, fromAgent: 'manager', category: 'warning', strictness: 'hard',
        project: '*', subsystem: '*', topic: 'kota', targetRole: '*',
        title: 'claude-aicozums hesabı 5 saatlik pencerede %92 — bu slotta yeni oturum açmayın',
        body: 'Sıfırlanma 22:30. `node tools/quota.js` ilk satırda config dir\'i yazmalı; yazmıyorsa sayı bir yabancıya ait.',
        expiresAt: T + 120 * M
    }),
    note({
        id: 'n-mu9p3', ts: T - 95 * M, fromAgent: 'developer', category: 'convention', strictness: 'preferred',
        subsystem: 'media', topic: 'ui', targetRole: 'developer',
        title: 'Bir `<style>` bloğu media/*.js içinde şablon literalidir — CSS yorumuna backtick koymayın',
        body: 'Ölçüldü: `test_console_page.js` bir CSS yorumundaki "on it" sözcüklerinde kırıldı; stil sayfası da sayfa testinin grep\'lediği markup\'ın parçası.',
        readBy: ['developer', 'explorer', 'basit'],
        humanDirective: { kind: 'constraint', text: 'Bu kural docs/CONVENTIONS.md dışına taşınmayacak; her ajan oradan okur.', ts: T - 80 * M }
    }),
    note({
        id: 'n-mu9p4', ts: T - 26 * 60 * M, fromAgent: 'explorer', category: 'result', strictness: 'any',
        project: 'prj_talk', subsystem: 'ZEN', topic: 'release', targetRole: 'developer',
        title: 'ZEN 2.4.1 Chrome Web Store incelemesinden geçti, 41 kullanıcıya dağıtıldı',
        body: 'Mağaza sayfasında yeni sürüm notu görünüyor. Hata raporu yok.',
        resolved: true, readBy: ['developer']
    }),
    note({
        id: 'n-mu9p5', ts: T - 50 * 60 * M, fromAgent: 'basit', category: 'info', strictness: 'any',
        project: '*', subsystem: '*', topic: '*', targetRole: '*',
        title: 'Günlük yedek 05:00\'te alındı — 725 dosya, 95 MB üstü yok',
        body: '', expiresAt: T - 10 * M
    }),
    note({
        id: 'n-mu9p6', ts: T - 200 * M, fromAgent: 'developer', category: 'discovery', strictness: 'preferred',
        subsystem: 'src/core', topic: 'x-128', targetRole: 'developer',
        title: 'Profildeki 97 milyon normCwd çağrısı 324×15\'ten değil SÜPÜRME SAYISINDAN geliyor',
        body: '`admit()` her taramada her oturum için koşuyor. Süpürmeyi yalnızca değişen bağlamaların dokunabileceği oturumlarla sınırlamak ayrı bir kalem.',
        readBy: ['manager']
    })
];

const data = over => Object.assign({
    generatedAt: T,
    now: T,
    notes: many,
    tasksByNote: { 'n-mu9p6': { id: 't-mu9q1', state: 'claimed' } },
    projects,
    focusId: null
}, over || {});

module.exports = {
    script: 'a2aNotes.js',
    data,
    variants: () => [
        { id: 'empty', label: 'A2A Notes — nothing on the board', data: data({ notes: [], tasksByNote: {} }) },
        { id: 'one', label: 'A2A Notes — one note, opened', data: data({ notes: [one], tasksByNote: {}, focusId: one.id }) },
        { id: 'board', label: 'A2A Notes — the board: live, resolved, expired, promoted, directed', data: data({ focusId: 'n-mu9p3' }) }
    ]
};
