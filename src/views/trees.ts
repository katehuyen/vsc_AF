import * as path from 'path';
import * as vscode from 'vscode';
import { AgentInfo } from '../core/agents';
import { Duty, watchStatus } from '../core/duties';
import { Insight } from '../core/health';
import { LiveMonitor, LiveStatus } from '../core/live';
import { SessionIndex, SessionInfo } from '../core/sessions';
import { fmtTokens, fmtUSD, relTime, dayKey } from '../core/util';

export interface FarmState {
    getAgents(): AgentInfo[];
    index: SessionIndex;
    getInsights(): Insight[];
    live?: LiveMonitor;
}

const LIVE_STATUS_LABEL: Record<LiveStatus, string> = {
    'working': 'WORKING',
    'tool': 'WORKING',
    'waiting-permission': '⚠ PERMISSION',
    'waiting-input': 'YOUR TURN',
    'stalled': '⚠ STALLED',
    'idle': 'idle',
    'ended': 'ended'
};

export type AgentNode =
    | { kind: 'agent'; agent: AgentInfo }
    | { kind: 'section'; agent: AgentInfo; section: 'identity' | 'memory' | 'tools' | 'permissions' | 'sessions' | 'duties' }
    | { kind: 'duty'; agent: AgentInfo; duty: Duty }
    | { kind: 'file'; path: string; label: string; description?: string }
    | { kind: 'session'; session: SessionInfo };

export class AgentsTreeProvider implements vscode.TreeDataProvider<AgentNode> {
    private emitter = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this.emitter.event as vscode.Event<void | AgentNode | AgentNode[] | null | undefined>;

    constructor(private state: FarmState) {}

    refresh(): void { this.emitter.fire(); }

