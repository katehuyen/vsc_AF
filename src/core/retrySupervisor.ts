/**
 * ‼️ M-13 — THE SUPERVISOR: an opt-in third answer to "the run hit its limit
 * after doing work — how does it go on?".
 *
 * M-10's deterministic Smart Continue is right for most cut-off runs and costs
 * nothing. Some are not served by "carry on from where you were": the run took
 * a wrong turn, stalled on a test, left a dirty tree, or the next turn has to
 * be re-aimed at the original task. For those the user can let a small, bounded
 * agent look at a STRUCTURED INCIDENT (never the raw transcript) and return one
 * decision the TaskManager then validates and applies.
 *
 * Everything here is pure: the policy, the decision contract and its
 * validator, when the supervisor may be asked (the quota truth), the incident
 * bundle and its prompt. The call itself and the applying live elsewhere.
 *
 * ‼️ THE SUPERVISOR DECIDES, IT DOES NOT ACT. It gets read/plan rights only; it
 * cannot start a task, commit, push or close a backlog item. Its whole output
 * is the JSON below, and anything outside that contract is refused.
 */
import { answerObject, AnswerObject, ceilingRefusal, underConfidence } from './decisionCore';

export type SupervisorAction = 'resume' | 'retryOriginal' | 'wait' | 'stop' | 'needsUser';
export const SUPERVISOR_ACTIONS: readonly SupervisorAction[] = ['resume', 'retryOriginal', 'wait', 'stop', 'needsUser'];

/** What a low-confidence (or failed, or unaffordable) supervisor falls back to. */
export type SupervisorFallback = 'smart' | 'park' | 'stop';
export const SUPERVISOR_FALLBACKS: readonly SupervisorFallback[] = ['smart', 'park', 'stop'];

export interface SupervisorPolicy {
    /** the engine that judges — claude, codex, gemini, agy, … */
    engine: string;
    model?: string;
    /** the agent whose folder it runs in (read-only); absent = the task's own */
    agent?: string;
    /** supervisor calls per task, all incidents together */
    maxCalls: number;
    /** USD across those calls; absent = no money cap (the call cap still holds) */
    budgetUsd?: number;
    /** a decision below this confidence is not applied */
    minConfidence: number;
    lowConfidence: SupervisorFallback;
}

export const SUPERVISOR_DEFAULT_CALLS = 2;
export const SUPERVISOR_MAX_CALLS = 5;
export const SUPERVISOR_DEFAULT_CONFIDENCE = 0.6;
/** the longest `wait` a supervisor may ask for — a decision is never an open-ended park */
export const SUPERVISOR_MAX_WAIT_MIN = 12 * 60;
export const SUPERVISOR_PROMPT_MAX_CHARS = 2000;

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** A stored or typed policy, made safe; undefined when there is no engine to ask. */
export function normalizeSupervisor(raw: unknown): SupervisorPolicy | undefined {
    if (!raw || typeof raw !== 'object') { return undefined; }
    const o = raw as Record<string, unknown>;
    const engine = typeof o.engine === 'string' ? o.engine.trim().toLowerCase() : '';
    if (!engine) { return undefined; }
    const calls = num(o.maxCalls);
    const conf = num(o.minConfidence);
    const budget = num(o.budgetUsd);
    const fb = SUPERVISOR_FALLBACKS.includes(o.lowConfidence as SupervisorFallback) ? o.lowConfidence as SupervisorFallback : 'smart';
    return {
        engine,
        ...(typeof o.model === 'string' && o.model.trim() ? { model: o.model.trim() } : {}),
        ...(typeof o.agent === 'string' && o.agent.trim() ? { agent: o.agent.trim() } : {}),
        maxCalls: calls === undefined ? SUPERVISOR_DEFAULT_CALLS : Math.max(1, Math.min(SUPERVISOR_MAX_CALLS, Math.round(calls))),
        ...(budget !== undefined && budget > 0 ? { budgetUsd: budget } : {}),
        minConfidence: conf === undefined ? SUPERVISOR_DEFAULT_CONFIDENCE : Math.max(0, Math.min(1, conf)),
        lowConfidence: fb
    };
}

/** A stored policy as the task form's boxes (media/afSupervisor.js): text, '' = not said. */
export function supervisorDraft(raw: unknown): Record<string, string> {
    const s = normalizeSupervisor(raw);
    return {
        engine: s?.engine ?? '', model: s?.model ?? '',
        maxCalls: s ? String(s.maxCalls) : '', budgetUsd: s?.budgetUsd !== undefined ? String(s.budgetUsd) : '',
        minConfidence: s ? String(s.minConfidence) : '', lowConfidence: s?.lowConfidence ?? 'smart'
    };
}

export interface ContinuationDecision {
    action: SupervisorAction;
    /** absolute ms; required for `wait`, optional otherwise */
    notBefore?: number;
    /** the next turn, for `resume` (required) or `retryOriginal` (a replacement prompt, optional) */
    prompt?: string;
    reason: string;
    confidence: number;
}

/** The engine's answer as text → the one JSON object in it. A fenced block, prose around it: tolerated; two objects or none: refused. */
export function parseDecision(text: string): AnswerObject {
    return answerObject(text);
}

export interface DecisionContext {
    now: number;
    /** the limit's reset, when known: nothing may be scheduled before it */
    resetAt?: number;
    /** the cut-off run's session is known and resumable */
    resumable: boolean;
    maxWaitMin?: number;
}

