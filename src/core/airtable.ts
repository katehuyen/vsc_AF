import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { AirtableMcpConfig, parseConfig } from '../mcp/airtable/config';
import { checkInstances, discoverInstances, EngineClient, EngineInstance } from '../mcp/airtable/engine';
import { addUserMcpServer, readUserMcpServerRaw, removeUserMcpServer, userConfigJson } from './toolbox';
import { expandEnvPath } from './util';

/**
 * Airtable Engine module — the extension half of the integration.
 *
 * Everything is settings-driven and machine-independent (a product, not a
 * one-machine hack):
 *  - `agentFarm.airtable.*` VS Code settings are the single source of truth
 *    the user sees and edits (paths may use %VAR% / ${env:VAR} tokens);
 *  - they are mirrored (expanded for THIS machine) into
 *    <globalStorage>/airtable-config.json, which the MCP server re-reads per
 *    call — so a settings change reaches agents without any restart;
 *  - the compiled MCP server is STAGED to <globalStorage>/mcp/airtable (a
 *    version-independent path) and ~/.claude.json registers that staged copy
 *    with ${APPDATA}/${USERPROFILE} tokens, so neither an extension update nor
 *    a machine change breaks the registration.
 */

export const MCP_SERVER_NAME = 'airtable';
export const CONFIG_FILE_NAME = 'airtable-config.json';

// ---------------------------------------------------------------- settings

export interface AirtableSettings extends AirtableMcpConfig {
    /** roots exactly as written in settings (tokens intact) — shown in the UI */
    rawDatabaseRoots: string[];
    rawMediaRoots: string[];
}

const cleanList = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map(x => x.trim()) : [];

export function airtableSettings(): AirtableSettings {
    const cfg = vscode.workspace.getConfiguration('agentFarm.airtable');
    const rawDatabaseRoots = cleanList(cfg.get('databaseRoots'));
    const rawMediaRoots = cleanList(cfg.get('mediaRoots'));
    return {
        rawDatabaseRoots,
        rawMediaRoots,
        databaseRoots: rawDatabaseRoots.map(expandEnvPath),
        mediaRoots: rawMediaRoots.map(expandEnvPath),
        defaultInstance: (cfg.get<string>('defaultInstance') ?? '').trim(),
        defaultLang: (cfg.get<string>('defaultLang') ?? '').trim(),
        requestTimeoutMs: cfg.get<number>('requestTimeoutMs') || 8000
    };
}

// ---------------------------------------------------------------- runtime config file

export function runtimeConfigPath(storageDir: string): string {
    return path.join(storageDir, CONFIG_FILE_NAME);
}

/** Mirror the settings (expanded) into the MCP config file. */
export function syncRuntimeConfig(storageDir: string): string {
    const s = airtableSettings();
    const file = runtimeConfigPath(storageDir);
    const body: AirtableMcpConfig & { updatedAt: string } = {
        databaseRoots: s.databaseRoots,
        mediaRoots: s.mediaRoots,
        defaultInstance: s.defaultInstance,
        defaultLang: s.defaultLang,
        requestTimeoutMs: s.requestTimeoutMs,
        updatedAt: new Date().toISOString()
    };
    fs.mkdirSync(storageDir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(body, null, 2) + '\n', 'utf8');
    return file;
}

/**
 * One-time migration: an earlier build kept the roots ONLY in the runtime
 * config file — invisible to the user ("how does it find my folders?!").
 * If the settings are still empty but that file has roots, lift them INTO the
 * settings, where they belong. Returns the migrated roots (caller notifies).
 */