    getTreeItem(node: AgentNode): vscode.TreeItem {
        if (node.kind === 'agent') {
            const agent = node.agent;
            const liveStatus = this.state.live?.agentStatus(agent.id);
            const active = liveStatus
                ? liveStatus.status === 'working' || liveStatus.status === 'tool'
                : this.state.index.isAgentActive(agent.id);
            const urgent = liveStatus &&
                (liveStatus.status === 'waiting-permission' || liveStatus.status === 'stalled');
            const todayCost = this.todayCost(agent.id);
            const item = new vscode.TreeItem(agent.name, vscode.TreeItemCollapsibleState.Collapsed);
            item.contextValue = 'agent';
            item.id = agent.id;
            item.iconPath = new vscode.ThemeIcon(
                urgent ? 'warning' : active ? 'vm-running' : 'hubot',
                new vscode.ThemeColor(
                    urgent ? 'editorWarning.foreground' : active ? 'charts.green' : 'charts.foreground')
            );
            const latest = this.state.index.latestSessionForAgent(agent.id);
            const parts: string[] = [];
            if (liveStatus && liveStatus.status !== 'idle' && liveStatus.status !== 'ended') {
                parts.push(LIVE_STATUS_LABEL[liveStatus.status] +
                    (liveStatus.tool ? ` (${liveStatus.tool})` : ''));
            } else {
                parts.push(active ? 'ACTIVE' : (latest ? relTime(latest.mtime) : 'no sessions'));
            }
            if (todayCost > 0) { parts.push(fmtUSD(todayCost) + ' today'); }
            item.description = parts.join(' • ');
            item.tooltip = new vscode.MarkdownString(
                `**${agent.name}**\n\n` +
                `${agent.dir}\n\n` +
                `Fixed context load: ~${agent.contextLoad.total.toLocaleString()} tokens\n\n` +
                `Memory files: ${agent.memoryFiles.length} • Tools: ${agent.toolFiles.length}\n\n` +
                (agent.permissionSummary ? `Permissions: ${agent.permissionSummary}` : '')
            );
            item.command = {
                command: 'agentfarm.openAgentDetail',
                title: 'Open Agent Detail',
                arguments: [node]
            };
            return item;
        }
        if (node.kind === 'section') {
            const agent = node.agent;
            switch (node.section) {
                case 'identity': {
                    const item = new vscode.TreeItem('Identity', vscode.TreeItemCollapsibleState.None);
                    item.iconPath = new vscode.ThemeIcon('account');
                    item.description = agent.claudeMdPath
                        ? `CLAUDE.md • ~${fmtTokens(agent.contextLoad.claudeMd)} tok`
                        : 'missing';
                    if (agent.claudeMdPath) {
                        item.command = openFileCommand(agent.claudeMdPath);
                    }
                    return item;
                }
                case 'memory': {
                    const item = new vscode.TreeItem('Memory', vscode.TreeItemCollapsibleState.Collapsed);
                    item.iconPath = new vscode.ThemeIcon('database');
                    item.description = `${agent.memoryFiles.length} files`;
                    return item;
                }
                case 'tools': {
                    const item = new vscode.TreeItem('Tools', vscode.TreeItemCollapsibleState.Collapsed);
                    item.iconPath = new vscode.ThemeIcon('tools');
                    item.description = `${agent.toolFiles.length} files`;
                    return item;
                }
                case 'permissions': {
                    const item = new vscode.TreeItem('Permissions', vscode.TreeItemCollapsibleState.None);
                    item.iconPath = new vscode.ThemeIcon('shield');
                    item.description = agent.permissionSummary ?? 'none';
                    if (agent.settingsPath) {
                        item.command = openFileCommand(agent.settingsPath);
                    }
                    return item;
                }
                case 'sessions': {
                    const item = new vscode.TreeItem('Sessions', vscode.TreeItemCollapsibleState.Collapsed);
                    item.iconPath = new vscode.ThemeIcon('history');
                    item.description = String(this.state.index.forAgent(agent.id).length);
                    return item;
                }
                case 'duties': {
                    const duties = agent.duties;
                    const pending = duties.filter(d =>
                        !d.paused && watchStatus(d.watch)?.pending).length;
                    const item = new vscode.TreeItem('Duties',
                        duties.length ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None);
                    item.iconPath = new vscode.ThemeIcon('eye',
                        pending ? new vscode.ThemeColor('editorWarning.foreground') : undefined);
                    item.description = duties.length
                        ? `${duties.length}${pending ? ` • ${pending} pending` : ''}`
                        : 'none — right-click to add';
                    item.contextValue = 'duties-section';
                    item.tooltip = 'Standing duties (nöbet görevleri): recurring watch-and-act agreements with this agent. Stored in DUTIES.md.';
                    return item;
                }
            }
        }
        if (node.kind === 'duty') {
            const d = node.duty;
            const ws = watchStatus(d.watch);
            const item = new vscode.TreeItem(d.title, vscode.TreeItemCollapsibleState.None);
            if (d.paused) {
                item.iconPath = new vscode.ThemeIcon('circle-slash');
            } else if (ws?.pending) {
                item.iconPath = new vscode.ThemeIcon('eye', new vscode.ThemeColor('editorWarning.foreground'));
            } else if (ws && !ws.exists) {
                item.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('errorForeground'));
            } else {
                item.iconPath = new vscode.ThemeIcon('eye');
            }
            const parts = [d.cadence];
            if (d.paused) { parts.push('paused'); }
            else if (ws) { parts.push(ws.summary); }
            item.description = parts.join(' • ');
            item.tooltip = `${d.title} [${d.cadence}${d.paused ? ', paused' : ''}]\n` +
                (d.watch ? `Watch: ${d.watch}\n` : '') +
                (d.action ? `Do: ${d.action}\n` : '') +
                (d.note ? `Note: ${d.note}` : '');
            item.contextValue = d.paused ? 'duty-paused' : 'duty-active';
            if (node.agent.dutiesPath) {
                item.command = openFileCommand(node.agent.dutiesPath);
            }
            return item;
        }
        if (node.kind === 'file') {
            const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
            item.iconPath = new vscode.ThemeIcon('file');
            item.description = node.description;
            item.command = openFileCommand(node.path);
            return item;
        }
        // session
        return sessionTreeItem(node.session, this.state.index, false);
    }

    getChildren(node?: AgentNode): AgentNode[] {
        if (!node) {
            return this.state.getAgents().map(agent => ({ kind: 'agent', agent }));
        }
        if (node.kind === 'agent') {
            const a = node.agent;
            const children: AgentNode[] = [{ kind: 'section', agent: a, section: 'identity' }];
            children.push({ kind: 'section', agent: a, section: 'duties' });
            if (a.memoryFiles.length) { children.push({ kind: 'section', agent: a, section: 'memory' }); }
            if (a.toolFiles.length) { children.push({ kind: 'section', agent: a, section: 'tools' }); }
            children.push({ kind: 'section', agent: a, section: 'permissions' });
            children.push({ kind: 'section', agent: a, section: 'sessions' });
            return children;
        }
        if (node.kind === 'section') {
            if (node.section === 'duties') {
                return node.agent.duties.map(duty => ({
                    kind: 'duty' as const, agent: node.agent, duty
                }));
            }
            if (node.section === 'memory') {
                return node.agent.memoryFiles
                    .slice()
                    .sort((x, y) => (x.name === 'MEMORY.md' ? -1 : y.name === 'MEMORY.md' ? 1 : x.name.localeCompare(y.name)))
                    .map(f => ({
                        kind: 'file' as const,
                        path: f.path,
                        label: f.name,
                        description: `~${fmtTokens(f.tokens)} tok • ${relTime(f.mtime)}`
                    }));
            }
            if (node.section === 'tools') {
                return node.agent.toolFiles.map(f => ({
                    kind: 'file' as const, path: f.path, label: f.name
                }));
            }
            if (node.section === 'sessions') {
                return this.state.index.forAgent(node.agent.id)
                    .sort((a, b) => b.mtime - a.mtime)
                    .slice(0, 15)
                    .map(session => ({ kind: 'session' as const, session }));
            }
        }
        return [];
    }

    private todayCost(agentId: string): number {
        const today = dayKey(Date.now());
        return this.state.index.forAgent(agentId)
            .reduce((sum, s) => sum + (s.daily[today]?.cost ?? 0), 0);
    }
}

