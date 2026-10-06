/**
 * S-138 — HOW FULL THE LAUNCH RECORDS ARE, read rather than guessed.
 *
 * The manifests and the session → launch pairs are both bounded; past the cap
 * the oldest plain rows go (a routed launch is kept, S-136). Nothing said so:
 * the first sign was a past session showing no route. This is the reading
 * `farm.health` carries, with a warning once a store is near its cap.
 */

import { isRoutedManifest, LaunchManifest, MANIFEST_CAP } from './launchManifest';
import { SPAWN_PAIR_CAP, SpawnPair } from './spawnIds';

/** The share of a cap at which the reading starts to warn. */
export const NEAR_CAP = 0.9;

export interface LaunchRecordHealth {
    manifests: number;
    cap: number;
    /** The oldest launch still on record (YYYY-MM-DD), null when there is none. */
    oldest: string | null;
    /** Launches on an Agent Farm route profile — the ones the cap keeps. */
    routed: number;
    spawnPairs: number;
    pairCap: number;
    warning: string | null;
}

export function launchRecordHealth(
    manifests: readonly LaunchManifest[] | undefined, pairs: readonly SpawnPair[] | undefined,
    cap = MANIFEST_CAP, pairCap = SPAWN_PAIR_CAP
): LaunchRecordHealth {
    const list = (manifests || []).filter(Boolean);
    const ats = list.map(m => m.at).filter(a => typeof a === 'number' && a > 0).sort((a, b) => a - b);
    const n = list.length, p = (pairs || []).length;
    const near: string[] = [];
    if (n >= NEAR_CAP * cap) { near.push(`launch records ${n}/${cap}`); }
    if (p >= NEAR_CAP * pairCap) { near.push(`session-launch pairs ${p}/${pairCap}`); }
    return {
        manifests: n, cap,
        oldest: ats.length ? new Date(ats[0]).toISOString().slice(0, 10) : null,
        routed: list.filter(isRoutedManifest).length,
        spawnPairs: p, pairCap,
        warning: near.length
            ? `${near.join(' and ')} — near the cap: the oldest plain launches are dropped from here on and those `
                + 'sessions stop showing what they were launched with; a launch on a route profile is kept.'
            : null
    };
}
