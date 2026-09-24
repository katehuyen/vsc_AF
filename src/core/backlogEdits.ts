/**
 * ‼️ X-357 — AN ITEM REWRITTEN IS AN ITEM THAT WAS WORKED ON.
 *
 * "Last touched" is the ledger's last record, and a line reworded, re-tagged
 * or re-prioritised moves no checkbox — so no door recorded it and the item
 * stayed where it was in the ordering. The doors that edit a line now say so
 * themselves (the page's ✎, `projects.backlog.set`, the hold); what is left is
 * an edit made OUTSIDE — Obsidian, or the editor the ↗ opens — and that is
 * found here, by holding each coded line against the snapshot of the last read.
 *
 * Two snapshot entries per code: its words (`code` — what X-36 keeps as the
 * previous round) and its whole line (`rawKey(code)` — which also sees a tag,
 * a priority or a field change). A snapshot written before the line entry
 * existed simply compares words until the next read fills it in.
 */
import { BacklogItem, parseBacklog } from './projectBacklog';
import type { TrackRecord } from './backlogTrack';

/** The snapshot key of a code's whole line. A code never holds a newline, so it cannot collide with one. */
export const rawKey = (code: string): string => `${code}\n`;

/** Both entries for every coded item. */
export function snapshotInto(out: Map<string, string>, items: readonly BacklogItem[]): Map<string, string> {
    for (const i of items) {
        if (!i.code) { continue; }
        if (i.text) { out.set(i.code, i.text); }
        if (typeof i.raw === 'string') { out.set(rawKey(i.code), i.raw.trimEnd()); }
    }
    return out;
}

/**
 * ‼️ AGENT FARM'S OWN WRITE IS NOT AN OUTSIDE EDIT. The page's buttons write
 * the file and the watcher hears it 1.5 s later as a changed document; without
 * this, a ⛔ or a closing stamp would come back as "edited outside". Only the
 * lines THIS write changed are adopted — a line the user changed in Obsidian a
 * moment before still differs from the snapshot and is still found.
 */
export function adoptOwnWrite(seen: Map<string, string>, before: string, after: string): boolean {
    const had = new Set(before.split(/\r?\n/));
    const changed = after.split(/\r?\n/).filter(l => !had.has(l));
    if (!changed.length) { return false; }
    const items = parseBacklog(changed.join('\n')).items.filter(i => i.code);
    const moved = items.some(i => seen.get(rawKey(i.code!)) !== i.raw.trimEnd() || (!!i.text && seen.get(i.code!) !== i.text));
    snapshotInto(seen, items);
    return moved;
}

/**
 * The `touch` an outside edit leaves, or nothing. Dated by the file's last
 * save — the latest the edit can have been made, the same bound a birth uses —
 * and never when a first-hand record of the item is already that recent: the
 * door that wrote it recorded it itself.
 */
export function outsideEdit(
    item: BacklogItem, mine: readonly TrackRecord[], seen: ReadonlyMap<string, string> | undefined,
    writtenBy: number | undefined, now: number
): TrackRecord | undefined {
    if (!item.code || !seen || !writtenBy || writtenBy <= 0) { return undefined; }
    const words = seen.get(item.code);
    const line = seen.get(rawKey(item.code));
    const reworded = words !== undefined && !!item.text && words !== item.text;
    const rewritten = line !== undefined && typeof item.raw === 'string' && line !== item.raw.trimEnd();
    if (!reworded && !rewritten) { return undefined; }
    if (mine.some(r => r.ts >= writtenBy)) { return undefined; }
    const at = writtenBy < now ? writtenBy : now;
    return {
        code: item.code, event: 'touch', ts: at, by: 'outside', uncertain: 'none',
        note: (reworded ? 'reworded outside Agent Farm' : 'edited outside Agent Farm (tags, priority or fields)')
            + '; dated by the file\'s last save, the latest it can have been made'
    };
}

/** A `touch` from outside is the date of an edit, never of a birth: `openedAt` does not read it. */
export const isOutsideEdit = (r: Pick<TrackRecord, 'event' | 'by'>): boolean => r.event === 'touch' && r.by === 'outside';
