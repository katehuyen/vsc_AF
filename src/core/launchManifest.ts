/**
 * X-102 — THE IMMUTABLE LAUNCH MANIFEST: what was true at the spawn, written
 * down BEFORE the spawn, and never rewritten afterwards.
 *
 * ‼️ WHY A MANIFEST IS THE ITEM RATHER THAN A NICER LOG LINE. Measured against a
 * real transcript on this machine (Claude Code 2.1.251, 1373 records): the JSONL
 * carries `sessionId`, `cwd`, `version`, `gitBranch`, `userType`, `entrypoint`,
 * `permissionMode` and `promptSource` — and NOTHING about which route served it,
 * which profile revision was in force, which catalog the model came out of, or
 * what was actually requested as opposed to what came back. X-98 measured the
 * same absence from the other side. So for every one of those questions the
 * manifest is not the convenient witness, it is the ONLY witness, and a witness
 * that can be edited after the fact is not one.
 *
 * ‼️ AND THE launchId IS OURS, NOT THE ENGINE'S — the thing to understand before
 * touching the binding. It is tempting to read the acceptance line ("ten
 * concurrent launches must not match at random") as "put an id on the spawn and
 * the ambiguity goes away". It does not: nothing we can set is echoed back into
 * a Claude transcript. `entrypoint` comes closest — it is written from
 * `CLAUDE_CODE_ENTRYPOINT`, measured as `sdk-cli` — and it is exactly the
 * variable Agent Farm's own hooks are keyed to, so overloading it would buy a
 * marker by breaking the hook context (X-101). What actually removes ambiguity
 * is the ids the engines DO publish: Claude's via its hooks, OpenCode's
 * `sessionID` in `run --format json` and its `ses_…` in ACP. The launchId is the
 * handle those ids are fastened TO, and the manifest is what they are fastened
 * to it on. Where no id is ever published, `launchBinding.ts` refuses to guess —
 * and that refusal, not a lucky match, is the acceptance line's second half.
 *
 * ‼️ REDACTED BY CONSTRUCTION. A manifest is written to disk, read by agents
 * over the bridge, quoted into notices and carried into exports. Every field
 * below is either a name, an id, a revision or a kind; the credential half of a
 * runtime (`spawnEnv`) has no field here to sit in, and `manifestFor` is handed
 * the redacted `ProviderIdentity` rather than the runtime it came from — so the
 * boundary is a matter of what this type CAN hold, not of what a caller
 * remembers to strip.
 *
 * Pure — no vscode, no I/O, no clock of its own.
 */

import { LaunchOptions } from './launch';
import { ProviderIdentity } from './providerIdentity';

/** Where a person started this run from. `surface` answers "which window", and
 *  it is a different question from `mechanism` ("what set it going"). */
export type LaunchSurface = 'terminal' | 'external-terminal' | 'console' | 'headless';

/** What set the run going — the mechanism a person would name. Shares its
 *  vocabulary with `LaunchBinding.kind` on purpose: the two records describe the
 *  same spawn from two sides, and two spellings of `schedule` would be two. */
export type LaunchMechanism =
    'session' | 'task' | 'schedule' | 'trigger' | 'workflow' | 'mission';

/**
 * ‼️ WHAT WAS ASKED FOR, KEPT APART FROM WHAT CAME BACK.
 *
 * The identity carries `reportedModels`; this carries what the person or the
 * automation actually requested. Folding them together is the specific mistake
 * that makes a "which model ran" question unanswerable a month later: a run
 * requested at `opus` that an endpoint served with something else reads, after
 * the fold, as a run that requested the other thing.
 */
export interface RequestedRun {
    /** The `--model` value as it was given: an alias, an id, or a wire ref. */
    model?: string;
    /** Claude only — the tier picked, before the route resolved it to a model. */
    tier?: string;
    /** Only where the engine publishes one for that model (X-103). */
    variant?: string;
    effort?: string;
    permissionMode?: string;
}

