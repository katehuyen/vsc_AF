// X-42 — SEARCH SPEED, and the one thing that must not have changed: the answer.
//
// The corpus (src/core/textSearchCorpus.ts) exists to stop a query paying for
// 664 MB of transcript. Every test here is about the price of that: the
// candidate prefilter is allowed to skip a file only where a match is
// impossible, so the suite's spine is a battery that runs each query through
// BOTH engines — the direct scan and the corpus — and demands the same hits,
// in the same order, with the same counters.
//
//   (a) every existing shape agrees, hit for hit and counter for counter
//   (b) AND / OR / NOT / negative-only / parentheses / phrase / unclosed
//       phrase / wildcard / case / Turkish Unicode whole-word / raw regex
//   (c) the second identical Dialog query reads no transcript and no tool shard
//   (d) append → one session reindexed · delete → pruned · schema → rebuilt ·
//       corrupt manifest → self-healed · a missing foreign parser does not
//       poison the cache
//   (e) ripgrep: exit 1 is the only honest zero; a missing or wrong binary
//       falls back to the full read rather than reporting an empty page
//   (f) a superseded search really stops, and the page draws only the last seq
//   (g) the memory / event sources keep their dates, agents and orphan rule
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const S = require(path.join(ROOT, 'out', 'core', 'search.js'));
const C = require(path.join(ROOT, 'out', 'core', 'textSearchCorpus.js'));
const Q = require(path.join(ROOT, 'media', 'afQuery.js'));
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));
const fixture = require(path.join(__dirname, 'fixtures', 'search.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-speed-'));
const pool = path.join(tmp, 'pool');
fs.mkdirSync(pool, { recursive: true });

const T = (i, m) => `2026-08-1${i % 9}T10:${String(m).padStart(2, '0')}:00.000Z`;
const write = (name, lines) => {
    const p = path.join(pool, name);
    fs.writeFileSync(p, lines.map(l => JSON.stringify(l)).join('\n'), 'utf8');
    return p;
};

// ‼️ MORE FILES THAN THE OLD LRU HELD (80). That cache is exactly why a repeated
// fleet query never got faster: a newest→oldest pass over 380 files evicts its
// own head every time round. A fixture of 90 is the smallest one that measures it.
const COUNT = 90;
const sessions = [];
for (let i = 0; i < COUNT; i++) {
    const lines = [
        { type: 'user', timestamp: T(i, 1), message: { content: `soru ${i}: parser üzerinde ölçüm yapalım` } },
        {
            type: 'assistant', timestamp: T(i, 2), message: {
                content: [
                    { type: 'text', text: `cevap ${i}: tokenizer ve arama motoru için ÖLÇÜMLERİ tamamladım` },
                    { type: 'tool_use', name: 'Edit', input: { file_path: `D:/p/f${i}.ts`, old_string: 'radyoaktif izotop' } }
                ]
            }
        },
        { type: 'user', timestamp: T(i, 3), message: { content: [{ type: 'tool_result', content: `edit uygulandı f${i}.ts radyoaktif` }] } }
    ];
    // Three words that live in exactly one session each: what the candidate pass
    // is for, and what proves it did something.
    if (i === 7) { lines.push({ type: 'user', timestamp: T(i, 4), message: { content: 'zebrafish kurulum notu codex için' } }); }
    if (i === 13) { lines.push({ type: 'assistant', timestamp: T(i, 5), message: { content: [{ type: 'text', text: 'gemini kurulum adımları burada' }] } }); }
    if (i === 21) { lines.push({ type: 'user', timestamp: T(i, 6), message: { content: 'çok satırlı\nbir metin: arama motoru burada' } }); }
    sessions.push({
        file: write(`s${i}.jsonl`, lines),
        agentName: i % 3 === 0 ? 'developer' : 'yazar',
        // X-147: one session whose TITLE carries a word its conversation does not
        title: i === 33 ? 'Oturum 33 — flamingo kurulumu' : `Oturum ${i}`,
        mtime: Date.parse(T(i, 3)) + i,
        sessionId: `sess-${i}`,
        engine: 'claude'
    });
}

// A foreign transcript, so the parser-absence rule is measured on a real one.
const foreignFile = path.join(pool, 'codex.jsonl');
fs.writeFileSync(foreignFile, 'not-a-claude-transcript radyoaktif\n', 'utf8');
const foreign = {
    file: foreignFile, agentName: 'developer', title: 'Codex oturumu',
    mtime: Date.now(), sessionId: 'sess-codex', engine: 'codex'
};
const parseForeign = (raw, file) => file === foreignFile ? {
    messages: [
        { role: 'user', ts: Date.parse(T(1, 1)), text: 'codex tarafında parser ölçüm sorusu' },
        { role: 'assistant', ts: Date.parse(T(1, 2)), text: 'codex cevabı: arama motoru hazır' }
    ],
    turns: [{ n: 0, label: 'codex tarafında parser' }]
} : undefined;

const newService = (dir, extra) => new C.TextSearchService(Object.assign({
    storageRoot: path.join(tmp, dir), parseForeign
}, extra || {}));

// =========================================================================
// (a) + (b) — the two engines answer the same question the same way
// =========================================================================

