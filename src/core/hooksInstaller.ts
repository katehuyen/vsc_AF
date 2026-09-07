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

/**
 * ‼️ X-208 — WHICH SHELL WILL RUN THE HOOK. Not a preference: the same string
 * cannot work in all of them, and each way it fails is silent.
 */
export type HookShell = 'posix' | 'powershell';

/**
 * ‼️ X-208 — ONE HOOK, TWO SPELLINGS, AND WINDOWS POWERSHELL BREAKS ALL THREE
 * PARTS OF THE OTHER ONE.
 *
 * The line below is what every engine's hook file has carried, and it works in
 * sh, bash and cmd — measured. Under **Windows PowerShell 5.1** it fails three
 * separate times, and only the first of them was ever reported:
 *
 *   1. `||` IS NOT A STATEMENT SEPARATOR THERE. It is a PARSE error, so the
 *      command never runs at all and the engine reports the hook as failed
 *      (measured: "The token '||' is not a valid statement separator in this
 *      version"). Codex's Stop hook has been failing on exactly this.
 *   2. ‼️ `curl` IS NOT CURL. In Windows PowerShell 5.1 it is an ALIAS for
 *      `Invoke-WebRequest`, which is handed curl's flags and does something
 *      else entirely. Fixing (1) alone leaves the hook calling the wrong tool.
 *   3. ‼️ `@-` IS THE SPLATTING OPERATOR. Unquoted, PowerShell eats it before
 *      curl sees it: measured, the process exits 1 and **the body never
 *      arrives** — the worst of the three, because a hook that posts nothing
 *      while its shell reports success is a listener that has simply gone quiet.
 *
 * So the PowerShell spelling names the executable, quotes the dash, and forces
 * the exit code with `; exit 0` — measured to both parse AND deliver, with a
 * dead listener still leaving exit 0.
 *
 * ‼️ AND `; exit 0` IS NOT THE ONE TO STANDARDISE ON. Under **cmd** it exits 0
 * and posts NOTHING (measured) — cmd hands `;` to curl as an argument. That is
 * why there are two spellings and not one: every candidate for a single string
 * is silently wrong in some shell that really runs these.
 */
/**
 * ‼️ X-265 — WHY THE TIMEOUT IS TWO NUMBERS AND NOT ONE.
 *
 * `-m 3` was there to stop a dead listener blocking the agent, and it never
 * did that job: the listener is on 127.0.0.1, so when nothing is bound the
 * connection is REFUSED in about a millisecond and no timeout is involved.
 * What three seconds actually cut off was a listener that IS there and busy —
 * measured on this machine 2026-09-07: 0.28-0.54s with the extension host
 * idle, 6.7s under load. So the one case the limit ever fired on was the case
 * worth waiting for, and it failed SILENTLY (`|| cd .` swallows exit 28), which
 * is how a timeline can be empty while hundreds of tool calls run.
 *
 * `--connect-timeout 2` is the honest guard: it bounds the only hang a dead
 * listener can really cause — a socket bound but not accepting — while `-m 15`
 * lets a busy host answer. A hook is blocking, so the worst case is a tool
 * call that waits fifteen seconds for a host that has stopped answering at
 * all; the trade the other way was losing every event on a working one.
 */
export function hookCommand(port: number, shell: HookShell = 'posix'): string {
    const rest = `-s --connect-timeout 2 -m 15 `
        + `-X POST "http://127.0.0.1:${port}/event?src=${HOOK_MARKER}" `
        + '-H "Content-Type: application/json" --data-binary ';
    return shell === 'powershell'
        ? `curl.exe ${rest}'@-' ; exit 0`
        : `curl ${rest}@- || cd .`;
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

/**
 * ‼️ X-265 — IS THE HOOK IN THIS FILE THE ONE WE WOULD WRITE TODAY?
 *
 * `hasOurHooks` answers "is any of ours in here", which was enough while there
 * was one file a person installed by hand. A sync that runs BY ITSELF needs the
 * sharper question, or it rewrites every settings file on every activation —
 * and a file rewritten for nothing is a file that can be lost for nothing.
 * Every event must be present AND carry the current command: a changed port is
 * exactly the case where the marker is there and the hook posts into the void.
 */
export function hooksAreCurrent(file: string, port: number): boolean {
    const settings = readSettings(file);
    if (!settings?.hooks) { return false; }
    const want = hookCommand(port);
    for (const event of ALL_HOOK_EVENTS) {
        const list = settings.hooks[event];
        if (!Array.isArray(list)) { return false; }
        const ours = list.find(isOurs);
        if (!ours) { return false; }
        if (!(ours.hooks ?? []).some(h => h.command === want)) { return false; }
    }
    return true;
}

/**
 * ‼️ X-265 — EVERY CAPTURED ACCOUNT KEEPS THE USER'S HOOK STATE, because the
 * isolation is what took it away.
 *
 * `CLAUDE_CONFIG_DIR` moves which `settings.json` the engine reads. A slot
 * directory holds the sign-in and nothing else, so every session started on a
 * captured account has run with NO hooks — measured 2026-09-07: the Live
 * Timeline had not logged one Claude event since accounts shipped, while the
 * page went on drawing confidently. Nobody did anything wrong; the feature that
 * broke this one never knew this file existed.
 *
 * Three rules, each one a decision somebody could otherwise reverse by accident:
 *
 *   · ‼️ THE USER FILE DECIDES. If the main settings file does not carry our
 *     hooks, nothing is written anywhere. Somebody who removed them meant to,
 *     and seeding them into the slots would be this system overruling a person
 *     quietly.
 *   · ‼️ A SLOT WITH NO SETTINGS FILE IS SEEDED FROM THE USER'S, not given a
 *     hooks-only stub. The isolation lost their model and their permission mode
 *     too; restoring the hooks alone would leave an account that reports its
 *     work faithfully and does it under different rules.
 *   · IDEMPOTENT. A file already carrying today's command is left untouched, so
 *     this may be called on every activation and after every capture.
 */
export function syncHooksToAccounts(
    userFile: string, slotFiles: string[], port: number
): InstallResult[] {
    if (!hasOurHooks(userFile)) { return []; }
    const out: InstallResult[] = [];
    for (const file of slotFiles) {
        if (hooksAreCurrent(file, port)) { continue; }
        if (!fs.existsSync(file) && fs.existsSync(userFile)) {
            try {
                fs.mkdirSync(path.dirname(file), { recursive: true });
                fs.copyFileSync(userFile, file);
            } catch { /* installHooksInto still writes a usable file below */ }
        }
        out.push(installHooksInto(file, port));
    }
    return out;
}
