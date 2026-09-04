import { SlotUsage, slotIsUsable } from './accountUsage';

/**
 * X-178 — THE TWO WAYS AN UNATTENDED CAMPAIGN DIES QUIETLY.
 *
 * The campaign's loop is driven by rounds ENDING: `sentryDue` is deliberately
 * false while one is on the board, because ticking underneath a running round
 * would open a second session while the first is still spending. That leaves
 * exactly one state nothing in the system can recover from — a round that never
 * ends. An unattended session parked on a permission prompt is the shape it
 * takes (K-22: a session CAN stop and ask), and the quota never breaks the
 * deadlock, because a session that is waiting spends nothing.
 *
 * And the other one: a sign-in that falls over at two in the morning. That half
 * already WORKS — `slotIsUsable` refuses an expired slot and `mostRoom` picks
 * from the rest, so one account falling has never stopped the campaign. What
 * was missing is that nobody was told, which is the same failure in slow
 * motion: the user finds out in the morning by wondering why one account was
 * never touched.
 *
 * Both decisions are PURE and live here. The manager kills the process, the
 * host posts the notice; neither of them decides anything.
 *
 * ‼️ AND NOTHING IS ENDED ON NO EVIDENCE — the rule the whole sentry family is
 * built on. A round with no moment to measure from is UNMEASURED, not stalled,
 * and it is left alone.
 */

/**
 * How long a round may say nothing before the watchdog ends it, when nobody has
 * said otherwise. Long enough that a genuinely thinking turn is never touched
 * (measured turns on this fleet run to a few minutes), short enough that a
 * night is not lost to one parked prompt.
 */
export const SENTRY_DEFAULT_STALL_MIN = 45;

export interface StallInputs {
    /** the round on the board, as the board has it */
    round: { id: string; status: string; startedAt?: number };
    /**
     * the newest moment anything was seen from this round — a line of output, a
     * bound transcript, a turn. Absent means nothing has been seen since it
     * started, which is a different statement from "it is silent".
     */
    lastActivityAt?: number;
    /** minutes of silence that end it; 0 or less switches the watchdog off */
    limitMin: number;
    now: number;
}

export interface StallVerdict {
    stalled: boolean;
    /** how long the silence has lasted, in ms; -1 when there was nothing to measure */
    quietMs: number;
    /** one line, always — the reason goes on the row and into the campaign's record */
    why: string;
}

const MIN = 60 * 1000;

/** Has this round gone quiet for longer than the campaign allows? */
export function stalledRound(i: StallInputs): StallVerdict {
    const limit = Number(i.limitMin) || 0;
    if (limit <= 0) {
        return { stalled: false, quietMs: -1, why: 'the watchdog is switched off for this campaign' };
    }
    if (i.round.status !== 'running') {
        // A queued round is waiting for the gate or the queue — that is the farm
        // holding it, not the session going quiet, and killing it would be the
        // watchdog undoing a rule it knows nothing about.
        return { stalled: false, quietMs: -1, why: 'the round is not running yet — nothing to watch' };
    }
    // The NEWEST of the two: a round that started an hour ago and printed a
    // line a minute ago is alive, and a round nobody has heard from since it
    // started is measured from its start rather than from nothing.
    const seen = Math.max(Number(i.round.startedAt) || 0, Number(i.lastActivityAt) || 0);
    if (seen <= 0) {
        return {
            stalled: false, quietMs: -1,
            why: 'nothing about this round has been measured yet, so there is nothing to call silence'
        };
    }
    const quietMs = Math.max(0, i.now - seen);
    if (quietMs < limit * MIN) {
        return { stalled: false, quietMs, why: `last seen ${Math.round(quietMs / MIN)} min ago` };
    }
    return {
        stalled: true, quietMs,
        why: `nothing has come out of this round for ${Math.round(quietMs / MIN)} min (the limit is `
            + `${limit}) — an unattended session that stops to ask is a session that never ends, so `
            + 'it is ended here and the campaign takes the next round'
    };
}

export interface SlotHealth {
    /** slots nobody can use until they are signed in again */
    down: string[];
    /** …of those, the ones the user has not been told about yet */
    newlyDown: string[];
    /** slots that were down and answer again — the alarm re-arms for them */
    recovered: string[];
    /**
     * ‼️ IS THERE ANY WAY LEFT TO RUN AT ALL. A slot at its ceiling does NOT
     * count against this: a wall comes back by itself and the campaign sleeps
     * through it, while a rejected sign-in comes back only when a person does
     * something. And no slots at all is the MAIN sign-in (X-172), which is
     * every machine that has captured nothing — not a fleet with no accounts.
     */
    anyUsable: boolean;
}

/** A sign-in the endpoint has rejected: only a person can put it back. */
function isDown(u: SlotUsage): boolean {
    return u.state === 'expired' || u.state === 'no-auth';
}

/**
 * Which sign-ins have fallen, and which of those is news.
 *
 * `known` is what the campaign has already announced. Told once per fall
 * rather than once per poll — a campaign that runs for three days would
 * otherwise post the same alert four hundred times — and re-armed the moment
 * the slot answers again, because the SECOND time it falls is news as well.
 */
export function slotHealth(known: string[] | undefined, usage: SlotUsage[]): SlotHealth {
    const before = new Set((known ?? []).filter(s => !!s));
    const down = (usage ?? []).filter(isDown).map(u => u.slotId);
    const now = new Set(down);
    return {
        down,
        newlyDown: down.filter(id => !before.has(id)),
        recovered: [...before].filter(id => !now.has(id)),
        // ‼️ Asked of the SAME function the planner picks with, so "usable"
        // cannot come to mean two things: a ceiling of 100 means only a fallen
        // sign-in is excluded here, which is exactly the question being asked.
        anyUsable: !usage.length || usage.some(u => slotIsUsable(u, 100))
    };
}
