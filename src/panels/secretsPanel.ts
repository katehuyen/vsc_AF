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

    /**
     * The ONE door to a secret — U-14, surface 5.
     *
     * `agentfarm.setSecret` asked two input boxes and could say nothing about
     * what the secret is FOR or which agents may use it; the page's own four
     * buttons each posted to the host for one more box. All of it is one card
     * now, and every route opens that card.
     */
    static compose(deps: SecretsPanelDeps, name?: string): void {
        SecretsPanel.show(deps);
        void SecretsPanel.current?.panel.webview.postMessage({
            type: 'sec-compose', seed: name ? { name } : {}
        });
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
            case 'sec-save':
                await this.save((msg.secret ?? {}) as Record<string, unknown>);
                break;
            case 'delete':
                await this.remove(String(msg.name ?? ''));
                break;
        }
    }

    /** A refusal the FORM shows, in the form. */
    private say(text: string, ok = false): void {
        void this.panel.webview.postMessage({ type: 'sec-msg', text, ok });
    }

    /**
     * One write for the four things a secret is: its name, its value, what it
     * is for, and which agents may use it.
     *
     * ‼️ THE VALUE ONLY EVER TRAVELS ONE WAY. Nothing sends a stored value to
     * the page — `buildData` ships metadata and nothing else — so on an edit an
     * empty value box means "keep what is in the keychain", which is the only
     * meaning it CAN have here. That is the same promise the deliberately
     * missing "copy the value" menu item makes.
     */
    private async save(raw: Record<string, unknown>): Promise<void> {
        const s = (k: string) => String(raw[k] ?? '').trim();
        const editing = s('mode') === 'edit';
        const name = s('name');
        const value = String(raw.value ?? '');
        const description = s('description');
        const agents = Array.isArray(raw.agents)
            ? (raw.agents as unknown[]).map(String).filter(Boolean) : [];

        if (!name) { return this.say('It needs a name — that name is the environment variable and the {secret:NAME} reference.'); }
        if (!NAME_RE.test(name)) { return this.say('Letters, digits, _ . and - only — it has to be a legal environment variable name.'); }
        if (!editing && this.known(name)) {
            return this.say(`"${name}" already exists. Open its row instead — the value can be replaced there without losing its description or its scope.`);
        }
        if (editing && !this.known(name)) {
            return this.say(`"${name}" is no longer in the keychain — refresh the page.`);
        }
        if (!editing && !value) {
            return this.say('A new secret needs its value. It goes straight into the OS keychain and is never read back.');
        }

        if (value) {
            // set() writes the value and merges the metadata in one go.
            await this.deps.vault.set(name, value, { description, agents });
        } else {
            await this.deps.vault.setMeta(name, { description, agents });
        }
        this.refresh();
        this.say(editing
            ? `"${name}" updated${value ? ' — value replaced' : ''}. ${agents.length ? agents.length + ' agent(s) may use it.' : 'Every agent may use it.'}`
            : `"${name}" stored in the OS keychain. It reaches a task as an environment variable and a prompt as {secret:${name}}. ${agents.length ? agents.length + ' agent(s) may use it.' : 'Every agent may use it until you scope it.'}`,
            true);
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
