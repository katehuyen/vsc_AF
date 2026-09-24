/**
 * X-329 — OpenCode's first-use race, answered with ONE retry.
 *
 * Measured (2026-09-23): two `opencode` processes starting in the same second
 * on a FRESH data home race its first-use migration; one dies within ~1.5 s
 * with `database is locked` or `Failed query: CREATE TABLE …` before any turn
 * starts. Once the home is warm, 40 concurrent starts out of 40 were clean —
 * it is not a steady contention, so a queue would tax every run for a rare
 * event and a per-run data home would break the session list. The user chose
 * the smallest fix: wait ~2 s and run the same command once more; a second
 * failure is shown as it is.
 */

/** A death later than this is not the start-up race. */
export const OPENCODE_LOCK_WINDOW_MS = 10_000;
/** Long enough for the winner to finish migrating (it took ~1.5 s). */
export const OPENCODE_LOCK_RETRY_MS = 2_000;

const LOCK_DEATH = /database is locked|Failed query:\s*CREATE TABLE/i;

export interface LockDeath {
    exitCode: number | null;
    /** How long the process lived. */
    ranMs: number;
    /** Everything it printed, both streams. */
    output: string;
    /** This run was already the retry. */
    retried: boolean;
}

/** Milliseconds to wait before the one retry, or 0 when this is not the race. */
export function opencodeLockRetryDelay(d: LockDeath): number {
    if (d.retried || d.exitCode === 0 || d.ranMs > OPENCODE_LOCK_WINDOW_MS) { return 0; }
    return LOCK_DEATH.test(d.output || '') ? OPENCODE_LOCK_RETRY_MS : 0;
}

/** The line written into the run's record, so the retry is never invisible. */
export function opencodeLockRetryNote(output: string): string {
    const m = LOCK_DEATH.exec(output || '');
    return `\n\n---\n[X-329] OpenCode died at start-up on its data home's first-use lock`
        + `${m ? ` (${m[0]})` : ''} — retried once after ${OPENCODE_LOCK_RETRY_MS / 1000} s.\n\n`;
}
