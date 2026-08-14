/**
 * ‼️ S-30 — A TRANSCRIPT IS READ ONLY ONCE IT HAS STOPPED MOVING.
 *
 * End Session → Resume reads the conversation back off the file the engine was
 * writing a moment ago. A plain `readFileSync` there is a single unlocked
 * glance: if it lands while the CLI is still flushing its closing lines, what
 * comes back is a file that is a few lines short of the truth — and the last
 * turn, which is the one the reader came back for, is exactly what is missing.
 * That read gave no way to tell the two cases apart, so a short read looked
 * identical to a short conversation.
 *
 * The protocol is the cheapest one that can actually answer it: stat, read,
 * stat again. Same size and same mtime on both sides means nothing moved
 * underneath the read and the snapshot is whole. If it did move, the read is
 * repeated a bounded number of times — a flush finishes in milliseconds, so a
 * file that is still moving after three passes is a session that is still being
 * written, which is a fact worth SAYING rather than drawing as a gap.
 *
 * The snapshot names itself (`bytes`, `mtimeMs`): every surface that reads a
 * transcript can report which version of the file it is showing, so a
 * scrollback and the file opened in an editor beside it can be compared instead
 * of taken on trust.
 */

import * as fs from 'fs';

/**
 * The largest transcript this will hold in memory at once. Unlike the sessions
 * scan (`cliTranscripts.ts`), which walks every file on the machine and streams
 * what it can, this is one file the user just asked for — so the ceiling is
 * generous and exists only to keep a runaway file from taking the window with
 * it. Above it nothing is read and the caller is told why (never an empty
 * scrollback: S-32's rule, applied on the reading side).
 */
export const MAX_TRANSCRIPT_BYTES = 128 * 1024 * 1024;

/** How many times a moving file is re-read before it is reported as moving. */
export const SETTLE_ATTEMPTS = 3;

export interface TranscriptSnapshot {
    /** The file's text — absent only when nothing was read (`tooBig`). */
    raw?: string;
    /** What the file measured when the snapshot was taken. */
    bytes: number;
    mtimeMs: number;
    /** The file was still growing under the read after every attempt: what is
     *  here is honest but may be a line or two behind the session. */
    moving?: boolean;
    /** Over the ceiling — nothing was read at all. */
    tooBig?: boolean;
}

/** Read a transcript whole, and say which version of it this is.
 *  Throws exactly what `fs` throws — a file that cannot be read is the
 *  caller's own error path, and it reports the reason (S-30). */
export function readSettled(file: string, attempts = SETTLE_ATTEMPTS): TranscriptSnapshot {
    let last: TranscriptSnapshot | undefined;
    for (let i = 0; i < Math.max(1, attempts); i++) {
        const before = fs.statSync(file);
        if (before.size > MAX_TRANSCRIPT_BYTES) {
            return { bytes: before.size, mtimeMs: before.mtimeMs, tooBig: true };
        }
        const raw = fs.readFileSync(file, 'utf8');
        const after = fs.statSync(file);
        if (before.size === after.size && before.mtimeMs === after.mtimeMs) {
            return { raw, bytes: after.size, mtimeMs: after.mtimeMs };
        }
        last = { raw, bytes: after.size, mtimeMs: after.mtimeMs, moving: true };
    }
    // `attempts >= 1` above, so this is always the last pass's snapshot.
    return last as TranscriptSnapshot;
}

/** How a snapshot is named on a surface: what was read, and of when. The same
 *  words everywhere, so two surfaces reporting the same file look the same. */
export function snapshotLabel(snap: { bytes: number; mtimeMs: number }): string {
    const mb = snap.bytes / (1024 * 1024);
    const size = mb >= 1 ? `${mb.toFixed(2)} MB` : `${Math.round(snap.bytes / 1024)} KB`;
    return `${size} @ ${new Date(snap.mtimeMs).toLocaleString()}`;
}
