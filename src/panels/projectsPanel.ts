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

/**
 * What the page is looking at, in one object.
 *
 * An argument list rather than an object was fine at four; the Docs tab needs a
 * fifth (which document is selected) and the next tab will need a sixth, and a
 * five-positional call is where a caller eventually swaps two strings and the
 * bug is invisible at the call site.
 */
export interface TabRequest {
    project: string;
    tab: string;
    /** Sessions-table "Show" box. */
    tableN: number;
    /** Timeline kinds the reader has switched ON. */
    kinds: string[];
    /** Docs tab: which file is open, relative to the project folder. */
    doc: string;
}

export interface ProjectsPanelDeps {
    extensionUri: vscode.Uri;
    /** Everything the page shows, assembled by the host. */
    data(): Record<string, unknown>;
    /**
     * The open tab's own data — and nothing else.
     *
     * ‼️ This page repaints on every fleet refresh, so the payload is per TAB
     * rather than "everything, always": a timeline of three hundred rows, a
     * cost rollup and a pooled sessions table shipped on every refresh in order
     * to draw a form is how a read-only page starts costing the window frames.
     * The panel remembers which tab is open and asks for that one.
     */
    tabData(req: TabRequest): Record<string, unknown>;
    /** Per-turn breakdown for an expanded row in the Sessions tab. */
    sessionTurns(projectId: string, file: string): unknown;
    /** Open whatever a feed row points at — the one route for every kind. */
    openLink(link: { to: string;[k: string]: unknown }): void;
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

    // ---- Faz 4: the documents are editable from here, carefully ----
    /** Tick or untick one plan item. Returns an error, or a note about what the
     *  edit deliberately did NOT do. */
    planCheck(id: string, target: { id?: string; line?: number; text?: string }, done: boolean):
        { error?: string; note?: string };
    /** Add an open plan item, optionally under a named section. */
    planAdd(id: string, item: string, section: string): { error?: string };

    // ---- Faz 4.5: the backlog, edited from the row it is on ----
    /** Quick capture. With no area it lands in the inbox without a code, which
     *  is the point: writing a note down must cost nothing. */
    backlogAdd(id: string, input: {
        text: string; area?: string; parent?: string;
        priority?: string; effort?: string; kinds?: string[];
    }): { error?: string; code?: string; note?: string };
    /** Move one item between open/doing/done/cancelled — one character. */
    backlogState(id: string, target: { code?: string; line?: number }, state: string):
        { error?: string; note?: string };
    /** Set an item's axes from the row's own controls. */
    backlogSet(id: string, target: { code?: string; line?: number }, fields: Record<string, unknown>):
        { error?: string };
    /** Nudge it among its siblings, or send it to one end. The code does not change. */
    backlogMove(id: string, target: { code?: string; line?: number }, dir: string): { error?: string; note?: string };
    /** Drop it directly above or below another row — the drag. */
    backlogReorder(id: string, target: { code?: string; line?: number },
        dest: { code?: string; line?: number }, place: string): { error?: string; note?: string };
    /** Give an inbox capture a code and file it under an area. */
    backlogCode(id: string, target: { line?: number }, area: string, parent?: string):
        { error?: string; code?: string };
    /** Sweep closed items under the archive heading. */
    backlogArchive(id: string): { error?: string; moved?: number };
    /** Open the backlog document AT one item's line, in the user's chosen mode.
     *  The host re-resolves the line from the code — see its implementation. */
    backlogOpenItem(id: string, target: { code?: string; line?: number }, mode?: string):
        { error?: string; code?: string; line?: number };
    /** Open a document the way the user opens report links elsewhere — VS Code,
     *  the rendered preview, Obsidian, or their own app. */
    openProjectDoc(id: string, rel: string, mode?: string): void;
    /** The doc-open modes and which one is default, for the split button. */
    docOpenModes(): { mode: string; modes: string[]; labels: Record<string, string> };
    /** A new note, in a folder inside the project. */
    newProjectDoc(id: string, folder: string, name: string): { error?: string; path?: string };
    /** Replace the project's people. Returns an error message, or undefined. */
    savePeople(id: string, people: unknown[]): string | undefined;
    onChange?(): void;
}

/**
 * Which backlog row a page message is about.
 *
 * ‼️ The code wins whenever there is one, and that is not a preference. The page
 * shows 1-based lines because that is what an editor shows, the parser counts
 * from 0, and the conversion happens HERE, once — but a line number also goes
 * stale the moment somebody inserts a paragraph in Obsidian while this panel
 * sits open, and editing the wrong row in a backlog is silent. A code survives
 * the file being reordered; only an uncoded inbox capture has to risk the line.
 */
