/**
 * X-452 — A SILENT SESSION IS NOT STALLED WHILE IT WAITS ON ITS OWN WORK.
 *
 * The hook stream goes quiet for the whole length of a tool call, so silence
 * alone called a session "stalled" while it ran its own test suite under a ten
 * minute timeout, or sat in a wait the Console was already drawing purple.
 * Measured on two weeks of live-events.jsonl: 340 of 372 silences past the
 * threshold were a shell call the session itself was running (a test suite, a
 * wait loop), up to 12 minutes long.
 *
 * A silence is excused when the Console says the turn is blocked in a wait
 * (the card's purple, `turnWaitingOn`), or when the running call has a time
 * limit of its own the CLI enforces and that limit, plus a grace, has not run
 * out. Everything else past the threshold is a stall, as before. Pure.
 */
import { isWaitCall } from './turnWait';

/** What a running call itself allows: the CLI ends it at `limitMs`. */
export interface CallLimit { wait: boolean; limitMs: number }

const SHELLS = new Set(['Bash', 'PowerShell']);
/** The CLI's own default for a shell call given no timeout. */
const SHELL_DEFAULT_MS = 120_000;
/** TaskOutput's ceiling when it states none. */
const TASK_OUTPUT_MAX_MS = 600_000;
/** How long past its own limit a call may stay unanswered before it counts. */
export const STALL_GRACE_MS = 60_000;

/** The limit of a call the CLI times out by itself; undefined for every other tool. */
export function callLimitOf(name: string | undefined, input: Record<string, unknown> | undefined): CallLimit | undefined {
    if (!name) { return undefined; }
    const t = Number(input?.timeout);
    const own = Number.isFinite(t) && t > 0 ? t : 0;
    if (SHELLS.has(name)) { return { wait: isWaitCall(name, input), limitMs: own || SHELL_DEFAULT_MS }; }
    if (name === 'TaskOutput') { return { wait: isWaitCall(name, input), limitMs: own || TASK_OUTPUT_MAX_MS }; }
    return undefined;
}

export interface StallInput {
    status: string;
    silentMs: number;
    /** the running call's limit, read when it started */
    call?: CallLimit;
    /** the Console's word: its turn is blocked in a wait (the purple card) */
    hostWaiting?: boolean;
    /** the last thing the session said, to name a usage-limit wall */
    lastSaid?: string;
}

export interface StallVerdict { stalled: boolean; why: string }

const LIMIT_SAID = /\b(hit|reached) your (session |usage |weekly |daily )?limit\b|\busage limit reached\b/i;

export function stallVerdict(i: StallInput, thresholdMs: number): StallVerdict {
    if (i.status !== 'working' && i.status !== 'tool') { return { stalled: false, why: '' }; }
    if (!(thresholdMs > 0) || i.silentMs <= thresholdMs) { return { stalled: false, why: '' }; }
    if (i.hostWaiting) { return { stalled: false, why: 'waiting on its own work' }; }
    if (i.status === 'tool' && i.call && i.silentMs <= i.call.limitMs + STALL_GRACE_MS) {
        return {
            stalled: false,
            why: i.call.wait ? 'waiting on its own work'
                : `its command is still inside its own ${Math.round(i.call.limitMs / 60_000)} min limit`
        };
    }
    if (i.lastSaid && LIMIT_SAID.test(i.lastSaid)) { return { stalled: true, why: 'hit its usage limit' }; }
    return { stalled: true, why: '' };
}
