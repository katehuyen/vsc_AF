import * as fs from 'fs';
import * as vscode from 'vscode';
import { AgentInfo } from '../core/agents';
import {
    addDuty, CADENCES, claudeMdReferencesDuties, CLAUDE_MD_SNIPPET, deleteDuty, Duty,
    DUTIES_FILENAME, DUTY_TEMPLATES, moveDuty, togglePauseDuty, updateDuty, watchStatus
} from '../core/duties';
import { Insight } from '../core/health';
import { mcpUsage, readAgentMcpServers, readDisabledServers } from '../core/mcp';
import { indexedMemoryNames, memoryUsage } from '../core/memusage';
import { readAgentSkills, skillUsage } from '../core/skills';
import { buildAgentTaskStats, TaskRecord } from '../core/taskstats';
import { SessionIndex } from '../core/sessions';
import { PriceRule, PricingEngine, totalTokens } from '../core/pricing';
import { safeReadFile } from '../core/util';
import { handleAfNav, handleFormBrowse, htmlShell, runSurface } from './base';
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
    /** Re-read the agent folders and repaint every tree and page. Writing a
     *  duty changes a file no session index is watching, so the page has to say
     *  so itself — otherwise the tree keeps yesterday's duty list. */
    refreshAll?(): void;
}

/**
 * ‼️ A DUTY ONLY WORKS IF THE AGENT'S CLAUDE.md POINTS AT DUTIES.md.
 *
 * Writing the file is not the whole job: an agent that is never told to read
 * DUTIES.md will not read it, and the duty then exists only in this extension's
 * tables. The offer is a modal on purpose — it is a write into the user's own
 * CLAUDE.md, which is exactly the class of thing a page-side notice must not be
 * allowed to slip past while the focus is elsewhere.
 */
async function ensureDutiesReference(agent: AgentInfo): Promise<void> {
    if (!agent.claudeMdPath) { return; }
    let claudeMd: string;
    try { claudeMd = fs.readFileSync(agent.claudeMdPath, 'utf8'); } catch { return; }
    if (claudeMdReferencesDuties(claudeMd)) { return; }
    const choice = await vscode.window.showWarningMessage(
        `${agent.name}'s CLAUDE.md does not mention ${DUTIES_FILENAME} yet — without a reference the agent will never check its duties. Append a short instruction section?`,
        { modal: true }, 'Append to CLAUDE.md'
    );
    if (choice === 'Append to CLAUDE.md') {
        fs.writeFileSync(agent.claudeMdPath, claudeMd.replace(/\n*$/, '\n') + CLAUDE_MD_SNIPPET, 'utf8');
    }
}

/** What the duty form is opened with — the FORM's flat vocabulary, not the
 *  model's. `mode` decides which of the three writes happens on save. */
export interface DutyCompose {
    mode: 'new' | 'edit' | 'copy';
    title?: string;
    cadence?: string;
    watch?: string;
    action?: string;
    note?: string;
    paused?: boolean;
    /** edit/copy: the duty this started from, so the right block is replaced. */
    oldTitle?: string;
    /** copy: which agent it lands on. Empty until the picker is answered. */
    target?: string;
}

