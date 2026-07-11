import * as vscode from 'vscode';
import { AgentInfo } from '../core/agents';
import { watchStatus } from '../core/duties';
import { Insight } from '../core/health';
import { mcpUsage, readAgentMcpServers, readDisabledServers } from '../core/mcp';
import { indexedMemoryNames, memoryUsage } from '../core/memusage';
import { readAgentSkills, skillUsage } from '../core/skills';
import { buildAgentTaskStats, TaskRecord } from '../core/taskstats';
import { SessionIndex } from '../core/sessions';
import { totalTokens } from '../core/pricing';
import { safeReadFile } from '../core/util';
import { htmlShell } from './base';

export interface AgentDetailDeps {
    extensionUri: vscode.Uri;
    getAgents(): AgentInfo[];
    index: SessionIndex;
    getInsights(): Insight[];
    contextBudget(): number;
    /** live task list merged with the task-history archive (see taskstats). */
    taskRecords(): TaskRecord[];
}

function buildData(agent: AgentInfo, deps: AgentDetailDeps): Record<string, unknown> {
    const sessions = deps.index.forAgent(agent.id).sort((a, b) => b.mtime - a.mtime);
    const daily: Record<string, { cost: number; tokens: number; msgs: number }> = {};
    const tools: Record<string, number> = {};
    const models: Record<string, { cost: number; tokens: number }> = {};
    let totalCost = 0, totalToolCalls = 0, totalErrors = 0;

    for (const s of sessions) {
        totalCost += s.cost;
        totalToolCalls += s.toolCalls;
        totalErrors += s.errors;
        for (const [day, b] of Object.entries(s.daily)) {
            const d = daily[day] ?? (daily[day] = { cost: 0, tokens: 0, msgs: 0 });
            d.cost += b.cost;
            d.tokens += totalTokens(b.usage);
            d.msgs += b.assistantMsgs;
        }
        for (const [tool, n] of Object.entries(s.tools)) {
            tools[tool] = (tools[tool] ?? 0) + n;
        }
        for (const m of s.models) {
            const mm = models[m] ?? (models[m] = { cost: 0, tokens: 0 });
            mm.cost += s.cost / s.models.length;
            mm.tokens += totalTokens(s.usage) / s.models.length;
        }
    }

    // X2 — context health: is this agent's mind lean and actually used?
    const WINDOW_MS = 30 * 24 * 3600 * 1000;
    const STALE_MS = 45 * 24 * 3600 * 1000;
    const now = Date.now();
    const memUsage = memoryUsage(deps.index, agent.id, WINDOW_MS);
    const indexed = agent.memoryIndexPath
        ? indexedMemoryNames(safeReadFile(agent.memoryIndexPath) ?? '')
        : undefined;
    const memFiles = agent.memoryFiles.filter(f => f.name.toLowerCase() !== 'memory.md');
    const agentSkills = readAgentSkills(agent);
    const sUsage = skillUsage(deps.index, agent.id, WINDOW_MS);
    const servers = readAgentMcpServers(agent);
    const mUsage = mcpUsage(deps.index, agent.id, WINDOW_MS);
    const disabledServers = readDisabledServers(agent);
    const weekAgo = now - 7 * 24 * 3600 * 1000;
    const recentSessions = sessions.filter(s => s.lastTs >= weekAgo && !s.isSidechain);
    const contextHealth = {
        memory: {
            files: memFiles.length,
            tokens: memFiles.reduce((a, f) => a + f.tokens, 0),
            orphans: indexed ? memFiles.filter(f => !indexed.has(f.name.toLowerCase())).length : 0,
            notRecalled: memFiles.filter(f => !(memUsage.get(f.name.toLowerCase()))).length,
            stale: memFiles.filter(f => now - f.mtime > STALE_MS).length
        },
        skills: {
            total: agentSkills.length,
            unused: agentSkills.filter(s => !(sUsage.get(s.name))).length
        },
        mcp: {
            total: servers.length,
            unused: servers.filter(s => !(mUsage.get(s.name))).length,
            disabled: servers.filter(s => disabledServers.has(s.name)).length
        },
        duties: {
            active: agent.duties.filter(d => !d.paused).length,
            paused: agent.duties.filter(d => d.paused).length,
            lastReadTs: Math.max(0, ...sessions.map(s => s.dutiesReadTs ?? 0)),
            sessionsThisWeek: recentSessions.length
        }
    };

    // Task health: how reliably does delegated work come back from this agent?
    const taskHealth = buildAgentTaskStats(
        deps.taskRecords().filter(t => t.agentId === agent.id)
    ).get(agent.id) ?? null;

    return {
        agent: {
            id: agent.id,
            name: agent.name,
            dir: agent.dir,
            active: deps.index.isAgentActive(agent.id),
            contextLoad: agent.contextLoad,
            contextBudget: deps.contextBudget(),
            permissionSummary: agent.permissionSummary ?? 'none',
            claudeMdPath: agent.claudeMdPath,
            memoryIndexPath: agent.memoryIndexPath,
            memoryFiles: agent.memoryFiles.map(f => ({
                path: f.path, name: f.name, size: f.size, mtime: f.mtime, tokens: f.tokens,
                recalls: f.name.toLowerCase() === 'memory.md' ? -1 : (memUsage.get(f.name.toLowerCase()) ?? 0),
                orphan: !!indexed && f.name.toLowerCase() !== 'memory.md' && !indexed.has(f.name.toLowerCase())
            })),
            toolFiles: agent.toolFiles.map(f => ({ path: f.path, name: f.name })),
            dutiesPath: agent.dutiesPath,
            duties: agent.duties.map(d => {
                const ws = watchStatus(d.watch);
                return {
                    title: d.title,
                    cadence: d.cadence,
                    paused: d.paused,
                    watch: d.watch,
                    action: d.action,
                    status: d.paused ? 'paused' : (ws ? ws.summary : '—'),
                    pending: !d.paused && !!ws?.pending,
                    missing: !!ws && !ws.exists
                };
            })
        },
        contextHealth,
        taskHealth,
        totals: {
            cost: totalCost,
            sessions: sessions.length,
            toolCalls: totalToolCalls,
            errors: totalErrors,
            avgCostPerSession: sessions.length ? totalCost / sessions.length : 0
        },
        daily,
        tools,
        models,
        insights: deps.getInsights()
            .filter(i => i.agentId === agent.id)
            .map(i => ({
                severity: i.severity, category: i.category,
                message: i.message, filePath: i.filePath, anchor: i.guideAnchor
            })),
        sessions: sessions.slice(0, 50).map(s => ({
            file: s.file,
            title: s.title,
            ts: s.lastTs,
            durationMin: s.firstTs && s.lastTs ? Math.round((s.lastTs - s.firstTs) / 60000) : 0,
            models: s.models,
            tokens: totalTokens(s.usage),
            cost: s.cost,
            turns: s.userTurns,
            toolCalls: s.toolCalls,
            errors: s.errors,
            sidechain: s.isSidechain,
            active: deps.index.isSessionActive(s)
        }))
    };
}

