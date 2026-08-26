// X-51 (X-50) — THE WHOLE CHAIN, END TO END, IN ONE FILE.
//
// ‼️ WHY THIS EXISTS WHEN THE PIECES ARE ALREADY TESTED. B-14, K-26, M-23 and
// U-70 each have a suite, and every one of them passes against a world it built
// itself. What no suite covered is the SEAM: a turn is marked, the brief points
// at it, an agent writes pages out of that brief, the run reports back, and the
// pool and the vault must then agree about what happened. Every link in that
// chain was proved and the chain itself never was — which is exactly how a
// feature ships where each half is right and the join is not.
//
// So this file walks it once, in order, with nothing stubbed but the LLM:
//
//   1. mark a turn                          (wiki.candidates.add)
//   2. ask what it takes to compile it      (wiki.compile → the brief)
//   3. read what the run would be told      (compilePrompt)
//   4. start the run                        (wiki.compile.run → claim, still pending)
//   5. DO WHAT THE PROMPT SAYS              (write the page, the index, the log)
//   6. report back                          (wiki.candidates.edit → the mark closes)
//   7. ask both sides what happened         (wiki.status)
//   8. check the shape of what was written  (wiki.lint)
//
// ‼️ STEP 5 IS PERFORMED, NOT ASSERTED. The synthesis is an LLM's and no test
// can check the prose — but everything AROUND it is mechanical, and a compile
// whose pages land where nothing can find them is a failure a test can catch.
// So the file writes exactly what the prompt instructs (§2 layout, §4 template,
// the index line, the log line) and then asks the extension whether it can see
// them. If a rule about where a page goes ever changes on one side only, this
// is what notices.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const { BridgeRegistry } = require(path.join(ROOT, 'out', 'core', 'bridge.js'));
const W = require(path.join(ROOT, 'out', 'core', 'wiki.js'));

// ------------------------------------------------------------------ the world
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-wiki-e2e-'));
const wikiRoot = path.join(tmp, '00_WIKI');
const poolFile = path.join(tmp, 'store', 'wiki_candidates.json');

// The vault as it really is on this machine before a first compile: the law is
// there and NOTHING else — no index, no log, no category. That is the state the
// first real compile will meet, so it is the state this walks through.
fs.mkdirSync(path.join(wikiRoot, '_KURALLAR_'), { recursive: true });
fs.writeFileSync(path.join(wikiRoot, '_KURALLAR_', '-WIKI-ANAYASA-.md'),
    '# WIKI ANAYASASI\n\nSayfa başına tek kavram. Çelişen bilgi silinmez.\n', 'utf8');

// A transcript on disk. Its CONTENT is the agent's business, not the
// extension's — what is pinned here is that the brief points at a real file.
const transcript = path.join(tmp, 'ff54aa29.jsonl');
fs.writeFileSync(transcript, [
    JSON.stringify({ type: 'user', text: 'aday havuzu neden kasaya hiç yazmıyor' }),
    JSON.stringify({ type: 'assistant', text: 'çünkü işaretlemek ucuz olmalı…' })
].join('\n') + '\n', 'utf8');

const SESSIONS = [{
    file: transcript,
    sessionId: 'ff54aa29-1c02-4f38-9a71-0c4e9b2d6a11',
    agentName: 'developer',
    source: 'claude',
    turns: [
        { n: 1, label: 'llm wiki fikrini açalım', ts: 1000 },
        { n: 2, label: 'aday havuzu neden kasaya hiç yazmıyor', ts: 2000 },
        { n: 3, label: 'derleme motoru nasıl olmalı', ts: 3000 }
    ]
}];

const TASKS = [];
const store = new W.WikiStore(poolFile);
const deps = {
    store: () => store,
    root: () => wikiRoot,
    sessions: () => SESSIONS,
    procedure: '_REF/wiki.md',
    defaultAgent: () => 'developer',
    taskAlive: (id) => TASKS.some(t => t.id === id && t.alive),
    startCompile: (a) => {
        const t = { id: 'task-' + (TASKS.length + 1), alive: a.start !== false, ...a };
        TASKS.push(t);
        return { taskId: t.id, agent: a.agent || 'developer', started: t.alive };
    }
};

