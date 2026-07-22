// Agent Farm — Notices page. The agent→user notice board: titles first, click
// a row to expand its markdown body. Filters (unread / level / agent), mark
// read·unread, pin, dismiss, mark-all-read, clear-read. Fully self-contained.
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    let DATA = window.__DATA__;

    const st = (typeof vscode.getState === 'function' && vscode.getState()) || {};
    let fMode = st.fMode || 'all';       // 'all' | 'unread'
    let fLevel = st.fLevel || '';        // '' | level id
    let fAgent = st.fAgent || '';        // '' | agent name
    const expanded = new Set();          // notice ids currently open

    const LEVELS = {
        info:     { icon: 'ℹ️', label: 'Info' },
        success:  { icon: '✅', label: 'Success' },
        reminder: { icon: '⏰', label: 'Reminder' },
        warning:  { icon: '⚠️', label: 'Warning' },
        alert:    { icon: '🔴', label: 'Alert' }
    };

    function saveState() { if (vscode.setState) { vscode.setState({ fMode, fLevel, fAgent }); } }
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
        return (DATA.notices || []).filter(n =>
            (fMode !== 'unread' || !n.read) &&
            (!fLevel || n.level === fLevel) &&
            (!fAgent || n.agentName === fAgent));
    }

    function noticeCard(n) {
        const meta = LEVELS[n.level] || LEVELS.info;
        const open = expanded.has(n.id);
        const tags = (n.tags || []).map(t => `<span class="tag">#${esc(t)}</span>`).join(' ');
        const due = n.dueAt ? `<div class="muted small">⏰ due ${esc(new Date(n.dueAt).toLocaleString())}</div>` : '';
        const bodyHtml = n.body ? mdToHtml(n.body) : '<div class="muted small">(no details)</div>';
        return `<div class="nt-card lvl-${esc(n.level)} ${n.read ? 'read' : 'unread'} ${n.pinned ? 'pinned' : ''}" data-id="${esc(n.id)}">
            <div class="nt-row" data-toggle="${esc(n.id)}">
                <span class="nt-caret">${open ? '▾' : '▸'}</span>
                <span class="nt-ico" title="${esc(meta.label)}">${meta.icon}</span>
                <span class="nt-title">${n.pinned ? '📌 ' : ''}${esc(n.title)}</span>
                ${tags ? `<span class="nt-tags">${tags}</span>` : ''}
                <span class="nt-meta muted small">${esc(n.agentName)} · ${esc(timeLabel(n.ts))}${n.read ? '' : ' <span class="nt-udot" title="unread">●</span>'}</span>
            </div>
            <div class="nt-body" ${open ? '' : 'hidden'}>
                ${due}
                <div class="nt-md">${bodyHtml}</div>
                <div class="btnrow nt-actions">
                    <button data-act="read" data-id="${esc(n.id)}" data-read="${n.read ? '0' : '1'}">${n.read ? 'Mark unread' : 'Mark read'}</button>
                    <button class="secondary" data-act="pin" data-id="${esc(n.id)}" data-pin="${n.pinned ? '0' : '1'}">${n.pinned ? 'Unpin' : 'Pin'}</button>
                    <button class="secondary" data-act="dismiss" data-id="${esc(n.id)}">Dismiss</button>
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
        const lvlOpts = ['<option value="">All levels</option>'].concat(
            Object.keys(LEVELS).map(k => `<option value="${k}" ${fLevel === k ? 'selected' : ''}>${LEVELS[k].icon} ${LEVELS[k].label}</option>`)).join('');
        const agentOpts = ['<option value="">All agents</option>'].concat(
            (DATA.agents || []).map(a => `<option value="${esc(a)}" ${fAgent === a ? 'selected' : ''}>${esc(a)}</option>`)).join('');
        return `<div class="nt-controls">
            ${chip('all', `All (${total})`, fMode === 'all')}
            ${chip('unread', `Unread (${unread})`, fMode === 'unread')}
            <select id="nt-level">${lvlOpts}</select>
            <select id="nt-agent">${agentOpts}</select>
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
        .nt-card { border:1px solid var(--vscode-panel-border); border-radius:6px; margin:6px 0; overflow:hidden; }
        .nt-card.unread { border-left:3px solid var(--vscode-button-background); }
        .nt-card.pinned { background:var(--vscode-editorWidget-background); }
        .nt-card.lvl-warning { border-left-color:var(--vscode-charts-orange, orange); }
        .nt-card.lvl-alert { border-left-color:var(--vscode-editorError-foreground, #e51400); }
        .nt-row { display:flex; gap:8px; align-items:center; padding:8px 10px; cursor:pointer; }
        .nt-row:hover { background:var(--vscode-list-hoverBackground); }
        .nt-caret { width:12px; opacity:.7; flex-shrink:0; }
        .nt-ico { flex-shrink:0; }
        .nt-title { font-weight:600; flex:0 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .nt-card.read .nt-title { font-weight:400; opacity:.85; }
        .nt-tags { flex-shrink:0; }
        .nt-meta { margin-left:auto; flex-shrink:0; white-space:nowrap; }
        .nt-udot { color:var(--vscode-button-background); }
        .nt-body { padding:2px 12px 12px 32px; border-top:1px solid var(--vscode-panel-border); }
        .nt-md { margin:6px 0; line-height:1.5; word-break:break-word; }
        .nt-md .nt-h { font-weight:700; margin:8px 0 2px; }
        .nt-md .nt-sp { height:6px; }
        .nt-md ul { margin:4px 0; padding-left:20px; }
        .nt-code { background:var(--vscode-textCodeBlock-background); padding:8px; border-radius:4px; overflow-x:auto; white-space:pre; }
        .nt-link { color:var(--vscode-textLink-foreground); cursor:pointer; }
        .nt-actions { margin-top:8px; }
        .tag { font-size:10px; opacity:.7; border:1px solid var(--vscode-panel-border); border-radius:3px; padding:1px 5px; }
        .nt-day { margin:16px 0 4px; font-size:11px; letter-spacing:.05em; text-transform:uppercase; opacity:.6; }
    </style>`;

    function render() {
        const items = visible();
        let listHtml = '';
        if (!items.length) {
            listHtml = '<p class="muted" style="margin-top:24px">🕊️ No notices here. Agents post important messages and reminders to this board — they show up here, newest first.</p>';
        } else {
            let lastDay = '';
            for (const n of items) {
                const d = dayLabel(n.ts);
                if (d !== lastDay) { listHtml += `<div class="nt-day">${esc(d)}</div>`; lastDay = d; }
                listHtml += noticeCard(n);
            }
        }
        document.getElementById('app').innerHTML = `${STYLE}
            ${window.AFHeader.html({
                page: 'notices',
                title: '🔔 Notices',
                sub: `${(DATA.notices || []).length} total · ${DATA.unread || 0} unread · ${new Date(DATA.generatedAt).toLocaleTimeString()}`,
                controls: controls(),
                actions: actionsHtml()
            })}
            ${listHtml}`;

        window.AFHeader.wire(vscode);

        // filter chips
        document.querySelectorAll('[data-chip]').forEach(b => b.addEventListener('click', () => {
            fMode = b.dataset.chip; saveState(); render();
        }));
        const lvl = document.getElementById('nt-level');
        if (lvl) { lvl.addEventListener('change', () => { fLevel = lvl.value; saveState(); render(); }); }
        const ag = document.getElementById('nt-agent');
        if (ag) { ag.addEventListener('change', () => { fAgent = ag.value; saveState(); render(); }); }

        // header actions
        document.querySelectorAll('[data-hact]').forEach(b => b.addEventListener('click', () => {
            const a = b.dataset.hact;
            if (a === 'markAll') { vscode.postMessage({ type: 'markAllRead' }); }
            else if (a === 'clearRead') { vscode.postMessage({ type: 'clearRead' }); }
        }));

        // expand / collapse
        document.querySelectorAll('[data-toggle]').forEach(row => row.addEventListener('click', () => {
            const id = row.dataset.toggle;
            if (expanded.has(id)) { expanded.delete(id); } else { expanded.add(id); }
            render();
        }));

        // per-notice actions
        document.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', ev => {
            ev.stopPropagation();
            const id = b.dataset.id, act = b.dataset.act;
            if (act === 'read') { vscode.postMessage({ type: 'markRead', id, read: b.dataset.read === '1' }); }
            else if (act === 'pin') { vscode.postMessage({ type: 'pin', id, pinned: b.dataset.pin === '1' }); }
            else if (act === 'dismiss') { expanded.delete(id); vscode.postMessage({ type: 'dismiss', id }); }
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
