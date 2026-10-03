/**
 * X-101 — THE ONE ENTRANCE, AND THE TWO ENGINES THAT MEAN DIFFERENT THINGS BY
 * THE WORD "PROVIDER" COMING OUT OF IT WITHOUT MIXING.
 *
 * X-98 wrote the contract, X-99 the catalogs, X-100 the ownership and the vault
 * boundary. None of them RAN: `readClaudeRouteCatalog` and `readOpenCodeCatalog`
 * were called from nowhere — measured with grep — and the adapter interface had
 * no implementations at all. This file is where the four become one call.
 *
 * ‼️ WHY ONE ENTRANCE IS THE ITEM RATHER THAN A TIDINESS. The acceptance line
 * says terminal, Console and headless use the same registry symbol. Three
 * surfaces that each work out a launch their own way are three answers to
 * "which route is this run on", and when they disagree nothing says so out loud
 * — the transcript does not record the route (measured, X-98), so the manifest
 * is the only witness and there must be exactly one thing writing it.
 *
 * ‼️ AND THE TWO ENGINES ARE OPPOSITE IN THE PLACE THAT MATTERS.
 *
 * - **Claude**: the route is Agent Farm's. It is injected as environment, in
 *   isolation from whatever the shell was already carrying, and it is fixed for
 *   the session — a route change is a different program, so a resume across one
 *   forks instead of pretending.
 * - **OpenCode**: the provider is the ENGINE's. `auth.json` and `opencode.json`
 *   are its own, the choice travels as `-m provider/model`, and it may change at
 *   a turn boundary because the engine documents that. Agent Farm contributes
 *   no environment and clears none: a second copy of that credential here would
 *   be a second vault, a second revision, and two truths that eventually
 *   disagree.
 *
 * Everything here is pure — no vscode, no I/O, no keychain. The credential
 * arrives through `secretFor`, which is the only way the private half can be
 * built without this file knowing what a keychain is.
 */

import {
    BillingSourcePolicy, notApplicableAdapter, ProviderAdapter, ProviderCatalog,
    ProviderSelection, ResolvedEngineRuntime, ResumeVerdict
} from './providerAdapter';
import { catalogRefusal, ClaudeRouteInput, readClaudeRouteCatalog, readOpenCodeCatalog } from './providerCatalog';
import { ProviderIdentity, unknownIdentity } from './providerIdentity';
import { claudeReported, openCodeReported, reportedPartial } from './reportedIdentity';
import { StoredProviderProfile } from './providerProfiles';
import { claudeRouteRuntime } from './providerRuntime';

/**
 * What the registry has to be handed, and nothing more.
 *
 * ‼️ `secretFor` IS A FUNCTION, NOT A MAP OF KEYS. A map would mean every
 * credential the user owns is sitting in an argument on every call, including
 * the calls that resolve a route with no key at all. Asked one id at a time,
 * exactly one secret is ever in memory here and only when a spawn needs it.
 */
