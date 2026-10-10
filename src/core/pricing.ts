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
    /**
     * How much of `cacheWrite` was written with a ONE-HOUR time to live.
     *
     * ‼️ NOT A DETAIL — IT IS A 1.6x PRICE DIFFERENCE ON THE MOST EXPENSIVE
     * THING IN A TURN. A 5-minute cache write costs 1.25x a fresh input token;
     * a 1-hour one costs 2x. The API reports the split in `usage.cache_creation`
     * and the flat `cache_creation_input_tokens` is only their sum, so a
     * weighting that assumes 5-minute under-counts every write. Measured on
     * this machine (3 813 assistant lines, 40 newest transcripts): **17.92M of
     * 17.92M cache-creation tokens were `ephemeral_1h`, and zero were 5-minute**
     * — i.e. the assumption was wrong on 100% of the data.
     *
     * Optional because older transcripts predate the breakdown; absent means
     * "not reported", and `weightedTokens` then falls back to the 1-hour rate
     * rather than the cheap one — under-stating what a turn cost the limit is
     * the failure that started this whole investigation.
     */
    cacheWrite1h?: number;
}

/** A raw usage block as the API and the transcripts write it. */
export interface RawUsage {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
    /** The cache-write split by TTL — see Usage.cacheWrite1h. */
    cache_creation?: {
        ephemeral_5m_input_tokens?: number;
        ephemeral_1h_input_tokens?: number;
    };
}

/** Read a raw usage block into the shape the extension counts in — including
 *  the cache-write TTL split, which the flat field throws away. */
export function toUsage(u: RawUsage | undefined | null): Usage {
    const n = (v: number | undefined): number => (typeof v === 'number' && v > 0 ? v : 0);
    const cacheWrite = n(u?.cache_creation_input_tokens);
    const split = u?.cache_creation;
    return {
        input: n(u?.input_tokens),
        output: n(u?.output_tokens),
        cacheWrite,
        cacheRead: n(u?.cache_read_input_tokens),
        // No split reported → treat the whole write as 1-hour. See cacheWrite1h.
        cacheWrite1h: split ? n(split.ephemeral_1h_input_tokens) : cacheWrite
    };
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

    /**
     * ‼️ X-252 — WHICH RULES THESE FIGURES WERE PRICED WITH, as one short
     * string, so a cache can tell that they are stale.
     *
     * The rates are the OTHER input to every cost in this product, and the only
     * one nothing was keyed to: a transcript parse is remembered against the
     * file's own size and mtime, which do not move when the user edits
     * `agentFarm.pricing`. So the rates changed, the engine was rebuilt, the
     * scan ran again — and every unchanged file answered out of the cache with
     * the dollars of the OLD table. Computed once per scan, never per file.
     */
    revision(): string {
        return hashOf(this.versions.map(v => v.from + '~' + JSON.stringify(v.rules)).join('|'));
    }
}

/** FNV-1a, 32-bit, as hex — a fingerprint for a cache key, never a checksum. */
function hashOf(s: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36);
}

export function emptyUsage(): Usage {
    return { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, cacheWrite1h: 0 };
}

export function addUsage(a: Usage, b: Usage): void {
    a.input += b.input;
    a.output += b.output;
    a.cacheWrite += b.cacheWrite;
    a.cacheRead += b.cacheRead;
    // A Usage built by hand (tests, external CLIs) may not carry the split; an
    // absent one means the whole write was 1-hour — see Usage.cacheWrite1h.
    a.cacheWrite1h = (a.cacheWrite1h ?? 0) + (b.cacheWrite1h ?? b.cacheWrite);
}

export function totalTokens(u: Usage): number {
    return u.input + u.output + u.cacheWrite + u.cacheRead;
}

/**
 * What a token is WORTH against the plan's rolling limit, by model family.
 *
 * ‼️ THE RAW TOKEN TOTAL IS NOT WHAT FILLS THE LIMIT, AND IT IS NOT EVEN
 * PROPORTIONAL TO IT. A cache-read token is a tenth of a fresh input token; an
 * output token is five; and 94-99% of any raw total is cache reads, so the raw
 * figure is dominated by the cheapest thing in it. Measured across 32 days of
 * this machine's transcripts, the ratio raw/weighted of a peak 5-hour window
 * ranges 0.80x to 3.86x — the raw number lands on either side of the weighted
 * one depending purely on how big the contexts were and which model ran. So a
 * day that shows 75M raw and a day that shows 25M raw can hit the very same
 * wall, and a surface printing only the raw number makes that look like a
 * counting fault. It is not a fault: it is the wrong unit.
 *
 * (Same corpus, top eight windows by weighted total: 75.5M-96.7M, a ±13% band
 * around a ceiling, against 111M-175M raw for those same windows.)
 *
 * The numbers are normalized so that **one Sonnet input token = 1**, which
 * keeps the figure in the same order of magnitude as the raw count and keeps
 * a Haiku test from looking as expensive as Opus work. They follow the
 * published price RATIOS, deliberately as their own table rather than off
 * `PriceRule`: the user edits pricing to correct billing, and correcting a
 * dollar rate must not silently move what the limit gauge says.
 *
 * ‼️ AN APPROXIMATION, AND SAID SO ON THE SURFACES. The plan's exact formula
 * is not published; this tracks it in shape and magnitude, not to the digit.
 * The honest ground truth for "how full am I" stays the plan usage endpoint
 * (planusage.ts) — this is what makes a per-turn / per-session number
 * comparable to it.
 */
