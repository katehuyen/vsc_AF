// Agent Farm — search page script (text/regex + semantic, scoped, grouped).
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    const DATA = window.__DATA__;

    let lastResult = null;
    let semStatus = DATA.semantic || { provider: 'off', sessions: 0, chunks: 0 };
    let searching = false;
    let timer;
    // Auto-search: every control change re-runs the search (measured: a full
    // everything-scan is ~1.4s on a 95MB fleet, and a 10s engine time budget
    // bounds the worst case). seq lets us drop superseded results.
    let seq = 0;
    // Scope preset pushed by the opener (viewer → one session, agent page → one
    // agent). Cleared with the ✕ pill; fleet-wide otherwise.
    let preset = DATA.preset || null;
    // Agent picker: null = all agents (no filter — a new agent joining the fleet
    // is included without touching the picker; unassigned "Other projects"
    // sessions stay visible too). A Set = exactly the ticked subset; an empty
    // Set honestly matches nothing.
    let agentSel = preset && preset.agentName ? new Set([preset.agentName]) : null;
    // Role chips: dialog is the default — tool traffic is opt-in, or the noise
    // would drown the conversation ("memory" matches hundreds of file listings).
    const ROLE_CHIPS = [
        { id: 'user', label: '🧑 User', tip: 'What YOU asked — prompts only' },
        { id: 'assistant', label: '🤖 Agent', tip: "The agent's own words — its replies only" },
        { id: 'tool', label: '🔧 Tool calls', tip: 'What it ran: commands, paths, patterns, queries' },
        { id: 'toolResult', label: '📄 Results', tip: 'What came back — file contents, command output' }
    ];
    let roleSel = new Set(['user', 'assistant']);

    /**
     * ‼️ CLICKING A KIND MEANS "ONLY THIS KIND". Ctrl/⌘-click adds and removes.
     *
     * These chips were a plain toggle, and with Dialog as the default that made
     * the two most useful questions on the page unreachable by the obvious
     * gesture: pressing 🧑 User — visibly lit, because Dialog is user+agent —
     * SWITCHED IT OFF and left the search running over agent replies alone. The
     * chip you pressed went dark and the one you did not touch stayed lit, so
     * the row read as broken; what it was actually doing was the opposite of
     * what it looked like. "Search only my prompts" and "search only its
     * answers" now cost one press each, which is what they are worth.
     *
     * This is the rule the Console's show-filter already uses for the same
     * reason (K-1): the name means "only that one", the modifier means "and
     * also". One vocabulary across the extension, learned once.
     */
    const ROLE_HINT = 'Click a kind to search ONLY in it · Ctrl-click (⌘ on Mac) to add or remove one';

    /** Which results are ordered how. The engine returns newest-session-first;
     *  these re-order the SESSION GROUPS, never the hits inside one — a session
     *  is read forwards, and shuffling it would make the turn headers a lie. */
    const SORTS = [
        { id: 'newest', label: 'Newest first', tip: 'Most recently active session at the top — the engine\'s own order' },
        { id: 'oldest', label: 'Oldest first', tip: 'Where did this start — the earliest session that mentions it' },
        { id: 'hits', label: 'Most matches', tip: 'The session that says it most, first — where the subject actually lives' },
        { id: 'agent', label: 'By agent', tip: 'Grouped by agent name, A→Z, newest first within each' }
    ];
    // The date window is the engine's own `tsFrom..tsTo` (core/search.ts): it
    // filters the MESSAGE, not the session, so "last Tuesday" means what was
    // said that day and not every session that happens to have been touched.
    let flt = { from: '', to: '', sort: 'newest' };
    // The two extra sources. Held here rather than read off the DOM because
    // `shell()` rebuilds the whole page on every chip press, and a checkbox
    // written as `checked` in the markup came back ticked however you left it.
    let srcMem = true, srcEvents = true;
    const fltDefaults = () => ({ from: '', to: '', sort: 'newest' });
    const fltActive = () => !!(flt.from || flt.to) || flt.sort !== 'newest'
        || !(roleSel.size === 2 && roleSel.has('user') && roleSel.has('assistant'));
    /** A day string from a date box → the ms bound the engine wants. `to` is the
     *  END of its day, or a one-day window would find nothing. */
    const dayMs = (d, end) => {
        if (!d) { return 0; }
        const t = Date.parse(end ? `${d}T23:59:59.999` : `${d}T00:00:00.000`);
        return Number.isFinite(t) ? t : 0;
    };

    function relTime(ts) {
        if (!ts) return '';
        const s = Math.round((Date.now() - ts) / 1000);
        if (s < 60) return s + 's ago';
        const m = Math.round(s / 60);
        if (m < 60) return m + 'm ago';
        const h = Math.round(m / 60);
        if (h < 24) return h + 'h ago';
        return Math.round(h / 24) + 'd ago';
    }

    function semLine() {
        if (semStatus.provider === 'off') {
            return 'Semantic mode is off — <a id="semsettings">enable it in Farm Settings</a> (gemini, or openai-compatible incl. local Ollama).';
        }
        return `Semantic index (<b>${C.esc(semStatus.provider)}</b>): ${semStatus.sessions} session(s), ${semStatus.chunks} chunk(s) · <a id="build">update index</a>`;
    }

    function scopeLine() {
        if (preset && preset.file) {
            return `<span class="scopepill">Session: ${C.esc(preset.title || preset.file.split(/[\\/]/).pop())} <a id="clearscope" title="Back to fleet-wide search">✕</a></span>`;
        }
        if (preset && preset.agentName) {
            return `<span class="scopepill">Agent: ${C.esc(preset.agentName)} <a id="clearscope" title="Back to fleet-wide search">✕</a></span>`;
        }
        return '';
    }

    /**
     * The filter panel — the same three-row shape the Sessions and Turns tables
     * use (kinds · sources · when/sort/clear), so a reader who has learned one
     * of those pages has learned this one.
     */
    function chipRow() {
        const dialog = roleSel.size === 2 && roleSel.has('user') && roleSel.has('assistant');
        const all = roleSel.size === ROLE_CHIPS.length;
        // ‼️ The word says what the row is doing RIGHT NOW, so the answer to
        // "which one is on" never depends on reading four chips at once.
        const scopeWord = all ? 'everything'
            : dialog ? 'the conversation'
                : roleSel.size === 1
                    ? (ROLE_CHIPS.find(c => roleSel.has(c.id)) || {}).label || '—'
                    : `${roleSel.size} kinds`;
        return `<div class="chiprow" id="rolechips">
            <span class="muted small" title="${C.esc(ROLE_HINT)}">Search in:</span>
            <button class="chip${dialog ? ' on' : ''}" data-preset="dialog" title="You + the agent's text — the conversation, without the machinery">Dialog</button>
            <button class="chip${all ? ' on' : ''}" data-preset="all" title="Everything incl. tool inputs and results">Everything</button>
            <span class="chipsep"></span>
            ${ROLE_CHIPS.map(c => `<button class="chip${roleSel.has(c.id) ? ' on' : ''}" data-chip="${c.id}"
                title="${C.esc(c.tip)} — ${ROLE_HINT}">${c.label}</button>`).join('')}
            <span class="muted small nowrap" title="${C.esc(ROLE_HINT)}">→ ${C.esc(scopeWord)}</span>
            <span class="grow"></span>
            <label class="small" title="Agents' memory/*.md notes"><input id="srcmem" type="checkbox"${srcMem ? ' checked' : ''}> memory</label>
            <label class="small" title="Live events whose transcript is gone (external CLIs, pruned sessions)"><input id="srcevents" type="checkbox"${srcEvents ? ' checked' : ''}> events</label>
        </div>
        <div class="chiprow">
            <label class="frange" title="Only what was SAID in this window — the engine filters the message's own time (tsFrom/tsTo), not the session's last-touched date, so a day means that day's words.">When
                <input type="date" id="f-from" value="${C.esc(flt.from)}" title="From this day, included">–<input type="date" id="f-to" value="${C.esc(flt.to)}" title="To this day, included"></label>
            <label class="small" title="Which session comes first in the results. Hits INSIDE a session always stay in the order they were said.">sort
                <select id="f-sort">${SORTS.map(s =>
            `<option value="${s.id}"${flt.sort === s.id ? ' selected' : ''} title="${C.esc(s.tip)}">${C.esc(s.label)}</option>`).join('')}</select></label>
            <button class="chip${fltActive() ? '' : ' off'}" id="f-clear"
                title="Back to the defaults: the conversation, every date, newest first. Your query and the agent picker are left alone.">Clear filters</button>
        </div>`;
    }

    function shell() {
        const fileScope = !!(preset && preset.file);
        // the extension-wide multi-pick control (media/afFilters.js) — this page
        // set the pattern, every other filter now uses the same widget
        const agentMenu = window.AFFilter.multi({
            id: 'search-agents', label: 'Agents', options: DATA.agents,
            selected: agentSel ? [...agentSel] : null, disabled: fileScope,
            title: 'Pick which agents to search — tick any combination'
        });
        document.getElementById('app').innerHTML = `
            <style>
                .chiprow { display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin-top:8px; }
                .chip { font-size:11px; padding:2px 10px; border-radius:10px; cursor:pointer;
                    background:transparent; color:var(--vscode-foreground); opacity:.75;
                    border:1px solid var(--vscode-widget-border, #4444); }
                .chip.on { background:var(--vscode-button-background); color:var(--vscode-button-foreground);
                    border-color:transparent; opacity:1; }
                /* nothing to clear — drawn, so the row does not reflow when a
                   filter is set, but plainly inert (the same rule the capture
                   box's ↺ follows on the Backlog tab) */
                .chip.off { opacity:.25; cursor:default; }
                .chip.off:hover { background:transparent; }
                /* the two presets are a different question from the four kinds:
                   "the usual readings" then "exactly these" */
                .chipsep { width:1px; align-self:stretch; margin:0 4px;
                    background:var(--vscode-widget-border, #4444); }
                .chiprow .grow { flex:1; }
                .nowrap { white-space:nowrap; }
                .frange { font-size:11px; display:inline-flex; gap:4px; align-items:center; }
                .frange input { font-size:11px; padding:1px 4px; }
                .scopepill { font-size:11px; padding:2px 10px; border-radius:10px; white-space:nowrap;
                    background:var(--vscode-badge-background); color:var(--vscode-badge-foreground); }
                .scopepill a { cursor:pointer; margin-left:4px; }
                .sessgroup { margin-bottom:12px; }
                .sessgroup > .sesshead { cursor:pointer; padding:6px 10px; border-radius:4px;
                    background:color-mix(in srgb, var(--vscode-textLink-foreground) 10%, transparent);
                    border-left:3px solid var(--vscode-textLink-foreground); }
                .turnhead { margin:8px 0 2px 10px; font-size:11px; color:var(--vscode-descriptionForeground); }
                .hit { cursor:pointer; padding:5px 10px; margin-left:10px; border-radius:4px; }
                .hit:hover { background:var(--vscode-list-hoverBackground); }
                .srchead { margin:16px 0 6px; font-size:12px; font-weight:600; opacity:.8; }
                mark { background:var(--vscode-editor-findMatchHighlightBackground, #6a5); color:inherit; }
            </style>
            ${window.AFHeader.html({
                page: 'search',
                title: 'Search',
                sub: `Dialog, tool traffic, agents' memory notes and orphaned live events — scoped to fleet, agent or session. <a data-guide="transcript-arama">?</a>`,
                refresh: false,
                guide: 'transcript-arama'
            })}
            <div class="card" style="margin-top:10px">
                <div class="btnrow" style="flex-wrap:wrap; align-items:center">
                    <input id="q" type="text" placeholder="Search text, regex or a semantic question…" style="flex:1; min-width:240px; padding:6px 8px" autofocus
                        title="${C.esc(window.AFQuery.tip('Searched against whatever the scope and the kind chips let through. “regex” hands the box to RegExp instead and none of the grammar below applies.'))}">
                    <span id="scope">${scopeLine()}</span>
                    ${agentMenu}
                    <label class="small"><input id="semantic" type="checkbox"> semantic</label>
                    <label class="small" id="regexLbl"><input id="regex" type="checkbox"> regex</label>
                    <label class="small" id="caseLbl"><input id="case" type="checkbox"> match case</label>
                    <button id="go">Search</button>
                </div>
                ${chipRow()}
                <div class="muted small" id="semStatus" style="margin-top:6px">${semLine()}</div>
            </div>
            <div id="out" style="margin-top:12px"><p class="muted">Type a query and press Enter.</p></div>`;

        const q = document.getElementById('q');
        const semBox = document.getElementById('semantic');
        const run = () => {
            const query = q.value;
            if (!query.trim()) { return; }
            searching = true;
            renderResults();
            vscode.postMessage({
                type: 'search',
                query,
                seq: ++seq,
                semantic: semBox.checked,
                regex: document.getElementById('regex').checked,
                caseSensitive: document.getElementById('case').checked,
                // null = all agents (no filter); an array = exactly that set
                agents: preset && preset.file ? null : (agentSel ? [...agentSel] : null),
                file: preset && preset.file ? preset.file : '',
                roles: [...roleSel],
                memory: srcMem,
                events: srcEvents,
                // the engine's own message-time window (core/search.ts)
                tsFrom: dayMs(flt.from, false),
                tsTo: dayMs(flt.to, true)
            });
        };
        // Any control change re-searches after a short debounce — but never in
        // semantic mode, where each query is a paid embedding call.
        const scheduleRun = () => {
            clearTimeout(timer);
            if (!semBox.checked && q.value.trim()) { timer = setTimeout(run, 250); }
        };
        window.AFHeader.wire(vscode);
        document.getElementById('go').addEventListener('click', run);
        q.addEventListener('keydown', ev => { if (ev.key === 'Enter') run(); });
        q.addEventListener('input', () => {
            clearTimeout(timer);
            if (!semBox.checked && q.value.trim().length >= 3) { timer = setTimeout(run, 500); }
        });
        // ✕ inside the box — the shared control (common.css `.af-clr`). Clearing
        // it clears the RESULTS too: leaving the last search's hits under an
        // empty box is the page claiming to have found something for nothing.
        window.AFFilter.clearable(q, () => {
            clearTimeout(timer);
            lastResult = null;
            searching = false;
            const out = document.getElementById('out');
            if (out) { out.innerHTML = '<p class="muted">Type a query and press Enter.</p>'; }
        });
        ['regex', 'case'].forEach(id =>
            document.getElementById(id).addEventListener('change', scheduleRun));
        const srcBox = (id, set) => {
            const el = document.getElementById(id);
            if (el) { el.addEventListener('change', () => { set(el.checked); scheduleRun(); }); }
        };
        srcBox('srcmem', v => { srcMem = v; });
        srcBox('srcevents', v => { srcEvents = v; });

        // ---- when / sort / clear (the Sessions and Turns filter vocabulary) ----
        // AFFilter.live is what the tables use, and it is what keeps the native
        // calendar from closing under the cursor: a date box commits on `change`
        // only, never on the half-formed values a picker walks through (A-4).
        window.AFFilter.live(document.getElementById('f-from'), el => { flt.from = el.value; scheduleRun(); }, 300);
        window.AFFilter.live(document.getElementById('f-to'), el => { flt.to = el.value; scheduleRun(); }, 300);
        const sortSel = document.getElementById('f-sort');
        if (sortSel) {
            // sorting is a re-read of what is already here — no round trip
            sortSel.addEventListener('change', () => { flt.sort = sortSel.value; rebuildKeepingQuery(false); });
        }
        const clearBtn = document.getElementById('f-clear');
        if (clearBtn && fltActive()) {
            clearBtn.addEventListener('click', () => {
                flt = fltDefaults();
                roleSel = new Set(['user', 'assistant']);
                rebuildKeepingQuery(true);
            });
        }

        // ---- agent picker (the shared multi-pick control) ----
        // a selection that no longer matches the "Agent: X" pill retires the pill
        const dropStaleAgentPreset = () => {
            if (preset && preset.agentName &&
                !(agentSel && agentSel.size === 1 && agentSel.has(preset.agentName))) {
                preset = null;
                const sc = document.getElementById('scope');
                if (sc) { sc.innerHTML = scopeLine(); }
            }
        };
        window.AFFilter.wireMulti({
            id: 'search-agents',
            onChange: sel => {
                agentSel = sel === null ? null : new Set(sel);
                dropStaleAgentPreset();
                scheduleRun();
            }
        });
        semBox.addEventListener('change', () => {
            document.getElementById('regexLbl').style.opacity = semBox.checked ? '0.4' : '1';
            document.getElementById('caseLbl').style.opacity = semBox.checked ? '0.4' : '1';
        });
        document.querySelectorAll('#rolechips .chip').forEach(chip => chip.addEventListener('click', ev => {
            if (chip.dataset.preset === 'dialog') { roleSel = new Set(['user', 'assistant']); }
            else if (chip.dataset.preset === 'all') { roleSel = new Set(ROLE_CHIPS.map(c => c.id)); }
            else {
                const id = chip.dataset.chip;
                // ‼️ PLAIN CLICK = ONLY THIS ONE (see ROLE_HINT). Toggling was
                // the whole reported breakage: with Dialog on, pressing 🧑 User
                // — lit — turned it OFF, so the chip you pressed went dark and
                // the search silently became "agent replies only". The gesture
                // now says what it looks like it says, and the two questions
                // this page most needs ("only my prompts", "only its answers")
                // are one press each. Ctrl/⌘ keeps the old add-and-remove.
                if (ev.ctrlKey || ev.metaKey) {
                    if (roleSel.has(id)) { roleSel.delete(id); } else { roleSel.add(id); }
                    // an empty scope matches nothing and reads as a broken page
                    if (!roleSel.size) { roleSel = new Set([id]); }
                } else {
                    roleSel = new Set([id]);
                }
            }
            rebuildKeepingQuery(true);
        }));
        const clear = document.getElementById('clearscope');
        if (clear) {
            // ✕ = back to fleet-wide: the agent pick widens back to all too
            clear.addEventListener('click', () => { preset = null; agentSel = null; shell(); });
        }
        wireCommon();
    }

    /**
     * Rebuild the controls without losing what is typed in the box.
     *
     * Every filter on this page is part of the markup, so changing one means
     * `shell()` — and `shell()` writes an empty query box. The query is the one
     * thing on the page the user paid for with typing, so it is carried across
     * by hand, along with the semantic tick (which decides whether a rerun
     * costs money and must not be flipped by a repaint).
     *
     * `rerun` is false for anything the results can answer without the host —
     * changing the sort re-reads hits that are already here.
     */
    function rebuildKeepingQuery(rerun) {
        const qEl = document.getElementById('q');
        const semEl = document.getElementById('semantic');
        const held = { q: qEl ? qEl.value : '', sem: semEl ? semEl.checked : false };
        shell();
        const q2 = document.getElementById('q');
        const sem2 = document.getElementById('semantic');
        if (q2) {
            q2.value = held.q;
            // the ✕ is drawn from the value, and the value arrived after wiring
            q2.dispatchEvent(new Event('change'));
        }
        if (sem2) { sem2.checked = held.sem; }
        if (rerun && held.q.trim()) { document.getElementById('go').click(); return; }
        renderResults();
        if (!held.q.trim() && q2) { q2.focus(); }
    }

    function wireCommon() {
        document.querySelectorAll('[data-guide]').forEach(a =>
            a.addEventListener('click', () => vscode.postMessage({ type: 'openGuide', anchor: a.dataset.guide })));
        const build = document.getElementById('build');
        if (build) { build.addEventListener('click', () => vscode.postMessage({ type: 'buildIndex' })); }
        const sem = document.getElementById('semsettings');
        if (sem) { sem.addEventListener('click', () => vscode.postMessage({ type: 'openFarmSettings', focus: 'agentFarm.embeddingsProvider' })); }
    }

    function hitLine(h, i) {
        const badges = [
            `<span class="badge">${C.esc(h.role)}${h.tool ? ' · ' + C.esc(h.tool) : ''}</span>`,
            typeof h.score === 'number' ? `<span class="badge">${Math.round(h.score * 100)}%</span>` : ''
        ].filter(Boolean).join(' ');
        // ‼️ A transcript hit is a SESSION as well as a match, so it publishes
        // itself as `afSearchHit` — a member of the session family in
        // src/core/ctxmenu.ts. One right-click therefore offers what you can do
        // to that session AND what is true only of this match: open the
        // transcript at this moment, narrow the search, copy the line. A memory
        // or event hit is not a session and is given nothing it cannot do.
        const isSession = h.kind !== 'memory' && h.kind !== 'event' && !!h.file;
        const ctx = isSession
            ? ' ' + window.AFSessionCtx.row(h, { webviewSection: 'afSearchHit', hitIndex: i, hitTs: h.ts || 0 })
            : '';
        return `<div class="hit" data-hit="${i}"${ctx}${isSession
            ? ` title="Open this moment — ${window.AFSessionCtx.HINT}, and this match's own"` : ''}>
            <span class="muted small" style="float:right">${relTime(h.ts)}</span>
            ${badges} ${C.esc(h.before)}${h.match ? `<mark>${C.esc(h.match)}</mark>` : ''}${C.esc(h.after)}
        </div>`;
    }

    /** Session → turn tree for transcript hits; flat sections for memory/events. */
    function renderResults() {
        const out = document.getElementById('out');
        if (searching) {
            out.innerHTML = '<p class="muted">Searching…</p>';
            return;
        }
        if (!lastResult) { return; }
        const r = lastResult;
        if (r.error) {
            out.innerHTML = `<p class="muted">⚠ ${C.esc(r.error)}</p>`;
            return;
        }
        if (!r.hits.length) {
            out.innerHTML = `<p class="muted">No matches in ${r.filesScanned} session(s).</p>`;
            return;
        }
        const trans = [], mem = [], evs = [];
        r.hits.forEach((h, i) => {
            if (h.kind === 'memory') { mem.push(i); }
            else if (h.kind === 'event') { evs.push(i); }
            else { trans.push(i); }
        });

        // group transcript hits by session file, keep engine order (newest first)
        const groups = [];
        const byFile = {};
        for (const i of trans) {
            const h = r.hits[i];
            if (!byFile[h.file]) { byFile[h.file] = { hits: [] }; groups.push(byFile[h.file]); }
            byFile[h.file].hits.push(i);
        }
        /**
         * ‼️ ONLY THE GROUPS MOVE. The hits inside a session stay in the order
         * they were said — the turn sub-headers are computed by walking that
         * order, so a session sorted by anything else would print "Turn 7"
         * above a line from turn 2 and the map would lie.
         *
         * The engine hands them over newest-session-first, which is `newest`
         * and therefore costs nothing. The other three are a re-read of what is
         * already on the page: no round trip, and the same figures.
         */
        const groupTs = g => r.hits[g.hits[0]].ts || 0;
        const groupAgent = g => String(r.hits[g.hits[0]].agentName || '');
        if (flt.sort === 'oldest') { groups.sort((a, b) => groupTs(a) - groupTs(b)); }
        else if (flt.sort === 'hits') { groups.sort((a, b) => b.hits.length - a.hits.length || groupTs(b) - groupTs(a)); }
        else if (flt.sort === 'agent') {
            groups.sort((a, b) => groupAgent(a).localeCompare(groupAgent(b)) || groupTs(b) - groupTs(a));
        }
        const sessHtml = groups.map(g => {
            const first = r.hits[g.hits[0]];
            // turn sub-headers whenever the turn changes (hits arrive in file order)
            let lastTurn = null;
            const body = g.hits.map(i => {
                const h = r.hits[i];
                const th = h.turn !== lastTurn && h.turn
                    ? `<div class="turnhead">Turn ${h.turn}${h.turnLabel ? ' — ' + C.esc(h.turnLabel) : ''}</div>` : '';
                lastTurn = h.turn;
                return th + hitLine(h, i);
            }).join('');
            // The group header is a session row: right-click gets that
            // session's full action set (afSessionCtx.js). A hit knows the
            // transcript path but not always the session id — the host resolves
            // one from the other, so the menu is the same as everywhere else.
            return `<div class="sessgroup">
                <div class="sesshead" data-open-session="${C.esc(first.file)}" data-ts="${first.ts || 0}"
                    ${window.AFSessionCtx.row(first)}
                    title="Open this session — ${window.AFSessionCtx.HINT}">
                    <strong>${C.esc(first.agentName)}</strong> · ${C.esc(first.title)}
                    <span class="muted small" style="float:right">${g.hits.length} hit(s) · ${relTime(first.ts)}</span>
                </div>
                ${body}
            </div>`;
        }).join('');

        const memHtml = mem.length
            ? `<div class="srchead">📝 Memory notes</div>` + mem.map(i => hitLine(r.hits[i], i)).join('')
            : '';
        const evHtml = evs.length
            ? `<div class="srchead">⌁ Live events (no transcript left)</div>` + evs.map(i => hitLine(r.hits[i], i)).join('')
            : '';

        out.innerHTML = `
            <p class="muted small">${r.hits.length} match(es) in ${r.filesScanned} scanned session(s)${r.timedOut ? ' — ⏱ time budget hit, results are partial (narrow the scope or query)' : r.truncated ? ' — results capped, refine your query' : ''}.</p>
            ${sessHtml}${memHtml}${evHtml}`;
        // ‼️ THE ANSWER OPENS IN THE SCOPE THE QUESTION WAS ASKED IN. A hit is
        // reached by clicking it, and the transcript used to open showing
        // EVERYTHING — tool calls, results, the lot — however narrow the search
        // had been. Searching in Dialog is a statement about what you are
        // looking through, and it has to survive the click, or the page you
        // land on is answering a question you did not ask. `roles` carries it
        // (see SessionViewerPanel.show); searched in Everything, it opens in
        // everything, which is the same rule and not an exception to it.
        const openSession = (file, ts) => vscode.postMessage({
            type: 'openSession', file, ts: ts || 0, roles: [...roleSel]
        });
        out.querySelectorAll('[data-hit]').forEach(el =>
            el.addEventListener('click', () => {
                const hit = r.hits[Number(el.dataset.hit)];
                if (hit.kind === 'memory') {
                    vscode.postMessage({ type: 'openFile', file: hit.file });
                } else if (hit.kind === 'event') {
                    if (hit.file) { openSession(hit.file, hit.ts); }
                    else { vscode.postMessage({ type: 'openTimeline' }); }
                } else {
                    // ts rides along: the viewer opens scrolled to the matched message.
                    openSession(hit.file, hit.ts);
                }
            }));
        out.querySelectorAll('[data-open-session]').forEach(el =>
            el.addEventListener('click', () => openSession(el.dataset.openSession, Number(el.dataset.ts) || 0)));
    }

    // ------------------------------------------------------- right-click menu

    /**
     * A match's own half of the menu. Narrowing the scope is the act this page
     * needed most: the two questions a hit raises are "what else did this
     * session say" and "what else has this agent said", and both meant finding
     * the scope controls and retyping the query. Both run the page's own scope
     * preset — the same one the viewer and the agent page push in.
     */
    function ctxDo(act, ctx) {
        const verb = act.split(':')[0];
        const arg = act.slice(verb.length + 1);
        const hit = lastResult && lastResult.hits ? lastResult.hits[Number(ctx.hitIndex)] : null;

        if (verb === 'shOpen') {
            // the same handover the left-click makes — see openSession above
            vscode.postMessage({
                type: 'openSession', file: String(ctx.file || ''), ts: Number(ctx.hitTs) || 0,
                roles: [...roleSel]
            });
            return;
        }
        if (verb === 'shOnly') {
            if (arg === 'agent' && ctx.agentName) {
                preset = { agentName: String(ctx.agentName) };
                agentSel = new Set([String(ctx.agentName)]);
            } else {
                preset = { file: String(ctx.file || ''), title: String(ctx.title || '') };
            }
            // shell() repaints the controls and re-runs whatever is typed.
            shell();
            const go = document.getElementById('go');
            const q = document.getElementById('q');
            if (go && q && q.value.trim()) { go.click(); }
            return;
        }
        if (verb === 'shCopy') {
            if (!hit) { window.AFCtx.copy(''); return; }
            window.AFCtx.copy(arg === 'context'
                ? String(hit.before || '') + String(hit.match || '') + String(hit.after || '')
                : String(hit.match || hit.before || ''));
        }
    }

    // ‼️ ONCE, at module scope — renderResults() rebuilds every hit each search.
    window.AFCtx.listen(ctxDo);

    window.addEventListener('message', ev => {
        if (ev.data.type === 'preset') {
            preset = ev.data.preset || null;
            if (preset && preset.agentName) { agentSel = new Set([preset.agentName]); }
            shell();
            return;
        }
        if (ev.data.type === 'results') {
            // a newer search is already in flight — drop this stale result
            if (ev.data.seq && ev.data.seq !== seq) { return; }
            searching = false;
            lastResult = ev.data.result;
            if (ev.data.semanticStatus) {
                semStatus = ev.data.semanticStatus;
                const el = document.getElementById('semStatus');
                if (el) { el.innerHTML = semLine(); wireCommon(); }
            }
            renderResults();
        }
    });

    shell();
})();
