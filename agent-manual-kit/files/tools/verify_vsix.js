// X-51 — WHAT IS ACTUALLY INSIDE THE THING THAT SHIPS.
//
// ‼️ EVERY GATE IN THIS REPO RUNS BEFORE PACKAGING. `npm run package` checks
// encoding, the right-click catalogue and bridge parity, and then hands the
// folder to `vsce` — and from that moment on nothing looks again. `.vscodeignore`
// is a list of patterns, which means the failure it can produce is silent by
// construction: a new page script that a pattern happens to match is simply not
// in the VSIX, the extension installs cleanly, and the page is blank the first
// time somebody opens it. No test in the repo would have noticed, because every
// test reads the working tree.
//
// So this reads the BUILT ARTEFACT — the zip's own central directory, no
// dependency, nothing decompressed — and asks whether what the shell loads is
// really in there.
//
//   node tools/verify_vsix.js               the version in package.json
//   node tools/verify_vsix.js 3.205.0       a particular build
//
// It is deliberately NOT in `npm test`: there is no VSIX before packaging, and
// a check that skips when its subject is missing is not a check. Run it after
// `npm run package`, before `code --install-extension`.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const version = process.argv[2] || pkg.version;
const vsix = path.join(ROOT, 'dist', 'vsix', `agent-farm-${version}.vsix`);

if (!fs.existsSync(vsix)) {
    console.log(`  FAIL there is no build to verify: ${vsix}`);
    console.log('       run `npm run package` first — this reads the artefact, not the working tree.');
    process.exit(1);
}

/**
 * Every path inside a zip, read out of its central directory.
 *
 * A VSIX is an ordinary zip. The central directory sits at the end, each entry
 * beginning `PK\x01\x02` with the name length at offset 28 and the name at 46 —
 * so the whole listing is readable without inflating a single byte.
 */
function entries(file) {
    const buf = fs.readFileSync(file);
    const SIG = 0x02014b50;
    const out = [];
    for (let i = 0; i + 46 <= buf.length; i++) {
        if (buf.readUInt32LE(i) !== SIG) { continue; }
        const nameLen = buf.readUInt16LE(i + 28);
        const extraLen = buf.readUInt16LE(i + 30);
        const commentLen = buf.readUInt16LE(i + 32);
        const name = buf.toString('utf8', i + 46, i + 46 + nameLen);
        const size = buf.readUInt32LE(i + 24);      // uncompressed
        out.push({ name, size });
        i += 46 + nameLen + extraLen + commentLen - 1;
    }
    return out;
}

const files = entries(vsix);
const names = new Set(files.map(f => f.name));
const has = (p) => names.has('extension/' + p.replace(/\\/g, '/'));
const sizeOf = (p) => {
    const hit = files.find(f => f.name === 'extension/' + p.replace(/\\/g, '/'));
    return hit ? hit.size : 0;
};

