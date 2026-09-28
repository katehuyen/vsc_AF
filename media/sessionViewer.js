// Agent Farm — session transcript viewer page script (with G4 replay mode).
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    let DATA = window.__DATA__;
    let filter = '';
    let turnsOpen = false;
    // Files changed: CLOSED until the user opens it, and then exactly as they
    // left it. Its state is persisted (vscode.setState), not just held in this
    // closure, because the page is rebuilt from scratch on more than a re-render
    // — a settings change re-issues the whole HTML, and the panel is restored
    // after a reload — and every one of those rebuilds used to spring the box
    // back open. A box that reopens itself is a box the user does not control.
    let filesOpen = false;
    // Role filter: empty set = show everything. "Errors" matches by flag, not role.
    // The AI side is "Agent", never "Assistant" — what talks back here is an
    // agent (the same stance core/speaker.ts takes with its 'agent' fallback).
    // Each chip carries its glyph so the row reads at a glance and shares the
    // extension-wide 🧑/🤖 vocabulary.
    const ROLE_CHIPS = [
        { id: 'user', label: '🧑 User', match: m => m.role === 'user' },
        { id: 'assistant', label: '🤖 Agent', match: m => m.role === 'assistant' },
        { id: 'tool', label: '🔧 Tool calls', match: m => m.role === 'tool' },
        { id: 'toolResult', label: '📄 Results', match: m => m.role === 'toolResult' },
        { id: 'error', label: '⚠ Errors', match: m => m.isError }
    ];
    // Dialog (you + the agent) is the default view: the conversation is what you
    // came to read. Tool traffic is one chip away — and a deep link (focusTs)
    // pointing at a tool message clears the filter so it can never hide a jump.
    let roleSel = new Set(['user', 'assistant']);
    /**
     * ‼️ AN OPENER THAT HAS A SCOPE HANDS IT OVER, AND IT WINS OVER THE DEFAULT.
     *
     * Reached from the Search page, this transcript is the answer to a question
     * that was asked with a scope attached: searching in Dialog means "show me
     * the conversation", and landing on a page full of tool calls answers
     * something else. Searched in Everything, it opens in everything — the same
     * rule, read the other way, and it is why this is a handover rather than a
     * second default. Openers with no scope (a timeline mark, a table row, the
     * turn breakdown) send nothing and the page keeps Dialog.
     */
    const applyScope = roles => {
        if (!Array.isArray(roles) || !roles.length) { return; }
        const known = new Set(ROLE_CHIPS.map(c => c.id));
        const picked = roles.filter(r => known.has(r));
        if (picked.length) { roleSel = new Set(picked); }
    };
    applyScope(DATA.focusRoles);
    // Turns unticked in their band are left out of Export MD (default: all included).
    const exportOff = new Set();
    // Accordion: collapsed turns show only their band (session-local, display-only —
    // export/filters ignore it). A transcript OPENS fully folded and in single-open
    // mode: a session is read turn by turn, and landing on a wall of text buries the
    // turn list that is the real map of the session. Anything that jumps to a turn
    // (deep link, ↑↓, breakdown row) unfolds its target, so nothing is out of reach.
    const collapsed = new Set();
    /** Is the step-kind key pinned open? Folded by default — a legend you have
     *  already learned is clutter — and it survives a re-render once opened. */
    let legendOpen = false;
    // Turn numbers already folded once — a live session's NEW turns arrive folded
    // too, but a turn the user opened by hand is never re-folded behind their back.
    const foldedOnce = new Set();
    const savedState = (typeof vscode.getState === 'function' && vscode.getState()) || {};
    let singleOpen = savedState.singleOpen !== undefined ? !!savedState.singleOpen : true;
    filesOpen = savedState.filesOpen === true;

    /** Remember a display choice across re-renders, reloads and restores. */
    function keepState(patch) {
        if (typeof vscode.setState !== 'function') { return; }
        const st = (typeof vscode.getState === 'function' && vscode.getState()) || {};
        vscode.setState(Object.assign({}, st, patch));
    }

    /** Fold every turn not seen before (called at load and on every data push). */
    function foldNewTurns() {
        (DATA.turns || []).forEach(t => {
            if (foldedOnce.has(t.n)) { return; }
            foldedOnce.add(t.n);
            collapsed.add(t.n);
        });
    }
    // G4 replay state: play messages 0..pos step by step over the *filtered* list,
    // honoring real gaps.
    const replay = { active: false, playing: false, pos: 0, speed: 2, timer: null, msgs: [] };

    window.addEventListener('message', ev => {
        // An already-open page reached again from the Search results takes the
        // new scope too — otherwise the second click answers differently from
        // the first for no reason the reader can see.
        if (ev.data.type === 'focus') { applyScope(ev.data.roles); render({ keepScroll: true }); focusAt(ev.data.ts); return; }
        if (ev.data.type === 'resetView') {
            stopTimer(); replay.active = false;
            filter = '';
            roleSel = new Set(['user', 'assistant']);
            singleOpen = true;
            keepState({ singleOpen: true });
            collapsed.clear(); foldedOnce.clear(); foldNewTurns();
            render();
            window.scrollTo(0, 0);
            return;
        }
        if (ev.data.type === 'ctxCapture') { onCtxCaptureResult(ev.data); return; }
        // K-26 — the wiki tagger answers for itself; the marks it hands back
        // are what turns the band's 🔖 green without waiting for a data push.
        if (window.AFWiki && window.AFWiki.receive(ev.data)) { return; }
        // The receipt for one step's copy button — drawn on the button itself, and
        // only after the host says the clipboard actually took it. No repaint: the
        // reader is looking at that row and moving it under them would be rude.
        if (ev.data.type === 'copied') {
            const b = document.querySelector(`#msgs [data-copy="${ev.data.idx}"]`);
            if (b) {
                b.textContent = ev.data.ok === false ? '⚠' : '✓';
                b.classList.add('done');
                setTimeout(() => { b.textContent = '⧉'; b.classList.remove('done'); }, 1400);
            }
            return;
        }
        if (ev.data.type === 'sessionFileEdits') {
            fileHunks[ev.data.file] = ev.data.records || [];
            render({ keepScroll: true });
            return;
        }
        if (ev.data.type !== 'data') { return; }
        DATA = ev.data.data;
        foldNewTurns();
        if (ev.data.auto && replay.active) {
            // live update while replaying: keep position/controls, just refresh the counter.
            updateReplayUi();
            return;
        }
        if (ev.data.auto) {
            // don't steal focus while the user is typing in the filter box
            const ae = document.activeElement;
            if (!ae || ae.id !== 'filter') { render({ keepScroll: true }); }
            return;
        }
        stopTimer(); replay.active = false; render();
    });

    function fmtTime(ts) {
        return ts ? window.AFTime.full(ts) : '—';
    }

    /**
     * A turn band's hover: WHEN that turn began.
     *
     * Every clock on this page is a time of day — the message meta lines print
     * `toLocaleTimeString`, which answers "14:32" and never "14:32 of which
     * day". Reading an old session, that is the one thing you cannot recover
     * from the text: the transcript looks the same whether it ran this morning
     * or last spring. The band is where the date belongs, because a turn is the
     * unit this page navigates by.
     *
     * Date then time, in the reader's own locale (the rest of the page already
     * defers to it), and the elapsed time in full words — a tooltip has room to
     * be read as a sentence, unlike the `3d` shorthand the compact strips
     * elsewhere are forced into. Date and time are formatted apart on purpose:
     * one `toLocaleString` lets the locale drop a weekday into the middle of
     * the number run (tr-TR: "12 May 2026 Sal 18:32"), which is exactly the
     * kind of stamp you have to re-read.
     */
    function fmtStamp(ts) {
        return window.AFTime.full(ts);
    }

    function agoWords(ts) {
        const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
        if (s < 45) { return 'just now'; }
        const w = (n, unit) => `${n} ${unit}${n === 1 ? '' : 's'} ago`;
        const m = Math.round(s / 60);
        if (m < 60) { return w(m, 'minute'); }
        const h = Math.round(m / 60);
        if (h < 24) { return w(h, 'hour'); }
        const d = Math.round(h / 24);
        if (d < 31) { return w(d, 'day'); }
        const mo = Math.round(d / 30.44);
        if (mo < 12) { return w(mo, 'month'); }
        return w(Math.round(d / 365.25), 'year');
    }

    /** Labelled, so the hover says what the date IS and not just a bare number. */
    function turnStartedTip(ts) {
        return ts ? `Turn started · ${fmtStamp(ts)} (${agoWords(ts)})` : '';
    }

    function matchesRole(m) {
        if (!roleSel.size) { return true; }
        return ROLE_CHIPS.some(c => roleSel.has(c.id) && c.match(m));
    }

    /**
     * ‼️ X-37 — THE SAME GRAMMAR AS EVERY OTHER BOX. This one had stayed on
     * `hay.includes(lowercased)`, which is the one question a transcript filter
     * is worst at answering: you cannot ask for two words that are not next to
     * each other, you cannot exclude, and on the longest lists in the extension
     * that is exactly what you want. Compiled once per pass, never per row
     * (media/afQuery.js), and the box is given the RAW value — the grammar
     * decides its own case handling.
     */
    function matchesText(m, q) {
        if (q.empty) { return true; }
        return q.test((m.text || '') + ' ' + (m.tool || '') + ' ' + (m.input || ''));
    }

    function visibleMsgs() {
        const q = window.AFQuery.compile(filter);
        return DATA.messages.filter(m => matchesRole(m) && matchesText(m, q));
    }

    function turnInfo(n) {
        return (DATA.turns || []).find(x => x.n === n);
    }

    /** Model ids + any run attributes (effort, …) exactly as the transcript
     *  recorded them — never a lookup table, so new names just work. */
    function turnTags(info) {
        if (!info) { return []; }
        return (info.models || []).map(m => m.replace(/^claude-/, ''))
            .concat(Object.values(info.attrs || {}));
    }

    /** Expand a turn, honoring single-open mode (which folds every other turn). */
    function expandTurn(n) {
        if (singleOpen) { (DATA.turns || []).forEach(t => { if (t.n !== n) { collapsed.add(t.n); } }); }
        collapsed.delete(n);
    }

    /** Single click on a turn band folds/unfolds that turn's messages. */
    function toggleTurn(n) {
        const opening = collapsed.has(n);
        if (opening) { expandTurn(n); } else { collapsed.add(n); }
        render({ keepScroll: true });
        // single-open folds turns above the clicked one, shifting the layout —
        // re-anchor so the freshly opened turn is what the user is looking at
        if (opening && singleOpen) { scrollToTurn(n); }
    }

    /**
     * What a turn IS, for the right-click menu. Published by BOTH surfaces that
     * draw a turn — the band in the transcript and the row in the breakdown
     * table — so the same menu appears on whichever one you happen to be
     * pointing at, which is the rule the whole design is built on.
     *
     * `afExport` is the checkbox state: the menu offers "include" or "leave
     * out", never both, and "only this one" was a button that existed in the
     * table and nowhere else.
     */
    function turnCtx(n, closed) {
        return window.AFCtx.row('afViewerTurn', {
            turnN: n, afClosed: !!closed, afExport: !exportOff.has(n)
        });
    }

    function turnHdrHtml(m) {
        if (!m.turnStart || !m.turn) { return ''; }
        const t = (DATA.turnTotals || {})[m.turn];
        const total = t && (t.tokens || t.cost)
            ? `${C.fmtTokW(t.tokens, t.wTokens, C.weighMark(DATA.identity))} tok · ${C.fmtUSD(t.cost)}`
            : '';
        const info = turnInfo(m.turn);
        // ‼️ WHAT THE BAND SAID AND WHAT THE READER ASKS WERE TWO LISTS.
        // It priced the turn and named the model, and left out the two things
        // you ask about a turn you are looking at: how long it took, and where
        // it left the context window. Both were already measured. The step
        // count also became honest here — `14api·26steps` rather than a single
        // number that reads as calls but counts steps (see charts.js).
        const bits = [];
        if (info && info.ms) { bits.push(`<span title="How long this turn ran, prompt to last line">${C.esc(C.fmtDur(info.ms))}</span>`); }
        if (info && (info.apiCalls || info.steps)) {
            bits.push(`<span title="${C.esc(C.STEPS_TIP)}">${C.esc(C.fmtSteps(info.apiCalls, info.steps))}</span>`);
        }
        if (total) { bits.push(total); }
        if (info && info.endCtx) {
            bits.push(`<span title="What the model's window held when this turn ended — the session's own figure is the Context card above">ctx ${C.fmtTok(info.endCtx)}</span>`);
        }
        const stats = bits.join(' · ');
        const closed = collapsed.has(m.turn);
        // The hover carries the turn's date, not "click to expand": the caret,
        // the fold state and the controls row already say the band is clickable,
        // so the one tooltip a turn gets is spent on what nothing else shows.
        return `<div class="turnhdr${closed ? ' closed' : ''}" data-turn="${m.turn}"
            ${turnCtx(m.turn, closed)}
            title="${C.esc(turnStartedTip((info && info.ts) || m.ts))} — ${window.AFCtx.HINT}">
            <span class="tcaret">${closed ? '▸' : '▾'}</span>
            <label class="turnsel" title="Include this turn in Export MD">
                <input type="checkbox" data-turnsel="${m.turn}"${exportOff.has(m.turn) ? '' : ' checked'}></label>
            <span class="turnnum">Turn ${m.turn}/${DATA.turnCount || '?'}</span>
            ${window.AFWiki ? window.AFWiki.badge({
        session: DATA.sessionId, turn: m.turn, marks: DATA.wikiMarks || [],
        text: (info && info.label) || ''
    }) : ''}
            <span class="turnlabel">${C.esc((info && info.label) || '')}</span>
            <span class="turntags">${turnTags(info).map(t => `<span class="tag">${C.esc(t)}</span>`).join('')}</span>
            <span class="turnstats">${stats}</span>
            <span class="turnnav">
                <button class="tnav" data-tnav="prev" data-from="${m.turn}" title="Jump to previous turn">↑</button>
                <button class="tnav" data-tnav="next" data-from="${m.turn}" title="Jump to next turn">↓</button>
            </span></div>`;
    }

    /** Include/exclude a turn in the export and repaint both selection surfaces
     *  (turn bands + breakdown table) so they stay in sync. */
    function setTurnExport(n, included) {
        if (included) { exportOff.delete(n); } else { exportOff.add(n); }
        render({ keepScroll: true });
    }

    /** Scroll so a turn band sits at the top of the viewport. The bands are
     *  position:sticky, so every band already scrolled past reports its STUCK
     *  position (pinned at the top) — scrollIntoView on it is a no-op, which is
     *  why upward jumps must anchor on the band's first message (in normal flow)
     *  and offset by the band height. */
    function scrollToTurn(n) {
        // jumping to a folded turn means the user wants to read it — unfold first
        if (collapsed.has(n)) { expandTurn(n); render({ keepScroll: true }); }
        const el = document.querySelector(`.turnhdr[data-turn="${n}"]`);
        if (!el) { return; }
        const anchor = el.nextElementSibling || el;
        const y = anchor.getBoundingClientRect().top + window.scrollY - el.offsetHeight - 10;
        window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    }

    /** Timeline click-through: scroll to the rendered message nearest the given
     *  timestamp and flash it. Replay indexes a different list, so exit it first. */
    function focusAt(ts) {
        if (!ts) { return; }
        if (replay.active) { stopTimer(); replay.active = false; render(); }
        // Nearest among ALL messages, not just the visible ones: a jump must reach
        // its target even when the current filters (Dialog by default) hide it.
        //
        // ‼️ …BUT A MESSAGE THE FILTER ALREADY SHOWS, AT THE SAME MOMENT, WINS.
        // Several messages share a timestamp — a prompt and the tool call it set
        // off are the same instant — so "nearest overall" picked whichever came
        // first in the file, and when that was a tool call the page threw the
        // whole filter away to reach it. A search made in Dialog therefore
        // landed on a transcript showing everything, every time: the widening
        // was not the deep link's doing, it was a tie broken the wrong way.
        // Comparing the two distances is the whole fix. `visible ⊆ all`, so
        // they are equal exactly when something already on screen is just as
        // close — and then nothing has to be hidden or unhidden to get there.
        const shownQ = window.AFQuery.compile(filter);
        const shown = m => matchesRole(m) && matchesText(m, shownQ);
        let target = null, bestDist = Infinity;
        let visTarget = null, visDist = Infinity;
        (DATA.messages || []).forEach(m => {
            if (!m.ts) { return; }
            const d = Math.abs(m.ts - ts);
            if (d < bestDist) { bestDist = d; target = m; }
            if (shown(m) && d < visDist) { visDist = d; visTarget = m; }
        });
        if (visTarget && visDist === bestDist) { target = visTarget; }
        if (!target) { return; }
        if (!shown(target)) {
            // Genuinely only reachable by widening — a tool call nobody else
            // was next to. The filter goes, because a jump that lands nowhere
            // is worse than a view that shows more than you asked for.
            roleSel = new Set();
            filter = '';
            render({ keepScroll: true });
        }
        // the target may sit inside a folded turn — unfold it or the scroll lands nowhere
        if (target.turn && collapsed.has(target.turn)) { expandTurn(target.turn); render({ keepScroll: true }); }
        const best = visibleMsgs().indexOf(target);
        if (best < 0) { return; }
        const el = document.querySelector(`#msgs [data-idx="${best}"]`);
        if (!el) { return; }
        el.scrollIntoView({ block: 'center' });
        el.classList.add('flash');
        setTimeout(() => el.classList.remove('flash'), 2500);
    }

    /** Jump to the previous/next *rendered* turn band (filters may hide some turns). */
    function jumpTurn(from, dir) {
        const nums = Array.from(document.querySelectorAll('.turnhdr[data-turn]'))
            .map(el => Number(el.dataset.turn)).sort((a, b) => a - b);
        const i = nums.indexOf(from);
        if (i < 0) { return; }
        const target = dir === 'prev' ? nums[i - 1] : nums[i + 1];
        if (target === undefined) { return; }
        scrollToTurn(target);
    }

    /**
     * ‼️ TWO KINDS OF NOTHING, AND SAYING WHICH (S-37).
     *
     * "No messages match." is the FILTER's answer, and it was printed over a
     * conversation that had no messages AT ALL — so a session that genuinely
     * never said anything read exactly like one whose content the page had
     * lost, which is the difference between "fine" and "broken". Nothing else
     * on the page distinguished them either.
     */
    function emptyStateHtml() {
        if (DATA.messageCount) { return '<p class="muted">No messages match.</p>'; }
        var why = DATA.scanLimit
            ? 'its transcript is past the scan’s read ceiling, so it was never read'
            : 'its transcript holds no conversation — no prompt, no answer, no tool call';
        return '<p class="muted">Nothing to show: ' + C.esc(why)
            + '. The file is still there — <b>Open raw JSONL</b> shows exactly what it contains.</p>';
    }

    function listHtml(msgs) {
        return msgs.map((m, i) => turnHdrHtml(m) + messageHtml(m, i)).join('');
    }

    // The chips' glyphs, repeated on the messages themselves: a long transcript
    // is scanned by these marks long before the words are read.
    //
    // ‼️ DIALOG ONLY. A tool row already opens with its step-kind chip (⌘ ⇄ ⌗ ⑂
    // ⚙ ↩ — charts.js STEP_KIND), so a 🔧 next to it was a second mark for the
    // same fact, and the weaker of the two: 🔧 was drawn on a web fetch, an MCP
    // call and a local Read alike, while the chip says which. The dialog rows
    // keep theirs — 🧑 and 🤖 name a SPEAKER, which no chip does.
    const ROLE_GLYPH = { user: '🧑', assistant: '🤖' };

    /**
     * ‼️ X-25 — WHO IS TALKING IN A SUBAGENT LANE.
     *
     * A sidechain step's prompt was written by an AGENT handing work over, and
     * it was labelled `USER` — identical to a person typing. The only thing
     * distinguishing the two was a small "subagent" word further along the meta
     * line, which is not what a reader scans. So the lane says what it is:
     * DELEGATOR, and by name, because "which agent handed this over" is the
     * question a delegation raises; and HANDLER for the side that answers,
     * which must not read as AGENT either — that word already means "the agent
     * I am talking to".
     *
     * The name comes from the session's own owner (DATA.agentName), never from
     * the model id: a delegation is an act by an agent, not by a model.
     */
    const delegatorLabel = () =>
        'DELEGATOR' + (DATA.agentName ? ` (${DATA.agentName})` : '');
    /** Is this step inside a delegation lane — either its own line says so, or
     *  the whole transcript is one (a subagent's own file; see `laneFor`). */
    const inLane = m => !!(m.sidechain || DATA.lane);
    /** The label of one step, for the page and for the exported markdown alike. */
    function speakerLabel(m) {
        if (inLane(m) && m.role === 'user') { return delegatorLabel(); }
        if (inLane(m) && m.role === 'assistant') { return 'HANDLER'; }
        if (m.role === 'assistant') { return C.aiLabel(m.model, true); }
        return { user: 'USER', tool: 'TOOL CALL', toolResult: 'TOOL RESULT', system: 'SYSTEM' }[m.role]
            || String(m.role || '').toUpperCase();
    }

    /**
     * The WORDS of one step — what a copy button has to put on the clipboard.
     *
     * A tool call's payload is its `input`; everything else says what it has to
     * say in `text`. Nothing else goes along: the meta line (role, model, price)
     * is the page's commentary on the step, and pasting it into a message to
     * somebody is not what the button is for.
     */
    function stepText(m) {
        if (!m) { return ''; }
        return String((m.role === 'tool' ? m.input : m.text) || '');
    }

    /**
     * The file a tool step touched, read off its input.
     *
     * Nothing upstream records it — the transcript keeps the tool's raw input —
     * so it is recovered here, and only for the tools whose first job IS a path.
     * A wrong guess would put "Open the file it touched" on a step that touches
     * no file, so the test is deliberately narrow: a `file_path`/`path`/`notebook_path`
     * key, or a bare absolute path on the first line.
     */
    function toolPath(m) {
        if (!m || m.role !== 'tool') { return ''; }
        const raw = String(m.input || '');
        const keyed = /"(?:file_path|notebook_path|path)"\s*:\s*"([^"]+)"/.exec(raw);
        if (keyed) { return keyed[1].replace(/\\\\/g, '\\'); }
        const bare = /^\s*((?:[A-Za-z]:[\\/]|\/)[^\s"']{3,})/.exec(raw);
        return bare ? bare[1] : '';
    }

    /** The list `data-idx` counts against. Replay renders its own snapshot, so a
     *  lookup that always went to `visibleMsgs()` would copy the wrong step the
     *  moment a filter changed mid-replay. */
    function renderedMsgs() {
        return replay.active ? replay.msgs : visibleMsgs();
    }

    /** A step's own copy button. Quiet until the row is under the pointer — one
     *  per step over a thousand-step transcript is either invisible or a rash. */
    const copyBtnHtml = idx =>
        `<button class="copyb" data-copy="${idx}" title="Copy this step's text to the clipboard">⧉</button>`;

    function messageHtml(m, idx) {
        // The 🧑 glyph names a PERSON, so a delegation lane does not wear it:
        // the whole point of the label is that nobody typed this. 📤 / 📥 —
        // the handover goes out, the answer comes back — and neither collides
        // with the 🔧 the Search page's chip row already uses for tool traffic.
        const glyph = inLane(m) ? (m.role === 'user' ? '📤' : m.role === 'assistant' ? '📥' : '')
            : (ROLE_GLYPH[m.role] || '');
        const roleLabel = (glyph ? glyph + ' ' : '') + speakerLabel(m);
        const hide = m.turn && collapsed.has(m.turn) ? ' tclosed' : '';
        const cls = m.role + (m.isError ? ' error' : '') + hide;
        // ‼️ THE KIND LEADS THE META LINE. The transcript could always say what
        // a step DID; it could never say what sort of thing it was, so a free
        // local Read and a billed model reply read identically. The chip is
        // first because it is the question you ask before any other — see
        // charts.js STEP_KIND. A row with no token figure did not cost nothing:
        // one API call carries several steps and the figure is written once.
        const meta = [
            C.stepChip(m.kind, m.tokens, m.wTokens) + roleLabel + (m.tool ? ` · ${C.esc(m.tool)}` : ''),
            m.ts ? `<span title="${C.esc(window.AFTime.tip(m.ts, 'This step'))}">${window.AFTime.clock(m.ts)}</span>` : '',
            m.model ? C.esc(m.model.replace(/^claude-/, '')) : '',
            m.tokens ? C.fmtTokW(m.tokens, m.wTokens, C.weighMark(DATA.identity)) + ' tok' : '',
            m.cost ? C.fmtUSD(m.cost) : '',
            m.sidechain ? 'subagent' : '',
            m.isError ? 'ERROR' : ''
        ].filter(Boolean).join(' · ');
        // The button rides on the meta line rather than in the body: the body is
        // the step's own words and a control inside them would be copied along
        // by anyone selecting by hand — which is the thing this replaces.
        const bar = `<div class="meta">${meta}${copyBtnHtml(idx)}</div>`;
        // A step publishes what it is and what it touched. The path is read off
        // the tool input rather than stored on the message: nothing upstream
        // records it, and "open the file it touched" is the question a tool step
        // most often raises.
        const ctx = window.AFCtx.row('afViewerStep', {
            stepIdx: idx, stepRole: m.role, stepKind: m.kind || '',
            stepTool: m.tool || '', stepFile: toolPath(m)
        });

        if (m.role === 'tool') {
            return `<div class="msg tool${hide}" data-idx="${idx}" ${ctx}>${bar}
                <details><summary>input</summary><pre>${C.esc(m.input || '')}</pre></details></div>`;
        }
        if (m.role === 'toolResult') {
            const body = C.esc(m.text || '(empty result)');
            return `<div class="msg ${cls}" data-idx="${idx}" ${ctx}>${bar}
                <details${m.isError ? ' open' : ''}><summary>result</summary><pre>${body}</pre></details></div>`;
        }
        return `<div class="msg ${cls}" data-idx="${idx}" ${ctx}>${bar}<div class="body">${C.esc(m.text || '')}</div></div>`;
    }

    // ---------- replay engine ----------

    function stopTimer() {
        if (replay.timer) { clearTimeout(replay.timer); replay.timer = null; }
        replay.playing = false;
    }

    function stepDelay(i) {
        const a = replay.msgs[i - 1], b = replay.msgs[i];
        const gap = a && b && a.ts && b.ts ? Math.max(0, b.ts - a.ts) : 400;
        return Math.max(120, Math.min(gap, 5000) / replay.speed);
    }

    function scheduleNext() {
        if (!replay.playing) { return; }
        if (replay.pos >= replay.msgs.length - 1) { stopTimer(); updateReplayUi(); return; }
        replay.timer = setTimeout(() => {
            replay.pos++;
            renderReplayStep();
            scheduleNext();
        }, stepDelay(replay.pos + 1));
    }

    function renderReplayStep() {
        const msgs = document.getElementById('msgs');
        if (!msgs) { return; }
        const i = replay.pos;
        if (!msgs.querySelector(`[data-idx="${i}"]`)) {
            msgs.insertAdjacentHTML('beforeend', turnHdrHtml(replay.msgs[i]) + messageHtml(replay.msgs[i], i));
        }
        updateReplayUi();
        const el = msgs.querySelector(`[data-idx="${i}"]`);
        if (el) { el.scrollIntoView({ block: 'end', behavior: 'smooth' }); }
    }

    function updateReplayUi() {
        const label = document.getElementById('rp-pos');
        if (label) {
            label.textContent = `${Math.min(replay.pos + 1, replay.msgs.length)}/${replay.msgs.length}`;
        }
        const btn = document.getElementById('rp-play');
        if (btn) { btn.textContent = replay.playing ? '⏸ Pause' : '▶ Play'; }
    }

    function jumpTo(pred, from) {
        for (let i = from + 1; i < replay.msgs.length; i++) {
            if (pred(replay.msgs[i])) { replay.pos = i; renderReplayList(); return; }
        }
    }

    function renderReplayList() {
        const msgs = document.getElementById('msgs');
        if (!msgs) { return; }
        msgs.innerHTML = listHtml(replay.msgs.slice(0, replay.pos + 1));
        updateReplayUi();
        const el = msgs.querySelector(`[data-idx="${replay.pos}"]`);
        if (el) { el.scrollIntoView({ block: 'end' }); }
    }

    function exitReplay() {
        stopTimer();
        replay.active = false;
        replay.pos = 0;
        render();
    }

    // ---------- Markdown export ----------
    // B-21 — THE PAGE DECIDES WHAT, THE HOST BUILDS. The document used to be
    // assembled here, out of this view state, and the host only filed it —
    // so it was reachable from one button and from nowhere else. The page
    // now sends the view it is showing; core/sessionExport assembles the
    // same document for this button and for sessions.export alike.
    function exportView() {
        return {
            roles: [...roleSel],
            filter,
            excludeTurns: [...exportOff],
            foldedTurns: [...collapsed],
            replayPos: replay.active ? replay.pos : null
        };
    }

    // ---------- main render ----------

    function chipRowHtml() {
        const all = !roleSel.size;
        const dialog = roleSel.size === 2 && roleSel.has('user') && roleSel.has('assistant');
        return `<div class="chiprow">
            <span class="muted small">Show:</span>
            <button class="chip${all ? ' on' : ''}" data-preset="all">All</button>
            <button class="chip${dialog ? ' on' : ''}" data-preset="dialog">Dialog</button>
            ${ROLE_CHIPS.map(c =>
                `<button class="chip${roleSel.has(c.id) ? ' on' : ''}" data-chip="${c.id}">${c.label}</button>`).join('')}
        </div>`;
    }

    function includedTurnCount() {
        return (DATA.turns || []).filter(t => !exportOff.has(t.n)).length;
    }

    function turnCtlHtml() {
        const turns = DATA.turns || [];
        if (!turns.length) { return ''; }
        return `<div class="chiprow">
            <span class="muted small">Turns:</span>
            <button class="chip" id="t-expandall" title="Expand all turns">Expand all</button>
            <button class="chip" id="t-collapseall" title="Fold every turn down to its band — open just the ones you need">Collapse all</button>
            <button class="chip${singleOpen ? ' on' : ''}" id="t-singleopen" title="Only one turn open at a time: expanding a turn folds the previously open one">Single-open</button>
            <span class="muted small">— click a turn band to fold/unfold it</span>
        </div>`;
    }

    function turnBoxHtml() {
        const turns = DATA.turns || [];
        if (!turns.length) { return ''; }
        const inc = includedTurnCount();
        const incLabel = inc === turns.length ? 'all in export' : `${inc}/${turns.length} in export`;
        return `<details id="turnbox" class="turnbox"${turnsOpen ? ' open' : ''}>
            <summary>Turn breakdown — ${turns.length} turns · ${incLabel} (click a row to jump)</summary>
            <div class="selrow">
                <span class="muted small">Pick turns for <b>Export MD → current view</b>:</span>
                <button class="chip" data-selact="all">All</button>
                <button class="chip" data-selact="none">None</button>
                <button class="chip" data-selact="invert">Invert</button>
                <span class="muted small">— a finer cut than the filters: keep exactly the turns you want (the checkboxes here and on the turn bands stay in sync; "only" keeps just that one). <b>Export MD → everything</b> ignores this and exports the whole transcript.</span>
            </div>
            <div class="tablewrap"><table>
                <thead><tr><th>md</th><th>#</th><th>prompt</th><th>model</th><th class="num">tokens</th><th class="num">cost</th></tr></thead>
                <tbody>${turns.map(t => `<tr class="click" data-turn="${t.n}" ${turnCtx(t.n, collapsed.has(t.n))}
                    title="${C.esc(turnStartedTip(t.ts))} — ${window.AFCtx.HINT}">
                    <td class="selcell"><input type="checkbox" data-turnsel="${t.n}"${exportOff.has(t.n) ? '' : ' checked'} title="Include in Export MD"><button class="only" data-only="${t.n}" title="Export only this turn">only</button></td>
                    <td>${t.n}</td><td>${C.esc(t.label || '—')}</td>
                    <td>${turnTags(t).map(x => `<span class="tag">${C.esc(x)}</span>`).join('') || '—'}</td>
                    <td class="num">${t.tokens ? C.fmtTokW(t.tokens, t.wTokens, C.weighMark(DATA.identity)) : '—'}</td>
                    <td class="num">${t.cost ? C.fmtUSD(t.cost) : '—'}</td>
                </tr>`).join('')}</tbody>
            </table></div>
        </details>`;
    }

    // ---- B3: what this session did to the code ----------------------------
    // The hunks are the session's OWN before/after text, straight from the
    // transcript — not a git diff, so a later session's work can never show up
    // as this one's. "vs HEAD" is offered separately and says so.
    const openFiles = new Set();      // files whose hunks are expanded
    const fileHunks = {};             // file -> records (fetched on demand)

    function fileBoxHtml() {
        const files = DATA.files || [];
        if (!files.length) { return ''; }
        const total = files.reduce((n, f) => n + f.edits, 0);
        const add = files.reduce((n, f) => n + f.added, 0);
        const rem = files.reduce((n, f) => n + f.removed, 0);
        return `<details id="filebox" class="turnbox"${filesOpen ? ' open' : ''}>
            <summary>Files changed — ${files.length} file(s) · ${total} write(s) · <span class="plus">+${add}</span> <span class="minus">−${rem}</span></summary>
            <div class="tablewrap"><table>
                <thead><tr><th></th><th>File</th><th class="num">writes</th><th class="num">+/−</th><th>turns</th><th></th></tr></thead>
                <tbody>${files.map(f => {
                    const open = openFiles.has(f.file);
                    const short = f.file.split(/[\\/]/).slice(-2).join('/');
                    return `<tr class="click" data-fileopen="${C.esc(f.file)}"
                        ${window.AFCtx.row('afViewerFile', { filePath: f.file, afOpen: open })}
                        title="${C.esc(window.AFCtx.hint(f.file))}">
                        <td><button class="only">${open ? '▾' : '▸'}</button></td>
                        <td>${C.esc(short)}${f.written ? ' <span class="tag">written</span>' : ''}${f.failed ? ` <span class="badge err" title="${f.failed} call(s) came back with an error — those changes did not happen">${f.failed} failed</span>` : ''}</td>
                        <td class="num">${f.edits}</td>
                        <td class="num"><span class="plus">+${f.added}</span> <span class="minus">−${f.removed}</span></td>
                        <td class="muted small">${f.turns.map(t => '#' + t).join(' ')}</td>
                        <td><button class="only" data-openfile="${C.esc(f.file)}" title="Open this file in the editor">open</button>
                            <button class="only" data-difffile="${C.esc(f.file)}" title="Diff the file on disk against git HEAD — this is what is uncommitted NOW, by anyone, not only this session">vs HEAD</button></td>
                    </tr>` + (open ? `<tr><td></td><td colspan="5">${hunksHtml(f.file)}</td></tr>` : '');
                }).join('')}</tbody>
            </table></div>
            <p class="footnote">These are the session's own edits, as it made them — the before/after text is read back from the transcript, so it stays true however the file has changed since. <b>vs HEAD</b> answers the other question: what is uncommitted in that file right now.</p>
        </details>`;
    }

    function hunksHtml(file) {
        const recs = fileHunks[file];
        if (!recs) { return '<span class="muted small">Loading changes…</span>'; }
        if (!recs.length) { return '<span class="muted small">No recorded hunks.</span>'; }
        return recs.map((r, i) => {
            const head = `<div class="hunkhead">${r.tool}${r.hunk ? ' #' + r.hunk : ''} · turn ${r.turn}${r.failed ? ' · <span class="badge err">failed — not applied</span>' : ''}${r.bytes !== undefined ? ` · ${r.bytes} chars written` : ''}${r.clipped ? ' · <span class="muted">(long — cut for display)</span>' : ''}</div>`;
            const side = (text, cls, sign) => text === undefined || text === ''
                ? ''
                : `<pre class="hunk ${cls}">${text.split('\n').map(l => sign + C.esc(l)).join('\n')}</pre>`;
            return `<div class="hunkbox" data-hunk="${i}"
                ${window.AFCtx.row('afDiffHunk', { filePath: file, hunkIndex: i, turnN: r.turn })}
                title="${C.esc(window.AFCtx.hint('Turn ' + r.turn + ' · ' + r.tool))}"
                >${head}${side(r.oldText, 'old', '−')}${side(r.newText, 'new', '+')}</div>`;
        }).join('');
    }

    // Breakdown popover for the "Context now" card, built from the transcript's last
    // /context run (DATA.contextReport). Always rendered: with no snapshot it explains
    // how to get one — a hidden feature the user can't discover helps nobody.
    // Shared tail of the popover: the Capture-now button + its status line.
    // Capture asks the host to run `claude --resume <sid> -p "/context"` (a local
    // command — no API cost) for a non-live session; for a live session the host
    // answers 'live' and the status line points at the terminal instead.
    function ctxCaptureHtml(label) {
        if ((DATA.engine || 'claude') !== 'claude') {
            return `<div class="ctxact muted small">${C.esc(window.AFEngine.label(DATA.engine))} does not publish Claude's <code>/context</code> category report. The Context card above uses the engine's own recorded token count.</div>`;
        }
        return `<div class="ctxact">
            <button id="ctxcap" data-label="${label}" title="Runs claude --resume <session> -p &quot;/context&quot; — a local command, no API cost">${label}</button>
            <span class="ctxstatus" id="ctxstatus"></span>
        </div>`;
    }

    function contextPopHtml(cr) {
        if (!cr || !(cr.categories || []).length) {
            return `<div class="ctxpop" id="ctxpop" hidden>
                <div class="ctxpop-hd"><span>Context breakdown</span></div>
                <div class="ctxpop-ft">No <code>/context</code> snapshot in this session yet.
                Capture one now — or run <code>/context</code> in the session's terminal;
                on a running session the card refreshes itself within seconds.</div>
                ${ctxCaptureHtml('⟳ Capture now')}
            </div>`;
        }
        const rows = cr.categories.map(c => {
            const isFree = /free space/i.test(c.label);
            const isBuf = /auto-?compact/i.test(c.label);
            const color = isFree ? 'var(--vscode-widget-border, #666)'
                : isBuf ? 'var(--vscode-editorWarning-foreground, #cca700)'
                    : 'var(--vscode-charts-blue, var(--vscode-textLink-foreground))';
            return `<div class="ctxrow">
                <span class="lbl">${C.esc(c.label)}</span>
                <span class="val">${c.tokens ? C.fmtTok(c.tokens) : '—'} · ${c.pct}%</span>
                <div class="bar"><span style="width:${Math.min(100, c.pct)}%;background:${color}"></span></div>
            </div>`;
        }).join('');
        const tot = cr.tokens
            ? `${C.fmtTok(cr.tokens)}${cr.limit ? ' / ' + C.fmtTok(cr.limit) : ''}${cr.pct ? ' · ' + cr.pct + '%' : ''}`
            : '';
        const when = cr.ts ? fmtTime(cr.ts) : '';
        return `<div class="ctxpop" id="ctxpop" hidden>
            <div class="ctxpop-hd"><span>Context breakdown</span><span class="tot">${tot}</span></div>
            ${rows}
            <div class="ctxpop-ft">/context snapshot${when ? ' · ' + when : ''}</div>
            ${ctxCaptureHtml('⟳ Refresh')}
        </div>`;
    }

    function openContextPop() {
        const pop = document.getElementById('ctxpop');
        if (pop && pop.hasAttribute('hidden')) { pop.removeAttribute('hidden'); }
        const g = document.getElementById('ctxglyph');
        if (g && g.classList) { g.classList.add('on'); }
    }

    // Host's answer to a Capture-now request. ok → fresh report, re-render with the
    // popover kept open. live → the safe path is the session's own terminal.
    function onCtxCaptureResult(d) {
        if (d.status === 'ok' && d.report) {
            DATA.contextReport = d.report;
            render({ keepScroll: true });
            openContextPop();
            return;
        }
        const st = document.getElementById('ctxstatus');
        if (st) {
            st.textContent = d.status === 'live'
                ? 'Session is live — type /context in its terminal; the card updates itself within seconds.'
                : 'Capture failed: ' + (d.error || 'unknown error');
        }
        const cap = document.getElementById('ctxcap');
        if (cap) { cap.disabled = false; cap.textContent = (cap.dataset && cap.dataset.label) || '⟳ Capture now'; }
    }

    function closeContextPop() {
        const pop = document.getElementById('ctxpop');
        if (pop && !pop.hasAttribute('hidden')) { pop.setAttribute('hidden', ''); }
        const g = document.getElementById('ctxglyph');
        if (g && g.classList) { g.classList.remove('on'); }
    }

    // The whole Context-now card toggles the breakdown popover; outside-click / Esc
    // close it. Clicks inside the OPEN popover must not toggle (it's a child of the
    // card). The document-level closers are attached once (a re-render rebuilds the
    // card, so a per-render document listener would leak) and look elements up live.
    function wireStepLegend() {
        const card = document.getElementById('actcard');
        if (!card) { return; }
        card.addEventListener('click', () => {
            const strip = document.getElementById('steplegend');
            if (!strip) { return; }
            legendOpen = strip.hasAttribute('hidden');
            if (legendOpen) { strip.removeAttribute('hidden'); } else { strip.setAttribute('hidden', ''); }
        });
    }

    function wireContextPop() {
        const card = document.getElementById('ctxcard');
        if (card) {
            card.addEventListener('click', ev => {
                const t = ev.target;
                if (t && t.closest && t.closest('#ctxpop')) { return; }
                if (ev.stopPropagation) { ev.stopPropagation(); }
                const pop = document.getElementById('ctxpop');
                if (!pop) { return; }
                if (pop.hasAttribute('hidden')) { openContextPop(); }
                else { closeContextPop(); }
            });
        }
        const cap = document.getElementById('ctxcap');
        if (cap) {
            cap.addEventListener('click', () => {
                cap.disabled = true;
                cap.textContent = 'Capturing…';
                const st = document.getElementById('ctxstatus');
                if (st) { st.textContent = ''; }
                vscode.postMessage({
                    type: 'ctxCapture', cwd: DATA.cwd,
                    model: (DATA.context || {}).model || ''
                });
            });
        }
        if (window.__afCtxWired || typeof document.addEventListener !== 'function') { return; }
        window.__afCtxWired = true;
        document.addEventListener('click', ev => {
            const pop = document.getElementById('ctxpop');
            if (!pop || pop.hasAttribute('hidden')) { return; }
            const t = ev.target;
            if (t && t.closest && t.closest('#ctxcard')) { return; }
            closeContextPop();
        });
        document.addEventListener('keydown', ev => { if (ev.key === 'Escape') { closeContextPop(); } });
    }

    /**
     * ‼️ THE STAR IS THE PAGE'S, NOT A ROW'S — and it is the SAME shelf.
     *
     * Pinning was reachable by right-clicking a session almost anywhere it is
     * listed, and on the one page that is about nothing but this session it was
     * neither visible nor settable: you could not even tell whether the session
     * you were reading was on your shelf. It reads its state from the marks
     * store (host: pinnedFor) and writes through the ONE pin command every
     * other surface uses, so the two can never disagree — and because that
     * command re-pushes every open page, the glyph here flips on the answer
     * rather than on the click.
     */
    function pinStarHtml() {
        const on = DATA.pinned === true;
        return `<button class="pinstar${on ? ' on' : ''}" id="pinstar" aria-pressed="${on}"
            title="${on
        ? 'On your shelf — pinned sessions are listed first everywhere and are never cut by a row limit. Click to take it off.'
        : 'Pin this session to your shelf: it is then listed first everywhere and never cut by a row limit.'}">${on ? '★' : '☆'}</button>`;
    }

    /**
     * The line under the title: what kind of run this was, where it ran, its
     * ID, and how it was permitted to work.
     *
     * ‼️ THE ID IS A BUTTON. It is the one string on this page that is
     * constantly wanted somewhere else — a `--resume`, a bridge call, a
     * message to another agent — and it was plain text you had to select by
     * hand without catching the separators around it. One click copies it, and
     * the word itself becomes the receipt (afTextTools.copyFrom), because a
     * copy leaves the screen otherwise identical.
     *
     * The origin also says WHICH mechanism started an automation run when the
     * farm's own record knows (a schedule, a task): "🤖 automation" and
     * "🤖 automation · schedule Backlog ilerleme" are different facts.
     */
    function subLineHtml() {
        // S-35 — 🌙 rides on the robot here too, and says the same thing the
        // Sessions tables' moon says: this run had no terminal and nobody at
        // it. It is drawn as a tagged glyph so the words beside it stay short.
        const moon = DATA.headless
            ? '<span title="Headless — this run had no terminal and nobody at the keyboard">🌙</span>' : '';
        const by = DATA.launchedBy && DATA.launchedBy.kind
            ? `🤖${moon} ${C.esc(DATA.launchedBy.kind)}${DATA.launchedBy.label ? ' · ' + C.esc(DATA.launchedBy.label) : ''}`
            : DATA.origin === 'auto' ? `🤖${moon} automation run` : '🧑 your session';
        const bits = [
            by,
            C.esc(DATA.cwd || ''),
            `<button class="idcopy" id="idcopy" data-copy="${C.esc(DATA.sessionId)}"
                title="Click to copy this session id">${C.esc(DATA.sessionId)}</button>`,
            // U-167 — the relay this run was a leg of: its id, ‹ › and first/last
            window.AFChainNav ? window.AFChainNav.html(DATA.chain) : '',
            DATA.permissionMode ? 'mode: ' + C.esc(DATA.permissionMode) : ''
        ];
        return bits.filter(Boolean).join(' · ');
    }

    /**
     * ‼️ X-110 — WHICH PROVIDER SERVED THIS RUN, in the shared mark.
     *
     * Drawn only when there is one to name: a run that took the engine's own
     * default has no route, and a grey placeholder saying so on every page
     * would be a control with no referent. The panel is the component's, so a
     * session's page and the row it was opened from cannot word the same fact
     * two ways — which is what happened to the three "why is there nothing to
     * show" sentences before they had one owner.
     */
    function providerChipHtml() {
        const I = DATA.identity;
        if (!I) { return ''; }
        const chip = window.AFProvider.chip(I);
        if (!chip) { return ''; }
        return window.AFTip.wrap(chip, window.AFProvider.title(I),
            window.AFTip.lines(window.AFProvider.tipLines(I)));
    }

    /** The labels this session carries, beside its name. Read-only here — they
     *  are set from a row's right-click menu, and one owner is the point. */
    function tagChipsHtml() {
        const tags = DATA.tags || [];
        if (!tags.length) { return ''; }
        return tags.map(t =>
            `<span class="htag" title="A label you put on this session — the tables' text filter searches these">${C.esc(t)}</span>`).join('');
    }

    function render(opts) {
        const keepScroll = opts && opts.keepScroll;
        const prevScroll = keepScroll ? { x: window.scrollX, y: window.scrollY } : null;
        const durMin = DATA.firstTs && DATA.lastTs ? Math.round((DATA.lastTs - DATA.firstTs) / 60000) : 0;
        const visible = visibleMsgs();
        const errorCount = DATA.messages.filter(m => m.isError).length;

        const ctx = DATA.context || { tokens: 0, limit: 0 };
        const ctxPct = ctx.limit > 0 && ctx.tokens > 0 ? Math.round(ctx.tokens / ctx.limit * 100) : 0;
        const ctxColor = ctxPct >= 90 ? 'var(--vscode-errorForeground)'
            : ctxPct >= 70 ? 'var(--vscode-editorWarning-foreground, #cca700)' : '';
        const ctxSub = ctx.tokens > 0
            ? (ctx.limit > 0
                ? `${ctxPct}% of ${C.fmtTok(ctx.limit)}${ctxPct >= 70 ? ' — consider /compact or /clear' : ''}`
                : 'last request (prompt+cache+output)')
            : 'no usage data';
        // ‼️ S-64 — WHETHER THIS RUN WAS TOLD. The gauge above says how full the
        // window got; on its own, a session that sat at 41% and kept working
        // reads as a run that ignored the law. It may never have heard it: an
        // engine whose hooks carry no channel is marked ✕ here, and that is a
        // fact about the wiring, not about the agent. Nothing is drawn while no
        // line has been crossed — silence is the honest state there.
        const sig = DATA.contextSignal;
        const sigHtml = sig && sig.chip
            ? window.AFTip.wrap(
                `<div class="sub ctxsigline ${sig.handedOver ? 'done' : sig.state === 'undelivered' ? 'bad' : sig.level === 'handover' ? 'stop' : ''}">`
                    + `${C.esc(sig.chip)}${sig.handedOver ? ' ✓ handed over' : ''}</div>`,
                `${sig.chip} — ${sig.state === 'undelivered' ? 'never reached this run' : 'delivered to this run'}`,
                window.AFTip.lines(sig.lines), '', 'data-aftip-mute="#ctxcard"')
            : '';
        // S-75 — the account's 5-hour window, a line of its own under the gauge.
        const qsig = sig && sig.quota;
        const qsigHtml = qsig && qsig.chip
            ? window.AFTip.wrap(
                `<div class="sub ctxsigline ${qsig.state === 'undelivered' ? 'bad' : qsig.level === 'handover' ? 'stop' : ''}">`
                    + `${C.esc(qsig.chip)}</div>`,
                qsig.head, window.AFTip.lines(qsig.lines), '', 'data-aftip-mute="#ctxcard"')
            : '';

        document.getElementById('app').innerHTML = `
            <style>
                /* sticky: keep replay controls reachable while messages stream past */
                .replaybar { display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin:10px 0;
                    padding:8px 10px; border:1px solid var(--vscode-panel-border); border-radius:6px;
                    position:sticky; top:6px; z-index:20;
                    background:var(--vscode-editor-background, var(--vscode-sideBar-background)); }
                .replaybar .muted { margin-left:auto; }
                /* Turn band: full-width, tinted and sticky — turn boundaries must stay
                   obvious while scrolling fast through a long transcript. */
                .turnhdr { display:flex; align-items:center; gap:10px; margin:26px 0 10px;
                    cursor:pointer;
                    padding:7px 12px; border-radius:4px; font-size:13px;
                    background:var(--vscode-editor-inactiveSelectionBackground, #3a3d41);
                    background:color-mix(in srgb, var(--vscode-textLink-foreground) 14%, var(--vscode-editor-background));
                    border-left:4px solid var(--vscode-textLink-foreground);
                    position:sticky; top:0; z-index:10; }
                .turnhdr .turnnum { font-weight:700; white-space:nowrap;
                    color:var(--vscode-textLink-foreground); }
                .turnhdr .turnlabel { flex:1; overflow:hidden; text-overflow:ellipsis;
                    white-space:nowrap; opacity:.9; }
                .turnhdr .turnstats { white-space:nowrap; font-size:11px;
                    color:var(--vscode-descriptionForeground); }
                /* Model / effort labels: rendered verbatim from the transcript. */
                .turnhdr .turntags, .turnbox .tag { white-space:nowrap; }
                .tag { font-size:10px; padding:1px 6px; margin-right:4px; border-radius:8px;
                    background:var(--vscode-badge-background); color:var(--vscode-badge-foreground);
                    opacity:.85; }
                .turnhdr .turnsel { display:flex; align-items:center; cursor:pointer; }
                .turnhdr .turnsel input { cursor:pointer; margin:0; }
                .turnhdr .turnnav { display:flex; gap:4px; }
                .turnhdr .tnav { font-size:11px; padding:0 7px; line-height:17px; cursor:pointer;
                    border-radius:3px; background:transparent; opacity:.7;
                    border:1px solid var(--vscode-widget-border, #4444);
                    color:var(--vscode-foreground); }
                .turnhdr .tnav:hover { opacity:1; }
                /* Accordion: folded turns keep only their band; stack them tighter
                   so collapse-all reads as a compact turn list. */
                .turnhdr .tcaret { flex:none; width:12px; text-align:center; font-size:10px; opacity:.75; }
                .turnhdr.closed { margin:8px 0; }
                .msg.tclosed { display:none; }
                .selrow { display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin:8px 0 2px; }
                .turnbox .selcell { white-space:nowrap; }
                .turnbox .only { font-size:10px; margin-left:6px; padding:0 6px; cursor:pointer;
                    border-radius:3px; background:transparent; opacity:.7;
                    border:1px solid var(--vscode-widget-border, #4444);
                    color:var(--vscode-foreground); }
                .turnbox .only:hover { opacity:1; }
                .turnbox { margin:10px 0; }
                .turnbox summary { font-size:12px; }
                .turnbox table { margin-top:6px; }
                .chiprow { display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin:8px 0; }
                .chip { font-size:11px; padding:2px 10px; border-radius:10px; cursor:pointer;
                    background:transparent; color:var(--vscode-foreground); opacity:.75;
                    border:1px solid var(--vscode-widget-border, #4444); }
                .chip.on { background:var(--vscode-button-background); color:var(--vscode-button-foreground);
                    border-color:transparent; opacity:1; }
                .searchbar .clearbtn { position:absolute; right:4px; top:50%; transform:translateY(-50%);
                    background:transparent; border:none; padding:2px 6px; cursor:pointer;
                    font-size:12px; line-height:1; color:var(--vscode-descriptionForeground); }
                .searchbar .clearbtn:hover { color:var(--vscode-foreground); }
                /* THE SHELF, on the session's own page. A session is pinnable from
                   six surfaces and this — the one page that is only ever about
                   this one session — was the one that neither showed the mark nor
                   let you set it. Bigger than the table's ★ on purpose: on a row
                   the star is one of eleven columns, here it is the page's own
                   subject and sits against the h1 at its size. */
                .pinstar { background:transparent; border:none; cursor:pointer; padding:0 8px 0 0;
                    font-size:.85em; line-height:1; vertical-align:baseline;
                    color:var(--vscode-foreground); opacity:.3; }
                .pinstar:hover { opacity:.75; }
                .pinstar.on { opacity:1; color:var(--vscode-charts-yellow, #d7ba7d); }
                /* The labels the same marks store carries — shown, not editable
                   here: one place owns setting them (the row's right-click). */
                .htag { font-size:10px; padding:1px 7px; margin-left:6px; border-radius:8px;
                    white-space:nowrap; vertical-align:middle; opacity:.8;
                    border:1px solid var(--vscode-widget-border, #4444); }
                /* The session id in the subtitle: a button that looks like the
                   text it replaced until you go near it. See subLineHtml. */
                .idcopy { background:none; border:none; padding:0; cursor:pointer;
                    font:inherit; color:inherit; opacity:.85; }
                .idcopy:hover { opacity:1; color:var(--vscode-textLink-foreground);
                    text-decoration:underline; }
                .idcopy.done { color:var(--vscode-charts-green, #4caf50); opacity:1;
                    text-decoration:none; }
                /* Timeline click-through: briefly spotlight the message we jumped to. */
                .msg.flash { outline:2px solid var(--vscode-textLink-foreground); outline-offset:2px; }
                /* Context-breakdown popover: overlays the "Context now" card without
                   reflowing the KPI row (card is position:relative, popover absolute).
                   The WHOLE card is the click target (small corner buttons were too
                   easy to miss); the ⛁ glyph is the always-visible affordance. */
                .actcard { cursor:help; }
                .actkey { display:inline-block; width:13px; height:13px; line-height:13px; text-align:center;
                    border-radius:50%; font-size:9px; opacity:.55; vertical-align:middle;
                    border:1px solid var(--vscode-descriptionForeground,#888); }
                .actcard:hover .actkey { opacity:1; }
                .ctxcard { position:relative; cursor:pointer; }
                .ctxglyph { position:absolute; top:9px; right:11px; z-index:2;
                    font-size:13px; line-height:1; opacity:.45; pointer-events:none;
                    color:var(--vscode-foreground); }
                .ctxcard:hover .ctxglyph { opacity:.9; }
                /* S-64: the discipline signal, under the gauge it belongs to. */
                .ctxsigline { font-weight:600; letter-spacing:.2px; margin-top:2px;
                    color:var(--vscode-editorWarning-foreground, #cca700); }
                .ctxsigline.stop, .ctxsigline.bad { color:var(--vscode-errorForeground, #f14c4c); }
                /* An order that was obeyed is not a warning any more — the loud
                   colours stay for the states somebody may still have to act on. */
                .ctxsigline.done { color:var(--vscode-descriptionForeground); font-weight:500; }
                .ctxglyph.on { opacity:1; color:var(--vscode-textLink-foreground); }
                .ctxpop { position:absolute; top:100%; right:0; margin-top:6px; z-index:50;
                    width:300px; max-width:80vw; padding:10px 12px; text-align:left;
                    background:var(--vscode-editorWidget-background, var(--vscode-editor-background));
                    border:1px solid var(--vscode-widget-border, #4444); border-radius:8px;
                    box-shadow:0 6px 22px rgba(0,0,0,.35); }
                .ctxpop[hidden] { display:none; }
                .ctxpop-hd { font-size:12px; font-weight:600; margin-bottom:8px;
                    display:flex; justify-content:space-between; gap:8px; align-items:baseline; }
                .ctxpop-hd .tot { font-weight:400; font-size:11px; opacity:.7; white-space:nowrap; }
                .ctxrow { display:grid; grid-template-columns:1fr auto; gap:1px 8px; margin:7px 0; align-items:baseline; }
                .ctxrow .lbl { font-size:12px; }
                .ctxrow .val { font-size:11px; opacity:.75; white-space:nowrap; }
                .ctxrow .bar { grid-column:1 / 3; height:5px; border-radius:3px; overflow:hidden;
                    background:var(--vscode-widget-border, #4443); }
                .ctxrow .bar > span { display:block; height:100%; border-radius:3px; }
                .ctxpop-ft { margin-top:10px; font-size:10px; opacity:.6; line-height:1.5; }
                .ctxpop-ft code { font-size:10px; }
                .ctxact { margin-top:8px; display:flex; gap:8px; align-items:center; }
                .ctxact button { font-size:11px; padding:2px 10px; cursor:pointer;
                    border-radius:4px; background:var(--vscode-button-secondaryBackground, transparent);
                    color:var(--vscode-button-secondaryForeground, var(--vscode-foreground));
                    border:1px solid var(--vscode-widget-border, #4444); }
                .ctxact button:hover:not(:disabled) { background:var(--vscode-button-secondaryHoverBackground, var(--vscode-list-hoverBackground)); }
                .ctxact button:disabled { opacity:.6; cursor:default; }
                .ctxstatus { font-size:10px; opacity:.75; line-height:1.4; }
                /* Files changed (B3): the session's own hunks, old above new. */
                .plus { color:var(--vscode-charts-green, #4caf50); }
                .minus { color:var(--vscode-charts-red, #f14c4c); }
                .hunkbox { margin:6px 0 12px; }
                .hunkhead { font-size:10px; opacity:.7; margin-bottom:3px; }
                .hunk { margin:0; padding:5px 8px; font-size:11px; line-height:1.45; overflow-x:auto;
                    border-radius:4px; white-space:pre; }
                .hunk.old { background:color-mix(in srgb, var(--vscode-charts-red, #f14c4c) 12%, transparent);
                    border-left:3px solid color-mix(in srgb, var(--vscode-charts-red, #f14c4c) 55%, transparent); }
                .hunk.new { background:color-mix(in srgb, var(--vscode-charts-green, #4caf50) 12%, transparent);
                    border-left:3px solid color-mix(in srgb, var(--vscode-charts-green, #4caf50) 55%, transparent);
                    margin-top:3px; }
            </style>
            ${window.AFHeader.html({
                page: 'viewer',
                // ‼️ U-26 — WHICH ENGINE, ON THE PAGE ITSELF. The table row it
                // was opened from says so at a glance; the page it opens then
                // dropped the fact entirely, so the one screen with room for it
                // was the one screen that did not answer "what ran this".
                // ‼️ X-110 — AND WHICH PROVIDER SERVED IT, beside the engine and
                // never inside it. The engine is the program; the provider is
                // what answered it, and this page — the one screen with room for
                // the whole story of a run — was reading a model name and
                // leaving the reader to guess the rest. Its own panel (ONE
                // SUBJECT): the declared route, who answered, how we know, and
                // which kind of nothing a blank is.
                title: pinStarHtml() + C.esc(DATA.title) + tagChipsHtml()
                    + window.AFEngine.badge(DATA.engine, window.AFTip.lines([
                        'Engine: ' + window.AFEngine.label(DATA.engine),
                        // ‼️ X-251 — WHOSE PLAN PAID, in the panel that already
                        // answers "what ran this" (ONE SUBJECT). Empty on a run that
                        // recorded no sign-in, and `lines` drops it: the file cannot
                        // name its owner on any engine — every slot's projects folder
                        // is a junction onto one shared root — so silence here means
                        // "nothing was recorded", never "this machine".
                        DATA.account ? 'Account: ' + DATA.account : '',
                        DATA.models && DATA.models.length ? 'Models: ' + DATA.models.join(', ') : '',
                        'Transcript: ' + (DATA.file ? 'on disk' : 'none this build can open')
                    ]))
                    + providerChipHtml(),
                sub: subLineHtml(),
                // The whole session action set, on the heading — the same menu
                // every table row carries (afSessionCtx.js).
                infoCtx: window.AFSessionCtx.row({
                    sessionId: DATA.sessionId, file: DATA.file, title: DATA.title,
                    agentName: DATA.agentName || '', cwd: DATA.cwd || ''
                }),
                // On a session's own page the Console nav button means "continue
                // THIS session there" — first item of its menu; the page itself
                // is the second, so one button carries both.
                navActions: {
                    console: {
                        label: 'Resume Session',
                        title: 'Console — resume this session, or open the page'
                    }
                },
                // ‼️ U-94 — KEEPING THE WHOLE CONVERSATION IS AN ACTION, NOT A
                // MENU ITEM. Every turn band below carries its own badge; the
                // one thing this page could not do without opening a right-click
                // menu was the commonest — keep the lot.
                actions: `${window.AFWiki ? window.AFWiki.badge({
        session: DATA.sessionId, whole: true, label: 'Wiki', cls: 'secondary',
        marks: DATA.wikiMarks || []
    }) : ''}<button id="resume">⏵ Resume</button>
                    <button class="secondary" id="renamesess" title="Give this session your own name — the same rename as the side panel's">✎ Rename</button>
                    <button class="secondary" id="focusterm" title="Jump to this session's terminal window (if one is open)">⌨ Terminal</button>
                    <button class="secondary" id="replaytoggle">${replay.active ? '✕ Exit replay' : '▶ Replay'}</button>
                    <button class="secondary" id="exportmd" title="Export to Markdown — asks whether to save the current view (filters/folding applied) or everything${exportOff.size ? ` · ${includedTurnCount()}/${(DATA.turns || []).length} turns currently shown` : ''}">⬇ Export MD</button>
                    <button class="secondary" id="raw">Open raw JSONL</button>${DATA.agentName ? `
                    <button class="secondary" id="agentpage" title="This session belongs to ${C.esc(DATA.agentName)} — open the agent page">⌂ ${C.esc(DATA.agentName)}</button>` : ''}`,
                searchTitle: 'Search inside this session (tool traffic too)',
                guide: 'oturum-goruntuleyici'
            })}
            <div class="row">
                <div class="card"><div class="label">Cost</div><div class="kpi">${C.fmtUSD(DATA.cost)}</div><div class="sub">${C.esc(((DATA.identity || {}).billing || {}).costIs || 'API-equivalent')}</div></div>
                <div class="card"><div class="label">Tokens</div><div class="kpi">${C.fmtTokW(DATA.totalTokens, DATA.totalWTokens, C.weighMark(DATA.identity))}</div>
                    <div class="sub">in ${C.fmtTok(DATA.usage.input)} · out ${C.fmtTok(DATA.usage.output)} · cacheR ${C.fmtTok(DATA.usage.cacheRead)} · cacheW ${C.fmtTok(DATA.usage.cacheWrite)}</div></div>
                <div class="card ctxcard" id="ctxcard" title="Click for the /context breakdown by category"><div class="label">Context now</div>
                    <div class="kpi"${ctxColor ? ` style="color:${ctxColor}"` : ''}>${ctx.tokens > 0 ? C.fmtTok(ctx.tokens) : '—'}</div>
                    <div class="sub"${ctxColor ? ` style="color:${ctxColor}"` : ''}>${ctxSub}</div>
                    ${sigHtml}${qsigHtml}
                    <span class="ctxglyph" id="ctxglyph">⛁</span>
                    ${contextPopHtml(DATA.contextReport)}</div>
                <div class="card"><div class="label">Span</div><div class="kpi">${durMin}m</div><div class="sub">${fmtTime(DATA.firstTs)} → ${fmtTime(DATA.lastTs)}</div></div>
                <div class="card actcard" id="actcard" title="${C.esc(C.stepKindLegendText())}"><div class="label">Activity <span class="actkey">?</span></div><div class="kpi">${DATA.toolCalls}</div><div class="sub">tool calls · ${DATA.errors} errors · ${C.esc((DATA.models || []).map(m => m.replace(/^claude-/, '')).join(', '))}</div></div>
            </div>
            <!-- ‼️ THE KEY TO THE STEP GLYPHS, TWICE OVER. Every row in the
                 conversation below carries a one-character chip saying what KIND
                 of step it is, and a glyph is only as good as the place you can
                 re-learn it. So the Activity card — the one that counts those
                 very steps — is the key: hover it for the whole scheme in words,
                 click it to pin the strip open under the cards. Folded by
                 default, because a legend you have already learned is clutter. -->
            <div class="steplegend" id="steplegend"${legendOpen ? '' : ' hidden'}>${C.stepKindLegend()}</div>
            ${fileBoxHtml()}
            ${turnBoxHtml()}
            ${replay.active ? `
            <div class="replaybar">
                <button id="rp-play">▶ Play</button>
                <button class="secondary" id="rp-restart">⏮</button>
                <button class="secondary" id="rp-back">−1</button>
                <button class="secondary" id="rp-fwd">+1</button>
                <select id="rp-speed">
                    ${[1, 2, 4, 8].map(s => `<option value="${s}"${s === replay.speed ? ' selected' : ''}>${s}x</option>`).join('')}
                </select>
                <button class="secondary" id="rp-nexterr" ${errorCount ? '' : 'disabled'}>next error ⚠</button>
                <button class="secondary" id="rp-nextprompt">next prompt 💬</button>
                <button class="secondary" id="rp-exit">✕ Exit</button>
                <span class="muted small" id="rp-pos">${Math.min(replay.pos + 1, replay.msgs.length)}/${replay.msgs.length}</span>
            </div>` : `
            <div class="searchbar" style="margin:14px 0 6px; position:relative">
                <input id="filter" type="text" placeholder="Filter messages… (text, tool name)" value="${C.esc(filter)}" style="padding-right:28px"
                    title="${C.esc(window.AFQuery.tip("Searched against each message's text, the tool it called and that tool's input."))}">
                <button id="filterclear" class="clearbtn" title="Clear filter" style="display:${filter ? '' : 'none'}">✕</button>
            </div>`}
            ${chipRowHtml()}
            ${turnCtlHtml()}
            ${DATA.truncatedCount ? `<p class="muted small">Showing last ${DATA.messages.length} of ${DATA.messageCount} messages (${DATA.truncatedCount} older hidden — raise <code>agentFarm.maxTranscriptMessages</code> to see more).</p>` : ''}
            <div id="msgs">${replay.active
                ? listHtml(replay.msgs.slice(0, replay.pos + 1))
                : (listHtml(visible) || emptyStateHtml())}</div>
        `;
        if (prevScroll) { window.scrollTo(prevScroll.x, prevScroll.y); }

        window.AFHeader.wire(vscode, {
            navActions: { console: { onClick: () => vscode.postMessage({ type: 'resumeConsole' }) } }
        });
        document.getElementById('raw').addEventListener('click', () => vscode.postMessage({ type: 'openRaw' }));
        wireContextPop();
        wireStepLegend();
        // ---- Files changed: fold a file open (hunks fetched once), open it,
        // or ask for the git comparison (a different question — see the box).
        document.querySelectorAll('[data-fileopen]').forEach(row =>
            row.addEventListener('click', ev => {
                if (ev.target && ev.target.dataset && (ev.target.dataset.openfile || ev.target.dataset.difffile)) { return; }
                const f = row.dataset.fileopen;
                if (openFiles.has(f)) { openFiles.delete(f); } else {
                    openFiles.add(f);
                    if (!fileHunks[f]) { vscode.postMessage({ type: 'sessionFileEdits', file: f }); }
                }
                render({ keepScroll: true });
            }));
        document.querySelectorAll('[data-openfile]').forEach(b =>
            b.addEventListener('click', ev => {
                ev.stopPropagation();
                vscode.postMessage({ type: 'openEditedFile', file: b.dataset.openfile, diff: false });
            }));
        document.querySelectorAll('[data-difffile]').forEach(b =>
            b.addEventListener('click', ev => {
                ev.stopPropagation();
                vscode.postMessage({ type: 'openEditedFile', file: b.dataset.difffile, diff: true });
            }));
        if (DATA.agentName) {
            const ab = document.getElementById('agentpage');
            if (ab) { ab.addEventListener('click', () => vscode.postMessage({ type: 'openAgent', cwd: DATA.cwd })); }
        }
        document.getElementById('focusterm').addEventListener('click', () =>
            vscode.postMessage({ type: 'focusTerminal', cwd: DATA.cwd }));
        document.getElementById('resume').addEventListener('click', () =>
            vscode.postMessage({ type: 'resume', cwd: DATA.cwd }));
        document.getElementById('renamesess').addEventListener('click', () =>
            vscode.postMessage({ type: 'renameSession' }));
        {
            // One click, and the glyph waits for the host: the pin command saves
            // the marks and re-pushes every open page, so drawing the new state
            // optimistically here would only be a second, earlier answer that
            // can be wrong.
            const star = document.getElementById('pinstar');
            if (star) {
                star.addEventListener('click', () =>
                    vscode.postMessage({ type: 'pinSession', pinned: !(DATA.pinned === true) }));
            }
            // The id in the subtitle: one click, one ✓, no round trip — the
            // clipboard path and the receipt are shared (afTextTools.copyFrom).
            const idb = document.getElementById('idcopy');
            if (idb) {
                idb.addEventListener('click', () =>
                    window.AFTextTools.copyFrom(idb, idb.dataset.copy || ''));
            }
            if (window.AFChainNav) { window.AFChainNav.wire(document.getElementById('app'), vscode); }
        }
        // Export MD asks first (current view vs everything, + folded-title choice
        // when turns are collapsed); the host asks, builds from the view sent
        // with the click, and files the document.
        document.getElementById('exportmd').addEventListener('click', () =>
            vscode.postMessage({ type: 'exportChoose', hasFolded: collapsed.size > 0, view: exportView(), cwd: DATA.cwd }));
        // Delegated: turn-band controls survive the filter box re-rendering #msgs.
        document.getElementById('msgs').addEventListener('change', ev => {
            const cb = ev.target && ev.target.closest ? ev.target.closest('input[data-turnsel]') : null;
            if (cb) { setTurnExport(Number(cb.dataset.turnsel), cb.checked); }
        });
        document.getElementById('msgs').addEventListener('click', ev => {
            const t = ev.target && ev.target.closest ? ev.target : null;
            if (!t) { return; }
            // ‼️ Delegated, like everything else on this element: a listener per
            // step would be thousands of them on a real transcript, re-attached
            // on every keystroke in the filter box.
            const cp = t.closest('button[data-copy]');
            if (cp) {
                ev.stopPropagation();          // not a band click
                const text = stepText(renderedMsgs()[Number(cp.dataset.copy)]);
                if (!text) { cp.textContent = '—'; setTimeout(() => { cp.textContent = '⧉'; }, 900); return; }
                // ‼️ The HOST holds the clipboard. `navigator.clipboard` works in
                // a webview but is permission-gated, and a copy button that
                // silently did nothing is worse than none — this way the ✓ is
                // only drawn once the write actually happened.
                vscode.postMessage({ type: 'copyStep', idx: Number(cp.dataset.copy), text });
                return;
            }
            const btn = t.closest('button[data-tnav]');
            if (btn) { jumpTurn(Number(btn.dataset.from), btn.dataset.tnav); return; }
            // band click = fold/unfold; the band's own controls (export checkbox,
            // jump arrows) must not also trigger the toggle
            const hdr = t.closest('.turnhdr[data-turn]');
            if (hdr && !t.closest('input,button,label')) { toggleTurn(Number(hdr.dataset.turn)); }
        });
        document.querySelectorAll('[data-guide]').forEach(el =>
            el.addEventListener('click', () => vscode.postMessage({ type: 'openGuide', anchor: el.dataset.guide })));

        const tExpand = document.getElementById('t-expandall');
        if (tExpand) {
            tExpand.addEventListener('click', () => { collapsed.clear(); render({ keepScroll: true }); });
            document.getElementById('t-collapseall').addEventListener('click', () => {
                (DATA.turns || []).forEach(t => collapsed.add(t.n));
                render({ keepScroll: true });
            });
            document.getElementById('t-singleopen').addEventListener('click', () => {
                singleOpen = !singleOpen;
                if (singleOpen) {
                    // entering the mode: keep only the first currently-open turn open
                    (DATA.turns || []).filter(t => !collapsed.has(t.n)).slice(1)
                        .forEach(t => collapsed.add(t.n));
                }
                keepState({ singleOpen });
                render({ keepScroll: true });
            });
        }

        const filebox = document.getElementById('filebox');
        if (filebox) {
            filebox.addEventListener('toggle', () => {
                filesOpen = filebox.open;
                keepState({ filesOpen });
            });
        }

        const turnbox = document.getElementById('turnbox');
        if (turnbox) {
            turnbox.addEventListener('toggle', () => { turnsOpen = turnbox.open; });
            turnbox.querySelectorAll('tr[data-turn]').forEach(tr => tr.addEventListener('click', ev => {
                // selection controls inside the row must not also trigger the jump
                if (ev.target && ev.target.closest && ev.target.closest('input,button')) { return; }
                const n = Number(tr.dataset.turn);
                if (replay.active) {
                    stopTimer();
                    const i = replay.msgs.findIndex(m => m.turn === n);
                    if (i >= 0) { replay.pos = i; renderReplayList(); }
                } else {
                    scrollToTurn(n);
                }
            }));
            turnbox.addEventListener('change', ev => {
                const cb = ev.target && ev.target.closest ? ev.target.closest('input[data-turnsel]') : null;
                if (cb) { setTurnExport(Number(cb.dataset.turnsel), cb.checked); }
            });
            turnbox.querySelectorAll('button[data-only]').forEach(b => b.addEventListener('click', () => {
                (DATA.turns || []).forEach(t => exportOff.add(t.n));
                exportOff.delete(Number(b.dataset.only));
                render({ keepScroll: true });
            }));
            turnbox.querySelectorAll('button[data-selact]').forEach(b => b.addEventListener('click', () => {
                const turns = DATA.turns || [];
                if (b.dataset.selact === 'all') { exportOff.clear(); }
                else if (b.dataset.selact === 'none') { turns.forEach(t => exportOff.add(t.n)); }
                else { turns.forEach(t => { if (exportOff.has(t.n)) { exportOff.delete(t.n); } else { exportOff.add(t.n); } }); }
                render({ keepScroll: true });
            }));
        }

        // role chips work in both modes; in replay they rebuild the playback list
        const applyRoleChange = () => {
            if (replay.active) {
                stopTimer();
                replay.msgs = visibleMsgs();
                replay.pos = Math.min(replay.pos, Math.max(0, replay.msgs.length - 1));
            }
            render({ keepScroll: true });
        };
        // only the role chips — .chip is also worn by the turnbox All/None/Invert
        // buttons and the turn accordion controls, which have their own handlers
        // (a bare '.chip' here used to push `undefined` into roleSel and blank the list)
        document.querySelectorAll('.chip[data-chip],.chip[data-preset]').forEach(chip => chip.addEventListener('click', () => {
            if (chip.dataset.preset === 'all') { roleSel = new Set(); }
            else if (chip.dataset.preset === 'dialog') { roleSel = new Set(['user', 'assistant']); }
            else {
                const id = chip.dataset.chip;
                if (roleSel.has(id)) { roleSel.delete(id); } else { roleSel.add(id); }
            }
            applyRoleChange();
        }));

        document.getElementById('replaytoggle').addEventListener('click', () => {
            if (replay.active) { exitReplay(); return; }
            stopTimer();
            replay.active = true;
            replay.msgs = visibleMsgs();
            replay.pos = 0;
            render();
        });

        if (replay.active) {
            document.getElementById('rp-play').addEventListener('click', () => {
                if (replay.playing) { stopTimer(); } else { replay.playing = true; scheduleNext(); }
                updateReplayUi();
            });
            document.getElementById('rp-restart').addEventListener('click', () => {
                stopTimer(); replay.pos = 0; renderReplayList();
            });
            document.getElementById('rp-back').addEventListener('click', () => {
                stopTimer(); replay.pos = Math.max(0, replay.pos - 1); renderReplayList();
            });
            document.getElementById('rp-fwd').addEventListener('click', () => {
                stopTimer(); replay.pos = Math.min(replay.msgs.length - 1, replay.pos + 1); renderReplayList();
            });
            document.getElementById('rp-speed').addEventListener('change', e => {
                replay.speed = Number(e.target.value) || 2;
            });
            document.getElementById('rp-nexterr').addEventListener('click', () => {
                stopTimer(); jumpTo(m => m.isError, replay.pos);
            });
            document.getElementById('rp-nextprompt').addEventListener('click', () => {
                stopTimer(); jumpTo(m => m.role === 'user', replay.pos);
            });
            document.getElementById('rp-exit').addEventListener('click', exitReplay);
            updateReplayUi();
        } else {
            const input = document.getElementById('filter');
            const clear = document.getElementById('filterclear');
            const applyFilter = () => {
                // RAW, never pre-lowercased: the grammar decides its own case
                // handling and a lowercased string only breaks what it offers.
                filter = input.value;
                clear.style.display = filter ? '' : 'none';
                const msgs = document.getElementById('msgs');
                msgs.innerHTML = listHtml(visibleMsgs()) || emptyStateHtml();
            };
            input.addEventListener('input', applyFilter);
            clear.addEventListener('click', () => { input.value = ''; applyFilter(); input.focus(); });
        }
    }

    // ------------------------------------------------------- right-click menu

    /**
     * Everything a right-click can ask for on the four objects this page draws:
     * a turn, a step, a changed file, one hunk of a change.
     *
     * Each branch runs the page's own path — the export checkbox, the fold, the
     * "only" button, the file open, the git diff — so the menu and the control
     * beside it cannot mean different things. What it adds is reach: the export
     * selection from the transcript itself (the "only" button lived in the
     * breakdown table alone), a step's file, and the hunks as text.
     *
     * ‼️ The HOST holds the clipboard for step and hunk text, exactly as the ⧉
     * button does: `navigator.clipboard` is permission-gated in a webview and a
     * copy that silently did nothing is worse than none.
     */
    function ctxDo(act, ctx) {
        const verb = act.split(':')[0];
        const arg = act.slice(verb.length + 1);
        const n = Number(ctx.turnN);
        const copyHost = (text) => {
            if (!text) { window.AFCtx.toast('There is nothing there to copy.', true); return; }
            vscode.postMessage({ type: 'copyStep', idx: -1, text: text });
        };
        const turnMsgs = () => (DATA.messages || []).filter(m => m.turn === n);

        switch (verb) {
            // ---- a turn ----
            case 'vtFold':
                if (arg === '1') { collapsed.add(n); } else { expandTurn(n); }
                render({ keepScroll: true });
                return;
            case 'vtOnly':
                (DATA.turns || []).forEach(t => collapsed.add(t.n));
                expandTurn(n);
                render({ keepScroll: true });
                return;
            case 'vtJump': scrollToTurn(n); return;
            // K-26 — the same popover the band's 🔖 opens, anchored on the band
            // the menu was opened over so the answer appears where the question
            // was asked.
            case 'vtWiki':
                window.AFWiki.open({
                    el: document.querySelector(`.turnhdr[data-turn="${n}"]`),
                    session: DATA.sessionId, turn: n,
                    text: (turnInfo(n) || {}).label || ''
                });
                return;
            case 'vtExport':
                if (arg === 'only') {
                    (DATA.turns || []).forEach(t => exportOff.add(t.n));
                    exportOff.delete(n);
                    render({ keepScroll: true });
                } else {
                    setTurnExport(n, arg === '1');
                }
                return;
            case 'vtCopy': {
                const msgs = turnMsgs();
                const pick = arg === 'prompt' ? msgs.filter(m => m.role === 'user')
                    : arg === 'answer' ? msgs.filter(m => m.role === 'assistant')
                        : msgs;
                copyHost(pick.map(stepText).filter(Boolean).join('\n\n'));
                return;
            }

            // ---- one step ----
            case 'vsFile':
                if (ctx.stepFile) {
                    vscode.postMessage({ type: 'openEditedFile', file: String(ctx.stepFile), diff: false });
                }
                return;
            // "Only this kind" speaks the role chips' own vocabulary, so the
            // chip row above lights up to match — the filter is one state, not
            // two that agree by accident.
            case 'vsOnly':
                roleSel = new Set([String(ctx.stepRole || 'user')]);
                if (replay.active) {
                    stopTimer();
                    replay.msgs = visibleMsgs();
                    replay.pos = Math.min(replay.pos, Math.max(0, replay.msgs.length - 1));
                }
                render({ keepScroll: true });
                return;
            case 'vsCopy': {
                const m = renderedMsgs()[Number(ctx.stepIdx)];
                if (!m) { copyHost(''); return; }
                copyHost(arg === 'tool' ? String(m.input || '')
                    : arg === 'result' ? String(m.role === 'toolResult' ? (m.text || '') : '')
                        : stepText(m));
                return;
            }

            // ---- a changed file, and one hunk of it ----
            case 'vfOpen':
                vscode.postMessage({ type: 'openEditedFile', file: String(ctx.filePath || ''), diff: false });
                return;
            case 'vfDiff':
                vscode.postMessage({ type: 'openEditedFile', file: String(ctx.filePath || ''), diff: true });
                return;
            case 'vfReveal':
                vscode.postMessage({ type: 'revealFile', file: String(ctx.filePath || '') });
                return;
            case 'vfHunks': {
                const f = String(ctx.filePath || '');
                if (openFiles.has(f)) { openFiles.delete(f); }
                else {
                    openFiles.add(f);
                    if (!fileHunks[f]) { vscode.postMessage({ type: 'sessionFileEdits', file: f }); }
                }
                filesOpen = true;
                keepState({ filesOpen });
                render({ keepScroll: true });
                return;
            }
            case 'vfCopy': window.AFCtx.copy(ctx.filePath); return;
            case 'dhOpen':
                vscode.postMessage({ type: 'openEditedFile', file: String(ctx.filePath || ''), diff: false });
                return;
            case 'dhCopy': {
                const recs = fileHunks[String(ctx.filePath || '')] || [];
                const r = recs[Number(ctx.hunkIndex)];
                copyHost(r ? String((arg === 'old' ? r.oldText : r.newText) || '') : '');
                return;
            }
        }
    }

    // ‼️ ONCE, at module scope — render() runs on every fold, filter and replay
    // step, and a listener added there would multiply with them.
    window.AFCtx.listen(ctxDo);
    // K-26 — the badge on every turn band. The fresh mark list is written back
    // into DATA so the next repaint (a fold, a filter, a live push) still draws
    // it green; the surface owns what it paints, the component owns the panel.
    window.AFWiki.init(vscode, (session, marks) => {
        if (session !== DATA.sessionId) { return; }
        DATA.wikiMarks = marks;
        render({ keepScroll: true });
    });
    window.AFWiki.wire();

    if (DATA.resetView) {
        filter = '';
        roleSel = new Set(['user', 'assistant']);
        singleOpen = true;
        keepState({ singleOpen: true });
    }
    foldNewTurns();
    render();
    if (DATA.resetView) { window.scrollTo(0, 0); }
    else if (DATA.focusTs) { focusAt(DATA.focusTs); }
})();