function openFileCommand(p: string): vscode.Command {
    return {
        command: 'vscode.open',
        title: 'Open',
        arguments: [vscode.Uri.file(p)]
    };
}

function sessionTreeItem(s: SessionInfo, index: SessionIndex, showAgent: boolean): vscode.TreeItem {
    const item = new vscode.TreeItem(s.title, vscode.TreeItemCollapsibleState.None);
    const active = index.isSessionActive(s);
    item.iconPath = new vscode.ThemeIcon(
        active ? 'record' : (s.isSidechain ? 'git-branch' : 'comment-discussion'),
        active ? new vscode.ThemeColor('charts.green') : undefined
    );
    const parts: string[] = [];
    if (showAgent && s.agentName) { parts.push(s.agentName); }
    parts.push(relTime(s.mtime));
    if (s.cost > 0) { parts.push(fmtUSD(s.cost)); }
    if (s.isSidechain) { parts.push('sub'); }
    item.description = parts.join(' • ');
    item.tooltip = `${s.title}\n${s.models.join(', ')}\n${s.userTurns} turns • ${s.toolCalls} tool calls • ${s.errors} errors`;
    item.command = {
        command: 'agentfarm.openSession',
        title: 'Open Session',
        arguments: [s.file]
    };
    return item;
}

export class SessionsTreeProvider implements vscode.TreeDataProvider<SessionInfo> {
    private emitter = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this.emitter.event as vscode.Event<void | SessionInfo | SessionInfo[] | null | undefined>;

    constructor(private state: FarmState) {}

    refresh(): void { this.emitter.fire(); }

    getTreeItem(s: SessionInfo): vscode.TreeItem {
        return sessionTreeItem(s, this.state.index, true);
    }

    getChildren(node?: SessionInfo): SessionInfo[] {
        if (node) { return []; }
        return this.state.index.all()
            .sort((a, b) => b.mtime - a.mtime)
            .slice(0, 30);
    }
}

export class InsightsTreeProvider implements vscode.TreeDataProvider<Insight> {
    private emitter = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this.emitter.event as vscode.Event<void | Insight | Insight[] | null | undefined>;

    constructor(private state: FarmState) {}

    refresh(): void { this.emitter.fire(); }

    getTreeItem(ins: Insight): vscode.TreeItem {
        const item = new vscode.TreeItem(ins.message, vscode.TreeItemCollapsibleState.None);
        const iconByseverity = { error: 'error', warning: 'warning', info: 'info' } as const;
        const colorBySeverity = {
            error: 'errorForeground',
            warning: 'editorWarning.foreground',
            info: 'editorInfo.foreground'
        } as const;
        item.iconPath = new vscode.ThemeIcon(
            iconByseverity[ins.severity],
            new vscode.ThemeColor(colorBySeverity[ins.severity])
        );
        item.description = `${ins.agentName} • ${ins.category}`;
        item.tooltip = ins.message;
        if (ins.filePath) {
            item.command = openFileCommand(ins.filePath);
        } else {
            item.command = {
                command: 'agentfarm.openGuide',
                title: 'Open Guide',
                arguments: [ins.guideAnchor]
            };
        }
        return item;
    }

