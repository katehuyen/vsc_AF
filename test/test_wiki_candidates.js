// B-14 (X-50) — THE WIKI CANDIDATE POOL AND ITS BRIDGE CONTRACT.
//
// ‼️ WHAT THIS FILE IS THE PROOF OF. The whole idea rests on marking a turn
// being CHEAP: one click, no decision about where it belongs, nothing written
// to the vault. Cheap means it will be done twice — the console badge (K-26)
// and the session menu (S-38) reach the same turn — so the two things that
// would ruin the pool are a second row for one turn and a compile that reads
// the same turn twice. Both are pinned here.
//
// And the line the ops must not cross: `wiki.compile` DOES NOT WRITE A WIKI
// PAGE. An extension cannot synthesise, and an op that pretended to would
// produce exactly the mechanical summaries this idea exists to avoid. It
// gathers, it hands back a brief, and it marks nothing compiled — only the
// agent reporting the pages back does that.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const { BridgeRegistry } = require(path.join(ROOT, 'out', 'core', 'bridge.js'));
const W = require(path.join(ROOT, 'out', 'core', 'wiki.js'));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-wiki-'));
const poolFile = path.join(tmp, 'store', 'wiki_candidates.json');
const wikiRoot = path.join(tmp, '00_WIKI');

// ---- a wiki on disk, shaped the way the law says (_REF/wiki.md §2) ----
fs.mkdirSync(path.join(wikiRoot, '_KURALLAR_'), { recursive: true });
fs.writeFileSync(path.join(wikiRoot, '_KURALLAR_', '-WIKI-ANAYASA-.md'), '# law\n', 'utf8');
fs.mkdirSync(path.join(wikiRoot, 'Agents'), { recursive: true });
fs.mkdirSync(path.join(wikiRoot, 'System'), { recursive: true });
fs.writeFileSync(path.join(wikiRoot, 'Agents', 'Weighted_Tokens.md'),
    '# Weighted Tokens\n\nSee [[Memory_Graph]] and [[Yok_Boyle_Bir_Sayfa]].\n', 'utf8');
fs.writeFileSync(path.join(wikiRoot, 'System', 'Memory_Graph.md'), '# Memory Graph\n', 'utf8');
fs.writeFileSync(path.join(wikiRoot, 'System', 'Kimsesiz.md'), '# Kimsesiz\n', 'utf8');
fs.writeFileSync(path.join(wikiRoot, 'index.md'),
    '# index\n- [[Weighted_Tokens]] — weighted tokens\n- [[Memory_Graph]] — the graph\n', 'utf8');
fs.writeFileSync(path.join(wikiRoot, 'log.md'), '# log\n', 'utf8');

// ---- a session index, as the farm's own index hands it over ----
const SESSIONS = [{
    file: path.join(tmp, 'sess.jsonl'),
    sessionId: 'bb16dc64-ea30-4747-bf91-a6a3dcc1ad44',
    agentName: 'developer',
    turns: [
        { n: 1, label: 'llm wiki fikri', ts: 1 },
        { n: 2, label: 'ikinci tur', ts: 2 },
        { n: 3, label: 'anayasa nasil olmali', ts: 3 },
        { n: 4, label: 'aday havuzu', ts: 4 },
        { n: 5, label: 'derleme motoru', ts: 5 }
    ]
}, {
    file: path.join(tmp, 'other.jsonl'),
    sessionId: 'ffffffff-0000-0000-0000-000000000000',
    agentName: 'manager', source: 'codex',
    turns: [{ n: 1, label: 'baska bir konusma', ts: 9 }]
}];

const store = new W.WikiStore(poolFile);
const bridge = new BridgeRegistry();
W.registerWikiOps(bridge, {
    store: () => store,
    root: () => wikiRoot,
    sessions: () => SESSIONS,
    procedure: '_REF/wiki.md'
});
const call = (op, args) => bridge.dispatch(op, args || {});

