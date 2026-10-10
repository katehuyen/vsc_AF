/**
 * X-116 — A SAVED CHOICE THAT OUTLIVED ITS ROUTE, MADE VISIBLE BEFORE IT FIRES.
 *
 * A gone route resolves to nothing injected and nothing cleared (measured), so a
 * run on it would start on whatever the shell carries. Every spawning door
 * therefore refuses a launch landing on it (X-525, `resolveLaunchRoute`), the
 * agent's own route included — visible, but only when the run starts, which for
 * a schedule is 03:00.
 *
 * So the health report names every saved record still naming one, grouped by
 * route, with the kinds (core/routeRecords.ts collects them) — the recovery is
 * the person re-pointing or clearing the choice, and this is where they are told
 * there is one to make.
 */

import { routeIdOfWire } from './opencodeRoutes';

/** Every kind `collectRouteRecords` (routeRecords.ts) reads; where each is stored is listed there. */
export type SavedRouteKind = 'agent default' | 'launch profile' | 'last used setup' | 'schedule' | 'queued task'
    | 'task template' | 'workflow step' | 'trigger' | 'mission' | 'waiting baton leg';

export interface SavedRoute {
    kind: SavedRouteKind;
    /** The name a person knows the record by. */
    label: string;
    providerId: string;
    /** X-525 — the engine the record launches (absent = Claude Code) and the model it names, if any. */
    engine?: string;
    model?: string;
}

/**
 * X-525 — THE ROUTE A SAVED RECORD NAMES, read in its engine's own spelling.
 * Claude Code records keep the bare route id; OpenCode records keep the wire id
 * (`af-<id>`) or only a model under it (`af-<id>/<model>`). ‼️ A bare id on an
 * OpenCode record is the engine's OWN provider (OpenCode's `kimi`), never a route
 * of ours that happens to share the name. '' when the record names no route.
 */
export function namedRouteId(r: { engine?: string; providerId?: string; model?: string }): string {
    const engine = String(r.engine || 'claude').trim();
    const pid = String(r.providerId ?? '').trim();
    if (engine !== 'opencode') { return pid; }
    return routeIdOfWire(pid) || (pid ? '' : routeIdOfWire(String(r.model ?? '').trim().split('/')[0]));
}

/** X-525 — every saved record naming route `id`, on whichever engine and in whichever spelling. */
export function routeDependents<T extends { engine?: string; providerId?: string; model?: string }>(
    id: string, saved: readonly T[]
): T[] {
    const want = String(id ?? '').trim();
    return want ? saved.filter(r => namedRouteId(r) === want) : [];
}

type RouteModels = { id: string; engines: readonly string[]; tiers?: Record<string, string> };

/**
 * X-525 — CAN ROUTE `cand` TAKE THE PLACE OF ROUTE `gone` FOR A RECORD ON `engine`?
 * Only when it serves the SAME MODELS: it is marked for that engine, it has a key,
 * and every tier `gone` fills holds the same model on `cand` (it may fill more).
 * ‼️ "The same vendor" is not the rule and never enough — a badge naming one model
 * while another one runs is the failure this exists to prevent. A route that fills
 * no tier answers with its service's default, which nobody can prove equal, so it
 * has no stand-in.
 */
export function servesSameModels(gone: RouteModels, cand: RouteModels, engine: string, candHasKey: boolean): boolean {
    if (cand.id === gone.id || !candHasKey || !cand.engines.includes(engine)) { return false; }
    const filled = Object.entries(gone.tiers ?? {}).filter(([, m]) => String(m ?? '').trim());
    return filled.length > 0 && filled.every(([tier, m]) => (cand.tiers ?? {})[tier] === m);
}

const CONSEQUENCE: Record<SavedRouteKind, string> = {
    'agent default': 'an agent default naming it refuses every run of that agent that does not name a route itself',
    'launch profile': 'a launch profile naming it is refused each time it is used',
    'schedule': 'a schedule naming it is refused each time it fires',
    'queued task': 'a queued task naming it is refused when it starts',
    'last used setup': 'an agent\'s last used setup naming it seeds that agent\'s next start with it, which is then refused',
    'task template': 'a task template naming it hands it to every task made from it',
    'workflow step': 'a workflow step naming it is refused when the workflow reaches it',
    'trigger': 'a trigger naming it is refused each time it fires',
    'mission': 'a mission naming it has those delegations refused when they start',
    'waiting baton leg': 'a waiting baton leg naming it has its successor refused when it opens'
};

/**
 * One sentence per route that no longer exists and is still named somewhere.
 * `runnable` answers whether a launch can be pointed at a route id right now —
 * ‼️ the host hands in the SAME rule the spawn refuses by, because a catalog
 * lists the shipped route templates (`kimi`, `minimax`) even when no profile
 * behind them exists, and a list-based check called those alive.
 */
export function goneRouteProblems(
    saved: readonly SavedRoute[] | undefined, runnable: (providerId: string) => boolean
): string[] {
    const byRoute = new Map<string, SavedRoute[]>();
    for (const s of saved ?? []) {
        const id = (s.providerId ?? '').trim();
        if (!id || runnable(id)) { continue; }
        byRoute.set(id, [...(byRoute.get(id) ?? []), s]);
    }
    const out: string[] = [];
    for (const [id, list] of [...byRoute.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        const names = list.map(s => `${s.label} (${s.kind})`).join(', ');
        const kinds = [...new Set(list.map(s => s.kind))];
        out.push(`route "${id}" no longer exists, and ${list.length === 1 ? 'one saved choice still names'
            : `${list.length} saved choices still name`} it: ${names}. `
            + kinds.map(k => CONSEQUENCE[k]).join('; ')
            + ' — re-point or clear it');
    }
    return out;
}
