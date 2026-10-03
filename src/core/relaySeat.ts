/**
 * S-129 — WHO HOLDS AN AGENT'S SEAT AGAINST A RUN.
 *
 * The per-agent ceiling (agentFarm.maxConcurrentPerAgent) counts the agent's
 * running task rows. A relay successor is opened through the same door as any
 * row (batonDoor.ts), so it met that ceiling too — and the relay was built for
 * ONE chain per agent: the only holder a successor could ever meet was its own
 * predecessor's row, closing a beat after its session ended (X-355).
 *
 * Measured 2026-10-03: two chains ran in the developer agent (one of them
 * opened from a Console session, which is no task row and holds no seat). Both
 * legs passed within minutes, the older successor took the one seat, and the
 * other one waited "agent busy" behind a stay-open Console leg whose row stays
 * running for as long as that conversation is open — with no end in sight.
 *
 * So a row that CONTINUES a chain is held only by its own chain: a row of that
 * chain, or the predecessor's row it was opened after (a first leg, or a row
 * written before this mark existed, carries no chain). Other chains' legs and
 * the agent's rows outside any chain do not hold it. Every other row counts
 * every running row of its agent, exactly as before. Pure; tasks.ts asks it.
 */

/** S-129 — a row the relay door opened: the chain it continues, and the row of the leg it follows. */
export interface RelayMark {
    chainId: string;
    /** the predecessor's task row, when it ran on one */
    after?: string;
}

export interface SeatRow {
    id: string;
    title?: string;
    relayOf?: RelayMark;
}

/** The running rows of the same agent that hold the seat against `task`. */
export function seatHolders<T extends SeatRow>(task: { relayOf?: RelayMark }, running: readonly T[]): T[] {
    const chain = String(task.relayOf?.chainId ?? '').trim();
    if (!chain) { return [...running]; }
    const after = String(task.relayOf?.after ?? '').trim();
    return running.filter(t => String(t.relayOf?.chainId ?? '').trim() === chain || (!!after && t.id === after));
}

/** The hold's sentence: the agent, and the row that holds it by name. */
export function agentBusyReason(agentName: string, holders: readonly SeatRow[]): string {
    const first = holders[0];
    if (!first) { return `agent busy (${agentName})`; }
    const more = holders.length > 1 ? ` and ${holders.length - 1} more` : '';
    return `agent busy (${agentName}) — held by "${first.title || first.id}" (task ${first.id})${more}`;
}