export interface QuotaWeight {
    match: string;
    input: number;
    output: number;
    /** 5-minute cache write — 1.25x this model's input token. */
    cacheWrite: number;
    /** 1-hour cache write — 2x input. ‼️ On this machine EVERY write measured
     *  was 1-hour, so this is the rate that actually applies. */
    cacheWrite1h: number;
    cacheRead: number;
}

export const QUOTA_WEIGHTS: QuotaWeight[] = [
    { match: 'opus', input: 5, output: 25, cacheWrite: 6.25, cacheWrite1h: 10, cacheRead: 0.5 },
    { match: 'fable|mythos', input: 5, output: 25, cacheWrite: 6.25, cacheWrite1h: 10, cacheRead: 0.5 },
    { match: 'sonnet', input: 1, output: 5, cacheWrite: 1.25, cacheWrite1h: 2, cacheRead: 0.1 },
    { match: 'haiku', input: 1 / 3, output: 5 / 3, cacheWrite: 5 / 12, cacheWrite1h: 2 / 3, cacheRead: 1 / 30 }
];

/**
 * How the ⚖ figure is derived. Settable because the numbers behind it are the
 * provider's, not ours: a rate card changes and nobody should need a build.
 *
 *  · `model-aware` — the table as written: Opus is five Sonnets, Haiku a third.
 *    The default, because the constitution runs tests on haiku and a figure
 *    that priced a haiku test like opus work would mislead in the one
 *    direction that matters.
 *  · `model-flat` — the Sonnet row for every model, i.e. weight the KINDS of
 *    token (output / cache-write / cache-read) and ignore which model ran.
 *    On this machine's 32 days this clustered the peak windows very slightly
 *    tighter (top-eight max/min 1.19 against 1.28), so it is offered rather
 *    than argued about.
 *  · `raw` — ⚖ equals the raw total; the feature off without ripping it out.
 */
export type QuotaWeightMode = 'model-aware' | 'model-flat' | 'raw';

interface QuotaConfig { weights: QuotaWeight[]; mode: QuotaWeightMode }

/**
 * ‼️ MODULE-LEVEL ON PURPOSE, AND THIS IS THE ONE PLACE IT IS ALLOWED.
 *
 * Everything else in the extension takes its rates as an argument (see
 * `PricingEngine`), which is the better shape. It cannot be done here: the ⚖
 * figure is counted inside `reduceEvent`, and consoleproto is deliberately a
 * PURE reducer with no dependencies — threading a rate table through it would
 * mean changing the signature of the console protocol to carry a setting. So
 * the table lives beside the function that uses it and the host sets it once
 * on activation and again whenever the configuration changes (`setQuotaConfig`).
 * Read-only for every consumer; there is exactly one writer.
 */
let ACTIVE: QuotaConfig = { weights: QUOTA_WEIGHTS, mode: 'model-aware' };
let COMPILED_QUOTA = compileQuota(QUOTA_WEIGHTS);

function compileQuota(rules: QuotaWeight[]): { re: RegExp; w: QuotaWeight }[] {
    const out: { re: RegExp; w: QuotaWeight }[] = [];
    for (const w of rules) {
        try { out.push({ re: new RegExp(w.match, 'i'), w }); } catch { /* invalid user regex — skip */ }
    }
    return out.length ? out : compileQuota(QUOTA_WEIGHTS);
}

/** Install the user's weights / mode. An empty or unusable table falls back to
 *  the shipped one rather than making every turn read as free. */
export function setQuotaConfig(cfg: Partial<QuotaConfig>): void {
    const weights = Array.isArray(cfg.weights) && cfg.weights.length
        ? cfg.weights.filter(w => w && typeof w.match === 'string')
        : QUOTA_WEIGHTS;
    ACTIVE = {
        weights: weights.length ? weights : QUOTA_WEIGHTS,
        mode: cfg.mode ?? ACTIVE.mode
    };
    COMPILED_QUOTA = compileQuota(ACTIVE.weights);
}

