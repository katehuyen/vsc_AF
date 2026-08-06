// Agent Farm — ONE right-click contract, for every object a page draws.
//
// `afSessionCtx.js` proved the shape on sessions: a row states what it IS in
// `data-vscode-context`, VS Code turns those keys into context keys while the
// menu is open, and `webview/context` entries in package.json decide what is
// drawn. The normal Copy/Paste items stay (`preventDefaultContextMenuItems:
// false`) — hijacking `contextmenu` would take the page's own menu away, and
// that decision is not being revisited.
//
// ‼️ WHY A SECOND, GENERAL FILE. Every page is full of objects — a backlog item,
// a task run, a notice, a skill, an asset — and each one had exactly the same
// need and no way to say it. The session helper hard-codes one section name and
// one payload shape, so a page that wanted a menu for anything else had to copy
// its escaping and invent its own convention. This file owns the contract;
// afSessionCtx now sits on top of it and stays the session-shaped door.
//
// TWO KINDS OF MENU ITEM, and the difference is in package.json, not here:
//   · an existing host command (agentfarm.pinSession) — works anywhere, needs
//     nothing from the page;
//   · a PAGE action, relayed back: the generated command posts
//     { type:'afctx', act, ctx } to the page that drew the row, and the page
//     runs the same function its own button runs. That is the whole point —
//     the menu and the button cannot drift apart because they are one path.
//
// The address for that round trip is `afPanel`, which every context object gets
// automatically. See htmlShell in src/panels/base.ts for where it comes from,
// and src/core/ctxmenu.ts for the catalogue.
(function () {
    'use strict';

    /** The tooltip tail a row with a menu carries. A menu nobody knows about is
     *  not a feature; the session helper's HINT is the long form of this. */
    const HINT = 'right-click for more';

    /** Which page instance this is — written into the HTML by htmlShell. */
    function panel() {
        const ui = window.__AFUI__ || {};
        return ui.ctxPanel || '';
    }

    /** JSON, escaped for an HTML attribute. `>` is escaped along with the rest:
     *  it is legal inside a quoted value and every browser copes, but a bare `>`
     *  in an item's words ends the tag for anything that reads the markup with a
     *  regex — which the page's own tests do, and which is a fair warning. */
    function attr(o) {
        return `data-vscode-context="${JSON.stringify(o)
            .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
            .replace(/</g, '&lt;').replace(/>/g, '&gt;')}"`;
    }

    /**
     * The context object for one row.
     *
     * `undefined` and `null` are dropped — an absent key reads as undefined in a
     * `when` clause, which is what "this row does not know that" should mean.
     * `false` and `''` are KEPT: a menu that draws "Unpin" on `afPinned == true`
     * needs its opposite to be a real false, not a missing key.
     */
    function obj(section, payload, extra) {
        const o = {
            webviewSection: section,
            preventDefaultContextMenuItems: false,
            afPanel: panel()
        };
        for (const src of [payload, extra]) {
            if (!src) { continue; }
            for (const k of Object.keys(src)) {
                const v = src[k];
                if (v !== undefined && v !== null) { o[k] = v; }
            }
        }
        return o;
    }

    /** The attribute for one row — the call every page makes. */
    function row(section, payload, extra) {
        return attr(obj(section, payload, extra));
    }

    /**
     * A tooltip that says the row has a menu. Pass what the row already said;
     * pass nothing and the hint stands alone.
     *
     * NOT html-escaped — callers hand it to their own `esc()` along with the
     * rest of the attribute, exactly as they do today.
     */
    function hint(text) {
        return text ? text + ' — ' + HINT : HINT;
    }

    /**
     * Receive the menu's clicks. One call per page, wired where the page wires
     * everything else.
     *
     * `fn(act, ctx)` gets the action name from the catalogue and the SAME
     * object the row published, so the handler knows which row it was without
     * any click-time bookkeeping — including when the row has since been
     * repainted or filtered away, which is why the identity travels in the
     * context rather than being looked up from a "last right-clicked" variable.
     */
    function listen(fn) {
        window.addEventListener('message', ev => {
            const m = ev && ev.data;
            if (!m || m.type !== 'afctx') { return; }
            fn(String(m.act || ''), m.ctx || {});
        });
    }

    window.AFCtx = { attr, obj, row, hint, listen, HINT, panel };
})();
