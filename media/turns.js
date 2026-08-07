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
    // Origin scope of the turn's session — the Sessions tables' scope, same
    // glyphs, same default (🧑 your own dialogs): a farm with standing duties
    // produces far more automation turns than you ever type yourself.
    const ORIGINS = [
        { id: '', label: 'All', glyph: '🧑🤖', tip: 'Turns of both your own sessions and automation runs' },
        { id: 'user', label: 'User', glyph: '🧑', tip: 'Only turns of sessions you started yourself' },
        { id: 'auto', label: 'Auto', glyph: '🤖', tip: 'Only turns of automation runs — schedule / trigger / task / mission' }
    ];
    const originOf = r => (r.origin === 'auto' ? 'auto' : 'user');
    const originMeta = id => ORIGINS.find(o => o.id === id) || ORIGINS[0];

    // agents / models: null = all (no filter, so one appearing later is in by
    // itself); an array = exactly that subset, [] = none. See afFilters.js.
    const FDEF = () => ({
        text: '', session: '', agents: null, models: null, origin: 'user',
        activeOnly: false, errorsOnly: false, mainOnly: false,
        from: '', to: '', ranges: {}
    });

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
    const COLUMNS = ['origin', 'agent', 'label', 'session', 'n', 'models', 'steps', 'tokens', 'ctx', 'when', 'took', 'duration', 'tools', 'errors', 'cost'];
    // How much of a long text a cell shows before it is cut (the full string is
    // always in the cell's tooltip). The CSS caps match these.
    const LABEL_CHARS = 77;
    const SESSION_CHARS = 15;

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
        /* The turn prompt is the row's identity, so it keeps the widest cell;
           the session is context, so it stays narrow — both cut with an
           ellipsis and carry the full text in their tooltip. */
        .turncol { max-width:77ch; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .sesscol { max-width:15ch; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; opacity:.8; }
        .tag { font-size:10px; padding:1px 6px; margin-right:4px; border-radius:8px; white-space:nowrap;
            background:var(--vscode-badge-background); color:var(--vscode-badge-foreground); opacity:.85; }
        .badge { font-size:10px; padding:1px 6px; border-radius:8px;
            border:1px solid var(--vscode-widget-border, #4444); opacity:.8; }
        /* the fold-open turn content */
        .turnbox { margin:4px 0 10px; font-size:12px; display:flex; flex-direction:column; gap:4px; }
        .tmsg { display:flex; gap:8px; align-items:baseline; }
        .trole { flex:none; width:64px; font-size:10px; opacity:.65; text-align:right; text-transform:uppercase; }
        .ttext { white-space:pre-wrap; word-break:break-word; }
        .tmsg.err .ttext { color:var(--vscode-charts-red, #f14c4c); }
        .tmsg.tool .ttext { opacity:.8; font-family:var(--vscode-editor-font-family, monospace); font-size:11px; }
        .tmsg.assistant .trole { color:var(--vscode-textLink-foreground); opacity:.9; }
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
    let filters = Object.assign(FDEF(), saved.filters || {});
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

    window.addEventListener('message', ev => {
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
            render();
        }
    });

    // The origin scope has its own always-visible switch chip, so it is not
    // counted here (a permanent "(1)" on the Filters chip says nothing).
    function activeFilterCount() {
        let n = (filters.text ? 1 : 0) + (filters.session ? 1 : 0) + (filters.agents ? 1 : 0)
            + (filters.models ? 1 : 0) + (filters.activeOnly ? 1 : 0) + (filters.errorsOnly ? 1 : 0)
            + (filters.mainOnly ? 1 : 0) + (filters.from ? 1 : 0) + (filters.to ? 1 : 0);
        FRANGES.forEach(k => {
            const rg = filters.ranges[k.id];
            if (rg) { n += (rg.min !== undefined ? 1 : 0) + (rg.max !== undefined ? 1 : 0); }
        });
        return n;
    }

    function filterRows(list) {
        const text = (filters.text || '').toLowerCase();
        const sess = (filters.session || '').toLowerCase();
        return list.filter(r => {
            if (text && (r.label || '').toLowerCase().indexOf(text) < 0) { return false; }
            if (sess && (r.session || '').toLowerCase().indexOf(sess) < 0) { return false; }
            if (filters.agents && filters.agents.indexOf(r.agentName) < 0) { return false; }
            if (filters.origin && originOf(r) !== filters.origin) { return false; }
            if (filters.models && !(r.models || []).some(m => filters.models.indexOf(m) >= 0)) { return false; }
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

    /** The agent / model values present in the pool — the pickers' options. */
    function filterFacets() {
        const rows = DATA.rows || [];
        const agents = [], models = [];
        rows.forEach(r => {
            if (r.agentName && agents.indexOf(r.agentName) < 0) { agents.push(r.agentName); }
            (r.models || []).forEach(m => { if (models.indexOf(m) < 0) { models.push(m); } });
        });
        return { agents: agents.sort(), models: models.sort() };
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
        const origins = ORIGINS.map(o =>
            `<button class="chip af-forig-${o.id || 'all'}${filters.origin === o.id ? ' on' : ''}" title="${o.tip}">${o.glyph} ${o.label}</button>`).join('');
        return `<div class="af-fpanel">
            <div class="af-frow">
                <span class="muted small" title="Who started the session the turn belongs to">Started by:</span>${origins}
            </div>
            <div class="af-frow">
                <input type="text" class="af-ftext af-fturn" placeholder="turn contains…" value="${C.esc(filters.text)}" title="Filter by the turn's opening prompt">
                <input type="text" class="af-ftext af-fsess" placeholder="session contains…" value="${C.esc(filters.session)}" title="Filter by the session title the turn belongs to">
                ${agents.length > 1 ? window.AFFilter.multi({
                    id: 'turns-agents', label: 'Agents', options: agents, selected: filters.agents,
                    title: 'Which agents\' turns to list — tick any combination'
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
    const cut = (s, n) => (s || '').length > n ? s.slice(0, n - 1) + '…' : (s || '—');

    /**
     * ‼️ SAME RULE AS THE SESSIONS TABLE (docs/CONVENTIONS.md → Hover): the
     * heading defines the column once, and a cell hover is `Label: value` lines
     * — figures, never a sentence. Everything below comes off the row the page
     * already has; nothing here asks the host a second question.
     */
    const line = (k, v) => (v === '' || v === undefined || v === null ? '' : `${k}: ${v}`);
    const round1 = n => Math.round(n * 10) / 10;
    const pctOf = (n, of) => (of > 0 ? Math.round(n / of * 100) + '%' : '');
    const stamp = ts => (ts ? new Date(ts).toLocaleString() : '');
    const tip = parts => C.esc(parts.filter(Boolean).join('\n'));
    /** Everything known about ONE turn — the shared readout its cells share. */
    const turnTip = r => tip([
        line('Turn', `${r.n} of ${r.of}`),
        line('When', stamp(r.ts)),
        line('Took', r.ms ? C.fmtDur(r.ms) : ''),
        line('Duration', r.durationMs ? C.fmtDur(r.durationMs) : ''),
        line('API calls', r.apiCalls || ''),
        line('Steps', r.steps || ''),
        line('Steps per call', r.apiCalls && r.steps ? round1(r.steps / r.apiCalls) : ''),
        // What the total is MADE OF. Thinking is the dearest step there is and
        // was missing from the total until it was counted (see sessions.ts
        // SessionTurn.steps); saying its share here is what stops the number
        // being a black box again.
        line('…reasoning', r.thinking ? `${r.thinking} (${pctOf(r.thinking, r.steps)})` : ''),
        line('…tool calls', r.tools ? `${r.tools} (${pctOf(r.tools, r.steps)})` : ''),
        line('…replies', r.steps - (r.thinking || 0) - (r.tools || 0) > 0
            ? `${r.steps - (r.thinking || 0) - (r.tools || 0)} (${pctOf(r.steps - (r.thinking || 0) - (r.tools || 0), r.steps)})` : ''),
        line('Tool calls', r.tools || ''),
        line('Errors', r.errors || ''),
        line('Tokens', r.tokens ? C.fmtTok(r.tokens) : ''),
        line('Weighted', r.wTokens ? C.fmtTok(r.wTokens) : ''),
        line('Tokens per call', r.apiCalls && r.tokens ? C.fmtTok(Math.round(r.tokens / r.apiCalls)) : ''),
        line('Cost', r.cost ? C.fmtUSD(r.cost) : ''),
        line('Models', (r.models || []).map(m => m.replace(/^claude-/, '')).join(', ')),
        line('Agent', r.agent),
        line('Session', r.session)
    ]);

    const HEAD = {
        origin: '<th class="origcell" title="Who started the session this turn belongs to: 🧑 you · 🤖 automation">By</th>',
        agent: '<th title="Agent whose folder the session ran in">Agent</th>',
        label: '<th title="The prompt that opened the turn">Turn</th>',
        session: '<th title="The session this turn belongs to">Session</th>',
        n: '<th class="num" title="Turn number / the session\'s turn count">#</th>',
        models: '<th title="Model(s) that served the turn">Model</th>',
        tokens: '<th class="num" title="Raw tokens; after ⚖ weighted against the plan limit">Tokens</th>',
        when: '<th class="num" title="Time since the turn opened">When</th>',
        duration: '<th class="num" title="Until the next turn opened (last turn: until the session ended) — includes the time the ball was with you; Took is the turn\'s own running time">Duration</th>',
        steps: `<th class="num" title="${C.esc(C.STEPS_TIP)}">Steps</th>`,
        took: '<th class="num" title="How long the turn itself ran — its prompt to its last line">Took</th>',
        ctx: '<th class="num" title="What the model\'s window held when this turn ended">Ctx</th>',
        tools: '<th class="num" title="Tool calls made inside this turn">Tools</th>',
        errors: '<th class="num" title="Tool results that came back as errors">Err</th>',
        cost: '<th class="num" title="API-equivalent cost of this turn">Cost</th>'
    };
    const CELL = {
        origin: r => {
            const o = originMeta(originOf(r));
            return `<td class="origcell ${o.id}" title="${tip([
                line('Started by', o.id === 'auto' ? '🤖 Automation' : '🧑 You'),
                line('Agent', r.agent),
                line('Session', r.session)
            ])}">${o.glyph}</td>`;
        },
        agent: r => `<td title="${turnTip(r)}">${dot(r)}${C.esc(r.agent)}${subBadge(r)}${termBtn(r)}</td>`,
        // ‼️ The two TEXT columns hover into the rich panel (media/afTip.js):
        // a native tooltip cuts wherever the platform likes, which is the worst
        // possible treatment of the one cell that is actually words.
        label: r => window.AFTip.cell('turncol', '', C.esc(cut(r.label, LABEL_CHARS)),
            `Turn ${r.n} of ${r.of} · ${stamp(r.ts)}`, r.label || ''),
        session: r => window.AFTip.cell('sesscol', '', C.esc(cut(r.session, SESSION_CHARS)),
            `Session · ${r.agent || ''}`, r.session || ''),
        n: r => `<td class="num" title="${turnTip(r)}">${r.n}/${r.of}</td>`,
        models: r => `<td title="${turnTip(r)}">${(r.models || []).map(m =>
            `<span class="tag">${C.esc(m.replace(/^claude-/, ''))}</span>`).join('') || '—'}</td>`,
        tokens: r => `<td class="num" title="${turnTip(r)}">${r.tokens ? C.fmtTokW(r.tokens, r.wTokens) : '—'}</td>`,
        when: r => `<td class="num" title="${turnTip(r)}">${relTime(r.ts)}</td>`,
        duration: r => `<td class="num" title="${turnTip(r)}">${r.durationMs ? C.esc(C.fmtDur(r.durationMs)) : '—'}</td>`,
        steps: r => `<td class="num" title="${turnTip(r)}">${r.steps || r.apiCalls ? C.esc(C.fmtSteps(r.apiCalls, r.steps)) : '—'}</td>`,
        took: r => `<td class="num" title="${turnTip(r)}">${r.ms ? C.esc(C.fmtDur(r.ms)) : '—'}</td>`,
        ctx: r => `<td class="num" title="${tip([
            line('Ctx at end', r.endCtx ? C.fmtTok(r.endCtx) : '—'),
            line('Of a 200k window', r.endCtx ? pctOf(r.endCtx, 200000) : ''),
            line('Turn tokens', r.tokens ? C.fmtTok(r.tokens) : ''),
            line('Turn', `${r.n} of ${r.of}`)
        ])}">${r.endCtx ? C.fmtTok(r.endCtx) : '—'}</td>`,
        tools: r => `<td class="num" title="${turnTip(r)}">${r.tools || 0}</td>`,
        errors: r => `<td class="num" title="${tip([
            line('Errors', r.errors || 0),
            line('Tool calls', r.tools || 0),
            line('Share', r.errors ? pctOf(r.errors, r.tools) : ''),
            line('Turn', `${r.n} of ${r.of}`)
        ])}">${r.errors || ''}</td>`,
        cost: r => `<td class="num" title="${turnTip(r)}"><strong>${r.cost ? C.fmtUSD(r.cost) : '—'}</strong></td>`
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
        const scope = originMeta(filters.origin);
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
            return `<tr class="click turnrow${o ? ' open' : ''}" data-turn="${C.esc(r.file)}" data-ts="${r.ts || 0}"
                ${window.AFSessionCtx.row(r, { webviewSection: 'afTurnRow', turnKey: k, turnN: r.n, turnTs: r.ts || 0 })}
                title="${window.AFSessionCtx.HINT} — and this turn's own">
                <td class="foldcell"><button class="fold" data-fold="${C.esc(k)}" title="${o ? 'Hide' : 'Show'} this turn's content">${o ? '▾' : '▸'}</button></td>
                ${COLUMNS.map(c => CELL[c](r)).join('')}
            </tr>` + (o ? `<tr class="turnbody"><td></td><td colspan="${COLUMNS.length}">${turnBodyHtml(r)}</td></tr>` : '');
        }).join('');

        return `
        <div class="chiprow">
            <span class="muted small">Sort by:</span>
            <select class="af-sort">${SORTS.map(s => `<option value="${s.id}"${s.id === sort ? ' selected' : ''}>${s.label}</option>`).join('')}</select>
            <span class="muted small">List:</span>
            <input type="number" class="af-count" min="1" step="1" value="${tableN > 0 ? tableN : ''}" placeholder="all" title="How many turns to list after sorting — empty means all">
            <button class="chip af-allrows${tableN === 0 ? ' on' : ''}" title="List every turn (click again to go back to ${DEFAULT_N})">All</button>
            <span class="muted small">Turns:</span>
            <button class="chip af-expand" title="Unfold every listed turn (reads each transcript once)">Expand all</button>
            <button class="chip af-collapse" title="Fold all turns closed">Collapse all</button>
            <button class="chip af-single${single ? ' on' : ''}" title="Only one turn open at a time: unfolding a turn folds the previous one">Single-open</button>
            <button class="chip af-oswitch${filters.origin ? ' on' : ''}" title="Scope: ${scope.tip} · click to ${filters.origin ? 'show everything' : 'go back to your own sessions'}">${scope.glyph}</button>
            <button class="chip af-filter${nf ? ' on' : ''}" title="Filter the turns by origin, prompt text, session, agent, model, flags, ranges and dates">Filters${nf ? ` (${nf})` : ''}</button>
            <span class="muted small">${hidden > 0 ? `${pool.length}/${rows.length} turns` : `${rows.length} turns — ▸ shows a turn's content · row click opens the transcript at that turn · ● = active now`}</span>
        </div>
        ${contentChipsHtml()}
        ${filterPanelHtml()}
        <div class="tablewrap"><table>
            <tr><th></th>${COLUMNS.map(c => HEAD[c]).join('')}</tr>
            ${rowsHtml || `<tr><td colspan="${COLUMNS.length + 1}" class="muted">${rows.length ? 'No turns match the filters.' : 'No turns yet.'}</td></tr>`}
        </table></div>`;
    }

    function render() {
        document.getElementById('app').innerHTML = `
            ${STYLE}
            ${window.AFHeader.html({
                page: 'turns',
                title: 'Turns',
                sub: `every user turn across the farm, sessions unrolled · generated ${new Date(DATA.generatedAt).toLocaleString()}`,
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
        // Origin scope: one click flips User ↔ All without opening the panel.
        root.querySelector('.af-oswitch').addEventListener('click', () => {
            filters.origin = filters.origin ? '' : 'user';
            saveState();
            render();
        });
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
        if (filtersOpen) {
            const facets = filterFacets();
            ORIGINS.forEach(o =>
                wireEl(`.af-forig-${o.id || 'all'}`, 'click', () => { filters.origin = o.id; apply(); }));
            liveEl('.af-fturn', el => { filters.text = el.value || ''; apply(); });
            liveEl('.af-fsess', el => { filters.session = el.value || ''; apply(); });
            window.AFFilter.wireMulti({
                root, id: 'turns-agents',
                onChange: sel => { filters.agents = sel; apply(); }
            });
            window.AFFilter.wireMulti({
                root, id: 'turns-models',
                onChange: sel => { filters.models = sel; apply(); }
            });
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

    render();
})();
