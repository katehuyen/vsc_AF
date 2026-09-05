// X-197 / X-204 — THE ATOMIC WRITE, AND THE PROMISE ITS FAILURE CARRIES.
//
// ‼️ The damage this suite exists to prevent is not the failed write, it is the
// DUPLICATE one. `projects.backlog.add` fell over with
// `EPERM: rename Backlog.md.af.tmp -> Backlog.md` because Obsidian had the file
// open; the caller retried, and six items were written twice. A rename that
// fails leaves the target untouched — but nothing said so, so the caller could
// not know whether retrying was safe.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const {
    writeAtomicSync, isLockError, RENAME_RETRY_DELAYS_MS, LOCK_ERRNOS
} = require(path.join(__dirname, '..', 'out', 'core', 'atomicFile.js'));

/** A disk that fails the rename a set number of times, then lets it through. */
function fakeIo(failures, code = 'EPERM') {
    const io = {
        files: new Map(), slept: [], renames: 0, removed: [],
        mkdir: () => { },
        write: (f, c) => { io.files.set(f, c); },
        rename: (from, to) => {
            io.renames++;
            if (io.renames <= failures) {
                const e = new Error(`${code}: operation not permitted, rename`);
                e.code = code;
                throw e;
            }
            io.files.set(to, io.files.get(from));
            io.files.delete(from);
        },
        remove: f => { io.removed.push(f); io.files.delete(f); },
        sleep: ms => { io.slept.push(ms); }
    };
    return io;
}

// ---------- the happy path costs nothing extra ----------
{
    const io = fakeIo(0);
    const r = writeAtomicSync('D:/x/Backlog.md', 'body', io);
    ok('a rename that works first time takes one attempt', r.ok && r.attempts === 1);
    ok('…and sleeps not at all', io.slept.length === 0);
    ok('…and the content landed on the target, not the temp file',
        io.files.get('D:/x/Backlog.md') === 'body' && !io.files.has('D:/x/Backlog.md.af.tmp'));
}

// ---------- ‼️ the whole point: a lock is waited out, not reported ----------
{
    const io = fakeIo(2);
    const r = writeAtomicSync('D:/x/Backlog.md', 'body', io);
    ok('‼️ EPERM on the first two attempts is waited out, not returned',
        r.ok && r.attempts === 3);
    ok('…with a backing-off wait between them', io.slept.length === 2
        && io.slept[0] === RENAME_RETRY_DELAYS_MS[0] && io.slept[1] > io.slept[0]);
}

// EBUSY and EACCES are the same condition wearing other names.
for (const code of LOCK_ERRNOS) {
    const io = fakeIo(1, code);
    ok(`${code} is treated as a lock and retried`, writeAtomicSync('D:/x/f', 'b', io).ok);
}

// ---------- when the retries run out, the promise is what matters ----------
{
    const io = fakeIo(99);
    const r = writeAtomicSync('D:/x/Backlog.md', 'body', io);
    ok('a file held for the whole window fails rather than hanging for ever',
        !r.ok && r.attempts === RENAME_RETRY_DELAYS_MS.length + 1);
    ok('‼️ …and the error states that NOTHING WAS WRITTEN, which is what makes a retry safe',
        /NOTHING WAS WRITTEN/.test(r.error) && /repeated safely/.test(r.error));
    ok('…and names the kind of process that is probably holding it',
        /Obsidian|backup|virus/i.test(r.error) && /EPERM/.test(r.error));
    ok('…and the target really is untouched', !io.files.has('D:/x/Backlog.md'));
    ok('…and the temp file is cleaned up rather than left as litter',
        io.removed.includes('D:/x/Backlog.md.af.tmp') && !io.files.has('D:/x/Backlog.md.af.tmp'));
}

// ---------- a permanent fault must not cost two seconds to report ----------
{
    const io = fakeIo(99, 'ENOENT');
    const r = writeAtomicSync('D:/nope/f', 'b', io);
    ok('‼️ a fault that will never clear (ENOENT) is reported at once, not retried',
        !r.ok && r.attempts === 1 && io.slept.length === 0);
    ok('…and still promises nothing was written', /NOTHING WAS WRITTEN/.test(r.error));
}

// ---------- a temp file that cannot even be written ----------
{
    const io = fakeIo(0);
    io.write = () => { const e = new Error('EROFS: read-only file system'); e.code = 'EROFS'; throw e; };
    const r = writeAtomicSync('D:/x/f', 'b', io);
    ok('a temp file that cannot be written fails before any rename is attempted',
        !r.ok && io.renames === 0 && /NOTHING WAS WRITTEN/.test(r.error));
}

// ---------- the predicate, said plainly ----------
{
    ok('isLockError knows a lock from a missing file',
        isLockError({ code: 'EPERM' }) && isLockError({ code: 'EBUSY' })
        && !isLockError({ code: 'ENOENT' }) && !isLockError(undefined)
        && !isLockError(new Error('plain')));
}


// ---- X-197: the two real writers now carry the same promise ----------------
//
// ‼️ THE POINT IS NOT THAT THEY RETRY, it is that they say what happened. Both
// used to hold their own copy of temp+rename; a locked Backlog.md therefore
// reached the caller as a bare "EPERM ... rename" with no statement about what
// had and had not been written, so the caller retried a batch it had already
// half-applied — six items, twice, and their codes spent for ever.
{
    const path = require('path');
    const realFs = require('fs');
    const dir = realFs.mkdtempSync(path.join(require('os').tmpdir(), 'af-x197-'));
    const target = path.join(dir, 'Backlog.md');
    realFs.writeFileSync(target, 'before', 'utf8');

    const { safeWriteDoc } = require(path.join(__dirname, '..', 'out', 'core', 'projectDocs.js'));
    const { atomicWrite } = require(path.join(__dirname, '..', 'out', 'core', 'reportBridge.js'));

    // The lock: rename refuses twice, the way an editor holding the file does.
    const realRename = realFs.renameSync;
    let refusals = 2;
    realFs.renameSync = (from, to) => {
        if (refusals > 0 && String(to) === target) {
            refusals--;
            const e = new Error('EPERM: operation not permitted, rename'); e.code = 'EPERM'; throw e;
        }
        return realRename(from, to);
    };
    try {
        const r = safeWriteDoc(target, 'after');
        ok('‼️ a document write survives a lock that clears — the write that used to fail now lands',
            r.ok && realFs.readFileSync(target, 'utf8') === 'after' && refusals === 0);

        refusals = 99;
        const dead = safeWriteDoc(target, 'never');
        ok('…and a lock that never clears fails with the promise that makes a retry safe',
            !dead.ok && /NOTHING WAS WRITTEN/.test(dead.error)
            && realFs.readFileSync(target, 'utf8') === 'after');
        ok('…naming the file and the kind of process that is probably holding it',
            /Backlog.md/.test(dead.error) && /Obsidian|backup|virus/i.test(dead.error));
        ok('…and leaving no temp file behind to be mistaken for the document',
            !realFs.existsSync(target + '.af.tmp'));

        let threw = '';
        try { atomicWrite(path.join(dir, 'Backlog.md'), 'report'); } catch (e) { threw = String(e.message); }
        ok('‼️ the report writer carries the SAME promise — one writer, not two copies of four lines',
            /NOTHING WAS WRITTEN/.test(threw));
    } finally {
        realFs.renameSync = realRename;
        try { realFs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
    }
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
