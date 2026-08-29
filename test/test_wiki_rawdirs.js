// X-138 — THE WIKI'S DROP BOX: relative, self-healing, made before it is needed.
//
// The point of `_RAW_` is that a session had somewhere else — a Claude Web
// answer, a ChatGPT export, a file somebody typed — is simply DROPPED into it.
// No command, no conversion, no naming rule to get right first. `_RAW_/_DONE_`
// is where a compiled one moves, so the drop box stays a to-do list rather
// than a growing pile.
//
// ‼️ WHY SELF-HEALING IS THE REQUIREMENT AND NOT A NICETY. The folder lives in
// the user's own vault, where Obsidian, a sync client and their own hand all
// reach it. It WILL be deleted, renamed, or simply absent on a fresh machine,
// and every one of those is a normal Tuesday. A feature whose entire promise is
// "drag a file here" cannot answer "that folder does not exist".
//
// ‼️ AND WHY IT STILL REFUSES TO MAKE THE ROOT. `mkdir -p <root>/_RAW_/_DONE_`
// brings the ROOT into existence too — and the root is a path the user typed by
// hand, with `%USERPROFILE%` in it, on every machine they own. A typo would
// quietly become a real empty folder somewhere on the disk while the real wiki
// sat untouched beside it, and the health check that was supposed to REPORT the
// problem would have created the evidence that there wasn't one.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`,
    JSON.stringify(got) === JSON.stringify(want));

const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') {
        return { Uri: {}, window: {}, workspace: { getConfiguration: () => ({ get: (_k, d) => d }) }, ViewColumn: {}, ConfigurationTarget: {}, env: {} };
    }
    return origLoad.apply(this, arguments);
};
const W = require(path.join(ROOT, 'out', 'core', 'wiki.js'));
Module._load = origLoad;

const { ensureRawDirs, scaffoldWiki, wikiHealth, wikiStatus, WIKI_RAW_REL, WIKI_DONE_REL } = W;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-x138-'));
let n = 0;
const freshRoot = () => {
    const d = path.join(tmp, 'w' + (++n));
    fs.mkdirSync(d, { recursive: true });
    return d;
};

// ============================================ 1. relative to the root, always
{
    eq('the drop box is named relative', WIKI_RAW_REL, '_RAW_');
    ok('…and so is the archive, one level inside it',
        WIKI_DONE_REL === path.join('_RAW_', '_DONE_'));
    // The whole reason: the setting is retyped per machine (and written with
    // %USERPROFILE% in it). Two different roots must give two different boxes.
    const a = freshRoot(), b = freshRoot();
    eq('two roots, two drop boxes', [ensureRawDirs(a).raw, ensureRawDirs(b).raw],
        [path.join(a, '_RAW_'), path.join(b, '_RAW_')]);
}

// ============================================ 2. self-healing
{
    const root = freshRoot();
    const r1 = ensureRawDirs(root);
    ok('a wiki with no drop box gets one', r1.ready);
    eq('…and says it had to make both', r1.created, ['_RAW_', '_RAW_/_DONE_']);
    ok('the folders are really on disk',
        fs.existsSync(path.join(root, '_RAW_')) && fs.existsSync(path.join(root, '_RAW_', '_DONE_')));

    const r2 = ensureRawDirs(root);
    ok('asking again is ready', r2.ready);
    eq('…and makes nothing, because nothing was missing', r2.created, []);

    // The case the item was filed for: the user deletes it in Obsidian.
    fs.rmSync(path.join(root, '_RAW_'), { recursive: true, force: true });
    const r3 = ensureRawDirs(root);
    ok('a drop box deleted by hand comes back, silently', r3.ready);
    eq('…both of them, since _DONE_ went with it', r3.created, ['_RAW_', '_RAW_/_DONE_']);

    // …and only the archive, which is the shape a half-repair leaves.
    fs.rmSync(path.join(root, '_RAW_', '_DONE_'), { recursive: true, force: true });
    const r4 = ensureRawDirs(root);
    eq('a missing archive alone is the only thing remade', r4.created, ['_RAW_/_DONE_']);
    ok('…and it is ready again', r4.ready);
}

// ============================================ 3. ‼️ it never creates the root
{
    const missing = path.join(tmp, 'a-path-nobody-typed-correctly');
    const r = ensureRawDirs(missing);
    ok('a root that does not exist is refused, not created', !r.ready);
    ok('…and nothing was written there', !fs.existsSync(missing));
    ok('…and the answer says which path it was about', String(r.error).includes(missing));
    ok('…but the paths are still reported, so a caller can show them',
        r.raw === path.join(missing, '_RAW_'));

    // ‼️ The empty root is the dangerous one: path.join('', '_RAW_') is the
    // RELATIVE '_RAW_', which would be made in the process's own directory —
    // inside the extension's install folder, or the user's repo.
    const none = ensureRawDirs('');
    ok('an unset root makes nothing at all', !none.ready && none.raw === '');
    ok('…and does not fall back to a relative path', none.raw !== '_RAW_');
    ok('…and says why', !!none.error);
    ok('nothing named _RAW_ appeared in the working directory',
        !fs.existsSync(path.join(process.cwd(), '_RAW_')));
}

