import { AutomationState, gateBlock } from './automation';
import { nextResetAt, pickAccount, SlotUsage } from './accountUsage';
import { RETRY_DEFAULT_SAFETY_MIN } from './retry';

/**
 * X-176 — WHAT THE CAMPAIGN DOES NEXT, decided without starting anything.
 *
 * The sentry spends money: it opens sessions on real accounts, unattended, for
 * as long as the user leaves it on. So the DECISION lives here as a pure
 * function and the driver stays thin — every rule is settled for nothing,
 * instead of being discovered at three in the morning on somebody's quota.
 *
 * ‼️ NO SECOND SCHEDULER, WHICH THE ITEM IS EMPHATIC ABOUT. Permission is
 * `gateBlock` (the same master switch, pause and quiet hours every other
 * automation obeys), the sleep is a measured reset plus retry.ts's safety
 * buffer, and the account is `pickAccount` / `nextResetAt`. This file COMPOSES
 * them; it reimplements none of them, because a second copy of "may we act
 * right now" is how a paused farm comes to mean two different things.
 *
 * ‼️ ENGINE-AGNOSTIC. The decision never writes the name of an engine. An
 * engine that publishes no allowance leaves its accounts usable — not knowing
 * is not being blocked — and the sleep is computed only from `resetsAt` values
 * somebody really measured.
 *
 * ‼️ ONLY THE USER ENDS IT (their own call, 2026-09-04). There is no round
 * budget and no time budget: an empty backlog is a WAIT, not a finish, so a
 * code added tomorrow morning finds the sentry still standing there. The brakes
 * that remain are the automation gate, the ceiling and the quota itself.
 */

/** The five answers. Nothing else is ever returned. */
export type SentryAction = 'start' | 'sleep' | 'idle' | 'blocked' | 'stopped';

/**
 * Above this much of the five-hour window an account is not worth starting a
 * session on — it would end mid-item and leave the mess the sentry exists to
 * avoid. Stated rather than magic, and a campaign may set its own.
 */
export const SENTRY_DEFAULT_CEILING = 95;

/** The campaign itself — what the user set up and left running. */
export interface SentryCampaign {
    /** the project whose backlog it works through */
    project: string;
    /** the agent its sessions run as */
    agent: string;
    /** 'running' while the user has it on; anything else is stopped */
    status: string;
    /** rounds run so far — a RECORD, never a limit */
    rounds?: number;
    /** the five-hour percentage at or above which an account is a wall */
    ceiling?: number;
    /** minutes to wait past a reset before trying again */
    safetyBufferMin?: number;
    engine?: string;
    model?: string;
    /**
     * ‼️ X-207 — THE ACCOUNTS THIS CAMPAIGN IS ALLOWED TO SPEND, in the order
     * the user picked them. ABSENT is the old answer and stays the old answer:
     * every account of `engine`. That is not laziness about defaults — a record
     * written before this field existed must plan identically to the day it was
     * written, and the only way to guarantee that is for "no pool" to be a
     * distinct value rather than an empty list somebody has to interpret.
     *
     * ‼️ THE ORDER IS THE PRIORITY. `rotation: 'tiered'` walks engines in the
     * order they first appear here, so no second field states a preference the
     * list already states — two fields for one question disagree the first time
     * somebody reorders one of them.
     */
    pool?: string[];
    /**
     * ‼️ X-207 — HOW THE POOL IS WALKED. `free` (the default, and what every
     * campaign did before this) takes the most room anywhere in the pool;
     * `tiered` keeps to one engine until that whole engine is walled, and only
     * then crosses — which is the difference between "spend whatever is
     * cheapest" and "this is my main engine, use the others when it is out".
     */
    rotation?: 'free' | 'tiered';
}

export interface SentryInputs {
    campaign: SentryCampaign;
    /** the accounts this campaign may spend, as they were measured */
    usage: SlotUsage[];
    /** the automation gate's own state — the same one schedules obey */
    automation?: AutomationState;
    /** what `projects.backlog.next` picked; absent means the pile is empty */
    next?: { code: string; text: string; effort?: string };
    /** the words the round opens with — X-175 built them, this only carries them */
    prompt?: string;
    /** is a round of this campaign already running? */
    running?: boolean;
    now: number;
}

export interface SentryPlan {
    action: SentryAction;
    /** one line, always — a surface that can only say "waiting" is a surface nobody trusts */
    why: string;
    /** which rule decided it, so the reason can be grouped and counted */
    rule: string;
    /** the account to run on. Absent on a `start` means the MAIN sign-in. */
    slotId?: string;
    /** the moment to wake up, when there is one to name */
    wakeAt?: number;
    /** the words to open with */
    prompt?: string;
}

const MIN = 60 * 1000;

