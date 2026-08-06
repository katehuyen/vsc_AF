import * as path from 'path';
import * as vscode from 'vscode';
import { AgentInfo } from '../core/agents';
import { mcpUsage, readAgentMcpServers, removeMcpServer, setServerDisabled } from '../core/mcp';
import { loadProbeCache, McpServerConfig, probeMcpServer, saveProbeCache } from '../core/mcpProbe';
import { readAgentSkills, skillUsage } from '../core/skills';
import { SessionIndex } from '../core/sessions';
import { revealPath } from '../core/reveal';
import {
    buildToolboxInventory, HookEntry, removeHookEntry, removeUserMcpServer, removeWithBackup,
    scaffoldItem, setPluginEnabled, ToolboxItem, userClaudeDir, userConfigJson
} from '../core/toolbox';
import { probeCacheKey, resolveServerConfig } from '../core/toolboxBridge';
import { handleAfNav, htmlShell } from './base';

/**
 * Toolbox page — the management console behind the Toolbox sidebar section:
 * every kind of Claude extension at user + agent scope in one place, with
 * details (down to an MCP server's actual tool list via live probe) and
 * actions (open, reveal, create, remove-with-backup, enable/disable).
 */

export interface ToolboxPanelDeps {
    extensionUri: vscode.Uri;
    getAgents(): AgentInfo[];
    index: SessionIndex;
    /** disk cache for MCP probe results (shared with the bridge op) */
    cacheFile: string;
    refreshTrees(): void;
    home?: string;
}

const USAGE_WINDOW_MS = 30 * 24 * 3600 * 1000;

function buildData(deps: ToolboxPanelDeps): Record<string, unknown> {
    const agents = deps.getAgents();
    const inv = buildToolboxInventory(agents, deps.home);

    // Real 30d usage from transcripts: per-agent for agent scope; user-scope
    // rows aggregate across every agent (they are shared by all of them).
    const skillUse = new Map(agents.map(a => [a.id, skillUsage(deps.index, a.id, USAGE_WINDOW_MS)]));
    const mcpUse = new Map(agents.map(a => [a.id, mcpUsage(deps.index, a.id, USAGE_WINDOW_MS)]));
    for (const it of inv.items) {
        if (it.kind === 'skill' || it.kind === 'mcp') {
            // both usage tables are keyed by the item's name (skill / server)
            const table = it.kind === 'skill' ? skillUse : mcpUse;
            it.detail.usage30d = it.scope === 'agent' && it.agentId
                ? table.get(it.agentId)?.get(it.name) ?? 0
                : agents.reduce((sum, a) => sum + (table.get(a.id)?.get(it.name) ?? 0), 0);
        }
    }

    return {
        generatedAt: inv.generatedAt,
        agents: agents.map(a => ({ id: a.id, name: a.name })),
        counts: inv.counts,
        items: inv.items,
        probeCache: loadProbeCache(deps.cacheFile),
        paths: {
            userClaudeDir: userClaudeDir(deps.home),
            userConfigJson: userConfigJson(deps.home)
        }
    };
}

export class ToolboxPanel {
    private static current: ToolboxPanel | undefined;
    private disposables: vscode.Disposable[] = [];

