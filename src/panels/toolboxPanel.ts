import * as path from 'path';
import * as vscode from 'vscode';
import { AgentInfo } from '../core/agents';
import {
    addMcpServer, copyMcpServerTo, mcpUsage, readAgentMcpServers, readServerRawDef,
    removeMcpServer, setServerDisabled, updateMcpServer
} from '../core/mcp';
import { loadProbeCache, McpServerConfig, probeMcpServer, saveProbeCache } from '../core/mcpProbe';
import { copySkillTo, readAgentSkills, skillUsage } from '../core/skills';
import { SessionIndex } from '../core/sessions';
import { revealPath } from '../core/reveal';
import {
    buildToolboxInventory, HookEntry, removeHookEntry, removeUserMcpServer, removeWithBackup,
    scaffoldItem, setPluginEnabled, ToolboxItem, userClaudeDir, userConfigJson
} from '../core/toolbox';
import { probeCacheKey, resolveServerConfig } from '../core/toolboxBridge';
import { handleAfNav, htmlShell } from './base';

/**
 * Toolbox page — the management console behind the Toolbox sidebar section:
 * every kind of Claude extension at user + agent scope in one place, with
 * details (down to an MCP server's actual tool list via live probe) and
 * actions (open, reveal, create, remove-with-backup, enable/disable).
 */

export interface ToolboxPanelDeps {
    extensionUri: vscode.Uri;
    getAgents(): AgentInfo[];
    index: SessionIndex;
    /** disk cache for MCP probe results (shared with the bridge op) */
    cacheFile: string;
    refreshTrees(): void;
    home?: string;
}

/**
 * What the Toolbox form is opened with — U-14, surface 2.
 *
 * ‼️ THE PAGE LISTED EVERY TOOL AND COULD MAKE ALMOST NONE OF THEM. `+ new
 * skill` was two input boxes in the host; `addMcpServer` was four in the
 * palette; `editMcpServer` reduced a server to one line of text and threw away
 * whatever else the definition held; `copyMcpServer` and `duplicateSkill` were
 * a quickpick of agent names each. Four routes, four vocabularies, one page
 * that could show you all of it and change none of it.
 */
export interface ToolCompose {
    kind: 'skill' | 'subagent' | 'command' | 'mcp';
    mode: 'new' | 'edit' | 'copy';
    /** '' = user scope; otherwise the agent it belongs to (or is made on). */
    agentId?: string;
    name?: string;
    description?: string;
    /** MCP only. */
    transport?: 'stdio' | 'http';
    command?: string;
    args?: string;
    env?: string;
    url?: string;
    headers?: string;
}

/** `KEY=value` lines ⇄ an object. The env block an MCP server needs is a
 *  handful of pairs; a JSON box for it would be a JSON box people get wrong. */
function parsePairs(text: string): Record<string, string> | undefined {
    const out: Record<string, string> = {};
    let any = false;
    for (const line of String(text || '').split(/\r?\n/)) {
        const t = line.trim();
        if (!t) { continue; }
        const eq = t.indexOf('=');
        if (eq <= 0) { continue; }
        out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
        any = true;
    }
    return any ? out : undefined;
}
function formatPairs(v: unknown): string {
    if (!v || typeof v !== 'object') { return ''; }
    return Object.entries(v as Record<string, unknown>)
        .map(([k, val]) => `${k}=${String(val)}`).join('\n');
}

const USAGE_WINDOW_MS = 30 * 24 * 3600 * 1000;

function buildData(deps: ToolboxPanelDeps): Record<string, unknown> {
    const agents = deps.getAgents();
    const inv = buildToolboxInventory(agents, deps.home);

    // Real 30d usage from transcripts: per-agent for agent scope; user-scope
    // rows aggregate across every agent (they are shared by all of them).
    const skillUse = new Map(agents.map(a => [a.id, skillUsage(deps.index, a.id, USAGE_WINDOW_MS)]));
    const mcpUse = new Map(agents.map(a => [a.id, mcpUsage(deps.index, a.id, USAGE_WINDOW_MS)]));
    for (const it of inv.items) {
        if (it.kind === 'skill' || it.kind === 'mcp') {
            // both usage tables are keyed by the item's name (skill / server)
            const table = it.kind === 'skill' ? skillUse : mcpUse;
            it.detail.usage30d = it.scope === 'agent' && it.agentId
                ? table.get(it.agentId)?.get(it.name) ?? 0
                : agents.reduce((sum, a) => sum + (table.get(a.id)?.get(it.name) ?? 0), 0);
        }
    }

    return {
        generatedAt: inv.generatedAt,
        agents: agents.map(a => ({ id: a.id, name: a.name })),
        counts: inv.counts,
        items: inv.items,
        probeCache: loadProbeCache(deps.cacheFile),
        paths: {
            userClaudeDir: userClaudeDir(deps.home),
            userConfigJson: userConfigJson(deps.home)
        }
    };
}

