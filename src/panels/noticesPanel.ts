import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { askExportOptions, handleAfNav, htmlShell } from './base';
import { buildNoticesMarkdown, Notice, noticeMarkdown, NoticesStore } from '../core/notices';

/**
 * Notices page — the agent→user notice board (see core/notices.ts). Titles
 * first; a click expands the markdown body. Filters (unread / level / agent),
 * mark read/unread, pin, dismiss, mark-all-read, clear-read. Self-contained:
 * it touches nothing but its own store, so it can never destabilise the rest
 * of the farm UI.
 */

export interface NoticesDeps {
    extensionUri: vscode.Uri;
    store: NoticesStore;
    agentNames: () => string[];
    /** Called after any mutation so the host can refresh the status-bar badge. */
    onChange?: () => void;
    /** Export-MD remembers the last save folder (shared farm-wide). */
    lastExportDir?: () => string | undefined;
    setLastExportDir?: (dir: string) => void;
    // --- Notice ↔ Kuyruk integration ---
    /** Convert a notice (or the user's answer to it) into a work-queue item;
     *  links both ways and optionally removes the source notice (default). */
    convertToQueue?: (a: { noticeId: string; text: string; deleteNotice: boolean }) => void;
    /** "Hand to agent" on a notice: open the responsible agent's terminal,
     *  prefilled with the notice text (typed, not sent). */
    handoffNotice?: (notice: Notice) => void;
    /** Open the work queue focused on a spawned item (cross-link). */
    openQueueItem?: (itemId: string) => void;
}

function buildData(deps: NoticesDeps, focusNotice?: string): Record<string, unknown> {
    return {
        generatedAt: Date.now(),
        notices: deps.store.list({ limit: 0 }),
        unread: deps.store.unread(),
        openQuestions: deps.store.openQuestions(),
        agents: deps.agentNames(),
        focusId: focusNotice ?? null
    };
}

export class NoticesPanel {
    private static current: NoticesPanel | undefined;
    private disposables: vscode.Disposable[] = [];
    /** Last batch of notices removed from the UI (single-level undo). */
    private lastRemoved?: Notice[];
    /** One-shot cross-link focus (a queue item's source notice). */
    private focusNotice?: string;

