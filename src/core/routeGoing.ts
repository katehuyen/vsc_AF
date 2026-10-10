/**
 * X-525 (3) — A ROUTE LEAVES (removed, or unmarked for an engine) ONLY ONCE THE RECORDS NAMING IT ARE SETTLED.
 *
 * Nothing names it → it goes. Something does → refused, the records listed, until the caller says what
 * happens to them: `repoint` to a route serving the same models (servesSameModels — the same vendor is
 * never enough), `clear` (they knowingly run on no route), or `delete` (launch profiles are deleted,
 * every other record is cleared). History is never touched: routeRecords.ts counts none of it.
 */

import { applyRouteChange, collectRouteRecords, RouteRecord, RouteSnapshot, RouteStore, RouteThen } from './routeRecords';
import { routeDependents, servesSameModels } from './savedRoutes';

/** A route as it stands now: the engines it is marked for, the model in each tier, whether it has a key. */
export interface LiveRoute { id: string; engines: readonly string[]; tiers?: Record<string, string>; hasKey: boolean }

export interface RouteGoingAsk {
    id: string;
    then?: unknown;
    to?: unknown;
    /** unmarking engines: only records on these engines are the route's dependents */
    leaving?: readonly string[];
}

export interface RouteGoingVerdict {
    dependents: RouteRecord[];
    /** routes that serve the same models for every engine the dependents run on */
    standIns: string[];
    then?: RouteThen;
    refusal?: string;
    /** refused only because nobody said what happens to the dependents — a person can be asked */
    needsChoice?: boolean;
}

export function describeDependent(r: RouteRecord): string {
    return `${r.label} (${r.kind}${r.engine === 'claude' ? '' : `, ${r.engine}`})`;
}

export function routeGoingVerdict(ask: RouteGoingAsk, records: RouteRecord[], routes: readonly LiveRoute[]): RouteGoingVerdict {
    const id = String(ask.id ?? '').trim();
    const dependents = routeDependents(id, records).filter(r => !ask.leaving || ask.leaving.includes(r.engine));
    if (!dependents.length) { return { dependents, standIns: [] }; }
    const gone = routes.find(r => r.id === id) ?? { id, engines: [], hasKey: false };
    const engines = [...new Set(dependents.map(r => r.engine))];
    const standIns = routes.filter(c => engines.every(e => servesSameModels(gone, c, e, c.hasKey))).map(c => c.id);
    const base = { dependents, standIns };
    const then = String(ask.then ?? '').trim().toLowerCase();
    const to = String(ask.to ?? '').trim().toLowerCase();
    const serving = standIns.length ? `routes serving the same models: ${standIns.join(', ')}` : 'no route serves the same models';
    if (!then) {
        return {
            ...base, needsChoice: true,
            refusal: `${dependents.length === 1 ? 'one saved record names' : `${dependents.length} saved records name`} route `
                + `"${id}": ${dependents.map(describeDependent).join(', ')}. Say what happens to them — `
                + `then=repoint with to=<route> (${serving}), then=clear, or then=delete (launch profiles deleted, the rest cleared).`
        };
    }
    if (then === 'clear' || then === 'delete') { return { ...base, then: { kind: then } }; }
    if (then !== 'repoint') { return { ...base, refusal: `then is repoint, clear or delete — not "${then}".` }; }
    if (!standIns.includes(to)) {
        return {
            ...base,
            refusal: `${to ? `route "${to}"` : 'then=repoint needs to=<route>; a route'} can take "${id}"'s place only when it is marked for `
                + `${engines.join(' and ')}, has a key and holds the same model in every tier "${id}" fills — ${serving}.`
        };
    }
    return { ...base, then: { kind: 'repoint', to } };
}

export interface RouteGoingIo {
    snapshot(): RouteSnapshot;
    routes(): LiveRoute[];
    /** writes one store back from the edited snapshot */
    write(store: RouteStore, snap: RouteSnapshot): Promise<void>;
}

/** Decides, and when allowed applies the decision to every dependent and writes the stores it touched. */
export async function settleRouteRecords(ask: RouteGoingAsk, io: RouteGoingIo): Promise<RouteGoingVerdict> {
    const snap = io.snapshot();
    const verdict = routeGoingVerdict(ask, collectRouteRecords(snap), io.routes());
    if (!verdict.then) { return verdict; }
    const { stores } = applyRouteChange(snap, String(ask.id).trim(), verdict.then, ask.leaving);
    for (const s of stores) { await io.write(s, snap); }
    return verdict;
}
