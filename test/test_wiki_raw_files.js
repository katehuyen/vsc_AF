// X-141 (X-137 Faz 3) — THE WHOLE LIFE OF A DROPPED FILE, END TO END.
//
// ‼️ WHY THIS FILE EXISTS ALONGSIDE THE UNIT TESTS. Four items built this
// feature and each has its own proof: X-138 that the folders heal
// (test_wiki_rawdirs), X-139 that a drop becomes a row (test_wiki_candidates),
// U-117 that the cockpit draws it as a file rather than a session
// (test_wiki_page), X-140 that the compile is told what it is and where to put
// it (test_wiki_compile_run). Every one of them passes on a seam of its own.
//
// What none of them can answer is whether the SEAMS HOLD when the pieces run in
// order — and the seams are where this feature lives, because the actors are
// different at every step: the user drops the file, a scan finds it, the user
// files it, the extension briefs a run, THE AGENT moves the file, and the next
// scan has to recognise what the agent did. Five hand-offs, and every one of
// them is a place where "the pool says pending, the folder says done" can
// happen without a single unit test failing.
//
// So this is one narrative, in order, with nothing mocked between the steps:
//
//   1. a wiki with no `_RAW_` at all — the folder heals itself
//   2. a file is dropped, and becomes a candidate nobody typed anything for
//   3. it is untriaged: in the pool, waiting, and NOT compilable
//   4. a category and a directive are given — now it is an ordinary mark
//   5. the brief and the prompt tell the run what it is and where to put it
//   6. ‼️ THE MOVE IS PERFORMED as the agent would, and the report is filed
//   7. the next scan recognises the archived file rather than re-adding it
//   8. wiki.status and the bridge ops agree with the disk at every point
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// ‼️ `core/wiki.js` reaches `vscode` through `sessions.js`; a bare require of it
// outside the extension throws before the first assertion runs.
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') {
        return { Uri: {}, window: {}, workspace: { getConfiguration: () => ({ get: (_k, d) => d }) }, ViewColumn: {}, ConfigurationTarget: {}, env: {} };
    }
    return origLoad.apply(this, arguments);
};
const W = require(path.join(ROOT, 'out', 'core', 'wiki.js'));
const { BridgeRegistry } = require(path.join(ROOT, 'out', 'core', 'bridge.js'));
Module._load = origLoad;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-x141-'));
const wikiRoot = path.join(tmp, '00_WIKI');
const RAW = path.join(wikiRoot, '_RAW_');
const DONE = path.join(RAW, '_DONE_');
const FILE = 'claude-web-kota-mimarisi.md';

// A wiki with its law and its two navigation files — and DELIBERATELY no
// `_RAW_`: step 1 is that the drop box does not have to be there first.
fs.mkdirSync(path.join(wikiRoot, '_KURALLAR_'), { recursive: true });
fs.writeFileSync(path.join(wikiRoot, '_KURALLAR_', '-WIKI-ANAYASA-.md'), '# law\n', 'utf8');
fs.writeFileSync(path.join(wikiRoot, 'index.md'), '# index\n', 'utf8');
fs.writeFileSync(path.join(wikiRoot, 'log.md'), '# log\n', 'utf8');

const store = new W.WikiStore(path.join(tmp, 'store', 'wiki_candidates.json'));
const TASKS = [];
const deps = {
    store: () => store,
    root: () => wikiRoot,
    sessions: () => [],
    procedure: '_REF/wiki.md',
    defaultAgent: () => 'developer',
    taskAlive: (id) => TASKS.some(t => t.id === id && t.alive),
    startCompile: (a) => {
        const t = { id: 't' + (TASKS.length + 1), alive: a.start !== false, ...a };
        TASKS.push(t);
        return { taskId: t.id, agent: a.agent || 'developer', started: t.alive };
    }
};
const bridge = new BridgeRegistry();
W.registerWikiOps(bridge, deps);
const call = (op, args) => bridge.dispatch(op, args || {});

