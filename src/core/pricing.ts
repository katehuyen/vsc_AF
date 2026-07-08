export interface PriceRule {
    match: string;
    input: number;      // USD per 1M input tokens
    output: number;     // USD per 1M output tokens
    cacheWrite: number; // USD per 1M cache-creation tokens
    cacheRead: number;  // USD per 1M cache-read tokens
}

export interface Usage {
    input: number;
    output: number;
    cacheWrite: number;
    cacheRead: number;
}

export const DEFAULT_PRICING: PriceRule[] = [
    { match: 'opus', input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
    { match: 'fable|mythos', input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
    { match: 'sonnet', input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
    { match: 'haiku', input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 }
];

export class PricingEngine {
    private compiled: { re: RegExp; rule: PriceRule }[] = [];
    /** Models seen that matched no pricing rule (cost counted as 0). */
    readonly unknownModels = new Set<string>();

    constructor(rules: PriceRule[]) {
        for (const rule of rules) {
            try {
                this.compiled.push({ re: new RegExp(rule.match, 'i'), rule });
            } catch { /* invalid user regex — skip rule */ }
        }
    }

    costFor(model: string, u: Usage): number {
        const hit = this.compiled.find(c => c.re.test(model));
        if (!hit) {
            if (model && model !== '<synthetic>') { this.unknownModels.add(model); }
            return 0;
        }
        const r = hit.rule;
        return (u.input * r.input + u.output * r.output +
            u.cacheWrite * r.cacheWrite + u.cacheRead * r.cacheRead) / 1_000_000;
    }
}

export function emptyUsage(): Usage {
    return { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
}

export function addUsage(a: Usage, b: Usage): void {
    a.input += b.input;
    a.output += b.output;
    a.cacheWrite += b.cacheWrite;
    a.cacheRead += b.cacheRead;
}

export function totalTokens(u: Usage): number {
    return u.input + u.output + u.cacheWrite + u.cacheRead;
}
