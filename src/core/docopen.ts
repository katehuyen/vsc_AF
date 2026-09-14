import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { obsidianRegistryPath as registryPathFor } from './vaultDiscovery';

/**
 * Doc-open modes — the shared "open with" capability behind the report/answer
 * .md links in BOTH the Notices and Work-Queue boards. A report notice or an
 * answer/cevap item links a markdown file that lives in the Obsidian vault
 * (10_REPORT / 01_CEVAPLAR); until now clicking it always dumped the RAW,
 * unrendered markdown into a VS Code editor. This module lets the user pick how
 * such a file opens — with a per-user DEFAULT plus per-click overrides.
 *
 * Where the setting lives — the module-store pattern (NOT a VS Code settings
 * leak): the choice is a small JSON file in the extension's own globalStorage
 * (doc-open-config.json), the same discipline the Airtable Engine uses. It is
 * deliberately kept OUT of the schema-driven agentFarm.* settings page because
 * it is a UI convenience the two panels own, not farm-wide behaviour — and the
 * "custom app" command is machine-specific, which does not belong in the
 * git-synced settings surface.
 *
 * Pure node module (fs only) so it stays unit-testable; the vscode-side "how do
 * I actually launch this" lives in panels/openDoc.ts, which consumes this.
 */

export type DocOpenMode = 'vscode' | 'preview' | 'obsidian' | 'custom';
export const DOC_OPEN_MODES: DocOpenMode[] = ['vscode', 'preview', 'obsidian', 'custom'];

/** Human labels for the dropdown / QuickPick (English — UI is always English). */
export const DOC_OPEN_LABELS: Record<DocOpenMode, string> = {
    vscode: 'VS Code (raw markdown)',
    preview: 'Markdown preview (rendered)',
    obsidian: 'Obsidian (rendered in your vault)',
    custom: 'Custom external app'
};

export interface DocOpenConfig {
    /** The mode used when the user clicks the main button (no override). */
    defaultMode: DocOpenMode;
    /** Custom-app executable/command (only used by mode 'custom'). */
    customCommand: string;
    /** Custom-app argument template; {file} is replaced by the absolute path.
     *  Whitespace-separated tokens become argv entries — {file} stays ONE arg
     *  even when the path contains spaces (no shell, injection-safe). */
    customArgs: string;
}

export const DEFAULT_DOC_OPEN_CONFIG: DocOpenConfig = {
    defaultMode: 'vscode',
    customCommand: '',
    customArgs: '{file}'
};

export function coerceMode(v: unknown, fallback: DocOpenMode = 'vscode'): DocOpenMode {
    const s = String(v ?? '').toLowerCase();
    return (DOC_OPEN_MODES as string[]).includes(s) ? s as DocOpenMode : fallback;
}

/** Normalise a raw object read from disk into a full config (missing keys →
 *  defaults). Never throws. */
export function parseDocOpenConfig(raw: unknown): DocOpenConfig {
    if (!raw || typeof raw !== 'object') { return { ...DEFAULT_DOC_OPEN_CONFIG }; }
    const o = raw as Record<string, unknown>;
    return {
        defaultMode: coerceMode(o.defaultMode),
        customCommand: typeof o.customCommand === 'string' ? o.customCommand.trim().slice(0, 500) : '',
        customArgs: typeof o.customArgs === 'string' && o.customArgs.trim()
            ? o.customArgs.slice(0, 500) : DEFAULT_DOC_OPEN_CONFIG.customArgs
    };
}

/** Build the obsidian:// URI that opens a vault file RENDERED in Obsidian. The
 *  `path` form takes the absolute filesystem path and lets Obsidian resolve
 *  which registered vault holds it — so no vault name has to be configured.
 *  Backslashes are normalised to forward slashes for a clean URI. */
export function obsidianUri(absPath: string): string {
    const p = String(absPath || '').replace(/\\/g, '/');
    return 'obsidian://open?path=' + encodeURIComponent(p);
}

// ---------------------------------------------------------------------------
// opening Obsidian AT A LINE
// ---------------------------------------------------------------------------

/**
 * Where Obsidian keeps the list of vaults it knows. Read-only, and a missing
 * file is not an error — it just means we cannot name a vault and the caller
 * falls back to the plain `obsidian://open?path=`.
 *
 * The per-platform spelling lives in `vaultDiscovery` (X-308), which reads the
 * same file to answer what `${vault}` is: one registry, one path function.
 */
function obsidianRegistryPath(): string {
    return registryPathFor({
        platform: process.platform, appData: process.env.APPDATA, home: os.homedir()
    });
}

const samePath = (a: string, b: string): boolean =>
    path.resolve(a).replace(/[\\/]+$/, '').toLowerCase()
    === path.resolve(b).replace(/[\\/]+$/, '').toLowerCase();

