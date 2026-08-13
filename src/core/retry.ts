/**
 * ‼️ M-3 — WHAT HAPPENS WHEN A RUN FAILS, AS A SETTING RATHER THAN A SECRET.
 *
 * Agent Farm already retried tasks, and that was the problem: it did it with
 * numbers nobody could see or change (six attempts, forty minutes) and only for
 * one kind of failure (the Claude session limit), decided by matching the
 * output against a regular expression and by parsing the attempt number out of
 * the task's TITLE. Everything else — a flaky network, a tool that was busy, a
 * push that raced a colleague — was final on the first try, at three in the
 * morning, with nobody watching.
 *
 * So retrying is a policy, it rides with the work like every other run
 * dimension (`RunDimensions`), and it answers exactly the questions a person
 * asks about it:
 *
 *   · SHOULD it retry at all                       → `max` (0 = never)
 *   · HOW MANY times                                → `max`
 *   · HOW LONG before the first one                 → `delayMin`
 *   · AND before the ones after that                → `backoff`
 *   · WITH WHAT — the same prompt, or another       → `prompt`
 *   · AND FOR WHICH failures                        → `when`
 *
 * Pure: no vscode, no fs, no clock beyond what is handed in. The manager owns
 * the timer; this owns every rule about whether there should be one.
 */

/** How the wait grows between attempts. */
export type RetryBackoff = 'same' | 'double';

/** Which failures are worth trying again. */
export type RetryWhen = 'any' | 'limit';

export interface RetryPolicy {
    /** How many times to try AGAIN after a failure. 0 (or absent) = never. */
    max?: number;
    /** Minutes to wait before the FIRST retry. */
    delayMin?: number;
    /**
     * `same` — every retry waits `delayMin`.
     * `double` — the wait doubles each time (delayMin, ×2, ×4 …), which is what
     * you want against something that is busy rather than broken: hammering a
     * rate limit at a fixed interval is how a retry policy becomes the problem.
     */
    backoff?: RetryBackoff;
    /**
     * What to send on a retry. Empty = the original prompt again, which is the
     * right default for a run that failed for a reason outside itself. A
     * different prompt is for the other case — "you failed; read the output and
     * fix the thing you got wrong" — and it is sent INSTEAD of the original,
     * not appended, because a retry is a fresh headless run with no memory of
     * the last one.
     */
    prompt?: string;
    /**
     * `limit` — only when the failure was the Claude usage/session limit, i.e.
     * the work was never actually attempted. This is what the extension did for
     * everybody before there was a setting, so it stays the default.
     * `any` — any non-zero exit.
     */
    when?: RetryWhen;
}

/**
 * ‼️ THE DEFAULT IS THE OLD HARD-CODED BEHAVIOUR, EXACTLY. Six attempts, forty
 * minutes apart, only for a session limit, with the same prompt. A release that
 * changed what an unconfigured task does would be changing every automation the
 * user already has, silently, which is the one thing a settings item must not
 * do on its way in.
 */
export const DEFAULT_RETRY: Required<Pick<RetryPolicy, 'max' | 'delayMin' | 'backoff' | 'when'>> = {
    max: 6, delayMin: 40, backoff: 'same', when: 'limit'
};

/** Ceilings, so a typo cannot make a run that retries for a week. */
export const RETRY_MAX_ATTEMPTS = 20;
export const RETRY_MAX_DELAY_MIN = 1440;
/** The longest a doubled wait may grow to, whatever the arithmetic says. */
export const RETRY_MAX_WAIT_MIN = 12 * 60;

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/**
 * Read a policy off whatever a form, a settings file or a bridge call produced.
 * Returns undefined when there is nothing to say — an absent policy means "use
 * the default", which is a different statement from `max: 0` ("never retry").
 */
export function normalizeRetry(raw: unknown): RetryPolicy | undefined {
    if (!raw || typeof raw !== 'object') { return undefined; }
    const o = raw as Record<string, unknown>;
    const out: RetryPolicy = {};
    if (o.max !== undefined && o.max !== null && o.max !== '') {
        const n = Number(o.max);
        if (!Number.isFinite(n)) { return undefined; }
        out.max = clamp(Math.round(n), 0, RETRY_MAX_ATTEMPTS);
    }
    if (o.delayMin !== undefined && o.delayMin !== null && o.delayMin !== '') {
        const n = Number(o.delayMin);
        if (Number.isFinite(n)) { out.delayMin = clamp(Math.round(n), 1, RETRY_MAX_DELAY_MIN); }
    }
    if (o.backoff === 'same' || o.backoff === 'double') { out.backoff = o.backoff; }
    if (o.when === 'any' || o.when === 'limit') { out.when = o.when; }
    const p = typeof o.prompt === 'string' ? o.prompt.trim() : '';
    if (p) { out.prompt = p; }
    return Object.keys(out).length ? out : undefined;
}

