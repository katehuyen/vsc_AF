/**
 * X-98 — THE ENGINE ADAPTER CONTRACT: the questions the shared core is allowed
 * to ask an engine, instead of the `if (engine === '…')` it would otherwise
 * spread across twenty surfaces.
 *
 * The design rule this encodes (X-97 blueprint): **the shared core is
 * provider-aware and engine-agnostic; running, ownership, resume and
 * verification rules belong to the adapters.** Agent Farm owns Claude Code's
 * route profiles and injects an isolated environment for them. It owns nothing
 * of OpenCode's: that engine's provider catalog, `auth.json` and `opencode.json`
 * are the engine's, and Agent Farm reads the public half and records the choice
 * rather than keeping a second copy of the credential — two vaults, two
 * revisions and two contradicting truths being the alternative.
 *
 * ‼️ THIS INTERFACE DOES NOT FORCE A NEW ENGINE TO HAVE PROVIDERS. Three of the
 * five today do not, and `axis: 'not-applicable'` is how they say so — an
 * ANSWER, so callers ask one question and get one, rather than an absent
 * adapter every caller has to null-check and every box has to draw empty.
 *
 * No implementations live here. The registry and the two real adapters are
 * X-101; this file is the sentence they have to satisfy, and the reason it
 * lands first is that X-99 (catalogs) and X-100 (ownership) are written against
 * it.
 */

import {
    ProviderIdentity, ProviderScope, RedactedRoute, unknownIdentity
} from './providerIdentity';

/** Does this engine have a provider axis at all? */
export type ProviderAxis = 'provider' | 'not-applicable';

/**
 * ‼️ WHERE A CATALOG CAME FROM, kept beside the catalog itself. A list read out
 * of a running engine and a list this build shipped are both "the models", and
 * a surface that cannot tell them apart will present a stale guess with the
 * confidence of a measurement.
 */
export type CatalogSource =
    /** The engine answered — ACP `configOptions`, `opencode models --verbose`. */
    | 'engine-reported'
    /** A route profile Agent Farm holds (Claude tiers). */
    | 'agent-farm-profile'
    /** This build's own table, which is the answer before anything has run. */
    | 'shipped'
    /**
     * ‼️ NOBODY HAS ASKED THE ENGINE YET — and this is NOT "the engine offers
     * nothing". The two lead to opposite behaviour one layer down: an empty
     * catalog refuses a selection by name, and an unread one refuses nothing,
     * because absence of a list is not proof of absence of a model.
     */
    | 'not-fetched'
    /** The engine has no provider axis. */
    | 'not-applicable';

export interface ProviderCatalogEntry {
    providerId: string;
    providerLabel: string;
    /** Wire-qualified model refs (`opencode/big-pickle`), as the ENGINE spells
     *  them — never assembled here from parts. */
    models: string[];
    /** Reasoning variants, only where the engine really offers them. */
    variants?: string[];
    route?: RedactedRoute;
    /** X-494 — the owner's own note on a route (whose key, what for), shown under it in every picker. */
    note?: string;
}

export interface ProviderCatalog {
    providers: ProviderCatalogEntry[];
    source: CatalogSource;
    /** Which revision of the source this is, so a launch manifest can name it. */
    revision?: string;
    fetchedAt?: number;
}

/** What a person picked, before an engine has been asked to make sense of it. */
export interface ProviderSelection {
    engine: string;
    providerId?: string;
    modelId?: string;
    variant?: string;
    effort?: string;
    /** ‼️ CLAUDE ONLY, and a separate field from `modelId` on purpose (X-101).
     *  A tier is a question the ROUTE answers — `opus` is `kimi-k2-thinking` on
     *  one route and `MiniMax-M2` on another — so folding it into `modelId`
     *  would make a person's pick mean different things depending on which
     *  route happened to be selected when they made it. `CatalogSelection`
     *  (X-99) already draws the same distinction, for the same reason. */
    tier?: string;
}

/**
 * What an adapter turns a selection into. TWO HALVES, DELIBERATELY: the public
 * identity is written to manifests, the bridge, the UI and exports; the spawn
 * material — environment entries, a resolved key — goes to the child process and
 * NOWHERE else. Separated by type rather than by discipline, because discipline
 * is what fails quietly.
 */
export interface ResolvedEngineRuntime {
    identity: ProviderIdentity;
    /** Extra command-line arguments this provider choice implies. */
    args: string[];
    /** ‼️ PRIVATE. Never serialised into state, a notice, a response or a log. */
    spawnEnv?: Record<string, string>;
    /** Environment names to CLEAR before spawning — an inherited Anthropic route
     *  is otherwise a second, invisible answer to the same question. */
    clearEnv?: string[];
}

/** What a resume is allowed to do when the requested setup differs from the one
 *  the session actually ran on. */
