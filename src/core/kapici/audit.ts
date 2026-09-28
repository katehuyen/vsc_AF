/**
 * X-411 — every decision leaves one JSONL line in <auditDir>/audit-YYYY-MM.jsonl:
 * the rule with its version and layer, the HASH and length of what was sent
 * (never the input itself), the provider, the answers, the decision, latency
 * and cost. No key and no raw input is ever written; the line is built from
 * the verdict's fields by name, not by copying objects that might carry them.
 */
import * as fs from 'fs';
import * as path from 'path';
import { maskSecrets, PreparedInput } from './input';
import { KapiciAnswer, KapiciVerdict } from './types';

export type ConsumerMode = 'on' | 'shadow';

export interface AuditEntry {
    at: string;
    consumer: string;
    mode?: ConsumerMode;
    ruleId: string;
    ruleVersion: number;
    layer: string;
    inputHash: string;
    inputChars: number;
    trimmed?: boolean;
    masked?: number;
    provider: string;
    model?: string;
    answers: Record<string, KapiciAnswer>;
    decision: string;
    passed: boolean;
    confidence: number;
    latencyMs: number;
    costUsd?: number;
    fallback?: string;
    cached?: boolean;
    /** Shadow mode: what today's mechanism did, and whether Kapici agreed. */
    actual?: string;
    agreed?: boolean;
    error?: string;
}

export interface AuditMeta { consumer: string; mode?: ConsumerMode; model?: string; cached?: boolean; actual?: string; known?: string[] }

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** Answers reduced to their figures — a provider's extra fields never reach the file. */
function cleanAnswers(a: Record<string, KapiciAnswer>): Record<string, KapiciAnswer> {
    const out: Record<string, KapiciAnswer> = {};
    for (const [k, v] of Object.entries(a ?? {})) {
        const probs = v.probs ? Object.fromEntries(Object.entries(v.probs).filter(([, p]) => num(p) !== undefined)) : undefined;
        out[k] = {
            type: v.type, confidence: num(v.confidence) ?? 0,
            ...(num(v.p) !== undefined ? { p: v.p } : {}), ...(typeof v.choice === 'string' ? { choice: v.choice } : {}),
            ...(probs ? { probs } : {}), ...(num(v.score) !== undefined ? { score: v.score } : {})
        };
    }
    return out;
}

export function auditEntry(v: KapiciVerdict, input: Pick<PreparedInput, 'hash' | 'chars' | 'trimmed' | 'masked'>, meta: AuditMeta, now: number): AuditEntry {
    const failed = v.fallback !== undefined && !Object.keys(v.answers ?? {}).length;
    return {
        at: new Date(now).toISOString(), consumer: meta.consumer, ...(meta.mode ? { mode: meta.mode } : {}),
        ruleId: v.ruleId, ruleVersion: v.ruleVersion, layer: v.layer,
        inputHash: input.hash, inputChars: input.chars,
        ...(input.trimmed ? { trimmed: true } : {}), ...(input.masked ? { masked: input.masked } : {}),
        provider: v.provider, ...(meta.model ? { model: meta.model } : {}),
        answers: cleanAnswers(v.answers), decision: v.decision, passed: v.passed, confidence: v.confidence,
        latencyMs: Math.round(v.latencyMs), ...(v.costUsd !== undefined ? { costUsd: v.costUsd } : {}),
        ...(v.fallback ? { fallback: v.fallback } : {}), ...(meta.cached ? { cached: true } : {}),
        ...(meta.actual !== undefined ? { actual: meta.actual, agreed: meta.actual === v.decision } : {}),
        ...(failed ? { error: maskSecrets(v.reason, meta.known).text.slice(0, 300) } : {})
    };
}

export function auditFile(dir: string, now: number): string {
    const d = new Date(now);
    return path.join(dir, `audit-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}.jsonl`);
}

/** Never throws: an audit that cannot be written must not break a decision. Returns the error, if any. */
export function appendAudit(dir: string, e: AuditEntry, now: number): string {
    try {
        fs.mkdirSync(dir, { recursive: true });
        fs.appendFileSync(auditFile(dir, now), JSON.stringify(e) + '\n', 'utf8');
        return '';
    } catch (err) {
        return (err as Error).message;
    }
}

/** The newest entries first, filtered; reads month files from the newest back until it has enough. */
export function readAudit(dir: string, f: { consumer?: string; ruleId?: string; since?: number; limit?: number } = {}): AuditEntry[] {
    let files: string[];
    try { files = fs.readdirSync(dir).filter(n => /^audit-\d{4}-\d{2}\.jsonl$/.test(n)).sort().reverse(); } catch { return []; }
    const limit = Math.max(1, f.limit ?? 200);
    const out: AuditEntry[] = [];
    for (const n of files) {
        let lines: string[];
        try { lines = fs.readFileSync(path.join(dir, n), 'utf8').split('\n').filter(Boolean).reverse(); } catch { continue; }
        for (const l of lines) {
            let e: AuditEntry;
            try { e = JSON.parse(l); } catch { continue; }
            if (f.since !== undefined && Date.parse(e.at) < f.since) { return out; }
            if ((f.consumer && e.consumer !== f.consumer) || (f.ruleId && e.ruleId !== f.ruleId)) { continue; }
            out.push(e);
            if (out.length >= limit) { return out; }
        }
    }
    return out;
}