/**
 * ‼️ THE TASKMANAGER'S CHECK, NOT THE SUPERVISOR'S WORD. Every refusal names
 * what was wrong, because a refused decision falls back and the row must say why.
 */
export function validateDecision(raw: Record<string, unknown>, ctx: DecisionContext): { ok: true; decision: ContinuationDecision } | { ok: false; error: string } {
    const action = raw.action as SupervisorAction;
    if (!SUPERVISOR_ACTIONS.includes(action)) { return { ok: false, error: `unsupported action "${String(raw.action)}"` }; }
    const reason = typeof raw.reason === 'string' ? raw.reason.trim() : '';
    if (!reason) { return { ok: false, error: 'the decision gives no reason' }; }
    const confidence = num(raw.confidence);
    if (confidence === undefined || confidence < 0 || confidence > 1) { return { ok: false, error: 'confidence must be a number from 0 to 1' }; }
    const prompt = typeof raw.prompt === 'string' ? raw.prompt.trim() : '';
    if (prompt.length > SUPERVISOR_PROMPT_MAX_CHARS) { return { ok: false, error: `the prompt is longer than ${SUPERVISOR_PROMPT_MAX_CHARS} characters` }; }
    const nb = raw.notBefore === undefined || raw.notBefore === null ? undefined
        : num(raw.notBefore) ?? (typeof raw.notBefore === 'string' ? Date.parse(raw.notBefore) : NaN);
    if (nb !== undefined && !Number.isFinite(nb)) { return { ok: false, error: 'notBefore is not a time' }; }
    if (action === 'resume') {
        if (!ctx.resumable) { return { ok: false, error: 'resume names a session that is not known — nothing to continue' }; }
        if (!prompt) { return { ok: false, error: 'resume needs the prompt to send' }; }
    }
    if (action === 'wait' && nb === undefined) { return { ok: false, error: 'wait needs notBefore' }; }
    if (nb !== undefined && ctx.resetAt && nb < ctx.resetAt) { return { ok: false, error: 'notBefore is before the limit resets' }; }
    const cap = ctx.now + (ctx.maxWaitMin ?? SUPERVISOR_MAX_WAIT_MIN) * 60_000;
    if (nb !== undefined && nb > cap) { return { ok: false, error: `notBefore is beyond the ${ctx.maxWaitMin ?? SUPERVISOR_MAX_WAIT_MIN}-minute ceiling — an unbounded wait is not a decision` }; }
    return {
        ok: true,
        decision: { action, reason, confidence, ...(prompt ? { prompt } : {}), ...(nb !== undefined ? { notBefore: nb } : {}) }
    };
}

/** Below the threshold the decision is recorded and NOT applied. */
export function confident(d: ContinuationDecision, p: SupervisorPolicy): boolean {
    return !underConfidence(d.confidence, p.minConfidence);
}

/** Engines that share one plan window share one limit: a Claude slot is its own, every other engine its own. */
export function limitDomain(engine: string, account?: string): string {
    const e = String(engine ?? '').trim().toLowerCase();
    return e === 'claude' ? `claude:${String(account ?? '').trim() || 'default'}` : e;
}

export type SupervisorRoom = 'free' | 'full' | 'unknown';

/**
 * ‼️ THE QUOTA TRUTH. "Haiku always rescues" is false: a Claude supervisor on
 * the task's own slot shares the window that just filled. So:
 * same domain → not before the reset (or the planned retry, when no reset is known);
 * another domain with room → now; full or unknown → the planned retry time —
 * unknown usage is never read as an empty meter.
 */
export function supervisorWhen(o: {
    now: number; plannedAt: number; resetAt?: number;
    taskEngine: string; taskAccount?: string;
    supervisor: SupervisorPolicy; supervisorAccount?: string; room: SupervisorRoom;
}): { at: number; why: string } {
    const same = limitDomain(o.taskEngine, o.taskAccount) === limitDomain(o.supervisor.engine, o.supervisorAccount);
    if (same) {
        const at = Math.max(o.now, o.resetAt ?? o.plannedAt);
        return { at, why: `the supervisor (${o.supervisor.engine}) shares the limit that just filled, so it is asked once the window resets` };
    }
    if (o.room === 'free') { return { at: o.now, why: `the supervisor (${o.supervisor.engine}) runs on a separate limit with room — asked now` }; }
    return {
        at: Math.max(o.now, o.plannedAt),
        why: o.room === 'full'
            ? `the supervisor's own limit (${o.supervisor.engine}) is full too — asked at the planned retry time`
            : `the supervisor's usage (${o.supervisor.engine}) is not known, and unknown is not read as room — asked at the planned retry time`
    };
}

/** One incident, one call: the key survives a restart so a reload never asks twice. */
export function incidentKey(taskId: string, attempt: number, failedAt: number): string {
    return `${taskId}#${Math.max(0, Math.round(attempt))}@${Math.round(failedAt)}`;
}

/** Whether another call may be made — the call cap and the money cap, said in words. */
export function supervisorRefusal(p: SupervisorPolicy, used: { calls: number; spentUsd: number }): string {
    // M-48 — the shared ceiling; the money cap is a HARD cap here (X-370)
    return ceilingRefusal({ calls: used.calls, maxCalls: p.maxCalls, spentUSD: used.spentUsd, budgetUSD: p.budgetUsd, per: 'task' });
}
