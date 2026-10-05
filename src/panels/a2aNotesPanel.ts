import * as vscode from 'vscode';
import { handleAfNav, htmlShell } from './base';
import { desktopHost, type PanelHost } from './panelHost';
import { A2ANotesStore, HumanDirective } from '../core/a2aNotes';
import { DIRECTIVE_KINDS } from '../core/a2aSupervisor';
import { A2ATasksStore, A2ATaskState, A2A_TERMINAL } from '../core/a2aTasks';
import { ProjectRef } from './noticesPanel';

/**
 * A2A Notes page (N-6) — what one agent left for another to read. A note is
 * PASSIVE (core/a2aNotes.ts): nothing is assigned, nothing waits, and the
 * board is for a person to READ, not to work. So the page offers exactly what
 * the bridge offers a person's hand for: resolve / reopen, promote to a task,
 * and (N-7) the supervisor's own word — set it, replace it, take it off. Every
 * mutation goes through the store the bridge ops use, never a second
 * implementation.
 */
export interface A2ANotesDeps {
    extensionUri: vscode.Uri;
    notes: A2ANotesStore;
    tasks: A2ATasksStore;
    /** Open projects, for the coordinate chips and the filter. */
    projects: () => ProjectRef[];
    /** Open a context file the note names (host-side, so no arbitrary path from the page). */
    openFile?: (filePath: string) => void;
    /** Open the A2A Tasks page focused on one task. */
    openTask?: (taskId: string) => void;
    /** Who a promotion is signed by when it is done from this window. */
    promoter: () => string;
    onChange?: () => void;
}

function buildData(deps: A2ANotesDeps, focusId?: string): Record<string, unknown> {
    deps.notes.load();
    deps.tasks.load();
    const tasksByNote: Record<string, { id: string; state: string }> = {};
    for (const t of deps.tasks.list()) {
        if (!t.sourceNoteId) { continue; }
        const prior = tasksByNote[t.sourceNoteId];
        // the live one wins; among closed ones, the latest
        if (!prior || (A2A_TERMINAL.includes(prior.state as A2ATaskState) && !A2A_TERMINAL.includes(t.state))) {
            tasksByNote[t.sourceNoteId] = { id: t.id, state: t.state };
        }
    }
    return {
        generatedAt: Date.now(),
        now: Date.now(),
        notes: deps.notes.notes.slice(),
        tasksByNote,
        projects: deps.projects(),
        focusId: focusId ?? null
    };
}

export class A2ANotesPanel {
    private static current: A2ANotesPanel | undefined;
    private disposables: vscode.Disposable[] = [];
    private focusId?: string;

    static show(deps: A2ANotesDeps, focusId?: string): void {
        if (A2ANotesPanel.current) {
            A2ANotesPanel.current.deps = deps;
            A2ANotesPanel.current.focusId = focusId;
            A2ANotesPanel.current.host.reveal();
            A2ANotesPanel.current.refresh();
            return;
        }
        A2ANotesPanel.current = new A2ANotesPanel(desktopHost({ viewType: 'agentfarm.a2aNotes', title: 'Agent Farm — A2A Notes' }), deps, focusId);
    }

    /** X-456 — the views phones have open: one instance each, never the desktop's one tab. */
    private static phones = new Set<A2ANotesPanel>();

    /** X-456 — the A2A Notes page on a phone's view, `focusId` opened as the desktop's is. */
    static openOn(host: PanelHost, deps: A2ANotesDeps, focusId?: string): void {
        A2ANotesPanel.phones.add(new A2ANotesPanel(host, deps, focusId));
    }

    static refreshIfOpen(): void {
        A2ANotesPanel.current?.refresh();
        for (const p of A2ANotesPanel.phones) { p.refresh(); }
    }

    private constructor(readonly host: PanelHost, private deps: A2ANotesDeps, focusId?: string) {
        this.focusId = focusId;
        this.render();
        host.onDidDispose(() => this.dispose(), null, this.disposables);
        host.webview.onDidReceiveMessage(msg => this.onMessage(msg), null, this.disposables);
    }

    private render(): void {
        this.host.webview.html = htmlShell(
            this.host.webview, this.deps.extensionUri, 'Agent Farm A2A Notes',
            buildData(this.deps, this.focusId), 'a2aNotes.js');
        this.focusId = undefined;
    }

    refresh(): void {
        void this.host.webview.postMessage({ type: 'data', data: buildData(this.deps, this.focusId) });
        this.focusId = undefined;
    }

