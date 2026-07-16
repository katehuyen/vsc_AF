import * as vscode from 'vscode';
import { AgentInfo } from '../core/agents';
import { watchStatus } from '../core/duties';
import { Insight } from '../core/health';
import { SessionIndex, SessionInfo } from '../core/sessions';
import { PricingEngine, totalTokens } from '../core/pricing';
import { SubsystemStatus } from '../core/farmstatus';
import { dayKey } from '../core/util';
import { handleAfNav, htmlShell } from './base';
import { buildData as buildViewerData } from './sessionViewer';

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
    /** Z1: per-subsystem activation rows for the Farm Status card. */
    farmStatus?(): SubsystemStatus[];
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

/** One row per session for the Sessions tables (dashboard + agent detail).
 *  The webview sorts client-side by any criterion and shows the top N — so
 *  instead of shipping every session, the pool is the union of the true top-N
 *  per sortable criterion (recency, cost, tokens, ctx-now, duration, turns):
 *  whatever sort the user picks, its genuine top N is guaranteed to be
 *  present. Exported for tests and reused by the agent detail page. */
export const SESSION_TABLE_N = 12;
export function sessionRowPool(
    sessions: SessionInfo[],
    isActive?: (s: SessionInfo) => boolean,
    n = SESSION_TABLE_N
): unknown[] {
    const rows = sessions.map(s => ({
        file: s.file,
        agent: (s.agentName ?? '?') + (s.machine ? ` ⇄ ${s.machine}` : ''),
        agentName: s.agentName ?? '',
        // ⌨ focus button: sessionId finds the exact terminal, cwd is the
        // fallback when the terminal registry doesn't know the session
        sessionId: s.sessionId,
        cwd: s.cwd ?? '',
        title: s.title,
        ts: s.lastTs || s.mtime || 0,
        durationMin: s.firstTs && s.lastTs ? Math.round((s.lastTs - s.firstTs) / 60000) : 0,
        turns: s.userTurns,
        toolCalls: s.toolCalls,
        errors: s.errors,
        tokens: totalTokens(s.usage),
        // "Ctx now" — approximate context after the session's last reply
        ctx: s.lastCtxTokens ?? 0,
        cost: s.cost,
        sidechain: s.isSidechain,
        active: isActive ? isActive(s) : false
    }));
    type Row = typeof rows[number];
    const keys: ((r: Row) => number)[] = [
        r => r.ts, r => r.cost, r => r.tokens, r => r.ctx, r => r.durationMin, r => r.turns
    ];
    const pool = new Set<Row>();
    for (const key of keys) {
        rows.slice().sort((a, b) => key(b) - key(a)).slice(0, n)
            .forEach(r => pool.add(r));
    }
    // newest first — the webview re-sorts anyway; this is just a stable wire order
    return [...pool].sort((a, b) => b.ts - a.ts);
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

    const sessionRows = sessionRowPool(sessions, s => deps.index.isSessionActive(s, now));

    const win = deps.index.windowUsage(now);

    return {
        generatedAt: now,
        today: dayKey(now),
        agents: agentSummaries,
        modelTotals,
        tokenTypes,
        heat,
        sessionRows,
        sessionTableN: SESSION_TABLE_N,
        window: { ...win, limit: deps.windowTokenLimit() },
        fleetBudget: deps.budgets()['*'] ?? 0,
        mediaCost: deps.mediaCost(),
        insightTotals: {
            error: insights.filter(i => i.severity === 'error').length,
            warning: insights.filter(i => i.severity === 'warning').length,
            info: insights.filter(i => i.severity === 'info').length
        },
        unknownModels: [...deps.getPricing().unknownModels],
        farmStatus: deps.farmStatus?.() ?? [],
        // E3: external-CLI sessions (side list — excluded from every cost/usage
        // figure above; surfaced as an honest one-liner).
        externalSessions: (() => {
            const bySource: Record<string, number> = {};
            for (const s of deps.index.external()) {
                if (s.source) { bySource[s.source] = (bySource[s.source] ?? 0) + 1; }
            }
            return bySource;
        })()
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
                // ts (optional) = the clicked turn's opening prompt — the viewer
                // reveals an already-open panel and scrolls it right there.
                vscode.commands.executeCommand('agentfarm.openSession', msg.file,
                    typeof msg.ts === 'number' && msg.ts > 0 ? msg.ts : undefined);
                break;
            case 'startSession':
                vscode.commands.executeCommand('agentfarm.startSession', { agentId: msg.agentId });
                break;
            case 'openGuide':
                vscode.commands.executeCommand('agentfarm.openGuide', msg.anchor);
                break;
            case 'openTimeline':
                vscode.commands.executeCommand('agentfarm.openTimeline');
                break;
            case 'openSearch':
                vscode.commands.executeCommand('agentfarm.searchTranscripts');
                break;
            case 'openFarmSettings':
                vscode.commands.executeCommand('agentfarm.openFarmSettings');
                break;
            case 'afnav':
                handleAfNav(msg.to);
                break;
            case 'focusTerminal':
                vscode.commands.executeCommand('agentfarm.focusSessionTerminal', {
                    sessionId: typeof msg.sessionId === 'string' && msg.sessionId ? msg.sessionId : undefined,
                    agentName: typeof msg.agentName === 'string' ? msg.agentName : undefined,
                    cwd: typeof msg.cwd === 'string' && msg.cwd ? msg.cwd : undefined
                });
                break;
            case 'refresh':
                this.refresh();
                break;
            case 'sessionTurns': {
                // On-demand per-turn breakdown for an expanded session row.
                // Only files the index actually lists are readable from here —
                // the webview must not be able to point us at arbitrary paths.
                const file = typeof msg.file === 'string' ? msg.file : '';
                if (!file || !this.deps.index.all().some(s => s.file === file)) { break; }
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
            case 'statusAction': {
                // Farm Status card buttons. Commands are whitelisted — the
                // webview must not be able to run arbitrary commands.
                const ALLOWED = new Set(['agentfarm.setupExample', 'agentfarm.installHooks', 'agentfarm.setSecret']);
                if (msg.kind === 'command' && typeof msg.value === 'string' && ALLOWED.has(msg.value)) {
                    void vscode.commands.executeCommand(msg.value);
                } else if (msg.kind === 'guide' && typeof msg.value === 'string') {
                    void vscode.commands.executeCommand('agentfarm.openGuide', msg.value);
                } else if (msg.kind === 'settings' && typeof msg.value === 'string') {
                    void vscode.commands.executeCommand('workbench.action.openSettings', msg.value);
                }
                break;
            }
        }
    }

    private dispose(): void {
        DashboardPanel.current = undefined;
        for (const d of this.disposables) { d.dispose(); }
    }
}
