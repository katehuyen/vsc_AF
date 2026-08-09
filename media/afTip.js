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
     */
    function wrap(trigger, head, body, cls) {
        if (!String(body || '').trim()) { return trigger; }
        return '<span class="af-tipw' + (cls ? ' ' + esc(cls) : '') + '">'
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

    window.AFTip = { wrap: wrap, cell: cell, lines: lines, sizeNote: sizeNote, esc: esc };
})();
