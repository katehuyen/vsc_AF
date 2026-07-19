import * as fs from 'fs';
import * as vscode from 'vscode';
import { AgentInfo } from '../core/agents';
import { addDuty, CLAUDE_MD_SNIPPET, claudeMdReferencesDuties } from '../core/duties';
import {
    copyMcpServerTo, mcpLastUsed, mcpUsage, readAgentMcpServers, readDisabledServers
} from '../core/mcp';
import { copyMemoryFileTo, memoryLastUsed, memoryUsage } from '../core/memusage';
import { copySkillTo, readAgentSkills, skillLastUsed, skillUsage } from '../core/skills';
import { buildTaskFamilies, TaskRecord } from '../core/taskstats';
import { SessionIndex } from '../core/sessions';
import { hashString, relTime, safeReadFile, safeStat } from '../core/util';
import { handleAfNav, htmlShell } from './base';

/**
 * Capability Matrix: skills × agents and MCP servers × agents in one glance —
 * who has what, what is actually used (30d), what is dead weight. Empty cells
 * are actionable: click to copy the capability onto that agent.
 */

export interface CapabilitiesDeps {
    extensionUri: vscode.Uri;
    getAgents(): AgentInfo[];
    index: SessionIndex;
    refreshTrees(): void;
    /** live task list merged with the task-history archive (see taskstats). */
    taskRecords(): TaskRecord[];
}

const WINDOW_MS = 30 * 24 * 3600 * 1000;

interface Cell {
    present: boolean;
    calls: number;
    lastTs?: number;
    disabled?: boolean;
    source?: string;
}

function buildData(deps: CapabilitiesDeps): Record<string, unknown> {
    const agents = deps.getAgents();

    // Skills: row identity = scope + name (user-scope rows are shared folders).
    const skillRows = new Map<string, {
        name: string; scope: string; description: string; cells: Record<string, Cell>;
    }>();
    for (const agent of agents) {
        const usage = skillUsage(deps.index, agent.id, WINDOW_MS);
        const lastUsed = skillLastUsed(deps.index, agent.id);
        for (const skill of readAgentSkills(agent)) {
            const key = `${skill.scope}:${skill.name}`;
            let row = skillRows.get(key);
            if (!row) {
                row = { name: skill.name, scope: skill.scope, description: skill.description, cells: {} };
                skillRows.set(key, row);
            }
            row.cells[agent.id] = {
                present: true,
                calls: usage.get(skill.name) ?? 0,
                lastTs: lastUsed.get(skill.name),
                source: skill.source
            };
        }
    }

    // MCP: row identity = server name; definitions may differ per agent.
    const mcpRows = new Map<string, {
        name: string; transport: string; commandOrUrl: string; cells: Record<string, Cell>;
    }>();
    for (const agent of agents) {
        const usage = mcpUsage(deps.index, agent.id, WINDOW_MS);
        const lastUsed = mcpLastUsed(deps.index, agent.id);
        const disabled = readDisabledServers(agent);
        for (const server of readAgentMcpServers(agent)) {
            let row = mcpRows.get(server.name);
            if (!row) {
                row = { name: server.name, transport: server.transport, commandOrUrl: server.commandOrUrl, cells: {} };
                mcpRows.set(server.name, row);
            }
            row.cells[agent.id] = {
                present: true,
                calls: usage.get(server.name) ?? 0,
                lastTs: lastUsed.get(server.name),
                disabled: disabled.has(server.name),
                source: server.source
            };
        }
    }

    // Memory: row identity = basename; cross-agent copies get divergence hashes.
    const memRows = new Map<string, {
        name: string;
        cells: Record<string, Cell & { tokens: number; mtime: number; hash: number; diverged?: boolean }>;
    }>();
    for (const agent of agents) {
        const usage = memoryUsage(deps.index, agent.id, WINDOW_MS, agent.dir);
        const lastUsed = memoryLastUsed(deps.index, agent.id, agent.dir);
        for (const f of agent.memoryFiles) {
            if (f.name.toLowerCase() === 'memory.md') { continue; }
            const key = f.name.toLowerCase();
            let row = memRows.get(key);
            if (!row) {
                row = { name: f.name, cells: {} };
                memRows.set(key, row);
            }
            row.cells[agent.id] = {
                present: true,
                calls: usage.get(key) ?? 0,
                lastTs: lastUsed.get(key),
                source: f.path,
                tokens: f.tokens,
                mtime: f.mtime,
                hash: hashString(safeReadFile(f.path) ?? '')
            };
        }
    }
    for (const row of memRows.values()) {
        const cells = Object.values(row.cells);
        if (cells.length < 2) { continue; }
        const newest = cells.reduce((a, b) => (b.mtime > a.mtime ? b : a));
        for (const c of cells) {
            if (c.hash !== newest.hash) { c.diverged = true; }
        }
    }

    // Duties: row identity = title; cells carry cadence + state.
    const dutyRows = new Map<string, {
        title: string;
        cells: Record<string, { cadence: string; paused: boolean; watch?: string; action?: string; source?: string }>;
    }>();
    for (const agent of agents) {
        for (const d of agent.duties) {
            const key = d.title.toLowerCase();
            let row = dutyRows.get(key);
            if (!row) {
                row = { title: d.title, cells: {} };
                dutyRows.set(key, row);
            }
            row.cells[agent.id] = {
                cadence: d.cadence, paused: d.paused, watch: d.watch, action: d.action,
                source: agent.dutiesPath
            };
        }
    }

    // Tasks: row identity = title family (retry/date/number noise collapsed);
    // cells carry completed-run counts + outcomes. Top 30 busiest families.
    const taskFamilies = buildTaskFamilies(deps.taskRecords()).slice(0, 30);

    const spread = (cells: Record<string, unknown>) => Object.keys(cells).length;
    return {
        generatedAt: Date.now(),
        agents: agents.map(a => ({ id: a.id, name: a.name })),
        skills: [...skillRows.values()]
            .sort((a, b) => a.scope === b.scope ? a.name.localeCompare(b.name) : a.scope === 'user' ? -1 : 1),
        mcp: [...mcpRows.values()].sort((a, b) => a.name.localeCompare(b.name)),
        // Shared (multi-agent) rows first — that's where sync/divergence matters.
        memory: [...memRows.values()].sort((a, b) =>
            spread(b.cells) - spread(a.cells) || a.name.localeCompare(b.name)),
        duties: [...dutyRows.values()].sort((a, b) =>
            spread(b.cells) - spread(a.cells) || a.title.localeCompare(b.title)),
        tasks: taskFamilies
    };
}

