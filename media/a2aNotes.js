// Agent Farm — A2A Notes page (N-6). What one agent left for another to read:
// ONE line per note on the root, click to open. Passive board — nothing here is
// assigned; a note is consumed by whoever its coordinates fit, and the only
// thing a person does on it is read, resolve, or turn it into a task.
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const A = window.AFA2A;
    const esc = A.esc;
    let DATA = window.__DATA__;

    const st = (typeof vscode.getState === 'function' && vscode.getState()) || {};
    const pick = v => (Array.isArray(v) ? v : null);
    // Multi-pick: null = all, an array = exactly that subset (media/afFilters.js).
    const DEF = { fState: ['live'], fCat: null, fFrom: null, fProject: null, query: '' };
    // A saved null is "every state"; a missing key is "the default". Not the same.
    let fState = st.fState === undefined ? DEF.fState : pick(st.fState);
    let fCat = pick(st.fCat);
    let fFrom = pick(st.fFrom);
    let fProject = pick(st.fProject);
    let query = st.query || DEF.query;
    const expanded = new Set();
    let focusId = DATA.focusId || null;
    let refocusSearch = false;

    function saveState() { try { vscode.setState({ fState, fCat, fFrom, fProject, query }); } catch (e) { /* no state api */ } }

    // ---- what a note IS right now: live, resolved, or expired ----
    function stateOf(n) {
        if (n.resolved) { return 'resolved'; }
        if (n.expiresAt && n.expiresAt <= (DATA.now || Date.now())) { return 'expired'; }
        return 'live';
    }
    function haystack(n) {
        return [n.title, n.body || '', n.topic, n.subsystem, n.targetRole, n.fromAgent, n.category, (n.contextFiles || []).join(' ')].join(' ');
    }
    function matchesQuery(n) {
        const q = query.trim();
        if (!q) { return true; }
        return window.AFQuery.compile(q).test(haystack(n));
    }
    function visible() {
        return (DATA.notes || []).filter(n =>
            (!fState || fState.indexOf(stateOf(n)) >= 0) &&
            (!fCat || fCat.indexOf(n.category) >= 0) &&
            (!fFrom || fFrom.indexOf(n.fromAgent) >= 0) &&
            (!fProject || fProject.indexOf(n.project) >= 0) &&
            matchesQuery(n)
        ).sort((a, b) => b.ts - a.ts);
    }

    function filterPickers() {
        const froms = [...new Set((DATA.notes || []).map(n => n.fromAgent))].sort();
        const projs = [...new Set((DATA.notes || []).map(n => n.project))];
        return [
            { id: 'an-state', label: 'State', get: () => fState, set: v => { fState = v; },
                title: 'Live notes are the board; resolved and expired ones are its history',
                options: [{ v: 'live', t: 'live' }, { v: 'resolved', t: 'resolved' }, { v: 'expired', t: 'expired' }] },
            { id: 'an-cat', label: 'Category', get: () => fCat, set: v => { fCat = v; },
                title: 'What kind of thing the note says',
                options: ['info', 'warning', 'convention', 'discovery', 'result'].map(c => ({ v: c, t: (A.CAT[c] || '') + ' ' + c })) },
            { id: 'an-from', label: 'From', get: () => fFrom, set: v => { fFrom = v; },
                title: 'Which agent wrote it', options: froms.map(a => ({ v: a, t: '🤖 ' + a })) },
            { id: 'an-project', label: 'Projects', get: () => fProject, set: v => { fProject = v; },
                title: 'Which project the note is filed under — "any" is a broadcast',
                options: projs.map(k => { const p = k === '*' ? null : window.AFProject.find(DATA.projects, k); return { v: k, t: k === '*' ? '✱ any project' : (p ? (p.icon ? p.icon + ' ' : '') + p.name : k) }; }) }
        ];
    }

    function dayLabel(ts) {
        const d = new Date(ts), n = new Date(DATA.now || Date.now());
        const k = x => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
        const y = new Date(n); y.setDate(n.getDate() - 1);
        if (k(d) === k(n)) { return 'Today'; }
        if (k(d) === k(y)) { return 'Yesterday'; }
        return d.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
    }

    function card(n) {
        const open = expanded.has(n.id);
        const state = stateOf(n);
        const task = (DATA.tasksByNote || {})[n.id];
        const readers = (n.readBy || []).length;
        const readTip = readers ? `Read by: ${n.readBy.join(', ')}` : 'Nobody has read it yet';
        const flag = state === 'live' ? '' : `<span class="a2a-flag">${state === 'resolved' ? '✓ resolved' : '⌛ expired'}</span>`;
        const line = `<div class="a2a-line" data-open="${n.id}">
            ${window.AFTip.wrap(`<span class="a2a-cat">${A.CAT[n.category] || 'ℹ️'}</span>`, 'Category', `Category: ${n.category}`)}
            <span class="a2a-title">${esc(n.title)}</span>
            ${n.humanDirective ? window.AFTip.wrap('<span class="a2a-flag">⚠️ directive</span>', 'Supervisor directive', `${n.humanDirective.kind}: ${n.humanDirective.text}`) : ''}
            ${task ? window.AFTip.wrap(`<span class="a2a-flag">⚡ ${esc(task.state)}</span>`, 'Task', `Task ${task.id} — ${task.state}\nThis note was promoted; click to open it on the A2A Tasks board.`) : ''}
            ${A.coords(n, DATA.projects)}
            <span class="a2a-from">🤖 ${esc(n.fromAgent)}</span>
            ${window.AFTip.wrap(`<span class="a2a-flag">👁 ${readers}</span>`, 'Readers', readTip)}
            ${flag}
            ${window.AFTip.wrap(`<span class="a2a-age">${esc(window.AFTime.ago(n.ts))}</span>`, 'Posted', window.AFTime.tip(n.ts, 'Posted') + (n.expiresAt ? '\nExpires: ' + window.AFTime.full(n.expiresAt) : '\nDoes not expire'))}
        </div>`;
        if (!open) { return `<div class="a2a-card${focusId === n.id ? ' a2a-focus' : ''}${state === 'live' ? '' : ' a2a-closed'}" data-id="${n.id}">${line}</div>`; }
        const files = (n.contextFiles || []).length
            ? `<div class="a2a-sec"><div class="a2a-sech">Files</div><div class="a2a-files">${n.contextFiles.map(f => `<div><a data-file="${esc(f)}" data-note="${n.id}">${esc(f)}</a></div>`).join('')}</div></div>` : '';
        const actions = `<div class="a2a-actions">
            ${task
                ? `<button class="secondary" data-act="openTask" data-id="${n.id}" data-task="${esc(task.id)}">⚡ Open task (${esc(task.state)})</button>`
                : `<button data-act="toTask" data-id="${n.id}" ${state === 'live' ? '' : 'disabled'} title="Promote this note to an A2A task: title, body, coordinates and files carry over, and the task remembers the note it grew from">⚡ Convert to task</button>`}
            ${state === 'resolved'
                ? `<button class="secondary" data-act="unresolve" data-id="${n.id}">↺ Reopen</button>`
                : `<button class="secondary" data-act="resolve" data-id="${n.id}">✓ Resolve</button>`}
            <button class="secondary" data-act="copyId" data-id="${n.id}" title="Copy the note id — a2a.notes.get id=…">⧉ ${esc(n.id)}</button>
        </div>`;
        return `<div class="a2a-card${focusId === n.id ? ' a2a-focus' : ''}${state === 'live' ? '' : ' a2a-closed'}" data-id="${n.id}">${line}
            <div class="a2a-body">
                ${A.directive(n.humanDirective)}
                ${n.body ? A.md(n.body) : '<div class="muted">(no body)</div>'}
                ${files}
                <div class="a2a-sec"><div class="a2a-sech">Facts</div><dl class="a2a-facts">
                    <dt>Posted</dt><dd>${esc(window.AFTime.full(n.ts))}</dd>
                    <dt>From</dt><dd>${esc(n.fromAgent)}${n.fromSessionId ? ' · session ' + esc(n.fromSessionId) : ''}</dd>
                    <dt>Read by</dt><dd>${readers ? esc(n.readBy.join(', ')) : '—'}</dd>
                    <dt>Expires</dt><dd>${n.expiresAt ? esc(window.AFTime.full(n.expiresAt)) : 'never'}</dd>
                </dl></div>
                ${actions}
            </div></div>`;
    }

    function render() {
        const items = visible();
        const all = DATA.notes || [];
        const live = all.filter(n => stateOf(n) === 'live').length;
        let list = '';
        if (!items.length) {
            list = `<p class="muted a2a-empty">🕊️ No notes match. Agents leave notes for each other here — <code>a2a.notes.post</code> on the bridge; a reader picks them up by project, subsystem, topic and role.</p>`;
        } else {
            let lastDay = '';
            for (const n of items) { const d = dayLabel(n.ts); if (d !== lastDay) { list += `<div class="a2a-day">${esc(d)}</div>`; lastDay = d; } list += card(n); }
        }
        document.getElementById('app').innerHTML = `${A.STYLE}
            ${window.AFHeader.tabs('a2anotes')}
            ${window.AFHeader.html({
                page: 'a2anotes', title: '🤖 A2A Notes',
                sub: `${all.length} total · ${live} live · showing ${items.length} · ${window.AFTime.clockUtc(DATA.generatedAt)}`,
                controls: A.controls('an', {
                    query, pickers: filterPickers(),
                    searchTip: window.AFQuery.tip('Searched against the title, body, topic, subsystem, target role, author, category and file paths.')
                }),
                related: [{ label: '📥 Queue', name: 'Work Queue', nav: 'queue' }]
            })}
            ${list}`;
        window.AFHeader.wire(vscode);
        wire();
        if (refocusSearch) { const s = document.getElementById('an-search'); if (s) { s.focus(); const v = s.value.length; try { s.setSelectionRange(v, v); } catch (e) { /* no caret api */ } } refocusSearch = false; }
        if (focusId) {
            const el = document.querySelector(`.a2a-card[data-id="${focusId}"]`);
            if (el && el.scrollIntoView) { el.scrollIntoView({ block: 'center' }); }
            focusId = null;
        }
    }

    function wire() {
        A.wireControls('an', {
            pickers: filterPickers(),
            onQuery: v => { query = v; refocusSearch = true; saveState(); render(); },
            onChange: () => { saveState(); render(); },
            onReset: () => { fState = DEF.fState; fCat = DEF.fCat; fFrom = DEF.fFrom; fProject = DEF.fProject; query = DEF.query; saveState(); render(); }
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
            if (act === 'openTask') { vscode.postMessage({ type: 'openTask', id: b.dataset.task }); return; }
            vscode.postMessage({ type: act, id });
        }));
        document.querySelectorAll('[data-file]').forEach(a => a.addEventListener('click', ev => {
            ev.stopPropagation(); vscode.postMessage({ type: 'openFile', id: a.dataset.note, file: a.dataset.file });
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
