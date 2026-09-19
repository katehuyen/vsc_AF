/**
 * X-99 — WHAT IS ON OFFER, FROM THE TWO PLACES THAT ACTUALLY KNOW.
 *
 * ‼️ TWO ENGINES, TWO OWNERS, AND THE OWNERSHIP IS THE WHOLE DESIGN.
 *
 * **OpenCode owns its own catalog.** Providers, credentials and config live in
 * the engine (`opencode auth login`, `auth.json`, `opencode.json`), and Agent
 * Farm reads the public half and records what was chosen rather than keeping a
 * second copy — two vaults, two revisions and two contradicting truths being
 * the alternative. So this catalog is MEASURED, off `opencode models --verbose`
 * or the ACP handshake. A shipped list of OpenCode provider names would be a
 * build claiming to know something about somebody's machine.
 *
 * **Claude Code has no provider list at all.** A "provider" there is a ROUTE
 * that Agent Farm assembles and injects: base URL, auth kind, and a mapping
 * from the tier a person picks (`opus`) to the model that route serves. So that
 * catalog is DECLARED — a table of route templates — and the item's acceptance
 * line is that living provider and model names must not require a code change.
 * Hence: the templates are DATA, and a route the user describes in settings is
 * read by the same function into the same shape.
 *
 * ‼️ AND X-98's RULE HOLDS ONE LAYER UP: the provider on an OpenCode row comes
 * from the `providerID` FIELD, never from splitting the printed
 * `provider/model` line. Measured 30 Aug 2026 on OpenCode 1.18.19, all six rows
 * of a real catalog agree — and the moment they stop agreeing, the field is the
 * one the engine meant and the line is decoration.
 *
 * Everything here is pure. WHO runs `opencode models` and when, and where the
 * user's templates are stored, belong to the caller (X-100, X-101).
 */

import { CatalogSource, ProviderCatalog, ProviderCatalogEntry } from './providerAdapter';
import { RedactedRoute } from './providerIdentity';

/** One model as the engine describes it, with the figures kept apart from the
 *  guesses: an absent limit is absent, and a stated zero is a stated zero. */
export interface CatalogModelRow {
    /** The engine's own wire spelling — `opencode/big-pickle`. */
    ref: string;
    providerId: string;
    modelId: string;
    label: string;
    /** ‼️ ONLY the variants the engine PUBLISHES. See `openCodeModelRows`. */
    variants: string[];
    limit: { context?: number; input?: number; output?: number };
    /** Absent when the engine stated none; `{input: 0, output: 0}` when it
     *  stated free, which is a different fact. */
    cost?: { input: number; output: number };
    /** ‼️ WHAT THE ENGINE PUBLISHED, INCLUDING THE NOS. Absent is absent and a
     *  stated false is a stated false, the same rule the cost and limit fields
     *  above keep. It matters most here: "nobody said" and "it cannot" lead to
     *  opposite words in a picker, and a capability set that only carries the
     *  yeses can only ever advertise. */
    capabilities: {
        reasoning?: boolean;
        toolcall?: boolean;
        attachment?: boolean;
        /** The modality map the engine publishes under `capabilities.input`.
         *  Measured on OpenCode 1.18.19: every model on this machine states
         *  `image: false`, and the parse used to drop the whole map. */
        input?: { image?: boolean; pdf?: boolean; audio?: boolean; video?: boolean };
    };
    status?: string;
}

/** A Claude route template: the SHAPE of a route, never what unlocks it. */
export interface ClaudeRouteTemplate {
    providerId: string;
    providerLabel: string;
    route: RedactedRoute;
    /** tier (`opus`, `sonnet`, `haiku`) → the model id this route serves for it. */
    tiers: Record<string, string>;
    /** Where a person reads about this route, when it is not first-party. */
    docs?: string;
    /** ‼️ Is this route's own cost figure a real bill? On a third-party
     *  Anthropic-compatible endpoint Claude still writes an Anthropic-priced
     *  `total_cost_usd` and `modelUsage.provider: "firstParty"` — measured — so
     *  the answer there is no, and X-112 reads this field rather than guessing. */
    engineCostIsAuthoritative: boolean;
}

