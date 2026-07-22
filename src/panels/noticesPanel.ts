import * as vscode from 'vscode';
import { handleAfNav, htmlShell } from './base';
import { NoticesStore } from '../core/notices';

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
}

function buildData(deps: NoticesDeps): Record<string, unknown> {
    return {
        generatedAt: Date.now(),
        notices: deps.store.list({ limit: 0 }),
        unread: deps.store.unread(),
        agents: deps.agentNames()
    };
}

export class NoticesPanel {
    private static current: NoticesPanel | undefined;
    private disposables: vscode.Disposable[] = [];

    static show(deps: NoticesDeps): void {
        if (NoticesPanel.current) {
            NoticesPanel.current.deps = deps;
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
        NoticesPanel.current = new NoticesPanel(panel, deps);
    }

    static refreshIfOpen(): void {
        NoticesPanel.current?.refresh();
    }

    private constructor(readonly panel: vscode.WebviewPanel, private deps: NoticesDeps) {
        this.render();
        panel.onDidDispose(() => this.dispose(), null, this.disposables);
        panel.webview.onDidReceiveMessage(msg => this.onMessage(msg), null, this.disposables);
    }

    private render(): void {
        this.panel.webview.html = htmlShell(
            this.panel.webview,
            this.deps.extensionUri,
            'Agent Farm Notices',
            buildData(this.deps),
            'notices.js'
        );
    }

    refresh(): void {
        this.panel.webview.postMessage({ type: 'data', data: buildData(this.deps) });
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
            case 'dismiss':
                if (typeof msg.id === 'string') { s.dismiss(msg.id); this.mutated(); }
                break;
            case 'clearRead':
                s.clearRead();
                this.mutated();
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

    private dispose(): void {
        NoticesPanel.current = undefined;
        for (const d of this.disposables) { d.dispose(); }
    }
}
