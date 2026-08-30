import * as vscode from 'vscode';
import { AgentInfo } from '../core/agents';
import { mcpUsage, readAgentMcpServers, readServerRawDef, setServerDisabled } from '../core/mcp';
import { loadProbeCache, McpServerConfig, probeMcpServer, saveProbeCache } from '../core/mcpProbe';
import { readAgentSkills, skillUsage } from '../core/skills';
import { SessionIndex } from '../core/sessions';
import { revealPath } from '../core/reveal';
import {
    buildToolboxInventory, setPluginEnabled, ToolboxItem, userClaudeDir, userConfigJson
} from '../core/toolbox';
import {
    formatToolPairs, probeCacheKey, removeToolboxItem, resolveServerConfig, saveToolboxItem
} from '../core/toolboxBridge';
import { SpendLedger } from '../core/messaging';
import { afConfig } from '../core/settingsDoor';
import { bridgeStatus, budgetReading, parseChatId } from '../core/telegramCockpit';
import { handleAfNav, htmlShell } from './base';

/**
 * Toolbox page — the management console behind the Toolbox sidebar section:
 * every kind of Claude extension at user + agent scope in one place, with
 * details (down to an MCP server's actual tool list via live probe) and
 * actions (open, reveal, create, remove-with-backup, enable/disable).
 */

/**
 * U-84 — THE LIVE FACTS THE TELEGRAM CARD DRAWS, and the reason they arrive as
 * a dependency rather than being read here.
 *
 * ‼️ THREE OF THEM ARE UNREACHABLE FROM A PANEL. The bot token is in the secret
 * vault, the day's spend is in `globalState`, and the last poll error is held by
 * a poller that lives for the length of `activate()`. A panel that reached for
 * any of them would either fail or grow its own second copy — so the extension,
 * which owns all three, hands over the ANSWER.
 *
 * ‼️ AND `hasToken` IS A BOOLEAN ON PURPOSE. The card has to be able to draw
 * "this bridge has no token yet" without the token ever entering a webview —
 * the same boundary X-100 draws with `hasSecret`, for the same reason.
 */
export interface TelegramSnapshot {
    hasToken: boolean;
    /** The bot's own name, once something has asked Telegram for it. */
    botUsername?: string;
    ledger: SpendLedger;
    /** The local day the ledger is being read against. */
    day: string;
    lastError?: string;
}

export interface ToolboxPanelDeps {
    extensionUri: vscode.Uri;
    getAgents(): AgentInfo[];
    index: SessionIndex;
    /** disk cache for MCP probe results (shared with the bridge op) */
    cacheFile: string;
    refreshTrees(): void;
    home?: string;
    /** U-84 — optional so every existing caller and test keeps working; the
     *  card simply does not draw when nothing supplies it. */
    telegram?: {
        snapshot(): TelegramSnapshot;
        /** A live `getMe` against the stored token. Returns the bot's name or
         *  the reason it could not be had — never the token. */
        verify(): Promise<{ ok: boolean; username?: string; error?: string }>;
    };
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

const USAGE_WINDOW_MS = 30 * 24 * 3600 * 1000;

/**
 * ‼️ U-84 — THE ONLY SETTINGS THE SERVICES CARD MAY WRITE, named one by one.
 *
 * The alternative is a page that posts `{key, value}` and a host that obeys it,
 * which is a webview with write access to every Agent Farm setting there is.
 * The allowlist is the difference between a card with four controls and a
 * general-purpose settings writer nobody meant to build. `allowedChats` is NOT
 * here: it has its own two cases, because adding an id has to be able to refuse.
 */
const SERVICE_KEYS = new Set([
    'telegram.enabled', 'telegram.maxDailyUSD', 'telegram.defaultAgent'
]);

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
        },
        services: buildServices(deps)
    };
}

/**
 * U-84 — the Services card's data, ALREADY DECIDED.
 *
 * ‼️ THE PAGE IS HANDED CONCLUSIONS, NOT INGREDIENTS. Given `enabled`,
 * `hasToken` and an allowlist length, a page would have to work out for itself
 * whether the bridge is running — which is a second implementation of
 * `applyChatBridge`'s rules, in a file nobody thinks of as launch logic, going
 * quietly out of date the first time that function changes. `bridgeStatus` and
 * `budgetReading` are asked here and the answers are what travel.
 */
