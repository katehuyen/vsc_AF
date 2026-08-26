// X-55 (X-132) — THE SKILLS THAT SLEEP ON DISK, AND THE ONE PAGE THAT WAKES THEM.
//
// ‼️ WHAT THIS FILE IS THE PROOF OF. The whole idea rests on the library being
// FREE while it is not being used: fourteen skills in front of every model on
// every turn is a permanent bill and a procedure in front of work that does not
// need one. So nothing here loads a skill — the module reads the folder, and
// what it produces is ONE block of text: the library's own hook plus an index
// of where the skills actually are.
//
// And the failure this pins down is the quiet one: a hook without an index.
// The hook says "invoke the relevant skill" because it was written for a
// harness with a skill REGISTRY behind it. Here they are plain files, so a
// model given the hook alone would be told to invoke something it has no way
// to find — which reads as the feature working right up until it matters.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const { BridgeRegistry } = require(path.join(ROOT, 'out', 'core', 'bridge.js'));
const S = require(path.join(ROOT, 'out', 'core', 'superpowers.js'));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-sp-'));
const root = path.join(tmp, 'superpowers');

const skill = (id, front, text) => {
    fs.mkdirSync(path.join(root, id), { recursive: true });
    fs.writeFileSync(path.join(root, id, 'SKILL.md'), front + text, 'utf8');
};
const FM = (name, desc) => `---\nname: ${name}\ndescription: ${desc}\n---\n\n`;

skill('using-superpowers', FM('using-superpowers', 'Use when starting any conversation'),
    '## The Rule\n\nInvoke relevant skills BEFORE any response.\n');
skill('test-driven-development', FM('test-driven-development',
    'Use when writing any code - RED, GREEN, REFACTOR'), '# TDD\n\nWrite the test first.\n');
skill('systematic-debugging', FM('systematic-debugging',
    'Use when something is broken - find the root cause,\n    never patch the symptom'), '# Debugging\n');
fs.writeFileSync(path.join(root, 'systematic-debugging', 'root-cause-tracing.md'), '# tracing\n', 'utf8');
fs.writeFileSync(path.join(root, 'systematic-debugging', 'defense-in-depth.md'), '# depth\n', 'utf8');
// Not a skill: the library ships folders beside them, and a folder with no
// SKILL.md must be passed over in silence rather than listed as an empty one.
fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
fs.writeFileSync(path.join(root, 'assets', 'logo.txt'), 'x', 'utf8');
fs.writeFileSync(path.join(root, 'README.md'), '# not a skill\n', 'utf8');

// ---------------------------------------------------------- reading them ----
{
    const list = S.readSkills(root);
    ok('every folder with a SKILL.md is a skill', list.length === 3);
    ok('…and a folder without one is not, in silence',
        !list.some(s => s.id === 'assets'));
    ok('they come back in reading order, by name',
        list.map(s => s.id).join(',') === 'systematic-debugging,test-driven-development,using-superpowers');
    const tdd = list.find(s => s.id === 'test-driven-development');
    ok('the one line saying WHEN it applies is read off the skill itself',
        /RED, GREEN, REFACTOR/.test(tdd.description));
    ok('…and the path is absolute, because that is what a reader has to open',
        path.isAbsolute(tdd.file) && fs.existsSync(tdd.file));
    const dbg = list.find(s => s.id === 'systematic-debugging');
    ok('a description written over two lines is one line again',
        dbg.description === 'Use when something is broken - find the root cause, never patch the symptom');
    ok('the other markdown in a skill\'s folder is counted, not lost',
        dbg.extras.length === 2 && dbg.extras[0] === 'defense-in-depth.md');
}