// ============================================ 4. wired into the three engines
{
    // scaffold — the drop box is part of the shape of a wiki
    const root = path.join(tmp, 'scaffolded');
    const r = scaffoldWiki(root);
    ok('scaffolding a wiki makes the drop box', r.ok
        && fs.existsSync(path.join(root, '_RAW_', '_DONE_')));
    ok('…and lists it with everything else it created',
        r.created.includes('_RAW_') && r.created.includes('_RAW_/_DONE_'));

    // health — the moment a user asks "is something wrong here"
    const h = freshRoot();
    const health = wikiHealth(h, '%USERPROFILE%/wiki');
    ok('a health check repairs the drop box rather than diagnosing it', health.raw.ready
        && fs.existsSync(path.join(h, '_RAW_', '_DONE_')));
    eq('…and reports where it is', health.raw.raw, path.join(h, '_RAW_'));
    ok('…without disturbing what health MEANS: the law still decides compilable',
        health.compilable === false && health.missing.length === 3);
    ok('…and the setting is still echoed as typed', health.setting === '%USERPROFILE%/wiki');

    // ‼️ health parity — a health check on a root that is not there must stay a
    // question about a path.
    const ghost = path.join(tmp, 'ghost-root');
    const gh = wikiHealth(ghost);
    ok('a health check on a missing root creates nothing', !gh.exists
        && !gh.raw.ready && !fs.existsSync(ghost));

    // ‼️ and the drop box is not a category. It starts with '_', which the
    // page/category readers already skip — pinned here because the day it stops
    // being true, every wiki grows a phantom category with zero pages.
    ok('the drop box never becomes a category',
        !health.categories.some(c => c.name === '_RAW_'));
    eq('…and adds no pages', health.pages, 0);
}

// ============================================ 5. wikiStatus says where to drop
{
    const root = freshRoot();
    const deps = {
        store: () => ({ candidates: [], topics: () => [] }),
        root: () => root,
        sessions: () => []
    };
    const st = wikiStatus(deps);
    ok('status makes the drop box ready before it answers', st.wiki.rawReady
        && fs.existsSync(path.join(root, '_RAW_', '_DONE_')));
    eq('…and hands back an absolute path, which is what a caller needs',
        st.wiki.raw, path.join(root, '_RAW_'));
    eq('…and the archive beside it', st.wiki.done, path.join(root, '_RAW_', '_DONE_'));

    const ghostDeps = { ...deps, root: () => path.join(tmp, 'status-ghost') };
    const gs = wikiStatus(ghostDeps);
    ok('…and on a missing root it reports rather than creates',
        gs.wiki.exists === false && gs.wiki.rawReady === false
        && !fs.existsSync(path.join(tmp, 'status-ghost')));
}

// ============================================ 6. the ops say so
{
    const src = fs.readFileSync(path.join(ROOT, 'src', 'core', 'wiki.js'.replace('.js', '.ts')), 'utf8');
    ok('wiki.health tells a caller it repairs the drop box',
        /X-138 — it also REPAIRS the drop box/.test(src));
    ok('wiki.status names the two folders it hands back',
        /the drop-box folder an external transcript is left in/.test(src));
}

