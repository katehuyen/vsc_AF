import { RunProgress } from './retry';
import { SlotUsage } from './accountUsage';
import { AutomationState } from './automation';
import {
    DiagnosisPolicy, diagnoseSession, SessionDiagnosis, SessionFacts
} from './sessionDiagnosis';
import {
    buildNextPrompt, ModelAssist, NextPrompt, SentryTemplate
} from './sentryPrompt';
import { planSentry, SentryPlan } from './sentryRun';
import {
    noteSentryPlan, noteSentryRound, SentryRecord, stopSentry
} from './sentryCampaign';

/**
 * X-176 — THE DRIVER: one round ends, the next one is decided.
 *
 * The whole loop the item asks for, with nothing in it that touches a disk:
 * MEASURE (the caller's job) → diagnose (X-174) → words (X-175) → plan
 * (`sentryRun`) → the row to create. Pure, so every rule is settled for free
 * rather than at three in the morning on somebody's quota; the manager keeps
 * the store, the fs and the clock.
 *
 * ‼️ WHAT NOBODY MEASURED IS NOT A MEASUREMENT. `finished.facts` reaches
 * `diagnoseSession` exactly as it was handed over. The driver fills no gaps: a
 * missing `answerFiles` stays `undefined` and lands in `unknown`, where an
 * empty one is evidence. A driver that defaulted them would manufacture a
 * verdict and then open a paid session on it.
 *
 * ‼️ THE USER'S HAND OUTRANKS EVERY RULE. Cancelling the one round the sentry
 * has running is the user saying stop, so the campaign stops. That is not the
 * machine ending a campaign — the machine is READING the switch, and the safe
 * side of the ambiguity is the one that does not spend money unattended.
 *
 * ‼️ AND THE FAILURE BRAKE IS NOT A ROUND BUDGET. The user refused a round
 * budget; a working campaign runs until they end it. But a campaign whose
 * sessions produce NOTHING, over and over, is a broken setup opening empty
 * sessions all night, and no quota stops it because a session that fails
 * instantly spends nothing. So: barren rounds IN A ROW, wiped by the first
 * round that achieves something, with the limit a setting the user owns
 * (0 = no brake).
 */

/** How many barren rounds in a row end a campaign, when nobody has said otherwise. */
export const SENTRY_DEFAULT_FAIL_LIMIT = 3;

/** The round that just ended, and what was measured about the session it ran in. */
export interface FinishedRound {
    /** the row's final status, as the board recorded it */
    status: string;
    /** the code the round was opened on */
    code?: string;
    taskId?: string;
    /** ‼️ measured facts only — never filled in on the caller's behalf */
    facts: SessionFacts;
}

export interface SentryStepInputs {
    campaign: SentryRecord;
    /** absent on the campaign's FIRST round: nothing preceded it */
    finished?: FinishedRound;
    /** the accounts this campaign may spend, as they were measured */
    usage: SlotUsage[];
    /** the automation gate's own state — the same one every schedule obeys */
    automation?: AutomationState;
    /** what `projects.backlog.next` picked */
    next?: { code: string; text: string; effort?: string };
    /** the templates in force (`resolveSentryTemplates`); built-ins when absent */
    templates?: SentryTemplate[];
    /**
     * ‼️ THE FIRST ROUND'S WORDS, which have to come from the caller: every
     * template is built on "the previous session", and the first round has no
     * previous session. `planSentry` refuses a wordless start rather than
     * opening an empty one.
     */
    opening?: string;
    policy?: Partial<DiagnosisPolicy>;
    /** the project's name, for the words */
    project?: string;
    handoverPath?: string;
    /** what a cheap model turn cost, if the caller made one */
    assist?: ModelAssist;
    /** is a round of this campaign already on the board? (`sentryRunning`) */
    running?: boolean;
    now: number;
}

