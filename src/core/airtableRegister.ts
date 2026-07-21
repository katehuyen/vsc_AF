import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { airtableConfigFromSettings } from './airtableConfig';
import { SERVER_KEY, McpEntry, upsertServer, tokenizePath } from './airtableRegisterCore';

export { SERVER_KEY } from './airtableRegisterCore';
export type { McpEntry } from './airtableRegisterCore';

/**
 * User-scope MCP registration for the Airtable engine module — MACHINE-PORTABLE.
 *
 * Two problems with pointing ~/.claude.json straight at the extension folder:
 *   1. that path carries the username + the extension VERSION (…/muvusoft.agent-farm-2.87.0/…),
 *      so it breaks on every update and on every other machine;
 *   2. the user syncs ~/.claude.json across machines, so a hardcoded absolute path is wrong there.
 *
 * So instead we STAGE the shipped server into a version-STABLE dir under globalStorage
 * and register a path with the home prefix tokenized as ${USERPROFILE}/${HOME} — which
 * Claude Code expands per machine (verified: ${VAR} expansion works in command/args of a
 * user-scoped ~/.claude.json entry). The engine config is passed with a --config arg (also
 * tokenized), not a hardcoded env value. The staged entry therefore stays identical across
 * versions and machines; only the staged files are refreshed when the extension version bumps.
 *
 * Every ~/.claude.json write is read-modify-write, backed up once (.afbak), touches ONLY
 * mcpServers.airtable, and writes NO VS Code setting (so it can never throw
 * "not a registered configuration").
 */

type Dict = Record<string, unknown>;
const SERVER_FILES = ['index.js', 'engine.js', 'media.js', 'sentence.js', 'tools.js', 'imagesize.js'];

export function claudeJsonPath(): string { return path.join(os.homedir(), '.claude.json'); }

/** Shipped server inside the (versioned) extension — copy source + the "can register" probe. */
export function serverScriptPath(context: vscode.ExtensionContext): string {
    return path.join(context.extensionPath, 'out', 'mcp', 'airtable', 'index.js');
}

/** Version-STABLE staged copy under globalStorage — its path does not change on update. */
export function stagedDir(context: vscode.ExtensionContext): string {
    return path.join(context.globalStorageUri.fsPath, 'airtable-mcp');
}
export function stagedServerPath(context: vscode.ExtensionContext): string {
    return path.join(stagedDir(context), 'index.js');
}
export function stagedConfigPath(context: vscode.ExtensionContext): string {
    return path.join(stagedDir(context), 'config.json');
}

function extVersion(context: vscode.ExtensionContext): string {
    const v = (context.extension?.packageJSON as { version?: string } | undefined)?.version;
    if (v) { return v; }
    try {
        return (JSON.parse(fs.readFileSync(path.join(context.extensionPath, 'package.json'), 'utf8')) as { version?: string }).version || 'dev';
    } catch { return 'dev'; }
}

/** Copy the shipped server into the stable staged dir; refresh only when the version changed. */
export function stageServer(context: vscode.ExtensionContext): void {
    const src = path.join(context.extensionPath, 'out', 'mcp', 'airtable');
    const dst = stagedDir(context);
    const marker = path.join(dst, '.version');
    const version = extVersion(context);
    let current = '';
    try { current = fs.readFileSync(marker, 'utf8'); } catch { /* not staged yet */ }
    if (current === version && fs.existsSync(stagedServerPath(context))) { return; }
    fs.mkdirSync(dst, { recursive: true });
    for (const f of SERVER_FILES) {
        try { fs.copyFileSync(path.join(src, f), path.join(dst, f)); } catch { /* absent in a partial build */ }
    }
    try { fs.writeFileSync(marker, version, 'utf8'); } catch { /* best effort */ }
}

/** Portable entry: node <staged index> --config <staged config>, home prefix tokenized. */
export function desiredEntry(context: vscode.ExtensionContext): McpEntry {
    const home = os.homedir();
    return {
        command: 'node',
        args: [
            tokenizePath(stagedServerPath(context), home, process.platform),
            '--config',
            tokenizePath(stagedConfigPath(context), home, process.platform)
        ]
    };
}

/** Write the settings-resolved engine config next to the staged server. */
export function writeResolvedConfig(context: vscode.ExtensionContext): string {
    const p = stagedConfigPath(context);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(airtableConfigFromSettings(), null, 2) + '\n', 'utf8');
    return p;
}

/** Ensure ~/.claude.json points the airtable server at the staged script + config. */
export function registerAirtableMcp(context: vscode.ExtensionContext): 'added' | 'updated' | 'unchanged' | 'skipped' {
    stageServer(context);
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
 * On activation / config change: refresh the staged server (when the version bumped),
 * keep the staged config fresh, and self-heal an EXISTING registration. Because the staged
 * path is version-stable and tokenized, the ~/.claude.json entry normally stays byte-identical
 * across updates — self-heal mostly just re-stages the code. Never auto-registers.
 */
export function syncAirtableRegistration(context: vscode.ExtensionContext): void {
    try {
        stageServer(context);
        writeResolvedConfig(context);
        if (isAirtableRegistered()) { registerAirtableMcp(context); }
    } catch { /* never break activation */ }
}
