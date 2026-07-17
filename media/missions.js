// Agent Farm — Missions page: dynamic multi-agent orchestration.
// A mission = goal + lead agent + team + hard limits. The page lists runs,
// shows each run's round-by-round timeline (planner thought + delegations),
// hosts the approval / question waits, and carries the New Mission form.
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    let DATA = window.__DATA__;

    let selected = null;              // runId shown in the detail block
    let formOpen = !!DATA.newForm;
    let formErr = '';
    // background refreshes must not wipe an in-progress edit (2.47 lesson)
    let editing = false;
    let pendingData = null;
    // form model survives re-renders
    const form = {
        title: '', goal: '', leadAgentId: '', workdir: '', plannerModel: '',
        team: {}, roles: {},
        maxRounds: '', maxTasks: '', maxCostUSD: '', maxMinutes: '', maxParallel: '',
        approvalMode: 'each-round'
    };

    const spec = (run) => DATA.specs.find(s => s.id === run.specId) || {
        title: run.specId, goal: '', team: [], limits: DATA.defaults, approvalMode: 'each-round', leadAgentName: '?'
    };
    const fmtTime = (ts) => ts ? new Date(ts).toLocaleString() : '—';
    const usd = (n) => '$' + (n || 0).toFixed(2);

    const STATUS_LABEL = {
        'running': 'running', 'waiting-approval': 'waiting for approval',
        'waiting-user': 'waiting for your answer', 'paused': 'paused',
        'done': 'done', 'failed': 'failed', 'cancelled': 'cancelled'
    };
    function chip(status) {
        const cls = status === 'done' ? 'ok' : (status === 'failed' ? 'bad'
            : (status === 'running' ? 'live' : 'wait'));
        return `<span class="mchip ${cls}">${C.esc(STATUS_LABEL[status] || status)}</span>`;
    }

    // ---------------- new-mission form ----------------

    function formHtml() {
        const agentOpts = ['<option value="">— pick the lead —</option>']
            .concat(DATA.agents.map(a =>
                `<option value="${C.esc(a.id)}"${form.leadAgentId === a.id ? ' selected' : ''}>${C.esc(a.name)}</option>`))
            .join('');
        const teamRows = DATA.agents.map((a, i) => `
            <div class="tmrow">
                <label><input type="checkbox" id="tm-${i}" data-team="${C.esc(a.id)}"${form.team[a.id] ? ' checked' : ''}> ${C.esc(a.name)}</label>
                <input type="text" id="rl-${i}" data-role="${C.esc(a.id)}" placeholder="role (optional — e.g. coder, reviewer)"
                    value="${C.esc(form.roles[a.id] || '')}" ${form.team[a.id] ? '' : 'disabled'}>
            </div>`).join('');
        const lim = (key, label, hint) => `
            <label class="limfield" title="${C.esc(hint)}">${label}
                <input type="number" id="lim-${key}" value="${C.esc(String(form[key] !== '' ? form[key] : DATA.defaults[key]))}">
            </label>`;
        return `<div class="card" id="mform">
            <h2 style="margin-top:0">New Mission</h2>
            <p class="muted small">The lead agent plans round by round and delegates to the team; every delegation runs as a normal
            headless task. Hard limits below fence the cost — the mission ends honestly when one is hit.</p>
            <div class="frow"><label>Title <input type="text" id="f-title" placeholder="(optional — the goal's first words otherwise)" value="${C.esc(form.title)}"></label></div>
            <div class="frow"><label>Goal <span class="req">required</span>
                <textarea id="f-goal" rows="4" placeholder="What should this mission achieve? Be concrete: repo, deliverable, what counts as done.">${C.esc(form.goal)}</textarea></label></div>
            <div class="frow"><label>Lead agent <span class="req">required</span> <select id="f-lead">${agentOpts}</select></label>
                <span class="muted small">Its CLAUDE.md is the orchestration identity — a planning-minded agent leads best.</span></div>
            <div class="frow"><span class="flabel">Team <span class="req">at least one</span></span>${teamRows}</div>
            <div class="frow"><label>Workdir <input type="text" id="f-workdir" placeholder="(optional) target repo/folder — delegations run inside it" value="${C.esc(form.workdir)}"></label>
                <button class="secondary small" id="f-browse">Browse…</button>
                <span class="muted small">With a workdir set, two writers never run in parallel.</span></div>
            <div class="frow limrow">
                ${lim('maxCostUSD', 'Max cost $', 'Hard budget: the planner is forced to finish when spent')}
                ${lim('maxRounds', 'Max rounds', 'Planner decisions')}
                ${lim('maxTasks', 'Max tasks', 'Total delegations')}
                ${lim('maxMinutes', 'Max minutes', 'Wall clock; waiting on you does not count')}
                ${lim('maxParallel', 'Max parallel', 'Delegations per wave')}
            </div>
            <div class="frow"><label>Planner model
                <input type="text" id="f-planner" placeholder="(optional) model for the LEAD's planning calls only — e.g. opus; delegates keep their own" value="${C.esc(form.plannerModel)}"></label></div>
            <div class="frow"><label>Approval
                <select id="f-approval">
                    <option value="each-round"${form.approvalMode !== 'auto' ? ' selected' : ''}>each round — approve every delegation round (recommended)</option>
                    <option value="auto"${form.approvalMode === 'auto' ? ' selected' : ''}>auto — run without gates (hard limits still apply)</option>
                </select></label></div>
            ${formErr ? `<div class="ferr">⚠ ${C.esc(formErr)}</div>` : ''}
            <div class="frow">
                <button id="f-start">Start mission</button>
                <button class="secondary" id="f-cancel">Cancel</button>
            </div>
        </div>`;
    }

    function readForm() {
        form.title = document.getElementById('f-title').value;
        form.goal = document.getElementById('f-goal').value;
        form.leadAgentId = document.getElementById('f-lead').value;
        form.workdir = document.getElementById('f-workdir').value;
        form.plannerModel = document.getElementById('f-planner').value;
        DATA.agents.forEach((a, i) => {
            form.team[a.id] = !!document.getElementById('tm-' + i).checked;
            form.roles[a.id] = document.getElementById('rl-' + i).value;
        });
        ['maxRounds', 'maxTasks', 'maxCostUSD', 'maxMinutes', 'maxParallel'].forEach(k => {
            form[k] = document.getElementById('lim-' + k).value;
        });
        form.approvalMode = document.getElementById('f-approval').value;
    }

    function submitForm() {
        readForm();
        formErr = '';
        vscode.postMessage({
            type: 'create',
            input: {
                title: form.title, goal: form.goal, leadAgentId: form.leadAgentId,
                workdir: form.workdir, plannerModel: form.plannerModel,
                team: DATA.agents.filter(a => form.team[a.id])
                    .map(a => ({ agentId: a.id, role: form.roles[a.id] || '' })),
                maxRounds: form.maxRounds, maxTasks: form.maxTasks, maxCostUSD: form.maxCostUSD,
                maxMinutes: form.maxMinutes, maxParallel: form.maxParallel,
                approvalMode: form.approvalMode
            }
        });
    }

    // ---------------- run detail ----------------

    function stepRow(s) {
        return `<tr>
            <td>${C.esc(s.agentName)}</td>
            <td>${C.esc(s.title)}${s.readonly ? ' <span class="mchip ro">read-only</span>' : ''}${s.note ? ` <span class="muted small">(${C.esc(s.note)})</span>` : ''}</td>
            <td>${chip(s.status)}</td>
            <td>${s.costUSD !== undefined ? usd(s.costUSD) : '—'}</td>
            <td>${s.outputFile ? `<a data-openfile="${C.esc(s.outputFile)}" title="Open the archived output">output</a>` : ''}</td>
        </tr>`;
    }

    function roundCard(r) {
        let body = '';
        if (r.action === 'delegate') {
            body = `<table class="mtable"><thead><tr><th>Agent</th><th>Task</th><th>Status</th><th>Cost</th><th></th></tr></thead>
                <tbody>${r.steps.map(stepRow).join('')}</tbody></table>
                ${r.rejectedReason ? `<div class="muted small">✕ ${C.esc(r.rejectedReason)} — the planner re-planned</div>` : ''}`;
        } else if (r.action === 'ask_user') {
            body = `<div class="qa"><b>Q:</b> ${C.esc(r.question || '')}<br><b>A:</b> ${C.esc(r.answer || '(pending)')}</div>`;
        } else {
            body = '';
        }
        return `<div class="roundcard">
            <div class="roundhead"><b>Round ${r.n}</b> — ${C.esc(r.action)} · <span class="muted small">${fmtTime(r.at)} · planner ${usd(r.plannerCostUSD)}</span></div>
            ${r.thought ? `<div class="thought">${C.esc(r.thought)}</div>` : ''}
            ${body}
        </div>`;
    }

    function detailHtml(run) {
        const sp = spec(run);
        const pctRaw = sp.limits.maxCostUSD > 0 ? (run.totalCostUSD / sp.limits.maxCostUSD) * 100 : 0;
        const pct = Math.min(100, Math.round(pctRaw));
        const pendingQ = (DATA.pending.questions || []).find(q => q.runId === run.id);
        const pendingAp = (DATA.pending.approvals || []).includes(run.id);
        const canPause = run.status === 'running';
        const canResume = run.status === 'paused';
        const active = run.status !== 'done' && run.status !== 'failed' && run.status !== 'cancelled';
        return `<div class="card" id="mdetail">
            <div class="dethead">
                <h2 style="margin:0">${C.esc(sp.title)}</h2>
                ${chip(run.status)}
                <span style="flex:1"></span>
                ${canPause ? `<button class="secondary" id="d-pause" title="Finish the current wave, then hold before the next planner round">Pause</button>` : ''}
                ${canResume ? `<button id="d-resume">Resume</button>` : ''}
                ${active ? `<button class="secondary" id="d-cancel" title="Cancel the mission and its running delegations">Cancel</button>` : ''}
            </div>
            <div class="muted small">lead <b>${C.esc(sp.leadAgentName)}</b> · team ${sp.team.map(m =>
                `<span class="mchip team">${C.esc(m.agentName)}${m.role ? ` — ${C.esc(m.role)}` : ''}</span>`).join(' ')}
                ${sp.workdir ? ` · workdir <code>${C.esc(sp.workdir)}</code>` : ''} · approval: ${C.esc(sp.approvalMode)}</div>
            <div class="goal">${C.esc(sp.goal)}</div>
            <div class="budget" title="Spent ${usd(run.totalCostUSD)} of the ${usd(sp.limits.maxCostUSD)} budget">
                <div class="budgetbar"><div class="budgetfill${pctRaw >= 90 ? ' hot' : ''}" style="width:${pct}%"></div></div>
                <span class="muted small">${usd(run.totalCostUSD)} / ${usd(sp.limits.maxCostUSD)} · ${run.rounds.length}/${sp.limits.maxRounds} rounds · started ${fmtTime(run.startedAt)}</span>
            </div>
            ${pendingAp ? `<div class="waitbox">This round needs your approval.
                <button id="d-approve" data-run="${C.esc(run.id)}">Approve</button>
                <button class="secondary" id="d-reject" data-run="${C.esc(run.id)}">Reject</button></div>` : ''}
            ${pendingQ ? `<div class="waitbox">Question: ${C.esc(pendingQ.question)}<br>
                <input type="text" id="d-answer" placeholder="your answer…" style="width:60%">
                <button id="d-send" data-run="${C.esc(run.id)}">Send</button></div>` : ''}
            ${run.rounds.map(roundCard).join('') || '<p class="muted">Planning the first round…</p>'}
            ${run.result ? `<div class="resultbox ${run.result.verdict}">
                <b>${C.esc(run.result.verdict.toUpperCase())}</b> — ${C.esc(run.result.summary)}
                <div class="muted small">total ${usd(run.totalCostUSD)} · ended ${fmtTime(run.endedAt)}</div></div>` : ''}
            ${run.note ? `<p class="muted small">note: ${C.esc(run.note)}</p>` : ''}
        </div>`;
    }

    function listHtml() {
        if (!DATA.runs.length) {
            return '<p class="muted">No missions yet — <a id="firstmission">start the first one</a>.</p>';
        }
        const rows = DATA.runs.map(r => {
            const sp = spec(r);
            return `<tr class="mrow${r.id === selected ? ' sel' : ''}" data-run="${C.esc(r.id)}">
                <td>${C.esc(sp.title)}</td>
                <td>${C.esc(sp.leadAgentName)}</td>
                <td>${chip(r.status)}</td>
                <td>${r.rounds.length}</td>
                <td>${usd(r.totalCostUSD)}</td>
                <td class="muted small">${fmtTime(r.startedAt)}</td>
            </tr>`;
        }).join('');
        return `<table class="mtable" id="mlist"><thead>
            <tr><th>Mission</th><th>Lead</th><th>Status</th><th>Rounds</th><th>Cost</th><th>Started</th></tr>
        </thead><tbody>${rows}</tbody></table>`;
    }

    function render() {
        if (!selected && DATA.runs.length) { selected = DATA.runs[0].id; }
        const run = DATA.runs.find(r => r.id === selected);
        document.getElementById('app').innerHTML = `
            <style>
                .mchip { font-size:10px; padding:1px 8px; border-radius:8px; white-space:nowrap;
                    background:var(--vscode-badge-background); color:var(--vscode-badge-foreground); }
                .mchip.ok { background:var(--vscode-testing-iconPassed, #2d7d46); color:#fff; }
                .mchip.bad { background:var(--vscode-inputValidation-errorBackground, #a1260d); color:#fff; }
                .mchip.live { background:var(--vscode-textLink-foreground); color:var(--vscode-editor-background); }
                .mchip.wait { background:var(--vscode-inputValidation-warningBackground, #664d00); color:var(--vscode-foreground); }
                .mchip.team, .mchip.ro { opacity:.85; }
                .mtable { width:100%; border-collapse:collapse; margin-top:8px; }
                .mtable th { text-align:left; font-size:11px; opacity:.7; padding:4px 8px; }
                .mtable td { padding:4px 8px; border-top:1px solid var(--vscode-widget-border, #3333); font-size:12px; }
                .mrow { cursor:pointer; }
                .mrow:hover td { background:var(--vscode-list-hoverBackground); }
                .mrow.sel td { background:color-mix(in srgb, var(--vscode-textLink-foreground) 12%, transparent); }
                .dethead { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
                .goal { margin:8px 0; padding:8px 10px; border-left:3px solid var(--vscode-textLink-foreground);
                    background:color-mix(in srgb, var(--vscode-textLink-foreground) 6%, transparent); white-space:pre-wrap; }
                .budget { margin:6px 0 12px; }
                .budgetbar { height:6px; border-radius:3px; background:var(--vscode-widget-border, #4444); overflow:hidden; margin-bottom:3px; }
                .budgetfill { height:100%; background:var(--vscode-textLink-foreground); }
                .budgetfill.hot { background:var(--vscode-errorForeground, #f66); }
                .roundcard { margin:10px 0; padding:8px 12px; border:1px solid var(--vscode-widget-border, #3333); border-radius:5px; }
                .roundhead { font-size:12px; }
                .thought { font-size:12px; font-style:italic; opacity:.85; margin:4px 0; }
                .qa { font-size:12px; margin-top:4px; }
                .waitbox { margin:10px 0; padding:10px 12px; border-radius:5px; font-size:12px;
                    border:1px solid var(--vscode-inputValidation-warningBorder, #b89500);
                    background:var(--vscode-inputValidation-warningBackground, #664d0033); }
                .waitbox button { margin-left:6px; }
                .resultbox { margin:12px 0 4px; padding:10px 12px; border-radius:5px; font-size:13px;
                    border-left:4px solid var(--vscode-textLink-foreground);
                    background:color-mix(in srgb, var(--vscode-textLink-foreground) 8%, transparent); }
                .resultbox.failed { border-left-color:var(--vscode-errorForeground, #f66); }
                .frow { margin:10px 0; }
                .frow label { display:block; font-size:12px; }
                .frow input[type=text], .frow textarea, .frow select { width:100%; max-width:640px; margin-top:3px; padding:5px 8px; }
                .flabel { font-size:12px; display:block; margin-bottom:4px; }
                .req { font-size:10px; color:var(--vscode-descriptionForeground); }
                .tmrow { display:flex; gap:10px; align-items:center; margin:3px 0; }
                .tmrow label { flex:0 0 180px; }
                .tmrow input[type=text] { flex:1; max-width:340px; }
                .limrow { display:flex; gap:14px; flex-wrap:wrap; }
                .limfield { font-size:11px; }
                .limfield input { width:90px; display:block; margin-top:3px; }
                .ferr { color:var(--vscode-errorForeground); font-size:12px; margin:8px 0; }
                #f-browse { margin-top:4px; }
            </style>
            ${window.AFHeader.html({
                page: 'missions',
                title: 'Missions',
                sub: 'Dynamic orchestration: a lead agent plans round by round, delegates to the team, and finishes with an honest verdict. <a data-guide="missions">?</a>',
                actions: `<button id="newmission">+ New Mission</button>`,
                guide: 'missions'
            })}
            ${formOpen ? formHtml() : ''}
            ${listHtml()}
            ${run ? detailHtml(run) : ''}
        `;

        window.AFHeader.wire(vscode);
        document.querySelectorAll('[data-guide]').forEach(el =>
            el.addEventListener('click', () => vscode.postMessage({ type: 'openGuide', anchor: el.dataset.guide })));
        const nm = document.getElementById('newmission');
        if (nm) { nm.addEventListener('click', () => { formOpen = true; render(); }); }
        const fm = document.getElementById('firstmission');
        if (fm) { fm.addEventListener('click', () => { formOpen = true; render(); }); }

        if (formOpen) {
            document.getElementById('f-start').addEventListener('click', submitForm);
            document.getElementById('f-cancel').addEventListener('click', () => { formOpen = false; formErr = ''; render(); });
            document.getElementById('f-browse').addEventListener('click', () => { readForm(); vscode.postMessage({ type: 'pickFolder' }); });
            // ticking a team agent enables its role field
            DATA.agents.forEach((a, i) => {
                const cb = document.getElementById('tm-' + i);
                if (cb) { cb.addEventListener('change', () => { readForm(); render(); }); }
            });
        }

        document.querySelectorAll('.mrow').forEach(row =>
            row.addEventListener('click', () => {
                if (formOpen) { readForm(); } // keep typed values across the re-render
                selected = row.dataset.run;
                render();
            }));
        document.querySelectorAll('[data-openfile]').forEach(a =>
            a.addEventListener('click', ev => {
                if (ev && ev.stopPropagation) { ev.stopPropagation(); }
                vscode.postMessage({ type: 'openFile', file: a.dataset.openfile });
            }));

        const wire = (id, fn) => {
            const el = document.getElementById(id);
            if (el) { el.addEventListener('click', fn); }
        };
        wire('d-pause', () => vscode.postMessage({ type: 'control', action: 'pause', runId: selected }));
        wire('d-resume', () => vscode.postMessage({ type: 'control', action: 'resume', runId: selected }));
        wire('d-cancel', () => vscode.postMessage({ type: 'control', action: 'cancel', runId: selected }));
        wire('d-approve', () => vscode.postMessage({ type: 'approve', runId: selected }));
        wire('d-reject', () => vscode.postMessage({ type: 'reject', runId: selected }));
        wire('d-send', () => {
            const inp = document.getElementById('d-answer');
            vscode.postMessage({ type: 'answer', runId: selected, text: inp ? inp.value : '' });
        });

        // hold refreshes while typing in the form / answer box
        const app = document.getElementById('app');
        if (app.addEventListener) {
            app.addEventListener('focusin', ev => {
                const t = ev.target;
                if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) { editing = true; }
            });
            app.addEventListener('focusout', () => {
                editing = false;
                if (pendingData) { DATA = pendingData; pendingData = null; render(); }
            });
        }
    }

    window.addEventListener('message', ev => {
        const m = ev.data;
        if (m.type === 'data') {
            if (formOpen) { readForm(); }
            if (editing) { pendingData = { ...DATA, ...m.data }; return; }
            DATA = { ...DATA, ...m.data };
            render();
        } else if (m.type === 'formError') {
            readForm();
            formErr = m.error;
            render();
        } else if (m.type === 'created') {
            formOpen = false;
            formErr = '';
            form.title = ''; form.goal = '';
            selected = null; // newest run auto-selects on next data render
            render();
        } else if (m.type === 'folder') {
            form.workdir = m.path;
            if (formOpen) { render(); }
        } else if (m.type === 'openForm') {
            formOpen = true;
            render();
        }
    });

    render();
})();