(async () => {

// ================================================= 1. the folder heals itself
{
    ok('the fixture starts with no drop box at all', !fs.existsSync(RAW));

    // ‼️ THROUGH THE OP A PERSON ACTUALLY CALLS, not through ensureRawDirs. The
    // healing has to happen on the calls that are already being made — a folder
    // that only appears when somebody remembers to ask for it is a folder that
    // is missing at the moment it is needed.
    const st = (await call('wiki.status')).result;
    ok('‼️ asking for the status makes the drop box exist',
        fs.existsSync(RAW) && fs.existsSync(DONE));
    ok('…and the answer hands back both absolute paths, for a person about to use one',
        st.wiki.raw === RAW && st.wiki.done === DONE && st.wiki.rawReady === true);
    ok('the pool is empty and says so', st.pool.total === 0);
}

// ============================== 2. a file is dropped, and that is the whole UI
{
    fs.writeFileSync(path.join(RAW, FILE),
        '---\ntitle: export\n---\n\n# Kota mimarisi — 5 saatlik pencere ve 7 günlük kota\n\nmetin\n', 'utf8');

    const list = (await call('wiki.candidates.list')).result;
    ok('‼️ the file is in the pool without anybody running a command',
        list.candidates.length === 1);
    const c = list.candidates[0];
    ok('…keyed by its own name, which is what stops a second drop making a second row',
        c.sessionId === 'raw:' + FILE && c.rawFile === FILE);
    // ‼️ AND `wiki.status` SAYS WHAT THE CALL ITSELF CHANGED, by id. A scan that
    // quietly adds rows is a scan whose caller cannot tell a fresh drop from a
    // row that has been sitting there for a week.
    fs.writeFileSync(path.join(RAW, 'gecici-olcum.md'), '# gecici\n', 'utf8');
    const st = (await call('wiki.status')).result;
    ok('the status names what that very call added, by id',
        !!st.wiki.rawSync && (st.wiki.rawSync.added || []).length === 1);
    const tempRow = store.candidates.find(c => c.sessionId === 'raw:gecici-olcum.md');
    await call('wiki.candidates.remove', { ids: [tempRow.id] });
    fs.rmSync(path.join(RAW, 'gecici-olcum.md'), { force: true });

    // ‼️ THE LABEL SKIPS THE FRONT MATTER. An export whose first line is `---`
    // would otherwise be listed as `---`, and every export would look the same.
    ok('the label is the file\'s first REAL line, not its YAML fence',
        /Kota mimarisi/.test(c.label) && !/^---/.test(c.label));
    ok('…and it is not called a session: no turns, and an engine that says so',
        c.turns === 'whole file' && c.engine === 'raw-file' && c.raw === true);

    // Dropping it twice is one row. This is the promise the whole key exists for.
    const again = (await call('wiki.candidates.list')).result;
    ok('‼️ scanning again does NOT make a second row', again.candidates.length === 1);
    ok('…and says it changed nothing this time',
        !again.rawSync || !(again.rawSync.added || []).length);
}

// ======================================= 3. untriaged: waiting, not compilable
let id;
{
    const c = (await call('wiki.candidates.list')).result.candidates[0];
    id = c.id;
    ok('it arrives with NO topic — the one thing only a person can supply',
        Array.isArray(c.topics) && c.topics.length === 0);
    ok('…so it is pending and NOT compilable, which nothing else in the pool can be',
        c.state === 'pending' && c.compilable === false);

    const st = (await call('wiki.status')).result;
    ok('the status counts it as waiting AND as needing a topic',
        st.pool.pending === 1 && st.pool.untriaged === 1 && st.pool.raw === 1);

    // ‼️ BOTH DOORS AGREE, because the rule lives in one body. A tick box the
    // run would then reject is worse than no tick box.
    const byName = await call('wiki.compile.run', { ids: [id] });
    ok('‼️ compiling it by name is refused, and the refusal names the FILE',
        !!byName.error && new RegExp(FILE.replace(/[.]/g, '\\.')).test(byName.error));
    const all = await call('wiki.compile.run', { all: true });
    ok('…and "everything waiting" says which file is waiting for a topic',
        !!all.error && /waiting for a topic/.test(all.error));
    ok('neither attempt started a run or claimed the mark',
        TASKS.length === 0 && !store.get(id).compileTaskId);
}

// ================================= 4. a category and a directive make it a mark
{
    await call('wiki.candidates.edit', {
        id, topics: ['Kota'],
        note: 'sadece 5 saatlik pencere bölümünü al, kotanın fiyatlandırması bizde zaten var'
    });
    const c = (await call('wiki.candidates.list')).result.candidates[0];
    ok('‼️ filed, it becomes an ordinary compilable mark', c.compilable === true);
    ok('…and it is STILL a file — filing it does not turn it into a session',
        c.raw === true && c.turns === 'whole file');
    const st = (await call('wiki.status')).result;
    ok('the status stops counting it as untriaged and starts offering it',
        st.pool.untriaged === 0 && st.pool.pending === 1 && st.pool.raw === 1);
}

// ============================= 5. the brief and the prompt, as the run gets them
let brief;
{
    brief = (await call('wiki.compile', { ids: [id] })).result;
    const row = brief.candidates[0];
    ok('the brief resolves the mark to the file on disk',
        row.transcript === path.join(RAW, FILE) && row.readTurns === 'all');
    ok('‼️ …and computes where it must END UP, rather than describing it',
        row.rawArchive === path.join(DONE, FILE) && row.rawLink === '_RAW_/_DONE_/' + FILE);
    ok('…and carries the note as a directive',
        /5 saatlik pencere/.test(row.directive));
    ok('the brief names the archive folder for the run',
        !!brief.archive && brief.archive.done === DONE);

    const prompt = W.compilePrompt(brief);
    ok('‼️ the prompt declares it an external file before anything else about it',
        /EXTERNAL FILE — NOT A CLI SESSION/.test(prompt));
    ok('…shouts the directive as an order',
        /KULLANICI DİREKTİFİ/.test(prompt) && /5 saatlik pencere/.test(prompt));
    ok('…hands the provenance line in the vault\'s own words',
        prompt.indexOf('Harici Kaynak: [[_RAW_/_DONE_/' + FILE + ']]') > 0);
    ok('…and prints the move as a from → to next to the report back',
        prompt.lastIndexOf(path.join(DONE, FILE)) > prompt.indexOf('## Report back'));

    // Asking for a brief is not doing the work.
    ok('asking for it started nothing and moved nothing',
        TASKS.length === 0 && fs.existsSync(path.join(RAW, FILE)));
}

// ======================== 6. ‼️ THE RUN, THE MOVE AND THE REPORT — in that order
{
    const r = (await call('wiki.compile.run', { ids: [id] })).result;
    ok('the run starts and claims the mark',
        !!r.taskId && store.get(id).compileTaskId === r.taskId);
    ok('‼️ …and the file has NOT moved yet — starting a run compiles nothing',
        fs.existsSync(path.join(RAW, FILE)) && store.get(id).state === 'pending');

    /**
     * ‼️ WHAT THE AGENT IS CONTRACTED TO DO, PERFORMED. Nothing in the extension
     * does this: it never learns that a page was written. The contract is that
     * these two happen together, so the test does them together and then asks
     * whether the system as a whole is consistent — which is the only question
     * the unit tests cannot ask.
     */
    const page = path.join(wikiRoot, 'Kota', 'Bes_Saatlik_Pencere.md');
    fs.mkdirSync(path.dirname(page), { recursive: true });
    fs.writeFileSync(page,
        '# Beş Saatlik Pencere\n\n## Kaynaklar\n- [2026-08-29] Harici Kaynak: [[_RAW_/_DONE_/' + FILE + ']]\n', 'utf8');
    // Self-healing at the moment of the move: the folder is gone again, exactly
    // as the prompt warns it may be, and the agent makes it before renaming.
    fs.rmSync(DONE, { recursive: true, force: true });
    if (!fs.existsSync(DONE)) { fs.mkdirSync(DONE, { recursive: true }); }
    fs.renameSync(path.join(RAW, FILE), path.join(DONE, FILE));
    await call('wiki.candidates.edit', { id, state: 'compiled', pages: ['Kota/Bes_Saatlik_Pencere.md'] });

    ok('the file is out of the drop box and in the archive',
        !fs.existsSync(path.join(RAW, FILE)) && fs.existsSync(path.join(DONE, FILE)));
    const c = store.get(id);
    ok('…and the pool agrees: compiled, stamped, with the page it wrote',
        c.state === 'compiled' && !!c.compiledAt && (c.pages || [])[0] === 'Kota/Bes_Saatlik_Pencere.md');
    ok('‼️ …and the claim is released, so the mark is not locked behind a finished run',
        !c.compileTaskId);

    // The provenance link on the page points at where the file actually is.
    const written = fs.readFileSync(page, 'utf8');
    const linked = written.match(/\[\[(.+?)\]\]/)[1];
    ok('‼️ the link on the page resolves to a file that is really there',
        fs.existsSync(path.join(wikiRoot, linked.split('/').join(path.sep))));
}

// ===================== 7. the next scan recognises what the agent did to the disk
{
    // `state: 'all'` — the default list is the WAITING pool, and this row is not
    // waiting any more. What is asserted here is that it is still one row.
    const list = (await call('wiki.candidates.list', { state: 'all' })).result;
    ok('‼️ the archived file does NOT come back as a new candidate',
        list.candidates.length === 1);
    const c = list.candidates[0];
    ok('…the row is the same row, still compiled',
        c.id === id && c.state === 'compiled');
    ok('…and it is not offered as waiting work either',
        (await call('wiki.candidates.list')).result.candidates.length === 0);
    ok('‼️ …its path was corrected to the archive, so the link is still readable',
        c.sessionFile === path.join(DONE, FILE) && c.rawDone === true);

    // ‼️ AND DELETING IT OUTRIGHT DOES NOT UNDO SOMEBODY'S WORK. A compiled row
    // whose file is gone keeps its state and its pages: the page in the vault is
    // the work, and the file was only ever the material.
    fs.rmSync(path.join(DONE, FILE), { force: true });
    const after = (await call('wiki.candidates.list', { state: 'all' })).result.candidates[0];
    ok('a compiled row survives its file being deleted, pages intact',
        after.state === 'compiled' && (after.pages || []).length === 1);

    const st = (await call('wiki.status')).result;
    ok('and the status is consistent with all of it',
        st.pool.compiled === 1 && st.pool.pending === 0 && st.pool.untriaged === 0);
}

// ================================== 8. the ops say all of this to an agent, too
{
    const ops = bridge.catalog();
    const list = Array.isArray(ops) ? ops : ops.ops;
    const compile = list.find(o => o.op === 'wiki.compile');
    ok('‼️ wiki.compile\'s own line tells an agent about the drop box contract',
        !!compile && /EXTERNAL FILE/.test(compile.describe)
        && /_RAW_\/_DONE_/.test(compile.describe)
        && /no topic at all is not compilable/.test(compile.describe));

    // The human-side and agent-side procedures have to say the same thing; a
    // rule that lives only in the prompt is a rule the next agent rewrites.
    const ref = path.join('D:', path.sep, 'zone', 'agent', 'ajanlar', '_REF', 'wiki.md');
    if (fs.existsSync(ref)) {
        const txt = fs.readFileSync(ref, 'utf8');
        ok('the agent procedure documents the drop box', /_RAW_/.test(txt));
        ok('…that a drop arrives with no topic and is not compilable',
            /NO topic and is therefore NOT compilable/i.test(txt));
        ok('…and that the AGENT is the one who moves the compiled file',
            /YOU move a compiled drop/i.test(txt));
        ok('…with the external-source line on the page template',
            /Harici Kaynak: \[\[_RAW_\/_DONE_\//.test(txt));
    } else {
        // The constitution repo is not on every machine this suite runs on. Say
        // so rather than passing silently — a skipped check that looks like a
        // passed one is the failure this whole file is written against.
        console.log('  note: _REF/wiki.md not on this machine — the procedure checks were skipped');
    }
}

})().then(() => {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* windows */ }
    console.log(`test_wiki_raw_files: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
});
