// Agent Farm — compact fleet search: rich scope without hiding the answer.
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    const DATA = window.__DATA__;

    const ROLES = [
        { id: 'user', icon: '🧑', label: 'You', text: 'Prompts a PERSON wrote. A transcript calls its whole input channel "user", so this used to include every brief Agent Farm generated for a mission, task or schedule; those are under Automation now. Work assigned between agents is under Delegator instead' },
        { id: 'automation', icon: '🤖', label: 'Automation', text: 'Prompts a PROGRAM wrote on the same input channel — a mission brief, a task, a schedule or trigger instruction, or a headless run with no launcher on record. Also covers an imported transcript whose real author cannot be verified' },
        { id: 'assistant', icon: '🤖', label: 'Agent', text: 'Answers from the main agent in an ordinary session. Answers produced inside delegated work are under Handler instead' },
        { id: 'delegator', icon: '📤', label: 'Delegator', text: 'The work instruction one agent sent to another agent when it delegated a task' },
        { id: 'handler', icon: '📥', label: 'Handler', text: 'The answer produced by the agent that handled a delegated task' },
        { id: 'tool', icon: '🔧', label: 'Tools', text: 'Tool names together with the submitted commands, paths, queries and other inputs' },
        { id: 'toolResult', icon: '📄', label: 'Results', text: 'Content returned by tools, including file contents, command output and errors' }
    ];
    const ALL_ROLES = ROLES.map(x => x.id);
    const DEFAULT_ROLES = ['user', 'automation', 'assistant'];
    const PRESETS = [
        { id: 'dialog', label: 'Conversation', roles: ['user', 'automation', 'assistant'] },
        { id: 'human', label: 'People only', roles: ['user', 'assistant'] },
        { id: 'delegation', label: 'Delegation', roles: ['delegator', 'handler'] },
        { id: 'tools', label: 'Tool trail', roles: ['tool', 'toolResult'] },
        { id: 'all', label: 'Everything', roles: ALL_ROLES }
    ];
    const SORTS = [
        { id: 'newest', label: 'Newest activity' },
        { id: 'oldest', label: 'Oldest activity' },
        { id: 'hits', label: 'Most matches' },
        { id: 'agent', label: 'Agent A–Z' }
    ];

    let facets = DATA.facets || { agents: [], engines: [], projects: [], models: [] };
    let semStatus = DATA.semantic || { provider: 'off', sessions: 0, chunks: 0 };
    let preset = DATA.preset || null;
    let agentSel = preset && preset.agentName ? new Set([preset.agentName]) : null;
    let roleSel = new Set(DEFAULT_ROLES);
    let mode = 'text';
    let queryText = '';
    let caseOn = false;
    let wholeOn = false;
    let sourceMemory = true;
    let sourceEvents = true;
    let moreOpen = false;
    let guideOpen = false;
    let lastResult = null;
    let idMatch = null;
    let searching = false;
    let dirty = false;
    // X-42: the one-time corpus build, while it is happening. A wait nobody can
    // see reads as a hang; a wait with a number on it reads as work.
    let prep = null;
    let seq = 0;
    let queryTimer = null;
    let opened = false;
    const defaultFilters = () => ({
        engines: null, projects: null, models: null,
        origin: '', lane: '', pinnedOnly: false, errorsOnly: false,
        session: '', from: '', to: '', sort: 'newest'
    });
    let flt = defaultFilters();

    const tip = (trigger, head, body, cls) => window.AFTip.wrap(trigger, head, body, cls);
    const sameSet = list => roleSel.size === list.length && list.every(x => roleSel.has(x));
    const dayMs = (v, end) => {
        if (!v) return 0;
        const n = Date.parse(`${v}T${end ? '23:59:59.999' : '00:00:00.000'}`);
        return Number.isFinite(n) ? n : 0;
    };
    const relTime = ts => {
        if (!ts) return '';
        const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
        if (s < 60) return `${s}s ago`;
        const m = Math.round(s / 60); if (m < 60) return `${m}m ago`;
        const h = Math.round(m / 60); if (h < 24) return `${h}h ago`;
        return `${Math.round(h / 24)}d ago`;
    };
    const activeFilterCount = () => [
        flt.engines, flt.projects, flt.models, flt.origin, flt.lane,
        flt.pinnedOnly, flt.errorsOnly, flt.session, flt.from, flt.to,
        flt.sort !== 'newest'
    ].filter(Boolean).length;
    const sessionFilterCount = () => activeFilterCount()
        + (agentSel !== null ? 1 : 0) + (preset && preset.file ? 1 : 0);
    /**
     * ‼️ A CONTROL CLEARS THE BLOCK IT SITS IN, AND NOTHING ELSE.
     *
     * The reset used to appear for ANY state on the page — including a session
     * filter it does not touch — and it sat at the opposite end of the row from
     * the badges it puts back, with the filter's own Clear at the end where the
     * reset belonged. Two clearers, each pointing at the other's block. So: the
     * content scope resets from inside the content-scope block, the session
     * filters clear from beside the Filters button, and each one answers only
     * for what a reader can see next to it.
     */
    const scopeChanged = () => !sameSet(DEFAULT_ROLES) || !sourceMemory || !sourceEvents;

    /**
     * ‼️ U-88 — WHAT A SCOPE CHIP PUBLISHES SO IT CAN HAVE A MENU.
     *
     * `alone` is the whole reason this carries more than an id: "Choose only
     * this" on the chip that is ALREADY the only one lit does nothing, and a
     * menu item that does nothing is worse than an absent one — the reader
     * clicks it and learns nothing about why the page did not move. The
     * catalogue hides it on that condition, which it can only do if the chip
     * says so here.
     */
    function chipCtx(kind, id, label) {
        const lit = (kind === 'role' ? roleSel.has(id) : (id === 'memory' ? sourceMemory : sourceEvents));
        return window.AFCtx.row('afScopeChip', {
            scopeKind: kind, scopeId: id, scopeLabel: label,
            scopeOn: lit, scopeAlone: lit && litCount() === 1
        });
    }

    /** How many of the nine scope chips are lit — roles and the two sources are
     *  ONE scope to the reader, so they are one count here too. */
    function litCount() {
        return roleSel.size + (sourceMemory ? 1 : 0) + (sourceEvents ? 1 : 0);
    }

    /**
     * ‼️ "ONLY THIS" MEANS ONLY THIS — across all nine chips, not within the
     * axis the chip happens to live on.
     *
     * Roles and the two sources are two different things in the wire payload
     * (an array and two booleans) and ONE thing on screen: a row of chips the
     * reader ticks. Keeping the gesture inside its own axis would have made
     * "only Memory" leave the whole conversation lit — which is not what the
     * words say, and not what somebody clicking it wants.
     */
    function chooseOnly(kind, id) {
        if (kind === 'source') {
            roleSel = new Set();
            sourceMemory = id === 'memory';
            sourceEvents = id === 'events';
        } else {
            roleSel = new Set([id]);
            sourceMemory = false;
            sourceEvents = false;
        }
        changed();
    }

    function badge(attrs, label, on, disabled) {
        return `<button type="button" class="chip${on ? ' on' : ''}${disabled ? ' disabled' : ''}"
            ${attrs} aria-pressed="${on ? 'true' : 'false'}"${disabled ? ' disabled' : ''}>
            <span class="chip-check" aria-hidden="true">✓</span><span class="chip-label">${label}</span>
        </button>`;
    }

    function scopeHtml() {
        if (!preset) return '<span class="scope-note">Fleet-wide</span>';
        const label = preset.file ? `Session: ${preset.title || preset.file}` : `Agent: ${preset.agentName}`;
        return `<span class="scope-pill">${C.esc(label)} <button id="clear-scope" aria-label="Clear opening scope">×</button></span>`;
    }

    function semanticStatusHtml() {
        if (semStatus.provider === 'off') {
            return 'Meaning search is off. <a id="sem-settings">Choose an embeddings provider</a>.';
        }
        // ‼️ …and WHOSE conversations are in that index. Text and Regex read
        // every engine; this one cannot (see semanticStatus in extension.ts),
        // and a mode that answers over part of the corpus without saying so is
        // the quiet kind of wrong.
        return `Index: <b>${C.esc(semStatus.provider)}</b> · ${semStatus.sessions} sessions · ${semStatus.chunks} passages · <a id="build-index">update</a>`
            + (semStatus.excludedNote ? ` <span class="muted">${C.esc(semStatus.excludedNote)}</span>` : '');
    }

    function modeHtml() {
        const modes = [
            ['text', 'Text', 'The query language: words, phrases, OR, exclusions and wildcards. Reads every engine.'],
            ['regex', 'Regex', 'A regular expression, with a ten-second safety budget. Reads every engine.'],
            ['meaning', 'Meaning', 'Conceptually similar indexed conversation passages. Claude Code transcripts only — the index is built from their line format.']
        ];
        return `<span class="seg" role="group" aria-label="Search method">${modes.map(x =>
            tip(badge(`data-mode="${x[0]}" data-tone="mode"`, x[1], mode === x[0]), x[1], x[2])
        ).join('')}</span>`;
    }

    /**
     * ‼️ THE GRAMMAR IS EXPLAINED ONCE, AND THE BOX ITSELF STAYS QUIET.
     *
     * The query box used to carry a hover saying almost exactly what this card
     * says — so the reader was interrupted by a paragraph every time the pointer
     * crossed the one control they were actually using, to be told what a panel
     * two rows down already tells them on request. The card is the surface that
     * keeps it; everything the hover knew and this did not was moved in here:
     * what the box actually searches, what each mode does to the grammar, the
     * regex time budget, what Meaning does not cover, and what Whole word is
     * doing while it is on.
     */
    function guideHtml() {
        const rows = (window.AFQuery.SYNTAX_ROWS || []).map(r =>
            `<tr><td><code>${C.esc(r.sym)}</code></td><td>${C.esc(r.what)}</td><td><code>${C.esc(r.example)}</code></td></tr>`).join('');
        const notes = [
            '<b>What is searched.</b> Only the content kinds lit below the box, in the sessions the agent picker and the session filters leave in — and every session\'s title, whenever any conversation kind is lit. Case-insensitive matching treats the Turkish dotted and dotless i, in both cases, as one letter.',
            '<b>Text.</b> Combines the rules above. A bare word also matches inside a longer word: turn on <b>▣ Whole word</b> when it must stand on its own, and <b>Aa Case</b> when Agent and agent have to differ.',
            '<b>Regex.</b> The box goes straight to a JavaScript <code>RegExp</code>. None of the operators above apply, and an unsafe pattern is stopped after ten seconds.',
            '<b>Meaning.</b> Compares the question with indexed conversation passages. That is indexed main-session conversation only, so tool traffic, memory notes, orphaned events, message dates and engines that were never indexed stay outside it.'
        ];
        if (wholeOn) { notes.splice(2, 0, C.esc(window.AFQuery.WHOLE_WORD_ON)); }
        return `<div class="guide"><table><thead><tr><th>Write</th><th>Meaning</th><th>Example</th></tr></thead><tbody>${rows}</tbody></table>
            ${notes.map(n => `<p>${n}</p>`).join('')}</div>`;
    }

    function picker(id, label, options, selected, title, disabled, presets) {
        return window.AFFilter.multi({
            id, label, options, selected, title, disabled, presets: presets || []
        });
    }

    /**
     * ‼️ U-52 — the one subset an engine list has a word for, in the same words
     * the sessions table and the Runs table use. The guard is the same too:
     * with a single other engine the preset would be a slower way to click one
     * row, and a click on a row's own name already means "only this".
     */
    function otherEnginePresets(ids) {
        const claude = window.AFEngine.label('claude');
        const rest = (ids || []).filter(e => window.AFEngine.label(e) !== claude);
        return rest.length > 1 ? [{
            id: 'notclaude', label: 'Other engines', values: rest,
            title: 'Everything that did not run on the default engine.'
        }] : [];
    }

    function filterPanelHtml() {
        if (!moreOpen) return '';
        const meaning = mode === 'meaning';
        return `<div class="fpanel" aria-label="Detailed session filters">
            <div class="filter-row">
                ${tip(`<input id="f-session" class="fbox" type="text" value="${C.esc(flt.session)}" placeholder="session id, title or path…">`,
                    'Session', 'A full id, the eight-character prefix shown by Agent Farm, a transcript path, or part of a session title.')}
                ${picker('f-engines', 'Engines', facets.engines.map(e => ({ v: e, t: window.AFEngine.label(e) })), flt.engines,
                    'Which CLI wrote the transcript. Meaning search returns only sessions present in its current index.',
                    false, otherEnginePresets(facets.engines))}
                ${picker('f-projects', 'Projects', facets.projects, flt.projects,
                    'The project resolved for each individual session: explicit membership, code root, then agent default.')}
                ${picker('f-models', 'Models', facets.models, flt.models, 'A session appears under every model it used.')}
            </div>
            <div class="chiprow detail-row">
                <span class="control-label">Started</span>
                <span class="seg">${badge('data-origin=""', 'All', !flt.origin)}${badge('data-origin="user"', 'You', flt.origin === 'user')}${badge('data-origin="baton" title="Legs of a baton relay a program opened (the Sessions table\'s ⑂ Baton)"', '⑂ Baton', flt.origin === 'baton')}${badge('data-origin="auto" title="Every other automation run — schedules, triggers, tasks, missions"', 'Automation', flt.origin === 'auto')}</span>
                <span class="control-label">Lane</span>
                <span class="seg">${badge('data-lane=""', 'All', !flt.lane)}${badge('data-lane="main"', 'Main', flt.lane === 'main')}${badge('data-lane="sub"', 'Sub-agent', flt.lane === 'sub')}</span>
                ${tip(badge('data-flag="pinnedOnly"', '★ Pinned', flt.pinnedOnly), 'Pinned only', 'Only sessions on your shelf.')}
                ${tip(badge('data-flag="errorsOnly"', '⚠ Errors', flt.errorsOnly), 'Has errors', 'Only sessions with at least one tool error.')}
                <span class="date-range${meaning ? ' unavailable' : ''}"><span>When</span><input id="f-from" type="date" value="${C.esc(flt.from)}"${meaning ? ' disabled' : ''}><span>–</span><input id="f-to" type="date" value="${C.esc(flt.to)}"${meaning ? ' disabled' : ''}></span>
                <label class="sortbox"><span>Sort</span><select id="f-sort">${SORTS.map(s => C.option(s.id, s.label, { selected: flt.sort === s.id, detail: s.detail || '' })).join('')}</select></label>
            </div>
        </div>`;
    }

    /**
     * A ✕ in a slot of its own width.
     *
     * ‼️ THE SLOT IS THERE WHETHER THE BUTTON IS OR NOT. A clearer that appears
     * the moment something becomes clearable is right — and a row that shifts
     * sideways underneath the pointer at that same moment is not. Reserving the
     * width means the block never moves: the ✕ arrives in the gap that was
     * already being kept for it.
     */
    function clearSlot(id, on, label, head, body) {
        return `<span class="act-slot">${on
            ? tip(`<button type="button" id="${id}" class="slot-x" aria-label="${C.esc(label)}">✕</button>`, head, body)
            : ''}</span>`;
    }

    /** What the content scope currently is, by name — the changing half of the
     *  reset's hover, which is the half a reader is actually asking about. */
    const litScope = () => [
        ...ROLES.filter(r => roleSel.has(r.id)).map(r => r.label),
        ...(sourceMemory ? ['Memory'] : []),
        ...(sourceEvents ? ['Events'] : [])
    ].join(' · ');

    /**
     * Three bands, and each one answers one question: HOW to read the query
     * (mode), WHERE to look (agents, session filters), WHAT to look at (the
     * content kinds). Every band lays out with flex and wraps inside itself, so
     * a narrow window costs a line of height and never a collision: the old grid
     * let the badges run under the Filters button at one width and stretched an
     * empty purple box across half the row at the next.
     */
    function controlsHtml() {
        const exact = mode !== 'meaning';
        const unavailable = mode === 'meaning';
        const fileScope = !!(preset && preset.file);
        const agents = facets.agents.length ? facets.agents : (DATA.agents || []);
        const filters = sessionFilterCount();
        const interaction = 'Click to add or remove a kind. Ctrl-click (⌘ on Mac) — or right-click → '
            + '"Choose only this" — keeps ONLY that one and puts every other chip out, memory and events included.';
        return `<section class="search-panel">
            <div class="query-row">
                <input id="q" type="text" value="${C.esc(queryText)}" spellcheck="false"
                    placeholder="${mode === 'meaning' ? 'Describe the idea or discussion…' : 'Words, phrase, path, error or session id…'}"
                    aria-label="Search query">
                <button id="go" class="primary-search">${searching ? 'Searching…' : 'Search'}</button>
            </div>
            <div class="options-row">
                <div class="mode-controls"><span class="control-label">Mode</span>${modeHtml()}
                    ${tip(badge('data-query-option="case" data-tone="case"', 'Aa Case', caseOn, !exact), 'Match case', 'Agent and agent become different.')}
                    ${tip(badge('data-query-option="whole" data-tone="whole"', '▣ Whole word', wholeOn, mode !== 'text'), 'Whole words', 'A bare word must match as a whole word: log no longer finds dialogue.')}
                    <button id="guide-toggle" class="text-action" aria-expanded="${guideOpen}">Syntax ${guideOpen ? '▴' : '▾'}</button>
                </div>
                <div class="session-controls">${scopeHtml()}
                    ${picker('search-agents', 'Agents', agents, agentSel ? [...agentSel] : null,
                        'Which agents own the sessions to search.', fileScope)}
                    ${tip('<button id="find-session" class="secondary id-find">⌗ Find session ID…</button>',
                        'Find a session by ID', 'Search the entire session index directly. A full ID or the eight-character prefix printed throughout Agent Farm is enough; this does not filter text-search results.')}
                    ${tip(badge(`id="more-toggle" aria-expanded="${moreOpen}" data-tone="filter"`, `⚙ Filters${filters ? ` (${filters})` : ''} ${moreOpen ? '▴' : '▾'}`, moreOpen || filters > 0),
                        'Session filters', 'Open the engine, project, model, origin, lane, status, session-id, date and sort controls.', 'tip-right')}
                    ${clearSlot('clear-filters', filters > 0, 'Clear the session filters',
                        `Clear ${filters} session filter${filters === 1 ? '' : 's'}`,
                        'Puts every session axis back to all: the agents, the opening scope, and whatever the Filters panel holds — engine, project, model, origin, lane, status, session id, dates and sort. The query and the content scope are untouched.')}
                </div>
            </div>
            <div class="scope-layout${unavailable ? ' unavailable' : ''}" aria-disabled="${unavailable}">
                <div class="scope-head">
                    <div class="preset-group"><span class="group-label">Quick scope</span>
                        ${PRESETS.map(p => tip(badge(`data-preset="${p.id}" data-tone="preset"`, p.label, sameSet(p.roles), unavailable), p.label,
                            `${p.roles.map(id => ROLES.find(r => r.id === id)?.label).filter(Boolean).join(' · ')}.`)).join('')}
                    </div>
                </div>
                <div class="role-group">
                    <span class="chip-run">${ROLES.map(r => tip(badge(`data-role="${r.id}" ${chipCtx('role', r.id, r.label)}`, `${r.icon} ${C.esc(r.label)}`, roleSel.has(r.id), unavailable), r.label, `${r.text}.\n\n${interaction}`)).join('')}</span>
                    <span class="chip-run">
                        ${tip(badge(`data-source="memory" ${chipCtx('source', 'memory', 'Memory')}`, '📝 Memory', sourceMemory, unavailable), 'Memory notes', `Agent memory files, paragraph by paragraph.\n\n${interaction}`)}
                        ${tip(badge(`data-source="events" ${chipCtx('source', 'events', 'Events')}`, '⌁ Events', sourceEvents, unavailable), 'Orphaned events', `Events whose transcript no longer exists.\n\n${interaction}`)}
                    </span>
                    <span class="scope-actions">
                        ${clearSlot('reset-scope', !unavailable && scopeChanged(), 'Reset the content scope',
                            `Reset — searching ${litScope()}`,
                            'Puts this block back where it started: Conversation, with memory notes and orphaned events searched. It touches nothing else — the query, the mode and the session filters stay as they are.')}
                    </span>
                </div>
            </div>
            ${unavailable ? `<div class="meaning-line"><b>Meaning:</b> indexed main-session conversation only; content badges, memory/events and message dates do not apply. <span id="sem-status">${semanticStatusHtml()}</span></div>` : ''}
            ${filterPanelHtml()}
            ${guideOpen ? guideHtml() : ''}
            ${dirty ? '<div class="dirty-note">The search definition changed. Run Search to refresh the answer.</div>' : ''}
        </section>`;
    }

    function styleHtml() {
        return `<style>
            #app{max-width:1180px;margin:0 auto}.search-panel{margin-top:10px;padding:10px 12px;border:1px solid var(--vscode-widget-border,#5555);border-radius:7px;background:var(--vscode-editorWidget-background,var(--vscode-editor-background))}
            .query-row{display:grid;grid-template-columns:minmax(0,1fr) 96px;gap:7px}.query-row .af-clr{display:flex;min-width:0}#q{box-sizing:border-box;width:100%;height:32px;font:13px/18px inherit;padding:5px 28px 5px 10px}.primary-search{height:32px;width:96px;font-weight:650}
            .options-row{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;margin-top:8px}.mode-controls{display:flex;flex-wrap:wrap;align-items:center;gap:5px;min-width:0}.session-controls{display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:5px;min-width:0;margin-left:auto}.session-controls .afms-btn{font-size:11px;padding:2px 8px}.id-find{font-size:11px;padding:2px 8px;white-space:nowrap}#more-toggle{min-width:104px}.control-label{font-size:10px;color:var(--vscode-descriptionForeground);white-space:nowrap}.grow{flex:1}
            .act-slot{display:inline-flex;align-items:center;justify-content:center;flex:0 0 20px;width:20px}.slot-x{border:0;border-radius:4px;background:transparent;color:var(--vscode-descriptionForeground);cursor:pointer;font-size:12px;line-height:1;padding:3px 4px}.slot-x:hover{color:var(--vscode-foreground);background:var(--vscode-toolbar-hoverBackground,var(--vscode-list-hoverBackground))}
            .chip{box-sizing:border-box;font-size:11px;line-height:17px;height:23px;padding:2px 8px;border-radius:10px;cursor:pointer;background:transparent;color:var(--vscode-foreground);opacity:.82;border:1px solid var(--vscode-widget-border,#6667);white-space:nowrap;display:inline-flex;align-items:center;justify-content:center}.chip:hover:not(:disabled){opacity:1;background:var(--vscode-list-hoverBackground)}.chip.on{opacity:1;color:var(--vscode-foreground);border-color:var(--vscode-focusBorder);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--vscode-focusBorder) 50%,transparent);background:color-mix(in srgb,var(--vscode-button-background) 32%,transparent)}.chip[data-tone="preset"].on{background:color-mix(in srgb,var(--vscode-charts-purple,#b180d7) 28%,transparent);border-color:var(--vscode-charts-purple,#b180d7)}.chip[data-tone="mode"].on{background:color-mix(in srgb,var(--vscode-charts-blue,#3794ff) 24%,transparent);border-color:var(--vscode-charts-blue,#3794ff)}.chip[data-tone="case"].on,.chip[data-tone="whole"].on{background:color-mix(in srgb,var(--vscode-charts-green,#89d185) 22%,transparent);border-color:var(--vscode-charts-green,#89d185)}.chip[data-tone="filter"].on{background:color-mix(in srgb,var(--vscode-charts-orange,#d18616) 24%,transparent);border-color:var(--vscode-charts-orange,#d18616)}.chip-check{display:inline-block;width:12px;margin-right:2px;overflow:hidden;opacity:0}.chip.on .chip-check{opacity:1}.chip.disabled,.unavailable .chip{opacity:.32;cursor:default}.seg{display:inline-flex}.seg>.af-tipw:not(:first-child) .chip,.seg>.chip:not(:first-child){border-top-left-radius:0;border-bottom-left-radius:0;margin-left:-1px}.seg>.af-tipw:not(:last-child) .chip,.seg>.chip:not(:last-child){border-top-right-radius:0;border-bottom-right-radius:0}.scope-note{font-size:10px;color:var(--vscode-descriptionForeground)}.scope-pill{font-size:10px;border:1px solid var(--vscode-focusBorder);border-radius:10px;padding:1px 4px 1px 8px;white-space:nowrap}.scope-pill button{border:0;background:transparent;color:inherit;padding:0 3px}.text-action{border:0;background:transparent;color:var(--vscode-textLink-foreground);padding:2px 4px;cursor:pointer;font-size:11px}.text-action:disabled{opacity:.3;cursor:default}
            .scope-layout{margin-top:8px}.scope-head{display:flex;align-items:center;gap:8px}.preset-group{display:flex;align-items:center;gap:4px;flex:0 1 auto;min-width:0;overflow:hidden;padding:3px 6px;border:1px solid color-mix(in srgb,var(--vscode-charts-purple,#b180d7) 55%,transparent);border-radius:7px;background:color-mix(in srgb,var(--vscode-charts-purple,#b180d7) 7%,transparent);white-space:nowrap}.group-label{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:var(--vscode-charts-purple,#b180d7);margin-right:2px}.scope-actions{display:inline-flex;align-items:center;flex:0 0 auto;margin-left:auto}.role-group{display:flex;flex-wrap:wrap;align-items:center;gap:5px 10px;margin-top:6px}.chip-run{display:flex;flex-wrap:wrap;align-items:center;gap:4px;flex:0 1 auto}
            .meaning-line,.dirty-note{margin-top:7px;padding:5px 8px;border-left:3px solid var(--vscode-charts-yellow,#cca700);background:color-mix(in srgb,var(--vscode-charts-yellow,#cca700) 8%,transparent);font-size:11px}.meaning-line #sem-status{margin-left:5px;color:var(--vscode-descriptionForeground)}.fpanel{margin-top:7px;padding:7px 8px;border:1px solid var(--vscode-widget-border,#5555);border-radius:6px;background:color-mix(in srgb,var(--vscode-foreground) 2%,transparent)}.filter-row{display:grid;grid-template-columns:minmax(420px,1fr) repeat(3,minmax(120px,auto));align-items:center;gap:6px}.filter-row>.af-tipw:first-child{display:block;min-width:0}.fbox{box-sizing:border-box;width:100%;min-width:0;font-size:11px;padding:4px 7px}.filter-row .afms-btn{font-size:11px;min-width:118px;padding:3px 8px}.detail-row{margin-top:6px}.date-range,.sortbox{display:inline-flex;align-items:center;gap:4px;font-size:10px;color:var(--vscode-descriptionForeground)}.date-range input,.sortbox select{font-size:10px;padding:1px 3px}.date-range.unavailable,.scope-layout.unavailable .preset-group,.scope-layout.unavailable .role-group{opacity:.45}.guide{margin-top:7px;padding:8px;border:1px solid var(--vscode-widget-border,#5555);border-radius:6px;max-height:460px;overflow:auto}.guide table{font-size:11px;width:100%}.guide p{font-size:10px;margin:5px 0 0;color:var(--vscode-descriptionForeground)}.guide p code{font-size:10px}
            .resultsbar{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin:9px 0 7px;font-size:11px;color:var(--vscode-descriptionForeground)}.resultsbar span{padding:2px 8px;border:1px solid var(--vscode-widget-border,#5555);border-radius:10px}.resultsbar b{color:var(--vscode-foreground);margin-right:3px}.partial{padding:5px 8px;border-left:3px solid var(--vscode-charts-yellow,#cca700);background:color-mix(in srgb,var(--vscode-charts-yellow,#cca700) 8%,transparent);margin-bottom:7px;font-size:11px}.sessgroup{margin-bottom:9px;border:1px solid var(--vscode-widget-border,#5555);border-radius:7px;overflow:hidden}.sesshead{display:flex;align-items:center;gap:7px;padding:7px 9px;cursor:pointer;background:color-mix(in srgb,var(--vscode-textLink-foreground) 8%,transparent)}.sesshead .meta{margin-left:auto;text-align:right;font-size:10px;color:var(--vscode-descriptionForeground)}.sessgroup.unpreviewed .sesshead{background:color-mix(in srgb,var(--vscode-textLink-foreground) 4%,transparent)}.sesshead .ident{font-family:var(--vscode-editor-font-family,monospace);font-size:10px;padding:1px 5px;border:1px solid color-mix(in srgb,var(--vscode-foreground) 22%,transparent);border-radius:9px;color:var(--vscode-descriptionForeground);white-space:nowrap}.hit{padding:6px 9px 6px 15px;border-top:1px solid color-mix(in srgb,var(--vscode-widget-border,#5555) 55%,transparent);cursor:pointer}.hit:hover{background:var(--vscode-list-hoverBackground)}.hit .badges{display:flex;gap:5px;margin-bottom:3px}.turnhead{font-size:10px;color:var(--vscode-descriptionForeground);padding:5px 9px 1px;background:color-mix(in srgb,var(--vscode-foreground) 3%,transparent)}.id-card{margin:9px 0 7px;padding:6px 9px;border-left:3px solid var(--vscode-charts-blue,#3794ff);background:color-mix(in srgb,var(--vscode-charts-blue,#3794ff) 10%,transparent);cursor:pointer}.source-head{margin:14px 0 6px;font-weight:650}.empty{padding:18px;text-align:center;color:var(--vscode-descriptionForeground)}mark{background:var(--vscode-editor-findMatchHighlightBackground,#ffd33d55)}#out.busy{opacity:.5}
            @media(max-width:1100px){.filter-row{grid-template-columns:minmax(240px,1fr) repeat(3,minmax(110px,auto))}}
            @media(max-width:780px){.session-controls{justify-content:flex-start;margin-left:0}.filter-row{grid-template-columns:1fr 1fr}.filter-row>.af-tipw:first-child{grid-column:1/-1}.resultsbar{gap:4px}.sesshead{align-items:flex-start}.sesshead .meta{min-width:130px}}
        </style>`;
    }

    /**
     * ‼️ THE CARET SURVIVES THE REPAINT. THIS IS NOT A NICETY.
     *
     * The page rebuilds its whole card for every change, and the box searches as
     * you type — so the answer arriving was itself what threw the cursor out of
     * the box. One more letter went nowhere, and the only way back in was the
     * mouse: a live search that had to be re-aimed after every result, which is
     * worse than one that waits for Enter.
     *
     * So the focused control is noted before the swap and given back after it.
     * `id` where there is one; otherwise the data attribute the control is
     * addressed by, which is what a chip has — a chip pressed with the keyboard
     * comes back under the keyboard.
     */
    const MARK_ATTR = {
        role: 'data-role', preset: 'data-preset', mode: 'data-mode', source: 'data-source',
        flag: 'data-flag', origin: 'data-origin', lane: 'data-lane', queryOption: 'data-query-option'
    };

    function focusMark() {
        let el = null;
        try { el = document.activeElement; } catch (e) { return null; }
        if (!el || !el.tagName) { return null; }
        let sel = el.id ? `#${el.id}` : '';
        if (!sel && el.dataset) {
            const key = Object.keys(MARK_ATTR).find(k => el.dataset[k] !== undefined && el.dataset[k] !== null);
            if (key) { sel = `[${MARK_ATTR[key]}="${el.dataset[key]}"]`; }
        }
        if (!sel) { return null; }
        const m = { sel };
        try { m.start = el.selectionStart; m.end = el.selectionEnd; } catch (e) { /* not a text box */ }
        return m;
    }

    function focusBack(m) {
        if (!m) { return false; }
        let el = null;
        try { el = document.querySelector(m.sel); } catch (e) { return false; }
        if (!el || typeof el.focus !== 'function') { return false; }
        // ‼️ U-98 — a number box has no caret to put back, and focusing one
        // parks it at 0. This page has none today; the guard is here so adding
        // one cannot quietly reintroduce the bug that was fixed in afFilters.
        try { if (window.AFFilter && window.AFFilter.caretable) { window.AFFilter.caretable(el); } } catch (e) { /* no shared component on this shell */ }
        try { el.focus(); } catch (e) { return false; }
        if (m.start !== undefined && m.start !== null && el.setSelectionRange) {
            try { el.setSelectionRange(m.start, m.end); } catch (e) { /* date boxes have no caret either */ }
        }
        return true;
    }

    function shell() {
        const mark = focusMark();
        document.getElementById('app').innerHTML = `${styleHtml()}${window.AFHeader.html({
            page: 'search', title: 'Search',
            sub: 'Find the exact conversation, action or session across the fleet.', refresh: false,
            guide: 'transcript-arama'
        })}${controlsHtml()}<div id="out"></div>`;
        window.AFHeader.wire(vscode);
        wire();
        renderResults();
        // The caret goes back where it was — and on the very first paint there is
        // nowhere to put it back, so it starts in the box the page is for.
        if (!focusBack(mark) && !opened) {
            opened = true;
            const q = document.getElementById('q');
            if (q && q.focus) { try { q.focus(); } catch (e) { /* stub DOM */ } }
        }
    }

    function rememberQuery() {
        const q = document.getElementById('q');
        if (q) queryText = q.value;
    }

    /** A surface toggle — a panel opened, a client-side sort. The answer on
     *  screen is still the answer to the question that was asked, so it is not
     *  marked stale and nothing is re-run. */
    function ui() {
        rememberQuery();
        shell();
    }

    /** The search DEFINITION moved. Run it again where that is possible, and
     *  say so where it is not: Meaning search is deliberate, and an empty box
     *  has nothing to ask. */
    function changed() {
        rememberQuery();
        if (mode !== 'meaning' && queryText.trim()) { run(); return; }
        dirty = !!lastResult;
        shell();
    }

    function scheduleQuery() {
        if (queryTimer) clearTimeout(queryTimer);
        queryTimer = null;
        const q = queryText.trim();
        if (!q) {
            seq++;
            lastResult = null; idMatch = null; searching = false; dirty = false;
            renderResults();
            return;
        }
        if (mode !== 'meaning' && q.length >= 3) {
            queryTimer = setTimeout(() => { queryTimer = null; run(); }, 500);
            return;
        }
        // Two words that will not run by themselves — a query too short to be
        // worth scanning every transcript for, and Meaning, which is deliberate.
        // The hits still on screen answer a question that is no longer in the
        // box, so the page says so rather than letting them read as current.
        if (lastResult && !dirty) { dirty = true; shell(); }
    }

    function clearSessionFilters() {
        preset = null;
        agentSel = null;
        flt = defaultFilters();
    }

    function resetScope() {
        roleSel = new Set(DEFAULT_ROLES);
        sourceMemory = true;
        sourceEvents = true;
        changed();
    }

    function run() {
        if (queryTimer) clearTimeout(queryTimer);
        queryTimer = null;
        rememberQuery();
        if (!queryText.trim()) return;
        searching = true; dirty = false; prep = null; shell();
        vscode.postMessage({
            type: 'search', seq: ++seq, query: queryText,
            semantic: mode === 'meaning', regex: mode === 'regex',
            caseSensitive: caseOn, wholeWord: wholeOn,
            agents: preset && preset.file ? null : (agentSel ? [...agentSel] : null),
            file: preset && preset.file ? preset.file : '',
            roles: [...roleSel], memory: sourceMemory, events: sourceEvents,
            tsFrom: mode === 'meaning' ? 0 : dayMs(flt.from, false),
            tsTo: mode === 'meaning' ? 0 : dayMs(flt.to, true),
            filters: {
                engines: flt.engines, projects: flt.projects, models: flt.models,
                origin: flt.origin, lane: flt.lane, pinnedOnly: flt.pinnedOnly,
                errorsOnly: flt.errorsOnly, session: flt.session
            }
        });
    }

    function wirePicker(id, assign) {
        window.AFFilter.wireMulti({ id, onChange: sel => { assign(sel); changed(); } });
    }

    function wire() {
        const q = document.getElementById('q');
        if (q) {
            q.addEventListener('input', () => { queryText = q.value; scheduleQuery(); });
            q.addEventListener('keydown', e => {
                // One line, one Enter: the box is a query, not a paragraph.
                if (e.key === 'Enter') { if (e.preventDefault) { e.preventDefault(); } run(); }
            });
            window.AFFilter.clearable(q, () => {
                if (queryTimer) clearTimeout(queryTimer);
                queryTimer = null;
                seq++;
                queryText = ''; lastResult = null; idMatch = null; searching = false; dirty = false;
                // The whole card, not just the results: emptying the box also
                // retires the Searching… label and any stale-answer note, and
                // the caret comes back to the box it was cleared from.
                shell();
            });
        }
        document.getElementById('go').addEventListener('click', run);
        document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
            mode = b.dataset.mode; changed();
        }));
        // ‼️ Case and Whole word are part of the QUESTION, so they re-ask it. They
        // used to only raise the "run Search again" note, which is a page telling
        // you to press a button it could have pressed.
        document.querySelectorAll('[data-query-option]').forEach(b => b.addEventListener('click', () => {
            if (b.dataset.queryOption === 'case') caseOn = !caseOn; else wholeOn = !wholeOn;
            changed();
        }));
        // …and a help card is not part of the question: opening it used to mark
        // the answer on screen as stale.
        document.getElementById('guide-toggle').addEventListener('click', () => { guideOpen = !guideOpen; ui(); });
        document.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => {
            roleSel = new Set(PRESETS.find(p => p.id === b.dataset.preset).roles); changed();
        }));
        document.querySelectorAll('[data-role]').forEach(b => b.addEventListener('click', e => {
            const id = b.dataset.role;
            // ‼️ ONE MEANING, TWO DOORS (U-88). The modifier and the menu item
            // are the same call — two gestures called "only this" that did
            // different things would be worse than having only one of them.
            if (e.ctrlKey || e.metaKey) { chooseOnly('role', id); return; }
            if (roleSel.has(id)) roleSel.delete(id); else roleSel.add(id);
            // ‼️ THE SCOPE never empties — but "the scope" is all nine chips,
            // not the roles alone. Putting the last role out while Memory is
            // still lit is a legitimate memory-only search, and forcing the
            // conversation back on there would have silently widened it.
            if (!litCount()) roleSel = new Set(DEFAULT_ROLES);
            changed();
        }));
        document.querySelectorAll('[data-source]').forEach(b => b.addEventListener('click', e => {
            const id = b.dataset.source;
            if (e.ctrlKey || e.metaKey) { chooseOnly('source', id); return; }
            if (id === 'memory') sourceMemory = !sourceMemory; else sourceEvents = !sourceEvents;
            if (!litCount()) roleSel = new Set(DEFAULT_ROLES);
            changed();
        }));
        wirePicker('search-agents', sel => { agentSel = sel === null ? null : new Set(sel); preset = null; });
        wirePicker('f-engines', sel => { flt.engines = sel; });
        wirePicker('f-projects', sel => { flt.projects = sel; });
        wirePicker('f-models', sel => { flt.models = sel; });
        const sf = document.getElementById('f-session');
        if (sf) {
            window.AFFilter.live(sf, el => { flt.session = el.value; changed(); }, 300);
            window.AFFilter.clearable(sf, el => { flt.session = ''; el.value = ''; changed(); });
        }
        document.getElementById('more-toggle').addEventListener('click', () => { moreOpen = !moreOpen; ui(); });
        const clear = document.getElementById('clear-filters');
        if (clear) clear.addEventListener('click', () => { clearSessionFilters(); changed(); });
        const reset = document.getElementById('reset-scope');
        if (reset) reset.addEventListener('click', resetScope);
        const findSession = document.getElementById('find-session');
        if (findSession) findSession.addEventListener('click', () => {
            rememberQuery();
            vscode.postMessage({ type: 'findSession', q: queryText.trim() });
        });
        document.querySelectorAll('[data-origin]').forEach(b => b.addEventListener('click', () => { flt.origin = b.dataset.origin; changed(); }));
        document.querySelectorAll('[data-lane]').forEach(b => b.addEventListener('click', () => { flt.lane = b.dataset.lane; changed(); }));
        document.querySelectorAll('[data-flag]').forEach(b => b.addEventListener('click', () => { flt[b.dataset.flag] = !flt[b.dataset.flag]; changed(); }));
        if (moreOpen) {
            const from = document.getElementById('f-from'); const to = document.getElementById('f-to');
            if (from) window.AFFilter.live(from, el => { flt.from = el.value; changed(); }, 200);
            if (to) window.AFFilter.live(to, el => { flt.to = el.value; changed(); }, 200);
            // ‼️ Sorting happens HERE, over hits the page already holds — asking
            // the host again would be a round trip to receive the same answer.
            document.getElementById('f-sort').addEventListener('change', e => { flt.sort = e.target.value; ui(); });
        }
        const clearScope = document.getElementById('clear-scope');
        if (clearScope) clearScope.addEventListener('click', () => { preset = null; agentSel = null; changed(); });
        const settings = document.getElementById('sem-settings');
        if (settings) settings.addEventListener('click', () => vscode.postMessage({ type: 'openFarmSettings', focus: 'agentFarm.embeddingsProvider' }));
        const build = document.getElementById('build-index');
        if (build) build.addEventListener('click', () => vscode.postMessage({ type: 'buildIndex' }));
    }

    const ROLE_WORD = { user: 'you', automation: 'automation', assistant: 'agent', delegator: 'delegator', handler: 'handler', tool: 'tool', toolResult: 'result', memory: 'memory', event: 'event', title: 'title' };
    const SESSION_HINT = window.AFSessionCtx.HINT;
    // The VIEWER speaks the transcript's protocol roles: `automation` is a
    // reading of the same `user` channel, so it opens as `user` there (S-36).
    const viewerRoles = () => [...new Set([...roleSel].map(r =>
        r === 'delegator' || r === 'automation' ? 'user' : r === 'handler' ? 'assistant' : r))];
    const openSession = (file, ts) => vscode.postMessage({ type: 'openSession', file, ts: ts || 0, roles: viewerRoles() });

    /**
     * ‼️ U-63 — WHAT MAKES TWO SESSIONS TWO SESSIONS, IN THE WIDTH OF A BADGE.
     *
     * Three different missions reached this page under one generated title, one
     * engine badge and one agent name; nothing on the row said they were three
     * conversations, so they read as one row drawn three times. SHORTHAND: the
     * eight-character id (the form the whole extension prints), the author's
     * glyph and an import mark — with the long form in the AFTip.
     */
    function identity(h) {
        const id = String(h.sessionId || '').slice(0, 8);
        const author = h.author === 'automation' ? '🤖' : h.author === 'unknown' ? '❔' : '🧑';
        const imported = h.provenance && h.provenance !== 'native' ? '⇄' : '';
        const head = id ? `Session #${id}` : 'Session';
        const lines = [
            h.sessionId ? `Full id: ${h.sessionId}` : '',
            h.canonicalSessionId && h.canonicalSessionId !== h.sessionId
                ? `Canonical run: ${h.canonicalSessionId}` : '',
            `Author: ${h.authorLabel || (h.author === 'automation' ? 'Automation prompt' : 'You')}`
                + (h.launcher ? ` — ${h.launcher}` : ''),
            h.producer && h.producer !== (h.engine || 'claude')
                ? `Ran on ${h.producer}; stored as ${h.engine || 'claude'}` : '',
            h.provenance === 'imported'
                ? 'This file is an imported copy. The run itself is indexed under its own transcript, and only that one is counted.' : '',
            h.provenance === 'imported-unknown-source'
                ? 'Marked as imported, but no manifest names the source — the engine that actually ran it is unknown.' : '',
            h.title ? `Title: ${h.title}` : ''
        ].filter(Boolean).join('\n');
        return tip(`<span class="ident">#${C.esc(id)} ${author}${imported}</span>`, head, lines);
    }

    function hitHtml(h, i) {
        const isSession = h.kind !== 'memory' && h.kind !== 'event' && h.file;
        const ctx = isSession ? ' ' + window.AFSessionCtx.row(h, { webviewSection: 'afSearchHit', hitIndex: i, hitTs: h.ts || 0 }) : '';
        const who = h.role === 'automation'
            ? (h.authorLabel || 'Automation prompt') + (h.launcher ? ' · ' + h.launcher : '')
            : (ROLE_WORD[h.role] || h.role);
        return `<div class="hit" data-hit="${i}"${ctx}>
            <div class="badges"><span class="badge">${C.esc(who)}${h.tool ? ' · ' + C.esc(h.tool) : ''}</span>
            ${typeof h.score === 'number' ? `<span class="badge">${Math.round(h.score * 100)}% similar</span>` : ''}<span class="grow"></span><span class="muted small">${relTime(h.ts)}</span></div>
            ${C.esc(h.before)}${h.match ? `<mark>${C.esc(h.match)}</mark>` : ''}${C.esc(h.after)}</div>`;
    }

    function idHtml() {
        if (!idMatch) return '';
        return `<div class="id-card" id="id-card">Open session <b>#${C.esc(String(idMatch.sessionId).slice(0, 8))}</b> · ${C.esc(idMatch.agentName)} · ${C.esc(idMatch.title)}</div>`;
    }

    function renderResults() {
        const out = document.getElementById('out');
        if (!out) return;
        // ‼️ A LIVE SEARCH DOES NOT BLANK THE ANSWER IT IS ABOUT TO REPLACE. The
        // box re-runs half a second after a keystroke, so emptying the page for
        // the length of every scan made the results flash out and back in under
        // the reader — the previous answer stays, dimmed, until the new one lands.
        out.className = searching ? 'busy' : '';
        if (searching && prep && prep.total) {
            // ‼️ A PARTIAL ANSWER IS NEVER SHOWN AS AN ANSWER. This is the build
            // talking, not the search: the results below (if any) still belong
            // to the previous query and stay dimmed until this one lands.
            const line = `<div class="empty">Preparing search corpus ${prep.done}/${prep.total}… <span class="muted">one time; it is reused from here on</span></div>`;
            if (!lastResult) { out.innerHTML = line; return; }
        }
        if (searching && !lastResult) { out.innerHTML = '<div class="empty">Searching the selected session pool…</div>'; return; }
        if (!lastResult) { out.innerHTML = '<div class="empty">Build the search above, then press Search.</div>'; return; }
        if (lastResult.error) { out.innerHTML = `<div class="partial">⚠ ${C.esc(lastResult.error)}</div>`; return; }
        const r = lastResult;
        const found = Number.isFinite(r.matchesFound) ? r.matchesFound : r.hits.length;
        const shown = Number.isFinite(r.matchesShown) ? r.matchesShown : r.hits.length;
        const matched = Number.isFinite(r.sessionsMatched) ? r.sessionsMatched : new Set(r.hits.filter(h => !h.kind).map(h => h.file)).size;
        let html = `${idHtml()}<div class="resultsbar">
            <span><b>${found}</b>matches</span><span><b>${shown}</b>previews</span>
            <span><b>${matched}</b>sessions</span><span><b>${r.filesScanned}</b>scanned</span></div>`;
        if (r.omittedMatches || r.timedOut || r.parseFailures || r.trailRebuilt) {
            html += `<div class="partial"><b>Coverage note.</b> ${r.omittedMatches ? `${r.omittedMatches} additional matches are counted but not previewed. ` : ''}${r.timedOut ? 'The time budget ended the scan early. ' : ''}${r.parseFailures ? `${r.parseFailures} transcript(s) could not be read. ` : ''}${r.trailRebuilt ? `${r.trailRebuilt} older session(s) had their tool trail re-read from the transcript, which is what made this slower: the trail stays indexed only for a while after a session's last activity (agentFarm.searchToolTrailDays).` : ''}</div>`;
        }
        if (!r.hits.length) { out.innerHTML = html + '<div class="empty">No match in this scope.</div>'; wireResults(); return; }
        const transcript = r.hits.map((h, i) => ({ h, i }))
            .filter(x => x.h.kind !== 'memory' && x.h.kind !== 'event');
        const extras = r.hits.map((h, i) => ({ h, i }))
            .filter(x => x.h.kind === 'memory' || x.h.kind === 'event');
        const groups = [];
        const map = new Map();
        transcript.forEach(x => { if (!map.has(x.h.file)) { const g = { file: x.h.file, rows: [] }; map.set(x.h.file, g); groups.push(g); } map.get(x.h.file).rows.push(x); });
        const counts = new Map((r.sessionMatches || []).map(x => [x.file, x]));
        // ‼️ X-147 — A SESSION THAT MATCHED IS ON THE PAGE EVEN WHEN NONE OF ITS
        // MATCHES MADE THE PREVIEW CAP. The groups were built from the hits
        // alone, and a common word fills 250 previews out of the newest sessions
        // — so the bar counted 472 sessions and the list drew forty. The count
        // row carries the header now; such a session is drawn as its header
        // only, and opens like any other.
        for (const c of (r.sessionMatches || [])) {
            if (c.shown === 0 && c.found > 0 && !map.has(c.file) && c.title !== undefined) {
                const g = { file: c.file, rows: [], head: Object.assign({ ts: c.sessionTs || 0 }, c) };
                map.set(c.file, g); groups.push(g);
            }
        }
        const headOf = g => g.rows.length ? g.rows[0].h : g.head;
        const foundOf = g => (counts.get(g.file) || {}).found || g.rows.length;
        const groupTs = g => headOf(g).sessionTs || headOf(g).ts || 0;
        if (flt.sort === 'oldest') groups.sort((a, b) => groupTs(a) - groupTs(b));
        else if (flt.sort === 'hits') groups.sort((a, b) => foundOf(b) - foundOf(a) || groupTs(b) - groupTs(a));
        else if (flt.sort === 'agent') groups.sort((a, b) => String(headOf(a).agentName).localeCompare(String(headOf(b).agentName)) || groupTs(b) - groupTs(a));
        else groups.sort((a, b) => groupTs(b) - groupTs(a));
        html += groups.map(g => {
            const first = headOf(g); const count = counts.get(g.file) || { found: g.rows.length, shown: g.rows.length };
            let turn = null;
            const body = g.rows.map(x => {
                const head = x.h.turn && x.h.turn !== turn ? `<div class="turnhead">Turn ${x.h.turn}${x.h.turnLabel ? ' · ' + C.esc(x.h.turnLabel) : ''}</div>` : '';
                turn = x.h.turn; return head + hitHtml(x.h, x.i);
            }).join('');
            const tally = count.shown === count.found ? `${count.found} matches`
                : count.shown === 0 ? `${count.found} matches · none previewed (the ${r.matchesShown} previews went to newer sessions)`
                    : `${count.shown} of ${count.found} shown`;
            return `<div class="sessgroup${g.rows.length ? '' : ' unpreviewed'}"><div class="sesshead" data-open="${C.esc(first.file)}" data-ts="${first.ts || 0}" ${window.AFSessionCtx.row(first)}>
                ${window.AFEngine.badge(first.engine || 'claude')}${identity(first)}<strong>${C.esc(first.agentName)}</strong><span>· ${C.esc(first.title)}</span>
                <span class="meta">${tally}<br>${C.esc(first.project || '')} ${relTime(groupTs(g))} · ${C.esc(SESSION_HINT)}</span></div>${body}</div>`;
        }).join('');
        const mem = extras.filter(x => x.h.kind === 'memory'); const events = extras.filter(x => x.h.kind === 'event');
        if (mem.length) html += '<div class="source-head">📝 Memory notes</div>' + mem.map(x => hitHtml(x.h, x.i)).join('');
        if (events.length) html += '<div class="source-head">⌁ Orphaned events</div>' + events.map(x => hitHtml(x.h, x.i)).join('');
        out.innerHTML = html; wireResults();
    }

    function wireResults() {
        const out = document.getElementById('out');
        out.querySelectorAll('[data-open]').forEach(el => el.addEventListener('click', () => openSession(el.dataset.open, Number(el.dataset.ts))));
        out.querySelectorAll('[data-hit]').forEach(el => el.addEventListener('click', () => {
            const h = lastResult.hits[Number(el.dataset.hit)];
            if (h.kind === 'memory') vscode.postMessage({ type: 'openFile', file: h.file });
            else if (h.kind === 'event' && !h.file) vscode.postMessage({ type: 'openTimeline' });
            else openSession(h.file, h.ts);
        }));
        const id = document.getElementById('id-card');
        if (id) id.addEventListener('click', () => openSession(idMatch.file, 0));
    }

    function ctxDo(act, ctx) {
        const verb = act.split(':')[0]; const arg = act.slice(verb.length + 1);
        const hit = lastResult?.hits?.[Number(ctx.hitIndex)];
        if (verb === 'shOpen') { openSession(String(ctx.file || ''), Number(ctx.hitTs)); return; }
        if (verb === 'shOnly') {
            if (arg === 'agent') { preset = { agentName: String(ctx.agentName || '') }; agentSel = new Set([String(ctx.agentName || '')]); }
            else preset = { file: String(ctx.file || ''), title: String(ctx.title || '') };
            changed(); return;
        }
        if (verb === 'shCopy') window.AFCtx.copy(!hit ? '' : arg === 'context'
            ? `${hit.before || ''}${hit.match || ''}${hit.after || ''}` : String(hit.match || hit.before || ''));
    }
    window.AFCtx.listen(ctxDo);

    window.addEventListener('message', ev => {
        if (ev.data.type === 'preset') {
            preset = ev.data.preset || null;
            if (preset?.agentName) agentSel = new Set([preset.agentName]);
            shell(); return;
        }
        if (ev.data.type === 'progress') {
            // Strict, not truthy: a build report belonging to a query that has
            // already been replaced must not draw over the one running now.
            if (typeof ev.data.seq === 'number' && ev.data.seq !== seq) return;
            prep = { done: ev.data.done || 0, total: ev.data.total || 0 };
            // ‼️ Only the results region redraws. A full `shell()` here would
            // rebuild the controls under the reader's hands and take the caret
            // out of the box they are still typing in.
            if (searching) renderResults();
            return;
        }
        if (ev.data.type !== 'results' || (ev.data.seq && ev.data.seq !== seq)) return;
        searching = false; dirty = false; prep = null;
        lastResult = ev.data.result; idMatch = ev.data.idMatch || null;
        if (ev.data.facets) facets = ev.data.facets;
        if (ev.data.semanticStatus) semStatus = ev.data.semanticStatus;
        shell();
    });

    // ‼️ ONCE, not in `wire()` — that runs on every repaint, and a window
    // listener registered there would stack one copy per paint.
    window.AFCtx.listen((act, ctx) => {
        if (act === 'scOnly') { chooseOnly(String(ctx.scopeKind || ''), String(ctx.scopeId || '')); }
    });

    shell();
})();