function backlogRowTarget(msg: Record<string, unknown>): { code?: string; line?: number } {
    if (typeof msg.code === 'string' && msg.code) { return { code: msg.code }; }
    return typeof msg.line === 'number' && msg.line > 0 ? { line: msg.line - 1 } : {};
}

/** What the "new project" form opens with. Everything is optional: the palette
 *  sends an empty seed, a session sends what it already knows about itself. */
export interface NewProjectSeed {
    suggestName?: string;
    repos?: string[];
    /** sessions to file under the project the moment it exists */
    sessionIds?: string[];
}

/** The project page's tabs. `settings` is the editor Faz 1 shipped — it was
 *  always meant to become a tab here rather than stay the whole page. */
const TABS = ['overview', 'timeline', 'sessions', 'plan', 'backlog', 'docs', 'people', 'cost', 'settings'] as const;
const DEFAULT_TAB = 'overview';
/** Sessions-table Show box default for this page. */
const PROJECT_TABLE_N = 25;

export class ProjectsPanel {
    private static current: ProjectsPanel | undefined;
    private disposables: vscode.Disposable[] = [];
    private focusId?: string;
    private seed?: NewProjectSeed;
    /** Which tab is open, and for WHICH project — switching projects must not
     *  leave you on a tab you were reading about something else. */
    private tab: string = DEFAULT_TAB;
    private tabProject = '';
    private tableN = PROJECT_TABLE_N;
    /**
     * The event kinds the Timeline is showing.
     *
     * Filtered HOST-side, before the row cap: on a real project most events are
     * turns, so filtering after the cap gives the reader three hundred rows of
     * the one kind they switched off. Empty = no filter yet (the first paint,
     * before the page has said what it wants).
     */
    private feedKinds: string[] = [];
    /** Docs tab: which document is open, relative to the project folder. Held
     *  here rather than in the page because the HOST reads the file — the page
     *  never gets to name a path the host has not already resolved inside the
     *  project folder. */
    private docPath = '';

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
        /**
         * ‼️ COMING BACK TO THIS TAB RE-READS THE DOCUMENTS.
         *
         * Every reading tab here is a view of a file the user also edits in
         * Obsidian — that is the whole design — and this page's own buttons now
         * send them there, at a line, to do exactly that. Returning to a page
         * still showing what the file said before they left makes the round trip
         * pointless, and "press something else and come back" is not a refresh
         * mechanism a person should have to know.
         *
         * Safe because a repaint costs the OPEN TAB's data only, and because the
         * page treats a `data` push as new facts rather than as a reset: the
         * filters, the rows opened past the cut, an edit box with words in it and
         * the new-project form all survive one (see the message handler in
         * media/projects.js). Debounced because VS Code fires this event more
         * than once for a single tab change.
         */
        panel.onDidChangeViewState(() => {
            if (!panel.active) { return; }
            if (this.focusTimer) { clearTimeout(this.focusTimer); }
            this.focusTimer = setTimeout(() => { this.focusTimer = undefined; this.refresh(); }, 250);
        }, null, this.disposables);
    }

    /** Debounce for the focus refresh above. */
    private focusTimer?: ReturnType<typeof setTimeout>;

    /** Both are one-shot: they say what to OPEN with, and re-sending them on
     *  every refresh would drag the reader back to a form they had left. */
    private payload(): Record<string, unknown> {
        const seed = this.seed;
        this.seed = undefined;
        // ‼️ A focus jump moves the reader to another project before the page
        // has had a chance to say so. Shipping the open tab built for the
        // project they just LEFT prints one frame of somebody else's money
        // under this project's name — a wrong number is worse than "reading…",
        // because it looks like an answer. The page's `view` message arrives a
        // moment later and brings the real one.
        const stale = !!this.focusId && this.focusId !== this.tabProject;
        // A "new project" form owns the whole right-hand side, so a tab's data
        // would be built for a project nobody is looking at.
        const tabData = seed || stale ? {} : this.deps.tabData({
            project: this.tabProject, tab: this.tab, tableN: this.tableN,
            kinds: this.feedKinds, doc: this.docPath
        });
        return {
            ...this.deps.data(),
            focusId: this.focusId ?? null,
            newForm: seed ?? null,
            tab: this.tab,
            tabProject: this.tabProject,
            // echoed back so the page can tell whether its request landed —
            // without it, page and host ask each other to refresh for ever
            feedKinds: this.feedKinds,
            docPath: this.docPath,
            docOpen: this.deps.docOpenModes(),
            tabData
        };
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
            // Which project is being looked at, and on which tab. The page owns
            // the selection; the host owns the data, and it will not build a
            // tab's payload for a project the reader is not on.
            case 'view': {
                const wanted = String(msg.tab ?? '');
                const project = String(msg.project ?? '');
                // A document opened in project A must not stay open when the
                // reader jumps to B: the path would be resolved inside B's
                // folder, and either fail or — worse — hit a file with the same
                // name and print it under the wrong project's name.
                if (project !== this.tabProject) { this.tableN = PROJECT_TABLE_N; this.docPath = ''; }
                this.tabProject = project;
                this.tab = (TABS as readonly string[]).includes(wanted) ? wanted : DEFAULT_TAB;
                this.feedKinds = Array.isArray(msg.kinds)
                    ? msg.kinds.map(k => String(k)).filter(Boolean) : [];
                this.refresh();
                break;
            }
            case 'setTableN': {
                // The pool is rebuilt host-side so the requested top-N is a real
                // top-N, not a re-slice of the last one.
                const n = typeof msg.n === 'number' && isFinite(msg.n) ? Math.floor(msg.n) : -1;
                if (n < 0) { break; }
                this.tableN = n;
                this.refresh();
                break;
            }
            case 'sessionTurns': {
                const file = typeof msg.file === 'string' ? msg.file : '';
                if (!file) { break; }
                void this.panel.webview.postMessage({
                    type: 'sessionTurns', file,
                    turns: this.deps.sessionTurns(this.tabProject, file)
                });
                break;
            }
            case 'openLink':
                if (msg.link && typeof msg.link === 'object') {
                    this.deps.openLink(msg.link as { to: string });
                }
                break;
            // The shared sessions table (media/sessionsTable.js) is embedded
            // whole in the Sessions tab, which means its four row actions are
            // ours to answer. They go straight to the commands every other
            // surface uses — a second implementation here would be a second set
            // of bugs for the same four buttons.
            case 'openSession':
                void vscode.commands.executeCommand('agentfarm.openSession', msg.file,
                    typeof msg.ts === 'number' && msg.ts > 0 ? msg.ts : undefined);
                break;
            case 'focusTerminal':
                void vscode.commands.executeCommand('agentfarm.focusSessionTerminal', {
                    sessionId: typeof msg.sessionId === 'string' && msg.sessionId ? msg.sessionId : undefined,
                    agentName: typeof msg.agentName === 'string' ? msg.agentName : undefined,
                    cwd: typeof msg.cwd === 'string' && msg.cwd ? msg.cwd : undefined
                });
                break;
            case 'pinSession':
                // the star already flipped in the webview — pass the state it
                // wants, not a toggle, so the two can never disagree
                void vscode.commands.executeCommand('agentfarm.pinSession', {
                    sessionId: typeof msg.sessionId === 'string' ? msg.sessionId : '',
                    wantPinned: msg.pinned === true
                });
                break;
            case 'interruptSession':
                void vscode.commands.executeCommand('agentfarm.interruptSession', {
                    sessionId: typeof msg.sessionId === 'string' && msg.sessionId ? msg.sessionId : undefined,
                    agentName: typeof msg.agentName === 'string' ? msg.agentName : undefined
                });
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

            // ---- documents ----
            case 'selectDoc':
                this.docPath = String(msg.path ?? '');
                this.refresh();
                break;
            case 'openDoc':
                if (id) {
                    this.deps.openProjectDoc(id, String(msg.path ?? ''),
                        typeof msg.mode === 'string' ? msg.mode : undefined);
                }
                break;
            case 'newDoc': {
                if (!id) { break; }
                const res = this.deps.newProjectDoc(id,
                    String(msg.folder ?? ''), String(msg.name ?? ''));
                if (res.path) { this.docPath = res.path; }
                this.done(res.error, res.error ? undefined : 'Note created.');
                break;
            }
            case 'planCheck': {
                if (!id) { break; }
                const res = this.deps.planCheck(id, {
                    ...(typeof msg.itemId === 'string' && msg.itemId ? { id: msg.itemId } : {}),
                    // ‼️ The page shows 1-based line numbers because that is what
                    // an editor shows; the parser counts from 0. The conversion
                    // happens HERE, once — two numbering schemes for one line is
                    // how the wrong box gets ticked.
                    ...(typeof msg.line === 'number' && msg.line > 0 ? { line: msg.line - 1 } : {}),
                    ...(typeof msg.text === 'string' && msg.text ? { text: msg.text } : {})
                }, msg.done !== false);
                this.done(res.error, res.error ? undefined : (res.note ?? 'Plan updated.'));
                break;
            }
            case 'planAdd': {
                if (!id) { break; }
                const item = String(msg.item ?? '').trim();
                if (!item) { break; }
                const res = this.deps.planAdd(id, item, String(msg.section ?? ''));
                this.done(res.error, res.error ? undefined : 'Added to the plan.');
                break;
            }
            // ---- the backlog. Every one of these addresses a row by its CODE
            // when it has one and falls back to the line only for an
            // unclassified capture — a code survives the file being reordered
            // under an open panel, a line number does not.
            case 'backlogAdd': {
                if (!id) { break; }
                const text = String(msg.text ?? '').trim();
                if (!text) { break; }
                const res = this.deps.backlogAdd(id, {
                    text,
                    ...(typeof msg.area === 'string' && msg.area ? { area: msg.area } : {}),
                    ...(typeof msg.parent === 'string' && msg.parent ? { parent: msg.parent } : {}),
                    ...(typeof msg.priority === 'string' && msg.priority ? { priority: msg.priority } : {}),
                    ...(typeof msg.effort === 'string' && msg.effort ? { effort: msg.effort } : {}),
                    ...(Array.isArray(msg.kinds) ? { kinds: msg.kinds.map(String) } : {})
                });
                this.done(res.error, res.error ? undefined
                    : (res.code ? `Added as ${res.code}.` : 'Added to the inbox.'));
                break;
            }
            case 'backlogState': {
                if (!id) { break; }
                const res = this.deps.backlogState(id, backlogRowTarget(msg), String(msg.state ?? 'done'));
                this.done(res.error, res.error ? undefined : (res.note ?? 'Backlog updated.'));
                break;
            }
            case 'backlogSet': {
                if (!id) { break; }
                const fields = (msg.fields ?? {}) as Record<string, unknown>;
                const res = this.deps.backlogSet(id, backlogRowTarget(msg), fields);
                this.done(res.error, res.error ? undefined : 'Backlog updated.');
                break;
            }
            case 'backlogMove': {
                if (!id) { break; }
                const res = this.deps.backlogMove(id, backlogRowTarget(msg), String(msg.dir ?? 'down'));
                this.done(res.error, res.error ? undefined : (res.note ?? 'Moved.'));
                break;
            }
            case 'backlogReorder': {
                if (!id) { break; }
                // The drop target is addressed exactly like the dragged row —
                // code first, line only for an uncoded capture.
                const dest = backlogRowTarget({
                    code: msg.destCode, line: msg.destLine
                } as Record<string, unknown>);
                if (!dest.code && dest.line === undefined) { break; }
                const res = this.deps.backlogReorder(id, backlogRowTarget(msg), dest,
                    msg.place === 'before' ? 'before' : 'after');
                this.done(res.error, res.error ? undefined : (res.note ?? 'Moved.'));
                break;
            }
            case 'backlogCode': {
                if (!id) { break; }
                const area = String(msg.area ?? '').trim();
                const parent = String(msg.parent ?? '').trim();
                if (!area && !parent) { break; }
                const res = this.deps.backlogCode(id, backlogRowTarget(msg), area,
                    parent ? parent : undefined);
                this.done(res.error, res.error ? undefined : `Filed as ${res.code ?? 'coded'}.`);
                break;
            }
            // Opening one item is a READ, so it does not go through `done()`: a
            // repaint here would move the list under a reader who is on their way
            // out to the editor, and there is nothing to report when it works.
            case 'backlogOpenItem': {
                if (!id) { break; }
                const res = this.deps.backlogOpenItem(id, backlogRowTarget(msg),
                    typeof msg.mode === 'string' ? msg.mode : undefined);
                if (res.error) { this.done(res.error); }
                break;
            }
            case 'backlogArchive': {
                if (!id) { break; }
                const res = this.deps.backlogArchive(id);
                this.done(res.error, res.error ? undefined
                    : (res.moved ? `${res.moved} closed item${res.moved === 1 ? '' : 's'} archived.` : 'Nothing closed to archive.'));
                break;
            }
            case 'savePeople':
                if (id && Array.isArray(msg.people)) {
                    const error = this.deps.savePeople(id, msg.people);
                    this.done(error, error ? undefined : 'People saved.');
                }
                break;
        }
    }

    private dispose(): void {
        ProjectsPanel.current = undefined;
        if (this.focusTimer) { clearTimeout(this.focusTimer); this.focusTimer = undefined; }
        for (const d of this.disposables) { try { d.dispose(); } catch { /* ignore */ } }
        this.panel.dispose();
    }
}
