/**
 * S-77 — WHAT A SURFACE SAYS ABOUT A SESSION'S BATON RELAY, DERIVED ONCE.
 *
 * The Console card, the status bar and the sessions table answer the same
 * question — "is this run a leg of a relay, and what is the next leg waiting
 * for?" — so the words are built here and every surface renders them.
 * Pure: the list and the clock come in, nothing is read.
 */
import { Baton, isLive, openerOf } from './baton';
import { chainMaxLegs, isSeal } from './batonSeal';

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
        case 'done': return `Successor: none — the chain ended: ${b.why}`;
        case 'failed': return `Successor: none — the chain failed: ${b.why}`;
        default: return `Successor: refused — ${b.why}`;
    }
}

export interface BatonBarView {
    /** SHORTHAND — `⑂ 3/6 · 14:37`: the leg the newest running chain is on or opens next, its ceiling, a park's wake */
    text: string;
    /** MIRROR — what the text says in full, one line per running chain, then the brake */
    tooltip: string;
    chainId: string;
    /** the session running that chain's leg right now, when one is */
    sessionId?: string;
}

/** One running chain in one line. `leg` is the newest hop + 1: the leg it is on, or the one it opens next. */
function barLine(b: Baton, leg: number, max: string, fmt: (t: number) => string): string {
    const at = `Chain ${b.chainId} — leg ${leg}${max}`;
    switch (b.state) {
        case 'started': return `${at} running (session ${short(b.toSessionId)}).`;
        case 'waiting-end': return `${at} opens when session ${short(b.from.sessionId)} ends.`;
        case 'parked': return `${at} parked — every account is full; wakes ${b.wakeAt ? 'at ' + fmt(b.wakeAt) : 'at the first reset'}.`;
        default: return `${at} recorded, not yet accepted.`;
    }
}

/**
 * ‼️ S-77 — THE ONE STATUS-BAR ITEM: the relay running right now, or nothing.
 * A chain runs while its newest baton is live (waiting for its session to
 * end, or parked) or is a started leg whose session `alive` still sees. With
 * several, the newest speaks and `+N` counts the rest; each has its line.
 */
export function batonBarView(
    list: readonly Baton[], maxLegs: number, alive: (sessionId: string) => boolean, fmt: (t: number) => string = hhmm
): BatonBarView | undefined {
    const byChain = new Map<string, Baton[]>();
    for (const b of list) { byChain.set(b.chainId, [...(byChain.get(b.chainId) ?? []), b]); }
    const running = [...byChain.values()]
        .map(bs => [...bs].sort((a, b) => b.hop - a.hop || b.updatedAt - a.updatedAt)[0])
        .filter(n => isLive(n) || (n.state === 'started' && !!n.toSessionId && alive(n.toSessionId)))
        .sort((a, b) => b.updatedAt - a.updatedAt);
    if (!running.length) { return undefined; }
    const top = running[0];
    const cap = (b: Baton) => chainMaxLegs(list, b.chainId, maxLegs);
    const max = cap(top) > 0 ? `/${cap(top)}` : '';
    const wake = top.state === 'parked' && top.wakeAt ? ` · ${fmt(top.wakeAt)}` : '';
    const more = running.length > 1 ? ` +${running.length - 1}` : '';
    const lines = running.map(b => barLine(b, b.hop + 1, cap(b) > 0 ? ` of ${cap(b)}` : '', fmt));
    return {
        text: `⑂ ${top.hop + 1}${max}${wake}${more}`,
        tooltip: [
            `Baton relay — ${running.length === 1 ? 'one chain' : running.length + ' chains'} running`,
            '',
            ...lines,
            '',
            maxLegs > 0 ? `Ceiling: ${maxLegs} legs a chain (agentFarm.batonMaxHops).` : 'No leg ceiling (agentFarm.batonMaxHops = 0).',
            `Brake: ✕ Stop chain on the card, or baton.stop chain=${top.chainId}.`
        ].join('\n'),
        chainId: top.chainId,
        ...(top.state === 'started' && top.toSessionId ? { sessionId: top.toSessionId }
            : top.state === 'waiting-end' ? { sessionId: top.from.sessionId } : {})
    };
}

/**
 * The relay seen from one session: the baton that opened it (its
 * predecessor) and the one it left (its successor). Undefined for a session
 * no baton touched.
 */
export function batonCardView(list: readonly Baton[], sessionId: string): BatonCardView | undefined {
    const sid = String(sessionId ?? '').trim();
    if (!sid) { return undefined; }
    const opener = openerOf(list, sid);
    const left = [...list].filter(b => b.from.sessionId === sid && !isSeal(b)).sort((a, b) => b.updatedAt - a.updatedAt)[0];
    const anchor = opener ?? left;
    if (!anchor) { return undefined; }
    const chainId = anchor.chainId;
    const leg = opener ? opener.hop + 1 : left!.hop;
    const chain = list.filter(b => b.chainId === chainId);
    const legs = Math.max(leg, ...chain.map(b => b.hop + (b.state === 'started' ? 1 : 0)));
    const lines = [
        `Chain: ${chainId} — leg ${leg} of ${legs} so far.`,
        opener && !isSeal(opener)
            ? `Predecessor: session ${short(opener.from.sessionId)} (${opener.from.agentId.split(/[\\/]/).pop()} · ${opener.from.engine}) `
                + (opener.rescue ? `ended without passing — the failsafe opened this run: ${opener.rescue}.` : 'passed the baton to this run.')
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
