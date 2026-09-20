// X-129 — what the RESIDENT index keeps, and the two things that would make
// dropping anything from it a silent data loss rather than a saving.
//
//   1. The store must still hold the whole record. `scanAll` hands ONE object
//      to the index and to the store, so a projection written in place would
//      write an archive with no events in it and nobody would see that until
//      somebody went looking for a session's history months later.
//   2. `feed(n)` must answer exactly what it answered before. It is the only
//      reader of a session's events, so the per-session arrays were replaced
//      by one bounded feed — and "bounded" is a promise that the newest n are
//      still all there, which only a comparison against the whole corpus
//      proves.
//
// ‼️ THE MEASUREMENT BEHIND IT: 848 sessions retained 19.8 MB, of which events
// and recentMsgs were 64%, on the extension host's only heap and growing with
// the conversation rather than with the fleet (`tools/measure_session_heap.js`).
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

const { SessionIndex } = require(path.join(ROOT, 'out/core/sessions.js'));
const { SessionStore } = require(path.join(ROOT, 'out/core/sessionStore.js'));
const { PricingEngine, DEFAULT_PRICING } = require(path.join(ROOT, 'out/core/pricing.js'));
const {
    dropFromFeed, FEED_KEEP, freshMsgs, mergeFeed, RECENT_MSG_WINDOW_MS, residentSession
} = require(path.join(ROOT, 'out/core/sessionResident.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('FAIL  ' + n); } };
const pricing = () => new PricingEngine(DEFAULT_PRICING);

// ‼️ os.tmpdir(), never inside test/: a test that throws never reaches its
// cleanup and the leftover walks into the next `git add -A`.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-resident-'));
const projects = path.join(dir, 'projects', 'D--demo');
fs.mkdirSync(projects, { recursive: true });

// ---------- 1. the projection is a copy, and only of what nobody can read ----------
{
    const now = Date.parse('2026-09-20T12:00:00.000Z');
    const shared = { turns: [{ n: 1 }], daily: { '2026-09-20': {} }, heat: new Array(168).fill(0) };
    const info = {
        sessionId: 's1', file: 'f1', title: 't', cost: 1,
        events: [{ ts: now - 1000, kind: 'prompt', detail: 'd', sessionFile: 'f1' }],
        recentMsgs: [
            { ts: now - 5 * 3600 * 1000, tokens: 1, wTokens: 1, cost: 1 },
            { ts: now - 1000, tokens: 2, wTokens: 2, cost: 2 }
        ],
        ...shared
    };
    const lean = residentSession(info, now);

    ok('the source keeps its events — the store archives what the index drops', info.events.length === 1);
    ok('the source keeps its recentMsgs', info.recentMsgs.length === 2);
    ok('the resident copy carries no events', lean.events.length === 0);
    ok('the resident copy is a different object', lean !== info);
    ok('every ordinary field survives the projection',
        lean.sessionId === 's1' && lean.title === 't' && lean.cost === 1);
    // The fields that stay resident must be SHARED, or the copy doubles the
    // very heap it was written to shrink.
    ok('turns / daily / heat are shared, not copied',
        lean.turns === shared.turns && lean.daily === shared.daily && lean.heat === shared.heat);

    // Inside the window nothing is dropped, and the array is not rebuilt.
    ok('messages inside the window all survive', lean.recentMsgs.length === 2);
    ok('an untouched recentMsgs is the same array', lean.recentMsgs === info.recentMsgs);

    // A session nobody has touched for longer than the window holds messages
    // that no reader — 5h, lap, or the dashboard's 24h tier — can ever see.
    const stale = residentSession(info, now + RECENT_MSG_WINDOW_MS + 1);
    ok('past the window every message is dropped', stale.recentMsgs.length === 0);
    // 44h on: the 5-hour-old message has fallen out of the window, the fresh
    // one has not — the case a flat "drop it all if the session is old" misses.
    const half = residentSession(info, now + 44 * 3600 * 1000);
    ok('a half-stale session keeps exactly what is still in the window',
        half.recentMsgs.length === 1 && half.recentMsgs[0].tokens === 2);
    ok('freshMsgs on nothing is nothing', freshMsgs([], now).length === 0);
}

// ---------- 2. the feed: bounded, newest first, one entry per session ----------
{
    const ev = (ts, file) => ({ ts, kind: 'tool', detail: 'x', sessionFile: file });
    const feed = [];
    mergeFeed(feed, [ev(10, 'a'), ev(30, 'a')], 'a');
    mergeFeed(feed, [ev(20, 'b')], 'b');
    ok('the feed is newest first', feed.map(e => e.ts).join(',') === '30,20,10');

    // A session re-parsed while it is being written must REPLACE what it said,
    // never add to it — the live path runs this on every append.
    mergeFeed(feed, [ev(40, 'a')], 'a');
    ok('a re-admitted session replaces its own contribution',
        feed.length === 2 && feed.map(e => e.ts).join(',') === '40,20');

    mergeFeed(feed, [], 'b');
    ok('admitting a session with no events clears what it had', feed.length === 1);

    dropFromFeed(feed, 'a');
    ok('a session that leaves the index leaves the feed', feed.length === 0);

    // The cap is what makes this a fixed cost instead of a second index.
    const many = [];
    for (let i = 0; i < FEED_KEEP + 250; i++) { many.push(ev(i, 'c')); }
    mergeFeed(feed, many, 'c');
    ok('the feed is capped', feed.length === FEED_KEEP);
    ok('and it is the NEWEST that survive the cap', feed[0].ts === FEED_KEEP + 249);
}

// ---------- 3. the rule is DERIVED: every collection on SessionInfo is placed ----------
// ‼️ READ OUT OF THE SOURCE, not listed here. The defect this guards is not
// today's — it is the day somebody adds a thirteenth collection to
// `SessionInfo`, it grows with the conversation, and nothing says so until the
// index is 200 MB again. A new field fails this test until it is placed, with
// a reason somebody had to write down.
{
    const RESIDENT = 'resident';
    const PROJECTED = 'projected';
    // field -> [where it lives, why that is affordable]
    const PLACED = {
        importAliases: [RESIDENT, 'ids of copies of this one run — a handful, usually none'],
        tags: [RESIDENT, 'labels a person typed'],
        models: [RESIDENT, 'a set; a session sees two or three'],
        tools: [RESIDENT, 'keyed by tool NAME, so it is bounded by the tool catalogue'],
        skillCalls: [RESIDENT, 'keyed by skill name — same ceiling as the catalogue'],
        memoryReads: [RESIDENT, 'keyed by memory file path; an agent has a few'],
        filesEdited: [RESIDENT, 'keyed by path — grows with the repo, not the transcript; 0.4 KB measured'],
        daily: [RESIDENT, 'one bucket per day the session spans'],
        heat: [RESIDENT, 'fixed 168 buckets, by construction'],
        turns: [RESIDENT, 'grows with the conversation but 1.3 KB measured — kept, and the next candidate if that changes'],
        events: [PROJECTED, 'one bounded feed answers its only reader — see sessionResident.ts'],
        recentMsgs: [PROJECTED, 'windowed to 48h, which is longer than any reader asks for']
    };

    const src = fs.readFileSync(path.join(ROOT, 'src/core/sessions.ts'), 'utf8');
    const at = src.indexOf('export interface SessionInfo {');
    const open = src.indexOf('{', at);
    let depth = 0, close = -1;
    for (let j = open; j < src.length; j++) {
        if (src[j] === '{') { depth++; } else if (src[j] === '}') { depth--; if (!depth) { close = j; break; } }
    }
    const body = src.slice(open + 1, close)
        .replace(/\/\*\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const collections = [];
    const re = /^\s*([A-Za-z_][A-Za-z0-9_]*)\??\s*:\s*([^;]+);/gm;
    let m;
    while ((m = re.exec(body))) {
        if (/\[\]|Record</.test(m[2])) { collections.push(m[1]); }
    }
    ok('SessionInfo was read out of the source at all', collections.length >= 12);
    const unplaced = collections.filter(f => !PLACED[f]);
    ok('‼️ every collection on SessionInfo is placed resident or projected'
        + (unplaced.length ? ` — unplaced: ${unplaced.join(', ')}` : ''), unplaced.length === 0);
    const vanished = Object.keys(PLACED).filter(f => collections.indexOf(f) < 0);
    ok('and nothing is placed that the source no longer declares'
        + (vanished.length ? ` — stale: ${vanished.join(', ')}` : ''), vanished.length === 0);

    // And the placement is the CODE's, not the table's: what says projected
    // must actually come back empty from the projection.
    const now = Date.now();
    const full = {};
    for (const f of collections) {
        full[f] = f === 'daily' || /^(tools|skillCalls|memoryReads|filesEdited)$/.test(f)
            ? { k: 1 }
            : [{ ts: 1, sessionFile: 'f', kind: 'tool', detail: 'd', tokens: 1, wTokens: 1, cost: 1 }];
    }
    const lean = residentSession(full, now);
    for (const [f, [where]] of Object.entries(PLACED)) {
        const emptied = Array.isArray(lean[f]) ? lean[f].length === 0 : false;
        ok(`${f} is really ${where} in the shipped projection`,
            where === PROJECTED ? emptied : !emptied);
    }
}

// ---------- 4. end to end, against the whole corpus ----------
(async () => {
    // Four transcripts, each with its own prompts, tools and an error, spread
    // far enough apart that "the newest 60" is a real ordering question.
    const T0 = Date.parse('2026-09-01T08:00:00.000Z');
    const files = [];
    for (let s = 0; s < 4; s++) {
        const lines = [];
        const push = o => lines.push(JSON.stringify(o));
        const base = T0 + s * 3600 * 1000;
        push({ type: 'user', timestamp: new Date(base).toISOString(), cwd: 'D:/demo', version: '1.0.0',
            message: { role: 'user', content: 'Oturum ' + s + ' — ölçüm düğümü ‼️' } });
        for (let i = 0; i < 30; i++) {
            push({
                type: 'assistant', timestamp: new Date(base + i * 60000).toISOString(), requestId: `s${s}r${i}`,
                message: {
                    id: `s${s}m${i}`, model: 'claude-opus-4-20250514',
                    usage: { input_tokens: 100 + i, output_tokens: 50 + i },
                    content: [{ type: 'tool_use', name: 'Edit', input: { file_path: `D:/demo/ç${i}.ts` } }]
                }
            });
        }
        push({ type: 'user', timestamp: new Date(base + 31 * 60000).toISOString(),
            message: { role: 'user', content: [{ type: 'tool_result', is_error: true }] } });
        const f = path.join(projects, `${'abcd'[s]}${'abcd'[s]}${'abcd'[s]}${'abcd'[s]}aaaa-1111-2222-3333-44444444444${s}.jsonl`);
        fs.writeFileSync(f, lines.join('\n') + '\n', 'utf8');
        files.push(f);
    }

    const storeFile = path.join(dir, 'index.jsonl');
    const store = new SessionStore(storeFile);
    const index = new SessionIndex(
        dir, () => [], pricing(), () => [], () => true, () => 150000, store, () => 'sig-RES');
    await index.scanAll();

    const all = index.all();
    ok('every transcript is indexed', all.length === 4);
    ok('no session in the index carries its events',
        all.every(s => Array.isArray(s.events) && s.events.length === 0));

    // The oracle: what feed() answered before, computed from the whole record.
    // The store is written fire-and-forget, so wait for it rather than guess.
    for (let i = 0; i < 200 && !fs.existsSync(storeFile); i++) {
        await new Promise(r => setTimeout(r, 10));
    }
    const stored = await store.load('sig-RES');
    ok('the store holds a line per session', stored.size === 4);
    ok('‼️ the ARCHIVE still has the events the index dropped',
        [...stored.values()].every(e => e.info.events.length > 0));

    const everyEvent = [];
    for (const e of stored.values()) { everyEvent.push(...e.info.events); }
    everyEvent.sort((a, b) => b.ts - a.ts);
    ok('the corpus really is bigger than one feed', everyEvent.length > 60);

    const shown = index.feed(60);
    ok('feed(60) returns 60', shown.length === 60);
    ok('‼️ feed(60) IS the newest 60 of the whole corpus',
        shown.map(e => e.ts).join(',') === everyEvent.slice(0, 60).map(e => e.ts).join(','));
    ok('the feed is attributed', shown.every(e => 'agentId' in e));

    // A file that vanishes must take its events with it.
    const gone = files[3];
    fs.unlinkSync(gone);
    await index.scanAll();
    ok('a vanished transcript leaves the index', index.all().length === 3);
    ok('and leaves the feed with it', index.feed(400).every(e => e.sessionFile !== gone));

    // The 5-hour window reads recentMsgs; these transcripts are old, so the
    // honest answer is nothing — and that is exactly what it was before, since
    // the parser already dropped them at parse time.
    const w = index.windowUsage(Date.now());
    ok('an old corpus burns nothing in the last five hours', w.msgs === 0 && w.cost === 0);

    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
