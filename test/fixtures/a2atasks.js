/**
 * The A2A Tasks board — work agents hand to each other (N-6).
 *
 * ‼️ THE SHAPE IS THE POINT. A row carries a state badge, a title at real
 * length, a handoff counter, five coordinate chips, a requires count, the
 * from → claimant pair, a LEASE BAR and an age — so the tasks here cover
 * every state, a fresh lease and a dying one, a second-hop handoff, a task
 * grown out of a note and one out of the user's queue, and a directive. A
 * real ledger is mostly closed, so the closed lane is the longer one. And the
 * SMALLEST scenes first: empty, then one queued task with nothing claimed.
 */
const T = Date.parse('2026-09-20T15:10:00Z');
const M = 60000;
const LEASE = 30 * M;

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

const task = (over) => Object.assign({
    id: 't-' + Math.random().toString(36).slice(2, 8), ts: T - 40 * M, fromAgent: 'manager',
    handoffDepth: 0, project: 'prj_9ujsbtzr', workdir: 'D:\\zone\\dev\\git\\miropharm\\vsc_AgentFarm',
    topic: 'a2a', targetRole: 'developer', targetSession: '*', strictness: 'preferred', requires: [],
    title: 'başlık', instructions: '', expectedOutput: '', maxCostUSD: 0, maxTurns: 0, state: 'queued'
}, over);

const one = task({
    id: 't-mu9q0', ts: T - 8 * M, fromAgent: 'manager', requires: ['write_tools', 'git'],
    title: 'N-7 süpervizör kokpiti: A2A kartlarına "+" satır içi direktif editörü',
    instructions: 'Kartın üstündeki minimal `+` düğmesi **steer · veto · constraint** üçlüsünü açar; kaydedince `a2a.directive.set` ile aynı yoldan yazılır.\n\n- Her kart tek bir direktif taşır\n- Direktif bloğu N-8\'in `directiveBlock`\'u ile aynı metni üretir',
    expectedOutput: 'İki sayfada çalışan editör, `test_a2a_pages.js`\'e eklenmiş sahne, VSIX.',
    maxCostUSD: 4, maxTurns: 40
});

