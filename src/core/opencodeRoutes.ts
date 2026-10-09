/**
 * X-517 — A ROUTE LENT TO OPENCODE AT LAUNCH: the provider fragment it is given,
 * the names on both sides of the wire, and how a pick finds its route. Pure — no
 * vscode, no disk, and never a key's VALUE: the fragment names the key's variable
 * (`{env:NAME}`), which only the spawn's environment fills.
 *
 * ‼️ EVERY PROVIDER WE WRITE IS `af-<route id>`. Measured: a fragment reusing a
 * built-in provider's id is MERGED with it by OpenCode, so every model of that
 * provider would go to our address with our key — the user's own provider taken
 * over in silence. No provider on models.dev starts with `af-`.
 */
import { createHash } from 'crypto';
import { StoredProviderProfile } from './providerProfiles';
import { lendableToOpenCode, routeModelList } from './routeModels';

const WIRE = 'af-';

/** A route's OpenCode provider id. Claude-side records keep the bare route id. */
export function wireIdOf(routeId: string): string { return WIRE + routeId; }

/** `af-kimi` → `kimi`; anything not ours → ''. Strips exactly one prefix (a route id may itself start with af-). */
export function routeIdOfWire(providerId: string | undefined): string {
    const s = String(providerId ?? '').trim();
    return s.startsWith(WIRE) ? s.slice(WIRE.length) : '';
}

/** The model reference OpenCode is asked for: `af-<route>/<model id>`. */
export function modelRefOf(routeId: string, modelId: string): string { return `${wireIdOf(routeId)}/${modelId}`; }

/** One variable per route holds its key at spawn: AF_ROUTE_KEY_ + the id, upper-case, A-Z 0-9 and _. */
export function routeKeyEnvName(routeId: string): string {
    return 'AF_ROUTE_KEY_' + routeId.toUpperCase().replace(/[^A-Z0-9]/g, '_');
}

export type LentRoute = Pick<StoredProviderProfile,
    'id' | 'label' | 'engines' | 'baseUrl' | 'opencodeUrl' | 'authKind' | 'tiers' | 'context' | 'output' | 'revision'>;

/** The route's references, default first (routeModelList's order). */
export function routeModelRefs(p: LentRoute): string[] {
    return routeModelList(p.tiers).map(m => modelRefOf(p.id, m.model));
}

interface ProviderEntry {
    npm: string;
    name: string;
    options: Record<string, string>;
    models: Record<string, { name: string; limit?: { context: number; output: number } }>;
}

const trimSlash = (u: string | undefined): string => String(u ?? '').trim().replace(/\/+$/, '');

/**
 * The provider entry for one route. With an OpenCode endpoint: the OpenAI-style
 * SDK there, the key as a Bearer. Otherwise the Anthropic SDK at the endpoint +
 * `/v1` (measured: it calls baseURL + `/messages`, where Claude Code calls the
 * endpoint + `/v1/messages`), the key as x-api-key, or as a Bearer alone on an
 * oauth route. ‼️ Never a header beside the key (both are sent) nor a header
 * alone (the SDK sends nothing), never small_model, never a cost.
 */
function entryFor(p: LentRoute): ProviderEntry {
    const key = `{env:${routeKeyEnvName(p.id)}}`;
    const oc = trimSlash(p.opencodeUrl);
    const models = routeModelList(p.tiers);
    const out: ProviderEntry = oc
        ? { npm: '@ai-sdk/openai-compatible', name: p.label || p.id, options: { baseURL: oc, apiKey: key }, models: {} }
        : {
            npm: '@ai-sdk/anthropic', name: p.label || p.id,
            options: { baseURL: trimSlash(p.baseUrl) + '/v1', ...(p.authKind === 'oauth' ? { authToken: key } : { apiKey: key }) },
            models: {}
        };
    for (const m of models) {
        // ‼️ a limit with no output makes OpenCode refuse its WHOLE config (measured): both, or none
        out.models[m.model] = {
            name: models.length === 1 ? (p.label || p.id) : m.model,
            ...(p.context && p.output ? { limit: { context: p.context, output: p.output } } : {})
        };
    }
    return out;
}

