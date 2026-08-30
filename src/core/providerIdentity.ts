/**
 * X-98 — WHO ACTUALLY SERVED THIS SESSION, AS ONE SHAPE FOR EVERY ENGINE.
 *
 * Agent Farm starts sessions on five engines and records, for each, which MODEL
 * ran. It records no provider at all — and the two engines that have a provider
 * axis do not mean the same thing by the word:
 *
 * - **Claude Code**: a provider is a ROUTE — base URL, auth and tier — that
 *   Agent Farm itself owns and injects. It is fixed for the whole session.
 *   Measured on 23 Aug 2026 against a local fake Anthropic endpoint: two Claude
 *   processes ran concurrently on separate routes under the same model name,
 *   the transcript did NOT preserve which route served it, and resuming one
 *   session through a different route mixed two routes' models into a single
 *   transcript. So on this engine the launch manifest is the authority and the
 *   transcript is corroboration, never the other way round.
 * - **OpenCode**: the provider is the engine's OWN identity and the first half
 *   of the wire name (`opencode/big-pickle`). The engine legitimately allows it
 *   to change at a turn boundary (`session/set_config_option`), so a session
 *   summary that carried one provider would be lying about a real feature.
 *
 * Written down as one shape, that difference is a single field — `scope`.
 * Written down per surface, it becomes an `if (engine === 'claude')` in twenty
 * places, and the first one somebody forgets is a session claiming a route it
 * did not run on.
 *
 * ‼️ THE RULE THIS MODULE EXISTS TO MAKE UNBREAKABLE: NOTHING GUESSES THE
 * PROVIDER FROM THE MODEL NAME. `claude-opus-5` does not prove Anthropic served
 * it; that is precisely what the measurement above disproved. A provider is
 * DECLARED (the launch manifest wrote it before the spawn), or REPORTED (the
 * engine named it in its own events), or it is unknown — and `unknown` is an
 * answer this system is required to be able to give rather than an absence it
 * fills in. `test_provider_identity.js` measures that rule across the whole
 * source tree, so it fails the build rather than somebody's memory.
 *
 * Everything here is pure: no VS Code, no I/O, no secrets. What is engine-
 * SPECIFIC — how a catalog is fetched, how a runtime is built, what a resume is
 * allowed to change — belongs to the adapters (`providerAdapter.ts`), which is
 * the boundary that keeps this file from growing an engine name.
 */

/**
 * WHERE THE PROVIDER ANSWER CAME FROM — which is a different question from
 * whether it is right, and a different one again from who owns the credential.
 */
export type ProviderOrigin =
    /** Agent Farm owns the route and injected it (a Claude route profile). */
    | 'agent-farm-profile'
    /** The engine owns it and named it (an OpenCode provider). */
    | 'engine-native'
    /** Set outside Agent Farm — inherited environment, the user's own config. */
    | 'external'
    /** ‼️ A record written before any of this existed. NOT the same as unknown:
     *  this one says "nobody was asked", so it can be backfilled from evidence
     *  later (X-116). It is never filled in from the model name. */
    | 'legacy-inherit'
    /** Asked, and there is no answer. */
    | 'unknown'
    /**
     * ‼️ THE ENGINE HAS NO PROVIDER AXIS — an ANSWER, not an absence. Three of
     * the five engines are in this state. Expressed as `unknown` it would invite
     * every surface to go looking for a fact that does not exist; expressed as
     * an absent field it would make every caller write a null check and every
     * box draw itself empty.
     */
    | 'not-applicable';

/**
 * ‼️ THE ONE FIELD THAT KEEPS TWO ENGINES IN ONE SCHEMA. On Claude a provider
 * change is a different program and therefore a new session; on OpenCode it is
 * a documented turn-boundary feature. The adapter decides which; every reader
 * downstream asks this field instead of asking the engine's name.
 */
export type ProviderScope = 'session' | 'turn';

/** HOW WE KNOW. Kept apart from the value, so a surface can print a figure and
 *  say how sure it is in the same breath. */
export type IdentityProof =
    /** Agent Farm wrote it into the launch manifest before the spawn. */
    | 'launch-declared'
    /** The engine named it in its own events, and nothing was declared. */
    | 'engine-reported'
    /** Both, and they agree. */
    | 'matched'
    /** Neither. */
    | 'unknown';

/**
 * ‼️ THE PUBLIC HALF OF A ROUTE, AND THE WORD REDACTED IS LOAD-BEARING. An
 * identity is written into a manifest, read over the bridge, drawn in the UI and
 * carried into exports. A route that kept its key would put that key in all
 * four. `redactRoute` builds this by NAMING the public fields rather than by
 * deleting the private ones — a deny-list grows a hole the first time somebody
 * adds a field to the source shape.
 */
export interface RedactedRoute {
    baseUrl?: string;
    /** `api-key` | `oauth` | `subscription` … — the KIND, never the credential. */
    authKind?: string;
    tier?: string;
}

