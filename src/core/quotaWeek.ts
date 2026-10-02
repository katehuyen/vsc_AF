/**
 * X-478 (X-461) — THE WEEKLY LINE. The guard's quota line reads the five-hour
 * window only (X-353); the user asked for the account's WEEK to be a handover
 * trigger too, on its own setting (agentFarm.quotaWeeklyHandoverPct, 0 = off).
 * It is kept apart from the five-hour record so neither line can re-arm or
 * silence the other: one handover order per crossing, said again only after
 * the week has turned over (a reading under the line). There is no weekly
 * converge line — the user asked for a handover trigger.
 */
import type { ContextChannel } from './contextGuard';

export interface WeekDelivery {
    ts: number;
    pct: number;
    channel: ContextChannel;
    via?: string;
    account: string;
}

export interface WeekRecord {
    lastPct?: number;
    lastTs?: number;
    resetsAt?: number;
    handover?: WeekDelivery;
    undelivered?: { ts: number; pct: number; why: string };
}

export type WeekStep =
    | { say: false }
    | { say: true; pct: number };

/** Records the reading and answers whether the handover order is due now (the caller delivers it or notes it undelivered). */
export function weekStep(w: WeekRecord, reading: { pct: number; resetsAt?: number }, line: number, now: number): WeekStep {
    const pct = Math.round(reading.pct);
    w.lastPct = pct; w.lastTs = now;
    if (reading.resetsAt) { w.resetsAt = reading.resetsAt; }
    if ((w.handover || w.undelivered) && pct < line) { delete w.handover; delete w.undelivered; }
    if (!(line > 0) || pct < line || w.handover) { return { say: false }; }
    return { say: true, pct };
}

/** The order's lead words are the law's own (QUOTA HANDOVER), so _REF/handover.md answers it; the window is named so it is never read as the five-hour one. */
export function weekSignalText(lead: string, pct: number, account: string, order: string): string {
    const who = account ? ` (${account})` : '';
    return `${lead} ${pct}% — your account's weekly window${who} is ${pct}% used (weekly handover line reached). ${order}`;
}

export interface WeekView {
    state: 'delivered' | 'undelivered' | 'quiet';
    chip: string;
    lines: string[];
}

/** The weekly line's own words for the session's guard panel; quotaView.ts joins them to the five-hour ones. */
export function weekView(w: WeekRecord, line: number, lead: string, channelLabel: (c: ContextChannel) => string, ago?: (ts: number) => string): WeekView {
    const when = (ts: number): string => (ago ? ` — ${ago(ts)}` : '');
    const reading = `Weekly window: ${w.lastPct}% used — line ${line > 0 ? `${line}%` : 'off'} (agentFarm.quotaWeeklyHandoverPct).`;
    if (w.handover) {
        const h = w.handover;
        return { state: 'delivered', chip: `week ${h.pct}% HANDOVER`, lines: [`Weekly signal: ${lead} ${h.pct}% delivered${when(h.ts)}, through the ${channelLabel(h.channel)}${h.via ? ` (${h.via})` : ''}.`, reading] };
    }
    if (w.undelivered) {
        const u = w.undelivered;
        return { state: 'undelivered', chip: `week ${u.pct}% HANDOVER ✕`, lines: [`Weekly signal: ${lead} ${u.pct}% — ‼️ NEVER REACHED THIS RUN${when(u.ts)}.`, u.why, reading] };
    }
    return { state: 'quiet', chip: '', lines: [reading] };
}
