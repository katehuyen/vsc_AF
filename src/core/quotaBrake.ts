/**
 * S-72 — THE QUOTA BRAKE READS THE ROW'S OWN ACCOUNT.
 *
 * The pump's `quota:5h` hold used to read ONE figure: the machine-wide
 * transcript window (`index.windowUsage()`), whichever account the row would
 * run on. So a row bound for a slot at 10% was held because the home account
 * stood at 95% — and a baton's successor, placed on `@emptiest` precisely
 * because that slot has room, would have parked behind a wall it was never
 * going to hit.
 *
 * Now: a row that STATES an account (a slot id or a rule) is judged by the
 * window of the slot that account resolves to right now, read from that
 * plan's own published usage; a row that states none keeps today's machine
 * figure. Pure — the resolution, the usage list and the machine figure are
 * handed in.
 *
 * X-479 — the slot's five-hour figure and its all-models week are read apart:
 * the five-hour one against the guard / handover line, the week against its own
 * handover line (quotaWeeklyHandoverPct). A full week is never called a full
 * five-hour window, and a week under its own line holds nothing.
 */

export interface QuotaBrakeInput {
    /** agentFarm.quotaGuardPercent — 0 or less = no brake */
    guard: number;
    /** agentFarm.quotaHandoverPct — a slot at or past it tells its run to hand over at once, so a row stating that slot is held there even with the guard off (0 = off) */
    handover?: number;
    /** X-479 — agentFarm.quotaWeeklyHandoverPct: a slot whose week is at or past it would hand over at once (0 = off) */
    weekLine?: number;
    /** the row's account box, as written (slot id, `@rule`, or empty) */
    stated?: string;
    /** what the box resolves to right now — the slot id, or nothing (a refusal is the account gate's business) */
    resolve: (stated: string) => { id?: string; label?: string } | undefined;
    /** the slot's own 5-hour figure, when its plan publishes one; `week` its all-models week (-1 / absent = not read) */
    usageOf: (slotId: string) => { percent: number; known: boolean; week?: number } | undefined;
    /** today's machine-wide figure (undefined = no ceiling configured) */
    machinePct: () => number | undefined;
}

export interface QuotaBrakeHold {
    code: 'quota:5h';
    reason: string;
    /** which window decided: the slot's own, or the machine's */
    basis: 'account' | 'machine';
    slotId?: string;
}

export function quotaBrake(i: QuotaBrakeInput): QuotaBrakeHold | undefined {
    const h = Number(i.handover);
    const line = Number.isFinite(h) && h > 0 && !(i.guard > 0 && i.guard <= h) ? h : 0;
    const slotGuard = line || (i.guard > 0 ? i.guard : 0);
    const wl = Number(i.weekLine);
    const weekLine = Number.isFinite(wl) && wl > 0 ? wl : 0;
    if (!(slotGuard > 0) && !weekLine) { return undefined; }
    const stated = String(i.stated ?? '').trim();
    if (stated) {
        const r = i.resolve(stated);
        if (r?.id) {
            const u = i.usageOf(r.id);
            const wk = Number(u?.week);
            if (u && u.known && weekLine && Number.isFinite(wk) && wk >= weekLine) {
                return {
                    code: 'quota:5h', basis: 'account', slotId: r.id,
                    reason: `weekly handover line (${Math.round(wk)}% of ${r.label || r.id}'s weekly window, at or past ${weekLine}%: it would hand over before doing anything)`
                };
            }
            if (u && u.known && Number.isFinite(u.percent)) {
                return slotGuard > 0 && u.percent >= slotGuard
                    ? {
                        code: 'quota:5h', basis: 'account', slotId: r.id,
                        reason: line
                            ? `quota handover line (${Math.round(u.percent)}% of ${r.label || r.id}'s 5h window, at or past ${line}%: it would hand over before doing anything)`
                            : `quota guard (${Math.round(u.percent)}% of ${r.label || r.id}'s 5h window)`
                    }
                    : undefined;
            }
            // a slot whose plan publishes no window falls through to the
            // machine figure: a brake that holds needlessly is visible on the
            // board, one that lets a window burn is not
        }
    }
    if (!(i.guard > 0)) { return undefined; }
    const pct = i.machinePct();
    if (pct === undefined) { return undefined; }
    return pct >= i.guard
        ? { code: 'quota:5h', basis: 'machine', reason: `quota guard (${Math.round(pct)}% of 5h window)` }
        : undefined;
}
