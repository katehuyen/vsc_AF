/**
 * B-27 — Kapıcı on the bridge, and the host that builds it from Agent Farm's
 * own parts (the vault, the settings, the agent roots, the one-shot judge).
 * No vscode here: extension.ts hands the parts in. The key never crosses the
 * bridge — kapici.status says only whether it is PRESENT.
 */
import * as fs from 'fs';
import * as path from 'path';
import { argStr, BridgeRegistry, need, optBool, optNum, optStr } from './bridge';
import type { DispatchKapici } from './dispatch';
import type { SupervisorKapici } from './kapiciSupervisor';
import { gitDiff, TriggerKapici } from './kapiciTrigger';
import { KapiciStepHook, stepRuleFit } from './kapiciStep';
import { ConsumerSetting } from './kapici/shadow';
import { readAudit } from './kapici/audit';
import { Agreement, shadowAgreement } from './kapici/agreement';
import { BUILTIN_RULES } from './kapici/builtinRules';
import { DEFAULT_TIMEOUT_MS, Kapici, standardProviders } from './kapici/kapici';
import { FetchLike, JEV_ROUTES, JevRoute } from './kapici/providers/jev';
import { RuleRegistry, systemRuleDirs } from './kapici/rules';
import { CallOptions, KapiciAnswer, KapiciDeps, KapiciQuestion, KapiciState, PROVIDERS, ProviderName } from './kapici/types';

/** The vault names looked for when agentFarm.kapici.keyName is empty, and the road each one takes. */
export const KEY_CANDIDATES: { name: string; route: JevRoute }[] = [
    { name: 'TYPESAFE_API_KEY', route: 'typesafe' },
    { name: 'AI_GATEWAY_API_KEY', route: 'vercel' }
];
export const STATE_FILE_MAX = 4 * 1024 * 1024;

export interface KapiciSettings { rulesDir: string; timeoutMs: number; providers: ProviderName[]; route: 'auto' | JevRoute; keyName: string }

export function kapiciSettings(get: <T>(key: string, fallback: T) => T): KapiciSettings {
    const raw = get<unknown>('kapici.providers', ['heuristic', 'jev']);
    const providers = Array.isArray(raw) ? raw.filter((p): p is ProviderName => PROVIDERS.includes(p as ProviderName)) : [];
    const route = get<string>('kapici.route', 'auto');
    return {
        rulesDir: String(get<string>('kapici.rulesDir', '') ?? '').trim(),
        timeoutMs: Math.max(200, Number(get<number>('kapici.timeoutMs', DEFAULT_TIMEOUT_MS)) || DEFAULT_TIMEOUT_MS),
        providers: providers.length ? providers : ['heuristic', 'jev'],
        route: route === 'typesafe' || route === 'vercel' ? route : 'auto',
        keyName: String(get<string>('kapici.keyName', '') ?? '').trim()
    };
}

/** Which vault entry, and so which road: a named key wins; else the first candidate the vault holds. */
export function resolveKey(s: KapiciSettings, has: (name: string) => boolean): { name: string; route: JevRoute; present: boolean } {
    if (s.keyName) {
        const route: JevRoute = s.route !== 'auto' ? s.route : /gateway|vercel/i.test(s.keyName) ? 'vercel' : 'typesafe';
        return { name: s.keyName, route, present: has(s.keyName) };
    }
    const fits = KEY_CANDIDATES.filter(c => s.route === 'auto' || c.route === s.route);
    const c = fits.find(x => has(x.name)) ?? fits[0];
    return { name: c.name, route: c.route, present: has(c.name) };
}

export interface KapiciHostDeps {
    secret(name: string): string | undefined;
    secretValues(): string[];
    settings(): KapiciSettings;
    agentRoots(): string[];
    judge?(prompt: string): Promise<string>;
    auditDir: string;
    log(line: string): void;
    now?(): number;
    fetch?: FetchLike;
}

export class KapiciHost {
    readonly registry: RuleRegistry;
    private kapici: Kapici | undefined;
    private sig = '';

    constructor(private readonly d: KapiciHostDeps) {
        this.registry = new RuleRegistry(BUILTIN_RULES, () => systemRuleDirs(d.settings().rulesDir || undefined, d.agentRoots()));
    }

