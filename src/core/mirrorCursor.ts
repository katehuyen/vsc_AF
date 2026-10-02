/**
 * ‼️ X-481 — WHERE THE CONSOLE MIRROR PICKS UP, BY IDENTITY RATHER THAN BY COUNT.
 *
 * The mirror (`mirrorConsoleToLive`) reports a card's rows to the live feed as
 * they arrive. A count cursor is right only while the card's list grows at its
 * END, and two paths insert in front of what the mirror has already passed: a
 * revive swaps its placeholder for the transcript read back (`swapPlaceholder`)
 * and "load earlier" puts older rows at the top (`prependHistory`). Counted,
 * every inserted row read as new, and the mirror stamped an old conversation
 * onto the Live Timeline at today's clock — measured on two revives of one
 * session (2026-10-02, 23 and 25 old replies, ~300 ms each), with the extension
 * host unresponsive for their whole run and the revive nudge late behind it.
 *
 * So the cursor is anchored on the last row passed that was NOT read back from
 * a transcript: the history paths only ever add read-back rows, and only ever
 * in front of the live ones, so whatever stands after the anchor is new. And a
 * read-back row is never an event at all — it is the past, whatever its place.
 *
 * Pure: the read-back verdict is `transcriptPos`, the one place the row ids of
 * both transcript readers are decoded (K-23).
 */
import { transcriptPos } from './consoleproto';

export interface MirrorCursor {
    /** rows the mirror had passed — the answer when there is no anchor to find */
    count: number;
    /** id of the last passed row that was not read back from a transcript */
    anchor?: string;
}

/** A row read back from a transcript: the conversation's past, never a live event. */
export function readBack(id: string): boolean {
    return transcriptPos(id) >= 0;
}

/** The cursor that says "everything on this card now has been passed". */
export function cursorAt(messages: readonly { id: string }[]): MirrorCursor {
    for (let i = messages.length - 1; i >= 0; i--) {
        if (!readBack(messages[i].id)) { return { count: messages.length, anchor: messages[i].id }; }
    }
    return { count: messages.length };
}

/**
 * The rows this pass reports: those after the anchor, wherever it stands now,
 * minus any read back from a transcript. An anchor that is gone (the list was
 * replaced wholesale) falls back to the count, which is all that is left.
 */
export function freshRows<T extends { id: string }>(messages: readonly T[], cursor: MirrorCursor): T[] {
    let from = cursor.count;
    if (cursor.anchor !== undefined) {
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].id === cursor.anchor) { from = i + 1; break; }
        }
    }
    return messages.slice(from).filter(m => !readBack(m.id));
}
