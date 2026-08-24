// The three promises the incremental session index makes, each one measured
// rather than asserted in prose:
//
//   1. Feeding a transcript in pieces gives BYTE-FOR-BYTE the same parse as
//      feeding it whole — at any chunk size, including sizes chosen to land
//      inside a multi-byte character.
//   2. A remembered parse is used only while the file it describes is
//      unchanged, and is discarded the moment the arithmetic behind it does.
//   3. A second scan reads nothing it has already read, and reaches the same
//      index as the first.
//
// ‼️ WHY THIS SUITE EXISTS: the index it guards replaced a full re-read of
// every transcript on every window open (703 MB / 7.5 s here, 228 s
// extrapolated to 10 000 sessions). Everything that made that fast is a cache
// or a resume point, and both fail SILENTLY — with a plausible number, not an
// error. So each one is pinned here against the whole-file parse, which stays
// the definition of the right answer.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');

class Emitter {
    constructor() { this.handlers = []; }
    get event() { return (fn) => { this.handlers.push(fn); return { dispose() { } }; }; }
    fire(v) { for (const h of this.handlers) { h(v); } }
    dispose() { }
}
const fakeVscode = {
    EventEmitter: Emitter,
    window: { showInformationMessage: () => Promise.resolve(), showWarningMessage: () => Promise.resolve() },
    commands: { executeCommand: () => Promise.resolve() },
    workspace: { getConfiguration: () => ({ get: (k, d) => d }) }
};
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') { return fakeVscode; }
    return origLoad.apply(this, arguments);
};

