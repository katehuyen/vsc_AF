// Agent Farm — search page script (text/regex + semantic, scoped, grouped).
//
// ‼️ X-24 — WHAT THIS PAGE IS FOR, AND WHAT IT WAS MISSING.
//
// The engine could always answer a rich question; the page could only ask a
// poor one. Everything a session IS — its agent, its engine, its project, its
// model, who started it, whether it is a subagent lane, whether it is pinned,
// whether it errored, what its id is — sat in the index unusable, and the only
// axis offered was a date. So "find the thing I said" meant reading a hundred
// hits from sessions that could have been excluded in one press.
//
// The filters here are a SESSION filter, not a result sieve: they narrow the set
// that is scanned, so the "n sessions scanned" figure stays honest and the scan
// gets cheaper rather than the list shorter.
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    const DATA = window.__DATA__;

    let lastResult = null;
    let semStatus = DATA.semantic || { provider: 'off', sessions: 0, chunks: 0 };
    let facets = DATA.facets || { agents: [], engines: [], projects: [], models: [] };
    let idMatch = null;
    let searching = false;
    let timer;
    // Auto-search: every control change re-runs the search (measured: a full
    // everything-scan is ~1.4s on a 95MB fleet, and a 10s engine time budget
    // bounds the worst case). seq lets us drop superseded results.
    let seq = 0;
    // Scope preset pushed by the opener (viewer → one session, agent page → one
    // agent). Cleared with the ✕ pill; fleet-wide otherwise.
    let preset = DATA.preset || null;
    // Agent picker: null = all agents (no filter — a new agent joining the fleet
    // is included without touching the picker; unassigned "Other projects"
    // sessions stay visible too). A Set = exactly the ticked subset; an empty
    // Set honestly matches nothing.
    let agentSel = preset && preset.agentName ? new Set([preset.agentName]) : null;

    /**
     * ‼️ X-25 — SIX KINDS, BECAUSE A DELEGATING AGENT IS NOT A USER.
     *
     * A subagent lane's prompts were written by an AGENT handing work over, and
     * they used to arrive wearing the word "user" — so "search only what I
     * asked" answered with paragraphs one agent wrote to another, and nothing
     * on the page could tell them apart. `delegator` / `handler` are read off
     * the transcript's own `isSidechain`, which is a fact, not a guess.
     */
    const ROLE_CHIPS = [
        { id: 'user', label: '🧑 User', tip: 'What a PERSON asked — prompts typed by you' },
        { id: 'assistant', label: '🤖 Agent', tip: "The agent's own words — its replies only" },
        // 📤 / 📥 rather than a second tool glyph: this row already carries 🔧
        // for tool calls, and a hammer beside a spanner is two icons nobody can
        // tell apart at 11px. A handover goes OUT and its answer comes BACK,
        // which is the one thing about these two kinds that is always true.
        { id: 'delegator', label: '📤 Delegator', tip: 'What one agent asked ANOTHER — the handover text inside a subagent lane' },
        { id: 'handler', label: '📥 Handler', tip: "The subagent's own replies to that handover" },
        { id: 'tool', label: '🔧 Tool calls', tip: 'What it ran: commands, paths, patterns, queries' },
        { id: 'toolResult', label: '📄 Results', tip: 'What came back — file contents, command output' }
    ];
    const ALL_ROLES = ROLE_CHIPS.map(c => c.id);
    /** The named subsets this list has a word for — the same idea AFFilter.multi
     *  calls a preset. Dialog is the default: it is what the page is opened for. */
    const ROLE_PRESETS = [
        {
            id: 'dialog', label: 'Dialog', roles: ['user', 'assistant'],
            tip: 'You and the agent — the conversation, without the machinery and without the subagent lanes'
        },
        {
            id: 'delegation', label: 'Delegation', roles: ['delegator', 'handler'],
            tip: 'Only the subagent lanes: what one agent handed to another, and what came back'
        },
        { id: 'all', label: 'Everything', roles: ALL_ROLES.slice(), tip: 'Every kind, including tool inputs and results' }
    ];
    let roleSel = new Set(['user', 'assistant']);

    /**
     * ‼️ U-42 — A CHIP IS A BADGE, AND A BADGE TOGGLES.
     *
     * These chips briefly meant "only this one" on a plain click, which made
     * the one thing the row is for impossible: searching two kinds at once. The
     * user's question was exactly that — *why must I choose either User or Tool
     * calls; is there a structural obstacle?* There is none: the engine has
     * taken an array of kinds since the day it was written.
     *
     * So the gesture is the Session Viewer's, which is the surface this row was
     * modelled on and the one people have learned: **click toggles**, and
     * Ctrl/⌘-click means "only this one" — the move that used to be the plain
     * click is one modifier away, not gone. The scope can never empty: taking
     * the last kind off returns to Dialog rather than to a page that matches
     * nothing. And the row no longer prints "→ the conversation" at its end,
     * because which chips are lit IS the answer and reading it twice is not
     * reading it better.
     */
    const ROLE_HINT = 'Click to add or remove a kind · Ctrl-click (⌘ on Mac) for only that one';

    /** Which results are ordered how. The engine returns newest-session-first;
     *  these re-order the SESSION GROUPS, never the hits inside one — a session
     *  is read forwards, and shuffling it would make the turn headers a lie. */
    const SORTS = [
        { id: 'newest', label: 'Newest first', tip: 'Most recently active session at the top — the engine\'s own order' },
        { id: 'oldest', label: 'Oldest first', tip: 'Where did this start — the earliest session that mentions it' },
        { id: 'hits', label: 'Most matches', tip: 'The session that says it most, first — where the subject actually lives' },
        { id: 'agent', label: 'By agent', tip: 'Grouped by agent name, A→Z, newest first within each' }
    ];
    const ORIGINS = [
        { id: '', label: 'All', tip: 'Both the sessions you started and the ones a schedule, trigger, task or mission did' },
        { id: 'user', label: '🧑 You', tip: 'Only sessions a person started — an interactive dialog' },
        { id: 'auto', label: '🤖 Automation', tip: 'Only automation runs: a schedule, a trigger, a task or a mission started them' }
    ];
    const LANES = [
        { id: '', label: 'All', tip: 'Main sessions and subagent lanes alike' },
        { id: 'main', label: 'Main only', tip: 'Hide the subagent (sidechain) transcripts' },
        { id: 'sub', label: 'Sub-agents', tip: 'Only the subagent transcripts — delegated work' }
    ];
    // The date window is the engine's own `tsFrom..tsTo` (core/search.ts): it
    // filters the MESSAGE, not the session, so "last Tuesday" means what was
    // said that day and not every session that happens to have been touched.
    const fltDefaults = () => ({
        from: '', to: '', sort: 'newest',
        engines: null, projects: null, models: null,
        origin: '', lane: '', pinnedOnly: false, errorsOnly: false, session: ''
    });
    let flt = fltDefaults();
    let filtersOpen = false;
    let helpOpen = false;
    // Query modes. Held here rather than read off the DOM because `shell()`
    // rebuilds the whole page on every chip press, and a checkbox written as
    // `checked` in the markup came back ticked however you left it.
    let srcMem = true, srcEvents = true;
    let regexOn = false, caseOn = false, wholeOn = false;
    /** What is typed, held in state rather than only in the box.
     *
     *  ‼️ `shell()` rewrites the whole card on every chip press, so the one
     *  thing on this page the user paid for with typing has to survive it. It
     *  used to be carried across by hand after each rebuild, which also meant
     *  the ✕ inside the box was drawn a beat late and a rendered page (the
     *  looking glass) showed an empty box above a full result list. */
    let queryText = '';

    const dialogDefault = () => roleSel.size === 2 && roleSel.has('user') && roleSel.has('assistant');
    /** How many filter axes are narrowing something right now. The agent picker
     *  is NOT counted: it has its own always-visible control, so counting it
     *  would park a permanent "(1)" on the chip and say nothing new — the same
     *  rule the Sessions tables follow for their origin switch. */
    const fltCount = () => (flt.from ? 1 : 0) + (flt.to ? 1 : 0)
        + (flt.sort !== 'newest' ? 1 : 0)
        + (flt.engines ? 1 : 0) + (flt.projects ? 1 : 0) + (flt.models ? 1 : 0)
        + (flt.origin ? 1 : 0) + (flt.lane ? 1 : 0)
        + (flt.pinnedOnly ? 1 : 0) + (flt.errorsOnly ? 1 : 0) + (flt.session ? 1 : 0);
    const fltActive = () => fltCount() > 0 || !dialogDefault() || !srcMem || !srcEvents;

    /** A day string from a date box → the ms bound the engine wants. `to` is the
     *  END of its day, or a one-day window would find nothing. */
    const dayMs = (d, end) => {
        if (!d) { return 0; }
        const t = Date.parse(end ? `${d}T23:59:59.999` : `${d}T00:00:00.000`);
        return Number.isFinite(t) ? t : 0;
    };

    function relTime(ts) {
        if (!ts) return '';
        const s = Math.round((Date.now() - ts) / 1000);
        if (s < 60) return s + 's ago';
        const m = Math.round(s / 60);
        if (m < 60) return m + 'm ago';
        const h = Math.round(m / 60);
        if (h < 24) return h + 'h ago';
        return Math.round(h / 24) + 'd ago';
    }

    /** The rich hover, for anything on this page whose tooltip is a SENTENCE.
     *
     *  ‼️ X-33 — A NATIVE `title` DOES NOT SURVIVE A REPAINT. Every filter
     *  change rebuilds these controls, and a browser does not put `:hover` back
     *  on the node that replaced the one the pointer was on until the pointer
     *  moves — so the tooltip you were reading vanished and did not return.
     *  AFTip bridges exactly that (media/afTip.js), which is why every
     *  explanation on this page goes through it and none of them stays a
     *  `title`. */
    const tip = (trigger, head, body, cls) => window.AFTip.wrap(trigger, head, body, cls);

    function semLine() {
        if (semStatus.provider === 'off') {
            return 'Semantic mode is off — <a id="semsettings">enable it in Farm Settings</a> (gemini, or openai-compatible incl. local Ollama).';
        }
        return `Semantic index (<b>${C.esc(semStatus.provider)}</b>): ${semStatus.sessions} session(s), ${semStatus.chunks} chunk(s) · <a id="build">update index</a>`;
    }

    function scopeLine() {
        if (preset && preset.file) {
            return `<span class="scopepill">Session: ${C.esc(preset.title || preset.file.split(/[\\/]/).pop())} <a id="clearscope" title="Back to fleet-wide search">✕</a></span>`;
        }
        if (preset && preset.agentName) {
            return `<span class="scopepill">Agent: ${C.esc(preset.agentName)} <a id="clearscope" title="Back to fleet-wide search">✕</a></span>`;
        }
        return '';
    }

    // --------------------------------------------------------- the scope chips

    function chipRow() {
        const roleChip = c => tip(
            `<button class="chip${roleSel.has(c.id) ? ' on' : ''}" data-chip="${c.id}">${c.label}</button>`,
            c.label, `${c.tip}\n\n${ROLE_HINT}`);
        const presetChip = p => tip(
            `<button class="chip${sameSet(p.roles) ? ' on' : ''}" data-preset="${p.id}">${p.label}</button>`,
            p.label, p.tip);
        return `<div class="chiprow" id="rolechips">
            ${tip('<span class="muted small">Search in:</span>', 'Search in',
            'Which kinds of message the query is matched against. ' + ROLE_HINT)}
            ${ROLE_PRESETS.map(presetChip).join('')}
            <span class="chipsep"></span>
            ${ROLE_CHIPS.map(roleChip).join('')}
            <span class="chipsep"></span>
            ${tip(`<button class="chip${srcMem ? ' on' : ''}" data-src="mem">📝 Memory</button>`,
            'Memory notes', "The agents' own memory/*.md notes, searched paragraph by paragraph. They are not sessions, so they are listed in their own section and open as files.")}
            ${tip(`<button class="chip${srcEvents ? ' on' : ''}" data-src="events">⌁ Events</button>`,
            'Orphaned live events', 'Live events whose transcript is gone or never existed (external CLI lanes, pruned sessions). Everything else is already covered, richer, by the transcript scan.')}
            <span class="grow"></span>
            ${tip(`<button class="chip af-filter${fltCount() ? ' on' : ''}" id="f-toggle">⚙ Filters${fltCount() ? ` (${fltCount()})` : ''}</button>`,
            'Filters', 'Narrow the SESSIONS that are scanned: engine, project, model, who started them, subagent lanes, pinned, errors, a session id, a date window. Nothing here sieves the hits afterwards — the scan itself gets smaller.', 'tip-right')}
        </div>${filterPanel()}`;
    }

    const sameSet = list => roleSel.size === list.length && list.every(r => roleSel.has(r));

    // ------------------------------------------------------- the filter panel

    function filterPanel() {
        if (!filtersOpen) { return ''; }
        const pickers = [
            window.AFFilter.multi({
                id: 'f-engines', label: 'Engines',
                options: facets.engines.map(e => ({ v: e, t: window.AFEngine.label(e) })),
                selected: flt.engines,
                title: 'Which CLI wrote the transcript — combines with every other filter here'
            }),
            window.AFFilter.multi({
                id: 'f-projects', label: 'Projects', options: facets.projects, selected: flt.projects,
                title: 'Which project the session\'s agent belongs to — the same axis the Sessions tables group by'
            }),
            window.AFFilter.multi({
                id: 'f-models', label: 'Models', options: facets.models, selected: flt.models,
                title: 'Which model the session ran on. A session that changed model appears under each of them.'
            })
        ].join('');
        const seg = (name, list, cur, head, body) =>
            tip(`<span class="seg">${list.map(o =>
                `<button class="chip${cur === o.id ? ' on' : ''}" data-${name}="${o.id}"
                    >${o.label}</button>`).join('')}</span>`, head, body);
        const flag = (key, label, on, head, body) =>
            tip(`<button class="chip${on ? ' on' : ''}" data-flag="${key}">${label}</button>`, head, body);
        return `<div class="fpanel">
            <div class="chiprow">
                ${tip('<span class="muted small">Started by:</span>', 'Started by',
            'Who began the session — a person at a keyboard, or one of Agent Farm\'s own mechanisms (a schedule, a trigger, a task, a mission).')}
                ${seg('origin', ORIGINS, flt.origin, 'Started by', ORIGINS.map(o => `${o.label}: ${o.tip}`).join('\n'))}
                ${tip('<span class="muted small">Lane:</span>', 'Lane',
            'A subagent transcript is a lane of its own: an agent handed work to another agent and this is that conversation.')}
                ${seg('lane', LANES, flt.lane, 'Lane', LANES.map(o => `${o.label}: ${o.tip}`).join('\n'))}
                ${flag('pinnedOnly', '★ Pinned', flt.pinnedOnly, 'Pinned only',
                'Only the sessions on your shelf — the ones you pinned on a Sessions table or through the shelf picker.')}
                ${flag('errorsOnly', '⚠ Has errors', flt.errorsOnly, 'Has errors',
                'Only sessions with at least one tool error. Useful with 🔧 Tool calls / 📄 Results: "where did this break".')}
            </div>
            <div class="chiprow">
                ${tip(`<input type="text" id="f-session" class="fbox" placeholder="session id, path or title…" value="${C.esc(flt.session)}">`,
            'Session', 'X-34 — the id you already know. A full session id, the eight-character prefix this extension prints everywhere ("4d361981"), a transcript path, or part of a title. When it points at exactly one session, a link to it is drawn above the results.')}
                ${pickers}
            </div>
            <div class="chiprow">
                ${tip(`<label class="frange">When
                    <input type="date" id="f-from" value="${C.esc(flt.from)}">–<input type="date" id="f-to" value="${C.esc(flt.to)}"></label>`,
            'When', 'The window applies to WHAT WAS SAID — the message\'s own timestamp — not to when the session was last touched. Both ends are included, and a single day means that whole day.')}
                ${tip(`<label class="frange">Sort
                    <select id="f-sort">${SORTS.map(s =>
                `<option value="${s.id}"${flt.sort === s.id ? ' selected' : ''}>${C.esc(s.label)}</option>`).join('')}</select></label>`,
            'Sort', SORTS.map(s => `${s.label}: ${s.tip}`).join('\n')
            + '\n\nOnly the session GROUPS move. Hits inside a session stay in the order they were said, because the turn headers are computed by walking that order.')}
                <span class="grow"></span>
                ${tip(`<button class="chip${fltActive() ? '' : ' off'}" id="f-clear">Clear filters</button>`,
                'Clear filters', 'Back to the defaults: Dialog, both extra sources, every engine, project and model, every date, newest first. Your query and the agent picker are left alone.', 'tip-right')}
            </div>
        </div>`;
    }

    // --------------------------------------------------------- the help card

    function helpCard() {
        if (!helpOpen) { return ''; }
        const rows = (window.AFQuery.SYNTAX_ROWS || []).map(r =>
            `<tr><td class="qsym"><code>${C.esc(r.sym)}</code></td><td>${C.esc(r.what)}</td>
                <td class="qex"><code>${C.esc(r.example)}</code></td></tr>`).join('');
        return `<div class="helpcard">
            <div class="tablewrap"><table>
                <thead><tr><th>You type</th><th>It means</th><th>For example</th></tr></thead>
                <tbody>${rows}</tbody>
            </table></div>
            <ul class="muted small">
                <li><b>whole word</b> — a bare word must match a whole word: <code>log</code> stops
                    finding <code>dialogue</code>. A <code>*</code> still opens the end it is written on.</li>
                <li><b>match case</b> — <code>Agent</code> stops matching <code>agent</code>.
                    <code>OR</code>, <code>AND</code> and <code>NOT</code> are uppercase-only either way.</li>
                <li><b>regex</b> — the box goes to <code>RegExp</code> untouched and none of the grammar
                    above applies. A runaway pattern is cut by a 10 s budget and says so.</li>
                <li><b>semantic</b> — meaning rather than words ("where I talked about low motivation").
                    Needs an embeddings provider, waits for Enter, and each query is a paid call.</li>
            </ul>
        </div>`;
    }

    // ------------------------------------------------------------- the shell

    function shell() {
        const fileScope = !!(preset && preset.file);
        // the extension-wide multi-pick control (media/afFilters.js) — this page
        // set the pattern, every other filter now uses the same widget
        const agentMenu = window.AFFilter.multi({
            id: 'search-agents', label: 'Agents', options: facets.agents.length ? facets.agents : (DATA.agents || []),
            selected: agentSel ? [...agentSel] : null, disabled: fileScope,
            title: 'Pick which agents to search — tick any combination'
        });
        document.getElementById('app').innerHTML = `
            <style>
                .chiprow { display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin-top:8px; }
                .chip { font-size:11px; padding:2px 10px; border-radius:10px; cursor:pointer;
                    background:transparent; color:var(--vscode-foreground); opacity:.75;
                    border:1px solid var(--vscode-widget-border, #4444); }
                .chip.on { background:var(--vscode-button-background); color:var(--vscode-button-foreground);
                    border-color:transparent; opacity:1; }
                /* nothing to clear — drawn, so the row does not reflow when a
                   filter is set, but plainly inert (the same rule the capture
                   box's ↺ follows on the Backlog tab) */
                .chip.off { opacity:.25; cursor:default; }
                .chip.off:hover { background:transparent; }
                /* a segmented control: one answer out of three, drawn as one
                   object so it does not read as three independent toggles */
                .seg { display:inline-flex; gap:0; }
                .seg .chip { border-radius:0; margin:0; }
                .seg .chip:first-child { border-radius:10px 0 0 10px; }
                .seg .chip:last-child { border-radius:0 10px 10px 0; }
                /* the two presets are a different question from the six kinds:
                   "the usual readings" then "exactly these" */
                .chipsep { width:1px; align-self:stretch; margin:0 4px;
                    background:var(--vscode-widget-border, #4444); }
                .chiprow .grow { flex:1; }
                .nowrap { white-space:nowrap; }
                .fpanel { border:1px solid var(--vscode-widget-border, #4444); border-radius:6px;
                    padding:2px 8px 8px; margin-top:6px;
                    background:var(--vscode-editorWidget-background, transparent); }
                .fbox { font-size:11px; padding:2px 6px; min-width:190px; }
                .frange { font-size:11px; display:inline-flex; gap:4px; align-items:center; }
                .frange input, .frange select { font-size:11px; padding:1px 4px; }
                .helpcard { border:1px solid var(--vscode-widget-border, #4444); border-radius:6px;
                    padding:8px 10px; margin-top:8px;
                    background:var(--vscode-editorWidget-background, transparent); }
                .helpcard table { font-size:12px; }
                .helpcard td.qsym, .helpcard td.qex { white-space:nowrap; }
                .helpcard ul { margin:8px 0 0; padding-left:18px; }
                .helpcard li { margin:2px 0; }
                .scopepill { font-size:11px; padding:2px 10px; border-radius:10px; white-space:nowrap;
                    background:var(--vscode-badge-background); color:var(--vscode-badge-foreground); }
                .scopepill a { cursor:pointer; margin-left:4px; }
                /* X-34: the session an id points at, above the hits it also mentions */
                .idhit { margin-top:10px; padding:6px 10px; border-radius:4px; cursor:pointer;
                    border-left:3px solid var(--vscode-charts-blue, #3794ff);
                    background:color-mix(in srgb, var(--vscode-charts-blue, #3794ff) 12%, transparent); }
                /* …and when it points at none or several: the same shape, said
                   quietly, with the way out on the end of it */
                .idmiss { margin-top:10px; padding:6px 10px; border-radius:4px; font-size:12px;
                    border-left:3px solid var(--vscode-descriptionForeground);
                    background:color-mix(in srgb, var(--vscode-descriptionForeground) 8%, transparent); }
                .idmiss a { cursor:pointer; margin-left:6px; white-space:nowrap; }
                .sessgroup { margin-bottom:12px; }
                .sessgroup > .sesshead { cursor:pointer; padding:6px 10px; border-radius:4px;
                    background:color-mix(in srgb, var(--vscode-textLink-foreground) 10%, transparent);
                    border-left:3px solid var(--vscode-textLink-foreground); }
                .turnhead { margin:8px 0 2px 10px; font-size:11px; color:var(--vscode-descriptionForeground); }
                .hit { cursor:pointer; padding:5px 10px; margin-left:10px; border-radius:4px; }
                .hit:hover { background:var(--vscode-list-hoverBackground); }
                .srchead { margin:16px 0 6px; font-size:12px; font-weight:600; opacity:.8; }
                mark { background:var(--vscode-editor-findMatchHighlightBackground, #6a5); color:inherit; }
            </style>
            ${window.AFHeader.html({
            page: 'search',
            title: 'Search',
            sub: `Dialog, delegation, tool traffic, agents' memory notes and orphaned live events — every engine, scoped to fleet, agent or session. <a data-guide="transcript-arama">?</a>`,
            refresh: false,
            guide: 'transcript-arama'
        })}
            <div class="card" style="margin-top:10px; position:relative">
                <div class="btnrow" style="flex-wrap:wrap; align-items:center">
                    <input id="q" type="text" value="${C.esc(queryText)}" placeholder="Search text, regex or a semantic question…" style="flex:1; min-width:240px; padding:6px 8px" autofocus
                        title="${C.esc(window.AFQuery.tip('Searched against whatever the scope and the kind chips let through. “regex” hands the box to RegExp instead and none of the grammar below applies.', { wholeWord: wholeOn }))}">
                    <span id="scope">${scopeLine()}</span>
                    ${agentMenu}
                    <label class="small"><input id="semantic" type="checkbox"> semantic</label>
                    <label class="small" id="regexLbl"><input id="regex" type="checkbox"${regexOn ? ' checked' : ''}> regex</label>
                    <label class="small" id="caseLbl"><input id="case" type="checkbox"${caseOn ? ' checked' : ''}> match case</label>
                    <label class="small" id="wholeLbl"><input id="whole" type="checkbox"${wholeOn ? ' checked' : ''}> whole word</label>
                    <button id="go">Search</button>
                    ${tip(`<button class="chip${helpOpen ? ' on' : ''}" id="qhelp">?</button>`,
            'Query syntax', 'Open the grammar: what two words mean, how to say either/or, how to exclude, how to ask for a phrase, and what the four mode boxes do.', 'tip-right')}
                </div>
                ${chipRow()}
                ${helpCard()}
                <div class="muted small" id="semStatus" style="margin-top:6px">${semLine()}</div>
            </div>
            <div id="out" style="margin-top:12px"></div>`;

        const q = document.getElementById('q');
        const semBox = document.getElementById('semantic');
        const run = () => {
            const query = q.value;
            queryText = query;
            if (!query.trim()) { return; }
            searching = true;
            renderResults();
            vscode.postMessage({
                type: 'search',
                query,
                seq: ++seq,
                semantic: semBox.checked,
                regex: regexOn,
                caseSensitive: caseOn,
                wholeWord: wholeOn,
                // null = all agents (no filter); an array = exactly that set
                agents: preset && preset.file ? null : (agentSel ? [...agentSel] : null),
                file: preset && preset.file ? preset.file : '',
                roles: [...roleSel],
                memory: srcMem,
                events: srcEvents,
                // the engine's own message-time window (core/search.ts)
                tsFrom: dayMs(flt.from, false),
                tsTo: dayMs(flt.to, true),
                // ‼️ the session axis — see the header of this file
                filters: {
                    engines: flt.engines, projects: flt.projects, models: flt.models,
                    origin: flt.origin, lane: flt.lane,
                    pinnedOnly: flt.pinnedOnly, errorsOnly: flt.errorsOnly,
                    session: flt.session
                }
            });
        };
        // Any control change re-searches after a short debounce — but never in
        // semantic mode, where each query is a paid embedding call.
        const scheduleRun = () => {
            clearTimeout(timer);
            if (!semBox.checked && q.value.trim()) { timer = setTimeout(run, 250); }
        };
        window.AFHeader.wire(vscode);
        document.getElementById('go').addEventListener('click', run);
        q.addEventListener('keydown', ev => { if (ev.key === 'Enter') run(); });
        q.addEventListener('input', () => {
            queryText = q.value;
            clearTimeout(timer);
            if (!semBox.checked && q.value.trim().length >= 3) { timer = setTimeout(run, 500); }
        });
        // ✕ inside the box — the shared control (common.css `.af-clr`). Clearing
        // it clears the RESULTS too: leaving the last search's hits under an
        // empty box is the page claiming to have found something for nothing.
        window.AFFilter.clearable(q, () => {
            clearTimeout(timer);
            queryText = '';
            lastResult = null;
            idMatch = null;
            searching = false;
            renderResults();
        });
        const mode = (id, set) => {
            const el = document.getElementById(id);
            if (el) { el.addEventListener('change', () => { set(el.checked); rebuildKeepingQuery(true); }); }
        };
        mode('regex', v => { regexOn = v; });
        mode('case', v => { caseOn = v; });
        // whole word changes what the box MEANS, so its own hover has to be
        // rewritten — which a repaint does for free
        mode('whole', v => { wholeOn = v; });

        const help = document.getElementById('qhelp');
        if (help) { help.addEventListener('click', () => { helpOpen = !helpOpen; rebuildKeepingQuery(false); }); }
        const fToggle = document.getElementById('f-toggle');
        if (fToggle) { fToggle.addEventListener('click', () => { filtersOpen = !filtersOpen; rebuildKeepingQuery(false); }); }

        // ---- the filter panel ------------------------------------------------
        if (filtersOpen) {
            // AFFilter.live is what the tables use, and it is what keeps the native
            // calendar from closing under the cursor: a date box commits on `change`
            // only, never on the half-formed values a picker walks through (A-4).
            window.AFFilter.live(document.getElementById('f-from'), el => { flt.from = el.value; scheduleRun(); }, 300);
            window.AFFilter.live(document.getElementById('f-to'), el => { flt.to = el.value; scheduleRun(); }, 300);
            const sess = document.getElementById('f-session');
            if (sess) {
                window.AFFilter.live(sess, el => { flt.session = el.value; scheduleRun(); }, 300);
                window.AFFilter.clearable(sess, el => { flt.session = ''; el.value = ''; scheduleRun(); });
            }
            const sortSel = document.getElementById('f-sort');
            if (sortSel) {
                // sorting is a re-read of what is already here — no round trip
                sortSel.addEventListener('change', () => { flt.sort = sortSel.value; rebuildKeepingQuery(false); });
            }
            const clearBtn = document.getElementById('f-clear');
            if (clearBtn && fltActive()) {
                clearBtn.addEventListener('click', () => {
                    flt = fltDefaults();
                    roleSel = new Set(['user', 'assistant']);
                    srcMem = true; srcEvents = true;
                    rebuildKeepingQuery(true);
                });
            }
            const pick = (id, key) => window.AFFilter.wireMulti({
                id, onChange: sel => { flt[key] = sel; scheduleRun(); }
            });
            pick('f-engines', 'engines');
            pick('f-projects', 'projects');
            pick('f-models', 'models');
            const seg = (attr, key) => document.querySelectorAll(`[data-${attr}]`).forEach(b =>
                b.addEventListener('click', () => { flt[key] = b.dataset[attr]; rebuildKeepingQuery(true); }));
            seg('origin', 'origin');
            seg('lane', 'lane');
            document.querySelectorAll('[data-flag]').forEach(b =>
                b.addEventListener('click', () => {
                    flt[b.dataset.flag] = !flt[b.dataset.flag];
                    rebuildKeepingQuery(true);
                }));
        }

        // ---- agent picker (the shared multi-pick control) ----
        // a selection that no longer matches the "Agent: X" pill retires the pill
        const dropStaleAgentPreset = () => {
            if (preset && preset.agentName &&
                !(agentSel && agentSel.size === 1 && agentSel.has(preset.agentName))) {
                preset = null;
                const sc = document.getElementById('scope');
                if (sc) { sc.innerHTML = scopeLine(); }
            }
        };
        window.AFFilter.wireMulti({
            id: 'search-agents',
            onChange: sel => {
                agentSel = sel === null ? null : new Set(sel);
                dropStaleAgentPreset();
                scheduleRun();
            }
        });
        semBox.addEventListener('change', () => {
            ['regexLbl', 'caseLbl', 'wholeLbl'].forEach(id => {
                const el = document.getElementById(id);
                if (el) { el.style.opacity = semBox.checked ? '0.4' : '1'; }
            });
        });
        document.querySelectorAll('#rolechips .chip[data-chip],#rolechips .chip[data-preset]').forEach(chip =>
            chip.addEventListener('click', ev => {
                const p = chip.dataset.preset
                    && ROLE_PRESETS.filter(x => x.id === chip.dataset.preset)[0];
                if (p) { roleSel = new Set(p.roles); }
                else {
                    const id = chip.dataset.chip;
                    // ‼️ U-42 — PLAIN CLICK TOGGLES (see ROLE_HINT). The engine
                    // has always taken an array of kinds, so "search my prompts
                    // AND the tool calls" was only ever a UI decision. Ctrl/⌘
                    // keeps the "only this one" move.
                    if (ev.ctrlKey || ev.metaKey) { roleSel = new Set([id]); }
                    else if (roleSel.has(id)) { roleSel.delete(id); } else { roleSel.add(id); }
                    // an empty scope matches nothing and reads as a broken page
                    if (!roleSel.size) { roleSel = new Set(['user', 'assistant']); }
                }
                rebuildKeepingQuery(true);
            }));
        document.querySelectorAll('#rolechips .chip[data-src]').forEach(chip =>
            chip.addEventListener('click', () => {
                if (chip.dataset.src === 'mem') { srcMem = !srcMem; } else { srcEvents = !srcEvents; }
                rebuildKeepingQuery(true);
            }));
        const clear = document.getElementById('clearscope');
        if (clear) {
            // ✕ = back to fleet-wide: the agent pick widens back to all too
            clear.addEventListener('click', () => { preset = null; agentSel = null; shell(); });
        }
        wireCommon();
    }

    /**
     * Rebuild the controls without losing what is typed in the box.
     *
     * Every filter on this page is part of the markup, so changing one means
     * `shell()` — and `shell()` writes an empty query box. The query is the one
     * thing on the page the user paid for with typing, so it is carried across
     * by hand, along with the semantic tick (which decides whether a rerun
     * costs money and must not be flipped by a repaint).
     *
     * `rerun` is false for anything the results can answer without the host —
     * changing the sort re-reads hits that are already here.
     */
    function rebuildKeepingQuery(rerun) {
        const qEl = document.getElementById('q');
        const semEl = document.getElementById('semantic');
        // the last keystroke may not have reached `queryText` yet
        if (qEl) { queryText = qEl.value; }
        const held = { q: queryText, sem: semEl ? semEl.checked : false };
        shell();
        const q2 = document.getElementById('q');
        const sem2 = document.getElementById('semantic');
        if (sem2) { sem2.checked = held.sem; }
        if (rerun && held.q.trim()) { document.getElementById('go').click(); return; }
        renderResults();
        if (!held.q.trim() && q2) { q2.focus(); }
    }

    function wireCommon() {
        document.querySelectorAll('[data-guide]').forEach(a =>
            a.addEventListener('click', () => vscode.postMessage({ type: 'openGuide', anchor: a.dataset.guide })));
        const build = document.getElementById('build');
        if (build) { build.addEventListener('click', () => vscode.postMessage({ type: 'buildIndex' })); }
        const sem = document.getElementById('semsettings');
        if (sem) { sem.addEventListener('click', () => vscode.postMessage({ type: 'openFarmSettings', focus: 'agentFarm.embeddingsProvider' })); }
    }

    // ------------------------------------------------------------- results

    /** What a hit's badge says. The role alone is not always enough: a
     *  delegation was written BY an agent, and which one is the point. */
    const ROLE_WORD = {
        user: 'user', assistant: 'agent', delegator: 'delegator', handler: 'handler',
        tool: 'tool', toolResult: 'result', memory: 'memory', event: 'event'
    };
    function roleWord(h) {
        const w = ROLE_WORD[h.role] || h.role;
        if (h.role === 'delegator' && h.speaker) { return `${w} (${h.speaker})`; }
        return h.tool ? `${w} · ${h.tool}` : w;
    }
    /** The kinds this page is searching, in the chips' own words. */
    const scopeWords = () => ROLE_CHIPS.filter(c => roleSel.has(c.id)).map(c => c.label).join(' · ');
    /**
     * The kinds handed to the transcript viewer when a hit is clicked.
     *
     * The viewer's own chips are user / assistant / tool / result: it draws a
     * delegation lane inside the session rather than as a filter of its own, so
     * the two delegation kinds are handed over as the lines they are.
     */
    const viewerRoles = () => {
        const out = new Set();
        roleSel.forEach(r => out.add(r === 'delegator' ? 'user' : r === 'handler' ? 'assistant' : r));
        return [...out];
    };

    function hitLine(h, i) {
        const badges = [
            `<span class="badge">${C.esc(roleWord(h))}</span>`,
            typeof h.score === 'number' ? `<span class="badge">${Math.round(h.score * 100)}%</span>` : ''
        ].filter(Boolean).join(' ');
        // ‼️ A transcript hit is a SESSION as well as a match, so it publishes
        // itself as `afSearchHit` — a member of the session family in
        // src/core/ctxmenu.ts. One right-click therefore offers what you can do
        // to that session AND what is true only of this match: open the
        // transcript at this moment, narrow the search, copy the line. A memory
        // or event hit is not a session and is given nothing it cannot do.
        const isSession = h.kind !== 'memory' && h.kind !== 'event' && !!h.file;
        const ctx = isSession
            ? ' ' + window.AFSessionCtx.row(h, { webviewSection: 'afSearchHit', hitIndex: i, hitTs: h.ts || 0 })
            : '';
        return `<div class="hit" data-hit="${i}"${ctx}${isSession
            ? ` title="Open this moment — ${window.AFSessionCtx.HINT}, and this match's own"` : ''}>
            <span class="muted small" style="float:right">${relTime(h.ts)}</span>
            ${badges} ${C.esc(h.before)}${h.match ? `<mark>${C.esc(h.match)}</mark>` : ''}${C.esc(h.after)}
        </div>`;
    }

    /** X-34 — the session an id points at, drawn ABOVE the hits that merely
     *  mention it. It never narrows the search: an id pasted into the box is as
     *  often "where was this discussed" as "open it".
     *
     *  ‼️ AND WHEN IT POINTS AT NOTHING, THE PAGE SAYS WHERE TO GO. A prefix
     *  shared by two sessions is not an answer, and a page that silently draws
     *  no banner leaves the reader believing their id does not exist. The
     *  picker (`Find Session by ID…`) ranks every session in the fleet against
     *  the same text, so the dead end becomes one press. */
    function idHitHtml() {
        if (!idMatch) {
            const q = String(flt.session || '').trim();
            if (q.length < 3) { return ''; }
            return `<div class="idmiss" id="idmiss">
                <b>${C.esc(q)}</b> does not point at exactly one session
                <span class="muted small">— it may be a prefix two sessions share, or not an id at all.</span>
                <a id="idfind">Find session by id ▸</a>
            </div>`;
        }
        return `<div class="idhit" id="idhit" ${window.AFSessionCtx.row({
            file: idMatch.file, sessionId: idMatch.sessionId,
            agentName: idMatch.agentName, title: idMatch.title
        })} title="Open this session — ${window.AFSessionCtx.HINT}">
            → <b>Session #${C.esc(String(idMatch.sessionId).slice(0, 8))}</b>
            ${window.AFEngine.badge(idMatch.engine)}
            ${C.esc(idMatch.agentName || '')} · ${C.esc(idMatch.title || '')}
            <span class="muted small" style="float:right">${relTime(idMatch.ts)} · open</span>
        </div>`;
    }

    /** Session → turn tree for transcript hits; flat sections for memory/events. */
    function renderResults() {
        const out = document.getElementById('out');
        if (searching) {
            out.innerHTML = idHitHtml() + '<p class="muted">Searching…</p>';
            wireIdHit();
            return;
        }
        if (!lastResult) {
            out.innerHTML = idHitHtml() + '<p class="muted">Type a query and press Enter.</p>';
            wireIdHit();
            return;
        }
        const r = lastResult;
        if (r.error) {
            out.innerHTML = `<p class="muted">⚠ ${C.esc(r.error)}</p>`;
            return;
        }
        if (!r.hits.length) {
            out.innerHTML = idHitHtml()
                + `<p class="muted">No matches in ${r.filesScanned} session(s) — searched in ${C.esc(scopeWords())}.</p>`;
            wireIdHit();
            return;
        }
        const trans = [], mem = [], evs = [];
        r.hits.forEach((h, i) => {
            if (h.kind === 'memory') { mem.push(i); }
            else if (h.kind === 'event') { evs.push(i); }
            else { trans.push(i); }
        });

        // group transcript hits by session file, keep engine order (newest first)
        const groups = [];
        const byFile = {};
        for (const i of trans) {
            const h = r.hits[i];
            if (!byFile[h.file]) { byFile[h.file] = { hits: [] }; groups.push(byFile[h.file]); }
            byFile[h.file].hits.push(i);
        }
        /**
         * ‼️ ONLY THE GROUPS MOVE. The hits inside a session stay in the order
         * they were said — the turn sub-headers are computed by walking that
         * order, so a session sorted by anything else would print "Turn 7"
         * above a line from turn 2 and the map would lie.
         *
         * The engine hands them over newest-session-first, which is `newest`
         * and therefore costs nothing. The other three are a re-read of what is
         * already on the page: no round trip, and the same figures.
         */
        const groupTs = g => r.hits[g.hits[0]].ts || 0;
        const groupAgent = g => String(r.hits[g.hits[0]].agentName || '');
        if (flt.sort === 'oldest') { groups.sort((a, b) => groupTs(a) - groupTs(b)); }
        else if (flt.sort === 'hits') { groups.sort((a, b) => b.hits.length - a.hits.length || groupTs(b) - groupTs(a)); }
        else if (flt.sort === 'agent') {
            groups.sort((a, b) => groupAgent(a).localeCompare(groupAgent(b)) || groupTs(b) - groupTs(a));
        }
        const sessHtml = groups.map(g => {
            const first = r.hits[g.hits[0]];
            // turn sub-headers whenever the turn changes (hits arrive in file order)
            let lastTurn = null;
            const body = g.hits.map(i => {
                const h = r.hits[i];
                const th = h.turn !== lastTurn && h.turn
                    ? `<div class="turnhead">Turn ${h.turn}${h.turnLabel ? ' — ' + C.esc(h.turnLabel) : ''}</div>` : '';
                lastTurn = h.turn;
                return th + hitLine(h, i);
            }).join('');
            // The group header is a session row: right-click gets that
            // session's full action set (afSessionCtx.js). A hit knows the
            // transcript path but not always the session id — the host resolves
            // one from the other, so the menu is the same as everywhere else.
            //
            // ‼️ X-35 — and it says WHICH ENGINE. A result list over a
            // four-engine fleet in which every row looks like a Claude row is
            // the same defect the Sessions tables had.
            return `<div class="sessgroup">
                <div class="sesshead" data-open-session="${C.esc(first.file)}" data-ts="${first.ts || 0}"
                    ${window.AFSessionCtx.row(first)}
                    title="Open this session — ${window.AFSessionCtx.HINT}">
                    ${window.AFEngine.badge(first.engine || 'claude')}
                    <strong>${C.esc(first.agentName)}</strong> · ${C.esc(first.title)}
                    <span class="muted small" style="float:right">${g.hits.length} hit(s) · ${relTime(first.ts)}</span>
                </div>
                ${body}
            </div>`;
        }).join('');

        const memHtml = mem.length
            ? `<div class="srchead">📝 Memory notes</div>` + mem.map(i => hitLine(r.hits[i], i)).join('')
            : '';
        const evHtml = evs.length
            ? `<div class="srchead">⌁ Live events (no transcript left)</div>` + evs.map(i => hitLine(r.hits[i], i)).join('')
            : '';

        const unsearched = ROLE_CHIPS.length - roleSel.size;
        out.innerHTML = `${idHitHtml()}
            <p class="muted small">${r.hits.length} match(es) in ${r.filesScanned} scanned session(s)${r.timedOut ? ' — ⏱ time budget hit, results are partial (narrow the scope or query)' : r.truncated ? ' — results capped, refine your query' : ''}
            — searched in ${C.esc(scopeWords())}${unsearched > 0 ? ` (${unsearched} other kind${unsearched === 1 ? '' : 's'} not searched)` : ''}.</p>
            ${sessHtml}${memHtml}${evHtml}`;
        // ‼️ THE ANSWER OPENS IN THE SCOPE THE QUESTION WAS ASKED IN. A hit is
        // reached by clicking it, and the transcript used to open showing
        // EVERYTHING — tool calls, results, the lot — however narrow the search
        // had been. Searching in Dialog is a statement about what you are
        // looking through, and it has to survive the click, or the page you
        // land on is answering a question you did not ask. `roles` carries it
        // (see SessionViewerPanel.show); searched in Everything, it opens in
        // everything, which is the same rule and not an exception to it.
        const openSession = (file, ts) => vscode.postMessage({
            type: 'openSession', file, ts: ts || 0, roles: viewerRoles()
        });
        out.querySelectorAll('[data-hit]').forEach(el =>
            el.addEventListener('click', () => {
                const hit = r.hits[Number(el.dataset.hit)];
                if (hit.kind === 'memory') {
                    vscode.postMessage({ type: 'openFile', file: hit.file });
                } else if (hit.kind === 'event') {
                    if (hit.file) { openSession(hit.file, hit.ts); }
                    else { vscode.postMessage({ type: 'openTimeline' }); }
                } else {
                    // ts rides along: the viewer opens scrolled to the matched message.
                    openSession(hit.file, hit.ts);
                }
            }));
        out.querySelectorAll('[data-open-session]').forEach(el =>
            el.addEventListener('click', () => openSession(el.dataset.openSession, Number(el.dataset.ts) || 0)));
        wireIdHit();
    }

    function wireIdHit() {
        const el = document.getElementById('idhit');
        if (el && idMatch) {
            el.addEventListener('click', () => vscode.postMessage({
                type: 'openSession', file: idMatch.file, ts: 0, roles: viewerRoles()
            }));
        }
        const find = document.getElementById('idfind');
        // the whole-fleet picker, seeded with what is already typed — the
        // command the palette offers, reached from the page that raised the
        // question rather than from a menu the reader has to remember
        if (find) {
            find.addEventListener('click', () =>
                vscode.postMessage({ type: 'findSession', q: String(flt.session || '') }));
        }
    }

    // ------------------------------------------------------- right-click menu

    /**
     * A match's own half of the menu. Narrowing the scope is the act this page
     * needed most: the two questions a hit raises are "what else did this
     * session say" and "what else has this agent said", and both meant finding
     * the scope controls and retyping the query. Both run the page's own scope
     * preset — the same one the viewer and the agent page push in.
     */
    function ctxDo(act, ctx) {
        const verb = act.split(':')[0];
        const arg = act.slice(verb.length + 1);
        const hit = lastResult && lastResult.hits ? lastResult.hits[Number(ctx.hitIndex)] : null;

        if (verb === 'shOpen') {
            // the same handover the left-click makes — see openSession above
            vscode.postMessage({
                type: 'openSession', file: String(ctx.file || ''), ts: Number(ctx.hitTs) || 0,
                roles: viewerRoles()
            });
            return;
        }
        if (verb === 'shOnly') {
            if (arg === 'agent' && ctx.agentName) {
                preset = { agentName: String(ctx.agentName) };
                agentSel = new Set([String(ctx.agentName)]);
            } else {
                preset = { file: String(ctx.file || ''), title: String(ctx.title || '') };
            }
            // shell() repaints the controls and re-runs whatever is typed.
            shell();
            const go = document.getElementById('go');
            const q = document.getElementById('q');
            if (go && q && q.value.trim()) { go.click(); }
            return;
        }
        if (verb === 'shCopy') {
            if (!hit) { window.AFCtx.copy(''); return; }
            window.AFCtx.copy(arg === 'context'
                ? String(hit.before || '') + String(hit.match || '') + String(hit.after || '')
                : String(hit.match || hit.before || ''));
        }
    }

    // ‼️ ONCE, at module scope — renderResults() rebuilds every hit each search.
    window.AFCtx.listen(ctxDo);

    window.addEventListener('message', ev => {
        if (ev.data.type === 'preset') {
            preset = ev.data.preset || null;
            if (preset && preset.agentName) { agentSel = new Set([preset.agentName]); }
            shell();
            return;
        }
        if (ev.data.type === 'results') {
            // a newer search is already in flight — drop this stale result
            if (ev.data.seq && ev.data.seq !== seq) { return; }
            searching = false;
            lastResult = ev.data.result;
            idMatch = ev.data.idMatch || null;
            if (ev.data.facets) { facets = ev.data.facets; }
            if (ev.data.semanticStatus) {
                semStatus = ev.data.semanticStatus;
                const el = document.getElementById('semStatus');
                if (el) { el.innerHTML = semLine(); wireCommon(); }
            }
            renderResults();
        }
    });

    shell();
})();
