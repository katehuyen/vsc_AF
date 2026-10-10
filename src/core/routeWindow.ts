/**
 * X-522 — THE WINDOW A ROUTE STATES, FOR THE TURN OR THE SESSION IT SERVED.
 *
 * A route profile may state its models' context window (Context on the route
 * form). Claude Code is told it at spawn (routeModels.ts routeContextEnv); this
 * is the same figure for Agent Farm's own meter, handed to the one rule
 * (pricing.ts contextWindowOf) as its `route` answer. 0 whenever no route
 * applies or the route states none: the rule then goes on to the model table,
 * and a model nobody knows still gets no percentage (X-113).
 *
 * WHICH ROUTE: the turn's own report when the engine made one — on OpenCode one
 * lent route (`af-<id>`), or its own model, which is no route at all — else the
 * profile the launch declared. Claude names no provider, so there the declared
 * profile always answers. A profile that was removed states nothing any more.
 *
 * Pure: the caller reads the profiles (routeName.ts routeNames) and the records.
 */
import { LaunchManifest, manifestOf } from './launchManifest';
import { routeIdOfWire } from './opencodeRoutes';
import { RouteNames } from './routeName';
import { contextWindowOf, CtxWindow } from './pricing';

const named = (v: readonly string[] | undefined): string[] => (v ?? []).map(s => String(s ?? '').trim()).filter(Boolean);

/** Does any profile state a window — the cheap question a hot path asks before it looks a session up. */
export function statesRouteWindow(names: RouteNames | undefined): boolean {
    return Object.values(names?.current ?? {}).some(e => (e.context ?? 0) > 0);
}

/** One turn: `reported` is what the engine named for it (nothing on Claude), `profileId` what the launch declared. */
export function routeWindowOf(
    engine: string, profileId: string | undefined, reported: readonly string[] | undefined, names: RouteNames | undefined
): number {
    const said = named(reported);
    const id = engine === 'opencode' && said.length
        ? (said.length === 1 ? routeIdOfWire(said[0]) : '')
        : String(profileId ?? '').trim();
    const tokens = id ? Number(names?.current[id.toLowerCase()]?.context) || 0 : 0;
    return tokens > 0 ? tokens : 0;
}

/** A session as the index holds it: the last turn the engine named a provider for decides, else the declared profile. */
export function sessionRouteWindow(
    s: { launchId?: string; source?: string; turns?: readonly { providerIds?: readonly string[] }[] } | undefined,
    manifests: readonly LaunchManifest[] | undefined, names: RouteNames | undefined,
    /** The caller's own word for the engine, when it knows better than the transcript (sessionIdentity's rule). */
    engineOverride?: string
): number {
    if (!s || !statesRouteWindow(names)) { return 0; }
    const engine = engineOverride || s.source || 'claude';
    const turns = engine === 'opencode' ? s.turns ?? [] : [];
    let last: readonly string[] | undefined;
    for (let i = turns.length - 1; i >= 0 && !last; i--) {
        if (named(turns[i].providerIds).length) { last = turns[i].providerIds; }
    }
    const declared = manifests ? manifestOf(manifests, s)?.identity?.providerProfileId : undefined;
    return routeWindowOf(engine, declared, last, names);
}

/**
 * X-534 — a LIVE Console session's window: the one rule (pricing.ts contextWindowOf), asked with the
 * APPLIED model (a card that switched mid-session is not on the model it launched with). The Console card
 * and `console.sessions` both answer from here, so the page and an agent asking over the bridge read one window.
 */
export function liveContextWindow(
    s: { contextWindowTokens?: number; applied?: { model: string }; model?: string }, forced: number, route: number
): CtxWindow {
    return contextWindowOf(s.contextWindowTokens ?? 0, s.applied?.model || s.model || '', forced, route);
}