/** What the caller picked, in whichever engine's vocabulary. */
export interface CatalogSelection {
    engine: string;
    providerId?: string;
    modelId?: string;
    variant?: string;
    /** Claude only: the tier a person picked, resolved through the route. */
    tier?: string;
    /** The reasoning level asked for, where the engine takes one. Carried
     *  here so a model that publishes no reasoning can say so BEFORE the
     *  spawn rather than ignoring the flag afterwards. */
    effort?: string;
}

export interface ProviderCatalogRead extends ProviderCatalog {
    /** The rows behind the names, kept so a picker can draw limits and variants
     *  without a second parse. */
    rows: CatalogModelRow[];
    /** Claude only. */
    templates?: ClaudeRouteTemplate[];
}

const num = (v: unknown): number | undefined =>
    (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const obj = (v: unknown): Record<string, unknown> =>
    (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});

/**
 * `opencode models --verbose` prints, per model, a bare qualified name and then
 * a pretty JSON object. Measured shape (OpenCode 1.18.19):
 *
 *     opencode/big-pickle
 *     {
 *       "id": "big-pickle", "providerID": "opencode", "name": "Big Pickle",
 *       "cost": {...}, "limit": {...}, "capabilities": {...}, "variants": {...}
 *     }
 *
 * Split by brace depth rather than by blank lines: the objects are multi-line
 * and contain braces of their own, and a regex over the whole text would join
 * two models the first time one of them gained a field.
 */
export function readOpenCodeCatalog(text: string | undefined): ProviderCatalogRead {
    const rows: CatalogModelRow[] = [];
    const lines = (text || '').split(/\r?\n/);
    let i = 0;
    while (i < lines.length) {
        if (lines[i].trim() === '{') {
            let depth = 0, j = i;
            const buf: string[] = [];
            for (; j < lines.length; j++) {
                buf.push(lines[j]);
                for (const ch of lines[j]) {
                    if (ch === '{') { depth++; } else if (ch === '}') { depth--; }
                }
                if (depth === 0) { break; }
            }
            let parsed: Record<string, unknown> | undefined;
            try { parsed = obj(JSON.parse(buf.join('\n'))); } catch { parsed = undefined; }
            const row = parsed ? rowFromOpenCode(parsed) : undefined;
            if (row) { rows.push(row); }
            i = j + 1;
            continue;
        }
        i++;
    }
    const providers = new Map<string, ProviderCatalogEntry>();
    for (const r of rows) {
        const at = providers.get(r.providerId) ?? {
            providerId: r.providerId, providerLabel: r.providerId, models: [], variants: []
        };
        at.models.push(r.ref);
        // ‼️ X-114 — THE FIELD WAS DECLARED AND NEVER FILLED. Every entry
        // answered `[]` to "what reasoning variants does this provider offer",
        // which is not "none" but "nobody ever asked the rows" — and the one
        // difference that matters downstream is that a hosted card cannot carry
        // a variant at all (ACP declares only model and mode), so a provider
        // that publishes them has something to say about the transport.
        const known = at.variants ?? (at.variants = []);
        for (const v of r.variants) { if (v && !known.includes(v)) { known.push(v); } }
        providers.set(r.providerId, at);
    }
    // ‼️ NOTHING READ IS NOT AN EMPTY CATALOG. "The engine offers nothing" and
    // "nobody has asked the engine yet" lead to opposite behaviour one function
    // down (`catalogRefusal`), so they are different values here.
    const source: CatalogSource = rows.length ? 'engine-reported' : 'not-fetched';
    return { providers: [...providers.values()], source, rows };
}

