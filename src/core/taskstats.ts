import * as fs from 'fs';
import * as path from 'path';

/**
 * Task health & analytics — the tasks counterpart of skill/memory usage.
 * Finished tasks leave the live list (Clear Finished / MAX_TASKS overflow)
 * and land in globalStorage/task-history/YYYY-MM.jsonl, so real statistics
 * must merge the live task list with that archive. Pure node (no vscode),
 * ad-hoc testable like triggerstats.
 */

/** Structural subset of FarmTask — history lines are full FarmTask JSON. */
export interface TaskRecord {
    id: string;
    /**
     * ‼️ M-8 (reopened) — THIS LINE UNDOES THE ONE ABOVE IT.
     *
     * The archive is append-only, and undo is the one gesture that has to take
     * something back out of it: delete files the row, Undo puts it back on the
     * live list, and without a word to the archive the row now exists TWICE —
     * once alive and once filed. Deleting it again wrote a second copy, and the
     * analytics behind Runs counted a single run as two, with two costs.
     *
     * A tombstone is how an append-only log says "not that one": `undeleted` is
     * the moment Undo ran, the reader takes the LAST line about an id, and the
     * file is never rewritten. A line carrying this has no other fields.
     */
    undeleted?: number;
    agentId: string;
    agentName: string;
    title: string;
    status: string;
    mode?: string;
    createdAt: number;
    startedAt?: number;
    endedAt?: number;
    fromSchedule?: string;
    fromTrigger?: string;
    workflowId?: string;
    attempt?: number;
    /** `unjudged` (M-42) counts as neither a pass nor a fail */
    verified?: 'pass' | 'fail' | 'unjudged';
    /** Z4: matched-transcript token cost (headless runs). */
    costUSD?: number;
    mediaCost?: number;
}

/** month key of a timestamp, matching appendHistory's file naming. */
function monthKey(ts: number): string {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// History files only ever grow via append; cache each file's parse by mtime+size
// so frequent health/panel refreshes don't re-read unchanged months.
const historyCache = new Map<string, { mtime: number; size: number; records: TaskRecord[] }>();

/**
 * Read archived tasks from task-history/YYYY-MM.jsonl files whose month can
 * contain records at/after `sinceTs`. Bad lines are skipped; missing dir = [].
 *
 * ‼️ M-8 (reopened) — ONE ID, ONE RUN, WHATEVER THE FILE SAYS TWICE.
 *
 * The archive is written by appending, so the same run reaches it more than
 * once by ordinary use: delete → Undo → delete files it twice, and a month file
 * recovered or re-synced by git can hold the same line again. Every reader
 * behind this — success rate, cost, the run counts on the agent pages — was
 * summing those copies, so the fix belongs HERE and not in each of them.
 *
 * The LAST line about an id wins, because it is the freshest thing the archive
 * was told; a tombstone (`undeleted`) is such a line and removes the id
 * altogether. Order is preserved from first sighting, which is what the callers
 * that do not sort themselves have always been handed.
 */
export function readTaskHistory(historyDir: string, sinceTs: number): TaskRecord[] {
    const minMonth = monthKey(sinceTs);
    return readArchive(historyDir, archiveMonths(historyDir).filter(m => m >= minMonth))
        .filter(t => (t.endedAt ?? t.createdAt) >= sinceTs);
}

/** Which months the archive holds, oldest first. Missing dir = none. */
export function archiveMonths(historyDir: string): string[] {
    try {
        return fs.readdirSync(historyDir)
            .filter(n => /^\d{4}-\d{2}\.jsonl$/.test(n))
            .map(n => n.slice(0, 7))
            .sort();
    } catch {
        return [];
    }
}

/**
 * The archive itself — the named months, in file order, deduped.
 *
 * ‼️ EVERY READER OF THE ARCHIVE COMES THROUGH HERE. The statistics did, the
 * bridge op did not, and the page had none — so "what was that run I deleted"
 * was answered by three different readings of the same file, only one of which
 * knew that an id can appear twice. There is one reading now and the callers
 * differ only in which months they ask for.
 */
export function readArchive(historyDir: string, months: string[]): TaskRecord[] {
    // id → the newest line about it, or null when the newest line is a tombstone
    const seen = new Map<string, TaskRecord | null>();
    for (const month of months) {
        const file = path.join(historyDir, `${month}.jsonl`);
        try {
            const st = fs.statSync(file);
            const cached = historyCache.get(file);
            let records: TaskRecord[];
            if (cached && cached.mtime === st.mtimeMs && cached.size === st.size) {
                records = cached.records;
            } else {
                records = [];
                for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
                    if (!line.trim()) { continue; }
                    try {
                        const t = JSON.parse(line) as TaskRecord;
                        // A tombstone carries an id and nothing else, so it is
                        // kept by a rule of its own rather than by the one that
                        // decides whether a RUN is complete enough to count.
                        if (t && t.id && (t.undeleted || (t.agentId && t.status))) { records.push(t); }
                    } catch { /* skip corrupt line */ }
                }
                historyCache.set(file, { mtime: st.mtimeMs, size: st.size, records });
            }
            for (const t of records) {
                seen.set(t.id, t.undeleted ? null : t);
            }
        } catch { /* unreadable month file */ }
    }
    const out: TaskRecord[] = [];
    for (const t of seen.values()) {
        if (t) { out.push(t); }
    }
    return out;
}

