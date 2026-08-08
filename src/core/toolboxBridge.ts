import { AgentInfo } from './agents';
import { argStr, BridgeRegistry, need, optStr } from './bridge';
import { readAgentMcpServers, readServerRawDef } from './mcp';
import { loadProbeCache, McpProbeResult, McpServerConfig, probeMcpServer, saveProbeCache } from './mcpProbe';
import { queryMatches } from './query';
import { buildToolboxInventory, readUserMcpServerRaw, ToolboxKind, TOOLBOX_KINDS } from './toolbox';

/**
 * Toolbox bridge ops (§ constitution 19.C) — everything the Toolbox page can
 * show, an agent can query through the farm bridge: the full extension
 * inventory at both scopes, one item in detail, and a live MCP tools/list
 * probe. Registration lives here (not inline in extension.ts) so tests can
 * dispatch against a fresh registry with fixture deps.
 */

export interface ToolboxBridgeDeps {
    getAgents(): AgentInfo[];
    home?: string;
    /** disk cache for probe results (shared with the Toolbox panel) */
    cacheFile: string;
}

export function probeCacheKey(scope: string, agentId: string | undefined, server: string): string {
    return `${scope}:${agentId ?? ''}:${server}`;
}

/** Resolve a server's raw (unmasked) config for probing — user or agent scope. */
export function resolveServerConfig(
    server: string, agent: AgentInfo | undefined, home?: string
): McpServerConfig | undefined {
    if (!agent) { return readUserMcpServerRaw(server, home) as McpServerConfig | undefined; }
    const def = readAgentMcpServers(agent).find(s => s.name === server);
    return def ? readServerRawDef(def) as McpServerConfig | undefined : undefined;
}

export function registerToolboxOps(bridge: BridgeRegistry, deps: ToolboxBridgeDeps): void {
    const findAgent = (ref: string): AgentInfo => {
        const agents = deps.getAgents();
        const a = agents.find(x => x.id === ref) ??
            agents.find(x => x.name.toLowerCase() === ref.toLowerCase());
        need(a, `Agent "${ref}" not found — agents.list shows the current farm.`);
        return a as AgentInfo;
    };

    bridge.register([
        {
            op: 'toolbox.list',
            describe: 'Installed Claude extensions inventory (skills, subagents, commands, MCP, hooks, plugins, output styles, settings files) at user + agent scope. USER scope applies to every agent on this machine; an AGENT-scope entry shadows a user one of the same name — so "which one will actually run" is a question about both, which is why one op answers for both. ‼️ THE FILTERS ARE ANDed AND ARE THE PAGE\'S OWN FACETS, so a question the Toolbox page can ask, this op can ask: `q` is the extension\'s query language (two words = both · OR · -word · "phrase" · wildcard*) searched against the name, description, agent and whole definition; `state` (enabled|disabled) covers MCP servers and plugins with one word whichever the row speaks; `event` is a hook\'s lifecycle event, `transport` an MCP server\'s, `author` and `marketplace` a plugin\'s, `model` a subagent\'s. args: kind? (' + TOOLBOX_KINDS.join('|') + '), scope? (user|agent), agent? (name|id — implies agent scope), q?, state?, event?, transport?, author?, marketplace?, model?, limit? (default 500)',
            handler: (args) => {
                const kind = optStr(args, 'kind');
                need(!kind || TOOLBOX_KINDS.includes(kind as ToolboxKind),
                    `Unknown kind "${kind}" — one of: ${TOOLBOX_KINDS.join(', ')}`);
                const scope = optStr(args, 'scope');
                const agentRef = optStr(args, 'agent');
                const agentId = agentRef ? findAgent(agentRef).id : '';
                const q = optStr(args, 'q');
                const state = optStr(args, 'state').toLowerCase();
                need(!state || state === 'enabled' || state === 'disabled',
                    `state is "enabled" or "disabled", not "${state}"`);
                const limit = Math.max(1, Number(optStr(args, 'limit') || 500));
                // Each of these names one `detail` field, compared case-blind
                // because the values are somebody else's JSON, not ours.
                const DETAIL_FILTERS: [string, string][] = [
                    ['event', 'event'], ['transport', 'transport'],
                    ['author', 'author'], ['marketplace', 'marketplace'], ['model', 'model']
                ];
                const wanted = DETAIL_FILTERS
                    .map(([arg, field]) => [field, optStr(args, arg)] as [string, string])
                    .filter(([, v]) => !!v);

                const inv = buildToolboxInventory(deps.getAgents(), deps.home);
                const items = inv.items.filter(it => {
                    if (kind && it.kind !== kind) { return false; }
                    if (scope && it.scope !== scope) { return false; }
                    if (agentId && it.agentId !== agentId) { return false; }
                    for (const [field, want] of wanted) {
                        if (String(it.detail[field] ?? '').toLowerCase() !== want.toLowerCase()) { return false; }
                    }
                    if (state) {
                        // A plugin says `enabled`, an MCP server says `disabled`
                        // — one word for the caller, whichever the row speaks.
                        const on = it.kind === 'plugin' ? it.detail.enabled === true : it.detail.disabled !== true;
                        if ((state === 'enabled') !== on) { return false; }
                    }
                    if (q && !queryMatches(
                        `${it.name} ${it.description} ${it.agentName ?? ''} ${JSON.stringify(it.detail ?? {})}`, q
                    )) { return false; }
                    return true;
                });
                return {
                    counts: inv.counts,
                    total: inv.items.length,
                    matched: items.length,
                    items: items.slice(0, limit).map(it => ({
                        kind: it.kind, name: it.name, scope: it.scope, agent: it.agentName,
                        description: it.description.slice(0, 200), source: it.source
                    }))
                };
            }
        },
        {
            op: 'toolbox.inspect',
            describe: 'One inventory item in full detail (frontmatter facts, masked definition, hook command…). args: kind, name, agent? (name|id — omit for user scope)',
            handler: (args) => {
                const kind = argStr(args, 'kind');
                const name = argStr(args, 'name');
                const agentRef = optStr(args, 'agent');
                const agentId = agentRef ? findAgent(agentRef).id : '';
                const inv = buildToolboxInventory(deps.getAgents(), deps.home);
                const matches = inv.items.filter(it =>
                    it.kind === kind && it.name === name &&
                    (agentId ? it.agentId === agentId : it.scope === 'user'));
                need(matches.length, `No ${kind} named "${name}" at ${agentId ? 'agent' : 'user'} scope — toolbox.list shows what exists.`);
                return matches;
            }
        },
        {
            op: 'toolbox.mcptools',
            describe: 'Connect to a configured MCP server and list its actual tools (name, description, params). Cached; pass refresh:true to re-probe. args: server, agent? (name|id — omit for user scope), refresh?',
            handler: async (args) => {
                const server = argStr(args, 'server');
                const agentRef = optStr(args, 'agent');
                const agent = agentRef ? findAgent(agentRef) : undefined;
                const key = probeCacheKey(agent ? 'agent' : 'user', agent?.id, server);
                const cache = loadProbeCache(deps.cacheFile);
                if (args.refresh !== true && cache[key]?.ok) { return { cached: true, ...cache[key] }; }
                const cfg = resolveServerConfig(server, agent, deps.home);
                need(cfg, `MCP server "${server}" not found at ${agent ? agent.name : 'user'} scope — toolbox.list kind:mcp shows what exists.`);
                const result: McpProbeResult = await probeMcpServer(cfg as McpServerConfig);
                cache[key] = result;
                saveProbeCache(deps.cacheFile, cache);
                return { cached: false, ...result };
            }
        }
    ]);
}
