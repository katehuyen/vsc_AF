/**
 * M-46 — ONE SUPERVISOR QUESTION ON THREE DOORS: the window's notification, a
 * Needs You row (one button per option) and the phone (one Telegram button per
 * option). The first answer wins; a late tap is told so. In memory — a window
 * reload drops the question, and the checkpoint's own reload guard carries the
 * run on the mechanical way rather than asking twice.
 */
import * as vscode from 'vscode';
import { newQuestion, WorkflowQuestion } from './core/workflowAsk';

export class WorkflowAsks {
    private open = new Map<string, { q: WorkflowQuestion; resolve: (a: string | undefined) => void }>();

    constructor(private readonly deps: { changed: () => void; phone: (q: WorkflowQuestion) => void }) { }

    list(): WorkflowQuestion[] { return [...this.open.values()].map(x => x.q); }

    get(id: string): WorkflowQuestion | undefined { return this.open.get(id)?.q; }

    ask(runId: string, workflowTitle: string, question: string, options: readonly string[]): Promise<string | undefined> {
        const q = newQuestion(`wq${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, runId, workflowTitle, question, options, Date.now());
        return new Promise(resolve => {
            this.open.set(q.id, { q, resolve });
            this.deps.changed();
            try { this.deps.phone(q); } catch { /* the phone is one door of three */ }
            void vscode.window.showInformationMessage(`Agent Farm: workflow "${workflowTitle}" — its supervisor asks: ${q.question}`, 'Answer…', 'Open Needs You')
                .then(async c => {
                    if (!this.open.has(q.id)) { return; }
                    if (c === 'Answer…') { const a = await this.pick(q); if (a !== undefined) { this.settle(q.id, a); } }
                    else if (c === 'Open Needs You') { void vscode.commands.executeCommand('agentfarm.openNeeds'); }
                });
        });
    }

    /** The window's own way to answer: the options, or a typed answer when there are none. */
    pick(q: WorkflowQuestion): Thenable<string | undefined> {
        const title = `Agent Farm — "${q.workflowTitle}": ${q.question}`;
        return q.options.length
            ? vscode.window.showQuickPick(q.options, { title, ignoreFocusOut: true })
            : vscode.window.showInputBox({ title, prompt: q.question, ignoreFocusOut: true });
    }

    /** First answer wins; false = already answered, or gone with a reload. */
    settle(id: string, answer: string | undefined): boolean {
        const o = this.open.get(id);
        if (!o) { return false; }
        this.open.delete(id);
        o.resolve(answer);
        this.deps.changed();
        return true;
    }
}
