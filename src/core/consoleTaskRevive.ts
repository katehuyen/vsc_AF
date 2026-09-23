/**
 * ‼️ S-88 — A CONSOLE TASK ROW FOLLOWS ITS CONVERSATION ACROSS A RESTART.
 *
 * A reload puts every running Console-hosted row back on the queue, because
 * the card it was handed to died with the extension host. But a restart that
 * asked for continuity (`farm.restartExtensionHost resume=true`) takes the
 * CONVERSATION up again — in a NEW card, under a new card id. The row and the
 * conversation are the same run; only the engine's session id says so, so that
 * is what they are matched on. A row the restart did not take up stays parked.
 */

export interface CutConsoleRow {
    id: string;
    status: string;
    hostedSessionId?: string;
}

export interface LiveCard {
    id: string;
    sessionId?: string;
    status: string;
}

/** Which cut rows go back on which card: one card per row, a live card only. */
export function reattachPlan(rows: readonly CutConsoleRow[], cards: readonly LiveCard[]): { taskId: string; cardId: string }[] {
    const live = cards.filter(c => !!c.sessionId && c.status !== 'ended' && c.status !== 'error');
    const taken = new Set<string>();
    const out: { taskId: string; cardId: string }[] = [];
    for (const r of rows) {
        if (r.status !== 'queued' || !r.hostedSessionId) { continue; }
        const card = live.find(c => c.sessionId === r.hostedSessionId && !taken.has(c.id));
        if (!card) { continue; }
        taken.add(card.id);
        out.push({ taskId: r.id, cardId: card.id });
    }
    return out;
}
