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

/** Approximate last-used time per server: newest session that called it. */
export function mcpLastUsed(index: SessionIndex, agentId: string): Map<string, number> {
    const last = new Map<string, number>();
    for (const session of index.forAgent(agentId)) {
        for (const tool of Object.keys(session.tools)) {
            const m = /^mcp__([^_]+(?:_[^_]+)*?)__/.exec(tool);
            if (m) { last.set(m[1], Math.max(last.get(m[1]) ?? 0, session.lastTs)); }
        }
    }
    return last;
}

/** Per-tool call counts of one server (30d), most used first — the detail behind the row. */
export function mcpToolBreakdown(index: SessionIndex, agentId: string, serverName: string, sinceMs: number): { tool: string; calls: number }[] {
    const cutoff = Date.now() - sinceMs;
    const prefix = `mcp__${serverName}__`;
    const counts = new Map<string, number>();
    for (const session of index.forAgent(agentId)) {
        if (session.lastTs < cutoff) { continue; }
        for (const [tool, count] of Object.entries(session.tools)) {
            if (tool.startsWith(prefix)) {
                const short = tool.slice(prefix.length);
                counts.set(short, (counts.get(short) ?? 0) + count);
            }
        }
    }
    return [...counts.entries()]
        .map(([tool, calls]) => ({ tool, calls }))
        .sort((a, b) => b.calls - a.calls);
}

/** Servers turned off for this agent via disabledMcpjsonServers (same key Claude Code honors). */
export function readDisabledServers(agent: AgentInfo): Set<string> {
    const out = new Set<string>();
    for (const name of ['settings.local.json', 'settings.json']) {
        const file = path.join(agent.dir, '.claude', name);
        if (!fs.existsSync(file)) { continue; }
        try {
            const json = JSON.parse(fs.readFileSync(file, 'utf8')) as { disabledMcpjsonServers?: string[] };
            for (const s of json.disabledMcpjsonServers ?? []) { out.add(s); }
        } catch { /* unreadable settings */ }
    }
    return out;
}

/** Toggle a server in the agent's .claude/settings.local.json disabledMcpjsonServers list. */
export function setServerDisabled(agent: AgentInfo, serverName: string, disabled: boolean): string {
    const dir = path.join(agent.dir, '.claude');
    const file = path.join(dir, 'settings.local.json');
    let json: { disabledMcpjsonServers?: string[]; [k: string]: unknown } = {};
    if (fs.existsSync(file)) {
        try { json = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { json = {}; }
    }
    const list = new Set(json.disabledMcpjsonServers ?? []);
    if (disabled) { list.add(serverName); } else { list.delete(serverName); }
    if (list.size) { json.disabledMcpjsonServers = [...list].sort(); }
    else { delete json.disabledMcpjsonServers; }
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n', 'utf8');
    return file;
}

/** Full raw definition of a server from its source file (for edit/copy). */
export function readServerRawDef(server: McpServerDef): Record<string, unknown> | undefined {
    try {
        const json = JSON.parse(fs.readFileSync(server.source, 'utf8')) as McpServersJson;
        return json.mcpServers?.[server.name] as Record<string, unknown> | undefined;
    } catch {
        return undefined;
    }
}

/** Replace a server's definition in its source file (with a one-time backup). */
export function updateMcpServer(server: McpServerDef, def: Record<string, unknown>): boolean {
    try {
        const raw = fs.readFileSync(server.source, 'utf8');
        const json = JSON.parse(raw) as McpServersJson;
        if (!json.mcpServers?.[server.name]) { return false; }
        const backup = server.source + '.afbak';
        if (!fs.existsSync(backup)) { fs.copyFileSync(server.source, backup); }
        json.mcpServers[server.name] = def as NonNullable<McpServersJson['mcpServers']>[string];
        fs.writeFileSync(server.source, JSON.stringify(json, null, 2) + '\n', 'utf8');
        return true;
    } catch {
        return false;
    }
}

/** Copy a server definition into another agent's .mcp.json (fleet management). */
export function copyMcpServerTo(server: McpServerDef, target: AgentInfo): string | undefined {
    const def = readServerRawDef(server);
    if (!def) { return undefined; }
    return addMcpServer(target, server.name, def as { command?: string; url?: string; type?: string });
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
