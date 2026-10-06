// AFReadingPlayer — the header's reading player (U-206). While something is read
// aloud the header's 🔊 is the reading (🗣️, ⏸️ paused) and a click opens this small
// player under it: whose words, which paragraph, ⏮ ⏸/▶ ⏭ ■ and the speed.
//
// ‼️ ONE ROUTE ON EVERY PAGE. Every page already routes the header's
// { type:'afnav', to } to the host's one handler (handleAfNav), so the buttons
// post afnav with to = 'reading:<toggle|prev|next|stop|rate:N>' and the host
// runs the reading's own commands — no page has a message of its own to wire.
//
// The state is the host's push (window.__AFUI__.sound.reading, src/core/soundHeader.ts);
// the player repaints in place on every push and closes when the reading ends.
(function () {
    'use strict'; // i18n-exempt — a directive, not interface text
    const t = (s, v) => (window.AFI18n ? window.AFI18n.t(s, v)
        : s.replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? String(v[k]) : m)));
    const esc = s => String(s === undefined || s === null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const CSS = [
        '.af-rp { position:fixed; z-index:60; min-width:240px; max-width:360px; padding:8px 10px; border-radius:6px;',
        '  background:var(--vscode-editorWidget-background); color:var(--vscode-editorWidget-foreground);',
        '  border:1px solid var(--vscode-editorWidget-border, var(--vscode-widget-border, #4446));',
        '  box-shadow:0 4px 14px var(--vscode-widget-shadow, #0006); font-size:12px; }',
        '.af-rp-h { font-weight:600; overflow-wrap:anywhere; }',
        '.af-rp-s { opacity:.75; margin-top:2px; min-height:1em; }',
        '.af-rp-c { display:flex; align-items:center; gap:4px; margin-top:6px; }',
        '.af-rp-c button { min-width:26px; padding:2px 6px; }',
        '.af-rp-rate { margin-left:auto; display:flex; align-items:center; gap:3px; }',
        '.af-rp-rate b { min-width:22px; text-align:center; font-variant-numeric:tabular-nums; }',
        '.af-head-bar .af-ico[data-afsound="reading"], .af-head-bar .af-ico[data-afsound="paused"] {',
        '  outline:1px solid var(--vscode-focusBorder, #3794ff); outline-offset:-1px; border-radius:4px; }'
    ].join('\n');
    let box = null, anchor = null, post = null;

    const reading = () => ((window.__AFUI__ || {}).sound || {}).reading || null;

    function styleOnce() {
        if (document.getElementById('af-rp-style')) { return; }
        const s = document.createElement('style');
        s.id = 'af-rp-style';
        s.textContent = CSS;
        (document.head || document.body).appendChild(s);
    }

    function html(r) {
        const rate = typeof r.rate === 'number' ? r.rate : 0;
        const b = (act, glyph, says, off) => `<button class="secondary" data-afrp="${act}" title="${esc(says)}" aria-label="${esc(says)}"${off ? ' disabled' : ''}>${glyph}</button>`;
        return `<div class="af-rp-h">${esc(r.head)}</div>`
            + `<div class="af-rp-s">${esc(r.paragraph)}</div>`
            + '<div class="af-rp-c">'
            + b('prev', '⏮', t('Previous paragraph — or the start of this one'))
            + b('toggle', r.paused ? '▶' : '⏸', r.paused ? t('Resume reading') : t('Pause reading'))
            + b('next', '⏭', t('Next paragraph'))
            + b('stop', '■', t('Stop reading'))
            + `<span class="af-rp-rate" title="${esc(t('Speed of this reading: {v} — −10 slow to 10 fast; the setting is on the Sound page', { v: rate }))}">`
            + b('rate:' + (rate - 1), '−', t('Slower'), rate <= -10)
            + `<b>${rate}</b>`
            + b('rate:' + (rate + 1), '+', t('Faster'), rate >= 10)
            + '</span></div>';
    }

    function place() {
        if (!box || !anchor || typeof anchor.getBoundingClientRect !== 'function') { return; }
        const a = anchor.getBoundingClientRect();
        const w = box.offsetWidth || 260;
        const vw = window.innerWidth || 800;
        box.style.top = Math.round(a.bottom + 4) + 'px';
        box.style.left = Math.max(4, Math.min(Math.round(a.right - w), vw - w - 4)) + 'px';
    }

    function close() {
        if (box && box.parentNode) { box.parentNode.removeChild(box); }
        box = null;
        if (document.body && document.body.classList) { document.body.classList.remove('af-rp-open'); }
        if (anchor && anchor.setAttribute) { anchor.setAttribute('aria-expanded', 'false'); }
        anchor = null;
    }

    function paint() {
        const r = reading();
        if (!box) { return; }
        if (!r) { close(); return; }
        box.innerHTML = html(r);
        box.querySelectorAll('[data-afrp]').forEach(b => b.addEventListener('click', ev => {
            ev.stopPropagation();
            if (post) { post({ type: 'afnav', to: 'reading:' + b.dataset.afrp }); }
        }));
        place();
    }

    function open(btn) {
        styleOnce();
        box = document.createElement('div');
        box.id = 'af-rp';
        box.className = 'af-rp';
        box.setAttribute('role', 'dialog');
        box.setAttribute('aria-label', t('Reading aloud'));
        box.addEventListener('click', ev => ev.stopPropagation());
        document.body.appendChild(box);
        anchor = btn;
        anchor.setAttribute('aria-expanded', 'true');
        // the 🔊's own hover stays shut while the player stands under it (pageHeader.js: data-aftip-mute)
        if (document.body.classList) { document.body.classList.add('af-rp-open'); }
        paint();
    }

    /** The header's 🔊 was pressed: while a reading lasts the player takes the click (true); otherwise the page navigates. */
    function claim(btn, ev, vscode) {
        const st = btn && btn.dataset ? btn.dataset.afsound : '';
        if ((st !== 'reading' && st !== 'paused') || !reading()) { return false; }
        if (ev && ev.stopPropagation) { ev.stopPropagation(); }
        post = m => vscode.postMessage(m);
        const again = box && anchor === btn;
        close();
        if (!again) { open(btn); }
        return true;
    }

    if (!window.__afReadingPlayerWired && typeof window.addEventListener === 'function') {
        window.__afReadingPlayerWired = true;
        window.addEventListener('message', ev => {
            const m = ev && ev.data;
            if (m && m.type === 'afui' && m.afui && m.afui.sound) { setTimeout(paint, 0); }
        });
        window.addEventListener('resize', place);
        if (typeof document.addEventListener === 'function') {
            document.addEventListener('click', () => { if (box) { close(); } });
            document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && box) { close(); } });
        }
    }

    window.AFReadingPlayer = { claim, paint, close, html, css: CSS, isOpen: () => !!box };
})();