    private mutated(): void {
        this.refresh();
        try { this.deps.onChange?.(); } catch { /* badge best-effort */ }
    }

    private onMessage(msg: { type: string;[k: string]: unknown }): void {
        const id = typeof msg.id === 'string' ? msg.id : '';
        switch (msg.type) {
            case 'resolve':
                if (id && this.deps.notes.resolve(id, true)) { this.mutated(); }
                break;
            case 'unresolve':
                if (id && this.deps.notes.resolve(id, false)) { this.mutated(); }
                break;
            // S-84 — the board's hygiene, from the page: the same store methods
            // a2a.notes.pin / .delete / .deleteMany / .clear call.
            case 'pin':
                if (id && this.deps.notes.pin(id, msg.pinned === true)) { this.mutated(); }
                break;
            case 'delete':
                if (id && this.deps.notes.remove([id])) { this.mutated(); }
                break;
            case 'deleteMany': {
                const ids = Array.isArray(msg.ids) ? msg.ids.filter((x): x is string => typeof x === 'string') : [];
                if (ids.length && this.deps.notes.remove(ids)) { this.mutated(); }
                break;
            }
            case 'clear': {
                // ‼️ The page's ● Clear resolved is exactly that — the open half
                // of the board is never cleared from a click, and a pinned note
                // is spared here as it is by the sweep.
                if (msg.resolvedOnly !== true) { break; }
                if (this.deps.notes.clear({ resolvedOnly: true })) { this.mutated(); }
                break;
            }
            case 'toTask': {
                // The same promotion the bridge's a2a.tasks.fromNote does, with
                // the same refusal: a note that already has a live task is not
                // promoted twice from a click.
                if (!id) { break; }
                const note = this.deps.notes.get(id);
                if (!note) { break; }
                const prior = this.deps.tasks.list()
                    .find(t => t.sourceNoteId === id && !A2A_TERMINAL.includes(t.state));
                if (prior) {
                    void this.host.ask.warn(`Agent Farm: note ${id} already has a live task (${prior.id}, ${prior.state}).`);
                    break;
                }
                const files = note.contextFiles.length ? `\n\nFiles: ${note.contextFiles.join(' · ')}` : '';
                const task = this.deps.tasks.add({
                    fromAgent: this.deps.promoter(), sourceNoteId: id,
                    title: note.title, instructions: `${note.body}${files}`.trim(),
                    project: note.project, workdir: note.subsystem, topic: note.topic,
                    targetRole: note.targetRole, strictness: note.strictness
                });
                if (!task) {
                    void this.host.ask.warn('Agent Farm: the A2A store is busy — try again in a moment.');
                    break;
                }
                this.mutated();
                // A phone's promotion must not open the A2A Tasks tab on the PC; its card's task chip opens it there.
                if (!this.host.remote) { try { this.deps.openTask?.(task.id); } catch { /* best-effort */ } }
                break;
            }
            // N-7 — the supervisor cockpit's two hands on a note. Same call as
            // a2a.directive.set / .remove, so a directive typed on the page and
            // one set from a shell are the same object.
            case 'directiveSet': {
                const kind = typeof msg.kind === 'string' ? msg.kind : '';
                const text = typeof msg.text === 'string' ? msg.text.trim() : '';
                if (!id || !text || !DIRECTIVE_KINDS.includes(kind as HumanDirective['kind'])) { break; }
                if (this.deps.notes.direct(id, { kind: kind as HumanDirective['kind'], text, ts: Date.now() })) { this.mutated(); }
                break;
            }
            case 'directiveRemove':
                if (id && this.deps.notes.direct(id, undefined)) { this.mutated(); }
                break;
            case 'openTask':
                if (id) { try { this.deps.openTask?.(id); } catch { /* best-effort */ } }
                break;
            case 'openFile': {
                // The path must be one the note itself names — never an
                // arbitrary string from the page.
                const note = id ? this.deps.notes.get(id) : undefined;
                const file = typeof msg.file === 'string' ? msg.file : '';
                if (note && file && note.contextFiles.includes(file)) { try { this.deps.openFile?.(file); } catch { /* best-effort */ } }
                break;
            }
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
        // A phone's view closing leaves the desktop's tab alone.
        if (A2ANotesPanel.current === this) { A2ANotesPanel.current = undefined; }
        A2ANotesPanel.phones.delete(this);
        for (const d of this.disposables) { d.dispose(); }
    }
}
