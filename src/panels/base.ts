import * as vscode from 'vscode';
import { PromptSnippetsSnapshot } from '../core/prompts';
import { createWikiCategory, normTopics, normTurnList, readWikiCategories, turnFor } from '../core/wiki';
import { afConfig } from '../core/settingsDoor';

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

/**
 * ‼️ THE CLIPBOARD IS THE HOST'S — WIRED FOR EVERY PAGE, ONCE (U-82).
 *
 * `media/afCtx.js` owns every "Copy ▸" in the extension and used to write
 * through `navigator.clipboard`, which requires the document to be FOCUSED.
 * Every one of those copies arrives from a menu pick, and the menu is VS Code's
 * own: focus is elsewhere at exactly the moment the page tries to write, so the
 * whole family failed together and looked like dead menu items. The session
 * viewer had already found this for its ⧉ button and moved the write here; this
 * makes that the rule instead of one panel's workaround.
 *
 * Registered here rather than in each panel's `onMessage` because a component
 * that ships to every page (htmlShell) must not need 28 panels to opt in — the
 * next panel would be the one that forgot. Once per WEBVIEW, from the same
 * mint-once path as the right-click key, so a page that rebuilds its HTML does
 * not stack a second listener.
 */
function wireClipboard(webview: vscode.Webview): void {
    webview.onDidReceiveMessage((msg: { type?: string; token?: unknown; text?: unknown }) => {
        if (!msg || msg.type !== 'afClipboard') { return; }
        const token = msg.token;
        const text = typeof msg.text === 'string' ? msg.text : '';
        const answer = (ok: boolean, error?: string) =>
            void Promise.resolve(webview.postMessage({ type: 'afClipboardDone', token, ok, error }))
                .then(undefined, () => { /* page gone — nothing to tell */ });
        if (!text) { answer(false, 'Nothing to copy — that row does not carry it.'); return; }
        void vscode.env.clipboard.writeText(text).then(
            () => answer(true),
            () => answer(false, 'The clipboard refused that.'));
    });
}

/** The key for this webview, minted once and stable for its lifetime. */
function ctxKeyFor(webview: vscode.Webview, scriptFile: string): string {
    const had = ctxKeys.get(webview);
    if (had) { ctxPanels.set(had, webview); return had; }
    wireClipboard(webview);
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
 * The OS file picker, asked for BY a form field (media/afForm.js `path`).
 *
 * ‼️ THIS IS THE ONE DIALOG THAT STAYS. A webview cannot open a folder chooser,
 * so the alternative to this round trip is a person typing an absolute path by
 * hand — which is precisely the argument the dialog chains used to justify
 * themselves. The difference is what happens around it: one dialog, its answer
 * lands in one field, and nothing else in the half-filled form is disturbed.
 *
 * The page posts `{ type:'af-browse', key, kind }`; the answer comes back as
 * `{ type:'af-browsed', key, path }` and the form's own `AFForm.browsed` files
 * it. A cancel posts nothing: a field the user declined to change must keep
 * what was in it.
 */
export async function handleFormBrowse(
    webview: vscode.Webview, msg: Record<string, unknown>
): Promise<void> {
    const key = typeof msg.key === 'string' ? msg.key : '';
    if (!key) { return; }
    const folder = msg.kind !== 'file';
    const picked = await vscode.window.showOpenDialog({
        canSelectFiles: !folder,
        canSelectFolders: folder,
        canSelectMany: false,
        openLabel: 'Use this',
        title: typeof msg.title === 'string' && msg.title ? msg.title : undefined
    });
    if (!picked?.length) { return; }
    void webview.postMessage({ type: 'af-browsed', key, path: picked[0].fsPath });
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
        evals: 'agentfarm.openEvals',
        secrets: 'agentfarm.openSecrets',
        turns: 'agentfarm.openTurns',
        wiki: 'agentfarm.openWiki',
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
    // The saved-prompt picker. Ships everywhere for the reason it was made
    // shared (M-24): the rule is "a box that takes a prompt offers the prompts
    // you saved", and a component a page had to opt into is the component the
    // next prompt box does without.
    const snippets = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'afSnippets.js'));
    // The rich hover panel. Ships everywhere for the same reason the others do:
    // the rule is "any hover carrying TEXT uses this", and a rule that needs a
    // script tag added first is a rule that gets skipped.
    const tip = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'afTip.js'));
    // The page's own form. Ships everywhere for the reason the rule exists:
    // "an object is made by a form on the page, a chain of VS Code boxes is a
    // missing feature" (docs/CONVENTIONS.md). A component a page had to opt
    // into is a component the next surface skips — which is exactly how eight
    // surfaces ended up listing an object they could not make.
    const form = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'afForm.js'));
    // The wiki tagger (K-26). Ships everywhere for the reason the badge exists:
    // a turn worth keeping goes past at conversation speed on whichever surface
    // you happen to be reading it on, and a component a page had to opt into is
    // the page where the turn goes unmarked.
    // The searchable multi-pick box (U-90). Ships everywhere for the reason the
    // tagger does: it is what the tagger asks its one question with, and the
    // cockpit edits the same answer — a taxonomy typed from memory on one
    // surface is the taxonomy the other one cannot offer.
    const combo = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'afCombo.js'));
    const wiki = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'afWiki.js'));
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
    // Which engine a thing ran on, drawn the same way and in the same colour on
    // every surface. Ships everywhere for the reason U-26 was filed: a badge
    // invented per page is a badge that disagrees per page.
    const engine = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'afEngine.js'));
    // Which project a thing belongs to, drawn the same way and in the project's
    // own colour on every surface — the same reason as the engine badge above.
    // Four models carry a project now (Faz 5), so a mark invented per page is a
    // mark that disagrees per page.
    const project = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'afProject.js'));
    const script = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', scriptFile));
    // Global UI config shared by every page (not page data): the user's AI
    // speaker-label template/case/fallback, read live so a settings change is
    // picked up on the next page render. See src/core/speaker.ts.
    const cfg = afConfig();
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
<script nonce="${nonce}" src="${snippets}"></script>
<script nonce="${nonce}" src="${tip}"></script>
<script nonce="${nonce}" src="${combo}"></script>
<script nonce="${nonce}" src="${wiki}"></script>
<script nonce="${nonce}" src="${form}"></script>
<script nonce="${nonce}" src="${query}"></script>
<script nonce="${nonce}" src="${time}"></script>
<script nonce="${nonce}" src="${engine}"></script>
<script nonce="${nonce}" src="${project}"></script>
<script nonce="${nonce}" src="${sessTable}"></script>
<script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
}

