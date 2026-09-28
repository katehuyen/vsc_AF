/**
 * U-155 — what a row keeps of a Kapıcı verdict, so the page can draw the small
 * 🛡 chip and its panel without the audit: the decision, how sure, who
 * answered, how fast, each question's answer in a few characters, and why.
 */
import { KapiciAnswer, KapiciVerdict } from './kapici/types';

export interface KapiciChip {
    consumer: string;
    rule: string;
    decision: string;
    passed: boolean;
    confidence: number;
    provider: string;
    latencyMs: number;
    reason: string;
    at: number;
    /** question id → its answer, short ("p 0.94", "developer 0.88", "score 4") */
    answers?: Record<string, string>;
    /** set when the verdict was not the provider's own — the rule's path */
    fallback?: string;
    /** what the consumer did with it: fired / skipped, the agent, the route */
    outcome?: string;
}

const two = (x: number | undefined) => (typeof x === 'number' ? x.toFixed(2) : '?');

export function answerText(a: KapiciAnswer): string {
    if (a.type === 'noul') { return `p ${two(a.p)}`; }
    if (a.type === 'choice') { return `${a.choice ?? '?'} ${two(a.confidence)}`; }
    return `score ${a.score ?? '?'}`;
}

export function chipOf(v: KapiciVerdict, consumer: string, outcome?: string, at = Date.now()): KapiciChip {
    const answers = Object.fromEntries(Object.entries(v.answers ?? {}).map(([id, a]) => [id, answerText(a)]));
    return {
        consumer, rule: v.ruleId, decision: v.decision, passed: v.passed, confidence: v.confidence,
        provider: v.provider, latencyMs: v.latencyMs, reason: v.reason, at,
        ...(Object.keys(answers).length ? { answers } : {}),
        ...(v.fallback ? { fallback: v.fallback } : {}),
        ...(outcome ? { outcome } : {})
    };
}
