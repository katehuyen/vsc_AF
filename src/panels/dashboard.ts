import * as vscode from 'vscode';
import { AgentInfo } from '../core/agents';
import { watchStatus } from '../core/duties';
import { Insight } from '../core/health';
import { SessionIndex } from '../core/sessions';
import { PricingEngine, totalTokens } from '../core/pricing';
import { dayKey } from '../core/util';
import { htmlShell } from './base';

export interface DashboardDeps {
    extensionUri: vscode.Uri;
    getAgents(): AgentInfo[];
    index: SessionIndex;
    getInsights(): Insight[];
    getPricing(): PricingEngine;
    windowTokenLimit(): number;
    budgets(): Record<string, number>;
    mediaCost(): { today: number; month: number };
    /** D1: rolling 14-day quality average by agent id. */
    quality?(agentId: string): { avg?: number; count: number };
}

interface AgentSummary {
    id: string;
    name: string;
    active: boolean;
    lastActivity: number;
    contextLoad: number;
    memoryFiles: number;
    sessions: number;
    daily: Record<string, { cost: number; tokens: number; msgs: number }>;
    totalCost: number;
    totalTokens: number;
    errors: number;
    toolCalls: number;
    usage: { input: number; output: number; cacheWrite: number; cacheRead: number };
    insightCounts: { error: number; warning: number; info: number };
    budget?: number;
    duties: number;
    pendingDuties: number;
    quality?: number;
    qualityCount: number;
}

function buildData(deps: DashboardDeps): Record<string, unknown> {
    const now = Date.now();
    const agents = deps.getAgents();
    const sessions = deps.index.all();
    const insights = deps.getInsights();

    const agentSummaries: AgentSummary[] = agents.map(a => {
        const list = deps.index.forAgent(a.id);
        const daily: AgentSummary['daily'] = {};
        const usage = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
        let totalCost = 0, agentTokens = 0, errors = 0, toolCalls = 0, lastActivity = 0;
        for (const s of list) {
            totalCost += s.cost;
            agentTokens += totalTokens(s.usage);
            errors += s.errors;
            toolCalls += s.toolCalls;
            lastActivity = Math.max(lastActivity, s.mtime);
            usage.input += s.usage.input;
            usage.output += s.usage.output;
            usage.cacheWrite += s.usage.cacheWrite;
            usage.cacheRead += s.usage.cacheRead;
            for (const [day, b] of Object.entries(s.daily)) {
                const d = daily[day] ?? (daily[day] = { cost: 0, tokens: 0, msgs: 0 });
                d.cost += b.cost;
                d.tokens += totalTokens(b.usage);
                d.msgs += b.assistantMsgs;
            }
        }
        const counts = { error: 0, warning: 0, info: 0 };
        for (const ins of insights) {
            if (ins.agentId === a.id) { counts[ins.severity]++; }
        }
        return {
            id: a.id,
            name: a.name,
            active: deps.index.isAgentActive(a.id, now),
            lastActivity,
            contextLoad: a.contextLoad.total,
            memoryFiles: a.memoryFiles.length,
            sessions: list.length,
            daily,
            totalCost,
            totalTokens: agentTokens,
            errors,
            toolCalls,
            usage,
            insightCounts: counts,
            budget: deps.budgets()[a.name],
            duties: a.duties.length,
            pendingDuties: a.duties.filter(d => !d.paused && watchStatus(d.watch)?.pending).length,
            quality: deps.quality?.(a.id)?.avg,
            qualityCount: deps.quality?.(a.id)?.count ?? 0
        };
    });

    // Per-model totals + token-type totals + combined heatmap
    const modelTotals: Record<string, { cost: number; tokens: number }> = {};
    const tokenTypes = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
    const heat = new Array(168).fill(0);
    for (const s of sessions) {
        for (const m of s.models) {
            const mt = modelTotals[m] ?? (modelTotals[m] = { cost: 0, tokens: 0 });
            // attribute the whole session to each model it used (rare to mix)
            mt.cost += s.cost / s.models.length;
            mt.tokens += totalTokens(s.usage) / s.models.length;
        }
        tokenTypes.input += s.usage.input;
        tokenTypes.output += s.usage.output;
        tokenTypes.cacheWrite += s.usage.cacheWrite;
        tokenTypes.cacheRead += s.usage.cacheRead;
        for (let i = 0; i < 168; i++) { heat[i] += s.heat[i]; }
    }

    const topSessions = sessions
        .slice()
        .sort((a, b) => b.cost - a.cost)
        .slice(0, 12)
        .map(s => ({
            file: s.file,
            agent: (s.agentName ?? '?') + (s.machine ? ` ⇄ ${s.machine}` : ''),
            title: s.title,
            ts: s.lastTs,
            durationMin: s.firstTs && s.lastTs ? Math.round((s.lastTs - s.firstTs) / 60000) : 0,
            tokens: totalTokens(s.usage),
            cost: s.cost,
            sidechain: s.isSidechain
        }));

    const win = deps.index.windowUsage(now);

    return {
        generatedAt: now,
        today: dayKey(now),
        agents: agentSummaries,
        modelTotals,
        tokenTypes,
        heat,
        topSessions,
        window: { ...win, limit: deps.windowTokenLimit() },
        fleetBudget: deps.budgets()['*'] ?? 0,
        mediaCost: deps.mediaCost(),
        insightTotals: {
            error: insights.filter(i => i.severity === 'error').length,
            warning: insights.filter(i => i.severity === 'warning').length,
            info: insights.filter(i => i.severity === 'info').length
        },
        unknownModels: [...deps.getPricing().unknownModels]
    };
}

export class DashboardPanel {
    private static current: DashboardPanel | undefined;
    private disposables: vscode.Disposable[] = [];

    static show(deps: DashboardDeps): void {
        if (DashboardPanel.current) {
            DashboardPanel.current.panel.reveal();
            DashboardPanel.current.refresh();
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'agentfarm.dashboard',
            'Agent Farm — Dashboard',
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        DashboardPanel.current = new DashboardPanel(panel, deps);
    }

    static refreshIfOpen(): void {
        DashboardPanel.current?.refresh();
    }

    private constructor(readonly panel: vscode.WebviewPanel, private deps: DashboardDeps) {
        this.render();
        panel.onDidDispose(() => this.dispose(), null, this.disposables);
        panel.webview.onDidReceiveMessage(msg => this.onMessage(msg), null, this.disposables);
        this.deps.index.onDidUpdate(() => this.refresh(), null, this.disposables);
    }

    private render(): void {
        this.panel.webview.html = htmlShell(
            this.panel.webview,
            this.deps.extensionUri,
            'Agent Farm Dashboard',
            buildData(this.deps),
            'dashboard.js'
        );
    }

    refresh(): void {
        this.panel.webview.postMessage({ type: 'data', data: buildData(this.deps) });
    }

    private onMessage(msg: { type: string; [k: string]: unknown }): void {
        switch (msg.type) {
            case 'openAgent':
                vscode.commands.executeCommand('agentfarm.openAgentDetail', { agentId: msg.agentId });
                break;
            case 'openSession':
                vscode.commands.executeCommand('agentfarm.openSession', msg.file);
                break;
            case 'startSession':
                vscode.commands.executeCommand('agentfarm.startSession', { agentId: msg.agentId });
                break;
            case 'openGuide':
                vscode.commands.executeCommand('agentfarm.openGuide', msg.anchor);
                break;
            case 'refresh':
                this.refresh();
                break;
        }
    }

    private dispose(): void {
        DashboardPanel.current = undefined;
        for (const d of this.disposables) { d.dispose(); }
    }
}
