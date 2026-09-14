import { RoundWhy } from './sentryWhy';
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
    /**
     * ‼️ X-191 — WHAT THE LEADER DECIDED, when one was woken.
     *
     * Deliberately NARROW. The leader may replace the WORDS, pick the ACCOUNT,
     * and say WAIT. It may do nothing else, and it reaches nothing else: every
     * rule this driver already applies — the user's hand, the failure brake, the
     * automation gate, the quota wall — is decided before this is consulted or
     * after it, never by it. A leader that could stop the night is a worse
     * failure mode than a leader that is occasionally wrong.
     *
     * Absent, or carrying no usable prompt, leaves the template in charge.
     */
    leader?: { prompt?: string; account?: string | null; hold?: boolean; why?: string };
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
    /**
     * ‼️ X-195 — the account of why these words. Built where the verdict and
     * the leader's outcome are both in hand, and carried to the row so it
     * outlives the closure that made it.
     */
    why?: RoundWhy;
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
 * Three ways, and counting only the first would miss the loop that actually
 * burns a night: a run the engine reported as SUCCESSFUL which produced no
 * turn and left nothing behind is exactly as barren as one that crashed, and
 * it is the shape a misconfigured agent takes.
 *
 * ‼️ X-307 — THE THIRD WAY, MEASURED ON A LIVE CAMPAIGN. A round whose session
 * DID take a turn — it answered, in one sentence, that it was not allowed to
 * write — is not `nothing-to-continue`, because something was attempted. It
 * reached `hit-the-wall` instead, which the brake did not count, so the
 * campaign rediagnosed the same item and opened the same round again, four
 * times, at $0.08 each, and would have run until morning.
 *
 * So the wall a session walks into ON ITS OWN, having left no trace anywhere
 * that was looked at, counts. The two guards that keep this off honest work:
 * `wall-limit` is excluded (a spent plan window is not the campaign's fault
 * and reopens by itself), and `left` is `nothing` only when all three traces
 * were really measured — an unmeasured fact reads `unknown` and never brakes.
 */
