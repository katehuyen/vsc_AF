// ‼️ X-46 (X-32) — A CONTROL THAT STOPS AT THE PARENT IS NOT A CONTROL.
//
// A child objective is a real run: its own lead, its own delegations, its own
// money. So the three commands a person gives a parent — pause, resume, cancel
// — are only true if they reach every run underneath it. The acceptance matrix
// asks for "cancel propagation" as one line; this file is what that line
// points at.
//
// The propagation lives in `extension.ts`, inside the activation closure, so
// there is nothing to `require`. That is not a reason to leave it unmeasured:
// the invariants here are STRUCTURAL and a source read is the honest way to
// pin them — the same way `test_mission_council.js` pins the one cast-name
// resolver. What is checked is not that some words are present, but that:
//
//   * the descent happens BEFORE the parent's own teardown, or a grandchild is
//     orphaned when the middle run settles as we go;
//   * a run never descends into itself;
//   * and — the one this file was written for — EVERY surface that pauses or
//     un-pauses goes through the cascade. Two of them did not, and a parent
//     resumed from the Bridge or from the page came back alive with its
//     children still parked, waiting on work that would never move again.
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (msg, cond) => { if (cond) { pass++; console.log('  ok   ' + msg); } else { fail++; console.log('  FAIL ' + msg); } };

const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');

/** The body of a `const <name> = ` declaration, up to the next top-level one. */
function decl(name) {
    const at = ext.indexOf(`const ${name} = `);
    if (at < 0) { return ''; }
    const end = ext.indexOf('\n    };', at);
    return end < 0 ? ext.slice(at) : ext.slice(at, end);
}

// ============================================ 1. a cancel travels down first
console.log('\n-- ‼️ M-18 a cancel reaches every descendant, before the parent tears down');
{
    const body = decl('cancelMission');
    ok('there is exactly one cancel implementation, so no surface can have a shallower one',
        (ext.split('const cancelMission = ').length - 1) === 1);
    ok('it recurses into its own children by parentRunId',
        /child\.parentRunId === runId/.test(body) && /cancelMission\(child\.id\)/.test(body));
    ok('‼️ …depth-first BEFORE its own engine is stopped, or a grandchild is orphaned',
        body.indexOf('cancelMission(child.id)') < body.indexOf('missionEngines.get(runId)?.cancel()'));
    ok('a run is never its own child, however the store is written',
        /child\.id !== runId/.test(body));
    ok('…and a child that already ended is not cancelled again',
        /child\.status !== 'done' && child\.status !== 'failed' && child\.status !== 'cancelled'/.test(body));
    ok('the delegated TASKS of the run go too — the money is in the processes',
        /t\.missionId === runId/.test(body) && /taskManager\.cancelTask\(t\)/.test(body));
    ok('‼️ X-91 a run nobody is driving still gets a stated ending, not a bare status',
        /!missionEngines\.has\(runId\)/.test(body) && /cancelledResult\(/.test(body)
        && /run\.status = 'cancelled'/.test(body));
}

// ============================================ 2. a ceiling reaches the child too
console.log('\n-- ‼️ X-46b the ceiling reaches the processes, and stops narrower than a cancel');
{
    const body = decl('missionDepsFor');
    ok('cancelWave stops a child mission run through the same cancel',
        /step\.missionRunId.*cancelMission\(step\.missionRunId\)/.test(body));
    ok('…and a workflow step through its own queued and running tasks',
        /t\.workflowRunId === step\.workflowRunId/.test(body));
    ok('…but it does NOT stop this run\'s engine — the run has an honest ending to write',
        !/missionEngines\.get\(run\.id\)\?\.cancel\(\)/.test(body));
}

// ============================================ 3. pause and un-pause are symmetric
console.log('\n-- ‼️ X-46 a pause that only descends is a deadlock with a green status');
{
    const body = decl('pauseMissionChildren');
    ok('one cascade serves both directions, so they cannot drift apart',
        /if \(pause\) \{ e\?\.pause\(\); \} else \{ e\?\.unpause\(\); \}/.test(body));
    ok('…and it recurses, so a grandchild is reached as well',
        /pauseMissionChildren\(child\.id, pause\)/.test(body));
    ok('descendants only — a child never pauses the parent that ordered it',
        /child\.parentRunId !== runId \|\| child\.id === runId/.test(body));

    // ‼️ THE REGRESSION THIS FILE EXISTS FOR, and it is measured per SITE
    // rather than counted. A count passes with the bug in place — there were
    // more cascade calls than surfaces the whole time, and two of the surfaces
    // still had none. So each call site is located and the text just above it
    // is read: a new Pause/Resume button added without the cascade is a new
    // deadlock, and this is what refuses it.
    const at = decl('pauseMissionChildren');
    const sites = (re) => [...ext.matchAll(re)]
        .map(m => m.index)
        // the two inside the cascade itself are the implementation, not a surface
        .filter(i => i < ext.indexOf(at) || i > ext.indexOf(at) + at.length);
    const cascaded = (i) => /pauseMissionChildren\(/.test(ext.slice(Math.max(0, i - 400), i));
    const pauseSites = sites(/\.pause\(\)/g);
    const unpauseSites = sites(/\.unpause\(\)/g);
    ok('every surface that parks a mission engine descends first — all ' + pauseSites.length + ' of them',
        pauseSites.length >= 2 && pauseSites.every(cascaded));
    ok('‼️ …and so does every surface that un-parks one — all ' + unpauseSites.length + ' of them',
        unpauseSites.length >= 3 && unpauseSites.every(cascaded));
    ok('‼️ the Bridge resume un-parks the descendants before it un-pauses the lead',
        /pauseMissionChildren\(runId, false\);\s*\n\s*engine\.unpause\(\);/.test(ext));
    ok('‼️ …and so does the page\'s Resume button',
        /pauseMissionChildren\(runId, false\);\s*\n\s*missionEngines\.get\(runId\)\?\.unpause\(\);/.test(ext));
    ok('the tree command toggles the cascade with the same flag it toggles the engine',
        /pauseMissionChildren\(run\.id, !run\.pausePending\);/.test(ext));
    ok('…and the Bridge pause descends before it parks the lead',
        /pauseMissionChildren\(runId, true\);\s*\n\s*if \(engine\) \{ engine\.pause\(\); \}/.test(ext));
}

// ============================================ 4. the tree it walks is real
console.log('\n-- the parent link is written when the child is created, and read back up');
{
    ok('a child run records who ordered it',
        /parentRunId: run\.id,/.test(ext));
    ok('the walk upward is capped, so a corrupted chain cannot spin',
        /for \(let i = 0; i < 16 && cur\.parentRunId; i\+\+\)/.test(ext));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
