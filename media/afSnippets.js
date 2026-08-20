// Agent Farm — the saved prompts, one right-click from any box that takes one.
//
// ‼️ THE PHRASES YOU TYPE EVERY DAY, ONE CLICK FROM THE BOX.
//
// The same handful of instructions get retyped several times a day — "read the
// file before you change it", "answer in Turkish", the shape of a handover —
// and the instruction that was carefully worded once is worse every time after.
//
// They live in a markdown file the user owns (agentFarm.promptSnippetsFile,
// parsed by core/prompts.ts) — not in extension settings, because that file is
// edited in Obsidian with the rest of their notes and can carry as much
// commentary around the blocks as they like.
//
// ‼️ SHARED, BECAUSE THE GESTURE IS ABOUT PROMPTS AND NOT ABOUT ONE PAGE. It
// began on the Console's send buttons, where the question "what do I say" is
// asked at the moment of sending. The Tasks page asks the same question in four
// more boxes — the task's own prompt, the retry prompt, the continuation prompt
// and a workflow step's prompt — and a feature that existed in one of the two
// places the user writes a prompt reads as broken in the other. One file, so
// the filter, the file picker and the paste rule cannot drift apart.
//
// Two shapes of trigger, and they are the same call:
//   bind('c-send', 'c-text')   — a BUTTON opens the picker for a box elsewhere
//   bind('nt-prompt')          — the BOX itself; right-click on it opens the picker
//
// Nothing here sends anything: a snippet is PASTED at the caret, still yours to
// edit, and the press that sends is still your own. The paste goes through
// AFTextTools.insert so a block landing beside half a sentence behaves exactly
// like Ctrl+V does, and an `input` event is fired afterwards — the page's own
// listener is what records the change, so no page needs a callback to stay in
// step with its own draft.
(function () {
    'use strict';

    /** How this page talks to the extension host. Set once by init(). */
    let post = null;
    /** null while closed. Otherwise the list, the filter and where it came from. */
    let state = null;
    /** Where the next pick lands: an element, an id, or a function returning one. */
    let target = null;
    /** The overlay, created on first use and reused. It hangs off <body> rather
     *  than off a slot in the page, because every page draws its own body and a
     *  picker living inside one would be wiped by the next render — which is
     *  exactly what a data push does while a form is open. */
    let host = null;

    /** The tail every trigger's tooltip carries — a menu nobody knows about is
     *  not a feature. */
    const HINT = 'right-click for your saved prompts';

    const esc = s => String(s === undefined || s === null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    const el = x => (typeof x === 'function' ? x()
        : typeof x === 'string' ? document.getElementById(x) : (x || null));

    function ensureHost() {
        if (host) { return host; }
        const body = document.body;
        if (!body || typeof body.appendChild !== 'function') { return null; }
        host = document.createElement('div');
        host.id = 'af-snip';
        body.appendChild(host);
        return host;
    }

    function init(api) {
        post = typeof api === 'function' ? api
            : (api && typeof api.postMessage === 'function' ? m => api.postMessage(m) : null);
    }

    function open(where) {
        if (where !== undefined) { target = where; }
        state = { loading: true, q: '', file: '', source: 'none', items: [], error: '' };
        render();
        if (post) { post({ type: 'promptSnippets' }); }
    }

    function close() { state = null; render(); }

    const isOpen = () => !!state;

    /**
     * The answer to a right-click, read off the file at the moment it was asked
     * for. Returns true when it was this component's message, so a page can
     * hand its whole message event over and stop caring. A late answer to a
     * picker the user already closed is dropped.
     */
    function receive(msg) {
        if (!msg || msg.type !== 'promptSnippets') { return false; }
        if (!state) { return true; }
        state = {
            loading: false, q: state.q || '',
            file: msg.file || '', source: msg.source || 'none',
            items: msg.items || [], error: msg.error || ''
        };
        render();
        return true;
    }

    /** The rows the current filter leaves — drawn and clicked off the same list,
     *  or the indices would disagree. */
    function shownItems() {
        const all = (state && state.items) || [];
        const q = window.AFQuery.compile((state && state.q) || '');
        return q.empty ? all : all.filter(x => q.test(x.label + ' ' + x.group + ' ' + x.text));
    }

    /** Insert one snippet at the caret and give the box back. */
    function use(text) {
        const box = el(target);
        if (!box) { close(); return; }
        window.AFTextTools.insert(box, text);
        // The page's own `input` listener is what records this — a draft, a
        // composer field, an autosize. Nothing here knows which.
        try { box.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) { /* older host */ }
        close();
        // The page may have redrawn on that event, so the box is looked up
        // again rather than trusted.
        const back = el(target) || box;
        try { back.focus({ preventScroll: true }); } catch (e) { back.focus(); }
    }

    function bodyHtml() {
        const all = (state.items) || [];
        const shown = shownItems();
        if (state.loading) { return '<div class="af-snipnone">Reading the file…</div>'; }
        if (state.error || !state.file) {
            return `<div class="af-snipnone">${esc(state.error || 'No prompts file yet.')}<br><br>
                Press <b>📁 Choose a file…</b> above and pick a markdown file — your machine's own
                file picker opens. Put each prompt inside a <code>\`\`\`</code> block; everything
                around the blocks is yours to write notes in and is never offered.<br><br>
                The same thing lives on the <b>Farm Settings</b> page under <b>Saved prompts</b>, where
                you can also see everything that was read out of the file.</div>`;
        }
        if (!all.length) {
            return `<div class="af-snipnone">No blocks in that file yet. Anything you put inside a
                <code>\`\`\`</code> fence shows up here; the text around the fences is yours to
                write notes in and is never offered.</div>`;
        }
        if (!shown.length) { return '<div class="af-snipnone">Nothing matches that.</div>'; }
        let group = null;
        const rows = [];
        for (let i = 0; i < shown.length; i++) {
            const it = shown[i];
            if (it.group !== group) {
                group = it.group;
                if (group) { rows.push(`<div class="af-snipgrp">${esc(group)}</div>`); }
            }
            // ‼️ NO HOVER ON A ROW INSIDE A WINDOW THAT IS ALREADY OPEN. The
            // hover rule in docs/CONVENTIONS.md is about a row you merely pass
            // over on a page; this list is a window the user opened on purpose,
            // and sweeping it flashed a panel over the very rows being
            // compared. The row carries the label and a 120-character preview;
            // the whole text is one click away in the box, and ✎ Edit the file
            // opens the source.
            rows.push(`<button class="af-snipitem" data-snip="${i}">
                <span class="af-sniplbl">${esc(it.label)}</span>
                <span class="af-snipprev">${esc(it.text.replace(/\s+/g, ' ').slice(0, 120))}</span>
            </button>`);
        }
        return rows.join('');
    }

    function html() {
        if (!state) { return ''; }
        const all = state.items || [];
        return `<div class="af-snipwrap" id="af-snipwrap">
            <div class="af-snipbox">
                <div class="af-sniphead">
                    <b>Saved prompts</b>
                    <span class="af-snipq">
                        <input id="af-snip-q" type="text" placeholder="filter…" value="${esc(state.q || '')}"
                            title="${esc(window.AFQuery.tip('Searched against each prompt\'s label, the heading it sits under and its whole text — so a phrase you remember from inside a block finds it.'))}">
                        ${state.q ? '<button class="af-snipqx" id="af-snip-qx" title="Clear the filter (Esc closes the window)">✕</button>' : ''}
                    </span>
                    <span class="af-snipgrow"></span>
                    ${state.file ? `<button class="secondary" id="af-snip-file"
                        title="Open the file this list is read from — add a \`\`\` block and it is here the next time you right-click">✎ Edit the file</button>` : ''}
                    <button class="secondary" id="af-snip-pick" title="${state.file
        ? 'Point at a different file — your machine\'s own file picker opens'
        : 'Choose the markdown file your prompts live in — your machine\'s own file picker opens'}">📁 ${state.file ? 'Change file…' : 'Choose a file…'}</button>
                    <button class="secondary" id="af-snip-x" title="Close (Esc)">✕</button>
                </div>
                <div class="af-sniplist">${bodyHtml()}</div>
                <div class="af-snipfoot">${state.file
        ? `${esc(state.file)} · ${all.length} prompt${all.length === 1 ? '' : 's'}${state.source === 'built-in' ? ' · built-in path' : ''}`
        : 'Farm Settings → Saved prompts'} · clicking one PASTES it into the box — nothing is sent</div>
            </div>
        </div>`;
    }

    function render() {
        const root = ensureHost();
        if (!root) { return; }
        root.innerHTML = html();
        if (!state) { return; }
        const on = (id, ev, fn) => {
            const node = document.getElementById(id);
            if (node) { node.addEventListener(ev, fn); }
        };
        on('af-snip-x', 'click', close);
        on('af-snip-file', 'click', () => { if (post) { post({ type: 'openPromptSnippets' }); } });
        // ‼️ The OS's own file picker, not a settings page. The panel stays
        // open: the answer comes back as a fresh promptSnippets message and the
        // list you were looking at is simply the new file's.
        on('af-snip-pick', 'click', () => {
            state.loading = true;
            render();
            if (post) { post({ type: 'pickPromptSnippets' }); }
        });
        // Clicking the backdrop closes it; clicking the panel must not.
        on('af-snipwrap', 'click', ev => {
            if (ev.target && ev.target.id === 'af-snipwrap') { close(); }
        });
        const q = document.getElementById('af-snip-q');
        if (q) {
            q.addEventListener('input', () => {
                state.q = q.value;
                render();
                const again = document.getElementById('af-snip-q');
                if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
            });
            q.addEventListener('keydown', ev => { if (ev.key === 'Escape') { close(); } });
            try { q.focus({ preventScroll: true }); } catch (e) { q.focus(); }
        }
        // ‼️ CLEARS, NEVER CLOSES. Esc already closes the whole window, so the
        // one gesture the filter box was missing is "show me everything again"
        // without losing the window — and without backspacing a typed phrase
        // one character at a time. The caret goes back into the box, because
        // clearing a filter is nearly always the start of typing another one.
        on('af-snip-qx', 'click', () => {
            state.q = '';
            render();
            const again = document.getElementById('af-snip-q');
            if (again) { try { again.focus({ preventScroll: true }); } catch (e) { again.focus(); } }
        });
        const shown = shownItems();
        // Document-scoped, and safe to be: `data-snip` exists nowhere but in
        // this window, and the window is the only one that can be open.
        document.querySelectorAll('[data-snip]').forEach(node =>
            node.addEventListener('click', () => {
                const it = shown[Number(node.dataset.snip)];
                if (it) { use(it.text); }
            }));
    }

    /**
     * Hang the picker off a trigger. Left-click is untouched — on a send button
     * it still sends, in a text box it still puts the caret where you pressed.
     *
     * `into` says where a pick lands; leaving it out means the trigger IS the
     * box, which is the shape every prompt field on the Tasks page has.
     */
    function bind(trigger, into) {
        const node = el(trigger);
        if (!node) { return false; }
        if (node.dataset && node.dataset.afSnip === '1') { return true; }
        if (node.dataset) { node.dataset.afSnip = '1'; }
        node.addEventListener('contextmenu', ev => {
            ev.preventDefault();
            ev.stopPropagation();
            open(into === undefined ? trigger : into);
        });
        return true;
    }

    /** Bind a whole form's worth of boxes at once, skipping the ones this page
     *  is not currently drawing — a form whose fields come and go with the kind
     *  being made would otherwise need a condition per box. */
    function bindAll(ids) {
        let n = 0;
        for (const id of ids || []) { if (bind(id)) { n++; } }
        return n;
    }

    window.AFSnippets = { init, bind, bindAll, open, close, receive, isOpen, HINT };
})();
