/**
 * X-412 — the one entry point. evaluate(ruleId, state, opts): the rule (builtin
 * → system → project), the input masked and trimmed, the cache, the providers
 * in the rule's order, the arbiter, the audit line. ask(state, questions): the
 * same road for questions that have no rule. Neither ever throws: a missing
 * rule, a missing key or a fault of Kapici's own comes back as a verdict whose
 * fallback hands the decision to the caller's own path.
 */
import { arbitrate, failureVerdict } from './arbiter';
import { appendAudit, auditEntry, ConsumerMode } from './audit';
import { cacheable, cacheKey, VerdictCache } from './cache';
import { prepareInput, PreparedInput } from './input';
import { heuristicProvider } from './providers/heuristic';
import { FetchLike, jevProvider, JevRoute } from './providers/jev';
import { DEFAULT_LLM_TIMEOUT_MS, llmProvider } from './providers/llm';
import { RuleRegistry } from './rules';
import { questionRefusal, resolveQuestions } from './schema';
import {
    CallOptions, KapiciAnswer, KapiciDeps, KapiciProvider, KapiciQuestion, KapiciRule, KapiciState, KapiciVerdict, LoadedRule, ProviderErrorKind, ProviderName
} from './types';

export const DEFAULT_TIMEOUT_MS = 3000;
export const DEFAULT_CHAIN: ProviderName[] = ['heuristic', 'jev'];
/** A sensitive rule never leaves for Jev. */
export const SENSITIVE_CHAIN: ProviderName[] = ['heuristic', 'llm'];

export type KapiciProviders = Partial<Record<ProviderName, KapiciProvider>>;

export interface EvaluateOptions {
    /** Who asked — the audit's consumer column. */
    consumer: string;
    mode?: ConsumerMode;
    options?: CallOptions;
    projectRoot?: string;
    /** Shadow mode: what today's mechanism decided, recorded beside Kapici's answer. */
    actual?: string;
    noCache?: boolean;
    signal?: AbortSignal;
}

export interface KapiciConfig {
    /** The Secret vault name of the Jev key — its value is masked out of every input. */
    keyName?: string;
    timeoutMs?: number;
    llmTimeoutMs?: number;
    cacheTtlMs?: number;
    /** Who is asked when a rule names no one. */
    defaultChain?: ProviderName[];
}

/** The providers a rule is put to, in its order, among those that exist; jev never for a sensitive rule. */
export function providerChain(rule: KapiciRule, available: KapiciProviders, fallback: ProviderName[] = DEFAULT_CHAIN): ProviderName[] {
    const wanted = rule.providers ?? (rule.sensitive ? SENSITIVE_CHAIN : fallback);
    return wanted.filter(n => !(rule.sensitive && n === 'jev') && !!available[n]);
}

/** What a provider is asked: heuristic only the checks, jev never a check (numbers and dates stay local), llm the rest. */
export function questionsFor(name: ProviderName, qs: Record<string, KapiciQuestion>, answered: Record<string, KapiciAnswer>): Record<string, KapiciQuestion> {
    return Object.fromEntries(Object.entries(qs).filter(([id, q]) => !answered[id] && (name === 'heuristic' ? !!q.check : name === 'jev' ? !q.check : true)));
}

function unruled(ruleId: string, why: string, layer: LoadedRule['layer'] = 'builtin'): KapiciVerdict {
    return {
        passed: false, decision: 'fallback', confidence: 0, answers: {}, reason: `${why} → the caller's own path`,
        provider: 'none', latencyMs: 0, fallback: 'fallback', ruleId, ruleVersion: 0, layer
    };
}

export class Kapici {
    private readonly cache: VerdictCache;

    constructor(private readonly deps: KapiciDeps, private readonly registry: RuleRegistry, private readonly providers: KapiciProviders, private readonly cfg: KapiciConfig = {}) {
        this.cache = new VerdictCache(cfg.cacheTtlMs);
    }

    async evaluate(ruleId: string, state: KapiciState, o: EvaluateOptions): Promise<KapiciVerdict> {
        const t0 = this.deps.now();
        try {
            const found = this.registry.find(ruleId, o.projectRoot);
            if ('error' in found) { return this.record(unruled(ruleId, found.error), await this.prepare(state), o, t0); }
            return await this.run(found, state, o, t0);
        } catch (e) {
            return this.record(unruled(ruleId, `kapici fault: ${(e as Error)?.message ?? e}`), undefined, o, t0);
        }
    }

    /** Questions without a rule: every answer comes back, the verdict passes once all are answered. */
    async ask(state: KapiciState, questions: Record<string, KapiciQuestion>, o: EvaluateOptions & { providers?: ProviderName[]; sensitive?: boolean }): Promise<KapiciVerdict> {
        const t0 = this.deps.now();
        try {
            const bad = !questions || typeof questions !== 'object' || !Object.keys(questions).length ? 'ask needs at least one question'
                : Object.entries(questions).map(([id, q]) => questionRefusal(id, q)).find(Boolean);
            if (bad) { return this.record(unruled('ask', bad), undefined, o, t0); }
            const rule: KapiciRule = {
                id: 'ask', version: 1, description: 'questions asked without a rule', questions, decide: {},
                ...(o.providers ? { providers: o.providers } : {}), ...(o.sensitive ? { sensitive: true } : {}),
                minConfidence: 0, onLowConfidence: 'mechanical', onFailure: 'fallback', golden: []
            };
            return await this.run({ rule, layer: 'builtin' }, state, { ...o, noCache: o.noCache ?? true }, t0);
        } catch (e) {
            return this.record(unruled('ask', `kapici fault: ${(e as Error)?.message ?? e}`), undefined, o, t0);
        }
    }

