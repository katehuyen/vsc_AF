/**
 * Claude Code settings bridge — a curated, explained editor for the claude
 * CLI's own `~/.claude/settings.json` (the file behind terminal tips like
 * "Set CLAUDE_CODE_USE_POWERSHELL_TOOL=1 …").
 *
 * Principles (live product):
 *  - We only EDIT the exact path of a curated item; everything else in the
 *    file is preserved byte-for-byte in structure (parse → patch → pretty).
 *  - The catalog is deliberately small and honest: only keys/env vars we are
 *    confident about, each with a real explanation. Everything else is
 *    reachable through the raw JSON editor underneath (validated before write).
 *  - Clearing an item REMOVES the key — Claude's own default takes over, we
 *    never write a guessed default.
 */

export interface CCItem {
    id: string;                       // stable id for messages
    path: string[];                   // location in settings.json, e.g. ['env','MAX_THINKING_TOKENS']
    label: string;
    kind: 'string' | 'number' | 'boolean' | 'enum' | 'flag';  // flag = env-style "1" / absent
    enum?: string[];
    description: string;
}

export const CC_CATALOG: CCItem[] = [
    {
        id: 'model', path: ['model'], label: 'model', kind: 'string',
        description: 'Default model for new sessions — an alias (opus, sonnet) or a full model id. Not set = the CLI default. Sessions started with claude --model are unaffected.'
    },
    {
        id: 'defaultMode', path: ['permissions', 'defaultMode'], label: 'permissions.defaultMode', kind: 'enum',
        enum: ['default', 'acceptEdits', 'plan', 'bypassPermissions'],
        description: 'Permission mode new sessions start in: default asks per tool, acceptEdits auto-approves file edits, plan starts in plan mode, bypassPermissions skips all prompts (use with care).'
    },
    {
        id: 'includeCoAuthoredBy', path: ['includeCoAuthoredBy'], label: 'includeCoAuthoredBy', kind: 'boolean',
        description: 'Whether git commits made by claude carry the "Co-Authored-By: Claude" line. Claude default: on.'
    },
    {
        id: 'cleanupPeriodDays', path: ['cleanupPeriodDays'], label: 'cleanupPeriodDays', kind: 'number',
        description: 'How many days session transcripts are kept before Claude Code deletes them. Directly affects how far back Agent Farm\'s search, costs and analytics can see — raise it if you want longer history.'
    },
    {
        id: 'outputStyle', path: ['outputStyle'], label: 'outputStyle', kind: 'string',
        description: 'Named output style applied to sessions (as set by /output-style in the CLI).'
    },
    {
        id: 'psTool', path: ['env', 'CLAUDE_CODE_USE_POWERSHELL_TOOL'], label: 'env.CLAUDE_CODE_USE_POWERSHELL_TOOL', kind: 'flag',
        description: 'Enables the PowerShell tool (preview) — the exact switch behind the terminal tip "Set CLAUDE_CODE_USE_POWERSHELL_TOOL=1 …". On Windows, claude then drives PowerShell natively instead of translating through bash.'
    },
    {
        id: 'maxThinking', path: ['env', 'MAX_THINKING_TOKENS'], label: 'env.MAX_THINKING_TOKENS', kind: 'number',
        description: 'Thinking-token budget per request. Higher = deeper reasoning but slower and more expensive; not set = model default.'
    },
    {
        id: 'maxOutput', path: ['env', 'CLAUDE_CODE_MAX_OUTPUT_TOKENS'], label: 'env.CLAUDE_CODE_MAX_OUTPUT_TOKENS', kind: 'number',
        description: 'Cap on output tokens per response. Not set = model default.'
    },
    {
        id: 'bashTimeout', path: ['env', 'BASH_DEFAULT_TIMEOUT_MS'], label: 'env.BASH_DEFAULT_TIMEOUT_MS', kind: 'number',
        description: 'Default timeout (ms) for Bash tool commands that don\'t specify one.'
    },
    {
        id: 'bashMaxTimeout', path: ['env', 'BASH_MAX_TIMEOUT_MS'], label: 'env.BASH_MAX_TIMEOUT_MS', kind: 'number',
        description: 'Upper limit (ms) a session can request for a single Bash command.'
    },
    {
        id: 'noAutoUpdate', path: ['env', 'DISABLE_AUTOUPDATER'], label: 'env.DISABLE_AUTOUPDATER', kind: 'flag',
        description: 'Stops claude from auto-updating itself — useful when you pin a version that you know works with your hooks/tooling.'
    },
    {
        id: 'noTelemetry', path: ['env', 'DISABLE_TELEMETRY'], label: 'env.DISABLE_TELEMETRY', kind: 'flag',
        description: 'Opts out of usage telemetry (Statsig).'
    },
    {
        id: 'noNonessential', path: ['env', 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC'], label: 'env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC', kind: 'flag',
        description: 'One switch for all non-essential network traffic: telemetry, update checks, error reporting. The strictest of the three network flags.'
    }
];

type Json = Record<string, unknown>;

export function readPath(obj: unknown, path: string[]): unknown {
    let cur: unknown = obj;
    for (const p of path) {
        if (!cur || typeof cur !== 'object' || Array.isArray(cur)) { return undefined; }
        cur = (cur as Json)[p];
    }
    return cur;
}

export interface CCModelItem extends CCItem {
    value: unknown;                   // current value in the file (undefined = not set)
    set: boolean;
}

export function buildClaudeModel(json: unknown): CCModelItem[] {
    return CC_CATALOG.map(it => {
        const value = readPath(json, it.path);
        return { ...it, value, set: value !== undefined };
    });
}

/** Set (or with undefined: remove) one curated path. Returns a NEW object and
 *  never touches anything outside the path — empty parents are cleaned up on
 *  removal so we don't leave `"env": {}` litter behind. */
export function patchClaudeSettings(json: unknown, path: string[], value: unknown): Json {
    const root: Json = (json && typeof json === 'object' && !Array.isArray(json))
        ? JSON.parse(JSON.stringify(json)) as Json
        : {};
    let cur = root;
    for (let i = 0; i < path.length - 1; i++) {
        const k = path[i];
        if (!cur[k] || typeof cur[k] !== 'object' || Array.isArray(cur[k])) { cur[k] = {}; }
        cur = cur[k] as Json;
    }
    const leaf = path[path.length - 1];
    if (value === undefined) { delete cur[leaf]; } else { cur[leaf] = value; }
    // prune now-empty parent objects (only along our path)
    for (let cut = path.length - 1; cut >= 1; cut--) {
        let parent = root;
        for (let i = 0; i < cut - 1; i++) { parent = parent[path[i]] as Json; }
        const child = parent[path[cut - 1]];
        if (child && typeof child === 'object' && !Array.isArray(child) && Object.keys(child as Json).length === 0) {
            delete parent[path[cut - 1]];
        }
    }
    return root;
}

/** Turn a raw page value into the typed value for the file (undefined = clear). */
export function coerceClaudeValue(
    item: CCItem, raw: unknown
): { ok: true; value: unknown } | { ok: false; error: string } {
    if (raw === undefined || raw === null || raw === '') { return { ok: true, value: undefined }; }
    switch (item.kind) {
        case 'flag':
            // env flags: "1" when on, key removed when off
            return { ok: true, value: raw === true || raw === 'true' || raw === '1' ? '1' : undefined };
        case 'boolean':
            return { ok: true, value: raw === true || raw === 'true' };
        case 'number': {
            const n = Number(raw);
            if (!isFinite(n)) { return { ok: false, error: 'not a number' }; }
            // env vars must be strings in the file; top-level numbers stay numbers
            return { ok: true, value: item.path[0] === 'env' ? String(n) : n };
        }
        case 'enum': {
            const s = String(raw);
            if (item.enum && !item.enum.includes(s)) {
                return { ok: false, error: `must be one of: ${item.enum.join(', ')}` };
            }
            return { ok: true, value: s };
        }
        default:
            return { ok: true, value: String(raw) };
    }
}

/** Validate a raw settings.json replacement typed into the page. */
export function validateRawClaudeSettings(text: string): { ok: true; json: Json } | { ok: false; error: string } {
    try {
        const v = JSON.parse(text);
        if (!v || typeof v !== 'object' || Array.isArray(v)) {
            return { ok: false, error: 'settings.json must be a JSON object' };
        }
        return { ok: true, json: v as Json };
    } catch (e) {
        return { ok: false, error: 'invalid JSON: ' + String((e as Error).message).slice(0, 120) };
    }
}
