import * as vscode from 'vscode';
import { AgentInfo } from '../core/agents';
import { watchStatus } from '../core/duties';
import { Insight } from '../core/health';
import { LiveMonitor, LiveStatus } from '../core/live';
import { totalTokens } from '../core/pricing';
import { agentProject, Project, UNASSIGNED } from '../core/projects';
import { SessionIndex } from '../core/sessions';
import { dayKey } from '../core/util';
import { handleAfNav, htmlShell } from './base';
import { desktopHost, type PanelHost } from './panelHost';

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
    projects(): Project[];
    budgets(): Record<string, number>;
    /**
     * ‼️ AN AGENT IS THE OBJECT AT THE CENTRE OF THIS EXTENSION, AND THE ONLY
     * WAY TO MAKE ONE WAS A DIALOG CHAIN (U-14, surface 8). The page that lists
     * every agent could not create one; `newAgent` asked which root folder,
     * then a name, and could say nothing about the two things that decide what
     * the agent IS from its first session — its default model, and the one line
     * of CLAUDE.md that says what it is for.
     */
    agentRoots?(): string[];
    defaultModel?(): string;
    /** Model aliases as the launcher offers them, so "which model" reads the
     *  same here as it does when a session is started. */
    models?(): { id: string; label: string }[];
    createAgent?(spec: {
        root: string; name: string; model: string; mission: string;
    }): { error?: string; dir?: string };
    /** Import a pack that has already been read off disk. The OS file picker
     *  and the reading happen in the command; what is left is where it lands
     *  and what it is called, which is a form. */
    importPack?(spec: { root: string; name: string; packFile: string }): { error?: string };
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
    /** the same 30 days measured against the plan limit — see QUOTA_WEIGHTS */
    wTokens30: number;
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
        /**
         * ‼️ "WHEN DID THIS AGENT LAST WORK" IS NOT A CLAUDE QUESTION (X-35).
         *
         * This page exists to answer who is working and who has gone quiet, and
         * it read the claude-only list — so an agent whose whole recent week ran
         * on Codex was reported as **dormant**, with a last-activity date from
         * before the user switched engines. That is the single most misleading
         * thing a portfolio row can say.
         *
         * The split is the same one the rest of the extension makes, and it is
         * drawn deliberately per FIGURE rather than per row:
         *   · WHEN and HOW MANY are log facts → every engine (`allSessions`).
         *   · COST and TOKENS are measured off Claude's transcript format and
         *     would read zero on a foreign one → `measured` only.
         * Mixing the second into a fleet average is how cost-per-session halves
         * overnight for no reason.
         */
        const allSessions = deps.index.forAgentWithExternal(a.id);
        const measured = deps.index.forAgent(a.id);
        let lastActivity = 0, sessions7 = 0, sessions30 = 0, cost7 = 0, cost30 = 0, tokens30 = 0, wTokens30 = 0, costToday = 0;
        const files = new Set<string>();
        for (const s of allSessions) {
            const ts = s.lastTs || s.mtime || 0;
            lastActivity = Math.max(lastActivity, ts);
            const age = now - ts;
            if (age <= 30 * D) {
                sessions30++;
                if (age <= 7 * D) { sessions7++; }
            }
        }
        for (const s of measured) {
            const ts = s.lastTs || s.mtime || 0;
            const age = now - ts;
            if (age <= 30 * D) {
                cost30 += s.cost;
                tokens30 += totalTokens(s.usage);
                wTokens30 += s.wTokens;
                for (const f of Object.keys(s.filesEdited ?? {})) { files.add(f); }
                if (age <= 7 * D) { cost7 += s.cost; }
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
            // The SAME resolution the cost table uses — this page sits next to
            // figures grouped the same way, and two answers to "whose job is
            // this agent on" would leave a reader no way to tell which is lying.
            project: agentProject({ id: a.id, name: a.name, dir: a.dir }, projects)?.name ?? UNASSIGNED,
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
            wTokens30: Math.round(wTokens30),
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

    /** Follows the index — see AgentDetailPanel.refreshIfOpen. */
    static refreshIfOpen(): void {
        PortfolioPanel.current?.refresh();
        for (const p of PortfolioPanel.phones) { p.refresh(); }
    }

    static show(deps: PortfolioDeps): void {
        if (PortfolioPanel.current) {
            PortfolioPanel.current.host.reveal();
            PortfolioPanel.current.refresh();
            return;
        }
        PortfolioPanel.current = new PortfolioPanel(
            desktopHost({ viewType: 'agentfarm.portfolio', title: 'Agent Portfolio', column: vscode.ViewColumn.Active }), deps);
    }

    /** X-456 — the views phones have open: one instance each, never the desktop's one tab. */
    private static phones = new Set<PortfolioPanel>();

    /** X-456 — the Agents page on a phone's view. */
    static openOn(host: PanelHost, deps: PortfolioDeps): void {
        PortfolioPanel.phones.add(new PortfolioPanel(host, deps));
    }

    /** The ONE door to a new agent — `agentfarm.newAgent` opens this, and
     *  `importAgentPack` opens it with the pack it just read. */
    static compose(deps: PortfolioDeps, seed?: Record<string, unknown>): void {
        PortfolioPanel.show(deps);
        void PortfolioPanel.current?.host.webview.postMessage({ type: 'agent-compose', seed: seed ?? {} });
    }

    private constructor(private host: PanelHost, private deps: PortfolioDeps) {
        host.webview.html = htmlShell(host.webview, deps.extensionUri,
            'Agent Portfolio', this.data(), 'portfolio.js');
        host.webview.onDidReceiveMessage(m => this.onMessage(m), null, this.disposables);
        host.onDidDispose(() => this.dispose(), null, this.disposables);
        this.disposables.push(deps.index.onDidUpdate(() => this.refresh()));
    }

    private data(): Record<string, unknown> {
        return {
            generatedAt: Date.now(),
            rows: buildPortfolioRows(this.deps),
            projects: this.deps.projects().map(p => p.name),
            dormantDays: DORMANT_DAYS,
            // What the "new agent" card needs to exist (U-14, surface 8).
            roots: this.deps.agentRoots?.() ?? [],
            models: this.deps.models?.() ?? [],
            defaultModel: this.deps.defaultModel?.() ?? '',
            canCreate: !!this.deps.createAgent
        };
    }

    refresh(): void {
        void this.host.webview.postMessage({ type: 'data', data: this.data() });
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
                void vscode.commands.executeCommand('agentfarm.openProjects');
                break;
            case 'reveal':
                void vscode.commands.executeCommand('agentfarm.revealAgent', { agentId });
                break;
            case 'openGuide':
                void vscode.commands.executeCommand('agentfarm.openGuide', msg.anchor);
                break;
            case 'afnav': handleAfNav(msg.to); break;
            case 'agent-new': this.createAgent((msg.form ?? {}) as Record<string, unknown>); break;
        }
    }

    /** The one write behind "new agent". The refusals are the ones the old
     *  chain's `validateInput` made, said in the card instead of under a box. */
    private createAgent(raw: Record<string, unknown>): void {
        const say = (text: string, ok = false) =>
            void this.host.webview.postMessage({ type: 'agent-msg', text, ok });
        const s = (k: string) => String(raw[k] ?? '').trim();
        const name = s('name');
        if (!name) { return say('It needs a name — the folder is named after it, and so is the agent.'); }
        if (!/^[\w-]+$/.test(name)) {
            return say('Letters, digits, - and _ only: the name becomes a folder name and an id.');
        }
        const roots = this.deps.agentRoots?.() ?? [];
        const root = s('root') || roots[0] || '';
        if (!root) { return say('Configure an agent root folder first (Farm Settings → agentRoots).'); }
        if (s('mode') === 'import') {
            if (!this.deps.importPack) { return; }
            const res = this.deps.importPack({ root, name, packFile: s('packFile') });
            if (res.error) { return say(res.error); }
            this.refresh();
            return say(`Pack imported as "${name}". Its triggers and schedules arrived switched OFF — look at them before you arm them.`, true);
        }
        if (!this.deps.createAgent) { return; }
        const res = this.deps.createAgent({ root, name, model: s('model'), mission: s('mission') });
        if (res.error) { return say(res.error); }
        this.refresh();
        say(`"${name}" created. Its CLAUDE.md is open — that file IS the agent.`, true);
    }

    private dispose(): void {
        // A phone's view closing leaves the desktop's tab alone.
        if (PortfolioPanel.current === this) { PortfolioPanel.current = undefined; }
        PortfolioPanel.phones.delete(this);
        this.disposables.forEach(d => d.dispose());
        this.host.dispose();
    }
}
