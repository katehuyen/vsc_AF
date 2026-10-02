/**
 * ‼️ X-462 — A LEG THAT RAN OUT OF ROOM IS NOT A BARREN ONE. Quota delays a
 * chain; it never ends it.
 *
 * Measured 2026-10-02, chain chn_muptzpk5002246: leg 3 was placed on an
 * account at 95% because it read as unmeasured (see usageFloor.ts) and handed
 * over at once. Two legs with no commit tripped the barren brake, which stopped
 * the chain and told the leg to repair it — a leg with no quota left. Nothing
 * ever opened again, though one account turned over an hour later.
 *
 * A leg whose account was at the quota handover line when it passed, or that
 * the plan limit stopped, is STARVED, and the barren brake does not count it.
 * Where a leg OPENS is the account policies' answer (defaultAccountCeiling,
 * contextHandoverStayAccountPct) — not decided here. Pure: figures in, verdict out.
 */
import type { BatonFault } from './baton';

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
