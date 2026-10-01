import * as vscode from 'vscode';
import { handleAfNav, htmlShell } from './base';
import { desktopHost, type PanelHost } from './panelHost';
import { AlertMessageDeps, ALERT_ERROR_KEY, handleAlertMessage } from './alertMessages';
import { NOTIFY_KEYS, SessionSoundRow, SoundPage } from './soundModel';

/**
 * U-178 — 🔊 SOUND, A PAGE OF ITS OWN.
 *
 * Everything the farm can make a noise about used to be one card in the middle
 * of the longest settings page, beside the switches it was confused with. The
 * page answers the questions in the order they are asked: will I hear anything
 * at all, what plays on which event, what is said, which sounds are mine.
 *
 * ‼️ IT HOLDS NO RULE OF ITS OWN. The model is the host's `alertsPage()` (what
 * `alerts.status` answers) and every press goes through `handleAlertMessage`,
 * the same arms the Settings page used — each one the function an op runs.
 */
export interface SoundDeps extends AlertMessageDeps {
    extensionUri: vscode.Uri;
    /** each event's VS Code notification switch, read live */
    notify(): Record<string, boolean>;
    /** U-183 — every live session's sound, one row each */
    sessions?(): SessionSoundRow[];
}

export class SoundPanel {
    private static current: SoundPanel | undefined;
    private disposables: vscode.Disposable[] = [];

    static show(deps: SoundDeps): void {
        if (SoundPanel.current) {
            SoundPanel.current.host.reveal();
            SoundPanel.current.refresh();
            return;
        }
        SoundPanel.current = new SoundPanel(
            desktopHost({ viewType: 'agentfarm.sound', title: 'Agent Farm — Sound' }), deps);
    }

    static refreshIfOpen(): void { SoundPanel.current?.refresh(); }

    private constructor(readonly host: PanelHost, private deps: SoundDeps) {
        host.webview.html = htmlShell(host.webview, deps.extensionUri, 'Sound', this.data(), 'sound.js');
        host.onDidDispose(() => this.dispose(), null, this.disposables);
        host.webview.onDidReceiveMessage(msg => void this.onMessage(msg), null, this.disposables);
        // A sound setting written anywhere — the status bar, a Timeline ♪, the
        // bridge, settings.json — redraws the page that shows it.
        const keys = ['agentFarm.alerts', ...Object.values(NOTIFY_KEYS)];
        vscode.workspace.onDidChangeConfiguration(e => {
            if (keys.some(k => e.affectsConfiguration(k))) { this.refresh(); }
        }, null, this.disposables);
    }

    private data(): SoundPage {
        return { alerts: this.deps.alerts?.() ?? null, notify: this.deps.notify(), sessions: this.deps.sessions?.() ?? [] };
    }

    refresh(): void {
        void this.host.webview.postMessage({ type: 'data', data: this.data() });
    }

    private async onMessage(msg: { type: string;[k: string]: unknown }): Promise<void> {
        if (msg.type === 'refresh') { this.refresh(); return; }
        if (msg.type === 'afnav') { handleAfNav(msg.to); return; }
        await handleAlertMessage(msg, this.deps, {
            error: error => void this.host.webview.postMessage({ type: 'error', key: ALERT_ERROR_KEY, error }),
            refresh: () => this.refresh(),
            // U-183 — the session panel opens on this page too (⋯, the right-click)
            post: m => void this.host.webview.postMessage(m)
        });
    }

    private dispose(): void {
        if (SoundPanel.current === this) { SoundPanel.current = undefined; }
        for (const d of this.disposables) { d.dispose(); }
    }
}
