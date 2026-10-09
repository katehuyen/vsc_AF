/**
 * X-517 D — THE SELECTION A LAUNCH RESOLVES, asked of the adapter. Pure: the
 * caller hands in the agent's standing route and the registry's resolver.
 *
 * The tier travels with the route that was named (a stored tier read against
 * another route maps the word through the wrong endpoint). A pin takes the route
 * as it is, an empty one included (X-109). A model the adapter answers with a
 * model rule IS a lent route's: with no route named it counts as the chosen one,
 * before the agent's standing record, and with one named it is the model that
 * route is asked for. Any other model is left out of the selection, so the
 * routes and records of every engine without a lent route are what they were.
 */
import { ProviderSelection, ResolvedEngineRuntime } from './providerAdapter';

/** What a door asks the route resolver: the route it named (or a pin), and the model it will send. */
export interface LaunchRouteAsk { providerId?: string; tier?: string; pinned?: boolean; model?: string }

export type ModelRule = NonNullable<ResolvedEngineRuntime['modelRule']>;

export function launchSelection(
    engine: string,
    route: LaunchRouteAsk | undefined,
    standing: () => { providerId: string; tier: string },
    resolve: (sel: ProviderSelection) => ResolvedEngineRuntime
): { sel: ProviderSelection; rt: ResolvedEngineRuntime; routed: boolean } {
    const asked = (route?.providerId ?? '').trim();
    const model = (route?.model ?? '').trim();
    const lent = (sel: ProviderSelection): { sel: ProviderSelection; rt: ResolvedEngineRuntime } | undefined => {
        if (!model) { return undefined; }
        const withModel = { ...sel, modelId: model };
        const rt = resolve(withModel);
        return rt.modelRule ? { sel: withModel, rt } : undefined;
    };
    const named = route?.pinned || asked;
    const byModel = named ? undefined : lent({ engine });
    if (byModel) { return { ...byModel, routed: true }; }
    const chosen = named ? { providerId: asked, tier: (route?.tier ?? '').trim() } : standing();
    const sel: ProviderSelection = {
        engine,
        ...(chosen.providerId ? { providerId: chosen.providerId } : {}),
        ...(chosen.providerId && chosen.tier ? { tier: chosen.tier } : {})
    };
    const withModel = chosen.providerId ? lent(sel) : undefined;
    return withModel ? { ...withModel, routed: true } : { sel, rt: resolve(sel), routed: !!chosen.providerId };
}
