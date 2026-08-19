// Agent Farm — a text box's own four tools: paste · copy · cut · clear.
//
// ‼️ NONE OF THESE TALKS TO AN AGENT. They paste into, copy, cut and clear the
// TEXT IN THE BOX — the same four things the keyboard does to any text box — so
// that starting a message over, or lifting it out to paste somewhere else,
// costs one click instead of select-all-plus-a-chord. That is why they live ON
// the box and never in a control row, where every button sends or starts
// something.
//
// Shared because two boxes now want exactly this and a second copy of the paste
// rule below would be a second thing to get wrong: the console's composer
// (prefix `c`) and the Backlog tab's capture box (prefix `bl`). A page supplies
// the markup with html(), wires it once with wire(), and says on every
// keystroke whether the box has anything in it with paint().
(function () {
    'use strict';

    /** The four, in the order they are drawn. Paste is leftmost and permanent;
     *  see paint() for why the other three come and go. */
    const TOOLS = [
        {
            key: 'paste', glyph: '⎘',
            title: 'Paste the clipboard at the cursor — and put a space in first if it'
                + ' would otherwise weld onto the character before it'
        },
        { key: 'copy', glyph: '⧉', title: 'Copy this text to the clipboard — nothing is sent, the box keeps it' },
        { key: 'cut', glyph: '✂', title: 'Cut: copy it to the clipboard and empty the box' },
        { key: 'clear', glyph: '✕', title: 'Clear the box — the text goes, nothing is sent' }
    ];
    const GLYPH = {};
    for (const t of TOOLS) { GLYPH[t.key] = t.glyph; }

    const esc = s => String(s === undefined || s === null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    /**
     * The row of buttons.
     *
     * `wrap` is the element name, because where these sit differs and the
     * difference is not cosmetic: the composer's row is ABSOLUTELY POSITIONED
     * inside the box (a div is fine there), while the backlog row lives inside
     * a flat row of spans whose boundary the page's own tests scan for — a
     * nested div there would break the row.
     */
    function html(prefix, opts) {
        const o = opts || {};
        const tag = o.wrap || 'div';
        const cls = o.className || 'tatools';
        return `<${tag} class="${esc(cls)}" id="${esc(prefix)}-tools">`
            + TOOLS.map(t =>
                `<button class="tatool" id="${esc(prefix)}-${t.key}" title="${esc(t.title)}">${t.glyph}</button>`
            ).join('')
            + `</${tag}>`;
    }

    /**
     * ‼️ WHERE A PASTE NEEDS A SPACE AND WHERE IT MUST NOT GET ONE.
     *
     * The commonest paste into one of these boxes is a path or an identifier
     * landing at the end of a half-written sentence, and without this it welds
     * onto the last word ("look atsrc/core/live.ts"). So the caret's NEIGHBOURS
     * decide: a word character immediately to the left and a space goes in
     * first; whitespace, a newline, an open bracket, or the very start of the
     * box, and it goes in untouched — a box that adds a space where there is
     * already one is the same bug in the other direction.
     *
     * Only the LEFT side earns a space. The right side is where the caret is
     * left standing, so what follows is still yours to type.
     */
    const WELDS_ON_LEFT = /[^\s([{<"'`‘“–—/\\=:,;]$/;

    /**
     * A SELECTION is replaced, exactly as Ctrl+V would. `document.execCommand
     * ('insertText')` is deliberately not used: the value is rebuilt and the
     * caret put back by hand, because the page's own `input` handling is what
     * keeps its draft and its buttons honest, and it is told through onChange.
     */
    function pasteAtCursor(box, clip) {
        const text = String(clip === undefined || clip === null ? '' : clip);
        if (!text) { return false; }               // empty clipboard: say nothing, do nothing
        const value = box.value || '';
        // a box that was never focused reports 0/0, which is the start — the
        // honest reading, since that is where typing would go
        const start = typeof box.selectionStart === 'number' ? box.selectionStart : value.length;
        const end = typeof box.selectionEnd === 'number' ? box.selectionEnd : start;
        const before = value.slice(0, start);
        const after = value.slice(end);
        const glue = WELDS_ON_LEFT.test(before) && !/^\s/.test(text) ? ' ' : '';
        const inserted = glue + text;
        box.value = before + inserted + after;
        const caret = start + inserted.length;
        try { box.setSelectionRange(caret, caret); } catch (e) { /* older host: the text still landed */ }
        return true;
    }

    /** Older path: select the box and let the host copy the selection. */
    function legacyCopy(box) {
        try {
            box.select();
            return document.execCommand('copy') !== false;
        } catch (e) { return false; }   // nothing else to try — the box still holds the text
    }

    /**
     * Put the text on the clipboard, then report.
     *
     * A webview is a secure context, so the async API is the real path;
     * execCommand is the fallback for a host that denies it. The receipt is
     * only shown from `onDone`, i.e. once the write actually happened — a green
     * ✓ for a copy that silently failed would be worse than no button at all.
     */
    function copyText(box, value, onDone) {
        const nav = typeof navigator !== 'undefined' ? navigator : null;
        if (nav && nav.clipboard && nav.clipboard.writeText) {
            nav.clipboard.writeText(value).then(onDone, () => { if (legacyCopy(box)) { onDone(); } });
            return;
        }
        if (legacyCopy(box)) { onDone(); }
    }

    /**
     * The click's receipt — the glyph turns into a green ✓ for a moment.
     *
     * ‼️ COPY LEAVES THE SCREEN IDENTICAL. Cut and clear empty the box in front
     * of you, so the box itself is the receipt; copy changes nothing you can
     * see, and a button that answers a click with nothing has taught you it
     * does not work.
     *
     * Written with `className` rather than `classList` because these buttons
     * are rebuilt with their page and the map above is the only place their
     * original glyph is remembered.
     */
    function flash(prefix, key) {
        const b = document.getElementById(prefix + '-' + key);
        if (!b) { return; }
        b.textContent = '✓';
        b.className = 'tatool done';
        setTimeout(() => {
            const el = document.getElementById(prefix + '-' + key);
            if (!el) { return; }
            el.textContent = GLYPH[key];
            el.className = 'tatool';
        }, 900);
    }

    /**
     * Wire the four to one box. Called once per paint of the page that owns
     * them — a control is wired where it is DRAWN, never earlier: a listener
     * attached to markup that has not been written yet binds to nothing, and
     * that failure is silent (the button draws, hovers, presses, and does
     * nothing).
     *
     * `onChange(value)` is called after every mutation, and is where the page
     * stores its draft and repaints whatever depends on it.
     */
    function wire(o) {
        const prefix = o.prefix;
        const byId = (id, ev, fn) => {
            const el = document.getElementById(id);
            if (el) { el.addEventListener(ev, fn); }
        };
        const changed = value => { if (o.onChange) { o.onChange(value); } };
        const withBox = fn => ev => {
            if (ev && ev.preventDefault) { ev.preventDefault(); }
            const box = document.getElementById(o.boxId);
            if (!box) { return; }
            fn(box);
            // A mouse click on a tool must not cost you the keyboard — and for
            // paste it must not cost you the CARET either, which is why the
            // insert puts it back before this runs.
            try { box.focus({ preventScroll: true }); } catch (e) { box.focus(); }
        };
        // `tool` is for the three that act on what is IN the box, so an empty
        // box makes them no-ops. Paste is wired separately for the opposite
        // reason: its input is the clipboard, and an empty box is its normal
        // case.
        const tool = (key, fn) => byId(prefix + '-' + key, 'click', withBox(box => {
            if (!box.value) { return; }   // nothing to act on: say nothing, do nothing
            fn(box, box.value);
        }));
        const clearBox = box => { box.value = ''; changed(''); };

        // ‼️ Don't let the press take the caret. mousedown blurs the textarea
        // before the click is even delivered, and for paste the caret IS the
        // argument.
        for (const t of TOOLS) {
            byId(prefix + '-' + t.key, 'mousedown', ev => { if (ev && ev.preventDefault) { ev.preventDefault(); } });
        }
        // The async clipboard API is the real path in a webview;
        // execCommand('paste') is blocked by design in Chromium, so there is no
        // fallback to reach for — a host that denies the read gets no receipt,
        // which is the honest answer.
        byId(prefix + '-paste', 'click', withBox(box => {
            const nav = typeof navigator !== 'undefined' ? navigator : null;
            if (!(nav && nav.clipboard && nav.clipboard.readText)) { return; }
            nav.clipboard.readText().then(clip => {
                if (pasteAtCursor(box, clip)) { changed(box.value); flash(prefix, 'paste'); }
            }, () => { /* denied or empty — the box is unchanged, which says so */ });
        }));
        tool('copy', (box, value) => copyText(box, value, () => flash(prefix, 'copy')));
        tool('cut', (box, value) => copyText(box, value, () => {
            clearBox(box);
            flash(prefix, 'cut');
        }));
        tool('clear', box => { clearBox(box); flash(prefix, 'clear'); });
    }

    /**
     * The tools exist only while there is something to act on: copy, cut and
     * clear on an empty box are three buttons lying about having work to do.
     *
     * ‼️ PASTE IS THE EXCEPTION, AND IT IS THE WHOLE POINT OF IT. Its work is in
     * the CLIPBOARD, not in the box, so the moment it is most wanted is the
     * moment the box is empty — a rule that hid the whole row unless the draft
     * had text would have hidden it exactly then. So the row is always there
     * and the three that DO need text hide themselves, which also keeps paste
     * in one fixed place instead of sliding as its neighbours appear.
     */
    function paint(prefix, hasText) {
        const hide = !hasText;
        for (const key of ['copy', 'cut', 'clear']) {
            const el = document.getElementById(prefix + '-' + key);
            if (el && el.hidden !== hide) { el.hidden = hide; }
        }
    }

    /**
     * ‼️ ONE CLIPBOARD PATH, AND ONE RECEIPT — for anything, not just a box.
     *
     * A session id in a subtitle, a path in a card: plenty of things on a page
     * are worth one click to copy, and every one of them needs the same two
     * behaviours this file already got right — the async API with the
     * execCommand fallback, and a ✓ that appears only once the write ACTUALLY
     * happened. Written twice, they drift; the second copy is always the one
     * that shows a tick for a failed write.
     *
     * `el` is the element that was clicked: it becomes its own receipt for a
     * moment and then goes back to what it said.
     */
    function copyFrom(el, value) {
        const restore = el ? el.textContent : '';
        const done = () => {
            if (!el) { return; }
            el.textContent = '✓ copied';
            el.classList.add('done');
            setTimeout(() => { el.textContent = restore; el.classList.remove('done'); }, 900);
        };
        const nav = typeof navigator !== 'undefined' ? navigator : null;
        if (nav && nav.clipboard && nav.clipboard.writeText) {
            nav.clipboard.writeText(String(value)).then(done, () => { /* denied: no false receipt */ });
            return;
        }
        // No async clipboard: put the text in a throwaway box and cut from it.
        try {
            const ta = document.createElement('textarea');
            ta.value = String(value);
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand('copy') !== false;
            document.body.removeChild(ta);
            if (ok) { done(); }
        } catch { /* nothing claimed, nothing shown */ }
    }

    /**
     * ‼️ K-9 — HOW TALL THE BOX WAS DRAGGED, AS CSS THE PAGE OWNS.
     *
     * A textarea's own resize handle writes an INLINE height, and both pages
     * that use these tools redraw their markup from scratch — so the height was
     * put back by hand after every rebuild, and whatever ran between the drag
     * and the next repaint won instead. It looked random because it WAS random:
     * whether the height survived depended on what happened to repaint next.
     *
     * Here the height is a custom property on the document root, which no
     * rebuild touches, so a box is already its remembered size the moment it
     * exists: there is nothing to restore and nothing to lose. The stylesheet
     * reads it (`height:var(--af-boxh, 64px)`).
     *
     * And the number is CLAMPED both on the way in and on the way out. That is
     * the other half of K-9 — the value goes back into storage, so one figure
     * let through above the ceiling is read back as the new normal, and a box
     * that snapped back snapped back a little taller each time until it could
     * cover the page. A ceiling only the stylesheet knows is not a ceiling.
     *
     *   el       the textarea being dragged
     *   varName  the custom property the stylesheet reads
     *   min      the floor in px — the box's own css min-height
     *   cap      the ceiling in px, or a function returning it; 70% of the
     *            window by default, which is the `max-height:70vh` rule
     *   read     () => the stored px (0 = never dragged)
     *   write    px => store it; where that is belongs to the page
     *
     * Returns a stop(). A page calls this again on every rebuild, and an
     * observer left on a dead box writes the height THAT box had into the same
     * slot — which is one of the two ways the setting used to be thrown away.
     */
    function keepHeight(o) {
        const el = o && o.el;
        if (!el) { return () => { /* nothing to keep */ }; }
        const min = Number(o.min) || 0;
        const capOf = () => {
            const c = typeof o.cap === 'function' ? o.cap() : o.cap;
            const n = Number(c) || Math.round((window.innerHeight || 0) * 0.7);
            return Math.max(min, n);
        };
        const clamp = px => Math.min(Math.max(Math.round(Number(px) || 0), min), capOf());
        const stored = () => Number(o.read ? o.read() : 0) || 0;
        const apply = () => {
            const root = document.documentElement;
            if (!root || !root.style) { return; }
            const px = stored();
            if (px) { root.style.setProperty(o.varName, clamp(px) + 'px'); }
            else if (root.style.removeProperty) { root.style.removeProperty(o.varName); }
        };
        apply();
        let obs = null;
        if (typeof ResizeObserver === 'function') {
            obs = new ResizeObserver(() => {
                // The inline height is written by the resize handle and by
                // nothing else now, so it says exactly one thing: a person
                // dragged this. A re-layout changes the RENDERED height and
                // leaves the inline one alone, and is not a choice.
                const px = parseInt(el.style.height, 10);
                if (!px) { return; }
                const want = clamp(px);
                if (want === stored()) { return; }
                if (o.write) { o.write(want); }
                apply();
            });
            obs.observe(el);
        }
        // A narrower window lowers the ceiling and the box follows it down. The
        // number that was dragged is kept as it is, so widening gives it back.
        const onWindow = () => apply();
        const canListen = typeof window.addEventListener === 'function'
            && typeof window.removeEventListener === 'function';
        if (canListen) { window.addEventListener('resize', onWindow); }
        return () => {
            if (obs && typeof obs.disconnect === 'function') { obs.disconnect(); }
            obs = null;
            if (canListen) { window.removeEventListener('resize', onWindow); }
        };
    }

    // `insert` is `pasteAtCursor` under its public name: anything that puts
    // text into one of these boxes from outside (the Console's saved-prompt
    // picker) must land it the way a paste lands, or the box would have two
    // different ideas about where a space belongs.
    window.AFTextTools = { html, wire, paint, insert: pasteAtCursor, copyFrom, keepHeight, TOOLS };
})();
