// Atomic writer under generated fault sequences (property-based fault injection).
//
// The hand-written cases cover one fault at a time. Here every step of the write
// (mkdir, temp write, each rename attempt) fails or succeeds by a generated plan,
// and the promises must hold for every combination.
'use strict';
const path = require('path');
const fc = require('fast-check');

let pass = 0, fail = 0;
const ROOT = process.env.AF_ROOT || path.join(__dirname, '..');
const A = require(path.join(ROOT, 'out', 'core', 'atomicFile.js'));
const RUNS = Number(process.env.PROP_RUNS || 1000);

function prop(name, arb, pred) {
    const r = fc.check(fc.property(arb, pred), { numRuns: RUNS });
    if (!r.failed) { pass++; return; }
    fail++;
    console.log('  FAIL ' + name);
    console.log('    counterexample: ' + JSON.stringify(r.counterexample).slice(0, 1200));
    if (r.errorInstance) { console.log('    error: ' + String(r.errorInstance.stack || r.errorInstance).split('\n').slice(0, 3).join(' | ')); }
}

const FILE = 'D:/v/Backlog.md';
const TMP = FILE + '.af.tmp';
const errno = code => Object.assign(new Error(code + ': simulated'), { code });
const fault = fc.constantFrom(null, null, null, 'EPERM', 'EBUSY', 'EACCES', 'ENOSPC', 'ENOENT', 'EIO', 'EXDEV');

const plan = fc.record({
    original: fc.option(fc.string({ maxLength: 30 }), { nil: undefined }),
    content: fc.string({ maxLength: 30 }),
    mkdir: fault,
    write: fault,
    partial: fc.boolean(),
    renames: fc.array(fault, { minLength: 0, maxLength: 8 }),
    delays: fc.array(fc.integer({ min: 0, max: 50 }), { maxLength: 5 })
});

function simulate(p) {
    const files = new Map();
    if (p.original !== undefined) { files.set(FILE, p.original); }
    let renameCall = 0;
    const slept = [];
    const io = {
        mkdir: () => { if (p.mkdir) { throw errno(p.mkdir); } },
        write: (f, c) => {
            if (p.write) { if (p.partial) { files.set(f, c.slice(0, c.length >> 1)); } throw errno(p.write); }
            files.set(f, c);
        },
        rename: (from, to) => {
            const e = p.renames[renameCall++];
            if (e) { throw errno(e); }
            if (!files.has(from)) { throw errno('ENOENT'); }
            files.set(to, files.get(from)); files.delete(from);
        },
        remove: f => { files.delete(f); },
        sleep: ms => { slept.push(ms); }
    };
    let r, threw = null;
    try { r = A.writeAtomicSync(FILE, p.content, io, p.delays); } catch (e) { threw = e; }
    return { r, threw, files, slept, renameCall };
}

console.log('\n== every fault sequence keeps the promises ==');
prop('never throws', plan, p => simulate(p).threw === null);
prop('ok means the whole content is on the target and no temp file is left', plan, p => {
    const s = simulate(p);
    return !s.r.ok || (s.files.get(FILE) === p.content && !s.files.has(TMP));
});
prop('not ok means the target is exactly as it was, no temp file, and the error says so', plan, p => {
    const s = simulate(p);
    if (s.r.ok) { return true; }
    const same = p.original === undefined ? !s.files.has(FILE) : s.files.get(FILE) === p.original;
    return same && !s.files.has(TMP) && /NOTHING WAS WRITTEN/.test(s.r.error || '');
});
prop('attempts and waiting are bounded by the delay schedule', plan, p => {
    const s = simulate(p);
    const budget = p.delays.reduce((a, b) => a + b, 0);
    return s.r.attempts <= p.delays.length + 1 && s.slept.reduce((a, b) => a + b, 0) <= budget;
});
prop('a fault that is not a lock is never waited on', plan, p => {
    const s = simulate(p);
    const firstBad = p.renames.find(e => e && !A.LOCK_ERRNOS.includes(e));
    const locksBefore = firstBad ? p.renames.slice(0, p.renames.indexOf(firstBad)).filter(Boolean).length : Infinity;
    return !firstBad || !!p.mkdir || !!p.write || s.slept.length <= locksBefore;
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