export class AgentDetailPanel {
    private static open = new Map<string, AgentDetailPanel>();
    private disposables: vscode.Disposable[] = [];

    static show(agentId: string, deps: AgentDetailDeps): void {
        const existing = AgentDetailPanel.open.get(agentId);
        if (existing) {
            existing.panel.reveal();
            existing.refresh();
            return;
        }
        const agent = deps.getAgents().find(a => a.id === agentId);
        if (!agent) {
            vscode.window.showWarningMessage('Agent Farm: agent not found.');
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'agentfarm.agentDetail',
            `Agent: ${agent.name}`,
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        AgentDetailPanel.open.set(agentId, new AgentDetailPanel(panel, agentId, deps));
    }

    private constructor(
        readonly panel: vscode.WebviewPanel,
        private agentId: string,
        private deps: AgentDetailDeps
    ) {
        this.render();
        panel.onDidDispose(() => this.dispose(), null, this.disposables);
        panel.webview.onDidReceiveMessage(msg => this.onMessage(msg), null, this.disposables);
        this.deps.index.onDidUpdate(() => this.refresh(), null, this.disposables);
    }

    private agent(): AgentInfo | undefined {
        return this.deps.getAgents().find(a => a.id === this.agentId);
    }

    private render(): void {
        const agent = this.agent();
        if (!agent) { return; }
        this.panel.webview.html = htmlShell(
            this.panel.webview,
            this.deps.extensionUri,
            `Agent ${agent.name}`,
            buildData(agent, this.deps),
            'agentDetail.js'
        );
    }

    refresh(): void {
        const agent = this.agent();
        if (!agent) { return; }
        this.panel.webview.postMessage({ type: 'data', data: buildData(agent, this.deps) });
    }

    private onMessage(msg: { type: string; [k: string]: unknown }): void {
        switch (msg.type) {
            case 'openFile':
                vscode.commands.executeCommand('vscode.open', vscode.Uri.file(String(msg.path)));
                break;
            case 'openSession':
                vscode.commands.executeCommand('agentfarm.openSession', msg.file);
                break;
            case 'startSession':
                vscode.commands.executeCommand('agentfarm.startSession', { agentId: this.agentId });
                break;
            case 'continueSession':
                vscode.commands.executeCommand('agentfarm.continueSession', { agentId: this.agentId });
                break;
            case 'reveal':
                vscode.commands.executeCommand('agentfarm.revealAgent', { agentId: this.agentId });
                break;
            case 'addDuty':
                vscode.commands.executeCommand('agentfarm.addDuty', { agentId: this.agentId });
                break;
            // Quick cross-navigation between the three main surfaces.
            case 'openDashboard':
                vscode.commands.executeCommand('agentfarm.openDashboard');
                break;
            case 'openTimeline':
                vscode.commands.executeCommand('agentfarm.openTimeline');
                break;
            case 'openGuide':
                vscode.commands.executeCommand('agentfarm.openGuide', msg.anchor);
                break;
        }
    }

    private dispose(): void {
        AgentDetailPanel.open.delete(this.agentId);
        for (const d of this.disposables) { d.dispose(); }
    }
}
