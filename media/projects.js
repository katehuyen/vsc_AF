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
                    <div class="pj-item ${p.id === selectedId ? 'on' : ''}" data-pick="${C.esc(p.id)}">
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
                title="${C.esc(when.toLocaleString())}${e.link ? ' — click to open' : ''}">
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
                .pj-bl-row { display:flex; align-items:baseline; gap:6px; padding:3px 6px;
                    border-radius:4px; font-size:13px; border-left:2px solid transparent; }
                .pj-bl-row:hover { background:var(--vscode-list-hoverBackground); }
                .pj-bl-row.closed .pj-bl-t { opacity:.5; text-decoration:line-through; }
                .pj-bl-row.doing { border-left-color:var(--vscode-charts-yellow,#d7ba7d); }
                .pj-bl-row.next { border-left-color:var(--vscode-charts-green,#3fb950); }
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
                /* The row actions stay out of the way until the row is under the
                   pointer: five buttons on every one of two hundred lines is a
                   wall, and the list has to stay readable to be usable. */
                .pj-bl-acts { display:flex; gap:2px; visibility:hidden; }
                .pj-bl-row:hover .pj-bl-acts { visibility:visible; }
                /* …and they are drawn as tools, not as primary buttons. Seven
                   filled blue rectangles on a row is the wall the line above is
                   about; the same seven as quiet glyphs are a toolbar. */
                .pj-bl-acts button { padding:0 6px; font-size:11px; background:none;
                    border:1px solid transparent; color:inherit; opacity:.8; }
                .pj-bl-acts button:hover { opacity:1;
                    background:var(--vscode-toolbar-hoverBackground,#8882);
                    border-color:var(--vscode-widget-border,#4443); }
                /* The ordering four are a different kind of act from the state
                   three, and a row of seven identical buttons reads as one. */
                .pj-bl-acts button[data-blmove="top"] { margin-left:7px; }
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
                .pj-bl-capf .pj-bl-addb { flex:1 1 100%; }
                /* THE QUEUE STRIP. Entries are buttons because they do two things
                   — jump, and move — and a thing that only looked like a label
                   was a strip nobody tried to touch. */
                .pj-bl-next .pj-bl-nextrow { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
                .pj-bl-nextb { display:inline-flex; align-items:center; gap:5px; cursor:grab;
                    background:none; color:inherit; border:1px solid var(--vscode-widget-border,#4443);
                    border-radius:12px; padding:2px 8px; font-size:11px; }
                .pj-bl-nextb:hover { background:var(--vscode-list-hoverBackground);
                    border-color:var(--vscode-focusBorder); }
                .pj-bl-nextn { opacity:.5; min-width:12px; text-align:right; }
                .pj-bl-nexte { opacity:.7; font-size:10px; }
                /* Past the op's default: still the user's queue, just not what an
                   agent takes unasked — so it is dimmed, not hidden. */
                .pj-bl-nextb.past { opacity:.62; }
                .pj-bl-nextb.past:hover { opacity:1; }
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
                .pj-bl-grip { cursor:grab; opacity:0; font-size:11px; user-select:none; letter-spacing:-1px; }
                .pj-bl-row:hover .pj-bl-grip { opacity:.5; }
                .pj-bl-grip.off { cursor:not-allowed; }
                .pj-bl-more { background:none; border:none; color:var(--vscode-textLink-foreground);
                    cursor:pointer; font-size:11px; padding:0 4px; }
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
                        title="line ${i.line}${i.id ? ' · 🆔 ' + C.esc(i.id) : ''}">
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
     */
    let blFilter = {
        areas: [], kinds: [], prios: [], efforts: [],
        state: 'live', q: '',
        /** '' any · 'yes' waiting on something · 'no' startable now */
        blocked: '',
        /** '' any · 'only' just the parents · 'hide' just the leaves */
        epics: '',
        /** '' any · 'yes' linked to a plan item · 'no' not linked */
        plan: '',
        /** '' any · 'yes' has a 📅 · 'no' none */
        due: ''
    };
    let blSort = 'file';
    let blDesc = false;
    /** Closed items are folded away by default — a backlog you have to scroll
     *  past three months of finished work to read is one nobody opens. */
    let blShowClosed = false;
    let blFiltersOpen = false;
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
    const blEffortRows = () => [{ value: '', label: 'not sized', glyph: '–', title: 'Clears the [efor:: …] field. Unsized is scored as M, never as XS.' }]
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
        const blockedBy = {};
        for (const b of (d.blocked || [])) { if (b.code) { blockedBy[b.code] = b.waitingOn; } }

        const shown = all.filter(i => blPasses(i));
        const ordered = blOrder(shown);

        // Every tag in the file, canonical ones first and in their own order, so
        // the filter row does not reshuffle itself as the backlog grows.
        const extra = [];
        for (const i of all) {
            for (const k of (i.kinds || [])) {
                if (BL_TYPE_IDS.indexOf(k) < 0 && extra.indexOf(k) < 0) { extra.push(k); }
            }
        }
        const areaOpts = ['<option value="">— area —</option>']
            .concat(areas.map(a => `<option value="${C.esc(a.code)}">${C.esc(a.code)} · ${C.esc(a.label)}</option>`))
            .join('');

        const rows = ordered.map(i => backlogRowHtml(i, nextKeys.has(blKey(i)), blockedBy[i.code], areas)).join('');
        const active = blActiveFilters();

        return `
        <div class="pj-docbar">
            <span><b>${c.open || 0}</b> open${c.doing ? ` · <b>${c.doing}</b> doing` : ''}
                · ${c.done || 0} done${c.unclassified ? ` · <b>${c.unclassified}</b> unfiled` : ''}</span>
            <span class="muted small">${C.esc(d.path)}</span>
            <span class="grow"></span>
            <button class="secondary" data-act="blArchive"
                title="Move closed items under an archive heading at the end of the same file">🗄 Archive closed</button>
            ${openWithHtml(d.path)}
        </div>

        <div class="pj-card">
            <div class="pj-card-h">Capture</div>
            <div class="pj-bl-cap">
                <textarea id="bl-new" rows="4"
                    placeholder="what needs doing — no code needed, file it later&#10;&#10;Write as much as the thought needs; Ctrl+Enter adds it."
                    title="‼️ A backlog item is where a thought is written down WHOLE — the real ones here run to a paragraph, and a one-line box is an invitation to write less than you mean. Line breaks become spaces (the item is one markdown line). Ctrl+Enter adds it, Enter is just a newline."></textarea>
                <div class="pj-bl-capf">
                    <select id="bl-area" title="Leave empty and it lands in the inbox, uncoded">${areaOpts}</select>
                    <select id="bl-type" title="Work type">
                        <option value="">— type —</option>
                        ${BL_TYPES.map(t => `<option value="${t.id}">${C.esc(t.label)}</option>`).join('')}
                    </select>
                    <select id="bl-prio" title="Priority">
                        ${PRIO_ORDER.slice().reverse().map(p =>
            `<option value="${p}"${p === 'normal' ? ' selected' : ''}>${PRIO_ICON[p]} ${p}</option>`).join('')}
                    </select>
                    <select id="bl-effort" title="Effort">
                        ${EFFORT_ORDER.map(e => `<option value="${e}">${e || '— size —'}</option>`).join('')}
                    </select>
                    <button data-act="blAdd" class="pj-bl-addb" title="Ctrl+Enter in the box does the same">Add</button>
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
                <select data-blf="blocked" title="⛔ — is something it waits on still open">
                    <option value="">blocked: any</option>
                    <option value="no"${blFilter.blocked === 'no' ? ' selected' : ''}>startable now</option>
                    <option value="yes"${blFilter.blocked === 'yes' ? ' selected' : ''}>waiting on something</option>
                </select>
                <select data-blf="epics" title="An item with children is a container — work lives at the leaves">
                    <option value="">epics: any</option>
                    <option value="hide"${blFilter.epics === 'hide' ? ' selected' : ''}>leaves only</option>
                    <option value="only"${blFilter.epics === 'only' ? ' selected' : ''}>containers only</option>
                </select>
                <select data-blf="plan" title="[plan:: 🆔] — which roadmap item it belongs to">
                    <option value="">plan: any</option>
                    <option value="yes"${blFilter.plan === 'yes' ? ' selected' : ''}>linked to a plan item</option>
                    <option value="no"${blFilter.plan === 'no' ? ' selected' : ''}>not linked</option>
                </select>
                <select data-blf="due" title="📅">
                    <option value="">due: any</option>
                    <option value="yes"${blFilter.due === 'yes' ? ' selected' : ''}>has a date</option>
                    <option value="no"${blFilter.due === 'no' ? ' selected' : ''}>no date</option>
                </select>
                ${blRowClear('and', (blFilter.blocked ? 1 : 0) + (blFilter.epics ? 1 : 0)
            + (blFilter.plan ? 1 : 0) + (blFilter.due ? 1 : 0), 'these four')}
            </div>
        </div>` : ''}

        <div class="pj-chips-row">
            <span class="pj-bl-qwrap">
                <input id="bl-q" class="pj-bl-q" placeholder="search text or code" value="${C.esc(blFilter.q)}">
                ${blFilter.q.trim() ? '<button class="pj-bl-qx" data-blclearf="q" title="Clear the search box only">✕</button>' : ''}
            </span>
            <select id="bl-state" title="Which states to show">
                <option value="live"${blFilter.state === 'live' ? ' selected' : ''}>open + doing</option>
                <option value="inbox"${blFilter.state === 'inbox' ? ' selected' : ''}>📥 unfiled only</option>
                <option value="open"${blFilter.state === 'open' ? ' selected' : ''}>open</option>
                <option value="doing"${blFilter.state === 'doing' ? ' selected' : ''}>doing</option>
                <option value="done"${blFilter.state === 'done' ? ' selected' : ''}>done</option>
                <option value="cancelled"${blFilter.state === 'cancelled' ? ' selected' : ''}>cancelled</option>
                <option value="all"${blFilter.state === 'all' ? ' selected' : ''}>every state</option>
            </select>
            <select id="bl-sort" title="Ordering. File order is your own — it is what 'do the top five' follows, and the only order you can drag rows in">
                <option value="file"${blSort === 'file' ? ' selected' : ''}>file order (yours)</option>
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
            <label class="pj-chk"><input type="checkbox" id="bl-closed" ${blShowClosed ? 'checked' : ''}> show closed</label>
            <label class="pj-chk" style="margin-left:10px" title="How much of a long item is drawn before it is cut. 0 draws all of it. Any single row still opens with one click.">
                cut at <input id="bl-chars" type="number" min="0" max="4000" step="20" value="${blChars}" style="width:66px"> chars</label>
            <span class="grow"></span>
            <span class="muted small pj-bl-count${ordered.length < all.length ? ' narrowed' : ''}">${ordered.length} of ${all.length}</span>
        </div>

        ${nextQueueHtml(nextList, all, d.nextDefault || 5)}

        ${rows || '<p class="muted small">Nothing matches. The file is <code>' + C.esc(d.path) + '</code> — edit it in Obsidian any time; this page reads whatever is there.</p>'}

        <p class="muted small pj-unfiled">A code is permanent and is not the order: dragging a row by its
            handle (or a chip in <b>Next up</b>, or pressing ⤒ ▲ ▼ ⤓) changes what comes first and leaves
            <code>P-5.3</code> meaning the same item for ever — which is why dragging only works in file
            order, the only order that is yours to change. <b>Clicking a code opens the file at that
            item's line</b> (↗ does the same) in whatever you chose under Settings → Open with; the button
            at the top of this tab opens the whole document. A badge opens a menu; 🗂 files an uncoded
            item under an area; ✎ edits the words in place. Closing a box changes exactly one character
            of your file and adds no ✅ date — Agent Farm does not write metadata it does not own.</p>`;
    }

    /**
     * THE QUEUE STRIP — the startable items, in the user's own order, and the one
     * place that order can be changed without reading the file.
     *
     * Three things it does that a list of codes did not:
     *
     *   * it is LONG ENOUGH TO BE AN ORDER. Four codes answer "what is next";
     *     twelve answer "what is the order", which is the question you have when
     *     you want to change it. Where the op's default five would have stopped is
     *     marked, because the strip must not quietly promise an agent takes twelve.
     *   * every entry OPENS. Click jumps to that row in the list below and flashes
     *     it; hover gives the first 600 characters, which is the whole point of a
     *     code — you cannot recognise K-6 from three letters.
     *   * every entry MOVES. Drag one onto another and it lands before or after
     *     it IN THE FILE, through the same op the row handles use. There is one
     *     order, not a strip order and a file order.
     */
    const BL_NEXT_TIP = 620;

    function nextQueueHtml(list, all, cut) {
        if (!list.length) { return ''; }
        const byKey = new Map(all.map(i => [blKey(i), i]));
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
                'Click to jump to it below · drag onto another to put it there'
            ].filter(s => s !== undefined).join('\n');
            // The cut mark goes BEFORE the entry that falls past it, so it reads
            // as a line drawn across the queue rather than a badge on an item.
            const mark = (n === cut && list.length > cut)
                ? `<span class="pj-bl-nextcut" title="An agent that just says &quot;do the top five&quot; stops here — projects.backlog.next defaults to ${cut}. Everything to the right is still your queue.">┊</span>`
                : '';
            return mark + `<button class="pj-bl-nextb${n >= cut ? ' past' : ''}" draggable="true"
                data-blnext="${C.esc(key)}" data-code="${C.esc(x.code || '')}" data-line="${x.line}"
                title="${C.esc(tip)}">
                <span class="pj-bl-nextn">${n + 1}</span>
                <span class="pj-bl-code">${C.esc(x.code || '📥')}</span>
                ${i.effort ? `<span class="pj-bl-nexte">${C.esc(i.effort)}</span>` : ''}
            </button>`;
        }).join('');
        return `<div class="pj-card pj-bl-next">
            <div class="pj-card-h">Next up <span class="muted" style="text-transform:none">— what is startable, in your own file order.
                Click one to find it · drag one onto another to reorder ·
                <code>projects.backlog.next</code> reads the same order and takes ${cut} by default</span></div>
            <div class="pj-bl-nextrow">${chips}</div>
        </div>`;
    }

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
        return blFilter.areas.length + blFilter.kinds.length + blFilter.prios.length
            + blFilter.efforts.length
            + (blFilter.blocked ? 1 : 0) + (blFilter.epics ? 1 : 0)
            + (blFilter.plan ? 1 : 0) + (blFilter.due ? 1 : 0)
            + (blFilter.q.trim() ? 1 : 0)
            + (blFilter.state !== 'live' ? 1 : 0);
    }

    /** Does this item survive every axis? Each list is an OR within itself and an
     *  AND against the others, which is what people mean by "bugs and regressions
     *  in P and K that are not blocked". */
    function blPasses(i) {
        const q = blFilter.q.trim().toLowerCase();
        const live = i.state === 'open' || i.state === 'doing';
        const st = blFilter.state;
        if (st === 'live' && !live && !blShowClosed) { return false; }
        if (st === 'inbox' && i.code) { return false; }
        if (st !== 'live' && st !== 'inbox' && st !== 'all' && st && i.state !== st) { return false; }
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
        const waiting = (i.blockedBy || []).length > 0;
        if (blFilter.blocked === 'yes' && !waiting) { return false; }
        if (blFilter.blocked === 'no' && waiting) { return false; }
        if (blFilter.epics === 'hide' && i.container) { return false; }
        if (blFilter.epics === 'only' && !i.container) { return false; }
        if (blFilter.plan === 'yes' && !i.plan) { return false; }
        if (blFilter.plan === 'no' && i.plan) { return false; }
        if (blFilter.due === 'yes' && !i.due) { return false; }
        if (blFilter.due === 'no' && i.due) { return false; }
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
     * ‼️ File order is the DEFAULT and stays that way. The line order of the file
     * IS the user's prioritisation — it is what `backlog.next` reads and what
     * "do the top five" means — so a clever sort that quietly overruled it would
     * make dragging a line pointless. Every other ordering here is a way of
     * LOOKING at the pile, never of changing it.
     */
    function blOrder(list) {
        const dir = blDesc ? -1 : 1;
        if (blSort === 'file') { return blDesc ? list.slice().reverse() : list; }
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
    function backlogRowHtml(i, isNext, waitingOn, areas) {
        const key = blKey(i);
        const closed = i.state === 'done' || i.state === 'cancelled';
        const cls = ['pj-bl-row'];
        if (closed) { cls.push('closed'); }
        if (i.state === 'doing') { cls.push('doing'); }
        if (isNext) { cls.push('next'); }
        if (i.container) { cls.push('container'); }
        const type = blTypeOf(i);
        // The canonical type is one settable badge; anything else the user tagged
        // rides along beside it, read-only, because it is theirs.
        const others = (i.kinds || []).filter(k => k !== type)
            .map(k => `<span class="pj-bl-kind" title="Your own tag — it filters, but the type badge only cycles the canonical set">#${C.esc(k)}</span>`);
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
            + ' — the whole document is the Open button at the top';
        return `<div class="${cls.join(' ')}" style="padding-left:${6 + (i.depth || 0) * 10}px"
            data-blrow data-key="${C.esc(key)}" data-code="${C.esc(i.code || '')}" data-line="${i.line}"
            data-prio="${C.esc(i.priority || 'normal')}" data-effort="${C.esc(i.effort || '')}"
            data-type="${C.esc(type)}" data-section="${C.esc(i.section || '')}" data-depth="${i.depth || 0}">
            <span class="pj-bl-grip${dragging ? '' : ' off'}" ${dragging ? 'draggable="true"' : ''} data-blgrip
                title="${dragging ? 'Drag to put this row somewhere else in its section — the queue, rearranged. The code does not change.' : 'Dragging only works in file order: that order is yours, the others are just ways of looking.'}">⠿</span>
            <input type="checkbox" data-blcheck ${i.state === 'done' ? 'checked' : ''}
                title="${i.state === 'done' ? 'Reopen' : 'Close as done'}">
            ${i.code
                ? `<code class="pj-bl-code open" data-blgo title="${C.esc(i.code + ' — permanent, quote it at an agent. ' + openTip)}">${C.esc(i.code)}</code>`
                : `<span class="pj-bl-code unfiled open" data-blgo title="${C.esc('No code yet. ' + openTip)}">📥</span>`}
            <span class="pj-bl-t" title="${cut ? C.esc(full) : ''}">${C.esc(body)}${cut
                ? ' <button class="pj-bl-more" data-blmore>more</button>'
                : (open && blChars > 0 && full.length > blChars ? ' <button class="pj-bl-more" data-blmore>less</button>' : '')}</span>
            ${!i.code ? `<span class="pj-bl-mw"><button class="pj-bl-badge filed" data-blfile
                title="Not filed — no code, no area. Pick one and it gets the next free number in it, permanently.">🗂</button>
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
            ${i.due ? `<span class="pj-bl-m" title="due">📅 ${C.esc(i.due)}</span>` : ''}
            ${i.plan ? `<span class="pj-bl-m" title="plan item">🆔 ${C.esc(i.plan)}</span>` : ''}
            ${waitingOn && waitingOn.length
                ? `<span class="pj-bl-m blocked" title="Waiting on ${C.esc(waitingOn.join(', '))}">⛔ ${C.esc(waitingOn.join(' '))}</span>` : ''}
            ${i.warn ? `<span class="pj-bl-m warn" title="${C.esc(i.warn)}">⚠</span>` : ''}
            <span class="pj-bl-acts">
                <button data-blgo title="${C.esc(openTip)}">↗</button>
                <button data-bledit title="Edit the words — the code and every axis stay put">✎</button>
                <button data-blstate="doing" title="Mark in progress">▶</button>
                <button data-blstate="cancelled" title="Cancel — it stays in the file, with its code spent">✕</button>
                <button data-blmove="top" title="Send to the top of its section — this one next">⤒</button>
                <button data-blmove="up" title="Move up among its siblings">▲</button>
                <button data-blmove="down" title="Move down among its siblings">▼</button>
                <button data-blmove="bottom" title="Send to the bottom of its section">⤓</button>
            </span>
        </div>`;
    }

    /** What the user's chosen open mode is called, for the row tooltips. The
     *  page is told the modes for the split button anyway; naming the one that
     *  will actually happen is the difference between "it opens somewhere" and
     *  knowing whether to expect Obsidian. */
    function blOpenModeName() {
        const cfg = DATA.docOpen || {};
        return (cfg.labels && cfg.labels[cfg.mode]) || cfg.mode || 'your editor';
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
                    title="${C.esc(e.path)}${e.managed ? ' — generated by Agent Farm' : ''}">
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
        document.querySelectorAll('[data-blf]').forEach(el =>
            el.addEventListener('change', () => { blFilter[el.dataset.blf] = el.value; render(); }));
        // Per-row clears. `and` is one control for four selects because they are
        // one question on screen — four ✕ on that row would be more furniture
        // than filter.
        document.querySelectorAll('[data-blclearf]').forEach(el =>
            el.addEventListener('click', () => {
                const axis = el.dataset.blclearf;
                if (axis === 'and') {
                    blFilter.blocked = ''; blFilter.epics = ''; blFilter.plan = ''; blFilter.due = '';
                } else if (axis === 'q') { blFilter.q = ''; } else { blFilter[axis] = []; }
                render();
            }));
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
        const blState = document.getElementById('bl-state');
        if (blState) { blState.addEventListener('change', () => { blFilter.state = blState.value; render(); }); }
        const blSortSel = document.getElementById('bl-sort');
        if (blSortSel) { blSortSel.addEventListener('change', () => { blSort = blSortSel.value; render(); }); }
        const blClosed = document.getElementById('bl-closed');
        if (blClosed) { blClosed.addEventListener('change', () => { blShowClosed = blClosed.checked; render(); }); }

        document.querySelectorAll('[data-blcheck]').forEach(el =>
            el.addEventListener('click', () =>
                blPost('backlogState', blRow(el), { state: el.checked ? 'done' : 'open' })));
        document.querySelectorAll('[data-blstate]').forEach(el =>
            el.addEventListener('click', () =>
                blPost('backlogState', blRow(el), { state: el.dataset.blstate })));
        document.querySelectorAll('[data-blmove]').forEach(el =>
            el.addEventListener('click', () =>
                blPost('backlogMove', blRow(el), { dir: el.dataset.blmove })));
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
                    blFilter = {
                        areas: [], kinds: [], prios: [], efforts: [],
                        state: 'live', q: '', blocked: '', epics: '', plan: '', due: ''
                    };
                    flash = { ok: `Filters cleared — ${item.code || 'that item'} was hidden by one.` };
                }
                blJump = key;
                render();
            }));

        // Dropping one queue entry on another writes the FILE's order through the
        // same op the row handles use. Two orders — one for the strip, one for the
        // file — would be the one thing this page must not have.
        let blNextDrag = '';
        document.querySelectorAll('[data-blnext][draggable]').forEach(el => {
            el.addEventListener('dragstart', ev => {
                blNextDrag = el.dataset.blnext;
                el.classList.add('dragging');
                if (ev.dataTransfer) { ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', blNextDrag); }
            });
            el.addEventListener('dragover', ev => {
                if (!blNextDrag || el.dataset.blnext === blNextDrag) { return; }
                ev.preventDefault();
                // Horizontal, because the strip is horizontal: the left half of an
                // entry means "in front of this one".
                const box = el.getBoundingClientRect();
                const before = ev.clientX < box.left + box.width / 2;
                el.classList.toggle('drop-left', before);
                el.classList.toggle('drop-right', !before);
            });
            el.addEventListener('dragleave', () => el.classList.remove('drop-left', 'drop-right'));
            el.addEventListener('drop', ev => {
                ev.preventDefault();
                const place = el.classList.contains('drop-left') ? 'before' : 'after';
                el.classList.remove('drop-left', 'drop-right');
                if (!blNextDrag || el.dataset.blnext === blNextDrag) { return; }
                const from = document.querySelector('[data-blnext="' + CSS.escape(blNextDrag) + '"]');
                blNextDrag = '';
                if (!from) { return; }
                blPost('backlogReorder', from, {
                    destCode: el.dataset.code || '',
                    destLine: Number(el.dataset.line),
                    place: place
                });
            });
            el.addEventListener('dragend', () => {
                blNextDrag = '';
                document.querySelectorAll('[data-blnext]').forEach(b =>
                    b.classList.remove('dragging', 'drop-left', 'drop-right'));
            });
        });

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

        // ---- the work type. Cycles the CANONICAL set only and writes the rest of
        // the item's tags back untouched — a cycle that quietly ate somebody's
        // `#regression` would be a worse bargain than no cycle at all.
        document.querySelectorAll('[data-bltype]').forEach(el =>
            el.addEventListener('click', () => {
                const row = blRow(el);
                const now = row.dataset.type || '';
                const ring = ['', ...BL_TYPE_IDS];
                const next = ring[(ring.indexOf(now) + 1) % ring.length];
                const item = (((td().backlog || {}).items) || []).find(i => blKey(i) === row.dataset.key);
                const mine = ((item && item.kinds) || []).filter(k => BL_TYPE_IDS.indexOf(k) < 0);
                blPost('backlogSet', row, { fields: { kinds: next ? [next, ...mine] : mine } });
            }));

        // ---- drag to reorder. Only in file order, and only within a section:
        // the drop tells the host WHICH row it landed against, and the host
        // refuses anything that would re-file or re-parent the item.
        let blDragKey = '';
        document.querySelectorAll('[data-blgrip][draggable]').forEach(el =>
            el.addEventListener('dragstart', ev => {
                const row = blRow(el);
                blDragKey = row.dataset.key;
                row.classList.add('dragging');
                if (ev.dataTransfer) { ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', blDragKey); }
            }));
        document.querySelectorAll('[data-blrow]').forEach(row => {
            row.addEventListener('dragover', ev => {
                if (!blDragKey || row.dataset.key === blDragKey) { return; }
                ev.preventDefault();
                const box = row.getBoundingClientRect();
                const before = ev.clientY < box.top + box.height / 2;
                row.classList.toggle('drop-before', before);
                row.classList.toggle('drop-after', !before);
            });
            row.addEventListener('dragleave', () => row.classList.remove('drop-before', 'drop-after'));
            row.addEventListener('drop', ev => {
                ev.preventDefault();
                const place = row.classList.contains('drop-before') ? 'before' : 'after';
                row.classList.remove('drop-before', 'drop-after');
                if (!blDragKey || row.dataset.key === blDragKey) { return; }
                const from = document.querySelector('[data-blrow][data-key="' + CSS.escape(blDragKey) + '"]');
                blDragKey = '';
                if (!from) { return; }
                blPost('backlogReorder', from, {
                    destCode: row.dataset.code || '',
                    destLine: Number(row.dataset.line),
                    place: place
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
                    const box = document.getElementById('bl-new');
                    // The box is a textarea now and an item is ONE markdown line,
                    // so the paragraph is folded here — the same normalisation the
                    // in-place editor does, rather than two different answers to
                    // "what happened to my line breaks".
                    const text = ((box && box.value) || '').replace(/\s+/g, ' ').trim();
                    if (!text) { break; }
                    const val = elId => (document.getElementById(elId) || {}).value || '';
                    const type = val('bl-type');
                    vscode.postMessage({
                        type: 'backlogAdd', id, text,
                        area: val('bl-area'), priority: val('bl-prio'), effort: val('bl-effort'),
                        ...(type ? { kinds: [type] } : {})
                    });
                    break;
                }
                case 'blArchive': vscode.postMessage({ type: 'backlogArchive', id }); break;
                case 'blFilters': blFiltersOpen = !blFiltersOpen; render(); break;
                case 'blDir': blDesc = !blDesc; render(); break;
                case 'blClear':
                    // Everything the reader could have narrowed with, including the
                    // two that live outside the panel — a "clear" that left the
                    // search box full would be the most annoying button on the page.
                    blFilter = {
                        areas: [], kinds: [], prios: [], efforts: [],
                        state: 'live', q: '', blocked: '', epics: '', plan: '', due: ''
                    };
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
     * Clicking anywhere else closes an open row menu.
     *
     * ‼️ Attached ONCE, at module scope, and not in `wire()`. `wire()` runs on
     * every repaint; a document listener added there would accumulate one copy
     * per paint and never be removed — after an hour of a live panel refreshing
     * itself, a single click would run hundreds of them. `#app`'s innerHTML is
     * replaced on a repaint, `document` is not, so once is enough.
     */
    document.addEventListener('click', () => {
        if (!blMenu) { return; }
        blMenu = null;
        render();
    });
    // Esc closes it too — the menu covers the row it belongs to, and reaching for
    // the mouse to dismiss something you opened by mistake is a small tax.
    document.addEventListener('keydown', ev => {
        if (ev.key !== 'Escape' || !blMenu) { return; }
        blMenu = null;
        render();
    });

    // A fresh panel gets its seed in the initial payload — its script was not
    // listening when the message would have been sent.
    if (DATA.newForm) { creating = newForm(DATA.newForm); }
    render();
    if (creating) { askSuggestion(creating.name); }
})();
