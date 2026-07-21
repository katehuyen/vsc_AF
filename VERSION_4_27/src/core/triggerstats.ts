/**
 * H2 — Trigger reliability scorecard. Computed from the trigger records and
 * the tasks they spawned (FarmTask.fromTrigger): firings, success/failure,
 * median start latency, plus the two classic reliability smells — armed
 * triggers that never fire and chains that always fail.
 */

export interface TriggerLike {
    id: string;
    title: string;
    enabled: boolean;
    lastFiredAt?: number;
    fireCount?: number;
}

export interface TaskLike {
    fromTrigger?: string;
    status: string;
    createdAt: number;
    startedAt?: number;
    endedAt?: number;
}

export interface TriggerStat {
    id: string;
    title: string;
    enabled: boolean;
    fireCountTotal: number;
    lastFiredAt?: number;
    /** tasks spawned in the window */
    tasks7d: number;
    ok7d: number;
    fail7d: number;
    /** median ms between task creation (= firing) and actual start */
    medianStartDelayMs?: number;
    /** enabled for ≥ `staleDays` without a single firing */
    neverFired: boolean;
    /** last `failStreak`+ completed tasks all failed */
    alwaysFails: boolean;
}

export interface TriggerStatsOptions {
    windowMs?: number;
    /** how many trailing failures count as "always fails" (default 3) */
    failStreak?: number;
    now?: number;
}

function median(xs: number[]): number | undefined {
    if (!xs.length) { return undefined; }
    const s = [...xs].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function buildTriggerStats(
    triggers: TriggerLike[],
    tasks: TaskLike[],
    opts: TriggerStatsOptions = {}
): TriggerStat[] {
    const now = opts.now ?? Date.now();
    const windowMs = opts.windowMs ?? 7 * 24 * 3600 * 1000;
    const failStreak = opts.failStreak ?? 3;
    const stats: TriggerStat[] = [];

    for (const t of triggers) {
        const spawned = tasks
            .filter(x => x.fromTrigger === t.id)
            .sort((a, b) => a.createdAt - b.createdAt);
        const recent = spawned.filter(x => x.createdAt >= now - windowMs);
        const delays = recent
            .filter(x => x.startedAt)
            .map(x => Math.max(0, (x.startedAt as number) - x.createdAt));
        const completed = spawned.filter(x => x.status === 'done' || x.status === 'failed');
        const tail = completed.slice(-failStreak);
        stats.push({
            id: t.id,
            title: t.title,
            enabled: t.enabled,
            fireCountTotal: t.fireCount ?? 0,
            lastFiredAt: t.lastFiredAt,
            tasks7d: recent.length,
            ok7d: recent.filter(x => x.status === 'done').length,
            fail7d: recent.filter(x => x.status === 'failed').length,
            medianStartDelayMs: median(delays),
            neverFired: t.enabled && !(t.fireCount ?? 0),
            alwaysFails: tail.length >= failStreak && tail.every(x => x.status === 'failed')
        });
    }
    return stats;
}

/** Reliability alerts for the Insights view. */
export function triggerAlerts(stats: TriggerStat[]): { severity: 'warning' | 'info'; title: string; message: string }[] {
    const alerts: { severity: 'warning' | 'info'; title: string; message: string }[] = [];
    for (const s of stats) {
        if (s.alwaysFails) {
            alerts.push({
                severity: 'warning',
                title: s.title,
                message: `Trigger "${s.title}": its last runs all FAILED — the chain it starts is broken (check the task outputs).`
            });
        } else if (s.neverFired) {
            alerts.push({
                severity: 'info',
                title: s.title,
                message: `Trigger "${s.title}" is armed but has never fired — check the watch path / hook filter / webhook caller.`
            });
        }
    }
    return alerts;
}

export function describeTriggerStat(s: TriggerStat): string {
    const parts = [`fired ${s.fireCountTotal}×`];
    if (s.tasks7d) {
        parts.push(`7d: ${s.ok7d}✓/${s.fail7d}✗`);
        if (s.medianStartDelayMs !== undefined) {
            const sec = Math.round(s.medianStartDelayMs / 1000);
            parts.push(sec < 90 ? `start ~${sec}s` : `start ~${Math.round(sec / 60)}m`);
        }
    }
    return parts.join(' • ');
}
