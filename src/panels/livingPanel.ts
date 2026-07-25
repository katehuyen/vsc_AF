import * as vscode from 'vscode';
import { buildLivingReport, LivingCheck, LivingInput } from '../core/living';
import { handleAfNav, htmlShell } from './base';

/**
 * Living page — "is the system alive today?" on one screen.
 *
 * Every other page reports on a part. This one reports on the LOOPS: something
 * opened — did it close? It exists because the parts can all be green while the
 * system is dead (the daily cycle stopped for 16 days while the safety-net duty
 * ran correctly every morning and its reminder went unread).
 *
 * All the judgment lives in core/living.ts; this panel only injects the farm's
 * current state and renders.
 */

export interface LivingDeps {
    extensionUri: vscode.Uri;
    /** everything core/living needs, assembled by the host */
    snapshot: () => LivingInput;
    /** re-render triggers (task store, notices, queue) */
    onDidChange: vscode.Event<void>;
    checks: () => LivingCheck[];
}

export class LivingPanel {
    private static current: LivingPanel | undefined;
    private disposables: vscode.Disposable[] = [];

    static show(deps: LivingDeps): void {
        if (LivingPanel.current) {
            LivingPanel.current.panel.reveal();
            LivingPanel.current.refresh();
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'agentfarm.living',
            'Agent Farm — Living',
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        LivingPanel.current = new LivingPanel(panel, deps);
    }

    static refreshIfOpen(): void {
        LivingPanel.current?.refresh();
    }

    private constructor(readonly panel: vscode.WebviewPanel, private deps: LivingDeps) {
        panel.webview.html = htmlShell(
            panel.webview, deps.extensionUri, 'Agent Farm Living',
            this.data(), 'livingPage.js');
        panel.onDidDispose(() => this.dispose(), null, this.disposables);
        panel.webview.onDidReceiveMessage(msg => this.onMessage(msg), null, this.disposables);
        this.disposables.push(deps.onDidChange(() => this.refresh()));
    }

    private data(): Record<string, unknown> {
        const input = this.deps.snapshot();
        const report = buildLivingReport({ ...input, checks: this.deps.checks() });
        return { ...report, hasChecks: this.deps.checks().length > 0 };
    }

    refresh(): void {
        void this.panel.webview.postMessage({ type: 'data', data: this.data() });
    }

    private onMessage(msg: { type: string; to?: string }): void {
        switch (msg.type) {
            case 'refresh':
                this.refresh();
                break;
            case 'afnav':
                handleAfNav(msg.to);
                break;
            case 'goto':
                handleAfNav(msg.to);
                break;
            case 'configure':
                void vscode.commands.executeCommand('agentfarm.configureLivingChecks');
                break;
            case 'openGuide':
                void vscode.commands.executeCommand('agentfarm.openGuide', 'yasam-panosu');
                break;
        }
    }

    private dispose(): void {
        LivingPanel.current = undefined;
        for (const d of this.disposables) { d.dispose(); }
    }
}
