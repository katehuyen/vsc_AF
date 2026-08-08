// Agent Farm — shared advanced Sessions table (Dashboard + Agent Detail).
// One pool of rows, sorted client-side by the picked criterion; each row folds
// open (▸) into that session's per-turn breakdown (fetched on demand from the
// host via a 'sessionTurns' message); active rows carry a ⌨ jump-to-terminal
// button. A narrow origin column (🧑 you / 🤖 automation) separates your own
// dialogs from the runs the farm started by itself; the table opens scoped to
// 🧑 and the chip next to Filters flips User ↔ All in one click. A ★ column
// holds the shelf: pinned sessions sort first and are exempt from the row
// limit, and running rows carry a ⎋ interrupt button next to the ⌨ jump.
// A Show box picks how many rows to list (empty / All = every one);
// changing it posts 'setTableN' so the host rebuilds the row pool for the new
// N — hosts must answer that message. The component owns exactly one container
// div and re-renders only that, so host-page state (e.g. an open pricing
// editor) is never clobbered.
// Every row also carries the shared session right-click contract
// (afSessionCtx.js), so the whole session action set — resume in a terminal or
// in the Console, open, rename, focus terminal, pin, label, copy id, interrupt,
// end, clear — is on the row wherever this table is embedded.
(function () {
    'use strict';

    const SORTS = [
        { id: 'recent', label: 'Recent', key: r => r.ts || 0 },
        { id: 'cost', label: 'Cost', key: r => r.cost || 0 },
        { id: 'tokens', label: 'Tokens', key: r => r.tokens || 0 },
        { id: 'ctx', label: 'Ctx now', key: r => r.ctx || 0 },
        { id: 'duration', label: 'Duration', key: r => r.durationMin || 0 },
        { id: 'turns', label: 'Turns', key: r => r.turns || 0 }
    ];

    // min–max range filters run over the same figures the sorts use (and then some)
    const FRANGES = [
        { id: 'tokens', label: 'Tokens', get: r => r.tokens || 0 },
        { id: 'cost', label: 'Cost $', get: r => r.cost || 0 },
        { id: 'ctx', label: 'Ctx', get: r => r.ctx || 0 },
        { id: 'duration', label: 'Minutes', get: r => r.durationMin || 0 },
        { id: 'turns', label: 'Turns', get: r => r.turns || 0 },
        { id: 'tools', label: 'Tools', get: r => r.toolCalls || 0 },
        { id: 'errors', label: 'Errors', get: r => r.errors || 0 }
    ];
    // Origin scope (who started the session). 'user' is the DEFAULT: the table
    // is first of all the log of your own conversations, and on a farm with
    // standing duties the automation runs outnumber them several times over.
    // '' = both. The glyphs are the queue page's author language (🧑 you /
    // 🤖 agent), so one vocabulary carries across the whole extension.
    const ORIGINS = [
        { id: '', label: 'All', glyph: '🧑🤖', tip: 'Both your own sessions and automation runs' },
        { id: 'user', label: 'User', glyph: '🧑', tip: 'Only sessions you started yourself — your dialogs' },
        { id: 'auto', label: 'Auto', glyph: '🤖', tip: 'Only automation runs — schedule / trigger / task / mission' }
    ];
    const originOf = r => (r.origin === 'auto' ? 'auto' : 'user');
    const originMeta = id => ORIGINS.find(o => o.id === id) || ORIGINS[0];

    // agents: null = every agent (no filter — one joining the fleet is included
    // by itself); an array = exactly that subset, [] = none. See afFilters.js.
    const FDEF = () => ({
        text: '', agents: null, projects: null, origin: 'user', activeOnly: false, errorsOnly: false,
        mainOnly: false, pinnedOnly: false, from: '', to: '', ranges: {}
    });
    // Sessions with no project land in one honest bucket rather than silently
    // disappearing from a project filter.
    const UNASSIGNED = 'Unassigned';
    const projectOf = r => r.project || UNASSIGNED;

    /**
     * ‼️ HOW WIDE A COLUMN IS, DECIDED HERE — NOT BY WHATEVER HAPPENED TO BE IN
     * IT.
     *
     * The table used to lay itself out (`table-layout: auto`, the default),
     * which means every column's width is a function of the CONTENT THAT
     * HAPPENS TO BE LISTED. Measured, same component, same thirteen columns,
     * same 1314px table (headless Chromium, 2026-08-07): with 20 rows Title took
     * 462px and Cost 41px; with 200 rows Title took 457px and Cost 48px. So the
     * Dashboard and the Sessions page — the same table twice, one capped at 20
     * rows and one at 200 — could not agree on where a column started, and
     * neither could the same page after a filter. Nobody chose that; it is what
     * auto-layout does.
     *
     * Now the shares are declared, so the table is the same table everywhere:
     * `table-layout: fixed` plus a `<colgroup>`. The numbers below are the
     * measured widths above turned into shares, with ONE deliberate change —
     * **Title gives up a quarter of itself** (462px → 346px, 35.2% → 26.4% of
     * the table) and the space is handed back to every other column in
     * proportion to what it already had. Nothing else was re-designed.
     *
     * `NARROW` is px because those columns hold one glyph or one checkbox: a
     * share would make them grow on a wide monitor, and a 40px-wide checkbox
     * column is a bug. Everything else is a share of what is left, normalised
     * over whichever columns the embedding page asked for — so a page without
     * Agent and Project (the agent detail page) keeps the same proportions
     * between the columns it does show.
     */
    const NARROW = { sel: 23, fold: 32, pin: 23, origin: 26 };
    /** Shares of the space the px columns leave behind — which is what a `<col>`
     *  percentage is measured against (see colgroupHtml). They sum to 100 for
     *  the full set and are re-normalised for any subset. */
    const SHARE = {
        agent: 9.048, project: 20.679, title: 28.610, when: 5.056, duration: 5.522,
        turns: 3.721, tools: 3.624, files: 3.244, errors: 2.387, tokens: 8.962,
        ctx: 5.241, cost: 3.906
    };

    /**
     * The colgroup for one embed's column set.
     *
     * The shares are normalised across the columns actually shown, so they sum
     * to 100 whatever the page asked for — and a percentage on a `<col>` is
     * resolved against WHAT IS LEFT after the px columns, not against the whole
     * table (measured, Chromium 1232: a 968px table with one 23px column gave
     * 70%/30% as 661/283 of the remaining 945). That is exactly the arithmetic
     * wanted here, so no `calc()` is needed — which is just as well, because
     * `calc()` mixing a percentage into a column width is silently dropped and
     * every column falls back to an equal slice (measured the same way).
     */
    function colgroupHtml(cols) {
        const total = cols.reduce((n, c) => n + (NARROW[c] ? 0 : (SHARE[c] || 0)), 0) || 1;
        const w = c => (NARROW[c]
            ? `${NARROW[c]}px`
            : `${((SHARE[c] || 0) / total * 100).toFixed(3)}%`);
        return `<colgroup>`
            + `<col style="width:${NARROW.sel}px"><col style="width:${NARROW.fold}px"><col style="width:${NARROW.pin}px">`
            + cols.map(c => `<col style="width:${w(c)}">`).join('')
            + `</colgroup>`;
    }

    const STYLE = `<style>
        .chiprow { display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin:8px 0; }
        .chip { font-size:11px; padding:2px 10px; border-radius:10px; cursor:pointer;
            background:transparent; color:var(--vscode-foreground); opacity:.75;
            border:1px solid var(--vscode-widget-border, #4444); }
        .chip.on { background:var(--vscode-button-background); color:var(--vscode-button-foreground);
            border-color:transparent; opacity:1; }
        .af-fpanel { display:flex; flex-direction:column; gap:6px; margin:2px 0 8px;
            padding:8px 10px; border:1px solid var(--vscode-widget-border, #3333); border-radius:5px; }
        .af-frow { display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
        .af-frange { font-size:11px; display:flex; gap:3px; align-items:center; white-space:nowrap; }
        .af-frange input[type=number] { width:64px; padding:1px 4px; }
        .af-frange input[type=date] { padding:1px 4px; }
        .af-ftext { width:180px; padding:2px 6px; }
        .af-count { width:52px; padding:1px 4px; }
        /* the project's own colour, the same mark the sidebar and its page use */
        .af-pdot { display:inline-block; width:7px; height:7px; border-radius:50%; margin-right:5px;
            background:var(--vscode-panel-border); vertical-align:middle; }
        .foldcell { width:22px; }
        /* Selection: one narrow always-present column. Always present rather
           than a mode you switch on — a checkbox that appears only after you
           find the button that reveals it is a feature nobody finds. */
        .selcell { width:20px; text-align:center; }
        .selcell input { margin:0; cursor:pointer; vertical-align:middle; }
        tr.sessrow.picked > td { background:color-mix(in srgb, var(--vscode-textLink-foreground) 26%, transparent); }
        .af-selbar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin:0 0 8px;
            padding:5px 10px; border-radius:5px;
            background:var(--vscode-editorWidget-background, #8881);
            border:1px solid var(--vscode-widget-border, #4444); font-size:11px; }
        /* Origin: one narrow glyph column — the eye scans a single strip to tell
           your own dialogs from automation runs. The word is in the tooltip. */
        .origcell { width:20px; text-align:center; font-size:11px; line-height:1;
            opacity:.85; cursor:default; }
        .origcell.auto { opacity:.6; }
        /* Pin: the shelf. One narrow always-present column — an outlined star
           on every row (click to shelve), filled on the ones you keep. */
        .pincell { width:20px; text-align:center; }
        .pinbtn { background:transparent; border:0; cursor:pointer; padding:0 2px; font-size:11px;
            line-height:1; color:var(--vscode-foreground); opacity:.25; }
        .pinbtn:hover { opacity:.8; }
        .pinbtn.on { opacity:1; color:var(--vscode-charts-yellow, #d7ba7d); }
        .stag { font-size:9px; padding:0 5px; margin-left:4px; border-radius:7px; white-space:nowrap;
            border:1px solid var(--vscode-widget-border, #4444); opacity:.8; }
        .fold { font-size:10px; padding:0 6px; line-height:16px; cursor:pointer; border-radius:3px;
            background:transparent; opacity:.7; border:1px solid var(--vscode-widget-border, #4444);
            color:var(--vscode-foreground); }
        .fold:hover { opacity:1; }
        /* Session rows are tinted and accent-edged so that once a row is
           expanded, its turn list can't be misread as another session. */
        tr.sessrow > td { background:color-mix(in srgb, var(--vscode-textLink-foreground) 8%, transparent);
            border-bottom-color:var(--vscode-widget-border, #4443); }
        tr.sessrow > td:first-child { box-shadow:inset 3px 0 0 color-mix(in srgb, var(--vscode-textLink-foreground) 45%, transparent); }
        tr.sessrow.open > td { background:color-mix(in srgb, var(--vscode-textLink-foreground) 18%, transparent); }
        tr.sessrow.open > td:first-child { box-shadow:inset 3px 0 0 var(--vscode-textLink-foreground); }
        /* the turn list is nested content: no tint, indented under its row */
        tr.sessturns > td { padding-left:12px; }
        .turnmini { margin:4px 0 10px; font-size:11px; width:auto; min-width:340px; }
        .turnmini th { font-size:10px; opacity:.7; }
        .tag { font-size:10px; padding:1px 6px; margin-right:4px; border-radius:8px; white-space:nowrap;
            background:var(--vscode-badge-background); color:var(--vscode-badge-foreground); opacity:.85; }
        .turnmini td { border-bottom-color:var(--vscode-widget-border, #1111); }
        /* the declared layout — see NARROW/SHARE above */
        table.sesstable { table-layout:fixed; }
        /* ‼️ A TEXT CELL SHRINKS ITS WORDS AND NEVER ITS CONTROLS. Once the
           column has a declared width, something has to give when the title is
           longer than it: wrapping turns one row into four, and clipping the
           whole cell would eat the ⌨ jump and ⎋ interrupt buttons that sit at
           the end of the line — a control you cannot see is not a control. So the
           line is a flex row: the words are the only flexible part, and what
           does not fit is what the hover panel is for. */
        .cellline { display:flex; align-items:baseline; gap:4px; min-width:0; }
        .cellline > * { flex:0 0 auto; }
        .cellline > .ctext { flex:1 1 auto; min-width:0;
            overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        /* figures are never wrapped: the widths above already carry them */
        table.sesstable td.num, table.sesstable th.num { white-space:nowrap; }
    </style>`;

    function relTime(ts) {
        if (!ts) return 'never';
        const s = Math.round((Date.now() - ts) / 1000);
        if (s < 60) return s + 's ago';
        const m = Math.round(s / 60);
        if (m < 60) return m + 'm ago';
        const h = Math.round(m / 60);
        if (h < 24) return h + 'h ago';
        return Math.round(h / 24) + 'd ago';
    }

    /**
     * opts: {
     *   vscode, C,           // acquired VS Code API + AFCharts helpers
     *   containerId,         // the div this component owns
     *   columns,             // subset of: origin,agent,title,when,duration,turns,tools,errors,tokens,ctx,cost
     *   tableN,              // rows shown after sorting (default 12; 0 = all)
     *   stateKey,            // persistence namespace ('dash', 'agent', …)
     *   fallbackSort, fallbackSingle  // initial state when nothing persisted
     * }
     * returns { setRows(rows, tableN?), onMessage(ev) -> handled? }
     * Host must answer 'sessionTurns' and 'setTableN' (rebuild the pool with
     * the requested N) and handle 'openSession' / 'focusTerminal' /
     * 'pinSession' (persist the shelf) / 'interruptSession'.
     */
    function create(opts) {
        const vscode = opts.vscode, C = opts.C;
        const cols = opts.columns;
        const hasAgentCol = cols.indexOf('agent') >= 0;
        const defaultN = opts.tableN || 12;
        let rows = [];
        let tableN = defaultN; // 0 = all rows

        // sort + single-open persist per page (namespaced so several tables can
        // coexist in one webview state); open rows are session-local
        const persisted = (typeof vscode.getState === 'function' && vscode.getState()) || {};
        const saved = (persisted.afSess || {})[opts.stateKey] || {};
        let sort = SORTS.some(s => s.id === saved.sort) ? saved.sort
            : (SORTS.some(s => s.id === opts.fallbackSort) ? opts.fallbackSort : 'recent');
        // Single-open is the default everywhere a session surface folds things
        // open (viewer turn bands, Turns page, here): rows start collapsed and
        // opening one closes the last, so the table stays a list you scan
        // instead of growing into a page you scroll. An explicit choice — this
        // page's own, or the pre-2.57 top-level one — still wins.
        let single = saved.single !== undefined ? !!saved.single
            : opts.fallbackSingle !== undefined ? !!opts.fallbackSingle : true;
        let filters = Object.assign(FDEF(), saved.filters || {});
        let filtersOpen = !!saved.filtersOpen;
        const open = new Set();
        const turnCache = {}; // file -> { ts, turns|null } (null = request in flight)
        let shown = [];       // exactly what's on screen, set by the last render
        /**
         * ‼️ THE SELECTION IS SESSION-LOCAL AND DELIBERATELY NOT PERSISTED.
         *
         * A selection restored from a previous window is a set of rows somebody
         * chose for a reason they no longer remember, sitting behind a menu
         * whose commands act on all of them. Sort, filters and single-open are
         * a way of LOOKING at the table and are worth keeping; "these twelve
         * sessions" is an action half-taken.
         *
         * Keyed by transcript file, because that is the one handle every row
         * has (a session that never started has no id yet).
         */
        const picked = new Set();
        /** Anchor for shift-click ranges — the last row clicked without shift. */
        let anchor = '';

        function saveState() {
            if (typeof vscode.setState !== 'function') { return; }
            const st = (typeof vscode.getState === 'function' && vscode.getState()) || {};
            const all = Object.assign({}, st.afSess);
            all[opts.stateKey] = { sort, single, filters, filtersOpen };
            vscode.setState(Object.assign({}, st, { afSess: all }));
        }

        // The origin scope is deliberately NOT counted here: it has its own
        // always-visible switch in the chip row, so counting it would park a
        // permanent "(1)" on the Filters chip and say nothing new.
        function activeFilterCount() {
            let n = (filters.text ? 1 : 0) + (filters.agents ? 1 : 0) + (filters.projects ? 1 : 0)
                + (filters.activeOnly ? 1 : 0) + (filters.errorsOnly ? 1 : 0) + (filters.mainOnly ? 1 : 0)
                + (filters.pinnedOnly ? 1 : 0)
                + (filters.from ? 1 : 0) + (filters.to ? 1 : 0);
            FRANGES.forEach(k => {
                const rg = filters.ranges[k.id];
                if (rg) { n += (rg.min !== undefined ? 1 : 0) + (rg.max !== undefined ? 1 : 0); }
            });
            return n;
        }

        function filterRows(list) {
            // the box is a QUERY, not a substring — media/afQuery.js
            const text = window.AFQuery.compile(filters.text || '');
            return list.filter(r => {
                if (filters.pinnedOnly && !r.pinned) { return false; }
                // tags are part of the searchable text: "zen" finds both the
                // sessions titled that way and the ones you labelled zen
                if (!text.empty && !text.test((r.title || '') + ' ' + (r.agent || '') + ' '
                    + (r.tags || []).join(' '))) { return false; }
                if (filters.agents && filters.agents.indexOf(r.agentName) < 0) { return false; }
                if (filters.projects && filters.projects.indexOf(projectOf(r)) < 0) { return false; }
                if (filters.origin && originOf(r) !== filters.origin) { return false; }
                if (filters.activeOnly && !r.active) { return false; }
                if (filters.errorsOnly && !(r.errors > 0)) { return false; }
                if (filters.mainOnly && r.sidechain) { return false; }
                if (filters.from) {
                    const t = Date.parse(filters.from);
                    if (!isNaN(t) && r.ts < t) { return false; }
                }
                if (filters.to) {
                    const t = Date.parse(filters.to);
                    if (!isNaN(t) && r.ts >= t + 24 * 3600 * 1000) { return false; } // inclusive end day
                }
                for (const k of FRANGES) {
                    const rg = filters.ranges[k.id];
                    if (!rg) { continue; }
                    const v = k.get(r);
                    if (rg.min !== undefined && v < rg.min) { return false; }
                    if (rg.max !== undefined && v > rg.max) { return false; }
                }
                return true;
            });
        }

        const AGENT_MS = 'sess-agents-' + opts.stateKey;
        const PROJECT_MS = 'sess-projects-' + opts.stateKey;
        function agentNames() {
            const agents = [];
            rows.forEach(r => { if (r.agentName && agents.indexOf(r.agentName) < 0) { agents.push(r.agentName); } });
            return agents.sort();
        }
        // Named projects first, Unassigned last — it is a leftover, not a project.
        function projectNames() {
            const names = [];
            rows.forEach(r => { const p = projectOf(r); if (names.indexOf(p) < 0) { names.push(p); } });
            return names.sort((a, b) => a === UNASSIGNED ? 1 : b === UNASSIGNED ? -1 : a.localeCompare(b));
        }

        function filterPanelHtml() {
            if (!filtersOpen) { return ''; }
            const agents = agentNames();
            const flag = (cls, label, on, tip) =>
                `<button class="chip ${cls}${on ? ' on' : ''}" title="${tip}">${label}</button>`;
            const ranges = FRANGES.map(k => {
                const rg = filters.ranges[k.id] || {};
                return `<label class="af-frange">${k.label}
                    <input type="number" class="af-fr-${k.id}-min" placeholder="min" value="${rg.min !== undefined ? rg.min : ''}">–<input type="number" class="af-fr-${k.id}-max" placeholder="max" value="${rg.max !== undefined ? rg.max : ''}">
                </label>`;
            }).join('');
            const origins = ORIGINS.map(o =>
                `<button class="chip af-forig-${o.id || 'all'}${filters.origin === o.id ? ' on' : ''}" title="${o.tip}">${o.glyph} ${o.label}</button>`).join('');
            return `<div class="af-fpanel">
                <div class="af-frow">
                    <span class="muted small" title="Who started the session">Started by:</span>${origins}
                </div>
                <div class="af-frow">
                    <input type="text" class="af-ftext" placeholder="title contains…" value="${C.esc(filters.text)}"
                        title="${C.esc(window.AFQuery.tip('Searched against the session title, its agent and its labels.'))}">
                    ${hasAgentCol && agents.length > 1 ? window.AFFilter.multi({
                        id: AGENT_MS, label: 'Agents', options: agents, selected: filters.agents,
                        title: 'Which agents to list — tick any combination'
                    }) : ''}
                    ${projectNames().length > 1 ? window.AFFilter.multi({
                        id: PROJECT_MS, label: 'Projects', options: projectNames(), selected: filters.projects,
                        title: 'Which projects to list — manage them on the ◧ Projects page'
                    }) : ''}
                    ${flag('af-factive', 'Active now', filters.activeOnly, 'Only sessions with a live terminal working right now')}
                    ${flag('af-ferrors', 'Has errors', filters.errorsOnly, 'Only sessions with at least one tool error')}
                    ${flag('af-fmain', 'Main only', filters.mainOnly, 'Hide subagent (sidechain) sessions')}
                    ${flag('af-fpin', '★ Pinned', filters.pinnedOnly, 'Only the sessions you pinned — your shelf')}
                </div>
                <div class="af-frow">${ranges}
                    <label class="af-frange">When <input type="date" class="af-ffrom" value="${C.esc(filters.from)}">–<input type="date" class="af-fto" value="${C.esc(filters.to)}"></label>
                    <button class="chip af-fclear" title="Reset every filter">Clear</button></div>
            </div>`;
        }

        /** Ask the host for a session's per-turn breakdown unless the cache is
         *  still fresh (row.ts unchanged — a live session invalidates itself). */
        function ensureTurns(r) {
            const c = turnCache[r.file];
            if (c && c.ts === r.ts) { return; }
            turnCache[r.file] = { ts: r.ts, turns: null };
            vscode.postMessage({ type: 'sessionTurns', file: r.file });
        }

        const dot = r => r.active ? '<span class="dot on" title="Active now"></span> ' : '';
        const subBadge = r => r.sidechain ? ' <span class="badge">sub</span>' : '';
        const tagChips = r => (r.tags || []).map(t => `<span class="stag">${C.esc(t)}</span>`).join('');
        // ⎋ interrupt: only on rows that are actually running — Esc is typed
        // into that session's terminal, which stops the turn, not the session
        const stopBtn = r => r.active
            ? ` <button class="fold" data-stop="${C.esc(r.sessionId || '')}" data-stopagent="${C.esc(r.agentName || '')}" title="Interrupt this session (sends Esc to its terminal) — stops the turn, keeps the session">⎋</button>`
            : '';
        // on every row, not just active ones — a terminal window can be open
        // while the session idles; the command falls back honestly if none is
        const termBtn = r =>
            ` <button class="fold" data-term="${C.esc(r.agentName || '')}" data-sid="${C.esc(r.sessionId || '')}" data-cwd="${C.esc(r.cwd || '')}" title="Jump to this session's terminal window (if one is open)">⌨</button>`;

        /**
         * ‼️ A CELL HOVER IS A READOUT, NOT A PARAGRAPH.
         *
         * Every line below is `Label: value`. No sentence explains what a
         * column means — the column heading does that, once, the way a
         * spreadsheet does; a figure does not get a paragraph next to it on
         * every row of every table for ever. The one exception in the whole
         * table is the ⚖ weighted-token note, which is a definition rather than
         * a figure and lives behind its own ? glyph (charts.js WEIGHTED_TIP).
         *
         * ‼️ AND ANYTHING THAT IS TEXT LEAVES THE `title` ALTOGETHER. A prompt,
         * a project's details — a native tooltip repeats what the cell already
         * drew and then stops wherever the platform feels like stopping. Those
         * go in the rich panel (media/afTip.js): as wide as it needs, scrollable,
         * and you can put the pointer in it. See docs/CONVENTIONS.md → Hover.
         *
         * The right-click hint is said ONCE, in the strip above the table (and
         * by the selection bar when rows are picked) — not eleven times a row.
         */
        const line = (label, value) => (value === '' || value === undefined || value === null
            ? '' : `${label}: ${value}`);
        /** A whole timestamp, in the user's own locale — the column shows "2h
         *  ago" and the question a hover asks is "yes, but when". */
        const stamp = ts => ts ? new Date(ts).toLocaleString() : '';
        /** A per-turn average, only where it means something. Turns are the
         *  denominator everywhere here: a session is a stack of turns, and
         *  "expensive" nearly always means "expensive per turn". */
        const per = (n, turns, fmt) => (n && turns > 0 ? fmt(n / turns) : '');
        const round1 = n => Math.round(n * 10) / 10;
        /** A share, only when the denominator is real. */
        const pct = (n, of) => (of > 0 ? Math.round(n / of * 100) : 0);
        /** Model ids without the vendor prefix every one of them carries. */
        const modelNames = r => (r.models || []).map(m => String(m).replace(/^claude-/, ''));
        /** Join the tooltip's lines. Nothing is appended: see the block above. */
        const tipOf = parts => C.esc(parts.filter(Boolean).join('\n'));

        /** A count with its share of a total, the way a table says it. */
        const ofTotal = (n, total, unit) => (n
            ? `${n.toLocaleString()}${unit ? ' ' + unit : ''} (${pct(n, total)}%)` : '');
        /** Duration in the units it deserves — 3400 min is not a figure. */
        const dur = min => (!min ? '' : min < 90 ? `${min} min`
            : min < 60 * 48 ? `${round1(min / 60)} h` : `${round1(min / 1440)} d`);
        /** What Agent Farm's own record says started this run, when it says so. */
        const launcher = r => (r.launchedBy && r.launchedBy.kind
            ? `${r.launchedBy.kind}${r.launchedBy.label ? ` · ${r.launchedBy.label}` : ''}` : '');
        /**
         * Spend per hour — and ONLY for a session that ran an hour.
         *
         * The figure used to be clamped (`max(1, hours)`), which meant every
         * short session reported its whole cost as its hourly rate: a
         * twenty-minute $8 session said "$8 per hour" when the arithmetic says
         * $24 and neither number means anything. A rate needs a denominator
         * worth dividing by; below one hour there is none, so nothing is said.
         */
        const perHour = r => (r.durationMin >= 60
            ? C.fmtUSD((r.cost || 0) / (r.durationMin / 60)) : '');

        const TIP = {
            origin: r => [
                line('Started by', originOf(r) === 'auto' ? '🤖 Automation' : '🧑 You'),
                line('Launched by', launcher(r)),
                line('Entrypoint', r.entrypoint || '—'),
                line('Console-hosted', r.consoleHosted ? 'yes' : ''),
                line('Agent', r.agent),
                line('Session', r.sessionId)
            ],
            agent: r => [
                line('Agent', r.agent),
                line('State', (r.active ? 'running' : 'idle') + (r.sidechain ? ' · sub-agent' : '')),
                line('Folder', r.cwd),
                line('Branch', r.branch),
                line('Permissions', r.permissionMode),
                line('CLI', r.version),
                line('Models', modelNames(r).join(', ')),
                line('Session', r.sessionId)
            ],
            // ‼️ title/project are NOT here: they are text, so they use the rich
            // panel (AFTip) rather than a native title. See TIPBOX below.
            files: r => [
                line('Files written', r.files || 0),
                line('Per turn', per(r.files, r.turns, n => round1(n))),
                line('Tool calls', r.toolCalls || 0),
                line('Memory files read', r.memoryReads || '')
            ],
            when: r => [
                line('Last activity', `${stamp(r.ts)} · ${relTime(r.ts)}`),
                line('Started', stamp(r.firstTs)),
                line('Ran for', dur(r.durationMin)),
                line('Turns', r.turns || 0),
                line('State', r.active ? 'running' : 'idle')
            ],
            duration: r => [
                line('Duration', dur(r.durationMin) + ' (wall clock)'),
                line('Started', stamp(r.firstTs)),
                line('Ended', stamp(r.ts)),
                line('Per turn', per(r.durationMin, r.turns, n => `${round1(n)} min`)),
                line('Per API call', r.apiCalls && r.durationMin
                    ? `${round1(r.durationMin * 60 / r.apiCalls)} s` : ''),
                line('Cost per hour', perHour(r))
            ],
            turns: r => [
                line('Turns', r.turns || 0),
                line('API calls', r.apiCalls || ''),
                line('Calls per turn', per(r.apiCalls, r.turns, n => round1(n))),
                line('Tokens per turn', per(r.tokens, r.turns, n => C.fmtTok(Math.round(n)))),
                line('Cost per turn', per(r.cost, r.turns, n => C.fmtUSD(n))),
                line('Tools per turn', per(r.toolCalls, r.turns, n => round1(n))),
                line('Files per turn', per(r.files, r.turns, n => round1(n))),
                line('Minutes per turn', per(r.durationMin, r.turns, n => round1(n)))
            ],
            tools: r => [
                line('Tool calls', r.toolCalls || 0),
                line('Per turn', per(r.toolCalls, r.turns, n => round1(n))),
                // WHAT it did, not just how much: "312 tool calls" and "312 tool
                // calls, 210 of them Read" are different facts about a session.
                line('Top', (r.topTools || []).map(t => `${t.name} ${t.n}`).join(' · ')),
                line('Skills', (r.topSkills || []).map(t => `${t.name} ${t.n}`).join(' · ')),
                line('Errors', ofTotal(r.errors, r.toolCalls, '')),
                line('Files written', r.files || '')
            ],
            errors: r => [
                line('Tool errors', r.errors || 0),
                line('Share of tool calls', r.errors ? `${pct(r.errors, r.toolCalls)}%` : ''),
                line('Per turn', per(r.errors, r.turns, n => round1(n))),
                line('Tool calls', r.toolCalls || 0)
            ],
            tokens: r => [
                line('Raw total', C.fmtTok(r.tokens || 0)),
                line('Weighted (plan)', C.fmtTok(r.wTokens || 0)),
                line('Weight ratio', r.tokens ? `${round1((r.wTokens || 0) / r.tokens)}×` : ''),
                // ‼️ THE SPLIT IS THE ANSWER TO "WHY DID THIS ONE COST THAT".
                // Two sessions with the same total differ by an order of
                // magnitude in money when one is cache reads and the other is
                // output — and the column could not show the difference.
                line('In', r.usage ? ofTotal(r.usage.input, r.tokens, '') : ''),
                line('Out', r.usage ? ofTotal(r.usage.output, r.tokens, '') : ''),
                line('Cache read', r.usage ? ofTotal(r.usage.cacheRead, r.tokens, '') : ''),
                line('Cache write', r.usage ? ofTotal(r.usage.cacheWrite, r.tokens, '') : ''),
                line('Per turn', per(r.tokens, r.turns, n => C.fmtTok(Math.round(n)))),
                line('Per API call', per(r.tokens, r.apiCalls, n => C.fmtTok(Math.round(n)))),
                line('Per $', r.cost ? C.fmtTok(Math.round((r.tokens || 0) / r.cost)) : '')
            ],
            ctx: r => [
                line('Context now', r.ctx ? `${C.fmtTok(r.ctx)} tokens` : '—'),
                line('Of a 200k window', r.ctx ? `${pct(r.ctx, 200000)}%` : ''),
                line('Session raw total', C.fmtTok(r.tokens || 0)),
                line('Share of the total', r.ctx && r.tokens ? `${pct(r.ctx, r.tokens)}%` : ''),
                line('Per turn', per(r.tokens, r.turns, n => C.fmtTok(Math.round(n)))),
                line('Turns', r.turns || 0),
                line('Last activity', `${stamp(r.ts)} · ${relTime(r.ts)}`),
                line('State', r.active ? 'running' : 'idle')
            ],
            cost: r => [
                line('API-equivalent', C.fmtUSD(r.cost || 0)),
                line('Per turn', per(r.cost, r.turns, n => C.fmtUSD(n))),
                line('Per API call', per(r.cost, r.apiCalls, n => C.fmtUSD(n))),
                line('Per hour', perHour(r)),
                line('Per 1M tokens', r.tokens
                    ? C.fmtUSD((r.cost || 0) / (r.tokens / 1000000)) : ''),
                line('Models', modelNames(r).join(', '))
            ]
        };

        /**
         * ‼️ THE TEXT COLUMNS, IN THE RICH PANEL.
         *
         * Title and Project are the two cells whose content is WORDS, and words
         * are exactly what a native tooltip is worst at. Each returns
         * `{ head, body }` for AFTip: `head` is one line of scale (what this is,
         * how big), `body` is the thing itself, whole.
         */
        const TIPBOX = {
            title: r => {
                const prompt = String(r.firstPrompt || '');
                const facts = [
                    line('Session', r.sessionId),
                    line('Agent', r.agent),
                    line('Project', r.project),
                    line('Started as', r.cliName && r.cliName !== r.title ? r.cliName : ''),
                    line('From the conversation', r.autoTitle && r.autoTitle !== r.title ? r.autoTitle : ''),
                    line('Labels', (r.tags || []).join(', ')),
                    line('Pinned', r.pinned ? 'yes' : ''),
                    line('Turns', r.turns || 0),
                    line('Started', stamp(r.firstTs))
                ].filter(Boolean).join('\n');
                return {
                    head: `${r.turns || 0} turns · ${relTime(r.ts)}`
                        + (prompt ? ` · first prompt ${prompt.length.toLocaleString()} characters` : ''),
                    body: (r.title || '(no title yet)') + '\n\n' + facts
                        + (prompt ? '\n\n── First prompt ──\n' + prompt : '')
                };
            },
            project: r => (r.project
                ? { head: `Project · ${r.project}`, body: r.projectDetail || r.project }
                : { head: 'No project', body: '' })
        };

        /**
         * ‼️ THE DEFINITION IS ON THE HEADING, ONCE — the spreadsheet rule.
         *
         * A column means one thing, so it is said one place: here, at the top,
         * where you look once. Each is a short definition, never a paragraph
         * and never advice; the cells below carry figures only.
         */
        const HEAD = {
            origin: '<th class="origcell" title="Who started the session: 🧑 you · 🤖 automation">By</th>',
            agent: '<th title="Agent whose folder the session ran in. ● running · sub = sub-agent · ⌨ terminal · ⎋ interrupt">Agent</th>',
            project: '<th title="Project this session\'s work belongs to">Project</th>',
            files: '<th class="num" title="Distinct files written to (Edit / Write / MultiEdit / NotebookEdit)">Files</th>',
            title: '<th title="Session name — the launch name (-n) or a rename, otherwise what the conversation suggests">Title</th>',
            when: '<th class="num" title="Time since the session was last active">When</th>',
            duration: '<th class="num" title="First turn to last, in wall clock">Duration</th>',
            turns: '<th class="num" title="Prompts sent. One turn = one thing asked for; it takes many API calls">Turns</th>',
            tools: '<th class="num" title="Tool calls across the session (Read, Edit, Bash, MCP…)">Tools</th>',
            errors: '<th class="num" title="Tool results that came back as errors">Err</th>',
            tokens: '<th class="num" title="Raw tokens (input + cache + output); after ⚖ the same session weighted against the plan limit">Tokens</th>',
            ctx: '<th class="num" title="Context in the model window after the last reply">Ctx now</th>',
            cost: '<th class="num" title="What these tokens would have cost on the API — the comparable figure, not an invoice">Cost</th>'
        };
        // the active dot / sub badge / ⌨ button live in the leftmost identity
        // cell — Agent when present (dashboard), otherwise Title (agent page)
        //
        // Every cell's words come from TIP above and end there: the right-click
        // hint is said once, above the table, not eleven times per row.
        const CELL = {
            origin: r => {
                const o = originMeta(originOf(r));
                return `<td class="origcell ${o.id}" title="${tipOf(TIP.origin(r))}">${o.glyph}</td>`;
            },
            agent: r => `<td title="${tipOf(TIP.agent(r))}"><span class="cellline">${dot(r)}<span class="ctext">${C.esc(r.agent)}</span>${subBadge(r)}${termBtn(r)}${stopBtn(r)}</span></td>`,
            // ‼️ The title cell hands its hover to the rich panel: the answer to
            // "what was this session actually asked to do" is the opening
            // PROMPT, whole, and a native tooltip cannot hold one.
            title: r => {
                const b = TIPBOX.title(r);
                const inner = '<span class="cellline">' + (hasAgentCol
                    ? `<span class="ctext">${C.esc(r.title)}</span>${tagChips(r)}`
                    : `${dot(r)}<span class="ctext">${C.esc(r.title)}</span>${tagChips(r)}${subBadge(r)}${termBtn(r)}${stopBtn(r)}`)
                    + '</span>';
                return window.AFTip.cell('', '', inner, b.head, b.body);
            },
            // A project is recognisable by its colour and icon everywhere else
            // it appears (sidebar, status bar, its own page); the table that
            // lists sessions BY project was the one place showing a bare name —
            // and now the hover carries what the project IS, folders first.
            //
            // ‼️ THE DOT IS DRAWN ONLY WHEN IT SAYS SOMETHING. It is the
            // project's OWN colour, the mark the sidebar and the status bar use,
            // so it earns its place on a project that has one. On a project
            // that does not it used to fall back to the panel border — an
            // identical grey dot in front of every name, carrying no
            // information and taking the narrowest column's first 12px.
            project: r => {
                const b = TIPBOX.project(r);
                const inner = r.project
                    ? '<span class="cellline">'
                    + (r.projectColor
                        ? `<span class="af-pdot" style="background:${C.esc(r.projectColor)}"></span>` : '')
                    + (r.projectIcon ? `<span>${C.esc(r.projectIcon)}</span>` : '')
                    + `<span class="ctext">${C.esc(r.project)}</span></span>`
                    : '—';
                return window.AFTip.cell(r.project ? '' : 'muted', '', inner, b.head, b.body);
            },
            files: r => `<td class="num" title="${tipOf(TIP.files(r))}">${r.files || ''}</td>`,
            when: r => `<td class="num" title="${tipOf(TIP.when(r))}">${relTime(r.ts)}</td>`,
            duration: r => `<td class="num" title="${tipOf(TIP.duration(r))}">${r.durationMin || 0}m</td>`,
            turns: r => `<td class="num" title="${tipOf(TIP.turns(r))}">${r.turns || 0}</td>`,
            tools: r => `<td class="num" title="${tipOf(TIP.tools(r))}">${r.toolCalls || 0}</td>`,
            errors: r => `<td class="num" title="${tipOf(TIP.errors(r))}">${r.errors || ''}</td>`,
            tokens: r => `<td class="num" title="${tipOf(TIP.tokens(r))}">${C.fmtTokW(r.tokens, r.wTokens)}</td>`,
            ctx: r => `<td class="num" title="${tipOf(TIP.ctx(r))}">${r.ctx ? '~' + C.fmtTok(r.ctx) : '—'}</td>`,
            cost: r => `<td class="num" title="${tipOf(TIP.cost(r))}"><strong>${C.fmtUSD(r.cost)}</strong></td>`
        };

        function turnPanelHtml(r) {
            const c = turnCache[r.file];
            if (!c || c.turns === null) { return '<span class="muted small">Loading turns…</span>'; }
            if (!c.turns.length) { return '<span class="muted small">No turns recorded.</span>'; }
            // model ids / run attributes come straight from the transcript — no
            // name table here, so tomorrow's model shows up on its own
            const tags = t => (t.models || []).map(m => m.replace(/^claude-/, ''))
                .concat(Object.values(t.attrs || {}));
            // The same figures the viewer's turn band carries, in the same order
            // and the same words — a turn read here and read there must not look
            // like two different turns.
            //
            // ‼️ The turn rows follow the SAME hover rule as the session rows
            // above them: `prompt` is text, so it opens the rich panel with the
            // whole ask in it; everything else is figures in a native title,
            // `Label: value`, no sentences. A turn is where the detail actually
            // lives — the session row is a sum of these — so this is the last
            // place that should have been showing one number and stopping.
            const total = c.turns.reduce((a, t) => ({
                tokens: a.tokens + (t.tokens || 0), cost: a.cost + (t.cost || 0),
                steps: a.steps + (t.steps || 0), calls: a.calls + (t.apiCalls || 0)
            }), { tokens: 0, cost: 0, steps: 0, calls: 0 });
            const tTip = t => tipOf([
                line('Turn', `${t.n} of ${c.turns.length}`),
                line('When', stamp(t.ts)),
                line('Took', t.ms ? C.fmtDur(t.ms) : ''),
                line('API calls', t.apiCalls || ''),
                line('Steps', t.steps || ''),
                line('Steps per call', t.apiCalls && t.steps ? round1(t.steps / t.apiCalls) : ''),
                // …and what those steps WERE. Reasoning is the dearest kind and
                // was missing from the total until it was counted (sessions.ts
                // SessionTurn.steps), so the split is said out loud here.
                line('…reasoning', t.thinking ? `${t.thinking} (${pct(t.thinking, t.steps)}%)` : ''),
                line('…tool calls', t.tools ? `${t.tools} (${pct(t.tools, t.steps)}%)` : ''),
                line('…replies', t.steps - (t.thinking || 0) - (t.tools || 0) > 0
                    ? `${t.steps - (t.thinking || 0) - (t.tools || 0)} (${pct(t.steps - (t.thinking || 0) - (t.tools || 0), t.steps)}%)` : ''),
                line('Tool calls', t.tools || ''),
                line('Top tools', (t.topTools || []).map(x => `${x.name} ${x.n}`).join(' · ')),
                line('Errors', t.errors || ''),
                line('Tokens', t.tokens ? C.fmtTok(t.tokens) : ''),
                line('Weighted', t.wTokens ? C.fmtTok(t.wTokens) : ''),
                line('Share of session tokens', t.tokens && total.tokens ? `${pct(t.tokens, total.tokens)}%` : ''),
                line('Cost', t.cost ? C.fmtUSD(t.cost) : ''),
                line('Share of session cost', t.cost && total.cost ? `${pct(t.cost, total.cost)}%` : ''),
                line('Tokens per call', t.apiCalls && t.tokens ? C.fmtTok(Math.round(t.tokens / t.apiCalls)) : ''),
                line('Ctx at end', t.endCtx ? C.fmtTok(t.endCtx) : ''),
                line('Models', tags(t).join(', ')),
                line('Click', 'opens the transcript here')
            ]);
            const pTip = t => {
                const p = String(t.prompt || t.label || '');
                return {
                    head: `Turn ${t.n} · ${stamp(t.ts)}`
                        + (p ? ` · ${p.length.toLocaleString()} characters` : ''),
                    body: p
                };
            };
            return `<table class="turnmini">
                <tr><th class="num" title="Turn number within the session">#</th><th title="The prompt that opened the turn">prompt</th><th title="Model(s) that served the turn">model</th><th class="num" title="${C.esc(C.STEPS_TIP)}">steps</th><th class="num" title="Prompt to the turn's last recorded line">took</th><th class="num" title="Raw tokens; after ⚖ weighted against the plan limit">tokens</th><th class="num" title="API-equivalent cost of the turn">cost</th><th class="num" title="Context in the window when the turn ended">ctx</th></tr>
                ${c.turns.map(t => {
        const tip = tTip(t), p = pTip(t);
        return `<tr class="click" data-turnjump="${C.esc(r.file)}" data-turnts="${t.ts || 0}">
                    <td class="num" title="${tip}">${t.n}</td>${window.AFTip.cell('', '', C.esc(t.label || '—'), p.head, p.body)}
                    <td title="${tip}">${tags(t).map(x => `<span class="tag">${C.esc(x)}</span>`).join('') || '—'}</td>
                    <td class="num" title="${tip}">${t.steps || t.apiCalls ? C.esc(C.fmtSteps(t.apiCalls, t.steps)) : '—'}</td>
                    <td class="num" title="${tip}">${t.ms ? C.esc(C.fmtDur(t.ms)) : '—'}</td>
                    <td class="num" title="${tip}">${t.tokens ? C.fmtTokW(t.tokens, t.wTokens) : '—'}</td>
                    <td class="num" title="${tip}">${t.cost ? C.fmtUSD(t.cost) : '—'}</td>
                    <td class="num" title="${tip}">${t.endCtx ? C.fmtTok(t.endCtx) : '—'}</td>
                </tr>`;
    }).join('')}
            </table>`;
        }

        function sectionHtml() {
            const def = SORTS.find(s => s.id === sort) || SORTS[0];
            const pool = filterRows(rows);
            const nf = activeFilterCount();
            const hidden = rows.length - pool.length;
            const scope = originMeta(filters.origin);
            // The shelf sits on top: pinned rows first, then whatever criterion
            // is picked — a session you keep coming back to is never scrolled to.
            shown = pool.slice().sort((a, b) =>
                ((b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)) || (def.key(b) - def.key(a)));
            // …and it is not part of the top-N either: the cut applies to the
            // unpinned rows, so pinning a seventh session never hides a sixth.
            if (tableN > 0) {
                const pinnedRows = shown.filter(r => r.pinned);
                shown = pinnedRows.concat(shown.filter(r => !r.pinned).slice(0, tableN));
            }
            shown.forEach(r => { if (open.has(r.file)) { ensureTurns(r); } });
            // The rows the selection actually covers — what a bulk command
            // would act on, and what the bar has to be able to say out loud.
            const chosen = shown.filter(r => picked.has(r.file));
            const rowsHtml = shown.map(r => {
                const o = open.has(r.file);
                const on = picked.has(r.file);
                // The ROW still carries the hint, and only the row: a `<td>` with
                // its own title overrides it, so this shows exactly where no cell
                // has anything better to say — never eleven times over.
                const tail = on ? bulkHint(chosen.length) : window.AFSessionCtx.HINT;
                return `<tr class="click sessrow${o ? ' open' : ''}${on ? ' picked' : ''}" data-session="${C.esc(r.file)}"
                    ${window.AFSessionCtx.row(r, on ? bulkContext(chosen) : undefined)}
                    title="${tail}">
                    <td class="selcell"><input type="checkbox" data-sel="${C.esc(r.file)}"${on ? ' checked' : ''}
                        title="Select this session — shift-click for a range, then right-click any selected row"></td>
                    <td class="foldcell"><button class="fold" data-fold="${C.esc(r.file)}" title="${o ? 'Hide' : 'List'} this session's turns">${o ? '▾' : '▸'}</button></td>
                    <td class="pincell"><button class="pinbtn${r.pinned ? ' on' : ''}" data-pin="${C.esc(r.sessionId || '')}" data-pinned="${r.pinned ? '1' : '0'}" title="${r.pinned ? 'Pinned — click to take it off your shelf' : 'Pin this session to your shelf (always listed first)'}">${r.pinned ? '★' : '☆'}</button></td>
                    ${cols.map(c => CELL[c](r)).join('')}
                </tr>` + (o ? `<tr class="sessturns"><td colspan="3"></td><td colspan="${cols.length}">${turnPanelHtml(r)}</td></tr>` : '');
            }).join('');
            const allOn = shown.length > 0 && chosen.length === shown.length;
            return `${STYLE}
            <div class="chiprow">
                <span class="muted small">Sort by:</span>
                <select class="af-sort">${SORTS.map(s => `<option value="${s.id}"${s.id === sort ? ' selected' : ''}>${s.label}</option>`).join('')}</select>
                <span class="muted small">Show:</span>
                <input type="number" class="af-count" min="1" step="1" value="${tableN > 0 ? tableN : ''}" placeholder="all" title="How many sessions to list after sorting — empty means all">
                <button class="chip af-allrows${tableN === 0 ? ' on' : ''}" title="List every session (click again to go back to ${defaultN})">All</button>
                <span class="muted small">Turns:</span>
                <button class="chip af-expand" title="List every shown session's turns">Expand all</button>
                <button class="chip af-collapse" title="Hide all turn lists">Collapse all</button>
                <button class="chip af-single${single ? ' on' : ''}" title="Only one session's turns open at a time: unfolding a session folds the previous one">Single-open</button>
                <button class="chip af-oswitch${filters.origin ? ' on' : ''}" title="Scope: ${scope.tip} · click to ${filters.origin ? 'show everything' : 'go back to your own sessions'}">${scope.glyph}</button>
                <button class="chip af-filter${nf ? ' on' : ''}" title="Filter the sessions by origin, text, agent, flags, ranges and dates">Filters${nf ? ` (${nf})` : ''}</button>
                <!-- ‼️ THE ONE PLACE THE HINT IS SAID. It used to be appended to
                     every cell's tooltip on every row, which is a sentence you
                     read once printed several hundred times. Everything true of
                     the WHOLE table lives on this line; everything true of one
                     figure lives on that figure. -->
                <span class="muted small">${hidden > 0 ? `${pool.length}/${rows.length} sessions · ` : ''}${window.AFSessionCtx.HINT} · hover any figure for what it means · ▸ lists a session's turns · ● = active now</span>
            </div>
            ${filterPanelHtml()}
            ${selBarHtml(chosen)}
            <div class="tablewrap"><table class="sesstable">
                ${colgroupHtml(cols)}
                <tr>
                    <th class="selcell"><input type="checkbox" class="af-selall"${allOn ? ' checked' : ''}
                        title="${allOn ? 'Clear the selection' : 'Select every session listed here'}"></th>
                    <th></th>
                    <th class="pincell" title="Your shelf — ★ pins a session so it is always listed first and never cut by the row limit">★</th>${cols.map(c => HEAD[c]).join('')}</tr>
                ${rowsHtml || `<tr><td colspan="${cols.length + 3}" class="muted">${rows.length ? 'No sessions match the filters.' : 'No sessions yet.'}</td></tr>`}
            </table></div>`;
        }

        /**
         * What a selected row hands to the right-click menu on top of its own
         * identity.
         *
         * ‼️ THE SELECTION TRAVELS AS CONTEXT, NOT AS A MESSAGE OF ITS OWN.
         * The row's menu is already the whole session action set, built by VS
         * Code from `webview/context`; adding `sessionIds` to the context makes
         * every one of those commands able to act on all of them without this
         * component knowing which commands exist, and without any host that
         * embeds the table having to answer a new message. A bulk action bar
         * with its own buttons would be a second, shorter copy of that menu —
         * and the copy is the one that goes out of date.
         *
         * It is attached ONLY to rows that are in the selection. A right-click
         * on an unselected row is then, correctly, about that row alone: the
         * context is static, so this is what makes "the menu acts on what you
         * pointed at" true without any click-time bookkeeping.
         */
        function bulkContext(chosen) {
            return {
                // `afSelectedSessions` is the key the project commands have
                // taken since the selection contract was written; the paths ride
                // beside it so a row whose session has not reported an id yet is
                // still part of the action rather than silently dropped.
                afSelectedSessions: chosen.map(r => r.sessionId || '').filter(Boolean),
                afSelectedFiles: chosen.map(r => r.file).filter(Boolean),
                afSelectionCount: chosen.length
            };
        }
        const bulkHint = n =>
            `${n} session${n === 1 ? '' : 's'} selected — right-click to act on all of them`;

        /** The bar only exists while something is selected: an empty one would
         *  be a permanent strip of chrome saying nothing. */
        function selBarHtml(chosen) {
            if (!chosen.length) { return ''; }
            const cost = chosen.reduce((n, r) => n + (r.cost || 0), 0);
            const live = chosen.filter(r => r.active).length;
            return `<div class="af-selbar">
                <b>${chosen.length}</b> selected
                <span class="muted">${C.fmtUSD(cost)}${live ? ` · ${live} running` : ''}</span>
                <span class="muted">— right-click any selected row for the action menu:
                    pin, label, file to a project, interrupt, end.</span>
                <button class="chip af-selclear">Clear</button>
            </div>`;
        }

        function renderSection() {
            const el = document.getElementById(opts.containerId);
            if (!el) { return; }
            el.innerHTML = sectionHtml();
            wire(el);
        }

        function wire(root) {
            root.querySelector('.af-sort').addEventListener('change', e => {
                sort = e.target.value;
                saveState();
                renderSection();
            });
            root.querySelector('.af-expand').addEventListener('click', () => {
                shown.forEach(r => { open.add(r.file); ensureTurns(r); });
                renderSection();
            });
            root.querySelector('.af-collapse').addEventListener('click', () => {
                open.clear();
                renderSection();
            });
            root.querySelector('.af-single').addEventListener('click', () => {
                single = !single;
                if (single && open.size > 1) {
                    // entering the mode: keep only the first open row in view order
                    const keep = shown.find(r => open.has(r.file));
                    open.clear();
                    if (keep) { open.add(keep.file); }
                }
                saveState();
                renderSection();
            });
            // ---- Show box: how many rows to list (empty / All = every one) ----
            // a longer beat than the client-side filters: each commit asks the
            // host to rebuild the row pool
            const cnt = root.querySelector('.af-count');
            if (cnt) {
                window.AFFilter.live(cnt, el => {
                    const v = parseInt(el.value, 10);
                    setCount(isFinite(v) && v >= 1 ? v : 0);
                }, 400);
            }
            const allBtn = root.querySelector('.af-allrows');
            if (allBtn) {
                allBtn.addEventListener('click', () => setCount(tableN === 0 ? defaultN : 0));
            }
            // ---- origin scope: one-click User ↔ All, without opening the panel ----
            const osw = root.querySelector('.af-oswitch');
            if (osw) {
                osw.addEventListener('click', () => {
                    filters.origin = filters.origin ? '' : 'user';
                    saveState();
                    renderSection();
                });
            }
            // ---- filter panel ----
            const fchip = root.querySelector('.af-filter');
            if (fchip) {
                fchip.addEventListener('click', () => {
                    filtersOpen = !filtersOpen;
                    saveState();
                    renderSection();
                });
            }
            const apply = () => { saveState(); renderSection(); };
            const wireEl = (sel, ev, fn) => {
                const el = root.querySelector(sel);
                if (el) { el.addEventListener(ev, () => fn(el)); }
            };
            // Filter boxes apply as you type — no blur, no Enter (afFilters.js
            // keeps the caret across the re-render each keystroke triggers).
            const liveEl = (sel, fn, delay) => {
                const el = root.querySelector(sel);
                if (el) { window.AFFilter.live(el, fn, delay); }
            };
            if (filtersOpen) {
                ORIGINS.forEach(o =>
                    wireEl(`.af-forig-${o.id || 'all'}`, 'click', () => { filters.origin = o.id; apply(); }));
                liveEl('.af-ftext', el => { filters.text = el.value || ''; apply(); });
                window.AFFilter.wireMulti({
                    root, id: AGENT_MS,
                    onChange: sel => { filters.agents = sel; apply(); }
                });
                window.AFFilter.wireMulti({
                    root, id: PROJECT_MS,
                    onChange: sel => { filters.projects = sel; apply(); }
                });
                wireEl('.af-factive', 'click', () => { filters.activeOnly = !filters.activeOnly; apply(); });
                wireEl('.af-ferrors', 'click', () => { filters.errorsOnly = !filters.errorsOnly; apply(); });
                wireEl('.af-fmain', 'click', () => { filters.mainOnly = !filters.mainOnly; apply(); });
                wireEl('.af-fpin', 'click', () => { filters.pinnedOnly = !filters.pinnedOnly; apply(); });
                liveEl('.af-ffrom', el => { filters.from = el.value || ''; apply(); }, 300);
                liveEl('.af-fto', el => { filters.to = el.value || ''; apply(); }, 300);
                FRANGES.forEach(k => {
                    const bound = (b) => (el) => {
                        const n = el.value === '' || el.value === undefined ? NaN : Number(el.value);
                        const rg = filters.ranges[k.id] || (filters.ranges[k.id] = {});
                        rg[b] = isNaN(n) ? undefined : n;
                        if (rg.min === undefined && rg.max === undefined) { delete filters.ranges[k.id]; }
                        apply();
                    };
                    liveEl(`.af-fr-${k.id}-min`, bound('min'));
                    liveEl(`.af-fr-${k.id}-max`, bound('max'));
                });
                wireEl('.af-fclear', 'click', () => { filters = FDEF(); apply(); });
            }
            // ---- selection ----
            // ‼️ The checkbox stops the click from reaching the row underneath,
            // which opens the transcript. Selecting twelve sessions must not
            // also open twelve editors.
            root.querySelectorAll('[data-sel]').forEach(box =>
                box.addEventListener('click', ev => {
                    ev.stopPropagation();
                    const file = box.dataset.sel;
                    const want = box.checked === true;
                    // Shift extends from the last row clicked WITHOUT shift, in
                    // the order the table is currently showing — the range a
                    // reader means is the one they can see, not the one the
                    // underlying pool happens to be in.
                    if (ev.shiftKey && anchor && anchor !== file) {
                        const order = shown.map(r => r.file);
                        const a = order.indexOf(anchor), b = order.indexOf(file);
                        if (a >= 0 && b >= 0) {
                            for (const f of order.slice(Math.min(a, b), Math.max(a, b) + 1)) {
                                if (want) { picked.add(f); } else { picked.delete(f); }
                            }
                        }
                    } else {
                        if (want) { picked.add(file); } else { picked.delete(file); }
                        anchor = file;
                    }
                    renderSection();
                }));
            const selAll = root.querySelector('.af-selall');
            if (selAll) {
                selAll.addEventListener('click', ev => {
                    ev.stopPropagation();
                    // "every session listed here" — the rows on screen, not the
                    // whole pool. Selecting rows the filter is hiding would put
                    // sessions the reader cannot see into a bulk action.
                    const all = shown.length > 0 && shown.every(r => picked.has(r.file));
                    shown.forEach(r => { if (all) { picked.delete(r.file); } else { picked.add(r.file); } });
                    anchor = '';
                    renderSection();
                });
            }
            const selClear = root.querySelector('.af-selclear');
            if (selClear) {
                selClear.addEventListener('click', () => { picked.clear(); anchor = ''; renderSection(); });
            }

            root.querySelectorAll('[data-session]').forEach(row =>
                row.addEventListener('click', () =>
                    vscode.postMessage({ type: 'openSession', file: row.dataset.session })));
            // Turn row → open the transcript AT that turn (an already-open viewer
            // is revealed and scrolled there rather than opened again).
            root.querySelectorAll('[data-turnjump]').forEach(row =>
                row.addEventListener('click', ev => {
                    ev.stopPropagation();
                    vscode.postMessage({
                        type: 'openSession', file: row.dataset.turnjump, ts: Number(row.dataset.turnts) || 0
                    });
                }));
            root.querySelectorAll('[data-term]').forEach(b =>
                b.addEventListener('click', ev => {
                    ev.stopPropagation(); // the row click underneath opens the transcript
                    // sessionId picks the exact terminal of THIS row; name/cwd are fallbacks
                    vscode.postMessage({
                        type: 'focusTerminal', sessionId: b.dataset.sid || '',
                        agentName: b.dataset.term, cwd: b.dataset.cwd || ''
                    });
                }));
            // ★ pin — flipped locally at once so the shelf reorders under the
            // cursor; the host persists it and sends the rows back on its own beat
            root.querySelectorAll('[data-pin]').forEach(b =>
                b.addEventListener('click', ev => {
                    ev.stopPropagation(); // the row click underneath opens the transcript
                    const sid = b.dataset.pin;
                    const want = b.dataset.pinned !== '1';
                    const r = rows.find(x => x.sessionId === sid);
                    if (r) { r.pinned = want; }
                    vscode.postMessage({ type: 'pinSession', sessionId: sid, pinned: want });
                    renderSection();
                }));
            root.querySelectorAll('[data-stop]').forEach(b =>
                b.addEventListener('click', ev => {
                    ev.stopPropagation();
                    vscode.postMessage({
                        type: 'interruptSession', sessionId: b.dataset.stop || '',
                        agentName: b.dataset.stopagent || ''
                    });
                }));
            root.querySelectorAll('[data-fold]').forEach(b =>
                b.addEventListener('click', ev => {
                    ev.stopPropagation(); // the row click underneath opens the transcript
                    const file = b.dataset.fold;
                    if (open.has(file)) {
                        open.delete(file);
                    } else {
                        if (single) { open.clear(); }
                        open.add(file);
                        const r = shown.find(x => x.file === file);
                        if (r) { ensureTurns(r); }
                    }
                    renderSection();
                }));
        }

        /** Show-box change: re-render at once from the local pool, then ask the
         *  host to rebuild the pool for the new N (0 = all) so whatever sort is
         *  picked, its genuine top-N arrives with the next data message. */
        function setCount(n) {
            if (n === tableN) { return; }
            tableN = n;
            vscode.postMessage({ type: 'setTableN', n });
            renderSection();
        }

        function setRows(r, n) {
            rows = r || [];
            if (n !== undefined && n !== null) { tableN = n; }
            // ‼️ A selection must never outlive the row it points at. The host
            // resends the pool on its own beat, and a session that has been
            // cleared away would otherwise stay silently in the set — counted
            // in the bar and handed to the next bulk command as a path to a
            // file nobody can see.
            if (picked.size) {
                const alive = new Set(rows.map(x => x.file));
                for (const f of [...picked]) { if (!alive.has(f)) { picked.delete(f); } }
            }
            renderSection();
        }

        /** Scope the table to one project (the Projects card clicks through to
         *  here). The origin scope is widened at the same time: "everything on
         *  this project" must not silently exclude its automation runs. */
        function setProjectFilter(name) {
            filters.projects = name ? [name] : null;
            filters.origin = '';
            filtersOpen = true;
            saveState();
            renderSection();
        }

        function onMessage(ev) {
            if (!ev.data || ev.data.type !== 'sessionTurns') { return false; }
            const c = turnCache[ev.data.file];
            turnCache[ev.data.file] = { ts: c ? c.ts : 0, turns: ev.data.turns || [] };
            renderSection();
            return true;
        }

        return { setRows, onMessage, setProjectFilter };
    }

    window.AFSessionsTable = { SORTS, create };
})();
