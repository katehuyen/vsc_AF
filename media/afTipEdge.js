// Agent Farm — WHERE an AFTip panel opens, and that it is SEEN WHOLE.
//
// afTip.js decides WHEN a panel is open; this file decides where it goes and
// what may stand between it and the reader:
//   flip(w) — which side of its trigger it opens on (K-18); when neither side
//             fits, the box that clips it and the place inside that box it is
//             slid to (K-44); and whether an ancestor would show it through a
//             veil (U-146, `mark`).
// Measurement against the live DOM, written as classes and custom properties
// that common.css honours; no timers and no state of its own. Loaded before
// afTip.js on every page (src/panels/base.ts).
(function () {
    'use strict';

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
       `tip-free` is placed in full by `place()` in afTip.js and is left alone
       — after `mark()`, because a veil covers a floating panel just the same.
       ------------------------------------------------------------------ */
    /** The gap a panel keeps from the window's own edge. */
    const EDGE = 8;

    function flip(w) {
        if (!w || !w.classList || !w.querySelector) { return; }
        mark(w);
        if (w.classList.contains('tip-free')) { return; }
        const tip = w.querySelector('.af-tip');
        if (!tip || typeof tip.getBoundingClientRect !== 'function') { return; }
        w.classList.remove('af-up');
        w.classList.remove('af-left');
        unfit(w, tip);
        const host = tip.offsetParent || w;
        if (!host || typeof host.getBoundingClientRect !== 'function') { return; }
        const a = host.getBoundingClientRect();
        // ‼️ A-12 — A CLOSED PANEL HAS NO BOX (common.css), because a hidden one
        // that is still laid out drags the document's scroll width past the
        // window. By the time this runs the wrapper is normally already
        // `:hover`, so the panel is at its real size — but that is an ordering
        // assumption about the browser, and getting it wrong here would silently
        // stop the flip rather than fail. Measure, and if the box is not there,
        // give it one for the length of this function.
        let h = tip.offsetHeight || 0;
        let wd = tip.offsetWidth || 0;
        let measuring = false;
        if (!h || !wd) {
            measuring = true;
            w.classList.add('af-measure');
            h = tip.offsetHeight || 0;
            wd = tip.offsetWidth || 0;
        }
        const done = () => { if (measuring) { w.classList.remove('af-measure'); } };
        const root = doc.documentElement || {};
        const vw = root.clientWidth || 0;
        const vh = root.clientHeight || 0;
        if (!vw || !vh || !h || !wd) { done(); return; }
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
        contain(w, tip, vw);
        done();
    }

    /* ------------------------------------------------------------------
       ‼️ K-44 — TWO ANCHORS ARE A CHOICE BETWEEN TWO FAILURES WHEN THE PANEL
       IS WIDER THAN THE ROOM ON BOTH SIDES. A nav button in the middle of the
       Console header hung a 760px panel 21px past the window's left edge at
       1400px, and at 744px four kinds of panel ran 26-42px off the right; a
       panel inside a scroller (the conversation) is cut at the scroller's edge
       instead, which reads as the panel sliding under the column beside it.
       So after the flip has picked a side, the panel is measured against the
       box that really clips it — the window, narrowed by every ancestor of its
       containing block that has overflow — and shifted into it; narrowed only
       when even that box is too small. It is written as two custom properties
       plus a class, and the rule in common.css applies them ONLY while the
       panel is open: an inline width would outrank the A-12 collapse rule and
       give every closed panel its box back.
       ------------------------------------------------------------------ */
    function unfit(w, tip) {
        w.classList.remove('af-fit');
        if (tip.style && typeof tip.style.removeProperty === 'function') {
            tip.style.removeProperty('--af-fit-l');
            tip.style.removeProperty('--af-fit-w');
        }
    }

    function contain(w, tip, vw) {
        if (!tip.style || typeof tip.style.setProperty !== 'function') { return; }
        const b = tip.getBoundingClientRect();
        if (!b || !isFinite(b.left) || !isFinite(b.right) || !(b.right > b.left)) { return; }
        let l = EDGE, r = vw - EDGE;
        if (typeof getComputedStyle === 'function') {
            for (let n = tip.offsetParent; n && n !== doc.documentElement && n !== doc.body; n = n.parentElement) {
                const cs = getComputedStyle(n);
                if (cs && /auto|scroll|hidden|clip/.test(cs.overflowX || '')) {
                    const c = n.getBoundingClientRect();
                    l = Math.max(l, c.left);
                    r = Math.min(r, c.right);
                }
            }
        }
        if (b.left >= l - 0.5 && b.right <= r + 0.5) { return; }
        // Its own width, unrounded downwards, unless the box forces less: a
        // pixel shaved off a panel that fits re-wraps its longest line.
        const width = b.width <= r - l ? Math.ceil(b.width) : Math.floor(r - l);
        if (width < 120) { return; }
        const left = Math.max(l, Math.min(b.left, r - width));
        tip.style.setProperty('--af-fit-l', Math.round((tip.offsetLeft || 0) + left - b.left) + 'px');
        tip.style.setProperty('--af-fit-w', width + 'px');
        w.classList.add('af-fit');
    }

    /* ------------------------------------------------------------------
       ‼️ U-146 — A PANEL IS NEVER SEEN THROUGH.

       `opacity` below 1 on ANY ancestor composites the whole subtree at that
       opacity — the panel with it, however opaque its own background — and
       makes that ancestor a stacking context the next row can paint over.
       Nothing inside the ancestor can undo either, and a dimmed row (an ended
       session, a done item, a paused card) is exactly where a panel is most
       needed: it was drawn half-transparent over the text behind it.

       So the translucent ancestors of a panel are lifted to full opacity for
       as long as the panel is open — the row being read comes forward with
       it. This only MARKS them (`af-dimhost`), once, from their computed
       opacity, when a pointer first reaches a panel inside; the lift itself is
       a rule in common.css keyed on the panel's own open states, so it ends
       exactly when the panel does and there is nothing here to forget.
       ------------------------------------------------------------------ */
    function mark(w) {
        if (!doc || typeof getComputedStyle !== 'function') { return; }
        for (let n = w; n && n !== doc.documentElement; n = n.parentElement) {
            if (n.classList && !n.classList.contains('af-dimhost')) {
                const op = parseFloat(getComputedStyle(n).opacity);
                if (op > 0 && op < 1) { n.classList.add('af-dimhost'); }
            }
        }
    }

    window.AFTipEdge = { flip: flip, EDGE: EDGE };
})();
