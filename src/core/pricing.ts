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

/** A raw usage block as the API and the transcripts write it. */
export interface RawUsage {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
}

/**
 * "Context now" — what the model's window held when it produced a reply:
 * everything that went in (fresh input + both kinds of cache) plus what came
 * out. **Returns 0 for a row that never went to the model.**
 *
 * That last part is the whole reason this is a function rather than four
 * additions at each call site. A transcript carries synthetic assistant rows —
 * an interrupt notice, a cancelled turn, a local message — and they carry a
 * usage block of **all zeros**. Taking "the last usage" literally therefore
 * wipes the figure whenever a session ends on one of those: measured on a real
 * transcript, 2 of 67 assistant rows were zero-usage and the last row was one
 * of them, so a session whose context was 78 512 tokens reported nothing at
 * all. A zero here means "no measurement", and callers keep the last real one.
 */
export function contextAfter(u: RawUsage | undefined | null): number {
    if (!u) { return 0; }
    const n = (v: number | undefined): number => (typeof v === 'number' && v > 0 ? v : 0);
    return n(u.input_tokens) + n(u.cache_read_input_tokens)
        + n(u.cache_creation_input_tokens) + n(u.output_tokens);
}

export const DEFAULT_PRICING: PriceRule[] = [
    { match: 'opus', input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
    { match: 'fable|mythos', input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
    { match: 'sonnet', input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
    { match: 'haiku', input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 }
];

/** One dated snapshot of the pricing rules. An entry's rules apply to token
 *  usage timestamped at or after `effectiveFrom` (until the next entry). */
export interface PricingVersion {
    effectiveFrom: number; // ms epoch
    rules: PriceRule[];
}

interface CompiledVersion {
    from: number;
    rules: PriceRule[];
    compiled: { re: RegExp; rule: PriceRule }[];
}

export class PricingEngine {
    /** Dated rule versions, sorted ascending by `from`; always ≥ 1 entry. */
    private versions: CompiledVersion[];
    /** Models seen that matched no pricing rule (cost counted as 0). */
    readonly unknownModels = new Set<string>();

    constructor(rules: PriceRule[]) {
        // A plain rule set is a single version effective from the beginning of
        // time — costFor(model, u) then behaves exactly as before.
        this.versions = [PricingEngine.compile(0, rules)];
    }

    private static compile(from: number, rules: PriceRule[]): CompiledVersion {
        const compiled: { re: RegExp; rule: PriceRule }[] = [];
        for (const rule of rules) {
            try {
                compiled.push({ re: new RegExp(rule.match, 'i'), rule });
            } catch { /* invalid user regex — skip rule */ }
        }
        return { from, rules, compiled };
    }

    /** Build from a timestamped history of rule sets. This is what freezes past
     *  costs: editing rates appends a new entry stamped "now", so only usage
     *  from that point forward is re-priced — sessions already recorded keep the
     *  rates that were in effect at the time. */
    static fromHistory(history: PricingVersion[]): PricingEngine {
        const engine = new PricingEngine([]);
        const sorted = (history ?? [])
            .filter(v => v && Array.isArray(v.rules))
            .sort((a, b) => a.effectiveFrom - b.effectiveFrom);
        engine.versions = sorted.length
            ? sorted.map(v => PricingEngine.compile(v.effectiveFrom, v.rules))
            : [PricingEngine.compile(0, DEFAULT_PRICING)];
        return engine;
    }

    /** The rules in effect now (the most recent version). */
    currentRules(): PriceRule[] {
        return this.versions[this.versions.length - 1].rules;
    }

    private versionAt(atTs?: number): CompiledVersion {
        // No usable timestamp → price at the current rate.
        if (!atTs || atTs <= 0) { return this.versions[this.versions.length - 1]; }
        // Latest version whose `from` <= atTs (versions are sorted ascending).
        let hit = this.versions[0];
        for (const v of this.versions) {
            if (v.from <= atTs) { hit = v; } else { break; }
        }
        return hit;
    }

    costFor(model: string, u: Usage, atTs?: number): number {
        const hit = this.versionAt(atTs).compiled.find(c => c.re.test(model));
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

/** Known context-window sizes by model id. First match wins, so 1M-window
 *  generations are listed before the 200K catch-alls of the same family.
 *  Unknown models (including future ones) return 0 — the viewer then shows
 *  the raw context size without a percent instead of guessing a ceiling. */
const CONTEXT_WINDOWS: { re: RegExp; tokens: number }[] = [
    { re: /fable|mythos/i, tokens: 1_000_000 },
    { re: /opus-4-[678]/i, tokens: 1_000_000 },
    { re: /sonnet-4-6|sonnet-5/i, tokens: 1_000_000 },
    { re: /opus-4|sonnet-4|haiku-4|claude-3/i, tokens: 200_000 }
];

export function contextWindowFor(model: string): number {
    if (!model) { return 0; }
    const hit = CONTEXT_WINDOWS.find(c => c.re.test(model));
    return hit ? hit.tokens : 0;
}
