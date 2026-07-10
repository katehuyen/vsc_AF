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
    let roleSel = new Set();
    // G4 replay state: play messages 0..pos step by step over the *filtered* list,
    // honoring real gaps.
    const replay = { active: false, playing: false, pos: 0, speed: 2, timer: null, msgs: [] };

    window.addEventListener('message', ev => {
        if (ev.data.type !== 'data') { return; }
        DATA = ev.data.data;
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

    function turnHdrHtml(m) {
        if (!m.turnStart || !m.turn) { return ''; }
        const t = (DATA.turnTotals || {})[m.turn];
        const total = t && (t.tokens || t.cost)
            ? ` · ${C.fmtTok(t.tokens)} tok · ${C.fmtUSD(t.cost)}`
            : '';
        return `<div class="turnhdr" data-turn="${m.turn}"><span>Turn ${m.turn}/${DATA.turnCount || '?'}${total}</span></div>`;
    }

    function listHtml(msgs) {
        return msgs.map((m, i) => turnHdrHtml(m) + messageHtml(m, i)).join('');
    }

    function messageHtml(m, idx) {
        const roleLabel = { user: 'USER', assistant: 'ASSISTANT', tool: 'TOOL CALL', toolResult: 'TOOL RESULT', system: 'SYSTEM' }[m.role];
        const cls = m.role + (m.isError ? ' error' : '');
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
            return `<div class="msg tool" data-idx="${idx}"><div class="meta">${meta}</div>
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

    function turnBoxHtml() {
        const turns = DATA.turns || [];
        if (!turns.length) { return ''; }
        return `<details id="turnbox" class="turnbox"${turnsOpen ? ' open' : ''}>
            <summary>Turn breakdown — ${turns.length} turns (click a row to jump)</summary>
            <div class="tablewrap"><table>
                <thead><tr><th>#</th><th>prompt</th><th class="num">tokens</th><th class="num">cost</th></tr></thead>
                <tbody>${turns.map(t => `<tr class="click" data-turn="${t.n}">
                    <td>${t.n}</td><td>${C.esc(t.label || '—')}</td>
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
                .turnhdr { display:flex; align-items:center; gap:10px; margin:16px 0 4px;
                    color:var(--vscode-descriptionForeground); font-size:11px; white-space:nowrap; }
                .turnhdr::before, .turnhdr::after { content:''; height:1px; flex:1;
                    background:var(--vscode-panel-border); }
                .turnbox { margin:10px 0; }
                .turnbox summary { font-size:12px; }
                .turnbox table { margin-top:6px; }
                .chiprow { display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin:8px 0; }
                .chip { font-size:11px; padding:2px 10px; border-radius:10px; cursor:pointer;
                    background:transparent; color:var(--vscode-foreground); opacity:.75;
                    border:1px solid var(--vscode-widget-border, #4444); }
                .chip.on { background:var(--vscode-button-background); color:var(--vscode-button-foreground);
                    border-color:transparent; opacity:1; }
            </style>
            <div class="spread">
                <div>
                    <h1>${C.esc(DATA.title)}</h1>
                    <div class="muted small">${C.esc(DATA.cwd || '')} · ${C.esc(DATA.sessionId)} · ${DATA.permissionMode ? 'mode: ' + C.esc(DATA.permissionMode) : ''}</div>
                </div>
                <div class="btnrow">
                    <button id="resume">⏵ Resume</button>
                    <button class="secondary" id="replaytoggle">${replay.active ? '✕ Exit replay' : '▶ Replay'}</button>
                    <button class="secondary" id="refresh">Refresh</button>
                    <button class="secondary" id="raw">Open raw JSONL</button>
                    <button class="secondary" data-guide="oturum-goruntuleyici">? Guide</button>
                </div>
            </div>
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
            <div class="searchbar" style="margin:14px 0 6px">
                <input id="filter" type="text" placeholder="Filter messages… (text, tool name)" value="${C.esc(filter)}">
            </div>`}
            ${chipRowHtml()}
            ${DATA.truncatedCount ? `<p class="muted small">Showing last ${DATA.messages.length} of ${DATA.messageCount} messages (${DATA.truncatedCount} older hidden — raise <code>agentFarm.maxTranscriptMessages</code> to see more).</p>` : ''}
            <div id="msgs">${replay.active
                ? listHtml(replay.msgs.slice(0, replay.pos + 1))
                : (listHtml(visible) || '<p class="muted">No messages match.</p>')}</div>
        `;
        if (prevScroll) { window.scrollTo(prevScroll.x, prevScroll.y); }

        document.getElementById('refresh').addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
        document.getElementById('raw').addEventListener('click', () => vscode.postMessage({ type: 'openRaw' }));
        document.getElementById('resume').addEventListener('click', () =>
            vscode.postMessage({ type: 'resume', cwd: DATA.cwd }));
        document.querySelectorAll('[data-guide]').forEach(el =>
            el.addEventListener('click', () => vscode.postMessage({ type: 'openGuide', anchor: el.dataset.guide })));

        const turnbox = document.getElementById('turnbox');
        if (turnbox) {
            turnbox.addEventListener('toggle', () => { turnsOpen = turnbox.open; });
            turnbox.querySelectorAll('tr[data-turn]').forEach(tr => tr.addEventListener('click', () => {
                const n = Number(tr.dataset.turn);
                if (replay.active) {
                    stopTimer();
                    const i = replay.msgs.findIndex(m => m.turn === n);
                    if (i >= 0) { replay.pos = i; renderReplayList(); }
                } else {
                    const el = document.querySelector(`.turnhdr[data-turn="${n}"]`);
                    if (el) { el.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
                }
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
        document.querySelectorAll('.chip').forEach(chip => chip.addEventListener('click', () => {
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
            input.addEventListener('input', () => {
                filter = input.value.toLowerCase();
                const msgs = document.getElementById('msgs');
                msgs.innerHTML = listHtml(visibleMsgs()) || '<p class="muted">No messages match.</p>';
            });
        }
    }

    render();
})();
