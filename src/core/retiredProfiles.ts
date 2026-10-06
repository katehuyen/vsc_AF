/**
 * S-135 — A ROUTE ID IS GIVEN ONCE.
 *
 * A launch records the profile id it ran on, so the id is how every past
 * session names its route. An id handed out again after its profile was
 * removed would file a different endpoint and a different key under that same
 * history: the tables' profile filter would merge the two, and a resume of an
 * old conversation would find "its" profile again and run on the new one.
 *
 * Retired = removed here (kept in the extension's own storage) or named by a
 * launch record while no current profile carries it — the second half covers
 * every profile removed before the first half existed. Pure: the caller reads
 * both stores.
 */

import { LaunchManifest } from './launchManifest';

export const RETIRED_PROFILES_KEY = 'agentfarm.retiredProviderProfiles';

const idOf = (v: unknown): string => (typeof v === 'string' ? v.trim().toLowerCase() : '');

export function retiredProfileIds(
    current: readonly { id: string }[],
    manifests: readonly LaunchManifest[] | undefined,
    stored: readonly unknown[] | undefined
): string[] {
    const live = new Set((current || []).map(p => idOf(p && p.id)));
    const out = new Set<string>();
    for (const v of stored || []) { const id = idOf(v); if (id) { out.add(id); } }
    for (const m of manifests || []) {
        const id = idOf(m && m.identity && m.identity.providerProfileId);
        if (id) { out.add(id); }
    }
    return [...out].filter(id => !live.has(id)).sort();
}

/** The stored list with one more id in it — never a second copy. */
export function retire(stored: readonly unknown[] | undefined, id: string): string[] {
    const list = (stored || []).map(idOf).filter(Boolean);
    const want = idOf(id);
    return !want || list.includes(want) ? list : [...list, want];
}
