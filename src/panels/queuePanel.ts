import * as vscode from 'vscode';
import { handleAfNav, htmlShell } from './base';
import { WorkItem, WorkQueueStore } from '../core/workqueue';
import { ProjectRef } from './noticesPanel';

/**
 * Work Queue page — the user→agent async work queue (see core/workqueue.ts),
 * the mirror of the Notices board. Low-friction capture + pipeline LANES so the
 * user can track what they dropped through to completion (and read the outcome).
 * Self-contained: it touches only its own store, plus injected callbacks for the
 * two cross-boundary actions (open a source notice; hand an item to an agent).
 */

export interface QueueDeps {
    extensionUri: vscode.Uri;
    store: WorkQueueStore;
    /** Known routing targets (products / agent names) for the filter + add form. */
    targets: () => string[];
    agentNames: () => string[];
    /** Open projects, for the capture box, the row picker and the filter. */
    projects: () => ProjectRef[];
    /** The window's active project — what a capture made here is stamped with. */
    activeProjectId: () => string;
    /** Open a project's page, from an item's project mark. */
    openProject?: (id: string) => void;
    onChange?: () => void;
    /** Cross-link back to Notices, focused on the source notice. */
    openNotice?: (noticeId: string) => void;
    /** "Hand to agent": open the item's target agent terminal, prefilled with the
     *  item text (typed, NOT sent — the user reviews and presses Enter). */
    handoff?: (item: WorkItem) => void;
    // --- Feature A: live status mirror for agent-tracked (delegated) items ---
    /** Current status/title of the mission run an item was delegated into. */
    missionStatus?: (missionId: string) => { status: string; title?: string } | undefined;
    /** Current status/title of the task an item was delegated into. */
    taskStatus?: (taskId: string) => { status: string; title?: string } | undefined;
    // --- Feature B: shared "open with" for report/answer .md links ---
    /** Open a resolved report/answer file with a mode (default when omitted). */
    openDoc?: (filePath: string, mode?: string) => void;
    /** Current doc-open default, for the split-button UI. */
    docOpenConfig?: () => { mode: string; hasCustom: boolean };
    /** Launch the host-side "configure default + custom app" flow. */
    configureDocOpen?: () => void;
}

/** Live status of every agent-tracked item that carries a mission/task link —
 *  the mirror shown in the Agent-tracked lane (running → done/failed), read
 *  fresh on each render so it tracks the linked run/task as it progresses. */
function buildLiveMap(deps: QueueDeps, items: WorkItem[]): Record<string, { kind: string; status: string; title?: string }> {
    const live: Record<string, { kind: string; status: string; title?: string }> = {};
    for (const n of items) {
        if (n.missionId && deps.missionStatus) {
            const m = deps.missionStatus(n.missionId);
            if (m) { live[n.id] = { kind: 'mission', status: m.status, title: m.title }; continue; }
        }
        if (n.taskId && deps.taskStatus) {
            const t = deps.taskStatus(n.taskId);
            if (t) { live[n.id] = { kind: 'task', status: t.status, title: t.title }; }
        }
    }
    return live;
}

function buildData(deps: QueueDeps, focusItem?: string): Record<string, unknown> {
    const items = deps.store.list({ limit: 0 });
    return {
        generatedAt: Date.now(),
        items,
        blocked: deps.store.blocked(),
        active: deps.store.active(),
        targets: deps.targets(),
        agents: deps.agentNames(),
        projects: deps.projects(),
        activeProjectId: deps.activeProjectId(),
        live: buildLiveMap(deps, items),
        docOpen: deps.docOpenConfig ? deps.docOpenConfig() : { mode: 'vscode', hasCustom: false },
        focusItem: focusItem ?? null
    };
}

export class QueuePanel {
    private static current: QueuePanel | undefined;
    private disposables: vscode.Disposable[] = [];
    private focusItem?: string;