export async function migrateLegacyConfig(storageDir: string): Promise<string[] | undefined> {
    const s = airtableSettings();
    if (s.rawDatabaseRoots.length) { return undefined; }
    let legacy: AirtableMcpConfig;
    try {
        legacy = parseConfig(JSON.parse(fs.readFileSync(runtimeConfigPath(storageDir), 'utf8')));
    } catch { return undefined; }
    if (!legacy.databaseRoots.length) { return undefined; }
    const cfg = vscode.workspace.getConfiguration('agentFarm.airtable');
    await cfg.update('databaseRoots', legacy.databaseRoots, vscode.ConfigurationTarget.Global);
    if (legacy.mediaRoots.length && !s.rawMediaRoots.length) {
        await cfg.update('mediaRoots', legacy.mediaRoots, vscode.ConfigurationTarget.Global);
    }
    if (legacy.defaultInstance && !s.defaultInstance) {
        await cfg.update('defaultInstance', legacy.defaultInstance, vscode.ConfigurationTarget.Global);
    }
    if (legacy.defaultLang && !s.defaultLang) {
        await cfg.update('defaultLang', legacy.defaultLang, vscode.ConfigurationTarget.Global);
    }
    return legacy.databaseRoots;
}

// ---------------------------------------------------------------- staging

export function stagingDir(storageDir: string): string {
    return path.join(storageDir, 'mcp', 'airtable');
}

export function stagedIndexJs(storageDir: string): string {
    return path.join(stagingDir(storageDir), 'index.js');
}

export interface StagingState {
    dir: string;
    version?: string;
    updated: boolean;
}

/**
 * Copy the compiled MCP server (out/mcp/airtable/*.js) into globalStorage so
 * the ~/.claude.json registration survives extension updates (the versioned
 * .vscode/extensions path changes every release — the staged path never does).
 */
export function stageMcpServer(extensionPath: string, storageDir: string, version: string): StagingState {
    const src = path.join(extensionPath, 'out', 'mcp', 'airtable');
    const dst = stagingDir(storageDir);
    const versionFile = path.join(dst, '.version');
    let current: string | undefined;
    try { current = fs.readFileSync(versionFile, 'utf8').trim(); } catch { /* not staged yet */ }
    if (current === version && fs.existsSync(path.join(dst, 'index.js'))) {
        return { dir: dst, version: current, updated: false };
    }
    fs.mkdirSync(dst, { recursive: true });
    for (const f of fs.readdirSync(src).filter(n => n.endsWith('.js'))) {
        fs.copyFileSync(path.join(src, f), path.join(dst, f));
    }
    fs.writeFileSync(versionFile, version, 'utf8');
    return { dir: dst, version, updated: true };
}

// ---------------------------------------------------------------- registration

/** Turn an absolute path into a machine-independent one using the ${VAR}
 *  syntax Claude Code expands in MCP definitions. Longest match wins. */
export function tokenizeForClaude(p: string, env: NodeJS.ProcessEnv = process.env): string {
    const candidates: [string, string][] = [];
    for (const name of ['APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'HOME']) {
        const v = env[name];
        if (v && v.length > 3) { candidates.push([name, v.replace(/[\\/]+$/, '')]); }
    }
    candidates.sort((a, b) => b[1].length - a[1].length);
    const norm = (s: string) => s.replace(/\\/g, '/').toLowerCase();
    for (const [name, root] of candidates) {
        if (norm(p).startsWith(norm(root))) {
            return '${' + name + '}' + p.slice(root.length);
        }
    }
    return p;
}

/** Expand ${VAR} (Claude's syntax) plus the settings syntaxes. */
export function expandClaudeVars(s: string, env: NodeJS.ProcessEnv = process.env): string {
    return expandEnvPath(s.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (m, v) => env[String(v)] ?? m));
}

export interface RegistrationDef {
    command: string;
    args: string[];
    env: Record<string, string>;
}

export function desiredRegistration(storageDir: string): RegistrationDef {
    return {
        command: 'node',
        args: [tokenizeForClaude(stagedIndexJs(storageDir))],
        env: { AIRTABLE_MCP_CONFIG: tokenizeForClaude(runtimeConfigPath(storageDir)) }
    };
}

