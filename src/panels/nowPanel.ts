import * as vscode from 'vscode';
import type { NowData } from '../core/nowPage';
import { handleAfNav, htmlShell } from './base';
import { attachPageReading, pageReadingNow, pageReads } from './pageReading';
import { desktopHost, type PanelHost } from './panelHost';

/**
 * U-177 — "Now": one screen of what waits for you, what runs, today's spend
 * and quotas and the latest notices, with a box that speaks into a running
 * session. The phone's home page and a desktop tab, drawn on a PanelHost.
 * A new session is the Console's door (the box's button navigates there).
 */

export interface NowDeps {
    extensionUri: vscode.Uri;
    build(): NowData;
    /** Say `text` in hosted session `id`: undefined = no such session, `refused` = the session's reason. */
    send(id: string, text: string): { refused?: string } | undefined;
    /** Fired whenever what the page shows may have moved. */
    onDidChange: vscode.Event<void>;
}

/** A Console session streams many changes a second; the page redraws at most this often. */
const REDRAW_MS = 1000;

export class NowPanel {
    private static current: NowPanel | undefined;
    private disposables: vscode.Disposable[] = [];
    private timer: NodeJS.Timeout | undefined;

    static show(deps: NowDeps): void {
        if (NowPanel.current) {
            NowPanel.current.host.reveal();
            NowPanel.current.refresh();
            return;
        }
        NowPanel.current = new NowPanel(desktopHost({ viewType: 'agentfarm.now', title: 'Agent Farm — Now' }), deps);
    }

    static openOn(host: PanelHost, deps: NowDeps): void {
        new NowPanel(host, deps);
    }

    private constructor(readonly host: PanelHost, private deps: NowDeps) {
        host.webview.html = htmlShell(host.webview, deps.extensionUri, 'Now', this.data(), 'now.js');
        host.onDidDispose(() => this.dispose(), null, this.disposables);
        host.webview.onDidReceiveMessage(msg => { if (!pageReads(msg, host.webview, { surface: 'now' })) { this.onMessage(msg); } }, null, this.disposables);
        this.disposables.push(deps.onDidChange(() => this.soon()), attachPageReading(host.webview));
    }

    /** U-207 — with the reading now, which a running row's 🔊 paints from */
    private data(): NowData & { reading: ReturnType<typeof pageReadingNow> } { return { ...this.deps.build(), reading: pageReadingNow() }; }

    private soon(): void {
        if (this.timer) { return; }
        this.timer = setTimeout(() => { this.timer = undefined; this.refresh(); }, REDRAW_MS);
    }

    refresh(): void {
        void this.host.webview.postMessage({ type: 'data', data: this.data() });
    }

    private onMessage(msg: { type: string; id?: unknown; text?: unknown; to?: unknown }): void {
        if (msg.type === 'refresh') { this.refresh(); return; }
        if (msg.type === 'afnav') { handleAfNav(msg.to); return; }
        if (msg.type === 'send') {
            const id = typeof msg.id === 'string' ? msg.id : '';
            const text = typeof msg.text === 'string' ? msg.text.trim() : '';
            if (!id || !text) { return; }
            const r = this.deps.send(id, text);
            const error = !r ? 'that session has ended — start a new one from the Console' : r.refused;
            void this.host.webview.postMessage({ type: 'sent', id, ok: !error, ...(error ? { error } : {}) });
            this.refresh();
        }
    }

    private dispose(): void {
        if (NowPanel.current === this) { NowPanel.current = undefined; }
        if (this.timer) { clearTimeout(this.timer); }
        for (const d of this.disposables) { d.dispose(); }
    }
}
