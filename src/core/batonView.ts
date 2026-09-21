/**
 * S-77 — WHAT A SURFACE SAYS ABOUT A SESSION'S BATON RELAY, DERIVED ONCE.
 *
 * The Console card, the status bar and the sessions table answer the same
 * question — "is this run a leg of a relay, and what is the next leg waiting
 * for?" — so the words are built here and every surface renders them.
 * Pure: the list and the clock come in, nothing is read.
 */
import { Baton, isLive } from './baton';

export interface BatonCardView {
    chainId: string;
    /** this run's leg in the chain: 1 for the run that started it */
    leg: number;
    /** SHORTHAND for the strip — `⑂ 3` */
    chip: string;
    /** MIRROR — the panel's first line */
    head: string;
    lines: string[];
    /** a live baton in the chain the user can brake (baton.stop chain=) */
    stoppable: boolean;
}

const short = (id: string | undefined): string => String(id ?? '').slice(0, 8);

const hhmm = (ts: number): string => {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** What the leg after this run is doing, in one line. */
function nextLine(b: Baton): string {
    switch (b.state) {
        case 'armed': return 'Successor: recorded, not yet accepted.';
        case 'waiting-end': return 'Successor: waits for this session to end — nothing starts while it is alive.';
        case 'parked': return `Successor: parked — every account is full; wakes ${b.wakeAt ? 'at ' + hhmm(b.wakeAt) : 'at the first reset'}.`;
        case 'started': return `Successor: running — session ${short(b.toSessionId)}${b.taskId ? ` (task ${b.taskId})` : ''}.`;
        case 'stopped': return `Successor: stopped — ${b.why}`;
        default: return `Successor: refused — ${b.why}`;
    }
}

/**
 * The relay seen from one session: the baton that opened it (its
 * predecessor) and the one it left (its successor). Undefined for a session
 * no baton touched.
 */
export function batonCardView(list: readonly Baton[], sessionId: string): BatonCardView | undefined {
    const sid = String(sessionId ?? '').trim();
    if (!sid) { return undefined; }
    const opener = list.find(b => b.state === 'started' && b.toSessionId === sid);
    const left = [...list].filter(b => b.from.sessionId === sid).sort((a, b) => b.updatedAt - a.updatedAt)[0];
    const anchor = opener ?? left;
    if (!anchor) { return undefined; }
    const chainId = anchor.chainId;
    const leg = opener ? opener.hop + 1 : left!.hop;
    const chain = list.filter(b => b.chainId === chainId);
    const legs = Math.max(leg, ...chain.map(b => b.hop + (b.state === 'started' ? 1 : 0)));
    const lines = [
        `Chain: ${chainId} — leg ${leg} of ${legs} so far.`,
        opener
            ? `Predecessor: session ${short(opener.from.sessionId)} (${opener.from.agentId.split(/[\\/]/).pop()} · ${opener.from.engine}) passed the baton to this run.`
            : 'Predecessor: none — this run started the chain.',
        left ? nextLine(left) : 'Successor: none yet — this run has not passed the baton.'
    ];
    if (left?.note) { lines.push(`Note: ${left.note}`); }
    const stoppable = chain.some(isLive);
    lines.push(stoppable
        ? `Brake: baton.stop chain=${chainId} — recorded, never deleted.`
        : 'The chain ends when the work is done and nobody passes.');
    return {
        chainId, leg, chip: `⑂ ${leg}`,
        head: `Baton relay — leg ${leg}${left && isLive(left) ? ' · successor waiting' : ''}`,
        lines, stoppable
    };
}
