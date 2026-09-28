/**
 * X-410 — Kapici's contracts. The core under src/core/kapici/ imports nothing
 * outside this folder and never vscode; everything Agent-Farm-specific comes
 * in through KapiciDeps, so the folder can one day leave as a package.
 * Question shapes match the TypeSafe API field for field (type, instructions, criteria).
 */

export type QuestionType = 'noul' | 'choice' | 'score';
export const QUESTION_TYPES: readonly QuestionType[] = ['noul', 'choice', 'score'];

/** "$call" = the options arrive with the call (a dispatch's agent list). */
export type Criteria = Record<string, string> | '$call';

/** A deterministic check the heuristic provider answers a noul with (p 0 or 1, confidence 1). */
export type HeuristicCheck =
    | { op: 'empty' }
    | { op: 'regex'; pattern: string; flags?: string }
    | { op: 'num'; lt?: number; gt?: number }
    | { op: 'date'; before?: string; after?: string }
    | { op: 'lines' | 'chars'; lt?: number; gt?: number };
export const HEURISTIC_OPS = ['empty', 'regex', 'num', 'date', 'lines', 'chars'] as const;

export interface KapiciQuestion {
    type: QuestionType;
    instructions: string;
    /** noul: optional clarifying text · choice: 1–255 options · score: 2–10 levels. */
    criteria?: Criteria | string;
    check?: HeuristicCheck;
}

export type ProviderName = 'jev' | 'heuristic' | 'llm';
export const PROVIDERS: readonly ProviderName[] = ['jev', 'heuristic', 'llm'];

export interface KapiciCond { q: string; noulGt?: number; noulLt?: number; choiceIs?: string }

export interface KapiciDecide {
    /** The decision is this choice question's pick. */
    actionFrom?: string;
    passIf?: KapiciCond;
    rejectIf?: KapiciCond;
    scoreMin?: { q: string; min: number };
}

export type LowConfidencePath = 'escalate' | 'mechanical' | 'ask';
export const LOW_CONFIDENCE_PATHS: readonly LowConfidencePath[] = ['escalate', 'mechanical', 'ask'];
export type FailurePath = 'open' | 'closed' | 'fallback';
export const FAILURE_PATHS: readonly FailurePath[] = ['open', 'closed', 'fallback'];

export type KapiciState = string | Record<string, unknown>;

/** Call-time options: a full set for a "$call" question, a subset of the rule's own for a fixed one. */
export type CallOptions = Record<string, Record<string, string> | string[]>;

export interface KapiciGolden {
    state: KapiciState;
    options?: CallOptions;
    /** Per question: the choice key · true/false for a noul (p > 0.5) · the lowest acceptable score. */
    expect: Record<string, string | boolean | number>;
}

export interface KapiciRule {
    id: string;
    version: number;
    description: string;
    providers?: ProviderName[];
    questions: Record<string, KapiciQuestion>;
    decide: KapiciDecide;
    minConfidence: number;
    onLowConfidence: LowConfidencePath;
    onFailure: FailurePath;
    inputBudgetChars?: number;
    timeoutMs?: number;
    /** Never leaves the machine: no external provider, no cache. */
    sensitive?: boolean;
    golden: KapiciGolden[];
}

export type RuleLayer = 'builtin' | 'system' | 'project';
export const RULE_LAYERS: readonly RuleLayer[] = ['builtin', 'system', 'project'];

/** A rule as the registry hands it out: which layer won, and from which file. */
export interface LoadedRule { rule: KapiciRule; layer: RuleLayer; file?: string; overrides?: RuleLayer[] }

export interface KapiciAnswer {
    type: QuestionType;
    /** noul: the probability the statement is true. */
    p?: number;
    choice?: string;
    probs?: Record<string, number>;
    score?: number;
    confidence: number;
}

export type ProviderErrorKind = 'timeout' | 'auth' | 'rate' | 'server' | 'bad-reply' | 'network' | 'invalid' | 'no-key';

export type ProviderResult =
    | { answers: Record<string, KapiciAnswer>; model: string; latencyMs: number; costUsd?: number }
    | { error: string; kind: ProviderErrorKind };

export interface KapiciProvider {
    name: ProviderName;
    ask(state: KapiciState, questions: Record<string, KapiciQuestion>, o: { timeoutMs: number; signal?: AbortSignal }): Promise<ProviderResult>;
}

export interface KapiciVerdict {
    passed: boolean;
    decision: string;
    confidence: number;
    answers: Record<string, KapiciAnswer>;
    /** Synthesized from the answers — Jev writes no text. */
    reason: string;
    provider: ProviderName | 'none';
    latencyMs: number;
    costUsd?: number;
    /** Set when the verdict is not the provider's own: which path the rule sent it down. */
    fallback?: FailurePath | 'mechanical' | 'ask';
    ruleId: string;
    ruleVersion: number;
    layer: RuleLayer;
    model?: string;
    /** Served from the short-lived cache; nothing was asked. */
    cached?: boolean;
}

/** The one door Agent Farm comes in through. */
export interface KapiciDeps {
    secret(name: string): Promise<string | undefined>;
    /** Every value in the Secret vault, so masking catches them even where no pattern would. */
    secretValues?(): Promise<string[]>;
    judge?(prompt: string, signal?: AbortSignal): Promise<string>;
    now(): number;
    log(line: string): void;
    auditDir: string;
    /** System-layer folders (agentFarm.kapici.rulesDir, else _KAPICI in every agent root). */
    rulesDirs(): string[];
}
