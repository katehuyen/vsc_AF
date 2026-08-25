/**
 * ‼️ A-17 — WHAT ORCHESTRATION HAS LEARNED, AND NOTHING ELSE.
 *
 * A finished run knows something a run about to start does not: which SHAPE of
 * approach was taken, and what came of it. This module keeps that and only
 * that.
 *
 * ‼️ THIS IS NOT A SECOND MEMORY. Not one prompt, not one artefact, not one
 * message body, not one agent's words are copied here. What is kept is
 * OBSERVATION: the sequence of primitives the lead used, the features of that
 * approach (did it branch, did it replan, did it review, did it hold a
 * council), the verdict, how many required criteria were actually met, the
 * counts, the duration and the money. Everything else already lives in the run
 * record, the journal and the transcripts, each of which is the source of truth
 * for its own subject and none of which is duplicated here.
 *
 * ‼️ AND COST DECIDES NOTHING. `costUSD` and `tokens` are recorded because
 * "what happened" includes what it cost. Nothing in this module, and nothing
 * that reads it, may route on them: no cheap-first, no model escalation or
 * de-escalation, no budget reserve, no expected-value stop. That is a separate
 * feature (a Cost/Value Controller) that was deliberately left out of this
 * phase, and the moment a price starts choosing a model this file has become
 * something the user did not ask for. The one honest use is a person reading
 * "this shape of run costs about this much".
 *
 * ‼️ NO MODEL LEARNS ANYTHING. There is no training, no embedding, no
 * similarity search. A persistent list of finished runs and deterministic
 * arithmetic over it — that is the whole mechanism, and it is enough, because
 * the question ("has this approach worked here before, often enough to mean
 * anything?") is a counting question.
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * ‼️ THE SIGNATURE'S OWN VERSION, and it is not the store's.
 *
 * A signature is a claim about how two runs are the SAME. Change how it is
 * computed and every stored signature becomes a string that no longer means
 * what it says — so old outcomes must not be silently pooled with new ones.
 * The version travels ON each outcome: an aggregate groups by (version,
 * signature), which makes a change of rule visible as two groups rather than
 * as one wrong average.
 */
export const STRATEGY_SIGNATURE_V = 1;

/** Bumped when a stored outcome's SHAPE changes. A file from the future is not
 *  read, exactly as the mission journal refuses one (X-64). */
export const OUTCOME_SCHEMA = 1;

/**
 * ‼️ HOW MANY RUNS BEFORE A PATTERN IS A PATTERN.
 *
 * One run proves nothing and two prove very little, and the failure this
 * guards against is specific: a lead told "this approach succeeded here" on the
 * evidence of a single run will take that as settled and stop looking. Below
 * this, an aggregate is still REPORTED — hiding it would be its own kind of
 * lie — but it is marked `enough: false`, it is never briefed to a lead, and
 * any comparison drawn across it says "insufficient sample" instead of a
 * number.
 */
export const MIN_SAMPLE = 3;

export type OutcomeMode = 'classic' | 'adaptive';
export type OutcomeVerdict = 'success' | 'partial' | 'failed' | 'cancelled';

/**
 * The features of an approach, as flags. Deliberately a closed set: a feature
 * is something a reader can ask "did it do that?" about, and an open bag of
 * strings would drift into being a second description of the run.
 */
export const STRATEGY_FEATURES = [
    /** work was started in parallel rather than one wave at a time */
    'branching',
    /** the approach MOVED — strategy version went past 1 */
    'replan',
    /** existing work was sent back to be changed rather than redone */
    'revision',
    /** a second agent judged the work, not the lead itself */
    'review',
    /** real agent-to-agent messages were exchanged */
    'conversation',
    /** a chaired debate was held */
    'council',
    /** an existing workflow chain was run */
    'workflow',
    /** a nested objective was opened */
    'nested',
    /** a person was asked, answered, or steered it */
    'human'
] as const;
export type StrategyFeature = typeof STRATEGY_FEATURES[number];

