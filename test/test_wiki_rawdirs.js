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

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
