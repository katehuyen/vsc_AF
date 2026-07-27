/**
 * Insight history — does a finding keep coming back, and did the fix work?
 *
 * The Insights list was a snapshot: a row appeared, you fixed or dismissed it,
 * and the farm forgot. So the two questions that decide whether a finding is
 * worth acting on had no answer — **how long has this been here / how many
 * times has it come back**, and **did what I did last time actually help?**
 *
 * This is the ledger behind those two. It is written from the same refresh
 * that builds the insights (one entry per insight key), and it records exactly
 * three moments: first seen, last seen, and the last time the user acted on it
 * (a fix, or a delegation). One derived fact matters more than the rest:
 *
 *   **regressed** — the finding was gone after you acted, and then came back.
 *   That is the difference between "the fix worked" and "the fix looked like
 *   it worked", and it is the only honest way to say either.
 *
 * Pure data in, pure data out; the extension owns the file and the clock.
 */

export interface InsightRecord {
    key: string;
    /** last human-readable message, so a restored/aged row still reads right */
    label: string;
    agentName: string;
    category: string;
    severity: string;
    firstSeen: number;
    lastSeen: number;
    /** how many separate appearances (a run of consecutive sightings is one) */
    occurrences: number;
    /** when the user last ran a fix / delegated it */
    actedAt?: number;
    actedKind?: 'fix' | 'delegate';
    /** it disappeared after that action … */
    clearedAt?: number;
    /** … and then came back: the fix did not hold */
    regressedAt?: number;
    /** true while the finding is in the current insight list */
    open: boolean;
}

export type InsightHistoryStore = Record<string, InsightRecord>;

export interface SeenInsight {
    key: string;
    label: string;
    agentName: string;
    category: string;
    severity: string;
}

/** Accept whatever the store file holds (older shapes, hand edits). */
export function normalizeHistory(raw: unknown): InsightHistoryStore {
    const out: InsightHistoryStore = {};
    if (!raw || typeof raw !== 'object') { return out; }
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        if (!key || !value || typeof value !== 'object') { continue; }
        const v = value as Partial<InsightRecord>;
        if (typeof v.firstSeen !== 'number') { continue; }
        out[key] = {
            key,
            label: typeof v.label === 'string' ? v.label : key,
            agentName: typeof v.agentName === 'string' ? v.agentName : '',
            category: typeof v.category === 'string' ? v.category : '',
            severity: typeof v.severity === 'string' ? v.severity : 'info',
            firstSeen: v.firstSeen,
            lastSeen: typeof v.lastSeen === 'number' ? v.lastSeen : v.firstSeen,
            occurrences: typeof v.occurrences === 'number' && v.occurrences > 0 ? v.occurrences : 1,
            open: v.open === true,
            ...(typeof v.actedAt === 'number' ? { actedAt: v.actedAt } : {}),
            ...(v.actedKind === 'fix' || v.actedKind === 'delegate' ? { actedKind: v.actedKind } : {}),
            ...(typeof v.clearedAt === 'number' ? { clearedAt: v.clearedAt } : {}),
            ...(typeof v.regressedAt === 'number' ? { regressedAt: v.regressedAt } : {})
        };
    }
    return out;
}

/**
 * Fold the current insight list into the ledger.
 *
 * A finding that is still listed is the same appearance, not a new one — the
 * occurrence counter only moves when something that had gone away comes back.
 * That is what makes "seen 4 times" mean four separate visits rather than
 * four dashboard refreshes.
 */
