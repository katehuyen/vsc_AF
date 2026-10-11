// X-150 / X-151 — 17 DIMENSIONS x 13 DOORS = 221 OBLIGATIONS, MEASURED BY CALLING.
//
// ‼️ THE RULE THIS FILE MAKES FAIL A BUILD.
//
// "Every launch dimension is carried by every door that starts a session." That
// sentence is true, important, and for a year it lived only in prose: a
// 1.690-line SOP, a `_REF` rule, and 74 hand-written regexes. All three need a
// person to read them, and the measurement behind X-148 is what happens when one
// does not — `providerId` and `tier` reached the type and the launcher and were
// never given a box in the Console composer. NOTHING WENT RED, because a regex
// can only see the absence of something it was told to look for. It cannot look
// for a rule nobody has written yet.
//
// A matrix can. Every dimension crossed with every door is 221 cells, and EVERY
// CELL MUST HAVE A VERDICT in `launch.matrix.json`:
//
//   carried              the door demonstrably hands it on
//   exempt: <reason>     it does not apply here, and the reason is written down
//   gap: <reason>        it should and does not — counted against a budget
//
// An eighteenth dimension therefore arrives with THIRTEEN cells that have no
// verdict, and the suite is red until somebody says, per door, which of the
// three it is. The obligation is created by the dimension, not by somebody
// remembering to create it.
//
// ‼️ AND SINCE X-151 THE EVIDENCE IS A CALL, NOT A GREP.
//
// The doors are modules (`src/launch/doors/`). Each is handed EVERY dimension
// there is and asked what it hands on; a dimension that does not survive the
// call is not carried, whatever its name being present in the source might have
// suggested. That kills both halves of the old measurement's error: a door that
// passes a whole `LaunchOptions` through used to read as thirteen gaps, and a
// door that merely mentioned a dimension in a comment used to read as carrying
// it.
//
// `node test/test_launch_matrix.js --fix` reseeds from what the doors actually
// do. It never invents an `exempt` — only a door can declare one, in its own
// module, next to the code the reason is about.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST = path.join(ROOT, 'launch.matrix.json');
const FIX = process.argv.includes('--fix');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const D = require(path.join(ROOT, 'media', 'afDimensions.js'));
const { LAUNCH_DOORS, doorExemptions, FARM_RESOLVED, carries, fixtureCtx } =
    require(path.join(__dirname, 'lib_launch_doors.js'));

const DIMS = D.ids();
const DOORS = LAUNCH_DOORS.map(d => d.id);

/** The verdict the code itself states for one cell. */
function verdictFor(door, dim, carried) {
    if (carried.indexOf(dim) >= 0) { return 'carried'; }
    const why = doorExemptions(door)[dim];
    if (why) { return 'exempt: ' + why; }
    return 'gap: reaches this door and stops - nobody has said whether it should';
}

/* ---------------- the seed ---------------- */
if (FIX) {
    const cells = {};
    for (const door of LAUNCH_DOORS) {
        const carried = carries(door);
        cells[door.id] = {};
        for (const dim of DIMS) { cells[door.id][dim] = verdictFor(door, dim, carried); }
    }
    const gaps = DOORS.reduce((n, d) => n + DIMS.filter(x => /^gap:/.test(cells[d][x])).length, 0);
    fs.writeFileSync(MANIFEST, JSON.stringify({
        note: 'X-150/X-151. Every launch dimension x every launch door, measured by CALLING '
            + 'each door with every dimension set and seeing what it hands on. Each cell is '
            + 'carried, exempt:<reason> or gap:<reason>. An exemption is declared in the '
            + 'door module itself, beside the code its reason is about - never here. '
            + 'gapBudget MAY ONLY BE LOWERED: raising it means a door stopped carrying '
            + 'something, which is the failure this counts. Reseed: '
            + 'node test/test_launch_matrix.js --fix',
        gapBudget: gaps,
        wiredFloor: LAUNCH_DOORS.filter(d => d.wired).length,
        cells
    }, null, 2) + '\n', 'utf8');
    console.log(`launch.matrix.json written: ${DOORS.length} doors x ${DIMS.length} dimensions `
        + `= ${DOORS.length * DIMS.length} cells, ${gaps} gaps`);
    process.exit(0);
}