    static show(deps: NoticesDeps, focusNotice?: string): void {
        if (NoticesPanel.current) {
            NoticesPanel.current.deps = deps;
            NoticesPanel.current.focusNotice = focusNotice;
            NoticesPanel.current.panel.reveal();
            NoticesPanel.current.refresh();
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'agentfarm.notices',
            'Agent Farm — Notices',
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        NoticesPanel.current = new NoticesPanel(panel, deps, focusNotice);
    }

    static refreshIfOpen(): void {
        NoticesPanel.current?.refresh();
    }

    private constructor(readonly panel: vscode.WebviewPanel, private deps: NoticesDeps, focusNotice?: string) {
        this.focusNotice = focusNotice;
        this.render();
        panel.onDidDispose(() => this.dispose(), null, this.disposables);
        panel.webview.onDidReceiveMessage(msg => this.onMessage(msg), null, this.disposables);
    }

    /** buildData + the panel-local undo count (kept out of the store). Focus is
     *  one-shot: consumed by the first render/refresh after it is set. */
    private data(): Record<string, unknown> {
        const d = { ...buildData(this.deps, this.focusNotice), undoable: this.lastRemoved?.length ?? 0 };
        this.focusNotice = undefined;
        return d;
    }

    private render(): void {
        this.panel.webview.html = htmlShell(
            this.panel.webview,
            this.deps.extensionUri,
            'Agent Farm Notices',
            this.data(),
            'notices.js'
        );
    }

    refresh(): void {
        this.panel.webview.postMessage({ type: 'data', data: this.data() });
    }

    private mutated(): void {
        this.refresh();
        try { this.deps.onChange?.(); } catch { /* badge best-effort */ }
    }

    private onMessage(msg: { type: string; [k: string]: unknown }): void {
        const s = this.deps.store;
        switch (msg.type) {
            case 'markRead':
                if (typeof msg.id === 'string') { s.markRead(msg.id, msg.read !== false); this.mutated(); }
                break;
            case 'markAllRead':
                s.markAllRead();
                this.mutated();
                break;
            case 'pin':
                if (typeof msg.id === 'string') { s.pin(msg.id, msg.pinned === true); this.mutated(); }
                break;
            case 'setStars':
                if (typeof msg.id === 'string' && typeof msg.stars === 'number') { s.setStars(msg.id, msg.stars); this.mutated(); }
                break;
            case 'answer':
                // Answering a question IS leaving a new task → the answer
                // auto-becomes a work-queue item (constitution: friction-free).
                // The notice is deleted by default (uncheck to keep it, in which
                // case the answer is recorded and the spawned item is linked).
                if (typeof msg.id === 'string' && typeof msg.text === 'string' && msg.text.trim()) {
                    const del = msg.deleteNotice !== false;
                    if (!del) { s.answer(msg.id, msg.text); }
                    try { this.deps.convertToQueue?.({ noticeId: msg.id, text: msg.text, deleteNotice: del }); } catch { /* best-effort */ }
                    this.mutated();
                }
                break;
            case 'convertToQueue':
                // "Add to queue" — turn this notice into a work item.
                if (typeof msg.id === 'string' && typeof msg.text === 'string' && msg.text.trim()) {
                    try { this.deps.convertToQueue?.({ noticeId: msg.id, text: msg.text, deleteNotice: msg.deleteNotice !== false }); } catch { /* best-effort */ }
                    this.mutated();
                }
                break;
            case 'handoffNotice':
                if (typeof msg.id === 'string') {
                    const n = s.list({ limit: 0 }).find(x => x.id === msg.id);
                    if (n) { try { this.deps.handoffNotice?.(n); } catch { /* best-effort */ } }
                }
                break;
            case 'openQueueItem':
                if (typeof msg.id === 'string') { try { this.deps.openQueueItem?.(msg.id); } catch { /* best-effort */ } }
                break;
            case 'decline':
                if (typeof msg.id === 'string') { s.decline(msg.id); this.mutated(); }
                break;
            case 'dismiss':
                if (typeof msg.id === 'string') {
                    const gone = s.list({ limit: 0 }).find(n => n.id === msg.id);
                    if (s.dismiss(msg.id)) { this.lastRemoved = gone ? [gone] : undefined; }
                    this.mutated();
                }
                break;
            case 'markReadMany':
                if (Array.isArray(msg.ids)) {
                    s.markReadMany(msg.ids.filter((x): x is string => typeof x === 'string'), msg.read !== false);
                    this.mutated();
                }
                break;
            case 'dismissMany':
                if (Array.isArray(msg.ids)) {
                    const removed = s.dismissMany(msg.ids.filter((x): x is string => typeof x === 'string'));
                    if (removed.length) { this.lastRemoved = removed; }
                    this.mutated();
                }
                break;
            case 'clearRead': {
                const removed = s.clearRead();
                if (removed.length) { this.lastRemoved = removed; }
                this.mutated();
                break;
            }
            case 'undo':
                if (this.lastRemoved && this.lastRemoved.length) {
                    s.restore(this.lastRemoved);
                    this.lastRemoved = undefined;
                    this.mutated();
                }
                break;
            case 'edit':
                if (typeof msg.id === 'string' && msg.patch && typeof msg.patch === 'object') {
                    s.edit(msg.id, msg.patch as Record<string, unknown>);
                    this.mutated();
                }
                break;
            case 'exportChoose':
                void this.exportView(msg);
                break;
            case 'exportOne':
                if (typeof msg.id === 'string') { void this.exportOne(msg.id); }
                break;
            case 'openReport':
                if (typeof msg.id === 'string') { void this.openReport(msg.id); }
                break;
            case 'openExternal':
                // Only http(s) links from a notice body may open — never a file:// or command: uri.
                if (typeof msg.url === 'string' && /^https?:\/\//i.test(msg.url)) {
                    void vscode.env.openExternal(vscode.Uri.parse(msg.url));
                }
                break;
            case 'refresh':
                this.refresh();
                break;
            case 'afnav':
                handleAfNav(msg.to);
                break;
        }
    }

    /** Page Export MD — two-question prompt, then build + save. `msg.shown` is
     *  the ordered visible id list, `msg.open` the expanded ones. */
    private async exportView(msg: { type: string; [k: string]: unknown }): Promise<void> {
        const all = this.deps.store.list({ limit: 0 });
        const known = new Set(all.map(n => n.id));
        const shown = (Array.isArray(msg.shown) ? msg.shown : [])
            .filter((x): x is string => typeof x === 'string' && known.has(x));
        if (!shown.length) { void vscode.window.showInformationMessage('Agent Farm: no notices to export.'); return; }
        const open = new Set((Array.isArray(msg.open) ? msg.open : []).filter((x): x is string => typeof x === 'string'));
        const someFolded = shown.some(id => !open.has(id));
        const opts = await askExportOptions('notices', someFolded);
        if (!opts) { return; }
        await this.saveMarkdown(buildNoticesMarkdown(all, shown, open, opts), 'notices');
    }

    /** Per-notice Export MD — just that notice, no prompt. */
    private async exportOne(id: string): Promise<void> {
        const n = this.deps.store.list({ limit: 0 }).find(x => x.id === id);
        if (!n) { return; }
        await this.saveMarkdown(`# Agent Farm — Notice\n\n${noticeMarkdown(n, 2)}`, 'notice');
    }

    /** Open the linked full report (the "second leg") in an editor tab. The path
     *  comes from the notice itself (never from the webview), so it can only be a
     *  report an agent attached — no arbitrary file open. */
    private async openReport(id: string): Promise<void> {
        const n = this.deps.store.list({ limit: 0 }).find(x => x.id === id);
        if (!n || !n.reportPath) { return; }
        try {
            if (!fs.existsSync(n.reportPath)) {
                void vscode.window.showWarningMessage(`Agent Farm: report file not found — ${n.reportPath}`);
                return;
            }
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(n.reportPath));
            await vscode.window.showTextDocument(doc, { preview: true });
        } catch (e) {
            void vscode.window.showErrorMessage(`Agent Farm: could not open report — ${String(e)}`);
        }
    }

    private async saveMarkdown(md: string, base: string): Promise<void> {
        const dir = this.deps.lastExportDir?.() || os.homedir();
        const d = new Date();
        const p2 = (n: number) => String(n).padStart(2, '0');
        const stamp = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(path.join(dir, `${base}-${stamp}.md`)),
            filters: { Markdown: ['md'] }
        });
        if (!uri) { return; }
        try {
            fs.writeFileSync(uri.fsPath, md, 'utf8');
            this.deps.setLastExportDir?.(path.dirname(uri.fsPath));
            void vscode.window.showTextDocument(uri);
        } catch (e) {
            void vscode.window.showErrorMessage(`Agent Farm: export failed — ${String(e)}`);
        }
    }

    private dispose(): void {
        NoticesPanel.current = undefined;
        for (const d of this.disposables) { d.dispose(); }
    }
}
