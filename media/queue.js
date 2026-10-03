// Agent Farm — Work Queue page. The user→agent async channel (mirror of
// Notices). Low-friction capture; items persist until HANDLED and are shown in
// PIPELINE LANES so the user can track what got done and how. Reads nothing but
// its own store data. See src/core/workqueue.ts.
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    let DATA = window.__DATA__;
    // U-189 — every word below is English and drawn through t() / lab(); the catalog part is media/afI18n.tr.queue.js.
    const t = (s, v) => (window.AFI18n ? window.AFI18n.t(s, v) : s.replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? String(v[k]) : m)));
    const lab = s => (window.AFI18n ? window.AFI18n.label(s) : s);

    const st = (typeof vscode.getState === 'function' && vscode.getState()) || {};
    // Target / author are multi-pick: null = all (no filter), an array = exactly
    // that subset, [] = none. See media/afFilters.js.
    /** The engine filter's word for "nobody asked for one" — the page's own
     *  half of core/workqueue.ts NO_ROUTE, and never a real engine id. */
    const NO_ENGINE = '(none)';
    /** X-254 - and the same word for the sign-in axis, for the same reason:
     *  an item nobody claimed a plan for is a BUCKET, not an absence. */
    const NO_ACCOUNT = '(none)';
    const DEF = { fTarget: null, fEngine: null, fAccount: null, fAuthor: null, fProject: null, query: '', showDropped: false, agentLaneOpen: false };
    let fTarget = Array.isArray(st.fTarget) ? st.fTarget : null;
    let fEngine = Array.isArray(st.fEngine) ? st.fEngine : null;
    let fAccount = Array.isArray(st.fAccount) ? st.fAccount : null;
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
    const selected = new Set();     // N-11 — the bulk hand's rows
    const srcOpen = new Set();      // items showing their source notice in full (N-10)
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
    let addDraft = { text: '', target: '', engine: '', model: '', effort: '', urgency: 'normal', project: DATA.activeProjectId || '' };
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
        return `<a href="#" class="q-live q-live-${m[2]} q-afnav" data-to="${to}" title="${esc(t('Live {kind} status — click to open', { kind: t(String(lv.kind || '')) }))}${lv.title ? ': ' + esc(lv.title) : ''}">${m[0]} ${esc(t(m[1]))}</a>`;
    }

    function saveState() { if (vscode.setState) { vscode.setState({ fTarget, fEngine, fAccount, fAuthor, query, showDropped, agentLaneOpen }); } }
    function esc(s) { return C.esc(String(s == null ? '' : s)); }
    function fileBase(p) { return String(p || '').split(/[\\/]/).pop(); }
    function authorChip(a) { return a === 'user' ? '🧑 ' + t('you') : '🤖 ' + esc(a); }
    function timeLabel(ts) { return new Date(ts).toLocaleString((window.AFI18n && window.AFI18n.locale()) || undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }

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
            [n.text, n.target || '', n.engine || '', n.account || '', n.model || '', n.effort || '', n.author, n.resolution || '', n.stamp || '', (n.tags || []).join(' ')].join(' '));
    }
    function passesFilters(n) {
        return (!fTarget || fTarget.indexOf(n.target || '') >= 0) &&
            (!fEngine || fEngine.indexOf(n.engine || NO_ENGINE) >= 0) &&
            // X-254 - whose plan the item asks for, on the same terms as the
            // engine above: the unclaimed ones answer to their own bucket so a
            // sign-in filter never makes rows vanish with nothing naming them.
            (!fAccount || fAccount.indexOf(n.account || NO_ACCOUNT) >= 0) &&
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
            <label class="muted small" for="q-pj-${esc(n.id)}">${esc(t('Project'))}</label>
            <select class="q-pjsel" id="q-pj-${esc(n.id)}" data-id="${esc(n.id)}"
                title="${esc(t('Which project this item is work for. It shows on that project\'s Work tab and timeline; the empty option takes the stamp off again.'))}">
                ${window.AFProject.options(DATA.projects, cur, { anyLabel: t('— none') })}
            </select>
            ${cur && projOf(n) ? `<button class="secondary" data-act="openproj" data-project="${esc(cur)}" title="${esc(t('Open this project\'s page'))}">${esc(lab('◧ Open'))}</button>` : ''}
            ${cur && !projOf(n) ? `<span class="muted small" title="${esc(t('The project this was filed under no longer exists — pick another, or clear it'))}">${esc(lab('⚠ project gone'))}</span>` : ''}
        </div>`;
    }

    function urgencyBadge(n) {
        return n.urgency && n.urgency !== 'normal' ? `<span class="q-urg u-${n.urgency}">${lab(URG[n.urgency])}</span>` : '';
    }

    // N-10 — an item converted from a notice carries the notice; a legacy one
    // carries only its title, and still draws.
    function sourceKind(n) {
        const type = String(n.sourceNoticeType || '');
        const word = t(type || 'notice');
        return { icon: type === 'question' ? '❓' : '🔔', word, label: word.charAt(0).toLocaleUpperCase(window.AFI18n ? window.AFI18n.lang() : undefined) + word.slice(1) };
    }

    function sourceLink(n) {
        if (!n.sourceNoticeId) { return ''; }
        const k = sourceKind(n);
        const title = n.sourceNoticeTitle ? esc(n.sourceNoticeTitle) : esc(t('(message)'));
        const from = n.sourceNoticeAgent ? ` <span class="muted">· ${t('from {agent}', { agent: '<strong>' + esc(n.sourceNoticeAgent) + '</strong>' })}</span>` : '';
        const secs = n.sourceNoticeSections || [];
        const has = !!(n.sourceNoticeBody || secs.length || n.sourceNoticeReportPath);
        const open = has && srcOpen.has(n.id);
        const toggle = has ? ` <button class="secondary q-srctoggle" data-act="srcfull" data-id="${esc(n.id)}" title="${esc(t(open ? 'Hide the notice as it read when it became this item' : 'Show the notice as it read when it became this item'))}">${open ? '▾' : '▸'} ${esc(t('Original'))}</button>` : '';
        let h = `<div class="q-src">${k.icon} ${esc(k.label)}: <a href="#" class="q-openNotice" data-id="${esc(n.sourceNoticeId)}" title="${esc(t('Go to the source notice'))}">${title}</a>${from}${toggle}</div>`;
        if (!open) { return h; }
        h += '<div class="q-srcfull">';
        if (n.sourceNoticeBody) { h += `<div class="q-md">${mdToHtml(n.sourceNoticeBody)}</div>`; }
        for (const s of secs) { h += `<div class="q-srcsec"><div class="q-srcsec-h">${esc(s.title || '')}</div><div class="q-md">${mdToHtml(s.body || '')}</div></div>`; }
        if (n.sourceNoticeReportPath) {
            h += `<button class="secondary" data-act="srcreport" data-id="${esc(n.id)}" title="${esc(n.sourceNoticeReportPath)}">📄 ${esc(t('Open the notice\'s report ({file})', { file: fileBase(n.sourceNoticeReportPath) }))}</button>`;
        }
        return h + '</div>';
    }

    function delegationLink(n) {
        const bits = [];
        if (n.missionId) { bits.push(`<a href="#" class="q-afnav" data-to="missions" title="${esc(t('Open the Missions panel'))}">🎯 ${esc(t('mission {id}', { id: n.missionId.slice(0, 8) }))}</a>`); }
        if (n.taskId) { bits.push(`<a href="#" class="q-afnav" data-to="tasks" title="${esc(t('Open the Tasks panel'))}">⚙ ${esc(t('task {id}', { id: n.taskId.slice(0, 8) }))}</a>`); }
        if (n.groupId) { bits.push(`<span class="muted small">${esc(t('group {id}', { id: n.groupId.slice(0, 8) }))}</span>`); }
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
            ${DOC_MODES.map(([m, l]) => `<button class="q-docopt${m === def ? ' cur' : ''}" data-doc="open" data-kind="${kind}" data-id="${esc(id)}" data-mode="${m}">${esc(lab(l))}${m === def ? ` <span class="muted small">${esc(t('· default'))}</span>` : ''}</button>`).join('')}
            <button class="q-docopt cfg" data-doc="cfg" data-kind="${kind}" data-id="${esc(id)}">${esc(lab('⚙ Configure default & custom app…'))}</button>
          </div>` : '';
        return `<span class="q-split">
            <button class="secondary q-docmain" data-doc="main" data-kind="${kind}" data-id="${esc(id)}" title="${esc(path)}">${label}</button>
            <button class="secondary q-doccaret" data-doc="caret" data-kind="${kind}" data-id="${esc(id)}" title="${esc(t('Open with…'))}" aria-expanded="${docMenu === key ? 'true' : 'false'}">▾</button>
            ${menu}</span>`;
    }

    function outcomeBlock(n) {
        if (!n.stamp && !n.resolution && !n.answerPath && !n.reportPath && !n.userReply) { return ''; }
        let h = '<div class="q-outcome">';
        if (n.stamp) { h += `<div class="q-stamp">${esc(n.stamp)}</div>`; }
        if (n.userReply) { h += `<div class="q-reply"><span class="q-reply-h">💬 ${esc(t('your reply'))}</span><div class="q-md">${mdToHtml(n.userReply)}</div></div>`; }
        if (n.resolution) { h += `<div class="q-md">${mdToHtml(n.resolution)}</div>`; }
        const files = [];
        if (n.answerPath) { files.push(docSplit('answer', n.id, `📝 ${esc(t('Open answer ({file})', { file: fileBase(n.answerPath) }))}`, n.answerPath)); }
        if (n.reportPath) { files.push(docSplit('report', n.id, `📄 ${esc(t('Open report ({file})', { file: fileBase(n.reportPath) }))}`, n.reportPath)); }
        if (files.length) { h += `<div class="q-files">${files.join(' ')}</div>`; }
        if (n.handledAt) { h += `<div class="muted small">${esc(t('handled: {when}', { when: window.AFTime.full(n.handledAt) }))}</div>`; }
        return h + '</div>';
    }

    // U-130 — three bare words in a narrow box, drawn in two places. What
    // each one DOES to the item's place in the queue is the fact nobody could
    // see, and the box is far too small to say it.
    const URGENCY_WHY = {
        normal: 'Takes its turn. Nothing jumps it and it jumps nothing.',
        soon: 'Sorted ahead of the normal items, behind the urgent ones.',
        urgent: 'Goes to the front and stays visible until it is done.'
    };
    const urgencyOpts = cur => ['normal', 'soon', 'urgent'].map(k =>
        C.option(k, t(k), { selected: cur === k, detail: t(URGENCY_WHY[k]) })).join('');

    function editForm(n) {
        const d = editDrafts[n.id];
        const urgOpts = urgencyOpts(d.urgency);
        return `<div class="q-edit">
            <label>${esc(t('Text'))}</label><textarea class="q-ef" data-ef="text" rows="3">${esc(d.text)}</textarea>
            <div class="q-erow"><span><label>${esc(t('Target'))}</label><input class="q-ef" data-ef="target" value="${esc(d.target)}" placeholder="${esc(t('repo or agent'))}"></span>
              <span><label>${esc(t('Urgency'))}</label><select class="q-ef" data-ef="urgency">${urgOpts}</select></span></div>
            <div class="btnrow"><button data-act="editsave" data-id="${esc(n.id)}">${esc(t('Save'))}</button>
              <button class="secondary" data-act="editcancel" data-id="${esc(n.id)}">${esc(t('Cancel'))}</button></div>
        </div>`;
    }

    // GAP-2: inline reply box shown on a blocked item — the user's answer that
    // re-animates it back into the pipeline.
    function answerForm(n) {
        const d = answerDrafts[n.id] || '';
        return `<div class="q-answer">
            <label>${esc(t('Your answer — sends this back into the pipeline'))}</label>
            <textarea class="q-af" data-af-id="${esc(n.id)}" rows="3" placeholder="${esc(t('Reply to unblock this…'))}">${esc(d)}</textarea>
            <div class="btnrow"><button data-act="answersend" data-id="${esc(n.id)}">${esc(t('Send answer'))}</button>
              <button class="secondary" data-act="answercancel" data-id="${esc(n.id)}">${esc(t('Cancel'))}</button></div>
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
                ${n.target ? `<div class="muted small">${t('target: {target}', { target: '<strong>' + esc(n.target) + '</strong>' })}</div>` : ''}
                ${delegationLink(n)}${outcomeBlock(n)}${routePicker(n)}${projectPicker(n)}
                <div class="btnrow q-actions">
                    ${n.status === 'blocked' ? `<button data-act="answer" data-id="${esc(n.id)}" title="${esc(t('Answer this — records your reply and sends it back into the pipeline'))}">💬 ${esc(t('Answer'))}</button>` : ''}
                    <button data-act="handoff" data-id="${esc(n.id)}" title="${esc(t('Open the responsible agent and type this into its terminal (not sent)'))}">🔗 ${esc(t('Hand to agent'))}</button>
                    ${!terminal ? `<button class="secondary" data-act="urg" data-id="${esc(n.id)}" title="${esc(t('Cycle urgency'))}">⏫ ${esc(t('Urgency'))}</button>` : ''}
                    ${!terminal ? `<button class="secondary" data-act="edit" data-id="${esc(n.id)}">${esc(t('Edit'))}</button>` : ''}
                    ${!terminal ? `<button class="secondary" data-act="drop" data-id="${esc(n.id)}" title="${esc(t('Void this item (dropped). It can only be deleted once handled.'))}">${esc(t('Drop'))}</button>` : ''}
                    ${terminal ? `<button class="secondary danger" data-act="remove" data-id="${esc(n.id)}" title="${esc(t('Delete permanently (only handled items can be deleted)'))}">🗑 ${esc(t('Delete'))}</button>` : ''}
                </div>
                ${answering.has(n.id) ? answerForm(n) : ''}`;
        }
        return `<div class="q-card s-${n.status} ${n.pinned ? 'pinned' : ''} ${focusItem === n.id ? 'focus' : ''}${selected.has(n.id) ? ' sel' : ''}" data-id="${esc(n.id)}">
            <div class="q-row" data-toggle="${esc(n.id)}" ${itemCtx(n, open, terminal)}
                title="${esc(window.AFCtx.hint(t('Click to open it')))}">
                ${window.AFBulk.cb(n.id, selected.has(n.id))}
                <span class="q-caret">${open ? '▾' : '▸'}</span>
                <span class="q-author" title="${esc(t(n.author === 'user' ? 'your entry' : 'agent entry'))}">${authorChip(n.author)}</span>
                <!-- The item is TEXT and the row ellipsises it, so the hover has
                     to carry the WHOLE of it — the rich panel, never a native
                     title that stops where the platform pleases
                     (docs/CONVENTIONS.md → Hover). The wrapper takes the row's
                     flex share; the ellipsis stays on the span inside it. -->
                ${window.AFTip.wrap(`<span class="q-text">${esc(n.text)}</span>`,
                `${t(n.author === 'user' ? 'Your entry' : 'Agent entry')} · ${timeLabel(n.ts)}`
                + `${n.target ? ' · ' + t('for {target}', { target: n.target }) : ''}`
                + ` · ${routeWords(n) ? t('asks for {route}', { route: routeWords(n) }) : t('unclaimed')} · ${window.AFTip.sizeNote(n.text)}`,
                n.text)}
                ${liveChip(n)}
                ${urgencyBadge(n)}
                ${n.target ? `<span class="q-target">${esc(n.target)}</span>` : ''}
                ${routeChip(n)}
                ${projectChip(n)}
                ${tags ? `<span class="q-tags">${tags}</span>` : ''}
                ${n.sourceNoticeId ? `<span class="q-badge src" title="${esc(t('From a {kind}', { kind: sourceKind(n).word }))}${n.sourceNoticeAgent ? ` · ${esc(n.sourceNoticeAgent)}` : ''}">${sourceKind(n).icon}</span>` : ''}
                ${window.AFBulk.age(n.ts, t(n.author === 'user' ? 'Captured' : 'Delegated'))}
                ${window.AFBulk.x(n.id, t(terminal ? 'Delete this item for good'
                    : 'Drop this item — it is voided (handled), and then it can be deleted'))}
            </div>
            <div class="q-body" ${open ? '' : 'hidden'}>${body}</div>
        </div>`;
    }

    function laneHtml(lane, items) {
        if (!items.length) { return ''; }
        const name = t(lane.label);
        return `<div class="q-lane s-${lane.id}">
            <div class="q-lane-head"
                ${window.AFCtx.row('afQueueLane', { lane: lane.id, laneLabel: name, afDropShown: !!showDropped })}
                title="${esc(window.AFCtx.hint(name))}"><span class="q-lane-ico">${lane.icon}</span> ${esc(name)} <span class="q-lane-n">${items.length}</span></div>
            ${items.filter(n => n.pinned).map(itemCard).join('')}${window.AFBulk.days(items.filter(n => !n.pinned), itemCard, DATA.now)}</div>`;
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
        return order.filter(s => tally[s]).map(s => `${tally[s]} ${t((LIVE_META[s] || ['', s])[1])}`).join(' · ');
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

    /**
     * ‼️ X-49 — WHO SHOULD TAKE THIS, IN THREE BOXES THAT ASK FOR NOTHING.
     *
     * This section was written when there was one engine, so `target` — a repo
     * or an agent name — was the whole of "who". With five engines the question
     * a queued item cannot answer is *which engine, on which model, at what
     * effort*, and without it a task can only be told "do the queue", never "do
     * the work meant for me and leave the rest".
     *
     * All three are OPTIONAL and stay out of the way: they are placeholder
     * selects, exactly like the Backlog capture box's `— area —` and `— type —`,
     * and an item written without touching them is unclaimed — which is a real
     * answer, and one an agent can ask for by name (`engine:"(none)"`).
     *
     * ‼️ THE BOXES NARROW EACH OTHER, because the engine decides what the other
     * two can even mean (S-20, X-30): no engine means no model box, since a
     * model without an engine names nothing; an engine with no effort setting
     * draws no effort box at all rather than an empty one; and a model whose
     * levels do not include what was chosen takes that model's own default.
     * `AFEngine` holds those rules so this page and the Tasks form cannot come
     * to different conclusions.
     */
    function routeBoxes(prefix, d, kind, itemId) {
        const L = DATA.launch || {};
        const engines = (L.engines || []);
        if (!engines.length) { return ''; }
        const opt = (v, t, cur, detail) => C.option(v, t, { selected: v === cur, detail });
        const eng = d.engine || '';
        const models = eng ? window.AFEngine.models(L, eng) : [];
        const efforts = eng ? window.AFEngine.efforts(L, eng, d.model || '') : [];
        const accounts = eng ? engineAccounts(eng) : [];
        const at = `data-kind="${esc(kind)}" data-item="${esc(itemId || '')}"`;
        let h = `<span><select id="${prefix}-engine" data-route="engine" ${at}
            title="${esc(routeTitle('engine', eng ? window.AFEngine.label(eng) : ''))}">
            ${opt('', t('— engine —'), eng, t('No engine asked for — the item runs on whatever its agent resolves to.'))}${engines.map(e => opt(e.id, e.label, eng, e.detail || '')).join('')}</select></span>`;
        /**
         * ‼️ X-254 (2/n) — THE FOURTH BOX, and it sits beside the engine for the
         * reason the launcher puts it there: an account belongs to ONE engine,
         * so it cannot be offered before one is named and it must be cut by the
         * one that is.
         *
         * Drawn only where that engine really has sign-ins on this machine —
         * on an engine whose identity cannot be isolated, or a machine that has
         * captured none, a box here would be a question with no answers.
         *
         * The rows come from the component (X-263), so this picker carries the
         * five-hour figure the Console's already had; the two rows ABOVE them
         * are this SITE's own sentence, because what "no account" means is
         * about the queue and not about the account (ONE SUBJECT).
         */
        if (eng && accounts.length) {
            h += `<span><select id="${prefix}-account" data-route="account" ${at}
                title="${esc(routeTitle('account', accountWords(d.account || '')))}">
                ${opt('', t('— account —'), d.account || '',
                t('No sign-in asked for — whoever takes the item spends whatever their own '
                + 'rotation resolves to. This is a real answer, and it is what "(none)" '
                + 'filters for.'))}${opt(window.AFAccount.MACHINE, window.AFAccount.MACHINE_ROW, d.account || '',
                t('The identity this machine itself is signed in as, asked for OUTRIGHT — '
                + 'unlike the empty row above, this is a claim somebody made.'))}${strayAccountOption(d.account || '', accounts, opt)}${window.AFAccount.grouped(enginePolicies(eng), accounts, d.account || '', C)}</select></span>`;
        }
        if (eng && models.length) {
            h += `<span><select id="${prefix}-model" data-route="model" ${at}
                title="${esc(routeTitle('model', d.model || ''))}">
                ${opt('', t('— model —'), d.model || '', t('No model asked for — the engine picks its own.'))}${models.map(m => opt(m.id, m.label || m.id, d.model || '', m.detail || (m.label && m.label !== m.id ? m.id : ''))).join('')}</select></span>`;
        }
        if (eng && efforts.length) {
            h += `<span><select id="${prefix}-effort" data-route="effort" ${at}
                title="${esc(routeTitle('effort', d.effort || ''))}">
                ${opt('', t('— effort —'), d.effort || '', t('No effort asked for — resolved at launch.'))}${efforts.filter(e => e.id).map(e => opt(e.id, e.label || e.id, d.effort || '', e.detail || '')).join('')}</select></span>`;
        }
        return h;
    }

    /** X-254 — the sign-ins one engine has on this machine, or none. */
    function engineAccounts(engine) {
        const all = (DATA.launch || {}).accounts || {};
        return (all[engine || ''] || []).filter(a => a && a.id);
    }

    /**
     * ‼️ X-305 — …AND THE RULES, which is usually the better answer HERE.
     *
     * An item sits in a queue, sometimes for hours, before anybody takes it. A
     * slot named when it was written is the fact about it most likely to be
     * stale by then — a rule is decided at the moment it is taken.
     */
    function enginePolicies(engine) {
        const all = (DATA.launch || {}).policies || {};
        return (all[engine || ''] || []).filter(p => p && p.id);
    }

    /**
     * ‼️ X-254 (2/n) — A ROW FOR THE SIGN-IN THE ITEM ASKS FOR WHEN IT IS NOT
     * IN THE LIST, and without it this box would LIE.
     *
     * A `<select>` whose value matches no option falls back to its first one —
     * which here is “— account —”, i.e. UNCLAIMED. So an item pinned to a slot
     * the user has since deleted would read as work anybody can take, on the
     * one surface where somebody is deciding what to hand out. The stray id is
     * offered by name and marked, so the box says what the item says and
     * picking anything else is a deliberate correction.
     */
    function strayAccountOption(cur, list, opt) {
        const want = String(cur || '').trim();
        if (!want || want === window.AFAccount.MACHINE) { return ''; }
        if (list.some(a => a.id === want)) { return ''; }
        return opt(want, '⚠ ' + want, want,
            t('This item asks for a sign-in that is not on this machine — it may have been '
            + 'forgotten, or it belongs to another engine. Nothing will refuse the item, '
            + 'but whoever picks it up cannot honour it: pick a live one, or clear it.'));
    }

    /**
     * SHORTHAND — the sign-in as a ROW can carry it: the name alone, the
     * machine identity's own row, and a warning sign for one that is not here.
     */
    function accountShort(id) {
        const want = String(id || '').trim();
        if (!want) { return ''; }
        if (want === window.AFAccount.MACHINE) { return window.AFAccount.MACHINE_ROW; }
        const all = (DATA.launch || {}).accounts || {};
        for (const k of Object.keys(all)) {
            const hit = (all[k] || []).find(a => a && a.id === want);
            if (hit) { return (hit.health === 'ready' ? '' : '⚠ ') + (hit.label || want); }
        }
        return '⚠ ' + want;
    }

    /** …and every engine's, for the FILTER — which asks "what is queued against
     *  this plan", a question that does not stop at one engine. */
    function allAccounts() {
        const all = (DATA.launch || {}).accounts || {};
        const out = [];
        for (const k of Object.keys(all)) {
            for (const a of (all[k] || [])) { if (a && a.id) { out.push(a); } }
        }
        return out;
    }

    /**
     * X-254 — what an item's stored account is CALLED, for a place that has
     * room for words rather than a row.
     *
     * ‼️ A slot the machine no longer holds is named and marked rather than
     * printed as if it were fine: an item asking for a sign-in nobody can serve
     * is exactly what somebody scanning the queue needs to see.
     */
    function accountWords(id) {
        const want = String(id || '').trim();
        if (!want) { return ''; }
        if (want === window.AFAccount.MACHINE) { return window.AFAccount.MACHINE_ROW; }
        const all = (DATA.launch || {}).accounts || {};
        for (const k of Object.keys(all)) {
            const hit = (all[k] || []).find(a => a && a.id === want);
            if (hit) { return hit.label || want; }
        }
        return t('{id} (not on this machine)', { id: want });
    }

    /** MIRROR — a box narrow enough to cut its own text says its CURRENT value
     *  first, then what the box is for. */
    function routeTitle(axis, cur) {
        const what = t(axis === 'engine'
            ? 'Which engine should take this item.'
            : axis === 'account' ? 'Whose plan should pay for it — a sign-in of that engine.'
                : axis === 'model' ? 'Which model that engine should use.' : 'What effort it should run at.');
        return `${cur ? t('{axis}: {v}', { axis: t(axis), v: cur }) : t('no {axis} asked for', { axis: t(axis) })}\n\n${what}\n\n`
            + t('Optional. Nothing is started from here — the queue does not dispatch. '
            + 'It is what a task reads to pick out the work meant for it, so leaving it empty '
            + 'is itself an answer: the item is unclaimed and anyone can take it.');
    }

    /** The route in words, for a line of prose. '' when nobody claimed it. */
    function routeWords(n) {
        // X-254 — the sign-in reads after the engine, where the box is.
        return [n.engine ? window.AFEngine.label(n.engine) : '', accountWords(n.account),
            n.model || '', n.effort || '']
            .filter(Boolean).join(' · ');
    }

    /** The route as it is READ — the engine's own badge, so it is the same mark
     *  this thing carries on every other page (U-26), then the two words that
     *  narrow it. Nothing is drawn for an item nobody claimed. */
    function routeChip(n) {
        if (!n.engine && !n.account && !n.model && !n.effort) { return ''; }
        /**
         * SHORTHAND — the shortest unambiguous form of the sign-in, with the
         * hover below carrying the long one.
         *
         * ‼️ X-254 (2/n) — AND A SIGN-IN THIS MACHINE NO LONGER HOLDS IS MARKED
         * ON THE ROW ITSELF, not only in its hover. An item asking for a plan
         * nobody can serve is broken work, and somebody scanning the queue for
         * something to hand out is exactly who needs to see it without opening
         * anything.
         */
        const acct = accountShort(n.account);
        const rest = [acct, n.model, n.effort].filter(Boolean).join(' · ');
        const figures = [
            t('Engine: {engine}', { engine: n.engine ? window.AFEngine.label(n.engine) : t('any') }),
            // MIRROR — the long form of what the chip abbreviates, and the one
            // fact the queue's fourth axis exists for.
            t('Account: {account}', { account: n.account ? accountWords(n.account) : t('any') }),
            t('Model: {model}', { model: n.model || t('any') }),
            t('Effort: {effort}', { effort: n.effort || t('any') })
        ].join('\n');
        return `<span class="q-route" title="${esc(figures)}">`
            + `${n.engine ? window.AFEngine.badge(n.engine) : ''}`
            + `${rest ? `<span class="q-route-rest">${esc(rest)}</span>` : ''}</span>`;
    }

    /** The same three boxes on an OPEN row, beside the project picker — the one
     *  place an item's route is changed after it was written. */
    function routePicker(n) {
        const boxes = routeBoxes('q-rt-' + n.id, n, 'row', n.id);
        if (!boxes) { return ''; }
        return `<div class="q-routerow" data-id="${esc(n.id)}">
            <label class="muted small">${esc(t('Who takes it'))}</label>${boxes}
            ${(n.engine || n.account || n.model || n.effort)
                ? `<button class="secondary" data-act="routeclear" data-id="${esc(n.id)}"
                     title="${esc(t('Unclaim this item — it goes back to being work anyone can take'))}">✕ ${esc(t('unclaim'))}</button>`
                : `<span class="muted small">${esc(t('unclaimed — anyone can take it'))}</span>`}
        </div>`;
    }

    function addForm() {
        if (!addOpen) { return `<div class="q-addbar"><button data-add="open">${esc(lab('＋ Add to queue'))}</button></div>`; }
        const targets = (DATA.targets || []);
        const dl = targets.map(t => `<option value="${esc(t)}"></option>`).join('');
        const urgOpts = urgencyOpts(addDraft.urgency);
        return `<div class="q-add">
            <textarea id="q-add-text" rows="2" placeholder="${esc(t('What needs doing? (one line is enough — friction-free)'))}">${esc(addDraft.text)}</textarea>
            <div class="q-erow">
                <span><input id="q-add-target" list="q-targets" value="${esc(addDraft.target)}" placeholder="${esc(t('Target (optional): a repo or agent'))}"><datalist id="q-targets">${dl}</datalist></span>
                ${routeBoxes('q-add', addDraft, 'add')}
                <span><select id="q-add-urg">${urgOpts}</select></span>
                <span><select id="q-add-project" title="${esc(t('Which project this is work for. It opens on the window\'s active project because that is what you are working on; change it here, or take it off later from the item\'s own row.'))}">${window.AFProject.options(DATA.projects, addDraft.project, { anyLabel: t('— no project') })}</select></span>
            </div>
            <div class="btnrow"><button data-add="save">${esc(t('Add'))}</button><button class="secondary" data-add="cancel">${esc(t('Cancel'))}</button>
              <span class="muted small">${esc(t('An item can\'t be deleted until it\'s handled.'))}</span></div>
        </div>`;
    }

    // The two multi-pick filters, described once so markup and wiring cannot drift.
    function filterPickers() {
        return [
            { id: 'q-target', label: t('Targets'), get: () => fTarget, set: v => { fTarget = v; },
                title: t('Which targets to list — tick any combination'),
                options: (DATA.targets || []).slice() },
            // ‼️ X-49 — "Unclaimed" is an OPTION here for the same reason "No
            // project" is one below: without it, filtering to an engine makes
            // the items nobody asked anyone for vanish with nothing on screen
            // saying they exist — and those are exactly the ones somebody
            // looking for work to hand out is about to want.
            { id: 'q-engine', label: t('Engines'), get: () => fEngine, set: v => { fEngine = v; },
                title: t('Which engine the item asks for — tick any combination. This is what it WANTS, not where it ran; the queue starts nothing.'),
                options: [{ v: NO_ENGINE, t: t('— Unclaimed') }].concat(
                    ((DATA.launch || {}).engines || []).map(e => ({ v: e.id, t: e.label }))) },
            /**
             * ‼️ X-254 (2/n) — AND WHOSE PLAN, which is the question the engine
             * filter beside it stopped answering the day one engine held five
             * sign-ins.
             *
             * Drawn only where sign-ins have been captured at all: on a machine
             * with none this is a picker with one row saying "unclaimed", which
             * is a filter that cannot filter. Every engine's accounts are listed
             * together, because the reader is asking "what is queued against
             * this plan", not "what is queued against this engine" — they have
             * the box above for that.
             */
            ...(allAccounts().length ? [{
                id: 'q-account', label: t('Accounts'), get: () => fAccount, set: v => { fAccount = v; },
                title: t('Whose plan the item asks to be paid for by — tick any combination. '
                    + 'This is what it WANTS: the queue starts nothing and spends nothing.'),
                options: [{ v: NO_ACCOUNT, t: t('— Unclaimed') },
                    { v: window.AFAccount.MACHINE, t: window.AFAccount.MACHINE_ROW }]
                    .concat(allAccounts().map(a => ({ v: a.id, t: window.AFAccount.label(a) })))
            }] : []),
            // U-52 — "mine" is one option, so a click on its name already gives
            // you it. Its opposite — everything the fleet put here — is as many
            // options as there are agents and had no name at all.
            { id: 'q-author', label: t('Authors'), get: () => fAuthor, set: v => { fAuthor = v; },
                title: t('Who wrote the item — tick any combination'),
                presets: (DATA.agents || []).length > 1 ? [{
                    id: 'agents', label: t('Agents'), values: (DATA.agents || []).slice(),
                    title: t('Everything the fleet put here — every agent, and nothing you wrote yourself.')
                }] : [],
                options: [{ v: 'user', t: '🧑 ' + t('mine') }].concat((DATA.agents || []).map(a => ({ v: a, t: '🤖 ' + a }))) },
            // ‼️ "No project" is an OPTION, not the absence of one — without it
            // a project filter makes the unfiled items vanish with nothing on
            // screen saying they exist, and those are exactly the ones somebody
            // filtering by project is about to want to file.
            { id: 'q-project', label: t('Projects'), get: () => fProject, set: v => { fProject = v; },
                title: t('Which project\'s items to list — manage them on the ◧ Projects page'),
                options: [{ v: window.AFProject.NONE, t: t('— No project') }].concat(
                    (DATA.projects || []).map(p => ({ v: p.id, t: (p.icon ? p.icon + ' ' : '') + p.name }))) }
        ];
    }

    /** N-11 — Notices' contract: the SELECTED rows, or every row shown when none is. */
    function bulkBar(items) {
        const target = selected.size ? t('{n} selected', { n: selected.size }) : t('all {n} shown', { n: items.length });
        return window.AFBulk.bar('q-selall', items.length && items.every(n => selected.has(n.id)), [
            window.AFBulk.delBtn(t('Delete for good'),
                t('Deletes the HANDLED items among {target} (done · dropped).\n\n'
                + 'A live item is never deleted — the queue\'s rule is that nothing vanishes before it is handled. '
                + 'Drop it first (✕ on its row), then delete it.', { target })),
            window.AFBulk.clearBtn('clearHandled', t('Clear handled'), t('Clear what is already handled'),
                t('Deletes every done and dropped item in the queue, whatever is filtered or shown.\n\n'
                + '📌 Pinned and archived items are kept. Live items are never touched.'))
        ]);
    }

    function controls(items) {
        return `<div class="q-controls">
            <input id="q-search" type="search" placeholder="${esc(lab('🔍 search'))}" value="${esc(query)}"
                title="${esc(window.AFQuery.tip(t('Searched against the item, its target, the engine/model/effort it asks for, its author, its resolution, its stamp and its tags.')))}">
            ${filterPickers().map(p => window.AFFilter.multi({
                id: p.id, label: p.label, options: p.options, selected: p.get(), title: p.title,
                presets: p.presets
            })).join('')}
            <label class="q-drop"><input type="checkbox" id="q-showdropped" ${showDropped ? 'checked' : ''}> ${esc(t('show dropped'))}</label>
            <button class="secondary" id="q-reset" title="${esc(t('Reset filters'))}">↺</button>
            ${bulkBar(items)}
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
        .q-card.sel { background:var(--vscode-list-inactiveSelectionBackground); }
        .q-row:hover { background:var(--vscode-list-hoverBackground); }
        .q-caret { width:12px; opacity:.7; flex-shrink:0; }
        .q-author { flex-shrink:0; font-size:11px; opacity:.85; }
        /* the hover wrapper is the flex item now; the ellipsis stays on the text */
        .q-row > .af-tipw { flex:1 1 auto; min-width:0; }
        .q-text { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .q-target { flex-shrink:0; font-size:10px; border:1px solid var(--vscode-panel-border); border-radius:3px; padding:1px 5px; opacity:.85; }
        /* X-49 — what the item ASKS FOR, beside where it belongs. The engine
           keeps its own badge (U-26) and only the two words that narrow it are
           drawn here, so an unclaimed item costs no width at all. */
        .q-route { flex-shrink:0; display:inline-flex; align-items:center; gap:4px; }
        .q-route-rest { font-size:10px; opacity:.75; }
        .q-routerow { display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin-top:6px; }
        .q-routerow select { font-size:11px; padding:2px 4px; max-width:150px; }
        .q-urg { flex-shrink:0; font-size:10px; }
        .q-urg.u-urgent { color:var(--vscode-charts-red,#f14c4c); font-weight:700; }
        .q-meta { margin-left:auto; flex-shrink:0; white-space:nowrap; }
        .q-badge { font-size:10px; border-radius:8px; padding:1px 7px; flex-shrink:0; border:1px solid var(--vscode-panel-border); }
        .q-badge.src { cursor:default; }
        .q-body { padding:2px 12px 12px 30px; border-top:1px solid var(--vscode-panel-border); }
        .q-fulltext { margin:6px 0; line-height:1.5; word-break:break-word; }
        .q-src { margin:4px 0; font-size:11px; opacity:.85; }
        .q-srctoggle { padding:0 6px; font-size:11px; margin-left:4px; }
        .q-srcfull { margin:2px 0 8px 2px; padding:4px 8px; border-left:2px solid var(--vscode-textBlockQuote-border, rgba(128,128,128,.5)); font-size:12px; }
        .q-srcsec { margin-top:6px; }
        .q-srcsec-h { font-weight:600; }
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
            body += categoryHtml({ id: 'user', icon: '🧑', title: t('Your captures'), items: userItems });
        }
        if (agentItems.length) {
            body += categoryHtml({
                id: 'agent', icon: '🤖', title: t('Agent-tracked delegations'), items: agentItems,
                collapsible: true, open: agentLaneOpen,
                sub: liveSummary(agentItems) || t('the manager\'s tracked work')
            });
        }
        if (!body) {
            body = '<p class="muted" style="margin-top:20px">📥 ' + t('The queue is empty. Drop small fixes/tasks here — they won\'t be lost until handled. Command: {cmd} or the ＋ above.', { cmd: '<code>Agent Farm: Add to Queue</code>' }) + '</p>';
        }
        const active = DATA.active || 0, blocked = DATA.blocked || 0;
        document.getElementById('app').innerHTML = `${STYLE}
            ${window.AFHeader.tabs('queue')}
            ${window.AFHeader.html({
                page: 'queue', title: esc(lab('📥 Work Queue')),
                sub: [t('{n} items · {active} active', { n: (DATA.items || []).length, active })].concat(blocked ? [t('{blocked} need you', { blocked })] : [],
                    [t('showing {n}', { n: items.length }), window.AFTime.clockUtc(DATA.generatedAt)]).join(' · '),
                controls: controls(items)
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
        // ‼️ The route starts EMPTY and is never seeded from the window (X-49).
        // A project is stamped from what you are looking at because that is a
        // fact about where you are; which engine should take a thing is not,
        // and a guess here would be indistinguishable from a choice.
        return { text: '', target: '', engine: '', model: '', effort: '', urgency: 'normal', project: DATA.activeProjectId || '' };
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
        bind('q-reset', 'click', () => { fTarget = DEF.fTarget; fEngine = DEF.fEngine; fAccount = DEF.fAccount; fAuthor = DEF.fAuthor; fProject = DEF.fProject; query = DEF.query; saveState(); render(); });

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
                // X-49 — the three route boxes. Read off the draft rather than
                // the DOM: the model and effort boxes are only DRAWN once an
                // engine is picked, so reading elements that may not exist
                // would silently drop what was chosen a moment earlier.
                if (text.trim()) {
                    vscode.postMessage({
                        type: 'add', text: text.trim(), target: target.trim(), urgency, project,
                        engine: addDraft.engine || '', model: addDraft.model || '', effort: addDraft.effort || ''
                    });
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

        /**
         * ‼️ X-49 — THE THREE ROUTE BOXES, ON BOTH SURFACES AT ONCE.
         *
         * The capture box and an open row draw the same control, so they are
         * wired once: `data-kind` says whether the answer goes into the draft
         * or straight onto an item. Both then REDRAW, because the boxes narrow
         * each other — picking an engine is what makes the model box exist, and
         * a model can take the effort beside it out of the vocabulary (X-30).
         * Narrowing happens here rather than only on the host, or the box would
         * show `low` while the item was saved with `medium`.
         */
        document.querySelectorAll('[data-route]').forEach(sel => sel.addEventListener('change', e => {
            e.stopPropagation();
            const axis = sel.dataset.route;
            const id = sel.dataset.item || '';
            const cur = sel.dataset.kind === 'row'
                ? ((DATA.items || []).find(x => x.id === id) || {})
                : addDraft;
            const want = {
                engine: axis === 'engine' ? sel.value : (cur.engine || ''),
                account: axis === 'account' ? sel.value : (cur.account || ''),
                model: axis === 'model' ? sel.value : (cur.model || ''),
                effort: axis === 'effort' ? sel.value : (cur.effort || '')
            };
            const fixed = window.AFEngine.narrow(DATA.launch || {}, want.engine, want.model, want.effort);
            /**
             * ‼️ X-254 (2/n) — THE ENGINE CUTS THE ACCOUNT TOO, and this is the
             * narrowing `AFEngine.narrow` cannot do because it knows nothing
             * about sign-ins.
             *
             * An account belongs to ONE engine. Moving the engine box while an
             * account of the old one is set would leave the row asking for a
             * sign-in the new engine cannot read — a setup that looks answered
             * and cannot be served. So it is dropped, and only then: switching
             * back is the user's to redo, and silently keeping it would be the
             * wrong half of the same choice. `@machine` is not an engine's
             * account at all and survives.
             */
            const keepsAccount = !want.account
                || want.account === window.AFAccount.MACHINE
                || engineAccounts(want.engine).some(a => a.id === want.account);
            const route = {
                engine: want.engine, account: keepsAccount ? want.account : '',
                model: fixed.model, effort: fixed.effort
            };
            if (sel.dataset.kind === 'row') {
                if (!id) { return; }
                vscode.postMessage(Object.assign({ type: 'setRoute', id }, route));
            } else {
                Object.assign(addDraft, route);
                render();
            }
        }));

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

        const shown = visible();
        window.AFBulk.wire({
            allId: 'q-selall', selected: selected, shown: () => shown.map(n => n.id), repaint: render,
            onRowDelete: id => {
                const n = (DATA.items || []).find(x => x.id === id);
                const handled = n && (n.status === 'done' || n.status === 'dropped');
                if (handled) { expanded.delete(id); }
                vscode.postMessage({ type: handled ? 'remove' : 'drop', id: id });
            },
            onBulk: (a, ids) => {
                if (a === 'bulkDelete') {
                    if (!ids.length) { return; }
                    selected.clear();
                    vscode.postMessage({ type: 'removeMany', ids: ids });
                } else if (a === 'clearHandled') {
                    vscode.postMessage({ type: 'clearHandled' });
                }
            }
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
        document.querySelectorAll('.q-src [data-act], .q-srcfull [data-act], .q-actions [data-act], .q-edit [data-act], .q-outcome [data-act], .q-answer [data-act], .q-routerow [data-act]').forEach(b => b.addEventListener('click', ev => {
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
            else if (act === 'srcfull') { if (srcOpen.has(id)) { srcOpen.delete(id); } else { srcOpen.add(id); } render(); }
            else if (act === 'srcreport') { vscode.postMessage({ type: 'openFile', kind: 'noticeReport', id }); }
            else if (act === 'urg') {
                const n = (DATA.items || []).find(x => x.id === id) || {};
                const next = n.urgency === 'normal' ? 'soon' : n.urgency === 'soon' ? 'urgent' : 'normal';
                vscode.postMessage({ type: 'setUrgency', id, urgency: next });
            }
            // X-49 — all three axes at once, because "unclaim it" is one
            // thought and clearing them one box at a time is three.
            else if (act === 'routeclear') { vscode.postMessage({ type: 'setRoute', id, engine: '', model: '', effort: '' }); }
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

    // ‼️ M-33 — A HOST PUSH WAITS FOR THE READER'S HANDS; THE PAGE'S OWN
    // RENDERS DO NOT. render() replaces the whole of #app, so a repaint that
    // arrives while somebody is typing detaches the box they are typing in and
    // the caret falls to <body> — where space IS Page Down. Full text, and
    // what a page-specific busy() is for: media/afRepaint.js.
    const repaint = window.AFRepaint.guard(render);
    window.addEventListener('message', ev => {
        if (ev.data.type === 'data') {
            DATA = ev.data.data;
            if (DATA.focusItem) { focusItem = DATA.focusItem; expanded.add(DATA.focusItem); }
            repaint();
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
