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
    let editing = null;              // id of the row whose editor is open
    let refocus = null;              // 'search' | 'topics' — what to put the caret back in
    /**
     * ‼️ U-92 — WHAT THE ROW EDITOR IS EDITING, HELD HERE.
     *
     * It used to be a comma-separated text box in one cell, which asked the
     * reader to spell a taxonomy from memory — the exact thing U-90 built a
     * picker to stop, still standing on the one surface whose whole job is
     * fixing a mark. So the editor is the same `AFCombo`, and while it is open
     * it also carries the two other things a mark is wrong about: the note, and
     * which turns of the scope to leave out (X-58).
     *
     * AFCombo is a contract, not a widget (media/afCombo.js): the OWNER holds
     * `picked`/`query`/`open`/`active` and repaints, so they live here.
     */
    let edit = null;
    /**
     * ‼️ U-95 — WHAT A COMPILE IS ABOUT TO SPEND, BEFORE IT SPENDS IT.
     *
     * A compile is a headless run of a real model over real transcripts: it
     * costs quota and it writes into the vault. Which model, at what effort and
     * under whose name are three settings the reader cannot see from this page,
     * and pressing 📚 used to start the run with all three unstated. So every
     * compile button now opens the same strip — what it will read, what it will
     * run with, and one press to start it or to go and change it.
     *
     * `{ ids, what }` — ids [] means "every waiting mark", which the op resolves
     * itself at the moment it runs (a page that sent a snapshot would compile a
     * list that had already moved).
     */
    let ask = null;
    let escWired = false;

    const DEF ={ fTopic: null, fState: ['pending', 'compiled'], query: '', fRaw: false };
    const saved = (vscode.getState && vscode.getState()) || {};
    let fTopic = saved.fTopic === undefined ? DEF.fTopic : saved.fTopic;
    let fState = saved.fState === undefined ? DEF.fState : saved.fState;
    let query = saved.query === undefined ? DEF.query : saved.query;
    /** U-117 — show only the files somebody dropped into `_RAW_`. A source
     *  filter, not a state one: it crosses every state the segment offers. */
    let fRaw = saved.fRaw === undefined ? DEF.fRaw : saved.fRaw;
    function saveState() { if (vscode.setState) { vscode.setState({ fTopic, fState, query, fRaw }); } }

    window.addEventListener('message', ev => {
        if (ev.data.type === 'data') { DATA = ev.data.data; render(); }
        if (ev.data.type === 'lint') { LINT = ev.data.data; render(); }
        // ‼️ U-91/U-92 — the host made the folder and says what it REALLY made.
        // Typing `ajanlar` beside an existing `Ajanlar` files the mark under
        // `Ajanlar` and the editor takes that spelling, not the typed one.
        if (ev.data.type === 'category' && edit && edit.id === ev.data.id) {
            const name = ev.data.name;
            if (name && !edit.picked.some(p => window.AFCombo.fold(p) === window.AFCombo.fold(name))) {
                edit.picked.push(name);
            }
            edit.query = ''; edit.open = false; edit.active = 0;
            edit.made = ev.data.existed
                ? `“${name}” already existed — this mark is filed under that one.`
                : `“${name}” started in the wiki.`;
            refocus = 'topics';
            render();
        }
    });

    const esc = s => C.esc(String(s == null ? '' : s));
    const post = m => vscode.postMessage(m);

    /**
     * ‼️ U-122 — THE MENU AND THE PRESS ARE ONE PATH. Every act below sends the
     * message the strip's own click (or its own button) already sends, so the
     * two cannot drift into two behaviours: `wvOpen` is `data-open`, `wvReveal`
     * is `data-reveal`, `wvSettings` is the `⚙ Choose the folder` button.
     * Copying is the one that never reaches the host — the clipboard is the
     * shell's, and `AFCtx.copy` is the door to it.
     *
     * Wired ONCE, at module scope: render() rebuilds the page on every tick and
     * a listener added per render would answer one click N times.
     */
    window.AFCtx.listen((act, ctx) => {
        const which = String((ctx && ctx.afWhich) || '');
        switch (act) {
            case 'wvOpen': if (which) { post({ type: 'openWikiFile', which }); } return;
            case 'wvReveal': if (which) { post({ type: 'revealWikiPath', which }); } return;
            case 'wvSettings': post({ type: 'openSettings', focus: 'agentFarm.wikiRoot' }); return;
            case 'wvCopy': window.AFCtx.copy(ctx && ctx.afPath); return;
        }
    });

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
        dropped: { icon: '🚫', label: 'dropped', cls: 'wk-dropped' },
        // ‼️ U-117 — THE STAGE A DROPPED FILE ARRIVES IN. It is `pending` in the
        // store like everything else, and it is the one mark in the pool with no
        // topic: nothing can be compiled from it until somebody says what it is
        // about. Drawn apart because a row that read `⏳ waiting` alongside marks
        // that really are waiting for a run hides the only thing to go and do —
        // and the label IS the instruction, not a description of one.
        untriaged: { icon: '🌱', label: 'needs a topic', cls: 'wk-untriaged' }
    };
    const stateOf = c => (c.compiling ? 'compiling'
        : c.state === 'pending' && c.lastError ? 'failed'
            : c.state === 'pending' && !(c.topics || []).length ? 'untriaged'
                : c.state);

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
            if (fRaw && !c.raw) { return false; }
            if (fTopic && !(c.topics || []).some(t => fTopic.indexOf(t) >= 0)) { return false; }
            if (q.empty) { return true; }
            // U-117 — the dropped file's own NAME is part of the haystack. It is
            // the only thing the reader knows about a file they saved out of a
            // browser an hour ago, and `raw:notes.md` is not what they type.
            return q.test([c.label, c.note, c.sessionId, c.rawFile, c.agent,
            (c.topics || []).join(' '), (c.pages || []).join(' ')].filter(Boolean).join(' '));
        });
    }

    /** Rows a compile may be started for: waiting, nothing out for them, and
     *  filed under something — a mark with no topic has no page to be written
     *  to, and the host refuses it by name (U-117). */
    const compilable = list => list.filter(c => c.state === 'pending' && !c.compiling && (c.topics || []).length);

    /**
     * ‼️ U-121 — TICKING A ROW AND COMPILING IT ARE TWO DIFFERENT QUESTIONS.
     *
     * The tick box used to be the compile's box, so it only existed on a waiting
     * mark — which left the `dropped` and `compiled` tabs with no way to act on
     * more than one row at a time, and no way to bring five dropped marks back
     * at all. It is a SELECTION box: every row can be ticked except one a run is
     * out for, because that is the one row where anything you do fights the run.
     *
     * What the selection is then GOOD for is decided per button, and each says
     * its own number — so a selection of six that can compile two says two on
     * the compile button and six on Remove, rather than quietly taking four
     * rows nobody offered.
     */
    const selectable = list => list.filter(c => !c.compiling);

    // ------------------------------------------------------------- the vault
    /**
     * ‼️ THE ONE STRIP THAT DECIDES WHETHER ANY BUTTON ON THIS PAGE WORKS.
     * A compile is refused outright when the root or the wiki's own law is
     * missing (core/wiki.ts) — so the reader is told that HERE, in words, next
     * to the buttons, rather than by a refusal after they press one.
     */
    /** Bytes as the shortest true figure. A file is quoted in the unit a reader
     *  would say it in, never in six digits. */
    function bytes(n) {
        const b = Number(n) || 0;
        if (b < 1024) { return `${b} B`; }
        if (b < 1024 * 1024) { return `${(b / 1024).toFixed(b < 10240 ? 1 : 0)} KB`; }
        return `${(b / 1048576).toFixed(1)} MB`;
    }

    /**
     * ‼️ U-122 — THE FOUR FIGURES A FILE ON THIS STRIP CARRIES. Whether it is
     * there, how long it is, how big it is and when it last changed — which is
     * the difference between a strip that names files and one that answers
     * "is the index up to date?" without a trip to Obsidian.
     */
    function factWords(f) {
        if (!f || !f.found) { return 'This file is not there.'; }
        return T.lines([
            f.lines === null || f.lines === undefined ? '' : `${f.lines} line(s)`,
            bytes(f.bytes),
            f.mtime ? `Last changed: ${window.AFTime.full(f.mtime)} (${window.AFTime.ago(f.mtime)})` : ''
        ]);
    }

    /**
     * ‼️ U-122 — EVERY OBJECT ON THIS STRIP IS A PATH, AND SAYS SO.
     *
     * The strip named six things and let you press three of them. A path you
     * can see and cannot copy, a folder you can read the name of and cannot
     * open, and a procedure file rendered as a dead `<span>` are all the same
     * omission: the object is DRAWN but is not an object. One context shape
     * covers the lot — `afWhich` is what the host resolves, `afPath` is what
     * the clipboard gets, and the two flags decide which items are drawn.
     */
    function vaultCtx(which, p, o) {
        return window.AFCtx.row('afWikiVault', {
            afWhich: which,
            afPath: p || '',
            afOpenable: !!(o && o.openable),
            afRoot: which === 'root',
            afMissing: !(o && o.found)
        });
    }

    function vaultStrip() {
        const v = vault();
        const facts = v.facts || {};
        const file = (which, label, found, p) => {
            const inner = `<a class="wk-file${found ? '' : ' bad'}" data-open="${which}"
                ${vaultCtx(which, p, { openable: found, found })}>${found ? '' : '⚠ '}${esc(label)}</a>`;
            return T.wrap(inner, label, T.lines([
                p || '',
                factWords(facts[which]),
                which === 'rules' && !found
                    ? 'The wiki\'s own law outranks the agent procedure, so a compile is refused until it exists.'
                    : '',
                '',
                window.AFCtx.HINT
            ]), 'wk-tipw');
        };
        const ok = v.exists && v.rulesFound;
        /**
         * ‼️ U-92 — A STRIP THAT SAYS "THIS IS BROKEN" AND OFFERS NOTHING IS A
         * DEAD END. It named the missing file correctly and left the reader to
         * work out that the fix is in Settings, or in Obsidian, or somewhere.
         * The two ways out stand next to the sentence: choose the folder, or
         * write the three files into the one already chosen (X-57's `wiki.init`,
         * which only ever creates).
         */
        const ways = ok ? '' : `<span class="wk-vsep">·</span>
            <button class="mini wk-fix" id="wk-vinit"
                title="Create the folder if it is not there and write whatever of -WIKI-ANAYASA-.md, index.md and log.md is missing. It only CREATES: a file already on disk is left exactly as it is, because the law is yours.">🛠 Start the wiki here</button>
            <button class="mini wk-fix secondary" id="wk-vsettings"
                title="Open Settings ▸ Wiki & Knowledge Base — choose the folder, and see which files it holds">⚙ Choose the folder</button>`;
        const cats = (v.categories || []).length;
        /**
         * ‼️ A DOOR THAT OPENS NOTHING IS NOT A DOOR. A folder that is not
         * there has no path to reveal, so it is drawn as text: pressing it
         * would post a message the host answers with silence, which is exactly
         * the failure the whole strip exists to prevent (Principle 1).
         */
        const press = (which, found) => (found ? ` data-reveal="${which}"` : '');
        const dead = found => (found ? '' : ' wk-dead');
        const rootLive = !!(v.exists && v.root);
        const root = T.wrap(
            `<a class="wk-file wk-vroot${v.exists ? '' : ' bad'}${dead(rootLive)}"${press('root', rootLive)}
                ${vaultCtx('root', v.root, { openable: false, found: !!v.exists })}>${esc(v.root || '—')}</a>`,
            'Wiki root',
            T.lines([v.root || '',
                v.exists ? `${v.pages || 0} page(s) in ${cats} categor${cats === 1 ? 'y' : 'ies'}` : 'This folder does not exist.',
                cats ? 'Categories: ' + (v.categories || []).join(' · ') : '',
                (v.misplaced || []).length ? `${v.misplaced.length} page(s) nested deeper than one category` : '',
                '', rootLive ? 'Press it to show the folder — ' + window.AFCtx.HINT : window.AFCtx.HINT]), 'wk-tipw');
        /**
         * ‼️ X-138/U-122 — THE DROP BOX, ON THE STRIP RATHER THAN IN A NOTE.
         *
         * The whole promised gesture is "drop a browser export in `_RAW_` and do
         * nothing else". A folder you have to go and find in Explorer is a
         * gesture with a hunt in front of it, so the strip carries the door AND
         * the count: three files waiting is the thing you came to check.
         */
        const waiting = Number(v.rawFiles) || 0;
        const rawLive = !!(v.rawReady && v.raw);
        const raw = T.wrap(
            `<a class="wk-file wk-raw${v.rawReady ? '' : ' bad'}${dead(rawLive)}"${press('raw', rawLive)}
                ${vaultCtx('raw', v.raw, { openable: false, found: !!v.rawReady })}>📥 _RAW_${waiting ? ` (${waiting})` : ''}</a>`,
            'The drop box',
            T.lines([v.raw || '',
                v.rawReady ? '' : 'The folder is not there yet — it is made the next time the pool is read.',
                `${waiting} transcript(s) waiting${Number(v.doneFiles) ? ` · ${v.doneFiles} already archived in _DONE_` : ''}`,
                'Drop a browser export here (.md or .txt) and it becomes a candidate on the next read — nothing else to do.',
                '', rawLive ? 'Press it to open the folder — ' + window.AFCtx.HINT : window.AFCtx.HINT]), 'wk-tipw');
        /**
         * ‼️ U-122 — THE AGENT PROCEDURE WAS A DEAD `<span>`. It is the file a
         * compile is told to read first, named on the one page that starts
         * compiles, and it could not be opened from there. It is a link when the
         * agent roots actually hold it and stays plain text when they do not,
         * because a link that opens nothing is worse than a name.
         */
        const procFound = !!(v.facts && v.facts.procedure && v.facts.procedure.found);
        const procInner = procFound
            ? `<a class="wk-file wk-proc" data-open="procedure"
                ${vaultCtx('procedure', v.procedureFile, { openable: true, found: true })}>${esc(v.procedure || '_REF/wiki.md')}</a>`
            : `<span class="muted small">${esc(v.procedure || '_REF/wiki.md')}</span>`;
        const proc = T.wrap(procInner, 'The agent procedure', T.lines([
            v.procedureFile || v.procedure || '',
            'How a compile writes a page — the template, atomicity, provenance and what to do with a contradiction.',
            'The wiki\'s own law outranks it.',
            procFound ? factWords(v.facts.procedure)
                : 'Not on this machine — no configured agent root holds it, so there is nothing to open.',
            procFound ? '' : null,
            procFound ? window.AFCtx.HINT : null
        ].filter(x => x !== null)), 'wk-tipw');
        return `<div class="wk-vault ${ok ? '' : 'bad'}">
            <span class="wk-vlabel">${ok ? '📚' : '⚠'} wiki</span>
            ${root}
            <span class="wk-vsep">·</span>
            ${file('rules', '-WIKI-ANAYASA-.md', !!v.rulesFound, v.rules)}
            ${file('index', 'index.md', !!v.indexFound, v.index)}
            ${file('log', 'log.md', !!v.logFound, v.log)}
            <span class="wk-vsep">·</span>
            ${raw}
            <span class="wk-vsep">·</span>
            ${proc}
            ${ways}
        </div>`;
    }

    // ------------------------------------------------------------ the filters
    /**
     * ‼️ U-92 — THE FILTER OFFERS THE UNION, LIKE THE PICKER DOES (U-90).
     *
     * The list used to be the pool's topics alone, which means a category the
     * user made in Obsidian this morning was not offered until something had
     * been marked under it — the one surface still disagreeing with the tagger.
     * So it is the same union: the wiki's own folders AND the pool's topics,
     * one row per name however it is spelled, with the figure that tells them
     * apart on the row's own hover (pages on disk · marks waiting).
     *
     * The row's LABEL carries the waiting count and nothing else, because that
     * is the number you filter by; twelve rows in and the menu draws its own
     * find box, which is what the whole item was about.
     */
    function topicOptions() {
        const byKey = new Map();
        const put = (name, patch) => {
            const k = String(name).toLocaleLowerCase('tr');
            const e = byKey.get(k) || { name, pages: 0, pending: 0, total: 0 };
            byKey.set(k, Object.assign(e, patch, { name: e.name }));
        };
        (DATA.folders || []).forEach(f => put(f.name, { pages: f.pages || 0 }));
        (pool().topics || []).forEach(t => put(t.topic, { pending: t.pending || 0, total: t.total || 0 }));
        return [...byKey.values()]
            .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
            .map(e => ({
                v: e.name,
                t: e.pending ? `${e.name} (${e.pending})` : e.name,
                hint: [
                    e.name,
                    `${e.pending} waiting · ${e.total} mark(s) in the pool`,
                    e.pages ? `${e.pages} page(s) on disk` : 'no page written yet',
                    !e.total ? 'a folder in the wiki — nothing is marked under it yet' : ''
                ].filter(Boolean).join(' · ')
            }));
    }

    /**
     * ‼️ U-117 — THE SOURCE FILTER, WHICH IS NOT A STATE FILTER.
     *
     * A dropped file crosses every state the segment offers, so it cannot be a
     * fourth button in there. It is one toggle: press it and the table is the
     * `_RAW_` pool alone. It draws only when there is something to filter TO —
     * a nobody-has-dropped-anything wiki gets no button for a folder it has
     * never used, which is the same rule the filtered-compile button follows.
     */
    function rawToggle() {
        const p = pool();
        const n = p.raw || rows().filter(c => c.raw).length;
        if (!n && !fRaw) { return ''; }
        const need = p.untriaged || rows().filter(c => c.state === 'pending' && !(c.topics || []).length).length;
        return `<button id="wk-raw" class="secondary wk-rawf${fRaw ? ' sel' : ''}"
            title="${esc(`${n} mark(s) came from a file dropped into _RAW_ rather than from a CLI run`
            + (need ? ` — ${need} of them still need a topic before anything can be compiled` : '')
            + `. ${fRaw ? 'Press to show the CLI sessions again.' : 'Press to show only those.'}`)}"
            >📄 Files ${n}</button>`;
    }

    function filterBar() {
        const p = pool();
        // ‼️ U-92 — the state buttons carry their own counts. "Waiting" with no
        // number is a button you press to find out; with one it is an answer
        // you already have, and the press is only ever to narrow.
        const states = [
            { id: 'pending', label: '⏳ Waiting', n: p.pending || 0 },
            { id: 'compiled', label: '✅ Compiled', n: p.compiled || 0 },
            { id: 'dropped', label: '🚫 Dropped', n: p.dropped || 0 }
        ];
        const all = !fState || fState.length === 3;
        const total = (p.total !== undefined ? p.total : rows().length);
        const seg = `<span class="seg wk-seg">
            <button data-state="all" class="${all ? 'sel' : ''}" title="Every mark in the pool, whatever became of it">All ${total}</button>
            ${states.map(s => `<button data-state="${s.id}" class="${!all && fState.indexOf(s.id) >= 0 ? 'sel' : ''}"
                title="${s.id === 'pending'
            ? `${s.n} marked and not yet compiled${p.compiling ? ` — ${p.compiling} with a run already out` : ''}${p.failed ? `, ${p.failed} whose last run produced nothing` : ''}`
            : s.id === 'compiled' ? `${s.n} that a run reported pages for` : `${s.n} taken out of the queue without being compiled`}">${s.label} ${s.n}</button>`).join('')}
        </span>`;
        return `<div class="wk-bar">
            ${window.AFFilter.multi({
            id: 'wk-topic', label: 'topic', allLabel: 'every topic',
            options: topicOptions(), selected: fTopic, width: 190,
            title: 'What the marks are ABOUT — the key the compile files a concept under. The list is the wiki\'s own folders AND the topics the pool already uses; the number beside a name is how many marks are still waiting under it.'
        })}
            ${seg}
            ${rawToggle()}
            <input type="text" id="wk-q" class="wk-q" placeholder="search topics, prompts, notes, pages…" value="${esc(query)}"
                title="${esc(window.AFQuery.tip('Searched against a mark\'s topics, its opening prompt, its note, its session and the pages a compile wrote for it.'))}">
            <button class="secondary" id="wk-reset" title="Clear the topic filter, the state toggles and the search">↺ Reset</button>
            ${filteredCompile()}
        </div>`;
    }

    /**
     * ‼️ U-95 — "COMPILE WHAT I AM LOOKING AT", where the looking is done.
     *
     * A reader who has just narrowed the pool to `Felsefe` wants that compiled,
     * and the two presses that already did it (tick the header box, then
     * Compile Selected) are two presses about a set the filter has already
     * expressed. It appears only when the view IS narrowed — on the unfiltered
     * pool it would be a second, differently-worded Compile All Pending.
     */
    function filteredCompile() {
        const pick = compilable(shown());
        // ‼️ It appears when it would compile a DIFFERENT set from Compile All
        // Pending — which is the honest test, and the one that does not have to
        // guess what "a filter is applied" means. The default view already
        // hides the dropped marks, and dropped marks were never compilable, so
        // on an untouched page the two sets are the same and this stays away.
        if (!pick.length || pick.length === compilable(rows()).length) { return ''; }
        const v = vault();
        const blocked = !v.exists || !v.rulesFound;
        return `<button class="secondary" id="wk-cfilt"${blocked ? ' disabled' : ''}
            title="${blocked ? 'The wiki is not compilable — see the strip above.'
            : `Start one run over the ${pick.length} waiting mark(s) these filters leave. Marks a run is already out for are not among them.`}"
            >⚡ Compile these ${pick.length}</button>`;
    }

    // --------------------------------------------------------------- the rows
    // ------------------------------------------------- U-95: before it runs
    /** Open the confirm strip. `ids: []` means every waiting mark — the op
     *  resolves that itself, at the moment it runs. */
    function askCompile(ids, what) {
        ask = { ids: ids.slice(), what };
        render();
    }

    /**
     * What the run will be: who writes it and with how much of a model. All
     * four are settings (X-57) and none of them is visible from this page, so
     * the one press that starts a real run states them — and offers the way to
     * change them, which is the Settings section that owns them, not a second
     * copy of it here.
     */
    function askStrip() {
        if (!ask) { return ''; }
        const w = DATA.compileWith || {};
        const n = ask.ids.length || compilable(rows()).length;
        const bit = (label, value, unset) => `<span class="wk-awith" title="${esc(value
            ? `${label}: ${value}`
            : `${label} is not set — ${unset}`)}">${value ? esc(value) : `<span class="muted">${esc(label)}: default</span>`}</span>`;
        return `<div class="wk-ask">
            <span class="wk-alabel">📚 ${esc(ask.what)}</span>
            <span class="wk-asep">·</span>
            <span class="muted small">runs as</span>
            ${bit('agent', w.agent, 'the farm\'s first agent writes it')}
            ${bit('engine', w.engine, 'the extension\'s default engine')}
            ${bit('model', w.model, 'the engine\'s own default model')}
            ${bit('effort', w.effort, 'the engine\'s own default effort')}
            <span class="wk-aspace"></span>
            <button id="wk-ago" title="Start the run now. ${n} mark(s) go into ONE run; nothing is compiled until it reports back with the pages it wrote.">▶ Start</button>
            <button class="secondary" id="wk-achange" title="Open Settings ▸ Wiki & Knowledge Base, where these four live. Change them there and press Start again — a run started from the cockpit, the palette or the bridge must be the same run.">⚙ Change…</button>
            <button class="secondary" id="wk-acancel" title="Start nothing (Esc)">Cancel</button>
        </div>`;
    }

    /** The zero-click preview: everything the pool knows about this mark, on
     *  the cell that names it. A reader deciding whether to compile a row reads
     *  this instead of opening the transcript. */
    /** U-92 — what a compile will actually read, as a sentence. */
    function scopeWords(c) {
        // ‼️ U-117 — A FILE HAS NO TURNS, so it has no range to state and no
        // turn to leave out. Saying "whole session (turns 1–0)" over a markdown
        // export is the sentence that made the two look like the same thing.
        if (c.raw) { return 'External file — the compile reads all of it.'; }
        const n = c.sessionTurns || 0;
        const ex = c.excludeTurns || [];
        const whole = c.fromTurn === 0;
        const span = whole ? n : (c.toTurn - c.fromTurn + 1);
        const head = whole
            ? (n ? `Whole session (turns 1–${n})` : 'Whole session')
            : c.fromTurn === c.toTurn ? `Turn ${c.fromTurn}` : `Turns ${c.fromTurn}–${c.toTurn}`;
        if (!ex.length) { return head + (span ? ` — ${span} turn(s) to read` : ''); }
        const kept = Math.max(0, span - ex.length);
        return `${head} · except ${ex.join(', ')}${span ? ` — ${kept} turn(s) to read` : ''}`;
    }

    function markTip(c) {
        return T.lines([
            c.label || '(no opening line recorded)',
            '',
            c.raw ? `File: ${c.rawFile}` : `Session ${c.sessionId}`,
            c.raw ? (c.sessionFile || '') : (c.agent ? `Agent: ${c.agent}` : ''),
            c.raw ? 'Dropped into _RAW_ — it did not happen in a CLI on this machine.'
                : `Engine: ${c.engine || 'claude'}`,
            scopeWords(c),
            c.note ? '' : null,
            c.note ? 'Note: ' + c.note : null,
            '',
            `Marked by ${c.addedBy || 'agent'} · ${window.AFTime.full(c.addedAt)}`,
            c.compiledAt ? `Compiled ${window.AFTime.full(c.compiledAt)}` : '',
            c.compiling ? 'A compile is running for this mark — it is not offered again until that run ends.' : ''
        ].filter(x => x !== null));
    }

    function topicsCell(c) {
        // SHORTHAND: the row stays one line tall. Three chips is what fits, and
        // the rest are a count whose meaning is one hover away — the AFTip on
        // this cell already lists every topic.
        const all = c.topics || [];
        const chips = all.slice(0, 3).map(t =>
            `<span class="wk-chip" data-only="${esc(t)}" role="button" tabindex="0"
                title="Show only this topic">${esc(t)}</span>`).join('')
            + (all.length > 3 ? `<span class="wk-more">+${all.length - 3}</span>` : '');
        return T.cell('wk-topics', `data-topics="${esc(c.id)}" role="button" tabindex="0"`,
            // ‼️ U-117 — AN EMPTY CELL IS A DEAD END; THIS ONE IS THE DOOR. `—`
            // reads as "nothing to see", and for the one row where the missing
            // value is the whole job that is exactly wrong.
            chips || '<span class="wk-seedcat">pick a category…</span>',
            'Topics', T.lines([
                (c.topics || []).join(' · ') || 'Filed under nothing yet.',
                '',
                'This is the filing key: the compile opens or amends a page per concept under it.',
                (c.topics || []).length ? 'Click to edit.'
                    : 'Click to pick one — the compile cannot run until it has one.'
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
        // U-117 — a mark with no topic is refused by `startCompileRun` by name.
        // ‼️ U-121 — WHICH IS ABOUT COMPILING, NOT ABOUT SELECTING. The row is
        // still tickable (it can be dropped or removed with four others); it is
        // simply never counted by a compile button, and the State and Topics
        // cells both say why in words. The one row with NO box is the one a run
        // is already out for: there, everything you could do fights the run.
        const untriaged = c.state === 'pending' && !(c.topics || []).length;
        const box = !c.compiling
            ? `<input type="checkbox" data-cb="${esc(c.id)}"${on ? ' checked' : ''} aria-label="Select this mark">`
            : `<span class="wk-nobox" title="A compile is already running for this mark — leave it alone until the run reports back">·</span>`;
        return `<tr class="${on ? 'sel' : ''} ${st.cls}">
            <td class="wk-pick">${box}</td>
            ${T.cell('wk-state', untriaged ? `data-act="topics" data-id="${esc(c.id)}" role="button" tabindex="0"` : '',
            `<span class="wk-st">${st.icon} ${st.label}</span>`, 'State',
            T.lines([
                st.label === 'waiting' ? 'Marked, and nothing has been compiled from it yet.'
                    : st.label === 'compiling' ? 'Still waiting — but a run is out for it, so it is not offered again.'
                        : st.label === 'failed' ? 'Still waiting, and the last run over it produced no page:'
                            : st.label === 'compiled' ? 'A run reported the pages it wrote for this mark.'
                                // ‼️ U-117 — WHY IT IS NOT A FAULT. A file lands
                                // in the pool with no topic on purpose: the scan
                                // will not guess what a conversation was about,
                                // and a guess would file the page under it for
                                // ever. So the row says what is missing and who
                                // has to supply it.
                                : st.label === 'needs a topic'
                                    ? (c.raw
                                        ? 'A file you dropped into _RAW_. It is in the pool, and it is filed under nothing yet.'
                                        : 'This mark is filed under nothing yet.')
                                    : 'Taken out of the queue without being compiled.',
                // X-58 — the reason, in the panel, in the words the host wrote.
                // A ⚠ with no sentence behind it is a badge, not an answer.
                ...(st.label === 'failed'
                    ? ['', c.lastError || '', c.lastErrorAt ? '(' + window.AFTime.ago(c.lastErrorAt) + ')' : '',
                        '', 'Press ↻ to clear it and put the mark back in the queue, or simply compile it again.']
                    : st.label === 'needs a topic'
                        ? ['', 'A topic is the key the compile files the page under — it is the one thing a scan cannot supply, so nothing is offered for compiling until you give it one.',
                            '', 'Click to pick a category and leave a note for the compiling agent.']
                        : ['', 'Only a run reporting back closes a mark.'])
            ]))}
            ${c.raw
                // ‼️ U-117 — A DROPPED FILE SHOWS ITS NAME, NOT EIGHT CHARACTERS
                // OF A KEY. `shortOf('raw:notes.md')` is `raw:note`, which
                // identifies nothing; the file name is the only handle the
                // reader has on something they saved out of a browser.
                ? T.cell('wk-sess wk-rawsess', `data-session="${esc(c.sessionId)}" role="button" tabindex="0"`,
                    `<span class="wk-rawicon">📄</span> <code>${esc(c.rawFile || c.sessionId)}</code>`
                    + ` <span class="wk-rawbadge${c.rawDone ? ' done' : ''}">${c.rawDone ? 'DONE' : 'RAW'}</span>`,
                    'External file', T.lines([c.rawFile || c.sessionId,
                        c.sessionFile || '',
                        c.rawDone ? 'Archived — a compile has moved it into _RAW_/_DONE_.' : 'Waiting in _RAW_.',
                        '', 'Dropped into the wiki\'s _RAW_ folder, not run in a CLI on this machine — so it has no turns, no agent and no engine.',
                        scopeWords(c),
                        '', 'Click to open the file.']))
                : T.cell('wk-sess', `data-session="${esc(c.sessionId)}" role="button" tabindex="0"`,
                    `<span class="wk-rawicon">💬</span> <code>${esc(c.session)}</code> <span class="wk-turns${(c.excludeTurns || []).length ? ' cut' : ''}">${esc(c.turns)}</span>`,
                    'Where it came from', T.lines([`Session ${c.sessionId}`, c.agent ? 'Agent: ' + c.agent : '',
                        'Engine: ' + (c.engine || 'claude'),
                        // ‼️ U-92 — the scope SPELLED OUT rather than abbreviated: how
                        // long the conversation is, which turns the compile will read,
                        // and which were deliberately left out. "whole session" over a
                        // 40-turn conversation and over a 3-turn one are the same three
                        // words and completely different amounts of work.
                        scopeWords(c),
                        (c.excludeTurns || []).length
                            ? `Excluded: ${c.excludeTurns.join(', ')} — the compile is told in so many words not to read them.` : '',
                        '', 'Click to open the transcript.']))}
            ${topicsCell(c)}
            ${T.cell('wk-label', '', esc(c.label || '—') + (c.note ? ` <span class="wk-note">— ${esc(c.note)}</span>` : ''),
            'What was said', markTip(c))}
            ${T.cell('wk-when', '', esc(window.AFTime.ago(c.addedAt)),
            'Marked', T.lines([window.AFTime.full(c.addedAt), 'by ' + (c.addedBy || 'agent'),
                c.compiledAt ? '' : null, c.compiledAt ? 'Compiled ' + window.AFTime.full(c.compiledAt) : null].filter(x => x !== null)))}
            ${pagesCell(c)}
            <td class="wk-act">
                ${c.state === 'pending' && !c.compiling && !untriaged
                ? `<button class="mini wk-go" data-act="compile" data-id="${esc(c.id)}"
                        title="Compile this one mark on its own, without ticking it first. Same run, one mark in it.">⚡</button>`
                : ''}
                <button class="mini" data-act="topics" data-id="${esc(c.id)}" title="Edit this mark's topics, its note and the turns it leaves out">✎</button>
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
            <tbody>${list.map(c => rowHtml(c) + editorRow(c)).join('')}</tbody>
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
        // U-121 — three different questions about one selection, each answered
        // on the button that acts on it. `picked` is what is ticked and still on
        // screen; the other two are the slices each act can actually take.
        const picked = [...selected].filter(id => selectable(list).some(c => c.id === id));
        const pickedIds = [...selected].filter(id => compilable(list).some(c => c.id === id));
        const pickedOpen = [...selected].filter(id =>
            list.some(c => c.id === id && c.state === 'pending' && !c.compiling));
        const pickedClosed = [...selected].filter(id =>
            list.some(c => c.id === id && (c.state === 'dropped' || c.state === 'compiled')));
        const waiting = compilable(rows()).length;
        const blocked = !v.exists || !v.rulesFound;
        const why = blocked
            ? (!v.exists ? 'The wiki root is not there — a compile cannot start.' : 'The wiki\'s own law (-WIKI-ANAYASA-.md) is missing — a compile is refused without it.')
            : '';

        /**
         * ‼️ U-95 — WHAT A TICK IS FOR, BESIDES COMPILING. Ticking five rows and
         * then pressing 🚫 five times, one row at a time, is the same gesture
         * the tick box was put there to end. The two appear only when something
         * is ticked: an always-visible `Drop (0)` is a button that does nothing
         * and a `Remove` sitting permanently beside a compile is a hand slip.
         */
        const bulk = picked.length ? `
            <span class="wk-bulk">
                ${pickedOpen.length ? `<button class="secondary" id="wk-dsel"
                    title="Take the ${pickedOpen.length} waiting mark(s) in your selection out of the queue without compiling them. Reversible (↺), and it writes nothing to the vault."
                    >🚫 Drop ${pickedOpen.length}</button>` : ''}
                ${/* ‼️ U-121 — THE WAY BACK, IN ONE PRESS. Dropping five marks was
                      one gesture and un-dropping them was five, which is what made
                      the 🚫 above feel irreversible even though every row has had
                      its own ↺ all along. `compiled` is here too: reopening one
                      writes nothing and unwrites nothing — the pages it already
                      wrote stay written, and the mark simply queues again. */''}
                ${pickedClosed.length ? `<button class="secondary" id="wk-osel"
                    title="Put the ${pickedClosed.length} closed mark(s) in your selection back in the queue as waiting. It writes nothing and undoes nothing — a page a compile already wrote stays written."
                    >↺ Reopen ${pickedClosed.length}</button>` : ''}
                <button class="secondary wk-del" id="wk-rsel"
                    title="Delete the ${picked.length} selected mark(s) from the pool. It undoes nothing in the vault — a page already written stays written."
                    >✕ Remove ${picked.length}</button>
            </span>` : '';

        // ‼️ U-121 — WHEN THE TICKED SET AND THE COMPILABLE SET DIFFER, SAY SO.
        // A selection of six that compiles two is a perfectly ordinary thing to
        // have (dropped rows, compiled rows, a drop with no topic yet) — and a
        // button that quietly says "2" over a selection of six is the kind of
        // silent narrowing this page is built not to do.
        const short = picked.length - pickedIds.length;
        const actions = `
            <button id="wk-csel" ${pickedIds.length && !blocked ? '' : 'disabled'}
                title="${blocked ? esc(why) : `Start ONE run over the ${pickedIds.length} selected mark(s). It writes nothing yet — the run reports back with the pages it wrote, and that is what closes a mark.`
            + (short > 0 ? ` ‼️ ${short} of the ${picked.length} you have ticked cannot be compiled — they are closed, or waiting for a topic — and are not in this run.` : '')}"
                >📚 Compile Selected${pickedIds.length ? ` (${pickedIds.length})` : ''}</button>
            <button class="secondary" id="wk-call" ${waiting && !blocked ? '' : 'disabled'}
                title="${blocked ? esc(why) : `Start one run over every waiting mark (${waiting}). Marks a run is already out for are left alone.`}"
                >⚡ Compile All Pending${waiting ? ` (${waiting})` : ''}</button>
            ${bulk}
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
                /* ‼️ U-122: the root is a PATH you can press, so it is drawn as
                   the same kind of thing every other pressable object on the
                   strip is — a code element you can click is a control with no
                   role at all.
                   It keeps the monospace, because a path read in the body font
                   is a path you cannot check character by character. */
                .wk-vroot { font-family:var(--vscode-editor-font-family); opacity:.85; }
                /* The drop box: the one object on this strip that is a GESTURE
                   rather than a file, so it carries the count it exists for. */
                .wk-raw { font-family:var(--vscode-editor-font-family); }
                /* ‼️ A door that opens nothing does not look like a door. */
                .wk-dead { cursor:default; text-decoration:none; }
                .wk-dead:hover { text-decoration:none; }
                .wk-vsep { opacity:.4; margin:0 2px; }
                .wk-bar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin:0 0 8px; }
                /* U-121: the table's own toolbar, under the filters that decide
                   what is in the table and over the ticks that decide what is in
                   the selection — the three things that argue with each other,
                   in the order they argue. */
                .wk-tbar { display:flex; gap:7px; align-items:center; flex-wrap:wrap; margin:0 0 8px; }
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
                /* U-92: the row editor. A row of its own under the mark it is
                   about, because three fields do not fit in one 180px cell —
                   which is exactly how the comma-separated box happened. */
                tr.wk-erow > td { border-top:none; padding:0 0 8px; }
                .wk-editor { display:flex; flex-direction:column; gap:6px; padding:8px 10px;
                    border-left:2px solid var(--vscode-focusBorder);
                    background:var(--vscode-editorWidget-background, transparent); border-radius:0 4px 4px 0; }
                /* ‼️ The editor's own rows are wk-eline, and the name matters:
                   display:flex on a class the tr also carried turned the table
                   row into a flex box, collapsed its two cells and pushed every
                   column of the table sideways. A picture caught it. */
                .wk-eline { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
                .wk-elabel { flex:0 0 46px; font-size:10px; opacity:.55; cursor:help; text-align:right; }
                .wk-enote { flex:1 1 320px; max-width:520px; padding:2px 6px; font-size:12px; }
                .wk-emade { font-size:11px; opacity:.7; }
                .wk-editor .afc { flex:1 1 320px; max-width:420px; position:relative; }
                /* X-58's strip, in the editor: everything is IN and a press
                   takes one OUT, struck through so it cannot read as "not
                   reached yet". */
                .wk-tns { display:flex; flex-wrap:wrap; gap:3px; max-height:52px; overflow:auto; }
                .wk-tn { min-width:20px; border:1px solid transparent; border-radius:4px;
                    padding:1px 4px; font-size:10px; cursor:pointer;
                    font-family:var(--vscode-editor-font-family);
                    background:var(--vscode-badge-background); color:var(--vscode-badge-foreground); }
                /* ‼️ IN is the quiet state, because in is what fourteen of the
                   fourteen are. Drawn in the primary button's own blue, the
                   strip shouted louder than Save two rows under it and said
                   nothing the reader did not already assume; the outline is
                   enough to say "this is a thing you press". */
                .wk-tn.on { border-color:var(--vscode-widget-border,#4444); }
                .wk-tn.cut { opacity:.5; text-decoration:line-through; background:transparent;
                    color:var(--vscode-descriptionForeground,#888);
                    border-color:var(--vscode-widget-border,#4444); }
                .wk-turns.cut { color:var(--vscode-editorWarning-foreground,#d19a66); }
                .wk-fix { margin-left:2px; }
                .wk-sess { white-space:nowrap; width:1%; cursor:pointer; }
                .wk-sess code { font-size:11px; }
                .wk-turns { opacity:.7; }
                /* ‼️ U-117 — WHERE THE ROW CAME FROM, AT A GLANCE. The icon does
                   the scanning (💬 a run on this machine · 📄 a file somebody
                   dropped) and the badge says which shelf the file is on. The
                   name is not truncated the way a session id is: it is the only
                   handle the reader has on it. */
                .wk-rawicon { opacity:.75; font-size:11px; }
                .wk-rawsess code { max-width:30ch; display:inline-block; overflow:hidden;
                    text-overflow:ellipsis; vertical-align:bottom; }
                .wk-rawbadge { padding:0 5px; border-radius:9px; font-size:9.5px; letter-spacing:.4px;
                    border:1px solid var(--vscode-widget-border,#4444);
                    color:var(--vscode-descriptionForeground,#888); }
                .wk-rawbadge.done { border-color:transparent;
                    background:var(--vscode-badge-background); color:var(--vscode-badge-foreground); }
                /* The stage a drop lands in: something to do, not something
                   wrong — a growing thing, in the theme's own "attention"
                   colour rather than its error one. */
                .wk-seed { background:none; border:1px solid transparent; cursor:pointer;
                    font-size:11px; padding:0 3px; border-radius:4px; }
                .wk-seed:hover { background:var(--vscode-toolbar-hoverBackground,#8882);
                    border-color:var(--vscode-widget-border,#4443); }
                tr.wk-untriaged .wk-st { color:var(--vscode-charts-green,#89d185); }
                /* No resting opacity — the light theme's own green is already
                   at the edge of readable and dimming it would put the one
                   thing on the page that is asking to be pressed below it. */
                .wk-seedcat { font-style:italic; cursor:pointer;
                    color:var(--vscode-charts-green,#89d185); }
                .wk-topics:hover .wk-seedcat { text-decoration:underline; }
                .wk-rawf.sel { background:var(--vscode-button-background);
                    color:var(--vscode-button-foreground); }
                /* The editor's scope line for a file: the strip's replacement,
                   not its absence. */
                .wk-rawinfo { font-size:11px; opacity:.8; cursor:help; }
                .wk-edirective { border-color:var(--vscode-charts-green,#89d185) !important; }
                .wk-topics { max-width:230px; cursor:pointer; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
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
                /* ‼️ U-95 — A RUN THAT IS OUT IS THE ONE THING ON THIS PAGE THAT
                   IS HAPPENING RIGHT NOW, and a still blue word looks exactly
                   like a state that has been sitting there for a day. It
                   breathes instead — the same signal the Console uses for a
                   turn in flight, and off for a reader who asked for less
                   motion. */
                .wk-run, tr.wk-compiling .wk-st { color:var(--vscode-charts-blue,#3794ff);
                    animation:wk-breathe 1.9s ease-in-out infinite; }
                @keyframes wk-breathe { 0%,100% { opacity:1; } 50% { opacity:.45; } }
                @media (prefers-reduced-motion: reduce) {
                    .wk-run, tr.wk-compiling .wk-st { animation:none; }
                }
                /* U-95: the bulk group, which only exists while rows are ticked. */
                .wk-bulk { display:inline-flex; gap:6px; padding-left:8px; margin-left:2px;
                    border-left:1px solid var(--vscode-widget-border,#4443); }
                .wk-del:hover { color:var(--vscode-errorForeground,#f14c4c); }
                /* U-95: the strip that stands between a press and a real run. */
                .wk-ask { display:flex; align-items:center; gap:7px; flex-wrap:wrap; font-size:11px;
                    padding:6px 10px; margin:0 0 8px; border-radius:5px;
                    border:1px solid var(--vscode-focusBorder);
                    background:var(--vscode-editorWidget-background, transparent); }
                .wk-alabel { font-size:12px; }
                .wk-asep { opacity:.4; }
                .wk-awith { padding:0 6px; border-radius:9px; font-size:10.5px; cursor:help;
                    background:var(--vscode-badge-background); color:var(--vscode-badge-foreground); }
                .wk-awith .muted { color:inherit; opacity:.7; }
                .wk-aspace { flex:1 1 auto; }
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
            /**
             * ‼️ U-121 — THE TABLE'S BUTTONS ARE NOT THE PAGE'S BUTTONS.
             *
             * `Compile Selected`, `Compile All`, the bulk group and `Lint` all
             * act on the rows below, and they were sitting in the page header
             * among the global navigation — two strips away from the filters
             * that decide what is in the table and from the ticks that decide
             * what is in the selection. A count that changes when you tick a row
             * belongs beside the row, not beside the link to Dashboard. The
             * header keeps what a header is for: what this page is, what is in
             * the pool, and where else to go.
             */
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
            <div class="wk-tbar">${actions}</div>
            ${askStrip()}
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

    // -------------------------------------------------------- the row editor
    /** The options AFCombo draws: the union U-90 established, in its shape. */
    function comboOptions() {
        const byKey = new Map();
        // ‼️ `pages` is left UNDEFINED for a name that is only a topic — the
        // component reads its absence as "not a folder yet" and says so, and
        // writing 0 there would call every unfiled topic an empty folder.
        const put = (name, patch) => {
            const k = String(name).toLocaleLowerCase('tr');
            const e = byKey.get(k) || { name };
            byKey.set(k, Object.assign(e, patch, { name: e.name }));
        };
        (DATA.folders || []).forEach(f => put(f.name, { pages: f.pages || 0 }));
        (pool().topics || []).forEach(t => put(t.topic, { marks: t.total || 0, pending: t.pending || 0 }));
        return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    }

    function openEditor(c) {
        editing = c.id;
        edit = {
            id: c.id,
            picked: (c.topics || []).slice(),
            query: '', open: false, active: 0,
            note: c.note || '',
            exclude: (c.excludeTurns || []).slice(),
            made: ''
        };
        refocus = 'topics';
    }

    function closeEditor() { editing = null; edit = null; }

    function saveEditor() {
        if (!edit) { return; }
        const id = edit.id;
        const topics = edit.picked.slice();
        // An empty list would leave the mark with nothing to file it under, and
        // the host refuses it by name — so the editor stays open and says so
        // rather than sending a write that will bounce.
        if (!topics.length) {
            edit.made = 'A mark needs at least one topic — it is what the compile files the concept under.';
            render();
            return;
        }
        const note = edit.note;
        const exclude = edit.exclude.slice().sort((a, b) => a - b);
        closeEditor();
        post({ type: 'edit', id, topics, note, excludeTurns: exclude });
    }

    /**
     * ‼️ U-92 — THE EDITOR IS A ROW OF ITS OWN, NOT A BOX IN A CELL. Three
     * fields do not fit in a 180px column, and cramming them there is how the
     * comma-separated box happened in the first place. It opens under the row it
     * belongs to, so what is being edited stays on screen above it.
     */
    function editorRow(c) {
        if (!edit || edit.id !== c.id) { return ''; }
        const n = c.sessionTurns || 0;
        const from = c.fromTurn === 0 ? 1 : c.fromTurn;
        const to = c.fromTurn === 0 ? n : c.toTurn;
        const span = Math.max(0, to - from + 1);
        const kept = span - edit.exclude.length;
        let chips = '';
        /**
         * ‼️ U-117 — WHAT THE STRIP IS REPLACED BY, NOT WHAT IS MISSING FROM IT.
         *
         * A dropped file has no turns, so the exclusion strip has nothing to
         * draw and an editor that simply left the line out would say nothing
         * about scope at all — the reader would be left assuming the same
         * turn-picking applies. It says the opposite in so many words: all of it
         * is read, and the note below is where you narrow it.
         */
        if (c.raw) {
            chips = `<div class="wk-eline wk-rawnote">
                <span class="wk-elabel">scope</span>
                <span class="wk-rawinfo" title="${esc(c.sessionFile || '')}">📄 External file — the compile reads the whole of it${c.rawDone
                ? ', and a compile has already archived it under _RAW_/_DONE_' : ''}.
                    To point the agent at one part of it, say so in the directive below.</span>
            </div>`;
        } else if (span > 1) {
            let out = '';
            for (let i = from; i <= to; i++) {
                const off = edit.exclude.indexOf(i) >= 0;
                out += `<button class="wk-tn${off ? ' cut' : ' on'}" data-ex="${i}"
                    title="Turn ${i}${n ? ' of ' + n : ''} — ${off ? 'left OUT of the compile; press to put it back' : 'press to leave it out'}">${i}</button>`;
            }
            chips = `<div class="wk-eline">
                <span class="wk-elabel" title="X-58 — the turns inside this mark's scope that the compile must NOT read. Everything is in until you take it out.">turns</span>
                <span class="wk-tns">${out}</span>
                <span class="muted small">${edit.exclude.length
                ? `${kept} of ${span} — except ${edit.exclude.slice().sort((a, b) => a - b).join(', ')}`
                : `all ${span}`}</span>
                ${edit.exclude.length ? '<button class="mini secondary" id="wk-exclear" title="Put every turn back">↺</button>' : ''}
            </div>`;
        } else if (c.fromTurn === 0 && !n) {
            chips = '<div class="wk-eline"><span class="muted small">This conversation has left the session index, so its turns cannot be drawn — the mark still compiles from the transcript it kept.</span></div>';
        }
        return `<tr class="wk-erow"><td></td><td colspan="7">
            <div class="wk-editor">
                <div class="wk-eline">
                    <span class="wk-elabel" title="The filing key: the compile opens or amends a page per concept under each of these. The list is the wiki's own folders AND the topics the pool already uses.">topics</span>
                    ${window.AFCombo.html({
            id: 'wk-cat', options: comboOptions(), picked: edit.picked,
            query: edit.query, open: edit.open, active: edit.active, create: true,
            placeholder: edit.picked.length ? 'another…' : 'search the categories…'
        })}
                </div>
                ${chips}
                <div class="wk-eline">
                    <span class="wk-elabel" title="${c.raw
            ? 'X-140 — for a dropped file this is the DIRECTIVE the compiling agent is handed: it is the only way to say which part of the file matters, because there are no turns to exclude.'
            : 'Why this was worth keeping. It travels into the compile instruction, so it is the one place to say what the transcript does not.'}">${c.raw ? 'directive' : 'note'}</span>
                    <input type="text" id="wk-enote" class="wk-enote${c.raw ? ' wk-edirective' : ''}" value="${esc(edit.note)}"
                        placeholder="${c.raw ? 'what the agent should take from this file (optional)' : 'why it is worth keeping (optional)'}">
                </div>
                <div class="wk-eline">
                    <button id="wk-esave" title="Save the topics, the note and the excluded turns">Save</button>
                    <button class="secondary" id="wk-ecancel" title="Leave it exactly as it was (Esc)">Cancel</button>
                    ${edit.made ? `<span class="wk-emade">${esc(edit.made)}</span>` : ''}
                </div>
            </div>
        </td></tr>`;
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
        bind('wk-raw', 'click', () => { fRaw = !fRaw; saveState(); render(); });
        bind('wk-reset', 'click', () => {
            fTopic = DEF.fTopic; fState = DEF.fState; query = DEF.query; fRaw = DEF.fRaw;
            selected.clear(); saveState(); render();
        });
        // U-92 — the two ways out of a strip that says the wiki is not there.
        // Neither is this page's own act: one is X-57's scaffold, the other is
        // the Settings section that reads the folder.
        bind('wk-vinit', 'click', () => post({ type: 'wikiInit' }));
        bind('wk-vsettings', 'click', () => post({ type: 'openSettings', focus: 'agentFarm.wikiRoot' }));

        // Selection. "All" means every row that could actually be compiled in
        // the current view — a tick that selects rows the button then refuses
        // is a count that lies.
        /**
         * ‼️ U-121 — THE MASTER BOX HAS TO KNOW WHAT IT IS LOOKING AT, or it
         * cannot be pressed twice.
         *
         * It was drawn unchecked on every repaint, so a browser click always
         * read as "turn on": ticking everything worked, and untticking it was
         * impossible — the one gesture the box exists for. `checked` is set from
         * the rows themselves, and `indeterminate` (a PROPERTY, so it cannot be
         * written in the markup and has to be set here) is what a partial
         * selection actually is. From indeterminate a click selects all, which
         * is what a reader means by it.
         */
        const master = document.getElementById('wk-all');
        if (master) {
            const pick = selectable(shown());
            const n = pick.filter(c => selected.has(c.id)).length;
            master.checked = pick.length > 0 && n === pick.length;
            master.indeterminate = n > 0 && n < pick.length;
            master.disabled = pick.length === 0;
            master.title = !pick.length ? 'Nothing here can be selected'
                : master.checked ? `Unselect all ${pick.length} row(s) shown`
                    : `Select all ${pick.length} row(s) these filters leave`;
        }
        bind('wk-all', 'change', e => {
            const pick = selectable(shown());
            if (e.target.checked) { pick.forEach(c => selected.add(c.id)); }
            else { pick.forEach(c => selected.delete(c.id)); }
            render();
        });
        each('[data-cb]', 'change', e => {
            const id = e.currentTarget.dataset.cb;
            if (e.currentTarget.checked) { selected.add(id); } else { selected.delete(id); }
            render();
        });

        // ---- U-95: every compile goes through the same strip, and the strip is
        // the only thing that posts. One door, so a run started from the row
        // button cannot quietly differ from one started from the toolbar.
        const picked = () => [...selected].filter(id => compilable(rows()).some(c => c.id === id));
        bind('wk-csel', 'click', () => {
            const ids = picked();
            if (ids.length) { askCompile(ids, `Compile ${ids.length} selected mark(s)`); }
        });
        bind('wk-call', 'click', () => askCompile([], `Compile every waiting mark (${compilable(rows()).length})`));
        bind('wk-cfilt', 'click', () => {
            const ids = compilable(shown()).map(c => c.id);
            if (ids.length) { askCompile(ids, `Compile the ${ids.length} mark(s) these filters leave`); }
        });
        bind('wk-ago', 'click', () => {
            const ids = ask ? ask.ids.slice() : null;
            if (!ids) { return; }
            ask = null;
            post({ type: 'compile', ids });
            selected.clear();
            // The host answers with fresh data in a moment; until it does, the
            // page must not still be showing a strip about a run that has
            // already been started.
            render();
        });
        bind('wk-achange', 'click', () => post({ type: 'openSettings', focus: 'agentFarm.wikiEngine' }));
        bind('wk-acancel', 'click', () => { ask = null; render(); });
        // Esc gets out of a strip that is about to spend quota, from wherever
        // the hand is. Wired to the document ONCE — the page rebuilds itself on
        // every tick and a listener added per render would stack up.
        if (!escWired && document.addEventListener) {
            escWired = true;
            document.addEventListener('keydown', ev => {
                if (ev.key === 'Escape' && ask) { ask = null; render(); }
            });
        }

        // ---- U-95/U-121: the ticked rows, acted on together. Each act takes
        // exactly the slice its own button counted — a button that says 3 and
        // sends 6 is the silent narrowing the counts exist to prevent.
        const inState = (...states) => [...selected].filter(id =>
            shown().some(c => c.id === id && states.indexOf(c.state) >= 0 && !c.compiling));
        bind('wk-dsel', 'click', () => {
            const ids = inState('pending');
            if (!ids.length) { return; }
            post({ type: 'edit', ids, state: 'dropped' });
            selected.clear(); render();
        });
        // ‼️ U-121 — the way back for a whole selection. It writes nothing and
        // unwrites nothing: a page a compile already wrote stays written, and
        // the mark simply queues again.
        bind('wk-osel', 'click', () => {
            const ids = inState('dropped', 'compiled');
            if (!ids.length) { return; }
            post({ type: 'edit', ids, state: 'pending' });
            selected.clear(); render();
        });
        bind('wk-rsel', 'click', () => {
            const ids = [...selected].filter(id => selectable(shown()).some(c => c.id === id));
            if (!ids.length) { return; }
            post({ type: 'remove', ids });
            selected.clear(); render();
        });
        bind('wk-lint', 'click', () => post({ type: 'lint' }));
        bind('wk-lclose', 'click', () => { LINT = null; render(); });

        each('[data-open]', 'click', e => post({ type: 'openWikiFile', which: e.currentTarget.dataset.open }));
        // U-122 — a FOLDER has no editor to open in; pressing it shows it where
        // it actually is, which for the drop box is the entire gesture.
        each('[data-reveal]', 'click', e => post({ type: 'revealWikiPath', which: e.currentTarget.dataset.reveal }));
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

        const rowById = id => rows().filter(c => c.id === id)[0];
        each('[data-topics]', 'click', e => {
            if (e.target.closest('[data-only]')) { return; }
            const c = rowById(e.currentTarget.dataset.topics);
            if (c) { openEditor(c); render(); }
        });
        each('[data-act]', 'click', e => {
            const id = e.currentTarget.dataset.id;
            switch (e.currentTarget.dataset.act) {
                case 'topics': {
                    const c = rowById(id);
                    if (c) { openEditor(c); render(); }
                    break;
                }
                // X-58 — the mark was never compiled, so this clears a record
                // rather than undoing work: the reason goes, the claim goes,
                // and the row is a clean waiting row again.
                // U-95 — one mark, on its own, through the same strip every
                // other compile goes through.
                case 'compile': {
                    const c = rowById(id);
                    askCompile([id], `Compile this one mark${c && c.topics && c.topics.length ? ` — ${c.topics.join(', ')}` : ''}`);
                    break;
                }
                case 'retry': post({ type: 'edit', id, retry: true }); break;
                case 'drop': post({ type: 'edit', id, state: 'dropped' }); break;
                case 'reopen': post({ type: 'edit', id, state: 'pending' }); break;
                case 'remove': post({ type: 'remove', ids: [id] }); break;
            }
        });
        // ---- U-92: the row editor. AFCombo holds no state of its own, so the
        // gestures are bound back onto `edit` and the page repaints itself.
        if (edit) {
            const carry = () => {
                const q = document.getElementById('wk-cat-in');
                if (q) { edit.query = q.value; }
                const nt = document.getElementById('wk-enote');
                if (nt) { edit.note = nt.value; }
            };
            window.AFCombo.wire(document, {
                id: 'wk-cat', options: comboOptions(), create: true, state: edit,
                render: () => { const nt = document.getElementById('wk-enote'); if (nt) { edit.note = nt.value; } render(); },
                // U-91 — starting a category is the host's act: it makes a
                // folder, and an existing one in any spelling is reported
                // rather than duplicated.
                onCreate: (name) => { carry(); post({ type: 'category', id: edit.id, name }); },
                onDone: () => saveEditor()
            });
            each('[data-ex]', 'click', e => {
                carry();
                const n = Number(e.currentTarget.dataset.ex) || 0;
                if (!n) { return; }
                const at = edit.exclude.indexOf(n);
                if (at >= 0) { edit.exclude.splice(at, 1); } else { edit.exclude.push(n); }
                render();
            });
            bind('wk-exclear', 'click', () => { carry(); edit.exclude = []; render(); });
            bind('wk-esave', 'click', () => { carry(); saveEditor(); });
            bind('wk-ecancel', 'click', () => { closeEditor(); render(); });
            const nt = document.getElementById('wk-enote');
            if (nt) {
                nt.addEventListener('keydown', ev => {
                    if (ev.key === 'Enter') { carry(); saveEditor(); }
                    if (ev.key === 'Escape') { closeEditor(); render(); }
                });
            }
        }

        // The caret goes back where the reader left it: a page that re-renders
        // on every keystroke and loses focus is a search box you cannot type in.
        if (refocus === 'search') {
            const q = document.getElementById('wk-q');
            if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
        } else if (refocus === 'topics' && edit) {
            // The picker's own caret restore (U-98): a repaint hands you a NEW
            // input, and the new one starts at 0.
            window.AFCombo.focus('wk-cat', (edit.query || '').length);
        }
        refocus = null;
    }

    render();
})();
