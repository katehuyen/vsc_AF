/**
 * U-163 — WHICH CHAIN A SESSION RAN IN, AND WHERE IN IT.
 *
 * A Chain ID is meant to work everywhere a Session ID works: the filter box,
 * the Search page, sessions.find, the right-click, the session page's arrows.
 * Every one of those asks this module, over thin chain LINKS rather than whole
 * batons — the store drops finished batons at its cap (BATON_STORE_CAP) and
 * keeps their links (batonStore.links), so an old chain is still a chain.
 *
 * Leg numbering is the relay's own: a pass carries its opener's hop + 1, so the
 * session a hop was started for is leg hop + 1 and the one that passed it is
 * leg hop (the seal, hop 0, names leg 1).
 */
import { Baton, BatonState, isLive } from './baton';
import { BatonCardView } from './batonView';

export interface ChainLink {
    chainId: string;
    hop: number;
    /** the session that passed (on the seal: the first leg itself) */
    from: string;
    /** the session this hop started */
    to?: string;
    state: BatonState;
    createdAt: number;
    updatedAt: number;
}

export const linkOf = (b: Baton): ChainLink => ({
    chainId: b.chainId, hop: b.hop, from: b.from.sessionId,
    ...(b.toSessionId ? { to: b.toSessionId } : {}),
    state: b.state, createdAt: b.createdAt, updatedAt: b.updatedAt
});

export interface ChainLeg { leg: number; sessionId: string }

export interface ChainIndex {
    bySession: Map<string, { chainId: string; leg: number }>;
    byChain: Map<string, { legs: ChainLeg[]; open: boolean }>;
}

/** Where one session stands in its chain. */
export interface ChainPlace {
    chainId: string;
    leg: number;
    /** every leg known, oldest first */
    legs: ChainLeg[];
    prev?: string;
    next?: string;
    first: boolean;
    last: boolean;
    /** the chain can still grow: a successor waits, or its newest leg is running */
    open: boolean;
}

interface Claim { chainId: string; leg: number; rank: number; at: number }

/**
 * A session opened by a pass outranks one that only passed (openerOf's order:
 * a started pass before a seal, then the newest) — a session a second seal
 * attached to is still the leg its first chain opened.
 */
export function chainIndex(links: readonly ChainLink[]): ChainIndex {
    const claims = new Map<string, Claim>();
    const top = new Map<string, ChainLink>();
    const claim = (sid: string | undefined, c: Claim): void => {
        if (!sid) { return; }
        const had = claims.get(sid);
        if (!had || c.rank > had.rank || (c.rank === had.rank && c.at > had.at)) { claims.set(sid, c); }
    };
    for (const l of links) {
        if (!l || !l.chainId) { continue; }
        const t = top.get(l.chainId);
        if (!t || l.hop > t.hop || (l.hop === t.hop && l.updatedAt > t.updatedAt)) { top.set(l.chainId, l); }
        if (l.state === 'started' && l.to) { claim(l.to, { chainId: l.chainId, leg: l.hop + 1, rank: l.hop === 0 ? 2 : 3, at: l.createdAt }); }
        if (l.hop >= 1) { claim(l.from, { chainId: l.chainId, leg: l.hop, rank: 1, at: l.createdAt }); }
    }
    const bySession = new Map<string, { chainId: string; leg: number }>();
    const legs = new Map<string, Map<number, string>>();
    for (const [sid, c] of claims) {
        bySession.set(sid, { chainId: c.chainId, leg: c.leg });
        const m = legs.get(c.chainId) ?? new Map<number, string>();
        if (!m.has(c.leg)) { m.set(c.leg, sid); }
        legs.set(c.chainId, m);
    }
    const byChain = new Map<string, { legs: ChainLeg[]; open: boolean }>();
    for (const [chainId, m] of legs) {
        const t = top.get(chainId);
        byChain.set(chainId, {
            legs: [...m.entries()].sort((a, b) => a[0] - b[0]).map(([leg, sessionId]) => ({ leg, sessionId })),
            open: !!t && (isLive(t) || t.state === 'started')
        });
    }
    return { bySession, byChain };
}

export function chainPlace(ix: ChainIndex, sessionId: string): ChainPlace | undefined {
    const at = ix.bySession.get(String(sessionId ?? '').trim());
    const chain = at ? ix.byChain.get(at.chainId) : undefined;
    if (!at || !chain) { return undefined; }
    const i = chain.legs.findIndex(l => l.leg === at.leg);
    const prev = i > 0 ? chain.legs[i - 1].sessionId : undefined;
    const next = i >= 0 && i < chain.legs.length - 1 ? chain.legs[i + 1].sessionId : undefined;
    return {
        chainId: at.chainId, leg: at.leg, legs: chain.legs,
        ...(prev ? { prev } : {}), ...(next ? { next } : {}),
        first: i === 0 && at.leg === 1, last: i === chain.legs.length - 1, open: chain.open
    };
}

/** The sessions of every chain whose id contains `q` (case-blind), or none. */
export function chainSessionsMatching(ix: ChainIndex, q: string): Set<string> {
    const needle = String(q ?? '').trim().toLowerCase();
    const out = new Set<string>();
    if (needle.length < 4) { return out; }
    for (const [chainId, c] of ix.byChain) {
        if (chainId.toLowerCase().includes(needle)) { for (const l of c.legs) { out.add(l.sessionId); } }
    }
    return out;
}

/** The table's cell for a chain whose batons the store has already dropped: the place, nothing live. */
export function placeCardView(p: ChainPlace | undefined): BatonCardView | undefined {
    if (!p) { return undefined; }
    const of = p.legs[p.legs.length - 1]?.leg ?? p.leg;
    return {
        chainId: p.chainId, leg: p.leg, chip: `⑂ ${p.leg}`,
        head: `Baton relay — leg ${p.leg}${p.first ? ' · first' : ''}${p.last && !p.open ? ' · last' : ''}`,
        lines: [
            `Chain: ${p.chainId} — leg ${p.leg} of ${of}.`,
            p.prev ? `Predecessor: session ${p.prev.slice(0, 8)}.`
                : p.leg === 1 ? 'Predecessor: none — this run started the chain.' : 'Predecessor: not on record.',
            p.next ? `Successor: session ${p.next.slice(0, 8)}.` : (p.open ? 'Successor: none yet.' : 'Successor: none — the chain ended here.')
        ],
        stoppable: false
    };
}

let source: (() => readonly ChainLink[]) | undefined;

/** The host hands the store's links in once (batonStore.links). */
export function setChainSource(fn: () => readonly ChainLink[]): void { source = fn; }

export function chainIndexNow(): ChainIndex {
    try { return chainIndex(source?.() ?? []); } catch { return chainIndex([]); }
}
