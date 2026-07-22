// Agent Farm — Tasks command page: Board (live queue + drag & drop + NL command
// bar + per-agent load) · Automations (triggers + schedules) · Reusables
// (templates + workflows) · Analytics (throughput, scorecards, forecast digest).
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    let DATA = window.__DATA__;
    let pendingCommand = false;
    const SECTIONS = [
        ['board', 'Board'],
        ['automations', 'Automations'],
        ['reusables', 'Reusables'],
        ['analytics', 'Analytics']
    ];
    let section = DATA.section || (vscode.getState() || {}).section || 'board';
    let filter = '';       // board quick-filter (client-side, session-local)
    let cmdText = '';      // NL command draft — survives re-renders and the live tick
    let refocusFilter = false;

    window.addEventListener('message', ev => {
        if (ev.data.type === 'data') { DATA = ev.data.data; pendingCommand = false; render(); }
        if (ev.data.type === 'focus' && ev.data.section) { setSection(ev.data.section); }
    });

    function setSection(s) {
        section = s;
        vscode.setState({ section: s });
        render();
    }

    const post = (m) => vscode.postMessage(m);
    const fmtDurMs = (ms) => {
        if (!ms) { return '—'; }
        const min = Math.round(ms / 60000);
        if (min < 1) { return `${Math.round(ms / 1000)}s`; }
        if (min < 90) { return `${min}m`; }
        return `${(min / 60).toFixed(1)}h`;
    };
    const rel = (ts) => {
        if (!ts) { return '—'; }
        const s = Math.round((Date.now() - ts) / 1000);
        if (s < 0) { return 'now'; }
        if (s < 90) { return `${s}s ago`; }
        if (s < 5400) { return `${Math.round(s / 60)}m ago`; }
        if (s < 129600) { return `${Math.round(s / 3600)}h ago`; }
        return `${Math.round(s / 86400)}d ago`;
    };
    const fmtNext = (ts) => {
        if (!ts) { return '—'; }
        const d = new Date(ts);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const day = new Date(d); day.setHours(0, 0, 0, 0);
        const diff = Math.round((day - today) / 86400000);
        const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        if (diff === 0) { return `today ${hm}`; }
        if (diff === 1) { return `tomorrow ${hm}`; }
        return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]} ${d.getDate()}.${d.getMonth() + 1} ${hm}`;
    };

    // ---------- Board section ----------

    const STATUS_ICON = { done: '✅', failed: '❌', cancelled: '⊘' };
    const SRC_ICON = { schedule: '🕑', trigger: '⚡', workflow: '🔗' };

    function taskCardHtml(t, draggable) {
        const badges = [];
        if (t.sourceKind) {
            badges.push(`<span class="tag" title="from ${C.esc(t.sourceKind)}: ${C.esc(t.source || '')}">${SRC_ICON[t.sourceKind]}</span>`);
        }
        if (t.verified === 'pass') { badges.push('<span class="tag ok">verify ✓</span>'); }
        if (t.verified === 'fail') { badges.push('<span class="tag bad">verify ✗</span>'); }
        if (t.mode === 'headless') { badges.push('<span class="tag">headless</span>'); }
        if (t.mediaCost) { badges.push(`<span class="tag" title="media cost (estimate)">${C.fmtUSD(t.mediaCost)}</span>`); }
        if (t.costUSD) { badges.push(`<span class="tag" title="API-equivalent cost of the run">${C.fmtUSD(t.costUSD)}</span>`); }
        if (typeof t.durMin === 'number') { badges.push(`<span class="tag">${t.durMin}m</span>`); }
        const icon = STATUS_ICON[t.status] || '';
        const detail = t.detail ? `<div class="kb-detail">${C.esc(t.detail)}</div>` : '';
        const buttons = [];
        if (t.outputFile) {
            buttons.push(`<button class="mini secondary" data-openout="${C.esc(t.outputFile)}" title="Open the output document">📄</button>`);
        }
        if (t.sessionFile) {
            buttons.push(`<button class="mini secondary" data-transcript="${C.esc(t.sessionFile)}" title="Open the run's transcript in the session viewer">🗒</button>`);
        }
        if (t.status === 'queued') {
            buttons.push(`<button class="mini secondary" data-next="${t.id}" title="Run now — jumps the queue">▶</button>`);
            buttons.push(`<button class="mini secondary" data-cancel="${t.id}">cancel</button>`);
        } else if (t.status === 'running') {
            buttons.push(`<button class="mini secondary" data-term="${t.id}" title="Jump to this task's terminal">⌨</button>`);
            buttons.push(`<button class="mini secondary" data-cancel="${t.id}">cancel</button>`);
        } else {
            buttons.push(`<button class="mini secondary" data-rerun="${t.id}" title="Re-run as a fresh copy — a workflow step resumes its chain">↻</button>`);
            buttons.push(`<button class="mini secondary" data-del="${t.id}" title="Remove from the board">✕</button>`);
        }
        return `<div class="kb-card${t.status === 'failed' ? ' failed' : ''}" ${draggable ? 'draggable="true"' : ''} data-task="${t.id}" ${t.outputFile ? `data-output="${C.esc(t.outputFile)}"` : ''}>
            <div class="kb-title" title="${C.esc(t.promptPreview || '')}">${icon ? icon + ' ' : ''}${C.esc(t.title)}</div>
            <div class="kb-meta">${C.esc(t.agentName)} · ${new Date(t.when).toLocaleTimeString()}</div>
            ${detail}
            <div class="kb-foot">${badges.join(' ')}<span class="kb-btns">${buttons.join(' ')}</span></div>
        </div>`;
    }

    function waitingCardHtml(w, i) {
        const isApproval = w.kind === 'browser-approval';
        const actions = isApproval
            ? `<button class="mini" data-approve="${C.esc(w.ref.approvalId)}">Run</button>
               <button class="mini secondary" data-rejectid="${C.esc(w.ref.approvalId)}">Reject</button>`
            // session-backed waits: the unblock usually happens in the terminal
            : (w.ref.sessionId ? `<button class="mini secondary" data-termsid="${C.esc(w.ref.sessionId)}" title="Jump to this session's terminal window">⌨</button> ` : '')
              + (w.ref.transcriptPath ? `<button class="mini secondary" data-session="${C.esc(w.ref.transcriptPath)}">Open</button>` : '');
        return `<div class="kb-card urgent" data-wait="${i}">
            <div class="kb-title">${w.kind === 'permission' ? '🛡️' : isApproval ? '🌐' : '⏳'} ${C.esc(w.title)}</div>
            ${w.detail ? `<div class="kb-detail">${C.esc(w.detail)}</div>` : ''}
            <div class="kb-foot"><span class="kb-btns">${actions}</span></div>
        </div>`;
    }

    function columnHtml(key, label, cards, opts) {
        const o = opts || {};
        const count = o.total !== undefined && o.total !== cards.length
            ? `${cards.length}/${o.total}` : `${cards.length}`;
        return `<div class="kb-col" data-col="${key}">
            <div class="kb-col-head"><span>${label} <span class="muted">${count}</span></span>${o.action || ''}</div>
            <div class="kb-col-body" data-drop="${key}">${cards.join('') || '<div class="kb-empty">—</div>'}</div>
        </div>`;
    }

    function loadStripHtml(load) {
        const busy = load.agents.filter(a => a.queued || a.running);
        const idle = load.agents.length - busy.length;
        const chip = (a) => {
            const hot = a.running >= load.perAgentLimit;
            return `<span class="ld-chip${hot ? ' hot' : ''}" title="${C.esc(a.name)} — ${a.running} running (limit ${load.perAgentLimit}) · ${a.queued} queued">
                ${C.esc(a.name)} <b>${a.running}</b>/${load.perAgentLimit}${a.queued ? ` <span class="muted">+${a.queued}q</span>` : ''}</span>`;
        };
        return `<div class="ld-strip">
            <span class="ld-chip global${load.global.running >= load.global.limit ? ' hot' : ''}"
                title="Tasks running now vs the global concurrency limit (agentFarm.maxConcurrentTasks)">
                farm <b>${load.global.running}</b>/${load.global.limit}</span>
            ${busy.map(chip).join('')}
            ${idle ? `<span class="muted small">· ${idle} idle agent${idle > 1 ? 's' : ''}</span>` : ''}
        </div>`;
    }

    function boardHtml(d) {
        const f = filter.trim().toLowerCase();
        const match = t => !f
            || `${t.title} ${t.agentName} ${t.detail || ''} ${t.status}`.toLowerCase().includes(f);
        const inbox = d.board.inbox.filter(match);
        const parked = d.board.parked.filter(match);
        const running = d.board.running.filter(match);
        const done = d.board.done.filter(match);
        // approvals are never filtered away — nothing that needs the user may hide
        const cancelAll = (col, n) => n > 1
            ? `<button class="mini secondary kb-colbtn" data-cancelcol="${col}" title="Cancel every queued task in this column">cancel all</button>` : '';
        const clearAll = d.board.done.length
            ? '<button class="mini secondary kb-colbtn" data-clearall="1" title="Clear all finished tasks — history is archived first, output files are deleted">clear all</button>' : '';
        return `
            ${loadStripHtml(d.load)}
            <div class="kb-bar">
                <input id="cmd" type="text" value="${C.esc(cmdText)}" placeholder="🚀 Natural-language command… (e.g. 'run the psikolog weekly analysis tomorrow at 09:00')" ${pendingCommand ? 'disabled' : ''}>
                <button id="cmdgo" ${pendingCommand ? 'disabled' : ''}>${pendingCommand ? 'planning…' : 'Plan'}</button>
                <input id="flt" type="text" value="${C.esc(filter)}" placeholder="⌕ filter" title="Filter the board by title, agent or status">
            </div>
            <div class="kb-board">
                ${columnHtml('inbox', '📥 Inbox', inbox.map(t => taskCardHtml(t, true)),
                    { total: d.board.inbox.length, action: cancelAll('inbox', d.board.inbox.length) })}
                ${columnHtml('parked', '🕓 Parked', parked.map(t => taskCardHtml(t, true)),
                    { total: d.board.parked.length, action: cancelAll('parked', d.board.parked.length) })}
                ${columnHtml('running', '⚙️ Running', running.map(t => taskCardHtml(t, true)),
                    { total: d.board.running.length })}
                ${columnHtml('waiting', '🛡️ Needs Approval', d.board.waiting.map(waitingCardHtml))}
                ${columnHtml('done', '🏁 Done', done.map(t => taskCardHtml(t, false)),
                    { total: d.board.done.length, action: clearAll })}
            </div>`;
    }

    function wireBoard() {
        const cmd = document.getElementById('cmd');
        if (cmd) {
            const go = () => {
                if (!cmd.value.trim() || pendingCommand) { return; }
                pendingCommand = true;
                cmdText = '';
                post({ type: 'command', text: cmd.value });
                render();
            };
            cmd.addEventListener('input', () => { cmdText = cmd.value; });
            document.getElementById('cmdgo').addEventListener('click', go);
            cmd.addEventListener('keydown', e => { if (e.key === 'Enter') { go(); } });
        }
        const flt = document.getElementById('flt');
        if (flt) {
            flt.addEventListener('input', () => {
                filter = flt.value;
                refocusFilter = true;
                render();
            });
            if (refocusFilter) {
                refocusFilter = false;
                flt.focus();
                if (flt.setSelectionRange) { flt.setSelectionRange(flt.value.length, flt.value.length); }
            }
        }
        document.querySelectorAll('[data-cancel]').forEach(el =>
            el.addEventListener('click', e => { e.stopPropagation(); post({ type: 'cancel', taskId: el.dataset.cancel }); }));
        document.querySelectorAll('[data-del]').forEach(el =>
            el.addEventListener('click', e => { e.stopPropagation(); post({ type: 'delete', taskId: el.dataset.del }); }));
        document.querySelectorAll('[data-rerun]').forEach(el =>
            el.addEventListener('click', e => { e.stopPropagation(); post({ type: 'rerun', taskId: el.dataset.rerun }); }));
        document.querySelectorAll('[data-next]').forEach(el =>
            el.addEventListener('click', e => { e.stopPropagation(); post({ type: 'run-next', taskId: el.dataset.next }); }));
        document.querySelectorAll('[data-term]').forEach(el =>
            el.addEventListener('click', e => { e.stopPropagation(); post({ type: 'open-terminal', taskId: el.dataset.term }); }));
        document.querySelectorAll('[data-openout]').forEach(el =>
            el.addEventListener('click', e => { e.stopPropagation(); post({ type: 'open-output', file: el.dataset.openout }); }));
        document.querySelectorAll('[data-transcript]').forEach(el =>
            el.addEventListener('click', e => { e.stopPropagation(); post({ type: 'open-transcript', file: el.dataset.transcript }); }));
        document.querySelectorAll('[data-clearall]').forEach(el =>
            el.addEventListener('click', () => post({ type: 'clear-finished' })));
        document.querySelectorAll('[data-cancelcol]').forEach(el =>
            el.addEventListener('click', () => post({ type: 'cancel-all', col: el.dataset.cancelcol })));
        document.querySelectorAll('[data-approve]').forEach(el =>
            el.addEventListener('click', () => post({ type: 'approve', approvalId: el.dataset.approve, ok: true })));
        document.querySelectorAll('[data-rejectid]').forEach(el =>
            el.addEventListener('click', () => post({ type: 'approve', approvalId: el.dataset.rejectid, ok: false })));
        document.querySelectorAll('[data-session]').forEach(el =>
            el.addEventListener('click', () => post({ type: 'open-session', transcriptPath: el.dataset.session })));
        document.querySelectorAll('[data-termsid]').forEach(el =>
            el.addEventListener('click', () => post({ type: 'focus-terminal', sessionId: el.dataset.termsid })));
        document.querySelectorAll('.kb-card[data-output]').forEach(el =>
            el.addEventListener('dblclick', () => post({ type: 'open-output', file: el.dataset.output })));

        document.querySelectorAll('.kb-card[draggable]').forEach(el => {
            el.addEventListener('dragstart', e => {
                e.dataTransfer.setData('text/plain', el.dataset.task);
                e.dataTransfer.effectAllowed = 'move';
            });
        });
        document.querySelectorAll('[data-drop]').forEach(zone => {
            zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
            zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
            zone.addEventListener('drop', e => {
                e.preventDefault();
                zone.classList.remove('dragover');
                const taskId = e.dataTransfer.getData('text/plain');
                if (taskId) { post({ type: 'move', taskId, to: zone.dataset.drop }); }
            });
        });
    }

    // ---------- Automations section ----------

    function automationsHtml(d) {
        const trig = d.automations.triggers;
        const sched = d.automations.schedules;
        const trigRows = trig.map(t => `<tr>
            <td><b>${C.esc(t.title)}</b>${t.alwaysFails ? ' <span class="badge err">always fails</span>' : ''}
                ${t.enabled && !t.armed ? ' <span class="badge warn">path missing</span>' : ''}
                <div class="muted small">${C.esc(t.src)} → ${C.esc(t.target)}</div></td>
            <td>${t.enabled ? '<span class="dot on"></span> on' : '<span class="dot off"></span> off'}</td>
            <td>${t.stat ? C.esc(t.stat) : (t.fireCount ? `fired ${t.fireCount}×` : 'never fired')}
                <div class="muted small">${t.lastFiredAt ? 'last ' + rel(t.lastFiredAt) : ''}</div></td>
            <td class="muted small">deb ${t.debounceSec}s · cool ${t.cooldownSec}s · max ${t.maxPerHour || '∞'}/h</td>
            <td class="rowbtns">
                <button class="mini secondary" data-trig="toggle:${t.id}">${t.enabled ? 'disable' : 'enable'}</button>
                <button class="mini secondary" data-trig="fire:${t.id}" title="Fire this trigger now (manual test)">fire</button>
                <button class="mini secondary" data-trig="edit:${t.id}">edit</button>
                <button class="mini secondary" data-trig="delete:${t.id}">✕</button>
            </td></tr>`).join('');
        const schedRows = sched.map(s => `<tr>
            <td><b>${C.esc(s.title)}</b><div class="muted small">${C.esc(s.agentName)} · ${s.mode}</div></td>
            <td>${C.esc(s.when)}<div class="muted small">missed: ${C.esc(s.missed)}</div></td>
            <td>${s.enabled ? '<span class="dot on"></span> on' : '<span class="dot off"></span> off'}</td>
            <td>${s.enabled ? C.esc(fmtNext(s.nextAt)) : '—'}</td>
            <td class="rowbtns">
                <button class="mini secondary" data-sched="toggle:${s.id}">${s.enabled ? 'disable' : 'enable'}</button>
                <button class="mini secondary" data-sched="run:${s.id}" title="Queue this run right now">run now</button>
                <button class="mini secondary" data-sched="edit:${s.id}">edit</button>
                <button class="mini secondary" data-sched="delete:${s.id}">✕</button>
            </td></tr>`).join('');
        return `
            <div class="spread"><h2 style="margin:10px 0 6px;border:none">⚡ Triggers <span class="muted small">${trig.filter(t => t.enabled).length} armed / ${trig.length}</span></h2>
                <button class="secondary" data-add="trig-add">+ Trigger</button></div>
            <div class="tablewrap">${trig.length
                ? `<table><tr><th>Trigger</th><th>State</th><th>Reliability</th><th>Limits</th><th></th></tr>${trigRows}</table>`
                : '<p class="muted">No triggers yet — a trigger fires a task/workflow when a file changes, a webhook is called, or a live hook event happens.</p>'}</div>
            <div class="spread"><h2 style="margin:22px 0 6px;border:none">🕑 Schedules <span class="muted small">${sched.filter(s => s.enabled).length} active / ${sched.length}</span></h2>
                <button class="secondary" data-add="sched-add">+ Schedule</button></div>
            <div class="tablewrap">${sched.length
                ? `<table><tr><th>Schedule</th><th>When</th><th>State</th><th>Next run</th><th></th></tr>${schedRows}</table>`
                : '<p class="muted">No schedules yet — a schedule runs an agent prompt daily, weekly or once at a set time.</p>'}</div>`;
    }

    // ---------- Reusables section ----------

    function reusablesHtml(d) {
        const tpl = d.reusables.templates;
        const wf = d.reusables.workflows;
        const tplRows = tpl.map(t => `<tr>
            <td><b>${C.esc(t.title)}</b><div class="muted small">${C.esc((t.prompt || '').replace(/\s+/g, ' ').slice(0, 110))}</div></td>
            <td>${C.esc(t.agentName || 'any agent')}</td>
            <td>${t.mode}</td>
            <td class="rowbtns">
                <button class="mini" data-tpl="run:${t.id}">run</button>
                <button class="mini secondary" data-tpl="delete:${t.id}">✕</button>
            </td></tr>`).join('');
        const wfCards = wf.map(w => `<div class="card" style="flex:1 1 300px">
            <div class="spread"><b>${C.esc(w.title)}</b>
                <span class="rowbtns">
                    <button class="mini" data-wf="run:${w.id}">run</button>
                    <button class="mini secondary" data-wf="addstep:${w.id}" title="Append a step">+ step</button>
                    <button class="mini secondary" data-wf="rename:${w.id}">rename</button>
                    <button class="mini secondary" data-wf="delete:${w.id}">✕</button>
                </span></div>
            <ol class="wf-steps">${w.steps.map(s =>
                `<li>${s.parallel ? '∥ ' : ''}${C.esc(s.title)} <span class="muted small">${C.esc(s.agentName)} · ${C.esc(s.kind)}</span></li>`).join('')}</ol>
        </div>`).join('');
        return `
            <div class="spread"><h2 style="margin:10px 0 6px;border:none">🔖 Templates <span class="muted small">${tpl.length}</span></h2>
                <span class="muted small">save one from any finished task: Tasks tree → right-click → Save as template</span></div>
            <div class="tablewrap">${tpl.length
                ? `<table><tr><th>Template</th><th>Agent</th><th>Mode</th><th></th></tr>${tplRows}</table>`
                : '<p class="muted">No templates yet — a template is a reusable prompt you can run on demand.</p>'}</div>
            <div class="spread"><h2 style="margin:22px 0 6px;border:none">🔗 Workflows <span class="muted small">${wf.length}</span></h2>
                <button class="secondary" data-add="wf-add">+ Workflow</button></div>
            <div class="row">${wf.length ? wfCards
                : '<p class="muted">No workflows yet — a workflow chains steps across agents (with handoffs, gates and parallel fan-out).</p>'}</div>`;
    }

    // ---------- Analytics section ----------

    function analyticsHtml(d) {
        const a = d.analytics;
        const k = a.kpis;
        const kpi = (label, value, sub) => `<div class="card"><div class="label">${label}</div>
            <div class="kpi">${value}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
        const alerts = a.alerts.length ? `<div style="margin:10px 0">${a.alerts.map(al =>
            `<div class="msg ${al.severity === 'warning' ? 'error' : ''}"><b>${C.esc(al.who)}</b> — ${C.esc(al.message)}</div>`).join('')}</div>` : '';
        const agentRows = a.agents.map(s => `<tr>
            <td><b>${C.esc(s.agentName)}</b></td>
            <td class="num">${s.total}</td>
            <td class="num">${s.done}✓ / ${s.failed}✗${s.cancelled ? ` / ${s.cancelled}⊘` : ''}</td>
            <td class="num">${s.successRate !== undefined ? Math.round(s.successRate * 100) + '%' : '—'}</td>
            <td class="num">${fmtDurMs(s.medianDurationMs)}</td>
            <td class="num">${s.retries || '—'}</td>
        </tr>`).join('');
        const famRows = a.families.map(f => `<tr>
            <td><b>${C.esc(f.title)}</b>${f.alwaysFails ? ' <span class="badge err">always fails</span>' : ''}
                <div class="muted small">${C.esc(f.agents)}</div></td>
            <td>${C.esc(f.source)}</td>
            <td class="num">${f.runs}</td>
            <td class="num">${f.failed ? f.failed + '✗' : '—'}</td>
        </tr>`).join('');
        const upcoming = a.forecast.upcoming.map(u => `<tr>
            <td>${C.esc(fmtNext(u.ts))}</td>
            <td><b>${C.esc(u.title)}</b></td>
            <td>${C.esc(u.agentName)}</td>
            <td class="num">${fmtDurMs(u.medianMs)}</td>
            <td class="num">${u.successRate !== undefined ? Math.round(u.successRate * 100) + '%' : '—'}</td>
        </tr>`).join('');
        return `
            <div class="row" style="margin-top:10px">
                ${kpi('Runs · 30d', k.runs30d, `${k.done}✓ / ${k.failed}✗`)}
                ${kpi('Success rate', k.successRate !== undefined ? Math.round(k.successRate * 100) + '%' : '—', 'done / (done + failed)')}
                ${kpi('Median duration', fmtDurMs(k.medianMs), 'successful runs')}
                ${kpi('Verify retries', k.retries || '0', 'quality-gate reruns')}
                ${kpi('Queue', d.board.inbox.length + d.board.parked.length,
                    a.queue.known ? `≈ ${fmtDurMs(a.queue.etaMs)} of known work` : 'no history for ETA')}
            </div>
            ${alerts}
            <h2>Throughput — completed tasks per day (30d)</h2>
            <div class="chartbox">${C.stackedBars(a.daily.map(x => x.day),
                [{ name: 'done', values: a.daily.map(x => x.done) }, { name: 'failed', values: a.daily.map(x => x.failed) }],
                { fmt: v => String(Math.round(v)) })}</div>
            <h2>Per-agent scorecard (30d)</h2>
            <div class="tablewrap">${a.agents.length
                ? `<table><tr><th>Agent</th><th class="num">Runs</th><th class="num">Outcome</th><th class="num">Success</th><th class="num">Median</th><th class="num">Retries</th></tr>${agentRows}</table>`
                : '<p class="muted">No completed tasks in the last 30 days.</p>'}</div>
            <h2>Task families — the same job run repeatedly (30d)</h2>
            <div class="tablewrap">${a.families.length
                ? `<table><tr><th>Family</th><th>Source</th><th class="num">Runs</th><th class="num">Failed</th></tr>${famRows}</table>`
                : '<p class="muted">Nothing recurring yet.</p>'}</div>
            <div class="spread"><h2>Forecast — next ${a.forecast.days} days</h2>
                <span class="rowbtns">
                    <button class="secondary" data-open="open-forecast" title="Full forecast as a markdown document">Open full forecast</button>
                    <button class="secondary" data-open="open-history" title="Raw monthly task-history files (JSONL)">Task history</button>
                </span></div>
            <p class="muted small">${a.forecast.totalScheduledRuns} scheduled run(s) · estimated agent-time ${fmtDurMs(a.forecast.estBusyMs)}</p>
            <div class="tablewrap">${a.forecast.upcoming.length
                ? `<table><tr><th>When</th><th>Job</th><th>Agent</th><th class="num">Usually</th><th class="num">Success</th></tr>${upcoming}</table>`
                : '<p class="muted">No scheduled runs in the window.</p>'}</div>`;
    }

    // ---------- NOW strip — the page's pulse, visible in every section ----------

    function nowStripHtml(d) {
        const run = d.board.running;
        const waiting = d.board.waiting.length;
        const queued = d.board.inbox.length + d.board.parked.length;
        const next = d.automations.schedules
            .filter(s => s.enabled && s.nextAt)
            .sort((a, b) => a.nextAt - b.nextAt)[0];
        const runTxt = run.length
            ? run.slice(0, 3).map(t => `<b>${C.esc(t.title.length > 26 ? t.title.slice(0, 25) + '…' : t.title)}</b> <span class="muted">@${C.esc(t.agentName)}</span>`).join(' · ')
              + (run.length > 3 ? ` <span class="muted">+${run.length - 3}</span>` : '')
            : '<span class="muted">idle</span>';
        const today = d.board.today || { done: 0, failed: 0 };
        return `<div class="now-strip">
            <span class="now-cell" title="tasks running right now (vs the farm-wide limit)">⚙️ ${run.length}/${d.load.global.limit} ${runTxt}</span>
            ${waiting ? `<span class="now-cell now-hot" data-goto="board" title="approvals and permission waits — click to jump to the board">🛡️ ${waiting} need${waiting > 1 ? '' : 's'} you</span>` : ''}
            ${queued ? `<span class="now-cell" data-goto="board" title="queued + parked tasks">📥 ${queued} queued</span>` : ''}
            <span class="now-cell${today.failed ? ' now-hot' : ''}" data-goto="analytics" title="finished today (archive included) — click for analytics">🏁 today ${today.done}✓${today.failed ? ` ${today.failed}✗` : ''}</span>
            <span class="now-cell" data-goto="automations" title="the next scheduled run">🕑 ${next ? `next: <b>${C.esc(next.title.length > 30 ? next.title.slice(0, 29) + '…' : next.title)}</b> ${C.esc(fmtNext(next.nextAt))}` : '<span class="muted">nothing scheduled</span>'}</span>
        </div>`;
    }

    // ---------- shell ----------

    function render() {
        const d = DATA;
        const alertCount = (d.analytics.alerts || []).length;
        const counts = {
            board: d.board.inbox.length + d.board.parked.length + d.board.running.length,
            automations: d.automations.triggers.filter(t => t.enabled).length
                + d.automations.schedules.filter(s => s.enabled).length,
            reusables: d.reusables.templates.length + d.reusables.workflows.length,
            analytics: alertCount
        };
        const segButtons = SECTIONS.map(([id, label]) => {
            const n = counts[id];
            const suffix = id === 'analytics'
                ? (n ? ` <span class="seg-warn">⚠${n}</span>` : '')
                : (n ? ` <span class="seg-n">${n}</span>` : '');
            return `<button data-sec="${id}" class="${id === section ? 'sel' : ''}">${label}${suffix}</button>`;
        }).join('');
        const body = section === 'board' ? boardHtml(d)
            : section === 'automations' ? automationsHtml(d)
                : section === 'reusables' ? reusablesHtml(d)
                    : analyticsHtml(d);
        document.getElementById('app').innerHTML = `
            <style>
                .kb-bar { display:flex; gap:8px; margin:8px 0 14px; }
                .kb-bar input { flex:1; padding:6px 10px; }
                .kb-bar #flt { flex:0 0 150px; }
                .kb-colbtn { opacity:.7; }
                .kb-colbtn:hover { opacity:1; }
                .kb-board { display:flex; gap:10px; align-items:flex-start; overflow-x:auto; }
                .kb-col { flex:1; min-width:190px; background:var(--vscode-sideBar-background, rgba(128,128,128,.06));
                    border:1px solid var(--vscode-panel-border); border-radius:8px; padding:8px; }
                .kb-col-head { font-weight:700; font-size:12px; text-transform:uppercase; letter-spacing:.5px;
                    padding:2px 4px 8px; display:flex; justify-content:space-between; align-items:center; gap:4px; }
                .kb-col-body { min-height:60px; }
                .kb-card { border:1px solid var(--vscode-panel-border); border-radius:6px; padding:8px;
                    margin-bottom:8px; background:var(--vscode-editor-background); cursor:grab; }
                .kb-card.failed { border-left:3px solid var(--vscode-errorForeground); }
                .kb-card.urgent { border-left:3px solid var(--vscode-editorWarning-foreground); }
                .kb-title { font-weight:600; font-size:12px; word-break:break-word; }
                .kb-meta { opacity:.7; font-size:11px; margin-top:2px; }
                .kb-detail { font-size:11px; opacity:.85; margin-top:3px; word-break:break-word; }
                .kb-foot { display:flex; align-items:center; gap:4px; margin-top:6px; flex-wrap:wrap; }
                .kb-btns { margin-left:auto; }
                .kb-empty { opacity:.4; text-align:center; padding:12px 0; }
                .tag { font-size:10px; border:1px solid var(--vscode-panel-border); border-radius:3px; padding:0 4px; }
                .tag.ok { color:var(--vscode-charts-green, #3fb950); }
                .tag.bad { color:var(--vscode-errorForeground); }
                button.mini { font-size:10px; padding:1px 6px; }
                .kb-col-body.dragover { background:rgba(128,128,255,.08); border-radius:6px; }
                .ld-strip { display:flex; gap:6px; flex-wrap:wrap; align-items:center; margin:2px 0 4px; }
                .ld-chip { font-size:11px; border:1px solid var(--vscode-widget-border,#4444); border-radius:10px;
                    padding:1px 9px; opacity:.9; }
                .ld-chip.global { font-weight:600; border-color:var(--vscode-focusBorder); }
                .ld-chip.hot { color:var(--vscode-editorWarning-foreground,#cca700);
                    border-color:var(--vscode-editorWarning-foreground,#cca700); }
                .rowbtns { white-space:nowrap; }
                .rowbtns .mini { margin-left:3px; }
                .wf-steps { margin:8px 0 0; padding-left:20px; }
                .wf-steps li { margin:3px 0; font-size:12px; }
                .now-strip { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin:0 0 12px;
                    padding:7px 10px; border:1px solid var(--vscode-widget-border,#4443); border-radius:8px;
                    background:var(--vscode-editorWidget-background, rgba(128,128,128,.05)); font-size:12px; }
                .now-cell { display:inline-flex; gap:6px; align-items:center; padding:1px 8px; }
                .now-cell[data-goto] { cursor:pointer; border-radius:5px; }
                .now-cell[data-goto]:hover { background:var(--vscode-list-hoverBackground); }
                .now-hot { color:var(--vscode-editorWarning-foreground,#cca700); font-weight:600; }
                .seg-n { opacity:.6; font-size:10px; }
                .seg-warn { color:var(--vscode-editorWarning-foreground,#cca700); font-size:10px; }
            </style>
            ${window.AFHeader.html({
                page: 'tasks',
                title: 'Tasks',
                sub: `queue · automations · reusables · analytics — updated ${new Date(d.generatedAt).toLocaleTimeString()}`,
                controls: `<span class="seg">${segButtons}</span>`,
                actions: section === 'board' ? '<button class="secondary" id="add">+ Task</button>' : '',
                guide: 'tasks-sayfasi'
            })}
            ${nowStripHtml(d)}
            ${body}`;

        window.AFHeader.wire(vscode);
        document.querySelectorAll('[data-sec]').forEach(b =>
            b.addEventListener('click', () => setSection(b.dataset.sec)));
        document.querySelectorAll('[data-goto]').forEach(el =>
            el.addEventListener('click', () => setSection(el.dataset.goto)));
        const add = document.getElementById('add');
        if (add) { add.addEventListener('click', () => post({ type: 'add-task' })); }
        document.querySelectorAll('[data-add]').forEach(b =>
            b.addEventListener('click', () => post({ type: b.dataset.add })));
        document.querySelectorAll('[data-open]').forEach(b =>
            b.addEventListener('click', () => post({ type: b.dataset.open })));
        const act = (attr, type) => document.querySelectorAll(`[data-${attr}]`).forEach(b =>
            b.addEventListener('click', () => {
                const [a, id] = b.dataset[attr].split(':');
                post({ type, act: a, id });
            }));
        act('sched', 'sched');
        act('trig', 'trig');
        act('tpl', 'tpl');
        act('wf', 'wf');
        if (section === 'board') { wireBoard(); }
    }

    render();
    // Live tick — relative times and running durations go stale between manager
    // events. Re-render every 30s, but never under the user's fingers: skip when
    // the tab is hidden or a board input is focused (drafts live in module state,
    // so nothing is lost either way).
    setInterval(() => {
        if (document.hidden) { return; }
        const a = document.activeElement;
        if (a && (a.id === 'cmd' || a.id === 'flt')) { return; }
        render();
    }, 30000);
})();
