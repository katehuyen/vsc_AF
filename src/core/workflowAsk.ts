/**
 * M-46 — A WORKFLOW SUPERVISOR'S QUESTION, WHEREVER THE PERSON IS.
 *
 * `ask_user` used to be a QuickPick in the VS Code window: away from the desk,
 * the run simply waited. Now one question is put on three doors at once — the
 * window's notification, a Needs You row with one button per option, and a
 * Telegram message with the same options as buttons — and the first answer
 * wins; the others are told it was already answered. Pure.
 */
import type { DigestKeyboard } from './telegramDigest';

export interface WorkflowQuestion {
    id: string;
    runId: string;
    workflowTitle: string;
    question: string;
    /** empty = a free answer (the window asks for text; the phone answers by replying) */
    options: string[];
    askedAt: number;
}

export const ASK_OPTIONS_MAX = 8;

export function newQuestion(id: string, runId: string, workflowTitle: string, question: string, options: readonly string[], now: number): WorkflowQuestion {
    return {
        id, runId, workflowTitle, question: String(question).slice(0, 1000), askedAt: now,
        options: options.map(o => String(o).trim()).filter(Boolean).slice(0, ASK_OPTIONS_MAX)
    };
}

/** The phone's message: the question, and one button per option. */
export function askText(q: WorkflowQuestion): string {
    return `❓ Workflow "${q.workflowTitle}" — its supervisor asks:\n${q.question}` +
        (q.options.length ? '' : '\n\nNo options were given — answer in VS Code (Needs You).');
}

export function askKeyboard(q: WorkflowQuestion): DigestKeyboard {
    return q.options.map((o, i) => [{ text: o.length > 60 ? o.slice(0, 59) + '…' : o, data: `w:${q.id}:${i}` }]);
}

/** A button of ours: `w:<question id>:<option index>`. */
export function parseAskTap(data: string): { id: string; option: number } | undefined {
    const m = /^w:([\w-]{1,40}):(\d{1,2})$/.exec(String(data || ''));
    return m ? { id: m[1], option: Number(m[2]) } : undefined;
}

/** The Needs You row's buttons: one per option (`wq-<i>`), or a typed answer. */
export function askActions(q: WorkflowQuestion): { id: string; label: string }[] {
    return q.options.length
        ? q.options.map((o, i) => ({ id: `wq-${i}`, label: o.length > 40 ? o.slice(0, 39) + '…' : o }))
        : [{ id: 'wq-text', label: 'Answer…' }];
}

/** Which option a Needs You button names; undefined = not one of ours. */
export const actionOption = (actionId: string): number | 'text' | undefined =>
    actionId === 'wq-text' ? 'text' : /^wq-(\d{1,2})$/.test(actionId) ? Number(actionId.slice(3)) : undefined;
