/**
 * ‼️ X-84 — ONE DOOR FOR `agentFarm.*`, AND EVERY READER GOES THROUGH IT.
 *
 * VS Code can hand back `undefined` for a key its own manifest declares, so
 * this build falls back to reading the settings file. That fallback used to be
 * visible only to the Settings page and the bridge, while the ~200 readers that
 * actually ACT on a setting went straight to `getConfiguration('agentFarm')` —
 * a dropped key would show as applied on the page and be silently ignored by
 * the engine. That split is the bug; this module is the door that closes it.
 *
 * What it owes the registry it stands in for is in `settingsops.ts`
 * (`schemaCheck`, `readSettingScoped`): the files the running window really
 * writes, the same folder → workspace → user precedence, and the manifest's own
 * declared types — a wrongly typed entry is REFUSED with a reason, never cast.
 *
 * `install()` is called once, first thing in `activate()`. Until it is, the
 * door still works: it falls back to the platform's default settings.json and
 * checks nothing, which is exactly what this build did before.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { readSettingScoped, schemaCheck, SettingsScope, userFolderFromGlobalStorage } from './settingsops';

/** VS Code's own user settings.json — the file its Settings editor writes on a
 *  default-profile, non-portable install. The last resort, not the first. */
export function vscodeUserSettingsFile(): string {
    if (process.platform === 'win32') {
        return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
            'Code', 'User', 'settings.json');
    }
    if (process.platform === 'darwin') {
        return path.join(os.homedir(), 'Library', 'Application Support', 'Code', 'User', 'settings.json');
    }
    return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'),
        'Code', 'User', 'settings.json');
}

/** Re-read only when the file itself moved — `settingsCategories()` asks for
 *  124 keys in a row and every one of them would otherwise hit the disk. */
const textCache = new Map<string, { mtime: number; text: string }>();
function fileText(file: string): string {
    try {
        const st = fs.statSync(file);
        const hit = textCache.get(file);
        if (hit && hit.mtime === st.mtimeMs) { return hit.text; }
        const text = fs.readFileSync(file, 'utf8');
        textCache.set(file, { mtime: st.mtimeMs, text });
        return text;
    } catch { textCache.delete(file); return ''; }
}

let chain: SettingsScope[] = [];
let schemaProps: Record<string, { type?: string | string[]; enum?: unknown[] }> = {};
let userFolder: string | undefined;

/**
 * The files the RUNNING window would write, in VS Code's own precedence order.
 * `userFolder` is derived from `context.globalStorageUri`, so a named profile,
 * an Insiders build, a portable install and a remote user-data root all resolve
 * without a platform guess.
 */
function rebuildChain(): void {
    const next: SettingsScope[] = [];
    for (const f of vscode.workspace.workspaceFolders ?? []) {
        if (f.uri.scheme === 'file') { next.push({ file: path.join(f.uri.fsPath, '.vscode', 'settings.json') }); }
    }
    const wsFile = vscode.workspace.workspaceFile;
    if (wsFile && wsFile.scheme === 'file' && wsFile.fsPath.endsWith('.code-workspace')) {
        next.push({ file: wsFile.fsPath, nested: 'settings' });
    }
    next.push({ file: userFolder ? path.join(userFolder, 'settings.json') : vscodeUserSettingsFile() });
    chain = next;
    textCache.clear();
}

/** Called once, before the first setting is read. */
export function installSettingsDoor(context: vscode.ExtensionContext): void {
    const conf = (context.extension.packageJSON as {
        contributes?: {
            configuration?: { properties?: Record<string, never> } | { properties?: Record<string, never> }[];
        };
    }).contributes?.configuration;
    schemaProps = (Array.isArray(conf)
        ? Object.assign({}, ...conf.map(c => c.properties ?? {}))
        : conf?.properties ?? {}) as typeof schemaProps;
    userFolder = userFolderFromGlobalStorage(context.globalStorageUri.fsPath);
    rebuildChain();
    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => rebuildChain()));
}

/** The scope chain as it stands — for the settings page's "where does this
 *  actually come from" answer, and for the tests. */
export function settingsScopeChain(): SettingsScope[] {
    return chain.length ? chain.slice() : [{ file: vscodeUserSettingsFile() }];
}

/**
 * Why the file value for a key was NOT used. A refusal that only happens is a
 * silent second opinion; the Settings page reads this back so a wrongly typed
 * entry says so on its row instead of vanishing into the default.
 */
const refusals = new Map<string, string>();
export function cfgRefusal(key: string): string | undefined { return refusals.get(key); }

/**
 * ONE DOOR for reading an Agent Farm setting: the configuration registry first,
 * then the settings files the running window writes, for a key this build
 * declares and the registry dropped.
 */
export function cfgValueRaw(key: string): unknown {
    const v = vscode.workspace.getConfiguration().get(key);
    if (v !== undefined) { refusals.delete(key); return v; }
    const hit = readSettingScoped(settingsScopeChain(), fileText, key);
    if (!hit.found) { refusals.delete(key); return undefined; }
    const checked = schemaCheck(schemaProps[key], hit.value);
    if (!checked.ok) {
        refusals.set(key, `${path.basename(hit.file || '')}: ${checked.reason} — using the default`);
        return undefined;
    }
    refusals.delete(key);
    return checked.value;
}

export function cfgValue<T>(key: string, fallback: T): T {
    const v = cfgValueRaw(key);
    return v === undefined ? fallback : v as T;
}

/**
 * The `agentFarm` section, section-scoped onto the same door. Reads resolve
 * through `cfgValueRaw`; writes and `inspect` stay with the real configuration,
 * which is the only thing that can perform them.
 */
export interface AFConfig {
    get<T>(key: string): T | undefined;
    get<T>(key: string, fallback: T): T;
    update(key: string, value: unknown, target?: vscode.ConfigurationTarget | boolean): Thenable<void>;
    inspect<T>(key: string): ReturnType<vscode.WorkspaceConfiguration['inspect']>;
}

export function afConfig(): AFConfig {
    return {
        get: (<T>(key: string, fallback?: T) => {
            const v = cfgValueRaw('agentFarm.' + key);
            return (v === undefined ? fallback : v) as T;
        }) as AFConfig['get'],
        update: (key, value, target) =>
            vscode.workspace.getConfiguration('agentFarm').update(key, value, target),
        inspect: <T>(key: string) =>
            vscode.workspace.getConfiguration('agentFarm').inspect<T>(key)
    };
}
