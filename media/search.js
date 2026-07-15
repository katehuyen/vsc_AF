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
    // Role chips: dialog is the default — tool traffic is opt-in, or the noise
    // would drown the conversation ("memory" matches hundreds of file listings).
    const ROLE_CHIPS = [
        { id: 'user', label: 'User' },
        { id: 'assistant', label: 'Assistant' },
        { id: 'tool', label: 'Tool calls' },
        { id: 'toolResult', label: 'Results' }
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

    function chipRow() {
        const dialog = roleSel.size === 2 && roleSel.has('user') && roleSel.has('assistant');
        const all = roleSel.size === ROLE_CHIPS.length;
        return `<div class="chiprow" id="rolechips">
            <span class="muted small">Search in:</span>
            <button class="chip${dialog ? ' on' : ''}" data-preset="dialog" title="You + assistant text">Dialog</button>
            <button class="chip${all ? ' on' : ''}" data-preset="all" title="Everything incl. tool inputs and results">Everything</button>
            ${ROLE_CHIPS.map(c => `<button class="chip${roleSel.has(c.id) ? ' on' : ''}" data-chip="${c.id}">${c.label}</button>`).join('')}
            <label class="small" title="Agents' memory/*.md notes"><input id="srcmem" type="checkbox" checked> memory</label>
            <label class="small" title="Live events whose transcript is gone (external CLIs, pruned sessions)"><input id="srcevents" type="checkbox" checked> events</label>
        </div>`;
    }

    function shell() {
        const agentOpts = ['<option value="">All agents</option>']
            .concat(DATA.agents.map(a => `<option value="${C.esc(a)}"${preset && preset.agentName === a ? ' selected' : ''}>${C.esc(a)}</option>`))
            .join('');
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
            <div class="spread">
                <div><h1>Search</h1>
                <div class="muted small">Dialog, tool traffic, agents' memory notes and orphaned live events — scoped to fleet, agent or session. <a data-guide="transcript-arama">?</a></div></div>
            </div>
            <div class="card" style="margin-top:10px">
                <div class="btnrow" style="flex-wrap:wrap; align-items:center">
                    <input id="q" type="text" placeholder="Search text, regex or a semantic question…" style="flex:1; min-width:240px; padding:6px 8px" autofocus>
                    <span id="scope">${scopeLine()}</span>
                    <select id="agent" ${preset && preset.file ? 'disabled' : ''}>${agentOpts}</select>
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
                agent: preset && preset.file ? '' : document.getElementById('agent').value,
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
        document.getElementById('go').addEventListener('click', run);
        q.addEventListener('keydown', ev => { if (ev.key === 'Enter') run(); });
        q.addEventListener('input', () => {
            clearTimeout(timer);
            if (!semBox.checked && q.value.trim().length >= 3) { timer = setTimeout(run, 500); }
        });
        ['agent', 'regex', 'case', 'srcmem', 'srcevents'].forEach(id =>
            document.getElementById(id).addEventListener('change', scheduleRun));
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
            clear.addEventListener('click', () => { preset = null; shell(); });
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