/** What is in force right now — for the surfaces that explain themselves. */
export function quotaConfig(): QuotaConfig {
    return { weights: ACTIVE.weights, mode: ACTIVE.mode };
}

/**
 * ‼️ X-252 — AND THE WEIGHTING IS THE SECOND HALF OF THE SAME PROBLEM.
 *
 * `wTokens` is what a run cost the PLAN, and it is derived from a table the user
 * can change (`setQuotaConfig`) exactly as the prices are. A cache keyed only to
 * the price table would go on serving weighted figures from the old weights, and
 * the weighted figure is the one the rotation is decided on. One string covers
 * both because a parse consumed both.
 */
/**
 * ‼️ THE ENGINE IS A SHAPE HERE, NOT THE CLASS — and that is a fact about this
 * codebase rather than a courtesy. A `PricingEngine` is passed in as
 * `{ costFor }` by a dozen tests and by more than one tool, so requiring the
 * method threw inside the scan the moment this was added (measured:
 * `test_resume_dims.js`, `pricing.revision is not a function`). A stand-in that
 * cannot state a revision contributes a constant, which is the truth about it:
 * its arithmetic does not change, so nothing keyed to it needs to.
 */
export function costingRevision(pricing: { revision?: () => string }): string {
    const rates = typeof pricing?.revision === 'function' ? pricing.revision() : 'fixed';
    return rates + '.' + hashOf(ACTIVE.mode + '~' + JSON.stringify(ACTIVE.weights));
}

/**
 * ‼️ ITS COUNTERPART, AND THEY ARE EDITED TOGETHER. The Claude index answers the
 * same question for its own on-disk store — `SessionIndex`'s `indexSignature`,
 * built in `extension.ts` out of the parser version and the same three settings.
 * That one is deliberately NOT rewritten to call this: changing the string it
 * produces discards a store that is already correct and costs one full re-parse
 * of every transcript on the machine, for no repair. So: two strings, one rule,
 * and a new input to the cost of a run belongs in BOTH.
 */

/** The row a model is weighed by — the fallback is the LAST row rather than a
 *  zero, so a model id nobody has seen yet still costs something. */
function quotaRowFor(model: string): QuotaWeight {
    if (ACTIVE.mode === 'model-flat') {
        return COMPILED_QUOTA.find(c => /sonnet/i.test(c.w.match))?.w ?? COMPILED_QUOTA[0].w;
    }
    return COMPILED_QUOTA.find(c => c.re.test(model || ''))?.w
        ?? COMPILED_QUOTA.find(c => /sonnet/i.test(c.w.match))?.w
        ?? COMPILED_QUOTA[0].w;
}

/** Sonnet-input-equivalent tokens — see QUOTA_WEIGHTS and QuotaWeightMode. */
export function weightedTokens(model: string, u: Usage): number {
    if (ACTIVE.mode === 'raw') { return totalTokens(u); }
    const hit = quotaRowFor(model);
    // The write is split by TTL and the two are priced differently. An unsplit
    // Usage is charged entirely at the 1-hour rate — see Usage.cacheWrite1h.
    const w1h = Math.min(u.cacheWrite, u.cacheWrite1h ?? u.cacheWrite);
    const w5m = Math.max(0, u.cacheWrite - w1h);
    return w1h * hit.cacheWrite1h + w5m * hit.cacheWrite
        + u.input * hit.input + u.output * hit.output + u.cacheRead * hit.cacheRead;
}

/** Known context-window sizes by model id. First match wins, so 1M-window
 *  generations are listed before the 200K catch-alls of the same family.
 *  Unknown models (including future ones) return 0 — the viewer then shows
 *  the raw context size without a percent instead of guessing a ceiling. */
const CONTEXT_WINDOWS: { re: RegExp; tokens: number }[] = [
    { re: /fable|mythos/i, tokens: 1_000_000 },
    // ‼️ `opus-5` BELONGS HERE AND WAS MISSING (X-35). The table stopped at
    // `opus-4-8`, so the user's own everyday model matched nothing and returned
    // 0 — the ctx percentage vanished on the sessions this farm is mostly made
    // of, which reads as "we cannot measure this" on the one engine we measure
    // best. A window is a published model capability, not a guess.
    { re: /opus-5|opus-4-[678]/i, tokens: 1_000_000 },
    { re: /sonnet-4-6|sonnet-5/i, tokens: 1_000_000 },
    { re: /opus-4|sonnet-4|haiku-4|claude-3/i, tokens: 200_000 }
];