/** The historical identity of a run: what was asked for, what came back, and
 *  how sure we are that the two are the same thing. */
export interface ProviderIdentity {
    engine: string;
    /** '' when there is no provider to name — see `origin` for why. */
    providerId: string;
    providerLabel?: string;
    origin: ProviderOrigin;
    scope: ProviderScope;
    /** Only for `agent-farm-profile`: which stored profile, at which revision.
     *  ‼️ NOT universal and NOT required — an OpenCode provider is a first-class
     *  identity without Agent Farm inventing a profile to hang it on. */
    providerProfileId?: string;
    providerProfileRevision?: number;
    route?: RedactedRoute;
    /** The engine's real wire identity: `provider/model` on OpenCode, the
     *  profile's model or tier on Claude. */
    requestedModelRef: string;
    reportedProviderIds?: string[];
    reportedModels?: string[];
    proof: IdentityProof;
}

/**
 * One turn's runtime identity. A session-level answer is not enough: on OpenCode
 * the provider may legitimately differ turn to turn, and on Claude a difference
 * between turns is the signature of the resume defect measured in August.
 */
export interface TurnRuntimeIdentity extends ProviderIdentity {
    /** Whether this turn's answer differs from the turn before it. `false` on
     *  the first turn — there is nothing for it to have changed from. */
    changedFromPrevious: boolean;
}

/**
 * The engine's wire spelling of a model. OpenCode publishes `provider/model` and
 * accepts nothing else; every other engine names the model alone.
 */
export function qualifiedRef(providerId: string | undefined, modelId: string | undefined): string {
    const p = (providerId || '').trim();
    const m = (modelId || '').trim();
    if (!m) { return ''; }
    return p ? `${p}/${m}` : m;
}

/**
 * ‼️ THE ANTI-GUESS RULE, MADE EXECUTABLE — and the reason this takes a second
 * argument at all.
 *
 * Splitting `a/b` on the slash and calling `a` a provider is the single most
 * available mistake in this whole family, and `opencode.ts` (K-28) already
 * carries the scar: a bare model id sent back to the engine as a guessed
 * `provider/model` was refused by name. So a prefix only becomes a provider when
 * the caller can already NAME it — from the engine's own published list. Given
 * nothing to check against, nothing is claimed: the whole string is the model,
 * which is the honest reading of a name nobody has vouched for.
 */
export function splitQualifiedRef(
    ref: string | undefined, knownProviderIds: readonly string[] | undefined
): { providerId: string; modelId: string } {
    const r = (ref || '').trim();
    const known = knownProviderIds || [];
    const cut = r.indexOf('/');
    if (cut <= 0 || !known.length) { return { providerId: '', modelId: r }; }
    const head = r.slice(0, cut);
    return known.includes(head)
        ? { providerId: head, modelId: r.slice(cut + 1) }
        : { providerId: '', modelId: r };
}

/** How we know, from the two things that can know it. */
export function proofOf(
    declaredProviderId: string | undefined, reportedProviderIds: readonly string[] | undefined
): IdentityProof {
    const declared = (declaredProviderId || '').trim();
    const reported = (reportedProviderIds || []).map(s => (s || '').trim()).filter(Boolean);
    if (declared && reported.length) { return reported.includes(declared) ? 'matched' : 'launch-declared'; }
    if (declared) { return 'launch-declared'; }
    return reported.length ? 'engine-reported' : 'unknown';
}

/**
 * ‼️ A DISAGREEMENT IS NOT A PROOF VALUE, IT IS A FACT ABOUT ONE. The launch
 * manifest stays the authority when the engine contradicts it — on Claude the
 * transcript demonstrably cannot prove a route — so the proof remains
 * `launch-declared` and the contradiction is kept beside it. On Claude it is the
 * signature of two routes inside one transcript, which X-109 refuses; on
 * OpenCode a second provider may be an ordinary turn-boundary change, which is
 * why what it MEANS is the adapter's answer and not this function's.
 */
export function hasProviderConflict(
    id: Pick<ProviderIdentity, 'providerId' | 'reportedProviderIds'>
): boolean {
    const declared = (id.providerId || '').trim();
    const reported = (id.reportedProviderIds || []).map(s => (s || '').trim()).filter(Boolean);
    return !!declared && reported.length > 0 && !reported.includes(declared);
}

/** More than one provider named across a session's turns. A fact, not a verdict. */
export function isMultiProvider(id: Pick<ProviderIdentity, 'reportedProviderIds'>): boolean {
    const seen = new Set((id.reportedProviderIds || []).map(s => (s || '').trim()).filter(Boolean));
    return seen.size > 1;
}

