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
    // Target / author are multi-pick: null = all (no filter), an array = exactly
    // that subset, [] = none. See media/afFilters.js.
    const DEF = { fTarget: null, fAuthor: null, fProject: null, query: '', showDropped: false, agentLaneOpen: false };
    let fTarget = Array.isArray(st.fTarget) ? st.fTarget : null;
    let fAuthor = Array.isArray(st.fAuthor) ? st.fAuthor : null;
    // Which projects to list. Picked by ID rather than by name so a rename does
    // not silently empty the filter — the picker prints the name.
    let fProject = Array.isArray(st.fProject) ? st.fProject : null;
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
    // ‼️ The capture box opens on the window's ACTIVE project, because that is
    // what a person at this box is working on — the same rule a task follows
    // (core/tasks.ts addTask). It is a visible, changeable box and not a silent
    // stamp: the whole reason automatic filing is safe is that both the box and
    // the row can take it off again.
    let addDraft = { text: '', target: '', urgency: 'normal', project: DATA.activeProjectId || '' };
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
        // the box is a QUERY, not a substring — media/afQuery.js
        return window.AFQuery.compile(query).test(
            [n.text, n.target || '', n.author, n.resolution || '', n.stamp || '', (n.tags || []).join(' ')].join(' '));
    }
    function passesFilters(n) {
        return (!fTarget || fTarget.indexOf(n.target || '') >= 0) &&
            (!fAuthor || fAuthor.indexOf(n.author) >= 0) &&
            // An unfiled item answers to the explicit "(none)" bucket, so a
            // project filter never makes rows disappear without a name for
            // where they went.
            (!fProject || fProject.indexOf(n.projectId || window.AFProject.NONE) >= 0) &&
            matchesQuery(n);
    }

    /** The project an item is filed under, out of the list the host shipped.
     *  Undefined for an unfiled one AND for a stamp whose project is gone. */
    function projOf(n) { return window.AFProject.find(DATA.projects, n.projectId); }

    /** The project mark on a row — the shared one (media/afProject.js), so an
     *  item's project looks exactly like the same project everywhere else.
     *  Drawn only when there IS one; filing happens in the open body. */
    function projectChip(n) {
        const p = projOf(n);
        if (!p) { return ''; }
        const t = window.AFProject.tip(p);
        return window.AFTip.wrap(
            '<span class="q-proj" data-openproj="' + esc(p.id) + '" role="button" tabindex="0">'
            + window.AFProject.badge(p) + '</span>', t.head, t.body);
    }

    /** The "file it under…" picker, in the open body. The empty option is what
     *  takes a stamp back OFF, which is what makes stamping safe. */
    function projectPicker(n) {
        const cur = n.projectId || '';
        return `<div class="q-projrow">
            <label class="muted small" for="q-pj-${esc(n.id)}">Project</label>
            <select class="q-pjsel" id="q-pj-${esc(n.id)}" data-id="${esc(n.id)}"
                title="Which project this item is work for. It shows on that project's Work tab and timeline; the empty option takes the stamp off again.">
                ${window.AFProject.options(DATA.projects, cur, { anyLabel: '— none' })}
            </select>
            ${cur && projOf(n) ? `<button class="secondary" data-act="openproj" data-project="${esc(cur)}" title="Open this project's page">◧ Open</button>` : ''}
            ${cur && !projOf(n) ? '<span class="muted small" title="The project this was filed under no longer exists — pick another, or clear it">⚠ project gone</span>' : ''}
        </div>`;
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
        if (n.handledAt) { h += `<div class="muted small">handled: ${esc(window.AFTime.full(n.handledAt))}</div>`; }
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

    /**
     * What a queue item IS, for the right-click menu.
     *
     * `afTerminal` is the whole safety rule of this page in one flag: a live
     * item can be edited, re-prioritised and dropped but never deleted; a
     * handled one can be deleted but no longer changed. The menu reads it, so
     * the two sets are never both on offer — which is what the row's buttons
     * already do, and now cannot disagree with.
     */
    function itemCtx(n, open, terminal) {
        return window.AFCtx.row('afQueueRow', {
            item: n.id, afOpen: !!open, afTerminal: !!terminal,
            afBlocked: n.status === 'blocked', afSource: !!n.sourceNoticeId,
            afReport: !!n.reportPath, afAnswer: !!n.answerPath,
            qStatus: n.status || 'new'
        });
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
                ${delegationLink(n)}${outcomeBlock(n)}${projectPicker(n)}
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
            <div class="q-row" data-toggle="${esc(n.id)}" ${itemCtx(n, open, terminal)}
                title="${esc(window.AFCtx.hint('Click to open it'))}">
                <span class="q-caret">${open ? '▾' : '▸'}</span>
                <span class="q-author" title="${n.author === 'user' ? 'your entry' : 'agent entry'}">${authorChip(n.author)}</span>
                <!-- The item is TEXT and the row ellipsises it, so the hover has
                     to carry the WHOLE of it — the rich panel, never a native
                     title that stops where the platform pleases
                     (docs/CONVENTIONS.md → Hover). The wrapper takes the row's
                     flex share; the ellipsis stays on the span inside it. -->
                ${window.AFTip.wrap(`<span class="q-text">${esc(n.text)}</span>`,
                `${n.author === 'user' ? 'Your entry' : 'Agent entry'} · ${timeLabel(n.ts)}`
                + `${n.target ? ` · for ${n.target}` : ''} · ${window.AFTip.sizeNote(n.text)}`,
                n.text)}
                ${liveChip(n)}
                ${urgencyBadge(n)}
                ${n.target ? `<span class="q-target">${esc(n.target)}</span>` : ''}
                ${projectChip(n)}
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
            <div class="q-lane-head"
                ${window.AFCtx.row('afQueueLane', { lane: lane.id, laneLabel: lane.label, afDropShown: !!showDropped })}
                title="${esc(window.AFCtx.hint(lane.label))}"><span class="q-lane-ico">${lane.icon}</span> ${esc(lane.label)} <span class="q-lane-n">${items.length}</span></div>
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
                <span><select id="q-add-project" title="Which project this is work for. It opens on the window's active project because that is what you are working on; change it here, or take it off later from the item's own row.">${window.AFProject.options(DATA.projects, addDraft.project, { anyLabel: '— no project' })}</select></span>
            </div>
            <div class="btnrow"><button data-add="save">Add</button><button class="secondary" data-add="cancel">Cancel</button>
              <span class="muted small">An item can't be deleted until it's handled.</span></div>
        </div>`;
    }

    // The two multi-pick filters, described once so markup and wiring cannot drift.
    function filterPickers() {
        return [
            { id: 'q-target', label: 'Targets', get: () => fTarget, set: v => { fTarget = v; },
                title: 'Which targets to list — tick any combination',
                options: (DATA.targets || []).slice() },
            { id: 'q-author', label: 'Authors', get: () => fAuthor, set: v => { fAuthor = v; },
                title: 'Who wrote the item — tick any combination',
                options: [{ v: 'user', t: '🧑 mine' }].concat((DATA.agents || []).map(a => ({ v: a, t: '🤖 ' + a }))) },
            // ‼️ "No project" is an OPTION, not the absence of one — without it
            // a project filter makes the unfiled items vanish with nothing on
            // screen saying they exist, and those are exactly the ones somebody
            // filtering by project is about to want to file.
            { id: 'q-project', label: 'Projects', get: () => fProject, set: v => { fProject = v; },
                title: 'Which project\'s items to list — manage them on the ◧ Projects page',
                options: [{ v: window.AFProject.NONE, t: '— No project' }].concat(
                    (DATA.projects || []).map(p => ({ v: p.id, t: (p.icon ? p.icon + ' ' : '') + p.name }))) }
        ];
    }

    function controls() {
        return `<div class="q-controls">
            <input id="q-search" type="search" placeholder="🔍 search" value="${esc(query)}"
                title="${esc(window.AFQuery.tip('Searched against the item, its target, its author, its resolution, its stamp and its tags.'))}">
            ${filterPickers().map(p => window.AFFilter.multi({
                id: p.id, label: p.label, options: p.options, selected: p.get(), title: p.title
            })).join('')}
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
        /* the hover wrapper is the flex item now; the ellipsis stays on the text */
        .q-row > .af-tipw { flex:1 1 auto; min-width:0; }
        .q-text { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
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
        /* The project mark rides after the target — both answer "where does
           this belong", so they read as one group. Clickable, so it gets the
           pointer every openable mark on this page has. */
        .q-proj { flex-shrink:0; font-size:11px; opacity:.85; cursor:pointer; }
        .q-proj:hover { opacity:1; text-decoration:underline; }
        .q-projrow { display:flex; gap:6px; align-items:center; margin:6px 0 2px; }
        .q-projrow select { padding:2px 6px; max-width:260px; }
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
                sub: `${(DATA.items || []).length} items · ${active} active${blocked ? ` · ${blocked} need you` : ''} · showing ${items.length} · ${window.AFTime.clockUtc(DATA.generatedAt)}`,
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

    /** Put an item into edit mode, seeded from what it currently says. One path
     *  for the row's Edit button and the menu's Edit item. */
    function startEdit(id) {
        const n = (DATA.items || []).find(x => x.id === id);
        if (!n) { return; }
        editDrafts[id] = { text: n.text || '', target: n.target || '', urgency: n.urgency || 'normal' };
        editing.add(id); expanded.add(id); render();
    }

    /** A cleared capture box. It comes back on the ACTIVE project rather than
     *  on nothing: the next thing typed here is almost always for the same
     *  project as the last, and re-picking it every time is the friction this
     *  box exists to avoid. */
    function freshDraft() {
        return { text: '', target: '', urgency: 'normal', project: DATA.activeProjectId || '' };
    }

    /** Open the reply box on a blocked item. */
    function startAnswer(id) {
        answerDrafts[id] = answerDrafts[id] || '';
        answering.add(id); expanded.add(id); render();
    }

    function wire() {
        const bind = (id, ev, fn) => { const el = document.getElementById(id); if (el) { el.addEventListener(ev, fn); } };
        bind('q-search', 'input', e => { query = e.target.value; refocusSearch = true; saveState(); render(); });
        filterPickers().forEach(p => window.AFFilter.wireMulti({
            id: p.id,
            onChange: sel => { p.set(sel); saveState(); render(); }
        }));
        bind('q-showdropped', 'change', e => { showDropped = e.target.checked; saveState(); render(); });
        bind('q-reset', 'click', () => { fTarget = DEF.fTarget; fAuthor = DEF.fAuthor; fProject = DEF.fProject; query = DEF.query; saveState(); render(); });

        // add form
        document.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => {
            const a = b.dataset.add;
            if (a === 'open') { addOpen = true; render(); }
            else if (a === 'cancel') { addOpen = false; addDraft = freshDraft(); render(); }
            else if (a === 'save') {
                const text = (document.getElementById('q-add-text') || {}).value || '';
                const target = (document.getElementById('q-add-target') || {}).value || '';
                const urgency = (document.getElementById('q-add-urg') || {}).value || 'normal';
                // ‼️ Sent even when it is empty, and that matters: `undefined`
                // would let the host fall back to the active project, so
                // "no project" chosen in the box has to arrive as the empty
                // string it is.
                const project = (document.getElementById('q-add-project') || {}).value || '';
                if (text.trim()) {
                    vscode.postMessage({ type: 'add', text: text.trim(), target: target.trim(), urgency, project });
                    addOpen = false; addDraft = freshDraft();
                }
            }
        }));
        ['q-add-text', 'q-add-target', 'q-add-urg', 'q-add-project'].forEach(id => {
            const el = document.getElementById(id); if (!el) { return; }
            const key = id === 'q-add-text' ? 'text'
                : id === 'q-add-target' ? 'target'
                    : id === 'q-add-project' ? 'project' : 'urgency';
            el.addEventListener('input', () => { addDraft[key] = el.value; });
            el.addEventListener('change', () => { addDraft[key] = el.value; });
        });

        // Filing, from the row's own picker and from the mark on the row.
        document.querySelectorAll('.q-pjsel').forEach(sel => sel.addEventListener('change', e => {
            e.stopPropagation();
            vscode.postMessage({ type: 'setProject', id: sel.dataset.id, project: sel.value });
        }));
        document.querySelectorAll('[data-openproj]').forEach(el => el.addEventListener('click', e => {
            e.stopPropagation();
            vscode.postMessage({ type: 'openProject', project: el.dataset.openproj });
        }));
        document.querySelectorAll('[data-act="openproj"]').forEach(el => el.addEventListener('click', e => {
            e.stopPropagation();
            vscode.postMessage({ type: 'openProject', project: el.dataset.project });
        }));

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
            else if (act === 'answer') { startAnswer(id); }
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
            else if (act === 'edit') { startEdit(id); }
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
            if (doc === 'main') { docMenu = null; vscode.postMessage({ type: 'openFile', kind, id }); render(); }
            else if (doc === 'caret') { docMenu = docMenu === key ? null : key; render(); }
            else if (doc === 'open') { docMenu = null; vscode.postMessage({ type: 'openFile', kind, id, mode: b.dataset.mode }); render(); }
            else if (doc === 'cfg') { docMenu = null; vscode.postMessage({ type: 'configureDocOpen' }); render(); }
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

    // ------------------------------------------------------- right-click menu

    /**
     * Everything a right-click on this page can ask for. Each branch runs what
     * the row's own button runs; what the menu adds is reaching all of it
     * without opening the item, and the urgency as a LIST rather than the
     * three-state cycle the ⏫ button walks (which needs three presses to get
     * back to where it was).
     */
    function ctxDo(act, ctx) {
        const verb = act.split(':')[0];
        const arg = act.slice(verb.length + 1);
        const id = String(ctx.item || '');
        // ‼️ Written out, not assembled: these are the row buttons' messages,
        // key for key, and a helper that put `id` first would not be.
        const post = (m) => vscode.postMessage(m);

        switch (verb) {
            case 'qOpen': expanded.add(id); render(); return;
            case 'qFold': expanded.delete(id); render(); return;
            case 'qNotice': {
                const n = (DATA.items || []).find(x => x.id === id);
                if (n && n.sourceNoticeId) { vscode.postMessage({ type: 'openNotice', id: n.sourceNoticeId }); }
                return;
            }
            case 'qFile': vscode.postMessage({ type: 'openFile', kind: arg, id: id }); return;
            case 'qAnswer': startAnswer(id); return;
            case 'qEdit': startEdit(id); return;
            case 'qUrg': post({ type: 'setUrgency', id: id, urgency: arg }); return;
            case 'qHand': post({ type: 'handoff', id: id }); return;
            case 'qDrop': post({ type: 'drop', id: id }); return;
            case 'qRemove': expanded.delete(id); post({ type: 'remove', id: id }); return;
            case 'qCopy': {
                const n = (DATA.items || []).find(x => x.id === id);
                window.AFCtx.copy(!n ? '' : arg === 'id' ? n.id : n.text);
                return;
            }

            // ---- a lane heading ----
            case 'qlDropped': showDropped = arg === '1'; saveState(); render(); return;
            // "This lane" is every item CURRENTLY SHOWN in it — the categories
            // split the same lane in two, and a copy that silently took only
            // half would be worse than one that says which half it took.
            case 'qlCopy': {
                const lane = String(ctx.lane || '');
                const rows = visible().filter(n => n.status === lane);
                window.AFCtx.copy(rows.length
                    ? `## ${ctx.laneLabel || lane} (${rows.length})\n\n`
                        + rows.map(n => `- ${n.text}${n.target ? ` — ${n.target}` : ''}`).join('\n')
                    : '');
                return;
            }
        }
    }

    // ‼️ ONCE, at module scope — wire() runs again on every paint.
    window.AFCtx.listen(ctxDo);

    window.addEventListener('message', ev => {
        if (ev.data.type === 'data') {
            DATA = ev.data.data;
            if (DATA.focusItem) { focusItem = DATA.focusItem; expanded.add(DATA.focusItem); }
            render();
            return;
        }
        // ‼️ THE PALETTE OPENS THE PAGE'S OWN CAPTURE BOX (U-14). `queueAdd`
        // asked for the text in an input box, which can state the text and
        // nothing else — this page's box also carries the target and the
        // urgency, and it shows the queue you are adding to.
        if (ev.data.type === 'q-compose') {
            addOpen = true;
            addDraft = Object.assign(freshDraft(), { text: String(ev.data.text || '') });
            render();
            const box = document.getElementById('q-add-text');
            if (box) { box.focus(); }
        }
    });
    if (focusItem) { expanded.add(focusItem); }

    // Close the "open with" split menu on ANY click outside it. Capture phase so
    // it fires even for elements that stopPropagation in the bubble phase; the
    // caret's own handler still toggles the menu because it runs after this.
    document.addEventListener('click', ev => {
        if (!docMenu) { return; }
        const t = ev.target;
        if (!(t && t.closest && t.closest('.q-split'))) { docMenu = null; render(); }
    }, true);

    render();
})();
