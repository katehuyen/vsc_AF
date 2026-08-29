// M-23 (X-50) — THE COMPILE, DONE RATHER THAN DESCRIBED.
//
// ‼️ WHAT THIS FILE IS THE PROOF OF. B-14 drew a line the engine may not cross:
// `wiki.compile` hands back a BRIEF because an extension cannot synthesise. M-23
// is what crosses the gap honestly — it starts a headless run out of that same
// brief and stops there. So the three things pinned here are the three ways
// this could quietly become a lie:
//
//   · a run that MARKED ITS OWN WORK DONE. Nothing closes in the pool until the
//     run reports the pages back; a compile that failed halfway would otherwise
//     leave the pool claiming turns were written into a wiki that never got them.
//   · TWO RUNS OVER ONE MARK. The same turns read twice file the same concept
//     twice, which is the one failure the whole pool exists to prevent.
//   · A CLAIM THAT OUTLIVES ITS RUN. A crashed compile must not lock a turn out
//     of the wiki for ever, so a claim is only real while its task is.
//
// And the prompt itself is checked, because it is the whole product: a run told
// to "summarise the session" would produce exactly the mechanical output this
// idea exists to avoid.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const { BridgeRegistry } = require(path.join(ROOT, 'out', 'core', 'bridge.js'));
const W = require(path.join(ROOT, 'out', 'core', 'wiki.js'));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-wcr-'));
const poolFile = path.join(tmp, 'store', 'wiki_candidates.json');
const wikiRoot = path.join(tmp, '00_WIKI');

fs.mkdirSync(path.join(wikiRoot, '_KURALLAR_'), { recursive: true });
fs.writeFileSync(path.join(wikiRoot, '_KURALLAR_', '-WIKI-ANAYASA-.md'), '# law\n', 'utf8');
fs.mkdirSync(path.join(wikiRoot, 'Agents'), { recursive: true });
fs.writeFileSync(path.join(wikiRoot, 'Agents', 'Weighted_Tokens.md'), '# Weighted Tokens\n', 'utf8');
fs.writeFileSync(path.join(wikiRoot, 'index.md'), '# index\n', 'utf8');
fs.writeFileSync(path.join(wikiRoot, 'log.md'), '# log\n', 'utf8');

// X-58 — the transcript is a REAL file here, because a mark whose file is gone
// is now skipped by name rather than handed to a run that cannot read it.
fs.writeFileSync(path.join(tmp, 'sess.jsonl'), '{}\n', 'utf8');

const SESSIONS = [{
    file: path.join(tmp, 'sess.jsonl'),
    sessionId: 'bb16dc64-ea30-4747-bf91-a6a3dcc1ad44',
    agentName: 'developer',
    turns: [
        { n: 1, label: 'llm wiki fikri', ts: 1 },
        { n: 2, label: 'aday havuzu', ts: 2 },
        { n: 3, label: 'derleme motoru', ts: 3 }
    ]
}];

// ---- a task manager, cut down to the two questions the engine asks it ----
const TASKS = [];
const started = [];
let aliveOverride = null;
const deps = {
    store: () => store,
    root: () => wikiRoot,
    sessions: () => SESSIONS,
    procedure: '_REF/wiki.md',
    defaultAgent: () => 'developer',
    taskAlive: (id) => (aliveOverride ? aliveOverride(id) : TASKS.some(t => t.id === id && t.alive)),
    startCompile: (a) => {
        const t = { id: 't' + (TASKS.length + 1), alive: a.start !== false, ...a };
        TASKS.push(t);
        started.push(a);
        return { taskId: t.id, agent: a.agent || 'developer', started: t.alive };
    }
};

const store = new W.WikiStore(poolFile);
const bridge = new BridgeRegistry();
W.registerWikiOps(bridge, deps);
const call = (op, args) => bridge.dispatch(op, args || {});

const mark = (turn, topics, note) => store.add({
    sessionId: SESSIONS[0].sessionId, sessionFile: SESSIONS[0].file,
    engine: 'claude', agentName: 'developer',
    fromTurn: turn, toTurn: turn, topics,
    label: (SESSIONS[0].turns.find(t => t.n === turn) || {}).label || '',
    note: note || '', addedBy: 'you'
}).candidate;

