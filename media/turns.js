// Agent Farm — Turns page script: every user turn across the farm, one row per
// turn. Same control set as the Sessions tables (sort box, Show box, fold
// accordion, single-open, filter panel), adapted to turns: the turn's opening
// prompt is the row's identity, the session it belongs to is a short column
// with the full title in the tooltip, and the filter panel carries TWO text
// boxes — one over turn prompts, one over session titles. An unfolded turn
// shows its real messages, filtered by the same Show chips the session viewer
// uses (Dialog by default) — what you want to read is your choice, not ours.
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    if (window.AFChainNav) { window.AFChainNav.wireOpen(vscode); }
    const C = window.AFCharts;
    let DATA = window.__DATA__;

    const SORTS = [
        { id: 'recent', label: 'Recent', key: r => r.ts || 0 },
        { id: 'cost', label: 'Cost', key: r => r.cost || 0 },
        { id: 'tokens', label: 'Tokens', key: r => r.tokens || 0 },
        { id: 'duration', label: 'Duration', key: r => r.durationMs || 0 },
        { id: 'tools', label: 'Tools', key: r => r.tools || 0 },
        { id: 'errors', label: 'Errors', key: r => r.errors || 0 },
        { id: 'turnno', label: 'Turn #', key: r => r.n || 0 }
    ];

    const FRANGES = [
        { id: 'tokens', label: 'Tokens', get: r => r.tokens || 0 },
        { id: 'cost', label: 'Cost $', get: r => r.cost || 0 },
        { id: 'duration', label: 'Duration', get: r => r.durationMs || 0 },
        { id: 'tools', label: 'Tools', get: r => r.tools || 0 },
        { id: 'errors', label: 'Errors', get: r => r.errors || 0 },
        { id: 'turnno', label: 'Turn #', get: r => r.n || 0 }
    ];
    // ‼️ U-191 — THE SESSIONS TABLE'S FOUR CATEGORIES, not a scope of its own
    // (media/afRunCategory.js): same switches, same defaults, host's verdict.
    const RC = window.AFRunCategory;

    // agents / engines / models: null = all (no filter, so one appearing later
    // is in by itself); an array = exactly that subset, [] = none. `engines` has
    // the same shape for the same reason as in the sessions tables (X-27/X-35): a
    // build that learns about a fifth engine must list its turns without anybody
    // touching this default. See afFilters.js.
    // ‼️ X-111 — `providers` and `profiles` are the run's ROUTE, a second axis
    // from `engines` (X-110): a Claude turn served through Kimi is Engine
    // Claude, Provider Kimi. What a turn's providers ARE is decided on the host
    // by the one rule (media/afRunFilter.js → TurnRow.providers): the turn's
    // own report when it made one, else its session's route — which is how
    // "only Kimi" finds the Claude-via-Kimi turns that never name Kimi.
    const FDEF = () => ({
        text: '', session: '', agents: null, engines: null, models: null,
        showUser: true, showBaton: true, showAuto: false, showMission: false, headless: true,
        providers: null, profiles: null, chains: null, missions: null, projects: null,
        activeOnly: false, errorsOnly: false, mainOnly: false,
        from: '', to: '', ranges: {}
    });
    const UNASSIGNED = 'Unassigned'; // the host's and the Sessions table's word for "no project"

    // Which engine ran the row, said the way the badge says it. A row with no
    // `engine` is a Claude transcript — the field is an ABSENCE there, which is
    // exactly why the page could not print "Claude" until this line existed.
    const engineLabel = r => window.AFEngine.label(r.engine || 'claude');
    const RF = window.AFRunFilter;
    /**
     * ‼️ X-110 — the provider chip for ONE turn, off what the engine itself
     * reported for it. Absent on every engine that publishes none (Claude, for
     * ever), which is the ordinary answer and draws nothing; a turn the engine
     * says two things about is counted rather than named, because naming one of
     * them over a turn that used both is the lie the component exists to stop.
     */
    const providerMark = r => window.AFProvider.chip({
        providerId: '', reportedProviderIds: r.providerIds || [],
        multiProvider: (r.providerIds || []).length > 1
    }, '', window.AFProvider.CARD_MAX);

    // Content filter of an unfolded turn — the session viewer's chip set, same
    // semantics: empty selection = show everything; "Errors" matches the flag,
    // not a role. Dialog (you + the agent) is the default: the conversation is
    // what you came to read, tool traffic is one chip away. The AI side is
    // labelled "Agent", never "Assistant" — these are agents (core/speaker.ts).
    const ROLE_CHIPS = [
        { id: 'user', label: '🧑 User', match: m => m.role === 'user' },
        { id: 'assistant', label: '🤖 Agent', match: m => m.role === 'assistant' },
        { id: 'tool', label: '🔧 Tool calls', match: m => m.role === 'tool' },
        { id: 'toolResult', label: '📄 Results', match: m => m.role === 'toolResult' },
        { id: 'error', label: '⚠ Errors', match: m => m.isError }
    ];
    const ROLE_DEFAULT = ['user', 'assistant'];

    // Visible column order — origin first (one narrow glyph strip to scan),
    // Tokens right after Model, next to the figures that explain it. HEAD/CELL
    // are keyed so the order lives in ONE list.
    // ‼️ `engine` SITS BESIDE `agent`, AS IT DOES IN THE SESSIONS TABLES (X-35).
    // This page unrolls the whole farm one row per turn and could not say which
    // engine ran any of them — and once a Codex turn appears beside a Claude one,
    // "which agent" stops being enough to identify a row.
    const COLUMNS = ['origin', 'agent', 'engine', 'label', 'session', 'n', 'models', 'steps', 'tokens', 'ctx', 'when', 'took', 'duration', 'tools', 'errors', 'cost'];
    /**
     * ‼️ U-69 — HOW WIDE A COLUMN IS, DECIDED HERE.
     *
     * Same rule and the same mechanism as the sessions table (media/
     * sessionsTable.js → NARROW/SHARE): `table-layout: fixed` plus a colgroup,
     * because auto-layout makes every boundary a function of whatever rows are
     * listed — so the same table moved when a filter changed. The numbers are
     * chosen from what each column actually holds:
     *
     *   · a SHORT FIGURE MUST ALWAYS FIT. `186.4k`, `11m 0s`, `$0.610`, `14/14`
     *     and `22` are the whole point of the column; a number that has to be
     *     hovered for is a number the table failed to show.
     *   · Steps was the widest numeric column and did not need to be
     *     (`31api·84steps` is already the short form), while Tokens
     *     (`412.9k ⚖ 168.3k`) was narrower than its own value.
     *   · every header must read: a column captioned `Dur…` is worse than a
     *     value cut by one character.
     *   · what is left goes to the prompt, which is the row's identity.
     */
    // px, not a share: these hold one glyph, and a share would grow them on a
    // wide monitor. `origin` is 30 because its HEADING is what has to fit — a
    // column captioned `B…` is worse than any value it could ever cut.
    const NARROW = { fold: 22, origin: 30 };
    /** Shares of the space the px columns leave behind, summing to 100 for the
     *  full set and re-normalised over any subset (see colgroupHtml). */
    const SHARE = {
        // ‼️ X-110 — Engine holds TWO marks now (the engine, and the provider the
        // engine named for this turn), so it is declared at what both need:
        // 6.0 → 10.2, and the 4.2 comes out of the prompt column, which is the
        // widest here by a factor of two and the only one that ellipsises by
        // design. Measured rather than guessed — at 6.0 the chip drew as `···`.
        agent: 9.0, engine: 10.2, label: 18.0, session: 8.5, n: 3.2, models: 8.0,
        steps: 6.6, tokens: 8.2, ctx: 4.4, when: 4.4, took: 4.0, duration: 5.0,
        tools: 3.4, errors: 2.8, cost: 4.3
    };
    function colgroupHtml(cols) {
        const total = cols.reduce((n, c) => n + (SHARE[c] || 0), 0) || 1;
        return '<colgroup>'
            + `<col style="width:${NARROW.fold}px">`
            + cols.map(c => (NARROW[c]
                ? `<col style="width:${NARROW[c]}px">`
                : `<col style="width:${((SHARE[c] || 0) / total * 100).toFixed(3)}%">`)).join('')
            + '</colgroup>';
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
        .foldcell { width:22px; }
        .origcell { width:20px; text-align:center; font-size:11px; line-height:1;
            opacity:.85; cursor:default; }
        .origcell.auto { opacity:.6; }
        /* U-191 — 🤖🌙 needs ~23px; the column is 30, so its side padding gives way */
        td.origcell { padding-left:2px; padding-right:2px; }
        table.turnstable td.origcell > .tcut { overflow:visible; text-overflow:clip; }
        .origcell.hless { opacity:.85; }
        .origcell .hgl { font-size:9px; margin-left:-1px; }
        .origcell.mission { opacity:1; }
        .fold { font-size:10px; padding:0 6px; line-height:16px; cursor:pointer; border-radius:3px;
            background:transparent; opacity:.7; border:1px solid var(--vscode-widget-border, #4444);
            color:var(--vscode-foreground); }
        .fold:hover { opacity:1; }
        tr.turnrow > td { background:color-mix(in srgb, var(--vscode-textLink-foreground) 8%, transparent);
            border-bottom-color:var(--vscode-widget-border, #4443); }
        tr.turnrow > td:first-child { box-shadow:inset 3px 0 0 color-mix(in srgb, var(--vscode-textLink-foreground) 45%, transparent); }
        tr.turnrow.open > td { background:color-mix(in srgb, var(--vscode-textLink-foreground) 18%, transparent); }
        tr.turnrow.open > td:first-child { box-shadow:inset 3px 0 0 var(--vscode-textLink-foreground); }
        tr.turnbody > td { padding-left:12px; }
        /* ‼️ U-69 — ONE LINE PER ROW, AND THE WIDTHS ARE DECIDED, NOT OBSERVED.
           The table laid itself out (table-layout: auto), so every column was
           as wide as whatever happened to be listed: Steps took room it did not
           need while Tokens got so little that the figure wrapped and the row
           grew a second line. Now the shares are declared (see SHARE), every
           cell is a single line, and anything that does not fit is cut at the
           column's own edge — the whole value is the first line of its hover,
           which is why cutting is safe here (docs/CONVENTIONS.md → Hover). */
        table.turnstable { table-layout:fixed; }
        table.turnstable td, table.turnstable th { white-space:nowrap; }
        /* ‼️ THE CUT IS ON AN INNER BLOCK, NEVER ON THE CELL. A hover panel is
           absolutely positioned INSIDE its cell, so overflow:hidden on the
           td clips the panel as well as the text — every hover on this table
           vanished the first time the cells clipped, and nothing said so. */
        table.turnstable td > .tcut { display:block; overflow:hidden; text-overflow:ellipsis; }
        /* S-134 - the line's ellipsis hid a long provider chip WHOLE (drawn as dots); the chip shortens itself instead */
        table.turnstable td.engcell > .tcut { display:flex; align-items:baseline; gap:2px; }
        table.turnstable td.engcell > .tcut > .af-prov { flex:0 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; }
        /* A header's own panel hangs under the header cell, so the cell is what
           it is measured against — the same trick AFTip.cell plays on a <td>. */
        table.turnstable th { position:relative; }
        /* The panel's caption line is normally a faded label over the figures it
           heads. Here it is the CELL ITSELF, spelled out because the column had
           to cut it — the one line the reader came for, so it is legible. */
        table.turnstable .af-tiph { font-size:12px; opacity:.9; }
        .sesscol { opacity:.8; }
        .tag { font-size:10px; padding:1px 6px; margin-right:4px; border-radius:8px; white-space:nowrap;
            background:var(--vscode-badge-background); color:var(--vscode-badge-foreground); opacity:.85; }
        .badge { font-size:10px; padding:1px 6px; border-radius:8px;
            border:1px solid var(--vscode-widget-border, #4444); opacity:.8; }
        /* the fold-open turn content */
        .turnbox { margin:4px 0 10px; font-size:12px; display:flex; flex-direction:column; gap:4px; }
        .tmsg { display:flex; gap:8px; align-items:baseline; }
        .trole { flex:none; width:64px; font-size:10px; opacity:.65; text-align:right; text-transform:uppercase; }
        .ttext { white-space:pre-wrap; word-break:break-word; }
        .tmsg.err .ttext { color:var(--af-ink-charts-red, var(--vscode-charts-red, #f14c4c)); }
        .tmsg.tool .ttext { opacity:.8; font-family:var(--vscode-editor-font-family, monospace); font-size:11px; }
        .tmsg.assistant .trole { color:var(--vscode-textLink-foreground); opacity:.9; }
        /* U-176 — on a phone a row is a card (media/afMobile.js): a figure sits beside its label */
        html.af-phone table.turnstable tr[data-afcard] > td > .af-tipw { display:inline-block; vertical-align:baseline; max-width:100%; }
        html.af-phone table.turnstable tr[data-afcard] > td.num { text-align:left; }
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

    // ---- persisted state ----
    const persisted = (typeof vscode.getState === 'function' && vscode.getState()) || {};
    const saved = persisted.afTurns || {};
    const DEFAULT_N = DATA.tableN || 200;
    let sort = SORTS.some(s => s.id === saved.sort) ? saved.sort : 'recent';
    let single = saved.single !== undefined ? !!saved.single : true;
    // U-191 — a page saved with the old `origin` scope ('' all · 'auto') reopens on the same rows.
    const was = Object.assign({}, saved.filters || {});
    const scope = was.origin;
    delete was.origin;
    if ((scope === '' || scope === 'auto') && was.showUser === undefined) {
        Object.assign(was, { showUser: scope === '', showAuto: true, showMission: true });
    }
    let filters = Object.assign(FDEF(), was);
    let filtersOpen = !!saved.filtersOpen;
    // A remembered row count is honored only while the built-in default is
    // unchanged — when a release moves the default, a stale saved value must
    // not silently keep the old one.
    let tableN = typeof saved.tableN === 'number' && saved.tableN >= 0 && saved.defaultN === DEFAULT_N
        ? saved.tableN : DEFAULT_N;
    let roleSel = new Set(Array.isArray(saved.roles) ? saved.roles : ROLE_DEFAULT);
    const open = new Set();
    const detailCache = {}; // key(file#n) -> { msgs|null } (null = in flight)
    let shown = [];

    function saveState() {
        if (typeof vscode.setState !== 'function') { return; }
        const st = (typeof vscode.getState === 'function' && vscode.getState()) || {};
        vscode.setState(Object.assign({}, st, {
            afTurns: { sort, single, filters, filtersOpen, tableN, defaultN: DEFAULT_N, roles: [...roleSel] }
        }));
    }

    const key = r => r.file + '#' + r.n;

    // ‼️ M-33 — A HOST PUSH WAITS FOR THE READER'S HANDS; THE PAGE'S OWN
    // RENDERS DO NOT. render() replaces the whole of #app, so a repaint that
    // arrives while somebody is typing detaches the box they are typing in and
    // the caret falls to <body> — where space IS Page Down. Full text, and
    // what a page-specific busy() is for: media/afRepaint.js.
    const repaint = window.AFRepaint.guard(render);
    window.addEventListener('message', ev => {
        // K-26 — the wiki tagger answers for itself (media/afWiki.js).
        if (window.AFWiki.receive(ev.data)) { return; }
        if (ev.data.type === 'turnDetail') {
            detailCache[ev.data.file + '#' + ev.data.n] = { msgs: ev.data.msgs || [] };
            render();
            return;
        }
        if (ev.data.type === 'data') {
            DATA = ev.data.data;
            // an active session's last turn keeps growing — drop its cached content
            for (const r of DATA.rows || []) {
                if (r.active && detailCache[key(r)]) { delete detailCache[key(r)]; }
            }
            repaint();
        }
    });

    // The four categories have their own always-visible switches, so they are
    // not counted here; 🌙 lives only in the panel, so hiding it IS counted.
    function activeFilterCount() {
        let n = (filters.text ? 1 : 0) + (filters.session ? 1 : 0) + (filters.agents ? 1 : 0)
            + (filters.headless ? 0 : 1)
            + (filters.engines ? 1 : 0) + (filters.providers ? 1 : 0) + (filters.profiles ? 1 : 0)
            + (filters.models ? 1 : 0) + (filters.activeOnly ? 1 : 0) + (filters.errorsOnly ? 1 : 0)
            + (filters.mainOnly ? 1 : 0) + (filters.from ? 1 : 0) + (filters.to ? 1 : 0)
            + ['chains', 'missions', 'projects'].filter(k => Array.isArray(filters[k])).length;
        FRANGES.forEach(k => {
            const rg = filters.ranges[k.id];
            if (rg) { n += (rg.min !== undefined ? 1 : 0) + (rg.max !== undefined ? 1 : 0); }
        });
        return n;
    }

    function filterRows(list) {
        // both boxes are QUERIES, not substrings — media/afQuery.js
        const text = window.AFQuery.compile(filters.text || '');
        const sess = window.AFQuery.compile(filters.session || '');
        return list.filter(r => {
            if (!text.empty && !text.test(r.label || '')) { return false; }
            if (!sess.empty && !sess.test(r.session || '')) { return false; }
            if (filters.agents && filters.agents.indexOf(r.agentName) < 0) { return false; }
            if (filters.engines && filters.engines.indexOf(engineLabel(r)) < 0) { return false; }
            if (filters.projects && filters.projects.indexOf(r.project || UNASSIGNED) < 0) { return false; }
            if (!RC.passes(filters, r)) { return false; }
            // X-111 — the three route axes, by the one rule (AND with the rest).
            if (!RF.matchesAny(r.providers, filters.providers)) { return false; }
            if (!RF.matchesAny([r.profile].filter(Boolean), filters.profiles)) { return false; }
            if (!RF.matchesAny(r.models, filters.models)) { return false; }
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

    /** The agent / engine / model values present in the pool — the pickers' options. */
    function filterFacets() {
        const rows = DATA.rows || [];
        const agents = [], models = [], engines = [];
        rows.forEach(r => {
            if (r.agentName && agents.indexOf(r.agentName) < 0) { agents.push(r.agentName); }
            const e = engineLabel(r);
            if (e && engines.indexOf(e) < 0) { engines.push(e); }
            (r.models || []).forEach(m => { if (models.indexOf(m) < 0) { models.push(m); } });
        });
        // Claude first — the default and the longest lane — then the rest
        // alphabetically. Built off the ROWS, not a fixed list of four: an id
        // this build has never heard of still gets a badge, so it must still get
        // a line in the picker it would otherwise be unfilterable behind. Same
        // rule, same order as the sessions tables (media/sessionsTable.js).
        const claude = window.AFEngine.label('claude');
        return {
            agents: agents.sort(), models: models.sort(),
            engines: engines.sort((a, b) =>
                a === claude ? -1 : b === claude ? 1 : a.localeCompare(b)),
            // X-111 — off the rows, like the rest: a route that appears
            // tomorrow is filterable without a list being told.
            providers: RF.options(rows.map(r => r.providers), v => window.AFProvider.label(v), 'no route'),
            profiles: RF.options(rows.map(r => [r.profile].filter(Boolean)), null, 'no profile'),
            // named projects first, Unassigned last — the Sessions table's order
            projects: [...new Set(rows.map(r => r.project || UNASSIGNED))]
                .sort((a, b) => a === UNASSIGNED ? 1 : b === UNASSIGNED ? -1 : a.localeCompare(b))
        };
    }

    function filterPanelHtml() {
        if (!filtersOpen) { return ''; }
        const facets = filterFacets();
        const agents = facets.agents, models = facets.models;
        const flag = (cls, label, on, tip) =>
            `<button class="chip ${cls}${on ? ' on' : ''}" title="${tip}">${label}</button>`;
        const ranges = FRANGES.map(k => {
            const rg = filters.ranges[k.id] || {};
            return `<label class="af-frange">${k.label}
                <input type="number" class="af-fr-${k.id}-min" placeholder="min" value="${rg.min !== undefined ? rg.min : ''}">–<input type="number" class="af-fr-${k.id}-max" placeholder="max" value="${rg.max !== undefined ? rg.max : ''}">
            </label>`;
        }).join('');
        return `<div class="af-fpanel">
            <div class="af-frow">${RC.showRow(filters, DATA.rows || [], 'turns')}</div>
            ${RC.subRow(filters, DATA.rows || [], 'turns', 'turns')}
            <div class="af-frow">
                <input type="text" class="af-ftext af-fturn" placeholder="turn contains…" value="${C.esc(filters.text)}"
                    title="${C.esc(window.AFQuery.tip("Searched against the turn's opening prompt."))}">
                <input type="text" class="af-ftext af-fsess" placeholder="session contains…" value="${C.esc(filters.session)}"
                    title="${C.esc(window.AFQuery.tip('Searched against the title of the session the turn belongs to.'))}">
                ${agents.length > 1 ? window.AFFilter.multi({
                    id: 'turns-agents', label: 'Agents', options: agents, selected: filters.agents,
                    title: 'Which agents\' turns to list — tick any combination'
                }) : ''}
                ${facets.engines.length > 1 ? window.AFFilter.multi({
                    id: 'turns-engines', label: 'Engines', options: facets.engines, selected: filters.engines,
                    title: 'Which engines\' turns to list — tick any combination',
                    // ‼️ U-52 — the same named subset, in the same words, as the
                    // sessions tables and the Runs table: a four-engine list is
                    // read with "everything that is not the default". Only once
                    // there is more than one of them, or it is a slower way to
                    // click a single row.
                    presets: facets.engines.filter(e => e !== window.AFEngine.label('claude')).length > 1
                        ? [{
                            id: 'notclaude', label: 'Other engines',
                            values: facets.engines.filter(e => e !== window.AFEngine.label('claude')),
                            title: 'Everything that did not run on the default engine.'
                        }] : []
                }) : ''}
                ${facets.projects.length > 1 ? window.AFFilter.multi({
                    id: 'turns-projects', label: 'Projects', options: facets.projects, selected: filters.projects,
                    title: 'Which projects\' turns to list — a turn belongs to its session\'s project; manage them on the ◧ Projects page'
                }) : ''}
                ${facets.providers.length > 1 ? window.AFFilter.multi({
                    id: 'turns-providers', label: 'Providers', options: facets.providers, selected: filters.providers,
                    title: 'Which ROUTE served the turn — a second axis from Engines: a Claude turn through Kimi is Engine Claude, Provider Kimi. A turn that named no provider (every Claude turn) counts under its session\'s route; "no route" is the turns on none.'
                }) : ''}
                ${facets.profiles.length > 1 ? window.AFFilter.multi({
                    id: 'turns-profiles', label: 'Profiles', options: facets.profiles, selected: filters.profiles,
                    title: 'Which stored route profile the turn\'s session was launched on — Claude routes only.'
                }) : ''}
                ${models.length > 1 ? window.AFFilter.multi({
                    id: 'turns-models', label: 'Models', selected: filters.models,
                    options: models.map(m => ({ v: m, t: m.replace(/^claude-/, '') })),
                    title: 'Which models to list — tick any combination'
                }) : ''}
                ${flag('af-factive', 'Active now', filters.activeOnly, 'Only turns of sessions with a live terminal working right now')}
                ${flag('af-ferrors', 'Has errors', filters.errorsOnly, 'Only turns with at least one tool error')}
                ${flag('af-fmain', 'Main only', filters.mainOnly, 'Hide turns of subagent (sidechain) sessions')}
            </div>
            <div class="af-frow">${ranges}
                <label class="af-frange">When <input type="date" class="af-ffrom" value="${C.esc(filters.from)}">–<input type="date" class="af-fto" value="${C.esc(filters.to)}"></label>
                <button class="chip af-fclear" title="Reset every filter">Clear</button></div>
        </div>`;
    }

    function ensureDetail(r) {
        const k = key(r);
        if (detailCache[k]) { return; }
        detailCache[k] = { msgs: null };
        vscode.postMessage({ type: 'turnDetail', file: r.file, n: r.n });
    }

    // AI rows are labelled from the message's model (data-derived — see the
    // assistant branch in turnBodyHtml); the rest are fixed role words.
    const ROLE_LABEL = { user: 'user', tool: 'tool', toolResult: 'result', system: '' };

    /** Show-chip test. The 'system' role is our own "… N more messages" note —
     *  it is a statement about the data, so no filter may hide it. */
    function matchesRole(m) {
        if (m.role === 'system') { return true; }
        if (!roleSel.size) { return true; }
        return ROLE_CHIPS.some(c => roleSel.has(c.id) && c.match(m));
    }

    function turnBodyHtml(r) {
        const c = detailCache[key(r)];
        if (!c || c.msgs === null) { return '<span class="muted small">Loading turn content…</span>'; }
        if (!c.msgs.length) { return '<span class="muted small">No content recorded for this turn.</span>'; }
        const msgs = c.msgs.filter(matchesRole);
        if (!msgs.length) {
            return `<span class="muted small">This turn has ${c.msgs.length} message(s), none of them matching the Show filter above.</span>`;
        }
        return `<div class="turnbox">${msgs.map(m => {
            const cls = (m.isError ? 'err ' : '') + (m.role === 'tool' ? 'tool' : m.role === 'assistant' ? 'assistant' : '');
            const body = m.role === 'tool'
                ? `${C.esc(m.tool)} ${C.esc((m.input || '').replace(/\s+/g, ' ').slice(0, 160))}`
                : C.esc(m.text || '');
            const base = m.role === 'assistant'
                ? C.aiLabel(m.model, false)
                : (ROLE_LABEL[m.role] !== undefined ? ROLE_LABEL[m.role] : m.role);
            const roleTxt = base + (m.sidechain ? ' ·sub' : '');
            return `<div class="tmsg ${cls}"><span class="trole">${C.esc(roleTxt)}</span><span class="ttext">${body}</span></div>`;
        }).join('')}</div>`;
    }

    const dot = r => r.active ? '<span class="dot on" title="Active now"></span> ' : '';
    const subBadge = r => r.sidechain ? ' <span class="badge">sub</span>' : '';
    const termBtn = r =>
        ` <button class="fold" data-term="${C.esc(r.agentName || '')}" data-sid="${C.esc(r.sessionId || '')}" data-cwd="${C.esc(r.cwd || '')}" title="Jump to this session's terminal window (if one is open)">⌨</button>`;

    /**
     * ‼️ SAME RULE AS THE SESSIONS TABLE (docs/CONVENTIONS.md → Hover): the
     * heading defines the column once, and a cell hover is `Label: value` lines
     * — figures, never a sentence. Everything below comes off the row the page
     * already has; nothing here asks the host a second question.
     *
     * ‼️ AND NOT THE SAME LINES ON EVERY CELL (U-69). One readout of the whole
     * turn used to be pasted onto twelve of them, so the answer to "what is
     * this number" was the same twenty lines wherever you pointed — which is
     * the hover this page's own conventions exist to prevent. Each column now
     * answers for itself, in CELL below.
     */
    const line = (k, v) => (v === '' || v === undefined || v === null ? '' : `${k}: ${v}`);
    const round1 = n => Math.round(n * 10) / 10;
    const pctOf = (n, of) => (of > 0 ? Math.round(n / of * 100) + '%' : '');
    const stamp = ts => (ts ? window.AFTime.full(ts) : '');

    /**
     * ‼️ U-69 — A COLUMN IS DEFINED ONCE, ON ITS HEADING, AND IN THE PANEL.
     *
     * These definitions are sentences, and a sentence in a native `title` is cut
     * wherever the platform likes — which is how a paragraph explaining what
     * `31api·84steps` means ended up unreadable on the one column that needs
     * explaining (docs/CONVENTIONS.md → Hover). The head is the column's full
     * name, so a heading the width had to shorten still says what it is.
     */
    const th = (cls, label, name, def) =>
        `<th${cls ? ` class="${cls}"` : ''}>${window.AFTip.wrap(C.esc(label), name, def, 'tip-block')}</th>`;
    /** U-176 — a cell carries its column and, for a figure, the heading's own short label, so a phone
     *  draws the row as a card (media/afMobile.js, table[data-afcards]); the column is still defined once, here. */
    const UNLABELLED = { origin: 1, agent: 1, engine: 1, label: 1 };
    function tagCell(html, col) {
        const shown = /<span class="af-tipw[^"]*"[^>]*>([^<]*)</.exec(HEAD[col] || '');
        const label = UNLABELLED[col] || !shown ? '' : shown[1].replace(/&[#\w]+;/g, '').trim();
        return String(html).replace(/^(\s*<td\b[^>]*)>/, `$1 data-col="${col}"${col === 'label' ? ' data-lead' : ''}${label ? ` data-label="${label.replace(/"/g, '')}"` : ''}>`);
    }
    const HEAD = {
        origin: th('origcell', 'By', 'Category', 'What opened the session this turn belongs to — the Sessions table\'s categories: '
            + '🧑 you · ⑂ a baton relay leg · 🤖 automation · 🎯 a mission. 🌙 on the glyph: no terminal behind it.'),
        agent: th('', 'Agent', 'Agent', 'The agent whose folder the session ran in.'),
        engine: th('', 'Engine', 'Engine · Route', 'Which engine ran this turn — ' + window.AFEngine.names(', ', 'or')
            + '. A Claude transcript states no engine; the absence IS Claude.'
            + ' The dashed chip beside it is the provider the engine itself named for THIS turn —'
            + ' a second axis, not a sixth engine. Absent on an engine that publishes none,'
            + ' which is Claude for ever; a count where the engine named more than one.'),
        label: th('', 'Turn', 'Turn — the prompt', 'The prompt that opened the turn.'),
        session: th('', 'Session', 'Session', 'The session this turn belongs to.'),
        n: th('num', '#', 'Turn number', 'This turn\'s number, over the session\'s own turn count.'),
        models: th('', 'Model', 'Model', 'The model, or models, that served this turn.'),
        tokens: th('num', 'Tokens', 'Tokens', 'Raw tokens the turn consumed; after ⚖, the same turn '
            + 'weighted against the plan limit.'),
        when: th('num', 'When', 'When', 'How long ago the turn opened.'),
        duration: th('num', 'Duration', 'Duration', 'Until the next turn opened (on the last turn: '
            + 'until the session ended) — so it includes the time the ball was with you. Took is the '
            + 'turn\'s own running time, and the difference between them is your thinking, not the '
            + 'model\'s.'),
        steps: th('num', 'Steps', 'Steps', C.STEPS_TIP),
        took: th('num', 'Took', 'Took', 'How long the turn itself ran — its prompt to its last line.'),
        ctx: th('num', 'Ctx', 'Context at the end of the turn',
            'What the model\'s window held when this turn ended.'),
        tools: th('num', 'Tools', 'Tool calls', 'Tool calls made inside this turn.'),
        errors: th('num', 'Err', 'Errors', 'Tool results that came back as errors.'),
        // ‼️ U-59 — THE RULE, NOT A LIST OF ENGINES. "API-equivalent cost" was
        // written when one engine published a price and the rest were priced
        // here; a second one now states its own, so a heading calling every
        // figure an equivalent is wrong on two of five rows. The sentence is the
        // rule, so it stays true whatever ships next.
        cost: th('num', 'Cost', 'Cost', 'What this turn cost. An engine that publishes a price per turn '
            + 'states its own figure and that is what is shown; where none is published this is the '
            + 'API-equivalent of the tokens at your agentFarm.pricing rates — good for comparing runs, '
            + 'never a bill.')
    };

    /**
     * ‼️ U-69 — THE FIRST LINE OF A CELL'S PANEL IS THAT CELL, IN FULL.
     *
     * Every column is one line high and cut at its own edge now, so the hover
     * has one job before any other: say what the cell would have said with room.
     * Under it, after a blank line, come the figures that value implies — off
     * the row the page already holds, never a second question to the host.
     *
     * The one deliberate exception is the two columns that hold WORDS. A prompt
     * runs to paragraphs, and a paragraph in the panel's caption line (a 10px
     * rule-under-it label) is unreadable; so those two put the column's name in
     * the caption and open the BODY with the whole text, which is the same
     * promise in the shape the text needs.
     */
    const cell = (cls, inner, head, figures) => window.AFTip.cell(
        cls, '', `<span class="tcut">${inner}</span>`, head, figures.filter(Boolean).join('\n'));
    const waited = r => (r.durationMs && r.ms && r.durationMs > r.ms
        ? C.fmtDur(r.durationMs - r.ms) : '');
    const replies = r => (r.steps || 0) - (r.thinking || 0) - (r.tools || 0);
    const CELL = {
        origin: r => {
            const o = RC.meta(RC.of(r));
            // S-35 — the moon rides on the glyph: one fact about one run
            const moon = RC.isHeadless(r) && o.id !== 'mission' ? `<span class="hgl">${RC.glyph()}</span>` : '';
            // S-123 — a relay leg's ⑂ opens its chain on the Chains page (AFChainNav.wireOpen, wired once below)
            const nav = r.chainId && window.AFChainNav ? window.AFChainNav : null;
            return window.AFTip.cell(`origcell ${o.id}${moon ? ' hless' : ''}`, nav ? nav.openAttr(r.chainId) : '',
                `<span class="tcut">${o.glyph + moon}</span>`, `${o.glyph} ${o.label}`, [
                r.mission ? line('Mission', r.mission.title) : '',
                r.chainId ? line('Chain', `${r.chainId} · leg ${r.chainLeg}`) : '',
                RC.isHeadless(r) ? line('Terminal', 'none (headless)') : '',
                line('Agent', r.agent),
                line('Session', r.session),
                r.project ? line('Project', r.project) : '',
                line('Turn', `${r.n} of ${r.of}`),
                nav ? '\n' + nav.OPEN_HINT : ''
            ].filter(Boolean).join('\n'));
        },
        agent: r => cell('', `${dot(r)}${C.esc(r.agent)}${subBadge(r)}${termBtn(r)}`,
            (r.agent || '—') + (r.sidechain ? ' · sub-agent' : '') + (r.active ? ' · active now' : ''), [
            line('Session', r.session),
            line('Engine', engineLabel(r)),
            line('Model', (r.models || []).join(', ')),
            line('Turn', `${r.n} of ${r.of}`),
            line('When', stamp(r.ts))
        ]),
        // The shared badge and the shared palette — never a colour invented here.
        //
        // ‼️ X-110 — AND THE PROVIDER BESIDE IT, WHICH IS THE WHOLE POINT OF A
        // PER-TURN ROW. A session summary can only say "2 providers"; this page
        // is the one place that can say WHICH turn ran on WHICH, and until now
        // it said neither — the fact sat in `providerIds`, unread, while the
        // reader was left to infer it from a model name, which is the one
        // inference this family forbids.
        //
        // The REPORTED half only: a turn's declared route is the session's, and
        // what the engine named for THIS turn is the fact a turn row owns.
        engine: r => cell('engcell',
            window.AFEngine.badge(r.engine || 'claude') + providerMark(r),
            engineLabel(r), [
                line('Model', (r.models || []).join(', ') || '—'),
                line('Answered by', (r.providerIds || []).map(window.AFProvider.label).join(', ')),
                // X-111 — the session's declared route, which is what the
                // Providers filter counts a Claude turn under.
                line('Session route', r.route ? (r.routeLabel || window.AFProvider.label(r.route)) : ''),
                line('Turn', `${r.n} of ${r.of}`),
                line('Cost', r.cost ? C.fmtUSD(r.cost) : '')
            ]),
        label: r => cell('turncol', C.esc(r.label || '—'), 'Turn', [
            r.label || '(no prompt recorded)',
            window.AFTip.GAP,
            line('Turn', `${r.n} of ${r.of}`),
            line('When', stamp(r.ts)),
            line('Session', r.session),
            line('Agent', r.agent)
        ]),
        session: r => cell('sesscol', C.esc(r.session || '—'), 'Session', [
            r.session || '(unnamed)',
            window.AFTip.GAP,
            line('Turn', `${r.n} of ${r.of}`),
            line('Agent', r.agent),
            line('Engine', engineLabel(r)),
            line('When', stamp(r.ts))
        ]),
        n: r => cell('num', `${r.n}/${r.of}`, `${r.n}/${r.of}`, [
            line('Turn', `${r.n} of ${r.of} in this session`),
            line('Session', r.session),
            line('When', stamp(r.ts))
        ]),
        models: r => cell('', (r.models || []).map(m =>
            `<span class="tag">${C.esc(m.replace(/^claude-/, ''))}</span>`).join('') || '—',
            (r.models || []).join(', ') || '—', [
            line('Engine', engineLabel(r)),
            line('Tokens', r.tokens ? C.fmtTok(r.tokens) : ''),
            line('Cost', r.cost ? C.fmtUSD(r.cost) : '')
        ]),
        // ‼️ THE COLUMN THE ITEM WAS FILED ABOUT. It was the widest numeric
        // column and needed the least of it; what it owed the reader was not
        // width but the breakdown underneath — thinking is the dearest step
        // there is, and its share was nowhere on this page.
        steps: r => cell('num', r.steps || r.apiCalls ? C.esc(C.fmtSteps(r.apiCalls, r.steps)) : '—',
            r.steps || r.apiCalls ? C.fmtSteps(r.apiCalls, r.steps) : '—', [
            line('API calls', r.apiCalls || ''),
            line('Steps', r.steps || ''),
            line('Steps per call', r.apiCalls && r.steps ? round1(r.steps / r.apiCalls) : ''),
            line('…reasoning', r.thinking ? `${r.thinking} (${pctOf(r.thinking, r.steps)})` : ''),
            line('…tool calls', r.tools ? `${r.tools} (${pctOf(r.tools, r.steps)})` : ''),
            line('…replies', replies(r) > 0 ? `${replies(r)} (${pctOf(replies(r), r.steps)})` : '')
        ]),
        tokens: r => cell('num', r.tokens ? C.fmtTokW(r.tokens, r.wTokens) : '—',
            r.tokens ? C.fmtTokWText(r.tokens, r.wTokens) : '—', [
            line('Raw', r.tokens ? C.fmtTok(r.tokens) : ''),
            line('Weighted', r.wTokens ? C.fmtTok(Math.round(r.wTokens)) : ''),
            line('Per API call', r.apiCalls && r.tokens ? C.fmtTok(Math.round(r.tokens / r.apiCalls)) : ''),
            line('Cost', r.cost ? C.fmtUSD(r.cost) : '')
        ]),
        when: r => cell('num', relTime(r.ts), relTime(r.ts), [
            line('Opened', stamp(r.ts)),
            line('Took', r.ms ? C.fmtDur(r.ms) : ''),
            line('Duration', r.durationMs ? C.fmtDur(r.durationMs) : '')
        ]),
        duration: r => cell('num', r.durationMs ? C.esc(C.fmtDur(r.durationMs)) : '—',
            r.durationMs ? C.fmtDur(r.durationMs) : '—', [
            line('Took', r.ms ? C.fmtDur(r.ms) : ''),
            line('Waiting on you', waited(r)),
            line('Opened', stamp(r.ts))
        ]),
        took: r => cell('num', r.ms ? C.esc(C.fmtDur(r.ms)) : '—', r.ms ? C.fmtDur(r.ms) : '—', [
            line('Duration', r.durationMs ? C.fmtDur(r.durationMs) : ''),
            line('Waiting on you', waited(r)),
            line('Steps', r.steps || '')
        ]),
        ctx: r => cell('num ctxcell', r.endCtx ? C.fmtTok(r.endCtx) : '—',
            r.endCtx ? C.fmtTok(r.endCtx) : '—', [
            // ‼️ X-113 — THE CEILING IS THE ROW'S, NOT CLAUDE'S. This line
            // divided every turn of every engine by 200 000: wrong by a third
            // on a measured Codex thread (258 400) and by five on a
            // million-token model, and exact-looking in both. The host
            // resolves it per row against the turn's own last model
            // (core/turns.ts), and 0 means nobody stated one — then there is
            // no fraction to print rather than a confident wrong one.
            // ‼️ ONE FACT, ONE LINE. With no ceiling there is no fraction, and
            // the reason IS the answer — a second line repeating it was two
            // lines of the panel saying the same thing.
            line(r.ctxWindow ? `Of its ${C.fmtTok(r.ctxWindow)} window` : 'Window',
                r.endCtx && r.ctxWindow ? pctOf(r.endCtx, r.ctxWindow)
                    : r.endCtx ? C.ctxWindowIs(r.ctxWindowSource) : ''),
            line('Window is', r.endCtx && r.ctxWindow ? C.ctxWindowIs(r.ctxWindowSource) : ''),
            line('Turn tokens', r.tokens ? C.fmtTok(r.tokens) : ''),
            line('Turn', `${r.n} of ${r.of}`)
        ]),
        tools: r => cell('num', String(r.tools || 0), String(r.tools || 0), [
            line('Errors', r.errors || 0),
            line('Share of steps', r.tools ? pctOf(r.tools, r.steps) : ''),
            line('Steps', r.steps || '')
        ]),
        errors: r => cell('num', r.errors ? String(r.errors) : '', String(r.errors || 0), [
            line('Tool calls', r.tools || 0),
            line('Share', r.errors ? pctOf(r.errors, r.tools) : ''),
            line('Turn', `${r.n} of ${r.of}`)
        ]),
        cost: r => cell('num', `<strong>${r.cost ? C.fmtUSD(r.cost) : '—'}</strong>`,
            r.cost ? C.fmtUSD(r.cost) : '—', [
            line('Tokens', r.tokens ? C.fmtTok(r.tokens) : ''),
            line('Per API call', r.apiCalls && r.cost ? C.fmtUSD(r.cost / r.apiCalls) : ''),
            line('Model', (r.models || []).join(', '))
        ])
    };

    /** Show chips for the content of unfolded turns (the session viewer's set). */
    function contentChipsHtml() {
        const all = !roleSel.size;
        const dialog = roleSel.size === 2 && roleSel.has('user') && roleSel.has('assistant');
        return `<div class="chiprow">
            <span class="muted small" title="What an unfolded turn (▸) shows of its content">Show:</span>
            <button class="chip${all ? ' on' : ''}" data-preset="all" title="Show every message of an unfolded turn">All</button>
            <button class="chip${dialog ? ' on' : ''}" data-preset="dialog" title="Only you + the agent — tool traffic hidden (the default)">Dialog</button>
            ${ROLE_CHIPS.map(c =>
                `<button class="chip${roleSel.has(c.id) ? ' on' : ''}" data-chip="${c.id}">${c.label}</button>`).join('')}
            <span class="muted small">— applies to every turn you unfold</span>
        </div>`;
    }

    function tableHtml() {
        const rows = DATA.rows || [];
        const def = SORTS.find(s => s.id === sort) || SORTS[0];
        const pool = filterRows(rows);
        const nf = activeFilterCount();
        const hidden = rows.length - pool.length;
        shown = pool.slice().sort((a, b) => def.key(b) - def.key(a));
        if (tableN > 0) { shown = shown.slice(0, tableN); }
        shown.forEach(r => { if (open.has(key(r))) { ensureDetail(r); } });

        const rowsHtml = shown.map(r => {
            const k = key(r);
            const o = open.has(k);
            // ‼️ A turn row is TWO objects at once: the turn, and the session it
            // belongs to. It publishes itself as `afTurnRow`, which is in the
            // session family (src/core/ctxmenu.ts), so one right-click offers
            // that session's whole action set AND the four things that are true
            // only of this turn.
            // ‼️ NO `title` ON THE ROW (U-69). Every cell now opens a panel of
            // its own, and a native tooltip on the row underneath shows on top
            // of it — two hovers over one cell. The hint belongs where the
            // sessions table already keeps it: once, in the caption.
            return `<tr class="click turnrow${o ? ' open' : ''}" data-turn="${C.esc(r.file)}" data-ts="${r.ts || 0}" data-afcard
                ${window.AFSessionCtx.row(r, { webviewSection: 'afTurnRow', turnKey: k, turnN: r.n, turnTs: r.ts || 0 })}>
                <td class="foldcell" data-first><button class="fold" data-fold="${C.esc(k)}" title="${o ? 'Hide' : 'Show'} this turn's content">${o ? '▾' : '▸'}</button></td>
                ${COLUMNS.map(c => tagCell(CELL[c](r), c)).join('')}
            </tr>` + (o ? `<tr class="turnbody" data-afcardmore><td data-first></td><td colspan="${COLUMNS.length}">${turnBodyHtml(r)}</td></tr>` : '');
        }).join('');

        return `
        <div class="chiprow">
            <span class="muted small">Sort by:</span>
            <select class="af-sort">${SORTS.map(s => C.option(s.id, s.label, { selected: s.id === sort, detail: s.detail || '' })).join('')}</select>
            <span class="muted small">List:</span>
            <input type="number" class="af-count" min="1" step="1" value="${tableN > 0 ? tableN : ''}" placeholder="all" title="How many turns to list after sorting — empty means all">
            <button class="chip af-allrows${tableN === 0 ? ' on' : ''}" title="List every turn (click again to go back to ${DEFAULT_N})">All</button>
            <span class="muted small">Turns:</span>
            <button class="chip af-expand" title="Unfold every listed turn (reads each transcript once)">Expand all</button>
            <button class="chip af-collapse" title="Fold all turns closed">Collapse all</button>
            <button class="chip af-single${single ? ' on' : ''}" title="Only one turn open at a time: unfolding a turn folds the previous one">Single-open</button>
            ${RC.chips(filters, rows, false, 'turns')}
            ${RC.engineBar('turns-engines-bar', filterFacets().engines, filters.engines, 'turns')}
            <button class="chip af-filter${nf ? ' on' : ''}" title="Filter the turns by category, prompt text, session, agent, model, flags, ranges and dates">Filters${nf ? ` (${nf})` : ''}</button>
            <span class="muted small">${hidden > 0 ? `${pool.length}/${rows.length} turns · ` : `${rows.length} turns · `}${window.AFSessionCtx.HINT} · hover any cell for its full value and what it implies · ▸ shows a turn's content · row click opens the transcript at that turn · ● = active now</span>
        </div>
        ${contentChipsHtml()}
        ${filterPanelHtml()}
        <div class="tablewrap"><table class="turnstable" data-afcards>
            ${colgroupHtml(COLUMNS)}
            <tr data-afcardhead><th></th>${COLUMNS.map(c => HEAD[c]).join('')}</tr>
            ${rowsHtml || `<tr><td colspan="${COLUMNS.length + 1}" class="muted">${rows.length ? 'No turns match the filters.' : 'No turns yet.'}</td></tr>`}
        </table></div>`;
    }

    function render() {
        document.getElementById('app').innerHTML = `
            ${STYLE}
            ${window.AFHeader.html({
                page: 'turns',
                title: 'Turns',
                sub: `every user turn across the farm, sessions unrolled · generated ${window.AFTime.full(DATA.generatedAt)}`,
                actions: `<button class="secondary" id="exportmd" title="Export the listed turns to Markdown — asks whether to save the current view (folding/Show applied) or everything">⬇ Export MD</button>`,
                guide: 'turlar-sayfasi'
            })}
            <div id="turnsblock">${tableHtml()}</div>
            <p class="footnote">Each row is one user turn; tokens/cost/tools/errors are what that turn actually consumed (subagent work bills to the turn that spawned it). Duration runs until the next turn opened. Turn numbers match the session viewer's turn table.</p>
        `;
        window.AFHeader.wire(vscode);
        wire(document.getElementById('turnsblock'));
        // Export MD lives in the header (outside #turnsblock). It sends the exact
        // turns currently listed, which are unfolded, and the content Show
        // selection; the host asks the view/everything + folded-titles questions
        // and builds the Markdown.
        const ex = document.getElementById('exportmd');
        if (ex) {
            ex.addEventListener('click', () => vscode.postMessage({
                type: 'exportChoose',
                shown: shown.map(r => ({ file: r.file, n: r.n })),
                open: shown.filter(r => open.has(key(r))).map(r => key(r)),
                roles: [...roleSel]
            }));
        }
    }

    function wire(root) {
        root.querySelector('.af-sort').addEventListener('change', e => {
            sort = e.target.value;
            saveState();
            render();
        });
        root.querySelector('.af-expand').addEventListener('click', () => {
            shown.forEach(r => { open.add(key(r)); ensureDetail(r); });
            render();
        });
        root.querySelector('.af-collapse').addEventListener('click', () => {
            open.clear();
            render();
        });
        root.querySelector('.af-single').addEventListener('click', () => {
            single = !single;
            if (single && open.size > 1) {
                const keep = shown.find(r => open.has(key(r)));
                open.clear();
                if (keep) { open.add(key(keep)); }
            }
            saveState();
            render();
        });
        const setCount = n => {
            if (n === tableN) { return; }
            tableN = n;
            saveState();
            render();
        };
        // a longer beat than the client-side filters: each commit asks the host
        // to rebuild the row pool
        window.AFFilter.live(root.querySelector('.af-count'), el => {
            const v = parseInt(el.value, 10);
            setCount(isFinite(v) && v >= 1 ? v : 0);
        }, 400);
        root.querySelector('.af-allrows').addEventListener('click', () =>
            setCount(tableN === 0 ? DEFAULT_N : 0));
        // Content Show chips — the session viewer's role filter, applied to every
        // unfolded turn. Presets set the whole selection; individual chips toggle.
        root.querySelectorAll('.chip[data-preset],.chip[data-chip]').forEach(chip =>
            chip.addEventListener('click', () => {
                if (chip.dataset.preset === 'all') { roleSel = new Set(); }
                else if (chip.dataset.preset === 'dialog') { roleSel = new Set(ROLE_DEFAULT); }
                else {
                    const id = chip.dataset.chip;
                    if (roleSel.has(id)) { roleSel.delete(id); } else { roleSel.add(id); }
                }
                saveState();
                render();
            }));
        // U-191 — the bar's and the panel's switches are one switch each
        RC.wire(root, filters, () => { saveState(); render(); });
        root.querySelector('.af-filter').addEventListener('click', () => {
            filtersOpen = !filtersOpen;
            saveState();
            render();
        });
        const apply = () => { saveState(); render(); };
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
        // picker id → filter key; the bar's Engines picker IS the panel's Engines box
        const MULTI = { agents: 'agents', engines: 'engines', 'engines-bar': 'engines', providers: 'providers', profiles: 'profiles', models: 'models',
            chains: 'chains', missions: 'missions', projects: 'projects' };
        Object.keys(MULTI).forEach(id => window.AFFilter.wireMulti({
            root, id: 'turns-' + id, onChange: sel => { filters[MULTI[id]] = sel; apply(); } }));
        if (filtersOpen) {
            liveEl('.af-fturn', el => { filters.text = el.value || ''; apply(); });
            liveEl('.af-fsess', el => { filters.session = el.value || ''; apply(); });
            // the ✕ that empties them — the shared control (common.css .af-clr)
            window.AFFilter.clearableAll(root, '.af-fturn', el => { filters.text = ''; el.value = ''; apply(); });
            window.AFFilter.clearableAll(root, '.af-fsess', el => { filters.session = ''; el.value = ''; apply(); });
            wireEl('.af-factive', 'click', () => { filters.activeOnly = !filters.activeOnly; apply(); });
            wireEl('.af-ferrors', 'click', () => { filters.errorsOnly = !filters.errorsOnly; apply(); });
            wireEl('.af-fmain', 'click', () => { filters.mainOnly = !filters.mainOnly; apply(); });
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
        // Row click → transcript AT this turn (the viewer scrolls to its prompt).
        root.querySelectorAll('[data-turn]').forEach(row =>
            row.addEventListener('click', () =>
                vscode.postMessage({ type: 'openSession', file: row.dataset.turn, ts: Number(row.dataset.ts) || 0 })));
        root.querySelectorAll('[data-term]').forEach(b =>
            b.addEventListener('click', ev => {
                ev.stopPropagation();
                vscode.postMessage({
                    type: 'focusTerminal', sessionId: b.dataset.sid || '',
                    agentName: b.dataset.term, cwd: b.dataset.cwd || ''
                });
            }));
        root.querySelectorAll('[data-fold]').forEach(b =>
            b.addEventListener('click', ev => {
                ev.stopPropagation();
                const k = b.dataset.fold;
                if (open.has(k)) {
                    open.delete(k);
                } else {
                    if (single) { open.clear(); }
                    open.add(k);
                    const r = shown.find(x => key(x) === k);
                    if (r) { ensureDetail(r); }
                }
                render();
            }));
    }

    // ------------------------------------------------------- right-click menu

    /**
     * The turn's own half of the menu. The session half is host commands and
     * needs nothing here.
     *
     * The content of a turn is fetched on demand (`ensureDetail`), so a copy
     * asked for before the turn has ever been unfolded requests it and says so
     * rather than silently copying an empty string — the alternative is a
     * clipboard that looks like it worked.
     */
    function ctxDo(act, ctx) {
        const verb = act.split(':')[0];
        const arg = act.slice(verb.length + 1);
        const k = String(ctx.turnKey || '');
        const row = shown.find(x => key(x) === k);

        if (verb === 'tnOpen') {
            vscode.postMessage({ type: 'openSession', file: String(ctx.file || ''), ts: Number(ctx.turnTs) || 0 });
            return;
        }
        if (verb === 'tnFold') {
            if (open.has(k)) { open.delete(k); }
            else {
                if (single) { open.clear(); }
                open.add(k);
                if (row) { ensureDetail(row); }
            }
            render();
            return;
        }
        // K-26 — the pool files by session id and turn number, and this row is
        // the only surface that carries both for every turn the fleet has run.
        if (verb === 'tnWiki') {
            const id = String(ctx.sessionId || (row && row.sessionId) || '');
            if (!id) {
                window.AFCtx.toast('That turn has no session id on it — the pool files by id, so open the transcript and mark it there.', true);
                return;
            }
            // The key is a session id and a turn number joined — it is not
            // selector-safe, so the row is found by walking the fold buttons
            // rather than by building a query out of it.
            const btn = [...document.querySelectorAll('[data-fold]')]
                .find(b => b.dataset.fold === k);
            window.AFWiki.open({
                el: btn ? btn.closest('tr') || btn : null,
                session: id, turn: Number(ctx.turnN) || (row ? row.n : 0),
                text: (row && row.label) || ''
            });
            return;
        }
        if (verb !== 'tnCopy') { return; }

        if (arg === 'where') {
            window.AFCtx.copy(row
                ? `${row.sessionId || row.file} · turn ${row.n}/${row.of}`
                : String(ctx.sessionId || ctx.file || ''));
            return;
        }
        const cache = row ? detailCache[k] : null;
        if (!cache || cache.msgs === null) {
            if (row) { ensureDetail(row); }
            window.AFCtx.toast('That turn has not been read yet — fetching it; ask again in a moment.', true);
            return;
        }
        const msgs = cache.msgs || [];
        const text = (m) => String(m.role === 'tool' ? (m.tool + ' ' + (m.input || '')) : (m.text || ''));
        const pick = arg === 'prompt' ? msgs.filter(m => m.role === 'user')
            : arg === 'answer' ? msgs.filter(m => m.role === 'assistant')
                : msgs;
        window.AFCtx.copy(pick.map(text).filter(Boolean).join('\n\n'));
    }

    // ‼️ ONCE, at module scope — render() rebuilds every row on every change.
    window.AFCtx.listen(ctxDo);
    // K-26 — the tagger, reachable from the right-click on any turn row. No
    // badge here: this page is a table read across sessions, and the mark it
    // makes is confirmed by the popover's own ✓ rather than by a column.
    window.AFWiki.init(vscode);
    window.AFWiki.wire();

    render();
})();
