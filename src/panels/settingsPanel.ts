import * as fs from 'fs';
import * as vscode from 'vscode';
import {
    buildSettingsModel, sanitizeValue, snapshotProfile, profileApplyPlan,
    parseImportedProfiles, SettingsProfile, SettingsCategory
} from '../core/settingsops';
import { htmlShell } from './base';

export interface FarmSettingsDeps {
    extensionUri: vscode.Uri;
    /** the agentFarm.* schema straight from package.json — the page renders it. */
    schema(): Record<string, { type?: unknown; enum?: unknown; default?: unknown; description?: string; markdownDescription?: string }>;
    getProfiles(): SettingsProfile[];
    setProfiles(list: SettingsProfile[]): Thenable<void>;
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

    private buildData(): Record<string, unknown> {
        return {
            categories: this.categories(),
            profiles: this.deps.getProfiles().map(p => ({
                name: p.name, savedAt: p.savedAt, count: Object.keys(p.values).length
            }))
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
            case 'openGuide':
                void vscode.commands.executeCommand('agentfarm.openGuide', msg.anchor);
                break;
        }
    }

    private dispose(): void {
        FarmSettingsPanel.current = undefined;
        for (const d of this.disposables) { d.dispose(); }
    }
}
