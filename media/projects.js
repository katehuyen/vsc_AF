// Agent Farm — Projects page: the list on the left, the project itself on the
// right. Everything about a project is editable here; nothing about it has to
// be typed into a settings file.
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    let DATA = window.__DATA__;
    let selectedId = DATA.focusId || (DATA.projects[0] && DATA.projects[0].id) || '';
    let flash = null;          // { error } | { ok } — the answer to the last action
    let people = null;         // people rows while being edited (null = read from DATA)
    // The new-project form, open on the page instead of in a prompt sequence.
    // null = closed. `folderTouched` stops the name from overwriting a folder
    // the user picked or typed themselves.
    let creating = null;

    /**
     * The project's own tabs.
     *
     * `settings` is the editor Faz 1 shipped as the whole page — it was always
     * meant to end up as one tab here, and the reading tabs are what the page
     * is actually for. The order is the order of the questions: what is this
     * doing right now → what has happened → which sessions → what it cost →
     * change it.
     */
    const TABS = [
        { id: 'overview', label: 'Overview', tip: 'What this project is doing right now' },
        { id: 'timeline', label: 'Timeline', tip: 'Everything that happened, newest first' },
        { id: 'sessions', label: 'Sessions', tip: 'The same sessions table as everywhere else, scoped to this project' },
        { id: 'plan', label: 'Plan', tip: 'The plan document\'s own checkboxes — ticking one here changes that one character in the file' },
        { id: 'backlog', label: 'Backlog', tip: 'The standing pile of work: coded, ranked, filtered. Not the roadmap (that is Plan) and not the global queue' },
        { id: 'track', label: 'Track', tip: 'Which sessions — and which turns of them — each backlog item was worked in. Press a turn to open that transcript at that moment' },
        { id: 'docs', label: 'Docs', tip: 'The project folder, and any document in it' },
        { id: 'people', label: 'People', tip: 'Who decides, who pays, who does the work, who you ask' },
        { id: 'cost', label: 'Cost', tip: 'Where the money went, and where it is going' },
        { id: 'settings', label: '⚙ Settings', tip: 'Edit the project' }
    ];
    // ‼️ Seeded from the payload, not hard-coded to the first tab. The PANEL
    // remembers which tab is open (it is what decides which data to build) and
    // it outlives this script: reopening the page rebuilds the HTML, so a page
    // that always started on Overview would show Overview while the host was
    // still building — and sending — the timeline.
    let tab = (DATA.tab && TABS.some(t => t.id === DATA.tab)) ? DATA.tab : 'overview';
    /** Timeline chips the reader switched OFF — an exclusion set, so a kind
     *  that appears for the first time is visible instead of hidden. */
    let feedOff = new Set(['turn']);   // turns are the noisiest source; opt in
    /** The embedded sessions table (created lazily — the component wants a
     *  container that exists). */
    let sessTable = null;

    const newForm = seed => ({
        name: (seed && seed.suggestName) || '',
        folder: '',
        folderTouched: false,
        kind: '',
        status: 'active',
        summary: '',
        repos: (seed && seed.repos) || [],
        sessionIds: (seed && seed.sessionIds) || []
    });

    window.addEventListener('message', ev => {
        if (ev.data.type === 'result') {
            flash = ev.data.error ? { error: ev.data.error } : (ev.data.ok ? { ok: ev.data.ok } : null);
            // a create that came back clean has nothing left to show
            if (creating && !ev.data.error) { creating = null; }
            // ‼️ A backlog edit in flight is only let go once the host says it
            // landed. The commonest refusal is "the document changed under you",
            // and closing the box on that would throw away a paragraph somebody
            // just wrote — the one thing this page must never do.
            if (blEdit && blEdit.saving) {
                if (ev.data.error) { blEdit.saving = false; } else { blEdit = null; }
            }
            // Same bargain for the capture box: the words go only once the file
            // has them. The axes STAY — filing three bugs into the same area is
            // the normal case, and re-picking it each time is a tax on it.
            if (blCap && blCap.sending) {
                blCap.sending = false;
                // …and the queue position goes with the words. Unlike an area,
                // "put this one third" is about the item just written, not a
                // standing preference — leaving it set would silently make the
                // next capture jump the queue too.
                if (!ev.data.error) { blCap.text = ''; blCap.at = ''; }
            }
            return;                                   // the data message repaints
        }
        if (ev.data.type === 'suggestedFolder') {
            if (creating && !creating.folderTouched) { creating.folder = ev.data.folder || ''; render(); }
            return;
        }
        if (ev.data.type === 'pickedFolder') {
            if (creating) { creating.folder = ev.data.folder; creating.folderTouched = true; render(); }
            return;
        }
        if (ev.data.type === 'data') {
            const was = selectedId;
            DATA = ev.data.data;
            if (DATA.newForm) { creating = newForm(DATA.newForm); askSuggestion(creating.name); }
            if (DATA.focusId) { selectedId = DATA.focusId; }
            if (!DATA.projects.some(p => p.id === selectedId)) {
                selectedId = (DATA.projects[0] && DATA.projects[0].id) || '';
            }
            // ‼️ THE PEOPLE TABLE IS UNSAVED WORK, AND A PAYLOAD IS NOT A REASON
            // TO THROW IT AWAY. Clearing it on every `data` message meant any
            // refresh that arrived while somebody was filling the table — a new
            // commit picked up in the background is enough — silently put the
            // old rows back and took the half-typed ones with them. Since the
            // editor moved to its own tab it is only written by "Save people",
            // so that window is as long as the user takes. Only a change of
            // PROJECT invalidates the rows, because then they are somebody
            // else's people.
            if (selectedId !== was) { people = null; }
            render();
            return;
        }
        // the sessions table asks the host for a row's turn breakdown
        if (sessTable && sessTable.onMessage(ev)) { return; }
    });

    /** The kinds the timeline is currently showing, as the host wants them.
     *  Empty means "everything off" — a state the page draws by itself rather
     *  than asking the host for a list it would then throw away. */
    function wantedKinds() {
        const feed = td().feed;
        const counts = (feed && feed.counts) || null;
        // Before the first feed lands there are no counts to filter — but the
        // default exclusion is already known, so ask for it straight away
        // rather than letting the opening request spend its whole row budget
        // on the one kind that starts switched off.
        const present = counts ? Object.keys(counts) : Object.keys(KIND_META);
        return present.filter(k => !feedOff.has(k));
    }

    /**
     * Tell the host which project, tab and event kinds are being read.
     *
     * The host builds ONLY the open tab's data (a 300-row feed on every fleet
     * refresh, to draw a form, is how a read-only page starts costing frames).
     *
     * ‼️ THE KIND FILTER GOES WITH IT, AND THAT IS NOT AN OPTIMISATION.
     * Measured on a project with 150 sessions: 3000 of its 3690 events are
     * TURNS. A feed capped at 300 rows and filtered afterwards in the page is
     * therefore 81% rows the reader has switched off — the timeline showed
     * about fifty sessions-and-commits and claimed the rest was "older", when
     * the rest was simply turns. Filtering before the cap means the 300 rows
     * are 300 rows of what you are actually looking at.
     *
     * Only ever posted when the answer CHANGED — the host echoes back what it
     * built, and without that comparison the two would refresh each other for
     * ever.
     */
    function syncView() {
        const want = creating ? '' : selectedId;
        const kinds = wantedKinds();
        const echoed = DATA.feedKinds || [];
        const sameKinds = tab !== 'timeline' || !kinds.length
            || (kinds.length === echoed.length && kinds.every(k => echoed.indexOf(k) >= 0));
        if (DATA.tabProject === want && DATA.tab === tab && sameKinds) { return; }
        vscode.postMessage({ type: 'view', project: want, tab: tab, kinds: kinds });
    }

    /** Ask the host where this name's folder would go. The page cannot work it
     *  out itself — it does not know the projects root or how a name becomes a
     *  folder name, and guessing would put the two out of step. */
    function askSuggestion(name) {
        vscode.postMessage({ type: 'suggestFolder', name: name || '' });
    }

    const STATUS_META = {
        planned: { label: 'Planned', icon: '○' },
        active: { label: 'Active', icon: '●' },
        paused: { label: 'On hold', icon: '⏸' },
        done: { label: 'Done', icon: '✔' },
        archived: { label: 'Archived', icon: '📦' }
    };
    const GROUPS = [
        { key: 'open', label: 'Active', statuses: ['active'] },
        { key: 'hold', label: 'On hold', statuses: ['paused', 'planned'] },
        { key: 'closed', label: 'Finished', statuses: ['done', 'archived'] }
    ];

    const money = n => '$' + (Number(n) || 0).toFixed(2);
    // ‼️ These two are a PAIR and must agree on a timezone. dateMs builds LOCAL
    // midnight, so reading the value back through toISOString() printed the day
    // before anywhere east of UTC — and since the form writes back what it
    // displayed, the date walked one day earlier on every single save.
    const dateValue = ms => {
        if (!ms) { return ''; }
        const d = new Date(ms), p = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    };
    const dateMs = v => (v ? new Date(v + 'T00:00:00').getTime() : '');
    const sel = () => DATA.projects.find(p => p.id === selectedId);

    function listHtml() {
        const rows = GROUPS.map(g => {
            const items = DATA.projects.filter(p => g.statuses.indexOf(p.status) >= 0);
            if (!items.length) { return ''; }
            return `<div class="pj-group">${C.esc(g.label)} <span class="muted">${items.length}</span></div>` +
                items.map(p => `
                    <div class="pj-item ${p.id === selectedId ? 'on' : ''}" data-pick="${C.esc(p.id)}"
                        ${window.AFCtx.row('afProjectRow', {
                            project: p.id, name: p.name || '', folder: p.folder || '',
                            afActive: p.id === DATA.activeId
                        })}
                        title="${C.esc(p.name)} — ${window.AFCtx.HINT}">
                        <span class="pj-dot" style="${p.color ? `background:${C.esc(p.color)}` : ''}"></span>
                        <span class="pj-name">${p.icon ? C.esc(p.icon) + ' ' : ''}${C.esc(p.name)}</span>
                        ${p.id === DATA.activeId ? '<span class="pj-badge" title="Active project — sessions started in this window are filed under it">◧</span>' : ''}
                        ${p.warnings.length ? `<span class="pj-warn" title="${C.esc(p.warnings.join(' · '))}">⚠️</span>` : ''}
                        <span class="muted small">${p.sessions}</span>
                    </div>`).join('');
        }).join('');
        const unassigned = DATA.unassigned || { sessions: 0, cost: 0 };
        return `<div class="pj-list">
            <div class="btnrow" style="margin-bottom:8px">
                <button data-act="create">＋ New project</button>
                <button class="secondary" data-act="rescan" title="${C.esc(DATA.projectsRoot ? 'Walk ' + DATA.projectsRoot + ' and pick up folders renamed in Obsidian' : 'Set agentFarm.projectsRoot first')}" ${DATA.projectsRoot ? '' : 'disabled'}>⟳ Rescan</button>
            </div>
            ${rows || '<p class="muted small">No projects yet. A project is a folder plus a name — everything else hangs off it.</p>'}
            <div class="pj-unassigned" title="Sessions no project claims">
                ⊘ Unassigned <span class="muted">${unassigned.sessions} sessions · ${money(unassigned.cost)}</span>
            </div>
        </div>`;
    }

    /** The create form — the whole of it, on the page. A project starts as a
     *  name and a folder; everything else is here because asking for it once,
     *  now, beats discovering later that nobody ever set it. */
    function createHtml() {
        const c = creating;
        const kinds = ['', 'product', 'customer', 'internal', 'research', 'personal', 'ops'];
        const kindOpts = kinds
            .map(k => `<option value="${k}"${c.kind === k ? ' selected' : ''}>${k || '—'}</option>`).join('');
        const statusOpts = Object.keys(STATUS_META)
            .map(s => `<option value="${s}"${c.status === s ? ' selected' : ''}>${STATUS_META[s].label}</option>`).join('');
        const taken = DATA.projects.some(p => p.name.toLowerCase() === c.name.trim().toLowerCase());
        const problem = !c.name.trim() ? 'A project needs a name.'
            : (taken ? `"${c.name.trim()}" already exists.` : '');
        const carried = c.sessionIds.length
            ? `<p class="muted small">${c.sessionIds.length} session(s) will be filed under it as soon as it exists.</p>` : '';
        return `
        <div class="pj-head"><h2>New project</h2></div>
        ${carried}
        <div class="pj-grid">
            <label class="pj-wide">Name <span class="muted small">a product, a customer, a piece of work</span>
                <input id="n-name" value="${C.esc(c.name)}" placeholder="Agent Farm" autofocus>
            </label>
            <label class="pj-wide">Documents folder
                <div class="pj-row">
                    <input id="n-folder" value="${C.esc(c.folder)}" placeholder="leave empty to decide later">
                    <button class="secondary" data-act="nBrowse">Browse…</button>
                </div>
            </label>
            <label>Status<select id="n-status">${statusOpts}</select></label>
            <label>Kind<select id="n-kind">${kindOpts}</select></label>
            <label class="pj-wide">Summary<input id="n-summary" value="${C.esc(c.summary)}" placeholder="one line"></label>
            <label class="pj-wide">Code roots <span class="muted small">one per line — sessions working under them fall to this project</span>
                <textarea id="n-repos" rows="2">${C.esc(c.repos.join('\n'))}</textarea>
            </label>
        </div>
        ${problem ? `<p class="pj-flash bad">${C.esc(problem)}</p>` : ''}
        ${!c.folder.trim() && !problem
            ? '<p class="muted small">No folder: the project is created anyway and will say so on its row until you choose one.</p>' : ''}
        <div class="btnrow pj-actions">
            <button data-act="nCreate" ${problem ? 'disabled' : ''}>Create project</button>
            <button class="secondary" data-act="nCancel">Cancel</button>
        </div>`;
    }

    function warningsHtml(p) {
        if (!p.warnings.length) { return ''; }
        const missing = p.folderState === 'missing';
        const unset = p.folderState === 'unset';
        const buttons = missing
            ? `<button data-act="pickFolder">Relink…</button>
               <button class="secondary" data-act="recreateFolder">Recreate</button>
               <button class="secondary" data-act="clearFolder">Ignore</button>`
            : (unset ? '<button data-act="pickFolder">Choose a folder…</button>' : '');
        return `<div class="pj-banner">
            <div>${p.warnings.map(w => `⚠️ ${C.esc(w)}`).join('<br>')}</div>
            ${buttons ? `<div class="btnrow">${buttons}</div>` : ''}
        </div>`;
    }

    /**
     * Whether the table on screen says something different from what the
     * project actually holds.
     *
     * The rows now survive a repaint (they are unsaved work, not a view of the
     * data), which means the page owes the reader the other half of that deal:
     * saying so. A table that looks identical whether or not Save was pressed
     * is how somebody closes the tab having changed nothing.
     */
    function peopleDirty(p) {
        if (people === null || !p) { return false; }
        const key = x => ['name', 'role', 'kind', 'contact', 'link', 'note']
            .map(k => String((x && x[k]) || '')).join(' · ');
        const mine = people.filter(x => (x.name || '').trim()).map(key);
        const saved = (p.people || []).map(key);
        return mine.length !== saved.length || mine.some((k, i) => k !== saved[i]);
    }

    const PEOPLE_UNSAVED = 'unsaved — these rows are not on the project yet';
    const PEOPLE_SAVED = 'saved';

    /** Refresh only the two things that answer "is this saved?", without a
     *  repaint. Called from the input handler, which must not redraw. */
    function markPeopleState() {
        const btn = document.querySelector('[data-act="savePeople"]');
        if (!btn) { return; }
        const dirty = peopleDirty(sel());
        btn.disabled = !dirty;
        const note = document.getElementById('pj-people-state');
        if (note) { note.textContent = dirty ? PEOPLE_UNSAVED : PEOPLE_SAVED; }
    }

    function peopleRows(p) {
        if (people === null) { people = (p.people || []).map(x => Object.assign({}, x)); }
        const roles = ['owner', 'client', 'sponsor', 'contributor', 'contact', 'vendor'];
        const kinds = ['person', 'company', 'self'];
        const opt = (list, v) => list.map(o => `<option value="${o}"${o === v ? ' selected' : ''}>${o}</option>`).join('');
        return people.map((x, i) => `<tr>
            <td><input data-p="name" data-i="${i}" value="${C.esc(x.name || '')}" placeholder="name"></td>
            <td><select data-p="role" data-i="${i}">${opt(roles, x.role || 'contact')}</select></td>
            <td><select data-p="kind" data-i="${i}">${opt(kinds, x.kind || 'person')}</select></td>
            <td><input data-p="contact" data-i="${i}" value="${C.esc(x.contact || '')}" placeholder="email / phone"></td>
            <td><input data-p="link" data-i="${i}" value="${C.esc(x.link || '')}" placeholder="[[vault note]]"></td>
            <td><button class="secondary pj-x" data-rmperson="${i}" title="Remove">✕</button></td>
        </tr>`).join('');
    }

    /**
     * The identity strip — on every tab, because it is the answer to "which
     * project am I looking at" and a tab that drops it makes the reader scroll
     * back to find out.
     */
    function headHtml(p) {
        return `
        <div class="pj-head">
            <h2>${p.icon ? C.esc(p.icon) + ' ' : ''}${C.esc(p.name)}</h2>
            <div class="btnrow">
                ${p.id === DATA.activeId
                ? '<button class="secondary" data-act="clearActive" title="Stop filing new sessions under this project">◧ Active — clear</button>'
                : '<button class="secondary" data-act="setActive" title="Sessions you start in this window get filed under this project">◧ Make active</button>'}
                ${p.folderState === 'ok' ? '<button class="secondary" data-act="revealFolder">📁 Folder</button>' : ''}
            </div>
        </div>
        ${p.summary ? `<p class="muted small pj-summary">${C.esc(p.summary)}</p>` : ''}
        ${warningsHtml(p)}
        <div class="pj-stats">
            <span><b>${p.sessions}</b> sessions</span>
            <span><b>${money(p.cost)}</b> total</span>
            <span><b>${money(p.todayCost)}</b> today</span>
            <span>${p.lastTs ? 'last ' + new Date(p.lastTs).toLocaleDateString() : 'no activity yet'}</span>
        </div>`;
    }

    function tabsHtml() {
        return `<div class="pj-tabs">${TABS.map(t =>
            `<button class="pj-tab ${t.id === tab ? 'on' : ''}" data-tab="${t.id}" title="${C.esc(t.tip)}">${C.esc(t.label)}</button>`
        ).join('')}</div>`;
    }

    function settingsHtml(p) {
        const statusOpts = Object.keys(STATUS_META)
            .map(s => `<option value="${s}"${p.status === s ? ' selected' : ''}>${STATUS_META[s].label}</option>`).join('');
        const kinds = ['', 'product', 'customer', 'internal', 'research', 'personal', 'ops'];
        const kindOpts = kinds
            .map(k => `<option value="${k}"${(p.kind || '') === k ? ' selected' : ''}>${k || '—'}</option>`).join('');
        const parents = [{ id: '', name: '—' }].concat(
            DATA.projects.filter(x => x.id !== p.id && !x.parentId).map(x => ({ id: x.id, name: x.name })));
        const parentOpts = parents
            .map(x => `<option value="${C.esc(x.id)}"${(p.parentId || '') === x.id ? ' selected' : ''}>${C.esc(x.name)}</option>`).join('');
        const agentBoxes = (DATA.agents || []).map(a => `
            <label class="pj-chk"><input type="checkbox" data-agent="${C.esc(a)}" ${p.agentRules.indexOf(a) >= 0 ? 'checked' : ''}> ${C.esc(a)}</label>`).join('');

        return `
        <div class="pj-grid">
            <label>Name<input id="f-name" value="${C.esc(p.name)}"></label>
            <label class="pj-chk pj-inline"><input type="checkbox" id="f-renamefolder" checked> also rename the folder</label>
            <label>Status<select id="f-status">${statusOpts}</select></label>
            <label>Kind<select id="f-kind">${kindOpts}</select></label>
            <label>Icon<input id="f-icon" maxlength="4" value="${C.esc(p.icon || '')}" placeholder="🚀"></label>
            <label>Colour<input id="f-color" type="color" value="${C.esc(p.color || '#888888')}"></label>
            <label>Part of<select id="f-parent">${parentOpts}</select></label>
            <label class="pj-wide">Summary<input id="f-summary" value="${C.esc(p.summary || '')}" placeholder="one line; the long version lives in the project's own charter"></label>

            <label class="pj-wide">Documents folder
                <div class="pj-row">
                    <input id="f-folder" value="${C.esc(p.folder || '')}" placeholder="no folder chosen yet" readonly>
                    <button class="secondary" data-act="pickFolder">Choose…</button>
                    ${p.folder ? '<button class="secondary" data-act="clearFolder" title="Forget this folder (the folder itself is not touched)">✕</button>' : ''}
                </div>
            </label>
            <label class="pj-wide">Code roots <span class="muted small">one per line — sessions working under them fall to this project</span>
                <textarea id="f-repos" rows="3" placeholder="D:\\code\\my-app">${C.esc((p.repos || []).join('\n'))}</textarea>
            </label>

            <label>Daily budget<input id="f-budget" type="number" min="0" step="0.5" value="${p.budgetUSD || ''}"></label>
            <label>Total budget<input id="f-budgettotal" type="number" min="0" step="1" value="${p.budgetTotalUSD || ''}"></label>
            <label>Started<input id="f-started" type="date" value="${dateValue(p.startedAt)}"></label>
            <label>Due<input id="f-due" type="date" value="${dateValue(p.dueAt)}"></label>
            <label class="pj-wide">Tags<input id="f-tags" value="${C.esc((p.tags || []).join(', '))}" placeholder="comma separated"></label>

            <div class="pj-wide">
                <div class="pj-sub">Agents whose sessions default here <span class="muted small">a rule, not ownership — an explicit assignment always wins</span></div>
                <div class="pj-chks">${agentBoxes || '<span class="muted small">no agents discovered</span>'}</div>
            </div>

            <div class="pj-wide muted small">
                People live on their own <b>People</b> tab — they are a question about the
                project, not a setting on it.
            </div>
        </div>

        <div class="btnrow pj-actions">
            <button data-act="save">Save</button>
            <button class="secondary" data-act="delete">Remove project…</button>
        </div>`;
    }

    // -----------------------------------------------------------------------
    // the tabs that READ rather than edit
    // -----------------------------------------------------------------------

    /** The host only builds the open tab's data, so an arriving payload can be
     *  for the tab you just left. Everything below tolerates an empty object. */
    const td = () => DATA.tabData || {};

    const relTime = ts => {
        if (!ts) { return ''; }
        const s = Math.round((Date.now() - ts) / 1000);
        if (s < 60) { return s + 's ago'; }
        const m = Math.round(s / 60);
        if (m < 60) { return m + 'm ago'; }
        const h = Math.round(m / 60);
        if (h < 48) { return h + 'h ago'; }
        return Math.round(h / 24) + 'd ago';
    };

    const KIND_META = {
        session: { glyph: '💬', label: 'Sessions' },
        turn: { glyph: '↳', label: 'Turns' },
        task: { glyph: '⚙', label: 'Tasks' },
        mission: { glyph: '🎯', label: 'Missions' },
        commit: { glyph: '⎇', label: 'Commits' },
        files: { glyph: '✎', label: 'File writes' },
        notice: { glyph: '🔔', label: 'Notices' },
        queue: { glyph: '📥', label: 'Queue' },
        decision: { glyph: '⚖', label: 'Decisions' },
        deliverable: { glyph: '📦', label: 'Deliverables' },
        plan: { glyph: '☑', label: 'Plan items' }
    };
    const kindMeta = k => KIND_META[k] || { glyph: '·', label: k };

    /** One feed row. The whole row is the link — a 4-pixel target inside a row
     *  the reader is already pointing at is a target they have to aim for. */
    function eventRow(e, i) {
        const meta = kindMeta(e.kind);
        const when = new Date(e.ts);
        return `<div class="pj-ev ${e.tone ? 'tone-' + e.tone : ''} ${e.link ? 'clickable' : ''}" ${e.link ? `data-ev="${i}"` : ''}
                ${window.AFCtx.row('afFeedEvent', {
            ev: i, evKind: e.kind || '', afLinked: !!e.link,
            text: [e.title, e.detail, e.agent].filter(Boolean).join(' · ')
        })}
                title="${C.esc(when.toLocaleString())}${e.link ? ' — click to open' : ''} — ${window.AFCtx.HINT}">
            <span class="pj-ev-g" title="${C.esc(meta.label)}">${meta.glyph}</span>
            <span class="pj-ev-t">${C.esc(e.title)}</span>
            <span class="pj-ev-d">${C.esc(e.detail || '')}</span>
            <span class="pj-ev-a">${C.esc(e.agent || '')}</span>
            <span class="pj-ev-c">${e.cost ? money(e.cost) : ''}</span>
            <span class="pj-ev-w">${C.esc(relTime(e.ts))}</span>
        </div>`;
    }

    function overviewHtml(p) {
        const d = td();
        if (!d.activity) { return '<p class="muted">Reading the project…</p>'; }
        const run = d.activity.running || [];
        const next = d.activity.next || [];
        const cost = d.cost || { total: 0, today: 0, burn: {} };
        const burn = cost.burn || {};

        const runHtml = run.length
            ? run.map(r => `<div class="pj-now">
                    <span class="pj-dotlive"></span>
                    <span class="pj-ev-t">${C.esc(r.title || '(untitled)')}</span>
                    <span class="muted small">${C.esc(r.what)}${r.agent ? ' · ' + C.esc(r.agent) : ''} · started ${C.esc(relTime(r.since))}</span>
                </div>`).join('')
            : '<p class="muted small">Nothing running on this project right now.</p>';

        const nextHtml = next.length
            ? next.map(t => `<div class="pj-next">
                    <span class="pj-ev-t">${C.esc(t.title)}</span>
                    <span class="muted small">${C.esc(t.agent)} · queued ${C.esc(relTime(t.createdAt))}${t.held ? ' · held: ' + C.esc(t.held) : ''}</span>
                </div>`).join('')
            : '<p class="muted small">Nothing queued.</p>';

        const recent = (d.recent || []).slice(0, 8);
        return `
        <div class="pj-cards">
            <div class="pj-card">
                <div class="pj-card-h">Running now</div>
                ${runHtml}
            </div>
            <div class="pj-card">
                <div class="pj-card-h">Next up <span class="muted small">queued tasks</span></div>
                ${nextHtml}
            </div>
            <div class="pj-card">
                <div class="pj-card-h">Money</div>
                <div class="pj-money">
                    <span><b>${money(cost.total)}</b><small>total</small></span>
                    <span><b>${money(cost.today)}</b><small>today${p.budgetUSD ? ` · ${burn.todayPct != null ? burn.todayPct : 0}% of budget` : ''}</small></span>
                    <span><b>${money(burn.perDay7 || 0)}</b><small>per day, last 7</small></span>
                    ${burn.projectedAtDue != null
                ? `<span><b>${money(burn.projectedAtDue)}</b><small>projected at the due date</small></span>` : ''}
                    ${burn.daysToBudget != null
                ? `<span><b>${burn.daysToBudget}</b><small>days of budget left at that rate</small></span>` : ''}
                </div>
            </div>
        </div>
        <div class="pj-card">
            <div class="pj-card-h">Latest <span class="muted small">the newest of everything — the Timeline tab has the rest</span></div>
            ${recent.length ? recent.map(eventRow).join('') : '<p class="muted small">Nothing has happened on this project yet.</p>'}
        </div>`;
    }

    /**
     * ‼️ THE FILTER IS CLIENT-SIDE, AND THE COUNTS COME FROM THE HOST.
     *
     * Chips that round-trip to the extension for every click feel broken on a
     * list this size, so the whole (capped) feed ships once per repaint and the
     * chips filter it here. The COUNTS, though, are computed host-side over
     * everything before any filter — so a chip says how many rows turning it on
     * would actually add, which is the only number that makes it worth reading.
     */
    function timelineHtml() {
        const d = td();
        const feed = d.feed;
        if (!feed) { return '<p class="muted">Reading the project…</p>'; }
        const counts = feed.counts || {};
        const present = Object.keys(counts).filter(k => counts[k] > 0);
        if (!present.length) {
            return `<p class="muted">Nothing has happened on this project yet — no sessions, no tasks, no commits in its code roots.</p>${unfiledNote()}`;
        }
        const chips = present.map(k => {
            const meta = kindMeta(k);
            const on = !feedOff.has(k);
            return `<button class="pj-chip ${on ? 'on' : ''}" data-kind="${k}" title="${C.esc(meta.label)} — ${counts[k]} in this project">
                ${meta.glyph} ${C.esc(meta.label)} <span class="muted">${counts[k]}</span></button>`;
        }).join('');

        // ‼️ The row carries its index in the UNFILTERED list, because that is
        // what the click handler looks the event up in. Numbering the filtered
        // rows instead would open the wrong thing the moment a chip is off.
        const rows = (feed.events || [])
            .map((e, i) => ({ e: e, i: i }))
            .filter(x => !feedOff.has(x.e.kind));
        return `
        <div class="pj-chips-row">
            ${chips}
            <span class="grow"></span>
            <button class="pj-chip" data-kind="__all">All</button>
            <button class="pj-chip" data-kind="__none">None</button>
        </div>
        <div class="pj-feed">
            ${rows.length ? rows.map(x => eventRow(x.e, x.i)).join('')
                : '<p class="muted small">Every kind is switched off — turn one back on above.</p>'}
        </div>
        ${feed.truncated ? '<p class="muted small">Older rows are not shown — this list is capped so the page stays fast.</p>' : ''}
        ${unfiledNote()}`;
    }

    /**
     * Say what is NOT in the timeline, by name.
     *
     * A filter row that silently has no Notices chip reads as a bug. Naming the
     * gap is one line, and it is the difference between "there is nothing" and
     * "this cannot be shown yet" — which are completely different answers to
     * the reader's question.
     */
    function unfiledNote() {
        const missing = (DATA.unfiledKinds || []).map(k => kindMeta(k).label);
        return `<p class="muted small pj-unfiled">${missing.length
            ? `Not here: ${C.esc(missing.join(' · '))} — they carry no project of their own, and an
               agent may work on several projects, so guessing one from who posted it would file them
               wrong. `
            : ''}Decisions, deliverables and plan items come from the project's own documents and
            appear at the date those documents state — a decision's <code>af-date</code>, a
            deliverable's Date column, the ✅ Obsidian writes when you tick a plan item there. Anything
            undated is left out rather than stamped with the moment the file happened to be saved.</p>`;
    }

    function costHtml(p) {
        const c = td().cost;
        // ‼️ Overview carries a cost object TOO — the headline figures only.
        // Clicking through to this tab repaints once with that slim object
        // still in hand, before the host's answer lands. Checking for the full
        // shape (not just "is there a cost?") is what stops that one frame from
        // being a crash: `c.days.length` on the slim object throws, and a
        // webview that throws mid-render leaves the page frozen on the tab you
        // just left with no error anywhere the user can see.
        if (!c || !Array.isArray(c.days)) { return '<p class="muted">Reading the project…</p>'; }
        if (!c.total && !c.days.length) {
            return '<p class="muted">No spend on this project yet.</p>';
        }
        const days = c.days.slice(-45);
        const chart = days.length
            ? C.stackedBars(days.map(x => x.day.slice(5)),
                [{ name: 'cost', values: days.map(x => x.cost) }], { fmt: C.fmtUSD })
            : '';
        const agents = c.byAgent.length
            ? C.hbars(c.byAgent.map(a => ({ name: a.agent, value: a.cost })), { fmt: C.fmtUSD })
            : '<p class="muted small">No agent has spent anything here.</p>';
        const models = c.byModel.length
            ? C.hbars(c.byModel.map(m => ({ name: m.model, value: m.cost })), { fmt: C.fmtUSD })
            : '<p class="muted small">No single-model turn to attribute.</p>';
        const burn = c.burn || {};
        const budgetLine = [
            p.budgetUSD ? `daily budget ${money(p.budgetUSD)} — today is ${burn.todayPct != null ? burn.todayPct : 0}% of it` : '',
            p.budgetTotalUSD ? `total budget ${money(p.budgetTotalUSD)} — ${burn.budgetUsedPct != null ? burn.budgetUsedPct : 0}% used` : '',
            burn.daysToBudget != null ? `${burn.daysToBudget} days left at the last-7-days rate` : '',
            burn.projectedAtDue != null ? `projected ${money(burn.projectedAtDue)} by the due date` : ''
        ].filter(Boolean);

        return `
        <div class="pj-money pj-money-top">
            <span><b>${money(c.total)}</b><small>total</small></span>
            <span><b>${money(c.today)}</b><small>today</small></span>
            <span><b>${money(burn.perDay7 || 0)}</b><small>per day · last 7</small></span>
            <span><b>${money(burn.perDay30 || 0)}</b><small>per day · last 30</small></span>
        </div>
        ${budgetLine.length ? `<p class="muted small">${C.esc(budgetLine.join(' · '))}</p>` : ''}
        <div class="pj-card">
            <div class="pj-card-h">By day <span class="muted small">last ${days.length} day(s) with spend</span></div>
            ${chart}
        </div>
        <div class="pj-cards">
            <div class="pj-card">
                <div class="pj-card-h">By agent</div>
                ${agents}
            </div>
            <div class="pj-card">
                <div class="pj-card-h">By model</div>
                ${models}
                ${costCaveat(c)}
            </div>
        </div>`;
    }

    /**
     * ‼️ SAY WHAT THE BREAKDOWN CANNOT CLAIM.
     *
     * Cost is billed per TURN, not per model. A turn served by two models cannot
     * be split without inventing a ratio, and a session with no per-turn detail
     * cannot be split at all. Both are shown as their own figure instead of
     * being folded into whichever model happened to sort first — a chart that
     * silently adds up to less than the total is worse than one that says why.
     */
    function costCaveat(c) {
        const bits = [];
        if (c.mixedTurnCost) {
            bits.push(`${money(c.mixedTurnCost)} came from turns served by more than one model — the transcript bills the turn, not the model, so it cannot be split`);
        }
        if (c.unattributed) {
            bits.push(`${money(c.unattributed)} is from sessions with no per-turn detail`);
        }
        return bits.length ? `<p class="muted small">${C.esc(bits.join('. '))}.</p>` : '';
    }

    function render() {
        const p = sel();
        const note = flash
            ? `<div class="pj-flash ${flash.error ? 'bad' : 'good'}">${C.esc(flash.error || flash.ok)}</div>`
            : '';
        document.getElementById('app').innerHTML = `
            <style>
                .pj-wrap { display:flex; gap:18px; align-items:flex-start; }
                .pj-list { flex:0 0 240px; }
                .pj-group { font-size:11px; text-transform:uppercase; opacity:.6; margin:12px 0 4px; }
                .pj-item { display:flex; align-items:center; gap:6px; padding:5px 8px; border-radius:5px; cursor:pointer; }
                .pj-item:hover { background:var(--vscode-list-hoverBackground); }
                .pj-item.on { background:var(--vscode-list-activeSelectionBackground); color:var(--vscode-list-activeSelectionForeground); }
                .pj-dot { width:8px; height:8px; border-radius:50%; background:var(--vscode-panel-border); flex-shrink:0; }
                .pj-name { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
                .pj-badge { opacity:.9; }
                .pj-unassigned { margin-top:14px; padding:6px 8px; border-top:1px solid var(--vscode-panel-border); font-size:12px; opacity:.8; }
                .pj-main { flex:1; min-width:0; }
                .pj-head { display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; }
                .pj-head h2 { margin:0; }
                .pj-banner { border:1px solid var(--vscode-editorWarning-foreground); border-radius:6px;
                    padding:10px 12px; margin:10px 0; display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; align-items:center; }
                .pj-stats { display:flex; gap:18px; flex-wrap:wrap; margin:10px 0 16px; opacity:.9; font-size:12px; }
                .pj-grid { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:12px 18px; }
                .pj-grid label { display:flex; flex-direction:column; gap:4px; font-size:12px; opacity:.9; }
                .pj-grid input, .pj-grid select, .pj-grid textarea { width:100%; box-sizing:border-box; }
                .pj-wide { grid-column:1 / -1; }
                .pj-inline { flex-direction:row !important; align-items:center; gap:6px; }
                .pj-row { display:flex; gap:6px; align-items:center; }
                .pj-row input { flex:1; }
                .pj-sub { font-size:12px; margin-bottom:6px; }
                .pj-chks { display:flex; flex-wrap:wrap; gap:10px; }
                .pj-chk { display:flex; align-items:center; gap:4px; font-size:12px; }
                .pj-people { width:100%; border-collapse:collapse; }
                .pj-people td { padding:2px 3px; }
                .pj-people input, .pj-people select { width:100%; box-sizing:border-box; }
                .pj-x { padding:2px 7px; }
                .pj-actions { margin-top:18px; }
                .pj-flash { padding:7px 11px; border-radius:5px; margin:8px 0; font-size:12px; }
                .pj-flash.good { background:var(--vscode-inputValidation-infoBackground, #0a3); color:var(--vscode-foreground); }
                .pj-flash.bad { background:var(--vscode-inputValidation-errorBackground, #a00); color:var(--vscode-foreground); }
                .pj-summary { margin:4px 0 0; }
                /* tabs */
                .pj-tabs { display:flex; gap:2px; margin:14px 0 12px; border-bottom:1px solid var(--vscode-panel-border); }
                .pj-tab { background:none; border:none; border-bottom:2px solid transparent; border-radius:0;
                    padding:6px 12px; font-size:12px; opacity:.7; cursor:pointer; color:inherit; }
                .pj-tab:hover { opacity:1; background:var(--vscode-list-hoverBackground); }
                .pj-tab.on { opacity:1; border-bottom-color:var(--vscode-focusBorder,#3794ff); font-weight:600; }
                /* track — the sketch; see trackHtml() for what is deliberately absent */
                .pj-trk-bar { margin-bottom:10px; }
                .pj-trk-item { border:1px solid var(--vscode-widget-border,#4443); border-radius:6px;
                    padding:7px 10px; margin-bottom:7px; }
                .pj-trk-head { display:flex; gap:8px; align-items:baseline; flex-wrap:wrap; }
                .pj-trk-state { font-size:11px; opacity:.6; }
                .pj-trk-words { flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis;
                    white-space:nowrap; opacity:.85; }
                .pj-trk-stamp { font-size:11px; opacity:.7; }
                .pj-trk-run { display:flex; gap:7px; align-items:center; flex-wrap:wrap; margin-top:4px;
                    padding-left:6px; border-left:2px solid var(--vscode-widget-border,#4443); }
                .pj-trk-sid { font-size:11px; opacity:.8; }
                .pj-trk-turn { font-size:11px; padding:1px 7px; border-radius:9px; cursor:pointer;
                    border:1px solid var(--vscode-widget-border,#4443); background:none; color:inherit; }
                .pj-trk-turn:hover { background:var(--vscode-list-hoverBackground); }
                .pj-trk-doubt { font-size:10px; padding:1px 6px; border-radius:8px; opacity:.85;
                    background:var(--vscode-inputValidation-warningBackground,#663); }
                .pj-trk-note { margin-top:5px; padding-left:8px; font-size:12px; opacity:.9;
                    border-left:2px solid var(--vscode-focusBorder,#3794ff); }
                /* cards */
                .pj-cards { display:grid; grid-template-columns:repeat(auto-fit, minmax(260px,1fr)); gap:12px; margin-bottom:12px; }
                .pj-card { border:1px solid var(--vscode-widget-border,#4443); border-radius:7px; padding:10px 12px; margin-bottom:12px; }
                .pj-card-h { font-size:11px; text-transform:uppercase; opacity:.6; margin-bottom:8px; }
                .pj-now, .pj-next { display:flex; flex-direction:column; gap:1px; padding:4px 0; }
                .pj-dotlive { width:7px; height:7px; border-radius:50%; display:inline-block; margin-right:5px;
                    background:var(--vscode-charts-green,#3fb950); }
                .pj-money { display:flex; gap:22px; flex-wrap:wrap; }
                .pj-money span { display:flex; flex-direction:column; }
                .pj-money b { font-size:16px; }
                .pj-money small { opacity:.6; font-size:11px; }
                .pj-money-top { margin:4px 0 10px; }
                /* timeline */
                .pj-chips-row { display:flex; gap:5px; flex-wrap:wrap; align-items:center; margin-bottom:10px; }
                .pj-chip { font-size:11px; padding:2px 9px; border-radius:11px; cursor:pointer;
                    border:1px solid var(--vscode-widget-border,#4443); background:none; color:inherit; opacity:.5; }
                .pj-chip.on { opacity:1; background:var(--vscode-badge-background); color:var(--vscode-badge-foreground); }
                .pj-feed { display:flex; flex-direction:column; }
                .pj-ev { display:grid; grid-template-columns:18px minmax(0,2fr) minmax(0,1.6fr) 90px 62px 74px;
                    gap:8px; align-items:baseline; padding:3px 6px; border-radius:4px; font-size:12px;
                    border-left:2px solid transparent; }
                .pj-ev:hover { background:var(--vscode-list-hoverBackground); }
                .pj-ev.clickable { cursor:pointer; }
                .pj-ev.tone-ok { border-left-color:var(--vscode-charts-green,#3fb950); }
                .pj-ev.tone-bad { border-left-color:var(--vscode-editorError-foreground,#f14c4c); }
                .pj-ev.tone-warn { border-left-color:var(--vscode-charts-yellow,#d7ba7d); }
                .pj-ev-g { text-align:center; opacity:.8; }
                .pj-ev-t { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
                .pj-ev-d, .pj-ev-a, .pj-ev-c, .pj-ev-w { opacity:.6; font-size:11px;
                    overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
                .pj-ev-c, .pj-ev-w { text-align:right; }
                .pj-unfiled { margin-top:14px; max-width:70ch; }
                .grow { flex:1; }
                /* documents · plan · people */
                .pj-docbar { display:flex; align-items:center; gap:10px; flex-wrap:wrap;
                    padding:6px 0 10px; border-bottom:1px solid var(--vscode-panel-border); margin-bottom:10px; }
                /* ‼️ THE TAB'S OWN ? — see blHelpHtml. Half-lit and the size of a
                   full stop, because it must be findable without being a second
                   thing to read; and it opens OVER the page, right under itself,
                   so a question asked here is answered here. */
                /* ‼️ The panel is measured against the DOC BAR, not against the ?
                   itself. The ? sits wherever the counts and the file name end,
                   so a box hung off it ran straight off the right edge on a
                   narrow panel and gave the page a horizontal scrollbar. Hung
                   from the bar it opens directly under the counts it explains
                   and cannot overflow, whatever the panel is doing. */
                .pj-docbar { position:relative; }
                .pj-helpw { position:static; display:inline-flex; align-items:center; }
                .pj-help { width:16px; height:16px; padding:0; line-height:1; font-size:10px;
                    border-radius:50%; cursor:pointer; opacity:.45; background:none; color:inherit;
                    border:1px solid var(--vscode-widget-border,#4443); }
                .pj-help:hover, .pj-help.on { opacity:1; border-color:var(--vscode-focusBorder); }
                .pj-helppop { position:absolute; top:100%; left:0; z-index:45;
                    display:block; width:100%; max-width:660px; max-height:56vh; overflow:auto;
                    padding:12px 14px; border-radius:8px; font-size:12px; line-height:1.55;
                    text-align:left; white-space:normal; cursor:default;
                    border:1px solid var(--vscode-widget-border,#4446);
                    background:var(--vscode-editorWidget-background,#252526);
                    box-shadow:0 6px 20px #0007; }
                .pj-helpp { display:block; margin:0 0 9px; }
                .pj-helpp:last-child { margin-bottom:0; }
                .pj-open { display:flex; gap:4px; }
                .pj-open button { padding:2px 9px; font-size:11px; }
                .pj-plan-sec { margin-bottom:14px; }
                .pj-plan-item { display:flex; align-items:baseline; gap:7px; padding:3px 6px;
                    border-radius:4px; cursor:pointer; font-size:13px; }
                .pj-plan-item:hover { background:var(--vscode-list-hoverBackground); }
                .pj-plan-item.done .pj-plan-t { opacity:.55; text-decoration:line-through; }
                .pj-plan-t { flex:1; min-width:0; }
                .pj-plan-m { opacity:.6; font-size:11px; white-space:nowrap; }
                /* backlog */
                /* position:relative so the whole-item hover box (.pj-bl-tip)
                   measures itself against the ROW: it opens the width of the
                   line it belongs to, which is the widest it can be without
                   running off the panel. */
                .pj-bl-row { display:flex; align-items:baseline; gap:6px; padding:3px 6px;
                    border-radius:4px; font-size:13px; border-left:2px solid transparent;
                    position:relative; }
                .pj-bl-row:hover { background:var(--vscode-list-hoverBackground); }
                /* ‼️ Faded by COLOUR, not by opacity: the hover box that hangs off
                   "more" is a child of this span, and opacity on an ancestor
                   dims its whole subtree — including an absolutely positioned
                   one — which would have made the tooltip on a closed item look
                   broken. Colour fades the words and leaves the box alone. */
                .pj-bl-row.closed .pj-bl-t { color:var(--vscode-descriptionForeground);
                    text-decoration:line-through; }
                .pj-bl-row.next { border-left-color:var(--vscode-charts-green,#3fb950); }
                /* ‼️ STARTED WINS OVER QUEUED, and it is declared after .next
                   so it does. The two are not the same kind of fact: the green
                   is a RANK the page worked out, the yellow is something the
                   reader said by hand — and an item you have started is, almost
                   by definition, near the front of the queue, so the one you
                   asked for was the one being painted over. A border alone was
                   two pixels the width of the panel away from the words anyway;
                   the row carries a ▶ started badge with it. */
                .pj-bl-row.doing { border-left-color:var(--vscode-charts-yellow,#d7ba7d);
                    background:var(--vscode-editor-selectionHighlightBackground,#d7ba7d18); }
                .pj-bl-m.started { color:var(--vscode-charts-yellow,#d7ba7d); opacity:1; cursor:help; }
                .pj-bl-row.container .pj-bl-t { font-weight:600; }
                .pj-bl-code { font-size:11px; opacity:.85; white-space:nowrap;
                    background:var(--vscode-textCodeBlock-background,#8881); padding:0 5px; border-radius:4px; }
                .pj-bl-code.unfiled { background:none; }
                .pj-bl-t { flex:1; min-width:0; }
                .pj-bl-kind { font-size:10px; padding:0 5px; border-radius:8px; opacity:.85; white-space:nowrap;
                    background:var(--vscode-badge-background); color:var(--vscode-badge-foreground); }
                .pj-bl-badge { background:none; border:none; color:inherit; cursor:pointer;
                    font-size:11px; padding:0 4px; border-radius:4px; opacity:.75; min-width:22px; }
                .pj-bl-badge:hover { opacity:1; background:var(--vscode-toolbar-hoverBackground,#8882); }
                .pj-bl-m { opacity:.6; font-size:11px; white-space:nowrap; }
                .pj-bl-m.blocked { color:var(--vscode-editorWarning-foreground); opacity:.9; }
                .pj-bl-m.warn { color:var(--vscode-editorWarning-foreground); opacity:1; cursor:help; }
                /* ‼️ THE BADGES AND THE ACTIONS ARE TWO STACKED ROWS, AND THE
                   BLOCK IS AS WIDE AS THE WIDER OF THEM — no more.
                   Every axis this page can set is a control, and on one line the
                   cluster was wider than the item it belonged to: the words, the
                   whole reason the row exists, got what was left. Two lines fix
                   that only if the block is SIZED TO ITS CONTENT; a wrapping box
                   with a fixed max-width takes the whole max-width whatever is
                   in it, which is how splitting the cluster in two bought the
                   text nothing and left a hole between the two halves instead.
                   A column of two flex rows measures itself, so the space goes
                   back to the words.
                   The upper row is the LONGER of the two on purpose: it is the
                   one that starts with the type badge, and a short top row would
                   push that badge right, away from the text it describes. */
                .pj-bl-side { flex:0 0 auto; min-width:172px; display:flex; flex-direction:column;
                    align-items:flex-end; gap:2px; align-self:flex-start; }
                .pj-bl-srow { display:flex; align-items:baseline; justify-content:flex-end; gap:4px; }
                /* The actions stay out of the way until the row is under the
                   pointer: eight buttons on every one of two hundred lines is a
                   wall, and the list has to stay readable to be usable. They
                   keep their SPACE while hidden (visibility, not display), so
                   nothing moves as the pointer crosses the list. */
                .pj-bl-act { visibility:hidden; padding:0 6px; font-size:11px; background:none;
                    border:1px solid transparent; color:inherit; opacity:.8; }
                .pj-bl-row:hover .pj-bl-act { visibility:visible; }
                /* The one exception: whatever is switched ON stays on screen. A
                   state you can only turn off by finding the button again is a
                   state nobody turns off. */
                .pj-bl-act.on { visibility:visible; opacity:1;
                    color:var(--vscode-charts-yellow,#d7ba7d);
                    border-color:var(--vscode-charts-yellow,#d7ba7d); }
                .pj-bl-act:hover { opacity:1;
                    background:var(--vscode-toolbar-hoverBackground,#8882);
                    border-color:var(--vscode-widget-border,#4443); }
                /* Ordering is a different kind of act from state, and a row of
                   identical buttons reads as one. */
                .pj-bl-step.move { margin-left:7px; }
                /* ‼️ THE STEP MENU. ▲ is a button AND a menu, and that is the
                   whole trick: a plain click still moves one place, and holding
                   the pointer there offers the jumps that would otherwise be
                   eleven clicks. So the cheap thing stays one click and the
                   expensive thing becomes possible, without a second button for
                   it — which is what ⤒ and ⤓ used to be, back when they could
                   only reach the end of an AREA and not of the queue.
                   Opening waits a beat so that crossing ▲ on the way to ▼ does
                   not flash a menu; closing is instant. No gap under the button,
                   or the pointer leaves the wrapper on its way into the menu and
                   the menu it was travelling to disappears. */
                .pj-bl-step { position:relative; display:inline-flex; }
                .pj-bl-steps { position:absolute; top:100%; right:0; z-index:31; padding:4px 3px 3px;
                    visibility:hidden; opacity:0; transition:opacity .07s linear 0s, visibility 0s linear .07s;
                    border-radius:6px; border:1px solid var(--vscode-widget-border,#4446);
                    background:var(--vscode-menu-background, var(--vscode-editorWidget-background,#252526));
                    box-shadow:0 3px 10px #0006; }
                .pj-bl-step:hover .pj-bl-steps { visibility:visible; opacity:1; transition-delay:.3s; }
                .pj-bl-steps button { display:flex; align-items:baseline; gap:6px; width:100%;
                    text-align:left; background:none; border:none; color:inherit; cursor:pointer;
                    font-size:12px; padding:2px 8px; border-radius:4px; white-space:nowrap; }
                .pj-bl-steps button:hover { background:var(--vscode-list-hoverBackground); }
                .pj-bl-steps b { flex:0 0 20px; text-align:right; font-weight:600; }
                .pj-bl-steps .end { opacity:.85; border-top:1px solid var(--vscode-widget-border,#4443);
                    margin-top:3px; padding-top:4px; }
                /* A tag the user invented is marked as theirs — it filters like
                   any other, but it is not part of the shipped vocabulary. */
                .pj-chip.own { border-style:dashed; }
                .pj-bl-qwrap { position:relative; flex:0 0 210px; display:inline-flex; }
                .pj-bl-q { flex:1; min-width:0; padding-right:22px; }
                .pj-bl-qx { position:absolute; right:2px; top:50%; transform:translateY(-50%);
                    background:none; border:none; color:inherit; opacity:.55; cursor:pointer;
                    font-size:11px; padding:0 4px; }
                .pj-bl-qx:hover { opacity:1; }
                /* An axis's own clear sits at the end of its row, and only when
                   that row is narrowing something — see blRowClear. */
                .pj-chip.clearf { opacity:.75; border-style:none;
                    background:var(--vscode-toolbar-hoverBackground,#8882); padding:2px 7px; }
                .pj-chip.clearf:hover { opacity:1; outline:1px solid var(--vscode-focusBorder); }
                /* CAPTURE. The box is a rectangle you can write a paragraph in,
                   and the five controls WRAP into the space beside it instead of
                   riding one long row: on a narrow panel that row pushed the
                   writing box down to a slit, which is an invitation to write
                   less than you mean. */
                .pj-bl-cap { display:flex; gap:10px; align-items:stretch; flex-wrap:wrap; }
                .pj-bl-cap textarea { flex:1 1 340px; min-width:220px; min-height:86px;
                    font-family:inherit; font-size:13px; resize:vertical; padding:6px 8px; }
                .pj-bl-capf { flex:1 1 240px; max-width:340px; display:flex; flex-wrap:wrap;
                    gap:6px; align-content:flex-start; }
                .pj-bl-capf select { flex:1 1 128px; min-width:112px; }
                /* The last row of the footer: the box's own four text tools on
                   the left, Add on the right. Add is a BUTTON, not a banner —
                   it used to span the whole width, which said "this is the big
                   thing here" about the one control you press last. */
                .pj-bl-capr { flex:1 1 100%; display:flex; gap:6px; align-items:center; }
                .pj-bl-capr .pj-bl-addb { flex:0 0 auto; padding:2px 20px; }
                /* WHERE IN THE QUEUE. A narrow box immediately left of Add, so
                   the position is chosen in the same glance as the press that
                   uses it. It does not stretch: it holds a number. */
                .pj-bl-capr .pj-bl-atsel { flex:0 0 auto; width:74px; min-width:74px; margin-left:auto; }
                .pj-bl-capr .pj-bl-atsel:disabled { opacity:.45; }
                /* THE QUEUE STRIP. Entries are buttons because they do two things
                   — jump, and move — and a thing that only looked like a label
                   was a strip nobody tried to touch. */
                .pj-bl-next .pj-bl-nextrow { display:flex; gap:6px; flex-wrap:wrap; align-items:center;
                    min-height:24px; }
                .pj-bl-nextw { display:inline-flex; align-items:center; }
                .pj-bl-nextb { display:inline-flex; align-items:center; gap:5px; cursor:grab;
                    background:none; color:inherit; border:1px solid var(--vscode-widget-border,#4443);
                    border-radius:12px; padding:2px 8px; font-size:11px; }
                .pj-bl-nextb:hover { background:var(--vscode-list-hoverBackground);
                    border-color:var(--vscode-focusBorder); }
                /* ‼️ THE NUMBER IS THE RANK, AND THE RANK IS WHAT GETS THE
                   COLOUR — here and on the row's handle below, the same green,
                   because it is the same number. Everything else on a chip is a
                   fact about the item; only this one says where it stands. The
                   strip was drawn entirely in grey, which made the one card on
                   the page that is about ORDER look like a legend.
                   Inside the op's default the number is full strength and the
                   chip's own outline turns green with it; past the default the
                   same hue at half, so the line ┊ draws is visible without a
                   second explanation. Two steps, one hue — a rainbow here would
                   be decoration competing with the type badges, which are the
                   page's real colour vocabulary. */
                .pj-bl-nextn { min-width:15px; padding:1px 4px; border-radius:9px;
                    font-size:10px; font-weight:600; text-align:center;
                    font-variant-numeric:tabular-nums;
                    background:var(--vscode-charts-green,#3fb950);
                    color:var(--vscode-editor-background,#1f1f1f); }
                .pj-bl-nexte { opacity:.7; font-size:10px; }
                .pj-bl-nextb .pj-bl-code { opacity:1; }
                .pj-bl-stale { font-size:10px; margin-left:8px; cursor:help;
                    color:var(--vscode-editorWarning-foreground); }
                /* Past the op's default: still the user's queue, just not what an
                   agent takes unasked — so it is dimmed, not hidden. */
                .pj-bl-nextb.past { opacity:.9; }
                .pj-bl-nextb.past .pj-bl-nextn { background:none; font-weight:400; opacity:.6;
                    color:var(--vscode-charts-green,#3fb950); }
                .pj-bl-nextb.past .pj-bl-code { opacity:.7; }
                .pj-bl-nextb.past:hover { opacity:1; }
                /* The heading says the two things that CHANGE; the standing
                   explanation is in its hover. See nextQueueHtml. */
                .pj-bl-nexthint { margin-left:7px; font-size:11px; font-weight:400; opacity:.55;
                    text-transform:none; letter-spacing:0; cursor:help; }
                .pj-bl-nexthint:hover { opacity:.95; }
                .pj-bl-nextb.dragging { opacity:.4; }
                .pj-bl-nextb.drop-left { box-shadow:inset 2px 0 0 var(--vscode-focusBorder); }
                .pj-bl-nextb.drop-right { box-shadow:inset -2px 0 0 var(--vscode-focusBorder); }
                .pj-bl-nextcut { opacity:.45; cursor:help; padding:0 2px; user-select:none; }
                /* Where a jump from the strip lands. Long enough to find with the
                   eye, short enough not to become part of the furniture. */
                .pj-bl-row.flashrow { outline:2px solid var(--vscode-focusBorder);
                    outline-offset:1px; background:var(--vscode-list-hoverBackground); }
                /* The work type is an axis, not decoration: it gets a colour so a
                   list of two hundred rows can be read by shape, and the same
                   colour on the filter chip so the two are obviously one thing. */
                .pj-bl-kind.t-bug { background:var(--vscode-charts-red,#f14c4c); color:#fff; }
                .pj-bl-kind.t-research { background:var(--vscode-charts-purple,#b180d7); color:#fff; }
                .pj-bl-kind.t-feat { background:var(--vscode-charts-blue,#3794ff); color:#fff; }
                .pj-bl-kind.t-ux { background:var(--vscode-charts-green,#3fb950); color:#fff; }
                .pj-bl-kind.t-chore, .pj-bl-kind.t-debt, .pj-bl-kind.t-doc, .pj-bl-kind.t-idea {
                    background:var(--vscode-charts-yellow,#d7ba7d); color:#000; }
                .pj-bl-kind.settable { cursor:pointer; border:none; font-family:inherit; }
                .pj-bl-kind.settable:hover { outline:1px solid var(--vscode-focusBorder); }
                .pj-bl-kind.none { background:none; border:1px dashed var(--vscode-widget-border,#4446);
                    color:inherit; opacity:.45; }
                /* A ROW MENU. Anchored to the badge that opened it rather than to
                   pointer coordinates: the row is the only thing that knows where
                   it is, and a menu positioned from a click event lands in the
                   wrong place the moment the list scrolls under it. */
                .pj-bl-mw { position:relative; display:inline-flex; align-items:baseline; }
                .pj-bl-menu { display:block; position:absolute; top:100%; left:0; z-index:30; min-width:172px;
                    margin-top:2px; padding:3px; border-radius:6px;
                    border:1px solid var(--vscode-widget-border,#4446);
                    background:var(--vscode-menu-background, var(--vscode-editorWidget-background,#252526));
                    box-shadow:0 3px 10px #0006; }
                .pj-bl-mi { display:flex; align-items:baseline; gap:7px; width:100%; text-align:left;
                    background:none; border:none; color:inherit; cursor:pointer; font-size:12px;
                    padding:3px 7px; border-radius:4px; }
                .pj-bl-mi:hover { background:var(--vscode-list-hoverBackground); }
                .pj-bl-mi.on { background:var(--vscode-list-activeSelectionBackground);
                    color:var(--vscode-list-activeSelectionForeground); }
                .pj-bl-mig { flex:0 0 30px; opacity:.85; font-size:11px; }
                /* Unfiled: a coloured filing glyph rather than the words "file it
                   under an area…", which were a whole sentence on every uncoded
                   row. The sentence moved into the hover. */
                .pj-bl-badge.filed { color:var(--vscode-charts-yellow,#d7ba7d); opacity:1; font-size:13px; }
                .pj-bl-badge.filed:hover { outline:1px solid var(--vscode-focusBorder); }
                /* The code opens the line, so it says so by behaving like a link. */
                .pj-bl-code.open { cursor:pointer; }
                .pj-bl-code.open:hover { outline:1px solid var(--vscode-focusBorder);
                    color:var(--vscode-textLink-foreground); }
                .pj-bl-row.dragging { opacity:.4; }
                .pj-bl-row.drop-before { box-shadow:inset 0 2px 0 var(--vscode-focusBorder); }
                .pj-bl-row.drop-after { box-shadow:inset 0 -2px 0 var(--vscode-focusBorder); }
                /* ‼️ THE HANDLE IS THE POSITION. A row's place in the queue is
                   the one number about it that changes and the one nobody could
                   see; putting it where the drag handle already was costs no
                   width and makes the handle say what dragging it changes. */
                .pj-bl-grip { cursor:grab; opacity:.4; font-size:10px; user-select:none;
                    flex:0 0 22px; text-align:right; font-variant-numeric:tabular-nums; }
                .pj-bl-row:hover .pj-bl-grip { opacity:.8; }
                .pj-bl-grip.off { cursor:default; opacity:.2; letter-spacing:-1px; }
                .pj-bl-row:hover .pj-bl-grip.off { opacity:.3; }
                /* The same two bands as the strip — see blBand. A position that
                   was green up there and grey down here would read as two
                   different numbers. */
                .pj-bl-grip.q-top { color:var(--vscode-charts-green,#3fb950);
                    font-weight:600; opacity:.9; }
                .pj-bl-grip.q-rest { color:var(--vscode-charts-green,#3fb950); opacity:.5; }
                .pj-bl-row:hover .pj-bl-grip.q-top { opacity:1; }
                .pj-bl-row:hover .pj-bl-grip.q-rest { opacity:.8; }
                .pj-bl-more { background:none; border:none; color:var(--vscode-textLink-foreground);
                    cursor:pointer; font-size:11px; padding:0 4px; }
                /* ‼️ THE WHOLE ITEM, ON HOVER, SCROLLABLE — see blMoreHtml. The
                   wrapper is position:static on purpose: the box is measured
                   against the ROW, so it opens the width of the line rather than
                   the width of the word "more".
                   The opening delay is the same beat the step menus use, so
                   sweeping the pointer down a list of two hundred rows does not
                   flash a paragraph at every one; closing is instant. No gap
                   above the box, or the pointer leaves the wrapper on its way
                   into it and the thing it was travelling to disappears. */
                .pj-bl-tw { position:static; display:inline; }
                .pj-bl-tip { position:absolute; left:0; top:100%; z-index:33;
                    display:block; width:100%; max-width:min(820px,100%);
                    max-height:46vh; overflow:auto; overscroll-behavior:contain;
                    visibility:hidden; opacity:0;
                    transition:opacity .08s linear 0s, visibility 0s linear .08s;
                    padding:8px 11px 10px; border-radius:7px; font-size:12px; line-height:1.55;
                    white-space:pre-wrap; word-break:break-word; text-decoration:none;
                    border:1px solid var(--vscode-widget-border,#4446);
                    background:var(--vscode-editorWidget-background,#252526);
                    box-shadow:0 5px 16px #0007; }
                .pj-bl-tw:hover .pj-bl-tip, .pj-bl-tip:hover { visibility:visible; opacity:1;
                    transition-delay:.25s; }
                .pj-bl-tiph { display:block; margin-bottom:6px; padding-bottom:5px; font-size:10px;
                    opacity:.6; white-space:normal;
                    border-bottom:1px solid var(--vscode-widget-border,#4443); }
                .pj-bl-tipb { display:block; }
                .pj-bl-edit { display:flex; flex:1; gap:6px; align-items:flex-start; }
                .pj-bl-edit textarea { flex:1; min-width:0; font-family:inherit; font-size:13px;
                    resize:vertical; min-height:44px; }
                .pj-bl-filters { border:1px solid var(--vscode-widget-border,#4443); border-radius:7px;
                    padding:8px 10px; margin-bottom:10px; }
                .pj-bl-fline { display:flex; gap:6px; flex-wrap:wrap; align-items:center; margin-bottom:6px; }
                .pj-bl-fline:last-child { margin-bottom:0; }
                .pj-bl-flab { font-size:11px; opacity:.6; flex:0 0 74px; }
                .pj-bl-count.narrowed { color:var(--vscode-charts-yellow,#d7ba7d); }
                .pj-docs { display:flex; gap:14px; align-items:flex-start; }
                .pj-doc-tree { flex:0 0 260px; max-height:60vh; overflow:auto;
                    border:1px solid var(--vscode-widget-border,#4443); border-radius:7px; padding:6px 4px; }
                .pj-doc-row { display:flex; align-items:baseline; gap:6px; padding:2px 6px;
                    border-radius:4px; font-size:12px; cursor:pointer; }
                .pj-doc-row.dir { cursor:default; opacity:.75; }
                .pj-doc-row:not(.dir):hover { background:var(--vscode-list-hoverBackground); }
                .pj-doc-row.on { background:var(--vscode-list-activeSelectionBackground);
                    color:var(--vscode-list-activeSelectionForeground); }
                .pj-doc-g { opacity:.7; }
                .pj-doc-n { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
                .pj-doc-r { font-size:10px; padding:0 5px; border-radius:8px; opacity:.85;
                    background:var(--vscode-badge-background); color:var(--vscode-badge-foreground); }
                .pj-doc-pane { flex:1; min-width:0; }
                .pj-doc-text { max-height:58vh; overflow:auto; white-space:pre-wrap; word-break:break-word;
                    font-size:12px; padding:10px 12px; border-radius:7px;
                    background:var(--vscode-textCodeBlock-background,#8881); }
            </style>
            ${window.AFHeader.html({
                page: 'projects',
                title: 'Projects',
                sub: `${DATA.projects.length} project(s)${DATA.activeName ? ' · active: ' + DATA.activeName : ' · no active project'}`,
                guide: 'projeler'
            })}
            ${note}
            <div class="pj-wrap">
                ${listHtml()}
                <div class="pj-main">${creating ? createHtml()
                : (p ? headHtml(p) + tabsHtml() + tabBodyHtml(p)
                    : '<p class="muted">Pick a project, or create one.</p>')}</div>
            </div>`;
        window.AFHeader.wire(vscode);
        flash = null;
        wire();
        // The shared table renders into its own container, which this repaint
        // just replaced — so it is (re)filled after the DOM exists, never before.
        if (p && !creating && tab === 'sessions') { mountSessions(); }
        blDoJump();
        syncView();
    }

    /**
     * Land on the row the queue strip pointed at.
     *
     * Consumed once, and AFTER the paint that drew the row — a scroll issued from
     * the click handler would be looking for an element the repaint has not put
     * there yet. The flash is a class rather than a repaint for the same reason
     * the open rows survive one: moving the list under the reader at the moment
     * they arrive is the opposite of taking them there.
     */
    function blDoJump() {
        const key = blJump;
        blJump = '';
        if (!key) { return; }
        const el = document.querySelector('[data-blrow][data-key="' + CSS.escape(key) + '"]');
        if (!el) { return; }
        el.scrollIntoView({ block: 'center' });
        el.classList.add('flashrow');
        setTimeout(() => el.classList.remove('flashrow'), 1800);
    }

    /**
     * The open tab's body.
     *
     * Every reading tab is drawn from `DATA.tabData`, which the host builds for
     * the OPEN tab only. A payload that arrived for the tab you just left leaves
     * the new one saying "reading…" for exactly one repaint — which is honest,
     * and cheaper than shipping four tabs' worth of data forever.
     */
    function tabBodyHtml(p) {
        switch (tab) {
            case 'timeline': return timelineHtml();
            case 'sessions': return sessionsHtml();
            case 'plan': return planHtml();
            case 'backlog': return backlogHtml();
            case 'track': return trackHtml();
            case 'docs': return docsHtml();
            case 'people': return peopleHtml(p);
            case 'cost': return costHtml(p);
            case 'settings': return settingsHtml(p);
            default: return overviewHtml(p);
        }
    }

    // -----------------------------------------------------------------------
    // the tabs that write into the user's own documents
    // -----------------------------------------------------------------------

    /**
     * Why a document tab has nothing to show, in the words that say what to do
     * about it.
     *
     * "No plan" is four different situations — the project has no folder, the
     * folder has moved, the folder is there but holds no plan document, or the
     * file could not be read — and they need four different sentences. One
     * blank panel for all four reads as a bug in every one of them.
     */
    function docStateHtml(d, what) {
        if (!d || !d.state) { return '<p class="muted">Reading the project…</p>'; }
        switch (d.state) {
            case 'no-folder':
                return `<p class="muted">This project has no documents folder yet. Choose one in
                    <b>⚙ Settings</b> and Agent Farm will build the skeleton — ${C.esc(what)} included.</p>`;
            case 'folder-missing':
                return `<p class="muted">Its folder is not where it was: <code>${C.esc(d.folder || '')}</code>.
                    Use <b>Relink…</b> above to point at where it went.</p>`;
            case 'no-doc':
                return `<p class="muted">No ${C.esc(what)} in this project's folder yet.
                    Agent Farm finds documents by an <code>af-role: ${C.esc(d.role || '')}</code> line in
                    their frontmatter and never by their name, so any file you put that line in becomes
                    this one — or press <b>Recreate</b> on the project to get the shipped skeleton back.</p>`;
            case 'unreadable':
                return `<p class="muted">${C.esc(d.path || '')} could not be read: ${C.esc(d.error || '')}</p>`;
            default:
                return '<p class="muted">Reading the project…</p>';
        }
    }

    /** The buttons that open a file the way the user opens report links
     *  everywhere else — the doc-open modes, not a viewer of our own. */
    function openWithHtml(relPath) {
        const cfg = DATA.docOpen || { mode: 'vscode', modes: ['vscode'], labels: {} };
        const label = m => (cfg.labels && cfg.labels[m]) || m;
        const rest = (cfg.modes || []).filter(m => m !== cfg.mode);
        return `<span class="pj-open">
            <button data-open="${C.esc(cfg.mode)}" data-path="${C.esc(relPath)}"
                title="${C.esc(label(cfg.mode))}">Open</button>
            ${rest.map(m => `<button class="secondary" data-open="${C.esc(m)}" data-path="${C.esc(relPath)}"
                title="${C.esc(label(m))}">${C.esc(shortMode(m))}</button>`).join('')}
        </span>`;
    }
    const MODE_SHORT = { vscode: 'Editor', preview: 'Preview', obsidian: 'Obsidian', custom: 'App' };
    const shortMode = m => MODE_SHORT[m] || m;

    /**
     * The plan — the user's own checkboxes, drawn as checkboxes.
     *
     * ‼️ The label under each box says what ticking it does NOT do, because the
     * surprising part is the restraint: Obsidian's Tasks plugin writes a ✅ date
     * when you tick a box in Obsidian, and this page deliberately does not. A
     * user who expects one and does not get it would think the tick failed.
     */
    function planHtml() {
        const d = td().plan;
        if (!d || d.state !== 'ok') { return docStateHtml(d, 'plan document'); }
        const sections = d.sections || [];
        const rows = sections.map(s => `
            <div class="pj-plan-sec">
                <div class="pj-card-h">${C.esc(s.title || '(no section)')}</div>
                ${s.items.map(i => `
                    <label class="pj-plan-item${i.done ? ' done' : ''}" style="padding-left:${8 + i.depth * 12}px"
                        ${window.AFCtx.row('afPlanItem', {
                            line: i.line, planId: i.id || '', text: i.text || '',
                            afDone: !!i.done, afPlanId: !!i.id
                        })}
                        title="line ${i.line}${i.id ? ' · 🆔 ' + C.esc(i.id) : ''} — ${window.AFCtx.HINT}">
                        <input type="checkbox" data-plan="${i.line}" data-planid="${C.esc(i.id || '')}"
                            data-plantext="${C.esc(i.text || '')}" ${i.done ? 'checked' : ''}>
                        <span class="pj-plan-t">${C.esc(i.text || '(empty)')}</span>
                        ${i.due ? `<span class="pj-plan-m" title="due">📅 ${C.esc(i.due)}</span>` : ''}
                        ${i.completed ? `<span class="pj-plan-m" title="completed">✅ ${C.esc(i.completed)}</span>` : ''}
                    </label>`).join('')}
            </div>`).join('');
        const sectionOpts = ['<option value="">end of the file</option>']
            .concat(sections.filter(s => s.title)
                .map(s => `<option value="${C.esc(s.title)}">${C.esc(s.title)}</option>`)).join('');
        return `
        <div class="pj-docbar">
            <span><b>${d.open}</b> open · <b>${d.done}</b> done</span>
            <span class="muted small">${C.esc(d.path)}</span>
            <span class="grow"></span>
            ${openWithHtml(d.path)}
        </div>
        ${rows || '<p class="muted small">The plan document has no checkbox lines yet.</p>'}
        <div class="pj-card">
            <div class="pj-card-h">Add an item</div>
            <div class="pj-row">
                <input id="plan-new" placeholder="what needs doing">
                <select id="plan-sec">${sectionOpts}</select>
                <button data-act="planAdd">Add</button>
            </div>
        </div>
        <p class="muted small pj-unfiled">Ticking a box here changes exactly one character of your file —
            the space inside <code>[ ]</code>. Your bullet, spacing, icons and Obsidian Tasks metadata are
            untouched, and no ✅ completion date is added: Agent Farm does not write metadata it does not own.
            Tick the box in Obsidian instead if you want its Tasks plugin to date it.</p>`;
    }

    // -----------------------------------------------------------------------
    // the backlog
    // -----------------------------------------------------------------------

    /**
     * What the reader has narrowed the list to. Page-side on purpose: the host
     * ships the whole file, so a chip is a repaint rather than a round trip.
     *
     * ‼️ EVERY AXIS IS A LIST, not a value. Filtering a backlog is almost never
     * "show me bugs" — it is "show me bugs and regressions, in these two areas,
     * that are not blocked". A single-select filter answers the first question
     * and none of the real ones, which is why this page had a filter and still
     * had no way to ask anything.
     *
     * ‼️ AND THE DROPDOWN AXES FOLLOW THE EXTENSION'S ONE FILTER SEMANTIC
     * (media/afFilters.js): `null` = the axis asks nothing and a value that
     * appears later is included without touching the picker · `[]` = an honest
     * empty result · a list = exactly that subset. So `states` can say "done AND
     * cancelled", which a <select> cannot: it can only ever say all, or exactly
     * one. Closed work is off by default because a backlog you have to scroll
     * past three months of finished items to read is one nobody opens — ticking
     * done brings it back, which is all the separate "show closed" box ever was.
     */
    const blFilterDefaults = () => ({
        areas: [], kinds: [], prios: [], efforts: [], q: '',
        /** null every state · any subset of open · doing · done · cancelled */
        states: ['open', 'doing'],
        /** null any · ['coded'] filed under an area · ['unfiled'] 📥 no code yet */
        filed: null,
        /** null any · ['yes'] waiting on something · ['no'] startable now */
        blocked: null,
        /** null any · ['container'] just the parents · ['leaf'] just the leaves */
        epics: null,
        /** null any · ['yes'] linked to a plan item · ['no'] not linked */
        plan: null,
        /** null any · ['yes'] has a 📅 · ['no'] none */
        due: null
    });
    let blFilter = blFilterDefaults();
    let blSort = 'file';
    let blDesc = false;
    let blFiltersOpen = false;
    /** The "how does this work" panel, opened from the ? in the doc bar. */
    let blHelpOpen = false;

    /**
     * THE TAB'S DROPDOWN AXES, in the shape every other page in this extension
     * already uses.
     *
     * ‼️ ONE CONTROL, EVERYWHERE. Search, Dashboard, Queue, Notices, Tasks and
     * the sessions table all filter with the checkbox dropdown from
     * media/afFilters.js — Select all / Clear over a list of ticks, any subset —
     * and this tab was the one exception, with plain <select>s that could say
     * "all" or "exactly one" and nothing in between. That is a different bargain
     * from the rest of the extension for no reason, and it left ordinary
     * questions unaskable: "done and cancelled", "everything that is not a
     * container". Declared once and read twice — the html draws them and wire()
     * wires them from this same list — so a new axis cannot reach one and be
     * forgotten in the other.
     *
     * `where` is which row it is drawn in: 'bar' is always on screen, 'panel'
     * lives behind ⚙ filters. Sorting is NOT here and should not be: an ordering
     * is genuinely one choice, and a picker offering three at once would be
     * promising something the list cannot do.
     */
    const BL_PICKS = [
        {
            id: 'bl-states', key: 'states', label: 'state', allLabel: 'every state',
            where: 'bar', width: 190,
            title: 'Which states are listed. Tick done and cancelled to bring closed work back.',
            options: [
                { v: 'open', t: 'open' }, { v: 'doing', t: 'doing' },
                { v: 'done', t: 'done' }, { v: 'cancelled', t: 'cancelled' }
            ]
        },
        {
            id: 'bl-filed', key: 'filed', label: 'filing', allLabel: 'any',
            where: 'bar', width: 190,
            title: '📥 — an item with no code has not been filed under an area yet, so it cannot be queued',
            options: [{ v: 'coded', t: 'filed — has a code' }, { v: 'unfiled', t: '📥 unfiled' }]
        },
        {
            id: 'bl-blocked', key: 'blocked', label: 'blocked', allLabel: 'any',
            where: 'panel', width: 200,
            title: '⛔ — is something it waits on still open',
            options: [{ v: 'no', t: 'startable now' }, { v: 'yes', t: 'waiting on something' }]
        },
        {
            id: 'bl-epics', key: 'epics', label: 'epics', allLabel: 'any',
            where: 'panel', width: 200,
            title: 'An item with children is a container — work lives at the leaves',
            options: [{ v: 'leaf', t: 'leaves only' }, { v: 'container', t: 'containers only' }]
        },
        {
            id: 'bl-plan', key: 'plan', label: 'plan', allLabel: 'any',
            where: 'panel', width: 200,
            title: '[plan:: 🆔] — which roadmap item it belongs to',
            options: [{ v: 'yes', t: 'linked to a plan item' }, { v: 'no', t: 'not linked' }]
        },
        {
            id: 'bl-due', key: 'due', label: 'due', allLabel: 'any',
            where: 'panel', width: 200,
            title: '📅 — a date on the line',
            options: [{ v: 'yes', t: 'has a date' }, { v: 'no', t: 'no date' }]
        }
    ];

    const blPicksIn = where => BL_PICKS.filter(p => p.where === where);
    const blPickHtml = where => blPicksIn(where).map(p => window.AFFilter.multi({
        id: p.id, label: p.label, allLabel: p.allLabel, options: p.options,
        selected: blFilter[p.key], title: p.title, width: p.width
    })).join('');
    /**
     * How many characters of an item are drawn before it is cut off.
     *
     * ‼️ There IS a default cut, and it is not timidity. Backlog items are where
     * a thought gets written down whole — some of the real ones in this very
     * project run to a thousand words — and a list where three rows fill the
     * screen is not a list. 0 means "never cut"; the control is one field away
     * and any single row opens with one click.
     */
    let blChars = 220;
    /** Rows opened past the cut, by key. Kept across repaints: closing an item
     *  you had opened to read, because the host pushed new data, is a small
     *  betrayal that happens constantly. */
    const blOpen = new Set();
    /** The row being edited, and the words as they stand in the box. */
    let blEdit = null;

    /**
     * ‼️ THE CAPTURE BOX'S CONTENTS SURVIVE EVERY REPAINT, AND THAT IS THE
     * WHOLE POINT OF THIS VARIABLE.
     *
     * This page rebuilds its entire HTML on every render — a host push, a
     * filter chip, a tab switch, a file that changed on disk. The box is part
     * of that HTML, so anything half-written in it went with the rebuild:
     * clicking a filter, or stepping into the next tab to remind yourself what
     * you meant, threw away a paragraph. A backlog item is exactly the place a
     * long thought gets written, so that was the most expensive thing the page
     * could lose.
     *
     * It is keyed by PROJECT because two projects' captures are two different
     * thoughts, and it is only emptied by an add the host confirmed — never by
     * a repaint, and never optimistically: a refusal that had already wiped the
     * box would lose the item for good.
     */
    let blCap = null;
    function blCapture() {
        const p = sel();
        const id = p ? p.id : '';
        if (!blCap || blCap.id !== id) {
            // `at` = the 1-based queue position picked beside Add ('' = none,
            // which is the default and means "wherever it would have gone").
            blCap = { id: id, text: '', area: '', type: '', prio: 'normal', effort: '', at: '', sending: false };
        }
        return blCap;
    }
    /** A row to scroll to and flash after the next paint — set by a click in the
     *  queue strip, consumed once. Cannot be done in the handler: the paint that
     *  draws the row it points at has not happened yet. */
    let blJump = '';

    const PRIO_ORDER = ['lowest', 'low', 'normal', 'medium', 'high', 'highest'];
    const PRIO_ICON = { highest: '🔺', high: '⏫', medium: '🔼', normal: '·', low: '🔽', lowest: '⏬' };
    const EFFORT_ORDER = ['', 'XS', 'S', 'M', 'L', 'XL'];

    /**
     * The canonical WORK TYPES.
     *
     * A backlog is sorted in somebody's head by four questions — is this a defect,
     * is it something to find out, is it new capability, is it how it looks — and
     * until each of those had exactly one name the filter could not offer them.
     * `research` is the one that had no name: work whose deliverable is an ANSWER
     * rather than a change, which used to be filed as a chore and disappear.
     *
     * ‼️ Canonical, not closed. Any other `#tag` on a line is still read, still
     * shown and still filterable — these are the ones the ROW CAN SET and the
     * filter offers by default, which is the whole difference between a tag
     * somebody may have typed and an axis you can rely on.
     */
    const BL_TYPES = [
        { id: 'bug', label: 'bug fix' },
        { id: 'research', label: 'research / measure' },
        { id: 'feat', label: 'development' },
        { id: 'ux', label: 'UI / UX' },
        { id: 'chore', label: 'chore' },
        { id: 'debt', label: 'tech debt' },
        { id: 'doc', label: 'docs' },
        { id: 'idea', label: 'idea' }
    ];
    const BL_TYPE_IDS = BL_TYPES.map(t => t.id);
    const blTypeLabel = id => (BL_TYPES.find(t => t.id === id) || {}).label || id;
    /** The item's work type: the first canonical tag it carries, or '' for none.
     *  Non-canonical tags are kept and shown; they just are not the axis. */
    const blTypeOf = i => (i.kinds || []).find(k => BL_TYPE_IDS.indexOf(k) >= 0) || '';
    /** The stable handle for a row across repaints. A code when there is one,
     *  else its line — the same rule the host's target resolution follows. */
    const blKey = i => i.code || ('L' + i.line);

    /**
     * THE ROW'S OPEN MENU — `{ kind, key }`, or null.
     *
     * ‼️ A CYCLE IS WRONG FOR A SET YOU CAN SEE ALL OF. Cycling was chosen because
     * a field that costs three clicks does not get kept true, and that reasoning
     * still holds for the CHEAP direction — but priority has six values and the
     * work type nine, so "one step per press" means up to eight presses to reach a
     * value that was on screen the whole time, and every intermediate press WRITES
     * THE USER'S FILE. A menu is one press to open and one to land, it shows what
     * the options are, and it writes once.
     *
     * Only one is open at a time, and it is identified by row + kind rather than
     * held on the element: the page repaints on every host push, and a menu tied
     * to a DOM node would vanish mid-choice.
     */
    let blMenu = null;

    const blMenuOpen = (kind, key) => !!blMenu && blMenu.kind === kind && blMenu.key === key;

    /**
     * One menu, drawn under the badge that opened it.
     *
     * Only the VALUE rides in the attribute. What to do with it is decided from
     * `blMenu.kind` in the handler — there is exactly one menu open at a time, so
     * a second copy of "which axis is this" on every item would be a second thing
     * to keep in step for no gain.
     *
     * ‼️ A SPAN, not a div, and that is load-bearing: a backlog row is one flat
     * div of spans and buttons, which is what lets the row be found by scanning to
     * its first `</div>` — in the DOM-stub test AND in the reader's head. A nested
     * div here would have broken the row boundary everything else relies on.
     */
    function blMenuHtml(kind, key, rows, current) {
        if (!blMenuOpen(kind, key)) { return ''; }
        return `<span class="pj-bl-menu">${rows.map(r =>
            `<button class="pj-bl-mi${r.value === current ? ' on' : ''}" data-blpick="${C.esc(r.value)}"
                ${r.title ? `title="${C.esc(r.title)}"` : ''}>
                <span class="pj-bl-mig">${r.glyph || ''}</span>${C.esc(r.label)}</button>`).join('')}</span>`;
    }

    const blPrioRows = () => PRIO_ORDER.slice().reverse().map(p => ({
        value: p, label: p, glyph: PRIO_ICON[p] === '·' ? '' : PRIO_ICON[p],
        title: p === 'normal' ? 'No priority icon on the line at all — which is what most lines should carry' : ''
    }));
    const blEffortRows = () => [{ value: '', label: 'not sized', glyph: '–', title: 'Clears the [effort:: …] field. Unsized is scored as M, never as XS.' }]
        .concat(EFFORT_ORDER.slice(1).map(e => ({
            value: e, label: e, glyph: '',
            title: { XS: '≈ five minutes', S: '≈ half an hour', M: '≈ half a day', L: '≈ a day', XL: 'should be split before anybody starts it' }[e] || ''
        })));
    const blTypeRows = () => [{ value: '', label: 'no type', glyph: '', title: 'Takes the canonical tag off. Your own tags are never touched.' }]
        .concat(BL_TYPES.map(t => ({ value: t.id, label: t.label, glyph: '#' + t.id })));
    const blAreaRows = areas => (areas || []).map(a => ({
        value: a.code, label: a.label, glyph: a.code,
        title: `${a.open} open of ${a.total} — it gets the next free ${a.code}- number, and that number is permanent`
    }));

    /**
     * WHERE THE NEW ITEM LANDS IN THE QUEUE — the little box left of Add.
     *
     * ‼️ THE PLACE IS PART OF THE THOUGHT. Writing something down and knowing
     * it is the next thing to do are one gesture; without this box they were
     * two, and the second one — find the row you just added, then nudge it up
     * past everything else — is expensive enough that it does not get done, so
     * the queue quietly stops meaning anything.
     *
     * The list is as long as the queue plus one, rebuilt on every paint: the
     * positions on offer are exactly the positions that exist. Touch nothing
     * and the item goes wherever it would have gone anyway — the box is an
     * option, never a field to fill in.
     *
     * ‼️ IT NEEDS AN AREA, and says so rather than failing quietly. The queue
     * holds CODES (see queueOrder in projectBacklog.ts) and a capture with no
     * area gets no code, so there is nothing to place — the box is disabled
     * until the area select next to it has a value.
     */
    function blAtHtml(cap, queueLen) {
        const n = Math.max(0, Number(queueLen) || 0);
        const off = !cap.area;
        const opts = ['<option value=""' + (cap.at ? '' : ' selected') + '>— # —</option>'];
        for (let i = 1; i <= n + 1; i++) {
            opts.push(`<option value="${i}"${String(i) === String(cap.at) ? ' selected' : ''}>${i}${i === 1 ? ' · top' : i === n + 1 ? ' · last' : ''}</option>`);
        }
        return `<select id="bl-at" class="pj-bl-atsel"${off ? ' disabled' : ''}
            title="${off
        ? 'Where in the queue it lands. Pick an area first — the queue holds codes, and a capture with no area has none yet (file it later with 🗂 and it queues then).'
        : `Where in the queue it lands: 1 puts it at the very top, ${n + 1} at the end. Leave it on — # — and it goes wherever a new item normally goes.`}">${opts.join('')}</select>`;
    }

    /**
     * The backlog tab.
     *
     * ‼️ THE ROW IS THE EDITOR. There is no dialog and no "edit" mode: the
     * priority badge cycles when you click it, the effort badge cycles when you
     * click it, the checkbox closes the item. Anything that takes three clicks
     * to change will not be kept up to date, and a backlog whose fields are
     * stale is worse than one with no fields at all — it sorts wrongly and
     * nobody knows it.
     */
    function backlogHtml() {
        const d = td().backlog;
        if (!d || d.state !== 'ok') { return docStateHtml(d, 'backlog document'); }
        const all = d.items || [];
        const areas = d.areas || [];
        const c = d.counts || {};
        // The startable queue, addressed the way rows are (code first, line for an
        // uncoded capture) — so an uncoded inbox item in the queue is marked on
        // its row too, which a code-only comparison silently never did.
        const nextList = d.next || [];
        // Both sides count lines the same way — 1-based, as the host sent them
        // (backlogOut adds the one, the `next` rows go through the same rule).
        const nextKeys = new Set(nextList.map(x => x.code || ('L' + x.line)));
        // THE ORDER, by code and by the place it holds. Every row reads its own
        // number out of this, and so does the default sort — the page never
        // works the order out for itself, because an order the host and the
        // panel each computed would be two orders.
        const queueAt = {};
        (d.queue || []).forEach((code, n) => { queueAt[code] = n + 1; });
        const blockedBy = {};
        for (const b of (d.blocked || [])) { if (b.code) { blockedBy[b.code] = b.waitingOn; } }

        const shown = all.filter(i => blPasses(i));
        const ordered = blOrder(shown, queueAt);

        // Every tag in the file, canonical ones first and in their own order, so
        // the filter row does not reshuffle itself as the backlog grows.
        const extra = [];
        for (const i of all) {
            for (const k of (i.kinds || [])) {
                if (BL_TYPE_IDS.indexOf(k) < 0 && extra.indexOf(k) < 0) { extra.push(k); }
            }
        }
        // The capture box's own contents, kept across the repaint this page does
        // constantly — including which axes were picked, so filing a run of
        // items into one area costs one choice rather than one per item.
        const cap = blCapture();
        const areaOpts = [`<option value=""${cap.area ? '' : ' selected'}>— area —</option>`]
            .concat(areas.map(a => `<option value="${C.esc(a.code)}"${a.code === cap.area ? ' selected' : ''}>${C.esc(a.code)} · ${C.esc(a.label)}</option>`))
            .join('');

        // The queue's two colour bands, worked out once here: the front, where an
        // agent asked for "the top five" stops, and the rest of what Next up
        // shows. A row must not have to know how long the strip is.
        const qTop = d.nextDefault || 5;
        const qRest = Math.max(qTop, nextList.length);
        const rows = ordered.map(i =>
            backlogRowHtml(i, nextKeys.has(blKey(i)), blockedBy[i.code], areas, queueAt[i.code] || 0,
                blBand(queueAt[i.code] || 0, qTop, qRest))).join('');
        const active = blActiveFilters();

        return `
        <div class="pj-docbar">
            <span><b>${c.open || 0}</b> open${c.doing ? ` · <b>${c.doing}</b> doing` : ''}
                · ${c.done || 0} done${c.unclassified ? ` · <b>${c.unclassified}</b> unfiled` : ''}</span>
            <span class="muted small">${C.esc(d.path)}</span>
            ${blHelpHtml(d)}
            <span class="grow"></span>
            <button class="secondary" data-act="blTidy"
                title="Put each area's items back in code order — K-1, K-2, K-3 — so the file reads as the dictionary it is. Your order is untouched: the queue names codes, and a code does not care which line it is on. A section with prose between its items is left alone and said so.">🧹 Tidy file order</button>
            <button class="secondary" data-act="blArchive"
                title="Move closed items under an archive heading at the end of the same file">🗄 Archive closed</button>
            ${openWithHtml(d.path)}
        </div>

        <div class="pj-card">
            <div class="pj-card-h">Capture</div>
            <div class="pj-bl-cap">
                <textarea id="bl-new" rows="4"
                    placeholder="what needs doing — no code needed, file it later&#10;&#10;Write as much as the thought needs; Ctrl+Enter adds it."
                    title="‼️ A backlog item is where a thought is written down WHOLE — the real ones here run to a paragraph, and a one-line box is an invitation to write less than you mean. What you write STAYS in the box: filters, tabs and a file that changed under you all repaint this page, and none of them take your words. Line breaks become spaces (the item is one markdown line). Ctrl+Enter adds it, Enter is just a newline.">${C.esc(cap.text)}</textarea>
                <div class="pj-bl-capf">
                    <select id="bl-area" title="Leave empty and it lands in the inbox, uncoded">${areaOpts}</select>
                    <select id="bl-type" title="Work type">
                        <option value=""${cap.type ? '' : ' selected'}>— type —</option>
                        ${BL_TYPES.map(t => `<option value="${t.id}"${t.id === cap.type ? ' selected' : ''}>${C.esc(t.label)}</option>`).join('')}
                    </select>
                    <select id="bl-prio" title="Priority">
                        ${PRIO_ORDER.slice().reverse().map(p =>
            `<option value="${p}"${p === (cap.prio || 'normal') ? ' selected' : ''}>${PRIO_ICON[p]} ${p}</option>`).join('')}
                    </select>
                    <select id="bl-effort" title="Effort">
                        ${EFFORT_ORDER.map(e => `<option value="${e}"${e === cap.effort ? ' selected' : ''}>${e || '— size —'}</option>`).join('')}
                    </select>
                    <span class="pj-bl-capr">
                        ${window.AFTextTools.html('bl', { wrap: 'span', className: 'tatools inline' })}
                        ${blAtHtml(cap, (d.queue || []).length)}
                        <button data-act="blAdd" class="pj-bl-addb" title="Ctrl+Enter in the box does the same">Add</button>
                    </span>
                </div>
            </div>
        </div>

        <div class="pj-chips-row">
            <button class="pj-chip${!blFilter.areas.length ? ' on' : ''}" data-blarea=""
                title="Every area. Areas add up rather than replace each other — click two and you see both">all areas</button>
            ${areas.map(a => `<button class="pj-chip${blFilter.areas.indexOf(a.code) >= 0 ? ' on' : ''}"
                data-blarea="${C.esc(a.code)}" title="${C.esc(a.label)} — ${a.open} open of ${a.total}">
                ${C.esc(a.code)} <span class="muted">${a.open}</span></button>`).join('')}
            <span class="grow"></span>
            <button class="pj-chip${blFiltersOpen ? ' on' : ''}" data-act="blFilters"
                title="Type, priority, size, blocked, epics, plan link, due date">⚙ filters${active ? ` (${active})` : ''}</button>
            ${active ? '<button class="pj-chip" data-act="blClear" title="Drop every filter and show the pile again">clear</button>' : ''}
        </div>

        ${blFiltersOpen ? `<div class="pj-bl-filters">
            <div class="pj-bl-fline">
                <span class="pj-bl-flab">type</span>
                ${BL_TYPES.map(t => `<button class="pj-chip${blFilter.kinds.indexOf(t.id) >= 0 ? ' on' : ''}"
                    data-blkind="${t.id}" title="${C.esc(t.label)}">#${t.id}</button>`).join('')}
                ${extra.map(k => `<button class="pj-chip own${blFilter.kinds.indexOf(k) >= 0 ? ' on' : ''}"
                    data-blkind="${C.esc(k)}" title="A tag of your own — it filters exactly like the canonical ones">#${C.esc(k)}</button>`).join('')}
                <button class="pj-chip${blFilter.kinds.indexOf('(none)') >= 0 ? ' on' : ''}" data-blkind="(none)"
                    title="Items carrying no type at all — the pile to classify">untyped</button>
                ${blRowClear('kinds', blFilter.kinds.length, 'work type')}
            </div>
            <div class="pj-bl-fline">
                <span class="pj-bl-flab">priority</span>
                ${PRIO_ORDER.slice().reverse().map(p => `<button class="pj-chip${blFilter.prios.indexOf(p) >= 0 ? ' on' : ''}"
                    data-blprio-f="${p}">${PRIO_ICON[p]} ${p}</button>`).join('')}
                ${blRowClear('prios', blFilter.prios.length, 'priority')}
            </div>
            <div class="pj-bl-fline">
                <span class="pj-bl-flab">size</span>
                ${EFFORT_ORDER.slice(1).map(e => `<button class="pj-chip${blFilter.efforts.indexOf(e) >= 0 ? ' on' : ''}"
                    data-bleffort-f="${e}">${e}</button>`).join('')}
                <button class="pj-chip${blFilter.efforts.indexOf('(none)') >= 0 ? ' on' : ''}" data-bleffort-f="(none)"
                    title="Never sized. These are scored as M, not as XS — an unestimated item floating to the top of a cheap-wins list is how a turn ends half done">unsized</button>
                ${blRowClear('efforts', blFilter.efforts.length, 'size')}
            </div>
            <div class="pj-bl-fline">
                <span class="pj-bl-flab">and</span>
                ${blPickHtml('panel')}
                ${blRowClear('and', blPicksIn('panel').filter(p => blFilter[p.key]).length, 'these four')}
            </div>
        </div>` : ''}

        <div class="pj-chips-row">
            <span class="pj-bl-qwrap">
                <input id="bl-q" class="pj-bl-q" placeholder="search text or code" value="${C.esc(blFilter.q)}">
                ${blFilter.q.trim() ? '<button class="pj-bl-qx" data-blclearf="q" title="Clear the search box only">✕</button>' : ''}
            </span>
            ${blPickHtml('bar')}
            <select id="bl-sort" title="Ordering. Queue order is your own — it is what 'do the top five' follows, and the only one you can drag rows in">
                <option value="file"${blSort === 'file' ? ' selected' : ''}>queue order (yours)</option>
                <option value="score"${blSort === 'score' ? ' selected' : ''}>score (priority ÷ effort)</option>
                <option value="priority"${blSort === 'priority' ? ' selected' : ''}>priority</option>
                <option value="effort"${blSort === 'effort' ? ' selected' : ''}>size</option>
                <option value="code"${blSort === 'code' ? ' selected' : ''}>code</option>
                <option value="state"${blSort === 'state' ? ' selected' : ''}>state</option>
                <option value="type"${blSort === 'type' ? ' selected' : ''}>work type</option>
                <option value="due"${blSort === 'due' ? ' selected' : ''}>due date</option>
                <option value="text"${blSort === 'text' ? ' selected' : ''}>alphabetical</option>
            </select>
            <button class="pj-bl-badge" data-act="blDir"
                title="${blDesc ? 'Descending — click for ascending' : 'Ascending — click for descending'}">${blDesc ? '↓' : '↑'}</button>
            <label class="pj-chk" title="How much of a long item is drawn before it is cut. 0 draws all of it. Resting on 'more' shows the whole item without opening the row.">
                cut at <input id="bl-chars" type="number" min="0" max="4000" step="20" value="${blChars}" style="width:66px"> chars</label>
            <span class="grow"></span>
            <span class="muted small pj-bl-count${ordered.length < all.length ? ' narrowed' : ''}">${ordered.length} of ${all.length}</span>
        </div>

        ${nextQueueHtml(nextList, all, d.nextDefault || 5, d.queue || [], d.staleQueue || [])}

        ${rows || '<p class="muted small">Nothing matches. The file is <code>' + C.esc(d.path) + '</code> — edit it in Obsidian any time; this page reads whatever is there.</p>'}`;
    }

    /**
     * ‼️ THE TAB EXPLAINS ITSELF FROM A ? , NOT FROM A WALL AT THE BOTTOM.
     *
     * All of this was one long grey paragraph under the last row: the biggest
     * single thing on the tab, in the one place nobody looks, on screen for ever
     * whether or not anybody had a question — and the list it belonged to ended
     * in it, which is an ugly way for a list to end. The words earn their place
     * (the queue is genuinely not obvious, and what gets written to somebody's
     * file is worth stating), so they are kept whole and moved behind a mark the
     * size of a full stop, next to the counts they are about.
     *
     * It opens IN the page, under the ? itself: no navigation, no second panel,
     * nothing to come back from. A question asked here is answered here.
     */
    function blHelpHtml(d) {
        if (!blHelpOpen) {
            return `<span class="pj-helpw"><button class="pj-help" data-blhelp
                title="How this tab works — the queue, the codes, and exactly what gets written to your file">?</button></span>`;
        }
        return `<span class="pj-helpw">
            <button class="pj-help on" data-blhelp title="Close">?</button>
            <span class="pj-helppop" data-blhelppop>
                <span class="pj-helpp"><b>There is one order, and it is the queue.</b> The number on the
                    left of a row is its place in it. ▲ and ▼ move it one place; <b>rest the pointer on
                    either and a menu offers 2, 3, 4, 5, 10, 15, 20 — or the very top and bottom of the
                    whole list</b>. Dragging a row by that number, or a chip in <b>Next up</b>, does the
                    same thing. Areas never hold an item back: any code can sit anywhere.</span>
                <span class="pj-helpp"><b>The order lives in your file, not in here.</b> It is the
                    <code>## 🎯 Queue</code> block at the top of the document, so it is still there with no
                    extension running, and <code>projects.backlog.next</code> reads exactly it.
                    <b>The area sections below it are the dictionary, not the order</b> — what exists,
                    grouped, each area in its own code order, which is what 🧹 restores. Moving something
                    in the queue does not touch one byte of those lines.</span>
                <span class="pj-helpp"><b>A code is permanent through all of it:</b> <code>P-5.3</code>
                    means the same item for ever. <b>Clicking a code opens the file at that item's line</b>
                    (↗ does the same) in whatever you chose under Settings → Open with; the button at the
                    top of this tab opens the whole document.</span>
                <span class="pj-helpp"><b>The row is the editor.</b> A badge opens a menu; 🗂 files an
                    uncoded item under an area, which is also what puts it in the queue; ✎ edits the words
                    in place. Resting on <b>more</b> shows the whole item without opening the row. Closing a
                    box changes exactly one character of your file and adds no ✅ date — Agent Farm does not
                    write metadata it does not own.</span>
                <span class="pj-helpp muted">Everything above happens in
                    <code>${C.esc(d.path)}</code>.</span>
            </span>
        </span>`;
    }

    /**
     * THE QUEUE STRIP — the startable items in the order they will be worked,
     * and the one place that order can be changed without reading the file.
     *
     * ‼️ WHAT THE ORDER ACTUALLY IS, because this is the thing the page exists
     * to make sayable. A backlog file is grouped under area headings, so LINE
     * order is a segmented order: every K item comes before every S item, for
     * ever, because a line cannot cross a heading without re-filing the item.
     * That made "do X-5 next" impossible to say — not a missing button, a
     * missing order. So the order lives in the file's own `## 🎯 Queue` block
     * instead, as ONE list holding everything, shuffled however the user wants
     * it. A chip dragged anywhere lands there; nothing else is disturbed.
     *
     * Three other things it does that a list of codes did not:
     *
     *   * it is LONG ENOUGH TO BE AN ORDER. Four codes answer "what is next";
     *     fourteen answer "what is the order", which is the question you have
     *     when you want to change it. Where the op's default five would have
     *     stopped is marked, because the strip must not quietly promise an agent
     *     takes fourteen.
     *   * every entry OPENS. Click jumps to that row in the list below and
     *     flashes it; hover gives the first 600 characters, which is the whole
     *     point of a code — you cannot recognise K-6 from three letters.
     *   * an entry with no code cannot be ordered, and says so rather than
     *     failing: an entry has to mean the same item after the file is edited,
     *     and only a code does.
     */
    const BL_NEXT_TIP = 620;

    function nextQueueHtml(list, all, cut, queue, stale) {
        if (!list.length) { return ''; }
        const byKey = new Map(all.map(i => [blKey(i), i]));
        const at = {};
        queue.forEach((code, n) => { at[code] = n + 1; });
        const chips = list.map((x, n) => {
            const key = x.code || ('L' + x.line);
            const i = byKey.get(key) || {};
            const words = String(i.text || '');
            const tip = [
                `#${n + 1} in your queue${n + 1 > cut ? ' — beyond the default ' + cut : ''}`,
                i.section ? `under ${i.section}` : '',
                i.effort ? `size ${i.effort}` : 'not sized',
                i.priority && i.priority !== 'normal' ? `priority ${i.priority}` : '',
                '',
                words.length > BL_NEXT_TIP ? words.slice(0, BL_NEXT_TIP) + '…' : (words || '(empty)'),
                '',
                x.code
                    ? 'Click to jump to it below · drag it anywhere in the strip'
                    : 'Click to jump to it below · it needs a code before it can be queued (🗂 on its row)'
            ].filter(s => s).join('\n');
            // The cut mark goes BEFORE the entry that falls past it, so it reads
            // as a line drawn across the queue rather than a badge on an item.
            const mark = (n === cut && list.length > cut)
                ? `<span class="pj-bl-nextcut" title="An agent that just says &quot;do the top five&quot; stops here — projects.backlog.next defaults to ${cut}. Everything to the right is still your queue.">┊</span>`
                : '';
            return mark + `<span class="pj-bl-nextw"><button class="pj-bl-nextb${n >= cut ? ' past' : ''}"
                draggable="true"
                data-blnext="${C.esc(key)}" data-code="${C.esc(x.code || '')}" data-line="${x.line}"
                data-at="${n}" title="${C.esc(tip)}">
                <span class="pj-bl-nextn">${n + 1}</span>
                <span class="pj-bl-code">${C.esc(x.code || '📥')}</span>
                ${i.effort ? `<span class="pj-bl-nexte">${C.esc(i.effort)}</span>` : ''}
            </button></span>`;
        }).join('');
        // An entry whose item was closed or deleted in Obsidian is reported
        // rather than swept up: the block is the user's own list, and a program
        // that prunes it quietly loses their ordering without saying so.
        const staleNote = stale.length
            ? `<span class="pj-bl-stale" title="These are in the 🎯 Queue block but are closed, gone, or have grown children. They are not handed to anybody, and the next reorder drops them.">⚠ ${C.esc(stale.join(' '))}</span>`
            : '';
        // ‼️ A HEADING IS A LABEL, NOT A MANUAL. Three lines of prose beside the
        // word "Next up" said what the strip is, how to click it, how to drag it
        // and which op reads it — every time, to somebody who had already read it
        // a hundred times. The line states the two facts that CHANGE (how many
        // are queued, how many an agent takes) and the standing explanation moves
        // into the hover, which is exactly what a hover is for.
        const hint = 'The front of your queue, in the order it will be worked.\n\n'
            + 'Click an entry to find its row in the list below · drag one anywhere to reorder.\n'
            + `projects.backlog.next reads exactly this list and takes the first ${cut} unless it is `
            + 'asked for more; the ┊ marks where that stops. Everything past it is still your queue.';
        return `<div class="pj-card pj-bl-next">
            <div class="pj-card-h">Next up
                <span class="pj-bl-nexthint" title="${C.esc(hint)}">${list.length} queued
                    · agents take ${cut} ⓘ</span>
                ${staleNote}
            </div>
            <div class="pj-bl-nextrow" id="bl-nextrow">${chips}</div>
        </div>`;
    }

    /**
     * Which colour band a queue position falls in.
     *
     * ‼️ THE POSITION IS THE ONE THING ON THIS PAGE THAT IS A RANK rather than a
     * fact about the item, so it is the one thing that gets a colour — and it
     * gets the SAME colour in the strip and on the row's handle, because it is
     * the same number. Green is already the queue's colour here (a queued row
     * wears it on its left edge, which is the bracket down the list). Inside the
     * op's default it is at full strength; across the rest of the strip the same
     * hue, half lit. Past the strip there is no colour at all: those items are
     * not waiting their turn, they are simply also in the file.
     */
    const blBand = (at, top, rest) =>
        (!at ? '' : (at <= top ? ' q-top' : (at <= rest ? ' q-rest' : '')));

    /**
     * One axis's own clear.
     *
     * ‼️ Drawn only when that axis is actually narrowing something. The global
     * `clear` answers "show me the pile again"; this answers the far commoner
     * "the priorities were the wrong question, keep the rest" — which otherwise
     * costs a click per chip you had switched on, or a clear that throws away the
     * three axes you meant to keep. An always-present ✕ on four rows is four
     * pieces of furniture saying nothing, so absence IS the state.
     */
    function blRowClear(axis, count, what) {
        if (!count) { return ''; }
        return `<button class="pj-chip clearf" data-blclearf="${axis}"
            title="Clear the ${C.esc(what)} filter only (${count} on) — the other rows stay as they are">✕</button>`;
    }

    /** How many axes are narrowing the list right now — the number on the chip,
     *  because a filter you have forgotten you set is indistinguishable from a
     *  backlog that has lost your items. */
    function blActiveFilters() {
        const dflt = blFilterDefaults();
        // A picker is narrowing the list when it is not where it started — which
        // for `states` is "open + doing", not null. Comparing against the
        // defaults rather than against null is what keeps the count honest for
        // an axis whose resting position is already a subset.
        const same = (a, b) => (a === null || b === null)
            ? a === b
            : a.length === b.length && a.every(v => b.indexOf(v) >= 0);
        return blFilter.areas.length + blFilter.kinds.length + blFilter.prios.length
            + blFilter.efforts.length
            + BL_PICKS.filter(p => !same(blFilter[p.key], dflt[p.key])).length
            + (blFilter.q.trim() ? 1 : 0);
    }

    /** Does this item survive every axis? Each list is an OR within itself and an
     *  AND against the others, which is what people mean by "bugs and regressions
     *  in P and K that are not blocked".
     *
     *  ‼️ A dropdown axis that is `null` asks nothing at all — see
     *  blFilterDefaults. An EMPTY list is not the same thing: it means "none of
     *  them", it is what Clear leaves behind, and it must honestly return
     *  nothing rather than quietly behaving like "all". */
    function blPasses(i) {
        const q = blFilter.q.trim().toLowerCase();
        const on = (axis, value) => !axis || axis.indexOf(value) >= 0;
        if (!on(blFilter.states, i.state)) { return false; }
        if (!on(blFilter.filed, i.code ? 'coded' : 'unfiled')) { return false; }
        if (blFilter.areas.length && blFilter.areas.indexOf(i.area) < 0) { return false; }
        if (blFilter.kinds.length) {
            const kinds = i.kinds || [];
            const hit = blFilter.kinds.some(k => k === '(none)' ? !kinds.length : kinds.indexOf(k) >= 0);
            if (!hit) { return false; }
        }
        if (blFilter.prios.length && blFilter.prios.indexOf(i.priority || 'normal') < 0) { return false; }
        if (blFilter.efforts.length) {
            const e = i.effort || '(none)';
            if (blFilter.efforts.indexOf(e) < 0) { return false; }
        }
        if (!on(blFilter.blocked, (i.blockedBy || []).length ? 'yes' : 'no')) { return false; }
        if (!on(blFilter.epics, i.container ? 'container' : 'leaf')) { return false; }
        if (!on(blFilter.plan, i.plan ? 'yes' : 'no')) { return false; }
        if (!on(blFilter.due, i.due ? 'yes' : 'no')) { return false; }
        if (q && (i.text || '').toLowerCase().indexOf(q) < 0
            && (i.code || '').toLowerCase().indexOf(q) < 0) { return false; }
        return true;
    }

    /** `P-2` before `P-10`, `P-5` before `P-5.1` — the way a person reads them,
     *  which string comparison does not. */
    function blCompareCodes(a, b) {
        const pa = /^([A-Z]{1,2})-(\d+(?:\.\d+)*)$/.exec(a || '');
        const pb = /^([A-Z]{1,2})-(\d+(?:\.\d+)*)$/.exec(b || '');
        if (!pa || !pb) { return String(a || '').localeCompare(String(b || '')); }
        if (pa[1] !== pb[1]) { return pa[1].localeCompare(pb[1]); }
        const na = pa[2].split('.').map(Number), nb = pb[2].split('.').map(Number);
        for (let n = 0; n < Math.max(na.length, nb.length); n++) {
            const d = (na[n] === undefined ? -1 : na[n]) - (nb[n] === undefined ? -1 : nb[n]);
            if (d) { return d; }
        }
        return 0;
    }

    const BL_STATE_ORDER = ['doing', 'open', 'done', 'cancelled'];

    /**
     * Order the visible rows.
     *
     * ‼️ THE QUEUE IS THE DEFAULT and stays that way. It IS the user's
     * prioritisation — it is what `backlog.next` reads and what "do the top
     * five" means — so a clever sort that quietly overruled it would make
     * dragging pointless. Every other ordering here is a way of LOOKING at the
     * pile, never of changing it.
     *
     * Rows that cannot be in the queue (closed, containers, uncoded captures)
     * come after it, in file order: they are not waiting their turn, they are
     * simply also in the file.
     */
    function blOrder(list, at) {
        const dir = blDesc ? -1 : 1;
        if (blSort === 'file') {
            const rank = i => (i.code && at[i.code]) || (1e6 + i.line);
            const out = list.slice().sort((a, b) => rank(a) - rank(b));
            return blDesc ? out.reverse() : out;
        }
        const by = {
            score: (a, b) => (b.score - a.score),
            priority: (a, b) => PRIO_ORDER.indexOf(b.priority) - PRIO_ORDER.indexOf(a.priority),
            // Smallest first: "what can I finish now" is the question size is asked
            // for. Unsized sorts last rather than first, for the same reason it is
            // scored as M — an unknown is not a cheap win.
            effort: (a, b) => (EFFORT_ORDER.indexOf(a.effort || '') || 99) - (EFFORT_ORDER.indexOf(b.effort || '') || 99),
            code: (a, b) => blCompareCodes(a.code, b.code),
            state: (a, b) => BL_STATE_ORDER.indexOf(a.state) - BL_STATE_ORDER.indexOf(b.state),
            type: (a, b) => {
                const ia = BL_TYPE_IDS.indexOf(blTypeOf(a)), ib = BL_TYPE_IDS.indexOf(blTypeOf(b));
                return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
            },
            // No date sorts last in either direction: an item with no deadline is
            // not "due first", and flipping the arrow should not make it look so.
            due: (a, b) => (a.due || '9999').localeCompare(b.due || '9999'),
            text: (a, b) => String(a.text || '').localeCompare(String(b.text || ''))
        }[blSort];
        if (!by) { return list; }
        // Line order breaks every tie, so a sort never scrambles equals.
        return list.slice().sort((a, b) => (by(a, b) * dir) || (a.line - b.line));
    }

    /** One row. `data-code` is the handle whenever the item has one; the line
     *  number only rides along for an uncoded capture, because a line goes stale
     *  the moment the file is edited in Obsidian under an open panel.
     *
     *  ‼️ `data-line` is 1-BASED, exactly as the host sent it. It is handed back
     *  unchanged and the panel converts once, at its own boundary. */
    /**
     * What a backlog row publishes to its right-click menu.
     *
     * ‼️ The keys are what the MENU can ask about, so they are the row's state
     * and not its looks: `afQueued` decides whether "Move in the queue" is drawn
     * at all, `afCoded` whether "File it under an area…" is. The identity is the
     * same pair the buttons send (code first, line only for an uncoded capture)
     * — a menu that addressed a row differently from the button beside it would
     * eventually act on a different item.
     */
    function blCtx(i, key, queueAt) {
        // ‼️ THE WORDS ARE NOT IN HERE. These items run to paragraphs and this
        // attribute is written into every row on the page — carrying the text
        // would put the whole backlog into the markup a second time. The key is
        // enough: the handler looks the item up in the data it already holds.
        return window.AFCtx.row('afBacklogRow', {
            key: key, code: i.code || '', line: i.line,
            afCoded: !!i.code, afQueued: !!queueAt, afState: i.state || 'open'
        });
    }

    function backlogRowHtml(i, isNext, waitingOn, areas, queueAt, band) {
        const key = blKey(i);
        const closed = i.state === 'done' || i.state === 'cancelled';
        const doing = i.state === 'doing';
        const cls = ['pj-bl-row'];
        if (closed) { cls.push('closed'); }
        if (doing) { cls.push('doing'); }
        if (isNext) { cls.push('next'); }
        if (i.container) { cls.push('container'); }
        const type = blTypeOf(i);
        // The canonical type is one settable badge; anything else the user tagged
        // rides along beside it, read-only, because it is theirs.
        const others = (i.kinds || []).filter(k => k !== type)
            .map(k => `<span class="pj-bl-kind" title="Your own tag — it filters, but the type badge only sets the canonical set">#${C.esc(k)}</span>`);
        const full = i.text || '(empty)';
        const open = blOpen.has(key);
        const cut = blChars > 0 && full.length > blChars && !open;
        const body = cut ? full.slice(0, blChars).replace(/\s+\S*$/, '') + '…' : full;
        const dragging = blSort === 'file';

        if (blEdit && blEdit.key === key) {
            return `<div class="${cls.join(' ')}" style="padding-left:${6 + (i.depth || 0) * 10}px"
                data-blrow data-code="${C.esc(i.code || '')}" data-line="${i.line}"
                data-prio="${C.esc(i.priority || 'normal')}" data-effort="${C.esc(i.effort || '')}">
                <span class="pj-bl-code">${C.esc(i.code || '📥')}</span>
                <span class="pj-bl-edit">
                    <textarea id="bl-edit" rows="${Math.min(8, Math.ceil(blEdit.text.length / 90) + 1)}"
                        title="Only the WORDS are edited here — the code, tags, priority, size and every icon on the line stay exactly where they are. Ctrl+Enter saves, Esc cancels.">${C.esc(blEdit.text)}</textarea>
                    <button data-blsave>${blEdit.saving ? 'Saving…' : 'Save'}</button>
                    <button class="secondary" data-blcancel>Cancel</button>
                </span>
            </div>`;
        }

        // ‼️ THE CODE IS THE LINK TO THE LINE ITSELF. Nothing else on the row is
        // both unique and already the item's identity, and a separate "open"
        // glyph on two hundred rows is two hundred pieces of furniture. The
        // hover says so, and the row actions carry the same thing spelled out
        // (↗) for anyone who never hovers a code.
        // Built unescaped and escaped once at each use site — escaping twice is
        // how &amp; ends up in a tooltip.
        const openTip = `Open the file AT THIS LINE (line ${i.line}) in ${blOpenModeName()}`
            + ' — the whole document is the Open button at the top'
            + ` · ${window.AFCtx.HINT}: state, priority, size, type, queue position`;
        // The handle carries the row's place in the queue. Off means there is no
        // place to carry: an uncoded capture cannot be in the queue, and a
        // closed item or a container is not work waiting to be done.
        const gripTip = queueAt
            ? (dragging
                ? `#${queueAt} in the queue. Drag it anywhere — areas do not hold it, and its code, line and section do not change.`
                : `#${queueAt} in the queue. Dragging needs the list in queue order; the other sorts are ways of LOOKING, not of changing.`)
            : (i.code
                ? 'Not in the queue — a closed item or a container is not work waiting.'
                : 'Not in the queue — file it with 🗂 first; only a code survives the file being edited.');

        return `<div class="${cls.join(' ')}" style="padding-left:${6 + (i.depth || 0) * 10}px"
            data-blrow data-key="${C.esc(key)}" data-code="${C.esc(i.code || '')}" data-line="${i.line}"
            data-prio="${C.esc(i.priority || 'normal')}" data-effort="${C.esc(i.effort || '')}"
            data-type="${C.esc(type)}" data-section="${C.esc(i.section || '')}" data-depth="${i.depth || 0}"
            ${blCtx(i, key, queueAt)}>
            <span class="pj-bl-grip${queueAt && dragging ? '' : ' off'}${band || ''}"
                ${queueAt && dragging ? 'draggable="true"' : ''} data-blgrip
                title="${C.esc(gripTip)}">${queueAt || '⠿'}</span>
            <input type="checkbox" data-blcheck ${i.state === 'done' ? 'checked' : ''}
                title="${i.state === 'done' ? 'Reopen' : 'Close as done'}">
            ${i.code
                ? `<code class="pj-bl-code open" data-blgo title="${C.esc(i.code + ' — permanent, quote it at an agent. ' + openTip)}">${C.esc(i.code)}</code>`
                : `<span class="pj-bl-code unfiled open" data-blgo title="${C.esc('No code yet. ' + openTip)}">📥</span>`}
            <span class="pj-bl-t">${C.esc(body)}${cut
                ? blMoreHtml(i, full)
                : (open && blChars > 0 && full.length > blChars ? ' <button class="pj-bl-more" data-blmore>less</button>' : '')}</span>
            <span class="pj-bl-side">
                <span class="pj-bl-srow">
                    ${!i.code ? `<span class="pj-bl-mw"><button class="pj-bl-badge filed" data-blfile
                        title="Not filed — no code, no area. Pick one and it gets the next free number in it, permanently, and it joins the queue.">🗂</button>
                        ${blMenuHtml('area', key, blAreaRows(areas), '')}</span>` : ''}
                    <span class="pj-bl-mw"><button class="pj-bl-kind settable${type ? ' t-' + C.esc(type) : ' none'}" data-bltype
                        title="Work type — ${type ? C.esc(blTypeLabel(type)) : 'not set'}. Pick one; your own tags are left alone.">${type ? '#' + C.esc(type) : 'type?'}</button>
                        ${blMenuHtml('type', key, blTypeRows(), type)}</span>
                    ${others.join('')}
                    <span class="pj-bl-mw"><button class="pj-bl-badge" data-blprio
                        title="Priority — ${C.esc(i.priority || 'normal')}. Click to pick.">${PRIO_ICON[i.priority] || '·'}</button>
                        ${blMenuHtml('prio', key, blPrioRows(), i.priority || 'normal')}</span>
                    <span class="pj-bl-mw"><button class="pj-bl-badge" data-bleffort
                        title="Size — ${C.esc(i.effort || 'not sized')}. Click to pick.">${C.esc(i.effort || '–')}</button>
                        ${blMenuHtml('effort', key, blEffortRows(), i.effort || '')}</span>
                    ${doing ? `<span class="pj-bl-m started" title="${C.esc(
                    'Started — the line in your file is [/] instead of [ ], which is what Obsidian\'s Tasks '
                    + 'plugin draws as in-progress, and the moment you pressed it is a row in Backloglog. '
                    + 'It is still live work: agents are still handed it. ▶ again puts it back to open.')}">▶ started</span>` : ''}
                    ${i.due ? `<span class="pj-bl-m" title="due">📅 ${C.esc(i.due)}</span>` : ''}
                    ${i.plan ? `<span class="pj-bl-m" title="plan item">🆔 ${C.esc(i.plan)}</span>` : ''}
                    ${waitingOn && waitingOn.length
                ? `<span class="pj-bl-m blocked" title="Waiting on ${C.esc(waitingOn.join(', '))}">⛔ ${C.esc(waitingOn.join(' '))}</span>` : ''}
                    ${i.warn ? `<span class="pj-bl-m warn" title="${C.esc(i.warn)}">⚠</span>` : ''}
                    <button class="pj-bl-act" data-blgo title="${C.esc(openTip)}">↗</button>
                    <button class="pj-bl-act" data-bledit title="Edit the words — the code and every axis stay put">✎</button>
                </span>
                <span class="pj-bl-srow">
                    ${/* ‼️ A SWITCH, NOT A ONE-WAY DOOR — and it says which way it is
                          pointing. It used to send `doing` whatever the row already
                          was, so pressing it on something already started asked the
                          host to make no change and got none: a button that had
                          worked once and looked broken for ever after. */''}
                    <button class="pj-bl-act${doing ? ' on' : ''}" data-blstate="${doing ? 'open' : 'doing'}"
                        title="${C.esc(doing
                    ? 'Started. Press to put it back to open — the [/] in your file goes back to [ ].'
                    : 'Start it — writes [/] on the line instead of [ ], marks the row, and puts the '
                    + 'moment in Backloglog. It stays live work, and ▶ again undoes it.')}">▶</button>
                    <button class="pj-bl-act" data-blstate="cancelled" title="Cancel — it stays in the file, with its code spent">✕</button>
                    ${queueAt ? blStepHtml('up', queueAt) + blStepHtml('down', queueAt) : ''}
                </span>
            </span>
        </div>`;
    }

    /**
     * "more", and the whole item hanging under it.
     *
     * ‼️ A HOVER HAS TO BE WORTH HOVERING. This used to be the native `title` on
     * the text span, which produced a grey box that repeated the two hundred
     * characters already drawn on the row and then stopped wherever the platform
     * felt like stopping — a feature that cost a tooltip and told you nothing.
     * This is the item WHOLE, in a box as wide as the text column and as tall as
     * it needs up to a limit, and it SCROLLS past that: for all but the enormous
     * ones, resting on `more` is now the same as opening the row, without
     * disturbing the list you are reading.
     *
     * ‼️ The :hover lives on the WRAPPER, not on the button. The pointer has to
     * be able to travel into the box — a tooltip that closes when you reach for
     * it cannot be scrolled, and scrolling is the whole point.
     *
     * Spans only, no div: a backlog row is one flat div, which is what lets the
     * row be found by scanning to its first `</div>` — in the DOM-stub test and
     * in the reader's head alike.
     */
    function blMoreHtml(i, full) {
        return ` <span class="pj-bl-tw"><button class="pj-bl-more" data-blmore>more</button>`
            + `<span class="pj-bl-tip"><span class="pj-bl-tiph">${C.esc(i.code || '📥')}`
            + ` · ${full.length} characters — scroll here, or press <b>more</b> to keep it open`
            + `</span><span class="pj-bl-tipb">${C.esc(full)}</span></span></span>`;
    }

    /** How far the step menu offers to jump. Small numbers because most moves
     *  are small, then the two that skip a screenful — and then the end, which
     *  is the one thing a queue must always be able to reach. */
    const BL_STEPS = [2, 3, 4, 5, 10, 15, 20];

    /**
     * ▲ or ▼ — one button that is also a menu.
     *
     * ‼️ THE BUTTON ITSELF STAYS A BUTTON. Clicking it moves one place, exactly
     * as it always did; the menu is what appears if the pointer RESTS there, and
     * it offers the same move in larger amounts. That is the whole reason there
     * is no second button for "a lot": the common act keeps its single click and
     * the rare one stops being eleven of them.
     */
    function blStepHtml(dir, at) {
        const up = dir === 'up';
        const glyph = up ? '▲' : '▼';
        const end = up ? 'top' : 'bottom';
        const rows = BL_STEPS.map(n =>
            `<button data-blmove="${dir}" data-blby="${n}"
                title="${up ? 'Up' : 'Down'} ${n} places in the queue">
                <b>${n}</b>${glyph}</button>`).join('')
            + `<button class="end" data-blmove="${end}"
                title="All the way to the ${end} of the WHOLE queue — every area, not just this one">
                <b>${up ? '⤒' : '⤓'}</b>${end}</button>`;
        return `<span class="pj-bl-step${up ? ' move' : ''}">
            <button class="pj-bl-act" data-blmove="${dir}" data-blby="1"
                title="${up ? 'Up' : 'Down'} one place in the queue (now #${at}). Rest on it for bigger jumps.">${glyph}</button>
            <span class="pj-bl-steps">${rows}</span>
        </span>`;
    }

    /** What the user's chosen open mode is called, for the row tooltips. The
     *  page is told the modes for the split button anyway; naming the one that
     *  will actually happen is the difference between "it opens somewhere" and
     *  knowing whether to expect Obsidian. */
    function blOpenModeName() {
        const cfg = DATA.docOpen || {};
        return (cfg.labels && cfg.labels[cfg.mode]) || cfg.mode || 'your editor';
    }

    // -----------------------------------------------------------------------
    // the track — a code, and the turns it was worked in
    // -----------------------------------------------------------------------

    /**
     * ‼️ A SKETCH, ON PURPOSE, AND THE COMMENT IS PART OF THE DELIVERY.
     *
     * The record this reads lives in two files that work with no extension
     * running — `Backloglog.md` and the ledger beside it — so nothing here is
     * load-bearing. What it is for is to show what the surface can BE: a project's
     * whole history of work, filterable, with every turn a door into the
     * transcript where it happened. Only that last part is built, because only
     * that part had no substitute. Filters, ordering, a search across projects and
     * a table view are a later job, and pretending at them with dead controls
     * would be worse than leaving them out.
     */
    function trackHtml() {
        const d = td().track;
        if (!d || d.state !== 'ok') { return docStateHtml(d, 'backlog log'); }
        const rows = d.rows || [];
        if (!rows.length) {
            return `<p class="muted">Nothing tracked yet. From the moment an item is closed —
                from this page, or by an agent through <code>projects.backlog.check</code> —
                the session and the turn it happened in are recorded here and written into
                <code>${C.esc(d.path || 'Backloglog.md')}</code>.</p>`;
        }
        const body = rows.map(r => {
            const sessions = (r.sessions || []).map(s => {
                const turns = (s.turns || []).map(t =>
                    `<button class="pj-trk-turn" data-trackturn="${C.esc(s.file)}" data-trackts="${t.ts}"
                        title="Open this session's transcript at turn ${t.n}">#${t.n}</button>`).join('');
                // The run IS a session, so it gets the session menu every other
                // surface gives one — the point of the shared contract.
                return `<div class="pj-trk-run"
                    ${window.AFSessionCtx.row({ sessionId: s.session, file: s.file, agentName: s.agent })}>
                    <code class="pj-trk-sid" title="${C.esc(s.session)} — ${window.AFSessionCtx.HINT}">${C.esc(s.short)}</code>
                    ${turns || '<span class="muted small">no turn recorded</span>'}
                    <span class="muted small">${C.esc(s.agent || '?')}</span>
                    ${s.uncertain ? `<span class="pj-trk-doubt" title="The attribution is a best effort: ${C.esc(s.uncertain)}">${C.esc(s.uncertain)}</span>` : ''}
                    <span class="muted small">${C.esc((s.events || []).join(' · '))}</span>
                </div>`;
            }).join('');
            return `<div class="pj-trk-item">
                <div class="pj-trk-head">
                    <b>${C.esc(r.code)}</b>
                    <span class="pj-trk-state">${C.esc(r.state || '—')}</span>
                    <span class="pj-trk-words">${C.esc(r.text || '')}</span>
                    ${r.stamp ? `<code class="pj-trk-stamp" title="Where it was closed — the same stamp is on the backlog line">${C.esc(r.stamp)}</code>` : ''}
                </div>
                ${sessions}
                ${r.note ? `<div class="pj-trk-note">${C.esc(r.note)}</div>` : ''}
            </div>`;
        }).join('');
        return `<div class="pj-trk">
            <div class="pj-trk-bar muted small">
                ${rows.length} tracked · ${d.events} events ·
                <code>${C.esc(d.path || '—')}</code> ·
                ledger <code>${C.esc(d.ledger)}</code>
            </div>
            ${body}
        </div>`;
    }

    /**
     * The folder, and one document out of it.
     *
     * The pane shows the file as it is on disk rather than a rendering of it.
     * That is deliberate: the rendered views the user already has (VS Code's
     * markdown preview, Obsidian itself) are one button away and are the real
     * thing, and a third half-renderer here would be a third markdown dialect
     * to keep in step with the other two.
     */
    function docsHtml() {
        const d = td().docs;
        if (!d || d.state !== 'ok') { return docStateHtml(d, 'documents folder'); }
        const entries = d.entries || [];
        const tree = entries.map(e => {
            const depth = e.path.split('/').length - 1;
            const on = !e.dir && d.selected && d.selected.path === e.path;
            const glyph = e.dir ? '📁' : (e.role ? '◆' : '·');
            return `<div class="pj-doc-row${on ? ' on' : ''}${e.dir ? ' dir' : ''}"
                    style="padding-left:${6 + depth * 14}px"
                    ${e.dir ? '' : `data-doc="${C.esc(e.path)}"`}
                    ${e.dir ? '' : window.AFCtx.row('afDocRow', { path: e.path })}
                    title="${C.esc(e.path)}${e.managed ? ' — generated by Agent Farm' : ''}${e.dir ? '' : ' — ' + window.AFCtx.HINT}">
                <span class="pj-doc-g">${glyph}</span>
                <span class="pj-doc-n">${C.esc(e.name)}</span>
                ${e.role ? `<span class="pj-doc-r">${C.esc(e.role)}</span>` : ''}
                ${e.managed ? '<span class="pj-doc-r" title="regenerated by Agent Farm — edits here are lost">auto</span>' : ''}
            </div>`;
        }).join('');

        const sel = d.selected;
        // ‼️ A managed folder is not offered as somewhere to put a note. `_AF/`
        // is rewritten on every session start, so a note filed there is gone by
        // the next spawn — offering it is offering to lose the user's writing.
        const folders = ['']
            .concat(entries.filter(e => e.dir && !e.managed).map(e => e.path))
            .map(f => `<option value="${C.esc(f)}">${C.esc(f || '(project root)')}</option>`).join('');

        const pane = !sel
            ? '<p class="muted small">Pick a document on the left.</p>'
            : (sel.error
                ? `<p class="muted">${C.esc(sel.error)}</p>`
                : `<div class="pj-docbar">
                        <span><b>${C.esc(sel.path)}</b></span>
                        ${sel.role ? `<span class="pj-doc-r">${C.esc(sel.role)}</span>` : ''}
                        <span class="muted small">${Math.round((sel.size || 0) / 102.4) / 10} KB</span>
                        <span class="grow"></span>
                        ${openWithHtml(sel.path)}
                   </div>
                   ${sel.truncated ? '<p class="muted small">Only the first part is shown — open it to read the rest.</p>' : ''}
                   <pre class="pj-doc-text">${C.esc(sel.text || '')}</pre>`);

        return `
        <div class="pj-docs">
            <div class="pj-doc-tree">
                ${tree || '<p class="muted small">The folder is empty.</p>'}
                ${entries.length >= 500 ? '<p class="muted small">Only the first 500 entries are listed.</p>' : ''}
            </div>
            <div class="pj-doc-pane">${pane}</div>
        </div>
        <div class="pj-card">
            <div class="pj-card-h">New note</div>
            <div class="pj-row">
                <select id="doc-folder">${folders}</select>
                <input id="doc-name" placeholder="name (.md is added)">
                <button data-act="newDoc">Create</button>
            </div>
        </div>`;
    }

    /**
     * People — the registry list, which is what the brief carries into every
     * session, next to a pointer at the project's own People document.
     *
     * ‼️ These are two different things and the page must not pretend to sync
     * them. The list here is structured data Agent Farm owns and injects; the
     * document is the user's prose about the same people, and rewriting it from
     * this table would be a program editing an essay.
     */
    function peopleHtml(p) {
        const doc = td().peopleDoc;
        const link = doc && doc.state === 'ok'
            ? `<div class="pj-docbar">
                    <span class="muted small">The project's own people document:</span>
                    <span><b>${C.esc(doc.path)}</b></span>
                    <span class="grow"></span>
                    ${openWithHtml(doc.path)}
               </div>`
            : '';
        return `
        ${link}
        <div class="pj-sub">Who decides (owner) · who pays (client, sponsor) · who does the work
            (contributor) · who you ask (contact) · who supplies (vendor).
            <span class="muted small">This list is what every session started under the project is told.</span></div>
        <table class="pj-people"><tbody>${peopleRows(p)}</tbody></table>
        <div class="btnrow pj-actions">
            <button class="secondary" data-act="addPerson">＋ Add person</button>
            <button data-act="savePeople"${peopleDirty(p) ? '' : ' disabled'}>Save people</button>
            <span class="muted small" id="pj-people-state">${peopleDirty(p) ? PEOPLE_UNSAVED : PEOPLE_SAVED}</span>
        </div>`;
    }

    /** The Sessions tab is the SHARED table (media/sessionsTable.js), whole:
     *  its columns, filters, sorts, fold-open turn breakdown and the session
     *  right-click contract all come along, and none of it is reimplemented
     *  here. It owns the container div; this page only supplies the rows. */
    function sessionsHtml() {
        // ‼️ Wait for THIS project's rows. The host builds one tab at a time, so
        // the first paint after a tab switch (or a jump to another project) has
        // no rows yet — and an empty table says "No sessions yet.", which is an
        // answer, and the wrong one. "Reading…" is the truth for that frame.
        if (!Array.isArray(td().rows)) { return '<p class="muted">Reading the project…</p>'; }
        // The tab answers "which sessions"; the button goes on answering the
        // other question — "…and how do they sit against the whole fleet",
        // which is the Dashboard, scoped. Two destinations, not two copies.
        return `<div class="btnrow" style="margin-bottom:8px">
                <button class="secondary" data-act="openSessions"
                    title="Open the Dashboard filtered to this project — the same table, with the fleet's cards around it">
                    ⇱ Open in Dashboard</button>
            </div>
            <div id="pj-sessions"></div>`;
    }

    function mountSessions() {
        const d = td();
        if (!sessTable) {
            sessTable = window.AFSessionsTable.create({
                vscode, C,
                containerId: 'pj-sessions',
                columns: ['origin', 'title', 'agent', 'when', 'duration', 'turns', 'tools', 'files', 'errors', 'tokens', 'cost'],
                tableN: 25,
                stateKey: 'project'
            });
        }
        sessTable.setRows(d.rows || [], d.tableN);
    }

    /** Read the whole form back. Empty clears the field — that is how the page
     *  says "no folder / no budget / no parent" without a command per field. */
    function collect() {
        const val = id => (document.getElementById(id) || {}).value;
        const num = id => {
            const v = (val(id) || '').trim();
            return v === '' ? '' : Number(v);
        };
        return {
            status: val('f-status'),
            kind: val('f-kind') || '',
            icon: val('f-icon') || '',
            color: val('f-color') || '',
            summary: val('f-summary') || '',
            parentId: val('f-parent') || '',
            repos: (val('f-repos') || '').split('\n').map(s => s.trim()).filter(Boolean),
            budgetUSD: num('f-budget'),
            budgetTotalUSD: num('f-budgettotal'),
            startedAt: dateMs(val('f-started')),
            dueAt: dateMs(val('f-due')),
            tags: (val('f-tags') || '').split(',').map(s => s.trim()).filter(Boolean),
            match: {
                agents: [...document.querySelectorAll('[data-agent]')]
                    .filter(el => el.checked).map(el => el.dataset.agent)
            }
            // ‼️ People are NOT in this patch. They moved to their own tab, and
            // `people` is null until that tab renders the editor — so sending
            // `people: (people || [])` from the Settings tab would post an empty
            // list and delete every person on the project, on a Save the user
            // pressed to change a budget.
        };
    }

    function wire() {
        document.querySelectorAll('[data-pick]').forEach(el =>
            el.addEventListener('click', () => {
                selectedId = el.dataset.pick; people = null; creating = null; render();
            }));

        document.querySelectorAll('[data-tab]').forEach(el =>
            el.addEventListener('click', () => { tab = el.dataset.tab; render(); }));

        // ‼️ The one thing the Track tab actually does: a turn number is a door.
        // `ts` is what the session viewer scrolls to — the turn NUMBER is for the
        // reader, the timestamp is the address, and sending the number would land
        // every click at the top of the transcript.
        document.querySelectorAll('[data-trackturn]').forEach(el =>
            el.addEventListener('click', () => {
                if (!el.dataset.trackturn) { return; }
                vscode.postMessage({
                    type: 'openSession', file: el.dataset.trackturn,
                    ts: Number(el.dataset.trackts) || 0
                });
            }));

        // Timeline chips. An exclusion set, so a kind appearing for the first
        // time shows up instead of being hidden by a filter nobody set.
        document.querySelectorAll('[data-kind]').forEach(el =>
            el.addEventListener('click', () => {
                const k = el.dataset.kind;
                const feed = td().feed;
                const present = Object.keys((feed && feed.counts) || {});
                if (k === '__all') { feedOff = new Set(); }
                else if (k === '__none') { feedOff = new Set(present); }
                else if (feedOff.has(k)) { feedOff.delete(k); }
                else { feedOff.add(k); }
                render();
            }));

        // A feed row opens what it is about. The index is carried on the row
        // rather than the link itself: a serialised link in a data attribute is
        // a string the page would have to re-parse and re-trust.
        document.querySelectorAll('[data-ev]').forEach(el =>
            el.addEventListener('click', () => {
                const d = td();
                const list = tab === 'timeline' ? (d.feed && d.feed.events) : d.recent;
                const ev = (list || [])[Number(el.dataset.ev)];
                if (ev && ev.link) { vscode.postMessage({ type: 'openLink', link: ev.link }); }
            }));

        // The create form keeps its own state so a repaint never loses a
        // half-typed name. The folder follows the name until the user takes it
        // over — after that it is theirs.
        if (creating) {
            const bind = (id, key) => {
                const el = document.getElementById(id);
                if (el) { el.addEventListener('input', () => { creating[key] = el.value; }); }
            };
            const name = document.getElementById('n-name');
            if (name) {
                name.addEventListener('input', () => {
                    creating.name = name.value;
                    if (!creating.folderTouched) { askSuggestion(name.value); }
                });
                name.focus();
                name.setSelectionRange(name.value.length, name.value.length);
            }
            const folder = document.getElementById('n-folder');
            if (folder) {
                folder.addEventListener('input', () => {
                    creating.folder = folder.value;
                    creating.folderTouched = true;
                });
            }
            bind('n-summary', 'summary');
            ['n-status', 'n-kind'].forEach(id => {
                const el = document.getElementById(id);
                if (el) { el.addEventListener('change', () => { creating[id.slice(2)] = el.value; }); }
            });
            const repos = document.getElementById('n-repos');
            if (repos) {
                repos.addEventListener('input', () => {
                    creating.repos = repos.value.split('\n').map(s => s.trim()).filter(Boolean);
                });
            }
        }

        // ---- documents ----
        document.querySelectorAll('[data-doc]').forEach(el =>
            el.addEventListener('click', () => {
                vscode.postMessage({ type: 'selectDoc', path: el.dataset.doc });
            }));

        document.querySelectorAll('[data-open]').forEach(el =>
            el.addEventListener('click', () => {
                const p = sel();
                vscode.postMessage({
                    type: 'openDoc', id: p ? p.id : '',
                    path: el.dataset.path, mode: el.dataset.open
                });
            }));

        // A checkbox flips in the DOM the moment it is clicked, so the message
        // carries the state it WANTS rather than a toggle — the host and the
        // page can never end up disagreeing about which way it went.
        //
        // ‼️ And it carries the item's TEXT, which is not decoration. This page
        // holds a line number for as long as it stays open, and the file is
        // open in Obsidian at the same time: one inserted paragraph there and
        // the number points at the next item down. The host checks the text
        // against that line and refuses on a mismatch, so a stale page says
        // "reload" instead of quietly ticking the wrong box.
        document.querySelectorAll('[data-plan]').forEach(el =>
            el.addEventListener('click', () => {
                const p = sel();
                vscode.postMessage({
                    type: 'planCheck', id: p ? p.id : '',
                    line: Number(el.dataset.plan),
                    itemId: el.dataset.planid || '',
                    text: el.dataset.plantext || '',
                    done: el.checked === true
                });
            }));

        // ---- the backlog. Filters are page-side (a repaint, not a round trip);
        // anything that WRITES goes to the host, which owns the file.
        const blRow = el => el.closest('[data-blrow]');
        /** How the host is told which row: the code when there is one, else the
         *  line. The panel converts and, for a coded item, ignores the line
         *  entirely — a code cannot go stale, a line number can. */
        const blWho = row => ({
            code: row.dataset.code || '',
            line: Number(row.dataset.line)
        });
        const blPost = (type, row, extra) => {
            const p = sel();
            vscode.postMessage(Object.assign(
                { type: type, id: p ? p.id : '' }, blWho(row), extra || {}));
        };

        // Ctrl+Enter sends the capture: reaching for the mouse is a cost, and the
        // whole promise of this box is that writing a thought down costs nothing.
        //
        // ‼️ Plain Enter is a NEWLINE here, not send — the same bargain the
        // in-place edit box makes. The box is a paragraph-sized textarea now
        // precisely because these items run long, and a box where Enter throws
        // the half-written thought at the file would undo that.
        const blNew = document.getElementById('bl-new');
        if (blNew) {
            blNew.addEventListener('keydown', ev => {
                if (ev.key !== 'Enter' || !(ev.ctrlKey || ev.metaKey)) { return; }
                ev.preventDefault();
                const btn = document.querySelector('[data-act="blAdd"]');
                if (btn) { btn.click(); }
            });
            // ‼️ Every keystroke is kept, and WITHOUT a repaint: the page redraws
            // itself whole, so repainting here would move the caret out from
            // under the person typing. The state is updated; the DOM is not.
            blNew.addEventListener('input', () => {
                blCapture().text = blNew.value;
                window.AFTextTools.paint('bl', !!blNew.value);
            });
        }
        // The box's four text tools — the same component the console composer
        // uses (media/afTextTools.js), so paste lands with the same space rule.
        window.AFTextTools.wire({
            prefix: 'bl', boxId: 'bl-new',
            onChange: value => {
                blCapture().text = value;
                window.AFTextTools.paint('bl', !!value);
            }
        });
        window.AFTextTools.paint('bl', !!blCapture().text);
        // The five axes are part of the draft too — see blCapture.
        for (const pair of [['bl-type', 'type'], ['bl-prio', 'prio'], ['bl-effort', 'effort'], ['bl-at', 'at']]) {
            const el = document.getElementById(pair[0]);
            if (el) { el.addEventListener('change', () => { blCapture()[pair[1]] = el.value; }); }
        }
        // Area is the one that repaints: the position box next to Add is only
        // live once an area is chosen (an uncoded capture has no code to queue),
        // so leaving it grey after the choice that unlocks it would read as a
        // dead control. The repaint is safe here — a `change` fires after the
        // popup has closed, so nothing is torn out mid-gesture (see blOwnsGesture).
        const blAreaSel = document.getElementById('bl-area');
        if (blAreaSel) {
            blAreaSel.addEventListener('change', () => {
                const cap = blCapture();
                cap.area = blAreaSel.value;
                if (!cap.area) { cap.at = ''; }
                render();
            });
        }

        /** Add or drop one value on a multi-select axis. Clicking a chip that is
         *  already on takes it off — the only behaviour nobody has to be told. */
        const blToggle = (list, value) => {
            const at = list.indexOf(value);
            if (at >= 0) { list.splice(at, 1); } else { list.push(value); }
        };
        document.querySelectorAll('[data-blarea]').forEach(el =>
            el.addEventListener('click', () => {
                // The "all areas" chip is a reset, not a value of its own.
                if (!el.dataset.blarea) { blFilter.areas = []; } else { blToggle(blFilter.areas, el.dataset.blarea); }
                render();
            }));
        document.querySelectorAll('[data-blkind]').forEach(el =>
            el.addEventListener('click', () => { blToggle(blFilter.kinds, el.dataset.blkind); render(); }));
        document.querySelectorAll('[data-blprio-f]').forEach(el =>
            el.addEventListener('click', () => { blToggle(blFilter.prios, el.dataset.blprioF); render(); }));
        document.querySelectorAll('[data-bleffort-f]').forEach(el =>
            el.addEventListener('click', () => { blToggle(blFilter.efforts, el.dataset.bleffortF); render(); }));
        // The dropdown axes, all six of them, from the one list that declares
        // them (BL_PICKS). `sel` arrives as null for "all ticked" — the shared
        // control normalises that itself, so an axis that is not narrowing
        // anything is null here rather than a list that happens to hold
        // everything, and a state added to the file later is included without
        // anybody reopening the picker.
        BL_PICKS.forEach(p => window.AFFilter.wireMulti({
            id: p.id,
            onChange: sel => { blFilter[p.key] = sel; render(); }
        }));
        // Per-row clears. `and` is one control for the four pickers in the panel
        // because they are one question on screen — four ✕ on that row would be
        // more furniture than filter.
        document.querySelectorAll('[data-blclearf]').forEach(el =>
            el.addEventListener('click', () => {
                const axis = el.dataset.blclearf;
                if (axis === 'and') {
                    blPicksIn('panel').forEach(p => { blFilter[p.key] = null; });
                } else if (axis === 'q') { blFilter.q = ''; } else { blFilter[axis] = []; }
                render();
            }));
        // The tab's own ? (blHelpHtml). It stops the click reaching the document
        // listener that dismisses it, or it would close in the same gesture that
        // opened it — and so does the panel, so selecting a line of text inside
        // it does not shut it.
        document.querySelectorAll('[data-blhelp]').forEach(el =>
            el.addEventListener('click', ev => {
                ev.stopPropagation();
                blHelpOpen = !blHelpOpen;
                render();
            }));
        document.querySelectorAll('[data-blhelppop]').forEach(el =>
            el.addEventListener('click', ev => ev.stopPropagation()));
        const blChf = document.getElementById('bl-chars');
        if (blChf) {
            blChf.addEventListener('change', () => {
                const n = Math.max(0, Math.min(4000, Number(blChf.value) || 0));
                blChars = n;
                // A new cut length is a new question about every row, so the rows
                // somebody had opened by hand under the old one are closed.
                blOpen.clear();
                render();
            });
        }
        const blq = document.getElementById('bl-q');
        if (blq) {
            // ‼️ Repainting on every keystroke would move the caret out from
            // under the person typing, so the box is filtered on input WITHOUT a
            // repaint of itself: the rows are redrawn and focus is put back.
            blq.addEventListener('input', () => {
                blFilter.q = blq.value;
                render();
                const again = document.getElementById('bl-q');
                if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
            });
        }
        const blSortSel = document.getElementById('bl-sort');
        if (blSortSel) {
            // The gesture the document listener stepped back from ends here, so
            // this is where anything it left open gets closed — one repaint, and
            // it happens after the choice rather than instead of it.
            blSortSel.addEventListener('change', () => {
                blSort = blSortSel.value;
                blMenu = null;
                blHelpOpen = false;
                render();
            });
        }

        document.querySelectorAll('[data-blcheck]').forEach(el =>
            el.addEventListener('click', () =>
                blPost('backlogState', blRow(el), { state: el.checked ? 'done' : 'open' })));
        document.querySelectorAll('[data-blstate]').forEach(el =>
            el.addEventListener('click', () =>
                blPost('backlogState', blRow(el), { state: el.dataset.blstate })));
        // ▲/▼ and every row of their step menus are the same message: which way,
        // and how far. `by` is absent on top/bottom, where "how far" is the end.
        document.querySelectorAll('[data-blmove]').forEach(el =>
            el.addEventListener('click', () => {
                const p = sel();
                vscode.postMessage({
                    type: 'backlogMove', id: p ? p.id : '',
                    code: blRow(el).dataset.code || '',
                    dir: el.dataset.blmove,
                    ...(el.dataset.blby ? { by: Number(el.dataset.blby) } : {})
                });
            }));
        document.querySelectorAll('[data-blmore]').forEach(el =>
            el.addEventListener('click', () => {
                const key = blRow(el).dataset.key;
                if (blOpen.has(key)) { blOpen.delete(key); } else { blOpen.add(key); }
                render();
            }));

        // ---- the queue strip: jump, and drag to reorder ----------------------
        //
        // ‼️ A jump that lands nowhere is worse than no jump. The item is in the
        // startable queue, so it is live — but a filter the reader set ten minutes
        // ago can still be hiding it, and a click that silently did nothing would
        // read as a broken strip. So the filters are dropped and the page SAYS SO,
        // rather than either failing quietly or leaving them on.
        document.querySelectorAll('[data-blnext]').forEach(el =>
            el.addEventListener('click', () => {
                const key = el.dataset.blnext;
                const item = (((td().backlog || {}).items) || []).find(i => blKey(i) === key);
                if (item && !blPasses(item)) {
                    blFilter = blFilterDefaults();
                    flash = { ok: `Filters cleared — ${item.code || 'that item'} was hidden by one.` };
                }
                blJump = key;
                render();
            }));

        /**
         * ‼️ A DROP IS A DROP, AND THAT IS THE WHOLE RULE: the dragged entry
         * lands where it was let go and nothing else moves.
         *
         * It used to have two rules layered on it and both were surprises. The
         * first drop moved the LINE, so it could only land inside the item's own
         * area and a chip dragged to the front simply snapped back. The second
         * pinned "everything up to where you dropped it", so moving one item to
         * eighth place quietly pinned the seven above it — an item nobody had
         * touched acquiring a 📌 is exactly the kind of thing that makes a
         * control untrustworthy. There is no prefix and no pin now: the strip
         * sends the order it is showing, and the 🎯 block becomes that order.
         *
         * An uncoded capture cannot be ordered (only a code survives an edit of
         * the file), so a drag involving one says so instead of doing nothing.
         */
        let blNextDrag = '';
        const blNextChips = () => [...document.querySelectorAll('[data-blnext]')];
        const blNextClear = () => blNextChips().forEach(b =>
            b.classList.remove('dragging', 'drop-left', 'drop-right'));

        /** Which side of the chip the pointer is on. Read from GEOMETRY at drop
         *  time, never from the class the last dragover left behind: `dragleave`
         *  fires as the pointer crosses the chip's own children, so that class
         *  was a race the drop lost about half the time. */
        const blBefore = (el, ev) => {
            const box = el.getBoundingClientRect();
            return ev.clientX < box.left + box.width / 2;
        };

        const blNextDrop = (el, ev) => {
            const fromKey = blNextDrag;
            blNextDrag = '';
            blNextClear();
            if (!fromKey || !el || el.dataset.blnext === fromKey) { return; }
            const chips = blNextChips();
            const order = chips.map(c => ({ key: c.dataset.blnext, code: c.dataset.code || '' }));
            const from = order.findIndex(o => o.key === fromKey);
            const onto = order.findIndex(o => o.key === el.dataset.blnext);
            if (from < 0 || onto < 0) { return; }
            if (!order[from].code || !order[onto].code) {
                flash = { error: 'That one has no code yet — file it with 🗂 and it can be queued.' };
                render();
                return;
            }
            // ‼️ The strip shows the FRONT of the queue, not all of it, so it
            // must NOT send the order it can see: that would silently truncate
            // everything behind the fourteenth. It names the two entries and the
            // host does the move against the full list.
            const p = sel();
            vscode.postMessage({
                type: 'backlogReorder', id: p ? p.id : '',
                code: order[from].code, destCode: order[onto].code,
                place: blBefore(el, ev) ? 'before' : 'after'
            });
        };

        document.querySelectorAll('[data-blnext][draggable]').forEach(el => {
            el.addEventListener('dragstart', ev => {
                blNextDrag = el.dataset.blnext;
                el.classList.add('dragging');
                if (ev.dataTransfer) { ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', blNextDrag); }
            });
            el.addEventListener('dragover', ev => {
                if (!blNextDrag || el.dataset.blnext === blNextDrag) { return; }
                ev.preventDefault();
                // ‼️ Chromium will not deliver a drop unless the dragover says
                // what the drop would DO. Without this line the whole gesture
                // was a coin toss — which is exactly what "it works sometimes"
                // looked like.
                if (ev.dataTransfer) { ev.dataTransfer.dropEffect = 'move'; }
                const before = blBefore(el, ev);
                el.classList.toggle('drop-left', before);
                el.classList.toggle('drop-right', !before);
            });
            el.addEventListener('dragleave', () => el.classList.remove('drop-left', 'drop-right'));
            el.addEventListener('drop', ev => { ev.preventDefault(); blNextDrop(el, ev); });
            el.addEventListener('dragend', () => { blNextDrag = ''; blNextClear(); });
        });

        // ‼️ THE GAPS ARE PART OF THE STRIP. The chips wrap onto two or three
        // lines, so half of what looks like the queue is the space between and
        // below them — and a drop there used to be a drop on nothing, which is
        // most of why dragging one chip to the front "did not work". The row
        // itself catches those and hands the drop to the nearest chip.
        const blNextRow = document.getElementById('bl-nextrow');
        if (blNextRow) {
            blNextRow.addEventListener('dragover', ev => {
                if (!blNextDrag) { return; }
                ev.preventDefault();
                if (ev.dataTransfer) { ev.dataTransfer.dropEffect = 'move'; }
            });
            blNextRow.addEventListener('drop', ev => {
                if (!blNextDrag) { return; }
                ev.preventDefault();
                // Nearest by centre distance, which is what "I dropped it about
                // there" means on a wrapped row.
                let best = null; let bestD = Infinity;
                for (const c of blNextChips()) {
                    const b = c.getBoundingClientRect();
                    const dx = ev.clientX - (b.left + b.width / 2);
                    const dy = ev.clientY - (b.top + b.height / 2);
                    const d = dx * dx + dy * dy;
                    if (d < bestD) { bestD = d; best = c; }
                }
                blNextDrop(best, ev);
            });
        }

        // ---- editing the words. The row IS the editor here too, but a long item
        // needs a box it can breathe in, so this one opens rather than cycles.
        document.querySelectorAll('[data-bledit]').forEach(el =>
            el.addEventListener('click', () => {
                const row = blRow(el);
                const item = (((td().backlog || {}).items) || []).find(i => blKey(i) === row.dataset.key);
                blEdit = { key: row.dataset.key, text: item ? (item.text || '') : '' };
                render();
                const box = document.getElementById('bl-edit');
                if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
            }));
        const blSaveEdit = () => {
            const box = document.getElementById('bl-edit');
            const row = box && blRow(box);
            if (!box || !row) { blEdit = null; render(); return; }
            const words = box.value.replace(/\s+/g, ' ').trim();
            if (!words) { flash = { error: 'An item needs some words. Cancel instead of emptying it.' }; render(); return; }
            blEdit = { key: blEdit.key, text: words, saving: true };
            blPost('backlogSet', row, { fields: { text: words } });
            render();
        };
        const blEditBox = document.getElementById('bl-edit');
        if (blEditBox) {
            // Enter is NOT save: these items run to paragraphs and losing one to a
            // stray keystroke is not recoverable from this page.
            blEditBox.addEventListener('keydown', ev => {
                if (ev.key === 'Escape') { ev.preventDefault(); blEdit = null; render(); }
                if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); blSaveEdit(); }
            });
            blEditBox.addEventListener('input', () => { if (blEdit) { blEdit.text = blEditBox.value; } });
        }
        document.querySelectorAll('[data-blsave]').forEach(el => el.addEventListener('click', blSaveEdit));
        document.querySelectorAll('[data-blcancel]').forEach(el =>
            el.addEventListener('click', () => { blEdit = null; render(); }));

        // ---- drag to reorder. Only in queue order, because that is the only
        // order there is to change; the drop names the row it landed against and
        // the host moves the code against the full list. It has no section rule
        // and no depth rule to obey any more — nothing here moves a line.
        let blDragKey = '';
        document.querySelectorAll('[data-blgrip][draggable]').forEach(el =>
            el.addEventListener('dragstart', ev => {
                const row = blRow(el);
                blDragKey = row.dataset.key;
                row.classList.add('dragging');
                if (ev.dataTransfer) { ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', blDragKey); }
            }));
        /** Which half of the row the pointer is in — read from geometry AT DROP
         *  TIME for the same reason the strip does it (see blBefore): the
         *  highlight class is cleared by `dragleave` as the pointer crosses the
         *  row's own spans, so a drop that trusted it landed the wrong way round
         *  whenever the last event happened to be the leave. */
        const blRowBefore = (row, ev) => {
            const box = row.getBoundingClientRect();
            return ev.clientY < box.top + box.height / 2;
        };
        document.querySelectorAll('[data-blrow]').forEach(row => {
            row.addEventListener('dragover', ev => {
                if (!blDragKey || row.dataset.key === blDragKey) { return; }
                ev.preventDefault();
                // Chromium delivers no drop without this — see the strip's own
                // dragover for what that looked like from the outside.
                if (ev.dataTransfer) { ev.dataTransfer.dropEffect = 'move'; }
                const before = blRowBefore(row, ev);
                row.classList.toggle('drop-before', before);
                row.classList.toggle('drop-after', !before);
            });
            row.addEventListener('dragleave', () => row.classList.remove('drop-before', 'drop-after'));
            row.addEventListener('drop', ev => {
                ev.preventDefault();
                const place = blRowBefore(row, ev) ? 'before' : 'after';
                row.classList.remove('drop-before', 'drop-after');
                if (!blDragKey || row.dataset.key === blDragKey) { return; }
                const from = document.querySelector('[data-blrow][data-key="' + CSS.escape(blDragKey) + '"]');
                blDragKey = '';
                if (!from) { return; }
                // Both ends need a code: the queue holds codes, and a row that
                // has none is not in it to be moved or landed against.
                if (!from.dataset.code || !row.dataset.code) {
                    flash = { error: 'Both rows need a code — file the uncoded one with 🗂 first.' };
                    render();
                    return;
                }
                const p = sel();
                vscode.postMessage({
                    type: 'backlogReorder', id: p ? p.id : '',
                    code: from.dataset.code, destCode: row.dataset.code, place: place
                });
            });
            row.addEventListener('dragend', () => {
                blDragKey = '';
                document.querySelectorAll('[data-blrow]').forEach(r =>
                    r.classList.remove('dragging', 'drop-before', 'drop-after'));
            });
        });

        // ---- the four pickers. A badge OPENS a menu; the menu WRITES once.
        //
        // ‼️ `stopPropagation` on both halves, and it is load-bearing: the
        // document-level listener that closes an open menu would otherwise see
        // the very click that opened it and shut it again in the same tick.
        const blOpener = (attr, kind) =>
            document.querySelectorAll('[' + attr + ']').forEach(el =>
                el.addEventListener('click', ev => {
                    ev.stopPropagation();
                    const key = blRow(el).dataset.key;
                    blMenu = blMenuOpen(kind, key) ? null : { kind: kind, key: key };
                    render();
                }));
        blOpener('data-blprio', 'prio');
        blOpener('data-bleffort', 'effort');
        // ‼️ OPENING A MENU IS NOT ANSWERING IT. The type badge carried a second,
        // older handler that CYCLED to the next type — so one press both opened
        // the picker and wrote a value nobody had chosen, and the menu you were
        // reading was already out of date about the item underneath it. A control
        // that commits on the way to asking the question cannot be cancelled:
        // there was no way to look at the list and walk away. The badge opens;
        // the menu writes; clicking off it writes nothing.
        blOpener('data-bltype', 'type');
        // ‼️ THIS IS THE ONE THAT WAS BROKEN. "file it under an area" silently
        // required an area to have been chosen in the CAPTURE box first — a
        // control at the other end of the page, for adding a different item — so
        // pressing it did nothing at all in the normal case. The area is chosen
        // here now, on the row being filed, where the question is asked.
        blOpener('data-blfile', 'area');

        document.querySelectorAll('[data-blpick]').forEach(mi =>
            mi.addEventListener('click', ev => {
                ev.stopPropagation();
                // Which axis is answered by which menu is OPEN, not by the item —
                // there is only ever one.
                const kind = blMenu && blMenu.kind;
                const value = mi.dataset.blpick;
                const row = blRow(mi);
                blMenu = null;
                if (!kind || !row) { render(); return; }
                if (kind === 'prio') { blPost('backlogSet', row, { fields: { priority: value } }); return; }
                if (kind === 'effort') { blPost('backlogSet', row, { fields: { effort: value } }); return; }
                if (kind === 'type') {
                    // The user's own tags ride along untouched — a picker that
                    // quietly ate somebody's #regression would be a worse bargain
                    // than no picker at all.
                    const item = (((td().backlog || {}).items) || []).find(i => blKey(i) === row.dataset.key);
                    const mine = ((item && item.kinds) || []).filter(k => BL_TYPE_IDS.indexOf(k) < 0);
                    blPost('backlogSet', row, { fields: { kinds: value ? [value, ...mine] : mine } });
                    return;
                }
                if (kind === 'area') { blPost('backlogCode', row, { area: value }); }
            }));

        // ---- one item, opened at its own line ------------------------------
        // The host re-resolves the line from the CODE, so a page that has been
        // open while the file was edited in Obsidian still lands on the right
        // item rather than on whatever moved into that line number.
        document.querySelectorAll('[data-blgo]').forEach(el =>
            el.addEventListener('click', ev => {
                ev.stopPropagation();
                blPost('backlogOpenItem', blRow(el), {});
            }));

        document.querySelectorAll('[data-rmperson]').forEach(el =>
            el.addEventListener('click', () => { people.splice(Number(el.dataset.rmperson), 1); render(); }));

        // keep edits to the people table in memory so a repaint does not lose them
        //
        // ‼️ Typing does NOT repaint — that would move the caret out from under
        // the person typing. So the two things a repaint would have refreshed
        // are refreshed by hand: the Save button (disabled while there is
        // nothing to save, and a Save you cannot press is a table you cannot
        // save) and the word next to it.
        document.querySelectorAll('[data-p]').forEach(el =>
            el.addEventListener('input', () => {
                people[Number(el.dataset.i)][el.dataset.p] = el.value;
                markPeopleState();
            }));

        document.querySelectorAll('[data-act]').forEach(el => el.addEventListener('click', () => {
            const p = sel();
            const id = p ? p.id : '';
            switch (el.dataset.act) {
                case 'create':
                    creating = newForm(null);
                    render();
                    askSuggestion('');
                    break;
                case 'nCancel': creating = null; render(); break;
                case 'nBrowse': vscode.postMessage({ type: 'browseFolder', start: creating.folder }); break;
                case 'nCreate':
                    vscode.postMessage({
                        type: 'create',
                        form: {
                            name: creating.name.trim(), folder: creating.folder.trim(),
                            kind: creating.kind, status: creating.status,
                            summary: creating.summary, repos: creating.repos,
                            sessionIds: creating.sessionIds
                        }
                    });
                    break;
                case 'rescan': vscode.postMessage({ type: 'rescan' }); break;
                case 'addPerson': people.push({ name: '', role: 'contact', kind: 'person' }); render(); break;
                case 'savePeople':
                    // ‼️ `people === null` means the editor never rendered, so
                    // there is nothing on screen to save — and posting `[]` for
                    // it would delete every person the project has. The button
                    // is only drawn on the tab that fills it, so this cannot
                    // happen today; it stays because the cost of being wrong
                    // about that later is somebody's contact list.
                    if (people === null) { break; }
                    vscode.postMessage({
                        type: 'savePeople', id,
                        people: people.filter(x => (x.name || '').trim())
                    });
                    break;
                case 'planAdd': {
                    const box = document.getElementById('plan-new');
                    const item = ((box && box.value) || '').trim();
                    if (!item) { break; }
                    vscode.postMessage({
                        type: 'planAdd', id, item,
                        section: (document.getElementById('plan-sec') || {}).value || ''
                    });
                    break;
                }
                case 'blAdd': {
                    // ‼️ Read from the DRAFT, not from the DOM. They agree while
                    // the tab is on screen, but the draft is what survives a
                    // repaint — and reading the box would mean Ctrl+Enter behaved
                    // differently from the button after one.
                    const cap = blCapture();
                    // An item is ONE markdown line, so the paragraph is folded
                    // here — the same normalisation the in-place editor does,
                    // rather than two different answers to "what happened to my
                    // line breaks".
                    const text = (cap.text || '').replace(/\s+/g, ' ').trim();
                    if (!text) { break; }
                    cap.sending = true;
                    vscode.postMessage({
                        type: 'backlogAdd', id, text,
                        area: cap.area, priority: cap.prio || 'normal', effort: cap.effort,
                        ...(cap.type ? { kinds: [cap.type] } : {}),
                        // Only when a position was actually picked. Sending a 0
                        // or a 1 by default would make every capture jump the
                        // queue, which is the opposite of "touch nothing and
                        // nothing changes".
                        ...(cap.area && Number(cap.at) > 0 ? { at: Number(cap.at) } : {})
                    });
                    break;
                }
                case 'blArchive': vscode.postMessage({ type: 'backlogArchive', id }); break;
                // Empties the 🎯 block. Nothing is lost: every item falls back
                // to the place the file already has for it.
                case 'blTidy': vscode.postMessage({ type: 'backlogTidy', id }); break;
                case 'blFilters': blFiltersOpen = !blFiltersOpen; render(); break;
                case 'blDir': blDesc = !blDesc; render(); break;
                case 'blClear':
                    // Everything the reader could have narrowed with, including the
                    // ones that live outside the panel — a "clear" that left the
                    // search box full would be the most annoying button on the page.
                    blFilter = blFilterDefaults();
                    render();
                    break;
                case 'newDoc': {
                    const name = ((document.getElementById('doc-name') || {}).value || '').trim();
                    if (!name) { break; }
                    vscode.postMessage({
                        type: 'newDoc', id, name,
                        folder: (document.getElementById('doc-folder') || {}).value || ''
                    });
                    break;
                }
                case 'pickFolder': vscode.postMessage({ type: 'pickFolder', id }); break;
                case 'clearFolder': vscode.postMessage({ type: 'save', id, patch: { folder: '' } }); break;
                case 'recreateFolder': vscode.postMessage({ type: 'recreateFolder', id }); break;
                case 'revealFolder': vscode.postMessage({ type: 'revealFolder', id }); break;
                case 'setActive': vscode.postMessage({ type: 'setActive', id }); break;
                case 'clearActive': vscode.postMessage({ type: 'setActive', id: '' }); break;
                case 'openSessions': vscode.postMessage({ type: 'openSessions', id }); break;
                case 'delete': vscode.postMessage({ type: 'delete', id, name: p && p.name }); break;
                case 'save': {
                    const name = (document.getElementById('f-name').value || '').trim();
                    // ONE message: a rename can move the folder and that can fail
                    // while every other field still saves fine, so the host does
                    // them in order and reports once. Two messages would race and
                    // the second answer would overwrite the first.
                    vscode.postMessage({
                        type: 'save', id, patch: collect(),
                        ...(p && name && name !== p.name
                            ? { name, renameFolder: document.getElementById('f-renamefolder').checked }
                            : {})
                    });
                    break;
                }
            }
        }));
    }

    /**
     * ‼️ THE DISMISSAL REPAINTS, AND A REPAINT DESTROYS WHATEVER THE POINTER IS
     * HOLDING. This is the bug that made the sort dropdown look dead.
     *
     * `render()` replaces `#app`'s innerHTML whole. So with the `?` panel — or
     * any row menu — open, the click that OPENS the native `<select>` popup also
     * reached this listener, which repainted, which detached the very `<select>`
     * the popup belonged to: the list shut itself before an option could be
     * picked. From the outside that reads as "I choose alphabetical and nothing
     * sorts" — the choice was never made, because the control was thrown away
     * mid-gesture. The same repaint took the caret out of the search box and the
     * cursor out of the capture textarea.
     *
     * A control that owns the gesture in progress is therefore left alone. It
     * closes the menu itself when the gesture finishes, or the next ordinary
     * click does — either way nothing is torn out from under the pointer.
     */
    const blOwnsGesture = ev => {
        const tag = ev && ev.target && ev.target.tagName ? String(ev.target.tagName).toLowerCase() : '';
        return tag === 'select' || tag === 'option' || tag === 'input' || tag === 'textarea';
    };

    /**
     * Clicking anywhere else closes an open row menu.
     *
     * ‼️ Attached ONCE, at module scope, and not in `wire()`. `wire()` runs on
     * every repaint; a document listener added there would accumulate one copy
     * per paint and never be removed — after an hour of a live panel refreshing
     * itself, a single click would run hundreds of them. `#app`'s innerHTML is
     * replaced on a repaint, `document` is not, so once is enough.
     */
    document.addEventListener('click', ev => {
        if (!blMenu && !blHelpOpen) { return; }
        if (blOwnsGesture(ev)) { return; }
        blMenu = null;
        blHelpOpen = false;
        render();
    });
    // Esc closes it too — the menu covers the row it belongs to, and reaching for
    // the mouse to dismiss something you opened by mistake is a small tax.
    document.addEventListener('keydown', ev => {
        if (ev.key !== 'Escape' || (!blMenu && !blHelpOpen)) { return; }
        blMenu = null;
        blHelpOpen = false;
        render();
    });

    // -----------------------------------------------------------------------
    // the right-click menus
    // -----------------------------------------------------------------------

    /**
     * ‼️ THE MENU DOES WHAT THE BUTTON DOES — it does not do it a second way.
     *
     * Every branch below ends in the same message, or the same page state, that
     * the row's own control produces. Nothing here talks to the host in a shape
     * the buttons do not already use, so a change to how an item is written
     * cannot leave the menu writing the old shape. What the menu adds is REACH:
     * priority, size, type, state, queue position and the copies are one gesture
     * from anywhere on the row, including on the rows whose badges are off
     * screen, and including the ones the row never offered at all.
     *
     * The row's identity travels in the context object rather than through a
     * "last clicked" variable: by the time the pick arrives the list may have
     * been repainted, filtered or scrolled, and a menu that acted on whatever is
     * under the pointer NOW would act on the wrong item exactly when it matters.
     */
    function ctxDo(act, ctx) {
        const verb = act.split(':')[0];
        const arg = act.slice(verb.length + 1);
        const id = () => { const p = sel(); return p ? p.id : ''; };
        // The same pair every backlog button sends: the code when there is one,
        // the line only for an uncoded capture.
        const who = () => ({ code: ctx.code || '', line: Number(ctx.line) });
        const post = (type, extra) =>
            vscode.postMessage(Object.assign({ type: type, id: id() }, who(), extra || {}));

        switch (verb) {
            // ---- a backlog item ----
            case 'blGo':
                post('backlogOpenItem', arg ? { mode: arg } : {});
                return;
            case 'blState':
                post('backlogState', { state: arg });
                return;
            case 'blPrio':
                post('backlogSet', { fields: { priority: arg } });
                return;
            case 'blEffort':
                post('backlogSet', { fields: { effort: arg === 'none' ? '' : arg } });
                return;
            case 'blType': {
                // The user's own tags ride along untouched — the same rule the
                // row's picker follows, and for the same reason.
                const item = blItem(ctx.key);
                const mine = ((item && item.kinds) || []).filter(k => BL_TYPE_IDS.indexOf(k) < 0);
                const value = arg === 'none' ? '' : arg;
                post('backlogSet', { fields: { kinds: value ? [value, ...mine] : mine } });
                return;
            }
            case 'blMove': {
                const dir = arg.replace(/\d+$/, '');
                const by = Number((arg.match(/\d+$/) || [])[0]);
                vscode.postMessage(Object.assign(
                    { type: 'backlogMove', id: id(), code: ctx.code || '', dir: dir },
                    by ? { by: by } : {}));
                return;
            }
            case 'blEdit': {
                const item = blItem(ctx.key);
                blEdit = { key: ctx.key, text: item ? (item.text || '') : String(ctx.text || '') };
                render();
                // Not blJump: the row in edit mode is a different element and
                // carries no key to find it by. The box itself is the anchor.
                const box = document.getElementById('bl-edit');
                if (box) {
                    box.scrollIntoView({ block: 'center' });
                    box.focus();
                    box.setSelectionRange(box.value.length, box.value.length);
                }
                return;
            }
            // The areas are this project's own, so the menu opens the row's own
            // picker instead of a static list that could not know them.
            case 'blFile':
                blMenu = { kind: 'area', key: ctx.key };
                blJump = ctx.key;
                render();
                return;
            case 'blTrack':
                tab = 'track';
                syncView();
                render();
                return;
            // The queue's box opens with the item already written into it —
            // quoting a backlog line at yourself is the whole gesture, and the
            // sentence that lands in the queue is still one you approved.
            case 'blQueue': {
                const item = blItem(ctx.key);
                const code = ctx.code || '';
                const text = (item && item.text) || String(ctx.text || '');
                vscode.postMessage({
                    type: 'queueAdd',
                    text: [code, text].filter(Boolean).join(' — ')
                });
                return;
            }
            case 'blCopy': {
                const item = blItem(ctx.key);
                const code = ctx.code || '';
                const text = (item && item.text) || String(ctx.text || '');
                copyOut(arg === 'code' ? code : arg === 'text' ? text
                    : [code, text].filter(Boolean).join(' — '));
                return;
            }

            // ---- a plan item ----
            case 'planCheck':
                vscode.postMessage({
                    type: 'planCheck', id: id(),
                    ...(ctx.planId ? { itemId: ctx.planId } : {}),
                    line: Number(ctx.line), text: String(ctx.text || ''),
                    done: arg === '1'
                });
                return;
            case 'planOpen': {
                const d = td().plan;
                if (d && d.path) { openDocPath(d.path, arg); }
                return;
            }
            case 'planCopy':
                copyOut(arg === 'id' ? String(ctx.planId || '') : String(ctx.text || ''));
                return;

            // ---- a document ----
            case 'docOpen':
                openDocPath(String(ctx.path || ''), arg);
                return;
            case 'docShow':
                vscode.postMessage({ type: 'selectDoc', path: String(ctx.path || '') });
                return;
            case 'docCopy': {
                const rel = String(ctx.path || '');
                const p = sel();
                copyOut(arg === 'full' && p && p.folder
                    ? p.folder.replace(/[\\/]+$/, '') + '/' + rel : rel);
                return;
            }

            // ---- a project in the list ----
            case 'projOpen':
                selectedId = String(ctx.project || '');
                people = null; creating = null;
                render();
                return;
            case 'projTab':
                selectedId = String(ctx.project || '');
                people = null; creating = null;
                tab = arg;
                syncView();
                render();
                return;
            case 'projSessions':
                vscode.postMessage({ type: 'openSessions', id: String(ctx.project || '') });
                return;
            case 'projActive':
                vscode.postMessage({ type: 'setActive', id: String(ctx.project || '') });
                return;
            case 'projInactive':
                vscode.postMessage({ type: 'setActive', id: '' });
                return;
            case 'projReveal':
                vscode.postMessage({ type: 'revealFolder', id: String(ctx.project || '') });
                return;
            case 'projCopy':
                copyOut(arg === 'id' ? String(ctx.project || '')
                    : arg === 'folder' ? String(ctx.folder || '') : String(ctx.name || ''));
                return;

            // ---- a line in the timeline ----
            case 'evOpen': {
                const list = (td().feed || {}).events || [];
                const e = list[Number(ctx.ev)];
                if (e && e.link) { vscode.postMessage({ type: 'openLink', link: e.link }); }
                return;
            }
            case 'evOnly': {
                const kind = String(ctx.evKind || '');
                if (!kind) { return; }
                // "Only this" is the exclusion set turned inside out: everything
                // the feed knows about, minus the one line you pointed at.
                const counts = ((td().feed || {}).counts) || {};
                feedOff = new Set(Object.keys(counts).filter(k => k !== kind));
                syncView();
                render();
                return;
            }
            case 'evHide':
                if (ctx.evKind) { feedOff.add(String(ctx.evKind)); syncView(); render(); }
                return;
            case 'evCopy':
                copyOut(String(ctx.text || ''));
                return;
        }
    }

    /** One item out of the open backlog, by the key its row carries. */
    function blItem(key) {
        return (((td().backlog || {}).items) || []).find(i => blKey(i) === key);
    }

    /** Open a document the way every other open on this page does it. */
    function openDocPath(path, mode) {
        if (!path) { return; }
        const cfg = DATA.docOpen || { mode: 'vscode' };
        vscode.postMessage({ type: 'openDoc', path: path, mode: mode || cfg.mode });
    }

    /**
     * Put something on the clipboard and SAY SO — the clipboard call is
     * AFCtx.copy's, so every page reports a copy the same way; this page just
     * lends it the flash line it already draws instead of a floating toast.
     */
    function copyOut(value) {
        window.AFCtx.copy(value, (msg, bad) => {
            flash = bad ? { error: msg } : { ok: msg };
            render();
        });
    }

    // ‼️ Listened for ONCE, at module scope. wire() runs on every repaint, and a
    // listener added there would accumulate a copy per paint — one right-click
    // would eventually run the same action a hundred times.
    window.AFCtx.listen(ctxDo);

    // A fresh panel gets its seed in the initial payload — its script was not
    // listening when the message would have been sent.
    if (DATA.newForm) { creating = newForm(DATA.newForm); }
    render();
    if (creating) { askSuggestion(creating.name); }
})();
