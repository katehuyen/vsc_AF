import * as path from 'path';
import * as vscode from 'vscode';
import type { HostWebview, PanelHost } from './panelHost';
import { RemoteAsk, type PanelAsk } from './panelAsk';
import { FILE_URL, MAX_FILE_BYTES, ViewFiles, type ServedFile } from './remoteFiles';

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
    /** False: there is nothing to show for these args, and the view is refused. */
    make(host: PanelHost, args: Record<string, unknown> | undefined): boolean | void;
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
    /** The biggest page file a phone is sent (remoteFiles.ts). */
    maxFileBytes?: number;
}

type Served = ServedFile;

class RemoteWebview implements HostWebview {
    html = '';
    readonly cspSource = "'self'";
    readonly remote = true as const;
    private readonly inbox = new vscode.EventEmitter<unknown>();
    readonly onDidReceiveMessage = this.inbox.event;
    private live = true;

    readonly files: ViewFiles;

    constructor(private readonly media: vscode.Uri, private readonly post: (message: unknown) => void, view: string) {
        this.files = new ViewFiles(view);
    }

    /** A media file is /res/<path>, relative so it works on any origin; another file the panel shows gets this view's token. */
    asWebviewUri(uri: vscode.Uri): vscode.Uri {
        const rel = path.posix.relative(this.media.path, uri.path);
        const href = rel && !rel.startsWith('..') && !path.posix.isAbsolute(rel)
            ? '/res/' + rel.split('/').map(encodeURIComponent).join('/')
            : (uri.scheme === 'file' && this.files.address(uri.fsPath)) || '/res/-';
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

    constructor(readonly page: string, readonly spec: RemotePage, media: vscode.Uri, post: (message: unknown) => void, view: string) {
        this.webview = new RemoteWebview(media, post, view);
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
        const host = new RemoteView(page, spec, this.d.media, post, view);
        this.views.set(key, host);
        host.onDidDispose(() => { if (this.views.get(key) === host) { this.views.delete(key); } });
        const made = spec.make(host, args) !== false;
        if (!made) { host.dispose(); }
        for (const wake of this.arrivals.get(key) ?? []) { wake(); }
        this.arrivals.delete(key);
        return made;
    }

    /** What the message was, for the audit log: `act` = not a mere look, `ran` = it reached the page. */
    message(caller: ViewCaller, view: string, message: unknown): { page: string; type: string; act: boolean; ran: boolean } | undefined {
        const host = this.views.get(keyOf(caller, view));
        if (!host) { return undefined; }
        const pressed = takePress(message);
        const type = String((message as { type?: unknown } | null)?.type ?? '');
        // The answer to the host's own question (X-447): settled here, never the page's message.
        if (type === 'afAskAnswer') {
            const ran = this.d.atLeast(caller.scope, host.spec.open);
            if (ran) { host.asker.answer(message); }
            return { page: host.page, type, act: true, ran };
        }
        const need = messageScope(host.spec, type);
        const ran = need !== null && this.d.atLeast(caller.scope, need);
        if (ran) { host.webview.receive(message); } else if (pressed) { void host.asker.info(refusedNote(need, caller.scope)); }
        const look = host.spec.looks.includes(type) || SHELL_LOOKS.includes(type);
        return { page: host.page, type, act: !look, ran };
    }

    close(caller: ViewCaller, view: string): void {
        this.views.get(keyOf(caller, view))?.dispose();
    }

    async page(url: string, caller: ViewCaller): Promise<Served | null> {
        const f = FILE_URL.exec(url);
        // a page's file belongs to the device and the view that were given its address
        if (f) { return (await this.views.get(keyOf(caller, f[1]))?.webview.files.serve(f[2], this.d.maxFileBytes ?? MAX_FILE_BYTES)) ?? null; }
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

/** media/afRemote.js marks what the user's own press sent; the page's handler never sees the mark. */
function takePress(message: unknown): boolean {
    if (!message || typeof message !== 'object' || !('afPress' in message)) { return false; }
    const m = message as { afPress?: unknown };
    const pressed = m.afPress === true;
    delete m.afPress;
    return pressed;
}

/** Why a press on the phone did nothing: the PC's own action, or more than this phone may do. */
export function refusedNote(need: string | null, scope: string): string {
    return need === null
        ? 'Not available on the phone — do this on the PC.'
        : `This phone may ${scope}; this needs ${need}. An admin can change it on the PC: Toolbox › Services › Agent Farm app.`;
}
