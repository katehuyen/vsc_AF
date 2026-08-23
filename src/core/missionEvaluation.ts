import { SuccessCriterion } from './missionMode';
import { extractJson } from './util';

/**
 * Mission evaluation — M-17 (X-32).
 *
 * ‼️ "THE AGENT FINISHED" IS NOT "THE OBJECTIVE IS MET", and until this file
 * existed those were the same sentence. An adaptive run is given a RESULT to
 * reach, stated as criteria with stable ids; a run that ends because its last
 * delegation exited zero has answered a different question — did the work run —
 * and answered it as if it were the one that was asked.
 *
 * So a verdict is a RECORD here, not a feeling: which criteria were looked at,
 * by whom, what was seen, what is missing, and what the evaluator thinks should
 * happen next. Three things about it are deliberate and each has a failure
 * behind it:
 *
 *   * **There is no mandatory score.** A criterion's nature decides how it is
 *     judged — "every op is documented" is countable, "the tone matches the
 *     rest of the guide" is not, and forcing the second into 0.0–1.0 invents
 *     precision the evaluator does not have. A number is allowed and never
 *     required.
 *   * **Every evaluation names what it looked at.** An evaluation bound to
 *     nothing in particular can never go out of date, and one that can never go
 *     out of date is a permanent pass — the exact thing that would let a run
 *     revise its work and still finish on a verdict about the old version.
 *   * **`unknown` is a real answer.** An evaluator that could not tell must be
 *     able to say so; collapsing it into `fail` reads as evidence of a defect,
 *     and collapsing it into `pass` is how a run declares success it never saw.
 */

export type CriterionVerdict = 'pass' | 'fail' | 'unknown';

export interface CriterionFinding {
    criterionId: string;
    verdict: CriterionVerdict;
    /** what was SEEN — the evaluator's sentence, never a score on its own */
    evidence?: string;
    /** what is missing; the material a targeted revise is written from */
    gap?: string;
}

/**
 * What the evaluator thinks should happen next. It is ADVICE — the lead still
 * decides and the hard limits still outrank both of them.
 *
 * `revise` and `replan` are two different things and are kept apart on purpose:
 * a revise is a targeted fix to the SAME artefact under the SAME approach, a
 * replan says the approach itself was wrong and cuts a new strategy version.
 * Merging them would make "we tried again" and "we changed our minds"
 * indistinguishable in the record, which is most of what a run's history is for.
 */
export type EvaluationAdvice =
    'finish' | 'revise' | 'replan' | 'explore' | 'ask_user' | 'partial' | 'failed';

export const EVALUATION_ADVICE: EvaluationAdvice[] =
    ['finish', 'revise', 'replan', 'explore', 'ask_user', 'partial', 'failed'];

export interface MissionEvaluator {
    kind: 'lead' | 'agent';
    agentId?: string;
    agentName?: string;
}

export interface MissionEvaluation {
    id: string;
    /**
     * ‼️ X-67 — The action ids this verdict is ABOUT, and there is always at
     * least one.
     *
     * The comment at the top of this file has always said that every
     * evaluation names what it looked at, and gave the reason: a verdict bound
     * to nothing can never go out of date, and one that can never go out of
     * date is a permanent pass — the exact thing that would let a run revise
     * its work and still finish on a judgement about the old version. Nothing
     * enforced it. The type allowed `[]`, the engine accepted it, and the
     * tests for self and independent evaluation used it.
     */
    targets: string[];
    /**
     * ‼️ X-67 — WHICH VERSION of each target was judged.
     *
     * A step id is already immutable here — a step settles once and is never
     * re-run under the same id — but the moment it settled is what lets a
     * reader prove the verdict is about the artefact that existed THEN and not
     * the one that exists now. Written when the verdict is recorded, never
     * recomputed, because recomputing it would follow the artefact forward and
     * a version ref that moves is not a version ref.
     */
    targetVersions?: { id: string; at: number }[];
    evaluator: MissionEvaluator;
    findings: CriterionFinding[];
    advice: EvaluationAdvice;
    /** optional, never required, never the basis of the gate */
    confidence?: number;
    note?: string;
    at: number;
}

