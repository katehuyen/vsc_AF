import * as crypto from 'crypto';

/**
 * ‼️ X-295 — CODEX'S HOOK TRUST, REPRODUCED SO A DIRECTORY AGENT FARM MADE CAN
 * BE SIGNED THE WAY CODEX ITSELF SIGNS ONE.
 *
 * Codex runs no hook without a persisted trust record: `config.toml` holds
 * `[hooks.state.'<hooks.json path>:<event>:<group>:<handler>'] trusted_hash =
 * "sha256:…"`, and the key is the hook file's path AS THE ENGINE RESOLVES IT
 * (symlinks followed — measured 2026-09-13: `~/.codex` is a link on this
 * machine and Codex keyed by the target, so a record naming `~` matched
 * nothing). The hash is not of the file and not of the command: it is the
 * SHA-256 of the canonical JSON of one normalized hook identity —
 * `{event_name, matcher?, hooks:[{type, command, timeout, async, …}]}` —
 * which is why the same command under seven events yields seven hashes and
 * why the path is NOT in it. Read from `codex-rs/hooks/src/engine/discovery.rs`
 * (`hook_hash`) and `codex-rs/config/src/fingerprint.rs` (`version_for_toml`)
 * at rust-v0.149.0, and pinned in `test/test_codex_hooks.js` against the seven
 * values `codex app-server` → `hooks/list` reported on the real machine.
 *
 * Everything here is text in, text out. Nothing reads a disk.
 */

/** `hook_event_key_label` — Codex's own label for each event key in `hooks.json`. */
export const CODEX_EVENT_LABELS: Readonly<Record<string, string>> = {
    PreToolUse: 'pre_tool_use', PermissionRequest: 'permission_request', PostToolUse: 'post_tool_use',
    PreCompact: 'pre_compact', PostCompact: 'post_compact', SessionStart: 'session_start',
    SessionEnd: 'session_end', UserPromptSubmit: 'user_prompt_submit', SubagentStart: 'subagent_start',
    SubagentStop: 'subagent_stop', Stop: 'stop', Interrupt: 'interrupt'
};
/** `matcher_pattern_for_event` — these two events carry no matcher whatever the file says. */
const NO_MATCHER = new Set(['user_prompt_submit', 'stop']);
/** the events that may emit additionalContext; the limit is dropped everywhere else */
const CONTEXT_EVENTS = new Set(['pre_tool_use', 'post_tool_use', 'session_start', 'user_prompt_submit', 'subagent_start']);
const DEFAULT_TIMEOUT_SEC = 600;
const SESSION_END_DEFAULT_TIMEOUT_SEC = 1;
const SESSION_END_MAX_TIMEOUT_SEC = 3;
const DEFAULT_HOOK_OUTPUT_TOKEN_LIMIT = 2500;

export interface CodexHookHandler {
    type?: string;
    command?: string;
    commandWindows?: string;
    command_windows?: string;
    timeout?: number;
    async?: boolean;
    statusMessage?: string;
    additionalContextLimit?: number;
}

export interface CodexHookEntry {
    /** the `hooks.state` key: `<hooks.json path>:<event label>:<group>:<handler>` */
    key: string;
    /** `sha256:<hex>` — what Codex will compute for this handler */
    hash: string;
    event: string;
    command: string;
}

const canonical = (v: unknown): unknown => {
    if (Array.isArray(v)) { return v.map(canonical); }
    if (v && typeof v === 'object') {
        const o = v as Record<string, unknown>;
        return Object.fromEntries(Object.keys(o).sort().map(k => [k, canonical(o[k])]));
    }
    return v;
};

/** `hook_hash` for one command handler, after Codex's own normalization. */
export function codexHookHash(
    event: string, matcher: string | undefined, handler: CodexHookHandler, windows = process.platform === 'win32'
): string {
    const win = handler.commandWindows ?? handler.command_windows;
    const command = windows && win !== undefined ? win : (handler.command ?? '');
    const raw = typeof handler.timeout === 'number' ? handler.timeout : undefined;
    const timeout = event === 'session_end'
        ? Math.min(Math.max(raw ?? SESSION_END_DEFAULT_TIMEOUT_SEC, 1), SESSION_END_MAX_TIMEOUT_SEC)
        : Math.max(raw ?? DEFAULT_TIMEOUT_SEC, 1);
    const id: Record<string, unknown> = {
        type: 'command', command, timeout, async: !!handler.async
    };
    if (typeof handler.statusMessage === 'string') { id.statusMessage = handler.statusMessage; }
    const limit = CONTEXT_EVENTS.has(event) ? handler.additionalContextLimit : undefined;
    if (typeof limit === 'number' && limit !== DEFAULT_HOOK_OUTPUT_TOKEN_LIMIT) { id.additionalContextLimit = limit; }
    const identity: Record<string, unknown> = { event_name: event, hooks: [id] };
    const m = NO_MATCHER.has(event) ? undefined : matcher;
    if (m !== undefined && m !== null) { identity.matcher = m; }
    const hex = crypto.createHash('sha256').update(JSON.stringify(canonical(identity))).digest('hex');
    return `sha256:${hex}`;
}

/**
 * Every command hook a `hooks.json` declares, with the key and hash Codex will
 * look for. `hooksPath` is the file's path as Codex resolves it. Indexes count
 * every group and every handler, skipped ones included — that is how Codex
 * numbers them. Handlers that are not commands are not ours to sign.
 */
