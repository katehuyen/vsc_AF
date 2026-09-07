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
        { id: 'settings', label: 'Files' },
        // ‼️ U-84 — NOT AN INVENTORY TAB, AND THE CODE BELOW HAS TO KNOW IT.
        // Every other tab counts things found on disk; this one manages RUNNING
        // SERVICES, so it has no count for the tab bar and no count card on the
        // overview. Both places are guarded by name rather than by a `counts`
        // lookup that would quietly draw "0".
        { id: 'service', label: 'Services' }
    ];

    /** The tabs that are an inventory of files. `service` is deliberately not
     *  one of them — see the note on TABS. */
    const COUNTED = TABS.filter(t => t.id !== 'overview' && t.id !== 'service');

    const EXPLAIN = {
        skill: 'Multi-step procedures claude loads on demand — invoked as /name or picked automatically when the task matches the description.',
        subagent: 'Named specialist agents (.claude/agents/*.md) that claude can delegate to via the Agent tool.',
        command: 'Typed /slash-commands (.claude/commands/**/*.md) — reusable prompts, ":" namespaced by folder.',
        mcp: 'External tool servers claude connects to. Probe one to see the actual tools it exposes.',
        hook: 'Shell commands claude runs on lifecycle events (settings.json "hooks") — the automation glue.',
        plugin: 'Marketplace bundles of commands/agents/MCP/hooks. Enabled per user via settings.json enabledPlugins.',
        style: 'Output styles (.claude/output-styles/*.md) — switch how claude formats its answers.',
        settings: 'The config files themselves at both scopes — what exists, what keys it sets, one click to open.',
        service: 'Running services rather than files on disk — the Telegram bridge that lets a chat talk to your agents, with its sign-in, its allowlist and its daily spending ceiling.'
    };

    /**
     * ‼️ A FILTER MUST BE ABLE TO ASK THIS PAGE'S OWN QUESTIONS.
     *
     * There are several hundred rows here and the only way to narrow them was a
     * text box. That answers "does this word appear", which is the wrong
     * question nearly every time you have this many rows: "the Anthropic ones
     * that are actually enabled" is two axes, and typing `anthropic` gets you
     * every plugin that merely mentions them. Each tab is a different TABLE with
     * different columns, so a single shared filter bar could never be right —
     * what is needed is per-tab facets, drawn from the columns that tab already
     * shows.
     *
     * A facet is: an id, a label, and the one value a row has for it. The
     * options are then read off the DATA rather than declared, so a new
     * marketplace, a new transport or a new hook event appears in the picker on
     * its own — a hard-coded vocabulary here would go stale silently, which is
     * the failure this page already had.
     *
     * Selection semantics are AFFilter's, extension-wide: null = all (and a
     * value that appears later is included without touching the picker), [] =
     * none, a list = exactly that subset.
     */
    const SCOPE_FACET = {
        id: 'scope', label: 'Scope',
        of: x => (x.it.scope === 'user' ? 'user' : (x.it.agentName || 'agent')),
        title: 'USER scope is shared by every agent on this machine; an agent-scope entry belongs to that agent alone and shadows a user one of the same name.',
        /**
         * ‼️ U-52 — THE ONE SUBSET THIS AXIS HAS A WORD FOR, and it is on seven
         * tabs. The list is "user" plus one entry per agent, so "show me what
         * belongs to agents, not the shared user-scope entries everybody gets"
         * — the reading this picker is opened with — cost a Clear plus a tick
         * per agent. `user` alone is a single option, which a click on its own
         * name already gives you.
         */
        presets: opts => {
            const mine = (opts || []).filter(o => o !== 'user');
            return mine.length > 1 ? [{
                id: 'agents', label: 'Agents', values: mine,
                title: 'Everything that belongs to an agent — not the user-scope entries every agent shares.'
            }] : [];
        }
    };
    const usedOf = x => ((x.it.detail.usage30d || 0) > 0 ? 'used' : 'never used');
    const FACETS = {
        skill: [SCOPE_FACET,
            { id: 'used', label: 'Use', of: usedOf, title: 'Real invocations found in the last 30 days of transcripts.' }],
        subagent: [SCOPE_FACET,
            { id: 'model', label: 'Model', of: x => x.it.detail.model || 'inherits' }],
        command: [SCOPE_FACET,
            {
                id: 'ns', label: 'Namespace',
                of: x => (String(x.it.name).indexOf(':') >= 0 ? String(x.it.name).split(':')[0] : '(top level)'),
                title: 'Commands are ":" namespaced by the folder they sit in.'
            }],
        mcp: [SCOPE_FACET,
            { id: 'transport', label: 'Transport', of: x => x.it.detail.transport || '(unstated)' },
            { id: 'state', label: 'State', of: x => (x.it.detail.disabled === true ? 'disabled' : 'enabled') },
            {
                id: 'probe', label: 'Probe',
                of: x => {
                    const p = DATA.probeCache[probeKeyOf(x.it)];
                    return !p ? 'not probed' : (p.ok ? 'answered' : 'failed');
                },
                title: 'Whether this server has been connected to and asked for its tool list.'
            }],
        hook: [SCOPE_FACET,
            { id: 'event', label: 'Event', of: x => x.it.detail.event || '(none)' }],
        plugin: [
            { id: 'state', label: 'State', of: x => (x.it.detail.enabled ? 'enabled' : 'disabled') },
            { id: 'author', label: 'Author', of: x => x.it.detail.author || '(unknown)' },
            { id: 'mkt', label: 'Marketplace', of: x => x.it.detail.marketplace || '(unknown)' },
            { id: 'category', label: 'Category', of: x => x.it.detail.category || '(none)' }],
        style: [SCOPE_FACET],
        settings: [SCOPE_FACET]
    };

    /** How each tab can be ordered. `name` is everywhere; the rest are the one
     *  or two axes that tab is actually read by. */
    const SORTS = {
        skill: [{ v: 'name', t: 'name' }, { v: 'used', t: 'most used' }, { v: 'scope', t: 'scope' }],
        subagent: [{ v: 'name', t: 'name' }, { v: 'scope', t: 'scope' }],
        command: [{ v: 'name', t: 'name' }, { v: 'scope', t: 'scope' }],
        mcp: [{ v: 'name', t: 'name' }, { v: 'used', t: 'most used' }, { v: 'scope', t: 'scope' }],
        hook: [{ v: 'name', t: 'event' }, { v: 'scope', t: 'scope' }],
        plugin: [{ v: 'name', t: 'name' }, { v: 'state', t: 'enabled first' }, { v: 'author', t: 'author' }],
        style: [{ v: 'name', t: 'name' }, { v: 'scope', t: 'scope' }],
        settings: [{ v: 'name', t: 'name' }, { v: 'size', t: 'largest' }, { v: 'scope', t: 'scope' }]
    };

    /** Per TAB, so stepping into MCP to check something does not throw away the
     *  plugin filter you spent four clicks building. */
    // ‼️ `DATA.tab` OPENS THE PAGE SOMEWHERE OTHER THAN THE OVERVIEW. Two
    // callers need it: the render harness, which cannot photograph a tab it has
    // no way to reach (and a visual change that cannot be looked at is one that
    // ships blind), and a surface that wants to land a person on Services.
    // Absent means the overview, which is what every existing caller means.
    const state = {
        tab: (DATA && typeof DATA.tab === 'string' && DATA.tab) || 'overview',
        q: '', expanded: {}, facets: {}, sort: {}
    };

    const facetsFor = (kind) => FACETS[kind] || [];
    /** null = all. Kept per tab AND per facet. */
    function facetSel(kind, id) {
        const t = state.facets[kind] || (state.facets[kind] = {});
        return t[id] === undefined ? null : t[id];
    }
    function setFacet(kind, id, sel) {
        const t = state.facets[kind] || (state.facets[kind] = {});
        if (sel === null) { delete t[id]; } else { t[id] = sel; }
    }
    const sortOf = (kind) => state.sort[kind] || 'name';
    /** Is anything narrowing this tab right now? */
    function anyActive(kind) {
        const t = state.facets[kind] || {};
        return !!state.q || Object.keys(t).length > 0;
    }

    // ‼️ M-33 — A HOST PUSH WAITS FOR THE READER'S HANDS; THE PAGE'S OWN
    // RENDERS DO NOT. render() replaces the whole of #app, so a repaint that
    // arrives while somebody is typing detaches the box they are typing in and
    // the caret falls to <body> — where space IS Page Down. Full text, and
    // what a page-specific busy() is for: media/afRepaint.js.
    const repaint = window.AFRepaint.guard(render);
    window.addEventListener('message', ev => {
        const m = ev.data;
        if (m.type === 'data') { DATA = m.data; repaint(); return; }
        // ---- the form's three messages (U-14)
        if (m.type === 'tool-compose') { openToolForm(m.seed || {}); return; }
        if (m.type === 'tool-msg') {
            toolMsg = String(m.text || '');
            toolMsgOk = m.ok === true;
            // A receipt means the write happened; a refusal keeps the card open
            // with everything that was typed still in it.
            if (toolMsgOk) { toolForm = null; }
            render();
            return;
        }
        // U-84 — the live getMe answer. Shown IN THE CARD rather than as a
        // notification: the question was asked here and the answer belongs
        // beside the badge it is about.
        if (m.type === 'svc-verified') {
            svcMsg = window.AFTelegram.verifiedMessage(m);
            render();
            return;
        }
        // U-86 — what the host did about the hooks, said IN THE CARD. A write
        // that reports itself in a notification is a write the reader has to
        // remember while looking at a card that has not changed yet.
        if (m.type === 'hooks-said') {
            hooksMsg = { ok: m.ok, text: m.text };
            render();
            return;
        }
        if (m.type === 'mcp-def' && toolForm && toolForm.name === m.name) {
            Object.assign(toolForm, m.def || {});
            render();
            return;
        }
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

    /** Every row of this kind, before any narrowing — what the facet pickers
     *  read their options off, so an option never disappears because you
     *  already used it. */
    function allOf(kind) {
        return DATA.items.map((it, i) => ({ it, i })).filter(x => x.it.kind === kind);
    }

    /** The facet options a tab has RIGHT NOW, in a stable order. */
    function facetOptions(kind, f) {
        const seen = [];
        for (const x of allOf(kind)) {
            const v = String(f.of(x));
            if (seen.indexOf(v) < 0) { seen.push(v); }
        }
        return seen.sort((a, b) => a.localeCompare(b));
    }

    const SORT_KEY = {
        name: x => String(x.it.detail.event || x.it.detail.plugin || x.it.name).toLowerCase(),
        used: x => -(x.it.detail.usage30d || 0),
        scope: x => (x.it.scope === 'user' ? '0' : '1' + (x.it.agentName || '')),
        state: x => (x.it.detail.enabled || x.it.detail.disabled === false ? '0' : '1'),
        author: x => String(x.it.detail.author || '~').toLowerCase(),
        size: x => -(x.it.detail.sizeBytes || 0)
    };

    function items(kind) {
        // the box is a QUERY, not a substring — media/afQuery.js
        const q = window.AFQuery.compile(state.q);
        const facets = facetsFor(kind);
        const rows = allOf(kind)
            .filter(x => q.test(x.it.name + ' ' + x.it.description + ' ' + (x.it.agentName || '') + ' ' +
                JSON.stringify(x.it.detail || {})))
            // Every facet must pass — the axes are ANDed, which is the whole
            // point of having more than one ("Anthropic AND enabled").
            .filter(x => facets.every(f => {
                const sel = facetSel(kind, f.id);
                return sel === null || sel.indexOf(String(f.of(x))) >= 0;
            }));
        const key = SORT_KEY[sortOf(kind)] || SORT_KEY.name;
        // A stable tiebreak on the name, so two rows with the same usage do not
        // swap places between renders.
        return rows.sort((a, b) => {
            const ka = key(a), kb = key(b);
            if (ka < kb) { return -1; }
            if (ka > kb) { return 1; }
            return SORT_KEY.name(a) < SORT_KEY.name(b) ? -1 : 1;
        });
    }

    /** The filter row a tab wears: its facets, its sort, and the way out. */
    function filterBar(kind, shown, total) {
        const pickers = facetsFor(kind).map(f => {
            const options = facetOptions(kind, f);
            return window.AFFilter.multi({
                id: 'tbf-' + kind + '-' + f.id,
                label: f.label,
                options,
                selected: facetSel(kind, f.id),
                title: f.title || '',
                // U-52 — a facet's named subsets are computed from the values
                // this tab actually has, because the list is data: "Agents"
                // means nothing until there is more than one of them.
                presets: typeof f.presets === 'function' ? f.presets(options) : []
            });
        }).join(' ');
        const sorts = (SORTS[kind] || []).map(s =>
            C.option(s.v, s.t, { selected: sortOf(kind) === s.v, detail: s.full || '' })).join('');
        const clear = anyActive(kind)
            ? `<button class="mini" data-tbclear="${esc(kind)}"
                 title="Drop the text and every facet on this tab — the other tabs keep theirs">✕ clear</button>`
            : '';
        return `<div class="tb-filters">${pickers}
            ${sorts ? `<span class="muted small">sort</span><select id="tb-sort">${sorts}</select>` : ''}
            ${clear}
            <span class="grow"></span>
            <span class="muted small">${shown === total ? `${total}` : `${shown} of ${total}`} shown</span>
        </div>`;
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
        return `<div class="searchbar"><input id="tb-q" type="text" placeholder="${esc(placeholder)}" value="${esc(state.q)}"
            title="${esc(window.AFQuery.tip('Searched against the name, the description, the agent and the whole definition.'))}"></div>`;
    }

    function newButtons(kind) {
        if (kind !== 'skill' && kind !== 'subagent' && kind !== 'command' && kind !== 'mcp') { return ''; }
        return `<span class="newrow"><button class="mini add" data-new="${kind}"${toolForm ? ' disabled' : ''}
            title="Make one here — name, description and, for a server, the command, its arguments and the environment it needs">+ new ${kind === 'mcp' ? 'MCP server' : kind}</button></span>`;
    }

    // ------------------------------------------------------------- THE FORM
    /**
     * ‼️ THE PAGE THAT LISTS EVERY TOOL CAN NOW MAKE ONE — U-14, surface 2.
     *
     * Measured before this change: `+ new skill` posted to the host, which
     * asked two input boxes; `addMcpServer` asked four in the palette;
     * `editMcpServer` flattened a server to one line of text and silently kept
     * or dropped whatever else its definition held; `copyMcpServer` and
     * `duplicateSkill` were a quickpick of agent names each. Four routes, four
     * vocabularies — and none of them could state an MCP server's `args`, its
     * `env` or its `headers`, which is exactly what decides whether the server
     * they just wrote can authenticate.
     *
     * One card. Four kinds, three modes, and the fields each combination
     * actually has.
     */
    let toolForm = null;
    let toolMsg = '';
    let toolMsgOk = false;
    /** U-84 — the last verify answer, kept until the next one replaces it. */
    let svcMsg = null;
    // U-86 — what the host last did about the hooks. Page state, not DATA: it
    // is an answer to a button this reader pressed.
    let hooksMsg = null;

    const KIND_LABEL = { skill: 'skill', subagent: 'subagent', command: 'command', mcp: 'MCP server' };
    const KIND_LEDE = {
        skill: 'A skill is a procedure claude loads on demand. The description is not decoration — it is what claude reads to decide whether this is the moment to load it.',
        subagent: 'A subagent is a named specialist claude can delegate to with the Agent tool. It gets its own file under .claude/agents.',
        command: 'A command is a /slash prompt. A ":" in the name nests it into folders exactly the way claude reads them — git:cleanup lives in commands/git/cleanup.md.',
        mcp: 'An MCP server is an external tool process claude connects to. It belongs to one agent (.mcp.json in the agent folder), and it starts with whatever command, arguments and environment you give it here.'
    };

    function newToolDraft(seed) {
        const s = seed || {};
        return {
            kind: s.kind || 'skill',
            mode: s.mode === 'edit' || s.mode === 'copy' ? s.mode : 'new',
            agentId: s.agentId || '',
            target: '',
            name: s.name || '',
            description: s.description || '',
            transport: s.transport === 'http' ? 'http' : 'stdio',
            command: s.command || '',
            args: s.args || '',
            env: s.env || '',
            url: s.url || '',
            headers: s.headers || ''
        };
    }

    function openToolForm(seed) {
        toolForm = newToolDraft(seed);
        toolMsg = '';
        toolMsgOk = false;
        // ‼️ An MCP server's real definition is not on the inventory row — the
        // row carries a summary. The card opens NOW and fills itself when the
        // host answers, rather than a click that appears to do nothing while a
        // file is read.
        if (toolForm.kind === 'mcp' && toolForm.mode === 'edit'
            && !toolForm.command && !toolForm.url) {
            post({ type: 'mcp-def', agentId: toolForm.agentId, name: toolForm.name });
        }
        // The card belongs to the tab whose object it makes; landing on the
        // Overview with an MCP form open would be a form with no list behind it.
        if (toolForm.kind && state.tab !== toolForm.kind) { state.tab = toolForm.kind; }
        render();
        const box = document.getElementById('toolform');
        if (box) { box.scrollIntoView(); }
    }

    function toolFormHtml() {
        const F = window.AFForm;
        const d = toolForm;
        const mcp = d.kind === 'mcp';
        const copying = d.mode === 'copy';
        const editing = d.mode === 'edit';
        const agentOpts = (DATA.agents || []).map(a => ({ id: a.id, name: a.name }));
        const scopeOpts = [{ id: '', label: 'User — every agent on this machine sees it' }]
            .concat(agentOpts.map(a => ({ id: a.id, label: a.name + ' — this agent only' })));
        const body = copying
            ? F.grid([
                F.stat('Copying', KIND_LABEL[d.kind] + ' “' + d.name + '”'),
                F.sel('target', 'To', [{ id: '', label: '— pick an agent —' }]
                    .concat(agentOpts.filter(a => a.id !== d.agentId).map(a => ({ id: a.id, label: a.name }))),
                    d.target, { tip: 'Which agent gets its own copy. It is a copy, not a link: editing one afterwards leaves the other alone.' })
            ])
            : F.grid([
                editing
                    ? F.stat('Editing', KIND_LABEL[d.kind] + ' “' + d.name + '”')
                    : F.text('name', 'Name', d.name, {
                        required: true, wide: !mcp,
                        ph: d.kind === 'command' ? 'e.g. git:cleanup' : d.kind === 'mcp' ? 'e.g. obsidian' : 'e.g. release-notes',
                        tip: d.kind === 'command'
                            ? 'What you type after the slash. A ":" nests it into a folder, the way claude reads commands.'
                            : 'The folder or key it is stored under — and what claude loads it by.'
                    }),
                !editing && mcp ? F.sel('agentId', 'On agent', [{ id: '', label: '— pick an agent —' }]
                    .concat(agentOpts.map(a => ({ id: a.id, label: a.name }))), d.agentId, {
                    required: true,
                    tip: 'An MCP server is written into that agent\'s own .mcp.json. There is no user-scope write from here — a shared server is a decision about every agent at once.'
                }) : '',
                !editing && !mcp ? F.sel('agentId', 'Scope', scopeOpts, d.agentId, {
                    tip: 'USER scope is shared by every agent on this machine; an agent-scope entry belongs to that agent alone and shadows a user one of the same name.'
                }) : '',
                !mcp ? F.text('description', 'Description', d.description, {
                    wide: true,
                    ph: d.kind === 'skill' ? 'When should claude reach for this?' : 'One line, shown in listings',
                    tip: d.kind === 'skill'
                        ? 'claude reads this to decide when to load the skill on its own. A vague line is a skill that never fires.'
                        : 'Shown wherever it is listed.'
                }) : ''
            ])
            + (mcp ? F.sec('How it is reached',
                'A stdio server is a process this machine starts; an http server is a URL it talks to.')
                + F.grid([
                    F.sel('transport', 'Transport', [
                        { id: 'stdio', label: 'stdio — a command this machine runs' },
                        { id: 'http', label: 'http / sse — a URL' }
                    ], d.transport, { redraw: true, tip: 'Which of the two shapes this entry takes.' }),
                    d.transport === 'http' ? F.text('url', 'URL', d.url, {
                        wide: true, required: true, ph: 'https://…',
                        tip: 'The endpoint claude connects to.'
                    }) : F.text('command', 'Command', d.command, {
                        wide: true, required: true, mono: true, ph: 'npx',
                        tip: 'The executable only. Its arguments go in the box below, one per line — which is how the file stores them, and why a single line of text could never round-trip an argument with a space in it.'
                    }),
                    d.transport === 'http' ? F.area('headers', 'Headers', d.headers, {
                        rows: 3, ph: 'Authorization=Bearer {secret:MY_TOKEN}',
                        tip: 'One KEY=value per line. {secret:NAME} is substituted from the vault at launch, so a token never has to sit in the file.'
                    }) : F.area('args', 'Arguments', d.args, {
                        rows: 3, ph: '-y\n@modelcontextprotocol/server-filesystem\nD:/zone',
                        tip: 'One argument per line. A path with a space in it is one line, not two — which is the whole reason this is not a single text box.'
                    }),
                    d.transport === 'http' ? '' : F.area('env', 'Environment', d.env, {
                        rows: 3, ph: 'API_KEY={secret:MY_KEY}',
                        tip: 'One KEY=value per line, handed to the process when it starts. {secret:NAME} is substituted from the vault.'
                    })
                ]) : '');
        return F.card({
            id: 'toolform',
            title: (copying ? 'Copy ' : editing ? 'Edit ' : 'New ') + KIND_LABEL[d.kind],
            lede: copying ? '' : KIND_LEDE[d.kind],
            body: body,
            msg: toolMsg,
            warn: !toolMsgOk,
            submit: copying ? 'Copy it' : editing ? 'Save changes' : 'Create it'
        });
    }

    function wireToolForm() {
        const F = window.AFForm;
        const box = document.getElementById('toolform');
        if (!box || !toolForm) { return; }
        F.wire(box, {
            onEdit: v => Object.assign(toolForm, v),
            onRedraw: () => render(),
            onSubmit: () => { toolMsg = ''; post({ type: 'tool-save', tool: toolForm }); },
            onCancel: () => { toolForm = null; toolMsg = ''; render(); }
        });
    }

    // ---------------------------------------------------------------- tabs

    function overviewTab() {
        const cards = COUNTED.map(t => {
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
            </div>`
            // ‼️ U-84 — THE SERVICES CARD SHOWS ITS STATE, NOT A COUNT. "How
            // many services are there" is a question nobody has; "is the bridge
            // to my phone alive" is the only one, so the number position carries
            // the badge instead. DENSITY: the answer costs no click.
            + `<div class="card tb-card" data-tab="service">
                <div class="tb-num">${svcOverviewIcon()}</div>
                <div class="tb-cat">Services</div>
                <div class="muted small">${esc(svcOverviewLine())}</div>
                <div class="muted small tb-exp">${esc(EXPLAIN.service)}</div>
            </div>`;
        return `<div class="card" style="margin-bottom:10px">
            <b>Two scopes, one picture.</b> <span class="muted">USER scope lives in <code>${esc(DATA.paths.userClaudeDir)}</code>
            (plus MCP servers in <code>${esc(DATA.paths.userConfigJson)}</code>) and applies to <b>every</b> agent and session on this machine.
            AGENT scope lives inside each agent folder's <code>.claude/</code> and applies to that agent only (agent entries shadow same-named user ones).
            Click a card to inspect and manage that kind.</span></div>
            <div class="grid tb-grid">${cards}</div>`;
    }

    function mdTable(kind, cols, rowFn) {
        const total = allOf(kind).length;
        const rows = items(kind);
        const head = searchBox(`filter ${total} entries…`) + filterBar(kind, rows.length, total);
        // The form belongs to the tab whose object it makes, directly under the
        // + that opened it — so what is being built stays next to the list of
        // what is already there.
        const form = toolForm && toolForm.kind === kind ? toolFormHtml()
            : (toolMsg && state.tab === kind ? window.AFForm.msg(toolMsg, !toolMsgOk) : '');
        if (!rows.length) {
            return head + `<p class="muted">${anyActive(kind)
                ? 'Nothing matches — narrow it less, or ✕ clear.'
                : 'None installed at either scope.'} ${EXPLAIN[kind]}</p>` +
                (newButtons(kind) ? `<p>${newButtons(kind)}</p>` : '') + form;
        }
        return head +
            (newButtons(kind) ? `<p>${newButtons(kind)}</p>` : '') + form +
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
        // Marketplaces are the CATALOGUES, not entries in the list — they are
        // named in the line above the table and must not be narrowed away by a
        // filter meant for the plugins inside them.
        const marketplaces = allOf('plugin').filter(x => x.it.detail.isMarketplace);
        const totalPlugins = allOf('plugin').filter(x => !x.it.detail.isMarketplace).length;
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
        return searchBox(`filter ${totalPlugins} plugins…`) +
            filterBar('plugin', plugins.length, totalPlugins) +
            `<p class="muted small">Marketplaces: ${mkts || 'none'} — ${enabledCount} of ${totalPlugins} plugin(s) enabled.
             Enabling writes <code>enabledPlugins</code> in user settings.json; claude installs/loads it on the next session start.</p>` +
            (plugins.length
                ? `<div class="card tablewrap"><table class="tb"><tr><th>Plugin</th><th>Category</th><th>Description</th><th>Author</th><th></th></tr>${rows}</table></div>`
                : `<p class="muted">${totalPlugins
                    ? 'Nothing matches — narrow it less, or ✕ clear.'
                    : 'No marketplace catalog found.'} ${EXPLAIN.plugin}</p>`);
    }

    function styleTab() {
        return mdTable('style', ['Style', 'Scope', 'Description', ''], x =>
            `<tr ${rowCtx(x)}><td class="nm">${esc(x.it.name)}</td><td>${scopeBadge(x.it)}</td>
             <td class="desc">${esc(x.it.description)}</td><td class="act">${actionBtns(x)}</td></tr>`);
    }

    // ------------------------------------------------------------- U-84
    /**
     * ‼️ THE SERVICES TAB DECIDES NOTHING AND DRAWS NOTHING OF ITS OWN.
     *
     * `DATA.services.telegram.status` and `.budget` arrive already worked out by
     * `core/telegramCockpit.ts`, which is measured against what
     * `applyChatBridge()` really does. A page that re-derived "is it running"
     * from `enabled && hasToken` would be a second copy of the launch rules,
     * living in a file nobody thinks of as launch logic and going out of date
     * the first time that function changes — in green.
     *
     * ‼️ AND THE CARD ITSELF IS `media/afTelegram.js`, because Farm Settings
     * draws the same one (U-84's other half). This tab asks for the version
     * WITH the controls: it has no settings rows of its own to own them.
     */
    const tg = () => (DATA.services || {}).telegram;

    function svcOverviewIcon() { return window.AFTelegram.dot(tg()); }
    function svcOverviewLine() { return window.AFTelegram.line(tg()); }

    // ------------------------------------------------------------- U-86
    /**
     * ‼️ THE LIVE HOOKS CARD ANSWERS THE ONE QUESTION THE FARM CANNOT ANSWER
     * FOR ITSELF: is anybody actually reporting?
     *
     * Without the hooks the extension is BLIND — no timeline, no live turn, no
     * permission-wait notice — and the commonest cause of "nothing shows up"
     * has never been a bug. It was on the bridge (`hooks.status`) and on no
     * surface at all, so the only person who could find out was an agent.
     *
     * ‼️ AND LIKE THE CARD ABOVE IT, THIS ONE DECIDES NOTHING. `status`, the
     * tone and the holder sentence all arrive from `core/hooksCockpit.ts`,
     * which is tested against the bytes `netstat` really printed on this
     * machine — including the ten TIME_WAIT rows that mention the port and
     * carry pid 0.
     */
    const hk = () => (DATA.services || {}).hooks;

    function hooksCard() {
        const h = hk();
        if (!h) { return ''; }
        const s = h.status;
        const badge = window.AFTip.wrap(
            `<span class="svc-badge t-${esc(s.tone)}">● ${esc(window.AFTelegram.words(s.state))}</span>`,
            'Live hooks — ' + window.AFTelegram.words(s.state),
            s.detail + (s.next ? '\n\n' + s.next : '')
            + '\n\nListener: ' + h.listener
            + '\nPort: ' + h.port
            + '\n\nThe hook command every file runs:\n' + h.command,
            'svc-tip');

        // DENSITY — one row per file, with the fact that decides everything
        // (user scope) first and named as such.
        const fileRow = t => `<div class="hkfile">
            <span class="hkmark ${t.installed ? 'ok' : 'no'}">${t.installed ? '✓' : '✗'}</span>
            <!-- X-265: an account row carries no agent name; labelled "acct:<slot>" so
                 the reader can tell a captured sign-in from an agent folder at a glance. -->
            <span class="hkscope">${t.scope === 'user' ? 'user'
        : t.scope === 'account' ? 'acct:' + esc(t.account || '?')
            : esc(t.agent || 'agent')}</span>
            <span class="hkpath" title="${esc(t.file)}">${esc(t.file)}</span>
        </div>`;

        // ‼️ THE HOLDER SENTENCE IS NOT REPEATED HERE. `hooksStatus` already
        // makes it the card's detail line when the port is taken — drawn again
        // as its own strip, the same sentence stood twice, two lines apart.
        // Seen in the PNG; no string test would have caught it.

        return `<div class="card svc-card">
            <div class="svc-head">
                <b>Live Hooks &amp; System Services</b> ${badge}
                <span class="muted small">port ${esc(h.port)}</span>
                <span class="svc-sp"></span>
                <button class="mini" data-hk="restart">restart listener</button>
                ${h.holder && h.holder.canStop
                ? '<button class="mini" data-hk="clear-port">free the port</button>' : ''}
            </div>
            <div class="muted small svc-detail">${esc(s.detail)}${s.next ? ' <b>' + esc(s.next) + '</b>' : ''}</div>
            ${hooksMsg ? `<div class="svc-msg ${hooksMsg.ok ? 'ok' : 'bad'}">${esc(hooksMsg.text)}</div>` : ''}
            <div class="svc-facts">
                <span class="svc-fact">User scope <b class="${s.userInstalled ? 'svc-y' : 'svc-n'}">${s.userInstalled ? 'installed' : 'NOT installed'}</b></span>
                <span class="svc-fact">Files <b class="${s.installed ? 'svc-y' : 'svc-n'}">${esc(s.installed)} of ${esc(s.total)}</b></span>
                <span class="svc-fact">Listener <b class="${h.listener === 'listening' ? 'svc-y' : 'svc-n'}">${esc(h.listener)}</b></span>
            </div>
            <div class="svc-row">
                <label class="svc-lbl">Hook files</label>
                <div class="svc-val col"><div class="hkfiles">${(h.targets || []).map(fileRow).join('')}</div></div>
            </div>
            <div class="svc-row">
                <label class="svc-lbl">Install</label>
                <div class="svc-val">
                    <button class="mini" data-hk="install" data-scope="user">user scope</button>
                    <button class="mini" data-hk="install" data-scope="agents">every agent</button>
                    <button class="mini" data-hk="install" data-scope="both">both</button>
                    <span class="muted small">user scope is one file and covers every session on this machine</span>
                </div>
            </div>
            <div class="svc-row">
                <label class="svc-lbl">Remove</label>
                <div class="svc-val">
                    <button class="mini" data-hk="remove" data-scope="both">take ours back out</button>
                    <span class="muted small">every hook that is not ours is left where it is</span>
                </div>
            </div>
        </div>`;
    }

    function serviceTab() {
        return window.AFTelegram.card(tg(), {
            controls: true, agents: DATA.agents || [], msg: svcMsg
        }) + hooksCard();
    }

    function wireServices() {
        window.AFTelegram.wire(post);
        // ‼️ THE FOUR TYPES ARE WRITTEN OUT, not built from a data attribute.
        // A message type assembled at runtime is a door the parity gate and the
        // page-message gate cannot see — and an unanswered message is silence,
        // which is exactly what this card exists to cure.
        document.querySelectorAll('[data-hk]').forEach(b => b.addEventListener('click', () => {
            const scope = b.dataset.scope;
            const act = b.dataset.hk;
            if (act === 'install') { post({ type: 'hooks-install', scope: scope }); }
            else if (act === 'remove') { post({ type: 'hooks-remove', scope: scope }); }
            else if (act === 'restart') { post({ type: 'hooks-restart' }); }
            else if (act === 'clear-port') { post({ type: 'hooks-clear-port' }); }
        }));
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
            // ‼️ The services tab counts nothing — see the note on TABS.
            const n = (t.id === 'overview' || t.id === 'service') ? '' :
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
            state.tab === 'style' ? styleTab() :
            state.tab === 'service' ? serviceTab() : settingsTab();

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
                ${window.AFTelegram.css()}
                /* U-86 — the hook files, one row each. The mark, whose file it
                   is, and the path — in that order, because "is it in?" is the
                   question and the path is the evidence. */
                .hkfiles { display: flex; flex-direction: column; gap: 2px; width: 100%; }
                .hkfile { align-items: baseline; display: flex; font-size: 11px; gap: 7px; }
                .hkmark.ok { color: var(--vscode-charts-green, #4caf50); }
                .hkmark.no { color: var(--vscode-charts-orange, #d18616); }
                .hkscope { flex: 0 0 92px; opacity: .8; }
                .hkpath { font-family: var(--vscode-editor-font-family); opacity: .6;
                          overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                .tb-num { font-size: 26px; font-weight: 700; }
                .tb-cat { font-weight: 600; margin: 2px 0; }
                .tb-exp { margin-top: 6px; line-height: 1.35; }
                .newrow select { max-width: 180px; }
                /* The facet row sits directly under the text box: one band that
                   reads left to right as "narrow it · order it · undo it ·
                   how many are left". */
                .tb-filters { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 6px 0 10px; }
                .tb-filters .grow { flex: 1; }
                .tb-filters select { font-size: 11px; }
                .searchbar input { width: 280px; }            </style>
            ${window.AFHeader.html({
                page: 'toolbox',
                title: 'Toolbox',
                // ‼️ WHOSE extension model this is (X-35). Skills, subagents,
                // slash commands, hooks, plugins and output styles are Claude
                // Code's own vocabulary — an agent you drive with Codex or
                // Antigravity reads none of them, and a page that just said
                // "extends claude" in lower case left that as a guess.
                sub: `${total} installed extensions across user + agent scope · inventory, details and management for everything that extends Claude Code — this is Claude Code's extension model, and the other engines do not read it`,
                // ‼️ U-83 — THE FOUR THINGS THIS PAGE OWNS, ON THEIR OWN ROW.
                // Wiki left this cluster for the global nav (it is about the
                // whole farm's knowledge, not about Claude's extension model);
                // ⚖ Sync Constitution arrived from the Dashboard, because what
                // it mirrors — the shared CLAUDE.md into the AGENTS.md files the
                // other engines read — is a piece of Claude Code's extension
                // model and belongs with the rest of it. Four appended to the
                // global row wrapped it under the cursor, so they take line two
                // (`relatedRow`) and keep the same right edge.
                related: [
                    {
                        nav: 'airtable', label: '🗄️ Airtable Engine',
                        title: 'Your data engine as a farm module — its bases, tables and sync state, '
                            + 'and what the agents are allowed to read and write there.'
                    },
                    {
                        nav: 'capabilities', label: 'Capability Matrix',
                        title: 'Who has which skill and MCP server, and which of them are actually used '
                            + '(last 30 days) — the place to copy one agent\'s capability onto another.'
                    },
                    {
                        // Its own row has the width its full name needs, so it
                        // is no longer shortened to "Sync Cons." — the one thing
                        // that made it unreadable on the board it came from.
                        action: 'syncConstitution', label: '⚖ Sync Constitution', name: 'Sync Constitution',
                        title: 'Mirror the shared constitution (the nest root\'s own CLAUDE.md) to the AGENTS.md files Codex and Antigravity read. CLAUDE.md is only read, never written; a hand-edited AGENTS.md is reported, not overwritten.'
                    },
                    {
                        nav: 'secrets', label: '🔑 Secrets',
                        title: 'Named values kept in the OS keychain — never in settings files or git — '
                            + 'with what each is for and which agents may use it.'
                    }
                ],
                relatedRow: true,
                guide: 'toolbox'
            })}
            <div class="btnrow" style="margin-bottom:10px">${tabBar}</div>
            ${body}`;

        wire();
    }

    function wire() {
        window.AFHeader.wire(vscode);
        // ‼️ The text box is per PAGE and the facets are per TAB, deliberately:
        // typed words are a passing thought and rarely mean the same thing on
        // the next tab, while a facet selection is four clicks of setting up a
        // view and throwing it away for a glance at MCP is the annoyance this
        // whole change exists to remove.
        document.querySelectorAll('[data-tab]').forEach(b =>
            b.addEventListener('click', () => { state.tab = b.dataset.tab; state.q = ''; render(); }));
        for (const f of facetsFor(state.tab)) {
            window.AFFilter.wireMulti({
                id: 'tbf-' + state.tab + '-' + f.id,
                onChange: sel => { setFacet(state.tab, f.id, sel); render(); }
            });
        }
        const sortSel = document.getElementById('tb-sort');
        if (sortSel) {
            sortSel.addEventListener('change', () => { state.sort[state.tab] = sortSel.value; render(); });
        }
        document.querySelectorAll('[data-tbclear]').forEach(b =>
            b.addEventListener('click', () => {
                state.q = '';
                delete state.facets[b.dataset.tbclear];
                render();
            }));
        document.querySelectorAll('[data-afnav]').forEach(b =>
            b.addEventListener('click', () => post({ type: 'afnav', to: b.dataset.afnav })));
        wireServices();
        const q = document.getElementById('tb-q');
        if (q) {
            // live() keeps the caret across the re-render it triggers, and the
            // ✕ is the convention every other filter box on this extension has.
            window.AFFilter.live(q, el => { state.q = el.value; render(); });
            window.AFFilter.clearable(q, () => { state.q = ''; render(); });
        }
        document.querySelectorAll('[data-exp]').forEach(b =>
            b.addEventListener('click', () => {
                state.expanded[b.dataset.exp] = !state.expanded[b.dataset.exp];
                render();
            }));
        document.querySelectorAll('[data-new]').forEach(b =>
            b.addEventListener('click', () => openToolForm({ kind: b.dataset.new, mode: 'new' })));
        wireToolForm();
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

    /**
     * Open the edit card for a row.
     *
     * An MCP server's real definition is not on the row — the inventory carries
     * a summary — so the host is asked for it and the form opens as soon as it
     * lands. Everything else on this page is edited by opening its file, which
     * is what the row's own "open" already does.
     */
    function editTool(it) {
        if (it.kind !== 'mcp') { post({ type: 'open', path: it.source }); return; }
        if (it.scope === 'user') {
            toolMsg = 'That server is user scope — it lives in ' + (DATA.paths.userConfigJson || 'the user config')
                + ', which is shared by every agent on this machine. Open the file to change it.';
            toolMsgOk = false;
            render();
            return;
        }
        openToolForm({ kind: 'mcp', mode: 'edit', agentId: it.agentId || '', name: it.name });
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
            case 'tbMcpEdit': editTool(it); return;
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
                openToolForm({ kind: it.kind, mode: 'copy', agentId: it.agentId || '', name: it.name });
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