    key() { return resolveKey(this.d.settings(), n => !!this.d.secret(n)); }

    /** Built once and rebuilt when a setting or the key it reads changes (the cache goes with it). */
    get(): Kapici {
        const s = this.d.settings();
        const k = this.key();
        const sig = JSON.stringify([s, k.name, k.route]);
        if (!this.kapici || sig !== this.sig) {
            const judge = this.d.judge;
            const deps: KapiciDeps = {
                secret: async n => this.d.secret(n),
                secretValues: async () => this.d.secretValues(),
                ...(judge ? { judge: (p: string) => judge(p) } : {}),
                now: this.d.now ?? Date.now,
                log: l => this.d.log(l),
                auditDir: this.d.auditDir,
                rulesDirs: () => systemRuleDirs(s.rulesDir || undefined, this.d.agentRoots())
            };
            this.kapici = new Kapici(deps, this.registry, standardProviders(deps, { keyName: k.name, route: k.route, fetch: this.d.fetch }),
                { keyName: k.name, timeoutMs: s.timeoutMs, defaultChain: s.providers });
            this.sig = sig;
        }
        return this.kapici;
    }

    /** The dispatch consumer (M-57): nothing when off, so dispatchText runs exactly as it always has. */
    dispatch(mode: ConsumerSetting): DispatchKapici | undefined {
        if (mode === 'off') { return undefined; }
        return {
            mode,
            evaluate: (text, options, m, actual) => this.get().evaluate('dispatch.route', text,
                { consumer: 'dispatch', mode: m, options: { agent: options }, ...(actual !== undefined ? { actual } : {}) }),
            log: l => this.d.log(l)
        };
    }

    /** The trigger precondition consumer (M-59): nothing when off. The firing is the state; the rule is the precondition's own. */
    trigger(mode: ConsumerSetting): TriggerKapici | undefined {
        if (mode === 'off') { return undefined; }
        return {
            mode,
            evaluate: (rule, state, m, actual) => this.get().evaluate(rule, state, { consumer: 'trigger', mode: m, ...(actual !== undefined ? { actual } : {}) }),
            diff: gitDiff,
            log: l => this.d.log(l)
        };
    }

    /** The workflow step consumer (M-60): nothing when off. */
    step(mode: ConsumerSetting): KapiciStepHook | undefined {
        return mode === 'off' ? undefined : { mode, log: l => this.d.log(l),
            evaluate: (rule, state, m, actual) => this.get().evaluate(rule, state, { consumer: 'workflow', mode: m, ...(actual !== undefined ? { actual } : {}) }) };
    }

    /** '' when the rule exists and can route a step; the rules that can, for the step card. */
    stepRuleRefusal(id: string): string { const f = this.registry.find(id); return 'error' in f ? f.error : stepRuleFit(f.rule); }
    stepRules(): { id: string; description: string }[] { return this.registry.load().rules.filter(l => !stepRuleFit(l.rule)).map(l => ({ id: l.rule.id, description: l.rule.description })); }

    /** The retry supervisor consumer (M-58): nothing when off. The incident bundle is the state; the doable actions narrow the choice. */
    retry(mode: ConsumerSetting): SupervisorKapici | undefined {
        if (mode === 'off') { return undefined; }
        return {
            mode,
            evaluate: (bundle, options, m, actual) => this.get().evaluate('retry.next-action', bundle as unknown as Record<string, unknown>,
                { consumer: 'retry', mode: m, options: { action: options }, ...(actual !== undefined ? { actual } : {}) }),
            log: l => this.d.log(l)
        };
    }

    /** The rules and the files that failed, as kapici.rules answers them. */
    ruleList(projectRoot?: string) {
        const { rules, problems } = this.registry.load(projectRoot);
        return {
            rules: rules.map(l => ({
                id: l.rule.id, version: l.rule.version, description: l.rule.description, layer: l.layer, ...(l.file ? { file: l.file } : {}),
                ...(l.overrides?.length ? { overrides: l.overrides } : {}), providers: l.rule.providers ?? null,
                questions: Object.fromEntries(Object.entries(l.rule.questions).map(([id, q]) => [id, q.type + (q.check ? ' (local check)' : '')])),
                minConfidence: l.rule.minConfidence, onLowConfidence: l.rule.onLowConfidence, onFailure: l.rule.onFailure,
                golden: l.rule.golden.length, ...(l.rule.sensitive ? { sensitive: true } : {})
            })),
            problems
        };
    }