/**
/** ‼️ X-67 — one settled piece of work, in the terms staleness needs. */
export interface SettledWork {
    /** the step's own id: the immutable version ref of what it produced */
    id?: string;
    at: number;
    /** the criteria the work was aimed at, when it stated any */
    criteria?: readonly string[];
    /** the earlier results it was built from — a revise names what it revises */
    sources?: readonly string[];
    /**
     * ‼️ X-92 — COULD THIS WORK HAVE CHANGED THE ARTEFACT AT ALL?
     *
     * The lead marks every delegation reads-only or not (it already has to,
     * for the parallel-write rule), and that mark is the only thing in the
     * run that speaks about the artefact rather than about labels. A step
     * that changed nothing cannot have invalidated a judgement; one that
     * writes and said nothing about what it was for might have invalidated
     * anything. Absent on a record written before this, and read as such.
     */
    writes?: boolean;
}

/**
 * ‼️ WHY AN EVALUATION EXPIRES, AND WHAT "STALE" IS NOT.
 *
 * It is not age. An hour-old verdict on work nobody touched is still true, and
 * expiring it would cost a review round for nothing. What ends a verdict is the
 * WORK MOVING: the artefact it looked at is not the artefact that now exists,
 * and the pass it recorded is about a version the run has left behind.
 *
 * ‼️ X-67 — AND "THE WORK MOVED" HAS TWO WITNESSES, NOT ONE.
 *
 * This asked only whether later work carried a CRITERIA LABEL the verdict had
 * judged. A label is optional on an adaptive delegation, so the artefact could
 * be rewritten by work that named no criteria at all and the old pass stayed
 * CURRENT — holding the success gate open on a judgement of a version nobody
 * could still produce. So LINEAGE counts too: work that names one of this
 * verdict's own targets among its sources is that target's successor, label or
 * no label.
 *
 * ‼️ X-92 — AND THE THIRD WITNESS IS THE ONE THAT DOES NOT NEED A LABEL.
 *
 * Both of the above are things the LEAD chose to write down, so an ordinary
 * delegation that carried neither — which is legal, and common — could
 * rewrite the very file a pass was recorded about and the pass stayed
 * CURRENT. The success gate then opened on a judgement of a version that no
 * longer existed, which is the exact failure the gate exists to prevent, and
 * the case the tests had never covered: they only ever measured a `revise`,
 * which always names its sources.
 *
 * So work that COULD have changed the artefact and DECLARED NOTHING about
 * what it was for stales the verdict. Not because it is known to have
 * touched it, but because nothing in the run can say it did not — and
 * between a review round spent for nothing and a success gate opened on a
 * dead pass, only one of the two is recoverable.
 *
 * What still does NOT stale a verdict is unrelated work: work that changed
 * nothing (`readonly`), and work that SAID which criteria it was for when
 * none of them are the ones this verdict judged. Declaring reach is how a
 * writer stays out of the way — the mark is on the record either way.
 *
 * Derived, never stored — a stored flag is a second copy of a fact the
 * timeline already states, and the two would disagree the first time a journal
 * was replayed out of order.
 */
export function isStale(ev: MissionEvaluation, settled: readonly SettledWork[]): boolean {
    const judged = new Set(ev.findings.map(f => f.criterionId));
    const looked = new Set<string>([
        ...ev.targets,
        ...(ev.targetVersions ?? []).map(t => t.id)
    ]);
    return settled.some(s => {
        if (s.at <= ev.at) { return false; }
        if ((s.criteria ?? []).some(c => judged.has(c))) { return true; }
        if ((s.sources ?? []).some(src => looked.has(src))) { return true; }
        // ‼️ X-92 — a writer that declared no reach at all. `writes` is
        // absent on records written before this item, and those keep the
        // old two-witness behaviour rather than being staled in bulk on
        // the day the extension updates.
        return s.writes === true
            && !(s.criteria ?? []).length && !(s.sources ?? []).length;
    });
}

/** The evaluations that still speak for the work as it is now. */
export function currentEvaluations(
    evals: readonly MissionEvaluation[],
    settled: readonly SettledWork[]
): MissionEvaluation[] {
    return evals.filter(e => !isStale(e, settled));
}

export interface GateResult {
    /** whether `finish + success` may be accepted as stated */
    ok: boolean;
    /** required criteria with no current pass, by id — what the lead is told */
    unmet: { id: string; text: string; verdict: CriterionVerdict | 'unjudged' }[];
}