/**
 * X-115 — ‼️ WHAT OF THE ENGINE'S LISTING AGENT FARM IS ALLOWED TO KEEP.
 *
 * MEASURED 2026-09-19 with a canary in `OPENCODE_CONFIG_CONTENT`: `opencode
 * models --verbose` prints each model's `options` and `headers` VERBATIM from
 * the user's own config — both canaries came back in the listing. Those are
 * exactly the two places OpenCode documents for a model's `apiKey` and an
 * `Authorization` header, and the raw text was going straight into
 * `globalState` and back out on every activation: a credential OpenCode owns,
 * copied into a store Agent Farm owns, which is the "two vaults" failure X-100
 * was written to make impossible.
 *
 * ‼️ AN ALLOW-LIST, NOT A DENY-LIST — built by naming what is public rather
 * than by deleting what is not, the rule `publicProfile` already keeps. A field
 * OpenCode adds next month is dropped until somebody decides it is safe. The
 * fields kept are exactly the ones `rowFromOpenCode` reads, reduced to their
 * public shapes (numbers stay numbers, flags stay flags, a variant keeps its
 * NAME and loses its settings). Ref lines are kept verbatim because
 * `readOpencodeModelList` reads them; every other line — a warning, a log line
 * — is dropped, because nothing reads it and it could hold anything.
 */
export function publicOpenCodeCatalogText(text: string | undefined): string {
    const out: string[] = [];
    const lines = (text || '').split(/\r?\n/);
    const REF = /^[\w.:-]+\/[\w.:-]+$/;
    let i = 0;
    while (i < lines.length) {
        const line = lines[i].trim();
        if (line === '{') {
            let depth = 0, j = i;
            const buf: string[] = [];
            for (; j < lines.length; j++) {
                buf.push(lines[j]);
                for (const ch of lines[j]) {
                    if (ch === '{') { depth++; } else if (ch === '}') { depth--; }
                }
                if (depth === 0) { break; }
            }
            let parsed: Record<string, unknown> | undefined;
            try { parsed = obj(JSON.parse(buf.join('\n'))); } catch { parsed = undefined; }
            // An object that does not parse is dropped whole: the reader
            // drops it too, and it is the one shape nobody can vouch for.
            if (parsed) { out.push(JSON.stringify(publicModelObject(parsed), null, 2)); }
            i = j + 1;
            continue;
        }
        if (REF.test(line)) { out.push(line); }
        i++;
    }
    return out.join('\n');
}

/** Numbers, flags and nested maps of them — the shape a cost, a limit and a
 *  capability set really have. A string inside one is not kept: none of those
 *  maps has a reason to carry text, and text is what a secret is. */
function numbersAndFlags(v: unknown): Record<string, unknown> {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(obj(v))) {
        if (typeof x === 'number' || typeof x === 'boolean') { o[k] = x; }
        else if (x && typeof x === 'object' && !Array.isArray(x)) { o[k] = numbersAndFlags(x); }
    }
    return o;
}

function publicModelObject(o: Record<string, unknown>): Record<string, unknown> {
    const kept: Record<string, unknown> = {};
    for (const k of ['id', 'providerID', 'name', 'status'] as const) {
        if (typeof o[k] === 'string') { kept[k] = o[k]; }
    }
    if (o.cost !== undefined) { kept.cost = numbersAndFlags(o.cost); }
    if (o.limit !== undefined) { kept.limit = numbersAndFlags(o.limit); }
    if (o.capabilities !== undefined) { kept.capabilities = numbersAndFlags(o.capabilities); }
    // The variant NAMES are the public fact; what a variant sets is config.
    if (o.variants !== undefined) {
        kept.variants = Object.fromEntries(Object.keys(obj(o.variants)).map(v => [v, {}]));
    }
    return kept;
}

