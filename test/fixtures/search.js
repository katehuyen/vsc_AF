/**
 * X-24 — the Search page under the content it is actually used on.
 *
 * The fixture rules (docs/CONVENTIONS.md → Looking at it): the real
 * distribution, not a flattering one. So: four engines in the results, Turkish
 * titles far wider than any column, a delegation hit next to a user hit (the
 * whole point of X-25's two new kinds), a memory note and an orphaned event, a
 * long snippet, and the id banner X-34 draws above everything.
 *
 * Three variants, because the two surfaces that had nothing to look at are the
 * ones this work added: the filter panel and the query help card.
 */
// The clock is the real one on purpose: every row on this page prints "how long
// ago", and a fixed instant in the future draws a page full of negative times —
// which is a picture of the fixture, not of the page.
const NOW = Date.now();

const hit = (o) => Object.assign({
    file: 'D:/s/a.jsonl', sessionId: '4d361981-6215-4c0b-9b9f-ffdbc394e478',
    agentName: 'developer', title: 'Oturum başlığı', ts: NOW - 3600000,
    role: 'user', engine: 'claude', turn: 1, turnLabel: 'ilk soru',
    before: '…arama kutusuna yazdığım ', match: 'parser', after: ' kelimesi hiçbir yerde bulunamıyordu'
}, o);

const RESULT = {
    filesScanned: 42, truncated: false, matchesFound: 11, matchesShown: 8,
    sessionsMatched: 4, omittedMatches: 3, parseFailures: 0,
    sessionMatches: [
        { file: 'D:/s/a.jsonl', found: 6, shown: 3 },
        { file: 'D:/s/b.jsonl', found: 1, shown: 1 },
        { file: 'D:/s/c.jsonl', found: 1, shown: 1 },
        { file: 'D:/s/d.jsonl', found: 1, shown: 1 }
    ],
    hits: [
        hit({ turn: 1, turnLabel: 'search fonksiyonu gelişmedi, baştan ele al' }),
        hit({
            role: 'delegator', speaker: 'manager', ts: NOW - 3500000, turn: 2,
            turnLabel: 'alt ajana devret',
            before: 'developer ajanına şunu ilet: ', match: 'parser',
            after: ' katmanını baştan yaz ve testlerini de kendin ekle'
        }),
        hit({
            role: 'tool', tool: 'Grep', ts: NOW - 3400000, turn: 2,
            before: 'Grep {"pattern":"', match: 'parser', after: '","path":"src/core"}'
        }),
        hit({
            file: 'D:/s/b.jsonl', sessionId: 'a91c77e0-2b31-4f10-9e02-5c8ab1d4e777',
            engine: 'codex', agentName: 'manager', ts: NOW - 90000000,
            title: 'Codex oturumu — motor eksenini bütün yüzeylere indir (çok uzun başlık)',
            role: 'assistant', turn: 3, turnLabel: 'codex tarafını da adapte et',
            before: 'kodeks tarafında ', match: 'parser', after: ' adaptörünü yazdım, testleri geçti'
        }),
        hit({
            file: 'D:/s/c.jsonl', sessionId: '77c0e1aa-9f22-4d53-8b31-11d0a2f3c001',
            engine: 'agy', agentName: 'psikolog', ts: NOW - 200000000,
            title: 'Antigravity oturumu', role: 'handler', turn: 1, turnLabel: 'devredilen iş',
            before: 'devredilen işi bitirdim: ', match: 'parser', after: ' artık Türkçe harflerde de doğru sınırlıyor'
        }),
        hit({
            file: 'D:/s/d.jsonl', sessionId: '22aa11bb-3c44-4d55-8e66-77f88a99b000',
            engine: 'gemini', agentName: 'basit', ts: NOW - 400000000,
            title: 'Gemini oturumu', role: 'toolResult', turn: 1, turnLabel: 'dosyayı oku',
            before: '', match: 'parser', after: '.ts:  1  import * as fs from "fs";'
        }),
        {
            file: 'D:/a/developer/memory/proje_talkscribe.md', agentName: 'developer',
            title: 'proje_talkscribe.md', ts: NOW - 500000000, role: 'memory', kind: 'memory',
            before: 'ZEN eklentisinin ', match: 'parser', after: ' katmanı Chrome Web Store sürümünde de aynı'
        },
        {
            file: '', agentName: 'manager', title: 'prompt', ts: NOW - 600000000,
            role: 'event', kind: 'event', tool: 'Bash',
            before: 'npm test -- ', match: 'parser', after: ' (transcript kalmamış)'
        }
    ]
};

const FACETS = {
    agents: ['basit', 'developer', 'manager', 'psikolog'],
    engines: ['claude', 'agy', 'codex', 'gemini'],
    projects: ['PRS.MuratVural_DEV_VSC.AgentFarm', 'PRS.MuratVural_DEV_TalkScribe', 'Unassigned'],
    models: ['opus-5', 'sonnet-5', 'gpt-5.6-sol', 'gemini-3.1-pro']
};

const data = () => ({
    agents: FACETS.agents,
    facets: FACETS,
    semantic: { provider: 'off', sessions: 0, chunks: 0 },
    preset: null
});

/** Type into the box, then let the page repaint so the markup carries what was
 *  typed — `preset` is a real host message and the shortest honest way to it. */
const type = (r, text) => {
    const box = r.query('#q')[0];
    box.value = text;
    box.fire('input');
    r.send({ type: 'preset', preset: null });
};

const results = (r) => {
    type(r, 'parser');
    r.send({
        type: 'results', seq: 0, result: RESULT,
        semanticStatus: { provider: 'off', sessions: 0, chunks: 0 },
        facets: FACETS,
        idMatch: {
            sessionId: '4d361981-6215-4c0b-9b9f-ffdbc394e478', file: 'D:/s/a.jsonl',
            title: 'Search fonksiyonu gelişmedi — baştan ele alınacak',
            agentName: 'developer', engine: 'claude', ts: NOW - 3600000
        }
    });
};

const variants = () => [
    { id: 'results', label: 'Search — results (four engines, delegation, memory, events)', data: data(), act: results },
    // ‼️ The press comes FIRST. The page rebuilds its whole card on every
    // control change, and the shim hands the page the same element object each
    // time — so a second press would run the handlers of both renders and
    // toggle the panel straight back shut.
    {
        id: 'filters', label: 'Search — the filter panel open', data: data(),
        act: (r) => { r.els['more-toggle'].click(); results(r); }
    },
    {
        id: 'help', label: 'Search — the query help card', data: data(),
        act: (r) => { r.els['guide-toggle'].click(); }
    }
];

module.exports = { script: 'search.js', data, variants, RESULT, FACETS };