export interface MissionOutcome {
    /** ‼️ THE KEY, and the whole rerun-double-count guard. A rerun is a NEW run
     *  with its own id and is a second attempt, so it counts separately and
     *  honestly; recording the SAME run twice replaces rather than appends. */
    runId: string;
    /** which spec these attempts share — how a reader sees that three outcomes
     *  are three goes at one objective rather than three objectives. */
    specId: string;
    mode: OutcomeMode;
    /** ‼️ THE SCOPE FENCE. An outcome is only ever compared with, aggregated
     *  with or briefed from outcomes of the SAME project. `null` is its own
     *  scope — "no project" is not a wildcard that matches every project. */
    projectId: string | null;
    verdict: OutcomeVerdict;
    stopReason: string | null;
    /** `s<version>|<sequence>|<features>` — see `strategySignature`. */
    signature: string;
    signatureV: number;
    features: StrategyFeature[];
    criteria: {
        total: number;
        required: number;
        /** required criteria a CURRENT evaluation put at `pass` */
        requiredMet: number;
        /** every criterion at `pass`, required or not */
        met: number;
    };
    counts: {
        rounds: number;
        tasks: number;
        strategyChanges: number;
        evaluations: number;
        conversations: number;
        councils: number;
        messages: number;
        /** questions answered plus steers delivered — a person in the loop */
        userInterventions: number;
    };
    durationMs: number;
    /** ‼️ OBSERVATION ONLY. Nothing routes on these — see the file header. */
    costUSD: number;
    tokens: number;
    /** when the run ended */
    at: number;
}

/** The shape a run has to present to be recorded. Structural, so this module
 *  never imports the mission engine and the engine never imports this. */
export interface OutcomeSource {
    runId: string;
    specId: string;
    mode: OutcomeMode;
    projectId?: string | null;
    verdict: OutcomeVerdict;
    stopReason?: string | null;
    /** the ordered actions the planner actually took, one per round */
    actions: readonly string[];
    /** highest strategy version reached — 1 (or absent) means it never moved */
    strategyVersion?: number;
    criteria: readonly { id: string; required?: boolean }[];
    /** criterion id → its CURRENT verdict, as the run's own gate reads them */
    verdicts: Readonly<Record<string, string | undefined>>;
    counts: {
        rounds: number; tasks: number; evaluations: number;
        conversations: number; councils: number; messages: number;
        questionsAnswered: number; guidanceDelivered: number;
        /** evaluations whose evaluator was an agent rather than the lead */
        independentReviews: number;
    };
    startedAt: number;
    endedAt: number;
    costUSD: number;
    tokens: number;
}

/**
 * ‼️ THE SIGNATURE — WHAT MAKES TWO RUNS "THE SAME APPROACH".
 *
 * Two decisions, and both are what stop this from being a run id with extra
 * steps:
 *
 *  1. CONSECUTIVE REPEATS COLLAPSE. `delegate, delegate, delegate, evaluate` and
 *     `delegate, evaluate` are the same SHAPE of approach at two sizes; how big
 *     it was is `counts`, which is a different question and is kept separately.
 *     Without this every run would have its own signature and no two would ever
 *     aggregate — the feature would look like it worked and would answer
 *     nothing.
 *  2. THE TERMINAL IS PART OF IT. `finish` and `abort` are how the approach
 *     ENDED and a run that aborted did not take the same approach as one that
 *     finished, whatever came before.
 *
 * Unknown action names are kept as they are rather than dropped: a primitive
 * added later must show up as a new signature, not silently fold into an old
 * one. And the whole thing is deterministic — same input, same string, on any
 * machine, for ever — which is what makes it a key.
 */