function rowFromOpenCode(o: Record<string, unknown>): CatalogModelRow | undefined {
    // ‼️ THE FIELD, NOT THE PRINTED PREFIX. This is X-98's rule and it is one
    // line: read `providerID`, never `head.split('/')`.
    const providerId = str(o.providerID);
    const modelId = str(o.id);
    if (!providerId || !modelId) { return undefined; }
    const limitIn = obj(o.limit);
    const costIn = o.cost === undefined ? undefined : obj(o.cost);
    const caps = obj(o.capabilities);
    // ‼️ THE MAP WAS BEING READ AND THROWN AWAY. `capabilities.input` is where
    // the engine says what it will ACCEPT, and it is the half a person needs
    // before attaching a file rather than after the model ignores it.
    const inputIn = obj(caps.input);
    const inputCaps: NonNullable<CatalogModelRow['capabilities']['input']> = {};
    for (const k of ['image', 'pdf', 'audio', 'video'] as const) {
        if (typeof inputIn[k] === 'boolean') { inputCaps[k] = inputIn[k] as boolean; }
    }
    const limit: CatalogModelRow['limit'] = {};
    if (num(limitIn.context) !== undefined) { limit.context = num(limitIn.context); }
    if (num(limitIn.input) !== undefined) { limit.input = num(limitIn.input); }
    if (num(limitIn.output) !== undefined) { limit.output = num(limitIn.output); }
    return {
        ref: `${providerId}/${modelId}`,
        providerId,
        modelId,
        label: str(o.name) || modelId,
        // ‼️ PUBLISHED, NOT IMPLIED. Measured: every model on this machine
        // reports `capabilities.reasoning: true` and only two carry a `variants`
        // map. A level list drawn off the capability would offer the engine
        // words it will not take.
        variants: Object.keys(obj(o.variants)),
        limit,
        ...(costIn
            ? { cost: { input: num(costIn.input) ?? 0, output: num(costIn.output) ?? 0 } }
            : {}),
        capabilities: {
            ...(typeof caps.reasoning === 'boolean' ? { reasoning: caps.reasoning } : {}),
            ...(typeof caps.toolcall === 'boolean' ? { toolcall: caps.toolcall } : {}),
            ...(typeof caps.attachment === 'boolean' ? { attachment: caps.attachment } : {}),
            ...(Object.keys(inputCaps).length ? { input: inputCaps } : {})
        },
        ...(str(o.status) ? { status: str(o.status) } : {})
    };
}

/** The rows behind a read catalog, in the order the engine printed them. */
export function openCodeModelRows(cat: ProviderCatalogRead): CatalogModelRow[] {
    return cat.rows;
}

/**
 * ‼️ THE SHIPPED ROUTE TEMPLATES ARE A TABLE, NOT A SWITCH STATEMENT.
 *
 * Adding a route must not mean editing code — third-party Anthropic-compatible
 * endpoints appear and change their tier mappings faster than this extension
 * ships. So these are the routes known on the day of writing, and a user's own
 * entry is read by the same function into the same shape.
 *
 * ‼️ NO CREDENTIALS HERE, EVER. A template is the SHAPE of a route; what
 * unlocks it lives in SecretStorage and belongs to X-100.
 */
