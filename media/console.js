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
    /** An unasked question — the resume list exactly as it was before it could
     *  be filtered at all (see core/consoleresume.ts). */
    const EMPTY_RQ = () => ({
        text: '', agent: '', when: '', from: '', to: '',
        pinnedOnly: false, userOnly: false, limit: 0
    });
    let st = Object.assign({
        agentId: '', model: '', effort: '', permissionMode: '', draft: '', showResume: false,
        // which kinds of line the conversation shows; null = everything
        kinds: null,
        // is the miniature filter open, and what is it asking for
        showRFilter: false, rq: EMPTY_RQ()
    }, saved.afConsole);
    st.rq = Object.assign(EMPTY_RQ(), st.rq);
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
        /* ‼️ The Console is an APP, not a document: it is exactly as tall as the
           window and NOTHING here scrolls the page. Two things made the composer
           slide off the bottom, and both were "the page grows":
             · #app had a MIN-height of 100% — a floor, not a ceiling, so every
               arriving line made the page taller and pushed the composer down;
             · the session list on the left had no ceiling either, so a long list
               of past sessions stretched the row and did the same thing.
           Now: the page is clipped to the window (overflow:hidden), the app is
           height:100%, and the two things that CAN be long — the conversation
           and the session list — are the only scrollers. The composer sits under
           the conversation, on the window's bottom edge, whatever either of them
           does. min-height:0 on every flex ancestor is what lets a child scroll
           instead of stretching its parent (a flex item's floor is its content
           unless you say otherwise — that is the whole bug, twice).
           Measured in Chromium at 1200x700 and 820x420, with 40 sessions and
           320 lines: page never scrolls, composer bottom identical before and
           after 200 streamed lines and after 100 more sessions. */
        html, body { height:100%; }
        body { overflow:hidden; padding:16px 20px 12px; }
        #app { height:100%; min-height:0; display:flex; flex-direction:column; }
        #c-head { flex:none; }
        .cwrap { display:flex; gap:14px; align-items:stretch; flex:1 1 auto; min-height:0; }
        .clist { flex:0 0 250px; display:flex; flex-direction:column; gap:6px;
            min-width:0; min-height:0; overflow-y:auto; overflow-x:hidden; }
        /* The column is four independent sections, not one block of html: the
           filter you are TYPING in must not be destroyed and rebuilt every time
           a streamed line arrives (that is the same bug the composer had). Each
           section is written separately, and only when its content differs. */
        .clist > div { display:flex; flex-direction:column; gap:6px; min-width:0; }
        .clist > div:empty { display:none; }
        .cmain { flex:1 1 auto; display:flex; flex-direction:column; min-width:0; min-height:0; }
        .srow { border:1px solid var(--vscode-widget-border,#4443); border-radius:7px; padding:7px 9px;
            cursor:pointer; background:var(--vscode-editor-background); }
        .srow:hover { background:var(--vscode-list-hoverBackground); }
        /* Selection is a RING, never a colour: a link-blue tint on the selected
           card competed with the blue that means "the agent is working", and two
           blues on one card is exactly the ambiguity this system exists to
           remove. The phase owns the colour; selection owns the outline. */
        .srow.sel { border-color:var(--vscode-focusBorder);
            box-shadow:inset 0 0 0 1px var(--vscode-focusBorder); }
        .srow .h { display:flex; align-items:center; gap:6px; justify-content:space-between; }
        .srow .n { font-weight:600; font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .srow .m { font-size:10px; color:var(--vscode-descriptionForeground); margin-top:2px; }
        /* A meta line too long for 250px wraps at a "·", never inside a figure:
           "ctx" on one line and "132.0k" on the next is not a reading. */
        .srow .m.wrap { white-space:normal; }
        .srow .m .pair { white-space:nowrap; }
        /* ---- whose turn is it (see phaseOf) --------------------------------
           A card carries its phase three ways at once — a coloured edge, a dot
           and a WORD — so it survives a light theme, a colourblind reader and a
           glance from two metres away. Only the transient state moves. */
        .srow { border-left:3px solid transparent; transition:background .18s ease; }
        .srow .dot { background:var(--vscode-descriptionForeground,#888); }
        .srow .phase { text-transform:lowercase; }
        /* YOUR TURN — the only saturated thing on the panel, and static: it
           persists, and a persistent animation is nagging. */
        .srow.p-you { border-left-color:var(--vscode-charts-green,#4caf50);
            background:color-mix(in srgb, var(--vscode-charts-green,#4caf50) 7%, transparent); }
        .srow.p-you .dot { background:var(--vscode-charts-green,#4caf50);
            box-shadow:0 0 0 3px color-mix(in srgb, var(--vscode-charts-green,#4caf50) 22%, transparent); }
        .srow.p-you .phase { color:var(--vscode-charts-green,#4caf50); font-weight:600; }
        /* BLOCKED — the same ball, heavier: nothing moves until you decide. */
        .srow.p-blocked { border-left-color:var(--vscode-editorWarning-foreground,#cca700);
            background:color-mix(in srgb, var(--vscode-editorWarning-foreground,#cca700) 9%, transparent); }
        .srow.p-blocked .dot { background:var(--vscode-editorWarning-foreground,#cca700);
            box-shadow:0 0 0 3px color-mix(in srgb, var(--vscode-editorWarning-foreground,#cca700) 22%, transparent); }
        .srow.p-blocked .phase { color:var(--vscode-editorWarning-foreground,#cca700); font-weight:600; }
        /* AGENT WORKING — the one state that moves, because it really is moving.
           A slow breath (1.8s), opacity only: no layout, no colour flashing. */
        .srow.p-agent { border-left-color:color-mix(in srgb, var(--vscode-charts-blue,#3794ff) 60%, transparent); }
        .srow.p-agent .dot { background:var(--vscode-charts-blue,#3794ff); animation:afbreath 1.8s ease-in-out infinite; }
        .srow.p-agent .phase { color:var(--vscode-charts-blue,#3794ff); }
        @keyframes afbreath { 0%,100% { opacity:1; } 50% { opacity:.35; } }
        @media (prefers-reduced-motion: reduce) { .srow.p-agent .dot { animation:none; } }
        .srow.p-open .dot { background:var(--vscode-charts-yellow,#cca700); }
        .srow.p-over { opacity:.55; }
        .srow.p-error { border-left-color:var(--vscode-charts-red,#f14c4c); }
        .srow.p-error .dot { background:var(--vscode-charts-red,#f14c4c); }
        /* the count above the cards: the nudge you can click, never a popup */
        .callout { display:flex; align-items:center; gap:7px; width:100%; text-align:left;
            margin:6px 0 2px; font-size:11px; padding:5px 9px; border-radius:7px;
            color:var(--vscode-charts-green,#4caf50); font-weight:600;
            background:color-mix(in srgb, var(--vscode-charts-green,#4caf50) 10%, transparent);
            border:1px solid color-mix(in srgb, var(--vscode-charts-green,#4caf50) 35%, transparent); }
        .callout:hover { background:color-mix(in srgb, var(--vscode-charts-green,#4caf50) 18%, transparent); }
        .callout .cdot { width:7px; height:7px; border-radius:50%; flex:none;
            background:var(--vscode-charts-green,#4caf50); }
        .callout .cage { margin-left:auto; font-weight:400; opacity:.8; }
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
        /* "still working" — between the conversation and the composer, so it
           never moves either of them (flex:none: it takes its own height) */
        .working { flex:none; font-size:11px; padding:5px 4px 0; display:flex; gap:6px;
            align-items:baseline; color:var(--vscode-descriptionForeground); }
        .working:empty { display:none; }
        .working b { color:var(--vscode-foreground); font-weight:600;
            overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .working .spin { color:var(--vscode-charts-blue,#3794ff); font-size:13px; }
        .working .wmeta { margin-left:auto; opacity:.75; white-space:nowrap; }
        /* ---- the resume section: a header row, a miniature filter, the rows --
           Everything here is sized for a 250px column: 10px type, one-line
           controls, and every box allowed to shrink (min-width:0) so nothing
           can push the column wider than the page gave it. */
        .rhead { flex-direction:row !important; gap:4px !important; align-items:stretch; margin-top:6px; }
        .rhead .rtoggle { flex:1 1 auto; min-width:0; text-align:left; overflow:hidden;
            text-overflow:ellipsis; white-space:nowrap; }
        .rhead .rfilter { flex:none; width:28px; padding:0; font-size:11px; }
        .rhead .rfilter.on { background:var(--vscode-button-background); color:var(--vscode-button-foreground); }
        .rpanel { gap:4px !important; padding:6px; border-radius:6px;
            border:1px solid var(--vscode-widget-border,#4443); }
        .rpanel input, .rpanel select { font-size:10px; padding:1px 3px; width:100%; min-width:0;
            border-radius:3px; border:1px solid var(--vscode-widget-border,#4443);
            background:var(--vscode-input-background); color:var(--vscode-input-foreground); }
        .rrow { display:flex; gap:4px; align-items:center; }
        .rrow > * { flex:1 1 0; min-width:0; }
        /* A chip is as wide as its word; the row's slack goes to the count box,
           which is the only thing in it you type into. */
        .rrow > .rchip { flex:0 1 auto; }
        .rchip { font-size:10px; padding:1px 5px; border-radius:9px; cursor:pointer; white-space:nowrap;
            background:transparent; color:var(--vscode-foreground); opacity:.7;
            border:1px solid var(--vscode-widget-border,#4444); }
        .rchip.on { background:var(--vscode-button-background); color:var(--vscode-button-foreground);
            opacity:1; border-color:transparent; }
        .rn { font-size:10px; display:flex; align-items:center; justify-content:flex-end; gap:3px;
            opacity:.85; white-space:nowrap; }
        /* the spinner arrows ate half the box at this size */
        .rn input { width:38px; flex:none; text-align:right; -moz-appearance:textfield; }
        .rn input::-webkit-outer-spin-button, .rn input::-webkit-inner-spin-button {
            -webkit-appearance:none; margin:0; }
        .rcount { flex-direction:row !important; gap:5px !important; align-items:baseline;
            font-size:10px; opacity:.7; padding:1px 2px 0; }
        .backhead { font-size:10px; opacity:.7; margin:8px 0 2px; text-transform:uppercase; letter-spacing:.4px; }
        .srow.back { border-style:dashed; }
        .srow.back .only { background:none; border:none; opacity:.5; cursor:pointer; font-size:11px; padding:0 3px; }
        .srow.back .only:hover { opacity:1; }
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
        /* typed while a turn runs: waiting, not said (see queueHtml) */
        .qwait:empty { display:none; }
        .qwait { margin:0 0 7px; padding:6px 9px; border-radius:7px;
            border:1px dashed var(--vscode-widget-border,#4444);
            background:color-mix(in srgb, var(--vscode-editorWarning-foreground,#cca700) 8%, transparent); }
        .qwait .qhead { font-size:10px; opacity:.75; margin-bottom:3px; }
        .qwait .qline { font-size:11px; opacity:.9; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .qwait .qline::before { content:'· '; opacity:.6; }
        .linkish { background:none; border:none; padding:0; font:inherit; cursor:pointer;
            color:var(--vscode-textLink-foreground); text-decoration:underline; }
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
        const h = Math.round(m / 60);
        // Days, because the resume list now reaches back as far as you ask it
        // to: "504h ago" is a number you have to do arithmetic on to read.
        if (h < 24) { return h + 'h'; }
        return Math.round(h / 24) + 'd';
    }

    const sel = () => (DATA.sessions || []).find(s => s.id === DATA.selected);

    /**
     * Money and what it bought, in the ONE order this page uses everywhere: the
     * cost first, the tokens that paid for it in parentheses.
     *
     * A dollar figure on its own is unreadable — $0.03 of haiku and $0.03 of
     * opus are not the same event — so the two are never written apart. Session
     * totals, the running turn and the line that closes a turn all say it this
     * shape, so the live estimate and the CLI's own final figure can be read
     * against each other without translating between two layouts.
     */
    const spend = (cost, tokens) => `${C.fmtUSD(cost || 0)}${tokens ? ` (${C.fmtTok(tokens)} tokens)` : ''}`;
    /**
     * On a CARD there is room for one figure, and it is the tokens.
     *
     * A 250px row cannot carry both without the session's name losing the space
     * it needs more, and of the two the tokens are the one that means something
     * on its own: `$0.03` does not say whether that was haiku thinking briefly
     * or opus barely starting, while `48.2k` is the same measure whatever ran.
     * The money is one hover away, and both strips under the conversation carry
     * it in full.
     */
    const tokBadge = tokens => (tokens ? `${C.fmtTok(tokens)} tok` : '');
    const tokTip = (tokens, cost) => (tokens ? `${C.fmtTok(tokens)} tokens` : 'nothing spent yet')
        + (cost ? ` · ${C.fmtUSD(cost)} spent` : '');

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
     *
     * Every key in this object becomes a **context key** while the menu is up,
     * which is how a card's own state reaches the menu: the `enablement` clause
     * on `agentfarm.console*` reads `afConsoleLive` / `afConsoleEnded` /
     * `afConsoleWorking` and greys out what cannot be done to this session yet.
     * Greying is the point — hiding "Remove from list" until the session ends
     * would make the menu change shape under the pointer, and you would never
     * learn that removing is what comes after ending.
     */
    const ctxAttr = o => `data-vscode-context="${JSON.stringify(o)
        .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}"`;

    /**
     * WHOSE TURN IS IT — the one question the left panel has to answer at a
     * glance, across eight cards, without becoming a Christmas tree.
     *
     * The states are not "statuses", they are who holds the ball:
     *   you      — it replied and stopped. The state that has to reach you.
     *   blocked  — it refused a tool and cannot go on until you decide. Same
     *              ball, heavier: nothing at all happens until you look.
     *   agent    — a turn is running. Transient, resolves itself.
     *   sent     — you spoke while it was working; your words are queued.
     *   opening  — the process is starting.
     *   new      — a session with nothing said yet. Not a nudge; you just made it.
     *   over     — ended or errored. Recedes.
     *
     * The grammar that keeps it calm:
     *   · MOTION ONLY FOR THE TRANSIENT ONE. The working dot breathes, because
     *     something really is happening. "Your turn" persists — animating a
     *     persistent state is nagging, so it gets CONTRAST instead: a filled
     *     left bar, a faint tint and a chip, on a panel where nothing else is
     *     saturated. It is the only loud thing, so it is found instantly.
     *   · COLOUR IS NEVER ALONE. Every state also says its word, so it survives
     *     a colourblind reader, a light theme and a high-contrast theme.
     *   · THE NUDGE IS TIME, NOT ANIMATION: "your turn · 6m" grows by itself.
     *   · THE LIST NEVER REORDERS. Cards that jump are the definition of
     *     irritating; the count above the list jumps you instead, on a click.
     */
    function phaseOf(s) {
        if (!s) { return { id: 'new', label: '', cls: '' }; }
        if (s.status === 'error') { return { id: 'over', label: 'error', cls: 'p-error' }; }
        if (s.status === 'ended') { return { id: 'over', label: 'ended', cls: 'p-over' }; }
        if (s.pendingPermission) { return { id: 'blocked', label: 'needs permission', cls: 'p-blocked' }; }
        if (s.status === 'starting') { return { id: 'opening', label: 'starting…', cls: 'p-open' }; }
        if ((s.queued || []).length) { return { id: 'sent', label: 'your message is queued', cls: 'p-agent' }; }
        if (s.status === 'working') { return { id: 'agent', label: 'working', cls: 'p-agent' }; }
        if (!s.turns) { return { id: 'new', label: 'nothing said yet', cls: '' }; }
        return { id: 'you', label: 'your turn', cls: 'p-you' };
    }

    /** The sessions holding a ball that is yours — the panel's whole point. */
    const needingYou = () => (DATA.sessions || [])
        .filter(s => ['you', 'blocked'].indexOf(phaseOf(s).id) >= 0)
        .sort((a, b) => (a.lastTs || 0) - (b.lastTs || 0));   // longest wait first

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
        // The line that closes a turn: how long it took, what it spent, what it
        // cost. A turn is the unit you think in — "was that worth it?" was
        // unanswerable while the numbers only existed per session.
        const bits = [];
        if (m.text) { bits.push(m.text); }
        if (m.ms) { bits.push(m.ms >= 60000 ? `${Math.round(m.ms / 6000) / 10}m` : `${Math.round(m.ms / 100) / 10}s`); }
        // the same shape the live strip used while this turn was running, so the
        // estimate and the CLI's own figure land in the same place
        if (m.cost || m.tokens) { bits.push(spend(m.cost, m.tokens)); }
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
        const rows = (DATA.sessions || []).map(s => {
            const p = phaseOf(s);
            // the nudge is the WAIT, and it grows on its own
            const waited = p.id === 'you' || p.id === 'blocked' ? relTime(s.lastTs) : '';
            const dead = s.status === 'ended' || s.status === 'error';
            return `
            <div class="srow ${p.cls}${s.id === DATA.selected ? ' sel' : ''}" data-sel="${C.esc(s.id)}"
                 ${ctxAttr({
                     webviewSection: 'afConsoleSession', preventDefaultContextMenuItems: false,
                     // the hosted process this card is: what End / Remove act on
                     hostId: s.id,
                     sessionId: s.sessionId || '', title: s.title || '',
                     agentName: s.agentName || '', cwd: s.cwd || '',
                     // …and the card's STATE, so the menu can grey out what
                     // cannot be done to it right now (see ctxAttr)
                     afConsoleLive: !dead, afConsoleEnded: dead,
                     afConsoleWorking: s.status === 'working'
                 })}
                 title="${C.esc(s.title || 'not named yet')} — ${C.esc(p.label)} — right-click for session actions">
                <div class="h">
                    <span class="n"><span class="dot"></span>${who(s.agentName, s.sessionId)}</span>
                    <span class="m" title="${C.esc(tokTip(s.tokens, s.cost))}">${tokBadge(s.tokens)}</span>
                </div>
                <div class="t2">${C.esc(s.title || '(no name yet)')}</div>
                <div class="m"><span class="phase">${C.esc(p.label)}${waited ? ` · ${waited}` : ''}</span>${(s.queued || []).length ? ` · ${s.queued.length} waiting` : ''}${s.turns ? ` · ${s.turns} turns` : ''}${s.contextTokens ? ` · <span class="pair" title="Approximate context in the model window right now">ctx ${C.fmtTok(s.contextTokens)}</span>` : ''}</div>
            </div>`;
        }).join('');
        // One line above the cards, only when something is actually waiting:
        // the count, and a click that takes you to the one that has waited
        // longest. This is the "nudge" — under your control, never a popup.
        const need = needingYou();
        const longest = need.length ? relTime(need[0].lastTs) : '';
        const callout = need.length ? `
            <button class="callout" id="c-next" title="Go to the session that has been waiting longest">
                <span class="cdot"></span>${need.length} waiting for you
                <span class="cage">longest ${longest}</span>
            </button>` : '';
        // Where you were when the last window went away. A hosted session ends
        // with its window — measured: `--resume` picks the SAME session back up,
        // same id, same transcript, and the model still remembers — so the only
        // thing that has to survive a close, a reload or a power cut is knowing
        // where you were. These rows are that, on top, one click from continuing.
        const back = (DATA.lastWindow || []).length ? `
            <div class="backhead">⟲ Where you left off</div>
            ${(DATA.lastWindow || []).map(r => `
            <div class="srow back" data-back="${C.esc(r.sessionId)}"
                 title="Continue this conversation here — it ended when the window did, and picks up with everything that was said">
                <div class="h">
                    <span class="n">${who(r.agentName, r.sessionId)}</span>
                    <button class="only" data-backforget="${C.esc(r.sessionId)}" title="Take it off this shelf">✕</button>
                </div>
                <div class="t2">${C.esc(r.title || '(no name)')}</div>
                <div class="m">ended ${relTime(r.endedAt)} ago · click to continue</div>
            </div>`).join('')}` : '';
        return `<button id="c-new">＋ New session</button>
            ${callout}
            ${back}
            ${rows || '<div class="empty">No hosted sessions yet. Pick an agent below and say something — the process starts here, in the panel.</div>'}`;
    }

    /**
     * The resume section's header: open the list, and open its filter.
     *
     * Two buttons, because they are two decisions — "show me the old sessions"
     * and "not these ones, THAT one". The filter button stays lit while a
     * filter is set even with the panel collapsed: a list that is quietly
     * hiding things must say so, or you go looking for a session that the panel
     * decided not to show you.
     */
    function resumeHeadHtml() {
        const on = DATA.resumeFiltered;
        return `<div class="rhead">
            <button class="secondary rtoggle" id="c-toggle-resume"
                title="The sessions on your shelf and the transcripts on this machine — click one to carry it on in the panel">
                ${st.showResume ? '▾' : '▸'} Resume an existing session
            </button>
            <button class="secondary rfilter${on ? ' on' : ''}" id="c-toggle-rfilter"
                title="${on ? 'A filter is narrowing this list — click to see or clear it' : 'Filter these sessions: name, agent, when, your shelf, how many'}">⌕</button>
        </div>`;
    }

    /**
     * The miniature filter — the Sessions tables' own vocabulary, in 250px.
     *
     * ‼️ The typed values are deliberately NOT in this html. This section is
     * re-rendered whenever its markup differs, and putting `value="…"` in it
     * would mean every keystroke rebuilt the box you are typing in — the exact
     * bug that made the composer unusable before 3.31.0. The boxes are filled
     * in afterwards, imperatively, and never while they have the focus.
     */
    function resumePanelHtml() {
        if (!st.showResume || !st.showRFilter) { return ''; }
        const q = st.rq;
        const agents = (DATA.resumeAgents || []);
        const opt = (v, t, cur) => `<option value="${C.esc(v)}"${v === cur ? ' selected' : ''}>${C.esc(t)}</option>`;
        const chip = (id, label, on, tip) =>
            `<button class="rchip${on ? ' on' : ''}" id="${id}" title="${C.esc(tip)}">${label}</button>`;
        return `<div class="rpanel">
            <input type="text" id="c-rq-text" placeholder="name, agent or label…"
                   title="Matched against the session's name, its agent and its labels">
            <div class="rrow">
                <select id="c-rq-agent" title="Only this agent's sessions">
                    ${opt('', 'every agent', q.agent)}${agents.map(a => opt(a, a, q.agent)).join('')}
                </select>
                <select id="c-rq-when" title="When the session was last touched">
                    ${opt('', 'any time', q.when)}${opt('1', 'last 24h', q.when)}${opt('7', 'last 7 days', q.when)}${opt('30', 'last 30 days', q.when)}${opt('90', 'last 90 days', q.when)}${opt('custom', 'between…', q.when)}
                </select>
            </div>
            ${q.when === 'custom' ? `<div class="rrow">
                <input type="date" id="c-rq-from" title="From this day">
                <input type="date" id="c-rq-to" title="To this day, included">
            </div>` : ''}
            <div class="rrow">
                ${chip('c-rq-pin', '📌 shelf', q.pinnedOnly, 'Only the sessions you pinned')}
                ${chip('c-rq-user', '🧑 mine', q.userOnly, 'Hide automation runs — schedule, trigger, task, mission')}
                <label class="rn" title="How many to list. Your shelf is always shown on top of this.">show
                    <input type="number" id="c-rq-n" min="1" max="${Number(DATA.resumeMax) || 200}"
                           placeholder="${Number(DATA.resumeDefaultN) || 15}">
                </label>
            </div>
        </div>`;
    }

    /**
     * The rows themselves, and one line saying how much of the whole they are.
     *
     * A session a live process already owns cannot be joined — resuming it
     * would start a second process on the same transcript — so the row says so
     * instead of offering it as if it were free.
     */
    function resumeListHtml() {
        if (!st.showResume) { return ''; }
        const owned = new Set(DATA.owned || []);
        const list = DATA.resumable || [];
        const rows = list.map(r => `
            <div class="srow${owned.has(r.sessionId) ? ' owned' : ''}" data-resume="${C.esc(r.sessionId)}"
                 ${ctxAttr({
                     webviewSection: 'afConsoleResumable', preventDefaultContextMenuItems: false,
                     sessionId: r.sessionId, title: r.title || '', agentName: r.agentName || '', cwd: r.cwd || ''
                 })}
                 title="${owned.has(r.sessionId) ? 'Open right now in a terminal or another process — Agent Farm cannot join a running session' : C.esc(r.cwd) + ' — right-click for session actions'}">
                <div class="n">${r.pinned ? '📌 ' : ''}${C.esc(r.title)}</div>
                <div class="m wrap">${who(r.agentName, r.sessionId)} · ${relTime(r.ts)} ago${r.tokens ? ` · <span class="pair" title="${C.esc(tokTip(r.tokens, r.cost))}">${tokBadge(r.tokens)}</span>` : ''}${r.contextTokens ? ` · <span class="pair" title="Approximate context after this session's last reply — what resuming it starts from">ctx ${C.fmtTok(r.contextTokens)}</span>` : ''}</div>
            </div>`).join('');
        // How many of how many — a list that silently ends at fifteen is why
        // the filter had to exist in the first place.
        const total = Number(DATA.resumeTotal) || 0;
        const capped = list.length >= (Number(DATA.resumeMax) || 200);
        const count = `<div class="rcount">
            <span title="${capped ? 'The most this panel will list at once — narrow the filter to see further' : 'How many of your sessions this list is showing'}">${list.length} of ${total}${capped ? ' (max)' : ''}</span>
            ${DATA.resumeFiltered ? '<span>·</span><button class="linkish" id="c-rq-clear" title="Back to the default list: your shelf and the newest sessions">clear filter</button>' : ''}
        </div>`;
        return (rows || `<div class="empty">${DATA.resumeFiltered ? 'No session matches this filter.' : 'No transcripts yet.'}</div>`) + count;
    }

    /**
     * "It is still working" — said out loud, the way a terminal does.
     *
     * Between your message and the first line of the reply the panel used to
     * show nothing at all, and nothing is exactly what a dead session shows.
     * This strip is the difference: a turning glyph (so it is visibly *live*,
     * not a frozen label), the seconds, and — better than a spinner — **what it
     * is doing right now**, taken from the last tool the agent reached for.
     * It sits between the conversation and the composer, so it never moves the
     * conversation and never scrolls away.
     *
     * **This strip is about the TURN, the line under the composer is about the
     * SESSION.** Both used to show "ctx" — the same session-wide number, twice,
     * three centimetres apart — while the question you actually have about a
     * running turn (what is this one costing me?) had no answer anywhere. So
     * the context figure now belongs to the session line alone, and the turn
     * gets its own numbers: how long, how many tokens, what they are worth, and
     * how many lines it has produced.
     */
    const SPIN = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let spinTimer = null;
    /** advanced by the repaint itself, not read off the clock: the glyph must
     *  move once per paint, whatever the timer's drift does */
    let spinAt = 0;

    /** How many lines this turn has produced: everything since your own last
     *  message. The count you can see growing IS the turn. */
    function turnLines(s) {
        const list = (s && s.messages) || [];
        for (let i = list.length - 1; i >= 0; i--) {
            if (list[i].role === 'user') { return list.length - 1 - i; }
        }
        return list.length;
    }

    function workingHtml(s) {
        if (!s || s.status !== 'working') { return ''; }
        const glyph = SPIN[spinAt % SPIN.length];
        const secs = s.turnStartedAt ? Math.max(0, Math.round((Date.now() - s.turnStartedAt) / 1000)) : 0;
        // what it reached for last — the honest version of "Thinking…"
        let doing = 'working';
        for (let i = (s.messages || []).length - 1; i >= 0; i--) {
            const m = s.messages[i];
            if (m.role === 'user') { break; }
            if (m.role === 'tool' && m.tool) {
                doing = m.tool.detail ? `${m.tool.name} ${m.tool.detail}` : m.tool.name;
                break;
            }
        }
        const q = queuedOf(s).length;
        // What this turn is spending, as it spends it. The CLI only reports a
        // turn's real cost when the turn ends, so the money here is priced off
        // the tokens seen so far and carries a "~" until then — the line that
        // closes the turn, two centimetres up, is the CLI's own figure.
        const cost = s.turnTokens || s.turnCost
            ? ` · <span title="What this turn has spent so far. The money is an estimate at the usual rates — the turn's closing line carries the CLI's own figure.">~${spend(s.turnCost, s.turnTokens)}</span>`
            : '';
        const lines = turnLines(s);
        return `<span class="spin">${glyph}</span> <b>${C.esc(doing)}</b>
            <span class="wmeta">${secs}s${cost}${lines ? ` · ${lines} line${lines === 1 ? '' : 's'}` : ''}${q ? ` · ${q} waiting` : ''} · ⎋ Interrupt stops it</span>`;
    }

    /** The glyph has to turn on its own — a data push only arrives when the CLI
     *  says something, and the quiet stretches are exactly when you need it. */
    function paintWorking() {
        const el = document.getElementById('c-working');
        if (!el) { return; }
        const s = sel();
        spinAt = (spinAt + 1) % (SPIN.length * 6);
        const html = workingHtml(s);
        if (el.innerHTML !== html) { el.innerHTML = html; }
        const running = !!(s && s.status === 'working');
        if (running && !spinTimer) {
            spinTimer = setInterval(paintWorking, 120);
        } else if (!running && spinTimer) {
            clearInterval(spinTimer);
            spinTimer = null;
        }
    }

    function talkHtml(s, shown) {
        if (!s) {
            return `<div class="empty">This is the Console: sessions run <em>here</em>, in the panel — your own <code>claude</code>, your own subscription, transcripts in the usual place.<br><br>Pick an agent below, type, and press Ctrl+Enter.</div>`;
        }
        const body = shown.map(messageHtml).join('')
            || `<div class="empty">${(s.messages || []).length ? 'Every line is filtered out — widen <b>show</b> in the composer.' : 'Nothing said yet.'}</div>`;
        return body + permissionBox(s);
    }

    const queuedOf = s => ((s && s.queued) || []);

    /** The bits of the live composer row that change while a turn runs. */
    function liveBitsHtml(s) {
        if (!s) { return ''; }
        const q = queuedOf(s).length;
        return `${q ? `<span class="qbadge" title="Waiting for the current turn to finish">${q} waiting</span> <button class="secondary" id="c-clearq">clear</button>` : ''}
            ${s.status === 'working' ? '<button class="secondary" id="c-int" title="Stop the running turn — the session and its context stay">⎋ Interrupt</button>' : ''}`;
    }

    /**
     * What you typed while a turn was running — waiting, not said.
     *
     * It used to go straight into the conversation, which put it above the
     * reply it was asked after and shoved the running turn up the page. A
     * terminal keeps it on the line until it is sent; so does this. It sits
     * here, in order, until the turn ends and it is really handed over.
     */
    function queueHtml(s) {
        const q = queuedOf(s);
        if (!q.length) { return ''; }
        const one = t => `<div class="qline" title="${C.esc(t)}">${C.esc(t.length > 160 ? t.slice(0, 160) + '…' : t)}</div>`;
        return `<div class="qhead">⏳ ${q.length} message${q.length === 1 ? '' : 's'} waiting — sent when this turn ends</div>${q.map(one).join('')}`;
    }

    function statusHtml(s) {
        if (!s) {
            // Coming from an agent page ("Talk to Agent") lands here with that
            // agent already chosen. If it ALSO has a session running in this
            // window, say so — starting a second one by accident is the one
            // mistake this screen can cause.
            const live = st.agentId
                ? (DATA.sessions || []).find(x => x.agentId === st.agentId
                    && x.status !== 'ended' && x.status !== 'error')
                : undefined;
            return live
                ? `${C.esc(live.agentName)} already has a session running here — <button class="linkish" id="c-goto-live">open it</button> instead, or say something below to start a second one.`
                : `A new session opens in the chosen agent's folder and runs here, in the panel.`;
        }
        const dead = s.status === 'ended' || s.status === 'error';
        // The whole session, in one line: what the window is holding, what the
        // conversation has cost and the tokens that bought it, how many turns.
        // (The turn that is running has its own line above the box — the two
        // used to say "ctx" at each other and nothing else.)
        return `${s.sessionId ? 'session ' + C.esc(s.sessionId.slice(0, 8)) + ' · ' : ''}${s.contextTokens ? `<span title="Approximate context in the model window right now">~${C.fmtTok(s.contextTokens)} ctx</span> · ` : ''}<span title="Everything this session has spent, as the CLI reported it — and the tokens it bought">${spend(s.cost, s.tokens)}</span> this session · ${s.turns} turn${s.turns === 1 ? '' : 's'}
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
            guide: 'console'
            // No `related` here: Live Timeline is in the global nav already, and
            // a page that adds it again gives the header the SAME button twice.
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
                    ${C.esc(s.agentName)}${s.model ? ' · ' + C.esc(String(s.model).replace(/^claude-/, '')) : ''}${s.effort ? ' · ' + C.esc(s.effort) + ' effort' : ''}
                </span>
                <label class="permlbl" title="The one thing that CAN change mid-session — applied live">permissions
                    <select id="c-perm">${opts(DATA.permissions, s.permissionMode)}</select>
                </label>
                ${window.AFFilter.multi({
                    // allLabel is what follows "show: " — repeating the word
                    // here is how the button came to read "show: show: …"
                    id: 'c-kinds', label: 'show', allLabel: 'everything',
                    options: KINDS, selected: st.kinds,
                    title: 'Which kinds of line the conversation shows — tick any combination'
                })}
                <span class="grow"></span>
                <span id="c-live"></span>
                <button id="c-send"${dead ? ' disabled' : ''}>Send</button>`
            : `<select id="c-agent" title="Which agent — the session opens in its folder">
                    <option value="">Choose an agent…</option>
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
                <div class="clist">
                    <div id="c-list"></div>
                    <div id="c-rhead"></div>
                    <div id="c-rpanel"></div>
                    <div id="c-rlist"></div>
                </div>
                <div class="cmain">
                    <div class="talkwrap">
                        <div class="talk" id="talk"><div class="talkinner" id="talkinner"></div></div>
                        <button class="jump" id="c-jump" hidden></button>
                        <div class="hiddenote" id="c-hidden"></div>
                    </div>
                    <div class="working" id="c-working"></div>
                    <div class="composer">
                        <div class="qwait" id="c-queue"></div>
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
                // Esc stops the running turn — the terminal's own key, and the
                // working strip promises it. It does nothing when nothing runs,
                // so it never eats an Escape you meant for something else.
                if (ev.key === 'Escape') {
                    const cur = sel();
                    if (cur && cur.status === 'working') {
                        ev.preventDefault();
                        vscode.postMessage({ type: 'interrupt', id: cur.id });
                    }
                }
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

    /**
     * The left panel, drawn and wired.
     *
     * Its own function because it has TWO reasons to be redrawn: a data push,
     * and **the clock** (see the tick below). Everything else on the page
     * changes only when the CLI says something.
     */
    const byId = (id, ev, fn) => { const el = document.getElementById(id); if (el) { el.addEventListener(ev, fn); } };

    function renderList() {
        if (slot('c-list', sessionListHtml())) {
            document.querySelectorAll('[data-sel]').forEach(r =>
                r.addEventListener('click', () => vscode.postMessage({ type: 'select', id: r.dataset.sel })));
            // "Where you left off": the same resume, from the shelf
            document.querySelectorAll('[data-back]').forEach(r =>
                r.addEventListener('click', ev => {
                    if (ev.target && ev.target.dataset && ev.target.dataset.backforget) { return; }
                    vscode.postMessage({
                        type: 'resume', sessionId: r.dataset.back,
                        model: st.model, effort: st.effort, permissionMode: st.permissionMode
                    });
                }));
            document.querySelectorAll('[data-backforget]').forEach(b =>
                b.addEventListener('click', ev => {
                    ev.stopPropagation();
                    vscode.postMessage({ type: 'forgetLastWindow', sessionId: b.dataset.backforget });
                }));
            byId('c-new', 'click', () => vscode.postMessage({ type: 'select', id: '' }));
            // the nudge, answered: go to whichever has waited longest
            byId('c-next', 'click', () => {
                const next = needingYou()[0];
                if (next) { vscode.postMessage({ type: 'select', id: next.id }); }
            });
        }
        renderResume();
    }

    /** The query the host is answering right now — sent whenever it changes,
     *  and once at startup if the section was left open. */
    function postResume() {
        vscode.postMessage({ type: 'resumeQuery', open: !!st.showResume, query: st.rq });
    }

    /** A change made in the panel: remember it, ask the host, redraw the rest.
     *  The panel itself is NOT redrawn on a typed change (see resumePanelHtml). */
    function rqChanged(structural) {
        save();
        postResume();
        if (structural) { renderResume(); }
    }

    function renderResume() {
        if (slot('c-rhead', resumeHeadHtml())) {
            byId('c-toggle-resume', 'click', () => {
                st.showResume = !st.showResume;
                // opening the list is what makes the host compute it at all
                rqChanged(true);
            });
            byId('c-toggle-rfilter', 'click', () => {
                // asking for the filter while the list is closed opens the list:
                // a filter over something you cannot see is a dead control
                if (!st.showResume) { st.showResume = true; }
                st.showRFilter = !st.showRFilter;
                rqChanged(true);
            });
        }

        if (slot('c-rpanel', resumePanelHtml())) { wireResumePanel(); }
        fillResumePanel();

        if (slot('c-rlist', resumeListHtml())) {
            document.querySelectorAll('[data-resume]').forEach(r =>
                r.addEventListener('click', () => vscode.postMessage({
                    type: 'resume', sessionId: r.dataset.resume,
                    model: st.model, effort: st.effort, permissionMode: st.permissionMode
                })));
            byId('c-rq-clear', 'click', () => {
                st.rq = EMPTY_RQ();
                rqChanged(true);
                fillResumePanel(true);
            });
        }
    }

    /** Typing is debounced: every keystroke otherwise asks the host to walk the
     *  whole index and push a new snapshot back. */
    let rqTimer = null;
    function rqTyped(fn) {
        fn();
        if (rqTimer) { clearTimeout(rqTimer); }
        rqTimer = setTimeout(() => { rqTimer = null; rqChanged(false); }, 250);
    }

    function wireResumePanel() {
        const on = (id, ev, fn) => byId(id, ev, fn);
        const el = id => document.getElementById(id);
        on('c-rq-text', 'input', () => rqTyped(() => { st.rq.text = el('c-rq-text').value; }));
        on('c-rq-agent', 'change', () => { st.rq.agent = el('c-rq-agent').value; rqChanged(false); });
        on('c-rq-when', 'change', () => {
            st.rq.when = el('c-rq-when').value;
            // 'between…' brings its two date boxes with it — that IS structural
            rqChanged(true);
        });
        on('c-rq-from', 'change', () => { st.rq.from = el('c-rq-from').value; rqChanged(false); });
        on('c-rq-to', 'change', () => { st.rq.to = el('c-rq-to').value; rqChanged(false); });
        on('c-rq-pin', 'click', () => { st.rq.pinnedOnly = !st.rq.pinnedOnly; rqChanged(true); });
        on('c-rq-user', 'click', () => { st.rq.userOnly = !st.rq.userOnly; rqChanged(true); });
        on('c-rq-n', 'input', () => rqTyped(() => {
            const n = parseInt(el('c-rq-n').value, 10);
            st.rq.limit = isFinite(n) && n > 0 ? n : 0;
        }));
    }

    /** Put the remembered values back into the boxes — never into the one you
     *  are typing in, which is the whole reason they are not in the markup. */
    function fillResumePanel(force) {
        const set = (id, v) => {
            const e = document.getElementById(id);
            if (!e || (!force && e === document.activeElement)) { return; }
            if (e.value !== v) { e.value = v; }
        };
        set('c-rq-text', st.rq.text || '');
        set('c-rq-agent', st.rq.agent || '');
        set('c-rq-when', st.rq.when || '');
        set('c-rq-from', st.rq.from || '');
        set('c-rq-to', st.rq.to || '');
        set('c-rq-n', st.rq.limit ? String(st.rq.limit) : '');
    }

    /**
     * ‼️ THE WAIT HAS TO GROW BY ITSELF.
     *
     * "the nudge is TIME, not animation" is the whole design of the left panel
     * — and it was the one thing on it that did not move. Every figure here is
     * written during a data push, and a push only happens when the CLI says
     * something; a session that is waiting for YOU says nothing by definition.
     * So `your turn · 0s` and `longest 0s` were written the moment the turn
     * ended and then stood there for two hours, telling you the opposite of
     * what they exist to say — and only ever corrected themselves if some OTHER
     * session happened to speak and drag a repaint along with it.
     *
     * The clock is now a reason to redraw, on its own. Only the left panel is
     * time-dependent (the waits, the shelf's "ended 2h ago", the resume list's
     * ages), so only the left panel ticks — and `slot()` means a tick where no
     * text actually changed writes nothing at all.
     */
    const WAIT_TICK_MS = 10000;
    setInterval(renderList, WAIT_TICK_MS);

    // ---- one pass over the changing parts -------------------------------------

    function paint() {
        const s = sel();
        const key = `${DATA.selected || ''}|${s ? s.status === 'ended' || s.status === 'error' : 'none'}`;
        if (shellKey !== key) {
            shellKey = key;
            buildShell(s);
        }
        // The shell is only rebuilt when the SELECTED SESSION changes, so an
        // agent chosen for us — "Talk to Agent" on an agent's page — would land
        // in st and never reach the markup whenever the composer was already on
        // screen, and the button would look exactly like plain Open Console.
        // The picker mirrors st on every pass instead of only at build time.
        const agentSel = document.getElementById('c-agent');
        if (agentSel && agentSel.value !== (st.agentId || '')) { agentSel.value = st.agentId || ''; }

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

        renderList();

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
        slot('c-queue', queueHtml(s));
        // deliberately NOT a slot: it repaints itself on a timer while the turn
        // runs, so its html is never what `written` last saw
        paintWorking();
        const sendBtn = document.getElementById('c-send');
        if (sendBtn && s) {
            const label = s.status === 'working' ? 'Queue' : 'Send';
            if (sendBtn.textContent !== label) { sendBtn.textContent = label; }
        }

        if (slot('c-status', statusHtml(s))) {
            const byId = (id, ev, fn) => { const el = document.getElementById(id); if (el) { el.addEventListener(ev, fn); } };
            byId('c-goto-live', 'click', () => {
                const live = (DATA.sessions || []).find(x => x.agentId === st.agentId
                    && x.status !== 'ended' && x.status !== 'error');
                if (live) { vscode.postMessage({ type: 'select', id: live.id }); }
            });
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
    // The list you left open (and the question you left it asking) is state the
    // HOST has to know about: it is the one that can see every session, and it
    // computes nothing for a section nobody is looking at.
    if (st.showResume) { postResume(); }
})();
