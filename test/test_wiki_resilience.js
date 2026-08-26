// X-58 — THE THREE WAYS A MARK USED TO BE LOST, AND THE ONE WAY IT USED TO LIE.
//
// Every failure here is silent, which is why they all needed a file of their own:
//
//   1. SWALLOWED — marking a whole conversation deleted every single turn kept
//      inside it and absorbed their topics. Covered in test_wiki_candidates;
//      what is here is the compile-side half.
//   2. LOCKED OUT — `wiki.compile.run` stamps a mark with the run's id so two
//      compiles cannot read the same turns twice. Nothing took the stamp off
//      when the run died, so a rate limit, a cancel or a VS Code restart put a
//      turn permanently out of reach while the pool still said "waiting".
//   3. ALL-OR-NOTHING — one mark whose transcript had been moved took the whole
//      compile down with it, and the error named the wiki root.
//   4. FINISHED-AND-SILENT — a run that ended `done` without reporting any page
//      left the mark exactly like one nobody had got to, which is the worst of
//      the four because everything looks healthy.
//
// ‼️ AND THE FIFTH, WHICH IS NOT A FAILURE BUT A COST: "the whole session except
// the last two" used to be twelve clicks, so nobody did it and the compile read
// "commit this" and "good night" as material.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const { BridgeRegistry } = require(path.join(ROOT, 'out', 'core', 'bridge.js'));
const W = require(path.join(ROOT, 'out', 'core', 'wiki.js'));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-wikires-'));
const wikiRoot = path.join(tmp, '00_WIKI');
W.scaffoldWiki(wikiRoot);

const transcript = path.join(tmp, 'sess.jsonl');
const ghost = path.join(tmp, 'gone.jsonl');
fs.writeFileSync(transcript, '{}\n', 'utf8');

const SESSIONS = [
    {
        file: transcript, sessionId: 'aaaaaaaa-1111-2222-3333-444444444444',
        agentName: 'developer',
        turns: [
            { n: 1, label: 'wiki fikri', ts: 1 },
            { n: 2, label: 'aday havuzu', ts: 2 },
            { n: 3, label: 'derleme motoru', ts: 3 },
            { n: 4, label: 'commit at', ts: 4 },
            { n: 5, label: 'iyi geceler', ts: 5 }
        ]
    },
    {
        // Its transcript is NOT written — this is the moved/pruned file.
        file: ghost, sessionId: 'bbbbbbbb-1111-2222-3333-444444444444',
        agentName: 'manager', turns: [{ n: 1, label: 'baska konusma', ts: 9 }]
    }
];

// A task manager cut down to the two questions the engine asks it.
const TASKS = [];
const deps = {
    store: () => store,
    root: () => wikiRoot,
    sessions: () => SESSIONS,
    procedure: '_REF/wiki.md',
    defaultAgent: () => 'developer',
    taskAlive: (id) => {
        const t = TASKS.find(x => x.id === id);
        return !!t && (t.status === 'queued' || t.status === 'running');
    },
    taskOutcome: (id) => {
        const t = TASKS.find(x => x.id === id);
        return t ? { status: t.status, ...(t.reason ? { reason: t.reason } : {}) } : undefined;
    },
    startCompile: (a) => {
        const t = { id: 't' + (TASKS.length + 1), status: 'running', title: a.title, prompt: a.prompt };
        TASKS.push(t);
        return { taskId: t.id, agent: 'developer', started: true };
    }
};

const store = new W.WikiStore(path.join(tmp, 'pool.json'));
const bridge = new BridgeRegistry();
W.registerWikiOps(bridge, deps);
const call = (op, args) => bridge.dispatch(op, args || {});

