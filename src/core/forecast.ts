import { FarmSchedule, ScheduleKind } from './tasks';
import { TaskRecord, titleFamily } from './taskstats';

/**
 * Task forecast — "what runs next, and roughly how long / how reliably".
 * Combines the schedule definitions (when) with task-history analytics (how a
 * given job usually behaves) plus the live queue. Pure node, testable; the
 * command renders the markdown into an untitled document.
 */

const DAY_MS = 24 * 3600 * 1000;

/** Local-time next fire times of a schedule within [from, from + days*24h]. Disabled = none. */
export function nextOccurrences(s: FarmSchedule, from: number, days: number): number[] {
    if (!s.enabled) { return []; }
    const end = from + days * DAY_MS;
    const out: number[] = [];
    if (s.kind === 'once') {
        if (s.onceAt && s.onceAt >= from && s.onceAt <= end && s.lastRunKey !== 'once') {
            out.push(s.onceAt);
        }
        return out;
    }
    const start = new Date(from);
    // First candidate: today at h:m (local), matching scheduleDue's local-time basis.
    const cand = new Date(start.getFullYear(), start.getMonth(), start.getDate(), s.hour, s.minute, 0, 0);
    if (s.kind === 'daily') {
        while (cand.getTime() < from) { cand.setDate(cand.getDate() + 1); }
        for (let t = cand.getTime(); t <= end; t += DAY_MS) { out.push(t); }
        return out;
    }
    // weekly: advance to the target day-of-week, then step a week at a time.
    const dow = s.dow ?? 0;
    while (cand.getDay() !== dow || cand.getTime() < from) { cand.setDate(cand.getDate() + 1); }
    for (let d = new Date(cand); d.getTime() <= end; d.setDate(d.getDate() + 7)) { out.push(d.getTime()); }
    return out;
}

export interface FamilyForecast {
    medianMs?: number;
    successRate?: number;
    runs: number;
}