console.log(`verify_vsix: ${path.basename(vsix)} — ${files.length} entries`);
ok('the archive was readable at all', files.length > 100);
ok('it is the version package.json claims',
    has('package.json') && JSON.parse(
        // the manifest inside is the one that decides what VS Code installs
        fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version === version);

// ---------------------------------------------------------------- what runs
{
    ok('‼️ the extension entry point is inside', has('out/extension.js'));
    const panels = fs.readdirSync(path.join(ROOT, 'src', 'panels'))
        .filter(f => f.endsWith('.ts')).map(f => f.replace(/\.ts$/, '.js'));
    const missing = panels.filter(p => !has('out/panels/' + p));
    ok('‼️ every compiled panel shipped' + (missing.length ? ' (' + missing.join(', ') + ')' : ''),
        missing.length === 0);
    const cores = fs.readdirSync(path.join(ROOT, 'src', 'core'))
        .filter(f => f.endsWith('.ts')).map(f => f.replace(/\.ts$/, '.js'));
    const missingCore = cores.filter(c => !has('out/core/' + c));
    ok('‼️ every compiled core module shipped'
        + (missingCore.length ? ' (' + missingCore.join(', ') + ')' : ''),
        missingCore.length === 0);
    // An MCP server is staged out of the VSIX at activation; a file missing here is a server that never starts.
    // X-536 — the bridge CLI and the Agent Manual's reader are staged out of out/service at
    // every start; the manual itself is read from manual/. A VSIX without them starts, and
    // every agent on the machine is left with a bridge that cannot explain itself.
    const service = ['af.js', 'manualQuery.js'].filter(f => !has('out/service/' + f));
    ok('‼️ the bridge CLI and the manual reader shipped' + (service.length ? ' (' + service.join(', ') + ')' : ''),
        service.length === 0);
    const manualFiles = ['card.md', 'map.md', 'ops.meta.json'].concat(
        ...['areas', 'playbooks'].map(d => fs.readdirSync(path.join(ROOT, 'manual', d)).map(f => d + '/' + f)));
    const missingManual = manualFiles.filter(f => !has('manual/' + f));
    ok('‼️ every Agent Manual file shipped' + (missingManual.length ? ' (' + missingManual.slice(0, 8).join(', ') + ')' : ''),
        missingManual.length === 0);
    const mcp = fs.readdirSync(path.join(ROOT, 'src', 'mcp')).flatMap(d => fs.readdirSync(path.join(ROOT, 'src', 'mcp', d))
        .filter(f => f.endsWith('.ts')).map(f => 'out/mcp/' + d + '/' + f.replace(/\.ts$/, '.js')));
    const missingMcp = mcp.filter(f => !has(f));
    ok('‼️ every MCP server file shipped' + (missingMcp.length ? ' (' + missingMcp.join(', ') + ')' : ''), missingMcp.length === 0);
}

// -------------------------------------------------------------- what draws
// ‼️ THE FAILURE THIS FILE EXISTS FOR. A page script the shell asks the webview
// for and the VSIX does not carry is a blank panel with no error anywhere.
{
    const media = fs.readdirSync(path.join(ROOT, 'media'))
        .filter(f => /\.(js|css|svg|png)$/.test(f));
    const missing = media.filter(m => !has('media/' + m));
    ok('‼️ every media asset shipped' + (missing.length ? ' (' + missing.join(', ') + ')' : ''),
        missing.length === 0);
    const empty = media.filter(m => has('media/' + m) && sizeOf('media/' + m) === 0);
    ok('…and none of them is empty' + (empty.length ? ' (' + empty.join(', ') + ')' : ''),
        empty.length === 0);

    // The shell's own script list, read out of base.ts rather than restated —
    // a page added to htmlShell and forgotten in `.vscodeignore` is the same bug
    // from the other end.
    const shell = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'base.ts'), 'utf8');
    const asked = [...shell.matchAll(/'media',\s*'([\w.-]+)'/g)].map(m => m[1]);
    const notShipped = [...new Set(asked)].filter(a => !has('media/' + a));
    ok('‼️ every file the HTML shell asks the webview for is in the archive'
        + (notShipped.length ? ' (' + notShipped.join(', ') + ')' : ''),
        notShipped.length === 0);

    // ‼️ A-20 — AND THE SOUNDS, WHOSE ABSENCE HAS NO SYMPTOM AT ALL.
    // The check above reads `media/` itself and stops there; `media/sounds/`
    // was never looked at. A voice the archive does not carry is not a blank
    // panel somebody notices in a second — it is an alert that never plays,
    // on a feature whose entire purpose is to be heard from another room, and
    // the settings page will still offer it by name. The list is DERIVED from
    // the compiled core rather than restated, so a voice added there and
    // forgotten in `.vscodeignore` is caught by this, not by a user.
    let voices = [];
    try {
        const V = require(path.join(ROOT, 'out', 'core', 'alertVoices.js'));
        voices = V.builtinVoices('media/sounds').map(v => v.file);
    } catch (e) { voices = []; }
    ok('the built-in voice list could be read from the compiled core',
        voices.length > 0);
    const noSound = voices.filter(v => !has(v));
    ok('‼️ every built-in alert sound is in the archive'
        + (noSound.length ? ' (' + noSound.join(', ') + ')' : ''),
        noSound.length === 0);
    const hollow = voices.filter(v => has(v) && sizeOf(v) < 1000);
    ok('…and none of them is a stub' + (hollow.length ? ' (' + hollow.join(', ') + ')' : ''),
        hollow.length === 0);
}

