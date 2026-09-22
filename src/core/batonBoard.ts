import { BATON_SWEEP_MS } from './a2aHygiene';
import type { A2ANotesStore } from './a2aNotes';
import type { Baton } from './baton';

/**
 * S-84 — A RELAY LEAVES ITS HANDOVER WHERE PEOPLE AND AGENTS ALREADY LOOK.
 * `batons.json` is the machine's record of a chain; it is not a place anybody
 * reads. The words one leg left its successor are exactly what the A2A board
 * exists for, so every pass hangs a card there — `category: 'baton'`, `topic:
 * <chainId>`, so one race is a filter away from the fleet's ordinary traffic.
 *
 * The card's life is the chain's:
 *   * hung when the baton is passed (or opened by the failsafe's rescue);
 *   * RESOLVED the moment the successor is running — the words have reached
 *     the run they were written for, so the active board owes them nothing;
 *   * given a 24-hour ttl when the chain ends, which the hygiene sweep then
 *     clears (`a2aHygiene`). A pinned card survives all of it.
 *
 * The baton keeps its card's id (`a2aNoteId`) rather than the note keeping the
 * baton's: the chain is the subject, and a note nobody can find from the baton
 * is a note the relay cannot close.
 */

/** One line naming the leg, for a reader scanning the board. */
export function batonCardTitle(b: Baton): string {
    return `⑂ hop ${b.hop} — ${b.from.agentId} handed over${b.rescue ? ' (rescued)' : ''}`;
}

/** The card's body: what the successor starts from, under the coordinates of the pass. */
export function batonCardBody(b: Baton): string {
    const lines = [
        `Chain ${b.chainId} · hop ${b.hop} · passed by session ${b.from.sessionId.slice(0, 8)} (${b.from.agentId})`,
        `Folder: ${b.from.cwd}`
    ];
    if (b.rescue) { lines.push(`Opened by the failsafe: ${b.rescue}`); }
    if (b.note) { lines.push(`Note for the reader: ${b.note}`); }
    lines.push('', '--- the successor starts from ---', '', b.prompt);
    return lines.join('\n');
}

/**
 * The three moments of a card's life. Every method is best-effort: a relay is
 * never stopped because the board could not be written — the chain's own
 * record is `batons.json`, and this is the copy people read.
 */
export class BatonBoard {
    constructor(private readonly notes: A2ANotesStore) { }

    /** Hang the card and answer its id; `undefined` if the board could not be written. */
    hang(b: Baton, now = Date.now()): string | undefined {
        try {
            const note = this.notes.add({
                fromAgent: b.from.agentId,
                fromSessionId: b.from.sessionId,
                title: batonCardTitle(b),
                body: batonCardBody(b),
                project: '*',
                subsystem: b.from.cwd,
                topic: b.chainId,
                targetRole: b.from.agentId,
                strictness: 'any',
                category: 'baton'
            }, now);
            return note?.id;
        } catch { return undefined; }
    }

    /** The successor is running: the words have arrived, so the card leaves the active board. */
    handedOn(noteId: string | undefined, now = Date.now()): void {
        if (!noteId) { return; }
        try { this.notes.resolve(noteId, true, now); } catch { /* the chain does not wait on the board */ }
    }

    /** The chain ended: its cards stay readable for a day, then the sweep takes them. */
    closeChain(noteIds: (string | undefined)[], now = Date.now()): number {
        const ids = noteIds.filter((id): id is string => !!id);
        if (!ids.length) { return 0; }
        try { return this.notes.expire(ids, now + BATON_SWEEP_MS); } catch { return 0; }
    }
}