export class CapabilitiesPanel {
    private static current: CapabilitiesPanel | undefined;
    private disposables: vscode.Disposable[] = [];

    static show(deps: CapabilitiesDeps): void {
        if (CapabilitiesPanel.current) {
            CapabilitiesPanel.current.panel.reveal();
            CapabilitiesPanel.current.refresh();
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'agentfarm.capabilities',
            'Agent Farm — Capability Matrix',
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        CapabilitiesPanel.current = new CapabilitiesPanel(panel, deps);
    }

    static refreshIfOpen(): void {
        CapabilitiesPanel.current?.refresh();
    }

    private constructor(readonly panel: vscode.WebviewPanel, private deps: CapabilitiesDeps) {
        panel.webview.html = htmlShell(
            panel.webview,
            deps.extensionUri,
            'Capability Matrix',
            buildData(deps),
            'capabilities.js'
        );
        panel.onDidDispose(() => this.dispose(), null, this.disposables);
        panel.webview.onDidReceiveMessage(msg => void this.onMessage(msg), null, this.disposables);
    }

    refresh(): void {
        void this.panel.webview.postMessage({ type: 'data', data: buildData(this.deps) });
    }

    private agentById(id: string): AgentInfo | undefined {
        return this.deps.getAgents().find(a => a.id === id);
    }

    /**
     * Copy-source resolution, identical for every kind (skill · MCP · memory ·
     * duty). The webview's ＋ never decides where a copy comes from — the host
     * lists every agent that has the item and:
     *  - exactly one donor → a confirm naming it;
     *  - more than one donor → ALWAYS a picker, so the choice is the user's
     *    even when the copies happen to match. Entries are newest first and
     *    labeled with how they compare (identical / differs) plus freshness,
     *    so "which variant spreads" is visible before the click. The pick is
     *    the confirmation — no second dialog on top of it.
     * Returns the chosen donor agent, or undefined when the user backs out.
     */
    private async chooseDonor(
        itemLabel: string,
        to: AgentInfo,
        donors: { agent: AgentInfo; contentKey: string; mtime?: number; description: string; detail?: string }[],
        confirmSuffix = ''
    ): Promise<AgentInfo | undefined> {
        if (!donors.length) { return undefined; }
        donors = donors.slice().sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0));
        if (donors.length === 1) {
            const ok = await vscode.window.showInformationMessage(
                `Copy ${itemLabel} from ${donors[0].agent.name} to ${to.name}?${confirmSuffix}`,
                { modal: true }, 'Copy');
            return ok === 'Copy' ? donors[0].agent : undefined;
        }
        const allSame = donors.every(d => d.contentKey === donors[0].contentKey);
        const newestKey = donors[0].contentKey;
        // Freshness wording only when real mtimes exist — a duty has no file
        // date of its own, so there "newest" would be a made-up claim.
        const dated = donors[0].mtime !== undefined;
        const cmpTag = (d: { contentKey: string }, i: number) => {
            if (allSame) { return 'identical everywhere'; }
            if (i === 0) { return dated ? 'newest' : 'first'; }
            if (d.contentKey === newestKey) { return dated ? '= same as newest' : '= same as first'; }
            return dated ? '≠ differs from newest' : '≠ differs';
        };
        const pick = await vscode.window.showQuickPick(
            donors.map((d, i) => ({
                label: d.agent.name,
                description: [cmpTag(d, i), d.description].filter(Boolean).join(' · '),
                detail: d.detail,
                donor: d.agent
            })),
            {
                placeHolder: allSame
                    ? `${donors.length} agents have ${itemLabel} and their copies are identical — pick the source for ${to.name}`
                    : `Copies of ${itemLabel} DIFFER between agents — pick the source to copy to ${to.name}`,
                ignoreFocusOut: true
            });
        return pick?.donor;
    }

    private async onMessage(msg: { type: string; [k: string]: unknown }): Promise<void> {
        switch (msg.type) {
            case 'refresh':
                this.refresh();
                break;
            case 'openGuide':
                void vscode.commands.executeCommand('agentfarm.openGuide', 'yetenek-matrisi');
                break;
            case 'afnav':
                handleAfNav(msg.to);
                break;
            case 'openTaskHistory':
                void vscode.commands.executeCommand('agentfarm.openTaskHistory');
                break;
            case 'open':
                if (typeof msg.path === 'string' && msg.path) {
                    void vscode.window.showTextDocument(vscode.Uri.file(msg.path));
                }
                break;
            case 'copySkill': {
                const to = this.agentById(String(msg.toAgentId));
                if (!to) { return; }
                const donors = this.deps.getAgents()
                    .filter(a => a.id !== to.id)
                    .map(a => ({
                        agent: a,
                        skill: readAgentSkills(a).find(s => s.name === msg.name && s.scope === msg.scope)
                    }))
                    .filter((x): x is { agent: AgentInfo; skill: NonNullable<typeof x.skill> } => !!x.skill)
                    .map(x => {
                        const mtime = safeStat(x.skill.source)?.mtimeMs;
                        return {
                            agent: x.agent,
                            contentKey: String(hashString(safeReadFile(x.skill.source) ?? '')),
                            mtime,
                            description: mtime ? `changed ${relTime(mtime)}` : '',
                            detail: x.skill.source
                        };
                    });
                const from = await this.chooseDonor(`skill "${msg.name}"`, to, donors);
                if (!from) { return; }
                const skill = readAgentSkills(from).find(s => s.name === msg.name && s.scope === msg.scope);
                if (!skill) { return; }
                try {
                    copySkillTo(skill, to);
                    this.deps.refreshTrees();
                    this.refresh();
                } catch (e) {
                    void vscode.window.showWarningMessage(`Agent Farm: ${(e as Error).message ?? String(e)}`);
                }
                break;
            }
            case 'copyMemory': {
                const to = this.agentById(String(msg.toAgentId));
                if (!to) { return; }
                const name = String(msg.name).toLowerCase();
                const donors = this.deps.getAgents()
                    .filter(a => a.id !== to.id)
                    .map(a => ({ agent: a, file: a.memoryFiles.find(f => f.name.toLowerCase() === name) }))
                    .filter((x): x is { agent: AgentInfo; file: NonNullable<typeof x.file> } => !!x.file)
                    .map(x => {
                        const recalls = memoryUsage(this.deps.index, x.agent.id, WINDOW_MS, x.agent.dir)
                            .get(name) ?? 0;
                        return {
                            agent: x.agent,
                            contentKey: String(hashString(safeReadFile(x.file.path) ?? '')),
                            mtime: x.file.mtime,
                            description: `changed ${relTime(x.file.mtime)} · ~${x.file.tokens} tok`
                                + (recalls ? ` · ${recalls} recalls (30d)` : ''),
                            detail: x.file.path
                        };
                    });
                const from = await this.chooseDonor(`memory "${msg.name}"`, to, donors,
                    ' (it is also indexed in the target\'s MEMORY.md)');
                if (!from) { return; }
                const file = from.memoryFiles.find(f => f.name.toLowerCase() === name);
                if (!file) { return; }
                try {
                    copyMemoryFileTo(file.path, to.dir);
                    this.deps.refreshTrees();
                    this.refresh();
                } catch (e) {
                    void vscode.window.showWarningMessage(`Agent Farm: ${(e as Error).message ?? String(e)}`);
                }
                break;
            }
            case 'copyDuty': {
                const to = this.agentById(String(msg.toAgentId));
                if (!to) { return; }
                const title = String(msg.title).toLowerCase();
                const donors = this.deps.getAgents()
                    .filter(a => a.id !== to.id)
                    .map(a => ({ agent: a, duty: a.duties.find(d => d.title.toLowerCase() === title) }))
                    .filter((x): x is { agent: AgentInfo; duty: NonNullable<typeof x.duty> } => !!x.duty)
                    .map(x => {
                        // A duty carries no date of its own; its file's date is
                        // shown but never used to claim one duty is "newer".
                        const fileTs = x.agent.dutiesPath ? safeStat(x.agent.dutiesPath)?.mtimeMs : undefined;
                        return {
                            agent: x.agent,
                            contentKey: `${x.duty.cadence}|${x.duty.watch ?? ''}|${x.duty.action ?? ''}`,
                            description: `[${x.duty.cadence}${x.duty.paused ? ', paused' : ''}]`
                                + (fileTs ? ` DUTIES.md changed ${relTime(fileTs)}` : '')
                                + (x.duty.watch ? ` · watch: ${x.duty.watch.slice(0, 50)}` : ''),
                            detail: x.agent.dutiesPath
                        };
                    });
                const from = await this.chooseDonor(`duty "${msg.title}"`, to, donors);
                if (!from) { return; }
                const duty = from.duties.find(d => d.title.toLowerCase() === title);
                if (!duty) { return; }
                if (to.duties.some(d => d.title === duty.title)) {
                    void vscode.window.showWarningMessage(`Agent Farm: ${to.name} already has a duty titled "${duty.title}".`);
                    return;
                }
                addDuty(to.dir, { ...duty });
                if (to.claudeMdPath) {
                    const claudeMd = fs.readFileSync(to.claudeMdPath, 'utf8');
                    if (!claudeMdReferencesDuties(claudeMd)) {
                        const append = await vscode.window.showWarningMessage(
                            `${to.name}'s CLAUDE.md does not mention DUTIES.md — without a reference the agent will never check its duties. Append the instruction section?`,
                            { modal: true }, 'Append to CLAUDE.md');
                        if (append === 'Append to CLAUDE.md') {
                            fs.writeFileSync(to.claudeMdPath, claudeMd.replace(/\n*$/, '\n') + CLAUDE_MD_SNIPPET, 'utf8');
                        }
                    }
                }
                this.deps.refreshTrees();
                this.refresh();
                break;
            }
            case 'copyMcp': {
                const to = this.agentById(String(msg.toAgentId));
                if (!to) { return; }
                const donors = this.deps.getAgents()
                    .filter(a => a.id !== to.id)
                    .map(a => ({ agent: a, server: readAgentMcpServers(a).find(s => s.name === msg.name) }))
                    .filter((x): x is { agent: AgentInfo; server: NonNullable<typeof x.server> } => !!x.server)
                    .map(x => ({
                        agent: x.agent,
                        contentKey: `${x.server.transport} ${x.server.commandOrUrl}`,
                        mtime: safeStat(x.server.source)?.mtimeMs,
                        description: `${x.server.transport} · ${x.server.commandOrUrl.slice(0, 60)}`,
                        detail: x.server.source
                    }));
                const from = await this.chooseDonor(`MCP server "${msg.name}"`, to, donors,
                    ` (into ${to.name}'s .mcp.json)`);
                if (!from) { return; }
                const server = readAgentMcpServers(from).find(s => s.name === msg.name);
                if (!server) { return; }
                if (copyMcpServerTo(server, to)) {
                    this.deps.refreshTrees();
                    this.refresh();
                } else {
                    void vscode.window.showWarningMessage('Agent Farm: could not read the server definition to copy it.');
                }
                break;
            }
        }
    }

    private dispose(): void {
        CapabilitiesPanel.current = undefined;
        for (const d of this.disposables) { d.dispose(); }
    }
}