    /** Per consumer, how often the shadow agreed over the last `days`. */
    agreement(days = 30): Record<string, Agreement> {
        return shadowAgreement(readAudit(this.d.auditDir, { since: Date.now() - days * 86_400_000, limit: 5000 }));
    }

    status() {
        const s = this.d.settings();
        const k = this.key();
        const { rules, problems } = this.registry.load();
        return {
            key: { name: k.name, present: k.present, route: k.route, url: JEV_ROUTES[k.route].url, model: JEV_ROUTES[k.route].model },
            candidates: (s.keyName ? [{ name: s.keyName }] : KEY_CANDIDATES).map(c => ({ name: c.name, present: !!this.d.secret(c.name) })),
            providers: { chain: s.providers, llm: !!this.d.judge },
            timeoutMs: s.timeoutMs,
            rules: rules.length, problems,
            rulesDirs: systemRuleDirs(s.rulesDir || undefined, this.d.agentRoots()),
            auditDir: this.d.auditDir
        };
    }
}

/** The state from `state` (text or object) or `statePath` (a file, for big input and a shell that eats quotes). */
export function stateArg(args: Record<string, unknown>): KapiciState {
    const p = optStr(args, 'statePath');
    if (p) {
        need(path.isAbsolute(p), 'statePath is an absolute path to a file.');
        let size = -1;
        try { size = fs.statSync(p).size; } catch { need(false, `statePath: no file at ${p}.`); }
        need(size <= STATE_FILE_MAX, `statePath: ${size} bytes — the limit is ${STATE_FILE_MAX}; it is trimmed to the rule's budget anyway, so cut it down first.`);
        const text = fs.readFileSync(p, 'utf8');
        if (/\.json$/i.test(p)) { try { const v = JSON.parse(text); if (v && typeof v === 'object') { return v as Record<string, unknown>; } } catch { /* read as text */ } }
        return text;
    }
    const s = args.state;
    need(typeof s === 'string' ? s.length > 0 : !!s && typeof s === 'object', 'state (text or an object) or statePath is required.');
    return s as KapiciState;
}

function objArg<T>(args: Record<string, unknown>, ...keys: string[]): T | undefined {
    for (const k of keys) { const v = args[k]; if (v !== undefined && v !== null) { need(typeof v === 'object', `${k} is an object.`); return v as T; } }
    return undefined;
}

const figures = (a: KapiciAnswer | undefined) => a ? { ...(a.choice !== undefined ? { choice: a.choice } : {}), ...(a.p !== undefined ? { p: a.p } : {}), ...(a.score !== undefined ? { score: a.score } : {}), confidence: a.confidence } : undefined;

/** Does an answer meet a golden expectation: the choice key · true/false for a noul (p > 0.5) · the lowest acceptable score. */
export function meets(a: KapiciAnswer | undefined, want: string | boolean | number): boolean {
    if (!a) { return false; }
    if (typeof want === 'boolean') { return ((a.p ?? 0) > 0.5) === want; }
    if (typeof want === 'number') { return (a.score ?? -Infinity) >= want; }
    return a.choice === want;
}

