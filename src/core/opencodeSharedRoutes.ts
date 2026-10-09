/**
 * X-519 — WHAT THE ONE SHARED `opencode acp` PROCESS IS GIVEN. Every Console card
 * runs in that one process and a process-wide variable cannot differ per card,
 * so it gets EVERY route that can be lent now: one joined provider fragment and
 * each route's key variable. A route with no key, or whose key was given for an
 * address it has since left, is not in it. Pure; the keys come in by a function
 * and leave only in the returned environment — never in the print.
 */
import { createHash } from 'crypto';
import { lendableToOpenCode } from './routeModels';
import { fragmentFor, LentRoute, routeKeyEnvName, routesFingerprint, routeValue } from './opencodeRoutes';

const lentNow = <T extends LentRoute>(routes: readonly T[], keyOf: (id: string) => string | undefined): T[] =>
    routes.filter(p => lendableToOpenCode(p) && !!keyOf(p.id));

/** What the spawn adds to the inherited environment; {} when no route can be lent (the spawn is then unchanged). */
export function sharedRouteEnv(
    inheritedConfig: string | undefined, routes: readonly LentRoute[], keyOf: (id: string) => string | undefined
): Record<string, string> {
    const lent = lentNow(routes, keyOf);
    const fragment = fragmentFor(lent);
    if (!fragment) { return {}; }
    const out: Record<string, string> = {
        OPENCODE_CONFIG_CONTENT: routeValue('OPENCODE_CONFIG_CONTENT', fragment, inheritedConfig)
    };
    for (const p of lent) { out[routeKeyEnvName(p.id)] = String(keyOf(p.id)); }
    return out;
}

/** A digest of that environment. A key enters only as its own hash, so a Farm Secret given a new value is a new print. */
export function sharedRoutePrint(routes: readonly LentRoute[], keyOf: (id: string) => string | undefined): string {
    const lent = lentNow(routes, keyOf);
    if (!lent.length) { return ''; }
    const keys = lent.map(p => [p.id, createHash('sha256').update(String(keyOf(p.id))).digest('hex').slice(0, 12)])
        .sort((a, b) => a[0].localeCompare(b[0]));
    return createHash('sha256').update(JSON.stringify([routesFingerprint(lent, () => true), keys])).digest('hex').slice(0, 16);
}