    static show(deps: ToolboxPanelDeps): void {
        if (ToolboxPanel.current) {
            ToolboxPanel.current.panel.reveal();
            ToolboxPanel.current.refresh();
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'agentfarm.toolbox',
            'Agent Farm — Toolbox',
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        ToolboxPanel.current = new ToolboxPanel(panel, deps);
    }

    static refreshIfOpen(): void {
        ToolboxPanel.current?.refresh();
    }

    private constructor(readonly panel: vscode.WebviewPanel, private deps: ToolboxPanelDeps) {
        panel.webview.html = htmlShell(
            panel.webview, deps.extensionUri, 'Toolbox', buildData(deps), 'toolbox.js');
        panel.onDidDispose(() => this.dispose(), null, this.disposables);
        panel.webview.onDidReceiveMessage(msg => void this.onMessage(msg), null, this.disposables);
    }

    refresh(): void {
        void this.panel.webview.postMessage({ type: 'data', data: buildData(this.deps) });
    }

    private agentById(id: string): AgentInfo | undefined {
        return this.deps.getAgents().find(a => a.id === id);
    }

    private changed(): void {
        this.deps.refreshTrees();
        this.refresh();
    }

    private warn(text: string): void {
        void vscode.window.showWarningMessage(`Agent Farm: ${text}`);
    }

    private async onMessage(msg: { type: string; [k: string]: unknown }): Promise<void> {
        switch (msg.type) {
            case 'refresh':
                this.refresh();
                break;
            case 'afnav':
                handleAfNav(msg.to);
                break;
            case 'openGuide':
                void vscode.commands.executeCommand('agentfarm.openGuide', 'toolbox');
                break;
            case 'open':
                if (typeof msg.path === 'string' && msg.path) {
                    void vscode.window.showTextDocument(vscode.Uri.file(msg.path));
                }
                break;
            case 'reveal':
                if (typeof msg.path === 'string' && msg.path) {
                    void revealPath(msg.path);
                }
                break;
            case 'openExternal': {
                const url = String(msg.url ?? '');
                if (/^https?:\/\//.test(url)) { void vscode.env.openExternal(vscode.Uri.parse(url)); }
                break;
            }
            case 'probe':
                await this.probe(String(msg.scope), String(msg.agentId ?? ''), String(msg.server ?? ''));
                break;
            case 'remove':
                await this.remove(msg.item as ToolboxItem | undefined);
                break;
            case 'create':
                await this.create(String(msg.kind), String(msg.scope), String(msg.agentId ?? ''));
                break;
            case 'togglePlugin': {
                const key = String(msg.key ?? '');
                if (!key) { return; }
                if (setPluginEnabled(key, msg.on === true, this.deps.home)) {
                    void vscode.window.showInformationMessage(
                        `Agent Farm: "${key}" ${msg.on ? 'enabled' : 'disabled'} in user settings.json — applies to new claude sessions.`);
                    this.changed();
                } else { this.warn('could not update enabledPlugins in user settings.json.'); }
                break;
            }
            case 'toggleMcp': {
                const agent = this.agentById(String(msg.agentId ?? ''));
                const server = String(msg.server ?? '');
                if (!agent || !server) { return; }
                setServerDisabled(agent, server, msg.disabled === true);
                this.changed();
                break;
            }
            // ---- reachable only from a row's right-click menu ----
            // Each one CALLS the command the sidebar tree calls; the only work
            // here is turning "the row at index N" back into the node those
            // commands take, which the page has no way to build.
            case 'editMcp': {
                const node = this.mcpNode(String(msg.agentId ?? ''), String(msg.server ?? ''));
                if (node) { await vscode.commands.executeCommand('agentfarm.editMcpServer', node); this.changed(); }
                break;
            }
            case 'copyToAgent': {
                const node = msg.kind === 'mcp'
                    ? this.mcpNode(String(msg.agentId ?? ''), String(msg.name ?? ''))
                    : this.skillNode(String(msg.agentId ?? ''), String(msg.name ?? ''));
                if (!node) { this.warn('could not find that entry to copy.'); break; }
                await vscode.commands.executeCommand(
                    msg.kind === 'mcp' ? 'agentfarm.copyMcpServer' : 'agentfarm.duplicateSkill', node);
                this.changed();
                break;
            }
            case 'skillScope': {
                const node = this.skillNode(String(msg.agentId ?? ''), String(msg.name ?? ''));
                if (!node) { this.warn('a user-scope skill is already shared by every agent.'); break; }
                await vscode.commands.executeCommand('agentfarm.shareSkill', node);
                this.changed();
                break;
            }
        }
    }

    /** The tree node `agentfarm.duplicateSkill` / `shareSkill` take. */
    private skillNode(agentId: string, name: string):
        { kind: 'skill'; agent: AgentInfo; skill: ReturnType<typeof readAgentSkills>[number] } | undefined {
        const agent = this.agentById(agentId);
        const skill = agent ? readAgentSkills(agent).find(s => s.name === name) : undefined;
        return agent && skill ? { kind: 'skill', agent, skill } : undefined;
    }

    /** The tree node `agentfarm.editMcpServer` / `copyMcpServer` take. */
    private mcpNode(agentId: string, name: string):
        { kind: 'mcp-server'; agent: AgentInfo; server: ReturnType<typeof readAgentMcpServers>[number] } | undefined {
        const agent = this.agentById(agentId);
        const server = agent ? readAgentMcpServers(agent).find(s => s.name === name) : undefined;
        return agent && server ? { kind: 'mcp-server', agent, server } : undefined;
    }

    private async probe(scope: string, agentId: string, server: string): Promise<void> {
        if (!server) { return; }
        const agent = scope === 'agent' ? this.agentById(agentId) : undefined;
        if (scope === 'agent' && !agent) { return; }
        const cfg = resolveServerConfig(server, agent, this.deps.home);
        if (!cfg) { this.warn(`could not read the definition of "${server}" to connect.`); return; }
        await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: `Toolbox: asking "${server}" for its tool list…` },
            async () => {
                const result = await probeMcpServer(cfg as McpServerConfig);
                const cache = loadProbeCache(this.deps.cacheFile);
                cache[probeCacheKey(agent ? 'agent' : 'user', agent?.id, server)] = result;
                saveProbeCache(this.deps.cacheFile, cache);
                if (!result.ok) { this.warn(`"${server}" probe failed — ${result.error}`); }
            });
        this.refresh();
    }