export function strategySignature(
    actions: readonly string[],
    features: readonly StrategyFeature[]
): string {
    const seq: string[] = [];
    for (const raw of actions) {
        const a = String(raw ?? '').trim();
        if (!a) { continue; }
        if (seq[seq.length - 1] !== a) { seq.push(a); }
    }
    // Sorted and deduplicated: a feature SET has no order, and two runs that
    // discovered the same features in a different order are the same approach.
    const flags = [...new Set(features)]
        .filter(f => (STRATEGY_FEATURES as readonly string[]).includes(f))
        .sort();
    return `s${STRATEGY_SIGNATURE_V}|${seq.join('>')}|${flags.join(',')}`;
}

/** Which features a run's own record shows. Derived, never stated by a planner:
 *  a lead cannot claim it held a council it did not hold. */
export function strategyFeatures(src: OutcomeSource): StrategyFeature[] {
    const acted = new Set(src.actions.map(a => String(a ?? '').trim()));
    const out: StrategyFeature[] = [];
    if (acted.has('parallel')) { out.push('branching'); }
    if ((src.strategyVersion ?? 1) > 1 || acted.has('replan')) { out.push('replan'); }
    if (acted.has('revise')) { out.push('revision'); }
    if (src.counts.independentReviews > 0 || acted.has('review')) { out.push('review'); }
    if (src.counts.messages > 0) { out.push('conversation'); }
    if (src.counts.councils > 0) { out.push('council'); }
    if (acted.has('run_workflow')) { out.push('workflow'); }
    if (acted.has('run_mission')) { out.push('nested'); }
    if (src.counts.questionsAnswered + src.counts.guidanceDelivered > 0) { out.push('human'); }
    return out;
}

/** One finished run, normalised. Pure: same run in, same outcome out. */
export function toOutcome(src: OutcomeSource): MissionOutcome {
    const features = strategyFeatures(src);
    const required = src.criteria.filter(c => c.required !== false);
    const met = (list: readonly { id: string }[]) =>
        list.filter(c => src.verdicts[c.id] === 'pass').length;
    return {
        runId: src.runId,
        specId: src.specId,
        mode: src.mode,
        // ‼️ '' and undefined are the SAME scope — "no project" — and neither is
        // a wildcard. Normalised here so two spellings of it cannot become two
        // scopes in the aggregate.
        projectId: src.projectId ? String(src.projectId) : null,
        verdict: src.verdict,
        stopReason: src.stopReason ?? null,
        signature: strategySignature(src.actions, features),
        signatureV: STRATEGY_SIGNATURE_V,
        features,
        criteria: {
            total: src.criteria.length,
            required: required.length,
            requiredMet: met(required),
            met: met(src.criteria)
        },
        counts: {
            rounds: src.counts.rounds,
            tasks: src.counts.tasks,
            strategyChanges: Math.max(0, (src.strategyVersion ?? 1) - 1),
            evaluations: src.counts.evaluations,
            conversations: src.counts.conversations,
            councils: src.counts.councils,
            messages: src.counts.messages,
            userInterventions: src.counts.questionsAnswered + src.counts.guidanceDelivered
        },
        // A clock that went backwards (or an unfinished run recorded by
        // mistake) is 0, never a negative duration in an average.
        durationMs: Math.max(0, src.endedAt - src.startedAt),
        costUSD: src.costUSD,
        tokens: src.tokens,
        at: src.endedAt
    };
}

export interface OutcomeGroup {
    signature: string;
    signatureV: number;
    mode: OutcomeMode;
    features: StrategyFeature[];
    runs: number;
    /** ‼️ FALSE means every figure below is real arithmetic over too few runs.
     *  It is still shown — hiding it would be its own lie — but nothing may
     *  conclude anything from it, and no lead is briefed from it. */
    enough: boolean;
    success: number;
    partial: number;
    failed: number;
    cancelled: number;
    /** share of REQUIRED criteria met across the group, 0..1; null when the
     *  group's runs had no criteria at all (every classic run). */
    requiredSatisfaction: number | null;
    avgRounds: number;
    avgTasks: number;
    avgStrategyChanges: number;
    avgUserInterventions: number;
    /** how many of the group's runs used each feature */
    featureUse: Record<string, number>;
    avgDurationMs: number;
    /** ‼️ OBSERVATION. Present so a person can read it; nothing routes on it. */
    avgCostUSD: number;
    avgTokens: number;
    lastAt: number;
}

