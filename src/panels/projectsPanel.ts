import * as vscode from 'vscode';
import { handleAfNav, htmlShell } from './base';

/**
 * Projects — the page.
 *
 * A project is edited HERE, not in a command-palette prompt and not in
 * settings.json. That is the whole point of this panel: the old projects axis
 * had no surface of its own, so everything about it had to be typed into a
 * setting, and a feature nobody can see is a feature nobody uses.
 *
 * The panel itself holds no project logic. The host builds the data and owns
 * every mutation (the store, the folder, the filesystem); this file renders and
 * forwards. That keeps the rules in one place — a page that could half-decide
 * what a project is would become a second source of truth the moment it grew a
 * second view.
 */

export interface ProjectsPanelDeps {
    extensionUri: vscode.Uri;
    /** Everything the page shows, assembled by the host. */
    data(): Record<string, unknown>;
    /** Apply a field patch. Returns an error message, or undefined on success. */
    save(id: string, patch: Record<string, unknown>): string | undefined;
    /** Rename, optionally moving the folder with it. Returns an error/warning. */
    rename(id: string, name: string, renameFolder: boolean): string | undefined;
    remove(id: string): void;
    /** Create one from the page's own form. */
    create(input: {
        name: string; folder?: string; kind?: string; status?: string; summary?: string;
        repos?: string[]; sessionIds?: string[];
    }): { id?: string; error?: string; warning?: string };
    /** Where this name's folder would go by default (empty = no projects root set). */
    suggestFolder(name: string): string;
    /** Open the OS folder picker for the form. Undefined = the user cancelled. */
    browseFolder(start?: string): Promise<string | undefined>;
    /** Ask for a folder and attach it (the "Relink" answer to a missing one). */
    pickFolder(id: string): Promise<void>;
    /** Build any missing skeleton files in the project's folder. */
    recreateFolder(id: string): void;
    revealFolder(id: string): void;
    setActive(id: string): Promise<void>;
    rescan(): Promise<void>;
    /** Show this project's sessions wherever sessions are shown. */
    openSessions(id: string): void;
    onChange?(): void;
}

/** What the "new project" form opens with. Everything is optional: the palette
 *  sends an empty seed, a session sends what it already knows about itself. */
export interface NewProjectSeed {
    suggestName?: string;
    repos?: string[];
    /** sessions to file under the project the moment it exists */
    sessionIds?: string[];
}

export class ProjectsPanel {
    private static current: ProjectsPanel | undefined;
    private disposables: vscode.Disposable[] = [];
    private focusId?: string;
    private seed?: NewProjectSeed;

