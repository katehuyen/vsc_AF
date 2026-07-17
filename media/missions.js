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
    // suggestions for the model inputs — free text still allowed
    const MODEL_SUGGESTIONS = ['haiku', 'sonnet', 'opus', 'claude-haiku-4-5-20251001', 'claude-sonnet-5', 'claude-opus-4-8'];
    const modelDatalist = `<datalist id="modelopts">${MODEL_SUGGESTIONS.map(m => `<option value="${m}">`).join('')}</datalist>`;

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
            ${modelDatalist}
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

    function stepRow(s) {
        const open = expandedStep === s.id;
        return `<tr class="srow" data-step="${C.esc(s.id)}" title="Click to open this delegation: full prompt + live output">
            <td class="stoggle">${open ? '▾' : '▸'}</td>
            <td>${C.esc(s.agentName)}${stepLive(s)}</td>
            <td>${C.esc(s.title)}${s.readonly ? ' <span class="mchip ro">read-only</span>' : ''}${s.note ? ` <span class="muted small">(${C.esc(s.note)})</span>` : ''}</td>
            <td>${chip(s.status)}</td>
            <td class="num">${s.tokens ? C.fmtTok(s.tokens) : '—'}</td>
            <td class="num">${s.costUSD !== undefined ? usd(s.costUSD) : '—'}</td>
            <td>${s.outputFile ? `<a data-openfile="${C.esc(s.outputFile)}" title="Open the archived output">output</a>` : ''}</td>
        </tr>` + (open ? stepDetail(s) : '');
    }

    /** Planner + delegate totals of one round — the turn-band stats. */
    function roundStats(r) {
        const tok = (r.plannerTokens || 0) + r.steps.reduce((a, s) => a + (s.tokens || 0), 0);
        const cost = (r.plannerCostUSD || 0) + r.steps.reduce((a, s) => a + (s.costUSD || 0), 0);
        return (tok ? C.fmtTok(tok) + ' tok · ' : '') + usd(cost);
    }

    /** Display-only run totals (planner rounds + delegate sessions). */
    function runTokens(r) {
        let n = 0;
        r.rounds.forEach(rd => {
            n += rd.plannerTokens || 0;
            rd.steps.forEach(s => { n += s.tokens || 0; });
        });
        return n;
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
            return `<div class="lerow${e.kind === 'permission' ? ' alert' : ''}"${link}${e.transcriptPath ? ' title="Open this moment in the session viewer"' : ''}>
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
                <tbody>${r.steps.map(stepRow).join('')}</tbody></table>
                ${r.rejectedReason ? `<div class="muted small">✕ ${C.esc(r.rejectedReason)} — the planner re-planned</div>` : ''}`;
        } else if (r.action === 'ask_user') {
            body = `<div class="qa"><b>Q:</b> ${C.esc(r.question || '')}<br><b>A:</b> ${C.esc(r.answer || '(pending)')}</div>`;
        }
        const closedSummary = closed && r.steps.length ? `${r.steps.length} delegation(s) · ` : '';
        return `<div class="turnhdr${closed ? ' closed' : ''}" data-round="${C.esc(key)}" title="Click to ${closed ? 'expand' : 'collapse'} this round">
            <span class="tcaret">${closed ? '▸' : '▾'}</span>
            <span class="turnnum">R${r.n}</span>
            <span class="tag">${C.esc(r.action)}</span>
            <span class="turnlabel">${C.esc(r.thought || r.question || '')}</span>
            <span class="turnstats">${closedSummary}${roundStats(r)} · ${fmtTime(r.at)}</span>
        </div>` + (closed ? '' : `<div class="roundbody">
            ${r.thought ? `<div class="thought">${C.esc(r.thought)}</div>` : ''}
            ${body}
        </div>`);
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
            <div class="muted small">lead <b>${C.esc(sp.leadAgentName)}</b>${sp.plannerModel ? ` <span class="mchip mdl" title="planner model">${C.esc(sp.plannerModel)}</span>` : ''} · team ${sp.team.map(m =>
                `<span class="mchip team">${C.esc(m.agentName)}${m.role ? ` — ${C.esc(m.role)}` : ''}${m.model ? ` <i class="mdl" title="delegation model">${C.esc(m.model)}</i>` : ''}</span>`).join(' ')}
                ${sp.workdir ? ` · workdir <code>${C.esc(sp.workdir)}</code>` : ''} · approval: ${C.esc(sp.approvalMode)}${pt ? ` · <a data-opensession="${C.esc(pt)}" title="Open the lead's full planner conversation (briefings, thoughts, decisions) in the session viewer">planner transcript</a>` : ''}</div>
            <div class="goal">${C.esc(sp.goal)}</div>
            ${nowStrip}
            ${run.pausePending ? `<div class="nowstrip paused"><span class="nowdot hold"></span> pausing — the current activity finishes first, then the run holds</div>` : ''}
            ${liveSection(run, sp)}
            <div class="budget" title="Spent ${usd(run.totalCostUSD)} of the ${usd(sp.limits.maxCostUSD)} budget">
                <div class="budgetbar"><div class="budgetfill${pctRaw >= 90 ? ' hot' : ''}" style="width:${pct}%"></div></div>
                <span class="muted small">${usd(run.totalCostUSD)} / ${usd(sp.limits.maxCostUSD)}${runTokens(run) ? ` · ${C.fmtTok(runTokens(run))} tok` : ''} · ${run.rounds.length}/${sp.limits.maxRounds} rounds · ${tasksUsed}/${sp.limits.maxTasks} tasks · ${wallMin}/${sp.limits.maxMinutes} min · started ${fmtTime(run.startedAt)}</span>
            </div>
            ${pendingAp ? `<div class="waitbox">This round needs your approval.
                <button id="d-approve-${C.esc(run.id)}">Approve</button>
                <button class="secondary" id="d-reject-${C.esc(run.id)}">Reject</button></div>` : ''}
            ${pendingQ ? `<div class="waitbox">Question: ${C.esc(pendingQ.question)}<br>
                <input type="text" id="d-answer-${C.esc(run.id)}" placeholder="your answer…" style="width:60%">
                <button id="d-send-${C.esc(run.id)}">Send</button></div>` : ''}
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
    function runCtlHtml() {
        if (!DATA.runs.length) { return ''; }
        return `<div class="chiprow">
            <span class="muted small">Runs:</span>
            <button class="chip" id="r-expandall" title="Open every run's detail">Expand all</button>
            <button class="chip" id="r-collapseall" title="Fold the list back to plain rows">Collapse all</button>
            <button class="chip${runSingle ? ' on' : ''}" id="r-singleopen" title="Only one run open at a time: opening a run folds the previously open one">Single-open</button>
            <span class="muted small">— click a row to open/fold that run</span>
        </div>`;
    }

    /** Runs as an accordion list: plain rows until clicked, the full detail
     *  expands inline under the row (nothing opens on its own). */
    function listHtml() {
        if (!DATA.runs.length) {
            return '<p class="muted">No missions yet — <a id="firstmission">start the first one</a>.</p>';
        }
        const rows = DATA.runs.map(r => {
            const sp = spec(r);
            const open = openRuns.has(r.id);
            const tok = runTokens(r);
            return `<tr class="mrow${open ? ' sel' : ''}" data-run="${C.esc(r.id)}" title="Click to ${open ? 'fold' : 'open'} this run">
                <td class="stoggle">${open ? '▾' : '▸'}</td>
                <td>${C.esc(sp.title)}</td>
                <td>${C.esc(sp.leadAgentName)}</td>
                <td>${chip(r.status)}</td>
                <td>${r.rounds.length}</td>
                <td class="num">${tok ? C.fmtTok(tok) : '—'}</td>
                <td class="num">${usd(r.totalCostUSD)}</td>
                <td class="muted small">${fmtTime(r.startedAt)}</td>
            </tr>` + (open ? `<tr class="rundetail"><td colspan="8">${detailHtml(r)}</td></tr>` : '');
        }).join('');
        return runCtlHtml() + `<table class="mtable" id="mlist"><thead>
            <tr><th></th><th>Mission</th><th>Lead</th><th>Status</th><th>Rounds</th><th class="num">Tokens</th><th class="num">Cost</th><th>Started</th></tr>
        </thead><tbody>${rows}</tbody></table>`;
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
                .budget { margin:6px 0 12px; }
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
                .num { text-align:right; }
                /* Accordion controls — the viewer's chip row, verbatim. */
                .chiprow { display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin:10px 0 4px; }
                .chip { font-size:11px; padding:2px 10px; cursor:pointer; border-radius:10px;
                    background:transparent; color:var(--vscode-foreground);
                    border:1px solid var(--vscode-widget-border, #4444); opacity:.85; }
                .chip:hover { opacity:1; }
                .chip.on { border-color:var(--vscode-textLink-foreground); color:var(--vscode-textLink-foreground); opacity:1; }
                .rundetail > td { padding:8px 12px 14px; }
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
        // round bands fold/unfold like the viewer's turn bands
        document.querySelectorAll('[data-round]').forEach(band =>
            band.addEventListener('click', () => {
                const key = band.dataset.round;
                if (closedRounds.has(key)) { closedRounds.delete(key); } else { closedRounds.add(key); }
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