export const CLAUDE_ROUTE_TEMPLATES: ClaudeRouteTemplate[] = [
    {
        providerId: 'anthropic',
        providerLabel: 'Anthropic (first-party)',
        // No base URL: this is what Claude Code does with nothing injected, and
        // writing the public endpoint here would turn the default into an
        // override that then has to be kept in step with the CLI.
        route: { authKind: 'subscription' },
        tiers: {},
        docs: 'https://code.claude.com/docs/en/model-config',
        engineCostIsAuthoritative: true
    },
    {
        providerId: 'anthropic-api',
        providerLabel: 'Anthropic (API key)',
        route: { authKind: 'api-key' },
        tiers: {},
        docs: 'https://code.claude.com/docs/en/llm-gateway',
        engineCostIsAuthoritative: true
    },
    {
        providerId: 'kimi',
        providerLabel: 'Kimi (Moonshot, Anthropic-compatible)',
        route: { baseUrl: 'https://api.moonshot.ai/anthropic', authKind: 'api-key' },
        tiers: {},
        docs: 'https://www.kimi.com/code/docs/en/third-party-tools/claude-code.html',
        // ‼️ Measured: under a custom base URL Claude still writes
        // `modelUsage.provider: "firstParty"` and an Anthropic-priced
        // `total_cost_usd`. That is not this vendor's bill.
        engineCostIsAuthoritative: false
    },
    {
        providerId: 'minimax',
        providerLabel: 'MiniMax (Anthropic-compatible)',
        route: { baseUrl: 'https://api.minimax.io/anthropic', authKind: 'api-key' },
        tiers: {},
        docs: 'https://platform.minimax.io/docs/token-plan/claude-code',
        engineCostIsAuthoritative: false
    }
];

/** A route the user described. Anything not listed here is ignored — a template
 *  is copied field by field, so a stray `apiKey` on a settings object cannot
 *  ride into a catalog that is drawn, bridged and exported. */
export interface ClaudeRouteInput {
    providerId?: string;
    providerLabel?: string;
    baseUrl?: string;
    authKind?: string;
    tier?: string;
    tiers?: Record<string, string>;
    docs?: string;
    engineCostIsAuthoritative?: boolean;
    [k: string]: unknown;
}

/**
 * The declared catalog: the shipped routes plus whatever the user described.
 * A user entry naming a shipped id REPLACES it — two rows with one name is a
 * picker nobody can reason about — and keeps the shipped row's position, so
 * overriding a label does not reshuffle the list.
 */
export function readClaudeRouteCatalog(userRoutes?: ClaudeRouteInput[]): ProviderCatalogRead {
    const out: ClaudeRouteTemplate[] = CLAUDE_ROUTE_TEMPLATES.map(t => ({ ...t }));
    for (const raw of userRoutes || []) {
        const providerId = str(raw.providerId);
        if (!providerId) { continue; }
        // ‼️ FIELD BY FIELD. Spreading `raw` would carry every key the settings
        // object happens to hold — including the one somebody put a key in.
        const tiers: Record<string, string> = {};
        for (const [k, v] of Object.entries(obj(raw.tiers))) {
            if (str(v)) { tiers[k] = str(v); }
        }
        const route: RedactedRoute = {};
        if (str(raw.baseUrl)) { route.baseUrl = str(raw.baseUrl); }
        if (str(raw.authKind)) { route.authKind = str(raw.authKind); }
        if (str(raw.tier)) { route.tier = str(raw.tier); }
        const built: ClaudeRouteTemplate = {
            providerId,
            providerLabel: str(raw.providerLabel) || providerId,
            route,
            tiers,
            ...(str(raw.docs) ? { docs: str(raw.docs) } : {}),
            // An unstated answer is the cautious one: a route somebody had to
            // describe by hand is not first-party.
            engineCostIsAuthoritative: raw.engineCostIsAuthoritative === true
        };
        const at = out.findIndex(t => t.providerId === providerId);
        if (at >= 0) { out[at] = built; } else { out.push(built); }
    }
    return {
        providers: out.map(t => ({
            providerId: t.providerId,
            providerLabel: t.providerLabel,
            models: Object.values(t.tiers),
            route: t.route
        })),
        source: 'agent-farm-profile',
        rows: [],
        templates: out
    };
}

/**
 * ‼️ REFUSED BEFORE THE SPAWN, IN A PLACE SOMEBODY IS LOOKING.
 *
 * The item's third acceptance line. A tier the route does not map, or a model
 * the engine stopped offering, otherwise fails as an engine error on a `[y/n]`
 * in a terminal nobody is watching — or worse, silently, on a route that
 * answers to a name it does not serve.
 *
 * ‼️ AND SILENCE REFUSES NOTHING. A catalog that has not been read is not proof
 * that a model is gone: OpenCode is reachable long before the background read
 * has answered, and refusing on an empty list would block every launch in the
 * first seconds of a window. Where there is no list, the engine's own error is
 * the honest one.
 */
