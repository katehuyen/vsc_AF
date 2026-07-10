import * as vscode from 'vscode';
import { AgentInfo } from '../core/agents';
import {
    copyMcpServerTo, mcpLastUsed, mcpUsage, readAgentMcpServers, readDisabledServers
} from '../core/mcp';
import { copySkillTo, readAgentSkills, skillLastUsed, skillUsage } from '../core/skills';
import { SessionIndex } from '../core/sessions';
import { htmlShell } from './base';

/**
 * Capability Matrix: skills × agents and MCP servers × agents in one glance —
 * who has what, what is actually used (30d), what is dead weight. Empty cells
 * are actionable: click to copy the capability onto that agent.
 */

export interface CapabilitiesDeps {
    extensionUri: vscode.Uri;
    getAgents(): AgentInfo[];
    index: SessionIndex;
    refreshTrees(): void;
}

const WINDOW_MS = 30 * 24 * 3600 * 1000;

interface Cell {
    present: boolean;
    calls: number;
    lastTs?: number;
    disabled?: boolean;
    source?: string;
}

function buildData(deps: CapabilitiesDeps): Record<string, unknown> {
    const agents = deps.getAgents();

    // Skills: row identity = scope + name (user-scope rows are shared folders).
    const skillRows = new Map<string, {
        name: string; scope: string; description: string; cells: Record<string, Cell>;
    }>();
    for (const agent of agents) {
        const usage = skillUsage(deps.index, agent.id, WINDOW_MS);
        const lastUsed = skillLastUsed(deps.index, agent.id);
        for (const skill of readAgentSkills(agent)) {
            const key = `${skill.scope}:${skill.name}`;
            let row = skillRows.get(key);
            if (!row) {
                row = { name: skill.name, scope: skill.scope, description: skill.description, cells: {} };
                skillRows.set(key, row);
            }
            row.cells[agent.id] = {
                present: true,
                calls: usage.get(skill.name) ?? 0,
                lastTs: lastUsed.get(skill.name),
                source: skill.source
            };
        }
    }

    // MCP: row identity = server name; definitions may differ per agent.
    const mcpRows = new Map<string, {
        name: string; transport: string; commandOrUrl: string; cells: Record<string, Cell>;
    }>();
    for (const agent of agents) {
        const usage = mcpUsage(deps.index, agent.id, WINDOW_MS);
        const lastUsed = mcpLastUsed(deps.index, agent.id);
        const disabled = readDisabledServers(agent);
        for (const server of readAgentMcpServers(agent)) {
            let row = mcpRows.get(server.name);
            if (!row) {
                row = { name: server.name, transport: server.transport, commandOrUrl: server.commandOrUrl, cells: {} };
                mcpRows.set(server.name, row);
            }
            row.cells[agent.id] = {
                present: true,
                calls: usage.get(server.name) ?? 0,
                lastTs: lastUsed.get(server.name),
                disabled: disabled.has(server.name),
                source: server.source
            };
        }
    }

    return {
        generatedAt: Date.now(),
        agents: agents.map(a => ({ id: a.id, name: a.name })),
        skills: [...skillRows.values()]
            .sort((a, b) => a.scope === b.scope ? a.name.localeCompare(b.name) : a.scope === 'user' ? -1 : 1),
        mcp: [...mcpRows.values()].sort((a, b) => a.name.localeCompare(b.name))
    };
}

export class CapabilitiesPanel {
    private static current: CapabilitiesPanel | undefined;
    private disposables: vscode.Disposable[] = [];

    static show(deps: CapabilitiesDeps): void {
        if (CapabilitiesPanel.current) {
            CapabilitiesPanel.current.panel.reveal();
            CapabilitiesPanel.current.refresh();
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'agentfarm.capabilities',
            'Agent Farm — Capability Matrix',
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        CapabilitiesPanel.current = new CapabilitiesPanel(panel, deps);
    }

    static refreshIfOpen(): void {
        CapabilitiesPanel.current?.refresh();
    }

    private constructor(readonly panel: vscode.WebviewPanel, private deps: CapabilitiesDeps) {
        panel.webview.html = htmlShell(
            panel.webview,
            deps.extensionUri,
            'Capability Matrix',
            buildData(deps),
            'capabilities.js'
        );
        panel.onDidDispose(() => this.dispose(), null, this.disposables);
        panel.webview.onDidReceiveMessage(msg => void this.onMessage(msg), null, this.disposables);
    }

    refresh(): void {
        void this.panel.webview.postMessage({ type: 'data', data: buildData(this.deps) });
    }

    private agentById(id: string): AgentInfo | undefined {
        return this.deps.getAgents().find(a => a.id === id);
    }

    private async onMessage(msg: { type: string; [k: string]: unknown }): Promise<void> {
        switch (msg.type) {
            case 'refresh':
                this.refresh();
                break;
            case 'openGuide':
                void vscode.commands.executeCommand('agentfarm.openGuide', 'yetenek-matrisi');
                break;
            case 'open':
                if (typeof msg.path === 'string' && msg.path) {
                    void vscode.window.showTextDocument(vscode.Uri.file(msg.path));
                }
                break;
            case 'copySkill': {
                const to = this.agentById(String(msg.toAgentId));
                const from = this.agentById(String(msg.fromAgentId));
                if (!to || !from) { return; }
                const skill = readAgentSkills(from).find(s =>
                    s.name === msg.name && s.scope === msg.scope);
                if (!skill) { return; }
                const ok = await vscode.window.showInformationMessage(
                    `Copy skill "${skill.name}" from ${from.name} to ${to.name}?`,
                    { modal: true }, 'Copy');
                if (ok !== 'Copy') { return; }
                try {
                    copySkillTo(skill, to);
                    this.deps.refreshTrees();
                    this.refresh();
                } catch (e) {
                    void vscode.window.showWarningMessage(`Agent Farm: ${(e as Error).message ?? String(e)}`);
                }
                break;
            }
            case 'copyMcp': {
                const to = this.agentById(String(msg.toAgentId));
                const from = this.agentById(String(msg.fromAgentId));
                if (!to || !from) { return; }
                const server = readAgentMcpServers(from).find(s => s.name === msg.name);
                if (!server) { return; }
                const ok = await vscode.window.showInformationMessage(
                    `Copy MCP server "${server.name}" from ${from.name} to ${to.name}'s .mcp.json?`,
                    { modal: true }, 'Copy');
                if (ok !== 'Copy') { return; }
                if (copyMcpServerTo(server, to)) {
                    this.deps.refreshTrees();
                    this.refresh();
                } else {
                    void vscode.window.showWarningMessage('Agent Farm: could not read the server definition to copy it.');
                }
                break;
            }
        }
    }

    private dispose(): void {
        CapabilitiesPanel.current = undefined;
        for (const d of this.disposables) { d.dispose(); }
    }
}