function buildData(agent: AgentInfo, deps: AgentDetailDeps, tableN = AGENT_SESSION_TABLE_N): Record<string, unknown> {
    const sessions = deps.index.forAgent(agent.id).sort((a, b) => b.mtime - a.mtime);
    // ‼️ TWO LISTS ON PURPOSE (X-27). Everything measured below — cost, daily
    // buckets, model split, tool counts — is defined against Claude's own
    // transcript and stays on `sessions`. The TABLE is this agent's log and
    // must hold every engine it was run with, or an agent you mostly drive
    // through Codex looks like an agent that has barely worked.
    const tableSessions = deps.index.forAgentWithExternal(agent.id)
        .sort((a, b) => b.mtime - a.mtime);
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
                    // The form edits it, so the page has to be given it — an
                    // "edit" that silently drops a field is worse than no edit.
                    note: d.note,
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
            avgCostPerSession: sessions.length ? totalCost / sessions.length : 0,
            /**
             * ‼️ WHICH ENGINES THIS AGENT IS ACTUALLY DRIVEN WITH (X-35).
             *
             * `sessions` above is the claude-only list and every figure beside it
             * is measured off Claude's transcript — correctly, that is the
             * documented split. What was missing is the SENTENCE that makes those
             * figures readable: an agent the user mostly runs through Codex showed
             * a near-zero cost and a handful of sessions next to a table full of
             * rows, and nothing on the page explained the gap. Counted off the
             * table's own list so the two can never disagree.
             */
            byEngine: (() => {
                const out: Record<string, number> = {};
                for (const s of tableSessions) {
                    const id = s.source ?? 'claude';
                    out[id] = (out[id] ?? 0) + 1;
                }
                return out;
            })(),
            /** …and how many of the rows the money above does NOT cover. */
            measuredSessions: sessions.length,
            allSessions: tableSessions.length
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
        /**
         * ‼️ SAID ONCE, ABOVE THE TABLE (X-35).
         *
         * Several findings on this page are measured against Claude's
         * transcript format and cannot see this agent's Codex or Antigravity
         * work — which the reader has to know, and which is the same sentence
         * every time. On a table it is a per-agent fact, not a per-row one:
         * repeated down eight rows it is the paragraph nobody reads, and the
         * rows lose the width they need for the finding itself.
         */
        insightScope: [...new Set(deps.getInsights()
            .filter(i => i.agentId === agent.id && i.scope)
            .map(i => i.scope as string))].join(' ') || '',
        // same advanced table as the dashboard (same row shape / component):
        // union of the true top-N per sortable criterion, sorted client-side;
        // N follows the webview's Show box (0 = all sessions ship)
        sessions: sessionRowPool(tableSessions,
            s => deps.index.isSessionActive(s), tableN,
            s => (s.agentName ? projectByAgent[s.agentName] : undefined),
            name => deps.projectStyle?.(name)),
        sessionTableN: tableN,
        /**
         * ‼️ U-111 — EVERY SESSION'S SPAN, because `sessions` above CANNOT
         * answer "how many in this period".
         *
         * That list is a POOL: the union of the true top-N per sortable
         * criterion (50 by default), built for a table the reader sorts. Ask it
         * how many sessions fall in a span and a busy agent answers with a
         * floor — the count would silently stop growing at the cap, and the
         * number that stops being wrong when you shrink the range is the worst
         * kind of wrong.
         *
         * Two numbers per session instead, for ALL of them, every engine: the
         * page counts the ones OVERLAPPING the chosen span, which is the
         * dashboard's own definition and the only one that does not drop a
         * conversation opened on Monday and still running on Friday. Cheaper
         * than one table row, so it costs nothing next to what already ships.
         */
        sessionSpans: tableSessions.map(s => [s.firstTs || s.lastTs || s.mtime || 0,
            s.lastTs || s.mtime || 0]),
        // ‼️ WHAT THE DUTY FORM NEEDS TO EXIST AT ALL (U-14, surface 1).
        // `addDuty` was five boxes in a row and `editDuty` five more, asking
        // one field at a time and starting over on Esc. The page already drew
        // every duty this agent has (afDutyRow); what it could not do was make
        // one. These three lists are the whole difference: the cadences the
        // parser understands, the ready-made patterns, and the other agents a
        // duty can be copied onto — with their titles, so the form can refuse a
        // duplicate before it is written rather than after.
        dutyMeta: {
            cadences: CADENCES.map(c => ({ id: c, label: c, title: CADENCE_HINT[c] ?? '' })),
            templates: DUTY_TEMPLATES.map((t, i) => ({
                id: String(i), label: t.label, detail: t.detail, watchKind: t.watchKind,
                title: t.duty.title, cadence: t.duty.cadence, action: t.duty.action ?? ''
            })),
            agents: deps.getAgents()
                .filter(a => a.id !== agent.id)
                .map(a => ({ id: a.id, name: a.name, titles: a.duties.map(d => d.title) }))
        }
    };
}

