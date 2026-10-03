/**
 * S-123 — WHICH RELAY LEG A SESSION IS, one verdict for every surface that
 * draws a run's ⑂ (the Sessions table, the Live Timeline's cards): the live
 * baton's own view while the store still holds the chain's batons, else the
 * place the chain index keeps after they were dropped (U-168). Pure.
 */
import { Baton } from './baton';
import { BatonCardView, batonCardView } from './batonView';
import { ChainIndex, chainPlace, placeCardView } from './chainMembership';

/** One snapshot of the store and the index, asked per session. */
export function sessionChainOf(batons: readonly Baton[], chains: ChainIndex): (sessionId: string) => BatonCardView | undefined {
    const relay = new Set<string>();
    for (const b of batons) { relay.add(b.from.sessionId); if (b.toSessionId) { relay.add(b.toSessionId); } }
    return sessionId => {
        if (!sessionId) { return undefined; }
        return (relay.has(sessionId) ? batonCardView(batons, sessionId) : undefined) ?? placeCardView(chainPlace(chains, sessionId), sessionId);
    };
}
