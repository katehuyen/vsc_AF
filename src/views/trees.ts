import * as path from 'path';
import * as vscode from 'vscode';
import { AgentInfo, FileMeta } from '../core/agents';
import { Duty, watchStatus } from '../core/duties';
import { indexedMemoryNames, memoryLastUsed, memoryUsage, readMemoryFrontmatter } from '../core/memusage';
import { Insight } from '../core/health';
import { FIX_COMMANDS } from '../core/insightops';
import {
    McpServerDef, mcpLastUsed, mcpToolBreakdown, mcpUsage, readAgentMcpServers, readDisabledServers
} from '../core/mcp';
import { readAgentSkills, SkillDef, skillLastUsed, skillUsage } from '../core/skills';
import { LiveMonitor, LiveStatus } from '../core/live';
import { totalTokens } from '../core/pricing';
import { SessionIndex, SessionInfo } from '../core/sessions';
import { fmtTokens, fmtUSD, relTime, dayKey, safeReadFile } from '../core/util';

/** Findings whose evidence is the agent's own cost view, not a guide section. */
const COST_CATEGORIES = new Set(['cost-anomaly', 'trend', 'budget', 'error-rate']);

export interface FarmState {
    getAgents(): AgentInfo[];
    index: SessionIndex;
    getInsights(): Insight[];
    live?: LiveMonitor;
    /** Dismissed-insight count — the Insights tree shows an honest reminder row. */
    getDismissedInsightCount?(): number;
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
    | { kind: 'section'; agent: AgentInfo; section: 'identity' | 'memory' | 'tools' | 'permissions' | 'sessions' | 'duties' | 'mcp' | 'skills' }
    | { kind: 'duty'; agent: AgentInfo; duty: Duty }
    | { kind: 'mcp-server'; agent: AgentInfo; server: McpServerDef; calls: number; lastTs?: number; disabled?: boolean }
    | { kind: 'skill'; agent: AgentInfo; skill: SkillDef; calls: number; lastTs?: number }
    | { kind: 'memory-file'; agent: AgentInfo; file: FileMeta; calls: number; lastTs?: number; orphan: boolean }
    | { kind: 'file'; path: string; label: string; description?: string }
    | { kind: 'session'; session: SessionInfo };

const MCP_USAGE_WINDOW_MS = 30 * 24 * 3600 * 1000;

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
                    const totalTok = agent.memoryFiles.reduce((a, f) => a + f.tokens, 0);
                    const usage = memoryUsage(this.state.index, agent.id, MCP_USAGE_WINDOW_MS);
                    const recalled = agent.memoryFiles.filter(f =>
                        f.name !== 'MEMORY.md' && (usage.get(f.name.toLowerCase()) ?? 0) > 0).length;
                    item.description = `${agent.memoryFiles.length} files • ~${fmtTokens(totalTok)} tok • ${recalled} recalled (30d)`;
                    item.contextValue = 'memory-section';
                    item.tooltip = 'The agent\'s memory files with real recall stats: "recalled" counts explicit tool reads of the file in the last 30 days (passive index injection is not visible in transcripts). MEMORY.md is the index — it loads every session.';
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
                case 'mcp': {
                    const servers = readAgentMcpServers(agent);
                    const item = new vscode.TreeItem('MCP',
                        servers.length ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
                    item.iconPath = new vscode.ThemeIcon('plug');
                    if (servers.length) {
                        const usage = mcpUsage(this.state.index, agent.id, MCP_USAGE_WINDOW_MS);
                        const used = servers.filter(s => (usage.get(s.name) ?? 0) > 0).length;
                        const disabled = readDisabledServers(agent);
                        const off = servers.filter(s => disabled.has(s.name)).length;
                        item.description = `${servers.length} server(s) • ${used} used (30d)` +
                            (off ? ` • ${off} disabled` : '');
                    } else {
                        item.description = 'none — right-click to add';
                    }
                    item.contextValue = 'mcp-section';
                    item.tooltip = 'MCP servers this agent can use (from .mcp.json / .claude settings) with real 30-day usage.';
                    return item;
                }
                case 'skills': {
                    const skills = readAgentSkills(agent);
                    const item = new vscode.TreeItem('Skills',
                        skills.length ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
                    item.iconPath = new vscode.ThemeIcon('sparkle');
                    if (skills.length) {
                        const usage = skillUsage(this.state.index, agent.id, MCP_USAGE_WINDOW_MS);
                        const used = skills.filter(s => (usage.get(s.name) ?? 0) > 0).length;
                        item.description = `${skills.length} skill(s) • ${used} used (30d)`;
                    } else {
                        item.description = 'none — right-click to add';
                    }
                    item.contextValue = 'skills-section';
                    item.tooltip = 'Agent Skills claude can load for this agent (.claude/skills in the agent folder + ~/.claude/skills shared by all agents) with real 30-day usage.';
                    return item;
                }
                case 'duties': {
                    const duties = agent.duties;
                    const pending = duties.filter(d =>
                        !d.paused && watchStatus(d.watch)?.pending).length;
                    const lastRead = Math.max(0,
                        ...this.state.index.forAgent(agent.id).map(s => s.dutiesReadTs ?? 0));
                    const item = new vscode.TreeItem('Duties',
                        duties.length ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None);
                    item.iconPath = new vscode.ThemeIcon('eye',
                        pending ? new vscode.ThemeColor('editorWarning.foreground') : undefined);
                    const parts: string[] = [];
                    if (duties.length) {
                        parts.push(String(duties.length));
                        if (pending) { parts.push(`${pending} pending`); }
                        parts.push(lastRead ? `read ${relTime(lastRead)}` : 'never read');
                    } else {
                        parts.push('none — right-click to add');
                    }
                    item.description = parts.join(' • ');
                    item.contextValue = 'duties-section';
                    item.tooltip = 'Standing duties: recurring watch-and-act agreements with this agent. Stored in DUTIES.md.' +
                        (duties.length ? `\nAgent last touched DUTIES.md: ${lastRead ? relTime(lastRead) : 'never (in indexed sessions)'}` : '');
                    return item;
                }
            }
        }
        if (node.kind === 'mcp-server') {
            const s = node.server;
            const item = new vscode.TreeItem(s.name, vscode.TreeItemCollapsibleState.None);
            item.iconPath = node.disabled
                ? new vscode.ThemeIcon('circle-slash')
                : new vscode.ThemeIcon('plug',
                    node.calls > 0 ? new vscode.ThemeColor('charts.green') : undefined);
            const parts: string[] = [s.transport];
            if (node.disabled) { parts.push('disabled'); }
            parts.push(node.calls > 0 ? `${node.calls} calls (30d)` : 'unused (30d)');
            if (node.calls > 0 && node.lastTs) { parts.push(`last ${relTime(node.lastTs)}`); }
            item.description = parts.join(' • ');
            const breakdown = node.calls > 0
                ? mcpToolBreakdown(this.state.index, node.agent.id, s.name, MCP_USAGE_WINDOW_MS)
                : [];
            item.tooltip = `${s.name} (${s.transport})${node.disabled ? ' — DISABLED for this agent' : ''}\n` +
                `${s.commandOrUrl}\nDefined in: ${s.source}\nCalls in last 30 days: ${node.calls}` +
                (node.lastTs && node.calls > 0 ? `\nLast used: ${relTime(node.lastTs)}` : '') +
                (breakdown.length
                    ? `\nTop tools (30d): ${breakdown.slice(0, 5).map(b => `${b.tool} ×${b.calls}`).join(', ')}`
                    : '');
            item.contextValue = node.disabled ? 'mcp-server-disabled' : 'mcp-server';
            item.command = openFileCommand(s.source);
            return item;
        }
        if (node.kind === 'skill') {
            const s = node.skill;
            const item = new vscode.TreeItem(s.name, vscode.TreeItemCollapsibleState.None);
            item.iconPath = new vscode.ThemeIcon('sparkle',
                node.calls > 0 ? new vscode.ThemeColor('charts.green') : undefined);
            item.description = `${s.scope} • ${node.calls > 0 ? `${node.calls} calls (30d)` : 'unused (30d)'}` +
                (node.calls > 0 && node.lastTs ? ` • last ${relTime(node.lastTs)}` : '');
            item.tooltip = `${s.name} (${s.scope === 'user' ? 'user scope — shared by all agents' : 'agent scope'})\n` +
                (s.description ? `${s.description}\n` : '') +
                `${s.source}\nInvocations in last 30 days: ${node.calls}` +
                (node.lastTs && node.calls > 0 ? `\nLast used: ${relTime(node.lastTs)}` : '');
            item.contextValue = s.scope === 'user' ? 'skill-user' : 'skill-agent';
            item.command = openFileCommand(s.source);
            return item;
        }
        if (node.kind === 'memory-file') {
            const f = node.file;
            const isIndex = f.name === 'MEMORY.md';
            const item = new vscode.TreeItem(f.name, vscode.TreeItemCollapsibleState.None);
            item.iconPath = isIndex
                ? new vscode.ThemeIcon('book')
                : new vscode.ThemeIcon('file',
                    node.calls > 0 ? new vscode.ThemeColor('charts.green') : undefined);
            const parts = [`~${fmtTokens(f.tokens)} tok`, relTime(f.mtime)];
            if (isIndex) {
                parts.push('index — loads every session');
            } else {
                parts.push(node.calls > 0
                    ? `recalled ×${node.calls} (30d)${node.lastTs ? `, last ${relTime(node.lastTs)}` : ''}`
                    : 'not recalled (30d)');
                if (node.orphan) { parts.push('⚠ orphan'); }
            }
            item.description = parts.join(' • ');
            const meta = readMemoryFrontmatter(f.path);
            item.tooltip = `${f.name}${meta.type ? ` [${meta.type}]` : ''}\n` +
                (meta.description ? `${meta.description}\n` : '') +
                `${f.path}\n~${fmtTokens(f.tokens)} tokens • changed ${relTime(f.mtime)}` +
                (isIndex ? '' :
                    `\nExplicit recalls in last 30 days: ${node.calls}` +
                    (node.orphan ? '\n⚠ Not referenced in MEMORY.md — the agent may never find it.' : ''));
            item.contextValue = isIndex ? 'memory-index' : 'memory-file';
            item.command = openFileCommand(f.path);
            return item;
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
                (d.note ? `Note: ${d.note}\n` : '') +
                (ws?.files?.length
                    ? `Waiting: ${ws.files.join(', ')}${ws.summary.startsWith(`${ws.files.length} `) ? '' : '…'}` +
                      (ws.oldestMtime ? ` (oldest ${relTime(ws.oldestMtime)})` : '')
                    : '');
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
            children.push({ kind: 'section', agent: a, section: 'mcp' });
            children.push({ kind: 'section', agent: a, section: 'skills' });
            children.push({ kind: 'section', agent: a, section: 'permissions' });
            children.push({ kind: 'section', agent: a, section: 'sessions' });
            return children;
        }
        if (node.kind === 'section') {
            if (node.section === 'mcp') {
                const usage = mcpUsage(this.state.index, node.agent.id, MCP_USAGE_WINDOW_MS);
                const lastUsed = mcpLastUsed(this.state.index, node.agent.id);
                const disabled = readDisabledServers(node.agent);
                return readAgentMcpServers(node.agent).map(server => ({
                    kind: 'mcp-server' as const,
                    agent: node.agent,
                    server,
                    calls: usage.get(server.name) ?? 0,
                    lastTs: lastUsed.get(server.name),
                    disabled: disabled.has(server.name)
                }));
            }
            if (node.section === 'skills') {
                const usage = skillUsage(this.state.index, node.agent.id, MCP_USAGE_WINDOW_MS);
                const lastUsed = skillLastUsed(this.state.index, node.agent.id);
                return readAgentSkills(node.agent).map(skill => ({
                    kind: 'skill' as const,
                    agent: node.agent,
                    skill,
                    calls: usage.get(skill.name) ?? 0,
                    lastTs: lastUsed.get(skill.name)
                }));
            }
            if (node.section === 'duties') {
                return node.agent.duties.map(duty => ({
                    kind: 'duty' as const, agent: node.agent, duty
                }));
            }
            if (node.section === 'memory') {
                const usage = memoryUsage(this.state.index, node.agent.id, MCP_USAGE_WINDOW_MS);
                const lastUsed = memoryLastUsed(this.state.index, node.agent.id);
                const indexed = node.agent.memoryIndexPath
                    ? indexedMemoryNames(safeReadFile(node.agent.memoryIndexPath) ?? '')
                    : undefined;
                return node.agent.memoryFiles
                    .slice()
                    .sort((x, y) => (x.name === 'MEMORY.md' ? -1 : y.name === 'MEMORY.md' ? 1 : x.name.localeCompare(y.name)))
                    .map(f => ({
                        kind: 'memory-file' as const,
                        agent: node.agent,
                        file: f,
                        calls: usage.get(f.name.toLowerCase()) ?? 0,
                        lastTs: lastUsed.get(f.name.toLowerCase()),
                        orphan: !!indexed && f.name !== 'MEMORY.md' && !indexed.has(f.name.toLowerCase())
                    }));
            }
            if (node.section === 'tools') {
                return node.agent.toolFiles.map(f => ({
                    kind: 'file' as const, path: f.path, label: f.name
                }));
            }
            if (node.section === 'sessions') {
                // E3: external-CLI sessions interleave by recency, badge'd in the item.
                return [
                    ...this.state.index.forAgent(node.agent.id).filter(s => !s.parentSessionId),
                    ...this.state.index.externalForAgent(node.agent.id)
                ]
                    .sort((a, b) => b.mtime - a.mtime)
                    .slice(0, 15)
                    .map(session => ({ kind: 'session' as const, session }));
            }
        }
        if (node.kind === 'session') {
            // G6: expand a session into its subagent transcripts
            return this.state.index.childrenOf(node.session.sessionId)
                .map(session => ({ kind: 'session' as const, session }));
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
    // E3: external-CLI sessions bypass the claude viewer and the
    // rename/delete/resume menus. With a transcript on disk (E3b codex/gemini)
    // the click opens the raw file; live-event lanes open the Live Timeline.
    if (s.source) {
        const item = new vscode.TreeItem(s.title, vscode.TreeItemCollapsibleState.None);
        item.contextValue = 'session-external';
        item.iconPath = new vscode.ThemeIcon('terminal');
        const parts: string[] = [];
        if (showAgent && s.agentName) { parts.push(s.agentName); }
        parts.push(s.source);
        if (s.cost > 0) { parts.push(fmtUSD(s.cost)); }
        parts.push(relTime(s.mtime));
        item.description = parts.join(' • ');
        item.tooltip = `${s.title}\nexternal CLI session (${s.source})` +
            (s.models.length ? `\n${s.models.join(', ')}` : '') +
            `\n${s.userTurns} prompts • ${s.toolCalls} tool calls` +
            (s.file
                ? `\n${totalTokens(s.usage) ? `~${fmtTokens(totalTokens(s.usage))} tokens • ` : ''}` +
                  `cost ${s.cost > 0 ? fmtUSD(s.cost) : '$0 (add an agentFarm.pricing rule for this model)'}`
                : '\nfrom live events — no transcript, cost not tracked');
        item.command = s.file
            ? { command: 'vscode.open', title: 'Open Raw Transcript', arguments: [vscode.Uri.file(s.file)] }
            : { command: 'agentfarm.openTimeline', title: 'Open Timeline' };
        return item;
    }
    // G6: nested subagent transcripts hang under their parent with a cost rollup.
    const children = index.childrenOf(s.sessionId);
    const item = new vscode.TreeItem(s.title, children.length
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None);
    const active = index.isSessionActive(s);
    // Resume needs a local, top-level transcript with a known working directory.
    item.contextValue = !s.isSidechain && !s.machine && s.cwd ? 'session-resumable' : 'session';
    item.iconPath = new vscode.ThemeIcon(
        active ? 'record' : (s.isSidechain ? 'git-branch' : 'comment-discussion'),
        active ? new vscode.ThemeColor('charts.green') : undefined
    );
    const parts: string[] = [];
    if (showAgent && s.agentName) { parts.push(s.agentName); }
    if (s.machine) { parts.push(`⇄ ${s.machine}`); }
    parts.push(relTime(s.mtime));
    if (s.cost > 0) { parts.push(fmtUSD(s.cost)); }
    if (s.isSidechain) { parts.push('sub'); }
    let rollupLine = '';
    if (children.length) {
        const roll = index.subtreeRollup(s.sessionId);
        parts.push(`⧉ ${roll.count} sub • ${fmtUSD(s.cost + roll.cost)} total`);
        rollupLine = `\nSubagents: ${roll.count} • tree total ${fmtUSD(s.cost + roll.cost)} (self ${fmtUSD(s.cost)})`;
    }
    item.description = parts.join(' • ');
    item.tooltip = `${s.title}\n${s.models.join(', ')}\n${s.userTurns} turns • ${s.toolCalls} tool calls • ${s.errors} errors` +
        (s.lastCtxTokens ? `\nContext now: ~${fmtTokens(s.lastCtxTokens)} tokens` : '') + rollupLine;
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
        if (node) { return this.state.index.childrenOf(node.sessionId); }
        return [...this.state.index.topLevel(), ...this.state.index.external()]
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
        // Honest reminder row: dismissed findings are hidden, not gone.
        if (ins.category === '__dismissed__') {
            const item = new vscode.TreeItem(ins.message, vscode.TreeItemCollapsibleState.None);
            item.iconPath = new vscode.ThemeIcon('eye-closed');
            item.tooltip = 'Dismissed insights stay hidden for their chosen duration. Click to review and restore.';
            item.contextValue = 'insight-dismissed-note';
            item.command = { command: 'agentfarm.restoreInsights', title: 'Restore Dismissed Insights' };
            return item;
        }
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
        item.tooltip = `${ins.message}\n\nActions (hover / right-click): `
            + `${FIX_COMMANDS[ins.category] ? 'Fix · ' : ''}Delegate to Agent · Dismiss`;
        item.contextValue = ins.suggestionId ? 'insight-suggestion'
            : FIX_COMMANDS[ins.category] ? 'insight-fixable' : 'insight';
        if (ins.suggestionId) {
            item.iconPath = new vscode.ThemeIcon('lightbulb', new vscode.ThemeColor('charts.yellow'));
            item.command = {
                command: 'agentfarm.reviewSuggestions',
                title: 'Review Suggestion',
                arguments: [ins.suggestionId]
            };
        } else if (ins.filePath) {
            item.command = openFileCommand(ins.filePath);
        } else if (ins.agentId && COST_CATEGORIES.has(ins.category)) {
            // Cost/trend findings: the evidence lives in the agent's own cost
            // view, not in a guide paragraph — click lands on the numbers.
            item.command = {
                command: 'agentfarm.openAgentDetail',
                title: 'Open Agent Detail',
                arguments: [{ agentId: ins.agentId }]
            };
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
        const list = [...this.state.getInsights()];
        const hidden = this.state.getDismissedInsightCount?.() ?? 0;
        if (hidden > 0) {
            list.push({
                severity: 'info', agentName: '', category: '__dismissed__',
                message: `${hidden} dismissed insight(s) hidden — click to restore`,
                guideAnchor: ''
            } as Insight);
        }
        return list;
    }
}

export interface FeedItem {
    label: string;
    description: string;
    icon: string;
    color?: string;
    sessionFile: string;
    /** Event time — clicking opens the session viewer scrolled to this moment. */
    ts?: number;
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
            arguments: [e.sessionFile, e.ts]
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
                        ts: ev.ts,
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
                    ts: ev.ts,
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
                    ts: ev.ts,
                    tooltip: `${agent} tool error\n${new Date(ev.ts).toLocaleString()}`
                };
            }
            return {
                label: `${agent}: prompt`,
                description: `${ev.detail} • ${relTime(ev.ts)}`,
                icon: 'comment',
                color: 'charts.blue',
                sessionFile: ev.sessionFile,
                ts: ev.ts,
                tooltip: `${agent} received prompt\n${ev.detail}\n${new Date(ev.ts).toLocaleString()}`
            };
        });
    }
}