function median(xs: number[]): number | undefined {
    if (!xs.length) { return undefined; }
    const s = [...xs].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Per-task-family median duration + success rate from completed records in the window. */
export function familyDurations(records: TaskRecord[], now: number, windowMs = 30 * DAY_MS): Map<string, FamilyForecast> {
    const byFam = new Map<string, TaskRecord[]>();
    for (const t of records) {
        if (t.status !== 'done' && t.status !== 'failed') { continue; }
        if ((t.endedAt ?? t.createdAt) < now - windowMs) { continue; }
        const key = titleFamily(t.title);
        if (!key) { continue; }
        (byFam.get(key) ?? byFam.set(key, []).get(key)!).push(t);
    }
    const out = new Map<string, FamilyForecast>();
    for (const [fam, list] of byFam) {
        // Duration forecast uses successful runs only — a fast failure would skew "how long it takes".
        const durs = list
            .filter(t => t.status === 'done' && t.startedAt && t.endedAt && t.endedAt > t.startedAt)
            .map(t => (t.endedAt as number) - (t.startedAt as number));
        const done = list.filter(t => t.status === 'done').length;
        const failed = list.filter(t => t.status === 'failed').length;
        out.set(fam, {
            medianMs: median(durs),
            successRate: done + failed ? done / (done + failed) : undefined,
            runs: list.length
        });
    }
    return out;
}

export interface ForecastItem {
    ts: number;
    title: string;
    agentName: string;
    kind: ScheduleKind;
    medianMs?: number;
    successRate?: number;
}

export interface Forecast {
    now: number;
    days: number;
    upcoming: ForecastItem[];
    queued: { title: string; agentName: string; deferredReason?: string }[];
    running: { title: string; agentName: string; startedAt?: number }[];
    totalScheduledRuns: number;
    /** sum of known median durations across upcoming runs (agent-time estimate) */
    estBusyMs: number;
}

export interface ForecastTask {
    title: string;
    agentName: string;
    status: string;
    deferredReason?: string;
    startedAt?: number;
}

export function buildForecast(
    schedules: FarmSchedule[],
    tasks: ForecastTask[],
    records: TaskRecord[],
    now: number,
    days = 7
): Forecast {
    const fams = familyDurations(records, now);
    const upcoming: ForecastItem[] = [];
    for (const s of schedules) {
        const fam = fams.get(titleFamily(s.title));
        for (const ts of nextOccurrences(s, now, days)) {
            upcoming.push({
                ts, title: s.title, agentName: s.agentName, kind: s.kind,
                medianMs: fam?.medianMs, successRate: fam?.successRate
            });
        }
    }
    upcoming.sort((a, b) => a.ts - b.ts);
    return {
        now, days, upcoming,
        queued: tasks.filter(t => t.status === 'queued')
            .map(t => ({ title: t.title, agentName: t.agentName, deferredReason: t.deferredReason })),
        running: tasks.filter(t => t.status === 'running')
            .map(t => ({ title: t.title, agentName: t.agentName, startedAt: t.startedAt })),
        totalScheduledRuns: upcoming.length,
        estBusyMs: upcoming.reduce((a, i) => a + (i.medianMs ?? 0), 0)
    };
}

function fmtDur(ms?: number): string {
    if (!ms) { return '—'; }
    const min = Math.round(ms / 60000);
    if (min < 1) { return '<1 min'; }
    if (min < 90) { return `~${min} min`; }
    return `~${(min / 60).toFixed(1)} h`;
}

function fmtClock(ts: number): string {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function dayLabel(ts: number, now: number): string {
    const d = new Date(ts), n = new Date(now);
    const midnight = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((midnight(d) - midnight(n)) / DAY_MS);
    if (diff === 0) { return 'Bugün'; }
    if (diff === 1) { return 'Yarın'; }
    const days = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
    return `${days[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}`;
}

/** Human-readable forecast document (Turkish, matches the guide's tone). */
export function renderForecastMarkdown(f: Forecast): string {
    const lines: string[] = [];
    lines.push(`# Görev Öngörüsü — sonraki ${f.days} gün`);
    lines.push('');
    lines.push(`_${new Date(f.now).toLocaleString()} itibarıyla · ${f.totalScheduledRuns} zamanlı koşu · ` +
        `tahmini ajan-süresi ${fmtDur(f.estBusyMs)}_`);
    lines.push('');

    if (f.running.length) {
        lines.push('## Şu an çalışan');
        for (const t of f.running) {
            lines.push(`- **${t.title}** — ${t.agentName}` +
                (t.startedAt ? ` (${fmtClock(t.startedAt)}'den beri)` : ''));
        }
        lines.push('');
    }
    if (f.queued.length) {
        lines.push('## Kuyrukta bekleyen');
        for (const t of f.queued) {
            lines.push(`- ${t.title} — ${t.agentName}` + (t.deferredReason ? ` _(${t.deferredReason})_` : ''));
        }
        lines.push('');
    }

    lines.push('## Zamanlanmış koşular');
    if (!f.upcoming.length) {
        lines.push('_Sonraki ' + f.days + ' günde zamanlanmış koşu yok._');
    } else {
        let curDay = '';
        for (const it of f.upcoming) {
            const dl = dayLabel(it.ts, f.now);
            if (dl !== curDay) { curDay = dl; lines.push('', `### ${dl}`); }
            const stats: string[] = [];
            if (it.medianMs) { stats.push(fmtDur(it.medianMs)); }
            if (it.successRate !== undefined) { stats.push(`%${Math.round(it.successRate * 100)} başarı`); }
            lines.push(`- **${fmtClock(it.ts)}** ${it.title} — ${it.agentName}` +
                (stats.length ? ` · ${stats.join(' · ')} _(30g geçmiş)_` : ''));
        }
    }
    lines.push('');
    lines.push('_Süre ve başarı oranı, aynı işin son 30 gündeki koşularının medyanından; geçmiş yoksa boş._');
    return lines.join('\n');
}
