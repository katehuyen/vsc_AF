import { MIN_FETCH_INTERVAL_MS } from './planusage';

/**
 * X-206 — READING EVERY ACCOUNT, WITHOUT BECOMING THE THING THAT BURNS THE QUOTA.
 *
 * `accountUsage` says it in its own header and it is still true: there is
 * deliberately no `refreshAll()`, because a method that reads every slot at once
 * is the multiplication that whole module exists to prevent. But the question
 * the user actually has — *which of these do I switch to, and how much is left
 * in each* — cannot be answered one stale card at a time.
 *
 * ‼️ SO THE ANSWER IS A QUEUE, NOT A BURST. "Refresh all" does not mean N
 * requests; it means N requests **spaced by the machine's own floor**, taken in
 * turn, with the shared budget in `accountUsage` untouched underneath. The
 * spacing here is the SAME constant that floor is built from, so there is one
 * number and not two that drift apart.
 *
 * ‼️ AND A QUEUE THE READER CANNOT SEE IS A HANG. Pressing a button that will do
 * something in twenty seconds, with no sign that it was heard, is
 * indistinguishable from a button that does nothing — so the queue is a STATE
 * the page draws: who is waiting, who is being read right now, and in what
 * order. Pressing a waiting one again takes it out, because a queue you cannot
 * leave is a queue you learn not to join.
 *
 * This module is pure: it holds an order and answers "who is next, and when".
 * It performs no request and knows no clock of its own.
 */

/** Where a slot stands in a refresh queue. */
export type QueuePosition = 'idle' | 'queued' | 'reading';

export interface QueueState {
    /** waiting, in the order they were asked for */
    pending: string[];
    /** the one being read right now; '' when none is */
    reading: string;
    /** when the last read was started; 0 = none yet */
    lastStartedAt: number;
}

export function emptyQueue(): QueueState {
    return { pending: [], reading: '', lastStartedAt: 0 };
}

/** What this slot is doing, in one word the page can draw. */
export function positionOf(q: QueueState, slotId: string): QueuePosition {
    if (q.reading === slotId) { return 'reading'; }
    return q.pending.includes(slotId) ? 'queued' : 'idle';
}

/** Its place in the line, 1-based; 0 when it is not waiting. */
export function placeOf(q: QueueState, slotId: string): number {
    const i = q.pending.indexOf(slotId);
    return i < 0 ? 0 : i + 1;
}

/**
 * The one gesture behind every refresh button: ask for this slot, or take back
 * the ask.
 *
 * ‼️ A SLOT BEING READ RIGHT NOW CANNOT BE CANCELLED, and pretending otherwise
 * would be the worst kind of lie — the request is already in flight, the figure
 * will land, and a control that said "cancelled" would leave the reader
 * expecting an old number and getting a new one.
 */
export function toggle(q: QueueState, slotId: string): QueueState {
    if (!slotId || q.reading === slotId) { return q; }
    const i = q.pending.indexOf(slotId);
    if (i >= 0) {
        const pending = q.pending.slice();
        pending.splice(i, 1);
        return { ...q, pending };
    }
    return { ...q, pending: [...q.pending, slotId] };
}

/**
 * Ask for several at once — "refresh all", or one engine's group.
 *
 * Order is the caller's; anything already waiting keeps the place it had, so
 * pressing "refresh all" while three are queued does not reshuffle them. One
 * being read is not queued again: it is already being answered.
 */
export function enqueue(q: QueueState, slotIds: string[]): QueueState {
    const pending = q.pending.slice();
    for (const id of slotIds) {
        if (!id || id === q.reading || pending.includes(id)) { continue; }
        pending.push(id);
    }
    return { ...q, pending };
}

/** Take everything out of the line. The one in flight still lands. */
export function clear(q: QueueState): QueueState {
    return { ...q, pending: [] };
}

/**
 * When the next read may start, given when the last one did.
 *
 * ‼️ THE SPACING IS THE MACHINE'S FLOOR, not a number chosen here. Reading three
 * accounts is three requests however they are arranged, and the only thing that
 * keeps them polite is the distance between them — the same distance a mashed
 * ⟳ button is held to. Zero when nothing is waiting.
 */
export function nextDueAt(q: QueueState, spacingMs = MIN_FETCH_INTERVAL_MS): number {
    if (!q.pending.length || q.reading) { return 0; }
    return q.lastStartedAt ? q.lastStartedAt + spacingMs : 0;
}

/**
 * Start the next one if it is time. Returns the new state and who to read;
 * `slotId` is empty when nothing should happen yet.
 */
export function startNext(
    q: QueueState, now: number, spacingMs = MIN_FETCH_INTERVAL_MS
): { state: QueueState; slotId: string } {
    if (q.reading || !q.pending.length) { return { state: q, slotId: '' }; }
    const due = nextDueAt(q, spacingMs);
    if (due && now < due) { return { state: q, slotId: '' }; }
    const [head, ...rest] = q.pending;
    return { state: { pending: rest, reading: head, lastStartedAt: now }, slotId: head };
}

/** That read came back (or failed). The slot leaves the chair either way. */
export function finish(q: QueueState, slotId: string): QueueState {
    return q.reading === slotId ? { ...q, reading: '' } : q;
}
