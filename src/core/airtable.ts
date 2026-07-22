import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AirtableMcpConfig, parseConfig, parseJsonFile } from '../mcp/airtable/config';
import { checkInstances, discoverInstances, EngineClient, EngineInstance } from '../mcp/airtable/engine';
import { addUserMcpServer, readUserMcpServerRaw, removeUserMcpServer, userConfigJson } from './toolbox';
import { expandEnvPath } from './util';

/**
 * Airtable Engine module — the extension half of the integration.
 *
 * ONE source of truth: the module's own store file
 * `<globalStorage>/airtable-config.json`. The Airtable page edits it, the MCP
 * server re-reads it on every tool call — extension writes, server reads,
 * nothing in between. (The first build routed this through VS Code settings;
 * on the user's machine a settings write silently failed and the folder list
 * evaporated — a failure class this design removes entirely. Every write here
 * THROWS on failure so the UI can say what went wrong, never lose data
 * quietly.)
 *
 * Machine-independence is unchanged: stored paths may carry %VAR% / ${env:VAR}
 * tokens (expanded on read), the compiled MCP server is STAGED to a
 * version-independent globalStorage path, and the ~/.claude.json registration
 * uses ${APPDATA}-style tokens — an extension update or a machine change
 * breaks nothing.
 */

export const MCP_SERVER_NAME = 'airtable';
export const CONFIG_FILE_NAME = 'airtable-config.json';

// ---------------------------------------------------------------- store

export type AirtableStore = AirtableMcpConfig;

export function storePath(storageDir: string): string {
    return path.join(storageDir, CONFIG_FILE_NAME);
}

/** Read the store (tolerates the legacy `roots` key and a BOM; missing file = empty). */
export function loadStore(storageDir: string): AirtableStore {
    try {
        return parseConfig(parseJsonFile(storePath(storageDir)));
    } catch {
        return parseConfig(undefined);
    }
}

/** Merge a patch into the store and write it. THROWS on write failure —
 *  callers surface the reason instead of losing the change silently. */
export function saveStore(storageDir: string, patch: Partial<AirtableStore>): AirtableStore {
    const next = { ...loadStore(storageDir), ...patch };
    fs.mkdirSync(storageDir, { recursive: true });
    fs.writeFileSync(storePath(storageDir),
        JSON.stringify({ ...next, updatedAt: new Date().toISOString() }, null, 2) + '\n', 'utf8');
    return next;
}

/** Stored paths may carry env tokens — expand for THIS machine. */
export function expandedDatabaseRoots(store: AirtableStore): string[] {
    return store.databaseRoots.map(expandEnvPath);
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
        env: { AIRTABLE_MCP_CONFIG: tokenizeForClaude(storePath(storageDir)) }
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

// ---------------------------------------------------------------- page data

export interface AirtablePageData {
    store: AirtableStore;
    /** databaseRoots with env tokens expanded (index-parallel to store's) */
    expandedRoots: string[];
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

/** Everything the Airtable page can know synchronously (no network). */
export function airtablePageData(storageDir: string, extVersion: string, home = os.homedir()): AirtablePageData {
    const dir = stagingDir(storageDir);
    let version: string | undefined;
    try { version = fs.readFileSync(path.join(dir, '.version'), 'utf8').trim(); } catch { /* not staged */ }
    const store = loadStore(storageDir);
    return {
        store,
        expandedRoots: expandedDatabaseRoots(store),
        registration: registrationState(storageDir, home),
        staging: { dir, version: version ?? undefined, extensionVersion: extVersion },
        configFile: storePath(storageDir)
    };
}

/** Discover + health-check + stats for the page (async, network). */
export async function probeAirtableInstances(storageDir: string): Promise<AirtableInstanceRow[]> {
    const store = loadStore(storageDir);
    const found = discoverInstances(expandedDatabaseRoots(store));
    const checked = await checkInstances(found);
    return Promise.all(checked.map(async i => {
        const row: AirtableInstanceRow = {
            name: i.name, dir: i.dir, host: i.host, port: i.port,
            alive: i.alive, title: i.title, error: i.error,
            isDefault: !!store.defaultInstance && i.name.toLowerCase() === store.defaultInstance.toLowerCase(),
            url: `http://${i.host}:${i.port}/`
        };
        if (i.alive) {
            try { row.stats = await new EngineClient(i, 2500).stats(store.defaultLang || undefined); }
            catch { /* stats are cosmetic on the page */ }
        }
        return row;
    }));
}

/** What does this folder hold? Instances inside it — or is it one itself? */
export function validateDatabaseRoot(folder: string): { instances: EngineInstance[] } {
    return { instances: discoverInstances([expandEnvPath(folder)]) };
}