    private async remove(item: ToolboxItem | undefined): Promise<void> {
        if (!item?.kind || !item.name) { return; }
        const where = item.scope === 'user' ? 'user scope (ALL agents)' : item.agentName ?? 'agent scope';
        const ok = await vscode.window.showWarningMessage(
            `Remove ${item.kind} "${item.name}" from ${where}? A backup copy is kept next to it (.afbak).`,
            { modal: true }, 'Remove');
        if (ok !== 'Remove') { return; }
        let done = false;
        switch (item.kind) {
            case 'skill':
                done = !!item.dir && removeWithBackup(item.dir);
                break;
            case 'subagent':
            case 'command':
            case 'style':
                done = removeWithBackup(item.source);
                break;
            case 'mcp':
                if (item.scope === 'user') {
                    done = removeUserMcpServer(item.name, this.deps.home);
                } else {
                    const agent = this.agentById(item.agentId ?? '');
                    const def = agent ? readAgentMcpServers(agent).find(s => s.name === item.name) : undefined;
                    done = !!def && removeMcpServer(def);
                }
                break;
            case 'hook': {
                const d = item.detail as { event?: string; matcher?: string; command?: string };
                done = !!d.event && !!d.command && removeHookEntry({
                    event: d.event, matcher: d.matcher ?? '', command: d.command, source: item.source
                } as HookEntry);
                break;
            }
            default:
                this.warn(`${item.kind} entries are not removable from here.`);
                return;
        }
        if (done) { this.changed(); }
        else { this.warn(`could not remove "${item.name}" — see its source file.`); }
    }

    private async create(kind: string, scope: string, agentId: string): Promise<void> {
        if (kind !== 'skill' && kind !== 'command' && kind !== 'subagent') { return; }
        const agent = scope === 'agent' ? this.agentById(agentId) : undefined;
        if (scope === 'agent' && !agent) { return; }
        const name = await vscode.window.showInputBox({
            prompt: `New ${kind} name` + (kind === 'command' ? ' (":" nests into folders, e.g. git:cleanup)' : ''),
            ignoreFocusOut: true
        });
        if (!name?.trim()) { return; }
        const description = await vscode.window.showInputBox({
            prompt: `One-line description (${kind === 'skill' ? 'also decides when claude auto-loads it' : 'shown in listings'})`,
            ignoreFocusOut: true
        }) ?? '';
        try {
            const claudeDir = agent ? path.join(agent.dir, '.claude') : userClaudeDir(this.deps.home);
            const file = scaffoldItem(kind, claudeDir, name.trim(), description.trim());
            void vscode.window.showTextDocument(vscode.Uri.file(file));
            this.changed();
        } catch (e) {
            this.warn((e as Error).message ?? String(e));
        }
    }

    private dispose(): void {
        ToolboxPanel.current = undefined;
        for (const d of this.disposables) { d.dispose(); }
    }
}
