/**
 * What a project's own data says about how it is being worked.
 *
 * The other tabs answer questions with one obvious source: Timeline is "what
 * happened", Cost is "where did the money go", Work is "what is in flight".
 * This one answers the questions that need the data folded a second time —
 * when the work actually happens, whether the backlog is being emptied or
 * filled, how long an item takes from capture to close, and where the effort
 * lands.
 *
 * ‼️ THREE RULES, AND EACH IS A WAY AN ANALYSIS PAGE LIES.
 *
 * **1. A figure with no denominator worth dividing by is not printed.** A
 * project with four sessions has no weekday rhythm; a backlog with three closed
 * items has no median cycle time. Every block here can come back `undefined`,
 * and the page says "not enough yet" rather than drawing a chart of noise —
 * a shape read off six points is a shape a reader will believe.
 *
 * **2. A trend is stated against a control.** "$4.10 per session" says nothing;
 * "$4.10 per session, against $2.80 over the whole project" is a claim. Every
 * rate here carries the period it covers and the baseline it is compared with.
 *
 * **3. Local days, never UTC.** The whole project axis keeps local time (a
 * session at 23:40 belongs to that evening, and `toISOString` moves it to
 * tomorrow east of UTC). Bucketing by weekday or hour is exactly where that
 * goes wrong invisibly.
 *
 * Pure: no fs, no vscode, no git. The caller collects; this folds.
 */

// ---------------------------------------------------------------------------
// input
// ---------------------------------------------------------------------------

export interface AnalysisSession {
    sessionId: string;
    agentName?: string;
    firstTs: number;
    lastTs: number;
    cost: number;
    turns: number;
    tokens?: number;
    /** path → number of write calls, as the index already counts them */
    filesEdited?: Record<string, number>;
    models?: string[];
}

/** One backlog item, as far as this module cares. */
export interface AnalysisItem {
    code?: string;
    state: string;
    /** when it was first seen being worked (the track ledger's first event) */
    firstTs?: number;
    /** when it closed */
    closedTs?: number;
    kinds?: string[];
    effort?: string;
}

export interface AnalysisInput {
    sessions: AnalysisSession[];
    items?: AnalysisItem[];
    /** commits in the project's code roots, for the pace series */
    commits?: { ts: number; repo: string }[];
    now?: number;
}

// ---------------------------------------------------------------------------
// output
// ---------------------------------------------------------------------------

/** A week, keyed by its local Monday. */
export interface WeekRow {
    /** YYYY-MM-DD of the local Monday — the key, not a display string */
    week: string;
    sessions: number;
    turns: number;
    cost: number;
    commits: number;
    /** backlog items that closed in this week */
    closed: number;
    /** backlog items first worked in this week */
    opened: number;
}

export interface RhythmCell {
    /** 0 = Sunday, matching Date.getDay() */
    dow: number;
    /** local hour, 0-23 */
    hour: number;
    turns: number;
    sessions: number;
}

export interface Rhythm {
    cells: RhythmCell[];
    /** the busiest cell, so the page has something to say in one sentence */
    peak: { dow: number; hour: number; turns: number };
    /** share of turns that fall outside 09:00-18:00, Mon-Fri */
    outOfHours: number;
    total: number;
}

export interface CycleTime {
    /** items that both opened and closed, with a real date on each */
    n: number;
    medianDays: number;
    p90Days: number;
    fastestDays: number;
    slowestDays: number;
}

export interface EffortRow {
    key: string;
    /** write calls, turns or whatever the block counts — named by the block */
    n: number;
    share: number;
}

export interface ProjectAnalysis {
    generatedAt: number;
    /** Weeks, oldest first — a series is read left to right. */
    weeks: WeekRow[];
    /** Undefined when there is not enough to see a shape. */
    rhythm?: Rhythm;
    cycle?: CycleTime;
    /** Top files by write calls, across every session of the project. */
    files: EffortRow[];
    /** Top agents by turns. */
    agents: EffortRow[];
    /** What the numbers are built from, so a reader can tell "quiet" from
     *  "not measured". */
    totals: {
        sessions: number; turns: number; cost: number; commits: number;
        items: number; closedItems: number; files: number;
    };
    /** Pace over the last 4 weeks against the whole project — rule 2. */
    pace?: {
        recentPerWeek: number; allPerWeek: number;
        recentCostPerSession: number; allCostPerSession: number;
        weeksCovered: number;
    };
}