    static show(deps: ProjectsPanelDeps, focusId?: string, newForm?: NewProjectSeed): void {
        if (ProjectsPanel.current) {
            ProjectsPanel.current.deps = deps;
            ProjectsPanel.current.focusId = focusId;
            ProjectsPanel.current.seed = newForm;
            ProjectsPanel.current.panel.reveal();
            ProjectsPanel.current.refresh();
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'agentfarm.projects',
            'Agent Farm — Projects',
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        ProjectsPanel.current = new ProjectsPanel(panel, deps, focusId, newForm);
    }

    static refreshIfOpen(): void { ProjectsPanel.current?.refresh(); }

    private constructor(
        readonly panel: vscode.WebviewPanel, private deps: ProjectsPanelDeps,
        focusId?: string, newForm?: NewProjectSeed
    ) {
        this.focusId = focusId;
        this.seed = newForm;
        this.render();
        panel.onDidDispose(() => this.dispose(), null, this.disposables);
        panel.webview.onDidReceiveMessage(msg => void this.onMessage(msg), null, this.disposables);
    }

    /** Both are one-shot: they say what to OPEN with, and re-sending them on
     *  every refresh would drag the reader back to a form they had left. */
    private payload(): Record<string, unknown> {
        const seed = this.seed;
        this.seed = undefined;
        return { ...this.deps.data(), focusId: this.focusId ?? null, newForm: seed ?? null };
    }

    private render(): void {
        this.panel.webview.html = htmlShell(
            this.panel.webview, this.deps.extensionUri,
            'Agent Farm Projects', this.payload(), 'projects.js');
        this.focusId = undefined;
    }

    refresh(): void {
        this.panel.webview.postMessage({ type: 'data', data: this.payload() });
        this.focusId = undefined;
    }

    /** Tell the page what happened, then repaint. A save that silently did
     *  nothing is indistinguishable from one that worked. */
    private done(error?: string, ok?: string): void {
        void this.panel.webview.postMessage({ type: 'result', error: error ?? null, ok: ok ?? null });
        this.refresh();
        try { this.deps.onChange?.(); } catch { /* best effort */ }
    }

    private async onMessage(msg: { type: string;[k: string]: unknown }): Promise<void> {
        const id = typeof msg.id === 'string' ? msg.id : '';
        switch (msg.type) {
            case 'afnav':
                handleAfNav(msg.to);
                break;
            case 'refresh':
                this.refresh();
                break;
            case 'create': {
                const form = (msg.form ?? {}) as Record<string, unknown>;
                const res = this.deps.create({
                    name: String(form.name ?? ''),
                    folder: typeof form.folder === 'string' ? form.folder : undefined,
                    kind: typeof form.kind === 'string' && form.kind ? form.kind : undefined,
                    status: typeof form.status === 'string' && form.status ? form.status : undefined,
                    summary: typeof form.summary === 'string' ? form.summary : undefined,
                    repos: Array.isArray(form.repos) ? form.repos.map(String) : undefined,
                    sessionIds: Array.isArray(form.sessionIds) ? form.sessionIds.map(String) : undefined
                });
                if (res.id) { this.focusId = res.id; }
                this.done(res.error ?? res.warning, res.id && !res.error && !res.warning ? 'Project created.' : undefined);
                break;
            }
            case 'suggestFolder':
                void this.panel.webview.postMessage({
                    type: 'suggestedFolder', folder: this.deps.suggestFolder(String(msg.name ?? ''))
                });
                break;
            case 'browseFolder': {
                const picked = await this.deps.browseFolder(
                    typeof msg.start === 'string' ? msg.start : undefined);
                if (picked) {
                    void this.panel.webview.postMessage({ type: 'pickedFolder', folder: picked });
                }
                break;
            }
            case 'save':
                if (id && msg.patch && typeof msg.patch === 'object') {
                    // Order matters and it is deliberate: rename first (it may
                    // move the folder and that can fail), then the rest of the
                    // fields — which must still save even when the folder move
                    // did not. One answer goes back, carrying whichever problem
                    // actually happened.
                    let problem: string | undefined;
                    if (typeof msg.name === 'string' && msg.name.trim()) {
                        problem = this.deps.rename(id, msg.name, msg.renameFolder !== false);
                    }
                    const saveError = this.deps.save(id, msg.patch as Record<string, unknown>);
                    this.done(saveError ?? problem, saveError || problem ? undefined : 'Saved.');
                }
                break;
            case 'delete':
                if (id) {
                    const yes = await vscode.window.showWarningMessage(
                        `Remove "${String(msg.name ?? id)}" from Agent Farm?`,
                        {
                            modal: true,
                            detail: 'Its FOLDER and everything in it stays exactly where it is, and its sessions are not touched — only the project entry and its assignments go. Sub-projects are kept and simply lose their parent.'
                        },
                        'Remove project');
                    if (yes === 'Remove project') {
                        this.deps.remove(id);
                        this.done(undefined, 'Project removed. Its folder was left alone.');
                    }
                }
                break;
            case 'pickFolder':
                if (id) { await this.deps.pickFolder(id); this.done(); }
                break;
            case 'recreateFolder':
                if (id) { this.deps.recreateFolder(id); this.done(undefined, 'Missing files were filled in. Nothing existing was touched.'); }
                break;
            case 'revealFolder':
                if (id) { this.deps.revealFolder(id); }
                break;
            case 'setActive':
                await this.deps.setActive(id);
                this.done();
                break;
            case 'openSessions':
                if (id) { this.deps.openSessions(id); }
                break;
            case 'rescan':
                await this.deps.rescan();
                this.done();
                break;
        }
    }

    private dispose(): void {
        ProjectsPanel.current = undefined;
        for (const d of this.disposables) { try { d.dispose(); } catch { /* ignore */ } }
        this.panel.dispose();
    }
}
