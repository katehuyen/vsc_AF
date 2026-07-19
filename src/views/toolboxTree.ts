import * as vscode from 'vscode';
import {
    KIND_LABELS, ToolboxInventory, ToolboxItem, ToolboxKind, TOOLBOX_KINDS
} from '../core/toolbox';

/**
 * Toolbox sidebar section — the at-a-glance twin of the Toolbox page: every
 * kind of Claude extension (skills, subagents, commands, MCP, hooks, plugins,
 * output styles, settings files), grouped kind → scope → item. Clicking an
 * item opens its defining file; management happens on the Toolbox page.
 */

export type ToolboxNode =
    | { kind: 'category'; cat: ToolboxKind }
    | { kind: 'scope'; cat: ToolboxKind; scope: 'user' | 'agent'; agentId?: string; label: string }
    | { kind: 'item'; item: ToolboxItem };

const KIND_ICONS: Record<ToolboxKind, string> = {
    skill: 'sparkle',
    subagent: 'hubot',
    command: 'terminal',
    mcp: 'plug',
    hook: 'zap',
    plugin: 'extensions',
    style: 'paintcan',
    settings: 'gear'
};

export interface ToolboxTreeDeps {
    inventory(): ToolboxInventory;
}

export class ToolboxTreeProvider implements vscode.TreeDataProvider<ToolboxNode> {
    private emitter = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this.emitter.event as vscode.Event<void | ToolboxNode | ToolboxNode[] | null | undefined>;

    constructor(private deps: ToolboxTreeDeps) {}

    refresh(): void { this.emitter.fire(); }

    getTreeItem(node: ToolboxNode): vscode.TreeItem {
        if (node.kind === 'category') {
            const counts = this.deps.inventory().counts[node.cat];
            const total = counts.user + counts.agent;
            const item = new vscode.TreeItem(KIND_LABELS[node.cat],
                total ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
            item.iconPath = new vscode.ThemeIcon(KIND_ICONS[node.cat]);
            item.description = total
                ? `${counts.user} user · ${counts.agent} agent`
                : 'none installed';
            item.contextValue = 'toolboxCategory';
            return item;
        }
        if (node.kind === 'scope') {
            const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Expanded);
            item.iconPath = new vscode.ThemeIcon(node.scope === 'user' ? 'globe' : 'folder');
            return item;
        }
        const it = node.item;
        const treeItem = new vscode.TreeItem(it.name, vscode.TreeItemCollapsibleState.None);
        const facts: string[] = [];
        if (it.kind === 'mcp') {
            facts.push(String(it.detail.transport ?? ''));
            if (it.detail.disabled) { facts.push('DISABLED'); }
        }
        if (it.kind === 'plugin') {
            if (it.detail.isMarketplace) { facts.push(`marketplace · ${it.detail.pluginCount} plugins`); }
            else { facts.push(it.detail.enabled ? 'enabled' : 'not enabled'); }
        }
        if (it.kind === 'subagent' && it.detail.model) { facts.push(String(it.detail.model)); }
        treeItem.description = facts.join(' · ') || (it.description ? it.description.slice(0, 60) : '');
        treeItem.tooltip = new vscode.MarkdownString(
            `**${it.name}** — ${KIND_LABELS[it.kind]} (${it.scope === 'user' ? 'user scope' : it.agentName})\n\n` +
            (it.description ? it.description + '\n\n' : '') +
            `\`${it.source}\``);
        treeItem.iconPath = new vscode.ThemeIcon(KIND_ICONS[it.kind]);
        treeItem.contextValue = 'toolboxItem';
        treeItem.command = {
            command: 'vscode.open', title: 'Open', arguments: [vscode.Uri.file(it.source)]
        };
        return treeItem;
    }

    getChildren(node?: ToolboxNode): ToolboxNode[] {
        if (!node) {
            return TOOLBOX_KINDS.map(cat => ({ kind: 'category', cat }));
        }
        if (node.kind === 'category') {
            const items = this.deps.inventory().items.filter(i => i.kind === node.cat);
            const out: ToolboxNode[] = [];
            if (items.some(i => i.scope === 'user')) {
                out.push({ kind: 'scope', cat: node.cat, scope: 'user', label: 'User (all agents)' });
            }
            const seen = new Set<string>();
            for (const i of items) {
                if (i.scope === 'agent' && i.agentId && !seen.has(i.agentId)) {
                    seen.add(i.agentId);
                    out.push({ kind: 'scope', cat: node.cat, scope: 'agent', agentId: i.agentId, label: i.agentName ?? i.agentId });
                }
            }
            return out;
        }
        if (node.kind === 'scope') {
            return this.deps.inventory().items
                .filter(i => i.kind === node.cat && i.scope === node.scope &&
                    (node.scope === 'user' || i.agentId === node.agentId))
                .map(item => ({ kind: 'item', item }));
        }
        return [];
    }
}
