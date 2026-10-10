/**
 * X-525 (5) — SAVED RECORDS NAMING A ROUTE THAT IS GONE, OR NOT MARKED FOR THEIR ENGINE: the cleanup's
 * `route-ref` kind, for every path the removal question never saw (settings.json edited by hand, settings
 * sync, another machine, an import).
 *
 * The rule: a record that names a MODEL moves to the one live route serving that model — marked for its
 * engine, with a key, and (Claude) holding it in the record's own tier — when exactly one does, and the
 * move is announced. Anything else waits for a person: cleared or (launch profiles) deleted on their word,
 * or left as it is, which is harmless — a launch landing on it is refused (resolveLaunchRoute).
 * A route with no key is not a broken binding; it is a key to give.
 */

import { applyRouteChange, RouteRecord, RouteSnapshot, RouteStore, collectRouteRecords } from './routeRecords';
import { namedRouteId } from './savedRoutes';
import { routeIdOfWire } from './opencodeRoutes';
import { describeDependent, LiveRoute } from './routeGoing';

export interface RouteRefItem {
    /** `route-ref:<engine>:<route id>` — one item per broken route per engine */
    id: string;
    routeId: string;
    engine: string;
    records: RouteRecord[];
    title: string;
    why: string;
}

export interface RouteRefMove { record: string; from: string; to: string; model: string }

const keyOf = (engine: string, routeId: string): string => `route-ref:${engine}:${routeId}`;

/** The model a record names for itself: Claude's model, OpenCode's model under the route. '' when none. */
export function recordModel(r: RouteRecord): string {
    const m = String(r.model ?? '').trim();
    if (r.engine !== 'opencode') { return m; }
    const slash = m.indexOf('/');
    return slash > 0 && routeIdOfWire(m.slice(0, slash)) ? m.slice(slash + 1) : '';
}

/** The one live route a record can move to by its own model name, or nothing when none or several do. */
export function uniqueStandIn(r: RouteRecord, routes: readonly LiveRoute[]): string | undefined {
    const m = recordModel(r);
    if (!m) { return undefined; }
    const tier = r.engine === 'claude' ? String(r.rows[0]?.tier ?? '').trim() : '';
    const gone = namedRouteId(r);
    const fits = routes.filter(c => c.id !== gone && c.hasKey && c.engines.includes(r.engine)
        && Object.values(c.tiers ?? {}).includes(m) && (!tier || (c.tiers ?? {})[tier] === m));
    return fits.length === 1 ? fits[0].id : undefined;
}

/** Every route a saved record names that is not there for its engine, grouped by route and engine. */
export function brokenRouteRefs(records: readonly RouteRecord[], routes: readonly LiveRoute[]): RouteRefItem[] {
    const groups = new Map<string, RouteRefItem>();
    for (const r of records) {
        const id = namedRouteId(r);
        if (!id) { continue; }
        const live = routes.find(x => x.id === id);
        if (live && live.engines.includes(r.engine)) { continue; }
        const key = keyOf(r.engine, id);
        const g = groups.get(key) ?? {
            id: key, routeId: id, engine: r.engine, records: [], title: '',
            why: live ? `route "${id}" is not marked for ${r.engine}` : `route "${id}" no longer exists`
        };
        g.records.push(r);
        groups.set(key, g);
    }
    return [...groups.values()].map(g => ({
        ...g, title: `${g.records.length} saved record${g.records.length === 1 ? '' : 's'} naming "${g.routeId}" on ${g.engine}: `
            + g.records.map(describeDependent).join(', ')
    }));
}

/**
 * Applies the rule to the items named (all when absent): moves by a unique model match, then — only when
 * a person said so — clears or deletes what is left. Edits the snapshot in place; names the stores touched.
 */
export function fixRouteRefs(
    snap: RouteSnapshot, routes: readonly LiveRoute[], ids?: readonly string[], then?: 'clear' | 'delete'
): { moved: RouteRefMove[]; settled: string[]; left: RouteRefItem[]; stores: RouteStore[] } {
    const want = (x: RouteRefItem) => !ids || ids.includes(x.id);
    const stores = new Set<RouteStore>();
    const moved: RouteRefMove[] = [];
    for (const item of brokenRouteRefs(collectRouteRecords(snap), routes).filter(want)) {
        for (const r of item.records) {
            const to = uniqueStandIn(r, routes);
            if (!to) { continue; }
            const row = r.rows[0];
            applyRouteChange(snap, item.routeId, { kind: 'repoint', to }, x => x.rows[0] === row).stores.forEach(s => stores.add(s));
            moved.push({ record: describeDependent(r), from: item.routeId, to, model: recordModel(r) });
        }
    }
    const settled: string[] = [];
    if (then) {
        for (const item of brokenRouteRefs(collectRouteRecords(snap), routes).filter(want)) {
            applyRouteChange(snap, item.routeId, { kind: then }, x => x.engine === item.engine).stores.forEach(s => stores.add(s));
            settled.push(item.id);
        }
    }
    return { moved, settled, left: brokenRouteRefs(collectRouteRecords(snap), routes).filter(want), stores: [...stores] };
}
