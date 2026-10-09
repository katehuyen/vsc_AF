/**
 * THE OPENCODE ADAPTER — the engine owns its providers, so Agent Farm records the
 * choice and keeps its hands off them. X-517: a route Agent Farm holds is LENT
 * beside them at launch, as an `af-<id>` provider in OPENCODE_CONFIG_CONTENT
 * (opencodeRoutes.ts) with its key in one variable — no OpenCode file is written,
 * and only the route a launch picked is given to it.
 */

import type { RegistryDeps } from './providerRegistry';
import { ProviderAdapter, ProviderCatalogEntry, ProviderSelection, ResolvedEngineRuntime } from './providerAdapter';
import { catalogRefusal, CatalogModelRow, ProviderCatalogRead, readOpenCodeCatalog } from './providerCatalog';
import { ProviderIdentity, unknownIdentity } from './providerIdentity';
import { openCodeReported, reportedPartial } from './reportedIdentity';
import { StoredProviderProfile } from './providerProfiles';
import { lendableToOpenCode, routeModelList } from './routeModels';
import {
    fragmentFor, lentAddress, lentModelName, modelRefOf, routeIdOfWire, routeKeyEnvName,
    routeModelRef, routeModelRefs, routeOfSelection, routesFingerprint, wireIdOf
} from './opencodeRoutes';

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const WIRE = wireIdOf('');

/** The engine's own listing with every `af-` entry dropped: the profiles are the one source of a lent route. */
function engineCatalog(text: string | undefined): ProviderCatalogRead {
    const cat = readOpenCodeCatalog(text);
    return {
        ...cat,
        providers: cat.providers.filter(p => !p.providerId.startsWith(WIRE)).map(p => ({ ...p, origin: 'engine-native' as const })),
        rows: cat.rows.filter(r => !r.providerId.startsWith(WIRE))
    };
}

function routeEntry(p: StoredProviderProfile): ProviderCatalogEntry {
    return {
        providerId: wireIdOf(p.id), providerLabel: p.label || p.id, models: routeModelRefs(p),
        route: lentAddress(p), ...(p.description ? { note: p.description } : {}), origin: 'agent-farm-route'
    };
}

/** One row per model the route serves. No cost: none was stated, which is "not measured" — never "free". */
function routeRows(p: StoredProviderProfile): CatalogModelRow[] {
    const list = routeModelList(p.tiers);
    return list.map(m => ({
        ref: modelRefOf(p.id, m.model), providerId: wireIdOf(p.id), modelId: m.model, label: lentModelName(p, m.model),
        variants: [], limit: { ...(p.context ? { context: p.context } : {}), ...(p.output ? { output: p.output } : {}) },
        capabilities: {}, ...(list.length > 1 ? { slots: m.tiers } : {})
    }));
}

