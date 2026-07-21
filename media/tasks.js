// Agent Farm — Tasks page: the single command center for tasks. Four tabs —
// Board (live queue + NL command bar), Automations (triggers + schedules),
// Reusables (templates + workflows), Analytics (per-agent scorecards + load).
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    let DATA = window.__DATA__;
    const state = { tab: 'board' };

    const TABS = [
        { id: 'board', label: 'Board' },
        { id: 'automations', label: 'Automations' },
        { id: 'reusables', label: 'Reusables' },
        { id: 'analytics', label: 'Analytics' }
    ];

    window.addEventListener('message', ev => { if (ev.data.type === 'data') { DATA = ev.data.data; render(); } });
    const post = m => vscode.postMessage(m);
    const esc = s => C.esc(String(s === undefined || s === null ? '' : s));

    function relTime(ts) {
        if (!ts) { return ''; }
        const diff = ts - Date.now(), abs = Math.abs(diff), m = Math.round(abs / 60000);
        const rel = m < 60 ? m + 'm' : (m < 1440 ? Math.round(m / 60) + 'h' : Math.round(m / 1440) + 'd');
        return diff >= 0 ? 'in ' + rel : rel + ' ago';
    }
    const dur = min => min == null ? '' : (min < 60 ? min + 'm' : Math.floor(min / 60) + 'h' + (min % 60 ? (min % 60) + 'm' : ''));
    const pct = r => r == null ? '—' : Math.round(r * 100) + '%';

    // ---------------------------------------------------------------- board
    function taskCard(t) {
        const badge = t.verified ? `<span class="tag ${t.verified === 'pass' ? 'on' : 'off'}">${t.verified}</span>` : '';
        let acts = '';
        if (t.status === 'queued' && t.deferredReason === undefined) {
            acts = `<button class="mini add" data-do="move" data-to="running" data-id="${esc(t.id)}">Start</button>
                    <button class="mini" data-do="cancel" data-id="${esc(t.id)}">Cancel</button>
                    <button class="mini danger" data-do="delete-task" data-id="${esc(t.id)}">Delete</button>`;
        } else if (t.status === 'queued') {
            acts = `<button class="mini" data-do="move" data-to="inbox" data-id="${esc(t.id)}" title="unpark — request start now">To Inbox</button>
                    <button class="mini" data-do="cancel" data-id="${esc(t.id)}">Cancel</button>`;
        } else if (t.status === 'running') {
            acts = `<button class="mini add" data-do="move" data-to="done" data-id="${esc(t.id)}">Done</button>
                    <button class="mini" data-do="cancel" data-id="${esc(t.id)}">Cancel</button>` +
                (t.hasOutput ? `<button class="mini" data-do="open-output" data-file="${esc(t.outputFile)}">Output</button>` : '');
        } else {
            acts = (t.hasOutput ? `<button class="mini" data-do="open-output" data-file="${esc(t.outputFile)}">Output</button>` : '') +
                `<button class="mini danger" data-do="delete-task" data-id="${esc(t.id)}">Delete</button>`;
        }
        return `<div class="tcard tc-${esc(t.status)}">
            <div class="tc-title">${esc(t.title)} ${badge}</div>
            <div class="muted small">${esc(t.agentName)} · ${esc(t.mode)}${t.durMin != null ? ' · ' + dur(t.durMin) : ''}${t.deferredReason ? ' · ' + esc(t.deferredReason) : ''}</div>
            <div class="tc-acts">${acts}</div></div>`;
    }
    function waitingCard(w) {
        const appr = w.ref && w.ref.approvalId
            ? `<button class="mini add" data-approve="${esc(w.ref.approvalId)}">Run</button>
               <button class="mini" data-reject="${esc(w.ref.approvalId)}">Reject</button>`
            : '<button class="mini" data-do="open-needs">Open Needs You</button>';
        return `<div class="tcard tc-wait">
            <div class="tc-title">${esc(w.title)}</div>
            <div class="muted small">${esc(w.agentName)}${w.detail ? ' · ' + esc(w.detail) : ''}</div>
            <div class="tc-acts">${appr}</div></div>`;
    }
    function column(title, cards) {
        return `<div class="col"><div class="col-h">${title} <span class="cnt">${cards.length}</span></div>
            ${cards.length ? cards.join('') : '<div class="muted small empty">—</div>'}</div>`;
    }
    function boardTab() {
        const b = DATA.board;
        return `<div class="tk-bar">
                <input id="nl" type="text" placeholder="Natural-language command — e.g. “ask dev to run the tests headless”">
                <button class="mini add" id="nlgo">Run</button>
                <span class="vsep"></span>
                <button class="mini" data-do="add-task">+ Task</button>
            </div>
            <div class="cols">
                ${column('Inbox', b.inbox.map(taskCard))}
                ${column('Parked', b.parked.map(taskCard))}
                ${column('Running', b.running.map(taskCard))}
                ${column('Needs You', b.waiting.map(waitingCard))}
                ${column('Done', b.done.map(taskCard))}
            </div>`;
    }

    // ---------------------------------------------------------------- automations
    function automationsTab() {
        const a = DATA.automations;
        const trigRows = a.triggers.map(t => `<tr>
            <td class="nm">${esc(t.title)}${t.enabled ? '' : ' <span class="tag off">off</span>'}</td>
            <td class="small">${esc(t.target)}</td>
            <td class="small">${esc(t.reliability) || (t.fireCount ? t.fireCount + ' fires' : '<span class="muted">—</span>')}</td>
            <td class="act">
                <button class="mini" data-do="trigger-fire" data-id="${esc(t.id)}">Fire</button>
                <button class="mini" data-do="trigger-toggle" data-id="${esc(t.id)}">${t.enabled ? 'Disable' : 'Enable'}</button>
                <button class="mini danger" data-do="trigger-delete" data-id="${esc(t.id)}">Delete</button></td></tr>`).join('');
        const schedRows = a.schedules.map(s => `<tr>
            <td class="nm">${esc(s.title)}${s.enabled ? '' : ' <span class="tag off">off</span>'}</td>
            <td class="small">${esc(s.agent)}</td>
            <td class="small">${esc(s.when)}</td>
            <td class="small">${s.next ? esc(relTime(s.next)) : '<span class="muted">—</span>'}</td>
            <td class="small">${esc(s.missed)}</td>
            <td class="act">
                <button class="mini" data-do="schedule-run" data-id="${esc(s.id)}">Run now</button>
                <button class="mini" data-do="schedule-toggle" data-id="${esc(s.id)}">${s.enabled ? 'Disable' : 'Enable'}</button>
                <button class="mini danger" data-do="schedule-delete" data-id="${esc(s.id)}">Delete</button></td></tr>`).join('');
        return `<div class="sec"><div class="sec-h"><b>Triggers</b> <span class="muted small">fire tasks on file changes, live events or webhooks</span>
                <button class="mini add" data-do="add-trigger">+ Trigger</button></div>
            ${a.triggers.length ? `<div class="card tablewrap"><table class="tb"><tr><th>Trigger</th><th>Type / Target</th><th>Reliability</th><th></th></tr>${trigRows}</table></div>` : '<p class="muted">No triggers yet.</p>'}</div>
            <div class="sec"><div class="sec-h"><b>Schedules</b> <span class="muted small">run a prompt daily / weekly / once</span>
                <button class="mini add" data-do="add-schedule">+ Schedule</button></div>
            ${a.schedules.length ? `<div class="card tablewrap"><table class="tb"><tr><th>Schedule</th><th>Agent</th><th>When</th><th>Next</th><th>If missed</th><th></th></tr>${schedRows}</table></div>` : '<p class="muted">No schedules yet.</p>'}</div>`;
    }

    // ---------------------------------------------------------------- reusables
    function reusablesTab() {
        const r = DATA.reusables;
        const tplRows = r.templates.map(t => `<tr>
            <td class="nm">${esc(t.title)}</td><td class="small">${esc(t.agent) || '<span class="muted">any</span>'}</td><td class="small">${esc(t.mode)}</td>
            <td class="act"><button class="mini add" data-do="template-run" data-id="${esc(t.id)}">Run</button>
                <button class="mini danger" data-do="template-delete" data-id="${esc(t.id)}">Delete</button></td></tr>`).join('');
        const wfRows = r.workflows.map(w => `<tr>
            <td class="nm">${esc(w.title)}</td><td class="small">${w.steps} step(s)</td>
            <td class="act"><button class="mini add" data-do="workflow-run" data-id="${esc(w.id)}">Run</button>
                <button class="mini danger" data-do="workflow-delete" data-id="${esc(w.id)}">Delete</button></td></tr>`).join('');
        return `<div class="sec"><div class="sec-h"><b>Templates</b> <span class="muted small">saved one-off prompts — save any task as a template from its menu</span></div>
            ${r.templates.length ? `<div class="card tablewrap"><table class="tb"><tr><th>Template</th><th>Agent</th><th>Mode</th><th></th></tr>${tplRows}</table></div>` : '<p class="muted">No templates yet.</p>'}</div>
            <div class="sec"><div class="sec-h"><b>Workflows</b> <span class="muted small">multi-step agent chains</span>
                <button class="mini add" data-do="add-workflow">+ Workflow</button></div>
            ${r.workflows.length ? `<div class="card tablewrap"><table class="tb"><tr><th>Workflow</th><th>Steps</th><th></th></tr>${wfRows}</table></div>` : '<p class="muted">No workflows yet.</p>'}</div>`;
    }

    // ---------------------------------------------------------------- analytics
    function analyticsTab() {
        const an = DATA.analytics, t = an.totals;
        const rate = (t.done30d + t.failed30d) ? t.done30d / (t.done30d + t.failed30d) : null;
        const tiles = [
            ['Queued', t.queued], ['Running', t.running],
            ['Done (30d)', t.done30d], ['Failed (30d)', t.failed30d], ['Success (30d)', pct(rate)]
        ].map(([k, v]) => `<div class="tile"><div class="tile-n">${esc(v)}</div><div class="tile-k">${esc(k)}</div></div>`).join('');
        const rows = an.agents.map(a => `<tr>
            <td class="nm">${esc(a.agentName)}</td>
            <td>${a.total}</td>
            <td>${pct(a.successRate)}</td>
            <td class="small">${a.medianMs != null ? dur(Math.round(a.medianMs / 60000)) || '<1m' : '—'}</td>
            <td>${a.queued ? `<span class="use">${a.queued}</span>` : '<span class="muted">0</span>'}</td>
            <td>${a.running ? `<span class="use">${a.running}</span>` : '<span class="muted">0</span>'}</td>
            <td class="small">${a.mediaCost ? '$' + a.mediaCost.toFixed(2) : '—'}</td></tr>`).join('');
        return `<div class="tiles">${tiles}</div>
            <div class="sec-h" style="margin-top:12px"><b>Per-agent (30d)</b>
                <button class="mini" data-do="open-forecast">Forecast</button>
                <button class="mini" data-do="open-history">Full history</button></div>
            ${an.agents.length ? `<div class="card tablewrap"><table class="tb"><tr><th>Agent</th><th>Runs</th><th>Success</th><th>Median</th><th>Queued</th><th>Running</th><th>Media $</th></tr>${rows}</table></div>` : '<p class="muted">No task activity in the last 30 days.</p>'}`;
    }

    // ---------------------------------------------------------------- render
    function render() {
        const body = state.tab === 'board' ? boardTab()
            : state.tab === 'automations' ? automationsTab()
                : state.tab === 'reusables' ? reusablesTab() : analyticsTab();
        const tabBar = TABS.map(t => `<button class="seg${state.tab === t.id ? ' active' : ''}" data-tab="${t.id}">${t.label}</button>`).join('');
        document.getElementById('app').innerHTML = `
            <style>
                .seg { background:none; border:1px solid var(--vscode-widget-border,#666); border-radius:5px; color:inherit; cursor:pointer; font-size:12px; padding:3px 12px; margin-right:6px; }
                .seg.active { background:var(--vscode-charts-blue,#3794ff); color:#fff; border-color:transparent; }
                .tk-bar { display:flex; align-items:center; gap:8px; margin-bottom:10px; flex-wrap:wrap; }
                .tk-bar #nl { flex:1 1 340px; min-width:240px; padding:4px 8px; }
                .vsep { width:1px; height:20px; background:var(--vscode-widget-border,#4444); }
                .cols { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:10px; align-items:start; }
                .col { background:var(--vscode-editorWidget-background,rgba(128,128,128,.06)); border-radius:6px; padding:8px; }
                .col-h { font-weight:600; font-size:12px; margin-bottom:6px; } .col-h .cnt { opacity:.6; }
                .col .empty { padding:6px; }
                .tcard { background:var(--vscode-editor-background,#1e1e1e); border:1px solid var(--vscode-widget-border,#4443); border-radius:5px; padding:6px 8px; margin-bottom:6px; }
                .tc-title { font-weight:600; font-size:12px; }
                .tc-acts { margin-top:5px; } .tc-running { border-left:2px solid var(--vscode-charts-blue,#3794ff); } .tc-wait { border-left:2px solid var(--vscode-charts-orange,#d18616); }
                .mini { background:none; border:1px solid var(--vscode-widget-border,#666); border-radius:4px; color:inherit; cursor:pointer; font-size:11px; padding:1px 7px; margin-right:4px; }
                .mini:hover { border-color:var(--vscode-charts-blue,#3794ff); color:var(--vscode-charts-blue,#3794ff); }
                .mini.add { border-color:var(--vscode-charts-green,#4caf50); } .mini.danger:hover { border-color:var(--vscode-charts-red,#f14c4c); color:var(--vscode-charts-red,#f14c4c); }
                .tb { border-collapse:collapse; width:100%; } .tb th { text-align:left; font-size:11px; opacity:.7; padding:4px 8px; } .tb td { padding:4px 8px; vertical-align:top; }
                .tb td.nm { font-weight:600; } .tb td.act { text-align:right; white-space:nowrap; } .tb tr:hover td { background:var(--vscode-list-hoverBackground,rgba(128,128,128,.08)); }
                .tablewrap { overflow-x:auto; } .sec { margin-bottom:16px; } .sec-h { display:flex; align-items:center; gap:8px; margin-bottom:6px; }
                .tag { font-size:10px; border:1px solid currentColor; border-radius:8px; padding:0 6px; opacity:.8; } .tag.on { color:var(--vscode-charts-green,#4caf50); } .tag.off { color:var(--vscode-charts-orange,#d18616); }
                .use { color:var(--vscode-charts-blue,#3794ff); font-weight:700; }
                .tiles { display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:10px; }
                .tile { background:var(--vscode-editorWidget-background,rgba(128,128,128,.06)); border-radius:6px; padding:10px; text-align:center; }
                .tile-n { font-size:22px; font-weight:700; } .tile-k { font-size:11px; opacity:.7; margin-top:2px; }
            </style>
            ${window.AFHeader.html({
            page: 'tasks', title: 'Tasks',
            sub: 'Queue, automations, reusables and analytics — the whole task surface in one command center.',
            related: [{ nav: 'board', label: 'Classic Board' }, { nav: 'needs', label: 'Needs You' }]
        })}
            <div class="btnrow" style="margin-bottom:10px">${tabBar}</div>
            ${body}`;
        wire();
    }

    function wire() {
        window.AFHeader.wire(vscode);
        document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { state.tab = b.dataset.tab; render(); }));
        document.querySelectorAll('[data-do]').forEach(b => b.addEventListener('click', () => {
            const d = b.dataset;
            post({ type: d.do, id: d.id, to: d.to, file: d.file });
        }));
        document.querySelectorAll('[data-approve]').forEach(b => b.addEventListener('click', () => post({ type: 'approve', approvalId: b.dataset.approve, ok: true })));
        document.querySelectorAll('[data-reject]').forEach(b => b.addEventListener('click', () => post({ type: 'approve', approvalId: b.dataset.reject, ok: false })));
        const nl = document.getElementById('nl'), go = document.getElementById('nlgo');
        const send = () => { const v = (nl.value || '').trim(); if (v) { post({ type: 'nlcommand', text: v }); nl.value = ''; } };
        if (go) { go.addEventListener('click', send); }
        if (nl) { nl.addEventListener('keydown', e => { if (e.key === 'Enter') { send(); } }); }
    }

    render();
})();