/** A policy with every hole filled — what the manager actually runs on. */
export function resolveRetry(policy?: RetryPolicy, fallback?: RetryPolicy): Required<
    Pick<RetryPolicy, 'max' | 'delayMin' | 'backoff' | 'when'>
> & { prompt?: string } {
    const a = policy ?? {};
    const b = fallback ?? {};
    const pick = <K extends keyof RetryPolicy>(k: K): NonNullable<RetryPolicy[K]> =>
        (a[k] ?? b[k] ?? DEFAULT_RETRY[k as 'max' | 'delayMin' | 'backoff' | 'when']) as NonNullable<RetryPolicy[K]>;
    const out = {
        max: pick('max') as number,
        delayMin: pick('delayMin') as number,
        backoff: pick('backoff') as RetryBackoff,
        when: pick('when') as RetryWhen
    } as Required<Pick<RetryPolicy, 'max' | 'delayMin' | 'backoff' | 'when'>> & { prompt?: string };
    const prompt = (a.prompt ?? b.prompt ?? '').trim();
    if (prompt) { out.prompt = prompt; }
    return out;
}

/**
 * ‼️ THE ONE FAILURE THAT IS NOT A FAILURE. The Claude CLI refuses the run
 * outright when the plan window is spent, so nothing was attempted and nothing
 * is wrong with the work. It clears within hours by itself, which is why it is
 * the default `when` and why a fixed forty minutes is the right wait for it.
 */
export function isLimitFailure(output: string): boolean {
    return /hit your session limit|session limit[^.]*reset|usage limit reached/i.test(String(output ?? ''));
}

/** How long to wait before attempt `n` (1 = the first retry), in minutes. */
export function retryWaitMin(
    p: Pick<RetryPolicy, 'delayMin' | 'backoff'>, attempt: number
): number {
    const base = p.delayMin ?? DEFAULT_RETRY.delayMin;
    const n = Math.max(1, Math.round(attempt));
    if ((p.backoff ?? DEFAULT_RETRY.backoff) !== 'double') { return base; }
    // 2^19 minutes is a number, not a wait. The ceiling is what makes a doubling
    // policy safe to set and forget.
    return Math.min(RETRY_MAX_WAIT_MIN, base * Math.pow(2, n - 1));
}

export interface RetryDecision {
    retry: boolean;
    /** How long the manager should wait, in ms. 0 when there is no retry. */
    delayMs: number;
    /** Which attempt this would be (1 = the first retry). */
    attempt: number;
    /** Said in words, because it goes on the task's own record and in its
     *  output file — "attempt 2 of 6" alone never explains a retry that did NOT
     *  happen, and that is the case somebody comes looking for. */
    why: string;
}

/**
 * Should this failure be tried again? `done` is never asked; only a failure
 * reaches here.
 */
export function retryDecision(policy: RetryPolicy | undefined, o: {
    /** How many retries have already happened. 0 on the original run. */
    attempt: number;
    /** The run's output, for the limit test. */
    output?: string;
    /** A fallback policy (the user's global default). */
    fallback?: RetryPolicy;
}): RetryDecision {
    const p = resolveRetry(policy, o.fallback);
    const attempt = Math.max(0, Math.round(o.attempt)) + 1;
    const no = (why: string): RetryDecision => ({ retry: false, delayMs: 0, attempt, why });
    if (p.max <= 0) { return no('retry is off for this run'); }
    if (attempt > p.max) { return no(`out of retries — ${p.max} already used`); }
    if (p.when === 'limit' && !isLimitFailure(o.output ?? '')) {
        return no('the failure was not a session limit, and this run only retries those');
    }
    const wait = retryWaitMin(p, attempt);
    return {
        retry: true, delayMs: wait * 60_000, attempt,
        why: p.when === 'limit'
            ? `the session limit was hit, so nothing was attempted — retry ${attempt} of ${p.max} in ${wait} min`
            : `retry ${attempt} of ${p.max} in ${wait} min`
    };
}

/**
 * One line for a hover or a form's summary. ‼️ It says the whole policy or it
 * says nothing: "retries 3 times" leaves out the two numbers that decide
 * whether the run finishes tonight or tomorrow.
 */
export function describeRetry(policy?: RetryPolicy, fallback?: RetryPolicy): string {
    const p = resolveRetry(policy, fallback);
    if (p.max <= 0) { return 'no retry — one attempt and it is done'; }
    const bits = [`${p.max}×`];
    bits.push(p.backoff === 'double'
        ? `first after ${p.delayMin} min, then doubling`
        : `every ${p.delayMin} min`);
    bits.push(p.when === 'limit' ? 'only on a session limit' : 'on any failure');
    if (p.prompt) { bits.push('with a different prompt'); }
    return bits.join(' · ');
}
