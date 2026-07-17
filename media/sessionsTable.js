// Agent Farm — shared advanced Sessions table (Dashboard + Agent Detail).
// One pool of rows, sorted client-side by the picked criterion; each row folds
// open (▸) into that session's per-turn breakdown (fetched on demand from the
// host via a 'sessionTurns' message); active rows carry a ⌨ jump-to-terminal
// button. The component owns exactly one container div and re-renders only
// that, so host-page state (e.g. an open pricing editor) is never clobbered.
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
    const FDEF = () => ({
        text: '', agent: '', activeOnly: false, errorsOnly: false, mainOnly: false,
        from: '', to: '', ranges: {}
    });

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
        .foldcell { width:22px; }
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
     *   columns,             // subset of: agent,title,when,duration,turns,tools,errors,tokens,ctx,cost
     *   tableN,              // rows shown after sorting (default 12)
     *   stateKey,            // persistence namespace ('dash', 'agent', …)
     *   fallbackSort, fallbackSingle  // initial state when nothing persisted
     * }
     * returns { setRows(rows, tableN?), onMessage(ev) -> handled? }
     * Host must answer 'sessionTurns' and handle 'openSession'/'focusTerminal'.
     */
    function create(opts) {
        const vscode = opts.vscode, C = opts.C;
        const cols = opts.columns;
        const hasAgentCol = cols.indexOf('agent') >= 0;
        let rows = [];
        let tableN = opts.tableN || 12;

        // sort + single-open persist per page (namespaced so several tables can
        // coexist in one webview state); open rows are session-local
        const persisted = (typeof vscode.getState === 'function' && vscode.getState()) || {};
        const saved = (persisted.afSess || {})[opts.stateKey] || {};
        let sort = SORTS.some(s => s.id === saved.sort) ? saved.sort
            : (SORTS.some(s => s.id === opts.fallbackSort) ? opts.fallbackSort : 'recent');
        let single = saved.single !== undefined ? !!saved.single : !!opts.fallbackSingle;
        let filters = Object.assign(FDEF(), saved.filters || {});
        let filtersOpen = !!saved.filtersOpen;
        const open = new Set();
        const turnCache = {}; // file -> { ts, turns|null } (null = request in flight)
        let shown = [];       // exactly what's on screen, set by the last render

        function saveState() {
            if (typeof vscode.setState !== 'function') { return; }
            const st = (typeof vscode.getState === 'function' && vscode.getState()) || {};
            const all = Object.assign({}, st.afSess);
            all[opts.stateKey] = { sort, single, filters, filtersOpen };
            vscode.setState(Object.assign({}, st, { afSess: all }));
        }

        function activeFilterCount() {
            let n = (filters.text ? 1 : 0) + (filters.agent ? 1 : 0)
                + (filters.activeOnly ? 1 : 0) + (filters.errorsOnly ? 1 : 0) + (filters.mainOnly ? 1 : 0)
                + (filters.from ? 1 : 0) + (filters.to ? 1 : 0);
            FRANGES.forEach(k => {
                const rg = filters.ranges[k.id];
                if (rg) { n += (rg.min !== undefined ? 1 : 0) + (rg.max !== undefined ? 1 : 0); }
            });
            return n;
        }

        function filterRows(list) {
            const text = (filters.text || '').toLowerCase();
            return list.filter(r => {
                if (text && ((r.title || '') + ' ' + (r.agent || '')).toLowerCase().indexOf(text) < 0) { return false; }
                if (filters.agent && r.agentName !== filters.agent) { return false; }
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

        function filterPanelHtml() {
            if (!filtersOpen) { return ''; }
            const agents = [];
            rows.forEach(r => { if (r.agentName && agents.indexOf(r.agentName) < 0) { agents.push(r.agentName); } });
            agents.sort();
            const flag = (cls, label, on, tip) =>
                `<button class="chip ${cls}${on ? ' on' : ''}" title="${tip}">${label}</button>`;
            const ranges = FRANGES.map(k => {
                const rg = filters.ranges[k.id] || {};
                return `<label class="af-frange">${k.label}
                    <input type="number" class="af-fr-${k.id}-min" placeholder="min" value="${rg.min !== undefined ? rg.min : ''}">–<input type="number" class="af-fr-${k.id}-max" placeholder="max" value="${rg.max !== undefined ? rg.max : ''}">
                </label>`;
            }).join('');
            return `<div class="af-fpanel">
                <div class="af-frow">
                    <input type="text" class="af-ftext" placeholder="title contains…" value="${C.esc(filters.text)}">
                    ${hasAgentCol && agents.length > 1 ? `<span class="muted small">Agent:</span>
                        <select class="af-fagent"><option value="">all</option>${agents.map(a =>
                            `<option value="${C.esc(a)}"${filters.agent === a ? ' selected' : ''}>${C.esc(a)}</option>`).join('')}</select>` : ''}
                    ${flag('af-factive', 'Active now', filters.activeOnly, 'Only sessions with a live terminal working right now')}
                    ${flag('af-ferrors', 'Has errors', filters.errorsOnly, 'Only sessions with at least one tool error')}
                    ${flag('af-fmain', 'Main only', filters.mainOnly, 'Hide subagent (sidechain) sessions')}
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
        // on every row, not just active ones — a terminal window can be open
        // while the session idles; the command falls back honestly if none is
        const termBtn = r =>
            ` <button class="fold" data-term="${C.esc(r.agentName || '')}" data-sid="${C.esc(r.sessionId || '')}" data-cwd="${C.esc(r.cwd || '')}" title="Jump to this session's terminal window (if one is open)">⌨</button>`;

        const HEAD = {
            agent: '<th>Agent</th>',
            title: '<th>Title</th>',
            when: '<th class="num">When</th>',
            duration: '<th class="num">Duration</th>',
            turns: '<th class="num">Turns</th>',
            tools: '<th class="num">Tools</th>',
            errors: '<th class="num">Err</th>',
            tokens: '<th class="num">Tokens</th>',
            ctx: '<th class="num" title="Approximate context in the model window after this session’s last reply (input + cache + output of that request)">Ctx now</th>',
            cost: '<th class="num">Cost</th>'
        };
        // the active dot / sub badge / ⌨ button live in the leftmost identity
        // cell — Agent when present (dashboard), otherwise Title (agent page)
        const CELL = {
            agent: r => `<td>${dot(r)}${C.esc(r.agent)}${subBadge(r)}${termBtn(r)}</td>`,
            title: r => hasAgentCol
                ? `<td>${C.esc(r.title)}</td>`
                : `<td>${dot(r)}${C.esc(r.title)}${subBadge(r)}${termBtn(r)}</td>`,
            when: r => `<td class="num">${relTime(r.ts)}</td>`,
            duration: r => `<td class="num">${r.durationMin || 0}m</td>`,
            turns: r => `<td class="num">${r.turns || 0}</td>`,
            tools: r => `<td class="num">${r.toolCalls || 0}</td>`,
            errors: r => `<td class="num">${r.errors || ''}</td>`,
            tokens: r => `<td class="num">${C.fmtTok(r.tokens)}</td>`,
            ctx: r => `<td class="num">${r.ctx ? '~' + C.fmtTok(r.ctx) : '—'}</td>`,
            cost: r => `<td class="num"><strong>${C.fmtUSD(r.cost)}</strong></td>`
        };

        function turnPanelHtml(r) {
            const c = turnCache[r.file];
            if (!c || c.turns === null) { return '<span class="muted small">Loading turns…</span>'; }
            if (!c.turns.length) { return '<span class="muted small">No turns recorded.</span>'; }
            // model ids / run attributes come straight from the transcript — no
            // name table here, so tomorrow's model shows up on its own
            const tags = t => (t.models || []).map(m => m.replace(/^claude-/, ''))
                .concat(Object.values(t.attrs || {}));
            return `<table class="turnmini">
                <tr><th>#</th><th>prompt</th><th>model</th><th class="num">tokens</th><th class="num">cost</th></tr>
                ${c.turns.map(t => `<tr class="click" data-turnjump="${C.esc(r.file)}" data-turnts="${t.ts || 0}"
                    title="Open the transcript at turn ${t.n}">
                    <td class="num">${t.n}</td><td>${C.esc(t.label || '—')}</td>
                    <td>${tags(t).map(x => `<span class="tag">${C.esc(x)}</span>`).join('') || '—'}</td>
                    <td class="num">${t.tokens ? C.fmtTok(t.tokens) : '—'}</td>
                    <td class="num">${t.cost ? C.fmtUSD(t.cost) : '—'}</td>
                </tr>`).join('')}
            </table>`;
        }

        function sectionHtml() {
            const def = SORTS.find(s => s.id === sort) || SORTS[0];
            const pool = filterRows(rows);
            const nf = activeFilterCount();
            shown = pool.slice().sort((a, b) => def.key(b) - def.key(a)).slice(0, tableN);
            shown.forEach(r => { if (open.has(r.file)) { ensureTurns(r); } });
            const rowsHtml = shown.map(r => {
                const o = open.has(r.file);
                return `<tr class="click sessrow${o ? ' open' : ''}" data-session="${C.esc(r.file)}">
                    <td class="foldcell"><button class="fold" data-fold="${C.esc(r.file)}" title="${o ? 'Hide' : 'List'} this session's turns">${o ? '▾' : '▸'}</button></td>
                    ${cols.map(c => CELL[c](r)).join('')}
                </tr>` + (o ? `<tr class="sessturns"><td></td><td colspan="${cols.length}">${turnPanelHtml(r)}</td></tr>` : '');
            }).join('');
            return `${STYLE}
            <div class="chiprow">
                <span class="muted small">Sort by:</span>
                <select class="af-sort">${SORTS.map(s => `<option value="${s.id}"${s.id === sort ? ' selected' : ''}>${s.label}</option>`).join('')}</select>
                <span class="muted small">Turns:</span>
                <button class="chip af-expand" title="List every shown session's turns">Expand all</button>
                <button class="chip af-collapse" title="Hide all turn lists">Collapse all</button>
                <button class="chip af-single${single ? ' on' : ''}" title="Only one session's turns open at a time: unfolding a session folds the previous one">Single-open</button>
                <button class="chip af-filter${nf ? ' on' : ''}" title="Filter the sessions by text, agent, flags, ranges and dates">Filters${nf ? ` (${nf})` : ''}</button>
                <span class="muted small">${nf ? `${pool.length}/${rows.length} sessions` : '— ▸ lists a session\'s turns with per-turn tokens/cost · ● = active now · ctx = context after the last reply'}</span>
            </div>
            ${filterPanelHtml()}
            <div class="tablewrap"><table>
                <tr><th></th>${cols.map(c => HEAD[c]).join('')}</tr>
                ${rowsHtml || `<tr><td colspan="${cols.length + 1}" class="muted">${nf ? 'No sessions match the filters.' : 'No sessions yet.'}</td></tr>`}
            </table></div>`;
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
            if (filtersOpen) {
                wireEl('.af-ftext', 'change', el => { filters.text = el.value || ''; apply(); });
                wireEl('.af-fagent', 'change', el => { filters.agent = el.value || ''; apply(); });
                wireEl('.af-factive', 'click', () => { filters.activeOnly = !filters.activeOnly; apply(); });
                wireEl('.af-ferrors', 'click', () => { filters.errorsOnly = !filters.errorsOnly; apply(); });
                wireEl('.af-fmain', 'click', () => { filters.mainOnly = !filters.mainOnly; apply(); });
                wireEl('.af-ffrom', 'change', el => { filters.from = el.value || ''; apply(); });
                wireEl('.af-fto', 'change', el => { filters.to = el.value || ''; apply(); });
                FRANGES.forEach(k => {
                    const bound = (b) => (el) => {
                        const n = el.value === '' || el.value === undefined ? NaN : Number(el.value);
                        const rg = filters.ranges[k.id] || (filters.ranges[k.id] = {});
                        rg[b] = isNaN(n) ? undefined : n;
                        if (rg.min === undefined && rg.max === undefined) { delete filters.ranges[k.id]; }
                        apply();
                    };
                    wireEl(`.af-fr-${k.id}-min`, 'change', bound('min'));
                    wireEl(`.af-fr-${k.id}-max`, 'change', bound('max'));
                });
                wireEl('.af-fclear', 'click', () => { filters = FDEF(); apply(); });
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

        function setRows(r, n) {
            rows = r || [];
            if (n) { tableN = n; }
            renderSection();
        }

        function onMessage(ev) {
            if (!ev.data || ev.data.type !== 'sessionTurns') { return false; }
            const c = turnCache[ev.data.file];
            turnCache[ev.data.file] = { ts: c ? c.ts : 0, turns: ev.data.turns || [] };
            renderSection();
            return true;
        }

        return { setRows, onMessage };
    }

    window.AFSessionsTable = { SORTS, create };
})();