/**
 * ‼️ THE SAVED PROMPTS, ANSWERED THE SAME WAY WHEREVER THEY ARE ASKED FOR.
 *
 * The three messages `media/afSnippets.js` sends — read the list, open the
 * file, choose a different file. Here rather than in each panel because the
 * picker is shared (M-24): the Console's send buttons and every prompt box on
 * the Tasks page open the same window, and a second copy of these three cases
 * would be a second place for the file dialog's rules to drift.
 *
 * Returns true when the message was one of the picker's, so a panel can hand
 * anything it does not recognise straight over and stop caring.
 */
export async function promptSnippetMessage(
    webview: vscode.Webview,
    read: () => PromptSnippetsSnapshot,
    type: unknown
): Promise<boolean> {
    switch (type) {
        // A right-click. The answer carries the file it came from and the error
        // when there is one, because "the menu was empty" and "the file you
        // pointed at is gone" are two different things and only one of them is
        // your fault.
        case 'promptSnippets':
            void webview.postMessage({ type: 'promptSnippets', ...read() });
            return true;
        case 'openPromptSnippets': {
            const file = read().file;
            if (file) { void vscode.window.showTextDocument(vscode.Uri.file(file)); }
            return true;
        }
        /**
         * ‼️ CHOOSING THE FILE IS A FILE DIALOG, NOT A TRIP TO A SETTINGS PAGE.
         * This used to open VS Code's own settings editor at the key, which is
         * the extension talking about itself instead of doing the thing: the
         * answer to "which file?" is a path on this disk, and the only control
         * that answers it honestly is the operating system's own picker. It is
         * the same gesture the Browse… button on the Farm Settings page makes,
         * so both doors behave alike.
         *
         * The picker is answered in place afterwards — the list is re-read and
         * pushed back, so the file you just chose is on screen without closing
         * anything.
         */
        case 'pickPromptSnippets': {
            const current = read().file;
            const picked = await vscode.window.showOpenDialog({
                canSelectFiles: true, canSelectFolders: false, canSelectMany: false,
                openLabel: 'Use this file',
                filters: { 'Markdown / text': ['md', 'markdown', 'txt'], 'All files': ['*'] },
                ...(current ? { defaultUri: vscode.Uri.file(current) } : {})
            });
            const chosen = picked?.[0]?.fsPath;
            if (chosen) {
                await vscode.workspace.getConfiguration().update(
                    'agentFarm.promptSnippetsFile', chosen, vscode.ConfigurationTarget.Global);
            }
            void webview.postMessage({ type: 'promptSnippets', ...read() });
            return true;
        }
        default:
            return false;
    }
}

