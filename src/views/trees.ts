import * as path from 'path';
import * as vscode from 'vscode';
import { AgentInfo, FileMeta } from '../core/agents';
import { Duty, watchStatus } from '../core/duties';
import { engineOf, noTranscriptNote } from '../core/consoleEngine';
import { ENGINE_LABELS, engineSpread } from '../core/engines';
import { indexedMemoryNames, memoryLastUsed, memoryUsage, readMemoryFrontmatter } from '../core/memusage';
import { Insight } from '../core/health';
import { FIX_COMMANDS, insightKey } from '../core/insightops';
import { describeRecord, InsightHistoryStore } from '../core/insighthistory';
import {
    McpServerDef, mcpLastUsed, mcpToolBreakdown, mcpUsage, readAgentMcpServers, readDisabledServers
} from '../core/mcp';
import { readAgentSkills, SkillDef, skillLastUsed, skillUsage } from '../core/skills';
import { LiveMonitor, LiveStatus } from '../core/live';
import { emptyUsage, totalTokens } from '../core/pricing';
import { SessionIndex, SessionInfo } from '../core/sessions';
import { fmtTokens, fmtUSD, relTime, dayKey, safeReadFile } from '../core/util';
import { full as afFull } from '../core/aftime';
import { afConfig } from '../core/settingsDoor';

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

/** How many session rows hang under an agent's Sessions header. The header
 *  states the cut, so this number is never silently applied. */
const SESSIONS_CHILD_N = 15;

export class AgentsTreeProvider implements vscode.TreeDataProvider<AgentNode> {
    private emitter = new vscode.EventEmitter<AgentNode[] | undefined>();
    readonly onDidChangeTreeData = this.emitter.event as vscode.Event<void | AgentNode | AgentNode[] | null | undefined>;

    constructor(private state: FarmState) {}

    refresh(): void { this.rowSignature = undefined; this.emitter.fire(undefined); }

    /** the last drawing of each top-level row, keyed by agent id */
    private rowSignature?: Map<string, string>;

    /**
     * ‼️ S-48 (reopened) — THE TOP-LEVEL ROWS ARE THE SAME OBJECTS FROM ONE
     * DRAW TO THE NEXT, because that identity is what lets the view be
     * refreshed one row at a time.
     *
     * `onDidChangeTreeData.fire(rows)` is looked up in the extension host by
     * OBJECT IDENTITY: a node built fresh on every `getChildren` is not found,
     * and the host falls straight back to clearing the whole view — the very
     * thing the per-row refresh exists to avoid. So the node is kept and its
     * `agent` is replaced with the newer scan, which also means every open
     * subtree keeps pointing at live data.
     */
    private agentNodes = new Map<string, { kind: 'agent'; agent: AgentInfo }>();

    private rootNodes(): AgentNode[] {
        const live = new Set<string>();
        const rows = this.state.getAgents().map(agent => {
            live.add(agent.id);
            const kept = this.agentNodes.get(agent.id);
            if (kept) { kept.agent = agent; return kept; }
            const made = { kind: 'agent' as const, agent };
            this.agentNodes.set(agent.id, made);
            return made;
        });
        for (const id of [...this.agentNodes.keys()]) {
            if (!live.has(id)) { this.agentNodes.delete(id); }
        }
        return rows;
    }

