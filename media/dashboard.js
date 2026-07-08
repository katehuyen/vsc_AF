// Agent Farm — dashboard page script.
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    let DATA = window.__DATA__;
    let range = 14;

    window.addEventListener('message', ev => {
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
            <div class="card"><div class="label">Cost today</div><div class="kpi">${C.fmtUSD(todayCost)}</div><div class="sub">API-equivalent value</div></div>
            <div class="card"><div class="label">Cost · ${range}d</div><div class="kpi">${C.fmtUSD(rangeCost)}</div><div class="sub">${C.fmtTok(rangeTokens)} tokens · ${rangeMsgs} msgs</div></div>
            <div class="card"><div class="label">Sessions</div><div class="kpi">${sessionsTotal}</div><div class="sub">all time, farm scope</div></div>
            <div class="card"><div class="label">5h window</div>${windowHtml}</div>
            <div class="card"><div class="label">Insights</div><div class="kpi">${ins.error + ins.warning + ins.info}</div>
                <div class="sub">${ins.error} errors · ${ins.warning} warnings · ${ins.info} info <a data-guide="saglik-ve-optimizasyon">?</a></div></div>
        </div>`;

        const series = agents.map(a => ({
            name: a.name,
            values: days.map(d => a.daily[d] ? a.daily[d].cost : 0)
        })).filter(s => s.values.some(v => v > 0));

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
            <div class="card chartbox"><h3>Daily cost by agent <a data-guide="dashboard">?</a></h3>${C.stackedBars(days, series, {})}</div>
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
            return `<div class="card agent-card" data-agent="${C.esc(a.id)}">
                <h3><span class="dot ${a.active ? 'on' : 'off'}"></span>${C.esc(a.name)}${badges}</h3>
                <div class="sub">${a.active ? 'ACTIVE' : relTime(a.lastActivity)} · ${a.sessions} sessions · ctx ~${C.fmtTok(a.contextLoad)} tok</div>
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

        const top = DATA.topSessions.map(s => `
            <tr class="click" data-session="${C.esc(s.file)}">
                <td>${C.esc(s.agent)}${s.sidechain ? ' <span class="badge">sub</span>' : ''}</td>
                <td>${C.esc(s.title)}</td>
                <td class="num">${relTime(s.ts)}</td>
                <td class="num">${s.durationMin}m</td>
                <td class="num">${C.fmtTok(s.tokens)}</td>
                <td class="num"><strong>${C.fmtUSD(s.cost)}</strong></td>
            </tr>`).join('');

        const unknown = DATA.unknownModels.length
            ? `<p class="footnote">⚠ No pricing rule matched: ${DATA.unknownModels.map(C.esc).join(', ')} — their cost is counted as $0. Add a rule in <code>agentFarm.pricing</code>.</p>`
            : '';

        document.getElementById('app').innerHTML = `
            <div class="spread">
                <div><h1>Agent Farm</h1><div class="muted small">Generated ${new Date(DATA.generatedAt).toLocaleString()} · data: local Claude Code transcripts</div></div>
                <div class="btnrow">
                    <span class="seg">
                        ${[7, 14, 30, 90].map(r => `<button data-range="${r}" class="${r === range ? 'sel' : ''}">${r}d</button>`).join('')}
                    </span>
                    <button class="secondary" id="refresh">Refresh</button>
                    <button class="secondary" data-guide="dashboard">? Guide</button>
                </div>
            </div>
            ${kpis}
            ${charts}
            <h2>Agents</h2>
            <div class="grid">${cards}</div>
            <h2>Top sessions by cost</h2>
            <div class="tablewrap"><table>
                <tr><th>Agent</th><th>Title</th><th class="num">When</th><th class="num">Duration</th><th class="num">Tokens</th><th class="num">Cost</th></tr>
                ${top || '<tr><td colspan="6" class="muted">No sessions yet.</td></tr>'}
            </table></div>
            ${unknown}
            <p class="footnote">Costs are API-equivalent values computed from token usage — on a subscription plan this is not your bill, it is the value you extracted. Sessions are matched to agents by their working directory under your agent roots.</p>
        `;

        document.getElementById('refresh').addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
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
        document.querySelectorAll('[data-guide]').forEach(a =>
            a.addEventListener('click', ev => { ev.stopPropagation(); vscode.postMessage({ type: 'openGuide', anchor: a.dataset.guide }); }));
    }

    render();
})();
