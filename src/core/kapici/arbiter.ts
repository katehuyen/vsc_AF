/**
 * X-411 — answers become a decision: the rule's decide section, its
 * confidence threshold (an LLM's self-reported confidence is uncalibrated, so
 * it must clear 0.1 more), the low-confidence path, and a reason synthesized
 * from the answers because Jev writes no text.
 */
import {
    FailurePath, KapiciAnswer, KapiciCond, KapiciRule, KapiciVerdict, LowConfidencePath, ProviderErrorKind, ProviderName, RuleLayer
} from './types';

export const LLM_MARGIN = 0.1;

export interface AnswerMeta { provider: ProviderName; model?: string; latencyMs: number; costUsd?: number; layer: RuleLayer }

const r2 = (n: number) => Math.round(n * 100) / 100;

/** The questions the decision reads — all of them when decide names none. */
export function decidingQuestions(rule: KapiciRule): string[] {
    const d = rule.decide;
    const named = [d.actionFrom, d.passIf?.q, d.rejectIf?.q, d.scoreMin?.q].filter((q): q is string => !!q);
    return named.length ? [...new Set(named)] : Object.keys(rule.questions);
}

function holds(c: KapiciCond, a: KapiciAnswer): boolean {
    if (c.choiceIs !== undefined) { return a.choice === c.choiceIs; }
    if (c.noulGt !== undefined) { return (a.p ?? 0) > c.noulGt; }
    return (a.p ?? 1) < (c.noulLt as number);
}

export function threshold(rule: KapiciRule, provider: ProviderName): number {
    return Math.min(1, rule.minConfidence + (provider === 'llm' ? LLM_MARGIN : 0));
}

/** decision + passed + confidence (the weakest answer the decision reads), or which answer is missing. */
export function decide(rule: KapiciRule, answers: Record<string, KapiciAnswer>): { decision: string; passed: boolean; confidence: number } | { missing: string } {
    const need = decidingQuestions(rule);
    const missing = need.find(q => !answers[q] || !Number.isFinite(answers[q].confidence));
    if (missing) { return { missing }; }
    const d = rule.decide;
    let passed = true;
    if (d.passIf) { passed = passed && holds(d.passIf, answers[d.passIf.q]); }
    if (d.rejectIf) { passed = passed && !holds(d.rejectIf, answers[d.rejectIf.q]); }
    if (d.scoreMin) { passed = passed && (answers[d.scoreMin.q].score ?? -Infinity) >= d.scoreMin.min; }
    let decision = passed ? 'pass' : 'reject';
    if (d.actionFrom) {
        const pick = answers[d.actionFrom].choice;
        if (!pick) { return { missing: d.actionFrom }; }
        decision = pick;
    }
    const confidence = Math.min(...need.map(q => answers[q].confidence));
    return { decision, passed, confidence };
}

function describe(id: string, a: KapiciAnswer): string {
    if (a.type === 'choice') { const p = a.choice && a.probs ? a.probs[a.choice] : undefined; return `${id}=${a.choice ?? '?'}${p !== undefined ? ` (p=${r2(p)})` : ''}`; }
    if (a.type === 'score') { return `${id}=${a.score !== undefined ? r2(a.score) : '?'}`; }
    return `${id} p=${a.p !== undefined ? r2(a.p) : '?'}`;
}

/** e.g. "action=wait (p=0.81) · confidence 0.77 · jev-1.13.0 · 142 ms" */
export function synthesizeReason(rule: KapiciRule, answers: Record<string, KapiciAnswer>, confidence: number, meta: AnswerMeta, note?: string): string {
    const parts = decidingQuestions(rule).filter(q => answers[q]).map(q => describe(q, answers[q]));
    parts.push(`confidence ${r2(confidence)}`, meta.model || meta.provider, `${Math.round(meta.latencyMs)} ms`);
    if (meta.costUsd !== undefined) { parts.push(`$${meta.costUsd.toFixed(6)}`); }
    if (note) { parts.push(note); }
    return parts.join(' · ');
}

/** Where a low-confidence answer goes: escalate needs a provider left, else it falls to the caller's own path. */
export function lowConfidencePath(rule: KapiciRule, providersLeft: number): LowConfidencePath {
    return rule.onLowConfidence === 'escalate' && providersLeft <= 0 ? 'mechanical' : rule.onLowConfidence;
}

/**
 * One provider's answers judged. confident = act on it. When not confident the
 * verdict still carries the answer (shadow mode compares it) with fallback set,
 * unless the rule escalates and a provider is left — then next is true.
 */
export function arbitrate(rule: KapiciRule, answers: Record<string, KapiciAnswer>, meta: AnswerMeta, providersLeft: number):
    { verdict: KapiciVerdict; confident: boolean; next: boolean } {
    const base = { answers, provider: meta.provider, latencyMs: meta.latencyMs, ruleId: rule.id, ruleVersion: rule.version, layer: meta.layer, ...(meta.costUsd !== undefined ? { costUsd: meta.costUsd } : {}) };
    const d = decide(rule, answers);
    if ('missing' in d) {
        const v = failureVerdict(rule, meta.layer, 'bad-reply', `no usable answer to "${d.missing}"`, meta.latencyMs, meta.provider);
        return { verdict: { ...v, answers, ...(meta.costUsd !== undefined ? { costUsd: meta.costUsd } : {}) }, confident: false, next: providersLeft > 0 };
    }
    const bar = threshold(rule, meta.provider);
    if (d.confidence >= bar) {
        return { verdict: { ...base, ...d, reason: synthesizeReason(rule, answers, d.confidence, meta) }, confident: true, next: false };
    }
    const path = lowConfidencePath(rule, providersLeft);
    const reason = synthesizeReason(rule, answers, d.confidence, meta, `below ${r2(bar)} → ${path}`);
    return { verdict: { ...base, ...d, reason, fallback: path === 'escalate' ? 'mechanical' : path }, confident: false, next: path === 'escalate' };
}

/** A provider that failed (or none that could answer): the rule's onFailure decides — open passes, closed stops, fallback hands back to the caller. */
export function failureVerdict(rule: KapiciRule, layer: RuleLayer, kind: ProviderErrorKind, error: string, latencyMs: number, provider: ProviderName | 'none' = 'none'): KapiciVerdict {
    const f: FailurePath = rule.onFailure;
    return {
        passed: f === 'open', decision: f, confidence: 0, answers: {}, provider, latencyMs,
        reason: `${provider === 'none' ? 'no provider' : provider} failed (${kind}): ${error} → onFailure=${f}`,
        fallback: f, ruleId: rule.id, ruleVersion: rule.version, layer
    };
}
