// Agent Farm — Notices page. Agent→user board. ONE line per notice on the
// root; click to expand into a rich body / independently-collapsible sections.
// Type + Level filters, search, user stars, sort, reset, row-pin, quick edit
// (+ diff), and Export MD (page + per-notice). Self-contained.
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    // X-456 — on a phone: what opens a report, an export dialog, a terminal, a browser or another
    // PC page is not drawn; a body link is copied to the phone's clipboard (AFCtx.copy) instead.
    const ON_PHONE_HOST = !!(window.__AFUI__ && window.__AFUI__.remote === true);
    const ON_THE_PC = 'That opens on the PC — open it from Agent Farm there.';
    let DATA = window.__DATA__;
    // U-189 — every word below is English and drawn through tr() / lab() (`t` is a local name here); the catalog part is media/afI18n.tr.notices.js.
    const tr = (s, v) => (window.AFI18n ? window.AFI18n.t(s, v) : s.replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? String(v[k]) : m)));
    const lab = s => (window.AFI18n ? window.AFI18n.label(s) : s);
    const loc = () => (window.AFI18n && window.AFI18n.locale()) || undefined;

    const st = (typeof vscode.getState === 'function' && vscode.getState()) || {};
    // Type / level / agent / status are multi-pick: null = all (no filter),
    // an array = exactly that subset, [] = none. See media/afFilters.js.
    const DEF = { fMode: 'all', fType: null, fLevel: null, fAgent: null, fStatus: null, fProject: null, fAccount: null, sortKey: 'newest', query: '', singleMode: false };
    const pick = v => (Array.isArray(v) ? v : null);
    /**
     * X-257 — the bucket a row about NO sign-in answers to, so an account
     * filter never makes those rows vanish with nothing on screen saying
     * they exist. Same shape of answer as the project one.
     */
    const NO_ACCOUNT = '(none)';
    let fMode = st.fMode || DEF.fMode;
    let fType = pick(st.fType);
    let fLevel = pick(st.fLevel);
    let fAgent = pick(st.fAgent);
    let fStatus = pick(st.fStatus);   // open | answered | declined (questions)
    // Which projects to list. Picked by ID rather than by name so a rename does
    // not silently empty the filter — the picker prints the name.
    let fProject = pick(st.fProject);
    // X-257 — which sign-ins the board is narrowed to (slot ids, or NO_ACCOUNT).
    let fAccount = pick(st.fAccount);
    let sortKey = st.sortKey || DEF.sortKey;
    let query = st.query || DEF.query;
    let singleMode = st.singleMode !== undefined ? !!st.singleMode : DEF.singleMode;
    const expanded = new Set();     // open notice ids
    const openSec = new Set();      // "id#idx" open sections
    const selected = new Set();     // checked notice ids (bulk actions)
    // Unread view only: ids that were auto-read by opening them to read, but
    // must STAY visible so a row can't slip away the instant it's opened. They
    // fade to a "just read" look and drop out on the next deliberate view change.
    const stickyRead = new Set();
    const drafts = {};              // id -> answer draft
    const editing = new Set();      // ids in edit mode
    const editDrafts = {};          // id -> {title,type,level,tags,body,sections:[{title,body}]}
    const showOrig = new Set();     // ids showing the pre-edit original
    const converting = new Set();   // ids showing the "add to queue" inline box
    const convertDrafts = {};       // id -> text the user is writing for the queue
    const convertDelete = {};       // id -> bool: delete the notice on send (default true)
    let docMenu = null;             // open "open with" split menu key (a notice id)
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
    /** U-130 — what the number DOES, which "L2 · Medium" cannot say. */
    const LEVEL_WHY = {
        1: 'Arrives quietly. Read it when you get to it.',
        2: 'The ordinary level: worth reading today, nothing stops for it.',
        3: 'Something happened you would want to know about now.',
        4: 'The loudest there is. Reserve it, or it stops meaning anything.'
    };
    const SORTS = [
        ['newest', 'Newest first'], ['oldest', 'Oldest first'],
        ['level', 'Importance'], ['stars', 'My stars'],
        ['type', 'Type'], ['agent', 'Agent']
    ];

    function saveState() { if (vscode.setState) { vscode.setState({ fMode, fType, fLevel, fAgent, fStatus, fProject, fAccount, sortKey, query, singleMode }); } }
    /** The project a notice is filed under, out of the list the host shipped.
     *  Undefined for an unfiled one AND for a stamp whose project is gone —
     *  both draw the same "—", because both mean "this row names no project
     *  you can open". */
    function projOf(n) { return window.AFProject.find(DATA.projects, n.projectId); }
    function esc(s) { return C.esc(String(s == null ? '' : s)); }
    function tmeta(t) { return TYPES[t] || TYPES.update; }
    function lvl(n) { return n.level >= 1 && n.level <= 4 ? n.level : 1; }
    function reportBase(p) { return String(p || '').split(/[\\/]/).pop(); }

    // "Open with" modes for the linked report .md (Feature B): main click uses
    // the user's default (DATA.docOpen.mode), the caret ▾ offers the rest.
    const DOC_MODES = [
        ['vscode', '📄 VS Code (raw)'],
        ['preview', '👁 Markdown preview'],
        ['obsidian', '🟣 Obsidian'],
        ['custom', '🖥 Custom app']
    ];
    function docDefault() { return (DATA.docOpen && DATA.docOpen.mode) || 'vscode'; }
    // Split button for the report link: main opens with the default mode; the
    // caret reveals per-click modes + a Configure item. `id` is the notice id.
    function docSplit(id, label, path) {
        const def = docDefault();
        const menu = docMenu === id ? `<div class="nt-docmenu">
            ${DOC_MODES.map(([m, l]) => `<button class="nt-docopt${m === def ? ' cur' : ''}" data-doc="open" data-id="${esc(id)}" data-mode="${m}">${esc(lab(l))}${m === def ? ` <span class="muted small">${esc(tr('· default'))}</span>` : ''}</button>`).join('')}
            <button class="nt-docopt cfg" data-doc="cfg" data-id="${esc(id)}">${esc(lab('⚙ Configure default & custom app…'))}</button>
          </div>` : '';
        return `<span class="nt-split">
            <button class="nt-docmain" data-doc="main" data-id="${esc(id)}" title="${esc(path)}">${label}</button>
            <button class="nt-doccaret" data-doc="caret" data-id="${esc(id)}" title="${esc(tr('Open with…'))}" aria-expanded="${docMenu === id ? 'true' : 'false'}">▾</button>
            ${menu}</span>`;
    }

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
        if (k(d) === k(n)) { return tr('Today'); }
        if (k(d) === k(y)) { return tr('Yesterday'); }
        return d.toLocaleDateString(loc(), { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
    }
    function timeLabel(ts) { return new Date(ts).toLocaleString(loc(), { hour: '2-digit', minute: '2-digit' }); }

    function haystack(n) {
        return [n.title, n.body || '', (n.sections || []).map(s => s.title + ' ' + s.body).join(' '),
            (n.tags || []).join(' '), n.agentName].join(' ');
    }
    function matchesQuery(n) {
        const q = query.trim();
        if (!q) { return true; }
        // `#tag` stays its own thing — it is a SCOPE ("only the tags"), not a
        // term, and folding it into the grammar would make `#bug` mean "the
        // characters #bug anywhere", which is not what anybody typing it means.
        if (q[0] === '#') {
            const t = window.AFQuery.compile(q.slice(1));
            return (n.tags || []).some(x => t.test(x));
        }
        // everything else is a QUERY, not a substring — media/afQuery.js
        return window.AFQuery.compile(q).test(haystack(n));
    }

    /** null = no filter; otherwise the value must be in the picked set. */
    const inSet = (sel, v) => !sel || sel.indexOf(String(v)) >= 0;

    function visible() {
        let list = (DATA.notices || []).filter(n =>
            (fMode !== 'unread' || !n.read || stickyRead.has(n.id)) &&
            (fMode !== 'questions' || n.type === 'question') &&
            inSet(fType, n.type) &&
            inSet(fLevel, lvl(n)) &&
            inSet(fAgent, n.agentName) &&
            (!fStatus || (n.type === 'question' && fStatus.indexOf(n.status || 'open') >= 0)) &&
            // An unfiled notice answers to the explicit "(none)" bucket, so a
            // project filter never makes rows disappear without a name for
            // where they went.
            inSet(fProject, n.projectId || window.AFProject.NONE) &&
            inSet(fAccount, n.account || NO_ACCOUNT) &&
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
        for (let i = 1; i <= 3; i++) { out += `<span class="nt-star ${i <= s ? 'on' : ''}" data-star="${i}" title="${esc(tr('{n} star(s)', { n: i }))}">${i <= s ? '★' : '☆'}</span>`; }
        return out + '</span>';
    }
    function statusBadge(n) {
        if (n.type !== 'question') { return ''; }
        const s = n.status || 'open';
        if (s === 'answered') { return `<span class="nt-badge ok">✓ ${esc(tr('answered'))}</span>`; }
        if (s === 'declined') { return `<span class="nt-badge muted">✕ ${esc(tr('declined'))}</span>`; }
        return `<span class="nt-badge warn">${esc(tr('waiting…'))}</span>`;
    }

    function questionBlock(n) {
        if (n.type !== 'question') { return ''; }
        const s = n.status || 'open';
        if (s === 'answered') { return `<div class="nt-answer"><div class="muted small">${esc(tr('Your answer'))}${n.answeredAt ? ' · ' + esc(window.AFTime.full(n.answeredAt)) : ''}:</div><div class="nt-md">${mdToHtml(n.answer || '')}</div></div>`; }
        if (s === 'declined') { return `<div class="muted small nt-answer">✕ ${esc(tr('You dismissed this question without answering. The agent will see it was passed over.'))}</div>`; }
        const draft = drafts[n.id] != null ? drafts[n.id] : '';
        const del = convertDelete[n.id] !== undefined ? convertDelete[n.id] : true;
        // Answering a question IS leaving a new task → the answer auto-becomes a
        // queue item; the notice is deleted by default (uncheck to keep it).
        return `<div class="nt-qbox"><textarea class="nt-atext" data-id="${esc(n.id)}" rows="3" placeholder="${esc(tr('Type your answer — it\'s auto-added to the work queue as a task…'))}">${esc(draft)}</textarea>
            <label class="nt-del"><input type="checkbox" class="nt-delcb" data-id="${esc(n.id)}" ${del ? 'checked' : ''}> ${esc(tr('delete this message on send'))}</label>
            <div class="btnrow"><button data-act="answer" data-id="${esc(n.id)}">${esc(tr('Send answer → queue'))}</button>
            <button class="secondary" data-act="decline" data-id="${esc(n.id)}">${esc(tr('Dismiss (no answer)'))}</button></div></div>`;
    }

    // Queue items this notice spawned (the bi-directional link) — shown inside
    // the notice so "what did I turn this into, what did I write" stays visible.
    function spawnedHtml(n) {
        if (!n.spawnedItems || !n.spawnedItems.length) { return ''; }
        const rows = n.spawnedItems.map(s => ON_PHONE_HOST ? `<li>📥 ${esc(s.text || tr('(item)'))}</li>` :
            `<li><a href="#" class="nt-openitem" data-id="${esc(s.itemId)}" title="${esc(tr('Go to the queue item'))}">📥 ${esc(s.text || tr('(item)'))}</a></li>`).join('');
        return `<div class="nt-spawned"><div class="muted small">🔁 ${esc(tr('Queue items spawned from this message:'))}</div><ul>${rows}</ul></div>`;
    }

    // The "Add to queue" inline box (low-friction convert; default-delete).
    function convertHtml(n) {
        if (!converting.has(n.id)) { return ''; }
        const draft = convertDrafts[n.id] != null ? convertDrafts[n.id] : '';
        const del = convertDelete[n.id] !== undefined ? convertDelete[n.id] : true;
        return `<div class="nt-convert"><textarea class="nt-ctext" data-id="${esc(n.id)}" rows="2" placeholder="${esc(tr('What should go to the queue? (your reply / elaboration)'))}">${esc(draft)}</textarea>
            <label class="nt-del"><input type="checkbox" class="nt-cdelcb" data-id="${esc(n.id)}" ${del ? 'checked' : ''}> ${esc(tr('delete this message on send'))}</label>
            <div class="btnrow"><button data-act="convertsend" data-id="${esc(n.id)}">📥 ${esc(tr('Send to queue'))}</button>
            <button class="secondary" data-act="convertcancel" data-id="${esc(n.id)}">${esc(tr('Cancel'))}</button></div></div>`;
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
        let h = `<div class="nt-orig"><div class="muted small">${esc(tr('Original (before edits)'))} — ${esc(TYPES[o.type] ? tr(TYPES[o.type].label) : o.type)} · L${o.level}${(o.tags || []).length ? ' · ' + o.tags.map(t => '#' + esc(t)).join(' ') : ''}</div>`;
        h += `<div class="nt-md"><strong>${esc(o.title)}</strong></div>`;
        if (o.body) { h += `<div class="nt-md">${mdToHtml(o.body)}</div>`; }
        for (const s of (o.sections || [])) { h += `<div class="nt-md"><em>${esc(s.title)}</em><br>${mdToHtml(s.body || '')}</div>`; }
        return h + '</div>';
    }

    function editForm(n) {
        const d = editDrafts[n.id];
        const typeOpts = Object.keys(TYPES).map(k => C.option(k, TYPES[k].icon + ' ' + tr(TYPES[k].label), {
            selected: d.type === k, detail: TYPES[k].desc || TYPES[k].why || ''
        })).join('');
        // U-130 — L1…L4 is a SHORTHAND and the box cuts even that. What the
        // number actually changes is how loudly the notice arrives.
        const lvlOpts = [1, 2, 3, 4].map(k => C.option(String(k), 'L' + k + ' · ' + tr(LEVELS[k]), {
            selected: Number(d.level) === k, detail: tr(LEVEL_WHY[k])
        })).join('');
        const secs = (d.sections || []).map((s, i) => `<div class="nt-esec">
            <input class="nt-ef" data-ef="sectitle" data-i="${i}" value="${esc(s.title)}" placeholder="${esc(tr('Section title'))}">
            <textarea class="nt-ef" data-ef="secbody" data-i="${i}" rows="3" placeholder="${esc(tr('Section body'))}">${esc(s.body)}</textarea></div>`).join('');
        return `<div class="nt-edit">
            <label>${esc(tr('Title'))}</label><input class="nt-ef" data-ef="title" value="${esc(d.title)}">
            <div class="nt-erow"><span><label>${esc(tr('Type'))}</label><select class="nt-ef" data-ef="type">${typeOpts}</select></span>
              <span><label>${esc(tr('Level'))}</label><select class="nt-ef" data-ef="level">${lvlOpts}</select></span></div>
            <label>${esc(tr('Tags (comma-separated)'))}</label><input class="nt-ef" data-ef="tags" value="${esc(d.tags)}">
            <label>${esc(tr('Body (markdown)'))}</label><textarea class="nt-ef" data-ef="body" rows="4">${esc(d.body)}</textarea>
            ${secs ? `<label>${esc(tr('Sections'))}</label>` + secs : ''}
            <div class="btnrow"><button data-act="editsave" data-id="${esc(n.id)}">${esc(tr('Save'))}</button>
              <button class="secondary" data-act="editcancel" data-id="${esc(n.id)}">${esc(tr('Cancel'))}</button></div>
        </div>`;
    }

    /**
     * What a notice IS, for the right-click menu.
     *
     * ‼️ THE POINT OF THE MENU HERE. Every action a notice had lived inside its
     * expanded body — and opening a notice MARKS IT READ. So triaging the list
     * (pin this, star that, hand this one over, dismiss the rest) could not be
     * done without changing the unread state of everything you touched. From
     * the menu none of it opens anything.
     *
     * The body is not carried: a notice runs to paragraphs and this attribute is
     * written on every row. The handler looks it up in the data it already holds.
     */
    function noticeCtx(n, open) {
        return window.AFCtx.row('afNoticeRow', {
            notice: n.id, afOpen: !!open, afRead: !!n.read, afPinned: !!n.pinned,
            afQuestion: n.type === 'question', afStatus: n.status || 'open',
            afReport: !!n.reportPath, afEdited: !!n.edited,
            ntType: n.type || 'update', ntAgent: n.agentName || '', ntLevel: lvl(n)
        });
    }

    function noticeCard(n) {
        const t = tmeta(n.type), open = expanded.has(n.id), L = lvl(n), isQ = n.type === 'question';
        const inEdit = editing.has(n.id);
        const tags = (n.tags || []).map(x => `<span class="tag">#${esc(x)}</span>`).join(' ');
        const due = n.dueAt ? `<div class="muted small">⏰ ${esc(tr('due {when}', { when: window.AFTime.full(n.dueAt) }))}</div>` : '';
        let body = '';
        if (inEdit) { body = editForm(n); }
        else {
            const reportBtn = !n.reportPath ? '' : ON_PHONE_HOST ? `<div class="nt-report">
                    <span class="muted small nt-reppath" title="${esc(n.reportPath)}">📄 ${esc(reportBase(n.reportPath))}</span>
                    <span class="muted small">· ${esc(tr('open it on the PC'))}</span>
                </div>` : `<div class="nt-report">
                    ${docSplit(n.id, esc(lab('📄 Open full report')), n.reportPath)}${window.AFRead.textBtn('report:' + n.id)}
                    <span class="muted small nt-reppath" title="${esc(n.reportPath)}">${esc(reportBase(n.reportPath))}</span>
                </div>`;
            body = `<div class="muted small nt-sub">${esc(tr(t.label))} · L${L} ${esc(tr(LEVELS[L]))}${n.edited ? ' · ✎ ' + esc(tr('edited')) + (n.editedAt ? ' ' + esc(window.AFTime.full(n.editedAt).toLocaleString()) : '') : ''}</div>
                ${due}
                ${n.body ? `<div class="nt-md">${mdToHtml(n.body)}</div>` : (!n.sections && !isQ ? `<div class="muted small">${esc(tr('(no details)'))}</div>` : '')}
                ${sectionsHtml(n)}${reportBtn}${questionBlock(n)}${spawnedHtml(n)}${convertHtml(n)}${originalBlock(n)}${projectPicker(n)}
                <div class="btnrow nt-actions">
                    ${window.AFRead.textBtn('notice:' + n.id)}
                    ${ON_PHONE_HOST ? '' : `<button data-act="handoffNotice" data-id="${esc(n.id)}" title="${esc(tr('Open the responsible agent and type this message into its terminal (not sent)'))}">🔗 ${esc(tr('Hand to agent'))}</button>`}
                    ${!isQ ? `<button data-act="convert" data-id="${esc(n.id)}" title="${esc(tr('Turn this message into a queue item'))}">📥 ${esc(tr('Add to queue'))}</button>` : ''}
                    <button class="secondary" data-act="read" data-id="${esc(n.id)}" data-read="${n.read ? '0' : '1'}">${esc(tr(n.read ? 'Mark unread' : 'Mark read'))}</button>
                    <button class="secondary" data-act="edit" data-id="${esc(n.id)}">${esc(tr('Edit'))}</button>
                    ${n.edited ? `<button class="secondary" data-act="orig" data-id="${esc(n.id)}">${esc(tr(showOrig.has(n.id) ? 'Hide original' : 'Show original'))}</button>` : ''}
                    ${ON_PHONE_HOST ? '' : `<button class="secondary" data-act="exportone" data-id="${esc(n.id)}">${esc(tr('Export MD'))}</button>`}
                    <button class="secondary" data-act="dismiss" data-id="${esc(n.id)}">${esc(tr(isQ ? 'Delete' : 'Dismiss'))}</button>
                </div>`;
        }
        return `<div class="nt-card lvl-${L} ${n.read ? 'read' : 'unread'} ${n.pinned ? 'pinned' : ''} ${selected.has(n.id) ? 'sel' : ''}" data-id="${esc(n.id)}">
            <div class="nt-row" data-toggle="${esc(n.id)}" ${noticeCtx(n, open)}
                title="${esc(window.AFCtx.hint(tr('Click to open it — opening marks it read')))}">
                <input type="checkbox" class="nt-cb" data-cb="${esc(n.id)}" ${selected.has(n.id) ? 'checked' : ''} title="${esc(tr('Select for bulk actions'))}">
                <span class="nt-caret">${open ? '▾' : '▸'}</span>
                <span class="nt-ico" title="${esc(tr(t.label))}">${t.icon}</span>
                <span class="nt-title" title="${esc(n.title)}">${esc(n.title)}</span>
                <span class="nt-lb lb-${L}" title="${esc(tr('Level {n} · {name}', { n: L, name: tr(LEVELS[L]) }))}">L${L}</span>
                ${n.reportPath ? `<span class="nt-badge rep" title="${esc(tr('Full report attached — click to open inside'))}">📄</span>` : ''}
                ${statusBadge(n)}${n.edited ? '<span class="nt-badge muted">✎</span>' : ''}
                ${tags ? `<span class="nt-tags">${tags}</span>` : ''}
                ${projectChip(n)}${accountChip(n)}
                ${starsHtml(n)}
                <span class="nt-pin ${n.pinned ? 'on' : ''}" data-pinrow="${esc(n.id)}" data-pin="${n.pinned ? '0' : '1'}" title="${esc(tr(n.pinned ? 'Unpin' : 'Pin'))}">📌</span>
                <span class="nt-meta muted small">${esc(n.agentName)} · ${esc(timeLabel(n.ts))}${n.read ? '' : ' <span class="nt-udot">●</span>'}</span>
                <button class="secondary nt-x" data-row-dismiss="${esc(n.id)}"
                    aria-label="${esc(tr('Delete this notice'))}" title="${esc(tr('Delete this notice'))}">✕</button>
            </div>
            <div class="nt-body" ${open ? '' : 'hidden'}>${body}</div>
        </div>`;
    }

    /**
     * The project mark on a row — the shared one (media/afProject.js), so a
     * notice's project looks exactly like the same project on the sessions
     * table, the queue and the sidebar.
     *
     * Drawn only when the notice HAS one: an em dash in front of every unfiled
     * row would take the width the title needs and say nothing. Filing happens
     * in the open body, where there is room for a picker with names in it.
     * Clicking the mark opens that project — the row already knows which.
     */
    function projectChip(n) {
        const p = projOf(n);
        if (!p) { return ''; }
        const t = window.AFProject.tip(p);
        return window.AFTip.wrap(
            `<span class="nt-proj" data-openproj="${esc(p.id)}" role="button" tabindex="0">`
            + window.AFProject.badge(p) + '</span>', t.head, t.body);
    }

    /**
     * ‼️ X-257 — WHICH SIGN-IN THE ROW IS ABOUT.
     *
     * Drawn only when the notice HAS one, for the same reason the project
     * mark is: a placeholder on every row costs the width the title needs
     * and says nothing. SHORTHAND — the row carries the slot's short form
     * and the panel the whole name, because five slots of one engine differ
     * in their last word and a row is the wrong place to read them.
     */
    function accountChip(n) {
        const id = String(n.account || '').trim();
        if (!id) { return ''; }
        // engine-prefixed ids (claude-…) read as their tail on a narrow row
        const short = id.replace(/^[a-z]+-/, '');
        return window.AFTip.wrap(
            '<span class="nt-acct">🔑 ' + esc(short) + '</span>',
            id,
            tr('This message is about that sign-in. It is stamped as DATA rather than '
            + 'written into the sentence, so the board can be narrowed to one account '
            + 'and two failures of the same one read as one story — the Accounts filter.'));
    }

    /** The "file it under…" picker, in the open body. A select rather than a
     *  chip row because the list is as long as the user's project list, and the
     *  empty option is what takes a stamp back OFF. */
    function projectPicker(n) {
        const cur = n.projectId || '';
        return `<div class="nt-projrow">
            <label class="muted small" for="nt-pj-${esc(n.id)}">${esc(tr('Project'))}</label>
            <select class="nt-pjsel" id="nt-pj-${esc(n.id)}" data-id="${esc(n.id)}"
                title="${esc(tr('Which project this message is about. It shows on that project\'s Work tab and timeline; the empty option takes the stamp off again.'))}">
                ${window.AFProject.options(DATA.projects, cur, { anyLabel: tr('— none') })}
            </select>
            ${cur && projOf(n) && !ON_PHONE_HOST ? `<button class="secondary" data-act="openproj" data-project="${esc(cur)}" title="${esc(tr('Open this project\'s page'))}">${esc(lab('◧ Open'))}</button>` : ''}
            ${cur && !projOf(n) ? `<span class="muted small" title="${esc(tr('The project this was filed under no longer exists — pick another, or clear it'))}">${esc(lab('⚠ project gone'))}</span>` : ''}
        </div>`;
    }

    function chip(id, label, on) { return `<button class="af-chip ${on ? 'on' : 'secondary'}" data-chip="${id}">${esc(label)}</button>`; }

    // The four multi-pick filters, described once so the markup and the wiring
    // can never drift apart.
    function filterPickers() {
        return [
            { id: 'nt-type', label: tr('Type'), get: () => fType, set: v => { fType = v; },
                title: tr('Which notice types to list — tick any combination'),
                options: Object.keys(TYPES).map(k => ({ v: k, t: TYPES[k].icon + ' ' + tr(TYPES[k].label) })) },
            // U-52 — the subset a level axis is really for. Four levels, and the
            // question people actually bring to this page is "what matters",
            // which cost a Clear plus two ticks.
            { id: 'nt-level', label: tr('Level'), get: () => fLevel, set: v => { fLevel = v; },
                title: tr('Which importance levels to list — tick any combination'),
                presets: [{
                    id: 'urgent', label: tr('Urgent'), values: ['4', '3'],
                    title: tr('The top two — {a} and {b}.', { a: tr(LEVELS[4]), b: tr(LEVELS[3]) })
                }],
                options: [4, 3, 2, 1].map(k => ({ v: String(k), t: 'L' + k + ' · ' + tr(LEVELS[k]) })) },
            { id: 'nt-agent', label: tr('Agents'), get: () => fAgent, set: v => { fAgent = v; },
                title: tr('Which agents\' notices to list — tick any combination'),
                options: (DATA.agents || []).slice() },
            // U-52 — "Waiting" is one option, so a click on its name already
            // gives you it; its opposite is TWO and had no name.
            { id: 'nt-status', label: tr('Status'), get: () => fStatus, set: v => { fStatus = v; },
                title: tr('Question status — tick any combination'),
                presets: [{
                    id: 'settled', label: tr('Settled'), values: ['answered', 'declined'],
                    title: tr('Everything you have dealt with — answered and declined, nothing still waiting on you.')
                }],
                options: [{ v: 'open', t: lab('❓ Waiting') }, { v: 'answered', t: lab('✓ Answered') }, { v: 'declined', t: lab('✕ Declined') }] },
            // ‼️ "No project" is an OPTION, not the absence of one. Without it a
            // project filter would make the unfiled notices vanish with nothing
            // on screen saying they exist — which is exactly the group somebody
            // filtering by project is about to want to file.
            { id: 'nt-project', label: tr('Projects'), get: () => fProject, set: v => { fProject = v; },
                title: tr('Which project\'s notices to list — manage them on the ◧ Projects page'),
                options: [{ v: window.AFProject.NONE, t: tr('— No project') }].concat(
                    (DATA.projects || []).map(p => ({ v: p.id, t: (p.icon ? p.icon + ' ' : '') + p.name }))) },
            // ‼️ X-257 — the sign-ins that are actually ON the board, derived
            // from the rows rather than shipped by the host: a slot nothing has
            // ever been said about is not a filter anybody can want, and a stamp
            // naming a slot that has since been removed must stay reachable —
            // otherwise its rows become the ones nobody can filter to.
            { id: 'nt-account', label: tr('Accounts'), get: () => fAccount, set: v => { fAccount = v; },
                title: tr('Which sign-in the notices are about — the accounts named on this board'),
                options: [{ v: NO_ACCOUNT, t: tr('— No account') }].concat(
                    Array.from(new Set((DATA.notices || []).map(n => n.account).filter(Boolean)))
                        .sort().map(a => ({ v: a, t: '🔑 ' + a }))) }
        ];
    }

    function controls() {
        const total = (DATA.notices || []).length, unread = DATA.unread || 0, q = DATA.openQuestions || 0;
        const sortOpts = SORTS.map(([k, l]) => C.option(k, tr('Sort: {how}', { how: tr(l) }), { selected: sortKey === k })).join('');
        return `<div class="nt-controls afms-fit">
            <input id="nt-search" type="search" placeholder="${esc(lab('🔍 search (text or #tag)'))}" value="${esc(query)}"
                title="${esc(window.AFQuery.tip(tr('Searched against the title, the body, every section, the tags and the agent. A query that STARTS with # searches the tags only.')))}">
            ${chip('all', tr('All ({n})', { n: total }), fMode === 'all')}
            ${chip('unread', tr('Unread ({n})', { n: unread }), fMode === 'unread')}
            ${chip('questions', `❓ (${q})`, fMode === 'questions')}
            ${filterPickers().map(p => window.AFFilter.multi({
                id: p.id, label: p.label, options: p.options, selected: p.get(), title: p.title,
                presets: p.presets
            })).join('')}
            <select id="nt-sort">${sortOpts}</select>
            <button class="secondary" id="nt-reset" title="${esc(tr('Reset filters, search and sort'))}">${esc(lab('↺ Reset'))}</button>
        </div>`;
    }
    function actionsHtml() {
        const undo = DATA.undoable || 0;
        return `<span class="nt-break"></span><span class="nt-acts">
            <span class="nt-grp nt-bulk">
                <label class="nt-selall" title="${esc(tr('Select / deselect all shown'))}"><input type="checkbox" id="nt-selall"> ${esc(tr('all'))}</label>
                <button data-hact="bulkRead" title="${esc(tr('Mark selected read (or all shown if none selected)'))}">✓ ${esc(tr('Read'))}</button>
                <button class="secondary" data-hact="bulkUnread" title="${esc(tr('Mark selected unread (or all shown)'))}">○ ${esc(tr('Unread'))}</button>
                <button class="secondary danger" data-hact="bulkDelete" title="${esc(tr('Delete selected (or all shown if none selected)'))}"><span class="nt-trashic">🗑</span> ${esc(tr('Delete'))}</button>
            </span>
            <span class="nt-grp">
                <button class="secondary" data-hact="clearRead" title="${esc(tr('Delete read notices — pinned, starred and unhandled questions are kept'))}"><span class="nt-cleardot">●</span> ${esc(tr('Clear read'))}</button>
            </span>
            <span class="nt-grp">
                <button class="secondary" data-hact="expandAll" title="${esc(tr('Open every shown notice'))}">⊕ ${esc(tr('Expand all'))}</button>
                <button class="secondary" data-hact="collapseAll" title="${esc(tr('Close all'))}">⊖ ${esc(tr('Collapse all'))}</button>
                <button class="secondary ${singleMode ? 'on' : ''}" data-hact="single" aria-pressed="${singleMode}" title="${esc(tr('Only one notice open at a time: opening one folds the previous'))}${singleMode ? ' — ' + esc(tr('currently ON')) : ''}">${singleMode ? '◉' : '◯'} ${esc(tr('Single-open'))}</button>
            </span>
            <span class="nt-grp">
                <button class="secondary" data-hact="needs" title="${esc(tr('Open the Needs You page'))}">🙋 ${esc(tr('Needs You'))}</button>
                ${fileUnderHtml()}
                ${ON_PHONE_HOST ? '' : `<button data-hact="export">⬇ ${esc(tr('Export MD'))}</button>`}
                <button class="secondary nt-undo" data-hact="undo" ${undo ? '' : 'disabled'} title="${esc(undo ? tr('Restore the {n} notice(s) just deleted', { n: undo }) : tr('Nothing to undo'))}">↶ ${esc(tr('Undo'))}</button>
            </span></span>`;
    }

    /**
     * ‼️ WHAT "File under…" IS, SAID ONCE AND PROPERLY (X-28).
     *
     * It is the bulk half of the project stamp. A notice carries a `projectId`
     * (Faz 5), and that one field is what puts it on a project's Work tab, in
     * its timeline and behind its filters — a notice with no stamp belongs to
     * nothing and is only ever found on this page. Every notice can be filed
     * one at a time from its own row; this box files EVERY TICKED one at once,
     * or everything currently shown when nothing is ticked, which is the same
     * "selected, else shown" contract the ✓ Read and 🗑 Delete buttons beside
     * it already use. `— take out of any project` is the same gesture in
     * reverse, and it is the only way to unfile in bulk.
     *
     * ‼️ AND IT IS A FIXED WIDTH, WHICH IS NOT A TIDY-UP. A `<select>` sizes
     * itself to its WIDEST OPTION, so this control grew with the length of the
     * user's longest project name — one long name and a picker sitting among
     * buttons was three buttons wide. It is capped at two buttons, drawn at the
     * buttons' own 12px, and what no longer fits is in the hover panel rather
     * than in the layout.
     */
    function fileUnderHtml() {
        const projects = DATA.projects || [];
        const trigger = `<select id="nt-bulkproj" class="nt-fileunder">
                ${C.option('', tr('File under…'), { selected: true, detail: tr('Nothing chosen yet — picking a project files every selected notice under it.') })}
                ${C.option('__clear__', tr('— take out of any project'), { detail: tr('Unfiles the selected notices. They are not deleted; they simply name no project.') })}
                ${projects.map(p => C.option(p.id, (p.icon ? p.icon + ' ' : '') + p.name, { detail: p.summary || '' })).join('')}
            </select>`;
        return window.AFTip.wrap(trigger,
            tr(projects.length === 1 ? 'File under · {n} project' : 'File under · {n} projects', { n: projects.length }),
            [
                tr('Stamps the ticked notices with a project — or everything shown, when nothing is ticked.'),
                tr('The stamp is what puts a notice on that project\'s Work tab, in its timeline and behind its filters.'),
                tr('"— take out of any project" is the same move in reverse: it lifts the stamp off.'),
                window.AFTip.GAP,
                projects.length
                    ? tr('Projects: {list}', { list: projects.map(p => (p.icon ? p.icon + ' ' : '') + p.name).join(' · ') })
                    : tr('No projects declared yet — make one on the ◧ Projects page.')
            ].join('\n'));
    }

    const STYLE = `<style>
        .nt-controls { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
        .nt-controls select, .nt-controls input { padding:3px 6px; }
        /* U-244 — the search and the sort give ground with the pickers (common.css .afms-fit) */
        #nt-search { flex:1 1 120px; min-width:120px; max-width:180px; }
        html:not(.af-phone) #nt-sort { flex:1 1 90px; min-width:90px; max-width:max-content; }
        .af-chip { padding:3px 10px; border-radius:12px; }
        .af-chip.on { background:var(--vscode-button-background); color:var(--vscode-button-foreground); box-shadow:var(--af-hc-pick, none); }
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
        .nt-card.sel { background:color-mix(in srgb, var(--vscode-button-background) 12%, transparent); box-shadow:var(--af-hc-pick, none); }
        .nt-cb { flex-shrink:0; margin:0; cursor:pointer; }
        .nt-grp { display:inline-flex; gap:6px; align-items:center; padding-right:8px; margin-right:2px; border-right:1px solid var(--vscode-panel-border); }
        .nt-grp:last-child { border-right:none; }
        .nt-bulk .nt-selall { display:inline-flex; gap:3px; align-items:center; font-size:11px; opacity:.85; cursor:pointer; }
        /* ‼️ X-28 — A SELECT AMONG BUTTONS IS SIZED BY ITS WIDEST OPTION, WHICH
           IS THE USER'S LONGEST PROJECT NAME. So it grew past three buttons for
           a control that does one thing, and it grew AGAIN every time a project
           with a longer name was declared. Capped at two buttons and drawn at
           the buttons' own 12px; what does not fit is in the rich hover beside
           it (fileUnderHtml), never in the row's width.

           169px is not a round number: it is the MEASURED width of the two
           buttons it now sits between plus the gap they already have
           (🙋 Needs You 86 + 6 + ⬇ Export MD 77 — test/measure_page.js). */
        .nt-fileunder { width:169px; max-width:169px; font-size:12px; padding:4px 6px;
            text-overflow:ellipsis; }
        /* Forces the action-button row to start fresh under the search/filter
           controls row, instead of fighting them for space on one flex line —
           that fight is what was stranding "all…Delete" up with the filters
           while Clear read/Export MD wrapped to a line of their own below. */
        .nt-break { flex-basis:100%; height:0; }
        .nt-acts { display:contents; }
        /* X-456 on a phone the board is the page: the filters and the board actions are one line each,
           scrolled sideways, and a row's title takes its own line with the marks under it. */
        html.af-phone .nt-controls, html.af-phone .nt-acts { display:flex; flex:0 0 100%; max-width:100%; flex-wrap:nowrap;
            gap:6px; align-items:center; overflow-x:auto; overscroll-behavior-x:contain; scrollbar-width:none; }
        html.af-phone .nt-controls > *, html.af-phone .nt-acts > * { flex:0 0 auto; }
        html.af-phone #nt-search { flex:0 0 160px; width:160px; min-width:0; }
        html.af-phone .nt-row { flex-wrap:wrap; row-gap:4px; }
        html.af-phone .nt-title { flex:1 1 calc(100% - 80px); white-space:normal; }
        html.af-phone .nt-body { padding-left:12px; }
        button.danger:hover { background:var(--vscode-inputValidation-errorBackground, #5a1d1d); border-color:var(--vscode-editorError-foreground, #e51400); }
        .nt-trashic { color:var(--af-ink-editorError-foreground, var(--vscode-editorError-foreground, #e51400)); }
        /* Small, deliberately subdued mark riding in front of "Clear read" —
           reddish like the trash icon so both read as "this deletes things",
           but muted so it doesn't compete with the trash icon's alarm. */
        .nt-cleardot { color:var(--af-ink-editorError-foreground, var(--vscode-editorError-foreground, #e51400)); opacity:.55; font-size:8px; vertical-align:1px; }
        .nt-undo { color:var(--af-ink-charts-yellow, var(--vscode-charts-yellow, #e2c08d)); }
        .nt-row { display:flex; gap:8px; align-items:center; padding:8px 10px; cursor:pointer; }
        .nt-row:hover { background:var(--vscode-list-hoverBackground); }
        .nt-caret { width:12px; opacity:.7; flex-shrink:0; }
        .nt-ico { flex-shrink:0; }
        .nt-title { flex:0 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:600; }
        .nt-lb { font-size:9px; font-weight:700; border-radius:3px; padding:1px 4px; flex-shrink:0; border:1px solid var(--vscode-panel-border); opacity:.85; }
        .lb-2 { color:var(--af-ink-charts-blue, var(--vscode-charts-blue, #3794ff)); } .lb-3 { color:var(--af-ink-charts-orange, var(--vscode-charts-orange, #e9a700)); }
        .lb-4 { color:var(--af-ink-editorError-foreground, var(--vscode-editorError-foreground, #e51400)); border-color:var(--vscode-editorError-foreground, #e51400); }
        .nt-tags, .nt-stars, .nt-pin { flex-shrink:0; }
        .nt-stars { letter-spacing:1px; }
        .nt-star { cursor:pointer; opacity:calc(1 - .45 * var(--af-dimk, 1)); } .nt-star.on { color:var(--af-ink-charts-yellow, var(--vscode-charts-yellow, #e2c08d)); opacity:1; }
        .nt-pin { cursor:pointer; opacity:.3; filter:grayscale(1); } .nt-pin:hover { opacity:.7; } .nt-pin.on { opacity:1; filter:none; }
        .nt-meta { margin-left:auto; flex-shrink:0; white-space:nowrap; }
        .nt-x { flex:0 0 auto; padding:1px 6px; min-width:0; opacity:calc(1 - .45 * var(--af-dimk, 1)); }
        .nt-x:hover { opacity:1; color:var(--af-ink-editorError-foreground, var(--vscode-editorError-foreground, #e51400)); }
        .nt-udot { color:var(--vscode-button-background); }
        .nt-badge { font-size:10px; border-radius:8px; padding:1px 7px; flex-shrink:0; border:1px solid var(--vscode-panel-border); }
        .nt-badge.ok { color:var(--af-ink-charts-green, var(--vscode-charts-green, #89d185)); }
        .nt-badge.warn { color:var(--af-ink-charts-orange, var(--vscode-charts-orange, #e9a700)); border-color:var(--vscode-charts-orange, #e9a700); }
        .nt-badge.rep { cursor:default; }
        .nt-report { display:flex; gap:8px; align-items:center; margin:8px 0; padding:6px 8px; border-left:3px solid var(--vscode-textLink-foreground); background:var(--vscode-editorWidget-background); border-radius:4px; }
        .nt-report .nt-reppath { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        /* "Open with" split button (Feature B) */
        .nt-split { position:relative; display:inline-flex; }
        .nt-docmain, .nt-doccaret { background:var(--vscode-button-background); color:var(--vscode-button-foreground); border:none; padding:4px 10px; cursor:pointer; font-family:inherit; }
        .nt-docmain:hover, .nt-doccaret:hover { background:var(--vscode-button-hoverBackground); }
        .nt-docmain { border-radius:4px 0 0 4px; }
        .nt-doccaret { border-radius:0 4px 4px 0; margin-left:1px; padding:4px 7px; }
        .nt-docmenu { position:absolute; top:100%; left:0; z-index:20; margin-top:2px; min-width:240px; display:flex; flex-direction:column;
            background:var(--vscode-editorWidget-background); border:1px solid var(--vscode-panel-border); border-radius:5px; box-shadow:0 2px 10px rgba(0,0,0,.35); overflow:hidden; }
        .nt-docopt { text-align:left; background:transparent; border:none; border-radius:0; padding:6px 10px; color:var(--vscode-foreground); cursor:pointer; font-family:inherit; }
        .nt-docopt:hover { background:var(--vscode-list-hoverBackground); }
        .nt-docopt.cur { font-weight:700; }
        .nt-docopt.cfg { border-top:1px solid var(--vscode-panel-border); opacity:.9; }
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
        /* The project mark rides between the tags and the stars — right of what
           the notice IS, left of what the user did to it. Clickable, so it gets
           the pointer every other openable mark on this page has. */
        .nt-proj { flex-shrink:0; font-size:11px; opacity:.85; cursor:pointer; }
        .nt-acct { flex-shrink:0; font-size:11px; opacity:.8; white-space:nowrap; }
        .nt-proj:hover { opacity:1; text-decoration:underline; }
        .nt-projrow { display:flex; gap:6px; align-items:center; margin:6px 0 2px; }
        .nt-projrow select { padding:2px 6px; max-width:260px; }
    </style>`;

    function render() {
        const items = visible();
        let listHtml = '';
        if (!items.length) {
            listHtml = `<p class="muted" style="margin-top:24px">🕊️ ${esc(tr('No notices match. Agents post updates, reports, reminders, suggestions, warnings and questions here — one line each; click to read.'))}</p>`;
        } else if ((sortKey === 'newest' || sortKey === 'oldest') && !query) {
            let lastDay = '';
            for (const n of items) { const d = dayLabel(n.ts); if (d !== lastDay) { listHtml += `<div class="nt-day">${esc(d)}</div>`; lastDay = d; } listHtml += noticeCard(n); }
        } else { listHtml = items.map(noticeCard).join(''); }

        document.getElementById('app').innerHTML = `${STYLE}
            ${window.AFHeader.tabs('notices')}
            ${window.AFHeader.html({
                page: 'notices', title: esc(lab('🔔 Notices')),
                sub: [tr('{n} total', { n: (DATA.notices || []).length }), tr('{n} unread', { n: DATA.unread || 0 }),
                    tr('{n} open question(s)', { n: DATA.openQuestions || 0 }), tr('showing {n}', { n: items.length })]
                    .concat(selected.size ? [tr('{n} selected', { n: selected.size })] : [], [window.AFTime.clockUtc(DATA.generatedAt)]).join(' · '),
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

    /** Open or fold a notice — the row's click and the menu's item are one path,
     *  including the part that is easy to forget: opening one marks it read. */
    function toggleNotice(id) {
        if (expanded.has(id)) { expanded.delete(id); }
        else {
            if (singleMode) { expanded.clear(); }
            expanded.add(id);
            // opening a notice marks it read automatically (a question's real
            // state is answered/not — its read flag just clears the bell)
            const n = (DATA.notices || []).find(x => x.id === id);
            if (n && !n.read) {
                // In the unread view, pin this row so it doesn't vanish the
                // instant it flips to read — the user opened it TO read it.
                if (fMode === 'unread') { stickyRead.add(id); }
                vscode.postMessage({ type: 'markRead', id, read: true });
            }
        }
        render();
    }

    /** Put a notice into edit mode, seeded from what it currently says. */
    function startEdit(id) {
        const n = (DATA.notices || []).find(x => x.id === id);
        if (!n) { return; }
        editDrafts[id] = {
            title: n.title || '', type: n.type || 'update', level: lvl(n),
            tags: (n.tags || []).join(', '), body: n.body || '',
            sections: (n.sections || []).map(s => ({ title: s.title, body: s.body }))
        };
        editing.add(id); expanded.add(id); render();
    }

    function wire(items) {
        const bind = (id, ev, fn) => { const el = document.getElementById(id); if (el) { el.addEventListener(ev, fn); } };
        // Switching (or re-clicking) a filter chip is a deliberate view refresh:
        // release the sticky-read rows so read notices finally drop out of Unread.
        document.querySelectorAll('[data-chip]').forEach(b => b.addEventListener('click', () => { fMode = b.dataset.chip; stickyRead.clear(); saveState(); render(); }));
        filterPickers().forEach(p => window.AFFilter.wireMulti({
            id: p.id,
            onChange: sel => { p.set(sel); saveState(); render(); }
        }));
        bind('nt-sort', 'change', e => { sortKey = e.target.value; saveState(); render(); });
        bind('nt-search', 'input', e => { query = e.target.value; refocusSearch = true; saveState(); render(); });
        bind('nt-reset', 'click', () => { fMode = DEF.fMode; fType = DEF.fType; fLevel = DEF.fLevel; fAgent = DEF.fAgent; fStatus = DEF.fStatus; fProject = DEF.fProject; fAccount = DEF.fAccount; sortKey = DEF.sortKey; query = DEF.query; stickyRead.clear(); saveState(); render(); });

        // Filing. The picker in an open notice writes one row; the toolbar's
        // box writes the selection (or everything shown), which is the gesture
        // that makes a backlog of unfiled notices tractable at all.
        document.querySelectorAll('.nt-pjsel').forEach(sel => sel.addEventListener('change', e => {
            e.stopPropagation();
            vscode.postMessage({ type: 'setProject', id: sel.dataset.id, project: sel.value });
        }));
        // A project's page opens on the PC; on a phone a tap on the mark opens the row like any other part of it.
        if (!ON_PHONE_HOST) {
            document.querySelectorAll('[data-openproj]').forEach(el => el.addEventListener('click', e => {
                e.stopPropagation();
                vscode.postMessage({ type: 'openProject', project: el.dataset.openproj });
            }));
            document.querySelectorAll('[data-act="openproj"]').forEach(el => el.addEventListener('click', e => {
                e.stopPropagation();
                vscode.postMessage({ type: 'openProject', project: el.dataset.project });
            }));
        }

        // bulk actions run on the SELECTED ids, or — if nothing is checked — on
        // everything currently shown (the active filter).
        const bulkTargets = () => selected.size ? [...selected] : items.map(n => n.id);
        document.querySelectorAll('[data-hact]').forEach(b => b.addEventListener('click', () => {
            const a = b.dataset.hact;
            if (a === 'clearRead') { vscode.postMessage({ type: 'clearRead' }); }
            else if (a === 'needs') { vscode.postMessage({ type: 'afnav', to: 'needs' }); }
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

        // The toolbar's filing box follows the same rule as every other bulk
        // action here: the selection, or — with nothing ticked — everything the
        // current filter shows. `__clear__` is a real choice ("take it out"),
        // which the empty option cannot be: that one is the box's own label.
        bind('nt-bulkproj', 'change', e => {
            const v = e.target.value;
            e.target.value = '';
            if (!v) { return; }
            const ids = bulkTargets();
            if (ids.length) {
                vscode.postMessage({ type: 'setProject', ids, project: v === '__clear__' ? '' : v });
            }
        });

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

        document.querySelectorAll('[data-toggle]').forEach(row =>
            row.addEventListener('click', () => toggleNotice(row.dataset.toggle)));
        document.querySelectorAll('[data-row-dismiss]').forEach(button =>
            button.addEventListener('click', ev => {
                ev.stopPropagation();
                const id = button.dataset.rowDismiss;
                expanded.delete(id);
                vscode.postMessage({ type: 'dismiss', id });
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
            else if (act === 'edit') { startEdit(id); }
            else if (act === 'editcancel') { currentEditValues(id); editing.delete(id); delete editDrafts[id]; render(); }
            else if (act === 'editsave') {
                currentEditValues(id); const d = editDrafts[id];
                vscode.postMessage({ type: 'edit', id, patch: { title: d.title, type: d.type, level: Number(d.level), tags: d.tags, body: d.body, sections: d.sections } });
                editing.delete(id); delete editDrafts[id];
            }
        }));
        document.querySelectorAll('.nt-link').forEach(a => a.addEventListener('click', ev => {
            ev.preventDefault(); ev.stopPropagation();
            if (ON_PHONE_HOST) { window.AFCtx.copy(a.dataset.href); return; }
            vscode.postMessage({ type: 'openExternal', url: a.dataset.href });
        }));

        // "Open with" split button on the report link (Feature B): main = default
        // mode, caret = menu, menu item = per-click mode, cfg = configure flow.
        document.querySelectorAll('[data-doc]').forEach(b => b.addEventListener('click', ev => {
            ev.stopPropagation();
            const doc = b.dataset.doc, id = b.dataset.id;
            // caret toggles the menu; every other action closes it (render()) so a
            // pick or a main-click never leaves the popover hanging open.
            if (doc === 'main') { docMenu = null; vscode.postMessage({ type: 'openReport', id }); render(); }
            else if (doc === 'caret') { docMenu = docMenu === id ? null : id; render(); }
            else if (doc === 'open') { docMenu = null; vscode.postMessage({ type: 'openReport', id, mode: b.dataset.mode }); render(); }
            else if (doc === 'cfg') { docMenu = null; vscode.postMessage({ type: 'configureDocOpen' }); render(); }
        }));
    }

    // ------------------------------------------------------- right-click menu

    /**
     * Everything a right-click on a notice can ask for. Each branch runs the
     * SAME function the body's own button runs — marking read, pinning, editing,
     * handing over, dismissing — so the two can never mean different things.
     * What the menu adds is doing any of it WITHOUT opening the notice.
     */
    function ctxDo(act, ctx) {
        const verb = act.split(':')[0];
        const arg = act.slice(verb.length + 1);
        const id = String(ctx.notice || '');
        // ‼️ Written out rather than assembled from a helper: these have to be
        // the messages the body's buttons send, key for key, and a helper that
        // put `id` first would produce a different object for the same act.
        const post = (m) => vscode.postMessage(m);
        const notice = () => (DATA.notices || []).find(n => n.id === id);
        if (ON_PHONE_HOST && (verb === 'ntHand' || verb === 'ntExport' || verb === 'ntReport')) {
            window.AFCtx.toast(tr(ON_THE_PC), true);
            return;
        }

        switch (verb) {
            case 'ntOpen': toggleNotice(id); return;
            case 'ntFold': expanded.delete(id); render(); return;
            case 'ntRead': post({ type: 'markRead', id: id, read: arg === '1' }); return;
            case 'ntPin': post({ type: 'pin', id: id, pinned: arg === '1' }); return;
            case 'ntStars': post({ type: 'setStars', id: id, stars: Number(arg) }); return;
            case 'ntEdit': startEdit(id); return;
            case 'ntDecline': post({ type: 'decline', id: id }); return;
            case 'ntHand': post({ type: 'handoffNotice', id: id }); return;
            case 'ntExport': post({ type: 'exportOne', id: id }); return;
            case 'ntReport': post({ type: 'openReport', id: id }); return;
            case 'ntDismiss': expanded.delete(id); post({ type: 'dismiss', id: id }); return;
            case 'ntOrig':
                if (showOrig.has(id)) { showOrig.delete(id); } else { showOrig.add(id); }
                expanded.add(id);
                render();
                return;
            // The answer box and the queue box both live in the body, so the menu
            // opens the row and puts the caret in the right one rather than
            // inventing a second way to ask the same thing.
            case 'ntAnswer': {
                expanded.add(id);
                render();
                const box = document.querySelector(`.nt-atext[data-id="${id}"]`);
                if (box && box.focus) { box.focus(); }
                return;
            }
            case 'ntQueue':
                converting.add(id);
                expanded.add(id);
                render();
                return;
            // Narrowing the board from a row you are already looking at: the
            // filters are the page's own multi-picks, set to exactly one value.
            case 'ntOnly':
                if (arg === 'agent') { fAgent = [String(ctx.ntAgent || '')]; }
                else if (arg === 'type') { fType = [String(ctx.ntType || '')]; }
                else { fLevel = [String(ctx.ntLevel || 1)]; }
                saveState();
                render();
                return;
            case 'ntCopy': {
                const n = notice();
                if (!n) { window.AFCtx.copy(''); return; }
                window.AFCtx.copy(arg === 'id' ? n.id
                    : arg === 'title' ? n.title
                        : [n.title, n.body, ...(n.sections || []).map(s => s.title + '\n' + s.body)]
                            .filter(Boolean).join('\n\n'));
                return;
            }
        }
    }

    // ‼️ ONCE, at module scope — render() rewires everything else on every paint.
    window.AFCtx.listen(ctxDo);

    // ‼️ M-33 — A HOST PUSH WAITS FOR THE READER'S HANDS; THE PAGE'S OWN
    // RENDERS DO NOT. render() replaces the whole of #app, so a repaint that
    // arrives while somebody is typing detaches the box they are typing in and
    // the caret falls to <body> — where space IS Page Down. Full text, and
    // what a page-specific busy() is for: media/afRepaint.js.
    const repaint = window.AFRepaint.guard(render);
    // U-207 — a notice's 🔊 reads its title, text and sections; its report's is read on the host, from the notice
    window.AFRead.init(m => vscode.postMessage(m), DATA.reading);
    window.AFRead.texts(key => {
        const id = key.slice(key.indexOf(':') + 1);
        if (key.startsWith('report:')) { return { report: id }; }
        const n = (DATA.notices || []).find(x => x.id === id);
        return n ? [n.title, n.body, ...(n.sections || []).map(s => [s.title, s.body].filter(Boolean).join('\n\n'))].filter(Boolean).join('\n\n') : '';
    });
    window.addEventListener('message', ev => {
        if (window.AFRead.receive(ev.data)) { return; }
        if (ev.data.type === 'data') {
            DATA = ev.data.data;
            const ids = new Set((DATA.notices || []).map(n => n.id));
            [...selected].forEach(id => { if (!ids.has(id)) { selected.delete(id); } });
            [...stickyRead].forEach(id => { if (!ids.has(id)) { stickyRead.delete(id); } });
            if (DATA.focusId) { focusId = DATA.focusId; expanded.add(focusId); }
            repaint();
        }
    });
    if (focusId) { expanded.add(focusId); }

    // Close the "open with" split menu on ANY click outside it. Capture phase so
    // it fires even for elements that stopPropagation in the bubble phase; the
    // caret's own handler still toggles the menu because it runs after this.
    document.addEventListener('click', ev => {
        if (!docMenu) { return; }
        const t = ev.target;
        if (!(t && t.closest && t.closest('.nt-split'))) { docMenu = null; render(); }
    }, true);

    render();
})();
