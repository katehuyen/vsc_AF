import * as vscode from 'vscode';
import { AgentInfo } from '../core/agents';
import { watchStatus } from '../core/duties';
import { Insight } from '../core/health';
import { mcpUsage, readAgentMcpServers, readDisabledServers } from '../core/mcp';
import { indexedMemoryNames, memoryUsage } from '../core/memusage';
import { readAgentSkills, skillUsage } from '../core/skills';
import { buildAgentTaskStats, TaskRecord } from '../core/taskstats';
import { SessionIndex } from '../core/sessions';
import { PriceRule, PricingEngine, totalTokens } from '../core/pricing';
import { safeReadFile } from '../core/util';
import { handleAfNav, htmlShell, runSurface } from './base';
import { AGENT_SESSION_TABLE_N, sessionRowPool } from './dashboard';
import { buildData as buildViewerData } from './sessionViewer';

export interface AgentDetailDeps {
    extensionUri: vscode.Uri;
    getAgents(): AgentInfo[];
    index: SessionIndex;
    getInsights(): Insight[];
    getPricing(): PricingEngine;
    contextBudget(): number;
    /** live task list merged with the task-history archive (see taskstats). */
    taskRecords(): TaskRecord[];
    /** Project name per agent name — the Project column's source, resolved
     *  exactly the way the Dashboard and the Sessions page resolve it. */
    agentProjects?(): Record<string, string>;
    /** A project's own colour, icon and description, by name. */
    projectStyle?(name: string): { icon?: string; color?: string; detail?: string } | undefined;
}

function buildData(agent: AgentInfo, deps: AgentDetailDeps, tableN = AGENT_SESSION_TABLE_N): Record<string, unknown> {
    const sessions = deps.index.forAgent(agent.id).sort((a, b) => b.mtime - a.mtime);
    const projectByAgent = deps.agentProjects?.() ?? {};
    const daily: Record<string, { cost: number; tokens: number; wTokens: number; msgs: number }> = {};
    const tools: Record<string, number> = {};
    const models: Record<string, { cost: number; tokens: number; wTokens: number }> = {};
    let totalCost = 0, totalToolCalls = 0, totalErrors = 0;

    for (const s of sessions) {
        totalCost += s.cost;
        totalToolCalls += s.toolCalls;
        totalErrors += s.errors;
        for (const [day, b] of Object.entries(s.daily)) {
            const d = daily[day] ?? (daily[day] = { cost: 0, tokens: 0, wTokens: 0, msgs: 0 });
            d.cost += b.cost;
            d.tokens += totalTokens(b.usage);
            d.wTokens += b.wTokens;
            d.msgs += b.assistantMsgs;
        }
        for (const [tool, n] of Object.entries(s.tools)) {
            tools[tool] = (tools[tool] ?? 0) + n;
        }
        for (const m of s.models) {
            const mm = models[m] ?? (models[m] = { cost: 0, tokens: 0, wTokens: 0 });
            mm.cost += s.cost / s.models.length;
            mm.tokens += totalTokens(s.usage) / s.models.length;
            mm.wTokens += s.wTokens / s.models.length;
        }
    }

    // X2 — context health: is this agent's mind lean and actually used?
    const WINDOW_MS = 30 * 24 * 3600 * 1000;
    const STALE_MS = 45 * 24 * 3600 * 1000;
    const now = Date.now();
    const memUsage = memoryUsage(deps.index, agent.id, WINDOW_MS, agent.dir);
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
        // Global model pricing (USD / 1M tokens) — editable from this page.
        pricing: deps.getPricing().currentRules(),
        insights: deps.getInsights()
            .filter(i => i.agentId === agent.id)
            .map(i => ({
                severity: i.severity, category: i.category,
                message: i.message, filePath: i.filePath, anchor: i.guideAnchor
            })),
        // same advanced table as the dashboard (same row shape / component):
        // union of the true top-N per sortable criterion, sorted client-side;
        // N follows the webview's Show box (0 = all sessions ship)
        sessions: sessionRowPool(sessions,
            s => deps.index.isSessionActive(s), tableN,
            s => (s.agentName ? projectByAgent[s.agentName] : undefined),
            name => deps.projectStyle?.(name)),
        sessionTableN: tableN
    };
}

export class AgentDetailPanel {
    private static open = new Map<string, AgentDetailPanel>();
    private disposables: vscode.Disposable[] = [];
    /** Sessions-table row count chosen in the webview's Show box (0 = all). */
    private tableN = AGENT_SESSION_TABLE_N;

