/**
 * M-58 — Kapıcı as the retry supervisor (M-13). The incident bundle is the
 * state; the five continuations are one choice question, and an action this
 * incident cannot take is never offered (resume needs a session to continue,
 * wait a known reset). Jev writes no text and no time, so what
 * validateDecision asks for is filled mechanically: resume's prompt is the
 * policy's own continuation text, wait's notBefore is the reset, the reason is
 * the synthesized one and the confidence is Jev's. The answer is written as
 * the supervisor's JSON, so it passes the same check an LLM's answer does.
 */
import type { IncidentBundle } from './retryIncident';
import { SUPERVISOR_ACTIONS, SupervisorAction } from './retrySupervisor';
import { ConsumerSetting } from './kapici/shadow';
import { KapiciVerdict } from './kapici/types';

export interface SupervisorContext { resumable: boolean; resetAt?: number }

/** The continuations this incident can really take, in the rule's order. */
export function supervisorOptions(ctx: SupervisorContext): SupervisorAction[] {
    return SUPERVISOR_ACTIONS.filter(a => (a !== 'resume' || ctx.resumable) && (a !== 'wait' || !!ctx.resetAt));
}

/** A confident verdict as the supervisor's JSON answer; undefined when it names nothing this incident can do. */
export function kapiciAnswerText(v: KapiciVerdict, ctx: SupervisorContext & { continuation: string }): string | undefined {
    const action = v.decision as SupervisorAction;
    if (!supervisorOptions(ctx).includes(action)) { return undefined; }
    const d: Record<string, unknown> = { action, reason: `Gatekeeper: ${v.reason}`, confidence: v.confidence };
    if (action === 'resume') { d.prompt = ctx.continuation; }
    if (action === 'wait') { d.notBefore = ctx.resetAt; }
    return JSON.stringify(d);
}

/** The retry consumer as the runner sees it; the host builds it from agentFarm.kapici.retry. */
export interface SupervisorKapici {
    mode: ConsumerSetting;
    evaluate(bundle: IncidentBundle, options: SupervisorAction[], mode: 'on' | 'shadow', actual?: string): Promise<KapiciVerdict>;
    log?(line: string): void;
}

/** The action named in a supervisor's raw answer, for the shadow comparison. */
export function answeredAction(text: string): string | undefined {
    const m = /"action"\s*:\s*"(\w+)"/.exec(text || '');
    return m && (SUPERVISOR_ACTIONS as readonly string[]).includes(m[1]) ? m[1] : undefined;
}
