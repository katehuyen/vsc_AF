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
export function batonCardTitle(b: Baton, agent = b.from.agentId): string {
    return `⑂ hop ${b.hop} — ${agent} handed over${b.rescue ? ' (rescued)' : ''}`;
}

/** The card's body: what the successor starts from, under the coordinates of the pass. */
export function batonCardBody(b: Baton, agent = b.from.agentId): string {
    const lines = [
        `Chain ${b.chainId} · hop ${b.hop} · passed by session ${b.from.sessionId.slice(0, 8)} (${agent})`,
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
    /**
     * ‼️ A BATON CARRIES THE AGENT'S ID, WHICH IS A FOLDER PATH — the board
     * speaks agent NAMES (`fromAgent`, `targetRole`), so a card signed with the
     * id is a card no reader's coordinates ever match. The resolver is how the
     * one becomes the other; without it the id is written rather than a lie.
     */
    constructor(
        private readonly notes: A2ANotesStore,
        private readonly agentNameOf?: (agentId: string) => string | undefined
    ) { }

    private agent(b: Baton): string {
        try { return this.agentNameOf?.(b.from.agentId) || b.from.agentId; } catch { return b.from.agentId; }
    }

    /** Hang the card and answer its id; `undefined` if the board could not be written. */
    hang(b: Baton, now = Date.now()): string | undefined {
        try {
            const agent = this.agent(b);
            const note = this.notes.add({
                fromAgent: agent,
                fromSessionId: b.from.sessionId,
                title: batonCardTitle(b, agent),
                body: batonCardBody(b, agent),
                project: '*',
                subsystem: b.from.cwd,
                topic: b.chainId,
                targetRole: agent,
                // ‼️ A HANDOVER IS ADDRESSED, NOT BROADCAST. `hard` keeps the
                // card off every other agent's a2a.status; the PAGE draws the
                // whole store, so a person still sees every race.
                strictness: 'hard',
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
