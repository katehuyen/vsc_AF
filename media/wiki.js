// Agent Farm — the Wiki cockpit (U-70, X-50).
//
// ‼️ WHAT THIS PAGE IS FOR. Marking a turn is one gesture and costs nothing, so
// the pool fills up fast — and until this page there was nowhere to READ it.
// The three questions it answers without a click are: what is waiting, what is
// it about, and where did the compile put it. Everything else on the page is a
// way of narrowing to the rows you then press Compile on.
//
// ‼️ AND THE COMPILE BUTTON STARTS A RUN, IT DOES NOT WRITE A PAGE. Nothing
// here is marked compiled by pressing it; the agent's run reports back
// (wiki.candidates.edit) and the row changes then. A row whose run is still
// alive is drawn `compiling` and is not offered — the host refuses it anyway,
// but a button that looks pressable and is not is a lie the reader pays for.
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    const T = window.AFTip;
    let DATA = window.__DATA__;
    let LINT = null;                 // the last shape check, drawn under the table

    const selected = new Set();      // ticked row ids
    let editing = null;              // id of the row whose topics are open
    let refocus = null;              // 'search' | 'topics' — what to put the caret back in

    const DEF = { fTopic: null, fState: ['pending', 'compiled'], query: '' };
    const saved = (vscode.getState && vscode.getState()) || {};
    let fTopic = saved.fTopic === undefined ? DEF.fTopic : saved.fTopic;
    let fState = saved.fState === undefined ? DEF.fState : saved.fState;
    let query = saved.query === undefined ? DEF.query : saved.query;
    function saveState() { if (vscode.setState) { vscode.setState({ fTopic, fState, query }); } }

    window.addEventListener('message', ev => {
        if (ev.data.type === 'data') { DATA = ev.data.data; render(); }
        if (ev.data.type === 'lint') { LINT = ev.data.data; render(); }
    });

    const esc = s => C.esc(String(s == null ? '' : s));
    const post = m => vscode.postMessage(m);

    // A mark is in one of four states on screen, and `compiling` is not a state
    // in the pool (B-14 — the dictionary is a published contract): it is a
    // PENDING row with a live run out for it. Drawn apart because the one thing
    // a reader must not do is ask for it again.
    const STATE = {
        pending: { icon: '⏳', label: 'waiting', cls: 'wk-pending' },
        compiling: { icon: '⚙', label: 'compiling', cls: 'wk-compiling' },
        // ‼️ X-58 — STILL WAITING, BUT WAITING FOR A SECOND TRY. A mark whose
        // last run died of a rate limit or a cancel is `pending` like any other
        // and reads completely differently: somebody already tried this one and
        // it produced nothing. Drawn as its own state so the row is scannable,
        // never as a fifth value of `state` — the store has three and this is a
        // fact ABOUT a pending mark.
        failed: { icon: '⚠', label: 'failed', cls: 'wk-failed' },
        compiled: { icon: '✅', label: 'compiled', cls: 'wk-compiled' },
        dropped: { icon: '🚫', label: 'dropped', cls: 'wk-dropped' }
    };
    const stateOf = c => (c.compiling ? 'compiling'
        : c.state === 'pending' && c.lastError ? 'failed' : c.state);

    function pool() { return (DATA.status && DATA.status.pool) || {}; }
    function vault() { return (DATA.status && DATA.status.wiki) || {}; }
    function rows() { return DATA.candidates || []; }

    /** The rows the filters leave. `compiling` filters as `pending`, which is
     *  what it is — hiding a running compile behind a state nobody ticked would
     *  make a mark vanish mid-flight. */
    function shown() {
        // ‼️ The shared grammar, compiled ONCE per pass — a mark is found by the
        // same rules a transcript is (X-37). Everything the pool knows about a
        // mark is one haystack, because a reader looking for "kota" does not
        // know whether they wrote it as a topic, in the prompt or in a note.
        const q = window.AFQuery.compile(query);
        return rows().filter(c => {
            if (fState && fState.indexOf(c.state) < 0) { return false; }
            if (fTopic && !(c.topics || []).some(t => fTopic.indexOf(t) >= 0)) { return false; }
            if (q.empty) { return true; }
            return q.test([c.label, c.note, c.sessionId, c.agent,
            (c.topics || []).join(' '), (c.pages || []).join(' ')].filter(Boolean).join(' '));
        });
    }

    /** Rows a compile may be started for: waiting, and nothing out for them. */
    const compilable = list => list.filter(c => c.state === 'pending' && !c.compiling);

    // ------------------------------------------------------------- the vault
    /**
     * ‼️ THE ONE STRIP THAT DECIDES WHETHER ANY BUTTON ON THIS PAGE WORKS.
     * A compile is refused outright when the root or the wiki's own law is
     * missing (core/wiki.ts) — so the reader is told that HERE, in words, next
     * to the buttons, rather than by a refusal after they press one.
     */
    function vaultStrip() {
        const v = vault();
        const file = (which, label, found, p) => {
            const inner = `<a class="wk-file${found ? '' : ' bad'}" data-open="${which}">${found ? '' : '⚠ '}${esc(label)}</a>`;
            return T.wrap(inner, label, T.lines([
                p || '',
                found ? '' : 'This file is not there.',
                which === 'rules' && !found
                    ? 'The wiki\'s own law outranks the agent procedure, so a compile is refused until it exists.'
                    : ''
            ]), 'wk-tipw');
        };
        const ok = v.exists && v.rulesFound;
        return `<div class="wk-vault ${ok ? '' : 'bad'}">
            <span class="wk-vlabel">${ok ? '📚' : '⚠'} wiki</span>
            ${T.wrap(`<code class="${v.exists ? '' : 'bad'}">${esc(v.root || '—')}</code>`, 'Wiki root',
            T.lines([v.root || '', v.exists ? `${v.pages || 0} page(s) in ${(v.categories || []).length} categor${(v.categories || []).length === 1 ? 'y' : 'ies'}` : 'This folder does not exist.',
            (v.categories || []).length ? 'Categories: ' + (v.categories || []).join(' · ') : '',
            (v.misplaced || []).length ? `${v.misplaced.length} page(s) nested deeper than one category` : '']), 'wk-tipw')}
            <span class="wk-vsep">·</span>
            ${file('rules', '-WIKI-ANAYASA-.md', !!v.rulesFound, v.rules)}
            ${file('index', 'index.md', !!v.indexFound, v.index)}
            ${file('log', 'log.md', !!v.logFound, v.log)}
            <span class="wk-vsep">·</span>
            <span class="muted small">${esc(v.procedure || '_REF/wiki.md')}</span>
        </div>`;
    }

    // ------------------------------------------------------------ the filters
    function topicOptions() {
        return (pool().topics || []).map(t => ({
            v: t.topic,
            t: t.pending ? `${t.topic} (${t.pending})` : t.topic
        }));
    }

    function filterBar() {
        const states = [
            { id: 'pending', label: '⏳ Waiting' },
            { id: 'compiled', label: '✅ Compiled' },
            { id: 'dropped', label: '🚫 Dropped' }
        ];
        const all = !fState || fState.length === 3;
        const seg = `<span class="seg wk-seg">
            <button data-state="all" class="${all ? 'sel' : ''}" title="Every mark in the pool, whatever became of it">All</button>
            ${states.map(s => `<button data-state="${s.id}" class="${!all && fState.indexOf(s.id) >= 0 ? 'sel' : ''}"
                title="${s.id === 'pending' ? 'Marked and not yet compiled — including the ones a run is out for' : s.id === 'compiled' ? 'A run reported the pages it wrote' : 'Taken out of the queue without being compiled'}">${s.label}</button>`).join('')}
        </span>`;
        return `<div class="wk-bar">
            ${window.AFFilter.multi({
            id: 'wk-topic', label: 'topic', allLabel: 'every topic',
            options: topicOptions(), selected: fTopic, width: 150,
            title: 'What the marks are ABOUT — the key the compile files a concept under. The number is how many are still waiting.'
        })}
            ${seg}
            <input type="text" id="wk-q" class="wk-q" placeholder="search topics, prompts, notes, pages…" value="${esc(query)}"
                title="${esc(window.AFQuery.tip('Searched against a mark\'s topics, its opening prompt, its note, its session and the pages a compile wrote for it.'))}">
            <button class="secondary" id="wk-reset" title="Clear the topic filter, the state toggles and the search">↺ Reset</button>
        </div>`;
    }

    // --------------------------------------------------------------- the rows
    /** The zero-click preview: everything the pool knows about this mark, on
     *  the cell that names it. A reader deciding whether to compile a row reads
     *  this instead of opening the transcript. */
    function markTip(c) {
        return T.lines([
            c.label || '(no opening line recorded)',
            '',
            `Session ${c.sessionId}`,
            c.agent ? `Agent: ${c.agent}` : '',
            `Engine: ${c.engine || 'claude'}`,
            `Turns: ${c.turns}`,
            c.note ? '' : null,
            c.note ? 'Note: ' + c.note : null,
            '',
            `Marked by ${c.addedBy || 'agent'} · ${window.AFTime.full(c.addedAt)}`,
            c.compiledAt ? `Compiled ${window.AFTime.full(c.compiledAt)}` : '',
            c.compiling ? 'A compile is running for this mark — it is not offered again until that run ends.' : ''
        ].filter(x => x !== null));
    }

    function topicsCell(c) {
        if (editing === c.id) {
            return `<td class="wk-topics"><input type="text" class="wk-tedit" data-edit="${esc(c.id)}"
                value="${esc((c.topics || []).join(', '))}"
                title="Comma-separated. Enter saves, Escape leaves it as it was."></td>`;
        }
        // SHORTHAND: the row stays one line tall. Three chips is what fits, and
        // the rest are a count whose meaning is one hover away — the AFTip on
        // this cell already lists every topic.
        const all = c.topics || [];
        const chips = all.slice(0, 3).map(t =>
            `<span class="wk-chip" data-only="${esc(t)}" role="button" tabindex="0"
                title="Show only this topic">${esc(t)}</span>`).join('')
            + (all.length > 3 ? `<span class="wk-more">+${all.length - 3}</span>` : '');
        return T.cell('wk-topics', `data-topics="${esc(c.id)}" role="button" tabindex="0"`,
            chips || '<span class="muted">—</span>',
            'Topics', T.lines([
                (c.topics || []).join(' · ') || 'no topic',
                '',
                'This is the filing key: the compile opens or amends a page per concept under it.',
                'Click to edit — comma-separated.'
            ]));
    }

    /** Where the compile actually put it. A compiled row that cannot show its
     *  pages is a claim nobody can check (provenance, read backwards). */
    function pagesCell(c) {
        if (c.compiling) {
            return T.cell('wk-pages', '', '<span class="wk-run">⚙ running</span>', 'Compile running',
                T.lines(['A run is out for this mark.',
                    c.compileStartedAt ? 'Started ' + window.AFTime.full(c.compileStartedAt) : '',
                    'Nothing is compiled until it reports the pages it wrote.']));
        }
        const pages = c.pages || [];
        if (!pages.length) { return '<td class="wk-pages muted">—</td>'; }
        const crumbs = pages.map(p => {
            const parts = String(p).split(/[\\/]/);
            const file = parts.pop().replace(/\.md$/i, '');
            const cat = parts.pop() || '';
            return `<a class="wk-page" data-page="${esc(p)}" data-id="${esc(c.id)}"
                >${cat ? esc(cat) + ' <span class="muted">/</span> ' : ''}${esc(file)}</a>`;
        }).join('<span class="wk-vsep">·</span>');
        return T.cell('wk-pages', '', crumbs, `${pages.length} page(s) written`,
            T.lines(pages.concat(['', 'Click one to open it.'])));
    }

    function rowHtml(c) {
        const st = STATE[stateOf(c)] || STATE.pending;
        const on = selected.has(c.id);
        const box = c.state === 'pending' && !c.compiling
            ? `<input type="checkbox" data-cb="${esc(c.id)}"${on ? ' checked' : ''} aria-label="Select this mark for compiling">`
            : `<span class="wk-nobox" title="${c.compiling ? 'A compile is already running for this mark' : 'Only a waiting mark can be compiled'}">·</span>`;
        return `<tr class="${on ? 'sel' : ''} ${st.cls}">
            <td class="wk-pick">${box}</td>
            ${T.cell('wk-state', '', `<span class="wk-st">${st.icon} ${st.label}</span>`, 'State',
            T.lines([
                st.label === 'waiting' ? 'Marked, and nothing has been compiled from it yet.'
                    : st.label === 'compiling' ? 'Still waiting — but a run is out for it, so it is not offered again.'
                        : st.label === 'failed' ? 'Still waiting, and the last run over it produced no page:'
                            : st.label === 'compiled' ? 'A run reported the pages it wrote for this mark.'
                                : 'Taken out of the queue without being compiled.',
                // X-58 — the reason, in the panel, in the words the host wrote.
                // A ⚠ with no sentence behind it is a badge, not an answer.
                ...(st.label === 'failed'
                    ? ['', c.lastError || '', c.lastErrorAt ? '(' + window.AFTime.ago(c.lastErrorAt) + ')' : '',
                        '', 'Press ↻ to clear it and put the mark back in the queue, or simply compile it again.']
                    : ['', 'Only a run reporting back closes a mark.'])
            ]))}
            ${T.cell('wk-sess', `data-session="${esc(c.sessionId)}" role="button" tabindex="0"`,
            `<code>${esc(c.session)}</code> <span class="wk-turns">${esc(c.turns)}</span>`,
            'Where it came from', T.lines([`Session ${c.sessionId}`, c.agent ? 'Agent: ' + c.agent : '',
                'Engine: ' + (c.engine || 'claude'), 'Turns: ' + c.turns, '', 'Click to open the transcript.']))}
            ${topicsCell(c)}
            ${T.cell('wk-label', '', esc(c.label || '—') + (c.note ? ` <span class="wk-note">— ${esc(c.note)}</span>` : ''),
            'What was said', markTip(c))}
            ${T.cell('wk-when', '', esc(window.AFTime.ago(c.addedAt)),
            'Marked', T.lines([window.AFTime.full(c.addedAt), 'by ' + (c.addedBy || 'agent'),
                c.compiledAt ? '' : null, c.compiledAt ? 'Compiled ' + window.AFTime.full(c.compiledAt) : null].filter(x => x !== null)))}
            ${pagesCell(c)}
            <td class="wk-act">
                <button class="mini" data-act="topics" data-id="${esc(c.id)}" title="Edit this mark's topics">✎</button>
                ${c.state === 'pending' && c.lastError
                ? `<button class="mini wk-retry" data-act="retry" data-id="${esc(c.id)}"
                        title="Clear what the last run said and put this mark back in the queue as a clean waiting row. It writes nothing — the mark was never compiled.">↻</button>`
                : ''}
                ${c.state === 'pending'
                ? `<button class="mini" data-act="drop" data-id="${esc(c.id)}" title="Take it out of the queue without compiling — reversible, and it writes nothing to the vault">🚫</button>`
                : `<button class="mini" data-act="reopen" data-id="${esc(c.id)}" title="Put it back in the queue as waiting${c.state === 'compiled' ? ' — the pages it already wrote stay written' : ''}">↺</button>`}
                <button class="mini" data-act="remove" data-id="${esc(c.id)}" title="Delete this mark. It undoes nothing in the vault — a page already written stays written.">✕</button>
            </td>
        </tr>`;
    }

    function tableHtml(list) {
        if (!list.length) {
            return `<p class="muted" style="margin-top:20px">${rows().length
                ? 'No mark matches these filters.'
                : 'The pool is empty. Mark a turn with the 🔖 badge on any surface that draws one, or right-click a session → <i>Add to Wiki Candidates…</i>'}</p>`;
        }
        return `<div class="tablewrap"><table class="wktable">
            <thead><tr>
                <th class="wk-pick"><input type="checkbox" id="wk-all" aria-label="Select every compilable mark shown"></th>
                <th title="Waiting · compiling (a run is out) · compiled · dropped. Only a run reporting back closes a mark.">State</th>
                <th title="The conversation and the turn range this mark covers">Source</th>
                <th title="What it is ABOUT — the key the compile files the concept under">Topics</th>
                <th title="The opening line of the marked turn, and whatever note was left with it">What was said</th>
                <th title="When it was marked, and by whom">Marked</th>
                <th title="The wiki pages a compile reported writing for this mark">Pages</th>
                <th></th>
            </tr></thead>
            <tbody>${list.map(rowHtml).join('')}</tbody>
        </table></div>`;
    }

    // --------------------------------------------------------------- the lint
    function lintHtml() {
        if (!LINT) { return ''; }
        const sec = (title, items, hint) => !items || !items.length ? '' :
            `<div class="wk-lsec"><b>${esc(title)}</b> <span class="muted small">${esc(hint)}</span>
                <ul>${items.map(x => `<li>${esc(typeof x === 'string' ? x : (x.from ? x.from + ' → ' + x.to : JSON.stringify(x)))}</li>`).join('')}</ul></div>`;
        const empty = !['orphans', 'broken', 'unindexed', 'misplaced'].some(k => (LINT[k] || []).length);
        return `<div class="wk-lint">
            <div class="wk-lhead"><b>🩺 Shape check</b>
                <span class="muted small">${esc(LINT.root || '')} — reported, never repaired</span>
                <button class="mini" id="wk-lclose" title="Close the report">✕</button></div>
            ${empty ? '<p class="muted small">Nothing to report: every page is reachable, every link resolves, and the index names them all.</p>' : ''}
            ${sec('Orphans', LINT.orphans, 'nothing links to them and the index does not name them')}
            ${sec('Broken links', LINT.broken, '[[…]] pointing at a page that is not there')}
            ${sec('Not in the index', LINT.unindexed, 'a page index.md does not name')}
            ${sec('Misplaced', LINT.misplaced, 'nested deeper than one category folder')}
            <p class="footnote">Whether two pages CONTRADICT each other is not a question a program can answer, and is not guessed at.</p>
        </div>`;
    }

    // ------------------------------------------------------------- the render
    function render() {
        const live = rows().map(c => c.id);
        [...selected].forEach(id => { if (live.indexOf(id) < 0) { selected.delete(id); } });
        const list = shown();
        const p = pool();
        const v = vault();
        const pickable = compilable(list);
        const pickedIds = [...selected].filter(id => pickable.some(c => c.id === id));
        const waiting = compilable(rows()).length;
        const blocked = !v.exists || !v.rulesFound;
        const why = blocked
            ? (!v.exists ? 'The wiki root is not there — a compile cannot start.' : 'The wiki\'s own law (-WIKI-ANAYASA-.md) is missing — a compile is refused without it.')
            : '';

        const actions = `
            <button id="wk-csel" ${pickedIds.length && !blocked ? '' : 'disabled'}
                title="${blocked ? esc(why) : `Start ONE run over the ${pickedIds.length} selected mark(s). It writes nothing yet — the run reports back with the pages it wrote, and that is what closes a mark.`}"
                >📚 Compile Selected${pickedIds.length ? ` (${pickedIds.length})` : ''}</button>
            <button class="secondary" id="wk-call" ${waiting && !blocked ? '' : 'disabled'}
                title="${blocked ? esc(why) : `Start one run over every waiting mark (${waiting}). Marks a run is already out for are left alone.`}"
                >⚡ Compile All Pending${waiting ? ` (${waiting})` : ''}</button>
            <button class="secondary" id="wk-lint" title="Check the SHAPE of the wiki — orphans, broken links, pages missing from the index. It reports and never repairs.">🩺 Lint</button>`;

        const sub = [
            `${p.total || 0} mark(s)`,
            `${p.pending || 0} waiting`,
            p.compiling ? `${p.compiling} compiling` : '',
            `${p.compiled || 0} compiled`,
            p.dropped ? `${p.dropped} dropped` : '',
            `${v.pages || 0} wiki page(s)`,
            DATA.agent ? `writer: ${DATA.agent}` : 'writer: the farm\'s first agent',
            window.AFTime.clockUtc(DATA.generatedAt)
        ].filter(Boolean).join(' · ');

        document.getElementById('app').innerHTML = `
            <style>
                .wk-vault { display:flex; align-items:center; gap:7px; flex-wrap:wrap; font-size:11px;
                    padding:5px 9px; margin:0 0 8px; border-radius:5px;
                    border:1px solid var(--vscode-widget-border,#4443); }
                .wk-vault.bad { border-color:var(--vscode-editorWarning-foreground,#cca700); }
                .wk-vlabel { opacity:.7; }
                .wk-vault code { font-size:11px; opacity:.85; }
                .wk-vault code.bad, .wk-file.bad { color:var(--vscode-editorWarning-foreground,#cca700); }
                .wk-file { cursor:pointer; text-decoration:none; color:var(--vscode-textLink-foreground); }
                .wk-file:hover { text-decoration:underline; }
                .wk-vsep { opacity:.4; margin:0 2px; }
                .wk-bar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin:0 0 8px; }
                .wk-seg button { font-size:11px; padding:3px 9px; }
                .wk-q { flex:1 1 200px; min-width:160px; }
                /* DENSE: the row is the unit of reading, so it is one line tall
                   and everything that could grow is an AFTip instead. */
                .wktable td, .wktable th { padding:3px 9px 3px 0; font-size:11.5px; }
                .wktable td { vertical-align:middle; }
                .wktable tr.sel td { background:var(--vscode-list-inactiveSelectionBackground); }
                .wktable tbody tr:hover td { background:var(--vscode-list-hoverBackground); }
                .wk-pick { width:20px; }
                .wk-nobox { opacity:.3; }
                .wk-state { white-space:nowrap; width:1%; }
                .wk-st { opacity:.9; }
                tr.wk-compiled .wk-st { color:var(--vscode-charts-green,#4caf50); }
                tr.wk-compiling .wk-st { color:var(--vscode-charts-blue,#3794ff); }
                /* X-58: waiting, and the last run over it produced nothing.
                   Red on the state cell only — the row is still ordinary work,
                   and tinting the whole line would read as an error to fix
                   rather than a mark to compile again. */
                tr.wk-failed .wk-st { color:var(--vscode-charts-red,#f14c4c); }
                .wk-retry { color:var(--vscode-charts-red,#f14c4c); }
                tr.wk-dropped { opacity:.55; }
                .wk-sess { white-space:nowrap; width:1%; cursor:pointer; }
                .wk-sess code { font-size:11px; }
                .wk-turns { opacity:.7; }
                .wk-topics { max-width:230px; cursor:pointer; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
                .wk-tedit { width:100%; font-size:11.5px; }
                .wk-chip { display:inline-block; padding:0 6px; margin:0 3px 0 0; border-radius:9px;
                    font-size:10.5px; background:var(--vscode-badge-background); color:var(--vscode-badge-foreground); }
                .wk-chip:hover { outline:1px solid var(--vscode-focusBorder); }
                .wk-more { opacity:.6; font-size:10.5px; }
                .wk-label { max-width:44ch; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
                .wk-note { opacity:.6; font-style:italic; }
                .wk-when { white-space:nowrap; opacity:.75; width:1%; }
                .wk-pages { max-width:26ch; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
                .wk-page { cursor:pointer; color:var(--vscode-textLink-foreground); text-decoration:none; }
                .wk-page:hover { text-decoration:underline; }
                .wk-run { color:var(--vscode-charts-blue,#3794ff); }
                .wk-act { white-space:nowrap; width:1%; text-align:right; }
                .wk-act .mini { background:none; border:1px solid transparent; color:inherit; cursor:pointer;
                    font-size:11px; padding:1px 5px; border-radius:4px; opacity:.55; }
                .wktable tbody tr:hover .mini { opacity:1; }
                .wk-act .mini:hover { background:var(--vscode-toolbar-hoverBackground,#8882);
                    border-color:var(--vscode-widget-border,#4443); }
                .wk-lint { margin-top:14px; padding:9px 12px; border-radius:6px;
                    border:1px solid var(--vscode-widget-border,#4443); }
                .wk-lhead { display:flex; align-items:center; gap:9px; }
                .wk-lhead .mini { margin-left:auto; background:none; border:none; color:inherit; cursor:pointer; }
                .wk-lsec { margin-top:7px; font-size:11.5px; }
                .wk-lsec ul { margin:3px 0 0; padding-left:20px; }
                .wk-tipw { display:inline-flex; }
            </style>
            ${window.AFHeader.html({
            page: 'wiki',
            title: 'Wiki',
            sub,
            actions,
            // Turns only: Toolbox is already in the global cluster, and a
            // destination drawn twice on one toolbar is a button nobody trusts.
            related: [{
                nav: 'turns', label: 'Turns',
                title: 'Every user turn across the farm, sessions unrolled — the surface most marks are made on.'
            }],
            guide: 'wiki-kokpiti'
        })}
            ${vaultStrip()}
            ${filterBar()}
            ${tableHtml(list)}
            ${lintHtml()}
            <p class="footnote">Marking a turn writes nothing to the vault; only a compile does — and a compile is an agent's
            run under the wiki's own law (<code>-WIKI-ANAYASA-.md</code>), not something this page performs. Starting a run
            marks nothing compiled: the run reports back with the pages it wrote, and that is the only thing that closes a mark.</p>
        `;
        wire();
    }

    // --------------------------------------------------------------- the wire
    function bind(id, ev, fn) { const el = document.getElementById(id); if (el) { el.addEventListener(ev, fn); } }
    function each(sel, ev, fn) { document.querySelectorAll(sel).forEach(el => el.addEventListener(ev, fn)); }

    function setTopics(id, value) {
        const topics = String(value || '').split(',').map(s => s.trim()).filter(Boolean);
        editing = null;
        // An empty list would leave the mark with nothing to file it under, and
        // the host refuses it by name — so it is not sent at all.
        if (!topics.length) { render(); return; }
        post({ type: 'edit', id, topics });
    }

    function wire() {
        window.AFHeader.wire(vscode);

        window.AFFilter.wireMulti({
            id: 'wk-topic',
            onChange: sel => { fTopic = sel; saveState(); render(); }
        });
        each('[data-state]', 'click', e => {
            const s = e.currentTarget.dataset.state;
            fState = s === 'all' ? ['pending', 'compiled', 'dropped'] : [s];
            saveState(); render();
        });
        window.AFFilter.live(document.getElementById('wk-q'), el => {
            query = el.value; refocus = 'search'; saveState(); render();
        });
        bind('wk-reset', 'click', () => {
            fTopic = DEF.fTopic; fState = DEF.fState; query = DEF.query;
            selected.clear(); saveState(); render();
        });

        // Selection. "All" means every row that could actually be compiled in
        // the current view — a tick that selects rows the button then refuses
        // is a count that lies.
        bind('wk-all', 'change', e => {
            const pick = compilable(shown());
            if (e.target.checked) { pick.forEach(c => selected.add(c.id)); }
            else { pick.forEach(c => selected.delete(c.id)); }
            render();
        });
        each('[data-cb]', 'change', e => {
            const id = e.currentTarget.dataset.cb;
            if (e.currentTarget.checked) { selected.add(id); } else { selected.delete(id); }
            render();
        });

        bind('wk-csel', 'click', () => {
            const ids = [...selected].filter(id => compilable(rows()).some(c => c.id === id));
            if (ids.length) { post({ type: 'compile', ids }); selected.clear(); }
        });
        bind('wk-call', 'click', () => { post({ type: 'compile', ids: [] }); selected.clear(); });
        bind('wk-lint', 'click', () => post({ type: 'lint' }));
        bind('wk-lclose', 'click', () => { LINT = null; render(); });

        each('[data-open]', 'click', e => post({ type: 'openWikiFile', which: e.currentTarget.dataset.open }));
        each('[data-session]', 'click', e => {
            if (e.target.closest('[data-topics],[data-act]')) { return; }
            post({ type: 'openSession', id: e.currentTarget.dataset.session });
        });
        each('[data-page]', 'click', e => {
            e.stopPropagation();
            post({ type: 'openPage', id: e.currentTarget.dataset.id, page: e.currentTarget.dataset.page });
        });
        each('[data-only]', 'click', e => {
            e.stopPropagation();
            fTopic = [e.currentTarget.dataset.only]; saveState(); render();
        });

        each('[data-topics]', 'click', e => {
            if (e.target.closest('[data-only]')) { return; }
            editing = e.currentTarget.dataset.topics; refocus = 'topics'; render();
        });
        each('[data-act]', 'click', e => {
            const id = e.currentTarget.dataset.id;
            switch (e.currentTarget.dataset.act) {
                case 'topics': editing = id; refocus = 'topics'; render(); break;
                // X-58 — the mark was never compiled, so this clears a record
                // rather than undoing work: the reason goes, the claim goes,
                // and the row is a clean waiting row again.
                case 'retry': post({ type: 'edit', id, retry: true }); break;
                case 'drop': post({ type: 'edit', id, state: 'dropped' }); break;
                case 'reopen': post({ type: 'edit', id, state: 'pending' }); break;
                case 'remove': post({ type: 'remove', ids: [id] }); break;
            }
        });
        const box = document.querySelector('.wk-tedit');
        if (box) {
            box.addEventListener('keydown', ev => {
                if (ev.key === 'Enter') { setTopics(box.dataset.edit, box.value); }
                if (ev.key === 'Escape') { editing = null; render(); }
            });
            box.addEventListener('blur', () => setTopics(box.dataset.edit, box.value));
        }

        // The caret goes back where the reader left it: a page that re-renders
        // on every keystroke and loses focus is a search box you cannot type in.
        if (refocus === 'search') {
            const q = document.getElementById('wk-q');
            if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
        } else if (refocus === 'topics' && box) {
            box.focus(); box.setSelectionRange(box.value.length, box.value.length);
        }
        refocus = null;
    }

    render();
})();