export interface OutcomeCompare {
    classic: { runs: number; success: number; enough: boolean };
    adaptive: { runs: number; success: number; enough: boolean };
    /**
     * ‼️ THE COMPARISON IS ONLY DRAWN WHEN BOTH SIDES HAVE A DENOMINATOR.
     * `null` here is not "they are equal" and not "we do not know how to" — it
     * is "there is not enough of one of them to say", and `note` says which.
     * A success-rate difference computed from one classic run against forty
     * adaptive ones is a number that will be quoted and is worth nothing.
     */
    successRate: { classic: number; adaptive: number } | null;
    note: string;
}

export interface OutcomeReport {
    scope: { projectId: string | null; project?: string };
    total: number;
    groups: OutcomeGroup[];
    compare: OutcomeCompare;
    /** the signature versions present — more than one means a rule changed and
     *  the groups are not comparable across them. */
    signatureVersions: number[];
    minSample: number;
}

const avg = (list: readonly number[]): number =>
    list.length ? Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 1000) / 1000 : 0;

/**
 * ‼️ DERIVED ON EVERY READ, NEVER CACHED.
 *
 * An aggregate that is stored is an aggregate that can disagree with the
 * outcomes it came from — and A-17's acceptance is explicitly that changing an
 * outcome refreshes the figures. Deterministic arithmetic over a list that is
 * measured in kilobytes is cheap; a cache here would buy nothing and would owe
 * an invalidation rule to every future writer.
 */
export function aggregateOutcomes(
    all: readonly MissionOutcome[],
    opts: { projectId?: string | null; minSample?: number } = {}
): OutcomeReport {
    const minSample = opts.minSample ?? MIN_SAMPLE;
    // ‼️ THE SCOPE FENCE, applied first and once. `undefined` means "every
    // scope", which only a person looking at the whole farm may ask for; a
    // lead's briefing always passes its own project, and `null` is that
    // project's own scope rather than a wildcard.
    const scoped = opts.projectId === undefined
        ? all.slice()
        : all.filter(o => o.projectId === (opts.projectId ?? null));

    const byKey = new Map<string, MissionOutcome[]>();
    for (const o of scoped) {
        const key = `${o.signatureV}::${o.mode}::${o.signature}`;
        const list = byKey.get(key);
        if (list) { list.push(o); } else { byKey.set(key, [o]); }
    }

    const groups: OutcomeGroup[] = [...byKey.values()].map(list => {
        const withCriteria = list.filter(o => o.criteria.required > 0);
        const featureUse: Record<string, number> = {};
        for (const o of list) {
            for (const f of o.features) { featureUse[f] = (featureUse[f] ?? 0) + 1; }
        }
        const head = list[0];
        return {
            signature: head.signature,
            signatureV: head.signatureV,
            mode: head.mode,
            features: head.features,
            runs: list.length,
            enough: list.length >= minSample,
            success: list.filter(o => o.verdict === 'success').length,
            partial: list.filter(o => o.verdict === 'partial').length,
            failed: list.filter(o => o.verdict === 'failed').length,
            cancelled: list.filter(o => o.verdict === 'cancelled').length,
            requiredSatisfaction: withCriteria.length
                ? avg(withCriteria.map(o => o.criteria.requiredMet / o.criteria.required))
                : null,
            avgRounds: avg(list.map(o => o.counts.rounds)),
            avgTasks: avg(list.map(o => o.counts.tasks)),
            avgStrategyChanges: avg(list.map(o => o.counts.strategyChanges)),
            avgUserInterventions: avg(list.map(o => o.counts.userInterventions)),
            featureUse,
            avgDurationMs: Math.round(avg(list.map(o => o.durationMs))),
            avgCostUSD: avg(list.map(o => o.costUSD)),
            avgTokens: Math.round(avg(list.map(o => o.tokens))),
            lastAt: Math.max(...list.map(o => o.at))
        };
    }).sort((a, b) => b.runs - a.runs || b.lastAt - a.lastAt);

    const side = (mode: OutcomeMode) => {
        const list = scoped.filter(o => o.mode === mode);
        return {
            runs: list.length,
            success: list.filter(o => o.verdict === 'success').length,
            enough: list.length >= minSample
        };
    };
    const classic = side('classic');
    const adaptive = side('adaptive');
    const both = classic.enough && adaptive.enough;
    const compare: OutcomeCompare = {
        classic, adaptive,
        successRate: both
            ? {
                classic: Math.round((classic.success / classic.runs) * 1000) / 1000,
                adaptive: Math.round((adaptive.success / adaptive.runs) * 1000) / 1000
            }
            : null,
        note: both
            ? `${classic.runs} classic and ${adaptive.runs} adaptive runs in this scope.`
            : `Insufficient sample — ${classic.runs} classic and ${adaptive.runs} adaptive `
                + `run(s) in this scope; ${minSample} of each are needed before the two are `
                + 'compared. Nothing is being claimed about which works better.'
    };

    return {
        scope: { projectId: opts.projectId === undefined ? null : (opts.projectId ?? null) },
        total: scoped.length,
        groups,
        compare,
        signatureVersions: [...new Set(scoped.map(o => o.signatureV))].sort((a, b) => a - b),
        minSample
    };
}

