// Agent Farm — NEVER REPAINT UNDER THE USER'S HANDS.
//
// ‼️ THE BUG THIS EXISTS TO END, IN THE USER'S OWN WORDS: "I start typing, I
// press space, and it is as if I pressed Page Down — the caret leaves the box
// and the page scrolls." Space did nothing of the kind. The caret had ALREADY
// been thrown out of the box; focus had fallen back to `<body>`, and on the body
// space IS Page Down. The keypress is the symptom, not the cause.
//
// ‼️ THE CAUSE IS ONE LINE, REPEATED ON TWENTY PAGES. Every page in this
// extension answers a host push the same way:
//
//     if (m.type === 'data') { DATA = m.data; render(); }
//
// …and `render()` replaces the whole of `#app`. Every element handed out so far
// is detached, and a detached node cannot hold the caret. So a push that arrives
// while somebody is typing destroys the box they are typing in — which is why
// this bites hardest when ANOTHER AGENT IS RUNNING (that is what produces the
// pushes) and hardly at all on a quiet page.
//
// ‼️ AND THE RULE ALREADY EXISTED — applied to one road and not the other.
// `tasksPage.js` guards its own 30-second timer with the comment "never
// re-render under the user's fingers", checking for an open composer and a
// focused field. The host-driven push walked straight past it. So this is not a
// new idea; it is the same rule, in one place, where every road can reach it.
//
// ‼️ IT DEFERS, IT DOES NOT DROP. The timer's answer was to skip the repaint
// entirely, which trades a stolen caret for a stale screen that never catches
// up on its own. A deferred repaint is owed, and it is paid the moment the
// user's hands are free — so nothing is lost and nothing is stolen.
//
// ‼️ AND IT IS ONLY FOR REPAINTS SOMEBODY ELSE ASKED FOR. A render the USER's
// own action triggered — a filter typed, a tab pressed — must happen at once,
// even though a field is focused, because the field is the thing that asked. So
// this wraps the HOST push and nothing else; a page that routed all of its
// renders through here would feel broken in the opposite direction.
(function () {
    'use strict';

    /** Is the caret somewhere a repaint would destroy? */
    function inAField(doc) {
        const a = doc && doc.activeElement;
        if (!a) { return false; }
        // A native `<select>` with its list open IS the active element, so the
        // one rule covers the dropdown the user complained about closing under
        // their press as well as the text box.
        const tag = String(a.tagName || '').toUpperCase();
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') { return true; }
        // Anything a page made editable itself. `isContentEditable` is absent in
        // the test shim, so the attribute is the fallback rather than a throw.
        if (a.isContentEditable === true) { return true; }
        const attr = a.getAttribute && a.getAttribute('contenteditable');
        return attr === '' || attr === 'true';
    }

    /**
     * Wrap a page's `render` so a HOST-driven repaint waits for the hands.
     *
     * `busy` is the page's own extra answer — an open composer, a modal, a
     * picker window. It is asked ON TOP of the focus test, never instead of it:
     * every page has fields and only some have modals, so the universal half
     * lives here and cannot be forgotten by the next page.
     *
     * Returns a function to call INSTEAD of `render()` on the push, plus
     * `flush()` for a page that knows its own hands just came free.
     */
    function guard(render, options) {
        const opts = options || {};
        const doc = opts.document || (typeof document !== 'undefined' ? document : undefined);
        const busy = () => {
            if (typeof opts.busy === 'function' && opts.busy()) { return true; }
            return inAField(doc);
        };
        let owed = false;
        let wired = false;
        const paint = () => { owed = false; render(); };
        const flush = () => {
            if (!owed || busy()) { return false; }
            paint();
            return true;
        };
        // ‼️ THE DEBT IS PAID WHEN THE HANDS COME FREE, and `focusout` is the
        // event that says so. It fires BEFORE the new focus is settled, so the
        // check is deferred by a tick — asked immediately, `activeElement` is
        // still the box being left and the page would stay stale for ever.
        const wire = () => {
            if (wired || !doc || !doc.addEventListener) { return; }
            wired = true;
            doc.addEventListener('focusout', () => {
                const later = (typeof setTimeout === 'function')
                    ? (fn) => setTimeout(fn, 0) : (fn) => fn();
                later(flush);
            });
        };
        const guarded = function () {
            wire();
            if (busy()) { owed = true; return false; }
            paint();
            return true;
        };
        guarded.flush = flush;
        // ‼️ "I HAVE JUST PAINTED BY MYSELF." A page still renders directly for
        // everything the user asks of it, and one of those renders makes the
        // screen current — so the debt is settled and firing it again on the
        // next focus change would be one whole repaint spent on nothing. Kept
        // apart from `flush` because they are opposite requests: flush wants a
        // paint, this one says a paint already happened.
        guarded.clear = () => { owed = false; };
        // For a page that wants to say "there is a repaint waiting" — and for
        // the tests, which is where this contract is actually pinned.
        guarded.pending = () => owed;
        return guarded;
    }

    window.AFRepaint = { guard, inAField };
})();