/**
 * ‼️ A RECORD FROM BEFORE PROVIDERS WERE RECORDED, SAYING SO OUT LOUD.
 *
 * Every session already in the index arrives here. The tempting answer is to
 * read the provider off the model name — and that is the exact defect this item
 * exists to make impossible. `legacy-inherit` says "nobody was asked", which is
 * both true and backfillable from real evidence later (X-116); `unknown` would
 * say "asked, no answer", and filling it in would say something false.
 */
export function legacyIdentity(engine: string, model?: string): ProviderIdentity {
    return {
        engine,
        providerId: '',
        origin: 'legacy-inherit',
        scope: 'session',
        requestedModelRef: (model || '').trim(),
        proof: 'unknown'
    };
}

/** Asked, and nothing answered. `session` scope because it is the safe one:
 *  it forbids a mid-session change nobody has established is allowed. */
export function unknownIdentity(engine: string): ProviderIdentity {
    return { engine, providerId: '', origin: 'unknown', scope: 'session', requestedModelRef: '', proof: 'unknown' };
}

/**
 * ‼️ MAY THE PROVIDER DIFFER FROM ONE TURN TO THE NEXT — asked of the SCOPE,
 * never of the engine's name. Every reader downstream (the resume gate, the
 * session summary, the turn index, the badges) needs this answer, and each one
 * that asked `engine === 'opencode'` instead would be a place to forget when a
 * sixth engine arrives.
 */
export function scopeAllowsTurnChange(scope: ProviderScope | undefined): boolean {
    return scope === 'turn';
}

/**
 * One turn's identity, from what was asked for and what the engine answered
 * with. The two are kept in separate fields on purpose: collapsed into one, the
 * question "did we get what we asked for" stops being answerable, and that
 * question is the whole of provider correctness.
 */
export function turnIdentity(
    requested: Partial<ProviderIdentity> & { engine: string },
    /**
     * ‼️ ONE OR MANY, BECAUSE A TURN GENUINELY HAS BOTH SHAPES. A live event
     * names one model; an indexed turn already records `models: string[]`,
     * because a compaction or a sub-agent inside the turn is served by a
     * different model than the turn that spawned it. Collapsing that to the
     * last one would make a turn that used two look like a turn that used one,
     * and the singular fields are kept so every existing caller reads the same.
     */
    reported?: {
        providerId?: string; model?: string;
        providerIds?: readonly string[]; models?: readonly string[];
    },
    previous?: Pick<ProviderIdentity, 'providerId' | 'requestedModelRef'>
): TurnRuntimeIdentity {
    const many = (one: string | undefined, all: readonly string[] | undefined): string[] => {
        const seen = new Set<string>();
        const out: string[] = [];
        for (const v of [one, ...(all || [])]) {
            const s = (v || '').trim();
            if (s && !seen.has(s)) { seen.add(s); out.push(s); }
        }
        return out;
    };
    const reportedProviderIds = many(reported?.providerId, reported?.providerIds);
    const reportedModels = many(reported?.model, reported?.models);
    const providerId = (requested.providerId || '').trim();
    return {
        engine: requested.engine,
        providerId,
        ...(requested.providerLabel ? { providerLabel: requested.providerLabel } : {}),
        origin: requested.origin || (providerId ? 'engine-native' : 'unknown'),
        scope: requested.scope || 'session',
        ...(requested.providerProfileId ? { providerProfileId: requested.providerProfileId } : {}),
        ...(requested.providerProfileRevision !== undefined
            ? { providerProfileRevision: requested.providerProfileRevision } : {}),
        ...(requested.route ? { route: requested.route } : {}),
        requestedModelRef: (requested.requestedModelRef || '').trim(),
        reportedProviderIds,
        reportedModels,
        proof: proofOf(providerId, reportedProviderIds),
        // Nothing to have changed from on the first turn.
        changedFromPrevious: !!previous
            && ((previous.providerId || '') !== providerId
                || (previous.requestedModelRef || '') !== (requested.requestedModelRef || '').trim())
    };
}

/**
 * ‼️ BUILT BY NAMING WHAT IS PUBLIC, NEVER BY DELETING WHAT IS NOT. The input is
 * whatever a profile record happens to hold — today a key and headers, tomorrow
 * something nobody here has thought of. An allow-list stays correct when that
 * shape grows; a `delete route.apiKey` stops being correct silently, in the one
 * place where being silently wrong means writing a credential into a manifest,
 * a bridge response, a UI string and an export at the same time.
 */
export function redactRoute(route: Record<string, unknown> | undefined): RedactedRoute | undefined {
    if (!route) { return undefined; }
    const str = (v: unknown): string | undefined =>
        (typeof v === 'string' && v.trim() ? v.trim() : undefined);
    const out: RedactedRoute = {};
    const baseUrl = str(route.baseUrl);
    const authKind = str(route.authKind);
    const tier = str(route.tier);
    if (baseUrl) { out.baseUrl = baseUrl; }
    if (authKind) { out.authKind = authKind; }
    if (tier) { out.tier = tier; }
    return out;
}
