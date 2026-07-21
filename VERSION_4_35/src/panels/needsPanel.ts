import * as vscode from 'vscode';
import { NeedItem } from '../core/needs';
import { handleAfNav, htmlShell } from './base';

/**
 * G1 — "Needs You" panel: the single urgency-sorted queue of everything
 * blocked on the human. Rows carry one-click actions; the extension resolves
 * them (approve browser steps, open sessions, review suggestions…).
 */

export interface NeedsDeps {
    extensionUri: vscode.Uri;
    buildItems(): NeedItem[];
    /** Handle a row action; return true if the queue should re-render. */
    onAction(actionId: string, item: NeedItem): void | Promise<void>;
    /** Fired by the extension whenever underlying state changes. */
    onDidChange: vscode.Event<void>;
}

export class NeedsPanel {
    private static current: NeedsPanel | undefined;
    private disposables: vscode.Disposable[] = [];

    static show(deps: NeedsDeps): void {
        if (NeedsPanel.current) {
            NeedsPanel.current.panel.reveal();
            NeedsPanel.current.refresh();
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'agentfarm.needs',
            'Agent Farm — Needs You',
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        NeedsPanel.current = new NeedsPanel(panel, deps);
    }

    static refreshIfOpen(): void {
        NeedsPanel.current?.refresh();
    }

    private constructor(readonly panel: vscode.WebviewPanel, private deps: NeedsDeps) {
        this.panel.webview.html = htmlShell(
            panel.webview,
            deps.extensionUri,
            'Needs You',
            { items: deps.buildItems(), generatedAt: Date.now() },
            'needs.js'
        );
        panel.onDidDispose(() => this.dispose(), null, this.disposables);
        panel.webview.onDidReceiveMessage(msg => void this.onMessage(msg), null, this.disposables);
        this.disposables.push(deps.onDidChange(() => this.refresh()));
    }

    refresh(): void {
        void this.panel.webview.postMessage({
            type: 'data',
            data: { items: this.deps.buildItems(), generatedAt: Date.now() }
        });
    }

    private async onMessage(msg: { type: string; actionId?: string; item?: NeedItem }): Promise<void> {
        if (msg.type === 'refresh') { this.refresh(); return; }
        if (msg.type === 'afnav') { handleAfNav((msg as { to?: unknown }).to); return; }
        if (msg.type === 'openGuide') {
            void vscode.commands.executeCommand('agentfarm.openGuide', 'onay-kuyrugu');
            return;
        }
        if (msg.type === 'action' && msg.actionId && msg.item) {
            await this.deps.onAction(msg.actionId, msg.item);
            this.refresh();
        }
    }

    private dispose(): void {
        NeedsPanel.current = undefined;
        for (const d of this.disposables) { d.dispose(); }
    }
}
