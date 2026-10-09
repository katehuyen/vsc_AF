/**
 * X-521 — OPENCODE'S PROVIDER AND MODEL BOXES IN TWO HEADED GROUPS: the routes Agent
 * Farm lends and the engine's own, decided by the catalog entry's `origin` (X-517 C1)
 * and never by reading an id — one mixed list is what this replaces. The row that
 * leaves the choice alone (`id: ''`) carries no group and stays first; Claude's boxes
 * are not grouped (every row there is a route).
 *
 * Pure: the caller hands the catalog it already read.
 */

import { LaunchChoice } from './launch';
import { ProviderCatalogRead } from './providerCatalog';

export const ROUTES_GROUP = 'Agent Farm routes';
export const OWN_GROUP = 'OpenCode\'s own';
const ORDER = [ROUTES_GROUP, OWN_GROUP];

/** A provider's group by its catalog origin. */
export function groupOfOrigin(origin: string | undefined): string {
    return origin === 'agent-farm-route' ? ROUTES_GROUP : OWN_GROUP;
}

/** The group of a provider id, and of a model reference by the provider its catalog row names. */
export function catalogGroups(cat: ProviderCatalogRead): { provider(id: string): string; model(ref: string): string } {
    const origin = new Map((cat.providers || []).map(p => [p.providerId, p.origin] as const));
    const rowProvider = new Map((cat.rows || []).map(r => [r.ref, r.providerId] as const));
    const provider = (id: string): string => (origin.has(id) ? groupOfOrigin(origin.get(id)) : '');
    return { provider, model: ref => provider(rowProvider.get(ref) ?? '') };
}

/** Each row stamped with its group and ordered routes first, the engine's own second; ungrouped rows lead, in their order. */
export function grouped(rows: readonly LaunchChoice[], groupOf: (id: string) => string): LaunchChoice[] {
    const stamped = rows.map(r => {
        const g = r.id ? groupOf(r.id) : '';
        return g ? { ...r, group: g } : r;
    });
    const rank = (r: LaunchChoice): number => (r.group ? ORDER.indexOf(r.group) + 1 : 0);
    return stamped.map((r, i) => ({ r, i })).sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i).map(x => x.r);
}

/** The detail a lent route's model carries when the route serves several: which of its slots it fills. */
export function slotsNote(slots: readonly string[] | undefined): string {
    return slots && slots.length ? `slots: ${slots.join(', ')}` : '';
}
