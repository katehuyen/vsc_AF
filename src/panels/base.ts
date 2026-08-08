import * as vscode from 'vscode';

/**
 * The global nav's 🔔 Notices button shows the current unread count in
 * parentheses (see media/pageHeader.js). htmlShell has no direct handle on the
 * notices store, so the host registers a light provider here — same live-read
 * pattern as the AF UI config below. Returns 0 until the host wires it in
 * activate().
 */
let noticesUnreadProvider: (() => number) | undefined;
export function setNoticesUnreadProvider(fn: () => number): void { noticesUnreadProvider = fn; }
function currentUnread(): number {
    try { return noticesUnreadProvider ? Math.max(0, Math.floor(noticesUnreadProvider())) : 0; } catch { return 0; }
}

/** Live count of work-queue items that need the user (blocked) — feeds the
 *  Notices/Queue tab strip's 📥 badge, same pattern as the unread provider. */
let queueBlockedProvider: (() => number) | undefined;
export function setQueueBlockedProvider(fn: () => number): void { queueBlockedProvider = fn; }
function currentBlocked(): number {
    try { return queueBlockedProvider ? Math.max(0, Math.floor(queueBlockedProvider())) : 0; } catch { return 0; }
}

/**
 * ‼️ THE COUNTS ARE PUSHED, NOT SNAPSHOTTED.
 *
 * Both numbers reach a page inside window.__AFUI__, which htmlShell writes into
 * the HTML **once**. A data refresh (postMessage) does not rebuild that HTML, so
 * without a push the badges freeze at the value the page was BUILT with: after
 * deleting 16 unread notices the page said "0 unread" in its own subtitle while
 * the tab strip above it still read "🔔 Notices (16)" — and every other open
 * page kept the stale number in its nav too.
 *
 * So every live page is registered here and gets { type:'afui', afui } whenever
 * either count changes; the header repaints its badges in place. Every Agent
 * Farm panel is retainContextWhenHidden, so a page sitting in a background tab
 * still receives the push — postMessage resolving false therefore means the
 * panel is gone, and the entry is dropped. (A future non-retained panel would
 * simply fall back to the old build-time snapshot, never to a broken page.)
 */
const livePages = new Set<vscode.Webview>();

/** The count pair exactly as the webview sees it (window.__AFUI__). */
function headerCounts(): { notices: { unread: number }; queue: { blocked: number } } {
    return { notices: { unread: currentUnread() }, queue: { blocked: currentBlocked() } };
}

/** Push the current counts to every open page. Call wherever either count can
 *  have changed — the host does it from the same place it repaints the
 *  status-bar bell, so the two surfaces can never disagree. */
export function pushHeaderCounts(): void {
    const afui = headerCounts();
    for (const w of [...livePages]) {
        try {
            void Promise.resolve(w.postMessage({ type: 'afui', afui }))
                .then(delivered => { if (!delivered) { livePages.delete(w); } }, () => livePages.delete(w));
        } catch { livePages.delete(w); }
    }
}

/**
 * ‼️ THE RETURN ADDRESS FOR A RIGHT-CLICK.
 *
 * A `webview/context` command runs in the HOST and is handed the row's context
 * object — but VS Code does not say which webview it came from. Menu items that
 * are page actions (see src/core/ctxmenu.ts) have to reach the page that drew
 * the row, so every page instance gets a key here, publishes it inside its
 * context objects as `afPanel`, and the relay posts back to exactly that one.
 *
 * Keyed by the WEBVIEW, not by the page name: a page that rebuilds its HTML
 * (the session viewer does, per session) must keep the key its rows already
 * carry, and two windows of the same page must never answer for each other.
 */
const ctxPanels = new Map<string, vscode.Webview>();
const ctxKeys = new WeakMap<vscode.Webview, string>();
let ctxSeq = 0;

/** The key for this webview, minted once and stable for its lifetime. */
function ctxKeyFor(webview: vscode.Webview, scriptFile: string): string {
    const had = ctxKeys.get(webview);
    if (had) { ctxPanels.set(had, webview); return had; }
    const key = `${scriptFile.replace(/\.js$/, '')}#${++ctxSeq}`;
    ctxKeys.set(webview, key);
    ctxPanels.set(key, webview);
    return key;
}

