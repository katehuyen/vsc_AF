// Agent Farm — Toolbox page script: every kind of Claude extension (skills,
// subagents, commands, MCP servers, hooks, plugins, output styles, settings
// files) at user + agent scope — inventory, details (incl. live MCP tool
// lists) and management in one console.
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    let DATA = window.__DATA__;

    const TABS = [
        { id: 'overview', label: 'Overview' },
        { id: 'skill', label: 'Skills' },
        { id: 'subagent', label: 'Subagents' },
        { id: 'command', label: 'Commands' },
        { id: 'mcp', label: 'MCP' },
        { id: 'hook', label: 'Hooks' },
        { id: 'plugin', label: 'Plugins' },
        { id: 'style', label: 'Styles' },
        { id: 'settings', label: 'Files' }
    ];

    const EXPLAIN = {
        skill: 'Multi-step procedures claude loads on demand — invoked as /name or picked automatically when the task matches the description.',
        subagent: 'Named specialist agents (.claude/agents/*.md) that claude can delegate to via the Agent tool.',
        command: 'Typed /slash-commands (.claude/commands/**/*.md) — reusable prompts, ":" namespaced by folder.',
        mcp: 'External tool servers claude connects to. Probe one to see the actual tools it exposes.',
        hook: 'Shell commands claude runs on lifecycle events (settings.json "hooks") — the automation glue.',
        plugin: 'Marketplace bundles of commands/agents/MCP/hooks. Enabled per user via settings.json enabledPlugins.',
        style: 'Output styles (.claude/output-styles/*.md) — switch how claude formats its answers.',
        settings: 'The config files themselves at both scopes — what exists, what keys it sets, one click to open.'
    };

    const state = { tab: 'overview', q: '', expanded: {} };

    window.addEventListener('message', ev => {
        if (ev.data.type === 'data') { DATA = ev.data.data; render(); }
    });

    const post = (m) => vscode.postMessage(m);
    const esc = (s) => C.esc(String(s === undefined || s === null ? '' : s));

    function relTime(ts) {
        if (!ts) return '';
        const m = Math.round((Date.now() - ts) / 60000);
        if (m < 60) return m + 'm ago';
        const h = Math.round(m / 60);
        if (h < 24) return h + 'h ago';
        return Math.round(h / 24) + 'd ago';
    }

    function scopeBadge(it) {
        return it.scope === 'user'
            ? '<span class="tag" title="user scope (~/.claude) — every agent sees this">user</span>'
            : `<span class="tag agent" title="agent scope — only this agent">${esc(it.agentName || '')}</span>`;
    }

    function items(kind) {
        const q = state.q.trim().toLowerCase();
        return DATA.items
            .map((it, i) => ({ it, i }))
            .filter(x => x.it.kind === kind)
            .filter(x => !q ||
                (x.it.name + ' ' + x.it.description + ' ' + (x.it.agentName || '') + ' ' +
                    JSON.stringify(x.it.detail || {})).toLowerCase().includes(q));
    }

    function actionBtns(x, extra) {
        return (extra || '') +
            `<button class="mini" data-act="open" data-i="${x.i}" title="open the defining file">open</button>` +
            `<button class="mini" data-act="reveal" data-i="${x.i}" title="reveal in Explorer">folder</button>` +
            `<button class="mini danger" data-act="remove" data-i="${x.i}" title="remove (backup kept in .afbak)">remove</button>`;
    }

    /** Which kinds this page can actually take away. A plugin is enabled or
     *  disabled, not removed; a settings file is never deleted from here. */
    const REMOVABLE = ['skill', 'subagent', 'command', 'style', 'mcp', 'hook'];

    /**
     * What one Toolbox row IS, for the right-click menu.
     *
     * ‼️ ONE SECTION FOR EIGHT KINDS. Every row on this page is the same shape —
     * an inventory entry with a kind, a scope and a source file — so it
     * publishes one section and lets `afKind` carry the difference. Eight
     * section names would mean eight copies of open/reveal/copy/remove, and the
     * day one of them was forgotten nothing would say so.
     *
     * The index is what the row already addresses itself by: every button on
     * this page sends `data-i`, and the menu sending anything else would be a
     * second way of naming the same row.
     */
    function toolCtx(x) {
        const it = x.it, d = it.detail || {};
        return window.AFCtx.row('afToolRow', {
            toolIndex: x.i, afKind: it.kind, afScope: it.scope,
            afRemovable: REMOVABLE.indexOf(it.kind) >= 0,
            afDisabled: d.disabled === true,
            afOn: it.kind === 'plugin' ? !!d.enabled : undefined,
            afHome: it.kind === 'plugin' && !!d.homepage,
            afProbed: it.kind === 'mcp' && !!DATA.probeCache[probeKeyOf(it)]
        });
    }

    /** The row attribute plus the tooltip that says the menu is there. */
    function rowCtx(x) {
        return `${toolCtx(x)} title="${esc(window.AFCtx.hint(x.it.scope === 'user'
            ? 'user scope — every agent sees this'
            : (x.it.agentName || 'agent scope')))}"`;
    }

    function searchBox(placeholder) {
        return `<div class="searchbar"><input id="tb-q" type="text" placeholder="${esc(placeholder)}" value="${esc(state.q)}"></div>`;
    }

    function newButtons(kind) {
        if (kind !== 'skill' && kind !== 'subagent' && kind !== 'command') { return ''; }
        const opts = ['<option value="">User (all agents)</option>']
            .concat(DATA.agents.map(a => `<option value="${esc(a.id)}">${esc(a.name)}</option>`)).join('');
        return `<span class="newrow">in <select id="tb-newscope">${opts}</select>
            <button class="mini add" data-new="${kind}">+ new ${kind}</button></span>`;
    }

    // ---------------------------------------------------------------- tabs

    function overviewTab() {
        const cards = TABS.slice(1).map(t => {
            const c = DATA.counts[t.id] || { user: 0, agent: 0 };
            return `<div class="card tb-card" data-tab="${t.id}">
                <div class="tb-num">${c.user + c.agent}</div>
                <div class="tb-cat">${t.label}</div>
                <div class="muted small">${c.user} user · ${c.agent} agent</div>
                <div class="muted small tb-exp">${EXPLAIN[t.id]}</div>
            </div>`;
        }).join('')
            // built-in modules ride in the same grid, same visual weight — they
            // just navigate to their own page instead of a tab
            + `<div class="card tb-card" data-modnav="airtable">
                <div class="tb-num">🗄️</div>
                <div class="tb-cat">Airtable Engine</div>
                <div class="muted small">built-in module</div>
                <div class="muted small tb-exp">Your data engine (knowledge + media records) with the airtable_* agent tools — instances, folders and registration live on its own page.</div>
            </div>`;
        return `<div class="card" style="margin-bottom:10px">
            <b>Two scopes, one picture.</b> <span class="muted">USER scope lives in <code>${esc(DATA.paths.userClaudeDir)}</code>
            (plus MCP servers in <code>${esc(DATA.paths.userConfigJson)}</code>) and applies to <b>every</b> agent and session on this machine.
            AGENT scope lives inside each agent folder's <code>.claude/</code> and applies to that agent only (agent entries shadow same-named user ones).
            Click a card to inspect and manage that kind.</span></div>
            <div class="grid tb-grid">${cards}</div>`;
    }

    function mdTable(kind, cols, rowFn) {
        const rows = items(kind);
        if (!rows.length) {
            return searchBox('filter…') + `<p class="muted">${state.q ? 'Nothing matches the filter.' : 'None installed at either scope.'} ${EXPLAIN[kind]}</p>` +
                (newButtons(kind) ? `<p>${newButtons(kind)}</p>` : '');
        }
        return searchBox(`filter ${rows.length} entries…`) +
            (newButtons(kind) ? `<p>${newButtons(kind)}</p>` : '') +
            `<div class="card tablewrap"><table class="tb">
            <tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr>${rows.map(rowFn).join('')}</table></div>`;
    }

    function skillTab() {
        return mdTable('skill', ['Skill', 'Scope', 'Description', 'Used (30d)', ''], x => {
            const u = x.it.detail.usage30d || 0;
            return `<tr ${rowCtx(x)}><td class="nm">${esc(x.it.name)}</td><td>${scopeBadge(x.it)}</td>
                <td class="desc">${esc(x.it.description)}</td>
                <td>${u ? `<span class="use">${u}×</span>` : '<span class="muted">—</span>'}</td>
                <td class="act">${actionBtns(x)}</td></tr>`;
        });
    }

    function subagentTab() {
        return mdTable('subagent', ['Subagent', 'Scope', 'Description', 'Model / Tools', ''], x => {
            const d = x.it.detail;
            const facts = [d.model, d.tools].filter(Boolean).map(esc).join(' · ');
            return `<tr ${rowCtx(x)}><td class="nm">${esc(x.it.name)}</td><td>${scopeBadge(x.it)}</td>
                <td class="desc">${esc(x.it.description)}</td><td class="small">${facts || '<span class="muted">inherits</span>'}</td>
                <td class="act">${actionBtns(x)}</td></tr>`;
        });
    }

    function commandTab() {
        return mdTable('command', ['Command', 'Scope', 'Description', 'Args', ''], x => {
            return `<tr ${rowCtx(x)}><td class="nm">${esc(x.it.name)}</td><td>${scopeBadge(x.it)}</td>
                <td class="desc">${esc(x.it.description)}</td>
                <td class="small">${esc(x.it.detail.argumentHint || '')}</td>
                <td class="act">${actionBtns(x)}</td></tr>`;
        });
    }

    function probeKeyOf(it) {
        return it.scope + ':' + (it.agentId || '') + ':' + it.name;
    }

    function mcpTab() {
        return mdTable('mcp', ['Server', 'Scope', 'Transport', 'Command / URL', 'Tools', ''], x => {
            const it = x.it;
            const key = probeKeyOf(it);
            const probe = DATA.probeCache[key];
            const open = state.expanded[key];
            const disabled = it.detail.disabled === true;
            const toolsCell = probe && probe.ok
                ? `<button class="mini" data-exp="${esc(key)}" title="probed ${relTime(probe.probedAt)} — click for the list">${probe.tools.length} tools ${open ? '▴' : '▾'}</button>`
                : probe && !probe.ok
                    ? `<button class="mini warn" data-exp="${esc(key)}" title="${esc(probe.error || '')}">failed ${open ? '▴' : '▾'}</button>`
                    : `<span class="muted small">not probed</span>`;
            const toggle = it.scope === 'agent'
                ? `<button class="mini" data-act="togglemcp" data-i="${x.i}" title="${disabled ? 'enable for this agent' : 'disable for this agent (disabledMcpjsonServers)'}">${disabled ? 'enable' : 'disable'}</button>`
                : '';
            const probeBtn = `<button class="mini" data-act="probe" data-i="${x.i}" title="connect to the server and ask for its tool list">${probe ? 're-probe' : 'probe'}</button>`;
            let row = `<tr${disabled ? ' class="offrow"' : ''} ${rowCtx(x)}><td class="nm">${esc(it.name)}${disabled ? ' <span class="tag off">disabled</span>' : ''}</td>
                <td>${scopeBadge(it)}</td><td class="small">${esc(it.detail.transport || '')}</td>
                <td class="desc small"><code>${esc(it.description)}</code></td>
                <td>${toolsCell}</td>
                <td class="act">${probeBtn}${toggle}${actionBtns(x)}</td></tr>`;
            if (open) {
                const def = it.detail.def ? `<div class="small"><b>Definition</b> (secrets masked): <code>${esc(JSON.stringify(it.detail.def))}</code></div>` : '';
                const body = probe && probe.ok
                    ? `<div class="small muted">${esc(probe.serverName || it.name)} ${esc(probe.serverVersion || '')} · protocol ${esc(probe.protocolVersion || '?')} · probed ${relTime(probe.probedAt)} in ${probe.ms || '?'}ms</div>
                       <table class="tb inner">${probe.tools.map(t =>
                        `<tr><td class="nm">${esc(t.name)}</td><td class="small">${esc((t.params || []).join(', '))}</td><td class="desc small">${esc(t.description)}</td></tr>`).join('')}</table>`
                    : probe
                        ? `<div class="small warn-t">Probe failed: ${esc(probe.error || 'unknown error')}</div>`
                        : '<div class="small muted">Not probed yet.</div>';
                row += `<tr class="exprow"><td colspan="6">${def}${body}</td></tr>`;
            }
            return row;
        });
    }

    function hookTab() {
        return mdTable('hook', ['Event', 'Matcher', 'Command', 'Scope', ''], x => {
            const d = x.it.detail;
            return `<tr ${rowCtx(x)}><td class="nm">${esc(d.event)}</td><td class="small">${esc(d.matcher || '*')}</td>
                <td class="desc small"><code title="${esc(d.command)}">${esc(String(d.command || '').slice(0, 90))}${String(d.command || '').length > 90 ? '…' : ''}</code></td>
                <td>${scopeBadge(x.it)}</td><td class="act">${actionBtns(x)}</td></tr>`;
        });
    }

    function pluginTab() {
        const marketplaces = items('plugin').filter(x => x.it.detail.isMarketplace);
        const plugins = items('plugin').filter(x => !x.it.detail.isMarketplace);
        const mkts = marketplaces.map(x => `<span class="badge" title="last updated ${esc(x.it.detail.lastUpdated || '?')}">
            ${esc(x.it.name)} · ${esc(x.it.detail.pluginCount)} plugins
            <button class="mini" data-act="open" data-i="${x.i}">manifest</button>
            <button class="mini" data-act="reveal" data-i="${x.i}">folder</button></span>`).join(' ');
        const enabledCount = plugins.filter(x => x.it.detail.enabled).length;
        const rows = plugins.map(x => {
            const d = x.it.detail;
            const key = d.plugin + '@' + d.marketplace;
            return `<tr${d.enabled ? '' : ' class="offrow"'} ${rowCtx(x)}><td class="nm">${esc(d.plugin)}
                ${d.enabled ? '<span class="tag on">enabled</span>' : ''}</td>
                <td class="small">${esc(d.category || '')}</td>
                <td class="desc small">${esc(x.it.description)}</td>
                <td class="small">${esc(d.author || '')}</td>
                <td class="act">
                    <button class="mini ${d.enabled ? 'danger' : 'add'}" data-act="plugin" data-key="${esc(key)}" data-on="${d.enabled ? '' : '1'}">${d.enabled ? 'disable' : 'enable'}</button>
                    ${d.homepage ? `<button class="mini" data-act="home" data-url="${esc(d.homepage)}">homepage</button>` : ''}
                </td></tr>`;
        }).join('');
        return searchBox(`filter ${plugins.length} plugins…`) +
            `<p class="muted small">Marketplaces: ${mkts || 'none'} — ${enabledCount} plugin(s) enabled.
             Enabling writes <code>enabledPlugins</code> in user settings.json; claude installs/loads it on the next session start.</p>` +
            (plugins.length
                ? `<div class="card tablewrap"><table class="tb"><tr><th>Plugin</th><th>Category</th><th>Description</th><th>Author</th><th></th></tr>${rows}</table></div>`
                : `<p class="muted">No marketplace catalog found. ${EXPLAIN.plugin}</p>`);
    }

    function styleTab() {
        return mdTable('style', ['Style', 'Scope', 'Description', ''], x =>
            `<tr ${rowCtx(x)}><td class="nm">${esc(x.it.name)}</td><td>${scopeBadge(x.it)}</td>
             <td class="desc">${esc(x.it.description)}</td><td class="act">${actionBtns(x)}</td></tr>`);
    }

    function settingsTab() {
        return mdTable('settings', ['File', 'Scope', 'Contents', ''], x => {
            const d = x.it.detail;
            const info = d.keys ? `keys: ${esc(d.keys.join(', ')).slice(0, 160)}`
                : d.tokens ? `~${esc(d.tokens)} tokens` : '';
            return `<tr ${rowCtx(x)}><td class="nm">${esc(x.it.name)}</td><td>${scopeBadge(x.it)}</td>
                <td class="desc small">${info} <span class="muted">(${Math.round((d.sizeBytes || 0) / 102.4) / 10} KB)</span></td>
                <td class="act"><button class="mini" data-act="open" data-i="${x.i}">open</button>
                <button class="mini" data-act="reveal" data-i="${x.i}">folder</button></td></tr>`;
        }) + `<p class="muted small">Curated, explained editing of the most useful <code>~/.claude/settings.json</code> keys lives in
            <button class="mini" data-afnav="settings">⚙ Farm Settings</button> → Claude Code section.</p>`;
    }

    // ---------------------------------------------------------------- render

    function render() {
        const c = DATA.counts;
        const total = Object.keys(c).reduce((a, k) => a + c[k].user + c[k].agent, 0);
        const tabBar = TABS.map(t => {
            const n = t.id === 'overview' ? '' :
                ` <span class="cnt">${(c[t.id] || { user: 0, agent: 0 }).user + (c[t.id] || { user: 0, agent: 0 }).agent}</span>`;
            return `<button class="seg${state.tab === t.id ? ' active' : ''}" data-tab="${t.id}">${t.label}${n}</button>`;
        }).join('');

        const body =
            state.tab === 'overview' ? overviewTab() :
            state.tab === 'skill' ? skillTab() :
            state.tab === 'subagent' ? subagentTab() :
            state.tab === 'command' ? commandTab() :
            state.tab === 'mcp' ? mcpTab() :
            state.tab === 'hook' ? hookTab() :
            state.tab === 'plugin' ? pluginTab() :
            state.tab === 'style' ? styleTab() : settingsTab();

        document.getElementById('app').innerHTML = `
            <style>
                .tb { border-collapse: collapse; width: 100%; }
                .tb th { text-align: left; font-size: 11px; opacity: .7; padding: 4px 8px; }
                .tb td { padding: 4px 8px; vertical-align: top; }
                .tb tr:hover td { background: var(--vscode-list-hoverBackground, rgba(128,128,128,.08)); }
                .tb td.nm { font-weight: 600; white-space: nowrap; }
                .tb td.desc { max-width: 480px; }
                .tb td.act { white-space: nowrap; text-align: right; }
                .tb.inner td { border-top: 1px solid var(--vscode-widget-border, #4443); }
                .tb .offrow td { opacity: .55; }
                .tb .exprow td { background: var(--vscode-editorWidget-background, rgba(128,128,128,.06)); }
                .mini { background: none; border: 1px solid var(--vscode-widget-border, #666); border-radius: 4px;
                        color: inherit; cursor: pointer; font-size: 11px; padding: 1px 7px; margin-left: 4px; }
                .mini:hover { border-color: var(--vscode-charts-blue, #3794ff); color: var(--vscode-charts-blue, #3794ff); }
                .mini.danger:hover { border-color: var(--vscode-charts-red, #f14c4c); color: var(--vscode-charts-red, #f14c4c); }
                .mini.add { border-color: var(--vscode-charts-green, #4caf50); }
                .mini.warn { color: var(--vscode-charts-orange, #d18616); }
                .warn-t { color: var(--vscode-charts-orange, #d18616); }
                .tag { font-size: 10px; border: 1px solid currentColor; border-radius: 8px; padding: 0 6px; opacity: .75; }
                .tag.agent { color: var(--vscode-charts-blue, #3794ff); }
                .tag.on { color: var(--vscode-charts-green, #4caf50); }
                .tag.off { color: var(--vscode-charts-orange, #d18616); }
                .use { color: var(--vscode-charts-green, #4caf50); font-weight: 700; }
                .seg .cnt { opacity: .6; font-size: 10px; }
                .tb-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 10px; }
                .tb-card { cursor: pointer; }
                .tb-card:hover { outline: 1px solid var(--vscode-charts-blue, #3794ff); }
                .tb-num { font-size: 26px; font-weight: 700; }
                .tb-cat { font-weight: 600; margin: 2px 0; }
                .tb-exp { margin-top: 6px; line-height: 1.35; }
                .newrow select { max-width: 180px; }
                .searchbar input { width: 280px; }            </style>
            ${window.AFHeader.html({
                page: 'toolbox',
                title: 'Toolbox',
                sub: `${total} installed extensions across user + agent scope · inventory, details and management for everything that extends claude`,
                related: [{ nav: 'airtable', label: '🗄️ Airtable Engine' }, { nav: 'capabilities', label: 'Capability Matrix' }, { nav: 'secrets', label: '🔑 Secrets' }],
                guide: 'toolbox'
            })}
            <div class="btnrow" style="margin-bottom:10px">${tabBar}</div>
            ${body}`;

        wire();
    }

    function wire() {
        window.AFHeader.wire(vscode);
        document.querySelectorAll('[data-tab]').forEach(b =>
            b.addEventListener('click', () => { state.tab = b.dataset.tab; state.q = ''; render(); }));
        document.querySelectorAll('[data-afnav]').forEach(b =>
            b.addEventListener('click', () => post({ type: 'afnav', to: b.dataset.afnav })));
        const q = document.getElementById('tb-q');
        if (q) {
            q.addEventListener('input', () => {
                state.q = q.value;
                const pos = q.selectionStart;
                render();
                const nq = document.getElementById('tb-q');
                if (nq) { nq.focus(); nq.setSelectionRange(pos, pos); }
            });
        }
        document.querySelectorAll('[data-exp]').forEach(b =>
            b.addEventListener('click', () => {
                state.expanded[b.dataset.exp] = !state.expanded[b.dataset.exp];
                render();
            }));
        document.querySelectorAll('[data-new]').forEach(b =>
            b.addEventListener('click', () => {
                const sel = document.getElementById('tb-newscope');
                const agentId = sel && sel.value ? sel.value : '';
                post({ type: 'create', kind: b.dataset.new, scope: agentId ? 'agent' : 'user', agentId });
            }));
        document.querySelectorAll('[data-act]').forEach(b =>
            b.addEventListener('click', () => {
                const act = b.dataset.act;
                if (act === 'plugin') { post({ type: 'togglePlugin', key: b.dataset.key, on: !!b.dataset.on }); return; }
                if (act === 'home') { post({ type: 'openExternal', url: b.dataset.url }); return; }
                const it = DATA.items[Number(b.dataset.i)];
                if (!it) { return; }
                if (act === 'open') { post({ type: 'open', path: it.source }); }
                else if (act === 'reveal') { post({ type: 'reveal', path: it.dir || it.source }); }
                else if (act === 'remove') { post({ type: 'remove', item: it }); }
                else if (act === 'probe') { post({ type: 'probe', scope: it.scope, agentId: it.agentId || '', server: it.name }); }
                else if (act === 'togglemcp') { post({ type: 'toggleMcp', agentId: it.agentId || '', server: it.name, disabled: it.detail.disabled !== true }); }
            }));
        // module tiles navigate to their own page (same handler the nav uses)
        document.querySelectorAll('[data-modnav]').forEach(b =>
            b.addEventListener('click', () => post({ type: 'afnav', to: b.dataset.modnav })));
    }

    // ------------------------------------------------------- right-click menu

    /**
     * Everything a right-click on an inventory row can ask for. The first three
     * branches post exactly what the row's three buttons post; the rest are the
     * acts that existed only as sidebar-tree commands, so the page you use to
     * SEE the inventory could not change it.
     */
    function ctxDo(act, ctx) {
        const verb = act.split(':')[0];
        const arg = act.slice(verb.length + 1);
        const it = DATA.items[Number(ctx.toolIndex)];
        if (!it) { return; }

        switch (verb) {
            case 'tbOpen': post({ type: 'open', path: it.source }); return;
            case 'tbReveal': post({ type: 'reveal', path: it.dir || it.source }); return;
            case 'tbRemove': post({ type: 'remove', item: it }); return;
            case 'tbProbe': post({ type: 'probe', scope: it.scope, agentId: it.agentId || '', server: it.name }); return;
            case 'tbMcp':
                post({ type: 'toggleMcp', agentId: it.agentId || '', server: it.name, disabled: arg === 'off' });
                return;
            case 'tbMcpEdit': post({ type: 'editMcp', agentId: it.agentId || '', server: it.name }); return;
            case 'tbPlug':
                post({
                    type: 'togglePlugin',
                    key: it.detail.plugin + '@' + it.detail.marketplace,
                    on: arg === '1'
                });
                return;
            case 'tbHome':
                if (it.detail.homepage) { post({ type: 'openExternal', url: it.detail.homepage }); }
                return;
            case 'tbCopyAgent':
                post({ type: 'copyToAgent', kind: it.kind, agentId: it.agentId || '', name: it.name });
                return;
            case 'tbScope': post({ type: 'skillScope', agentId: it.agentId || '', name: it.name }); return;
            // The tool list is already on the row behind a caret; the menu opens
            // the same fold rather than drawing a second view of it.
            case 'tbTools': {
                const key = probeKeyOf(it);
                state.tab = 'mcp';
                state.expanded[key] = true;
                render();
                return;
            }
            case 'tbCopy':
                window.AFCtx.copy(arg === 'path' ? (it.source || it.dir)
                    : arg === 'invoke' ? '/' + it.name : it.name);
                return;
        }
    }

    // ‼️ ONCE, at module scope — wire() runs again on every keystroke in the
    // filter box, and a listener added there would multiply with it.
    window.AFCtx.listen(ctxDo);

    render();
})();
