// Agent Farm — the place box at the foot of the backlog's ▲/▼ step menu (U-240): the move ten
// presses would not reach. The box holds the row's own place; its small ▲ ▼ and the wheel set it
// the way the menu's read (▲ is up the queue, a smaller number), and nothing moves until ✓ or Enter — a hand
// that scrolls over the box has changed nothing. The host places the code (placeInQueue).
(function () {
    'use strict'; // i18n-exempt
    const t = (s, v) => (window.AFI18n ? window.AFI18n.t(s, v)
        : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? String(v[k]) : m)));
    const esc = v => (window.AFCharts && window.AFCharts.esc ? window.AFCharts.esc(v)
        : String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'));

    // ‼️ The place a hand set and has not sent: a host push repaints the page between two presses of ▲
    // (only a focused field holds a repaint back, and a pressed button is not one), and a box drawn
    // fresh would fall back to the row's own place without a word. Dropped once the row has moved.
    let held = null;
    const hold = box => { held = { key: box.dataset.blplaceIn, at: Number(box.dataset.blat), value: Number(box.value) }; };

    /** The row: [▼][place][▲][✓], full triangles smaller than the menu's (▾ ▴ read as dots at 1x).
     *  Spans, buttons and an input only — a backlog row is one flat div.
     *  `key` names the box (a code and the menu it sits in), `at` is the row's place, `max` the queue's length. */
    function html(o) {
        const key = esc(o.key);
        const at = Number(o.at) || 1;
        const max = Math.max(at, Number(o.max) || 0);
        const shown = held && held.key === String(o.key) && held.at === at ? Math.min(max, held.value) : at;
        return `<span class="pj-bl-place">`
            + `<button data-blplacestep="1" data-blplace="${key}" title="${esc(t('One place further down the queue (a bigger number)'))}">▼</button>`
            + `<input type="number" min="1" max="${max}" value="${shown}" data-blplace-in="${key}" data-blat="${at}" data-blmax="${max}"`
            + ` title="${esc(t('The place to move it to, 1 to {n}: the small ▲ ▼ or the wheel set it, ✓ or Enter moves it', { n: max }))}">`
            + `<button data-blplacestep="-1" data-blplace="${key}" title="${esc(t('One place further up the queue (a smaller number)'))}">▲</button>`
            + `<button class="go" data-blplace-go="${key}" title="${esc(t('Move it to the place in the box'))}">✓</button>`
            + `</span>`;
    }

    // ‼️ THE MENU DOES NOT GROW FOR IT: width 0 + min-width 100% gives the row no say in the
    // menu's width, then fills what the step rows made; the box takes what the buttons leave.
    // Only the box's own focus holds the menu open — a click on ▲ beside it must not. A whole <style>
    // element, drawn after the page's own: a page's style block split by an interpolation stops being one.
    const style = `<style>
                .pj-bl-place { display:flex; align-items:center; gap:0; width:0; min-width:100%;
                    margin-top:3px; padding-top:4px; border-top:1px solid var(--vscode-widget-border,#4443); }
                .pj-bl-steps .pj-bl-place button { width:auto; flex:none; gap:0; padding:1px 2px; font-size:9px; }
                .pj-bl-steps .pj-bl-place button.go { padding:1px 1px; font-size:11px; }
                .pj-bl-place input { flex:1 1 0; width:0; min-width:0; font-size:11px; padding:0 1px;
                    text-align:center; appearance:textfield; -moz-appearance:textfield; }
                .pj-bl-place input::-webkit-inner-spin-button, .pj-bl-place input::-webkit-outer-spin-button {
                    -webkit-appearance:none; margin:0; }
                .pj-bl-steps:has(.pj-bl-place input:focus) { visibility:visible; opacity:1; }</style>`;

    /** What a box holds, as a place: a whole number inside 1..max, and the row's own place when it holds none. */
    function clamp(box, v) {
        const at = Number(box.dataset.blat) || 1;
        const max = Number(box.dataset.blmax) || at;
        const n = Math.round(Number(v));
        return Math.min(max, Math.max(1, String(v).trim() !== '' && Number.isFinite(n) ? n : at));
    }

    /** Wire every box on the page. `move(el, to)` posts the move for the row `el` sits in. */
    function wire(o) {
        const boxOf = key => document.querySelector(`[data-blplace-in="${key}"]`);
        const nudge = (box, by) => { box.value = String(clamp(box, (Number(box.value) || Number(box.dataset.blat)) + by)); hold(box); };
        const go = (el, box) => {
            const to = clamp(box, box.value);
            box.value = String(to);
            held = null;
            if (to !== Number(box.dataset.blat)) { o.move(el, to); }
        };
        document.querySelectorAll('[data-blplacestep]').forEach(el =>
            el.addEventListener('click', ev => {
                ev.stopPropagation();
                const box = boxOf(el.dataset.blplace);
                if (box) { nudge(box, Number(el.dataset.blplacestep)); }
            }));
        document.querySelectorAll('[data-blplace-in]').forEach(box => {
            box.addEventListener('wheel', ev => { ev.preventDefault(); nudge(box, ev.deltaY < 0 ? -1 : 1); }, { passive: false });
            box.addEventListener('keydown', ev => {
                if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); go(box, box); }
            });
            box.addEventListener('change', () => { box.value = String(clamp(box, box.value)); hold(box); });
        });
        document.querySelectorAll('[data-blplace-go]').forEach(el =>
            el.addEventListener('click', ev => {
                ev.stopPropagation();
                const box = boxOf(el.dataset.blplaceGo);
                if (box) { go(el, box); }
            }));
    }

    window.AFBlPlace = { html, style, clamp, wire };
})();