/**
 * Deliver one menu action to the page that drew the row.
 *
 * False means the page is gone — the panel was closed between the right-click
 * and the pick, or the key is from a previous window. The caller says so out
 * loud rather than swallowing it: a menu item that silently does nothing is the
 * worst of the three possible outcomes.
 */
export async function postCtx(
    key: string, act: string, ctx: Record<string, unknown>
): Promise<boolean> {
    const webview = ctxPanels.get(key);
    if (!webview) { return false; }
    try {
        const delivered = await webview.postMessage({ type: 'afctx', act, ctx });
        if (!delivered) { ctxPanels.delete(key); }
        return !!delivered;
    } catch { ctxPanels.delete(key); return false; }
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

/**
 * Where a session should run, as a webview stated it.
 *
 * A page whose button already ASKED (a two-item dropdown) sends the answer
 * along so the command does not ask a second time; anything else sends nothing
 * and gets the host's picker. Unknown values become undefined rather than a
 * guess — a mistyped surface must fall back to being asked, never to silently
 * running somewhere the user did not choose.
 */
export function runSurface(v: unknown): 'terminal' | 'console' | undefined {
    return v === 'terminal' || v === 'console' ? v : undefined;
}

/** One router for the shared header's cross-navigation cluster
 *  (media/pageHeader.js posts {type:'afnav', to}). Pages with a scoped
 *  ⌕ Search intercept to === 'search' before delegating here. */
export function handleAfNav(to: unknown): void {
    const commands: Record<string, string> = {
        dashboard: 'agentfarm.openDashboard',
        projects: 'agentfarm.openProjects',
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
        sessions: 'agentfarm.openSessions',
        portfolio: 'agentfarm.openPortfolio',
        console: 'agentfarm.openConsole',
        studio: 'agentfarm.openStudio',
        gallery: 'agentfarm.openStudio'
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
    // shared components (page header/toolbar + filter controls + the right-click
    // contract, general and session-shaped + a text box's four tools + sessions
    // table); tiny, so they ship to every page rather than growing htmlShell a
    // per-page script list
    const header = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'pageHeader.js'));
    const filters = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'afFilters.js'));
    const ctx = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'afCtx.js'));
    const sessCtx = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'afSessionCtx.js'));
    const textTools = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'afTextTools.js'));
    // The rich hover panel. Ships everywhere for the same reason the others do:
    // the rule is "any hover carrying TEXT uses this", and a rule that needs a
    // script tag added first is a rule that gets skipped.
    const tip = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'afTip.js'));
    // The query language. Ships everywhere for the strongest version of that
    // reason: the extension host runs the SAME FILE (src/core/query.ts loads it
    // out of media/), so a page that had to opt in would be a page whose filter
    // box quietly answers a different question from the search that feeds it.
    const query = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'afQuery.js'));
    // The clock, for the same two reasons as the query language: the extension
    // host loads the SAME FILE (src/core/aftime.ts), and the rule "every time
    // carries UTC in its hover" cannot hold on a page that had to opt in.
    const time = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'afTime.js'));
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
        // 🔔 unread notices + 📥 queue items that need you. Only the STARTING
        // values — from here on they arrive by push (see pushHeaderCounts).
        ...headerCounts(),
        // Where a right-click on this page's rows posts back to (media/afCtx.js).
        ctxPanel: ctxKeyFor(webview, scriptFile)
    };
    // This page is now live: it must receive count changes for as long as it exists.
    livePages.add(webview);
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
<script nonce="${nonce}" src="${ctx}"></script>
<script nonce="${nonce}" src="${sessCtx}"></script>
<script nonce="${nonce}" src="${textTools}"></script>
<script nonce="${nonce}" src="${tip}"></script>
<script nonce="${nonce}" src="${query}"></script>
<script nonce="${nonce}" src="${time}"></script>
<script nonce="${nonce}" src="${sessTable}"></script>
<script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
}
