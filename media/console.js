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

    /**
     * ‼️ WHERE A CARD SITS IS A DECISION, NOT A SIDE EFFECT.
     *
     * The hosted list arrives from the host newest-activity-first, and with two
     * agents streaming in parallel that is a race: each writes one line, each
     * jumps over the other, and the cards swap places every few hundred
     * milliseconds. Reading a 250px column while it shuffles under the cursor
     * is impossible, and clicking the card you meant becomes luck — which is
     * why the panel's own design note two hundred lines down says "THE LIST
     * NEVER REORDERS". The list did reorder; nothing here enforced it.
     *
     * Three answers, and you pick:
     *   · `fixed`   — nothing ever moves. Cards sit where they arrived, newest
     *                 first, and stay there. THE DEFAULT: a still list costs
     *                 nothing to read, and the count above it already jumps you
     *                 to whoever is waiting.
     *   · `waiting` — the only thing that earns the top is the ball being
     *                 YOURS: a session that needs permission, then one whose
     *                 turn has ended and is waiting on you. It is a LIFT, not a
     *                 new home — answer it and the card drops back where it
     *                 arrived. Within each group nothing moves at all, and a
     *                 phase changes a few times an hour rather than ten times a
     *                 second, so this is calm as well as useful: it is the
     *                 panel's actual subject, sorted.
     *   · `active`  — busiest on top, DAMPED. A card climbs only after it has
     *                 shown `minTicks` separate signs of life, and once the
     *                 order changes it is held still for `holdSec` seconds. Set
     *                 those to 1 and 0 and you have the old instant behaviour
     *                 back, exactly.
     */
    const ORDER_MODES = [
        { v: 'fixed', t: 'cards never move' },
        { v: 'waiting', t: 'waiting for you first' },
        { v: 'active', t: 'busiest on top' }
    ];
    const ORDER_DEFAULT = () => ({ mode: 'fixed', holdSec: 20, minTicks: 4 });
    let st = Object.assign({
        agentId: '', model: '', effort: '', permissionMode: '', draft: '', showResume: false,
        // files hung on the message being written — paths only, never payload;
        // the bytes are read in the extension at send time (see loadAttachments)
        attach: [],
        // which kinds of line the conversation shows; null = everything
        kinds: null,
        /**
         * How tall the writing box was dragged, as a css length ('220px').
         *
         * The drag handle writes an inline height, and `buildShell` writes the
         * whole composer from scratch — so the two disagreed and the rebuild
         * always won. This is the box's own answer to "how tall", kept next to
         * the draft it holds: it outlives a rebuild, a session change and the
         * panel being closed. Empty means "never dragged" — the css min-height.
         */
        boxH: '',
        // is the miniature filter open, and what is it asking for
        showRFilter: false, rq: EMPTY_RQ(),
        // is the card-order panel open, and what has it been told (see ORDER)
        showOrder: false, order: ORDER_DEFAULT(),
        /**
         * Is "show N" pinned?
         *
         * How many rows to list is not a filter — it does not choose WHICH
         * sessions, only how many of them you can see — so clearing the filter
         * has no business resetting it. Pinned (the default), the number you
         * set is simply how long the list is, filter or no filter, until you
         * unpin it. Unpinned, it goes back to being part of the question and
         * clears with the rest.
         */
        limitLocked: true
    }, saved.afConsole);
    st.rq = Object.assign(EMPTY_RQ(), st.rq);
    st.order = Object.assign(ORDER_DEFAULT(), st.order);
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
        /* ‼️ TWO LINES, NOT ONE. On one line the strip was a single row that had
           to hold BOTH the sentence ("Read src/core/live.ts") and every figure
           the turn has produced, so whichever end was longer ate the other: the
           tail of the meta ran off the right edge and could not be read at all.
           Line 1 is what is happening, line 2 is what it has cost — the numbers
           right-aligned, exactly where the eye already goes for a total. The
           gap between them is deliberately nothing: this is one strip printed
           on two rows, not two strips. */
        .working { flex:none; font-size:11px; padding:5px 4px 0; display:flex;
            flex-direction:column; gap:0; line-height:1.3;
            color:var(--vscode-descriptionForeground); }
        .working:empty { display:none; }
        .working .wrow { display:flex; gap:6px; align-items:baseline; min-width:0; }
        .working b { color:var(--vscode-foreground); font-weight:600;
            overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .working .spin { color:var(--vscode-charts-blue,#3794ff); font-size:13px; }
        /* the finished turn's summary sits in the same strip, deliberately
           quieter and motionless — a settled number, not a live one */
        .working .dspin { color:var(--vscode-charts-green,#89d185); font-size:12px; }
        /* the second row: still right-aligned. It is allowed to WRAP rather than
           be cut — the figures are the reason the strip grew a second line, so
           losing their tail again would undo the change. */
        .working .wmeta { align-self:flex-end; max-width:100%; opacity:.75;
            text-align:right; white-space:normal; }
        /* the model + effort field: the only part of the meta line that is not
           a measurement but the REASON for one, so it is the one part allowed a
           little weight — it is what the numbers next to it are explained by */
        .working .wbrain { color:var(--vscode-foreground); opacity:.9; }
        /* ---- the resume section: a header row, a miniature filter, the rows --
           Everything here is sized for a 250px column: 10px type, one-line
           controls, and every box allowed to shrink (min-width:0) so nothing
           can push the column wider than the page gave it. */
        /* ‼️ A ROW, said out loud. This was a plain block whose buttons happened
           to sit side by side because they are inline — so the moment the label
           grew (a "filtered" chip), the two icon buttons WRAPPED onto a second
           line. Seen in the browser, not deduced. */
        .rhead { display:flex; flex-direction:row !important; gap:4px !important;
            align-items:stretch; margin-top:6px; }
        .rhead .rtoggle { display:flex; align-items:center; gap:5px; flex:1 1 auto; min-width:0;
            text-align:left; }
        /* The LABEL gives way, never the chip: the label is always the same
           sentence, the chip is the news. */
        .rhead .rtoggle .rlabel { flex:1 1 auto; min-width:0; overflow:hidden;
            text-overflow:ellipsis; white-space:nowrap; }
        .rhead .rfilter { flex:none; width:28px; padding:0; font-size:11px; }
        /* the same header shape at the TOP of the column, where there is
           nothing above it to be spaced away from */
        .rhead.lhead { margin-top:0; }
        /* Two things to know at a glance, the same split as ⌕/⌦ below:
             filled  = the panel is open (you are looking at the controls)
             outline = the order is NOT the plain "nothing moves" — cards can
                       move under you, and that must be visible with the panel
                       shut, or a list that shuffles looks like a bug. */
        .rhead .rfilter.ordon { border-color:var(--vscode-charts-blue,#3794ff);
            background:color-mix(in srgb, var(--vscode-charts-blue,#3794ff) 16%, transparent); }
        .rhead .rfilter.ordon.on { background:var(--vscode-button-background); }
        .rnote { font-size:10px; opacity:.7; line-height:1.35; }
        /* Two buttons, two different things to know at a glance:
             ⌕ lit  = the panel is open (you are looking at the controls)
             ⌦ lit  = a filter is SET (what you are looking at is narrowed)
           They were one lit button before, which meant "open" and "filtered"
           could not be told apart — and with the panel closed, a narrowed list
           looked exactly like the whole list. The clear button is also the
           fastest way out: it is next to the thing that caused it, not at the
           bottom of a list you have to scroll to. */
        .rhead .rfilter.on { background:var(--vscode-button-background); color:var(--vscode-button-foreground); }
        .rhead .rclear.on { color:var(--vscode-editorWarning-foreground,#cca700);
            border-color:color-mix(in srgb, var(--vscode-editorWarning-foreground,#cca700) 55%, transparent);
            background:color-mix(in srgb, var(--vscode-editorWarning-foreground,#cca700) 14%, transparent); }
        /* nothing to clear: there, so the row never changes shape, but plainly
           not pressable */
        .rhead .rclear:disabled { opacity:.3; cursor:default; }
        .rfiltered { flex:none; font-size:10px; padding:1px 6px; border-radius:8px; white-space:nowrap;
            color:var(--vscode-editorWarning-foreground,#cca700);
            background:color-mix(in srgb, var(--vscode-editorWarning-foreground,#cca700) 14%, transparent); }
        .rpanel { gap:4px !important; padding:6px; border-radius:6px;
            border:1px solid var(--vscode-widget-border,#4443); }
        .rpanel input, .rpanel select { font-size:10px; padding:1px 3px; width:100%; min-width:0;
            border-radius:3px; border:1px solid var(--vscode-widget-border,#4443);
            background:var(--vscode-input-background); color:var(--vscode-input-foreground); }
        /* The search box carries its own ⨯: a filter you can set with one hand
           and can only unset by selecting the text and deleting it is half a
           control. (The ⌦ in the header clears the WHOLE question — this one
           clears the words, which is the part you retype.) */
        .rtext { position:relative; display:flex; align-items:center; }
        .rtext input { padding-right:15px !important; }
        .rtext .rx { position:absolute; right:1px; top:50%; transform:translateY(-50%);
            background:none; border:none; padding:0 2px; line-height:1; cursor:pointer;
            font-size:11px; opacity:.5; color:var(--vscode-foreground); }
        .rtext .rx:hover { opacity:1; }
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
        /* ‼️ A LOCK YOU HAVE TO SQUINT AT IS NOT A STATE. 🔒 and 🔓 differ by a
           few pixels of shackle at 10px, and both were drawn the same weight —
           so "is the count pinned?" could only be answered by opening the
           tooltip. State is carried by COLOUR here, all of it on one side:
           locked is the accent, at full saturation; unlocked has no colour at
           all (grayscale + faded), which no theme can turn back into a signal. */
        .rchip.lock { font-size:11px; line-height:1.35; filter:grayscale(1); opacity:.45; }
        .rchip.lock.on { filter:none; opacity:1;
            color:var(--vscode-foreground);
            border-color:var(--vscode-charts-blue,#3794ff);
            background:color-mix(in srgb, var(--vscode-charts-blue,#3794ff) 24%, transparent); }
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
        /* the step-kind chip lives in this gutter (see messageHtml): the column
           is sized for a 10px word, so the glyph is given back its own size and
           the gutter's dimming is undone — a mark you scan a thousand rows by
           must not be the faintest thing on the row. Parent opacity is a
           compositing group a child cannot climb out of, so the gutter itself
           stops dimming on the rows that hold a chip. */
        .msg .who:has(.skind) { opacity:1; }
        .msg .who .skind { font-size:13px; line-height:1; }
        .msg .body { flex:1; min-width:0; white-space:pre-wrap; word-break:break-word; }
        .msg.user .body { background:color-mix(in srgb, var(--vscode-textLink-foreground) 10%, transparent);
            border-radius:7px; padding:6px 9px; }
        /* said INTO a running turn — it did not start one, and the reply above
           it was not an answer to it */
        .msg.user.steer .body { border-left:2px solid var(--vscode-charts-blue,#3794ff); }
        .msg.user.steer .who::after { content:' ↯'; }
        .msg.tool .body { font-size:11px; opacity:.85; font-family:var(--vscode-editor-font-family, monospace); }
        .msg.err .body { color:var(--vscode-errorForeground); }
        .msg.sys .body { font-size:11px; opacity:.7; font-style:italic; }
        .msg.res .body { font-size:11px; opacity:.7; border-top:1px dashed var(--vscode-widget-border,#4443); padding-top:5px; }
        .filechip { display:inline-block; font-size:10px; padding:1px 7px; margin-left:6px; border-radius:8px;
            cursor:pointer; border:1px solid var(--vscode-widget-border,#4444); }
        .filechip:hover { background:var(--vscode-list-hoverBackground); }
        /* what THIS call spent, hung on the step that spent it — an annotation,
           never a headline competing with the row's own words */
        .steptok { float:right; font-size:10px; opacity:.5; margin-left:8px; cursor:help; }
        /* the session id doubles as the step-kind key — dotted underline is the
           web's own promise that hovering will explain something */
        .sidlegend { cursor:help; border-bottom:1px dotted var(--vscode-descriptionForeground,#888); }
        .permbox { margin:10px; padding:9px 11px; border-radius:8px;
            border:1px solid var(--vscode-editorWarning-foreground,#cca700);
            background:color-mix(in srgb, var(--vscode-editorWarning-foreground,#cca700) 12%, transparent); }
        .permbox .t { font-weight:600; font-size:12px; }
        .permbox .d { font-size:11px; opacity:.85; margin:4px 0 8px; }
        /* ---- the question the turn is parked on (see ConsoleAsk) -----------
           It sits BETWEEN the conversation and the composer, not inside the
           scroller: a question you have to scroll to find is a question that
           looks like the session hung. Loud on purpose — it is the only thing
           on the page that is holding a running turn still.
           ‼️ AND IT HAS A CEILING, because the thing holding the turn must never
           be the thing that makes the turn unanswerable. Four questions with
           described options is taller than a short window, and the card had no
           ceiling and no scroller: everything past the fold — including the
           Answer button — was simply unreachable, and the session sat blocked
           on a question the user could not finish. So the card is a column:
           the header and the answer strip are FIXED (the way out is always on
           screen, whatever the questions do), and only the questions scroll. */
        .askbox { flex:none; margin:8px 0 0; padding:9px 11px; border-radius:8px;
            display:flex; flex-direction:column; min-height:0; max-height:52vh;
            border:1px solid var(--vscode-focusBorder,#3794ff);
            background:color-mix(in srgb, var(--vscode-focusBorder,#3794ff) 10%, transparent); }
        .askbox:empty { display:none; }
        .askbox .askbody { flex:1 1 auto; min-height:0; overflow-y:auto; overscroll-behavior:contain;
            padding-right:3px; }
        .askbox .askfoot { flex:none; }
        /* the card is holding more than it can show: the questions are cut by a
           line rather than by the window's edge, so "there is more below" is
           visible without having to try scrolling first */
        .askbox.more .askbody { border-bottom:1px solid color-mix(in srgb, var(--vscode-focusBorder,#3794ff) 45%, transparent); }
        .askbox.more .askfoot { padding-top:6px; }
        .askbox .t { font-weight:600; font-size:12px; display:flex; gap:6px; align-items:center; }
        /* how much of the card is still unanswered — the one number that says
           whether anything is waiting for you out of sight */
        .askbox .t .cnt { margin-left:auto; font-size:10px; font-weight:600; opacity:.85; white-space:nowrap; }
        .askbox .t .cnt.done { opacity:.6; font-weight:400; }
        .askbox .t .tag { font-size:10px; padding:1px 6px; border-radius:8px; font-weight:600;
            border:1px solid var(--vscode-focusBorder,#3794ff); }
        .askbox .q { font-size:12px; margin:7px 0 4px; }
        .askbox .qh { font-size:10px; text-transform:uppercase; letter-spacing:.5px; opacity:.7; }
        .askbox .opts { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:4px; }
        .askbox .opt { text-align:left; font:inherit; font-size:11px; padding:4px 9px; border-radius:6px;
            cursor:pointer; border:1px solid var(--vscode-widget-border,#4444);
            background:var(--vscode-editor-background); color:var(--vscode-foreground); }
        .askbox .opt:hover { background:var(--vscode-list-hoverBackground); }
        .askbox .opt.on { border-color:var(--vscode-focusBorder,#3794ff); font-weight:600;
            background:color-mix(in srgb, var(--vscode-focusBorder,#3794ff) 18%, transparent); }
        .askbox .opt .od { display:block; opacity:.7; font-weight:400; }
        .askbox .free { width:100%; font:inherit; font-size:12px; border-radius:6px; padding:5px 8px;
            margin:2px 0 6px; border:1px solid var(--vscode-widget-border,#4443);
            background:var(--vscode-input-background); color:var(--vscode-input-foreground); }
        .askbox .arow { display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
        .askbox .note { font-size:10px; opacity:.7; margin-top:5px; }
        .msg.ask .body { border-left:2px solid var(--vscode-focusBorder,#3794ff); padding-left:7px; }
        .composer { margin-top:8px; flex:none; border:1px solid var(--vscode-widget-border,#4443);
            border-radius:8px; padding:8px; }
        /* The project chip. Quiet by design — it is a statement of fact about
           every message sent from this box, not a control. It is what the user
           hovers to READ THE TEXT the session is being given, which is the only
           way an invisible channel can be honest. */
        /* the spacing lives on the SLOT, not on the chip: the chip is inside an
           AFTip wrapper now, and margin on an inline trigger does nothing */
        #c-project { margin-bottom:6px; }
        .pchip { font-size:10px; opacity:.85; cursor:help;
            display:inline-flex; align-items:center; gap:6px; padding:2px 7px; border-radius:9px;
            border:1px solid var(--vscode-widget-border,#4443);
            background:var(--vscode-badge-background); color:var(--vscode-badge-foreground); }
        .pchip.none { opacity:.45; background:none; color:inherit; }
        .pchip-hint { opacity:.6; font-style:italic; }
        /* the same fact, on a session row: which project it was started under */
        .pbadge { font-size:9px; opacity:.75; padding:0 4px; border-radius:7px;
            border:1px solid var(--vscode-widget-border,#4443); }
        /* ‼️ THE HEIGHT YOU DRAG IS A SETTING, NOT A SIDE EFFECT (see st.boxH).
           Two things used to throw it away. The ceiling was 30vh, so a drag past
           a third of the window did nothing and the handle just stopped under
           the cursor — it read as "it snapped back". And the height a drag sets
           is an INLINE style on the element, which buildShell replaces: any
           rebuild (another session selected, a turn ending, an agent pinned) put
           the box back to 64px, so whether it survived depended on whether a
           rebuild happened to land between the drag and the next look.
           Now: the ceiling is 70vh — the conversation above is a min-height:0
           flex scroller, so it simply yields the room and the composer never
           leaves the window — and the dragged height is saved and restored. */
        .composer textarea { width:100%; min-height:64px; max-height:70vh; resize:vertical; font:inherit;
            font-size:13px; border-radius:6px; padding:7px 9px;
            border:1px solid var(--vscode-widget-border,#4443);
            background:var(--vscode-input-background); color:var(--vscode-input-foreground); }
        /* The box's own four text tools — paste · copy · cut · clear — are a
           shared component now (media/afTextTools.js, styled in common.css):
           the Backlog tab's capture box wants exactly the same four, and the
           paste rule is not something to have two copies of. */
        /* Attached files sit ABOVE the box, between the talk and what you are
           writing — the same place the eye already goes for "what am I about
           to send". Each chip says which carrier it will use, because an
           embedded file leaves this machine in full and a path does not. */
        .chips { display:flex; flex-wrap:wrap; gap:4px; margin-bottom:6px; }
        .chip { display:flex; align-items:center; gap:5px; font-size:11px; padding:2px 4px 2px 6px;
            border:1px solid var(--vscode-widget-border,#4443); border-radius:10px;
            background:var(--vscode-input-background); max-width:100%; }
        .chip .nm { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:220px; }
        .chip .sz { opacity:.55; }
        .chip .kd { font-size:9px; padding:0 4px; border-radius:6px; opacity:.8;
            border:1px solid var(--vscode-widget-border,#4443); }
        .chip .x { cursor:pointer; opacity:.6; padding:0 2px; }
        .chip .x:hover { opacity:1; color:var(--vscode-charts-red,#e51400); }
        /* the whole composer is the drop target — a small one would be a game */
        .composer.drop { outline:2px dashed var(--vscode-focusBorder,#007fd4); outline-offset:3px; }
        .crow { display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin-top:7px; }
        .crow select { font-size:11px; padding:2px 4px; }
        .crow .grow { flex:1; }
        /* HELD back on purpose: not said yet, and still yours to change
           (see queueHtml) */
        .qwait:empty { display:none; }
        .qwait { margin:0 0 7px; padding:6px 9px; border-radius:7px;
            border:1px dashed var(--vscode-widget-border,#4444);
            background:color-mix(in srgb, var(--vscode-editorWarning-foreground,#cca700) 8%, transparent); }
        .qwait .qhead { font-size:10px; opacity:.75; margin-bottom:3px; }
        .qwait .qline { font-size:11px; opacity:.9; display:flex; align-items:center; gap:4px; }
        .qwait .qline .qtext { flex:1 1 auto; min-width:0;
            overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .qwait .qline .qtext::before { content:'· '; opacity:.6; }
        .qwait .qbtn { flex:none; background:none; border:none; cursor:pointer; padding:0 3px;
            font-size:11px; line-height:1; opacity:.55; color:var(--vscode-foreground); }
        .qwait .qbtn:hover { opacity:1; }
        .linkish { background:none; border:none; padding:0; font:inherit; cursor:pointer;
            color:var(--vscode-textLink-foreground); text-decoration:underline; }
        .qbadge { font-size:10px; padding:1px 7px; border-radius:8px;
            background:var(--vscode-badge-background); color:var(--vscode-badge-foreground); }
        /* SAVED PROMPTS. A window inside the window: the composer is at the
           bottom of the page, so a list that dropped out of the button would
           have nowhere to go. Centred, capped at two thirds of the height, and
           the backdrop closes it — the same shape VS Code's own quick pick has,
           because that is the gesture a hand already knows. */
        .snipwrap { position:fixed; inset:0; z-index:60; display:flex; align-items:center;
            justify-content:center; background:#0006; }
        .snipbox { width:min(680px, 88vw); max-height:66vh; display:flex; flex-direction:column;
            border-radius:8px; overflow:hidden; box-shadow:0 8px 30px #0007;
            border:1px solid var(--vscode-widget-border,#4444);
            background:var(--vscode-editorWidget-background, var(--vscode-editor-background)); }
        .sniphead { display:flex; gap:8px; align-items:center; padding:8px 10px;
            border-bottom:1px solid var(--vscode-widget-border,#4443); }
        .sniphead input { flex:1 1 auto; padding:3px 24px 3px 7px; width:100%; }
        /* The filter box and its ✕ are one control: the button sits INSIDE the
           box's right edge, so clearing is where the text is rather than a
           second widget somewhere along the row. Hidden while the box is
           empty — a clear button on nothing is furniture. */
        .snipq { position:relative; flex:0 1 240px; display:flex; }
        .snipqx { position:absolute; right:2px; top:50%; transform:translateY(-50%);
            background:transparent; border:none; padding:2px 5px; cursor:pointer;
            font-size:11px; line-height:1; color:var(--vscode-descriptionForeground); }
        .snipqx:hover { color:var(--vscode-foreground); }
        .sniplist { overflow:auto; padding:4px 0; }
        .snipgrp { font-size:10px; text-transform:uppercase; letter-spacing:.5px; opacity:.55;
            padding:8px 12px 3px; }
        .snipitem { display:flex; flex-direction:column; gap:2px; width:100%; text-align:left;
            background:none; border:none; cursor:pointer; padding:6px 12px;
            color:var(--vscode-foreground); }
        .snipitem:hover { background:var(--vscode-list-hoverBackground); }
        .sniplbl { font-size:12px; }
        .snipprev { font-size:10px; opacity:.6; white-space:nowrap; overflow:hidden;
            text-overflow:ellipsis; font-family:var(--vscode-editor-font-family); }
        .snipnone { padding:22px 14px; font-size:12px; color:var(--vscode-descriptionForeground); }
        .snipfoot { padding:6px 10px; font-size:10px; opacity:.55;
            border-top:1px solid var(--vscode-widget-border,#4443);
            white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .fixed { font-size:11px; opacity:.75; }
        /* the same word, but on a composer that has NOT started yet: it reads as
           a chosen value rather than a fact, so it gets a border and a way out */
        .fixed.pinned { display:inline-flex; align-items:center; gap:4px; opacity:.9;
            padding:2px 4px 2px 8px; border-radius:9px;
            border:1px solid var(--vscode-widget-border,#4443); }
        .fixed.pinned .only { background:none; border:none; opacity:.5; cursor:pointer;
            font-size:11px; padding:0 3px; color:inherit; }
        .fixed.pinned .only:hover { opacity:1; }
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
    const spend = (cost, tokens, wTokens) =>
        `${C.fmtUSD(cost || 0)}${tokens ? ` (${C.fmtTokW(tokens, wTokens)} tokens)` : ''}`;
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
    const tokBadge = (tokens, wTokens) => (tokens ? `${C.fmtTokW(tokens, wTokens)} tok` : '');
    // The card has room for one line of hover, so the weighted figure is spelled
    // out there rather than left as a glyph — see charts.js WEIGHTED_TIP.
    const tokTip = (tokens, cost, wTokens) => (tokens ? `${C.fmtTok(tokens)} raw tokens` : 'nothing spent yet')
        + (wTokens ? ` · ⚖ ${C.fmtTok(Math.round(wTokens))} against the 5h limit` : '')
        + (cost ? ` · ${C.fmtUSD(cost)} spent` : '');

    /**
     * ‼️ WHAT THE SESSION HAS SPENT — WHILE IT IS SPENDING IT.
     *
     * `s.cost` is only ever the money the CLI has REPORTED, and the CLI reports
     * a turn's cost when the turn ends. The tokens beside it are counted off
     * every assistant message as it arrives. So for the whole length of a turn
     * the one line under the box climbed on the left and stood at $0.0000 on
     * the right — two halves of one figure disagreeing with each other, which
     * reads as a broken number rather than a promise that will be kept in a
     * minute. (On a session that has never finished a turn it stood at zero
     * outright, which is what was reported.)
     *
     * The running turn's estimate already exists — it is what the strip above
     * the box shows — so the session line adds it and marks the whole thing
     * "~". Nothing is double counted: when the turn closes, its estimate is
     * cleared in the same step that adds the CLI's own figure to `s.cost`.
     *
     * The base is the SESSION's, not this window's: a resumed conversation
     * comes back with what it already spent (see CarriedTotals), so the "~"
     * grows on top of the earlier turns instead of starting over.
     */
    function sessionSpend(s) {
        const live = s && s.status === 'working' ? (s.turnCost || 0) : 0;
        return {
            cost: (s && s.cost || 0) + live, tokens: (s && s.tokens) || 0,
            wTokens: (s && s.wTokens) || 0, est: live > 0
        };
    }

    /**
     * The right-click contract for a session row.
     *
     * The mechanism lives in `media/afSessionCtx.js` — one contract shared by
     * every surface that lists sessions. `data-vscode-context` hands the row's
     * identity to VS Code, which builds the menu from the `webview/context`
     * entries in package.json — the standard Copy/Paste items stay
     * (`preventDefaultContextMenuItems: false`) and the session's own actions
     * are appended to them. This is deliberately NOT a `contextmenu` listener:
     * hijacking the right-click to open a rename box straight away took the
     * normal menu away from the page and left rename as the only thing a
     * right-click could ever mean.
     *
     * Every key in this object becomes a **context key** while the menu is up,
     * which is how a card's own state reaches the menu: the `enablement` clause
     * on `agentfarm.console*` reads `afConsoleLive` / `afConsoleEnded` /
     * `afConsoleWorking` and greys out what cannot be done to this session yet.
     * Greying is the point — hiding "Remove from list" until the session ends
     * would make the menu change shape under the pointer, and you would never
     * learn that removing is what comes after ending.
     */
    const ctxAttr = o => window.AFSessionCtx.attr(o);

    /**
     * WHOSE TURN IS IT — the one question the left panel has to answer at a
     * glance, across eight cards, without becoming a Christmas tree.
     *
     * The states are not "statuses", they are who holds the ball:
     *   you      — it replied and stopped. The state that has to reach you.
     *   blocked  — it refused a tool and cannot go on until you decide. Same
     *              ball, heavier: nothing at all happens until you look.
     *   agent    — a turn is running. Transient, resolves itself.
     *   held     — you wrote something and chose to hold it back; it goes when
     *              the running turn ends, and until then it is still yours.
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
     *   · THE LIST DOES NOT REORDER UNDER YOU. Cards that jump are the
     *     definition of irritating, so nothing moves them by default and the
     *     count above the list jumps you instead, on a click. What is allowed
     *     to move a card is yours to set — see ORDER_MODES.
     */
    function phaseOf(s) {
        if (!s) { return { id: 'new', label: '', cls: '' }; }
        if (s.status === 'error') { return { id: 'over', label: 'error', cls: 'p-error' }; }
        if (s.status === 'ended') { return { id: 'over', label: 'ended', cls: 'p-over' }; }
        // A parked question outranks "working": the turn IS running, but nothing
        // will happen in it until you answer, and a card that says "working" for
        // a session that is waiting on you is the one lie this panel cannot tell.
        if (s.pendingAsk) {
            return {
                id: 'blocked',
                label: (s.pendingAsk.questions || []).length ? 'asking you' : 'needs permission',
                cls: 'p-blocked'
            };
        }
        if (s.pendingPermission) { return { id: 'blocked', label: 'needs permission', cls: 'p-blocked' }; }
        if (s.status === 'starting') { return { id: 'opening', label: 'starting…', cls: 'p-open' }; }
        if ((s.queued || []).length) { return { id: 'held', label: 'a message is held', cls: 'p-agent' }; }
        if (s.status === 'working') { return { id: 'agent', label: 'working', cls: 'p-agent' }; }
        if (!s.turns) { return { id: 'new', label: 'nothing said yet', cls: '' }; }
        return { id: 'you', label: 'your turn', cls: 'p-you' };
    }

    /** The sessions holding a ball that is yours — the panel's whole point. */
    const needingYou = () => (DATA.sessions || [])
        .filter(s => ['you', 'blocked'].indexOf(phaseOf(s).id) >= 0)
        .sort((a, b) => (a.lastTs || 0) - (b.lastTs || 0));   // longest wait first

    // ---- the order the cards are drawn in (see ORDER_MODES) -------------------
    /** The display order as it stands — ids, so it survives every repaint. */
    let orderIds = [];
    /** id → how much this session has done since the order last changed. A
     *  "tick" is one push in which its own clock moved: the panel cannot count
     *  another session's lines (it is only sent its own), and a session that
     *  says something moves `lastTs`, which is the same signal by a cheaper
     *  name. */
    let orderTicks = Object.create(null);
    /** No card may climb before this moment — the damping (`holdSec`). */
    let orderHeldUntil = 0;

    /** A mode change takes effect now, not after the last hold expires. */
    function orderChanged() {
        orderHeldUntil = 0;
        orderTicks = Object.create(null);
    }

    const orderRank = s => {
        const id = phaseOf(s).id;
        return id === 'blocked' ? 0 : id === 'you' ? 1 : 2;
    };

    function orderedSessions() {
        const list = DATA.sessions || [];
        const live = Object.create(null);
        for (const s of list) { live[s.id] = s; }
        const now = Date.now();

        // Signs of life are counted whatever the mode: switching to "busiest on
        // top" must not start every session from zero as if nothing had ever
        // happened in this window.
        for (const s of list) {
            const t = orderTicks[s.id] || (orderTicks[s.id] = { lastTs: 0, ticks: 0 });
            if (s.lastTs !== t.lastTs) { t.lastTs = s.lastTs; t.ticks++; }
        }
        for (const id of Object.keys(orderTicks)) { if (!live[id]) { delete orderTicks[id]; } }

        // Sessions that ended go; sessions that are new arrive ON TOP, newest
        // first — one you just started is the one you are about to talk to.
        orderIds = orderIds.filter(id => live[id]);
        const fresh = list.filter(s => orderIds.indexOf(s.id) < 0).map(s => s.id);
        if (fresh.length) { orderIds = fresh.concat(orderIds); }

        const o = st.order || {};
        if (o.mode === 'active' && now >= orderHeldUntil) {
            const need = Math.max(1, Number(o.minTicks) || 1);
            // whoever has done the most since the order last changed, and only
            // if that is enough to be worth moving the list for
            let best = null;
            for (const s of list) {
                const t = orderTicks[s.id];
                if (!t || t.ticks < need) { continue; }
                if (!best || t.ticks > orderTicks[best.id].ticks
                    || (t.ticks === orderTicks[best.id].ticks && (s.lastTs || 0) > (best.lastTs || 0))) {
                    best = s;
                }
            }
            if (best && orderIds[0] !== best.id) {
                orderIds = [best.id].concat(orderIds.filter(id => id !== best.id));
                orderHeldUntil = now + Math.max(0, Number(o.holdSec) || 0) * 1000;
                for (const id of Object.keys(orderTicks)) { orderTicks[id].ticks = 0; }
            } else if (best) {
                // already on top: it has nothing to spend its activity on
                orderTicks[best.id].ticks = 0;
            }
        }

        const rows = orderIds.map(id => live[id]).filter(Boolean);
        if (o.mode !== 'waiting') { return rows; }
        // A stable PARTITION, not a sort: within a group the order above is
        // untouched, so the only thing that ever moves a card is the ball
        // becoming yours — and that happens once, not per streamed line.
        return rows.slice().sort((a, b) => orderRank(a) - orderRank(b));
    }

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
        { v: 'system', t: '⚙ System · turn totals', is: m => m.role === 'system' || m.role === 'result' },
        { v: 'ask', t: '❓ Questions · your answers', is: m => m.role === 'ask' }
    ];

    /** st.kinds: null = everything (and a kind added later is included). */
    function visibleMessages(list) {
        if (st.kinds === null || st.kinds === undefined) { return list || []; }
        const on = KINDS.filter(k => st.kinds.indexOf(k.v) >= 0);
        return (list || []).filter(m => on.some(k => k.is(m)));
    }

    function messageHtml(m) {
        if (m.role === 'user') {
            // ↯ — said INTO the turn above it, which was already running: it is
            // not the question that reply was answering.
            return `<div class="msg user${m.steer ? ' steer' : ''}"${m.steer ? ' title="Said into the running turn — the agent picks it up at its next step"' : ''}><span class="who">you</span><div class="body">${C.esc(m.text || '')}</div></div>`;
        }
        // ‼️ EVERY STEP ROW SAYS WHAT KIND OF STEP IT IS AND WHAT IT COST.
        // The conversation used to show only WHAT happened: a file read off
        // this disk and the model reasoning for nine seconds drew the same kind
        // of row, though one is free to run and the other is billed at the
        // output rate. The chip is the category, the figure beside it is what
        // that API call spent — written ONCE per call, on its first block, so
        // a row with no figure rode on the one above it (see stepkind.ts).
        //
        // ‼️ AND ONE ROW CARRIES ONE MARK. A tool row used to draw two: a fixed
        // 🔧 in the `who` gutter and the kind chip glued to the front of the
        // text, side by side, saying the same thing twice — and the fixed one
        // said the less: 🔧 on a web fetch, on an MCP call and on a local Read
        // alike. So the kind chip MOVED into the gutter, where the eye already
        // scans, and nothing sits in front of the words any more.
        const step = m => C.stepChip(m.kind, m.stepTokens, m.stepWTokens)
            + (m.stepTokens > 0
                ? `<span class="steptok" title="What this API call spent — one call carries several steps and the figure is written once.">${C.fmtTokW(m.stepTokens, m.stepWTokens)}</span>`
                : '');
        if (m.role === 'agent') {
            return `<div class="msg"><span class="who">agent</span><div class="body">${C.esc(m.text || '')}${step(m)}</div></div>`;
        }
        if (m.role === 'tool') {
            if (m.tool) {
                const chip = m.tool.file
                    ? `<span class="filechip" data-open="${C.esc(m.tool.file)}" title="Open this file">✎ open</span>
                       <span class="filechip" data-diff="${C.esc(m.tool.file)}" title="Diff it against git HEAD">vs HEAD</span>`
                    : '';
                return `<div class="msg tool"><span class="who">${C.stepChip(m.kind, m.stepTokens, m.stepWTokens)}</span><div class="body"><strong>${C.esc(m.tool.name)}</strong> ${C.esc(m.tool.detail)}${chip}${m.stepTokens > 0 ? `<span class="steptok" title="What this API call spent — one call carries several steps and the figure is written once.">${C.fmtTokW(m.stepTokens, m.stepWTokens)}</span>` : ''}</div></div>`;
            }
            // An error keeps ⚠ in the gutter rather than the kind chip: `↩ tool
            // result` is true of every result row and says nothing about this
            // one, while "it failed" is the only thing worth a glyph here.
            return `<div class="msg tool${m.isError ? ' err' : ''}"><span class="who">${m.isError ? '⚠' : C.stepChip(m.kind)}</span><div class="body">${C.esc(m.text || '')}</div></div>`;
        }
        // The record of a question and of what you said back. The CARD above the
        // composer is where you answer; this is the transcript's memory of it,
        // so scrolling back tells you why the agent took the turn it took.
        if (m.role === 'ask') {
            const a = m.ask;
            const text = a
                ? `asked: ${a.detail || a.tool}`
                : `you: ${m.answer || ''}`;
            return `<div class="msg ask"><span class="who">${a ? '❓' : '↩'}</span><div class="body">${C.esc(text)}</div></div>`;
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

    /**
     * ‼️ THE ANSWER CARD — what makes the Console a conversation and not a form.
     *
     * The CLI is holding a running turn open until this is answered (see
     * ConsoleAsk). Two shapes, and the CLI itself says which:
     *   · a QUESTION (AskUserQuestion) — its own options, clicked; the turn goes
     *     on with what you chose, exactly as in a terminal. Multi-select
     *     questions keep collecting until you press Answer; single-select ones
     *     send on the click, because a second press to confirm a one-of-four
     *     choice is a step that exists only to be skipped.
     *   · a PERMISSION — this tool, with this input: allow it or refuse it.
     * Free text is always offered, because "neither — do it this way" is an
     * answer a list of options cannot hold — and it lives in the FIXED strip
     * beside the buttons, not among the questions, so that the way out of a
     * card taller than the window is never itself below the fold.
     */
    let askPick = { req: '', by: {} };   // which request the picks belong to

    function askBoxHtml(s) {
        const a = s && s.pendingAsk;
        if (!a) { askPick = { req: '', by: {} }; return ''; }
        if (askPick.req !== a.requestId) { askPick = { req: a.requestId, by: {} }; }
        const qs = a.questions || [];
        const body = qs.length
            ? qs.map((q, qi) => {
                const chosen = askPick.by[q.question] || [];
                return `<div>
                    ${q.header ? `<div class="qh">${C.esc(q.header)}</div>` : ''}
                    <div class="q">${C.esc(q.question)}${q.multiSelect ? ' <span class="qh">(pick any)</span>' : ''}</div>
                    <div class="opts">${(q.options || []).map((o, oi) => `
                        <button class="opt${chosen.indexOf(o.label) >= 0 ? ' on' : ''}"
                                data-askq="${qi}" data-asko="${oi}"
                                title="${C.esc(o.description || o.label)}">${C.esc(o.label)}${
                            o.description ? `<span class="od">${C.esc(o.description)}</span>` : ''}</button>`).join('')}
                    </div>
                </div>`;
            }).join('')
            : `<div class="q">${C.esc(a.detail || a.tool)}</div>`;
        // The buttons differ by shape, and so does what "no" means: refusing a
        // question is not refusing a tool, so the words are not shared.
        const actions = qs.length
            ? `<button id="c-ask-send">Answer</button>
               <button class="secondary" id="c-ask-deny" title="The turn carries on and the agent is told you did not answer">Skip the question</button>`
            // ‼️ THREE, NOT TWO. A terminal has always offered the middle one —
            // "yes, and stop asking me about this kind of command" — and its
            // absence here is what turned a long run into twenty identical
            // prompts whose only escape was widening the whole session's rule.
            // The label names the exact rule that gets installed (a Bash
            // command prefix, or the tool), because "don't ask again" without
            // saying again about WHAT is the kind of button nobody dares press.
            : `<button id="c-ask-allow">Allow once</button>
               ${a.alwaysLabel ? `<button id="c-ask-always"
                   title="Allows this now and adds a rule for ${C.esc(a.alwaysLabel)} that lasts as long as this session — it is never written to a settings file">Allow ${C.esc(a.alwaysLabel)}</button>` : ''}
               <button class="secondary" id="c-ask-deny" title="The tool does not run; the agent is told why and carries on">Deny</button>`;
        // How many are still open, said in the header — with the questions
        // scrollable, "am I done?" can no longer be answered by looking.
        const done = qs.filter(q => (askPick.by[q.question] || []).length).length;
        const count = qs.length > 1
            ? `<span class="cnt${done === qs.length ? ' done' : ''}">${done}/${qs.length} answered</span>`
            : '';
        return `<div class="t"
                ${window.AFCtx.row('afConsoleAsk', {
            askReq: a.requestId || '', afQuestion: qs.length > 0,
            askText: qs.length
                ? qs.map(q => (q.header ? q.header + ' — ' : '') + q.question).join('\n')
                : String(a.detail || a.tool || '')
        })}
                title="${C.esc(window.AFCtx.hint('The turn is still open — it picks your answer up and carries on'))}">
                <span class="tag">${qs.length ? '❓ waiting on you' : '🔐 permission'}</span>
                ${C.esc(qs.length ? (a.displayName || a.tool) + ' is asking' : (a.displayName || a.tool) + ' wants to run')}
                ${count}
            </div>
            <div class="askbody" id="c-ask-body">${body}</div>
            <div class="askfoot">
                <input class="free" id="c-ask-free" type="text"
                       placeholder="${qs.length ? 'or say it in your own words — this reaches the agent as your answer' : 'a reason, if you deny it'}">
                <div class="arow">${actions}</div>
                <div class="note">The turn is still open — it picks this up and carries on, the same as answering in a terminal.</div>
            </div>`;
    }

    /**
     * "There is more of this card than fits" — said with a line under the
     * questions, because a scrollbar is something you have to already suspect
     * is there. Measured, never assumed: the same card is short on a tall
     * window and cut on a short one.
     */
    function markAskOverflow() {
        const wrap = document.getElementById('c-ask');
        if (!wrap) { return; }
        const body = document.getElementById('c-ask-body');
        wrap.className = body && body.scrollHeight > body.clientHeight + 1 ? 'askbox more' : 'askbox';
    }

    function renderAsk() {
        const s = sel();
        // Ticking a second box in a multi-select rewrites the card, and the
        // free-text line is INSIDE it: typed words would vanish under your
        // hands. It is carried across, focus and caret included.
        const old = document.getElementById('c-ask-free');
        const kept = old ? old.value : '';
        const hadFocus = old && document.activeElement === old;
        const at = old ? old.selectionStart : 0;
        // …and so would your place in a card taller than the window: answering
        // question 3 of 4 would throw the list back to question 1, which is the
        // same bug wearing a different hat. A NEW question starts at the top —
        // that one you have not read yet.
        const oldBody = document.getElementById('c-ask-body');
        const sameAsk = !!(s && s.pendingAsk && askPick.req === s.pendingAsk.requestId);
        const scrolled = oldBody && sameAsk ? oldBody.scrollTop : 0;
        if (!slot('c-ask', askBoxHtml(s))) { markAskOverflow(); return; }
        wireAsk(s);
        const body = document.getElementById('c-ask-body');
        // written either way: 0 is the answer for a question you have not read
        // yet, and saying it is how the card cannot inherit the last one's place
        if (body) { body.scrollTop = scrolled; }
        markAskOverflow();
        const box = document.getElementById('c-ask-free');
        if (box && kept) {
            box.value = kept;
            if (hadFocus) {
                try { box.focus({ preventScroll: true }); box.setSelectionRange(at, at); } catch (e) { box.focus(); }
            }
        }
    }

    function wireAsk(s) {
        const a = s && s.pendingAsk;
        if (!a) { return; }
        const free = () => {
            const el = document.getElementById('c-ask-free');
            return el ? el.value.trim() : '';
        };
        const answer = () => vscode.postMessage({
            type: 'askAnswer', id: s.id, kind: 'answer',
            answers: Object.keys(askPick.by).reduce((acc, q) => {
                const list = askPick.by[q] || [];
                if (list.length) { acc[q] = list.length > 1 ? list : list[0]; }
                return acc;
            }, {}),
            response: free()
        });
        document.querySelectorAll('[data-askq]').forEach(b => b.addEventListener('click', () => {
            const q = (a.questions || [])[Number(b.dataset.askq)];
            const o = q && (q.options || [])[Number(b.dataset.asko)];
            if (!q || !o) { return; }
            const cur = askPick.by[q.question] || [];
            if (q.multiSelect) {
                const at = cur.indexOf(o.label);
                askPick.by[q.question] = at >= 0
                    ? cur.filter(x => x !== o.label)
                    : cur.concat([o.label]);
                renderAsk();
                return;
            }
            askPick.by[q.question] = [o.label];
            // A single-select question with every question answered IS the
            // answer — clicking the last option is the press.
            if ((a.questions || []).every(x => (askPick.by[x.question] || []).length)) { answer(); }
            else { renderAsk(); }
        }));
        byId('c-ask-send', 'click', answer);
        byId('c-ask-allow', 'click', () => vscode.postMessage({ type: 'askAnswer', id: s.id, kind: 'allow' }));
        byId('c-ask-always', 'click', () => vscode.postMessage({ type: 'askAnswer', id: s.id, kind: 'allowAlways' }));
        byId('c-ask-deny', 'click', () => vscode.postMessage({
            type: 'askAnswer', id: s.id, kind: 'deny', message: free()
        }));
        const box = document.getElementById('c-ask-free');
        if (box) {
            box.addEventListener('keydown', ev => {
                if (ev.key !== 'Enter') { return; }
                ev.preventDefault();
                if ((a.questions || []).length) { answer(); }
                else if (box.value.trim()) { vscode.postMessage({ type: 'askAnswer', id: s.id, kind: 'deny', message: box.value.trim() }); }
            });
        }
    }

    /**
     * The OTHER kind of refusal — the one nobody was asked about.
     *
     * Since the session is invited to ask (see askBoxHtml), most permission
     * decisions arrive as a question you answer and the turn carries on. This
     * box is what is left: a tool stopped by a permission RULE, a hook, or a CLI
     * that does not know how to ask. Nothing was put to you, so there is nothing
     * to allow — what a button can do is change the session's standing rule and
     * ask the agent to try again.
     */
    function permissionBox(s) {
        if (!s || !s.pendingPermission) { return ''; }
        return `<div class="permbox">
            <div class="t">⚠ A tool was refused — permission was never granted for it</div>
            <div class="d">${C.esc(s.pendingPermission.detail)}</div>
            <div class="d">This one was settled before it ever reached you — by a permission RULE, a hook, or a CLI too old to ask. (When the session can ask, it does: the turn stops and the question appears above the box.) What the panel can do here is <strong>change this session's rule</strong> — it runs in <strong>${C.esc(s.permissionMode)}</strong> — and ask the agent to try again:</div>
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
        const rows = orderedSessions().map(s => {
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
                    <span class="m" title="${C.esc(tokTip(s.tokens, sessionSpend(s).cost, s.wTokens))}">${tokBadge(s.tokens, s.wTokens)}</span>
                </div>
                <div class="t2">${C.esc(s.title || '(no name yet)')}</div>
                <div class="m"><span class="phase">${C.esc(p.label)}${waited ? ` · ${waited}` : ''}</span>${(s.queued || []).length ? ` · ${s.queued.length} held` : ''}${s.turns ? ` · ${s.turns} turns` : ''}${s.contextTokens ? ` · <span class="pair" title="Approximate context in the model window right now">ctx ${C.fmtTok(s.contextTokens)}</span>` : ''}${s.projectName ? ` · <span class="pbadge" title="Started under this project — it was told about it, and the session is filed under it">${s.projectIcon ? C.esc(s.projectIcon) : '◧'} ${C.esc(s.projectName)}</span>` : ''}</div>
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
        return `${callout}
            ${back}
            ${rows || '<div class="empty">No hosted sessions yet. Pick an agent below and say something — the process starts here, in the panel.</div>'}`;
    }

    /**
     * The column's own header: start a session, and say how the cards below are
     * ordered. Same shape as the resume section's header for the same reason —
     * a full-width action with one small button on its right that opens a
     * miniature panel — so the two ends of the column read as one control
     * language rather than two.
     */
    function listHeadHtml() {
        const mode = (st.order || {}).mode || 'fixed';
        const m = ORDER_MODES.find(x => x.v === mode);
        return `<div class="rhead lhead">
            <button class="rtoggle" id="c-new" title="Start a new conversation — it runs here, in the panel">
                <span class="rlabel">＋ New session</span>
            </button>
            <button class="secondary rfilter${st.showOrder ? ' on' : ''}${mode !== 'fixed' ? ' ordon' : ''}" id="c-toggle-order"
                title="How the cards below are ordered — currently: ${C.esc(m ? m.t : mode)}">⇅</button>
        </div>`;
    }

    /** ‼️ The numbers are deliberately NOT in this html — same reason as the
     *  resume filter: the boxes are filled imperatively so typing in one does
     *  not rebuild the box being typed in. */
    function orderPanelHtml() {
        if (!st.showOrder) { return ''; }
        const o = st.order || ORDER_DEFAULT();
        return `<div class="rpanel">
            <select id="c-ord-mode" title="What is allowed to move a card">
                ${ORDER_MODES.map(m =>
                    `<option value="${m.v}"${m.v === o.mode ? ' selected' : ''}>${C.esc(m.t)}</option>`).join('')}
            </select>
            ${o.mode === 'active' ? `<div class="rrow">
                <label class="rn" title="How many separate signs of life a session must show before it is allowed to climb. 1 = every single line moves it.">after
                    <input type="number" id="c-ord-ticks" min="1" max="99">
                </label>
                <label class="rn" title="Once the order changes, how long it is held still before anything may climb again. 0 = no hold at all.">hold
                    <input type="number" id="c-ord-hold" min="0" max="600">
                </label>
            </div>` : ''}
            <div class="rnote">${o.mode === 'fixed'
                ? 'Cards stay where they arrived — newest first. The count above the list is how you reach whoever is waiting.'
                : o.mode === 'waiting'
                    ? 'Only the ball being yours lifts a card — needs-permission first, then your turn — and it drops back once you have answered. Nothing moves while an agent works.'
                    : 'A card climbs after <b>after</b> signs of life, then the order is held for <b>hold</b> seconds. <b>1</b> and <b>0</b> give you the instant version.'}</div>
        </div>`;
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
        const filtered = !!DATA.resumeFiltered;
        return `<div class="rhead">
            <button class="secondary rtoggle" id="c-toggle-resume"
                title="The sessions on your shelf and the transcripts on this machine — click one to carry it on in the panel">
                <span class="rlabel">${st.showResume ? '▾' : '▸'} ${filtered ? 'Resume a session' : 'Resume an existing session'}</span>
                ${filtered ? '<span class="rfiltered" title="This list is narrowed — the ⌦ button clears it">filtered</span>' : ''}
            </button>
            <button class="secondary rfilter${st.showRFilter ? ' on' : ''}" id="c-toggle-rfilter"
                title="Filter these sessions: name, agent, when, your shelf, how many">⌕</button>
            <button class="secondary rfilter rclear${filtered ? ' on' : ''}" id="c-rq-clear"${filtered ? '' : ' disabled'}
                title="${filtered ? 'Clear the filter — back to your shelf and the newest sessions' : 'No filter set'}">⌦</button>
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
        const chip = (id, label, on, tip, cls) =>
            `<button class="rchip${cls ? ' ' + cls : ''}${on ? ' on' : ''}" id="${id}" title="${C.esc(tip)}">${label}</button>`;
        return `<div class="rpanel">
            <div class="rtext">
                <input type="text" id="c-rq-text" placeholder="name, agent, label or #id…"
                       title="${C.esc(window.AFQuery.tip("Searched against the session's name, its agent, its labels and its id — paste an id from any card or menu to land on that one session."))}">
                <button class="rx" id="c-rq-xtext" hidden title="Clear what you typed (the rest of the filter stays)">⨯</button>
            </div>
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
                ${chip('c-rq-nlock', st.limitLocked ? '🔒' : '🔓', st.limitLocked,
                    st.limitLocked
                        ? 'How many to show is pinned: it survives "clear filter" and applies whether or not a filter is set. Click to unpin.'
                        : 'How many to show is part of the filter and clears with it. Click to pin it.',
                    'lock')}
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
                <div class="m wrap">${who(r.agentName, r.sessionId)} · ${relTime(r.ts)} ago${r.tokens ? ` · <span class="pair" title="${C.esc(tokTip(r.tokens, r.cost, r.wTokens))}">${tokBadge(r.tokens, r.wTokens)}</span>` : ''}${r.contextTokens ? ` · <span class="pair" title="Approximate context after this session's last reply — what resuming it starts from">ctx ${C.fmtTok(r.contextTokens)}</span>` : ''}</div>
            </div>`).join('');
        // How many of how many — a list that silently ends at fifteen is why
        // the filter had to exist in the first place.
        const total = Number(DATA.resumeTotal) || 0;
        const capped = list.length >= (Number(DATA.resumeMax) || 200);
        // The clear button lives in the header now, next to the thing that set
        // the filter — at the bottom of a list you have to scroll to it.
        const count = `<div class="rcount">
            <span title="${capped ? 'The most this panel will list at once — narrow the filter to see further' : 'How many of your sessions this list is showing'}">${list.length} of ${total}${capped ? ' (max)' : ''}</span>
            ${DATA.resumeFiltered ? '<span>·</span><span>filtered</span>' : ''}
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

    /**
     * The turn's size, in the shape every surface uses: `14api·26steps`.
     *
     * ‼️ THE STRIP USED TO SAY ONLY THE SECOND NUMBER, AND IT IS THE ONE THAT
     * EXPLAINS THE LEAST. Steps are what you watch scroll past; round trips are
     * what the tokens are charged for, and one trip carries several steps. A
     * turn doing the same visible work in half the round trips reads as
     * unchanged here while its token figure halves — which is exactly how a
     * correct counter comes to look broken.
     *
     * ‼️ AND THE STEP COUNT IS NO LONGER WORKED OUT FROM THE ROWS ON SCREEN.
     * It arrives with the state (`turnSteps`), counted off the transcript's own
     * blocks by the reducer — which is the only place that can see a thinking
     * block, since thinking is deliberately never drawn. Counting rows here
     * swept in tool results and the panel's own notices and could not see the
     * reasoning at all: too big and short of the expensive part at the same
     * time. See core/consoleproto.ts ConsoleState.turnSteps.
     */
    function stepsHtml(apiCalls, steps, thinking) {
        if (!steps && !apiCalls) { return ''; }
        const tip = thinking
            ? `${C.STEPS_TIP}\n\nOf these ${steps} steps, ${thinking} were the model reasoning — billed as output tokens, the dearest kind.`
            : C.STEPS_TIP;
        return ` · <span title="${C.esc(tip)}">${C.esc(C.fmtSteps(apiCalls, steps))}</span>`;
    }

    /**
     * The same strip, after the turn is over.
     *
     * ‼️ THE ONE MOMENT THE FIGURE WAS FINAL IS THE MOMENT IT USED TO DISAPPEAR.
     * The live strip went blank the instant the ball came back to you, and the
     * turn's closing line scrolled away with the conversation — so "what did the
     * turn that just ended actually cost, and how long did it take?" had no
     * answer on screen. It stays here, in the same place, until your next prompt
     * starts a new turn (the host clears `lastTurn` then — see consoleproto.ts).
     *
     * It must not be mistakable for the live one, so: no motion, a settled glyph,
     * the word "last turn", and the figures are the CLI's own — no "~".
     */
    /**
     * WHAT THE TURN IS THINKING WITH — the model and the effort, on the strip.
     *
     * ‼️ THE STRIP PRICED THE TURN WITHOUT EVER SAYING WHAT WAS DOING IT. It
     * gave you the seconds, the money and the lines, i.e. every consequence of
     * the choice, and never the choice — so "why is this turn slow / dear?"
     * ("because it is opus on xhigh") could only be answered by looking away
     * from the strip at the pickers below, which show what the NEXT turn will
     * use, not this one.
     *
     * The id is shortened the way every other surface shortens it (parseModel,
     * shared with core/speaker.ts): `claude-opus-5-20260514` → `opus 5`. An id
     * with no family in it is printed as it came — a name we do not recognise is
     * still the answer, and inventing a prettier one would hide which model ran.
     * Effort rides along bare (`· xhigh`): the tooltip is where the word is
     * explained, and "effort: " on a strip this dense is three wasted columns.
     *
     * ‼️ IT IS THE CLI'S ANSWER, NOT THE PICKERS'. The pair used to be read off
     * the composer's own model/effort boxes, so it appeared only when the user
     * had picked something — leave them on "Default", which is the normal way to
     * start a session, and the strip said nothing at all while the turn ran on a
     * real model at a real effort out of `~/.claude/settings.json`. Nothing here
     * depends on a choice being made any more: the host asks the CLI itself
     * (`get_settings.applied`) at the start of every turn — see
     * core/consoleproto.ts.
     *
     * Silence is still meaningful, and now means something narrower: no model =
     * the CLI has not answered yet (the first moments of the first turn); a
     * model with no effort beside it = this model HAS no effort levels, which is
     * the CLI's own `effort: null` and the honest thing to show.
     */
    function turnBrainHtml(model, effort, running) {
        const m = String(model || '').trim();
        const e = String(effort || '').trim();
        if (!m && !e) { return ''; }
        let label = '';
        if (m) {
            const p = C.parseModel(m);
            label = p.model ? (p.version ? `${p.model} ${p.version}` : p.model) : (p.raw || m);
        }
        const both = [label, e].filter(Boolean).join(' · ');
        const verb = running ? 'is running on' : 'ran on';
        const tip = `${label ? `${running ? 'This' : 'That'} turn ${verb} ${label}` : 'That turn'}${e
            ? ` at ${e} reasoning effort`
            : label ? ' — a model with no effort levels' : ''} — the CLI's own answer for THIS turn, not the pickers below: it is what the settings chain really resolved to, whether or not anything was chosen. A model or effort switch applies from the NEXT turn, so the pickers can legitimately say something else.`;
        return ` · <span class="wbrain" title="${C.esc(tip)}">${C.esc(both)}</span>`;
    }

    const DONE_GLYPH = { done: '✓', interrupted: '⎋', failed: '⚠' };

    /**
     * The strip, printed as the two rows it is: WHAT is happening on top, WHAT
     * IT HAS COST underneath and right-aligned (see the `.working` styles).
     *
     * The meta pieces each arrive with their own ` · ` in front, because on one
     * line they were appended to a duration that was always there. On its own
     * row the duration can be the missing one, so a leading separator would
     * open the line with a floating dot — trimmed here rather than in six
     * callers.
     */
    function stripHtml(head, meta) {
        const m = String(meta || '').replace(/^\s*·\s*/, '').trim();
        return `<div class="wrow">${head}</div>${m ? `<div class="wmeta">${m}</div>` : ''}`;
    }

    function lastTurnHtml(s) {
        const t = s && s.lastTurn;
        if (!t) { return ''; }
        const glyph = DONE_GLYPH[t.outcome] || '✓';
        const word = t.outcome === 'interrupted' ? 'last turn interrupted'
            : t.outcome === 'failed' ? 'last turn failed' : 'last turn';
        const money = t.cost || t.tokens
            ? ` · <span title="What that turn cost, as the CLI reported it — not an estimate. The line under the box is the whole session.">${spend(t.cost, t.tokens, t.wTokens)}</span>`
            : '';
        return stripHtml(
            `<span class="dspin">${glyph}</span> <b>${word}</b>`,
            `${t.ms ? C.fmtDur(t.ms) : ''}${money}${stepsHtml(t.apiCalls, t.steps, t.thinking)}${turnBrainHtml(t.model, t.effort, false)} · your turn now`);
    }

    function workingHtml(s) {
        if (!s || s.status !== 'working') { return lastTurnHtml(s); }
        const glyph = SPIN[spinAt % SPIN.length];
        const ran = s.turnStartedAt ? Math.max(0, Date.now() - s.turnStartedAt) : 0;
        // what it reached for last — the honest version of "Thinking…"
        // ‼️ AND WHAT KIND OF WORK THAT IS. "working" and a tool name told you
        // WHAT was happening and never WHERE IT COSTS: a Read off this disk is
        // free to run while the model writing is billed at the output rate. The
        // chip in front says which, with the explanation on hover.
        let doing = 'working';
        let doingKind = '';
        for (let i = (s.messages || []).length - 1; i >= 0; i--) {
            const m = s.messages[i];
            if (m.role === 'user') { break; }
            if (m.role === 'tool' && m.tool) {
                doing = m.tool.detail ? `${m.tool.name} ${m.tool.detail}` : m.tool.name;
                doingKind = m.kind || '';
                break;
            }
            if (m.role === 'agent' && m.text) { doingKind = m.kind || 'say'; doing = 'writing'; break; }
        }
        const doingChip = doingKind ? C.stepChip(doingKind) + ' ' : '';
        const q = queuedOf(s).length;
        // What this turn is spending, as it spends it. The CLI only reports a
        // turn's real cost when the turn ends, so the money here is priced off
        // the tokens seen so far and carries a "~" until then — the line that
        // closes the turn, two centimetres up, is the CLI's own figure.
        // ‼️ It says "this turn" out loud. The line under the box says "this
        // session" and the two are three centimetres apart; unlabelled, the
        // smaller number reads as a second opinion about the same thing.
        const cost = s.turnTokens || s.turnCost
            ? ` · <span title="What THIS TURN has spent so far — the line under the box is the whole session. The money is an estimate at the usual rates; the turn's closing line carries the CLI's own figure.">~${spend(s.turnCost, s.turnTokens, s.turnWTokens)} this turn</span>`
            : '';
        // ‼️ "⎋ Interrupt stops it" used to close this line and is gone on
        // purpose: it is a permanent instruction about a button that is on
        // screen, two centimetres below, already labelled "⎋ Interrupt" — so it
        // spent the strip's most valuable column repeating what the composer
        // already says. The Esc key it also taught now lives in that button's
        // tooltip, where a key hint belongs. What took its place is the one thing
        // nothing else on screen was saying: WHAT this turn is thinking with.
        return stripHtml(
            `<span class="spin">${glyph}</span> ${doingChip}<b>${C.esc(doing)}</b>`,
            `${C.fmtDur(ran)}${cost}${stepsHtml(s.turnApiCalls, s.turnSteps, s.turnThinking)}${q ? ` · ${q} held` : ''}${turnBrainHtml(s.turnModel, s.turnEffort, true)}`);
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

    /**
     * The bits of the live composer row that change while a turn runs.
     *
     * ‼️ SEND AFTER TURN PARKS WHAT IS IN THE BOX — SO AN EMPTY BOX MUST SAY SO.
     *
     * Named to sit next to its sibling: **Send into turn** delivers now, at the
     * next step boundary; **Send after turn** delivers once the turn is fully
     * done. (It used to say "⏸ Hold", which named the WAITING rather than the
     * WHEN — true, but it read as a queue with no obvious reason to prefer it
     * over just typing again once the turn ends, which is the question this
     * button actually answers.)
     *
     * Both composer buttons hand their text to `send()`, which returns without
     * a word when there is nothing to send. For Send into turn that is
     * invisible (you pressed it having typed nothing). For Send after turn it
     * was the entire feature looking broken: the natural moment to reach for it
     * is right AFTER a message has gone into the running turn — and by then the
     * box is empty, so the button did nothing, said nothing, and the queue
     * below it never appeared. A control that answers a click with silence has
     * taught you it does not work, and everything downstream of it (the held
     * line, its ✎ ⏩ ⨯) is then never seen either.
     *
     * So the state is on the button: it is disabled while there is nothing to
     * park, and its tooltip says what would make it live. `st.draft` is the box
     * (the textarea writes it on every keystroke), and the row is repainted
     * from the same keystroke — `slot()` means that costs one comparison until
     * the emptiness actually flips.
     */
    function liveBitsHtml(s) {
        if (!s) { return ''; }
        const q = queuedOf(s).length;
        const empty = !(st.draft || '').trim();
        // ‼️ A HELD MESSAGE CANNOT CARRY FILES. The queue keeps strings
        // (shiftQueued/takeQueued in consoleproto), so parking a message with
        // an attachment would drop the file on the way. Saying so beats losing
        // it quietly — widening the queue is the next step, not this one.
        const hasFiles = (st.attach || []).length > 0;
        const holdOff = empty || hasFiles;
        const hold = `<button class="secondary" id="c-hold"${holdOff ? ' disabled' : ''} title="${hasFiles
            ? 'A message with attached files cannot be parked — send it now, or remove the files first.'
            : empty
                ? 'Nothing to send yet — type the message first. Send after turn parks it above the box, still editable, and hands it over once this turn ends completely.'
                : 'Park it instead of sending it into this turn: it waits above the box — editable — and goes once the turn ends'}&#10;${SNIP_HINT}">Send after turn</button>`;
        return `${q ? `<span class="qbadge" title="Waiting to be sent — they go once this turn ends">${q} held</span> <button class="secondary" id="c-clearq">drop all</button>` : ''}
            ${s.status === 'working' ? hold : ''}
            ${s.status === 'working' ? '<button class="secondary" id="c-int" title="Stop the running turn — the session and its context stay. Esc in the message box does the same.">⎋ Interrupt</button>' : ''}`;
    }

    /**
     * What you chose to send AFTER the turn — not said yet, and still yours.
     *
     * Typing while a turn runs sends the message into that turn (the agent
     * picks it up at its next step). Send after turn is the other choice, for
     * "say this next, not now" — and a message that has not been said must be
     * as changeable as one you have not typed yet, which is why every line here
     * carries its own three verbs instead of one collective "clear":
     *   ✎ back into the box, to rewrite it (↑ in an empty box does the same)
     *   ⏩ never mind, say it into the running turn now
     *   ⨯ drop it
     */
    function queueHtml(s) {
        const q = queuedOf(s);
        if (!q.length) { return ''; }
        const one = (t, i) => `<div class="qline"
            ${window.AFCtx.row('afConsoleQueued', { qIndex: i, qText: t })}
            title="${C.esc(window.AFCtx.hint('Held until this turn ends'))}">
            <span class="qtext" title="${C.esc(t)}">${C.esc(t.length > 160 ? t.slice(0, 160) + '…' : t)}</span>
            <button class="qbtn" data-qedit="${i}" title="Bring it back into the box to change it (↑ in an empty box does the same)">✎</button>
            <button class="qbtn" data-qnow="${i}" title="Say it now, into the running turn">⏩</button>
            <button class="qbtn" data-qdrop="${i}" title="Drop it — it is never said">⨯</button>
        </div>`;
        return `<div class="qhead">⏸ ${q.length} message${q.length === 1 ? '' : 's'} held — handed over when this turn ends</div>${q.map(one).join('')}`;
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
            const intro = live
                ? `${C.esc(live.agentName)} already has a session running here — <button class="linkish" id="c-goto-live">open it</button> instead, or say something below to start a second one.`
                : `A new session opens in the chosen agent's folder and runs here, in the panel.`;
            // ‼️ Attaching to the FIRST message of a session is normal — the
            // button cannot wait for a session to exist.
            return `${intro}<span class="grow"></span>${attachBtnHtml()}`;
        }
        const dead = s.status === 'ended' || s.status === 'error';
        // The whole session, in one line: what the window is holding, what the
        // conversation has cost and the tokens that bought it, how many turns.
        // (The turn that is running has its own line above the box — the two
        // used to say "ctx" at each other and nothing else.)
        const sp = sessionSpend(s);
        const spTip = sp.est
            ? 'Everything this session has spent — the finished turns as the CLI reported them, plus what the running turn has spent so far, priced off the tokens seen (that is what the ~ is). A conversation you resumed brings its earlier turns with it.'
            : 'Everything this session has spent, as the CLI reported it — and the tokens it bought. A conversation you resumed brings its earlier turns with it.';
        // ‼️ THE LEGEND HANGS ON THE SESSION ID. The step chips are one glyph
        // each and there is no room on this strip for a key, so the one label
        // that is always on screen and never moves carries it: hover the id and
        // the whole scheme is there — every glyph, and what each one costs.
        return `${s.sessionId
            ? `<span class="sidlegend" title="${C.esc(C.stepKindLegendText())}">session ${C.esc(s.sessionId.slice(0, 8))}</span> · `
            : ''}${s.contextTokens ? `<span title="Approximate context in the model window right now">~${C.fmtTok(s.contextTokens)} ctx</span> · ` : ''}<span title="${spTip}">${sp.est ? '~' : ''}${spend(sp.cost, sp.tokens, sp.wTokens)}</span> this session · ${s.turns} turn${s.turns === 1 ? '' : 's'}
            <span class="grow"></span>
            ${attachBtnHtml()}
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

    // ---- the saved prompts: a right-click on any button that SENDS ----------
    /**
     * ‼️ THE PHRASES YOU TYPE EVERY DAY, ONE CLICK FROM THE BOX.
     *
     * The same handful of instructions get retyped into this composer several
     * times a day — "read the file before you change it", "answer in Turkish,
     * code in English", the review checklist. Retyping them is not just slow:
     * a phrase retyped from memory comes out slightly different each time, so
     * the instruction that was carefully worded once is worse every time after.
     *
     * They live in a markdown file the user owns (agentFarm.promptSnippetsFile,
     * parsed by core/prompts.ts) — not in extension settings, because that file
     * is edited in Obsidian with the rest of their notes and can carry as much
     * commentary around the blocks as they like.
     *
     * ‼️ IT HANGS OFF THE SEND BUTTONS, AND THAT IS THE WHOLE DESIGN. The
     * question "what do I say" is asked at the moment of sending, so the
     * gesture belongs on the control that sends: LEFT-click still sends, and
     * only right-click opens this. That is also why it is on ALL of them —
     * Send · Send into turn · Send after turn · Start session are one button in
     * four states, and a feature that appeared in only some of them would read
     * as broken in the others. Nothing here sends anything: a snippet is PASTED
     * at the caret, still yours to edit, and the press that sends is still your
     * own.
     */
    let snip = null;

    const snipOpen = () => {
        snip = { loading: true, q: '', file: '', source: 'none', items: [], error: '' };
        renderSnip();
        vscode.postMessage({ type: 'promptSnippets' });
    };
    const snipClose = () => { snip = null; renderSnip(); };

    /** Insert one snippet at the caret and give the box back. Uses the shared
     *  paste rule (afTextTools) so a block landing beside half a sentence
     *  behaves exactly like Ctrl+V does. */
    function snipUse(text) {
        const box = document.getElementById('c-text');
        if (!box) { return; }
        window.AFTextTools.insert(box, text);
        st.draft = box.value;
        save();
        snipClose();
        renderLive();
        try { box.focus({ preventScroll: true }); } catch (e) { box.focus(); }
    }

    function snipHtml() {
        if (!snip) { return ''; }
        // the box is a QUERY, not a substring — media/afQuery.js
        const q = window.AFQuery.compile(snip.q || '');
        const all = snip.items || [];
        const shown = q.empty ? all
            : all.filter(x => q.test(x.label + ' ' + x.group + ' ' + x.text));
        let body;
        if (snip.loading) {
            body = '<div class="snipnone">Reading the file…</div>';
        } else if (snip.error || !snip.file) {
            body = `<div class="snipnone">${C.esc(snip.error || 'No prompts file yet.')}<br><br>
                Press <b>📁 Choose a file…</b> above and pick a markdown file — your machine's own
                file picker opens. Put each prompt inside a <code>\`\`\`</code> block; everything
                around the blocks is yours to write notes in and is never offered.<br><br>
                The same thing lives on the <b>Farm Settings</b> page under <b>Saved prompts</b>, where
                you can also see everything that was read out of the file.</div>`;
        } else if (!all.length) {
            body = `<div class="snipnone">No blocks in that file yet. Anything you put inside a
                <code>\`\`\`</code> fence shows up here; the text around the fences is yours to
                write notes in and is never offered.</div>`;
        } else if (!shown.length) {
            body = '<div class="snipnone">Nothing matches that.</div>';
        } else {
            let group = null;
            const rows = [];
            for (let i = 0; i < shown.length; i++) {
                const it = shown[i];
                if (it.group !== group) {
                    group = it.group;
                    if (group) { rows.push(`<div class="snipgrp">${C.esc(group)}</div>`); }
                }
                // The whole block rides in the row as a hover: choosing between
                // two prompts means reading them, and a picker that only shows
                // names makes you guess.
                //
                // ‼️ IN THE RICH PANEL, NOT A `title`. A saved prompt is TEXT —
                // the exact case docs/CONVENTIONS.md sends here: the native
                // tooltip repeated the 120-character preview the row had just
                // drawn and then stopped wherever the platform felt like
                // stopping, which on a prompt worth saving is nearly all of it.
                rows.push(window.AFTip.wrap(
                    `<button class="snipitem" data-snip="${i}">
                    <span class="sniplbl">${C.esc(it.label)}</span>
                    <span class="snipprev">${C.esc(it.text.replace(/\s+/g, ' ').slice(0, 120))}</span>
                </button>`,
                    `${it.label}${it.group ? ` · ${it.group}` : ''} · ${window.AFTip.sizeNote(it.text)}`,
                    it.text));
            }
            body = rows.join('');
        }
        return `<div class="snipwrap" id="c-snipwrap">
            <div class="snipbox">
                <div class="sniphead">
                    <b>Saved prompts</b>
                    <span class="snipq">
                        <input id="snip-q" type="text" placeholder="filter…" value="${C.esc(snip.q || '')}">
                        ${snip.q ? '<button class="snipqx" id="snip-qx" title="Clear the filter (Esc closes the window)">✕</button>' : ''}
                    </span>
                    <span class="grow"></span>
                    ${snip.file ? `<button class="secondary" id="snip-file"
                        title="Open the file this list is read from — add a \`\`\` block and it is here the next time you right-click">✎ Edit the file</button>` : ''}
                    <button class="secondary" id="snip-pick" title="${snip.file
        ? 'Point at a different file — your machine\'s own file picker opens'
        : 'Choose the markdown file your prompts live in — your machine\'s own file picker opens'}">📁 ${snip.file ? 'Change file…' : 'Choose a file…'}</button>
                    <button class="secondary" id="snip-x" title="Close (Esc)">✕</button>
                </div>
                <div class="sniplist">${body}</div>
                <div class="snipfoot">${snip.file
        ? `${C.esc(snip.file)} · ${all.length} prompt${all.length === 1 ? '' : 's'}${snip.source === 'built-in' ? ' · built-in path' : ''}`
        : 'Farm Settings → Saved prompts'} · clicking one PASTES it into the box — nothing is sent</div>
            </div>
        </div>`;
    }

    function renderSnip() {
        if (!slot('c-snip', snipHtml())) { return; }
        if (!snip) { return; }
        byId('snip-x', 'click', snipClose);
        byId('snip-file', 'click', () => vscode.postMessage({ type: 'openPromptSnippets' }));
        // ‼️ The OS's own file picker, not a settings page. The panel stays
        // open: the answer comes back as a fresh promptSnippets message and the
        // list you were looking at is simply the new file's.
        byId('snip-pick', 'click', () => {
            snip.loading = true;
            renderSnip();
            vscode.postMessage({ type: 'pickPromptSnippets' });
        });
        // Clicking the backdrop closes it; clicking the panel must not.
        byId('c-snipwrap', 'click', ev => { if (ev.target && ev.target.id === 'c-snipwrap') { snipClose(); } });
        const q = document.getElementById('snip-q');
        if (q) {
            q.addEventListener('input', () => {
                snip.q = q.value;
                renderSnip();
                const again = document.getElementById('snip-q');
                if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
            });
            q.addEventListener('keydown', ev => { if (ev.key === 'Escape') { snipClose(); } });
            try { q.focus({ preventScroll: true }); } catch (e) { q.focus(); }
        }
        // ‼️ CLEARS, NEVER CLOSES. Esc already closes the whole window, so the
        // one gesture the filter box was missing is "show me everything again"
        // without losing the window — and without backspacing a typed phrase
        // one character at a time. The caret goes back into the box, because
        // clearing a filter is nearly always the start of typing another one.
        byId('snip-qx', 'click', () => {
            snip.q = '';
            renderSnip();
            const again = document.getElementById('snip-q');
            if (again) { try { again.focus({ preventScroll: true }); } catch (e) { again.focus(); } }
        });
        const list = (snip.items || []);
        // the same filter snipHtml drew with — the indices have to agree
        const shownQ = window.AFQuery.compile(snip.q || '');
        const shown = shownQ.empty ? list
            : list.filter(x => shownQ.test(x.label + ' ' + x.group + ' ' + x.text));
        document.querySelectorAll('[data-snip]').forEach(el =>
            el.addEventListener('click', () => {
                const it = shown[Number(el.dataset.snip)];
                if (it) { snipUse(it.text); }
            }));
    }

    /** Hang the picker off a button that sends. Left-click is untouched. */
    function wireSnipMenu(id) {
        const el = document.getElementById(id);
        if (!el) { return; }
        el.addEventListener('contextmenu', ev => {
            ev.preventDefault();
            ev.stopPropagation();
            snipOpen();
        });
    }
    /** The tail every sending button's tooltip carries — a menu nobody knows
     *  about is not a feature. */
    const SNIP_HINT = 'right-click for your saved prompts';

    /**
     * ‼️ THE AGENT, FIXED — a composer opened FROM an agent is about that agent.
     *
     * ▶ on a sidebar row used to spawn the session on the spot, which put the
     * composer straight into its running shape: agent fixed (right) and no
     * project box (wrong, and the project can only be chosen BEFORE the first
     * prompt — it rides in on the system prompt at spawn). Nothing is spawned
     * any more; the composer opens with the agent pinned and every box that
     * still decides something live. The CLI starts on the first message.
     *
     * The pin is never a trap: ✕ hands the picker back. Returns '' when the
     * composer was not opened from an agent, and the caller draws the picker.
     */
    function pinnedAgentHtml() {
        const id = DATA.pinnedAgent || '';
        if (!id) { return ''; }
        const a = (DATA.agents || []).find(x => x.id === id);
        if (!a) { return ''; }
        return `<span class="fixed pinned" title="You came here from ${C.esc(a.name)} — the session will open in its folder. ✕ gives the picker back.">
                ${C.esc(a.name)}
                <button class="only" id="c-unpin" title="Choose a different agent instead">✕</button>
            </span>`;
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
        // ‼️ EVERY DIMENSION THAT CAN CHANGE MID-SESSION IS A LIVE CONTROL, AND
        // THEY ARE THE SAME THREE IN THE SAME ORDER AS THE NEW-SESSION ROW.
        // Only the AGENT is fixed, and for a real reason: it is the folder the
        // process was started in, which nothing can move. Model, effort and
        // permissions are all control requests the CLI accepts mid-conversation
        // (/model, /effort, set_permission_mode), so a session opened from an
        // agent row is not a lesser session than one opened from the composer —
        // it just skipped the questions. Effort used to be printed here as dead
        // text next to a live model picker, which said the panel could not
        // change it. It can.
        const controls = s
            ? `<span class="fixed" title="The folder this session opened in — decided when the process started, and the one thing that cannot change">
                    ${C.esc(s.agentName)}
                </span>
                <label class="permlbl" title="Switches the model mid-conversation — the same thing /model does in a terminal. It applies from the next turn.">model
                    <select id="c-model-live">${opts(DATA.models, s.model)}</select>
                </label>
                <label class="permlbl" title="How hard it thinks per turn — the same thing /effort does in a terminal. It applies from the next turn; on a model with no effort levels the CLI accepts it and it means nothing.">effort
                    <select id="c-effort-live">${opts(DATA.efforts, s.effort)}</select>
                </label>
                <label class="permlbl" title="What it may do without asking — applied live. Fewer rows than the start picker on purpose: a running session can only be moved to modes the CLI accepts mid-conversation, and it says so out loud when it refuses one.">permissions
                    <select id="c-perm">${opts(DATA.livePermissions || DATA.permissions, s.permissionMode)}</select>
                </label>
                ${window.AFFilter.multi({
                    // allLabel is what follows "show: " — repeating the word
                    // here is how the button came to read "show: show: …"
                    id: 'c-kinds', label: 'show', allLabel: 'everything',
                    options: KINDS, selected: st.kinds,
                    // ‼️ THE ONE SUBSET THIS LIST HAS A WORD FOR. Seven kinds of
                    // line exist, and the reading a person keeps coming back to
                    // is the conversation itself — what was asked and what was
                    // answered, with the machinery in between out of the way.
                    // Reaching it meant Clear plus two ticks, every time.
                    presets: [{
                        id: 'dialog', label: 'Dialog', values: ['agent', 'user'],
                        title: 'Just the conversation — you and the agent. Tool calls, results, system lines and questions are hidden.'
                    }],
                    title: 'Which kinds of line the conversation shows'
                })}
                <span class="grow"></span>
                <span id="c-live"></span>
                <button id="c-send"${dead ? ' disabled' : ''}>Send</button>`
            : `${pinnedAgentHtml() || `<select id="c-agent" title="Which agent — the session opens in its folder">
                    <option value="">Choose an agent…</option>
                    ${(DATA.agents || []).map(a => `<option value="${C.esc(a.id)}"${a.id === st.agentId ? ' selected' : ''}>${C.esc(a.name)}</option>`).join('')}
                </select>`}
                <select id="c-model" title="Model for the new session (--model)">${opts(DATA.models, st.model)}</select>
                <select id="c-effort" title="Reasoning effort (--effort)">${opts(DATA.efforts, st.effort)}</select>
                <select id="c-perm" title="What it may do without asking (--permission-mode)">${opts(DATA.permissions, st.permissionMode)}</select>
                <select id="c-proj" title="Project for THIS session — it is told about it before you type, and is filed under it. It starts at No project every time: the status bar's active project is the window's answer, not this session's, and neither writes the other.">
                    <option value=""${DATA.activeProjectId ? '' : ' selected'}>◧ No project</option>
                    ${(DATA.projects || []).map(p => `<option value="${C.esc(p.id)}"${p.id === DATA.activeProjectId ? ' selected' : ''}>${p.icon ? C.esc(p.icon) + ' ' : '◧ '}${C.esc(p.name)}</option>`).join('')}
                </select>
                <span class="grow"></span>
                <span id="c-live"></span>
                <button id="c-send">Start session</button>`;

        document.getElementById('app').innerHTML = `${STYLE}
            <div id="c-head"></div>
            <div class="cwrap">
                <div class="clist">
                    <div id="c-lhead"></div>
                    <div id="c-opanel"></div>
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
                    <div class="askbox" id="c-ask"></div>
                    <div class="working" id="c-working"></div>
                    <div class="composer" id="c-composer">
                        <div id="c-project"></div>
                        <div class="qwait" id="c-queue"></div>
                        <div class="chips" id="c-chips"></div>
                        <div class="tawrap">
                            <textarea id="c-text" placeholder="${placeholder}"${dead ? ' disabled' : ''}></textarea>
                            ${window.AFTextTools.html('c')}
                        </div>
                        <div class="crow" id="c-controls">${controls}</div>
                        <div class="crow" id="c-status" style="font-size:10px;opacity:.6"></div>
                    </div>
                </div>
            </div>
            <div id="c-snip"></div>`;
        // A rebuild starts every slot over.
        for (const k of Object.keys(written)) { delete written[k]; }

        const text = document.getElementById('c-text');
        if (text) {
            text.value = st.draft || '';
            // The keystroke is what decides whether Send after turn and Send can act, so
            // it repaints that row (see renderLive) — `slot()` makes every
            // keystroke but the one that flips "empty" a no-op.
            text.addEventListener('input', () => { st.draft = text.value; save(); renderLive(); });
            text.addEventListener('keydown', ev => {
                if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); send(); }
                // ↑ in an empty box pulls the last HELD message back to be
                // rewritten — the terminal's own key for its own queue.
                if (ev.key === 'ArrowUp' && !text.value) {
                    const cur = sel();
                    const q = queuedOf(cur);
                    if (q.length) {
                        ev.preventDefault();
                        recallQueued(cur.id, q.length - 1, q[q.length - 1]);
                    }
                }
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
            // The height survives the rebuild that just destroyed the element
            // it was set on. Restored BEFORE focus, so the box is already its
            // real size when the caret lands in it and nothing is seen to jump.
            if (st.boxH) { text.style.height = st.boxH; }
            // …and a drag is recorded. Inline `height` is written by the resize
            // handle and by the line above and by nothing else, so watching the
            // element and reading its INLINE height tells a user drag apart
            // from a re-layout (a window resize changes the rendered height and
            // leaves the inline one alone, and must not be saved as a choice).
            if (typeof ResizeObserver === 'function') {
                new ResizeObserver(() => {
                    const h = text.style.height;
                    if (h && h !== st.boxH) { st.boxH = h; save(); }
                }).observe(text);
            }
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
        byId('c-send', 'click', () => send(false));
        // …and a right-click on the same button opens the saved prompts. Send
        // after turn gets it in renderLive, where that button is drawn.
        wireSnipMenu('c-send');
        // ‼️ 📎 IS NOT WIRED HERE, AND THAT IS THE WHOLE POINT. It is drawn by
        // statusHtml into the `c-status` SLOT, which is empty at this moment and
        // rewritten on every data update — so a listener attached here binds to
        // nothing on the first pass and to a discarded element on every one
        // after. It was silently dead: the button drew, hovered and pressed, and
        // nothing happened, which is the most expensive kind of broken.
        // A control is wired where it is DRAWN (see renderStatus).
        wireAttach();
        paintChips();

        // ---- the box's four text tools -------------------------------------
        // Shared with the Backlog tab's capture box (media/afTextTools.js). The
        // component owns the four buttons and the paste rule; this page owns
        // what a change MEANS — the draft is state, and the row above the box
        // follows the same keystroke (see renderLive).
        window.AFTextTools.wire({
            prefix: 'c', boxId: 'c-text',
            onChange: value => { st.draft = value; save(); renderLive(); }
        });
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
        // Mid-session model switch. The picker is NOT set back from `s.model`
        // on a repaint until the CLI has agreed to it (see pendingModel) —
        // showing the new name before then would be a promise about the next
        // turn that the panel is in no position to make.
        byId('c-model-live', 'change', e => {
            const cur = sel();
            if (cur) { vscode.postMessage({ type: 'setModel', id: cur.id, model: e.target.value }); }
        });
        // Same contract as the model picker: asked for now, shown once the CLI
        // has agreed (see pendingEffort).
        byId('c-effort-live', 'change', e => {
            const cur = sel();
            if (cur) { vscode.postMessage({ type: 'setEffort', id: cur.id, effort: e.target.value }); }
        });
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
        // The project picker moves the WINDOW's active project — the same one
        // the status bar and the sidebar show. A console-only project would be
        // a second answer to "what am I working on", and the two would disagree
        // within a minute.
        byId('c-proj', 'change', e => vscode.postMessage({ type: 'setProject', id: e.target.value }));
        // giving the pin back: the picker returns, and st keeps whatever agent
        // was pinned as its starting selection
        byId('c-unpin', 'click', () => vscode.postMessage({ type: 'unpinAgent' }));
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
        if (slot('c-lhead', listHeadHtml())) {
            byId('c-new', 'click', () => vscode.postMessage({ type: 'select', id: '' }));
            byId('c-toggle-order', 'click', () => {
                st.showOrder = !st.showOrder;
                save();
                renderList();
            });
        }
        if (slot('c-opanel', orderPanelHtml())) { wireOrderPanel(); }
        fillOrderPanel();

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
            // the nudge, answered: go to whichever has waited longest
            byId('c-next', 'click', () => {
                const next = needingYou()[0];
                if (next) { vscode.postMessage({ type: 'select', id: next.id }); }
            });
        }
        renderResume();
    }

    function wireOrderPanel() {
        byId('c-ord-mode', 'change', e => {
            st.order.mode = e.target.value;
            orderChanged();
            save();
            renderList();
        });
        // The numbers apply as you type — they only change how the NEXT climb
        // is judged, so there is nothing to commit and nothing to undo.
        const num = (id, key, min, max) => byId(id, 'input', e => {
            const v = parseInt(e.target.value, 10);
            st.order[key] = isFinite(v) ? Math.max(min, Math.min(max, v)) : min;
            orderChanged();
            save();
        });
        num('c-ord-ticks', 'minTicks', 1, 99);
        num('c-ord-hold', 'holdSec', 0, 600);
    }

    /** Same rule as the resume filter: never write into a box that has the
     *  focus, or the value jumps back while it is being typed. */
    function fillOrderPanel() {
        const set = (id, v) => {
            const e = document.getElementById(id);
            if (!e || e === document.activeElement) { return; }
            if (e.value !== v) { e.value = v; }
        };
        set('c-ord-ticks', String(st.order.minTicks));
        set('c-ord-hold', String(st.order.holdSec));
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
            byId('c-rq-clear', 'click', clearResumeFilter);
        }

        if (slot('c-rpanel', resumePanelHtml())) { wireResumePanel(); }
        fillResumePanel();

        if (slot('c-rlist', resumeListHtml())) {
            document.querySelectorAll('[data-resume]').forEach(r =>
                r.addEventListener('click', () => vscode.postMessage({
                    type: 'resume', sessionId: r.dataset.resume,
                    model: st.model, effort: st.effort, permissionMode: st.permissionMode
                })));
        }
    }

    /** Back to the default list — keeping the row count when it is pinned,
     *  because "how many" was never part of the question (see st.limitLocked). */
    function clearResumeFilter() {
        const keep = st.limitLocked ? st.rq.limit : 0;
        st.rq = EMPTY_RQ();
        st.rq.limit = keep;
        rqChanged(true);
        fillResumePanel(true);
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
        on('c-rq-text', 'input', () => rqTyped(() => {
            st.rq.text = el('c-rq-text').value;
            paintTextClear();
        }));
        on('c-rq-xtext', 'click', () => {
            st.rq.text = '';
            const box = el('c-rq-text');
            if (box) { box.value = ''; box.focus(); }
            paintTextClear();
            // not structural: clearing the words must not rebuild the box you
            // are standing in (see resumePanelHtml)
            rqChanged(false);
        });
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
        on('c-rq-nlock', 'click', () => { st.limitLocked = !st.limitLocked; rqChanged(true); });
    }

    /** The ⨯ belongs to the box's CONTENT, and the content is never in the
     *  markup — so its visibility is set here, imperatively, for the same
     *  reason the values are (see resumePanelHtml). */
    function paintTextClear() {
        const x = document.getElementById('c-rq-xtext');
        if (x) { x.hidden = !(st.rq.text || '').length; }
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
        paintTextClear();
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

    /**
     * The composer's live half: Send after turn / Interrupt / the held-count,
     * and the Send button's own two states.
     *
     * Its own function because it has TWO reasons to be redrawn, like the left
     * panel: a data push, and **a keystroke** — what the box holds decides
     * whether Send after turn and Send can do anything at all (see
     * liveBitsHtml), and a button whose enabled-ness only catches up when the
     * CLI happens to say something is a button that is wrong most of the time
     * you look at it.
     */
    function renderLive() {
        const s = sel();
        // the box's own tools follow the same keystroke as the Send buttons
        window.AFTextTools.paint('c', !!(st.draft || ''));
        // …and so does the chip list: what is hanging on the message is part of
        // the message, so it is drawn wherever the message is (see paintChips).
        paintChips();
        if (slot('c-live', liveBitsHtml(s))) {
            byId('c-int', 'click', () => vscode.postMessage({ type: 'interrupt', id: DATA.selected }));
            byId('c-hold', 'click', () => send(true));
            wireSnipMenu('c-hold');
            byId('c-clearq', 'click', () => vscode.postMessage({ type: 'clearQueue', id: DATA.selected }));
        }
        const sendBtn = document.getElementById('c-send');
        if (!sendBtn) { return; }
        const dead = s && (s.status === 'ended' || s.status === 'error');
        // Files alone are a message — Send must not stay greyed out when the
        // box is empty but a screenshot is attached.
        const empty = !(st.draft || '').trim() && !(st.attach || []).length;
        // It no longer waits for the turn to end, so it no longer says "Queue"
        // — it goes into the turn that is running (Send after turn, next to it,
        // is what waiting looks like now).
        const working = !!s && s.status === 'working';
        const label = s ? (working ? 'Send into turn' : 'Send') : 'Start session';
        if (sendBtn.textContent !== label) { sendBtn.textContent = label; }
        const tip = (empty
            ? 'Nothing to send yet — type a message (Ctrl+Enter sends it too)'
            : working
                ? 'Delivered at the next step boundary — the agent picks it up mid-turn, the way a terminal does. Send after turn, next to it, waits for the turn to end completely instead.'
                : '') + `\n${SNIP_HINT}`;
        if (sendBtn.title !== tip) { sendBtn.title = tip; }
        sendBtn.disabled = !!dead || empty;
    }

    /**
     * ‼️ THE PROJECT CHIP — the transparency debt of an invisible channel.
     *
     * The project context is sent as an appended system prompt, which never
     * appears in the transcript: the user cannot see it the way they see their
     * own message. 3.50.0 was titled "the composer stops lying about what it is
     * sending"; sending something on someone's behalf that they cannot inspect
     * is that same fault through a different channel.
     *
     * So the chip shows the text VERBATIM on hover — not a description of it,
     * not a summary. It is read back off the file the CLI is handed, so it
     * cannot drift from what was actually sent.
     *
     * It is also drawn when NO project is set, saying so: "nothing is being
     * added" is information too, and its absence is what would make the
     * presence of a stamp feel arbitrary.
     *
     * ‼️ AND IT HANGS OFF AFTip, NOT A NATIVE `title`. The text this chip exists
     * to show is a whole appended system prompt — hundreds of lines on a real
     * project. A platform tooltip takes that, draws as much of it as it feels
     * like, cuts, and cannot be scrolled or reached with the pointer; so the one
     * surface built to make an invisible channel readable was the one surface
     * that could not show what it was hiding. AFTip is the box the backlog's
     * `more` proved out: as tall as the screen allows, scrollable, and the
     * pointer travels into it (docs/CONVENTIONS.md → Hover).
     */
    function projectChipHtml() {
        const id = DATA.activeProjectId || '';
        const p = (DATA.projects || []).find(x => x.id === id);
        const T = window.AFTip;
        if (!p) {
            return T.wrap(
                '<span class="pchip none">◧ No project<span class="pchip-hint">hover to read what is sent</span></span>',
                'No project — nothing is added to the system prompt',
                'Sessions you start here are told nothing extra and are filed nowhere.\n\n'
                + 'Pick a project in the row below and this chip shows the exact text it will be given.');
        }
        const ctx = DATA.projectContext || '';
        const trigger = `<span class="pchip">◧ ${C.esc(p.name)} — project context active<span class="pchip-hint">hover to read what is sent</span></span>`;
        if (!ctx) {
            return T.wrap(trigger, `${p.name} · context unreadable`,
                'This session is filed under the project. Its context could not be read back — the folder may have moved.');
        }
        return T.wrap(trigger,
            T.lines([`${p.name} · ${T.sizeNote(ctx)} · added to the system prompt before your first message`]),
            ctx);
    }

    function paint() {
        const s = sel();
        // ‼️ THE PIN IS PART OF THE KEY. It decides whether the composer draws a
        // picker or a name, which is markup — so a pin that arrived while the
        // composer was already on screen has to rebuild the shell, exactly as a
        // change of session does.
        const key = `${DATA.selected || ''}|${s ? s.status === 'ended' || s.status === 'error' : 'none'}|${DATA.pinnedAgent || ''}`;
        if (shellKey !== key) {
            shellKey = key;
            buildShell(s);
        }
        // A pinned composer has no picker to disagree with, and the agent it is
        // fixed to is the one that must be started — not whatever was last left
        // in the page's own state.
        if (DATA.pinnedAgent && st.agentId !== DATA.pinnedAgent) {
            st.agentId = DATA.pinnedAgent;
            save();
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

        // What a session started here is being told — see projectChipHtml.
        slot('c-project', projectChipHtml());

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

        // The parked question, between the conversation and the composer — its
        // own slot, so a streamed line does not rebuild the card you are in the
        // middle of clicking (the same rule the composer lives by).
        renderAsk();

        renderLive();
        if (slot('c-queue', queueHtml(s))) {
            const q = queuedOf(s);
            document.querySelectorAll('[data-qedit]').forEach(b =>
                b.addEventListener('click', () => {
                    const i = Number(b.dataset.qedit);
                    recallQueued(DATA.selected, i, q[i]);
                }));
            document.querySelectorAll('[data-qnow]').forEach(b =>
                b.addEventListener('click', () => vscode.postMessage({
                    type: 'queueSend', id: DATA.selected, index: Number(b.dataset.qnow)
                })));
            document.querySelectorAll('[data-qdrop]').forEach(b =>
                b.addEventListener('click', () => vscode.postMessage({
                    type: 'queueTake', id: DATA.selected, index: Number(b.dataset.qdrop)
                })));
        }
        // deliberately NOT a slot: it repaints itself on a timer while the turn
        // runs, so its html is never what `written` last saw
        paintWorking();

        if (slot('c-status', statusHtml(s))) {
            const byId = (id, ev, fn) => { const el = document.getElementById(id); if (el) { el.addEventListener(ev, fn); } };
            // 📎 lives in this row, so it is wired in this row — every rewrite
            // hands it a new element, and a listener from the last one is gone.
            byId('c-attach', 'click', () => vscode.postMessage({ type: 'attachPick' }));
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

    // ------------------------------------------------------- right-click menu

    /**
     * The two things on this page that are WAITING: a message you chose to send
     * after the turn, and a request the session is holding the turn open for.
     *
     * Every branch posts what the line's own buttons post. What the menu adds
     * is that both of these are small, dense rows whose three glyph buttons are
     * easy to miss and easy to hit by accident — and the ability to copy what
     * is being asked, which neither row offered at all.
     */
    function ctxDo(act, ctx) {
        const id = DATA.selected;
        switch (act) {
            case 'cqNow':
                vscode.postMessage({ type: 'queueSend', id: id, index: Number(ctx.qIndex) });
                return;
            case 'cqDrop':
                vscode.postMessage({ type: 'queueTake', id: id, index: Number(ctx.qIndex) });
                return;
            case 'cqEdit':
                recallQueued(id, Number(ctx.qIndex), String(ctx.qText || ''));
                return;
            case 'cqCopy': window.AFCtx.copy(ctx.qText); return;
            case 'caAllow':
                vscode.postMessage({ type: 'askAnswer', id: id, kind: 'allow' });
                return;
            case 'caDeny':
                vscode.postMessage({ type: 'askAnswer', id: id, kind: 'deny', message: '' });
                return;
            case 'caCopy': window.AFCtx.copy(ctx.askText); return;
        }
    }

    // ‼️ ONCE, at module scope — this page repaints in slots, several times a
    // second while a turn runs.
    window.AFCtx.listen(ctxDo);

    /** Take a held message back into the box — it leaves the queue, so it can
     *  only be said again on purpose. */
    function recallQueued(id, index, textValue) {
        const box = document.getElementById('c-text');
        if (box) {
            box.value = box.value ? `${textValue}\n${box.value}` : textValue;
            st.draft = box.value;
            save();
            renderLive();   // text arrived without a keystroke — the row must catch up
            try { box.focus({ preventScroll: true }); } catch (e) { box.focus(); }
        }
        vscode.postMessage({ type: 'queueTake', id, index });
    }

    // ---- attachments ---------------------------------------------------------
    // ‼️ THE COMPOSER ONLY EVER HOLDS PATHS, never bytes. The extension reads
    // the file at SEND time (consolehost.loadAttachments), which is why a 5 MB
    // screenshot is not sitting in webview state and why a file deleted between
    // attaching and sending is reported instead of silently sent as it was.
    //
    // Three gestures, one answer: click, drop and paste all end up asking the
    // extension for a real path, because a webview cannot see one (browser
    // security — a dropped File has a name and bytes, never a location).

    const IMG_RE = /\.(png|jpe?g|gif|webp)$/i;

    /**
     * A path a drag can be believed about: a Windows drive, a UNC share, a
     * POSIX root or a `file:` URI. Deliberately ABSOLUTE-only — a dropped
     * fragment like "src/a.ts" has no meaning without a working directory, and
     * treating it as a file produced a warning instead of a paste.
     */
    const ABS_PATH_RE = /^(?:[a-z]:[\\/]|\\\\[^\\]|\/[^/]|file:\/\/)/i;

    /** How many files may hang on one message — ATTACH_LIMITS.count, handed over
     *  by the panel so the ceiling has ONE definition (it is also the host's
     *  last line of defence, and a number typed twice is a number that drifts). */
    const attachMax = () => (typeof DATA.attachMax === 'number' && DATA.attachMax > 0 ? DATA.attachMax : 20);

    function fmtBytes(n) {
        if (!n) { return ''; }
        return n < 1024 ? `${n} B`
            : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB`
                : `${(n / (1024 * 1024)).toFixed(1)} MB`;
    }

    function attachBtnHtml() {
        const n = (st.attach || []).length;
        // ‼️ The button opens a FILE picker, and the tooltip says so, because it
        // cannot open both: Windows has no dialog that selects files and folders
        // at once, and asking for both gives you the folder picker — which is
        // why this button used to open a window with no files in it at all. A
        // folder is attached by dropping it, and that is worth one clause here
        // rather than a dead end at the dialog.
        return `<button class="secondary" id="c-attach" title="Attach files — click here, drop them anywhere on this page, or paste a screenshot into the box. A FOLDER can only be dropped, not picked (Windows has no files-and-folders dialog). Images travel inside the message; everything else is handed over as a path the agent opens itself.">📎${n ? ' ' + n : ''}</button>`;
    }

    function chipsHtml() {
        const list = st.attach || [];
        return list.map(a => {
            const img = a.kind === 'image';
            const kd = img ? 'embedded' : 'path';
            const tip = img
                ? 'This image travels inside the message — it leaves this machine in full.'
                : 'Only the path is sent; the agent opens the file itself with Read.';
            return `<span class="chip" title="${C.esc(a.path)}">
                <span class="nm">${C.esc(a.name)}</span>
                ${a.bytes ? `<span class="sz">${fmtBytes(a.bytes)}</span>` : ''}
                <span class="kd" title="${tip}">${kd}</span>
                <span class="x" data-drop="${C.esc(a.path)}" title="Remove">✕</span>
            </span>`;
        }).join('');
    }

    /**
     * ‼️ THE CHIP LIST IS A SLOT, AND THAT IS THE WHOLE FIX. It used to be
     * written by hand from three places and NEVER from the render path, so
     * `send()` — which empties `st.attach` — left the chips on screen for good:
     * nothing redrew them until the shell was rebuilt. The panel then said the
     * files were still hanging on the next message while the composer knew they
     * were gone, so the next prompt went out WITHOUT them and looked as if it
     * had taken them. A surface that lies about what it is about to send is
     * worse than one that never had the feature.
     *
     * As a slot it is redrawn by `renderLive` — i.e. on every keystroke, every
     * data push and every send — and costs nothing when the html has not
     * changed.
     */
    function paintChips() {
        if (slot('c-chips', chipsHtml())) {
            const box = document.getElementById('c-chips');
            // ONE listener on the container, not one per chip: the list is
            // rebuilt on every change, so per-chip listeners would pile up —
            // and delegation needs nothing but addEventListener. The element
            // itself survives every slot write and only goes with a shell
            // rebuild, which is exactly when the flag goes with it.
            if (box && !box.__afWired && box.addEventListener) {
                box.__afWired = true;
                box.addEventListener('click', ev => {
                    const t = ev && ev.target;
                    const p = t && t.getAttribute && t.getAttribute('data-drop');
                    if (!p) { return; }
                    st.attach = (st.attach || []).filter(a => a.path !== p);
                    save();
                    renderLive();
                });
            }
        }
        const btn = document.getElementById('c-attach');
        if (btn) {
            const n = (st.attach || []).length;
            const label = `📎${n ? ' ' + n : ''}`;
            if (btn.textContent !== label) { btn.textContent = label; }
        }
    }

    function addAttachments(files) {
        const have = new Set((st.attach || []).map(a => a.path));
        for (const f of files) {
            if (!f || !f.path || have.has(f.path)) { continue; }   // the same file twice is one file
            if ((st.attach || []).length >= attachMax()) {
                // Refusing quietly would be the one thing this feature must not
                // do — the extension says it out loud.
                vscode.postMessage({ type: 'attachTooMany' });
                break;
            }
            have.add(f.path);
            st.attach = (st.attach || []).concat([{
                path: f.path, name: f.name || f.path, bytes: f.bytes || 0,
                kind: f.kind || (IMG_RE.test(f.path) ? 'image' : 'path')
            }]);
        }
        save();
        renderLive();   // draws the chips, and Send/Hold change meaning once a file is on
    }

    /**
     * A dropped/pasted file has bytes but no path — the extension gives it one.
     *
     * The ceiling is applied HERE, against what is already hanging on the
     * message, so twenty-one dropped files do not each get written into the temp
     * folder before the twenty-first is refused. And every ending speaks: files
     * that read, a refusal when there is no room, and a warning when nothing
     * survived the read — that last one used to return in silence, which is the
     * exact bug this whole feature keeps being reported for.
     */
    function spill(fileList) {
        const all = Array.from(fileList || []);
        if (!all.length) { return; }
        const room = Math.max(0, attachMax() - (st.attach || []).length);
        if (!room) { vscode.postMessage({ type: 'attachTooMany' }); return; }
        const files = all.slice(0, room);
        if (all.length > files.length) { vscode.postMessage({ type: 'attachTooMany' }); }
        let pending = files.length;
        const out = [];
        const done = () => {
            if (--pending > 0) { return; }
            if (out.length) { vscode.postMessage({ type: 'attachDrop', files: out }); }
            else { vscode.postMessage({ type: 'attachNothing' }); }
        };
        for (const f of files) {
            const r = new FileReader();
            r.onload = () => {
                const s = String(r.result || '');
                const comma = s.indexOf(',');
                const data = comma >= 0 ? s.slice(comma + 1) : '';
                // The clipboard's own media type comes along: a pasted
                // screenshot often has no name at all, and the SUFFIX is what
                // decides whether the model sees the picture or is merely told
                // a file exists (see safeAttachmentName).
                if (data) { out.push({ name: f.name || 'attachment', type: f.type || '', data }); }
                done();
            };
            r.onerror = done;
            r.readAsDataURL(f);
        }
    }

    function wireAttach() {
        // ‼️ THE DROP TARGET IS THE WHOLE PAGE, NOT THE BOX. A drop that lands
        // two centimetres from a target the user never knew about is
        // indistinguishable from a feature that does not work — and the box is
        // the smallest, bottom-most strip on the page, i.e. the least likely
        // place for a hand carrying a file to let go. The box is still the thing
        // that LIGHTS UP, because that is where the file is going.
        wirePaste();
        // ‼️ A USER-OWNED OFF SWITCH, ON PURPOSE. Drag-and-drop is a browser
        // API this host does not control end to end — if it ever misbehaves on
        // a particular machine, the fix cannot wait on a release. 📎 and paste
        // are untouched by this: they never listen for a drag.
        if (DATA.dropZone === false) { return; }
        // The page survives every rebuild, so it is wired ONCE — a listener per
        // shell rebuild would spill the same drop several times over.
        const page = document.getElementById('app');
        if (!page || page.__afDropWired) { return; }
        page.__afDropWired = true;

        /**
         * ‼️ THE HIGHLIGHT IS A STATE, NOT A PER-EVENT INSTRUCTION.
         *
         * `dragover` fires continuously — many times a second, for as long as
         * the hand is over the page — and `dragleave` BUBBLES from every child
         * the pointer crosses. Turning the outline on in one and off in the
         * other therefore added and removed a full-page `outline` dozens of
         * times a second for the whole duration of a drag: a style
         * recalculation and a repaint per frame, plus a `getElementById` per
         * frame, for a border that was already drawn. On this machine a drag
         * ended with the display driver resetting. Now the class is written
         * ONLY when the answer actually changes, and `dragenter`/`dragleave` are
         * counted so crossing a child is not a departure.
         */
        let lit_on = false;
        let depth = 0;
        const lit = on => {
            if (lit_on === on) { return; }      // nothing changed — touch nothing
            lit_on = on;
            const composer = document.getElementById('c-composer');
            if (composer && composer.classList) { composer.classList[on ? 'add' : 'remove']('drop'); }
        };

        /**
         * Is this drag OURS to take?
         *
         * ‼️ A PAGE-WIDE DROP TARGET MUST NOT EAT THE TEXT DRAGS IT DOES NOT
         * WANT. Claiming every drag (preventDefault on all of them) silently
         * killed dropping selected text into the message box — an ordinary
         * thing to do that used to work. So:
         *   · Files / uri-list — a real file, always ours;
         *   · plain text — only when it is let go OUTSIDE the box. Some drags
         *     carry a path as text and nothing else; inside the box the same
         *     data is just text, and the browser's own handling is right.
         * `types` is readable during the drag; the DATA is not (by design), so
         * this is the whole of what can be known before the drop.
         */
        const oursToTake = ev => {
            const dt = ev.dataTransfer;
            if (!dt) { return false; }
            const types = dt.types ? Array.prototype.slice.call(dt.types) : [];
            if (types.indexOf('Files') >= 0 || types.indexOf('text/uri-list') >= 0) { return true; }
            const t = ev.target;
            return !(t && t.id === 'c-text');
        };

        page.addEventListener('dragenter', ev => {
            if (!oursToTake(ev)) { return; }
            ev.preventDefault();
            depth++;
            lit(true);
        });
        page.addEventListener('dragover', ev => {
            if (!oursToTake(ev)) { return; }
            // preventDefault is what makes the page a valid drop target at all;
            // dropEffect is what makes the cursor say "copy" instead of the
            // "no entry" sign Windows shows by default.
            ev.preventDefault();
            try { ev.dataTransfer.dropEffect = 'copy'; } catch (e) { /* older webview */ }
        });
        page.addEventListener('dragleave', () => {
            depth = Math.max(0, depth - 1);
            if (!depth) { lit(false); }
        });
        page.addEventListener('drop', ev => {
            depth = 0;
            lit(false);
            if (!oursToTake(ev)) { return; }   // a text drag into the box stays the box's
            ev.preventDefault();
            const dt = ev.dataTransfer;
            if (!dt) { return; }
            // Dragged out of the VS Code Explorer: real URIs, no staging needed.
            const uriList = dt.getData('text/uri-list');
            if (uriList) {
                const uris = uriList.split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'));
                if (uris.length) { vscode.postMessage({ type: 'attachUris', uris }); return; }
            }
            // Dragged out of the OS file manager: bytes only.
            if (dt.files && dt.files.length) { spill(dt.files); return; }
            // Some drags carry the path as PLAIN TEXT and nothing else (VS Code
            // does it for a file dragged with a modifier held). Only an ABSOLUTE
            // path is taken for one: the old test — "contains a slash" — read
            // every dragged sentence and every URL as a filename, and each one
            // became a warning about a file that never existed.
            const plain = (dt.getData('text/plain') || '').split(/\r?\n/)
                .map(x => x.trim())
                .filter(x => x.length < 500 && ABS_PATH_RE.test(x));
            if (plain.length) { vscode.postMessage({ type: 'attachUris', uris: plain }); return; }
            // ‼️ AND IF NOTHING CAME OUT OF IT, SAY SO. Silence here is the bug
            // the user reported from the other side: you drop a file, the page
            // does not move, and there is no way to tell "nothing was attached"
            // from "attached, but the panel never shows it".
            vscode.postMessage({ type: 'attachNothing' });
        });
    }

    /** A pasted screenshot is the whole reason this feature exists. Only hijack
     *  the paste when the clipboard actually carries a file — pasting text must
     *  keep working exactly as it did. The BOX is rebuilt with the shell, so
     *  unlike the page-level drop this is wired on every rebuild. */
    function wirePaste() {
        const box = document.getElementById('c-text');
        if (!box) { return; }
        box.addEventListener('paste', ev => {
            const items = ev.clipboardData && ev.clipboardData.files;
            if (items && items.length) { ev.preventDefault(); spill(items); }
        });
    }

    function send(hold) {
        const text = document.getElementById('c-text');
        const value = text ? text.value.trim() : '';
        const files = (st.attach || []).slice();
        // A screenshot on its own is a message; empty AND fileless is not.
        if (!value && !files.length) { return; }
        const cur = sel();
        if (cur && cur.status !== 'ended' && cur.status !== 'error') {
            vscode.postMessage({ type: 'send', id: cur.id, text: value, hold: hold === true, attach: files });
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
                model: st.model, effort: st.effort, permissionMode: st.permissionMode,
                attach: files
            });
        }
        st.draft = '';
        st.attach = [];
        save();
        if (text) { text.value = ''; }
        renderLive();   // the box emptied itself — Send and the tools follow at once
        // You just said something: you are back at the bottom by definition.
        jumpToEnd();
    }

    window.addEventListener('message', ev => {
        // The extension answers every attach gesture the same way: with real
        // paths. The composer never learns where they came from.
        if (ev.data && ev.data.type === 'attached') {
            addAttachments(ev.data.files || []);
            return;
        }
        // The saved prompts, read off the file at the moment they were asked
        // for. A late answer to a picker the user already closed is dropped.
        if (ev.data && ev.data.type === 'promptSnippets') {
            if (!snip) { return; }
            snip = {
                loading: false, q: snip.q || '',
                file: ev.data.file || '', source: ev.data.source || 'none',
                items: ev.data.items || [], error: ev.data.error || ''
            };
            renderSnip();
            return;
        }
        // A refused send gives the message back whole — text and files — so
        // nothing has to be retyped or re-attached.
        if (ev.data && ev.data.type === 'restore') {
            const box = document.getElementById('c-text');
            if (ev.data.text && box && !box.value) { box.value = ev.data.text; st.draft = ev.data.text; }
            addAttachments(ev.data.files || []);
            renderLive();
            return;
        }
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
    // The answer card's ceiling is a share of the WINDOW, so dragging the panel
    // taller or shorter changes whether it is cut — and nothing else on the page
    // would repaint to say so.
    if (window.addEventListener) { window.addEventListener('resize', markAskOverflow); }

    paint();
    // The list you left open (and the question you left it asking) is state the
    // HOST has to know about: it is the one that can see every session, and it
    // computes nothing for a section nobody is looking at.
    if (st.showResume) { postResume(); }
})();