// ---------------------------------------------------------------------------
// local-time helpers — see rule 3
// ---------------------------------------------------------------------------

const DAY = 86400000;

function p2(n: number): string { return String(n).padStart(2, '0'); }

/** YYYY-MM-DD of a timestamp's LOCAL day. */
export function localDay(ts: number): string {
    const d = new Date(ts);
    return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

/** YYYY-MM-DD of the local MONDAY of a timestamp's week. */
export function localWeek(ts: number): string {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    // getDay(): 0 = Sunday. Monday-based weeks put Sunday at the END, which is
    // what a working week is; a Sunday-based one splits every weekend.
    const back = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - back);
    return localDay(d.getTime());
}

/** Every Monday from `from` to `to` inclusive, so a quiet week is a ZERO row
 *  rather than a gap — a series with holes in it draws a lie. */
function weekSpan(from: string, to: string): string[] {
    const out: string[] = [];
    const [y, m, d] = from.split('-').map(Number);
    const cur = new Date(y, m - 1, d);
    let guard = 0;
    while (localDay(cur.getTime()) <= to && guard++ < 520) {
        out.push(localDay(cur.getTime()));
        cur.setDate(cur.getDate() + 7);
    }
    return out;
}

function median(sorted: number[]): number {
    if (!sorted.length) { return 0; }
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function quantile(sorted: number[], q: number): number {
    if (!sorted.length) { return 0; }
    const i = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * q)));
    return sorted[i];
}

function round(n: number, places = 2): number {
    const f = Math.pow(10, places);
    return Math.round(n * f) / f;
}

// ---------------------------------------------------------------------------
// the blocks
// ---------------------------------------------------------------------------

/**
 * ‼️ MINIMUMS, AND WHY EACH ONE.
 *
 * A rhythm read off four sessions is four dots; a median cycle time over two
 * items is one of those two items. These are the points below which the block
 * is not returned at all — the page then says "not enough yet", which is a
 * real answer, instead of drawing a shape a reader will believe.
 */
const MIN_RHYTHM_TURNS = 40;
const MIN_CYCLE_ITEMS = 5;
const MIN_PACE_WEEKS = 2;

function buildRhythm(sessions: AnalysisSession[]): Rhythm | undefined {
    // A session's turns are counted at the moment it STARTED. The alternative —
    // spreading them over its span — invents a distribution nobody measured;
    // the transcript's own per-turn timestamps are not in this input, and
    // pretending otherwise is exactly the shape rule 1 forbids.
    const total = sessions.reduce((a, s) => a + (s.turns || 0), 0);
    if (total < MIN_RHYTHM_TURNS) { return undefined; }
    const key = (dow: number, h: number) => dow * 24 + h;
    const cells = new Map<number, RhythmCell>();
    let outOfHours = 0;
    for (const s of sessions) {
        const d = new Date(s.firstTs);
        const dow = d.getDay();
        const hour = d.getHours();
        const cell = cells.get(key(dow, hour)) ?? { dow, hour, turns: 0, sessions: 0 };
        cell.turns += s.turns || 0;
        cell.sessions += 1;
        cells.set(key(dow, hour), cell);
        const working = dow >= 1 && dow <= 5 && hour >= 9 && hour < 18;
        if (!working) { outOfHours += s.turns || 0; }
    }
    const list = [...cells.values()].sort((a, b) => b.turns - a.turns || a.dow - b.dow || a.hour - b.hour);
    const top = list[0];
    return {
        cells: list.slice().sort((a, b) => a.dow - b.dow || a.hour - b.hour),
        peak: { dow: top.dow, hour: top.hour, turns: top.turns },
        outOfHours: round(outOfHours / total, 3),
        total
    };
}

