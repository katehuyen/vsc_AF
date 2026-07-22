// Agent Farm — Secrets page script: the management console for the OS-keychain
// vault. Every stored secret in one table — add, replace value, edit
// description, scope to agents, delete — plus the per-agent usage
// authorization. Values never reach this page; only metadata does.
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    let DATA = window.__DATA__;
    const state = { q: '' };

    window.addEventListener('message', ev => {
        if (ev.data.type === 'data') { DATA = ev.data.data; render(); }
    });

    const post = (m) => vscode.postMessage(m);
    const esc = (s) => C.esc(String(s === undefined || s === null ? '' : s));

    function relTime(ts) {
        if (!ts) { return '<span class="muted">—</span>'; }
        const m = Math.round((Date.now() - ts) / 60000);
        if (m < 1) { return 'just now'; }
        if (m < 60) { return m + 'm ago'; }
        const h = Math.round(m / 60);
        if (h < 24) { return h + 'h ago'; }
        return Math.round(h / 24) + 'd ago';
    }

    function scopeCell(s) {
        if (s.allAgents) {
            return `<span class="tag all" title="unrestricted — injected into every agent's tasks">all agents</span>`;
        }
        const chips = s.agents.map(a =>
            `<span class="tag agent${a.missing ? ' missing' : ''}" title="${a.missing ? 'agent no longer exists' : esc(a.id)}">${esc(a.name)}</span>`
        ).join(' ');
        return chips || `<span class="tag none" title="scoped to no agent — no task receives it">no agent</span>`;
    }

    function rows() {
        const q = state.q.trim().toLowerCase();
        const list = DATA.secrets.filter(s => !q ||
            (s.name + ' ' + s.description + ' ' + s.agents.map(a => a.name).join(' ')).toLowerCase().includes(q));
        if (!list.length) {
            return `<tr><td colspan="6" class="muted" style="padding:14px">${
                DATA.secrets.length ? 'Nothing matches the filter.' : 'No secrets stored yet — click <b>+ Add secret</b>.'
            }</td></tr>`;
        }
        return list.map(s => `<tr>
            <td class="nm">${esc(s.name)}</td>
            <td class="val"><span class="dots" title="stored in the OS keychain — never shown">••••••••</span>
                <button class="mini" data-act="setValue" data-name="${esc(s.name)}" title="replace the stored value">replace</button></td>
            <td class="desc">${s.description ? esc(s.description) : '<span class="muted">—</span>'}
                <button class="mini" data-act="editDescription" data-name="${esc(s.name)}" title="edit description">✎</button></td>
            <td class="scope">${scopeCell(s)}
                <button class="mini" data-act="editScope" data-name="${esc(s.name)}" title="choose which agents may use this secret">scope</button></td>
            <td class="small muted">${relTime(s.updatedAt)}</td>
            <td class="act"><button class="mini danger" data-act="delete" data-name="${esc(s.name)}" title="delete from keychain">delete</button></td>
        </tr>`).join('');
    }

    function render() {
        const n = DATA.secrets.length;
        const scoped = DATA.secrets.filter(s => !s.allAgents).length;
        const sub = `${n} secret${n === 1 ? '' : 's'} in the OS keychain`
            + (scoped ? ` · ${scoped} agent-scoped` : '')
            + ` · ${DATA.agentCount} agent${DATA.agentCount === 1 ? '' : 's'} in the farm`;

        document.getElementById('app').innerHTML = `
            <style>
                .sec-intro { line-height: 1.4; }
                .sec-intro code { font-size: 12px; }
                .searchbar input { width: 260px; }
                .tb { border-collapse: collapse; width: 100%; }
                .tb th { text-align: left; font-size: 11px; opacity: .7; padding: 5px 8px; }
                .tb td { padding: 6px 8px; vertical-align: top; border-top: 1px solid var(--vscode-widget-border, #4443); }
                .tb tr:hover td { background: var(--vscode-list-hoverBackground, rgba(128,128,128,.08)); }
                .tb td.nm { font-weight: 600; white-space: nowrap; font-family: var(--vscode-editor-font-family, monospace); }
                .tb td.act { white-space: nowrap; text-align: right; }
                .tb td.desc { max-width: 320px; }
                .dots { letter-spacing: 2px; opacity: .6; }
                .mini { background: none; border: 1px solid var(--vscode-widget-border, #666); border-radius: 4px;
                        color: inherit; cursor: pointer; font-size: 11px; padding: 1px 7px; margin-left: 6px; }
                .mini:hover { border-color: var(--vscode-charts-blue, #3794ff); color: var(--vscode-charts-blue, #3794ff); }
                .mini.danger:hover { border-color: var(--vscode-charts-red, #f14c4c); color: var(--vscode-charts-red, #f14c4c); }
                .mini.add { border-color: var(--vscode-charts-green, #4caf50); font-size: 12px; padding: 3px 12px; margin: 0; }
                .tag { font-size: 10px; border: 1px solid currentColor; border-radius: 8px; padding: 0 6px; opacity: .85; white-space: nowrap; }
                .tag.all { color: var(--vscode-charts-green, #4caf50); }
                .tag.agent { color: var(--vscode-charts-blue, #3794ff); }
                .tag.missing { color: var(--vscode-charts-orange, #d18616); text-decoration: line-through; }
                .tag.none, .tag.missing { }
                .tag.none { color: var(--vscode-charts-orange, #d18616); }
            </style>
            ${window.AFHeader.html({
                page: 'secrets',
                title: '🔑 Secrets',
                sub: esc(sub),
                actions: `<button class="mini add" data-act="add">+ Add secret</button>`
            })}
            <div class="card sec-intro" style="margin-bottom:10px">
                Values live in the <b>OS keychain</b> (VS Code SecretStorage) — never in settings files or git.
                Each is injected into an agent's tasks as an <b>environment variable</b> and is available in prompts as
                <code>{secret:NAME}</code>. <b>Scope</b> is the usage authorization: <span class="tag all">all agents</span>
                by default, or restrict a secret to specific agents so only their tasks receive it. The value itself is
                never shown here — use <b>replace</b> to change it.
            </div>
            <div class="searchbar" style="margin-bottom:8px"><input id="sec-q" type="text" placeholder="filter secrets…" value="${esc(state.q)}"></div>
            <div class="card tablewrap"><table class="tb">
                <tr><th>Name</th><th>Value</th><th>Description</th><th>Used by (scope)</th><th>Updated</th><th></th></tr>
                ${rows()}
            </table></div>`;

        wire();
    }

    function wire() {
        window.AFHeader.wire(vscode);
        document.querySelectorAll('[data-afnav]').forEach(b =>
            b.addEventListener('click', () => post({ type: 'afnav', to: b.dataset.afnav })));
        const q = document.getElementById('sec-q');
        if (q) {
            q.addEventListener('input', () => {
                state.q = q.value;
                const pos = q.selectionStart;
                render();
                const nq = document.getElementById('sec-q');
                if (nq) { nq.focus(); nq.setSelectionRange(pos, pos); }
            });
        }
        document.querySelectorAll('[data-act]').forEach(b =>
            b.addEventListener('click', () => post({ type: b.dataset.act, name: b.dataset.name })));
    }

    render();
})();