/** Live list + archive, deduped by id (live wins — it is fresher). */
export function mergeTaskRecords(live: TaskRecord[], history: TaskRecord[]): TaskRecord[] {
    const seen = new Set(live.map(t => t.id));
    return [...live, ...history.filter(t => !seen.has(t.id))];
}

/**
 * Group key for "the same task run repeatedly" — retry suffixes, numbers and
 * dates collapse so scheduled/triggered re-runs of one job land in one family.
 */
export function titleFamily(title: string): string {
    return title
        .replace(/ \(retry \d+\)$/i, '')
        .toLowerCase()
        .replace(/\d[\d:./-]*/g, '#')
        .replace(/\s+/g, ' ')
        .trim();
}

export interface AgentTaskStats {
    agentId: string;
    agentName: string;
    /** completed in window (done + failed + cancelled) */
    total: number;
    done: number;
    failed: number;
    cancelled: number;
    /** done / (done + failed); cancelled excluded — user action, not failure */
    successRate?: number;
    medianDurationMs?: number;
    /** verification retries that ran (attempt > 0) */
    retries: number;
    verifyPass: number;
    verifyFail: number;
    mediaCostUsd: number;
    sources: { manual: number; schedule: number; trigger: number; workflow: number };
    /** trailing consecutive failures (all time order, not just window) */
    failStreak: number;
    lastFailure?: { title: string; ts: number };
    /** live counts, not part of `total` */
    queued: number;
    running: number;
}

export interface TaskStatsOptions {
    windowMs?: number;
    now?: number;
}

