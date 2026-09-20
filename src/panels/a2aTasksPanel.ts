import * as vscode from 'vscode';
import { handleAfNav, htmlShell } from './base';
import { A2ANotesStore } from '../core/a2aNotes';
import { A2ATasksStore, LEASE_MS, MAX_HANDOFF_DEPTH } from '../core/a2aTasks';
import { ProjectRef } from './noticesPanel';

/**
 * A2A Tasks page (N-6) — work one agent handed to another. The board is READ
 * here; the work is claimed and finished on the bridge by the agents. The one
 * hand a person has on a row from this page is to cancel it; steering,
 * vetoing and re-routing are the supervisor cockpit (N-7). Every mutation
 * goes through the store the bridge ops use.
 */
export interface A2ATasksDeps {
    extensionUri: vscode.Uri;
    tasks: A2ATasksStore;
    notes: A2ANotesStore;
    /** Open projects, for the coordinate chips and the filter. */
    projects: () => ProjectRef[];
    /** Open the A2A Notes page focused on the note a task grew from. */
    openNote?: (noteId: string) => void;
    /** Open the Work Queue focused on the item a task came out of. */
    openQueueItem?: (itemId: string) => void;
    onChange?: () => void;
}

function buildData(deps: A2ATasksDeps, focusId?: string): Record<string, unknown> {
    const now = Date.now();
    const tasks = deps.tasks.list({}, now);
    deps.notes.load();
    const notesById: Record<string, { title: string }> = {};
    for (const t of tasks) {
        if (!t.sourceNoteId || notesById[t.sourceNoteId]) { continue; }
        const n = deps.notes.get(t.sourceNoteId);
        if (n) { notesById[t.sourceNoteId] = { title: n.title }; }
    }
    return {
        generatedAt: now,
        now,
        tasks,
        notesById,
        projects: deps.projects(),
        leaseMs: LEASE_MS,
        maxHandoffDepth: MAX_HANDOFF_DEPTH,
        focusId: focusId ?? null
    };
}

export class A2ATasksPanel {
    private static current: A2ATasksPanel | undefined;
    private disposables: vscode.Disposable[] = [];
    private focusId?: string;

    static show(deps: A2ATasksDeps, focusId?: string): void {
        if (A2ATasksPanel.current) {
            A2ATasksPanel.current.deps = deps;
            A2ATasksPanel.current.focusId = focusId;
            A2ATasksPanel.current.panel.reveal();
            A2ATasksPanel.current.refresh();
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'agentfarm.a2aTasks',
            'Agent Farm — A2A Tasks',
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        A2ATasksPanel.current = new A2ATasksPanel(panel, deps, focusId);
    }

    static refreshIfOpen(): void { A2ATasksPanel.current?.refresh(); }

    private constructor(readonly panel: vscode.WebviewPanel, private deps: A2ATasksDeps, focusId?: string) {
        this.focusId = focusId;
        this.render();
        panel.onDidDispose(() => this.dispose(), null, this.disposables);
        panel.webview.onDidReceiveMessage(msg => this.onMessage(msg), null, this.disposables);
    }

    private render(): void {
        this.panel.webview.html = htmlShell(
            this.panel.webview, this.deps.extensionUri, 'Agent Farm A2A Tasks',
            buildData(this.deps, this.focusId), 'a2aTasks.js');
        this.focusId = undefined;
    }

    refresh(): void {
        void this.panel.webview.postMessage({ type: 'data', data: buildData(this.deps, this.focusId) });
        this.focusId = undefined;
    }

    private mutated(): void {
        this.refresh();
        try { this.deps.onChange?.(); } catch { /* badge best-effort */ }
    }

    private onMessage(msg: { type: string;[k: string]: unknown }): void {
        const id = typeof msg.id === 'string' ? msg.id : '';
        switch (msg.type) {
            case 'cancel':
                if (id && this.deps.tasks.cancel(id, 'cancelled by the user from the A2A Tasks page')) { this.mutated(); }
                break;
            case 'openNote':
                if (id) { try { this.deps.openNote?.(id); } catch { /* best-effort */ } }
                break;
            case 'openQueueItem':
                if (id) { try { this.deps.openQueueItem?.(id); } catch { /* best-effort */ } }
                break;
            case 'openExternal':
                if (typeof msg.url === 'string' && /^https?:\/\//i.test(msg.url)) {
                    void vscode.env.openExternal(vscode.Uri.parse(msg.url));
                }
                break;
            case 'afnav':
                handleAfNav(msg.to);
                break;
            case 'refresh':
                this.refresh();
                break;
        }
    }

    private dispose(): void {
        A2ATasksPanel.current = undefined;
        for (const d of this.disposables) { d.dispose(); }
    }
}
