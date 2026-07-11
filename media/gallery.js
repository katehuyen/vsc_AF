// Agent Farm — media gallery page script.
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    let DATA = window.__DATA__;

    // Wave A filters: production / scene / source ('' = all).
    let fProject = '', fScene = '', fSource = '';

    window.addEventListener('message', ev => {
        if (ev.data.type === 'data') { DATA = ev.data.data; render(); }
    });

    function fmtTime(ts) { return new Date(ts).toLocaleString(); }

    function sceneName(projectId, sceneId) {
        const p = (DATA.productions || []).find(x => x.id === projectId);
        if (!p) { return projectId; }
        const s = p.scenes.find(x => x.id === sceneId);
        return p.title + (s ? ' · ' + s.title : '');
    }

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
        const external = item.source && item.source.indexOf('external') === 0;
        const sceneTag = item.projectId
            ? `<span class="badge" title="assigned scene">${C.esc(sceneName(item.projectId, item.sceneId))}</span>`
            : '';
        const srcTag = external
            ? `<span class="badge warn" title="registered from a watched/external folder">${C.esc(item.source)}</span>`
            : '';
        const pickTag = item.selectedCount
            ? `<span class="badge" style="color:var(--vscode-charts-green,#4caf50);border-color:var(--vscode-charts-green,#4caf50)" title="kept in a selection step">✓ ${item.selectedCount} kept</span>`
            : item.rejectedCount
                ? `<span class="badge muted" title="dropped in a selection step">✗ ${item.rejectedCount} dropped</span>`
                : '';
        return `<div class="card">
            ${preview}
            <h3 style="margin:8px 0 2px">${C.esc(item.title)}</h3>
            <div class="sub">${C.esc(item.model)} · ${fmtTime(item.ts)}${item.estCost ? ' · ~' + C.fmtUSD(item.estCost) : ''} ${sceneTag}${srcTag}${pickTag}</div>
            ${item.workflowTitle ? `<div class="sub muted">from: ${C.esc(item.workflowTitle)}</div>` : ''}
            ${item.input ? `<details style="margin-top:6px"><summary class="small">input</summary><pre>${C.esc(item.input)}</pre></details>` : ''}
            <div class="btnrow">
                ${item.assetPath ? `<button class="secondary" data-open="${C.esc(item.assetPath)}">Open file</button>` : ''}
                ${external ? '' : `<button class="secondary" data-rerun="${C.esc(item.taskId)}">Re-run</button>
                <button class="secondary" data-vary="${C.esc(item.taskId)}">Vary…</button>
                <button class="secondary" data-feedback="${C.esc(item.taskId)}" title="Say what was wrong — the note is injected into the prompt and the asset is regenerated">Feedback…</button>`}
                <button class="secondary" data-assign="${C.esc(item.taskId)}">Scene…</button>
            </div>
        </div>`;
    }

    const STATUS_COLORS = {
        draft: 'var(--vscode-descriptionForeground, #999)',
        generating: 'var(--vscode-charts-blue, #3794ff)',
        review: 'var(--vscode-charts-yellow, #cca700)',
        approved: 'var(--vscode-charts-green, #4caf50)',
        unassigned: 'var(--vscode-descriptionForeground, #999)'
    };

    // Scene status board for the selected production: rows = scenes, columns =
    // asset kinds; cells filter the grid below on click.
    function matrixHtml(p) {
        const rows = p.matrix.map(row => {
            const statusBadge = row.status === 'unassigned'
                ? '<span class="muted small">—</span>'
                : `<span class="badge click" style="color:${STATUS_COLORS[row.status]};border-color:${STATUS_COLORS[row.status]}" data-status-scene="${C.esc(row.sceneId)}" title="click to change status">${row.status}</span>`;
            const cell = (n, kind) => n
                ? `<td class="num click" data-cell-scene="${C.esc(row.sceneId)}" title="show these">${n}</td>`
                : '<td class="num muted">·</td>';
            return `<tr>
                <td><strong>${C.esc(row.title)}</strong>${row.sceneId ? ` <span class="muted small">${C.esc(row.sceneId)}</span>` : ''}</td>
                <td>${statusBadge}</td>
                ${cell(row.counts.image, 'image')}${cell(row.counts.video, 'video')}${cell(row.counts.audio, 'audio')}${cell(row.counts.file, 'file')}
                <td class="num"><strong>${row.total || ''}</strong></td>
            </tr>`;
        }).join('');
        return `<div class="spread"><h2>${C.esc(p.title)} <span class="muted small">(${C.esc(p.agentName)})</span></h2>
        <button class="secondary" id="exportseq" title="Export an FCP7 XML + EDL for Premiere">Export sequence →</button></div>
        <div class="tablewrap"><table>
            <tr><th>Scene</th><th>Status</th><th class="num">img</th><th class="num">vid</th><th class="num">aud</th><th class="num">other</th><th class="num">total</th></tr>
            ${rows || '<tr><td colspan="7" class="muted">No scenes in production.json.</td></tr>'}
        </table></div>`;
    }

    function render() {
        const productions = DATA.productions || [];
        const sources = [...new Set(DATA.items.map(i => i.source))].sort();
        const items = DATA.items.filter(i =>
            (!fProject || i.projectId === fProject) &&
            (!fScene || (fScene === '·' ? (i.projectId === fProject && !i.sceneId) : i.sceneId === fScene)) &&
            (!fSource || i.source === fSource));

        const proj = productions.find(p => p.id === fProject);
        const sceneOpts = proj
            ? `<option value="">all scenes</option><option value="·"${fScene === '·' ? ' selected' : ''}>unassigned</option>` +
              proj.scenes.map(s => `<option value="${C.esc(s.id)}"${fScene === s.id ? ' selected' : ''}>${C.esc(s.title)}</option>`).join('')
            : '';

        document.getElementById('app').innerHTML = `
            <div class="spread">
                <div>
                    <h1>Media Gallery</h1>
                    <div class="muted small">${items.length}/${DATA.items.length} item(s) · total est. media cost ${C.fmtUSD(DATA.totalCost)} · assets live in the task-outputs archive (external ones in place)</div>
                </div>
                <div class="btnrow">
                    ${productions.length ? `<select id="fproj" title="production">
                        <option value="">all productions</option>
                        ${productions.map(p => `<option value="${C.esc(p.id)}"${fProject === p.id ? ' selected' : ''}>${C.esc(p.title)}</option>`).join('')}
                    </select>` : ''}
                    ${proj ? `<select id="fscene" title="scene">${sceneOpts}</select>` : ''}
                    ${sources.length > 1 ? `<select id="fsource" title="source">
                        <option value="">all sources</option>
                        ${sources.map(s => `<option value="${C.esc(s)}"${fSource === s ? ' selected' : ''}>${C.esc(s)}</option>`).join('')}
                    </select>` : ''}
                    <button class="secondary" id="newprod">${productions.length ? 'New Production' : '＋ New Production'}</button>
                    <button class="secondary" data-guide="medya-uretim-hatti">? Guide</button>
                </div>
            </div>
            ${proj ? matrixHtml(proj) : ''}
            ${items.length
                ? `<div class="grid">${items.map(card).join('')}</div>`
                : DATA.items.length
                    ? '<div class="card"><p class="muted">Nothing matches the current filters.</p></div>'
                    : '<div class="card"><h3>No media yet</h3><p class="muted">Add a 🎬 Media step to a workflow (or run a recipe) — generated images/videos land here with their prompt, model and cost. Files dropped into watched ingest folders (agentFarm.ingestFolders) are registered automatically.</p></div>'}
        `;
        const wire = (id, fn) => { const el = document.getElementById(id); if (el) { el.addEventListener('change', fn); } };
        wire('fproj', ev => { fProject = ev.target.value; fScene = ''; render(); });
        wire('fscene', ev => { fScene = ev.target.value; render(); });
        wire('fsource', ev => { fSource = ev.target.value; render(); });
        const newprod = document.getElementById('newprod');
        if (newprod) { newprod.addEventListener('click', () => vscode.postMessage({ type: 'newProduction' })); }
        const exportseq = document.getElementById('exportseq');
        if (exportseq) { exportseq.addEventListener('click', () => vscode.postMessage({ type: 'exportSequence', projectId: fProject })); }
        document.querySelectorAll('[data-open]').forEach(el =>
            el.addEventListener('click', () => vscode.postMessage({ type: 'openAsset', path: el.dataset.open })));
        document.querySelectorAll('[data-rerun]').forEach(el =>
            el.addEventListener('click', () => vscode.postMessage({ type: 'rerun', taskId: el.dataset.rerun })));
        document.querySelectorAll('[data-vary]').forEach(el =>
            el.addEventListener('click', () => vscode.postMessage({ type: 'vary', taskId: el.dataset.vary })));
        document.querySelectorAll('[data-feedback]').forEach(el =>
            el.addEventListener('click', () => vscode.postMessage({ type: 'feedback', taskId: el.dataset.feedback })));
        document.querySelectorAll('[data-assign]').forEach(el =>
            el.addEventListener('click', () => vscode.postMessage({ type: 'assign', taskId: el.dataset.assign })));
        document.querySelectorAll('[data-status-scene]').forEach(el =>
            el.addEventListener('click', () => vscode.postMessage({ type: 'setSceneStatus', projectId: fProject, sceneId: el.dataset.statusScene })));
        document.querySelectorAll('[data-cell-scene]').forEach(el =>
            el.addEventListener('click', () => { fScene = el.dataset.cellScene || '·'; render(); }));
        document.querySelectorAll('[data-guide]').forEach(el =>
            el.addEventListener('click', () => vscode.postMessage({ type: 'openGuide', anchor: el.dataset.guide })));
    }

    render();
})();