const CASES = [
    ['a bare word', 'parser', {}],
    ['AND (juxtaposition)', 'parser ölçüm', {}],
    ['explicit AND', 'parser AND tokenizer', {}],
    ['OR', 'zebrafish OR gemini', {}],
    ['NOT', 'parser -tokenizer', {}],
    ['negative only — nothing to narrow with', '-zebrafish', {}],
    ['parentheses', '(zebrafish OR gemini) kurulum', {}],
    ['a closed phrase', '"arama motoru"', {}],
    ['an unclosed phrase, as typed', '"arama moto', {}],
    ['a wildcard', 'ölç*', {}],
    ['a phrase with unfinished words', '"arama mot*"', {}],
    ['case sensitive', 'ÖLÇÜMLERİ', { caseSensitive: true }],
    ['case insensitive across Turkish letters', 'ölçümleri', {}],
    ['whole word, Turkish', 'ölçüm', { wholeWord: true }],
    ['whole word with a wildcard end', 'ölçüm*', { wholeWord: true }],
    ['raw regex', 'par[sz]er', { regex: true }],
    ['raw regex, case sensitive', 'ÖLÇÜM[A-ZÇĞİÖŞÜ]+', { regex: true, caseSensitive: true }],
    ['X-147: a word only a title carries', 'flamingo', {}],
    ['X-147: a title word AND a conversation word', 'flamingo parser', {}],
    ['X-147: a title word in Everything mode', 'flamingo', { roles: S.ALL_ROLES }],
    ['X-147: the Turkish İ folded, in the conversation', 'ölçümleri', {}],
    ['the tool trail, on demand', 'radyoaktif', { roles: S.ALL_ROLES }],
    ['a term nothing carries', 'kesinliklebulunmayanbirkelime', {}],
    ['a short term, below the prefilter floor', 'ök', {}],
    ['a date window', 'parser', { tsFrom: Date.parse(T(3, 0)), tsTo: Date.parse(T(5, 59)) }],
    ['one agent', 'parser', { agentNames: ['developer'] }],
    ['one file', 'parser', { files: [sessions[4].file] }]
];

const shape = (r) => JSON.stringify({
    hits: r.hits.map(h => [h.file, h.ts, h.role, h.turn, h.turnLabel, h.tool || '', h.before, h.match, h.after]),
    filesScanned: r.filesScanned, matchesFound: r.matchesFound, matchesShown: r.matchesShown,
    sessionsMatched: r.sessionsMatched, omittedMatches: r.omittedMatches,
    parseFailures: r.parseFailures, truncated: r.truncated, timedOut: r.timedOut === true,
    sessionMatches: r.sessionMatches
});

const all = [...sessions, foreign];

async function parity(svc, label) {
    for (const [name, query, extra] of CASES) {
        const opts = Object.assign({ maxHits: 500, maxPerFile: 20, parseForeign }, extra);
        const direct = S.searchTranscripts(all, query, opts);
        const viaCorpus = await svc.search(all, query, opts);
        ok(`${label}: ${name}`, shape(direct) === shape(viaCorpus));
    }
}

// =========================================================================