/**
 * ‼️ X-113 — WINDOWS THE ENGINE ITSELF PUBLISHED, which the table above cannot
 * hold and must not try to.
 *
 * The table is a list of Claude families, so it answers 0 for every model of
 * every other engine — measured on this machine: `opencode models --verbose`
 * publishes `limit.context` on all seven models it reaches (200 000 up to
 * 1 048 576) and not one of them matched, so a `muse-spark` conversation drew a
 * raw token count with no ceiling on every table while the engine had stated
 * the answer all along. Shipping seven more regexes would be the wrong repair:
 * the list is the engine's, it changes without us, and it is already read.
 *
 * Same writer discipline as ACTIVE above — the host installs it whenever a
 * catalog is read, every consumer is read-only.
 */
let PUBLISHED_WINDOWS: Record<string, number> = {};

/**
 * Install what a catalog published. Both spellings of a model are accepted
 * because both are real: a launch and a live card carry the engine's wire ref
 * (`opencode/big-pickle`) and a transcript read off disk carries the bare id
 * (`big-pickle`) — the two-spellings trap that had `catalogRefusal` refusing
 * every OpenCode model there is. A bare id two providers both publish with
 * DIFFERENT windows is dropped rather than resolved to whichever came last.
 */
export function setPublishedWindows(rows: { model: string; tokens: number }[]): void {
    const next: Record<string, number> = {};
    const bare = new Map<string, number | null>();
    for (const r of rows ?? []) {
        const model = String(r?.model ?? '').trim().toLowerCase();
        const tokens = Number(r?.tokens);
        if (!model || !(tokens > 0)) { continue; }
        next[model] = tokens;
        const tail = model.slice(model.lastIndexOf('/') + 1);
        if (tail === model) { continue; }
        const seen = bare.get(tail);
        bare.set(tail, seen === undefined || seen === tokens ? tokens : null);
    }
    for (const [tail, tokens] of bare) {
        if (tokens !== null && next[tail] === undefined) { next[tail] = tokens; }
    }
    PUBLISHED_WINDOWS = next;
}

/** What is installed right now — for the surfaces that explain themselves. */
export function publishedWindows(): Record<string, number> {
    return { ...PUBLISHED_WINDOWS };
}

export function contextWindowFor(model: string): number {
    if (!model) { return 0; }
    // ‼️ THE PUBLISHED FIGURE OUTRANKS THE SHIPPED TABLE, for the same reason
    // the engine's own per-session statement outranks this function entirely
    // (see contextWindowOf): a list we wrote is the weakest evidence in the
    // room. It only ever holds what a catalog really stated.
    const published = PUBLISHED_WINDOWS[model.trim().toLowerCase()];
    if (published) { return published; }
    const hit = CONTEXT_WINDOWS.find(c => c.re.test(model));
    return hit ? hit.tokens : 0;
}

/** Which of the four answers a context ceiling was. '' means nobody stated
 *  one, and that is a real answer: there is then no fraction to take. */
export type CtxWindowSource = 'forced' | 'engine' | 'route' | 'model' | '';

export interface CtxWindow {
    /** 0 when nobody stated one — never a stand-in default. */
    tokens: number;
    source: CtxWindowSource;
}

/**
 * ‼️ X-113 — THE ONE RULE FOR "A FRACTION OF WHAT", and it was written out by
 * hand in four places with three different precedence orders: the dashboard put
 * the reader's override first, extension.ts put the session's own window first
 * on one branch and the live host's on another, and the Turns page divided every
 * engine by 200 000. So one session answered three different percentages
 * depending on which surface asked, each of them looking exact.
 *
 * The order here is the defensible one. The override is an INSTRUCTION and
 * outranks every measurement; what the engine published for this very session
 * beats a table (Codex states it per turn, and a 258 400 thread is not 200 000);
 * the model's published window is the last real answer; and zero is where it
 * stops, because a confident percentage against a guessed ceiling is worse than
 * no percentage at all.
 *
 * X-522 — `route` is the window the session's route states (routeWindow.ts): a
 * person's figure for that very route, so it outranks the table, which only
 * knows a model name. A route stating none passes 0 and adds nothing.
 */
export function contextWindowOf(stated: number, model: string, forced = 0, route = 0): CtxWindow {
    if (forced > 0) { return { tokens: forced, source: 'forced' }; }
    if (stated > 0) { return { tokens: stated, source: 'engine' }; }
    if (route > 0) { return { tokens: route, source: 'route' }; }
    const tokens = contextWindowFor(model);
    return tokens > 0 ? { tokens, source: 'model' } : { tokens: 0, source: '' };
}
