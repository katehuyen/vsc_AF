import * as vscode from 'vscode';
import { isClearable, NeedItem, needKey } from '../core/needs';
import { handleAfNav, htmlShell } from './base';
import { desktopHost, type PanelHost } from './panelHost';

/**
 * G1 — "Needs You" panel: the single urgency-sorted queue of everything
 * blocked on the human. Rows carry one-click actions; the extension resolves
 * them (approve browser steps, open sessions, reconcile drift…) — and a row
 * you have seen and judged can be CLEARED, one by one, by selection or all at
 * once, which is what turns the page from a noticeboard into a worklist.
 */

export interface NeedsDeps {
    extensionUri: vscode.Uri;
    buildItems(): NeedItem[];
    /** Handle a row action; return true if the queue should re-render. */
    onAction(actionId: string, item: NeedItem): void | Promise<void>;
    /** Hide rows by key; `undefined` = every clearable row. Returns how many. */
    onClear(keys?: string[]): Promise<number>;
    /** Bring every cleared row back. Returns how many were restored. */
    onRestore(): Promise<number>;
    /** How many currently-produced rows a clear is hiding. */
    hiddenCount(): number;
    /** Fired by the extension whenever underlying state changes. */
    onDidChange: vscode.Event<void>;
}

export class NeedsPanel {
    private static current: NeedsPanel | undefined;
    private disposables: vscode.Disposable[] = [];

    static show(deps: NeedsDeps): void {
        if (NeedsPanel.current) {
            NeedsPanel.current.host.reveal();
            NeedsPanel.current.refresh();
            return;
        }
        NeedsPanel.current = new NeedsPanel(desktopHost({ viewType: 'agentfarm.needs', title: 'Agent Farm — Needs You' }), deps);
    }

    /** X-441 — the page on a phone: one instance per view, never the desktop's one tab. */
    static openOn(host: PanelHost, deps: NeedsDeps): void {
        new NeedsPanel(host, deps);
    }

    static refreshIfOpen(): void {
        NeedsPanel.current?.refresh();
    }

    private constructor(readonly host: PanelHost, private deps: NeedsDeps) {
        host.webview.html = htmlShell(
            host.webview,
            deps.extensionUri,
            'Needs You',
            this.data(),
            'needs.js'
        );
        host.onDidDispose(() => this.dispose(), null, this.disposables);
        host.webview.onDidReceiveMessage(msg => void this.onMessage(msg), null, this.disposables);
        this.disposables.push(deps.onDidChange(() => this.refresh()));
    }

    /** The page renders keys and clearability from here — never re-derived in JS. */
    private data(): unknown {
        const items = this.deps.buildItems().map(item => ({
            ...item, key: needKey(item), clearable: isClearable(item)
        }));
        return { items, hidden: this.deps.hiddenCount(), generatedAt: Date.now() };
    }

    refresh(): void {
        void this.host.webview.postMessage({ type: 'data', data: this.data() });
    }

    private async onMessage(
        msg: { type: string; actionId?: string; item?: NeedItem; keys?: string[]; all?: boolean; agentId?: string }
    ): Promise<void> {
        if (msg.type === 'refresh') { this.refresh(); return; }
        // Opening another page or the agent's card happens in VS Code; from a phone that
        // would open it on the PC, so a remote view does not (the phone's own nav is X-443).
        if (this.host.remote && (msg.type === 'afnav' || msg.type === 'openGuide' || msg.type === 'openAgent')) { return; }
        if (msg.type === 'afnav') { handleAfNav((msg as { to?: unknown }).to); return; }
        if (msg.type === 'openGuide') {
            void vscode.commands.executeCommand('agentfarm.openGuide', 'onay-kuyrugu');
            return;
        }
        // From a row's right-click menu: the agent behind the blocker. The
        // session half of that menu is host commands and never comes through
        // here — this is the one thing the page has to ask for.
        if (msg.type === 'openAgent' && typeof msg.agentId === 'string' && msg.agentId) {
            void vscode.commands.executeCommand('agentfarm.openAgentDetail', { agentId: msg.agentId });
            return;
        }
        if (msg.type === 'action' && msg.actionId && msg.item) {
            await this.deps.onAction(msg.actionId, msg.item);
            this.refresh();
            return;
        }
        if (msg.type === 'clear') {
            await this.deps.onClear(msg.all ? undefined : (msg.keys ?? []));
            this.refresh();
            return;
        }
        if (msg.type === 'restore') {
            await this.deps.onRestore();
            this.refresh();
        }
    }

    private dispose(): void {
        if (NeedsPanel.current === this) { NeedsPanel.current = undefined; }
        for (const d of this.disposables) { d.dispose(); }
    }
}
