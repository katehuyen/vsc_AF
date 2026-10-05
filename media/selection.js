// Agent Farm — visual selection picker (Wave B).
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    const DATA = window.__DATA__;
    const chosen = new Set();
    /** U-189 — the interface language (media/afI18n.js). */
    function tr(s) { return window.AFI18n ? window.AFI18n.t(s) : s; }
    // X-456 — the host's word: why a choice was refused, or that the step was answered (a phone's view stays open)
    let note = '';
    let answered = false;
    window.addEventListener('message', ev => {
        const m = ev.data || {};
        if (m.type === 'refused') { note = String(m.text || ''); render(); }
        if (m.type === 'answered') { answered = true; note = tr('This step has been answered — nothing waits for a pick here any more.'); render(); }
    });

    function meetsMin() { return chosen.size >= DATA.min; }
    function atMax() { return DATA.max > 0 && chosen.size >= DATA.max; }

    function card(c, i) {
        const sel = chosen.has(c.url);
        let preview;
        if (c.kind === 'image') {
            preview = `<img src="${c.src}" style="width:100%;max-height:200px;object-fit:cover;border-radius:6px">`;
        } else if (c.kind === 'video') {
            preview = `<video src="${c.src}" controls muted style="width:100%;max-height:200px;border-radius:6px"></video>`;
        } else if (c.kind === 'audio') {
            preview = `<audio src="${c.src}" controls style="width:100%"></audio>`;
        } else {
            preview = `<div class="muted" style="padding:24px;text-align:center">${C.esc(c.kind)}</div>`;
        }
        return `<div class="card pick ${sel ? 'sel' : ''}" data-i="${i}" style="cursor:pointer;border:2px solid ${sel ? 'var(--vscode-charts-blue,#3794ff)' : 'transparent'};position:relative">
            <div style="position:absolute;top:8px;left:8px;width:22px;height:22px;border-radius:4px;background:${sel ? 'var(--vscode-charts-blue,#3794ff)' : 'rgba(0,0,0,0.45)'};color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;z-index:2">${sel ? '✓' : ''}</div>
            ${preview}
            <div class="sub" style="margin-top:6px">${C.esc(c.title)}</div>
        </div>`;
    }

    function render() {
        const canConfirm = meetsMin() && !answered;
        const rangeText = DATA.max > 0
            ? (DATA.min === DATA.max ? `pick exactly ${DATA.min}` : `pick ${DATA.min}–${DATA.max}`)
            : `pick at least ${DATA.min}`;
        document.getElementById('app').innerHTML = `
            <div class="spread">
                <div>
                    <h1>${C.esc(DATA.title)}</h1>
                    <div class="muted small">${DATA.message ? C.esc(DATA.message) + ' · ' : ''}${DATA.candidates.length} candidate(s) · ${rangeText}</div>
                </div>
                <div class="btnrow">
                    <button id="confirm" ${canConfirm ? '' : 'disabled'}>Use selected</button>
                    <button class="secondary" id="cancel"${answered ? ' disabled' : ''}>Cancel</button>
                    <span class="badge" style="${canConfirm ? 'color:var(--vscode-charts-green,#4caf50);border-color:var(--vscode-charts-green,#4caf50)' : ''}">${chosen.size} selected</span>
                </div>
            </div>
            ${note ? `<div class="card"><p class="${answered ? 'muted' : 'err'}">${C.esc(note)}</p></div>` : ''}
            ${DATA.candidates.length
                ? `<div class="grid">${DATA.candidates.map(card).join('')}</div>`
                : '<div class="card"><p class="muted">No candidate assets were produced before this step.</p></div>'}
            <p class="footnote">The selected assets flow to the next step as their URLs ({prev_json.selected.0}, {prev_text}). Cancel applies the step\'s failure policy.</p>
        `;
        document.querySelectorAll('.pick').forEach(el =>
            el.addEventListener('click', () => {
                if (answered) { return; }
                const c = DATA.candidates[Number(el.dataset.i)];
                if (chosen.has(c.url)) { chosen.delete(c.url); }
                else if (!atMax()) { chosen.add(c.url); }
                render();
            }));
        const confirm = document.getElementById('confirm');
        if (confirm) { confirm.addEventListener('click', () => { if (meetsMin()) { vscode.postMessage({ type: 'confirm', urls: [...chosen] }); } }); }
        document.getElementById('cancel').addEventListener('click', () => { if (!answered) { vscode.postMessage({ type: 'cancel' }); } });
    }

    render();
})();