export function registerKapiciOps(bridge: BridgeRegistry, host: KapiciHost): void {
    const project = (args: Record<string, unknown>) => optStr(args, 'project') || undefined;
    bridge.register([
        {
            op: 'kapici.eval',
            describe: 'Put a state to a Kapıcı rule and get its verdict {passed, decision, confidence, answers, reason, provider, latencyMs, costUsd?, fallback?, ruleId, ruleVersion, layer, model?, cached?}. args: rule (id), state (text or object) or statePath (absolute file; .json is read as an object), criteria? (call-time options per question: a list or {key: text} — a "$call" question needs them, a fixed one may be narrowed), project? (a project root: its .kapici/ rules win), consumer? (the audit column, default "bridge"), noCache?. Never fails for a missing key or rule: the verdict says fallback and why. Every call leaves one audit line (kapici.audit).',
            handler: async (args) => host.get().evaluate(argStr(args, 'rule'), stateArg(args), {
                consumer: optStr(args, 'consumer') || 'bridge', options: objArg<CallOptions>(args, 'criteria', 'options'),
                projectRoot: project(args), noCache: optBool(args, 'noCache')
            })
        },
        {
            op: 'kapici.ask',
            describe: 'Ask Kapıcı typed questions without writing a rule — one-off. args: state or statePath, questions {id: {type: noul|choice|score, instructions, criteria?, check?}}, providers? (list, in order; default the setting agentFarm.kapici.providers), consumer?. Answers every question with its confidence (a question with a check is answered locally and never sent).',
            handler: async (args) => {
                const questions = objArg<Record<string, KapiciQuestion>>(args, 'questions');
                need(questions, 'questions is required: {id: {type, instructions, criteria?}}.');
                const providers = args.providers === undefined ? undefined : (Array.isArray(args.providers) ? args.providers : String(args.providers).split(',')).map(p => String(p).trim()) as ProviderName[];
                need(!providers || (providers.length && providers.every(p => PROVIDERS.includes(p))), `providers is a list of ${PROVIDERS.join(', ')}.`);
                return host.get().ask(stateArg(args), questions as Record<string, KapiciQuestion>, { consumer: optStr(args, 'consumer') || 'bridge', providers, projectRoot: project(args) });
            }
        },
        {
            op: 'kapici.rules',
            describe: 'Every Kapıcı rule visible (from a project too, with project=<root>): id, version, description, the layer that won (builtin | system | project) and what it overrode, its file, providers, questions, golden example count; plus every rule file that failed, with the reason.',
            handler: async (args) => {
                return host.ruleList(project(args));
            }
        },
        {
            op: 'kapici.rule.check',
            describe: 'Run a Kapıcı rule\'s golden examples through the real providers and say which pass. args: rule (id), project?. Each example is one real call (Jev input is billed per token; nothing is cached); answers {rule, version, layer, passed, total, cases:[{i, ok, expect, got, decision, provider, fallback?}]}.',
            handler: async (args) => {
                const id = argStr(args, 'rule');
                const found = host.registry.find(id, project(args));
                need(!('error' in found), 'error' in found ? found.error : '');
                const l = found as Exclude<typeof found, { error: string }>;
                const cases = [];
                for (const [i, g] of l.rule.golden.entries()) {
                    const v = await host.get().evaluate(id, g.state, { consumer: 'rule.check', options: g.options, projectRoot: project(args), noCache: true });
                    const ok = Object.entries(g.expect).every(([q, want]) => meets(v.answers[q], want));
                    cases.push({ i, ok, expect: g.expect, got: Object.fromEntries(Object.keys(g.expect).map(q => [q, figures(v.answers[q]) ?? null])), decision: v.decision, provider: v.provider, ...(v.fallback ? { fallback: v.fallback, reason: v.reason } : {}) });
                }
                return { rule: id, version: l.rule.version, layer: l.layer, passed: cases.filter(c => c.ok).length, total: cases.length, cases };
            }
        },
        {
            op: 'kapici.audit',
            describe: 'Kapıcı\'s recent decisions, newest first, and per consumer how often its answer agreed with what today\'s mechanism did (shadow mode). args: consumer?, rule?, since? (ISO time or epoch ms), limit? (default 50). A line holds the hash and length of the input, never the input or a key.',
            handler: async (args) => {
                const sinceRaw = optStr(args, 'since');
                const since = sinceRaw ? (/^\d+$/.test(sinceRaw) ? Number(sinceRaw) : Date.parse(sinceRaw)) : undefined;
                need(since === undefined || Number.isFinite(since), 'since is an ISO time or epoch milliseconds.');
                const entries = readAudit(host.status().auditDir, { consumer: optStr(args, 'consumer') || undefined, ruleId: optStr(args, 'rule') || undefined, since, limit: optNum(args, 'limit', 50) });
                return { entries, agreement: shadowAgreement(entries) };
            }
        },
        {
            op: 'kapici.status',
            describe: 'Kapıcı\'s state: which vault key it would use and whether it is PRESENT (never its value), the road (typesafe | vercel) with its address and model, the provider order, whether an LLM judge is wired, the timeout, how many rules load and which files failed, the rule folders and the audit folder.',
            handler: async () => host.status()
        }
    ]);
}
