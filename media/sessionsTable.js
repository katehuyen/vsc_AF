// Agent Farm — shared advanced Sessions table (Dashboard + Agent Detail).
// One pool of rows, sorted client-side by the picked criterion; each row folds
// open (▸) into that session's per-turn breakdown (fetched on demand from the
// host via a 'sessionTurns' message); active rows carry a ⌨ jump-to-terminal
// button. A narrow origin column (🧑 you / 🤖 automation / 🎯 a mission's own
// run) separates your own dialogs from the runs the farm started by itself; the
// table opens with You on and Auto/Mission off, and three independent chips
// next to Filters switch those categories without changing either of the
// others. A ★ column
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
    /**
     * ‼️ THREE CATEGORIES, THREE SWITCHES — NEVER A RADIO GROUP PLUS AN
     * EXCEPTION. A mission session is technically automation, but in this table
     * it is its own category so one busy mission cannot bury ordinary tasks and
     * dialogs. Each switch owns exactly one boolean: pressing Mission never
     * widens You or Auto, and pressing it again has nothing else to reconstruct.
     */
    const CATEGORIES = [
        { id: 'user', key: 'showUser', label: 'You', glyph: '🧑', tip: 'Sessions you started yourself — your dialogs' },
        { id: 'auto', key: 'showAuto', label: 'Auto', glyph: '🤖', tip: 'Automation outside missions — schedules, triggers and tasks' },
        { id: 'mission', key: 'showMission', label: 'Mission', glyph: '🎯', tip: 'Stamped mission sessions — classic and adaptive, planner and delegations' }
    ];
    const originOf = r => (r.origin === 'auto' ? 'auto' : 'user');
    /**
     * ‼️ X-95 — THE THIRD KIND OF ROW, AND WHY IT IS NOT A THIRD ORIGIN.
     *
     * A mission opens a session for its planner and one for every delegation it
     * hands out, so on a farm that runs missions they outnumber everything else
     * in this table several times over — and every one of them is `auto`, which
     * means the two glyphs above could not tell a mission's twelfth delegation
     * from a nightly schedule. The user's words for it: the log became unusable
     * and the other sessions could no longer be followed.
     *
     * So mission rows carry their OWN glyph (never 🧑, never 🤖 — one look at
     * the column says which of the three a row is), and they are left out of
     * this table by default. `origin` is untouched: "who started it" still has
     * exactly two answers, and this is a different question about the same run.
     *
     * The stamp is the host's (`core/sessions.ts` sessionMission), so the table,
     * the viewer and the bridge cannot drift apart about which mission a session
     * belongs to.
     */
    const MISSION_GLYPH = '🎯';
    const missionOf = r => (r.mission && r.mission.id) || '';
    const missionName = r => (r.mission && (r.mission.title || r.mission.id)) || '';
    /**
     * ‼️ S-35 — THE SECOND HALF OF "WHO STARTED IT".
     *
     * 🤖 said a program launched the run and stopped there, but two very
     * different things live under that glyph: a headless `claude -p` with no
     * terminal and nobody at it, and a task launched in interactive mode that
     * opened a real terminal a person can type into. The moon is drawn TOUCHING
     * the robot — one fact about one run — and never appears on 🧑, where it
     * would be a contradiction.
     *
     * The host decides it (core/sessions.ts `sessionHeadless`); the page only
     * draws what it was sent, so the tables, the viewer and the bridge cannot
     * drift apart.
     */
    const HLESS_GLYPH = '🌙';
    const isHeadless = r => r.headless === true && originOf(r) === 'auto';

    // agents: null = every agent (no filter — one joining the fleet is included
    // by itself); an array = exactly that subset, [] = none. See afFilters.js.
    //
    // ‼️ `engines` IS THE SAME SHAPE FOR THE SAME REASON (X-27). A build that
    // learns about a fifth engine must list its sessions without anybody
    // re-ticking a box, so "no filter" is null and never "all four ids as of
    // today". It combines with every other filter here — the whole point of
    // being one more key on this object rather than a mode: "only Codex" and
    // "only Codex sessions of the developer agent with errors" are the same
    // gesture, in the same panel, with the same Clear.
    const FDEF = () => ({
        text: '', agents: null, engines: null, projects: null,
        // The permanent switches. You is the fresh-table default; Auto and
        // Mission are separate opt-ins, never aliases for "All".
        showUser: true, showAuto: false, showMission: false,
        // ‼️ S-35 — headless runs are IN by default, so the table on a fresh
        // panel is the table it has always been: a filter that hides rows
        // nobody asked it to hide is how a count stops being trustworthy. It
        // only bites in the Auto and Mission categories — under 🧑 there is nothing
        // headless to drop.
        headless: true,
        /**
         * ‼️ X-95 — WHICH MISSIONS' SESSIONS MAY BE LISTED. Same three-state
         * shape as `agents`/`engines` and for the same reason (null = no filter,
         * so a mission started after this box was last opened is not silently
         * excluded by a list of ids from yesterday). Visibility belongs to
         * `showMission`; this value only narrows WHICH mission rows are eligible.
         */
        missions: null,
        activeOnly: false, errorsOnly: false,
        mainOnly: false, pinnedOnly: false, from: '', to: '', ranges: {}
    });
    // Sessions with no project land in one honest bucket rather than silently
    // disappearing from a project filter.
    const UNASSIGNED = 'Unassigned';
    const projectOf = r => r.project || UNASSIGNED;
    // Which engine ran the row, said the way the badge says it. A row with no
    // `engine` is a Claude transcript — the field is an ABSENCE there, which is
    // exactly the trap the badge component exists to close, so it is resolved
    // once here and never re-guessed by a filter or a picker.
    const engineLabel = r => window.AFEngine.label(r.engine || 'claude');

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
        // ‼️ U-26 — THREE CHANGES, ALL ASKED FOR AND ALL IN ONE PLACE.
        // Agent was too narrow to hold a name (9.048 → 13.572, +50%);
        // Project was taking a fifth of the table for a word (20.679 →
        // 5.170, −75%); and ENGINE is new, at what a badge actually needs.
        // The rest are untouched, and the whole set is re-normalised over
        // whichever columns a page asks for, so nothing else moves either.
        //
        // ‼️ U-39 — the +50% above overshot: an agent name is one short word
        // and the column was holding whitespace next to a Title that had to
        // ellipsis. Agent gives back a quarter (13.572 → 10.179) and every
        // point of it goes to Title (28.610 → 32.003), so the row is exactly
        // as wide as it was and only the boundary between those two moved.
        agent: 10.179, engine: 6.200, project: 5.170, title: 32.003, when: 5.056,
        duration: 5.522, turns: 3.721, tools: 3.624, files: 3.244, errors: 2.387,
        tokens: 8.962, ctx: 5.241, cost: 3.906
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
        /* S-35 — a hairline between the three category switches and the 🌙
           narrowing control, so the latter cannot read as a fourth category. */
        .af-fsep { width:1px; align-self:stretch; margin:1px 3px;
            background:var(--vscode-widget-border, #4444); }
        .af-frange { font-size:11px; display:flex; gap:3px; align-items:center; white-space:nowrap; }
        .af-frange input[type=number] { width:64px; padding:1px 4px; }
        .af-frange input[type=date] { padding:1px 4px; }
        .af-ftext { width:180px; padding:2px 6px; }
        .af-count { width:52px; padding:1px 4px; }
        /* The project dot lives in common.css now — the mark is shared with the
           notices board, the queue and every other surface that carries one
           (media/afProject.js). It used to be declared here, which is how a
           second page would have invented a second one. */
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
        .origcell { width:30px; text-align:center; font-size:11px; line-height:1;
            opacity:.85; cursor:default; white-space:nowrap; }
        .origcell.auto { opacity:.6; }
        /* S-35 — the moon is a MARK ON the robot, not a second column: smaller
           than the glyph it qualifies, pulled tight against it, and never on a
           row of its own. A headless row also loses the .auto dimming, because
           it is the one kind of automation run you go looking for. */
        .origcell.hless { opacity:.85; }
        .origcell .hgl { font-size:9px; margin-left:-1px; }
        /* X-95 — a mission's session is FULLY LIT. It is not dimmed like the
           other automation runs: it is off by default, so a row that is on
           screen at all is one somebody asked to see. */
        .origcell.mission { opacity:1; }
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
        const savedFilters = saved.filters || {};
        let filters = Object.assign(FDEF(), savedFilters);
        /**
         * ‼️ X-95 FILTER MIGRATION — THE OLD SHAPE COUPLED TWO AXES.
         *
         * `origin` was a User/Auto/All radio and `missionsOnly` was a second
         * switch layered over it. Preserve what an existing page was showing
         * once, then throw those keys away: after this point only the three
         * independent booleans are persisted and no click can mutate another
         * category as a side effect.
         */
        const hasSaved = k => Object.prototype.hasOwnProperty.call(savedFilters, k);
        if (!hasSaved('showUser') && (hasSaved('origin') || hasSaved('missionsOnly'))) {
            filters.showUser = !savedFilters.missionsOnly && savedFilters.origin !== 'auto';
        }
        if (!hasSaved('showAuto') && (hasSaved('origin') || hasSaved('missionsOnly'))) {
            filters.showAuto = !savedFilters.missionsOnly && savedFilters.origin !== 'user';
        }
        if (!hasSaved('showMission') && (hasSaved('missions') || hasSaved('missionsOnly'))) {
            filters.showMission = savedFilters.missions === null
                || (Array.isArray(savedFilters.missions) && savedFilters.missions.length > 0);
        }
        // In the old shape [] meant "the category is off". That fact moved to
        // showMission, so keeping [] would make its first ON click show nothing.
        if (!hasSaved('showMission') && Array.isArray(filters.missions) && !filters.missions.length) {
            filters.missions = null;
        }
        delete filters.origin;
        delete filters.missionsOnly;
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

        // The three categories are deliberately NOT counted here: each has its
        // own always-visible switch. A SPECIFIC mission selection is counted,
        // because that narrower answer lives only inside the panel.
        function activeFilterCount() {
            let n = (filters.text ? 1 : 0) + (filters.agents ? 1 : 0) + (filters.engines ? 1 : 0)
                + (filters.projects ? 1 : 0)
                + (filters.missions !== null ? 1 : 0)
                // …but 🌙 IS counted, and for the opposite reason: it lives only
                // inside the panel, so with the panel shut nothing else on the
                // page would say that a whole class of runs is being hidden.
                + (filters.headless ? 0 : 1)
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
                //
                // ‼️ X-34 — AND THE SESSION ID. This extension prints
                // eight-character ids everywhere (track chips, log lines, the
                // user's own notes) and the one box on the page that could have
                // taken one back to its session did not look at it. A bare word
                // is a substring, so the printed prefix finds the row without
                // anybody typing a whole UUID.
                if (!text.empty && !text.test((r.title || '') + ' ' + (r.agent || '') + ' '
                    + (r.tags || []).join(' ') + ' ' + (r.sessionId || ''))) { return false; }
                if (filters.agents && filters.agents.indexOf(r.agentName) < 0) { return false; }
                // The picker lists LABELS ("Antigravity"), because that is what
                // the badge in the column says and a filter that disagrees with
                // the cell beside it is unreadable.
                if (filters.engines && filters.engines.indexOf(engineLabel(r)) < 0) { return false; }
                if (filters.projects && filters.projects.indexOf(projectOf(r)) < 0) { return false; }
                // ‼️ A ROW BELONGS TO EXACTLY ONE OF THE THREE SWITCHES. Mission
                // wins over its technical `auto` origin, so 🎯 never needs 🤖
                // to be on beside it and neither switch changes the other.
                const mid = missionOf(r);
                if (mid) {
                    if (!filters.showMission) { return false; }
                    if (filters.missions && filters.missions.indexOf(mid) < 0) { return false; }
                } else if (originOf(r) === 'auto') {
                    if (!filters.showAuto) { return false; }
                } else if (!filters.showUser) { return false; }
                // S-35 — an exclusion, not a scope: off means "leave the
                // headless runs out of whichever scope is showing".
                if (!filters.headless && isHeadless(r)) { return false; }
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
        const ENGINE_MS = 'sess-engines-' + opts.stateKey;
        const PROJECT_MS = 'sess-projects-' + opts.stateKey;
        const MISSION_MS = 'sess-missions-' + opts.stateKey;
        function agentNames() {
            const agents = [];
            rows.forEach(r => { if (r.agentName && agents.indexOf(r.agentName) < 0) { agents.push(r.agentName); } });
            return agents.sort();
        }
        // Engines the table ACTUALLY holds, in the badge's own words. Built off
        // the rows rather than off a fixed list of four: an id this build has
        // never heard of still gets a badge (afEngine.js), so it must still get
        // a line in the picker it would otherwise be unfilterable behind.
        // Claude first — it is the default and the longest lane — then the rest
        // alphabetically, which is the order the badges were introduced in and
        // the order a reader scans.
        function engineNames() {
            const out = [];
            rows.forEach(r => {
                const l = engineLabel(r);
                if (l && out.indexOf(l) < 0) { out.push(l); }
            });
            const claude = window.AFEngine.label('claude');
            return out.sort((a, b) =>
                a === claude ? -1 : b === claude ? 1 : a.localeCompare(b));
        }
        /**
         * ‼️ X-95 — the missions this table actually HOLDS sessions for, newest
         * activity first, as `{v: id, t: title}`: the picker shows the title a
         * person reads and filters on the id, because two missions may be named
         * the same and an id never moves. Built off the rows for the same reason
         * the engines list is — a mission started a minute ago is filterable
         * without anything anywhere being told about it.
         */
        function missionOptions() {
            const seen = Object.create(null);
            const out = [];
            rows.forEach(r => {
                const id = missionOf(r);
                if (!id) { return; }
                if (!seen[id]) { seen[id] = { v: id, t: missionName(r), ts: r.ts || 0 }; out.push(seen[id]); }
                else if ((r.ts || 0) > seen[id].ts) { seen[id].ts = r.ts || 0; }
            });
            return out.sort((a, b) => b.ts - a.ts).map(x => ({ v: x.v, t: x.t }));
        }
        /** How many of the listed rows a mission opened — what the 🎯 chip and
         *  its panel are counting when they say what is being left out. */
        function missionRowCount() {
            let n = 0;
            rows.forEach(r => { if (missionOf(r)) { n++; } });
            return n;
        }
        // Named projects first, Unassigned last — it is a leftover, not a project.
        function projectNames() {
            const names = [];
            rows.forEach(r => { const p = projectOf(r); if (names.indexOf(p) < 0) { names.push(p); } });
            return names.sort((a, b) => a === UNASSIGNED ? 1 : b === UNASSIGNED ? -1 : a.localeCompare(b));
        }

        /**
         * ‼️ X-33 — THE FILTER ROW GETS THE SAME HOVERS THE TABLE DOES.
         *
         * The rows below this panel carry rich, repaint-proof panels; the panel
         * itself carried thin native `title`s — and several of its controls (the
         * range boxes, the date range) carried NOTHING AT ALL. Worse, this whole
         * block is rewritten on every filter change, and a browser does not put
         * `:hover` back on the node that replaced the one the pointer was on: a
         * native tooltip you were reading simply vanished and did not return.
         * `AFTip` bridges exactly that (media/afTip.js), so every explanation
         * here goes through it — and the range boxes say what the column MEANS
         * plus what is currently set, which is the figure a reader wants.
         */
        const ftip = (trigger, head, body, cls) => window.AFTip.wrap(trigger, head, body, cls);

        function filterPanelHtml() {
            if (!filtersOpen) { return ''; }
            const agents = agentNames();
            const engines = engineNames();
            const flag = (cls, label, on, head, body) => ftip(
                `<button class="chip ${cls}${on ? ' on' : ''}">${label}</button>`, head, body);
            const RANGE_TIP = {
                tokens: 'Every token the session moved — input, output and cache alike. The ⚖ column beside it is the same session measured against the plan limit.',
                cost: 'What the session cost in dollars, from the pricing rules. A subscription engine reports no dollar figure and is honestly 0.',
                ctx: 'How much context was in the window after the last reply — "how full was it when this stopped".',
                duration: 'Wall clock from the first message to the last, in minutes. Not time spent working.',
                turns: 'How many prompts a person (or a launcher) sent. A turn is one ask and everything the agent did to answer it.',
                tools: 'Every tool call the session made across all of its turns.',
                errors: 'Tool calls that came back as errors.'
            };
            const ranges = FRANGES.map(k => {
                const rg = filters.ranges[k.id] || {};
                const set = rg.min !== undefined || rg.max !== undefined
                    ? `Now: ${rg.min !== undefined ? rg.min : '—'} to ${rg.max !== undefined ? rg.max : '—'}`
                    : 'Now: no limit';
                return ftip(`<label class="af-frange">${k.label}
                    <input type="number" class="af-fr-${k.id}-min" placeholder="min" value="${rg.min !== undefined ? rg.min : ''}">–<input type="number" class="af-fr-${k.id}-max" placeholder="max" value="${rg.max !== undefined ? rg.max : ''}">
                </label>`, k.label, `${set}\n\n${RANGE_TIP[k.id] || ''}\n\nEither end may be left empty — a min with no max means "at least this much".`);
            }).join('');
            const categories = CATEGORIES.map(o => ftip(
                `<button class="chip af-cat-${o.id}${filters[o.key] ? ' on' : ''}" aria-pressed="${filters[o.key]}" aria-label="Show ${o.label} sessions">${o.glyph} ${o.label}</button>`,
                `${o.glyph} ${o.label} — ${filters[o.key] ? 'ON: listed' : 'OFF: hidden'}`,
                `${o.tip}. Pressing this changes only ${o.label}; the other two categories keep their state.`)).join('');
            // ‼️ S-35 — headless is not a fourth category. It narrows the Auto
            // and Mission rows that are on by dropping runs with no terminal.
            // It never changes any of their category switches.
            const headlessChip = ftip(
                `<button class="chip af-fhless${filters.headless ? ' on' : ''}">${HLESS_GLYPH} Headless</button>`,
                `${HLESS_GLYPH} Headless — ${filters.headless ? 'ON: headless runs are listed' : 'OFF: headless runs are hidden'}`,
                'A headless run is automation with no terminal behind it — a `claude -p` started by a schedule, a trigger, a task or a mission, with nobody at the keyboard. '
                + 'An automation run launched in interactive mode opened a real terminal and is NOT headless, which is the difference this chip lets you see.\n\n'
                + 'Press to drop them from whichever automation categories are on. It changes no category switch and nothing under 🧑 You.');
            /**
             * ‼️ X-95 — THE MISSION ROW OF THE PANEL, and it is a row of its own
             * rather than another box in the flags line, because it carries the
             * picker answers only WHICH missions inside the Mission category.
             * Whether that category is visible belongs to the same 🎯 switch
             * above and nowhere else.
             */
            const misN = missionRowCount();
            const misOpts = missionOptions();
            const misState = filters.missions === null ? 'every mission'
                : !filters.missions.length ? 'none selected'
                    : filters.missions.length + ' of ' + misOpts.length;
            const missionRow = !misN ? '' : `<div class="af-frow">
                    ${ftip(`<span class="muted small">${MISSION_GLYPH} Missions:</span>`,
                `${MISSION_GLYPH} Mission sessions — ${misState}`,
                'This picker narrows the Mission category; it never turns You or Auto on or off. Classic and adaptive missions use the same stamp and both appear here.\n\n'
                + `${misN} of the ${rows.length} sessions in this pool were opened by a mission. Tick the ones eligible when the 🎯 Mission switch is on.`)}
                    ${window.AFFilter.multi({
                    id: MISSION_MS, label: 'Missions', options: misOpts, selected: filters.missions,
                    allLabel: 'every mission',
                    title: 'Which mission runs are eligible when 🎯 Mission is on. Each is listed by title and matched by run id, so two missions with the same name never merge.'
                })}
                </div>`;
            const dateSet = filters.from || filters.to
                ? `Now: ${filters.from || 'the beginning'} → ${filters.to || 'today'}`
                : 'Now: every date';
            return `<div class="af-fpanel">
                <div class="af-frow">
                    ${ftip('<span class="muted small">Show:</span>', 'Visible session categories',
                'Three independent switches: You, automation outside missions, and mission runs. Any combination is valid; one never changes another.\n\n'
                + '🌙 Headless then narrows the automation categories without changing these switches.')}${categories}<span class="af-fsep"></span>${headlessChip}
                </div>
                ${missionRow}
                <div class="af-frow">
                    ${ftip(`<input type="text" class="af-ftext" placeholder="title, agent, label or id…" value="${C.esc(filters.text)}">`,
                'Filter the rows', window.AFQuery.tip('Searched against the session title, its agent, its labels — and its SESSION ID, so the eight-character prefix printed everywhere finds the row it names.'))}
                    ${hasAgentCol && agents.length > 1 ? window.AFFilter.multi({
                    id: AGENT_MS, label: 'Agents', options: agents, selected: filters.agents,
                    title: 'Which agents to list — tick any combination'
                }) : ''}
                    ${engines.length > 1 ? window.AFFilter.multi({
                    id: ENGINE_MS, label: 'Engines', options: engines, selected: filters.engines,
                    title: 'Which CLI ran the session — combines with every other filter here',
                    // ‼️ U-52 — "everything that is not the default" is the
                    // question a four-engine list is read with, and it is the
                    // one subset here that has a name. Claude on its own is a
                    // single option, which a click on its name already gives
                    // you; only offered once there is more than one other
                    // engine, or the preset would be a slower way to click one
                    // row.
                    presets: engines.filter(e => e !== window.AFEngine.label('claude')).length > 1
                        ? [{
                            id: 'notclaude', label: 'Other engines',
                            values: engines.filter(e => e !== window.AFEngine.label('claude')),
                            title: 'Everything that did not run on the default engine.'
                        }] : []
                }) : ''}
                    ${projectNames().length > 1 ? window.AFFilter.multi({
                    id: PROJECT_MS, label: 'Projects', options: projectNames(), selected: filters.projects,
                    title: 'Which projects to list — manage them on the ◧ Projects page'
                }) : ''}
                    ${flag('af-factive', 'Active now', filters.activeOnly, 'Active now',
                    'Only sessions with a live process working right now — the ● in the first column.')}
                    ${flag('af-ferrors', 'Has errors', filters.errorsOnly, 'Has errors',
                    'Only sessions with at least one tool error. Pair it with a Tools range to find where a session fought the same call over and over.')}
                    ${flag('af-fmain', 'Main only', filters.mainOnly, 'Main only',
                    'Hide the subagent (sidechain) transcripts — the lanes an agent opened by handing work to another agent.')}
                    ${flag('af-fpin', '★ Pinned', filters.pinnedOnly, 'Pinned only',
                    'Only the sessions on your shelf. Pinned rows are listed first everywhere and are never cut by a row limit.')}
                </div>
                <div class="af-frow">${ranges}
                    ${ftip(`<label class="af-frange">When <input type="date" class="af-ffrom" value="${C.esc(filters.from)}">–<input type="date" class="af-fto" value="${C.esc(filters.to)}"></label>`,
                    'When', `${dateSet}\n\nThe window is the session's own last-activity date, and both ends are included — a single day means that whole day. Leave an end empty for an open one.`)}
                    ${ftip('<button class="chip af-fclear">Clear</button>', 'Clear',
                        'Reset every filter in this panel and the three category switches to their fresh-table state: You on, Auto and Mission off. The sort order and row count are left alone.', 'tip-right')}</div>
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
        /** ‼️ S-32 — the row whose figures were NOT READ. A transcript over the
         *  scan ceiling used to drop the whole session out of the index; it is
         *  listed now, so the one thing it must never look like is a session
         *  that ran and did nothing. Figures only in the native title.
         *
         *  It rides on the TITLE cell in every embedding, unlike `sub` which
         *  follows the identity column: the Agent column is the narrowest on
         *  the page and a second badge there cuts the agent's own name. */
        const mb = n => `${Math.round(n / 1048576 * 10) / 10} MB`;
        const unreadBadge = r => (r.scanLimit
            ? ` <span class="badge warn" title="Transcript ${mb(r.scanLimit.bytes)} · scan limit ${mb(r.scanLimit.limit)}">unread</span>`
            : '');
        /** …and the same fact in words, for the panels that explain a zero. */
        const unreadLine = r => (r.scanLimit
            ? `transcript ${mb(r.scanLimit.bytes)}, above the ${mb(r.scanLimit.limit)} scan limit`
            : '');
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
        const stamp = ts => (ts ? window.AFTime.full(ts) : '');
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
                // ‼️ X-95 — a mission's row says WHICH mission on its first
                // line. "Automation" was true and useless: the answer a reader
                // wants off this glyph is which of the things running on this
                // machine this session belongs to.
                line('Started by', missionOf(r)
                    ? `${MISSION_GLYPH} Mission — ${missionName(r)}`
                    : originOf(r) === 'auto'
                        ? (r.headless ? '🤖🌙 Automation · headless' : '🤖 Automation') : '🧑 You'),
                line('Mission run', missionOf(r)),
                // S-35 — said in words as well as in the glyph, because the two
                // robot rows differ in what you can still do with them: a
                // headless run had no terminal and nobody at it.
                line('Ran', originOf(r) === 'auto'
                    ? (r.headless ? 'headless — no terminal, nobody at the keyboard'
                        : 'in a terminal a person could type in') : ''),
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
                // ‼️ S-32 — a zero that was never measured says so FIRST, before
                // the reader takes the rest of the panel for figures.
                line('Not read', unreadLine(r)),
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
                // ‼️ THE WINDOW IS THE ENGINE'S, NOT CLAUDE'S (X-35). This line
                // read "Of a 200k window" on every row of a table that shows
                // four engines — a measured Codex thread runs against 258 400.
                // The host resolves the ceiling per row (see windowOf); zero
                // means nobody stated one, and then there is no fraction to
                // print rather than a wrong one.
                line(r.ctxWindow ? `Of its ${C.fmtTok(r.ctxWindow)} window` : 'Window',
                    r.ctx && r.ctxWindow ? `${pct(r.ctx, r.ctxWindow)}%`
                        : r.ctx ? 'this engine does not state one' : ''),
                line('Session raw total', C.fmtTok(r.tokens || 0)),
                line('Share of the total', r.ctx && r.tokens ? `${pct(r.ctx, r.tokens)}%` : ''),
                line('Per turn', per(r.tokens, r.turns, n => C.fmtTok(Math.round(n)))),
                line('Turns', r.turns || 0),
                line('Last activity', `${stamp(r.ts)} · ${relTime(r.ts)}`),
                line('State', r.active ? 'running' : 'idle')
            ],
            cost: r => [
                line('Not read', unreadLine(r)),
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
        // The Engine cell's hover, figures only (CONVENTIONS → a cell hover is
        // `Label: value`, never an explanation — the definition is on the <th>).
        TIP.engine = r => [
            line('Engine', window.AFEngine.label(r.engine)),
            line('Models', modelNames(r).join(', ')),
            line('Transcript', r.file ? 'on disk' : 'none this build can open'),
            line('Cost reported', r.cost ? C.fmtUSD(r.cost) : 'no — plan or account billing'),
            line('Tokens', r.tokens ? C.fmtTok(r.tokens) : 'not published by this CLI')
        ];

        const TIPBOX = {
            title: r => {
                const prompt = String(r.firstPrompt || '');
                const facts = [
                    line('Session', r.sessionId),
                    line('Transcript not read', unreadLine(r)),
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
            origin: '<th class="origcell" title="Who started the session: 🧑 you · 🤖 automation · ' + MISSION_GLYPH + ' a mission (hover the cell for which one) · 🌙 beside the robot = headless, it ran with no terminal and nobody at it">By</th>',
            agent: '<th title="Agent whose folder the session ran in. ● running · sub = sub-agent · ⌨ terminal · ⎋ interrupt">Agent</th>',
            // ‼️ WHICH ENGINE RAN IT — the column this table never had. Four
            // engines write sessions now and the table listed them as if they
            // were one, so "why did that one cost nothing" had no answer on
            // the row. The badge and its colour come from AFEngine, the same
            // ones the Console and the Engines page draw.
            engine: '<th title="Which CLI ran the session: ' + window.AFEngine.names() + '">Engine</th>',
            project: '<th title="Project this session\'s work belongs to">Project</th>',
            files: '<th class="num" title="Distinct files written to (Edit / Write / MultiEdit / NotebookEdit)">Files</th>',
            title: '<th title="Session name — the launch name (-n) or a rename, otherwise what the conversation suggests. unread = transcript above the scan limit, its figures were not read">Title</th>',
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
                // ‼️ X-95 — a mission's session is drawn as ITS OWN THING and
                // never as 🧑 or 🤖. It is not a decoration on top of the origin
                // glyph: the whole point is that one look at this column tells
                // the three kinds of row apart, and a moon beside a robot on a
                // mission row would be saying something about a lane nobody can
                // type into anyway.
                if (missionOf(r)) {
                    return `<td class="origcell mission" title="${tipOf(TIP.origin(r))}">${MISSION_GLYPH}</td>`;
                }
                const o = CATEGORIES.find(x => x.id === originOf(r)) || CATEGORIES[0];
                // S-35 — the moon rides on the robot, touching it: two glyphs
                // side by side are ONE fact about one run, not two columns.
                const moon = isHeadless(r) ? `<span class="hgl">${HLESS_GLYPH}</span>` : '';
                return `<td class="origcell ${o.id}${moon ? ' hless' : ''}" title="${tipOf(TIP.origin(r))}">${o.glyph}${moon}</td>`;
            },
            agent: r => `<td title="${tipOf(TIP.agent(r))}"><span class="cellline">${dot(r)}<span class="ctext">${C.esc(r.agent)}</span>${subBadge(r)}${termBtn(r)}${stopBtn(r)}</span></td>`,
            engine: r => `<td title="${tipOf(TIP.engine(r))}">${window.AFEngine.badge(r.engine)}</td>`,
            // ‼️ The title cell hands its hover to the rich panel: the answer to
            // "what was this session actually asked to do" is the opening
            // PROMPT, whole, and a native tooltip cannot hold one.
            title: r => {
                const b = TIPBOX.title(r);
                const inner = '<span class="cellline">' + (hasAgentCol
                    ? `<span class="ctext">${C.esc(r.title)}</span>${tagChips(r)}${unreadBadge(r)}`
                    : `${dot(r)}<span class="ctext">${C.esc(r.title)}</span>${tagChips(r)}${subBadge(r)}${unreadBadge(r)}${termBtn(r)}${stopBtn(r)}`)
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
                // The shared mark (media/afProject.js) — same dot, same icon,
                // same colour as the notices board, the queue and the project
                // page. `name` is what this table carries; the component takes
                // the same shape a project row has.
                const inner = r.project
                    ? window.AFProject.badge({
                        name: r.project, color: r.projectColor, icon: r.projectIcon
                    })
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
                <tr><th class="num" title="Turn number within the session">#</th><th title="The prompt that opened the turn">prompt</th><th title="Model(s) that served the turn">model</th><th class="num" title="${C.esc(C.STEPS_TIP)}">steps</th><th class="num" title="Prompt to the turn's last recorded line">took</th><th class="num" title="Raw tokens; after ⚖ weighted against the plan limit">tokens</th><th class="num" title="What the turn cost. An engine that publishes a price per turn states its own figure; where none is published this is the API-equivalent of the tokens at your agentFarm.pricing rates — good for comparing runs, never a bill.">cost</th><th class="num" title="Context in the window when the turn ended">ctx</th></tr>
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
            /**
             * ‼️ THE THREE PERMANENT SWITCHES SAY THE WHOLE CATEGORY STATE AT A
             * GLANCE. Icon only in the dense toolbar; the AFTip opens with the
             * current ON/OFF answer and names exactly what the one press changes.
             */
            const misN = missionRowCount();
            const categoryChips = CATEGORIES.map(o => {
                const extra = o.id === 'mission'
                    ? `\n\n${misN} of ${rows.length} sessions in this pool carry a mission stamp. `
                        + (filters.missions === null ? 'Every mission is eligible.'
                            : `${filters.missions.length} mission run(s) are selected in Filters.`)
                    : '';
                return ftip(
                    `<button class="chip af-cat-${o.id}${filters[o.key] ? ' on' : ''}" aria-pressed="${filters[o.key]}" aria-label="Show ${o.label} sessions">${o.glyph}</button>`,
                    `${o.glyph} ${o.label} — ${filters[o.key] ? 'ON: listed' : 'OFF: hidden'}`,
                    `${o.tip}. Press to turn only this category ${filters[o.key] ? 'off' : 'on'}; the other two keep their state.${extra}`);
            }).join('');
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
                ${categoryChips}
                <button class="chip af-filter${nf ? ' on' : ''}" title="Filter the sessions by category, text, agent, flags, ranges and dates">Filters${nf ? ` (${nf})` : ''}</button>
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
            // ---- three category switches, each touching only its own boolean.
            // The same controls are mirrored inside the open filter panel, so
            // wire every copy rather than whichever querySelector finds first.
            CATEGORIES.forEach(o => {
                root.querySelectorAll(`.af-cat-${o.id}`).forEach(btn => btn.addEventListener('click', () => {
                    filters[o.key] = !filters[o.key];
                    saveState();
                    renderSection();
                }));
            });
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
                wireEl('.af-fhless', 'click', () => { filters.headless = !filters.headless; apply(); });
                liveEl('.af-ftext', el => { filters.text = el.value || ''; apply(); });
                // the ✕ that empties it — the shared control (common.css .af-clr)
                window.AFFilter.clearableAll(root, '.af-ftext', el => { filters.text = ''; el.value = ''; apply(); });
                window.AFFilter.wireMulti({
                    root, id: AGENT_MS,
                    onChange: sel => { filters.agents = sel; apply(); }
                });
                window.AFFilter.wireMulti({
                    root, id: ENGINE_MS,
                    onChange: sel => { filters.engines = sel; apply(); }
                });
                window.AFFilter.wireMulti({
                    root, id: PROJECT_MS,
                    onChange: sel => { filters.projects = sel; apply(); }
                });
                window.AFFilter.wireMulti({
                    root, id: MISSION_MS,
                    onChange: sel => { filters.missions = sel; apply(); }
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

        /** Scope the table to one project without changing what categories the
         *  reader chose to show. Project and category are independent axes. */
        function setProjectFilter(name) {
            filters.projects = name ? [name] : null;
            filtersOpen = true;
            saveState();
            renderSection();
        }

        /**
         * ‼️ X-95 — SCOPE THE TABLE TO ONE MISSION. What the Sessions button on
         * a mission's own page opens. This deliberate deep-link means exactly
         * that mission and nothing else, so it sets the three category booleans
         * explicitly; ordinary category clicks remain independent.
         */
        function setMissionFilter(id) {
            filters.missions = id ? [id] : null;
            filters.showUser = !id;
            filters.showAuto = !id;
            filters.showMission = !!id;
            // …and the panel is opened, so the reader can SEE the named mission
            // selection behind the category switch.
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

        return { setRows, onMessage, setProjectFilter, setMissionFilter };
    }

    window.AFSessionsTable = { SORTS, create };
})();
