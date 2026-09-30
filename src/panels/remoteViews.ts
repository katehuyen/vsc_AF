import * as path from 'path';
import * as vscode from 'vscode';
import type { HostWebview, PanelHost } from './panelHost';
import { RemoteAsk, type PanelAsk } from './panelAsk';

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

/**
 * A page a phone may open. A message from its view is judged in this order:
 * `pcOnly` never runs from a phone (it would open a dialog, an editor or
 * another tab on the PC), `looks` needs only `open`, `answers` needs
 * answer, anything else needs `act`.
 */
export interface RemotePage {
    open: string;
    act: string;
    looks: readonly string[];
    answers: readonly string[];
    pcOnly: readonly string[];
    make(host: PanelHost, args: Record<string, unknown> | undefined): void;
}

/** Messages every page's shell sends (htmlShell's shared helpers) that only look. */
const SHELL_LOOKS = ['afClipboard'];

/** The scope a message from a phone's view needs, or null when it never runs from one. */
export function messageScope(spec: RemotePage, type: string): string | null {
    if (spec.pcOnly.includes(type)) { return null; }
    if (spec.looks.includes(type) || SHELL_LOOKS.includes(type)) { return spec.open; }
    if (spec.answers.includes(type)) { return 'answer'; }
    return spec.act;
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
    title = '';
    readonly visible = true;
    private readonly disposed = new vscode.EventEmitter<void>();
    readonly onDidDispose = this.disposed.event;
    readonly onDidChangeViewState: vscode.Event<unknown> = () => ({ dispose: () => undefined });
    readonly asker: RemoteAsk;
    readonly ask: PanelAsk;
    private closed = false;

    constructor(readonly page: string, readonly spec: RemotePage, media: vscode.Uri, post: (message: unknown) => void) {
        this.webview = new RemoteWebview(media, post);
        this.asker = new RemoteAsk(m => { void this.webview.postMessage(m); });
        this.ask = this.asker;
    }

    /** A phone shows one view at a time; there is nothing to bring forward. */
    reveal(): void { }

    dispose(): void {
        if (this.closed) { return; }
        this.closed = true;
        this.asker.end();
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
        // The answer to the host's own question (X-447): settled here, never the page's message.
        if (type === 'afAskAnswer') {
            if (this.d.atLeast(caller.scope, host.spec.open)) { host.asker.answer(message); }
            return;
        }
        const need = messageScope(host.spec, type);
        if (need === null || !this.d.atLeast(caller.scope, need)) { return; }
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
