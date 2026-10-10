// Agent Farm — a file the farm shows, read-only (X-443): the phone's answer to every "open this
// file" that opens the editor on the PC (a Console card's ✎ open and vs HEAD chips, a report, a
// step's or a task's output, a note's file, a memory file). The host found the file in what the page
// it came from shows; this page only reads it again and, for a file an agent's write tools named
// (DATA.edits), switches between the file and its diff against the last commit. It never names
// another path. Prose (DATA.prose) is read wrapped; code is numbered and scrolled sideways.
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    const DATA = window.__DATA__ || {};
    /** U-189 — the interface language (media/afI18n.js). */
    function tr(s, v) { return window.AFI18n ? window.AFI18n.t(s, v) : s; }
    const EDITS = DATA.edits !== false, PROSE = DATA.prose === true;
    let diff = EDITS && DATA.diff === true;
    let view = null;

    const STYLE = `<style>
        .fv-head { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; margin: 0 0 2px; }
        .fv-head h1 { margin: 0; word-break: break-all; }
        .fv-path { word-break: break-all; font-size: 12px; opacity: calc(1 - .35 * var(--af-dimk, 1)); }
        .fv-facts { font-size: 12px; margin: 2px 0 10px; opacity: calc(1 - .35 * var(--af-dimk, 1)); }
        .fv-bar { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin: 0 0 10px; }
        .fv-bar button[aria-pressed="true"] { outline: 1px solid var(--vscode-focusBorder, #007fd4); }
        .fv-code { display: grid; font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; background: var(--vscode-textCodeBlock-background); border-radius: 6px; padding: 6px 0; overflow-x: auto; box-shadow: var(--af-hc-ring, none); }
        .fv-row { display: flex; white-space: pre; line-height: 1.45; min-height: 1.45em; }
        .fv-n { flex: 0 0 auto; min-width: 3.2em; padding: 0 8px; text-align: right; user-select: none; opacity: calc(1 - .5 * var(--af-dimk, 1)); }
        .fv-t { padding: 0 10px 0 4px; }
        .fv-prose { font-family: var(--vscode-font-family, sans-serif); font-size: 13px; padding: 8px 0; }
        .fv-prose .fv-row { white-space: pre-wrap; overflow-wrap: anywhere; }
        .fv-prose .fv-t { padding: 0 12px; }
        .fv-add { background: color-mix(in srgb, var(--vscode-charts-green, #89d185) 18%, transparent); box-shadow: var(--af-hc-ring, none); }
        .fv-del { background: color-mix(in srgb, var(--vscode-charts-red, #f14c4c) 18%, transparent); box-shadow: var(--af-hc-ring, none); }
        .fv-hunk { color: var(--af-ink-charts-blue, var(--vscode-charts-blue, #3794ff)); }
        .fv-meta { opacity: calc(1 - .35 * var(--af-dimk, 1)); }
        .fv-note { margin: 10px 0; }
    </style>`;

    function bytes(n) {
        if (!(n >= 0)) { return ''; }
        return n < 1024 ? tr('{n} B', { n }) : n < 1048576 ? tr('{n} KB', { n: (n / 1024).toFixed(1) }) : tr('{n} MB', { n: (n / 1048576).toFixed(1) });
    }
    function row(text, cls, n) {
        return `<div class="fv-row ${cls}">${n ? `<span class="fv-n">${n}</span>` : ''}<span class="fv-t">${C.esc(text) || ' '}</span></div>`;
    }
    function kindOf(l) {
        if (/^(diff --git|index |--- |\+\+\+ |new file mode|deleted file mode|old mode|new mode|similarity|rename )/.test(l)) { return 'fv-meta'; }
        if (l.startsWith('@@')) { return 'fv-hunk'; }
        if (l.startsWith('+')) { return 'fv-add'; }
        if (l.startsWith('-')) { return 'fv-del'; }
        return '';
    }
    /** a sentence already in the reader's language (the host's own sentences go through tr where they are drawn) */
    function note(s) { return s ? `<p class="fv-note">${C.esc(s)}</p>` : ''; }

    function body() {
        if (!view) { return `<p class="fv-note">${C.esc(tr('Reading the file…'))}</p>`; }
        if (diff) {
            const lines = view.diff ? view.diff.replace(/\n$/, '').split('\n') : [];
            return (lines.length ? `<div class="fv-code">${lines.map(l => row(l, kindOf(l), 0)).join('')}</div>` : '') + note(view.diffNote ? tr(view.diffNote) : '');
        }
        if (typeof view.text !== 'string') { return note(view.note ? tr(view.note) : ''); }
        const lines = view.text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
        return `<div class="fv-code${PROSE ? ' fv-prose' : ''}">${lines.map((l, i) => row(l, '', PROSE ? 0 : i + 1)).join('')}</div>`
            + (view.truncated ? note(tr('Only the first 256 KB is shown.')) : '');
    }

    function render() {
        const facts = view && view.exists
            ? [bytes(view.size), view.mtime ? tr('changed {when}', { when: new Date(view.mtime).toLocaleString() }) : ''].filter(Boolean).join(' · ')
            : '';
        document.getElementById('app').innerHTML = STYLE
            + `<div class="fv-head"><h1>${C.esc(DATA.name || '')}</h1></div>`
            + `<div class="fv-path">${C.esc(DATA.file || '')}</div>`
            + `<div class="fv-facts">${C.esc(facts)}</div>`
            + `<div class="fv-bar">`
            + (EDITS ? `<button class="secondary" data-mode="file" aria-pressed="${!diff}">${C.esc(tr('File'))}</button>`
                + `<button class="secondary" data-mode="diff" aria-pressed="${diff}">${C.esc(tr('Changes since the last commit'))}</button>` : '')
            + `<button class="secondary" data-act="refresh">${C.esc(tr('Read again'))}</button></div>`
            + body();
    }

    document.addEventListener('click', ev => {
        const b = ev.target && ev.target.closest ? ev.target.closest('button') : null;
        if (!b) { return; }
        if (b.dataset.mode) {
            const want = b.dataset.mode === 'diff';
            if (want !== diff) { diff = want; view = null; render(); vscode.postMessage({ type: 'mode', diff }); }
        } else if (b.dataset.act === 'refresh') {
            view = null; render(); vscode.postMessage({ type: 'refresh' });
        }
    });
    window.addEventListener('message', ev => {
        const m = ev.data || {};
        if (m.type === 'view' && m.diff === diff) { view = m.view || null; render(); }
    });
    render();
    vscode.postMessage({ type: 'refresh' });
})();
