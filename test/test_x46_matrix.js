// ‼️ X-46 (X-32) — THE ACCEPTANCE MATRIX IS DATA, AND THIS IS WHAT KEEPS IT
// HONEST.
//
// X-46 is the gate X-32 has to pass, and the item lists twenty-four behaviours
// that must be PROVEN, not asserted. Fourteen thousand green tests do not
// answer that: "it is all covered" is a claim, and a claim without an address
// is what a gate exists to refuse.
//
// So the mapping lives in `docs/X-46-KABUL-MATRISI.md` as a table — matrix row
// on the left, the test file and the exact assertion that proves it on the
// right — and this file reads that table back. A cited test deleted, renamed,
// or reworded breaks `npm test` and the table has to be re-pointed. That is the
// whole mechanism: the document cannot quietly go stale, because the only way
// to keep the build green is to keep it true.
//
// ‼️ What this DOES NOT do, deliberately: it does not re-run the cited suites.
// They are green because `npm test` runs them itself; running them twice would
// measure the same thing at twice the cost. Two questions, two gates — "is it
// green" is the runner's, "does the citation point at something real" is this
// file's.
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (msg, cond) => { if (cond) { pass++; console.log('  ok   ' + msg); } else { fail++; console.log('  FAIL ' + msg); } };

const ROOT = path.join(__dirname, '..');
const DOC = path.join(ROOT, 'docs', 'X-46-KABUL-MATRISI.md');

console.log('\n-- the table is there and is readable as data');
ok('the acceptance matrix document exists where the item says it does', fs.existsSync(DOC));
const doc = fs.readFileSync(DOC, 'utf8');

/**
 * A citation row is `| <n> | <claim in Turkish> | <file> | <assertion> |`.
 * The header and the `|---|` separator are skipped by the numeric test on the
 * first cell, so the two tables in the document cannot be confused with each
 * other: the gate table's first cell is a name, not a number.
 */
const rows = doc.split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('|') && l.endsWith('|'))
    .map(l => l.slice(1, -1).split('|').map(c => c.trim()))
    .filter(c => c.length === 4 && /^\d+$/.test(c[0]))
    .map(c => ({ n: Number(c[0]), item: c[1], file: c[2], claim: c[3] }));

ok('every citation row parses into four cells', rows.length > 60);

console.log('\n-- ‼️ every row of the matrix is claimed, and none of them is empty');
{
    const ids = [...new Set(rows.map(r => r.n))].sort((a, b) => a - b);
    ok('the matrix runs 1..' + ids.length + ' with no gap — a missing number is a matrix row nobody mapped',
        ids.length >= 24 && ids.every((v, i) => v === i + 1));
    ok('every matrix row carries at least one citation', ids.every(id => rows.some(r => r.n === id)));
    ok('…and no row is parked with a placeholder instead of an address',
        !rows.some(r => /^(TODO|YOK|—|-|\?)$/i.test(r.claim) || r.claim === '' || r.file === ''));
    ok('every row states what it is measuring, not only where',
        rows.every(r => r.item.length > 3));
}

console.log('\n-- ‼️ every citation resolves: the file is there and still says it');
{
    const cache = new Map();
    const read = (f) => {
        if (!cache.has(f)) {
            const p = path.join(__dirname, f);
            // an assertion is written in JS source, so `it\'s` is `it's` to a
            // reader and to this table; unescape before looking for it
            cache.set(f, fs.existsSync(p) ? fs.readFileSync(p, 'utf8').replace(/\\'/g, "'") : null);
        }
        return cache.get(f);
    };
    const missingFiles = [...new Set(rows.map(r => r.file))].filter(f => read(f) === null);
    ok('every cited test file exists' + (missingFiles.length ? ' — missing: ' + missingFiles.join(', ') : ''),
        missingFiles.length === 0);

    const broken = rows.filter(r => read(r.file) !== null && !read(r.file).includes(r.claim));
    ok('every cited assertion is still in the file it is cited from'
        + (broken.length ? ' — stale: ' + broken.map(b => `${b.file} :: ${b.claim}`).join(' | ') : ''),
        broken.length === 0);

    // ‼️ A citation that names the file but quotes something the file merely
    // mentions in a comment proves nothing. Every claim has to be an assertion
    // label or a section heading — the two things the suite actually prints.
    const notAnAssertion = rows.filter(r => {
        const src = read(r.file);
        if (src === null) { return false; }
        const at = src.indexOf(r.claim);
        const before = src.slice(Math.max(0, at - 40), at);
        return !/(ok|eq|is|has|check)\(\s*'$|console\.log\('\\n$|console\.log\('$/.test(before);
    });
    ok('…and every one of them is an assertion label or a printed heading, not prose'
        + (notAnAssertion.length ? ' — loose: ' + notAnAssertion.map(b => b.claim).join(' | ') : ''),
        notAnAssertion.length === 0);
}

console.log('\n-- the gates that are a command, not an assertion');
{
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const cited = [...doc.matchAll(/`npm run ([a-z:]+)`/g)].map(m => m[1]);
    // ‼️ Named, not counted. The three that matter are the three the item's
    // repo gate spells out: it compiles, it packages (which is where encoding,
    // the right-click catalogue and parity sit), and the artefact is opened and
    // read back. A document that quietly dropped one of them would still cite
    // "some" scripts.
    ok('the document cites compile, package and verify — the three gates the item names',
        ['compile', 'package', 'verify'].every(s => cited.includes(s)));
    const gone = [...new Set(cited)].filter(s => !pkg.scripts[s]);
    ok('every gate the document names is a script that still exists'
        + (gone.length ? ' — gone: ' + gone.join(', ') : ''),
        gone.length === 0);
    ok('…and `npm test` itself is named as the gate the citations rely on',
        /`npm test`/.test(doc) && !!pkg.scripts.test);
}

console.log('\n-- the two real disposable smokes are cited as recorded runs');
{
    const smoke = path.join(__dirname, 'smoke_mission_adaptive.mjs');
    ok('the smoke harness X-46 asked for is in the repo', fs.existsSync(smoke));
    ok('‼️ …and the document says the matrix does NOT re-run it, so nobody reads a stale pass as a fresh one',
        /yeniden çalıştırmaz/.test(doc));
    ok('…while still saying what it costs and how to run it again',
        /node test\/smoke_mission_adaptive\.mjs/.test(doc));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
