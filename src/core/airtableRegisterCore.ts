// Pure, vscode-free core of the Airtable MCP registration — kept separate from
// airtableRegister.ts (which imports vscode) so a plain Node test can exercise the
// ~/.claude.json upsert logic without the extension host.

export const SERVER_KEY = 'airtable';

export interface McpEntry { command: string; args: string[]; env?: Record<string, string>; }
type Dict = Record<string, unknown>;

/** The env-var token Claude Code expands in command/args for a portable home path. */
export function homeToken(platform: string): string {
    return platform === 'win32' ? '${USERPROFILE}' : '${HOME}';
}

/**
 * Rewrite an absolute path under the home directory as a ${USERPROFILE}/${HOME}
 * relative path so the entry we write into ~/.claude.json is machine-independent
 * (Claude Code expands the token per machine). Paths outside home are returned
 * as-is (forward-slashed). Never hardcode a username or drive we can tokenize.
 */
export function tokenizePath(abs: string, home: string, platform: string): string {
    const norm = String(abs || '').replace(/\\/g, '/');
    const h = String(home || '').replace(/\\/g, '/').replace(/\/+$/, '');
    if (!h) { return norm; }
    if (norm.toLowerCase() === h.toLowerCase()) { return homeToken(platform); }
    if (norm.toLowerCase().startsWith(h.toLowerCase() + '/')) {
        return homeToken(platform) + norm.slice(h.length);
    }
    return norm;
}

/** Insert or update mcpServers[key], leaving every other key untouched. */
export function upsertServer(json: Dict, key: string, want: McpEntry): { json: Dict; outcome: 'added' | 'updated' | 'unchanged' } {
    const servers = (json.mcpServers && typeof json.mcpServers === 'object' ? json.mcpServers : {}) as Dict;
    const cur = servers[key];
    if (cur && JSON.stringify(cur) === JSON.stringify(want)) { return { json, outcome: 'unchanged' }; }
    const outcome: 'added' | 'updated' = cur ? 'updated' : 'added';
    servers[key] = want as unknown as Dict;
    json.mcpServers = servers;
    return { json, outcome };
}
