/**
 * The Projects page, on the Track tab, with a ledger shaped like a real one.
 *
 * ‼️ THE SHAPE IS THE POINT. A fixture with one open item and one closed one
 * makes every palette look balanced; a real project's track is mostly `done`,
 * which is exactly how a colour scheme that shouts on `done` turns the page
 * into one flat green. So the rows here follow the real distribution: many
 * closed, a few open, one being worked, one cancelled, one whose backlog line
 * has gone, some reconstructed, some uncertain.
 */
const T = Date.parse('2026-08-09T18:20:00Z');
const DAY = 86400000;
const H = 3600000;

let sid = 0;
const SESSIONS = {};

/** One session's share of an item, plus its entry in sessionInfo. */
function run(code, agent, events, opts) {
    const o = opts || {};
    const n = ++sid;
    const id = `${String(n).repeat(4).slice(0, 4)}${String(n * 7).repeat(4).slice(0, 4)}-${n}`;
    const short = id.slice(0, 8);
    const file = `D:\\t\\${short}.jsonl`;
    const turns = events.map((e, i) => ({ n: (o.turn || 3) + i, ts: e.ts }));
    SESSIONS[id] = {
        file, title: o.title || 'a session about ' + code, agent,
        turns: o.sessionTurns || 40, firstTs: events[0].ts, lastTs: events[events.length - 1].ts,
        models: [o.model || 'opus'], cost: o.cost || 2.4, cwd: ''
    };
    return {
        session: id, short, file, agent,
        span: `#${turns[0].n}${turns.length > 1 ? '–' + turns[turns.length - 1].n : ''}`,
        firstTs: events[0].ts, lastTs: events[events.length - 1].ts,
        uncertain: o.uncertain || null,
        turns,
        events: events.map((e, i) => ({
            code, event: e.event, ts: e.ts, at: '', session: id, short,
            turn: turns[i].n, agent, by: e.by || 'agent',
            uncertain: e.uncertain || null, note: e.note || null
        }))
    };
}

const ITEM = (code, over) => Object.assign({
    code, text: 'an item of work', state: 'done', area: code.split('-')[0],
    section: code[0] + ' — Alan', line: 100, priority: 'normal', effort: 'M', kinds: ['feat'],
    parent: null, children: [], plan: null, due: null,
    turns: 4, doubtful: false, backfilled: false, sources: ['agent'],
    // ‼️ P-14 — WHICH part is uncertain, and HOW the item was closed. A bare
    // "uncertain" over a row that named its session read as a contradiction, and
    // the closer's own note — the answer to the question this tab exists for —
    // was never sent to the page at all.
    doubts: [],
    // ‼️ X-36 — which go this is, and what the item said on the earlier ones.
    round: 1, rounds: [],
    stamp: null, note: '', closedNote: '', firstTs: T - 2 * DAY, lastTs: T, closedTs: 0,
    closedEvent: null, closedBy: null, sessions: [], loose: []
}, over || {});

