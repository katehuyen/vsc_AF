/**
 * ‼️ M-27 — A TASK IS ALLOWED TO BE MORE THAN ONE TURN.
 *
 * A task carried exactly one prompt. That is not how the work it stands in for
 * is actually shaped: "read the file, then write the patch, then run the tests"
 * is three turns of ONE conversation, and the only way to say it was to queue
 * three tasks — three separate runs, three separate conversations, the second
 * of which wakes up knowing nothing about the first. So the thing people
 * actually wanted (an unattended session that goes several rounds deep) could
 * not be asked for at all.
 *
 * A ROUND IS A PROMPT SENT INTO THE SAME CONVERSATION once the previous answer
 * has landed. Round 1 is the task's own `prompt` — that is every task ever
 * written, and nothing about them changes. Rounds 2..N sit in `rounds`, each
 * with its own wait, and each becomes a real row on the board when its turn
 * comes rather than a promise held in a closure.
 *
 * ‼️ A RETRY IS NOT A ROUND, and this is the distinction the whole file exists
 * to keep. A retry is the SAME round attempted again because the run did not
 * survive; a round is the NEXT thing to say because the previous one was
 * answered. Counting them together would make "round 3 of 5" a lie on any task
 * that ever hit a usage limit, and would let a flaky network silently consume
 * the user's rounds. So `round` is carried through a retry untouched, and only
 * `planNextRound` ever moves it.
 *
 * ‼️ AND A ROUND WAITS FOR ITS CONVERSATION RATHER THAN BEING DROPPED BY IT.
 * Only opencode knows its session id while the run is still going; every other
 * engine is bound to one AFTERWARDS, by matching a transcript on disk. So at
 * the moment a round is answered there is normally nothing to resume YET, and
 * refusing there — which is what this did — killed the chain on its ordinary
 * path. `awaitBinding` says so, and the manager makes a held row out of it.
 *
 * Pure: no vscode, no fs, no clock beyond what is handed in. The manager owns
 * the timer and the store; this owns every rule about whether there is a next
 * round and what it is.
 */

/** How long a wait may be asked for, in minutes. Seven days. */
export const ROUND_DELAY_MAX_MIN = 7 * 24 * 60;

/**
 * ‼️ The blocker code a round waiting for its conversation is parked under.
 *
 * ONE constant because it is written in two places — on the row when the round
 * is made, and by `launchBlock` on every pump pass after that — and M-11's rule
 * is that a park is news when its CODE changes. Two spellings of the same
 * hold would announce "did not start" every thirty seconds about a wait that
 * is normally over in one.
 */
export const ROUND_BINDING_CODE = 'round:binding';

/** What that hold says on the row, in the sentence a reader can act on. */
export function roundBindingReason(task: Pick<RoundedTask, 'round'>): string {
    return `waiting for the conversation round ${Math.max(1, roundOf(task) - 1)} was answered in`
        + ' — the run it follows has not been matched to a transcript yet (see sessions.bindings),'
        + ' and a round sent into a NEW conversation would answer nothing';
}

/** One prompt in the chain, with the wait that precedes it. */
export interface TaskRound {
    /** What is sent. A round with nothing to say is not a round. */
    prompt: string;
    /**
     * Minutes to wait AFTER the previous answer lands, before this one is sent.
     * Absent or 0 means "as soon as the previous answer is in", which is what
     * the user gets without touching the box.
     */
    delayMin?: number;
}

/** The shape `planNextRound` needs. A subset of FarmTask, so it can be tested. */
export interface RoundedTask {
    status: string;
    /** Which round this run is. Absent = 1, for every task written before M-27. */
    round?: number;
    /** The prompts still to be sent, in order. */
    rounds?: TaskRound[];
    /** The conversation this run was bound to — what the next round resumes. */
    runSessionId?: string;
    engine?: string;
    /** A step of a workflow is not a chain of its own; see `planNextRound`. */
    workflowId?: string;
    /**
     * ‼️ Resuming a conversation is a HEADLESS argument. An interactive run
     * opens a session in a terminal, and continuing it there is the Console's
     * own Resume — so a round of one is refused here rather than made into a
     * row that fails at the spawn. Absent means headless.
     */
    mode?: string;
}