// --------------------------------------------------------------- what reads
{
    ok('the in-app guide has its documents',
        has('docs/BLUEPRINT.tr.md') && has('docs/BLUEPRINT.en.md'));
    ok('…and the changelog the release notes are read from', has('changelog.md'));
}

// ------------------------------------------------------- what must NOT be in
// `.vscodeignore` is a list of patterns, so what it EXCLUDES is worth checking
// as literally as what it keeps: a 5 MB build that quietly grew to 60 is a
// pattern that stopped matching.
{
    const leaked = [...names].filter(n =>
        /^extension\/(src|test|node_modules|scratchpad|tools|\.tmp)\//.test(n)
        || /\.vsix$/.test(n)
        || n === 'extension/parity.manifest.json'
        || /^extension\/dist\/render\//.test(n));
    ok('‼️ nothing that belongs to the workshop shipped'
        + (leaked.length ? ' (' + leaked.slice(0, 6).join(', ') + (leaked.length > 6 ? ', …' : '') + ')' : ''),
        leaked.length === 0);
    /**
     * ‼️ AND NOTHING NOBODY MEANT TO SHIP AT ALL.
     *
     * Every check above names a FOLDER. A stray file dropped in the repo ROOT
     * matches no ignore pattern and no folder rule, so it rides into the
     * artefact silently: measured on 3.230.0, a 1.4 MB file a mistyped shell
     * redirection had created in the root was packed and every gate passed.
     * The root of this extension has a known, short list of files; anything
     * else there is an accident, and an accident in a shipped artefact is
     * exactly what this tool exists to name.
     */
    const ROOT_OK = new Set([
        'package.json', 'package-lock.json', 'readme.md', 'changelog.md',
        // vsce renames the licence on its way in, so BOTH spellings are legal
        'license', 'license.txt',
        'tsconfig.json', '.vscodeignore', '.gitignore', '.gitattributes'
    ]);
    const strays = [...names]
        .filter(n => n.startsWith('extension/') && !n.slice('extension/'.length).includes('/'))
        .map(n => n.slice('extension/'.length))
        .filter(n => !ROOT_OK.has(n.toLowerCase()));
    ok('‼️ no stray file rode into the archive from the repo root'
        + (strays.length ? ' (' + strays.slice(0, 6).join(', ') + (strays.length > 6 ? ', …' : '') + ')' : ''),
        strays.length === 0);
    /**
     * ‼️ AND THE SAME ACCIDENT AS A WHOLE FOLDER, WHICH EVERY RULE HERE MISSES.
     *
     * The leak rule above NAMES the workshop folders, so it only ever catches
     * the names somebody already thought of; the root rule sees files, not
     * folders; the untracked rule below looks inside `docs` and `media` only.
     * A new top-level folder therefore rides in through the gap between all
     * three — measured on 3.574.0, a `scratch/` a session had left behind (one
     * letter off the ignored `scratchpad/`) shipped twelve files of session
     * dumps and every gate passed. What the artefact's top level holds is a
     * SHORT KNOWN LIST, so it is stated as one rather than guessed at from the
     * other side: a folder nobody put on it is an accident by definition, and
     * the next stray name is caught without anybody having to predict it.
     */
    const FOLDERS_OK = new Set(['dist', 'docs', 'media', 'out']);
    const strayDirs = [...new Set([...names]
        .filter(n => n.startsWith('extension/'))
        .map(n => n.slice('extension/'.length).split('/')[0])
        .filter(seg => seg && !FOLDERS_OK.has(seg)
            && [...names].some(n => n.startsWith('extension/' + seg + '/'))))];
    ok('‼️ no folder nobody meant to ship rode into the archive'
        + (strayDirs.length ? ' (' + strayDirs.slice(0, 6).join(', ')
            + (strayDirs.length > 6 ? ', …' : '') + '/)' : ''),
        strayDirs.length === 0);
    /**
     * ‼️ AND THE SAME ACCIDENT ONE LEVEL DOWN, WHICH THE ROOT RULE ABOVE CANNOT
     * SEE.
     *
     * `vsce` packs the WORKING DIRECTORY, not the repository. A file dropped
     * inside a folder that ships rides into the artefact without ever having
     * been committed, reviewed, or seen by anybody but the person who left it
     * there — and every gate passes, because it breaks no pattern and sits in
     * no forbidden folder. Measured 2026-09-19: a private note named for stored
     * account sign-ins sat untracked in `docs/` and was inside four consecutive
     * builds before anybody looked.
     *
     * Git is the authority for "did anybody mean to ship this", and it is there
     * wherever this tool is run. Where it is not — a build from a tarball — the
     * check says so rather than passing silently, because a guard that cannot
     * run is not a guard that found nothing.
     */
    {
        const SHIPPED_SOURCE = /^extension\/(docs|media)\//;
        let tracked;
        try {
            tracked = new Set(require('child_process')
                .execFileSync('git', ['ls-files', '-z', 'docs', 'media'],
                    { cwd: ROOT, encoding: 'utf8', windowsHide: true })
                .split('\0').filter(Boolean).map(s => s.replace(/\\/g, '/')));
        } catch { tracked = undefined; }
        if (!tracked) {
            console.log('  -- git is not available here, so "untracked file shipped" was NOT checked');
        } else {
            const untracked = [...names]
                .filter(n => SHIPPED_SOURCE.test(n))
                .map(n => n.slice('extension/'.length))
                .filter(n => !tracked.has(n));
            ok('‼️ nothing untracked rode into the archive from a folder that ships'
                + (untracked.length
                    ? ' (' + untracked.slice(0, 6).join(', ')
                        + (untracked.length > 6 ? ', …' : '') + ')'
                    : ''),
                untracked.length === 0);
        }
    }
    /**
     * ‼️ X-115 — AND WHAT IS INSIDE THE FILES, NOT ONLY WHAT THEY ARE CALLED.
     *
     * Every rule above reads the LISTING. A key pasted into a doc that IS
     * tracked, a fixture that slipped out of `test/`, a compiled module with a
     * token left in a comment — each has a perfectly legal name, and each ships.
     * So every text entry is inflated and searched for the shapes a real
     * credential has. The shapes are the vendors' own prefixes with a body long
     * enough that a placeholder in a doc (`sk-ant-...`, `ghp_xxxx`) does not
     * match: a check that cries wolf on the documentation gets switched off.
     */
    {
        // The list is shared with the commit hook (tools/scan_staged.js) — one
        // copy, so the two guards cannot come to disagree about what a key is.
        const { TEXT_FILE, credentialFindings } = require('./credentialShapes');
        const zlib = require('zlib');
        const buf = fs.readFileSync(vsix);
        const found = [];
        for (let i = 0; i + 46 <= buf.length; i++) {
            if (buf.readUInt32LE(i) !== 0x02014b50) { continue; }
            const method = buf.readUInt16LE(i + 10);
            const csize = buf.readUInt32LE(i + 20);
            const nameLen = buf.readUInt16LE(i + 28);
            const extraLen = buf.readUInt16LE(i + 30);
            const commentLen = buf.readUInt16LE(i + 32);
            const local = buf.readUInt32LE(i + 42);
            const name = buf.toString('utf8', i + 46, i + 46 + nameLen);
            i += 46 + nameLen + extraLen + commentLen - 1;
            if (!TEXT_FILE.test(name) || buf.readUInt32LE(local) !== 0x04034b50) { continue; }
            const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
            const raw = buf.subarray(start, start + csize);
            let text;
            try {
                text = (method === 8 ? zlib.inflateRawSync(raw) : raw).toString('utf8');
            } catch { continue; }
            for (const what of credentialFindings(text)) {
                found.push(name.replace(/^extension\//, '') + ' (' + what + ')');
            }
        }
        ok('‼️ no credential-shaped string is inside any shipped file'
            + (found.length ? ' (' + found.slice(0, 6).join(', ') + (found.length > 6 ? ', …' : '') + ')' : ''),
            found.length === 0);
    }
    const total = files.reduce((n, f) => n + f.size, 0);
    console.log(`  ${(total / 1048576).toFixed(1)} MB uncompressed · ${fs.statSync(vsix).size / 1048576 < 1 ? '<1' : (fs.statSync(vsix).size / 1048576).toFixed(1)} MB packed`);
    ok('the build did not silently double in size', total < 40 * 1048576);
}

console.log(`\nverify_vsix: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
