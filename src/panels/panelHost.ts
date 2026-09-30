import * as vscode from 'vscode';

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
    reveal(): void;
    readonly onDidDispose: vscode.Event<void>;
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
        reveal: () => panel.reveal(),
        onDidDispose: panel.onDidDispose,
        dispose: () => panel.dispose()
    };
}