/** What the manager should create, or why it should not. */
export interface NextRound {
    /** The words to send. */
    prompt: string;
    /** The round number this will be — always exactly one more than the last. */
    round: number;
    /** What is left after this one, so the chain carries itself forward. */
    rest: TaskRound[];
    /**
     * The conversation to resume — EMPTY while `awaitBinding` is true, which is
     * the ordinary case at the moment a run ends.
     */
    resumeSessionId: string;
    /**
     * ‼️ THE CONVERSATION IS NOT KNOWN YET, AND THAT IS NORMAL — NOT A REFUSAL.
     *
     * Only `opencode run --format json` prints its session id while the run is
     * still going. Every OTHER engine's run is bound to a session AFTERWARDS, by
     * matching a transcript the index found on disk — which lands after the
     * process has already exited, sometimes minutes later or after a restart.
     * So at the exact moment a round is answered there is usually nothing to
     * resume yet, and reading that as "there is no conversation" would kill the
     * chain on its ordinary path — which is what it did.
     *
     * The round is still a ROW from this moment: created, visible, cancellable,
     * and HELD until the binding lands (`launchBlock` → `round:binding`, released
     * by `releaseRounds`).
     */
    awaitBinding: boolean;
    /** The moment it may start. Equal to `now` when the wait is zero. */
    notBefore: number;
    /** The minutes asked for, so the row can say what it is waiting out. */
    delayMin: number;
}

/**
 * Clean a list of rounds as it arrives from a form, a bridge call or a stored
 * task. Blank prompts are dropped rather than refused — an empty row is what a
 * half-filled form looks like, not an error to shout about — and a wait is
 * clamped rather than trusted, because a delay read from JSON can be anything
 * and an unbounded one is a task that never finishes and never says why.
 */
export function normalizeRounds(input: unknown): TaskRound[] {
    if (!Array.isArray(input)) { return []; }
    const out: TaskRound[] = [];
    for (const raw of input) {
        const row = (raw ?? {}) as { prompt?: unknown; delayMin?: unknown };
        // A bare string is a round with no wait — the shorthand a caller
        // writing JSON by hand will reach for first.
        const prompt = (typeof raw === 'string' ? raw : String(row.prompt ?? '')).trim();
        if (!prompt) { continue; }
        const asked = typeof raw === 'string' ? 0 : Number(row.delayMin ?? 0);
        const delayMin = Number.isFinite(asked)
            ? Math.min(ROUND_DELAY_MAX_MIN, Math.max(0, Math.floor(asked)))
            : 0;
        out.push(delayMin > 0 ? { prompt, delayMin } : { prompt });
    }
    return out;
}