function buildServices(deps: ToolboxPanelDeps): Record<string, unknown> | undefined {
    if (!deps.telegram) { return undefined; }
    const cfg = afConfig();
    const snap = deps.telegram.snapshot();
    const allowedChats = (cfg.get<number[]>('telegram.allowedChats', []) ?? [])
        .filter(n => typeof n === 'number');
    const maxDailyUSD = cfg.get<number>('telegram.maxDailyUSD', 1);
    return {
        telegram: {
            enabled: cfg.get<boolean>('telegram.enabled', false),
            hasToken: snap.hasToken,
            ...(snap.botUsername ? { botUsername: snap.botUsername } : {}),
            allowedChats,
            maxDailyUSD,
            defaultAgent: cfg.get<string>('telegram.defaultAgent', '').trim(),
            status: bridgeStatus({
                enabled: cfg.get<boolean>('telegram.enabled', false),
                hasToken: snap.hasToken,
                allowCount: allowedChats.length,
                ...(snap.lastError ? { lastError: snap.lastError } : {})
            }),
            budget: budgetReading(snap.ledger, maxDailyUSD, snap.day)
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
            // A header button that is an action, not a destination (see
            // AFHeader's `related`). The handler CALLS the command the palette
            // calls — the dialogs, the divergence checks and the backups are
            // that command's, and there is exactly one of them.
            case 'headerAction':
                if (msg.action === 'syncConstitution') {
                    void vscode.commands.executeCommand('agentfarm.syncConstitution');
                }
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
                        env: formatToolPairs(def.env),
                        url: String(def.url ?? ''),
                        headers: formatToolPairs(def.headers)
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
            // ---------------------------------------- U-84 · Services card
            case 'svc-connect':
                // The token is collected by the command that already knows how
                // to store it — a second input box here would be a second place
                // a secret is handled.
                await vscode.commands.executeCommand('agentfarm.connectTelegram');
                this.refresh();
                break;
            case 'svc-verify': {
                const r = await this.deps.telegram?.verify();
                if (!r) { break; }
                void this.panel.webview.postMessage({ type: 'svc-verified', ...r });
                this.refresh();
                break;
            }
            case 'svc-set': {
                // ‼️ AN ALLOW-LIST, NOT A PASS-THROUGH. A page that can name any
                // setting is a page that can write any setting, and this one is
                // reachable by anything that can post a message into a webview.
                const key = String(msg.key ?? '');
                if (!SERVICE_KEYS.has(key)) { break; }
                await afConfig().update(key, msg.value, vscode.ConfigurationTarget.Global);
                this.refresh();
                break;
            }
            case 'svc-allow-add': {
                const list = (afConfig().get<number[]>('telegram.allowedChats', []) ?? [])
                    .filter(n => typeof n === 'number');
                const parsed = parseChatId(String(msg.text ?? ''), list);
                // The refusal is SHOWN. Dropping a bad id silently is the one
                // behaviour that makes somebody type it again, identically.
                if (!parsed.ok) { this.warn(parsed.error ?? 'that is not a chat id.'); break; }
                await afConfig().update('telegram.allowedChats', [...list, parsed.id],
                    vscode.ConfigurationTarget.Global);
                this.refresh();
                break;
            }
            case 'svc-allow-remove': {
                const id = Number(msg.id);
                if (!Number.isFinite(id)) { break; }
                const list = (afConfig().get<number[]>('telegram.allowedChats', []) ?? [])
                    .filter(n => typeof n === 'number' && n !== id);
                await afConfig().update('telegram.allowedChats', list,
                    vscode.ConfigurationTarget.Global);
                this.refresh();
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
        // ‼️ The modal is the PANEL's half of this and stays here (a page-side
        // warning can be missed while the focus is elsewhere — docs/CONVENTIONS).
        // WHAT actually goes is decided in the one place both this page and the
        // bridge call, so the two can never remove different things.
        const res = removeToolboxItem(item, this.deps.getAgents(), this.deps.home);
        if (res.ok) { this.changed(); } else { this.warn(res.error ?? `could not remove "${item.name}".`); }
    }

    /** A refusal the FORM shows, in the form. */
    private say(text: string, ok = false): void {
        void this.panel.webview.postMessage({ type: 'tool-msg', text, ok });
    }

    /**
     * The one write behind every "make a tool" route.
     *
     * ‼️ THE COMPOSITION LIVES IN core/toolboxBridge.ts, NOT HERE (B-2). It used
     * to live in this method alone, which is exactly why an agent could not
     * install a skill or write an MCP server without being told to open this
     * page by hand: the bridge had nothing to call. What stays here is the two
     * things only a panel can do — print the refusal INSIDE the form next to the
     * button that was pressed, and open the file that was just scaffolded so the
     * instructions can be written straight away.
     */
    private async saveTool(raw: Record<string, unknown>): Promise<void> {
        const s = (k: string) => String(raw[k] ?? '').trim();
        const res = saveToolboxItem({
            kind: s('kind'), mode: s('mode') || 'new', agentId: s('agentId'),
            name: s('name'), description: s('description'), target: s('target'),
            transport: s('transport'), command: s('command'), args: s('args'),
            env: s('env'), url: s('url'), headers: s('headers')
        }, this.deps.getAgents(), this.deps.home);
        if (!res.ok) { return this.say(res.error ?? 'Could not write it.'); }
        this.changed();
        this.say(res.note ?? 'Done.', true);
        // A scaffolded markdown file is empty on purpose — the next thing anybody
        // does with it is write the instructions, so it opens.
        if (res.file && s('kind') !== 'mcp' && (s('mode') || 'new') === 'new') {
            void vscode.window.showTextDocument(vscode.Uri.file(res.file));
        }
    }

    private dispose(): void {
        ToolboxPanel.current = undefined;
        for (const d of this.disposables) { d.dispose(); }
    }
}
