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
    ok('the new setting is filed, not left to leak into Other', /wikiAgent: 'reports'/.test(so));
}

})().then(() => {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* windows */ }
    console.log(`test_wiki_compile_run: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
});
