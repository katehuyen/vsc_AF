/**
 * ‼️ X-462 — A RELAY LEG OPENS ONLY WHERE IT HAS ROOM TO WORK, AND A LEG THAT
 * RAN OUT OF ROOM IS NOT A BARREN ONE. Quota delays a chain; it never ends it.
 *
 * Measured 2026-10-02, chain chn_muptzpk5002246. Leg 1 passed at 86% of its
 * account's five-hour window; S-106 kept leg 2 on that account because its line
 * stood at 90 — the quota handover line itself — so leg 2 opened at 88%, spent
 * the 2% on reading its brief and handed over. Leg 3 was placed on an account
 * at 95% (it read as unmeasured, see usageFloor.ts) and handed over at once.
 * Two legs with no commit = the barren brake, which stopped the chain and told
 * the leg to repair it — a leg with no quota left. Nothing ever opened again,
 * though one account turned over an hour later.
 *
 * So: (1) a leg STARTS only under the start line — the policies' wall, and at
 * least `batonMinRoomPct` points below the quota handover line — or it parks
 * until the first turnover; (2) a leg whose account was at the handover line
 * when it passed, or that the plan limit stopped, is STARVED, and the barren
 * brake does not count it. Pure: figures in, verdicts out.
 */
import type { BatonFault } from './baton';
import { resolveFlex } from './flexResolve';
import type { StayVerdict } from './stayAccount';

/** The room a leg needs, on the flex chain; `own(key)` = what the USER wrote for agentFarm.<key>. */
export function minRoomOf(own: (key: string) => unknown): { value: number; sentence: string } {
    const v = own('batonMinRoomPct');
    const r = resolveFlex('baton.minRoomPct', v === undefined || v === null || v === '' ? {} : { settings: v });
    const n = Number(r.value);
    return { value: Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0, sentence: r.sentence };
}

/**
 * The highest figure a leg may START at: the policies' wall, and `minRoom`
 * points under the quota handover line. A handover line of 0 (off) leaves the
 * wall alone — nothing will tell such a leg to hand over for quota.
 */
export function legStartLine(wall: number, handoverPct: number, minRoom: number): { value: number; why: string } {
    const h = Number(handoverPct);
    const room = Math.max(0, Number(minRoom) || 0);
    const own = Math.max(1, Math.min(100, Number(wall) || 100));
    if (!(h > 0) || !(room > 0)) { return { value: own, why: `${own}% — the account policies' wall` }; }
    const line = Math.max(1, Math.min(own, h - room));
    return line < own
        ? { value: line, why: `${line}% — ${room} points of room below the quota handover line ${h}% (batonMinRoomPct)` }
        : { value: own, why: `${own}% — the account policies' wall` };
}

export interface StarvedInput {
    /** Agent Farm passed for the leg: `limit` = its account hit the plan limit */
    fault?: BatonFault;
    /** the slot the leg ran on, as a person reads it */
    slot?: string;
    /** that slot's five-hour figure now (fiveHourNow); -1 = not known */
    percent: number;
    /** agentFarm.quotaHandoverPct; 0 = off */
    handoverPct: number;
}

/** Why a passing leg had no room left, or undefined when it had room (or nobody can tell). */
export function starvedWhy(i: StarvedInput): string | undefined {
    const slot = String(i.slot ?? '').trim() || 'its account';
    if (i.fault === 'limit') { return `${slot} hit its plan limit`; }
    const h = Number(i.handoverPct);
    if (h > 0 && i.percent >= h) { return `${slot} was at ${Math.round(i.percent)}% of its five-hour window, at or past the quota handover line ${h}%`; }
    return undefined;
}

/** The policy's answer for the chain's pool under the start line — `launchAccountPick` with a cap. */
export interface LegPick {
    id: string;
    refusal?: string;
    resetsAt?: number;
    cursor?: string;
    note?: string;
}

export type LegPlace =
    | { slot: string; stayed: boolean; why: string; cursor?: string }
    | { slot: ''; park: { resetsAt: number; refusal: string }; why: string }
    | { slot: ''; refusal: string; why: string };

/**
 * ‼️ WHERE A LEG OPENS, ONE ANSWER for the door, the pass's sentence and the
 * wake of a parked row. S-106 first (asked WITH the start line, so it never
 * keeps a leg on an account with no room); else the chain's pool under the
 * start line; nothing under it = park until the first turnover. A refusal with
 * no turnover is a setup problem (no account stored, an unknown rule) and is
 * said as one.
 */
export function placeLeg(stay: StayVerdict | undefined, pick: () => LegPick): LegPlace {
    if (stay?.stay) { return { slot: stay.slotId, stayed: true, why: stay.why }; }
    const p = pick();
    if (!p.refusal && p.id) { return { slot: p.id, stayed: false, why: p.note || p.id, ...(p.cursor ? { cursor: p.cursor } : {}) }; }
    const refusal = p.refusal || 'the pool chose no account';
    if (p.resetsAt && p.resetsAt > 0) { return { slot: '', park: { resetsAt: p.resetsAt, refusal }, why: refusal }; }
    return { slot: '', refusal, why: refusal };
}
