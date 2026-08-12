// Agent Farm — the rich hover panel. ONE hover surface for everything a native
// `title` cannot carry.
//
// ‼️ THE RULE THIS FILE EXISTS TO ENFORCE (see docs/CONVENTIONS.md → "Hover"):
// a native `title` is for a handful of FIGURES and nothing else. The moment a
// hover has to show TEXT — a prompt, an item, a description, a path list — it
// uses this panel instead, because the platform tooltip repeats what is already
// drawn on the row and then stops wherever it feels like stopping. This is the
// box the backlog's `more` proved out: as wide as it needs, scrollable past a
// limit, and the pointer can travel INTO it (the :hover is on the WRAPPER, not
// on the trigger — a tooltip that closes when you reach for it cannot be
// scrolled, and scrolling is the whole point).
//
// Two shapes, one component:
//   AFTip.wrap(trigger, head, body)  — wrap any inline trigger
//   AFTip.cell(attrs, inner, head, body) — a whole <td> becomes the trigger
//
// The body is TEXT, printed whole. The head is the one line of context that
// says what you are looking at and how big it is — never an explanation.
(function () {
    'use strict';

    function esc(s) {
        return String(s === undefined || s === null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /** Lines → one block, empties dropped. The caller writes `label: value`
     *  pairs; nothing here adds words of its own. */
    function lines(parts) {
        return (parts || []).filter(function (p) {
            return p !== '' && p !== undefined && p !== null;
        }).join('\n');
    }

    /** How big the thing you are hovering is — the head's whole job, plus
     *  whatever identity the caller passes in front of it. */
    function sizeNote(text) {
        const n = String(text || '').length;
        return n ? n.toLocaleString() + ' characters' : '';
    }

    function panel(head, body) {
        return '<span class="af-tip">'
            + (head ? '<span class="af-tiph">' + esc(head) + '</span>' : '')
            + '<span class="af-tipb">' + esc(body) + '</span></span>';
    }

    /**
     * Wrap an inline trigger. The wrapper is `position:relative`, so the panel
     * opens under the trigger; pass `block:true` inside a `<td>` that is itself
     * the positioning context (see `cell`).
     *
     * `cls` puts a class on the WRAPPER, which matters wherever the trigger sat
     * in a layout: wrapping it makes the wrapper the flex/grid child, so a
     * column that was sized by its trigger's own rule silently stops being
     * sized at all. Give the wrapper the class and size that.
     *
     * `attrs` is anything else the wrapper needs, ALREADY ESCAPED by the caller
     * — in practice `data-aftip-anchor` (see `tip-free` below), which names the
     * block a free panel is measured against.
     */
    function wrap(trigger, head, body, cls, attrs) {
        if (!String(body || '').trim()) { return trigger; }
        const a = String(attrs || '').trim();
        return '<span class="af-tipw' + (cls ? ' ' + esc(cls) : '') + '"' + (a ? ' ' + a : '') + '>'
            + trigger + panel(head, body) + '</span>';
    }

    /**
     * A table cell whose whole area is the trigger.
     *   cls   — the cell's own classes ('' for none); the positioning class is added
     *   attrs — everything else the `<td>` needs (already escaped by the caller)
     *   inner — what the cell draws
     * The panel is measured against the CELL, which is why the `<td>` carries
     * the positioning class rather than an inner span.
     */
    function cell(cls, attrs, inner, head, body) {
        const a = String(attrs || '').trim();
        const c = String(cls || '').trim();
        if (!String(body || '').trim()) {
            return '<td' + (c ? ' class="' + c + '"' : '') + (a ? ' ' + a : '') + '>' + inner + '</td>';
        }
        return '<td class="' + (c ? c + ' ' : '') + 'af-tipw"' + (a ? ' ' + a : '') + '>'
            + inner + panel(head, body) + '</td>';
    }

    /* ------------------------------------------------------------------
       ‼️ THE PANEL MUST SURVIVE A REPAINT UNDER A STATIONARY POINTER.

       The pages this thing lives on redraw whole sections on the host's own
       beat (`setRows` → `innerHTML = …`), and a browser does NOT re-apply
       `:hover` to the node that replaced the one the pointer was on — not
       until the pointer moves again. So a panel you were three lines into
       reading closed by itself, with the mouse never having left it, and did
       not come back. That is the bug, and it belongs HERE rather than in each
       page: every surface that uses this component had it.

       The bridge: when the wrapper under the pointer is torn out, find what is
       now at the point where the pointer ENTERED it (not where the pointer is —
       it may be inside the panel, which floats over other rows) and mark that
       with a class the CSS honours with no delay. The class lasts exactly until
       the pointer moves somewhere else, at which moment `:hover` is honest
       again and takes over. The panel's scroll position rides along, because a
       long prompt jumping back to its first line is the same interruption in a
       quieter form.
       ------------------------------------------------------------------ */
    const doc = typeof document === 'object' && document ? document : null;

    /* ------------------------------------------------------------------
       ‼️ K-18 — A PANEL NEVER OPENS TOWARDS THE EDGE IT IS ALREADY ON.

       The default panel hangs under its trigger (`top:100%`), which is right
       everywhere except where it matters most: the composer's `?` sits a few
       pixels off the BOTTOM of the window, so the panel opened downwards and
       almost all of it was outside the viewport. The same thing happens on the
       right-hand edge of a wide row.

       The rule, and it is not specific to this component: **a hover surface
       near an edge opens towards the CENTRE of the window, never further
       towards the edge it is already against.** Nobody should have to remember
       it per call site, so it is decided here, from measurements, at the moment
       the pointer arrives — before the open delay has elapsed, so the panel is
       never seen moving.

       Two computed classes, `af-up` and `af-left`, honoured by common.css. They
       are the component's, not the caller's: `tip-right` and `tip-block` are
       what a PAGE says about a layout, and this never argues with either.
       `tip-free` is placed in full by `place()` below and is left alone.
       ------------------------------------------------------------------ */
    /** The gap a panel keeps from the window's own edge. */
    const EDGE = 8;

    function flip(w) {
        if (!w || !w.classList || !w.querySelector) { return; }
        if (w.classList.contains('tip-free')) { return; }
        const tip = w.querySelector('.af-tip');
        if (!tip || typeof tip.getBoundingClientRect !== 'function') { return; }
        w.classList.remove('af-up');
        w.classList.remove('af-left');
        // The panel is laid out even while hidden (`visibility`, not `display`),
        // so this is the real size it will open at rather than a guess.
        const host = tip.offsetParent || w;
        if (!host || typeof host.getBoundingClientRect !== 'function') { return; }
        const a = host.getBoundingClientRect();
        const h = tip.offsetHeight || 0;
        const wd = tip.offsetWidth || 0;
        const root = doc.documentElement || {};
        const vw = root.clientWidth || 0;
        const vh = root.clientHeight || 0;
        if (!vw || !vh || !h || !wd) { return; }
        // Vertical: below the anchor by default, above it when below does not
        // fit AND above is the roomier half. Where neither fits, the roomier
        // half still shows more of the panel than the cramped one.
        if (h > vh - EDGE - a.bottom && a.top - EDGE > vh - EDGE - a.bottom) {
            w.classList.add('af-up');
        }
        // Horizontal only where the page has not already decided it.
        if (!w.classList.contains('tip-block') && !w.classList.contains('tip-right')
            && wd > vw - EDGE - a.left && a.right - EDGE > vw - EDGE - a.left) {
            w.classList.add('af-left');
        }
    }

    if (doc && typeof doc.addEventListener === 'function'
        && typeof MutationObserver === 'function' && typeof doc.elementFromPoint === 'function') {

        const closestW = el => (el && typeof el.closest === 'function' ? el.closest('.af-tipw') : null);
        /** The wrapper the pointer is over, where it entered, how far the panel
         *  had been scrolled — the three things a rebuild would otherwise lose. */
        let over = null, atX = -1, atY = -1, scrolled = 0;
        /** Set only while the class is standing in for a lost `:hover`. */
        let bridged = null;

        const drop = () => {
            if (bridged) { bridged.classList.remove('af-on'); bridged = null; }
        };

        doc.addEventListener('pointerover', function (e) {
            const w = closestW(e.target);
            if (!w || w === over) { return; }
            over = w; atX = e.clientX; atY = e.clientY; scrolled = 0;
            // Which way it opens is decided now, while the open delay is still
            // running: a panel that jumps to the other side after it is visible
            // is worse than one that opened in the wrong place.
            flip(w);
        }, true);

        doc.addEventListener('pointermove', function (e) {
            if (!bridged) { return; }
            // A real move re-computes :hover for whatever is under the pointer,
            // so the stand-in has done its job — unless the pointer is still on
            // the same wrapper, where :hover now carries it anyway.
            if (closestW(doc.elementFromPoint(e.clientX, e.clientY)) !== bridged) { over = null; }
            drop();
        }, true);

        doc.addEventListener('pointerout', function (e) {
            const w = closestW(e.target);
            if (w && w === over && !(e.relatedTarget && w.contains(e.relatedTarget))) {
                over = null; drop();
            }
        }, true);

        // Remember how far into a long body the reader had got.
        doc.addEventListener('scroll', function (e) {
            const t = e.target;
            if (t && t.classList && t.classList.contains('af-tip')) { scrolled = t.scrollTop || 0; }
        }, true);

        let queued = false;
        const restore = () => {
            queued = false;
            if (!over || over.isConnected) { return; }
            const w = closestW(doc.elementFromPoint(atX, atY));
            over = w;
            if (!w) { return; }
            w.classList.add('af-on');
            bridged = w;
            // The replacement node is a different element in a redrawn section;
            // it may not sit exactly where the old one did.
            flip(w);
            const tip = w.querySelector('.af-tip');
            if (tip && scrolled) { tip.scrollTop = scrolled; }
        };

        new MutationObserver(function () {
            // Cheap on the common path: nothing is open, or what is open is
            // still in the document.
            if (queued || !over || over.isConnected) { return; }
            queued = true;
            if (typeof requestAnimationFrame === 'function') { requestAnimationFrame(restore); } else { restore(); }
        }).observe(doc.documentElement || doc, { childList: true, subtree: true });
    }

    /* ------------------------------------------------------------------
       ‼️ U-43 — A PANEL INSIDE A SCROLLING MENU IS A PANEL NOBODY CAN READ.

       Every rule above assumes the panel may grow out of its trigger. Put the
       trigger inside a box that SCROLLS — the capture strip's "part of" picker,
       a 340px column with `overflow:auto` on it — and three things go wrong at
       once, and they are the user's own three complaints:

         · the box is clipped to the menu, so a panel meant to be 620px wide is
           squeezed into the picker and shows almost nothing;
         · it cannot be reached, because the pointer has to leave the row to get
           to it and `:hover` is gone the instant it does — the menu's own
           scrollbar is not part of the tip either;
         · and it opens at a touch, which on a list you are sweeping down is a
           paragraph flashing at every row.

       So `tip-free` takes the panel OUT of the flow (`position:fixed`, which is
       the one thing an ancestor's `overflow` cannot clip), places it against the
       BLOCK the picker belongs to rather than against the row the pointer
       happens to be on, and gives both edges of the gesture a delay: longer to
       open than the CSS default, and a grace period on the way out so the
       pointer can travel into it.

       Opt in per trigger: `AFTip.wrap(trigger, head, body, 'tip-free')`, plus
       `data-aftip-anchor="<selector>"` on the wrapper naming the block to
       measure against (`closest`). Without an anchor the trigger is used, which
       is the old behaviour minus the clipping.
       ------------------------------------------------------------------ */
    /** Long enough that sweeping a list does not flash panels; short enough that
     *  resting on a row still feels like an answer rather than a wait. */
    const FREE_OPEN_MS = 420;
    /** The walk from the row to the panel. Measured against nothing but the
     *  gesture: below ~250ms the panel closes under a normal hand, and above
     *  ~500ms a panel you have finished with follows you around. */
    const FREE_CLOSE_MS = 340;

    if (doc && typeof doc.addEventListener === 'function') {
        let openW = null, openT = 0, closeT = 0;

        const panelOf = w => (w ? w.querySelector('.af-tip') : null);

        const place = w => {
            const tip = panelOf(w);
            if (!tip) { return; }
            const sel = w.getAttribute && w.getAttribute('data-aftip-anchor');
            const anchor = (sel && typeof w.closest === 'function' && w.closest(sel)) || w;
            const a = anchor.getBoundingClientRect();
            const vw = doc.documentElement.clientWidth || 800;
            const vh = doc.documentElement.clientHeight || 600;
            // ‼️ The panel must clear the MENU, not the row: opening beside a
            // row halfway down a scrolling list would sit on top of the list.
            let bottom = a.bottom;
            let node = w.parentElement;
            while (node && node !== anchor) {
                const st = typeof getComputedStyle === 'function' ? getComputedStyle(node) : null;
                if (st && /auto|scroll|hidden/.test(st.overflowY || '')) {
                    bottom = Math.max(bottom, node.getBoundingClientRect().bottom);
                }
                node = node.parentElement;
            }
            const width = Math.max(280, Math.min(760, vw - 16, Math.max(a.width, 380)));
            tip.style.width = width + 'px';
            tip.style.maxWidth = width + 'px';
            tip.style.left = Math.max(8, Math.min(a.left, vw - width - 8)) + 'px';
            // Measured after the width is set — a panel's height is a function
            // of how wide it was allowed to be.
            tip.style.top = '0px';
            const h = tip.offsetHeight || 0;
            tip.style.top = (bottom + 4 + h <= vh - 8
                ? bottom + 4
                : Math.max(8, Math.min(a.top - h - 4, vh - h - 8))) + 'px';
        };

        const close = () => {
            if (!openW) { return; }
            openW.classList.remove('af-open');
            openW = null;
        };

        doc.addEventListener('pointerover', function (e) {
            const t = e.target;
            const w = t && typeof t.closest === 'function' ? t.closest('.af-tipw.tip-free') : null;
            // Inside the panel itself: that is the reader arriving, not leaving.
            if (w && w === openW) { clearTimeout(closeT); return; }
            clearTimeout(openT);
            if (!w) {
                if (openW) { clearTimeout(closeT); closeT = setTimeout(close, FREE_CLOSE_MS); }
                return;
            }
            clearTimeout(closeT);
            openT = setTimeout(function () {
                if (!w.isConnected) { return; }
                close();
                openW = w;
                w.classList.add('af-open');
                place(w);
            }, FREE_OPEN_MS);
        }, true);

        // A repaint under a stationary pointer takes the wrapper away; the panel
        // must go with it rather than hang over the page pointing at nothing.
        doc.addEventListener('scroll', function () {
            if (openW) { openW.isConnected ? place(openW) : close(); }
        }, true);
    }

    window.AFTip = { wrap: wrap, cell: cell, lines: lines, sizeNote: sizeNote, esc: esc };
})();
