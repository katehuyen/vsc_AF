import * as fs from 'fs';
import * as vscode from 'vscode';
import { handleAfNav, htmlShell } from './base';
import { WorkItem, WorkQueueStore } from '../core/workqueue';

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
    onChange?: () => void;
    /** Cross-link back to Notices, focused on the source notice. */
    openNotice?: (noticeId: string) => void;
    /** "Hand to agent": open the item's target agent terminal, prefilled with the
     *  item text (typed, NOT sent — the user reviews and presses Enter). */
    handoff?: (item: WorkItem) => void;
}

function buildData(deps: QueueDeps, focusItem?: string): Record<string, unknown> {
    return {
        generatedAt: Date.now(),
        items: deps.store.list({ limit: 0 }),
        blocked: deps.store.blocked(),
        active: deps.store.active(),
        targets: deps.targets(),
        agents: deps.agentNames(),
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
                    s.add({
                        text: msg.text,
                        author: 'user',
                        target: typeof msg.target === 'string' ? msg.target : undefined,
                        urgency: typeof msg.urgency === 'string' ? msg.urgency : undefined
                    });
                    this.mutated();
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
                if (typeof msg.id === 'string') { void this.openFile(msg.id, msg.kind === 'report' ? 'report' : 'answer'); }
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

    /** Open the item's answer (01_CEVAPLAR) or report (10_REPORT) file. The path
     *  comes from the item itself, never the webview — no arbitrary file open. */
    private async openFile(id: string, kind: 'answer' | 'report'): Promise<void> {
        const n = this.deps.store.get(id);
        const p = kind === 'report' ? n?.reportPath : n?.answerPath;
        if (!p) { return; }
        try {
            if (!fs.existsSync(p)) {
                void vscode.window.showWarningMessage(`Agent Farm: file not found — ${p}`);
                return;
            }
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(p));
            await vscode.window.showTextDocument(doc, { preview: true });
        } catch (e) {
            void vscode.window.showErrorMessage(`Agent Farm: could not open file — ${String(e)}`);
        }
    }

    private dispose(): void {
        QueuePanel.current = undefined;
        for (const d of this.disposables) { d.dispose(); }
    }
}