    /**
     * ‼️ S-48 (reopened) — A REDRAW THAT CHANGES NOTHING IS THE RACE, AND IT
     * WAS COSTING NOTHING TO ANYBODY.
     *
     * Every rebuild of this view replaces the inline action bar the pointer is
     * resting on, and a ▶ pressed into a bar that is being replaced reaches a
     * command with NO argument. S-48 throttled the rebuilds to one per 250 ms,
     * which narrowed the window and did not close it: `live` fires on every
     * hook event of every session, so on a busy fleet the view was being
     * rebuilt four times a second, for ever, and the great majority of those
     * rebuilds drew exactly the same eight rows.
     *
     * So the gate is what the rows SAY. The signature is not a hand-written
     * list of the fields that matter — that list would drift the first time a
     * row learns to show something new — it is the drawing itself: every
     * top-level row is rendered and its label, description, icon and context
     * value are read back. Identical drawing, no event at all.
     *
     * ‼️ AND THE ROW THAT DID CHANGE IS REFRESHED BY NAME, NOT BY CLEARING
     * THE WHOLE VIEW — which is the half that was still losing the press.
     * Read out of the running extension host: a change event carrying
     * ELEMENTS deletes only those elements’ CHILDREN from the handle map and
     * leaves each row’s own handle standing (`sb(t)`), while an empty one runs
     * `tb()` and clears every handle in the view. A ▶ whose handle is no longer
     * in that map reaches its command with no argument at all. So a live fleet
     * — where a token count on ONE row genuinely ticks every few seconds — was
     * invalidating the handles of EVERY row, several times a minute, for a
     * figure on one of them.
     *
     * The rows are the same objects from draw to draw (`rootNodes`), because
     * the host finds them by object identity and an element it cannot find is
     * refreshed NOWHERE — stale, silently. The view is cleared outright only
     * when the ROWS THEMSELVES changed (an agent added, removed, renamed or
     * reordered), which is the one change no per-row event can express.
     *
     * Returns whether anything was fired, so a caller can measure the saving.
     */
    refreshIfChanged(): boolean {
        let drawn: { node: AgentNode; id: string; sig: string }[];
        try {
            drawn = this.rootNodes().map(node => {
                const item = this.getTreeItem(node);
                const icon = item.iconPath instanceof vscode.ThemeIcon ? item.iconPath.id : '';
                return {
                    node,
                    id: String(item.id ?? item.label ?? ''),
                    sig: [item.label, item.description, icon, item.contextValue].join('\u0001')
                };
            });
        } catch {
            // A signature that cannot be taken is not an excuse to stop
            // redrawing the view: fall back to the unconditional refresh.
            this.rowSignature = undefined;
            this.emitter.fire(undefined);
            return true;
        }
        const was = this.rowSignature;
        this.rowSignature = new Map(drawn.map(d => [d.id, d.sig]));
        // The row LIST itself changed (added · removed · renamed · reordered);
        // no per-row event can say that, so the view is rebuilt.
        const sameList = !!was && was.size === drawn.length
            && [...was.keys()].join('\u0002') === drawn.map(d => d.id).join('\u0002');
        if (!sameList) { this.emitter.fire(undefined); return true; }
        const changed = drawn.filter(d => was!.get(d.id) !== d.sig);
        if (!changed.length) { return false; }
        this.emitter.fire(changed.map(d => d.node));
        return true;
    }

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
            const todayTokens = this.todayTokens(agent.id);
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
                    (liveStatus.tool ? ` (${liveStatus.tool})` : '') +
                    (liveStatus.sessions > 1 ? ` ×${liveStatus.sessions}` : ''));
            } else {
                parts.push(active ? 'ACTIVE' : (latest ? relTime(latest.mtime) : 'no sessions'));
            }
            const costUnit = afConfig().get<string>('agentRowCostUnit', 'tokens');
            if (costUnit === 'cost') {
                if (todayCost > 0) { parts.push(fmtUSD(todayCost) + ' today'); }
            } else if (todayTokens > 0) {
                parts.push(fmtTokens(todayTokens) + ' tok today');
            }
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
                    const usage = memoryUsage(this.state.index, agent.id, MCP_USAGE_WINDOW_MS, agent.dir);
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
                    /**
                     * ‼️ THE HEADER COUNTS WHAT THE LIST SHOWS (X-35).
                     *
                     * It read `forAgent()` — Claude-only, and sidechains
                     * included — while the children below are top-level Claude
                     * PLUS every foreign engine. So the number on the header and
                     * the rows under it were answers to two different questions,
                     * and on an agent that had moved to Codex the header could
                     * read a figure the list plainly contradicted. Both sides
                     * now come from one helper, so they cannot drift again; the
                     * cut is stated rather than hidden, because a bare "42" over
                     * fifteen rows is its own small lie.
                     */
                    const listed = this.sessionsUnder(agent.id);
                    item.description = listed.length > SESSIONS_CHILD_N
                        ? `${SESSIONS_CHILD_N} of ${listed.length}`
                        : String(listed.length);
                    const spread = engineSpread(listed);
                    item.tooltip = `Sessions: ${listed.length}` +
                        (listed.length > SESSIONS_CHILD_N ? ` • listed here: ${SESSIONS_CHILD_N} most recent` : '') +
                        (spread ? `\nEngines: ${spread}` : '') +
                        '\nEvery engine this agent ran on is listed — money and token figures elsewhere are Claude-only.';
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
            return this.rootNodes();
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
                const usage = memoryUsage(this.state.index, node.agent.id, MCP_USAGE_WINDOW_MS, node.agent.dir);
                const lastUsed = memoryLastUsed(this.state.index, node.agent.id, node.agent.dir);
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
                return this.sessionsUnder(node.agent.id)
                    .slice(0, SESSIONS_CHILD_N)
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

    /** The agent's session rows, newest first — the ONE list the header counts
     *  and the children are cut from. Every engine, top-level only. */
    private sessionsUnder(agentId: string): SessionInfo[] {
        return [
            ...this.state.index.forAgent(agentId).filter(s => !s.parentSessionId),
            ...this.state.index.externalForAgent(agentId)
        ].sort((a, b) => b.mtime - a.mtime);
    }

    private todayCost(agentId: string): number {
        const today = dayKey(Date.now());
        return this.state.index.forAgent(agentId)
            .reduce((sum, s) => sum + (s.daily[today]?.cost ?? 0), 0);
    }

    private todayTokens(agentId: string): number {
        const today = dayKey(Date.now());
        return this.state.index.forAgent(agentId)
            .reduce((sum, s) => sum + totalTokens(s.daily[today]?.usage ?? emptyUsage()), 0);
    }
}