    /** A new session, a new turn: the page follows the index instead of waiting
     *  for Refresh. Called from the debounced broadcast in extension.ts. */
    static refreshIfOpen(): void {
        for (const p of AgentDetailPanel.open.values()) { p.refresh(); }
    }

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
            buildData(agent, this.deps, this.tableN),
            'agentDetail.js'
        );
    }

    refresh(): void {
        const agent = this.agent();
        if (!agent) { return; }
        this.panel.webview.postMessage({ type: 'data', data: buildData(agent, this.deps, this.tableN) });
    }

    private onMessage(msg: { type: string; [k: string]: unknown }): void {
        switch (msg.type) {
            case 'openFile':
                vscode.commands.executeCommand('vscode.open', vscode.Uri.file(String(msg.path)));
                break;
            case 'openSession':
                // ts (optional) = the clicked turn's opening prompt — the viewer
                // reveals an already-open panel and scrolls it right there.
                vscode.commands.executeCommand('agentfarm.openSession', msg.file,
                    typeof msg.ts === 'number' && msg.ts > 0 ? msg.ts : undefined);
                break;
            case 'setTableN': {
                // Sessions-table Show box (0 = all). The pool is rebuilt host-side
                // so the requested top-N is genuine, not a re-slice of the old pool.
                const n = typeof msg.n === 'number' && isFinite(msg.n) ? Math.floor(msg.n) : -1;
                if (n < 0) { break; }
                this.tableN = n;
                this.refresh();
                break;
            }
            case 'sessionTurns': {
                // On-demand per-turn breakdown for an expanded session row.
                // Only this agent's own session files are readable from here —
                // the webview must not be able to point us at arbitrary paths.
                const file = typeof msg.file === 'string' ? msg.file : '';
                if (!file || !this.deps.index.forAgent(this.agentId).some(s => s.file === file)) { break; }
                let turns: unknown = [];
                try {
                    // reuse the session viewer's proven transcript parse; we only
                    // keep the turn table (maxMessages 1 keeps the throwaway
                    // message payload minimal — turns are computed before the cut)
                    turns = buildViewerData(file, {
                        extensionUri: this.deps.extensionUri,
                        getPricing: () => this.deps.getPricing(),
                        maxMessages: () => 1,
                        contextLimitFor: () => 0
                    }).turns;
                } catch { /* fail-soft: an unreadable file shows an empty turn list */ }
                void this.panel.webview.postMessage({ type: 'sessionTurns', file, turns });
                break;
            }
            case 'focusTerminal':
                vscode.commands.executeCommand('agentfarm.focusSessionTerminal', {
                    sessionId: typeof msg.sessionId === 'string' && msg.sessionId ? msg.sessionId : undefined,
                    agentName: typeof msg.agentName === 'string' ? msg.agentName : undefined,
                    cwd: typeof msg.cwd === 'string' && msg.cwd ? msg.cwd : undefined
                });
                break;
            case 'pinSession':
                // the star already flipped in the webview — pass the state it
                // wants, not a toggle, so the two can never disagree
                void vscode.commands.executeCommand('agentfarm.pinSession', {
                    sessionId: typeof msg.sessionId === 'string' ? msg.sessionId : '',
                    wantPinned: msg.pinned === true
                });
                break;
            case 'interruptSession':
                void vscode.commands.executeCommand('agentfarm.interruptSession', {
                    sessionId: typeof msg.sessionId === 'string' && msg.sessionId ? msg.sessionId : undefined,
                    agentName: typeof msg.agentName === 'string' ? msg.agentName : undefined
                });
                break;
            // The three start buttons carry their own answer to "terminal or
            // Console?" (their dropdown asked it), so the command does not ask
            // again. Anything else that reaches these commands still gets the
            // picker — see pickRunSurface.
            case 'startSession':
                vscode.commands.executeCommand('agentfarm.startSession',
                    { agentId: this.agentId, surface: runSurface(msg.surface) });
                break;
            case 'launchSession':
                vscode.commands.executeCommand('agentfarm.launchSession',
                    { agentId: this.agentId, surface: runSurface(msg.surface) });
                break;
            case 'consoleSession':
                vscode.commands.executeCommand('agentfarm.consoleForAgent', { agentId: this.agentId });
                break;
            case 'continueSession':
                vscode.commands.executeCommand('agentfarm.continueSession',
                    { agentId: this.agentId, surface: runSurface(msg.surface) });
                break;
            case 'reveal':
                vscode.commands.executeCommand('agentfarm.revealAgent', { agentId: this.agentId });
                break;
            case 'addDuty':
                vscode.commands.executeCommand('agentfarm.addDuty', { agentId: this.agentId });
                break;
            // From a memory row's right-click menu — the graph, scoped to the
            // agent whose page this is.
            case 'openMemoryGraph':
                vscode.commands.executeCommand('agentfarm.openMemoryGraph', { agentId: this.agentId });
                break;
            // Quick cross-navigation between the three main surfaces.
            case 'openDashboard':
                vscode.commands.executeCommand('agentfarm.openDashboard');
                break;
            case 'openTimeline':
                vscode.commands.executeCommand('agentfarm.openTimeline');
                break;
            case 'afnav':
                if (msg.to === 'search') {
                    // pre-scoped to this agent; ✕ in the panel widens to fleet
                    vscode.commands.executeCommand('agentfarm.searchTranscripts',
                        { agentName: this.agent()?.name });
                } else { handleAfNav(msg.to); }
                break;
            case 'refresh':
                this.refresh();
                break;
            case 'openGuide':
                vscode.commands.executeCommand('agentfarm.openGuide', msg.anchor);
                break;
            case 'savePricing': {
                // Sanitise the rows and write them to the current-rules setting.
                // The config-change listener records a dated history entry, so
                // this only re-prices sessions from now on — past costs stay put.
                const raw = Array.isArray(msg.rules) ? msg.rules as Record<string, unknown>[] : [];
                const rules: PriceRule[] = raw
                    .map(r => ({
                        match: String(r.match ?? '').trim(),
                        input: Number(r.input) || 0,
                        output: Number(r.output) || 0,
                        cacheWrite: Number(r.cacheWrite) || 0,
                        cacheRead: Number(r.cacheRead) || 0
                    }))
                    .filter(r => r.match);
                void vscode.workspace.getConfiguration('agentFarm')
                    .update('pricing', rules, vscode.ConfigurationTarget.Global)
                    .then(() => vscode.window.showInformationMessage(
                        'Agent Farm: model rates saved — new sessions use them; earlier costs stay as recorded.'));
                break;
            }
        }
    }

    private dispose(): void {
        AgentDetailPanel.open.delete(this.agentId);
        for (const d of this.disposables) { d.dispose(); }
    }
}