export interface RegistryDeps {
    /** The route profiles Agent Farm holds (X-100). */
    profiles: StoredProviderProfile[];
    /** The credential for one profile, from the OS keychain. ‼️ PRIVATE. */
    secretFor(profileId: string): string | undefined;
    /** The environment the spawn would inherit — `process.env` at the call site. */
    inheritedEnv?: Record<string, string | undefined>;
    /** OpenCode's own catalog text, when something has read it. Absent means
     *  NOT FETCHED, which refuses nothing — see `catalogRefusal`. */
    openCodeCatalogText?: string;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * ‼️ THE PROFILES ARE THE CATALOG'S USER ROUTES — the single fact this file
 * exists to stop being two.
 *
 * X-99 reads a catalog from shipped templates plus "routes the user described";
 * X-100 stores route profiles. Left apart, those are two lists of the same
 * thing with two revisions, which is the exact "two vaults" mistake X-100 was
 * written to prevent, one level up. A profile IS an instance of a route
 * template — with an id, a revision and a credential — so it is handed to the
 * catalog reader as one, field by field, and there is no second
 * `agentFarm.claudeRoutes` setting.
 */
export function profilesAsRoutes(profiles: readonly StoredProviderProfile[]): ClaudeRouteInput[] {
    return (profiles || [])
        .filter(p => p && p.engine === 'claude')
        .map(p => ({
            // ‼️ The catalog is keyed by the PROFILE id, not by the vendor id.
            // Two profiles for the same vendor (a work key and a personal one)
            // are two routes a person picks between; collapsing them onto the
            // vendor name would make one of them unreachable.
            providerId: p.id,
            providerLabel: p.label || p.id,
            ...(p.baseUrl ? { baseUrl: p.baseUrl } : {}),
            ...(p.authKind ? { authKind: p.authKind } : {}),
            ...(p.description ? { note: p.description } : {}),
            tiers: { ...p.tiers },
            // A route somebody had to describe by hand is not first-party. The
            // one exception is the route that points at nothing: with no base
            // url of its own it IS Anthropic's own endpoint.
            engineCostIsAuthoritative: !p.baseUrl
        }));
}

const findProfile = (deps: RegistryDeps, id: string): StoredProviderProfile | undefined =>
    (deps.profiles || []).find(p => p && p.id === id);

/**
 * THE CLAUDE ADAPTER — Agent Farm owns the route, so Agent Farm injects it and
 * takes responsibility for what the child inherits.
 */
function claudeAdapter(deps: RegistryDeps): ProviderAdapter {
    const catalog = (): ProviderCatalog => readClaudeRouteCatalog(profilesAsRoutes(deps.profiles));

    const identityFor = (sel: ProviderSelection): ProviderIdentity => {
        const profile = findProfile(deps, str(sel.providerId));
        if (!profile) { return { ...unknownIdentity('claude'), scope: 'session' }; }
        const tier = str(sel.tier);
        const runtime = claudeRouteRuntime(profile, undefined, undefined, tier);
        return {
            engine: 'claude',
            // ‼️ THE VENDOR, NOT THE PROFILE. Two profiles for one vendor are
            // two routes, and `providerProfileId` below is what tells them
            // apart; a reader asking "whose endpoint served this" wants the
            // vendor, and a reader asking "which of my keys" has the other field.
            providerId: profile.providerId,
            providerLabel: profile.label,
            origin: 'agent-farm-profile',
            scope: 'session',
            providerProfileId: profile.id,
            providerProfileRevision: profile.revision,
            ...(Object.keys(runtime.route).length ? { route: runtime.route } : { route: {} }),
            requestedModelRef: (tier && profile.tiers?.[tier]) || str(sel.modelId),
            // Declared before the spawn — and on this engine that is not merely
            // the first source, it is the ONLY authority: the transcript does
            // not preserve which route served it (measured, X-98).
            proof: 'launch-declared'
        };
    };

    return {
        id: 'claude-route',
        version: '1',
        engine: 'claude',
        axis: 'provider',
        providerScope: 'session',
        // A route change is a different program, not a continuation.
        canSwitchProviderAtTurnBoundary: false,
        catalog,
        normalizeSelection: sel => {
            const id = str(sel.providerId);
            if (!id) { return { engine: 'claude', modelId: str(sel.modelId), effort: sel.effort }; }
            return findProfile(deps, id)
                ? { engine: 'claude', providerId: id, tier: str(sel.tier), modelId: str(sel.modelId), effort: sel.effort }
                : undefined;
        },
        resolveRuntime: (sel): ResolvedEngineRuntime => {
            const profile = findProfile(deps, str(sel.providerId));
            const runtime = claudeRouteRuntime(
                profile,
                profile ? deps.secretFor(profile.id) : undefined,
                deps.inheritedEnv,
                str(sel.tier)
            );
            return {
                identity: identityFor(sel),
                // Claude takes no provider argument: the route is environment,
                // and a `-m` here would be a second answer to the same question.
                args: [],
                ...(Object.keys(runtime.spawnEnv).length ? { spawnEnv: runtime.spawnEnv } : {}),
                ...(runtime.clearEnv.length ? { clearEnv: runtime.clearEnv } : {})
            };
        },
        preflight: sel => {
            const id = str(sel.providerId);
            if (!id) { return []; }
            const profile = findProfile(deps, id);
            const errors = catalogRefusal(
                readClaudeRouteCatalog(profilesAsRoutes(deps.profiles)),
                { engine: 'claude', providerId: id, tier: str(sel.tier) }
            );
            if (errors.length) { return errors; }
            // ‼️ A THIRD-PARTY ENDPOINT WITH NO KEY IS THE FAILURE WORTH
            // CATCHING HERE. It spawns, reaches a stranger's endpoint
            // unauthenticated, and the message a person then reads is about
            // authentication rather than about the profile that has no key in
            // it. The first-party route needs none — its sign-in is in the
            // credentials FILE, which is why the check is on `baseUrl`.
            if (profile?.baseUrl && !deps.secretFor(profile.id)) {
                errors.push(`"${profile.label}" has no stored key, so a run on it would reach `
                    + `${profile.baseUrl} unauthenticated.`);
            }
            return errors;
        },
        // ‼️ MEASURED: the Claude transcript does NOT name the route it ran on,
        // so `reportedProviderIds` comes back EMPTY from here for ever — reading
        // `claude-opus-5` as "Anthropic" is the single defect
        // `providerIdentity.ts` exists to make unbreakable, and a route is the
        // one thing this engine's own events cannot witness.
        //
        // ‼️ THE MODEL IS A DIFFERENT FIELD AND IT IS NAMED. X-102's whole point
        // is holding what was ASKED FOR beside what CAME BACK; with no reported
        // half on the engine that runs almost everything here, the manifest
        // would be comparing itself against nothing on every run that matters.
        identityFromEvents: events => reportedPartial('claude', claudeReported(events)),
        resumePolicy: (previous, requested): ResumeVerdict => {
            const wantId = str(requested.providerId);
            if (!previous || !wantId) { return { act: 'resume' }; }
            const want = findProfile(deps, wantId);
            const same = previous.providerProfileId
                ? previous.providerProfileId === wantId
                : previous.providerId === (want?.providerId ?? wantId);
            if (same) { return { act: 'resume' }; }
            // Measured in August: resuming a session through a different route
            // mixed two routes' models into one transcript. A fork keeps the
            // history readable and tells the truth about what is a new program.
            return {
                act: 'fork',
                why: `this session ran on the "${previous.providerId}" route; a different route is a `
                    + 'different program, so it continues as a fork rather than pretending to be the same run.'
            };
        },
        billingPolicy: (selection): BillingSourcePolicy => {
            const profile = findProfile(deps, str(selection?.providerId));
            // A third-party Anthropic-compatible endpoint still makes Claude
            // write `modelUsage.provider: "firstParty"` and an Anthropic-priced
            // `total_cost_usd` — measured. That is not the vendor's bill, and it
            // is not the user's plan being spent either.
            const firstParty = !profile || !profile.baseUrl;
            // ‼️ AND A KEY IS NOT A PLAN — the two questions have different
            // answers on the same endpoint. Both routes reach Anthropic, so
            // both state a real tariff; but a subscription is RATIONED by a
            // five-hour window and a key is METERED per token. Answering the
            // second question with the first one's answer wrote every API-key
            // run onto somebody's plan window. Held against `billingOf` by
            // test/test_billing.js — the rule has one answer, in two readers.
            const metered = String(profile?.authKind ?? '').trim() === 'api-key';
            return {
                engineCostIsAuthoritative: firstParty,
                countsAgainstPlanQuota: firstParty && !metered
            };
        },
        identity: () => ({ ...unknownIdentity('claude'), scope: 'session' })
    };
}

/**
 * THE OPENCODE ADAPTER — the engine owns the provider, so Agent Farm records the
 * choice and keeps its hands off everything else.
 */
function openCodeAdapter(deps: RegistryDeps): ProviderAdapter {
    const catalog = (): ProviderCatalog => readOpenCodeCatalog(deps.openCodeCatalogText);

    /**
     * ‼️ THE PROVIDER IS ASKED OF THE CATALOG, NEVER TAKEN OFF THE MODEL NAME.
     *
     * `opencode/big-pickle` looks like it carries its own provider, and
     * splitting on the slash would be right most of the time — which is exactly
     * what makes it the wrong rule. It is a GUESS that happens to agree, and the
     * day a wire name is spelled differently it goes on agreeing confidently
     * with the wrong answer. The catalog is the engine's own statement of which
     * provider serves which model, so that is what is asked.
     *
     * And when nothing has read the catalog yet, the answer is EMPTY — which
     * `providerIdentity.ts` requires this system to be able to say rather than
     * fill in. `test_provider_identity.js` measures this rule across the whole
     * source tree, so it fails the build rather than somebody's memory.
     */
    const catalogProviderFor = (ref: string): string => {
        if (!ref) { return ''; }
        const row = readOpenCodeCatalog(deps.openCodeCatalogText).rows.find(r => r.ref === ref);
        return row ? row.providerId : '';
    };

    const identityFor = (sel: ProviderSelection): ProviderIdentity => {
        const model = str(sel.modelId);
        const provider = str(sel.providerId) || catalogProviderFor(model);
        // ‼️ A MODEL WITHOUT A PROVIDER IS `unknown`, NOT `engine-native`. The
        // origin says where the PROVIDER answer came from; claiming the engine
        // named one when nothing did would be the same guess this file just
        // refused to make, wearing a different word. The model is still
        // recorded — it is a fact, and it is the fact we actually have.
        if (!provider) {
            return { ...unknownIdentity('opencode'), scope: 'turn', requestedModelRef: model };
        }
        return {
            engine: 'opencode',
            providerId: provider,
            origin: 'engine-native',
            // The engine legitimately changes this at a turn boundary, so a
            // session-level claim would be lying about a real feature.
            scope: 'turn',
            requestedModelRef: model,
            proof: 'launch-declared'
        };
    };

    return {
        id: 'opencode-native',
        version: '1',
        engine: 'opencode',
        axis: 'provider',
        providerScope: 'turn',
        // `session/set_config_option` — ‼️ and it takes `configId`, not `id`
        // (documented in `core/opencode.ts`, where it has bitten before).
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
            return {
                identity: identityFor(sel),
                // The CLI's own vocabulary, passed through unassembled. Building
                // `provider/model` from parts here would invent wire names the
                // engine never published.
                args: model ? ['-m', model] : []
                // ‼️ NO `spawnEnv` AND NO `clearEnv`, deliberately. This engine's
                // sign-in is its own; a copy here would be a second vault. And
                // an OpenCode run through an Anthropic provider is the engine's
                // arrangement — sanitising the user's Anthropic environment for
                // it would break a setup Agent Farm does not own.
            };
        },
        preflight: sel => catalogRefusal(readOpenCodeCatalog(deps.openCodeCatalogText), {
            engine: 'opencode',
            // Same rule as the identity: the catalog says who serves this, and
            // where it has not been read there is nothing to refuse anyway.
            providerId: str(sel.providerId) || catalogProviderFor(str(sel.modelId)),
            modelId: str(sel.modelId),
            ...(sel.variant ? { variant: sel.variant } : {}),
            // X-113 - the reasoning level is part of the pick, so it is part of
            // what can be refused; a model that publishes none says so here.
            ...(sel.effort ? { effort: str(sel.effort) } : {})
        }),
        // ‼️ THE OPPOSITE OF CLAUDE, AND FOR A MEASURED REASON: this engine DOES
        // name its provider — `providerID` on an export's assistant rows, and
        // `provider/model` as the ACP `model` option's current value. Both are
        // read; the second is cut only where the head is a name this same
        // catalog published, which is the identical refusal `catalogProviderFor`
        // makes above rather than a second, looser one living beside it.
        identityFromEvents: events => reportedPartial(
            'opencode',
            openCodeReported(events, catalog().providers.map(p => p.providerId))
        ),
        // A provider change here is the engine's documented feature, not the
        // defect it is on Claude.
        resumePolicy: () => ({ act: 'resume' }),
        billingPolicy: () => ({ engineCostIsAuthoritative: true, countsAgainstPlanQuota: false }),
        identity: () => ({ ...unknownIdentity('opencode'), scope: 'turn' })
    };
}