/** The row to create — every dimension of it, and nothing about how to create it. */
export interface SentryRoundSpec {
    /** the backlog code this round is opened on */
    code: string;
    /** which round of the campaign this is, counting from 1 */
    round: number;
    title: string;
    prompt: string;
    /** the account to run on. Absent = the MAIN sign-in (X-172). */
    slotId?: string;
    engine?: string;
    model?: string;
    permissionMode?: string;
    superpowers?: boolean;
}

export interface SentryStep {
    plan: SentryPlan;
    /** the verdict on the round that ended. Absent on the first round. */
    diagnosis?: SessionDiagnosis;
    /** how the next session's words were built. Absent on the first round. */
    words?: NextPrompt;
    /** the row to create, when the plan said start */
    round?: SentryRoundSpec;
    /** the campaign is being switched off, and why */
    stop?: string;
    /** barren rounds in a row, INCLUDING the one that just ended */
    failStreak?: number;
    /**
     * ‼️ THE WORDS TO KEEP FOR A ROUND THAT IS NOT OPENED YET — see `carryOn`.
     * Present whenever there are words worth keeping, INCLUDING on a step that
     * plans a round: it is the row really existing that spends them, and a row
     * that could not be created must not cost the sentence.
     */
    carry?: { prompt: string; code?: string };
}

/**
 * The title a sentry round wears on the board. One function because the board,
 * the surface and the tests all name the same row, and three spellings of it
 * would make a campaign read as N unrelated tasks.
 */
export function sentryRoundTitle(round: number, code: string): string {
    return `Sentry R${round} · ${code}`;
}

/** The brake in force for this campaign: its own, or the default. */
function failLimitOf(c: SentryRecord): number {
    return typeof c.failLimit === 'number' ? c.failLimit : SENTRY_DEFAULT_FAIL_LIMIT;
}

/**
 * Did this round achieve nothing?
 *
 * Two ways, and counting only the first would miss the loop that actually
 * burns a night: a run the engine reported as SUCCESSFUL which produced no
 * turn and left nothing behind is exactly as barren as one that crashed, and
 * it is the shape a misconfigured agent takes.
 */
function barren(fin: FinishedRound, d: SessionDiagnosis | undefined): boolean {
    if (fin.status === 'cancelled') { return false; }
    return fin.status === 'failed' || d?.outcome === 'nothing-to-continue';
}

/**
 * ‼️ THE WORDS A PREVIOUS STEP LEFT BEHIND, if they still fit the work in hand.
 *
 * A sleep or a wait is crossed by a tick with NO finished session behind it, so
 * that tick can build no sentence of its own; without the carried one it would
 * fall back to the campaign's opening words and send the next session at the
 * item the FIRST round was given. But every continuation sentence names its
 * item by code, so a sentence written for something that is no longer next is
 * worse than none: it is dropped, and the opening words stand in.
 */
function carryOn(
    c: SentryRecord, next?: { code: string }
): { prompt: string; code?: string } | undefined {
    const k = c.carry;
    if (!k || !String(k.prompt ?? '').trim()) { return undefined; }
    if (k.code && k.code !== next?.code) { return undefined; }
    return { prompt: k.prompt, ...(k.code ? { code: k.code } : {}) };
}

