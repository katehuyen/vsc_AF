/**
 * X-411 — the same rule (id + version), the same input and the same call-time
 * options are not asked again for a short while (10 min by default). A
 * sensitive rule and a verdict that is not the provider's own (a failure, a
 * low-confidence fallback) are never cached.
 */
import * as crypto from 'crypto';
import { KapiciQuestion, KapiciRule, KapiciVerdict } from './types';

export const DEFAULT_CACHE_TTL_MS = 10 * 60_000;

export function cacheKey(rule: KapiciRule, inputHash: string, questions: Record<string, KapiciQuestion>): string {
    const criteria = crypto.createHash('sha256').update(JSON.stringify(Object.entries(questions).map(([k, q]) => [k, q.criteria ?? null])), 'utf8').digest('hex').slice(0, 16);
    return `${rule.id}@${rule.version}|${inputHash}|${criteria}`;
}

export function cacheable(rule: KapiciRule, v: KapiciVerdict): boolean {
    return !rule.sensitive && v.fallback === undefined;
}

export class VerdictCache {
    private readonly map = new Map<string, { at: number; v: KapiciVerdict }>();

    constructor(private readonly ttlMs = DEFAULT_CACHE_TTL_MS, private readonly max = 500) { }

    get(key: string, now: number): KapiciVerdict | undefined {
        const hit = this.map.get(key);
        if (!hit) { return undefined; }
        if (now - hit.at >= this.ttlMs) { this.map.delete(key); return undefined; }
        return hit.v;
    }

    set(key: string, v: KapiciVerdict, now: number): void {
        this.map.delete(key);
        this.map.set(key, { at: now, v });
        while (this.map.size > this.max) { this.map.delete(this.map.keys().next().value as string); }
    }

    get size(): number { return this.map.size; }
    clear(): void { this.map.clear(); }
}