(async () => {

// ---------- the catalogue carries every op B-14 promised ----------
{
    const ops = bridge.catalog();
    const names = (Array.isArray(ops) ? ops : ops.ops || []).map(o => o.op || o);
    for (const op of ['wiki.candidates.add', 'wiki.candidates.list', 'wiki.candidates.edit',
        'wiki.candidates.remove', 'wiki.compile', 'wiki.status', 'wiki.lint']) {
        ok(op + ' is in the catalogue', names.includes(op));
    }
    // ‼️ An op an agent cannot understand from its own catalogue line is an op
    // that will be called wrong. The one that must never be misread is compile.
    const compile = (Array.isArray(ops) ? ops : ops.ops).find(o => o.op === 'wiki.compile');
    ok('the compile line says out loud that it writes no page',
        !!compile && /writes NO wiki page/i.test(compile.describe));
}

// ---------- turn ranges ----------
{
    ok('a bare number is one turn', W.parseTurnRange(4).from === 4 && W.parseTurnRange(4).to === 4);
    ok('a string number is the same', W.parseTurnRange('4').to === 4);
    ok('a range is inclusive', W.parseTurnRange('3-7').from === 3 && W.parseTurnRange('3-7').to === 7);
    ok('a backwards range is still a range', W.parseTurnRange('7-3').from === 3);
    ok('an en dash is a dash', W.parseTurnRange('3–7').to === 7);
    ok('nothing means the whole conversation', W.parseTurnRange('').from === 0 && W.parseTurnRange(undefined).to === 0);
    let threw = false;
    try { W.parseTurnRange('son iki tur'); } catch { threw = true; }
    ok('words are refused rather than read as zero', threw);
}

// ---------- topics ----------
{
    ok('a comma string becomes a list', W.normTopics('a, b ,c').join('|') === 'a|b|c');
    ok('a list stays a list', W.normTopics(['x', 'y']).join('|') === 'x|y');
    ok('the same topic twice is once', W.normTopics('Wiki, wiki, WIKI').length === 1);
    ok('empty pieces are dropped', W.normTopics('a,,  ,b').join('|') === 'a|b');
}

// ---------- adding a mark ----------
{
    const r = await call('wiki.candidates.add', {
        session: 'bb16dc64', turn: 4, topics: 'LLM Wiki, Aday Havuzu', note: 'buradan cikti', by: 'you'
    });
    ok('a mark is added', r.ok === true && r.result.state === 'pending');
    ok('…resolved to the session\'s file, not only its id',
        r.result.sessionId === SESSIONS[0].sessionId);
    ok('…and it keeps the turn\'s own opening line',
        r.result.label === 'aday havuzu');
    ok('…with its turn drawn as a turn', r.result.turns === '4');
    ok('…and who marked it', r.result.addedBy === 'you');

    // ‼️ THE POINT OF THE WHOLE FILE: the same turn marked again is not a
    // second row. K-26 and S-38 both reach it; a double click is one mark.
    const again = await call('wiki.candidates.add', {
        session: 'bb16dc64', turn: 4, topics: 'Provenance'
    });
    ok('marking the same turn again merges instead of duplicating',
        again.result.merged === true && store.candidates.length === 1);
    ok('…and the topic thought of later is now on it',
        store.candidates[0].topics.join('|') === 'LLM Wiki|Aday Havuzu|Provenance');

    // A range that touches the same turn is the same mark, widened.
    await call('wiki.candidates.add', { session: 'bb16dc64', turn: '3-5', topics: 'Derleme' });
    ok('an overlapping RANGE widens the mark rather than adding one',
        store.candidates.length === 1 && store.candidates[0].fromTurn === 3
        && store.candidates[0].toTurn === 5);

    // A turn that does not touch it is a different subject and a new row.
    const sep = await call('wiki.candidates.add', { session: 'bb16dc64', turn: 1, topics: 'Fikrin Cikisi' });
    ok('a turn outside the range is its own mark',
        sep.result.merged === false && store.candidates.length === 2);

    // …and a mark on another conversation obviously is.
    await call('wiki.candidates.add', { session: 'ffffffff', topics: 'Baska' });
    ok('another session is another mark', store.candidates.length === 3);
    ok('…and a whole-session mark says so, not "turn 0"',
        store.candidates[2].fromTurn === 0
        && (await call('wiki.candidates.list', { session: 'ffffffff' })).result.candidates[0].turns === 'whole session');
    ok('…and it carries the engine that ran it',
        store.candidates[2].engine === 'codex');
}

// ---------- what it refuses ----------
{
    ok('a mark with no topic is refused — it is the compiler\'s filing key',
        (await call('wiki.candidates.add', { session: 'bb16dc64', turn: 2, topics: '' })).ok === false);
    ok('a session nobody has is refused by name',
        /No session matches/.test((await call('wiki.candidates.add',
            { session: 'nosuchid', topics: 'x' })).error || ''));
    ok('a turn past the end of the conversation is refused',
        /past the end/.test((await call('wiki.candidates.add',
            { session: 'bb16dc64', turn: 99, topics: 'x' })).error || ''));
}

// ---------- listing and filtering ----------
{
    const all = (await call('wiki.candidates.list', { state: 'all' })).result;
    ok('the list is the pool', all.total === 3);
    ok('…newest first', all.candidates[0].addedAt >= all.candidates[1].addedAt);
    ok('a topic filter narrows it',
        (await call('wiki.candidates.list', { topic: 'Derleme' })).result.total === 1);
    ok('…case-insensitively',
        (await call('wiki.candidates.list', { topic: 'derleme' })).result.total === 1);
    ok('a session filter narrows it',
        (await call('wiki.candidates.list', { session: 'ffffffff' })).result.total === 1);
    ok('an unknown state is refused rather than returning nothing',
        (await call('wiki.candidates.list', { state: 'yarim' })).ok === false);
    const topics = (await call('wiki.status')).result.pool.topics;
    ok('the topic list counts pending marks per topic',
        topics.find(t => t.topic === 'Derleme').pending === 1);
}

// ---------- the compile brief ----------
let briefIds = [];
{
    ok('a compile of "whatever is there" is refused',
        /never implied/.test((await call('wiki.compile', {})).error || ''));

    const b = await call('wiki.compile', { all: true });
    ok('a compile brief is built', b.ok === true);
    const r = b.result;
    ok('…it points at the vault\'s own law first',
        r.rules === path.join(wikiRoot, '_KURALLAR_', '-WIKI-ANAYASA-.md')
        && /rules file first/.test(r.next[0]));
    ok('…and at the agent procedure', r.procedure === '_REF/wiki.md');
    ok('…it says what the wiki ALREADY holds, which is what decides create-vs-amend',
        r.existing.length === 3 && r.existing.some(p => p.concept === 'Memory_Graph'));
    ok('…every candidate resolves to a transcript on disk',
        r.candidates.length === 3 && r.candidates.every(c => !!c.transcript));
    ok('…and to the turns to read, not to a summary of them',
        r.candidates.find(c => c.turns === '3-5').readTurns === '3-5'
        && r.candidates.find(c => c.turns === 'whole session').readTurns === 'all');

    // ‼️ NOTHING WAS MARKED, AND NOTHING WAS WRITTEN. Asking for the brief is
    // free: a compile that fell over halfway must not leave the pool claiming
    // work that never happened.
    ok('asking for a brief marks nothing compiled',
        store.candidates.every(c => c.state === 'pending'));
    ok('…and writes nothing into the wiki',
        fs.readFileSync(path.join(wikiRoot, 'log.md'), 'utf8') === '# log\n'
        && fs.readdirSync(path.join(wikiRoot, 'Agents')).length === 1);

    ok('a topic compiles on its own',
        (await call('wiki.compile', { topic: 'Derleme' })).result.candidates.length === 1);
    ok('an id that is not in the pool is refused, not skipped',
        (await call('wiki.compile', { ids: ['wc-nope'] })).ok === false);
    briefIds = r.candidates.map(c => c.id);
}

// ---------- reporting back ----------
{
    const id = briefIds[0];
    const done = await call('wiki.candidates.edit', {
        id, state: 'compiled', pages: ['Agents/Weighted_Tokens.md']
    });
    ok('a candidate reports back as compiled', done.result.state === 'compiled');
    ok('…and is stamped with when', !!store.get(id).compiledAt);
    ok('…and remembers which pages it became', done.result.pages.length === 1);
    ok('…and leaves the pending list', (await call('wiki.candidates.list')).result.total === 2);

    // ‼️ A CLAIM WITHDRAWN TAKES ITS STAMP WITH IT. A row reading "compiled at
    // 14:02" while sitting in the pending pool is the kind of half-truth that
    // makes a log worthless.
    await call('wiki.candidates.edit', { id, state: 'pending' });
    ok('putting it back clears the compile stamp', store.get(id).compiledAt === undefined);
    await call('wiki.candidates.edit', { id, state: 'compiled', pages: ['Agents/Weighted_Tokens.md'] });

    ok('topics can be replaced', (await call('wiki.candidates.edit',
        { id, topics: 'Yeni' })).result.topics.join('|') === 'Yeni');
    ok('…or added to', (await call('wiki.candidates.edit',
        { id, addTopics: 'Ek' })).result.topics.join('|') === 'Yeni|Ek');
    ok('a candidate cannot be left with no topic at all',
        (await call('wiki.candidates.edit', { id, topics: '  ' })).ok === false);
    ok('an unknown id is refused by name',
        /No candidate with id/.test((await call('wiki.candidates.edit', { id: 'wc-nope', note: 'x' })).error || ''));
}

// ---------- removing ----------
{
    const before = store.candidates.length;
    const one = store.candidates.find(c => c.state === 'pending');
    ok('a mark can be taken out', (await call('wiki.candidates.remove', { id: one.id })).result.removed === 1);
    ok('…and it is gone', store.candidates.length === before - 1);
    ok('nothing matching is an error, not a silent success',
        (await call('wiki.candidates.remove', { id: 'wc-nope' })).ok === false);

    // ‼️ A SWEEP NEVER TAKES PENDING WORK. "Clear the pool" is a thing somebody
    // will type, and the marks nobody has compiled yet are the only thing in
    // this file that cannot be reconstructed.
    ok('a state sweep refuses to touch pending marks',
        /never swept away/.test((await call('wiki.candidates.remove', { state: 'pending' })).error || ''));
    ok('a compiled sweep works', (await call('wiki.candidates.remove', { state: 'compiled' })).result.removed === 1);
}

// ---------- status: both sides ----------
{
    const s = (await call('wiki.status')).result;
    ok('status counts the pool', s.pool.pending === store.candidates.filter(c => c.state === 'pending').length);
    ok('…and reports the wiki root', s.wiki.exists === true && s.wiki.root === wikiRoot);
    ok('…and whether the law is there at all', s.wiki.rulesFound === true);
    ok('…and the two navigation files', s.wiki.indexFound === true && s.wiki.logFound === true);
    ok('…and the page count without counting the rules folder',
        s.wiki.pages === 3 && !s.wiki.categories.includes('_KURALLAR_'));
    ok('…and the categories it found', s.wiki.categories.join('|') === 'Agents|System');
}

// ---------- lint: reports, never repairs ----------
{
    const l = (await call('wiki.lint')).result;
    ok('lint finds the broken link',
        l.brokenLinks.length === 1 && l.brokenLinks[0].link === 'Yok_Boyle_Bir_Sayfa');
    ok('lint finds the page the index never names', l.unindexed.join() === 'System/Kimsesiz');
    ok('…which is also the page nothing links to', l.orphans.join() === 'System/Kimsesiz');
    // The index counts as an inbound link — a page named there is reachable.
    ok('a page the index names is not an orphan', !l.orphans.includes('Agents/Weighted_Tokens'));
    ok('lint changed nothing on disk',
        fs.readFileSync(path.join(wikiRoot, 'index.md'), 'utf8').indexOf('Kimsesiz') < 0);

    // Single-level categories are the law; a page buried deeper is reported.
    fs.mkdirSync(path.join(wikiRoot, 'System', 'Derin'), { recursive: true });
    ok('a folder nested past one category is reported',
        (await call('wiki.lint')).result.misplaced.join() === path.join('System', 'Derin'));
}

// ---------- the pool survives a restart ----------
{
    const reopened = new W.WikiStore(poolFile);
    ok('the pool is on disk and comes back',
        reopened.candidates.length === store.candidates.length
        && reopened.candidates.every(c => store.get(c.id)));
}

// ---------- a missing wiki stops a compile rather than inventing one ----------
{
    const bare = new BridgeRegistry();
    W.registerWikiOps(bare, {
        store: () => store, root: () => path.join(tmp, 'yok'), sessions: () => SESSIONS
    });
    const r = await bare.dispatch('wiki.compile', { all: true });
    ok('a compile without a wiki root is refused by path', r.ok === false && /does not exist/.test(r.error));

    const noLaw = path.join(tmp, 'lawless');
    fs.mkdirSync(noLaw, { recursive: true });
    const b2 = new BridgeRegistry();
    W.registerWikiOps(b2, { store: () => store, root: () => noLaw, sessions: () => SESSIONS });
    ok('…and a wiki with no law of its own is refused too, because it outranks the procedure',
        /outranks the agent procedure/.test(
            (await b2.dispatch('wiki.compile', { all: true })).error || ''));
}

})().then(() => {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* windows */ }
    console.log(`test_wiki_candidates: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);

});