export interface RegistrationState {
    registered: boolean;
    /** what ~/.claude.json currently says (raw) */
    current?: Record<string, unknown>;
    /** the registered server script path, tokens expanded for this machine */
    currentPath?: string;
    /** true when the registration already points at the staged copy */
    upToDate: boolean;
    configFile: string;
}

export function registrationState(storageDir: string, home = os.homedir()): RegistrationState {
    const configFile = userConfigJson(home);
    const current = readUserMcpServerRaw(MCP_SERVER_NAME, home);
    if (!current) { return { registered: false, upToDate: false, configFile }; }
    const args = Array.isArray(current.args) ? current.args.map(String) : [];
    const currentPath = args.length ? expandClaudeVars(args[args.length - 1]) : undefined;
    const norm = (s: string) => s.replace(/\\/g, '/').toLowerCase();
    const upToDate = !!currentPath && norm(currentPath) === norm(stagedIndexJs(storageDir));
    return { registered: true, current, currentPath, upToDate, configFile };
}

/** Register (or repoint) the user-scope MCP server. ~/.claude.json is the
 *  CLI's live state store: besides the helper's one-time .afbak, take a
 *  timestamped safety copy before OUR first write of a session. */
let backedUpThisSession = false;

export function registerMcp(storageDir: string, home = os.homedir()): boolean {
    const file = userConfigJson(home);
    if (!backedUpThisSession && fs.existsSync(file)) {
        try {
            fs.copyFileSync(file, file + '.airtable-bak');
            backedUpThisSession = true;
        } catch { /* backup is best-effort */ }
    }
    return addUserMcpServer(MCP_SERVER_NAME, desiredRegistration(storageDir) as unknown as Record<string, unknown>, home);
}

export function unregisterMcp(home = os.homedir()): boolean {
    return removeUserMcpServer(MCP_SERVER_NAME, home);
}

// ---------------------------------------------------------------- card data

export interface AirtableCardData {
    settings: AirtableSettings;
    registration: RegistrationState;
    staging: { dir: string; version?: string; extensionVersion: string };
    configFile: string;
    /** filled asynchronously by the instance probe */
    instances?: AirtableInstanceRow[];
}

export interface AirtableInstanceRow {
    name: string;
    dir: string;
    host: string;
    port: number;
    alive: boolean;
    title?: string;
    error?: string;
    isDefault: boolean;
    stats?: Record<string, unknown>;
    url: string;
}

/** Everything the Toolbox card can know synchronously (no network). */
export function airtableCardData(storageDir: string, extVersion: string, home = os.homedir()): AirtableCardData {
    const dir = stagingDir(storageDir);
    let version: string | undefined;
    try { version = fs.readFileSync(path.join(dir, '.version'), 'utf8').trim(); } catch { /* not staged */ }
    return {
        settings: airtableSettings(),
        registration: registrationState(storageDir, home),
        staging: { dir, version: version ?? undefined, extensionVersion: extVersion },
        configFile: runtimeConfigPath(storageDir)
    };
}

/** Discover + health-check + stats for the card (async, network). */
export async function probeAirtableInstances(): Promise<AirtableInstanceRow[]> {
    const s = airtableSettings();
    const found = discoverInstances(s.databaseRoots);
    const checked = await checkInstances(found);
    return Promise.all(checked.map(async i => {
        const row: AirtableInstanceRow = {
            name: i.name, dir: i.dir, host: i.host, port: i.port,
            alive: i.alive, title: i.title, error: i.error,
            isDefault: !!s.defaultInstance && i.name.toLowerCase() === s.defaultInstance.toLowerCase(),
            url: `http://${i.host}:${i.port}/`
        };
        if (i.alive) {
            try { row.stats = await new EngineClient(i, 2500).stats(s.defaultLang || undefined); }
            catch { /* stats are cosmetic on the card */ }
        }
        return row;
    }));
}

/** Does the folder actually look like an engine root (≥1 instance inside)? */
export function validateDatabaseRoot(folder: string): { instances: EngineInstance[] } {
    return { instances: discoverInstances([expandEnvPath(folder)]) };
}