export interface ResumeVerdict {
    /** 'resume' · 'fork' · 'refuse' — the adapter's word, because on Claude a
     *  route change is a different program and on OpenCode it is a feature. */
    act: 'resume' | 'fork' | 'refuse';
    /** One sentence a person can read, when it is not a plain resume. */
    why?: string;
}

/** Which figures this engine's own numbers may be taken as. */
export interface BillingSourcePolicy {
    /** Is the engine's own cost figure a real bill for this provider? On a
     *  Claude custom route it is NOT: measured, it writes
     *  `modelUsage.provider: "firstParty"` and an Anthropic-priced
     *  `total_cost_usd` for a third party's endpoint. */
    engineCostIsAuthoritative: boolean;
    /** May this run's spend count against the user's plan quota? */
    countsAgainstPlanQuota: boolean;
}

/** The capabilities the item names, as a list something can be measured against. */
export const PROVIDER_ADAPTER_CAPABILITIES = [
    'catalog', 'runtime', 'preflight', 'identity', 'resume', 'billing'
] as const;

export type ProviderAdapterCapability = typeof PROVIDER_ADAPTER_CAPABILITIES[number];

/**
 * The whole of what the shared core may ask an engine about providers.
 *
 * ‼️ Every method is answerable WITHOUT spawning anything. `preflight` exists so
 * a wrong setup fails before a process starts, in a place somebody is looking,
 * rather than on a `[y/n]` in a terminal nobody is watching.
 */
export interface ProviderAdapter {
    /** Stable id of the adapter itself, recorded in the launch manifest so a
     *  historical record names the code that produced it. */
    id: string;
    version: string;
    engine: string;
    axis: ProviderAxis;
    providerScope: ProviderScope;
    /** OpenCode: true (`session/set_config_option`). Claude: false — a route
     *  change is a different program, not a continuation. */
    canSwitchProviderAtTurnBoundary: boolean;

    /** What is on offer, and where the list came from. */
    catalog(context?: { cwd?: string }): ProviderCatalog;
    /** A person's pick, in the engine's own wire vocabulary — or `undefined`
     *  when the engine would not recognise it. */
    normalizeSelection(selection: ProviderSelection): ProviderSelection | undefined;
    /** The redacted manifest plus the private spawn material. */
    resolveRuntime(selection: ProviderSelection): ResolvedEngineRuntime;
    /** Static errors visible without running anything; empty means "nothing
     *  provably wrong", never "this will work". */
    preflight(selection: ProviderSelection): string[];
    /** What the engine actually reported, read out of its own events. */
    identityFromEvents(events: unknown): Partial<ProviderIdentity>;
    resumePolicy(previous: ProviderIdentity | undefined, requested: ProviderSelection): ResumeVerdict;
    /** ‼️ ASKED ABOUT A SELECTION, not about the engine (X-101). On Claude the
     *  answer differs per ROUTE: the first-party one's cost figure is a real
     *  bill and a third-party endpoint's is Anthropic-priced fiction — measured.
     *  An engine-wide answer would have to pick one of those and be wrong for
     *  the other half of the routes. */
    billingPolicy(selection?: ProviderSelection): BillingSourcePolicy;
    /** This adapter's own identity answer with nothing selected — the shape a
     *  run carries when the axis does not apply. */
    identity(): ProviderIdentity;
}

/**
 * ‼️ THE ENGINE WITH NO PROVIDER AXIS, AS A COMPLETE ANSWER.
 *
 * Codex, Gemini and Antigravity have no provider dimension. Left without an
 * adapter, every caller in the family would need a null check and every UI a
 * hidden branch — and the failure actually being prevented is the opposite one:
 * a Claude-shaped provider value riding along on a Gemini run because the shared
 * type had a field for it. This answers every question the contract asks, says
 * `not-applicable` to all of them, and carries no provider value at all.
 */
export function notApplicableAdapter(engine: string): ProviderAdapter {
    const identity = (): ProviderIdentity => ({
        ...unknownIdentity(engine),
        origin: 'not-applicable'
    });
    return {
        id: 'not-applicable',
        version: '1',
        engine,
        axis: 'not-applicable',
        providerScope: 'session',
        canSwitchProviderAtTurnBoundary: false,
        catalog: () => ({ providers: [], source: 'not-applicable' }),
        // A selection naming a provider for an engine that has none is not
        // narrowed into something plausible — it is not recognised.
        normalizeSelection: sel =>
            (sel.providerId?.trim() ? undefined : { engine, modelId: sel.modelId, effort: sel.effort }),
        resolveRuntime: () => ({ identity: identity(), args: [] }),
        preflight: sel => (sel.providerId?.trim()
            ? [`${engine} has no provider setting; "${sel.providerId.trim()}" cannot be applied to it.`]
            : []),
        identityFromEvents: () => ({}),
        resumePolicy: () => ({ act: 'resume' }),
        billingPolicy: () => ({ engineCostIsAuthoritative: true, countsAgainstPlanQuota: true }),
        identity
    };
}
