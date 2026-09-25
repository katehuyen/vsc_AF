/**
 * U-153 — what the supervisor did on a workflow run, one row per checkpoint
 * visit: what fired, what it decided, why, how sure, what it cost, who
 * answered and which level its settings came from. The run page, the Live
 * Timeline strip and `workflows.supervisor.status` all read THIS, so the three
 * cannot disagree. Pure.
 */
import { DecisionKind, SupervisorDecision } from './supervisorDecision';
import { liveLines, RunLive } from './workflowLive';

/** One checkpoint visit, as the run kept it on the visit's own row. */
export interface SupervisorCall {
    /** "checkpoint", or the wake conditions that fired */
    trigger: string;
    decision?: DecisionKind;
    target?: string;
    why?: string;
    confidence?: number;
    /** the run went the mechanical way, and why */
    mechanical?: string;
    /** who answered: a model, "you" (your own decision) — unset = nobody was asked */
    model?: string;
    /** which level the checkpoint limits came from */
    limitsOrigin: string;
    /** which level the supervisor settings came from */
    supervisorOrigin: string;
    /** the supervisor's conversation, to open at `at` */
    sessionId?: string;
    at: number;
}

export const DECISION_BADGE: Readonly<Record<DecisionKind, string>> = {
    proceed: '✓', retry: '↻', jump: '⤳', insert: '＋', ask_user: '?', stop: '■'
};
const MECHANICAL_BADGE = '→';

export function supervisorCall(o: {
    trigger: string; decision?: SupervisorDecision; mechanical?: string; model?: string;
    limitsOrigin: string; supervisorOrigin: string; sessionId?: string; at: number;
}): SupervisorCall {
    const d = o.decision;
    return {
        trigger: o.trigger,
        ...(d ? { decision: d.decision } : {}),
        ...(d?.target ? { target: d.target } : {}),
        ...(d?.why ? { why: d.why } : {}),
        ...(typeof d?.confidence === 'number' ? { confidence: d.confidence } : {}),
        ...(o.mechanical ? { mechanical: o.mechanical } : {}),
        ...(o.model ? { model: o.model } : {}),
        limitsOrigin: o.limitsOrigin,
        supervisorOrigin: o.supervisorOrigin,
        ...(o.sessionId ? { sessionId: o.sessionId } : {}),
        at: o.at
    };
}

export interface TrailRow extends SupervisorCall {
    taskId: string;
    /** 1-based step the visit stood at */
    step: number;
    title: string;
    costUSD?: number;
    /** SHORTHAND: ✓ ↻ ⤳ ＋ ? ■, or → when the run went the mechanical way */
    badge: string;
    /** the long form the badge stands for */
    word: string;
}

export interface SupervisorTrail {
    runId: string;
    rows: TrailRow[];
    calls: number;
    costUSD: number;
    /** the run's live settings (M-46), one line each */
    live: string[];
}

export interface TrailTask {
    id: string; workflowRunId?: string; stepIndex?: number; title: string;
    costUSD?: number; supervisorCall?: SupervisorCall;
}

export function trailRow(t: TrailTask & { supervisorCall: SupervisorCall }): TrailRow {
    const c = t.supervisorCall;
    const mech = !c.decision || !!c.mechanical;
    const word = mech ? `carried on the mechanical way${c.mechanical ? ` — ${c.mechanical}` : ''}`
        : `${c.decision === 'ask_user' ? 'ask you' : c.decision}${c.target ? ` ${c.target}` : ''}`;
    return {
        ...c, taskId: t.id, step: (t.stepIndex ?? 0) + 1, title: t.title,
        ...(typeof t.costUSD === 'number' ? { costUSD: t.costUSD } : {}),
        badge: mech ? MECHANICAL_BADGE : DECISION_BADGE[c.decision!], word
    };
}

export function supervisorTrail(runId: string, tasks: readonly TrailTask[],
    rec?: { supervisor?: { calls?: number; costUSD?: number }; live?: RunLive }): SupervisorTrail {
    const rows = tasks.filter((t): t is TrailTask & { supervisorCall: SupervisorCall } => t.workflowRunId === runId && !!t.supervisorCall)
        .map(trailRow).sort((a, b) => a.at - b.at);
    const spent = rows.reduce((a, r) => a + (r.costUSD ?? 0), 0);
    return {
        runId, rows,
        calls: rec?.supervisor?.calls ?? rows.filter(r => r.model && r.model !== 'you').length,
        costUSD: rec?.supervisor?.costUSD ?? spent,
        live: liveLines(rec?.live)
    };
}
