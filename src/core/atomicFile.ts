import * as fs from 'fs';
import * as path from 'path';

/**
 * ONE ATOMIC WRITE, AND WHAT IT PROMISES THE CALLER.
 *
 * Write to a sibling temp file, then rename over the target. The rename is the
 * whole mechanism: a reader watching the folder either sees the old file or the
 * new one, never a half-written one.
 *
 * ‼️ ON WINDOWS THE RENAME IS THE PART THAT FAILS. If anything else has the
 * target open — Obsidian, a backup agent, a virus scanner mid-scan — the rename
 * comes back `EPERM` even though the file is perfectly writable a moment later.
 * These locks are measured in milliseconds, so the answer is to wait and try
 * again rather than to hand the caller an error for a condition that has
 * already passed.
 *
 * ‼️ AND THE FAILURE CARRIES A GUARANTEE, which is the more important half.
 * When every attempt is spent, the TARGET WAS NEVER TOUCHED — the temp file was
 * written and then removed, and the rename is all-or-nothing. So the caller can
 * retry the whole operation safely. Without that stated, a caller that retries
 * after a partial batch writes the first items twice, which is exactly the
 * damage X-197 records.
 */

/** How long to wait before each further attempt at the rename. */
export const RENAME_RETRY_DELAYS_MS = [150, 300, 600, 900];

/** The errno values Windows reports for "somebody else has this open". */
export const LOCK_ERRNOS = ['EPERM', 'EACCES', 'EBUSY'];

export interface AtomicWriteResult {
    ok: boolean;
    /** how many rename attempts it took (or were spent) */
    attempts: number;
    /** present only when `ok` is false; already says nothing was written */
    error?: string;
}

/** The disk, so a test can hand it a rename that fails on cue. */
export interface AtomicIo {
    mkdir(dir: string): void;
    write(file: string, content: string): void;
    rename(from: string, to: string): void;
    remove(file: string): void;
    sleep(ms: number): void;
}

/** Is this the transient "held by another process" flavour of failure? */
export function isLockError(e: unknown): boolean {
    const code = (e as NodeJS.ErrnoException)?.code;
    return typeof code === 'string' && LOCK_ERRNOS.includes(code);
}

/**
 * Block for `ms` without a callback.
 *
 * The callers here are synchronous by nature — a bridge op that answers "the
 * item was added" cannot return before the file is on disk — and this path only
 * runs when a write has already failed once, which is rare. `Atomics.wait` is
 * the one honest way to sleep on this thread; a spin loop would burn a core.
 */
function blockFor(ms: number): void {
    if (ms <= 0) { return; }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

const nodeIo: AtomicIo = {
    mkdir: dir => { fs.mkdirSync(dir, { recursive: true }); },
    write: (file, content) => { fs.writeFileSync(file, content, 'utf8'); },
    rename: (from, to) => { fs.renameSync(from, to); },
    remove: file => { try { fs.unlinkSync(file); } catch { /* best effort */ } },
    sleep: blockFor
};

/** What is probably holding the file — said as a list, not as a diagnosis. */
function holdersNote(file: string): string {
    return `Something else on this machine has ${path.basename(file)} open `
        + '(an editor such as Obsidian, a backup agent, or a virus scanner). '
        + 'NOTHING WAS WRITTEN — the file is exactly as it was, so this call can be repeated safely.';
}

/**
 * Write `content` to `file` atomically, retrying the rename while the target
 * looks locked. See the note at the top of this file for the guarantee a
 * failure carries.
 */
export function writeAtomicSync(
    file: string, content: string,
    io: AtomicIo = nodeIo, delays: number[] = RENAME_RETRY_DELAYS_MS
): AtomicWriteResult {
    const tmp = `${file}.af.tmp`;
    try {
        io.mkdir(path.dirname(file));
        io.write(tmp, content);
    } catch (e) {
        io.remove(tmp);
        return {
            ok: false, attempts: 0,
            error: `Could not write the temporary file next to ${file}: ${String((e as Error)?.message ?? e)}. `
                + 'NOTHING WAS WRITTEN.'
        };
    }
    let last: unknown;
    let spent = 0;
    for (let attempt = 1; attempt <= delays.length + 1; attempt++) {
        spent = attempt;
        try {
            io.rename(tmp, file);
            return { ok: true, attempts: attempt };
        } catch (e) {
            last = e;
            // ‼️ Only a lock is worth waiting out. A missing directory or a
            // read-only volume will fail identically on the fifth try, and
            // spending two seconds to say so is worse than saying it now.
            if (!isLockError(e) || attempt > delays.length) { break; }
            io.sleep(delays[attempt - 1]);
        }
    }
    io.remove(tmp);
    const code = (last as NodeJS.ErrnoException)?.code ?? '';
    return {
        ok: false, attempts: spent,
        error: isLockError(last)
            ? `${code}: could not replace ${file} after ${spent} attempts. ${holdersNote(file)}`
            : `Could not replace ${file}: ${String((last as Error)?.message ?? last)}. NOTHING WAS WRITTEN.`
    };
}
