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
     */
    function wrap(trigger, head, body) {
        if (!String(body || '').trim()) { return trigger; }
        return '<span class="af-tipw">' + trigger + panel(head, body) + '</span>';
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

    window.AFTip = { wrap: wrap, cell: cell, lines: lines, sizeNote: sizeNote, esc: esc };
})();
