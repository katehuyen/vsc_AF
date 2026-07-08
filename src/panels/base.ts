import * as vscode from 'vscode';

export function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

/**
 * Standard HTML shell for Agent Farm webviews: strict CSP, shared CSS,
 * injected data object, shared chart helpers + a page script from /media.
 */
export function htmlShell(
    webview: vscode.Webview,
    extensionUri: vscode.Uri,
    title: string,
    data: unknown,
    scriptFile: string,
    bodyHtml = '<div id="app">Loading…</div>'
): string {
    const nonce = getNonce();
    const css = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'common.css'));
    const charts = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'charts.js'));
    const script = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', scriptFile));
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data:;">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${css}">
<title>${title}</title>
</head>
<body>
${bodyHtml}
<script nonce="${nonce}">window.__DATA__ = ${JSON.stringify(data)};</script>
<script nonce="${nonce}" src="${charts}"></script>
<script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
}
