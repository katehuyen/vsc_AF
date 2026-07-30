// Agent Farm — ONE right-click contract for a session, wherever a session is shown.
//
// `data-vscode-context` on a row hands that row's identity to VS Code, which
// builds the menu from the `webview/context` entries in package.json; the
// normal Copy/Paste items stay (`preventDefaultContextMenuItems: false`).
// It is deliberately NOT a `contextmenu` listener: hijacking right-click would
// take the page's own menu away.
//
// ‼️ WHY THIS FILE EXISTS. The Console's cards and the Timeline's lanes had this
// contract; the Sessions tables, the Turns page, the search results and the
// mission feeds did not — so right-clicking a session on the Dashboard offered
// Copy/Paste and nothing else, and the eleven things you can do to a session
// were reachable only from two of the six places a session is listed. A shared
// helper makes the NEXT surface free: one call and its rows have the full menu.
//
// A row only needs to know what it knows. `sessionId` OR `file` is enough —
// the host resolves the rest from the session index (see sessionFromArg in
// extension.ts), so a search hit that only has a transcript path gets the same
// menu as a live Console card.
(function () {
    'use strict';

    /** The section name for a plain session row — the full action set. */
    const ROW_SECTION = 'afSessionRow';

    function attr(o) {
        return `data-vscode-context="${JSON.stringify(o)
            .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}"`;
    }

    /**
     * The attribute for one session row.
     *   s     — whatever the row knows: { sessionId?, file?, title?, agentName?, cwd? }
     *   extra — extra context keys (a page's own state, or a different
     *           webviewSection when the page has surface-specific items too)
     */
    function row(s, extra) {
        const o = {
            webviewSection: ROW_SECTION, preventDefaultContextMenuItems: false,
            sessionId: (s && s.sessionId) || '', file: (s && s.file) || '',
            title: (s && s.title) || '', agentName: (s && s.agentName) || '',
            cwd: (s && s.cwd) || ''
        };
        if (extra) { for (const k of Object.keys(extra)) { o[k] = extra[k]; } }
        return attr(o);
    }

    /** The tooltip tail every session row carries, so the menu is discoverable
     *  at all — a menu nobody knows about is not a feature. */
    const HINT = 'right-click for session actions';

    window.AFSessionCtx = { attr, row, ROW_SECTION, HINT };
})();
