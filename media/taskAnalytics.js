// Agent Farm — Task Analytics. 30-day throughput, per-agent scorecards,
// recurring task families, alerts and the forecast.
//
// Split out of the Tasks page on purpose: these numbers are for READING.
// Mixing them into the control surface buried the switches under charts
// nobody needs while turning an automation on.
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    let DATA = window.__DATA__;
    const post = (m) => vscode.postMessage(m);

    const fmtDurMs = (ms) => {
        if (!ms) { return '—'; }
        const min = Math.round(ms / 60000);
        if (min < 1) { return Math.round(ms / 1000) + 's'; }
        if (min < 90) { return min + 'm'; }
        return (min / 60).toFixed(1) + 'h';
    };
    const fmtNext = (ts) => {
        if (!ts) { return '—'; }
        const d = new Date(ts);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const day = new Date(d); day.setHours(0, 0, 0, 0);
        const diff = Math.round((day - today) / 86400000);
        const hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
        if (diff === 0) { return 'today ' + hm; }
        if (diff === 1) { return 'tomorrow ' + hm; }
        return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()] + ' ' + d.getDate() + '.' + (d.getMonth() + 1) + ' ' + hm;
    };

    // ---- table tools: search + column filters + sort + Markdown export ------
    const tstate = {};
    const lastTables = {};
    let refocusTable = '';
    function tstateFor(id) { return tstate[id] || (tstate[id] = { q: '', sort: '', asc: false, filters: {} }); }
    function cmpVals(a, b, num) {
        if (num) { return (Number(a) || 0) - (Number(b) || 0); }
        return String(a == null ? '' : a).localeCompare(String(b == null ? '' : b), undefined, { numeric: true });
    }
    function tableTools(id, allRows, cols, title) {
        const s = tstateFor(id);
        const q = s.q.trim().toLowerCase();
        let rows = allRows.filter(r => {
            if (q) {
                const hay = cols.map(c => String(c.get(r) == null ? '' : c.get(r))).join(' ').toLowerCase();
                if (hay.indexOf(q) < 0) { return false; }
            }
            for (const c of cols) {
                if (c.filter && s.filters[c.key] && String(c.get(r) == null ? '' : c.get(r)) !== s.filters[c.key]) { return false; }
            }
            return true;
        });
        if (s.sort) {
            const c = cols.find(x => x.key === s.sort);
            if (c) { rows = rows.slice().sort((a, b) => cmpVals(c.get(a), c.get(b), c.num) * (s.asc ? 1 : -1)); }
        }
        lastTables[id] = { title, cols, rows };
        const selects = cols.filter(c => c.filter).map(c => {
            const vals = [...new Set(allRows.map(r => String(c.get(r) == null ? '' : c.get(r))).filter(Boolean))].sort();
            return `<select data-tf="${id}:${c.key}" title="Filter by ${C.esc(c.label)}"><option value="">${C.esc(c.label)}: all</option>${vals.map(v => `<option value="${C.esc(v)}" ${s.filters[c.key] === v ? 'selected' : ''}>${C.esc(v)}</option>`).join('')}</select>`;
        }).join('');
        const active = q || s.sort || Object.values(s.filters).some(Boolean);
        const bar = `<div class="tbl-tools">
            <input type="search" data-tq="${id}" value="${C.esc(s.q)}" placeholder="⌕ search">
            ${selects}
            <button class="mini secondary" data-treset="${id}" ${active ? '' : 'disabled'} title="Clear search, filters and sort">↺ reset</button>
            <button class="mini secondary" data-texport="${id}" title="Export the visible rows as a Markdown table">⬇ MD</button>
            <span class="muted small">${rows.length}${rows.length !== allRows.length ? '/' + allRows.length : ''} row(s)</span></div>`;
        const th = (key, label, num) => {
            const on = s.sort === key;
            return `<th class="${num ? 'num ' : ''}tbl-sort" data-tsort="${id}:${key}" title="Sort by ${C.esc(label)}">${C.esc(label)}${on ? (s.asc ? ' ▲' : ' ▼') : ''}</th>`;
        };
        return { rows, bar, th };
    }
    function exportTable(id) {
        const t = lastTables[id];
        if (!t || !t.rows.length) { post({ type: 'export-md', name: id, content: '' }); return; }
        const cell = v => String(v == null ? '' : v).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
        const head = '| ' + t.cols.map(c => c.label).join(' | ') + ' |';
        const sep = '| ' + t.cols.map(() => '---').join(' | ') + ' |';
        const body = t.rows.map(r => '| ' + t.cols.map(c => cell(c.get(r))).join(' | ') + ' |').join('\n');
        post({ type: 'export-md', name: id, content: `# ${t.title}\n\n_Exported ${new Date().toLocaleString()} · ${t.rows.length} row(s)_\n\n${head}\n${sep}\n${body}\n` });
    }

    function render() {
        const a = DATA;
        const k = a.kpis;
        const kpi = (label, value, sub) => `<div class="card"><div class="label">${label}</div>
            <div class="kpi">${value}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
        const alerts = a.alerts.length ? `<div style="margin:10px 0">${a.alerts.map(al =>
            `<div class="msg ${al.severity === 'warning' ? 'error' : ''}"><b>${C.esc(al.who)}</b> — ${C.esc(al.message)}</div>`).join('')}</div>` : '';

        const ttAgent = tableTools('agent-table', a.agents, [
            { key: 'agent', label: 'Agent', filter: true, get: s => s.agentName },
            { key: 'runs', label: 'Runs', num: true, get: s => s.total },
            { key: 'success', label: 'Success', num: true, get: s => s.successRate !== undefined ? s.successRate : -1 },
            { key: 'median', label: 'Median', num: true, get: s => s.medianDurationMs || 0 },
            { key: 'retries', label: 'Retries', num: true, get: s => s.retries || 0 }
        ], 'Per-agent scorecard (30d)');
        const agentRows = ttAgent.rows.map(s => `<tr>
            <td><b>${C.esc(s.agentName)}</b></td>
            <td class="num">${s.total}</td>
            <td class="num">${s.done}✓ / ${s.failed}✗${s.cancelled ? ` / ${s.cancelled}⊘` : ''}</td>
            <td class="num">${s.successRate !== undefined ? Math.round(s.successRate * 100) + '%' : '—'}</td>
            <td class="num">${fmtDurMs(s.medianDurationMs)}</td>
            <td class="num">${s.retries || '—'}</td></tr>`).join('');

        const ttFam = tableTools('fam-table', a.families, [
            { key: 'title', label: 'Family', get: f => f.title },
            { key: 'agents', label: 'Agents', filter: true, get: f => f.agents },
            { key: 'source', label: 'Source', filter: true, get: f => f.source },
            { key: 'runs', label: 'Runs', num: true, get: f => f.runs },
            { key: 'failed', label: 'Failed', num: true, get: f => f.failed || 0 }
        ], 'Task families (30d)');
        const famRows = ttFam.rows.map(f => `<tr>
            <td><b>${C.esc(f.title)}</b>${f.alwaysFails ? ' <span class="badge err">always fails</span>' : ''}
                <div class="muted small">${C.esc(f.agents)}</div></td>
            <td>${C.esc(f.source)}</td>
            <td class="num">${f.runs}</td>
            <td class="num">${f.failed ? f.failed + '✗' : '—'}</td></tr>`).join('');

        const ttFore = tableTools('fore-table', a.forecast.upcoming, [
            { key: 'when', label: 'When', num: true, get: u => u.ts || 0 },
            { key: 'title', label: 'Job', get: u => u.title },
            { key: 'agent', label: 'Agent', filter: true, get: u => u.agentName },
            { key: 'median', label: 'Usually', num: true, get: u => u.medianMs || 0 },
            { key: 'success', label: 'Success', num: true, get: u => u.successRate !== undefined ? u.successRate : -1 }
        ], 'Forecast — upcoming runs');
        const upcoming = ttFore.rows.map(u => `<tr>
            <td title="${C.esc(new Date(u.ts).toLocaleString())}">${C.esc(fmtNext(u.ts))}</td>
            <td><b>${C.esc(u.title)}</b></td>
            <td>${C.esc(u.agentName)}</td>
            <td class="num">${fmtDurMs(u.medianMs)}</td>
            <td class="num">${u.successRate !== undefined ? Math.round(u.successRate * 100) + '%' : '—'}</td></tr>`).join('');

        document.getElementById('app').innerHTML = `
            <style>
                .tbl-tools { display:flex; gap:6px; flex-wrap:wrap; align-items:center; margin:6px 0; }
                .tbl-tools input[type=search] { padding:3px 8px; min-width:150px; }
                .tbl-tools select { padding:3px 6px; }
                .tbl-sort { cursor:pointer; user-select:none; white-space:nowrap; }
                .tbl-sort:hover { color:var(--vscode-textLink-foreground); }
                td.num, th.num { text-align:right; white-space:nowrap; }
                .badge.err { color:var(--vscode-errorForeground,#f85149); border:1px solid currentColor;
                    border-radius:3px; padding:0 5px; font-size:10px; }
            </style>
            ${window.AFHeader.html({
                page: 'tasks',
                title: 'Task Analytics',
                sub: `30-day history and forecast — updated ${new Date(a.generatedAt).toLocaleTimeString()}`,
                actions: '<button class="secondary" data-go="open-tasks">← Back to Tasks</button>',
                guide: 'tasks-sayfasi'
            })}
            <div class="row" style="margin-top:10px">
                ${kpi('Runs · 30d', k.runs30d, `${k.done}✓ / ${k.failed}✗`)}
                ${kpi('Success rate', k.successRate !== undefined ? Math.round(k.successRate * 100) + '%' : '—', 'done / (done + failed)')}
                ${kpi('Median duration', fmtDurMs(k.medianMs), 'successful runs')}
                ${kpi('Verify retries', k.retries || '0', 'quality-gate reruns')}
                ${kpi('Queue', a.queue.count, a.queue.known ? `≈ ${fmtDurMs(a.queue.etaMs)} of known work` : 'no history for ETA')}
            </div>
            ${alerts}
            <h2>Throughput — completed tasks per day (30d)</h2>
            <div class="chartbox">${C.stackedBars(a.daily.map(x => x.day),
                [{ name: 'done', values: a.daily.map(x => x.done) }, { name: 'failed', values: a.daily.map(x => x.failed) }],
                { fmt: v => String(Math.round(v)) })}</div>
            <h2>Per-agent scorecard (30d)</h2>
            ${a.agents.length ? ttAgent.bar : ''}
            <div class="tablewrap">${a.agents.length
                ? `<table><tr>${ttAgent.th('agent', 'Agent')}${ttAgent.th('runs', 'Runs', true)}<th class="num">Outcome</th>${ttAgent.th('success', 'Success', true)}${ttAgent.th('median', 'Median', true)}${ttAgent.th('retries', 'Retries', true)}</tr>${agentRows}</table>`
                : '<p class="muted">No completed tasks in the last 30 days.</p>'}</div>
            <h2>Task families — the same job run repeatedly (30d)</h2>
            ${a.families.length ? ttFam.bar : ''}
            <div class="tablewrap">${a.families.length
                ? `<table><tr>${ttFam.th('title', 'Family')}${ttFam.th('source', 'Source')}${ttFam.th('runs', 'Runs', true)}${ttFam.th('failed', 'Failed', true)}</tr>${famRows}</table>`
                : '<p class="muted">Nothing recurring yet.</p>'}</div>
            <div class="spread"><h2>Forecast — next ${a.forecast.days} days</h2>
                <span>
                    <button class="secondary" data-go="open-forecast">Open full forecast</button>
                    <button class="secondary" data-go="open-history">Task history</button>
                </span></div>
            <p class="muted small">${a.forecast.totalScheduledRuns} scheduled run(s) · estimated agent-time ${fmtDurMs(a.forecast.estBusyMs)}</p>
            ${a.forecast.upcoming.length ? ttFore.bar : ''}
            <div class="tablewrap">${a.forecast.upcoming.length
                ? `<table><tr>${ttFore.th('when', 'When', true)}${ttFore.th('title', 'Job')}${ttFore.th('agent', 'Agent')}${ttFore.th('median', 'Usually', true)}${ttFore.th('success', 'Success', true)}</tr>${upcoming}</table>`
                : '<p class="muted">No scheduled runs in the window.</p>'}</div>`;

        window.AFHeader.wire(vscode);
        document.querySelectorAll('[data-go]').forEach(el =>
            el.addEventListener('click', () => post({ type: el.dataset.go })));
        document.querySelectorAll('[data-tq]').forEach(el =>
            el.addEventListener('input', () => { tstateFor(el.dataset.tq).q = el.value; refocusTable = el.dataset.tq; render(); }));
        document.querySelectorAll('[data-tf]').forEach(el =>
            el.addEventListener('change', () => { const [id, key] = el.dataset.tf.split(':'); tstateFor(id).filters[key] = el.value; render(); }));
        document.querySelectorAll('[data-tsort]').forEach(el =>
            el.addEventListener('click', () => {
                const [id, key] = el.dataset.tsort.split(':');
                const s = tstateFor(id);
                if (s.sort === key) { s.asc = !s.asc; } else { s.sort = key; s.asc = true; }
                render();
            }));
        document.querySelectorAll('[data-treset]').forEach(el =>
            el.addEventListener('click', () => { delete tstate[el.dataset.treset]; render(); }));
        document.querySelectorAll('[data-texport]').forEach(el =>
            el.addEventListener('click', () => exportTable(el.dataset.texport)));
        if (refocusTable) {
            const el = document.querySelector(`[data-tq="${refocusTable}"]`);
            refocusTable = '';
            if (el) { el.focus(); const v = el.value.length; if (el.setSelectionRange) { el.setSelectionRange(v, v); } }
        }
    }

    window.addEventListener('message', ev => {
        if (ev.data.type === 'data') { DATA = ev.data.data; render(); }
    });
    render();
})();