/** OPENCODE_CONFIG_CONTENT for these routes — only the ones that can be lent. Undefined when none can. */
export function fragmentFor(routes: readonly LentRoute[]): string | undefined {
    const provider: Record<string, ProviderEntry> = {};
    for (const p of routes) { if (lendableToOpenCode(p)) { provider[wireIdOf(p.id)] = entryFor(p); } }
    return Object.keys(provider).length ? JSON.stringify({ $schema: 'https://opencode.ai/config.json', provider }) : undefined;
}

const objectOf = (text: string | undefined): Record<string, unknown> | undefined => {
    try {
        const j = JSON.parse(String(text ?? '')) as unknown;
        return j && typeof j === 'object' && !Array.isArray(j) ? j as Record<string, unknown> : undefined;
    } catch { return undefined; }
};

/**
 * Two OPENCODE_CONFIG_CONTENT texts as one: `instructions` joined (once each, the
 * existing first), `provider` maps joined (an existing non-`af-` entry is never
 * touched; the same `af-` id is ours), every other key of the existing one kept.
 * An existing text that is not a JSON object gives way to ours.
 */
export function mergeConfigContent(existing: string | undefined, ours: string): string {
    const a = objectOf(existing), b = objectOf(ours);
    if (!a) { return ours; }
    if (!b) { return String(existing); }
    const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
    const map = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});
    const out: Record<string, unknown> = { ...b, ...a };
    const instructions = [...new Set([...list(a.instructions), ...list(b.instructions)])];
    if (instructions.length) { out.instructions = instructions; }
    const provider: Record<string, unknown> = { ...map(a.provider) };
    for (const [id, entry] of Object.entries(map(b.provider))) {
        if (id.startsWith(WIRE) || !(id in provider)) { provider[id] = entry; }
    }
    if (Object.keys(provider).length) { out.provider = provider; }
    return JSON.stringify(out);
}

/** X-517 B — a route's OPENCODE_CONFIG_CONTENT JOINS the one already built (the constitution's layer); any other name is written over. */
export function routeValue(name: string, value: string, before: string | null | undefined): string {
    return name === 'OPENCODE_CONFIG_CONTENT' && typeof before === 'string' && before ? mergeConfigContent(before, value) : value;
}

/** A stable digest of everything about the lendable routes that changes what OpenCode is given — never a key's value. */
export function routesFingerprint(routes: readonly LentRoute[], hasKey: (id: string) => boolean): string {
    const rows = routes.filter(p => lendableToOpenCode(p)).map(p => [
        p.id, p.revision, p.engines.join(','), p.baseUrl ?? '', p.opencodeUrl ?? '', p.authKind ?? '',
        routeModelList(p.tiers).map(m => `${m.model}:${m.tiers.join('+')}`).join(','), p.context ?? '', p.output ?? '',
        hasKey(p.id) ? 1 : 0
    ]).sort((x, y) => String(x[0]).localeCompare(String(y[0])));
    return rows.length ? createHash('sha256').update(JSON.stringify(rows)).digest('hex').slice(0, 16) : '';
}

/** The model a launch on this route asks for: the one wanted when it is the route's, otherwise its default. */
export function routeModelRef(p: LentRoute, wanted?: string): string {
    const refs = routeModelRefs(p);
    const w = String(wanted ?? '').trim();
    return refs.includes(w) ? w : (refs[0] ?? '');
}

/** The route a pick names: by its `af-` provider, or — with no provider — by a model that is one of its references. */
export function routeOfSelection<T extends LentRoute>(
    sel: { providerId?: string; modelId?: string }, routes: readonly T[]
): T | undefined {
    const pid = String(sel.providerId ?? '').trim();
    if (pid) { const id = routeIdOfWire(pid); return id ? routes.find(p => p.id === id) : undefined; }
    const model = String(sel.modelId ?? '').trim();
    return model ? routes.find(p => routeModelRefs(p).includes(model)) : undefined;
}
