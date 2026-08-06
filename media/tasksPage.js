// Agent Farm — Tasks: the agent-activity CONTROL PANEL.
//
// Two sides, because they are two different jobs:
//   PLAN — manage every work DEFINITION (schedule / trigger / workflow /
//          template) in one table. Search, filter, group, bulk-switch, add,
//          remove, edit. This is the primary surface.
//   RUN  — what those definitions actually did.
//
// Design rules this page follows:
//   * Active filters are ALWAYS visible as removable chips, with one reset.
//     A filter you forgot you set is worse than no filter at all.
//   * Nothing opens a mystery second page: detail expands inline in the row.
//   * Every object you can manage is reachable from one table, whatever its
//     internal type — the user manages "the thing that runs at 05:00", not
//     "a FarmSchedule".
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    let DATA = window.__DATA__;

    const post = (m) => vscode.postMessage(m);
    const saved = (typeof vscode.getState === 'function' && vscode.getState()) || {};

    let tab = DATA.tab || saved.tab || 'plan';
    let cmdText = '';
    let pendingCommand = false;

    // ---- view state, per tab; every field has a default so "reset" is exact --
    // The pick fields (kind/agent/model/state/guard · agent/status/source) are
    // multi-pick: null = all (no filter), array = that subset, [] = none.
    // See media/afFilters.js.
    const PLAN_DEF = { q: '', kind: null, agent: null, model: null, state: null, guard: null, issues: false, group: 'kind', sort: 'when', asc: true };
    const RUN_DEF = { q: '', agent: null, status: null, source: null, sort: 'when', asc: false };
    const PICKS = { plan: ['kind', 'agent', 'model', 'state', 'guard'], run: ['agent', 'status', 'source'] };
    let planView = Object.assign({}, PLAN_DEF, saved.planView || {});
    let runView = Object.assign({}, RUN_DEF, saved.runView || {});
    // a pre-3.21 saved view holds strings — carry the choice over as a one-item set
    [['plan', planView], ['run', runView]].forEach(([t, v]) => PICKS[t].forEach(k => {
        if (v[k] !== null && !Array.isArray(v[k])) { v[k] = v[k] ? [String(v[k])] : null; }
    }));
    const expanded = new Set();          // row keys with detail open
    const selected = new Set();          // "kind:id" of ticked plan rows
    let refocus = null;                  // element id to refocus after render

    const KIND = {
        schedule: { icon: '⏰', label: 'Schedule', hint: 'runs at a set time' },
        trigger: { icon: '⚡', label: 'Trigger', hint: 'runs when something happens' },
        workflow: { icon: '🔗', label: 'Workflow', hint: 'a chain of steps' },
        template: { icon: '📋', label: 'Template', hint: 'a saved prompt you launch by hand' }
    };
    const ISSUE = {
        'no-guard': ['no guard', 'Fires whether or not there is work — every wake-up is paid before anyone can tell.'],
        'path-missing': ['path missing', 'The watched path does not exist, so this can never fire.'],
        'always-fails': ['always fails', 'Its last runs all failed.'],
        'never-ran': ['never ran', 'Enabled, but it has not fired once.'],
        'deferred': ['deferred', 'Held back by quiet hours; fires when the window ends.'],
        'empty': ['no steps', 'A workflow with no steps does nothing.']
    };

    function persist() {
        vscode.setState({ tab, planView, runView });
    }

    function fmtUSD(n) {
        if (!n) { return '—'; }
        return n >= 10 ? '$' + n.toFixed(0) : '$' + n.toFixed(2);
    }
    function rel(ts) {
        if (!ts) { return '—'; }
        const s = Math.round((Date.now() - ts) / 1000);
        if (s < 0) { return 'now'; }
        if (s < 90) { return s + 's ago'; }
        if (s < 5400) { return Math.round(s / 60) + 'm ago'; }
        if (s < 129600) { return Math.round(s / 3600) + 'h ago'; }
        return Math.round(s / 86400) + 'd ago';
    }
    function until(ts) {
        if (!ts) { return '—'; }
        const d = new Date(ts);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const day = new Date(d); day.setHours(0, 0, 0, 0);
        const diff = Math.round((day - today) / 86400000);
        const hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
        if (diff === 0) { return hm; }
        if (diff === 1) { return 'tomorrow ' + hm; }
        return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()] + ' ' + hm;
    }

    // ---------------------------------------------------------------- header

    function headerHtml(d) {
        const g = d.gate || {};
        const s = d.summary;
        const paused = g.paused || (g.pausedUntil && g.pausedUntil > Date.now());
        const state = g.paused
            ? '<span class="pill stop">ALL PAUSED</span>' + (g.pauseReason ? ` <span class="muted small">${C.esc(g.pauseReason)}</span>` : '')
            : g.pausedUntil && g.pausedUntil > Date.now()
                ? `<span class="pill warn">paused until ${C.esc(new Date(g.pausedUntil).toLocaleTimeString())}</span>`
                : g.blocked
                    ? `<span class="pill warn">${C.esc(g.blockReason)}</span>`
                    : '<span class="pill go">running</span>';
        const quiet = g.quietFrom ? `${C.esc(g.quietFrom)}–${C.esc(g.quietTo)}` : 'off';
        return `<div class="ctl">
            <div class="ctl-row">
                <span class="ctl-title">Automation</span> ${state}
                <span class="spacer"></span>
                ${paused
                ? '<button data-gate="resume">▶ Resume all</button>'
                : `<button class="secondary" data-gate="pause">⏸ Pause all</button>
                       <span class="btngroup">
                         <button class="secondary mini" data-gate="pause-for:60">1h</button>
                         <button class="secondary mini" data-gate="pause-for:480">8h</button>
                         <button class="secondary mini" data-gate="pause-for:1440">24h</button>
                       </span>`}
                <button class="secondary" data-gate="quiet" title="Nightly window: nothing wakes on its own. A due schedule is deferred to the end of the window, not dropped.">🌙 Quiet ${quiet}</button>
            </div>
            <div class="ctl-row stats">
                <span class="stat" title="running / farm-wide limit">⚙️ <b>${s.running}</b>/${s.runLimit} running</span>
                ${s.queued ? `<span class="stat">⏳ <b>${s.queued}</b> queued</span>` : ''}
                ${s.needsYou ? `<span class="stat hot" data-open="open-needs" role="button" tabindex="0">🛡️ <b>${s.needsYou}</b> need you</span>` : ''}
                <span class="stat">📅 <b>${s.plansOn}</b>/${s.plansSwitchable} switched on</span>
                <span class="stat">🏁 today <b>${s.doneToday}</b>✓${s.failedToday ? ` <b class="bad">${s.failedToday}</b>✗` : ''}</span>
                <span class="stat" title="what the automations cost over 7 days">💵 <b>${fmtUSD(s.cost7d)}</b>/7d</span>
                ${s.savedWakeups7d ? `<span class="stat" title="wake-ups the preconditions suppressed — agent runs never paid for">🛡 <b>${s.savedWakeups7d}</b> saved</span>` : ''}
                ${s.issues ? `<span class="stat hot" data-fixissues role="button" tabindex="0" title="show only the rows that need attention">⚠️ <b>${s.issues}</b> need attention</span>` : ''}
            </div>
        </div>`;
    }

    function tabsHtml(d) {
        const T = [
            ['plan', '📅 Plan', d.plan.length],
            ['run', '▶ Runs', d.runs.length]
        ];
        return `<div class="tabs">${T.map(([id, label, n]) =>
            `<button class="tab ${id === tab ? 'on' : ''}" data-tab="${id}">${label} <span class="tab-n">${n}</span></button>`).join('')}
            <span class="spacer"></span>
            <button class="secondary" data-open="open-analytics" title="30-day throughput, agent scorecards, task families and the forecast — reading, not managing">📊 Analytics</button>
        </div>`;
    }

    // ------------------------------------------------------- filter plumbing

    // Every pick filter on the page, so the markup and the wiring are built from
    // one list (options are recomputed per render — the data moves).
    let pickDefs = [];
    /** A multi-pick dropdown: tick any combination, not "all or exactly one". */
    function sel(name, label, value, options) {
        const id = 'tf-' + tab + '-' + name;
        pickDefs.push({ id, name, options });
        return window.AFFilter.multi({
            id, label, options, selected: value,
            title: 'Filter by ' + label.toLowerCase() + ' — tick any combination'
        });
    }

    /** A pick filter's chip text: one value by name, several as a count. */
    function pickText(v) {
        if (!v.length) { return 'none'; }
        return v.length === 1 ? String(v[0]) : v.length + ' picked';
    }

    /** The always-visible record of what is currently hiding rows from you. */
    function activeChips(view, def, labels, shown, total) {
        const chips = [];
        for (const k of Object.keys(def)) {
            if (k === 'sort' || k === 'asc' || k === 'group') { continue; }
            const v = view[k];
            if (v === def[k] || v === '' || v === false || v === null) { continue; }
            const shownVal = Array.isArray(v) ? pickText(v) : v;
            const text = k === 'q' ? `“${v}”` : (labels[k] ? `${labels[k]}: ${shownVal}` : String(shownVal));
            chips.push(`<span class="chip" data-clear="${k}" role="button" tabindex="0" title="remove this filter">${C.esc(text)} ✕</span>`);
        }
        if (!chips.length) { return ''; }
        return `<div class="chips">
            <span class="muted small">showing ${shown} of ${total} —</span>
            ${chips.join('')}
            <button class="mini" data-resetview>Reset filters</button>
        </div>`;
    }

    function sortCell(view, key, label, num) {
        const on = view.sort === key;
        return `<th class="sortable${num ? ' num' : ''}" data-sort="${key}" title="sort">${C.esc(label)}${on ? (view.asc ? ' ▲' : ' ▼') : ''}</th>`;
    }

    function applySort(rows, view, getters) {
        const get = getters[view.sort] || (() => 0);
        return rows.slice().sort((a, b) => {
            const x = get(a), y = get(b);
            const c = typeof x === 'string' ? String(x).localeCompare(String(y)) : (x || 0) - (y || 0);
            return view.asc ? c : -c;
        });
    }

    // ------------------------------------------------------------- PLAN side

    function planRows(d) {
        const v = planView;
        const q = v.q.trim().toLowerCase();
        return d.plan.filter(p => {
            if (v.kind && v.kind.indexOf(p.kind) < 0) { return false; }
            if (v.agent && v.agent.indexOf(p.agentName) < 0) { return false; }
            if (v.model && v.model.indexOf(p.model || 'default') < 0) { return false; }
            // a row that can't be switched at all is neither on nor off
            if (v.state && !(p.switchable && v.state.indexOf(p.enabled ? 'on' : 'off') >= 0)) { return false; }
            if (v.guard && v.guard.indexOf(p.hasGuard ? 'yes' : 'no') < 0) { return false; }
            if (v.issues && !p.issues.length) { return false; }
            if (q && !(p.title + ' ' + p.detail.prompt + ' ' + p.when + ' ' + p.agentName).toLowerCase().includes(q)) { return false; }
            return true;
        });
    }

    /**
     * What a plan row IS, for the right-click menu.
     *
     * The flags are what the menu's `when` clauses read — `afSwitchable`/`afOn`
     * decide whether "switch on" or "switch off" is drawn, `afKind` whether the
     * row gets "Add a step…" or "Edit it…". The words are NOT carried: the
     * handler looks the row up in the data the page already holds, so a prompt
     * that runs to paragraphs is not written into the markup a second time.
     */
    function planCtx(p) {
        return window.AFCtx.row('afPlanRow', {
            planKind: p.kind, planId: p.id,
            afKind: p.kind, afOn: !!p.enabled, afSwitchable: !!p.switchable
        });
    }

    function planRowHtml(p) {
        const key = p.kind + ':' + p.id;
        const k = KIND[p.kind];
        const open = expanded.has(key);
        const badges = p.issues.map(i =>
            `<span class="badge warn" title="${C.esc((ISSUE[i] || ['', ''])[1])}">${C.esc((ISSUE[i] || [i])[0])}</span>`).join(' ');
        const guard = p.hasGuard
            ? `<span title="${C.esc(p.guard)}">🛡 ${C.esc(p.guard)}</span>${p.skipped7d ? `<div class="muted small">saved ${p.skipped7d} wake-up(s)</div>` : ''}`
            : (p.switchable ? '<span class="muted">—</span>' : '');
        const stateCell = p.switchable
            ? `<button class="sw ${p.enabled ? 'on' : 'off'}" data-plan="toggle" data-kind="${p.kind}" data-id="${p.id}"
                    title="${p.enabled ? 'switch off' : 'switch on'}" aria-pressed="${p.enabled}"><span></span></button>`
            : '<span class="muted small">manual</span>';
        return `<tr class="prow ${open ? 'open' : ''}" data-key="${key}"
            ${planCtx(p)} title="${C.esc(window.AFCtx.hint(k.label + ' — ' + k.hint))}">
            <td class="tick">${p.switchable ? `<input type="checkbox" class="rowsel" data-kind="${p.kind}" data-id="${p.id}"${selected.has(key) ? ' checked' : ''}>` : ''}</td>
            <td class="expand" data-expand="${key}" role="button" tabindex="0" title="details">${open ? '▾' : '▸'}</td>
            <td class="main">
                <div class="rowtitle"><span title="${C.esc(k.hint)}">${k.icon}</span> <b>${C.esc(p.title)}</b> ${badges}</div>
                <div class="muted small">${C.esc(p.when)}${p.nextAt ? ` · next ${C.esc(until(p.nextAt))}` : ''}</div>
            </td>
            <td class="agent">${p.agentName ? C.esc(p.agentName) : '<span class="muted">—</span>'}</td>
            <td>${p.model ? `<span class="badge">${C.esc(p.model)}</span>` : '<span class="muted">default</span>'}</td>
            <td class="guardcell">${guard}</td>
            <td class="num">${fmtUSD(p.cost7d)}${p.runs7d ? `<div class="muted small">${p.runs7d} run(s)</div>` : ''}</td>
            <td class="lastrun">${p.lastRunAt ? C.esc(rel(p.lastRunAt)) : '<span class="muted">never</span>'}
                ${p.lastNote ? `<div class="muted small">${C.esc(p.lastNote)}</div>` : ''}</td>
            <td class="state">${stateCell}</td>
            <td class="acts">
                <button class="mini secondary" data-plan="run" data-kind="${p.kind}" data-id="${p.id}" title="run it now">run</button>
                <button class="mini secondary" data-plan="edit" data-kind="${p.kind}" data-id="${p.id}" title="edit">edit</button>
                ${p.kind === 'workflow' ? `<button class="mini secondary" data-plan="rename" data-kind="workflow" data-id="${p.id}" title="rename">name</button>` : ''}
                <button class="mini secondary" data-plan="delete" data-kind="${p.kind}" data-id="${p.id}" title="delete">✕</button>
            </td>
        </tr>${open ? planDetailHtml(p) : ''}`;
    }

    function planDetailHtml(p) {
        const d = p.detail;
        return `<tr class="detail"><td colspan="10"><div class="detailbox">
            <div class="dgrid">
                ${d.target ? `<div><b>Target</b><div>${C.esc(d.target)}</div></div>` : ''}
                ${d.timing ? `<div><b>Timing</b><div>${C.esc(d.timing)}</div></div>` : ''}
                ${p.hasGuard ? `<div><b>Fires only if</b><div>${C.esc(p.guard)}</div></div>` : ''}
                ${p.skipped7d || p.runs7d ? `<div><b>Last 7 days</b><div>${p.runs7d} run(s) · ${p.skipped7d} skipped (${p.skipRate}%) · ${fmtUSD(p.cost7d)}</div></div>` : ''}
            </div>
            ${d.steps.length ? `<div class="dsteps"><b>Steps</b><ol>${d.steps.map((s, n) =>
            // Only a WORKFLOW's steps are editable objects; a schedule's
            // "steps" line is a description, and a menu on it would offer
            // moves and deletes that have nothing to act on.
            p.kind === 'workflow'
                ? `<li ${window.AFCtx.row('afWorkflowStep', { planId: p.id, stepIndex: n, stepText: s })}
                        title="${C.esc(window.AFCtx.hint('Step ' + (n + 1)))}">${C.esc(s)}</li>`
                : `<li>${C.esc(s)}</li>`).join('')}</ol></div>` : ''}
            ${d.prompt ? `<div class="dprompt"><b>Prompt</b><pre>${C.esc(d.prompt)}</pre></div>` : ''}
        </div></td></tr>`;
    }

    function planHtml(d) {
        const v = planView;
        const rows = planRows(d);
        const models = Array.from(new Set(d.plan.map(p => p.model || 'default')));
        const sorted = applySort(rows, v, {
            title: p => p.title.toLowerCase(),
            when: p => p.nextAt || (p.kind === 'schedule' ? 1 : 2) * 1e13,
            agent: p => p.agentName.toLowerCase(),
            cost: p => p.cost7d,
            last: p => p.lastRunAt || 0
        });

        // Grouping: the user asked for "well grouped"; kind is the default
        // because it answers "what kinds of automation do I even have".
        const groups = new Map();
        for (const p of sorted) {
            const g = v.group === 'agent' ? (p.agentName || 'no agent')
                : v.group === 'kind' ? KIND[p.kind].label + 's'
                    : '';
            if (!groups.has(g)) { groups.set(g, []); }
            groups.get(g).push(p);
        }

        const lede = `<p class="lede">A <b>plan</b> is anything that defines work: ⏰ a <b>schedule</b> runs at a set
            time, ⚡ a <b>trigger</b> runs when something happens, 🔗 a <b>workflow</b> chains several agents and
            📋 a <b>template</b> is a saved prompt. The first two run on their own; the last two run when launched.
            Every one of them produces <b>tasks</b> — see the Runs tab.</p>`;
        const head = `<tr>
            <th class="tick"><input type="checkbox" class="allsel" title="select all switchable"></th>
            <th class="expand"></th>
            ${sortCell(v, 'title', 'What runs')}
            ${sortCell(v, 'agent', 'Agent')}
            <th>Model</th>
            <th>Guard</th>
            ${sortCell(v, 'cost', 'Cost 7d', true)}
            ${sortCell(v, 'last', 'Last run')}
            <th class="state">On</th><th class="acts"></th></tr>`;

        const body = !sorted.length
            ? `<tr><td colspan="10" class="empty">${d.plan.length
                ? 'Nothing matches these filters.'
                : 'Nothing is automated yet. Add a schedule to run an agent at a set time, or a trigger to run one when something happens.'}</td></tr>`
            : [...groups.entries()].map(([g, list]) =>
                (g ? `<tr class="grouphead"><td colspan="10">${C.esc(g)} <span class="muted small">${list.length}</span></td></tr>` : '')
                + list.map(planRowHtml).join('')).join('');

        return `
            ${lede}
            <div class="toolbar">
                <input type="search" id="planq" placeholder="Search name, prompt, agent…" value="${C.esc(v.q)}" class="${v.q ? 'set' : ''}">
                ${sel('kind', 'Kind', v.kind, Object.keys(KIND).map(k => ({ v: k, t: KIND[k].label })))}
                ${sel('agent', 'Agent', v.agent, d.agents)}
                ${sel('model', 'Model', v.model, models)}
                ${sel('state', 'State', v.state, [{ v: 'on', t: 'on' }, { v: 'off', t: 'off' }])}
                ${sel('guard', 'Guard', v.guard, [{ v: 'yes', t: 'guarded' }, { v: 'no', t: 'unguarded' }])}
                <label class="cbx"><input type="checkbox" data-f="issues"${v.issues ? ' checked' : ''}> needs attention</label>
                <span class="spacer"></span>
                <label class="grp">group
                    <select data-f="group">
                        <option value="kind"${v.group === 'kind' ? ' selected' : ''}>by kind</option>
                        <option value="agent"${v.group === 'agent' ? ' selected' : ''}>by agent</option>
                        <option value=""${v.group === '' ? ' selected' : ''}>flat</option>
                    </select>
                </label>
                <span class="btngroup">
                    <button data-add="schedule" title="run an agent at a set time">+ Schedule</button>
                    <button class="secondary" data-add="trigger" title="run an agent when something happens">+ Trigger</button>
                    <button class="secondary" data-add="workflow" title="chain several agents">+ Workflow</button>
                </span>
            </div>
            ${activeChips(v, PLAN_DEF, { kind: 'kind', agent: 'agent', model: 'model', state: 'state', guard: 'guard', issues: 'needs attention' }, rows.length, d.plan.length)}
            <div class="bulk" ${selected.size ? '' : 'hidden'}>
                <b><span id="bulkn">${selected.size}</span> selected</b>
                <button class="mini" data-bulk="on">switch on</button>
                <button class="mini secondary" data-bulk="off">switch off</button>
                <button class="mini secondary" data-bulk="clear">clear</button>
            </div>
            <div class="tablewrap"><table class="grid">${head}${body}</table></div>`;
    }

    // -------------------------------------------------------------- RUN side

    const STATUS = {
        running: ['running', 'go'], queued: ['queued', ''], parked: ['parked', 'warn'],
        done: ['done', 'ok'], failed: ['failed', 'stop'], cancelled: ['cancelled', '']
    };

    function runRows(d) {
        const v = runView;
        const q = v.q.trim().toLowerCase();
        return d.runs.filter(r => {
            if (v.agent && v.agent.indexOf(r.agentName) < 0) { return false; }
            if (v.status && v.status.indexOf(r.status) < 0) { return false; }
            if (v.source && v.source.indexOf(r.sourceKind) < 0) { return false; }
            if (q && !(r.title + ' ' + r.prompt + ' ' + r.agentName + ' ' + r.source).toLowerCase().includes(q)) { return false; }
            return true;
        });
    }

    function runRowHtml(r) {
        const key = 'run:' + r.id;
        const open = expanded.has(key);
        const st = STATUS[r.status] || [r.status, ''];
        const live = r.status === 'running' || r.status === 'queued' || r.status === 'parked';
        // ‼️ `afLive` is computed here rather than derived from the status in a
        // `when` clause: "live" is three statuses, and a menu that spelled that
        // out three times would drift the day a fourth is added.
        const ctx = window.AFCtx.row('afTaskRun', {
            taskId: r.id, afStatus: r.status, afLive: live,
            afOutput: !!r.hasOutput, afSession: !!r.sessionFile,
            afFrom: r.sourceKind || 'manual'
        });
        return `<tr class="prow ${open ? 'open' : ''}" ${ctx}
            title="${C.esc(window.AFCtx.hint(r.sourceKind === 'manual' ? 'You started this run' : 'Started by ' + r.sourceKind + ' · ' + r.source))}">
            <td class="expand" data-expand="${key}" role="button" tabindex="0">${open ? '▾' : '▸'}</td>
            <td class="main"><div class="rowtitle"><b>${C.esc(r.title)}</b></div>
                <div class="muted small">${C.esc(r.agentName)} · ${C.esc(r.mode)}${r.detail ? ' · ' + C.esc(r.detail) : ''}</div></td>
            <td class="state"><span class="pill ${st[1]}">${C.esc(st[0])}</span></td>
            <td class="from">${r.sourceKind === 'manual' ? '<span class="muted">you</span>'
                : `${C.esc(r.sourceKind)}<div class="muted small">${C.esc(r.source)}</div>`}</td>
            <td class="num">${r.durMin !== undefined ? r.durMin + 'm' : '—'}</td>
            <td class="num">${fmtUSD(r.costUSD)}</td>
            <td class="when">${C.esc(rel(r.when))}</td>
            <td class="acts">
                ${r.status === 'queued' ? `<button class="mini secondary" data-task="start" data-id="${r.id}">start</button>
                    <button class="mini secondary" data-task="next" data-id="${r.id}" title="move to the front">↑</button>` : ''}
                ${r.status === 'parked' ? `<button class="mini secondary" data-task="unpark" data-id="${r.id}" title="try to start it again">retry start</button>` : ''}
                ${r.status === 'running' ? `<button class="mini secondary" data-task="terminal" data-id="${r.id}">terminal</button>` : ''}
                ${live ? `<button class="mini secondary" data-task="cancel" data-id="${r.id}">cancel</button>` : ''}
                ${!live ? `<button class="mini secondary" data-task="rerun" data-id="${r.id}">re-run</button>` : ''}
                ${r.hasOutput ? `<button class="mini secondary" data-out="${C.esc(r.outputFile)}">output</button>` : ''}
                ${!live ? `<button class="mini secondary" data-task="delete" data-id="${r.id}">✕</button>` : ''}
            </td>
        </tr>${open ? `<tr class="detail"><td colspan="8"><div class="detailbox">
            <div class="dgrid">
                <div><b>Came from</b><div>${C.esc(r.sourceKind)} · ${C.esc(r.source)}</div></div>
                ${r.verified ? `<div><b>Verify</b><div>${C.esc(r.verified)}</div></div>` : ''}
                ${r.sessionFile ? `<div><b>Transcript</b><div><button class="mini secondary" data-tr="${C.esc(r.sessionFile)}">open session</button></div></div>` : ''}
            </div>
            <div class="dprompt"><b>Prompt</b><pre>${C.esc(r.prompt)}</pre></div>
        </div></td></tr>` : ''}`;
    }

    function runHtml(d) {
        const v = runView;
        const rows = runRows(d);
        const sorted = applySort(rows, v, {
            when: r => r.when, title: r => r.title.toLowerCase(),
            cost: r => r.costUSD || 0, dur: r => r.durMin || 0
        });
        const head = `<tr><th class="expand"></th>${sortCell(v, 'title', 'Task')}<th class="state">Status</th><th>Started by</th>
            ${sortCell(v, 'dur', 'Took', true)}${sortCell(v, 'cost', 'Cost', true)}${sortCell(v, 'when', 'When')}<th class="acts"></th></tr>`;
        const body = !sorted.length
            ? `<tr><td colspan="8" class="empty">${d.runs.length ? 'Nothing matches these filters.' : 'Nothing has run yet.'}</td></tr>`
            : sorted.map(runRowHtml).join('');
        return `
            <p class="lede">A <b>task</b> is one execution. It is started by a schedule, a trigger or a
                workflow step — or by you, with <b>+ Run a task</b>. Everything on the Plan tab produces tasks here.</p>
            <div class="toolbar">
                <input type="search" id="runq" placeholder="Search run, prompt, agent…" value="${C.esc(v.q)}" class="${v.q ? 'set' : ''}">
                ${sel('agent', 'Agent', v.agent, d.agents)}
                ${sel('status', 'Status', v.status, Object.keys(STATUS))}
                ${sel('source', 'From', v.source, [{ v: 'schedule', t: 'schedule' }, { v: 'trigger', t: 'trigger' }, { v: 'workflow', t: 'workflow' }, { v: 'manual', t: 'you' }])}
                <span class="spacer"></span>
                <button data-open="task-add">+ Run a task</button>
                <button class="secondary" data-open="cancel-queued">Cancel queued</button>
                <button class="secondary" data-open="clear-finished">Clear finished</button>
            </div>
            ${activeChips(v, RUN_DEF, { agent: 'agent', status: 'status', source: 'from' }, rows.length, d.runs.length)}
            <div class="cmdbar">
                <input id="cmd" placeholder="Tell the farm what to do, in words — e.g. “run the filing batch on manager now”" value="${C.esc(cmdText)}">
                <button id="cmdgo"${pendingCommand ? ' disabled' : ''}>${pendingCommand ? 'working…' : 'Go'}</button>
            </div>
            <div class="tablewrap"><table class="grid">${head}${body}</table></div>`;
    }

    // ---------------------------------------------------------------- render

    function render() {
        const d = DATA;
        pickDefs = [];   // refilled by sel() while the toolbar below is built
        document.getElementById('app').innerHTML = `
            <style>
                .ctl { border:1px solid var(--vscode-widget-border,#4443); border-radius:9px; padding:9px 12px;
                    margin:0 0 12px; background:var(--vscode-editorWidget-background, rgba(128,128,128,.05)); }
                .ctl-row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
                .ctl-row + .ctl-row { margin-top:7px; }
                .ctl-title { font-weight:700; font-size:13px; }
                .spacer { flex:1 1 auto; }
                .btngroup { display:inline-flex; gap:3px; }
                .pill { font-size:11px; border-radius:10px; padding:1px 9px; border:1px solid var(--vscode-widget-border,#4444); }
                .pill.go { color:var(--vscode-charts-green,#3fb950); border-color:currentColor; }
                .pill.warn { color:var(--vscode-editorWarning-foreground,#cca700); border-color:currentColor; }
                .pill.stop { color:var(--vscode-errorForeground,#f85149); border-color:currentColor; font-weight:700; }
                .pill.ok { color:var(--vscode-charts-green,#3fb950); border-color:currentColor; }
                .stats { font-size:12px; }
                .stat { display:inline-flex; gap:5px; align-items:center; padding:1px 9px; border-radius:5px; }
                .stat[role=button] { cursor:pointer; }
                .stat[role=button]:hover { background:var(--vscode-list-hoverBackground); }
                .stat.hot { color:var(--vscode-editorWarning-foreground,#cca700); }
                .bad { color:var(--vscode-errorForeground,#f85149); }
                .tabs { display:flex; gap:4px; align-items:center; margin:0 0 10px;
                    border-bottom:1px solid var(--vscode-panel-border); }
                .tab { padding:7px 18px; border:none; border-bottom:2px solid transparent; border-radius:6px 6px 0 0;
                    background:transparent; color:var(--vscode-foreground); opacity:.6; font-size:13px; cursor:pointer; }
                .tab:hover { opacity:.9; background:var(--vscode-list-hoverBackground); }
                .tab.on { opacity:1; font-weight:600; border-bottom-color:var(--vscode-textLink-foreground);
                    background:var(--vscode-editorWidget-background); }
                .tab-n { opacity:.55; font-weight:400; font-size:11px; }
                .toolbar { display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin:0 0 8px; }
                .toolbar input[type=search], .cmdbar input { padding:4px 9px; }
                .toolbar input[type=search] { min-width:210px; }
                .toolbar select { padding:3px 6px; }
                .toolbar select.set, .toolbar input.set { border-color:var(--vscode-focusBorder); }
                .cbx, .grp { font-size:12px; display:inline-flex; gap:5px; align-items:center; opacity:.85; }
                .chips { display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin:0 0 8px; }
                .chip { font-size:11px; padding:1px 9px; border-radius:10px; cursor:pointer;
                    border:1px solid var(--vscode-focusBorder); background:var(--vscode-editorWidget-background); }
                .chip:hover { background:var(--vscode-list-hoverBackground); }
                .bulk { display:flex; gap:6px; align-items:center; margin:0 0 8px; padding:5px 10px;
                    border:1px solid var(--vscode-focusBorder); border-radius:6px; }
                .bulk[hidden] { display:none; }
                .cmdbar { display:flex; gap:6px; margin:0 0 10px; }
                .cmdbar input { flex:1; }
                /* Columns size themselves to their content and use whatever
                   width the window gives them. Only the fixed-size furniture
                   (checkbox, caret) and the numeric/action columns are pinned;
                   the text columns are free to grow on a wide screen and to
                   shrink on a narrow one — nothing is capped by hand. */
                .tablewrap { overflow-x:auto; }
                table.grid { width:100%; border-collapse:collapse; table-layout:auto; }
                table.grid th { text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:.4px;
                    opacity:.65; font-weight:600; padding:4px 10px; border-bottom:1px solid var(--vscode-panel-border); }
                table.grid td { padding:7px 10px; border-bottom:1px solid var(--vscode-panel-border); vertical-align:top; }
                th.sortable { cursor:pointer; user-select:none; white-space:nowrap; }
                th.sortable:hover { color:var(--vscode-textLink-foreground); }
                th.tick, td.tick { width:1%; white-space:nowrap; padding-right:0; }
                th.expand, td.expand { width:1%; white-space:nowrap; padding-left:4px; padding-right:4px;
                    cursor:pointer; opacity:.6; }
                td.expand:hover { opacity:1; }
                td.num, th.num { text-align:right; white-space:nowrap; width:1%; }
                td.acts, th.acts { white-space:nowrap; text-align:right; width:1%; }
                td.state, th.state { width:1%; white-space:nowrap; }
                /* the free-growing text columns */
                td.main { min-width:15rem; }
                td.when, td.guardcell, td.lastrun, td.from { min-width:9rem; }
                td.agent { min-width:6rem; }
                td.acts .mini { margin-left:3px; }
                td.state { text-align:center; }
                .rowtitle { display:flex; gap:6px; align-items:baseline; flex-wrap:wrap; }
                tr.grouphead td { background:var(--vscode-editorWidget-background, rgba(128,128,128,.06));
                    font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:.5px; opacity:.8; padding:5px 8px; }
                tr.prow.open td { border-bottom:none; }
                tr.detail td { padding:0 8px 10px 28px; }
                .detailbox { border-left:2px solid var(--vscode-focusBorder); padding:6px 0 2px 12px; font-size:12px; }
                .dgrid { display:flex; gap:22px; flex-wrap:wrap; margin-bottom:6px; }
                .dgrid b, .dsteps b, .dprompt b { display:block; font-size:10px; text-transform:uppercase;
                    letter-spacing:.4px; opacity:.6; }
                .dsteps ol { margin:2px 0 6px; padding-left:20px; }
                .dprompt pre { white-space:pre-wrap; word-break:break-word; margin:3px 0 0; padding:7px 9px;
                    background:var(--vscode-textCodeBlock-background, rgba(128,128,128,.09)); border-radius:5px;
                    max-height:190px; overflow:auto; font-size:11.5px; }
                .empty { text-align:center; opacity:.6; padding:22px 8px; }
                .lede { font-size:12px; opacity:.8; margin:0 0 9px; max-width:78ch; line-height:1.5; }
                .badge { font-size:10px; border:1px solid var(--vscode-panel-border); border-radius:3px; padding:0 5px; }
                .badge.warn { color:var(--vscode-editorWarning-foreground,#cca700); border-color:currentColor; }
                button.mini { font-size:10px; padding:1px 6px; }
                /* the switch: a real on/off control, not a word that changes */
                .sw { width:34px; height:18px; border-radius:9px; border:1px solid var(--vscode-widget-border,#666);
                    background:var(--vscode-input-background); position:relative; cursor:pointer; padding:0; }
                .sw span { position:absolute; top:2px; left:2px; width:12px; height:12px; border-radius:50%;
                    background:var(--vscode-descriptionForeground,#888); transition:left .12s, background .12s; }
                .sw.on { border-color:var(--vscode-charts-green,#3fb950); }
                .sw.on span { left:18px; background:var(--vscode-charts-green,#3fb950); }
                .guardcell { font-size:11.5px; }
            </style>
            ${window.AFHeader.html({
                page: 'tasks',
                title: 'Tasks',
                sub: `plan what runs · see what ran — updated ${new Date(d.generatedAt).toLocaleTimeString()}`,
                guide: 'tasks-sayfasi'
            })}
            ${headerHtml(d)}
            ${tabsHtml(d)}
            ${tab === 'plan' ? planHtml(d) : runHtml(d)}`;

        window.AFHeader.wire(vscode);
        wire();
        if (refocus) {
            const el = document.getElementById(refocus);
            if (el) { el.focus(); if (el.setSelectionRange) { const n = el.value.length; el.setSelectionRange(n, n); } }
            refocus = null;
        }
    }

    function view() { return tab === 'plan' ? planView : runView; }
    function setView(patch) {
        Object.assign(view(), patch);
        persist();
        render();
    }

    function wire() {
        const on = (sel2, ev, fn) => document.querySelectorAll(sel2).forEach(el => el.addEventListener(ev, fn));
        const click = (sel2, fn) => on(sel2, 'click', fn);
        const key = (el, fn) => el.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
        });

        click('[data-tab]', e => { tab = e.currentTarget.dataset.tab; expanded.clear(); persist(); render(); });
        click('[data-gate]', e => {
            const [a, arg] = e.currentTarget.dataset.gate.split(':');
            post({ type: 'gate', act: a, text: arg });
        });
        click('[data-open]', e => post({ type: e.currentTarget.dataset.open }));
        document.querySelectorAll('[data-open][role=button]').forEach(el => key(el, () => post({ type: el.dataset.open })));
        click('[data-fixissues]', () => setView({ issues: true }));
        document.querySelectorAll('[data-fixissues]').forEach(el => key(el, () => setView({ issues: true })));

        // filters: the pick dropdowns are multi-select (afFilters.js); the
        // checkbox and the grouping select stay single-valued
        pickDefs.forEach(p => window.AFFilter.wireMulti({
            id: p.id,
            onChange: valsel => setView({ [p.name]: valsel })
        }));
        on('[data-f]', 'change', e => {
            const el = e.currentTarget;
            setView({ [el.dataset.f]: el.type === 'checkbox' ? el.checked : el.value });
        });
        const q = document.getElementById(tab === 'plan' ? 'planq' : 'runq');
        if (q) {
            q.addEventListener('input', () => { refocus = q.id; setView({ q: q.value }); });
        }
        click('[data-clear]', e => setView({ [e.currentTarget.dataset.clear]: (tab === 'plan' ? PLAN_DEF : RUN_DEF)[e.currentTarget.dataset.clear] }));
        document.querySelectorAll('[data-clear]').forEach(el =>
            key(el, () => setView({ [el.dataset.clear]: (tab === 'plan' ? PLAN_DEF : RUN_DEF)[el.dataset.clear] })));
        click('[data-resetview]', () => {
            if (tab === 'plan') { planView = Object.assign({}, PLAN_DEF); }
            else { runView = Object.assign({}, RUN_DEF); }
            persist(); render();
        });
        click('[data-sort]', e => {
            const k = e.currentTarget.dataset.sort;
            const v = view();
            setView(v.sort === k ? { asc: !v.asc } : { sort: k, asc: true });
        });

        // expand / collapse
        const toggleExpand = (k) => { expanded.has(k) ? expanded.delete(k) : expanded.add(k); render(); };
        click('[data-expand]', e => toggleExpand(e.currentTarget.dataset.expand));
        document.querySelectorAll('[data-expand]').forEach(el => key(el, () => toggleExpand(el.dataset.expand)));

        // plan actions
        click('[data-plan]', e => {
            const el = e.currentTarget;
            post({ type: 'plan', act: el.dataset.plan, kind: el.dataset.kind, id: el.dataset.id });
        });
        click('[data-add]', e => post({ type: 'plan-add', kind: e.currentTarget.dataset.add }));

        // selection + bulk
        const syncBulk = () => {
            const bar = document.querySelector('.bulk');
            if (bar) {
                bar.hidden = selected.size === 0;
                const n = document.getElementById('bulkn');
                if (n) { n.textContent = String(selected.size); }
            }
            const all = document.querySelector('.allsel');
            const boxes = document.querySelectorAll('.rowsel');
            if (all) {
                all.checked = selected.size > 0 && selected.size === boxes.length;
                all.indeterminate = selected.size > 0 && selected.size < boxes.length;
            }
        };
        on('.rowsel', 'change', e => {
            const el = e.currentTarget;
            const k = el.dataset.kind + ':' + el.dataset.id;
            el.checked ? selected.add(k) : selected.delete(k);
            syncBulk();
        });
        on('.allsel', 'change', e => {
            const chk = e.currentTarget.checked;
            document.querySelectorAll('.rowsel').forEach(b => {
                b.checked = chk;
                const k = b.dataset.kind + ':' + b.dataset.id;
                chk ? selected.add(k) : selected.delete(k);
            });
            syncBulk();
        });
        click('[data-bulk]', e => {
            const a = e.currentTarget.dataset.bulk;
            if (a === 'clear') {
                selected.clear();
                document.querySelectorAll('.rowsel').forEach(b => { b.checked = false; });
                syncBulk();
                return;
            }
            const rows = [...selected].map(k => {
                const i = k.indexOf(':');
                return { kind: k.slice(0, i), id: k.slice(i + 1) };
            });
            if (rows.length) { post({ type: 'bulk', act: a, rows }); selected.clear(); }
        });
        syncBulk();

        // run actions
        click('[data-task]', e => post({ type: 'task', act: e.currentTarget.dataset.task, id: e.currentTarget.dataset.id }));
        click('[data-out]', e => post({ type: 'open-output', file: e.currentTarget.dataset.out }));
        click('[data-tr]', e => post({ type: 'open-transcript', file: e.currentTarget.dataset.tr }));

        const cmd = document.getElementById('cmd');
        if (cmd) {
            cmd.addEventListener('input', () => { cmdText = cmd.value; });
            const go = () => {
                if (!cmd.value.trim() || pendingCommand) { return; }
                pendingCommand = true;
                post({ type: 'command', text: cmd.value.trim() });
                cmdText = '';
                render();
            };
            cmd.addEventListener('keydown', e => { if (e.key === 'Enter') { go(); } });
            const btn = document.getElementById('cmdgo');
            if (btn) { btn.addEventListener('click', go); }
        }
    }

    // ------------------------------------------------------- right-click menu

    /**
     * Everything a right-click on this page can ask for.
     *
     * ‼️ EVERY BRANCH POSTS WHAT A BUTTON POSTS. `plRun` sends the same
     * `{type:'plan', act:'run'}` the row's own run button sends, `tkCancel` the
     * same `{type:'task', act:'cancel'}` — so the panel keeps one switch and a
     * change to how a task is cancelled cannot leave the menu cancelling the
     * old way. What the menu adds is REACH: the acts no button ever offered
     * (move a queued run, retry with an edited prompt, save the prompt as a
     * template, edit a workflow step) and the ones that were only reachable
     * after expanding the row.
     *
     * The row's identity travels in the context object: by the time the pick
     * arrives the table may have been re-sorted, re-filtered, or repainted by
     * the 30-second ticker, and acting on "whatever is under the pointer now"
     * would act on a different task.
     */
    function ctxDo(act, ctx) {
        const verb = act.split(':')[0];
        const arg = act.slice(verb.length + 1);
        const planOf = () => DATA.plan.find(p => p.kind === ctx.planKind && p.id === ctx.planId);
        const runOf = () => DATA.runs.find(r => r.id === ctx.taskId);
        const plan = (a) => post({ type: 'plan', act: a, kind: ctx.planKind, id: ctx.planId });
        const task = (a) => post({ type: 'task', act: a, id: ctx.taskId });
        const copy = (v) => window.AFCtx.copy(v);
        const toggle = (k) => { expanded.has(k) ? expanded.delete(k) : expanded.add(k); render(); };

        switch (verb) {
            // ---- a plan row ----
            case 'plRun': plan('run'); return;
            case 'plEdit': plan('edit'); return;
            case 'plRename': plan('rename'); return;
            case 'plToggle': plan('toggle'); return;
            case 'plDelete': plan('delete'); return;
            case 'plExport': plan('export'); return;
            case 'plHistory': post({ type: 'open-history' }); return;
            case 'plDetail': toggle(ctx.planKind + ':' + ctx.planId); return;
            // "What has it run" is the Runs tab searched for this definition —
            // the runs carry their source's title, which is what the search box
            // already matches on.
            case 'plRuns': {
                const p = planOf();
                tab = 'run';
                runView = Object.assign({}, RUN_DEF, { q: p ? p.title : '' });
                persist();
                render();
                return;
            }
            case 'plCopy': {
                const p = planOf();
                if (!p) { copy(''); return; }
                copy(arg === 'prompt' ? (p.detail && p.detail.prompt)
                    : arg === 'when' ? p.when
                        : arg === 'id' ? p.id : p.title);
                return;
            }

            // ---- one step of a workflow ----
            case 'wfEdit': post({ type: 'wfstep', act: 'edit', id: ctx.planId, index: Number(ctx.stepIndex) }); return;
            case 'wfMove': post({ type: 'wfstep', act: arg, id: ctx.planId, index: Number(ctx.stepIndex) }); return;
            case 'wfDelete': post({ type: 'wfstep', act: 'delete', id: ctx.planId, index: Number(ctx.stepIndex) }); return;
            case 'wfCopy': copy(ctx.stepText); return;

            // ---- one execution ----
            case 'tkStart': task('start'); return;
            case 'tkNext': task('next'); return;
            case 'tkMove': task(arg === 'up' ? 'up' : 'down'); return;
            case 'tkUnpark': task('unpark'); return;
            case 'tkRerun': task('rerun'); return;
            case 'tkRetryEdit': task('retryEdit'); return;
            case 'tkResume': task('resumeWorkflow'); return;
            case 'tkTemplate': task('saveTemplate'); return;
            case 'tkTerminal': task('terminal'); return;
            case 'tkCancel': task('cancel'); return;
            case 'tkDelete': task('delete'); return;
            case 'tkDetail': toggle('run:' + ctx.taskId); return;
            case 'tkOutput': {
                const r = runOf();
                if (r && r.outputFile) { post({ type: 'open-output', file: r.outputFile }); }
                return;
            }
            case 'tkTranscript': {
                const r = runOf();
                if (r && r.sessionFile) { post({ type: 'open-transcript', file: r.sessionFile }); }
                return;
            }
            case 'tkSource': {
                const r = runOf();
                tab = 'plan';
                planView = Object.assign({}, PLAN_DEF, { q: r ? r.source : '' });
                persist();
                render();
                return;
            }
            case 'tkCopy': {
                const r = runOf();
                if (!r) { copy(''); return; }
                copy(arg === 'prompt' ? r.prompt
                    : arg === 'id' ? r.id
                        : arg === 'output' ? r.outputFile : r.title);
                return;
            }
        }
    }

    // ‼️ Listened for ONCE, at module scope. render() runs on every repaint and
    // every 30-second tick; a listener added there would accumulate a copy per
    // paint, and one right-click would eventually run the action a hundred
    // times.
    window.AFCtx.listen(ctxDo);

    window.addEventListener('message', ev => {
        if (ev.data.type === 'data') { DATA = ev.data.data; pendingCommand = false; render(); }
        if (ev.data.type === 'focus' && ev.data.tab) { tab = ev.data.tab; persist(); render(); }
    });

    render();
    // Ages and durations go stale; never re-render under the user's fingers.
    setInterval(() => {
        if (document.hidden) { return; }
        const a = document.activeElement;
        if (a && (a.tagName === 'INPUT' || a.tagName === 'SELECT')) { return; }
        render();
    }, 30000);
})();
