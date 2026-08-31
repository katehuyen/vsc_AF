// X-150 — 16 DIMENSIONS x 13 DOORS = 208 OBLIGATIONS, COUNTED.
//
// ‼️ THE RULE THIS FILE MAKES FAIL A BUILD.
//
// "Every launch dimension is carried by every door that starts a session." That
// sentence is true, important, and until now it lived only in prose: a
// 1.690-line SOP, a `_REF` rule, and 74 hand-written regexes. All three need a
// person to read them, and the measurement behind X-148 is what happens when one
// does not — `providerId` and `tier` reached the type and the launcher and were
// simply never given a box in the Console composer. NOTHING WENT RED, because a
// regex can only see the absence of something it was told to look for. It cannot
// look for a rule nobody has written yet.
//
// A matrix can. Every dimension crossed with every door is 208 cells, and EVERY
// CELL MUST HAVE A VERDICT in `launch.matrix.json`:
//
//   carried              the door demonstrably handles it
//   exempt: <reason>     it does not apply here, and the reason is written down
//   gap: <reason>        it should and does not - counted against a budget
//
// So a seventeenth dimension arrives with THIRTEEN cells that have no verdict,
// and the suite is red until somebody says, for each door, which of the three it
// is. That is the whole item: the obligation is created by the dimension, not by
// somebody remembering to create it.
//
// ‼️ WHAT IS HONEST ABOUT THE EVIDENCE, AND WHAT IS NOT YET.
//
// Most doors cannot be CALLED with a fixture and asked what they collected —
// they live inside quickpick loops and message handlers in a 30.476-line file,
// which is the finding that put X-151 on the board. Their cells are therefore
// DECLARED, and they are declared as gaps: `door not addressable yet` is a
// count, not an excuse, and X-151's acceptance is that count reaching zero.
//
// The doors that ARE addressable get a live check: a cell declared `carried` on
// one of them is re-measured on every run, so removing a dimension from
// `runLauncher` goes red today. That is the part of the matrix that already
// bites, and it grows as X-151 lands rather than being rewritten.
//
// `node test/test_launch_matrix.js --fix` reseeds the manifest from what is
// observable. It never invents an `exempt` — only a person can say a dimension
// does not apply to a door, and saying it requires writing why.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST = path.join(ROOT, 'launch.matrix.json');
const FIX = process.argv.includes('--fix');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const D = require(path.join(ROOT, 'media', 'afDimensions.js'));
const { LAUNCH_DOORS, sourceOf, addressable } = require(path.join(__dirname, 'lib_launch_doors.js'));

const DIMS = D.ids();
const DOORS = LAUNCH_DOORS.map(d => d.id);

/** What can be SEEN of a cell today. `null` = the door cannot be looked at. */
function observe(door, dim) {
    const src = sourceOf(door);
    if (src === null) { return null; }
    return new RegExp('\\b' + dim + '\\b').test(src);
}

/* ---------------- the seed ---------------- */
if (FIX) {
    const cells = {};
    const prev = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : { cells: {} };
    for (const door of LAUNCH_DOORS) {
        cells[door.id] = {};
        for (const dim of DIMS) {
            // ‼️ A HUMAN VERDICT IS NEVER OVERWRITTEN. An `exempt` is somebody's
            // stated judgement that a dimension does not apply to a door, and a
            // tool that re-derives it every run would be a tool that quietly
            // deletes the reasoning.
            const was = (prev.cells[door.id] || {})[dim];
            if (was && /^exempt:/.test(was)) { cells[door.id][dim] = was; continue; }
            const seen = observe(door, dim);
            cells[door.id][dim] = seen === null ? 'gap: door not addressable yet (X-151)'
                : seen ? 'carried' : 'gap: not observed at this door';
        }
    }
    const gaps = DOORS.reduce((n, d) => n + DIMS.filter(x => /^gap:/.test(cells[d][x])).length, 0);
    fs.writeFileSync(MANIFEST, JSON.stringify({
        note: 'X-150. Every launch dimension x every launch door. Each cell is carried, '
            + 'exempt:<reason> or gap:<reason>. gapBudget MAY ONLY BE LOWERED - raising it '
            + 'means a door stopped carrying something, which is the failure this counts. '
            + 'Reseed the observable half with: node test/test_launch_matrix.js --fix',
        gapBudget: gaps,
        cells
    }, null, 2) + '\n', 'utf8');
    console.log(`launch.matrix.json written: ${DOORS.length} doors x ${DIMS.length} dimensions `
        + `= ${DOORS.length * DIMS.length} cells, ${gaps} gaps`);
    process.exit(0);
}

const M = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));

