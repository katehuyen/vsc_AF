/**
 * M-48 — the core every supervisor in the farm decides through. The checkpoint
 * supervisor (M-43/M-44: proceed · retry · jump · insert · ask_user · stop) and
 * the retry supervisor (M-13: resume · retryOriginal · wait · stop · needsUser)
 * differ in what they may decide and what they are shown. How an answer is read,
 * what a ceiling refuses and what "not sure enough" means is this one code for
 * both — a refused answer then goes the caller's mechanical way. Pure.
 */
import { capVerdict } from './flexForms';

/** The first balanced JSON object in a text; strings are respected, a second object is not read. */
function firstObject(text: string): string | null {
    const s = String(text ?? '');
    const start = s.indexOf('{');
    if (start < 0) { return null; }
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < s.length; i++) {
        const c = s[i];
        if (inStr) { if (esc) { esc = false; } else if (c === '\\') { esc = true; } else if (c === '"') { inStr = false; } continue; }
        if (c === '"') { inStr = true; } else if (c === '{') { depth++; } else if (c === '}' && --depth === 0) { return s.slice(start, i + 1); }
    }
    return null;
}

export type AnswerObject = { ok: true; raw: Record<string, unknown> } | { ok: false; error: string };

/** The one decision object in a model's answer: a fenced block and prose around it are tolerated, a list is refused. */
export function answerObject(text: string): AnswerObject {
    const s = String(text ?? '');
    const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(s);
    const body = fenced && firstObject(fenced[1]) ? fenced[1] : s;
    if (body.trim().startsWith('[')) { return { ok: false, error: 'the supervisor answered with a list, not one decision' }; }
    const obj = firstObject(body);
    if (!obj) { return { ok: false, error: 'the supervisor\'s answer holds no JSON object' }; }
    try {
        return { ok: true, raw: JSON.parse(obj) as Record<string, unknown> };
    } catch (e) {
        return { ok: false, error: `the supervisor's JSON could not be read — it does not parse (${String((e as Error)?.message ?? e).slice(0, 80)})` };
    }
}

export interface Ceiling {
    calls: number;
    maxCalls: number;
    spentUSD: number;
    /** unset or 0 = no budget */
    budgetUSD?: number;
    /** hard = no further call once it is spent · soft = said, never enforced (default hard) */
    budgetMode?: 'soft' | 'hard';
    /** what the ceiling is counted over: "run", "task" */
    per: string;
}

/** A ceiling reached — the calls, or a hard budget (the X-370 cap). '' = there is room. */
export function ceilingRefusal(c: Ceiling): string {
    if (c.calls >= c.maxCalls) { return `the supervisor has used its ${c.maxCalls} call${c.maxCalls === 1 ? '' : 's'} for this ${c.per}`; }
    if (c.budgetUSD && c.budgetUSD > 0 && (c.budgetMode ?? 'hard') === 'hard' && capVerdict({ hard: c.budgetUSD }, c.spentUSD).level === 'hard') {
        return `the supervisor's budget ($${c.budgetUSD.toFixed(2)}) is spent — a hard ceiling for this ${c.per}`;
    }
    return '';
}

/** A soft budget passed: said on the row, never enforced. */
export function softBudgetNote(c: Pick<Ceiling, 'spentUSD' | 'budgetUSD' | 'budgetMode'>): string {
    return c.budgetUSD && c.budgetUSD > 0 && c.budgetMode === 'soft' && capVerdict({ soft: c.budgetUSD }, c.spentUSD).level === 'soft'
        ? `the supervisor is over its soft $${c.budgetUSD.toFixed(2)} budget ($${c.spentUSD.toFixed(2)})` : '';
}

/** Below the threshold, why — '' when it is sure enough, or said nothing about it. */
export function underConfidence(confidence: number | undefined, min: number): string {
    return confidence !== undefined && confidence < min
        ? `the supervisor is ${Math.round(confidence * 100)}% sure; the threshold is ${Math.round(min * 100)}%` : '';
}
