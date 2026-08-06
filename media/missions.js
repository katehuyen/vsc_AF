// Agent Farm — Missions page: dynamic multi-agent orchestration.
// A mission = goal + lead agent + team + hard limits. The page lists runs,
// shows each run's round-by-round timeline (planner thought + delegations),
// hosts the approval / question waits, and carries the New Mission form.
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    let DATA = window.__DATA__;

    let formOpen = !!DATA.newForm;
    let formErr = '';
    // background refreshes must not wipe an in-progress edit (2.47 lesson)
    let editing = false;
    let pendingData = null;
    // ---- run-list accordion (same language as the session viewer's turns) ----
    const openRuns = new Set();       // run ids with their detail expanded inline
    let runSingle = true;             // single-open mode (viewer's Single-open chip)
    let openNewest = false;           // after Start: open the freshly created run
    const closedRounds = new Set();   // "runId:n" keys of folded round bands
    let roundSingle = false;          // single-open mode for round bands
    // ---- run-list sorting (the sessions table's Sort-by pattern) ----
    let runSort = 'recent';
    let runSortAsc = false;           // numeric sorts default newest/biggest first
    // ---- run-list filters: selections + ranges over the sort criteria ----
    const FILTER_DEFAULTS = () => ({
        status: [],                   // picked statuses (empty = all)
        verdict: [],                  // picked verdicts (empty = all)
        // multi-pick: null = all (no filter), array = that subset, [] = none
        leads: null,                  // lead agent names
        agents: null,                 // team member names
        from: '', to: '',             // started-date range (yyyy-mm-dd)
        ranges: {}                    // key → {min?, max?} for tokens/cost/rounds/tasks/duration
    });
    let filters = FILTER_DEFAULTS();
    let filtersOpen = false;
    // sort + direction + filters survive reloads, like the sessions table's state
    {
        const saved = (typeof vscode.getState === 'function' && vscode.getState()) || {};
        if (saved.mSort) { runSort = saved.mSort; }
        if (typeof saved.mSortAsc === 'boolean') { runSortAsc = saved.mSortAsc; }
        if (saved.mFilters) { filters = { ...FILTER_DEFAULTS(), ...saved.mFilters }; }
        if (typeof saved.mFiltersOpen === 'boolean') { filtersOpen = saved.mFiltersOpen; }
    }
    const saveUiState = () => {
        if (typeof vscode.setState !== 'function') { return; }
        const st = (typeof vscode.getState === 'function' && vscode.getState()) || {};
        vscode.setState({ ...st, mSort: runSort, mSortAsc: runSortAsc, mFilters: filters, mFiltersOpen: filtersOpen });
    };
    // ---- mission-control observation state ----
    let liveOpen = true;              // "Live activity" section (hook events)
    let ledgerOpen = false;           // planner ledger section
    let expandedStep = null;          // step id opened in the accordion (one at a time)
    let tail = { file: '', text: '', size: 0, missing: false };
    let tailTimer = null;
    // form model survives re-renders
    const form = {
        title: '', goal: '', leadAgentId: '', workdir: '', plannerModel: '',
        team: {}, roles: {}, models: {},
        maxRounds: '', maxTasks: '', maxCostUSD: '', maxMinutes: '', maxParallel: '',
        approvalMode: 'each-round'
    };
    // suggestions for the model inputs — the user's agentFarm.modelAliases
    // knowledge base (add a name once, every picker knows it); free text still allowed
    const modelSuggestions = () =>
        (DATA.modelAliases && DATA.modelAliases.length) ? DATA.modelAliases : ['haiku', 'sonnet', 'opus', 'fable'];
    const modelDatalist = () => `<datalist id="modelopts">${modelSuggestions().map(m => `<option value="${C.esc(m)}">`).join('')}</datalist>`;

    const spec = (run) => DATA.specs.find(s => s.id === run.specId) || {
        title: run.specId, goal: '', team: [], limits: DATA.defaults, approvalMode: 'each-round', leadAgentName: '?'
    };
    const fmtTime = (ts) => ts ? new Date(ts).toLocaleString() : '—';
    const usd = (n) => '$' + (n || 0).toFixed(2);
    const elapsed = (since) => {
        const s = Math.max(0, Math.floor((Date.now() - since) / 1000));
        return s < 60 ? s + 's' : Math.floor(s / 60) + 'm ' + (s % 60) + 's';
    };
    // 1s ticker for the live "now" strip — pure DOM text update, no re-render
    let tickTimer = null;
    function tick() {
        document.querySelectorAll('[data-since]').forEach(el => {
            el.textContent = elapsed(Number(el.dataset.since));
        });
    }
    function armTicker(on) {
        if (typeof setInterval !== 'function') { return; }
        if (on && !tickTimer) { tickTimer = setInterval(tick, 1000); }
        if (!on && tickTimer) { clearInterval(tickTimer); tickTimer = null; }
    }

    // Tail of the expanded step's output file. One request on expand; a 3s poll
    // only while that step is RUNNING — the host reads just the last KBs.
    function armTail(file, poll) {
        if (tailTimer) { clearInterval(tailTimer); tailTimer = null; }
        if (!file) { return; }
        if (tail.file !== file) { tail = { file, text: '', size: 0, missing: false }; }
        vscode.postMessage({ type: 'tail', file });
        if (poll && typeof setInterval === 'function') {
            tailTimer = setInterval(() => vscode.postMessage({ type: 'tail', file }), 3000);
        }
    }

    const relT = (ts) => {
        const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
        return s < 60 ? s + 's' : s < 3600 ? Math.round(s / 60) + 'm' : Math.round(s / 3600) + 'h';
    };

    // live-session status labels (mirrors the Agents view wording)
    const LIVE_LABEL = {
        working: 'working', tool: 'tool', 'waiting-permission': '⚠ permission',
        'waiting-input': 'your turn', stalled: '⚠ stalled', idle: 'idle', ended: 'ended'
    };
    // hook-event labels (mirrors the Live Feed view)
    const EV_LABEL = {
        prompt: 'prompt', toolStart: 'tool', toolEnd: 'done', permission: '⚠ PERMISSION',
        notify: 'notify', stop: 'turn end', subagent: 'subagent done', compact: 'compaction',
        start: 'session start', end: 'session end'
    };

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
                <input type="text" id="md-${i}" class="mdl" data-model="${C.esc(a.id)}" list="modelopts"
                    placeholder="model (optional)" title="Model for this member's delegations — empty = the agent's own default / model policy"
                    value="${C.esc(form.models[a.id] || '')}" ${form.team[a.id] ? '' : 'disabled'}>
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
                <input type="text" id="f-planner" list="modelopts" placeholder="(optional) model for the LEAD's planning calls only — e.g. opus; delegates keep their own" value="${C.esc(form.plannerModel)}"></label>
                <span class="muted small">Who runs on what: planner = this field (else the lead's own default) · each delegation = the member's model field (else that agent's default / your model-policy rules in Farm Settings).</span></div>
            ${modelDatalist()}
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
            form.models[a.id] = document.getElementById('md-' + i).value;
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
                    .map(a => ({ agentId: a.id, role: form.roles[a.id] || '', model: form.models[a.id] || '' })),
                maxRounds: form.maxRounds, maxTasks: form.maxTasks, maxCostUSD: form.maxCostUSD,
                maxMinutes: form.maxMinutes, maxParallel: form.maxParallel,
                approvalMode: form.approvalMode
            }
        });
    }

    // ---------------- run detail ----------------

    /** Live status chip for a running step's agent (from the hook listener). */
    function stepLive(s) {
        if (s.status !== 'running' || !DATA.live || !DATA.live.agents) { return ''; }
        const st = DATA.live.agents[s.agentId];
        if (!st) { return ''; }
        const label = (LIVE_LABEL[st.status] || st.status) + (st.tool ? ` (${st.tool})` : '');
        const cls = st.status === 'waiting-permission' || st.status === 'stalled' ? 'alert' : 'busy';
        return ` <span class="lchip ${cls}" title="Live session status from Claude Code hooks">${C.esc(label)}</span>`;
    }

    function stepDetail(s) {
        const running = s.status === 'running';
        const body = tail.file === s.outputFile
            ? (tail.missing ? '(output file not readable yet)' : (tail.text || '(empty so far)'))
            : '(loading…)';
        return `<tr class="sdetail"><td colspan="7">
            <div class="sdlabel">Prompt sent to <b>${C.esc(s.agentName)}</b>${s.expect ? ` · success criteria: <i>${C.esc(s.expect)}</i>` : ''}</div>
            <pre class="sdpre">${C.esc(s.prompt)}</pre>
            ${s.outputFile ? `
            <div class="sdlabel">${running ? '<span class="nowdot small"></span> Output — live tail, updates every 3s' : 'Output — last part'}
                · <a data-openfile="${C.esc(s.outputFile)}" title="Open the full archived output">open full file</a></div>
            <pre class="sdpre tailpre" id="tailbox">${C.esc(body)}</pre>`
            : `<p class="muted small">No output file yet${s.status === 'queued' ? ' — the task has not started' : ''}.</p>`}
        </td></tr>`;
    }

    function stepRow(s, run) {
        const open = expandedStep === s.id;
        const ctx = window.AFCtx.row('afMissionStep', {
            run: run ? run.id : '', step: s.id, agentId: s.agentId, afOutput: !!s.outputFile
        });
        return `<tr class="srow" data-step="${C.esc(s.id)}" ${ctx}
            title="Click to open this delegation: full prompt + live output — ${window.AFCtx.HINT}">
            <td class="stoggle">${open ? '▾' : '▸'}</td>
            <td>${C.esc(s.agentName)}${stepLive(s)}</td>
            <td>${C.esc(s.title)}${s.readonly ? ' <span class="mchip ro">read-only</span>' : ''}${s.note ? ` <span class="muted small">(${C.esc(s.note)})</span>` : ''}</td>
            <td>${chip(s.status)}</td>
            <td class="num">${s.tokens ? C.fmtTok(s.tokens) : '—'}</td>
            <td class="num">${s.costUSD !== undefined ? usd(s.costUSD) : '—'}</td>
            <td>${s.outputFile ? `<a data-openfile="${C.esc(s.outputFile)}" title="Open the archived output">output</a>` : ''}</td>
        </tr>` + (open ? stepDetail(s) : '');
    }

    /** Planner + delegate totals of one round — always "N tok · $x" together,
     *  exactly like the session viewer's turn bands. */
    function roundStats(r) {
        const tok = (r.plannerTokens || 0) + r.steps.reduce((a, s) => a + (s.tokens || 0), 0);
        const cost = (r.plannerCostUSD || 0) + r.steps.reduce((a, s) => a + (s.costUSD || 0), 0);
        return (tok || cost) ? `${C.fmtTok(tok)} tok · ${usd(cost)}` : '';
    }

    /** Display-only run totals. Pre-2.68 runs carry no per-round planner
     *  tokens — the host backfills the whole planner session's total as
     *  plannerSessionTokens, use it when the rounds have nothing. */
    function runTokens(r) {
        let planner = 0, steps = 0;
        r.rounds.forEach(rd => {
            planner += rd.plannerTokens || 0;
            rd.steps.forEach(s => { steps += s.tokens || 0; });
        });
        if (!planner && r.plannerSessionTokens) { planner = r.plannerSessionTokens; }
        return planner + steps;
    }

    /** Who ate the tokens: per-agent totals as shares of the run's whole.
     *  Planner tokens belong to the lead; steps to their delegate agents. */
    function tokenShares(r, sp) {
        const by = {};
        let planner = 0;
        r.rounds.forEach(rd => {
            planner += rd.plannerTokens || 0;
            rd.steps.forEach(s => { if (s.tokens) { by[s.agentName] = (by[s.agentName] || 0) + s.tokens; } });
        });
        if (!planner && r.plannerSessionTokens) { planner = r.plannerSessionTokens; }
        if (planner) {
            const lead = sp.leadAgentName + ' (lead)';
            by[lead] = (by[lead] || 0) + planner;
        }
        const total = Object.keys(by).reduce((a, k) => a + by[k], 0);
        if (!total) { return []; }
        return Object.keys(by).map(name => ({ name, tok: by[name], pct: Math.round(100 * by[name] / total) }))
            .sort((a, b) => b.tok - a.tok);
    }

    /** Delegation totals of a run: steps overall + how many failed. */
    function runSteps(r) {
        let total = 0, failed = 0;
        r.rounds.forEach(rd => rd.steps.forEach(s => {
            total++;
            if (s.status === 'failed') { failed++; }
        }));
        return { total, failed };
    }

    // ---- sorting: every column and then some, sessions-table style ----
    const RUN_STATUS_RANK = {
        running: 6, 'waiting-approval': 5, 'waiting-user': 4,
        paused: 3, done: 2, failed: 1, cancelled: 0
    };
    const VERDICT_RANK = { success: 3, partial: 2, failed: 1 };
    const RUN_SORTS = [
        { id: 'recent', label: 'Recent', key: r => r.startedAt || 0 },
        { id: 'status', label: 'Status (active first)', key: r => RUN_STATUS_RANK[r.status] || 0 },
        { id: 'verdict', label: 'Verdict', key: r => (r.result && VERDICT_RANK[r.result.verdict]) || 0 },
        { id: 'title', label: 'Mission A–Z', key: r => spec(r).title, str: true },
        { id: 'lead', label: 'Lead A–Z', key: r => spec(r).leadAgentName, str: true },
        { id: 'team', label: 'Team size', key: r => spec(r).team.length },
        { id: 'rounds', label: 'Rounds', key: r => r.rounds.length },
        { id: 'tasks', label: 'Tasks', key: r => runSteps(r).total },
        { id: 'failed', label: 'Failed tasks', key: r => runSteps(r).failed },
        { id: 'tokens', label: 'Tokens', key: r => runTokens(r) },
        { id: 'cost', label: 'Cost', key: r => r.totalCostUSD || 0 },
        { id: 'duration', label: 'Duration', key: r => (r.endedAt || Date.now()) - r.startedAt - (r.waitedMs || 0) }
    ];

    function sortedRuns(rows) {
        const def = RUN_SORTS.find(s => s.id === runSort) || RUN_SORTS[0];
        return rows.slice().sort((a, b) => {
            const d = def.str
                ? String(def.key(a)).localeCompare(String(def.key(b)))
                : def.key(a) - def.key(b);
            return runSortAsc ? d : -d;
        });
    }

    // ---- filtering: same criteria as the sorts — selections + min/max ranges ----
    const RUN_STATUSES = ['running', 'waiting-approval', 'waiting-user', 'paused', 'done', 'failed', 'cancelled'];
    const VERDICTS = ['success', 'partial', 'failed'];
    /** value getters the range filters run over (duration in minutes). */
    const RANGE_KEYS = [
        { id: 'tokens', label: 'Tokens', get: r => runTokens(r) },
        { id: 'cost', label: 'Cost $', get: r => r.totalCostUSD || 0 },
        { id: 'rounds', label: 'Rounds', get: r => r.rounds.length },
        { id: 'tasks', label: 'Tasks', get: r => runSteps(r).total },
        { id: 'duration', label: 'Minutes', get: r => Math.round(((r.endedAt || Date.now()) - r.startedAt - (r.waitedMs || 0)) / 60000) }
    ];

    function activeFilterCount() {
        let n = filters.status.length + filters.verdict.length
            + (filters.leads ? 1 : 0) + (filters.agents ? 1 : 0)
            + (filters.from ? 1 : 0) + (filters.to ? 1 : 0);
        RANGE_KEYS.forEach(k => {
            const rg = filters.ranges[k.id];
            if (rg) { n += (rg.min !== undefined ? 1 : 0) + (rg.max !== undefined ? 1 : 0); }
        });
        return n;
    }

    function filteredRuns(rows) {
        return rows.filter(r => {
            const sp = spec(r);
            if (filters.status.length && filters.status.indexOf(r.status) < 0) { return false; }
            if (filters.verdict.length && !(r.result && filters.verdict.indexOf(r.result.verdict) >= 0)) { return false; }
            if (filters.leads && filters.leads.indexOf(sp.leadAgentName) < 0) { return false; }
            if (filters.agents && !sp.team.some(m => filters.agents.indexOf(m.agentName) >= 0)) { return false; }
            if (filters.from) {
                const t = Date.parse(filters.from);
                if (!isNaN(t) && r.startedAt < t) { return false; }
            }
            if (filters.to) {
                const t = Date.parse(filters.to);
                if (!isNaN(t) && r.startedAt >= t + 24 * 3600 * 1000) { return false; } // inclusive end day
            }
            for (const k of RANGE_KEYS) {
                const rg = filters.ranges[k.id];
                if (!rg) { continue; }
                const v = k.get(r);
                if (rg.min !== undefined && v < rg.min) { return false; }
                if (rg.max !== undefined && v > rg.max) { return false; }
            }
            return true;
        });
    }

    /** The lead / team names present in the run list — the pickers' options. */
    function filterFacets() {
        const leads = [];
        const agents = [];
        DATA.runs.forEach(r => {
            const sp = spec(r);
            if (leads.indexOf(sp.leadAgentName) < 0) { leads.push(sp.leadAgentName); }
            sp.team.forEach(m => { if (agents.indexOf(m.agentName) < 0) { agents.push(m.agentName); } });
        });
        return { leads: leads.sort(), agents: agents.sort() };
    }

    /** Filter panel: selection chips + pickers + range inputs, viewer/settings idiom. */
    function filterPanelHtml() {
        if (!filtersOpen) { return ''; }
        const facets = filterFacets();
        const selChip = (id, label, on) =>
            `<button class="chip${on ? ' on' : ''}" id="${id}">${C.esc(label)}</button>`;
        const rangeInputs = RANGE_KEYS.map(k => {
            const rg = filters.ranges[k.id] || {};
            return `<label class="fltrange">${k.label}
                <input type="number" id="fr-${k.id}-min" placeholder="min" value="${rg.min !== undefined ? rg.min : ''}">–<input type="number" id="fr-${k.id}-max" placeholder="max" value="${rg.max !== undefined ? rg.max : ''}">
            </label>`;
        }).join('');
        return `<div class="fltpanel">
            <div class="fltrow"><span class="muted small">Status:</span>
                ${RUN_STATUSES.map(s => selChip('fs-' + s, STATUS_LABEL[s] || s, filters.status.indexOf(s) >= 0)).join(' ')}</div>
            <div class="fltrow"><span class="muted small">Verdict:</span>
                ${VERDICTS.map(v => selChip('fv-' + v, v, filters.verdict.indexOf(v) >= 0)).join(' ')}
                ${window.AFFilter.multi({
                    id: 'flt-leads', label: 'Lead', options: facets.leads, selected: filters.leads,
                    title: 'Which lead agents to list — tick any combination'
                })}
                ${window.AFFilter.multi({
                    id: 'flt-agents', label: 'Team has', options: facets.agents, selected: filters.agents,
                    allLabel: 'any', title: 'Keep runs whose team includes any of the ticked agents'
                })}</div>
            <div class="fltrow">${rangeInputs}
                <label class="fltrange">Started <input type="date" id="f-from" value="${C.esc(filters.from)}">–<input type="date" id="f-to" value="${C.esc(filters.to)}"></label>
                <button class="chip" id="f-clear" title="Reset every filter">Clear</button></div>
        </div>`;
    }

    /** Rich row tooltip: everything characterizing the run at a glance. */
    function runTooltip(r, sp) {
        const st = runSteps(r);
        const mins = Math.max(0, Math.round(((r.endedAt || Date.now()) - r.startedAt - (r.waitedMs || 0)) / 60000));
        const shares = tokenShares(r, sp);
        const lines = [
            `goal: ${sp.goal}`,
            `lead: ${sp.leadAgentName}${sp.plannerModel ? ` (planner: ${sp.plannerModel})` : ''}`,
            `team: ${sp.team.map(m => m.agentName + (m.role ? ` — ${m.role}` : '') + (m.model ? ` [${m.model}]` : '')).join(', ')}`,
            `limits: $${sp.limits.maxCostUSD} · ${sp.limits.maxRounds} rounds · ${sp.limits.maxTasks} tasks · ${sp.limits.maxMinutes} min · ${sp.limits.maxParallel} parallel`,
            `delegations: ${st.total}${st.failed ? ` (${st.failed} failed)` : ''} · ${mins} min${sp.workdir ? ` · workdir: ${sp.workdir}` : ''} · approval: ${sp.approvalMode}`
        ];
        if (shares.length) { lines.push(`tokens: ${shares.map(x => `${x.name} ${x.pct}%`).join(' · ')}`); }
        if (r.result) { lines.push(`${r.result.verdict}: ${r.result.summary.slice(0, 200)}`); }
        if (r.note) { lines.push(`note: ${r.note.slice(0, 160)}`); }
        return lines.join('\n');
    }

    /** Mission-scoped live activity: this run's agents only — status chips in
     *  the header (always visible), hook events newest-first when open. */
    function liveSection(run, sp) {
        const L = DATA.live;
        const active = run.status === 'running' || run.status === 'waiting-approval' || run.status === 'waiting-user';
        if (!L || !active) { return ''; }
        const ids = [sp.leadAgentId].concat(sp.team.map(m => m.agentId));
        const names = {};
        names[sp.leadAgentId] = sp.leadAgentName + ' (lead)';
        sp.team.forEach(m => { if (!names[m.agentId]) { names[m.agentId] = m.agentName; } });
        const chips = ids.map(id => {
            const st = (L.agents || {})[id];
            const cls = !st ? 'quiet'
                : st.status === 'working' || st.status === 'tool' ? 'busy'
                    : st.status === 'waiting-permission' || st.status === 'stalled' ? 'alert' : 'quiet';
            const label = st ? (LIVE_LABEL[st.status] || st.status) + (st.tool ? ` (${st.tool})` : '') : 'quiet';
            return `<span class="lchip ${cls}">${C.esc(names[id] || id)}: ${C.esc(label)}</span>`;
        }).join(' ');
        const evs = (L.events || []).filter(e => ids.indexOf(e.agentId) >= 0).slice(-40).reverse();
        const rows = evs.map(e => {
            const label = (EV_LABEL[e.kind] || e.kind) + (e.tool ? ` (${C.esc(e.tool)})` : '');
            const link = e.transcriptPath ? ` data-opensession="${C.esc(e.transcriptPath)}" data-ts="${e.ts}"` : '';
            // A feed row that has a transcript IS a session row — right-click
            // gets that participant's session actions (afSessionCtx.js).
            const ctx = e.transcriptPath
                ? ' ' + window.AFSessionCtx.row({ file: e.transcriptPath, agentName: e.agentName })
                : '';
            return `<div class="lerow${e.kind === 'permission' ? ' alert' : ''}"${link}${ctx}${e.transcriptPath ? ` title="Open this moment in the session viewer — ${window.AFSessionCtx.HINT}"` : ''}>
                <span class="muted small">${relT(e.ts)}</span> <b>${C.esc(e.agentName || '?')}</b> ${label}${e.detail ? ` <span class="muted">${C.esc(String(e.detail).slice(0, 110))}</span>` : ''}</div>`;
        }).join('');
        return `<div class="colsec">
            <div class="colhead" id="lv-toggle-${C.esc(run.id)}" title="What every participant is doing right now — live session status + hook events (prompts, tools, permission waits), newest first">
                <span class="carets">${liveOpen ? '▾' : '▸'}</span> <b>Live activity</b>
                <span class="lvchips">${chips}</span>
            </div>
            ${liveOpen ? `<div class="lvbody">${rows || '<p class="muted small">No hook events yet — they appear the moment a participant starts working.</p>'}</div>` : ''}
        </div>`;
    }

    /** The planner's compressed round-by-round history (also its resume seed). */
    function ledgerSection(run) {
        if (!run.ledger || !run.ledger.length) { return ''; }
        return `<div class="colsec">
            <div class="colhead" id="lg-toggle-${C.esc(run.id)}" title="One compressed line per round — this is also what a resumed planner is re-briefed with">
                <span class="carets">${ledgerOpen ? '▾' : '▸'}</span> <b>Ledger</b>
                <span class="muted small">${run.ledger.length} line(s)</span>
            </div>
            ${ledgerOpen ? `<pre class="ledgerpre">${C.esc(run.ledger.join('\n'))}</pre>` : ''}
        </div>`;
    }

    /** Round = the mission's "turn": same band language as the session viewer
     *  (caret + tinted band + right-aligned token/cost stats, click to fold). */
    function roundCard(r, run) {
        const key = run.id + ':' + r.n;
        const closed = closedRounds.has(key);
        let body = '';
        if (r.action === 'delegate') {
            body = `<table class="mtable"><thead><tr><th></th><th>Agent</th><th>Task</th><th>Status</th><th class="num">Tokens</th><th class="num">Cost</th><th></th></tr></thead>
                <tbody>${r.steps.map(s => stepRow(s, run)).join('')}</tbody></table>
                ${r.rejectedReason ? `<div class="muted small">✕ ${C.esc(r.rejectedReason)} — the planner re-planned</div>` : ''}`;
        } else if (r.action === 'ask_user') {
            body = `<div class="qa"><b>Q:</b> ${C.esc(r.question || '')}<br><b>A:</b> ${C.esc(r.answer || '(pending)')}</div>`;
        }
        const closedSummary = closed && r.steps.length ? `${r.steps.length} delegation(s) · ` : '';
        const stats = roundStats(r);
        return `<div class="turnhdr${closed ? ' closed' : ''}" data-round="${C.esc(key)}"
            ${window.AFCtx.row('afMissionRound', { run: run.id, round: r.n, afClosed: closed })}
            title="Click to ${closed ? 'expand' : 'collapse'} this round — ${window.AFCtx.HINT}">
            <span class="tcaret">${closed ? '▸' : '▾'}</span>
            <span class="turnnum">R${r.n}</span>
            <span class="tag">${C.esc(r.action)}</span>
            <span class="turnlabel">${C.esc(r.thought || r.question || '')}</span>
            <span class="turnstats">${closedSummary}${stats ? stats + ' · ' : ''}${fmtTime(r.at)}</span>
        </div>` + (closed ? '' : `<div class="roundbody">
            ${r.thought ? `<div class="thought">${C.esc(r.thought)}</div>` : ''}
            ${body}
        </div>`);
    }

    /** A participant chip. The lead and every team member carry the SAME menu:
     *  "who is this, and let me talk to it" is the same question either way. */
    function teamCtx(agentId, agentName, role, model) {
        return window.AFCtx.row('afMissionTeam', {
            agentId: agentId || '', agentName: agentName || '',
            role: role || '', model: model || ''
        });
    }

    function detailHtml(run) {
        const sp = spec(run);
        const pctRaw = sp.limits.maxCostUSD > 0 ? (run.totalCostUSD / sp.limits.maxCostUSD) * 100 : 0;
        const pct = Math.min(100, Math.round(pctRaw));
        const pendingQ = (DATA.pending.questions || []).find(q => q.runId === run.id);
        const pendingAp = (DATA.pending.approvals || []).includes(run.id);
        const active = run.status !== 'done' && run.status !== 'failed' && run.status !== 'cancelled';
        const canPause = active && run.status !== 'paused';
        const canResume = run.status === 'paused';
        // the Pause request is visible and withdrawable: the button stays
        // pressed ("Pausing…") until the engine actually parks the run
        const pauseBtn = !canPause ? ''
            : run.pausePending
                ? `<button class="secondary pressed" id="d-unpause-${C.esc(run.id)}" aria-pressed="true"
                       title="Pause was requested — it takes effect before the next planner round. Click to withdraw and keep running.">⏸ Pausing… (undo)</button>`
                : `<button class="secondary" id="d-pause-${C.esc(run.id)}" aria-pressed="false"
                       title="Finish the current activity, then hold before the next planner round">Pause</button>`;
        const nowStrip = active && run.now && !run.pausePending
            ? `<div class="nowstrip"><span class="nowdot"></span> ${C.esc(run.now.what)}
                <span class="muted small">— <span data-since="${run.now.since}">${elapsed(run.now.since)}</span></span></div>`
            : '';
        const pt = (DATA.plannerTranscripts || {})[run.id];
        const tasksUsed = run.rounds.reduce((a, r) => a + r.steps.length, 0);
        const wallMin = Math.max(0, Math.round(((run.endedAt || Date.now()) - run.startedAt - (run.waitedMs || 0)) / 60000));
        return `<div class="mdetail">
            <div class="dethead">
                <h2 style="margin:0">${C.esc(sp.title)}</h2>
                ${chip(run.status)}
                <span style="flex:1"></span>
                ${pauseBtn}
                ${canResume ? `<button id="d-resume-${C.esc(run.id)}">Resume</button>` : ''}
                ${active ? `<button class="secondary" id="d-cancel-${C.esc(run.id)}" title="Cancel the mission and its running delegations">Cancel</button>` : ''}
            </div>
            <div class="muted small">lead <b ${teamCtx(sp.leadAgentId, sp.leadAgentName, 'lead', sp.plannerModel)}
                title="${C.esc(window.AFCtx.hint('The lead — it plans the rounds'))}">${C.esc(sp.leadAgentName)}</b>${sp.plannerModel ? ` <span class="mchip mdl" title="planner model">${C.esc(sp.plannerModel)}</span>` : ''} · team ${sp.team.map(m =>
                `<span class="mchip team" ${teamCtx(m.agentId, m.agentName, m.role, m.model)}
                    title="${C.esc(window.AFCtx.hint(m.agentName + (m.role ? ' — ' + m.role : '')))}">${C.esc(m.agentName)}${m.role ? ` — ${C.esc(m.role)}` : ''}${m.model ? ` <i class="mdl" title="delegation model">${C.esc(m.model)}</i>` : ''}</span>`).join(' ')}
                ${sp.workdir ? ` · workdir <code>${C.esc(sp.workdir)}</code>` : ''} · approval: ${C.esc(sp.approvalMode)}${pt ? ` · <a data-opensession="${C.esc(pt)}" title="Open the lead's full planner conversation (briefings, thoughts, decisions) in the session viewer">planner transcript</a>` : ''}</div>
            <div class="goal">${C.esc(sp.goal)}</div>
            ${nowStrip}
            ${run.pausePending ? `<div class="nowstrip paused"><span class="nowdot hold"></span> pausing — the current activity finishes first, then the run holds</div>` : ''}
            ${liveSection(run, sp)}
            <div class="budget" title="Spent ${usd(run.totalCostUSD)} of the ${usd(sp.limits.maxCostUSD)} budget">
                <div class="budgetbar"><div class="budgetfill${pctRaw >= 90 ? ' hot' : ''}" style="width:${pct}%"></div></div>
                <span class="muted small">${usd(run.totalCostUSD)} / ${usd(sp.limits.maxCostUSD)}${runTokens(run) ? ` · ${C.fmtTok(runTokens(run))} tok` : ''} · ${run.rounds.length}/${sp.limits.maxRounds} rounds · ${tasksUsed}/${sp.limits.maxTasks} tasks · ${wallMin}/${sp.limits.maxMinutes} min · started ${fmtTime(run.startedAt)}</span>
            </div>
            ${(() => {
                const shares = tokenShares(run, sp);
                return shares.length ? `<div class="muted small tokshare"
                    title="${C.esc(shares.map(x => `${x.name} ${C.fmtTok(x.tok)}`).join(' · '))}">tokens by agent:
                    ${shares.map(x => `${C.esc(x.name)} <b>${x.pct}%</b>`).join(' · ')}</div>` : '';
            })()}
            ${pendingAp ? `<div class="waitbox">This round needs your approval.
                <button id="d-approve-${C.esc(run.id)}">Approve</button>
                <button class="secondary" id="d-reject-${C.esc(run.id)}">Reject</button></div>` : ''}
            ${pendingQ ? `<div class="waitbox">Question: ${C.esc(pendingQ.question)}<br>
                <input type="text" id="d-answer-${C.esc(run.id)}" placeholder="your answer…" style="width:60%">
                <button id="d-send-${C.esc(run.id)}">Send</button></div>` : ''}
            ${run.rounds.length > 1 ? `<div class="chiprow">
                <span class="muted small">Rounds:</span>
                <button class="chip" id="rd-expandall-${C.esc(run.id)}" title="Expand every round of this run">Expand all</button>
                <button class="chip" id="rd-collapseall-${C.esc(run.id)}" title="Fold every round down to its band">Collapse all</button>
                <button class="chip${roundSingle ? ' on' : ''}" id="rd-singleopen-${C.esc(run.id)}" title="Only one round open at a time: expanding a round folds the others">Single-open</button>
            </div>` : ''}
            ${run.rounds.map(r => roundCard(r, run)).join('') || (active ? '' : '<p class="muted">No rounds ran.</p>')}
            ${ledgerSection(run)}
            ${run.result ? `<div class="resultbox ${run.result.verdict}">
                <b>${C.esc(run.result.verdict.toUpperCase())}</b> — ${C.esc(run.result.summary)}
                <div class="muted small">total ${usd(run.totalCostUSD)} · ended ${fmtTime(run.endedAt)}</div></div>` : ''}
            ${run.status === 'failed' && !run.result && run.note ? `<div class="resultbox failed">
                <b>FAILED</b> — ${C.esc(run.note)}
                <div class="muted small">ended ${fmtTime(run.endedAt)} · tracked cost ${usd(run.totalCostUSD)} (a killed planner call's spend is not in this number)</div></div>` : ''}
            ${run.note && !(run.status === 'failed' && !run.result) ? `<p class="muted small">note: ${C.esc(run.note)}</p>` : ''}
        </div>`;
    }

    /** Same accordion controls as the session viewer's turns: expand/collapse
     *  all + a Single-open mode chip. */
    function runCtlHtml(shownCount) {
        if (!DATA.runs.length) { return ''; }
        const nf = activeFilterCount();
        return `<div class="chiprow">
            <span class="muted small">Sort by:</span>
            <select id="m-sort">${RUN_SORTS.map(s =>
                `<option value="${s.id}"${s.id === runSort ? ' selected' : ''}>${s.label}</option>`).join('')}</select>
            <button class="chip" id="m-sortdir" title="Flip the sort direction">${runSortAsc ? '▲ asc' : '▼ desc'}</button>
            <button class="chip${nf ? ' on' : ''}" id="m-filters" title="Filter the list by status, verdict, agents, ranges and dates${nf ? ` — ${nf} active` : ''}">Filters</button>
            <span class="muted small">Runs:</span>
            <button class="chip" id="r-expandall" title="Open every run's detail">Expand all</button>
            <button class="chip" id="r-collapseall" title="Fold the list back to plain rows">Collapse all</button>
            <button class="chip${runSingle ? ' on' : ''}" id="r-singleopen" title="Only one run open at a time: opening a run folds the previously open one">Single-open</button>
            <span class="muted small">${nf ? `${shownCount}/${DATA.runs.length} runs` : '— click a row to open/fold that run'}</span>
        </div>` + filterPanelHtml();
    }

    /**
     * What a run IS, for the right-click menu.
     *
     * ‼️ EVERY CONTROL THIS PAGE HAS LIVES INSIDE THE EXPANDED DETAIL — pause,
     * resume, cancel, approve, answer. Reading the list means reading rows, and
     * a row you have to open before you can steer it is a row you steer late.
     * The flags below are exactly what the menu needs to decide which of those
     * controls apply, so the menu offers "Resume" only on something paused.
     */
    function runCtx(r, open) {
        const active = r.status !== 'done' && r.status !== 'failed' && r.status !== 'cancelled';
        return window.AFCtx.row('afMissionRow', {
            run: r.id, afOpen: !!open, afStatus: r.status, afActive: active,
            afPausing: !!r.pausePending,
            afPlanner: !!(DATA.plannerTranscripts || {})[r.id],
            afQuestion: (DATA.pending.questions || []).some(q => q.runId === r.id),
            afApproval: (DATA.pending.approvals || []).indexOf(r.id) >= 0
        });
    }

    /** Runs as an accordion list: plain rows until clicked, the full detail
     *  expands inline under the row (nothing opens on its own). */
    function listHtml() {
        if (!DATA.runs.length) {
            return '<p class="muted">No missions yet — <a id="firstmission">start the first one</a>.</p>';
        }
        const pool = filteredRuns(DATA.runs);
        const rows = sortedRuns(pool).map(r => {
            const sp = spec(r);
            const open = openRuns.has(r.id);
            const tok = runTokens(r);
            const st = runSteps(r);
            // a non-success verdict deserves its own glanceable chip next to "done"
            const verdict = r.result && r.result.verdict !== 'success'
                ? ` <span class="mchip ${r.result.verdict === 'failed' ? 'bad' : 'wait'}">${C.esc(r.result.verdict)}</span>` : '';
            return `<tr class="mrow${open ? ' sel' : ''}" data-run="${C.esc(r.id)}" ${runCtx(r, open)}
                title="${C.esc(runTooltip(r, sp) + '\n— ' + window.AFCtx.HINT)}">
                <td class="stoggle">${open ? '▾' : '▸'}</td>
                <td>${C.esc(sp.title)}</td>
                <td>${C.esc(sp.leadAgentName)} <span class="muted small">+${sp.team.length}</span></td>
                <td>${chip(r.status)}${verdict}</td>
                <td>R${r.rounds.length}/${sp.limits.maxRounds}</td>
                <td>${st.total ? `${st.total}${st.failed ? ` <span class="mchip bad">${st.failed}✕</span>` : ''}` : '—'}</td>
                <td class="num">${tok ? C.fmtTok(tok) : '—'}</td>
                <td class="num">${usd(r.totalCostUSD)}</td>
                <td class="muted small">${fmtTime(r.startedAt)}</td>
            </tr>` + (open ? `<tr class="rundetail"><td colspan="9">${detailHtml(r)}</td></tr>` : '');
        }).join('');
        return runCtlHtml(pool.length) + `<table class="mtable" id="mlist"><thead>
            <tr><th></th><th>Mission</th><th>Lead + team</th><th>Status</th><th>Rounds</th><th>Tasks</th><th class="num">Tokens</th><th class="num">Cost</th><th>Started</th></tr>
        </thead><tbody>${rows || `<tr><td colspan="9" class="muted">No runs match the filters.</td></tr>`}</tbody></table>`;
    }

    function render() {
        // after Start: the freshly created run (newest row) opens itself once
        if (openNewest && DATA.runs.length) {
            openNewest = false;
            if (runSingle) { openRuns.clear(); }
            openRuns.add(DATA.runs[0].id);
        }
        document.getElementById('app').innerHTML = `
            <style>
                .mchip { font-size:10px; padding:1px 8px; border-radius:8px; white-space:nowrap;
                    background:var(--vscode-badge-background); color:var(--vscode-badge-foreground); }
                /* Status chips are OUTLINE style: colored border + colored text on the
                   page background — readable in light and dark themes alike (a solid
                   theme-color background with hardcoded white text is not). */
                .mchip.ok, .mchip.bad, .mchip.live, .mchip.wait {
                    background:transparent; border:1px solid currentColor; }
                .mchip.ok { color:var(--vscode-testing-iconPassed, #2d7d46); }
                .mchip.bad { color:var(--vscode-errorForeground, #d13438); }
                .mchip.live { color:var(--vscode-textLink-foreground); }
                .mchip.wait { color:var(--vscode-editorWarning-foreground, #b58900); }
                .mchip.team, .mchip.ro { opacity:.85; }
                .mchip.mdl, .mchip.team i.mdl { font-style:normal; opacity:.75; font-size:9px;
                    border:1px solid var(--vscode-widget-border, #5555); border-radius:6px; padding:0 4px; margin-left:3px; }
                .nowstrip { display:flex; align-items:center; gap:7px; margin:8px 0; padding:7px 10px;
                    border-radius:5px; font-size:12px;
                    border:1px solid color-mix(in srgb, var(--vscode-textLink-foreground) 40%, transparent);
                    background:color-mix(in srgb, var(--vscode-textLink-foreground) 7%, transparent); }
                .nowstrip.paused { border-color:var(--vscode-inputValidation-warningBorder, #b89500);
                    background:var(--vscode-inputValidation-warningBackground, #664d0033); }
                .nowdot { width:8px; height:8px; border-radius:50%; background:var(--vscode-textLink-foreground);
                    animation:afpulse 1.2s ease-in-out infinite; flex:none; }
                .nowdot.hold { background:var(--vscode-inputValidation-warningBorder, #b89500); animation:none; }
                @keyframes afpulse { 0%,100% { opacity:.35 } 50% { opacity:1 } }
                button.pressed { outline:2px solid var(--vscode-inputValidation-warningBorder, #b89500);
                    background:var(--vscode-inputValidation-warningBackground, #664d0033); }
                .mtable { width:100%; border-collapse:collapse; margin-top:8px; }
                .mtable th { text-align:left; font-size:11px; opacity:.7; padding:4px 8px; }
                .mtable td { padding:4px 8px; border-top:1px solid var(--vscode-widget-border, #3333); font-size:12px; }
                .mrow { cursor:pointer; }
                .mrow:hover td { background:var(--vscode-list-hoverBackground); }
                .mrow.sel td { background:color-mix(in srgb, var(--vscode-textLink-foreground) 12%, transparent); }
                .dethead { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
                .goal { margin:8px 0; padding:8px 10px; border-left:3px solid var(--vscode-textLink-foreground);
                    background:color-mix(in srgb, var(--vscode-textLink-foreground) 6%, transparent); white-space:pre-wrap; }
                .budget { margin:6px 0 4px; }
                .tokshare { margin:0 0 12px; }
                .tokshare b { font-weight:600; color:var(--vscode-textLink-foreground); }
                .budgetbar { height:6px; border-radius:3px; background:var(--vscode-widget-border, #4444); overflow:hidden; margin-bottom:3px; }
                .budgetfill { height:100%; background:var(--vscode-textLink-foreground); }
                .budgetfill.hot { background:var(--vscode-errorForeground, #f66); }
                /* Round band — the session viewer's turn band, verbatim language:
                   caret + tinted band + colored round number + right-aligned stats. */
                .turnhdr { display:flex; align-items:center; gap:10px; margin:12px 0 6px; cursor:pointer;
                    padding:6px 10px; border-radius:4px; font-size:12px;
                    background:var(--vscode-editor-inactiveSelectionBackground, #3a3d41);
                    background:color-mix(in srgb, var(--vscode-textLink-foreground) 14%, var(--vscode-editor-background));
                    border-left:4px solid var(--vscode-textLink-foreground); }
                .turnhdr .tcaret { flex:none; width:12px; text-align:center; font-size:10px; opacity:.75; }
                .turnhdr .turnnum { font-weight:700; white-space:nowrap; color:var(--vscode-textLink-foreground); }
                .turnhdr .turnlabel { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; opacity:.9; }
                .turnhdr .turnstats { white-space:nowrap; font-size:11px; color:var(--vscode-descriptionForeground); }
                .turnhdr.closed { margin:6px 0; }
                .tag { font-size:10px; padding:1px 6px; border-radius:8px; white-space:nowrap;
                    background:var(--vscode-badge-background); color:var(--vscode-badge-foreground); opacity:.85; }
                .roundbody { margin:0 0 10px 16px; }
                /* .mtable th's text-align:left must not beat .num — headers and
                   values right-align TOGETHER or the columns look shifted */
                .mtable .num { text-align:right; }
                /* Accordion controls — the viewer's chip row, verbatim. */
                .chiprow { display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin:10px 0 4px; }
                .chip { font-size:11px; padding:2px 10px; cursor:pointer; border-radius:10px;
                    background:transparent; color:var(--vscode-foreground);
                    border:1px solid var(--vscode-widget-border, #4444); opacity:.85; }
                .chip:hover { opacity:1; }
                .chip.on { border-color:var(--vscode-textLink-foreground); color:var(--vscode-textLink-foreground); opacity:1; }
                .rundetail > td { padding:8px 12px 14px; }
                .fltpanel { display:flex; flex-direction:column; gap:6px; margin:2px 0 8px;
                    padding:8px 10px; border:1px solid var(--vscode-widget-border, #3333); border-radius:5px; }
                .fltrow { display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
                .fltrange { font-size:11px; display:flex; gap:3px; align-items:center; white-space:nowrap; }
                .fltrange input[type=number] { width:64px; padding:1px 4px; }
                .fltrange input[type=date] { padding:1px 4px; }
                .mdetail { border-left:3px solid var(--vscode-widget-border, #3333); padding-left:12px; }
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
                /* ---- mission-control observation ---- */
                .colsec { margin:8px 0; }
                .colhead { display:flex; gap:8px; align-items:center; cursor:pointer; user-select:none;
                    font-size:12px; margin:6px 0 4px; flex-wrap:wrap; }
                .colhead .carets { width:12px; opacity:.7; flex:none; }
                .lvchips { display:flex; gap:6px; flex-wrap:wrap; margin-left:4px; }
                .lchip { font-size:10px; padding:1px 7px; border-radius:8px;
                    border:1px solid var(--vscode-widget-border, #5555); white-space:nowrap; }
                .lchip.busy { border-color:var(--vscode-textLink-foreground); color:var(--vscode-textLink-foreground); }
                .lchip.alert { border-color:var(--vscode-inputValidation-warningBorder, #b89500);
                    color:var(--vscode-inputValidation-warningBorder, #d0a500); }
                .lchip.quiet { opacity:.6; }
                .lvbody { max-height:220px; overflow:auto; border:1px solid var(--vscode-widget-border, #3333);
                    border-radius:5px; padding:4px 8px; }
                .lerow { font-size:11px; padding:2px 0; border-bottom:1px dotted var(--vscode-widget-border, #2a2a2a); cursor:pointer; }
                .lerow:hover { background:var(--vscode-list-hoverBackground); }
                .lerow.alert { color:var(--vscode-inputValidation-warningBorder, #d0a500); }
                .srow { cursor:pointer; }
                .stoggle { width:14px; opacity:.7; }
                .sdetail td { background:color-mix(in srgb, var(--vscode-textLink-foreground) 4%, transparent); }
                .sdlabel { font-size:11px; opacity:.85; margin:6px 0 3px; display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
                .sdpre { font-family:var(--vscode-editor-font-family, monospace); font-size:11px; white-space:pre-wrap;
                    max-height:200px; overflow:auto; margin:0 0 6px; padding:6px 8px;
                    border:1px solid var(--vscode-widget-border, #3333); border-radius:4px; }
                .tailpre { max-height:260px; }
                .nowdot.small { width:6px; height:6px; }
                .ledgerpre { font-size:11px; white-space:pre-wrap; padding:6px 8px; margin:4px 0;
                    border:1px solid var(--vscode-widget-border, #3333); border-radius:4px; max-height:200px; overflow:auto; }
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
        `;

        window.AFHeader.wire(vscode);
        const wire = (id, fn) => {
            const el = document.getElementById(id);
            if (el) { el.addEventListener('click', fn); }
        };
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
                const id = row.dataset.run;
                if (openRuns.has(id)) { openRuns.delete(id); }
                else {
                    if (runSingle) { openRuns.clear(); }
                    openRuns.add(id);
                }
                render();
            }));
        // sort select + direction: string sorts start A–Z, numeric biggest-first
        const sortSel = document.getElementById('m-sort');
        if (sortSel && sortSel.addEventListener) {
            sortSel.addEventListener('change', e => {
                runSort = e.target.value;
                const def = RUN_SORTS.find(s => s.id === runSort);
                runSortAsc = !!(def && def.str);
                saveUiState();
                render();
            });
        }
        wire('m-sortdir', () => { runSortAsc = !runSortAsc; saveUiState(); render(); });
        wire('m-filters', () => { filtersOpen = !filtersOpen; saveUiState(); render(); });
        if (filtersOpen) {
            const applyFlt = () => { saveUiState(); render(); };
            RUN_STATUSES.forEach(s => wire('fs-' + s, () => {
                const i = filters.status.indexOf(s);
                if (i >= 0) { filters.status.splice(i, 1); } else { filters.status.push(s); }
                applyFlt();
            }));
            VERDICTS.forEach(v => wire('fv-' + v, () => {
                const i = filters.verdict.indexOf(v);
                if (i >= 0) { filters.verdict.splice(i, 1); } else { filters.verdict.push(v); }
                applyFlt();
            }));
            // filter boxes apply as you type — no blur, no Enter (afFilters.js
            // keeps the caret across the re-render each keystroke triggers)
            const wireInput = (id, fn, delay) =>
                window.AFFilter.live(document.getElementById(id), fn, delay);
            const facets = filterFacets();
            window.AFFilter.wireMulti({
                id: 'flt-leads',
                onChange: sel => { filters.leads = sel; applyFlt(); }
            });
            window.AFFilter.wireMulti({
                id: 'flt-agents',
                onChange: sel => { filters.agents = sel; applyFlt(); }
            });
            wireInput('f-from', el => { filters.from = el.value; applyFlt(); }, 300);
            wireInput('f-to', el => { filters.to = el.value; applyFlt(); }, 300);
            RANGE_KEYS.forEach(k => {
                const setBound = (bound) => (el) => {
                    const n = el.value === '' ? undefined : Number(el.value);
                    const rg = filters.ranges[k.id] || (filters.ranges[k.id] = {});
                    rg[bound] = (n === undefined || isNaN(n)) ? undefined : n;
                    if (rg.min === undefined && rg.max === undefined) { delete filters.ranges[k.id]; }
                    applyFlt();
                };
                wireInput(`fr-${k.id}-min`, setBound('min'));
                wireInput(`fr-${k.id}-max`, setBound('max'));
            });
            wire('f-clear', () => { filters = FILTER_DEFAULTS(); applyFlt(); });
        }
        wire('r-expandall', () => { DATA.runs.forEach(r => openRuns.add(r.id)); runSingle = false; render(); });
        wire('r-collapseall', () => { openRuns.clear(); render(); });
        wire('r-singleopen', () => {
            runSingle = !runSingle;
            if (runSingle && openRuns.size > 1) {
                const keep = DATA.runs.find(r => openRuns.has(r.id));
                openRuns.clear();
                if (keep) { openRuns.add(keep.id); }
            }
            render();
        });
        // round bands fold/unfold like the viewer's turn bands; single-open
        // mode folds the siblings of the round being expanded
        document.querySelectorAll('[data-round]').forEach(band =>
            band.addEventListener('click', () => {
                const key = band.dataset.round;
                if (closedRounds.has(key)) {
                    closedRounds.delete(key);
                    if (roundSingle) {
                        const runId = key.slice(0, key.lastIndexOf(':'));
                        const run = DATA.runs.find(x => x.id === runId);
                        if (run) {
                            run.rounds.forEach(rd => {
                                const k2 = runId + ':' + rd.n;
                                if (k2 !== key) { closedRounds.add(k2); }
                            });
                        }
                    }
                } else { closedRounds.add(key); }
                render();
            }));
        document.querySelectorAll('[data-openfile]').forEach(a =>
            a.addEventListener('click', ev => {
                if (ev && ev.stopPropagation) { ev.stopPropagation(); }
                vscode.postMessage({ type: 'openFile', file: a.dataset.openfile });
            }));
        // deep links into the session viewer (planner transcript, live-feed rows)
        document.querySelectorAll('[data-opensession]').forEach(a =>
            a.addEventListener('click', ev => {
                if (ev && ev.stopPropagation) { ev.stopPropagation(); }
                vscode.postMessage({
                    type: 'openSession', file: a.dataset.opensession,
                    ts: a.dataset.ts ? Number(a.dataset.ts) : undefined
                });
            }));
        // step accordion: one delegation open at a time (bounds the tail polling)
        document.querySelectorAll('[data-step]').forEach(row =>
            row.addEventListener('click', () => {
                expandedStep = expandedStep === row.dataset.step ? null : row.dataset.step;
                render();
            }));

        // controls live INSIDE each open run's inline detail — ids are suffixed
        // with the run id so several open runs never fight over an element
        DATA.runs.filter(r => openRuns.has(r.id)).forEach(r => {
            const id = r.id;
            wire('d-pause-' + id, () => vscode.postMessage({ type: 'control', action: 'pause', runId: id }));
            wire('d-unpause-' + id, () => vscode.postMessage({ type: 'control', action: 'unpause', runId: id }));
            wire('d-resume-' + id, () => vscode.postMessage({ type: 'control', action: 'resume', runId: id }));
            wire('d-cancel-' + id, () => vscode.postMessage({ type: 'control', action: 'cancel', runId: id }));
            wire('d-approve-' + id, () => vscode.postMessage({ type: 'approve', runId: id }));
            wire('d-reject-' + id, () => vscode.postMessage({ type: 'reject', runId: id }));
            wire('d-send-' + id, () => {
                const inp = document.getElementById('d-answer-' + id);
                vscode.postMessage({ type: 'answer', runId: id, text: inp ? inp.value : '' });
            });
            wire('lv-toggle-' + id, () => { liveOpen = !liveOpen; render(); });
            wire('lg-toggle-' + id, () => { ledgerOpen = !ledgerOpen; render(); });
            // round-level accordion controls (mirror of the run-level chips)
            wire('rd-expandall-' + id, () => {
                r.rounds.forEach(rd => closedRounds.delete(id + ':' + rd.n));
                roundSingle = false;
                render();
            });
            wire('rd-collapseall-' + id, () => {
                r.rounds.forEach(rd => closedRounds.add(id + ':' + rd.n));
                render();
            });
            wire('rd-singleopen-' + id, () => {
                roundSingle = !roundSingle;
                if (roundSingle) {
                    // keep only the newest open round of this run
                    const open = r.rounds.filter(rd => !closedRounds.has(id + ':' + rd.n));
                    open.slice(0, -1).forEach(rd => closedRounds.add(id + ':' + rd.n));
                }
                render();
            });
        });

        // (re)arm the output tail for the expanded step; clears when none is open
        let tailFile = '', tailPoll = false;
        if (expandedStep) {
            for (const r of DATA.runs) {
                if (!openRuns.has(r.id)) { continue; }
                for (const rd of r.rounds) {
                    for (const s of rd.steps) {
                        if (s.id === expandedStep && s.outputFile) {
                            tailFile = s.outputFile;
                            tailPoll = s.status === 'running';
                        }
                    }
                }
            }
        }
        armTail(tailFile, tailPoll);

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

        armTicker(document.querySelectorAll('[data-since]').length > 0);
    }

    // ------------------------------------------------------- right-click menu

    /** One run, one round, one delegation, one participant — found by the ids
     *  the row published, not by "whatever is under the pointer now". The list
     *  re-sorts and repaints on every mission event; the pick has to survive
     *  that, and only the identity in the context object does. */
    function findRun(id) { return DATA.runs.find(r => r.id === id); }
    function findStep(runId, stepId) {
        const run = findRun(runId);
        if (!run) { return null; }
        for (const rd of run.rounds) {
            const s = rd.steps.find(x => x.id === stepId);
            if (s) { return s; }
        }
        return null;
    }

    /**
     * Everything a right-click on this page can ask for.
     *
     * The steering acts post exactly what the detail's own buttons post
     * (`control`, `approve`, `reject`) — one message shape, one handler in the
     * panel. What the menu adds is REACH: those controls without opening the
     * run first, plus the two the page never had a button for at all (run the
     * mission again, delete a finished run from the history), which existed
     * only as sidebar-tree commands.
     */
    function ctxDo(act, ctx) {
        const verb = act.split(':')[0];
        const arg = act.slice(verb.length + 1);
        const runId = String(ctx.run || '');
        const copy = (v) => window.AFCtx.copy(v);
        const open = () => {
            if (runSingle) { openRuns.clear(); }
            openRuns.add(runId);
        };

        switch (verb) {
            // ---- a mission run ----
            case 'msOpen': open(); render(); return;
            case 'msFold': openRuns.delete(runId); render(); return;
            case 'msCtl': vscode.postMessage({ type: 'control', action: arg, runId: runId }); return;
            case 'msApprove': vscode.postMessage({ type: 'approve', runId: runId }); return;
            case 'msReject': vscode.postMessage({ type: 'reject', runId: runId }); return;
            case 'msRerun': vscode.postMessage({ type: 'rerun', runId: runId }); return;
            case 'msDelete': vscode.postMessage({ type: 'delete', runId: runId }); return;
            // The answer box lives in the run's detail, so the menu opens the
            // run and puts the caret in it rather than inventing a second way
            // of asking the same question.
            case 'msAnswer': {
                open();
                render();
                const box = document.getElementById('d-answer-' + runId);
                if (box) { box.scrollIntoView({ block: 'center' }); box.focus(); }
                return;
            }
            case 'msPlanner': {
                const file = (DATA.plannerTranscripts || {})[runId];
                if (file) { vscode.postMessage({ type: 'openSession', file: file }); }
                return;
            }
            case 'msCopy': {
                const r = findRun(runId);
                if (!r) { copy(''); return; }
                const sp = spec(r);
                copy(arg === 'goal' ? sp.goal
                    : arg === 'verdict' ? (r.result
                        ? r.result.verdict.toUpperCase() + ' — ' + r.result.summary
                        : (r.note || ''))
                        : arg === 'ledger' ? (r.ledger || []).join('\n')
                            : r.id);
                return;
            }

            // ---- one delegation ----
            case 'mstOpen':
                expandedStep = expandedStep === ctx.step ? null : String(ctx.step || '');
                render();
                return;
            case 'mstOut': {
                const s = findStep(runId, ctx.step);
                if (s && s.outputFile) { vscode.postMessage({ type: 'openFile', file: s.outputFile }); }
                return;
            }
            case 'mstAgent':
                if (ctx.agentId) { vscode.postMessage({ type: 'openAgent', agentId: String(ctx.agentId) }); }
                return;
            case 'mstCopy': {
                const s = findStep(runId, ctx.step);
                if (!s) { copy(''); return; }
                copy(arg === 'prompt' ? s.prompt : arg === 'output' ? s.outputFile : s.title);
                return;
            }

            // ---- one planner round ----
            case 'msrFold': {
                const key = runId + ':' + ctx.round;
                if (arg === '1') { closedRounds.add(key); } else { closedRounds.delete(key); }
                render();
                return;
            }
            case 'msrOnly': {
                const r = findRun(runId);
                if (!r) { return; }
                r.rounds.forEach(rd => closedRounds.add(runId + ':' + rd.n));
                closedRounds.delete(runId + ':' + ctx.round);
                render();
                return;
            }
            case 'msrCopy': {
                const r = findRun(runId);
                const rd = r && r.rounds.find(x => String(x.n) === String(ctx.round));
                if (!rd) { copy(''); return; }
                const lines = [`R${rd.n} · ${rd.action} · ${fmtTime(rd.at)}`];
                if (rd.thought) { lines.push(rd.thought); }
                if (rd.question) { lines.push('Q: ' + rd.question); }
                if (rd.answer) { lines.push('A: ' + rd.answer); }
                rd.steps.forEach(s => lines.push(`  · ${s.agentName}: ${s.title} — ${s.status}`));
                copy(lines.join('\n'));
                return;
            }

            // ---- a participant ----
            case 'mtOpen':
                if (ctx.agentId) { vscode.postMessage({ type: 'openAgent', agentId: String(ctx.agentId) }); }
                return;
            case 'mtTalk':
                if (ctx.agentId) { vscode.postMessage({ type: 'consoleAgent', agentId: String(ctx.agentId) }); }
                return;
            case 'mtCopy':
                copy([ctx.agentName, ctx.role, ctx.model].filter(Boolean).join(' — '));
                return;
        }
    }

    // ‼️ ONCE, at module scope: render() runs on every mission event and the
    // page refreshes live — a listener wired inside it would multiply.
    window.AFCtx.listen(ctxDo);

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
            openNewest = true; // the fresh run's row opens itself on the next data render
            render();
        } else if (m.type === 'folder') {
            form.workdir = m.path;
            if (formOpen) { render(); }
        } else if (m.type === 'openForm') {
            formOpen = true;
            render();
        } else if (m.type === 'tail') {
            // direct DOM update — no re-render, so reading the tail never
            // fights the 1s live refresh or a scroll position
            if (tail.file && m.file === tail.file) {
                tail = { file: m.file, text: m.text || '', size: m.size || 0, missing: !!m.missing };
                const box = document.getElementById('tailbox');
                if (box) {
                    box.textContent = tail.missing
                        ? '(output file not readable yet)'
                        : (tail.text || '(empty so far)');
                    if (typeof box.scrollHeight === 'number') { box.scrollTop = box.scrollHeight; }
                }
            }
        }
    });

    render();
})();
