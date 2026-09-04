import { SentryCampaign, SentryPlan } from './sentryRun';

/**
 * X-176 — THE CAMPAIGN AS A RECORD: what the user switched on, and what it did.
 *
 * `sentryRun.ts` decides what happens next; this is the thing the decision is
 * made ABOUT — the one part of the sentry that outlives a window. Pure: no
 * vscode, no fs, no clock beyond what is handed in. The manager owns the store
 * and the timer; this owns the shape and every rule about changing it.
 *
 * ‼️ THE STORED RECORD *IS* THE PLANNER'S INPUT. `SentryRecord extends
 * SentryCampaign`, so `planSentry({ campaign: record, … })` takes it exactly as
 * it comes off the disk. A mapping function between store and decision would be
 * one more place for "stopped" to come to mean "running".
 *
 * ‼️ WHETHER A ROUND IS GOING IS DERIVED FROM THE ROWS (`sentryRunning`), never
 * stored. A boolean here would be a second source of truth for a fact the task
 * board already owns, and its failure is the worst one this item has: a
 * campaign that believes it is still running a round that died with the window,
 * and so never starts another for as long as it lives.
 *
 * ‼️ ONE CAMPAIGN AT A TIME, which is not a limitation but the item's own scope
 * — the runner is SEQUENTIAL. A second campaign is refused by name rather than
 * queued, because "which campaign goes next" is a scheduling decision nobody
 * has made, and inventing one here would be a second scheduler.
 */

/** How many taken codes are kept. A campaign the user never stops runs for ever. */
export const SENTRY_TAKEN_KEEP = 50;

/** The campaign as it is stored: what to do, plus the record of what was done. */
export interface SentryRecord extends SentryCampaign {
    id: string;
    /** the moment the user switched it on */
    startedAt: number;
    /** …and off, when they did */
    stoppedAt?: number;
    /** the last plan, so a surface can say why nothing is happening right now */
    lastAction?: string;
    lastRule?: string;
    lastWhy?: string;
    lastAt?: number;
    /**
     * When a sleep ends. Held here rather than in a timer for M-3's reason: a
     * `setTimeout` is thrown away by the reload that this record survives.
     */
    wakeAt?: number;
    /** the codes it has taken, most recent last, capped at `SENTRY_TAKEN_KEEP` */
    taken?: string[];
    /** the row of the last round, so a surface can open it */
    lastTaskId?: string;
    lastRoundAt?: number;
}

/** What a caller asks for when they start one. */
export interface SentryAsk {
    project?: string;
    agent?: string;
    ceiling?: unknown;
    safetyBufferMin?: unknown;
    engine?: string;
    model?: string;
}

/** Is this row a round of that campaign, still owing an answer? */
function pending(status: string): boolean {
    return status === 'queued' || status === 'running';
}

/**
 * ‼️ AN UNREADABLE NUMBER IS NOT A SETTING.
 *
 * A ceiling of "soon" leaves the field ABSENT so the planner's own default
 * applies. A store that invented 95 of its own would make changing that default
 * a two-file job — which is to say a one-file job, done wrong.
 */
function clamp(v: unknown, lo: number, hi: number): number | undefined {
    if (v === undefined || v === null || v === '') { return undefined; }
    const n = Number(v);
    if (!Number.isFinite(n)) { return undefined; }
    return Math.min(hi, Math.max(lo, Math.round(n)));
}

/** Why this campaign cannot be started — in words, or nothing. */
export function refuseSentry(live: SentryRecord | undefined, ask: SentryAsk): string | undefined {
    if (!String(ask.project ?? '').trim()) {
        return 'a campaign works through a project backlog, so it needs a project — none was given';
    }
    if (!String(ask.agent ?? '').trim()) {
        return 'a campaign opens sessions as somebody, so it needs an agent — none was given';
    }
    if (live && live.status === 'running') {
        return `a campaign is already running on ${live.project} (as ${live.agent}) — the sentry runs `
            + 'one session at a time, so stop that one before starting another';
    }
    return undefined;
}

/** The record for a campaign the user has just switched on. */
export function newSentry(ask: SentryAsk, now: number): SentryRecord {
    const ceiling = clamp(ask.ceiling, 1, 100);
    const safetyBufferMin = clamp(ask.safetyBufferMin, 0, 24 * 60);
    return {
        id: `sc-${now.toString(36)}`,
        project: String(ask.project ?? '').trim(),
        agent: String(ask.agent ?? '').trim(),
        status: 'running',
        startedAt: now,
        ...(ceiling !== undefined ? { ceiling } : {}),
        ...(safetyBufferMin !== undefined ? { safetyBufferMin } : {}),
        ...(ask.engine ? { engine: String(ask.engine) } : {}),
        ...(ask.model ? { model: String(ask.model) } : {})
    };
}

/**
 * The user's switch, off. The record is kept rather than deleted: what it took
 * and why it stopped is the only history of an unattended night.
 */
export function stopSentry(rec: SentryRecord, now: number): SentryRecord {
    rec.status = 'stopped';
    rec.stoppedAt = now;
    delete rec.wakeAt;
    return rec;
}

/** Is a round of this campaign on the board, queued or running? */
export function sentryRunning(tasks: { status?: string; sentryOf?: string }[], id: string): boolean {
    return (tasks || []).some(t => !!t && t.sentryOf === id && pending(String(t.status ?? '')));
}

/**
 * Keep the last decision on the record.
 *
 * ‼️ A PLAN WITH NO WAKE TIME CLEARS THE OLD ONE. Left behind, a `wakeAt` from
 * an hour ago is a surface telling the user the sentry wakes at a time that has
 * already gone by — the exact stale fact this record exists to prevent.
 */
export function noteSentryPlan(rec: SentryRecord, plan: SentryPlan, now: number): SentryRecord {
    rec.lastAction = plan.action;
    rec.lastRule = plan.rule;
    rec.lastWhy = plan.why;
    rec.lastAt = now;
    if (typeof plan.wakeAt === 'number') { rec.wakeAt = plan.wakeAt; } else { delete rec.wakeAt; }
    return rec;
}

/**
 * A round was opened on a code.
 *
 * The COUNT is never capped — it is the honest number of sessions this campaign
 * has spent, and a surface that rounds it down is lying about money. Only the
 * list of codes is trimmed, because that is a convenience.
 */
export function noteSentryRound(rec: SentryRecord, code: string, taskId: string, now: number): SentryRecord {
    rec.rounds = (Number(rec.rounds) || 0) + 1;
    const taken = Array.isArray(rec.taken) ? rec.taken : [];
    taken.push(code);
    rec.taken = taken.length > SENTRY_TAKEN_KEEP ? taken.slice(-SENTRY_TAKEN_KEEP) : taken;
    rec.lastTaskId = taskId;
    rec.lastRoundAt = now;
    return rec;
}
