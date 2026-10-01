/**
 * M-60 — a workflow step Kapıcı decides: { kapici: { rule, input?, onReject? } }.
 * The step's input template, filled from the run, is the state; the verdict is
 * a route — proceed, stop or ask_user — the same words the checkpoint
 * supervisor's decisions use, so the row and the run board show it the same
 * way. A pass/reject rule proceeds on pass and takes `onReject` (stop by
 * default) otherwise; a choice rule whose options are the routes names one.
 * off carries on as if the step were not there; shadow carries on and audits;
 * on lets a confident verdict route, the rule's onFailure / low-confidence path
 * decides the rest (closed stops, ask asks you, anything else carries on).
 */
import { ConsumerSetting, gate } from './kapici/shadow';
import { KapiciRule, KapiciState, KapiciVerdict } from './kapici/types';

export const KAPICI_ROUTES = ['proceed', 'stop', 'ask_user'] as const;
export type KapiciRoute = typeof KAPICI_ROUTES[number];
export const ON_REJECT = ['stop', 'ask_user'] as const;
export type OnReject = typeof ON_REJECT[number];
export const DEFAULT_STEP_INPUT = '{prev_text}';
/** Who answered, on the supervisor trail — a Kapıcı step is not a supervisor call. */
export const KAPICI_MODEL = 'Gatekeeper';

export interface KapiciStepSpec { rule: string; input?: string; onReject?: OnReject }

export interface KapiciStepHook {
    mode: ConsumerSetting;
    evaluate(rule: string, state: KapiciState, mode: 'on' | 'shadow', actual?: string): Promise<KapiciVerdict>;
    log?(line: string): void;
}

export interface KapiciStepOutcome { route: KapiciRoute; why: string; by: 'today' | 'kapici'; verdict?: KapiciVerdict; shadow?: Promise<KapiciVerdict | undefined> }

const isRoute = (x: unknown): x is KapiciRoute => (KAPICI_ROUTES as readonly unknown[]).includes(x);

/** The step's own shape, and where it may stand; '' = fine. */
export function kapiciStepRefusal(spec: unknown, step: { parallel?: unknown; forEach?: unknown } = {}): string {
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) { return 'a Gatekeeper step is {rule, input?, onReject?}'; }
    const s = spec as Record<string, unknown>;
    if (typeof s.rule !== 'string' || !/^[\w.-]{1,80}$/.test(s.rule.trim())) { return 'a Gatekeeper step names its rule — a rule id such as trigger.has-work (kapici.rules lists them)'; }
    if (s.input !== undefined && (typeof s.input !== 'string' || s.input.length > 4000)) { return 'a Gatekeeper step\'s input is a text template of at most 4000 characters'; }
    if (s.onReject !== undefined && !(ON_REJECT as readonly unknown[]).includes(s.onReject)) { return 'onReject is stop or ask_user'; }
    if (step.parallel || step.forEach) { return 'a Gatekeeper step decides where the chain goes, so it cannot run in parallel or once per item'; }
    return '';
}

/** Can this rule route a step? '' = yes. */
export function stepRuleFit(rule: KapiciRule): string {
    const d = rule.decide ?? {};
    if (d.passIf || d.rejectIf || d.scoreMin) { return ''; }
    const q = d.actionFrom ? rule.questions[d.actionFrom] : undefined;
    if (q && q.type === 'choice' && q.criteria && typeof q.criteria === 'object') {
        const keys = Object.keys(q.criteria);
        const odd = keys.filter(k => !isRoute(k));
        if (keys.length && !odd.length) { return ''; }
        return `rule ${rule.id} picks among ${keys.join(', ')} — a step routes on ${KAPICI_ROUTES.join(' / ')}, or on a pass/reject rule`;
    }
    return `rule ${rule.id} decides nothing a step can route on — it needs passIf / rejectIf / scoreMin, or a choice among ${KAPICI_ROUTES.join(' / ')}`;
}

/** A confident verdict as a route. */
export function routeOfVerdict(v: KapiciVerdict, spec: KapiciStepSpec): KapiciRoute {
    if (isRoute(v.decision)) { return v.decision; }
    return v.passed ? 'proceed' : (spec.onReject ?? 'stop');
}

/** Where the chain goes, and why. Never throws: whatever goes wrong carries on, as the chain would without the step. */
export async function kapiciStepRoute(spec: KapiciStepSpec, state: KapiciState, hook: KapiciStepHook | undefined): Promise<KapiciStepOutcome> {
    const rule = spec.rule;
    if (!hook || hook.mode === 'off') { return { route: 'proceed', why: `Gatekeeper is off for workflows — carried on without asking ${rule}`, by: 'today' }; }
    try {
        const g = await gate<KapiciRoute>({
            mode: hook.mode, today: async () => 'proceed',
            ask: (m, actual) => hook.evaluate(rule, state, m, actual),
            decisionOf: r => (r === 'proceed' ? 'pass' : r), fromVerdict: v => routeOfVerdict(v, spec), log: hook.log
        });
        if (g.shadow) { return { route: 'proceed', why: `Gatekeeper watches ${rule} in shadow — carried on as without it`, by: 'today', shadow: g.shadow }; }
        const v = g.verdict;
        if (g.by === 'kapici' && v) { return { route: g.value, why: `Gatekeeper: ${rule} — ${v.reason} (confidence ${v.confidence.toFixed(2)})`, by: 'kapici', verdict: v }; }
        if (v?.fallback === 'closed') { return { route: 'stop', why: `Gatekeeper: ${rule} — ${v.reason}`, by: 'kapici', verdict: v }; }
        if (v?.fallback === 'ask') { return { route: 'ask_user', why: `Gatekeeper: ${rule} is not sure — ${v.reason}`, by: 'kapici', verdict: v }; }
        return { route: 'proceed', why: v ? `Gatekeeper: ${rule} could not decide — ${v.reason}; carried on` : 'carried on without Gatekeeper', by: 'today', ...(v ? { verdict: v } : {}) };
    } catch (e) {
        hook.log?.(`kapici step: ${(e as Error)?.message ?? e} — carried on`);
        return { route: 'proceed', why: 'Gatekeeper failed — carried on', by: 'today' };
    }
}
