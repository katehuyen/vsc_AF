// Agent Farm — A2A Tasks page (N-6). Work one agent handed to another: ONE
// line per task on the root, click to open. Two lanes — open (queued · claimed
// · running · blocked) and closed (done · failed · cancelled) — because a claim
// is a LEASE (core/a2aTasks.ts) and the lease bar on a claimed row is the
// difference between "working, slowly" and "gone".
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const A = window.AFA2A;
    const esc = A.esc;
    let DATA = window.__DATA__;

    const OPEN = ['queued', 'claimed', 'running', 'blocked'];
    const CLOSED = ['done', 'failed', 'cancelled'];
    const st = (typeof vscode.getState === 'function' && vscode.getState()) || {};
    const pick = v => (Array.isArray(v) ? v : null);
    const DEF = { fState: null, fFrom: null, fRole: null, fProject: null, query: '' };
    let fState = pick(st.fState);
    let fFrom = pick(st.fFrom);
    let fRole = pick(st.fRole);
    let fProject = pick(st.fProject);
    let query = st.query || DEF.query;
    const expanded = new Set();
    let focusId = DATA.focusId || null;
    let refocusSearch = false;

    function saveState() { try { vscode.setState({ fState, fFrom, fRole, fProject, query }); } catch (e) { /* no state api */ } }

    function haystack(t) {
        return [t.title, t.instructions || '', t.expectedOutput || '', t.resultSummary || '', t.topic, t.workdir, t.targetRole, t.fromAgent,
            t.claimedBy ? t.claimedBy.agent + ' ' + (t.claimedBy.progress || '') : '', (t.requires || []).join(' ')].join(' ');
    }
    function matchesQuery(t) {
        const q = query.trim();
        if (!q) { return true; }
        return window.AFQuery.compile(q).test(haystack(t));
    }
    function visible() {
        return (DATA.tasks || []).filter(t =>
            (!fState || fState.indexOf(t.state) >= 0) &&
            (!fFrom || fFrom.indexOf(t.fromAgent) >= 0) &&
            (!fRole || fRole.indexOf(t.targetRole) >= 0) &&
            (!fProject || fProject.indexOf(t.project) >= 0) &&
            matchesQuery(t)
        ).sort((a, b) => b.ts - a.ts);
    }

    function filterPickers() {
        const tasks = DATA.tasks || [];
        const froms = [...new Set(tasks.map(t => t.fromAgent))].sort();
        const roles = [...new Set(tasks.map(t => t.targetRole))].sort();
        const projs = [...new Set(tasks.map(t => t.project))];
        return [
            { id: 'at-state', label: 'State', get: () => fState, set: v => { fState = v; },
                title: 'Where each task is: queued → claimed → running → done | failed | blocked | cancelled',
                options: OPEN.concat(CLOSED).map(s => ({ v: s, t: s })) },
            { id: 'at-from', label: 'From', get: () => fFrom, set: v => { fFrom = v; },
                title: 'Which agent handed it over', options: froms.map(a => ({ v: a, t: '🤖 ' + a })) },
            { id: 'at-role', label: 'For', get: () => fRole, set: v => { fRole = v; },
                title: 'Which role it is for — "anyone" is a broadcast',
                options: roles.map(r => ({ v: r, t: r === '*' ? '✱ anyone' : '→ ' + r })) },
            { id: 'at-project', label: 'Projects', get: () => fProject, set: v => { fProject = v; },
                title: 'Which project the task is filed under — "any" is a broadcast',
                options: projs.map(k => { const p = k === '*' ? null : window.AFProject.find(DATA.projects, k); return { v: k, t: k === '*' ? '✱ any project' : (p ? (p.icon ? p.icon + ' ' : '') + p.name : k) }; }) }
        ];
    }

    function card(t) {
        const open = expanded.has(t.id);
        const closed = CLOSED.indexOf(t.state) >= 0;
        const now = DATA.now || Date.now();
        const hop = t.handoffDepth > 0
            ? window.AFTip.wrap(`<span class="a2a-hop">↪${t.handoffDepth}</span>`, 'Handoffs', `Handed on ${t.handoffDepth} time(s) — past ${DATA.maxHandoffDepth} it is blocked rather than passed again.${t.parentTaskId ? '\nParent task: ' + t.parentTaskId : ''}`)
            : '';
        const line = `<div class="a2a-line" data-open="${t.id}">
            ${A.stateBadge(t.state)}
            <span class="a2a-title">${esc(t.title)}</span>
            ${t.humanDirective ? window.AFTip.wrap('<span class="a2a-flag">⚠️ directive</span>', 'Supervisor directive', `${t.humanDirective.kind}: ${t.humanDirective.text}`) : ''}
            ${hop}
            ${A.coords(t, DATA.projects)}
            ${(t.requires || []).length ? window.AFTip.wrap(`<span class="a2a-flag">🔧 ${t.requires.length}</span>`, 'Requires', 'Requires: ' + t.requires.join(', ') + '\nAll of them, or the claim is refused.') : ''}
            <span class="a2a-from">🤖 ${esc(t.fromAgent)}${t.claimedBy ? ' → ' + esc(t.claimedBy.agent) : ''}</span>
            ${A.leaseBar(t, now, DATA.leaseMs)}
            ${window.AFTip.wrap(`<span class="a2a-age">${esc(window.AFTime.ago(t.ts))}</span>`, 'Handed over', window.AFTime.tip(t.ts, 'Handed over'))}
        </div>`;
        const cls = `a2a-card${focusId === t.id ? ' a2a-focus' : ''}${closed ? ' a2a-closed' : ''}`;
        if (!open) { return `<div class="${cls}" data-id="${t.id}">${line}</div>`; }
        const xref = [];
        if (t.sourceNoteId) {
            const n = (DATA.notesById || {})[t.sourceNoteId];
            xref.push(`<dt>From note</dt><dd><span class="a2a-xref" data-note="${esc(t.sourceNoteId)}">${esc(n ? n.title : t.sourceNoteId)}</span></dd>`);
        }
        if (t.sourceQueueItemId) { xref.push(`<dt>Queue item</dt><dd><span class="a2a-xref" data-queue="${esc(t.sourceQueueItemId)}">${esc(t.sourceQueueItemId)}</span></dd>`); }
        if (t.parentTaskId) { xref.push(`<dt>Parent task</dt><dd><span class="a2a-xref" data-task="${esc(t.parentTaskId)}">${esc(t.parentTaskId)}</span></dd>`); }
        const c = t.claimedBy;
        const actions = `<div class="a2a-actions">
            ${closed ? '' : `<button class="secondary" data-act="cancel" data-id="${t.id}" title="Cancel this task — it is never re-queued and its claimant, if any, loses it">⊘ Cancel</button>`}
            <button class="secondary" data-act="copyId" data-id="${t.id}" title="Copy the task id — a2a.tasks.claim id=…">⧉ ${esc(t.id)}</button>
        </div>`;
        return `<div class="${cls}" data-id="${t.id}">${line}
            <div class="a2a-body">
                ${A.directive(t.humanDirective)}
                ${t.instructions ? A.md(t.instructions) : '<div class="muted">(no instructions)</div>'}
                ${t.expectedOutput ? `<div class="a2a-sec"><div class="a2a-sech">Expected output</div>${A.md(t.expectedOutput)}</div>` : ''}
                ${t.resultSummary ? `<div class="a2a-sec"><div class="a2a-sech">Result</div>${A.md(t.resultSummary)}</div>` : ''}
                <div class="a2a-sec"><div class="a2a-sech">Facts</div><dl class="a2a-facts">
                    <dt>Handed over</dt><dd>${esc(window.AFTime.full(t.ts))}</dd>
                    <dt>From</dt><dd>${esc(t.fromAgent)}${t.fromSessionId ? ' · session ' + esc(t.fromSessionId) : ''}</dd>
                    ${c ? `<dt>Claimed by</dt><dd>${esc(c.agent)}${c.sessionId ? ' · session ' + esc(c.sessionId) : ''} · lease until ${esc(window.AFTime.full(c.leaseExpiresAt))}</dd>
                    <dt>Progress</dt><dd>${c.progress ? esc(c.progress) : '—'}</dd>` : ''}
                    <dt>Requires</dt><dd>${(t.requires || []).length ? esc(t.requires.join(', ')) : '—'}</dd>
                    <dt>Ceilings</dt><dd>${t.maxCostUSD ? '$' + t.maxCostUSD : 'no cost ceiling'} · ${t.maxTurns ? t.maxTurns + ' turns' : 'no turn ceiling'}</dd>
                    ${xref.join('')}
                </dl></div>
                ${actions}
            </div></div>`;
    }

    function render() {
        const items = visible();
        const all = DATA.tasks || [];
        const openN = all.filter(t => OPEN.indexOf(t.state) >= 0).length;
        const openItems = items.filter(t => OPEN.indexOf(t.state) >= 0);
        const closedItems = items.filter(t => CLOSED.indexOf(t.state) >= 0);
        let list = '';
        if (!items.length) {
            list = `<p class="muted a2a-empty">🕊️ No tasks match. Agents hand work to each other here — <code>a2a.tasks.add</code> on the bridge, <code>a2a.tasks.next</code> to take one; a claim is a 30-minute lease kept alive by heartbeats.</p>`;
        } else {
            if (openItems.length) { list += `<div class="a2a-lane">Open · ${openItems.length}</div>` + openItems.map(card).join(''); }
            if (closedItems.length) { list += `<div class="a2a-lane">Closed · ${closedItems.length}</div>` + closedItems.map(card).join(''); }
        }
        document.getElementById('app').innerHTML = `${A.STYLE}
            ${window.AFHeader.tabs('a2atasks')}
            ${window.AFHeader.html({
                page: 'a2atasks', title: '⚡ A2A Tasks',
                sub: `${all.length} total · ${openN} open · showing ${items.length} · ${window.AFTime.clockUtc(DATA.generatedAt)}`,
                controls: A.controls('at', {
                    query, pickers: filterPickers(),
                    searchTip: window.AFQuery.tip('Searched against the title, instructions, expected output, result, topic, workdir, target role, author, claimant, progress and requirements.')
                }),
                related: [{ label: '📥 Queue', name: 'Work Queue', nav: 'queue' }]
            })}
            ${list}`;
        window.AFHeader.wire(vscode);
        wire();
        if (refocusSearch) { const s = document.getElementById('at-search'); if (s) { s.focus(); const v = s.value.length; try { s.setSelectionRange(v, v); } catch (e) { /* no caret api */ } } refocusSearch = false; }
        if (focusId) {
            const el = document.querySelector(`.a2a-card[data-id="${focusId}"]`);
            if (el && el.scrollIntoView) { el.scrollIntoView({ block: 'center' }); }
            focusId = null;
        }
    }

    function wire() {
        A.wireControls('at', {
            pickers: filterPickers(),
            onQuery: v => { query = v; refocusSearch = true; saveState(); render(); },
            onChange: () => { saveState(); render(); },
            onReset: () => { fState = DEF.fState; fFrom = DEF.fFrom; fRole = DEF.fRole; fProject = DEF.fProject; query = DEF.query; saveState(); render(); }
        });
        document.querySelectorAll('[data-open]').forEach(el => el.addEventListener('click', ev => {
            if (ev.target && ev.target.closest && ev.target.closest('button, a, .af-tip')) { return; }
            const id = el.dataset.open;
            if (expanded.has(id)) { expanded.delete(id); } else { expanded.add(id); }
            render();
        }));
        document.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', ev => {
            ev.stopPropagation();
            const id = b.dataset.id, act = b.dataset.act;
            if (act === 'copyId') { window.AFCtx.copy(id); return; }
            vscode.postMessage({ type: act, id });
        }));
        document.querySelectorAll('.a2a-xref').forEach(x => x.addEventListener('click', ev => {
            ev.stopPropagation();
            if (x.dataset.note) { vscode.postMessage({ type: 'openNote', id: x.dataset.note }); }
            else if (x.dataset.queue) { vscode.postMessage({ type: 'openQueueItem', id: x.dataset.queue }); }
            else if (x.dataset.task) { focusId = x.dataset.task; expanded.add(focusId); render(); }
        }));
        document.querySelectorAll('.a2a-link').forEach(a => a.addEventListener('click', ev => {
            ev.preventDefault(); ev.stopPropagation(); vscode.postMessage({ type: 'openExternal', url: a.dataset.href });
        }));
    }

    const repaint = window.AFRepaint.guard(render);
    window.addEventListener('message', ev => {
        if (ev.data.type === 'data') {
            DATA = ev.data.data;
            if (DATA.focusId) { focusId = DATA.focusId; expanded.add(focusId); }
            repaint();
        }
    });
    if (focusId) { expanded.add(focusId); }
    render();
})();
