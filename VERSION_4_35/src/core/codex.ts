import * as fs from 'fs';
import * as path from 'path';
import { safeReadFile } from './util';
import { AGENTS_MD_NAME, SyncResult } from './antigravity';

/**
 * Codex compatibility layer — the Codex-specific *extras* on top of the shared
 * Antigravity sync. It deliberately does NOT touch CLAUDE.md or AGENTS.md:
 *
 *   • Instruction file: Codex reads the SAME `AGENTS.md` (project root → cwd,
 *     plus a global ~/.codex/AGENTS.md) that the Antigravity sync already
 *     generates. One file serves both engines — no second instruction file,
 *     no second sidecar, no drift beyond the one the Antigravity state machine
 *     already reconciles.
 *   • Memory: plain markdown referenced from AGENTS.md — shared as-is.
 *   • Standing duties: conveyed through AGENTS.md prose (it points at
 *     DUTIES.md), so Codex needs no duty artifact of its own.
 *
 * The ONE real format gap is MCP: Antigravity reads JSON (~/.gemini/.../
 * mcp_config.json); Codex reads TOML (`[mcp_servers.X]` in config.toml). When
 * an agent has a project `.mcp.json`, we emit a merge-ready TOML snippet — we
 * never write into the user's live ~/.codex/config.toml ourselves (same
 * hands-off discipline the Antigravity MCP suggestion follows).
 *
 * Verified against the installed Codex `config.toml` (2026-07): Windows paths
 * are written as TOML *literal* strings (single quotes, no escaping); env and
 * headers are sub-tables (`[mcp_servers.X.env]`, `[mcp_servers.X.http_headers]`).
 */

/** Where the merge-ready Codex MCP snippet is dropped (never auto-applied). */
export const CODEX_MCP_SUGGESTED_REL = path.join('.agents', 'codex', 'mcp.suggested.toml');

interface McpServer {
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    // http/SSE transport (Claude .mcp.json shape)
    type?: string;
    url?: string;
    headers?: Record<string, string>;
}

/** TOML bare keys allow [A-Za-z0-9_-]; anything else must be quoted. */
function tomlKey(k: string): string {
    return /^[A-Za-z0-9_-]+$/.test(k) ? k : tomlString(k);
}

/**
 * Emit a TOML string value. Backslash-bearing values (Windows paths) become
 * *literal* strings ('...') so nothing is interpreted — matching how Codex
 * itself serializes them. Values already containing a single quote fall back
 * to a basic string with the two escapes TOML needs (\\ and \").
 */
function tomlString(v: string): string {
    if (v.includes("'") ) {
        return '"' + v.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
    }
    return "'" + v + "'";
}

function tomlArray(items: string[]): string {
    return '[' + items.map(tomlString).join(', ') + ']';
}

/**
 * Convert a Claude `.mcp.json` `mcpServers` map into Codex `config.toml`
 * `[mcp_servers.*]` blocks. Pure — returned string is a mergeable snippet.
 */
export function mcpJsonToCodexToml(mcpServers: Record<string, McpServer>): string {
    const blocks: string[] = [];
    for (const [name, cfg] of Object.entries(mcpServers)) {
        const head = `[mcp_servers.${tomlKey(name)}]`;
        const lines: string[] = [head];
        if (cfg.url) {
            lines.push(`url = ${tomlString(cfg.url)}`);
        } else if (cfg.command) {
            lines.push(`command = ${tomlString(cfg.command)}`);
            if (cfg.args && cfg.args.length) {
                lines.push(`args = ${tomlArray(cfg.args.map(String))}`);
            }
        }
        let block = lines.join('\n');
        if (cfg.command && cfg.env && Object.keys(cfg.env).length) {
            block += `\n\n[mcp_servers.${tomlKey(name)}.env]\n` +
                Object.entries(cfg.env).map(([k, val]) => `${tomlKey(k)} = ${tomlString(String(val))}`).join('\n');
        }
        if (cfg.url && cfg.headers && Object.keys(cfg.headers).length) {
            block += `\n\n[mcp_servers.${tomlKey(name)}.http_headers]\n` +
                Object.entries(cfg.headers).map(([k, val]) => `${tomlKey(k)} = ${tomlString(String(val))}`).join('\n');
        }
        blocks.push(block);
    }
    return blocks.join('\n\n') + '\n';
}

const SNIPPET_HEADER =
    '# agent-farm: Codex MCP snippet generated from this agent\'s .mcp.json.\n' +
    '# Merge these blocks into ~/.codex/config.toml (global) or this folder\'s\n' +
    '# .codex/config.toml (project-scoped, trusted projects only). Agent Farm\n' +
    '# never edits your live Codex config — you stay in control of the merge.\n\n';

/**
 * Codex-specific extras, layered on top of an already-run Antigravity sync.
 * Does not create or modify AGENTS.md — it only (a) confirms Codex will find
 * the shared AGENTS.md, and (b) emits the MCP TOML snippet when a project
 * .mcp.json exists. Safe to call every sync; idempotent.
 */
export function syncCodexExtras(agentDir: string): SyncResult {
    const result: SyncResult = { written: [], skipped: [], backups: [], notes: [] };

    const agentsPath = path.join(agentDir, AGENTS_MD_NAME);
    if (fs.existsSync(agentsPath)) {
        result.notes.push('Codex: reads the same AGENTS.md (project root → cwd, + global ~/.codex/AGENTS.md) — no separate instruction file needed.');
    } else {
        result.notes.push('Codex: AGENTS.md not found — run the Antigravity/Codex sync first so Codex has an instruction file to read.');
    }

    const mcpRaw = safeReadFile(path.join(agentDir, '.mcp.json'));
    if (mcpRaw) {
        try {
            const parsed = JSON.parse(mcpRaw) as { mcpServers?: Record<string, McpServer> };
            if (parsed.mcpServers && Object.keys(parsed.mcpServers).length) {
                const out = path.join(agentDir, CODEX_MCP_SUGGESTED_REL);
                fs.mkdirSync(path.dirname(out), { recursive: true });
                fs.writeFileSync(out, SNIPPET_HEADER + mcpJsonToCodexToml(parsed.mcpServers), 'utf8');
                result.written.push(CODEX_MCP_SUGGESTED_REL);
                result.notes.push(`Codex MCP: merge ${CODEX_MCP_SUGGESTED_REL} into ~/.codex/config.toml (or .codex/config.toml).`);
            }
        } catch {
            result.notes.push('Codex MCP: .mcp.json is not valid JSON — TOML snippet skipped.');
        }
    }
    // No .mcp.json → nothing to emit; MCP is configured globally in ~/.codex/config.toml.

    return result;
}
