// X-356 — A REBUILT SESSION KEEPS THE SHARDS IT WAS REBUILT INTO.
//
// ‼️ WHAT THIS FILE IS THE PROOF OF. A transcript that changed is re-parsed and
// its shards are written again under the SAME names (`<key>.<role>.tsv`). The
// old ones used to be cleared by an unlink that was never awaited, so it was
// still in flight when the new ones were written — and deleted them. Measured:
// five changed transcripts, 20 shards before, 12 right after the rebuild and 5
// once the event loop had turned; the next query re-parsed the same sessions
// again, every time. The full suite saw it as test_search_speed.js's X-131
// block going red under load, because load is what decides whether an unlink
// lands before or after the write. So every assertion here is taken AFTER the
// event loop has had its turns.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const C = require(path.join(ROOT, 'out', 'core', 'textSearchCorpus.js'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-rebuild-'));
const T = (m) => `2026-08-12T10:${String(m).padStart(2, '0')}:00.000Z`;
const write = (p, word) => fs.writeFileSync(p, [
    { type: 'user', timestamp: T(1), message: { content: `soru ${word}` } },
    {
        type: 'assistant', timestamp: T(2), message: {
            content: [{ type: 'text', text: `cevap ${word}` }, { type: 'tool_use', name: 'Bash', input: { command: `echo ${word}` } }]
        }
    },
    { type: 'user', timestamp: T(3), message: { content: [{ type: 'tool_result', content: `${word} çıktı` }] } }
].map(l => JSON.stringify(l)).join('\n'), 'utf8');
const turns = async (n = 6) => { for (let i = 0; i < n; i++) { await new Promise(r => setTimeout(r, 25)); } };
const spy = async (fn) => {
    const real = fs.readFileSync;
    const seen = [];
    fs.readFileSync = function (p, ...rest) { seen.push(String(p)); return real.call(fs, p, ...rest); };
    try { await fn(); } finally { fs.readFileSync = real; }
    return seen.filter(p => p.endsWith('.jsonl'));
};

(async () => {
    const pool = path.join(tmp, 'pool');
    fs.mkdirSync(pool);
    const N = 5;
    const sessions = [];
    for (let i = 0; i < N; i++) {
        const p = path.join(pool, `s${i}.jsonl`);
        write(p, 'albatros');
        sessions.push({ file: p, agentName: 'a', title: 'T' + i, sessionId: 's' + i, engine: 'claude', mtime: Date.now() });
    }
    const svc = new C.TextSearchService({ storageRoot: path.join(tmp, 'c') });
    await svc.search(sessions, 'albatros', { maxHits: 50 });
    await turns();
    const shardDir = path.join(tmp, 'c', C.CORPUS_DIR, 'sh');
    const built = fs.readdirSync(shardDir).length;
    ok('the first build writes shards', built > 0);

    await turns(2);
    for (const s of sessions) { write(s.file, 'kondor'); }
    const r = await svc.search(sessions, 'kondor', { maxHits: 50 });
    ok('a changed transcript is found by its new words', r.sessionsMatched === N);
    await turns();
    ok('‼️ after the event loop has turned, every rebuilt shard is still on disk',
        fs.readdirSync(shardDir).length === built);

    // The cost of the bug was the NEXT query: a fresh window re-verifies the
    // manifest against the shard files and re-parses whatever is missing.
    const reread = await spy(async () => {
        await new C.TextSearchService({ storageRoot: path.join(tmp, 'c') }).search(sessions, 'kondor', { maxHits: 50 });
    });
    ok('‼️ …so the next window reads no transcript at all', reread.length === 0);
    await turns();
    ok('…and a second rebuild in a row keeps its shards too', await (async () => {
        for (const s of sessions) { write(s.file, 'pelikan'); }
        await svc.search(sessions, 'pelikan', { maxHits: 50 });
        await turns();
        return fs.readdirSync(shardDir).length === built;
    })());

    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`test_search_corpus_rebuild: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  CRASH ' + (e && e.stack || e)); process.exit(1); });