(async () => {
    // ---------- the battery, with the Node candidate scanner ----------
    await parity(newService('c-node'), 'node scanner');

    // ---------- the battery again on a WARM corpus: nothing may drift ----------
    const warm = newService('c-node');
    await parity(warm, 'warm corpus');

    // ---------- the prefilter's own promises ----------
    {
        const p = (q, o) => Q.prefilter(q, o || {});
        ok('a bare word gives one literal', p('parser').mode === 'any' && p('parser').literals.join() === 'parser');
        ok('AND keeps the more selective side', p('parser ölç').literals.join() === 'parser');
        // X-147: an `i` is not invariant under case folding (the matcher treats
        // i/İ/ı/I as one letter, ripgrep's -i does not), so it cuts a literal
        // exactly as `*` does — "zebrafish" scans for "zebraf", "gemini" for "gem".
        ok('OR unions both sides', p('zebrafish OR gemini').literals.sort().join() === 'gem,zebraf');
        ok('X-147: …and the literals are whole again when case is exact',
            p('zebrafish OR gemini', { caseSensitive: true }).literals.sort().join() === 'gemini,zebrafish');
        ok('OR with an unusable side reads everything', p('zebrafish OR ök').mode === 'all');
        ok('NOT never narrows', p('-parser').mode === 'all');
        ok('AND drops the negated side and keeps the other', p('parser -tokenizer').literals.join() === 'parser');
        ok('a wildcard keeps its literal run', p('refact*').literals.join() === 'refact');
        ok('a wildcard in the middle keeps the longer run', p('re*factoring').literals.join() === 'factor');
        ok('a phrase keeps its longest word', p('"arama motoru"').literals.join() === 'motoru');
        ok('a term below the floor reads everything', p('ök').mode === 'all');
        ok('raw regex is never planned', p('par[sz]er', { regex: true }).mode === 'all');
        ok('an empty query is never planned', p('   ').mode === 'all');
        ok('an unreadable query is never planned', p('a )').mode === 'all');
        ok('whole-word changes the anchoring, not the literal',
            p('ölçüm', { wholeWord: true }).literals.join() === 'ölçüm');

        // ‼️ Monotonicity is what lets a reader test a BLOCK of records before
        // splitting it. Get this wrong on a NOT and the block that contains the
        // excluded word hides every innocent line inside it.
        ok('a positive query is monotone', p('parser').monotone === true);
        ok('AND and OR of positives stay monotone',
            p('parser ölçüm').monotone === true && p('zebrafish OR gemini').monotone === true);
        ok('‼️ a NOT anywhere makes it non-monotone', p('parser -tokenizer').monotone === false);
        ok('…including a negative-only query', p('-zebrafish').monotone === false);
        ok('raw regex is never monotone (^ and $ are anchors on the whole string)',
            p('par[sz]er', { regex: true }).monotone === false);
    }

    // ---------- (c) the second query reads neither transcript nor tool shard ----------
    {
        const svc = newService('c-reads');
        const real = fs.readFileSync;
        let seen = [];
        fs.readFileSync = function (p, ...rest) { seen.push(String(p)); return real.call(fs, p, ...rest); };
        try {
            await svc.search(all, 'parser', { maxHits: 500, parseForeign });
            const firstTranscripts = seen.filter(p => p.endsWith('.jsonl')).length;
            ok('the first query builds the corpus out of the transcripts', firstTranscripts >= COUNT);

            seen = [];
            await svc.search(all, 'parser', { maxHits: 500, parseForeign });
            const reread = seen.filter(p => p.endsWith('.jsonl'));
            ok('‼️ the second identical query reads NO transcript', reread.length === 0);
            ok('…and no tool shard, because the question was about the dialogue',
                !seen.some(p => /\.(tool|toolResult)\.tsv$/.test(p)));

            // A brand-new service shares the corpus on disk but starts with an
            // empty working set: it must read the DIALOGUE shards and still
            // never open a transcript or a tool shard.
            seen = [];
            const cold = newService('c-reads');
            await cold.search(all, 'parser', { maxHits: 500, parseForeign });
            ok('a cold service reads the dialogue shards, not the transcripts',
                seen.some(p => /\.(user|assistant)\.tsv$/.test(p))
                && !seen.some(p => p.endsWith('.jsonl')));
            ok('…and still not the tool trail', !seen.some(p => /\.(tool|toolResult)\.tsv$/.test(p)));

            seen = [];
            await svc.search(all, 'radyoaktif', { roles: S.ALL_ROLES, maxHits: 500, parseForeign });
            ok('Everything mode is what opens the tool trail', seen.some(p => /\.tool\.tsv$/.test(p)));
        } finally { fs.readFileSync = real; }
    }

    // ---------- (d) invalidation, pruning, self-healing ----------
    {
        const dir = 'c-inval';
        const svc = newService(dir);
        await svc.search(all, 'parser', { maxHits: 500, parseForeign });

        // one file changes → only that one is rebuilt
        const target = sessions[5];
        fs.appendFileSync(target.file, '\n' + JSON.stringify({
            type: 'user', timestamp: T(5, 9), message: { content: 'sonradan eklenen kuantum satırı' }
        }), 'utf8');
        const real = fs.readFileSync;
        const seen = [];
        fs.readFileSync = function (p, ...rest) { seen.push(String(p)); return real.call(fs, p, ...rest); };
        let after;
        try { after = await svc.search(all, 'kuantum', { maxHits: 500, parseForeign }); }
        finally { fs.readFileSync = real; }
        const rebuilt = seen.filter(p => p.endsWith('.jsonl'));
        ok('an appended session is the only one re-read',
            rebuilt.length === 1 && rebuilt[0] === target.file);
        ok('…and the new line is findable at once', after.hits.length === 1
            && after.hits[0].file === target.file);
        ok('…with the same answer the direct scan gives',
            shape(after) === shape(S.searchTranscripts(all, 'kuantum', { maxHits: 500, parseForeign })));

        // a deleted session takes its shards with it
        const gone = path.join(pool, 'gone.jsonl');
        fs.writeFileSync(gone, JSON.stringify({
            type: 'user', timestamp: T(2, 1), message: { content: 'silinecek oturum pelikan' }
        }), 'utf8');
        const withGone = [...all, {
            file: gone, agentName: 'yazar', title: 'Silinecek', mtime: Date.now(), sessionId: 'sess-gone', engine: 'claude'
        }];
        await svc.search(withGone, 'pelikan', { maxHits: 500, parseForeign });
        const shardDir = path.join(tmp, dir, C.CORPUS_DIR, 'sh');
        const before = fs.readdirSync(shardDir).length;
        fs.unlinkSync(gone);
        const fresh = newService(dir);
        await fresh.search(all, 'parser', { maxHits: 500, parseForeign });
        ok('a deleted session is pruned out of the cache',
            fs.readdirSync(shardDir).length < before);

        // a shard deleted under us heals rather than losing the session
        const anyShard = fs.readdirSync(shardDir).find(f => /\.user\.tsv$/.test(f));
        fs.unlinkSync(path.join(shardDir, anyShard));
        const healed = await fresh.search(all, 'parser', { maxHits: 500, parseForeign });
        ok('a missing shard is rebuilt, not reported as a hole',
            shape(healed) === shape(S.searchTranscripts(all, 'parser', { maxHits: 500, parseForeign })));

        // a corrupt manifest is a cache miss, never an error
        fs.writeFileSync(path.join(tmp, dir, C.CORPUS_DIR, 'manifest.json'), '{ not json', 'utf8');
        const afterCorrupt = newService(dir);
        const r = await afterCorrupt.search(all, 'parser', { maxHits: 500, parseForeign });
        ok('a corrupt manifest self-heals into a rebuild',
            shape(r) === shape(S.searchTranscripts(all, 'parser', { maxHits: 500, parseForeign })));

        // a schema bump is a rebuild, and the folder name says which schema
        ok('the cache folder carries its schema version', /^search-corpus-v\d+$/.test(C.CORPUS_DIR));

        // ---------- X-131: pruning does not block the host, and says what it costs ----------
        // ‼️ The rule it enforces is one stat per session that EVER RAN, on the
        // extension host's only thread, paid on the first query of every window
        // — 146 ms at 977 entries here, ~1.5 s at ten thousand, to discover (as
        // it did) that nothing is prunable at all. So it is asked through
        // fs.promises with a yield, and the guard is that the synchronous call
        // is not the one being made.
        {
            const askedSync = [];
            const realExists = fs.existsSync;
            fs.existsSync = function (p) { askedSync.push(String(p)); return realExists.call(fs, p); };
            let pruned;
            try {
                pruned = newService('c-prune-async');
                await pruned.search(all, 'parser', { maxHits: 50, parseForeign });
            } finally { fs.existsSync = realExists; }
            ok('X-131: no transcript is stat-ed synchronously to decide pruning',
                askedSync.filter(p => p.endsWith('.jsonl')).length === 0);

            // And a gone transcript is still pruned — asynchronously is not
            // "less", it is the same rule off the blocking path.
            const ghost = path.join(pool, 'ghost.jsonl');
            fs.writeFileSync(ghost, JSON.stringify({
                type: 'user', timestamp: T(3, 1), message: { content: 'hayalet oturum pelikan' }
            }), 'utf8');
            const withGhost = [...all, {
                file: ghost, agentName: 'yazar', title: 'Hayalet',
                mtime: Date.now(), sessionId: 'sess-ghost', engine: 'claude'
            }];
            const svcG = newService('c-prune-ghost');
            await svcG.search(withGhost, 'pelikan', { maxHits: 50, parseForeign });
            const ghostDir = path.join(tmp, 'c-prune-ghost', C.CORPUS_DIR, 'sh');
            const hadGhost = fs.readdirSync(ghostDir).length;
            fs.unlinkSync(ghost);
            const svcG2 = newService('c-prune-ghost');
            await svcG2.search(all, 'parser', { maxHits: 50, parseForeign });
            ok('X-131: the async prune still drops a deleted session',
                fs.readdirSync(ghostDir).length < hadGhost);

            // What the corpus costs is readable from the manifest's own figures,
            // so a ceiling can be CHOSEN against a measurement rather than a guess
            // (tools/measure_search_corpus.js reads the same numbers from outside).
            const chars = svcG2.corpusChars();
            let fromManifest = 0;
            const man = JSON.parse(fs.readFileSync(
                path.join(tmp, 'c-prune-ghost', C.CORPUS_DIR, 'manifest.json'), 'utf8'));
            for (const e of Object.values(man.entries || {})) {
                for (const i of Object.values(e.r || {})) { fromManifest += i.c || 0; }
            }
            ok('X-131: corpusChars() is the manifest, not an estimate',
                chars > 0 && chars === fromManifest);
        }
    }

    // ---------- X-131: the corpus is bounded by AGEING THE TOOL TRAIL, not by keeping fewer sessions ----------
    // ‼️ A size cap would thrash: a fleet query asks for EVERY session, so
    // anything evicted below the working set is rebuilt on the next query — the
    // 7.5 s re-parse the corpus exists to have ended. The trail is 92.5% of the
    // bytes and only an Everything search reads it, so past the horizon a
    // session keeps its dialogue shards and loses its trail. The four things
    // this guards: the default search never pays for it (no rebuild, cold or
    // warm); an Everything search re-parses exactly the aged sessions, SAYS SO,
    // and answers what the direct scan answers; the next window drops the trail
    // again; and a session written to again is young again.
    {
        const agePool = path.join(tmp, 'age-pool');
        fs.mkdirSync(agePool, { recursive: true });
        const AGE_N = 6, OLD = 4;
        const daysAgo = n => new Date(Date.now() - n * 86400000);
        const aged = [];
        for (let i = 0; i < AGE_N; i++) {
            const p = path.join(agePool, `a${i}.jsonl`);
            fs.writeFileSync(p, [
                { type: 'user', timestamp: T(i, 1), message: { content: `yaşlanma sorusu ${i} albatros` } },
                {
                    type: 'assistant', timestamp: T(i, 2), message: {
                        content: [
                            { type: 'text', text: `yaşlanma cevabı ${i} albatros` },
                            { type: 'tool_use', name: 'Bash', input: { command: `echo kondor ${i}` } }
                        ]
                    }
                },
                { type: 'user', timestamp: T(i, 3), message: { content: [{ type: 'tool_result', content: `kondor ${i} çıktı` }] } }
            ].map(l => JSON.stringify(l)).join('\n'), 'utf8');
            const old = i < OLD;
            // the age is the transcript's own mtime — what the signature stores
            if (old) { const d = daysAgo(100); fs.utimesSync(p, d, d); }
            aged.push({
                file: p, agentName: 'yazar', title: `Yaş ${i}`, sessionId: `sess-age-${i}`, engine: 'claude',
                mtime: old ? daysAgo(100).getTime() : Date.now()
            });
        }
        const trailFiles = dir => fs.readdirSync(dir).filter(f => /\.(tool|toolResult)\.tsv$/.test(f));
        const spy = async (fn) => {
            const real = fs.readFileSync;
            const seen = [];
            fs.readFileSync = function (p, ...rest) { seen.push(String(p)); return real.call(fs, p, ...rest); };
            try { await fn(); } finally { fs.readFileSync = real; }
            return seen.filter(p => p.endsWith('.jsonl'));
        };
        const ageDir = 'c-age';
        const ageShards = path.join(tmp, ageDir, C.CORPUS_DIR, 'sh');
        const ageSvc = () => newService(ageDir, { toolTrailDays: () => 60 });
        const EVERYTHING = { roles: S.ALL_ROLES, maxHits: 50, parseForeign };
        const DIALOG = { maxHits: 50, parseForeign };

        // 1. the first build of an old session writes no trail at all
        let svc = ageSvc();
        const dlg = await svc.search(aged, 'albatros', DIALOG);
        ok('X-131: the dialogue of an aged session is indexed like any other', dlg.sessionsMatched === AGE_N);
        ok('X-131: a session past the horizon is built WITHOUT its trail shards — nothing written today to be unlinked tomorrow',
            trailFiles(ageShards).length === (AGE_N - OLD) * 2);
        ok('X-131: stats() names the aged sessions', svc.stats().aged === OLD);
        ok('X-131: …and the default search says nothing about it', dlg.trailRebuilt === undefined);

        // 2. the default search never re-reads a transcript because of ageing
        let reread = await spy(async () => { await ageSvc().search(aged, 'albatros', DIALOG); });
        ok('‼️ X-131: a cold default search over aged sessions reads NO transcript', reread.length === 0);

        // 3. an Everything search re-parses exactly the aged sessions, says so, and answers what the direct scan answers
        svc = ageSvc();
        let ev;
        reread = await spy(async () => { ev = await svc.search(aged, 'kondor', EVERYTHING); });
        ok('X-131: an Everything search re-reads the aged transcripts and no other',
            reread.length === OLD && reread.every(p => aged.slice(0, OLD).some(s => s.file === p)));
        ok('X-131: …says how many it re-read', ev.trailRebuilt === OLD);
        ok('X-131: …and the answer is the direct scan\'s, hit for hit',
            shape(ev) === shape(S.searchTranscripts(aged, 'kondor', EVERYTHING)));
        ok('X-131: the re-parsed trail is on disk for the rest of this window', trailFiles(ageShards).length === AGE_N * 2);
        reread = await spy(async () => { ev = await svc.search(aged, 'kondor', EVERYTHING); });
        ok('X-131: a second Everything search in the same window re-reads nothing',
            reread.length === 0 && ev.trailRebuilt === undefined);

        // 4. the next window's first search ages the trail out again
        svc = ageSvc();
        await svc.search(aged, 'albatros', DIALOG);
        ok('X-131: the next window drops the aged trail again',
            trailFiles(ageShards).length === (AGE_N - OLD) * 2 && svc.stats().aged === OLD);
        const man = JSON.parse(fs.readFileSync(path.join(tmp, ageDir, C.CORPUS_DIR, 'manifest.json'), 'utf8'));
        const agedEntries = Object.values(man.entries).filter(e => e.aged);
        ok('X-131: the manifest no longer lists the dropped shards',
            agedEntries.length === OLD && agedEntries.every(e => !e.r.tool && !e.r.toolResult));

        // 5. 0 keeps every trail; a caller that passes no horizon gets the setting's own default
        const keepDir = 'c-age-keep';
        const keep = newService(keepDir, { toolTrailDays: () => 0 });
        await keep.search(aged, 'albatros', DIALOG);
        ok('X-131: 0 keeps every trail for ever',
            trailFiles(path.join(tmp, keepDir, C.CORPUS_DIR, 'sh')).length === AGE_N * 2 && keep.stats().aged === 0);
        const dflt = newService('c-age-default');
        await dflt.search(aged, 'albatros', DIALOG);
        ok('X-131: the default horizon is the setting\'s default (60 days)', dflt.stats().aged === OLD);
        const pkgDays = require(path.join(ROOT, 'package.json')).contributes.configuration.properties['agentFarm.searchToolTrailDays'];
        ok('X-131: package.json carries the setting, default 60, floor 0',
            pkgDays && pkgDays.default === 60 && pkgDays.minimum === 0);
        ok('X-131: …and settingsops files it under search',
            /searchToolTrailDays: 'search'/.test(fs.readFileSync(path.join(ROOT, 'src', 'core', 'settingsops.ts'), 'utf8')));
        ok('X-131: …and the extension reads it live into the corpus',
            /toolTrailDays: \(\) => cfg\(\)\.get<number>\('searchToolTrailDays', 60\)/.test(
                fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8')));

        // 6. a session that is written to again is young again
        fs.appendFileSync(aged[0].file, '\n' + JSON.stringify({
            type: 'user', timestamp: T(0, 9), message: { content: 'dirilen oturum albatros' }
        }), 'utf8');
        svc = ageSvc();
        await svc.search(aged, 'albatros', DIALOG);
        ok('X-131: a transcript written to again is rebuilt whole and is young again',
            svc.stats().aged === OLD - 1 && trailFiles(ageShards).length === (AGE_N - OLD + 1) * 2);

        // 7. the page says it, and names the setting that decides it
        const r = runPage('search.js', fixture.data(), {
            setTimeout: fn => { fn(); return 1; }, clearTimeout: () => { }
        });
        const box = r.query('#q')[0];
        box.value = 'kondor';
        box.fire('input');
        const seq = r.posted.filter(p => p.type === 'search').pop().seq;
        r.send({ type: 'results', seq, result: Object.assign({}, fixture.RESULT, { trailRebuilt: 3 }) });
        ok('X-131: the page says how many older sessions were re-read and why',
            /3 older session\(s\) had their tool trail re-read/.test(r.html()) && r.html().includes('searchToolTrailDays'));
        r.send({ type: 'results', seq, result: fixture.RESULT });
        ok('X-131: …and says nothing when none were', !/tool trail re-read/.test(r.html()));
    }

    // ---------- X-147: the session's TITLE is searched, in both engines ----------
    // ‼️ The title was only ever metadata on a hit; the matcher ran over the
    // messages and nothing else, so a session named after the word and not
    // containing it could not be found on the Search page — while sessions.find
    // matched titles on another surface. One reducer, so both engines agree.
    {
        const t = sessions[33];
        const direct = S.searchTranscripts(all, 'flamingo', { maxHits: 500, parseForeign });
        ok('X-147: a word only the title carries finds the session',
            direct.hits.length === 1 && direct.hits[0].file === t.file && direct.sessionsMatched === 1);
        const h = direct.hits[0];
        ok('X-147: …as a title hit, dated by the session, with the name as its snippet',
            h.kind === 'title' && h.role === 'title' && h.ts === t.mtime && h.match === 'flamingo'
            && (h.before + h.match + h.after) === 'Oturum 33 — flamingo kurulumu');
        ok('X-147: …carrying the session identity the page draws its header from',
            h.sessionId === 'sess-33' && h.author === 'human' && h.title === t.title);
        const both = S.searchTranscripts(all, 'Oturum', { maxHits: 500, maxPerFile: 20, parseForeign });
        const grp = both.hits.filter(x => x.file === t.file);
        ok('X-147: the title hit comes first in its session, ahead of the messages',
            grp.length >= 1 && grp[0].kind === 'title');
        ok('X-147: a memory-only / events-only search (roles: []) does not match titles',
            S.searchTranscripts(all, 'flamingo', { roles: [], maxHits: 500, parseForeign }).hits.length === 0);
        ok('X-147: the date window applies to the title too',
            S.searchTranscripts(all, 'flamingo', { tsTo: t.mtime - 1, maxHits: 500, parseForeign }).hits.length === 0
            && S.searchTranscripts(all, 'flamingo', { tsFrom: t.mtime, maxHits: 500, parseForeign }).hits.length === 1);
        ok('X-147: the title is matched case-folded like everything else',
            S.searchTranscripts(all, 'FLAMİNGO', { maxHits: 500, parseForeign }).hits.length === 1);
        const svc = newService('c-title');
        const corp = await svc.search(all, 'flamingo', { maxHits: 500, parseForeign });
        ok('X-147: the corpus answers the same', shape(corp) === shape(direct) && corp.hits[0].kind === 'title');

        // the page draws it under its session with a `title` badge
        const r = runPage('search.js', fixture.data(), {
            setTimeout: fn => { fn(); return 1; }, clearTimeout: () => { }
        });
        const box = r.query('#q')[0];
        box.value = 'flamingo';
        box.fire('input');
        const seq = r.posted.filter(p => p.type === 'search').pop().seq;
        const titleHit = Object.assign({}, fixture.RESULT.hits[0], {
            kind: 'title', role: 'title', before: 'Oturum 33 — ', match: 'flamingo', after: ' kurulumu', tool: undefined
        });
        r.send({ type: 'results', seq, result: Object.assign({}, fixture.RESULT, {
            hits: [titleHit], matchesFound: 1, matchesShown: 1, sessionsMatched: 1
        }) });
        ok('X-147: the page draws a title hit with its own badge and the name highlighted',
            /<span class="badge">title<\/span>/.test(r.html()) && /<mark>flamingo<\/mark> kurulumu/.test(r.html()));
        ok('X-147: …and counts it as a session, not as a memory or event source',
            /<b>1<\/b>sessions/.test(r.html()));

        // ‼️ X-147 — A SESSION WHOSE EVERY MATCH FELL PAST THE PREVIEW CAP IS
        // STILL ON THE PAGE. The bar counted it; the list did not draw it.
        const capped = S.searchTranscripts(all, 'parser', { maxHits: 4, maxPerFile: 2, parseForeign });
        const unpreviewed = capped.sessionMatches.filter(c => c.shown === 0);
        const previewedFiles = new Set(capped.hits.map(h => h.file)).size;
        ok('X-147: the engine names every matched session, previewed or not',
            capped.sessionsMatched > previewedFiles && unpreviewed.length === capped.sessionsMatched - previewedFiles
            && unpreviewed.every(c => c.found > 0 && c.title && c.agentName && c.sessionId && c.sessionTs > 0 && c.author === 'human'));
        const r2 = runPage('search.js', fixture.data(), {
            setTimeout: fn => { fn(); return 1; }, clearTimeout: () => { }
        });
        const box2 = r2.query('#q')[0];
        box2.value = 'parser';
        box2.fire('input');
        const seq2 = r2.posted.filter(p => p.type === 'search').pop().seq;
        r2.send({ type: 'results', seq: seq2, result: Object.assign({}, fixture.RESULT, {
            sessionsMatched: 7, matchesFound: 20, omittedMatches: 10,
            sessionMatches: fixture.RESULT.sessionMatches.concat([{
                file: 'D:/s/zz-old.jsonl', found: 7, shown: 0, agentName: 'yazar', title: 'Eski oturum, önizlemesiz',
                sessionId: 'aaaa1111-0000-4000-8000-000000000001', engine: 'claude', sessionTs: Date.now() - 86400000 * 30, author: 'human'
            }])
        }) });
        const html2 = r2.html();
        ok('X-147: the page draws a session with no preview as its header, saying why',
            /class="sessgroup unpreviewed"/.test(html2) && html2.includes('Eski oturum, önizlemesiz')
            && /7 matches · none previewed \(the 10 previews went to newer sessions\)/.test(html2));
        ok('X-147: …with the identity the row carries, so it opens like any other',
            /#aaaa1111/.test(html2) && /data-open="D:\/s\/zz-old\.jsonl"/.test(html2));
        ok('X-147: …and a session that was previewed is not drawn twice', (html2.match(/class="sessgroup/g) || []).length === 7);
    }

    // ---------- (d) a missing foreign parser does not poison anything ----------
    {
        const svc = new C.TextSearchService({ storageRoot: path.join(tmp, 'c-noforeign') });
        const noParser = await svc.search([foreign], 'parser', { maxHits: 50 });
        const directNo = S.searchTranscripts([foreign], 'parser', { maxHits: 50 });
        ok('without a parser a foreign transcript is a parse failure, in both engines',
            noParser.parseFailures === 1 && directNo.parseFailures === 1 && noParser.filesScanned === 0);

        const withParser = new C.TextSearchService({
            storageRoot: path.join(tmp, 'c-noforeign'), parseForeign
        });
        const got = await withParser.search([foreign], 'parser', { maxHits: 50, parseForeign });
        ok('…and the next caller that HAS one still finds it',
            got.parseFailures === 0 && got.hits.length === 1);
    }

    // ---------- (e) ripgrep: only exit 1 is a zero ----------
    {
        const q = 'zebrafish';
        const expected = shape(S.searchTranscripts(all, q, { maxHits: 500, parseForeign }));

        // ‼️ X-147 — rgMinChars: 0 PUTS RIPGREP ON THE PATH. The threshold is
        // twelve million characters and this fixture is thirty kilobytes, so
        // until the threshold could be lowered every test in this block passed
        // without a single rg process being spawned — the fallbacks were never
        // exercised and the candidate pass never narrowed anything.
        const onPath = { rgMinChars: 0 };
        const missing = newService('c-rg-missing', Object.assign({ rgPath: path.join(tmp, 'no-such-rg.exe') }, onPath));
        ok('a missing binary falls back to the full read (never an empty page)',
            shape(await missing.search(all, q, { maxHits: 500, parseForeign })) === expected);

        // node.exe given ripgrep's arguments exits non-zero without searching —
        // the same branch a timeout and an unreadable batch take.
        const wrong = newService('c-rg-wrong', Object.assign({ rgPath: process.execPath }, onPath));
        ok('a wrong binary (exit > 1) falls back too, rather than reporting zero',
            shape(await wrong.search(all, q, { maxHits: 500, parseForeign })) === expected);

        const rg = C.resolveRipgrep(findAppRoot());
        if (rg) {
            const real = newService('c-rg-real', Object.assign({ rgPath: rg }, onPath));
            const spawned = [];
            const cp = require('child_process');
            const realExec = cp.execFile;
            cp.execFile = function (file, ...rest) { spawned.push(String(file)); return realExec.call(cp, file, ...rest); };
            try {
                for (const [name, query, extra] of CASES) {
                    const opts = Object.assign({ maxHits: 500, maxPerFile: 20, parseForeign }, extra);
                    ok(`ripgrep: ${name}`,
                        shape(await real.search(all, query, opts))
                        === shape(S.searchTranscripts(all, query, opts)));
                }
            } finally { cp.execFile = realExec; }
            ok('‼️ X-147: ripgrep was really spawned for the battery', spawned.some(f => f === rg));
            const none = await real.search(all, 'kesinliklebulunmayanbirkelime', { maxHits: 500, parseForeign });
            ok('ripgrep exit 1 is an honest zero: no hits, every session still counted as scanned',
                none.hits.length === 0 && none.filesScanned === COUNT + 1);
            // The title lives in no shard: a session the candidate pass excludes
            // is still put to the reducer for its name.
            const byTitle = await real.search(all, 'flamingo', { maxHits: 500, parseForeign });
            ok('X-147: a session ripgrep excludes is still found by its title',
                byTitle.hits.length === 1 && byTitle.hits[0].kind === 'title' && byTitle.hits[0].file === sessions[33].file);
        } else {
            console.log('  note: no ripgrep found beside VS Code — the rg battery did not run here.');
        }
    }

    // ---------- (f) a superseded search stops ----------
    {
        const svc = newService('c-abort');
        await svc.search(all, 'parser', { maxHits: 500, parseForeign });
        const token = { aborted: false };
        const first = svc.search(all, 'parser', { maxHits: 500, parseForeign, signal: token });
        token.aborted = true;
        let stopped = false;
        try { await first; } catch (e) { stopped = C.isAborted(e); }
        ok('‼️ an aborted search throws instead of answering', stopped);

        const second = await svc.search(all, 'zebrafish', { maxHits: 500, parseForeign });
        ok('…and the one that replaced it answers normally', second.hits.length === 1);
    }

    // ---------- (f) the page draws the last seq only ----------
    {
        const r = runPage('search.js', fixture.data(), {
            setTimeout: fn => { fn(); return 1; }, clearTimeout: () => { }
        });
        const box = r.query('#q')[0];
        box.value = 'parser';
        box.fire('input');
        const seq = r.posted.filter(p => p.type === 'search').pop().seq;

        r.send({ type: 'progress', seq: seq - 1, done: 5, total: 90 });
        ok('a stale progress message is ignored', !r.html().includes('Preparing search corpus'));

        r.send({ type: 'progress', seq, done: 5, total: 90 });
        ok('the current build says how far it has got', r.html().includes('Preparing search corpus 5/90'));

        const doc = r.sandbox.document;
        ok('‼️ …and saying so does not take the caret out of the query box',
            doc.activeElement && doc.activeElement.id === 'q');

        r.send({ type: 'results', seq, result: fixture.RESULT });
        ok('the answer replaces the progress line', !r.html().includes('Preparing search corpus'));
    }

    // ---------- (g) the two extra sources keep their rules ----------
    {
        const memDir = path.join(tmp, 'mem');
        fs.mkdirSync(memDir, { recursive: true });
        const memFile = path.join(memDir, 'notes.md');
        fs.writeFileSync(memFile, 'ilk paragraf pelikan\n\nikinci\nparagraf   arama   motoru\n', 'utf8');
        const hits = S.searchMemory([{ file: memFile, agentName: 'developer' }], '"arama motoru"');
        ok('a memory paragraph is normalized once, so a phrase spanning a line break is found',
            hits.length === 1 && hits[0].match === 'arama motoru');
        ok('…and the agent filter still applies',
            S.searchMemory([{ file: memFile, agentName: 'developer' }], 'pelikan', { agentNames: ['yazar'] }).length === 0);

        const store = path.join(tmp, 'live-events.jsonl');
        const orphan = path.join(pool, 'never-existed.jsonl');
        fs.writeFileSync(store, [
            JSON.stringify({ ts: Date.parse(T(4, 0)), kind: 'tool', tool: 'Bash', detail: 'pelikan çalıştırıldı', agentName: 'developer', transcriptPath: orphan }),
            JSON.stringify({ ts: Date.parse(T(4, 1)), kind: 'tool', tool: 'Bash', detail: 'pelikan çalıştırıldı', agentName: 'developer', transcriptPath: sessions[0].file })
        ].join('\n'), 'utf8');
        const ev = S.searchLiveEvents(store, 'pelikan');
        ok('only the orphaned event is shown — the other is in a transcript that exists',
            ev.length === 1 && ev[0].file === orphan);
        ok('the event date window still applies',
            S.searchLiveEvents(store, 'pelikan', { tsFrom: Date.parse(T(6, 0)) }).length === 0);

        // the store is parsed once per WRITE — but a transcript deleted after
        // that must still make its events visible, so the orphan rule is fresh
        fs.writeFileSync(sessions[0].file + '.moved', fs.readFileSync(sessions[0].file));
        fs.unlinkSync(sessions[0].file);
        ok('‼️ a session deleted since the last query makes its events visible at once',
            S.searchLiveEvents(store, 'pelikan').length === 2);
        fs.renameSync(sessions[0].file + '.moved', sessions[0].file);
    }

    console.log(`\n${pass} passed, ${fail} failed`);
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* windows holds files */ }
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL ' + (e && e.stack || e)); process.exit(1); });

/** Where VS Code keeps its own ripgrep on this machine, if it is installed. */
function findAppRoot() {
    const home = os.homedir();
    const roots = [
        process.env.VSCODE_APPROOT,
        'C:/Program Files/Microsoft VS Code/resources/app',
        path.join(home, 'AppData', 'Local', 'Programs', 'Microsoft VS Code', 'resources', 'app'),
        '/usr/share/code/resources/app',
        '/Applications/Visual Studio Code.app/Contents/Resources/app'
    ].filter(Boolean);
    for (const r of roots) {
        if (C.resolveRipgrep(r)) { return r; }
    }
    return '';
}
