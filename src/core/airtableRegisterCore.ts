// Pure, vscode-free core of the Airtable MCP registration — kept separate from
// airtableRegister.ts (which imports vscode) so a plain Node test can exercise the
// ~/.claude.json upsert logic without the extension host.

export const SERVER_KEY = 'airtable';

export interface McpEntry { command: string; args: string[]; env: Record<string, string>; }
type Dict = Record<string, unknown>;

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
