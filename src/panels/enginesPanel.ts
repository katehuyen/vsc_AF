import * as vscode from 'vscode';
import { EngineId, EngineStatus } from '../core/engines';
import { EngineTestResult } from '../core/engineTest';
import { handleAfNav, htmlShell } from './base';

/**
 * Engines — the page that answers "what can this machine actually run, and why
 * not" (X-3 / X-14).
 *
 * ‼️ WHY IT IS ITS OWN PANEL. Phase 1 shipped this as a section inside Farm
 * Settings, deliberately: the item said the placement was to be discussed
 * first, so it went somewhere visible without deciding anything. The user chose
 * a dedicated panel on 2026-08-09, and the reason it earns one is that the
 * questions here are not settings. A setting is a value you edit; an engine is
 * a thing you interrogate — is it installed, how is it paid for, is the grant
 * still good, does a call actually get through. That last one costs money to
 * answer, needs a verdict with an age on it, and has nowhere to live in a list
 * of `agentFarm.*` keys.
 *
 * ‼️ NOTHING HERE HOLDS A CREDENTIAL. The sign-in is the CLI's own command,
 * typed into a real terminal and not run for us; the key route hands over to
 * the vault's own form; the docs link is https only. The page is shipped
 * metadata and verdicts, never a value.
 */

export interface EnginesPanelDeps {
    extensionUri: vscode.Uri;
    /** the matrix, read fresh — a CLI can be installed while the page is open */
    engines(): EngineStatus[];
    /** ‼️ one real turn against the engine. Pressed, never scheduled. */
    test(id: EngineId): Promise<EngineTestResult>;
    /** write a command into a terminal WITHOUT running it (install or sign-in) */
    command(command: string): void;
    /** hand the key route to the vault's own form, on that exact name */
    key(name: string): void;
}

function buildData(deps: EnginesPanelDeps, verdicts: Map<EngineId, EngineTestResult>): Record<string, unknown> {
    const engines = deps.engines();
    return {
        engines,
        // The verdicts are sent with the matrix so the page never has to ask
        // twice, and each carries its own timestamp: the AGE is the point.
        verdicts: [...verdicts.values()],
        now: Date.now(),
        ready: engines.filter(e => e.ready).length,
        onPlan: engines.filter(e => e.ready && e.auth.mode === 'subscription').length
    };
}

export class EnginesPanel {
    private static current: EnginesPanel | undefined;
    private disposables: vscode.Disposable[] = [];
    /**
     * ‼️ THE CACHE IS THE WHOLE COST CONTROL. A verdict is kept for as long as
     * the panel lives so looking twice is free; it is never refreshed on its
     * own, never on open, never on a timer. Only the button spends anything.
     */
    private verdicts = new Map<EngineId, EngineTestResult>();
    /** ids with a call in flight — a second press must not buy a second turn */
    private running = new Set<EngineId>();

    static show(deps: EnginesPanelDeps): void {
        if (EnginesPanel.current) {
            EnginesPanel.current.deps = deps;
            EnginesPanel.current.panel.reveal();
            EnginesPanel.current.refresh();
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'agentfarm.engines',
            'Agent Farm — Engines',
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        EnginesPanel.current = new EnginesPanel(panel, deps);
    }

    /** After a key was stored or a CLI installed, an open page should not lie. */
    static refreshIfOpen(): void {
        EnginesPanel.current?.refresh();
    }

    private constructor(readonly panel: vscode.WebviewPanel, private deps: EnginesPanelDeps) {
        panel.webview.html = htmlShell(
            panel.webview, deps.extensionUri, 'Engines', buildData(deps, this.verdicts), 'engines.js');
        panel.onDidDispose(() => this.dispose(), null, this.disposables);
        panel.webview.onDidReceiveMessage(msg => void this.onMessage(msg), null, this.disposables);
    }

    private refresh(): void {
        void this.panel.webview.postMessage({
            type: 'data', data: buildData(this.deps, this.verdicts)
        });
    }

    private async onMessage(msg: { type: string;[k: string]: unknown }): Promise<void> {
        switch (msg.type) {
            case 'refresh':
                this.refresh();
                break;
            case 'afnav':
                handleAfNav(msg.to);
                break;
            case 'engineTest':
                await this.runTest(String(msg.id ?? '') as EngineId);
                break;
            case 'engineCommand':
                if (typeof msg.command === 'string' && msg.command) {
                    this.deps.command(msg.command);
                }
                break;
            case 'engineKey':
                if (typeof msg.name === 'string' && msg.name) {
                    this.deps.key(msg.name);
                }
                break;
            case 'engineDocs':
                // https only — a docs button is not a way to open anything else.
                if (typeof msg.url === 'string' && /^https:\/\//.test(msg.url)) {
                    void vscode.env.openExternal(vscode.Uri.parse(msg.url));
                }
                break;
        }
    }

    /**
     * One real turn, and the page is told before and after — a button that goes
     * quiet for ninety seconds is a button somebody presses again.
     */
    private async runTest(id: EngineId): Promise<void> {
        if (!id || this.running.has(id)) { return; }
        const engine = this.deps.engines().find(e => e.id === id);
        if (!engine) { return; }
        if (!engine.cli.found) {
            // Refusing here rather than spending: there is nothing to call.
            void this.panel.webview.postMessage({
                type: 'eng-msg', id,
                text: `${engine.label} is not installed — there is nothing to call yet.`
            });
            return;
        }
        this.running.add(id);
        void this.panel.webview.postMessage({ type: 'eng-testing', id });
        try {
            const result = await this.deps.test(id);
            this.verdicts.set(id, result);
        } finally {
            this.running.delete(id);
            this.refresh();
        }
    }

    private dispose(): void {
        EnginesPanel.current = undefined;
        for (const d of this.disposables) { d.dispose(); }
    }
}