function buildCycle(items: AnalysisItem[]): CycleTime | undefined {
    const spans = items
        .filter(i => (i.firstTs ?? 0) > 0 && (i.closedTs ?? 0) > 0
            && (i.closedTs as number) >= (i.firstTs as number))
        .map(i => ((i.closedTs as number) - (i.firstTs as number)) / DAY)
        .sort((a, b) => a - b);
    if (spans.length < MIN_CYCLE_ITEMS) { return undefined; }
    return {
        n: spans.length,
        medianDays: round(median(spans)),
        p90Days: round(quantile(spans, 0.9)),
        fastestDays: round(spans[0]),
        slowestDays: round(spans[spans.length - 1])
    };
}

/** Top N of a counted map, with each one's share of the whole. */
function topRows(counts: Map<string, number>, n: number): EffortRow[] {
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    if (!total) { return []; }
    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, n)
        .map(([key, v]) => ({ key, n: v, share: round(v / total, 4) }));
}

// ---------------------------------------------------------------------------
// the fold
// ---------------------------------------------------------------------------

export function buildProjectAnalysis(input: AnalysisInput, topN = 12): ProjectAnalysis {
    const now = input.now ?? Date.now();
    const sessions = input.sessions ?? [];
    const items = input.items ?? [];
    const commits = input.commits ?? [];

    // ---- weeks ----
    const stamps = [
        ...sessions.map(s => s.firstTs),
        ...commits.map(c => c.ts),
        ...items.map(i => i.closedTs ?? 0),
        ...items.map(i => i.firstTs ?? 0)
    ].filter(t => t > 0);
    const weeks: WeekRow[] = [];
    if (stamps.length) {
        const first = localWeek(Math.min(...stamps));
        const last = localWeek(now);
        const rows = new Map<string, WeekRow>();
        for (const w of weekSpan(first, last)) {
            rows.set(w, { week: w, sessions: 0, turns: 0, cost: 0, commits: 0, closed: 0, opened: 0 });
        }
        const bump = (ts: number, fn: (r: WeekRow) => void) => {
            if (!(ts > 0)) { return; }
            const r = rows.get(localWeek(ts));
            if (r) { fn(r); }
        };
        for (const s of sessions) {
            bump(s.firstTs, r => { r.sessions++; r.turns += s.turns || 0; r.cost += s.cost || 0; });
        }
        for (const c of commits) { bump(c.ts, r => { r.commits++; }); }
        for (const i of items) {
            bump(i.firstTs ?? 0, r => { r.opened++; });
            bump(i.closedTs ?? 0, r => { r.closed++; });
        }
        for (const r of rows.values()) { r.cost = round(r.cost, 4); }
        weeks.push(...[...rows.values()].sort((a, b) => a.week.localeCompare(b.week)));
    }

    // ---- effort ----
    const fileCounts = new Map<string, number>();
    for (const s of sessions) {
        for (const [f, c] of Object.entries(s.filesEdited ?? {})) {
            fileCounts.set(f, (fileCounts.get(f) ?? 0) + (Number(c) || 0));
        }
    }
    const agentCounts = new Map<string, number>();
    for (const s of sessions) {
        if (!s.agentName) { continue; }
        agentCounts.set(s.agentName, (agentCounts.get(s.agentName) ?? 0) + (s.turns || 0));
    }

    const totalTurns = sessions.reduce((a, s) => a + (s.turns || 0), 0);
    const totalCost = sessions.reduce((a, s) => a + (s.cost || 0), 0);

    // ---- pace, against a control (rule 2) ----
    let pace: ProjectAnalysis['pace'];
    const withRows = weeks.filter(w => w.sessions || w.commits);
    if (weeks.length >= MIN_PACE_WEEKS && withRows.length) {
        const recent = weeks.slice(-4);
        const recentSessions = recent.reduce((a, w) => a + w.sessions, 0);
        const recentCost = recent.reduce((a, w) => a + w.cost, 0);
        const allSessions = sessions.length;
        pace = {
            recentPerWeek: round(recentSessions / recent.length),
            allPerWeek: round(allSessions / weeks.length),
            recentCostPerSession: recentSessions ? round(recentCost / recentSessions) : 0,
            allCostPerSession: allSessions ? round(totalCost / allSessions) : 0,
            weeksCovered: weeks.length
        };
    }

    return {
        generatedAt: now,
        weeks,
        rhythm: buildRhythm(sessions),
        cycle: buildCycle(items),
        files: topRows(fileCounts, topN),
        agents: topRows(agentCounts, topN),
        totals: {
            sessions: sessions.length,
            turns: totalTurns,
            cost: round(totalCost, 4),
            commits: commits.length,
            items: items.length,
            closedItems: items.filter(i => (i.closedTs ?? 0) > 0).length,
            files: fileCounts.size
        },
        ...(pace ? { pace } : {})
    };
}