// ------------------------------------------------------------- the health ----
{
    const h = S.superpowersHealth(root, '%USERPROFILE%\\skills');
    ok('a folder with the hook and skills in it is usable', h.usable && h.exists && h.hookFound);
    ok('…and it reports the setting as TYPED beside the folder it opened',
        h.setting === '%USERPROFILE%\\skills' && h.root === root);
    ok('…with every skill and what it is for', h.skills.length === 3);

    const gone = S.superpowersHealth(path.join(tmp, 'nope'));
    ok('a folder that is not there is not usable, and says so',
        !gone.usable && !gone.exists && /not there/.test(gone.why));

    // ‼️ THE ONE ABSENCE THAT MATTERS. A folder full of skills with no hook in
    // it has nothing to put in front of a model — and reporting that as "0
    // skills" would send somebody looking for the wrong problem.
    const noHook = path.join(tmp, 'nohook');
    fs.mkdirSync(path.join(noHook, 'test-driven-development'), { recursive: true });
    fs.writeFileSync(path.join(noHook, 'test-driven-development', 'SKILL.md'),
        FM('test-driven-development', 'x') + '# TDD\n', 'utf8');
    const h2 = S.superpowersHealth(noHook);
    ok('a folder with skills but no hook is refused BY NAME',
        !h2.usable && h2.exists && h2.skills.length === 1
        && /using-superpowers[\\/]SKILL\.md is missing/.test(h2.why));
}

// -------------------------------------------------------------- the block ----
{
    const text = S.superpowersBlock(root);
    ok('the hook\'s own words are what a session is given',
        /Invoke relevant skills BEFORE any response/.test(text));
    ok('‼️ its frontmatter is NOT — registry metadata is noise to a model reading instructions',
        !/^---/m.test(text) && !text.includes('description: Use when starting'));
    ok('‼️ and the index is there, or "invoke the relevant skill" names nothing',
        /test-driven-development/.test(text) && /systematic-debugging/.test(text));
    ok('…each with the line saying when it applies', /RED, GREEN, REFACTOR/.test(text));
    ok('…and with the absolute path, which is the only way to read one',
        text.includes(path.join(root, 'test-driven-development', 'SKILL.md')));
    ok('…and it says they are files to READ, not a registry to invoke',
        /READ IT with your\s+file tool/.test(text));
    ok('the folder itself is named once, for a reader who wants to look around',
        text.includes('Root: `' + root + '`'));

    // ‼️ Half a hook is worse than none: a model told to use skills that are
    // not there goes looking, and every search is a turn spent on nothing.
    ok('a folder that cannot supply one supplies NOTHING, not a broken hook',
        S.superpowersBlock(path.join(tmp, 'nope')) === ''
        && S.superpowersBlock(path.join(tmp, 'nohook')) === '');

    // The cost is a standing one — it rides on every spawn of every session
    // that has the switch on — so it is capped like the project brief is.
    const big = path.join(tmp, 'big');
    fs.mkdirSync(path.join(big, 'using-superpowers'), { recursive: true });
    fs.writeFileSync(path.join(big, 'using-superpowers', 'SKILL.md'),
        FM('using-superpowers', 'x') + 'y'.repeat(S.SUPERPOWERS_HOOK_MAX + 500), 'utf8');
    const capped = S.superpowersBlock(big);
    ok('a hook that is not the library\'s own is cut rather than paid for for ever',
        capped.length < S.SUPERPOWERS_HOOK_MAX + 1200 && /cut at 8000 characters/.test(capped));
}

// --------------------------------------------------------------- the ops ----
(async () => {
    const bridge = new BridgeRegistry();
    S.registerSuperpowersOps(bridge, { root: () => root, rootSetting: () => '' });
    const names = (bridge.catalog().ops || bridge.catalog()).map(o => o.op || o);
    ok('both ops are in the catalogue',
        names.includes('superpowers.status') && names.includes('superpowers.hook'));

    const st = await bridge.dispatch('superpowers.status', {});
    ok('status answers what is on disk', st.ok && st.result.usable && st.result.skills.length === 3);

    const hk = await bridge.dispatch('superpowers.hook', {});
    ok('hook answers the exact text, and how much of it there is',
        hk.ok && hk.result.chars === hk.result.text.length && hk.result.chars > 100);
    ok('…and which skills it is indexing', hk.result.skills.length === 3);

    const b2 = new BridgeRegistry();
    S.registerSuperpowersOps(b2, { root: () => path.join(tmp, 'nohook') });
    const empty = await b2.dispatch('superpowers.hook', {});
    ok('‼️ an unusable folder answers an empty text AND the reason for it',
        empty.ok && empty.result.text === '' && /missing/.test(empty.result.why));

    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* windows */ }
    console.log(`\ntest_superpowers: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
