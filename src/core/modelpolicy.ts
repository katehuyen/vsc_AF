/**
 * I5 — Model policy engine. Rule-based model selection for spawned tasks:
 * route routine automation to a cheap model, keep manual work on the agent's
 * default, and downgrade everything automatically when the 5h quota window
 * fills up. Pure logic — the TaskManager asks it for extra CLI args.
 */

export type TaskSource = 'trigger' | 'schedule' | 'workflow' | 'manual';

export interface ModelPolicyRule {
    /** which launches the rule applies to; 'any' = all */
    source?: TaskSource | 'any';
    /** case-insensitive regex on the agent name (empty = any agent) */
    agent?: string;
    /** case-insensitive regex on the prompt (empty = any prompt) */
    promptMatch?: string;
    /** model id or alias passed as --model */
    model: string;
}

export interface PolicyInput {
    fromTrigger?: string;
    fromSchedule?: string;
    workflowId?: string;
    agentName: string;
    prompt: string;
}

export function taskSource(t: PolicyInput): TaskSource {
    if (t.fromTrigger) { return 'trigger'; }
    if (t.fromSchedule) { return 'schedule'; }
    if (t.workflowId !== undefined) { return 'workflow'; }
    return 'manual';
}

function safeTest(pattern: string | undefined, value: string): boolean {
    if (!pattern) { return true; }
    try { return new RegExp(pattern, 'i').test(value); } catch { return false; }
}

/** First matching rule wins; returns the model to force, or undefined. */
export function pickModel(t: PolicyInput, rules: ModelPolicyRule[]): string | undefined {
    const source = taskSource(t);
    for (const r of rules) {
        if (!r?.model) { continue; }
        const src = r.source ?? 'any';
        if (src !== 'any' && src !== source) { continue; }
        if (!safeTest(r.agent, t.agentName)) { continue; }
        if (!safeTest(r.promptMatch, t.prompt)) { continue; }
        return r.model;
    }
    return undefined;
}

export interface QuotaDowngrade {
    /** window fill percent at which the downgrade kicks in (0 = off) */
    percent: number;
    /** model forced above the threshold */
    model: string;
}

/**
 * Decide the --model override for a task launch.
 * Order: quota downgrade (protects the window) > policy rules > none.
 */
export function modelArgsFor(
    t: PolicyInput,
    rules: ModelPolicyRule[],
    quotaPct: number | undefined,
    downgrade: QuotaDowngrade
): { args: string; reason: string } | undefined {
    if (downgrade.percent > 0 && downgrade.model &&
        quotaPct !== undefined && quotaPct >= downgrade.percent) {
        return {
            args: `--model ${downgrade.model}`,
            reason: `quota window ${Math.round(quotaPct)}% ≥ ${downgrade.percent}% — downgraded to ${downgrade.model}`
        };
    }
    const model = pickModel(t, rules);
    if (model) {
        return { args: `--model ${model}`, reason: `policy rule (${taskSource(t)}) → ${model}` };
    }
    return undefined;
}