function openFileCommand(p: string): vscode.Command {
    return {
        command: 'vscode.open',
        title: 'Open',
        arguments: [vscode.Uri.file(p)]
    };
}

/**
 * ‼️ ONE ROW SHAPE FOR EVERY ENGINE (X-35).
 *
 * A foreign session used to take a separate branch here: a `session-external`
 * context value that no menu matches, a click that dumped raw JSONL into an
 * editor, and the engine printed as its bare id (`codex`). That bypass was
 * written when nothing else worked — and every one of its reasons has since
 * gone. The viewer parses Codex, Gemini and Agent Farm's own Antigravity
 * transcripts (`parseCliViewer`); Resume asks the engine before it opens a
 * terminal and says so when the answer is no; rename, pin and tag reach the
 * side list; and a click with nothing to open explains why in that engine's own
 * terms. Keeping it meant the sidebar was the last surface where a Codex
 * conversation was second class, so it is gone. Every row is built below, and
 * the differences that are REAL fall out of the row's own facts: no cwd → not
 * resumable, no file → the click explains instead of opening.
 */
function sessionTreeItem(s: SessionInfo, index: SessionIndex, showAgent: boolean): vscode.TreeItem {
    // G6: nested subagent transcripts hang under their parent with a cost rollup.
    const children = index.childrenOf(s.sessionId);
    const item = new vscode.TreeItem(s.title, children.length
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None);
    const active = index.isSessionActive(s);
    // Resume needs a local, top-level transcript with a known working directory.
    // The "-pinned" suffix is what the context menu switches Pin/Unpin on, so
    // every `when` clause matching these values is a prefix regex, not an ==.
    item.contextValue = (!s.isSidechain && !s.machine && s.cwd ? 'session-resumable' : 'session')
        + (s.pinned ? '-pinned' : '');
    // A pinned session carries the shelf's own icon: it is on the list because
    // you put it there, and that is worth more than "it is a conversation".
    item.iconPath = new vscode.ThemeIcon(
        active ? 'record' : (s.pinned ? 'pinned' : (s.isSidechain ? 'git-branch' : 'comment-discussion')),
        active ? new vscode.ThemeColor('charts.green')
            : (s.pinned ? new vscode.ThemeColor('charts.yellow') : undefined)
    );
    const parts: string[] = [];
    if (s.tags?.length) { parts.push(s.tags.join(' · ')); }
    if (showAgent && s.agentName) { parts.push(s.agentName); }
    /**
     * ‼️ WHICH ENGINE, IN THE SIDEBAR (X-35).
     *
     * The tree has listed foreign sessions since E3 and never said which engine
     * any of them ran on: a Codex conversation and a Claude one were the same
     * grey line with the same icon. The engine goes in the description only when
     * it is NOT Claude, and that is a deliberate departure from the table rule
     * ("every engine wears a badge, because an absence is unreadable") — a table
     * column is empty or it is not, and the reader has nothing else to go on,
     * whereas here the tooltip below names the engine on EVERY row. So the dense
     * line spends its characters on the exception and the hover answers always.
     */
    const engineLabel = ENGINE_LABELS[s.source ?? ''] ?? s.source;
    if (engineLabel) { parts.push(engineLabel); }
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
    // What this row cost, said in the terms its engine actually reports. An
    // engine on a plan states no price, and "$0.00" on such a row reads as
    // "this was free" rather than "nobody is billing per token here".
    const spec = engineOf(s.source);
    const tok = totalTokens(s.usage);
    const moneyLine = s.cost > 0
        ? `\nCost: ${fmtUSD(s.cost)}${tok ? ` • ~${fmtTokens(tok)} tokens • ⚖ ${fmtTokens(Math.round(s.wTokens))}` : ''}`
        : tok
            ? `\n~${fmtTokens(tok)} tokens • ${spec.reportsCost
                ? 'no cost yet (add an agentFarm.pricing rule for this model)'
                : `${spec.label} reports no price — it is billed by plan`}`
            : '';
    item.tooltip = `${s.title}` +
        // a launch name / rename replaces the derived title in the label —
        // keep what the conversation itself suggests visible here
        (s.autoTitle && s.autoTitle !== s.title ? `\nfrom the conversation: ${s.autoTitle}` : '') +
        // …and the engine on EVERY row, including Claude: this is the surface
        // that answers unconditionally, which is what lets the line above show
        // it only for the exception.
        `\nEngine: ${ENGINE_LABELS[s.source ?? ''] ?? s.source ?? ENGINE_LABELS['']}` +
        (s.models.length ? `\n${s.models.join(', ')}` : '') +
        `\n${s.userTurns} turns • ${s.toolCalls} tool calls • ${s.errors} errors` + moneyLine +
        (s.file ? '' : `\n${noTranscriptNote(s.source)}`) +
        (s.lastCtxTokens ? `\nContext now: ~${fmtTokens(s.lastCtxTokens)} tokens` : '') + rollupLine;
    item.command = {
        command: 'agentfarm.openSession',
        title: 'Open Session',
        // A REF, not a bare path: a row whose engine keeps no readable
        // transcript has no path to hand over, and the command needs the
        // session to name the engine in its refusal.
        arguments: [{
            sessionId: s.sessionId, file: s.file, title: s.title,
            cwd: s.cwd, agentName: s.agentName
        }]
    };
    return item;
}

