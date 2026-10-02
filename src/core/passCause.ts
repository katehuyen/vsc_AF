/**
 * X-472 — WHY A LEG PASSED, MEASURED, NEVER TAKEN FROM THE AGENT.
 *
 * Measured 2026-10-02 (chn_muqifjzc001n2b): a leg read 90% on its own probe and
 * passed; Agent Farm read 89% and no quota order had gone out, so the pass was
 * counted "not the quota's" and the successor stayed on the full account. Two
 * meters, two derivations (the stay looked at the order flag, the barren brake
 * at its own figure), one fact.
 *
 * One verdict from every reading there is: Agent Farm's figure for the passing
 * slot (a floor counts), the guard's last quota reading for that session, the
 * verdict already recorded at the pass, and the figure the agent sent. The
 * highest wins — an agent's figure can only RAISE what was measured, never
 * lower it. The stay, the starved note the barren brake skips, the baton record
 * and the Console card all read this one verdict. Pure: figures in, verdict out.
 */
import type { BatonFault } from './baton';

export type PassCauseKind = 'limit' | 'quota' | 'context' | 'flagged' | 'early';

/** Where a quota figure was read. */
export type QuotaReader = 'agent-farm' | 'guard' | 'recorded' | 'agent';

export interface PassCause {
    kind: PassCauseKind;
    /** the five-hour figure the verdict stood on — the highest reading; -1 = none known */
    quotaPct: number;
    /** which reader gave it */
    quotaFrom?: QuotaReader;
    /** X-478 — the weekly figure, the highest reading of the week; absent = none known */
    weekPct?: number;
    /** the guard's last context reading for the session, when it had one */
    contextPct?: number;
    /** the slot the leg ran on, as a person reads it */
    slot?: string;
    /** one sentence: the cause and the figure it stood on */
    why: string;
}

export interface PassCauseInput {
    /** Agent Farm passed for the leg: `limit` = its account hit the plan limit, `flagged` = the engine flagged it */
    fault?: BatonFault;
    slot?: string;
    /** the five-hour readings there are; an absent or negative one is not a reading */
    readings: Partial<Record<QuotaReader, number>>;
    /** agentFarm.quotaHandoverPct — 0 = off */
    quotaHandoverPct: number;
    /** X-478 — the weekly window's readings and its own line (agentFarm.quotaWeeklyHandoverPct, 0 = off) */
    week?: { readings: Partial<Record<QuotaReader, number>>; line: number };
    /** the guard's last context reading (percent of the window) */
    contextPct?: number;
    /** agentFarm.contextHandoverPct — 0 = off */
    contextHandoverPct: number;
}

const ORDER: QuotaReader[] = ['agent-farm', 'guard', 'recorded', 'agent'];

/** The highest reading and its reader; the agent's own wins only by being higher. */
export function highestReading(r: PassCauseInput['readings']): { pct: number; from?: QuotaReader } {
    let best: { pct: number; from?: QuotaReader } = { pct: -1 };
    for (const from of ORDER) {
        const n = Number(r[from]);
        if (r[from] === undefined || !Number.isFinite(n) || n < 0) { continue; }
        if (n > best.pct) { best = { pct: Math.min(100, n), from }; }
    }
    return best;
}

const READER_WORDS: Record<QuotaReader, string> = {
    'agent-farm': 'Agent Farm\'s reading',
    guard: 'the guard\'s last reading',
    recorded: 'the reading recorded at the pass',
    agent: 'the agent\'s own probe'
};

export function passCause(i: PassCauseInput): PassCause {
    const slot = String(i.slot ?? '').trim();
    const name = slot || 'its account';
    const q = highestReading(i.readings);
    const wq = highestReading(i.week?.readings ?? {});
    const ctx = Number(i.contextPct);
    const base = {
        quotaPct: q.pct,
        ...(q.from ? { quotaFrom: q.from } : {}),
        ...(wq.from ? { weekPct: wq.pct } : {}),
        ...(Number.isFinite(ctx) && ctx >= 0 ? { contextPct: ctx } : {}),
        ...(slot ? { slot } : {})
    };
    const figure = q.from ? `${Math.round(q.pct)}% of its five-hour window (${READER_WORDS[q.from]})` : 'an unmeasured window';
    if (i.fault === 'limit') {
        return { kind: 'limit', ...base, why: `${name} hit its plan limit` };
    }
    const line = Number(i.quotaHandoverPct);
    if (line > 0 && q.pct >= line) {
        return { kind: 'quota', ...base, why: `${name} was at ${figure}, at or past the quota handover line ${line}%` };
    }
    // X-478 — the week is a quota handover too: the successor never stays on an account whose week is spent
    const wline = Number(i.week?.line);
    if (wline > 0 && wq.from && wq.pct >= wline) {
        return { kind: 'quota', ...base, why: `${name} was at ${Math.round(wq.pct)}% of its weekly window (${READER_WORDS[wq.from]}), at or past the weekly quota handover line ${wline}%` };
    }
    const cline = Number(i.contextHandoverPct);
    if (cline > 0 && Number.isFinite(ctx) && ctx >= cline) {
        return { kind: 'context', ...base, why: `the context window was at ${Math.round(ctx)}%, at or past the context handover line ${cline}% (${name} at ${figure})` };
    }
    if (i.fault === 'flagged') {
        return { kind: 'flagged', ...base, why: `the engine flagged the conversation and Agent Farm passed for it (${name} at ${figure})` };
    }
    return {
        kind: 'early', ...base,
        why: `an early pass — no handover line was reached (${name} at ${figure}${Number.isFinite(ctx) && ctx >= 0 ? `, context ${Math.round(ctx)}%` : ''})`
    };
}

/** X-462 — the passing leg had no room left: what the barren brake skips. Read off the one verdict. */
export function starvedOf(c: PassCause | undefined): string | undefined {
    return c && (c.kind === 'limit' || c.kind === 'quota') ? c.why : undefined;
}
