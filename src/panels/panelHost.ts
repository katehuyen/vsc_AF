import * as vscode from 'vscode';
import { desktopAsk, type PanelAsk } from './panelAsk';

/**
 * X-441 — THE SURFACE A PAGE IS DRAWN ON. A panel knows this, never
 * vscode.WebviewPanel: a VS Code tab is one implementation, a phone's view
 * (src/panels/remoteViews.ts) is the other, so the same page can be open on
 * both at once without the panel knowing about the network. htmlShell uses
 * exactly the webview half.
 *
 * ‼️ A new panel makes its tab with desktopHost(), never createWebviewPanel —
 * test/test_panel_host.js is red otherwise (the older panels are listed there
 * and the list may only shrink).
 */

export interface HostWebview {
    html: string;
    readonly cspSource: string;
    asWebviewUri(uri: vscode.Uri): vscode.Uri;
    postMessage(message: unknown): Thenable<boolean>;
    readonly onDidReceiveMessage: vscode.Event<any>;
    /** Set on a phone's view: host-only services (the PC clipboard) are not the phone's. */
    readonly remote?: true;
}

export interface PanelHost {
    readonly webview: HostWebview;
    /** Drawn on a phone or browser through the remote host, not in a VS Code tab. */
    readonly remote: boolean;
    /** The tab's caption; a phone's view keeps it for nobody to read. */
    title: string;
    /** Whether the page is on screen (a phone's view is while it is open). */
    readonly visible: boolean;
    /** U-201 — the tab the user is in (a VS Code tab only; a phone's view has no focus to ask about). */
    readonly active?: boolean;
    reveal(): void;
    readonly onDidDispose: vscode.Event<void>;
    /** A tab going behind another one or coming back; a phone's view never fires it. */
    readonly onDidChangeViewState: vscode.Event<unknown>;
    /** Messages, confirmations, picks and typed answers — asked of whoever is looking (X-447). */
    readonly ask: PanelAsk;
    dispose(): void;
}

export interface DesktopTab {
    viewType: string;
    title: string;
    column?: vscode.ViewColumn;
    options?: vscode.WebviewPanelOptions & vscode.WebviewOptions;
}

/** A VS Code tab as a PanelHost. Every Agent Farm page runs scripts and survives being hidden. */
export function desktopHost(tab: DesktopTab): PanelHost {
    const panel = vscode.window.createWebviewPanel(
        tab.viewType,
        tab.title,
        tab.column ?? vscode.ViewColumn.One,
        tab.options ?? { enableScripts: true, retainContextWhenHidden: true }
    );
    return {
        webview: panel.webview,
        remote: false,
        get title() { return panel.title; },
        set title(t: string) { panel.title = t; },
        get visible() { return panel.visible; },
        get active() { return panel.active; },
        reveal: () => panel.reveal(),
        onDidDispose: (listener, thisArgs?, bag?) => panel.onDidDispose(listener, thisArgs, bag),
        onDidChangeViewState: (listener, thisArgs?, bag?) => panel.onDidChangeViewState(listener, thisArgs, bag),
        ask: desktopAsk(),
        dispose: () => panel.dispose()
    };
}