// ---------------------------------------------------------------------------
// the Code side
// ---------------------------------------------------------------------------

/**
 * A code root as the Code tab shows it.
 *
 * ‼️ TWO SOURCES, NEVER MIXED. `commits` is what git records — the repository's
 * own history, which includes everything a human typed there. `sessionWrites`
 * is what THIS PROJECT's agent sessions wrote, straight out of the transcripts.
 * They answer different questions and a page that summed them would be
 * inventing a third number that means nothing. The same distinction
 * `codeedits.ts` makes between a session's diff and a git diff.
 */
export interface CodeRootView {
    root: string;
    /** Present when the root is not on disk — the tab has to say so rather
     *  than printing zero commits for a folder that is simply gone. */
    missing?: boolean;
    commits: number;
    lastCommitTs: number;
    authors: EffortRow[];
    /** Commits per week, oldest first — the same weeks as the analysis. */
    perWeek: { week: string; n: number }[];
}

export interface CodeInput {
    roots: { root: string; exists: boolean; commits: { ts: number; author?: string }[] }[];
    /** the project's own sessions, for the writes side */
    sessions: AnalysisSession[];
    now?: number;
}

export interface ProjectCode {
    generatedAt: number;
    roots: CodeRootView[];
    /** Files this project's SESSIONS wrote, top first — not a git figure. */
    sessionWrites: EffortRow[];
    totals: { roots: number; missing: number; commits: number; writtenFiles: number; writes: number };
}

export function buildProjectCode(input: CodeInput, topN = 15): ProjectCode {
    const now = input.now ?? Date.now();
    const roots: CodeRootView[] = (input.roots ?? []).map(r => {
        const commits = r.commits ?? [];
        const authors = new Map<string, number>();
        const perWeek = new Map<string, number>();
        let last = 0;
        for (const c of commits) {
            if (c.author) { authors.set(c.author, (authors.get(c.author) ?? 0) + 1); }
            const w = localWeek(c.ts);
            perWeek.set(w, (perWeek.get(w) ?? 0) + 1);
            last = Math.max(last, c.ts);
        }
        return {
            root: r.root,
            ...(r.exists ? {} : { missing: true }),
            commits: commits.length,
            lastCommitTs: last,
            authors: topRows(authors, 6),
            perWeek: [...perWeek.entries()].sort((a, b) => a[0].localeCompare(b[0]))
                .map(([week, n]) => ({ week, n }))
        };
    });

    const writes = new Map<string, number>();
    for (const s of input.sessions ?? []) {
        for (const [f, c] of Object.entries(s.filesEdited ?? {})) {
            writes.set(f, (writes.get(f) ?? 0) + (Number(c) || 0));
        }
    }
    return {
        generatedAt: now,
        roots,
        sessionWrites: topRows(writes, topN),
        totals: {
            roots: roots.length,
            missing: roots.filter(r => r.missing).length,
            commits: roots.reduce((a, r) => a + r.commits, 0),
            writtenFiles: writes.size,
            writes: [...writes.values()].reduce((a, b) => a + b, 0)
        }
    };
}
