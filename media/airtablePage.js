// Agent Farm — Airtable Engine page: the module's control room.
// Order of importance: live instances first (what's running, what's in it),
// then the folders that feed discovery, then defaults/connection, then what
// the agents can actually do with it (the tool surface, live-verified).
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    let DATA = window.__DATA__;
    let instErr = '';

    // ‼️ M-33 — A HOST PUSH WAITS FOR THE READER'S HANDS; THE PAGE'S OWN
    // RENDERS DO NOT. render() replaces the whole of #app, so a repaint that
    // arrives while somebody is typing detaches the box they are typing in and
    // the caret falls to <body> — where space IS Page Down. Full text, and
    // what a page-specific busy() is for: media/afRepaint.js.
    const repaint = window.AFRepaint.guard(render);
    window.addEventListener('message', ev => {
        if (ev.data.type === 'data') { DATA = ev.data.data; repaint(); }
        if (ev.data.type === 'instances') {
            DATA.instances = ev.data.rows;
            instErr = ev.data.error || '';
            render();
        }
    });

    const post = (m) => vscode.postMessage(m);
    const esc = (s) => C.esc(String(s === undefined || s === null ? '' : s));
    const rel = (ts) => {
        if (!ts) { return ''; }
        const m = Math.round((Date.now() - ts) / 60000);
        if (m < 1) { return 'just now'; }
        if (m < 60) { return m + 'm ago'; }
        const h = Math.round(m / 60);
        return h < 24 ? h + 'h ago' : Math.round(h / 24) + 'd ago';
    };

    // The stable tool surface — shown even before the first probe, so the user
    // always sees what agents get. A live probe replaces this with verified data.
    const TOOL_HINTS = [
        ['airtable_instances', 'discover instances + health (agents call this first)'],
        ['airtable_stats', 'record counts of an instance'],
        ['airtable_search', 'keyword/tag search in a collection'],
        ['airtable_get', 'one full record by id'],
        ['airtable_media_templates', 'pre-filled field sets for recurring media'],
        ['airtable_media_scan_folder', 'split a folder into new vs already-recorded files'],
        ['airtable_media_save', 'create a media record referencing a file by absolute path'],
        ['airtable_media_update', 'patch an existing record (optimistic concurrency)'],
        ['airtable_knowledge_save', 'save one knowledge atom (sentences)'],
        ['airtable_note_save', 'save a free-form note into the archive']
    ];

    function statusChips() {
        const reg = DATA.registration;
        const chips = [];
        chips.push(!reg.registered
            ? '<span class="tag off" title="agents cannot use the engine until the MCP is registered">MCP not registered</span>'
            : reg.upToDate
                ? '<span class="tag on" title="registered in ~/.claude.json, pointing at the version-independent staged copy">MCP registered</span>'
                : `<span class="tag off" title="registration points at ${esc(reg.currentPath || 'an old path')} — Repair repoints it to the staged copy">needs repair</span>`);
        chips.push(DATA.staging.version
            ? `<span class="tag" title="staged server copy in globalStorage — survives extension updates">server v${esc(DATA.staging.version)}</span>`
            : '<span class="tag off">not staged</span>');
        if (DATA.probe && DATA.probe.ok) {
            chips.push(`<span class="tag on" title="live tools/list answer from the registered server">${DATA.probe.tools.length} tools verified ${esc(rel(DATA.probe.probedAt))}</span>`);
        }
        return chips.join(' ');
    }

    function headerActions() {
        const reg = DATA.registration;
        const btns = [];
        if (!reg.registered) {
            btns.push('<button data-do="register" title="write the user-scope MCP registration — every NEW claude session then sees the airtable_* tools">Register MCP</button>');
        } else if (!reg.upToDate) {
            btns.push('<button data-do="register" title="repoint the registration to the staged copy">Repair registration</button>');
            btns.push('<button class="secondary" data-do="unregister">Unregister</button>');
        } else {
            btns.push('<button class="secondary" data-do="unregister" title="remove the registration (folders and data stay)">Unregister</button>');
        }
        btns.push('<button class="secondary" data-do="probe-tools" title="connect to the registered server and verify its tool list">Probe tools</button>');
        return btns.join('');
    }

    // ---------------------------------------------------------------- instances

    function instanceCards() {
        const rows = DATA.instances;
        if (rows === undefined) { return '<p class="muted">Checking instances…</p>'; }
        if (instErr) { return `<p class="muted">Could not scan: ${esc(instErr)}</p>`; }
        if (!rows.length) {
            return DATA.store.databaseRoots.length
                ? '<p class="muted">No instances under the configured folders — an instance is a folder with its own <code>config.json</code> (the folder itself or a direct subfolder).</p>'
                : '<p class="muted">Add your engine folder below — every deploy (subfolder with a <code>config.json</code>) appears here as a card.</p>';
        }
        const stat = (row) => {
            if (!row.stats) { return ''; }
            const s = row.stats;
            const p = [];
            if (s.lessons !== undefined) { p.push(`<b>${s.lessons}</b> lessons`); }
            if (s.sentences !== undefined) { p.push(`<b>${s.sentences}</b> sentences`); }
            if (s.variants !== undefined) { p.push(`<b>${s.variants}</b> variants`); }
            if (s.media !== undefined) { p.push(`<b>${s.media}</b> media`); }
            return p.join(' · ');
        };
        return `<div class="grid air-grid">${rows.map(row => `
            <div class="card air-inst${row.alive ? '' : ' air-down'}"
                ${window.AFCtx.row('afAirtableInstance', {
                    instName: row.name, instDir: row.dir, instUrl: row.url || '',
                    afDefault: !!row.isDefault, afAlive: !!row.alive
                })}
                title="${esc(window.AFCtx.hint(row.name))}">
                <div class="spread">
                    <h3 style="margin:0"><span class="dot ${row.alive ? 'on' : 'off'}"></span> ${esc(row.name)}
                        ${row.isDefault ? '<span class="tag on" title="used when a tool call names no instance">default</span>' : ''}</h3>
                    <span class="muted small">:${row.port}</span>
                </div>
                ${row.title ? `<div class="muted small">${esc(row.title)}</div>` : ''}
                <div class="air-inst-body">${row.alive
                    ? (stat(row) || '<span class="muted small">live</span>')
                    : `<span class="muted small" title="${esc(row.error || '')}">not running — Start opens it, no browser</span>`}</div>
                <div class="btnrow" style="margin:8px 0 0">
                    ${row.alive ? `<button class="mini" data-open-ui="${esc(row.url)}" title="the engine's own web panel">Open UI</button>`
                        : `<button class="mini" data-start="${esc(row.name)}" title="Start ${esc(row.name)}&#10;&#10;Runs node server.js in its Admin folder, hidden — no npm install, no UI build, no browser tab (start_admin.bat does all three). It keeps running after VS Code closes, like the .bat's window. Its output goes to airtable-engine-${esc(row.name)}.log in Agent Farm's storage.">Start</button>`}
                    ${row.isDefault ? '' : `<button class="mini" data-setdef="${esc(row.name)}" title="use this instance when a tool call names none">Set default</button>`}
                    <button class="mini" data-reveal="${esc(row.dir)}" title="reveal the instance folder">folder</button>
                </div>
            </div>`).join('')}
        </div>`;
    }

    // ---------------------------------------------------------------- folders

    function folderList(list, removeMsg, emptyNote, infoOf) {
        if (!list.length) { return `<p class="muted small" style="margin:4px 0 0">${emptyNote}</p>`; }
        return list.map((raw, i) => `<div class="air-folder">
            <code>${esc(raw)}</code>
            <span class="muted small">${esc(infoOf ? infoOf(raw, i) : '')}</span>
            <button class="mini danger" data-remove="${removeMsg}:${esc(raw)}" title="remove from the list (nothing on disk is touched)">✕</button>
        </div>`).join('');
    }

    function foldersSection() {
        const s = DATA.store;
        const rows = DATA.instances || [];
        const norm = (p) => String(p || '').replace(/\\/g, '/').toLowerCase();
        const infoOf = (raw, i) => {
            if (DATA.instances === undefined) { return ''; }
            const expanded = (DATA.expandedRoots || [])[i] || raw;
            const inside = rows.filter(r => norm(r.dir).startsWith(norm(expanded)));
            const live = inside.filter(r => r.alive).length;
            return inside.length ? `${inside.length} instance(s) · ${live} live` : 'no instances found inside';
        };
        return `<div class="row">
            <div class="card" style="flex:2 1 340px">
                <div class="spread"><b>Engine folders</b>
                    <button class="mini add" data-do="add-root">+ Add folder</button></div>
                <div class="muted small" style="margin:2px 0 6px">Where your engine lives — the parent of your instances, or an instance folder directly (both work). Scanned fresh on every check; ports are never assumed.</div>
                ${folderList(s.databaseRoots, 'remove-root', 'None yet — nothing works until one is added.', infoOf)}
            </div>
            <div class="card" style="flex:1 1 260px">
                <div class="spread"><b>Media folders</b>
                    <button class="mini add" data-do="add-media">+ Add folder</button></div>
                <div class="muted small" style="margin:2px 0 6px">Your media libraries — records point at files here by absolute path (files are never moved).</div>
                ${folderList(s.mediaRoots, 'remove-media', 'Optional.')}
            </div>
        </div>`;
    }

    // ---------------------------------------------------------------- defaults & connection

    function connectionSection() {
        const s = DATA.store;
        const reg = DATA.registration;
        const opts = (DATA.instances || []).map(r =>
            `<option value="${esc(r.name)}"${r.name === s.defaultInstance ? ' selected' : ''} title="${esc(r.name)} — :${r.port}, ${r.alive ? 'running' : 'not running'} · ${esc(r.dir)}">${esc(r.name)}</option>`).join('');
        const ghost = s.defaultInstance && !(DATA.instances || []).some(r => r.name === s.defaultInstance)
            ? `<option value="${esc(s.defaultInstance)}" selected title="${esc(s.defaultInstance)} — no instance of that name under the engine folders">${esc(s.defaultInstance)} (not found)</option>` : '';
        return `<div class="row">
            <div class="card" style="flex:1 1 300px">
                <b>Defaults</b>
                <div class="muted small" style="margin:2px 0 8px">Used when an agent's tool call doesn't specify them.</div>
                <div class="air-defrow"><label>Instance</label>
                    <select id="def-inst" title="empty = the single running one is used automatically">
                        <option value=""${s.defaultInstance ? '' : ' selected'} title="No default — a tool call that names no instance uses the single one running">(auto — the single live one)</option>${opts}${ghost}
                    </select></div>
                <div class="air-defrow"><label>Language</label>
                    <input id="def-lang" type="text" size="6" value="${esc(s.defaultLang)}" placeholder="engine default"
                        title="language tree (TR/EN…) — empty: the engine's own default"></div>
                <div class="air-defrow"><label>Timeout</label>
                    <input id="def-timeout" type="number" min="1000" step="500" value="${s.requestTimeoutMs}"
                        title="HTTP timeout for engine calls"> <span class="muted small">ms</span></div>
            </div>
            <div class="card" style="flex:2 1 380px">
                <b>Connection</b>
                <div class="muted small" style="margin:2px 0 8px">How agents reach the engine — nothing here is machine-specific.</div>
                <div class="air-conn"><span class="muted small">registration</span>
                    ${reg.registered
                        ? `<code title="${esc(reg.currentPath || '')}">${esc((reg.current && reg.current.args && reg.current.args[0]) || '')}</code>`
                        : '<span class="muted small">— not registered</span>'}</div>
                <div class="air-conn"><span class="muted small">module config</span>
                    <a data-openconfig="${esc(DATA.configFile)}" title="the single source of truth (${esc(DATA.configFile)}) — this page edits it, the MCP server re-reads it on every call; click to open"><code>${esc(DATA.configFileToken || DATA.configFile)}</code></a></div>
                <div class="muted small" style="margin-top:8px">Paths use portable tokens (<code>\${APPDATA}</code>) — nothing here is hardcoded to this machine. Changes reach running agents on their next tool call — no restart needed.</div>
            </div>
        </div>`;
    }

    // ---------------------------------------------------------------- agent access

    function agentSection() {
        const probe = DATA.probe;
        const verified = probe && probe.ok;
        const items = verified
            ? probe.tools.map(t => [t.name, (t.description || '').split(/(?<=\.)\s/)[0].slice(0, 120)])
            : TOOL_HINTS;
        return `<div class="card">
            <div class="spread"><b>What agents can do</b>
                <span class="muted small">${verified
                    ? `live-verified ${esc(rel(probe.probedAt))}`
                    : 'expected surface — Probe tools verifies it live'}</span></div>
            <div class="air-tools">${items.map(([n, d]) =>
                `<div class="air-tool"><code>${esc(n)}</code><span class="muted small">${esc(d)}</span></div>`).join('')}</div>
            <div class="muted small" style="margin-top:8px">
                Any agent, any session: once the MCP is registered, telling an agent e.g.
                <i>"scan D:\\renders\\today and record the new files with topic X"</i> is enough —
                it discovers the running instance and writes full-schema records itself.
            </div>
        </div>`;
    }

    // ---------------------------------------------------------------- shell

    function render() {
        const live = (DATA.instances || []).filter(r => r.alive).length;
        const total = (DATA.instances || []).length;
        document.getElementById('app').innerHTML = `
            <style>
                .air-grid { grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); }
                .air-inst h3 { display:flex; align-items:center; gap:7px; }
                .air-inst-body { margin-top: 8px; font-size: 12px; }
                .air-down { opacity: .65; }
                .air-folder { display:flex; gap:10px; align-items:center; margin:3px 0; }
                .air-folder code { max-width: 420px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
                .air-defrow { display:flex; align-items:center; gap:10px; margin:5px 0; }
                .air-defrow label { width: 76px; font-size: 12px; opacity:.8; }
                .air-defrow input[type=number] { width: 84px; }
                .air-conn { display:flex; gap:10px; align-items:baseline; margin:3px 0; }
                .air-conn > span:first-child { width: 110px; flex:none; }
                .air-conn code { max-width: 460px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; display:inline-block; vertical-align:bottom; }
                .air-tools { display:grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap:4px 18px; margin-top:6px; }
                .air-tool { display:flex; gap:8px; align-items:baseline; }
                .air-tool code { flex:none; }
                .mini { background:none; border:1px solid var(--vscode-widget-border,#666); border-radius:4px;
                        color:inherit; cursor:pointer; font-size:11px; padding:1px 7px; }
                .mini:hover { border-color: var(--vscode-charts-blue,#3794ff); color: var(--vscode-charts-blue,#3794ff); }
                .mini.danger:hover { border-color: var(--vscode-charts-red,#f14c4c); color: var(--vscode-charts-red,#f14c4c); }
                .mini.add { border-color: var(--vscode-charts-green,#4caf50); }
                .tag { font-size:10px; border:1px solid currentColor; border-radius:8px; padding:0 6px; opacity:.8; }
                .tag.on { color: var(--vscode-charts-green,#4caf50); }
                .tag.off { color: var(--vscode-charts-orange,#d18616); }
            </style>
            ${window.AFHeader.html({
                page: 'airtable',
                title: '🗄️ Airtable Engine',
                sub: `your data engine as a farm module — ${statusChips()}`,
                actions: headerActions(),
                related: [{ nav: 'toolbox', label: 'Toolbox' }],
                guide: 'airtable-engine'
            })}
            <h2 style="margin-top:14px">Instances <span class="muted small">${total ? `${live} live / ${total}` : ''}</span></h2>
            ${instanceCards()}
            <h2>Folders</h2>
            ${foldersSection()}
            <h2>Defaults & connection</h2>
            ${connectionSection()}
            <h2>Agent access</h2>
            ${agentSection()}`;

        window.AFHeader.wire(vscode);
        document.querySelectorAll('[data-do]').forEach(b =>
            b.addEventListener('click', () => post({ type: b.dataset.do })));
        document.querySelectorAll('[data-open-ui]').forEach(b =>
            b.addEventListener('click', () => post({ type: 'open-ui', url: b.dataset.openUi })));
        document.querySelectorAll('[data-start]').forEach(b =>
            b.addEventListener('click', () => { b.disabled = true; b.textContent = 'Starting…'; post({ type: 'start', name: b.dataset.start }); }));
        document.querySelectorAll('[data-setdef]').forEach(b =>
            b.addEventListener('click', () => post({ type: 'set', key: 'defaultInstance', value: b.dataset.setdef })));
        document.querySelectorAll('[data-reveal]').forEach(b =>
            b.addEventListener('click', () => post({ type: 'reveal', path: b.dataset.reveal })));
        document.querySelectorAll('[data-remove]').forEach(b =>
            b.addEventListener('click', () => {
                const i = b.dataset.remove.indexOf(':');
                post({ type: b.dataset.remove.slice(0, i), value: b.dataset.remove.slice(i + 1) });
            }));
        document.querySelectorAll('[data-openconfig]').forEach(a =>
            a.addEventListener('click', () => post({ type: 'open-config', path: a.dataset.openconfig })));
        const onchg = (id, key, val) => {
            const el = document.getElementById(id);
            if (el) { el.addEventListener('change', () => post({ type: 'set', key, value: val(el) })); }
        };
        onchg('def-inst', 'defaultInstance', el => el.value);
        onchg('def-lang', 'defaultLang', el => el.value.trim());
        onchg('def-timeout', 'requestTimeoutMs', el => Number(el.value));
    }

    /** An instance card's own acts — each is the message one of its three small
     *  buttons sends, reachable from anywhere on the card. */
    function ctxDo(act, ctx) {
        const verb = act.split(':')[0];
        const arg = act.slice(verb.length + 1);
        if (verb === 'atDefault') {
            post({ type: 'set', key: 'defaultInstance', value: String(ctx.instName || '') });
            return;
        }
        if (verb === 'atReveal') { post({ type: 'reveal', path: String(ctx.instDir || '') }); return; }
        if (verb === 'atCopy') { window.AFCtx.copy(arg === 'dir' ? ctx.instDir : ctx.instName); }
    }

    // ‼️ ONCE, at module scope — render() rebuilds every card on every poll.
    window.AFCtx.listen(ctxDo);

    render();
})();
