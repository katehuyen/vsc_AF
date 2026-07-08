// Agent Farm — session transcript viewer page script.
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    let DATA = window.__DATA__;
    let filter = '';

    window.addEventListener('message', ev => {
        if (ev.data.type === 'data') { DATA = ev.data.data; render(); }
    });

    function fmtTime(ts) {
        return ts ? new Date(ts).toLocaleString() : '—';
    }

    function messageHtml(m) {
        const roleLabel = { user: 'USER', assistant: 'ASSISTANT', tool: 'TOOL CALL', toolResult: 'TOOL RESULT', system: 'SYSTEM' }[m.role];
        const cls = m.role + (m.isError ? ' error' : '');
        const meta = [
            roleLabel + (m.tool ? ` · ${C.esc(m.tool)}` : ''),
            m.ts ? new Date(m.ts).toLocaleTimeString() : '',
            m.model ? C.esc(m.model.replace(/^claude-/, '')) : '',
            m.tokens ? C.fmtTok(m.tokens) + ' tok' : '',
            m.cost ? C.fmtUSD(m.cost) : '',
            m.sidechain ? 'subagent' : '',
            m.isError ? 'ERROR' : ''
        ].filter(Boolean).join(' · ');

        if (m.role === 'tool') {
            return `<div class="msg tool"><div class="meta">${meta}</div>
                <details><summary>input</summary><pre>${C.esc(m.input || '')}</pre></details></div>`;
        }
        if (m.role === 'toolResult') {
            const body = C.esc(m.text || '(empty result)');
            return `<div class="msg ${cls}"><div class="meta">${meta}</div>
                <details${m.isError ? ' open' : ''}><summary>result</summary><pre>${body}</pre></details></div>`;
        }
        return `<div class="msg ${cls}"><div class="meta">${meta}</div><div class="body">${C.esc(m.text || '')}</div></div>`;
    }

    function render() {
        const durMin = DATA.firstTs && DATA.lastTs ? Math.round((DATA.lastTs - DATA.firstTs) / 60000) : 0;
        const visible = DATA.messages.filter(m => {
            if (!filter) return true;
            const hay = ((m.text || '') + ' ' + (m.tool || '') + ' ' + (m.input || '')).toLowerCase();
            return hay.includes(filter);
        });

        document.getElementById('app').innerHTML = `
            <div class="spread">
                <div>
                    <h1>${C.esc(DATA.title)}</h1>
                    <div class="muted small">${C.esc(DATA.cwd || '')} · ${C.esc(DATA.sessionId)} · ${DATA.permissionMode ? 'mode: ' + C.esc(DATA.permissionMode) : ''}</div>
                </div>
                <div class="btnrow">
                    <button class="secondary" id="refresh">Refresh</button>
                    <button class="secondary" id="raw">Open raw JSONL</button>
                    <button class="secondary" data-guide="oturum-goruntuleyici">? Guide</button>
                </div>
            </div>
            <div class="row">
                <div class="card"><div class="label">Cost</div><div class="kpi">${C.fmtUSD(DATA.cost)}</div><div class="sub">API-equivalent</div></div>
                <div class="card"><div class="label">Tokens</div><div class="kpi">${C.fmtTok(DATA.totalTokens)}</div>
                    <div class="sub">in ${C.fmtTok(DATA.usage.input)} · out ${C.fmtTok(DATA.usage.output)} · cacheR ${C.fmtTok(DATA.usage.cacheRead)} · cacheW ${C.fmtTok(DATA.usage.cacheWrite)}</div></div>
                <div class="card"><div class="label">Span</div><div class="kpi">${durMin}m</div><div class="sub">${fmtTime(DATA.firstTs)} → ${fmtTime(DATA.lastTs)}</div></div>
                <div class="card"><div class="label">Activity</div><div class="kpi">${DATA.toolCalls}</div><div class="sub">tool calls · ${DATA.errors} errors · ${C.esc((DATA.models || []).map(m => m.replace(/^claude-/, '')).join(', '))}</div></div>
            </div>
            <div class="searchbar" style="margin:14px 0 6px">
                <input id="filter" type="text" placeholder="Filter messages… (text, tool name)" value="${C.esc(filter)}">
            </div>
            ${DATA.truncatedCount ? `<p class="muted small">Showing last ${DATA.messages.length} of ${DATA.messageCount} messages (${DATA.truncatedCount} older hidden — raise <code>agentFarm.maxTranscriptMessages</code> to see more).</p>` : ''}
            <div id="msgs">${visible.map(messageHtml).join('') || '<p class="muted">No messages match.</p>'}</div>
        `;

        document.getElementById('refresh').addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
        document.getElementById('raw').addEventListener('click', () => vscode.postMessage({ type: 'openRaw' }));
        document.querySelectorAll('[data-guide]').forEach(el =>
            el.addEventListener('click', () => vscode.postMessage({ type: 'openGuide', anchor: el.dataset.guide })));
        const input = document.getElementById('filter');
        input.addEventListener('input', () => {
            filter = input.value.toLowerCase();
            const msgs = document.getElementById('msgs');
            const vis = DATA.messages.filter(m => {
                if (!filter) return true;
                const hay = ((m.text || '') + ' ' + (m.tool || '') + ' ' + (m.input || '')).toLowerCase();
                return hay.includes(filter);
            });
            msgs.innerHTML = vis.map(messageHtml).join('') || '<p class="muted">No messages match.</p>';
        });
    }

    render();
})();