(async () => {

// ---------- the op exists and says what it is ----------
{
    const ops = bridge.catalog();
    const list = Array.isArray(ops) ? ops : ops.ops;
    const run = list.find(o => o.op === 'wiki.compile.run');
    ok('wiki.compile.run is in the catalogue', !!run);
    ok('‼️ and its line says starting a run marks nothing compiled',
        !!run && /Nothing is marked compiled by starting a run/i.test(run.describe));
    ok('…and that a mark with a run out is refused rather than read twice',
        !!run && /refused rather than read twice/i.test(run.describe));
    const brief = list.find(o => o.op === 'wiki.compile');
    ok('wiki.compile still hands back a brief and says so',
        !!brief && /writes NO wiki page/i.test(brief.describe));
}

// ---------- the brief is ONE assembly, shared by both doors ----------
{
    const a = mark(2, ['Aday Havuzu', 'Wiki'], 'havuz burada anlatiliyor');
    const described = (await call('wiki.compile', { ids: [a.id] })).result;
    ok('the brief resolves the mark to a transcript on disk',
        described.candidates[0].transcript === SESSIONS[0].file);
    ok('…and to the turns to read', described.candidates[0].readTurns === '2-2' || described.candidates[0].readTurns === '2');
    ok('…and names the law before anything else',
        /-WIKI-ANAYASA-\.md$/.test(described.rules) && described.next[0].indexOf('rules file first') > 0);
    ok('‼️ asking for the brief starts nothing', TASKS.length === 0);
    ok('…and marks nothing', store.get(a.id).state === 'pending' && !store.get(a.id).compileTaskId);
}

// ---------- the run ----------
let first;
{
    const pending = store.candidates.filter(c => c.state === 'pending');
    const r = await call('wiki.compile.run', { ids: pending.map(c => c.id) });
    ok('the run starts', !r.error && !!r.result.taskId);
    first = r.result;
    ok('…under the configured agent', first.agent === 'developer');
    ok('…and says out loud that nothing is compiled yet',
        /Nothing is compiled yet/i.test(first.note));
    ok('the mark now carries the claim',
        store.candidates[0].compileTaskId === first.taskId);
    ok('‼️ …and is STILL pending — a run is not a result',
        store.candidates[0].state === 'pending');
    ok('the answer says what will be read, by file and by turn',
        first.reads[0].transcript === SESSIONS[0].file && !!first.reads[0].turns);
}

// ---------- the prompt is the whole product ----------
{
    const p = started[0].prompt;
    ok('the prompt names the law FIRST', p.indexOf('-WIKI-ANAYASA-') < p.indexOf('_REF/wiki.md'));
    ok('…and the agent procedure after it', p.indexOf('_REF/wiki.md') > 0);
    ok('it points at the transcript rather than summarising it',
        p.indexOf(SESSIONS[0].file) > 0 && !/summar(y|ise) of the (session|turn)/i.test(p));
    ok('it says where the index and the log are',
        p.indexOf('index.md') > 0 && p.indexOf('log.md') > 0);
    ok('it lists what the wiki already holds, which decides create-vs-amend',
        /Agents\/Weighted_Tokens/.test(p));
    ok('it carries the topics the mark was filed under', /Aday Havuzu/.test(p));
    ok('…and why somebody kept it', /havuz burada anlatiliyor/.test(p));
    ok('‼️ ONE CONCEPT PER PAGE is stated, not assumed', /A page is one concept/.test(p));
    ok('‼️ nothing contradicted is deleted', /Nothing contradicted is deleted/.test(p));
    ok('‼️ every fact carries its provenance', /Every fact carries where it came from/.test(p));
    ok('‼️ the report-back is written out with the real ids, nothing to look up',
        p.indexOf('wiki.candidates.edit { id: "' + store.candidates[0].id + '"') > 0);
    ok('…and a mark it could not write is told to stay pending',
        /stays pending/.test(p));
    ok('the title says what is being compiled', /Wiki compile —/.test(started[0].title));
}

// ---------- two runs over one mark ----------
{
    const r = await call('wiki.compile.run', { ids: [store.candidates[0].id] });
    ok('‼️ a mark with a live run is refused rather than read twice',
        /already have a compile running/i.test(r.error || ''));
    ok('…and the refusal names which ones', (r.error || '').indexOf(store.candidates[0].id) > 0);
    ok('nothing was started by the refusal', TASKS.length === 1);
}

// ---------- a claim only lives as long as its run ----------
{
    TASKS[0].alive = false;   // the run ended (done, failed, cancelled — same thing here)
    const r = await call('wiki.compile.run', { ids: [store.candidates[0].id] });
    ok('‼️ a claim whose run has ended is stale, and the mark can be compiled again',
        !r.error && !!r.result.taskId);
    ok('…and the mark carries the NEW claim', store.candidates[0].compileTaskId === r.result.taskId);
}

// ---------- what actually closes a mark ----------
{
    const id = store.candidates[0].id;
    const before = store.get(id).compileTaskId;
    ok('a claim is on it before the report', !!before);
    const r = await call('wiki.candidates.edit', {
        id, state: 'compiled', pages: ['Agents/Aday_Havuzu.md']
    });
    ok('the run reporting back is what compiles it', !r.error && r.result.state === 'compiled');
    ok('…and the claim comes off with it', !store.get(id).compileTaskId);
    ok('…the provenance stays', (store.get(id).pages || [])[0] === 'Agents/Aday_Havuzu.md');
    // Withdrawing the claim puts it back in the pool WITHOUT a stale run on it.
    await call('wiki.candidates.edit', { id, state: 'pending' });
    ok('withdrawing it leaves no ghost run behind',
        store.get(id).state === 'pending' && !store.get(id).compileTaskId
        && !store.get(id).compiledAt);
}

// ---------- status counts what is out ----------
{
    aliveOverride = null;
    const idle = store.candidates[0];
    idle.compileTaskId = undefined;
    const b = mark(3, ['Derleme Motoru']);
    await call('wiki.compile.run', { ids: [b.id] });
    const st = (await call('wiki.status')).result;
    ok('wiki.status says how many pending marks have a run out', st.pool.compiling === 1);
    ok('…and they are still counted as pending, because they are',
        st.pool.pending >= st.pool.compiling);
}

// ---------- the refusals that are not guesses ----------
{
    const noRoot = path.join(tmp, 'nowhere');
    const b2 = new BridgeRegistry();
    W.registerWikiOps(b2, { ...deps, root: () => noRoot });
    const r = await b2.dispatch('wiki.compile.run', { all: true });
    ok('a missing wiki root stops the run before anything spawns',
        /wiki root does not exist/i.test(r.error || ''));
    const noLaw = path.join(tmp, 'lawless');
    fs.mkdirSync(noLaw, { recursive: true });
    const b3 = new BridgeRegistry();
    W.registerWikiOps(b3, { ...deps, root: () => noLaw });
    const r3 = await b3.dispatch('wiki.compile.run', { all: true });
    ok('‼️ a wiki with no law of its own is refused — it outranks the procedure',
        /outranks the agent procedure/i.test(r3.error || ''));
    const b4 = new BridgeRegistry();
    W.registerWikiOps(b4, { ...deps, startCompile: undefined });
    const r4 = await b4.dispatch('wiki.compile.run', { all: true });
    ok('a build with no way to start a run says so instead of pretending',
        /no way to start a run/i.test(r4.error || ''));
    const r5 = await call('wiki.compile.run', {});
    ok('"compile whatever is there" is never implied',
        /Pass ids, topic, or all/i.test(r5.error || ''));
}

/**
 * ---------- U-117: A DROPPED FILE WITH NO TOPIC IS NOT WORK THE COMPILE CAN DO
 *
 * X-139 made `_RAW_` fill the pool by itself, and it deliberately leaves the
 * topics EMPTY — a topic is the key a page is filed under and a scan guessing
 * one would file the file under that guess for ever. So there is now a mark in
 * the pool that is pending and not compilable, which is a state nothing else
 * could be in, and every door has to agree about it:
 *
 *   · asked for BY NAME it is refused, and the refusal names the FILE — an id
 *     tells the reader nothing about which drop they forgot to file;
 *   · `all:true` simply leaves it out, because one un-triaged drop must not be
 *     able to block Compile All for ever;
 *   · and when leaving it out leaves nothing, the refusal says which files are
 *     waiting rather than "nothing matched".
 */
const rawDir = path.join(wikiRoot, '_RAW_');
{
    fs.mkdirSync(path.join(rawDir, '_DONE_'), { recursive: true });
    fs.writeFileSync(path.join(rawDir, 'claude-web-kota.md'), '# Kota mimarisi\n\nmetin\n', 'utf8');
    const sync = W.syncRawCandidates(wikiRoot, store);
    ok('a file dropped into _RAW_ becomes a mark of its own', sync.added.length === 1);
    const raw = store.get(sync.added[0]);
    ok('‼️ …carrying NO topic, because a scan will not guess what it was about',
        raw.topics.length === 0);
    ok('…and it is a raw mark by its KEY, not by the engine string it displays',
        W.isRawCandidate(raw) && raw.sessionId === 'raw:claude-web-kota.md');

    const v = W.candidateView(raw);
    ok('‼️ the one view every surface reads answers it, so nobody re-derives it',
        v.raw === true && v.rawFile === 'claude-web-kota.md' && v.rawDone === false);
    ok('‼️ …and never claims a turn range a file does not have', v.turns === 'whole file');
    ok('…and says outright that nothing can be compiled from it yet', v.compilable === false);

    const byName = await call('wiki.compile.run', { ids: [raw.id] });
    ok('‼️ compiling it by name is REFUSED — a topic is what the page is filed under',
        !!byName.error && /claude-web-kota\.md/.test(byName.error) && /no topic yet/.test(byName.error));
    ok('…and the refusal started nothing and claimed nothing', !raw.compileTaskId);

    ok('‼️ "everything waiting" is not "everything untriaged" — `all` leaves it out',
        !W.chooseCandidates(store, { all: true }).some(c => c.id === raw.id));

    await call('wiki.candidates.edit', { id: raw.id, topics: ['Kota'] });
    ok('…and the moment it is filed it is an ordinary mark like any other',
        W.chooseCandidates(store, { all: true }).some(c => c.id === raw.id)
        && W.candidateView(store.get(raw.id)).compilable === true);
}

/**
 * ---------- X-140: THE COMPILE CONTRACT FOR A DROPPED FILE
 *
 * The brief and the prompt are written in the grammar of a CLI transcript — a
 * turn scope, turn numbers, what each turn opened with — and a markdown export
 * has none of it. Four things have to be true or the run goes looking for turns
 * that are not there, or leaves the user's folder in a state that lies:
 *
 *   · it is DECLARED an external file, in the first line of its own block;
 *   · its note travels as an ORDER, not as "why it was kept" — it is the only
 *     way to narrow a scope that has no turn numbers to narrow it by;
 *   · the archive path and the provenance link are COMPUTED, never left to the
 *     run: a model asked to work out an archive path works out a plausible one,
 *     and a link pointing at where the file used to be breaks the moment the
 *     move next to it succeeds;
 *   · and the move is named in the same breath as the report, because a file
 *     left in the drop box is offered again on the next scan.
 */
{
    // The one with a directive on it, filed and ready to compile.
    fs.writeFileSync(path.join(rawDir, 'gemini-vault.md'), '# Vault mimarisi\n\nmetin\n', 'utf8');
    const s3 = new W.WikiStore(path.join(tmp, 'store3', 'wiki_candidates.json'));
    const added = W.syncRawCandidates(wikiRoot, s3).added;
    const target = s3.candidates.find(c => c.sessionId === 'raw:gemini-vault.md');
    W.editCandidate(s3, {
        id: target.id, topics: ['Obsidian'],
        note: 'sadece klasor isimlendirme bolumunu al, gerisi bizde zaten var'
    });
    ok('the fixture has the three drops it needs', added.length >= 1 && !!target);

    const deps3 = Object.assign({}, deps, { store: () => s3 });
    const brief = W.buildBrief(deps3, [s3.get(target.id)]);
    const row = brief.candidates.find(c => c.id === target.id);

    ok('‼️ the brief names the archive folder, computed rather than described',
        !!brief.archive && brief.archive.done === path.join(wikiRoot, '_RAW_', '_DONE_'));
    ok('…and where THIS file has to end up',
        row.rawArchive === path.join(wikiRoot, '_RAW_', '_DONE_', 'gemini-vault.md'));
    ok('‼️ …and the provenance link points at the ARCHIVE, not at where it is now',
        row.rawLink === '_RAW_/_DONE_/gemini-vault.md');
    ok('the note travels as a directive, which is what a note on a file IS',
        /klasor isimlendirme/.test(row.directive));
    ok('…and the extra steps are appended to the ones every compile has',
        brief.next.length > 5 && brief.next.some(s => /MOVE THE FILE/.test(s)));

    // ‼️ Self-healing: the destination is made at brief time too. The prompt
    // still tells the run to create it, because the folder can go away between
    // the two — but a run should not be the FIRST thing that ever makes it.
    fs.rmSync(path.join(wikiRoot, '_RAW_', '_DONE_'), { recursive: true, force: true });
    W.buildBrief(deps3, [s3.get(target.id)]);
    ok('‼️ a deleted _DONE_ is rebuilt by the brief itself',
        fs.existsSync(path.join(wikiRoot, '_RAW_', '_DONE_')));

    const p = W.compilePrompt(brief);
    ok('‼️ the prompt DECLARES it an external file before anything else about it',
        /EXTERNAL FILE — NOT A CLI SESSION/.test(p));
    ok('…and says to read the whole of it rather than a turn range',
        /has no turns: read the whole file/.test(p) && !/read exactly these turns/.test(p));
    ok('‼️ …and shouts the user directive as an order',
        /KULLANICI DİREKTİFİ/.test(p) && /outranks your own judgement/.test(p));
    ok('…hands the provenance line in the vault\'s own words',
        /Harici Kaynak: \[\[_RAW_\/_DONE_\/gemini-vault\.md\]\]/.test(p));
    // ‼️ `lastIndexOf`: the file's path is named earlier too, in its own block —
    // what is asserted here is that it is named AGAIN, next to the report.
    ok('‼️ …and names the move in the same breath as the report back',
        p.indexOf('one more thing in the same breath') > p.indexOf('## Report back')
        && p.lastIndexOf('gemini-vault.md') > p.indexOf('## Report back'));
    ok('…with the folder to create first, so a cleaned-up disk does not break it',
        /create it if it does not/.test(p));

    // ‼️ AND A DROP WHOSE FILE HAS GONE IS SKIPPED BY NAME, like any other mark
    // whose material is not there. It is the likeliest of all of them: this file
    // lives in a folder the user opens and tidies.
    fs.writeFileSync(path.join(rawDir, 'silinecek.md'), '# gecici\n', 'utf8');
    W.syncRawCandidates(wikiRoot, s3);
    const doomed = s3.candidates.find(c => c.sessionId === 'raw:silinecek.md');
    W.editCandidate(s3, { id: doomed.id, topics: ['Kota'] });
    fs.rmSync(path.join(rawDir, 'silinecek.md'), { force: true });
    const partial = W.buildBrief(deps3, [s3.get(target.id), s3.get(doomed.id)]);
    ok('‼️ a drop whose file has been tidied away is skipped BY NAME, not silently',
        (partial.skipped || []).some(s => s.id === doomed.id && /silinecek\.md/.test(s.transcript))
        && partial.candidates.length === 1);

    // ‼️ AND A COMPILE OF ORDINARY TURNS IS TOLD NONE OF THIS. A run handed a
    // move instruction about a folder none of its marks came from is a run that
    // may act on it.
    const plain = W.compilePrompt(W.buildBrief(deps, [store.candidates.find(c => !W.isRawCandidate(c))]));
    ok('‼️ a compile with no dropped file is never told about the archive at all',
        !/EXTERNAL FILE/.test(plain) && !/_DONE_/.test(plain) && !/Harici Kaynak/.test(plain));
}

// …and the pool where the drops are ALL there is: the refusal has to be the
// thing to go and do, not "nothing matched".
{
    const s2 = new W.WikiStore(path.join(tmp, 'store2', 'wiki_candidates.json'));
    fs.writeFileSync(path.join(rawDir, 'ikinci-export.md'), '# ikinci\n', 'utf8');
    W.syncRawCandidates(wikiRoot, s2);
    let msg = '';
    try { W.chooseCandidates(s2, { all: true }); } catch (e) { msg = e.message; }
    ok('‼️ a pool of nothing but un-triaged drops says WHICH files need a topic',
        /waiting for a topic/.test(msg) && /ikinci-export\.md/.test(msg));
}

// ---------- the door a person uses ----------
{
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('the command exists and goes through the op',
        /registerCommand\('agentfarm\.compileWiki'/.test(ext)
        && /dispatch\('wiki\.compile\.run'/.test(ext));
    ok('‼️ …and everything is ticked when the picker opens — narrowing is the exception',
        /picked: true/.test(ext) && /press Enter to compile it all/.test(ext));
    ok('a mark with a run out is not offered again in the picker',
        /alive\(c\.compileTaskId\)/.test(ext));
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    ok('the command is in the palette',
        pkg.contributes.commands.some(c => c.command === 'agentfarm.compileWiki'));
    ok('there is a setting saying who writes the wiki',
        !!pkg.contributes.configuration.properties['agentFarm.wikiAgent']);
    const par = JSON.parse(fs.readFileSync(path.join(ROOT, 'parity.manifest.json'), 'utf8'));
    const row = par.entries.find(e => e.capability === 'compileWiki');
    ok('…and the parity manifest binds the command to the op',
        !!row && (row.ops || []).includes('wiki.compile.run'));
    const so = fs.readFileSync(path.join(ROOT, 'src', 'core', 'settingsops.ts'), 'utf8');
    // X-57 — it is filed under the wiki's own section now, not Reports & Digest.
    ok('the new setting is filed, not left to leak into Other', /wikiAgent: 'wiki'/.test(so));
}

})().then(() => {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* windows */ }
    console.log(`test_wiki_compile_run: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
});
