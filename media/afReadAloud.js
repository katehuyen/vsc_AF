// AFRead — a step's 🔊 (U-199): press it and the step is read aloud on this
// machine; the step being read shows ■ (press: stop), a paused one ▶ (press:
// resume). There is ONE reading channel in the host (alerts.readNow /
// alerts.reading), so what a button shows is never the page's guess: the host
// broadcasts { type:'reading', reading:{ sessionId, key, paused } | null } on
// every change and each page paints its buttons from that.
//
// ‼️ PAINTED IN PLACE, NEVER BY A REPAINT. The broadcast arrives as the reading
// moves from step to step, while the reader is looking at — or selecting in —
// the very rows it repaints; only the buttons' glyph, title and class change.
//
// A step is named by its KEY (src/core/sessionRead.ts stepKey): the transcript
// line's uuid, else `#n`, its 1-based place in the whole conversation. A page
// holding the viewer's messages (`messages` cut to the last N, `truncatedCount`
// hidden before them) asks `keyOf` rather than counting for itself.
(function () {
    'use strict'; // i18n-exempt — a directive, not interface text
    const t = (s, v) => (window.AFI18n ? window.AFI18n.t(s, v)
        : s.replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? String(v[k]) : m)));
    const esc = s => String(s === undefined || s === null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    let now = null;
    let post = m => { if (typeof window.acquireVsCodeApi === 'function') { window.acquireVsCodeApi().postMessage(m); } };
    const places = new WeakMap();
    const indexed = new WeakSet();

    // U-207 — a session's last answer (lastBtn): it is that session's reading whatever step is read now
    const LAST = '@last';
    /** `''` · `'reading'` · `'paused'` — what this step is to the reading now. */
    function stateOf(sessionId, key) {
        if (!now || !key || (key !== LAST && now.key !== key) || now.sessionId !== sessionId) { return ''; }
        return now.paused ? 'paused' : 'reading';
    }
    const glyph = st => (st === 'reading' ? '■' : st === 'paused' ? '▶' : '🔊');
    const title = (st, sessionId, key) => (st === 'reading' ? t('Stop reading')
        : st === 'paused' ? t('Resume reading') : key === LAST ? t('Read its last answer aloud')
            : !sessionId ? t('Read it aloud') : t('Read this step aloud'));

    /** The button for one step of one conversation; no session = a page's own text (textBtn). */
    function btn(sessionId, key) {
        const st = stateOf(sessionId, key), says = esc(title(st, sessionId, key));
        return `<button data-read="${esc(key)}" data-read-sid="${esc(sessionId)}" class="readb${st ? ' on' : ''}" title="${says}" aria-label="${says}">${glyph(st)}</button>`;
    }

    /** Redraw every step button under `root` from the reading now. */
    function paint(root) {
        const doc = root || (typeof document !== 'undefined' ? document : null);
        if (!doc || typeof doc.querySelectorAll !== 'function') { return; }
        for (const b of doc.querySelectorAll('button[data-read]')) {
            const st = stateOf(b.dataset.readSid, b.dataset.read), says = title(st, b.dataset.readSid, b.dataset.read);
            b.textContent = glyph(st);
            b.title = says;
            if (typeof b.setAttribute === 'function') { b.setAttribute('aria-label', says); }
            b.classList[st ? 'add' : 'remove']('on');
        }
    }

    /** Take the host's answer for what is being read, and show it. */
    function set(reading) {
        const was = now;
        now = reading && typeof reading === 'object' && reading.key ? reading : null;
        if (!now || !was || was.sessionId !== now.sessionId) { follow = true; }
        paint();
        schedule();
    }

    // U-206 — THE PARAGRAPH BEING READ, MARKED AND FOLLOWED. The host sends the spoken
    // paragraph's first words (`head`); the step's text is found by its letters and digits
    // alone (the spoken text has lost the markdown), and the raw block between blank lines
    // around it is marked with a CSS highlight — no DOM is touched, so a selection or a
    // repaint is never disturbed. A code paragraph ("a code block of 9 lines") matches nothing.
    let follow = true, spot = '', marked = null, pending = false, missed = '';
    const spotOf = r => r.sessionId + '|' + r.key + '|' + r.head;
    const fold = s => {
        let n = '';
        const at = [];
        for (let i = 0; i < s.length; i++) {
            if (/[\p{L}\p{N}]/u.test(s[i])) { n += s[i].toLowerCase()[0]; at.push(i); }
        }
        return { n, at };
    };

    /** [start, end) of the raw block (between blank lines) that holds the paragraph starting `head`; null if none does. */
    function blockOf(text, head) {
        const raw = String(text || ''), words = String(head || '').split(/\s+/).filter(Boolean);
        if (!raw || !words.length) { return null; }
        const all = fold(raw);
        for (const from of [0, 1, 2]) {
            for (const k of [12, 6, 3]) {
                const want = fold(words.slice(from, from + k).join(' ')).n;
                const i = want.length >= 6 ? all.n.indexOf(want) : -1;
                if (i < 0) { continue; }
                const at = all.at[i];
                const gap = /\n[ \t]*\n/g;
                let start = 0, end = raw.length, m;
                while ((m = gap.exec(raw))) {
                    if (m.index + m[0].length <= at) { start = m.index + m[0].length; } else { end = m.index; break; }
                }
                while (end > start && /\s/.test(raw[end - 1])) { end--; }
                return [start, end];
            }
        }
        return null;
    }

    function rangeNow() {
        if (!now || !now.head || typeof document.createRange !== 'function') { return null; }
        const b = [...document.querySelectorAll('button[data-read]')].find(x => x.dataset.read === now.key && x.dataset.readSid === now.sessionId);
        const row = b && b.closest ? b.closest('.msg') : null;
        const body = row && row.querySelector('.body');
        const nodes = body ? [...body.childNodes].filter(n => n.nodeType === 3) : [];
        const at = blockOf(nodes.map(n => n.data).join(''), now.head);
        // the step is drawn and none of it is this paragraph: not looked for again until the reading moves
        if (!at) { missed = body ? spotOf(now) : ''; return null; }
        const r = document.createRange();
        let base = 0, started = false;
        for (const n of nodes) {
            const len = n.data.length;
            if (!started && at[0] <= base + len) { r.setStart(n, at[0] - base); started = true; }
            if (started && at[1] <= base + len) { r.setEnd(n, at[1] - base); return r; }
            base += len;
        }
        return null;
    }

    /** Bring the marked paragraph into view inside whatever scrolls it — only when it is out of view. */
    function reveal(r) {
        const rect = r.getBoundingClientRect();
        let el = r.startContainer.parentElement;
        while (el && el !== document.body && el !== document.documentElement) {
            const oy = getComputedStyle(el).overflowY;
            if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight) { break; }
            el = el.parentElement;
        }
        const page = !el || el === document.body || el === document.documentElement;
        const top = page ? 0 : el.getBoundingClientRect().top, h = page ? window.innerHeight : el.clientHeight;
        if (rect.top >= top + 8 && rect.bottom <= top + h - 8) { return; }
        const dy = rect.top - top - Math.min(h * 0.3, Math.max(8, h - rect.height - 8));
        const still = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        (page ? window : el).scrollBy({ top: dy, behavior: still ? 'auto' : 'smooth' });
    }

    function mark() {
        pending = false;
        const hl = typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight === 'function' ? CSS.highlights : null;
        if (!hl) { return; }
        marked = rangeNow();
        if (!marked) { hl.delete('af-reading'); spot = ''; return; }
        if (!document.getElementById('af-reading-style')) {
            const s = document.createElement('style');
            s.id = 'af-reading-style';
            s.textContent = '::highlight(af-reading) { background-color:var(--vscode-editor-findMatchHighlightBackground, #ea5c0055); }';
            (document.head || document.body).appendChild(s);
        }
        hl.set('af-reading', new Highlight(marked));
        const at = spotOf(now);
        if (at !== spot) { spot = at; if (follow) { reveal(marked); } }
    }
    /** After the page's own render: set() is called before the page draws what it was sent. */
    function schedule() { if (!pending && typeof setTimeout === 'function') { pending = true; setTimeout(mark, 0); } }

    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function' && !window.__afReadFollowWired) {
        window.__afReadFollowWired = true;
        // the reader's own hand on the scroll ends following until the next reading
        const away = () => { if (now) { follow = false; } };
        window.addEventListener('wheel', away, { passive: true });
        window.addEventListener('touchmove', away, { passive: true });
        document.addEventListener('keydown', ev => {
            const tg = ev.target, field = tg && (/^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName || '') || tg.isContentEditable);
            if (!field && /^(PageUp|PageDown|Home|End|ArrowUp|ArrowDown)$/.test(ev.key)) { away(); }
        });
        document.addEventListener('mousedown', ev => { const el = ev.target; if (el && el.clientWidth && ev.offsetX >= el.clientWidth) { away(); } });
        // a page that repaints its rows drops the mark with them: mark again, without scrolling
        if (typeof MutationObserver === 'function' && document.body) {
            new MutationObserver(() => {
                if (now && now.head && missed !== spotOf(now) && !(marked && marked.startContainer.isConnected)) { schedule(); }
            })
                .observe(document.body, { childList: true, subtree: true });
        }
    }

    /** A press on a step's button: stop it, resume it, or read it. */
    /** U-202 — the text selected INSIDE this step, '' when the selection is elsewhere or empty. */
    function selectedIn(step) {
        const s = step && window.getSelection ? window.getSelection() : null;
        const text = s ? String(s).trim() : '';
        return text && s.anchorNode && step.contains && step.contains(s.anchorNode) && step.contains(s.focusNode) ? text : '';
    }

    /** `step`: the element the button's step is drawn in — a selection inside it is read instead of the whole step. */
    function press(b, step) {
        if (!b || !b.dataset) { return; }
        const st = stateOf(b.dataset.readSid, b.dataset.read);
        const sel = selectedIn(step);
        if (st === 'reading' && !sel) { post({ type: 'readControl', action: 'stop' }); }
        else if (st === 'paused' && !sel) { post({ type: 'readControl', action: 'resume' }); }
        else if (!b.dataset.readSid) {
            // U-207 — a page's own text, named by its key; the page says what it is (texts()): the
            // text it holds, or a pick its panel answers on the host (a notice's report)
            const said = sel || (textOf ? textOf(b.dataset.read) : '');
            const pick = said && typeof said === 'object' ? { ...said, key: b.dataset.read } : { text: String(said || ''), key: b.dataset.read };
            if (pick.text === undefined || pick.text.trim()) { follow = true; post({ type: 'readAloud', pick }); }
        }
        else {
            follow = true;
            post({ type: 'readAloud', sessionId: b.dataset.readSid, pick: sel ? { text: sel } : b.dataset.read === LAST ? { last: true } : { msg: b.dataset.read } });
        }
    }
    /** U-207 — the ONE button for a text a page reads by its own name (a notice, an article): `key` names it. */
    let textOf = null;
    function textBtn(key) { return btn('', key); }
    // its press is the component's own: no page wires it, and the row under it never sees the click
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function' && !window.__afReadTextWired) {
        window.__afReadTextWired = true;
        document.addEventListener('click', ev => {
            const b = ev.target && ev.target.closest ? ev.target.closest('button[data-read]') : null;
            if (!b || (b.dataset.readSid && b.dataset.read !== LAST)) { return; }
            ev.preventDefault();
            ev.stopPropagation();
            press(b, b.closest('[data-read-scope]'));
        }, true);
    }

    /** The host's two messages for this component; true when it was one of them. */
    function receive(m) {
        if (!m) { return false; }
        if (m.type === 'reading') { set(m.reading); return true; }
        if (m.type === 'readRefused') {
            if (window.AFCtx && window.AFCtx.toast) { window.AFCtx.toast(String(m.error || t('Nothing was read.')), true); }
            return true;
        }
        return false;
    }

    /**
     * A viewer message's key — its uuid, else its place in the whole conversation.
     * Kept per message object, so a list snapshotted before a live push (a replay)
     * still answers for the steps it holds.
     */
    function keyOf(data, m) {
        if (!m) { return ''; }
        if (m.uuid) { return String(m.uuid); }
        const list = data && data.messages;
        if (list && !indexed.has(list)) {
            indexed.add(list);
            list.forEach((x, i) => { if (x && typeof x === 'object') { places.set(x, '#' + ((Number(data.truncatedCount) || 0) + i + 1)); } });
        }
        return places.get(m) || '';
    }

    window.AFRead = {
        init(postFn, reading) { if (typeof postFn === 'function') { post = postFn; } now = reading && reading.key ? reading : null; schedule(); },
        set, btn, paint, press, receive, keyOf, stateOf, selectedIn, blockOf, following: () => follow,
        textBtn, texts(fn) { textOf = typeof fn === 'function' ? fn : null; }, lastBtn: sessionId => btn(sessionId, LAST),
        reading: () => now
    };
})();