/**
 * ‼️ WHAT A LEAD IS ALLOWED TO BE TOLD — and it is far less than what is stored.
 *
 * Three fences, and each one exists because breaking it produces a specific
 * lie:
 *
 *  1. SAME SCOPE ONLY. Never another project's outcomes. Objective wording,
 *     agent names and criteria are that project's business, and even a
 *     signature can be a fact about work somebody else's brief describes.
 *  2. ENOUGH SAMPLES ONLY. A group under `minSample` says nothing at all. A
 *     lead handed "this approach succeeded" on one run will treat it as
 *     settled and stop looking, which is worse than being told nothing.
 *  3. NO INSTRUCTION, ONLY EVIDENCE. Each line is a count with an outcome
 *     attached, phrased as observation. There is no "use this approach" here
 *     and there must never be: the lead is the thing that decides, and a
 *     recommendation dressed as data is how a runtime planner turns into a
 *     lookup table.
 *
 * Empty array = nothing worth saying, which is the normal answer on a young
 * farm and is not a failure.
 */
export function outcomePatterns(
    report: OutcomeReport,
    limit = 3
): string[] {
    return report.groups
        .filter(g => g.enough)
        .slice(0, limit)
        .map(g => {
            const rate = Math.round((g.success / g.runs) * 100);
            const shape = g.signature.split('|')[1] || '(no decisions recorded)';
            const crit = g.requiredSatisfaction === null
                ? ''
                : `, ${Math.round(g.requiredSatisfaction * 100)}% of required criteria met`;
            return `${g.runs} ${g.mode} run(s) here took the shape ${shape} — `
                + `${rate}% closed as success${crit}, averaging `
                + `${g.avgRounds} rounds and ${g.avgStrategyChanges} strategy change(s).`;
        });
}

// ---------------------------------------------------------------------------
// the store
// ---------------------------------------------------------------------------

/** How many finished runs are kept. Oldest out first — this is a HISTORY, and
 *  a history that grows without limit is the fault X-127 exists about. At this
 *  size the file is a few hundred kilobytes and aggregating it is milliseconds. */
export const MAX_STORED_OUTCOMES = 2000;