const M = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));

/* ---------------- the shape ---------------- */
ok('the matrix is 18 dimensions wide', DIMS.length === 18);
ok('…and 13 doors deep', DOORS.length === 13);
ok('‼️ …so there are 234 obligations', DIMS.length * DOORS.length === 234);
ok('every door states which surface it produces',
    LAUNCH_DOORS.every(d => ['console', 'terminal', 'either', 'task', 'headless'].indexOf(d.surface) >= 0));
ok('‼️ …and why it is a door — a row with no reason is a row nobody can judge',
    LAUNCH_DOORS.every(d => typeof d.why === 'string' && d.why.length > 40));
ok('‼️ every door can be CALLED — that is what X-151 was for',
    LAUNCH_DOORS.every(d => typeof d.collect === 'function'));
ok('…and answers with an object rather than throwing on a fixture',
    LAUNCH_DOORS.every(d => {
        try { return typeof d.collect(fixtureCtx()) === 'object'; } catch (e) { return false; }
    }));

/* ---------------- ‼️ EVERY CELL HAS A VERDICT ---------------- */
{
    const missing = [];
    for (const door of DOORS) {
        for (const dim of DIMS) { if (!(M.cells[door] || {})[dim]) { missing.push(`${door}.${dim}`); } }
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

/* ---------------- ‼️ THE MANIFEST IS WHAT THE DOORS DO ---------------- */
{
    // The heart of it: every cell is RE-MEASURED here by calling the door. The
    // manifest is a record of a measurement, not a claim standing in for one —
    // so taking `tier` out of a door goes red on the next run, and no amount of
    // editing this file can make a door look like it carries something it drops.
    const wrong = [];
    for (const door of LAUNCH_DOORS) {
        const carried = carries(door);
        for (const dim of DIMS) {
            const want = verdictFor(door, dim, carried);
            // ‼️ A MISSING CELL IS THE CASE THIS BLOCK MOST HAS TO SURVIVE — it
            // is what a new dimension looks like, and throwing here buried the
            // one line above that says which cells they are.
            const got = M.cells[door.id][dim] || '(no verdict)';
            const same = want === got
                // the reason text may be reworded without a reseed; the KIND may not
                || (want.split(':')[0] === got.split(':')[0] && want.startsWith('exempt'));
            if (!same) { wrong.push(`${door.id}.${dim}: manifest says "${got.split(':')[0]}", the door does "${want.split(':')[0]}"`); }
        }
    }
    ok('‼️ the manifest still matches what the doors ACTUALLY do'
        + (wrong.length ? `\n      ${wrong.slice(0, 5).join('\n      ')}` : ''), wrong.length === 0);
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
    // ‼️ AND THE REASON LIVES IN THE DOOR, NOT HERE. An exemption written into
    // this JSON would be a reason with no code beside it — the exact distance
    // that let a 1.690-line document drift away from what was running.
    ok('every exemption is declared by a door module, not by the manifest',
        LAUNCH_DOORS.every(d => Object.values(d.exempt ?? {}).every(r => typeof r === 'string' && r.length > 20)));
    // ‼️ THE THREE FARM-RESOLVED DIMENSIONS ARE NEVER A GAP — but they are not
    // always an exemption either, and the difference is worth keeping. A door
    // that hands the WHOLE setup through (the launcher, the surface picker)
    // carries them like everything else, which is fine: it is passing on what it
    // was given, not resolving anything. What must never happen is one of them
    // being counted as missing, because nobody was ever going to ask for it at a
    // door — that would be a budget full of work that must not be done.
    ok('…and a farm-resolved dimension is never counted as a gap at any door',
        Object.keys(FARM_RESOLVED).every(dim =>
            DOORS.every(door => !/^gap:/.test(M.cells[door][dim]))));
}

/* ---------------- ‼️ THE BUDGET MAY ONLY BE LOWERED ---------------- */
{
    let gaps = 0;
    const byDoor = {};
    for (const door of DOORS) {
        byDoor[door] = DIMS.filter(x => /^gap:/.test(M.cells[door][x]));
        gaps += byDoor[door].length;
    }
    ok(`‼️ the gap count is the budget — raising it means a door stopped carrying something `
        + `(gaps ${gaps}, budget ${M.gapBudget})`, gaps === M.gapBudget);
    ok('…and the budget is a real number somebody can watch fall', typeof M.gapBudget === 'number');
    const wired = LAUNCH_DOORS.filter(d => d.wired);
    console.log(`  matrix: ${DIMS.length}x${DOORS.length}=${DIMS.length * DOORS.length} cells · `
        + `${gaps} gaps · ${wired.length}/${DOORS.length} doors wired`);
    for (const door of DOORS) {
        if (byDoor[door].length) { console.log(`    ${door}: ${byDoor[door].join(', ')}`); }
    }

    /* ‼️ AND A DOOR THAT ONLY DESCRIBES A CALL SITE IS COUNTED AS SUCH.
     *
     * This is the trap the whole family exists to avoid, arriving one level up:
     * a door module that MODELS what extension.ts does, rather than being what
     * extension.ts calls, is a second statement of the same rule and is free to
     * drift from it. So `wired` is a fact on the door, the count may only rise,
     * and the remainder is exactly the work X-151 has left. */
    ok(`‼️ the wired-door count may only rise (wired ${wired.length}, floor ${M.wiredFloor})`,
        wired.length >= M.wiredFloor);
    // …itself, or through a module the extension imports (X-552: the tree menu's answer becomes what the
    // Console is told in src/panels/consoleForAgent.ts, for the PC's command and a phone's view alike)
    const SRC = path.join(ROOT, 'src');
    const extSrc = fs.readFileSync(path.join(SRC, 'extension.ts'), 'utf8');
    const modules = (function walk(d) {
        return fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory()
            ? (path.join(d, e.name) === path.join(SRC, 'launch', 'doors') ? [] : walk(path.join(d, e.name)))
            : (e.name.endsWith('.ts') && e.name !== 'extension.ts' ? [path.join(d, e.name)] : []));
    })(SRC);
    const through = id => modules
        .filter(f => new RegExp("from '(?:\\.\\./)+launch/doors/" + id + "'").test(fs.readFileSync(f, 'utf8')))
        .some(f => extSrc.includes("from './" + path.relative(SRC, f).replace(/\\/g, '/').replace(/\.ts$/, '') + "'"));
    ok('…and a wired door is really imported by the extension — itself, or by a module it imports — not just marked',
        wired.every(d => new RegExp("from './launch/doors/" + d.id + "'").test(extSrc) || through(d.id)));
    ok('(the test can tell: a door nobody imports is caught)', !through('noSuchDoor'));
    ok('…and the registry is populated where the window starts, once',
        /registerLaunchDoors\(\);/.test(fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8')));
}

/* ---------------- ‼️ WHAT THE OLD 74 REGEXES USED TO SAY ---------------- */
{
    // These were the guarantees `test_launch_parity.js` spent 74 regular
    // expressions on, and they are stated here as facts about the doors instead
    // — which is both shorter and stronger, because a rename cannot break them
    // and a whole-object pass-through cannot hide from them.
    const carriedBy = id => carries(LAUNCH_DOORS.find(d => d.id === id));
    const has = (id, dim) => carriedBy(id).indexOf(dim) >= 0;

    ok('‼️ the launcher carries every dimension there is — it is the door that asks them all',
        DIMS.filter(d => !Object.keys(FARM_RESOLVED).includes(d)).every(d => has('launcher', d)));
    ok('‼️ the surface picker drops nothing on its way past — it decides WHERE, not WHAT',
        DIMS.filter(d => !Object.keys(FARM_RESOLVED).includes(d)).every(d => has('surfacePick', d)));
    ok('K-34 — the discipline reaches the doors that offer it',
        has('launcher', 'superpowers') && has('composer', 'superpowers') && has('task', 'superpowers'));
    ok('X-103 — the route reaches the composer, which is what X-105 was about',
        has('composer', 'providerId') && has('composer', 'tier'));
    ok('X-106 — and an automation carries it too, or a nightly job takes whatever was standing',
        has('automation', 'providerId') && has('automation', 'tier'));
    /**
     * ‼️ X-169 — THE ACCOUNT, WHICH IS THE FIRST DIMENSION THAT IS A STATE.
     *
     * It is not remembered, so the S-34 layer cannot carry it the way it carries
     * the model — every door resolves it through the extension's own resolver
     * instead and hands it on settled. A door that said nothing would leave
     * "whose plan pays" to be answered behind its back at the spawn, which is
     * the shape of every defect this folder is named after.
     */
    /**
     * ‼️ X-225 — AND `mission` IS ON THIS LIST NOW.
     *
     * It used to be on the line below, exempt, with a reason written on the
     * door: "a mission runs for hours, so an account frozen into it would pin
     * round nine to a plan round two exhausted." That is a real risk answered by
     * taking the decision away from the user — while the model, the effort and
     * the permission mode beside it were overridable both mission-wide and per
     * member on the very same ladder. And the exemption did not buy what it
     * promised: the planner spawned with no environment at all, so "each
     * delegate resolves the account at its own spawn" had no code behind it.
     */
    /**
     * ‼️ X-253 — AND `profile` IS ON THIS LIST NOW, TOO, which is the last door
     * that was not.
     *
     * Its exemption said "a profile is a SETUP and an account is a STATE", and
     * the risk it named was real: a saved launch pinned to a plan that may be
     * exhausted — or deleted — by the time anybody presses it. The user's
     * decision was the soft form, and the risk is answered by name instead of
     * by dropping the dimension: `profileAccountGone` empties the box and says
     * which sign-in went, `matchProfile` treats a stored one as a seed the
     * reader may move, and a profile that stores none still launches on the
     * resolved account exactly as it did before.
     */
    ok('‼️ X-169, X-253 — the sign-in reaches EVERY door now',
        ['composer', 'treeRow', 'treeMenu', 'launcher', 'surfacePick', 'projects',
            'webviews', 'palette', 'bridge', 'task', 'automation', 'mission', 'profile']
            .every(d => has(d, 'account')));
    ok('‼️ …and no door claims an exemption from it any more — an exemption left '
        + 'standing over a dimension the door DOES carry is a reason nobody reads again',
        LAUNCH_DOORS.every(d => !doorExemptions(d).account));
    ok('‼️ the bridge collects from its ARGUMENTS and does not inherit — the one asymmetry',
        LAUNCH_DOORS.find(d => d.id === 'bridge').collect({
            agentId: 'a', seed: () => ({ model: 'from-the-record' }), picked: {}
        }).model === undefined);
    ok('…while every panel door DOES inherit, which is S-34',
        LAUNCH_DOORS.find(d => d.id === 'webviews').collect({
            agentId: 'a', seed: () => ({ model: 'from-the-record' })
        }).model === 'from-the-record');
}

/* ---------------- ‼️ X-169 — WHAT "RESOLVED" MEANS AT A DOOR ---------------- */
{
    // The matrix above counts WHETHER a door carries the account. This is the
    // other half and the one a reseed cannot notice: WHICH account it carries.
    // All three answers are load-bearing, and the third is the one that looks
    // like a detail — a door handing on `''` would be a door claiming to have
    // answered "the main sign-in" when nobody answered anything, and every
    // surface between it and the spawn would repeat the claim.
    const door = LAUNCH_DOORS.find(d => d.id === 'composer');
    const ctx = (stated, standing) => ({
        agentId: 'a',
        seed: (_id, o) => ({ ...(o || {}) }),
        // the extension's own `resolveAccount(stated, engine, active)`, in order
        accountFor: (_engine, said) => String(said || '').trim() || (standing || ''),
        picked: stated === undefined ? {} : { account: stated }
    });
    ok('‼️ X-169 — an account stated AT the door wins over the standing one',
        door.collect(ctx('work-1', 'standing')).account === 'work-1');
    ok('…and where the door states none, the standing choice answers',
        door.collect(ctx(undefined, 'standing')).account === 'standing');
    ok('‼️ …and where there is neither, the key is ABSENT rather than empty',
        !('account' in door.collect(ctx(undefined, ''))));
    ok('‼️ a door handed no resolver at all is unchanged, byte for byte — which is '
        + 'every caller written before this dimension existed',
        !('account' in door.collect({ agentId: 'a', seed: (_id, o) => ({ ...(o || {}) }) })));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