    getChildren(node?: Insight): Insight[] {
        if (node) { return []; }
        return this.state.getInsights();
    }
}

export interface FeedItem {
    label: string;
    description: string;
    icon: string;
    color?: string;
    sessionFile: string;
    tooltip: string;
}

export class FeedTreeProvider implements vscode.TreeDataProvider<FeedItem> {
    private emitter = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this.emitter.event as vscode.Event<void | FeedItem | FeedItem[] | null | undefined>;

    constructor(private state: FarmState) {}

    refresh(): void { this.emitter.fire(); }

    getTreeItem(e: FeedItem): vscode.TreeItem {
        const item = new vscode.TreeItem(e.label, vscode.TreeItemCollapsibleState.None);
        item.iconPath = new vscode.ThemeIcon(e.icon, e.color ? new vscode.ThemeColor(e.color) : undefined);
        item.description = e.description;
        item.tooltip = e.tooltip;
        item.command = {
            command: 'agentfarm.openSession',
            title: 'Open Session',
            arguments: [e.sessionFile]
        };
        return item;
    }

    getChildren(node?: FeedItem): FeedItem[] {
        if (node) { return []; }
        // Prefer real-time hook events when the live monitor is receiving them.
        if (this.state.live?.hasRecentEvents()) {
            const kindMeta: Record<string, { icon: string; color?: string; label: string }> = {
                prompt: { icon: 'comment', color: 'charts.blue', label: 'prompt' },
                toolStart: { icon: 'tools', label: 'tool' },
                toolEnd: { icon: 'check', color: 'charts.green', label: 'done' },
                permission: { icon: 'shield', color: 'editorWarning.foreground', label: 'PERMISSION WAIT' },
                notify: { icon: 'bell', color: 'charts.yellow', label: 'notify' },
                stop: { icon: 'debug-stop', label: 'turn end' },
                subagent: { icon: 'git-branch', color: 'charts.orange', label: 'subagent done' },
                compact: { icon: 'fold', color: 'charts.purple', label: 'compaction' },
                start: { icon: 'play', color: 'charts.green', label: 'session start' },
                end: { icon: 'circle-slash', label: 'session end' }
            };
            return this.state.live.events(4 * 3600 * 1000)
                .slice(-60)
                .reverse()
                .map(ev => {
                    const meta = kindMeta[ev.kind] ?? kindMeta.notify;
                    const agent = ev.agentName ?? ev.sessionId.slice(0, 8);
                    return {
                        label: `${agent}: ${ev.tool ?? meta.label}`,
                        description: `${ev.detail ?? ''}${ev.detail ? ' • ' : ''}${relTime(ev.ts)}`,
                        icon: meta.icon,
                        color: meta.color,
                        sessionFile: ev.transcriptPath ?? '',
                        tooltip: `${agent} — ${meta.label}${ev.tool ? ` (${ev.tool})` : ''}\n${ev.detail ?? ''}\n${new Date(ev.ts).toLocaleString()}`
                    };
                });
        }
        return this.state.index.feed(60).map(ev => {
            const agent = ev.agentName ?? '?';
            if (ev.kind === 'tool') {
                return {
                    label: `${agent}: ${ev.tool}`,
                    description: `${ev.detail} • ${relTime(ev.ts)}`,
                    icon: 'tools',
                    sessionFile: ev.sessionFile,
                    tooltip: `${agent} used ${ev.tool}\n${ev.detail}\n${new Date(ev.ts).toLocaleString()}`
                };
            }
            if (ev.kind === 'error') {
                return {
                    label: `${agent}: tool error`,
                    description: relTime(ev.ts),
                    icon: 'error',
                    color: 'errorForeground',
                    sessionFile: ev.sessionFile,
                    tooltip: `${agent} tool error\n${new Date(ev.ts).toLocaleString()}`
                };
            }
            return {
                label: `${agent}: prompt`,
                description: `${ev.detail} • ${relTime(ev.ts)}`,
                icon: 'comment',
                color: 'charts.blue',
                sessionFile: ev.sessionFile,
                tooltip: `${agent} received prompt\n${ev.detail}\n${new Date(ev.ts).toLocaleString()}`
            };
        });
    }
}
