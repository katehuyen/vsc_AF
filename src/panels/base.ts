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
 * Escape a value for safe embedding inside an inline <script> tag. A literal
 * "</script>" in the data (common in transcripts that quote HTML — e.g. this
 * very file) would close the tag early and corrupt the page: the viewer hangs
 * on "Loading…" while the rest of the JSON leaks into the body as text.
 * Escaping "<" (which stays "<" inside a JS/JSON string) makes that impossible;
 * U+2028/U+2029 are line terminators that break the JS string literal, so they
 * are escaped too. The two separators are derived via String.fromCharCode so
 * this source file never contains the raw characters (they would be treated as
 * newlines by the TypeScript parser).
 */
export function jsonForScript(data: unknown): string {
    const lineSep = String.fromCharCode(0x2028);
    const paraSep = String.fromCharCode(0x2029);
    return JSON.stringify(data)
        .split('<').join('\\u003c')
        .split(lineSep).join('\\u2028')
        .split(paraSep).join('\\u2029');
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
<script nonce="${nonce}">window.__DATA__ = ${jsonForScript(data)};</script>
<script nonce="${nonce}" src="${charts}"></script>
<script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
}
