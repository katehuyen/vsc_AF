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
        syncView();
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

    // A fresh panel gets its seed in the initial payload — its script was not
    // listening when the message would have been sent.
    if (DATA.newForm) { creating = newForm(DATA.newForm); }
    render();
    if (creating) { askSuggestion(creating.name); }
})();