/**
 * ‼️ K-26 — THE WIKI TAGGER'S HOST SIDE, WIRED ONCE FOR EVERY READING SURFACE.
 *
 * The badge is on the Console's prompt rows and on the transcript's turn bands,
 * and the list of surfaces only grows. Registered here for the same reason the
 * notices count is: `htmlShell` ships `media/afWiki.js` to every page, so a
 * page that had to reach the pool through its own panel's deps would be a page
 * where the badge draws and does nothing.
 */
export interface WikiMarkBridge {
    /** The pool's topics, newest use first — the chips the tagger offers. */
    topics(): { topic: string; pending: number; total: number }[];
    /** What is already marked in this conversation, so a taken turn says so. */
    marks(sessionId: string): {
        id: string; from: number; to: number; topics: string[]; state: string
    }[];
    /** The transcript's turn rollup — how a row's moment becomes a number. */
    turns(sessionId: string): { n: number; label: string; ts: number }[];
    /** ‼️ U-90/U-91 — where `00_WIKI` lives. Reading its folders and starting
     *  one are `core/wiki.ts`'s own functions and are called here directly: the
     *  bridge op does the same, so the page and the op cannot drift into two
     *  implementations of "what is a category". */
    root(): string;
    /** ‼️ The transcript's path and engine are re-derived by the implementation
     *  from the session id, never taken from the page: a webview is not where a
     *  file path is decided (the same rule attachmentsOf follows). */
    add(a: {
        sessionId: string; from: number; to: number;
        topics: string[]; note: string; label: string;
        /** X-58 — turn numbers inside the scope to leave out. */
        excludeTurns?: number[];
    }): { merged: boolean; pending: number };
}

let wikiBridge: WikiMarkBridge | undefined;
export function setWikiMarkBridge(b: WikiMarkBridge): void { wikiBridge = b; }

/**
 * ‼️ WHAT IS ALREADY MARKED, AT PAINT TIME — not after a round trip.
 *
 * The badge on a kept turn is green the moment the page draws, or it flickers
 * grey on every repaint of a conversation that is repainting constantly. So the
 * marks travel with the page's own data, and only a NEW mark comes back over
 * the wire (see the `wikiMarked` reply, which carries the fresh list).
 */
export function wikiMarksOf(sessionId: string): {
    id: string; from: number; to: number; topics: string[]; state: string
}[] {
    try { return wikiBridge && sessionId ? wikiBridge.marks(sessionId) : []; } catch { return []; }
}

/** A reading of the vault that is missing or unreadable must not take the
 *  tagger down with it: the pool still works without a wiki folder. */
function safely<T>(read: () => T, fallback: T): T {
    try { return read(); } catch { return fallback; }
}

/** Everything a surface needs to draw the tagger for one conversation. */
function wikiSnapshot(sessionId: string): Record<string, unknown> {
    if (!wikiBridge) { return { session: sessionId, ok: false, why: 'The candidate pool is not open yet.' }; }
    return {
        session: sessionId,
        ok: true,
        topics: wikiBridge.topics(),
        // U-90: what the picker offers is the pool's topics AND the wiki's own
        // folders. They stay two lists on the wire because they are two facts —
        // a folder says where a page would go, a topic says what is already
        // marked — and the picker says which is which.
        categories: safely(() => readWikiCategories(wikiBridge!.root()), []),
        marks: wikiBridge.marks(sessionId),
        turnCount: wikiBridge.turns(sessionId).length
    };
}

/**
 * The two messages `media/afWiki.js` sends. Returns true when the message was
 * the tagger's, so a panel hands over anything it does not recognise.
 *
 * ‼️ THE TURN NUMBER IS RESOLVED HERE AND SENT BACK FOR THE READER TO SEE. The
 * page asks with the row's own moment and opening line; `turnFor` says which
 * transcript turn that is and whether it is sure. Nothing is written on that
 * message — the popover opens with the number filled in and the person presses
 * Save. A guess is a guess in front of the reader, never behind them.
 */
