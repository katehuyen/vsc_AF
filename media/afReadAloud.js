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

    /** `''` · `'reading'` · `'paused'` — what this step is to the reading now. */
    function stateOf(sessionId, key) {
        if (!now || !key || now.key !== key || now.sessionId !== sessionId) { return ''; }
        return now.paused ? 'paused' : 'reading';
    }
    const glyph = st => (st === 'reading' ? '■' : st === 'paused' ? '▶' : '🔊');
    const title = st => (st === 'reading' ? t('Stop reading')
        : st === 'paused' ? t('Resume reading') : t('Read this step aloud'));

    /** The button for one step of one conversation. */
    function btn(sessionId, key) {
        const st = stateOf(sessionId, key), says = esc(title(st));
        return `<button data-read="${esc(key)}" data-read-sid="${esc(sessionId)}" class="readb${st ? ' on' : ''}" title="${says}" aria-label="${says}">${glyph(st)}</button>`;
    }

    /** Redraw every step button under `root` from the reading now. */
    function paint(root) {
        const doc = root || (typeof document !== 'undefined' ? document : null);
        if (!doc || typeof doc.querySelectorAll !== 'function') { return; }
        for (const b of doc.querySelectorAll('button[data-read]')) {
            const st = stateOf(b.dataset.readSid, b.dataset.read);
            b.textContent = glyph(st);
            b.title = title(st);
            if (typeof b.setAttribute === 'function') { b.setAttribute('aria-label', title(st)); }
            b.classList[st ? 'add' : 'remove']('on');
        }
    }

    /** Take the host's answer for what is being read, and show it. */
    function set(reading) {
        now = reading && typeof reading === 'object' && reading.key ? reading : null;
        paint();
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
        else { post({ type: 'readAloud', sessionId: b.dataset.readSid, pick: sel ? { text: sel } : { msg: b.dataset.read } }); }
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
        init(postFn, reading) { if (typeof postFn === 'function') { post = postFn; } now = reading && reading.key ? reading : null; },
        set, btn, paint, press, receive, keyOf, stateOf, selectedIn,
        reading: () => now
    };
})();