export type OutcomeStoreHealth = 'ok' | 'empty' | 'unreadable' | 'future';

/**
 * ‼️ THE SAME PERSISTENCE DISCIPLINE THE MISSION STORE LEARNED THE HARD WAY.
 *
 * Every rule here is one X-62, X-87 or X-64 had to be opened for, and the point
 * of restating them in a NEW store is that a new store does not inherit them:
 *
 *  · MISSING IS NOT CORRUPT. A file that never existed loads as `empty` and
 *    saves freely; a file whose bytes went bad is EVIDENCE and is set aside
 *    before anything can write in its place. If it cannot be set aside, nothing
 *    is saved at all.
 *  · SYNTAX IS NOT SCHEMA. An empty object, an array and a document whose
 *    `outcomes` is a string all parse perfectly. A store that accepted them
 *    would load empty, look healthy, and write that emptiness over the history
 *    on the next save.
 *  · A FILE FROM THE FUTURE IS READ-ONLY. A newer build's outcomes must not be
 *    rewritten by an older one in a shape the newer one cannot read back.
 *  · THE WRITE IS ATOMIC and there is NO direct-write fallback: a failed rename
 *    leaves the last good file alone and the new state in the named temp file.
 */
export class MissionOutcomeStore {
    outcomes: MissionOutcome[] = [];
    health: OutcomeStoreHealth = 'empty';
    quarantine?: string;
    private note?: string;

    constructor(private file: string) { }

    get storeFile(): string { return this.file; }
    get degraded(): string | undefined { return this.note; }
    /** ‼️ Nothing may be written over the file until a person deals with it. */
    get recoveryRequired(): boolean {
        return this.health === 'unreadable' || this.health === 'future';
    }

    load(): void {
        this.quarantine = undefined;
        this.note = undefined;
        this.outcomes = [];
        let raw: string;
        try { raw = fs.readFileSync(this.file, 'utf8'); } catch (e) {
            if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') { this.health = 'empty'; return; }
            this.health = 'unreadable';
            this.note = 'the outcome history could not be read (' + briefly(e)
                + ') - nothing will be saved over it until it can be';
            return;
        }
        let json: unknown;
        try { json = JSON.parse(raw); } catch (e) { this.corrupt(raw, briefly(e)); return; }
        const fault = outcomeStoreFault(json);
        if (fault) { this.corrupt(raw, fault); return; }
        const doc = json as { v: number; outcomes: unknown[] };
        this.outcomes = doc.outcomes.filter(isOutcome);
        if (doc.v > OUTCOME_SCHEMA) {
            // ‼️ X-64's rule. The file stays exactly as the newer build left it:
            // read as far as this build understands, never written back.
            this.health = 'future';
            this.note = 'the outcome history was written by a newer version (schema '
                + doc.v + ' > ' + OUTCOME_SCHEMA + ') - it is read as far as this build '
                + 'understands it and nothing will be written back';
            return;
        }
        this.health = 'ok';
    }

    private corrupt(raw: string, why: string): void {
        this.outcomes = [];
        const dest = this.file.replace(/\.json$/i, '') + '.corrupt-' + Date.now() + '.json';
        let kept: string | undefined;
        try { fs.renameSync(this.file, dest); kept = dest; } catch { /* locked - copy */ }
        if (!kept) { try { fs.writeFileSync(dest, raw, 'utf8'); kept = dest; } catch { /* no */ } }
        if (kept) {
            this.health = 'empty';
            this.quarantine = kept;
            this.note = 'the outcome history was unreadable (' + why + ') and has been kept as '
                + path.basename(kept) + ' - measurement starts from an empty list';
        } else {
            this.health = 'unreadable';
            this.note = 'the outcome history is unreadable (' + why
                + ') and could not be set aside - nothing will be saved over it';
        }
    }

