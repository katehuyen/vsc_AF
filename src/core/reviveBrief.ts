/**
 * The revive plan as an ANSWER.
 *
 * `planRevive` spreads each live card into its row, so a row carries whatever the host's record
 * holds — the card's whole message list included — and `farm.restartExtensionHost resume=true`
 * handed all of it back to the agent that asked: 734 KB for one seat (measured 2026-10-10), read
 * into its context for nothing. The plan itself is left as it is (the stamp is written from it);
 * the caller is told which seats come back, and how much each one holds.
 */
import { RevivePlan, ReviveSkip } from './consoleRevive';

export interface ReviveBrief {
    rows: Record<string, unknown>[];
    skipped: ReviveSkip[];
}

/** A copy, never a trim in place: every scalar a row carries, a list by its length, nothing nested. */
export function reviveBrief(plan: RevivePlan): ReviveBrief {
    return {
        rows: plan.rows.map(row => {
            const out: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(row)) {
                if (Array.isArray(value)) { out[key] = value.length; }
                else if (value === null || typeof value !== 'object') { out[key] = value; }
            }
            return out;
        }),
        skipped: plan.skipped
    };
}
