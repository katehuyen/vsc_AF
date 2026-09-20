import * as fs from 'fs';

/**
 * N-3 — THE DISK UNDER BOTH A2A STORES. Notes and tasks are different data
 * with different lifecycles, but they share one problem and it is the reason
 * this file exists separately from either of them: **two extension hosts, two
 * agents, one file.** The farm's whole point is that several agents run at
 * once, so every assumption a single-writer store is allowed to make is false
 * here.
 *
 * Two mechanisms, and they answer different questions:
 *
 *  · `atomicWrite` — a READER never sees half a file. Write to a temp name in
 *    the same directory, then rename; rename is atomic on NTFS and on POSIX,
 *    a partial `writeFileSync` is not.
 *
 *  · `withLock` — a WRITER never loses another writer's work. `fs.openSync`
 *    with `wx` fails if the file exists, which is a cross-process mutex on
 *    every platform this runs on. It wraps the whole read-modify-write, so a
 *    claim really is compare-and-set rather than "read, hope, write".
 *
 * ‼️ AND A LOCK THAT IS NEVER RELEASED IS WORSE THAN NO LOCK. A host killed
 * mid-write (the window reload this extension does to itself — S-59) leaves
 * the file behind, and without an age check the A2A layer would be dead until
 * somebody deleted it by hand. So a lock older than `STALE_LOCK_MS` is broken
 * and taken: the cost of breaking one wrongly is a merge, the cost of never
 * breaking one is a farm that has stopped talking to itself.
 */

/** A lock this old is assumed to belong to a process that is gone. */
export const STALE_LOCK_MS = 30_000;
/** How long a caller waits for somebody else's lock before giving up. */
export const LOCK_WAIT_MS = 2_000;

export interface Envelope<T> { rev: number; items: T[] }

const tmpName = (file: string): string =>
    `${file}.tmp-${process.pid}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function atomicWrite(file: string, text: string): boolean {
    const tmp = tmpName(file);
    try {
        fs.writeFileSync(tmp, text, 'utf8');
        fs.renameSync(tmp, file);
        return true;
    } catch {
        try { fs.unlinkSync(tmp); } catch { /* best effort */ }
        return false;
    }
}

/** Read an envelope, tolerating a bare array (the shape before rev existed). */
export function readEnvelope<T extends { id?: string }>(
    file: string, normalise: (row: T) => T
): Envelope<T> {
    try {
        const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Envelope<T> | T[];
        const arr = Array.isArray(raw) ? raw : raw?.items;
        const items = Array.isArray(arr)
            ? arr.filter(r => r && typeof r.id === 'string').map(normalise)
            : [];
        return { rev: !Array.isArray(raw) && typeof raw?.rev === 'number' ? raw.rev : 0, items };
    } catch { return { rev: 0, items: [] }; }
}

export function writeEnvelope<T>(file: string, env: Envelope<T>): boolean {
    return atomicWrite(file, JSON.stringify(env, null, 2));
}

/**
 * Hold the file's lock for one read-modify-write. Returns what `fn` returned,
 * or `undefined` when the lock could not be taken inside `LOCK_WAIT_MS` —
 * which the caller reports as a refusal, never as a success.
 *
 * ‼️ `fn` MUST NOT be async. The waiting here is a busy wait on purpose: an
 * `await` inside the critical section would release the JavaScript turn and
 * let this same process re-enter it, which is exactly the interleaving the
 * lock exists to stop.
 */
export function withLock<T>(file: string, fn: () => T, now = () => Date.now()): T | undefined {
    const lock = file + '.lock';
    const until = now() + LOCK_WAIT_MS;
    let fd: number | undefined;
    for (;;) {
        try { fd = fs.openSync(lock, 'wx'); break; } catch { /* somebody holds it */ }
        const age = lockAge(lock, now);
        if (age !== undefined && age > STALE_LOCK_MS) {
            // the holder is gone; take it over rather than wait for a process
            // that will never come back to release it
            try { fs.unlinkSync(lock); } catch { /* another waiter won the race */ }
            continue;
        }
        if (now() >= until) { return undefined; }
        spin();
    }
    try { return fn(); } finally {
        try { fs.closeSync(fd); } catch { /* already gone */ }
        try { fs.unlinkSync(lock); } catch { /* already gone */ }
    }
}

function lockAge(lock: string, now: () => number): number | undefined {
    try { return now() - fs.statSync(lock).mtimeMs; } catch { return undefined; }
}

/** A short synchronous pause — the only kind allowed inside the lock. */
function spin(): void {
    const end = Date.now() + 15;
    while (Date.now() < end) { /* deliberately blocking: see withLock */ }
}

/** A sortable, collision-resistant id — the same shape the rest of the farm uses. */
export function a2aId(prefix: string, now = Date.now()): string {
    return `${prefix}${now.toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
