// Agent Farm — Projects page: the list on the left, the project itself on the
// right. Everything about a project is editable here; nothing about it has to
// be typed into a settings file.
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    let DATA = window.__DATA__;
    let selectedId = DATA.focusId || (DATA.projects[0] && DATA.projects[0].id) || '';
    let flash = null;          // { error } | { ok } — the answer to the last action
    let people = null;         // people rows while being edited (null = read from DATA)
    // The new-project form, open on the page instead of in a prompt sequence.
    // null = closed. `folderTouched` stops the name from overwriting a folder
    // the user picked or typed themselves.
    let creating = null;

    const newForm = seed => ({
        name: (seed && seed.suggestName) || '',
        folder: '',
        folderTouched: false,
        kind: '',
        status: 'active',
        summary: '',
        repos: (seed && seed.repos) || [],
        sessionIds: (seed && seed.sessionIds) || []
    });

    window.addEventListener('message', ev => {
        if (ev.data.type === 'result') {
            flash = ev.data.error ? { error: ev.data.error } : (ev.data.ok ? { ok: ev.data.ok } : null);
            // a create that came back clean has nothing left to show
            if (creating && !ev.data.error) { creating = null; }
            return;                                   // the data message repaints
        }
        if (ev.data.type === 'suggestedFolder') {
            if (creating && !creating.folderTouched) { creating.folder = ev.data.folder || ''; render(); }
            return;
        }
        if (ev.data.type === 'pickedFolder') {
            if (creating) { creating.folder = ev.data.folder; creating.folderTouched = true; render(); }
            return;
        }
        if (ev.data.type === 'data') {
            DATA = ev.data.data;
            if (DATA.newForm) { creating = newForm(DATA.newForm); askSuggestion(creating.name); }
            if (DATA.focusId) { selectedId = DATA.focusId; }
            if (!DATA.projects.some(p => p.id === selectedId)) {
                selectedId = (DATA.projects[0] && DATA.projects[0].id) || '';
            }
            people = null;
            render();
        }
    });

    /** Ask the host where this name's folder would go. The page cannot work it
     *  out itself — it does not know the projects root or how a name becomes a
     *  folder name, and guessing would put the two out of step. */
    function askSuggestion(name) {
        vscode.postMessage({ type: 'suggestFolder', name: name || '' });
    }

    const STATUS_META = {
        planned: { label: 'Planned', icon: '○' },
        active: { label: 'Active', icon: '●' },
        paused: { label: 'On hold', icon: '⏸' },
        done: { label: 'Done', icon: '✔' },
        archived: { label: 'Archived', icon: '📦' }
    };
    const GROUPS = [
        { key: 'open', label: 'Active', statuses: ['active'] },
        { key: 'hold', label: 'On hold', statuses: ['paused', 'planned'] },
        { key: 'closed', label: 'Finished', statuses: ['done', 'archived'] }
    ];

    const money = n => '$' + (Number(n) || 0).toFixed(2);
    // ‼️ These two are a PAIR and must agree on a timezone. dateMs builds LOCAL
    // midnight, so reading the value back through toISOString() printed the day
    // before anywhere east of UTC — and since the form writes back what it
    // displayed, the date walked one day earlier on every single save.
    const dateValue = ms => {
        if (!ms) { return ''; }
        const d = new Date(ms), p = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    };
    const dateMs = v => (v ? new Date(v + 'T00:00:00').getTime() : '');
    const sel = () => DATA.projects.find(p => p.id === selectedId);

    function listHtml() {
        const rows = GROUPS.map(g => {
            const items = DATA.projects.filter(p => g.statuses.indexOf(p.status) >= 0);
            if (!items.length) { return ''; }
            return `<div class="pj-group">${C.esc(g.label)} <span class="muted">${items.length}</span></div>` +
                items.map(p => `
                    <div class="pj-item ${p.id === selectedId ? 'on' : ''}" data-pick="${C.esc(p.id)}">
                        <span class="pj-dot" style="${p.color ? `background:${C.esc(p.color)}` : ''}"></span>
                        <span class="pj-name">${p.icon ? C.esc(p.icon) + ' ' : ''}${C.esc(p.name)}</span>
                        ${p.id === DATA.activeId ? '<span class="pj-badge" title="Active project — sessions started in this window are filed under it">◧</span>' : ''}
                        ${p.warnings.length ? `<span class="pj-warn" title="${C.esc(p.warnings.join(' · '))}">⚠️</span>` : ''}
                        <span class="muted small">${p.sessions}</span>
                    </div>`).join('');
        }).join('');
        const unassigned = DATA.unassigned || { sessions: 0, cost: 0 };
        return `<div class="pj-list">
            <div class="btnrow" style="margin-bottom:8px">
                <button data-act="create">＋ New project</button>
                <button class="secondary" data-act="rescan" title="${C.esc(DATA.projectsRoot ? 'Walk ' + DATA.projectsRoot + ' and pick up folders renamed in Obsidian' : 'Set agentFarm.projectsRoot first')}" ${DATA.projectsRoot ? '' : 'disabled'}>⟳ Rescan</button>
            </div>
            ${rows || '<p class="muted small">No projects yet. A project is a folder plus a name — everything else hangs off it.</p>'}
            <div class="pj-unassigned" title="Sessions no project claims">
                ⊘ Unassigned <span class="muted">${unassigned.sessions} sessions · ${money(unassigned.cost)}</span>
            </div>
        </div>`;
    }

    /** The create form — the whole of it, on the page. A project starts as a
     *  name and a folder; everything else is here because asking for it once,
     *  now, beats discovering later that nobody ever set it. */
    function createHtml() {
        const c = creating;
        const kinds = ['', 'product', 'customer', 'internal', 'research', 'personal', 'ops'];
        const kindOpts = kinds
            .map(k => `<option value="${k}"${c.kind === k ? ' selected' : ''}>${k || '—'}</option>`).join('');
        const statusOpts = Object.keys(STATUS_META)
            .map(s => `<option value="${s}"${c.status === s ? ' selected' : ''}>${STATUS_META[s].label}</option>`).join('');
        const taken = DATA.projects.some(p => p.name.toLowerCase() === c.name.trim().toLowerCase());
        const problem = !c.name.trim() ? 'A project needs a name.'
            : (taken ? `"${c.name.trim()}" already exists.` : '');
        const carried = c.sessionIds.length
            ? `<p class="muted small">${c.sessionIds.length} session(s) will be filed under it as soon as it exists.</p>` : '';
        return `
        <div class="pj-head"><h2>New project</h2></div>
        ${carried}
        <div class="pj-grid">
            <label class="pj-wide">Name <span class="muted small">a product, a customer, a piece of work</span>
                <input id="n-name" value="${C.esc(c.name)}" placeholder="Agent Farm" autofocus>
            </label>
            <label class="pj-wide">Documents folder
                <div class="pj-row">
                    <input id="n-folder" value="${C.esc(c.folder)}" placeholder="leave empty to decide later">
                    <button class="secondary" data-act="nBrowse">Browse…</button>
                </div>
            </label>
            <label>Status<select id="n-status">${statusOpts}</select></label>
            <label>Kind<select id="n-kind">${kindOpts}</select></label>
            <label class="pj-wide">Summary<input id="n-summary" value="${C.esc(c.summary)}" placeholder="one line"></label>
            <label class="pj-wide">Code roots <span class="muted small">one per line — sessions working under them fall to this project</span>
                <textarea id="n-repos" rows="2">${C.esc(c.repos.join('\n'))}</textarea>
            </label>
        </div>
        ${problem ? `<p class="pj-flash bad">${C.esc(problem)}</p>` : ''}
        ${!c.folder.trim() && !problem
            ? '<p class="muted small">No folder: the project is created anyway and will say so on its row until you choose one.</p>' : ''}
        <div class="btnrow pj-actions">
            <button data-act="nCreate" ${problem ? 'disabled' : ''}>Create project</button>
            <button class="secondary" data-act="nCancel">Cancel</button>
        </div>`;
    }

    function warningsHtml(p) {
        if (!p.warnings.length) { return ''; }
        const missing = p.folderState === 'missing';
        const unset = p.folderState === 'unset';
        const buttons = missing
            ? `<button data-act="pickFolder">Relink…</button>
               <button class="secondary" data-act="recreateFolder">Recreate</button>
               <button class="secondary" data-act="clearFolder">Ignore</button>`
            : (unset ? '<button data-act="pickFolder">Choose a folder…</button>' : '');
        return `<div class="pj-banner">
            <div>${p.warnings.map(w => `⚠️ ${C.esc(w)}`).join('<br>')}</div>
            ${buttons ? `<div class="btnrow">${buttons}</div>` : ''}
        </div>`;
    }

    function peopleRows(p) {
        if (people === null) { people = (p.people || []).map(x => Object.assign({}, x)); }
        const roles = ['owner', 'client', 'sponsor', 'contributor', 'contact', 'vendor'];
        const kinds = ['person', 'company', 'self'];
        const opt = (list, v) => list.map(o => `<option value="${o}"${o === v ? ' selected' : ''}>${o}</option>`).join('');
        return people.map((x, i) => `<tr>
            <td><input data-p="name" data-i="${i}" value="${C.esc(x.name || '')}" placeholder="name"></td>
            <td><select data-p="role" data-i="${i}">${opt(roles, x.role || 'contact')}</select></td>
            <td><select data-p="kind" data-i="${i}">${opt(kinds, x.kind || 'person')}</select></td>
            <td><input data-p="contact" data-i="${i}" value="${C.esc(x.contact || '')}" placeholder="email / phone"></td>
            <td><input data-p="link" data-i="${i}" value="${C.esc(x.link || '')}" placeholder="[[vault note]]"></td>
            <td><button class="secondary pj-x" data-rmperson="${i}" title="Remove">✕</button></td>
        </tr>`).join('');
    }

    function formHtml(p) {
        const statusOpts = Object.keys(STATUS_META)
            .map(s => `<option value="${s}"${p.status === s ? ' selected' : ''}>${STATUS_META[s].label}</option>`).join('');
        const kinds = ['', 'product', 'customer', 'internal', 'research', 'personal', 'ops'];
        const kindOpts = kinds
            .map(k => `<option value="${k}"${(p.kind || '') === k ? ' selected' : ''}>${k || '—'}</option>`).join('');
        const parents = [{ id: '', name: '—' }].concat(
            DATA.projects.filter(x => x.id !== p.id && !x.parentId).map(x => ({ id: x.id, name: x.name })));
        const parentOpts = parents
            .map(x => `<option value="${C.esc(x.id)}"${(p.parentId || '') === x.id ? ' selected' : ''}>${C.esc(x.name)}</option>`).join('');
        const agentBoxes = (DATA.agents || []).map(a => `
            <label class="pj-chk"><input type="checkbox" data-agent="${C.esc(a)}" ${p.agentRules.indexOf(a) >= 0 ? 'checked' : ''}> ${C.esc(a)}</label>`).join('');

        return `
        <div class="pj-head">
            <h2>${p.icon ? C.esc(p.icon) + ' ' : ''}${C.esc(p.name)}</h2>
            <div class="btnrow">
                ${p.id === DATA.activeId
                ? '<button class="secondary" data-act="clearActive" title="Stop filing new sessions under this project">◧ Active — clear</button>'
                : '<button class="secondary" data-act="setActive" title="Sessions you start in this window get filed under this project">◧ Make active</button>'}
                <button class="secondary" data-act="openSessions">Sessions (${p.sessions})</button>
                ${p.folderState === 'ok' ? '<button class="secondary" data-act="revealFolder">📁 Folder</button>' : ''}
            </div>
        </div>
        ${warningsHtml(p)}
        <div class="pj-stats">
            <span><b>${p.sessions}</b> sessions</span>
            <span><b>${money(p.cost)}</b> total</span>
            <span><b>${money(p.todayCost)}</b> today</span>
            <span>${p.lastTs ? 'last ' + new Date(p.lastTs).toLocaleDateString() : 'no activity yet'}</span>
        </div>

        <div class="pj-grid">
            <label>Name<input id="f-name" value="${C.esc(p.name)}"></label>
            <label class="pj-chk pj-inline"><input type="checkbox" id="f-renamefolder" checked> also rename the folder</label>
            <label>Status<select id="f-status">${statusOpts}</select></label>
            <label>Kind<select id="f-kind">${kindOpts}</select></label>
            <label>Icon<input id="f-icon" maxlength="4" value="${C.esc(p.icon || '')}" placeholder="🚀"></label>
            <label>Colour<input id="f-color" type="color" value="${C.esc(p.color || '#888888')}"></label>
            <label>Part of<select id="f-parent">${parentOpts}</select></label>
            <label class="pj-wide">Summary<input id="f-summary" value="${C.esc(p.summary || '')}" placeholder="one line; the long version lives in the project's own charter"></label>

            <label class="pj-wide">Documents folder
                <div class="pj-row">
                    <input id="f-folder" value="${C.esc(p.folder || '')}" placeholder="no folder chosen yet" readonly>
                    <button class="secondary" data-act="pickFolder">Choose…</button>
                    ${p.folder ? '<button class="secondary" data-act="clearFolder" title="Forget this folder (the folder itself is not touched)">✕</button>' : ''}
                </div>
            </label>
            <label class="pj-wide">Code roots <span class="muted small">one per line — sessions working under them fall to this project</span>
                <textarea id="f-repos" rows="3" placeholder="D:\\code\\my-app">${C.esc((p.repos || []).join('\n'))}</textarea>
            </label>

            <label>Daily budget<input id="f-budget" type="number" min="0" step="0.5" value="${p.budgetUSD || ''}"></label>
            <label>Total budget<input id="f-budgettotal" type="number" min="0" step="1" value="${p.budgetTotalUSD || ''}"></label>
            <label>Started<input id="f-started" type="date" value="${dateValue(p.startedAt)}"></label>
            <label>Due<input id="f-due" type="date" value="${dateValue(p.dueAt)}"></label>
            <label class="pj-wide">Tags<input id="f-tags" value="${C.esc((p.tags || []).join(', '))}" placeholder="comma separated"></label>

            <div class="pj-wide">
                <div class="pj-sub">Agents whose sessions default here <span class="muted small">a rule, not ownership — an explicit assignment always wins</span></div>
                <div class="pj-chks">${agentBoxes || '<span class="muted small">no agents discovered</span>'}</div>
            </div>

            <div class="pj-wide">
                <div class="pj-sub">People <span class="muted small">who decides, who pays, who does the work, who you ask</span></div>
                <table class="pj-people"><tbody>${peopleRows(p)}</tbody></table>
                <button class="secondary" data-act="addPerson">＋ Add person</button>
            </div>
        </div>

        <div class="btnrow pj-actions">
            <button data-act="save">Save</button>
            <button class="secondary" data-act="delete">Remove project…</button>
        </div>`;
    }

    function render() {
        const p = sel();
        const note = flash
            ? `<div class="pj-flash ${flash.error ? 'bad' : 'good'}">${C.esc(flash.error || flash.ok)}</div>`
            : '';
        document.getElementById('app').innerHTML = `
            <style>
                .pj-wrap { display:flex; gap:18px; align-items:flex-start; }
                .pj-list { flex:0 0 240px; }
                .pj-group { font-size:11px; text-transform:uppercase; opacity:.6; margin:12px 0 4px; }
                .pj-item { display:flex; align-items:center; gap:6px; padding:5px 8px; border-radius:5px; cursor:pointer; }
                .pj-item:hover { background:var(--vscode-list-hoverBackground); }
                .pj-item.on { background:var(--vscode-list-activeSelectionBackground); color:var(--vscode-list-activeSelectionForeground); }
                .pj-dot { width:8px; height:8px; border-radius:50%; background:var(--vscode-panel-border); flex-shrink:0; }
                .pj-name { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
                .pj-badge { opacity:.9; }
                .pj-unassigned { margin-top:14px; padding:6px 8px; border-top:1px solid var(--vscode-panel-border); font-size:12px; opacity:.8; }
                .pj-main { flex:1; min-width:0; }
                .pj-head { display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; }
                .pj-head h2 { margin:0; }
                .pj-banner { border:1px solid var(--vscode-editorWarning-foreground); border-radius:6px;
                    padding:10px 12px; margin:10px 0; display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; align-items:center; }
                .pj-stats { display:flex; gap:18px; flex-wrap:wrap; margin:10px 0 16px; opacity:.9; font-size:12px; }
                .pj-grid { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:12px 18px; }
                .pj-grid label { display:flex; flex-direction:column; gap:4px; font-size:12px; opacity:.9; }
                .pj-grid input, .pj-grid select, .pj-grid textarea { width:100%; box-sizing:border-box; }
                .pj-wide { grid-column:1 / -1; }
                .pj-inline { flex-direction:row !important; align-items:center; gap:6px; }
                .pj-row { display:flex; gap:6px; align-items:center; }
                .pj-row input { flex:1; }
                .pj-sub { font-size:12px; margin-bottom:6px; }
                .pj-chks { display:flex; flex-wrap:wrap; gap:10px; }
                .pj-chk { display:flex; align-items:center; gap:4px; font-size:12px; }
                .pj-people { width:100%; border-collapse:collapse; }
                .pj-people td { padding:2px 3px; }
                .pj-people input, .pj-people select { width:100%; box-sizing:border-box; }
                .pj-x { padding:2px 7px; }
                .pj-actions { margin-top:18px; }
                .pj-flash { padding:7px 11px; border-radius:5px; margin:8px 0; font-size:12px; }
                .pj-flash.good { background:var(--vscode-inputValidation-infoBackground, #0a3); color:var(--vscode-foreground); }
                .pj-flash.bad { background:var(--vscode-inputValidation-errorBackground, #a00); color:var(--vscode-foreground); }
            </style>
            ${window.AFHeader.html({
                page: 'projects',
                title: 'Projects',
                sub: `${DATA.projects.length} project(s)${DATA.activeName ? ' · active: ' + DATA.activeName : ' · no active project'}`,
                guide: 'projeler'
            })}
            ${note}
            <div class="pj-wrap">
                ${listHtml()}
                <div class="pj-main">${creating ? createHtml()
                : (p ? formHtml(p) : '<p class="muted">Pick a project, or create one.</p>')}</div>
            </div>`;
        window.AFHeader.wire(vscode);
        flash = null;
        wire();
    }

    /** Read the whole form back. Empty clears the field — that is how the page
     *  says "no folder / no budget / no parent" without a command per field. */
    function collect() {
        const val = id => (document.getElementById(id) || {}).value;
        const num = id => {
            const v = (val(id) || '').trim();
            return v === '' ? '' : Number(v);
        };
        return {
            status: val('f-status'),
            kind: val('f-kind') || '',
            icon: val('f-icon') || '',
            color: val('f-color') || '',
            summary: val('f-summary') || '',
            parentId: val('f-parent') || '',
            repos: (val('f-repos') || '').split('\n').map(s => s.trim()).filter(Boolean),
            budgetUSD: num('f-budget'),
            budgetTotalUSD: num('f-budgettotal'),
            startedAt: dateMs(val('f-started')),
            dueAt: dateMs(val('f-due')),
            tags: (val('f-tags') || '').split(',').map(s => s.trim()).filter(Boolean),
            match: {
                agents: [...document.querySelectorAll('[data-agent]')]
                    .filter(el => el.checked).map(el => el.dataset.agent)
            },
            people: (people || []).filter(x => (x.name || '').trim())
        };
    }

    function wire() {
        document.querySelectorAll('[data-pick]').forEach(el =>
            el.addEventListener('click', () => {
                selectedId = el.dataset.pick; people = null; creating = null; render();
            }));

        // The create form keeps its own state so a repaint never loses a
        // half-typed name. The folder follows the name until the user takes it
        // over — after that it is theirs.
        if (creating) {
            const bind = (id, key) => {
                const el = document.getElementById(id);
                if (el) { el.addEventListener('input', () => { creating[key] = el.value; }); }
            };
            const name = document.getElementById('n-name');
            if (name) {
                name.addEventListener('input', () => {
                    creating.name = name.value;
                    if (!creating.folderTouched) { askSuggestion(name.value); }
                });
                name.focus();
                name.setSelectionRange(name.value.length, name.value.length);
            }
            const folder = document.getElementById('n-folder');
            if (folder) {
                folder.addEventListener('input', () => {
                    creating.folder = folder.value;
                    creating.folderTouched = true;
                });
            }
            bind('n-summary', 'summary');
            ['n-status', 'n-kind'].forEach(id => {
                const el = document.getElementById(id);
                if (el) { el.addEventListener('change', () => { creating[id.slice(2)] = el.value; }); }
            });
            const repos = document.getElementById('n-repos');
            if (repos) {
                repos.addEventListener('input', () => {
                    creating.repos = repos.value.split('\n').map(s => s.trim()).filter(Boolean);
                });
            }
        }

        document.querySelectorAll('[data-rmperson]').forEach(el =>
            el.addEventListener('click', () => { people.splice(Number(el.dataset.rmperson), 1); render(); }));

        // keep edits to the people table in memory so a repaint does not lose them
        document.querySelectorAll('[data-p]').forEach(el =>
            el.addEventListener('input', () => { people[Number(el.dataset.i)][el.dataset.p] = el.value; }));

        document.querySelectorAll('[data-act]').forEach(el => el.addEventListener('click', () => {
            const p = sel();
            const id = p ? p.id : '';
            switch (el.dataset.act) {
                case 'create':
                    creating = newForm(null);
                    render();
                    askSuggestion('');
                    break;
                case 'nCancel': creating = null; render(); break;
                case 'nBrowse': vscode.postMessage({ type: 'browseFolder', start: creating.folder }); break;
                case 'nCreate':
                    vscode.postMessage({
                        type: 'create',
                        form: {
                            name: creating.name.trim(), folder: creating.folder.trim(),
                            kind: creating.kind, status: creating.status,
                            summary: creating.summary, repos: creating.repos,
                            sessionIds: creating.sessionIds
                        }
                    });
                    break;
                case 'rescan': vscode.postMessage({ type: 'rescan' }); break;
                case 'addPerson': people.push({ name: '', role: 'contact', kind: 'person' }); render(); break;
                case 'pickFolder': vscode.postMessage({ type: 'pickFolder', id }); break;
                case 'clearFolder': vscode.postMessage({ type: 'save', id, patch: { folder: '' } }); break;
                case 'recreateFolder': vscode.postMessage({ type: 'recreateFolder', id }); break;
                case 'revealFolder': vscode.postMessage({ type: 'revealFolder', id }); break;
                case 'setActive': vscode.postMessage({ type: 'setActive', id }); break;
                case 'clearActive': vscode.postMessage({ type: 'setActive', id: '' }); break;
                case 'openSessions': vscode.postMessage({ type: 'openSessions', id }); break;
                case 'delete': vscode.postMessage({ type: 'delete', id, name: p && p.name }); break;
                case 'save': {
                    const name = (document.getElementById('f-name').value || '').trim();
                    // ONE message: a rename can move the folder and that can fail
                    // while every other field still saves fine, so the host does
                    // them in order and reports once. Two messages would race and
                    // the second answer would overwrite the first.
                    vscode.postMessage({
                        type: 'save', id, patch: collect(),
                        ...(p && name && name !== p.name
                            ? { name, renameFolder: document.getElementById('f-renamefolder').checked }
                            : {})
                    });
                    break;
                }
            }
        }));
    }

    // A fresh panel gets its seed in the initial payload — its script was not
    // listening when the message would have been sent.
    if (DATA.newForm) { creating = newForm(DATA.newForm); }
    render();
    if (creating) { askSuggestion(creating.name); }
})();
