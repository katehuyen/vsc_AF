// Agent Farm — the "/" picker: what THIS box could actually type after a slash.
//
// ‼️ K-30. The catalog is K-29's (core/slashCommands.ts) and it is a MERGE, not
// a table: what is on disk, what the running session reported at `system:init`,
// and a short shipped table per engine for the moment before any session exists.
// A real Claude init on this machine named 47 commands, half of them skills
// installed on that machine — so the one thing this component must never do is
// offer a list it invented. It asks, and it draws the answer.
//
// ‼️ IT IS A TYPEAHEAD, NOT A MODAL, and that is the whole design. The user is
// mid-sentence in the composer; a window that took the focus would mean typing
// the query twice — once to open it, once inside it. So the box keeps the
// caret, the box keeps the query, and this draws underneath what is already
// being typed. Which is why there is no filter input here: `/mod` in the
// composer IS the filter.
//
// The rule for "is there a query under the caret" is `slashQueryAt`, and the
// filter is `narrowSlash` — both mirrored from core/slashCommands.ts, both
// pinned against the compiled core by test_console_page so the page and the
// bridge can never disagree about when the overlay is open or what it holds.
//
// Nothing here sends anything. A pick REPLACES the `/mod` you typed with the
// command and a space, leaves the caret after it, and fires `input` — the
// page's own listener is what records the draft, so no page needs a callback
// to stay in step with its own box.
(function () {
    'use strict';

    /** How this page talks to the extension host. Set once by init(). */
    let post = null;
    /** The textarea this picker serves, and where it draws. */
    let boxId = '';
    let hostId = '';
    /** What the page says the catalog is FOR — engine, agent, session. */
    let context = () => ({ engine: '', agent: '', session: '' });

    /** null while closed. Otherwise where the `/` is, what follows it, and
     *  which row is highlighted. */
    let open = null;
    /**
     * The catalog, and WHICH context it is the catalog of. Gathered once per
     * context and filtered in the page from then on: `getSlashCommands` walks
     * three folders, and a function that did that per keystroke would make a
     * `/` box feel like a network call (K-29).
     */
    let cat = { key: '', loading: false, items: [], sources: null, error: '' };

    const esc = s => String(s === undefined || s === null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    /**
     * ‼️ MIRRORED FROM core/slashCommands.ts — `slashQueryAt`. "A slash was
     * typed" is not the same question as "the text contains a slash":
     *
     * - a command starts a WORD, so `http://x`, `src/core/x.ts` and `and/or`
     *   are not commands and must not open anything;
     * - only under the CARET — a `/model` on line one is not a live query while
     *   a paragraph is being typed on line four;
     * - a SPACE ends the name — `/model opus` is a command and its argument.
     */
    function queryAt(text, caret) {
        const value = String(text === undefined || text === null ? '' : text);
        const at = Math.max(0, Math.min(Number(caret) || 0, value.length));
        const before = value.slice(0, at);
        const slash = before.lastIndexOf('/');
        if (slash < 0) { return undefined; }
        if (slash > 0 && !/\s/.test(before.charAt(slash - 1))) { return undefined; }
        const q = before.slice(slash + 1);
        if (/\s/.test(q)) { return undefined; }
        return { start: slash, q };
    }

    /** ‼️ MIRRORED FROM core/slashCommands.ts — `narrowSlash`. A leading slash
     *  is optional and `:` is not special, so typing `git` finds `/git:cleanup`
     *  — which is the whole reason folder namespacing was worth having. */
    function narrow(list, q) {
        const needle = String(q === undefined || q === null ? '' : q)
            .trim().replace(/^\//, '').toLowerCase();
        if (!needle) { return list || []; }
        return (list || []).filter(c =>
            String(c.name || '').slice(1).toLowerCase().indexOf(needle) >= 0
            || String(c.description || '').toLowerCase().indexOf(needle) >= 0);
    }

    const box = () => (boxId ? document.getElementById(boxId) : null);
    const holder = () => (hostId ? document.getElementById(hostId) : null);
    const caretOf = b => (typeof b.selectionStart === 'number'
        ? b.selectionStart : String(b.value || '').length);
    const keyOf = c => [(c && c.engine) || '', (c && c.agent) || '', (c && c.session) || ''].join('|');

    /**
     * o: { post, boxId, hostId, context }. Called once per shell build — the
     * page rebuilds its composer and the ids are the same, so re-initing is
     * how the picker learns it is looking at a NEW textarea element.
     */
    function init(o) {
        const api = o || {};
        post = typeof api.post === 'function' ? api.post
            : (api.post && typeof api.post.postMessage === 'function'
                ? m => api.post.postMessage(m) : null);
        boxId = api.boxId || '';
        hostId = api.hostId || '';
        if (typeof api.context === 'function') { context = api.context; }
        open = null;
        render();
    }

    function close() { open = null; render(); }

    const isOpen = () => !!open;

    /**
     * Ask the host for this context's catalog — once per context.
     *
     * ‼️ THE KEY IS SET BEFORE THE MESSAGE GOES, so a host that never answers
     * is asked once rather than on every keystroke. Changing engine or agent
     * changes the key, which is exactly when the answer stops being true.
     */
    function want() {
        const c = context() || {};
        const key = keyOf(c);
        if (cat.key === key) { return; }
        cat = { key, loading: true, items: [], sources: null, error: '' };
        if (post) {
            post({
                type: 'slashCommands',
                engine: c.engine || '', agent: c.agent || '', session: c.session || ''
            });
        }
    }

    /**
     * Read the box and decide. The page calls this on every keystroke — it is
     * the only thing that opens or closes the picker, so "when is it open" is
     * one rule in one place rather than a condition per key.
     */
    function sync() {
        const b = box();
        if (!b) { open = null; render(); return; }
        const hit = queryAt(b.value || '', caretOf(b));
        if (!hit) { open = null; render(); return; }
        // The highlight survives a keystroke that did not change the query
        // (an arrow key, a click) and starts over when it did — a row chosen
        // for `/mo` means nothing once the list is `/mod`'s.
        const same = open && open.q === hit.q;
        open = { start: hit.start, q: hit.q, sel: same ? open.sel : 0 };
        want();
        render();
    }

    /**
     * ‼️ THE BUTTON TYPES THE SLASH — it does not open a second door. One rule
     * decides when the picker is open (`sync`), so the icon's whole job is to
     * put a `/` where the caret is and let that rule fire. A space goes in
     * first when the caret is mid-word, because `abc/` is a path and would
     * correctly open nothing.
     */
    function openFromButton() {
        const b = box();
        if (!b || !window.AFTextTools) { return; }
        const value = String(b.value || '');
        const at = caretOf(b);
        const needsSpace = at > 0 && !/\s/.test(value.charAt(at - 1));
        window.AFTextTools.insert(b, needsSpace ? ' /' : '/');
        fire(b);
        focus(b);
        sync();
    }

    /** The answer to `want()`. True when it was this component's message, so a
     *  page can hand its whole message event over and stop caring. */
    function receive(msg) {
        if (!msg || msg.type !== 'slashCommands') { return false; }
        // A late answer about a context nobody is asking about any more is
        // dropped rather than drawn: the agent picker has moved on.
        if (keyOf(msg) !== cat.key) { return true; }
        cat = {
            key: cat.key, loading: false,
            items: msg.commands || [], sources: msg.sources || null, error: msg.error || ''
        };
        if (open) { render(); }
        return true;
    }

    /** The rows the typed query leaves — drawn and clicked off the same list,
     *  or the indices would disagree. */
    function shownItems() {
        return open ? narrow(cat.items || [], open.q) : [];
    }

    const fire = b => {
        try { b.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) { /* older host */ }
    };
    const focus = b => {
        try { b.focus({ preventScroll: true }); } catch (e) { b.focus(); }
    };
    const stop = ev => {
        if (ev.preventDefault) { ev.preventDefault(); }
        if (ev.stopPropagation) { ev.stopPropagation(); }
    };

    /**
     * The keys, and what the picker deliberately does NOT take.
     *
     * Returns true when it consumed the key, so the page's own handler can
     * `return` on it. Ctrl/Cmd+Enter is never consumed: with a picker open or
     * shut, that chord means SEND, and a picker that ate it would be a picker
     * you have to close before you can talk.
     */
    function keydown(ev) {
        if (!open || !ev) { return false; }
        if (ev.key === 'Escape') { stop(ev); close(); return true; }
        const list = shownItems();
        if (!list.length) { return false; }
        if (ev.key === 'ArrowDown') {
            stop(ev); open.sel = (open.sel + 1) % list.length; render(); return true;
        }
        if (ev.key === 'ArrowUp') {
            stop(ev); open.sel = (open.sel + list.length - 1) % list.length; render(); return true;
        }
        if (ev.key === 'Enter' && !ev.ctrlKey && !ev.metaKey && !ev.shiftKey && !ev.altKey) {
            stop(ev);
            use(list[Math.min(open.sel, list.length - 1)]);
            return true;
        }
        return false;
    }

    /**
     * Put one command in the box.
     *
     * ‼️ IT REPLACES WHAT WAS TYPED. The `/mod` under the caret IS the query,
     * and an insert that only added text would leave it in the message — the
     * engine would be sent `/mod/model`. The range is selected first and the
     * paste goes through `AFTextTools.insert`, so a command landing beside half
     * a sentence behaves exactly as Ctrl+V does there.
     */
    function use(cmd) {
        const b = box();
        if (!b || !cmd || !open) { close(); return; }
        const from = open.start;
        try { b.setSelectionRange(from, caretOf(b)); } catch (e) { /* older host */ }
        // The trailing space is what ENDS the query: the name is complete, so
        // what follows is the command's own argument and the picker is done.
        if (window.AFTextTools) { window.AFTextTools.insert(b, cmd.name + ' '); }
        open = null;
        render();
        fire(b);
        // The page may have redrawn on that event, so the box is looked up
        // again rather than trusted.
        focus(box() || b);
    }

    /**
     * ‼️ K-31 — WHOSE COMMAND IS THIS, and the answer is not one word for all
     * four cases. A command the CLI itself owns is drawn with the ENGINE badge
     * every other surface uses (X-110, media/afEngine.js): `/model` on Claude
     * and `/model` on Codex are different programs' commands, and a list that
     * called both of them "engine" would be hiding the one thing that decides
     * whether it can be typed here at all. A command from a file is not any
     * engine's, so it gets a plain chip saying which kind of file it came from.
     */
    function badgeOf(c) {
        if (c.scope === 'engine' && c.engine && window.AFEngine) {
            return window.AFEngine.badge(c.engine);
        }
        return `<span class="af-slscope">${esc(c.scope || '')}</span>`;
    }

    /**
     * ‼️ K-31 — THE ONE THING A COMMAND LIST CANNOT LEAVE OUT HERE. A `/model`
     * with no argument opens an interactive menu in a terminal; this session is
     * hosted over stream-json, where there is no terminal to open it in, so it
     * can only answer with text. Offering it silently would be offering a way
     * to spend a turn on nothing.
     *
     * It is a LINE IN THE PANEL, not a hover: a hover on a row inside a list
     * the user is arrowing through is a panel flashing over the very rows being
     * compared (the rule afSnippets is written to). So the highlighted row's
     * warning is simply shown, and it moves as the highlight does.
     */
    function warnHtml(list) {
        if (!list.length) { return ''; }
        const c = list[Math.min(open.sel, list.length - 1)];
        if (!c || !c.tui) { return ''; }
        return `<div class="af-slwarn">▤ <b>${esc(c.name)}</b> opens a menu in a terminal.`
            + ' This session is hosted, so it can only answer with text'
            + (c.args ? ` — give it its argument (<code>${esc(c.name)} ${esc(c.args)}</code>) and it acts.`
                : '; the same setting is on the row of boxes under this one.')
            + '</div>';
    }

    function rowsHtml(list) {
        if (cat.loading) {
            return '<div class="af-slnone">Reading what this engine could run…</div>';
        }
        if (cat.error) { return `<div class="af-slnone">${esc(cat.error)}</div>`; }
        if (!(cat.items || []).length) {
            return '<div class="af-slnone">This engine names no commands here, and nothing on disk'
                + ' answers to a slash. A command you type yourself is still sent as text.</div>';
        }
        if (!list.length) {
            return `<div class="af-slnone">Nothing matches <code>/${esc(open.q)}</code>.`
                + ' Esc closes the list and leaves what you typed alone.</div>';
        }
        const at = Math.min(open.sel, list.length - 1);
        // ‼️ NO HOVER ON A ROW INSIDE A LIST THAT IS ALREADY OPEN — the same
        // rule afSnippets is written to (docs/CONVENTIONS.md is about a row you
        // merely pass over on a page). Sweeping this list would flash a panel
        // over the very rows being compared. Everything a row has fits on it.
        // ‼️ THE ARGUMENT COLUMN IS DRAWN EVEN WHEN IT IS EMPTY. Left out, the
        // description of every command that takes no argument started in a
        // different place from the ones that do, and a list scanned down one
        // column became a list read row by row — looked at, in dist/render.
        return list.map((c, i) => `<button class="af-slrow${i === at ? ' on' : ''}" data-slash="${i}">
            <span class="af-slname">${esc(c.name)}</span>
            <span class="af-slargs">${esc(c.args || '')}</span>
            <span class="af-sldesc">${esc(c.description || '')}</span>
            ${c.tui ? '<span class="af-sltui">▤</span>' : ''}
            ${badgeOf(c)}
        </button>`).join('');
    }

    function html() {
        if (!open) { return ''; }
        const list = shownItems();
        const all = cat.items || [];
        const where = (context() || {});
        return `<div class="af-slbox" id="af-slbox">
            <div class="af-sllist">${rowsHtml(list)}</div>
            ${warnHtml(list)}
            <div class="af-slfoot">${cat.loading ? 'asking…'
                : `${list.length} of ${all.length} for ${esc(where.engine || 'this engine')}`}
                · ↑↓ move · ↵ insert · Esc close · nothing is sent</div>
        </div>`;
    }

    function render() {
        const root = holder();
        if (!root) { return; }
        root.innerHTML = html();
        if (!open) { return; }
        const list = shownItems();
        // Document-scoped and safe to be: `data-slash` exists nowhere but in
        // this list, and one composer is the only place it can be open.
        document.querySelectorAll('[data-slash]').forEach(node => {
            // ‼️ The press must not cost the box its caret — mousedown blurs
            // the textarea before the click is even delivered, and the caret is
            // where the command has to land.
            node.addEventListener('mousedown', ev => { if (ev && ev.preventDefault) { ev.preventDefault(); } });
            node.addEventListener('click', () => {
                const it = list[Number(node.dataset.slash)];
                if (it) { use(it); }
            });
        });
    }

    window.AFSlashPicker = {
        init, sync, keydown, receive, use, close, isOpen, openFromButton,
        shownItems, queryAt, narrow
    };
})();
