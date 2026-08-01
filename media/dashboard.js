// Agent Farm — dashboard page script.
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    let DATA = window.__DATA__;
    // 1–7 individually, then the longer spans, then 'custom' = two dates
    let range = 14;
    let rangeFrom = '', rangeTo = '';
    // Shared advanced Sessions table (sort box, turn accordion, single-open,
    // ⌨ jump-to-terminal) — the same component the agent detail page uses.
    // fallbackSort/-Single carry over the state persisted by pre-2.57 versions.
    const persisted = (typeof vscode.getState === 'function' && vscode.getState()) || {};
    const sessTable = window.AFSessionsTable.create({
        vscode, C,
        containerId: 'sessblock',
        columns: ['origin', 'agent', 'project', 'title', 'when', 'duration', 'turns', 'tools', 'files', 'errors', 'tokens', 'ctx', 'cost'],
        tableN: 20, // dashboard default; the All chip toggles back to this
        stateKey: 'dash',
        fallbackSort: persisted.sessSort,
        fallbackSingle: persisted.sessSingle
    });

    // ---- Agent comparison window state ----
    const H = 3600e3, D = 24 * H;
    const CMP_WINDOWS = [
        { id: '1h', label: '1 hour', ms: H }, { id: '2h', label: '2 hours', ms: 2 * H },
        { id: '6h', label: '6 hours', ms: 6 * H }, { id: '12h', label: '12 hours', ms: 12 * H },
        { id: '16h', label: '16 hours', ms: 16 * H },
        { id: '1d', label: '1 day', ms: D }, { id: '2d', label: '2 days', ms: 2 * D },
        { id: '3d', label: '3 days', ms: 3 * D }, { id: '4d', label: '4 days', ms: 4 * D },
        { id: '5d', label: '5 days', ms: 5 * D },
        { id: '1w', label: '1 week', ms: 7 * D }, { id: '2w', label: '2 weeks', ms: 14 * D },
        { id: '3w', label: '3 weeks', ms: 21 * D }, { id: '4w', label: '4 weeks', ms: 28 * D },
        { id: '1mo', label: '1 month', ms: 30 * D }, { id: '2mo', label: '2 months', ms: 60 * D },
        { id: '3mo', label: '3 months', ms: 90 * D }, { id: '6mo', label: '6 months', ms: 180 * D },
        { id: '9mo', label: '9 months', ms: 270 * D },
        { id: '1y', label: '1 year', ms: 365 * D }, { id: '2y', label: '2 years', ms: 730 * D },
        { id: '3y', label: '3 years', ms: 1095 * D },
        { id: 'all', label: 'All time' },
        { id: 'custom', label: 'Custom range…' }
    ];
    let cmpWin = 'all';                  // selected window id (default: all time)
    let cmpFrom = '', cmpTo = '';        // custom-range dates (yyyy-mm-dd)
    let cmpRows = null;                  // host reply for a window; null = all-time mode
    let cmpSort = 'cost', cmpAsc = false;
    const CMP_SHOW_DEFAULT = 12;
    let cmpShow = CMP_SHOW_DEFAULT;      // rows listed after sorting (0 = all)

    function requestCmp() {
        const w = CMP_WINDOWS.find(x => x.id === cmpWin);
        if (!w || cmpWin === 'all') { cmpRows = null; return; }
        if (cmpWin === 'custom') {
            const f = Date.parse(cmpFrom), t = Date.parse(cmpTo);
            if (isNaN(f) || isNaN(t) || t < f) { return; } // wait until both dates are sane
            vscode.postMessage({ type: 'compareWindow', from: f, to: t + D - 1 }); // inclusive end day
            return;
        }
        vscode.postMessage({ type: 'compareWindow', from: Date.now() - w.ms, to: Date.now() });
    }

    // ---- Plan usage card state ----
    // The card lives on its own beat: the host answers {type:'planUsage'} out
    // of band, so a slow endpoint never holds up a dashboard render.
    let puBusy = false;      // a request is in flight — the ⟳ shows it
    let puTimer = null;      // auto-refresh interval, re-armed when the beat changes
    let puBeat = -1;         // ms currently armed

    function askPlanUsage(force) {
        puBusy = true;
        vscode.postMessage({ type: 'planUsage', force: !!force });
    }

    /**
     * Arm (or disarm) the self-refresh beat. The HOST decides the interval —
     * the same beat the status-bar indicator runs on, which switches between
     * the fast window (an agent is mid-turn, so the figures are moving) and the
     * slow one (everything is waiting for a prompt). Every answer carries the
     * current beat, so the card follows a window change instead of sitting on a
     * five-minute timer through the turn it is meant to be reporting.
     * 0 = manual only.
     */
    function armPlanUsage() {
        const ms = Number((DATA.planUsageBeat || {}).ms) || 0;
        if (ms === puBeat) { return; }
        puBeat = ms;
        if (puTimer) { clearInterval(puTimer); puTimer = null; }
        if (ms > 0) { puTimer = setInterval(() => askPlanUsage(false), ms); }
    }

    /**
     * ‼️ A RETAINED PAGE COMES BACK WHERE YOU LEFT IT, NOT WHERE YOU WERE SENT.
     *
     * The host asks for this when the click that opened the page was on a
     * status-bar indicator — cost today, the plan percentages — every one of
     * which is drawn at the TOP of this page. Reveal alone restored the last
     * scroll position, so the answer to the question you just asked was often
     * three screens up and the click looked like it had done nothing.
     *
     * No smooth behaviour: this is not the reader scrolling, it is the page
     * being opened, and an animation on arrival reads as a glitch.
     */
    function scrollToTop() {
        if (window.scrollTo) { window.scrollTo(0, 0); }
        if (document.documentElement) { document.documentElement.scrollTop = 0; }
        if (document.body) { document.body.scrollTop = 0; }
    }

    window.addEventListener('message', ev => {
        if (ev.data.type === 'scrollTo') { if (ev.data.target === 'top') { scrollToTop(); } return; }
        if (sessTable.onMessage(ev)) { return; }
        if (ev.data.type === 'compareWindow') { cmpRows = ev.data.rows || []; render(); return; }
        if (ev.data.type === 'planUsage') {
            // an unsolicited push (the indicator's beat) must not clear the ⟳
            // spinner — that belongs to the request the button actually sent
            if (!ev.data.push) { puBusy = false; }
            if (ev.data.usage) { DATA.planUsage = ev.data.usage; }
            if (ev.data.beat) { DATA.planUsageBeat = ev.data.beat; }
            render();
            armPlanUsage();
            return;
        }
        if (ev.data.type === 'data') {
            DATA = ev.data.data;
            render();
            armPlanUsage();
            if (cmpWin !== 'all') { requestCmp(); } // refresh the windowed figures too
        }
    });

    const dayKey = d =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    function dayKeysBack(n) {
        const out = [];
        const now = new Date();
        for (let i = n - 1; i >= 0; i--) {
            out.push(dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)));
        }
        return out;
    }

    /**
     * The days the page is about — the last N, or a range you picked.
     *
     * The jumps used to be 7 → 14 → 30: "yesterday and today" was not a
     * question this page could be asked, and neither was "that week in July".
     * The first week is now day by day, and `between` takes two dates. Both
     * end up as the same thing — a list of day keys — so everything
     * downstream (the KPI cards, the chart, the per-agent columns) is
     * unchanged and stays exactly as accurate as the daily buckets it sums.
     */
    function rangeDays() {
        if (range !== 'custom') { return dayKeysBack(Number(range)); }
        const from = new Date(rangeFrom + 'T00:00:00');
        const to = new Date(rangeTo + 'T00:00:00');
        if (isNaN(from) || isNaN(to) || to < from) { return dayKeysBack(14); }
        const out = [];
        for (const d = new Date(from); d <= to && out.length < 800; d.setDate(d.getDate() + 1)) {
            out.push(dayKey(d));
        }
        return out;
    }

    /** What the range is called on a card label. */
    const rangeLabel = () => (range === 'custom'
        ? `${rangeFrom} → ${rangeTo}`
        : `${range}d`);

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

    // ---- Agent comparison: sortable, over any window ----
    const CMP_SORTS_ALL = [
        { id: 'name', label: 'Agent A–Z', str: true, key: a => a.name },
        { id: 'sessions', label: 'Sessions', key: a => a.sessions },
        { id: 'cost', label: 'Cost', key: a => a.totalCost },
        { id: 'tokens', label: 'Tokens', key: a => a.totalTokens },
        { id: 'tools', label: 'Tools', key: a => a.toolCalls },
        { id: 'errpct', label: 'Err %', key: a => a.toolCalls ? a.errors / a.toolCalls : 0 },
        { id: 'quality', label: 'Quality', key: a => a.quality || 0 },
        { id: 'cache', label: 'Cache eff.', key: a => { const p = a.usage.input + a.usage.cacheRead + a.usage.cacheWrite; return p ? a.usage.cacheRead / p : 0; } },
        { id: 'ctxload', label: 'Ctx load', key: a => a.contextLoad }
    ];
    const CMP_SORTS_WIN = [
        { id: 'name', label: 'Agent A–Z', str: true, key: r => r.name },
        { id: 'sessions', label: 'Sessions', key: r => r.sessions },
        { id: 'cost', label: 'Cost', key: r => r.cost },
        { id: 'tokens', label: 'Tokens', key: r => r.tokens },
        { id: 'msgs', label: 'Msgs', key: r => r.msgs }
    ];

    function cmpSorted(list, defs) {
        const def = defs.find(s => s.id === cmpSort) || defs.find(s => s.id === 'cost') || defs[0];
        return list.slice().sort((a, b) => {
            const d = def.str
                ? String(def.key(a)).localeCompare(String(def.key(b)))
                : def.key(a) - def.key(b);
            return cmpAsc ? d : -d;
        });
    }

    function cmpControls(defs) {
        return `<span class="cmpctl">
            <select id="cmp-window" title="The period the comparison covers">${CMP_WINDOWS.map(x =>
                `<option value="${x.id}"${x.id === cmpWin ? ' selected' : ''}>${x.label}</option>`).join('')}</select>
            ${cmpWin === 'custom' ? `<input type="date" id="cmp-from" value="${C.esc(cmpFrom)}"> – <input type="date" id="cmp-to" value="${C.esc(cmpTo)}">` : ''}
            <select id="cmp-sort" title="Sort the comparison rows">${defs.map(s =>
                `<option value="${s.id}"${s.id === cmpSort ? ' selected' : ''}>${s.label}</option>`).join('')}</select>
            <button class="chip" id="cmp-dir" title="Flip the sort direction">${cmpAsc ? '▲' : '▼'}</button>
            <span class="muted small">Show:</span>
            <input type="number" id="cmp-count" min="1" step="1" value="${cmpShow > 0 ? cmpShow : ''}" placeholder="all" title="How many agents to list after sorting — empty means all">
            <button class="chip${cmpShow === 0 ? ' on' : ''}" id="cmp-all" title="List every agent (click again to go back to ${CMP_SHOW_DEFAULT})">All</button>
        </span>`;
    }

    /** Top-N slice for the comparison table (cmpShow = 0 → everything). */
    function cmpShown(list) {
        return cmpShow > 0 ? list.slice(0, cmpShow) : list;
    }
    const cmpMoreNote = (shownLen, total) =>
        shownLen < total ? ` Showing ${shownLen} of ${total} agents.` : '';

    function cmpSection() {
        const style = `<style>
            .cmph { display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
            .cmpctl { display:inline-flex; gap:6px; align-items:center; font-size:12px; font-weight:400; }
            .cmpctl input[type=date] { padding:1px 4px; }
            .cmpctl input[type=number] { width:52px; padding:1px 4px; }
        </style>`;
        if (cmpRows) {
            // windowed mode: figures the host computed for [from, to]
            const all = cmpSorted(cmpRows, CMP_SORTS_WIN);
            const rows = cmpShown(all);
            const exact = rows.length && rows[0].exact;
            return style + `<h2 class="cmph">Agent comparison ${cmpControls(CMP_SORTS_WIN)}</h2>
            <div class="tablewrap"><table>
                <tr><th>Agent</th><th class="num">Sessions</th><th class="num">Cost</th><th class="num">Tokens</th><th class="num">Msgs</th></tr>
                ${rows.map(r => `<tr class="click" data-agent-row="${C.esc(r.id)}">
                    <td><strong>${C.esc(r.name)}</strong></td>
                    <td class="num">${r.sessions}</td>
                    <td class="num">${C.fmtUSD(r.cost)}</td>
                    <td class="num">${C.fmtTok(r.tokens)}</td>
                    <td class="num">${r.msgs}</td>
                </tr>`).join('')}
            </table></div>
            <p class="muted small">${exact
                ? 'Hour-exact — summed from the per-message log (retained 48h).'
                : 'Day granularity — summed from daily buckets; hours inside a day are not sliced.'} Sessions = sessions overlapping the window.${cmpMoreNote(rows.length, all.length)}</p>`;
        }
        const all = cmpSorted(DATA.agents, CMP_SORTS_ALL);
        const rows = cmpShown(all);
        return style + `<h2 class="cmph">Agent comparison ${cmpControls(CMP_SORTS_ALL)}</h2>
        <div class="tablewrap"><table>
            <tr><th>Agent</th><th class="num">Sessions</th><th class="num">Cost</th><th class="num">Tokens</th><th class="num">Tools</th><th class="num">Err %</th><th class="num">Quality</th><th class="num">Cache eff.</th><th class="num">Ctx load</th></tr>
            ${rows.map(a => {
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
        <p class="muted small">Cache eff. = cache-read share of prompt tokens (higher is cheaper). Err % = tool errors / tool calls. Quality = judge average of sampled sessions (14d) <a data-guide="kalite-karnesi">?</a> · <a data-guide="filo-raporu">Export a Markdown report ?</a>${cmpMoreNote(rows.length, all.length)}</p>`;
    }

    // ---- Plan usage card ----
    // The real subscription limits as Anthropic reports them — the same figures
    // Claude Code's /usage prints. Deliberately next to Farm status: that box
    // says what the farm can do, this one says how much room is left to do it.
    const PU_STYLE = `<style>
        .pucard { flex:0 1 340px; min-width:250px; }
        .pucard .pu-head { display:flex; justify-content:space-between; align-items:baseline; gap:8px; }
        .pu-ref { font-size:12px; line-height:1; padding:2px 7px; border-radius:4px; cursor:pointer;
            background:transparent; color:var(--vscode-foreground); opacity:.6;
            border:1px solid var(--vscode-widget-border, #4444); }
        .pu-ref:hover { opacity:1; background:var(--vscode-list-hoverBackground); }
        .pu-bar { margin-top:9px; }
        .pu-bar .pu-t { display:flex; justify-content:space-between; align-items:baseline; gap:8px; font-size:12px; }
        .pu-bar .pu-t strong { font-size:13px; }
        .pu-bar .progress { margin-top:3px; }
    </style>`;

    /** "Resets 21:40 · in 2h 20m" — the absolute time answers "when", the
     *  relative one answers "should I start this now". */
    function puReset(ts) {
        if (!ts) { return ''; }
        const d = new Date(ts);
        const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        const sameDay = d.toDateString() === new Date().toDateString();
        const when = sameDay ? time : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
        const left = ts - Date.now();
        if (left <= 0) { return `Resets ${when}`; }
        const h = Math.floor(left / 3600e3), m = Math.round((left % 3600e3) / 60000);
        return `Resets ${when} · in ${h > 0 ? h + 'h ' : ''}${m}m`;
    }

    function planCard() {
        const pu = DATA.planUsage;
        const beat = DATA.planUsageBeat || { ms: 0, active: false };
        // the beat is a fact about the page, so it is stated on the page: how
        // often these figures are re-read, and which of the two windows we are in
        const beatText = !(beat.ms > 0) ? 'manual refresh only'
            : beat.active ? 'live · every ' + Math.max(1, Math.round(beat.ms / 1000)) + ' s while an agent works'
                : 'auto every ' + Math.max(1, Math.round(beat.ms / 60000)) + ' min';
        const btn = `<button class="pu-ref" id="pu-refresh" title="Read your subscription limits from Anthropic now">${puBusy ? '…' : '⟳'}</button>`;
        let body, foot;
        if (!pu) {
            body = '<div class="sub" style="margin-top:8px">Reading your subscription limits…</div>';
            foot = '';
        } else if (pu.state !== 'ok') {
            body = `<div class="sub" style="margin-top:8px">${C.esc(pu.note || 'Usage data is unavailable.')}</div>`;
            foot = `<div class="sub muted" style="margin-top:8px">Checked ${new Date(pu.fetchedAt).toLocaleTimeString()}</div>`;
        } else {
            body = pu.bars.map(b => {
                const cls = b.percent >= 90 ? ' hot' : b.percent >= 75 ? ' warn' : '';
                return `<div class="pu-bar">
                    <div class="pu-t"><span>${C.esc(b.title)}</span><strong>${b.percent}%</strong></div>
                    <div class="progress"><div class="${cls.trim()}" style="width:${b.percent}%"></div></div>
                    <div class="sub">${C.esc(puReset(b.resetsAt))}</div>
                </div>`;
            }).join('');
            foot = `<div class="sub muted" style="margin-top:10px">${pu.plan ? C.esc(pu.plan) + ' plan · ' : ''}updated ${new Date(pu.fetchedAt).toLocaleTimeString()} · ${beatText}</div>`;
        }
        return `<div class="card pucard">
            <div class="pu-head"><div class="label">Plan usage</div>${btn}</div>
            ${body}${foot}
        </div>`;
    }

    function render() {
        const days = rangeDays();
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
            <div class="card"><div class="label">Cost · ${rangeLabel()}</div><div class="kpi">${C.fmtUSD(rangeCost)}</div><div class="sub">${C.fmtTok(rangeTokens)} tokens · ${rangeMsgs} msgs</div></div>
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
        if (days.length > 120) {
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
                    <div><div class="label">${range === 'custom' ? days.length + 'd' : rangeLabel()}</div><strong>${C.fmtUSD(sum(a, days, 'cost'))}</strong></div>
                    <div>${C.sparkline(spark)}</div>
                </div>
                <div class="btnrow">
                    <button class="secondary" data-detail="${C.esc(a.id)}">Detail</button>
                    <button data-start="${C.esc(a.id)}">Start session</button>
                </div>
            </div>`;
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
            <details class="card" style="flex:3 1 420px;padding:10px 14px" ${stCounts.dormant ? 'open' : ''}>
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
        // Plan usage sits to the RIGHT of Farm status, on the same line: the two
        // boxes answer the paired questions "what can the farm do" and "how much
        // subscription room is left". Farm status stays full width if it is the
        // only one there (an empty status list leaves the usage card alone).
        const statusRow = `${PU_STYLE}<div class="row" style="margin:12px 0">${statusCard}${planCard()}</div>`;

        // B1: Projects — "what did I spend on this customer". Every session lands
        // in exactly one bucket (a named project or Unassigned), so the rows add
        // up to the fleet total. The card only exists once projects are declared.
        const projects = DATA.projects || [];
        const named = projects.filter(p => p.name !== 'Unassigned' || p.sessions);
        const projectsCard = named.length ? `
            <h2>Projects</h2>
            <div class="tablewrap"><table>
                <tr><th>Project</th><th>Agents</th><th class="num">Sessions</th><th class="num">Today</th><th class="num">Total</th><th class="num">Tokens</th><th class="num">Last activity</th></tr>
                ${named.map(p => {
                    const over = p.budgetUSD && p.todayCost > p.budgetUSD;
                    const budget = p.budgetUSD
                        ? ` <span class="badge${over ? ' err' : ''}" title="daily budget ${C.fmtUSD(p.budgetUSD)}">${Math.round((p.todayCost / p.budgetUSD) * 100)}%</span>`
                        : '';
                    return `<tr class="click" data-project="${C.esc(p.name)}" title="${C.esc(p.note || 'Filter the Sessions table by this project')}">
                        <td><strong>${C.esc(p.name)}</strong>${p.note ? ` <span class="muted small">${C.esc(p.note)}</span>` : ''}</td>
                        <td class="muted small">${C.esc((p.agents || []).join(', ')) || '—'}</td>
                        <td class="num">${p.sessions}</td>
                        <td class="num">${C.fmtUSD(p.todayCost)}${budget}</td>
                        <td class="num"><strong>${C.fmtUSD(p.cost)}</strong></td>
                        <td class="num">${C.fmtTok(p.tokens)}</td>
                        <td class="num">${p.lastTs ? new Date(p.lastTs).toLocaleDateString() : '—'}</td>
                    </tr>`;
                }).join('')}
            </table></div>
            <p class="footnote">An agent belongs to exactly one project, so these rows add up to the fleet total. <a data-manage-projects style="cursor:pointer">Manage projects →</a></p>`
            : `<p class="footnote">No projects declared yet — group your agents by customer / product and every figure here can be read per project. <a data-manage-projects style="cursor:pointer">Set them up →</a></p>`;

        const unknown = DATA.unknownModels.length
            ? `<p class="footnote">⚠ No pricing rule matched: ${DATA.unknownModels.map(C.esc).join(', ')} — their cost is counted as $0. <a data-status-kind="settings" data-status-value="agentFarm.pricing" style="cursor:pointer">Add a rule in agentFarm.pricing →</a></p>`
            : '';
        const extEntries = Object.entries(DATA.externalSessions || {});
        const externalNote = extEntries.length
            ? `<p class="footnote">⌁ External CLI sessions: ${extEntries.map(([src, n]) => `${C.esc(src)} ×${n}`).join(' · ')} — kept out of the totals above; their costs use <code>agentFarm.pricing</code> rules when a model matches, otherwise $0.</p>`
            : '';

        document.getElementById('app').innerHTML = `
            ${window.AFHeader.html({
                page: 'dashboard',
                title: 'Agent Farm',
                sub: `Generated ${new Date(DATA.generatedAt).toLocaleString()} · data: local Claude Code transcripts`,
                // Every day of the first week, then the longer spans, then two
                // dates. "Yesterday and today" and "that week in July" were
                // both unaskable when the smallest step was 7 days.
                // ‼️ Every one of these buttons says what its number MEANS. The
                // first week was drawn as bare digits next to a "14d 30d 90d"
                // segment, so one row of the same control had a unit and the
                // other did not — and a lone "5" beside "14d" reads as anything
                // but five days.
                controls: `<span class="seg">${[1, 2, 3, 4, 5, 6, 7].map(r =>
                        `<button data-range="${r}" class="${r === range ? 'sel' : ''}" title="${r === 1 ? 'Today' : 'The last ' + r + ' days, today included'}">${r}d</button>`).join('')}</span>
                    <span class="seg">${[14, 30, 90, 180, 365].map(r =>
                        `<button data-range="${r}" class="${r === range ? 'sel' : ''}">${r}d</button>`).join('')}</span>
                    <span class="seg"><button data-range="custom" class="${range === 'custom' ? 'sel' : ''}" title="Between two dates">⇤⇥</button></span>
                    ${range === 'custom' ? `<span class="seg" style="gap:4px">
                        <input type="date" id="dash-from" value="${C.esc(rangeFrom)}" title="From this day">
                        <input type="date" id="dash-to" value="${C.esc(rangeTo)}" title="To this day, included">
                    </span>` : ''}`,
                // ⚖ Sync constitution had no button anywhere: mirroring the
                // shared CLAUDE.md to the AGENTS.md files the other engines read
                // was reachable from the command palette and the bridge only, so
                // the one operation that touches EVERY agent at once was the one
                // you could not click. It belongs on the board that is about the
                // whole farm rather than any single agent.
                related: [
                    { nav: 'turns', label: 'Turns' },
                    {
                        action: 'syncConstitution', label: '⚖ Sync Cons.',
                        title: 'Mirror the shared constitution (the nest root\'s own CLAUDE.md) to the AGENTS.md files Codex and Antigravity read. CLAUDE.md is only read, never written; a hand-edited AGENTS.md is reported, not overwritten.'
                    }
                ],
                guide: 'dashboard'
            })}
            ${kpis}
            ${statusRow}
            ${charts}
            <h2>Agents</h2>
            <div class="grid">${cards}</div>
            ${cmpSection()}
            ${projectsCard}
            <h2>Sessions</h2>
            <div id="sessblock"></div>
            ${unknown}
            ${externalNote}
            <p class="footnote">Costs are API-equivalent values computed from token usage — on a subscription plan this is not your bill, it is the value you extracted. Sessions are matched to agents by their working directory under your agent roots.</p>
        `;

        window.AFHeader.wire(vscode);
        document.querySelectorAll('[data-range]').forEach(b =>
            b.addEventListener('click', () => {
                const r = b.dataset.range;
                if (r === 'custom') {
                    range = 'custom';
                    // open on the span you were already looking at, so the
                    // dates start somewhere meaningful instead of empty
                    if (!rangeFrom || !rangeTo) {
                        const d = rangeDays();
                        rangeFrom = d[0];
                        rangeTo = d[d.length - 1];
                    }
                } else {
                    range = Number(r);
                }
                render();
            }));
        const dateBox = (id, set) => {
            const el = document.getElementById(id);
            if (el) { el.addEventListener('change', () => { set(el.value); render(); }); }
        };
        dateBox('dash-from', v => { rangeFrom = v; });
        dateBox('dash-to', v => { rangeTo = v; });
        document.querySelectorAll('[data-detail]').forEach(b =>
            b.addEventListener('click', ev => { ev.stopPropagation(); vscode.postMessage({ type: 'openAgent', agentId: b.dataset.detail }); }));
        document.querySelectorAll('[data-start]').forEach(b =>
            b.addEventListener('click', ev => { ev.stopPropagation(); vscode.postMessage({ type: 'startSession', agentId: b.dataset.start }); }));
        document.querySelectorAll('.agent-card').forEach(card =>
            card.addEventListener('click', () => vscode.postMessage({ type: 'openAgent', agentId: card.dataset.agent })));
        document.querySelectorAll('[data-agent-row]').forEach(row =>
            row.addEventListener('click', () => vscode.postMessage({ type: 'openAgent', agentId: row.dataset.agentRow })));
        document.querySelectorAll('[data-guide]').forEach(a =>
            a.addEventListener('click', ev => { ev.stopPropagation(); vscode.postMessage({ type: 'openGuide', anchor: a.dataset.guide }); }));
        document.querySelectorAll('[data-manage-projects]').forEach(a =>
            a.addEventListener('click', ev => { ev.stopPropagation(); vscode.postMessage({ type: 'manageProjects' }); }));
        document.querySelectorAll('[data-project]').forEach(row =>
            row.addEventListener('click', () => {
                // the project row is a lens on the sessions below it
                sessTable.setProjectFilter(row.dataset.project);
                const el = document.getElementById('sessblock');
                if (el && el.scrollIntoView) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
            }));
        document.querySelectorAll('[data-status-kind]').forEach(b =>
            b.addEventListener('click', () => vscode.postMessage({
                type: 'statusAction', kind: b.dataset.statusKind, value: b.dataset.statusValue
            })));
        const puBtn = document.getElementById('pu-refresh');
        if (puBtn) {
            // force: the ⟳ means "now", not "if the cache happens to be stale"
            puBtn.addEventListener('click', () => { if (!puBusy) { askPlanUsage(true); render(); } });
        }

        // ---- Agent comparison controls ----
        const wireCmp = (id, ev, fn) => {
            const el = document.getElementById(id);
            if (el && el.addEventListener) { el.addEventListener(ev, () => fn(el)); }
        };
        wireCmp('cmp-window', 'change', el => {
            cmpWin = el.value;
            if (cmpWin === 'all') { cmpRows = null; render(); }
            else { render(); requestCmp(); } // custom shows its date inputs first
        });
        // Dates and the Show box apply as you type, on a longer beat than the
        // client-side filters: each commit is a round trip to the host.
        const liveCmp = (id, fn, delay) => window.AFFilter.live(document.getElementById(id), fn, delay);
        liveCmp('cmp-from', el => { cmpFrom = el.value; requestCmp(); }, 400);
        liveCmp('cmp-to', el => { cmpTo = el.value; requestCmp(); }, 400);
        wireCmp('cmp-sort', 'change', el => {
            cmpSort = el.value;
            const defs = cmpRows ? CMP_SORTS_WIN : CMP_SORTS_ALL;
            const def = defs.find(s => s.id === cmpSort);
            cmpAsc = !!(def && def.str);
            render();
        });
        wireCmp('cmp-dir', 'click', () => { cmpAsc = !cmpAsc; render(); });
        liveCmp('cmp-count', el => {
            const v = parseInt(el.value, 10);
            cmpShow = isFinite(v) && v >= 1 ? v : 0;
            render();
        }, 300);
        wireCmp('cmp-all', 'click', () => { cmpShow = cmpShow === 0 ? CMP_SHOW_DEFAULT : 0; render(); });

        // The shared component fills its container and wires its own controls
        // (sort box, Show box, turn accordion, single-open, ⌨) — after every
        // full render. sessionTableN echoes the Show box (0 = all).
        sessTable.setRows(DATA.sessionRows || [], DATA.sessionTableN);
    }

    render();
    armPlanUsage();
    askPlanUsage(false);   // first fill — the host serves its cache if it is fresh
})();
