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
 */

export interface QuotaBrakeInput {
    /** agentFarm.quotaGuardPercent — 0 or less = no brake */
    guard: number;
    /** the row's account box, as written (slot id, `@rule`, or empty) */
    stated?: string;
    /** what the box resolves to right now — the slot id, or nothing (a refusal is the account gate's business) */
    resolve: (stated: string) => { id?: string; label?: string } | undefined;
    /** the slot's own 5-hour figure, when its plan publishes one */
    usageOf: (slotId: string) => { percent: number; known: boolean } | undefined;
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
    if (!(i.guard > 0)) { return undefined; }
    const stated = String(i.stated ?? '').trim();
    if (stated) {
        const r = i.resolve(stated);
        if (r?.id) {
            const u = i.usageOf(r.id);
            if (u && u.known && Number.isFinite(u.percent)) {
                return u.percent >= i.guard
                    ? {
                        code: 'quota:5h', basis: 'account', slotId: r.id,
                        reason: `quota guard (${Math.round(u.percent)}% of ${r.label || r.id}'s 5h window)`
                    }
                    : undefined;
            }
            // a slot whose plan publishes no window falls through to the
            // machine figure: a brake that holds needlessly is visible on the
            // board, one that lets a window burn is not
        }
    }
    const pct = i.machinePct();
    if (pct === undefined) { return undefined; }
    return pct >= i.guard
        ? { code: 'quota:5h', basis: 'machine', reason: `quota guard (${Math.round(pct)}% of 5h window)` }
        : undefined;
}