export class SessionsTreeProvider implements vscode.TreeDataProvider<SessionInfo> {
    private emitter = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this.emitter.event as vscode.Event<void | SessionInfo | SessionInfo[] | null | undefined>;

    constructor(private state: FarmState) {}

    refresh(): void { this.emitter.fire(undefined); }

    getTreeItem(s: SessionInfo): vscode.TreeItem {
        return sessionTreeItem(s, this.state.index, true);
    }

    getChildren(node?: SessionInfo): SessionInfo[] {
        if (node) { return this.state.index.childrenOf(node.sessionId); }
        const all = [...this.state.index.topLevel(), ...this.state.index.external()]
            .sort((a, b) => b.mtime - a.mtime);
        // The shelf sits above the recent list and is exempt from its cut —
        // a session you pinned is never pushed off the bottom by a busy day.
        return [...all.filter(s => s.pinned), ...all.filter(s => !s.pinned).slice(0, 30)];
    }
}

export class InsightsTreeProvider implements vscode.TreeDataProvider<Insight> {
    private emitter = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this.emitter.event as vscode.Event<void | Insight | Insight[] | null | undefined>;
    /** E1: how each finding has behaved over time (insighthistory.ts). */
    private history: InsightHistoryStore = {};

    constructor(private state: FarmState) {}

    setHistory(store: InsightHistoryStore): void { this.history = store; }

    refresh(): void { this.emitter.fire(undefined); }

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
        // E1: a finding's own record — how often it has come back, and whether
        // what you did last time held. A repeat offender says so on its row.
        const rec = this.history[insightKey(ins)];
        const hist = describeRecord(rec, Date.now());
        const repeat = rec && rec.occurrences > 1 ? ` ↻${rec.occurrences}` : '';
        const broke = rec?.regressedAt ? ' ⚠back' : '';
        item.description = `${ins.agentName} • ${ins.category}${repeat}${broke}`;
        item.tooltip = `${ins.message}` + (hist ? `\n\n${hist}` : '')
            // What the finding could not see. It belongs in the hover and not
            // in the label: a row is one line wide, and a sentence this long in
            // front of the finding would push the finding off the end of it.
            + (ins.scope ? `\n\nScope: ${ins.scope}` : '')
            + `\n\nActions (hover / right-click): `
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

    refresh(): void { this.emitter.fire(undefined); }

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
                        tooltip: `${agent} — ${meta.label}${ev.tool ? ` (${ev.tool})` : ''}\n${ev.detail ?? ''}\n${afFull(ev.ts)}`
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
                    tooltip: `${agent} used ${ev.tool}\n${ev.detail}\n${afFull(ev.ts)}`
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
                    tooltip: `${agent} tool error\n${afFull(ev.ts)}`
                };
            }
            return {
                label: `${agent}: prompt`,
                description: `${ev.detail} • ${relTime(ev.ts)}`,
                icon: 'comment',
                color: 'charts.blue',
                sessionFile: ev.sessionFile,
                ts: ev.ts,
                tooltip: `${agent} received prompt\n${ev.detail}\n${afFull(ev.ts)}`
            };
        });
    }
}
