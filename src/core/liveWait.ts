/**
 * U-148 — A TURN THAT ENDED WITH WORK STILL RUNNING BEHIND IT IS NOT YOUR TURN.
 *
 * When a turn ends while a background command it started is still running,
 * the CLI goes idle — and when the command finishes it opens a NEW turn on its
 * own to hand the result to the model. Nothing is waiting on the user. The hook
 * stream cannot tell the two endings apart (both are a `Stop`), so the host —
 * the Console, which holds the CLI's own `background_tasks_changed` list — is
 * asked, exactly as `pendingAskOf` is asked about a parked question.
 *
 * Pure, so both directions are decided in one place: `live.ts` applies it on
 * every hook event and on every read, and the host pokes it when its list moves.
 */
import type { LiveStatus } from './live';

/** What the host knows about one hosted session. */
export interface HostedWait {
    /** background commands the CLI still lists for it */
    tasks: number;
    /** a turn is running in the host right now */
    working: boolean;
}

/**
 * The status a resting session should show. Only the two resting statuses are
 * ever exchanged; everything else is the hook stream's to decide.
 *
 * - `waiting-input` with background work behind it → `waiting-task`.
 * - `waiting-task` whose list drained → `waiting-input`, UNLESS the host says a
 *   turn is running: that is the CLI's own turn delivering the result, and a
 *   card flashing "your turn" until its first hook lands is the lie this fixes.
 * - A parked question always wins: a turn waiting on an answer IS your turn.
 */
export function settleWait(status: LiveStatus, wait: HostedWait | undefined, asking: boolean): LiveStatus {
    const behind = !asking && !!wait && wait.tasks > 0;
    if (status === 'waiting-input' && behind) { return 'waiting-task'; }
    if (status === 'waiting-task' && !behind && !(wait && wait.working && !asking)) { return 'waiting-input'; }
    return status;
}