/**
 * The adapter for an engine, by name.
 *
 * ‼️ AN ENGINE NOBODY HAS HEARD OF IS `not-applicable`, NOT AN EXCEPTION. This
 * is asked from surfaces that read the engine name off a stored record, and a
 * record written by a future version — or by a hand — must not be able to throw
 * a panel. The complete answer for "this engine has no provider axis" already
 * exists (X-98) and it is the right answer for "we do not know this engine"
 * too: carry no provider value at all.
 */
export function adapterFor(engine: string, deps: RegistryDeps): ProviderAdapter {
    switch (str(engine).toLowerCase()) {
        case 'claude': return claudeAdapter(deps);
        case 'opencode': return openCodeAdapter(deps);
        default: return notApplicableAdapter(str(engine).toLowerCase() || 'unknown');
    }
}

/**
 * ‼️ THE SYMBOL THE ACCEPTANCE LINE NAMES. Terminal, Console and headless call
 * THIS — not an adapter they picked themselves, and not their own reading of a
 * profile. One place builds a launch's runtime, so there is one thing to fix
 * when it is wrong and one thing to read when somebody asks what a session ran
 * on.
 */
export function resolveRuntime(
    engine: string, selection: ProviderSelection, deps: RegistryDeps
): ResolvedEngineRuntime {
    return adapterFor(engine, deps).resolveRuntime({ ...selection, engine: str(engine) || selection.engine });
}
