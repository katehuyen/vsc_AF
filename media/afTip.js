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
//   AFTip.wrap(trigger, head, body, cls, attrs, title)  — wrap any inline trigger
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

    /**
     * ‼️ A DELIBERATE BLANK LINE IS `GAP`, NOT `''` (audit A-12.9).
     *
     * MIRROR asks for "the current value, THEN A BLANK LINE, then the
     * description" — and every panel written that way was drawing the value
     * stuck to its paragraph, because `lines()` drops `''`. It has to: a
     * conditional line says "nothing here" by evaluating to `''`, and that is
     * the far more common case, so the two intentions cannot share one value.
     *
     * `GAP` is a line that IS there and is blank — a single space. That is not
     * a trick, it is the cheapest form the intention has: it survives `''`
     * filters, `filter(Boolean)`, a plain `.join('\n')` and a native `title`
     * alike, so a gap means the same thing wherever a page writes one and no
     * joiner has to learn about it. `white-space: pre-wrap` on the panel draws
     * it as the empty line the rule asks for.
     */
    const GAP = ' ';

    /** Lines → one block, empties dropped (`GAP` is not empty). The caller
     *  writes `label: value` pairs; nothing here adds words of its own. */
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

    /** `title` names the thing under the pointer, between the head and the
     *  paragraph, so the reader knows the subject before reading a word of it. */
    function panel(head, body, title) {
        return '<span class="af-tip">'
            + (head ? '<span class="af-tiph">' + esc(head) + '</span>' : '')
            + (title ? '<span class="af-tipt">' + esc(title) + '</span>' : '')
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
    function wrap(trigger, head, body, cls, attrs, title) {
        if (!String(body || '').trim()) { return trigger; }
        const a = String(attrs || '').trim();
        return '<span class="af-tipw' + (cls ? ' ' + esc(cls) : '') + '"' + (a ? ' ' + a : '') + '>'
            + trigger + panel(head, body, title) + '</span>';
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

    /**
     * ‼️ X-196 — A FORM LABEL WHOSE WHOLE AREA IS THE TRIGGER, and which stays
     * the element its row is laid out with.
     *
     * The same reason `cell` exists, one element along. Wrapping a `<label>` in
     * `wrap` puts a `<span>` between it and the flex row it sits in, and the
     * row then lays out the span instead — measured on the sentry form, where
     * one wrapped label pushed the box beside it out of line with the rest of
     * its row. So the label CARRIES the positioning class and the panel, and
     * nothing is inserted into the layout at all.
     *
     *   cls   — the label's own classes ('' for none); the positioning class is added
     *   attrs — everything else the `<label>` needs (already escaped by the caller)
     *   inner — what the label draws, control included
     */
    function label(cls, attrs, inner, head, body) {
        const a = String(attrs || '').trim();
        const c = String(cls || '').trim();
        if (!String(body || '').trim()) {
            return '<label' + (c ? ' class="' + c + '"' : '') + (a ? ' ' + a : '') + '>' + inner + '</label>';
        }
        return '<label class="' + (c ? c + ' ' : '') + 'af-tipw"' + (a ? ' ' + a : '') + '>'
            + inner + panel(head, body) + '</label>';
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
       ‼️ U-74 — A HOVER PANEL YIELDS TO THE HAND. THIS IS THE FIRST RULE OF
       THIS COMPONENT, BEFORE ANYTHING ABOUT WHERE IT OPENS OR HOW IT LOOKS.

       A panel exists to answer a question the reader has while they are LOOKING.
       The moment they stop looking and start WORKING — a press, a key — it has
       nothing left to say and everything to be in the way of. The toolbar
       proved it: `Console` is one button that drops a two-item menu under
       itself, and the panel explaining the button opens in exactly the same
       place. Reach for the button, the panel is already there; press it, the
       panel stays (the pointer never left the trigger, so `:hover` never
       ended) and the menu is behind it. The control could not be used at all.

       Two halves, both of them here rather than at the call sites, because a
       rule a page has to remember is a rule the next page will not have:

       1. A PRESS MUTES THE TRIGGER UNDER IT. `af-mute` closes the panel with no
          fade and takes its box away, and it lasts until the pointer LEAVES
          that wrapper — so the panel does not simply reopen under the hand that
          is mid-gesture. Coming back later is a new hover and waits the full
          delay again. A press INSIDE the panel is exempt: selecting a line of a
          prompt is reading, not leaving.
       2. A TRIGGER YOU CAN PRESS OPENS SLOWER. `tip-act` is written from what
          the pointer is actually on — a button, a link, a menu item — and
          doubles the delay, so the ordinary act of aiming at a control and
          pressing it never sees a panel at all. Nothing is passed in for this;
          the DOM already says which things are pressed.

       `data-aftip-mute` (below, U-61) is honoured on this path too, not only on
       `tip-free`: a control whose own list is open covers its explanation, and
       that is true whichever kind of panel explains it.
       ------------------------------------------------------------------ */
    /** What "you press this" looks like in the DOM. Anything a page invents gets
     *  in by carrying `data-aftipact` rather than by editing this list. */
    const CLICKY = 'button,a[href],summary,select,input,textarea,label,'
        + '[role="button"],[role="menuitem"],[role="tab"],[role="link"],'
        + '[data-afnav],[data-afclaim],[data-afclaimgo],[data-afact],[data-afmenugo],[data-aftipact]';

    const closestW = el => (el && typeof el.closest === 'function' ? el.closest('.af-tipw') : null);
    /** A press inside the panel is the reader using the panel. */
    const inPanel = el => !!(el && typeof el.closest === 'function' && el.closest('.af-tip'));

    /** Each open-panel mechanism below registers how it forgets what it had
     *  open, so muting is one act rather than three that can disagree. */
    const closers = [];
    let mutedW = null, hoverW = null;
    /** How far into a long body the reader had got. One number, because only
     *  one panel is ever open — and both repaint bridges below put it back: a
     *  long prompt jumping to its first line is the same interruption as the
     *  panel closing, in a quieter form. */
    let lastScroll = 0;

    function unmute() {
        if (mutedW) { mutedW.classList.remove('af-mute'); mutedW = null; }
    }
    function mute(w) {
        if (!w || !w.classList) { return; }
        if (mutedW && mutedW !== w) { mutedW.classList.remove('af-mute'); }
        mutedW = w;
        w.classList.add('af-mute');
        // The three stand-ins for a `:hover` this component keeps alive are all
        // "it is already open"; none of them survives a press.
        w.classList.remove('af-on');
        w.classList.remove('af-hold');
        w.classList.remove('af-open');
        for (let i = 0; i < closers.length; i++) { closers[i](w); }
    }

    if (doc && typeof doc.addEventListener === 'function') {
        // Registered FIRST, so `tip-act` and `af-mute` are already decided by the
        // time the two opening mechanisms below read them on the same event.
        // Whichever panel is open, its scroll position is remembered here once
        // rather than in each of the two bridges below.
        doc.addEventListener('scroll', function (e) {
            const t = e.target;
            if (t && t.classList && t.classList.contains('af-tip')) { lastScroll = t.scrollTop || 0; }
        }, true);

        doc.addEventListener('pointerover', function (e) {
            const w = closestW(e.target);
            if (mutedW && w !== mutedW) { unmute(); }
            if (w !== hoverW) { lastScroll = 0; }
            hoverW = w;
            if (!w) { return; }
            if (w !== mutedW && tipMuted(w)) { mute(w); return; }
            if (w === mutedW) { return; }
            const c = e.target && typeof e.target.closest === 'function' ? e.target.closest(CLICKY) : null;
            const act = (!!c && w.contains(c) && !inPanel(c))
                || !!(w.matches && w.matches(CLICKY));
            w.classList.toggle('tip-act', act);
        }, true);

        // `pointerdown`, not `click`: the panel has to be gone before the
        // control's own handler draws whatever it draws under the pointer.
        doc.addEventListener('pointerdown', function (e) {
            if (inPanel(e.target)) { return; }
            const w = closestW(e.target);
            if (w) { mute(w); } else { unmute(); for (let i = 0; i < closers.length; i++) { closers[i](null); } }
        }, true);

        // A key is the other way a hand says it has moved on — Escape most
        // obviously, but typing anywhere means the pointer is only resting.
        doc.addEventListener('keydown', function () {
            if (hoverW) { mute(hoverW); return; }
            for (let i = 0; i < closers.length; i++) { closers[i](null); }
        }, true);
    }

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
        done();
    }

    if (doc && typeof doc.addEventListener === 'function'
        && typeof MutationObserver === 'function' && typeof doc.elementFromPoint === 'function') {

        /** The wrapper the pointer is over, where it entered, how far the panel
         *  had been scrolled — the three things a rebuild would otherwise lose. */
        let over = null, atX = -1, atY = -1;
        /** Set only while the class is standing in for a lost `:hover`. */
        let bridged = null;

        const drop = () => {
            if (bridged) { bridged.classList.remove('af-on'); bridged = null; }
        };

        /* --------------------------------------------------------------
           ‼️ U-57 — A SCROLLABLE PANEL YOU CANNOT WALK INTO IS NOT SCROLLABLE.

           The panel is a CHILD of the wrapper, so on the ordinary layout —
           panel hanging directly under its trigger — `:hover` survives the trip
           into it and everything works. `tip-block` breaks exactly that
           assumption, and `tip-block` is what the rows with the most to say
           use: the wrapper goes `position:static` and the panel is placed
           against the ROW, so the pointer has to cross the rest of the row —
           which is not part of the wrapper — to reach it. `:hover` is gone at
           the first pixel of that crossing, the collapse rule takes the panel's
           box away, and the reader is left chasing something that is not there.
           The same happens with `af-up`/`af-left` whenever the flip lands the
           panel somewhere the trigger does not touch.

           So leaving a wrapper starts a GRACE PERIOD rather than closing it:
           the panel keeps its box for the length of an ordinary hand movement,
           and arriving inside it (or back on the trigger) cancels the timer.
           Same duration as the `tip-free` walk, and for the same reason — this
           is one gesture with one measurement, not two components.

           It belongs here, once, rather than in the pages: every surface in the
           extension hovers through this component, and a rule the caller has to
           remember is a rule that is missing on the next table somebody writes.
           -------------------------------------------------------------- */
        /** The walk from the trigger to the panel. Below ~250ms the panel closes
         *  under a normal hand; above ~500ms one you have finished with follows
         *  you around. Same number as `FREE_CLOSE_MS` — same gesture. */
        const HOLD_MS = 340;
        let held = null, holdT = 0;
        const release = () => {
            holdT = 0;
            if (held) { held.classList.remove('af-hold'); held = null; }
        };
        const cancelHold = w => {
            if (holdT) { clearTimeout(holdT); holdT = 0; }
            // A different panel is a different subject: it closes at once, or
            // two of them overlap while one of them is stale.
            if (held && held !== w) { held.classList.remove('af-hold'); held = null; }
            if (held === w) { w.classList.remove('af-hold'); held = null; }
        };
        /** A hold preserves a panel the reader has already opened; it must not
         *  become a second, instant way to open one. During the normal 250 ms
         *  hover delay the panel's computed visibility is still hidden. */
        const isShown = w => {
            const tip = w.querySelector('.af-tip');
            return !!tip && typeof window.getComputedStyle === 'function'
                && window.getComputedStyle(tip).visibility === 'visible';
        };

        // U-74: a press takes the two stand-ins with it.
        closers.push(function () { drop(); release(); });

        doc.addEventListener('pointerover', function (e) {
            const w = closestW(e.target);
            // Arriving anywhere inside the wrapper — the trigger again, or the
            // panel the grace period was buying time to reach — ends the walk.
            if (w) { cancelHold(w); }
            if (!w || w === over) { return; }
            over = w; atX = e.clientX; atY = e.clientY;
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
                // `tip-free` runs its own timers (below); giving it a second set
                // here would fight them.
                if (!w.classList.contains('tip-free') && isShown(w)) {
                    cancelHold(w);
                    held = w;
                    w.classList.add('af-hold');
                    holdT = setTimeout(release, HOLD_MS);
                }
            }
        }, true);

        let queued = false;
        const restore = () => {
            queued = false;
            if (!over || over.isConnected) { return; }
            const w = closestW(doc.elementFromPoint(atX, atY));
            over = w;
            if (!w) { return; }
            // ‼️ U-73 — `tip-free` IS NOT THIS BRIDGE'S BUSINESS, and putting it
            // back here was actively wrong: `af-on` shows a panel with NO delay,
            // so a repaint that landed while the pointer was still inside a free
            // trigger's opening wait flashed the panel — at `left:0; top:0`,
            // because its placer had not run. A free panel has its own bridge
            // at the bottom of this file, which re-opens it only if it was
            // actually open and places it before it is seen.
            if (w.classList.contains('tip-free')) { return; }
            w.classList.add('af-on');
            bridged = w;
            // The replacement node is a different element in a redrawn section;
            // it may not sit exactly where the old one did.
            flip(w);
            const tip = w.querySelector('.af-tip');
            if (tip && lastScroll) { tip.scrollTop = lastScroll; }
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

    /* ------------------------------------------------------------------
       ‼️ U-61 — TWO THINGS A tip-free TRIGGER MAY SAY FOR ITSELF, AND BOTH ARE
       THE CALL SITE'S TO SAY.

       `FREE_OPEN_MS` is this component's default and stays it. Retuning that
       number to settle two controls would retune every rich hover in the
       extension — which is exactly the "central setting" nobody asked for. So a
       trigger that needs longer asks for longer, on itself:

         data-aftip-open="<ms>"    this trigger's own open delay
         data-aftip-mute="<sel>"   while the trigger sits INSIDE something
                                   matching this selector no panel opens, and
                                   one already open closes

       The mute is what a PICKER needs and no delay can give it: press the box,
       its list drops over the page, and the panel explaining the box is now a
       paragraph standing behind that list — already open, so no waiting period
       was ever going to help, and saying nothing about the choice being made.
       ------------------------------------------------------------------ */
    /** U-74 — a trigger you press waits longer, so aiming at a control and
     *  pressing it never sees a panel. The call site still wins where it has
     *  named its own number. */
    const ACT_OPEN_MS = 700;
    /** A trigger's own open delay, or the component's. */
    function tipOpenMs(w) {
        const n = Number(w && w.getAttribute ? w.getAttribute('data-aftip-open') : 0);
        if (Number.isFinite(n) && n > 0) { return n; }
        return w && w.classList && w.classList.contains('tip-act') ? ACT_OPEN_MS : FREE_OPEN_MS;
    }
    /** Is this trigger inside something that says "not now"? */
    function tipMuted(w) {
        const sel = w && w.getAttribute ? w.getAttribute('data-aftip-mute') : '';
        return !!(sel && typeof w.closest === 'function' && w.closest(sel));
    }

    if (doc && typeof doc.addEventListener === 'function') {
        let openW = null, openT = 0, closeT = 0;
        /** Where the pointer entered the wrapper whose panel is open — the
         *  repaint bridge at the bottom of this block needs it (U-73). */
        let freeAtX = -1, freeAtY = -1;

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

        // U-74: a press closes a free panel and forgets it.
        closers.push(function () { clearTimeout(openT); clearTimeout(closeT); close(); });

        doc.addEventListener('pointerover', function (e) {
            const t = e.target;
            const w = t && typeof t.closest === 'function' ? t.closest('.af-tipw.tip-free') : null;
            // Muted is checked before "already open": the point is to get rid of
            // a panel the control has since covered, not to leave it standing
            // because the pointer never went anywhere.
            if (w && (tipMuted(w) || w.classList.contains('af-mute'))) {
                clearTimeout(openT); clearTimeout(closeT); close(); return;
            }
            // Inside the panel itself: that is the reader arriving, not leaving.
            if (w && w === openW) { clearTimeout(closeT); return; }
            clearTimeout(openT);
            if (!w) {
                if (openW) { clearTimeout(closeT); closeT = setTimeout(close, FREE_CLOSE_MS); }
                return;
            }
            clearTimeout(closeT);
            // U-73: where the pointer ENTERED, kept for the repaint bridge below
            // — not where it is when the panel dies, which may be inside the
            // panel, and a `tip-free` panel floats over rows it does not belong
            // to.
            const ex = e.clientX, ey = e.clientY;
            openT = setTimeout(function () {
                // Re-asked at the end of the wait, not only at the start: the
                // control can have been opened during it, pointer still still.
                if (!w.isConnected || tipMuted(w) || w.classList.contains('af-mute')) { return; }
                close();
                openW = w;
                freeAtX = ex; freeAtY = ey;
                w.classList.add('af-open');
                place(w);
            }, tipOpenMs(w));
        }, true);

        // ‼️ THE MUTE HAS TO SURVIVE A CLICK THAT NEVER MOVES THE POINTER, which
        // is the whole gesture: press the box, the list drops, the hand stays
        // put. Nothing above runs again, so the check is repeated here — after
        // the control's own handler, because that is what puts the class on, and
        // a picker that stops the event would otherwise win the race.
        doc.addEventListener('click', function () {
            if (!openW) { return; }
            setTimeout(function () {
                if (openW && tipMuted(openW)) { clearTimeout(openT); close(); }
            }, 0);
        }, true);

        // A repaint under a stationary pointer takes the wrapper away; the panel
        // must go with it rather than hang over the page pointing at nothing.
        doc.addEventListener('scroll', function () {
            if (openW) { openW.isConnected ? place(openW) : close(); }
        }, true);

        /* --------------------------------------------------------------
           ‼️ U-73 — A `tip-free` PANEL SURVIVES A REPAINT TOO.

           The bridge above this file (`af-on`) was built for the ordinary
           panel and only ever knew about it: the observer watches `over`,
           and `over` is the ORDINARY path's state. `tip-free` opens through
           `af-open` and its own placer, so on a page that redraws itself on
           a timer — the Live Timeline rewrites `#app` whole on every data
           event AND every five seconds — the wrapper under a stationary
           pointer was destroyed, `openW` became an orphan, and the panel
           closed. The pointer had not moved, so `:hover` never came back and
           nothing reopened it; a moment later the next redraw did the same
           thing again. That is the flicker, and every trigger on that page
           is `tip-free`, which is why it was the page it was reported on.

           Deferring the page's own redraws was the other way, and it is
           worse: a live page that stops telling the truth while you rest a
           pointer on it is a page that lies. The panel is what has to
           survive, and it survives here rather than in each page.

           The same three facts as the ordinary bridge: where the pointer
           ENTERED (not where it is — it may be inside the panel, which is
           `position:fixed` over other rows), the panel's scroll position,
           and the wrapper itself. Re-opened in the same frame, so nothing is
           seen closing.
           -------------------------------------------------------------- */
        if (typeof MutationObserver === 'function' && typeof doc.elementFromPoint === 'function') {
            let queued = false;
            const rescue = () => {
                queued = false;
                if (!openW || openW.isConnected) { return; }
                const at = doc.elementFromPoint(freeAtX, freeAtY);
                const w = at && typeof at.closest === 'function' ? at.closest('.af-tipw.tip-free') : null;
                // The orphan gives its class up first: a detached node carrying
                // an open panel is the kind of thing that comes back to life the
                // day somebody reuses the markup.
                close();
                if (!w || w.classList.contains('af-mute') || tipMuted(w)) { return; }
                openW = w;
                w.classList.add('af-open');
                // The replacement is a different element in a redrawn section:
                // measured again rather than given the old box.
                place(w);
                const tip = panelOf(w);
                if (tip && lastScroll) { tip.scrollTop = lastScroll; }
            };
            new MutationObserver(function () {
                if (queued || !openW || openW.isConnected) { return; }
                queued = true;
                if (typeof requestAnimationFrame === 'function') { requestAnimationFrame(rescue); } else { rescue(); }
            }).observe(doc.documentElement || doc, { childList: true, subtree: true });
        }
    }

    /**
     * ‼️ MIRROR IS A LIVE RULE, AND EVERY PANEL BUILT WITH `wrap` WAS FROZEN.
     *
     * A panel is written into the markup once, when the page draws itself. The
     * rule it exists to serve — "a control too narrow for its own text puts its
     * CURRENT value on the first line of its hover" — is about a value that
     * CHANGES. So the moment somebody used the control, the hover was answering
     * about the value it no longer held: the box read `xhigh` and the panel
     * underneath it still said `high`, which is worse than saying nothing.
     *
     * `set` rewrites the two halves of an already-drawn panel in place. It is
     * `textContent`, not markup, for the same reason `panel()` escapes: nothing
     * a caller passes can become an element.
     */
    /** The one direct child of `el` carrying `cls`. Walked rather than selected
     *  on purpose: a wrapper may contain another wrapper (a trigger with its own
     *  hover inside it), and `querySelector` would reach into it and rewrite the
     *  wrong panel. */
    function kid(el, cls) {
        const ch = (el && el.children) || [];
        for (let i = 0; i < ch.length; i++) {
            if (ch[i].classList && ch[i].classList.contains(cls)) { return ch[i]; }
        }
        return null;
    }

    function set(w, head, body) {
        const p = kid(w, 'af-tip');
        if (!p) { return; }
        const h = kid(p, 'af-tiph');
        const b = kid(p, 'af-tipb');
        if (h) { h.textContent = String(head === undefined || head === null ? '' : head); }
        if (b) { b.textContent = String(body === undefined || body === null ? '' : body); }
    }

    /**
     * ‼️ AN AXIS BOX KEEPS ITS OWN PANEL IN STEP — AND THE COMPONENT DOES IT.
     *
     * A `<select>` narrow enough to cut its own value is exactly the control
     * MIRROR is about, so its panel opens with what the box currently holds.
     * Written per page, that promise held only until somebody used the box:
     * the markup is built once and the value changes afterwards. It is not a
     * Console problem either — every page with a picker in a tight row has it.
     *
     * So a wrapper opts in by carrying its axis, and everything the rebuild
     * needs is already in the markup:
     *
     *   data-axis-name="permissions"   what the panel calls this axis
     *   data-axis-std="…"              the standing explanation, written once
     *   <option data-why="…">          the chosen row's own line
     *
     * The two marks are not decoration: `:` is a choice somebody made, `→` is
     * what the engine resolves to when nothing is named. An empty value is the
     * second case, which is the only place the arrow appears.
     */
    function syncAxis(sel) {
        if (!sel || typeof sel.closest !== 'function') { return; }
        const w = sel.closest('.af-tipw');
        const name = w && w.getAttribute ? w.getAttribute('data-axis-name') : null;
        // No axis on the wrapper means this box never opted in — a page is free
        // to wrap a select in a panel that says something else entirely.
        if (!name) { return; }
        const std = String(w.getAttribute('data-axis-std') || '').trim();
        const opt = sel.options ? sel.options[sel.selectedIndex] : null;
        const label = opt ? String(opt.text || '').trim() : '';
        const why = opt && opt.getAttribute ? String(opt.getAttribute('data-why') || '').trim() : '';
        set(w, name + (label ? (String(sel.value || '') !== '' ? ': ' : ' → ') + label : ''),
            lines(why && why !== std ? [why, GAP, std] : [std]));
    }

    if (doc && typeof doc.addEventListener === 'function') {
        // Delegated and bound once, in the capture phase: these pages rebuild a
        // whole row from `innerHTML`, so a listener per box would have to be
        // rebound on every repaint and the next box somebody adds would be the
        // one that was forgotten. Capture also means the panel is already right
        // if the page's own handler repaints on the same event.
        doc.addEventListener('change', function (e) {
            const t = e && e.target;
            if (t && t.tagName === 'SELECT') { syncAxis(t); }
        }, true);
    }

    window.AFTip = {
        wrap: wrap, cell: cell, label: label, lines: lines, sizeNote: sizeNote,
        esc: esc, set: set, syncAxis: syncAxis, GAP: GAP
    };
})();
