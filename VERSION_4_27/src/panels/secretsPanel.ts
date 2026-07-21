import * as vscode from 'vscode';
import { AgentInfo } from '../core/agents';
import { SecretsVault } from '../core/secrets';
import { handleAfNav, htmlShell } from './base';

/**
 * Secrets page — the management console for the OS-keychain vault: every stored
 * secret in one place (add, replace value, edit description, scope to agents,
 * delete) plus its per-agent "usage authorization". Values never reach the
 * webview; only metadata does. Replaces the three scattered palette commands
 * (Set/Delete/List Secret) with one panel — those commands still work and keep
 * this page in sync when it is open.
 */

export interface SecretsPanelDeps {
    extensionUri: vscode.Uri;
    vault: SecretsVault;
    getAgents(): AgentInfo[];
}

const NAME_RE = /^[\w.-]+$/;

function buildData(deps: SecretsPanelDeps): Record<string, unknown> {
    const agents = deps.getAgents();
    const byId = new Map(agents.map(a => [a.id, a.name]));
    const secrets = deps.vault.list().map(s => ({
        name: s.name,
        description: s.description,
        // resolve stored agent ids to names; a dangling id (agent removed) shows as-is
        agents: s.agents.map(id => ({ id, name: byId.get(id) ?? id, missing: !byId.has(id) })),
        allAgents: s.agents.length === 0,
        updatedAt: s.updatedAt,
        createdAt: s.createdAt
    }));
    return {
        secrets,
        agents: agents.map(a => ({ id: a.id, name: a.name })),
        agentCount: agents.length
    };
}

export class SecretsPanel {
    private static current: SecretsPanel | undefined;
    private disposables: vscode.Disposable[] = [];

    static show(deps: SecretsPanelDeps): void {
        if (SecretsPanel.current) {
            SecretsPanel.current.deps = deps;
            SecretsPanel.current.panel.reveal();
            SecretsPanel.current.refresh();
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'agentfarm.secrets',
            'Agent Farm — Secrets',
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        SecretsPanel.current = new SecretsPanel(panel, deps);
    }

    /** Keep an open page current after the palette Set/Delete Secret commands. */
    static refreshIfOpen(): void {
        SecretsPanel.current?.refresh();
    }

    private constructor(readonly panel: vscode.WebviewPanel, private deps: SecretsPanelDeps) {
        panel.webview.html = htmlShell(
            panel.webview, deps.extensionUri, 'Secrets', buildData(deps), 'secrets.js');
        panel.onDidDispose(() => this.dispose(), null, this.disposables);
        panel.webview.onDidReceiveMessage(msg => void this.onMessage(msg), null, this.disposables);
    }

    private refresh(): void {
        void this.panel.webview.postMessage({ type: 'data', data: buildData(this.deps) });
    }

    private known(name: string): boolean {
        return this.deps.vault.names().includes(name);
    }

    private async onMessage(msg: { type: string; [k: string]: unknown }): Promise<void> {
        switch (msg.type) {
            case 'refresh':
                this.refresh();
                break;
            case 'afnav':
                handleAfNav(msg.to);
                break;
            case 'add':
                await this.add();
                break;
            case 'setValue':
                await this.setValue(String(msg.name ?? ''));
                break;
            case 'editDescription':
                await this.editDescription(String(msg.name ?? ''));
                break;
            case 'editScope':
                await this.editScope(String(msg.name ?? ''));
                break;
            case 'delete':
                await this.remove(String(msg.name ?? ''));
                break;
        }
    }

    private async add(): Promise<void> {
        const name = await vscode.window.showInputBox({
            prompt: 'Secret name — used as an env var and {secret:NAME} (e.g. X_PASS, FAL_KEY)',
            ignoreFocusOut: true,
            validateInput: v => {
                if (!NAME_RE.test(v)) { return 'Letters, digits, _ . - only'; }
                if (this.known(v)) { return `"${v}" already exists — use Replace on its row instead`; }
                return undefined;
            }
        });
        if (!name) { return; }
        const value = await vscode.window.showInputBox({
            prompt: `Value for ${name}`, password: true, ignoreFocusOut: true
        });
        if (value === undefined) { return; }
        const description = await vscode.window.showInputBox({
            prompt: `Description for ${name} (optional — what it is / which site)`, ignoreFocusOut: true
        }) ?? '';
        await this.deps.vault.set(name, value, { description });
        this.refresh();
        void vscode.window.showInformationMessage(
            `Agent Farm: secret "${name}" stored in the OS keychain — injected into tasks as env + {secret:${name}}. All agents until you scope it.`);
    }

    private async setValue(name: string): Promise<void> {
        if (!this.known(name)) { return; }
        const value = await vscode.window.showInputBox({
            prompt: `New value for ${name}`, password: true, ignoreFocusOut: true
        });
        if (value === undefined) { return; }
        await this.deps.vault.set(name, value);
        this.refresh();
        void vscode.window.showInformationMessage(`Agent Farm: secret "${name}" value replaced.`);
    }

    private async editDescription(name: string): Promise<void> {
        if (!this.known(name)) { return; }
        const current = this.deps.vault.list().find(s => s.name === name)?.description ?? '';
        const description = await vscode.window.showInputBox({
            prompt: `Description for ${name}`, value: current, ignoreFocusOut: true
        });
        if (description === undefined) { return; }
        await this.deps.vault.setMeta(name, { description });
        this.refresh();
    }

    private async editScope(name: string): Promise<void> {
        if (!this.known(name)) { return; }
        const agents = this.deps.getAgents();
        if (!agents.length) {
            void vscode.window.showWarningMessage('Agent Farm: no agents to scope to.');
            return;
        }
        const current = new Set(this.deps.vault.list().find(s => s.name === name)?.agents ?? []);
        const picks = await vscode.window.showQuickPick(
            agents.map(a => ({ label: a.name, description: a.id, picked: current.has(a.id), id: a.id })),
            {
                canPickMany: true,
                ignoreFocusOut: true,
                placeHolder: `Which agents may use "${name}"? Pick NONE = all agents (unrestricted).`
            });
        if (picks === undefined) { return; }   // cancelled — leave scope untouched
        await this.deps.vault.setMeta(name, { agents: picks.map(p => p.id) });
        this.refresh();
        const scope = picks.length ? `${picks.length} agent(s)` : 'all agents';
        void vscode.window.showInformationMessage(`Agent Farm: "${name}" now scoped to ${scope}.`);
    }

    private async remove(name: string): Promise<void> {
        if (!this.known(name)) { return; }
        const pick = await vscode.window.showWarningMessage(
            `Delete secret "${name}"? It is removed from the OS keychain and can't be recovered.`,
            { modal: true }, 'Delete');
        if (pick !== 'Delete') { return; }
        await this.deps.vault.delete(name);
        this.refresh();
        void vscode.window.showInformationMessage(`Agent Farm: secret "${name}" deleted.`);
    }

    private dispose(): void {
        SecretsPanel.current = undefined;
        for (const d of this.disposables) { d.dispose(); }
    }
}
