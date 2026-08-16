// Agent Farm — S-37: the record of which sessions the Console hosted, kept so
// that no window can erase another window's.
//
// ‼️ THE BUG THIS EXISTS FOR, MEASURED.
//
// A Console conversation reaches the CLI over the same streaming `-p` channel a
// headless run does, so its transcript says `entrypoint: "sdk-cli"` either way.
// The ONLY thing that can tell them apart is Agent Farm's own note that it
// hosted the session — and that note lived in a list read into memory once, at
// activation, and written back WHOLE on every change. Two windows is all it
// takes: the one that has been open since yesterday writes its own snapshot
// over today's, and every id the other window added is gone.
//
// It happened, and the shape of the damage is the proof. On 2026-08-16 the file
// held every Console session up to 2026-08-14 19:51 and then nothing at all
// until 2026-08-16 12:18 — a whole day of the user's own dialogs missing, with
// exactly three exceptions: the three whose cards were still open in the panel
// and were therefore re-added by the window that did the overwriting. Those
// eight lost sessions then drew 🤖 automation on every surface, because with the
// note gone there was nothing left to read but the entrypoint.
//
// So the store re-reads the file at WRITE time and unions. A list of ids has a
// merge that cannot be wrong — nothing is ever removed from it — which is why
// last-writer-wins was never the right shape for it in the first place.
//
// Pure node (no vscode import) — testable.

import * as fs from 'fs';
import * as path from 'path';

/**
 * How many ids the file keeps. Ids only, ~40 bytes each: 2000 is a rounding
 * error on disk and further back than any session a person will open.
 */
export const CONSOLE_ID_CAP = 2000;

/** What is on disk right now. A file that cannot be read is no ids, never an error. */
export function readConsoleIds(file: string): string[] {
    try {
        const j = JSON.parse(fs.readFileSync(file, 'utf8')) as { ids?: unknown };
        if (!Array.isArray(j.ids)) { return []; }
        return j.ids.filter((x): x is string => typeof x === 'string' && !!x.trim());
    } catch { return []; }
}

/**
 * Disk first, then ours — the oldest ids stay at the front so the cap drops the
 * oldest and never the id that was just learned. Deduplicated in one pass; a
 * `Set` preserves insertion order, which is what makes that true.
 */
export function mergeConsoleIds(...lists: readonly (readonly string[])[]): string[] {
    const out = new Set<string>();
    for (const list of lists) {
        for (const id of list) {
            const s = String(id ?? '').trim();
            if (s) { out.add(s); }
        }
    }
    return [...out].slice(-CONSOLE_ID_CAP);
}

export interface ConsoleIdWrite {
    /** the merged list, which is now also what is on disk */
    ids: string[];
    /** ids this call put on disk that were not there before */
    added: string[];
    /** the write failed — the caller still has `ids` for this window */
    error?: string;
}

/**
 * ‼️ RE-READ, UNION, WRITE. The re-read is the whole point: `known` is this
 * window's view and it is allowed to be stale, but the FILE is every window's
 * and must only ever grow.
 *
 * Writes only when the union differs from disk, so a Console that fires its
 * change event a hundred times a turn costs one `readFileSync` and no write.
 */
export function recordConsoleIds(
    file: string, known: readonly string[], live: readonly string[]
): ConsoleIdWrite {
    const disk = readConsoleIds(file);
    const ids = mergeConsoleIds(disk, known, live);
    const onDisk = new Set(disk);
    const added = ids.filter(id => !onDisk.has(id));
    if (!added.length && ids.length === disk.length) { return { ids, added: [] }; }
    try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify({ ids }, null, 1), 'utf8');
    } catch (e) {
        return { ids, added, error: e instanceof Error ? e.message : String(e) };
    }
    return { ids, added };
}
