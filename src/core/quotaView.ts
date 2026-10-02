/**
 * S-75 / X-478 — WHAT THE QUOTA LINES SAY, IN ONE PLACE. The five-hour window
 * and the weekly window are two lines on one subject (the account's quota);
 * the panel reads both, and the more urgent one leads. The account is named
 * on every line that carries a figure, because a percentage from the wrong
 * sign-in is the failure this panel exists to stop.
 */
import type { ContextLevel, ContextSignalState, ContextThresholds, QuotaSignalRecord } from './contextGuard';
import { CHANNEL_LABEL, normalizeThresholds, QUOTA_CONVERGE_WORD, QUOTA_HANDOVER_WORD } from './contextGuard';
import { weekView } from './quotaWeek';

/** S-75 — the quota line's words, kept apart from the window's (ONE SUBJECT). */
export interface QuotaSignalView {
    state: ContextSignalState;
    level?: ContextLevel;
    /** SHORTHAND — '' while no line has been crossed; the figure rides in it, no other figure sits beside it. */
    chip: string;
    /** MIRROR — the current reading, the panel's first line. */
    head: string;
    lines: string[];
}

const clock = (ts: number): string => {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** Same three states as the context window's. */
function fiveHourSignalView(q: QuotaSignalRecord, t: ContextThresholds, ago?: (ts: number) => string): QuotaSignalView {
    const when = (ts: number): string => (ago ? ` — ${ago(ts)}` : '');
    const acct = q.account ? ` (${q.account})` : '';
    const reset = q.resetsAt ? ` · resets ${clock(q.resetsAt)}` : '';
    const head = `5-hour window${acct}: ${q.lastPct}% used${reset}`;
    const reading = `Last reading: ${q.lastPct}%${q.lastTs ? when(q.lastTs) : ''} — the session's own sign-in, never the home folder's.`;
    const law = `Lines: converge ${t.quotaConvergePct > 0 ? t.quotaConvergePct + '%' : 'off'} · hand over `
        + `${t.quotaHandoverPct > 0 ? t.quotaHandoverPct + '%' : 'off'} (agentFarm.quotaConvergePct / quotaHandoverPct).`;
    const word = (l: ContextLevel): string => (l === 'handover' ? QUOTA_HANDOVER_WORD : QUOTA_CONVERGE_WORD);
    const chipOf = (l: ContextLevel, pct: number): string => `5h ${pct}% ${l === 'handover' ? 'HANDOVER' : 'CONVERGE'}`;

    const delivery = q.handover ?? q.converge;
    if (delivery) {
        const level: ContextLevel = q.handover ? 'handover' : 'converge';
        const lines = [
            `Quota signal: ${word(level)} ${delivery.pct}% delivered${when(delivery.ts)}, `
                + `through the ${CHANNEL_LABEL[delivery.channel]}${delivery.via ? ` (${delivery.via})` : ''}.`
        ];
        if (level === 'handover' && q.converge && q.converge.ts !== q.handover?.ts) {
            lines.push(`${QUOTA_CONVERGE_WORD} ${q.converge.pct}% had gone out earlier${when(q.converge.ts)}.`);
        }
        if (level === 'converge') {
            lines.push(t.quotaHandoverPct > 0
                ? `${QUOTA_HANDOVER_WORD} ${t.quotaHandoverPct}%: not reached — the run may still work, but starts nothing new.`
                : `${QUOTA_HANDOVER_WORD}: switched off, so the quota will not stop this run.`);
        }
        lines.push(reading, law);
        return { state: 'delivered', level, chip: chipOf(level, delivery.pct), head, lines };
    }
    if (q.undelivered) {
        const u = q.undelivered;
        return {
            state: 'undelivered',
            level: u.level,
            chip: `${chipOf(u.level, u.pct)} ✕`,
            head,
            lines: [
                `Quota signal: ${word(u.level)} ${u.pct}% — ‼️ NEVER REACHED THIS RUN${when(u.ts)}.`,
                u.why,
                'The reading is here and the sentence is not: this run was not told, so its '
                    + 'silence is not obedience. Watch it yourself, or hand it over by hand.',
                reading,
                law
            ]
        };
    }
    return { state: 'quiet', chip: '', head, lines: ['Quota signal: nothing sent — no line crossed yet.', reading, law] };
}

/** The week's crossing leads the panel unless the five-hour line is already at handover; a quiet week is one reading line at the end. */
export function quotaSignalView(
    q: QuotaSignalRecord | undefined,
    thresholds: ContextThresholds,
    ago?: (ts: number) => string
): QuotaSignalView | undefined {
    if (!q || typeof q.lastPct !== 'number') { return undefined; }
    const t = normalizeThresholds(thresholds);
    const v = fiveHourSignalView(q, t, ago);
    if (!q.week || typeof q.week.lastPct !== 'number') { return v; }
    const w = weekView(q.week, t.quotaWeeklyHandoverPct, QUOTA_HANDOVER_WORD, c => CHANNEL_LABEL[c], ago);
    if (w.state !== 'quiet' && v.level !== 'handover') {
        const rest = v.state === 'quiet' ? v.lines.slice(1) : v.lines;
        return { state: w.state, level: 'handover', chip: w.chip, head: v.head, lines: [...w.lines, ...rest] };
    }
    return { ...v, lines: [...v.lines, ...w.lines] };
}