function rows() {
    return [
        ITEM('K-12', {
            text: 'END SESSION İŞLEMİYOR: oturumu durdurmak için butona basıyorum, buton işini yapmış gibi görünüyor ama birkaç saniye sonra ajan yeni satırlar göndermeye devam ediyor — bu çok kararlı çalışan bir şeydi, kim neden bozdu.',
            state: 'done', effort: 'M', kinds: ['bug'], priority: 'high', turns: 9,
            stamp: 'b28b7369#1', note: 'İki ayrı sebep: öldürme sırası ve boru boşalması.',
            // The long closing note is the case the row has to survive: it is
            // cut on the card and opens whole in the panel.
            closedNote: 'Kapatıldı — 3.124.0. İki ayrı sebep vardı ve ikisi de kapatıldı: '
                + 'öldürme sırası (çocuk süreç önce, kabuk sonra) ve boru boşalması — '
                + 'kapanmamış bir stdout borusu, süreç ölmüş olsa bile okuyucuyu satır '
                + 'göndermeye devam ettiriyordu. Sonradan bakan biri için: aynı belirti '
                + 'tekrar ederse önce boru kapanışına bakılsın, öldürme sırasına değil.',
            firstTs: T - 6 * H, lastTs: T - H, closedTs: T - H, closedEvent: 'done', closedBy: 'agent',
            sessions: [run('K-12', 'developer', [
                { event: 'doing', ts: T - 6 * H },
                { event: 'touch', ts: T - 4 * H, note: 'taskkill sırası bulundu' },
                { event: 'done', ts: T - H }
            ], { turn: 12, cost: 4.1 })]
        }),
        ITEM('K-11', {
            text: 'PROJECT KAYBEDİLİYOR: bir oturum bir proje altında açıldığında Resume edildiğinde proje geri gelmiyor.',
            state: 'done', kinds: ['bug'], priority: 'high', turns: 5, stamp: 'b28b7369#1',
            firstTs: T - 5 * H, lastTs: T - 2 * H, closedTs: T - 2 * H, closedEvent: 'done', closedBy: 'agent',
            sessions: [run('K-11', 'developer', [
                { event: 'doing', ts: T - 5 * H },
                { event: 'done', ts: T - 2 * H }
            ], { turn: 18 })]
        }),
        ITEM('U-25', {
            text: 'TRACK ARAYÜZ: Last worked ve First worked aynı şeyi gösteriyor; alt sekmelerde renklendirme hiç yapılmamış; Timeline sütunları dar; tooltip kullanılmamış; sekme şeridi tamamen renksiz.',
            state: 'doing', kinds: ['ux'], effort: 'M', turns: 7, doubtful: true, doubts: ['multi'],
            firstTs: T - 3 * DAY, lastTs: T - 30 * 60000,
            sessions: [
                run('U-25', 'developer', [
                    { event: 'touch', ts: T - 3 * DAY, note: 'ilk bakış, kök neden bulunamadı', uncertain: 'multi' }
                ], { turn: 4, sessionTurns: 12, cost: 0.9, model: 'sonnet' }),
                run('U-25', 'developer', [
                    { event: 'doing', ts: T - 30 * 60000 }
                ], { turn: 2, cost: 1.2 })
            ]
        }),
        ITEM('X-3', {
            text: 'CLAUDE DIŞI MODELLERİN EKLENTİDE KULLANIMI: anahtar yönetimi için arayüz yok; adanmış bir panel tasarlanacak, önce kullanıcı ile konuşulacak.',
            state: 'open', kinds: ['feat'], priority: 'high', effort: 'L', turns: 6,
            children: ['X-14', 'X-15'],
            firstTs: T - 8 * H, lastTs: T - 2 * H,
            sessions: [run('X-3', 'developer', [
                { event: 'doing', ts: T - 8 * H },
                { event: 'touch', ts: T - 2 * H, note: 'faz 1 kondu, faz 3 ve 4 kalem oldu' }
            ], { turn: 7, cost: 3.3 })]
        }),
        ITEM('X-15', {
            text: 'CONSOLE YALNIZ CLAUDE BAŞLATIYOR (X-3 faz 3)', state: 'open',
            kinds: ['feat'], effort: 'L', parent: 'X-3', turns: 0,
            firstTs: T - 2 * H, lastTs: T - 2 * H,
            // ‼️ X-135 — the opening record, which is what a brand-new item's
            // whole history looks like: one row, no session (it was typed into
            // the panel, not written mid-turn), and it is what dates the item
            // at BOTH ends. Before there was such an event this row was a
            // `touch` with a note explaining itself.
            loose: [{ code: 'X-15', event: 'opened', ts: T - 2 * H, at: '', session: null, short: null, turn: null, agent: null, by: 'panel', uncertain: null, note: 'kalem olarak açıldı' }]
        }),
        ITEM('P-11', {
            text: 'Backlog kuyruğunun ilk üçü', state: 'done', turns: 12, stamp: '923890e1#4',
            note: 'Üç kalem tek turda kapandı.',
            firstTs: T - 4 * DAY, lastTs: T - 3 * DAY, closedTs: T - 3 * DAY, closedEvent: 'done', closedBy: 'agent',
            sessions: [run('P-11', 'developer', [
                { event: 'doing', ts: T - 4 * DAY },
                { event: 'done', ts: T - 3 * DAY }
            ], { turn: 9, cost: 6.2 })]
        }),
        ITEM('U-19', {
            text: 'Hover kendini kapatmayı bıraktı', state: 'done', effort: 'S', turns: 3,
            stamp: 'b48b72f1#2', firstTs: T - 4 * DAY, lastTs: T - 4 * DAY + 2 * H,
            closedTs: T - 4 * DAY + 2 * H, closedEvent: 'done', closedBy: 'agent',
            sessions: [run('U-19', 'developer', [{ event: 'done', ts: T - 4 * DAY + 2 * H }], { turn: 21 })]
        }),
        ITEM('S-13', {
            text: 'Otomatik oturum adlandırmasında zaman zaman ortaya çıkan yanlışlık',
            state: 'done', effort: 'S', turns: 2, backfilled: true, sources: ['backfill'],
            doubtful: true, doubts: ['guess'], stamp: 'ff629d56#1',
            closedNote: 'Transkriptten geri kuruldu — gözlenmedi.',
            firstTs: T - 6 * DAY, lastTs: T - 6 * DAY + H,
            closedTs: T - 6 * DAY + H, closedEvent: 'done', closedBy: 'agent',
            sessions: [run('S-13', 'manager', [
                { event: 'touch', ts: T - 6 * DAY, by: 'backfill', uncertain: 'guess', note: 'transkriptten geri kuruldu' },
                { event: 'done', ts: T - 6 * DAY + H, by: 'backfill', uncertain: 'guess' }
            ], { turn: 14, uncertain: 'guess', model: 'sonnet', cost: 0.6 })]
        }),
        ITEM('M-4', {
            text: 'Misyon adımlarına koşullu dallanma', state: 'cancelled', kinds: ['idea'],
            effort: 'XL', turns: 1, firstTs: T - 9 * DAY, lastTs: T - 8 * DAY,
            closedTs: T - 8 * DAY, closedEvent: 'cancelled', closedBy: 'outside',
            loose: [{ code: 'M-4', event: 'cancelled', ts: T - 8 * DAY, at: '', session: null, short: null, turn: null, agent: null, by: 'outside', uncertain: 'none', note: 'kapsam dışı bırakıldı' }]
        }),
        ITEM('A-2', {
            // ‼️ X-36 — the case the item was written about: asked for twice
            // before, and until now the card said nothing about either.
            round: 3,
            rounds: [
                { ts: T - 12 * DAY, text: 'Resume edilen turda ücret görünmüyor, bir bak.' },
                {
                    ts: T - 11 * DAY,
                    text: 'RESUME ÜCRETİ HÂLÂ EKSİK: geçen sefer bakıldı ama yalnız ilk tur '
                        + 'düzeldi; devam eden turda taşınan bağlam yine sayılmıyor.'
                }
            ],
            text: 'Resume edilen turda ücret eksik geliyordu', state: 'done', kinds: ['bug'],
            effort: 'S', turns: 4, firstTs: T - 11 * DAY, lastTs: T - 10 * DAY,
            closedTs: T - 10 * DAY, closedEvent: 'done', closedBy: 'agent',
            sessions: [run('A-2', 'developer', [
                { event: 'doing', ts: T - 11 * DAY },
                { event: 'reopen', ts: T - 10 * DAY - 3 * H, note: 'ilk düzeltme tutmadı' },
                { event: 'done', ts: T - 10 * DAY }
            ], { turn: 5, cost: 1.8 })]
        }),
        ITEM('B-9', {
            text: '(no longer in the backlog)', state: 'gone', turns: 2, effort: null,
            kinds: [], firstTs: T - 14 * DAY, lastTs: T - 14 * DAY,
            sessions: [run('B-9', 'manager', [{ event: 'touch', ts: T - 14 * DAY }], { turn: 3, model: 'haiku', cost: 0.1 })]
        })
    ];
}

