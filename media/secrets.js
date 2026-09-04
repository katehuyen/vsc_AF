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
        if (m.type === 'sec-msg') {
            secMsg = String(m.text || '');
            secMsgOk = m.ok === true;
            if (secMsgOk) { form = null; }
            render();
        }
    });

    const post = (m) => vscode.postMessage(m);
    const esc = (s) => C.esc(String(s === undefined || s === null ? '' : s));

    // ------------------------------------------------------------- THE FORM
    /**
     * ‼️ THE VAULT PAGE CAN NOW FILL ITSELF — U-14, surface 5.
     *
     * Four of this page's own buttons posted to the host, which asked an input
     * box each: add (three boxes in a row), replace, edit description, and a
     * multi-pick for the scope. So the one page whose entire subject is a table
     * of secrets could not put a secret in it, and setting a secret's name, its
     * value, what it is for and who may use it meant four separate trips.
     *
     * ‼️ AND THE VALUE STILL ONLY TRAVELS ONE WAY. `buildData` sends metadata
     * and nothing else; the form's value box starts EMPTY on an edit and an
     * empty box means "leave the stored value alone". There is no route by
     * which a stored value reaches this page, which is the same promise the
     * missing "copy the value" menu item makes.
     */
    let form = null;
    let secMsg = '';
    let secMsgOk = false;

    function openForm(seed) {
        const s = seed || {};
        const known = (DATA.secrets || []).find(x => x.name === s.name);
        form = {
            mode: s.name ? 'edit' : 'new',
            name: s.name || '',
            value: '',
            description: known ? (known.description || '') : '',
            // The scope is a tick per agent. "None ticked" is not "no agent" —
            // it is the vault's own "unrestricted", and the card says so out
            // loud, because that default is the opposite of what an empty
            // multi-select usually means.
            scope: (() => {
                const on = {};
                if (known && !known.allAgents) { known.agents.forEach(a => { on['ag_' + a.id] = true; }); }
                return on;
            })()
        };
        secMsg = '';
        secMsgOk = false;
        render();
        const box = document.getElementById('secform');
        if (box) { box.scrollIntoView(); }
    }

    function formHtml() {
        const F = window.AFForm;
        const editing = form.mode === 'edit';
        const ticked = Object.keys(form.scope).filter(k => form.scope[k]).length;
        return F.card({
            id: 'secform',
            title: editing ? 'Edit “' + form.name + '”' : 'New secret',
            lede: editing
                ? 'The stored value is not shown and never will be — leave the value box empty to keep it, or type a new one to replace it.'
                : 'The value goes into the OS keychain, never into a settings file and never into git. It reaches a task as an environment variable and a prompt as {secret:NAME}.',
            body: F.grid([
                editing
                    ? F.stat('Name', form.name)
                    : F.text('name', 'Name', form.name, {
                        required: true, mono: true, ph: 'FAL_KEY',
                        tip: 'Letters, digits, _ . and - . It becomes the environment variable name and the {secret:NAME} reference, so it is the one thing that cannot be changed later.'
                    }),
                F.text('value', editing ? 'New value' : 'Value', form.value, {
                    type: 'password', required: !editing,
                    tip: editing
                        ? 'Empty = keep what is stored. Typing here replaces it.'
                        : 'Held in the OS keychain (VS Code SecretStorage). It is never read back into this page.'
                }),
                F.text('description', 'What it is for', form.description, {
                    wide: true, ph: 'which site / which API / whose account',
                    tip: 'The only thing about a secret you will still recognise in six months.'
                })
            ])
                + F.sec('Who may use it',
                    'Nothing ticked means EVERY agent — that is the vault\'s own default, not "no agent". Tick some and only their tasks receive it.')
                + F.grid((DATA.agents || []).map(a =>
                    F.check('ag_' + a.id, a.name, !!form.scope['ag_' + a.id], {
                        redraw: true,
                        tip: 'Only ' + a.name + '\'s tasks would receive it.'
                    })))
                + F.msg(ticked
                    ? ticked + ' agent(s) ticked — no other agent\'s task receives this secret.'
                    : 'Unrestricted: every agent\'s tasks receive it.'),
            msg: secMsg, warn: !secMsgOk,
            submit: editing ? 'Save changes' : 'Store it in the keychain'
        });
    }

    function wireForm() {
        const F = window.AFForm;
        const box = document.getElementById('secform');
        if (!box || !form) { return; }
        F.wire(box, {
            onEdit: v => {
                Object.keys(v).forEach(k => {
                    if (k.indexOf('ag_') === 0) { form.scope[k] = !!v[k]; }
                    else { form[k] = v[k]; }
                });
            },
            onRedraw: () => render(),
            onSubmit: () => {
                secMsg = '';
                post({
                    type: 'sec-save',
                    secret: {
                        mode: form.mode, name: form.name, value: form.value,
                        description: form.description,
                        agents: Object.keys(form.scope)
                            .filter(k => form.scope[k]).map(k => k.slice(3))
                    }
                });
            },
            onCancel: () => { form = null; secMsg = ''; render(); }
        });
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
        if (s.allAgents) {
            return `<span class="tag all" title="unrestricted — injected into every agent's tasks">all agents</span>`;
        }
        const chips = s.agents.map(a =>
            `<span class="tag agent${a.missing ? ' missing' : ''}" title="${a.missing ? 'agent no longer exists' : esc(a.id)}">${esc(a.name)}</span>`
        ).join(' ');
        return chips || `<span class="tag none" title="scoped to no agent — no task receives it">no agent</span>`;
    }

    function rows() {
        // the box is a QUERY, not a substring — media/afQuery.js
        const q = window.AFQuery.compile(state.q);
        const list = DATA.secrets.filter(s =>
            q.test(s.name + ' ' + s.description + ' ' + s.agents.map(a => a.name).join(' ')));
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
            <td class="scope">${scopeCell(s)}</td>
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
                sub: esc(sub)
            })}
            <div class="card sec-intro" style="margin-bottom:10px">
                Values live in the <b>OS keychain</b> (VS Code SecretStorage) — never in settings files or git.
                Each is injected into an agent's tasks as an <b>environment variable</b> and is available in prompts as
                <code>{secret:NAME}</code>. <b>Scope</b> is the usage authorization: <span class="tag all">all agents</span>
                by default, or restrict a secret to specific agents so only their tasks receive it. The value itself is
                never shown here — use <b>replace</b> to change it.
            </div>
            ${form ? formHtml() : (secMsg ? window.AFForm.msg(secMsg, !secMsgOk) : '')}
            <div class="sec-tools">
                <div class="searchbar"><input id="sec-q" type="text" placeholder="filter secrets…" value="${esc(state.q)}"
                    title="${esc(window.AFQuery.tip('Searched against the name, the description and the agents it is scoped to.'))}"></div>
                <button class="mini add" id="sec-add"${form ? ' disabled' : ''}
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
        wireForm();
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
