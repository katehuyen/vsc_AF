import * as vscode from 'vscode';
import { AccountsMessageDeps, handleAccountsMessage } from './accountsMessages';
import { EnginesPanelDeps } from './enginesPanel';
import { handlePolicyMessage, PolicyMessageDeps } from './policyMessages';
import { handleAfNav, htmlShell } from './base';
import { desktopHost, type PanelHost } from './panelHost';

/**
 * Accounts — the captured sign-ins on a page of their own (X-236).
 *
 * ‼️ THE SAME VIEW AS THE ENGINES PAGE'S SECTION, NOT A SECOND ONE. The cards,
 * the groups, the capture form and every press are `media/afAccounts.js`; the
 * presses are answered by `handleAccountsMessage`, the handler the Engines
 * panel runs first. What this page adds is only a place to stand: the figures
 * are wanted many times a day, and the section sat at the bottom of a page
 * about something else. X-305's rules come with it (`media/afPolicies.js`,
 * answered by `handlePolicyMessage`): they choose a sign-in, and a page about
 * sign-ins that could not show the rules was the page's one gap.
 *
 * ‼️ THE DEPS ARE THE ENGINES PANEL'S, BY NAME. Every field here is picked out
 * of `EnginesPanelDeps`, so extension.ts hands both pages one object and the
 * two cannot be wired to different readers of the same accounts.
 */
export type AccountsPanelDeps = Pick<EnginesPanelDeps,
    'extensionUri' | 'accounts' | 'accountEngines' | 'autoRefresh' | 'readAccounts' | 'accountBeatMs'>
    & AccountsMessageDeps
    & PolicyMessageDeps
    & { engineLabels: Record<string, string> };

export function buildAccountsData(deps: AccountsPanelDeps): Record<string, unknown> {
    return {
        now: Date.now(),
        accounts: deps.accounts?.() ?? [],
        accountEngines: deps.accountEngines(),
        autoRefresh: deps.autoRefresh(),
        policies: deps.policies(),
        engineLabels: deps.engineLabels
    };
}

export class AccountsPanel {
    private static current: AccountsPanel | undefined;
    private disposables: vscode.Disposable[] = [];
    /** ‼️ X-187 — one timer for the page, never one per account; the service
     *  walks the slots in turn behind its own shared floor. */
    private beat: ReturnType<typeof setInterval> | undefined;

    static show(deps: AccountsPanelDeps): void {
        if (AccountsPanel.current) {
            AccountsPanel.current.deps = deps;
            AccountsPanel.current.host.reveal();
            AccountsPanel.current.refresh();
            AccountsPanel.current.live();
            return;
        }
        AccountsPanel.current = new AccountsPanel(desktopHost({ viewType: 'agentfarm.accounts', title: 'Agent Farm — Accounts' }), deps);
    }

    /** X-456 — the views phones have open: one instance each, never the desktop's one tab. */
    private static phones = new Set<AccountsPanel>();

    /** X-456 — the Accounts page on a phone's view. */
    static openOn(host: PanelHost, deps: AccountsPanelDeps): void {
        AccountsPanel.phones.add(new AccountsPanel(host, deps));
    }

    /** A capture, a switch or a forget made elsewhere should not leave an open page lying. */
    static refreshIfOpen(): void {
        AccountsPanel.current?.refresh();
        for (const p of AccountsPanel.phones) { p.refresh(); }
    }

    private constructor(readonly host: PanelHost, private deps: AccountsPanelDeps) {
        host.webview.html = htmlShell(host.webview, deps.extensionUri, 'Accounts', buildAccountsData(deps), 'accounts.js');
        host.onDidDispose(() => this.dispose(), null, this.disposables);
        host.webview.onDidReceiveMessage(msg => void this.onMessage(msg), null, this.disposables);
        this.live();
        // A hidden page is not a page anybody is reading (the Engines page's rule).
        this.beat = setInterval(() => { if (this.host.visible) { this.live(); } },
            Math.max(1000, this.deps.accountBeatMs()));
    }

    /** X-187 — ask, then redraw: the reading fills the cache `accounts()` reads. */
    private live(): void {
        void Promise.resolve(this.deps.readAccounts())
            .catch(() => undefined)
            .then(() => { this.refresh(); });
    }

    private refresh(): void {
        void this.host.webview.postMessage({ type: 'data', data: buildAccountsData(this.deps) });
    }

    private async onMessage(msg: { type: string;[k: string]: unknown }): Promise<void> {
        if (await handleAccountsMessage(msg, this.deps, {
            say: async text => { await this.host.webview.postMessage({ type: 'acc-msg', text }); },
            refresh: () => this.refresh(),
            live: () => this.live(),
            ask: this.host.ask
        })) { return; }
        if (await handlePolicyMessage(msg, this.deps, {
            say: async text => { await this.host.webview.postMessage({ type: 'pol-msg', text }); },
            refresh: () => this.refresh()
        })) { return; }
        switch (msg.type) {
            case 'refresh':
                this.refresh();
                break;
            case 'afnav':
                handleAfNav(msg.to);
                break;
        }
    }

    private dispose(): void {
        // A phone's view closing leaves the desktop's tab alone.
        if (AccountsPanel.current === this) { AccountsPanel.current = undefined; }
        AccountsPanel.phones.delete(this);
        if (this.beat) { clearInterval(this.beat); }
        for (const d of this.disposables) { d.dispose(); }
        this.disposables = [];
    }
}
