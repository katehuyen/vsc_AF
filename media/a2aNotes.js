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
    // S-84 — the tri-state baton switch. `next` is what one click makes it, and
    // the first line of the tooltip is what it IS right now (MIRROR).
    const BATON_MODES = {
        all: { next: 'hide', label: '⑂ Batons: all', now: 'Showing everything — fleet notes and relay cards together.' },
        hide: { next: 'only', label: '⑂ Batons: hidden', now: 'Relay handover cards are hidden; only the fleet\'s own notes are on the board.' },
        only: { next: 'all', label: '⑂ Batons: only', now: 'Only relay handover cards — the races, nothing else.' }
    };
    // Multi-pick: null = all, an array = exactly that subset (media/afFilters.js).
    const DEF = { fState: ['live'], fCat: null, fFrom: null, fProject: null, query: '', batonMode: 'all' };
    // A saved null is "every state"; a missing key is "the default". Not the same.
    let fState = st.fState === undefined ? DEF.fState : pick(st.fState);
    let fCat = pick(st.fCat);
    let fFrom = pick(st.fFrom);
    let fProject = pick(st.fProject);
    let query = st.query || DEF.query;
    // S-84 — one button, three states: the races are shown, hidden, or the only
    // thing on the board. A relay writes a card per leg, so a busy chain would
    // otherwise bury the fleet's ordinary traffic.
    let batonMode = BATON_MODES[st.batonMode] ? st.batonMode : DEF.batonMode;
    // …and one chain, leg by leg: the page locks to a chain id and reads it
    // oldest-first, which is the order the race actually happened in.
    let chainLock = typeof st.chainLock === 'string' ? st.chainLock : null;
    const selected = new Set();
    const expanded = new Set();
    let focusId = DATA.focusId || null;
    let refocusSearch = false;
    // N-7 — the supervisor cockpit: which card has it open, the draft being
    // typed into it, and the refusal it is showing. One at a time, because a
    // second open form is a second answer to "what am I editing".
    let cockpitId = null;
    let draft = null;
    let cockpitMsg = '';
    let focusCockpit = false;

    function openCockpit(id) {
        const n = (DATA.notes || []).find(x => x.id === id);
        if (!n) { return; }
        const d = n.humanDirective;
        cockpitId = id;
        cockpitMsg = '';
        draft = { kind: d ? d.kind : 'steer', text: d ? d.text : '' };
        focusCockpit = true;
    }
    function closeCockpit() { cockpitId = null; draft = null; cockpitMsg = ''; focusCockpit = false; }

    function saveState() { try { vscode.setState({ fState, fCat, fFrom, fProject, query, batonMode, chainLock }); } catch (e) { /* no state api */ } }

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
    /**
     * S-84 — a chain lock is a WHOLE STORY, so it overrides the other filters:
     * a race read leg by leg with its resolved legs missing is not the story.
     * It is also the one view that reads oldest-first.
     */
    function visible() {
        if (chainLock) {
            return (DATA.notes || []).filter(n => n.topic === chainLock).sort((a, b) => a.ts - b.ts);
        }
        return (DATA.notes || []).filter(n =>
            (batonMode === 'all' || (batonMode === 'only') === (n.category === 'baton')) &&
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
                options: ['info', 'warning', 'convention', 'discovery', 'result', 'baton'].map(c => ({ v: c, t: (A.CAT[c] || '') + ' ' + c })) },
            { id: 'an-from', label: 'From', get: () => fFrom, set: v => { fFrom = v; },
                title: 'Which agent wrote it', options: froms.map(a => ({ v: a, t: '🤖 ' + a })) },
            { id: 'an-project', label: 'Projects', get: () => fProject, set: v => { fProject = v; },
                title: 'Which project the note is filed under — "any" is a broadcast',
                options: projs.map(k => { const p = k === '*' ? null : window.AFProject.find(DATA.projects, k); return { v: k, t: k === '*' ? '✱ any project' : (p ? (p.icon ? p.icon + ' ' : '') + p.name : k) }; }) }
        ];
    }

    /**
     * S-84 — the relay switch the filter row gains. The bulk hand is NOT here:
     * it is the bar under the filters (bulkBar, media/afBulk.js — N-11).
     */
    function extraControls() {
        const m = BATON_MODES[batonMode];
        const nx = BATON_MODES[m.next];
        const batons = (DATA.notes || []).filter(n => n.category === 'baton').length;
        const toggle = window.AFTip.wrap(
            `<button class="secondary a2a-bmode${batonMode === 'all' ? '' : ' on'}" id="an-baton">${esc(m.label)}</button>`,
            'Relay cards on the board',
            `${m.now}\n\nOne click → ${nx.label}: ${nx.now}\n\n`
            + `A baton relay hangs one card per leg (⑂), so a long race can bury the fleet's ordinary notes. `
            + `${batons} relay card(s) are on the board now.`);
        return toggle;
    }

    /** N-11 — Notices' own contract: the SELECTED rows, or every row shown when nothing is checked. */
    function bulkBar(items) {
        const n = selected.size;
        const target = n ? `${n} selected` : `all ${items.length} shown`;
        const del = window.AFBulk.delBtn(
            'Delete for good',
            `Deletes ${target}.\n\nUnlike ✓ Resolve this is not history — the notes leave the board and the disk. `
            + '📌 A pinned note is deleted too if you select it by hand: the pin exempts a note from the automatic '
            + 'sweep, not from you.');
        const clear = window.AFBulk.clearBtn('clearResolved', 'Clear resolved',
            'Clear what is already closed',
            'Deletes every RESOLVED note on the board, whatever is filtered or shown.\n\n'
            + '📌 Pinned notes are kept. Open notes are never touched — resolve one first if you mean it to go.');
        return window.AFBulk.bar('an-selall', items.length && items.every(x => selected.has(x.id)), [del, clear]);
    }

    /** S-84 — the race, read as one story: what is locked and the way out. */
    function chainBar(items) {
        if (!chainLock) { return ''; }
        const legs = items.length;
        const closed = items.filter(n => n.resolved).length;
        return `<div class="a2a-chainbar">
            <span class="a2a-chainid">⑂ ${esc(chainLock)}</span>
            <span class="muted">${legs} leg(s), oldest first · ${closed} handed on · every other filter is off while a chain is locked</span>
            <button class="secondary" id="an-unchain" title="Back to the board">✕ Unlock</button>
        </div>`;
    }

    function card(n) {
        const open = expanded.has(n.id);
        const state = stateOf(n);
        const task = (DATA.tasksByNote || {})[n.id];
        const readers = (n.readBy || []).length;
        const readTip = readers ? `Read by: ${n.readBy.join(', ')}` : 'Nobody has read it yet';
        const flag = state === 'live' ? '' : `<span class="a2a-flag">${state === 'resolved' ? '✓ resolved' : '⌛ expired'}</span>`;
        const line = `<div class="a2a-line" data-open="${n.id}">
            ${window.AFBulk.cb(n.id, selected.has(n.id))}
            ${window.AFTip.wrap(`<span class="a2a-cat">${A.CAT[n.category] || 'ℹ️'}</span>`, 'Category',
                `Category: ${n.category}${n.category === 'baton' ? '\nA baton relay\'s handover card — the words one leg left its successor.' : ''}`)}
            <span class="a2a-title">${esc(n.title)}</span>
            ${A.directiveFlag(n.humanDirective)}
            ${task ? window.AFTip.wrap(`<span class="a2a-flag">⚡ ${esc(task.state)}</span>`, 'Task', `Task ${task.id} — ${task.state}\nThis note was promoted; click to open it on the A2A Tasks board.`) : ''}
            ${A.coords(n, DATA.projects)}
            <span class="a2a-from">🤖 ${esc(n.fromAgent)}</span>
            ${window.AFTip.wrap(`<span class="a2a-flag">👁 ${readers}</span>`, 'Readers', readTip)}
            ${flag}
            ${window.AFTip.wrap(`<span class="a2a-age">${esc(window.AFTime.ago(n.ts))}</span>`, 'Posted', window.AFTime.tip(n.ts, 'Posted') + (n.expiresAt ? '\nExpires: ' + window.AFTime.full(n.expiresAt) : '\nDoes not expire'))}
            ${window.AFTip.wrap(`<span class="a2a-pin${n.pinned ? ' on' : ''}" data-pinrow="${n.id}" data-pin="${n.pinned ? '0' : '1'}">📌</span>`,
                n.pinned ? 'Pinned — exempt from the sweep' : 'Pin it',
                n.pinned
                    ? 'This note is never swept: not when it has been resolved for 48 hours, not when its ttl passes, '
                        + 'not when a chain ends. Only deleting it by hand takes it off.\n\nClick to unpin.'
                    : 'The board sweeps itself: a note resolved more than 48 hours ago goes, and so does an expired '
                        + 'relay card. Pin one to keep it whatever the rules say.')}
            ${A.plus(n.id, cockpitId === n.id)}
            ${window.AFBulk.x(n.id, 'Delete this note for good')}
        </div>`;
        const cp = cockpitId === n.id ? A.cockpit({
            draft: draft, has: !!n.humanDirective, setAt: n.humanDirective && n.humanDirective.ts, msg: cockpitMsg,
            lede: 'your word on this note — every agent that reads it obeys this before its own rules'
        }) : '';
        const cls = `a2a-card${focusId === n.id ? ' a2a-focus' : ''}${state === 'live' ? '' : ' a2a-closed'}`
            + `${n.pinned ? ' pinned' : ''}${selected.has(n.id) ? ' sel' : ''}`;
        if (!open) { return `<div class="${cls}" data-id="${n.id}">${line}${cp}</div>`; }
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
            ${window.AFTip.wrap(`<button class="secondary danger" data-act="delete" data-id="${n.id}">✕ Delete</button>`,
                'Delete this note for good',
                'It leaves the board AND the disk. ✓ Resolve is the reversible one — it keeps the note as history '
                + 'and the sweep clears it 48 hours later.'
                + (n.pinned ? '\n\n📌 This note is pinned: the sweep spares it, but your hand does not.' : ''))}
        </div>`;
        return `<div class="${cls}" data-id="${n.id}">${line}${cp}
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
            list = chainLock
                ? `<p class="muted a2a-empty">⑂ Chain <code>${esc(chainLock)}</code> has no cards left on the board — a race is swept a day after it ends. <code>baton.status chain=${esc(chainLock)}</code> still has the record.</p>`
                : batonMode === 'only'
                    ? `<p class="muted a2a-empty">⑂ No relay cards. A baton pass hangs one per leg — <code>baton.pass</code> on the bridge, or ⑂ Relay in the Console composer.</p>`
                    : `<p class="muted a2a-empty">🕊️ No notes match. Agents leave notes for each other here — <code>a2a.notes.post</code> on the bridge; a reader picks them up by project, subsystem, topic and role.</p>`;
        } else {
            list = window.AFBulk.days(items, card, DATA.now);
        }
        document.getElementById('app').innerHTML = `${A.STYLE}
            ${window.AFHeader.tabs('a2anotes')}
            ${window.AFHeader.html({
                page: 'a2anotes', title: '🤖 A2A Notes',
                sub: `${all.length} total · ${live} live · showing ${items.length}`
                    + `${selected.size ? ` · ${selected.size} selected` : ''}`
                    + `${chainLock ? ` · locked to chain ${chainLock}` : ''} · ${window.AFTime.clockUtc(DATA.generatedAt)}`,
                controls: A.controls('an', {
                    query, pickers: filterPickers(),
                    extra: extraControls(),
                    actions: bulkBar(items),
                    searchTip: window.AFQuery.tip('Searched against the title, body, topic, subsystem, target role, author, category and file paths.')
                }),
                related: [{ label: '📥 Queue', name: 'Work Queue', nav: 'queue' }]
            })}
            ${chainBar(items)}
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
            onReset: () => {
                fState = DEF.fState; fCat = DEF.fCat; fFrom = DEF.fFrom; fProject = DEF.fProject; query = DEF.query;
                batonMode = DEF.batonMode; chainLock = null; selected.clear();
                saveState(); render();
            }
        });
        const items = visible();
        const bind = (id, ev, fn) => { const el = document.getElementById(id); if (el) { el.addEventListener(ev, fn); } };
        bind('an-baton', 'click', () => { batonMode = BATON_MODES[batonMode].next; saveState(); render(); });
        bind('an-unchain', 'click', () => { chainLock = null; saveState(); render(); });
        document.querySelectorAll('[data-chain]').forEach(c => c.addEventListener('click', ev => {
            ev.stopPropagation();
            chainLock = c.dataset.chain;
            selected.clear();
            saveState(); render();
        }));
        document.querySelectorAll('[data-pinrow]').forEach(p => p.addEventListener('click', ev => {
            ev.stopPropagation();
            vscode.postMessage({ type: 'pin', id: p.dataset.pinrow, pinned: p.dataset.pin === '1' });
        }));
        window.AFBulk.wire({
            allId: 'an-selall', selected: selected, shown: () => items.map(n => n.id), repaint: render,
            onRowDelete: id => { expanded.delete(id); vscode.postMessage({ type: 'delete', id: id }); },
            onBulk: (a, ids) => {
                if (a === 'bulkDelete') {
                    if (!ids.length) { return; }
                    ids.forEach(id => expanded.delete(id));
                    selected.clear();
                    vscode.postMessage({ type: 'deleteMany', ids: ids });
                } else if (a === 'clearResolved') {
                    vscode.postMessage({ type: 'clear', resolvedOnly: true });
                }
            }
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
        document.querySelectorAll('[data-plus]').forEach(b => b.addEventListener('click', ev => {
            ev.stopPropagation();
            const id = b.dataset.plus;
            if (cockpitId === id) { closeCockpit(); } else { openCockpit(id); }
            render();
        }));
        A.wireCockpit({
            focus: focusCockpit,
            onEdit: v => { draft = Object.assign(draft || {}, v); },
            onCancel: () => { closeCockpit(); render(); },
            onSubmit: v => {
                draft = Object.assign(draft || {}, v);
                const text = (v.text || '').trim();
                if (!text) {
                    cockpitMsg = 'Say what the agent must do. A directive outranks every rule it has; an empty one outranks them with nothing.';
                    render();
                    return;
                }
                vscode.postMessage({ type: 'directiveSet', id: cockpitId, kind: v.kind, text: text });
                closeCockpit(); render();
            },
            onAct: a => {
                if (a !== 'dremove') { return; }
                vscode.postMessage({ type: 'directiveRemove', id: cockpitId });
                closeCockpit(); render();
            }
        });
        focusCockpit = false;
    }

    const repaint = window.AFRepaint.guard(render);
    window.addEventListener('message', ev => {
        if (ev.data.type === 'data') {
            DATA = ev.data.data;
            if (DATA.focusId) { focusId = DATA.focusId; expanded.add(focusId); }
            // A cockpit open on a row this push no longer carries is a form
            // editing nothing.
            if (cockpitId && !(DATA.notes || []).some(n => n.id === cockpitId)) { closeCockpit(); }
            repaint();
        }
    });
    if (focusId) { expanded.add(focusId); }
    render();
})();
