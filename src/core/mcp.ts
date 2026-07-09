import * as fs from 'fs';
import * as path from 'path';
import { AgentInfo } from './agents';
import { SessionIndex } from './sessions';

/**
 * B1 — MCP inventory: which agent is wired to which external capability,
 * read from the same config files Claude Code reads, plus REAL usage counts
 * aggregated from transcripts (mcp__<server>__<tool> calls).
 */

export interface McpServerDef {
    name: string;
    /** config file that defines it */
    source: string;
    transport: 'stdio' | 'http' | 'sse' | 'unknown';
    commandOrUrl: string;
}

interface McpServersJson {
    mcpServers?: Record<string, {
        command?: string;
        args?: string[];
        url?: string;
        type?: string;
        transport?: string;
    }>;
}

function readServersFrom(file: string): McpServerDef[] {
    if (!fs.existsSync(file)) { return []; }
    try {
        const json = JSON.parse(fs.readFileSync(file, 'utf8')) as McpServersJson;
        if (!json.mcpServers) { return []; }
        return Object.entries(json.mcpServers).map(([name, def]) => {
            const transport = (def.type ?? def.transport ??
                (def.url ? 'http' : def.command ? 'stdio' : 'unknown')) as McpServerDef['transport'];
            return {
                name,
                source: file,
                transport: ['stdio', 'http', 'sse'].includes(transport) ? transport : 'unknown',
                commandOrUrl: def.url ?? [def.command, ...(def.args ?? [])].filter(Boolean).join(' ')
            };
        });
    } catch {
        return [];
    }
}

/** Config files that can define MCP servers for an agent (project scope). */
export function agentMcpConfigFiles(agent: AgentInfo): string[] {
    return [
        path.join(agent.dir, '.mcp.json'),
        path.join(agent.dir, '.claude', 'settings.json'),
        path.join(agent.dir, '.claude', 'settings.local.json')
    ];
}

export function readAgentMcpServers(agent: AgentInfo): McpServerDef[] {
    const out: McpServerDef[] = [];
    const seen = new Set<string>();
    for (const file of agentMcpConfigFiles(agent)) {
        for (const server of readServersFrom(file)) {
            if (!seen.has(server.name)) {
                seen.add(server.name);
                out.push(server);
            }
        }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Real usage: mcp__<server>__<tool> call counts from an agent's sessions. */
export function mcpUsage(index: SessionIndex, agentId: string, sinceMs: number): Map<string, number> {
    const cutoff = Date.now() - sinceMs;
    const usage = new Map<string, number>();
    for (const session of index.forAgent(agentId)) {
        if (session.lastTs < cutoff) { continue; }
        for (const [tool, count] of Object.entries(session.tools)) {
            const m = /^mcp__([^_]+(?:_[^_]+)*?)__/.exec(tool);
            if (m) {
                usage.set(m[1], (usage.get(m[1]) ?? 0) + count);
            }
        }
    }
    return usage;
}

/** Add a server to the agent's .mcp.json (created if missing). */
export function addMcpServer(
    agent: AgentInfo,
    name: string,
    def: { command?: string; url?: string; type?: string }
): string {
    const file = path.join(agent.dir, '.mcp.json');
    let json: McpServersJson = {};
    if (fs.existsSync(file)) {
        try { json = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { json = {}; }
    }
    json.mcpServers = json.mcpServers ?? {};
    json.mcpServers[name] = def;
    fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n', 'utf8');
    return file;
}

/** Remove a server from its source file (with a one-time backup). */
export function removeMcpServer(server: McpServerDef): boolean {
    try {
        const raw = fs.readFileSync(server.source, 'utf8');
        const json = JSON.parse(raw) as McpServersJson;
        if (!json.mcpServers?.[server.name]) { return false; }
        const backup = server.source + '.afbak';
        if (!fs.existsSync(backup)) { fs.copyFileSync(server.source, backup); }
        delete json.mcpServers[server.name];
        fs.writeFileSync(server.source, JSON.stringify(json, null, 2) + '\n', 'utf8');
        return true;
    } catch {
        return false;
    }
}
