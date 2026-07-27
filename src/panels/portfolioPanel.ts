import * as vscode from 'vscode';
import { AgentInfo } from '../core/agents';
import { watchStatus } from '../core/duties';
import { Insight } from '../core/health';
import { LiveMonitor, LiveStatus } from '../core/live';
import { totalTokens } from '../core/pricing';
import { ProjectDef, projectOfAgent, UNASSIGNED } from '../core/projects';
import { SessionIndex } from '../core/sessions';
import { dayKey } from '../core/util';
import { handleAfNav, htmlShell } from './base';

/**
 * B2 — the fleet on one screen.
 *
 * The agent detail page answers everything about ONE agent; the dashboard is
 * cost-shaped; Living is health-shaped. Nowhere could you put twelve agents
 * side by side and ask the portfolio questions: who is working, who has been
 * dead for three weeks, who costs what, whose duties are stuck, and — since
 * projects exist — who is on which job.
 *
 * One row per agent, grouped by project, sortable on any column. Everything
 * here is already computed elsewhere; this page is the join.
 */

export interface PortfolioDeps {
    extensionUri: vscode.Uri;
    getAgents(): AgentInfo[];
    index: SessionIndex;
    getInsights(): Insight[];
    live?: LiveMonitor;
    projects(): ProjectDef[];
    budgets(): Record<string, number>;
}

const DORMANT_DAYS = 14;

export interface PortfolioRow {
    id: string;
    name: string;
    dir: string;
    project: string;
    status: LiveStatus | 'idle';
    /** true while a session of this agent is actually working right now */
    active: boolean;
    lastActivity: number;
    /** days since the last session — the "is this one dead?" column */
    quietDays: number;
    dormant: boolean;
    sessions7: number;
    sessions30: number;
    cost7: number;
    cost30: number;
    costToday: number;
    tokens30: number;
    budget: number;
    duties: number;
    dutiesWaiting: number;
    dutiesPaused: number;
    errors: number;
    warnings: number;
    memoryFiles: number;
    contextLoad: number;
    filesEdited30: number;
}

export function buildPortfolioRows(deps: PortfolioDeps, now = Date.now()): PortfolioRow[] {
    const projects = deps.projects();
    const insights = deps.getInsights();
    const budgets = deps.budgets();
    const today = dayKey(now);
    const D = 24 * 3600 * 1000;
    return deps.getAgents().map(a => {
        const sessions = deps.index.forAgent(a.id);
        let lastActivity = 0, sessions7 = 0, sessions30 = 0, cost7 = 0, cost30 = 0, tokens30 = 0, costToday = 0;
        const files = new Set<string>();
        for (const s of sessions) {
            const ts = s.lastTs || s.mtime || 0;
            lastActivity = Math.max(lastActivity, ts);
            const age = now - ts;
            if (age <= 30 * D) {
                sessions30++;
                cost30 += s.cost;
                tokens30 += totalTokens(s.usage);
                for (const f of Object.keys(s.filesEdited ?? {})) { files.add(f); }
                if (age <= 7 * D) { sessions7++; cost7 += s.cost; }
            }
            costToday += s.daily[today]?.cost ?? 0;
        }
        const live = deps.live?.agentStatus(a.id);
        const mine = insights.filter(i => i.agentId === a.id);
        // A duty's watch says whether work is actually sitting there right now.
        const watches = a.duties.map(d => watchStatus(d.watch));
        return {
            id: a.id,
            name: a.name,
            dir: a.dir,
            project: projectOfAgent({ id: a.id, name: a.name, dir: a.dir }, projects) ?? UNASSIGNED,
            status: live?.status ?? 'idle',
            active: live ? (live.status === 'working' || live.status === 'tool')
                : deps.index.isAgentActive(a.id, now),
            lastActivity,
            quietDays: lastActivity ? Math.floor((now - lastActivity) / D) : -1,
            dormant: !lastActivity || now - lastActivity > DORMANT_DAYS * D,
            sessions7, sessions30,
            cost7: Math.round(cost7 * 10000) / 10000,
            cost30: Math.round(cost30 * 10000) / 10000,
            costToday: Math.round(costToday * 10000) / 10000,
            tokens30,
            budget: budgets[a.name] ?? 0,
            duties: a.duties.length,
            dutiesWaiting: watches.filter(w => w?.pending).length,
            dutiesPaused: a.duties.filter(d => d.paused).length,
            errors: mine.filter(i => i.severity === 'error').length,
            warnings: mine.filter(i => i.severity === 'warning').length,
            memoryFiles: a.memoryFiles.length,
            contextLoad: a.contextLoad.total,
            filesEdited30: files.size
        };
    });
}

export class PortfolioPanel {
    private static current?: PortfolioPanel;
    private disposables: vscode.Disposable[] = [];

    static show(deps: PortfolioDeps): void {
        if (PortfolioPanel.current) {
            PortfolioPanel.current.panel.reveal();
            PortfolioPanel.current.refresh();
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'agentfarm.portfolio', 'Agent Portfolio', vscode.ViewColumn.Active,
            { enableScripts: true, retainContextWhenHidden: true });
        PortfolioPanel.current = new PortfolioPanel(panel, deps);
    }

    private constructor(private panel: vscode.WebviewPanel, private deps: PortfolioDeps) {
        panel.webview.html = htmlShell(panel.webview, deps.extensionUri,
            'Agent Portfolio', this.data(), 'portfolio.js');
        panel.webview.onDidReceiveMessage(m => this.onMessage(m), null, this.disposables);
        panel.onDidDispose(() => this.dispose(), null, this.disposables);
        this.disposables.push(deps.index.onDidUpdate(() => this.refresh()));
    }

    private data(): Record<string, unknown> {
        return {
            generatedAt: Date.now(),
            rows: buildPortfolioRows(this.deps),
            projects: this.deps.projects().map(p => p.name),
            dormantDays: DORMANT_DAYS
        };
    }

    refresh(): void {
        void this.panel.webview.postMessage({ type: 'data', data: this.data() });
    }

    private onMessage(msg: { type: string; [k: string]: unknown }): void {
        const agentId = typeof msg.agentId === 'string' ? msg.agentId : undefined;
        switch (msg.type) {
            case 'refresh': this.refresh(); break;
            case 'openAgent':
                void vscode.commands.executeCommand('agentfarm.openAgentDetail', { agentId });
                break;
            case 'startSession':
                void vscode.commands.executeCommand('agentfarm.launchSession', { agentId });
                break;
            case 'assignProject':
                void vscode.commands.executeCommand('agentfarm.assignProject', { agentId });
                break;
            case 'manageProjects':
                void vscode.commands.executeCommand('agentfarm.manageProjects');
                break;
            case 'reveal':
                void vscode.commands.executeCommand('agentfarm.revealAgent', { agentId });
                break;
            case 'openGuide':
                void vscode.commands.executeCommand('agentfarm.openGuide', msg.anchor);
                break;
            case 'afnav': handleAfNav(msg.to); break;
        }
    }

    private dispose(): void {
        PortfolioPanel.current = undefined;
        this.disposables.forEach(d => d.dispose());
        this.panel.dispose();
    }
}
