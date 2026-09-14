// X-292 — the repair journal: a repair is an event, and the cause is DERIVED
// from the journal rather than declared in the code. Fixtures live in
// os.tmpdir() with an af- prefix (a throwing test never reaches its cleanup and
// the leftover walks into the next `git add -A`).
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('  FAIL ' + name); } };

const sr = require(path.join(ROOT, 'out/core/slotRepairs.js'));
const { adapterFor, ENGINE_AUTH_ADAPTERS } = require(path.join(ROOT, 'out/core/engineAccounts.js'));

// ---------- 1. the engine names its own housekeeping stamp ----------
{
    ok('claude names the file its own housekeeping stamps', adapterFor('claude').housekeeping === '.last-cleanup');
    // ‼️ It is EVIDENCE, not a clause. An engine with nothing to declare leaves
    // it out, and no contract row may ever be derived from it.
    ok('an engine that stamps nothing simply has none',
        ENGINE_AUTH_ADAPTERS.some(a => !a.housekeeping));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-repairs-'));
    try {
        ok('no stamp file reads as no evidence', sr.housekeepingAt(fs, tmp, '.last-cleanup') === undefined);
        ok('an engine with no stamp is never asked for one', sr.housekeepingAt(fs, tmp, undefined) === undefined);
        fs.writeFileSync(path.join(tmp, '.last-cleanup'), 'x', 'utf8');
        const at = sr.housekeepingAt(fs, tmp, '.last-cleanup');
        ok('a stamp on disk reads as its mtime', typeof at === 'number' && at > 0);
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// ---------- 2. only a repair that RAN is an event ----------
{
    const after = {
        complete: true, gaps: [],
        rows: [
            { id: 'own:.credentials.json', kind: 'own', owner: 'account', ok: true, detail: 'present', repairable: false },
            { id: 'link:todos', kind: 'link', owner: 'fleet', ok: true, repairable: true, detail: 'todos -> pool', wrote: true, was: 'todos missing - no link to the pool' },
            // the live case: the clause above put this one back too, so this
            // repair call wrote nothing and the junction is on disk and fine
            { id: 'link:shell-snapshots', kind: 'link', owner: 'fleet', ok: true, repairable: true, detail: 'shell-snapshots -> pool', wrote: false, was: 'shell-snapshots missing - no link to the pool' },
            { id: 'link:skills', kind: 'link', owner: 'fleet', ok: false, repairable: true, detail: 'skills link is broken', wrote: false, was: 'skills link is broken', error: 'link repair failed' }
        ]
    };
    const ev = sr.repairEvents(after, { slotId: 's1', engine: 'claude', gate: 'start', at: 1000, keptAt: 500 });
    ok('a clause whose repair never ran is not an event', ev.length === 3 && !ev.some(e => e.clause.startsWith('own:')));
    // ‼️ MEASURED THE FIRST HOUR THIS JOURNAL WAS LIVE. One repair primitive
    // puts back ALL of an engine's shared paths at once, so the FIRST failing
    // link clause writes every junction and the next one finds nothing left to
    // do — `wrote: false` on a clause that is on disk and fine. Reporting that
    // as a failure is an instrument crying wolf, which is worse than none. So
    // `fixed` is the reading AFTER the pass, not whether this call wrote bytes.
    const sibling = ev.find(e => e.clause === 'link:shell-snapshots');
    ok('‼️ X-292 — a clause a SIBLING\'s repair put right is NOT reported as a failure',
        sibling.fixed === true && !sibling.error);
    // ‼️ THE WHOLE POINT. After the repair the reading says the slot is well;
    // record that sentence and the journal explains nothing.
    ok('‼️ X-292 — the row carries the reading it was repaired FROM, not the one after',
        ev[0].was === 'todos missing - no link to the pool' && ev[0].was !== ev[0].detail);
    const reallyFailed = ev.find(e => e.clause === 'link:skills');
    ok('…and a repair that really failed is still an event, and says so',
        reallyFailed.fixed === false && reallyFailed.error === 'link repair failed');
    ok('the gate and the stamp travel on the row', ev[0].gate === 'start' && ev[0].keptAt === 500);
    const none = sr.repairEvents({ complete: true, gaps: [], rows: [{ id: 'link:todos', ok: true, detail: 'ok' }] },
        { slotId: 's1', engine: 'claude', gate: 'start', at: 1 });
    ok('a slot that was already whole says nothing', none.length === 0);
}

// ---------- 3. the correlation is DERIVED, never declared ----------
{
    const mk = (at, keptAt, slotId = 's1', clause = 'link:todos') =>
        ({ at, slotId, engine: 'claude', gate: 'start', clause, was: 'missing', fixed: true, keptAt });
    // The engine's housekeeping moved before every repair after the first.
    const engineDoesIt = [mk(10, 5), mk(20, 15), mk(30, 25), mk(40, 35)];
    const p = sr.repairPattern(engineDoesIt);
    ok('one row per clause', p.length === 1 && p[0].clause === 'link:todos' && p[0].count === 4);
    // ‼️ THE DENOMINATOR IS STATED. The first repair on a slot has nothing to be
    // compared with, so it is not counted either way - a figure whose base is
    // hidden is the kind of measurement this file exists to replace.
    ok('‼️ the first repair on a slot is not compared with anything', p[0].compared === 3);
    ok('‼️ X-292 — afterHousekeeping === compared is the engine doing it, with nothing hard-coded',
        p[0].afterHousekeeping === 3);
    // A stamp that never moves is the counter-case: the same repairs, the same
    // count, and the correlation reads ZERO. This is what makes the figure mean
    // something - remove the comparison and both series would read alike.
    const stampNeverMoves = [mk(10, 5), mk(20, 5), mk(30, 5), mk(40, 5)];
    const q = sr.repairPattern(stampNeverMoves);
    ok('‼️ …and a stamp that never moved reads ZERO on the same four repairs',
        q[0].count === 4 && q[0].compared === 3 && q[0].afterHousekeeping === 0);
    const noStamp = sr.repairPattern([mk(10, undefined), mk(20, undefined)]);
    ok('an engine that stamps nothing is counted but never attributed',
        noStamp[0].count === 2 && noStamp[0].afterHousekeeping === 0);
    // Two slots do not contaminate each other's comparison.
    const twoSlots = sr.repairPattern([mk(10, 5, 'a'), mk(20, 15, 'b'), mk(30, 25, 'a')]);
    ok('each slot is compared against ITSELF', twoSlots[0].compared === 1 && twoSlots[0].afterHousekeeping === 1);
    ok('the slots it happened on are named', twoSlots[0].slots.sort().join(',') === 'a,b');
    const many = sr.repairPattern([mk(1, 0, 'a', 'link:todos'), mk(2, 0, 'a', 'link:todos'), mk(3, 0, 'a', 'hooks')]);
    ok('the busiest clause comes first', many[0].clause === 'link:todos' && many[1].clause === 'hooks');
}

// ---------- 4. the journal on disk ----------
{
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-repairs-'));
    try {
        const file = path.join(tmp, 'nested', 'slot-repairs.json');
        const j = new sr.SlotRepairJournal(file, fs, 4);
        // ‼️ The common case is a whole fleet with nothing to repair. It must
        // cost no write at all, or every start rewrites a file to say nothing.
        j.record([]);
        ok('‼️ nothing to say costs no file', !fs.existsSync(file));
        const mk = at => ({ at, slotId: 's1', engine: 'claude', gate: 'start', clause: 'link:todos', was: 'missing', fixed: true });
        j.record([mk(1), mk(2)]);
        ok('the journal creates its folder and writes', fs.existsSync(file));
        ok('and reads back what it wrote', j.all().length === 2);
        const re = new sr.SlotRepairJournal(file, fs, 4);
        ok('a fresh reader sees the same rows', re.all().length === 2 && re.all()[0].at === 1);
        j.record([mk(3), mk(4), mk(5)]);
        ok('the ring is bounded and keeps the NEWEST',
            j.all().length === 4 && j.all()[0].at === 2 && j.all()[3].at === 5);
        // ‼️ Evidence about the machine, not the user's own work: an unreadable
        // file is set aside and measurement restarts, rather than freezing every
        // write until a person deals with it.
        fs.writeFileSync(file, '{not json', 'utf8');
        const broken = new sr.SlotRepairJournal(file, fs, 4);
        ok('a corrupt journal reads as empty', broken.all().length === 0);
        ok('…and says so out loud', /unreadable/.test(broken.degraded || ''));
        ok('…and the bytes are kept beside it, never deleted',
            fs.readdirSync(path.dirname(file)).some(f => /\.corrupt-/.test(f)));
        broken.record([mk(9)]);
        ok('…and measurement starts again', broken.all().length === 1);
        const future = path.join(tmp, 'future.json');
        fs.writeFileSync(future, JSON.stringify({ v: 99, events: [mk(1)] }), 'utf8');
        const f2 = new sr.SlotRepairJournal(future, fs, 4);
        ok('a file from a newer build is read as far as it is understood, and says so',
            f2.all().length === 1 && /newer version/.test(f2.degraded || ''));
        const junk = path.join(tmp, 'junk.json');
        fs.writeFileSync(junk, JSON.stringify({ v: 1, events: [{ nope: true }, mk(7)] }), 'utf8');
        ok('a row that is not an event is dropped, not trusted',
            new sr.SlotRepairJournal(junk, fs, 4).all().length === 1);
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

/* =========================================================================
 * ‼️ X-301 — A GATE THAT MAY NOT FAIL ITS CALLER MAY NOT FAIL SILENTLY EITHER.
 *
 * Measured 2026-09-14: two slots sat with `link:todos` and
 * `link:shell-snapshots` missing across a night of launches; the repair
 * primitive was proved to work when called by hand (`accounts.complete
 * dryRun:false` restored both and journalled them); and the journal held not
 * one row to say the launch gate had ever tried. All four gates caught
 * everything and said nothing, so a swallowed throw and a gate that never ran
 * looked identical from outside — which is exactly where a person stands when
 * the invariant is quietly gone.
 *
 * Read out of the source, because the gates live inside `activate()` and the
 * thing being pinned is that NONE of them keeps a bare catch.
 * ========================================================================= */
{
    const fs2 = require('fs');
    const ext = fs2.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    ok('‼️ every contract gate goes through the one wrapper',
        /const runContractGate = \(gate: string, slotId\?: string\): void => \{/.test(ext));
    for (const [gate, call] of [
        ['start', /setTimeout\(\(\) => runContractGate\('start'\), 0\);/],
        ['watch', /runContractGate\('watch'\);/],
        ['capture', /runContractGate\('capture', slot\.id\);/],
        ['launch', /if \(slot\) \{ runContractGate\('launch', slot\.id\); \}/]
    ]) {
        ok(`…including the ${gate} gate`, call.test(ext));
    }
    // ‼️ THE POINT OF THE WRAPPER, not merely that it exists: a bare
    // `catch { }` around the contract anywhere is the defect coming back.
    const bare = ext.match(/completeSlots\(false[^)]*\); \} catch \{ \/\*[^*]*\*\/ \}/g) || [];
    ok('‼️ …and no gate keeps a bare catch around the contract any more',
        bare.length === 0);
    ok('‼️ the swallowed throw lands in the instrument that already exists',
        /repairJournal\.record\(\[\{[\s\S]{0,320}clause: 'contract',/.test(ext));
    ok('…saying the throw came BEFORE any clause was read, which is a different '
        + 'fact from a clause whose own repair failed',
        /was: 'the gate threw before any clause was repaired',/.test(ext)
        && /fixed: false,/.test(ext));
    ok('…and the journal is still not allowed to fail the gate it reports on',
        /catch \{ \/\* a journal never fails a gate either \*\/ \}/.test(ext));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