    static show(deps: QueueDeps, focusItem?: string): void {
        if (QueuePanel.current) {
            QueuePanel.current.deps = deps;
            QueuePanel.current.focusItem = focusItem;
            QueuePanel.current.panel.reveal();
            QueuePanel.current.refresh();
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'agentfarm.queue',
            'Agent Farm — Work Queue',
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        QueuePanel.current = new QueuePanel(panel, deps, focusItem);
    }

    static refreshIfOpen(): void { QueuePanel.current?.refresh(); }

    /**
     * Put the page's own capture box up, seeded — U-14.
     *
     * The palette's `queueAdd` used to ask for the text in an input box, which
     * can state the text and nothing else; this page's box carries the target
     * and the urgency too, and shows the queue you are adding to. Call it right
     * after whatever opened the page — it acts on the panel that is there.
     */
    static composeCurrent(text?: string): void {
        void QueuePanel.current?.panel.webview.postMessage({ type: 'q-compose', text: text ?? '' });
    }

    private constructor(readonly panel: vscode.WebviewPanel, private deps: QueueDeps, focusItem?: string) {
        this.focusItem = focusItem;
        this.render();
        panel.onDidDispose(() => this.dispose(), null, this.disposables);
        panel.webview.onDidReceiveMessage(msg => this.onMessage(msg), null, this.disposables);
    }

    private render(): void {
        this.panel.webview.html = htmlShell(
            this.panel.webview,
            this.deps.extensionUri,
            'Agent Farm Work Queue',
            buildData(this.deps, this.focusItem),
            'queue.js'
        );
        this.focusItem = undefined;   // one-shot: consumed by the first render
    }

    refresh(): void {
        this.panel.webview.postMessage({ type: 'data', data: buildData(this.deps, this.focusItem) });
        this.focusItem = undefined;
    }

    private mutated(): void {
        this.refresh();
        try { this.deps.onChange?.(); } catch { /* badge best-effort */ }
    }

    private onMessage(msg: { type: string;[k: string]: unknown }): void {
        const s = this.deps.store;
        switch (msg.type) {
            case 'add':
                if (typeof msg.text === 'string' && msg.text.trim()) {
                    // ‼️ THE WINDOW SPEAKS HERE, AND ONLY HERE. A person is at
                    // the capture box in a window that says which project they
                    // are working on, so the active project is the honest
                    // default — the same rule tasks follow (see addTask). The
                    // box shows it and lets them change it before pressing Add,
                    // and the row can take it off afterwards.
                    const picked = typeof msg.project === 'string' ? msg.project : undefined;
                    s.add({
                        text: msg.text,
                        author: 'user',
                        target: typeof msg.target === 'string' ? msg.target : undefined,
                        urgency: typeof msg.urgency === 'string' ? msg.urgency : undefined,
                        projectId: picked !== undefined ? picked : this.deps.activeProjectId()
                    });
                    this.mutated();
                }
                break;
            // File items under a project, or take them out of one. Bulk, and an
            // empty `project` clears the stamp.
            case 'setProject': {
                const ids = Array.isArray(msg.ids)
                    ? msg.ids.map(String).filter(Boolean)
                    : (typeof msg.id === 'string' && msg.id ? [msg.id] : []);
                if (!ids.length) { break; }
                s.setProject(ids, typeof msg.project === 'string' ? msg.project : '');
                this.mutated();
                break;
            }
            case 'openProject':
                if (typeof msg.project === 'string' && msg.project) {
                    try { this.deps.openProject?.(msg.project); } catch { /* best-effort */ }
                }
                break;
            case 'edit':
                if (typeof msg.id === 'string' && msg.patch && typeof msg.patch === 'object') {
                    s.edit(msg.id, msg.patch as Record<string, unknown>);
                    this.mutated();
                }
                break;
            case 'setUrgency':
                if (typeof msg.id === 'string' && typeof msg.urgency === 'string') { s.setUrgency(msg.id, msg.urgency); this.mutated(); }
                break;
            case 'drop':
                // User voids a capture — a form of HANDLING it, so it becomes
                // terminal (and only then removable). Nothing vanishes unhandled.
                if (typeof msg.id === 'string') { s.stamp(msg.id, { stamp: '-DROPPED- (cancelled by user)', status: 'dropped' }); this.mutated(); }
                break;
            case 'answer':
                // GAP-2: the user answers a BLOCKED item — records the reply and
                // sends it back into the pipeline (clears it from the bell).
                if (typeof msg.id === 'string' && typeof msg.text === 'string' && msg.text.trim()) {
                    s.answer(msg.id, msg.text); this.mutated();
                }
                break;
            case 'remove':
                if (typeof msg.id === 'string') {
                    const r = s.remove(msg.id);
                    if (!r.ok) {
                        void vscode.window.showWarningMessage(
                            r.reason === 'not-handled'
                                ? "Agent Farm: this item isn't handled yet — drop or finish it first (it can't be deleted before it's handled)."
                                : 'Agent Farm: item not found.');
                    }
                    this.mutated();
                }
                break;
            case 'handoff':
                if (typeof msg.id === 'string') {
                    const item = s.get(msg.id);
                    if (item) { try { this.deps.handoff?.(item); } catch { /* best-effort */ } }
                }
                break;
            case 'openFile':
                if (typeof msg.id === 'string') {
                    this.openFile(msg.id, msg.kind === 'report' ? 'report' : 'answer', typeof msg.mode === 'string' ? msg.mode : undefined);
                }
                break;
            case 'configureDocOpen':
                try { this.deps.configureDocOpen?.(); } catch { /* best-effort */ }
                break;
            case 'openNotice':
                if (typeof msg.id === 'string') { try { this.deps.openNotice?.(msg.id); } catch { /* best-effort */ } }
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

    /** Open the item's answer (01_CEVAPLAR) or report (10_REPORT) file, via the
     *  shared "open with" helper (mode = the caret choice, or the user's default
     *  when omitted). The path comes from the item itself, never the webview —
     *  no arbitrary file open. */
    private openFile(id: string, kind: 'answer' | 'report', mode?: string): void {
        const n = this.deps.store.get(id);
        const p = kind === 'report' ? n?.reportPath : n?.answerPath;
        if (!p) { return; }
        try { this.deps.openDoc?.(p, mode); } catch { /* best-effort */ }
    }

    private dispose(): void {
        QueuePanel.current = undefined;
        for (const d of this.disposables) { d.dispose(); }
    }
}
