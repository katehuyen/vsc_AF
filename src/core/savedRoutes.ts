/**
 * X-116 — A SAVED CHOICE THAT OUTLIVED ITS ROUTE, MADE VISIBLE BEFORE IT FIRES.
 *
 * Removing a route (`providers.remove`) takes the profile and its key; it does
 * not, and should not, edit the things that still name it — an agent's standing
 * route, a launch profile, a schedule, a task waiting in the queue. Those are
 * the user's records. But each of them now names nothing, and what happens next
 * differs by kind:
 *
 * - a task or schedule naming it is refused when it starts (`routeRefusal` in
 *   the task runner) — visible, but only at 03:00;
 * - an agent default naming it resolves to NO route: measured, nothing is
 *   injected and nothing is cleared, so that agent's runs start on whatever the
 *   shell carries and are recorded as unknown.
 *
 * So the health report names them now, grouped by route, with the kinds — the
 * recovery is the person re-pointing or clearing the choice, and this is where
 * they are told there is one to make.
 */

export type SavedRouteKind = 'agent default' | 'launch profile' | 'schedule' | 'queued task';

export interface SavedRoute {
    kind: SavedRouteKind;
    /** The name a person knows the record by. */
    label: string;
    providerId: string;
}

const CONSEQUENCE: Record<SavedRouteKind, string> = {
    'agent default': 'an agent default naming it starts that agent\'s runs with nothing injected and nothing '
        + 'cleared, on whatever route the shell carries',
    'launch profile': 'a launch profile naming it asks for a route that is not there',
    'schedule': 'a schedule naming it is refused each time it fires',
    'queued task': 'a queued task naming it is refused when it starts'
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
