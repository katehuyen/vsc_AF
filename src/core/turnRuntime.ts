/**
 * X-102 — WHAT WAS ASKED FOR, BESIDE WHAT CAME BACK, ONE TURN AT A TIME.
 *
 * The manifest is written a line before the spawn and never rewritten: it is the
 * DECLARED half of a run. `reportedIdentity.ts` reads the other half out of the
 * engine's own events. This file is the join — and the join is the item, because
 * either half alone answers a question nobody is actually asking. "Which model
 * did that session run on" has two answers and they are allowed to differ; a
 * system that stored one of them has quietly decided which of the two questions
 * it will never be able to answer again.
 *
 * ‼️ WHY PER TURN AND NOT PER SESSION. Both halves genuinely move inside one
 * session. On OpenCode the provider may change at a turn boundary because the
 * engine documents that (`session/set_config_option`). On Claude the model
 * changes routinely — a compaction and a sub-agent are served by a smaller model
 * than the turn that spawned them — so a session-level "the model was X" is
 * false on nearly every long run. A per-turn record is the only shape in which
 * both of those are ordinary facts rather than contradictions.
 *
 * ‼️ AND THE ONE MISTAKE THIS FILE EXISTS TO NOT MAKE: calling a difference a
 * DEFECT. A launch asks for `opus`; the transcript reports `claude-opus-5`. Those
 * are the same run — an alias and an id — and a comparison that called it a
 * mismatch would paint almost every honest session red, which is the fastest way
 * to make a correctness signal ignored. So the model question is answered in
 * four states and the interesting one is named `unproven`, not `wrong`: the two
 * spellings are not known to be the same thing, and this file is not the place
 * that can resolve an alias (the catalog is, and it may not have been read).
 *
 * Pure — no vscode, no I/O, no clock.
 */

import { LaunchManifest, manifestIndex, manifestOf } from './launchManifest';
import { BillingIdentity, billingOf } from './billing';
import {
    hasProviderConflict, legacyIdentity, ProviderIdentity, proofOf, scopeAllowsTurnChange,
    TurnRuntimeIdentity, turnIdentity
} from './providerIdentity';

/**
 * One turn as the INDEX already holds it. Deliberately structural rather than
 * `SessionTurn`: the transcript parser has recorded `models` per turn for a long
 * time, so the reported half needs no second reading of anything, and a core
 * module that named the session type would drag half the index in behind it.
 */
export interface TurnReport {
    /** 1-based within its session, as `SessionTurn.n` counts. */
    n: number;
    /** Model(s) that served this turn — the engine's own word for it. */
    models?: readonly string[];
    /** Provider(s) the engine NAMED. Empty on Claude for ever (measured). */
    providerIds?: readonly string[];
}

/**
 * ‼️ WHETHER THE RUN GOT THE MODEL IT ASKED FOR — in four states, because two
 * would force three different facts to share one word.
 */
export type ModelAgreement =
    /** The launch named no model: it took whatever the engine defaults to. There
     *  is nothing to compare, and that is not a fault. */
    | 'nothing-requested'
    /** The turn named no model — an engine that writes none, or a turn that
     *  never reached the model at all. */
    | 'nothing-reported'
    /**
     * ‼️ ONE of the reported models is spelled like ONE of the requested names —
     * not all of them, and the difference is load-bearing. A Claude turn is
     * routinely served by a second, smaller model the launch never named: a
     * compaction, a sub-agent, the engine's own machinery riding inside the
     * turn. Demanding that every reported model be a requested one would fire on
     * every long session there has ever been, which is how a correctness signal
     * turns into wallpaper. The run got what it asked for; it also did some
     * housekeeping, and `RunDrift.reportedModels` still names every model so
     * nothing is hidden.
     */
    | 'matched'
    /** ‼️ BOTH SIDES NAMED SOMETHING AND NOTHING THAT SERVED THE TURN IS A NAME
     *  THE LAUNCH ASKED FOR — which is still NOT the same as wrong. `opus`
     *  against `claude-opus-5` lands here, and so does a genuine substitution by
     *  an endpoint. Telling those two apart needs the catalog that resolved the
     *  alias, and this file does not have it; `unproven` is the true statement
     *  it can make, and a person can then go and look. */
    | 'unproven';

/** One turn, with both halves of its identity and the facts that only exist
 *  because the two are held side by side. */
