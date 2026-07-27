// Agent Farm — session transcript viewer page script (with G4 replay mode).
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    let DATA = window.__DATA__;
    let filter = '';
    let turnsOpen = false;
    // Files changed: open on first sight (it is the answer to "what did this
    // session DO"), but a box you closed must stay closed — every live update
    // re-renders the page, and re-opening it each time was a bug, not a policy.
    let filesOpen = true;
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
    // Turns unticked in their band are left out of Export MD (default: all included).
    const exportOff = new Set();
    // Accordion: collapsed turns show only their band (session-local, display-only —
    // export/filters ignore it). A transcript OPENS fully folded and in single-open
    // mode: a session is read turn by turn, and landing on a wall of text buries the
    // turn list that is the real map of the session. Anything that jumps to a turn
    // (deep link, ↑↓, breakdown row) unfolds its target, so nothing is out of reach.
    const collapsed = new Set();
    // Turn numbers already folded once — a live session's NEW turns arrive folded
    // too, but a turn the user opened by hand is never re-folded behind their back.
    const foldedOnce = new Set();
    const savedState = (typeof vscode.getState === 'function' && vscode.getState()) || {};
    let singleOpen = savedState.singleOpen !== undefined ? !!savedState.singleOpen : true;
    let turnCounts = null; // per-turn message counts, rebuilt when DATA changes

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
        if (ev.data.type === 'focus') { focusAt(ev.data.ts); return; }
        if (ev.data.type === 'ctxCapture') { onCtxCaptureResult(ev.data); return; }
        if (ev.data.type === 'sessionFileEdits') {
            fileHunks[ev.data.file] = ev.data.records || [];
            render({ keepScroll: true });
            return;
        }
        if (ev.data.type === 'exportBuild') {
            // host answered the Export MD prompt — build with the chosen options
            vscode.postMessage({
                type: 'exportMd',
                md: exportMarkdown({ view: ev.data.view, foldedTitles: ev.data.foldedTitles }),
                cwd: DATA.cwd
            });
            return;
        }
        if (ev.data.type !== 'data') { return; }
        DATA = ev.data.data;
        turnCounts = null;
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
        return ts ? new Date(ts).toLocaleString() : '—';
    }

    function matchesRole(m) {
        if (!roleSel.size) { return true; }
        return ROLE_CHIPS.some(c => roleSel.has(c.id) && c.match(m));
    }

    function matchesText(m) {
        if (!filter) { return true; }
        const hay = ((m.text || '') + ' ' + (m.tool || '') + ' ' + (m.input || '')).toLowerCase();
        return hay.includes(filter);
    }

    function visibleMsgs() {
        return DATA.messages.filter(m => matchesRole(m) && matchesText(m));
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

    function turnMsgCount(n) {
        if (!turnCounts) {
            turnCounts = {};
            (DATA.messages || []).forEach(m => { if (m.turn) { turnCounts[m.turn] = (turnCounts[m.turn] || 0) + 1; } });
        }
        return turnCounts[n] || 0;
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

    function turnHdrHtml(m) {
        if (!m.turnStart || !m.turn) { return ''; }
        const t = (DATA.turnTotals || {})[m.turn];
        const total = t && (t.tokens || t.cost)
            ? `${C.fmtTok(t.tokens)} tok · ${C.fmtUSD(t.cost)}`
            : '';
        const info = turnInfo(m.turn);
        const closed = collapsed.has(m.turn);
        return `<div class="turnhdr${closed ? ' closed' : ''}" data-turn="${m.turn}" title="Click to ${closed ? 'expand' : 'collapse'} this turn">
            <span class="tcaret">${closed ? '▸' : '▾'}</span>
            <label class="turnsel" title="Include this turn in Export MD">
                <input type="checkbox" data-turnsel="${m.turn}"${exportOff.has(m.turn) ? '' : ' checked'}></label>
            <span class="turnnum">Turn ${m.turn}/${DATA.turnCount || '?'}</span>
            <span class="turnlabel">${C.esc((info && info.label) || '')}</span>
            <span class="turntags">${turnTags(info).map(t => `<span class="tag">${C.esc(t)}</span>`).join('')}</span>
            <span class="turnstats">${closed ? `${turnMsgCount(m.turn)} msgs${total ? ' · ' : ''}` : ''}${total}</span>
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
        let target = null, bestDist = Infinity;
        (DATA.messages || []).forEach(m => {
            if (!m.ts) { return; }
            const d = Math.abs(m.ts - ts);
            if (d < bestDist) { bestDist = d; target = m; }
        });
        if (!target) { return; }
        if (!matchesRole(target) || !matchesText(target)) {
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

    function listHtml(msgs) {
        return msgs.map((m, i) => turnHdrHtml(m) + messageHtml(m, i)).join('');
    }

    // The chips' glyphs, repeated on the messages themselves: a long transcript
    // is scanned by these marks long before the words are read.
    const ROLE_GLYPH = { user: '🧑', assistant: '🤖', tool: '🔧', toolResult: '📄' };

    function messageHtml(m, idx) {
        const roleLabel = (ROLE_GLYPH[m.role] ? ROLE_GLYPH[m.role] + ' ' : '') + (m.role === 'assistant'
            ? C.aiLabel(m.model, true)
            : { user: 'USER', tool: 'TOOL CALL', toolResult: 'TOOL RESULT', system: 'SYSTEM' }[m.role]);
        const hide = m.turn && collapsed.has(m.turn) ? ' tclosed' : '';
        const cls = m.role + (m.isError ? ' error' : '') + hide;
        const meta = [
            roleLabel + (m.tool ? ` · ${C.esc(m.tool)}` : ''),
            m.ts ? new Date(m.ts).toLocaleTimeString() : '',
            m.model ? C.esc(m.model.replace(/^claude-/, '')) : '',
            m.tokens ? C.fmtTok(m.tokens) + ' tok' : '',
            m.cost ? C.fmtUSD(m.cost) : '',
            m.sidechain ? 'subagent' : '',
            m.isError ? 'ERROR' : ''
        ].filter(Boolean).join(' · ');

        if (m.role === 'tool') {
            return `<div class="msg tool${hide}" data-idx="${idx}"><div class="meta">${meta}</div>
                <details><summary>input</summary><pre>${C.esc(m.input || '')}</pre></details></div>`;
        }
        if (m.role === 'toolResult') {
            const body = C.esc(m.text || '(empty result)');
            return `<div class="msg ${cls}" data-idx="${idx}"><div class="meta">${meta}</div>
                <details${m.isError ? ' open' : ''}><summary>result</summary><pre>${body}</pre></details></div>`;
        }
        return `<div class="msg ${cls}" data-idx="${idx}"><div class="meta">${meta}</div><div class="body">${C.esc(m.text || '')}</div></div>`;
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
    // opts.view (default true): honor the on-screen state — role/text filters,
    //   replay position, the turn checkboxes AND the fold accordion. When false,
    //   export the full transcript, nothing applied.
    // opts.foldedTitles (default false, only meaningful with view): a collapsed
    //   turn contributes just its "## Turn N" header, not its body.

    function mdFence(s) {
        return s.includes('```') ? '````' : '```';
    }

    function exportMarkdown(opts) {
        opts = opts || {};
        const view = opts.view !== false;
        const foldedTitles = !!opts.foldedTitles;
        // Each entry: the message + whether only its turn header should render
        // (a collapsed turn kept for its title). rows drive the loop below.
        const rows = [];
        if (!view) {
            for (const m of DATA.messages) { rows.push({ m, headerOnly: false }); }
        } else {
            const source = replay.active ? replay.msgs.slice(0, replay.pos + 1) : visibleMsgs();
            for (const m of source) {
                if (m.turn && exportOff.has(m.turn)) { continue; }
                if (m.turn && collapsed.has(m.turn)) {
                    // folded turn: title only (once, on its opening message) or gone
                    if (foldedTitles && m.turnStart) { rows.push({ m, headerOnly: true }); }
                    continue;
                }
                rows.push({ m, headerOnly: false });
            }
        }
        const lines = [`# ${DATA.title}`, ''];
        lines.push(`- Session: \`${DATA.sessionId}\``);
        if (DATA.cwd) { lines.push(`- Folder: \`${DATA.cwd}\``); }
        lines.push(`- Span: ${fmtTime(DATA.firstTs)} → ${fmtTime(DATA.lastTs)}`);
        lines.push(`- Total: ${C.fmtTok(DATA.totalTokens)} tok · ${C.fmtUSD(DATA.cost)} · ${DATA.turnCount || 0} turns · ${DATA.toolCalls} tool calls`);
        if (!view) {
            lines.push(`- Export: everything — the full transcript (${DATA.messages.length} messages), ignoring the on-screen filters and folding`);
        } else {
            const v = [];
            if (roleSel.size) { v.push('show: ' + [...roleSel].join(', ')); }
            if (filter) { v.push(`text filter: "${filter}"`); }
            if (exportOff.size) { v.push(`excluded turns: ${[...exportOff].sort((a, b) => a - b).join(', ')}`); }
            if (collapsed.size) { v.push(foldedTitles ? `${collapsed.size} folded turn(s): titles only` : `${collapsed.size} folded turn(s) omitted`); }
            if (replay.active) { v.push(`replay position: ${replay.pos + 1}/${replay.msgs.length}`); }
            const shownCount = rows.filter(r => !r.headerOnly).length;
            v.push(`${shownCount} of ${DATA.messages.length} messages`);
            lines.push(`- Export: current view · ${v.join(' · ')}`);
        }
        lines.push('', '---');
        for (const row of rows) {
            const m = row.m;
            if (m.turnStart && m.turn) {
                const t = (DATA.turnTotals || {})[m.turn];
                const info = turnInfo(m.turn);
                const tags = turnTags(info);
                const stats = (tags.length ? ` · ${tags.join(' · ')}` : '') +
                    (t && (t.tokens || t.cost) ? ` · ${C.fmtTok(t.tokens)} tok · ${C.fmtUSD(t.cost)}` : '');
                lines.push('', `## Turn ${m.turn}/${DATA.turnCount || '?'}${info && info.label ? ' — ' + info.label : ''}${stats}`);
            }
            if (row.headerOnly) { continue; } // folded turn: title only, skip body
            const bits = [
                m.ts ? new Date(m.ts).toLocaleTimeString() : '',
                m.model ? m.model.replace(/^claude-/, '') : '',
                m.tokens ? C.fmtTok(m.tokens) + ' tok' : '',
                m.cost ? C.fmtUSD(m.cost) : '',
                m.sidechain ? 'subagent' : '',
                m.isError ? '⚠ ERROR' : ''
            ].filter(Boolean).join(' · ');
            if (m.role === 'tool') {
                const f = mdFence(m.input || '');
                lines.push('', `**TOOL CALL — ${m.tool || '?'}**${bits ? ' (' + bits + ')' : ''}`, '', f + 'json', m.input || '', f);
            } else if (m.role === 'toolResult') {
                const f = mdFence(m.text || '');
                lines.push('', `**TOOL RESULT**${bits ? ' (' + bits + ')' : ''}`, '', f, m.text || '(empty result)', f);
            } else {
                const roleLabel = m.role === 'assistant'
                    ? C.aiLabel(m.model, true)
                    : ({ user: 'USER', system: 'SYSTEM' }[m.role] || m.role.toUpperCase());
                lines.push('', `**${roleLabel}**${bits ? ' (' + bits + ')' : ''}`, '', m.text || '');
            }
        }
        lines.push('');
        return lines.join('\n');
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
                <tbody>${turns.map(t => `<tr class="click" data-turn="${t.n}">
                    <td class="selcell"><input type="checkbox" data-turnsel="${t.n}"${exportOff.has(t.n) ? '' : ' checked'} title="Include in Export MD"><button class="only" data-only="${t.n}" title="Export only this turn">only</button></td>
                    <td>${t.n}</td><td>${C.esc(t.label || '—')}</td>
                    <td>${turnTags(t).map(x => `<span class="tag">${C.esc(x)}</span>`).join('') || '—'}</td>
                    <td class="num">${t.tokens ? C.fmtTok(t.tokens) : '—'}</td>
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
                    return `<tr class="click" data-fileopen="${C.esc(f.file)}" title="${C.esc(f.file)}">
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
            return `<div class="hunkbox" data-hunk="${i}">${head}${side(r.oldText, 'old', '−')}${side(r.newText, 'new', '+')}</div>`;
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
                /* Timeline click-through: briefly spotlight the message we jumped to. */
                .msg.flash { outline:2px solid var(--vscode-textLink-foreground); outline-offset:2px; }
                /* Context-breakdown popover: overlays the "Context now" card without
                   reflowing the KPI row (card is position:relative, popover absolute).
                   The WHOLE card is the click target (small corner buttons were too
                   easy to miss); the ⛁ glyph is the always-visible affordance. */
                .ctxcard { position:relative; cursor:pointer; }
                .ctxglyph { position:absolute; top:9px; right:11px; z-index:2;
                    font-size:13px; line-height:1; opacity:.45; pointer-events:none;
                    color:var(--vscode-foreground); }
                .ctxcard:hover .ctxglyph { opacity:.9; }
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
                title: C.esc(DATA.title),
                sub: `${DATA.origin === 'auto' ? '🤖 automation run' : '🧑 your session'} · ${C.esc(DATA.cwd || '')} · ${C.esc(DATA.sessionId)} · ${DATA.permissionMode ? 'mode: ' + C.esc(DATA.permissionMode) : ''}`,
                // On a session's own page the Console nav button means "continue
                // THIS session there" (the ↗ beside it still opens the page).
                navActions: {
                    console: {
                        label: '💬 Resume in Console',
                        title: 'Pick this conversation back up inside the panel instead of a terminal'
                    }
                },
                actions: `<button id="resume">⏵ Resume</button>
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
                <div class="card"><div class="label">Cost</div><div class="kpi">${C.fmtUSD(DATA.cost)}</div><div class="sub">API-equivalent</div></div>
                <div class="card"><div class="label">Tokens</div><div class="kpi">${C.fmtTok(DATA.totalTokens)}</div>
                    <div class="sub">in ${C.fmtTok(DATA.usage.input)} · out ${C.fmtTok(DATA.usage.output)} · cacheR ${C.fmtTok(DATA.usage.cacheRead)} · cacheW ${C.fmtTok(DATA.usage.cacheWrite)}</div></div>
                <div class="card ctxcard" id="ctxcard" title="Click for the /context breakdown by category"><div class="label">Context now</div>
                    <div class="kpi"${ctxColor ? ` style="color:${ctxColor}"` : ''}>${ctx.tokens > 0 ? C.fmtTok(ctx.tokens) : '—'}</div>
                    <div class="sub"${ctxColor ? ` style="color:${ctxColor}"` : ''}>${ctxSub}</div>
                    <span class="ctxglyph" id="ctxglyph">⛁</span>
                    ${contextPopHtml(DATA.contextReport)}</div>
                <div class="card"><div class="label">Span</div><div class="kpi">${durMin}m</div><div class="sub">${fmtTime(DATA.firstTs)} → ${fmtTime(DATA.lastTs)}</div></div>
                <div class="card"><div class="label">Activity</div><div class="kpi">${DATA.toolCalls}</div><div class="sub">tool calls · ${DATA.errors} errors · ${C.esc((DATA.models || []).map(m => m.replace(/^claude-/, '')).join(', '))}</div></div>
            </div>
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
                <input id="filter" type="text" placeholder="Filter messages… (text, tool name)" value="${C.esc(filter)}" style="padding-right:28px">
                <button id="filterclear" class="clearbtn" title="Clear filter" style="display:${filter ? '' : 'none'}">✕</button>
            </div>`}
            ${chipRowHtml()}
            ${turnCtlHtml()}
            ${DATA.truncatedCount ? `<p class="muted small">Showing last ${DATA.messages.length} of ${DATA.messageCount} messages (${DATA.truncatedCount} older hidden — raise <code>agentFarm.maxTranscriptMessages</code> to see more).</p>` : ''}
            <div id="msgs">${replay.active
                ? listHtml(replay.msgs.slice(0, replay.pos + 1))
                : (listHtml(visible) || '<p class="muted">No messages match.</p>')}</div>
        `;
        if (prevScroll) { window.scrollTo(prevScroll.x, prevScroll.y); }

        window.AFHeader.wire(vscode, {
            navActions: { console: { onClick: () => vscode.postMessage({ type: 'resumeConsole' }) } }
        });
        document.getElementById('raw').addEventListener('click', () => vscode.postMessage({ type: 'openRaw' }));
        wireContextPop();
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
        // Export MD asks first (current view vs everything, + folded-title choice
        // when turns are collapsed); the host replies with 'exportBuild' carrying
        // the picked options, and we build the markdown then.
        document.getElementById('exportmd').addEventListener('click', () =>
            vscode.postMessage({ type: 'exportChoose', hasFolded: collapsed.size > 0 }));
        // Delegated: turn-band controls survive the filter box re-rendering #msgs.
        document.getElementById('msgs').addEventListener('change', ev => {
            const cb = ev.target && ev.target.closest ? ev.target.closest('input[data-turnsel]') : null;
            if (cb) { setTurnExport(Number(cb.dataset.turnsel), cb.checked); }
        });
        document.getElementById('msgs').addEventListener('click', ev => {
            const t = ev.target && ev.target.closest ? ev.target : null;
            if (!t) { return; }
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
                if (typeof vscode.setState === 'function') {
                    const st = (typeof vscode.getState === 'function' && vscode.getState()) || {};
                    vscode.setState(Object.assign({}, st, { singleOpen }));
                }
                render({ keepScroll: true });
            });
        }

        const filebox = document.getElementById('filebox');
        if (filebox) { filebox.addEventListener('toggle', () => { filesOpen = filebox.open; }); }

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
                filter = input.value.toLowerCase();
                clear.style.display = filter ? '' : 'none';
                const msgs = document.getElementById('msgs');
                msgs.innerHTML = listHtml(visibleMsgs()) || '<p class="muted">No messages match.</p>';
            };
            input.addEventListener('input', applyFilter);
            clear.addEventListener('click', () => { input.value = ''; applyFilter(); input.focus(); });
        }
    }

    foldNewTurns();
    render();
    if (DATA.focusTs) { focusAt(DATA.focusTs); }
})();