// ================ 6. X-139 — the box becomes a pool with nobody pressing anything
//
// ‼️ THE PROMISE THIS KEEPS. X-138 made the folder; on its own that is a box
// files go into and nothing comes out of. The whole gesture is meant to be
// "save the conversation in there" — so the pool has to notice, and it has to
// notice on the calls that are already being made rather than on a button
// somebody has to remember.
{
    const { syncRawCandidates, WikiStore, rawSessionId } = W;
    const root = freshRoot();
    ensureRawDirs(root);
    const raw = path.join(root, WIKI_RAW_REL);
    const done = path.join(root, WIKI_DONE_REL);
    const store = new WikiStore(path.join(tmp, 'x139-pool.json'));
    const drop = (name, text) => fs.writeFileSync(path.join(raw, name), text, 'utf8');

    drop('claude-web.md', '---\naf-role: chat\n---\n\n# Vektor veritabani secimi\n\nbody');
    drop('plain.txt', 'the first line is the label\nsecond');
    // Not a transcript: a file the scan must leave alone rather than turn into
    // a candidate nobody can compile.
    drop('screenshot.png', 'binary-ish');

    const first = syncRawCandidates(root, store);
    eq('‼️ a file dropped in the box is a candidate on the next look', first.added.length, 2);
    const rows = store.candidates;
    eq('…only the text files; a PNG is not a transcript',
        rows.map(c => c.sessionId).sort(), ['raw:claude-web.md', 'raw:plain.txt']);
    const web = rows.find(c => c.sessionId === rawSessionId('claude-web.md'));
    // ‼️ The label is the file's HEADING, not its front matter: an exported file
    // whose first line is `---` would otherwise be listed as `---`.
    eq('…labelled by its own first real line, front matter skipped',
        web.label, 'Vektor veritabani secimi');
    eq('…and pointed at the file a compile will actually read',
        web.sessionFile, path.join(raw, 'claude-web.md'));
    eq('‼️ …with NO topics, because a scan may not guess what a file is about',
        [web.topics, web.state, web.addedBy, web.engine, web.fromTurn],
        [[], 'pending', 'auto-raw', 'raw-file', 0]);
    ok('the row says it came from a file rather than from a CLI run',
        /^wc-raw-/.test(web.id));
    eq('a plain text drop is labelled by its first line too',
        rows.find(c => c.sessionId === 'raw:plain.txt').label, 'the first line is the label');

    // ‼️ THE DUPLICATE TEST, which is the whole reason the key is the file.
    const again = syncRawCandidates(root, store);
    eq('‼️ scanning again makes nothing — one file is one row, for ever',
        [again.added.length, store.candidates.length], [0, 2]);

    // A person drops the same file, marks it, and it is compiled and archived.
    web.topics = ['Mimari'];
    fs.renameSync(path.join(raw, 'claude-web.md'), path.join(done, 'claude-web.md'));
    const archived = syncRawCandidates(root, store);
    eq('‼️ a file moved into _DONE_ is consumed, not lost: the path is corrected',
        [archived.moved, store.candidates.find(c => c.id === web.id).sessionFile],
        [[web.id], path.join(done, 'claude-web.md')]);
    eq('…and it keeps its state and the topics somebody typed',
        [web.state, web.topics], ['pending', ['Mimari']]);
    eq('…and it is NOT re-created in _RAW_ on the next scan',
        syncRawCandidates(root, store).added.length, 0);

    // ‼️ AND WHAT HAPPENS WHEN A FILE SIMPLY DISAPPEARS. Untouched rows are the
    // scan's own noise and may be cleaned up; a row a person invested in must
    // not vanish from the cockpit, because a mark that disappears is
    // indistinguishable from one that was never made.
    fs.unlinkSync(path.join(raw, 'plain.txt'));
    fs.unlinkSync(path.join(done, 'claude-web.md'));
    const gone = syncRawCandidates(root, store);
    eq('a file deleted before anybody touched its row drops that row',
        store.candidates.find(c => c.sessionId === 'raw:plain.txt').state, 'dropped');
    eq('‼️ …while a row somebody tagged keeps its state and is TOLD why it is stuck',
        [web.state, /gone from _RAW_/.test(web.lastError || '')], ['pending', true]);
    eq('…and both were reported by the call that did it', gone.lost.sort(), [web.id, store.candidates.find(c => c.sessionId === 'raw:plain.txt').id].sort());
    // A dropped row is a decision. Putting the file back does not undo it by
    // itself, and it does not make a second row either.
    drop('plain.txt', 'back again');
    eq('‼️ a candidate somebody dropped is not resurrected by the file returning',
        [syncRawCandidates(root, store).added.length,
            store.candidates.filter(c => c.sessionId === 'raw:plain.txt').length], [0, 1]);

    // It never creates anything: a root that is not there is not a folder to make.
    const ghost = path.join(tmp, 'x139-ghost');
    const before = fs.existsSync(ghost);
    eq('‼️ a sync makes no folders — a missing root stays missing',
        [syncRawCandidates(ghost, store).added.length, fs.existsSync(ghost), before],
        [0, false, false]);
    eq('…and an empty root string is refused outright', syncRawCandidates('', store).added, []);
}

