import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
    buildSettingsModel, sanitizeValue, snapshotProfile, profileApplyPlan,
    parseImportedProfiles, SettingsProfile, SettingsCategory
} from '../core/settingsops';
import {
    CC_CATALOG, buildClaudeModel, coerceClaudeValue, patchClaudeSettings,
    validateRawClaudeSettings
} from '../core/claudesettings';
import { PromptSnippetsSnapshot } from '../core/prompts';
import { EngineStatus } from '../core/engines';
import { normPath } from '../core/util';
import { revealPath } from '../core/reveal';
import { handleAfNav, htmlShell } from './base';

/** Webview-ready snapshot of one agent root for the Agent folders section. */
export interface AgentFolderReport {
    root: string;
    kind: 'nest' | 'single-agent' | 'plain' | 'missing';
    duplicate: boolean;
    /** model = the folder's effective default model (settings.local.json,
     *  falling back to settings.json); '' when none is set. */
    candidates: { dir: string; name: string; excluded: boolean; agentId: string; model: string }[];
}

export interface FarmSettingsDeps {
    extensionUri: vscode.Uri;
    /** the agentFarm.* schema straight from package.json — the page renders it.
     *  `x-af-browse` is how a setting declares itself a path and earns a
     *  Browse… button (see SettingSpec.browse for why not `format`). */
    schema(): Record<string, {
        type?: unknown; enum?: unknown; default?: unknown;
        description?: string; markdownDescription?: string; 'x-af-browse'?: unknown;
    }>;
    getProfiles(): SettingsProfile[];
    setProfiles(list: SettingsProfile[]): Thenable<void>;
    /** Claude Code's own ~/.claude/settings.json (honors agentFarm.claudeDir). */
    claudeSettingsFile(): string;
    /** Live root scan + excludes for the Agent folders section. */
    agentFolders?(): { reports: AgentFolderReport[]; excludes: string[] };
    /** Report/answer .md "open with" default + custom external app (Notepad etc.). */
    docOpen?(): { defaultMode: string; customCommand: string; customArgs: string; modes: string[] };
    setDocOpen?(patch: { defaultMode?: string; customCommand?: string; customArgs?: string }): void;
    /**
     * Saved prompts: which file the feature resolves to right now, and what was
     * read out of it.
     *
     * ‼️ THE SECTION SHOWS THE PARSED RESULT, NOT JUST THE PATH, and that is the
     * whole reason it exists rather than a text box under "Display & Labels".
     * A path in a box tells you nothing about whether the feature works — the
     * previous shape of this setting was blank for a week and looked merely
     * unconfigured. Reading the file here means the page answers "is it
     * working?" with the blocks themselves.
     */
    promptSnippets?(): PromptSnippetsSnapshot;
    /** Write the chosen path — '' hands the feature back to the built-in one. */
    setPromptSnippetsFile?(file: string): Thenable<void>;
    /**
     * X-3 — the engine matrix: which agent CLI is installed, how it is paid for
     * (a plan sign-in or a key), and the one thing to do next. See
     * core/engines.ts for why this is not simply "the API keys".
     */
    engines?(): EngineStatus[];
    /**
     * Write one of the engine's own commands into a real terminal — the install
     * or the sign-in — WITHOUT running it. One gesture for both, because it is
     * one act: the user reads the line and presses Enter. Agent Farm never sees
     * a grant; the browser and the CLI settle that between them.
     */
    engineCommand?(command: string): void;
    /** Hand the key route to the vault's own form, on that exact name. */
    engineKey?(name: string): void;
    /** Open the Engines panel — the page this section is the summary of (X-14). */
    openEngines?(): void;
}

const CONFIG_SECTION = 'agentFarm';

/** Rich settings page: every agentFarm.* setting with live editing, defaults,
 *  search, and named setting-sets (save / apply / export / import). */
export class FarmSettingsPanel {
    private static current: FarmSettingsPanel | undefined;
    private disposables: vscode.Disposable[] = [];

