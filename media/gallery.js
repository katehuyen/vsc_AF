// Agent Farm — media gallery page script.
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    let DATA = window.__DATA__;

    window.addEventListener('message', ev => {
        if (ev.data.type === 'data') { DATA = ev.data.data; render(); }
    });

    function fmtTime(ts) { return new Date(ts).toLocaleString(); }

    function card(item) {
        let preview;
        if (item.kind === 'image' && item.assetUri) {
            preview = `<img src="${item.assetUri}" style="width:100%;max-height:220px;object-fit:cover;border-radius:6px;cursor:pointer" data-open="${C.esc(item.assetPath)}">`;
        } else if (item.kind === 'video' && item.assetUri) {
            preview = `<video src="${item.assetUri}" controls muted style="width:100%;max-height:220px;border-radius:6px"></video>`;
        } else if (item.kind === 'audio' && item.assetUri) {
            preview = `<audio src="${item.assetUri}" controls style="width:100%"></audio>`;
        } else {
            preview = `<div class="muted" style="padding:30px;text-align:center">no asset${item.assetPath ? '' : ' (pruned or failed)'}</div>`;
        }
        return `<div class="card">
            ${preview}
            <h3 style="margin:8px 0 2px">${C.esc(item.title)}</h3>
            <div class="sub">${C.esc(item.model)} · ${fmtTime(item.ts)}${item.estCost ? ' · ~' + C.fmtUSD(item.estCost) : ''}</div>
            ${item.workflowTitle ? `<div class="sub muted">from: ${C.esc(item.workflowTitle)}</div>` : ''}
            <details style="margin-top:6px"><summary class="small">input</summary><pre>${C.esc(item.input)}</pre></details>
            <div class="btnrow">
                ${item.assetPath ? `<button class="secondary" data-open="${C.esc(item.assetPath)}">Open file</button>` : ''}
                <button class="secondary" data-rerun="${C.esc(item.taskId)}">Re-run</button>
                <button class="secondary" data-vary="${C.esc(item.taskId)}">Vary…</button>
            </div>
        </div>`;
    }

    function render() {
        document.getElementById('app').innerHTML = `
            <div class="spread">
                <div>
                    <h1>Media Gallery</h1>
                    <div class="muted small">${DATA.items.length} item(s) · total est. media cost ${C.fmtUSD(DATA.totalCost)} · assets live in the task-outputs archive</div>
                </div>
                <div class="btnrow"><button class="secondary" data-guide="medya-uretim-hatti">? Guide</button></div>
            </div>
            ${DATA.items.length
                ? `<div class="grid">${DATA.items.map(card).join('')}</div>`
                : '<div class="card"><h3>No media yet</h3><p class="muted">Add a 🎬 Media step to a workflow (or run a recipe) — generated images/videos land here with their prompt, model and cost.</p></div>'}
        `;
        document.querySelectorAll('[data-open]').forEach(el =>
            el.addEventListener('click', () => vscode.postMessage({ type: 'openAsset', path: el.dataset.open })));
        document.querySelectorAll('[data-rerun]').forEach(el =>
            el.addEventListener('click', () => vscode.postMessage({ type: 'rerun', taskId: el.dataset.rerun })));
        document.querySelectorAll('[data-vary]').forEach(el =>
            el.addEventListener('click', () => vscode.postMessage({ type: 'vary', taskId: el.dataset.vary })));
        document.querySelectorAll('[data-guide]').forEach(el =>
            el.addEventListener('click', () => vscode.postMessage({ type: 'openGuide', anchor: el.dataset.guide })));
    }

    render();
})();