/**
 * ‼️ THE SUCCESS GATE. A required criterion opens it only with a CURRENT pass —
 * not a stale one, not an `unknown`, and not the absence of a complaint.
 *
 * The asymmetry between required and optional is the whole point of the
 * `required` flag: an optional criterion that failed is a preference the run
 * did not reach, and refusing success for it would make every preference a
 * requirement in practice. It still lands in the summary; it just does not hold
 * the door.
 */
export function successGate(
    criteria: readonly SuccessCriterion[],
    current: readonly MissionEvaluation[]
): GateResult {
    const latest = new Map<string, CriterionVerdict>();
    for (const e of current) {
        for (const f of e.findings) {
            // a later verdict on the same criterion replaces an earlier one —
            // an evaluation is a statement about now, not a vote
            latest.set(f.criterionId, f.verdict);
        }
    }
    const unmet = criteria
        .filter(c => c.required)
        .map(c => ({ id: c.id, text: c.text, verdict: latest.get(c.id) ?? 'unjudged' as const }))
        .filter(x => x.verdict !== 'pass');
    return { ok: unmet.length === 0, unmet };
}

/**
 * ‼️ WHY A RUN STOPPED, IN ITS OWN WORDS BUT FROM A CLOSED LIST.
 *
 * Free text here would be a summary by another name, and the question this
 * answers is one nobody can answer later from prose: was this a run that
 * reached its objective, one that ran out of usable evidence, or one the
 * ceiling stopped? The list is short because those are genuinely the ways a
 * run of this kind ends — and `no-new-information` exists specifically to give
 * a lead a way out of the "one more improvement" loop that has no natural end.
 */
export type StopReason =
    | 'criteria-satisfied'
    | 'sufficient-evidence'
    | 'no-new-information'
    | 'execution-over-discussion'
    | 'hard-limit'
    | 'user-stop';

export const STOP_REASONS: StopReason[] = [
    'criteria-satisfied', 'sufficient-evidence', 'no-new-information',
    'execution-over-discussion', 'hard-limit', 'user-stop'
];

export function isStopReason(v: unknown): v is StopReason {
    return typeof v === 'string' && (STOP_REASONS as string[]).includes(v);
}

// ---------------------------------------------------------------------------
// parsing — one contract, whoever wrote the reply
// ---------------------------------------------------------------------------

export const EVALUATION_SCHEMA = `{
  "findings": [ { "criterion": "<criterion id>", "verdict": "pass" | "fail" | "unknown", "evidence": "what you actually saw — a sentence, not a score", "gap": "what is missing (when it is not a pass)" } ],
  "advice": "finish" | "revise" | "replan" | "explore" | "ask_user" | "partial" | "failed",
  "confidence": 0.0-1.0,        // optional, omit rather than guess
  "note": "one sentence, optional"
}`;

export interface ParsedEvaluation {
    findings: CriterionFinding[];
    advice: EvaluationAdvice;
    confidence?: number;
    note?: string;
}

/**
 * Read an evaluation out of a raw reply — the lead's own decision object or an
 * independent reviewer's task output. ONE parser, because two would be two
 * definitions of what a verdict is, and the record has to mean the same thing
 * whoever wrote it.
 *
 * A criterion the reply does not mention is NOT invented as a pass and not
 * invented as a failure: it is simply absent, and the gate reads an absent
 * required criterion as unjudged, which is what it is.
 */
