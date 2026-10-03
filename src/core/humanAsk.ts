import type { FleetWait } from './waits';
import { Said, said } from './uiSentence';

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
    return humanAskSaid(a).title;
}

/** U-189 — the same sentence with its template and values, for a page that draws it in the interface language. */
export function humanAskSaid(a: HumanAsk): Said {
    const goal = String(a.goal ?? '').trim();
    const v = { title: a.title, goal };
    switch (a.kind) {
        case 'browser': return said(goal ? 'browser step "{title}" wants to run — {url} ({goal})' : 'browser step "{title}" wants to run — {url}', { ...v, url: a.url ?? '' });
        case 'upload': return said('send files from this computer to {title}: {goal}', { ...v });
        case 'selection': return said(goal ? 'pick assets for "{title}" — {goal}' : 'pick assets for "{title}"', { ...v });
        default: return said(goal ? 'approve "{title}" — {goal}' : 'approve "{title}"', { ...v });
    }
}

/** The Needs You row's detail: its line, and the whole text when the line had to be cut; a whole line carries its template (U-189). */
export function humanAskDetail(a: HumanAsk, cut: (text: string) => { detail: string; body?: string }): { detail: string; body?: string; detailKey?: string; detailVars?: Record<string, string> } {
    const s = humanAskSaid(a);
    const c = cut(s.title);
    return c.body ? c : { ...c, detailKey: s.titleKey, detailVars: s.titleVars };
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