export function wikiMarkMessage(
    webview: vscode.Webview,
    msg: { type: string; [k: string]: unknown }
): boolean {
    const str = (k: string): string => (typeof msg[k] === 'string' ? msg[k] as string : '');
    const num = (k: string): number => (typeof msg[k] === 'number' ? Math.floor(msg[k] as number) : 0);
    switch (msg.type) {
        case 'wikiAsk': {
            const session = str('session');
            const snap = wikiSnapshot(session);
            if (!wikiBridge || !snap.ok) { void webview.postMessage({ type: 'wikiAsk', ...snap }); return true; }
            const turns = wikiBridge.turns(session);
            // A row that already knows its number (a transcript turn band) says
            // so and is believed; a Console row hands over its moment instead.
            const given = num('turn');
            // ‼️ U-94 — a surface with no rows asks for the WHOLE conversation
            // and there is nothing to resolve. Sending it through `turnFor` with
            // no moment and no words would answer turn 1 flagged as a guess:
            // a number nobody asked for, presented as something to check.
            const at = msg.whole === true
                ? { turn: 0, count: turns.length, exact: true }
                : given > 0
                    ? { turn: given, count: turns.length, exact: true }
                    : turnFor(turns, { ts: num('ts'), text: str('text') });
            void webview.postMessage({
                type: 'wikiAsk', ...snap,
                from: at.turn, to: at.turn, exact: at.exact,
                label: at.turn
                    ? (turns.find(t => t.n === at.turn)?.label ?? str('text').slice(0, 90))
                    : ''
            });
            return true;
        }
        // ‼️ U-91 — STARTING A CATEGORY IS THE ONE THING HERE THAT TOUCHES THE
        // VAULT, and it makes a folder, never a page. The page sends what was
        // typed; the name is cleaned and checked by the core, and the answer
        // says what was REALLY made — including "that one already existed",
        // which is the whole point of asking rather than spelling it again.
        case 'wikiCategory': {
            const session = str('session');
            if (!wikiBridge) {
                void webview.postMessage({
                    type: 'wikiCategory', session, ok: false,
                    why: 'The candidate pool is not open yet.'
                });
                return true;
            }
            const r = safely(() => createWikiCategory(wikiBridge!.root(), str('name')),
                { ok: false as const, error: 'The wiki folder could not be written.' });
            void webview.postMessage({
                type: 'wikiCategory', session,
                ok: r.ok === true,
                name: r.ok ? r.name : '', existed: r.ok ? r.existed : false,
                why: r.ok ? '' : r.error, ...(r.ok ? wikiSnapshot(session) : {})
            });
            return true;
        }
        case 'wikiMark': {
            const session = str('session');
            if (!wikiBridge) {
                void webview.postMessage({ type: 'wikiMarked', session, ok: false, why: 'The candidate pool is not open yet.' });
                return true;
            }
            const topics = normTopics(msg.topics);
            if (!topics.length) {
                void webview.postMessage({
                    type: 'wikiMarked', session, ok: false,
                    why: 'A candidate needs at least one topic — it is what the compile files the concept under.'
                });
                return true;
            }
            const turns = wikiBridge.turns(session);
            const from = Math.max(0, num('from'));
            const to = Math.max(from, num('to'));
            if (from > 0 && turns.length && to > turns.length) {
                void webview.postMessage({
                    type: 'wikiMarked', session, ok: false,
                    why: `That conversation has ${turns.length} turn(s); ${to} is past the end.`
                });
                return true;
            }
            // ‼️ X-58 — the turns inside the scope that are NOT part of it. Only
            // meaningful when there is a scope to subtract from, so a number
            // outside it is dropped here rather than stored as a puzzle.
            const lo = from === 0 ? 1 : from;
            const hi = from === 0 ? (turns.length || Number.MAX_SAFE_INTEGER) : to;
            const exclude = normTurnList(msg.excludeTurns).filter(n => n >= lo && n <= hi);
            const r = wikiBridge.add({
                sessionId: session, from, to, topics,
                ...(exclude.length ? { excludeTurns: exclude } : {}),
                note: str('note'),
                label: turns.find(t => t.n === from)?.label ?? (turns[0]?.label ?? '')
            });
            void webview.postMessage({
                type: 'wikiMarked', session, ok: true,
                merged: r.merged, pending: r.pending,
                from, to, ...wikiSnapshot(session)
            });
            return true;
        }
        default:
            return false;
    }
}
