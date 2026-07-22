// Runtime configuration of the Airtable Engine MCP server.
//
// The server never guesses machine-specific paths: everything comes from ONE
// JSON file whose path arrives in the AIRTABLE_MCP_CONFIG environment variable.
// Agent Farm owns that file — it mirrors the user's `agentFarm.airtable.*`
// VS Code settings into it (paths already expanded to this machine) whenever
// they change. The file is re-read on every tool call, so a settings change in
// VS Code reaches a long-running server without a restart.

import * as fs from 'fs';

export interface AirtableMcpConfig {
    /** Folders that hold engine instances — every direct subfolder with a config.json is one deploy. */
    databaseRoots: string[];
    /** Media library folders (records reference files here by absolute path). */
    mediaRoots: string[];
    /** Instance used when a tool call names none ('' = the single live one). */
    defaultInstance: string;
    /** Language tree used when a call names none ('' = the engine's own default, TR). */
    defaultLang: string;
    requestTimeoutMs: number;
}

export const EMPTY_CONFIG: AirtableMcpConfig = {
    databaseRoots: [],
    mediaRoots: [],
    defaultInstance: '',
    defaultLang: '',
    requestTimeoutMs: 8000
};

const strings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map(x => x.trim()) : [];

/** Parse a config object read from disk; unknown/missing keys fall back to
 *  EMPTY_CONFIG. The legacy key `roots` (first prototype) still reads. */
export function parseConfig(raw: unknown): AirtableMcpConfig {
    if (!raw || typeof raw !== 'object') { return { ...EMPTY_CONFIG }; }
    const o = raw as Record<string, unknown>;
    return {
        databaseRoots: strings(o.databaseRoots ?? o.roots),
        mediaRoots: strings(o.mediaRoots),
        defaultInstance: typeof o.defaultInstance === 'string' ? o.defaultInstance.trim() : '',
        defaultLang: typeof o.defaultLang === 'string' ? o.defaultLang.trim() : '',
        requestTimeoutMs: typeof o.requestTimeoutMs === 'number' && o.requestTimeoutMs > 0
            ? o.requestTimeoutMs : EMPTY_CONFIG.requestTimeoutMs
    };
}

/** Parse JSON tolerating a UTF-8 BOM — the config file is hand/agent-editable
 *  and PowerShell's `utf8` writes one, which plain JSON.parse rejects. */
export function parseJsonFile(file: string): unknown {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

/** Read the config file fresh (path from AIRTABLE_MCP_CONFIG). Never throws. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AirtableMcpConfig {
    const file = env.AIRTABLE_MCP_CONFIG;
    if (!file) { return { ...EMPTY_CONFIG }; }
    try {
        return parseConfig(parseJsonFile(file));
    } catch {
        return { ...EMPTY_CONFIG };
    }
}

/** What an agent should tell the user when no database root is configured. */
export const NOT_CONFIGURED =
    'No Airtable Engine database folder is configured yet. '
    + 'Open VS Code → Agent Farm → Toolbox → "Airtable Engine" card and add the folder that holds '
    + 'your engine instances (each instance is a subfolder with its own config.json), '
    + 'or set `agentFarm.airtable.databaseRoots` in the settings directly.';
