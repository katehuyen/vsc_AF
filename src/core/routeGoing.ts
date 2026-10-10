/**
 * X-525 (3) — A ROUTE LEAVES (removed, unmarked for an engine) OR A TIER CHANGES ITS MODEL ONLY ONCE THE
 * RECORDS NAMING IT ARE SETTLED.
 *
 * Nothing names it → it goes. Something does → refused, the records listed, until the caller says what
 * happens to them: `repoint` to a route serving the same models (servesSameModels — the same vendor is
 * never enough), `clear` (they knowingly run on no route), `delete` (launch profiles are deleted, every
 * other record is cleared), or — when a tier only changes its model — `keep`: a Claude record names the
 * TIER, so it runs on the tier's new model, which is what the edit was for. An emptied tier, or an
 * OpenCode record naming a model the route no longer serves, cannot be kept. History is never touched:
 * routeRecords.ts counts none of it.
 */

import { applyRouteChange, collectRouteRecords, RouteRecord, RouteSnapshot, RouteStore, RouteThen } from './routeRecords';
import { routeDependents, servesSameModels } from './savedRoutes';
import { routeIdOfWire } from './opencodeRoutes';

/** A route as it stands now: the engines it is marked for, the model in each tier, whether it has a key. */
export interface LiveRoute { id: string; engines: readonly string[]; tiers?: Record<string, string>; hasKey: boolean }

export interface RouteGoingAsk {
    id: string;
    then?: unknown;
    to?: unknown;
    /** unmarking engines: only records on these engines are the route's dependents */
    leaving?: readonly string[];
    /** tiers an edit changes or empties (tier → the model it held), and the route's tiers after the edit */
    retiring?: { tiers: Record<string, string>; after: Record<string, string> };
}

export interface RouteGoingVerdict {
    dependents: RouteRecord[];
    /** routes that serve the same models for every engine the dependents run on */
    standIns: string[];
    /** every dependent names a tier that is still filled — `keep` is an answer */
    keepable?: boolean;
    then?: RouteThen | { kind: 'keep' };
    refusal?: string;
    /** refused only because nobody said what happens to the dependents — a person can be asked */
    needsChoice?: boolean;
}

export function describeDependent(r: RouteRecord): string {
    return `${r.label} (${r.kind}${r.engine === 'claude' ? '' : `, ${r.engine}`})`;
}

/** The model an OpenCode record names under route `id` (`af-<id>/<model>`), or ''. */
function lentModel(r: RouteRecord, id: string): string {
    const m = String(r.model ?? '');
    const slash = m.indexOf('/');
    return slash > 0 && routeIdOfWire(m.slice(0, slash)) === id ? m.slice(slash + 1) : '';
}

/** Which of the records naming route `id` this ask is about. */
export function inScope(ask: RouteGoingAsk, id: string): (r: RouteRecord) => boolean {
    const ret = ask.retiring;
    const served = new Set(Object.values(ret?.after ?? {}).filter(Boolean));
    const old = new Set(Object.values(ret?.tiers ?? {}));
    return r => (!ask.leaving || ask.leaving.includes(r.engine))
        && (!ret || (r.engine === 'opencode'
            ? old.has(lentModel(r, id)) && !served.has(lentModel(r, id))
            : String(r.rows[0]?.tier ?? '').trim() in ret.tiers));
}

export function routeGoingVerdict(ask: RouteGoingAsk, records: RouteRecord[], routes: readonly LiveRoute[]): RouteGoingVerdict {
    const id = String(ask.id ?? '').trim();
    const dependents = routeDependents(id, records).filter(inScope(ask, id));
    if (!dependents.length) { return { dependents, standIns: [] }; }
    const live = routes.find(r => r.id === id) ?? { id, engines: [], hasKey: false };
    const gone = ask.retiring ? { ...live, tiers: ask.retiring.tiers } : live;
    const engines = [...new Set(dependents.map(r => r.engine))];
    const standIns = routes.filter(c => engines.every(e => servesSameModels(gone, c, e, c.hasKey))).map(c => c.id);
    const keepable = !!ask.retiring && dependents.every(r => r.engine !== 'opencode'
        && !!String(ask.retiring!.after[String(r.rows[0]?.tier ?? '').trim()] ?? '').trim());
    const base = { dependents, standIns, ...(keepable ? { keepable } : {}) };
    const then = String(ask.then ?? '').trim().toLowerCase();
    const to = String(ask.to ?? '').trim().toLowerCase();
    const serving = standIns.length ? `routes serving the same models: ${standIns.join(', ')}` : 'no route serves the same models';
    if (!then) {
        return {
            ...base, needsChoice: true,
            refusal: `${dependents.length === 1 ? 'one saved record names' : `${dependents.length} saved records name`} `
                + `${ask.retiring ? `the changing tiers of route "${id}"` : `route "${id}"`}: ${dependents.map(describeDependent).join(', ')}. `
                + `Say what happens to them — ${keepable ? 'then=keep (they run on the tier\'s new model), ' : ''}`
                + `then=repoint with to=<route> (${serving}), then=clear, or then=delete (launch profiles deleted, the rest cleared).`
        };
    }
    if (then === 'keep' && keepable) { return { ...base, then: { kind: 'keep' } }; }
    if (then === 'clear' || then === 'delete') { return { ...base, then: { kind: then } }; }
    if (then !== 'repoint') {
        return { ...base, refusal: `then is ${keepable ? 'keep, ' : ''}repoint, clear or delete — not "${then}".` };
    }
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

/** Decides, and when allowed applies the decision to the dependents in scope and writes the stores it touched. */
export async function settleRouteRecords(ask: RouteGoingAsk, io: RouteGoingIo): Promise<RouteGoingVerdict> {
    const snap = io.snapshot();
    const verdict = routeGoingVerdict(ask, collectRouteRecords(snap), io.routes());
    if (!verdict.then || verdict.then.kind === 'keep') { return verdict; }
    const id = String(ask.id).trim();
    const { stores } = applyRouteChange(snap, id, verdict.then, inScope(ask, id));
    for (const s of stores) { await io.write(s, snap); }
    return verdict;
}
