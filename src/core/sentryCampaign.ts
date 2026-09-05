import { SentryCampaign, SentryPlan } from './sentryRun';
import type { LeaderBudgetState, LeaderCaps } from './sentryLeader';
import { Condition, PolicyFacts, PRESETS, presetConditions, SentryPolicy } from './sentryPolicy';

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
    /**
     * ‼️ X-191 — WHAT THE LEADER HAS ALREADY SPENT, and how many of its turns
     * failed in a row. It lives on the RECORD rather than in a timer for the
     * same reason `wakeAt` does: a reload throws a timer away and this has to
     * survive one, or a restart hands the campaign a fresh daily budget it has
     * already spent.
     */
    leader?: LeaderBudgetState;
    /**
     * ‼️ X-190 — WHEN THE LEADER WAKES. Absent = the mechanical preset, which
     * is the empty condition set: no condition, no leader, no tokens. This is
     * the switch itself, not a mode flag — the three modes are three presets
     * over this one field.
     */
    policy?: SentryPolicy;
    /**
     * ‼️ X-194 — WHAT THE LAST ROUND MEASURED, kept so a surface can put each
     * field's CURRENT reading on the condition that asks about it. Without it
     * the editor asks the user to write rules against numbers they cannot see,
     * and the round's own facts are thrown away the moment the verdict is read.
     *
     * The whole facts object rather than a display copy: `sentryPayload` derives
     * the readings from it with `factsSnapshot` and `sentry.probe` re-evaluates
     * a draft against it, and two stored shapes would be two answers to one
     * question. `output` is already a 4 KB tail where it is measured.
     */
    lastFacts?: PolicyFacts;
    /** the leash on the leader, where this campaign overrides the settings */
    leaderCaps?: Partial<LeaderCaps>;
    /** why it stopped, when it was not simply switched off */
    stoppedWhy?: string;
    /**
     * ‼️ X-178 — THE SIGN-INS THIS CAMPAIGN HAS ALREADY REPORTED AS FALLEN.
     *
     * A rejected account does not stop the campaign — `slotIsUsable` refuses it
     * and the rest carry the work — so the only thing that CAN go wrong is
     * nobody being told. This is what turns "told" into "told once": a campaign
     * that runs for three days would otherwise post the same alert every poll,
     * and an alert that repeats is an alert nobody reads. Cleared as each slot
     * answers again, so the second fall is news as well.
     */
    downSlots?: string[];
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
    /**
     * ‼️ X-194 — WHICH MODE, ASKED FOR AT THE START.
     *
     * MEASURED: the record has had `policy` since X-190 and the round reads it,
     * but nothing could SET it — so every campaign anybody could actually start
     * fell to the mechanical default and the leader X-191 built never woke.
     *
     * The three modes are not three code paths: they are one condition set with
     * three fillings, so asking for a mode is naming a preset and letting the
     * dictionary fill it. `conditions` given by hand win, and the preset is kept
     * beside them so a surface can say what they were edited FROM.
     */
    preset?: string;
    conditions?: Condition[];
    /**
     * ‼️ X-194 — THE LEADER'S LEASH, FOR THIS CAMPAIGN.
     *
     * MEASURED, like the policy before it: `leaderCaps` has been on the record
     * since X-191 and `leaderCapsFor` has read it, but nothing anywhere could
     * WRITE one — so every campaign ran the leader on the machine-wide settings
     * and a campaign nobody wanted to spend on could not be given a smaller
     * purse without changing it for all of them.
     *
     * Flat rather than a nested object because these travel over `sentry.start`,
     * where an agent writes `leaderDailyUsd=5` on a command line and a nested
     * shape would need a file. Absent means the setting still decides.
     */
    leaderModel?: string;
    leaderDailyUsd?: unknown;
    leaderMaxUsd?: unknown;
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
    const policy = policyOf(ask);
    const leaderCaps = leaderCapsOf(ask);
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
        ...(String(ask.opening ?? '').trim() ? { opening: String(ask.opening).trim() } : {}),
        ...(policy ? { policy } : {}),
        ...(leaderCaps ? { leaderCaps } : {})
    };
}

/**
 * ‼️ MONEY IS NOT ROUNDED. `clamp` above rounds because a percentage and a
 * minute count are whole numbers; a per-turn ceiling of $0.25 rounded to $0
 * would switch the leader off for ever and look like a figure the user chose.
 */
function money(v: unknown, hi: number): number | undefined {
    if (v === undefined || v === null || v === '') { return undefined; }
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) { return undefined; }
    return Math.min(hi, n);
}

/**
 * ‼️ ASKING FOR NOTHING IS NOT ASKING FOR ZERO. A campaign with no caps of its
 * own leaves `leaderCaps` ABSENT, so `leaderCapsFor` falls through to the
 * settings and then to the defaults — which is what every campaign started
 * before this existed did. Writing a purse nobody chose would be this function
 * deciding something the user did not, and a zero purse is a leader that never
 * wakes: the loudest possible way to fail silently.
 */
function leaderCapsOf(ask: SentryAsk): Partial<LeaderCaps> | undefined {
    const model = String(ask.leaderModel ?? '').trim();
    const dailyUsd = money(ask.leaderDailyUsd, 10000);
    const maxUsd = money(ask.leaderMaxUsd, 10000);
    const caps: Partial<LeaderCaps> = {
        ...(model ? { model } : {}),
        ...(dailyUsd !== undefined ? { dailyUsd } : {}),
        ...(maxUsd !== undefined ? { maxUsd } : {})
    };
    return Object.keys(caps).length ? caps : undefined;
}

/**
 * ‼️ A PRESET NOBODY KNOWS IS REFUSED BY NAME. Falling back to mechanical would
 * turn a night of thinking into a night of templates and tell no one — the same
 * silence X-190 refuses for an unknown FIELD, at the other end of the same
 * dictionary.
 *
 * Asking for no mode at all is not an error and does not invent one: the round
 * already has its own default, and writing a policy nobody chose would be this
 * function deciding something the user did not.
 */
function policyOf(ask: SentryAsk): SentryPolicy | undefined {
    const preset = String(ask.preset ?? '').trim();
    const given = Array.isArray(ask.conditions) ? ask.conditions : undefined;
    if (!preset && !given) { return undefined; }
    if (preset && !PRESETS.some(p => p.id === preset)) {
        throw new Error(`"${preset}" is not a sentry mode — the presets are `
            + `${PRESETS.map(p => p.id).join(', ')}. Pass conditions of your own to go beyond them.`);
    }
    return {
        ...(preset ? { preset } : {}),
        conditions: given ?? presetConditions(preset)
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