export class ToolboxPanel {
    private static current: ToolboxPanel | undefined;
    private disposables: vscode.Disposable[] = [];

    static show(deps: ToolboxPanelDeps): void {
        if (ToolboxPanel.current) {
            ToolboxPanel.current.panel.reveal();
            ToolboxPanel.current.refresh();
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'agentfarm.toolbox',
            'Agent Farm — Toolbox',
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        ToolboxPanel.current = new ToolboxPanel(panel, deps);
    }

    static refreshIfOpen(): void {
        ToolboxPanel.current?.refresh();
    }

    /** The ONE door to a tool. Every command that used to build one out of
     *  input boxes opens this instead. */
    static compose(deps: ToolboxPanelDeps, seed: ToolCompose): void {
        ToolboxPanel.show(deps);
        void ToolboxPanel.current?.panel.webview.postMessage({ type: 'tool-compose', seed });
    }

    private constructor(readonly panel: vscode.WebviewPanel, private deps: ToolboxPanelDeps) {
        panel.webview.html = htmlShell(
            panel.webview, deps.extensionUri, 'Toolbox', buildData(deps), 'toolbox.js');
        panel.onDidDispose(() => this.dispose(), null, this.disposables);
        panel.webview.onDidReceiveMessage(msg => void this.onMessage(msg), null, this.disposables);
    }

    refresh(): void {
        void this.panel.webview.postMessage({ type: 'data', data: buildData(this.deps) });
    }

    private agentById(id: string): AgentInfo | undefined {
        return this.deps.getAgents().find(a => a.id === id);
    }

    private changed(): void {
        this.deps.refreshTrees();
        this.refresh();
    }

    private warn(text: string): void {
        void vscode.window.showWarningMessage(`Agent Farm: ${text}`);
    }

    private async onMessage(msg: { type: string; [k: string]: unknown }): Promise<void> {
        switch (msg.type) {
            case 'refresh':
                this.refresh();
                break;
            case 'afnav':
                handleAfNav(msg.to);
                break;
            case 'openGuide':
                void vscode.commands.executeCommand('agentfarm.openGuide', 'toolbox');
                break;
            case 'open':
                if (typeof msg.path === 'string' && msg.path) {
                    void vscode.window.showTextDocument(vscode.Uri.file(msg.path));
                }
                break;
            case 'reveal':
                if (typeof msg.path === 'string' && msg.path) {
                    void revealPath(msg.path);
                }
                break;
            case 'openExternal': {
                const url = String(msg.url ?? '');
                if (/^https?:\/\//.test(url)) { void vscode.env.openExternal(vscode.Uri.parse(url)); }
                break;
            }
            case 'probe':
                await this.probe(String(msg.scope), String(msg.agentId ?? ''), String(msg.server ?? ''));
                break;
            case 'remove':
                await this.remove(msg.item as ToolboxItem | undefined);
                break;
            case 'tool-save':
                await this.saveTool((msg.tool ?? {}) as Record<string, unknown>);
                break;
            // The page needs a server's whole definition to fill the edit form
            // — the inventory row carries a summary, not the JSON.
            case 'mcp-def': {
                const node = this.mcpNode(String(msg.agentId ?? ''), String(msg.name ?? ''));
                const def = node ? readServerRawDef(node.server) ?? {} : {};
                void this.panel.webview.postMessage({
                    type: 'mcp-def',
                    name: String(msg.name ?? ''),
                    def: {
                        transport: def.url ? 'http' : 'stdio',
                        command: String(def.command ?? ''),
                        args: Array.isArray(def.args) ? (def.args as unknown[]).map(String).join('\n') : '',
                        env: formatPairs(def.env),
                        url: String(def.url ?? ''),
                        headers: formatPairs(def.headers)
                    }
                });
                break;
            }
            case 'togglePlugin': {
                const key = String(msg.key ?? '');
                if (!key) { return; }
                if (setPluginEnabled(key, msg.on === true, this.deps.home)) {
                    void vscode.window.showInformationMessage(
                        `Agent Farm: "${key}" ${msg.on ? 'enabled' : 'disabled'} in user settings.json — applies to new claude sessions.`);
                    this.changed();
                } else { this.warn('could not update enabledPlugins in user settings.json.'); }
                break;
            }
            case 'toggleMcp': {
                const agent = this.agentById(String(msg.agentId ?? ''));
                const server = String(msg.server ?? '');
                if (!agent || !server) { return; }
                setServerDisabled(agent, server, msg.disabled === true);
                this.changed();
                break;
            }
            // ---- reachable from a row's buttons and its right-click menu ----
            // Editing and copying are FORMS now (U-14), so these two open the
            // page's own card rather than running a command that opens a chain
            // of boxes on top of the page the row is on.
            case 'skillScope': {
                const node = this.skillNode(String(msg.agentId ?? ''), String(msg.name ?? ''));
                if (!node) { this.warn('a user-scope skill is already shared by every agent.'); break; }
                await vscode.commands.executeCommand('agentfarm.shareSkill', node);
                this.changed();
                break;
            }
        }
    }

    /** The tree node `agentfarm.duplicateSkill` / `shareSkill` take. */
    private skillNode(agentId: string, name: string):
        { kind: 'skill'; agent: AgentInfo; skill: ReturnType<typeof readAgentSkills>[number] } | undefined {
        const agent = this.agentById(agentId);
        const skill = agent ? readAgentSkills(agent).find(s => s.name === name) : undefined;
        return agent && skill ? { kind: 'skill', agent, skill } : undefined;
    }

    /** The tree node `agentfarm.editMcpServer` / `copyMcpServer` take. */
    private mcpNode(agentId: string, name: string):
        { kind: 'mcp-server'; agent: AgentInfo; server: ReturnType<typeof readAgentMcpServers>[number] } | undefined {
        const agent = this.agentById(agentId);
        const server = agent ? readAgentMcpServers(agent).find(s => s.name === name) : undefined;
        return agent && server ? { kind: 'mcp-server', agent, server } : undefined;
    }

    private async probe(scope: string, agentId: string, server: string): Promise<void> {
        if (!server) { return; }
        const agent = scope === 'agent' ? this.agentById(agentId) : undefined;
        if (scope === 'agent' && !agent) { return; }
        const cfg = resolveServerConfig(server, agent, this.deps.home);
        if (!cfg) { this.warn(`could not read the definition of "${server}" to connect.`); return; }
        await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: `Toolbox: asking "${server}" for its tool list…` },
            async () => {
                const result = await probeMcpServer(cfg as McpServerConfig);
                const cache = loadProbeCache(this.deps.cacheFile);
                cache[probeCacheKey(agent ? 'agent' : 'user', agent?.id, server)] = result;
                saveProbeCache(this.deps.cacheFile, cache);
                if (!result.ok) { this.warn(`"${server}" probe failed — ${result.error}`); }
            });
        this.refresh();
    }

