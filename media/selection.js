// Agent Farm — visual selection picker (Wave B).
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    const DATA = window.__DATA__;
    const chosen = new Set();

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
        const canConfirm = meetsMin();
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
                    <span class="badge" style="${canConfirm ? 'color:var(--vscode-charts-green,#4caf50);border-color:var(--vscode-charts-green,#4caf50)' : ''}">${chosen.size} selected</span>
                    <button id="confirm" ${canConfirm ? '' : 'disabled'}>Use selected</button>
                    <button class="secondary" id="cancel">Cancel</button>
                </div>
            </div>
            ${DATA.candidates.length
                ? `<div class="grid">${DATA.candidates.map(card).join('')}</div>`
                : '<div class="card"><p class="muted">No candidate assets were produced before this step.</p></div>'}
            <p class="footnote">The selected assets flow to the next step as their URLs ({prev_json.selected.0}, {prev_text}). Cancel applies the step\'s failure policy.</p>
        `;
        document.querySelectorAll('.pick').forEach(el =>
            el.addEventListener('click', () => {
                const c = DATA.candidates[Number(el.dataset.i)];
                if (chosen.has(c.url)) { chosen.delete(c.url); }
                else if (!atMax()) { chosen.add(c.url); }
                render();
            }));
        const confirm = document.getElementById('confirm');
        if (confirm) { confirm.addEventListener('click', () => { if (meetsMin()) { vscode.postMessage({ type: 'confirm', urls: [...chosen] }); } }); }
        document.getElementById('cancel').addEventListener('click', () => vscode.postMessage({ type: 'cancel' }));
    }

    render();
})();