// ============================== 7. X-139 — it happens on the calls already made
{
    const root = freshRoot();
    ensureRawDirs(root);
    fs.writeFileSync(path.join(root, WIKI_RAW_REL, 'dropped.md'), '# A web chat\n', 'utf8');
    const store = new W.WikiStore(path.join(tmp, 'x139-status-pool.json'));
    const deps = { store: () => store, root: () => root, sessions: () => [] };
    const st = wikiStatus(deps);
    eq('‼️ asking the status is enough — the drop is already in the pool',
        [st.pool.pending, st.pool.total], [1, 1]);
    ok('…and the call says what it itself changed, by id',
        st.wiki.rawSync && st.wiki.rawSync.added.length === 1);
    const quiet = wikiStatus(deps);
    ok('…and a status that changed nothing does not report a sync at all',
        quiet.wiki.rawSync === undefined && quiet.pool.total === 1);
    // The cockpit draws itself from the listing, so the same is true there.
    const fresh = freshRoot();
    ensureRawDirs(fresh);
    fs.writeFileSync(path.join(fresh, WIKI_RAW_REL, 'second.md'), '# Another\n', 'utf8');
    const store2 = new W.WikiStore(path.join(tmp, 'x139-list-pool.json'));
    const ops = [];
    W.registerWikiOps({ register: (rows) => ops.push(...rows) },
        { store: () => store2, root: () => fresh, sessions: () => [] });
    const listed = ops.find(o => o.op === 'wiki.candidates.list').handler({});
    eq('‼️ the cockpit\'s own list shows a file dropped a second ago',
        [listed.total, listed.candidates[0].sessionId], [1, 'raw:second.md']);
}

// ============ U-122: what the vault strip says about each of its own objects
//
// ‼️ THE STRIP NAMED FILES AND SAID NOTHING ABOUT THEM, so "is the index up to
// date?" cost a trip to Obsidian. These are the figures a hover can carry —
// and the one figure it must refuse to invent.
{
    const root = freshRoot();
    scaffoldWiki(root);
    const idx = path.join(root, 'index.md');
    fs.writeFileSync(idx, 'a\nb\nc\n', 'utf8');
    const f = W.wikiFileFacts(idx);
    eq('a file states its size and its length', [f.found, f.bytes, f.lines], [true, 6, 4]);
    ok('…and when it last changed', f.mtime > 0);
    const gone = W.wikiFileFacts(path.join(root, 'nothing.md'));
    eq('a file that is not there says so and invents no figures',
        [gone.found, gone.bytes, gone.lines, gone.mtime], [false, 0, null, 0]);
    eq('…and neither does an empty name', W.wikiFileFacts('').found, false);
    // ‼️ A DIRECTORY IS NOT A FILE. statSync answers for both, and a strip that
    // reported "0 lines" for a folder would be stating a figure about the wrong
    // kind of thing.
    eq('a folder is not reported as a file', W.wikiFileFacts(root).found, false);

    // ‼️ THE PROCEDURE IS A NAME UNTIL A ROOT HOLDS IT. `_REF/wiki.md` is
    // relative to an agent root, and a page cannot open a name.
    const agents = freshRoot();
    const other = freshRoot();
    const deps = { store: () => new W.WikiStore(path.join(tmp, 'u122-pool.json')), root: () => root, sessions: () => [] };
    eq('with no roots configured there is nothing to open',
        W.resolveProcedure({ ...deps, agentRoots: () => [] }), '');
    eq('…and a root that does not hold it is not an answer either',
        W.resolveProcedure({ ...deps, agentRoots: () => [other] }), '');
    fs.mkdirSync(path.join(agents, '_REF'), { recursive: true });
    fs.writeFileSync(path.join(agents, '_REF', 'wiki.md'), '# procedure\n', 'utf8');
    eq('‼️ the FIRST root that really holds it wins',
        W.resolveProcedure({ ...deps, agentRoots: () => [other, agents] }),
        path.join(agents, '_REF', 'wiki.md'));

    // And the whole of it, through the op every surface actually calls.
    fs.writeFileSync(path.join(root, WIKI_RAW_REL, 'one.md'), '# one\n', 'utf8');
    fs.writeFileSync(path.join(root, WIKI_RAW_REL, 'two.txt'), 'two\n', 'utf8');
    fs.writeFileSync(path.join(root, WIKI_RAW_REL, 'notes.pdf'), 'x', 'utf8');
    fs.writeFileSync(path.join(root, WIKI_DONE_REL, 'old.md'), '# old\n', 'utf8');
    const st = wikiStatus({ ...deps, procedure: '_REF/wiki.md', agentRoots: () => [agents] });
    eq('‼️ the drop box is counted in what it can actually hold, not in files',
        [st.wiki.rawFiles, st.wiki.doneFiles], [2, 1]);
    ok('the status carries the resolved procedure, so the strip can open it',
        st.wiki.procedureFile === path.join(agents, '_REF', 'wiki.md'));
    ok('…and the four figures for each file it names',
        st.wiki.facts.rules.found && st.wiki.facts.index.found
        && st.wiki.facts.log.found && st.wiki.facts.procedure.lines === 2);
    ok('a machine whose roots do not hold the procedure gets an empty path',
        wikiStatus({ ...deps, agentRoots: () => [other] }).wiki.procedureFile === '');
}

console.log(`${pass} passed, ${fail} failed`);
