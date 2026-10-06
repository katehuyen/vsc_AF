/**
 * ‼️ X-506 — WHICH SPAWN PRODUCED WHICH SESSION OUTLIVES THE CARD AND THE WINDOW.
 *
 * The pairs `SessionIndex.setSpawnIds` joins a hand-opened terminal or Console
 * card to its launch manifest were read off the live terminals and cards and
 * nowhere else. Close the card, or reload the window, and the session lost its
 * manifest: the resume gate answered "started before launches were recorded"
 * for a conversation started an hour earlier on a route, and resumed it on
 * none. The manifest itself was still on file; only the join was gone.
 *
 * So the pairs are kept. FIRST WINS, the rule `setSpawnIds` already follows: a
 * session belongs to the spawn that produced it, and a resume records no new
 * launch. Bounded the way the manifests are — the oldest pair goes first.
 */
export interface SpawnPair {
    sessionId: string;
    launchId: string;
}

export const SPAWN_PAIR_CAP = 2000;

export function keepSpawnPairs(
    stored: readonly SpawnPair[] | undefined, live: readonly SpawnPair[], cap = SPAWN_PAIR_CAP
): { pairs: SpawnPair[]; changed: boolean } {
    const seen = new Set<string>();
    const pairs: SpawnPair[] = [];
    const add = (p: SpawnPair | undefined): boolean => {
        const sessionId = String(p?.sessionId ?? '').trim();
        const launchId = String(p?.launchId ?? '').trim();
        if (!sessionId || !launchId || seen.has(sessionId)) { return false; }
        seen.add(sessionId);
        pairs.push({ sessionId, launchId });
        return true;
    };
    for (const p of stored ?? []) { add(p); }
    let changed = false;
    for (const p of live) { if (add(p)) { changed = true; } }
    if (pairs.length > cap) { pairs.splice(0, pairs.length - cap); }
    return { pairs, changed };
}