function barren(fin: FinishedRound, d: SessionDiagnosis | undefined): boolean {
    if (fin.status === 'cancelled') { return false; }
    if (fin.status === 'failed' || d?.outcome === 'nothing-to-continue') { return true; }
    return d?.outcome === 'hit-the-wall' && d.rule === 'wall-unfinished' && d.left === 'nothing';
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
    // ‼️ …BUT A WAIT IS NOT A MOVE. `backlog.next` gives nothing while every
    // remaining item is XL or waiting on an unfinished ⛔; that is the campaign
    // waiting, and it says nothing about whether the sentence still fits. Only
    // a DIFFERENT item drops it.
    if (k.code && next?.code && k.code !== next.code) { return undefined; }
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
    const built = fin && diagnosis
        ? buildNextPrompt({
            diagnosis,
            next: i.next,
            handoverPath: i.handoverPath,
            project: i.project,
            repos: (fin.facts.repos || []).map(r => r.path),
            assist: i.assist
        }, i.templates)
        : undefined;

    // ‼️ X-191 — THE LEADER'S OWN WORDS OUTRANK THE TEMPLATE, and say so.
    //
    // The template is still BUILT, and its `vars`, `when` and `unfilled` survive
    // on the record — a surface has to be able to show what the leader replaced,
    // or "the leader wrote this" is an unfalsifiable claim. Only the sentence
    // that actually opens the session changes.
    const spoken = String(i.leader?.prompt ?? '').trim();
    const words = built && spoken
        ? { ...built, prompt: spoken, templateId: 'leader', source: 'leader' as const }
        : built;

    const streak = fin
        ? (barren(fin, diagnosis) ? (Number(c.failStreak) || 0) + 1 : 0)
        : (Number(c.failStreak) || 0);
    // Freshly built words replace anything carried; with none, whatever an
    // earlier step left behind stands — and if THAT no longer fits, nothing
    // does, which is how a stale sentence leaves the record instead of living
    // on it for ever.
    // ‼️ …AND WORDS BUILT WITH NO ITEM NAME NOTHING: every continuation
    // template spells the next item out, so a sentence built while the backlog
    // had nothing to give carries an EMPTY code, and sent later it would tell a
    // paid session to take "the next item: ". The one that names an item stands.
    const carry = words && i.next
        ? { prompt: words.prompt, code: i.next.code }
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
        // ‼️ X-307 — a brake that only says "nothing" leaves the user to find
        // out why by reading four identical transcripts. The no-trace wall has
        // one overwhelmingly common cause, so it is named here.
        const trace = diagnosis?.outcome === 'hit-the-wall' && diagnosis.left === 'nothing'
            ? ' Each session answered and left no trace at all, which is usually a permission or a '
            + 'working-directory mismatch: an unattended round writing outside its own cwd needs '
            + 'bypassPermissions, because acceptEdits approves nothing out there.'
            : '';
        const why = `${streak} round${streak === 1 ? '' : 's'} in a row produced nothing — the campaign `
            + 'stops rather than opening more empty sessions.' + trace + ' Fix what is failing and start it '
            + `again, or set the failure brake to 0 to switch it off (it is ${limit}).`;
        return { ...base, plan: { action: 'stopped', rule: 'fail-streak', why }, stop: why };
    }

    // ---- and then the ordinary decision -----------------------------------
    const prompt = words ? words.prompt : (carry?.prompt ?? String(i.opening ?? ''));

    // ‼️ X-191 — THE LEADER MAY SAY WAIT, and waiting is not finishing. It is
    // `idle`, the same standing-still the driver already has: the campaign is
    // alive, the words it wrote are carried, and the next poll asks again.
    // Reached HERE, after the user's hand and the failure brake, so it can
    // never keep a campaign that should have stopped alive.
    if (i.leader?.hold === true) {
        return {
            ...base,
            plan: {
                action: 'idle', rule: 'leader-hold',
                why: String(i.leader.why ?? '').trim() || 'the leader decided this round should wait'
            }
        };
    }

    const plan = planSentry({
        campaign: c, usage: i.usage, automation: i.automation,
        next: i.next, prompt, running: i.running, now: i.now
    });
    if (plan.action !== 'start' || !i.next) { return { ...base, plan }; }
    // The account the leader named, only when it named one and only on a round
    // that is actually starting — `planSentry` has already refused every slot
    // that is walled, and a leader cannot spend an account the quota rules out.
    const chosen = String(i.leader?.account ?? '').trim();
    const slotId = chosen && i.usage.some(u => u.slotId === chosen) ? chosen : plan.slotId;

    /**
     * ‼️ X-207 — THE ROUND OPENS ON THE CHOSEN ACCOUNT'S ENGINE.
     *
     * This line used to be `c.engine` unconditionally, which was correct for
     * exactly as long as a pool could hold only one engine. With a cross-engine
     * pool the same line opens a Claude session pointed at a Codex sign-in: the
     * round dies, and it looks like a broken account rather than a round built
     * wrong. The account already carries its engine (`SlotUsage.engine`), so the
     * fact is read from the choice rather than assumed from the campaign.
     *
     * ‼️ AND THE MODEL IS DROPPED WHEN THE ENGINE CHANGES. A model name belongs
     * to an engine — `opus` means nothing to Codex — so carrying the campaign's
     * model across would turn a working fallback into a round that fails on its
     * first line. Absent means that engine's own default, which is the only
     * answer this code has any business giving.
     */
    const slotEngine = String(i.usage.find(u => u.slotId === slotId)?.engine ?? '').trim();
    const roundEngine = slotEngine || String(c.engine ?? '').trim();
    const sameEngine = !c.engine || !roundEngine
        || roundEngine.toLowerCase() === String(c.engine).trim().toLowerCase();

    const n = (Number(c.rounds) || 0) + 1;
    return {
        ...base,
        plan,
        round: {
            code: i.next.code,
            round: n,
            title: sentryRoundTitle(n, i.next.code),
            prompt: plan.prompt || prompt,
            ...(slotId ? { slotId } : {}),
            ...(roundEngine ? { engine: roundEngine } : {}),
            ...(c.model && sameEngine ? { model: c.model } : {}),
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