export function codexHookEntries(hooksJsonText: string, hooksPath: string, windows?: boolean): CodexHookEntry[] {
    let root: unknown;
    try { root = JSON.parse(hooksJsonText); } catch { return []; }
    const hooks = root && typeof root === 'object' ? (root as Record<string, unknown>).hooks : undefined;
    if (!hooks || typeof hooks !== 'object') { return []; }
    const out: CodexHookEntry[] = [];
    for (const [eventKey, groups] of Object.entries(hooks as Record<string, unknown>)) {
        const event = CODEX_EVENT_LABELS[eventKey];
        if (!event || !Array.isArray(groups)) { continue; }
        groups.forEach((group, gi) => {
            if (!group || typeof group !== 'object') { return; }
            const g = group as { matcher?: unknown; hooks?: unknown };
            const matcher = typeof g.matcher === 'string' ? g.matcher : undefined;
            if (!Array.isArray(g.hooks)) { return; }
            g.hooks.forEach((h, hi) => {
                if (!h || typeof h !== 'object') { return; }
                const handler = h as CodexHookHandler;
                if ((handler.type ?? 'command') !== 'command') { return; }
                const win = handler.commandWindows ?? handler.command_windows;
                const command = (windows ?? process.platform === 'win32') && win !== undefined ? win : (handler.command ?? '');
                if (!command.trim()) { return; }
                out.push({
                    key: `${hooksPath}:${event}:${gi}:${hi}`,
                    hash: codexHookHash(event, matcher, handler, windows),
                    event, command
                });
            });
        });
    }
    return out;
}

/** the live-events port a hook command posts to, when it is one of ours */
export function codexHookPort(command: string): number | undefined {
    const m = /127\.0\.0\.1:(\d+)\/event/.exec(command);
    return m ? Number(m[1]) : undefined;
}

const HEADER = /^\s*\[\s*hooks\s*\.\s*state\s*\.\s*(?:'([^']*)'|"((?:\\.|[^"\\])*)")\s*\]\s*(?:#.*)?$/;
const ANY_HEADER = /^\s*\[/;
const TRUSTED = /^\s*trusted_hash\s*=\s*"([^"]*)"/;

const unquote = (m: RegExpExecArray): string =>
    m[1] !== undefined ? m[1] : m[2].replace(/\\(.)/g, '$1');
const quoteKey = (key: string): string =>
    key.includes('\'') ? `"${key.replace(/[\\"]/g, c => '\\' + c)}"` : `'${key}'`;

interface Block { key: string; start: number; end: number; }

const blocksOf = (lines: string[]): Block[] => {
    const out: Block[] = [];
    for (let i = 0; i < lines.length; i++) {
        const m = HEADER.exec(lines[i]);
        if (!m) { continue; }
        let end = i + 1;
        while (end < lines.length && !ANY_HEADER.test(lines[end])) { end++; }
        out.push({ key: unquote(m), start: i, end });
    }
    return out;
};

/** what a `config.toml` trusts right now: key → `trusted_hash` */
export function codexTrustLedger(configToml: string): Map<string, string> {
    const lines = configToml.split(/\r?\n/);
    const out = new Map<string, string>();
    for (const b of blocksOf(lines)) {
        for (let i = b.start + 1; i < b.end; i++) {
            const t = TRUSTED.exec(lines[i]);
            if (t) { out.set(b.key, t[1]); break; }
        }
    }
    return out;
}

/**
 * The same text with every entry trusted: a block that exists gets its hash
 * put right in place, one that does not is appended. Nothing else in the file
 * is touched — not a byte, not the line endings — so the user's model, MCP
 * servers and plugin choices survive exactly as they were written.
 */
export function upsertCodexTrust(configToml: string, entries: { key: string; hash: string }[]): string {
    if (!entries.length) { return configToml; }
    const nl = configToml.includes('\r\n') ? '\r\n' : '\n';
    const lines = configToml === '' ? [] : configToml.split(/\r?\n/);
    for (const e of entries) {
        const block = blocksOf(lines).find(b => b.key === e.key);
        const line = `trusted_hash = "${e.hash}"`;
        if (block) {
            let at = -1;
            for (let i = block.start + 1; i < block.end; i++) { if (TRUSTED.test(lines[i])) { at = i; break; } }
            if (at >= 0) { if (TRUSTED.exec(lines[at])![1] !== e.hash) { lines[at] = line; } }
            else { lines.splice(block.start + 1, 0, line); }
            continue;
        }
        const header = `[hooks.state.${quoteKey(e.key)}]`;
        if (lines.length && lines[lines.length - 1] === '') {
            const tail = lines.length >= 2 && lines[lines.length - 2] === '' ? [] : [''];
            lines.splice(lines.length - 1, 0, ...tail, header, line);
        } else {
            lines.push(...(lines.length ? [''] : []), header, line, '');
        }
    }
    return lines.join(nl);
}

/**
 * ‼️ WHAT A DIRECTORY'S `config.toml` SHOULD SAY: the text it is projected from,
 * with every hook of `hooksJsonText` trusted under `hooksPath` — plus whatever
 * the directory had ALREADY trusted on its own. An answer the user gave inside
 * a session (a project hook trusted at the TUI) is not revoked by a gate; that
 * is X-291's rule, and it holds for a trust record as it holds for a
 * permission. A record keyed for THIS path with an old hash is replaced, not
 * kept: the hook changed and the fleet's copy is what is trusted now.
 */
export function codexTrustProjection(
    source: string, have: string | undefined, hooksJsonText: string | undefined, hooksPath: string, windows?: boolean
): string {
    const entries = hooksJsonText ? codexHookEntries(hooksJsonText, hooksPath, windows) : [];
    let out = upsertCodexTrust(source, entries);
    if (have) {
        const mine = codexTrustLedger(out);
        const theirs = codexTrustLedger(have);
        const kept = [...theirs].filter(([k]) => !mine.has(k)).map(([key, hash]) => ({ key, hash }));
        out = upsertCodexTrust(out, kept);
    }
    return out;
}