const many = [
    one,
    task({
        id: 't-mu9q1', ts: T - 55 * M, fromAgent: 'developer', sourceNoteId: 'n-mu9p6', state: 'claimed',
        topic: 'x-128', targetRole: 'developer', strictness: 'hard', requires: ['shell'],
        title: 'X-128 ikinci yarı: süpürmeyi yalnızca değişen bağlamaların dokunabileceği oturumlarla sınırla',
        instructions: 'Profildeki 97 milyon `normCwd` çağrısı süpürme sayısından geliyor; `admit()` her taramada her oturum için koşuyor.',
        claimedBy: { agent: 'developer', sessionId: 'a65a340e-5ca8-431b-ad03-d7ea77639182', leaseExpiresAt: T + 26 * M, progress: 'ölçüm senaryosu yazıldı, guard 10.000 oturumda koşuyor' }
    }),
    task({
        id: 't-mu9q2', ts: T - 70 * M, fromAgent: 'manager', state: 'running', handoffDepth: 2, parentTaskId: 't-mu9p9',
        project: '*', workdir: '*', topic: 'kota', targetRole: '*', strictness: 'any',
        title: 'Dört Claude hesabının 5 saatlik pencerelerini tabloya dök ve en boş slotu Notices\'a yaz',
        instructions: '`accounts.list` → yüzdeler; sonucu tek bir `notices.post` ile bildir.',
        claimedBy: { agent: 'basit', leaseExpiresAt: T + 4 * M, progress: '3/4 hesap okundu' }
    }),
    task({
        id: 't-mu9q3', ts: T - 120 * M, fromAgent: 'developer', state: 'blocked', handoffDepth: 3,
        project: 'prj_talk', workdir: 'ZEP', topic: 'release', targetRole: 'developer',
        title: 'ZEP 1.9 Play Console incelemesi için ekran görüntülerini yenile',
        instructions: 'Üç dilde altışar görüntü.',
        resultSummary: 'Üç kez devredildi (handoffDepth 3) — yönlendirme yanlış olabilir, insan kararı gerekiyor.',
        humanDirective: { kind: 'veto', text: 'Bunu şimdilik yapmayın; önce ZEN 2.4.1 kullanıcı geri bildirimi gelsin.', ts: T - 60 * M }
    }),
    task({
        id: 't-mu9q4', ts: T - 5 * 60 * M, fromAgent: 'user', sourceQueueItemId: 'q-mu9k7', state: 'done',
        topic: 'x-153', targetRole: 'developer', requires: ['git'],
        title: 'X-153: motor SQLite ikililerini git\'ten çıkar, opencode.db için gz snapshot kur',
        instructions: 'Ham transkriptlere dokunma.',
        resultSummary: '`8162ce6f` — 250 dosya çıktı, snapshot 61 → 14,1 MB, Doctor iki yeni denetim.',
        claimedBy: { agent: 'developer', leaseExpiresAt: T - 200 * M, progress: 'bitti' }
    }),
    task({
        id: 't-mu9q5', ts: T - 9 * 60 * M, fromAgent: 'manager', state: 'failed',
        topic: 'wiki', targetRole: 'explorer',
        title: 'Wiki kategori birleştirme için aday listesini çıkar',
        resultSummary: 'Vault MCP ulaşılamadı (ECONNREFUSED 27124); üç deneme.'
    }),
    task({
        id: 't-mu9q6', ts: T - 26 * 60 * M, fromAgent: 'developer', state: 'cancelled',
        topic: 'x-344', targetRole: 'developer',
        title: 'Aktivasyon hatasını eski VSIX\'e dönerek doğrula',
        resultSummary: 'Gerek kalmadı — kök neden exthost.log\'da bulundu (projectRollup TDZ).'
    }),
    task({
        id: 't-mu9q7', ts: T - 30 * 60 * M, fromAgent: 'manager', state: 'done',
        project: '*', workdir: '*', topic: '*', targetRole: 'basit', strictness: 'any',
        title: 'Günlük yedek commit',
        resultSummary: 'v26.9.20.2 — 12 dosya.',
        claimedBy: { agent: 'basit', leaseExpiresAt: T - 29 * 60 * M, progress: 'bitti' }
    })
];

const data = over => Object.assign({
    generatedAt: T,
    now: T,
    tasks: many,
    notesById: { 'n-mu9p6': { title: 'Profildeki 97 milyon normCwd çağrısı 324×15\'ten değil SÜPÜRME SAYISINDAN geliyor' } },
    projects,
    agents: ['developer', 'manager', 'basit', 'psikolog'],
    leaseMs: LEASE,
    maxHandoffDepth: 3,
    focusId: null
}, over || {});

/** Press the + on one row — the cockpit is reached by pressing it, here too. */
const openCockpit = id => r => {
    const b = r.query('[data-plus]').find(e => e.dataset.plus === id);
    if (b) { b.click(); }
};

module.exports = {
    script: 'a2aTasks.js',
    data,
    variants: () => [
        { id: 'empty', label: 'A2A Tasks — nothing on the board', data: data({ tasks: [], notesById: {} }) },
        { id: 'one', label: 'A2A Tasks — one queued task, opened, nobody has claimed it', data: data({ tasks: [one], notesById: {}, focusId: one.id }) },
        { id: 'board', label: 'A2A Tasks — the board: two lanes, a fresh lease and a dying one, a veto', data: data({ focusId: 't-mu9q1' }) },
        // N-7 — the cockpit, at its two arities. The SMALLEST first: one queued
        // task with no directive on it, so the form is empty and the button row
        // is as short as it ever gets.
        {
            id: 'cockpit-empty', label: 'A2A Tasks — supervisor cockpit open on an undirected task (+ pressed)',
            data: data({ tasks: [one], notesById: {} }), act: openCockpit(one.id)
        },
        {
            id: 'cockpit-full', label: 'A2A Tasks — supervisor cockpit on the BLOCKED, vetoed task: directive filled, re-route and Run Now (+ pressed)',
            data: data({}), act: openCockpit('t-mu9q3')
        },
        {
            id: 'cockpit-closed', label: 'A2A Tasks — supervisor cockpit on a DONE task: the word still marks it, nothing left to move or start (+ pressed)',
            data: data({}), act: openCockpit('t-mu9q4')
        }
    ]
};
