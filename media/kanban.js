// Agent Farm — kanban task board page script (drag & drop + command bar).
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    let DATA = window.__DATA__;
    let pendingCommand = false;

    window.addEventListener('message', ev => {
        if (ev.data.type === 'data') { DATA = ev.data.data; pendingCommand = false; render(); }
    });

    const STATUS_ICON = { done: '✅', failed: '❌', cancelled: '⊘' };

    function taskCardHtml(t, draggable) {
        const badges = [];
        if (t.verified === 'pass') { badges.push('<span class="tag ok">verify ✓</span>'); }
        if (t.verified === 'fail') { badges.push('<span class="tag bad">verify ✗</span>'); }
        if (t.mode === 'headless') { badges.push('<span class="tag">headless</span>'); }
        if (t.mediaCost) { badges.push(`<span class="tag">${C.fmtUSD(t.mediaCost)}</span>`); }
        if (typeof t.durMin === 'number') { badges.push(`<span class="tag">${t.durMin}m</span>`); }
        const icon = STATUS_ICON[t.status] || '';
        const detail = t.detail ? `<div class="kb-detail">${C.esc(t.detail)}</div>` : '';
        const buttons = [];
        if (t.status === 'queued' || t.status === 'running') {
            buttons.push(`<button class="mini secondary" data-cancel="${t.id}">cancel</button>`);
        } else {
            buttons.push(`<button class="mini secondary" data-del="${t.id}">✕</button>`);
        }
        return `<div class="kb-card${t.status === 'failed' ? ' failed' : ''}" ${draggable ? 'draggable="true"' : ''} data-task="${t.id}" ${t.outputFile ? `data-output="${C.esc(t.outputFile)}"` : ''}>
            <div class="kb-title">${icon ? icon + ' ' : ''}${C.esc(t.title)}</div>
            <div class="kb-meta">${C.esc(t.agentName)} · ${new Date(t.when).toLocaleTimeString()}</div>
            ${detail}
            <div class="kb-foot">${badges.join(' ')}<span class="kb-btns">${buttons.join(' ')}</span></div>
        </div>`;
    }

    function waitingCardHtml(w, i) {
        const isApproval = w.kind === 'browser-approval';
        const actions = isApproval
            ? `<button class="mini" data-approve="${C.esc(w.ref.approvalId)}">Run</button>
               <button class="mini secondary" data-rejectid="${C.esc(w.ref.approvalId)}">Reject</button>`
            : (w.ref.transcriptPath ? `<button class="mini secondary" data-session="${C.esc(w.ref.transcriptPath)}">Open</button>` : '');
        return `<div class="kb-card urgent" data-wait="${i}">
            <div class="kb-title">${w.kind === 'permission' ? '🛡️' : isApproval ? '🌐' : '⏳'} ${C.esc(w.title)}</div>
            ${w.detail ? `<div class="kb-detail">${C.esc(w.detail)}</div>` : ''}
            <div class="kb-foot"><span class="kb-btns">${actions}</span></div>
        </div>`;
    }

    function columnHtml(key, label, cards, extra) {
        return `<div class="kb-col" data-col="${key}">
            <div class="kb-col-head">${label} <span class="muted">${cards.length}</span>${extra || ''}</div>
            <div class="kb-col-body" data-drop="${key}">${cards.join('') || '<div class="kb-empty">—</div>'}</div>
        </div>`;
    }

    function render() {
        const d = DATA;
        document.getElementById('app').innerHTML = `
            <style>
                .kb-bar { display:flex; gap:8px; margin:8px 0 14px; }
                .kb-bar input { flex:1; padding:6px 10px; }
                .kb-board { display:flex; gap:10px; align-items:flex-start; overflow-x:auto; }
                .kb-col { flex:1; min-width:190px; background:var(--vscode-sideBar-background, rgba(128,128,128,.06));
                    border:1px solid var(--vscode-panel-border); border-radius:8px; padding:8px; }
                .kb-col-head { font-weight:700; font-size:12px; text-transform:uppercase; letter-spacing:.5px;
                    padding:2px 4px 8px; }
                .kb-col-body { min-height:60px; }
                .kb-card { border:1px solid var(--vscode-panel-border); border-radius:6px; padding:8px;
                    margin-bottom:8px; background:var(--vscode-editor-background); cursor:grab; }
                .kb-card.failed { border-left:3px solid var(--vscode-errorForeground); }
                .kb-card.urgent { border-left:3px solid var(--vscode-editorWarning-foreground); }
                .kb-card.dragover-target { outline:2px dashed var(--vscode-focusBorder); }
                .kb-title { font-weight:600; font-size:12px; word-break:break-word; }
                .kb-meta { opacity:.7; font-size:11px; margin-top:2px; }
                .kb-detail { font-size:11px; opacity:.85; margin-top:3px; word-break:break-word; }
                .kb-foot { display:flex; align-items:center; gap:4px; margin-top:6px; flex-wrap:wrap; }
                .kb-btns { margin-left:auto; }
                .kb-empty { opacity:.4; text-align:center; padding:12px 0; }
                .tag { font-size:10px; border:1px solid var(--vscode-panel-border); border-radius:3px; padding:0 4px; }
                .tag.ok { color:var(--vscode-charts-green, #3fb950); }
                .tag.bad { color:var(--vscode-errorForeground); }
                button.mini { font-size:10px; padding:1px 6px; }
                .kb-col-body.dragover { background:rgba(128,128,255,.08); border-radius:6px; }
            </style>
            <div class="spread">
                <div><h1>Board</h1>
                    <div class="muted small">drag cards between columns · updated ${new Date(d.generatedAt).toLocaleTimeString()}</div>
                </div>
                <div class="btnrow">
                    <button class="secondary" id="add">+ Task</button>
                    <button class="secondary" id="needs">Needs You</button>
                    <button class="secondary" id="refresh">Refresh</button>
                    <button class="secondary" id="guide">? Guide</button>
                </div>
            </div>
            <div class="kb-bar">
                <input id="cmd" type="text" placeholder="🚀 Natural-language command… (e.g. 'run the psikolog weekly analysis tomorrow at 09:00')" ${pendingCommand ? 'disabled' : ''}>
                <button id="cmdgo" ${pendingCommand ? 'disabled' : ''}>${pendingCommand ? 'planning…' : 'Plan'}</button>
            </div>
            <div class="kb-board">
                ${columnHtml('inbox', '📥 Inbox', d.inbox.map(t => taskCardHtml(t, true)))}
                ${columnHtml('parked', '🕓 Parked', d.parked.map(t => taskCardHtml(t, true)))}
                ${columnHtml('running', '⚙️ Running', d.running.map(t => taskCardHtml(t, true)))}
                ${columnHtml('waiting', '🛡️ Needs Approval', d.waiting.map(waitingCardHtml))}
                ${columnHtml('done', '🏁 Done', d.done.map(t => taskCardHtml(t, false)))}
            </div>
        `;

        document.getElementById('refresh').addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
        document.getElementById('add').addEventListener('click', () => vscode.postMessage({ type: 'add-task' }));
        document.getElementById('needs').addEventListener('click', () => vscode.postMessage({ type: 'open-needs' }));
        document.getElementById('guide').addEventListener('click', () => vscode.postMessage({ type: 'openGuide' }));

        const cmd = document.getElementById('cmd');
        const go = () => {
            if (!cmd.value.trim() || pendingCommand) { return; }
            pendingCommand = true;
            vscode.postMessage({ type: 'command', text: cmd.value });
            render();
        };
        document.getElementById('cmdgo').addEventListener('click', go);
        cmd.addEventListener('keydown', e => { if (e.key === 'Enter') { go(); } });

        document.querySelectorAll('[data-cancel]').forEach(el =>
            el.addEventListener('click', e => { e.stopPropagation(); vscode.postMessage({ type: 'cancel', taskId: el.dataset.cancel }); }));
        document.querySelectorAll('[data-del]').forEach(el =>
            el.addEventListener('click', e => { e.stopPropagation(); vscode.postMessage({ type: 'delete', taskId: el.dataset.del }); }));
        document.querySelectorAll('[data-approve]').forEach(el =>
            el.addEventListener('click', () => vscode.postMessage({ type: 'approve', approvalId: el.dataset.approve, ok: true })));
        document.querySelectorAll('[data-rejectid]').forEach(el =>
            el.addEventListener('click', () => vscode.postMessage({ type: 'approve', approvalId: el.dataset.rejectid, ok: false })));
        document.querySelectorAll('[data-session]').forEach(el =>
            el.addEventListener('click', () => vscode.postMessage({ type: 'open-session', transcriptPath: el.dataset.session })));

        document.querySelectorAll('.kb-card[data-output]').forEach(el =>
            el.addEventListener('dblclick', () => vscode.postMessage({ type: 'open-output', file: el.dataset.output })));

        // drag & drop transitions
        document.querySelectorAll('.kb-card[draggable]').forEach(el => {
            el.addEventListener('dragstart', e => {
                e.dataTransfer.setData('text/plain', el.dataset.task);
                e.dataTransfer.effectAllowed = 'move';
            });
        });
        document.querySelectorAll('[data-drop]').forEach(zone => {
            zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
            zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
            zone.addEventListener('drop', e => {
                e.preventDefault();
                zone.classList.remove('dragover');
                const taskId = e.dataTransfer.getData('text/plain');
                if (taskId) { vscode.postMessage({ type: 'move', taskId, to: zone.dataset.drop }); }
            });
        });
    }

    render();
})();