/* ---------------- the shape ---------------- */
ok('the matrix is 16 dimensions wide', DIMS.length === 16);
ok('…and 13 doors deep', DOORS.length === 13);
ok('‼️ …so there are 208 obligations', DIMS.length * DOORS.length === 208);
ok('every door states which surface it produces',
    LAUNCH_DOORS.every(d => ['console', 'terminal', 'either', 'task', 'headless'].indexOf(d.surface) >= 0));
ok('‼️ …and why it is a door — a row with no reason is a row nobody can judge',
    LAUNCH_DOORS.every(d => typeof d.why === 'string' && d.why.length > 40));

/* ---------------- ‼️ EVERY CELL HAS A VERDICT ---------------- */
{
    const missing = [];
    for (const door of DOORS) {
        for (const dim of DIMS) {
            const v = (M.cells[door] || {})[dim];
            if (!v) { missing.push(`${door}.${dim}`); }
        }
    }
    ok('‼️ EVERY dimension has a verdict at EVERY door — a new one arrives with 13 empty cells'
        + (missing.length ? ` (missing: ${missing.slice(0, 6).join(', ')}…)` : ''),
        missing.length === 0);

    const strayDoor = Object.keys(M.cells).filter(d => DOORS.indexOf(d) < 0);
    ok('…and no verdict describes a door that no longer exists' + (strayDoor.length ? ` (${strayDoor})` : ''),
        strayDoor.length === 0);
    const strayDim = [];
    for (const door of DOORS) {
        Object.keys(M.cells[door] || {}).forEach(k => { if (DIMS.indexOf(k) < 0) { strayDim.push(`${door}.${k}`); } });
    }
    ok('…nor a dimension that no longer exists' + (strayDim.length ? ` (${strayDim})` : ''),
        strayDim.length === 0);
}

/* ---------------- every excuse is written down ---------------- */
{
    const bare = [];
    for (const door of DOORS) {
        for (const dim of DIMS) {
            const v = M.cells[door][dim] || '';
            if (v === 'carried') { continue; }
            if (!/^(exempt|gap): .{6,}/.test(v)) { bare.push(`${door}.${dim}=${v}`); }
        }
    }
    ok('‼️ an exemption and a gap each carry a reason, or they are just a word that says no'
        + (bare.length ? ` (${bare.slice(0, 4).join(', ')})` : ''), bare.length === 0);
    const known = [];
    for (const door of DOORS) {
        for (const dim of DIMS) {
            const v = M.cells[door][dim];
            if (['carried'].indexOf(v) < 0 && !/^(exempt|gap):/.test(v)) { known.push(`${door}.${dim}`); }
        }
    }
    ok('…and no cell holds a verdict that is not one of the three', known.length === 0);
}

/* ---------------- ‼️ THE BUDGET MAY ONLY BE LOWERED ---------------- */
{
    let gaps = 0;
    for (const door of DOORS) { for (const dim of DIMS) { if (/^gap:/.test(M.cells[door][dim])) { gaps++; } } }
    ok(`‼️ the gap count is the budget — raising it means a door stopped carrying something `
        + `(gaps ${gaps}, budget ${M.gapBudget})`, gaps === M.gapBudget);
    ok('…and the budget is a real number somebody can watch fall', typeof M.gapBudget === 'number');
    // The count X-151 exists to drive down: doors nothing can point at.
    const blind = LAUNCH_DOORS.filter(d => !addressable(d));
    console.log(`  matrix: ${DIMS.length}x${DOORS.length}=${DIMS.length * DOORS.length} cells · `
        + `${gaps} gaps · ${blind.length}/${DOORS.length} doors not addressable yet (X-151)`);
    ok('the doors that cannot be pointed at are counted rather than assumed fine',
        blind.every(d => DIMS.every(x => /^(gap|exempt):/.test(M.cells[d.id][x]))));
}

/* ---------------- ‼️ THE HALF THAT ALREADY BITES ---------------- */
{
    // A cell declared `carried` on a door that CAN be looked at is re-measured
    // every run. This is what stops the manifest becoming another document:
    // take `tier` out of `runLauncher` and this goes red today, without waiting
    // for X-151 to make the door callable.
    const broke = [];
    for (const door of LAUNCH_DOORS.filter(addressable)) {
        for (const dim of DIMS) {
            if (M.cells[door.id][dim] !== 'carried') { continue; }
            if (!observe(door, dim)) { broke.push(`${door.id}.${dim}`); }
        }
    }
    ok('‼️ a dimension declared carried at an addressable door is still carried there'
        + (broke.length ? ` (lost: ${broke.join(', ')})` : ''), broke.length === 0);

    const anchored = LAUNCH_DOORS.filter(d => d.anchor);
    ok('every named anchor still resolves — a renamed door is a door nothing is watching',
        anchored.every(addressable));
    ok('…and at least the launcher is one of them, because it is the door that '
        + 'has always had to know the whole list',
        addressable(LAUNCH_DOORS.find(d => d.id === 'launcher')));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
