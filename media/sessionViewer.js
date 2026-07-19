// Agent Farm — session transcript viewer page script (with G4 replay mode).
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    let DATA = window.__DATA__;
    let filter = '';
    let turnsOpen = false;
    // Role filter: empty set = show everything. "Errors" matches by flag, not role.
    const ROLE_CHIPS = [
        { id: 'user', label: 'User', match: m => m.role === 'user' },
        { id: 'assistant', label: 'Assistant', match: m => m.role === 'assistant' },
        { id: 'tool', label: 'Tool calls', match: m => m.role === 'tool' },
        { id: 'toolResult', label: 'Results', match: m => m.role === 'toolResult' },
        { id: 'error', label: 'Errors', match: m => m.isError }
    ];
    // Dialog (you + assistant) is the default view: the conversation is what you
    // came to read. Tool traffic is one chip away — and a deep link (focusTs)
    // pointing at a tool message clears the filter so it can never hide a jump.
    let roleSel = new Set(['user', 'assistant']);
    // Turns unticked in their band are left out of Export MD (default: all included).
    const exportOff = new Set();
    // Accordion: collapsed turns show only their band (session-local, display-only —
    // export/filters ignore it). singleOpen = expanding a turn folds all the others;
    // persisted in webview state so the mode survives tab switches.
    const collapsed = new Set();
    let singleOpen = !!(((typeof vscode.getState === 'function' && vscode.getState()) || {}).singleOpen);
    let turnCounts = null; // per-turn message counts, rebuilt when DATA changes
    // G4 replay state: play messages 0..pos step by step over the *filtered* list,
    // honoring real gaps.
    const replay = { active: false, playing: false, pos: 0, speed: 2, timer: null, msgs: [] };

    window.addEventListener('message', ev => {
        if (ev.data.type === 'focus') { focusAt(ev.data.ts); return; }
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

    function messageHtml(m, idx) {
        const roleLabel = { user: 'USER', assistant: 'ASSISTANT', tool: 'TOOL CALL', toolResult: 'TOOL RESULT', system: 'SYSTEM' }[m.role];
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
                const roleLabel = { user: 'USER', assistant: 'ASSISTANT', system: 'SYSTEM' }[m.role] || m.role.toUpperCase();
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
                <span class="muted small">Export selection:</span>
                <button class="chip" data-selact="all">All</button>
                <button class="chip" data-selact="none">None</button>
                <button class="chip" data-selact="invert">Invert</button>
                <span class="muted small">— or use the checkboxes here / on the turn bands (they stay in sync); "only" exports just that turn</span>
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
            </style>
            ${window.AFHeader.html({
                page: 'viewer',
                title: C.esc(DATA.title),
                sub: `${C.esc(DATA.cwd || '')} · ${C.esc(DATA.sessionId)} · ${DATA.permissionMode ? 'mode: ' + C.esc(DATA.permissionMode) : ''}`,
                actions: `<button id="resume">⏵ Resume</button>
                    <button class="secondary" id="focusterm" title="Jump to this session's terminal window (if one is open)">⌨ Terminal</button>
                    <button class="secondary" id="replaytoggle">${replay.active ? '✕ Exit replay' : '▶ Replay'}</button>
                    <button class="secondary" id="exportmd" title="Export to Markdown — asks whether to save the current view (filters/folding applied) or everything">⬇ Export MD${exportOff.size ? ` (${includedTurnCount()}/${(DATA.turns || []).length} turns)` : ''}</button>
                    <button class="secondary" id="raw">Open raw JSONL</button>${DATA.agentName ? `
                    <button class="secondary" id="agentpage" title="This session belongs to ${C.esc(DATA.agentName)} — open the agent page">⌂ ${C.esc(DATA.agentName)}</button>` : ''}`,
                searchTitle: 'Search inside this session (tool traffic too)',
                guide: 'oturum-goruntuleyici'
            })}
            <div class="row">
                <div class="card"><div class="label">Cost</div><div class="kpi">${C.fmtUSD(DATA.cost)}</div><div class="sub">API-equivalent</div></div>
                <div class="card"><div class="label">Tokens</div><div class="kpi">${C.fmtTok(DATA.totalTokens)}</div>
                    <div class="sub">in ${C.fmtTok(DATA.usage.input)} · out ${C.fmtTok(DATA.usage.output)} · cacheR ${C.fmtTok(DATA.usage.cacheRead)} · cacheW ${C.fmtTok(DATA.usage.cacheWrite)}</div></div>
                <div class="card"><div class="label">Context now</div>
                    <div class="kpi"${ctxColor ? ` style="color:${ctxColor}"` : ''}>${ctx.tokens > 0 ? C.fmtTok(ctx.tokens) : '—'}</div>
                    <div class="sub"${ctxColor ? ` style="color:${ctxColor}"` : ''}>${ctxSub}</div></div>
                <div class="card"><div class="label">Span</div><div class="kpi">${durMin}m</div><div class="sub">${fmtTime(DATA.firstTs)} → ${fmtTime(DATA.lastTs)}</div></div>
                <div class="card"><div class="label">Activity</div><div class="kpi">${DATA.toolCalls}</div><div class="sub">tool calls · ${DATA.errors} errors · ${C.esc((DATA.models || []).map(m => m.replace(/^claude-/, '')).join(', '))}</div></div>
            </div>
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

        window.AFHeader.wire(vscode);
        document.getElementById('raw').addEventListener('click', () => vscode.postMessage({ type: 'openRaw' }));
        if (DATA.agentName) {
            const ab = document.getElementById('agentpage');
            if (ab) { ab.addEventListener('click', () => vscode.postMessage({ type: 'openAgent', cwd: DATA.cwd })); }
        }
        document.getElementById('focusterm').addEventListener('click', () =>
            vscode.postMessage({ type: 'focusTerminal', cwd: DATA.cwd }));
        document.getElementById('resume').addEventListener('click', () =>
            vscode.postMessage({ type: 'resume', cwd: DATA.cwd }));
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

    render();
    if (DATA.focusTs) { focusAt(DATA.focusTs); }
})();