export function openCodeAdapter(deps: RegistryDeps): ProviderAdapter {
    const profiles = (): StoredProviderProfile[] => (deps.profiles || []).filter(p => !!p);
    const keyOf = (id: string): { has: boolean; heldFor?: string } => deps.keyState?.(id) ?? { has: !!deps.secretFor(id) };

    /** The engine's listing, then every lendable route; the routes' fingerprint joins the revision. */
    const catalog = (): ProviderCatalogRead => {
        const own = engineCatalog(deps.openCodeCatalogText);
        const routes = profiles().filter(p => lendableToOpenCode(p));
        if (!routes.length) { return own; }
        return {
            ...own,
            providers: [...own.providers, ...routes.map(routeEntry)],
            rows: [...own.rows, ...routes.flatMap(routeRows)],
            revision: [own.revision, 'routes:' + routesFingerprint(routes, id => keyOf(id).has)].filter(Boolean).join('+')
        };
    };

    /**
     * ‼️ THE PROVIDER IS ASKED OF THE CATALOG, NEVER TAKEN OFF THE MODEL NAME.
     * Splitting `opencode/big-pickle` on the slash is a guess that agrees until
     * the day a wire name is spelled differently. When nothing has read the
     * catalog the answer is EMPTY (`test_provider_identity.js` measures this).
     */
    const catalogProviderFor = (ref: string): string => {
        if (!ref) { return ''; }
        const row = engineCatalog(deps.openCodeCatalogText).rows.find(r => r.ref === ref);
        return row ? row.providerId : '';
    };

    /** The route a pick names — by its `af-` provider or by one of its model references; lendable or not. */
    const routeOf = (sel: ProviderSelection): StoredProviderProfile | undefined =>
        routeOfSelection({ providerId: str(sel.providerId), modelId: str(sel.modelId) }, profiles());
    /** A pick aimed at a route, including one that is gone — the preflight names that. */
    const aimsAtRoute = (sel: ProviderSelection): boolean => !!routeIdOfWire(str(sel.providerId)) || !!routeOf(sel);

    /** The company behind a reported `af-` provider; once the route is gone, the one a launch last recorded (S-137). */
    const vendorOf = (providerId: string): string => {
        const id = routeIdOfWire(providerId);
        if (!id) { return providerId; }
        return profiles().find(p => p.id === id)?.providerId || deps.lastRouteVendor?.(id) || id;
    };

    const identityFor = (sel: ProviderSelection): ProviderIdentity => {
        const model = str(sel.modelId);
        const route = routeOf(sel);
        if (route) {
            // The shape a Claude route writes: the vendor, the profile at its revision, declared before the spawn.
            return {
                engine: 'opencode', providerId: route.providerId, providerLabel: route.label, origin: 'agent-farm-profile',
                scope: 'turn', providerProfileId: route.id, providerProfileRevision: route.revision, route: lentAddress(route),
                requestedModelRef: routeModelRef(route, model), proof: 'launch-declared'
            };
        }
        // ‼️ A MODEL WITHOUT A PROVIDER IS `unknown`, NOT `engine-native` — and a gone route's `af-` id is no provider.
        const provider = routeIdOfWire(str(sel.providerId)) ? '' : (str(sel.providerId) || catalogProviderFor(model));
        if (!provider) { return { ...unknownIdentity('opencode'), scope: 'turn', requestedModelRef: model }; }
        // The engine legitimately changes this at a turn boundary, so the scope is the turn.
        return { engine: 'opencode', providerId: provider, origin: 'engine-native', scope: 'turn', requestedModelRef: model, proof: 'launch-declared' };
    };

    /** Refused before the spawn, in the sentence a Claude route uses where the fault is the same. */
    const routeRefusal = (sel: ProviderSelection): string[] => {
        const route = routeOf(sel);
        if (!route) { return [`the route "${routeIdOfWire(str(sel.providerId))}" no longer exists, so there is nothing to lend OpenCode.`]; }
        const name = route.label || route.id;
        if (!route.engines.includes('opencode')) { return [`"${name}" is not marked for OpenCode, so it is not lent to it.`]; }
        if (!routeModelList(route.tiers).length) { return [`"${name}" names no model, so OpenCode would have nothing to ask for.`]; }
        if (!lendableToOpenCode(route)) { return [`"${name}" has no address OpenCode can reach.`]; }
        const key = keyOf(route.id);
        if (key.heldFor) {
            return [`"${name}" has no key for its address: its key was given for ${key.heldFor}, and the route's endpoint has changed since.`];
        }
        if (!key.has) { return [`"${name}" has no stored key, so a run on it would reach ${lentAddress(route).baseUrl} unauthenticated.`]; }
        return [];
    };

    return {
        id: 'opencode-native',
        version: '1',
        engine: 'opencode',
        axis: 'provider',
        providerScope: 'turn',
        // `session/set_config_option` — ‼️ and it takes `configId`, not `id` (core/opencode.ts).
        canSwitchProviderAtTurnBoundary: true,
        catalog,
        normalizeSelection: sel => ({
            engine: 'opencode',
            providerId: str(sel.providerId),
            modelId: str(sel.modelId),
            variant: sel.variant,
            effort: sel.effort
        }),
        resolveRuntime: (sel): ResolvedEngineRuntime => {
            const model = str(sel.modelId);
            // The CLI's own vocabulary, passed through unassembled.
            const base: ResolvedEngineRuntime = { identity: identityFor(sel), args: model ? ['-m', model] : [] };
            const route = routeOf(sel);
            // ‼️ The engine's own providers get no environment of ours: their sign-in is the engine's.
            if (!route || !lendableToOpenCode(route)) { return base; }
            // ‼️ ONLY THIS ROUTE and only its key — measured, an external window's command line fills at ~25 routes.
            const fragment = fragmentFor([route]);
            const key = deps.secretFor(route.id);
            return {
                ...base,
                spawnEnv: { ...(fragment ? { OPENCODE_CONFIG_CONTENT: fragment } : {}), ...(key ? { [routeKeyEnvName(route.id)]: key } : {}) },
                modelRule: { refs: routeModelRefs(route), defaultRef: routeModelRef(route) }
            };
        },
        preflight: sel => (aimsAtRoute(sel) ? routeRefusal(sel) : catalogRefusal(engineCatalog(deps.openCodeCatalogText), {
            engine: 'opencode',
            providerId: str(sel.providerId) || catalogProviderFor(str(sel.modelId)),
            modelId: str(sel.modelId),
            ...(sel.variant ? { variant: sel.variant } : {}),
            // X-113 - the reasoning level is part of the pick, so it is part of what can be refused.
            ...(sel.effort ? { effort: str(sel.effort) } : {})
        })),
        // This engine DOES name its provider (`providerID` on an export, `provider/model` over ACP); a lent
        // route's `af-` id is read back as the route's company, so the declared and the reported agree.
        identityFromEvents: events => {
            const said = reportedPartial('opencode', openCodeReported(events, catalog().providers.map(p => p.providerId)));
            return said.reportedProviderIds ? { ...said, reportedProviderIds: [...new Set(said.reportedProviderIds.map(vendorOf))] } : said;
        },
        // A provider change here is the engine's documented feature, not the defect it is on Claude.
        resumePolicy: () => ({ act: 'resume' }),
        // ‼️ X-112 — OpenCode writes cost 0 for a model it has no price for: on a lent route that is "not measured".
        billingPolicy: sel => (sel && aimsAtRoute(sel)
            ? { engineCostIsAuthoritative: false, countsAgainstPlanQuota: false }
            : { engineCostIsAuthoritative: true, countsAgainstPlanQuota: false }),
        identity: () => ({ ...unknownIdentity('opencode'), scope: 'turn' })
    };
}
