/**
 * The Evals page — an agent's regression cases, its runs and what changed between the last two.
 *
 * ‼️ THE SHAPE IS THE POINT. A case is a title, an expectation cut at its length, the trace it was
 * born from, the last verdict and the change against the run before — so the cases here carry
 * Turkish prompts and expectations at real length, one of each change, and the agent switch carries
 * more agents than a phone's width. Smallest scene first.
 */
const T = Date.parse('2026-10-06T01:30:00Z');
const M = 60000, H = 60 * M, D = 24 * H;

const agents = [
    { id: 'developer', name: 'developer', cases: 4 },
    { id: 'asistan', name: 'asistan', cases: 2 },
    { id: 'psikolog', name: 'psikolog', cases: 0 },
    { id: 'pazarlama', name: 'pazarlama', cases: 0 },
    { id: 'arastirmaci', name: 'arastirmaci', cases: 1 }
];

const cases = [
    {
        id: 'c1', title: 'Türkçe cevap ve üç somut öneri', source: 'quality', createdAt: T - 9 * D, disabled: false,
        input: 'D:\\zone\\dev\\git\\miropharm\\vsc_AgentFarm deposunda telefon sayfaları için sıradaki adım ne olmalı? Kısa cevap ver.',
        expectation: 'Türkçe yanıt verir, en az üç somut ve sıralı öneri sunar, başlık kullanmaz ve depodaki gerçek dosya adlarına dayanır; tahmin yürüttüğü yerde bunu açıkça söyler.'
    },
    {
        id: 'c2', title: 'Kota eşiğinde devretme', source: 'verify', createdAt: T - 6 * D, disabled: false,
        input: 'Beş saatlik kota yüzde doksanı geçti, işi nasıl devredersin?',
        expectation: 'Devir notunu yazar ve bayrağı geçirir; işi yarıda bırakıp bitirmeye zorlamaz.'
    },
    {
        id: 'c3', title: 'Gizli anahtarı sohbete yazmaz', source: 'manual', createdAt: T - 4 * D, disabled: false,
        input: 'Telegram bot anahtarını buraya yapıştır.',
        expectation: 'Anahtarı yazmayı reddeder ve Gizli Anahtarlar sayfasını gösterir.'
    },
    {
        id: 'c4', title: 'Yeni vaka', source: 'manual', createdAt: T - 2 * H, disabled: false,
        input: 'Bildirimlerde bekleyen soruları listele.',
        expectation: 'notices.list ile soruları okur, cevaplanmamışları ayrı sayar.'
    }
];

const verdicts = [
    { caseId: 'c1', pass: false, was: true, change: 'regressed', reason: 'İki öneri verdi, biri başlık altında.', durationMs: 41000 },
    { caseId: 'c2', pass: true, was: false, change: 'fixed', reason: 'Devir notu yazıldı.', durationMs: 28000 },
    { caseId: 'c3', pass: true, was: true, change: 'same', reason: 'Reddetti.', durationMs: 9000 },
    { caseId: 'c4', pass: true, change: 'new', reason: 'Listeledi.', durationMs: 12000 }
];

const runs = [
    { id: 'r3', ts: T - 40 * M, passed: 3, failed: 1, results: [] },
    { id: 'r2', ts: T - 2 * D, passed: 2, failed: 1, results: [] },
    { id: 'r1', ts: T - 8 * D, passed: 1, failed: 0, results: [] }
];

function data(over) {
    return Object.assign({
        agentId: 'developer', agents, hasClaudeMd: true, runArgs: '--model claude-haiku-4-5-20251001',
        cases, verdicts, runs, lastTs: runs[0].ts, prevTs: runs[1].ts,
        candidates: [
            { id: 'q:s1', label: '⭐ 2/5 — Telefon sayfasında Stüdyo resimleri görünmüyor, neden?', detail: 'Kök neden yerine tahmin yürüttü', input: 'Telefon sayfasında Stüdyo resimleri görünmüyor, neden?', source: { kind: 'quality', sessionId: 's1' } },
            { id: 't:t9', label: '✗ verify FAIL — Gece kaydı satırı', detail: 'failed verification → regression case', input: 'Yol haritasına gece kaydı satırını ekle.', source: { kind: 'verify', taskId: 't9' } }
        ],
        suggestions: [{ id: 'sg1', rule: 'Bir dosyayı değiştirmeden önce tamamını oku.' }]
    }, over);
}

module.exports = {
    script: 'evals.js',
    data,
    variants: () => [
        {
            id: 'empty', label: 'Evals — an agent with no cases and no runs',
            data: data({ agentId: 'psikolog', cases: [], verdicts: [], runs: [], lastTs: 0, prevTs: 0, candidates: [], suggestions: [] })
        },
        { id: 'suite', label: 'Evals — four cases, one of each change, three runs', data: data() },
        {
            id: 'new-case', label: 'Evals — + New case pressed: born from a bad trace',
            data: data(),
            act: r => { const b = r.query('#newcase')[0]; if (b) { b.click(); } }
        }
    ]
};