export function parseEvaluation(
    raw: unknown, criteria: readonly SuccessCriterion[]
): { ok: true; value: ParsedEvaluation } | { ok: false; error: string } {
    const o = typeof raw === 'string' ? extractJson(raw) : raw;
    if (!o || typeof o !== 'object' || Array.isArray(o)) {
        return { ok: false, error: 'the evaluation is not a JSON object' };
    }
    const rec = o as Record<string, unknown>;
    const rows = rec.findings;
    if (!Array.isArray(rows) || !rows.length) {
        return { ok: false, error: '"findings" must be a non-empty array, one entry per criterion you judged' };
    }
    const known = new Map(criteria.map(c => [c.id, c]));
    const findings: CriterionFinding[] = [];
    const seen = new Set<string>();
    for (const r of rows as Record<string, unknown>[]) {
        const id = String(r?.criterion ?? r?.criterionId ?? '').trim();
        if (!known.has(id)) {
            return {
                ok: false,
                error: `unknown criterion "${id}" — the ids are: ${criteria.map(c => c.id).join(', ')}`
            };
        }
        // ‼️ The same criterion twice in ONE evaluation is a contradiction, not
        // a revision: a later evaluation may overturn an earlier one, but a
        // single verdict cannot disagree with itself and be recorded as fact.
        if (seen.has(id)) { return { ok: false, error: `criterion "${id}" is judged twice in the same evaluation` }; }
        seen.add(id);
        const v = String(r?.verdict ?? '').trim().toLowerCase();
        if (v !== 'pass' && v !== 'fail' && v !== 'unknown') {
            return { ok: false, error: `criterion "${id}" needs a "verdict" of pass, fail or unknown (got "${v}")` };
        }
        const evidence = typeof r.evidence === 'string' ? r.evidence.trim().slice(0, 600) : '';
        const gap = typeof r.gap === 'string' ? r.gap.trim().slice(0, 600) : '';
        findings.push({
            criterionId: id, verdict: v as CriterionVerdict,
            ...(evidence ? { evidence } : {}),
            ...(gap ? { gap } : {})
        });
    }
    const advice = String(rec.advice ?? '').trim().toLowerCase();
    if (!(EVALUATION_ADVICE as string[]).includes(advice)) {
        return { ok: false, error: `"advice" must be one of: ${EVALUATION_ADVICE.join(' | ')}` };
    }
    // A confidence that is not a number is dropped rather than refused — it is
    // optional by design and no decision rests on it.
    const c = typeof rec.confidence === 'number' && isFinite(rec.confidence)
        ? Math.max(0, Math.min(1, rec.confidence)) : undefined;
    const note = typeof rec.note === 'string' ? rec.note.trim().slice(0, 600) : '';
    return {
        ok: true,
        value: {
            findings, advice: advice as EvaluationAdvice,
            ...(c !== undefined ? { confidence: c } : {}),
            ...(note ? { note } : {})
        }
    };
}

/**
 * What a reviewer that could not be read leaves behind. ‼️ NOT nothing, and
 * NOT a failure of the criteria: a review that timed out, crashed or answered
 * in prose says nothing about the work — recording it as `fail` would blame the
 * delegate for the reviewer's problem, and recording nothing at all would let
 * the run forget it ever asked. `unknown` with the reason is the true statement.
 */
export function unreadableEvaluation(
    criteria: readonly SuccessCriterion[], why: string
): ParsedEvaluation {
    return {
        findings: criteria.map(c => ({
            criterionId: c.id, verdict: 'unknown' as const, gap: why
        })),
        advice: 'revise',
        note: `the review could not be read — ${why}`
    };
}

/** The reviewer's whole instruction: the objective, the criteria by id, what to
 *  look at, and the reply contract. Self-contained, because a delegate sees
 *  nothing but its prompt. */
export function buildReviewPrompt(
    goal: string, criteria: readonly SuccessCriterion[], material: string, constraints: readonly string[] = []
): string {
    return `You are REVIEWING work against an objective. You are not here to improve it, continue it or do any part of it — you look at what is in front of you and say whether each criterion is met.

## The objective
${goal.trim()}
${constraints.length ? `\n## Constraints this work was under\n${constraints.map(c => `- ${c}`).join('\n')}` : ''}

## The criteria — judge each one by its id
${criteria.map(c => `- [${c.id}] ${c.text}${c.required ? '' : '  (optional)'}`).join('\n')}

## What was produced
${material || '(nothing was produced — say so, and judge accordingly)'}

## How to answer
Reply with ONLY one JSON object (no prose around it):
${EVALUATION_SCHEMA}
Rules:
- Judge ONLY from what is above. Do not open files, run anything or go looking — if you cannot tell from the material, the verdict is "unknown" and the gap says what you would have needed.
- "unknown" is a real answer and is better than a guess in either direction.
- "evidence" is what you actually saw. A score with no sentence behind it is not evidence.
- Do not invent criteria and do not judge the same one twice.`;
}