(async () => {

// ------------------------------------- 1. a claim released when its run dies

{
    const m = (await call('wiki.candidates.add',
        { session: 'aaaaaaaa', turn: 2, topics: 'Aday Havuzu' })).result;
    const run = await call('wiki.compile.run', { ids: [m.id] });
    ok('a run claims the mark', run.ok && !!store.get(m.id).compileTaskId);
    ok('…and a second compile over it is refused while the run is alive',
        /already have a compile running/.test((await call('wiki.compile.run', { ids: [m.id] })).error || ''));

    // The model runs out of quota.
    TASKS[0].status = 'failed';
    TASKS[0].reason = 'the model ran out of quota before the first page';

    const st = (await call('wiki.status')).result;
    ok('‼️ asking what the pool holds releases the dead claim',
        !store.get(m.id).compileTaskId && !store.get(m.id).compileStartedAt);
    ok('…the mark is still pending, because nothing was ever compiled',
        store.get(m.id).state === 'pending');
    ok('…and it now carries WHY, in words a person can act on',
        /ran out of quota/.test(store.get(m.id).lastError || ''));
    ok('…which the pool counts separately from work nobody has reached',
        st.pool.failed === 1 && st.pool.pending === 1);
    ok('…and says which ids it just let go of', (st.pool.justReleased || []).includes(m.id));

    const view = (await call('wiki.candidates.list')).result.candidates[0];
    ok('the row carries the reason and when', !!view.lastError && !!view.lastErrorAt);

    ok('‼️ and the mark can be compiled again — a crash must not lock a turn out for ever',
        (await call('wiki.compile.run', { ids: [m.id] })).ok === true);
    ok('…a fresh run clears the old reason rather than leaving a stale one beside it',
        !store.get(m.id).lastError);

    // A cancel and a restart are two different sentences.
    TASKS[1].status = 'cancelled';
    await call('wiki.status');
    ok('a cancelled run says it was cancelled', /cancelled/.test(store.get(m.id).lastError || ''));

    await call('wiki.compile.run', { ids: [m.id] });
    TASKS.length = 0;      // VS Code restarted; the list is gone
    await call('wiki.status');
    ok('a run that is not on the list at all says THAT, not "it failed"',
        /no longer on the task list/.test(store.get(m.id).lastError || ''));

    // ‼️ The quiet one: it finished and never reported a page.
    await call('wiki.compile.run', { ids: [m.id] });
    TASKS[TASKS.length - 1].status = 'done';
    await call('wiki.status');
    ok('‼️ a run that finished WELL and reported nothing is a failure too, and says so',
        /finished without reporting any page/.test(store.get(m.id).lastError || ''));

    // …and the row's own [↻ Try again].
    const clean = (await call('wiki.candidates.edit', { id: m.id, retry: true })).result;
    ok('retry:true hands the mark back clean', clean.lastError === null && clean.compileTaskId === null);
    await call('wiki.candidates.remove', { id: m.id });
}

// ------------------------- 2. a missing transcript does not take the rest down

{
    const good = (await call('wiki.candidates.add',
        { session: 'aaaaaaaa', turn: 3, topics: 'Derleme' })).result;
    const lost = (await call('wiki.candidates.add',
        { session: 'bbbbbbbb', topics: 'Baska' })).result;

    const brief = (await call('wiki.compile', { all: true })).result;
    ok('the brief carries only the marks it can actually read',
        brief.candidates.length === 1 && brief.candidates[0].id === good.id);
    ok('‼️ …and the one it cannot is REPORTED, not dropped in silence',
        brief.skipped.length === 1 && brief.skipped[0].id === lost.id
        && /missing transcript/.test(brief.skipped[0].why)
        && brief.skipped[0].transcript === ghost);
    ok('the prompt tells the run what was left out and forbids inventing it',
        /Marks that could NOT be included/.test(W.compilePrompt(brief))
        && /Do not invent anything for these/.test(W.compilePrompt(brief)));

    const run = (await call('wiki.compile.run', { all: true })).result;
    ok('the run is started for the readable mark', run.marks === 1 && run.skipped.length === 1);
    ok('…only that one is claimed', !!store.get(good.id).compileTaskId);
    ok('‼️ …and the unreadable one is NOT locked behind a run that is not about it',
        !store.get(lost.id).compileTaskId
        && /missing transcript/.test(store.get(lost.id).lastError || ''));

    // Every mark unreadable is nothing to do, and the refusal names the files.
    await call('wiki.candidates.remove', { ids: [good.id] });
    const none = await call('wiki.compile', { ids: [lost.id] });
    ok('when NONE of them can be read the refusal names the file that is not there',
        none.ok === false && none.error.includes(ghost));
    await call('wiki.candidates.remove', { ids: [lost.id] });
}

// --------------------------------- 3. "the whole session except the last two"

{
    const m = (await call('wiki.candidates.add', {
        session: 'aaaaaaaa', topics: 'Mimari', excludeTurns: [4, 5],
        note: 'son iki tur konuyla ilgili degil'
    })).result;
    ok('the mark is the whole session minus two', m.turns === 'whole session (except 4, 5)');

    const brief = (await call('wiki.compile', { ids: [m.id] })).result;
    const c = brief.candidates[0];
    ok('the brief spells out exactly which turns to read', c.turnList.join(',') === '1,2,3');
    ok('…with what each of them opened with, so the run can check itself',
        c.turnTitles.map(t => t.n).join(',') === '1,2,3'
        && c.turnTitles[1].label === 'aday havuzu');
    ok('…and how long the conversation actually is', c.sessionTurns === 5);

    const p = W.compilePrompt(brief);
    ok('‼️ the exclusion is an instruction that cannot be read as anything else',
        /EXCEPT TURNS 4, 5, WHICH ARE EXCLUDED/.test(p)
        && /DO NOT INCLUDE ANYTHING FROM THOSE TURNS IN THE ANALYSIS/.test(p));
    ok('…the excluded turns are not offered as material either',
        !/4\. commit at/.test(p) && !/5\. iyi geceler/.test(p));
    ok('…and the turns that ARE in it are listed by number and opening line',
        /- 2\. aday havuzu/.test(p));
    ok('the note the person wrote travels with it',
        /son iki tur konuyla ilgili degil/.test(p));

    const run = (await call('wiki.compile.run', { ids: [m.id] })).result;
    ok('what the run is reading says so in the answer too',
        run.reads[0].excludeTurns.join(',') === '4,5');
    ok('…along with the intelligence it resolved to', run.engine === 'claude');
}

// ------------------------------------------- 4. the page and the tagger agree

{
    const page = fs.readFileSync(path.join(ROOT, 'media', 'afWiki.js'), 'utf8');
    ok('the tagger sends exclusions, and only for a whole-session mark',
        /excludeTurns: state\.scope === 'all'/.test(page));
    ok('…the strip is inverted: everything is in, a press takes one out',
        /data-afw-ex=/.test(page) && /press to leave it out/.test(page));
    const css = fs.readFileSync(path.join(ROOT, 'media', 'common.css'), 'utf8');
    ok('‼️ …and an excluded turn does not look like one merely not reached yet',
        /\.afw-tn\.cut\b/.test(css) && /line-through/.test(css));

    const base = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'base.ts'), 'utf8');
    ok('the host drops a number outside the scope rather than storing a puzzle',
        /normTurnList\(msg\.excludeTurns\)\.filter\(n => n >= lo && n <= hi\)/.test(base));
}

})().then(() => {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* windows */ }
    console.log(`test_wiki_resilience: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
});
