/**
 * ‼️ U-170 — A RELAY LEG IS NAMED BY ITS CHAIN'S SUBJECT, NOT BY THE HEADER IT WAS OPENED WITH.
 *
 * A leg's first prompt opens with the relay header (`=== BATON RELAY — chain …
 * · leg 14/25 ===`), and the title derived from it froze two facts at launch:
 * a leg number the chain column already shows, and a ceiling the user can
 * change mid-chain — so one chain listed "leg 14/25" beside "leg 23/35". The
 * header is machinery (and the user can reword it: agentFarm.batonHandoverTemplate),
 * so a leg is recognised by the chain record instead, and takes the title of
 * the session that started the chain: a relay is one job carried by many legs.
 * Undefined = not a successor leg, or its first leg is not on record — the
 * caller keeps the title it had.
 */
import { ChainIndex } from './chainMembership';

export function relaySubject(
    ix: ChainIndex, sessionId: string, titleOf: (sessionId: string) => string | undefined
): string | undefined {
    const at = ix.bySession.get(String(sessionId ?? '').trim());
    if (!at || at.leg < 2) { return undefined; }
    const root = ix.byChain.get(at.chainId)?.legs.find(l => l.leg === 1);
    if (!root || root.sessionId === sessionId) { return undefined; }
    const t = String(titleOf(root.sessionId) ?? '').trim();
    return t || undefined;
}