export interface ObsidianVault {
    /** The folder that holds `.obsidian`. */
    root: string;
    /** The vault's folder name — what Obsidian shows, and accepted as `vault=`. */
    name: string;
    /** Obsidian's own id for it, from obsidian.json. Preferred over the name:
     *  it survives the folder being renamed, and it is unambiguous. */
    id?: string;
}

/**
 * Which vault a file belongs to — found by walking UP to the folder that holds
 * `.obsidian`, then matched against Obsidian's own registry for its id.
 *
 * ‼️ The vault has to be NAMED and it cannot be guessed from "whichever is
 * open": measured on this machine, TWO vaults are open at once, and an
 * `obsidian://adv-uri` with no vault lands in whichever one Obsidian last
 * touched — i.e. it silently opens the wrong file about half the time.
 */
export function obsidianVaultOf(absPath: string): ObsidianVault | undefined {
    let dir = path.dirname(path.resolve(String(absPath || '')));
    for (let up = 0; up < 40; up++) {
        try {
            if (fs.existsSync(path.join(dir, '.obsidian'))) { break; }
        } catch { /* unreadable — treat as not it */ }
        const parent = path.dirname(dir);
        if (parent === dir) { return undefined; }
        dir = parent;
    }
    if (!fs.existsSync(path.join(dir, '.obsidian'))) { return undefined; }
    const out: ObsidianVault = { root: dir, name: path.basename(dir) };
    try {
        const reg = JSON.parse(fs.readFileSync(obsidianRegistryPath(), 'utf8').replace(/^\uFEFF/, ''));
        const vaults = (reg && reg.vaults) as Record<string, { path?: string }> | undefined;
        for (const [id, v] of Object.entries(vaults ?? {})) {
            if (v && typeof v.path === 'string' && samePath(v.path, dir)) { out.id = id; break; }
        }
    } catch { /* no registry, or unreadable — the folder name still works */ }
    return out;
}

/** Is the Advanced URI plugin installed AND enabled in this vault? Without it
 *  `obsidian://adv-uri` is answered by nobody, so the caller must know rather
 *  than fire a URI into the void. */
export function hasAdvancedUri(vaultRoot: string): boolean {
    try {
        if (!fs.existsSync(path.join(vaultRoot, '.obsidian', 'plugins', 'obsidian-advanced-uri', 'main.js'))) {
            return false;
        }
        const list = JSON.parse(fs.readFileSync(
            path.join(vaultRoot, '.obsidian', 'community-plugins.json'), 'utf8').replace(/^\uFEFF/, ''));
        return Array.isArray(list) && list.includes('obsidian-advanced-uri');
    } catch { return false; }
}

/**
 * The URI that opens a vault file in Obsidian WITH THE CURSOR ON A LINE.
 *
 * Obsidian's own `open` action has no line parameter; the Advanced URI community
 * plugin does, and it takes `filepath` relative to the vault root plus a 1-BASED
 * `line` (it does `setCursor({ line: line - 1 })`). `column=1` goes along
 * deliberately: with no column the plugin computes `Math.min(NaN, …)` and the
 * cursor lands nowhere.
 *
 * Returns undefined when the file is not in a vault, or the plugin is not there
 * — the caller then opens the file the ordinary way, which is the honest failure.
 */
export function obsidianLineUri(absPath: string, line1: number): string | undefined {
    if (!Number.isFinite(line1) || line1 < 1) { return undefined; }
    const vault = obsidianVaultOf(absPath);
    if (!vault || !hasAdvancedUri(vault.root)) { return undefined; }
    const rel = path.relative(vault.root, path.resolve(absPath)).replace(/\\/g, '/');
    if (!rel || rel.startsWith('..')) { return undefined; }
    const q = [
        'vault=' + encodeURIComponent(vault.id ?? vault.name),
        'filepath=' + encodeURIComponent(rel),
        'line=' + Math.floor(line1),
        'column=1'
    ].join('&');
    return 'obsidian://adv-uri?' + q;
}

/**
 * Turn a custom-app argument TEMPLATE into an argv array for a no-shell spawn.
 *
 * Tokens split on whitespace; every `{file}` occurrence in a token is replaced by
 * the absolute path, so `{file}` yields the path as a SINGLE argv entry (spaces
 * safe) and `--foo={file}` stays one entry too. An empty template falls back to
 * just the file.
 *
 * `{line}` is the same idea for a line number — `+{line} {file}` (vim),
 * `-n{line} {file}` (Notepad++), `--goto {file}:{line}` (VS Code). When there is
 * no line to give, a token that asked only for the line is DROPPED rather than
 * passed empty (`+` alone is an argument some editors take badly), and a
 * separator left dangling on a token that also carries the file is trimmed —
 * `{file}:{line}` must not become `C:\x.md:`.
 */
