// Agent Farm — Work Queue page. The user→agent async channel (mirror of
// Notices). Low-friction capture; items persist until HANDLED and are shown in
// PIPELINE LANES so the user can track what got done and how. Reads nothing but
// its own store data. See src/core/workqueue.ts.
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    let DATA = window.__DATA__;

    const st = (typeof vscode.getState === 'function' && vscode.getState()) || {};
    const DEF = { fTarget: '', fAuthor: '', query: '', showDropped: false, agentLaneOpen: false };
    let fTarget = st.fTarget || DEF.fTarget;
    let fAuthor = st.fAuthor || DEF.fAuthor;
    let query = st.query || DEF.query;
    let showDropped = st.showDropped !== undefined ? !!st.showDropped : DEF.showDropped;
    // The SECONDARY "Agent-tracked" category is collapsible and starts folded so
    // the manager's tracked delegations never crowd out the user's own captures.
    let agentLaneOpen = st.agentLaneOpen !== undefined ? !!st.agentLaneOpen : DEF.agentLaneOpen;
    const expanded = new Set();     // open item ids
    const editing = new Set();      // ids in edit mode
    const editDrafts = {};          // id -> {text,target,urgency}
    const answering = new Set();    // blocked ids with the answer box open (GAP-2)
    const answerDrafts = {};        // id -> reply text
    let docMenu = null;             // open "open with" split menu key: "<kind>:<id>"
    let addOpen = false;
    let addDraft = { text: '', target: '', urgency: 'normal' };
    let refocusSearch = false;
    let focusItem = DATA.focusItem || null;   // cross-link highlight (one shot)

    // Pipeline lanes, in order. `blocked` sits on top: it is the ONLY state that
    // needs the user. `dropped` (voided) is tucked away behind a toggle.
    const LANES = [
        { id: 'blocked', icon: '🟠', label: 'Needs you' },
        { id: 'captured', icon: '⏬', label: 'New' },
        { id: 'grouped', icon: '🔀', label: 'Grouped' },
        { id: 'delegated', icon: '⏩', label: 'Delegated' },
        { id: 'done', icon: '✅', label: 'Done' },
        { id: 'dropped', icon: '❌', label: 'Dropped' }
    ];
    const LANE = Object.fromEntries(LANES.map(l => [l.id, l]));
    const URG = { normal: '', soon: '🔸 soon', urgent: '🔴 urgent' };

    // "Open with" modes for report/answer .md links (Feature B). Label + icon;
    // the split button's main click uses the user's default (DATA.docOpen.mode),
    // the caret offers the rest per-click.
    const DOC_MODES = [
        ['vscode', '📄 VS Code (raw)'],
        ['preview', '👁 Markdown preview'],
        ['obsidian', '🟣 Obsidian'],
        ['custom', '🖥 Custom app']
    ];
    function docDefault() { return (DATA.docOpen && DATA.docOpen.mode) || 'vscode'; }

    // Live status of a delegated (agent-tracked) item's mission/task, mirrored
    // from DATA.live. Renders a small clickable chip that opens the linked
    // mission/task panel (the click-through). '' when the item has no live link.
    const LIVE_META = {
        running: ['▶', 'running', 'run'], queued: ['◷', 'queued', 'wait'],
        done: ['✅', 'done', 'ok'], failed: ['✖', 'failed', 'err'],
        cancelled: ['⊘', 'cancelled', 'muted'], paused: ['⏸', 'paused', 'wait'],
        'waiting-approval': ['⏳', 'waiting approval', 'wait'],
        'waiting-user': ['⏳', 'waiting you', 'wait']
    };
    function liveChip(n) {
        const lv = (DATA.live || {})[n.id];
        if (!lv) { return ''; }
        const m = LIVE_META[lv.status] || ['•', String(lv.status || ''), ''];
        const to = lv.kind === 'mission' ? 'missions' : 'tasks';
        return `<a href="#" class="q-live q-live-${m[2]} q-afnav" data-to="${to}" title="Live ${esc(lv.kind)} status — click to open${lv.title ? ': ' + esc(lv.title) : ''}">${m[0]} ${esc(m[1])}</a>`;
    }

    function saveState() { if (vscode.setState) { vscode.setState({ fTarget, fAuthor, query, showDropped, agentLaneOpen }); } }
    function esc(s) { return C.esc(String(s == null ? '' : s)); }
    function fileBase(p) { return String(p || '').split(/[\\/]/).pop(); }
    function authorChip(a) { return a === 'user' ? '🧑 you' : '🤖 ' + esc(a); }
    function timeLabel(ts) { return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }

    // ---- minimal safe markdown for resolution text (escape first) ----
    function mdInline(t) {
        t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, x, u) => `<a href="#" class="q-link" data-href="${u}">${x}</a>`);
        t = t.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (m, p, u) => `${p}<a href="#" class="q-link" data-href="${u}">${u}</a>`);
        t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
        return t;
    }
    function mdToHtml(src) {
        const lines = esc(src).split('\n');
        let html = '', inList = false;
        const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };
        for (const line of lines) {
            const li = line.match(/^\s*[-*]\s+(.*)$/);
            if (li) { if (!inList) { html += '<ul>'; inList = true; } html += `<li>${mdInline(li[1])}</li>`; continue; }
            if (!line.trim()) { closeList(); html += '<div class="q-sp"></div>'; continue; }
            closeList(); html += `<div>${mdInline(line)}</div>`;
        }
        closeList();
        return html;
    }

    function matchesQuery(n) {
        const q = query.trim().toLowerCase();
        if (!q) { return true; }
        return [n.text, n.target || '', n.author, n.resolution || '', n.stamp || '', (n.tags || []).join(' ')]
            .join(' ').toLowerCase().indexOf(q) >= 0;
    }
    function passesFilters(n) {
        return (!fTarget || (n.target || '') === fTarget) &&
            (!fAuthor || n.author === fAuthor) &&
            matchesQuery(n);
    }

    function urgencyBadge(n) {
        return n.urgency && n.urgency !== 'normal' ? `<span class="q-urg u-${n.urgency}">${URG[n.urgency]}</span>` : '';
    }

    function sourceLink(n) {
        if (!n.sourceNoticeId) { return ''; }
        const t = n.sourceNoticeTitle ? esc(n.sourceNoticeTitle) : '(message)';
        return `<div class="q-src">source: <a href="#" class="q-openNotice" data-id="${esc(n.sourceNoticeId)}" title="Go to the source notice">🔔 ${t}</a></div>`;
    }

    function delegationLink(n) {
        const bits = [];
        if (n.missionId) { bits.push(`<a href="#" class="q-afnav" data-to="missions" title="Open the Missions panel">🎯 mission ${esc(n.missionId.slice(0, 8))}</a>`); }
        if (n.taskId) { bits.push(`<a href="#" class="q-afnav" data-to="tasks" title="Open the Tasks panel">⚙ task ${esc(n.taskId.slice(0, 8))}</a>`); }
        if (n.groupId) { bits.push(`<span class="muted small">group ${esc(n.groupId.slice(0, 8))}</span>`); }
        return bits.length ? `<div class="q-deleg">${bits.join(' · ')}</div>` : '';
    }

    // Split "open with" button for a report/answer .md link (Feature B): main
    // button opens with the user's default mode; the caret ▾ reveals the rest
    // (raw / preview / Obsidian / custom app) plus a Configure item. `kind` is
    // 'answer' | 'report'; `path` only feeds the tooltip.
    function docSplit(kind, id, label, path) {
        const key = kind + ':' + id;
        const def = docDefault();
        const menu = docMenu === key ? `<div class="q-docmenu">
            ${DOC_MODES.map(([m, l]) => `<button class="q-docopt${m === def ? ' cur' : ''}" data-doc="open" data-kind="${kind}" data-id="${esc(id)}" data-mode="${m}">${l}${m === def ? ' <span class="muted small">· default</span>' : ''}</button>`).join('')}
            <button class="q-docopt cfg" data-doc="cfg" data-kind="${kind}" data-id="${esc(id)}">⚙ Configure default & custom app…</button>
          </div>` : '';
        return `<span class="q-split">
            <button class="secondary q-docmain" data-doc="main" data-kind="${kind}" data-id="${esc(id)}" title="${esc(path)}">${label}</button>
            <button class="secondary q-doccaret" data-doc="caret" data-kind="${kind}" data-id="${esc(id)}" title="Open with…" aria-expanded="${docMenu === key ? 'true' : 'false'}">▾</button>
            ${menu}</span>`;
    }

    function outcomeBlock(n) {
        if (!n.stamp && !n.resolution && !n.answerPath && !n.reportPath && !n.userReply) { return ''; }
        let h = '<div class="q-outcome">';
        if (n.stamp) { h += `<div class="q-stamp">${esc(n.stamp)}</div>`; }
        if (n.userReply) { h += `<div class="q-reply"><span class="q-reply-h">💬 your reply</span><div class="q-md">${mdToHtml(n.userReply)}</div></div>`; }
        if (n.resolution) { h += `<div class="q-md">${mdToHtml(n.resolution)}</div>`; }
        const files = [];
        if (n.answerPath) { files.push(docSplit('answer', n.id, `📝 Open answer (${esc(fileBase(n.answerPath))})`, n.answerPath)); }
        if (n.reportPath) { files.push(docSplit('report', n.id, `📄 Open report (${esc(fileBase(n.reportPath))})`, n.reportPath)); }
        if (files.length) { h += `<div class="q-files">${files.join(' ')}</div>`; }
        if (n.handledAt) { h += `<div class="muted small">handled: ${esc(new Date(n.handledAt).toLocaleString())}</div>`; }
        return h + '</div>';
    }

    function editForm(n) {
        const d = editDrafts[n.id];
        const urgOpts = ['normal', 'soon', 'urgent'].map(k => `<option value="${k}" ${d.urgency === k ? 'selected' : ''}>${k}</option>`).join('');
        return `<div class="q-edit">
            <label>Text</label><textarea class="q-ef" data-ef="text" rows="3">${esc(d.text)}</textarea>
            <div class="q-erow"><span><label>Target</label><input class="q-ef" data-ef="target" value="${esc(d.target)}" placeholder="repo or agent"></span>
              <span><label>Urgency</label><select class="q-ef" data-ef="urgency">${urgOpts}</select></span></div>
            <div class="btnrow"><button data-act="editsave" data-id="${esc(n.id)}">Save</button>
              <button class="secondary" data-act="editcancel" data-id="${esc(n.id)}">Cancel</button></div>
        </div>`;
    }

    // GAP-2: inline reply box shown on a blocked item — the user's answer that
    // re-animates it back into the pipeline.
    function answerForm(n) {
        const d = answerDrafts[n.id] || '';
        return `<div class="q-answer">
            <label>Your answer — sends this back into the pipeline</label>
            <textarea class="q-af" data-af-id="${esc(n.id)}" rows="3" placeholder="Reply to unblock this…">${esc(d)}</textarea>
            <div class="btnrow"><button data-act="answersend" data-id="${esc(n.id)}">Send answer</button>
              <button class="secondary" data-act="answercancel" data-id="${esc(n.id)}">Cancel</button></div>
        </div>`;
    }

    function itemCard(n) {
        const open = expanded.has(n.id), inEdit = editing.has(n.id);
        const terminal = n.status === 'done' || n.status === 'dropped';
        const tags = (n.tags || []).map(x => `<span class="tag">#${esc(x)}</span>`).join(' ');
        let body = '';
        if (inEdit) { body = editForm(n); }
        else {
            body = `${sourceLink(n)}
                <div class="q-fulltext">${mdToHtml(n.text)}</div>
                ${n.target ? `<div class="muted small">target: <strong>${esc(n.target)}</strong></div>` : ''}
                ${delegationLink(n)}${outcomeBlock(n)}
                <div class="btnrow q-actions">
                    ${n.status === 'blocked' ? `<button data-act="answer" data-id="${esc(n.id)}" title="Answer this — records your reply and sends it back into the pipeline">💬 Answer</button>` : ''}
                    <button data-act="handoff" data-id="${esc(n.id)}" title="Open the responsible agent and type this into its terminal (not sent)">🔗 Hand to agent</button>
                    ${!terminal ? `<button class="secondary" data-act="urg" data-id="${esc(n.id)}" title="Cycle urgency">⏫ Urgency</button>` : ''}
                    ${!terminal ? `<button class="secondary" data-act="edit" data-id="${esc(n.id)}">Edit</button>` : ''}
                    ${!terminal ? `<button class="secondary" data-act="drop" data-id="${esc(n.id)}" title="Void this item (dropped). It can only be deleted once handled.">Drop</button>` : ''}
                    ${terminal ? `<button class="secondary danger" data-act="remove" data-id="${esc(n.id)}" title="Delete permanently (only handled items can be deleted)">🗑 Delete</button>` : ''}
                </div>
                ${answering.has(n.id) ? answerForm(n) : ''}`;
        }
        return `<div class="q-card s-${n.status} ${n.pinned ? 'pinned' : ''} ${focusItem === n.id ? 'focus' : ''}" data-id="${esc(n.id)}">
            <div class="q-row" data-toggle="${esc(n.id)}">
                <span class="q-caret">${open ? '▾' : '▸'}</span>
                <span class="q-author" title="${n.author === 'user' ? 'your entry' : 'agent entry'}">${authorChip(n.author)}</span>
                <span class="q-text" title="${esc(n.text)}">${esc(n.text)}</span>
                ${liveChip(n)}
                ${urgencyBadge(n)}
                ${n.target ? `<span class="q-target">${esc(n.target)}</span>` : ''}
                ${tags ? `<span class="q-tags">${tags}</span>` : ''}
                ${n.sourceNoticeId ? '<span class="q-badge src" title="Spawned from a notice">🔔</span>' : ''}
                <span class="q-meta muted small">${esc(timeLabel(n.ts))}</span>
            </div>
            <div class="q-body" ${open ? '' : 'hidden'}>${body}</div>
        </div>`;
    }

    function laneHtml(lane, items) {
        if (!items.length) { return ''; }
        return `<div class="q-lane s-${lane.id}">
            <div class="q-lane-head"><span class="q-lane-ico">${lane.icon}</span> ${esc(lane.label)} <span class="q-lane-n">${items.length}</span></div>
            ${items.map(itemCard).join('')}</div>`;
    }

    // The pipeline sub-lanes WITHIN a top-level category. `blocked` is skipped —
    // it lives in its own author-independent block at the very top.
    function pipelineLanesHtml(items) {
        const byLane = {};
        for (const l of LANES) { byLane[l.id] = []; }
        for (const n of items) { if (byLane[n.status]) { byLane[n.status].push(n); } }
        let html = '';
        for (const l of LANES) {
            if (l.id === 'blocked') { continue; }
            if (l.id === 'dropped' && !showDropped) { continue; }
            html += laneHtml(l, byLane[l.id] || []);
        }
        return html;
    }

    // A short live-status summary for the collapsed Agent-tracked header, e.g.
    // "2 running · 1 done" — read from DATA.live over the category's items.
    function liveSummary(items) {
        const live = DATA.live || {}, tally = {};
        for (const n of items) { const lv = live[n.id]; if (lv) { tally[lv.status] = (tally[lv.status] || 0) + 1; } }
        const order = ['running', 'queued', 'waiting-approval', 'waiting-user', 'paused', 'done', 'failed', 'cancelled'];
        return order.filter(s => tally[s]).map(s => `${tally[s]} ${(LIVE_META[s] || ['', s])[1]}`).join(' · ');
    }

    // One top-level CATEGORY (author lane). `collapsible` categories fold their
    // whole body away behind a caret so they never crowd out the primary lane.
    function categoryHtml(opts) {
        const body = opts.collapsible && !opts.open ? '' : pipelineLanesHtml(opts.items);
        const caret = opts.collapsible ? `<span class="q-cat-caret">${opts.open ? '▾' : '▸'}</span>` : '';
        const sub = opts.sub ? `<span class="q-cat-sub muted small">${esc(opts.sub)}</span>` : '';
        const head = `<div class="q-cat-head${opts.collapsible ? ' clickable' : ''}"${opts.collapsible ? ` data-cat-toggle="${opts.id}"` : ''}>
            ${caret}<span class="q-cat-ico">${opts.icon}</span><span class="q-cat-title">${esc(opts.title)}</span>
            <span class="q-cat-n">${opts.items.length}</span>${sub}</div>`;
        return `<div class="q-cat cat-${opts.id}">${head}${body}</div>`;
    }

    function addForm() {
        if (!addOpen) { return `<div class="q-addbar"><button data-add="open">＋ Add to queue</button></div>`; }
        const targets = (DATA.targets || []);
        const dl = targets.map(t => `<option value="${esc(t)}"></option>`).join('');
        const urgOpts = ['normal', 'soon', 'urgent'].map(k => `<option value="${k}" ${addDraft.urgency === k ? 'selected' : ''}>${k}</option>`).join('');
        return `<div class="q-add">
            <textarea id="q-add-text" rows="2" placeholder="What needs doing? (one line is enough — friction-free)">${esc(addDraft.text)}</textarea>
            <div class="q-erow">
                <span><input id="q-add-target" list="q-targets" value="${esc(addDraft.target)}" placeholder="Target (optional): a repo or agent"><datalist id="q-targets">${dl}</datalist></span>
                <span><select id="q-add-urg">${urgOpts}</select></span>
            </div>
            <div class="btnrow"><button data-add="save">Add</button><button class="secondary" data-add="cancel">Cancel</button>
              <span class="muted small">An item can't be deleted until it's handled.</span></div>
        </div>`;
    }

    function controls() {
        const targets = ['<option value="">All targets</option>']
            .concat((DATA.targets || []).map(t => `<option value="${esc(t)}" ${fTarget === t ? 'selected' : ''}>${esc(t)}</option>`)).join('');
        const authors = ['<option value="">Everyone</option>', `<option value="user" ${fAuthor === 'user' ? 'selected' : ''}>🧑 mine only</option>`]
            .concat((DATA.agents || []).map(a => `<option value="${esc(a)}" ${fAuthor === a ? 'selected' : ''}>🤖 ${esc(a)}</option>`)).join('');
        return `<div class="q-controls">
            <input id="q-search" type="search" placeholder="🔍 search" value="${esc(query)}">
            <select id="q-target">${targets}</select>
            <select id="q-author">${authors}</select>
            <label class="q-drop"><input type="checkbox" id="q-showdropped" ${showDropped ? 'checked' : ''}> show dropped</label>
            <button class="secondary" id="q-reset" title="Reset filters">↺</button>
        </div>`;
    }

    const STYLE = `<style>
        .q-controls { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
        .q-controls select, .q-controls input[type=search] { padding:3px 6px; }
        #q-search { min-width:160px; }
        .q-drop { display:inline-flex; gap:3px; align-items:center; font-size:11px; opacity:.85; }
        .q-addbar { margin:6px 0; }
        .q-add { margin:8px 0; padding:10px; border:1px solid var(--vscode-panel-border); border-radius:6px; background:var(--vscode-editorWidget-background); }
        .q-add textarea, .q-add input, .q-add select { width:100%; box-sizing:border-box; padding:6px; font-family:inherit; }
        .q-erow { display:flex; gap:10px; margin-top:6px; } .q-erow span { flex:1; }
        .q-lane { margin:14px 0; }
        .q-lane-head { font-size:11px; letter-spacing:.04em; text-transform:uppercase; opacity:.7; margin:0 0 4px; display:flex; gap:6px; align-items:center; }
        .q-lane-n { background:var(--vscode-badge-background); color:var(--vscode-badge-foreground); border-radius:8px; padding:0 7px; font-size:10px; }
        .q-lane.s-blocked .q-lane-head { color:var(--vscode-charts-orange,#e9a700); opacity:1; font-weight:700; }
        .q-card { border:1px solid var(--vscode-panel-border); border-left-width:3px; border-radius:6px; margin:5px 0; overflow:hidden; }
        .q-card.s-blocked { border-left-color:var(--vscode-charts-orange,#e9a700); }
        .q-card.s-captured { border-left-color:var(--vscode-charts-blue,#3794ff); }
        .q-card.s-grouped { border-left-color:var(--vscode-charts-purple,#b180d7); }
        .q-card.s-delegated { border-left-color:var(--vscode-charts-yellow,#e2c08d); }
        .q-card.s-done { border-left-color:var(--vscode-charts-green,#89d185); }
        .q-card.s-dropped { border-left-color:var(--vscode-panel-border); opacity:.7; }
        .q-card.pinned { background:var(--vscode-editorWidget-background); }
        .q-card.focus { box-shadow:0 0 0 2px var(--vscode-focusBorder,#007fd4); }
        .q-row { display:flex; gap:8px; align-items:center; padding:7px 10px; cursor:pointer; }
        .q-row:hover { background:var(--vscode-list-hoverBackground); }
        .q-caret { width:12px; opacity:.7; flex-shrink:0; }
        .q-author { flex-shrink:0; font-size:11px; opacity:.85; }
        .q-text { flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .q-target { flex-shrink:0; font-size:10px; border:1px solid var(--vscode-panel-border); border-radius:3px; padding:1px 5px; opacity:.85; }
        .q-urg { flex-shrink:0; font-size:10px; }
        .q-urg.u-urgent { color:var(--vscode-charts-red,#f14c4c); font-weight:700; }
        .q-meta { margin-left:auto; flex-shrink:0; white-space:nowrap; }
        .q-badge { font-size:10px; border-radius:8px; padding:1px 7px; flex-shrink:0; border:1px solid var(--vscode-panel-border); }
        .q-badge.src { cursor:default; }
        .q-body { padding:2px 12px 12px 30px; border-top:1px solid var(--vscode-panel-border); }
        .q-fulltext { margin:6px 0; line-height:1.5; word-break:break-word; }
        .q-src { margin:4px 0; font-size:11px; opacity:.85; }
        .q-src a, .q-link, .q-afnav, .q-openNotice { color:var(--vscode-textLink-foreground); cursor:pointer; }
        .q-deleg { margin:5px 0; font-size:11px; }
        .q-outcome { margin:8px 0; padding:8px 10px; border-left:3px solid var(--vscode-charts-green,#89d185); background:var(--vscode-editorWidget-background); border-radius:4px; }
        .q-stamp { font-weight:700; font-size:12px; margin-bottom:4px; }
        .q-md { line-height:1.5; word-break:break-word; } .q-md ul { margin:4px 0; padding-left:20px; } .q-md .q-sp { height:6px; }
        .q-files { margin:6px 0; display:flex; gap:6px; flex-wrap:wrap; }
        .q-actions { margin-top:8px; }
        .q-edit label { display:block; font-size:10px; text-transform:uppercase; opacity:.7; margin:6px 0 2px; }
        .q-edit textarea, .q-edit input, .q-edit select { width:100%; box-sizing:border-box; padding:5px; font-family:inherit; }
        .q-reply { margin:4px 0; }
        .q-reply-h { display:block; font-size:10px; text-transform:uppercase; letter-spacing:.03em; opacity:.7; margin-bottom:2px; }
        .q-answer { margin:8px 0 2px; padding:8px 10px; border:1px solid var(--vscode-panel-border); border-left:3px solid var(--vscode-charts-orange,#e9a700); border-radius:4px; background:var(--vscode-editorWidget-background); }
        .q-answer label { display:block; font-size:10px; text-transform:uppercase; opacity:.7; margin:0 0 3px; }
        .q-answer textarea { width:100%; box-sizing:border-box; padding:5px; font-family:inherit; }
        button.danger:hover { background:var(--vscode-inputValidation-errorBackground,#5a1d1d); border-color:var(--vscode-editorError-foreground,#e51400); }
        .tag { font-size:10px; opacity:.7; border:1px solid var(--vscode-panel-border); border-radius:3px; padding:1px 5px; }
        /* Author categories (Feature A) */
        .q-cat { margin:10px 0 4px; }
        .q-cat.cat-agent { margin-top:16px; border-top:1px dashed var(--vscode-panel-border); padding-top:8px; }
        .q-cat-head { display:flex; gap:8px; align-items:center; padding:5px 2px; font-size:13px; font-weight:700; }
        .q-cat-head.clickable { cursor:pointer; border-radius:4px; }
        .q-cat-head.clickable:hover { background:var(--vscode-list-hoverBackground); }
        .q-cat.cat-user .q-cat-title { color:var(--vscode-foreground); }
        .q-cat.cat-agent .q-cat-head { opacity:.85; }
        .q-cat-caret { width:12px; opacity:.7; flex-shrink:0; }
        .q-cat-ico { flex-shrink:0; }
        .q-cat-n { background:var(--vscode-badge-background); color:var(--vscode-badge-foreground); border-radius:9px; padding:0 8px; font-size:11px; }
        .q-cat-sub { margin-left:6px; font-weight:400; }
        /* Live status mirror chip (Feature A) */
        .q-live { flex-shrink:0; font-size:10px; border:1px solid var(--vscode-panel-border); border-radius:9px; padding:1px 7px; text-decoration:none; cursor:pointer; }
        .q-live:hover { background:var(--vscode-list-hoverBackground); }
        .q-live-run { color:var(--vscode-charts-blue,#3794ff); border-color:var(--vscode-charts-blue,#3794ff); }
        .q-live-ok { color:var(--vscode-charts-green,#89d185); border-color:var(--vscode-charts-green,#89d185); }
        .q-live-err { color:var(--vscode-editorError-foreground,#f14c4c); border-color:var(--vscode-editorError-foreground,#f14c4c); }
        .q-live-wait { color:var(--vscode-charts-orange,#e9a700); border-color:var(--vscode-charts-orange,#e9a700); }
        .q-live-muted { opacity:.6; }
        /* "Open with" split button (Feature B) */
        .q-split { position:relative; display:inline-flex; }
        .q-docmain { border-top-right-radius:0; border-bottom-right-radius:0; }
        .q-doccaret { border-top-left-radius:0; border-bottom-left-radius:0; margin-left:-1px; padding:2px 6px; }
        .q-docmenu { position:absolute; top:100%; left:0; z-index:20; margin-top:2px; min-width:230px; display:flex; flex-direction:column;
            background:var(--vscode-editorWidget-background); border:1px solid var(--vscode-panel-border); border-radius:5px; box-shadow:0 2px 10px rgba(0,0,0,.35); overflow:hidden; }
        .q-docopt { text-align:left; background:transparent; border:none; border-radius:0; padding:6px 10px; color:var(--vscode-foreground); cursor:pointer; }
        .q-docopt:hover { background:var(--vscode-list-hoverBackground); }
        .q-docopt.cur { font-weight:700; }
        .q-docopt.cfg { border-top:1px solid var(--vscode-panel-border); opacity:.9; }
    </style>`;

    function visible() { return (DATA.items || []).filter(passesFilters); }

    function render() {
        const items = visible();
        // Functional author lanes (Feature A): Blocked (needs you, author-
        // independent) on top; then YOUR captures (work FOR the agents — the
        // primary lane); then the manager's Agent-tracked delegations (secondary,
        // collapsible, with a live mission/task status mirror).
        const blockedItems = items.filter(n => n.status === 'blocked');
        const rest = items.filter(n => n.status !== 'blocked');
        const userItems = rest.filter(n => n.author === 'user');
        const agentItems = rest.filter(n => n.author !== 'user');
        // A cross-link that lands on an agent-tracked item must reveal the
        // (normally folded) secondary lane, or the highlight scrolls to nothing.
        if (focusItem && agentItems.some(n => n.id === focusItem)) { agentLaneOpen = true; }

        let body = '';
        if (blockedItems.length) { body += `<div class="q-cat cat-blocked">${laneHtml(LANE.blocked, blockedItems)}</div>`; }
        if (userItems.length) {
            body += categoryHtml({ id: 'user', icon: '🧑', title: 'Your captures', items: userItems });
        }
        if (agentItems.length) {
            body += categoryHtml({
                id: 'agent', icon: '🤖', title: 'Agent-tracked delegations', items: agentItems,
                collapsible: true, open: agentLaneOpen,
                sub: liveSummary(agentItems) || 'the manager\'s tracked work'
            });
        }
        if (!body) {
            body = '<p class="muted" style="margin-top:20px">📥 The queue is empty. Drop small fixes/tasks here — they won\'t be lost until handled. Command: <code>Agent Farm: Add to Queue</code> or the ＋ above.</p>';
        }
        const active = DATA.active || 0, blocked = DATA.blocked || 0;
        document.getElementById('app').innerHTML = `${STYLE}
            ${window.AFHeader.tabs('queue')}
            ${window.AFHeader.html({
                page: 'queue', title: '📥 Work Queue',
                sub: `${(DATA.items || []).length} items · ${active} active${blocked ? ` · ${blocked} need you` : ''} · showing ${items.length} · ${new Date(DATA.generatedAt).toLocaleTimeString()}`,
                controls: controls()
            })}
            ${addForm()}
            ${body}`;
        window.AFHeader.wire(vscode);
        wire();
        if (refocusSearch) { const s = document.getElementById('q-search'); if (s) { s.focus(); const v = s.value.length; try { s.setSelectionRange(v, v); } catch (e) {} } refocusSearch = false; }
        if (focusItem) {
            const el = document.querySelector(`.q-card[data-id="${focusItem}"]`);
            if (el) { el.scrollIntoView({ block: 'center' }); }
            focusItem = null;   // one-shot highlight
        }
    }

    function captureEdit(id) {
        const d = editDrafts[id]; if (!d) { return; }
        const scope = document.querySelector(`.q-card[data-id="${id}"] .q-edit`); if (!scope) { return; }
        scope.querySelectorAll('[data-ef]').forEach(el => { d[el.dataset.ef] = el.value; });
    }

    function captureAnswer(id) {
        const el = document.querySelector(`.q-answer [data-af-id="${id}"]`);
        if (el) { answerDrafts[id] = el.value; }
    }

    function wire() {
        const bind = (id, ev, fn) => { const el = document.getElementById(id); if (el) { el.addEventListener(ev, fn); } };
        bind('q-search', 'input', e => { query = e.target.value; refocusSearch = true; saveState(); render(); });
        bind('q-target', 'change', e => { fTarget = e.target.value; saveState(); render(); });
        bind('q-author', 'change', e => { fAuthor = e.target.value; saveState(); render(); });
        bind('q-showdropped', 'change', e => { showDropped = e.target.checked; saveState(); render(); });
        bind('q-reset', 'click', () => { fTarget = DEF.fTarget; fAuthor = DEF.fAuthor; query = DEF.query; saveState(); render(); });

        // add form
        document.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => {
            const a = b.dataset.add;
            if (a === 'open') { addOpen = true; render(); }
            else if (a === 'cancel') { addOpen = false; addDraft = { text: '', target: '', urgency: 'normal' }; render(); }
            else if (a === 'save') {
                const text = (document.getElementById('q-add-text') || {}).value || '';
                const target = (document.getElementById('q-add-target') || {}).value || '';
                const urgency = (document.getElementById('q-add-urg') || {}).value || 'normal';
                if (text.trim()) { vscode.postMessage({ type: 'add', text: text.trim(), target: target.trim(), urgency }); addOpen = false; addDraft = { text: '', target: '', urgency: 'normal' }; }
            }
        }));
        ['q-add-text', 'q-add-target', 'q-add-urg'].forEach(id => {
            const el = document.getElementById(id); if (!el) { return; }
            const key = id === 'q-add-text' ? 'text' : id === 'q-add-target' ? 'target' : 'urgency';
            el.addEventListener('input', () => { addDraft[key] = el.value; });
        });

        // row expand
        document.querySelectorAll('[data-toggle]').forEach(row => row.addEventListener('click', () => {
            const id = row.dataset.toggle;
            if (expanded.has(id)) { expanded.delete(id); } else { expanded.add(id); }
            render();
        }));

        // edit field live capture
        document.querySelectorAll('.q-edit [data-ef]').forEach(el => el.addEventListener('input', () => {
            const id = el.closest('.q-card').dataset.id, d = editDrafts[id]; if (d) { d[el.dataset.ef] = el.value; }
        }));

        // answer box live capture (GAP-2)
        document.querySelectorAll('.q-answer [data-af-id]').forEach(el => el.addEventListener('input', () => {
            answerDrafts[el.dataset.afId] = el.value;
        }));

        // item actions
        document.querySelectorAll('.q-actions [data-act], .q-edit [data-act], .q-outcome [data-act], .q-answer [data-act]').forEach(b => b.addEventListener('click', ev => {
            ev.stopPropagation();
            const id = b.dataset.id, act = b.dataset.act;
            if (act === 'handoff') { vscode.postMessage({ type: 'handoff', id }); }
            else if (act === 'drop') { vscode.postMessage({ type: 'drop', id }); }
            else if (act === 'answer') { answerDrafts[id] = answerDrafts[id] || ''; answering.add(id); expanded.add(id); render(); }
            else if (act === 'answercancel') { captureAnswer(id); answering.delete(id); delete answerDrafts[id]; render(); }
            else if (act === 'answersend') {
                captureAnswer(id); const t = (answerDrafts[id] || '').trim();
                if (t) { vscode.postMessage({ type: 'answer', id, text: t }); answering.delete(id); delete answerDrafts[id]; }
            }
            else if (act === 'remove') { expanded.delete(id); vscode.postMessage({ type: 'remove', id }); }
            else if (act === 'urg') {
                const n = (DATA.items || []).find(x => x.id === id) || {};
                const next = n.urgency === 'normal' ? 'soon' : n.urgency === 'soon' ? 'urgent' : 'normal';
                vscode.postMessage({ type: 'setUrgency', id, urgency: next });
            }
            else if (act === 'edit') {
                const n = (DATA.items || []).find(x => x.id === id);
                editDrafts[id] = { text: n.text || '', target: n.target || '', urgency: n.urgency || 'normal' };
                editing.add(id); expanded.add(id); render();
            }
            else if (act === 'editcancel') { captureEdit(id); editing.delete(id); delete editDrafts[id]; render(); }
            else if (act === 'editsave') {
                captureEdit(id); const d = editDrafts[id];
                vscode.postMessage({ type: 'edit', id, patch: { text: d.text, target: d.target, urgency: d.urgency } });
                editing.delete(id); delete editDrafts[id];
            }
        }));

        // "Open with" split buttons (Feature B): main = default mode, caret = menu.
        document.querySelectorAll('[data-doc]').forEach(b => b.addEventListener('click', ev => {
            ev.stopPropagation();
            const doc = b.dataset.doc, kind = b.dataset.kind, id = b.dataset.id, key = kind + ':' + id;
            if (doc === 'main') { docMenu = null; vscode.postMessage({ type: 'openFile', kind, id }); }
            else if (doc === 'caret') { docMenu = docMenu === key ? null : key; render(); }
            else if (doc === 'open') { docMenu = null; vscode.postMessage({ type: 'openFile', kind, id, mode: b.dataset.mode }); }
            else if (doc === 'cfg') { docMenu = null; vscode.postMessage({ type: 'configureDocOpen' }); }
        }));

        // Agent-tracked category collapse (Feature A).
        document.querySelectorAll('[data-cat-toggle]').forEach(h => h.addEventListener('click', () => {
            if (h.dataset.catToggle === 'agent') { agentLaneOpen = !agentLaneOpen; saveState(); render(); }
        }));

        // cross-links
        document.querySelectorAll('.q-openNotice').forEach(a => a.addEventListener('click', ev => {
            ev.preventDefault(); ev.stopPropagation(); vscode.postMessage({ type: 'openNotice', id: a.dataset.id });
        }));
        document.querySelectorAll('.q-afnav').forEach(a => a.addEventListener('click', ev => {
            ev.preventDefault(); ev.stopPropagation(); vscode.postMessage({ type: 'afnav', to: a.dataset.to });
        }));
        document.querySelectorAll('.q-link').forEach(a => a.addEventListener('click', ev => {
            ev.preventDefault(); ev.stopPropagation(); vscode.postMessage({ type: 'openExternal', url: a.dataset.href });
        }));
    }

    window.addEventListener('message', ev => {
        if (ev.data.type === 'data') {
            DATA = ev.data.data;
            if (DATA.focusItem) { focusItem = DATA.focusItem; expanded.add(DATA.focusItem); }
            render();
        }
    });
    if (focusItem) { expanded.add(focusItem); }
    render();
})();
