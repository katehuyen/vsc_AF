// Agent Farm — Notices page. Agent→user board. ONE line per notice on the
// root; click to expand into a rich body / independently-collapsible sections;
// question-type notices carry an answer box. Type + Level (importance) filters,
// user stars, sort. Fully self-contained — touches nothing but its own store.
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    let DATA = window.__DATA__;

    const st = (typeof vscode.getState === 'function' && vscode.getState()) || {};
    let fMode = st.fMode || 'all';       // 'all' | 'unread' | 'questions'
    let fType = st.fType || '';          // '' | type id
    let fLevel = st.fLevel || 0;         // 0 | 1..4
    let fAgent = st.fAgent || '';        // '' | agent name
    let sortKey = st.sortKey || 'newest';
    const expanded = new Set();          // open notice ids
    const openSec = new Set();           // "id#idx" open sections
    const drafts = {};                   // id -> answer draft (survives re-render)

    const TYPES = {
        update:   { icon: '📰', label: 'Update' },
        reminder: { icon: '⏰', label: 'Reminder' },
        report:   { icon: '📄', label: 'Report' },
        question: { icon: '❓', label: 'Question' }
    };
    const LEVELS = {
        1: { label: 'Routine' }, 2: { label: 'Medium' },
        3: { label: 'Important' }, 4: { label: 'Ultra' }
    };
    const SORTS = [
        ['newest', 'Newest first'], ['oldest', 'Oldest first'],
        ['level', 'Importance'], ['stars', 'My stars'],
        ['type', 'Type'], ['agent', 'Agent']
    ];

    function saveState() { if (vscode.setState) { vscode.setState({ fMode, fType, fLevel, fAgent, sortKey }); } }
    function esc(s) { return C.esc(String(s == null ? '' : s)); }

    // ---- minimal, safe markdown (escape first, then structural transforms) ----
    function mdInline(t) {
        t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
            (m, txt, url) => `<a href="#" class="nt-link" data-href="${url}">${txt}</a>`);
        t = t.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g,
            (m, pre, url) => `${pre}<a href="#" class="nt-link" data-href="${url}">${url}</a>`);
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
            if (/^```/.test(line.trim())) {
                if (inCode) { html += '</pre>'; inCode = false; }
                else { closeList(); html += '<pre class="nt-code">'; inCode = true; }
                continue;
            }
            if (inCode) { html += line + '\n'; continue; }
            const h = line.match(/^(#{1,6})\s+(.*)$/);
            if (h) { closeList(); html += `<div class="nt-h">${mdInline(h[2])}</div>`; continue; }
            const li = line.match(/^\s*[-*]\s+(.*)$/);
            if (li) { if (!inList) { html += '<ul>'; inList = true; } html += `<li>${mdInline(li[1])}</li>`; continue; }
            if (!line.trim()) { closeList(); html += '<div class="nt-sp"></div>'; continue; }
            closeList();
            html += `<div>${mdInline(line)}</div>`;
        }
        if (inCode) { html += '</pre>'; }
        closeList();
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

    function visible() {
        let list = (DATA.notices || []).filter(n =>
            (fMode !== 'unread' || !n.read) &&
            (fMode !== 'questions' || n.type === 'question') &&
            (!fType || n.type === fType) &&
            (!fLevel || n.level === fLevel) &&
            (!fAgent || n.agentName === fAgent));
        const by = {
            newest: (a, b) => b.ts - a.ts,
            oldest: (a, b) => a.ts - b.ts,
            level: (a, b) => (b.level || 1) - (a.level || 1) || b.ts - a.ts,
            stars: (a, b) => (b.stars || 0) - (a.stars || 0) || b.ts - a.ts,
            type: (a, b) => a.type.localeCompare(b.type) || b.ts - a.ts,
            agent: (a, b) => a.agentName.localeCompare(b.agentName) || b.ts - a.ts
        }[sortKey] || ((a, b) => b.ts - a.ts);
        // pinned always float to the top, then the chosen sort
        return list.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || by(a, b));
    }

    function starsHtml(n) {
        const s = n.stars || 0;
        let out = '<span class="nt-stars" data-id="' + esc(n.id) + '">';
        for (let i = 1; i <= 3; i++) {
            out += `<span class="nt-star ${i <= s ? 'on' : ''}" data-star="${i}" title="${i} star(s)">${i <= s ? '★' : '☆'}</span>`;
        }
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
        if (s === 'answered') {
            return `<div class="nt-answer"><div class="muted small">Your answer${n.answeredAt ? ' · ' + esc(new Date(n.answeredAt).toLocaleString()) : ''}:</div>
                <div class="nt-md">${mdToHtml(n.answer || '')}</div></div>`;
        }
        if (s === 'declined') {
            return `<div class="muted small nt-answer">✕ You dismissed this question without answering. The agent will see it was passed over.</div>`;
        }
        const draft = drafts[n.id] != null ? drafts[n.id] : '';
        return `<div class="nt-qbox">
            <textarea class="nt-atext" data-id="${esc(n.id)}" rows="3" placeholder="Type your answer…">${esc(draft)}</textarea>
            <div class="btnrow">
                <button data-act="answer" data-id="${esc(n.id)}">Send answer</button>
                <button class="secondary" data-act="decline" data-id="${esc(n.id)}">Dismiss (no answer)</button>
            </div>
        </div>`;
    }

    function sectionsHtml(n) {
        if (!n.sections || !n.sections.length) { return ''; }
        return '<div class="nt-secs">' + n.sections.map((sec, i) => {
            const key = n.id + '#' + i;
            const open = openSec.has(key);
            return `<div class="nt-sec ${open ? 'open' : ''}">
                <div class="nt-sec-head" data-sec="${esc(key)}">
                    <span class="nt-caret">${open ? '▾' : '▸'}</span>
                    <span class="nt-sec-title">${esc(sec.title)}</span>
                </div>
                ${open ? `<div class="nt-sec-body nt-md">${mdToHtml(sec.body || '')}</div>` : ''}
            </div>`;
        }).join('') + '</div>';
    }

    function noticeCard(n) {
        const tmeta = TYPES[n.type] || TYPES.update;
        const open = expanded.has(n.id);
        const tags = (n.tags || []).map(t => `<span class="tag">#${esc(t)}</span>`).join(' ');
        const due = n.dueAt ? `<div class="muted small">⏰ due ${esc(new Date(n.dueAt).toLocaleString())}</div>` : '';
        const isQ = n.type === 'question';
        const delLabel = isQ ? 'Delete' : 'Dismiss';
        return `<div class="nt-card lvl-${n.level || 1} ${n.read ? 'read' : 'unread'} ${n.pinned ? 'pinned' : ''}" data-id="${esc(n.id)}">
            <div class="nt-row" data-toggle="${esc(n.id)}">
                <span class="nt-caret">${open ? '▾' : '▸'}</span>
                <span class="nt-ico" title="${esc(tmeta.label)}">${tmeta.icon}</span>
                <span class="nt-title">${n.pinned ? '📌 ' : ''}${esc(n.title)}</span>
                ${statusBadge(n)}
                ${tags ? `<span class="nt-tags">${tags}</span>` : ''}
                ${starsHtml(n)}
                <span class="nt-meta muted small">${esc(n.agentName)} · ${esc(timeLabel(n.ts))}${n.read ? '' : ' <span class="nt-udot" title="unread">●</span>'}</span>
            </div>
            <div class="nt-body" ${open ? '' : 'hidden'}>
                <div class="muted small nt-sub">${esc(tmeta.label)} · ${esc((LEVELS[n.level] || LEVELS[1]).label)}${n.type === 'question' ? '' : ''}</div>
                ${due}
                ${n.body ? `<div class="nt-md">${mdToHtml(n.body)}</div>` : (!n.sections && !isQ ? '<div class="muted small">(no details)</div>' : '')}
                ${sectionsHtml(n)}
                ${questionBlock(n)}
                <div class="btnrow nt-actions">
                    <button data-act="read" data-id="${esc(n.id)}" data-read="${n.read ? '0' : '1'}">${n.read ? 'Mark unread' : 'Mark read'}</button>
                    <button class="secondary" data-act="pin" data-id="${esc(n.id)}" data-pin="${n.pinned ? '0' : '1'}">${n.pinned ? 'Unpin' : 'Pin'}</button>
                    <button class="secondary" data-act="dismiss" data-id="${esc(n.id)}">${delLabel}</button>
                </div>
            </div>
        </div>`;
    }

    function chip(id, label, on) {
        return `<button class="af-chip ${on ? 'on' : 'secondary'}" data-chip="${id}">${esc(label)}</button>`;
    }

    function controls() {
        const total = (DATA.notices || []).length;
        const unread = DATA.unread || 0;
        const q = DATA.openQuestions || 0;
        const typeOpts = ['<option value="">All types</option>'].concat(
            Object.keys(TYPES).map(k => `<option value="${k}" ${fType === k ? 'selected' : ''}>${TYPES[k].icon} ${TYPES[k].label}</option>`)).join('');
        const lvlOpts = ['<option value="0">All levels</option>'].concat(
            [4, 3, 2, 1].map(k => `<option value="${k}" ${Number(fLevel) === k ? 'selected' : ''}>L${k} · ${LEVELS[k].label}</option>`)).join('');
        const agentOpts = ['<option value="">All agents</option>'].concat(
            (DATA.agents || []).map(a => `<option value="${esc(a)}" ${fAgent === a ? 'selected' : ''}>${esc(a)}</option>`)).join('');
        const sortOpts = SORTS.map(([k, l]) => `<option value="${k}" ${sortKey === k ? 'selected' : ''}>Sort: ${l}</option>`).join('');
        return `<div class="nt-controls">
            ${chip('all', `All (${total})`, fMode === 'all')}
            ${chip('unread', `Unread (${unread})`, fMode === 'unread')}
            ${chip('questions', `❓ Questions (${q})`, fMode === 'questions')}
            <select id="nt-type">${typeOpts}</select>
            <select id="nt-level">${lvlOpts}</select>
            <select id="nt-agent">${agentOpts}</select>
            <select id="nt-sort">${sortOpts}</select>
        </div>`;
    }

    function actionsHtml() {
        return `<button data-hact="markAll">Mark all read</button>
            <button class="secondary" data-hact="clearRead">Clear read</button>`;
    }

    const STYLE = `<style>
        .nt-controls { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
        .nt-controls select { padding:3px 6px; }
        .af-chip { padding:3px 10px; border-radius:12px; }
        .af-chip.on { background:var(--vscode-button-background); color:var(--vscode-button-foreground); }
        .nt-card { border:1px solid var(--vscode-panel-border); border-left-width:3px; border-radius:6px; margin:6px 0; overflow:hidden; }
        .nt-card.lvl-1 { border-left-color:var(--vscode-panel-border); }
        .nt-card.lvl-2 { border-left-color:var(--vscode-charts-blue, #3794ff); }
        .nt-card.lvl-3 { border-left-color:var(--vscode-charts-orange, #e9a700); }
        .nt-card.lvl-4 { border-left-color:var(--vscode-editorError-foreground, #e51400); }
        .nt-card.lvl-1 .nt-title { opacity:.82; font-weight:500; }
        .nt-card.lvl-3 .nt-title, .nt-card.lvl-4 .nt-title { font-weight:700; }
        .nt-card.pinned { background:var(--vscode-editorWidget-background); }
        .nt-card.read .nt-title { font-weight:400; opacity:.8; }
        .nt-row { display:flex; gap:8px; align-items:center; padding:8px 10px; cursor:pointer; }
        .nt-row:hover { background:var(--vscode-list-hoverBackground); }
        .nt-caret { width:12px; opacity:.7; flex-shrink:0; }
        .nt-ico { flex-shrink:0; }
        .nt-title { flex:0 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .nt-tags, .nt-stars { flex-shrink:0; }
        .nt-stars { letter-spacing:1px; }
        .nt-star { cursor:pointer; opacity:.55; }
        .nt-star.on { color:var(--vscode-charts-yellow, #e2c08d); opacity:1; }
        .nt-meta { margin-left:auto; flex-shrink:0; white-space:nowrap; }
        .nt-udot { color:var(--vscode-button-background); }
        .nt-badge { font-size:10px; border-radius:8px; padding:1px 7px; flex-shrink:0; border:1px solid var(--vscode-panel-border); }
        .nt-badge.ok { color:var(--vscode-charts-green, #89d185); }
        .nt-badge.warn { color:var(--vscode-charts-orange, #e9a700); border-color:var(--vscode-charts-orange, #e9a700); }
        .nt-body { padding:2px 12px 12px 32px; border-top:1px solid var(--vscode-panel-border); }
        .nt-sub { margin:4px 0; text-transform:uppercase; letter-spacing:.04em; font-size:10px; }
        .nt-md { margin:4px 0; line-height:1.5; word-break:break-word; }
        .nt-md .nt-h { font-weight:700; margin:8px 0 2px; }
        .nt-md .nt-sp { height:6px; }
        .nt-md ul { margin:4px 0; padding-left:20px; }
        .nt-code { background:var(--vscode-textCodeBlock-background); padding:8px; border-radius:4px; overflow-x:auto; white-space:pre; }
        .nt-link { color:var(--vscode-textLink-foreground); cursor:pointer; }
        .nt-secs { margin:6px 0; border:1px solid var(--vscode-panel-border); border-radius:5px; }
        .nt-sec { border-top:1px solid var(--vscode-panel-border); }
        .nt-sec:first-child { border-top:none; }
        .nt-sec-head { display:flex; gap:6px; align-items:center; padding:6px 8px; cursor:pointer; font-weight:600; }
        .nt-sec-head:hover { background:var(--vscode-list-hoverBackground); }
        .nt-sec-body { padding:0 10px 8px 26px; }
        .nt-qbox { margin:8px 0; }
        .nt-atext { width:100%; box-sizing:border-box; padding:6px; font-family:inherit; resize:vertical; }
        .nt-answer { margin:6px 0; padding:8px; border-left:3px solid var(--vscode-charts-green, #89d185); background:var(--vscode-editorWidget-background); border-radius:4px; }
        .nt-actions { margin-top:8px; }
        .tag { font-size:10px; opacity:.7; border:1px solid var(--vscode-panel-border); border-radius:3px; padding:1px 5px; }
        .nt-day { margin:16px 0 4px; font-size:11px; letter-spacing:.05em; text-transform:uppercase; opacity:.6; }
    </style>`;

    function render() {
        const items = visible();
        let listHtml = '';
        if (!items.length) {
            listHtml = '<p class="muted" style="margin-top:24px">🕊️ No notices match. Agents post messages, reminders, reports and questions here — one line each; click to read.</p>';
        } else if (sortKey === 'newest' || sortKey === 'oldest') {
            let lastDay = '';
            for (const n of items) {
                const d = dayLabel(n.ts);
                if (d !== lastDay) { listHtml += `<div class="nt-day">${esc(d)}</div>`; lastDay = d; }
                listHtml += noticeCard(n);
            }
        } else {
            listHtml = items.map(noticeCard).join('');
        }
        document.getElementById('app').innerHTML = `${STYLE}
            ${window.AFHeader.html({
                page: 'notices',
                title: '🔔 Notices',
                sub: `${(DATA.notices || []).length} total · ${DATA.unread || 0} unread · ${DATA.openQuestions || 0} open question(s) · ${new Date(DATA.generatedAt).toLocaleTimeString()}`,
                controls: controls(),
                actions: actionsHtml()
            })}
            ${listHtml}`;

        window.AFHeader.wire(vscode);

        const bind = (id, fn) => { const el = document.getElementById(id); if (el) { el.addEventListener('change', fn); } };
        document.querySelectorAll('[data-chip]').forEach(b => b.addEventListener('click', () => { fMode = b.dataset.chip; saveState(); render(); }));
        bind('nt-type', e => { fType = e.target.value; saveState(); render(); });
        bind('nt-level', e => { fLevel = Number(e.target.value) || 0; saveState(); render(); });
        bind('nt-agent', e => { fAgent = e.target.value; saveState(); render(); });
        bind('nt-sort', e => { sortKey = e.target.value; saveState(); render(); });

        document.querySelectorAll('[data-hact]').forEach(b => b.addEventListener('click', () => {
            if (b.dataset.hact === 'markAll') { vscode.postMessage({ type: 'markAllRead' }); }
            else { vscode.postMessage({ type: 'clearRead' }); }
        }));

        // root expand / collapse
        document.querySelectorAll('[data-toggle]').forEach(row => row.addEventListener('click', () => {
            const id = row.dataset.toggle;
            if (expanded.has(id)) { expanded.delete(id); } else { expanded.add(id); }
            render();
        }));
        // section expand / collapse
        document.querySelectorAll('[data-sec]').forEach(h => h.addEventListener('click', ev => {
            ev.stopPropagation();
            const key = h.dataset.sec;
            if (openSec.has(key)) { openSec.delete(key); } else { openSec.add(key); }
            render();
        }));
        // stars
        document.querySelectorAll('.nt-star').forEach(s => s.addEventListener('click', ev => {
            ev.stopPropagation();
            const wrap = s.closest('.nt-stars'); const id = wrap.dataset.id;
            const clicked = Number(s.dataset.star);
            const cur = (DATA.notices.find(n => n.id === id) || {}).stars || 0;
            vscode.postMessage({ type: 'setStars', id, stars: clicked === cur ? 0 : clicked });
        }));
        // answer drafts survive re-render
        document.querySelectorAll('.nt-atext').forEach(t => t.addEventListener('input', () => { drafts[t.dataset.id] = t.value; }));
        // per-notice actions
        document.querySelectorAll('.nt-actions [data-act], .nt-qbox [data-act]').forEach(b => b.addEventListener('click', ev => {
            ev.stopPropagation();
            const id = b.dataset.id, act = b.dataset.act;
            if (act === 'read') { vscode.postMessage({ type: 'markRead', id, read: b.dataset.read === '1' }); }
            else if (act === 'pin') { vscode.postMessage({ type: 'pin', id, pinned: b.dataset.pin === '1' }); }
            else if (act === 'dismiss') { expanded.delete(id); vscode.postMessage({ type: 'dismiss', id }); }
            else if (act === 'decline') { vscode.postMessage({ type: 'decline', id }); }
            else if (act === 'answer') {
                const text = (drafts[id] || '').trim();
                if (!text) { return; }
                delete drafts[id];
                vscode.postMessage({ type: 'answer', id, text });
            }
        }));
        // body links open externally (host validates http/https)
        document.querySelectorAll('.nt-link').forEach(a => a.addEventListener('click', ev => {
            ev.preventDefault(); ev.stopPropagation();
            vscode.postMessage({ type: 'openExternal', url: a.dataset.href });
        }));
    }

    window.addEventListener('message', ev => {
        if (ev.data.type === 'data') { DATA = ev.data.data; render(); }
    });

    render();
})();
