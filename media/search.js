// Agent Farm — a deliberate search workspace, not a toolbar with patches.
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    const DATA = window.__DATA__;

    const ROLES = [
        { id: 'user', icon: '🧑', label: 'You', text: 'Prompts written by a person' },
        { id: 'assistant', icon: '🤖', label: 'Agent replies', text: 'The agent’s own answers' },
        { id: 'delegator', icon: '📤', label: 'Handover', text: 'What one agent assigned to another' },
        { id: 'handler', icon: '📥', label: 'Sub-agent replies', text: 'What the delegated agent answered' },
        { id: 'tool', icon: '🔧', label: 'Tool calls', text: 'Commands, paths, queries and inputs' },
        { id: 'toolResult', icon: '📄', label: 'Tool results', text: 'Files, command output and errors' }
    ];
    const ALL_ROLES = ROLES.map(x => x.id);
    const PRESETS = [
        { id: 'dialog', label: 'Conversation', roles: ['user', 'assistant'] },
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
    let roleSel = new Set(['user', 'assistant']);
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
    let seq = 0;
    let flt = {
        engines: null, projects: null, models: null,
        origin: '', lane: '', pinnedOnly: false, errorsOnly: false,
        session: '', from: '', to: '', sort: 'newest'
    };

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
        agentSel, flt.engines, flt.projects, flt.models, flt.origin, flt.lane,
        flt.pinnedOnly, flt.errorsOnly, flt.session, flt.from, flt.to
    ].filter(Boolean).length;

    function choice(attrs, icon, label, detail, on, disabled) {
        return `<button type="button" class="choice${on ? ' on' : ''}${disabled ? ' disabled' : ''}"
            ${attrs} aria-pressed="${on ? 'true' : 'false'}"${disabled ? ' disabled' : ''}>
            <span class="choice-mark" aria-hidden="true">${on ? '✓' : ''}</span>
            <span class="choice-icon">${icon}</span><span><b>${C.esc(label)}</b><small>${C.esc(detail)}</small></span>
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
        return `Index: <b>${C.esc(semStatus.provider)}</b> · ${semStatus.sessions} sessions · ${semStatus.chunks} passages · <a id="build-index">update</a>`;
    }

    function modeHtml() {
        const modes = [
            ['text', 'Text', 'The query language: words, phrases, OR, exclusions and wildcards'],
            ['regex', 'Regex', 'A regular expression, with a ten-second safety budget'],
            ['meaning', 'Meaning', 'Conceptually similar indexed conversation passages']
        ];
        return `<div class="modebar" role="group" aria-label="Search method">${modes.map(x =>
            tip(`<button type="button" data-mode="${x[0]}" class="mode${mode === x[0] ? ' on' : ''}"
                aria-pressed="${mode === x[0]}">${mode === x[0] ? '<span>✓</span>' : ''}${x[1]}</button>`, x[1], x[2])
        ).join('')}</div>`;
    }

    function queryHtml() {
        const exact = mode !== 'meaning';
        const queryTip = mode === 'text'
            ? window.AFQuery.tip('Searches only the content and sessions selected below.', { wholeWord: wholeOn })
            : mode === 'regex'
                ? 'This is passed to JavaScript RegExp. Query-language operators do not apply. Unsafe patterns are stopped after ten seconds.'
                : 'Finds similar passages in the semantic index. This covers indexed main-session conversation only; tool traffic, memory, events, message dates and non-indexed engines are not searched.';
        return `<section class="search-compose">
            <div class="section-kicker">1 · Ask</div>
            <div class="compose-head"><div><h2>What are you trying to find?</h2>
                <p>Choose how the query should be understood, then run it deliberately.</p></div>${modeHtml()}</div>
            <div class="query-row">
                ${tip(`<input id="q" type="text" value="${C.esc(queryText)}"
                    placeholder="${mode === 'meaning' ? 'Describe the idea or discussion…' : 'Words, phrase, path, error or session id…'}"
                    aria-label="Search query" autofocus>`, 'How this query is read', queryTip, 'query-tip')}
                <button id="go" class="primary-search">${searching ? 'Searching…' : 'Search'}</button>
            </div>
            <div class="query-options">
                ${choice('data-query-option="case"', 'Aa', 'Match case', 'Agent and agent become different', caseOn, !exact)}
                ${choice('data-query-option="whole"', '▣', 'Whole words', 'log no longer finds dialogue', wholeOn, mode !== 'text')}
                <button id="guide-toggle" class="text-action" aria-expanded="${guideOpen}">Query guide ${guideOpen ? '▴' : '▾'}</button>
                <span class="grow"></span>${scopeHtml()}
            </div>
            ${guideOpen ? guideHtml() : ''}
            ${mode === 'meaning' ? `<div class="mode-notice"><b>Meaning search has a narrower source.</b>
                It searches indexed main-session conversation passages. Session metadata filters still apply; content kinds, extra sources and message dates below are unavailable in this mode.
                <span id="sem-status">${semanticStatusHtml()}</span></div>` : ''}
        </section>`;
    }

    function guideHtml() {
        const rows = (window.AFQuery.SYNTAX_ROWS || []).map(r =>
            `<tr><td><code>${C.esc(r.sym)}</code></td><td>${C.esc(r.what)}</td><td><code>${C.esc(r.example)}</code></td></tr>`).join('');
        return `<div class="guide"><table><thead><tr><th>Write</th><th>Meaning</th><th>Example</th></tr></thead><tbody>${rows}</tbody></table>
            <p><b>Text</b> combines these rules. <b>Regex</b> uses only JavaScript regular-expression syntax. <b>Meaning</b> compares your question with indexed conversation passages.</p></div>`;
    }

    function contentHtml() {
        const unavailable = mode === 'meaning';
        return `<section class="workspace-section${unavailable ? ' unavailable' : ''}" aria-disabled="${unavailable}">
            <div class="section-kicker">2 · Choose content</div>
            <div class="section-title"><div><h2>Where inside a record?</h2><p>Start with a useful preset or combine exact message kinds.</p></div>
                <div class="presetbar">${PRESETS.map(p => `<button data-preset="${p.id}" class="preset${sameSet(p.roles) ? ' on' : ''}"
                    aria-pressed="${sameSet(p.roles)}"${unavailable ? ' disabled' : ''}>${sameSet(p.roles) ? '✓ ' : ''}${p.label}</button>`).join('')}</div></div>
            <div class="choice-grid roles">${ROLES.map(r => choice(`data-role="${r.id}"`, r.icon, r.label, r.text,
                roleSel.has(r.id), unavailable)).join('')}</div>
            <div class="source-row"><span>Additional sources</span>
                ${choice('data-source="memory"', '📝', 'Memory notes', 'Agent memory files, paragraph by paragraph', sourceMemory, unavailable)}
                ${choice('data-source="events"', '⌁', 'Orphaned events', 'Events whose transcript no longer exists', sourceEvents, unavailable)}
            </div>
        </section>`;
    }

    function picker(id, label, options, selected, title, disabled) {
        return window.AFFilter.multi({ id, label, options, selected, title, disabled });
    }

    function filtersHtml() {
        const fileScope = !!(preset && preset.file);
        const meaning = mode === 'meaning';
        const agents = facets.agents.length ? facets.agents : (DATA.agents || []);
        return `<section class="workspace-section">
            <div class="section-kicker">3 · Narrow sessions</div>
            <div class="section-title"><div><h2>Which sessions should be searched?</h2>
                <p>These filters reduce the pool before matching. ${activeFilterCount() ? `<b>${activeFilterCount()} active.</b>` : 'Nothing is narrowed.'}</p></div>
                <button id="clear-filters" class="text-action"${activeFilterCount() ? '' : ' disabled'}>Reset session filters</button></div>
            <div class="filter-grid">
                <label><span>Agent</span>${picker('search-agents', 'Agents', agents,
                    agentSel ? [...agentSel] : null, 'Only sessions owned by the selected agents.', fileScope)}</label>
                <label><span>Engine</span>${picker('f-engines', 'Engines', facets.engines.map(e => ({ v: e, t: window.AFEngine.label(e) })),
                    flt.engines, 'Which CLI wrote the transcript. Meaning search returns only sessions present in its current index.')}</label>
                <label><span>Project</span>${picker('f-projects', 'Projects', facets.projects, flt.projects,
                    'The project resolved for each individual session: explicit membership, code root, then agent default.')}</label>
                <label><span>Model</span>${picker('f-models', 'Models', facets.models, flt.models,
                    'A session appears under every model it used.')}</label>
                <label class="session-filter"><span>Session id, title or path</span><input id="f-session" type="text" value="${C.esc(flt.session)}" placeholder="e.g. 6a87fbf8 or a title"></label>
            </div>
            <button id="more-toggle" class="more-toggle" aria-expanded="${moreOpen}">More session filters ${moreOpen ? '▴' : '▾'}</button>
            ${moreOpen ? `<div class="more-grid">
                <fieldset><legend>Started by</legend>
                    <button data-origin="" class="seg${!flt.origin ? ' on' : ''}">All</button><button data-origin="user" class="seg${flt.origin === 'user' ? ' on' : ''}">You</button><button data-origin="auto" class="seg${flt.origin === 'auto' ? ' on' : ''}">Automation</button>
                </fieldset>
                <fieldset><legend>Lane</legend>
                    <button data-lane="" class="seg${!flt.lane ? ' on' : ''}">All</button><button data-lane="main" class="seg${flt.lane === 'main' ? ' on' : ''}">Main</button><button data-lane="sub" class="seg${flt.lane === 'sub' ? ' on' : ''}">Sub-agent</button>
                </fieldset>
                ${choice('data-flag="pinnedOnly"', '★', 'Pinned only', 'Only sessions on your shelf', flt.pinnedOnly)}
                ${choice('data-flag="errorsOnly"', '⚠', 'Has errors', 'Only sessions with tool errors', flt.errorsOnly)}
                <label class="date-range${meaning ? ' unavailable' : ''}"><span>Message date</span><input id="f-from" type="date" value="${C.esc(flt.from)}"${meaning ? ' disabled' : ''}><span>to</span><input id="f-to" type="date" value="${C.esc(flt.to)}"${meaning ? ' disabled' : ''}></label>
                <label><span>Order results</span><select id="f-sort">${SORTS.map(s => `<option value="${s.id}"${flt.sort === s.id ? ' selected' : ''}>${s.label}</option>`).join('')}</select></label>
            </div>` : ''}
            ${dirty ? '<div class="dirty-note">The search definition changed. Run Search to refresh the answer.</div>' : ''}
        </section>`;
    }

    function styleHtml() {
        return `<style>
            #app{max-width:1180px;margin:0 auto}.search-compose,.workspace-section{margin-top:12px;padding:18px;border:1px solid var(--vscode-widget-border,#5555);border-radius:10px;background:var(--vscode-editorWidget-background,var(--vscode-editor-background));box-shadow:0 1px 0 #0001}
            .section-kicker{text-transform:uppercase;letter-spacing:.12em;font-size:10px;font-weight:700;color:var(--vscode-textLink-foreground);margin-bottom:6px}.compose-head,.section-title{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.compose-head h2,.section-title h2{font-size:17px;margin:0}.compose-head p,.section-title p{margin:4px 0 0;color:var(--vscode-descriptionForeground);font-size:12px}.modebar,.presetbar{display:flex;gap:2px;padding:3px;border-radius:7px;background:color-mix(in srgb,var(--vscode-foreground) 7%,transparent)}
            .mode,.preset,.seg{border:1px solid transparent;background:transparent;color:inherit;padding:5px 10px;border-radius:5px;font-size:12px}.mode.on,.preset.on,.seg.on{border-color:var(--vscode-focusBorder);background:color-mix(in srgb,var(--vscode-button-background) 28%,transparent);font-weight:600}.mode span{margin-right:5px}.query-row{display:flex;gap:8px;margin-top:14px}.query-tip{display:block;flex:1}.query-tip>input{box-sizing:border-box;width:100%;font-size:15px;padding:10px 12px}.primary-search{min-width:112px;font-weight:650}.query-options{display:flex;align-items:center;gap:8px;margin-top:10px;flex-wrap:wrap}.grow{flex:1}.scope-note{font-size:11px;color:var(--vscode-descriptionForeground)}.scope-pill{font-size:11px;border:1px solid var(--vscode-focusBorder);border-radius:14px;padding:3px 5px 3px 10px}.scope-pill button{border:0;background:transparent;color:inherit;padding:0 4px}.text-action,.more-toggle{border:0;background:transparent;color:var(--vscode-textLink-foreground);padding:4px;cursor:pointer}.text-action:disabled{opacity:.35;cursor:default}
            .choice-grid{display:grid;gap:8px;margin-top:12px}.choice-grid.roles{grid-template-columns:repeat(3,minmax(190px,1fr))}.choice{position:relative;display:flex;gap:9px;align-items:center;min-height:52px;text-align:left;color:inherit;background:transparent;border:1px solid var(--vscode-widget-border,#5558);border-radius:8px;padding:8px 10px;opacity:.78}.choice:hover:not(:disabled){background:var(--vscode-list-hoverBackground);opacity:1}.choice.on{opacity:1;border-color:var(--vscode-focusBorder);background:color-mix(in srgb,var(--vscode-button-background) 20%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--vscode-focusBorder) 45%,transparent)}.choice-mark{position:absolute;right:7px;top:5px;width:16px;height:16px;border-radius:50%;font-size:11px;line-height:16px;text-align:center;background:var(--vscode-button-background);color:var(--vscode-button-foreground)}.choice:not(.on) .choice-mark{border:1px solid var(--vscode-widget-border,#7777);background:transparent}.choice-icon{font-size:17px}.choice small{display:block;margin-top:3px;color:var(--vscode-descriptionForeground);font-size:10px;font-weight:400}.choice.disabled,.unavailable .choice{opacity:.35}.source-row{display:flex;align-items:center;gap:8px;margin-top:10px}.source-row>span{font-size:11px;color:var(--vscode-descriptionForeground);margin-right:4px}.source-row .choice{flex:1;min-height:46px}.unavailable{position:relative;opacity:.52}.mode-notice,.dirty-note{margin-top:10px;padding:9px 11px;border-left:3px solid var(--vscode-charts-yellow,#cca700);background:color-mix(in srgb,var(--vscode-charts-yellow,#cca700) 10%,transparent);font-size:12px}.mode-notice #sem-status{display:block;margin-top:5px;color:var(--vscode-descriptionForeground)}
            .filter-grid{display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:10px;margin-top:13px}.filter-grid label,.more-grid label{display:flex;flex-direction:column;gap:5px;font-size:11px;color:var(--vscode-descriptionForeground)}.filter-grid .afms,.filter-grid .af-tipw,.filter-grid .afms-btn{display:block;width:100%;box-sizing:border-box}.filter-grid .afms-btn{text-align:left}.session-filter{grid-column:span 4}.more-toggle{margin-top:10px;padding-left:0}.more-grid{display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:10px;align-items:end;padding-top:10px;border-top:1px solid var(--vscode-widget-border,#5555)}.more-grid fieldset{border:0;padding:0;margin:0}.more-grid legend{font-size:11px;color:var(--vscode-descriptionForeground);margin-bottom:5px}.date-range{grid-column:span 2;display:flex!important;flex-direction:row!important;align-items:center}.date-range>span:first-child{margin-right:5px}.guide{margin-top:10px;padding:10px;border:1px solid var(--vscode-widget-border,#5555);border-radius:7px;max-height:320px;overflow:auto}.guide table{font-size:12px;width:100%}.guide p{font-size:11px;color:var(--vscode-descriptionForeground)}
            .results-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0}.metric{padding:10px;border:1px solid var(--vscode-widget-border,#5555);border-radius:7px}.metric b{display:block;font-size:18px}.metric span{font-size:10px;color:var(--vscode-descriptionForeground)}.partial{padding:9px 11px;border-left:3px solid var(--vscode-charts-yellow,#cca700);background:color-mix(in srgb,var(--vscode-charts-yellow,#cca700) 10%,transparent);margin-bottom:10px}.sessgroup{margin-bottom:10px;border:1px solid var(--vscode-widget-border,#5555);border-radius:8px;overflow:hidden}.sesshead{display:flex;align-items:center;gap:7px;padding:9px 11px;cursor:pointer;background:color-mix(in srgb,var(--vscode-textLink-foreground) 8%,transparent)}.sesshead .meta{margin-left:auto;text-align:right;font-size:10px;color:var(--vscode-descriptionForeground)}.hit{padding:8px 11px 8px 18px;border-top:1px solid color-mix(in srgb,var(--vscode-widget-border,#5555) 55%,transparent);cursor:pointer}.hit:hover{background:var(--vscode-list-hoverBackground)}.hit .badges{display:flex;gap:5px;margin-bottom:4px}.turnhead{font-size:10px;color:var(--vscode-descriptionForeground);padding:7px 11px 2px;background:color-mix(in srgb,var(--vscode-foreground) 3%,transparent)}.id-card{margin:12px 0;padding:9px 11px;border-left:3px solid var(--vscode-charts-blue,#3794ff);background:color-mix(in srgb,var(--vscode-charts-blue,#3794ff) 10%,transparent);cursor:pointer}.source-head{margin:18px 0 7px;font-weight:650}.empty{padding:24px;text-align:center;color:var(--vscode-descriptionForeground)}mark{background:var(--vscode-editor-findMatchHighlightBackground,#ffd33d55)}
            @media(max-width:780px){.compose-head,.section-title{display:block}.modebar,.presetbar{margin-top:10px}.choice-grid.roles,.filter-grid,.more-grid{grid-template-columns:1fr 1fr}.session-filter{grid-column:span 2}.results-summary{grid-template-columns:1fr 1fr}}
        </style>`;
    }

    function shell() {
        document.getElementById('app').innerHTML = `${styleHtml()}${window.AFHeader.html({
            page: 'search', title: 'Search',
            sub: 'Find the exact conversation, action or session across the fleet.', refresh: false,
            guide: 'transcript-arama'
        })}${queryHtml()}${contentHtml()}${filtersHtml()}<div id="out"></div>`;
        window.AFHeader.wire(vscode);
        wire();
        renderResults();
    }

    function rememberQuery() {
        const q = document.getElementById('q');
        if (q) queryText = q.value;
    }

    function changed(auto) {
        rememberQuery();
        dirty = !!lastResult;
        shell();
        if (auto && mode !== 'meaning' && queryText.trim()) run();
    }

    function run() {
        rememberQuery();
        if (!queryText.trim()) return;
        searching = true; dirty = false; shell();
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
        window.AFFilter.wireMulti({ id, onChange: sel => { assign(sel); changed(true); } });
    }

    function wire() {
        const q = document.getElementById('q');
        if (q) {
            q.addEventListener('input', () => { queryText = q.value; });
            q.addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
            window.AFFilter.clearable(q, () => {
                queryText = ''; lastResult = null; idMatch = null; searching = false; dirty = false; renderResults();
            });
        }
        document.getElementById('go').addEventListener('click', run);
        document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
            mode = b.dataset.mode; changed(false);
        }));
        document.querySelectorAll('[data-query-option]').forEach(b => b.addEventListener('click', () => {
            if (b.dataset.queryOption === 'case') caseOn = !caseOn; else wholeOn = !wholeOn;
            changed(false);
        }));
        document.getElementById('guide-toggle').addEventListener('click', () => { guideOpen = !guideOpen; changed(false); });
        document.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => {
            roleSel = new Set(PRESETS.find(p => p.id === b.dataset.preset).roles); changed(true);
        }));
        document.querySelectorAll('[data-role]').forEach(b => b.addEventListener('click', e => {
            const id = b.dataset.role;
            if (e.ctrlKey || e.metaKey) roleSel = new Set([id]);
            else if (roleSel.has(id)) roleSel.delete(id); else roleSel.add(id);
            if (!roleSel.size) roleSel = new Set(['user', 'assistant']);
            changed(true);
        }));
        document.querySelectorAll('[data-source]').forEach(b => b.addEventListener('click', () => {
            if (b.dataset.source === 'memory') sourceMemory = !sourceMemory; else sourceEvents = !sourceEvents;
            changed(true);
        }));
        wirePicker('search-agents', sel => { agentSel = sel === null ? null : new Set(sel); preset = null; });
        wirePicker('f-engines', sel => { flt.engines = sel; });
        wirePicker('f-projects', sel => { flt.projects = sel; });
        wirePicker('f-models', sel => { flt.models = sel; });
        const sf = document.getElementById('f-session');
        window.AFFilter.live(sf, el => { flt.session = el.value; changed(true); }, 300);
        window.AFFilter.clearable(sf, el => { flt.session = ''; el.value = ''; changed(true); });
        document.getElementById('more-toggle').addEventListener('click', () => { moreOpen = !moreOpen; changed(false); });
        const clear = document.getElementById('clear-filters');
        if (clear && !clear.disabled) clear.addEventListener('click', () => {
            agentSel = null; flt = { engines: null, projects: null, models: null, origin: '', lane: '', pinnedOnly: false, errorsOnly: false, session: '', from: '', to: '', sort: 'newest' }; changed(true);
        });
        document.querySelectorAll('[data-origin]').forEach(b => b.addEventListener('click', () => { flt.origin = b.dataset.origin; changed(true); }));
        document.querySelectorAll('[data-lane]').forEach(b => b.addEventListener('click', () => { flt.lane = b.dataset.lane; changed(true); }));
        document.querySelectorAll('[data-flag]').forEach(b => b.addEventListener('click', () => { flt[b.dataset.flag] = !flt[b.dataset.flag]; changed(true); }));
        if (moreOpen) {
            const from = document.getElementById('f-from'); const to = document.getElementById('f-to');
            if (from) window.AFFilter.live(from, el => { flt.from = el.value; changed(true); }, 200);
            if (to) window.AFFilter.live(to, el => { flt.to = el.value; changed(true); }, 200);
            document.getElementById('f-sort').addEventListener('change', e => { flt.sort = e.target.value; changed(false); });
        }
        const clearScope = document.getElementById('clear-scope');
        if (clearScope) clearScope.addEventListener('click', () => { preset = null; agentSel = null; changed(true); });
        const settings = document.getElementById('sem-settings');
        if (settings) settings.addEventListener('click', () => vscode.postMessage({ type: 'openFarmSettings', focus: 'agentFarm.embeddingsProvider' }));
        const build = document.getElementById('build-index');
        if (build) build.addEventListener('click', () => vscode.postMessage({ type: 'buildIndex' }));
    }

    const ROLE_WORD = { user: 'you', assistant: 'agent', delegator: 'handover', handler: 'sub-agent', tool: 'tool', toolResult: 'result', memory: 'memory', event: 'event' };
    const SESSION_HINT = window.AFSessionCtx.HINT;
    const viewerRoles = () => [...roleSel].map(r => r === 'delegator' ? 'user' : r === 'handler' ? 'assistant' : r);
    const openSession = (file, ts) => vscode.postMessage({ type: 'openSession', file, ts: ts || 0, roles: viewerRoles() });

    function hitHtml(h, i) {
        const isSession = h.kind !== 'memory' && h.kind !== 'event' && h.file;
        const ctx = isSession ? ' ' + window.AFSessionCtx.row(h, { webviewSection: 'afSearchHit', hitIndex: i, hitTs: h.ts || 0 }) : '';
        return `<div class="hit" data-hit="${i}"${ctx}>
            <div class="badges"><span class="badge">${C.esc(ROLE_WORD[h.role] || h.role)}${h.tool ? ' · ' + C.esc(h.tool) : ''}</span>
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
        if (searching) { out.innerHTML = '<div class="empty">Searching the selected session pool…</div>'; return; }
        if (!lastResult) { out.innerHTML = '<div class="empty">Build the search above, then press Search.</div>'; return; }
        if (lastResult.error) { out.innerHTML = `<div class="partial">⚠ ${C.esc(lastResult.error)}</div>`; return; }
        const r = lastResult;
        const found = Number.isFinite(r.matchesFound) ? r.matchesFound : r.hits.length;
        const shown = Number.isFinite(r.matchesShown) ? r.matchesShown : r.hits.length;
        const matched = Number.isFinite(r.sessionsMatched) ? r.sessionsMatched : new Set(r.hits.filter(h => !h.kind).map(h => h.file)).size;
        let html = `${idHtml()}<div class="results-summary">
            <div class="metric"><b>${found}</b><span>matches found</span></div><div class="metric"><b>${shown}</b><span>previews shown</span></div>
            <div class="metric"><b>${matched}</b><span>sessions matched</span></div><div class="metric"><b>${r.filesScanned}</b><span>sessions scanned</span></div></div>`;
        if (r.omittedMatches || r.timedOut || r.parseFailures) {
            html += `<div class="partial"><b>Coverage note.</b> ${r.omittedMatches ? `${r.omittedMatches} additional matches are counted but not previewed. ` : ''}${r.timedOut ? 'The time budget ended the scan early. ' : ''}${r.parseFailures ? `${r.parseFailures} transcript(s) could not be read.` : ''}</div>`;
        }
        if (!r.hits.length) { out.innerHTML = html + '<div class="empty">No match in this scope.</div>'; wireResults(); return; }
        const transcript = r.hits.map((h, i) => ({ h, i }))
            .filter(x => x.h.kind !== 'memory' && x.h.kind !== 'event');
        const extras = r.hits.map((h, i) => ({ h, i }))
            .filter(x => x.h.kind === 'memory' || x.h.kind === 'event');
        const groups = [];
        const map = new Map();
        transcript.forEach(x => { if (!map.has(x.h.file)) { const g = { file: x.h.file, rows: [] }; map.set(x.h.file, g); groups.push(g); } map.get(x.h.file).rows.push(x); });
        const groupTs = g => g.rows[0].h.sessionTs || g.rows[0].h.ts || 0;
        if (flt.sort === 'oldest') groups.sort((a, b) => groupTs(a) - groupTs(b));
        else if (flt.sort === 'hits') groups.sort((a, b) => b.rows.length - a.rows.length || groupTs(b) - groupTs(a));
        else if (flt.sort === 'agent') groups.sort((a, b) => String(a.rows[0].h.agentName).localeCompare(String(b.rows[0].h.agentName)) || groupTs(b) - groupTs(a));
        else groups.sort((a, b) => groupTs(b) - groupTs(a));
        const counts = new Map((r.sessionMatches || []).map(x => [x.file, x]));
        html += groups.map(g => {
            const first = g.rows[0].h; const count = counts.get(g.file) || { found: g.rows.length, shown: g.rows.length };
            let turn = null;
            const body = g.rows.map(x => {
                const head = x.h.turn && x.h.turn !== turn ? `<div class="turnhead">Turn ${x.h.turn}${x.h.turnLabel ? ' · ' + C.esc(x.h.turnLabel) : ''}</div>` : '';
                turn = x.h.turn; return head + hitHtml(x.h, x.i);
            }).join('');
            return `<div class="sessgroup"><div class="sesshead" data-open="${C.esc(first.file)}" data-ts="${first.ts || 0}" ${window.AFSessionCtx.row(first)}>
                ${window.AFEngine.badge(first.engine || 'claude')}<strong>${C.esc(first.agentName)}</strong><span>· ${C.esc(first.title)}</span>
                <span class="meta">${count.shown === count.found ? `${count.found} matches` : `${count.shown} of ${count.found} shown`}<br>${C.esc(first.project || '')} ${relTime(groupTs(g))} · ${C.esc(SESSION_HINT)}</span></div>${body}</div>`;
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
            changed(true); return;
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
        if (ev.data.type !== 'results' || (ev.data.seq && ev.data.seq !== seq)) return;
        searching = false; dirty = false;
        lastResult = ev.data.result; idMatch = ev.data.idMatch || null;
        if (ev.data.facets) facets = ev.data.facets;
        if (ev.data.semanticStatus) semStatus = ev.data.semanticStatus;
        shell();
    });

    shell();
})();
