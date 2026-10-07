// Agent Farm — Secrets page script: the management console for the OS-keychain
// vault. Every stored secret in one table — add, replace value, edit
// description, scope to agents, delete — plus the per-agent usage
// authorization. Values never reach this page; only metadata does.
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    const t = (s, v) => (window.AFI18n ? window.AFI18n.t(s, v) : s.replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? String(v[k]) : m)));
    let DATA = window.__DATA__;
    const state = { q: '' };

    // ‼️ M-33 — A HOST PUSH WAITS FOR THE READER'S HANDS; THE PAGE'S OWN
    // RENDERS DO NOT. render() replaces the whole of #app, so a repaint that
    // arrives while somebody is typing detaches the box they are typing in and
    // the caret falls to <body> — where space IS Page Down. Full text, and
    // what a page-specific busy() is for: media/afRepaint.js.
    const repaint = window.AFRepaint.guard(render);
    window.addEventListener('message', ev => {
        const m = ev.data;
        if (m.type === 'data') { DATA = m.data; repaint(); return; }
        if (m.type === 'sec-compose') { openForm(m.seed || {}); return; }
        if (m.type === 'sec-msg') { SF.answer(String(m.text || ''), m.ok === true); render(); }
    });

    const post = (m) => vscode.postMessage(m);
    const esc = (s) => C.esc(String(s === undefined || s === null ? '' : s));

    // ------------------------------------------------------------- THE FORM
    // ‼️ X-487 — the card is media/afSecretForm.js (rename, who may use it, the
    // routes it carries); this page is the table the card belongs to. An edit
    // opens under its own row, a new secret at the top.
    const SF = window.AFSecretForm.create({
        data: () => DATA,
        render: () => render(),
        submit: secret => post({ type: 'sec-save', secret: secret })
    });

    function openForm(seed) {
        SF.open(seed);
        render();
        const box = document.getElementById('secform');
        if (box) { box.scrollIntoView(); }
    }

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
        if (s.farmOnly) {
            return `<span class="tag farm" title="farm only — Agent Farm reads it itself; never injected into any agent's tasks">farm only</span>`;
        }
        if (s.allAgents) {
            return `<span class="tag all" title="unrestricted — injected into every agent's tasks">all agents</span>`;
        }
        const chips = s.agents.map(a =>
            `<span class="tag agent${a.missing ? ' missing' : ''}" title="${a.missing ? 'agent no longer exists' : esc(a.id)}">${esc(a.name)}</span>`
        ).join(' ');
        return chips || `<span class="tag none" title="scoped to no agent — no task receives it">no agent</span>`;
    }

    /** X-487 — the routes that sign in with it and the places Agent Farm reads it by name, beside its reach. */
    function usedCell(s) {
        return (s.routes || []).map(r => ` <span class="tag route" title="${esc(t('Route {r} signs in with this secret.', { r: r.label }))}">🔗 ${esc(r.label)}</span>`).join('')
            + ((s.readers || []).length
                ? ` <span class="tag reader" title="${esc(t('Agent Farm reads it by this name for: {list}', { list: s.readers.join('; ') }))}">⚙ ${esc(t('Agent Farm'))}</span>` : '');
    }

    function rows() {
        // the box is a QUERY, not a substring — media/afQuery.js
        const q = window.AFQuery.compile(state.q);
        const list = DATA.secrets.filter(s => s.name === SF.rowOf() ||
            q.test(s.name + ' ' + s.description + ' ' + s.agents.map(a => a.name).join(' ') + (s.farmOnly ? ' farm only' : '')
                + ' ' + (s.routes || []).map(r => r.label).join(' ')));
        if (!list.length) {
            return `<tr><td colspan="6" class="muted" style="padding:14px">${
                DATA.secrets.length ? 'Nothing matches the filter.' : 'No secrets stored yet — click <b>+ Add secret</b>.'
            }</td></tr>`;
        }
        return list.map(s => `<tr ${window.AFCtx.row('afSecretRow', { secret: s.name })}
            title="${esc(window.AFCtx.hint('The value is in the OS keychain and never leaves it'))}">
            <td class="nm">${esc(s.name)}</td>
            <td class="val"><span class="dots" title="stored in the OS keychain — never shown">••••••••</span>
                <button class="mini" data-edit="${esc(s.name)}" title="Replace the value, change what it is for, or choose which agents may use it — one card">edit</button></td>
            <td class="desc">${s.description ? esc(s.description) : '<span class="muted">—</span>'}</td>
            <td class="scope">${scopeCell(s)}${usedCell(s)}</td>
            <td class="small muted">${relTime(s.updatedAt)}</td>
            <td class="act"><button class="mini danger" data-act="delete" data-name="${esc(s.name)}" title="delete from keychain">delete</button></td>
        </tr>${SF.rowOf() === s.name ? `<tr class="secformrow"><td colspan="6">${SF.html()}</td></tr>` : ''}`).join('');
    }

    function render() {
        const n = DATA.secrets.length;
        const farm = DATA.secrets.filter(s => s.farmOnly).length;
        const scoped = DATA.secrets.filter(s => !s.allAgents && !s.farmOnly).length;
        const sub = `${n} secret${n === 1 ? '' : 's'} in the OS keychain`
            + (scoped ? ` · ${scoped} agent-scoped` : '')
            + (farm ? ` · ${farm} farm-only` : '')
            + ` · ${DATA.agentCount} agent${DATA.agentCount === 1 ? '' : 's'} in the farm`;

        document.getElementById('app').innerHTML = `
            <style>
                .sec-intro { line-height: 1.4; }
                .sec-intro code { font-size: 12px; }
                .searchbar input { width: 260px; }
                /* ‼️ X-173 — THE PAGE'S OWN TOOLBAR, and the reason it exists.
                   "+ Add secret" used to be handed to the header as a page
                   ACTION, which puts it in the same row as the twelve global
                   navigation buttons with only a divider between them. A row
                   that mixes "go somewhere else" with "make a new thing here"
                   reads as thirteen destinations, and the one gesture the page
                   is actually for is the least findable thing on it. It belongs
                   beside the filter — the row that is already about the list
                   underneath. */
                .sec-tools { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
                .sec-tools .searchbar { margin: 0; }
                .tb { border-collapse: collapse; width: 100%; }
                .tb th { text-align: left; font-size: 11px; opacity: calc(1 - .3 * var(--af-dimk, 1)); padding: 5px 8px; }
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
                .tag.farm { color: var(--vscode-charts-purple, #b180d7); }
                .tag.route { color: var(--vscode-charts-blue, #3794ff); }
                .tag.reader { color: var(--vscode-charts-yellow, #cca700); }
                .tb tr.secformrow td { background: none; padding: 4px 0 10px; }
                .secpick { display: flex; align-items: center; gap: 6px; margin: 4px 0; }
            </style>
            ${window.AFHeader.html({
                page: 'secrets',
                title: '🔑 Secrets',
                sub: esc(sub)
            })}
            <div class="card sec-intro" style="margin-bottom:10px">
                Values live in the <b>OS keychain</b> (VS Code SecretStorage) — never in settings files or git.
                Each is injected into an agent's tasks as an <b>environment variable</b> and is available in prompts as
                <code>{secret:NAME}</code>. <b>Scope</b> is the usage authorization: <span class="tag all">all agents</span>
                by default, or restrict a secret to specific agents so only their tasks receive it, or make it
                <span class="tag farm">farm only</span> when Agent Farm uses it itself and no agent should. The value itself is
                never shown here — use <b>replace</b> to change it.
            </div>
            ${SF.isOpen() ? (SF.rowOf() ? '' : SF.html()) : window.AFForm.msg(SF.message(), !SF.good())}
            <div class="sec-tools">
                <div class="searchbar"><input id="sec-q" type="text" placeholder="filter secrets…" value="${esc(state.q)}"
                    title="${esc(window.AFQuery.tip('Searched against the name, the description and the agents it is scoped to.'))}"></div>
                <button class="mini add" id="sec-add"${SF.isOpen() ? ' disabled' : ''}
                    title="Name, value, what it is for and who may use it — on one card">+ Add secret</button>
            </div>
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
        const add = document.getElementById('sec-add');
        if (add) { add.addEventListener('click', () => openForm({})); }
        document.querySelectorAll('[data-edit]').forEach(b =>
            b.addEventListener('click', () => openForm({ name: b.dataset.edit })));
        document.querySelectorAll('[data-act]').forEach(b =>
            b.addEventListener('click', () => post({ type: b.dataset.act, name: b.dataset.name })));
        SF.wire();
    }

    /**
     * The menu on a secret.
     *
     * ‼️ THERE IS NO "COPY THE VALUE", AND THERE WILL NOT BE ONE. The value
     * never reaches this page at all — only metadata does — so there is
     * nothing here to copy even if somebody added the item. What can be copied
     * is the NAME and the reference a prompt uses, which is what you actually
     * need when writing one.
     */
    function ctxDo(act, ctx) {
        const verb = act.split(':')[0];
        const arg = act.slice(verb.length + 1);
        const name = String(ctx.secret || '');
        // Three of the four acts became one card (U-14): replacing the value,
        // changing the description and choosing the scope are the same edit.
        if (verb === 'scAct') {
            if (arg === 'delete') { post({ type: 'delete', name: name }); }
            else { openForm({ name: name }); }
            return;
        }
        if (verb === 'scCopyName') { window.AFCtx.copy(name); return; }
        if (verb === 'scCopyRef') { window.AFCtx.copy(name ? '{secret:' + name + '}' : ''); }
    }

    // ‼️ ONCE, at module scope — wire() runs again on every keystroke.
    window.AFCtx.listen(ctxDo);

    render();
})();
