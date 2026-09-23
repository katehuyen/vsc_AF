/**
 * ‼️ X-357 — WHEN A BACKLOG LINE WAS BORN, READ OFF THE FOLDER'S OWN GIT HISTORY.
 *
 * A line typed straight into `Backlog.md` passes no door that writes `opened`,
 * and a transcript search finds nothing when no turn ever quoted the code — so
 * such an item stays undated and sinks to the bottom of both time orderings.
 * When the project folder is under git (the user's vault is), the first commit
 * whose diff ADDS the line is a clue of exactly the kind backfill accepts: the
 * line is literally there. Its time is an upper bound on the birth (a backup
 * commit lands after the edit), which is what an ordering needs.
 *
 * Pure: the git output comes in as text, so the rule is tested without a repo.
 */
import type { BacklogItem } from './projectBacklog';
import type { TrackRecord } from './backlogTrack';

/** The `--format` the caller hands git, so parser and command cannot drift. */
export const BIRTH_LOG_MARK = '@@AF ';

/** `git log` arguments for one file, oldest commit first, added lines only. */
export function birthLogArgs(rel: string): string[] {
    return ['log', '--reverse', `--format=${BIRTH_LOG_MARK}%ct`, '-p', '--unified=0',
        '--no-color', '--no-ext-diff', '--', rel];
}

const ADDED_ITEM = /^\+\s*-\s\[.\]\s+([A-Z]{1,2}-\d+(?:\.\d+)*)(?=\s|$)/;

/** code → the ms of the first commit whose diff adds a checkbox line carrying it. */
export function firstAddedByCode(log: string): Map<string, number> {
    const out = new Map<string, number>();
    let at = 0;
    for (const line of String(log ?? '').split(/\r?\n/)) {
        if (line.startsWith(BIRTH_LOG_MARK)) {
            const s = Number(line.slice(BIRTH_LOG_MARK.length).trim());
            at = isFinite(s) && s > 0 ? s * 1000 : 0;
            continue;
        }
        if (!at || line.startsWith('+++')) { continue; }
        const m = ADDED_ITEM.exec(line);
        if (m && !out.has(m[1])) { out.set(m[1], at); }
    }
    return out;
}

/**
 * The `opened` rows the history supports. Only for an item with no `opened` of
 * its own, and only when the commit is earlier than everything its ledger
 * already holds — a reconstruction adds a birth, it never moves a fact.
 */
export function birthsFromHistory(
    items: BacklogItem[], records: TrackRecord[], first: Map<string, number>
): TrackRecord[] {
    const out: TrackRecord[] = [];
    for (const item of items) {
        const code = item.code;
        if (!code) { continue; }
        const at = first.get(code);
        if (!at) { continue; }
        const mine = records.filter(r => r.code === code);
        if (mine.some(r => r.event === 'opened')) { continue; }
        if (mine.length && Math.min(...mine.map(r => r.ts)) <= at) { continue; }
        out.push({
            code, event: 'opened', ts: at, by: 'backfill', uncertain: 'guess',
            note: 'reconstructed: the first commit of the project folder whose backlog holds the line'
        });
    }
    return out;
}
