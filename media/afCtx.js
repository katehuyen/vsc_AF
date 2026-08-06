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

    /**
     * The attribute for one AGENT row — the second named shape, after sessions.
     *
     * ‼️ WHY IT IS A NAMED SHAPE. An agent is listed on six pages (Dashboard
     * cards, the comparison table, Portfolio, the Timeline's lanes, its own
     * detail header, the memory graph's picker) and every one of them had a
     * different two or three buttons. `resolveAgent` on the host side needs
     * exactly one key — `agentId` — so the whole menu is HOST COMMANDS: a page
     * publishes this and gets the full set with no handler of its own. That is
     * why it is worth a named door rather than six hand-written calls.
     *
     * It is a method here rather than its own file (afSessionCtx's shape earns
     * one — it carries five keys, a HINT and a history); this is one key.
     */
    function agent(a, extra) {
        return row('afAgentRow', {
            agentId: (a && (a.agentId || a.id)) || '',
            agentName: (a && (a.agentName || a.name)) || '',
            agentDir: (a && (a.agentDir || a.dir)) || ''
        }, extra);
    }

    /**
     * Put something on the clipboard and SAY SO.
     *
     * ‼️ WHY IT LIVES HERE. A copy changes nothing you can see, so a copy that
     * reported nothing is indistinguishable from a menu item that does not work
     * — and "Copy ▸" is on nearly every object's menu. Fifteen pages each
     * writing their own clipboard call is fifteen chances for one of them to
     * fail silently.
     *
     * `say(message, isError)` is optional: a page that already draws a flash
     * line passes its own setter and the message lands where that page's other
     * messages land. Without one, the toast below is used.
     */
    function copy(value, say) {
        const text = String(value === undefined || value === null ? '' : value);
        const tell = say || toast;
        if (!text) { tell('Nothing to copy — that row does not carry it.', true); return; }
        const shown = 'Copied: ' + (text.length > 60 ? text.slice(0, 57) + '…' : text);
        const nav = typeof navigator !== 'undefined' ? navigator : null;
        if (nav && nav.clipboard && nav.clipboard.writeText) {
            nav.clipboard.writeText(text).then(
                () => tell(shown, false),
                () => tell('The clipboard refused that.', true));
            return;
        }
        tell('This window has no clipboard access.', true);
    }

    /** The fallback report: one floating line, gone in three seconds. It is
     *  positioned and styled inline because it has to work on every page,
     *  including the ones whose stylesheet knows nothing about it. */
    function toast(message, isError) {
        const doc = typeof document !== 'undefined' ? document : null;
        if (!doc || !doc.body) { return; }
        let el = doc.getElementById('afctx-toast');
        if (!el) {
            el = doc.createElement('div');
            el.id = 'afctx-toast';
            el.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:9999;max-width:60ch;'
                + 'padding:7px 12px;border-radius:6px;font-size:12px;pointer-events:none;'
                + 'border:1px solid var(--vscode-widget-border,#4444);'
                + 'background:var(--vscode-editorWidget-background,#222);'
                + 'color:var(--vscode-foreground);box-shadow:0 2px 10px #0006;';
            doc.body.appendChild(el);
        }
        el.textContent = message;
        el.style.borderColor = isError
            ? 'var(--vscode-errorForeground,#f85149)'
            : 'var(--vscode-focusBorder,#0af)';
        el.style.opacity = '1';
        if (el._afT) { clearTimeout(el._afT); }
        el._afT = setTimeout(() => { el.style.opacity = '0'; }, 3000);
        el.style.transition = 'opacity .3s';
    }

    /** The tooltip tail an agent row carries — it says what the menu is FOR. */
    const AGENT_HINT = 'right-click for everything this agent can be asked to do';

    window.AFCtx = {
        attr, obj, row, agent, hint, listen, copy, toast, HINT, AGENT_HINT, panel
    };
})();