/** Which round a task is, counting from 1. Absent means the first. */
export function roundOf(task: Pick<RoundedTask, 'round'>): number {
    const n = Number(task.round ?? 1);
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

/**
 * ‼️ WHY THERE IS NO NEXT ROUND, IN WORDS, when there could have been one.
 *
 * Returned for the one case that is a real REFUSAL rather than a wait: the
 * task is INTERACTIVE. A round resumes the conversation the round before it
 * was answered in; resuming is a headless argument, and an interactive run
 * opens a session in a terminal where continuing it is the Console's own
 * Resume. Left unsaid, the rounds the user typed would become a row that
 * fails at the spawn with a message nobody would connect to them.
 *
 * ‼️ A run whose conversation is not bound YET is NOT here. That is a wait,
 * and it waits as a row (see `awaitBinding`). Everything else — no rounds asked
 * for, the run failed, the chain is a workflow step — is either not a chain or
 * already visible on the board as what it is, and narrating it would fill the
 * event log with news that nothing happened.
 */
export function refuseNextRound(task: RoundedTask): string | undefined {
    const rest = normalizeRounds(task.rounds);
    if (!rest.length || task.status !== 'done' || task.workflowId !== undefined) { return undefined; }
    if ((task.mode ?? 'headless') !== 'headless') {
        return `round ${roundOf(task) + 1} of this task cannot be sent: a round is a reply into the `
            + 'SAME conversation, and resuming one is a headless argument — this task opens a session '
            + 'in a terminal, where the Console\'s own Resume continues it properly. '
            + `${rest.length} round(s) dropped.`;
    }
    return undefined;
}

/**
 * The next round of a task that has just finished, or nothing.
 *
 * ‼️ FOUR THINGS MUST ALL BE TRUE, and each of them for its own reason.
 *
 *   · The run ENDED WELL. A round is a reply to an answer; there is no answer
 *     to reply to after a failure. Failure is the retry policy's subject, and
 *     if a retry succeeds it is that run — carrying this same chain — that
 *     opens the next round. A cancelled run is a person saying stop, and
 *     continuing to send them prompts would be the opposite of that.
 *   · There is SOMETHING LEFT TO SAY. The last round ends the chain.
 *   · It is a HEADLESS run. See `refuseNextRound`.
 *   · It is NOT A WORKFLOW STEP. A step's "what happens next" belongs to the
 *     workflow, which already owns branching, verification and handoff; two
 *     mechanisms answering that question would race for the same task.
 *
 * ‼️ A BOUND CONVERSATION IS NOT ON THAT LIST, and that is the correction this
 * function most needed. It used to be the fifth condition, and it is false for
 * every engine but opencode at the exact moment it was asked — the binding is
 * made afterwards, from a transcript on disk. So the chain died on its ordinary
 * path. The round is planned anyway, with `awaitBinding` set, and the manager
 * makes it a held row instead of a launch.
 */
export function planNextRound(task: RoundedTask, now: number): NextRound | undefined {
    if (task.status !== 'done' || task.workflowId !== undefined) { return undefined; }
    if ((task.mode ?? 'headless') !== 'headless') { return undefined; }
    const queue = normalizeRounds(task.rounds);
    if (!queue.length) { return undefined; }
    const resumeSessionId = String(task.runSessionId ?? '').trim();
    const [head, ...rest] = queue;
    const delayMin = head.delayMin ?? 0;
    return {
        prompt: head.prompt,
        round: roundOf(task) + 1,
        rest,
        resumeSessionId,
        awaitBinding: !resumeSessionId,
        notBefore: now + delayMin * 60_000,
        delayMin
    };
}

/**
 * ‼️ WHAT A CHAIN IS, IN ONE LINE, for the anatomy of a schedule, a trigger
 * or a template — the list of what the run it makes was SET UP with.
 *
 * It belongs there beside the model and the retry policy for exactly the
 * reason they are: an unattended run that goes three turns deep and one that
 * answers once look identical on the row, and the difference is the whole
 * point of the thing. Absent for a one-prompt run, like every other
 * dimension nobody stated.
 */
export function describeRounds(rounds: TaskRound[] | undefined): string | undefined {
    const list = normalizeRounds(rounds);
    if (!list.length) { return undefined; }
    const waits = list.filter(r => (r.delayMin ?? 0) > 0).length;
    return `${list.length + 1} rounds — the prompt, then ${list.length} more sent into the `
        + 'SAME conversation, each once the one before it has been ANSWERED'
        + (waits ? ` (${waits} after a stated wait)` : '');
}

/**
 * ‼️ HOW MANY ROUNDS THE CHAIN WAS STARTED WITH. Written once, when the task is
 * created, because it is the only moment it is knowable: by round 3 the list
 * has been eaten down and nothing left on the task can say what the user asked
 * for. Without it "round 3" has no denominator and the board cannot say whether
 * anything is still coming.
 */
export function totalRounds(rounds: TaskRound[]): number {
    return 1 + rounds.length;
}

/**
 * What the row says about where it is in the chain. `undefined` for a plain
 * one-round task, which is nearly all of them — a badge that says "1 of 1" is
 * noise on every board it appears on.
 */
export function describeRound(task: Pick<RoundedTask, 'round'> & { roundsTotal?: number }): string | undefined {
    const total = Number(task.roundsTotal ?? 0);
    if (!Number.isFinite(total) || total < 2) { return undefined; }
    return `R${roundOf(task)}/${Math.floor(total)}`;
}

/**
 * The long form the shorthand opens with (SHORTHAND, docs/CONVENTIONS.md), plus
 * what the reader cannot see from the number alone: that retries do not move it.
 */
export function explainRound(
    task: Pick<RoundedTask, 'round'> & { roundsTotal?: number; rounds?: TaskRound[] }
): string | undefined {
    const total = Number(task.roundsTotal ?? 0);
    if (!Number.isFinite(total) || total < 2) { return undefined; }
    const at = roundOf(task);
    const left = normalizeRounds(task.rounds);
    const next = left[0];
    const waits = next && (next.delayMin ?? 0) > 0
        ? ` The next one waits ${next.delayMin} min after this answer lands.`
        : (left.length ? ' The next one is sent as soon as this answer lands.' : '');
    return `Round ${at} of ${Math.floor(total)} — each round is one prompt sent into the SAME `
        + 'conversation, once the round before it has been answered. A retry is not a round: it is '
        + `this same round attempted again, and it does not move the count.${waits}`
        + (left.length ? '' : ' This is the last one.');
}
