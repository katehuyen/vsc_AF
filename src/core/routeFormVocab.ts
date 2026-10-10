/**
 * U-243 — WHAT THE ROUTE FORM IS TOLD, built from the code that acts on a save,
 * so the page checks a box by the host's own rules and never keeps a second copy.
 * Names only: a Farm Secret travels by its name, never its value. Pure.
 */
import { MODEL_ID_PATTERN } from './launch';
import { routeIdOn } from './opencodeRoutes';
import { CLAUDE_ROUTE_TEMPLATES } from './providerCatalog';
import { ROUTE_AUTH_KINDS, RouteAuthKind } from './routeAuth';
import { ROUTE_ENGINES, V1_TAIL } from './routeEngines';
import { ROUTE_TIERS } from './routeModels';

export interface RouteFormTemplate {
    id: string;
    label: string;
    baseUrl: string;
    opencodeUrl: string;
    authKind: string;
}

export interface RouteFormVocab {
    authKinds: readonly RouteAuthKind[];
    tiers: readonly string[];
    engines: readonly string[];
    /** A route can be started from these: the shipped shapes a key can be sent to. */
    templates: RouteFormTemplate[];
    /** The Farm Secrets a route can sign in with, by name. */
    secrets: string[];
    /** Ids a new route cannot take: the routes stored and the ones retired (S-135). */
    taken: string[];
    checks: { modelId: string; v1: string };
    /** What a route's id is prefixed with on each engine — how its health row there is found. */
    onEngine: Record<string, string>;
}

export function routeFormVocab(taken: readonly string[], secrets: readonly string[]): RouteFormVocab {
    return {
        authKinds: ROUTE_AUTH_KINDS,
        tiers: ROUTE_TIERS,
        engines: ROUTE_ENGINES,
        // the first-party subscription shape is what no route at all means, so it is not offered
        templates: CLAUDE_ROUTE_TEMPLATES
            .filter(t => ROUTE_AUTH_KINDS.some(a => a.id === t.route.authKind))
            .map(t => ({
                id: t.providerId, label: t.providerLabel, baseUrl: t.route.baseUrl ?? '',
                opencodeUrl: t.opencodeUrl ?? '', authKind: t.route.authKind ?? ''
            })),
        secrets: [...secrets].sort((a, b) => a.localeCompare(b)),
        taken: [...new Set(taken)],
        checks: { modelId: MODEL_ID_PATTERN, v1: V1_TAIL },
        onEngine: Object.fromEntries(ROUTE_ENGINES.map(e => [e, routeIdOn(e, '')]))
    };
}