export function buildCustomArgv(template: string, file: string, line?: number): string[] {
    const t = (template && template.trim()) ? template.trim() : '{file}';
    const has = Number.isFinite(line) && (line as number) >= 1;
    const tokens: string[] = [];
    for (const raw of t.split(/\s+/).filter(Boolean)) {
        const wantsLine = raw.indexOf('{line}') >= 0;
        const wantsFile = raw.indexOf('{file}') >= 0;
        if (wantsLine && !has && !wantsFile) { continue; }
        let tok = raw.split('{file}').join(file);
        tok = tok.split('{line}').join(has ? String(Math.floor(line as number)) : '');
        if (wantsLine && !has) { tok = tok.replace(/[:+,=|#]+$/, ''); }
        if (tok) { tokens.push(tok); }
    }
    // Guarantee the file reaches the app even if the template forgot {file}.
    return tokens.some(tok => tok.indexOf(file) >= 0) ? tokens : [...tokens, file];
}

/**
 * The module's single source of truth — one JSON file in globalStorage. The two
 * panels read the default through this; a change is picked up on the next
 * render (no restart). BOM-tolerant read: the file is hand/agent-editable and
 * PowerShell's utf8 writes a BOM that plain JSON.parse rejects.
 */
export class DocOpenStore {
    private cfg: DocOpenConfig = { ...DEFAULT_DOC_OPEN_CONFIG };

    constructor(private file: string) { this.load(); }

    load(): void {
        try {
            const raw = JSON.parse(fs.readFileSync(this.file, 'utf8').replace(/^\uFEFF/, ''));
            this.cfg = parseDocOpenConfig(raw);
        } catch { this.cfg = { ...DEFAULT_DOC_OPEN_CONFIG }; }
    }

    get(): DocOpenConfig { return { ...this.cfg }; }

    /** Patch any subset of the config; unknown/absent keys are left untouched.
     *  Returns the resulting config. */
    set(patch: Partial<{ defaultMode: string; customCommand: string; customArgs: string }>): DocOpenConfig {
        if (patch.defaultMode !== undefined) { this.cfg.defaultMode = coerceMode(patch.defaultMode, this.cfg.defaultMode); }
        if (patch.customCommand !== undefined) { this.cfg.customCommand = String(patch.customCommand).trim().slice(0, 500); }
        if (patch.customArgs !== undefined) {
            const a = String(patch.customArgs);
            this.cfg.customArgs = a.trim() ? a.slice(0, 500) : DEFAULT_DOC_OPEN_CONFIG.customArgs;
        }
        this.save();
        return this.get();
    }

    private save(): void {
        try {
            fs.writeFileSync(this.file, JSON.stringify(this.cfg, null, 2), 'utf8');
        } catch { /* best-effort — a failed write just keeps the old default */ }
    }
}

// ---------------------------------------------------------------------------
// bridge (constitution §19.C) — the open-mode setting is user-triggerable from
// the panel dropdown, so an agent can read/set it too.
// ---------------------------------------------------------------------------

import { argStr, BridgeRegistry, optStr } from './bridge';

export interface DocOpenOpsDeps {
    store: DocOpenStore;
    onChange?: () => void;
}

export function registerDocOpenOps(bridge: BridgeRegistry, deps: DocOpenOpsDeps): void {
    const changed = () => { try { deps.onChange?.(); } catch { /* UI best-effort */ } };
    bridge.register([
        {
            op: 'docopen.get',
            describe: 'Read how report/answer .md links (from Notices + Work Queue) open. Returns { defaultMode (vscode|preview|obsidian|custom), customCommand, customArgs, modes:[…] }. vscode=raw markdown, preview=rendered VS Code preview, obsidian=rendered in the vault via obsidian://, custom=a user-configured external app ({file} in customArgs is the path). args: none.',
            handler: () => ({ ...deps.store.get(), modes: DOC_OPEN_MODES })
        },
        {
            op: 'docopen.set',
            describe: 'Set the DEFAULT open mode (and/or the custom app) for report/answer .md links. args: defaultMode? (vscode|preview|obsidian|custom), customCommand? (executable for mode=custom), customArgs? (template; {file}=absolute path, whitespace splits argv). Returns the resulting config.',
            handler: (args) => {
                const patch: { defaultMode?: string; customCommand?: string; customArgs?: string } = {};
                if (args.defaultMode !== undefined) { patch.defaultMode = argStr(args, 'defaultMode'); }
                if (args.customCommand !== undefined) { patch.customCommand = optStr(args, 'customCommand'); }
                if (args.customArgs !== undefined) { patch.customArgs = optStr(args, 'customArgs'); }
                const cfg = deps.store.set(patch);
                changed();
                return cfg;
            }
        }
    ]);
}