/**
 * One spawn, as it was known at the moment it happened.
 *
 * ‼️ EVERY FIELD IS A FACT ABOUT THE LAUNCH, never a later opinion about it.
 * `sessionId` is deliberately absent: it is not known before the spawn on any
 * engine here, so it belongs to the BINDING (`launchBinding.ts`), which is the
 * record that is allowed to learn. Keeping a mutable field on an immutable
 * record is how "immutable" quietly stops being true.
 */
export interface LaunchManifest {
    /** ‼️ OURS, and unique per spawn — see the header on why no engine echoes it. */
    launchId: string;
    /** Written before the process started, so a manifest with no run is a run
     *  that failed to start — which is itself the answer to a question. */
    at: number;
    engine: string;
    /** The redacted provider answer this launch resolved to (X-101). */
    identity: ProviderIdentity;
    /**
     * ‼️ WHICH REVISION OF THE CATALOG the choice was made against. A model that
     * exists today and is retired next month makes an old manifest look like a
     * mistake; the revision is what says the choice was valid when it was made.
     * Absent means the catalog carried no revision, which is a different thing
     * from revision zero.
     */
    catalogRevision?: string;
    requested: RequestedRun;
    agentId: string;
    agentName: string;
    projectId?: string;
    mechanism: LaunchMechanism;
    /** The schedule's / mission's / task's own id, where a mechanism has one. */
    mechanismId?: string;
    /** ‼️ THE FOLDER THE PROCESS WAS ACTUALLY SPAWNED IN, not the agent's own
     *  folder — the same rule `LaunchBinding.cwd` follows, and for the same
     *  reason: the record is evidence, and evidence has to be what was true. */
    cwd: string;
    /**
     * ‼️ X-251 — THE SIGN-IN SLOT THE PROCESS ACTUALLY RAN UNDER; absent = none
     * was injected, so it ran as whatever this machine is signed in as.
     *
     * RESOLVED, which is why it sits here beside `cwd` and `identity` rather
     * than inside `requested`. An empty box on the composer does not mean "no
     * account": it means the standing choice answered, and the standing choice
     * is the one that PAID. Recording the request instead would answer a
     * question nobody asks of a finished run.
     *
     * ‼️ AND IT HAS TO BE RECORDED HERE BECAUSE NOTHING ELSE CAN SAY IT. A
     * Claude slot's `projects` folder is a junction onto one shared directory
     * (measured), so every account writes its transcripts into the same place
     * and the file itself cannot name its owner. The spawn is the only moment
     * the answer exists.
     */
    account?: string;
    surface: LaunchSurface;
    /** ‼️ K-34/X-133 — the discipline this run works to, resolved. Recorded
     *  because it changes what the agent DOES and nothing else records it. */
    superpowers?: boolean;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * ‼️ A LAUNCH ID THAT CANNOT COLLIDE WITH THE ONE BESIDE IT.
 *
 * The acceptance line is about TEN launches in one folder at one moment, so a
 * millisecond clock alone is exactly the wrong generator — ten spawns kicked off
 * by one loop share a millisecond routinely. The time half keeps ids sortable
 * and readable; the random half is what makes them distinct, and a counter is
 * added because two calls inside one millisecond with the same random draw is a
 * possibility that a manifest of all things should not have.
 *
 * `rnd` is injectable so a test can prove the shape rather than hope for it.
 */
let launchSeq = 0;
export function newLaunchId(now: number, rnd: () => number = Math.random): string {
    launchSeq = (launchSeq + 1) % 46656; // 3 base-36 digits
    const t = Math.max(0, Math.floor(now)).toString(36);
    const r = Math.floor(rnd() * 46656).toString(36).padStart(3, '0');
    const c = launchSeq.toString(36).padStart(3, '0');
    return `lch_${t}${c}${r}`;
}

/** Is this a launch id we wrote? A shape check, so a hand-edited record or a
 *  field from a future version fails visibly rather than silently matching. */
export function isLaunchId(v: unknown): boolean {
    return /^lch_[0-9a-z]{9,}$/.test(String(v ?? ''));
}

/**
 * What was requested, out of the launch options — the ASKED-FOR half.
 *
 * Empty fields are left OUT rather than written as '', for the reason the whole
 * family follows: an absent answer and a chosen empty string are different, and
 * a manifest is read years later by somebody who cannot ask which was meant.
 */
export function requestedOf(o: LaunchOptions): RequestedRun {
    return {
        ...(str(o.model) ? { model: str(o.model) } : {}),
        ...(str(o.tier) ? { tier: str(o.tier) } : {}),
        ...(str(o.variant) ? { variant: str(o.variant) } : {}),
        ...(str(o.effort) ? { effort: str(o.effort) } : {}),
        ...(str(o.permissionMode) ? { permissionMode: str(o.permissionMode) } : {})
    };
}

export interface ManifestInput {
    launchId: string;
    at: number;
    engine: string;
    identity: ProviderIdentity;
    catalogRevision?: string;
    options: LaunchOptions;
    agentId: string;
    agentName: string;
    projectId?: string;
    mechanism: LaunchMechanism;
    mechanismId?: string;
    cwd: string;
    /** X-251 — the RESOLVED slot the process ran under; '' = none injected. */
    account?: string;
    surface: LaunchSurface;
    superpowers?: boolean;
}

/**
 * THE MANIFEST, ASSEMBLED ONCE.
 *
 * ‼️ IT TAKES THE REDACTED IDENTITY, NOT THE RUNTIME. `ResolvedEngineRuntime`
 * has two halves and one of them is the credential material; a builder that took
 * the whole thing would put the private half one spread operator away from a
 * record that gets written to disk. The caller hands over `rt.identity` — which
 * X-101 built to be exactly the half that may be published — and there is
 * nothing here that could carry the other one even by accident.
 */
export function manifestFor(input: ManifestInput): LaunchManifest {
    return {
        launchId: input.launchId,
        at: input.at,
        engine: str(input.engine) || 'claude',
        identity: input.identity,
        ...(str(input.catalogRevision) ? { catalogRevision: str(input.catalogRevision) } : {}),
        requested: requestedOf(input.options),
        agentId: input.agentId,
        agentName: input.agentName,
        ...(str(input.projectId) ? { projectId: str(input.projectId) } : {}),
        mechanism: input.mechanism,
        ...(str(input.mechanismId) ? { mechanismId: str(input.mechanismId) } : {}),
        cwd: input.cwd,
        // X-251 — absent rather than empty: "nothing was injected" and "we do not
        // know" must not become the same reading years later.
        ...(str(input.account) ? { account: str(input.account) } : {}),
        surface: input.surface,
        ...(input.superpowers === undefined ? {} : { superpowers: input.superpowers })
    };
}

/**
 * ‼️ THE LEAK GUARD, AS A FUNCTION RATHER THAN AS A HABIT.
 *
 * Every path that writes a manifest anywhere a person or an agent can read it
 * runs this first. It is not a substitute for the type — the type is what makes
 * a leak require effort — but a record can also arrive from an older version, a
 * hand-edited file or a future field somebody added without reading this
 * comment, and those are precisely the cases a type cannot catch.
 *
 * The rule is by NAME, not by value: a credential's value is unknowable here
 * (that is the point of it), while the names it could arrive under are a short,
 * known list. Returns the offending paths, empty when the record is clean.
 */
const SECRET_NAMES = /(^|[._-])(key|token|secret|password|apikey|authorization|credential|bearer)s?([._-]|$)/i;
export function manifestLeaks(m: unknown, path = ''): string[] {
    const out: string[] = [];
    if (!m || typeof m !== 'object') { return out; }
    for (const [k, v] of Object.entries(m as Record<string, unknown>)) {
        const here = path ? `${path}.${k}` : k;
        // ‼️ `authKind` IS NOT A LEAK, and the exception is deliberate: it is the
        // KIND of sign-in (`api-key`, `oauth`, `subscription`), which is the
        // fact X-100 kept precisely so nobody has to look at the credential to
        // answer "how does this route authenticate". A blanket name rule would
        // flag it and teach the next person to weaken the rule.
        if (k !== 'authKind' && SECRET_NAMES.test(k)) { out.push(here); }
        if (v && typeof v === 'object') { out.push(...manifestLeaks(v, here)); }
    }
    return out;
}

/**
 * ‼️ X-102 — BOUNDED FROM THE FIRST LINE, not when somebody notices.
 *
 * A manifest is written on EVERY spawn, and this farm spawns on schedules, on
 * triggers, on workflow steps and on mission members. An unbounded list of them
 * is a file that grows for as long as the install lives — the exact class of
 * defect X-127 exists to sweep up, and the cheapest moment to not have it is
 * before the first one is written.
 *
 * ‼️ AND THE OLDEST GO, NOT THE NEWEST. A manifest matters most while its run is
 * still being asked about; a two-year-old one whose transcript was cleaned up
 * long ago answers nothing. Dropping from the front is also what makes the cap
 * honest under the acceptance line's ten-at-once case: ten spawns in one
 * millisecond must all survive their own turn, and they do — they are the
 * newest.
 */
export const MANIFEST_CAP = 2000;

export function rememberManifest(
    list: readonly LaunchManifest[], m: LaunchManifest, cap = MANIFEST_CAP
): LaunchManifest[] {
    // ‼️ A REPLACE, NOT A SECOND ROW, when the same launch is written twice. A
    // spawn that is retried through the same launchId is the same spawn being
    // described again; two rows under one id would make `manifestOf` answer
    // whichever the array order happened to put first.
    const out = (list || []).filter(x => x && x.launchId !== m.launchId);
    out.push(m);
    return out.length > cap ? out.slice(out.length - cap) : out;
}

/**
 * ‼️ X-102 — THE MANIFEST FOR A RUN SOMETHING ELSE ALREADY IDENTIFIED.
 *
 * The join between the two records, written once so no surface invents its own.
 * A binding answers "which run produced this transcript"; a manifest answers
 * "what was that run set up to be". The transcript answers neither, so the pair
 * is the whole historical record and the `launchId` is the only thing holding
 * them together.
 *
 * ‼️ `undefined` IS A REAL ANSWER AND THE COMMON ONE FOR A WHILE: every binding
 * written before this item carries no launchId, and a run whose manifest was
 * lost is a run whose setup is genuinely unknown. Returning a nearest-match or a
 * newest-manifest guess would be inventing exactly the certainty this family
 * exists to refuse — an unknown route stated as a known one is worse than a gap,
 * because a gap is visible.
 */
export function manifestOf(
    manifests: readonly LaunchManifest[], run: { launchId?: string } | undefined
): LaunchManifest | undefined {
    const id = str(run?.launchId);
    if (!id) { return undefined; }
    return (manifests || []).find(m => m && m.launchId === id);
}

/**
 * One line a person can read, for a notice or a row.
 *
 * ‼️ IT NAMES THE ROUTE AND THE REQUEST SEPARATELY, because that is the pair the
 * manifest exists to keep apart. A line that said only "opus" would be true of
 * two runs on two different endpoints costing two different amounts.
 */
export function describeManifest(m: LaunchManifest): string {
    const bits: string[] = [m.engine];
    if (m.identity.providerId) {
        bits.push(m.identity.providerLabel || m.identity.providerId);
    } else if (m.identity.origin === 'not-applicable') {
        // Nothing to say, and saying "no provider" on the four engines that have
        // no such axis would spend a column on a permanent state.
    } else {
        // ‼️ NOT "default". Nothing was injected and nothing was cleared, so the
        // run inherited whatever the window carried — which may already have
        // named an endpoint, and that is the fact worth recording.
        bits.push('inherited route');
    }
    if (m.requested.tier) { bits.push(`tier ${m.requested.tier}`); }
    bits.push(m.requested.model || 'default model');
    if (m.requested.variant) { bits.push(m.requested.variant); }
    if (m.requested.effort) { bits.push(m.requested.effort); }
    // ‼️ X-251 — AND WHOSE PLAN PAID, where a sign-in was injected. Silent
    // otherwise: "it ran as this machine" is the ordinary case, and a line that
    // said so every time is one the reader learns to skip. On a farm with five
    // accounts under one engine this is the fact the route does NOT imply.
    if (str(m.account)) { bits.push(`account ${str(m.account)}`); }
    bits.push(m.surface);
    return bits.join(' · ');
}
