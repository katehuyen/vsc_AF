import * as vscode from 'vscode';
import { NeedItem } from '../core/needs';
import { FarmTask, TaskManager } from '../core/tasks';
import { htmlShell } from './base';

/**
 * G5 — Kanban task board (the "Manager surface"): Inbox / Parked / Running /
 * Needs Approval / Done columns with drag-and-drop transitions and the
 * natural-language command bar on top.
 */

export interface KanbanDeps {
    extensionUri: vscode.Uri;
    manager: TaskManager;
    /** urgent Needs-You rows (permission waits + browser approvals). */
    buildWaiting(): NeedItem[];
    /** natural-language command bar (F1) with prefilled text. */
    runCommandText(text: string): Promise<void>;
    settleApproval(id: string, ok: boolean): boolean;
    onDidChangeNeeds: vscode.Event<void>;
}

interface KanbanCard {
    id: string;
    title: string;
    agentName: string;
    mode: string;
    status: string;
    detail: string;
    when: number;
    durMin?: number;
    verified?: string;
    mediaCost?: number;
    hasOutput: boolean;
    outputFile?: string;
}

function card(t: FarmTask): KanbanCard {
    const durMin = t.startedAt
        ? Math.max(0, Math.round(((t.endedAt ?? Date.now()) - t.startedAt) / 60000))
        : undefined;
    return {
        id: t.id,
        title: t.title,
        agentName: t.agentName,
        mode: t.mode,
        status: t.status,
        detail: t.status === 'queued' && t.deferredReason ? t.deferredReason : '',
        when: t.endedAt ?? t.startedAt ?? t.createdAt,
        durMin,
        verified: t.verified,
        mediaCost: t.mediaCost,
        hasOutput: !!t.outputFile,
        outputFile: t.outputFile
    };
}

function buildData(deps: KanbanDeps): Record<string, unknown> {
    const tasks = deps.manager.tasks;
    const finished = tasks
        .filter(t => t.status === 'done' || t.status === 'failed' || t.status === 'cancelled')
        .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))
        .slice(0, 30);
    return {
        generatedAt: Date.now(),
        inbox: tasks.filter(t => t.status === 'queued' && !t.autoStart).map(card),
        parked: tasks.filter(t => t.status === 'queued' && t.autoStart).map(card),
        running: tasks.filter(t => t.status === 'running').map(card),
        waiting: deps.buildWaiting(),
        done: finished.map(card)
    };
}

export class KanbanPanel {
    private static current: KanbanPanel | undefined;
    private disposables: vscode.Disposable[] = [];

    static show(deps: KanbanDeps): void {
        if (KanbanPanel.current) {
            KanbanPanel.current.panel.reveal();
            KanbanPanel.current.refresh();
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'agentfarm.kanban',
            'Agent Farm — Board',
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        KanbanPanel.current = new KanbanPanel(panel, deps);
    }

    static refreshIfOpen(): void {
        KanbanPanel.current?.refresh();
    }

    private constructor(readonly panel: vscode.WebviewPanel, private deps: KanbanDeps) {
        panel.webview.html = htmlShell(
            panel.webview,
            deps.extensionUri,
            'Agent Farm Board',
            buildData(deps),
            'kanban.js'
        );
        panel.onDidDispose(() => this.dispose(), null, this.disposables);
        panel.webview.onDidReceiveMessage(msg => void this.onMessage(msg), null, this.disposables);
        this.disposables.push(
            deps.manager.onDidChange(() => this.refresh()),
            deps.onDidChangeNeeds(() => this.refresh())
        );
    }

    refresh(): void {
        void this.panel.webview.postMessage({ type: 'data', data: buildData(this.deps) });
    }

    private task(id: unknown): FarmTask | undefined {
        return this.deps.manager.tasks.find(t => t.id === id);
    }

    private async onMessage(msg: {
        type: string; taskId?: string; to?: string; text?: string;
        approvalId?: string; ok?: boolean; file?: string; transcriptPath?: string;
    }): Promise<void> {
        const m = this.deps.manager;
        switch (msg.type) {
            case 'refresh':
                this.refresh();
                break;
            case 'move': {
                const t = this.task(msg.taskId);
                if (!t) { break; }
                if (msg.to === 'running' && t.status === 'queued') { m.startTask(t); }
                else if (msg.to === 'done' && t.status === 'running') { m.completeTask(t); }
                else if (msg.to === 'done' && t.status === 'queued') { m.cancelTask(t); }
                else if (msg.to === 'inbox' && t.status === 'queued' && t.autoStart) {
                    t.autoStart = false;
                    t.deferredReason = undefined;
                    m.startTask(t); // re-request: parks again if still blocked
                }
                this.refresh();
                break;
            }
            case 'cancel': {
                const t = this.task(msg.taskId);
                if (t && (t.status === 'queued' || t.status === 'running')) { m.cancelTask(t); }
                this.refresh();
                break;
            }
            case 'delete': {
                const t = this.task(msg.taskId);
                if (t && t.status !== 'running') { m.deleteTask(t); }
                this.refresh();
                break;
            }
            case 'open-output':
                if (msg.file) {
                    void vscode.commands.executeCommand('vscode.open', vscode.Uri.file(msg.file));
                }
                break;
            case 'open-session':
                if (msg.transcriptPath) {
                    void vscode.commands.executeCommand('agentfarm.openSession', msg.transcriptPath);
                }
                break;
            case 'approve':
                if (msg.approvalId) { this.deps.settleApproval(msg.approvalId, msg.ok === true); }
                this.refresh();
                break;
            case 'command':
                if (msg.text?.trim()) { await this.deps.runCommandText(msg.text.trim()); }
                this.refresh();
                break;
            case 'add-task':
                void vscode.commands.executeCommand('agentfarm.addTask');
                break;
            case 'open-needs':
                void vscode.commands.executeCommand('agentfarm.openNeeds');
                break;
            case 'openGuide':
                void vscode.commands.executeCommand('agentfarm.openGuide', 'kanban-panosu');
                break;
        }
    }

    private dispose(): void {
        KanbanPanel.current = undefined;
        for (const d of this.disposables) { d.dispose(); }
    }
}