const bridge = new BridgeRegistry();
W.registerWikiOps(bridge, deps);
/** The op, through the bridge, unwrapped — a refusal is an `error`, not a throw. */
const call = async (op, args) => {
    const r = await bridge.dispatch(op, args || {});
    if (r.error) { throw new Error(r.error); }
    return r.result;
};
/** …and the refusal itself, when that is what is being pinned. */
const refusal = async (op, args) => (await bridge.dispatch(op, args || {})).error || '';

(async () => {

// =========================================================== 1. mark the turn
let markId;
{
    const r = await call('wiki.candidates.add', {
        session: 'ff54aa29', turn: 2,
        topics: 'Aday Havuzu, LLM Wiki',
        note: 'B-14 çizgisinin sebebi', by: 'you'
    });
    markId = r.id;
    ok('1 · the mark lands with the turn it was made on', r.turns === '2');
    ok('1 · …and with the opening line of THAT turn, not of the session',
        r.label === 'aday havuzu neden kasaya hiç yazmıyor');
    ok('1 · …under both topics, which is what files it', r.topics.length === 2);
    ok('1 · ‼️ and the vault is untouched — marking writes nothing',
        !fs.existsSync(path.join(wikiRoot, 'index.md'))
        && fs.readdirSync(wikiRoot).length === 1);
}

// ====================================================== 2. what it would take
let brief;
{
    brief = await call('wiki.compile', { ids: [markId] });
    ok('2 · the brief names the law, and it is really there',
        /-WIKI-ANAYASA-\.md$/.test(brief.rules) && fs.existsSync(brief.rules));
    ok('2 · …and the agent procedure that sits under it', brief.procedure === '_REF/wiki.md');
    ok('2 · ‼️ the brief points AT the transcript rather than summarising it',
        brief.candidates[0].transcript === transcript && fs.existsSync(brief.candidates[0].transcript));
    ok('2 · …with the turn range to read', brief.candidates[0].readTurns === '2-2');
    ok('2 · an empty wiki is honestly empty — nothing to amend, everything to open',
        Array.isArray(brief.existing) && brief.existing.length === 0);
    ok('2 · ‼️ asking for the brief marked nothing compiled',
        store.get(markId).state === 'pending' && !store.get(markId).compiledAt);
}

// ================================================= 3. what the run is told
{
    const p = W.compilePrompt(brief);
    ok('3 · the law comes first, and by path', p.indexOf(brief.rules) < p.indexOf(transcript));
    // ‼️ The prompt prints the turn the way a person names it (`turns 2`), while
    // the brief carries the machine form (`2-2`). Both are right; asserting the
    // brief's form here would be asserting the wrong document.
    ok('3 · the run is pointed at the file and the turns',
        p.includes(transcript) && /turns 2 of/.test(p));
    ok('3 · …and at the wiki, told it holds nothing yet',
        p.includes(wikiRoot) && /holds no pages yet/.test(p));
    ok('3 · ‼️ the three lines it may not cross are in the words it works from',
        /one concept/i.test(p) && /contradict/i.test(p) && /where it came from|provenance/i.test(p));
    ok('3 · ‼️ …and the report-back carries the real id, so there is nothing to look up',
        p.includes(markId) && p.includes('wiki.candidates.edit'));
}

// ============================================ 4. the run, and what it claims
let taskId;
{
    const r = await call('wiki.compile.run', { ids: [markId] });
    taskId = r.taskId;
    ok('4 · one run over one mark', r.marks === 1 && r.started === true);
    ok('4 · …by the agent the setting names', r.agent === 'developer');
    ok('4 · ‼️ STARTING A RUN CLOSES NOTHING — the mark is still waiting',
        store.get(markId).state === 'pending');
    ok('4 · …but it is claimed, and status counts it apart',
        (await call('wiki.status')).pool.compiling === 1 && (await call('wiki.status')).pool.pending === 1);

    const refused = await refusal('wiki.compile.run', { ids: [markId] });
    ok('4 · ‼️ a second run over the same mark is refused BY NAME',
        refused.includes(markId) && /already have a compile running/.test(refused));
}

// ======================================== 5. the agent's half, performed
// Exactly what the prompt instructs: `00_WIKI/<Category>/<Concept>.md` in the
// §4 template, a line in index.md, a line in log.md. Nothing here is clever —
// it is the mechanical part of a compile, done the way the rules describe it.
const pageFile = path.join(wikiRoot, 'Sistem', 'Aday_Havuzu.md');
{
    fs.mkdirSync(path.dirname(pageFile), { recursive: true });
    fs.writeFileSync(pageFile, [
        '---', 'tags: [sistem, aday-havuzu]', 'updated: 2026-08-21', '---', '',
        '# Aday Havuzu', '',
        '**Özet:** Bir turu wiki\'ye aday göstermek ucuz ve geri alınabilir bir işarettir; kasaya hiçbir şey yazmaz.', '',
        '## Açıklama ve Detaylar',
        'İşaretleme ile derleme ayrı iki yarıdır. Derleme [[LLM_Wiki]] anayasası altında yürür.', '',
        '## Kaynaklar',
        '- [2026-08-21] Oturum: `ff54aa29-1c02-4f38-9a71-0c4e9b2d6a11` (Tur 2)', ''
    ].join('\n'), 'utf8');
    fs.writeFileSync(path.join(wikiRoot, 'index.md'), [
        '# index', '', '## Sistem', '- [[Aday_Havuzu]] — işaretlemek ucuzdur, derlemek pahalı yarıdır.', ''
    ].join('\n'), 'utf8');
    fs.writeFileSync(path.join(wikiRoot, 'log.md'),
        '## [2026-08-21] compile | Aday Havuzu\n', 'utf8');
    ok('5 · the page landed one category deep, named after the concept',
        fs.existsSync(pageFile));
}

// ================================================ 6. the run reports back
{
    const r = await call('wiki.candidates.edit', {
        id: markId, state: 'compiled', pages: [pageFile]
    });
    ok('6 · ‼️ THIS is what closes a mark, and only this', r.state === 'compiled');
    ok('6 · …stamped when the claim was made', typeof r.compiledAt === 'number' && r.compiledAt > 0);
    ok('6 · ‼️ …and the claim comes off, so the turn is not locked out for ever',
        r.compileTaskId === null && store.get(markId).compileTaskId === undefined);
    ok('6 · the pages are recorded — provenance, read backwards',
        r.pages.length === 1 && r.pages[0] === pageFile);
    ok('6 · the run that was out for it is over as far as the pool is concerned',
        (await call('wiki.status')).pool.compiling === 0);
}

// ============================================== 7. both sides, in one breath
{
    const s = await call('wiki.status');
    ok('7 · the pool: nothing waiting, one compiled',
        s.pool.pending === 0 && s.pool.compiled === 1 && s.pool.total === 1);
    ok('7 · ‼️ the vault SEES the page the compile wrote',
        s.wiki.pages === 1 && s.wiki.categories.length === 1 && s.wiki.categories[0] === 'Sistem');
    ok('7 · …and the two navigation files the compile is required to keep',
        s.wiki.indexFound === true && s.wiki.logFound === true);
    ok('7 · the law is still the file whose absence would stop the next one',
        s.wiki.rulesFound === true);
    ok('7 · nothing is nested deeper than one category', s.wiki.misplaced.length === 0);
    ok('7 · the topics survive the round trip and remember what they filed',
        s.pool.topics.length === 2 && s.pool.topics.every(t => t.pending === 0 && t.total === 1));
}

// ==================================================== 8. the shape of it
{
    const l = await call('wiki.lint');
    ok('8 · a page the index names is not an orphan', l.orphans.length === 0);
    ok('8 · …and the index names it', l.unindexed.length === 0);
    // ‼️ The page it wrote links to [[LLM Wiki]], which nobody has written yet.
    // That is a REAL finding, not noise: the compile promised a concept page and
    // the next compile is what owes it.
    ok('8 · ‼️ a link to a page that does not exist yet is reported, not swallowed',
        l.brokenLinks.length === 1 && /LLM_Wiki/.test(l.brokenLinks[0].link));

    // Now break it the other way and check the finding moves.
    fs.writeFileSync(path.join(wikiRoot, 'Sistem', 'Kayıp_Sayfa.md'), '# Kayıp Sayfa\n', 'utf8');
    const l2 = await call('wiki.lint');
    ok('8 · a page nothing links to and the index does not name is an orphan',
        l2.orphans.some(o => /Kayıp_Sayfa/.test(o)) && l2.unindexed.some(u => /Kayıp_Sayfa/.test(u)));
    ok('8 · …and the page that IS indexed stays out of both lists',
        !l2.orphans.some(o => /Aday_Havuzu/.test(o)) && !l2.unindexed.some(u => /Aday_Havuzu/.test(u)));
    ok('8 · ‼️ …and lint REPORTED it rather than repairing it — the file is untouched',
        fs.readFileSync(path.join(wikiRoot, 'Sistem', 'Kayıp_Sayfa.md'), 'utf8') === '# Kayıp Sayfa\n'
        && !/Kayıp/.test(fs.readFileSync(path.join(wikiRoot, 'index.md'), 'utf8')));

    // A folder two deep is the one layout rule the vault has, and it is checked
    // by the SHAPE scan rather than trusted.
    fs.mkdirSync(path.join(wikiRoot, 'Sistem', 'Alt', 'Daha'), { recursive: true });
    fs.writeFileSync(path.join(wikiRoot, 'Sistem', 'Alt', 'Daha', 'Cok_Derin.md'), '# derin\n', 'utf8');
    ok('8 · a page nested deeper than one category is found',
        (await call('wiki.status')).wiki.misplaced.length === 1);
}

// ===================================== 9. and the next compile knows all this
{
    // The second mark, over the same conversation, a different turn: the brief
    // must now hand the agent what the wiki ALREADY holds — which is the thing
    // that decides open-a-page versus amend-one, and the first judgement of
    // every compile (_REF/wiki.md §3).
    const second = await call('wiki.candidates.add', { session: 'ff54aa29', turn: 3, topics: 'Derleme Motoru' });
    const b2 = await call('wiki.compile', { ids: [second.id] });
    ok('9 · ‼️ the next brief carries what the last compile wrote',
        b2.existing.some(e => e.category === 'Sistem' && e.concept === 'Aday_Havuzu'));
    ok('9 · …and the compiled mark is not offered again',
        !b2.candidates.some(c => c.id === markId));
}

// ============================== 10. U-90/U-91: the two ops behind the picker
{
    const c = await call('wiki.categories');
    ok('10 · the folders and the pool\'s topics are reported SEPARATELY',
        Array.isArray(c.folders) && Array.isArray(c.topics) && Array.isArray(c.all));
    ok('10 · …and the folder a compile wrote is one of them',
        c.folders.some(f => f.name === 'Sistem' && f.pages >= 1));
    ok('10 · …with the union assembled once, here, rather than per surface',
        c.all.includes('Sistem') && c.all.includes('Derleme Motoru')
        && c.all.length === new Set(c.all.map(s => s.toLowerCase())).size);

    const made = await call('wiki.category.add', { name: 'Yeni / Konu' });
    ok('10 · ‼️ a category is made at ONE level, with the separator removed',
        made.name === 'Yeni Konu' && fs.existsSync(path.join(wikiRoot, 'Yeni Konu')));
    ok('10 · …and it is offered from that moment, page or no page',
        (await call('wiki.categories')).folders.some(f => f.name === 'Yeni Konu' && f.pages === 0));
    ok('10 · a spelling that already exists is reported, not duplicated',
        (await call('wiki.category.add', { name: 'yeni  konu' })).existed === true);
    ok('10 · a name that cleans away is refused with a reason',
        /no name/i.test(await refusal('wiki.category.add', { name: '::' })));
}

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best-effort */ }

console.log(`\ntest_wiki_e2e: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

})();
