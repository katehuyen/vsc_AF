// Agent Farm — the phone layer (U-176), shipped to every page.
//
// A page drawn on a phone (the remote host's view, or any coarse pointer) and
// narrower than PHONE_MAX gets `html.af-phone`: the header's nav cluster steps
// aside for a bottom tab bar (Now · Console · Sessions · Tasks · Menu, Menu
// holding every other page), and a long press on anything carrying an AFTip
// opens its whole text in a bottom sheet — a hover a finger cannot make. A VS
// Code tab under a mouse is never touched, however narrow its column.
(function () {
    'use strict';
    var PHONE_MAX = 600;
    var PRESS_MS = 500;
    var TABS = [
        { id: 'now', icon: '◉', label: 'Now' },
        { id: 'console', icon: '💬', label: 'Console' },
        { id: 'sessions', icon: '☰', label: 'Sessions' },
        { id: 'tasks', icon: '✓', label: 'Tasks' }
    ];
    // Asked when a tab is pressed, not at load: afCtx.js hands every later caller the one shared handle.
    function host() { return typeof window.acquireVsCodeApi === 'function' ? window.acquireVsCodeApi() : null; }
    var current = '';
    var bar = null;
    var sheet = null;

    function touchHost() {
        var ui = window.__AFUI__ || {};
        var root = document.documentElement;
        if (!root || !root.classList) { return false; }
        return ui.remote === true || !!window.afShell || root.hasAttribute('data-af-phone')
            || (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches);
    }

    function isPhone() { return touchHost() && (window.innerWidth || 0) > 0 && window.innerWidth < PHONE_MAX; }

    function esc(s) {
        return String(s === undefined || s === null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    /** U-189 — the interface language (media/afI18n.js). */
    function tr(s) { return window.AFI18n.t(s); }

    function go(to) {
        closeSheet();
        var api = host();
        if (api && to && to !== current) { api.postMessage({ type: 'afnav', to: to }); }
    }

    var CSS = ''
        + 'html.af-phone{--af-bottom:56px}'
        + 'html.af-phone .af-head-nav{display:none}'
        + 'html.af-phone body{padding-bottom:calc(var(--af-bottom) + 8px)}'
        + 'html.af-phone button,html.af-phone select{min-height:36px}'
        + '.af-tabbar{position:fixed;left:0;right:0;bottom:0;height:var(--af-bottom,56px);display:flex;z-index:60;'
        + 'background:var(--vscode-sideBar-background,var(--af-ground,var(--vscode-editor-background)));border-top:1px solid var(--vscode-panel-border)}'
        + '.af-tabbar button{flex:1;min-width:0;min-height:48px;background:none;border:0;border-radius:0;color:inherit;'
        + 'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-size:11px;opacity:.8;padding:0}'
        + '.af-tabbar button.on{opacity:1;font-weight:600;box-shadow:inset 0 3px 0 var(--vscode-focusBorder)}'
        + '.af-tabbar .af-tabi{font-size:18px;line-height:1}'
        + '.af-sheet-veil{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:70}'
        + '.af-sheet{position:fixed;left:0;right:0;bottom:0;max-height:75vh;overflow:auto;z-index:71;padding:10px 12px 16px;'
        + 'background:var(--vscode-editorWidget-background,var(--af-ground,var(--vscode-editor-background)));border-top:1px solid var(--vscode-panel-border);'
        + 'border-radius:12px 12px 0 0}'
        + '.af-sheet-h{display:flex;align-items:center;justify-content:space-between;font-weight:600;margin-bottom:6px}'
        + '.af-sheet-x{min-width:44px;min-height:44px;background:none;border:0;color:inherit;font-size:18px}'
        + '.af-sheet-go{display:block;width:100%;text-align:left;min-height:44px;margin:2px 0;background:none;border:0;'
        + 'border-bottom:1px solid var(--vscode-panel-border);color:inherit;padding:6px 4px}'
        + '.af-sheet-go.on{font-weight:600}'
        + '.af-sheet-go small{display:block;opacity:calc(1 - .3 * var(--af-dimk, 1));font-weight:400;margin-top:2px}'
        + '.af-sheet-t{white-space:pre-wrap;word-break:break-word;user-select:text;margin:0;font:inherit}'
        + '.af-sheet-sub{opacity:.8;margin-bottom:6px}'
        // A dense table marked data-afcards is a list of cards: the lead cell on its own line,
        // every figure under it wearing its column's data-label, no column dropped (DENSITY).
        + 'html.af-phone table[data-afcards],html.af-phone table[data-afcards]>tbody{display:block;width:100%}'
        + 'html.af-phone table[data-afcards]>colgroup,html.af-phone table[data-afcards] tr[data-afcardhead]{display:none}'
        + 'html.af-phone table[data-afcards] tr[data-afcard]{display:flex;flex-wrap:wrap;align-items:center;gap:4px 12px;'
        + 'padding:8px 6px;border-bottom:1px solid var(--vscode-panel-border)}'
        + 'html.af-phone table[data-afcards] tr[data-afcard]>td{display:block;border:0;padding:0;width:auto;max-width:100%}'
        + 'html.af-phone table[data-afcards] tr[data-afcard]>td[data-lead]{order:-1;flex:1 1 calc(100% - 96px);min-width:0;font-weight:600}'
        + 'html.af-phone table[data-afcards] tr[data-afcard]>td[data-first]{order:-2}'
        + 'html.af-phone table[data-afcards] td[data-label]::before{content:attr(data-label) " ";opacity:.6;font-size:10px}'
        + 'html.af-phone table[data-afcards] tr[data-afcardmore],html.af-phone table[data-afcards] tr[data-afcardmore]>td{display:block}'
        + 'html.af-phone table[data-afcards] tr[data-afcardmore]>td[data-first]{display:none}';

    function style() {
        if (document.getElementById('af-mobile-css')) { return; }
        var s = document.createElement('style');
        s.id = 'af-mobile-css';
        s.textContent = CSS;
        (document.head || document.body).appendChild(s);
    }

    function barHtml() {
        return TABS.map(function (t) {
            return '<button data-aftab="' + t.id + '"' + (t.id === current ? ' class="on" aria-current="page"' : '')
                + ' aria-label="' + esc(tr(t.label)) + '"><span class="af-tabi">' + t.icon + '</span>' + esc(tr(t.label)) + '</button>';
        }).join('') + '<button data-aftab="menu" aria-label="' + esc(tr('Menu: every page')) + '"><span class="af-tabi">⋯</span>'
            + esc(tr('Menu')) + '</button>';
    }

    function drawBar() {
        if (!bar) {
            bar = document.createElement('nav');
            bar.id = 'af-tabbar';
            bar.className = 'af-tabbar';
            bar.addEventListener('click', function (ev) {
                var b = ev.target && ev.target.closest ? ev.target.closest('[data-aftab]') : null;
                if (!b) { return; }
                if (b.dataset.aftab === 'menu') { openMenu(); } else { go(b.dataset.aftab); }
            });
            document.body.appendChild(bar);
        }
        bar.innerHTML = barHtml();
    }

    var onSheetClose = null;
    function closeSheet() {
        if (!sheet) { return; }
        sheet.forEach(function (el) { if (el.parentNode) { el.parentNode.removeChild(el); } });
        sheet = null;
        var after = onSheetClose;
        onSheetClose = null;
        if (after) { after(); }
    }

    /** `onClose` runs once, however the sheet goes (✕, the veil, a pick, another sheet). */
    function openSheet(title, body, onClose) {
        closeSheet();
        style();
        onSheetClose = typeof onClose === 'function' ? onClose : null;
        var veil = document.createElement('div');
        veil.className = 'af-sheet-veil';
        veil.addEventListener('click', closeSheet);
        var box = document.createElement('div');
        box.className = 'af-sheet';
        box.id = 'af-sheet';
        box.setAttribute('role', 'dialog');
        box.innerHTML = '<div class="af-sheet-h"><span>' + esc(title) + '</span>'
            + '<button class="af-sheet-x" data-afsheetx aria-label="' + esc(tr('Close')) + '">✕</button></div>' + body;
        box.addEventListener('click', function (ev) {
            var t = ev.target && ev.target.closest ? ev.target : null;
            if (!t) { return; }
            if (t.closest('[data-afsheetx]')) { closeSheet(); return; }
            var g = t.closest('[data-afsheetgo]');
            if (g) { go(g.dataset.afsheetgo); }
        });
        document.body.appendChild(veil);
        document.body.appendChild(box);
        sheet = [veil, box];
    }

    function openMenu() {
        var pages = window.AFHeader && window.AFHeader.pages ? window.AFHeader.pages() : [];
        var shown = {};
        TABS.forEach(function (t) { shown[t.id] = true; });
        var rows = pages.filter(function (p) { return !shown[p.id]; }).map(function (p) {
            return '<button class="af-sheet-go' + (p.id === current ? ' on' : '') + '" data-afsheetgo="' + esc(p.id) + '">'
                + esc(p.label) + (p.tip ? '<small>' + esc(p.tip) + '</small>' : '') + '</button>';
        }).join('');
        openSheet(tr('Every page'), rows);
    }

    /** The whole of an AFTip, readable: what a hover says, for a finger. */
    function openTip(wrapEl) {
        var panel = wrapEl.querySelector('.af-tip');
        if (!panel) { return false; }
        var part = function (sel) { var e = panel.querySelector(sel); return e ? e.textContent : ''; };
        var head = part('.af-tiph'), sub = part('.af-tipt'), body = part('.af-tipb');
        if (!head && !body) { return false; }
        openSheet(head || 'Details', (sub ? '<div class="af-sheet-sub">' + esc(sub) + '</div>' : '')
            + '<pre class="af-sheet-t">' + esc(body) + '</pre>');
        return true;
    }

    // ---- a row's menu: the catalogue's page actions (src/core/ctxmenu.ts), judged on the phone

    function val(ctx, key) { return Object.prototype.hasOwnProperty.call(ctx, key) ? ctx[key] : undefined; }
    function unquote(s) { var m = /^'(.*)'$|^"(.*)"$/.exec(s.trim()); return m ? (m[1] !== undefined ? m[1] : m[2]) : s.trim(); }

    /** One term of a VS Code when clause against the row's context. What the row cannot know
     *  (a list the PC holds, a setting, parentheses) is false: the item is not offered. */
    function term(t, ctx) {
        var neg = false;
        while (t.charAt(0) === '!') { neg = !neg; t = t.slice(1).trim(); }
        var m, v;
        if ((m = /^([\w.]+)\s*=~\s*\/(.*)\/([a-z]*)$/.exec(t))) {
            try { v = new RegExp(m[2], m[3]).test(String(val(ctx, m[1]) === undefined ? '' : val(ctx, m[1]))); } catch (e) { return false; }
        } else if ((m = /^([\w.]+)\s*(==|!=)\s*(.+)$/.exec(t))) {
            var have = val(ctx, m[1]);
            v = have !== undefined && String(have) === unquote(m[3]);
            if (m[2] === '!=') { v = !v; }
        } else if (/^[\w.]+$/.test(t)) {
            v = !!val(ctx, t);
        } else {
            return false;
        }
        return neg ? !v : v;
    }

    function whenTrue(expr, ctx) {
        return String(expr || '').split('||').some(function (alt) {
            return alt.split('&&').every(function (t) { return term(t.trim(), ctx); });
        });
    }

    function rowCtx(el) {
        try { return JSON.parse(el.getAttribute('data-vscode-context') || '{}') || {}; } catch (e) { return {}; }
    }

    function actionsFor(ctx) {
        var all = (window.__AFUI__ || {}).ctxMenu || [];
        var seen = {};
        return all.filter(function (a) {
            var k = a.act + '|' + a.title;
            if (seen[k] || !whenTrue(a.when, ctx)) { return false; }
            seen[k] = true;
            return true;
        });
    }

    function openRow(row, tipEl) {
        var ctx = rowCtx(row);
        var acts = actionsFor(ctx);
        if (!acts.length) { return tipEl ? openTip(tipEl) : false; }
        var sub = '';
        var body = acts.map(function (a, i) {
            var head = a.menu && a.menu !== sub ? '<div class="af-sheet-sub">' + esc(a.menu) + '</div>' : '';
            sub = a.menu || '';
            return head + '<button class="af-sheet-go" data-afrowact="' + i + '">' + esc(a.title) + '</button>';
        }).join('') + (tipEl ? '<button class="af-sheet-go" data-afrowtip>ⓘ Details</button>' : '');
        openSheet(ctx.needTitle || ctx.title || 'This row', body);
        var box = document.getElementById('af-sheet');
        box.addEventListener('click', function (ev) {
            var b = ev.target && ev.target.closest ? ev.target.closest('[data-afrowact],[data-afrowtip]') : null;
            if (!b) { return; }
            if (b.hasAttribute('data-afrowtip')) { openTip(tipEl); return; }
            var a = acts[Number(b.dataset.afrowact)];
            closeSheet();
            // the same relay the desktop menu's command sends: the page runs its own function
            window.dispatchEvent(new MessageEvent('message', { data: { type: 'afctx', act: a.act, ctx: ctx } }));
        });
        return true;
    }

    var press = null;
    function onDown(ev) {
        if (!document.documentElement.classList.contains('af-phone')) { return; }
        var t = ev.target && ev.target.closest ? ev.target : null;
        if (!t) { return; }
        var w = t.closest('.af-tipw');
        var row = t.closest('[data-vscode-context]');
        if (!w && !row) { return; }
        var x = ev.clientX, y = ev.clientY;
        press = { x: x, y: y, fired: false, t: setTimeout(function () {
            if (press) { press.fired = row ? openRow(row, w) : openTip(w); }
        }, PRESS_MS) };
    }
    function onMove(ev) {
        if (press && (Math.abs(ev.clientX - press.x) > 10 || Math.abs(ev.clientY - press.y) > 10)) { cancel(); }
    }
    function cancel() { if (press) { clearTimeout(press.t); press = null; } }
    function onClick(ev) {
        // a press that opened the sheet is not also a tap on what was under it
        if (press && press.fired) { ev.preventDefault(); ev.stopPropagation(); }
        press = null;
    }

    function apply() {
        var on = isPhone();
        if (!on && !bar) { return; }
        document.documentElement.classList.toggle('af-phone', on);
        if (on) { style(); drawBar(); } else { closeSheet(); if (bar) { bar.remove(); bar = null; } }
    }

    function page(id) {
        current = String(id || '');
        if (bar) { bar.innerHTML = barHtml(); }
    }

    // A page without a real document (the tests' DOM shim) gets the API and no listeners.
    if (typeof document.addEventListener === 'function' && document.documentElement) {
        document.addEventListener('pointerdown', onDown, true);
        document.addEventListener('pointermove', onMove, true);
        document.addEventListener('pointerup', function () { if (press && !press.fired) { cancel(); } }, true);
        document.addEventListener('pointercancel', cancel, true);
        document.addEventListener('click', onClick, true);
        document.addEventListener('contextmenu', function (ev) {
            if (document.documentElement.classList.contains('af-phone') && ev.target && ev.target.closest
                && ev.target.closest('.af-tipw,[data-vscode-context]')) { ev.preventDefault(); }
        }, true);
        if (typeof window.addEventListener === 'function') { window.addEventListener('resize', apply); }
        if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', apply); } else { apply(); }
    }

    window.AFMobile = {
        apply: apply, page: page, isPhone: isPhone, openMenu: openMenu, openTip: openTip, openRow: openRow,
        openSheet: openSheet, closeSheet: closeSheet,
        whenTrue: whenTrue, actionsFor: actionsFor, TABS: TABS, PHONE_MAX: PHONE_MAX
    };
})();
