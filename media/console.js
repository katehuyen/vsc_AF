// Agent Farm — Console. The panel's own conversation surface: sessions on the
// left, the talk and the composer on the right. Every row here is a real
// `claude` process this window hosts; nothing is simulated, and where the CLI
// cannot do something (answer a permission dialog) the UI says what it CAN do
// instead of pretending.
//
// The page is built ONCE and then patched. A streaming conversation re-renders
// several times a second, and rebuilding the whole page each time destroyed and
// recreated the textarea you were typing in — which then had to be re-focused,
// which scrolled it into view, which dragged the page down while you were
// reading something further up. Now the shell is built when the *shape* changes
// (a different session, a different composer mode) and everything else is
// written into named slots, and only when its content actually differs.
(function () {
    'use strict';

    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    // The shell's own global (see htmlShell) — not AF_DATA, which nothing sets.
    let DATA = window.__DATA__ || { sessions: [], agents: [], resumable: [] };

    const saved = (typeof vscode.getState === 'function' && vscode.getState()) || {};
    let st = Object.assign({
        agentId: '', model: '', effort: '', permissionMode: '', draft: '', showResume: false,
        // which kinds of line the conversation shows; null = everything
        kinds: null
    }, saved.afConsole);
    const save = () => {
        const all = (typeof vscode.getState === 'function' && vscode.getState()) || {};
        all.afConsole = st;
        vscode.setState(all);
    };

    // The page is an app, not a document: it fills the window, the conversation
    // is the only thing that scrolls, and the composer stays where you left it.
    // Before this, the wrapper had a `min-height` and the conversation box a
    // `max-height` — so a short conversation left a tall empty gap between the
    // last line and the composer, and the whole page scrolled as well as the box.
    const STYLE = `<style>
        html, body { height:100%; }
        body { overflow:auto; padding-bottom:14px; }
        #app { min-height:100%; display:flex; flex-direction:column; }
        .cwrap { display:flex; gap:14px; align-items:stretch; flex:1 1 auto; min-height:340px; }
        .clist { flex:0 0 250px; display:flex; flex-direction:column; gap:6px; min-width:0; overflow-y:auto; }
        .cmain { flex:1 1 auto; display:flex; flex-direction:column; min-width:0; min-height:0; }
        .srow { border:1px solid var(--vscode-widget-border,#4443); border-radius:7px; padding:7px 9px;
            cursor:pointer; background:var(--vscode-editor-background); }
        .srow:hover { background:var(--vscode-list-hoverBackground); }
        .srow.sel { border-color:var(--vscode-focusBorder);
            background:color-mix(in srgb, var(--vscode-textLink-foreground) 12%, transparent); }
        .srow .h { display:flex; align-items:center; gap:6px; justify-content:space-between; }
        .srow .n { font-weight:600; font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .srow .m { font-size:10px; color:var(--vscode-descriptionForeground); margin-top:2px; }
        .srow .sid { font-weight:400; opacity:.6; font-size:10px; }
        .srow .t2 { font-size:11px; margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .dot { width:8px; height:8px; border-radius:50%; flex:none; display:inline-block; }
        .talkwrap { position:relative; display:flex; flex-direction:column; flex:1 1 auto; min-height:0; }
        .talk { flex:1 1 auto; min-height:0; overflow-y:auto; padding:4px 2px 10px;
            border:1px solid var(--vscode-widget-border,#4443); border-radius:8px;
            display:flex; flex-direction:column; }
        /* A short conversation sits ON the composer, the way a terminal does —
           margin-top:auto rather than justify-content:flex-end, which would make
           the top of a long conversation unreachable. */
        .talkinner { margin-top:auto; }
        /* the way back down, offered rather than forced */
        .jump { position:absolute; left:50%; transform:translateX(-50%); bottom:10px; z-index:5;
            font-size:11px; padding:3px 12px; border-radius:12px; box-shadow:0 2px 8px #0005; }
        .jump[hidden] { display:none; }
        .hiddenote { font-size:10px; opacity:.6; padding:3px 4px 0; }
        .hiddenote:empty { display:none; }
        /* the show-filter lives in the composer, at the BOTTOM of the page, so
           its menu opens upwards instead of off the edge */
        .crow .afms-menu { top:auto; bottom:calc(100% + 4px); }
        .crow .afms-btn { font-size:11px; }
        .msg { margin:8px 10px; display:flex; gap:9px; align-items:flex-start; }
        .msg .who { flex:none; width:56px; font-size:10px; opacity:.65; padding-top:3px; text-transform:uppercase; }
        .msg .body { flex:1; min-width:0; white-space:pre-wrap; word-break:break-word; }
        .msg.user .body { background:color-mix(in srgb, var(--vscode-textLink-foreground) 10%, transparent);
            border-radius:7px; padding:6px 9px; }
        .msg.tool .body { font-size:11px; opacity:.85; font-family:var(--vscode-editor-font-family, monospace); }
        .msg.err .body { color:var(--vscode-errorForeground); }
        .msg.sys .body { font-size:11px; opacity:.7; font-style:italic; }
        .msg.res .body { font-size:11px; opacity:.7; border-top:1px dashed var(--vscode-widget-border,#4443); padding-top:5px; }
        .filechip { display:inline-block; font-size:10px; padding:1px 7px; margin-left:6px; border-radius:8px;
            cursor:pointer; border:1px solid var(--vscode-widget-border,#4444); }
        .filechip:hover { background:var(--vscode-list-hoverBackground); }
        .permbox { margin:10px; padding:9px 11px; border-radius:8px;
            border:1px solid var(--vscode-editorWarning-foreground,#cca700);
            background:color-mix(in srgb, var(--vscode-editorWarning-foreground,#cca700) 12%, transparent); }
        .permbox .t { font-weight:600; font-size:12px; }
        .permbox .d { font-size:11px; opacity:.85; margin:4px 0 8px; }
        .composer { margin-top:8px; flex:none; border:1px solid var(--vscode-widget-border,#4443);
            border-radius:8px; padding:8px; }
        .composer textarea { width:100%; min-height:64px; max-height:30vh; resize:vertical; font:inherit;
            font-size:13px; border-radius:6px; padding:7px 9px;
            border:1px solid var(--vscode-widget-border,#4443);
            background:var(--vscode-input-background); color:var(--vscode-input-foreground); }
        .crow { display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin-top:7px; }
        .crow select { font-size:11px; padding:2px 4px; }
        .crow .grow { flex:1; }
        .qbadge { font-size:10px; padding:1px 7px; border-radius:8px;
            background:var(--vscode-badge-background); color:var(--vscode-badge-foreground); }
        .fixed { font-size:11px; opacity:.75; }
        .permlbl { font-size:10px; opacity:.75; display:flex; align-items:center; gap:4px; }
        .owned { opacity:.5; }
        .owned .n::after { content:' · open elsewhere'; font-weight:400; opacity:.8; }
        .empty { padding:26px 12px; color:var(--vscode-descriptionForeground); font-size:12px; }
    </style>`;

    const STATUS_COLOR = {
        starting: 'var(--vscode-charts-yellow,#cca700)',
        working: 'var(--vscode-charts-blue,#3794ff)',
        idle: 'var(--vscode-charts-green,#4caf50)',
        ended: 'var(--vscode-descriptionForeground,#999)',
        error: 'var(--vscode-charts-red,#f14c4c)'
    };

    function relTime(ts) {
        if (!ts) { return ''; }
        const s = Math.round((Date.now() - ts) / 1000);
        if (s < 60) { return s + 's'; }
        const m = Math.round(s / 60);
        if (m < 60) { return m + 'm'; }
        return Math.round(m / 60) + 'h';
    }

    const sel = () => (DATA.sessions || []).find(s => s.id === DATA.selected);

    /**
     * The right-click contract for a session row.
     *
     * `data-vscode-context` hands the row's identity to VS Code, which builds
     * the menu from the `webview/context` entries in package.json — the
     * standard Copy/Paste items stay (`preventDefaultContextMenuItems: false`)
     * and the session's own actions are appended to them. This is deliberately
     * NOT a `contextmenu` listener: hijacking the right-click to open a rename
     * box straight away took the normal menu away from the page and left rename
     * as the only thing a right-click could ever mean.
     */
    const ctxAttr = o => `data-vscode-context="${JSON.stringify(o)
        .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}"`;

    /** `developer (#407c78cb)` — the id is how a row is matched against a tab,
     *  a terminal or a log line, so it rides with the agent's name. */
    const who = (agentName, sessionId) =>
        `${C.esc(agentName || 'session')}${sessionId ? ` <span class="sid">(#${C.esc(String(sessionId).slice(0, 8))})</span>` : ''}`;

    /**
     * The kinds of line the Console shows, and what each one matches.
     *
     * A long turn is mostly tool traffic; reading what the two of you actually
     * said means being able to put the rest away. Same vocabulary as the
     * transcript viewer's Show chips — one filter language in the extension,
     * not two — and the same multi-select control the Search and Notices pages
     * use, so "any subset" is expressible rather than "all or one".
     */
    const KINDS = [
        { v: 'user', t: '🧑 You', is: m => m.role === 'user' },
        { v: 'agent', t: '🤖 Agent', is: m => m.role === 'agent' },
        { v: 'tool', t: '🔧 Tool calls', is: m => m.role === 'tool' && !!m.tool },
        { v: 'result', t: '📄 Tool results', is: m => m.role === 'tool' && !m.tool && !m.isError },
        { v: 'error', t: '⚠ Errors', is: m => m.role === 'error' || (m.role === 'tool' && !!m.isError) },
        { v: 'system', t: '⚙ System · turn totals', is: m => m.role === 'system' || m.role === 'result' }
    ];

    /** st.kinds: null = everything (and a kind added later is included). */
    function visibleMessages(list) {
        if (st.kinds === null || st.kinds === undefined) { return list || []; }
        const on = KINDS.filter(k => st.kinds.indexOf(k.v) >= 0);
        return (list || []).filter(m => on.some(k => k.is(m)));
    }

    function messageHtml(m) {
        if (m.role === 'user') {
            return `<div class="msg user"><span class="who">you</span><div class="body">${C.esc(m.text || '')}</div></div>`;
        }
        if (m.role === 'agent') {
            return `<div class="msg"><span class="who">agent</span><div class="body">${C.esc(m.text || '')}</div></div>`;
        }
        if (m.role === 'tool') {
            if (m.tool) {
                const chip = m.tool.file
                    ? `<span class="filechip" data-open="${C.esc(m.tool.file)}" title="Open this file">✎ open</span>
                       <span class="filechip" data-diff="${C.esc(m.tool.file)}" title="Diff it against git HEAD">vs HEAD</span>`
                    : '';
                return `<div class="msg tool"><span class="who">🔧</span><div class="body"><strong>${C.esc(m.tool.name)}</strong> ${C.esc(m.tool.detail)}${chip}</div></div>`;
            }
            return `<div class="msg tool${m.isError ? ' err' : ''}"><span class="who">${m.isError ? '⚠' : '↳'}</span><div class="body">${C.esc(m.text || '')}</div></div>`;
        }
        if (m.role === 'system') {
            return `<div class="msg sys"><span class="who"></span><div class="body">${C.esc(m.text || '')}</div></div>`;
        }
        if (m.role === 'error') {
            return `<div class="msg err"><span class="who">error</span><div class="body">${C.esc(m.text || '')}</div></div>`;
        }
        // result row: only worth a line when it carries something
        const bits = [];
        if (m.text) { bits.push(m.text); }
        if (m.cost) { bits.push(C.fmtUSD(m.cost)); }
        if (!bits.length) { return ''; }
        return `<div class="msg res"><span class="who"></span><div class="body">${C.esc(bits.join(' · '))}</div></div>`;
    }

    function permissionBox(s) {
        if (!s || !s.pendingPermission) { return ''; }
        // Honest wording: the CLI never asked us anything — it refused the tool.
        // What a button can really do is change the session's rule and retry.
        return `<div class="permbox">
            <div class="t">⚠ A tool was refused — permission was never granted for it</div>
            <div class="d">${C.esc(s.pendingPermission.detail)}</div>
            <div class="d">This session runs in <strong>${C.esc(s.permissionMode)}</strong>. Claude Code does not ask the panel for a one-off approval, so there is nothing to click "allow once" on — what the panel can do is <strong>change this session's permission rule</strong> and ask the agent to try again:</div>
            <div class="crow">
                ${(DATA.grants || []).map(g => `<button class="secondary" data-grant="${C.esc(g.mode)}" title="${C.esc(g.detail)}">${C.esc(g.label)} + retry</button>`).join('')}
            </div>
        </div>`;
    }

    // ---- the pieces, each rendered on its own ---------------------------------

    function sessionListHtml() {
        // Agent name alone cannot tell two sessions of the same agent apart, so
        // the row carries the agent, the session id, the session's own name and
        // its numbers: cost (with the tokens it bought) on the top line, and
        // "ctx now" — what the window is holding — on the bottom one.
        const rows = (DATA.sessions || []).map(s => `
            <div class="srow${s.id === DATA.selected ? ' sel' : ''}" data-sel="${C.esc(s.id)}"
                 ${ctxAttr({
                     webviewSection: 'afConsoleSession', preventDefaultContextMenuItems: false,
                     sessionId: s.sessionId || '', title: s.title || '',
                     agentName: s.agentName || '', cwd: s.cwd || ''
                 })}
                 title="${C.esc(s.title || 'not named yet')} — right-click for session actions">
                <div class="h">
                    <span class="n"><span class="dot" style="background:${STATUS_COLOR[s.status] || '#888'}"></span>${who(s.agentName, s.sessionId)}</span>
                    <span class="m" title="cost so far${s.tokens ? ' · tokens spent' : ''}">${C.fmtUSD(s.cost)}${s.tokens ? ` (${C.fmtTok(s.tokens)})` : ''}</span>
                </div>
                <div class="t2">${C.esc(s.title || '(no name yet)')}</div>
                <div class="m">${C.esc(s.status)}${s.queued ? ` · ${s.queued} queued` : ''}${s.turns ? ` · ${s.turns} turns` : ''} · ${relTime(s.lastTs)}${s.contextTokens ? ` · <span title="Approximate context in the model window right now">ctx ${C.fmtTok(s.contextTokens)}</span>` : ''}</div>
            </div>`).join('');
        // A session a live process already owns cannot be joined — resuming it
        // would start a second process on the same transcript. The row says so
        // instead of offering it as if it were free.
        const owned = new Set(DATA.owned || []);
        const resume = st.showResume ? `<div style="margin-top:6px">${(DATA.resumable || []).map(r => `
            <div class="srow${owned.has(r.sessionId) ? ' owned' : ''}" data-resume="${C.esc(r.sessionId)}"
                 ${ctxAttr({
                     webviewSection: 'afConsoleResumable', preventDefaultContextMenuItems: false,
                     sessionId: r.sessionId, title: r.title || '', agentName: r.agentName || '', cwd: r.cwd || ''
                 })}
                 title="${owned.has(r.sessionId) ? 'Open right now in a terminal or another process — Agent Farm cannot join a running session' : C.esc(r.cwd) + ' — right-click for session actions'}">
                <div class="n">${r.pinned ? '📌 ' : ''}${C.esc(r.title)}</div>
                <div class="m">${who(r.agentName, r.sessionId)} · ${relTime(r.ts)} ago · ${C.fmtUSD(r.cost)}${r.contextTokens ? ` · <span title="Approximate context after this session's last reply — what resuming it starts from">ctx ${C.fmtTok(r.contextTokens)}</span>` : ''}</div>
            </div>`).join('') || '<div class="empty">No transcripts yet.</div>'}</div>` : '';
        return `<button id="c-new">＋ New session</button>
            ${rows || '<div class="empty">No hosted sessions yet. Pick an agent below and say something — the process starts here, in the panel.</div>'}
            <button class="secondary" id="c-toggle-resume" style="margin-top:6px">${st.showResume ? '▾' : '▸'} Resume an existing session</button>
            ${resume}`;
    }

    function talkHtml(s, shown) {
        if (!s) {
            return `<div class="empty">This is the Console: sessions run <em>here</em>, in the panel — your own <code>claude</code>, your own subscription, transcripts in the usual place.<br><br>Pick an agent below, type, and press Ctrl+Enter.</div>`;
        }
        const body = shown.map(messageHtml).join('')
            || `<div class="empty">${(s.messages || []).length ? 'Every line is filtered out — widen <b>show</b> in the composer.' : 'Nothing said yet.'}</div>`;
        return body + permissionBox(s);
    }

    /** The bits of the live composer row that change while a turn runs. */
    function liveBitsHtml(s) {
        if (!s) { return ''; }
        return `${s.queued ? `<span class="qbadge" title="Waiting for the current turn to finish">${s.queued} queued</span> <button class="secondary" id="c-clearq">clear</button>` : ''}
            ${s.status === 'working' ? '<button class="secondary" id="c-int" title="Stop the running turn — the session and its context stay">⎋ Interrupt</button>' : ''}`;
    }

    function statusHtml(s) {
        if (!s) {
            return `A new session opens in the chosen agent's folder and runs here, in the panel.`;
        }
        const dead = s.status === 'ended' || s.status === 'error';
        return `${s.sessionId ? 'session ' + C.esc(s.sessionId.slice(0, 8)) + ' · ' : ''}${s.contextTokens ? '~' + C.fmtTok(s.contextTokens) + ' ctx · ' : ''}${C.fmtUSD(s.cost)} this session · ${s.turns} turn(s)
            <span class="grow"></span>
            ${s.sessionId ? '<button class="secondary" id="c-transcript">Open transcript</button>' : ''}
            ${dead ? '<button class="secondary" id="c-forget">Remove from list</button>' : '<button class="secondary" id="c-close">End session</button>'}`;
    }

    function headerHtml(s) {
        return window.AFHeader.html({
            page: 'console',
            title: 'Console',
            sub: s
                ? `${C.esc(s.agentName)} · ${C.esc(s.status)}${s.exitReason ? ' — ' + C.esc(s.exitReason) : ''}`
                : `${(DATA.sessions || []).length} hosted session(s) in this window`,
            guide: 'console',
            related: [{ nav: 'timeline', label: 'Live Timeline' }]
        });
    }

    // ---- following the tail ---------------------------------------------------
    // "At the bottom" has to have slack: a streamed line can land mid-frame and
    // sub-pixel rounding makes an exact comparison flicker.
    const BOTTOM_SLACK = 40;
    const atBottom = el => el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_SLACK;
    /** lines that arrived while the reader was scrolled up */
    let unseen = 0;
    /** how many lines the last paint drew — the yardstick for "arrived" */
    let shownCount = 0;

    function paintJump() {
        const btn = document.getElementById('c-jump');
        if (!btn) { return; }
        btn.hidden = unseen <= 0;
        btn.textContent = `↓ ${unseen} new line${unseen === 1 ? '' : 's'}`;
    }

    function jumpToEnd() {
        const el = document.getElementById('talk');
        if (el) { el.scrollTop = el.scrollHeight; }
        unseen = 0;
        paintJump();
    }

    /** The reader themselves changed what is on screen — start counting over. */
    function resetTail() {
        unseen = 0;
        shownCount = -1;   // the next paint is a baseline, not "new lines"
        jumpToEnd();
    }

    // ---- the shell, built once -----------------------------------------------

    /** What the shell was built for; when this changes, the shell is rebuilt. */
    let shellKey = null;
    /** Last html written into each slot — nothing is touched unless it differs. */
    const written = {};

    function slot(id, html) {
        if (written[id] === html) { return false; }
        const el = document.getElementById(id);
        if (!el) { return false; }
        el.innerHTML = html;
        written[id] = html;
        return true;
    }

    function buildShell(s) {
        const opts = (list, cur) => (list || []).map(o =>
            `<option value="${C.esc(o.id)}"${o.id === cur ? ' selected' : ''}>${C.esc(o.label || o.id)}</option>`).join('');
        const dead = s && (s.status === 'ended' || s.status === 'error');
        const placeholder = s
            ? (dead ? 'This session has ended — start a new one to keep talking.'
                : 'Message ' + C.esc(s.agentName) + '…  (Ctrl+Enter sends)')
            : 'Say something to start a session…  (Ctrl+Enter sends)';

        // The composer has two modes, and they show DIFFERENT controls — a
        // running session has no use for an agent/model picker (both were
        // decided when the process started and cannot change), and showing them
        // greyed out was just a row of dead boxes. What CAN change mid-session
        // is the permission mode, so that one stays a live control.
        const controls = s
            ? `<span class="fixed" title="Decided when this session started — a running session cannot change them">
                    ${C.esc(s.agentName)}${s.model ? ' · ' + C.esc(String(s.model).replace(/^claude-/, '')) : ''}
                </span>
                <label class="permlbl" title="The one thing that CAN change mid-session — applied live">permissions
                    <select id="c-perm">${opts(DATA.permissions, s.permissionMode)}</select>
                </label>
                ${window.AFFilter.multi({
                    id: 'c-kinds', label: 'show', allLabel: 'show: everything',
                    options: KINDS, selected: st.kinds,
                    title: 'Which kinds of line the conversation shows — tick any combination'
                })}
                <span class="grow"></span>
                <span id="c-live"></span>
                <button id="c-send"${dead ? ' disabled' : ''}>Send</button>`
            : `<select id="c-agent" title="Which agent — the session opens in its folder">
                    <option value="">choose an agent…</option>
                    ${(DATA.agents || []).map(a => `<option value="${C.esc(a.id)}"${a.id === st.agentId ? ' selected' : ''}>${C.esc(a.name)}</option>`).join('')}
                </select>
                <select id="c-model" title="Model for the new session (--model)">${opts(DATA.models, st.model)}</select>
                <select id="c-effort" title="Reasoning effort (--effort)">${opts(DATA.efforts, st.effort)}</select>
                <select id="c-perm" title="What it may do without asking (--permission-mode)">${opts(DATA.permissions, st.permissionMode)}</select>
                <span class="grow"></span>
                <span id="c-live"></span>
                <button id="c-send">Start session</button>`;

        document.getElementById('app').innerHTML = `${STYLE}
            <div id="c-head"></div>
            <div class="cwrap">
                <div class="clist" id="c-list"></div>
                <div class="cmain">
                    <div class="talkwrap">
                        <div class="talk" id="talk"><div class="talkinner" id="talkinner"></div></div>
                        <button class="jump" id="c-jump" hidden></button>
                        <div class="hiddenote" id="c-hidden"></div>
                    </div>
                    <div class="composer">
                        <textarea id="c-text" placeholder="${placeholder}"${dead ? ' disabled' : ''}></textarea>
                        <div class="crow" id="c-controls">${controls}</div>
                        <div class="crow" id="c-status" style="font-size:10px;opacity:.6"></div>
                    </div>
                </div>
            </div>`;
        // A rebuild starts every slot over.
        for (const k of Object.keys(written)) { delete written[k]; }

        const text = document.getElementById('c-text');
        if (text) {
            text.value = st.draft || '';
            text.addEventListener('input', () => { st.draft = text.value; save(); });
            text.addEventListener('keydown', ev => {
                if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); send(); }
            });
            // Only here — never on a data update. Focusing scrolls the element
            // into view, which is exactly the "it dragged me back down" bug.
            try { text.focus({ preventScroll: true }); } catch (e) { text.focus(); }
        }
        const talkEl = document.getElementById('talk');
        if (talkEl) {
            talkEl.addEventListener('scroll', () => {
                if (!atBottom(talkEl)) { return; }
                unseen = 0;
                paintJump();
            });
        }
        const byId = (id, ev, fn) => { const el = document.getElementById(id); if (el) { el.addEventListener(ev, fn); } };
        byId('c-jump', 'click', jumpToEnd);
        byId('c-send', 'click', send);
        // The line filter is the same multi-select the Search and Notices pages
        // use: null = everything, [] = nothing, any subset in between.
        if (s) {
            window.AFFilter.wireMulti({
                id: 'c-kinds',
                onChange: picked => {
                    st.kinds = picked;
                    save();
                    paint();
                    // a filter change is the reader's own move: land at the tail,
                    // and what the filter let through is not "new lines"
                    resetTail();
                }
            });
        } else {
            const pick = (id, key) => byId(id, 'change', e => { st[key] = e.target.value; save(); });
            pick('c-agent', 'agentId');
            pick('c-model', 'model');
            pick('c-effort', 'effort');
        }
        byId('c-perm', 'change', e => {
            const mode = e.target.value;
            const cur = sel();
            if (cur) {
                // live, mid-session — the same control the permission box uses
                vscode.postMessage({ type: 'permissionMode', id: cur.id, mode, retry: false });
            } else {
                st.permissionMode = mode; save();
            }
        });
        resetTail();
    }

    // ---- one pass over the changing parts -------------------------------------

    function paint() {
        const s = sel();
        const key = `${DATA.selected || ''}|${s ? s.status === 'ended' || s.status === 'error' : 'none'}`;
        if (shellKey !== key) {
            shellKey = key;
            buildShell(s);
        }

        const talkEl = document.getElementById('talk');
        // Where the reader is, BEFORE anything is written. The element itself is
        // never replaced, so when they are scrolled up we simply do not touch
        // scrollTop — the browser keeps the view exactly where it was.
        const pinned = !talkEl || atBottom(talkEl);

        const shown = s ? visibleMessages(s.messages) : [];
        const changed = slot('talkinner', talkHtml(s, shown));
        if (changed) {
            if (pinned) {
                unseen = 0;
                if (talkEl) { talkEl.scrollTop = talkEl.scrollHeight; }
            } else if (shownCount >= 0 && shown.length > shownCount) {
                // Only what the filter LET THROUGH counts as a new line: lines
                // you have filtered out are not news you are missing.
                unseen += shown.length - shownCount;
            }
        }
        shownCount = shown.length;
        paintJump();

        const hidden = s ? (s.messages || []).length - shown.length : 0;
        slot('c-hidden', hidden ? `${hidden} line(s) hidden by <b>show</b>` : '');

        if (slot('c-head', headerHtml(s))) {
            window.AFHeader.wire(vscode, { onRefresh: () => vscode.postMessage({ type: 'refresh' }) });
        }

        if (slot('c-list', sessionListHtml())) {
            document.querySelectorAll('[data-sel]').forEach(r =>
                r.addEventListener('click', () => vscode.postMessage({ type: 'select', id: r.dataset.sel })));
            document.querySelectorAll('[data-resume]').forEach(r =>
                r.addEventListener('click', () => vscode.postMessage({
                    type: 'resume', sessionId: r.dataset.resume,
                    model: st.model, effort: st.effort, permissionMode: st.permissionMode
                })));
            const byId = (id, ev, fn) => { const el = document.getElementById(id); if (el) { el.addEventListener(ev, fn); } };
            byId('c-new', 'click', () => vscode.postMessage({ type: 'select', id: '' }));
            byId('c-toggle-resume', 'click', () => { st.showResume = !st.showResume; save(); paint(); });
        }

        if (changed) {
            // Right-click is NOT wired here on purpose — see ctxAttr.
            document.querySelectorAll('[data-open]').forEach(b =>
                b.addEventListener('click', () => vscode.postMessage({ type: 'openFile', file: b.dataset.open, diff: false })));
            document.querySelectorAll('[data-diff]').forEach(b =>
                b.addEventListener('click', () => vscode.postMessage({ type: 'openFile', file: b.dataset.diff, diff: true })));
            document.querySelectorAll('[data-grant]').forEach(b =>
                b.addEventListener('click', () => vscode.postMessage({
                    type: 'permissionMode', id: DATA.selected, mode: b.dataset.grant, retry: true
                })));
        }

        // The composer's own row keeps its select and its filter menu — only the
        // things that actually change mid-turn are rewritten.
        if (slot('c-live', liveBitsHtml(s))) {
            const byId = (id, ev, fn) => { const el = document.getElementById(id); if (el) { el.addEventListener(ev, fn); } };
            byId('c-int', 'click', () => vscode.postMessage({ type: 'interrupt', id: DATA.selected }));
            byId('c-clearq', 'click', () => vscode.postMessage({ type: 'clearQueue', id: DATA.selected }));
        }
        const sendBtn = document.getElementById('c-send');
        if (sendBtn && s) {
            const label = s.status === 'working' ? 'Queue' : 'Send';
            if (sendBtn.textContent !== label) { sendBtn.textContent = label; }
        }

        if (slot('c-status', statusHtml(s))) {
            const byId = (id, ev, fn) => { const el = document.getElementById(id); if (el) { el.addEventListener(ev, fn); } };
            byId('c-close', 'click', () => vscode.postMessage({ type: 'close', id: DATA.selected }));
            byId('c-forget', 'click', () => vscode.postMessage({ type: 'forget', id: DATA.selected }));
            byId('c-transcript', 'click', () => vscode.postMessage({
                type: 'openTranscript', sessionId: s ? s.sessionId : ''
            }));
        }
    }

    function send() {
        const text = document.getElementById('c-text');
        const value = text ? text.value.trim() : '';
        if (!value) { return; }
        const cur = sel();
        if (cur && cur.status !== 'ended' && cur.status !== 'error') {
            vscode.postMessage({ type: 'send', id: cur.id, text: value });
        } else {
            if (!st.agentId) {
                // the picker is right there; say what is missing rather than
                // swallowing the message
                const a = document.getElementById('c-agent');
                if (a) { a.focus(); }
                return;
            }
            vscode.postMessage({
                type: 'start', agentId: st.agentId, text: value,
                model: st.model, effort: st.effort, permissionMode: st.permissionMode
            });
        }
        st.draft = '';
        save();
        if (text) { text.value = ''; }
        // You just said something: you are back at the bottom by definition.
        jumpToEnd();
    }

    window.addEventListener('message', ev => {
        if (ev.data && ev.data.type === 'data') {
            const wasOn = DATA.selected;
            DATA = ev.data.data;
            // A different conversation is not "new lines in this one".
            if (DATA.selected !== wasOn) { shownCount = -1; unseen = 0; }
            // opened from an agent row: preselect that agent in the composer
            if (DATA.presetAgent) { st.agentId = DATA.presetAgent; save(); }
            paint();
        }
    });
    if (DATA.presetAgent) { st.agentId = DATA.presetAgent; save(); }

    paint();
})();
