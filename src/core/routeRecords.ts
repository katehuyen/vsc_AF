/**
 * X-525 — EVERY SAVED RECORD THAT NAMES A ROUTE, AND THE ONE WAY THEY ARE MOVED OR CLEARED.
 *
 * Counted, because each reaches disk and starts a run later:
 * - agent default — `agentFarm.agentEngineDefaults`, per agent and engine
 * - launch profile — `agentFarm.launchProfiles`
 * - last used setup — globalState `agentfarm.lastLaunch`: the flat row and every `byEngine` row
 * - schedule · queued task · task template · workflow step · trigger — `farm-tasks.json`
 * - mission — `missions.json` specs: the mission's own route, each team member's, each pool member's
 * - waiting baton leg — `batons.json`, a leg not started yet (armed · waiting-end · parked)
 *
 * Not counted, on purpose: what already ran (finished tasks, mission runs, started
 * legs, launch manifests, transcripts, turns, costs) is history and never changes;
 * a Console revive record lives only across one host restart and carries the
 * resume gate's own answer.
 *
 * The snapshot holds the stores' OWN rows: `applyRouteChange` edits them in place
 * and names the stores the host must write back.
 */

import { SavedRoute, SavedRouteKind, namedRouteId, routeDependents } from './savedRoutes';
import { routeIdOfWire, wireIdOf } from './opencodeRoutes';

/** The fields of a record that name its route. */
export interface RouteRow { engine?: string; providerId?: string; tier?: string; model?: string }
type Row = RouteRow;

export type RouteStore = 'agentDefaults' | 'launchProfiles' | 'lastLaunch' | 'tasks' | 'missions' | 'batons';

export interface RouteRecord extends SavedRoute {
    engine: string;
    store: RouteStore;
    /** the store's own rows this record is made of (a last used setup keeps two per engine) */
    rows: Row[];
}

export interface RouteSnapshot {
    /** agentKey(dir) and agent id → the agent's name */
    agentNames: Record<string, string>;
    agentDefaults: Record<string, Record<string, Row | undefined> | undefined>;
    launchProfiles: (Row & { name: string })[];
    lastLaunch: Record<string, (Row & { byEngine?: Record<string, Row | undefined> }) | undefined>;
    tasks: (Row & { title: string; status: string })[];
    schedules: (Row & { title: string })[];
    templates: (Row & { title: string })[];
    workflows: { title: string; steps: (Row & { title: string })[] }[];
    triggers: { title: string; action: Row & { kind: string } }[];
    missions: (Row & { title: string; team: (Row & { agentName: string })[]; pool?: (Row & { agentName: string })[] })[];
    batons: { chainId: string; hop: number; state: string; from: { engine: string }; inherit: Row }[];
}

/** A leg that has not started yet still launches with what it inherited. */
const WAITING_LEG = new Set(['armed', 'waiting-end', 'parked']);
const engineOf = (e: unknown): string => String(e ?? '').trim() || 'claude';

