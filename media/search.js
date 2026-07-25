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
    let agDocCloseWired = false;
    // Role chips: dialog is the default — tool traffic is opt-in, or the noise
    // would drown the conversation ("memory" matches hundreds of file listings).
    const ROLE_CHIPS = [
        { id: 'user', label: '🧑 User' },
        { id: 'assistant', label: '🤖 Agent' },
        { id: 'tool', label: '🔧 Tool calls' },
        { id: 'toolResult', label: '📄 Results' }
    ];
    let roleSel = new Set(['user', 'assistant']);

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

    function agentLabel() {
        if (!agentSel) { return 'Agents: all'; }
        if (!agentSel.size) { return 'Agents: none'; }
        if (agentSel.size === 1) { return 'Agent: ' + [...agentSel][0]; }
        return `Agents: ${agentSel.size}/${DATA.agents.length}`;
    }

    /** Ticked names straight from the checkboxes (the DOM is the source of truth
     *  while the menu is open — agentSel is derived from it on every change). */
    function readAgentBoxes() {
        const set = new Set();
        DATA.agents.forEach((a, i) => {
            const cb = document.getElementById('ag-' + i);
            if (cb && cb.checked) { set.add(a); }
        });
        return set;
    }

    function chipRow() {
        const dialog = roleSel.size === 2 && roleSel.has('user') && roleSel.has('assistant');
        const all = roleSel.size === ROLE_CHIPS.length;
        return `<div class="chiprow" id="rolechips">
            <span class="muted small">Search in:</span>
            <button class="chip${dialog ? ' on' : ''}" data-preset="dialog" title="You + the agent's text">Dialog</button>
            <button class="chip${all ? ' on' : ''}" data-preset="all" title="Everything incl. tool inputs and results">Everything</button>
            ${ROLE_CHIPS.map(c => `<button class="chip${roleSel.has(c.id) ? ' on' : ''}" data-chip="${c.id}">${c.label}</button>`).join('')}
            <label class="small" title="Agents' memory/*.md notes"><input id="srcmem" type="checkbox" checked> memory</label>
            <label class="small" title="Live events whose transcript is gone (external CLIs, pruned sessions)"><input id="srcevents" type="checkbox" checked> events</label>
        </div>`;
    }

    function shell() {
        const fileScope = !!(preset && preset.file);
        const agentMenu = `<span id="agwrap" style="position:relative; display:inline-block">
            <button class="secondary" id="agbtn" ${fileScope ? 'disabled' : ''} title="Pick which agents to search — tick any combination">${C.esc(agentLabel())} ▾</button>
            <div id="agmenu" class="agmenu" hidden>
                <div class="agtools"><a id="agall">Select all</a> · <a id="agnone">Clear</a></div>
                ${DATA.agents.map((a, i) =>
                    `<label class="agitem"><input type="checkbox" id="ag-${i}" data-agent="${C.esc(a)}"${!agentSel || agentSel.has(a) ? ' checked' : ''}> ${C.esc(a)}</label>`).join('')}
            </div>
        </span>`;
        document.getElementById('app').innerHTML = `
            <style>
                .chiprow { display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin-top:8px; }
                .chip { font-size:11px; padding:2px 10px; border-radius:10px; cursor:pointer;
                    background:transparent; color:var(--vscode-foreground); opacity:.75;
                    border:1px solid var(--vscode-widget-border, #4444); }
                .chip.on { background:var(--vscode-button-background); color:var(--vscode-button-foreground);
                    border-color:transparent; opacity:1; }
                .scopepill { font-size:11px; padding:2px 10px; border-radius:10px; white-space:nowrap;
                    background:var(--vscode-badge-background); color:var(--vscode-badge-foreground); }
                .scopepill a { cursor:pointer; margin-left:4px; }
                .agmenu { position:absolute; right:0; top:calc(100% + 4px); z-index:60;
                    min-width:180px; max-height:280px; overflow:auto; padding:6px 12px 8px;
                    background:var(--vscode-editorWidget-background, var(--vscode-editor-background));
                    border:1px solid var(--vscode-widget-border, #4444); border-radius:4px;
                    box-shadow:0 4px 12px rgba(0,0,0,.3); text-align:left; }
                .agmenu .agtools { font-size:11px; margin-bottom:5px; white-space:nowrap;
                    color:var(--vscode-descriptionForeground); }
                .agmenu .agtools a { cursor:pointer; }
                .agmenu .agitem { display:block; padding:2px 0; cursor:pointer;
                    white-space:nowrap; font-size:12px; }
                .agmenu .agitem input { cursor:pointer; margin-right:6px; vertical-align:middle; }
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
                    <input id="q" type="text" placeholder="Search text, regex or a semantic question…" style="flex:1; min-width:240px; padding:6px 8px" autofocus>
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
                memory: document.getElementById('srcmem').checked,
                events: document.getElementById('srcevents').checked
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
        ['regex', 'case', 'srcmem', 'srcevents'].forEach(id =>
            document.getElementById(id).addEventListener('change', scheduleRun));

        // ---- agent picker (checkbox dropdown) ----
        const agbtn = document.getElementById('agbtn');
        const agmenu = document.getElementById('agmenu');
        const syncAgentUi = () => { agbtn.textContent = agentLabel() + ' ▾'; };
        // a selection that no longer matches the "Agent: X" pill retires the pill
        const dropStaleAgentPreset = () => {
            if (preset && preset.agentName &&
                !(agentSel && agentSel.size === 1 && agentSel.has(preset.agentName))) {
                preset = null;
                const sc = document.getElementById('scope');
                if (sc) { sc.innerHTML = scopeLine(); }
            }
        };
        const applyAgentSet = (set) => {
            agentSel = set.size === DATA.agents.length ? null : set;
            syncAgentUi();
            dropStaleAgentPreset();
            scheduleRun();
        };
        agbtn.addEventListener('click', () => { agmenu.hidden = !agmenu.hidden; });
        DATA.agents.forEach((a, i) => {
            const cb = document.getElementById('ag-' + i);
            if (cb) { cb.addEventListener('change', () => applyAgentSet(readAgentBoxes())); }
        });
        document.getElementById('agall').addEventListener('click', () => {
            DATA.agents.forEach((_a, i) => {
                const cb = document.getElementById('ag-' + i);
                if (cb) { cb.checked = true; }
            });
            applyAgentSet(new Set(DATA.agents));
        });
        document.getElementById('agnone').addEventListener('click', () => {
            DATA.agents.forEach((_a, i) => {
                const cb = document.getElementById('ag-' + i);
                if (cb) { cb.checked = false; }
            });
            applyAgentSet(new Set());
        });
        // close on any click outside the picker (wired once; clicks inside stop here)
        const agwrap = document.getElementById('agwrap');
        if (agwrap && typeof agwrap.addEventListener === 'function') {
            agwrap.addEventListener('click', ev => { if (ev && ev.stopPropagation) { ev.stopPropagation(); } });
        }
        if (!agDocCloseWired && typeof document.addEventListener === 'function') {
            agDocCloseWired = true;
            document.addEventListener('click', () => {
                const m = document.getElementById('agmenu');
                if (m) { m.hidden = true; }
            });
        }
        semBox.addEventListener('change', () => {
            document.getElementById('regexLbl').style.opacity = semBox.checked ? '0.4' : '1';
            document.getElementById('caseLbl').style.opacity = semBox.checked ? '0.4' : '1';
        });
        document.querySelectorAll('#rolechips .chip').forEach(chip => chip.addEventListener('click', () => {
            if (chip.dataset.preset === 'dialog') { roleSel = new Set(['user', 'assistant']); }
            else if (chip.dataset.preset === 'all') { roleSel = new Set(ROLE_CHIPS.map(c => c.id)); }
            else {
                const id = chip.dataset.chip;
                if (roleSel.has(id)) { roleSel.delete(id); } else { roleSel.add(id); }
                if (!roleSel.size) { roleSel = new Set(['user', 'assistant']); }
            }
            const held = { q: q.value, sem: semBox.checked };
            shell();
            document.getElementById('q').value = held.q;
            document.getElementById('semantic').checked = held.sem;
            if (held.q.trim()) { document.getElementById('go').click(); } else { document.getElementById('q').focus(); }
        }));
        const clear = document.getElementById('clearscope');
        if (clear) {
            // ✕ = back to fleet-wide: the agent pick widens back to all too
            clear.addEventListener('click', () => { preset = null; agentSel = null; shell(); });
        }
        wireCommon();
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
        return `<div class="hit" data-hit="${i}">
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
            return `<div class="sessgroup">
                <div class="sesshead" data-open-session="${C.esc(first.file)}" data-ts="${first.ts || 0}" title="Open this session">
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
        out.querySelectorAll('[data-hit]').forEach(el =>
            el.addEventListener('click', () => {
                const hit = r.hits[Number(el.dataset.hit)];
                if (hit.kind === 'memory') {
                    vscode.postMessage({ type: 'openFile', file: hit.file });
                } else if (hit.kind === 'event') {
                    if (hit.file) { vscode.postMessage({ type: 'openSession', file: hit.file, ts: hit.ts || 0 }); }
                    else { vscode.postMessage({ type: 'openTimeline' }); }
                } else {
                    // ts rides along: the viewer opens scrolled to the matched message.
                    vscode.postMessage({ type: 'openSession', file: hit.file, ts: hit.ts || 0 });
                }
            }));
        out.querySelectorAll('[data-open-session]').forEach(el =>
            el.addEventListener('click', () => vscode.postMessage({
                type: 'openSession', file: el.dataset.openSession, ts: Number(el.dataset.ts) || 0
            })));
    }

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
