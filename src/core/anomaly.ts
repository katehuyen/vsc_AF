import { dayKey } from './util';

/**
 * G2 — Statistical cost anomaly detection, independent of fixed budgets.
 * Moving median + MAD (median absolute deviation) over the trailing days;
 * a day far above the robust band is flagged. Also builds the
 * "which 5% of sessions eat 50% of the tokens" heavy-hitter report.
 */

export function median(xs: number[]): number {
    if (!xs.length) { return 0; }
    const s = [...xs].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function mad(xs: number[], med = median(xs)): number {
    if (!xs.length) { return 0; }
    return median(xs.map(x => Math.abs(x - med)));
}

export interface CostAnomaly {
    todayCost: number;
    median: number;
    /** robust sigma estimate (1.4826 × MAD) */
    sigma: number;
    /** today ÷ median (∞ clamped to 99) */
    factor: number;
    /** how many robust sigmas today sits above the median */
    zScore: number;
}

export interface AnomalyOptions {
    /** trailing full days used as the baseline (default 14, today excluded) */
    baselineDays?: number;
    /** ignore anomalies below this USD level — keeps tiny days quiet (default 1) */
    minUsd?: number;
    /** flag when today > median + k×sigma (default 3.5) */
    k?: number;
    /** also require today ≥ factor × median (default 2) */
    minFactor?: number;
}

/** Per-day cost series for the trailing `days` full days, oldest first (today excluded). */
export function dailyCostHistory(
    sessions: { daily: Record<string, { cost: number }> }[],
    days: number,
    now = Date.now()
): number[] {
    const out: number[] = [];
    for (let i = days; i >= 1; i--) {
        const key = dayKey(now - i * 24 * 3600 * 1000);
        let cost = 0;
        for (const s of sessions) { cost += s.daily[key]?.cost ?? 0; }
        out.push(cost);
    }
    return out;
}

export function todayCost(
    sessions: { daily: Record<string, { cost: number }> }[],
    now = Date.now()
): number {
    const key = dayKey(now);
    return sessions.reduce((sum, s) => sum + (s.daily[key]?.cost ?? 0), 0);
}

/**
 * Flag today's spend when it escapes the robust band of the baseline days.
 * Returns undefined when today looks normal (or too small to matter).
 */
export function detectCostAnomaly(
    history: number[],
    today: number,
    opts: AnomalyOptions = {}
): CostAnomaly | undefined {
    const minUsd = opts.minUsd ?? 1;
    const k = opts.k ?? 3.5;
    const minFactor = opts.minFactor ?? 2;
    // B-33 — a floor of 0 turns the check OFF (agentFarm.costAnomalyMinUsd says so); every caller reads it here
    if (minUsd <= 0 || today < minUsd) { return undefined; }
    const activeDays = history.filter(x => x > 0);
    if (activeDays.length < 4) { return undefined; } // not enough baseline to judge
    const med = median(history);
    const sigma = 1.4826 * mad(history, med);
    const base = Math.max(med, 0.01);
    const factor = Math.min(99, today / base);
    const zScore = sigma > 0 ? (today - med) / sigma : (today > med ? Infinity : 0);
    const anomalous = today > med + k * sigma && factor >= minFactor;
    if (!anomalous) { return undefined; }
    return {
        todayCost: today,
        median: med,
        sigma,
        factor,
        zScore: Number.isFinite(zScore) ? zScore : 99
    };
}

export interface SessionCostRef {
    file: string;
    title: string;
    agentName?: string;
    cost: number;
    tokens: number;
    lastTs: number;
}

export interface HeavyHittersReport {
    sinceMs: number;
    sessionCount: number;
    totalTokens: number;
    totalCost: number;
    /** the smallest set of sessions covering ≥ shareTarget of all tokens */
    heavy: SessionCostRef[];
    /** heavy.length ÷ sessionCount, in percent */
    heavyCountPct: number;
    /** tokens covered by `heavy`, in percent */
    tokenSharePct: number;
    shareTargetPct: number;
}

/** "Which few sessions eat most of the tokens" over the given window. */
export function heavyHitters(
    sessions: SessionCostRef[],
    sinceMs: number,
    now = Date.now(),
    shareTarget = 0.5
): HeavyHittersReport {
    const recent = sessions.filter(s => s.lastTs >= now - sinceMs && s.tokens > 0);
    const totalTokens = recent.reduce((a, s) => a + s.tokens, 0);
    const totalCost = recent.reduce((a, s) => a + s.cost, 0);
    const sorted = [...recent].sort((a, b) => b.tokens - a.tokens);
    const heavy: SessionCostRef[] = [];
    let covered = 0;
    for (const s of sorted) {
        if (totalTokens && covered / totalTokens >= shareTarget) { break; }
        heavy.push(s);
        covered += s.tokens;
    }
    return {
        sinceMs,
        sessionCount: recent.length,
        totalTokens,
        totalCost,
        heavy,
        heavyCountPct: recent.length ? Math.round(100 * heavy.length / recent.length) : 0,
        tokenSharePct: totalTokens ? Math.round(100 * covered / totalTokens) : 0,
        shareTargetPct: Math.round(100 * shareTarget)
    };
}
