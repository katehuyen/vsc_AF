import * as vscode from 'vscode';
import { handleAfNav, htmlShell } from './base';
import { A2ANotesStore, HumanDirective } from '../core/a2aNotes';
import { DIRECTIVE_KINDS } from '../core/a2aSupervisor';
import { A2ATask, A2ATasksStore, A2A_TERMINAL, LEASE_MS, MAX_HANDOFF_DEPTH } from '../core/a2aTasks';
import { ProjectRef } from './noticesPanel';

/**
 * A2A Tasks page (N-6, N-7) — work one agent handed to another. The board is
 * READ here and the work is claimed and finished on the bridge by the agents;
 * what a PERSON has on a row is the supervisor cockpit — cancel, the user's
 * word (steer · veto · constraint), a re-route under human authority, and Run
 * Now. Every one of them goes through the store the bridge ops use.
 */
export interface A2ATasksDeps {
    extensionUri: vscode.Uri;
    tasks: A2ATasksStore;
    notes: A2ANotesStore;
    /** Open projects, for the coordinate chips and the filter. */
    projects: () => ProjectRef[];
    /** The fleet, for the re-route picker — a role a person can actually reach. */
    agentNames: () => string[];
    /** N-7 — open a session that takes this task now. Same answer as a2a.tasks.runNow. */
    runTaskNow?: (task: A2ATask) => { agent: string; surface: string } | { refused: string };
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
        agents: deps.agentNames(),
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
            // ---- N-7, the supervisor cockpit ----
            case 'directiveSet': {
                const kind = typeof msg.kind === 'string' ? msg.kind : '';
                const text = typeof msg.text === 'string' ? msg.text.trim() : '';
                if (!id || !text || !DIRECTIVE_KINDS.includes(kind as HumanDirective['kind'])) { break; }
                if (this.deps.tasks.direct(id, { kind: kind as HumanDirective['kind'], text, ts: Date.now() })) { this.mutated(); }
                break;
            }
            case 'directiveRemove':
                if (id && this.deps.tasks.direct(id, undefined)) { this.mutated(); }
                break;
            case 'reroute': {
                const task = id ? this.deps.tasks.get(id) : undefined;
                const targetRole = typeof msg.targetRole === 'string' ? msg.targetRole.trim() : '';
                if (!task || !targetRole) { break; }
                if (A2A_TERMINAL.includes(task.state)) {
                    void vscode.window.showWarningMessage(`Agent Farm: ${task.id} is ${task.state} — nothing left to reroute.`);
                    break;
                }
                const project = typeof msg.project === 'string' ? msg.project.trim() : '';
                const workdir = typeof msg.workdir === 'string' ? msg.workdir.trim() : '';
                // ‼️ The same call a2a.tasks.reroute makes, `override` and all:
                // a person deciding where work goes IS what the loop guard was
                // waiting for, so it is not applied and the count starts again.
                const r = this.deps.tasks.handoff(id, {
                    targetRole, ...(project ? { project } : {}), ...(workdir ? { workdir } : {})
                }, 'user', Date.now(), { override: true, why: typeof msg.why === 'string' ? msg.why.trim() : '' });
                if ('refused' in r) {
                    void vscode.window.showWarningMessage(`Agent Farm: reroute refused — ${r.refused}.`);
                    break;
                }
                this.focusId = r.task.id;
                this.mutated();
                break;
            }
            case 'runNow': {
                const task = id ? this.deps.tasks.get(id) : undefined;
                if (!task) { break; }
                if (A2A_TERMINAL.includes(task.state)) {
                    void vscode.window.showWarningMessage(`Agent Farm: ${task.id} is ${task.state} — nothing left to run.`);
                    break;
                }
                const r = this.deps.runTaskNow?.(task);
                if (!r) {
                    void vscode.window.showWarningMessage('Agent Farm: this window cannot start sessions.');
                    break;
                }
                if ('refused' in r) {
                    void vscode.window.showWarningMessage(`Agent Farm: Run Now refused — ${r.refused}.`);
                    break;
                }
                break;
            }
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
