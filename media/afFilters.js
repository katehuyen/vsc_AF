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
    /**
     * ‼️ U-92 — WHAT WAS TYPED INTO THE OPEN MENU'S FIND BOX, PER PICKER.
     *
     * A list of five is a list you read; a list of thirty categories is a list
     * you scroll past the thing you wanted. So a long menu carries a find box —
     * and because every tick re-renders the page that drew the menu, what was
     * typed has to survive that re-render exactly as the scroll position does.
     * Keyed by picker id and kept module-wide for the same reason `openId` is:
     * one menu is open at a time.
     */
    const findText = {};
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
                return {
                    v: String(v === undefined || v === null ? '' : v), t: String(t),
                    // U-92 — a row may carry a figure the short label cannot. It
                    // is a handful of numbers on a row inside an open menu, so
                    // it is a native title (docs/CONVENTIONS.md → Hover): an
                    // AFTip over a dropdown would cover the list it explains.
                    ...(o.hint ? { hint: String(o.hint) } : {})
                };
            }
            return { v: String(o), t: String(o) };
        });
    }

    /** How many options it takes before the menu draws its own find box. Five
     *  is a list you read; thirty is a list you scroll past what you wanted. */
    const FIND_FROM = 12;

    /** ‼️ Folded the Turkish way, like the wiki picker (media/afCombo.js): a
     *  plain `toLowerCase()` turns `TARIM` into `tarim`, which does not find
     *  `Tarım`, and the user filters their own categories in their own
     *  language. */
    const fold = s => String(s || '').toLocaleLowerCase('tr').trim();

    /**
     * ‼️ A-14 — THE BUTTON'S TEXT IS A READOUT, NOT THE OPTION'S FULL SENTENCE.
     *
     * An option is allowed to be a sentence, because in the open menu it has a
     * line to itself and a reader is choosing between them: "filed — has a
     * code", "wholes only — nobody's part". Printing that sentence ON THE BUTTON
     * is what made the backlog's control row unusable — the row grew by forty
     * characters on one press, the tail wrapped to the next line, pressing again
     * pulled it back, and the whole strip rocked back and forth under the hand.
     *
     * So the button prints the option's HEAD and the hover carries it in full
     * (`selectionLine`, which is the first thing in the panel). The cut is at a
     * word or at the dash the sentences use, never mid-word.
     */
    const ONE_MAX = 16;

    function shorten(t) {
        const s = String(t === undefined || t === null ? '' : t);
        if (s.length <= ONE_MAX) { return s; }
        // A sentence-shaped option says its head first and explains after a
        // dash; that head is exactly what the button wants.
        const dash = s.search(/\s[—–-]\s/);
        if (dash > 0 && dash <= ONE_MAX) { return s.slice(0, dash) + '…'; }
        const cut = s.slice(0, ONE_MAX - 1);
        const space = cut.lastIndexOf(' ');
        return (space > 5 ? cut.slice(0, space) : cut).replace(/[\s—–-]+$/, '') + '…';
    }

    /** null → all · [] → none · one → its own label, cut · many → n/total. */
    function buttonText(o, opts, sel) {
        const label = o.label || 'Filter';
        if (sel === null || sel === undefined) { return label + ': ' + shorten(o.allLabel || 'all'); }
        if (!sel.length) { return label + ': none'; }
        if (sel.length === 1) {
            const hit = opts.find(x => x.v === sel[0]);
            return label + ': ' + shorten(hit ? hit.t : sel[0]);
        }
        return label + ': ' + sel.length + '/' + opts.length;
    }

    /**
     * ‼️ …AND IT RESERVES THAT WIDTH WHETHER IT IS USING IT OR NOT.
     *
     * Cutting the text is half the fix: `state: all` and `state: cancelled` are
     * still different widths, so the row still moved on every press — just less
     * far. The widest thing this button can EVER print is knowable at the moment
     * it is drawn, so it is measured once and the button is given it. Nothing
     * else in the row has to know, and no page has to declare a width.
     *
     * `ch` is the width of a `0`, which in a proportional face is wider than an
     * average lowercase letter — so this over-reserves slightly rather than
     * clipping, which is the right way round. `text-overflow` in common.css is
     * the safety net for a label made mostly of emoji.
     */
    function buttonWidth(o, opts) {
        const label = (o.label || 'Filter').length + 2;          // "state: "
        const widest = [o.allLabel || 'all', 'none', opts.length + '/' + opts.length]
            .concat(opts.map(x => shorten(x.t)))
            .reduce((m, s) => Math.max(m, String(s).length), 0);
        return label + widest + 3;                                // + " ▾"
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
            `<span class="afms-item"${x.hint ? ` title="${esc(x.hint)}"` : ''}>` +
            `<input type="checkbox" data-afms-opt="${esc(x.v)}"${on(x.v) ? ' checked' : ''}` +
            ` aria-label="Toggle ${esc(x.t)}">` +
            `<span class="afms-name" data-afms-only="${esc(x.v)}"` +
            ` role="button" tabindex="0" aria-label="Show only ${esc(x.t)}">${esc(x.t)}</span></span>`).join('');
        /**
         * ‼️ U-92 — A LONG LIST EARNS A FIND BOX, AND IT EARNS IT BY BEING LONG.
         *
         * Not a per-caller flag anybody has to remember: a picker with five
         * options does not need one and a picker with thirty is unusable
         * without one, and the component knows which it is. `search:false`
         * turns it off for a list that is deliberately short-and-ordered;
         * `search:true` forces it on.
         */
        const searchable = o.search === true || (o.search !== false && opts.length >= FIND_FROM);
        const findBox = searchable
            ? `<input type="text" class="afms-find" data-afms-find="${esc(o.id)}"` +
                ` placeholder="find…" value="${esc(findText[o.id] || '')}"` +
                ` aria-label="Filter this list of ${opts.length}">`
            : '';
        const presetHtml = presets.map(p =>
            ` · <a data-afms-preset="${esc(p.id)}" aria-label="${esc(p.title || p.label || p.id)}">${esc(p.label || p.id)}</a>`).join('');
        const style = o.width ? ` style="min-width:${Number(o.width)}px"` : '';
        const explanation = o.title ? o.title + '\n\n' + MULTI_HINT : MULTI_HINT;
        // ‼️ A-14 — NO SECOND SIGNAL THAT A FILTER IS SET. The button already
        // says it, in words, in the one place a reader is looking: `state: 2/4`
        // is not `state: every state`. The inset bar and re-tinted fill that
        // arrived with the search rebuild said the same thing again, on a
        // control the user had not asked to have redecorated — and read as a
        // stray bracket beside the box.
        const button = `<button type="button" class="secondary afms-btn" data-afms="${esc(o.id)}"` +
            ` style="width:${buttonWidth(o, opts)}ch"` +
            `${o.disabled ? ' disabled' : ''} aria-label="${esc(selectionLine(o, opts, sel))}">` +
            `${esc(buttonText(o, opts, sel))} ▾</button>`;
        // ‼️ U-61 — TWO DIFFERENT THINGS, AND ONLY ONE OF THEM BELONGS TO EVERY
        // PICKER. The MUTE does: the box's own list drops on top of its
        // explanation, so the panel is behind the menu on every page that has
        // one of these, and a paragraph nobody can read is nobody's preference.
        // The DELAY does not — it is the call site's (`tipDelay`, ms), because
        // one row of boxes wanting a longer wait is no reason to slow every
        // hover in the extension down.
        const tipAttrs = 'data-aftip-mute=".afms.afms-on"'
            + (Number(o.tipDelay) > 0 ? ` data-aftip-open="${Number(o.tipDelay)}"` : '');
        const trigger = window.AFTip && typeof window.AFTip.wrap === 'function'
            ? window.AFTip.wrap(button, selectionLine(o, opts, sel), explanation,
                `tip-free${o.align === 'right' ? ' tip-right' : ''}`, tipAttrs)
            : button;
        return `<span class="afms${openId === o.id ? ' afms-on' : ''}" data-afms-wrap="${esc(o.id)}">` +
            trigger +
            `<div class="afms-menu${o.align === 'right' ? ' right' : ''}" data-afms-menu="${esc(o.id)}"${style}${openId === o.id ? '' : ' hidden'}>` +
            `<div class="afms-tools"><a data-afms-act="all">Select all</a>${presetHtml} · <a data-afms-act="none">Clear</a></div>` +
            findBox +
            `${items || '<span class="muted small">nothing to filter by</span>'}` +
            (searchable ? '<span class="afms-nofind muted small" hidden>nothing matches that</span>' : '') +
            `</div></span>`;
    }

    function stop(ev) { if (ev && ev.stopPropagation) { ev.stopPropagation(); } }

    function closeMenus(root) {
        const scope = root && root.querySelectorAll ? root : document;
        if (!scope || typeof scope.querySelectorAll !== 'function') { return; }
        Array.prototype.forEach.call(scope.querySelectorAll('[data-afms-menu]'), m => { m.hidden = true; });
        // The class the hover panel reads to know it is covered — see the
        // `tipAttrs` note in multi(). It tracks the menu and nothing else.
        Array.prototype.forEach.call(scope.querySelectorAll('.afms.afms-on'),
            s => { s.classList.remove('afms-on'); });
        /**
         * ‼️ U-92 — A FIND BELONGS TO THE VISIT THAT TYPED IT.
         *
         * It must survive the re-render every tick causes (that is the whole
         * reason `findText` exists) and it must NOT survive the menu closing:
         * reopening a picker onto a list silently cut down to `tar` is exactly
         * the invisible-filter trap the find box was added to avoid. Closing is
         * the only path through here, so the state and the boxes drawing it are
         * both put back the way an untouched menu opens.
         */
        Array.prototype.forEach.call(scope.querySelectorAll('.afms-find'), f => {
            const id = f.getAttribute ? f.getAttribute('data-afms-find') : null;
            if (id) { delete findText[id]; }
            f.value = '';
        });
        Array.prototype.forEach.call(scope.querySelectorAll('.afms-menu .afms-item'),
            r => { r.hidden = false; });
        Array.prototype.forEach.call(scope.querySelectorAll('.afms-nofind'), s => { s.hidden = true; });
        Array.prototype.forEach.call(scope.querySelectorAll('.afms-menu [data-afms-act="all"]'),
            a => { a.textContent = 'Select all'; });
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
        const wrap = root.querySelector(`[data-afms-wrap="${cssEsc(o.id)}"]`);
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
                if (wrap) { wrap.classList.toggle('afms-on', willOpen); }
                openId = willOpen ? o.id : null;
            });
        }
        if (menu.addEventListener) { menu.addEventListener('click', stop); }
        boxes().forEach(b => {
            if (b.addEventListener) { b.addEventListener('change', () => emit(read(), b.dataset.afmsOpt)); }
        });
        /**
         * ‼️ U-92 — THE FIND BOX, AND WHAT IT DOES TO "Select all".
         *
         * Typing hides rows; it changes NOTHING about what is ticked, so a
         * filter typed and cleared leaves the selection exactly as it was. But
         * `Select all` and `Clear` then act on what is SHOWN, because with
         * `Tekno` typed that is unmistakably what the reader means — and with
         * an empty box the two are the same thing, which is why this is not a
         * second mode to learn. The tools row says which it is doing.
         */
        const find = menu.querySelector(`[data-afms-find="${cssEsc(o.id)}"]`);
        const rows = () => Array.prototype.slice.call(menu.querySelectorAll('.afms-item'));
        const nofind = menu.querySelector('.afms-nofind');
        const allLink = menu.querySelector('[data-afms-act="all"]');
        const applyFind = () => {
            if (!find) { return; }
            const q = String(find.value || '').trim();
            findText[o.id] = q;
            const needle = fold(q);
            let shown = 0;
            rows().forEach(r => {
                const box = r.querySelector('[data-afms-opt]');
                const label = box ? box.getAttribute('aria-label') || '' : '';
                const hit = !needle || fold(r.textContent || label).indexOf(needle) >= 0;
                r.hidden = !hit;
                if (hit) { shown++; }
            });
            if (nofind) { nofind.hidden = shown > 0; }
            if (allLink) {
                allLink.textContent = needle ? `Select all ${shown} shown` : 'Select all';
            }
        };
        if (find && find.addEventListener) {
            find.addEventListener('input', () => applyFind());
            find.addEventListener('click', stop);
            // Escape empties the box rather than closing the menu under the
            // hand that is still narrowing it.
            find.addEventListener('keydown', ev => {
                if (ev.key === 'Escape') { stop(ev); find.value = ''; applyFind(); }
            });
        }
        applyFind();

        const visible = () => boxes().filter(b => {
            const row = b.parentNode;
            return !row || row.hidden !== true;
        });
        const act = (name, fn) => {
            const a = menu.querySelector(`[data-afms-act="${name}"]`);
            if (a && a.addEventListener) {
                a.addEventListener('click', ev => { stop(ev); visible().forEach(fn); emit(read()); });
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
            const only = ev => {
                stop(ev);
                const value = el.dataset.afmsOnly;
                boxes().forEach(b => { b.checked = b.dataset.afmsOpt === value; });
                emit(read(), value);
            };
            el.addEventListener('click', only);
            el.addEventListener('keydown', ev => {
                if (ev.key === 'Enter' || ev.key === ' ') { if (ev.preventDefault) { ev.preventDefault(); } only(ev); }
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

    /**
     * ‼️ U-98 — A NUMBER BOX HAS NO CARET TO PUT BACK, SO `live()` GIVES IT ONE.
     *
     * `<input type="number">` does not implement the selection API: reading
     * `selectionStart` answers `null` (older Chromium threw), and
     * `setSelectionRange` is refused outright. Everything below stands on those
     * two calls — so on a numeric box the whole caret machinery ran, saved
     * nothing and restored nothing. `restore()` still put the focus back, and a
     * freshly focused input starts at position 0, so **every keystroke sent the
     * caret to the far left**: typing `120` into a min/max filter produced
     * `021`, one character at a time, and the two `catch` clauses that made it
     * possible read like they were handling the case rather than dropping it.
     *
     * The fix is at the root and not at the six call sites that hit it. A box
     * handed to `live()` is by definition a box that will be re-rendered under
     * the reader's hand, so it must be a box whose caret can be read — the
     * component enforces that itself rather than trusting six pages to
     * remember. `inputmode="numeric"` keeps the numeric keypad where there is
     * one; what is given up is the spinner, which was never usable on a filter
     * this narrow. Nothing downstream notices: every handler already parses the
     * text (`Number()` / `parseInt` behind an `isNaN` guard), because a filter
     * box could always be empty.
     */
    function caretable(el) {
        if (!el) { return el; }
        let t = '';
        try {
            t = String(el.type || (el.getAttribute ? el.getAttribute('type') : '') || '').toLowerCase();
        } catch (e) { return el; }
        if (t !== 'number') { return el; }
        try {
            el.type = 'text';
            if (el.setAttribute && el.getAttribute && !el.getAttribute('inputmode')) {
                el.setAttribute('inputmode', 'numeric');
            }
        } catch (e) { /* a host that refuses keeps the old, caret-less behaviour */ }
        return el;
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
        // ‼️ U-98 — the element that came back from the re-render is a NEW one,
        // built from the same markup, so it is a number box again. Convert it
        // before the focus lands: `focus()` on a box with no selection API is
        // exactly what parks the caret at 0.
        caretable(el);
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
        caretable(el);          // ‼️ U-98 — see the note on caretable()
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
        // U-98: exported so the one other page that restores its own focus
        // across a re-render (search.js) shares this guard instead of growing a
        // second blind spot beside it
        caretable,
        // testing / reset hooks
        _closeMenus: () => { openId = null; closeMenus(document); },
        _openId: () => openId
    };
})();
