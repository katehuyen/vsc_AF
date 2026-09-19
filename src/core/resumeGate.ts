/**
 * X-109 — THE ONE GATE A RESUME GOES THROUGH BEFORE IT SPAWNS.
 *
 * X-101 gave every adapter a `resumePolicy` and X-105 wrote the switch policy
 * for a LIVE card; neither was asked at the moment that matters most — a
 * session being taken up again. Every resume door (the Console, a terminal,
 * the bridge, a task continuing a conversation) resolved its route the way a
 * FRESH launch does: what the caller named, else the agent's STANDING route.
 * A session that ran on one route was therefore resumed on whatever the
 * agent stood on that day, and the transcript — which carries no route on any
 * engine (measured) — could not say which turns ran where. That is the August
 * corruption X-105 refuses on a live card, arriving through the other door.
 *
 * The rule here, in the item's own words: the route a session ran on is read
 * off its LAUNCH MANIFEST and RE-RESOLVED now (the profile at its current
 * revision, the secret from the store — nothing is copied out of the record);
 * a resume that names nothing is PINNED to that; one that names a different
 * route is answered by the ADAPTER (`resumePolicy`), so on Claude it is refused
 * with fork/new and on OpenCode it lands as a NEW run identity beside the old
 * one. A session with no manifest has nothing to pin and says so — `binding`
 * is the first field to read, exactly as on `runIdentity` (X-108): the rest of
 * the answer is a record or an absence, and which kind of absence.
 *
 * ‼️ NEITHER ANSWER IS SPELLED WITH AN ENGINE'S NAME — `adapter.resumePolicy`
 * and the adapter's own catalog decide, so a sixth engine gets the right
 * answer by declaring itself.
 *
 * ‼️ AND A REFUSAL IS RETURNED, NEVER SWALLOWED. Every path out of here says
 * which of five things happened; a door that gets `refuse` starts nothing.
 *
 * Pure — no vscode, no I/O, no secrets.
 */

import { launchProviderForm, ProviderTransport } from './launchProvider';
import { ProviderAdapter } from './providerAdapter';
import { ProviderIdentity, qualifiedRef, splitQualifiedRef } from './providerIdentity';

/** How the resumed session's route is known — the same four words as
 *  `RunIdentity.binding`, because it is the same fact. */
export type ResumeBinding = 'declared' | 'legacy' | 'external' | 'unknown';

export type ResumeAct =
    /** Resumed on the route it ran on — the manifest's, re-resolved now; the
     *  agent's standing route was not consulted. An empty `providerId` here is
     *  a real answer: it ran with none and is resumed with none. */
    | 'pinned'
    /** Resumed on a DIFFERENT route the engine allows — recorded as a new run
     *  identity beside the earlier turns' one, never rewriting them. */
    | 'switch'
    /** Nothing was recorded for this session, so nothing is pinned: what was
     *  asked (else the agent's standing route) applies, and `why` says so. */
    | 'unbound'
    /** This engine has no provider axis; there is nothing to gate. */
    | 'none'
    /** Not resumed. `remedy` says what does work. */
    | 'refuse';

export interface ResumeAsk {
    /** Claude: a route profile id. OpenCode: the engine's provider id. */
    providerId?: string;
    tier?: string;
    /** The model asked for — on an engine that qualifies models it may CARRY
     *  the provider (`opencode/big-pickle`), and a bare id is resolved against
     *  the engine's own list here rather than guessed at. */
    model?: string;
}

/** What the session ran on, as far as the record says. */
export interface ResumePrior {
    /** `manifest.identity` — absent when there is no manifest. */
    identity?: ProviderIdentity;
    /** `manifest.requested.tier` — the tier the run was launched with. */
    tier?: string;
    /** What the engine itself reported across the run (X-108), oldest first.
     *  On an engine whose manifest names no provider this is the only record
     *  of one. */
    reportedProviderIds?: readonly string[];
}

