import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { askExportOptions, handleAfNav, htmlShell } from './base';
import { desktopHost, type PanelHost } from './panelHost';
import { buildNoticesMarkdown, Notice, noticeMarkdown, NoticesStore } from '../core/notices';

/**
 * Notices page — the agent→user notice board (see core/notices.ts). Titles
 * first; a click expands the markdown body. Filters (unread / level / agent),
 * mark read/unread, pin, dismiss, mark-all-read, clear-read. Self-contained:
 * it touches nothing but its own store, so it can never destabilise the rest
 * of the farm UI.
 */

/**
 * A project as a page needs it: the identity, plus what its hover says.
 *
 * ‼️ NOT the whole `Project`. Four surfaces carry a project now, and shipping
 * the entity to each of them on every refresh is how a read-only board starts
 * costing the window frames. The shape is shared with the Queue page and drawn
 * by `media/afProject.js`.
 */
export interface ProjectRef {
    id: string;
    name: string;
    color?: string;
    icon?: string;
    status?: string;
    kind?: string;
    summary?: string;
    folder?: string;
    repos?: string[];
    tags?: string[];
}

export interface NoticesDeps {
    extensionUri: vscode.Uri;
    store: NoticesStore;
    agentNames: () => string[];
    /** Open projects, for the row picker and the filter. */
    projects: () => ProjectRef[];
    /** The window's active project — what a notice filed from here defaults to. */
    activeProjectId: () => string;
    /** Open a project's page, from a notice's project mark. */
    openProject?: (id: string) => void;
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
    // --- Feature B: shared "open with" for the linked report .md ---
    /** Open a resolved report file with a mode (default when omitted). */
    openDoc?: (filePath: string, mode?: string) => void;
    /** Current doc-open default, for the split-button UI. */
    docOpenConfig?: () => { mode: string; hasCustom: boolean };
    /** Launch the host-side "configure default + custom app" flow. */
    configureDocOpen?: () => void;
}

function buildData(deps: NoticesDeps, focusNotice?: string): Record<string, unknown> {
    return {
        generatedAt: Date.now(),
        notices: deps.store.list({ limit: 0 }),
        unread: deps.store.unread(),
        openQuestions: deps.store.openQuestions(),
        agents: deps.agentNames(),
        projects: deps.projects(),
        activeProjectId: deps.activeProjectId(),
        docOpen: deps.docOpenConfig ? deps.docOpenConfig() : { mode: 'vscode', hasCustom: false },
        focusId: focusNotice ?? null
    };
}

export class NoticesPanel {
    private static current: NoticesPanel | undefined;
    private disposables: vscode.Disposable[] = [];
    /** Last batch of notices removed from the UI (single-level undo). */
    // B-20 - the undo memory moved to the STORE, so the board's button and
    // `notices.undo` take back the same removal. Keeping a second copy here
    // is how the two would come to disagree.
    /** One-shot cross-link focus (a queue item's source notice). */
    private focusNotice?: string;

    static show(deps: NoticesDeps, focusNotice?: string): void {
        if (NoticesPanel.current) {
            NoticesPanel.current.deps = deps;
            NoticesPanel.current.focusNotice = focusNotice;
            NoticesPanel.current.host.reveal();
            NoticesPanel.current.refresh();
            return;
        }
        NoticesPanel.current = new NoticesPanel(desktopHost({ viewType: 'agentfarm.notices', title: 'Agent Farm — Notices' }), deps, focusNotice);
    }

    /** X-456 — the views phones have open: one instance each, never the desktop's one tab. */
    private static phones = new Set<NoticesPanel>();

    /** X-456 — the board on a phone's view. */
    static openOn(host: PanelHost, deps: NoticesDeps): void {
        NoticesPanel.phones.add(new NoticesPanel(host, deps));
    }

    /** A notice posted or changed anywhere reaches the desktop tab and every phone. */
    static refreshIfOpen(): void {
        NoticesPanel.current?.refresh();
        for (const p of NoticesPanel.phones) { p.refresh(); }
    }

    private constructor(readonly host: PanelHost, private deps: NoticesDeps, focusNotice?: string) {
        this.focusNotice = focusNotice;
        this.render();
        host.onDidDispose(() => this.dispose(), null, this.disposables);
        host.webview.onDidReceiveMessage(msg => this.onMessage(msg), null, this.disposables);
    }

    /** buildData + the panel-local undo count (kept out of the store). Focus is
     *  one-shot: consumed by the first render/refresh after it is set. */
    private data(): Record<string, unknown> {
        const d = { ...buildData(this.deps, this.focusNotice), undoable: this.deps.store.undoable() };
        this.focusNotice = undefined;
        return d;
    }

    private render(): void {
        this.host.webview.html = htmlShell(
            this.host.webview,
            this.deps.extensionUri,
            'Agent Farm Notices',
            this.data(),
            'notices.js'
        );
    }

    refresh(): void {
        void this.host.webview.postMessage({ type: 'data', data: this.data() });
    }

    /** Every open board shows the change — the desktop's tab and every phone's view. */
    private mutated(): void {
        NoticesPanel.refreshIfOpen();
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
            // File notices under a project, or take them out of one. Bulk
            // because the board already has a checkbox column; an empty
            // `project` clears the stamp, which is the whole reason stamping
            // automatically is safe at all.
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
                    // B-20 - the board no longer looks the notice up to keep a
                    // copy for Undo: the store hands it back to itself.
                    s.dismiss(msg.id);
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
                    s.dismissMany(msg.ids.filter((x): x is string => typeof x === 'string'));
                    this.mutated();   // the store remembers the batch for undo
                }
                break;
            case 'clearRead': {
                s.clearRead();   // …and this sweep too
                this.mutated();
                break;
            }
            case 'undo':
                if (s.undo() > 0) { this.mutated(); }
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
                if (typeof msg.id === 'string') { this.openReport(msg.id, typeof msg.mode === 'string' ? msg.mode : undefined); }
                break;
            case 'configureDocOpen':
                try { this.deps.configureDocOpen?.(); } catch { /* best-effort */ }
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
        if (!shown.length) { void this.host.ask.info('Agent Farm: no notices to export.'); return; }
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

    /** Open the linked full report (the "second leg") via the shared "open with"
     *  helper (mode = the caret choice, or the user's default when omitted). The
     *  path comes from the notice itself (never from the webview), so it can only
     *  be a report an agent attached — no arbitrary file open. */
    private openReport(id: string, mode?: string): void {
        const n = this.deps.store.list({ limit: 0 }).find(x => x.id === id);
        if (!n || !n.reportPath) { return; }
        try { this.deps.openDoc?.(n.reportPath, mode); } catch { /* best-effort */ }
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
            void this.host.ask.error(`Agent Farm: export failed — ${String(e)}`);
        }
    }

    private dispose(): void {
        // A phone's view closing leaves the desktop's tab alone.
        if (NoticesPanel.current === this) { NoticesPanel.current = undefined; }
        NoticesPanel.phones.delete(this);
        for (const d of this.disposables) { d.dispose(); }
    }
}