export function catalogRefusal(
    cat: ProviderCatalogRead | undefined, sel: CatalogSelection
): string[] {
    if (!cat || cat.source === 'not-fetched') { return []; }
    const errors: string[] = [];
    const providerId = str(sel.providerId);

    if (cat.templates) {
        if (!providerId) { return []; }
        const t = cat.templates.find(x => x.providerId === providerId);
        if (!t) {
            errors.push(`route "${providerId}" is not one of: `
                + cat.templates.map(x => x.providerId).join(', '));
            return errors;
        }
        const tier = str(sel.tier);
        const mapped = Object.keys(t.tiers);
        // A route that maps NO tiers serves whatever model it is given — the
        // first-party rows are like this, and refusing them would be refusing
        // the default.
        if (tier && mapped.length && !mapped.includes(tier)) {
            errors.push(`${t.providerLabel} does not map the "${tier}" tier`
                + ` (it maps: ${mapped.join(', ')})`);
        }
        return errors;
    }

    const p = cat.providers.find(x => x.providerId === providerId);
    if (providerId && !p) {
        errors.push(`provider "${providerId}" is not offered here`
            + (cat.providers.length ? ` (offered: ${cat.providers.map(x => x.providerId).join(', ')})` : ''));
        return errors;
    }
    const modelId = str(sel.modelId);
    if (!modelId) { return errors; }
    // ‼️ TWO SPELLINGS OF ONE MODEL, AND THE CALLER USES THE OTHER ONE.
    // `ref` is the engine's wire spelling (`opencode/big-pickle`) and `modelId`
    // is the `id` field under it (`big-pickle`); measured, `ref` is exactly
    // providerId + "/" + id on every row. A launch carries the REF - that is
    // what goes to `-m` - so matching the bare id alone refused every model
    // there is. Found the day the refusal first reached a surface (X-113),
    // which is the whole argument for putting it on one.
    const row = cat.rows.find(r => r.providerId === providerId
        && (r.ref === modelId || r.modelId === modelId));
    if (!row) {
        errors.push(`model "${modelId}" is no longer offered by ${providerId}`);
        return errors;
    }
    const variant = str(sel.variant);
    if (variant && !row.variants.includes(variant)) {
        errors.push(row.variants.length
            ? `${row.label} has no "${variant}" variant (it publishes: ${row.variants.join(', ')})`
            : `${row.label} publishes no variant to choose from, so "${variant}" cannot be applied`);
    }

    // ‼️ X-113 - AND WHAT THE MODEL CANNOT DO, WHILE SOMEBODY IS STILL
    // CHOOSING IT. Until here the refusal only knew about things that do not
    // EXIST (a gone provider, a gone model, an unpublished variant). A model
    // that exists and cannot do what the pick asks of it used to spawn and
    // then be quiet about it, which is the worse of the two failures: the
    // effort flag is accepted and ignored, and the run reads as normal.
    //
    // ‼️ ONLY A PUBLISHED `false`. `undefined` is an engine that said
    // nothing, and refusing on silence would refuse every catalog that does
    // not carry this field at all.
    const caps = row.capabilities;
    if (caps.toolcall === false) {
        errors.push(`${row.label} publishes no tool calling, and a session here is tool calls`
            + ' from its first turn');
    }
    // The variant is deliberately NOT repeated here: a model with no
    // reasoning publishes no variants either, so the line above has already
    // said it and a second sentence would be the same fact twice.
    const effort = str(sel.effort);
    if (effort && caps.reasoning === false) {
        errors.push(`${row.label} publishes no reasoning, so the "${effort}" effort has`
            + ' nothing to reach');
    }
    return errors;
}