export interface ResumeRoute {
    act: ResumeAct;
    binding: ResumeBinding;
    /** The route the resume spawns on. Empty = no route, and on `pinned` that
     *  is an instruction, not an absence — see `pinned`. */
    providerId: string;
    tier: string;
    /**
     * ‼️ TRUE MEANS THE SPAWN TAKES `providerId`/`tier` AS THEY ARE, an empty
     * providerId included, and never falls through to the agent's standing
     * route. Every resolver before this item read an empty id as "ask the
     * agent's record", which is exactly the fall-through that moved resumed
     * sessions onto a route they never ran on.
     */
    pinned: boolean;
    /** The model to send, when this gate resolved it (a bare id qualified
     *  against the engine's list). Absent = send what was asked. */
    model?: string;
    previous: { providerId: string; profileId: string; revision: number | null };
    /** Only on a Claude-shaped resume of a stored profile: the revision it ran
     *  at against the one it is re-resolved at now. */
    revision?: { recorded: number | null; current: number | null; moved: boolean };
    why: string;
    remedy?: 'fork' | 'new';
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * ‼️ A BARE MODEL ID IS RESOLVED AGAINST THE ENGINE'S OWN LIST, OR REFUSED.
 *
 * On an engine that qualifies models the wire form is `provider/model`, and
 * the same bare `model` can exist under several providers (measured: the
 * OpenCode catalog lists one id under two). Splitting on the slash and hoping
 * is the guess `providerRegistry.ts` already carries a scar from; taking the
 * first provider that serves it would be this gate inventing a selection
 * nobody made. So: one match qualifies it, several are named back as
 * `ambiguous`, none leaves the ref alone (an alias the engine may know is not
 * this module's to reject).
 */
export function qualifyModelRef(
    adapter: ProviderAdapter, model: string | undefined
): { model: string; providerId: string; ambiguous?: string[] } {
    const ref = str(model);
    if (!ref || adapter.axis !== 'provider') { return { model: ref, providerId: '' }; }
    const providers = adapter.catalog().providers || [];
    const known = providers.map(p => str(p.providerId)).filter(Boolean);
    const split = splitQualifiedRef(ref, known);
    if (split.providerId) { return { model: ref, providerId: split.providerId }; }
    const serving = providers
        .filter(p => (p.models || []).includes(qualifiedRef(p.providerId, ref)))
        .map(p => str(p.providerId)).filter(Boolean);
    if (serving.length === 1) { return { model: qualifiedRef(serving[0], ref), providerId: serving[0] }; }
    if (serving.length > 1) { return { model: ref, providerId: '', ambiguous: serving }; }
    return { model: ref, providerId: '' };
}

function describeBinding(binding: ResumeBinding): string {
    switch (binding) {
        case 'legacy': return 'this session was started before launches were recorded, so which route it ran on is not known';
        case 'external': return 'this session was not started by Agent Farm, so which route it ran on is not known';
        case 'unknown': return 'this session is not in the index, so which route it ran on is not known';
        case 'declared': return 'this session has a launch record';
        // ‼️ AND ANYTHING ELSE IS NOT A LAUNCH RECORD. A `default` that claimed
        // one described every unrecognised value as bound while the decision
        // below — which tests `=== 'declared'` — treated it as unbound: a
        // verdict whose words and whose behaviour said opposite things, which
        // is worse than either answer alone. (Measured while writing X-117: a
        // caller passing 'launch' was told it had a record and resumed as
        // though it had none.)
        default: return 'which route this session ran on is not known';
    }
}

/**
 * The verdict for one resume: which route it spawns on, or why it does not.
 *
 * `standing` is the agent's stored route — what a fresh launch would land on
 * — passed in rather than read here so the module stays pure. It is consulted
 * ONLY when there is nothing recorded to pin and nothing asked.
 */
export function resumeRoute(
    adapter: ProviderAdapter,
    binding: ResumeBinding,
    prior: ResumePrior,
    asked: ResumeAsk,
    standing: { providerId?: string; tier?: string },
    transport: ProviderTransport = 'acp',
    opts: { profileRevision?: (profileId: string) => number | undefined } = {}
): ResumeRoute {
    const id = prior.identity;
    const reported = (prior.reportedProviderIds || []).map(str).filter(Boolean);
    const lastReported = reported.length ? reported[reported.length - 1] : '';
    const prevProfile = str(id?.providerProfileId);
    // ‼️ THE SELECTION ID IT RAN ON, in the vocabulary a door speaks: on Claude
    // the profile (`kimi-work`), whose vendor half (`kimi`) is a different
    // field; on OpenCode the provider id, which the manifest states when the
    // launch named one and the turns report when it did not.
    const prevSel = prevProfile || str(id?.providerId) || lastReported;
    const previous = {
        providerId: str(id?.providerId) || lastReported,
        profileId: prevProfile,
        revision: typeof id?.providerProfileRevision === 'number' ? id.providerProfileRevision : null
    };
    const base = { binding, previous, providerId: '', tier: '', pinned: false };

    if (adapter.axis !== 'provider') {
        return str(asked.providerId)
            ? { ...base, act: 'refuse', why: `${adapter.engine} has no provider axis — there is nothing to resume it on.` }
            : { ...base, act: 'none', why: `${adapter.engine} has no provider axis.` };
    }

    const form = launchProviderForm(adapter, {}, transport);
    const known = form.providers.map(c => str(c.id)).filter(Boolean);
    const noun = form.noun.toLowerCase() || 'provider';
    const offered = known.length ? `one of: ${known.join(', ')}` : (form.empty || 'nothing is on offer');

    const q = qualifyModelRef(adapter, asked.model);
    if (q.ambiguous) {
        return {
            ...base, act: 'refuse',
            why: `"${q.model}" is a bare model id that ${q.ambiguous.length} ${noun}s serve on ${adapter.engine} `
                + `(${q.ambiguous.join(', ')}) — name it qualified, e.g. ${q.ambiguous[0]}/${q.model}, so the resume does not guess.`
        };
    }
    const askedId = str(asked.providerId) || q.providerId;
    if (str(asked.providerId) && q.providerId && q.providerId !== str(asked.providerId)) {
        return {
            ...base, act: 'refuse',
            why: `"${q.model}" names the "${q.providerId}" ${noun} and the ${noun} asked for is "${asked.providerId}" — `
                + 'they do not agree, and the resume will not pick one.'
        };
    }
    const model = q.model && q.model !== str(asked.model) ? q.model : undefined;
    if (askedId && !known.includes(askedId)) {
        return {
            ...base, act: 'refuse',
            why: `"${askedId}" is not a ${noun} ${adapter.engine} can be pointed at here — ${offered}.`
        };
    }

    if (binding !== 'declared') {
        const route = askedId
            ? { providerId: askedId, tier: str(asked.tier) }
            : { providerId: str(standing.providerId), tier: str(standing.tier) };
        return {
            ...base, ...route, act: 'unbound', pinned: !!askedId, ...(model ? { model } : {}),
            why: `${describeBinding(binding)} — resuming ${route.providerId ? `on the "${route.providerId}" ${noun}` : `with no ${noun}`}`
                + `${askedId ? ' as asked' : ` (the agent's standing choice)`}; that is a statement about this run, not about the turns before it.`
        };
    }

    const revisionOf = (): ResumeRoute['revision'] | undefined => {
        if (!prevProfile) { return undefined; }
        const current = opts.profileRevision?.(prevProfile);
        const cur = typeof current === 'number' ? current : null;
        return { recorded: previous.revision, current: cur, moved: cur !== null && previous.revision !== null && cur !== previous.revision };
    };
    const revised = (rev: ResumeRoute['revision'] | undefined): string =>
        rev?.moved ? ` — re-resolved at revision ${rev.current} (it ran at ${rev.recorded}), and the resume's own record carries the new one` : '';

    if (!askedId) {
        if (!prevSel) {
            return {
                ...base, act: 'pinned', pinned: true, ...(model ? { model } : {}),
                why: `this session ran with no ${noun} and is resumed the same way — the agent's standing ${noun} is not consulted, `
                    + 'because introducing one part way through would be a different program.'
            };
        }
        if (!known.includes(prevSel)) {
            return {
                ...base, act: 'refuse', remedy: 'fork',
                why: `this session ran on the "${prevSel}" ${noun}, which ${adapter.engine} can no longer be pointed at here (${offered}) — `
                    + 'fork it onto one that is set up, or start a new session; the transcript stays readable either way.'
            };
        }
        const rev = revisionOf();
        return {
            ...base, act: 'pinned', providerId: prevSel, tier: str(asked.tier) || str(prior.tier), pinned: true,
            ...(model ? { model } : {}), ...(rev ? { revision: rev } : {}),
            why: `resumed on the "${prevSel}" ${noun} it ran on${revised(rev)}; the agent's standing ${noun} is not consulted.`
        };
    }

    const verdict = adapter.resumePolicy(id, {
        engine: adapter.engine, providerId: askedId,
        ...(str(asked.tier) ? { tier: str(asked.tier) } : {}),
        ...(q.model ? { modelId: q.model } : {})
    });
    if (verdict.act === 'refuse') {
        return { ...base, act: 'refuse', remedy: 'new', why: verdict.why || `${adapter.engine} refuses to resume this session on the "${askedId}" ${noun}.` };
    }
    if (verdict.act === 'fork') {
        return {
            ...base, act: 'refuse', remedy: 'fork',
            why: (verdict.why || `this session ran on the "${prevSel || 'no'}" ${noun}; a different one is a different program.`)
                + ' Fork it onto the new one, or start a new session; nothing was resumed.'
        };
    }
    const same = askedId === prevSel;
    const rev = same ? revisionOf() : undefined;
    return {
        ...base, act: same ? 'pinned' : 'switch', providerId: askedId,
        tier: str(asked.tier) || (same ? str(prior.tier) : ''), pinned: true,
        ...(model ? { model } : {}), ...(rev ? { revision: rev } : {}),
        why: same
            ? `resumed on the "${askedId}" ${noun} it ran on, as asked${revised(rev)}.`
            : `the ${noun} becomes "${askedId}" from this resume (it ran on ${prevSel ? `"${prevSel}"` : 'none'}) — `
                + `${adapter.engine} allows the change, and it is recorded as a new run identity rather than rewriting what the earlier turns ran on.`
    };
}

/** One line for any door's message: the same words whichever door prints them. */
export function describeResumeRoute(r: ResumeRoute): string {
    return r.act === 'refuse' ? `not resumed — ${r.why}` : r.why;
}
