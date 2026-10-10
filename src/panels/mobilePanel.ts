import * as vscode from 'vscode';
import { handleAfNav, htmlShell } from './base';
import { desktopHost, type PanelHost } from './panelHost';
import { remoteCard, remoteCardMessage, type RemoteDevicesHost } from './toolboxRemote';
import { webCardData, webCardMessage, type WebViewHost } from './toolboxWeb';

/**
 * U-247 — the phone's pages under 📱 Mobile, beside Now: Web (the farm in a browser — AFWeb.card) and Devices
 * (pairing a phone, the phones paired, the network's permission — AFPhoneApp.card). Each card is the component
 * the Toolbox drew, with the same data and the same acts (toolboxWeb.ts, toolboxRemote.ts); nothing is decided here.
 */
export type MobileView = 'web' | 'devices';
/** The views by name, so a caller in a file that may not spell OpenCode's server flags (extension.ts) can name them. */
export const MOBILE_VIEW: { readonly [K in MobileView]: K } = { web: 'web', devices: 'devices' };
const TITLE: Record<MobileView, string> = { web: 'Web', devices: 'Devices' };

export interface MobileDeps {
    extensionUri: vscode.Uri;
    web?: WebViewHost;
    remote?: RemoteDevicesHost;
}

type Said = { ok: boolean; text: string } | undefined;

export class MobilePanel {
    private static current = new Map<MobileView, MobilePanel>();
    private disposables: vscode.Disposable[] = [];
    /** The pairing code the Devices card shows while it is fresh. */
    private pair: { link: string; addresses: string[]; until: number } | undefined;

    static show(view: MobileView, deps: MobileDeps): void {
        const open = MobilePanel.current.get(view);
        if (open) { open.host.reveal(); open.refresh(); return; }
        const host = desktopHost({ viewType: 'agentfarm.mobile.' + view, title: 'Agent Farm — ' + TITLE[view] });
        MobilePanel.current.set(view, new MobilePanel(host, view, deps));
    }

    static openOn(host: PanelHost, view: MobileView, deps: MobileDeps): void {
        new MobilePanel(host, view, deps);
    }

    private constructor(readonly host: PanelHost, private readonly view: MobileView, private readonly deps: MobileDeps) {
        host.webview.html = htmlShell(host.webview, deps.extensionUri, TITLE[view], this.data(), 'mobile.js');
        host.onDidDispose(() => this.dispose(), null, this.disposables);
        host.webview.onDidReceiveMessage(msg => { void this.onMessage(msg); }, null, this.disposables);
    }

    private data(): Record<string, unknown> {
        return this.view === 'web'
            ? { view: 'web', web: webCardData(this.deps.web) }
            : { view: 'devices', remote: remoteCard(this.deps.remote, this.pair) };
    }

    refresh(): void {
        void this.host.webview.postMessage({ type: 'data', data: this.data() });
    }

    private said(type: 'web-said' | 'remote-said'): (m: Said) => void {
        return m => {
            if (m) { void this.host.webview.postMessage({ type, ...m }); }
            this.refresh();
        };
    }

    private async onMessage(msg: { type?: unknown; to?: unknown;[k: string]: unknown }): Promise<void> {
        if (msg.type === 'refresh') { this.refresh(); return; }
        if (msg.type === 'afnav') { handleAfNav(msg.to); return; }
        if (await webCardMessage(msg, {
            ...(this.deps.web ? { host: this.deps.web } : {}),
            say: this.said('web-said'),
            ask: this.host.ask
        })) { return; }
        await remoteCardMessage(msg, {
            ...(this.deps.remote ? { host: this.deps.remote } : {}),
            setPair: p => { this.pair = p; },
            say: this.said('remote-said'),
            ask: this.host.ask
        });
    }

    private dispose(): void {
        if (MobilePanel.current.get(this.view) === this) { MobilePanel.current.delete(this.view); }
        for (const d of this.disposables) { d.dispose(); }
    }
}
