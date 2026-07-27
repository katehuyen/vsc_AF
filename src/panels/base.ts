import * as vscode from 'vscode';

/**
 * The global nav's 🔔 Notices button shows the current unread count in
 * parentheses (see media/pageHeader.js). htmlShell has no direct handle on the
 * notices store, so the host registers a light provider here — same live-read
 * pattern as the AF UI config below, read fresh on every page render (the
 * status-bar bell carries the live count; a page's nav reflects the count as of
 * its last render). Returns 0 until the host wires it in activate().
 */
let noticesUnreadProvider: (() => number) | undefined;
export function setNoticesUnreadProvider(fn: () => number): void { noticesUnreadProvider = fn; }
function currentUnread(): number {
    try { return noticesUnreadProvider ? Math.max(0, Math.floor(noticesUnreadProvider())) : 0; } catch { return 0; }
}

/** Live count of work-queue items that need the user (blocked) — feeds the
 *  Notices/Kuyruk tab strip's 📥 badge, same pattern as the unread provider. */
let queueBlockedProvider: (() => number) | undefined;
export function setQueueBlockedProvider(fn: () => number): void { queueBlockedProvider = fn; }
function currentBlocked(): number {
    try { return queueBlockedProvider ? Math.max(0, Math.floor(queueBlockedProvider())) : 0; } catch { return 0; }
}

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
 * Shared Export-MD options prompt (session viewer + Turns page). Two questions,
 * native QuickPick so it reads like the rest of the extension:
 *  1. scope — the current VIEW (filters/folding applied, the default) or
 *     EVERYTHING (the full content, ignoring the on-screen state);
 *  2. only when scope=view AND something is folded — whether folded items
 *     contribute their TITLE (header only) or are omitted entirely (default).
 * `foldedNoun` names the folded unit for the wording ("collapsed turns" /
 * "folded turns"). Returns undefined if the user dismisses either step.
 */
export async function askExportOptions(
    foldedNoun: string,
    hasFolded: boolean
): Promise<{ view: boolean; foldedTitles: boolean } | undefined> {
    const scope = await vscode.window.showQuickPick([
        { label: '$(eye) Current view', description: 'export what you see — filters and folding applied (default)', v: true },
        { label: '$(list-flat) Everything', description: 'the full content, ignoring filters and folding', v: false }
    ], { placeHolder: 'Export MD — what should the file contain?', ignoreFocusOut: true });
    if (!scope) { return undefined; }
    if (!scope.v || !hasFolded) { return { view: scope.v, foldedTitles: false }; }
    const folded = await vscode.window.showQuickPick([
        { label: `Omit ${foldedNoun}`, description: 'folded items are left out entirely (default)', v: false },
        { label: `Include ${foldedNoun} — titles only`, description: 'folded items appear as their header, without their content', v: true }
    ], { placeHolder: `Export MD — folded ${foldedNoun}?`, ignoreFocusOut: true });
    if (!folded) { return undefined; }
    return { view: true, foldedTitles: folded.v };
}

/** One router for the shared header's cross-navigation cluster
 *  (media/pageHeader.js posts {type:'afnav', to}). Pages with a scoped
 *  ⌕ Search intercept to === 'search' before delegating here. */
export function handleAfNav(to: unknown): void {
    const commands: Record<string, string> = {
        dashboard: 'agentfarm.openDashboard',
        living: 'agentfarm.openLiving',
        timeline: 'agentfarm.openTimeline',
        needs: 'agentfarm.openNeeds',
        notices: 'agentfarm.openNotices',
        queue: 'agentfarm.openQueue',
        board: 'agentfarm.openBoard',
        tasks: 'agentfarm.openTasks',
        airtable: 'agentfarm.openAirtable',
        missions: 'agentfarm.openMissions',
        search: 'agentfarm.searchTranscripts',
        settings: 'agentfarm.openFarmSettings',
        capabilities: 'agentfarm.openCapabilities',
        toolbox: 'agentfarm.openToolbox',
        secrets: 'agentfarm.openSecrets',
        turns: 'agentfarm.openTurns',
        portfolio: 'agentfarm.openPortfolio',
        console: 'agentfarm.openConsole'
    };
    const cmd = commands[String(to)];
    if (cmd) { void vscode.commands.executeCommand(cmd); }
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
    // shared components (page header/toolbar + filter controls + sessions
    // table); tiny, so they ship to every page rather than growing htmlShell
    // a per-page script list
    const header = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'pageHeader.js'));
    const filters = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'afFilters.js'));
    const sessTable = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'sessionsTable.js'));
    const script = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', scriptFile));
    // Global UI config shared by every page (not page data): the user's AI
    // speaker-label template/case/fallback, read live so a settings change is
    // picked up on the next page render. See src/core/speaker.ts.
    const cfg = vscode.workspace.getConfiguration('agentFarm');
    const afui = {
        speaker: {
            template: cfg.get<string>('speakerLabelTemplate', '{ai}'),
            casing: cfg.get<string>('speakerLabelCase', 'page'),
            fallback: cfg.get<string>('speakerLabelFallback', 'agent')
        },
        // Unread notice count for the global nav's 🔔 Notices badge.
        notices: { unread: currentUnread() },
        // Blocked work-queue count for the 📥 Kuyruk tab badge.
        queue: { blocked: currentBlocked() }
    };
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
<script nonce="${nonce}">window.__DATA__ = ${jsonForScript(data)}; window.__AFUI__ = ${jsonForScript(afui)};</script>
<script nonce="${nonce}" src="${charts}"></script>
<script nonce="${nonce}" src="${header}"></script>
<script nonce="${nonce}" src="${filters}"></script>
<script nonce="${nonce}" src="${sessTable}"></script>
<script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
}
