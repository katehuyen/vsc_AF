// Agent Farm — compact fleet search: rich scope without hiding the answer.
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
        flt.engines, flt.projects, flt.models, flt.origin, flt.lane,
        flt.pinnedOnly, flt.errorsOnly, flt.session, flt.from, flt.to,
        flt.sort !== 'newest'
    ].filter(Boolean).length;

    function badge(attrs, label, on, disabled) {
        return `<button type="button" class="chip${on ? ' on' : ''}${disabled ? ' disabled' : ''}"
            ${attrs} aria-pressed="${on ? 'true' : 'false'}"${disabled ? ' disabled' : ''}>
            ${on ? '<span class="chip-check" aria-hidden="true">✓</span>' : ''}${label}
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
        return `<span class="seg" role="group" aria-label="Search method">${modes.map(x =>
            tip(badge(`data-mode="${x[0]}"`, x[1], mode === x[0]), x[1], x[2])
        ).join('')}</span>`;
    }

    function guideHtml() {
        const rows = (window.AFQuery.SYNTAX_ROWS || []).map(r =>
            `<tr><td><code>${C.esc(r.sym)}</code></td><td>${C.esc(r.what)}</td><td><code>${C.esc(r.example)}</code></td></tr>`).join('');
        return `<div class="guide"><table><thead><tr><th>Write</th><th>Meaning</th><th>Example</th></tr></thead><tbody>${rows}</tbody></table>
            <p><b>Text</b> combines these rules. <b>Regex</b> uses only JavaScript regular-expression syntax. <b>Meaning</b> compares your question with indexed conversation passages.</p></div>`;
    }

    function picker(id, label, options, selected, title, disabled) {
        return window.AFFilter.multi({ id, label, options, selected, title, disabled });
    }

    function filterPanelHtml() {
        if (!moreOpen) return '';
        const meaning = mode === 'meaning';
        return `<div class="fpanel" aria-label="Detailed session filters">
            <div class="filter-row">
                ${tip(`<input id="f-session" class="fbox" type="text" value="${C.esc(flt.session)}" placeholder="session id, title or path…">`,
                    'Session', 'A full id, the eight-character prefix shown by Agent Farm, a transcript path, or part of a session title.')}
                ${picker('f-engines', 'Engines', facets.engines.map(e => ({ v: e, t: window.AFEngine.label(e) })), flt.engines,
                    'Which CLI wrote the transcript. Meaning search returns only sessions present in its current index.')}
                ${picker('f-projects', 'Projects', facets.projects, flt.projects,
                    'The project resolved for each individual session: explicit membership, code root, then agent default.')}
                ${picker('f-models', 'Models', facets.models, flt.models, 'A session appears under every model it used.')}
            </div>
            <div class="chiprow detail-row">
                <span class="control-label">Started</span>
                <span class="seg">${badge('data-origin=""', 'All', !flt.origin)}${badge('data-origin="user"', 'You', flt.origin === 'user')}${badge('data-origin="auto"', 'Automation', flt.origin === 'auto')}</span>
                <span class="control-label">Lane</span>
                <span class="seg">${badge('data-lane=""', 'All', !flt.lane)}${badge('data-lane="main"', 'Main', flt.lane === 'main')}${badge('data-lane="sub"', 'Sub-agent', flt.lane === 'sub')}</span>
                ${tip(badge('data-flag="pinnedOnly"', '★ Pinned', flt.pinnedOnly), 'Pinned only', 'Only sessions on your shelf.')}
                ${tip(badge('data-flag="errorsOnly"', '⚠ Errors', flt.errorsOnly), 'Has errors', 'Only sessions with at least one tool error.')}
                <span class="date-range${meaning ? ' unavailable' : ''}"><span>When</span><input id="f-from" type="date" value="${C.esc(flt.from)}"${meaning ? ' disabled' : ''}><span>–</span><input id="f-to" type="date" value="${C.esc(flt.to)}"${meaning ? ' disabled' : ''}></span>
                <label class="sortbox"><span>Sort</span><select id="f-sort">${SORTS.map(s => `<option value="${s.id}"${flt.sort === s.id ? ' selected' : ''}>${s.label}</option>`).join('')}</select></label>
                <span class="grow"></span><button id="clear-filters" class="text-action"${activeFilterCount() ? '' : ' disabled'}>Clear details</button>
            </div>
        </div>`;
    }

    function controlsHtml() {
        const exact = mode !== 'meaning';
        const unavailable = mode === 'meaning';
        const fileScope = !!(preset && preset.file);
        const agents = facets.agents.length ? facets.agents : (DATA.agents || []);
        const queryTip = mode === 'text'
            ? window.AFQuery.tip('Searches only the content and sessions selected below.', { wholeWord: wholeOn })
            : mode === 'regex'
                ? 'This is passed to JavaScript RegExp. Query-language operators do not apply. Unsafe patterns are stopped after ten seconds.'
                : 'Finds similar passages in the semantic index. This covers indexed main-session conversation only; tool traffic, memory, events, message dates and non-indexed engines are not searched.';
        const interaction = 'Click to add or remove a kind. Ctrl-click (⌘ on Mac) keeps only that kind.';
        return `<section class="search-panel">
            <div class="query-row">
                ${tip(`<input id="q" type="text" value="${C.esc(queryText)}"
                    placeholder="${mode === 'meaning' ? 'Describe the idea or discussion…' : 'Words, phrase, path, error or session id…'}"
                    aria-label="Search query" autofocus>`, 'How this query is read', queryTip, 'query-tip')}
                <button id="go" class="primary-search">${searching ? 'Searching…' : 'Search'}</button>
            </div>
            <div class="chiprow mode-row">
                <span class="control-label">Mode</span>${modeHtml()}
                ${tip(badge('data-query-option="case"', 'Aa Case', caseOn, !exact), 'Match case', 'Agent and agent become different.')}
                ${tip(badge('data-query-option="whole"', '▣ Whole word', wholeOn, mode !== 'text'), 'Whole words', 'A bare word must match as a whole word: log no longer finds dialogue.')}
                <button id="guide-toggle" class="text-action" aria-expanded="${guideOpen}">Syntax ${guideOpen ? '▴' : '▾'}</button>
                <span class="grow"></span>${scopeHtml()}
                ${picker('search-agents', 'Agents', agents, agentSel ? [...agentSel] : null,
                    'Which agents own the sessions to search.', fileScope)}
            </div>
            <div class="chiprow scope-row${unavailable ? ' unavailable' : ''}" aria-disabled="${unavailable}">
                <span class="control-label">Search in</span>
                ${PRESETS.map(p => tip(badge(`data-preset="${p.id}"`, p.label, sameSet(p.roles), unavailable), p.label,
                    `${p.roles.map(id => ROLES.find(r => r.id === id)?.label).filter(Boolean).join(' · ')}.`)).join('')}
                <span class="chipsep"></span>
                ${ROLES.map(r => tip(badge(`data-role="${r.id}"`, `${r.icon} ${C.esc(r.label)}`, roleSel.has(r.id), unavailable), r.label, `${r.text}.\n\n${interaction}`)).join('')}
                <span class="chipsep"></span>
                ${tip(badge('data-source="memory"', '📝 Memory', sourceMemory, unavailable), 'Memory notes', 'Agent memory files, paragraph by paragraph.')}
                ${tip(badge('data-source="events"', '⌁ Events', sourceEvents, unavailable), 'Orphaned events', 'Events whose transcript no longer exists.')}
                <span class="grow"></span>
                ${tip(badge(`id="more-toggle" aria-expanded="${moreOpen}"`, `⚙ Filters${activeFilterCount() ? ` (${activeFilterCount()})` : ''} ${moreOpen ? '▴' : '▾'}`, moreOpen || activeFilterCount() > 0),
                    'Session filters', 'Open the engine, project, model, origin, lane, status, session-id, date and sort controls.', 'tip-right')}
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
            .query-row{display:flex;gap:7px}.query-tip{display:block;flex:1}.query-tip>input{box-sizing:border-box;width:100%;font-size:14px;padding:7px 9px}.primary-search{min-width:92px;font-weight:650}.chiprow{display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-top:7px}.control-label{font-size:10px;color:var(--vscode-descriptionForeground);white-space:nowrap}.grow{flex:1}.chipsep{width:1px;height:18px;margin:0 2px;background:var(--vscode-widget-border,#5555)}
            .chip{font-size:11px;line-height:17px;padding:1px 8px;border-radius:10px;cursor:pointer;background:transparent;color:var(--vscode-foreground);opacity:.78;border:1px solid var(--vscode-widget-border,#6667);white-space:nowrap}.chip:hover:not(:disabled){opacity:1;background:var(--vscode-list-hoverBackground)}.chip.on{opacity:1;color:var(--vscode-button-foreground);background:var(--vscode-button-background);border-color:var(--vscode-focusBorder);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--vscode-focusBorder) 55%,transparent);font-weight:600}.chip-check{margin-right:3px}.chip.disabled,.unavailable .chip:not(#more-toggle){opacity:.32;cursor:default}.seg{display:inline-flex}.seg>.af-tipw:not(:first-child) .chip,.seg>.chip:not(:first-child){border-top-left-radius:0;border-bottom-left-radius:0;margin-left:-1px}.seg>.af-tipw:not(:last-child) .chip,.seg>.chip:not(:last-child){border-top-right-radius:0;border-bottom-right-radius:0}.mode-row .afms-btn{font-size:11px;padding:2px 8px}.scope-note{font-size:10px;color:var(--vscode-descriptionForeground)}.scope-pill{font-size:10px;border:1px solid var(--vscode-focusBorder);border-radius:10px;padding:1px 4px 1px 8px;white-space:nowrap}.scope-pill button{border:0;background:transparent;color:inherit;padding:0 3px}.text-action{border:0;background:transparent;color:var(--vscode-textLink-foreground);padding:2px 4px;cursor:pointer;font-size:11px}.text-action:disabled{opacity:.3;cursor:default}
            .meaning-line,.dirty-note{margin-top:7px;padding:5px 8px;border-left:3px solid var(--vscode-charts-yellow,#cca700);background:color-mix(in srgb,var(--vscode-charts-yellow,#cca700) 8%,transparent);font-size:11px}.meaning-line #sem-status{margin-left:5px;color:var(--vscode-descriptionForeground)}.fpanel{margin-top:7px;padding:7px 8px;border:1px solid var(--vscode-widget-border,#5555);border-radius:6px;background:color-mix(in srgb,var(--vscode-foreground) 2%,transparent)}.filter-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.filter-row>.af-tipw:first-child{flex:1;min-width:210px}.fbox{box-sizing:border-box;width:100%;font-size:11px;padding:3px 6px}.filter-row .afms-btn{font-size:11px;min-width:118px;padding:3px 8px}.detail-row{margin-top:6px}.date-range,.sortbox{display:inline-flex;align-items:center;gap:4px;font-size:10px;color:var(--vscode-descriptionForeground)}.date-range input,.sortbox select{font-size:10px;padding:1px 3px}.date-range.unavailable,.scope-row.unavailable>.control-label,.scope-row.unavailable>.chipsep{opacity:.45}.guide{margin-top:7px;padding:8px;border:1px solid var(--vscode-widget-border,#5555);border-radius:6px;max-height:280px;overflow:auto}.guide table{font-size:11px;width:100%}.guide p{font-size:10px;color:var(--vscode-descriptionForeground)}
            .resultsbar{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin:9px 0 7px;font-size:11px;color:var(--vscode-descriptionForeground)}.resultsbar span{padding:2px 8px;border:1px solid var(--vscode-widget-border,#5555);border-radius:10px}.resultsbar b{color:var(--vscode-foreground);margin-right:3px}.partial{padding:5px 8px;border-left:3px solid var(--vscode-charts-yellow,#cca700);background:color-mix(in srgb,var(--vscode-charts-yellow,#cca700) 8%,transparent);margin-bottom:7px;font-size:11px}.sessgroup{margin-bottom:9px;border:1px solid var(--vscode-widget-border,#5555);border-radius:7px;overflow:hidden}.sesshead{display:flex;align-items:center;gap:7px;padding:7px 9px;cursor:pointer;background:color-mix(in srgb,var(--vscode-textLink-foreground) 8%,transparent)}.sesshead .meta{margin-left:auto;text-align:right;font-size:10px;color:var(--vscode-descriptionForeground)}.hit{padding:6px 9px 6px 15px;border-top:1px solid color-mix(in srgb,var(--vscode-widget-border,#5555) 55%,transparent);cursor:pointer}.hit:hover{background:var(--vscode-list-hoverBackground)}.hit .badges{display:flex;gap:5px;margin-bottom:3px}.turnhead{font-size:10px;color:var(--vscode-descriptionForeground);padding:5px 9px 1px;background:color-mix(in srgb,var(--vscode-foreground) 3%,transparent)}.id-card{margin:9px 0 7px;padding:6px 9px;border-left:3px solid var(--vscode-charts-blue,#3794ff);background:color-mix(in srgb,var(--vscode-charts-blue,#3794ff) 10%,transparent);cursor:pointer}.source-head{margin:14px 0 6px;font-weight:650}.empty{padding:18px;text-align:center;color:var(--vscode-descriptionForeground)}mark{background:var(--vscode-editor-findMatchHighlightBackground,#ffd33d55)}
            @media(max-width:780px){.chipsep{display:none}.filter-row>.af-tipw:first-child{min-width:100%;flex-basis:100%}.resultsbar{gap:4px}.sesshead{align-items:flex-start}.sesshead .meta{min-width:130px}}
        </style>`;
    }

    function shell() {
        document.getElementById('app').innerHTML = `${styleHtml()}${window.AFHeader.html({
            page: 'search', title: 'Search',
            sub: 'Find the exact conversation, action or session across the fleet.', refresh: false,
            guide: 'transcript-arama'
        })}${controlsHtml()}<div id="out"></div>`;
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
        if (sf) {
            window.AFFilter.live(sf, el => { flt.session = el.value; changed(true); }, 300);
            window.AFFilter.clearable(sf, el => { flt.session = ''; el.value = ''; changed(true); });
        }
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
        let html = `${idHtml()}<div class="resultsbar">
            <span><b>${found}</b>matches</span><span><b>${shown}</b>previews</span>
            <span><b>${matched}</b>sessions</span><span><b>${r.filesScanned}</b>scanned</span></div>`;
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