/** The one decision the campaign makes, over and over. */
export function planSentry(i: SentryInputs): SentryPlan {
    const c = i.campaign;
    const ceiling = typeof c.ceiling === 'number' ? c.ceiling : SENTRY_DEFAULT_CEILING;
    const buffer = typeof c.safetyBufferMin === 'number' ? c.safetyBufferMin : RETRY_DEFAULT_SAFETY_MIN;

    // ‼️ X-177 — PAUSED IS NOT STOPPED. A hold that belongs to this campaign
    // rather than to the whole farm: the master switch stops every automation
    // there is, and wanting the sentry to stand still for an hour is not
    // wanting that. The answer is `blocked` — the gate's own word for a pause —
    // because `stopped` is what a record nobody is coming back to says, and a
    // surface that could not tell the two apart would offer Start where Resume
    // belongs.
    if (c.status === 'paused') {
        return {
            action: 'blocked', rule: 'user-paused',
            why: 'the campaign is paused — it opens nothing until you resume it, and everything '
                + 'it had already worked out is waiting where it was'
        };
    }
    if (c.status !== 'running') {
        return {
            action: 'stopped', rule: 'user-stopped',
            why: 'the campaign is not running — only the user starts and stops it'
        };
    }

    // ‼️ SEQUENTIAL BY DESIGN. Concurrency can be added later precisely because
    // the account is a dimension of a session; it is not in this item.
    if (i.running) {
        return {
            action: 'idle', rule: 'one-at-a-time',
            why: 'a round of this campaign is already running — the sentry runs one session at a time'
        };
    }

    // The gate outranks the pile: a paused farm is paused whether or not there
    // is anything to take, and it says so in the gate's own words.
    const block = gateBlock(i.automation, new Date(i.now));
    if (block) {
        return {
            action: 'blocked', rule: `gate:${block.kind}`,
            why: `the automation gate says no — ${block.reason}`,
            ...(block.until ? { wakeAt: block.until } : {})
        };
    }

    // ‼️ AN EMPTY BACKLOG IS A WAIT. Ending here would mean a code written
    // tomorrow morning finds nothing standing.
    if (!i.next || !i.next.code) {
        return {
            action: 'idle', rule: 'nothing-to-take',
            why: 'there is no item left in the backlog to take — the campaign waits for one '
                + 'rather than ending, because only the user ends it'
        };
    }

    const prompt = String(i.prompt ?? '').trim();
    if (!prompt) {
        return {
            action: 'blocked', rule: 'no-prompt',
            why: 'there are no words to open the session with — a round is not started empty'
        };
    }

    // ‼️ NO CAPTURED ACCOUNTS IS NOT "NO WAY TO RUN". The main sign-in is the
    // ABSENCE of a slot (X-172), so a machine that has captured nothing still
    // works — it just cannot be told how much room is left.
    if (!i.usage.length) {
        return {
            action: 'start', rule: 'main-account', prompt,
            why: `no account is captured, so the round runs on the main sign-in — ${i.next.code} is next`
        };
    }

    /**
     * ‼️ X-207 — THE STRATEGY IS THE CAMPAIGN'S, and the pool is already the one
     * the user allowed: `sentryTick` filters it before this is called, so a slot
     * reaching here is a slot with permission. `pickAccount` decides only WHICH.
     */
    const pick = pickAccount(i.usage, {
        ceiling,
        ...(c.rotation ? { rotation: c.rotation } : {}),
        ...(c.engine ? { engine: c.engine } : {})
    });
    if (pick) {
        // ‼️ A ROUND THAT CROSSED ENGINES SAYS SO. It is the one fact a reader
        // cannot derive from the slot id, and it is the whole behaviour this
        // campaign was configured for — silence here would make the fallback
        // look like the ordinary turn.
        const crossed = !!c.engine && !!pick.engine
            && pick.engine.trim().toLowerCase() !== c.engine.trim().toLowerCase();
        return {
            action: 'start', rule: crossed ? 'engine-fallback' : 'has-room', slotId: pick.slotId, prompt,
            why: crossed
                ? `every ${c.engine} account is at or above ${ceiling}%, so ${i.next.code} falls back `
                    + `to ${pick.slotId} on ${pick.engine} rather than sleeping`
                : `${pick.slotId} has the most room left, so ${i.next.code} starts there`
        };
    }

    // Every account is walled. Sleeping is free — zero tokens, zero requests —
    // and it is only possible where somebody MEASURED a reset to wait for.
    const reset = nextResetAt(i.usage, ceiling, i.now);
    if (reset > 0) {
        return {
            action: 'sleep', rule: 'wait-for-reset', wakeAt: reset + buffer * MIN,
            why: `every account is at or above ${ceiling}% of its five-hour window — sleeping until `
                + `the earliest reset plus ${buffer} minute${buffer === 1 ? '' : 's'} of safety`
        };
    }

    return {
        action: 'blocked', rule: 'no-usable-account',
        why: 'no account can be used and none has a measured reset to wait for — they need '
            + 'signing in again'
    };
}
