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
 * Pure: no vscode, no fs, no clock beyond what is handed in. The manager owns
 * the timer and the store; this owns every rule about whether there is a next
 * round and what it is.
 */

/** How long a wait may be asked for, in minutes. Seven days. */
export const ROUND_DELAY_MAX_MIN = 7 * 24 * 60;

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
}

/** What the manager should create, or why it should not. */
export interface NextRound {
    /** The words to send. */
    prompt: string;
    /** The round number this will be — always exactly one more than the last. */
    round: number;
    /** What is left after this one, so the chain carries itself forward. */
    rest: TaskRound[];
    /** The conversation to resume. Never empty: see `refuseNextRound`. */
    resumeSessionId: string;
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
 * Returned only for the case that would otherwise be silent: rounds are
 * waiting and the run cannot be continued. Everything else (no rounds asked
 * for, the run failed, the chain is a workflow step) is either not a chain or
 * already visible on the board as what it is, and narrating it would fill the
 * event log with news that nothing happened.
 */
export function refuseNextRound(task: RoundedTask): string | undefined {
    const rest = normalizeRounds(task.rounds);
    if (!rest.length || task.status !== 'done' || task.workflowId !== undefined) { return undefined; }
    if (!String(task.runSessionId ?? '').trim()) {
        return `round ${roundOf(task) + 1} of this task cannot be sent: no conversation is bound to `
            + 'this run (see sessions.bindings), and a round is a reply — opening a NEW conversation '
            + 'with a prompt written for the last one would answer nothing. '
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
 *   · There is a CONVERSATION TO RESUME. See `refuseNextRound`.
 *   · It is NOT A WORKFLOW STEP. A step's "what happens next" belongs to the
 *     workflow, which already owns branching, verification and handoff; two
 *     mechanisms answering that question would race for the same task.
 */
export function planNextRound(task: RoundedTask, now: number): NextRound | undefined {
    if (task.status !== 'done' || task.workflowId !== undefined) { return undefined; }
    const queue = normalizeRounds(task.rounds);
    if (!queue.length) { return undefined; }
    const resumeSessionId = String(task.runSessionId ?? '').trim();
    if (!resumeSessionId) { return undefined; }
    const [head, ...rest] = queue;
    const delayMin = head.delayMin ?? 0;
    return {
        prompt: head.prompt,
        round: roundOf(task) + 1,
        rest,
        resumeSessionId,
        notBefore: now + delayMin * 60_000,
        delayMin
    };
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
