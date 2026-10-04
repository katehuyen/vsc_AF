import * as vscode from 'vscode';
import { handleAfNav, htmlShell } from './base';
import { desktopHost, type PanelHost } from './panelHost';
import { AlertMessageDeps, ALERT_ERROR_KEY, handleAlertMessage } from './alertMessages';
import { CHANNEL_KEYS, NOTIFY_KEYS, SessionSoundRow, SoundChannel, SoundPage } from './soundModel';
import type { AgentSoundRow } from '../core/soundAgents';

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
    /** U-187 — every agent's own tones, and the write `alerts.voice.set scope=agent` runs */
    agents?(): AgentSoundRow[];
    alertsSetAgentVoice?(agent: string, event: string, voice: string): Promise<void>;
    /** U-215 — phone · Telegram · webhook, read from their own settings */
    channels?(): SoundChannel[];
}

/** The channel settings, plus what their tooltips name, redraw the page when they change. */
const CHANNEL_WATCH = [...Object.values(CHANNEL_KEYS), 'agentFarm.telegram.digest', 'agentFarm.notifyWebhookEvents'];

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
        const keys = ['agentFarm.alerts', ...Object.values(NOTIFY_KEYS), ...CHANNEL_WATCH];
        vscode.workspace.onDidChangeConfiguration(e => {
            if (keys.some(k => e.affectsConfiguration(k))) { this.refresh(); }
        }, null, this.disposables);
    }

    private data(): SoundPage {
        return {
            alerts: this.deps.alerts?.() ?? null, notify: this.deps.notify(),
            sessions: this.deps.sessions?.() ?? [], agents: this.deps.agents?.() ?? [],
            channels: this.deps.channels?.() ?? []
        };
    }

    refresh(): void {
        void this.host.webview.postMessage({ type: 'data', data: this.data() });
    }

    private async onMessage(msg: { type: string;[k: string]: unknown }): Promise<void> {
        if (msg.type === 'refresh') { this.refresh(); return; }
        if (msg.type === 'afnav') { handleAfNav(msg.to); return; }
        // U-215 — a channel chip opens Settings on that channel's own setting, and only those
        if (msg.type === 'openSettings') {
            const focus = Object.values(CHANNEL_KEYS).find(k => k === msg.focus);
            if (focus) { void vscode.commands.executeCommand('agentfarm.openFarmSettings', { focus }); }
            return;
        }
        const error = (e: string): void => void this.host.webview.postMessage({ type: 'error', key: ALERT_ERROR_KEY, error: e });
        if (msg.type === 'alertAgentVoice') {
            // U-187 — the agent step; the page redraws from the setting change it causes
            try { await this.deps.alertsSetAgentVoice?.(String(msg.agent ?? ''), String(msg.event ?? ''), String(msg.voice ?? '')); }
            catch (e) { error((e as Error).message); this.refresh(); }
            return;
        }
        await handleAlertMessage(msg, this.deps, {
            error,
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