    /**
     * ‼️ KEYED BY runId, SO ONE RUN CANNOT BE COUNTED TWICE.
     *
     * A run's outcome is recorded when it ends, and a run can "end" more than
     * once as far as this code is concerned: a reload reconciles one that had
     * already finished, a verdict is corrected, a window replays the tail. If
     * each of those appended, one successful run would become three and every
     * average would be wrong in the direction of whatever crashed most.
     *
     * A RERUN is a different matter and is NOT deduplicated: it has its own run
     * id, it is a second attempt, and counting it separately is the honest
     * record. `specId` is what shows a reader that two outcomes are two goes at
     * one objective rather than two objectives.
     */
    record(o: MissionOutcome): void {
        const at = this.outcomes.findIndex(x => x.runId === o.runId);
        if (at >= 0) { this.outcomes[at] = o; } else { this.outcomes.push(o); }
    }

    /** Drop a run's outcome - what deleting a run means for the history. */
    forget(runId: string): boolean {
        const before = this.outcomes.length;
        this.outcomes = this.outcomes.filter(o => o.runId !== runId);
        return this.outcomes.length !== before;
    }

    save(): { saved: boolean; error?: string } {
        if (this.recoveryRequired) { return { saved: false, error: this.note }; }
        if (this.outcomes.length > MAX_STORED_OUTCOMES) {
            this.outcomes = this.outcomes
                .slice()
                .sort((a, b) => a.at - b.at)
                .slice(this.outcomes.length - MAX_STORED_OUTCOMES);
        }
        const body = JSON.stringify({ v: OUTCOME_SCHEMA, outcomes: this.outcomes }, null, 2);
        const tmp = this.file + '.tmp';
        try { fs.writeFileSync(tmp, body, 'utf8'); } catch (e) {
            try { if (fs.existsSync(tmp)) { fs.unlinkSync(tmp); } } catch { /* best effort */ }
            this.note = 'the outcome history could not be written (' + briefly(e)
                + ') - the last saved copy is still on disk';
            return { saved: false, error: briefly(e) };
        }
        try { fs.renameSync(tmp, this.file); } catch (e) {
            // ‼️ NO DIRECT-WRITE FALLBACK - that is the truncation the atomic
            // swap exists to prevent, reintroduced at the worst moment (X-62).
            this.note = 'the outcome history could not be updated (' + briefly(e)
                + ') - the last saved copy is still on disk and the new state is in '
                + path.basename(tmp);
            return { saved: false, error: briefly(e) };
        }
        this.note = undefined;
        return { saved: true };
    }
}

const briefly = (e: unknown): string => String((e as Error)?.message ?? e).slice(0, 160);

/** ‼️ SHAPE, not syntax. The sentence saying what is wrong, or undefined when
 *  the document really is one of ours. */
export function outcomeStoreFault(json: unknown): string | undefined {
    if (!json || typeof json !== 'object' || Array.isArray(json)) {
        return 'the file does not hold an outcome document';
    }
    const doc = json as Record<string, unknown>;
    if (typeof doc.v !== 'number' || !Number.isFinite(doc.v) || doc.v < 1) {
        return 'the file states no schema version';
    }
    if (!Array.isArray(doc.outcomes)) { return 'the outcome list is not a list'; }
    return undefined;
}

/** One row's own shape. A row that is not one is DROPPED rather than allowed to
 *  poison an average with a missing number. */
export function isOutcome(v: unknown): v is MissionOutcome {
    if (!v || typeof v !== 'object') { return false; }
    const o = v as Record<string, unknown>;
    return typeof o.runId === 'string' && !!o.runId
        && (o.mode === 'classic' || o.mode === 'adaptive')
        && typeof o.signature === 'string' && !!o.signature
        && typeof o.signatureV === 'number'
        && typeof o.verdict === 'string'
        && !!o.criteria && typeof o.criteria === 'object'
        && !!o.counts && typeof o.counts === 'object'
        && typeof o.at === 'number' && Number.isFinite(o.at);
}