/** One turn of the campaign's loop. Reads nothing, starts nothing, costs nothing. */
export function sentryStep(i: SentryStepInputs): SentryStep {
    const c = i.campaign;
    const fin = i.finished;

    // ---- the verdict on what just ended, and the words it produces ---------
    // Free, and reached even when nothing will be started: a surface that can
    // say "the last round closed X-176" while the farm is paused is worth more
    // than one that only says "paused".
    const diagnosis = fin ? diagnoseSession(fin.facts, i.policy) : undefined;
    const words = fin && diagnosis
        ? buildNextPrompt({
            diagnosis,
            next: i.next,
            handoverPath: i.handoverPath,
            project: i.project,
            repos: (fin.facts.repos || []).map(r => r.path),
            assist: i.assist
        }, i.templates)
        : undefined;

    const streak = fin
        ? (barren(fin, diagnosis) ? (Number(c.failStreak) || 0) + 1 : 0)
        : (Number(c.failStreak) || 0);
    // Freshly built words replace anything carried; with none, whatever an
    // earlier step left behind stands — and if THAT no longer fits, nothing
    // does, which is how a stale sentence leaves the record instead of living
    // on it for ever.
    const carry = words
        ? { prompt: words.prompt, ...(i.next ? { code: i.next.code } : {}) }
        : carryOn(c, i.next);
    const base = { diagnosis, words, failStreak: streak, ...(carry ? { carry } : {}) };

    // ---- the user's hand, above every other rule ---------------------------
    if (fin && fin.status === 'cancelled' && c.status === 'running') {
        const why = 'the round the sentry was running was cancelled by hand — a campaign runs one '
            + 'session at a time, so cancelling that round is the user saying stop';
        return { ...base, plan: { action: 'stopped', rule: 'round-cancelled', why }, stop: why };
    }

    // ---- the brake, which the quota cannot apply for us --------------------
    const limit = failLimitOf(c);
    if (limit > 0 && streak >= limit && c.status === 'running') {
        const why = `${streak} round${streak === 1 ? '' : 's'} in a row produced nothing — the campaign `
            + 'stops rather than opening more empty sessions. Fix what is failing and start it again, '
            + `or set the failure brake to 0 to switch it off (it is ${limit}).`;
        return { ...base, plan: { action: 'stopped', rule: 'fail-streak', why }, stop: why };
    }

    // ---- and then the ordinary decision -----------------------------------
    const prompt = words ? words.prompt : (carry?.prompt ?? String(i.opening ?? ''));
    const plan = planSentry({
        campaign: c, usage: i.usage, automation: i.automation,
        next: i.next, prompt, running: i.running, now: i.now
    });
    if (plan.action !== 'start' || !i.next) { return { ...base, plan }; }

    const n = (Number(c.rounds) || 0) + 1;
    return {
        ...base,
        plan,
        round: {
            code: i.next.code,
            round: n,
            title: sentryRoundTitle(n, i.next.code),
            prompt: plan.prompt || prompt,
            ...(plan.slotId ? { slotId: plan.slotId } : {}),
            ...(c.engine ? { engine: c.engine } : {}),
            ...(c.model ? { model: c.model } : {}),
            ...(c.permissionMode ? { permissionMode: c.permissionMode } : {}),
            ...(c.superpowers ? { superpowers: true } : {})
        }
    };
}

/**
 * Write what the step decided onto the record.
 *
 * One function rather than four lines at the manager's call site: the rule
 * "a round counts once the ROW exists" is the sort that gets half-applied when
 * it lives in a place no test can reach.
 */
export function applySentryStep(
    rec: SentryRecord, step: SentryStep, taskId: string | undefined, now: number
): SentryRecord {
    noteSentryPlan(rec, step.plan, now);
    if (typeof step.failStreak === 'number') {
        if (step.failStreak > 0) { rec.failStreak = step.failStreak; } else { delete rec.failStreak; }
    }
    // ‼️ A ROUND IS COUNTED WHEN THERE IS A ROW TO COUNT. Counting the PLAN
    // would let a campaign report sessions it never opened, on a machine where
    // the row failed to be created.
    if (step.round && taskId) { noteSentryRound(rec, step.round.code, taskId, now); }
    // ‼️ …AND THE SAME MOMENT SPENDS THE WORDS. A row that really exists is
    // carrying them now; anything else — a sleep, a wait, a row that could not
    // be created — leaves them on the record for the tick that opens the round.
    if (step.round && taskId) { delete rec.carry; }
    else if (step.carry) { rec.carry = { ...step.carry, at: now }; }
    else { delete rec.carry; }
    if (step.stop) {
        stopSentry(rec, now);
        rec.stoppedWhy = step.stop;
    }
    return rec;
}

/** Re-exported so a caller wiring the driver needs one import, not five. */
export type { RunProgress, SessionFacts, SessionDiagnosis };
