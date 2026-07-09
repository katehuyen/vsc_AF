// Agent Farm — "Needs You" approval queue page script.
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    let DATA = window.__DATA__;

    window.addEventListener('message', ev => {
        if (ev.data.type === 'data') { DATA = ev.data.data; render(); }
    });

    const KIND_META = {
        'permission':       { icon: '🛡️', label: 'PERMISSION',  cls: 'urgent' },
        'browser-approval': { icon: '🌐', label: 'BROWSER STEP', cls: 'urgent' },
        'stalled':          { icon: '⏳', label: 'STALLED',      cls: 'warn' },
        'budget':           { icon: '💸', label: 'BUDGET',       cls: 'warn' },
        'conflict':         { icon: '⇄',  label: 'CONFLICT',     cls: 'warn' },
        'deferred':         { icon: '🕓', label: 'PARKED',       cls: '' },
        'suggestion':       { icon: '💡', label: 'SUGGESTION',   cls: '' },
        'your-turn':        { icon: '💬', label: 'YOUR TURN',    cls: '' }
    };

    function rowHtml(item, i) {
        const meta = KIND_META[item.kind] || { icon: '•', label: item.kind, cls: '' };
        const when = item.ts ? new Date(item.ts).toLocaleTimeString() : '';
        const actions = item.actions.map(a =>
            `<button data-i="${i}" data-action="${C.esc(a.id)}"${a.id === 'reject' ? ' class="secondary"' : ''}>${C.esc(a.label)}</button>`
        ).join(' ');
        return `<div class="need-row ${meta.cls}">
            <div class="need-icon">${meta.icon}</div>
            <div class="need-main">
                <div class="need-title">${C.esc(item.title)} <span class="tag">${meta.label}</span></div>
                ${item.detail ? `<div class="need-detail">${C.esc(item.detail)}</div>` : ''}
                <div class="muted small">${C.esc(item.agentName)}${when ? ' · ' + when : ''}</div>
            </div>
            <div class="need-actions btnrow">${actions}</div>
        </div>`;
    }

    function render() {
        const items = DATA.items || [];
        const urgent = items.filter(x => x.urgency <= 2).length;
        document.getElementById('app').innerHTML = `
            <style>
                .need-row { display:flex; gap:12px; align-items:center; padding:10px 12px; margin:6px 0;
                    border:1px solid var(--vscode-panel-border); border-radius:6px; }
                .need-row.urgent { border-left:4px solid var(--vscode-editorWarning-foreground); }
                .need-row.warn { border-left:4px solid var(--vscode-charts-orange, orange); }
                .need-icon { font-size:20px; width:28px; text-align:center; }
                .need-main { flex:1; min-width:0; }
                .need-title { font-weight:600; }
                .need-detail { opacity:.85; margin:2px 0; word-break:break-word; }
                .need-actions { flex-shrink:0; }
                .tag { font-size:10px; opacity:.7; border:1px solid var(--vscode-panel-border);
                    border-radius:3px; padding:1px 5px; margin-left:6px; vertical-align:middle; }
            </style>
            <div class="spread">
                <div>
                    <h1>Needs You</h1>
                    <div class="muted small">${items.length} item(s) · ${urgent} urgent · ${new Date(DATA.generatedAt).toLocaleTimeString()}</div>
                </div>
                <div class="btnrow">
                    <button class="secondary" id="refresh">Refresh</button>
                    <button class="secondary" id="guide">? Guide</button>
                </div>
            </div>
            ${items.length
                ? items.map(rowHtml).join('')
                : '<p class="muted" style="margin-top:24px">🎉 Nothing needs you right now — the farm is running on its own.</p>'}
        `;
        document.getElementById('refresh').addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
        document.getElementById('guide').addEventListener('click', () => vscode.postMessage({ type: 'openGuide' }));
        document.querySelectorAll('[data-action]').forEach(el =>
            el.addEventListener('click', () => vscode.postMessage({
                type: 'action',
                actionId: el.dataset.action,
                item: items[Number(el.dataset.i)]
            })));
    }

    render();
})();
