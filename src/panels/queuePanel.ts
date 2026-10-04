import * as vscode from 'vscode';
import { handleAfNav, htmlShell } from './base';
import { desktopHost, type PanelHost } from './panelHost';
import type { WorkItem } from '../core/workqueue';
import { clearHandled, removeMany } from '../core/queueHygiene';
import type { QueueDeps } from './queueDeps';

/**
 * Work Queue page — the user→agent async work queue (see core/workqueue.ts),
 * the mirror of the Notices board. Low-friction capture + pipeline LANES so the
 * user can track what they dropped through to completion (and read the outcome).
 * Self-contained: it touches only its own store, plus injected callbacks for the
 * two cross-boundary actions (open a source notice; hand an item to an agent).
 */

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
        // X-49 — the same `launch` contract the Tasks form reads, so the two
        // pages cannot come to different conclusions about what an engine offers.
        launch: {
            engines: deps.engineChoices ? deps.engineChoices() : [],
            engineModels: deps.engineModels ? deps.engineModels() : null,
            efforts: deps.efforts ? deps.efforts() : [],
            // X-254 (2/n) — …and the sign-ins, keyed by engine, in the same
            // shape the Tasks form reads them (`AFAccount` draws the row).
            accounts: deps.engineAccounts ? deps.engineAccounts() : null,
            // X-305 — …and the rules, drawn as their own group above the slots.
            policies: deps.enginePolicies ? deps.enginePolicies() : null
        },
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
            QueuePanel.current.host.reveal();
            QueuePanel.current.refresh();
            return;
        }
        QueuePanel.current = new QueuePanel(
            desktopHost({ viewType: 'agentfarm.queue', title: 'Agent Farm — Work Queue' }), deps, focusItem);
    }

    /** X-466 — the views phones have open: one instance each, never the desktop's one tab. */
    private static phones = new Set<QueuePanel>();

    static openOn(host: PanelHost, deps: QueueDeps): void {
        QueuePanel.phones.add(new QueuePanel(host, deps));
    }

    static refreshIfOpen(): void {
        QueuePanel.current?.refresh();
        for (const p of QueuePanel.phones) { p.refresh(); }
    }

    /**
     * Put the page's own capture box up, seeded — U-14.
     *
     * The palette's `queueAdd` used to ask for the text in an input box, which
     * can state the text and nothing else; this page's box carries the target
     * and the urgency too, and shows the queue you are adding to. Call it right
     * after whatever opened the page — it acts on the panel that is there.
     */
    static composeCurrent(text?: string): void {
        void QueuePanel.current?.host.webview.postMessage({ type: 'q-compose', text: text ?? '' });
    }

    private constructor(readonly host: PanelHost, private deps: QueueDeps, focusItem?: string) {
        this.focusItem = focusItem;
        this.render();
        host.onDidDispose(() => this.dispose(), null, this.disposables);
        host.webview.onDidReceiveMessage(msg => this.onMessage(msg), null, this.disposables);
    }

    private render(): void {
        this.host.webview.html = htmlShell(
            this.host.webview,
            this.deps.extensionUri,
            'Agent Farm Work Queue',
            buildData(this.deps, this.focusItem),
            'queue.js'
        );
        this.focusItem = undefined;   // one-shot: consumed by the first render
    }

    refresh(): void {
        void this.host.webview.postMessage({ type: 'data', data: buildData(this.deps, this.focusItem) });
        this.focusItem = undefined;
    }

    private mutated(): void {
        // A phone's change shows on the PC's tab and the other way round.
        QueuePanel.refreshIfOpen();
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
                        engine: typeof msg.engine === 'string' ? msg.engine : undefined,
                        model: typeof msg.model === 'string' ? msg.model : undefined,
                        effort: typeof msg.effort === 'string' ? msg.effort : undefined,
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
            // X-49 — WHO should take it. One axis at a time: the row draws three
            // little boxes and each sends only itself, so filling one in never
            // wipes what is in the others. An empty string is "unclaim it",
            // which is why the value is passed through rather than dropped.
            case 'setRoute':
                if (typeof msg.id === 'string' && msg.id) {
                    s.setRoute(msg.id, {
                        engine: typeof msg.engine === 'string' ? msg.engine : undefined,
                        model: typeof msg.model === 'string' ? msg.model : undefined,
                        effort: typeof msg.effort === 'string' ? msg.effort : undefined,
                        // X-254 — the fourth axis, on the same terms: passed
                        // through even when empty, because '' is "unclaim it".
                        account: typeof msg.account === 'string' ? msg.account : undefined
                    });
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
                        void this.host.ask.warn(
                            r.reason === 'not-handled'
                                ? "Agent Farm: this item isn't handled yet — drop or finish it first (it can't be deleted before it's handled)."
                                : 'Agent Farm: item not found.');
                    }
                    this.mutated();
                }
                break;
            case 'removeMany': {
                const ids = Array.isArray(msg.ids) ? msg.ids.filter((x): x is string => typeof x === 'string') : [];
                if (!ids.length) { break; }
                const r = removeMany(s, ids);
                if (r.live.length) {
                    void this.host.ask.warn(
                        `Agent Farm: ${r.live.length} item(s) kept — not handled yet. Drop or finish them first; only handled items can be deleted.`);
                }
                if (r.deleted) { this.mutated(); }
                break;
            }
            case 'clearHandled':
                if (clearHandled(s)) { this.mutated(); }
                break;
            case 'handoff':
                if (typeof msg.id === 'string') {
                    const item = s.get(msg.id);
                    if (item) { try { this.deps.handoff?.(item); } catch { /* best-effort */ } }
                }
                break;
            case 'openFile':
                if (typeof msg.id === 'string') {
                    this.openFile(msg.id, msg.kind === 'report' || msg.kind === 'noticeReport' ? msg.kind : 'answer', typeof msg.mode === 'string' ? msg.mode : undefined);
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
    private openFile(id: string, kind: 'answer' | 'report' | 'noticeReport', mode?: string): void {
        const n = this.deps.store.get(id);
        const p = kind === 'report' ? n?.reportPath : kind === 'noticeReport' ? n?.sourceNoticeReportPath : n?.answerPath;
        if (!p) { return; }
        try { this.deps.openDoc?.(p, mode); } catch { /* best-effort */ }
    }

    private dispose(): void {
        // A phone's view closing leaves the desktop's tab alone.
        if (QueuePanel.current === this) { QueuePanel.current = undefined; }
        QueuePanel.phones.delete(this);
        for (const d of this.disposables) { d.dispose(); }
    }
}