export function collectRouteRecords(s: RouteSnapshot): RouteRecord[] {
    const out: RouteRecord[] = [];
    const add = (kind: SavedRouteKind, label: string, store: RouteStore, rows: Row[], engine?: string): void => {
        const row = rows[0];
        const e = engineOf(engine ?? row.engine);
        const pid = String(row.providerId ?? '').trim();
        const named = namedRouteId({ engine: e, providerId: pid, model: row.model });
        if (!pid && !named) { return; }
        out.push({
            kind, label, store, rows, engine: e, providerId: pid || wireIdOf(named),
            ...(String(row.model ?? '').trim() ? { model: String(row.model).trim() } : {})
        });
    };
    // An agent no longer in the fleet never starts again, so its records name nothing that runs.
    const nameOf = (key: string): string => s.agentNames[key];
    for (const [key, byEngine] of Object.entries(s.agentDefaults ?? {})) {
        if (!nameOf(key)) { continue; }
        for (const [e, row] of Object.entries(byEngine ?? {})) {
            if (row) { add('agent default', nameOf(key), 'agentDefaults', [row], e); }
        }
    }
    for (const p of s.launchProfiles ?? []) { if (p?.name) { add('launch profile', p.name, 'launchProfiles', [p]); } }
    for (const [id, last] of Object.entries(s.lastLaunch ?? {})) {
        if (!last || !nameOf(id)) { continue; }
        const flat = engineOf(last.engine);
        const engines = new Set([flat, ...Object.keys(last.byEngine ?? {})]);
        for (const e of engines) {
            const byRoute = new Map<string, Row[]>();
            for (const r of [last.byEngine?.[e], e === flat ? last : undefined]) {
                const k = r ? namedRouteId({ engine: e, providerId: r.providerId, model: r.model })
                    || String(r.providerId ?? '').trim() : '';
                if (r && k) { byRoute.set(k, [...(byRoute.get(k) ?? []), r]); }
            }
            for (const rows of byRoute.values()) { add('last used setup', nameOf(id), 'lastLaunch', rows, e); }
        }
    }
    for (const t of s.tasks ?? []) { if (t.status === 'queued') { add('queued task', t.title, 'tasks', [t]); } }
    for (const x of s.schedules ?? []) { add('schedule', x.title, 'tasks', [x]); }
    for (const x of s.templates ?? []) { add('task template', x.title, 'tasks', [x]); }
    for (const w of s.workflows ?? []) {
        (w.steps ?? []).forEach((st, i) => add('workflow step', `${w.title} · step ${i + 1}`, 'tasks', [st]));
    }
    for (const t of s.triggers ?? []) {
        if (t.action) { add('trigger', t.title, 'tasks', [t.action]); }
    }
    for (const m of s.missions ?? []) {
        add('mission', m.title, 'missions', [m]);
        for (const p of [...(m.team ?? []), ...(m.pool ?? [])]) {
            add('mission', `${m.title} · ${p.agentName}`, 'missions', [p], engineOf(p.engine ?? m.engine));
        }
    }
    for (const b of s.batons ?? []) {
        if (WAITING_LEG.has(b.state)) {
            add('waiting baton leg', `chain ${b.chainId} · leg ${b.hop + 1}`, 'batons', [b.inherit], b.from?.engine);
        }
    }
    return out;
}

/** What happens to the records naming a route that is leaving: moved to `to`, cleared, or (launch profiles) deleted. */
export type RouteThen = { kind: 'repoint'; to: string } | { kind: 'clear' } | { kind: 'delete' };

/**
 * Applies `then` to every record naming route `id`, in place, in each record's own
 * spelling. A Claude tier travels with its route and is cleared with it; an
 * OpenCode model under the route (`af-<id>/<model>`) moves or goes with it.
 * `delete` removes launch profiles and clears the rest — they are not setups to delete.
 */
export function applyRouteChange(
    s: RouteSnapshot, id: string, then: RouteThen, onEngines?: readonly string[]
): { changed: RouteRecord[]; stores: RouteStore[] } {
    const changed = routeDependents(id, collectRouteRecords(s)).filter(r => !onEngines || onEngines.includes(r.engine));
    const to = then.kind === 'repoint' ? then.to.trim() : '';
    const dropped = new Set<object>();
    for (const r of changed) {
        if (then.kind === 'delete' && r.store === 'launchProfiles') { r.rows.forEach(x => dropped.add(x)); continue; }
        for (const row of r.rows) { moveRow(row, r.engine, id, to); }
    }
    if (dropped.size) { s.launchProfiles = s.launchProfiles.filter(p => !dropped.has(p)); }
    return { changed, stores: [...new Set(changed.map(r => r.store))] };
}

function moveRow(row: Row, engine: string, from: string, to: string): void {
    if (engine !== 'opencode') {
        if (to) { row.providerId = to; } else { delete row.providerId; delete row.tier; }
        return;
    }
    if (routeIdOfWire(row.providerId) === from) {
        if (to) { row.providerId = wireIdOf(to); } else { delete row.providerId; }
    }
    const m = String(row.model ?? '').trim();
    const slash = m.indexOf('/');
    if (slash > 0 && routeIdOfWire(m.slice(0, slash)) === from) {
        if (to) { row.model = wireIdOf(to) + m.slice(slash); } else { delete row.model; }
    }
}