    private async remove(item: ToolboxItem | undefined): Promise<void> {
        if (!item?.kind || !item.name) { return; }
        const where = item.scope === 'user' ? 'user scope (ALL agents)' : item.agentName ?? 'agent scope';
        const ok = await vscode.window.showWarningMessage(
            `Remove ${item.kind} "${item.name}" from ${where}? A backup copy is kept next to it (.afbak).`,
            { modal: true }, 'Remove');
        if (ok !== 'Remove') { return; }
        let done = false;
        switch (item.kind) {
            case 'skill':
                done = !!item.dir && removeWithBackup(item.dir);
                break;
            case 'subagent':
            case 'command':
            case 'style':
                done = removeWithBackup(item.source);
                break;
            case 'mcp':
                if (item.scope === 'user') {
                    done = removeUserMcpServer(item.name, this.deps.home);
                } else {
                    const agent = this.agentById(item.agentId ?? '');
                    const def = agent ? readAgentMcpServers(agent).find(s => s.name === item.name) : undefined;
                    done = !!def && removeMcpServer(def);
                }
                break;
            case 'hook': {
                const d = item.detail as { event?: string; matcher?: string; command?: string };
                done = !!d.event && !!d.command && removeHookEntry({
                    event: d.event, matcher: d.matcher ?? '', command: d.command, source: item.source
                } as HookEntry);
                break;
            }
            default:
                this.warn(`${item.kind} entries are not removable from here.`);
                return;
        }
        if (done) { this.changed(); }
        else { this.warn(`could not remove "${item.name}" — see its source file.`); }
    }

    /** A refusal the FORM shows, in the form. */
    private say(text: string, ok = false): void {
        void this.panel.webview.postMessage({ type: 'tool-msg', text, ok });
    }

