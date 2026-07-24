// Agent Farm — Notices page. Agent→user board. ONE line per notice on the
// root; click to expand into a rich body / independently-collapsible sections.
// Type + Level filters, search, user stars, sort, reset, row-pin, quick edit
// (+ diff), and Export MD (page + per-notice). Self-contained.
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    let DATA = window.__DATA__;

    const st = (typeof vscode.getState === 'function' && vscode.getState()) || {};
    const DEF = { fMode: 'all', fType: '', fLevel: 0, fAgent: '', fStatus: '', sortKey: 'newest', query: '', singleMode: false };
    let fMode = st.fMode || DEF.fMode;
    let fType = st.fType || DEF.fType;
    let fLevel = st.fLevel || DEF.fLevel;
    let fAgent = st.fAgent || DEF.fAgent;
    let fStatus = st.fStatus || DEF.fStatus;   // '' | open | answered | declined (questions)
    let sortKey = st.sortKey || DEF.sortKey;
    let query = st.query || DEF.query;
    let singleMode = st.singleMode !== undefined ? !!st.singleMode : DEF.singleMode;
    const expanded = new Set();     // open notice ids
    const openSec = new Set();      // "id#idx" open sections
    const selected = new Set();     // checked notice ids (bulk actions)
    const drafts = {};              // id -> answer draft
    const editing = new Set();      // ids in edit mode
    const editDrafts = {};          // id -> {title,type,level,tags,body,sections:[{title,body}]}
    const showOrig = new Set();     // ids showing the pre-edit original
    const converting = new Set();   // ids showing the "add to queue" inline box
    const convertDrafts = {};       // id -> text the user is writing for the queue
    const convertDelete = {};       // id -> bool: delete the notice on send (default true)
    let refocusSearch = false;
    let focusId = DATA.focusId || null;   // cross-link highlight (one shot)

    const TYPES = {
        update:     { icon: '📣', label: 'Update' },
        report:     { icon: '📄', label: 'Report' },
        result:     { icon: '✅', label: 'Result' },
        reminder:   { icon: '⏰', label: 'Reminder' },
        suggestion: { icon: '💡', label: 'Suggestion' },
        warning:    { icon: '⚠️', label: 'Warning' },
        question:   { icon: '❓', label: 'Question' }
    };
    const LEVELS = { 1: 'Routine', 2: 'Medium', 3: 'Important', 4: 'Ultra' };
    const SORTS = [
        ['newest', 'Newest first'], ['oldest', 'Oldest first'],
        ['level', 'Importance'], ['stars', 'My stars'],
        ['type', 'Type'], ['agent', 'Agent']
    ];

    function saveState() { if (vscode.setState) { vscode.setState({ fMode, fType, fLevel, fAgent, fStatus, sortKey, query, singleMode }); } }
    function esc(s) { return C.esc(String(s == null ? '' : s)); }
    function tmeta(t) { return TYPES[t] || TYPES.update; }
    function lvl(n) { return n.level >= 1 && n.level <= 4 ? n.level : 1; }
    function reportBase(p) { return String(p || '').split(/[\\/]/).pop(); }

    // ---- minimal safe markdown (escape first, then structural transforms) ----
    function mdInline(t) {
        t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, x, u) => `<a href="#" class="nt-link" data-href="${u}">${x}</a>`);
        t = t.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (m, p, u) => `${p}<a href="#" class="nt-link" data-href="${u}">${u}</a>`);
        t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
        t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
        return t;
    }
    function mdToHtml(src) {
        const lines = esc(src).split('\n');
        let html = '', inList = false, inCode = false;
        const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };
        for (const line of lines) {
            if (/^```/.test(line.trim())) { if (inCode) { html += '</pre>'; inCode = false; } else { closeList(); html += '<pre class="nt-code">'; inCode = true; } continue; }
            if (inCode) { html += line + '\n'; continue; }
            const h = line.match(/^(#{1,6})\s+(.*)$/);
            if (h) { closeList(); html += `<div class="nt-h">${mdInline(h[2])}</div>`; continue; }
            const li = line.match(/^\s*[-*]\s+(.*)$/);
            if (li) { if (!inList) { html += '<ul>'; inList = true; } html += `<li>${mdInline(li[1])}</li>`; continue; }
            if (!line.trim()) { closeList(); html += '<div class="nt-sp"></div>'; continue; }
            closeList(); html += `<div>${mdInline(line)}</div>`;
        }
        if (inCode) { html += '</pre>'; } closeList();
        return html;
    }

    function dayLabel(ts) {
        const d = new Date(ts), n = new Date();
        const k = x => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
        const y = new Date(n); y.setDate(n.getDate() - 1);
        if (k(d) === k(n)) { return 'Today'; }
        if (k(d) === k(y)) { return 'Yesterday'; }
        return d.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
    }
    function timeLabel(ts) { return new Date(ts).toLocaleString(undefined, { hour: '2-digit', minute: '2-digit' }); }

    function haystack(n) {
        return [n.title, n.body || '', (n.sections || []).map(s => s.title + ' ' + s.body).join(' '),
            (n.tags || []).join(' '), n.agentName].join(' ').toLowerCase();
    }
    function matchesQuery(n) {
        const q = query.trim().toLowerCase();
        if (!q) { return true; }
        if (q[0] === '#') { const t = q.slice(1); return (n.tags || []).some(x => x.toLowerCase().indexOf(t) >= 0); }
        return haystack(n).indexOf(q) >= 0;
    }

    function visible() {
        let list = (DATA.notices || []).filter(n =>
            (fMode !== 'unread' || !n.read) &&
            (fMode !== 'questions' || n.type === 'question') &&
            (!fType || n.type === fType) &&
            (!fLevel || lvl(n) === Number(fLevel)) &&
            (!fAgent || n.agentName === fAgent) &&
            (!fStatus || (n.type === 'question' && (n.status || 'open') === fStatus)) &&
            matchesQuery(n));
        const by = {
            newest: (a, b) => b.ts - a.ts, oldest: (a, b) => a.ts - b.ts,
            level: (a, b) => lvl(b) - lvl(a) || b.ts - a.ts,
            stars: (a, b) => (b.stars || 0) - (a.stars || 0) || b.ts - a.ts,
            type: (a, b) => a.type.localeCompare(b.type) || b.ts - a.ts,
            agent: (a, b) => a.agentName.localeCompare(b.agentName) || b.ts - a.ts
        }[sortKey] || ((a, b) => b.ts - a.ts);
        return list.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || by(a, b));
    }

    function starsHtml(n) {
        const s = n.stars || 0;
        let out = `<span class="nt-stars" data-id="${esc(n.id)}">`;
        for (let i = 1; i <= 3; i++) { out += `<span class="nt-star ${i <= s ? 'on' : ''}" data-star="${i}" title="${i} star(s)">${i <= s ? '★' : '☆'}</span>`; }
        return out + '</span>';
    }
    function statusBadge(n) {
        if (n.type !== 'question') { return ''; }
        const s = n.status || 'open';
        if (s === 'answered') { return '<span class="nt-badge ok">✓ answered</span>'; }
        if (s === 'declined') { return '<span class="nt-badge muted">✕ declined</span>'; }
        return '<span class="nt-badge warn">waiting…</span>';
    }

    function questionBlock(n) {
        if (n.type !== 'question') { return ''; }
        const s = n.status || 'open';
        if (s === 'answered') { return `<div class="nt-answer"><div class="muted small">Your answer${n.answeredAt ? ' · ' + esc(new Date(n.answeredAt).toLocaleString()) : ''}:</div><div class="nt-md">${mdToHtml(n.answer || '')}</div></div>`; }
        if (s === 'declined') { return `<div class="muted small nt-answer">✕ You dismissed this question without answering. The agent will see it was passed over.</div>`; }
        const draft = drafts[n.id] != null ? drafts[n.id] : '';
        const del = convertDelete[n.id] !== undefined ? convertDelete[n.id] : true;
        // Answering a question IS leaving a new task → the answer auto-becomes a
        // queue item; the notice is deleted by default (uncheck to keep it).
        return `<div class="nt-qbox"><textarea class="nt-atext" data-id="${esc(n.id)}" rows="3" placeholder="Type your answer — it's auto-added to the work queue as a task…">${esc(draft)}</textarea>
            <label class="nt-del"><input type="checkbox" class="nt-delcb" data-id="${esc(n.id)}" ${del ? 'checked' : ''}> delete this message on send</label>
            <div class="btnrow"><button data-act="answer" data-id="${esc(n.id)}">Send answer → queue</button>
            <button class="secondary" data-act="decline" data-id="${esc(n.id)}">Dismiss (no answer)</button></div></div>`;
    }

    // Queue items this notice spawned (the bi-directional link) — shown inside
    // the notice so "what did I turn this into, what did I write" stays visible.
    function spawnedHtml(n) {
        if (!n.spawnedItems || !n.spawnedItems.length) { return ''; }
        const rows = n.spawnedItems.map(s =>
            `<li><a href="#" class="nt-openitem" data-id="${esc(s.itemId)}" title="Go to the queue item">📥 ${esc(s.text || '(item)')}</a></li>`).join('');
        return `<div class="nt-spawned"><div class="muted small">🔁 Queue items spawned from this message:</div><ul>${rows}</ul></div>`;
    }

    // The "Add to queue" inline box (low-friction convert; default-delete).
    function convertHtml(n) {
        if (!converting.has(n.id)) { return ''; }
        const draft = convertDrafts[n.id] != null ? convertDrafts[n.id] : '';
        const del = convertDelete[n.id] !== undefined ? convertDelete[n.id] : true;
        return `<div class="nt-convert"><textarea class="nt-ctext" data-id="${esc(n.id)}" rows="2" placeholder="What should go to the queue? (your reply / elaboration)">${esc(draft)}</textarea>
            <label class="nt-del"><input type="checkbox" class="nt-cdelcb" data-id="${esc(n.id)}" ${del ? 'checked' : ''}> delete this message on send</label>
            <div class="btnrow"><button data-act="convertsend" data-id="${esc(n.id)}">📥 Send to queue</button>
            <button class="secondary" data-act="convertcancel" data-id="${esc(n.id)}">Cancel</button></div></div>`;
    }

    function sectionsHtml(n) {
        if (!n.sections || !n.sections.length) { return ''; }
        return '<div class="nt-secs">' + n.sections.map((sec, i) => {
            const key = n.id + '#' + i, open = openSec.has(key);
            return `<div class="nt-sec ${open ? 'open' : ''}"><div class="nt-sec-head" data-sec="${esc(key)}">
                <span class="nt-caret">${open ? '▾' : '▸'}</span><span class="nt-sec-title">${esc(sec.title)}</span></div>
                ${open ? `<div class="nt-sec-body nt-md">${mdToHtml(sec.body || '')}</div>` : ''}</div>`;
        }).join('') + '</div>';
    }

    function originalBlock(n) {
        if (!showOrig.has(n.id) || !n.original) { return ''; }
        const o = n.original;
        let h = `<div class="nt-orig"><div class="muted small">Original (before edits) — ${esc(TYPES[o.type] ? TYPES[o.type].label : o.type)} · L${o.level}${(o.tags || []).length ? ' · ' + o.tags.map(t => '#' + esc(t)).join(' ') : ''}</div>`;
        h += `<div class="nt-md"><strong>${esc(o.title)}</strong></div>`;
        if (o.body) { h += `<div class="nt-md">${mdToHtml(o.body)}</div>`; }
        for (const s of (o.sections || [])) { h += `<div class="nt-md"><em>${esc(s.title)}</em><br>${mdToHtml(s.body || '')}</div>`; }
        return h + '</div>';
    }

    function editForm(n) {
        const d = editDrafts[n.id];
        const typeOpts = Object.keys(TYPES).map(k => `<option value="${k}" ${d.type === k ? 'selected' : ''}>${TYPES[k].icon} ${TYPES[k].label}</option>`).join('');
        const lvlOpts = [1, 2, 3, 4].map(k => `<option value="${k}" ${Number(d.level) === k ? 'selected' : ''}>L${k} · ${LEVELS[k]}</option>`).join('');
        const secs = (d.sections || []).map((s, i) => `<div class="nt-esec">
            <input class="nt-ef" data-ef="sectitle" data-i="${i}" value="${esc(s.title)}" placeholder="Section title">
            <textarea class="nt-ef" data-ef="secbody" data-i="${i}" rows="3" placeholder="Section body">${esc(s.body)}</textarea></div>`).join('');
        return `<div class="nt-edit">
            <label>Title</label><input class="nt-ef" data-ef="title" value="${esc(d.title)}">
            <div class="nt-erow"><span><label>Type</label><select class="nt-ef" data-ef="type">${typeOpts}</select></span>
              <span><label>Level</label><select class="nt-ef" data-ef="level">${lvlOpts}</select></span></div>
            <label>Tags (comma-separated)</label><input class="nt-ef" data-ef="tags" value="${esc(d.tags)}">
            <label>Body (markdown)</label><textarea class="nt-ef" data-ef="body" rows="4">${esc(d.body)}</textarea>
            ${secs ? '<label>Sections</label>' + secs : ''}
            <div class="btnrow"><button data-act="editsave" data-id="${esc(n.id)}">Save</button>
              <button class="secondary" data-act="editcancel" data-id="${esc(n.id)}">Cancel</button></div>
        </div>`;
    }

    function noticeCard(n) {
        const t = tmeta(n.type), open = expanded.has(n.id), L = lvl(n), isQ = n.type === 'question';
        const inEdit = editing.has(n.id);
        const tags = (n.tags || []).map(x => `<span class="tag">#${esc(x)}</span>`).join(' ');
        const due = n.dueAt ? `<div class="muted small">⏰ due ${esc(new Date(n.dueAt).toLocaleString())}</div>` : '';
        let body = '';
        if (inEdit) { body = editForm(n); }
        else {
            const reportBtn = n.reportPath ? `<div class="nt-report">
                    <button data-act="openreport" data-id="${esc(n.id)}">📄 Tam raporu aç</button>
                    <span class="muted small nt-reppath" title="${esc(n.reportPath)}">${esc(reportBase(n.reportPath))}</span>
                </div>` : '';
            body = `<div class="muted small nt-sub">${esc(t.label)} · L${L} ${esc(LEVELS[L])}${n.edited ? ' · ✎ edited' + (n.editedAt ? ' ' + esc(new Date(n.editedAt).toLocaleString()) : '') : ''}</div>
                ${due}
                ${n.body ? `<div class="nt-md">${mdToHtml(n.body)}</div>` : (!n.sections && !isQ ? '<div class="muted small">(no details)</div>' : '')}
                ${sectionsHtml(n)}${reportBtn}${questionBlock(n)}${spawnedHtml(n)}${convertHtml(n)}${originalBlock(n)}
                <div class="btnrow nt-actions">
                    <button data-act="handoffNotice" data-id="${esc(n.id)}" title="Open the responsible agent and type this message into its terminal (not sent)">🔗 Hand to agent</button>
                    ${!isQ ? `<button data-act="convert" data-id="${esc(n.id)}" title="Turn this message into a queue item">📥 Add to queue</button>` : ''}
                    <button class="secondary" data-act="read" data-id="${esc(n.id)}" data-read="${n.read ? '0' : '1'}">${n.read ? 'Mark unread' : 'Mark read'}</button>
                    <button class="secondary" data-act="edit" data-id="${esc(n.id)}">Edit</button>
                    ${n.edited ? `<button class="secondary" data-act="orig" data-id="${esc(n.id)}">${showOrig.has(n.id) ? 'Hide original' : 'Show original'}</button>` : ''}
                    <button class="secondary" data-act="exportone" data-id="${esc(n.id)}">Export MD</button>
                    <button class="secondary" data-act="dismiss" data-id="${esc(n.id)}">${isQ ? 'Delete' : 'Dismiss'}</button>
                </div>`;
        }
        return `<div class="nt-card lvl-${L} ${n.read ? 'read' : 'unread'} ${n.pinned ? 'pinned' : ''} ${selected.has(n.id) ? 'sel' : ''}" data-id="${esc(n.id)}">
            <div class="nt-row" data-toggle="${esc(n.id)}">
                <input type="checkbox" class="nt-cb" data-cb="${esc(n.id)}" ${selected.has(n.id) ? 'checked' : ''} title="Select for bulk actions">
                <span class="nt-caret">${open ? '▾' : '▸'}</span>
                <span class="nt-ico" title="${esc(t.label)}">${t.icon}</span>
                <span class="nt-title" title="${esc(n.title)}">${esc(n.title)}</span>
                <span class="nt-lb lb-${L}" title="Level ${L} · ${esc(LEVELS[L])}">L${L}</span>
                ${n.reportPath ? '<span class="nt-badge rep" title="Full report attached — click to open inside">📄</span>' : ''}
                ${statusBadge(n)}${n.edited ? '<span class="nt-badge muted">✎</span>' : ''}
                ${tags ? `<span class="nt-tags">${tags}</span>` : ''}
                ${starsHtml(n)}
                <span class="nt-pin ${n.pinned ? 'on' : ''}" data-pinrow="${esc(n.id)}" data-pin="${n.pinned ? '0' : '1'}" title="${n.pinned ? 'Unpin' : 'Pin'}">📌</span>
                <span class="nt-meta muted small">${esc(n.agentName)} · ${esc(timeLabel(n.ts))}${n.read ? '' : ' <span class="nt-udot">●</span>'}</span>
            </div>
            <div class="nt-body" ${open ? '' : 'hidden'}>${body}</div>
        </div>`;
    }

    function chip(id, label, on) { return `<button class="af-chip ${on ? 'on' : 'secondary'}" data-chip="${id}">${esc(label)}</button>`; }

    function controls() {
        const total = (DATA.notices || []).length, unread = DATA.unread || 0, q = DATA.openQuestions || 0;
        const typeOpts = ['<option value="">All types</option>'].concat(Object.keys(TYPES).map(k => `<option value="${k}" ${fType === k ? 'selected' : ''}>${TYPES[k].icon} ${TYPES[k].label}</option>`)).join('');
        const lvlOpts = ['<option value="0">All levels</option>'].concat([4, 3, 2, 1].map(k => `<option value="${k}" ${Number(fLevel) === k ? 'selected' : ''}>L${k} · ${LEVELS[k]}</option>`)).join('');
        const agentOpts = ['<option value="">All agents</option>'].concat((DATA.agents || []).map(a => `<option value="${esc(a)}" ${fAgent === a ? 'selected' : ''}>${esc(a)}</option>`)).join('');
        const statusOpts = ['<option value="">Any status</option>'].concat(
            [['open', '❓ Waiting'], ['answered', '✓ Answered'], ['declined', '✕ Declined']]
                .map(([k, l]) => `<option value="${k}" ${fStatus === k ? 'selected' : ''}>${l}</option>`)).join('');
        const sortOpts = SORTS.map(([k, l]) => `<option value="${k}" ${sortKey === k ? 'selected' : ''}>Sort: ${l}</option>`).join('');
        return `<div class="nt-controls">
            <input id="nt-search" type="search" placeholder="🔍 search (text or #tag)" value="${esc(query)}">
            ${chip('all', `All (${total})`, fMode === 'all')}
            ${chip('unread', `Unread (${unread})`, fMode === 'unread')}
            ${chip('questions', `❓ (${q})`, fMode === 'questions')}
            <select id="nt-type">${typeOpts}</select>
            <select id="nt-level">${lvlOpts}</select>
            <select id="nt-agent">${agentOpts}</select>
            <select id="nt-status" title="Question status (answered / waiting / dismissed)">${statusOpts}</select>
            <select id="nt-sort">${sortOpts}</select>
            <button class="secondary" id="nt-reset" title="Reset filters, search and sort">↺ Reset</button>
        </div>`;
    }
    function actionsHtml() {
        const undo = DATA.undoable || 0;
        return `<span class="nt-grp">
                <button class="secondary" data-hact="expandAll" title="Open every shown notice">⊕ Expand all</button>
                <button class="secondary" data-hact="collapseAll" title="Close all">⊖ Collapse all</button>
                <button class="secondary ${singleMode ? 'on' : ''}" data-hact="single" aria-pressed="${singleMode}" title="Only one notice open at a time: opening one folds the previous${singleMode ? ' — currently ON' : ''}">${singleMode ? '◉' : '◯'} Single-open</button>
            </span>
            <span class="nt-grp nt-bulk">
                <label class="nt-selall" title="Select / deselect all shown"><input type="checkbox" id="nt-selall"> all</label>
                <button data-hact="bulkRead" title="Mark selected read (or all shown if none selected)">✓ Read</button>
                <button class="secondary" data-hact="bulkUnread" title="Mark selected unread (or all shown)">○ Unread</button>
                <button class="secondary danger" data-hact="bulkDelete" title="Delete selected (or all shown if none selected)">🗑 Delete</button>
            </span>
            <span class="nt-grp">
                <button class="secondary" data-hact="clearRead" title="Delete read notices — pinned, starred and unhandled questions are kept">Clear read</button>
                <button data-hact="export">⬇ Export MD</button>
                <button class="secondary nt-undo" data-hact="undo" ${undo ? '' : 'disabled'} title="${undo ? 'Restore the ' + undo + ' notice(s) just deleted' : 'Nothing to undo'}">↶ Undo</button>
            </span>`;
    }

    const STYLE = `<style>
        .nt-controls { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
        .nt-controls select, .nt-controls input { padding:3px 6px; }
        #nt-search { min-width:180px; }
        .af-chip { padding:3px 10px; border-radius:12px; }
        .af-chip.on { background:var(--vscode-button-background); color:var(--vscode-button-foreground); }
        button.secondary.on { background:var(--vscode-button-background); color:var(--vscode-button-foreground); box-shadow:inset 0 0 0 1px var(--vscode-focusBorder, #007fd4); font-weight:600; }
        button.secondary.on:hover { background:var(--vscode-button-hoverBackground); }
        .nt-card { border:1px solid var(--vscode-panel-border); border-left-width:3px; border-radius:6px; margin:6px 0; overflow:hidden; }
        .nt-card.lvl-1 { border-left-color:var(--vscode-panel-border); }
        .nt-card.lvl-2 { border-left-color:var(--vscode-charts-blue, #3794ff); }
        .nt-card.lvl-3 { border-left-color:var(--vscode-charts-orange, #e9a700); }
        .nt-card.lvl-4 { border-left-color:var(--vscode-editorError-foreground, #e51400); }
        .nt-card.lvl-1 .nt-title { opacity:.85; }
        .nt-card.lvl-3 .nt-title, .nt-card.lvl-4 .nt-title { font-weight:700; }
        .nt-card.read .nt-title { font-weight:400; opacity:.78; }
        .nt-card.pinned { background:var(--vscode-editorWidget-background); }
        .nt-card.sel { background:color-mix(in srgb, var(--vscode-button-background) 12%, transparent); }
        .nt-cb { flex-shrink:0; margin:0; cursor:pointer; }
        .nt-grp { display:inline-flex; gap:6px; align-items:center; padding-right:8px; margin-right:2px; border-right:1px solid var(--vscode-panel-border); }
        .nt-grp:last-child { border-right:none; }
        .nt-bulk .nt-selall { display:inline-flex; gap:3px; align-items:center; font-size:11px; opacity:.85; cursor:pointer; }
        button.danger:hover { background:var(--vscode-inputValidation-errorBackground, #5a1d1d); border-color:var(--vscode-editorError-foreground, #e51400); }
        .nt-undo { color:var(--vscode-charts-yellow, #e2c08d); }
        .nt-row { display:flex; gap:8px; align-items:center; padding:8px 10px; cursor:pointer; }
        .nt-row:hover { background:var(--vscode-list-hoverBackground); }
        .nt-caret { width:12px; opacity:.7; flex-shrink:0; }
        .nt-ico { flex-shrink:0; }
        .nt-title { flex:0 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:600; }
        .nt-lb { font-size:9px; font-weight:700; border-radius:3px; padding:1px 4px; flex-shrink:0; border:1px solid var(--vscode-panel-border); opacity:.85; }
        .lb-2 { color:var(--vscode-charts-blue, #3794ff); } .lb-3 { color:var(--vscode-charts-orange, #e9a700); }
        .lb-4 { color:var(--vscode-editorError-foreground, #e51400); border-color:var(--vscode-editorError-foreground, #e51400); }
        .nt-tags, .nt-stars, .nt-pin { flex-shrink:0; }
        .nt-stars { letter-spacing:1px; }
        .nt-star { cursor:pointer; opacity:.55; } .nt-star.on { color:var(--vscode-charts-yellow, #e2c08d); opacity:1; }
        .nt-pin { cursor:pointer; opacity:.3; filter:grayscale(1); } .nt-pin:hover { opacity:.7; } .nt-pin.on { opacity:1; filter:none; }
        .nt-meta { margin-left:auto; flex-shrink:0; white-space:nowrap; }
        .nt-udot { color:var(--vscode-button-background); }
        .nt-badge { font-size:10px; border-radius:8px; padding:1px 7px; flex-shrink:0; border:1px solid var(--vscode-panel-border); }
        .nt-badge.ok { color:var(--vscode-charts-green, #89d185); }
        .nt-badge.warn { color:var(--vscode-charts-orange, #e9a700); border-color:var(--vscode-charts-orange, #e9a700); }
        .nt-badge.rep { cursor:default; }
        .nt-report { display:flex; gap:8px; align-items:center; margin:8px 0; padding:6px 8px; border-left:3px solid var(--vscode-textLink-foreground); background:var(--vscode-editorWidget-background); border-radius:4px; }
        .nt-report .nt-reppath { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .nt-body { padding:2px 12px 12px 32px; border-top:1px solid var(--vscode-panel-border); }
        .nt-sub { margin:4px 0; text-transform:uppercase; letter-spacing:.04em; font-size:10px; }
        .nt-md { margin:4px 0; line-height:1.5; word-break:break-word; }
        .nt-md .nt-h { font-weight:700; margin:8px 0 2px; } .nt-md .nt-sp { height:6px; } .nt-md ul { margin:4px 0; padding-left:20px; }
        .nt-code { background:var(--vscode-textCodeBlock-background); padding:8px; border-radius:4px; overflow-x:auto; white-space:pre; }
        .nt-link { color:var(--vscode-textLink-foreground); cursor:pointer; }
        .nt-secs { margin:6px 0; border:1px solid var(--vscode-panel-border); border-radius:5px; }
        .nt-sec { border-top:1px solid var(--vscode-panel-border); } .nt-sec:first-child { border-top:none; }
        .nt-sec-head { display:flex; gap:6px; align-items:center; padding:6px 8px; cursor:pointer; font-weight:600; }
        .nt-sec-head:hover { background:var(--vscode-list-hoverBackground); }
        .nt-sec-body { padding:0 10px 8px 26px; }
        .nt-qbox { margin:8px 0; } .nt-atext { width:100%; box-sizing:border-box; padding:6px; font-family:inherit; resize:vertical; }
        .nt-answer { margin:6px 0; padding:8px; border-left:3px solid var(--vscode-charts-green, #89d185); background:var(--vscode-editorWidget-background); border-radius:4px; }
        .nt-orig { margin:6px 0; padding:8px; border-left:3px solid var(--vscode-panel-border); background:var(--vscode-editorWidget-background); border-radius:4px; opacity:.85; }
        .nt-edit label { display:block; font-size:10px; text-transform:uppercase; opacity:.7; margin:6px 0 2px; }
        .nt-edit input, .nt-edit textarea, .nt-edit select { width:100%; box-sizing:border-box; padding:5px; font-family:inherit; }
        .nt-erow { display:flex; gap:10px; } .nt-erow span { flex:1; }
        .nt-esec { border:1px solid var(--vscode-panel-border); border-radius:4px; padding:6px; margin:4px 0; }
        .nt-actions { margin-top:8px; }
        .tag { font-size:10px; opacity:.7; border:1px solid var(--vscode-panel-border); border-radius:3px; padding:1px 5px; }
        .nt-day { margin:16px 0 4px; font-size:11px; letter-spacing:.05em; text-transform:uppercase; opacity:.6; }
        .nt-del { display:inline-flex; gap:4px; align-items:center; font-size:11px; opacity:.8; margin:4px 0; }
        .nt-convert { margin:8px 0; padding:8px; border:1px solid var(--vscode-panel-border); border-radius:5px; background:var(--vscode-editorWidget-background); }
        .nt-convert textarea { width:100%; box-sizing:border-box; padding:6px; font-family:inherit; resize:vertical; }
        .nt-spawned { margin:6px 0; padding:6px 8px; border-left:3px solid var(--vscode-textLink-foreground); background:var(--vscode-editorWidget-background); border-radius:4px; }
        .nt-spawned ul { margin:4px 0; padding-left:18px; }
        .nt-openitem { color:var(--vscode-textLink-foreground); cursor:pointer; }
    </style>`;

    function render() {
        const items = visible();
        let listHtml = '';
        if (!items.length) {
            listHtml = '<p class="muted" style="margin-top:24px">🕊️ No notices match. Agents post updates, reports, reminders, suggestions, warnings and questions here — one line each; click to read.</p>';
        } else if ((sortKey === 'newest' || sortKey === 'oldest') && !query) {
            let lastDay = '';
            for (const n of items) { const d = dayLabel(n.ts); if (d !== lastDay) { listHtml += `<div class="nt-day">${esc(d)}</div>`; lastDay = d; } listHtml += noticeCard(n); }
        } else { listHtml = items.map(noticeCard).join(''); }

        document.getElementById('app').innerHTML = `${STYLE}
            ${window.AFHeader.tabs('notices')}
            ${window.AFHeader.html({
                page: 'notices', title: '🔔 Notices',
                sub: `${(DATA.notices || []).length} total · ${DATA.unread || 0} unread · ${DATA.openQuestions || 0} open question(s) · showing ${items.length}${selected.size ? ` · ${selected.size} selected` : ''} · ${new Date(DATA.generatedAt).toLocaleTimeString()}`,
                controls: controls(), actions: actionsHtml()
            })}
            ${listHtml}`;
        window.AFHeader.wire(vscode);
        wire(items);
        if (refocusSearch) { const s = document.getElementById('nt-search'); if (s) { s.focus(); const v = s.value.length; try { s.setSelectionRange(v, v); } catch (e) {} } refocusSearch = false; }
        if (focusId) {
            const el = document.querySelector(`.nt-card[data-id="${focusId}"]`);
            if (el) { el.scrollIntoView({ block: 'center' }); }
            focusId = null;   // one-shot highlight
        }
    }

    function currentEditValues(id) {
        const d = editDrafts[id]; if (!d) { return; }
        const scope = document.querySelector(`.nt-card[data-id="${id}"] .nt-edit`); if (!scope) { return; }
        scope.querySelectorAll('[data-ef]').forEach(el => {
            const f = el.dataset.ef;
            if (f === 'sectitle') { d.sections[el.dataset.i].title = el.value; }
            else if (f === 'secbody') { d.sections[el.dataset.i].body = el.value; }
            else { d[f] = el.value; }
        });
    }

    function wire(items) {
        const bind = (id, ev, fn) => { const el = document.getElementById(id); if (el) { el.addEventListener(ev, fn); } };
        document.querySelectorAll('[data-chip]').forEach(b => b.addEventListener('click', () => { fMode = b.dataset.chip; saveState(); render(); }));
        bind('nt-type', 'change', e => { fType = e.target.value; saveState(); render(); });
        bind('nt-level', 'change', e => { fLevel = Number(e.target.value) || 0; saveState(); render(); });
        bind('nt-agent', 'change', e => { fAgent = e.target.value; saveState(); render(); });
        bind('nt-status', 'change', e => { fStatus = e.target.value; saveState(); render(); });
        bind('nt-sort', 'change', e => { sortKey = e.target.value; saveState(); render(); });
        bind('nt-search', 'input', e => { query = e.target.value; refocusSearch = true; saveState(); render(); });
        bind('nt-reset', 'click', () => { fMode = DEF.fMode; fType = DEF.fType; fLevel = DEF.fLevel; fAgent = DEF.fAgent; fStatus = DEF.fStatus; sortKey = DEF.sortKey; query = DEF.query; saveState(); render(); });

        // bulk actions run on the SELECTED ids, or — if nothing is checked — on
        // everything currently shown (the active filter).
        const bulkTargets = () => selected.size ? [...selected] : items.map(n => n.id);
        document.querySelectorAll('[data-hact]').forEach(b => b.addEventListener('click', () => {
            const a = b.dataset.hact;
            if (a === 'clearRead') { vscode.postMessage({ type: 'clearRead' }); }
            else if (a === 'export') { vscode.postMessage({ type: 'exportChoose', shown: items.map(n => n.id), open: [...expanded] }); }
            else if (a === 'undo') { vscode.postMessage({ type: 'undo' }); }
            else if (a === 'expandAll') { items.forEach(n => expanded.add(n.id)); render(); }
            else if (a === 'collapseAll') { expanded.clear(); render(); }
            else if (a === 'single') {
                singleMode = !singleMode;
                if (singleMode && expanded.size > 1) { const keep = items.find(n => expanded.has(n.id)); expanded.clear(); if (keep) { expanded.add(keep.id); } }
                saveState(); render();
            }
            else if (a === 'bulkRead') { const ids = bulkTargets(); if (ids.length) { vscode.postMessage({ type: 'markReadMany', ids, read: true }); } }
            else if (a === 'bulkUnread') { const ids = bulkTargets(); if (ids.length) { vscode.postMessage({ type: 'markReadMany', ids, read: false }); } }
            else if (a === 'bulkDelete') { const ids = bulkTargets(); if (ids.length) { ids.forEach(id => expanded.delete(id)); selected.clear(); vscode.postMessage({ type: 'dismissMany', ids }); } }
        }));

        // select-all reflects/controls the shown rows (classic tri-state header box)
        const selAll = document.getElementById('nt-selall');
        if (selAll) {
            const visIds = items.map(n => n.id), selVis = visIds.filter(id => selected.has(id)).length;
            selAll.checked = visIds.length > 0 && selVis === visIds.length;
            selAll.indeterminate = selVis > 0 && selVis < visIds.length;
            selAll.addEventListener('change', () => {
                if (selAll.checked) { visIds.forEach(id => selected.add(id)); } else { visIds.forEach(id => selected.delete(id)); }
                render();
            });
        }
        // per-row checkbox: stop the row from toggling; update the selection
        document.querySelectorAll('.nt-cb').forEach(cb => {
            cb.addEventListener('click', ev => ev.stopPropagation());
            cb.addEventListener('change', ev => {
                ev.stopPropagation();
                if (cb.checked) { selected.add(cb.dataset.cb); } else { selected.delete(cb.dataset.cb); }
                render();
            });
        });

        document.querySelectorAll('[data-toggle]').forEach(row => row.addEventListener('click', () => {
            const id = row.dataset.toggle;
            if (expanded.has(id)) { expanded.delete(id); }
            else {
                if (singleMode) { expanded.clear(); }
                expanded.add(id);
                // opening a notice marks it read automatically (a question's real
                // state is answered/not — its read flag just clears the bell)
                const n = (DATA.notices || []).find(x => x.id === id);
                if (n && !n.read) { vscode.postMessage({ type: 'markRead', id, read: true }); }
            }
            render();
        }));
        document.querySelectorAll('[data-sec]').forEach(h => h.addEventListener('click', ev => {
            ev.stopPropagation(); const k = h.dataset.sec; if (openSec.has(k)) { openSec.delete(k); } else { openSec.add(k); } render();
        }));
        document.querySelectorAll('.nt-star').forEach(s => s.addEventListener('click', ev => {
            ev.stopPropagation(); const id = s.closest('.nt-stars').dataset.id, clicked = Number(s.dataset.star);
            const cur = (DATA.notices.find(n => n.id === id) || {}).stars || 0;
            vscode.postMessage({ type: 'setStars', id, stars: clicked === cur ? 0 : clicked });
        }));
        document.querySelectorAll('[data-pinrow]').forEach(p => p.addEventListener('click', ev => {
            ev.stopPropagation(); vscode.postMessage({ type: 'pin', id: p.dataset.pinrow, pinned: p.dataset.pin === '1' });
        }));
        document.querySelectorAll('.nt-atext').forEach(t => t.addEventListener('input', () => { drafts[t.dataset.id] = t.value; }));
        document.querySelectorAll('.nt-ctext').forEach(t => t.addEventListener('input', () => { convertDrafts[t.dataset.id] = t.value; }));
        document.querySelectorAll('.nt-delcb, .nt-cdelcb').forEach(cb => cb.addEventListener('change', ev => { ev.stopPropagation(); convertDelete[cb.dataset.id] = cb.checked; }));
        document.querySelectorAll('.nt-openitem').forEach(a => a.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); vscode.postMessage({ type: 'openQueueItem', id: a.dataset.id }); }));
        document.querySelectorAll('.nt-edit [data-ef]').forEach(el => el.addEventListener('input', () => {
            const id = el.closest('.nt-card').dataset.id, d = editDrafts[id]; if (!d) { return; }
            const f = el.dataset.ef;
            if (f === 'sectitle') { d.sections[el.dataset.i].title = el.value; }
            else if (f === 'secbody') { d.sections[el.dataset.i].body = el.value; }
            else { d[f] = el.value; }
        }));

        const delChecked = (sel, id) => { const cb = document.querySelector(`${sel}[data-id="${id}"]`); return cb ? cb.checked : true; };
        document.querySelectorAll('.nt-actions [data-act], .nt-qbox [data-act], .nt-edit [data-act], .nt-report [data-act], .nt-convert [data-act]').forEach(b => b.addEventListener('click', ev => {
            ev.stopPropagation();
            const id = b.dataset.id, act = b.dataset.act;
            if (act === 'read') { vscode.postMessage({ type: 'markRead', id, read: b.dataset.read === '1' }); }
            else if (act === 'openreport') { vscode.postMessage({ type: 'openReport', id }); }
            else if (act === 'dismiss') { expanded.delete(id); vscode.postMessage({ type: 'dismiss', id }); }
            else if (act === 'decline') { vscode.postMessage({ type: 'decline', id }); }
            else if (act === 'answer') {
                const t = (drafts[id] || '').trim();
                if (t) { delete drafts[id]; vscode.postMessage({ type: 'answer', id, text: t, deleteNotice: delChecked('.nt-delcb', id) }); }
            }
            else if (act === 'handoffNotice') { vscode.postMessage({ type: 'handoffNotice', id }); }
            else if (act === 'convert') { if (converting.has(id)) { converting.delete(id); } else { converting.add(id); expanded.add(id); } render(); }
            else if (act === 'convertcancel') { converting.delete(id); delete convertDrafts[id]; render(); }
            else if (act === 'convertsend') {
                const t = (convertDrafts[id] || '').trim();
                if (t) { converting.delete(id); delete convertDrafts[id]; vscode.postMessage({ type: 'convertToQueue', id, text: t, deleteNotice: delChecked('.nt-cdelcb', id) }); }
            }
            else if (act === 'exportone') { vscode.postMessage({ type: 'exportOne', id }); }
            else if (act === 'orig') { if (showOrig.has(id)) { showOrig.delete(id); } else { showOrig.add(id); } render(); }
            else if (act === 'edit') {
                const n = DATA.notices.find(x => x.id === id);
                editDrafts[id] = { title: n.title || '', type: n.type || 'update', level: lvl(n), tags: (n.tags || []).join(', '), body: n.body || '', sections: (n.sections || []).map(s => ({ title: s.title, body: s.body })) };
                editing.add(id); expanded.add(id); render();
            }
            else if (act === 'editcancel') { currentEditValues(id); editing.delete(id); delete editDrafts[id]; render(); }
            else if (act === 'editsave') {
                currentEditValues(id); const d = editDrafts[id];
                vscode.postMessage({ type: 'edit', id, patch: { title: d.title, type: d.type, level: Number(d.level), tags: d.tags, body: d.body, sections: d.sections } });
                editing.delete(id); delete editDrafts[id];
            }
        }));
        document.querySelectorAll('.nt-link').forEach(a => a.addEventListener('click', ev => {
            ev.preventDefault(); ev.stopPropagation(); vscode.postMessage({ type: 'openExternal', url: a.dataset.href });
        }));
    }

    window.addEventListener('message', ev => {
        if (ev.data.type === 'data') {
            DATA = ev.data.data;
            const ids = new Set((DATA.notices || []).map(n => n.id));
            [...selected].forEach(id => { if (!ids.has(id)) { selected.delete(id); } });
            if (DATA.focusId) { focusId = DATA.focusId; expanded.add(focusId); }
            render();
        }
    });
    if (focusId) { expanded.add(focusId); }
    render();
})();
