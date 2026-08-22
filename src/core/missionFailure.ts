/**
 * ‼️ M-18 — WHAT A LEAD IS TOLD WHEN A PRIMITIVE FAILS.
 *
 * Every primitive can fail, and until now each one failed in prose: `step.note`
 * was a sentence written at the site — "agent not found", "workflow no longer
 * exists", "child objective refused — …", "task record lost". A person reads
 * those fine. The lead is not a person: it gets one line of free text inside a
 * round message and has to decide, from that alone, whether to order the same
 * thing again, order it differently, or stop. Prose cannot be decided on, so
 * the lead did the only thing it could — it guessed, and mostly it retried, and
 * a delegation to an agent that does not exist failed identically for as many
 * rounds as the ceiling allowed.
 *
 * So a failure is now a SHAPE with three parts, which is exactly what a caller
 * needs and no more:
 *
 *   * **what class of thing went wrong** — from a closed set, so the lead can
 *     branch on it instead of reading it;
 *   * **what was attempted** — the action in the run's own words, because
 *     "failed" with no subject is not a fact anybody can act on;
 *   * **where the evidence is** — the task, the child run, the archived output.
 *     A lead that must not paraphrase work it never saw (the whole point of the
 *     typed intents) needs an id to point at, not a summary.
 *
 * And each class states, once and centrally, what the lead should DO about it.
 * That sentence is written HERE rather than at the eight failure sites for the
 * same reason the primitive registry exists: eight copies of an instruction are
 * eight chances for one of them to be different.
 *
 * ‼️ THE RAW SENTENCE IS NEVER THROWN AWAY. Classifying is an addition, not a
 * replacement — `detail` keeps the original words, because the class is our
 * reading of the failure and the sentence is what actually happened.
 *
 * Pure: no vscode, no disk. The classification is a fact about a step and a
 * task record, and both are handed in.
 */

/** How a lead should treat this failure. Stated, never inferred at the site. */
export type RetryAdvice =
    /** the cause was outside the request — ordering the same thing again is reasonable */
    | 'same'
    /** ordering it again as written fails again — change the agent, the engine or the approach */
    | 'different'
    /** the request itself was rejected — the lead must fix its own decision first */
    | 'fix-request'
    /** a person or a ceiling stopped it — do not order it again at all */
    | 'stop';

export type FailureClass =
    | 'agent-missing'
    | 'target-missing'
    | 'request-refused'
    | 'record-lost'
    | 'interrupted'
    | 'cancelled'
    | 'engine-refused'
    | 'budget-stopped'
    | 'delegate-failed';

export interface FailureKind {
    retry: RetryAdvice;
    /** ONE line, written for the LEAD to act on — not for a person to admire. */
    says: string;
}

/**
 * ‼️ THE CLOSED SET, AND THE ORDER IS THE ORDER THE LEAD IS SHOWN.
 *
 * A class is added here or it does not exist: `classifyFailure` falls back to
 * `delegate-failed`, which is the honest answer for "it ran and came back
 * failed" and a dishonest one for anything else — so a new failure MODE gets a
 * row rather than being folded into the ordinary case.
 */
export const FAILURE_KINDS: Record<FailureClass, FailureKind> = {
    'agent-missing': {
        retry: 'different',
        says: 'That agent is not in this fleet. Name one of the agents you were listed, '
            + 'or drop the step — asking again will fail identically.'
    },
    'target-missing': {
        retry: 'different',
        says: 'What this action pointed at no longer exists. Re-read the list you were given '
            + 'in the briefing and name something on it, or do the work as a delegation instead.'
    },
    'request-refused': {
        retry: 'fix-request',
        says: 'The request was rejected before anything ran, and the reason is about what you '
            + 'asked for. Fix that and it can be ordered again; repeating it unchanged cannot work.'
    },
    'record-lost': {
        retry: 'same',
        says: 'The work may well have run — its record is gone, so nothing here can say. '
            + 'Nothing was concluded from it. Order it again if the result still matters.'
    },
    interrupted: {
        retry: 'same',
        says: 'A window reload cut this off mid-flight. Its fate is unknown and nothing was '
            + 'concluded from it — check the output file if there is one before re-ordering.'
    },
    cancelled: {
        retry: 'stop',
        says: 'A person stopped this. Do not order it again — finish with what you have and say '
            + 'honestly what was not done.'
    },
    'engine-refused': {
        retry: 'different',
        says: 'It never started: this machine or this engine refused the run before a process '
            + 'existed. Nothing was spent. Try another agent or another engine.'
    },
    'budget-stopped': {
        retry: 'stop',
        says: 'A ceiling stopped this. There is no more rope — finish with what you have.'
    },
    'delegate-failed': {
        retry: 'different',
        says: 'The delegate ran and came back failed. Read its output before deciding: '
            + 're-ordering the same prompt to the same agent usually fails the same way.'
    }
};

export interface FailureRefs {
    outputFile?: string;
    taskId?: string;
    workflowRunId?: string;
    missionRunId?: string;
}

export interface StepFailure {
    class: FailureClass;
    /** what this action was trying to do — the step's own title and target */
    attempted: string;
    /** ‼️ the original sentence, kept whole. The class is our reading; this is what happened. */
    detail?: string;
    refs?: FailureRefs;
}