function median(xs: number[]): number | undefined {
    if (!xs.length) { return undefined; }
    const s = [...xs].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const FINAL = new Set(['done', 'failed', 'cancelled']);

function sourceOf(t: TaskRecord): keyof AgentTaskStats['sources'] {
    if (t.fromTrigger) { return 'trigger'; }
    if (t.fromSchedule) { return 'schedule'; }
    if (t.workflowId) { return 'workflow'; }
    return 'manual';
}

/** Per-agent scorecard over the window (default 30d). */
export function buildAgentTaskStats(
    records: TaskRecord[],
    opts: TaskStatsOptions = {}
): Map<string, AgentTaskStats> {
    const now = opts.now ?? Date.now();
    const windowMs = opts.windowMs ?? 30 * 24 * 3600 * 1000;
    const byAgent = new Map<string, TaskRecord[]>();
    for (const t of records) {
        (byAgent.get(t.agentId) ?? byAgent.set(t.agentId, []).get(t.agentId)!).push(t);
    }

    const out = new Map<string, AgentTaskStats>();
    for (const [agentId, list] of byAgent) {
        const completedAll = list
            .filter(t => FINAL.has(t.status))
            .sort((a, b) => (a.endedAt ?? a.createdAt) - (b.endedAt ?? b.createdAt));
        const inWindow = completedAll.filter(t => (t.endedAt ?? t.createdAt) >= now - windowMs);
        const done = inWindow.filter(t => t.status === 'done').length;
        const failed = inWindow.filter(t => t.status === 'failed').length;
        const durations = inWindow
            .filter(t => t.startedAt && t.endedAt && t.endedAt > t.startedAt)
            .map(t => (t.endedAt as number) - (t.startedAt as number));
        // streak counts done/failed only — a trailing cancel breaks nothing either way
        let failStreak = 0;
        for (let i = completedAll.length - 1; i >= 0; i--) {
            const st = completedAll[i].status;
            if (st === 'cancelled') { continue; }
            if (st !== 'failed') { break; }
            failStreak++;
        }
        const lastFail = [...inWindow].reverse().find(t => t.status === 'failed');
        const sources = { manual: 0, schedule: 0, trigger: 0, workflow: 0 };
        for (const t of inWindow) { sources[sourceOf(t)]++; }
        out.set(agentId, {
            agentId,
            agentName: list[list.length - 1].agentName,
            total: inWindow.length,
            done,
            failed,
            cancelled: inWindow.length - done - failed,
            successRate: done + failed ? done / (done + failed) : undefined,
            medianDurationMs: median(durations),
            retries: inWindow.filter(t => (t.attempt ?? 0) > 0).length,
            verifyPass: inWindow.filter(t => t.verified === 'pass').length,
            verifyFail: inWindow.filter(t => t.verified === 'fail').length,
            mediaCostUsd: inWindow.reduce((a, t) => a + (t.mediaCost ?? 0), 0),
            sources,
            failStreak,
            lastFailure: lastFail
                ? { title: lastFail.title, ts: lastFail.endedAt ?? lastFail.createdAt }
                : undefined,
            queued: list.filter(t => t.status === 'queued').length,
            running: list.filter(t => t.status === 'running').length
        });
    }
    return out;
}

export interface TaskFamilyStat {
    /** normalized key (titleFamily) */
    family: string;
    /** most recent original title, retry suffix stripped */
    title: string;
    /** dominant origin of the family's runs */
    source: 'manual' | 'schedule' | 'trigger' | 'workflow';
    /** per-agent completed-run cells in the window */
    cells: Record<string, { agentName: string; runs: number; done: number; failed: number; lastTs: number }>;
    runsTotal: number;
    failedTotal: number;
    /** last `failStreak`+ completed runs (across agents) all failed */
    alwaysFails: boolean;
}

/** Task families × agents — rows for the Capability Matrix tasks grid. */
export function buildTaskFamilies(
    records: TaskRecord[],
    opts: TaskStatsOptions & { failStreak?: number } = {}
): TaskFamilyStat[] {
    const now = opts.now ?? Date.now();
    const windowMs = opts.windowMs ?? 30 * 24 * 3600 * 1000;
    const failStreak = opts.failStreak ?? 3;
    const completed = records
        .filter(t => FINAL.has(t.status) && (t.endedAt ?? t.createdAt) >= now - windowMs)
        .sort((a, b) => (a.endedAt ?? a.createdAt) - (b.endedAt ?? b.createdAt));

    const families = new Map<string, { list: TaskRecord[] }>();
    for (const t of completed) {
        const key = titleFamily(t.title);
        if (!key) { continue; }
        (families.get(key) ?? families.set(key, { list: [] }).get(key)!).list.push(t);
    }

    const out: TaskFamilyStat[] = [];
    for (const [family, { list }] of families) {
        const cells: TaskFamilyStat['cells'] = {};
        const srcCount = { manual: 0, schedule: 0, trigger: 0, workflow: 0 };
        for (const t of list) {
            const c = cells[t.agentId]
                ?? (cells[t.agentId] = { agentName: t.agentName, runs: 0, done: 0, failed: 0, lastTs: 0 });
            c.runs++;
            if (t.status === 'done') { c.done++; }
            if (t.status === 'failed') { c.failed++; }
            c.lastTs = Math.max(c.lastTs, t.endedAt ?? t.createdAt);
            srcCount[sourceOf(t)]++;
        }
        const judged = list.filter(t => t.status !== 'cancelled');
        const tail = judged.slice(-failStreak);
        const source = (Object.entries(srcCount) as [TaskFamilyStat['source'], number][])
            .reduce((a, b) => (b[1] > a[1] ? b : a))[0];
        out.push({
            family,
            title: list[list.length - 1].title.replace(/ \(retry \d+\)$/i, ''),
            source,
            cells,
            runsTotal: list.length,
            failedTotal: list.filter(t => t.status === 'failed').length,
            alwaysFails: tail.length >= failStreak && tail.every(t => t.status === 'failed')
        });
    }
    // busiest first; multi-agent families float up like the other matrix grids
    return out.sort((a, b) =>
        Object.keys(b.cells).length - Object.keys(a.cells).length ||
        b.runsTotal - a.runsTotal ||
        a.title.localeCompare(b.title));
}

/** Reliability alerts for the Insights view (health.ts `taskAlerts`). */
export function taskAlerts(
    statsByAgent: Map<string, AgentTaskStats>,
    families: TaskFamilyStat[],
    opts: { minRuns?: number; minRate?: number } = {}
): { severity: 'warning' | 'info'; agentId?: string; agentName: string; message: string }[] {
    const minRuns = opts.minRuns ?? 5;
    const minRate = opts.minRate ?? 0.5;
    const alerts: { severity: 'warning' | 'info'; agentId?: string; agentName: string; message: string }[] = [];
    for (const s of statsByAgent.values()) {
        if (s.done + s.failed >= minRuns && (s.successRate ?? 1) < minRate) {
            alerts.push({
                severity: 'warning',
                agentId: s.agentId,
                agentName: s.agentName,
                message: `Tasks are failing more than succeeding: ${s.failed}✗ / ${s.done}✓ in 30d (${Math.round((s.successRate ?? 0) * 100)}% success).`
            });
        }
    }
    for (const f of families) {
        if (f.alwaysFails) {
            const ids = Object.keys(f.cells);
            alerts.push({
                severity: 'warning',
                agentName: ids.length > 1 ? 'fleet' : f.cells[ids[0]].agentName,
                agentId: ids.length === 1 ? ids[0] : undefined,
                message: `Task "${f.title}" keeps failing — its last runs all FAILED (${f.failedTotal}/${f.runsTotal} failed in 30d). Check the task output before it burns more quota.`
            });
        }
    }
    return alerts;
}

/** Short scorecard line for tooltips/cards. */
export function describeAgentTaskStats(s: AgentTaskStats): string {
    const parts = [`${s.total} runs (30d)`];
    if (s.successRate !== undefined) { parts.push(`${Math.round(s.successRate * 100)}% ok`); }
    if (s.medianDurationMs !== undefined) {
        const sec = Math.round(s.medianDurationMs / 1000);
        parts.push(sec < 90 ? `~${sec}s` : `~${Math.round(sec / 60)}m`);
    }
    if (s.failStreak >= 2) { parts.push(`⚠ ${s.failStreak} fails in a row`); }
    return parts.join(' • ');
}
