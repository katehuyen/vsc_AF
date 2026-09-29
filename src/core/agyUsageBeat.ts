import { MIN_ACTIVE_BEAT_MS } from './planusage';

/**
 * X-437 — how often Antigravity's quota is read, on its OWN settings.
 *
 * Reading it runs `agy -p /usage`, and since agy's 2026-09-29 update every run
 * flashes a terminal on screen — so Claude's idle beat (5 min) is far too often
 * for an engine the user may not be running at all. Unlike Claude's `0`
 * (manual only in BOTH windows), an idle `0` here stops only the idle reads:
 * while an agent is mid-turn the active beat still applies.
 * Returns 0 for "no automatic read".
 */
export function agyUsageBeatMs(active: boolean, idleMinutes: number, activeSeconds: number): number {
    if (active) { return Math.max(MIN_ACTIVE_BEAT_MS, Math.round(activeSeconds * 1000)); }
    return idleMinutes > 0 ? Math.round(idleMinutes * 60_000) : 0;
}