const track = () => ({
    state: 'ok', folder: 'D:\\v\\p', path: 'Backloglog.md', backlogPath: 'Backlog.md',
    ledger: '90_Archive/_tracks/backlog-track.jsonl',
    events: 24, truncated: false,
    areas: [{ code: 'K', label: 'Konsol' }, { code: 'U', label: 'Arayüz' },
    { code: 'X', label: 'Çapraz' }, { code: 'P', label: 'Projeler' },
    { code: 'S', label: 'Oturumlar' }, { code: 'M', label: 'Görevler' },
    { code: 'A', label: 'Analiz' }, { code: 'B', label: 'Köprü' }],
    agents: ['developer', 'manager'],
    rows: rows(),
    untracked: [
        { code: 'P-4', text: 'PROJE SİSTEMİ FAZLARI TAMAMLANSIN', state: 'open', area: 'P', line: 41 },
        { code: 'U-6', text: 'backlog mesajlarının eklenti içinden edit edilebilmesi', state: 'done', area: 'U', line: 106 }
    ],
    sessionInfo: SESSIONS,
    gaps: { untracked: 2, uncertain: 4, backfilled: 1, noSession: 2 }
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
    activeName: 'Agent Farm', projectsRoot: 'D:\\zone\\know\\note\\obsidian\\00_AGENT_AREA\\10_PROJECTS',
    unassigned: { sessions: 2, cost: 3.1 }, unfiledKinds: [], docPath: '',
    docOpen: { mode: 'obsidian', modes: ['vscode', 'preview', 'obsidian'], labels: { vscode: 'Editor', preview: 'Preview', obsidian: 'Obsidian' } },
    focusId: null, newForm: null, tab: 'track', tabProject: 'p1',
    tabData: { track: track() }
}, over || {});

/** Press a view button on the rendered page — the same click a reader makes. */
const view = (id) => (r) => {
    const b = r.query('[data-trkview]').find(e => e.dataset.trkview === id);
    if (b) { b.click(); } else { throw new Error('no view button: ' + id); }
};

module.exports = {
    script: 'projects.js',
    data,
    variants: () => [
        { id: 'items', label: 'Track → Items', data: data() },
        { id: 'timeline', label: 'Track → Timeline', data: data(), act: view('timeline') },
        { id: 'sessions', label: 'Track → Sessions', data: data(), act: view('sessions') },
        { id: 'gaps', label: 'Track → Gaps', data: data(), act: view('gaps') }
    ]
};
