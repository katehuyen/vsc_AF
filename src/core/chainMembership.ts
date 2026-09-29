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
import { stamp } from './aftime';

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

/** `opened` / `passed` — when the pass that opened this leg and the one it left were recorded, when on record. */
export interface ChainLeg { leg: number; sessionId: string; opened?: number; passed?: number }

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

interface Claim { chainId: string; leg: number; rank: number; at: number; opened?: number }

/**
 * A session opened by a pass outranks one that only passed (openerOf's order:
 * a started pass before a seal, then the newest) — a session a second seal
 * attached to is still the leg its first chain opened.
 *
 * ‼️ U-170 — A CHAIN IS NOT ASSUMED TO HAVE FLOWED THE IDEAL WAY. A leg can
 * pass twice (two successors share a number), end the chain and reopen it (a
 * `done` and a `started` on one hop), lose links to the store's cap (a gap),
 * or be resumed long after it passed (its row sorts late). So legs are keyed
 * by SESSION, never by number: every session on record is listed, ordered by
 * leg then by when it opened, and a place is found by the session itself.
 */
export function chainIndex(links: readonly ChainLink[]): ChainIndex {
    const claims = new Map<string, Claim>();
    const passed = new Map<string, number>();
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
        if (l.state === 'started' && l.to) {
            claim(l.to, { chainId: l.chainId, leg: l.hop + 1, rank: l.hop === 0 ? 2 : 3, at: l.createdAt, opened: l.createdAt });
        }
        if (l.hop >= 1) {
            claim(l.from, { chainId: l.chainId, leg: l.hop, rank: 1, at: l.createdAt });
            const key = `${l.chainId}\n${l.from}`;
            passed.set(key, Math.max(passed.get(key) ?? 0, l.createdAt));
        }
    }
    const bySession = new Map<string, { chainId: string; leg: number }>();
    const legs = new Map<string, ChainLeg[]>();
    for (const [sid, c] of claims) {
        bySession.set(sid, { chainId: c.chainId, leg: c.leg });
        const p = passed.get(`${c.chainId}\n${sid}`);
        const list = legs.get(c.chainId) ?? [];
        list.push({ leg: c.leg, sessionId: sid, ...(c.opened ? { opened: c.opened } : {}), ...(p ? { passed: p } : {}) });
        legs.set(c.chainId, list);
    }
    const byChain = new Map<string, { legs: ChainLeg[]; open: boolean }>();
    for (const [chainId, list] of legs) {
        const t = top.get(chainId);
        byChain.set(chainId, {
            legs: list.sort((a, b) => a.leg - b.leg || (a.opened ?? a.passed ?? 0) - (b.opened ?? b.passed ?? 0)),
            open: !!t && (isLive(t) || t.state === 'started')
        });
    }
    return { bySession, byChain };
}

export function chainPlace(ix: ChainIndex, sessionId: string): ChainPlace | undefined {
    const sid = String(sessionId ?? '').trim();
    const at = ix.bySession.get(sid);
    const chain = at ? ix.byChain.get(at.chainId) : undefined;
    if (!at || !chain) { return undefined; }
    const i = chain.legs.findIndex(l => l.sessionId === sid);
    const prev = i > 0 ? chain.legs[i - 1].sessionId : undefined;
    const next = i >= 0 && i < chain.legs.length - 1 ? chain.legs[i + 1].sessionId : undefined;
    return {
        chainId: at.chainId, leg: at.leg, legs: chain.legs,
        ...(prev ? { prev } : {}), ...(next ? { next } : {}),
        first: i === 0 && at.leg === 1, last: i === chain.legs.length - 1, open: chain.open
    };
}

/**
 * ‼️ U-174 — THE ⑂ BATON CATEGORY: a run a program started that is a leg of a
 * relay. A person's own session attached as leg 1 stays 🧑 You; a relay leg is
 * never a mission. The Sessions table asks the same question of its row
 * (`r.chain` + an `auto` origin), the Search page and `sessions.recent` ask this.
 */
export function isBatonRun(ix: ChainIndex, sessionId: string, origin: string): boolean {
    return origin === 'auto' && ix.bySession.has(String(sessionId ?? '').trim());
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

/**
 * U-170 — WHEN THE LEG RAN, so a row the table sorts by its latest activity (a
 * leg resumed long after it passed) still says which stretch of the chain it was.
 */
export function legWindow(legs: readonly ChainLeg[], sessionId: string): string | undefined {
    const l = legs.find(x => x.sessionId === sessionId);
    if (!l || (!l.opened && !l.passed)) { return undefined; }
    return `Ran: ${l.opened ? stamp(l.opened) : '?'} → ${l.passed ? stamp(l.passed) + ' (passed)' : 'no pass on record'}.`;
}

/** `session 1a2b3c4d (leg 12)` — the number is named, so a gap in the record shows. */
export function legName(legs: readonly ChainLeg[], sessionId: string): string {
    const l = legs.find(x => x.sessionId === sessionId);
    return `session ${sessionId.slice(0, 8)}${l ? ` (leg ${l.leg})` : ''}`;
}

/** The table's cell for a chain whose batons the store has already dropped: the place, nothing live. */
export function placeCardView(p: ChainPlace | undefined, sessionId = ''): BatonCardView | undefined {
    if (!p) { return undefined; }
    const of = p.legs[p.legs.length - 1]?.leg ?? p.leg;
    const ran = legWindow(p.legs, sessionId);
    return {
        chainId: p.chainId, leg: p.leg, chip: `⑂ ${p.leg}`,
        head: `Baton relay — leg ${p.leg}${p.first ? ' · first' : ''}${p.last && !p.open ? ' · last' : ''}`,
        lines: [
            `Chain: ${p.chainId} — leg ${p.leg} of ${of}.`,
            ...(ran ? [ran] : []),
            p.prev ? `Predecessor: ${legName(p.legs, p.prev)}.`
                : p.leg === 1 ? 'Predecessor: none — this run started the chain.' : 'Predecessor: not on record.',
            p.next ? `Successor: ${legName(p.legs, p.next)}.` : (p.open ? 'Successor: none yet.' : 'Successor: none — the chain ended here.')
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