export interface TurnRuntime {
    n: number;
    identity: TurnRuntimeIdentity;
    /**
     * ‼️ THE ENGINE NAMED A PROVIDER THE LAUNCH DID NOT DECLARE. On Claude this
     * cannot fire — the transcript names no route — so a `true` here always
     * comes from an engine that publishes its provider, and it is a real
     * disagreement rather than a spelling one.
     */
    providerConflict: boolean;
    /**
     * ‼️ THE REPORTED HALF CHANGED FROM THE TURN BEFORE — which is a DIFFERENT
     * field from `identity.changedFromPrevious`, and the difference is the point.
     * That one watches what was ASKED FOR, and across a session with one
     * manifest it is false on every turn by construction. This one watches what
     * CAME BACK, which is the half that actually moves.
     */
    reportedChanged: boolean;
    agreement: ModelAgreement;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const list = (v: readonly string[] | undefined): string[] =>
    (v || []).map(str).filter(Boolean);

/**
 * ‼️ THE DECLARED HALF OF A RUN WITH NO MANIFEST IS `legacy-inherit`, NOT
 * `unknown`. Every session recorded before v11.183 is in this state, and the two
 * words mean opposite things: `unknown` says "asked, and there was no answer",
 * `legacy-inherit` says "nobody was asked" — which is true, and which is what
 * makes it backfillable from real evidence later (X-116) rather than a permanent
 * hole. Filling it in from the model name is the one move forbidden everywhere
 * in this family.
 */
function declaredOf(manifest: LaunchManifest | undefined, engine: string): ProviderIdentity {
    if (manifest) { return manifest.identity; }
    // ‼️ X-116 — AND IT IS `legacyIdentity`'s ANSWER, NOT A SECOND COPY OF IT.
    // This line spelled the shape out by hand (`unknownIdentity` with the
    // origin overwritten) while the function whose entire job is this case sat
    // in providerIdentity.ts with no caller at all. The two agree today, which
    // is exactly why it was invisible: X-116 is the SCHEMA UPGRADE item, so the
    // next field added to `ProviderIdentity` reaches the real answer and not
    // this one, and a run with no manifest would quietly start meaning
    // something different from what the product says it means.
    return legacyIdentity(str(engine) || 'claude');
}

/**
 * ‼️ EVERY NAME THE LAUNCH ASKED FOR, not just the one field somebody looks at
 * first. A Claude launch may name a TIER (`opus`) and the route resolves it to a
 * model; an OpenCode one names a qualified ref. The manifest keeps all of them
 * apart on purpose, so the agreement test asks all of them rather than picking
 * one and being wrong about the other two thirds of the launches.
 */
function requestedNames(manifest: LaunchManifest | undefined): string[] {
    if (!manifest) { return []; }
    const out = [
        str(manifest.requested.model),
        str(manifest.identity.requestedModelRef),
        str(manifest.requested.tier)
    ].filter(Boolean);
    return [...new Set(out)];
}

export function modelAgreement(
    requested: readonly string[], reported: readonly string[]
): ModelAgreement {
    const want = list(requested);
    const got = list(reported);
    if (!want.length) { return 'nothing-requested'; }
    if (!got.length) { return 'nothing-reported'; }
    // Case-insensitive, because a model id is a wire name and the two sides of
    // this comparison have travelled through different code. Nothing else is
    // normalised: trimming a suffix or splitting on a dash to make two names
    // "the same" is the guess this family refuses, wearing a helpful face.
    const lower = new Set(want.map(w => w.toLowerCase()));
    return got.some(g => lower.has(g.toLowerCase())) ? 'matched' : 'unproven';
}

/**
 * THE JOIN, ONE ROW PER TURN.
 *
 * `manifest` may be `undefined` and that is the common case for a while — every
 * session that ran before the manifest existed. The reported half is still read
 * and still recorded; what is missing is anything to compare it against, and the
 * row says so through `origin: 'legacy-inherit'` rather than by being absent.
 */
export function turnRuntimes(
    manifest: LaunchManifest | undefined,
    engine: string,
    turns: readonly TurnReport[]
): TurnRuntime[] {
    const declared = declaredOf(manifest, engine);
    const wanted = requestedNames(manifest);
    const out: TurnRuntime[] = [];
    let previousReported = '';
    let previousIdentity: TurnRuntimeIdentity | undefined;
    for (const t of turns || []) {
        const models = list(t.models);
        const providerIds = list(t.providerIds);
        const identity = turnIdentity(
            { ...declared, engine: declared.engine || str(engine) || 'claude' },
            { providerIds, models },
            previousIdentity
        );
        // ‼️ THE FINGERPRINT IS THE WHOLE REPORTED PAIR, ORDER INCLUDED. A turn
        // served by two models is a different answer from a turn served by the
        // same two the other way round, and comparing only the last one would
        // miss the change this field exists to notice.
        const fingerprint = JSON.stringify([providerIds, models]);
        out.push({
            n: t.n,
            identity,
            providerConflict: hasProviderConflict(identity),
            // Nothing to have changed from on the first turn — the same rule
            // `turnIdentity` follows for its own half, kept identical so the two
            // fields are read the same way.
            reportedChanged: !!previousIdentity && fingerprint !== previousReported,
            agreement: modelAgreement(wanted, models)
        });
        previousReported = fingerprint;
        previousIdentity = identity;
    }
    return out;
}

/** What a whole run looks like once its turns are joined — the shape a row or a
 *  notice can say in one line without re-deriving it. */
export interface RunDrift {
    turns: number;
    /** Every model reported across the run, first-seen order. */
    reportedModels: string[];
    /** Every provider the engine named. Empty on Claude for ever. */
    reportedProviderIds: string[];
    /**
     * ‼️ X-108 — MORE THAN ONE PROVIDER SERVED THIS RUN. A FACT, AND ON A
     * TURN-SCOPED ENGINE NOT A FAULT.
     *
     * OpenCode documents changing provider at a turn boundary
     * (`session/set_config_option`), so a run that names two is an ordinary
     * multi-provider timeline there and a thing to go and look at on an engine
     * whose scope is `session`. Which of the two it is, is `turnScope` below —
     * asked of the SCOPE and never of the engine's name, so a sixth engine needs
     * nothing added here.
     */
    multiProvider: boolean;
    /** The declared scope permits the provider to differ from one turn to the
     *  next. False on every legacy record, which is the safe answer. */
    turnScope: boolean;
    /** Turn numbers where the reported half changed. Empty on a steady run. */
    changedAt: number[];
    /** ‼️ A provider was named that the launch did not declare. A real
     *  disagreement, and on Claude an impossibility rather than a rarity. */
    providerConflict: boolean;
    /**
     * ‼️ THE RUN'S AGREEMENT IS ITS WEAKEST TURN, not its first and not its
     * commonest. One turn served by something nobody asked for is the fact worth
     * surfacing; averaging it away is how a single odd turn stays invisible for
     * a month.
     */
    agreement: ModelAgreement;
}

const AGREEMENT_RANK: Record<ModelAgreement, number> = {
    // Worst first: `unproven` is the one a person needs to look at, and
    // `matched` is the only one that is genuinely nothing to see.
    'unproven': 0, 'nothing-reported': 1, 'nothing-requested': 2, 'matched': 3
};

export function runDrift(runtimes: readonly TurnRuntime[]): RunDrift {
    const rows = runtimes || [];
    const models: string[] = [];
    const providers: string[] = [];
    const changedAt: number[] = [];
    let conflict = false;
    let worst: ModelAgreement | undefined;
    for (const r of rows) {
        for (const m of r.identity.reportedModels || []) { if (!models.includes(m)) { models.push(m); } }
        for (const p of r.identity.reportedProviderIds || []) {
            if (!providers.includes(p)) { providers.push(p); }
        }
        if (r.reportedChanged) { changedAt.push(r.n); }
        if (r.providerConflict) { conflict = true; }
        if (worst === undefined || AGREEMENT_RANK[r.agreement] < AGREEMENT_RANK[worst]) {
            worst = r.agreement;
        }
    }
    return {
        turns: rows.length,
        reportedModels: models,
        reportedProviderIds: providers,
        multiProvider: providers.length > 1,
        // Read off the run's own declared scope — the first row carries it, and
        // every row of one run shares one manifest. No rows means no claim.
        turnScope: scopeAllowsTurnChange(rows[0]?.identity.scope),
        changedAt,
        providerConflict: conflict,
        // A run with no turns has nothing to report — which is `nothing-reported`
        // and not `matched`: an empty session must never read as a verified one.
        agreement: worst ?? 'nothing-reported'
    };
}

/**
 * One line a person can read, for a row's tip or a notice.
 *
 * ‼️ IT SAYS NOTHING WHEN THERE IS NOTHING TO SAY. A run whose reported half
 * matches what was asked for, on one model, with no provider disagreement, is
 * the ordinary case; a line stating that on every row would be a column of
 * identical text that teaches the reader to stop looking at the column.
 */
export function describeDrift(d: RunDrift): string {
    const bits: string[] = [];
    if (d.providerConflict) {
        bits.push(`served by ${d.reportedProviderIds.join(', ')}, which the launch did not declare`);
    }
    // ‼️ X-108 — AND SAYING IT IS NOT THE SAME AS COMPLAINING ABOUT IT. On a
    // turn-scoped engine several providers inside one run is the feature
    // working; the line names the shape so a reader can see the timeline, and
    // withholds the alarm that belongs only to a session-scoped run.
    if (d.multiProvider) {
        bits.push(d.turnScope
            ? `${d.reportedProviderIds.length} providers across ${d.turns} turns — a turn-scoped run may change provider`
            : `${d.reportedProviderIds.length} providers inside one session-scoped run`);
    }
    if (d.reportedModels.length > 1) {
        bits.push(`${d.reportedModels.length} models across ${d.turns} turns`
            + (d.changedAt.length ? ` (changed at turn ${d.changedAt.join(', ')})` : ''));
    }
    if (d.agreement === 'unproven') {
        bits.push('the model that answered is not one of the names the launch asked for');
    }
    return bits.join(' · ');
}

/**
 * ‼️ X-108 — THE WHOLE IDENTITY OF A RUN, ON ONE OBJECT, FOR A SESSION ROW.
 *
 * `turnRuntimes` answers per turn, which is the right shape for a viewer and the
 * wrong one for a table: a row cannot carry fifty turns. This is the same join
 * summarised — both declared fields and both reported ones, with the proof.
 *
 * ‼️ AND IT ALWAYS ANSWERS. The previous shape returned NOTHING when there was
 * no manifest, so an old session and a foreign one were drawn identically to a
 * run whose route was recorded and fine: three different facts sharing one blank
 * space. `binding` below is the field that separates them, and it is the point
 * of the whole function — the values themselves stay empty, because filling them
 * in is the guess this family refuses.
 */
export interface RunIdentity {
    engine: string;
    /** '' whenever nothing declared one — never derived from the model name. */
    providerId: string;
    providerLabel: string;
    origin: ProviderIdentity['origin'];
    scope: ProviderIdentity['scope'];
    /** Only an Agent Farm route profile has these; '' / null otherwise. */
    providerProfileId: string;
    providerProfileRevision: number | null;
    requestedModelRef: string;
    reportedProviderIds: string[];
    reportedModels: string[];
    proof: ProviderIdentity['proof'];
    multiProvider: boolean;
    turnScope: boolean;
    agreement: ModelAgreement;
    /**
     * ‼️ WHY THE ROW HAS NOTHING TO SHOW — three answers, never one blank.
     *
     * · `declared` — a manifest describes this run; every field above is real.
     * · `legacy`   — OUR run, from before the manifest existed. Nobody was
     *                asked, so this is backfillable from evidence later (X-116).
     * · `external` — not our run at all: an imported or foreign-CLI transcript.
     *                There was never anything to record and never will be.
     * · `unknown`  — asked, and no answer. The rarest, and the only one that
     *                means somebody should go and look.
     */
    binding: 'declared' | 'legacy' | 'external' | 'unknown';
    /**
     * X-112 — WHO IS BILLED, AND WHAT THE FIGURES MEAN. Derived here, once,
     * from the declared route and the engine (`billingOf`), so every surface
     * that carries the identity carries the same answer to "is ⚖ on the plan
     * window" and "is $ a bill" — and none derives it from a model name.
     */
    billing: BillingIdentity;
}

/** Which kind of record, or which kind of absence, a run's identity rests on. */
function bindingOf(
    manifest: LaunchManifest | undefined, id: ProviderIdentity, opts?: { external?: boolean }
): RunIdentity['binding'] {
    return manifest ? 'declared'
        : opts?.external ? 'external'
            : id.origin === 'unknown' ? 'unknown' : 'legacy';
}

export function runIdentity(
    manifest: LaunchManifest | undefined,
    engine: string,
    turns: readonly TurnReport[],
    /** The transcript is not from a run Agent Farm started — an import, or a
     *  CLI whose sessions it merely reads. The caller knows; this file cannot. */
    opts?: { external?: boolean }
): RunIdentity {
    const rows = turnRuntimes(manifest, engine, turns);
    const drift = runDrift(rows);
    const id = declaredOf(manifest, str(engine) || 'claude');
    const binding = bindingOf(manifest, id, opts);
    return {
        engine: id.engine || str(engine) || 'claude',
        providerId: str(id.providerId),
        providerLabel: str(id.providerLabel),
        // ‼️ An EXTERNAL run's origin is `external` and says so, rather than
        // borrowing `legacy-inherit` — "nobody was asked" is a statement about
        // our own records and is simply untrue of somebody else's transcript.
        origin: binding === 'external' ? 'external' : id.origin,
        scope: id.scope,
        providerProfileId: str(id.providerProfileId),
        providerProfileRevision: id.providerProfileRevision ?? null,
        requestedModelRef: str(id.requestedModelRef),
        reportedProviderIds: drift.reportedProviderIds,
        reportedModels: drift.reportedModels,
        // The reported half stands on its own: an engine that named its provider
        // has PROVED one even when nothing was declared, and saying `unknown`
        // there would throw away the only evidence there is.
        proof: proofOf(str(id.providerId), drift.reportedProviderIds),
        multiProvider: drift.multiProvider,
        turnScope: drift.turnScope,
        agreement: drift.agreement,
        binding,
        billing: runBilling(manifest, engine, opts)
    };
}

/**
 * A session as the index holds it — structural, like `TurnReport`, so the
 * Turns page, the Sessions tables and the bridge can all ask the ONE question
 * below without any of them dragging the index type in.
 */
export interface IndexedRun {
    launchId?: string;
    source?: string;
    provenance?: string;
    turns?: readonly TurnReport[];
}

/**
 * ‼️ X-111 — THE IDENTITY OF A SESSION IN THE INDEX, asked once. The Sessions
 * table had the only copy of "which manifest, which engine, is it ours" and the
 * Turns page had none, so a Claude-via-Kimi turn could be listed on Sessions
 * under its route and on Turns under nothing. Every surface that lists a run
 * now asks here.
 *
 * ‼️ NOT OUR RUN: an import states its provenance, and a foreign CLI is named
 * by `source`. Either way Agent Farm never spawned it, so "nobody was asked"
 * would be a claim about records that were never ours.
 */
export function sessionIdentity(
    s: IndexedRun, manifests: readonly LaunchManifest[] | undefined,
    /** The caller's own word for the engine, when it knows better than the transcript. */
    engineOverride?: string
): RunIdentity {
    const m = manifests ? manifestOf(manifests, s) : undefined;
    const engine = engineOverride || s.source || 'claude';
    const reports = (s.turns ?? []).map(t => ({ n: t.n, models: t.models, providerIds: t.providerIds }));
    const external = s.provenance === 'imported' || (!!s.source && s.source !== 'claude' && !m);
    return runIdentity(m, engine, reports, { external });
}

/**
 * ‼️ X-112 — A RUN'S BILLING WITHOUT ITS TURNS, by the same binding rule
 * `runIdentity` uses — which is why `runIdentity` asks it rather than
 * restating it. A total over every session on the machine needs the billing of
 * each one and nothing else; folding every turn of every session to get it was
 * the cost that would have kept totals blind.
 */
export function runBilling(
    manifest: LaunchManifest | undefined,
    engine: string,
    opts?: { external?: boolean }
): BillingIdentity {
    const id = declaredOf(manifest, str(engine) || 'claude');
    const binding = bindingOf(manifest, id, opts);
    return billingOf({
        engine: id.engine || str(engine) || 'claude',
        providerId: str(id.providerId), providerLabel: str(id.providerLabel),
        origin: binding === 'external' ? 'external' : id.origin, binding,
        route: id.route
    });
}

/**
 * Every session's billing, for a total over many of them: the launch record
 * indexed ONCE (`manifestIndex`), and the same `external` test the session
 * identity reader applies — an import, or another engine's transcript this farm
 * did not start.
 */
export function billingReader(
    manifests: readonly LaunchManifest[]
): (s: { launchId?: string; source?: string; provenance?: string }) => BillingIdentity {
    const at = manifestIndex(manifests);
    return s => {
        const m = at(s);
        const engine = str(s.source) || 'claude';
        return runBilling(m, engine,
            { external: s.provenance === 'imported' || (engine !== 'claude' && !m) });
    };
}