const {
    parseSessionFile, createSessionParser, feedSessionParser, finishSessionParse, SessionIndex
} = require(path.join(ROOT, 'out/core/sessions.js'));
const { SessionStore } = require(path.join(ROOT, 'out/core/sessionStore.js'));
const { PricingEngine, DEFAULT_PRICING } = require(path.join(ROOT, 'out/core/pricing.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('FAIL  ' + n); } };
const pricing = () => new PricingEngine(DEFAULT_PRICING);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-sessidx-'));
const projects = path.join(dir, 'projects', 'D--demo');
fs.mkdirSync(projects, { recursive: true });

// ---------- a transcript with real shapes, and deliberately non-ASCII ----------
// ‼️ The Turkish is the point, not decoration: the resume path reads a BYTE
// range, so a chunk boundary landing inside 'ğ' or '‼' is the exact bug this
// file is here to catch. Every one of these is multi-byte in UTF-8.
const T0 = Date.parse('2026-08-20T10:00:00.000Z');
const lines = [];
const push = o => lines.push(JSON.stringify(o));
push({ type: 'user', timestamp: new Date(T0).toISOString(), cwd: 'D:/demo', version: '1.0.0',
    message: { role: 'user', content: 'Şu değişikliği yap: ölçüm ağırlığı düğümü — ‼️ önemli' } });
for (let i = 0; i < 40; i++) {
    push({
        type: 'assistant', timestamp: new Date(T0 + i * 60000).toISOString(), requestId: 'r' + i,
        message: {
            id: 'm' + i, model: 'claude-opus-4-20250514',
            usage: { input_tokens: 100 + i, output_tokens: 50 + i, cache_creation_input_tokens: 10 * i, cache_read_input_tokens: 5 * i },
            content: [
                { type: 'thinking' },
                { type: 'text', text: 'Düşünüyorum… ' + '§'.repeat(i) },
                { type: 'tool_use', name: 'Edit', input: { file_path: 'D:/demo/çalışma/dosya' + i + '.ts' } }
            ]
        }
    });
    // The same usage line repeated: the dedup guard must survive a resume.
    push({
        type: 'assistant', timestamp: new Date(T0 + i * 60000).toISOString(), requestId: 'r' + i,
        message: {
            id: 'm' + i, model: 'claude-opus-4-20250514',
            usage: { input_tokens: 100 + i, output_tokens: 50 + i },
            content: [{ type: 'text', text: 'aynı satır' }]
        }
    });
}
push({ type: 'user', timestamp: new Date(T0 + 99 * 60000).toISOString(),
    message: { role: 'user', content: [{ type: 'tool_result', is_error: true }] } });
const body = lines.join('\n') + '\n';
const file = path.join(projects, 'aaaaaaaa-1111-2222-3333-444444444444.jsonl');
fs.writeFileSync(file, body, 'utf8');

// ---------- 1. chunked feed === whole-file parse ----------
const whole = parseSessionFile(file, pricing(), 0);
ok('fixture parses at all', !!whole && whole.assistantMsgs === 80);

const bytes = fs.readFileSync(file);
const fedInChunks = (size) => {
    const p = createSessionParser(file, 0);
    for (let at = 0; at < bytes.length; at += size) {
        feedSessionParser(p, bytes.subarray(at, Math.min(at + size, bytes.length)), pricing());
    }
    return finishSessionParse(p, fs.statSync(file).mtimeMs);
};
// recentMsgs is a window measured from "now" and both sides compute it the
// same way; everything else must match exactly.
const strip = o => { const c = { ...o }; delete c.recentMsgs; return JSON.stringify(c); };
// 1 and 3 byte chunks guarantee boundaries inside multi-byte characters.
for (const size of [1, 3, 7, 64, 997, 4096, 1 << 20]) {
    ok(`chunked feed at ${size} B === one-shot parse`, strip(fedInChunks(size)) === strip(whole));
}

// A resume in two halves, the way a live append actually arrives.
{
    const half = Math.floor(bytes.length / 2);
    const p = createSessionParser(file, 0);
    feedSessionParser(p, bytes.subarray(0, half), pricing());
    const mid = finishSessionParse(p, 1);
    feedSessionParser(p, bytes.subarray(half), pricing());
    const end = finishSessionParse(p, fs.statSync(file).mtimeMs);
    ok('resume: half then the rest === one-shot parse', strip(end) === strip(whole));
    ok('finishing does not consume the parser (mid-parse answer is its own)',
        mid.assistantMsgs > 0 && mid.assistantMsgs < end.assistantMsgs);
    ok('cost is not double-counted across the resume', Math.abs(end.cost - whole.cost) < 1e-9);
    ok('turns survive the resume', end.turns.length === whole.turns.length);
}

// ---------- 2. the store: trusted only while the file and the rates hold ----------
(async () => {
    const storeFile = path.join(dir, 'index.jsonl');
    const store = new SessionStore(storeFile);
    const st = fs.statSync(file);
    await store.save([{ file, size: st.size, mtimeMs: st.mtimeMs, info: whole }], 'sig-A');

    const sameSig = await store.load('sig-A');
    ok('store: a remembered parse comes back', sameSig.size === 1 && sameSig.get(file).info.assistantMsgs === 80);
    const otherSig = await store.load('sig-B');
    ok('store: a changed signature discards everything', otherSig.size === 0);

    const roundTrip = sameSig.get(file).info;
    ok('store: the round trip keeps every figure',
        roundTrip.cost === whole.cost && roundTrip.wTokens === whole.wTokens
        && roundTrip.toolCalls === whole.toolCalls && roundTrip.errors === whole.errors);

    // A torn last line — a window killed mid-save — costs that one entry, not the file.
    fs.appendFileSync(storeFile, '{"file":"x","size":1,"mtim', 'utf8');
    const torn = await store.load('sig-A');
    ok('store: a half-written last line is dropped, the rest survives', torn.size === 1);

    // A header that is not ours at all.
    fs.writeFileSync(storeFile, 'not json\n{"file":"x"}\n', 'utf8');
    ok('store: an unreadable header means an empty cache, not a crash',
        (await store.load('sig-A')).size === 0);

    // ---------- 3. the index: a second scan re-reads nothing ----------
    const idxStore = new SessionStore(path.join(dir, 'idx.jsonl'));
    let reads = 0;
    const origReadFile = fs.promises.readFile;
    const origOpen = fs.promises.open;
    const counting = (target) => {
        fs.promises.readFile = (...a) => {
            if (String(a[0]).endsWith('.jsonl') && String(a[0]).includes('projects')) { reads++; }
            return origReadFile(...a);
        };
        fs.promises.open = (...a) => {
            if (String(a[0]).endsWith('.jsonl') && String(a[0]).includes('projects')) { reads++; }
            return origOpen(...a);
        };
        return target;
    };
    counting();
    const mk = () => new SessionIndex(
        dir, () => [], pricing(), () => [], () => true, () => 150000, idxStore, () => 'sig-A');

    const first = mk();
    await first.scanAll();
    const firstReads = reads;
    ok('first scan reads the transcript', firstReads >= 1 && first.all().length === 1);
    await new Promise(r => setTimeout(r, 300)); // the store save is fire-and-forget

    reads = 0;
    const second = mk();
    await second.scanAll();
    ok('second scan opens NO transcript — the whole point', reads === 0);
    ok('second scan still indexes the session', second.all().length === 1);
    ok('second scan reports the same figures',
        second.all()[0].cost === first.all()[0].cost
        && second.all()[0].assistantMsgs === first.all()[0].assistantMsgs);

    // Touch the file: the remembered parse must stop being trusted.
    fs.appendFileSync(file, JSON.stringify({
        type: 'assistant', timestamp: new Date(T0 + 200 * 60000).toISOString(), requestId: 'rZ',
        message: { id: 'mZ', model: 'claude-opus-4-20250514', usage: { input_tokens: 7, output_tokens: 7 }, content: [{ type: 'text', text: 'yeni' }] }
    }) + '\n', 'utf8');
    reads = 0;
    const third = mk();
    await third.scanAll();
    ok('a changed transcript is read again', reads >= 1);
    ok('and the new line is counted', third.all()[0].assistantMsgs === 81);

    // A different signature must invalidate even though the file did not move.
    reads = 0;
    const repriced = new SessionIndex(
        dir, () => [], pricing(), () => [], () => true, () => 150000, idxStore, () => 'sig-DIFFERENT');
    await repriced.scanAll();
    ok('new prices discard the cache and re-read', reads >= 1);

    fs.promises.readFile = origReadFile;
    fs.promises.open = origOpen;
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
