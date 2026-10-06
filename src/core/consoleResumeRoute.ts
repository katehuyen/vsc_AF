/**
 * ‼️ X-506 — A CONSOLE RESUME ASKS THE X-109 GATE AT THE SPAWN, WHATEVER DOOR
 * IT CAME THROUGH.
 *
 * The gate was asked door by door: the card's Resume, Resume in the Console
 * and the bridge's `console.start` each wrote the same six lines before
 * `ConsoleHost.start`, and the Console's own resume list did not — so a
 * conversation that ran on a route came back on none, wearing no badge, and
 * its provider's model was sent to the default endpoint. The terminal had
 * this rule at its one spawn function all along (`startClaudeSession`); this
 * is the same rule at the Console's.
 *
 * Asked only when the door stated nothing: a door that named a route, or
 * arrives `routePinned`, has already been answered. Only a PINNED answer
 * changes the launch — an unpinned one is the agent's standing route, which
 * the spawn falls back to anyway.
 */
export interface ResumeRouteAnswer {
    providerId?: string;
    tier?: string;
    pinned?: boolean;
    /** The gate refused: the sentence to show, and nothing is spawned. */
    refuse?: string;
}

export type ResumeRouteAsk =
    (agentId: string, engine: string, sessionId: string) => ResumeRouteAnswer | undefined;

interface RoutedInit {
    agentId: string;
    engine?: string;
    resume?: string;
    providerId?: string;
    tier?: string;
    routePinned?: boolean;
}

export function gateResumeRoute<T extends RoutedInit>(
    init: T, ask: ResumeRouteAsk | undefined
): { init: T; refuse?: string } {
    const sid = String(init.resume ?? '').trim();
    if (!sid || !ask || init.routePinned || String(init.providerId ?? '').trim()) { return { init }; }
    const g = ask(init.agentId, init.engine || 'claude', sid);
    if (g?.refuse) { return { init, refuse: g.refuse }; }
    if (!g?.pinned) { return { init }; }
    const providerId = String(g.providerId ?? '').trim();
    const tier = String(g.tier ?? '').trim();
    return {
        init: {
            ...init,
            providerId: providerId || undefined,
            tier: providerId && tier ? tier : undefined,
            routePinned: true
        }
    };
}
