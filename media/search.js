// Agent Farm — transcript search page script (text/regex + semantic).
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    const DATA = window.__DATA__;

    let lastResult = null;
    let semStatus = DATA.semantic || { provider: 'off', sessions: 0, chunks: 0 };
    let searching = false;
    let timer;

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
            return 'Semantic mode is off — set <code>agentFarm.embeddingsProvider</code> (gemini, or openai-compatible incl. local Ollama).';
        }
        return `Semantic index (<b>${C.esc(semStatus.provider)}</b>): ${semStatus.sessions} session(s), ${semStatus.chunks} chunk(s) · <a id="build">update index</a>`;
    }

    function shell() {
        const agentOpts = ['<option value="">All agents</option>']
            .concat(DATA.agents.map(a => `<option value="${C.esc(a)}">${C.esc(a)}</option>`))
            .join('');
        document.getElementById('app').innerHTML = `
            <div class="spread">
                <div><h1>Transcript Search</h1>
                <div class="muted small">Searches user prompts and assistant answers across all farm sessions. <a data-guide="transcript-arama">?</a></div></div>
            </div>
            <div class="card" style="margin-top:10px">
                <div class="btnrow" style="flex-wrap:wrap; align-items:center">
                    <input id="q" type="text" placeholder="Search text, regex or a semantic question…" style="flex:1; min-width:240px; padding:6px 8px" autofocus>
                    <select id="agent">${agentOpts}</select>
                    <label class="small"><input id="semantic" type="checkbox"> semantic</label>
                    <label class="small" id="regexLbl"><input id="regex" type="checkbox"> regex</label>
                    <label class="small" id="caseLbl"><input id="case" type="checkbox"> match case</label>
                    <button id="go">Search</button>
                </div>
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
                semantic: semBox.checked,
                regex: document.getElementById('regex').checked,
                caseSensitive: document.getElementById('case').checked,
                agent: document.getElementById('agent').value
            });
        };
        document.getElementById('go').addEventListener('click', run);
        q.addEventListener('keydown', ev => { if (ev.key === 'Enter') run(); });
        q.addEventListener('input', () => {
            clearTimeout(timer);
            // semantic queries cost an embedding call — no auto-search there
            if (!semBox.checked && q.value.trim().length >= 3) { timer = setTimeout(run, 500); }
        });
        semBox.addEventListener('change', () => {
            document.getElementById('regexLbl').style.opacity = semBox.checked ? '0.4' : '1';
            document.getElementById('caseLbl').style.opacity = semBox.checked ? '0.4' : '1';
        });
        wireCommon();
    }

    function wireCommon() {
        document.querySelectorAll('[data-guide]').forEach(a =>
            a.addEventListener('click', () => vscode.postMessage({ type: 'openGuide', anchor: a.dataset.guide })));
        const build = document.getElementById('build');
        if (build) { build.addEventListener('click', () => vscode.postMessage({ type: 'buildIndex' })); }
    }

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
        const rows = r.hits.map((h, i) => `
            <div class="card click" data-hit="${i}" style="margin-bottom:8px">
                <div class="spread">
                    <strong>${C.esc(h.agentName)} <span class="badge">${C.esc(h.role)}</span>${typeof h.score === 'number' ? ` <span class="badge">${Math.round(h.score * 100)}%</span>` : ''}</strong>
                    <span class="muted small">${relTime(h.ts)}</span>
                </div>
                <div class="muted small">${C.esc(h.title)}</div>
                <div style="margin-top:6px">${C.esc(h.before)}${h.match ? `<mark>${C.esc(h.match)}</mark>` : ''}${C.esc(h.after)}</div>
            </div>`).join('');
        out.innerHTML = `
            <p class="muted small">${r.hits.length} match(es) in ${r.filesScanned} scanned session(s)${r.truncated ? ' — results capped, refine your query' : ''}.</p>
            ${rows}`;
        out.querySelectorAll('[data-hit]').forEach(el =>
            el.addEventListener('click', () => {
                const hit = r.hits[Number(el.dataset.hit)];
                // ts rides along: the viewer opens scrolled to the matched message.
                vscode.postMessage({ type: 'openSession', file: hit.file, ts: hit.ts || 0 });
            }));
    }

    window.addEventListener('message', ev => {
        if (ev.data.type === 'results') {
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
