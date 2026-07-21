import { AgentInfo } from './agents';
import { argStr, BridgeRegistry, need, optStr } from './bridge';
import { readAgentMcpServers, readServerRawDef } from './mcp';
import { loadProbeCache, McpProbeResult, McpServerConfig, probeMcpServer, saveProbeCache } from './mcpProbe';
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
            describe: 'Installed Claude extensions inventory (skills, subagents, commands, MCP, hooks, plugins, output styles, settings files) at user + agent scope. args: kind? (' + TOOLBOX_KINDS.join('|') + '), scope? (user|agent), agent? (name|id)',
            handler: (args) => {
                const kind = optStr(args, 'kind');
                need(!kind || TOOLBOX_KINDS.includes(kind as ToolboxKind),
                    `Unknown kind "${kind}" — one of: ${TOOLBOX_KINDS.join(', ')}`);
                const scope = optStr(args, 'scope');
                const agentRef = optStr(args, 'agent');
                const agentId = agentRef ? findAgent(agentRef).id : '';
                const inv = buildToolboxInventory(deps.getAgents(), deps.home);
                const items = inv.items.filter(it =>
                    (!kind || it.kind === kind) &&
                    (!scope || it.scope === scope) &&
                    (!agentId || it.agentId === agentId));
                return {
                    counts: inv.counts,
                    items: items.map(it => ({
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
