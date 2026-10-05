/**
 * The Living page — "is the system alive today?" on one screen.
 *
 * ‼️ THE SHAPE IS THE POINT. A signal row is an icon, a bold label beside an age,
 * a detail at the length the farm really writes it and an italic hint — so the rows
 * here carry Turkish paths and project names at real length, one of each state, and
 * the automation tail carries a reason long enough to wrap. Smallest scene first.
 */
const T = Date.parse('2026-10-05T21:10:00Z');
const M = 60000, H = 60 * M;

const sig = (over) => Object.assign({ id: 's', label: '', state: 'ok', detail: '', weight: 10 }, over);
const signals = [
    sig({
        id: 'notices-stale', label: 'Important notices are read', state: 'dead', goto: 'notices', weight: 30, ageMs: 26 * H,
        detail: '3 önemli bildirim 26 saattir okunmadı — en eskisi "Gece kararı: Ayarlar sayfası telefonda — yalnızca yönetici yetkili telefon açar"',
        hint: 'Open the Notices board and answer or dismiss them'
    }),
    sig({
        id: 'queue-stalled', label: 'Captured work moves on', state: 'warn', goto: 'queue', weight: 22, ageMs: 9 * H,
        detail: 'Kuyrukta 4 iş 9 saattir bekliyor: D:\\zone\\know\\note\\obsidian\\00_AGENT_AREA\\10_PROJECTS\\PRS.MuratVural_DEV_AND.AgentFarm',
        hint: 'Pick one up or cancel what no longer matters'
    }),
    sig({
        id: 'project-PRS.MuratVural_DEV_VSC.AgentFarm', label: 'PRS.MuratVural_DEV_VSC.AgentFarm', state: 'warn', goto: 'projects', weight: 13,
        detail: 'Bitiş tarihi 2026-08-27 geçti; Worklog.md 3 gündür yazılmadı'
    }),
    sig({ id: 'tasks', label: 'Scheduled tasks run', state: 'ok', goto: 'tasks', weight: 12, detail: '14 zamanlanmış görev son 24 saatte çalıştı, hiçbiri hata vermedi' }),
    sig({ id: 'gate', label: 'The farm is open for business', state: 'ok', goto: 'dashboard', weight: 20, detail: 'no gate is closed' }),
    sig({ id: 'check-inbox', label: 'Gelen kutusu boşalıyor', state: 'idle', weight: 8, detail: 'D:\\zone\\know\\note\\obsidian\\01_INBOX — klasör yok ya da okunamadı' })
];

const recent = [
    { ts: T - 7 * M, outcome: 'fired', title: 'Sabah özeti — her gün 07:30', kind: 'schedule', reason: 'zamanı geldi' },
    {
        ts: T - 52 * M, outcome: 'skipped', title: 'Gece mesaisi bayrak yarışı', kind: 'trigger',
        reason: 'precondition: D:\\zone\\agent\\ajanlar\\developer\\memory klasöründe 30 dakikadır değişiklik yok, uyandırmaya gerek görülmedi'
    },
    { ts: T - 3 * H, outcome: 'fired', title: 'Kota yoklaması', kind: 'schedule', reason: 'every 3h' }
];

const checks = [
    { label: 'Gelen kutusu boşalıyor', when: { kind: 'folderHasFiles', path: 'D:\\zone\\know\\note\\obsidian\\01_INBOX', except: ['.gitkeep'] }, level: 'warn', hint: 'Dosyala ya da sil' },
    { label: 'Worklog yazılıyor', when: { kind: 'pathChangedWithin', path: 'D:\\zone\\know\\note\\obsidian\\00_AGENT_AREA\\10_PROJECTS\\PRS.MuratVural_DEV_VSC.AgentFarm\\Worklog.md', hours: 72 }, level: 'alert' }
];

function data(over) {
    return Object.assign({
        generatedAt: T, score: 67, verdict: 'Two loops are open — the farm is running, but nobody is reading what it says.',
        signals, counts: { ok: 2, warn: 2, dead: 1, idle: 1 }, recent,
        hasChecks: true, checks, canEdit: true
    }, over);
}

module.exports = {
    script: 'livingPage.js',
    data,
    variants: () => [
        {
            id: 'quiet', label: 'Living — everything closing, no checks of your own',
            data: data({ score: 100, verdict: 'Every loop is closing.', signals: signals.filter(s => s.state === 'ok'),
                counts: { ok: 2, warn: 0, dead: 0, idle: 0 }, recent: [], hasChecks: false, checks: [] })
        },
        { id: 'open', label: 'Living — open loops, your own checks and the automation tail', data: data() },
        {
            id: 'editor', label: 'Living — the checks editor open on a check',
            data: data(),
            act: r => {
                const b = r.query('#cfg')[0]; if (b) { b.click(); }
                const e = r.query('[data-afl="edit"]')[1]; if (e) { e.click(); }
            }
        }
    ]
};
