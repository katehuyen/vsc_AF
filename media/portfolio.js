// Agent Farm — Agent Portfolio: the whole fleet on one screen.
// One row per agent, grouped by project, sortable on every column. Answers the
// portfolio questions the per-agent page cannot: who is working, who has been
// quiet for weeks, who costs what, whose duties are waiting, who is on which
// job. Every figure comes from the host (portfolioPanel.ts); this file sorts,
// groups and draws.
(function () {
    'use strict';

    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    // htmlShell injects the first payload as window.__DATA__ — reading anything
    // else means an empty table until the user presses Refresh.
    let DATA = window.__DATA__ || { rows: [], projects: [], dormantDays: 14 };

    const COLS = [
        { id: 'name', label: 'Agent', num: false, get: r => r.name },
        { id: 'status', label: 'Now', num: false, get: r => (r.active ? 2 : r.status === 'idle' ? 0 : 1) },
        { id: 'quiet', label: 'Quiet', num: true, get: r => (r.quietDays < 0 ? 99999 : r.quietDays), tip: 'Days since this agent last did anything' },
        { id: 'sessions7', label: '7d ses.', num: true, get: r => r.sessions7 },
        { id: 'cost7', label: '7d $', num: true, get: r => r.cost7 },
        { id: 'sessions30', label: '30d ses.', num: true, get: r => r.sessions30 },
        { id: 'cost30', label: '30d $', num: true, get: r => r.cost30 },
        { id: 'tokens30', label: '30d tok', num: true, get: r => r.tokens30 },
        { id: 'files', label: 'Files', num: true, get: r => r.filesEdited30, tip: 'Distinct files this agent wrote to in the last 30 days' },
        { id: 'duties', label: 'Duties', num: true, get: r => r.duties, tip: 'Standing duties · ⏳ = work waiting · ⏸ = paused' },
        { id: 'findings', label: 'Findings', num: true, get: r => r.errors * 100 + r.warnings, tip: 'Open insights: errors + warnings' },
        { id: 'memory', label: 'Memory', num: true, get: r => r.memoryFiles },
        { id: 'ctx', label: 'Fixed ctx', num: true, get: r => r.contextLoad, tip: 'Tokens loaded on every turn of this agent (CLAUDE.md + memory index)' }
    ];

    const STATE_KEY = 'afPortfolio';
    const saved = (typeof vscode.getState === 'function' && vscode.getState()) || {};
    let st = Object.assign({ sort: 'cost30', dir: -1, group: true, hideDormant: false, projects: null }, saved[STATE_KEY]);
    const save = () => {
        const all = (typeof vscode.getState === 'function' && vscode.getState()) || {};
        all[STATE_KEY] = st;
        vscode.setState(all);
    };

    const STYLE = `<style>
        .pf td, .pf th { white-space:nowrap; }
        .pf .agentcell { min-width:170px; }
        .dot2 { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:6px; }
        .grouphead td { background:color-mix(in srgb, var(--vscode-textLink-foreground) 10%, transparent);
            font-weight:600; }
        /* the fleet line: pinned above everything, never re-ordered by a sort */
        .totrow td { background:color-mix(in srgb, var(--vscode-foreground) 9%, transparent);
            border-bottom:2px solid var(--vscode-widget-border,#4444); font-size:12px; }
        .dormant td { opacity:.55; }
        .pf tr.click:hover td { background:var(--vscode-list-hoverBackground); }
        .miniact { font-size:10px; padding:0 6px; line-height:16px; margin-left:4px; cursor:pointer;
            border-radius:3px; background:transparent; opacity:.65;
            border:1px solid var(--vscode-widget-border, #4444); color:var(--vscode-foreground); }
        .miniact:hover { opacity:1; }
    </style>`;

    const STATUS = {
        'working': { label: 'WORKING', color: 'var(--vscode-charts-blue,#3794ff)' },
        'tool': { label: 'TOOL', color: 'var(--vscode-charts-green,#4caf50)' },
        'waiting-permission': { label: 'PERMISSION?', color: 'var(--vscode-charts-red,#f14c4c)' },
        'waiting-input': { label: 'YOUR TURN', color: 'var(--vscode-charts-yellow,#cca700)' },
        'stalled': { label: 'STALLED', color: 'var(--vscode-charts-orange,#d18616)' },
        'idle': { label: '', color: 'var(--vscode-descriptionForeground,#999)' },
        'ended': { label: '', color: 'var(--vscode-descriptionForeground,#999)' }
    };

    function quietCell(r) {
        if (r.quietDays < 0) { return '<span class="muted">never</span>'; }
        if (r.quietDays === 0) { return 'today'; }
        return `${r.quietDays}d${r.dormant ? ' <span class="badge warn" title="dormant">💤</span>' : ''}`;
    }

    function render() {
        const rows = (DATA.rows || []).filter(r =>
            (!st.hideDormant || !r.dormant) &&
            (!st.projects || st.projects.indexOf(r.project) >= 0));
        const col = COLS.find(c => c.id === st.sort) || COLS[0];
        const sorted = rows.slice().sort((a, b) => {
            const va = col.get(a), vb = col.get(b);
            const cmp = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
            return cmp * st.dir;
        });

        // The whole-fleet picture, summed over exactly the rows on screen (so a
        // project filter or "hide dormant" narrows the totals too). It is
        // rendered OUTSIDE the sort, always first, because a total that moves
        // when you re-sort is not a total you can glance at.
        const totals = rows.reduce((t, r) => {
            t.cost30 += r.cost30; t.cost7 += r.cost7; t.today += r.costToday;
            t.sessions7 += r.sessions7; t.sessions30 += r.sessions30;
            t.tokens30 += r.tokens30; t.files += r.filesEdited30;
            t.duties += r.duties; t.dutiesWaiting += r.dutiesWaiting;
            t.errors += r.errors; t.warnings += r.warnings;
            t.memoryFiles += r.memoryFiles; t.contextLoad += r.contextLoad;
            t.active += r.active ? 1 : 0; t.dormant += r.dormant ? 1 : 0;
            return t;
        }, {
            cost30: 0, cost7: 0, today: 0, sessions7: 0, sessions30: 0, tokens30: 0,
            files: 0, duties: 0, dutiesWaiting: 0, errors: 0, warnings: 0,
            memoryFiles: 0, contextLoad: 0, active: 0, dormant: 0
        });

        const totalsRow = `<tr class="totrow" title="Every agent listed above — the fleet's own numbers, unaffected by sorting">
            <td class="agentcell"><strong>ALL ${rows.length} AGENTS</strong></td>
            <td>${totals.active ? `<span class="badge">${totals.active} working</span>` : '<span class="muted">—</span>'}</td>
            <td class="num">${totals.dormant ? totals.dormant + ' 💤' : '—'}</td>
            <td class="num">${totals.sessions7 || ''}</td>
            <td class="num">${totals.cost7 ? C.fmtUSD(totals.cost7) : ''}</td>
            <td class="num">${totals.sessions30 || ''}</td>
            <td class="num"><strong>${totals.cost30 ? C.fmtUSD(totals.cost30) : ''}</strong></td>
            <td class="num">${totals.tokens30 ? C.fmtTok(totals.tokens30) : ''}</td>
            <td class="num">${totals.files || ''}</td>
            <td class="num">${totals.duties || ''}${totals.dutiesWaiting ? ` <span class="badge warn">⏳${totals.dutiesWaiting}</span>` : ''}</td>
            <td class="num">${totals.errors ? `<span class="badge err">${totals.errors}</span> ` : ''}${totals.warnings ? `<span class="badge warn">${totals.warnings}</span>` : ''}${!totals.errors && !totals.warnings ? '—' : ''}</td>
            <td class="num">${totals.memoryFiles || ''}</td>
            <td class="num"><strong>${C.fmtTok(totals.contextLoad)}</strong></td>
            <td></td>
        </tr>`;

        const head = `<tr>${COLS.map(c =>
            `<th class="${c.num ? 'num ' : ''}click" data-sort="${c.id}" title="${c.tip || 'Sort by ' + c.label}">${c.label}${st.sort === c.id ? (st.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`
        ).join('')}<th></th></tr>`;

        const rowHtml = r => {
            const s = STATUS[r.status] || STATUS.idle;
            return `<tr class="click${r.dormant ? ' dormant' : ''}" data-agent="${C.esc(r.id)}" title="${C.esc(r.dir)}">
                <td class="agentcell"><i class="dot2" style="background:${r.active ? 'var(--vscode-charts-green,#4caf50)' : s.color}"></i><strong>${C.esc(r.name)}</strong></td>
                <td>${s.label ? `<span class="badge" style="color:${s.color};border-color:${s.color}">${s.label}</span>` : '<span class="muted">—</span>'}</td>
                <td class="num">${quietCell(r)}</td>
                <td class="num">${r.sessions7 || ''}</td>
                <td class="num">${r.cost7 ? C.fmtUSD(r.cost7) : ''}</td>
                <td class="num">${r.sessions30 || ''}</td>
                <td class="num"><strong>${r.cost30 ? C.fmtUSD(r.cost30) : ''}</strong>${r.budget ? ` <span class="badge${r.costToday > r.budget ? ' err' : ''}" title="daily budget ${C.fmtUSD(r.budget)} · today ${C.fmtUSD(r.costToday)}">${Math.round((r.costToday / r.budget) * 100)}%</span>` : ''}</td>
                <td class="num">${r.tokens30 ? C.fmtTok(r.tokens30) : ''}</td>
                <td class="num">${r.filesEdited30 || ''}</td>
                <td class="num">${r.duties || ''}${r.dutiesWaiting ? ` <span class="badge warn" title="${r.dutiesWaiting} duty(ies) have work waiting">⏳${r.dutiesWaiting}</span>` : ''}${r.dutiesPaused ? ` <span class="badge" title="${r.dutiesPaused} paused">⏸${r.dutiesPaused}</span>` : ''}</td>
                <td class="num">${r.errors ? `<span class="badge err">${r.errors}</span> ` : ''}${r.warnings ? `<span class="badge warn">${r.warnings}</span>` : ''}${!r.errors && !r.warnings ? '<span class="muted">—</span>' : ''}</td>
                <td class="num">${r.memoryFiles || ''}</td>
                <td class="num">${C.fmtTok(r.contextLoad)}</td>
                <td>
                    <button class="miniact" data-start="${C.esc(r.id)}" title="Start a session for this agent (launcher)">▶</button>
                    <button class="miniact" data-project-of="${C.esc(r.id)}" title="Assign this agent to a project">◧</button>
                    <button class="miniact" data-reveal="${C.esc(r.id)}" title="Reveal this agent's folder">📁</button>
                </td>
            </tr>`;
        };

        let body;
        if (st.group) {
            const groups = [];
            sorted.forEach(r => {
                let g = groups.find(x => x.name === r.project);
                if (!g) { groups.push(g = { name: r.project, rows: [] }); }
                g.rows.push(r);
            });
            groups.sort((a, b) => a.name === 'Unassigned' ? 1 : b.name === 'Unassigned' ? -1 : a.name.localeCompare(b.name));
            body = groups.map(g => {
                const cost = g.rows.reduce((n, r) => n + r.cost30, 0);
                return `<tr class="grouphead"><td colspan="${COLS.length + 1}">${C.esc(g.name)} <span class="muted small">· ${g.rows.length} agent(s) · ${C.fmtUSD(cost)} in 30d</span></td></tr>`
                    + g.rows.map(rowHtml).join('');
            }).join('');
        } else {
            body = sorted.map(rowHtml).join('');
        }

        const projectChips = (DATA.projects || []).concat(['Unassigned']).map(p =>
            `<button class="chip${st.projects && st.projects.indexOf(p) >= 0 ? ' on' : ''}" data-proj="${C.esc(p)}" title="Show only this project">${C.esc(p)}</button>`).join('');

        document.getElementById('app').innerHTML = `${STYLE}
            ${window.AFHeader.html({
                page: 'portfolio',
                title: 'Agent Portfolio',
                sub: `${rows.length} agents · ${totals.active} working now · ${totals.dormant} dormant (>${DATA.dormantDays}d) · ${C.fmtUSD(totals.cost30)} in 30 days`,
                controls: `<button class="secondary" id="pf-group">${st.group ? '☑' : '☐'} Group by project</button>
                    <button class="secondary" id="pf-dormant">${st.hideDormant ? '☑' : '☐'} Hide dormant</button>
                    <button class="secondary" id="pf-manage">Manage projects…</button>`,
                guide: 'ajan-portfoyu'
            })}
            <div class="chiprow">${projectChips || ''}${st.projects ? '<button class="chip" id="pf-allproj">All projects</button>' : ''}</div>
            <div class="tablewrap"><table class="pf">${head}${rows.length ? totalsRow : ''}${body || `<tr><td colspan="${COLS.length + 1}" class="muted">No agents match.</td></tr>`}</table></div>
            <p class="footnote">Rows are agents; the group header sums each project's last 30 days. "Quiet" is days since the agent's last session — 💤 marks anything older than ${DATA.dormantDays} days. Costs are API-equivalent values from local transcripts, not a bill.</p>`;

        window.AFHeader.wire(vscode, { onRefresh: () => vscode.postMessage({ type: 'refresh' }) });
        document.querySelectorAll('[data-sort]').forEach(th =>
            th.addEventListener('click', () => {
                if (st.sort === th.dataset.sort) { st.dir = -st.dir; }
                else { st.sort = th.dataset.sort; st.dir = -1; }
                save(); render();
            }));
        document.querySelectorAll('[data-agent]').forEach(tr =>
            tr.addEventListener('click', () => vscode.postMessage({ type: 'openAgent', agentId: tr.dataset.agent })));
        const act = (sel, type, key) => document.querySelectorAll(sel).forEach(b =>
            b.addEventListener('click', ev => {
                ev.stopPropagation();
                vscode.postMessage({ type, agentId: b.dataset[key] });
            }));
        act('[data-start]', 'startSession', 'start');
        act('[data-project-of]', 'assignProject', 'projectOf');
        act('[data-reveal]', 'reveal', 'reveal');
        document.querySelectorAll('[data-proj]').forEach(b =>
            b.addEventListener('click', () => {
                const p = b.dataset.proj;
                const cur = st.projects || [];
                st.projects = cur.indexOf(p) >= 0 ? cur.filter(x => x !== p) : cur.concat([p]);
                if (!st.projects.length) { st.projects = null; }
                save(); render();
            }));
        const btn = (id, fn) => { const el = document.getElementById(id); if (el) { el.addEventListener('click', fn); } };
        btn('pf-group', () => { st.group = !st.group; save(); render(); });
        btn('pf-dormant', () => { st.hideDormant = !st.hideDormant; save(); render(); });
        btn('pf-manage', () => vscode.postMessage({ type: 'manageProjects' }));
        btn('pf-allproj', () => { st.projects = null; save(); render(); });
    }

    window.addEventListener('message', ev => {
        if (ev.data && ev.data.type === 'data') { DATA = ev.data.data; render(); }
    });

    render();
})();