    clearCache(): void { this.cache.clear(); }

    private async known(): Promise<string[]> {
        const out: string[] = [];
        try { out.push(...((await this.deps.secretValues?.()) ?? [])); } catch { /* masking by pattern still holds */ }
        try { if (this.cfg.keyName) { const k = await this.deps.secret(this.cfg.keyName); if (k) { out.push(k); } } } catch { /* idem */ }
        return out;
    }

    private async prepare(state: KapiciState, budget?: number): Promise<PreparedInput> {
        return prepareInput(state, { budget, known: await this.known() });
    }

    private timeout(rule: KapiciRule, name: ProviderName): number {
        const t = rule.timeoutMs ?? this.cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        return name === 'llm' ? Math.max(t, this.cfg.llmTimeoutMs ?? DEFAULT_LLM_TIMEOUT_MS) : t;
    }

    private async run(l: LoadedRule, state: KapiciState, o: EvaluateOptions, t0: number): Promise<KapiciVerdict> {
        const rule = l.rule;
        const rq = resolveQuestions(rule, o.options);
        const input = await this.prepare(state, rule.inputBudgetChars);
        if ('error' in rq) { return this.record(failureVerdict(rule, l.layer, 'invalid', rq.error, 0), input, o, t0); }
        const key = cacheKey(rule, input.hash, rq.questions);
        const useCache = !o.noCache && !rule.sensitive;
        const hit = useCache ? this.cache.get(key, t0) : undefined;
        if (hit) { return this.record({ ...hit, cached: true }, input, o, t0); }
        const v = await this.chain(l, rq.questions, state, input, o, t0);
        if (useCache && cacheable(rule, v)) { this.cache.set(key, v, this.deps.now()); }
        return this.record(v, input, o, t0);
    }

    private async chain(l: LoadedRule, questions: Record<string, KapiciQuestion>, state: KapiciState, input: PreparedInput, o: EvaluateOptions, t0: number): Promise<KapiciVerdict> {
        const rule = l.rule;
        const names = providerChain(rule, this.providers, this.cfg.defaultChain?.length ? this.cfg.defaultChain : DEFAULT_CHAIN);
        const kept: Record<string, KapiciAnswer> = {};
        let cost: number | undefined;
        let last: KapiciVerdict | undefined;
        let err: { error: string; kind: ProviderErrorKind; provider: ProviderName } | undefined;
        for (let i = 0; i < names.length; i++) {
            const name = names[i];
            const qs = questionsFor(name, questions, kept);
            if (!Object.keys(qs).length) { continue; }
            const res = await (this.providers[name] as KapiciProvider).ask(name === 'heuristic' ? state : input.text, qs, { timeoutMs: this.timeout(rule, name), signal: o.signal });
            if ('error' in res) {
                err = { error: res.error, kind: res.kind, provider: name };
                last = undefined;
                this.deps.log(`kapici ${rule.id}: ${name} ${res.kind} — ${res.error}`);
                continue;
            }
            if (res.costUsd !== undefined) { cost = (cost ?? 0) + res.costUsd; }
            if (name === 'heuristic') { Object.assign(kept, res.answers); }
            const a = arbitrate(rule, { ...kept, ...res.answers }, { provider: name, model: res.model, latencyMs: this.deps.now() - t0, costUsd: cost, layer: l.layer }, names.length - i - 1);
            last = { ...a.verdict, model: res.model };
            if (a.confident || !a.next) { return last; }
        }
        if (last) { return last; }
        const f = failureVerdict(rule, l.layer, err?.kind ?? 'invalid', err?.error ?? `no provider of ${names.join(', ') || '(none available)'} could take these questions`, 0, err?.provider ?? 'none');
        return cost !== undefined ? { ...f, costUsd: cost } : f;
    }

    /** Latency stamped, one audit line written; an audit that cannot be written is logged and never fails the call. */
    private record(v: KapiciVerdict, input: PreparedInput | undefined, o: EvaluateOptions, t0: number): KapiciVerdict {
        const now = this.deps.now();
        const out = { ...v, latencyMs: now - t0 };
        try {
            const e = auditEntry(out, input ?? { hash: '', chars: 0, trimmed: false, masked: 0 },
                { consumer: o.consumer || 'unknown', mode: o.mode, model: out.model, cached: out.cached, actual: o.actual }, now);
            const no = appendAudit(this.deps.auditDir, e, now);
            if (no) { this.deps.log(`kapici audit not written: ${no}`); }
        } catch (e) { this.deps.log(`kapici audit not written: ${(e as Error)?.message ?? e}`); }
        return out;
    }
}

/** The shipped providers: heuristic always, jev with its key read per call, llm when a judge is injected. */
export function standardProviders(deps: KapiciDeps, jev: { keyName: string; route?: JevRoute; url?: string; model?: string; fetch?: FetchLike }): KapiciProviders {
    return {
        heuristic: heuristicProvider(deps.now),
        jev: jevProvider({ key: () => deps.secret(jev.keyName), route: jev.route, url: jev.url, model: jev.model, fetch: jev.fetch, now: deps.now }),
        ...(deps.judge ? { llm: llmProvider(deps.judge, deps.now) } : {})
    };
}