    static show(deps: FarmSettingsDeps, focus?: string): void {
        if (FarmSettingsPanel.current) {
            FarmSettingsPanel.current.panel.reveal();
            if (focus) { void FarmSettingsPanel.current.panel.webview.postMessage({ type: 'focus', key: focus }); }
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'agentfarm.settings',
            'Agent Farm — Settings',
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        FarmSettingsPanel.current = new FarmSettingsPanel(panel, deps, focus);
    }

    private constructor(readonly panel: vscode.WebviewPanel, private deps: FarmSettingsDeps, focus?: string) {
        this.panel.webview.html = htmlShell(
            this.panel.webview,
            this.deps.extensionUri,
            'Farm Settings',
            { ...this.buildData(), focus: focus ?? '' },
            'settings.js'
        );
        panel.onDidDispose(() => this.dispose(), null, this.disposables);
        panel.webview.onDidReceiveMessage(msg => void this.onMessage(msg), null, this.disposables);
        // external edits (settings.json, other panels) refresh the page live
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(CONFIG_SECTION)) { this.refresh(); }
        }, null, this.disposables);
    }

    private categories(): SettingsCategory[] {
        const cfg = vscode.workspace.getConfiguration();
        return buildSettingsModel(this.deps.schema(), key => cfg.get(key));
    }

    /** Read Claude Code's settings.json — missing file is a valid empty state. */
    private readClaude(): { json: Record<string, unknown>; raw: string; parseError: string } {
        const file = this.deps.claudeSettingsFile();
        let raw = '';
        try { raw = fs.readFileSync(file, 'utf8'); } catch { /* not created yet */ }
        if (!raw.trim()) { return { json: {}, raw: '{}', parseError: '' }; }
        const v = validateRawClaudeSettings(raw);
        return v.ok
            ? { json: v.json, raw, parseError: '' }
            : { json: {}, raw, parseError: v.error };
    }

    /** Write it back — pretty JSON, with a one-time .agentfarm-backup of the
     *  original next to it (live product: an edit must always be undoable). */
    private writeClaude(json: Record<string, unknown>): string {
        const file = this.deps.claudeSettingsFile();
        try {
            const backup = file + '.agentfarm-backup';
            if (fs.existsSync(file) && !fs.existsSync(backup)) {
                fs.copyFileSync(file, backup);
            }
            fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n', 'utf8');
            return '';
        } catch (e) {
            return String((e as Error).message).slice(0, 200);
        }
    }

    private buildData(): Record<string, unknown> {
        const cc = this.readClaude();
        return {
            // the user's model-name knowledge base — feeds every model picker
            modelAliases: vscode.workspace.getConfiguration()
                .get<string[]>('agentFarm.modelAliases', ['haiku', 'sonnet', 'opus', 'fable']),
            folders: this.deps.agentFolders?.() ?? null,
            categories: this.categories(),
            profiles: this.deps.getProfiles().map(p => ({
                name: p.name, savedAt: p.savedAt, count: Object.keys(p.values).length
            })),
            claude: {
                file: this.deps.claudeSettingsFile(),
                items: buildClaudeModel(cc.json),
                raw: cc.raw,
                parseError: cc.parseError
            },
            docOpen: this.deps.docOpen?.() ?? null,
            prompts: this.deps.promptSnippets?.() ?? null,
            // X-3 — which agent CLIs this machine can run and how each is paid
            // for. Read on every build rather than cached: a sign-in that
            // happened in the terminal thirty seconds ago is exactly the change
            // somebody comes back to this page to confirm.
            engines: this.deps.engines?.() ?? null
        };
    }

    private refresh(): void {
        void this.panel.webview.postMessage({ type: 'data', data: this.buildData() });
    }

    private async setValue(key: string, value: unknown): Promise<string> {
        const spec = this.deps.schema()[key];
        if (!spec) { return 'unknown setting'; }
        if (value === undefined) { // reset to default
            await vscode.workspace.getConfiguration().update(key, undefined, vscode.ConfigurationTarget.Global);
            return '';
        }
        const s = sanitizeValue(
            { type: Array.isArray(spec.type) ? String(spec.type[0]) : String(spec.type ?? 'string'), enum: Array.isArray(spec.enum) ? spec.enum.map(String) : undefined },
            value);
        if (!s.ok) { return s.error; }
        await vscode.workspace.getConfiguration().update(key, s.value, vscode.ConfigurationTarget.Global);
        return '';
    }

    private async onMessage(msg: { type: string; [k: string]: unknown }): Promise<void> {
        switch (msg.type) {
            case 'set': {
                const key = String(msg.key ?? '');
                const error = await this.setValue(key, msg.value);
                if (error) {
                    void this.panel.webview.postMessage({ type: 'error', key, error });
                }
                // success refreshes via onDidChangeConfiguration
                break;
            }
            case 'reset':
                await this.setValue(String(msg.key ?? ''), undefined);
                break;
            /**
             * Browse… on a path setting (schema `format: file-path` /
             * `folder-path`). The dialog opens where the setting already points
             * — picking a new prompts file means going back to the folder the
             * old one was in, and starting at the last-used directory instead
             * would cost that walk every time.
             */
            case 'browse': {
                const key = String(msg.key ?? '');
                const folders = String(msg.kind ?? 'file') === 'folder';
                const current = String(vscode.workspace.getConfiguration().get(key) ?? '').trim();
                const picked = await vscode.window.showOpenDialog({
                    canSelectFolders: folders, canSelectFiles: !folders, canSelectMany: false,
                    openLabel: folders ? 'Use this folder' : 'Use this file',
                    ...(current ? { defaultUri: vscode.Uri.file(current) } : {})
                });
                const file = picked?.[0]?.fsPath;
                if (!file) { break; }
                const error = await this.setValue(key, file);
                if (error) { void this.panel.webview.postMessage({ type: 'error', key, error }); }
                break;
            }
            /**
             * Saved prompts — the same three gestures the Console picker has,
             * so the two doors behave alike (that promise is in consolePanel's
             * `pickPromptSnippets` comment, and this is the other half of it).
             *
             * `promptsUseDefault` REMOVES the key rather than writing '': an
             * explicit empty string is a value, and a value outranks the
             * built-in path for good. Removing it is the only thing that
             * actually means "I have chosen nothing".
             */
            case 'promptsPick': {
                const current = this.deps.promptSnippets?.().file ?? '';
                const picked = await vscode.window.showOpenDialog({
                    canSelectFiles: true, canSelectFolders: false, canSelectMany: false,
                    openLabel: 'Use this file',
                    filters: { 'Markdown / text': ['md', 'markdown', 'txt'], 'All files': ['*'] },
                    ...(current ? { defaultUri: vscode.Uri.file(current) } : {})
                });
                const file = picked?.[0]?.fsPath;
                if (file) { await this.deps.setPromptSnippetsFile?.(file); }
                this.refresh();
                break;
            }
            case 'promptsUseDefault':
                await this.deps.setPromptSnippetsFile?.('');
                this.refresh();
                break;
            case 'promptsOpen': {
                const file = this.deps.promptSnippets?.().file ?? '';
                if (file) { void vscode.window.showTextDocument(vscode.Uri.file(file)); }
                break;
            }
            // Re-read the file without changing anything — the list is a view of
            // a document somebody edits in Obsidian while this page is open.
            case 'promptsReload':
                this.refresh();
                break;
            // From a setting's right-click menu: the same key, in VS Code's own
            // settings editor — where its raw JSON, its scope and its history
            // live. This page is a curated view, not a replacement for that.
            case 'openSettingsUi':
                if (typeof msg.key === 'string' && msg.key) {
                    void vscode.commands.executeCommand('workbench.action.openSettings', msg.key);
                }
                break;
            // ---- X-3: the engine rows ------------------------------------
            // ‼️ The page asks; the host acts. A credential is never decided
            // here and never travels through the webview: the sign-in is the
            // CLI's own command in a real terminal, and the key route is the
            // vault's own form.
            case 'engineCommand':
                if (typeof msg.command === 'string' && msg.command) {
                    this.deps.engineCommand?.(msg.command);
                }
                break;
            case 'openEngines':
                this.deps.openEngines?.();
                break;
            case 'engineKey':
                if (typeof msg.name === 'string' && msg.name) {
                    this.deps.engineKey?.(msg.name);
                }
                break;
            case 'engineDocs':
                if (typeof msg.url === 'string' && /^https:\/\//.test(msg.url)) {
                    void vscode.env.openExternal(vscode.Uri.parse(msg.url));
                }
                break;
            case 'docOpenSet': {
                const field = String(msg.field ?? '');
                if (field === 'defaultMode' || field === 'customCommand' || field === 'customArgs') {
                    this.deps.setDocOpen?.({ [field]: String(msg.value ?? '') });
                    this.refresh();
                }
                break;
            }
            case 'saveProfile': {
                const name = String(msg.name ?? '').trim();
                if (!name) { break; }
                const profile = snapshotProfile(name, this.categories());
                const list = this.deps.getProfiles().filter(p => p.name !== profile.name);
                list.push(profile);
                list.sort((a, b) => a.name.localeCompare(b.name));
                await this.deps.setProfiles(list);
                this.refresh();
                void vscode.window.showInformationMessage(
                    `Agent Farm: setting set "${profile.name}" saved (${Object.keys(profile.values).length} non-default value(s)).`);
                break;
            }
            case 'applyProfile': {
                const profile = this.deps.getProfiles().find(p => p.name === msg.name);
                if (!profile) { break; }
                const plan = profileApplyPlan(profile, this.categories());
                const resets = plan.filter(p => p.value === undefined).length;
                const pick = await vscode.window.showWarningMessage(
                    `Apply setting set "${profile.name}"? ${plan.length - resets} value(s) will be set` +
                    (resets ? `, ${resets} other modified setting(s) reset to default` : '') + '.',
                    { modal: true }, 'Apply');
                if (pick !== 'Apply') { break; }
                for (const step of plan) {
                    await this.setValue(step.key, step.value === undefined ? undefined : step.value);
                }
                this.refresh();
                break;
            }
            case 'deleteProfile': {
                await this.deps.setProfiles(this.deps.getProfiles().filter(p => p.name !== msg.name));
                this.refresh();
                break;
            }
            case 'exportProfiles': {
                const list = this.deps.getProfiles();
                if (!list.length) { break; }
                const uri = await vscode.window.showSaveDialog({
                    saveLabel: 'Export setting sets',
                    filters: { JSON: ['json'] },
                    defaultUri: vscode.Uri.file('agent-farm-setting-sets.json')
                });
                if (!uri) { break; }
                try {
                    fs.writeFileSync(uri.fsPath, JSON.stringify(list, null, 2), 'utf8');
                    void vscode.window.showInformationMessage(`Agent Farm: ${list.length} setting set(s) exported.`);
                } catch (e) {
                    void vscode.window.showErrorMessage('Agent Farm: export failed — ' + String((e as Error).message));
                }
                break;
            }
            case 'importProfiles': {
                const uris = await vscode.window.showOpenDialog({
                    openLabel: 'Import setting sets', filters: { JSON: ['json'] }, canSelectMany: false
                });
                if (!uris?.length) { break; }
                let imported: SettingsProfile[] = [];
                try { imported = parseImportedProfiles(fs.readFileSync(uris[0].fsPath, 'utf8')); } catch { /* unreadable */ }
                if (!imported.length) {
                    void vscode.window.showWarningMessage('Agent Farm: no valid setting sets in that file.');
                    break;
                }
                const list = this.deps.getProfiles().filter(p => !imported.some(i => i.name === p.name));
                list.push(...imported);
                list.sort((a, b) => a.name.localeCompare(b.name));
                await this.deps.setProfiles(list);
                this.refresh();
                void vscode.window.showInformationMessage(`Agent Farm: imported ${imported.length} setting set(s).`);
                break;
            }
            case 'ccSet': {
                const item = CC_CATALOG.find(i => i.id === msg.id);
                if (!item) { break; }
                const cc = this.readClaude();
                if (cc.parseError) {
                    void this.panel.webview.postMessage({ type: 'ccError', id: item.id, error: 'settings.json is not valid JSON — fix it in the raw editor first' });
                    break;
                }
                const coerced = coerceClaudeValue(item, msg.value);
                if (!coerced.ok) {
                    void this.panel.webview.postMessage({ type: 'ccError', id: item.id, error: coerced.error });
                    break;
                }
                const err = this.writeClaude(patchClaudeSettings(cc.json, item.path, coerced.value));
                if (err) { void vscode.window.showErrorMessage('Agent Farm: could not write settings.json — ' + err); }
                this.refresh();
                break;
            }
            case 'ccClear': {
                const item = CC_CATALOG.find(i => i.id === msg.id);
                if (!item) { break; }
                const cc = this.readClaude();
                if (!cc.parseError) {
                    this.writeClaude(patchClaudeSettings(cc.json, item.path, undefined));
                }
                this.refresh();
                break;
            }
            case 'ccRaw': {
                const v = validateRawClaudeSettings(String(msg.text ?? ''));
                if (!v.ok) {
                    void this.panel.webview.postMessage({ type: 'ccError', id: '__raw__', error: v.error });
                    break;
                }
                const err = this.writeClaude(v.json);
                if (err) { void vscode.window.showErrorMessage('Agent Farm: could not write settings.json — ' + err); }
                this.refresh();
                break;
            }
            case 'ccOpenFile':
                void vscode.commands.executeCommand('vscode.open', vscode.Uri.file(this.deps.claudeSettingsFile()));
                break;
            // ---- Agent folders section ----
            // Every write below lands in settings.json; onDidChangeConfiguration
            // then re-scans and refreshes this page (and every other surface).
            case 'rootAdd':
                await vscode.commands.executeCommand('agentfarm.addAgentRoot');
                break;
            case 'rootRemove': {
                const root = String(msg.root ?? '');
                if (!root) { break; }
                const rep = this.deps.agentFolders?.().reports.find(r => r.root === root);
                const n = rep ? rep.candidates.filter(c => !c.excluded).length : 0;
                const pick = await vscode.window.showWarningMessage(
                    `Remove agent root "${root}"?` +
                    (n ? ` Its ${n} agent(s) leave the farm views.` : '') +
                    ' The folder itself is not touched.',
                    { modal: true }, 'Remove');
                if (pick !== 'Remove') { break; }
                const cfg = vscode.workspace.getConfiguration();
                await cfg.update('agentFarm.agentRoots',
                    cfg.get<string[]>('agentFarm.agentRoots', []).filter(r => r !== root),
                    vscode.ConfigurationTarget.Global);
                break;
            }
            case 'rootReveal':
                if (typeof msg.root === 'string' && msg.root) {
                    void revealPath(msg.root);
                }
                break;
            case 'rootCleanDupes': {
                const cfg = vscode.workspace.getConfiguration();
                const roots = cfg.get<string[]>('agentFarm.agentRoots', []);
                const seen = new Set<string>();
                const clean = roots.filter(r => {
                    if (seen.has(normPath(r))) { return false; }
                    seen.add(normPath(r));
                    return true;
                });
                if (clean.length !== roots.length) {
                    await cfg.update('agentFarm.agentRoots', clean, vscode.ConfigurationTarget.Global);
                    void vscode.window.showInformationMessage(
                        `Agent Farm: ${roots.length - clean.length} duplicate root entry(ies) removed.`);
                }
                break;
            }
            case 'agentExclude': {
                const dir = String(msg.dir ?? '');
                if (!dir) { break; }
                const cfg = vscode.workspace.getConfiguration();
                const list = cfg.get<string[]>('agentFarm.excludeAgentDirs', []);
                if (!list.some(x => normPath(x) === normPath(dir))) {
                    await cfg.update('agentFarm.excludeAgentDirs', [...list, dir], vscode.ConfigurationTarget.Global);
                }
                break;
            }
            case 'agentInclude': {
                const dir = String(msg.dir ?? '');
                if (!dir) { break; }
                const cfg = vscode.workspace.getConfiguration();
                const next = cfg.get<string[]>('agentFarm.excludeAgentDirs', [])
                    .filter(x => normPath(x) !== normPath(dir));
                await cfg.update('agentFarm.excludeAgentDirs', next, vscode.ConfigurationTarget.Global);
                break;
            }
            case 'agentModel': {
                // Per-agent default model → the agent's .claude/settings.local.json
                // ('' clears the key, the CLI default takes over). Only scanned
                // agent folders are writable from here — the webview must not be
                // able to point us at arbitrary paths.
                const dir = String(msg.dir ?? '');
                const model = String(msg.model ?? '').trim();
                const known = this.deps.agentFolders?.().reports
                    .some(r => r.candidates.some(c => c.dir === dir));
                if (!dir || !known) { break; }
                const file = path.join(dir, '.claude', 'settings.local.json');
                let json: Record<string, unknown> = {};
                try {
                    const v = validateRawClaudeSettings(fs.readFileSync(file, 'utf8'));
                    if (!v.ok) {
                        void vscode.window.showErrorMessage(
                            `Agent Farm: ${file} is not valid JSON — fix the file first.`);
                        break;
                    }
                    json = v.json;
                } catch { /* not created yet — start empty */ }
                try {
                    fs.mkdirSync(path.dirname(file), { recursive: true });
                    fs.writeFileSync(file,
                        JSON.stringify(patchClaudeSettings(json, ['model'], model || undefined), null, 2) + '\n',
                        'utf8');
                } catch (e) {
                    void vscode.window.showErrorMessage(
                        'Agent Farm: could not write ' + file + ' — ' + String((e as Error).message));
                }
                this.refresh();
                break;
            }
            case 'openAgent':
                if (typeof msg.agentId === 'string' && msg.agentId) {
                    void vscode.commands.executeCommand('agentfarm.openAgentDetail', { agentId: msg.agentId });
                }
                break;
            case 'openGuide':
                void vscode.commands.executeCommand('agentfarm.openGuide', msg.anchor);
                break;
            case 'afnav':
                handleAfNav(msg.to);
                break;
            case 'refresh':
                this.refresh();
                break;
        }
    }

    private dispose(): void {
        FarmSettingsPanel.current = undefined;
        for (const d of this.disposables) { d.dispose(); }
    }
}