    /**
     * The one write behind every "make a tool" route.
     *
     * Three kinds scaffold a markdown file (skill · subagent · command) and one
     * edits a JSON entry (mcp). What the form can state that no chain of boxes
     * could: an MCP server's `args`, its `env` and its `headers` — the fields
     * that decide whether the server it just wrote can actually authenticate.
     */
    private async saveTool(raw: Record<string, unknown>): Promise<void> {
        const s = (k: string) => String(raw[k] ?? '').trim();
        const kind = s('kind');
        const mode = s('mode') || 'new';
        const name = s('name');
        if (!name) { return this.say('It needs a name — that is what claude loads it by.'); }

        if (kind === 'skill' || kind === 'subagent' || kind === 'command') {
            if (mode === 'copy') {
                const from = this.skillNode(s('agentId'), name);
                const target = this.agentById(s('target'));
                if (!from) { return this.say('That skill is no longer where it was — refresh the page.'); }
                if (!target) { return this.say('Pick the agent it is copied to.'); }
                try { copySkillTo(from.skill, target); } catch (e) {
                    return this.say((e as Error).message ?? String(e));
                }
                this.changed();
                return this.say(`Copied to ${target.name}.`, true);
            }
            const agent = s('agentId') ? this.agentById(s('agentId')) : undefined;
            if (s('agentId') && !agent) { return this.say('That agent is gone — pick another scope.'); }
            try {
                const claudeDir = agent ? path.join(agent.dir, '.claude') : userClaudeDir(this.deps.home);
                const file = scaffoldItem(kind, claudeDir, name, s('description'));
                this.changed();
                this.say(`Created — ${path.basename(file)} is open for the instructions.`, true);
                void vscode.window.showTextDocument(vscode.Uri.file(file));
            } catch (e) {
                this.say((e as Error).message ?? String(e));
            }
            return;
        }

        if (kind !== 'mcp') { return; }

        if (mode === 'copy') {
            const from = this.mcpNode(s('agentId'), name);
            const target = this.agentById(s('target'));
            if (!from) { return this.say('That server is no longer where it was — refresh the page.'); }
            if (!target) { return this.say('Pick the agent it is copied to.'); }
            const file = copyMcpServerTo(from.server, target);
            if (!file) { return this.say('Could not read the server definition to copy it.'); }
            this.changed();
            return this.say(`Copied to ${target.name} (${path.basename(file)}).`, true);
        }

        // ‼️ AN EDIT KEEPS EVERYTHING IT WAS NOT ASKED ABOUT. The old editor
        // read the definition, replaced `command`+`args` (or `url`) from one
        // text box and wrote the object back — so any key it had no question
        // for survived by luck. Here the untouched keys are carried over
        // explicitly, and the ones the form owns are rewritten.
        const http = s('transport') === 'http';
        const def: Record<string, unknown> = {};
        if (mode === 'edit') {
            const from = this.mcpNode(s('agentId'), name);
            if (!from) { return this.say('That server is no longer where it was — refresh the page.'); }
            const prev = readServerRawDef(from.server) ?? {};
            for (const [k, v] of Object.entries(prev)) {
                if (['command', 'args', 'env', 'url', 'headers', 'type'].indexOf(k) < 0) { def[k] = v; }
            }
        }
        if (http) {
            if (!s('url')) { return this.say('An http server needs its URL.'); }
            def.type = 'http';
            def.url = s('url');
            const headers = parsePairs(s('headers'));
            if (headers) { def.headers = headers; }
        } else {
            if (!s('command')) { return this.say('A stdio server needs the command that starts it.'); }
            def.command = s('command');
            const args = s('args').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
            if (args.length) { def.args = args; }
            const env = parsePairs(s('env'));
            if (env) { def.env = env; }
        }

        if (mode === 'edit') {
            const from = this.mcpNode(s('agentId'), name);
            if (!from) { return this.say('That server is no longer where it was — refresh the page.'); }
            if (!updateMcpServer(from.server, def)) {
                return this.say('Could not update it — the source file is unreadable or the entry is gone.');
            }
            this.changed();
            return this.say(`"${name}" updated — a one-time .afbak backup is kept. Restart the agent's sessions to load it.`, true);
        }

        const agent = this.agentById(s('agentId'));
        if (!agent) { return this.say('An MCP server belongs to an agent — pick which one.'); }
        if (readAgentMcpServers(agent).some(x => x.name === name)) {
            return this.say(`${agent.name} already has a server called "${name}".`);
        }
        const file = addMcpServer(agent, name, def);
        this.changed();
        this.say(`"${name}" added to ${path.basename(file)}. Restart the agent's sessions to load it.`, true);
    }

    private dispose(): void {
        ToolboxPanel.current = undefined;
        for (const d of this.disposables) { d.dispose(); }
    }
}
