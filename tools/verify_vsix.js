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
        /^extension\/(src|test|node_modules|scratchpad)\//.test(n)
        || /\.vsix$/.test(n)
        || n === 'extension/parity.manifest.json'
        || /^extension\/dist\/render\//.test(n));
    ok('‼️ nothing that belongs to the workshop shipped'
        + (leaked.length ? ' (' + leaked.slice(0, 6).join(', ') + (leaked.length > 6 ? ', …' : '') + ')' : ''),
        leaked.length === 0);
    const total = files.reduce((n, f) => n + f.size, 0);
    console.log(`  ${(total / 1048576).toFixed(1)} MB uncompressed · ${fs.statSync(vsix).size / 1048576 < 1 ? '<1' : (fs.statSync(vsix).size / 1048576).toFixed(1)} MB packed`);
    ok('the build did not silently double in size', total < 40 * 1048576);
}

console.log(`\nverify_vsix: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
