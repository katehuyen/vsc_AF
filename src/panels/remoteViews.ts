import * as path from 'path';
import * as vscode from 'vscode';
import type { HostWebview, PanelHost } from './panelHost';

/**
 * X-441 — THE FARM'S PAGES ON A PHONE. Each view a phone opens is a panel
 * instance of its own on a RemoteView host (the desktop keeps its one tab per
 * page); its HTML is what /view/<page>?view=<id> serves, its posts go out as
 * view.post and the phone's view.msg arrive as the page's messages.
 *
 * Shaped like the remote host's RemoteViewsPort without importing it (the core
 * never imports src/remote); src/extension.ts hands it over.
 */

export interface ViewCaller { device: string; scope: string }

export interface RemotePage {
    /** The scope that may open the page. */
    open: string;
    /** The scope that may act on it; a device below it sends only the `looks` messages. */
    act: string;
    /** Message types that only look (a refresh, a navigation) — allowed at `open`. */
    looks: readonly string[];
    make(host: PanelHost, args: Record<string, unknown> | undefined): void;
}

export interface RemoteViewsDeps {
    /** The extension's media folder — the only thing /res/ serves. */
    media: vscode.Uri;
    pages: Readonly<Record<string, RemotePage>>;
    atLeast(have: string, needed: string): boolean;
    /** How long a page fetch waits for its view's open (the phone sends both at once). */
    waitMs?: number;
}

type Served = { status: number; type: string; body: string };

class RemoteWebview implements HostWebview {
    html = '';
    readonly cspSource = "'self'";
    readonly remote = true as const;
    private readonly inbox = new vscode.EventEmitter<unknown>();
    readonly onDidReceiveMessage = this.inbox.event;
    private live = true;

    constructor(private readonly media: vscode.Uri, private readonly post: (message: unknown) => void) { }

    /** A media file as the page asks for it: /res/<path>, relative so it works on any origin. */
    asWebviewUri(uri: vscode.Uri): vscode.Uri {
        const rel = path.posix.relative(this.media.path, uri.path);
        const href = rel && !rel.startsWith('..') && !path.posix.isAbsolute(rel)
            ? '/res/' + rel.split('/').map(encodeURIComponent).join('/')
            : '/res/-';
        // htmlShell only ever prints it; a Uri would print an absolute file: or https: address.
        return { toString: () => href } as unknown as vscode.Uri;
    }

    postMessage(message: unknown): Thenable<boolean> {
        if (!this.live) { return Promise.resolve(false); }
        this.post(message);
        return Promise.resolve(true);
    }

    receive(message: unknown): void { if (this.live) { this.inbox.fire(message); } }

    end(): void { this.live = false; this.inbox.dispose(); }
}

class RemoteView implements PanelHost {
    readonly remote = true;
    readonly webview: RemoteWebview;
    private readonly disposed = new vscode.EventEmitter<void>();
    readonly onDidDispose = this.disposed.event;
    private closed = false;

    constructor(readonly page: string, readonly spec: RemotePage, media: vscode.Uri, post: (message: unknown) => void) {
        this.webview = new RemoteWebview(media, post);
    }

    /** A phone shows one view at a time; there is nothing to bring forward. */
    reveal(): void { }

    dispose(): void {
        if (this.closed) { return; }
        this.closed = true;
        this.webview.end();
        this.disposed.fire();
        this.disposed.dispose();
    }
}

const VIEW_URL = /^\/view\/([A-Za-z0-9._-]+)\?(?:[^#]*&)?view=([A-Za-z0-9._-]+)(?:&|#|$)/;

export class RemoteViews {
    private readonly views = new Map<string, RemoteView>();
    private readonly arrivals = new Map<string, Array<() => void>>();

    constructor(private readonly d: RemoteViewsDeps) { }

    open(caller: ViewCaller, view: string, page: string, args: Record<string, unknown> | undefined, post: (message: unknown) => void): boolean {
        const spec = Object.prototype.hasOwnProperty.call(this.d.pages, page) ? this.d.pages[page] : undefined;
        if (!spec || !this.d.atLeast(caller.scope, spec.open)) { return false; }
        const key = keyOf(caller, view);
        this.views.get(key)?.dispose();
        const host = new RemoteView(page, spec, this.d.media, post);
        this.views.set(key, host);
        host.onDidDispose(() => { if (this.views.get(key) === host) { this.views.delete(key); } });
        spec.make(host, args);
        for (const wake of this.arrivals.get(key) ?? []) { wake(); }
        this.arrivals.delete(key);
        return true;
    }

    message(caller: ViewCaller, view: string, message: unknown): void {
        const host = this.views.get(keyOf(caller, view));
        if (!host) { return; }
        const type = String((message as { type?: unknown } | null)?.type ?? '');
        if (!this.d.atLeast(caller.scope, host.spec.act) && !host.spec.looks.includes(type)) { return; }
        host.webview.receive(message);
    }

    close(caller: ViewCaller, view: string): void {
        this.views.get(keyOf(caller, view))?.dispose();
    }

    async page(url: string, caller: ViewCaller): Promise<Served | null> {
        const m = VIEW_URL.exec(url);
        if (!m) { return null; }
        const key = keyOf(caller, m[2]);
        const host = this.views.get(key) ?? await this.arrival(key);
        if (!host || host.page !== m[1]) { return null; }
        return { status: 200, type: 'text/html; charset=utf-8', body: host.webview.html };
    }

    /** How many views are open (all devices). */
    count(): number { return this.views.size; }

    private arrival(key: string): Promise<RemoteView | undefined> {
        return new Promise(resolve => {
            const list = this.arrivals.get(key) ?? [];
            let done = false;
            const finish = () => { if (!done) { done = true; resolve(this.views.get(key)); } };
            list.push(finish);
            this.arrivals.set(key, list);
            const t = setTimeout(() => {
                const left = (this.arrivals.get(key) ?? []).filter(f => f !== finish);
                if (left.length) { this.arrivals.set(key, left); } else { this.arrivals.delete(key); }
                finish();
            }, this.d.waitMs ?? 3000);
            t.unref?.();
        });
    }
}

function keyOf(caller: ViewCaller, view: string): string { return caller.device + '|' + view; }