/** The step shape this module needs — structural, so it never has to import
 *  `missions.ts` and make the two files circular. */
export interface FailedStepLike {
    title?: string;
    agentName?: string;
    kind?: string;
    intent?: string;
    outputFile?: string;
    taskId?: string;
    workflowRunId?: string;
    missionRunId?: string;
}

const MAX = 400;
const trim = (v: unknown) => String(v ?? '').trim().slice(0, MAX);

/** What the action was trying to do, in one line: who, what, and of which kind. */
export function attemptOf(step: FailedStepLike): string {
    const what = trim(step.title) || 'an unnamed action';
    const kind = trim(step.kind);
    const shape = kind === 'workflow' ? 'workflow' : kind === 'mission' ? 'child objective'
        : trim(step.intent) || 'delegation';
    const who = trim(step.agentName);
    return `${shape}${who && shape === 'delegation' ? ` to ${who}` : ''} — "${what}"`;
}

function refsOf(step: FailedStepLike): FailureRefs | undefined {
    const r: FailureRefs = {};
    if (step.outputFile) { r.outputFile = String(step.outputFile); }
    if (step.taskId) { r.taskId = String(step.taskId); }
    if (step.workflowRunId) { r.workflowRunId = String(step.workflowRunId); }
    if (step.missionRunId) { r.missionRunId = String(step.missionRunId); }
    return Object.keys(r).length ? r : undefined;
}

/**
 * Build the normalised failure. The CLASS is given by the caller, because the
 * caller is the only thing that knows it — a site that writes "agent not found"
 * knows more than any parser reading that string back could.
 */
export function failure(
    kind: FailureClass, step: FailedStepLike, detail?: string
): StepFailure {
    const f: StepFailure = { class: kind, attempted: attemptOf(step) };
    const d = trim(detail);
    if (d) { f.detail = d; }
    const refs = refsOf(step);
    if (refs) { f.refs = refs; }
    return f;
}

/**
 * ‼️ A TASK THAT FAILED SAYS WHY, AND THE TWO REASONS ARE DIFFERENT FACTS.
 *
 * `deferredReason` on a settled task is the sentence from a run that never
 * started — an engine this machine cannot run, an effort the engine has no flag
 * for, a ceiling that was already hit. That is not the same event as "the
 * delegate worked for four minutes and returned failed", and a lead told the
 * same word for both cannot tell "try another engine" from "read the output".
 */
export function classifyTaskFailure(
    step: FailedStepLike,
    task: { status?: string; deferredReason?: string; deferredCode?: string } | undefined
): StepFailure {
    if (!task) { return failure('record-lost', step, 'the task record is gone'); }
    if (task.status === 'cancelled') { return failure('cancelled', step, task.deferredReason); }
    const reason = trim(task.deferredReason);
    const code = trim(task.deferredCode);
    // ‼️ THE CODE IS THE IDENTITY, THE REASON IS THE PROSE — that distinction is
    // `deferredCode`'s whole reason for existing, so the class is read off the
    // code and never sniffed out of the sentence. A reason that happens to
    // contain the word "budget" is a sentence about money; `budget:fleet` is a
    // ceiling. Only the second is a fact.
    if (code.startsWith('budget:')) { return failure('budget-stopped', step, reason || code); }
    // A run refused before a process existed states its reason and clears the
    // code (there is no blocker to hold — the run is over). It spent nothing,
    // which is what makes "try another engine" the right advice and reading a
    // non-existent output the wrong one.
    if (reason && !step.outputFile) { return failure('engine-refused', step, reason); }
    return failure('delegate-failed', step, reason || undefined);
}

/**
 * The block the LEAD reads. Deliberately not prose: a labelled shape the model
 * can branch on, with the original sentence kept underneath it and the ids it
 * would need to ask for the real output rather than paraphrase it.
 */
export function describeFailure(f: StepFailure | undefined): string {
    if (!f) { return ''; }
    const k = FAILURE_KINDS[f.class] ?? FAILURE_KINDS['delegate-failed'];
    const lines = [
        `Failure: ${f.class} (retry: ${k.retry})`,
        `Attempted: ${f.attempted}`
    ];
    if (f.detail) { lines.push(`Reported: ${f.detail}`); }
    const r = f.refs;
    if (r) {
        const bits = [
            r.outputFile ? `output file ${r.outputFile}` : '',
            r.taskId ? `task ${r.taskId}` : '',
            r.workflowRunId ? `workflow run ${r.workflowRunId}` : '',
            r.missionRunId ? `child run ${r.missionRunId}` : ''
        ].filter(Boolean);
        if (bits.length) { lines.push(`Evidence: ${bits.join(' · ')}`); }
    }
    lines.push(`What to do: ${k.says}`);
    return lines.join('\n');
}

/** The one-line form, for a row that has no room for the block (the step note,
 *  a table cell). The class first, because that is the part that is decided on. */
export function shortFailure(f: StepFailure | undefined): string {
    if (!f) { return ''; }
    return f.detail ? `${f.class} — ${f.detail}` : f.class;
}
