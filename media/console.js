// Agent Farm — Console. The panel's own conversation surface: sessions on the
// left, the talk and the composer on the right. Every row here is a real
// `claude` process this window hosts; nothing is simulated, and where the CLI
// cannot do something (answer a permission dialog) the UI says what it CAN do
// instead of pretending.
(function () {
    'use strict';

    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    let DATA = window.AF_DATA || { sessions: [], agents: [], resumable: [] };

    const saved = (typeof vscode.getState === 'function' && vscode.getState()) || {};
    let st = Object.assign({
        agentId: '', model: '', effort: '', permissionMode: '', draft: '', showResume: false
    }, saved.afConsole);
    const save = () => {
        const all = (typeof vscode.getState === 'function' && vscode.getState()) || {};
        all.afConsole = st;
        vscode.setState(all);
    };

    const STYLE = `<style>
        .cwrap { display:flex; gap:14px; align-items:stretch; min-height:70vh; }
        .clist { flex:0 0 250px; display:flex; flex-direction:column; gap:6px; min-width:0; }
        .cmain { flex:1 1 auto; display:flex; flex-direction:column; min-width:0; }
        .srow { border:1px solid var(--vscode-widget-border,#4443); border-radius:7px; padding:7px 9px;
            cursor:pointer; background:var(--vscode-editor-background); }
        .srow:hover { background:var(--vscode-list-hoverBackground); }
        .srow.sel { border-color:var(--vscode-focusBorder);
            background:color-mix(in srgb, var(--vscode-textLink-foreground) 12%, transparent); }
        .srow .h { display:flex; align-items:center; gap:6px; justify-content:space-between; }
        .srow .n { font-weight:600; font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .srow .m { font-size:10px; color:var(--vscode-descriptionForeground); margin-top:2px; }
        .srow .t2 { font-size:11px; margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .dot { width:8px; height:8px; border-radius:50%; flex:none; display:inline-block; }
        .talk { flex:1 1 auto; overflow-y:auto; max-height:62vh; padding:4px 2px 10px;
            border:1px solid var(--vscode-widget-border,#4443); border-radius:8px; }
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
        .composer { margin-top:8px; border:1px solid var(--vscode-widget-border,#4443); border-radius:8px; padding:8px; }
        .composer textarea { width:100%; min-height:64px; resize:vertical; font:inherit; font-size:13px;
            border-radius:6px; padding:7px 9px; border:1px solid var(--vscode-widget-border,#4443);
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

    function sessionList() {
        // Agent name alone cannot tell two sessions of the same agent apart, so
        // the row carries the agent AND the session's own name — the same name
        // the side panel and the viewer show.
        const rows = (DATA.sessions || []).map(s => `
            <div class="srow${s.id === DATA.selected ? ' sel' : ''}" data-sel="${C.esc(s.id)}"
                 ${ctxAttr({
                     webviewSection: 'afConsoleSession', preventDefaultContextMenuItems: false,
                     sessionId: s.sessionId || '', title: s.title || '', agentName: s.agentName || ''
                 })}
                 title="${C.esc(s.title || 'not named yet')} — right-click for session actions">
                <div class="h">
                    <span class="n"><span class="dot" style="background:${STATUS_COLOR[s.status] || '#888'}"></span>${C.esc(s.agentName)}</span>
                    <span class="m">${C.fmtUSD(s.cost)}</span>
                </div>
                <div class="t2">${C.esc(s.title || '(no name yet)')}</div>
                <div class="m">${C.esc(s.status)}${s.queued ? ` · ${s.queued} queued` : ''}${s.turns ? ` · ${s.turns} turns` : ''} · ${relTime(s.lastTs)}</div>
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
                <div class="m">${C.esc(r.agentName)} · ${relTime(r.ts)} ago · ${C.fmtUSD(r.cost)}</div>
            </div>`).join('') || '<div class="empty">No transcripts yet.</div>'}</div>` : '';
        return `<div class="clist">
            <button id="c-new">＋ New session</button>
            ${rows || '<div class="empty">No hosted sessions yet. Pick an agent below and say something — the process starts here, in the panel.</div>'}
            <button class="secondary" id="c-toggle-resume" style="margin-top:6px">${st.showResume ? '▾' : '▸'} Resume an existing session</button>
            ${resume}
        </div>`;
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
        if (!s.pendingPermission) { return ''; }
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

    // The composer has two modes, and they show DIFFERENT controls — a running
    // session has no use for an agent/model picker (both were decided when the
    // process started and cannot change), and showing them greyed out was just
    // a row of dead boxes. What CAN change mid-session is the permission mode,
    // so that one stays a live control; the rest becomes a plain status line.
    function composer(s) {
        const opts = (list, cur) => (list || []).map(o =>
            `<option value="${C.esc(o.id)}"${o.id === cur ? ' selected' : ''}>${C.esc(o.label || o.id)}</option>`).join('');
        const running = s && s.status === 'working';
        const dead = s && (s.status === 'ended' || s.status === 'error');

        const newRow = `<div class="crow">
            <select id="c-agent" title="Which agent — the session opens in its folder">
                <option value="">choose an agent…</option>
                ${(DATA.agents || []).map(a => `<option value="${C.esc(a.id)}"${a.id === st.agentId ? ' selected' : ''}>${C.esc(a.name)}</option>`).join('')}
            </select>
            <select id="c-model" title="Model for the new session (--model)">${opts(DATA.models, st.model)}</select>
            <select id="c-effort" title="Reasoning effort (--effort)">${opts(DATA.efforts, st.effort)}</select>
            <select id="c-perm" title="What it may do without asking (--permission-mode)">${opts(DATA.permissions, st.permissionMode)}</select>
            <span class="grow"></span>
            <button id="c-send">Start session</button>
        </div>`;

        const liveRow = s ? `<div class="crow">
            <span class="fixed" title="Decided when this session started — a running session cannot change them">
                ${C.esc(s.agentName)}${s.model ? ' · ' + C.esc(String(s.model).replace(/^claude-/, '')) : ''}
            </span>
            <label class="permlbl" title="The one thing that CAN change mid-session — applied live">permissions
                <select id="c-perm">${opts(DATA.permissions, s.permissionMode)}</select>
            </label>
            <span class="grow"></span>
            ${s.queued ? `<span class="qbadge" title="Waiting for the current turn to finish">${s.queued} queued</span> <button class="secondary" id="c-clearq">clear</button>` : ''}
            ${running ? '<button class="secondary" id="c-int" title="Stop the running turn — the session and its context stay">⎋ Interrupt</button>' : ''}
            <button id="c-send"${dead ? ' disabled' : ''}>${running ? 'Queue' : 'Send'}</button>
        </div>` : '';

        const placeholder = s
            ? (dead ? 'This session has ended — start a new one to keep talking.'
                : 'Message ' + C.esc(s.agentName) + '…  (Ctrl+Enter sends)')
            : 'Say something to start a session…  (Ctrl+Enter sends)';

        return `<div class="composer">
            <textarea id="c-text" placeholder="${placeholder}"${dead ? ' disabled' : ''}>${C.esc(st.draft || '')}</textarea>
            ${s ? liveRow : newRow}
            ${s ? `<div class="crow" style="font-size:10px;opacity:.6">
                ${s.sessionId ? 'session ' + C.esc(s.sessionId.slice(0, 8)) + ' · ' : ''}${s.contextTokens ? '~' + C.fmtTok(s.contextTokens) + ' ctx · ' : ''}${C.fmtUSD(s.cost)} this session · ${s.turns} turn(s)
                <span class="grow"></span>
                ${s.sessionId ? '<button class="secondary" id="c-transcript">Open transcript</button>' : ''}
                ${dead ? '<button class="secondary" id="c-forget">Remove from list</button>' : '<button class="secondary" id="c-close">End session</button>'}
            </div>` : `<div class="crow" style="font-size:10px;opacity:.6">
                A new session opens in the chosen agent's folder and runs here, in the panel.
            </div>`}
        </div>`;
    }

    function render() {
        const s = sel();
        const talk = s
            ? (s.messages || []).map(messageHtml).join('') || '<div class="empty">Nothing said yet.</div>'
            : `<div class="empty">This is the Console: sessions run <em>here</em>, in the panel — your own <code>claude</code>, your own subscription, transcripts in the usual place.<br><br>Pick an agent below, type, and press Ctrl+Enter.</div>`;
        document.getElementById('app').innerHTML = `${STYLE}
            ${window.AFHeader.html({
                page: 'console',
                title: 'Console',
                sub: s
                    ? `${C.esc(s.agentName)} · ${C.esc(s.status)}${s.exitReason ? ' — ' + C.esc(s.exitReason) : ''}`
                    : `${(DATA.sessions || []).length} hosted session(s) in this window`,
                guide: 'console',
                related: [{ nav: 'timeline', label: 'Live Timeline' }]
            })}
            <div class="cwrap">
                ${sessionList()}
                <div class="cmain">
                    <div class="talk" id="talk">${talk}${s ? permissionBox(s) : ''}</div>
                    ${composer(s)}
                </div>
            </div>`;

        window.AFHeader.wire(vscode, { onRefresh: () => vscode.postMessage({ type: 'refresh' }) });
        const talkEl = document.getElementById('talk');
        if (talkEl) { talkEl.scrollTop = talkEl.scrollHeight; }

        const byId = (id, ev, fn) => { const el = document.getElementById(id); if (el) { el.addEventListener(ev, fn); } };
        document.querySelectorAll('[data-sel]').forEach(r =>
            r.addEventListener('click', () => vscode.postMessage({ type: 'select', id: r.dataset.sel })));
        document.querySelectorAll('[data-resume]').forEach(r =>
            r.addEventListener('click', () => vscode.postMessage({
                type: 'resume', sessionId: r.dataset.resume,
                model: st.model, effort: st.effort, permissionMode: st.permissionMode
            })));
        // Right-click is NOT wired here on purpose — see ctxAttr: the rows carry
        // their identity in `data-vscode-context` and VS Code builds the menu.
        document.querySelectorAll('[data-open]').forEach(b =>
            b.addEventListener('click', () => vscode.postMessage({ type: 'openFile', file: b.dataset.open, diff: false })));
        document.querySelectorAll('[data-diff]').forEach(b =>
            b.addEventListener('click', () => vscode.postMessage({ type: 'openFile', file: b.dataset.diff, diff: true })));
        document.querySelectorAll('[data-grant]').forEach(b =>
            b.addEventListener('click', () => vscode.postMessage({
                type: 'permissionMode', id: DATA.selected, mode: b.dataset.grant, retry: true
            })));

        const text = document.getElementById('c-text');
        const readDraft = () => { st.draft = text ? text.value : ''; save(); };
        if (text) {
            text.addEventListener('input', readDraft);
            text.addEventListener('keydown', ev => {
                if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); send(); }
            });
            text.focus();
        }
        // new-session controls only exist in new-session mode
        const pick = (id, key) => byId(id, 'change', e => { st[key] = e.target.value; save(); });
        if (!s) {
            pick('c-agent', 'agentId');
            pick('c-model', 'model');
            pick('c-effort', 'effort');
        }
        byId('c-perm', 'change', e => {
            const mode = e.target.value;
            if (s) {
                // live, mid-session — the same control the permission box uses
                vscode.postMessage({ type: 'permissionMode', id: s.id, mode, retry: false });
            } else {
                st.permissionMode = mode; save();
            }
        });
        byId('c-send', 'click', send);
        byId('c-int', 'click', () => vscode.postMessage({ type: 'interrupt', id: DATA.selected }));
        byId('c-clearq', 'click', () => vscode.postMessage({ type: 'clearQueue', id: DATA.selected }));
        byId('c-close', 'click', () => vscode.postMessage({ type: 'close', id: DATA.selected }));
        byId('c-forget', 'click', () => vscode.postMessage({ type: 'forget', id: DATA.selected }));
        byId('c-transcript', 'click', () => vscode.postMessage({ type: 'openTranscript', sessionId: s ? s.sessionId : '' }));
        byId('c-new', 'click', () => { vscode.postMessage({ type: 'select', id: '' }); });
        byId('c-toggle-resume', 'click', () => { st.showResume = !st.showResume; save(); render(); });

        function send() {
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
        }
    }

    window.addEventListener('message', ev => {
        if (ev.data && ev.data.type === 'data') {
            DATA = ev.data.data;
            // opened from an agent row: preselect that agent in the composer
            if (DATA.presetAgent) { st.agentId = DATA.presetAgent; save(); }
            render();
        }
    });
    if (DATA.presetAgent) { st.agentId = DATA.presetAgent; save(); }

    render();
})();
