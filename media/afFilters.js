// Agent Farm — shared filter controls, used by every page that filters a list.
//
// Two things live here, because both answer the same complaint: a filter must
// let you say exactly what you want, and it must answer the moment you say it.
//
// 1. AFFilter.multi — the checkbox dropdown. A plain <select> can only express
//    "all" or "exactly one"; this expresses ANY subset. Semantics are the
//    Search page's, extension-wide:
//        null      = ALL — no filter at all, and a value that appears later
//                    (a new agent, a new model) is included without touching
//                    the picker;
//        []        = NONE — an honest empty result, and the starting point for
//                    "Clear, then tick the two I care about";
//        [a, b, …] = exactly that subset.
//    Ticking every box normalizes back to null. The open menu SURVIVES the
//    page re-render each tick causes — otherwise picking three agents would
//    mean opening the menu three times.
//
// 2. AFFilter.live — filter boxes apply as you type. Every filter input used
//    to wait for blur or Enter, so a typed number sat there doing nothing
//    until you clicked somewhere else. live() debounces the keystrokes and
//    restores focus + caret across the re-render the filter triggers, so the
//    box you are typing in keeps the cursor.
//    (Editors that SAVE — settings, pricing, forms — deliberately stay on
//    'change': there, every keystroke would be a write.)
(function () {
    'use strict';

    // The menu that is open right now, carried across re-renders. Only one is
    // ever open, so page-global state is enough and costs nothing.
    let openId = null;
    let openScroll = 0;
    let focusValue = null;   // which checkbox to re-focus after the re-render
    let docWired = false;
    // What each picker is, written when its HTML is built and read when it is
    // wired — so a page states its label and options exactly once.
    const defs = {};

    function esc(s) {
        return String(s === undefined || s === null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function cssEsc(s) {
        const str = String(s);
        if (typeof CSS !== 'undefined' && CSS && typeof CSS.escape === 'function') { return CSS.escape(str); }
        return str.replace(/[^a-zA-Z0-9_-]/g, ch => '\\' + ch);
    }

    /** Options accept 'name' | {v,t} | {value,label} — pages already use all three. */
    function normOptions(list) {
        return (list || []).map(o => {
            if (o && typeof o === 'object') {
                const v = o.v !== undefined ? o.v : o.value;
                const t = o.t !== undefined ? o.t : (o.label !== undefined ? o.label : v);
                return { v: String(v === undefined || v === null ? '' : v), t: String(t) };
            }
            return { v: String(o), t: String(o) };
        });
    }

    /** null → all · [] → none · one → its own label · many → n/total. */
    function buttonText(o, opts, sel) {
        const label = o.label || 'Filter';
        if (sel === null || sel === undefined) { return label + ': ' + (o.allLabel || 'all'); }
        if (!sel.length) { return label + ': none'; }
        if (sel.length === 1) {
            const hit = opts.find(x => x.v === sel[0]);
            return label + ': ' + (hit ? hit.t : sel[0]);
        }
        return label + ': ' + sel.length + '/' + opts.length;
    }

    /** The sentence every one of these boxes now needs, because it gained a
     *  second gesture. Written once so twenty pickers cannot describe it in
     *  twenty ways. */
    const MULTI_HINT = 'Tick any combination. Click a NAME to show only that one; '
        + 'the checkbox itself still toggles. Select all / Clear are above the list.';

    /**
     * ‼️ K-16 — WHAT IS TICKED, IN FULL, BEFORE ANYTHING ELSE IN THE HOVER.
     *
     * The button can only ever say `show: 3/7` once more than one thing is
     * ticked, so the one question a reader has in front of a filtered list —
     * *which three?* — could only be answered by OPENING the menu, a gesture
     * that means "I am about to change this". The hover was sitting there
     * spending all of itself on a sentence that never changes.
     *
     * Every picker in the extension gets this from the component, so no page
     * has to remember to do it and none of them can word it differently. The
     * standing explanation still follows, after a blank line — see the ordering
     * rule in docs/CONVENTIONS.md.
     */
    function selectionLine(o, opts, sel) {
        const label = o.label || 'Filter';
        if (sel === null || sel === undefined) { return label + ': ' + (o.allLabel || 'all'); }
        if (!sel.length) { return label + ': none'; }
        const names = sel.map(v => {
            const hit = opts.find(x => x.v === v);
            return hit ? hit.t : v;
        });
        return label + ': ' + names.join(' · ');
    }

    /**
     * o: { id, label, options, selected, title, allLabel, disabled, width,
     *      presets: [{ id, label, title, values: [...] }],
     *      align: 'right' when the picker sits at the right edge of a header }
     * `id` must be unique on the page — it keys the button, the menu and the
     * survives-a-re-render open state.
     *
     * ‼️ TWO GESTURES ON ONE ROW, and they answer two different questions.
     * "Also show me tool calls" is a TOGGLE and always was. "Show me only what
     * the agent said" is the far commoner move and used to cost a Clear plus a
     * tick — or, before Clear existed, unticking six boxes one at a time. So the
     * checkbox keeps the toggle and the NAME beside it means ONLY THIS. That is
     * why the item is no longer a `<label>`: a label hands every click to its
     * checkbox, which is precisely the behaviour being split in two.
     *
     * `presets` are the named subsets a particular list has a word for — the
     * Console's "Dialog" (you and the agent, nothing else). They sit in the
     * tools row between Select all and Clear because that is where a reader
     * already looks for "set the whole list at once", and they are per-picker
     * data rather than a component-level idea: nothing here knows what a dialog
     * is.
     */
    function multi(o) {
        const opts = normOptions(o.options);
        const sel = o.selected === undefined ? null : o.selected;
        const presets = (o.presets || []).filter(p => p && p.id && Array.isArray(p.values));
        defs[o.id] = { label: o.label, allLabel: o.allLabel, opts, presets };
        const on = v => sel === null || sel.indexOf(v) >= 0;
        const items = opts.map(x =>
            `<span class="afms-item">` +
            `<input type="checkbox" data-afms-opt="${esc(x.v)}"${on(x.v) ? ' checked' : ''}` +
            ` title="Tick or untick just this one">` +
            `<span class="afms-name" data-afms-only="${esc(x.v)}"` +
            ` title="Show only ${esc(x.t)}">${esc(x.t)}</span></span>`).join('');
        const presetHtml = presets.map(p =>
            ` · <a data-afms-preset="${esc(p.id)}" title="${esc(p.title || '')}">${esc(p.label || p.id)}</a>`).join('');
        const style = o.width ? ` style="min-width:${Number(o.width)}px"` : '';
        return `<span class="afms" data-afms-wrap="${esc(o.id)}">` +
            `<button type="button" class="secondary afms-btn" data-afms="${esc(o.id)}"` +
            `${o.disabled ? ' disabled' : ''} title="${esc(selectionLine(o, opts, sel) + '\n\n'
                + (o.title ? o.title + '\n\n' + MULTI_HINT : MULTI_HINT))}">` +
            `${esc(buttonText(o, opts, sel))} ▾</button>` +
            `<div class="afms-menu${o.align === 'right' ? ' right' : ''}" data-afms-menu="${esc(o.id)}"${style}${openId === o.id ? '' : ' hidden'}>` +
            `<div class="afms-tools"><a data-afms-act="all">Select all</a>${presetHtml} · <a data-afms-act="none">Clear</a></div>` +
            `${items || '<span class="muted small">nothing to filter by</span>'}` +
            `</div></span>`;
    }

    function stop(ev) { if (ev && ev.stopPropagation) { ev.stopPropagation(); } }

    function closeMenus(root) {
        const scope = root && root.querySelectorAll ? root : document;
        if (!scope || typeof scope.querySelectorAll !== 'function') { return; }
        Array.prototype.forEach.call(scope.querySelectorAll('[data-afms-menu]'), m => { m.hidden = true; });
    }

    function wireDocClose() {
        if (docWired || typeof document === 'undefined' || !document.addEventListener) { return; }
        docWired = true;
        document.addEventListener('click', () => { openId = null; closeMenus(document); });
    }

    /**
     * o: { id, onChange, root? } — label and options come from the multi() call
     * that built this picker. onChange(selected) gets null (all) or an array of
     * values. Call this once per render, right after the page writes its HTML.
     */
    function wireMulti(o) {
        const root = o.root && o.root.querySelector ? o.root : document;
        if (!root || typeof root.querySelector !== 'function') { return; }
        const btn = root.querySelector(`[data-afms="${cssEsc(o.id)}"]`);
        const menu = root.querySelector(`[data-afms-menu="${cssEsc(o.id)}"]`);
        if (!btn || !menu || !menu.querySelectorAll) { return; }
        const def = defs[o.id] || { opts: normOptions(o.options) };
        const total = def.opts.length;
        const boxes = () => Array.prototype.slice.call(menu.querySelectorAll('[data-afms-opt]'));
        const read = () => boxes().filter(b => b.checked).map(b => b.dataset.afmsOpt);
        const emit = (arr, focusVal) => {
            openId = o.id;
            openScroll = menu.scrollTop || 0;
            focusValue = focusVal === undefined ? null : focusVal;
            // every box ticked = no filter, so a value that appears later is in
            const sel = total && arr.length === total ? null : arr;
            // keep the button honest even on pages that answer without a
            // re-render (Search re-runs the query instead of rebuilding)
            btn.textContent = buttonText(def, def.opts, sel) + ' ▾';
            o.onChange(sel);
        };
        if (btn.addEventListener) {
            btn.addEventListener('click', ev => {
                stop(ev);
                const willOpen = menu.hidden !== false;
                closeMenus(root === document ? document : root);
                menu.hidden = !willOpen;
                openId = willOpen ? o.id : null;
            });
        }
        if (menu.addEventListener) { menu.addEventListener('click', stop); }
        boxes().forEach(b => {
            if (b.addEventListener) { b.addEventListener('change', () => emit(read(), b.dataset.afmsOpt)); }
        });
        const act = (name, fn) => {
            const a = menu.querySelector(`[data-afms-act="${name}"]`);
            if (a && a.addEventListener) {
                a.addEventListener('click', ev => { stop(ev); boxes().forEach(fn); emit(read()); });
            }
        };
        act('all', b => { b.checked = true; });
        act('none', b => { b.checked = false; });
        // A named subset: tick exactly its values, untick the rest. A value the
        // preset names but this list does not have is simply not there — the
        // preset is written against a vocabulary, not against one render.
        (def.presets || []).forEach(p => {
            const a = menu.querySelector(`[data-afms-preset="${cssEsc(p.id)}"]`);
            if (!a || !a.addEventListener) { return; }
            a.addEventListener('click', ev => {
                stop(ev);
                boxes().forEach(b => { b.checked = p.values.indexOf(b.dataset.afmsOpt) >= 0; });
                emit(read());
            });
        });
        // …and the same idea per row: the NAME means "only this". The checkbox
        // next to it keeps the toggle, which is why the two are separate
        // elements now (see multi()).
        Array.prototype.forEach.call(menu.querySelectorAll('[data-afms-only]'), el => {
            if (!el.addEventListener) { return; }
            el.addEventListener('click', ev => {
                stop(ev);
                const only = el.dataset.afmsOnly;
                boxes().forEach(b => { b.checked = b.dataset.afmsOpt === only; });
                emit(read(), only);
            });
        });
        // reopen where the user left off — the re-render that a tick causes
        // must not close the menu under their hand
        if (openId === o.id) {
            menu.hidden = false;
            if (openScroll) { try { menu.scrollTop = openScroll; } catch (e) { /* stub DOM */ } }
            if (focusValue !== null) {
                const t = boxes().filter(b => b.dataset.afmsOpt === focusValue)[0];
                focusValue = null;
                if (t && t.focus) { try { t.focus(); } catch (e) { /* stub DOM */ } }
            }
        }
        wireDocClose();
    }

    // ------------------------------------------------- live typing + caret

    /** A selector that finds this element again in the re-rendered page. */
    function selPath(el) {
        if (!el || !el.tagName) { return null; }
        if (el.id) { return '#' + cssEsc(el.id); }
        let s = el.tagName.toLowerCase();
        const cls = typeof el.className === 'string' ? el.className.trim() : '';
        if (cls) { s += cls.split(/\s+/).map(c => '.' + cssEsc(c)).join(''); }
        ['data-f', 'data-ef', 'data-tf', 'data-tq', 'name'].forEach(a => {
            const v = el.getAttribute ? el.getAttribute(a) : null;
            if (v) { s += '[' + a + '="' + String(v).replace(/"/g, '\\"') + '"]'; }
        });
        return s;
    }

    function snapshot(el) {
        const sel = selPath(el);
        if (!sel || typeof document === 'undefined' || !document.querySelectorAll) { return null; }
        let idx = 0;
        try { idx = Array.prototype.indexOf.call(document.querySelectorAll(sel), el); } catch (e) { return null; }
        let start, end;
        try { start = el.selectionStart; end = el.selectionEnd; } catch (e) { /* number/date inputs */ }
        return { sel, idx: idx < 0 ? 0 : idx, start, end };
    }

    function restore(s) {
        if (!s || typeof document === 'undefined' || !document.querySelectorAll) { return; }
        let el = null;
        try { el = document.querySelectorAll(s.sel)[s.idx]; } catch (e) { return; }
        if (!el || !el.focus) { return; }
        try { el.focus(); } catch (e) { return; }
        if (s.start !== undefined && s.start !== null && el.setSelectionRange) {
            try { el.setSelectionRange(s.start, s.end); } catch (e) { /* number/date inputs */ }
        }
    }

    /**
     * Filter as you type: the handler runs a short beat after the last
     * keystroke (and at once on blur/commit), and the caret survives the
     * re-render the handler triggers.
     * `delay` defaults to 180ms; pass more for filters that post to the host.
     */
    function live(el, fn, delay) {
        if (!el || !el.addEventListener) { return; }
        const wait = delay === undefined ? 180 : delay;
        let timer = null;
        let last = el.value;
        const run = () => {
            timer = null;
            last = el.value;
            const snap = snapshot(el);
            fn(el);
            restore(snap);
        };
        /**
         * ‼️ A DATE BOX IS NEVER FILTERED WHILE ITS CALENDAR IS OPEN.
         *
         * `fn` repaints the page, and a repaint replaces this element — so the
         * native calendar popup, which belongs to the element it was opened
         * from, is left hanging off a detached node and shuts. `restore()`
         * puts the caret back in the new box but cannot reopen a popup.
         *
         * `<input type="date">` fires `input` the moment its three segments
         * happen to form a valid date, which during a calendar gesture is
         * whenever the picker moves through a complete one — so the popup
         * closed under the cursor, before a day had been chosen, and only
         * sometimes: it depended on whether the field already had a value and
         * where in the popup you had got to. That is the reported randomness.
         *
         * `change` is the event that means A DATE WAS CHOSEN. Chromium fires
         * it when the popup commits, when a typed date completes, and when the
         * field is cleared — every case the debounce was covering — and by
         * then the popup has closed itself. So nothing is lost by waiting for
         * it, and the gesture is never interrupted. (Dashboard's own date
         * boxes already did exactly this; the table filters went through here.)
         */
        const isDate = /^(date|datetime-local|month|week|time)$/i.test(String(el.type || ''));
        if (!isDate) {
            el.addEventListener('input', () => {
                if (timer) { clearTimeout(timer); }
                timer = setTimeout(run, wait);
            });
        }
        // blur / Enter / a date picked from the calendar: apply straight away,
        // unless the debounce already did it
        el.addEventListener('change', () => {
            if (timer) { clearTimeout(timer); timer = null; }
            if (el.value !== last) { run(); }
        });
    }

    /**
     * Give a text box the ✕ that empties it (styled in common.css, `.af-clr`).
     *
     * ‼️ THE BUTTON IS BORN AND DIES WITH THE TEXT. It is created when there is
     * something to clear and removed when there is not, rather than hidden and
     * shown: an empty box with a dead ✕ hanging in it is a control that says it
     * can do something it cannot, and this row already has enough of those.
     *
     * The box is wrapped once, in place. Calling this twice on the same element
     * is a no-op, so a page may wire it from a render path without counting.
     * `onClear` runs after the value is emptied — pass the same handler the box
     * filters with, so clearing IS a filter change and not just a blank box.
     */
    function clearable(el, onClear) {
        if (!el || !el.parentNode || el.dataset.afClr === '1') { return; }
        el.dataset.afClr = '1';
        const wrap = document.createElement('span');
        wrap.className = 'af-clr';
        // whatever the box was laid out as, the wrapper now has to be
        el.parentNode.insertBefore(wrap, el);
        wrap.style.flex = el.style.flex || '';
        wrap.style.minWidth = el.style.minWidth || '';
        el.style.flex = '';
        el.style.minWidth = '';
        wrap.appendChild(el);
        let btn = null;
        const sync = () => {
            const want = !!el.value;
            if (want && !btn) {
                btn = document.createElement('button');
                btn.className = 'af-clrx';
                btn.type = 'button';
                btn.textContent = '✕';
                btn.title = 'Clear this box';
                btn.addEventListener('mousedown', ev => ev.preventDefault()); // keep the caret
                btn.addEventListener('click', () => {
                    el.value = '';
                    sync();
                    el.focus();
                    if (typeof onClear === 'function') { onClear(el); }
                    else { el.dispatchEvent(new Event('input', { bubbles: true })); }
                });
                wrap.appendChild(btn);
            } else if (!want && btn) {
                btn.remove();
                btn = null;
            }
        };
        el.addEventListener('input', sync);
        el.addEventListener('change', sync);
        sync();
    }

    /** clearable() over every match — the same convenience liveAll is. */
    function clearableAll(root, selector, onClear) {
        const scope = root && root.querySelectorAll ? root : document;
        if (!scope || typeof scope.querySelectorAll !== 'function') { return; }
        Array.prototype.forEach.call(scope.querySelectorAll(selector), el => clearable(el, onClear));
    }

    /** live() over every match — for the class-based filter boxes in tables. */
    function liveAll(root, selector, fn, delay) {
        const scope = root && root.querySelectorAll ? root : document;
        if (!scope || typeof scope.querySelectorAll !== 'function') { return; }
        Array.prototype.forEach.call(scope.querySelectorAll(selector), el => live(el, fn, delay));
    }

    window.AFFilter = {
        multi, wireMulti, live, liveAll, clearable, clearableAll, esc,
        // testing / reset hooks
        _closeMenus: () => { openId = null; closeMenus(document); },
        _openId: () => openId
    };
})();
