// Agent Farm — Accounts page: every captured sign-in, its plan figures and the
// gestures on it, on a page of its own (X-236).
//
// ‼️ THE VIEW IS media/afAccounts.js, THE SAME ONE THE ENGINES PAGE DRAWS AT
// ITS FOOT. This file only gives it a place to stand: the header, the data and
// the section's own message line. Every press posts the message types
// src/panels/accountsMessages.ts answers for both panels.
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    const A = window.AFAccounts;
    let DATA = window.__DATA__;
    /** a refusal from a capture, a switch or a forget, shown in the section */
    let acctMsg = '';

    // ‼️ M-33 — a host push waits for the reader's hands (media/afRepaint.js).
    const repaint = window.AFRepaint.guard(render);
    window.addEventListener('message', ev => {
        const m = ev.data;
        if (m.type === 'data') { DATA = m.data; repaint(); return; }
        if (m.type === 'acc-msg') { acctMsg = String(m.text || ''); render(); }
    });

    const post = (m) => vscode.postMessage(m);
    const esc = (s) => C.esc(String(s === undefined || s === null ? '' : s));
    const engineLabel = (id) => (DATA.engineLabels || {})[id] || id;
    const ctx = () => ({ DATA, post, esc, engineLabel, msg: acctMsg });

    function render() {
        const list = DATA.accounts || [];
        const engines = new Set(list.map(a => a.engine)).size;
        document.getElementById('app').innerHTML = `
            <style>
                ${A.css}
                /* the section is the page here: no rule above it to part it from */
                .acpage > .posec { margin-top:0; border-top:0; padding-top:0; }
            </style>
            ${window.AFHeader.html({
            page: 'accounts',
            title: 'Accounts',
            sub: list.length
                ? `${list.length} sealed sign-in${list.length === 1 ? '' : 's'} on ${engines} engine${engines === 1 ? '' : 's'}`
                : 'no sealed sign-in yet',
            guide: 'engines'
        })}
            <div class="acpage">${A.sectionHtml(ctx())}</div>`;
        window.AFHeader.wire(vscode, { onRefresh: () => post({ type: 'refresh' }) });
        A.wire(ctx());
    }

    render();
})();
