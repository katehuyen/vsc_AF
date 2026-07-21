import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { airtableConfigFromSettings } from './airtableConfig';
import { SERVER_KEY, McpEntry, upsertServer } from './airtableRegisterCore';

export { SERVER_KEY } from './airtableRegisterCore';
export type { McpEntry } from './airtableRegisterCore';

/**
 * User-scope MCP registration for the Airtable engine module.
 *
 * The module ships inside the VSIX (out/mcp/airtable/index.js). We register it
 * once in ~/.claude.json under mcpServers.airtable so EVERY Claude Code agent
 * Agent Farm launches sees the airtable_* tools automatically. Because the script
 * lives under the versioned extension path, that path changes on every update —
 * so `syncAirtableRegistration` runs on activation and self-heals the entry (and
 * the resolved config it points at) whenever the path or settings drift.
 *
 * ~/.claude.json is the user's whole Claude config; every write is read-modify-
 * write, backed up once (.afbak), and touches ONLY mcpServers.airtable.
 */

type Dict = Record<string, unknown>;

export function claudeJsonPath(): string { return path.join(os.homedir(), '.claude.json'); }
export function resolvedConfigPath(context: vscode.ExtensionContext): string {
    return path.join(context.globalStorageUri.fsPath, 'airtable-config.json');
}
export function serverScriptPath(context: vscode.ExtensionContext): string {
    return path.join(context.extensionPath, 'out', 'mcp', 'airtable', 'index.js');
}

export function desiredEntry(context: vscode.ExtensionContext): McpEntry {
    return { command: 'node', args: [serverScriptPath(context)], env: { AIRTABLE_MCP_CONFIG: resolvedConfigPath(context) } };
}

/** Write the settings-resolved engine config where the MCP process reads it. */
export function writeResolvedConfig(context: vscode.ExtensionContext): string {
    const p = resolvedConfigPath(context);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(airtableConfigFromSettings(), null, 2) + '\n', 'utf8');
    return p;
}

/** Ensure ~/.claude.json points the airtable server at the shipped script + config. */
export function registerAirtableMcp(context: vscode.ExtensionContext): 'added' | 'updated' | 'unchanged' | 'skipped' {
    writeResolvedConfig(context);
    const file = claudeJsonPath();
    let json: Dict = {};
    if (fs.existsSync(file)) {
        try { json = JSON.parse(fs.readFileSync(file, 'utf8')) as Dict; }
        catch { return 'skipped'; } // never clobber a config we cannot parse
    }
    const { json: next, outcome } = upsertServer(json, SERVER_KEY, desiredEntry(context));
    if (outcome === 'unchanged') { return 'unchanged'; }
    const backup = file + '.afbak';
    if (fs.existsSync(file) && !fs.existsSync(backup)) { try { fs.copyFileSync(file, backup); } catch { /* best effort */ } }
    fs.writeFileSync(file, JSON.stringify(next, null, 2) + '\n', 'utf8');
    return outcome;
}

/** Remove the airtable server entry from ~/.claude.json. */
export function unregisterAirtableMcp(): 'removed' | 'absent' | 'skipped' {
    const file = claudeJsonPath();
    if (!fs.existsSync(file)) { return 'absent'; }
    let json: Dict;
    try { json = JSON.parse(fs.readFileSync(file, 'utf8')) as Dict; } catch { return 'skipped'; }
    const servers = json.mcpServers as Dict | undefined;
    if (!servers || !servers[SERVER_KEY]) { return 'absent'; }
    delete servers[SERVER_KEY];
    fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n', 'utf8');
    return 'removed';
}

/** Is the airtable server currently registered in ~/.claude.json? (state = the entry itself) */
export function isAirtableRegistered(): boolean {
    const file = claudeJsonPath();
    if (!fs.existsSync(file)) { return false; }
    try {
        const json = JSON.parse(fs.readFileSync(file, 'utf8')) as Dict;
        const servers = json.mcpServers as Dict | undefined;
        return !!(servers && servers[SERVER_KEY]);
    } catch { return false; }
}

/**
 * On activation / config change: keep the resolved config fresh and self-heal an
 * EXISTING registration (fix the versioned script path after an extension update).
 * Never auto-registers — the user opts in via the Toolbox button or command, and
 * the ~/.claude.json entry itself is the source of truth for "registered". No VS
 * Code setting is written, so this can never throw "not a registered configuration".
 */
export function syncAirtableRegistration(context: vscode.ExtensionContext): void {
    try {
        writeResolvedConfig(context);
        if (isAirtableRegistered()) { registerAirtableMcp(context); }
    } catch { /* never break activation */ }
}
