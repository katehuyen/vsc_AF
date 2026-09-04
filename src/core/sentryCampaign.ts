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

/**
 * How often an IDLING campaign looks again, in minutes, when nobody has said
 * otherwise. An empty backlog is a wait, so something has to notice the item
 * written tomorrow morning — and that something is the pump the farm already
 * runs, not a timer of the sentry's own.
 */
export const SENTRY_DEFAULT_POLL_MIN = 10;

/** The campaign as it is stored: what to do, plus the record of what was done. */
export interface SentryRecord extends SentryCampaign {
    id: string;
    /** the moment the user switched it on */
    startedAt: number;
    /** …and off, when they did */
    stoppedAt?: number;
    /** ‼️ X-177 — …and the moment they put it on HOLD, which is a different thing */
    pausedAt?: number;
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
    /**
     * ‼️ THE FAILURE BRAKE, WHICH IS NOT A ROUND BUDGET. The user refused a
     * round budget: a campaign that is working carries on for ever. But a
     * campaign whose sessions produce NOTHING, over and over, is a broken setup
     * opening empty sessions all night — and the quota never stops it, because
     * a session that fails instantly spends nothing. How many barren rounds in
     * a row end it; 0 switches the brake off. Absent = the setting's default.
     */
    failLimit?: number;
    /** barren rounds in a row. Wiped by the first round that achieves something. */
    failStreak?: number;
    /** why it stopped, when it was not simply switched off */
    stoppedWhy?: string;
    /**
     * ‼️ THE DIMENSIONS EVERY ROUND IS OPENED WITH. `permissionMode` is the one
     * that is not a nicety: an unattended headless session that stops to ask
     * permission is a session that never ends, on an account nobody is watching.
     * Absent means the fleet default, which is the user's to set.
     */
    permissionMode?: string;
    superpowers?: boolean;
    /**
     * ‼️ THE WORDS BUILT FOR A ROUND THAT WAS NOT OPENED YET.
     *
     * The verdict on a finished round and the sentence that answers it are
     * built the moment that round ends — but the round it was written for is
     * opened later whenever the plan said sleep (a quota wall) or idle (an
     * empty backlog). The tick that finally opens it has no finished session
     * behind it and so can build no words of its own, and without this the
     * campaign would fall back to its OPENING sentence: the next session sent
     * at the item the FIRST round was given, hours after that item closed.
     *
     * ‼️ IT IS BOUND TO THE CODE IT NAMES. Every continuation sentence spells
     * the item out (`{nextCode}`), so words written for an item that is no
     * longer at the top of the backlog are dropped rather than sent.
     */
    carry?: { prompt: string; code?: string; at: number };
    /**
     * ‼️ THE WORDS THE FIRST ROUND OPENS ON. Every template X-175 ships is
     * built on "the previous session", and the campaign's first round has no
     * previous session — so the opening sentence is the caller's, and it is
     * kept HERE rather than in a closure because a window that reloads before
     * the first round ever starts must still know what to say.
     */
    opening?: string;
}

/** What a caller asks for when they start one. */
export interface SentryAsk {
    project?: string;
    agent?: string;
    ceiling?: unknown;
    safetyBufferMin?: unknown;
    failLimit?: unknown;
    engine?: string;
    model?: string;
    permissionMode?: string;
    superpowers?: boolean;
    opening?: string;
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
    // ‼️ X-177 — A PAUSED CAMPAIGN STILL HOLDS THE SLOT. It is one the user is
    // standing over, not one they are finished with, and starting a second
    // underneath it would lose everything the paused one has worked out. Only
    // `stopped` stands aside.
    if (live && live.status === 'paused') {
        return `a campaign is paused on ${live.project} (as ${live.agent}) — the sentry runs one at a `
            + 'time, so resume that one or stop it before starting another';
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
    const failLimit = clamp(ask.failLimit, 0, 1000);
    return {
        id: `sc-${now.toString(36)}`,
        project: String(ask.project ?? '').trim(),
        agent: String(ask.agent ?? '').trim(),
        status: 'running',
        startedAt: now,
        ...(ceiling !== undefined ? { ceiling } : {}),
        ...(safetyBufferMin !== undefined ? { safetyBufferMin } : {}),
        ...(failLimit !== undefined ? { failLimit } : {}),
        ...(ask.engine ? { engine: String(ask.engine) } : {}),
        ...(ask.model ? { model: String(ask.model) } : {}),
        ...(ask.permissionMode ? { permissionMode: String(ask.permissionMode) } : {}),
        ...(ask.superpowers ? { superpowers: true } : {}),
        ...(String(ask.opening ?? '').trim() ? { opening: String(ask.opening).trim() } : {})
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
    delete rec.pausedAt;
    return rec;
}

/**
 * ‼️ X-177 — THE USER'S SWITCH, HELD. A pause of THIS campaign: the farm's
 * master switch stops every automation there is, and somebody who wants their
 * sentry to stand still for an hour should not have to switch the farm off to
 * get it.
 *
 * Nothing else is touched — the taken codes, the failure streak and above all
 * the words the last round earned (`carry`) are exactly where they were, which
 * is the whole difference between a pause and a stop-then-start. A stopped
 * campaign is not raised: stopped is a record nobody is coming back to.
 */
export function pauseSentry(rec: SentryRecord, now: number): SentryRecord {
    if (rec.status !== 'running') { return rec; }
    rec.status = 'paused';
    rec.pausedAt = now;
    return rec;
}

/**
 * …and released.
 *
 * ‼️ IT LOOKS AT ONCE. `wakeAt` is set to the moment of the resume rather than
 * left as it was: a campaign paused in the middle of its ten-minute poll — or
 * in the middle of a three-hour sleep whose accounts may since have reset —
 * would otherwise stand there doing nothing after the user pressed Resume,
 * which is the one thing a switch must never do.
 */
export function resumeSentry(rec: SentryRecord, now: number): SentryRecord {
    if (rec.status !== 'paused') { return rec; }
    rec.status = 'running';
    delete rec.pausedAt;
    rec.wakeAt = now;
    return rec;
}

/** Is a round of this campaign on the board, queued or running? */
export function sentryRunning(tasks: { status?: string; sentryOf?: string }[], id: string): boolean {
    return (tasks || []).some(t => !!t && t.sentryOf === id && pending(String(t.status ?? '')));
}

/**
 * ‼️ WHEN TO LOOK AGAIN — the whole of "no second scheduler".
 *
 * The farm already runs a pump; this is the question that pump asks. Three
 * rules, in this order:
 *
 *   · a campaign with a round ON THE BOARD is not due at all — that round
 *     ending is what drives the next one, and ticking underneath it would open
 *     a second session while the first is still spending;
 *   · a MEASURED sleep outranks the poll. A three-hour wall is waited out, not
 *     poked every ten minutes;
 *   · otherwise the poll, because an empty backlog is a WAIT: the item written
 *     tomorrow morning has to find the sentry still standing there. A campaign
 *     nobody has looked at yet (`lastAt` absent) is due immediately.
 */
export function sentryDue(
    rec: SentryRecord | undefined, running: boolean, pollMin: number, now: number
): boolean {
    if (!rec || rec.status !== 'running' || running) { return false; }
    const at = typeof rec.wakeAt === 'number'
        ? rec.wakeAt
        : (Number(rec.lastAt) || 0) + Math.max(1, pollMin) * 60 * 1000;
    return now >= at;
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
