import * as vscode from 'vscode';
import { flexCardMessage } from './settingsFlex';
import { htmlShell, telegramCardMessage } from './base';
import { handleAlertMessage } from './alertMessages';
import { ALERT_ERROR_KEY } from './alertSurface';
import { desktopHost, type PanelHost } from './panelHost';
import { lockedNote, phoneFlex } from './settingsPhone';
import { SettingsPage } from './settingsPage';
import type { FarmSettingsDeps } from './settingsDeps';
import { handleSettingsValueMessage } from './settingsValueMessages';
import { handleSettingsSectionMessage } from './settingsSectionMessages';
import { handleSettingsAgentMessage } from './settingsAgentMessages';

const CONFIG_SECTION = 'agentFarm';

/** Rich settings page: every agentFarm.* setting with live editing, defaults,
 *  search, and named setting-sets (save / apply / export / import). */
export class FarmSettingsPanel extends SettingsPage {
    private static current: FarmSettingsPanel | undefined;
    private disposables: vscode.Disposable[] = [];

    static show(deps: FarmSettingsDeps, focus?: string): void {
        if (FarmSettingsPanel.current) {
            FarmSettingsPanel.current.host.reveal();
            if (focus) { void FarmSettingsPanel.current.host.webview.postMessage({ type: 'focus', key: focus }); }
            return;
        }
        FarmSettingsPanel.current = new FarmSettingsPanel(
            desktopHost({ viewType: 'agentfarm.settings', title: 'Agent Farm — Settings' }), deps, focus);
    }

    /** X-456 — the views phones have open: one instance each, never the desktop's one tab. */
    private static phones = new Set<FarmSettingsPanel>();

    /** X-456 — the Settings page on a phone's view. */
    static openOn(host: PanelHost, deps: FarmSettingsDeps): void {
        FarmSettingsPanel.phones.add(new FarmSettingsPanel(host, deps));
    }

    /** Redraw if the page is up — used when something OUTSIDE the settings
     *  system changes what this page offers, e.g. an engine's model catalog
     *  answering after the page was drawn (U-31). */
    static refreshIfOpen(): void {
        FarmSettingsPanel.current?.refresh();
        for (const p of FarmSettingsPanel.phones) { p.refresh(); }
    }

    private constructor(host: PanelHost, deps: FarmSettingsDeps, focus?: string) {
        super(host, deps);
        this.host.webview.html = htmlShell(
            this.host.webview,
            this.deps.extensionUri,
            'Farm Settings',
            { ...this.buildData(), focus: focus ?? '' },
            'settings.js'
        );
        host.onDidDispose(() => this.dispose(), null, this.disposables);
        host.webview.onDidReceiveMessage(msg => void this.onMessage(msg), null, this.disposables);
        // external edits (settings.json, other panels) refresh the page live
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(CONFIG_SECTION)) { this.refresh(); }
        }, null, this.disposables);
    }

    private async onMessage(msg: { type: string; [k: string]: unknown }): Promise<void> {
        // U-84 — the bridge card's own messages, handled by the module the
        // Toolbox handles them with. One card, one set of rules, two pages.
        if (await telegramCardMessage(msg, {
            ...(this.deps.telegram ? { host: this.deps.telegram } : {}),
            webview: this.host.webview,
            warn: t => void this.host.ask.warn('Agent Farm: ' + t),
            refresh: () => this.refresh()
        })) { return; }
        // U-178 — the sound controls are the Sound page's too; one handler answers both pages.
        if (await handleAlertMessage(msg, this.deps, {
            error: error => void this.host.webview.postMessage({ type: 'error', key: ALERT_ERROR_KEY, error }),
            refresh: () => this.refresh()
        })) { return; }
        // U-152 — a written value refreshes through onDidChangeConfiguration, like `set`.
        const flexError = (error: string): void =>
            void this.host.webview.postMessage({ type: 'error', key: 'flex', error: error.slice(0, 300) });
        const skipped: string[] = [];
        const flex = this.deps.flex && this.host.remote ? phoneFlex(this.deps.flex, skipped) : this.deps.flex;
        if (flex && await flexCardMessage(msg, flex, flexError)) {
            if (skipped.length) { flexError(lockedNote(skipped)); }
            return;
        }
        for (const handle of [handleSettingsValueMessage, handleSettingsSectionMessage, handleSettingsAgentMessage]) {
            if (await handle(msg, this)) { return; }
        }
    }

    private dispose(): void {
        // A phone's view closing leaves the desktop's tab alone.
        if (FarmSettingsPanel.current === this) { FarmSettingsPanel.current = undefined; }
        FarmSettingsPanel.phones.delete(this);
        for (const d of this.disposables) { d.dispose(); }
        this.disposables = [];
    }
}
