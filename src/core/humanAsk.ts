import type { FleetWait } from './waits';

/** A step waiting on a person's answer: which kind of question, and its own words. */
export interface HumanAsk {
    kind: 'browser' | 'approval' | 'upload' | 'selection';
    /** the step's title — for an upload, the provider the files go to */
    title: string;
    url?: string;
    /** the question's detail — for an upload, the files */
    goal?: string;
}

/** An open ask as the task manager holds it while the step awaits. */
export interface OpenHumanAsk {
    runId: string;
    workflowTitle: string;
    taskId?: string;
    taskTitle?: string;
    kind: HumanAsk['kind'];
    what: string;
    since: number;
}

/**
 * ‼️ S-108 — ONE SENTENCE FOR ONE WAIT. The task row, farm.waits and the Needs
 * You row all build it here from the same inputs, so the three can never
 * describe the same question in three different ways.
 */
export function humanAskSentence(a: HumanAsk): string {
    const goal = String(a.goal ?? '').trim();
    switch (a.kind) {
        case 'browser': return `browser step "${a.title}" wants to run — ${a.url ?? ''}${goal ? ` (${goal})` : ''}`;
        case 'upload': return `send files from this computer to ${a.title}: ${goal}`;
        case 'selection': return `pick assets for "${a.title}"${goal ? ` — ${goal}` : ''}`;
        default: return `approve "${a.title}"${goal ? ` — ${goal}` : ''}`;
    }
}

/** The line a waiting task row carries. */
export const humanWaitLine = (what: string): string => `waiting for your answer: ${what}`;

/** The op that answers it: a picker has its own; every other ask is a Needs You row. */
export const humanAskOp = (kind: HumanAsk['kind']): string => kind === 'selection' ? 'workflows.select' : 'needs.act';

export function humanAskWaits(asks: OpenHumanAsk[]): FleetWait[] {
    return asks.map(a => ({
        kind: 'human-answer',
        subject: a.taskId
            ? { kind: 'task' as const, id: a.taskId, name: String(a.taskTitle ?? '').trim() || a.taskId }
            : { kind: 'workflow' as const, id: a.runId, name: String(a.workflowTitle).trim() || a.runId },
        reason: humanWaitLine(a.what),
        since: a.since,
        blockedBy: [],
        clearedBy: 'human' as const,
        op: humanAskOp(a.kind)
    }));
}

/** M-46 — a workflow supervisor's open ask_user; its checkpoint row reads only "running" meanwhile. */
export interface OpenWorkflowQuestion { id: string; runId: string; workflowTitle?: string; question: string; askedAt?: number }

export function workflowQuestionWaits(qs: OpenWorkflowQuestion[], now: number): FleetWait[] {
    return qs.map(q => ({
        kind: 'workflow-question',
        subject: { kind: 'workflow' as const, id: q.runId, name: String(q.workflowTitle ?? '').trim() || q.runId },
        reason: `its supervisor asks: ${q.question}`,
        since: typeof q.askedAt === 'number' ? q.askedAt : now,
        blockedBy: [],
        clearedBy: 'human' as const,
        op: 'workflows.answer'
    }));
}