export function recordSighting(
    store: InsightHistoryStore, current: SeenInsight[], now: number
): InsightHistoryStore {
    const next: InsightHistoryStore = { ...store };
    const seen = new Set<string>();
    for (const ins of current) {
        seen.add(ins.key);
        const prev = next[ins.key];
        if (!prev) {
            next[ins.key] = {
                key: ins.key, label: ins.label, agentName: ins.agentName,
                category: ins.category, severity: ins.severity,
                firstSeen: now, lastSeen: now, occurrences: 1, open: true
            };
            continue;
        }
        const cameBack = !prev.open;
        next[ins.key] = {
            ...prev,
            label: ins.label, agentName: ins.agentName, severity: ins.severity,
            lastSeen: now,
            occurrences: prev.occurrences + (cameBack ? 1 : 0),
            open: true,
            // Coming back after the user acted is the one fact worth shouting.
            ...(cameBack && prev.actedAt && !prev.regressedAt ? { regressedAt: now } : {})
        };
    }
    for (const [key, rec] of Object.entries(next)) {
        if (seen.has(key) || !rec.open) { continue; }
        next[key] = {
            ...rec,
            open: false,
            // gone after an action = the action cleared it (until proven otherwise)
            ...(rec.actedAt && !rec.clearedAt ? { clearedAt: now } : {})
        };
    }
    return next;
}

/** The user ran a fix / delegated it — from here on we watch whether it holds. */
export function recordAction(
    store: InsightHistoryStore, key: string, kind: 'fix' | 'delegate', now: number
): InsightHistoryStore {
    const prev = store[key];
    if (!prev) { return store; }
    return {
        ...store,
        [key]: {
            ...prev, actedAt: now, actedKind: kind, regressedAt: undefined,
            // Acting on something that is ALREADY gone (from the history list,
            // or a fix applied after the row cleared) is clear from this moment
            // on — otherwise it could never earn a verdict, and a later return
            // would not read as a regression.
            clearedAt: prev.open ? undefined : now
        }
    };
}

const DAY = 24 * 3600 * 1000;

/** One line of history for the row that carries it. Empty = nothing to add. */
export function describeRecord(rec: InsightRecord | undefined, now: number): string {
    if (!rec) { return ''; }
    const days = (ts: number) => Math.max(0, Math.floor((now - ts) / DAY));
    const parts: string[] = [];
    if (rec.occurrences > 1) { parts.push(`${rec.occurrences}× (came back)`); }
    const age = days(rec.firstSeen);
    parts.push(age === 0 ? 'first seen today' : `first seen ${age}d ago`);
    if (rec.regressedAt) {
        parts.push(`your ${rec.actedKind === 'delegate' ? 'delegation' : 'fix'} did not hold — back after ${Math.max(0, Math.floor((rec.regressedAt - (rec.actedAt ?? rec.regressedAt)) / DAY))}d`);
    } else if (rec.actedAt && rec.open) {
        parts.push(`acted ${days(rec.actedAt)}d ago, still here`);
    } else if (rec.clearedAt && rec.actedAt) {
        parts.push(`fixed ${days(rec.clearedAt)}d ago, has not come back`);
    }
    return parts.join(' · ');
}

export interface HistorySummary {
    tracked: number;
    open: number;
    recurring: number;
    regressed: number;
    fixedHolding: number;
    /** the worst offenders, most occurrences first */
    top: InsightRecord[];
}

export function summarize(store: InsightHistoryStore, limit = 10): HistorySummary {
    const all = Object.values(store);
    return {
        tracked: all.length,
        open: all.filter(r => r.open).length,
        recurring: all.filter(r => r.occurrences > 1).length,
        regressed: all.filter(r => r.regressedAt).length,
        fixedHolding: all.filter(r => r.clearedAt && !r.regressedAt).length,
        top: all.slice()
            .sort((a, b) => (b.occurrences - a.occurrences) || (b.lastSeen - a.lastSeen))
            .slice(0, limit)
    };
}

/** Keep the ledger from growing forever: closed entries older than `days` go. */
export function pruneHistory(store: InsightHistoryStore, now: number, days = 180): InsightHistoryStore {
    const cutoff = now - days * DAY;
    const out: InsightHistoryStore = {};
    for (const [key, rec] of Object.entries(store)) {
        if (rec.open || rec.lastSeen >= cutoff) { out[key] = rec; }
    }
    return out;
}
