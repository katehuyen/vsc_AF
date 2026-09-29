import { MIN_ACTIVE_BEAT_MS } from './planusage';

/**
 * ‼️ X-437 — WHEN ANTIGRAVITY'S QUOTA IS READ, AND WHOSE WORK DECIDES IT.
 *
 * Reading it runs `agy -p /usage`, and since agy's 2026-09-29 update every run
 * flashes a terminal on screen. The figure moves only while ANTIGRAVITY is
 * working: a Claude or Codex turn spends none of it, so another engine being
 * busy is no reason to read it. Three windows:
 *   · never read yet — once, now (what the bar opens with);
 *   · an Antigravity turn running — every `activeSeconds` (floor 30 s),
 *     counted from the run's start, because a turn that has just begun has
 *     spent nothing yet;
 *   · nothing of Antigravity's running — once right after a run ends (the
 *     settled figure), then every `idleMinutes`; `0` = never again until the
 *     next run or Check now.
 * Returns the time the next automatic read is due, or 0 for "none".
 */
export interface AgyReadState {
    now: number;
    /** when the last read was started (answer or error); 0 = never */
    lastAskedAt: number;
    /** an Antigravity turn is running right now */
    running: boolean;
    /** when the current run started; 0 when none is running */
    runningSince: number;
    /** when the last run ended; 0 = none has ended yet */
    lastRunEndedAt: number;
    idleMinutes: number;
    activeSeconds: number;
}

export function agyNextReadAt(s: AgyReadState): number {
    if (!(s.lastAskedAt > 0)) { return s.now; }
    if (s.running) {
        const beat = Math.max(MIN_ACTIVE_BEAT_MS, Math.round(s.activeSeconds * 1000));
        return Math.max(s.lastAskedAt, s.runningSince) + beat;
    }
    if (s.lastRunEndedAt > s.lastAskedAt) { return s.now; }
    return s.idleMinutes > 0 ? s.lastAskedAt + Math.round(s.idleMinutes * 60_000) : 0;
}

export function agyReadDue(s: AgyReadState): boolean {
    const at = agyNextReadAt(s);
    return at > 0 && at <= s.now;
}
