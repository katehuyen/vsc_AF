import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** Marker embedded in the hook URL so we can find/update/remove our own entries. */
export const HOOK_MARKER = 'agentfarm-live';

const TOOL_EVENTS = ['PreToolUse', 'PostToolUse'];
const PLAIN_EVENTS = [
    'UserPromptSubmit', 'Notification', 'Stop', 'SubagentStop',
    'SessionStart', 'SessionEnd', 'PreCompact'
];
export const ALL_HOOK_EVENTS = [...TOOL_EVENTS, ...PLAIN_EVENTS];

export function hookCommand(port: number): string {
    // curl ships with Windows 10+/macOS/Linux. -m 3 keeps a dead listener from
    // ever blocking the agent; "|| cd ." forces exit code 0 in cmd, bash and sh.
    return `curl -s -m 3 -X POST "http://127.0.0.1:${port}/event?src=${HOOK_MARKER}" ` +
        `-H "Content-Type: application/json" --data-binary @- || cd .`;
}

interface HookEntry {
    matcher?: string;
    hooks?: { type?: string; command?: string; [k: string]: unknown }[];
    [k: string]: unknown;
}

interface SettingsShape {
    hooks?: Record<string, HookEntry[]>;
    [k: string]: unknown;
}

export function userSettingsPath(claudeDir?: string): string {
    return path.join(claudeDir ?? path.join(os.homedir(), '.claude'), 'settings.json');
}

export interface InstallResult {
    file: string;
    ok: boolean;
    action: 'installed' | 'updated' | 'failed';
    error?: string;
}

function readSettings(file: string): SettingsShape | undefined {
    if (!fs.existsSync(file)) { return {}; }
    try {
        const raw = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
        if (!raw.trim()) { return {}; }
        const json = JSON.parse(raw);
        return typeof json === 'object' && json !== null ? json as SettingsShape : undefined;
    } catch {
        return undefined; // unparseable — never clobber
    }
}

function isOurs(entry: HookEntry): boolean {
    return (entry.hooks ?? []).some(h => typeof h.command === 'string' && h.command.includes(HOOK_MARKER));
}

/** Merge our hook entries into a settings file. Backs the file up once, never removes foreign entries. */
export function installHooksInto(file: string, port: number): InstallResult {
    const settings = readSettings(file);
    if (!settings) {
        return { file, ok: false, action: 'failed', error: 'file is not valid JSON — fix or remove it first' };
    }

    if (fs.existsSync(file)) {
        const backup = file + '.agentfarm-bak';
        if (!fs.existsSync(backup)) {
            try { fs.copyFileSync(file, backup); } catch { /* backup is best-effort */ }
        }
    }

    const hooks: Record<string, HookEntry[]> =
        (settings.hooks && typeof settings.hooks === 'object') ? settings.hooks : {};
    settings.hooks = hooks;

    const command = hookCommand(port);
    let hadOurs = false;

    for (const event of ALL_HOOK_EVENTS) {
        const list: HookEntry[] = Array.isArray(hooks[event]) ? hooks[event] : [];
        hooks[event] = list;
        const existing = list.find(isOurs);
        if (existing) {
            hadOurs = true;
            existing.hooks = (existing.hooks ?? []).map(h =>
                typeof h.command === 'string' && h.command.includes(HOOK_MARKER)
                    ? { ...h, command }
                    : h
            );
            if (TOOL_EVENTS.includes(event)) { existing.matcher = existing.matcher ?? '*'; }
        } else {
            const entry: HookEntry = TOOL_EVENTS.includes(event)
                ? { matcher: '*', hooks: [{ type: 'command', command }] }
                : { hooks: [{ type: 'command', command }] };
            list.push(entry);
        }
    }

    try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(settings, null, 2) + '\n', 'utf8');
        return { file, ok: true, action: hadOurs ? 'updated' : 'installed' };
    } catch (e) {
        return { file, ok: false, action: 'failed', error: String(e) };
    }
}

/** Remove every hook entry carrying our marker from a settings file. */
export function removeHooksFrom(file: string): InstallResult | undefined {
    if (!fs.existsSync(file)) { return undefined; }
    const settings = readSettings(file);
    if (!settings || !settings.hooks) { return undefined; }

    let touched = false;
    for (const event of Object.keys(settings.hooks)) {
        const list = settings.hooks[event];
        if (!Array.isArray(list)) { continue; }
        const kept: HookEntry[] = [];
        for (const entry of list) {
            if (!isOurs(entry)) { kept.push(entry); continue; }
            touched = true;
            const foreign = (entry.hooks ?? []).filter(h =>
                !(typeof h.command === 'string' && h.command.includes(HOOK_MARKER)));
            if (foreign.length) { kept.push({ ...entry, hooks: foreign }); }
        }
        if (kept.length) { settings.hooks[event] = kept; }
        else { delete settings.hooks[event]; }
    }
    if (!touched) { return undefined; }
    if (Object.keys(settings.hooks).length === 0) { delete settings.hooks; }

    try {
        fs.writeFileSync(file, JSON.stringify(settings, null, 2) + '\n', 'utf8');
        return { file, ok: true, action: 'updated' };
    } catch (e) {
        return { file, ok: false, action: 'failed', error: String(e) };
    }
}

/** True if the file already contains our hooks. */
export function hasOurHooks(file: string): boolean {
    const settings = readSettings(file);
    if (!settings?.hooks) { return false; }
    return Object.values(settings.hooks).some(list =>
        Array.isArray(list) && list.some(isOurs));
}
