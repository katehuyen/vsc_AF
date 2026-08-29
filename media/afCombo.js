// Agent Farm — AFCombo: the searchable multi-pick box, with chips.
//
// ‼️ U-90 — A TAXONOMY TYPED FROM MEMORY IS THREE TAXONOMIES.
//
// The tagger asked what a turn was about with a free-text box, and free text is
// how `Ajanlar`, `ajanlar` and `Ajanlar ` become three categories, three
// folders in the vault and an index that agrees with none of them. Nobody
// spells consistently from memory across weeks — the same reason the session
// menu is a picker (S-38) — so the list has to be in front of the person at the
// moment they answer.
//
// What it offers is the UNION of two different facts, and it says which is
// which: the wiki's own folders (`00_WIKI/*` — where a page would go, whether
// or not one has been written yet) and the topics the candidate pool already
// uses (what is already marked). Neither list alone is the answer.
//
// ‼️ IT IS A CONTRACT, NOT A WIDGET. The surfaces that use it repaint their
// whole markup on every state change, so a component holding private state
// inside that would be wiped mid-keystroke. So the OWNER holds the state
// (`query`, `open`, `active`, `picked`), this draws it, and `wire()` binds the
// gestures back onto that same object and asks the owner to repaint. The caret
// is put back by hand afterwards, for the reason U-98 was filed: a repaint
// gives you a NEW element, and the new one starts at position 0.
(function () {
    'use strict';

    const esc = s => String(s === undefined || s === null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    // ‼️ Turkish, deliberately. `I`/`ı` and `İ`/`i` are the pair the default
    // lowercase gets wrong, and this list is Turkish more often than not.
    const fold = s => String(s || '').toLocaleLowerCase('tr').trim();

    /**
     * What matches, best first: what STARTS with the query before what merely
     * contains it, then alphabetically in the user's own collation. An empty
     * query is not a filter — clicking an empty box is how you ask to see
     * everything (U-90 item 4).
     */
    function filter(options, query) {
        const q = fold(query);
        const list = (options || []).filter(o => o && o.name);
        if (!q) { return list.slice(); }
        const rank = o => {
            const n = fold(o.name);
            return n.startsWith(q) ? 0 : n.indexOf(q) >= 0 ? 1 : -1;
        };
        return list.filter(o => rank(o) >= 0)
            .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'tr'));
    }

    /** Is the query already one of the options, however it is spelled? */
    function exact(options, query) {
        const q = fold(query);
        return !!q && (options || []).some(o => fold(o.name) === q);
    }

    /** What one option is, in the words of the two lists it can come from. */
    function optionTip(o) {
        const bits = [];
        bits.push(o.pages !== undefined && o.pages !== null
            ? `Wiki folder: ${o.pages} page${o.pages === 1 ? '' : 's'}`
            : 'Not a folder yet — a compile makes one when it writes the first page.');
        if (o.marks) { bits.push(`Marked: ${o.marks} in the pool${o.pending ? ` · ${o.pending} waiting` : ''}`); }
        return bits.join('\n');
    }

    /**
     * The box. `o` is the owner's state plus what it wants offered:
     *   id · options[{name,pages?,marks?,pending?}] · picked[] · query · open ·
     *   active · placeholder · create (offer "+ start the category")
     *
     * ‼️ U-120 — A CHIP CAN CARRY WHAT THE OWNER KNOWS ABOUT IT, and only the
     * owner knows it. `picked` is a list of NAMES, which is the whole reason a
     * chip could not say which mark it came from: the scope lives in the
     * owner's state, not in the string. So the owner may pass
     * `chipMeta(name) -> { cls, head, body, tipCls, tipAttrs }` and the chip is
     * drawn with that class and wrapped in the hover it describes. It stays
     * OPTIONAL because this box is shared (the cockpit's row editor draws the
     * same chips over a mark that already has one scope, and has nothing to
     * add); turning `picked` into a list of objects instead would break both
     * call sites to serve one.
     */
    function html(o) {
        const picked = o.picked || [];
        const list = filter(o.options, o.query);
        const canMake = !!o.create && !!fold(o.query) && !exact(o.options, o.query);
        const meta = typeof o.chipMeta === 'function' ? o.chipMeta : null;
        const chips = picked.map(p => {
            const m = (meta && meta(p)) || null;
            const chip = `<span class="afc-chip${m && m.cls ? ' ' + esc(m.cls) : ''}">${esc(p)}<button
                class="afc-x" data-afc-off="${esc(p)}"
                title="Take ${esc(p)} off this mark">✕</button></span>`;
            return m && m.body && window.AFTip
                ? window.AFTip.wrap(chip, m.head || '', m.body, m.tipCls || '', m.tipAttrs || '')
                : chip;
        }).join('');
        // The create row is FIRST when it exists: it is what the person is
        // doing when the list is empty, and hunting for it under a list that
        // did not match is the delay this whole box exists to remove.
        const mk = canMake
            ? `<button class="afc-opt afc-mk${o.active === 0 ? ' hot' : ''}" data-afc-new="1"
                title="Makes the folder for &quot;${esc(o.query)}&quot; in the wiki and files this mark under it. Enter on its own keeps the topic WITHOUT making a folder — the compile makes one when it writes the page.">+ start the category “${esc(o.query)}”</button>`
            : '';
        const off = canMake ? 1 : 0;
        const opts = list.map((c, i) => {
            const on = picked.some(p => fold(p) === fold(c.name));
            const count = c.pages !== undefined && c.pages !== null ? c.pages : (c.marks || 0);
            return `<button class="afc-opt${on ? ' on' : ''}${o.active === i + off ? ' hot' : ''}"
                data-afc-pick="${esc(c.name)}" title="${esc(optionTip(c))}"><span class="afc-t">${esc(c.name)}</span>
                <span class="afc-n">${count}</span></button>`;
        }).join('');
        const none = !list.length && !canMake
            ? `<div class="afc-none">${esc(o.query ? 'Nothing matches — type a name to start one.'
                : 'Nothing filed yet — type the first topic.')}</div>`
            : '';
        return `<div class="afc" data-afc="${esc(o.id)}">
            <div class="afc-box" data-afc-box="${esc(o.id)}">${chips}<input class="afc-in"
                id="${esc(o.id)}-in" type="text" autocomplete="off" spellcheck="false"
                value="${esc(o.query || '')}" placeholder="${esc(o.placeholder || 'search…')}"></div>
            ${o.open ? `<div class="afc-pop">${mk}${opts}${none}</div>` : ''}
        </div>`;
    }

    /** Put the caret back where it was — a repaint hands you a NEW input, and
     *  the new one starts at 0 (U-98). */
    function focus(id, at) {
        const el = document.getElementById(id + '-in');
        if (!el) { return; }
        try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
        if (at === undefined || at === null) { return; }
        try { el.setSelectionRange(at, at); } catch (e) { /* not a box with a caret */ }
    }

    /** One picked value on or off, matched the way the list matches. */
    function toggle(picked, name) {
        const at = picked.findIndex(p => fold(p) === fold(name));
        if (at >= 0) { picked.splice(at, 1); } else { picked.push(name); }
        return picked;
    }

    /**
     * Bind the gestures. `o` carries the same `id`/`options`/`create` as html(),
     * plus `state` (the object html() was drawn from), `render` (the owner's
     * repaint) and the two things only the owner can do:
     *   onCreate(query) — make the folder · onDone() — Enter with nothing to pick
     */
    function wire(root, o) {
        if (!root || typeof root.querySelectorAll !== 'function') { return; }
        const st = o.state;
        const el = document.getElementById(o.id + '-in');
        const opts = () => filter(o.options, st.query);
        const rows = () => (o.create && fold(st.query) && !exact(o.options, st.query) ? 1 : 0) + opts().length;
        const repaint = (at) => { o.render(); focus(o.id, at); };
        // ‼️ TAKING ONE PUTS THE LIST AWAY. The list is drawn over the panel it
        // sits in, so leaving it down after a pick covers the button the reader
        // was heading for — measured on the tagger, where "Keep it" is directly
        // underneath. A second one is one press (or one keystroke) away, and
        // the typing flow never notices: typing opens it again.
        const take = (name) => {
            toggle(st.picked, name);
            st.query = ''; st.active = 0; st.open = false;
            repaint(0);
        };
        if (el) {
            el.addEventListener('input', () => {
                st.query = el.value;
                st.open = true;
                st.active = 0;
                repaint(el.selectionStart);
            });
            // ‼️ A PRESS opens the list, not focus. The owner puts the keyboard
            // in this box when its panel opens, and a list that dropped open on
            // that would cover the button the reader was heading for. Pressing
            // an empty box is how you ask to see everything (U-90 item 4).
            el.addEventListener('mousedown', () => {
                if (st.open) { return; }
                st.open = true;
                setTimeout(() => repaint(el.value.length), 0);
            });
            el.addEventListener('keydown', ev => {
                const n = rows();
                if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
                    ev.preventDefault();
                    if (!st.open) { st.open = true; st.active = 0; } else if (n) {
                        st.active = ev.key === 'ArrowDown'
                            ? Math.min((st.active || 0) + 1, n - 1)
                            : Math.max((st.active || 0) - 1, 0);
                    }
                    repaint(el.selectionStart);
                    return;
                }
                if (ev.key === 'Enter') {
                    ev.preventDefault();
                    st.query = el.value;
                    const mk = o.create && fold(st.query) && !exact(o.options, st.query);
                    if (st.open && mk && (st.active || 0) === 0) {
                        if (o.onCreate) { o.onCreate(st.query); }
                        return;
                    }
                    const list = opts();
                    const hit = st.open ? list[(st.active || 0) - (mk ? 1 : 0)] : null;
                    if (hit) { take(hit.name); return; }
                    // ‼️ A word nobody has filed yet still counts. It becomes a
                    // topic here and a folder when a compile writes its page —
                    // making the folder is the deliberate, separate gesture.
                    if (fold(st.query)) { take(el.value.trim()); return; }
                    if (o.onDone) { o.onDone(); }
                    return;
                }
                if (ev.key === 'Escape') {
                    if (st.open) { ev.stopPropagation(); st.open = false; repaint(el.selectionStart); }
                    return;
                }
                if (ev.key === 'Backspace' && !el.value && st.picked.length) {
                    ev.preventDefault();
                    st.picked.pop();
                    repaint(0);
                }
            });
        }
        root.querySelectorAll('[data-afc-pick]').forEach(node =>
            node.addEventListener('mousedown', ev => { ev.preventDefault(); take(node.dataset.afcPick); }));
        root.querySelectorAll('[data-afc-off]').forEach(node =>
            node.addEventListener('mousedown', ev => {
                ev.preventDefault();
                ev.stopPropagation();
                toggle(st.picked, node.dataset.afcOff);
                repaint(el ? el.selectionStart : 0);
            }));
        root.querySelectorAll('[data-afc-new]').forEach(node =>
            node.addEventListener('mousedown', ev => {
                ev.preventDefault();
                if (o.onCreate) { o.onCreate(st.query); }
            }));
        root.querySelectorAll('[data-afc-box]').forEach(node =>
            node.addEventListener('mousedown', ev => {
                if (ev.target && ev.target.closest && ev.target.closest('[data-afc-off],.afc-in')) { return; }
                ev.preventDefault();
                st.open = true;
                repaint(el ? el.value.length : 0);
            }));
    }

    window.AFCombo = { filter, exact, html, wire, focus, toggle, fold };
})();
