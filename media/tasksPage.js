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
                ? `<span class="pill warn" title="${C.esc(window.AFTime.tip(g.pausedUntil, 'Paused until'))}">paused until ${C.esc(window.AFTime.clock(g.pausedUntil))}</span>`
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
                <button class="secondary" data-gate="open" title="Nightly window: nothing wakes on its own. A due schedule is deferred to the end of the window, not dropped.">🌙 Quiet ${quiet}</button>
            </div>
            ${gateEdit ? gateHtml(g) : ''}
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

    /**
     * ‼️ THE GATE'S OWN TWO DIALOGS — the last ones on this page.
     *
     * The header's 🌙 button called `agentfarm.setQuietHours`, which asked a
     * quickpick of two canned windows and then, for anything else, two more
     * input boxes; `pauseAutomations` asked a duration and then typed the
     * reason into a third. Both are two numbers and a sentence, on the strip
     * that already shows what they set.
     *
     * `gateEdit` is `'quiet' | 'pause' | null` — which half opened it. Both
     * halves are drawn either way, because they are one thing: what the farm is
     * allowed to do on its own.
     */
    let gateEdit = null;
    let gateFrom = '', gateTo = '', gateReason = '', gateMins = '0', gateMsg = '';

    /** Open the gate card, filled from what the gate currently says. */
    function openGate(which) {
        const g = (DATA && DATA.gate) || {};
        gateEdit = which || 'quiet';
        gateFrom = g.quietFrom || '23:00';
        gateTo = g.quietTo || '07:00';
        gateReason = g.pauseReason || '';
        gateMins = '0';
        gateMsg = '';
        render();
    }

    function gateHtml(g) {
        return `<div class="ntbox" id="gtbox">
            <div class="ctl-row">
                <span class="ctl-title">What the farm may do on its own</span>
                <span class="spacer"></span>
                <button class="secondary mini" id="gt-close">✕</button>
            </div>
            <div class="ntsec"><b>Quiet hours</b>
                <span class="muted small">Nothing wakes inside the window. A schedule that comes due in it is
                    <b>deferred to the end of the window</b>, never dropped.</span></div>
            <div class="ntgrid">
                <label class="ntf" title="When the window starts, local 24h."><span>From</span>
                    <input type="time" id="gt-from" value="${C.esc(gateFrom)}"></label>
                <label class="ntf" title="When it ends. An end earlier than the start means the window crosses midnight."><span>To</span>
                    <input type="time" id="gt-to" value="${C.esc(gateTo)}"></label>
                <span class="ntf"><span>&nbsp;</span><span class="btngroup">
                    <button class="mini" id="gt-quiet">Set the window</button>
                    <button class="mini secondary" id="gt-quietoff"${g.quietFrom ? '' : ' disabled'}>Turn it off</button>
                </span></span>
            </div>
            <div class="ntsec"><b>Pause everything</b>
                <span class="muted small">The master switch. ‼️ Say WHY — a pause with no reason is the one that
                    is still on three days later with nobody able to explain it.</span></div>
            <div class="ntgrid">
                <label class="ntf" title="How long the pause lasts."><span>For</span>
                    <select id="gt-mins">
                        <option value="0"${gateMins === '0' ? ' selected' : ''}>until I resume it</option>
                        <option value="60"${gateMins === '60' ? ' selected' : ''}>1 hour</option>
                        <option value="480"${gateMins === '480' ? ' selected' : ''}>8 hours</option>
                        <option value="1440"${gateMins === '1440' ? ' selected' : ''}>24 hours</option>
                    </select></label>
                <label class="ntf wide" title="Shown on this strip and on the Living page for as long as the pause lasts."><span>Reason</span>
                    <input type="text" id="gt-reason" value="${C.esc(gateReason)}" placeholder="e.g. reviewing what last night cost"></label>
                <span class="ntf"><span>&nbsp;</span>
                    <button class="mini" id="gt-pause">⏸ Pause it</button></span>
            </div>
            ${gateMsg ? `<div class="ntmsg warn">${C.esc(gateMsg)}</div>` : ''}
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
        // the box is a QUERY, not a substring — media/afQuery.js
        const q = window.AFQuery.compile(v.q);
        return d.plan.filter(p => {
            if (v.kind && v.kind.indexOf(p.kind) < 0) { return false; }
            if (v.agent && v.agent.indexOf(p.agentName) < 0) { return false; }
            if (v.model && v.model.indexOf(p.model || 'default') < 0) { return false; }
            // a row that can't be switched at all is neither on nor off
            if (v.state && !(p.switchable && v.state.indexOf(p.enabled ? 'on' : 'off') >= 0)) { return false; }
            if (v.guard && v.guard.indexOf(p.hasGuard ? 'yes' : 'no') < 0) { return false; }
            if (v.issues && !p.issues.length) { return false; }
            if (!q.empty && !q.test(p.title + ' ' + p.detail.prompt + ' ' + p.when + ' ' + p.agentName)) { return false; }
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
                <input type="search" id="planq" placeholder="Search name, prompt, agent…" value="${C.esc(v.q)}" class="${v.q ? 'set' : ''}"
                    title="${C.esc(window.AFQuery.tip('Searched against the name, the prompt, the schedule and the agent.'))}">
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
                    <!-- ‼️ This button did not exist, and the one thing worse
                         than a missing button was what "+ Template" would have
                         done: the plan-add message mapped the template kind to
                         agentfarm.runTemplate, so the ADD button RAN one. There
                         was no way to make a template on this page at all. -->
                    <button class="secondary" data-add="template" title="save a prompt you launch by hand">+ Template</button>
                </span>
            </div>
            ${composer && (COMPOSE[composer.kind] || COMPOSE.task).tab === 'plan' ? composerHtml() : ''}
            ${chooser && chooser.tab === 'plan' ? chooserHtml() : ''}
            ${!composer && composerMsg && tab === 'plan' ? `<div class="ntmsg">${C.esc(composerMsg)}</div>` : ''}
            ${activeChips(v, PLAN_DEF, { kind: 'kind', agent: 'agent', model: 'model', state: 'state', guard: 'guard', issues: 'needs attention' }, rows.length, d.plan.length)}
            <div class="bulk" ${selected.size ? '' : 'hidden'}>
                <b><span id="bulkn">${selected.size}</span> selected</b>
                <button class="mini" data-bulk="on">switch on</button>
                <button class="mini secondary" data-bulk="off">switch off</button>
                <button class="mini secondary" data-bulk="clear">clear</button>
            </div>
            <div class="tablewrap"><table class="grid">${head}${body}</table></div>`;
    }

    // ------------------------------------------------- NEW TASK: the composer
    /**
     * ‼️ THE PAGE MAKES A TASK. IT DOES NOT OPEN A DIALOG THAT DOES.
     *
     * This page was a control panel with no controls for the one thing it is
     * about. "+ Run a task" opened a chain of VS Code input boxes — title,
     * prompt, mode, CLI, "start now?" — and the questions it could NOT ask are
     * the ones that decide what an unattended run actually does: which model,
     * what effort, what permission mode, which project, how urgent, in which
     * folder. Meanwhile the sidebar's + ran the same chain, so a task made from
     * the tree and one made from the page were different objects, and editing a
     * run asked a third, different set of questions again.
     *
     * So there is ONE form, it lives on the page, and every route in opens it:
     * this button, the sidebar's +, the walkthrough, and a row's "like this
     * one" (prefilled). Its fields are the launcher's own vocabulary — the same
     * model list, the same efforts, the same permission modes a session is
     * started with (core/launch.ts) — plus the four dimensions only a task has.
     *
     * Every field is optional except the agent and the prompt: an empty field
     * means the same thing it means in the launcher — no flag, and whatever the
     * agent and the CLI already decide stays in charge.
     */
    /**
     * ‼️ AND IT MAKES EVERY OTHER KIND TOO — U-9.
     *
     * The run side got this form in 3.80.0; the PLAN side did not, and a plan
     * object is not a lesser thing than a task. Measured in `extension.ts`:
     * `addSchedule` asked six to eight boxes in a row and could not ask effort,
     * permission mode, project, working folder or priority — the dimensions
     * that decide what an unattended run DOES. A schedule is a task that has
     * not happened yet, so it could say strictly less about itself than the
     * thing it produces.
     *
     * One composer, five kinds. The shared block (agent · prompt · title · mode
     * · model · effort · permissions · project · CLI · folder · priority) is
     * written once and every kind that runs something gets it; the kind-specific
     * block sits under it. `agentfarm.addSchedule` and friends no longer open a
     * dialog — they open THIS, so the palette, the sidebar + and the page all
     * produce the same object.
     */
    let composer = null;      // null = closed; an object = the draft
    let composerMsg = '';     // a refusal or a confirmation, shown in the card
    let composerDup = false;  // the host says an identical task is already queued
    let stepMsg = '';         // a step's own refusal, shown inside the step card
    /**
     * ‼️ A PICKER THAT IS A LIST ON THE PAGE.
     *
     * "Which month of task history?" was a quickpick over the editor — a
     * floating list with no context, drawn on top of the very page that is
     * about task history. The same rows, on the page, keep their surroundings.
     * `{ tab, title, lede, act, items:[{id,label,detail}], empty }`.
     */
    let chooser = null;

    /** Which kinds carry the shared run block, and which tab they belong to. */
    const COMPOSE = {
        task: { tab: 'run', label: 'task', runs: true },
        schedule: { tab: 'plan', label: 'schedule', runs: true },
        trigger: { tab: 'plan', label: 'trigger', runs: true },
        template: { tab: 'plan', label: 'template', runs: true },
        workflow: { tab: 'plan', label: 'workflow', runs: false }
    };

    /** The guard (`fireIf`) kinds, in the automation module's own vocabulary. */
    const GUARDS = [
        { id: '', label: '— none: it fires every time —' },
        { id: 'folderHasFiles', label: 'a folder holds files' },
        { id: 'fileMissing', label: 'a file is missing' },
        { id: 'pathChangedWithin', label: 'a path changed recently' },
        { id: 'queueHasWork', label: 'the work queue has items' }
    ];
    const HOOK_EVENTS = [
        { id: 'stop', label: 'stop — an agent finished its turn' },
        { id: 'end', label: 'end — a session ended' },
        { id: 'permission', label: 'permission — an agent is waiting' },
        { id: 'compact', label: 'compact — a session compacted' },
        { id: 'subagent', label: 'subagent — a subagent finished' }
    ];

    /**
     * ‼️ THE SIX SHAPES A STEP CAN TAKE — and the reason a workflow could not be
     * a form until now.
     *
     * A step is not always "an agent runs a prompt". It can call an HTTP
     * endpoint, render an asset on fal.ai, drive a browser, or stop the chain
     * and wait for a person. The builder knew all six; it asked them as a
     * 294-line quickpick tree in which the shape was decided by the FIRST
     * question and every later one depended on it — the exact case a form with
     * a kind picker answers better than a wizard, because you can change your
     * mind on step three without starting over.
     */
    const STEP_KINDS = [
        { id: 'agent', icon: '🤖', label: 'agent — it runs a prompt' },
        { id: 'webhook', icon: '🌐', label: 'webhook — an HTTP call, no agent' },
        { id: 'media', icon: '🎬', label: 'media — fal.ai / Replicate render' },
        { id: 'browser', icon: '🧭', label: 'browser — an agent drives a site' },
        { id: 'approval', icon: '✋', label: 'approval — the chain waits for you' },
        { id: 'select', icon: '🖼', label: 'select — you keep some of the assets' }
    ];
    const PREV = '{prev_output}';

    /** A step draft, in the FORM's flat vocabulary. The translation into a real
     *  WorkflowStep lives next to the manager that owns the shape (tasksPanel). */
    function newStep(seed) {
        const d = Object.assign({
            stype: 'agent', title: '', agent: '', prompt: '', smode: 'headless',
            onFail: 'stop', onFailStep: 1, runIf: '', contract: 'text',
            verifyCriteria: '', verifyRetries: 1, parallel: false,
            whUrl: '', whMethod: 'POST', whBody: '', whHeader: '',
            whPoll: false, whPollUrl: '', whStatusField: 'status',
            whDone: 'succeeded|completed|complete|done|success', whInterval: 3,
            mModel: 'fal-ai/flux/schnell', mInput: '{"prompt": "{prev_text}"}', mScene: '',
            bUrl: '', bGoal: '', bHosts: '',
            apMsg: '', selMsg: '', selMin: 1, selMax: 0
        }, seed || {});
        // A webhook or media step carries no real agent, so switching one to
        // "agent" would land on an empty picker that LOOKS filled — the select
        // draws the first name whatever the draft says.
        if (!d.agent) { d.agent = (DATA.agents || [])[0] || ''; }
        return d;
    }

    function newDraft(kind, seed) {
        const L = DATA.launch || {};
        const d = L.defaults || {};
        const base = {
            kind: kind || 'task', mode2: 'new', id: '',
            agent: (DATA.agents || [])[0] || '',
            title: '', prompt: '', mode: 'headless',
            // The launcher's own defaults are the starting point, exactly as
            // they would be for a session started by hand.
            model: d.model || '', effort: d.effort || '', permissionMode: d.permissionMode || '',
            cli: '', workDir: '', priority: 0,
            // ‼️ A TASK OPENS ON THE WINDOW'S PROJECT; AN AUTOMATION DOES NOT.
            // A task made here is made by a person who is looking at a project.
            // A schedule fires at 03:00 with nobody looking, so its project is
            // only ever the one it DECLARES (core/tasks.ts RunDimensions).
            project: kind && kind !== 'task' ? '' : (L.activeProjectId || ''),
            start: true,
            // Set when the form was opened as "run that one again, but…": the
            // host turns it into a retry of THAT task (its lineage, its attempt
            // number) rather than an unrelated new one.
            retryOf: '',
            // schedule
            every: 'daily', time: '09:00', dow: 1, onceAt: '', missed: 'skip', enabled: true,
            // trigger
            ttype: 'watch', watchPath: '', hookEvent: 'stop', hookAgent: '', token: '',
            act: 'task', workflowId: '',
            debounceSec: 5, cooldownSec: 60, maxPerHour: 12,
            // guard — shared by schedule and trigger
            guardKind: '', guardPath: '', guardExcept: '', guardMin: 1, guardHours: 24, guardRecursive: true,
            // workflow: the chain itself lives in the draft, so Cancel really
            // cancels — a step added here is not written to the stored workflow
            // until the whole form is saved.
            steps: [], stepIdx: null, step: null
        };
        const draft = Object.assign(base, seed || {});
        if (!Array.isArray(draft.steps)) { draft.steps = []; }
        // `agentfarm.addWorkflowStep` / `editWorkflowStep` arrive with the card
        // already asked for; a card with nothing in it has nothing to read.
        if (draft.stepIdx === undefined) { draft.stepIdx = null; }
        if (draft.step) { draft.step = newStep(draft.step); }
        else if (draft.stepIdx !== null) {
            // An index on its own is enough: "edit step 3" means the step that
            // is already in the chain, not a blank one over the top of it.
            draft.step = newStep(draft.stepIdx >= 0 ? draft.steps[draft.stepIdx] : null);
        }
        return draft;
    }

    function openComposer(seed, kind) {
        const k = kind || (seed && seed.kind) || 'task';
        composer = newDraft(k, seed);
        composerMsg = '';
        composerDup = false;
        stepMsg = '';
        tab = (COMPOSE[k] || COMPOSE.task).tab;
        persist();
        render();
        const box = document.getElementById('nt-prompt') || document.getElementById('nt-title');
        if (box) { box.focus(); }
    }

    function closeComposer(msg) {
        composer = null;
        composerDup = false;
        stepMsg = '';
        composerMsg = msg || '';
        render();
    }

    /** One <select>, from a launch.ts choice list. `id:''` is always "leave it
     *  alone", and it is spelled out rather than shown as an empty row. */
    function choiceSel(id, label, list, value, title) {
        const opts = (list || []).map(c =>
            `<option value="${C.esc(c.id)}"${c.id === value ? ' selected' : ''}>${C.esc(c.label)}${c.id ? '' : ''}</option>`).join('');
        return `<label class="ntf" title="${C.esc(title || '')}"><span>${C.esc(label)}</span>
            <select id="nt-${id}">${opts}</select></label>`;
    }

    /** A plain <select> over `{id,label}` rows — the kind-specific fields. */
    function pickSel(id, label, list, value, title) {
        const opts = list.map(o =>
            `<option value="${C.esc(o.id)}"${o.id === value ? ' selected' : ''}>${C.esc(o.label)}</option>`).join('');
        return `<label class="ntf" title="${C.esc(title || '')}"><span>${C.esc(label)}</span>
            <select id="nt-${id}">${opts}</select></label>`;
    }
    function textF(id, label, value, ph, title, wide) {
        return `<label class="ntf${wide ? ' wide' : ''}" title="${C.esc(title || '')}"><span>${C.esc(label)}</span>
            <input type="text" id="nt-${id}" value="${C.esc(value == null ? '' : String(value))}" placeholder="${C.esc(ph || '')}"></label>`;
    }
    function numF(id, label, value, title) {
        return `<label class="ntf" title="${C.esc(title || '')}"><span>${C.esc(label)}</span>
            <input type="number" id="nt-${id}" step="1" value="${C.esc(String(value == null ? '' : value))}"></label>`;
    }

    /** The guard — the one brake that is evaluated for FREE, before anything
     *  wakes a model. It is the same object on a schedule and on a trigger, so
     *  it is drawn once. */
    function guardHtml(c) {
        const needsPath = c.guardKind && c.guardKind !== 'queueHasWork';
        return `<div class="ntsec"><b>Fires only if…</b>
            <span class="muted small">A guard is checked before any agent is woken, and costs nothing.
                Without one, every wake-up is paid whether or not there was work.</span></div>
            <div class="ntgrid">
                ${pickSel('guardKind', 'Guard', GUARDS, c.guardKind, 'What has to be true for this to fire at all.')}
                ${needsPath ? textF('guardPath', 'Path', c.guardPath, 'D:/…  — {today} and {yesterday} are expanded',
            'The folder or file the guard looks at. {today} / {yesterday} become YYYY-MM-DD.', true) : ''}
                ${c.guardKind === 'folderHasFiles'
                ? textF('guardExcept', 'Ignore these names', c.guardExcept, '_LOG_.md, .gitkeep',
                    'File names that do not count as work — comma separated.', true)
                + `<label class="cbx" title="Look into sub-folders too."><input type="checkbox" id="nt-guardRecursive"${c.guardRecursive ? ' checked' : ''}> include sub-folders</label>`
                : ''}
                ${c.guardKind === 'pathChangedWithin' ? numF('guardHours', 'Within (hours)', c.guardHours, 'How recently the path must have changed.') : ''}
                ${c.guardKind && c.guardKind !== 'fileMissing' && c.guardKind !== 'pathChangedWithin'
                ? numF('guardMin', 'At least', c.guardMin, 'How many hits are needed before it counts as work.') : ''}
            </div>`;
    }

    function scheduleHtml(c) {
        return `<div class="ntsec"><b>When</b></div>
            <div class="ntgrid">
                ${pickSel('every', 'How often', [
            { id: 'daily', label: 'daily' }, { id: 'weekly', label: 'weekly' }, { id: 'once', label: 'once' }
        ], c.every, 'A schedule fires while VS Code is open; what happens to a missed time is the next field.')}
                ${c.every === 'once'
                ? `<label class="ntf" title="The single moment it fires."><span>At</span>
                        <input type="datetime-local" id="nt-onceAt" value="${C.esc(c.onceAt)}"></label>`
                : `<label class="ntf" title="Local time, 24h."><span>Time of day</span>
                        <input type="time" id="nt-time" value="${C.esc(c.time)}"></label>`}
                ${c.every === 'weekly' ? pickSel('dow', 'Day', [
            { id: '0', label: 'Sunday' }, { id: '1', label: 'Monday' }, { id: '2', label: 'Tuesday' },
            { id: '3', label: 'Wednesday' }, { id: '4', label: 'Thursday' }, { id: '5', label: 'Friday' },
            { id: '6', label: 'Saturday' }
        ], String(c.dow), 'Which day of the week.') : ''}
                ${c.every !== 'once' ? pickSel('missed', 'If the time is missed', [
            { id: 'skip', label: 'skip it — that occurrence is lost' },
            { id: 'run', label: 'run it at the first opportunity' },
            { id: 'ask', label: 'ask me, with Run / Skip' }
        ], c.missed, 'What happens when the time passes with no VS Code window open.') : ''}
            </div>
            ${guardHtml(c)}`;
    }

    function triggerHtml(c) {
        const wfOpts = (DATA.workflows || []).map(w => ({ id: w.id, label: `${w.title} — ${w.steps} step(s)` }));
        return `<div class="ntsec"><b>What fires it</b></div>
            <div class="ntgrid">
                ${pickSel('ttype', 'Source', [
            { id: 'watch', label: 'watch — a file or folder changes' },
            { id: 'hook', label: 'hook — a live event (needs Live Hooks)' },
            { id: 'webhook', label: 'webhook — something POSTs to a local URL' }
        ], c.ttype, 'Where the firing comes from.')}
                ${c.ttype === 'watch' ? textF('watchPath', 'Watched path', c.watchPath, 'D:/…  a file or a folder',
            'Any change inside fires it — which is why the guard below matters.', true) : ''}
                ${c.ttype === 'hook' ? pickSel('hookEvent', 'Event', HOOK_EVENTS, c.hookEvent, 'Which live event fires it.') : ''}
                ${c.ttype === 'hook' ? pickSel('hookAgent', 'Only for', [{ id: '', label: 'any agent' }]
            .concat((DATA.agents || []).map(a => ({ id: a, label: a }))), c.hookAgent, 'Limit it to one agent, or leave it open.') : ''}
                ${c.ttype === 'webhook' ? textF('token', 'URL token', c.token, '(generated when you save)',
                'POST to http://127.0.0.1:&lt;port&gt;/trigger/&lt;token&gt;. Leave empty and one is made for you.', true) : ''}
            </div>
            <div class="ntsec"><b>What it does</b></div>
            <div class="ntgrid">
                ${pickSel('act', 'Action', [
                    { id: 'task', label: 'run a task on an agent you pick' },
                    { id: 'dispatch', label: 'dispatch — route to the best agent per firing' }
                ].concat(wfOpts.length ? [{ id: 'workflow', label: 'run a workflow' }] : []),
                    c.act, 'What happens when it fires.')}
                ${c.act === 'workflow' ? pickSel('workflowId', 'Workflow', wfOpts, c.workflowId, 'Which chain runs.') : ''}
            </div>
            <div class="ntsec"><b>Brakes</b>
                <span class="muted small">Frequency brakes. They cap how often it can fire; the guard above caps
                    WHETHER it should.</span></div>
            <div class="ntgrid">
                ${numF('debounceSec', 'Debounce (s)', c.debounceSec, 'Wait this long after the last change before firing — a save storm is one firing.')}
                ${numF('cooldownSec', 'Cooldown (s)', c.cooldownSec, 'Minimum gap between two firings.')}
                ${numF('maxPerHour', 'Max per hour', c.maxPerHour, 'Hard ceiling on firings in a rolling hour.')}
            </div>
            ${guardHtml(c)}`;
    }

    // ------------------------------------------------ WORKFLOW: the chain (Faz 2)
    /**
     * ‼️ A WORKFLOW WAS THE LAST OBJECT YOU COULD NOT SEE WHILE YOU BUILT IT.
     *
     * `newWorkflow` was a 294-line chain of boxes that asked for one step, then
     * offered to ask for another — with no list of what you had already said,
     * no way back to step 2, and Esc discarding the lot. `addWorkflowStep`
     * appended a step of the poorest kind it knew (agent · title · prompt ·
     * mode, and nothing else the model carries), and `editWorkflowStep` was a
     * quickpick of FIELD NAMES: pick "On fail", answer one question, start over
     * for the next field.
     *
     * Here the chain is a list you can read, reorder and edit in place, and one
     * step is one card with everything that step actually is.
     */
    function trunc(s, n) {
        const t = String(s == null ? '' : s);
        return t.length > n ? t.slice(0, n - 1) + '…' : t;
    }

    /** The one line a step reads as in the list — what it is, then what is odd
     *  about it. The flags are the fields a reader would otherwise have to open
     *  the card to find out about. */
    function stepSummary(s) {
        const k = STEP_KINDS.find(x => x.id === s.stype) || STEP_KINDS[0];
        const who = s.stype === 'webhook' ? (s.whMethod || 'POST') + ' ' + trunc(s.whUrl || '(no url)', 44)
            : s.stype === 'media' ? (s.mModel || '(no model)')
                : s.stype === 'browser' ? (s.agent || '?') + ' → ' + trunc(s.bUrl || '(no url)', 34)
                    : s.stype === 'approval' ? 'the chain waits for you'
                        : s.stype === 'select' ? 'keep ' + (s.selMin || 1) + (s.selMax ? '–' + s.selMax : ' or more')
                            : (s.agent || '(no agent)') + ' · ' + (s.smode || 'headless');
        const flags = [];
        if (s.parallel) { flags.push('∥ runs in parallel'); }
        if (s.runIf) { flags.push('only if ' + trunc(s.runIf, 24)); }
        if (s.onFail === 'continue') { flags.push('on fail: carry on'); }
        if (s.onFail === 'goto') { flags.push('on fail → step ' + (s.onFailStep || 1)); }
        if (s.contract === 'json') { flags.push('json handoff'); }
        if (String(s.verifyCriteria || '').trim()) { flags.push('checked by a judge'); }
        return { icon: k.icon, hint: k.label, who: who, flags: flags };
    }

    function workflowHtml(c) {
        const last = c.steps.length - 1;
        const list = c.steps.map((s, i) => {
            const d = stepSummary(s);
            return `<li class="wfstep${c.stepIdx === i ? ' on' : ''}">
                <span class="wfsi" title="${C.esc(d.hint)}">${d.icon}</span>
                <span class="wfst"><b>${C.esc(s.title || '(untitled step)')}</b>
                    <span class="muted small">${C.esc(d.who)}${d.flags.length ? ' · ' + C.esc(d.flags.join(' · ')) : ''}</span></span>
                <span class="wfsa">
                    <button class="mini secondary" data-st="up" data-i="${i}"${i === 0 ? ' disabled' : ''} title="move it up">↑</button>
                    <button class="mini secondary" data-st="down" data-i="${i}"${i === last ? ' disabled' : ''} title="move it down">↓</button>
                    <button class="mini secondary" data-st="edit" data-i="${i}" title="edit this step">edit</button>
                    <button class="mini secondary" data-st="dup" data-i="${i}" title="add a copy of it below">copy</button>
                    <button class="mini secondary" data-st="del" data-i="${i}" title="remove this step">✕</button>
                </span></li>`;
        }).join('');
        return `<div class="ntsec"><b>Steps</b>
            <span class="muted small">Each step runs after the one above and is handed its output —
                <code>${PREV}</code> in a prompt inserts the previous step's output file,
                <code>{prev_text}</code> its text and <code>{prev_json.x}</code> a field of it.</span></div>
            ${c.steps.length
                ? `<ol class="wfsteps">${list}</ol>`
                : '<div class="ntmsg">No steps yet. A workflow with none is saved, but running it does nothing.</div>'}
            ${c.stepIdx === null
                ? '<div class="ctl-row"><button class="secondary" id="nt-stadd">+ Add a step</button></div>'
                : stepCardHtml(c)}`;
    }

    function stepCardHtml(c) {
        const s = c.step || newStep();
        const isNew = c.stepIdx === -1;
        const n = isNew ? c.steps.length + 1 : c.stepIdx + 1;
        const agentOpts = (DATA.agents || []).map(a =>
            `<option value="${C.esc(a)}"${a === s.agent ? ' selected' : ''}>${C.esc(a)}</option>`).join('');
        const wantsAgent = s.stype === 'agent' || s.stype === 'browser';
        const wantsVerify = s.stype === 'agent' || s.stype === 'media';
        const scenes = DATA.scenes || [];
        const stepOpts = c.steps.map((x, i) => ({ id: String(i + 1), label: (i + 1) + '. ' + trunc(x.title || 'step', 30) }));
        if (isNew) { stepOpts.push({ id: String(n), label: n + '. (this one)' }); }
        return `<div class="stbox" id="stbox">
            <div class="ctl-row">
                <span class="ctl-title">${isNew ? 'New step' : 'Step ' + n}</span>
                <span class="muted small">A step is one link of the chain. What it IS decides the rest of this card.</span>
            </div>
            <div class="ntgrid">
                ${pickSel('st-stype', 'This step is…', STEP_KINDS.map(k => ({ id: k.id, label: k.label })), s.stype,
            'A chain is not only agents: it can call an API, render an asset, drive a site, or stop and ask you.')}
                ${textF('st-title', 'Step title', s.title, 'What is this link called?',
                'The name the run is given when this step fires — it is what you will look for on the Runs tab.', true)}
                ${wantsAgent ? `<label class="ntf" title="Whose folder it runs in, and whose CLAUDE.md it wakes up with."><span>Agent <em>required</em></span>
                    <select id="nt-st-agent">${agentOpts}</select></label>` : ''}
                ${s.stype === 'agent' ? `<label class="ntf" title="Headless is the mode a chain normally runs in: the output is archived and handed to the next step."><span>Mode</span>
                    <select id="nt-st-smode">
                        <option value="headless"${s.smode === 'headless' ? ' selected' : ''}>headless — runs and exits</option>
                        <option value="interactive"${s.smode === 'interactive' ? ' selected' : ''}>interactive — opens a session</option>
                    </select></label>` : ''}
            </div>
            ${s.stype === 'agent' ? `<div class="ntgrid">
                <label class="ntf wide"><span>Prompt <em>required</em></span>
                    <textarea id="nt-st-prompt" rows="3"
                        placeholder="What should this step do? ${PREV} inserts the previous step's output file.">${C.esc(s.prompt)}</textarea></label>
            </div>` : ''}
            ${s.stype === 'webhook' ? `<div class="ntgrid">
                ${textF('st-whUrl', 'URL', s.whUrl, 'https://n8n.example.com/webhook/…',
                '{secret:NAME} and the {prev_*} variables are substituted before the call.', true)}
                ${pickSel('st-whMethod', 'Method', [{ id: 'POST', label: 'POST' }, { id: 'GET', label: 'GET' }], s.whMethod, 'How it is called.')}
                ${s.whMethod !== 'GET'
                ? textF('st-whBody', 'JSON body', s.whBody, '{"text": "{prev_text}"}', 'Empty = no body.', true) : ''}
                ${textF('st-whHeader', 'Auth header', s.whHeader, 'Authorization: Bearer {secret:MY_TOKEN}',
                    'One "Name: Value" header — this is where a queued API\'s key goes.', true)}
                <label class="cbx" title="Submit, then poll a status URL until it says done — how every queued API works."><input type="checkbox" id="nt-st-whPoll"${s.whPoll ? ' checked' : ''}> poll until it is done</label>
            </div>
            ${s.whPoll ? `<div class="ntgrid">
                ${textF('st-whPollUrl', 'Poll URL field', s.whPollUrl, 'urls.get · status_url · name',
                        'The JSON path IN THE SUBMIT RESPONSE that holds the URL to poll.')}
                ${textF('st-whStatusField', 'Status field', s.whStatusField, 'status', 'The JSON path to the status in each poll response.')}
                ${textF('st-whDone', 'Done when status matches', s.whDone, '', 'A regex. Anything matching it means the job finished.', true)}
                ${numF('st-whInterval', 'Poll every (s)', s.whInterval, 'Seconds between polls.')}
            </div>` : ''}` : ''}
            ${s.stype === 'media' ? `<div class="ntgrid">
                ${textF('st-mModel', 'Model', s.mModel, 'fal-ai/flux/schnell · replicate:owner/name',
                    'fal.ai by default; prefix with "replicate:" for Replicate.', true)}
                ${textF('st-mInput', 'JSON input', s.mInput, '{"prompt": "{prev_text}"}',
                        'The provider\'s own input object. {prev_text} / {prev_json.x} / {secret:NAME} are substituted.', true)}
                ${scenes.length ? pickSel('st-mScene', 'Production scene',
                            [{ id: '', label: '— no scene —' }].concat(scenes.map(x => ({ id: x.id, label: x.label }))), s.mScene,
                            'Ties the produced assets to a scene so the gallery groups them.') : ''}
            </div>` : ''}
            ${s.stype === 'browser' ? `<div class="ntgrid">
                ${textF('st-bUrl', 'Start URL', s.bUrl, 'https://example.com/reports',
                                '{prev_text} / {prev_json.x} are substituted.', true)}
                ${textF('st-bGoal', 'Goal', s.bGoal, 'find the latest report and extract the numbers',
                                    'What the agent is trying to achieve on the site.', true)}
                ${textF('st-bHosts', 'Allowed hosts', s.bHosts, 'example.com, cdn.example.com',
                                        '‼️ The agent may not leave these domains. Empty = the global agentFarm.browserAllowHosts list.', true)}
            </div>` : ''}
            ${s.stype === 'approval' ? `<div class="ntgrid">
                ${textF('st-apMsg', 'Message', s.apMsg, 'Review the output before it goes live',
                                            'Shown when the chain stops to ask you. {prev_text} is substituted.', true)}
            </div>` : ''}
            ${s.stype === 'select' ? `<div class="ntgrid">
                ${textF('st-selMsg', 'Message', s.selMsg, 'Pick the frames that go on to video',
                                                'Shown above the gallery picker. {prev_text} is substituted.', true)}
                ${numF('st-selMin', 'Keep at least', s.selMin, 'The fewest assets you may pick.')}
                ${numF('st-selMax', 'Keep at most', s.selMax, '0 = no ceiling.')}
            </div>` : ''}
            <div class="ntsec"><b>How it behaves in the chain</b>
                <span class="muted small">These are the same on every kind of step — they are about the CHAIN,
                    not about what this step does.</span></div>
            <div class="ntgrid">
                ${pickSel('st-onFail', 'If it fails', [
                                                    { id: 'stop', label: 'stop the workflow (default)' },
                                                    { id: 'continue', label: 'carry on to the next step' },
                                                    { id: 'goto', label: 'jump to a step…' }
                                                ], s.onFail, 'A failing step stops the chain unless you say otherwise.')}
                ${s.onFail === 'goto' ? pickSel('st-onFailStep', 'Jump to', stepOpts.length ? stepOpts : [{ id: '1', label: '1' }],
                                                    String(s.onFailStep || 1), 'Which step it jumps to — 1-based.') : ''}
                ${n > 1 ? textF('st-runIf', 'Run only if', s.runIf, 'regex  ·  json:field.path~regex',
                                                        'Checked against the previous step\'s output. Empty = it always runs.', true) : ''}
                ${s.stype === 'agent' && s.smode === 'headless'
                ? pickSel('st-contract', 'Output', [
                    { id: 'text', label: 'text (default)' },
                    { id: 'json', label: 'json — the next step can use {prev_json.field}' }
                ], s.contract, 'A json contract runs it with --output-format json and parses the result.') : ''}
                ${n > 1 ? `<label class="cbx" title="Adjacent parallel steps form one group; the step after the group receives all their outputs merged."><input type="checkbox" id="nt-st-parallel"${s.parallel ? ' checked' : ''}> runs in parallel with the steps next to it</label>` : ''}
            </div>
            ${wantsVerify ? `<div class="ntgrid">
                ${textF('st-verifyCriteria', s.stype === 'media' ? 'Vision QA criteria' : 'Verify the output',
                    s.verifyCriteria,
                    s.stype === 'media' ? 'a single person, clear face, no six fingers' : 'the output holds a plan with at least 3 items',
                    s.stype === 'media'
                        ? 'A vision model looks at the asset; FAIL regenerates it with the feedback. Empty = no check.'
                        : 'A cheap model judges the output; FAIL retries the step with the feedback. Empty = no check.', true)}
                ${String(s.verifyCriteria || '').trim() ? numF('st-verifyRetries', 'Attempts on FAIL', s.verifyRetries, 'How many times it is redone before the step gives up.') : ''}
            </div>` : ''}
            ${stepMsg ? `<div class="ntmsg warn">${C.esc(stepMsg)}</div>` : ''}
            <div class="ctl-row">
                <span class="spacer"></span>
                <button id="nt-stsave">${isNew ? 'Add this step' : 'Keep the changes'}</button>
                <button class="secondary" id="nt-stcancel">Discard</button>
            </div>
        </div>`;
    }

    function readStep() {
        if (!composer || !composer.step) { return; }
        const s = composer.step;
        const g = (id) => document.getElementById('nt-st-' + id);
        const v = (id) => { const el = g(id); if (el && el.value != null) { s[id] = String(el.value); } };
        const n = (id) => { const el = g(id); if (el) { s[id] = Number(el.value) || 0; } };
        const b = (id) => { const el = g(id); if (el) { s[id] = !!el.checked; } };
        ['stype', 'title', 'agent', 'prompt', 'smode', 'onFail', 'runIf', 'contract', 'verifyCriteria',
            'whUrl', 'whMethod', 'whBody', 'whHeader', 'whPollUrl', 'whStatusField', 'whDone',
            'mModel', 'mInput', 'mScene', 'bUrl', 'bGoal', 'bHosts', 'apMsg', 'selMsg'].forEach(v);
        ['onFailStep', 'verifyRetries', 'whInterval', 'selMin', 'selMax'].forEach(n);
        ['parallel', 'whPoll'].forEach(b);
    }

    /** What a step cannot be saved without — said inside the step card. */
    function stepError(s) {
        if (!String(s.title || '').trim()) {
            return 'A step needs a title — it is what its run is called on the Runs tab.';
        }
        if (s.stype === 'agent') {
            if (!s.agent) { return 'Pick the agent this step runs on.'; }
            if (!String(s.prompt || '').trim()) { return 'An agent step needs a prompt — it is the thing being asked.'; }
        }
        if (s.stype === 'webhook') {
            if (!String(s.whUrl || '').trim()) { return 'A webhook step needs the URL it calls.'; }
            if (s.whPoll && !String(s.whPollUrl || '').trim()) {
                return 'Polling needs the field in the submit response that holds the poll URL.';
            }
        }
        if (s.stype === 'media') {
            if (!String(s.mModel || '').trim()) { return 'A media step needs a model id.'; }
            if (!String(s.mInput || '').trim()) { return 'A media step needs its JSON input.'; }
        }
        if (s.stype === 'browser') {
            if (!s.agent) { return 'Pick the agent that drives the browser.'; }
            if (!String(s.bUrl || '').trim()) { return 'A browser step needs a start URL.'; }
            if (!String(s.bGoal || '').trim()) { return 'A browser step needs a goal — what it is trying to do there.'; }
        }
        if (s.stype === 'select' && s.selMax && s.selMax < (s.selMin || 1)) {
            return 'The most you may keep cannot be fewer than the least.';
        }
        return '';
    }

    /** Fold the open step card back into the chain. Returns false when it
     *  refused, so the caller can stop rather than save half a thought. */
    function commitStep() {
        if (!composer || composer.stepIdx === null) { return true; }
        readStep();
        const err = stepError(composer.step);
        if (err) { stepMsg = err; render(); return false; }
        const s = Object.assign({}, composer.step);
        if (composer.stepIdx === -1) { composer.steps.push(s); }
        else { composer.steps[composer.stepIdx] = s; }
        composer.stepIdx = null;
        composer.step = null;
        stepMsg = '';
        return true;
    }

    function chooserHtml() {
        const ch = chooser;
        return `<div class="ntbox" id="chbox">
            <div class="ctl-row">
                <span class="ctl-title">${C.esc(ch.title || 'Pick one')}</span>
                <span class="muted small">${C.esc(ch.lede || '')}</span>
                <span class="spacer"></span>
                <button class="secondary mini" id="ch-close">✕</button>
            </div>
            ${(ch.items || []).length
                ? `<ul class="chlist">${ch.items.map(i => `<li>
                    <button class="mini" data-ch="${C.esc(i.id)}">${C.esc(ch.verb || 'open')}</button>
                    <b>${C.esc(i.label)}</b>${i.detail ? ` <span class="muted small">${C.esc(i.detail)}</span>` : ''}
                </li>`).join('')}</ul>`
                : `<div class="ntmsg">${C.esc(ch.empty || 'Nothing here yet.')}</div>`}
        </div>`;
    }

    function composerHtml() {
        if (!composer) { return ''; }
        const L = DATA.launch || {};
        const c = composer;
        const spec = COMPOSE[c.kind] || COMPOSE.task;
        const editing = c.mode2 === 'edit';
        const retry = c.mode2 === 'retry';
        // A trigger that runs a workflow has no agent, no prompt and no run
        // dimensions of its own — the workflow's steps carry all of that.
        const wantsRun = spec.runs && !(c.kind === 'trigger' && c.act === 'workflow');
        const wantsAgent = wantsRun && !(c.kind === 'trigger' && c.act === 'dispatch');
        // ‼️ A TEMPLATE MAY BE UNBOUND. The quickpick this replaced asked
        // "bind to X / any agent (choose at run time)" as its FIRST question;
        // here it is one more entry in the same picker every other kind uses.
        const anyAgent = c.kind === 'template';
        const agentOpts = (anyAgent
            ? ['<option value=""' + (c.agent ? '' : ' selected') + '>— any agent: you pick when you launch it —</option>']
            : [])
            .concat((DATA.agents || []).map(a =>
                `<option value="${C.esc(a)}"${a === c.agent ? ' selected' : ''}>${C.esc(a)}</option>`))
            .join('');
        const projOpts = ['<option value=""' + (c.project ? '' : ' selected') + '>— no project —</option>']
            .concat((L.projects || []).map(p =>
                `<option value="${C.esc(p.id)}"${p.id === c.project ? ' selected' : ''}>${p.icon ? C.esc(p.icon) + ' ' : ''}${C.esc(p.name)}</option>`))
            .join('');
        const cliOpts = ['<option value=""' + (c.cli ? '' : ' selected') + '>claude — the default executor</option>']
            .concat((L.clis || []).map(p =>
                `<option value="${C.esc(p.name)}"${p.name === c.cli ? ' selected' : ''}>${C.esc(p.name)}</option>`))
            .join('');
        const LEDE = {
            task: 'A task is one claude run. Everything except the agent and the prompt is optional — an empty field means no flag, and the agent\'s own settings stay in charge.',
            schedule: 'A schedule is a task that has not happened yet: it runs on its own at a set time, so it takes every dimension a task takes — and a guard, so it does not wake an agent for nothing.',
            trigger: 'A trigger runs when something happens. The brakes cap how OFTEN it fires; the guard caps WHETHER it should fire at all.',
            template: 'A template is a saved prompt you launch by hand. It carries an agent and a mode so launching it is one click, not a form.',
            workflow: 'A workflow is a chain: each step is handed the previous one\'s output. A step is not always an agent — it can call an API, render an asset, drive a browser, or stop and ask you.'
        };
        return `<div class="ntbox" id="ntbox">
            <div class="ctl-row">
                <span class="ctl-title">${retry ? 'Retry' : editing ? 'Edit' : 'New'} ${C.esc(spec.label)}</span>
                <span class="muted small">${C.esc(retry
                ? 'A retry is the original run again, and every field below is yours to change first — that is what “run it again on opus” means. It keeps the original\'s lineage and is queued as “… (retry N)”.'
                : (LEDE[c.kind] || ''))}</span>
                <span class="spacer"></span>
                <button class="secondary mini" id="nt-close">✕</button>
            </div>
            <div class="ntgrid">
                ${wantsRun ? `<label class="ntf wide"><span>Prompt <em>required</em></span>
                    <textarea id="nt-prompt" rows="4"
                        placeholder="What should the agent do? Ctrl+Enter saves it.">${C.esc(c.prompt)}</textarea></label>` : ''}
                <label class="ntf wide"><span>${c.kind === 'task' ? 'Title' : 'Name'}${c.kind === 'task' ? '' : ' <em>required</em>'}</span>
                    <input type="text" id="nt-title" value="${C.esc(c.title)}"
                        placeholder="${c.kind === 'task' ? '(optional — the prompt\'s first line otherwise)' : 'What is this called?'}"></label>
                ${wantsAgent ? `<label class="ntf" title="Whose folder it runs in, and whose CLAUDE.md it wakes up with."><span>Agent${anyAgent ? '' : ' <em>required</em>'}</span>
                    <select id="nt-agent">${agentOpts}</select></label>` : ''}
                ${wantsRun ? `<label class="ntf" title="Headless is claude -p: it runs the prompt, writes its output to an archived file and exits — the mode an unattended run is normally in. Interactive opens a real session in a terminal with the prompt already sent."><span>Mode</span>
                    <select id="nt-mode">
                        <option value="headless"${c.mode === 'headless' ? ' selected' : ''}>headless — runs and exits</option>
                        <option value="interactive"${c.mode === 'interactive' ? ' selected' : ''}>interactive — opens a session</option>
                    </select></label>` : ''}
                ${wantsRun && c.kind !== 'template' ? `
                ${choiceSel('model', 'Model', L.models, c.model,
            'Which model runs it — from your own agentFarm.modelAliases list. Beats the model-policy rules in Farm Settings.')}
                ${choiceSel('effort', 'Effort', L.efforts, c.effort,
                'How much reasoning per turn. Mechanical work does not need the expensive end — and a run nobody is watching is exactly where that choice is worth making.')}
                ${choiceSel('permissionMode', 'Permissions', L.permissions, c.permissionMode,
                    'What it may do without asking. ‼️ Nobody is sitting in front of an unattended run: one that stops to ask waits until you notice it, and one on bypassPermissions does not stop at all.')}
                <label class="ntf" title="${c.kind === 'task'
                        ? 'The project this task belongs to. Recorded when it is CREATED, not when it runs — a queued task can sit for hours, and by the time it starts the window may be showing something else entirely.'
                        : 'The project its runs belong to. An automation fires with nobody looking at a window, so it has no project unless you declare one here.'}"><span>Project</span>
                    <select id="nt-project">${projOpts}</select></label>
                ${(L.clis || []).length ? `<label class="ntf" title="A named CLI profile from agentFarm.cliProfiles. A non-claude executor is not monitored the way claude is — its output is archived and that is all."><span>CLI</span>
                    <select id="nt-cli">${cliOpts}</select></label>` : ''}
                <label class="ntf" title="Higher runs sooner when the queue is full. It also ages up while waiting, so nothing starves."><span>Priority</span>
                    <input type="number" id="nt-priority" step="1" value="${C.esc(String(c.priority || 0))}"></label>
                <label class="ntf wide" title="Run it somewhere other than the agent's own folder — a worktree, a repo it is working on. Empty = the agent folder."><span>Working folder</span>
                    <input type="text" id="nt-workdir" value="${C.esc(c.workDir)}" placeholder="(optional) — defaults to the agent's folder"></label>` : ''}
            </div>
            ${c.kind === 'schedule' ? scheduleHtml(c) : ''}
            ${c.kind === 'trigger' ? triggerHtml(c) : ''}
            ${c.kind === 'workflow' ? workflowHtml(c) : ''}
            ${composerMsg ? `<div class="ntmsg${composerDup ? ' warn' : ''}">${C.esc(composerMsg)}</div>` : ''}
            <div class="ctl-row">
                ${c.kind === 'task' ? `<label class="cbx" title="Off = it waits in the queue until you press start (or capacity frees up for something with a higher priority).">
                    <input type="checkbox" id="nt-start"${c.start ? ' checked' : ''}> start it now</label>` : ''}
                ${c.kind === 'schedule' || c.kind === 'trigger' ? `<label class="cbx" title="Off = it is saved but does not fire until you switch it on.">
                    <input type="checkbox" id="nt-enabled"${c.enabled ? ' checked' : ''}> switched on</label>` : ''}
                <span class="spacer"></span>
                ${composerDup ? '<button class="secondary" id="nt-force">Add it anyway</button>' : ''}
                <button id="nt-add">${c.kind === 'task'
                ? (retry
                    ? (c.start ? 'Retry it now' : 'Queue the retry')
                    : (c.start ? 'Add and start' : 'Add to the queue'))
                : (editing ? 'Save changes' : 'Create the ' + spec.label)}</button>
                <button class="secondary" id="nt-cancel">Cancel</button>
            </div>
        </div>`;
    }

    function readComposer() {
        if (!composer) { return; }
        const v = (id, key) => {
            const el = document.getElementById('nt-' + id);
            if (el && el.value != null) { composer[key] = String(el.value); }
        };
        const n = (id, key) => {
            const el = document.getElementById('nt-' + id);
            if (el) { composer[key] = Number(el.value) || 0; }
        };
        const b = (id, key) => {
            const el = document.getElementById('nt-' + id);
            if (el) { composer[key] = !!el.checked; }
        };
        v('prompt', 'prompt'); v('title', 'title'); v('agent', 'agent'); v('mode', 'mode');
        v('model', 'model'); v('effort', 'effort'); v('permissionMode', 'permissionMode');
        v('project', 'project'); v('cli', 'cli'); v('workdir', 'workDir');
        n('priority', 'priority');
        b('start', 'start'); b('enabled', 'enabled');
        // schedule
        v('every', 'every'); v('time', 'time'); v('onceAt', 'onceAt'); v('missed', 'missed');
        n('dow', 'dow');
        // trigger
        v('ttype', 'ttype'); v('watchPath', 'watchPath'); v('hookEvent', 'hookEvent');
        v('hookAgent', 'hookAgent'); v('token', 'token'); v('act', 'act'); v('workflowId', 'workflowId');
        n('debounceSec', 'debounceSec'); n('cooldownSec', 'cooldownSec'); n('maxPerHour', 'maxPerHour');
        // guard
        v('guardKind', 'guardKind'); v('guardPath', 'guardPath'); v('guardExcept', 'guardExcept');
        n('guardMin', 'guardMin'); n('guardHours', 'guardHours'); b('guardRecursive', 'guardRecursive');
    }

    /**
     * What the form refuses to send, and why it says so IN the form.
     *
     * A modal that steals focus from a half-filled form to tell you the form is
     * half-filled is the worst of both worlds — the message belongs where the
     * mistake is.
     */
    function composerError(c) {
        const spec = COMPOSE[c.kind] || COMPOSE.task;
        const wantsRun = spec.runs && !(c.kind === 'trigger' && c.act === 'workflow');
        if (c.kind !== 'task' && !String(c.title || '').trim()) {
            return 'A ' + spec.label + ' needs a name — it is how you find it on this page.';
        }
        if (wantsRun && !String(c.prompt || '').trim()) {
            return 'A ' + spec.label + ' needs a prompt — it is the thing the agent is asked to do.';
        }
        if (c.kind === 'schedule' && c.every === 'once' && !c.onceAt) {
            return 'A one-off schedule needs the moment it fires.';
        }
        if (c.kind === 'schedule' && c.every !== 'once' && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(String(c.time || ''))) {
            return 'The time of day has to read HH:MM, 24-hour.';
        }
        if (c.kind === 'trigger' && c.ttype === 'watch' && !String(c.watchPath || '').trim()) {
            return 'A watch trigger needs the path it watches.';
        }
        if (c.kind === 'trigger' && c.act === 'workflow' && !c.workflowId) {
            return 'Pick the workflow this trigger runs.';
        }
        if (c.guardKind && c.guardKind !== 'queueHasWork' && !String(c.guardPath || '').trim()) {
            return 'That guard looks at a path — say which one, or take the guard off.';
        }
        return '';
    }

    function submitComposer(force) {
        readComposer();
        // A step card left open is a thought half-typed, not a thought
        // abandoned: saving the workflow folds it in rather than dropping it.
        if (composer.kind === 'workflow' && !commitStep()) { return; }
        const err = composerError(composer);
        if (err) { composerMsg = err; render(); return; }
        if (composer.kind === 'task') {
            post({ type: 'task-new', task: Object.assign({}, composer, { force: force === true }) });
            return;
        }
        // One message for every other kind: the host knows which manager method
        // a kind belongs to, and the page does not have to.
        post({ type: 'plan-save', item: Object.assign({}, composer) });
    }

    // -------------------------------------------------------------- RUN side

    const STATUS = {
        running: ['running', 'go'], queued: ['queued', ''], parked: ['parked', 'warn'],
        done: ['done', 'ok'], failed: ['failed', 'stop'], cancelled: ['cancelled', '']
    };

    function runRows(d) {
        const v = runView;
        // …and so is this one
        const q = window.AFQuery.compile(v.q);
        return d.runs.filter(r => {
            if (v.agent && v.agent.indexOf(r.agentName) < 0) { return false; }
            if (v.status && v.status.indexOf(r.status) < 0) { return false; }
            if (v.source && v.source.indexOf(r.sourceKind) < 0) { return false; }
            if (!q.empty && !q.test(r.title + ' ' + r.prompt + ' ' + r.agentName + ' ' + r.source)) { return false; }
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
                <input type="search" id="runq" placeholder="Search run, prompt, agent…" value="${C.esc(v.q)}" class="${v.q ? 'set' : ''}"
                    title="${C.esc(window.AFQuery.tip('Searched against the run title, its prompt, the agent and what started it.'))}">
                ${sel('agent', 'Agent', v.agent, d.agents)}
                ${sel('status', 'Status', v.status, Object.keys(STATUS))}
                ${sel('source', 'From', v.source, [{ v: 'schedule', t: 'schedule' }, { v: 'trigger', t: 'trigger' }, { v: 'workflow', t: 'workflow' }, { v: 'manual', t: 'you' }])}
                <span class="spacer"></span>
                <button id="nt-open"${composer ? ' disabled' : ''} title="Make a task here, with every dimension a session start offers — agent, model, effort, permissions, project, priority, folder">+ New task</button>
                <button class="secondary" data-open="cancel-queued">Cancel queued</button>
                <button class="secondary" data-open="clear-finished">Clear finished</button>
            </div>
            ${composer && (COMPOSE[composer.kind] || COMPOSE.task).tab === 'run' ? composerHtml() : ''}
            ${chooser && chooser.tab === 'run' ? chooserHtml() : ''}
            ${!composer && composerMsg && tab === 'run' ? `<div class="ntmsg">${C.esc(composerMsg)}</div>` : ''}
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
                /* NEW TASK. A card on the page, in the page's own language — the
                   same box the Automation strip is drawn in — rather than a
                   stack of modal dialogs in front of it. The fields WRAP: on a
                   narrow panel a single row of eleven controls would push the
                   prompt box down to a slit, which is an invitation to write
                   less than you mean. */
                .ntbox { border:1px solid var(--vscode-focusBorder); border-radius:9px; padding:9px 12px;
                    margin:0 0 12px; background:var(--vscode-editorWidget-background, rgba(128,128,128,.05)); }
                .ntgrid { display:flex; flex-wrap:wrap; gap:8px 10px; margin:8px 0; }
                .ntf { display:flex; flex-direction:column; gap:3px; flex:1 1 150px; min-width:140px; font-size:11px; }
                .ntf.wide { flex:1 1 100%; }
                .ntf > span { opacity:.75; }
                .ntf em { font-style:normal; opacity:.75; color:var(--vscode-editorWarning-foreground,#cca700); }
                .ntf select, .ntf input { padding:3px 6px; }
                .ntf textarea { font-family:inherit; font-size:13px; padding:6px 8px; resize:vertical; min-height:70px; }
                .ntmsg { font-size:12px; margin:6px 0; padding:5px 10px; border-radius:5px;
                    background:var(--vscode-editorWidget-background, rgba(128,128,128,.08)); }
                .ntmsg.warn { color:var(--vscode-editorWarning-foreground,#cca700);
                    border:1px solid currentColor; }
                /* A section heading inside the form. The form is long enough
                   that "When", "Brakes" and "Steps" have to be findable at a
                   glance rather than read for. */
                .ntsec { margin:10px 0 0; padding-top:7px; font-size:12px;
                    border-top:1px solid var(--vscode-panel-border); }
                .ntsec b { margin-right:8px; }
                .ntsec .small { line-height:1.5; }
                /* THE CHAIN. A workflow is the one plan object whose content is
                   a LIST, so the form has to show the list — the wizard it
                   replaces asked for step 4 without ever showing steps 1–3. */
                .wfsteps { list-style:none; margin:8px 0; padding:0;
                    border:1px solid var(--vscode-panel-border); border-radius:7px; overflow:hidden; }
                .wfstep { display:flex; gap:9px; align-items:flex-start; padding:6px 9px; font-size:12px;
                    counter-increment:wfs; }
                .wfstep + .wfstep { border-top:1px solid var(--vscode-panel-border); }
                .wfstep:hover { background:var(--vscode-list-hoverBackground); }
                .wfstep.on { background:var(--vscode-list-activeSelectionBackground, rgba(128,128,255,.12)); }
                .wfstep::before { content:counter(wfs) "."; opacity:.55; min-width:1.4em; text-align:right; }
                .wfsteps { counter-reset:wfs; }
                .wfsi { font-size:14px; line-height:1.2; }
                .wfst { flex:1 1 auto; display:flex; flex-direction:column; gap:1px; min-width:0; }
                .wfst .small { word-break:break-word; }
                .wfsa { white-space:nowrap; }
                .wfsa .mini { margin-left:3px; }
                .wfsa .mini[disabled] { opacity:.35; cursor:default; }
                /* One step, opened. Nested inside the form's own card, so it is
                   visibly a part of the workflow rather than a second dialog. */
                .stbox { border:1px solid var(--vscode-focusBorder); border-left-width:3px; border-radius:7px;
                    padding:7px 11px; margin:8px 0 4px;
                    background:var(--vscode-editorWidget-background, rgba(128,128,128,.09)); }
                .stbox .ntsec:first-of-type { margin-top:6px; }
                .stbox code { font-size:11px; }
                /* The in-page picker. Same card as the form, because it is the
                   same kind of thing: a question answered on the page. */
                .chlist { list-style:none; margin:8px 0 2px; padding:0; }
                .chlist li { display:flex; gap:8px; align-items:baseline; padding:4px 2px; font-size:12px; }
                .chlist li + li { border-top:1px solid var(--vscode-panel-border); }
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
                sub: `plan what runs · see what ran — updated ${window.AFTime.clockUtc(d.generatedAt)}`,
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
            // 🌙 used to call a command that asked a quickpick and then two
            // input boxes. It opens the card on the strip instead.
            if (a === 'open') { openGate('quiet'); return; }
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

        // ---- the New-task form. Every control writes into the draft as it is
        // touched, because the page repaints itself on every host push and a
        // form that lived only in the DOM would lose a half-written prompt to a
        // task somewhere else finishing.
        const byId = (id, ev, fn) => {
            const el = document.getElementById(id);
            if (el) { el.addEventListener(ev, fn); }
        };
        byId('nt-open', 'click', () => openComposer());
        byId('nt-close', 'click', () => closeComposer());
        byId('nt-cancel', 'click', () => closeComposer());
        byId('nt-add', 'click', () => submitComposer(false));
        byId('nt-force', 'click', () => submitComposer(true));
        if (composer) {
            ['prompt', 'title', 'workdir', 'priority', 'watchPath', 'token', 'time', 'onceAt',
                'debounceSec', 'cooldownSec', 'maxPerHour',
                'guardPath', 'guardExcept', 'guardMin', 'guardHours'].forEach(id =>
                    byId('nt-' + id, 'input', () => readComposer()));
            ['agent', 'mode', 'model', 'effort', 'permissionMode', 'project', 'cli',
                'dow', 'missed', 'hookEvent', 'hookAgent', 'workflowId'].forEach(id =>
                    byId('nt-' + id, 'change', () => readComposer()));
            // ‼️ These five REDRAW, because they change which fields exist:
            // "weekly" adds a day picker, "watch" a path, a guard its own row.
            // A field that only appears after a reload is a field nobody finds.
            ['every', 'ttype', 'act', 'guardKind'].forEach(id =>
                byId('nt-' + id, 'change', () => { readComposer(); render(); }));
            byId('nt-guardRecursive', 'change', () => readComposer());
            byId('nt-enabled', 'change', () => readComposer());
            // The Add button's own words follow the "start it now" box, so what
            // the press will do is readable before pressing it.
            byId('nt-start', 'change', () => { readComposer(); render(); });
            // Ctrl+Enter queues it — the same bargain the Console composer and
            // the backlog capture box make. Plain Enter stays a newline: these
            // prompts run to a paragraph.
            byId('nt-prompt', 'keydown', ev => {
                if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
                    ev.preventDefault();
                    submitComposer(false);
                }
            });
        }

        // ---- the chain, and the one step being written (Faz 2). Reordering
        // and deleting act on the DRAFT: Cancel has to really cancel, and a new
        // workflow has no stored object to act on in the first place.
        if (composer && composer.kind === 'workflow') {
            byId('nt-stadd', 'click', () => {
                if (!commitStep()) { return; }
                composer.stepIdx = -1;
                composer.step = newStep();
                stepMsg = '';
                render();
            });
            click('[data-st]', e => {
                const el = e.currentTarget;
                const i = Number(el.dataset.i);
                const act = el.dataset.st;
                const steps = composer.steps;
                if (!(i >= 0 && i < steps.length)) { return; }
                if (act === 'edit') {
                    if (composer.stepIdx !== null && composer.stepIdx !== i && !commitStep()) { return; }
                    composer.stepIdx = i;
                    composer.step = newStep(steps[i]);
                    stepMsg = '';
                } else if (act === 'del') {
                    steps.splice(i, 1);
                    if (composer.stepIdx === i) { composer.stepIdx = null; composer.step = null; }
                    else if (composer.stepIdx > i) { composer.stepIdx--; }
                } else if (act === 'dup') {
                    steps.splice(i + 1, 0, Object.assign({}, steps[i]));
                    if (composer.stepIdx > i) { composer.stepIdx++; }
                } else if (act === 'up' || act === 'down') {
                    const j = act === 'up' ? i - 1 : i + 1;
                    if (j < 0 || j >= steps.length) { return; }
                    const tmp = steps[i]; steps[i] = steps[j]; steps[j] = tmp;
                    if (composer.stepIdx === i) { composer.stepIdx = j; }
                    else if (composer.stepIdx === j) { composer.stepIdx = i; }
                }
                render();
            });
            byId('nt-stsave', 'click', () => { if (commitStep()) { render(); } });
            byId('nt-stcancel', 'click', () => {
                composer.stepIdx = null;
                composer.step = null;
                stepMsg = '';
                render();
            });
            if (composer.stepIdx !== null) {
                ['title', 'prompt', 'runIf', 'verifyCriteria', 'verifyRetries',
                    'whUrl', 'whBody', 'whHeader', 'whPollUrl', 'whStatusField', 'whDone', 'whInterval',
                    'mModel', 'mInput', 'bUrl', 'bGoal', 'bHosts',
                    'apMsg', 'selMsg', 'selMin', 'selMax'].forEach(id =>
                        byId('nt-st-' + id, 'input', () => readStep()));
                ['agent', 'smode', 'contract', 'onFailStep', 'mScene'].forEach(id =>
                    byId('nt-st-' + id, 'change', () => readStep()));
                byId('nt-st-parallel', 'change', () => readStep());
                // ‼️ These five REDRAW: the kind decides which half of the card
                // exists at all, the method whether there is a body, polling
                // whether there are poll fields, "jump to" which step, and a
                // criteria box whether retries are worth asking about.
                ['stype', 'whMethod', 'whPoll', 'onFail'].forEach(id =>
                    byId('nt-st-' + id, 'change', () => { readStep(); render(); }));
                byId('nt-st-verifyCriteria', 'change', () => { readStep(); render(); });
            }
        }

        // the farm-wide gate, set on the strip that reports it
        if (gateEdit) {
            byId('gt-close', 'click', () => { gateEdit = null; render(); });
            const readGate = () => {
                const v = (id) => { const el = document.getElementById('gt-' + id); return el ? String(el.value || '') : ''; };
                gateFrom = v('from'); gateTo = v('to'); gateReason = v('reason'); gateMins = v('mins') || '0';
            };
            ['from', 'to', 'reason'].forEach(id => byId('gt-' + id, 'input', readGate));
            byId('gt-mins', 'change', readGate);
            byId('gt-quiet', 'click', () => {
                readGate();
                if (!gateFrom || !gateTo) {
                    gateMsg = 'A quiet window needs both ends — a start and an end.';
                    render();
                    return;
                }
                post({ type: 'gate', act: 'quiet-set', quietFrom: gateFrom, quietTo: gateTo });
                gateEdit = null;
            });
            byId('gt-quietoff', 'click', () => { post({ type: 'gate', act: 'quiet-off' }); gateEdit = null; });
            byId('gt-pause', 'click', () => {
                readGate();
                post({
                    type: 'gate',
                    act: gateMins === '0' ? 'pause' : 'pause-for',
                    text: gateMins === '0' ? gateReason : gateMins,
                    reason: gateReason
                });
                gateEdit = null;
            });
        }

        // the in-page picker
        if (chooser) {
            byId('ch-close', 'click', () => { chooser = null; render(); });
            click('[data-ch]', e => {
                post({ type: 'chooser-pick', act: chooser.act, id: e.currentTarget.dataset.ch });
                chooser = null;
                render();
            });
        }

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
            // ‼️ "Like this one, but…" — the same form, prefilled from the row.
            // `retryEdit` above is the old one-question box (a new prompt and
            // nothing else); this is the whole task, editable, which is what a
            // person means when they say "run that again with opus".
            case 'tkClone': task('clone'); return;
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
        // ---- the New-task form, driven from the host ----
        // `task-compose` is the ONE door: the sidebar's +, the walkthrough and a
        // row's "like this one" all arrive here, so there is a single form with
        // a single set of fields whichever way you came in.
        if (ev.data.type === 'task-compose') { openComposer(ev.data.seed); }
        // …and the same door for every plan kind (U-9). `agentfarm.addSchedule`,
        // `editTrigger`, the toolbar's + and a row's edit button all arrive
        // here, so the palette and the page cannot make two different objects.
        if (ev.data.type === 'plan-compose') { chooser = null; openComposer(ev.data.seed, ev.data.kind); }
        // ‼️ "WHICH TEMPLATE?" IS THE PLAN TAB, FILTERED. It used to be a
        // quickpick of bare titles; the rows on this page carry the agent, the
        // mode, what it last cost and a run button, which is strictly more of
        // the same question answered.
        if (ev.data.type === 'plan-focus') {
            tab = 'plan';
            planView = Object.assign({}, PLAN_DEF, ev.data.view || {});
            composer = null;
            chooser = null;
            composerMsg = ev.data.note || '';
            persist();
            render();
        }
        // `agentfarm.setQuietHours` / `pauseAutomations` from the palette open
        // the card too, so the strip and the palette set the same thing.
        if (ev.data.type === 'gate-open') { openGate(ev.data.which); }
        // A picker the host filled, drawn as a list on the page.
        if (ev.data.type === 'chooser') {
            chooser = ev.data.chooser || null;
            if (chooser && chooser.tab) { tab = chooser.tab; }
            composer = null;
            persist();
            render();
        }
        if (ev.data.type === 'task-error') { composerMsg = ev.data.text || ''; composerDup = false; render(); }
        if (ev.data.type === 'plan-saved') {
            closeComposer(ev.data.text || 'Saved.');
        }
        // ‼️ The duplicate guard, asked IN the form. It used to be a modal that
        // took the focus off the fields it was complaining about; here the
        // answer button sits next to the one you just pressed.
        if (ev.data.type === 'task-dup') {
            composerMsg = (ev.data.text || 'An identical task is already queued.')
                + ' Add it anyway, or change the prompt.';
            composerDup = true;
            render();
        }
        if (ev.data.type === 'task-made') {
            closeComposer(`Queued “${ev.data.title}”${ev.data.started ? ' and started it.' : ' — press start when you want it.'}`);
        }
    });

    render();
    // Ages and durations go stale; never re-render under the user's fingers.
    setInterval(() => {
        if (document.hidden) { return; }
        // ‼️ The composer is a half-written thought, and a repaint would move the
        // caret out from under it — a textarea is exactly where the longest ones
        // are typed, and it was not in this list.
        if (composer) { return; }
        const a = document.activeElement;
        if (a && (a.tagName === 'INPUT' || a.tagName === 'SELECT' || a.tagName === 'TEXTAREA')) { return; }
        render();
    }, 30000);
})();