/** What each cadence means, said once — on the picker, not under every row. */
const CADENCE_HINT: Record<string, string> = {
    'every-turn': 'the agent checks on every turn',
    'session-start': 'checked once, at the start of a session',
    'daily': 'at the first opportunity each day',
    'weekly': 'at the first opportunity each week',
    'manual': 'only when you ask for it'
};

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

    /**
     * The ONE door to a duty — U-14.
     *
     * `agentfarm.addDuty`, `editDuty`, `addDutyFromTemplate` and `copyDuty` all
     * arrive here instead of opening their own chain of boxes, so a duty made
     * from the palette, from the sidebar tree and from this page is the same
     * duty made by the same form. The seed is the form's vocabulary; the page
     * fills in whatever is not stated.
     */
    static composeDuty(agentId: string, deps: AgentDetailDeps, seed: DutyCompose): void {
        AgentDetailPanel.show(agentId, deps);
        void AgentDetailPanel.open.get(agentId)?.panel.webview
            .postMessage({ type: 'duty-compose', seed });
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

    /** A refusal the FORM shows, in the form, beside the button that was
     *  pressed. A modal here would take the focus off the half-filled fields it
     *  is complaining about. */
    private say(text: string, ok = false): void {
        void this.panel.webview.postMessage({ type: 'duty-msg', text, ok });
    }

    /**
     * Write the duty the form built — the only place a duty is written from
     * this side. Three modes, one write each, and the checks the dialog chain
     * could not make: a duty needs a title and something to DO, and no agent
     * may end up with two duties under the same heading (the parser keys blocks
     * by title, so a duplicate would make the second one unaddressable).
     */
    private async saveDuty(raw: Record<string, unknown>): Promise<void> {
        const agent = this.agent();
        if (!agent) { return; }
        const s = (k: string) => String(raw[k] ?? '').trim();
        const mode = s('mode') === 'edit' ? 'edit' : s('mode') === 'copy' ? 'copy' : 'new';
        const title = s('title');
        const action = s('action');
        if (!title) { return this.say('A duty needs a title — it is the heading its block is stored under.'); }
        if (!action) { return this.say('A duty needs a Do: what the agent should actually do when something is waiting.'); }

        const duty: Duty = {
            title,
            cadence: s('cadence') || 'manual',
            paused: raw.paused === true,
            watch: s('watch') || undefined,
            action,
            note: s('note') || undefined
        };

        if (mode === 'copy') {
            const target = this.deps.getAgents().find(a => a.id === s('target'));
            if (!target) { return this.say('Pick the agent this duty is copied to.'); }
            if (target.duties.some(d => d.title === title)) {
                return this.say(`${target.name} already has a duty titled “${title}” — give the copy its own title.`);
            }
            addDuty(target.dir, duty);
            await ensureDutiesReference(target);
            this.deps.refreshAll?.();
            this.refresh();
            this.say(`Copied to ${target.name}.`, true);
            return;
        }

        const oldTitle = s('oldTitle');
        const clash = agent.duties.some(d => d.title === title && d.title !== oldTitle);
        if (clash) {
            return this.say(`${agent.name} already has a duty titled “${title}”. Two blocks under one heading cannot be told apart.`);
        }
        if (mode === 'edit' && oldTitle) {
            updateDuty(agent.dir, oldTitle, duty);
        } else {
            addDuty(agent.dir, duty);
            await ensureDutiesReference(agent);
        }
        this.deps.refreshAll?.();
        this.refresh();
        this.say(mode === 'edit' ? `Duty “${title}” updated.` : `Duty “${title}” added.`, true);
    }

    /**
     * The single acts a duty row offers — pause, reorder, delete. They are not
     * a form: "move it up" has nothing to fill in. Delete is the one that keeps
     * its modal, deliberately (docs/CONVENTIONS.md — a destructive act must not
     * pass while the focus is somewhere else).
     */
    private async dutyAct(act: string, title: string): Promise<void> {
        const agent = this.agent();
        if (!agent || !title) { return; }
        if (act === 'toggle') { togglePauseDuty(agent.dir, title); }
        else if (act === 'up') { moveDuty(agent.dir, title, -1); }
        else if (act === 'down') { moveDuty(agent.dir, title, 1); }
        else if (act === 'del') {
            const yes = await vscode.window.showWarningMessage(
                `Delete duty "${title}" from ${agent.name}?`, { modal: true }, 'Delete');
            if (yes !== 'Delete') { return; }
            deleteDuty(agent.dir, title);
        } else { return; }
        this.deps.refreshAll?.();
        this.refresh();
    }

    private onMessage(msg: { type: string; [k: string]: unknown }): void {
        switch (msg.type) {
            // The form's own two messages: the OS picker for a watch path, and
            // the save. Everything else the duty surface needs it already has.
            case 'af-browse':
                void handleFormBrowse(this.panel.webview, msg);
                break;
            case 'duty-save':
                void this.saveDuty((msg.duty ?? {}) as Record<string, unknown>);
                break;
            case 'duty-act':
                void this.dutyAct(String(msg.act ?? ''), String(msg.title ?? ''));
                break;
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
                if (!file || !this.deps.index.forAgentWithExternal(this.agentId).some(s => s.file === file)) { break; }
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
            // From a memory row's right-click menu — the graph, scoped to the
            // agent whose page this is.
            case 'openMemoryGraph':
                vscode.commands.executeCommand('agentfarm.openMemoryGraph', { agentId: this.agentId });
                break;
            // …and the two acts that need the graph's own cards (U-14). This
            // page lists a memory file; that page is where one is worked on.
            case 'memCard':
                vscode.commands.executeCommand(
                    msg.card === 'distill' ? 'agentfarm.distillMemory' : 'agentfarm.copyMemory',
                    {
                        agentId: typeof msg.agentId === 'string' && msg.agentId ? msg.agentId : this.agentId,
                        memPath: typeof msg.path === 'string' ? msg.path : '',
                        memName: typeof msg.name === 'string' ? msg.name : ''
                    });
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
