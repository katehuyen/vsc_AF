// Agent Farm — dashboard page script.
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    let DATA = window.__DATA__;
    let range = 14;
    // Sessions table: sort criterion + turn-accordion state. Sort and the
    // single-open mode persist in webview state; open rows are session-local.
    const SESS_SORTS = [
        { id: 'recent', label: 'Recent', key: r => r.ts || 0 },
        { id: 'cost', label: 'Cost', key: r => r.cost || 0 },
        { id: 'tokens', label: 'Tokens', key: r => r.tokens || 0 },
        { id: 'duration', label: 'Duration', key: r => r.durationMin || 0 },
        { id: 'turns', label: 'Turns', key: r => r.turns || 0 }
    ];
    const persisted = (typeof vscode.getState === 'function' && vscode.getState()) || {};
    let sessSort = SESS_SORTS.some(s => s.id === persisted.sessSort) ? persisted.sessSort : 'recent';
    let sessSingle = !!persisted.sessSingle;
    const sessOpen = new Set();
    const turnCache = {}; // file -> { ts, turns|null } (null = request in flight)

    function saveSessState() {
        if (typeof vscode.setState === 'function') {
            const st = (typeof vscode.getState === 'function' && vscode.getState()) || {};
            vscode.setState(Object.assign({}, st, { sessSort, sessSingle }));
        }
    }

    /** Ask the host for a session's per-turn breakdown unless the cache is
     *  still fresh (row.ts unchanged — a live session invalidates itself). */
    function ensureTurns(r) {
        const c = turnCache[r.file];
        if (c && c.ts === r.ts) { return; }
        turnCache[r.file] = { ts: r.ts, turns: null };
        vscode.postMessage({ type: 'sessionTurns', file: r.file });
    }

    window.addEventListener('message', ev => {
        if (ev.data.type === 'sessionTurns') {
            const c = turnCache[ev.data.file];
            turnCache[ev.data.file] = { ts: c ? c.ts : 0, turns: ev.data.turns || [] };
            render();
            return;
        }
        if (ev.data.type === 'data') { DATA = ev.data.data; render(); }
    });

    function dayKeysBack(n) {
        const out = [];
        const now = new Date();
        for (let i = n - 1; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
            out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
        }
        return out;
    }

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

    function sum(agent, days, field) {
        let total = 0;
        for (const d of days) {
            const bucket = agent.daily[d];
            if (bucket) total += bucket[field];
        }
        return total;
    }

    function render() {
        const days = dayKeysBack(range);
        const today = DATA.today;
        const agents = DATA.agents;

        const rangeCost = agents.reduce((a, ag) => a + sum(ag, days, 'cost'), 0);
        const rangeTokens = agents.reduce((a, ag) => a + sum(ag, days, 'tokens'), 0);
        const rangeMsgs = agents.reduce((a, ag) => a + sum(ag, days, 'msgs'), 0);
        const todayCost = agents.reduce((a, ag) => a + (ag.daily[today] ? ag.daily[today].cost : 0), 0);
        const activeCount = agents.filter(a => a.active).length;
        const sessionsTotal = agents.reduce((a, ag) => a + ag.sessions, 0);

        const win = DATA.window;
        let windowHtml;
        if (win.limit > 0) {
            const pct = Math.min(100, Math.round(100 * win.tokens / win.limit));
            windowHtml = `<div class="kpi">${pct}%</div>
                <div class="progress"><div class="${pct > 85 ? 'hot' : ''}" style="width:${pct}%"></div></div>
                <div class="sub">${C.fmtTok(win.tokens)} / ${C.fmtTok(win.limit)} tokens · ${win.msgs} msgs</div>`;
        } else {
            windowHtml = `<div class="kpi">${C.fmtTok(win.tokens)}</div>
                <div class="sub">${win.msgs} msgs · ${C.fmtUSD(win.cost)} — set <code>windowTokenLimit</code> for a quota bar</div>`;
        }

        const ins = DATA.insightTotals;

        const kpis = `
        <div class="row">
            <div class="card"><div class="label">Active now</div><div class="kpi">${activeCount}<span class="muted" style="font-size:13px">/${agents.length} agents</span></div><div class="sub">threshold-based on transcript activity</div></div>
            <div class="card"><div class="label">Cost today</div><div class="kpi">${C.fmtUSD(todayCost)}</div>
                ${DATA.fleetBudget > 0
                    ? `<div class="progress"><div class="${todayCost >= DATA.fleetBudget ? 'hot' : ''}" style="width:${Math.min(100, Math.round(100 * todayCost / DATA.fleetBudget))}%"></div></div><div class="sub">${Math.round(100 * todayCost / DATA.fleetBudget)}% of ${C.fmtUSD(DATA.fleetBudget)} fleet budget</div>`
                    : '<div class="sub">API-equivalent value</div>'}</div>
            <div class="card"><div class="label">Cost · ${range}d</div><div class="kpi">${C.fmtUSD(rangeCost)}</div><div class="sub">${C.fmtTok(rangeTokens)} tokens · ${rangeMsgs} msgs</div></div>
            <div class="card"><div class="label">Sessions</div><div class="kpi">${sessionsTotal}</div><div class="sub">all time, farm scope</div></div>
            <div class="card"><div class="label">5h window</div>${windowHtml}</div>
            <div class="card"><div class="label">Insights</div><div class="kpi">${ins.error + ins.warning + ins.info}</div>
                <div class="sub">${ins.error} errors · ${ins.warning} warnings · ${ins.info} info <a data-guide="saglik-ve-optimizasyon">?</a></div></div>
            ${DATA.mediaCost && DATA.mediaCost.month > 0 ? `
            <div class="card"><div class="label">Media cost</div><div class="kpi">${C.fmtUSD(DATA.mediaCost.today)}</div>
                <div class="sub">today · ${C.fmtUSD(DATA.mediaCost.month)} last 30d (est.) <a data-guide="medya-uretim-hatti">?</a></div></div>` : ''}
        </div>`;

        const series = agents.map(a => ({
            name: a.name,
            values: days.map(d => a.daily[d] ? a.daily[d].cost : 0)
        })).filter(s => s.values.some(v => v > 0));

        // 180d/365d: weekly buckets keep the bars readable (daily would be ~1px).
        let chartDays = days, chartSeries = series, bucketNote = '';
        if (range > 120) {
            chartDays = [];
            chartSeries = series.map(s => ({ name: s.name, values: [] }));
            for (let i = 0; i < days.length; i += 7) {
                chartDays.push(days[i]);
                series.forEach((s, si) => {
                    let v = 0;
                    for (let j = i; j < Math.min(i + 7, days.length); j++) v += s.values[j] || 0;
                    chartSeries[si].values.push(v);
                });
            }
            bucketNote = ' <span class="muted" style="font-size:11px">(weekly buckets)</span>';
        }

        const modelItems = Object.entries(DATA.modelTotals)
            .map(([name, v]) => ({ name: name.replace(/^claude-/, ''), value: v.cost }))
            .sort((a, b) => b.value - a.value);

        const tt = DATA.tokenTypes;
        const tokenItems = [
            { name: 'cache read', value: tt.cacheRead },
            { name: 'cache write', value: tt.cacheWrite },
            { name: 'input', value: tt.input },
            { name: 'output', value: tt.output }
        ];

        const charts = `
        <div class="row">
            <div class="card chartbox"><h3>Daily cost by agent${bucketNote} <a data-guide="dashboard">?</a></h3>${C.stackedBars(chartDays, chartSeries, {})}</div>
            <div class="card chartbox"><h3>Cost by model</h3>${C.donut(modelItems, {})}</div>
        </div>
        <div class="row">
            <div class="card chartbox"><h3>Token types (all time)</h3>${C.hbars(tokenItems, { fmt: C.fmtTok })}</div>
            <div class="card chartbox"><h3>Activity heatmap (assistant msgs, local time)</h3>${C.heatmap(DATA.heat)}</div>
        </div>`;

        const cards = agents.map(a => {
            const spark = days.map(d => a.daily[d] ? a.daily[d].cost : 0);
            const badges =
                (a.insightCounts.error ? `<span class="badge err">${a.insightCounts.error} err</span>` : '') +
                (a.insightCounts.warning ? `<span class="badge warn">${a.insightCounts.warning} warn</span>` : '');
            const todayAgentCost = a.daily[today] ? a.daily[today].cost : 0;
            const budgetBar = a.budget > 0
                ? `<div class="progress" title="${C.fmtUSD(todayAgentCost)} / ${C.fmtUSD(a.budget)} daily budget"><div class="${todayAgentCost >= a.budget ? 'hot' : ''}" style="width:${Math.min(100, Math.round(100 * todayAgentCost / a.budget))}%"></div></div>`
                : '';
            return `<div class="card agent-card" data-agent="${C.esc(a.id)}">
                <h3><span class="dot ${a.active ? 'on' : 'off'}"></span>${C.esc(a.name)}${badges}</h3>
                <div class="sub">${a.active ? 'ACTIVE' : relTime(a.lastActivity)} · ${a.sessions} sessions · ctx ~${C.fmtTok(a.contextLoad)} tok${a.duties ? ` · 👁 ${a.duties}${a.pendingDuties ? ` <span class="badge warn">${a.pendingDuties} pending</span>` : ''}` : ''}</div>
                ${budgetBar}
                <div class="spread" style="margin-top:8px">
                    <div><div class="label">today</div><strong>${C.fmtUSD(a.daily[today] ? a.daily[today].cost : 0)}</strong></div>
                    <div><div class="label">${range}d</div><strong>${C.fmtUSD(sum(a, days, 'cost'))}</strong></div>
                    <div>${C.sparkline(spark)}</div>
                </div>
                <div class="btnrow">
                    <button class="secondary" data-detail="${C.esc(a.id)}">Detail</button>
                    <button data-start="${C.esc(a.id)}">Start session</button>
                </div>
            </div>`;
        }).join('');

        // Sessions table: one pool, sorted client-side by the picked criterion.
        // Each row folds open (▸) into that session's per-turn breakdown.
        const sortDef = SESS_SORTS.find(s => s.id === sessSort) || SESS_SORTS[0];
        const sessTop = (DATA.sessionRows || []).slice()
            .sort((a, b) => sortDef.key(b) - sortDef.key(a))
            .slice(0, DATA.sessionTableN || 12);
        sessTop.forEach(r => { if (sessOpen.has(r.file)) { ensureTurns(r); } });

        const turnPanelHtml = (r) => {
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
        };
        const sessRowsHtml = sessTop.map(r => {
            const open = sessOpen.has(r.file);
            return `<tr class="click sessrow${open ? ' open' : ''}" data-session="${C.esc(r.file)}">
                <td class="foldcell"><button class="fold" data-fold="${C.esc(r.file)}" title="${open ? 'Hide' : 'List'} this session's turns">${open ? '▾' : '▸'}</button></td>
                <td>${r.active ? '<span class="dot on" title="Active now"></span> ' : ''}${C.esc(r.agent)}${r.sidechain ? ' <span class="badge">sub</span>' : ''}</td>
                <td>${C.esc(r.title)}</td>
                <td class="num">${relTime(r.ts)}</td>
                <td class="num">${r.durationMin}m</td>
                <td class="num">${r.turns || 0}</td>
                <td class="num">${C.fmtTok(r.tokens)}</td>
                <td class="num"><strong>${C.fmtUSD(r.cost)}</strong></td>
            </tr>` + (open ? `<tr class="sessturns"><td></td><td colspan="7">${turnPanelHtml(r)}</td></tr>` : '');
        }).join('');

        // Z1: Farm Status — which subsystems are live/idle/never-used, one
        // wake-up action each. Opens expanded only while something is dormant.
        const st = DATA.farmStatus || [];
        const stDot = {
            active: 'var(--vscode-charts-green,#4caf50)',
            ready: 'var(--vscode-charts-blue,#3794ff)',
            dormant: 'var(--vscode-descriptionForeground,#999)'
        };
        const stCounts = { active: 0, ready: 0, dormant: 0 };
        st.forEach(r => { stCounts[r.state]++; });
        const statusCard = st.length ? `
            <details class="card" style="margin:12px 0;padding:10px 14px" ${stCounts.dormant ? 'open' : ''}>
                <summary><strong>Farm status</strong> — ${stCounts.active} live · ${stCounts.ready} ready · ${stCounts.dormant} dormant${stCounts.dormant ? ' <span class="muted small">(unused capability — one click each)</span>' : ''}</summary>
                <div style="margin-top:8px">
                ${st.map(r => `
                    <div style="display:flex;align-items:center;gap:10px;padding:3px 0">
                        <i style="width:9px;height:9px;border-radius:50%;flex:none;background:${stDot[r.state]}" title="${r.state}"></i>
                        <strong style="width:140px;flex:none;font-size:12px">${C.esc(r.label)}</strong>
                        <span class="muted small" style="flex:1">${C.esc(r.detail)}</span>
                        ${r.action ? `<button class="secondary" style="flex:none" data-status-kind="${r.action.kind}" data-status-value="${C.esc(r.action.value)}">${C.esc(r.action.label)}</button>` : ''}
                    </div>`).join('')}
                </div>
            </details>` : '';

        const unknown = DATA.unknownModels.length
            ? `<p class="footnote">⚠ No pricing rule matched: ${DATA.unknownModels.map(C.esc).join(', ')} — their cost is counted as $0. <a data-status-kind="settings" data-status-value="agentFarm.pricing" style="cursor:pointer">Add a rule in agentFarm.pricing →</a></p>`
            : '';
        const extEntries = Object.entries(DATA.externalSessions || {});
        const externalNote = extEntries.length
            ? `<p class="footnote">⌁ External CLI sessions: ${extEntries.map(([src, n]) => `${C.esc(src)} ×${n}`).join(' · ')} — kept out of the totals above; their costs use <code>agentFarm.pricing</code> rules when a model matches, otherwise $0.</p>`
            : '';

        document.getElementById('app').innerHTML = `
            <style>
                .chiprow { display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin:8px 0; }
                .chip { font-size:11px; padding:2px 10px; border-radius:10px; cursor:pointer;
                    background:transparent; color:var(--vscode-foreground); opacity:.75;
                    border:1px solid var(--vscode-widget-border, #4444); }
                .chip.on { background:var(--vscode-button-background); color:var(--vscode-button-foreground);
                    border-color:transparent; opacity:1; }
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
            </style>
            <div class="spread">
                <div><h1>Agent Farm</h1><div class="muted small">Generated ${new Date(DATA.generatedAt).toLocaleString()} · data: local Claude Code transcripts</div></div>
                <div class="btnrow">
                    <span class="seg">
                        ${[7, 14, 30, 90, 180, 365].map(r => `<button data-range="${r}" class="${r === range ? 'sel' : ''}">${r}d</button>`).join('')}
                    </span>
                    <button class="secondary" id="refresh">Refresh</button>
                    <button class="secondary" id="timeline">Live Timeline</button>
                    <button class="secondary" id="opensearch" title="Search across the whole farm">⌕ Search</button>
                    <button class="secondary" data-guide="dashboard">? Guide</button>
                </div>
            </div>
            ${kpis}
            ${statusCard}
            ${charts}
            <h2>Agents</h2>
            <div class="grid">${cards}</div>
            <h2>Agent comparison (all time)</h2>
            <div class="tablewrap"><table>
                <tr><th>Agent</th><th class="num">Sessions</th><th class="num">Cost</th><th class="num">Tokens</th><th class="num">Tools</th><th class="num">Err %</th><th class="num">Quality</th><th class="num">Cache eff.</th><th class="num">Ctx load</th></tr>
                ${agents.map(a => {
                    const promptTok = a.usage.input + a.usage.cacheRead + a.usage.cacheWrite;
                    const cacheEff = promptTok ? Math.round(100 * a.usage.cacheRead / promptTok) + '%' : '—';
                    const errPct = a.toolCalls ? Math.round(100 * a.errors / a.toolCalls) + '%' : '—';
                    const quality = a.quality !== undefined && a.quality !== null
                        ? `<span title="${a.qualityCount} sampled session(s), last 14 days">${a.quality.toFixed(1)}/5</span>` : '—';
                    return `<tr class="click" data-agent-row="${C.esc(a.id)}">
                        <td><strong>${C.esc(a.name)}</strong></td>
                        <td class="num">${a.sessions}</td>
                        <td class="num">${C.fmtUSD(a.totalCost)}</td>
                        <td class="num">${C.fmtTok(a.totalTokens)}</td>
                        <td class="num">${a.toolCalls}</td>
                        <td class="num">${errPct}</td>
                        <td class="num">${quality}</td>
                        <td class="num">${cacheEff}</td>
                        <td class="num">~${C.fmtTok(a.contextLoad)}</td>
                    </tr>`;
                }).join('')}
            </table></div>
            <p class="muted small">Cache eff. = cache-read share of prompt tokens (higher is cheaper). Err % = tool errors / tool calls. Quality = judge average of sampled sessions (14d) <a data-guide="kalite-karnesi">?</a> · <a data-guide="filo-raporu">Export a Markdown report ?</a></p>
            <h2>Sessions</h2>
            <div class="chiprow">
                <span class="muted small">Sort by:</span>
                <select id="sesssort">${SESS_SORTS.map(s => `<option value="${s.id}"${s.id === sessSort ? ' selected' : ''}>${s.label}</option>`).join('')}</select>
                <span class="muted small">Turns:</span>
                <button class="chip" id="s-expandall" title="List every shown session's turns">Expand all</button>
                <button class="chip" id="s-collapseall" title="Hide all turn lists">Collapse all</button>
                <button class="chip${sessSingle ? ' on' : ''}" id="s-singleopen" title="Only one session's turns open at a time: unfolding a session folds the previous one">Single-open</button>
                <span class="muted small">— ▸ lists a session's turns with per-turn tokens/cost · ● = active now</span>
            </div>
            <div class="tablewrap"><table>
                <tr><th></th><th>Agent</th><th>Title</th><th class="num">When</th><th class="num">Duration</th><th class="num">Turns</th><th class="num">Tokens</th><th class="num">Cost</th></tr>
                ${sessRowsHtml || '<tr><td colspan="8" class="muted">No sessions yet.</td></tr>'}
            </table></div>
            ${unknown}
            ${externalNote}
            <p class="footnote">Costs are API-equivalent values computed from token usage — on a subscription plan this is not your bill, it is the value you extracted. Sessions are matched to agents by their working directory under your agent roots.</p>
        `;

        document.getElementById('refresh').addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
        document.getElementById('timeline').addEventListener('click', () => vscode.postMessage({ type: 'openTimeline' }));
        document.getElementById('opensearch').addEventListener('click', () => vscode.postMessage({ type: 'openSearch' }));
        document.querySelectorAll('[data-range]').forEach(b =>
            b.addEventListener('click', () => { range = Number(b.dataset.range); render(); }));
        document.querySelectorAll('[data-detail]').forEach(b =>
            b.addEventListener('click', ev => { ev.stopPropagation(); vscode.postMessage({ type: 'openAgent', agentId: b.dataset.detail }); }));
        document.querySelectorAll('[data-start]').forEach(b =>
            b.addEventListener('click', ev => { ev.stopPropagation(); vscode.postMessage({ type: 'startSession', agentId: b.dataset.start }); }));
        document.querySelectorAll('.agent-card').forEach(card =>
            card.addEventListener('click', () => vscode.postMessage({ type: 'openAgent', agentId: card.dataset.agent })));
        document.querySelectorAll('[data-session]').forEach(row =>
            row.addEventListener('click', () => vscode.postMessage({ type: 'openSession', file: row.dataset.session })));
        // Turn row → open the transcript AT that turn (an already-open viewer is
        // revealed and scrolled there rather than opened again).
        document.querySelectorAll('[data-turnjump]').forEach(row =>
            row.addEventListener('click', ev => {
                ev.stopPropagation();
                vscode.postMessage({
                    type: 'openSession', file: row.dataset.turnjump, ts: Number(row.dataset.turnts) || 0
                });
            }));
        document.querySelectorAll('[data-agent-row]').forEach(row =>
            row.addEventListener('click', () => vscode.postMessage({ type: 'openAgent', agentId: row.dataset.agentRow })));
        document.querySelectorAll('[data-guide]').forEach(a =>
            a.addEventListener('click', ev => { ev.stopPropagation(); vscode.postMessage({ type: 'openGuide', anchor: a.dataset.guide }); }));
        document.querySelectorAll('[data-status-kind]').forEach(b =>
            b.addEventListener('click', () => vscode.postMessage({
                type: 'statusAction', kind: b.dataset.statusKind, value: b.dataset.statusValue
            })));

        // Sessions table controls (sort + turn accordion). sessTop is closed
        // over from this render pass — it is exactly what's on screen.
        const sortSel = document.getElementById('sesssort');
        if (sortSel) {
            sortSel.addEventListener('change', e => {
                sessSort = e.target.value;
                saveSessState();
                render();
            });
            document.getElementById('s-expandall').addEventListener('click', () => {
                sessTop.forEach(r => { sessOpen.add(r.file); ensureTurns(r); });
                render();
            });
            document.getElementById('s-collapseall').addEventListener('click', () => {
                sessOpen.clear();
                render();
            });
            document.getElementById('s-singleopen').addEventListener('click', () => {
                sessSingle = !sessSingle;
                if (sessSingle && sessOpen.size > 1) {
                    // entering the mode: keep only the first open row in view order
                    const keep = sessTop.find(r => sessOpen.has(r.file));
                    sessOpen.clear();
                    if (keep) { sessOpen.add(keep.file); }
                }
                saveSessState();
                render();
            });
            document.querySelectorAll('[data-fold]').forEach(b =>
                b.addEventListener('click', ev => {
                    ev.stopPropagation(); // the row click underneath opens the transcript
                    const file = b.dataset.fold;
                    if (sessOpen.has(file)) {
                        sessOpen.delete(file);
                    } else {
                        if (sessSingle) { sessOpen.clear(); }
                        sessOpen.add(file);
                        const r = sessTop.find(x => x.file === file);
                        if (r) { ensureTurns(r); }
                    }
                    render();
                }));
        }
    }

    render();
})();
