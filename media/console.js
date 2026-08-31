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
        /**
         * Which kinds of line the conversation shows; null = everything.
         *
         * ‼️ K-21 — THIS IS THE STARTING POINT, NOT THE SETTING. What `show` is
         * set to belongs to the CARD, not to the panel: two sessions side by
         * side are two different readings — one you are following line by line,
         * one you only want the dialogue of — and a single shared value meant
         * pressing a card silently re-filtered it to whatever the last card was
         * left on. `kindsBy` is each session's own answer; this is what a
         * session that has never been given one starts from.
         */
        kinds: null,
        /** sessionId → that card's own `show`, once it has been set (K-21) */
        kindsBy: {},
        /**
         * How tall the writing box was dragged, in whole pixels.
         *
         * ‼️ K-9 — A NUMBER THE PAGE OWNS, NOT AN INLINE STYLE IT HOPES SURVIVES.
         * The drag handle writes an inline height and `buildShell` writes the
         * whole composer from scratch, so the height had to be put back by hand
         * after every rebuild and anything landing between the two won instead.
         * It is applied as a custom property on the document root now, which no
         * rebuild touches, and it is clamped on the way in and on the way out so
         * a stored figure can never raise the ceiling the css sets — the two
         * halves of K-9, in `AFTextTools.keepHeight`. 0 means "never dragged".
         */
        boxH: 0,
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
    // An earlier build stored the box's height as a css length ('220px').
    // parseInt reads both that and the number, so nothing below has to care.
    st.boxH = parseInt(st.boxH, 10) || 0;
    if (!st.kindsBy || typeof st.kindsBy !== 'object') { st.kindsBy = {}; }
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
    /**
     * U-105 — how many pixels the column's own scrollbar gutter takes, read off
     * THE COLUMN rather than off a synthetic probe.
     *
     * ‼️ A probe div with `overflow:scroll` is the usual trick and it is wrong
     * here: measured, it answers 0 on this machine while `.clist` really
     * reserves 15 — the gutter is decided by `scrollbar-gutter` on that element
     * and the theme it is under, not by a bare scroller somewhere else on the
     * page. So the answer comes from the box the number is FOR. Reading it back
     * after the value is applied gives the same 15 (the gutter does not depend
     * on the width), so this settles in one pass rather than chasing itself.
     */
    function measureScrollbar() {
        try {
            const col = document.querySelector('.clist');
            if (!col) { return; }
            const gutter = col.offsetWidth - col.clientWidth;
            document.documentElement.style.setProperty('--af-sbw', (gutter > 0 ? gutter : 0) + 'px');
        } catch (e) { /* the 0px default is the old behaviour, not a break */ }
    }

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
        /* ‼️ U-105 — THE COLUMN IS 250px OF CONTENT, SCROLLBAR OR NO SCROLLBAR.
           The Resume section lives inside this scroller, so opening it is what
           pushes the column past the window — the bar appears, and on a classic
           (non-overlay) scrollbar it is taken OUT OF the 250px. Every card above
           narrowed by ~15px on a section being opened at the bottom, and went
           back when it closed. The width was never wrong; it was measured from
           a box that changed.
           So the gutter is reserved ALWAYS (scrollbar-gutter:stable, no flicker
           on the first overflow) and the basis is widened by exactly the gutter,
           which the shell measures once into --af-sbw. The content box stays
           at the 250px everything on this column is designed around — the width
           it had with the section CLOSED, which is the state being kept. Where
           scrollbars are overlays (headless Chrome, macOS) the measurement is 0
           and this is literally the old rule. */
        .clist { flex:0 0 calc(250px + var(--af-sbw, 0px)); display:flex; flex-direction:column; gap:6px;
            min-width:0; min-height:0; overflow-y:auto; overflow-x:hidden; scrollbar-gutter:stable; }
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
        /* ‼️ K-13 — the identity line is two things, and only ONE of them may be
           cut. The name is the flexible half; the id is a fixed eight characters
           that mean nothing at all once an ellipsis reaches them. */
        .srow .n { font-weight:600; font-size:12px; display:flex; align-items:center; gap:5px;
            overflow:hidden; white-space:nowrap; }
        .srow .n .nm { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .srow .m { font-size:10px; color:var(--vscode-descriptionForeground); margin-top:2px; }
        /* A meta line too long for 250px wraps at a "·", never inside a figure:
           "ctx" on one line and "132.0k" on the next is not a reading. */
        .srow .m.wrap { white-space:normal; }
        .srow .m .pair { white-space:nowrap; }
        /* ---- whose turn is it (see phaseOf) --------------------------------
           A card carries its phase three ways at once — a coloured edge, a dot
           and a WORD — so it survives a light theme, a colourblind reader and a
           glance from two metres away. Only the transient state moves. */
        /* ‼️ K-35: the colour label. Bottom-right of the card, out of the way of
           every figure already there — and small, because it is a MARK and not
           a status: the phase dot on the left is the one that means something
           by itself, and two loud dots on a card would compete. */
        .srow { position:relative; }
        .cdotw { position:absolute; right:7px; bottom:6px; line-height:0; }
        .cdotc { width:11px; height:11px; padding:0; border-radius:50%; cursor:pointer;
            background:transparent; border:1px solid var(--vscode-descriptionForeground,#888);
            opacity:.45; transition:opacity .12s, transform .12s; }
        .srow:hover .cdotc { opacity:.9; }
        .cdotc:hover { opacity:1; transform:scale(1.15); }
        /* A colour that has been chosen is not a hint — it stays at full strength
           whatever the pointer is doing, or the whole point (glanceability) is
           only true while you are already looking at it. */
        .cdotc.on { opacity:1; border-width:1px; }
        .cdotc.dead { cursor:default; opacity:.25; border-style:dashed; display:inline-block; }
        .cpal { position:absolute; right:0; bottom:16px; z-index:6; width:132px;
            padding:6px; border-radius:6px; line-height:normal;
            border:1px solid var(--vscode-widget-border,#4444);
            background:var(--vscode-editorWidget-background,var(--vscode-editor-background));
            box-shadow:0 6px 18px #0007; }
        .cpalr { display:flex; flex-wrap:wrap; gap:4px; }
        .csw { width:20px; height:20px; padding:0; border-radius:50%; cursor:pointer;
            border:2px solid transparent; }
        .csw:hover { transform:scale(1.12); }
        .csw.on { border-color:var(--vscode-focusBorder); }
        .cpalf { display:flex; align-items:center; justify-content:space-between; gap:6px;
            margin-top:6px; font-size:10px; }
        .cpalc { display:flex; align-items:center; gap:4px; cursor:pointer; opacity:.8; }
        .cpalc input { width:20px; height:20px; padding:0; border:none; background:none; cursor:pointer; }
        .cpalx { background:transparent; border:none; cursor:pointer; font-size:10px;
            opacity:.7; text-decoration:underline; color:inherit; padding:0; }
        .cpalx:hover { opacity:1; }
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
        .srow .sid { font-weight:400; opacity:.6; font-size:10px; flex:none; }
        /* outside the flex identity line (the resume rows) there is no gap to
           inherit, so the id gets its own breathing space */
        .srow .m .nm + .sid { margin-left:4px; }
        .srow .t2 { display:block; font-size:11px; margin-top:2px;
            overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        /* ‼️ U-50 — WRAPPING A LINE IN A TIP MAKES THE WRAPPER THE CHILD. The
           trigger is no longer the flex item its rules were written for, so
           those rules move out here — otherwise the identity line stops
           shrinking, the name never reaches its ellipsis, and the card grows a
           horizontal scroll inside a 250px column. */
        .srow .h > .af-tipw.nw { flex:1 1 auto; min-width:0; display:block; overflow:hidden; }
        .srow .h > .af-tipw.mw { flex:none; }
        .srow > .af-tipw.t2w { display:block; min-width:0; }
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
        /* ‼️ K-23 — the way further back, IN the row that says there is one.
           That row is faded italic commentary; an action wearing the same
           clothes reads as part of the sentence, so the button keeps its own
           weight and upright face inside it. */
        .msg.sys .older { font-size:10px; font-style:normal; opacity:1;
            padding:1px 8px; border-radius:10px; margin-left:2px; white-space:nowrap; }
        .msg.sys .older[disabled] { opacity:.5; }
        .msg.sys .af-tipw { display:inline-block; vertical-align:baseline; }
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
        /* X-133 — the Superpowers switch sits ON THE SAME LINE as the project
           chip because they are two halves of one appended system prompt: what
           this session is told about, and how it is expected to work. Drawn as
           a chip rather than a checkbox so the row stays one strip of facts,
           and it is a BUTTON — a chip you can press, which is why the hover
           panel yields to the hand (U-74, media/afTip.js does that itself). */
        #c-project { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
        .pchip.sw { cursor:pointer; font:inherit; font-size:10px; line-height:normal; }
        .pchip.sw:hover { filter:brightness(1.12); }
        /* Off is the quiet state — same shape, no fill, so "nothing is being
           added" reads as an absence rather than as a second badge. */
        .pchip.sw.off { opacity:.5; background:none; color:inherit; }
        /* …and unusable is not off: the switch cannot be honoured at all, and a
           control that looks merely unticked would be a lie about why. */
        .pchip.sw.broken { opacity:.5; background:none;
            color:var(--vscode-editorWarning-foreground,#c90);
            border-color:var(--vscode-editorWarning-foreground,#c90); cursor:help; }
        /* A session already running wears its answer; it cannot be changed
           under a system prompt that was written at spawn. */
        .pchip.sw.fixed { cursor:help; }
        /* Which engine: media/afEngine.js draws it and media/common.css colours
           it, so this page, the sessions tables and a session's own page cannot
           disagree about what a Codex row looks like (U-26). The one rule that
           belongs to THIS page is that the badge never shrinks: it sits beside a
           name that truncates, and on the busiest card it used to read "C…". */
        .af-eng { cursor:help; }
        .srow .h .n { flex:1 1 auto; min-width:0; }
        /* ‼️ U-30 — WHAT THE ENGINE CHANGES IS A HOVER, NOT A PARAGRAPH.
           It used to be three printed lines under the controls, in the one strip
           of the page where there is no room: sixty words explaining per-turn
           processes, sitting under a composer, every draw. It is the same text —
           it just waits to be asked for now. The trigger is one character wide
           and sits beside the box it is about. */
        /* The wrapper is the flex CHILD, so it is the thing that has to be
           sized — sizing the trigger inside it leaves a 6px column with a 14px
           mark spilling out of it (measured). */
        .ehintw { flex:none; display:inline-flex; align-items:center; }
        .ehint { display:inline-block; font-size:10px; width:14px; height:14px; line-height:13px;
            text-align:center; border-radius:50%; cursor:help; opacity:.6;
            border:1px solid var(--vscode-widget-border,#4444); }
        .ehint:hover { opacity:1; }
        /* an engine that cannot run is the one case the mark itself must show */
        .ehint.bad { opacity:.9; color:var(--vscode-editorWarning-foreground,#cca700);
            border-color:var(--vscode-editorWarning-foreground,#cca700); }
        /* "no price" is a FACT, not a missing value — quiet, never alarming */
        .noprice { opacity:.6; font-style:italic; }
        /* the same fact, on a session row: which project it was started under */
        .pbadge { font-size:9px; opacity:.75; padding:0 4px; border-radius:7px;
            border:1px solid var(--vscode-widget-border,#4443); }
        /* ‼️ THE HEIGHT YOU DRAG IS A SETTING, NOT A SIDE EFFECT (see st.boxH).
           Three things used to throw it away. The ceiling was 30vh, so a drag
           past a third of the window did nothing and the handle just stopped
           under the cursor — it read as "it snapped back". The height a drag
           sets is an INLINE style on the element, which buildShell replaces, so
           it had to be put back by hand after every rebuild and whatever ran in
           between won instead. And the figure that was put back was never
           checked against the ceiling, so a box that snapped back came back
           taller each time until it could cover the page.
           Now: the ceiling is 70vh — the conversation above is a min-height:0
           flex scroller, so it yields the room and the composer never leaves the
           window — and the height is --af-boxh, a custom property on the
           document root that no rebuild can touch, clamped both ways by
           AFTextTools.keepHeight. The box is born its own size. The fallback is
           auto and not a figure: a box that was never dragged must keep the
           size the layout gives it, exactly as it did before there was a
           property at all. */
        .composer textarea { width:100%; height:var(--af-boxh, auto);
            min-height:64px; max-height:70vh; resize:vertical; font:inherit;
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
        /**
         * ‼️ U-28 — THE BUTTONS DO NOT MOVE, AND THE BOXES NO LONGER SIZE
         * THEMSELVES.
         *
         * Two faults, one cause. The row was flex-wrap:wrap over selects with
         * no declared width, so every box was as wide as its longest OPTION:
         * a long project name or "Gemini — not signed in" grew its own box,
         * pushed everything right, and dropped Send onto a second line. The
         * control you are reaching for moved because of a string in a box next
         * to it.
         *
         * Measured before the change (fixture console, 1400px window, 1030px
         * row): agent 121 · engine 145 · model 97 · effort 66 · permission 133
         * · project 105 — and those are the SHORT values this fixture happens to
         * carry. The widths below are declared instead, at the shares asked for
         * against the real, content-driven sizes: agent −25%, engine −35%,
         * permission −30%, project −60%.
         *
         * And when it still does not fit, the row shrinks in a chosen ORDER
         * rather than wherever flexbox likes: project and permission first (they
         * are the rightmost and the least often changed), then the engine, and
         * the agent last. Send and its neighbours never shrink and never wrap.
         */
        .crow { display:flex; gap:6px; align-items:center; flex-wrap:nowrap; margin-top:7px; min-width:0; }
        .crow select { font-size:11px; padding:2px 4px; min-width:0; }
        .crow .grow { flex:1 1 0; min-width:0; }
        /* the identity end of the row: sized, shrinkable, in that order */
        #c-agent { flex:1 1 120px; max-width:120px; }
        #c-engine { flex:2 1 118px; max-width:118px; }
        /* ‼️ X-105 — the route and its tier. Sized like the engine and the
           effort beside them because that is what they are: the route decides
           what the model row MEANS, the tier is a short word. Both are drawn
           only where the engine has the axis AND something is set up, so the row
           measured above is unchanged for everybody else. */
        #c-route { flex:2 1 112px; max-width:112px; }
        #c-tier { flex:1 1 74px; max-width:74px; }
        /* ‼️ THE LABEL IS THE QUIET HALF, THE VALUE IS NOT. .permlbl dims the
           whole wrapper, which is right on the RUNNING row — three boxes, all
           labelled, reading as one group — and wrong here, where these two sit
           among six unlabelled selects: a dimmed value among full-strength ones
           reads as a disabled control, which is the opposite of what a route
           somebody just chose should look like. Its own class, so the running
           row is untouched. (No backticks in this block: the whole stylesheet is
           a template literal, and one would end it.) */
        .crow .rtlbl { min-width:0; flex:0 1 auto; font-size:10px;
            display:flex; align-items:center; gap:4px; }
        .crow .rtlbl > span { opacity:.6; flex:none; }
        #c-model, #c-model-live { flex:1 1 112px; max-width:112px; }
        #c-effort, #c-effort-live { flex:1 1 82px; max-width:82px; }
        #c-perm { flex:3 1 104px; max-width:104px; }
        #c-proj { flex:3 1 104px; max-width:104px; }
        /* the label wrappers of the running composer are sized by their select */
        .crow .permlbl { min-width:0; flex:0 1 auto; }
        /* ‼️ THE RIGHT-HAND GROUP IS FIXED. Whatever else gives way, these keep
           their size and their place: a button that moves is a button you have
           to look for. */
        .crow #c-live, .crow #c-send, .crow button { flex:none; }
        .crow #c-live { display:inline-flex; align-items:center; gap:6px; }
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
        /* SAVED PROMPTS — the picker's own rules live with the shared
           component, in media/common.css (.af-snip*). */
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
     * ‼️ X-19 — AN ENGINE THAT STATES NO PRICE IS NOT AN ENGINE THAT COST ZERO.
     *
     * Codex runs against a ChatGPT plan: it counts tokens and never reports a
     * dollar figure for a turn, and the adaptor deliberately emits no
     * `total_cost_usd` rather than a zero (codexproto.ts). So every line that
     * would have printed `$0.0000` here goes through this instead — the tokens,
     * which are the real measure on a plan, and the reason there is no money
     * beside them. A $0.00 on a session that has just spent forty thousand
     * tokens is not a smaller number, it is a WRONG one: it reads as "that was
     * free" and it is the single most misleading thing this page could show.
     *
     * `reportsCost` comes off the session's own engine (consoleEngine.ts), so a
     * window holding one Claude session and one Codex session prints money on
     * the first row and tokens on the second, correctly, at the same time.
     */
    // ‼️ "STATES NO PRICE", NOT "RUNS ON A PLAN" (X-35). This tooltip used to
    // assert the billing arrangement off a capability flag — and the two are
    // different facts. `reportsCost: false` means the CLI prints no dollars;
    // Codex may be on a ChatGPT plan or an API key, Gemini on a Google account
    // or GEMINI_API_KEY, and on a key every one of these turns is invoiced.
    // Telling the user "on a plan" made a financial claim nothing had checked.
    const NO_PRICE_TIP = 'This engine counts tokens and never states a per-turn price, so there is no dollar '
        + 'figure to show. A $0.00 here would read as "free", which is why nothing is invented. Whether the '
        + 'usage is covered by a plan or billed per token depends on how the engine is signed in — the '
        + 'Engines page reads that from its own credentials.';

    function engineSpend(s, cost, tokens, wTokens) {
        if (!s || s.reportsCost !== false) { return spend(cost, tokens, wTokens); }
        const tok = tokens ? `${C.fmtTokW(tokens, wTokens)} tokens` : 'no tokens yet';
        return `<span title="${C.esc(NO_PRICE_TIP)}">${tok} <span class="noprice">· no price stated</span></span>`;
    }
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
    // ‼️ U-38 — THE CARD SHOWS THE RAW FIGURE ONLY, AND SPELLS IT `tk`.
    // The weighted count is the honest answer to "how much of the 5h window did
    // this burn" and it is kept everywhere it can be read properly — the
    // tables, the hover below, the Dashboard. On a card this narrow it was a
    // second number competing with the engine badge for the same few pixels,
    // and two numbers nobody can tell apart are worse than one. `tok` → `tk`
    // for the same three characters of room.
    const tokBadge = (tokens) => (tokens ? `${C.fmtTok(tokens)} tk` : '');
    // The card has room for one line of hover, so the weighted figure is spelled
    // out there rather than left as a glyph — see charts.js WEIGHTED_TIP.
    // ‼️ It takes the SESSION, not three numbers, because whether the money half
    // of this line may be written at all is a fact about the session's engine.
    const tokTip = (s, cost) => ((s && s.tokens) ? `${C.fmtTok(s.tokens)} raw tokens` : 'nothing spent yet')
        + ((s && s.wTokens) ? ` · ⚖ ${C.fmtTok(Math.round(s.wTokens))} against the 5h limit` : '')
        + (s && s.reportsCost === false
            ? ` · ${s.engineLabel} states no per-turn price`
            : (cost ? ` · ${C.fmtUSD(cost)} spent` : ''));

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

    /**
     * `developer (#407c78cb)` — the id is how a row is matched against a tab,
     * a terminal or a log line, so it rides with the agent's name.
     *
     * ‼️ K-13 — IT IS BACK ON THE LINE, AND THE CARD MAKES ROOM FOR IT. U-38
     * took it off because `agent name (#019fe7bc)` plus an engine badge plus a
     * token figure did not fit one column and `(#019f…` says nothing at all.
     * The answer to that is not to hide the id — the user reads it off the card
     * to match a session against a tab, a terminal or a log line — it is to
     * stop the ellipsis: the name shrinks first (`.n` is the flexible half) and
     * the id never wraps or truncates (`.sid` below). The hover still carries
     * the whole id, which is the one you copy.
     */
    const who = (agentName, sessionId) =>
        `<span class="nm">${C.esc(agentName || 'session')}</span>`
        + (sessionId ? `<span class="sid">(#${C.esc(String(sessionId).slice(0, 8))})</span>` : '');
    /**
     * …and the identity line's hover, which now carries it. Figures only,
     * `Label: value` — the card's own tooltip says what the row IS.
     *
     * ‼️ AN ABSENT ID SAYS WHY IT IS ABSENT (X-27). "The Antigravity session's
     * id only reached the card after the third turn" was reported as a card
     * bug and was not one: on a per-turn engine the id is the CLI's own
     * conversation id, which does not exist until a turn has actually RUN —
     * and the first turns had been dying before they started (X-26), so every
     * one of them came back with an empty conversation id. A hover that simply
     * omits the line leaves a reader to guess between "not yet" and "lost",
     * and those need different actions, so it is said instead of dropped.
     */
    const whoLine = (sessionId, shape) => sessionId
        ? 'Session: ' + sessionId
        : shape === 'perTurn'
            ? 'Session: not yet — this engine names the conversation on its first completed turn'
            : 'Session: not yet — the CLI names it as it starts';

    /* ======================================================================
       ‼️ U-50 — A CARD IS A SESSION, AND ITS HOVERS ARE WHERE THAT SESSION IS
       READ WITHOUT OPENING ANYTHING.

       These cards are 250px wide and show six facts about a conversation that
       has forty. Everything they cut — the whole name, the folder, the model
       actually answering, what the turn is parked on, what it has spent — was
       reachable only by opening another page, and that click is the cost this
       panel exists to remove. A native `title` could not carry any of it: it
       repeats the line it is on and then stops wherever the platform feels
       like stopping (docs/CONVENTIONS.md → Hover).

       FOUR SUBJECTS PER CARD, AND THEY DO NOT OVERLAP. The identity line says
       WHO and WHERE; the name says WHAT THIS CONVERSATION IS; the figure says
       WHAT IT HAS SPENT; the phase says WHAT IS HAPPENING RIGHT NOW. A fact
       lives in exactly one of them — four panels repeating each other read as
       no panels at all, which is the complaint that produced this item.

       ‼️ …AND THEY ARE `tip-free`, BECAUSE THE COLUMN SCROLLS. `.clist` is
       `overflow-y:auto` at 250px: a panel growing out of its trigger is
       clipped to that column and cannot be reached with the pointer. Anchored
       to the CARD, so it opens under the card at a readable width whichever
       row the pointer is on, and both edges of the gesture are slowed — this
       is a list people sweep down.
       ====================================================================== */
    // ‼️ `cls` lands on the WRAPPER, and the wrapper becomes the flex/block
    // child in place of the trigger — so every sizing rule that was on the
    // trigger has to move out to it, or the line silently stops being sized
    // (afTip.js says this; the identity line is exactly the case it means).
    const cardTip = (trigger, head, body, cls) =>
        window.AFTip.wrap(trigger, head, body, 'tip-free' + (cls ? ' ' + cls : ''),
            'data-aftip-anchor=".srow"');

    /** A value nobody set is said as the thing that will decide it — never as a
     *  bare "Default", which is a word with no referent (CONVENTIONS.md). */
    const orDefault = (v, who) => v || ('Default — ' + who + ' decides');
    /**
     * ‼️ K-22 — WHAT THE SESSION IS IN, not what somebody asked for.
     *
     * The picker's value is a REQUEST; Claude's own settings can turn "Default"
     * into bypassPermissions, and a card that reported only the request showed
     * an empty Default on a session that was auto-approving everything. So the
     * enforced mode leads, the reason follows, and the request appears only
     * when it differs from what actually happened.
     */
    const permissionLine = s => {
        const enforced = s.enforcedPermissionMode || '';
        const asked = s.permissionMode || '';
        if (!enforced) { return orDefault(asked, 'the CLI'); }
        const head = enforced === 'bypassPermissions'
            ? 'bypassPermissions — enforced, nothing will stop and ask you'
            : enforced;
        return head + (enforced !== asked && s.permissionWhy ? ` (${s.permissionWhy})` : '');
    };
    /** A figure per something, dropped when the denominator is not worth
     *  dividing by (a session with one turn has no average). */
    const perTurn = (n, turns) => (turns > 1 && n > 0 ? n / turns : 0);
    const when = ts => (ts ? window.AFTime.full(ts) : '');

    /**
     * ‼️ X-43 — "ctx" IS HOW FULL THE WINDOW IS, NOT WHAT THE SESSION SPENT.
     *
     * The two were one number on this page and the card read `~5.4M ctx` while
     * the window it was in held 220 471 of 258 400 — measured, on a real Codex
     * thread. They are different quantities and they now have different homes:
     * the spend is "… this session", this is the window.
     *
     * SHORTHAND on the strip (`ctx 220k / 258k`), the whole reading in the
     * AFTip. A percentage is only drawn when it can be computed honestly — no
     * capacity, or a reading larger than the capacity, means the two figures came
     * from different moments and the tip says THAT rather than picking whichever
     * of them makes a percentage possible.
     */
    const ctxPct = (s) => {
        const t = s.contextTokens || 0, w = s.contextWindowTokens || 0;
        return t > 0 && w > 0 && t <= w ? Math.round((t / w) * 100) : 0;
    };
    /** The strip's own text, or '' when nothing has been measured — a `—` where
     *  a figure belongs is the point (never a total standing in for one). */
    const ctxShort = (s) => {
        if (!s.contextTokens) { return ''; }
        return 'ctx ' + C.fmtTok(s.contextTokens)
            + (s.contextWindowTokens ? ' / ' + C.fmtTok(s.contextWindowTokens) : '');
    };
    const CTX_SOURCE_TEXT = {
        'stream-last-call': 'the engine\'s own usage for its last call',
        'rollout-last-token-usage': 'the session\'s rollout on disk (last_token_usage)',
        'transcript-last-call': 'the transcript, read when this session was resumed',
        'engine-reported': 'the engine\'s own reading'
    };
    /** MIRROR — the current value first, then what it means. */
    const ctxTip = (s) => {
        const pct = ctxPct(s);
        const over = s.contextTokens && s.contextWindowTokens
            && s.contextTokens > s.contextWindowTokens;
        return {
            head: ctxShort(s) || 'ctx — not measured',
            body: window.AFTip.lines([
                'Context now: ' + (s.contextTokens ? C.fmtTok(s.contextTokens) : '—'),
                'Window: ' + (s.contextWindowTokens
                    ? C.fmtTok(s.contextWindowTokens) + ' — the capacity this session reports, '
                        + 'which is not always the model\'s published ceiling'
                    : 'this engine states none'),
                pct ? 'Full: ' + pct + '%' : '',
                over
                    ? '‼️ The reading is larger than the window, so the two came from '
                        + 'different moments — no percentage is drawn and nothing is rounded up.'
                    : '',
                s.contextSource
                    ? 'Read from: ' + (CTX_SOURCE_TEXT[s.contextSource] || s.contextSource)
                    : '',
                s.contextMeasuredAt
                    ? 'Measured: ' + relTime(s.contextMeasuredAt) + ' ago'
                        + (s.contextStale ? ' — the last good reading, not a live one' : '')
                    : '',
                '',
                'This is what the window is HOLDING after the last model call. '
                    + 'What the conversation has SPENT is the figure beside it and can '
                    + 'exceed the window many times over — a turn that calls tools makes '
                    + 'many model calls and pays for all of them, while sitting in one window.'
            ])
        };
    };

    /** WHO and WHERE — the half of a card that does not move while it runs. */
    const cardWhoTip = (s) => ({
        head: `${s.agentName || 'session'} · ${s.engineLabel || window.AFEngine.label(s.engine)}`
            + (s.sessionId ? ` · #${String(s.sessionId).slice(0, 8)}` : ''),
        body: window.AFTip.lines([
            'Agent: ' + (s.agentName || 'session'),
            whoLine(s.sessionId, s.turnShape),
            'Engine: ' + (s.engineLabel || window.AFEngine.label(s.engine)),
            'Model: ' + orDefault(s.turnModel || s.model, 'the CLI'),
            'Effort: ' + orDefault(s.turnEffort || s.effort, 'the model'),
            // ‼️ K-22 — the ENFORCED mode, because that is the one the session
            // will actually behave as. The request is shown beside it only when
            // the two differ, which is the case a reader has to be able to see.
            'Permissions: ' + permissionLine(s),
            s.bypassAutoApproved
                ? `Answered for you: ${s.bypassAutoApproved} permission request(s) the CLI sent anyway`
                : '',
            'Folder: ' + (s.cwd || '—'),
            'Project: ' + (s.projectName
                ? `${s.projectIcon || '◧'} ${s.projectName} — it was told about it before you typed`
                : 'not filed under one'),
            // ‼️ THE BLANK LINE IS PART OF THE STRING, not an entry of its own:
            // `AFTip.lines` drops '' so a caller can write `cond ? x : ''`, and
            // a separator written as an empty entry silently disappears. Same
            // shape as the composer's `boxTip` — figures first, then the
            // standing sentence, with air between them.
            '\nClick the card to bring this conversation up; right-click it for the session\'s own actions.'
        ])
    });

    /** WHAT THIS CONVERSATION IS — the name whole, which the card cuts, and the
     *  shape of the thing it names. */
    const cardNameTip = (s) => ({
        head: (s.title ? `${s.title.length.toLocaleString()} characters` : 'not named yet')
            + (s.turns ? ` · ${s.turns} turn${s.turns === 1 ? '' : 's'}` : ' · nothing said yet'),
        body: window.AFTip.lines([
            (s.title || 'The CLI names a session from its first exchange; this one has not had it yet.') + '\n',
            'Turns: ' + (s.turns || 0),
            'Last moved: ' + (s.lastTs ? `${relTime(s.lastTs)} ago · ${when(s.lastTs)}` : '—'),
            (s.queued || []).length ? 'Held messages: ' + s.queued.length + ' — they go the moment this turn ends' : '',
            s.exitReason ? 'Ended: ' + s.exitReason : ''
        ])
    });

    /** WHAT IT HAS SPENT. Figures only, and the derived ones the card implies —
     *  never a second query, all of it off numbers the row already has. */
    const cardCostTip = (s) => {
        const sp = sessionSpend(s);
        const ptk = perTurn(s.tokens || 0, s.turns || 0);
        const pc = perTurn(sp.cost || 0, s.turns || 0);
        return {
            head: `${s.agentName || 'session'} · ${s.tokens ? C.fmtTok(s.tokens) + ' tokens' : 'nothing spent yet'}`,
            body: window.AFTip.lines([
                'Raw tokens: ' + (s.tokens ? C.fmtTok(s.tokens) : '0'),
                s.wTokens ? '⚖ Against the 5h limit: ' + C.fmtTok(Math.round(s.wTokens)) : '',
                s.reportsCost === false
                    ? 'Cost: ' + (s.engineLabel || 'this engine') + ' states no per-turn price'
                    : 'Cost: ' + (sp.est ? '~' : '') + C.fmtUSD(sp.cost || 0)
                        + (sp.est ? ' — the running turn is an estimate until it closes' : ''),
                ptk ? 'Per turn: ' + C.fmtTok(Math.round(ptk)) + ' tokens'
                    + (pc ? ' · ' + C.fmtUSD(pc) : '') : '',
                // ‼️ ONE SUBJECT — the window has its own panel (ctxTip), so this
                // one names it and stops. Repeating the reading here is how the
                // spend tip came to look like it was about the window too.
                s.contextTokens
                    ? 'Context now: ' + ctxShort(s).replace(/^ctx /, '')
                        + ' — a different measurement, see the ctx panel'
                    : ''
            ])
        };
    };

    /** WHAT IS HAPPENING RIGHT NOW — the only one of the four that is about
     *  this moment, so it is the only one that may name the running turn. */
    const cardStateTip = (s) => {
        const p = phaseOf(s);
        const ask = s.pendingAsk && (s.pendingAsk.questions || []).length
            ? (s.pendingAsk.questions[0].question || s.pendingAsk.questions[0].header || '')
            : '';
        const perm = (s.pendingPermission && (s.pendingPermission.toolName || s.pendingPermission.tool)) || '';
        return {
            head: `${p.label || 'nothing said yet'}${s.lastTs ? ` · ${relTime(s.lastTs)} ago` : ''}`,
            body: window.AFTip.lines([
                'Now: ' + (p.label || 'nothing said yet'),
                s.lastTs ? 'Since: ' + when(s.lastTs) : '',
                s.status === 'working' && s.turnStartedAt
                    ? 'This turn started: ' + relTime(s.turnStartedAt) + ' ago'
                    + (s.turnModel ? ' · on ' + s.turnModel : '') : '',
                s.status === 'working' && s.turnTokens
                    ? 'This turn so far: ' + C.fmtTok(s.turnTokens) + ' tokens'
                    + (s.turnApiCalls ? ' · ' + s.turnApiCalls + ' API calls' : '') : '',
                ask ? 'Asking you: ' + ask : '',
                perm ? 'Waiting on permission for: ' + perm : '',
                (s.queued || []).length ? 'Held: ' + s.queued.length + ' message'
                    + ((s.queued || []).length === 1 ? '' : 's') : '',
                s.exitReason ? 'Why it ended: ' + s.exitReason : ''
            ])
        };
    };

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

    /**
     * ‼️ K-21 — `show` IS THE CARD'S, AND ONLY THE CARD'S.
     *
     * A card that has never been filtered starts from `st.kinds` (the panel's
     * standing default, and the value an older install already had). The moment
     * one is set on a card it is written under that card's id and nothing else
     * moves — pressing another card cannot change what this one shows, which
     * was the whole complaint.
     */
    function kindsOf(id) {
        const by = st.kindsBy || {};
        return id && Object.prototype.hasOwnProperty.call(by, id) ? by[id] : st.kinds;
    }
    /** The selected card's own answer — what the picker draws and the filter uses. */
    const kindsNow = () => kindsOf(DATA.selected);

    /** Forget the cards that are no longer on the shelf (K-21). */
    function pruneKinds() {
        const by = st.kindsBy || {};
        const keys = Object.keys(by);
        if (!keys.length) { return; }
        const alive = {};
        (DATA.sessions || []).forEach(s => { alive[s.id] = true; });
        let cut = false;
        keys.forEach(k => { if (!alive[k]) { delete by[k]; cut = true; } });
        if (cut) { save(); }
    }

    /** null = everything (and a kind added later is included). */
    function visibleMessages(list) {
        const kinds = kindsNow();
        if (kinds === null || kinds === undefined) { return list || []; }
        const on = KINDS.filter(k => kinds.indexOf(k.v) >= 0);
        return (list || []).filter(m => on.some(k => k.is(m)));
    }

    /**
     * ‼️ K-19 — EVERY ROW CARRIES ITS MESSAGE ID, AND THAT IS WHAT THE READING
     * POSITION IS ANCHORED TO.
     *
     * `talkinner` is rewritten whole on every repaint, so every node a reader
     * was looking at is destroyed and rebuilt. Keeping `scrollTop` untouched
     * preserves the view only while nothing ABOVE the fold changes height —
     * true almost always, which is why this almost always worked, and why the
     * times it did not looked random. An id on the row turns that assumption
     * into something measurable: find the row again, put it back on the same
     * pixel (see readAnchor). It is also the handle the older-scrollback loader
     * needs, because prepending rows moves every index but no id.
     */
    /**
     * ‼️ K-23 — THE HEAD ROW STOPPED BEING A DEAD END.
     *
     * "↑ 940 older message(s) are in the transcript" was a true sentence and a
     * closed door: the only way through it was to open the raw file in an
     * editor and lose the panel's reading of it entirely. The file is on this
     * disk and showing more of it spends nothing — the cost is layout, which is
     * why it arrives a chunk at a time rather than all at once.
     *
     * The button says how many it will bring, because "load older" alone leaves
     * the reader guessing whether one press is enough; the panel carries the
     * rest, including WHICH reading of the file the count came from, so two
     * pieces that do not belong together can be seen not to.
     */
    function olderHtml(m) {
        const more = m && m.more;
        if (!more || !(more.older > 0)) { return ''; }
        // The chunk size is the READER's, not this page's — one constant, in
        // the module that owns the window (core/consolehistory.ts).
        const chunk = more.chunk > 0 ? more.chunk : more.older;
        const take = Math.min(more.older, chunk);
        const btn = `<button class="secondary older" data-older="1">↑ load ${take} older</button>`;
        return ' ' + window.AFTip.wrap(btn,
            `${more.older} message(s) still above this line`,
            'Reads them back off the transcript on disk — display only, nothing is sent anywhere and'
            + ` no token is spent. They arrive ${chunk} at a time so the panel stays quick; press again`
            + ' to keep going, and where you are reading does not move.'
            + (more.stamp ? `\n\nSnapshot: ${more.stamp} — every piece says which reading of the file it came from.` : ''),
            'tip-free');
    }

    function messageHtml(m) {
        const mid = ` data-mid="${C.esc(m.id || '')}"`;
        if (m.role === 'user') {
            // ‼️ K-26 — THE BADGE IS ON THE PROMPT, WHICH IS WHERE A TURN STARTS.
            // The line that CLOSES a turn only exists for turns run in this
            // panel: the backfill reads user/agent/tool rows off the transcript
            // and no result row, so a badge hung there would be missing from
            // exactly the scrollback a reader goes back through. A steered
            // message starts no turn and carries none.
            // ‼️ …and the SESSION id, not the card's. A card is this panel's
            // handle on a conversation; the pool files by the id the transcript
            // is named after, and a session with no id yet (the very first
            // prompt, before the CLI has answered) carries no badge because
            // there is nothing yet to file it under.
            const cur = sel() || {};
            const mark = !m.steer && cur.sessionId && window.AFWiki ? window.AFWiki.badge({
                session: cur.sessionId, turn: 0, ts: m.ts, text: m.text || '',
                marks: cur.wikiMarks || []
            }) : '';
            // ↯ — said INTO the turn above it, which was already running: it is
            // not the question that reply was answering.
            return `<div class="msg user${m.steer ? ' steer' : ''}"${mid}${m.steer ? ' title="Said into the running turn — the agent picks it up at its next step"' : ''}><span class="who">you${mark}</span><div class="body">${C.esc(m.text || '')}</div></div>`;
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
            return `<div class="msg"${mid}><span class="who">agent</span><div class="body">${C.esc(m.text || '')}${step(m)}</div></div>`;
        }
        if (m.role === 'tool') {
            if (m.tool) {
                const chip = m.tool.file
                    ? `<span class="filechip" data-open="${C.esc(m.tool.file)}" title="Open this file">✎ open</span>
                       <span class="filechip" data-diff="${C.esc(m.tool.file)}" title="Diff it against git HEAD">vs HEAD</span>`
                    : '';
                return `<div class="msg tool"${mid}><span class="who">${C.stepChip(m.kind, m.stepTokens, m.stepWTokens)}</span><div class="body"><strong>${C.esc(m.tool.name)}</strong> ${C.esc(m.tool.detail)}${chip}${m.stepTokens > 0 ? `<span class="steptok" title="What this API call spent — one call carries several steps and the figure is written once.">${C.fmtTokW(m.stepTokens, m.stepWTokens)}</span>` : ''}</div></div>`;
            }
            // An error keeps ⚠ in the gutter rather than the kind chip: `↩ tool
            // result` is true of every result row and says nothing about this
            // one, while "it failed" is the only thing worth a glyph here.
            return `<div class="msg tool${m.isError ? ' err' : ''}"${mid}><span class="who">${m.isError ? '⚠' : C.stepChip(m.kind)}</span><div class="body">${C.esc(m.text || '')}</div></div>`;
        }
        // The record of a question and of what you said back. The CARD above the
        // composer is where you answer; this is the transcript's memory of it,
        // so scrolling back tells you why the agent took the turn it took.
        if (m.role === 'ask') {
            const a = m.ask;
            const text = a
                ? `asked: ${a.detail || a.tool}`
                : `you: ${m.answer || ''}`;
            return `<div class="msg ask"${mid}><span class="who">${a ? '❓' : '↩'}</span><div class="body">${C.esc(text)}</div></div>`;
        }
        if (m.role === 'system') {
            // `data-top` marks the scrollback BOUNDARY rather than conversation:
            // it is pinned to the front of the list, so it is the one row that
            // says nothing about how far the rows moved (see readAnchor).
            return `<div class="msg sys"${mid}${m.more ? ' data-top="1"' : ''}><span class="who"></span><div class="body">${C.esc(m.text || '')}${olderHtml(m)}</div></div>`;
        }
        if (m.role === 'error') {
            return `<div class="msg err"${mid}><span class="who">error</span><div class="body">${C.esc(m.text || '')}</div></div>`;
        }
        // The line that closes a turn: how long it took, what it spent, what it
        // cost. A turn is the unit you think in — "was that worth it?" was
        // unanswerable while the numbers only existed per session.
        const bits = [];
        if (m.text) { bits.push(m.text); }
        if (m.ms) { bits.push(m.ms >= 60000 ? `${Math.round(m.ms / 6000) / 10}m` : `${Math.round(m.ms / 100) / 10}s`); }
        // the same shape the live strip used while this turn was running, so the
        // estimate and the CLI's own figure land in the same place
        // ‼️ …and on an engine that states no price that shape is the tokens
        // alone. The row is plain text (it is escaped below), so this branch
        // says the words rather than reaching for the styled version — and it
        // says only what is known: the CLI printed no dollars. Whether the
        // account is on a plan or a key is not this row's to claim (X-35).
        if (m.cost || m.tokens) {
            const cur = sel();
            bits.push(cur && cur.reportsCost === false
                ? `${C.fmtTok(m.tokens)} tokens · no price stated`
                : spend(m.cost, m.tokens));
        }
        if (!bits.length) { return ''; }
        return `<div class="msg res"${mid}><span class="who"></span><div class="body">${C.esc(bits.join(' · '))}</div></div>`;
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

    /**
     * ‼️ K-35 — THE ONE THING ON A CARD THE EYE FINDS WITHOUT READING.
     *
     * The left panel is a column of cards that all look alike: same shape, same
     * two lines of grey figures, and the agent name repeated down it because
     * three of them belong to the same agent. Finding "the one about the wiki"
     * means READING, every time, and reading is what a panel you glance at
     * cannot ask for.
     *
     * So the user may put a colour on a session, and it is a MARK — the same
     * kind of thing as the pin and the labels (core/sessionmarks.ts), keyed by
     * session id and remembered for ever. Which is why the dot is on every card
     * in this panel that shows that session, live or resumable or "where you
     * left off": a colour that is right on two surfaces out of three is a
     * colour nobody trusts on any of them.
     *
     * ‼️ AND A CARD WITH NO SESSION ID CANNOT CARRY ONE. The mark is filed
     * against the id, and a process that has not written its first turn has not
     * got one yet. That dot is drawn and dead, and says why — rather than being
     * pressable and silently saving nothing.
     */
    let colorPick = '';

    function colorPalette(id, color) {
        const swatches = (DATA.sessionColors || []).map(c =>
            `<button class="csw${c === color ? ' on' : ''}" data-swatch="${C.esc(id)}|${C.esc(c)}"
                style="background:${C.esc(c)}" title="${C.esc(c)}"></button>`).join('');
        return `<div class="cpal" data-cpal="1">
            <div class="cpalr">${swatches}</div>
            <div class="cpalf">
                <label class="cpalc" title="Any colour you like — it is kept exactly the same way the ten above are">
                    <input type="color" data-custom="${C.esc(id)}" value="${C.esc(color || '#3d8bfd')}"><span>own</span></label>
                <button class="cpalx" data-swatch="${C.esc(id)}|"
                    title="Take the colour off this session — the dot goes back to empty">none</button>
            </div>
        </div>`;
    }

    /**
     * ‼️ THE LIVE DOT CARRIES NO HOVER, AND THAT IS THE DECISION — not an
     * omission. It used to open an AFTip, and the panel said the same three
     * sentences on every card in the list: a colour is a mark, it is kept
     * against the session id, it survives the window closing. A hover that is
     * word-for-word identical on twenty cards is not information, it is a
     * paragraph the reader has to dismiss twenty times — and this one also
     * spilled under the conversation pane, so it was unreadable where it
     * mattered. The dot IS its own answer: what colour it is, is the colour it
     * is drawn in, and what it does is one press away.
     *
     * The dead dot is the exception, and for the reason a disabled control is
     * always the exception: it refuses a press, so it owes a sentence saying
     * why. That one is a native `title` — short, and drawn by the host above
     * every pane, so it cannot be clipped by the one it sits in.
     */
    function colorDot(sessionId, color) {
        const id = String(sessionId || '');
        if (!id) {
            // ‼️ In the SAME absolutely-positioned holder as a live dot. Left in
            // the flow it added a line to the card, so the one card that cannot
            // be coloured was also the one that did not look like the others.
            return '<span class="cdotw"><span class="cdotc dead" title="No colour yet'
                + ' — this session has not written its first turn, so there is nothing to file a'
                + ' colour against. It can be coloured the moment the CLI names it."></span></span>';
        }
        const hex = C.esc(color || '');
        const dot = `<button class="cdotc${color ? ' on' : ''}" data-color="${C.esc(id)}"${color
            ? ` style="background:${hex}; border-color:${hex}"` : ''}></button>`;
        return `<span class="cdotw">${dot}${colorPick === id
            ? colorPalette(id, color || '') : ''}</span>`;
    }

    /**
     * One wiring for every card kind — the live list and the resume list are
     * two slots and repaint separately, and a dot wired in only one of them is
     * a dot that works on half the panel.
     *
     * ‼️ SCOPED TO ITS OWN SLOT, and that is not tidiness. `slot()` only
     * rewrites what CHANGED, so a document-wide query run from the live list
     * would bind a second listener onto the resume list's dots — and on the
     * repaint where the resume list did not change, nothing takes it off again.
     * Two listeners on a toggle is a toggle that does nothing.
     */
    /**
     * ‼️ A THING THAT OPENS MUST CLOSE THE WAY EVERYTHING ELSE CLOSES. The
     * palette was openable and un-closable: the only way out was to press the
     * same dot again, because every control inside it — and the dot itself —
     * stops the click from travelling, and nothing was listening beyond them.
     * So it stood open over the next card while the reader worked elsewhere.
     *
     * The listener is on the DOCUMENT and is bound ONCE (`colorDocWired`) — a
     * repaint rewires the dots, and a close handler rebound with them would be
     * added again on every list repaint. It repaints only when something was
     * actually open, so a click anywhere else in a busy page costs nothing.
     * Same shape as `afFilters.wireDocClose`; Escape closes it for the reader
     * whose hand is on the keyboard.
     */
    let colorDocWired = false;

    function wireColorClose() {
        if (colorDocWired || typeof document === 'undefined' || !document.addEventListener) { return; }
        colorDocWired = true;
        const shut = () => { if (colorPick) { colorPick = ''; renderList(); } };
        document.addEventListener('click', shut);
        document.addEventListener('keydown', ev => { if (ev && ev.key === 'Escape') { shut(); } });
    }

    function wireColorDots(slotId) {
        const root = document.getElementById(slotId);
        // The same guard every shared component carries: a page script is also
        // run against a light DOM, and a missing method must degrade rather
        // than take the whole page down with a message naming nothing.
        if (!root || typeof root.querySelectorAll !== 'function') { return; }
        wireColorClose();
        root.querySelectorAll('[data-color]').forEach(b =>
            b.addEventListener('click', ev => {
                ev.stopPropagation();
                colorPick = colorPick === b.dataset.color ? '' : b.dataset.color;
                renderList();
            }));
        root.querySelectorAll('[data-cpal]').forEach(p =>
            p.addEventListener('click', ev => ev.stopPropagation()));
        root.querySelectorAll('[data-swatch]').forEach(b =>
            b.addEventListener('click', ev => {
                ev.stopPropagation();
                const at = String(b.dataset.swatch || '').indexOf('|');
                if (at < 0) { return; }
                const id = b.dataset.swatch.slice(0, at);
                colorPick = '';
                vscode.postMessage({
                    type: 'setSessionColor', sessionId: id, color: b.dataset.swatch.slice(at + 1)
                });
            }));
        root.querySelectorAll('[data-custom]').forEach(inp => {
            inp.addEventListener('click', ev => ev.stopPropagation());
            inp.addEventListener('change', () => {
                colorPick = '';
                vscode.postMessage({
                    type: 'setSessionColor', sessionId: inp.dataset.custom, color: inp.value
                });
            });
        });
    }

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
            // U-50 — four subjects, four panels, no fact in two of them.
            const twho = cardWhoTip(s), tname = cardNameTip(s);
            const tcost = cardCostTip(s), tstate = cardStateTip(s);
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
                 })}>
                ${/* ‼️ U-50 — THE CARD ITSELF CARRIES NO `title` ANY MORE. It used
                      to repeat the name that is drawn two lines down and then add
                      the same closing sentence to every card; worse, a native
                      tooltip anywhere on the card raced the rich panels below it,
                      so which of the two you got depended on which pixel you
                      stopped on. Everything it said is in one of the four. */''}
                <div class="h">
                    ${cardTip(`<span class="n"><span class="dot"></span>${who(s.agentName, s.sessionId)}</span>`,
                        twho.head, twho.body, 'nw')}
                    ${engineBadge(s)}${routeBadge(s)}
                    ${cardTip(`<span class="m">${tokBadge(s.tokens)}</span>`, tcost.head, tcost.body, 'mw')}
                    ${/* ‼️ U-94 — the card's own 🔖 keeps the WHOLE conversation.
                          The rows below carry one each, but only for the card
                          being read; from a card in the list the whole thing is
                          the only unit there is, and it was reachable only from
                          the right-click menu. `wikiKept` is the turn each mark
                          starts at, which is all a badge needs and all a list of
                          cards can afford to carry. */''}
                    ${s.sessionId && window.AFWiki ? window.AFWiki.badge({
                        session: s.sessionId, whole: true, kept: s.wikiKept || []
                    }) : ''}
                </div>
                ${colorDot(s.sessionId, s.color)}
                ${cardTip(`<span class="t2">${C.esc(s.title || '(no name yet)')}</span>`, tname.head, tname.body, 't2w')}
                <div class="m">${cardTip(`<span class="phase">${C.esc(p.label)}${waited ? ` · ${waited}` : ''}</span>`,
                    tstate.head, tstate.body)}${(s.queued || []).length ? ` · ${s.queued.length} held` : ''}${s.turns ? ` · ${s.turns} turns` : ''}${s.contextTokens ? ` · ${cardTip(`<span class="pair">${C.esc(ctxShort(s))}</span>`, ctxTip(s).head, ctxTip(s).body)}` : ''}${s.projectName ? ` · <span class="pbadge" title="Started under this project — it was told about it, and the session is filed under it">${s.projectIcon ? C.esc(s.projectIcon) : '◧'} ${C.esc(s.projectName)}</span>` : ''}</div>
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
            <div class="srow back" data-back="${C.esc(r.sessionId)}">
                ${/* U-50 — the shelf gets the same two panels the live cards do:
                      WHO this was, and WHAT it was called. The row's own
                      "continue this here" sentence was on every one of them and
                      is now said once, at the end of the identity panel. */''}
                <div class="h">
                    ${cardTip(`<span class="n">${who(r.agentName, r.sessionId)}</span>`,
                        `${r.agentName || 'session'}${r.sessionId ? ` · #${String(r.sessionId).slice(0, 8)}` : ''} · ended ${relTime(r.endedAt)} ago`,
                        window.AFTip.lines([
                            'Agent: ' + (r.agentName || 'session'),
                            whoLine(r.sessionId),
                            'Folder: ' + (r.cwd || '—'),
                            'Ended: ' + when(r.endedAt),
                            '\nClicking continues this conversation here — --resume picks the SAME session back up, same id, same transcript, with everything that was said. ✕ takes it off the shelf without touching the session.'
                        ]), 'nw')}
                    <button class="only" data-backforget="${C.esc(r.sessionId)}" title="Take it off this shelf">✕</button>
                </div>
                ${cardTip(`<span class="t2">${C.esc(r.title || '(no name)')}</span>`,
                    r.title ? `${r.title.length.toLocaleString()} characters` : 'never named',
                    r.title || 'This session ended before the CLI named it.', 't2w')}
                ${colorDot(r.sessionId, r.color)}
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
                <input type="text" id="c-rq-text" placeholder="name, agent, engine, label or #id…"
                       title="${C.esc(window.AFQuery.tip("Searched against the session's name, its agent, its labels, its id and the engine it was had with — type codex to see only those, or paste an id from any card or menu to land on that one session."))}">
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
     * ‼️ K-17 — WHICH ENGINE THIS CONVERSATION WAS HAD WITH, on every row.
     *
     * The list used to be Claude's transcripts only, so no row needed to say
     * whose it was; now it is every engine's, and an unbadged row would mean
     * "Claude" or "this list never learned about engines" with nothing to tell
     * them apart (docs/CONVENTIONS.md → the badge). Claude wears one too.
     *
     * The hover is figures, `Label: value`. It answers the question this list
     * exists for — what clicking the row will start — rather than repeating the
     * name the row already draws.
     */
    function resumeEngineBadge(r) {
        const e = engineRow(r.engine) || {};
        return window.AFEngine.badge(r.engine, window.AFTip.lines([
            'Engine: ' + (e.label || window.AFEngine.label(r.engine)),
            'Resumes as: ' + (e.label || window.AFEngine.label(r.engine))
                + (e.ready === false ? ' — cannot run here' : ''),
            'Session: ' + (r.sessionId || '—'),
            'Folder: ' + (r.cwd || '—')
        ]));
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
        // ‼️ U-50 — THIS LIST HAD BEEN LEFT BEHIND. The live cards above it had
        // been given hovers twice over while every row here carried one native
        // `title` saying its folder — on a list whose whole job is choosing
        // between a hundred conversations by what they were. Same treatment as
        // the cards, same division of subjects: the name says what this
        // conversation WAS, the identity line says who and where, the figure
        // says what it spent and what resuming it starts from.
        const rows = list.map(r => {
            const busy = owned.has(r.sessionId);
            const ptk = perTurn(r.tokens || 0, r.turns || 0);
            return `
            <div class="srow${busy ? ' owned' : ''}" data-resume="${C.esc(r.sessionId)}"
                 ${ctxAttr({
                     webviewSection: 'afConsoleResumable', preventDefaultContextMenuItems: false,
                     sessionId: r.sessionId, title: r.title || '', agentName: r.agentName || '', cwd: r.cwd || ''
                 })}>
                ${/* THE NAME PANEL LEADS WITH THE OPENING PROMPT, not with the
                      title — the title IS eighty characters of that prompt and is
                      already drawn on the row, so repeating it would be the
                      thin hover this item was written about. */''}
                <div class="h">
                    ${cardTip(`<span class="n"><span class="nm">${r.pinned ? '📌 ' : ''}${C.esc(r.title)}</span></span>`,
                        `${r.firstPrompt ? window.AFTip.sizeNote(r.firstPrompt) + ' · ' : ''}${r.turns || 0} turn${r.turns === 1 ? '' : 's'} · last touched ${relTime(r.ts)} ago`,
                        window.AFTip.lines([
                            (r.firstPrompt || r.title || '(never named)') + '\n',
                            'Started: ' + (r.startedAt ? when(r.startedAt) : '—'),
                            'Last touched: ' + when(r.ts),
                            'Turns: ' + (r.turns || 0)
                            + (r.tools ? ' · ' + r.tools + ' tool calls' : '')
                            + (r.errors ? ' · ' + r.errors + ' errors' : ''),
                            (r.models || []).length ? 'Models: ' + r.models.join(', ') : '',
                            (r.tags || []).length ? 'Labels: ' + r.tags.join(', ') : '',
                            r.pinned ? 'Pinned: on your shelf, so it stays at the top whatever the filter says' : '',
                            busy
                                ? '\nCannot be resumed: a live process owns this transcript right now — a terminal, or another window. Joining it would put two processes on one conversation.'
                                : '\nClicking resumes it here, in the panel, with everything that was said. Right-click for the session\'s own actions.'
                        ]), 'nw')}
                    ${resumeEngineBadge(r)}
                </div>
                ${colorDot(r.sessionId, r.color)}
                <div class="m wrap">${cardTip(who(r.agentName, r.sessionId),
                    `${r.agentName || 'session'}${r.sessionId ? ` · #${String(r.sessionId).slice(0, 8)}` : ''}`,
                    window.AFTip.lines([
                        'Agent: ' + (r.agentName || 'session'),
                        whoLine(r.sessionId),
                        'Engine: ' + window.AFEngine.label(r.engine),
                        'Folder: ' + (r.cwd || '—')
                    ]))} · ${relTime(r.ts)} ago${r.tokens ? ` · ${cardTip(`<span class="pair">${tokBadge(r.tokens)}</span>`,
                        `${C.fmtTok(r.tokens)} tokens`,
                        window.AFTip.lines([
                            'Raw tokens: ' + C.fmtTok(r.tokens),
                            r.wTokens ? '⚖ Against the 5h limit: ' + C.fmtTok(Math.round(r.wTokens)) : '',
                            r.cost ? 'Cost: ' + C.fmtUSD(r.cost) : '',
                            ptk ? 'Per turn: ' + C.fmtTok(Math.round(ptk)) + ' tokens' : '',
                            r.contextTokens
                                ? 'Context after its last reply: ' + ctxShort(r).replace(/^ctx /, '')
                                + ' — a different measurement from the spend above; it is what '
                                + 'resuming this costs you in window before you say anything'
                                : ''
                        ]))}` : ''}${r.contextTokens ? ` · ${cardTip(`<span class="pair">${C.esc(ctxShort(r))}</span>`, ctxTip(r).head, ctxTip(r).body)}` : ''}</div>
            </div>`;
        }).join('');
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
            /** Codex families put the discriminator LAST (`gpt-5.6-luna` /
             *  `terra` / `sol`). Family + version therefore collapses several
             *  genuinely different models into the same `gpt 5.6`. Keep the
             *  complete readable id for Codex — this also survives a future
             *  suffix we have never heard of — while Claude/Gemini retain the
             *  compact family label the strip was designed around. */
            label = p.ai === 'codex'
                ? String(p.raw || m).replace(/[-_]+/g, ' ')
                : (p.model ? (p.version ? `${p.model} ${p.version}` : p.model) : (p.raw || m));
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
            ? ` · <span title="What that turn cost, as the CLI reported it — not an estimate. The line under the box is the whole session.">${engineSpend(s, t.cost, t.tokens, t.wTokens)}</span>`
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
        // ‼️ …and on an engine that states no price there is nothing to estimate
        // and no "~" to print: the tokens are exact, the money does not exist.
        const cost = s.turnTokens || s.turnCost
            ? (s.reportsCost === false
                ? ` · <span title="${C.esc(NO_PRICE_TIP)}">${C.fmtTokW(s.turnTokens, s.turnWTokens)} tokens this turn</span>`
                : ` · <span title="What THIS TURN has spent so far — the line under the box is the whole session. The money is an estimate at the usual rates; the turn's closing line carries the CLI's own figure.">~${spend(s.turnCost, s.turnTokens, s.turnWTokens)} this turn</span>`)
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
        const spTip = s.reportsCost === false
            ? NO_PRICE_TIP
            : sp.est
                ? 'Everything this session has spent — the finished turns as the CLI reported them, plus what the running turn has spent so far, priced off the tokens seen (that is what the ~ is). A conversation you resumed brings its earlier turns with it.'
                : 'Everything this session has spent, as the CLI reported it — and the tokens it bought. A conversation you resumed brings its earlier turns with it.';
        // ‼️ THE LEGEND HANGS ON THE SESSION ID. The step chips are one glyph
        // each and there is no room on this strip for a key, so the one label
        // that is always on screen and never moves carries it: hover the id and
        // the whole scheme is there — every glyph, and what each one costs.
        return `${s.sessionId
            ? `<span class="sidlegend" title="${C.esc(C.stepKindLegendText())}">session ${C.esc(s.sessionId.slice(0, 8))}</span> · `
            : ''}${s.contextTokens ? `${cardTip(`<span class="pair">${C.esc(ctxShort(s))}${ctxPct(s) ? ` · ${ctxPct(s)}%` : ''}</span>`, ctxTip(s).head, ctxTip(s).body)} · ` : ''}<span title="${C.esc(spTip)}">${s.reportsCost === false ? '' : (sp.est ? '~' : '')}${engineSpend(s, sp.cost, sp.tokens, sp.wTokens)}</span> this session · ${s.turns} turn${s.turns === 1 ? '' : 's'}
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
    /**
     * ‼️ K-19 — …AND WHAT THE LAST ROW HELD, because a streamed answer does not
     * arrive as new rows.
     *
     * The count of rows is the right yardstick for almost everything the
     * Console shows: a tool call, its result, a turn's closing figures and the
     * next question are each their own object, so `shown.length` moves and the
     * badge appears. An agent writing a long answer is the exception — the text
     * is appended to the SAME message, the row count never moves, and the badge
     * stayed hidden while the reader watched paragraphs pile up below them.
     * That is why this was reported as rare rather than as broken.
     *
     * So the tail is measured as well as counted, and only when the row count
     * did not move — the common path is untouched, down to the arithmetic.
     */
    let tailKey = '';
    let tailLines = 0;
    /** everything the last `talkinner` render depended on (see paint) */
    let lastTalkKey = '';

    /** How many lines a row draws. A tool call is one row whatever it holds. */
    function lineUnits(m) {
        if (!m) { return 0; }
        if (m.role === 'tool' && m.tool) { return 1; }
        const t = m.text || '';
        let n = 1;
        for (let i = 0; i < t.length; i++) { if (t.charCodeAt(i) === 10) { n++; } }
        return n;
    }

    /** Which row the tail is, so growth is only credited to the SAME one. */
    const tailIdOf = m => (m ? String(m.id || '') + '|' + m.role : '');

    /**
     * ‼️ K-19 — WHERE THE READER IS LOOKING, AS A ROW AND A PIXEL.
     *
     * Taken before `talkinner` is rewritten and put back after. Both halves are
     * deliberately cheap and deliberately timid: the row is found by its
     * message id (`data-mid`), and if the row is gone, or the page has no
     * layout to measure — the test shim, a hidden panel — nothing happens and
     * the old behaviour of simply leaving `scrollTop` alone stands.
     *
     * The restore writes `scrollTop` ONLY when the row actually moved. In the
     * ordinary repaint the drift is zero and this costs two measurements and no
     * scroll at all, which is the point: it is a guarantee laid over a rule
     * that was already right, not a replacement for it.
     */
    function readAnchor(talkEl) {
        if (!talkEl || typeof talkEl.getBoundingClientRect !== 'function') { return null; }
        const inner = document.getElementById('talkinner');
        const kids = inner && inner.children ? inner.children : null;
        if (!kids || !kids.length) { return null; }
        const top = talkEl.getBoundingClientRect().top;
        for (let i = 0; i < kids.length; i++) {
            const k = kids[i];
            if (typeof k.getBoundingClientRect !== 'function') { return null; }
            const r = k.getBoundingClientRect();
            // the first row that has not been scrolled entirely past
            if (r.bottom > top + 1) {
                // ‼️ K-23 — …but never the boundary marker. It is pinned to the
                // front of the list, so when an older chunk lands BEHIND it the
                // marker has not moved a pixel while everything the reader was
                // actually reading has — anchoring on it would leave them
                // staring at the oldest line of the piece they just fetched.
                if (k.dataset && k.dataset.top) { continue; }
                const mid = k.dataset ? k.dataset.mid : '';
                return mid ? { mid: mid, off: r.top - top } : null;
            }
        }
        return null;
    }

    function restoreAnchor(talkEl, a) {
        if (!a || !talkEl || typeof talkEl.getBoundingClientRect !== 'function') { return; }
        const inner = document.getElementById('talkinner');
        if (!inner || typeof inner.querySelector !== 'function') { return; }
        let row = null;
        try { row = inner.querySelector(`[data-mid="${cssEsc(a.mid)}"]`); } catch (e) { return; }
        if (!row || typeof row.getBoundingClientRect !== 'function') { return; }
        const drift = (row.getBoundingClientRect().top - talkEl.getBoundingClientRect().top) - a.off;
        if (!drift || Math.abs(drift) < 1) { return; }
        talkEl.scrollTop += drift;
    }

    function cssEsc(s) {
        const str = String(s === undefined || s === null ? '' : s);
        if (typeof CSS !== 'undefined' && CSS && typeof CSS.escape === 'function') { return CSS.escape(str); }
        return str.replace(/[^a-zA-Z0-9_-]/g, ch => '\\' + ch);
    }

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
        tailKey = '';
        tailLines = 0;
        jumpToEnd();
    }

    // ---- the shell, built once -----------------------------------------------

    /** What the shell was built for; when this changes, the shell is rebuilt. */
    let shellKey = null;
    /**
     * ‼️ M-33 — A SHELL REBUILD THE HOST ASKED FOR, PUT OFF UNTIL THE HANDS ARE
     * FREE. Every other page answers a push by repainting all of `#app` and is
     * guarded wholesale (media/afRepaint.js); this page must not be, because
     * `paint` is incremental on purpose (S-29) and the reader is watching the
     * output WHILE they type into the composer. Exactly one part of it throws
     * the caret — `buildShell`, which replaces the composer — and the shell key
     * carries the session's own status, so a session ending ELSEWHERE used to
     * take the half-written message's caret with it mid-sentence.
     */
    let shellOwed = false;
    /** ‼️ X-105 — "the next host push is the answer to something I just asked
     *  for", so M-33 lets that one through. One-shot: see paint(). */
    let askedHost = false;
    /** Stops watching the PREVIOUS writing box's height (K-9, see keepHeight). */
    let stopBoxH = null;
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
    // The picker itself is media/afSnippets.js — shared, because the Tasks
    // page asks the same question in four more boxes. Here it is bound to the
    // buttons that send (see wireSnipMenu at the point each one is drawn) and
    // every pick lands in `c-text`; the paste fires an `input` event, which is
    // the same listener that records every keystroke, so the draft, the
    // autosize and Send's enabled state all follow without a second path.
    window.AFSnippets.init(vscode);
    // K-26 — the 🔖 on every prompt row. The fresh mark list is written back
    // into the card so the next repaint (and this panel repaints on every step
    // of a running turn) still draws it green.
    window.AFWiki.init(vscode, (session, marks) => {
        const cur = (DATA.sessions || []).find(s => s.sessionId === session);
        if (!cur) { return; }
        cur.wikiMarks = marks;
        paint();
    });
    window.AFWiki.wire();
    const wireSnipMenu = id => window.AFSnippets.bind(id, 'c-text');
    const SNIP_HINT = window.AFSnippets.HINT;

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

    /**
     * ‼️ THE ENGINE PICKER — AND WHY AN ENGINE THAT CANNOT RUN IS STILL IN IT.
     *
     * Hiding it would be the easy version and the wrong one: an engine missing
     * from the list is indistinguishable from an engine this build does not
     * have, so the user goes looking for a setting that does not exist. It is
     * offered `disabled`, with its own row saying WHY and the one thing to do —
     * `EngineStatus.next`, the same sentence the Engines page prints and the
     * same one the bridge refuses with.
     */
    function engineOptionsHtml(cur) {
        return (DATA.engines || []).map(e => {
            const mark = e.ready ? '' : ' — ' + (e.auth === 'none' ? 'not signed in' : 'not installed');
            return `<option value="${C.esc(e.id)}"${e.id === cur ? ' selected' : ''}${e.ready ? '' : ' disabled'}
                    title="${C.esc(e.next)}">${C.esc(e.label)}${C.esc(mark)}</option>`;
        }).join('');
    }

    /** The engine currently chosen for a NEW session, as the page knows it. */
    const engineNow = () => (DATA.engine || 'claude');
    const engineRow = id => (DATA.engines || []).find(e => e.id === id);

    /**
     * The one line under the composer's controls that says what this engine
     * CHANGES — drawn only when it is not the default, because "Claude Code
     * behaves like Claude Code" is not information.
     *
     * It is the difference a person would otherwise discover by losing a
     * message: on a per-turn engine what you type mid-turn is held, the pickers
     * are the next turn's flags, and the permission mode is a sandbox picked up
     * front. That is too much to learn from a tooltip on a dropdown.
     */
    function engineHintHtml(id) {
        const e = engineRow(id);
        if (!e) { return ''; }
        // ‼️ CLAUDE GETS ONE TOO (U-26/U-30). The old rule was "draw nothing for
        // the default", which left the reader unable to tell "this engine
        // changes nothing" from "nobody wrote a note". Every engine answers the
        // same question now; what differs is the answer.
        const body = window.AFTip.lines([
            e.note || 'Nothing about this engine changes how the composer behaves.',
            e.billing || '',
            e.ready ? '' : e.next
        ]);
        const head = `${e.label} · ${e.ready ? 'ready' : 'cannot run here'}`;
        return window.AFTip.wrap(
            `<span class="ehint${e.ready ? '' : ' bad'}">?</span>`, head, body, 'ehintw');
    }

    /**
     * The badge a card / a running composer wears.
     *
     * ‼️ U-26 — CLAUDE WEARS ONE TOO, AND THE RULE IT REPLACES WAS THE PROBLEM.
     * "The default wears nothing" reads fine on a page with one engine on it and
     * falls apart on a list with four: an unbadged row means "Claude" or it
     * means "this row predates engines", and there is nothing on it to tell you
     * which. Every row answers now, in the engine's own fixed colour — the same
     * badge, from the same component, that the sessions tables and the session
     * page draw (media/afEngine.js).
     *
     * The hover stays FIGURES, `Label: value` (docs/CONVENTIONS.md): what this
     * engine changes about talking to it is the ? beside the box, not here.
     */
    function engineBadge(s) {
        if (!s) { return ''; }
        return window.AFEngine.badge(s.engine, window.AFTip.lines([
            'Engine: ' + (s.engineLabel || window.AFEngine.label(s.engine)),
            // ‼️ THREE SHAPES, NOT TWO (K-25). A shared-ACP engine has one process
            // for the whole WINDOW, carrying every card at once — reading it as
            // "one long-lived process" would tell a reader this card owns it, and
            // the reason it does not is the reason ending a card does not stop it.
            'Shape: ' + (s.turnShape === 'perTurn' ? 'one process per turn'
                : s.turnShape === 'sharedAcp' ? 'one shared process for every card on this engine'
                    : 'one long-lived process'),
            'Mid-turn message: ' + (s.turnShape === 'persistent' ? 'steers this turn' : 'held until the turn ends'),
            'Price per turn: ' + (s.reportsCost ? 'reported' : 'not reported — plan or account billing')
        ]));
    }

    /**
     * ‼️ X-105 — WHAT IS ANSWERING, BESIDE WHICH PROGRAM IS ASKING.
     *
     * The engine badge says which CLI is running. It has never said what that
     * CLI is talking to — and two cards on the same engine can be served by two
     * different companies' models at the same moment. The card has carried the
     * pick since X-103 and stayed silent about it, which made the one fact this
     * whole family of items exists to establish the one fact the reader could
     * not check.
     *
     * ONE SUBJECT: it is its own mark with its own panel, never a line inside
     * the engine's. The engine is the program; the route is the endpoint.
     *
     * ‼️ AND IT DOES NOT WEAR AN ENGINE COLOUR. Those five hues mean "which
     * engine" on every surface in this extension, so a sixth pill in one of them
     * would read as a sixth engine.
     *
     * Nothing is drawn when there is no route, which is most cards: four of the
     * five engines have no provider axis at all and most Claude launches pick
     * none. A mark that said "none" on every row would cost every reader a pill
     * to learn nothing.
     *
     * ‼️ Page-local ON PURPOSE, for now: it is drawn on one surface, and a
     * shared component is added when the SECOND one needs it (X-108 puts this
     * identity on the session index) — at which point it moves to
     * `media/afRoute.js` and both read the same file, the way the engine badge
     * already does (U-26).
     */
    function routeBadge(s) {
        const r = s && s.route;
        if (!r || !r.label) { return ''; }
        const noun = String(r.noun || 'Route');
        /**
         * ‼️ X-105 — THE PILL SAYS WHO IS SERVING IT NOW, AND THE PANEL SAYS
         * WHO IT STARTED WITH.
         *
         * On an engine whose provider may change at a turn boundary, those are
         * two different facts and the reader needs both: the current one is what
         * the next turn will run on, the launch one is what the turns already in
         * the transcript ran on. MIRROR — the pill cuts its own text, so the
         * panel opens with the value the pill is showing.
         *
         * ONE SUBJECT: both live in this mark's own panel. A second pill for
         * "started on" would be two marks for one question.
         */
        const nowLabel = (r.now && r.now.label) ? r.now.label : r.label;
        const moved = !!(r.now && r.now.id && r.now.id !== r.id);
        return cardTip(
            `<span class="af-route${moved ? ' af-route-moved' : ''}">${C.esc(nowLabel)}</span>`,
            // SHORTHAND: the pill is the short form, and the panel opens with
            // the long one so a reader never has to already know what it meant.
            `${nowLabel} — the ${noun.toLowerCase()} this session is served by`,
            window.AFTip.lines([
                noun + ': ' + nowLabel,
                // ‼️ ONLY WHEN IT REALLY MOVED. On every other card this line
                // would restate the line above it, which is how a panel teaches
                // a reader to stop reading it.
                moved
                    ? 'Started on: ' + r.label
                        + ' — the turns before the change ran on that one, and they still do'
                    : '',
                // ‼️ X-105 — THE REPORTED HALF. What the engine's own events say
                // served the turn that already ran, which between a boundary
                // change landing and the next turn starting is a different
                // provider from the one above. Drawn only when it differs:
                // otherwise it would restate the first line on every card, and a
                // panel that repeats itself is one a reader stops opening.
                (r.lastTurn && r.lastTurn.label)
                    ? 'Last turn ran on: ' + r.lastTurn.label
                        + ' — what the engine itself reported, not what was asked for'
                    : '',
                r.tier ? 'Tier: ' + r.tier : '',
                // The one line that makes the mark CHECKABLE rather than
                // decorative. Public — it is an ordinary setting; the credential
                // is not here and has no field to arrive in.
                r.baseUrl ? 'Endpoint: ' + r.baseUrl : '',
                r.authKind ? 'Auth: ' + r.authKind : '',
                r.scopeNote ? '\n' + r.scopeNote : ''
            ]),
            'rtw');
    }

    /**
     * ‼️ S-20 — THE MODEL BOX BELONGS TO THE ENGINE, NOT TO THE PAGE.
     *
     * One list served every engine, so choosing Codex still offered Claude's
     * aliases — four values its CLI can only reject — while its own /model was
     * offering six others. `DATA.engineModels` carries what each engine is
     * currently offering (read from the engine's own catalog, not from a
     * constant); the flat `DATA.models` stays as the fallback for a build or an
     * engine that publishes nothing.
     */
    function modelsFor(engineId) {
        const em = (DATA.engineModels || {})[engineId || 'claude'];
        return (em && em.models) || DATA.models || [];
    }
    /**
     * ‼️ X-105 — WHAT THE COMPOSER MAY PICK AS A ROUTE, IN THE ENGINE'S OWN
     * WORDS, and what is currently picked. Both come from the host: the form is
     * built by the SAME reader the launcher's route row and the card's route
     * pill are (`providerFormFor`), and the pick is held host-side because the
     * narrowing lives there — a tier that stops existing when the route moves is
     * something only the adapter knows.
     *
     * `null` on four of the five engines, and on the fifth until somebody has
     * set a route up. Nothing is drawn for either.
     */
    const composerForm = () => DATA.composerForm || null;
    const routePick = () => DATA.composerPick || {};
    /** Is there actually something to choose? A picker whose only row is
     *  "Default" is a control with no referent, and the composer is not where a
     *  person learns that routes exist — Settings is. */
    function routeAxisOn() {
        const f = composerForm();
        return !!(f && f.applies && (f.providers || []).some(p => p.id));
    }
    /**
     * ‼️ EVERYTHING ABOUT THE ROUTE THAT DECIDES WHICH BOXES EXIST — the shell
     * key's share of this axis, in one place so the key and the markup cannot
     * come to disagree about what a change is.
     *
     * The PICK is in it because the boxes are drawn from it, and so is the
     * form's own shape: whether the axis applies at all, the engine's noun, and
     * the kind and size of the sub-axis. The tier box appears only once the host
     * has answered with the tiers, so `sub.kind` moving from `none` to `tier` is
     * a change of shape even though nothing the user typed moved.
     */
    function routeShape() {
        const f = composerForm();
        const p = routePick();
        return `${p.providerId || ''}|${p.tier || ''}|`
            + (f ? `${f.applies ? 1 : 0}${f.noun || ''}${(f.providers || []).length}`
                + `${(f.sub && f.sub.kind) || ''}${((f.sub && f.sub.choices) || []).length}`
                : '-');
    }
    /** …and the row under it, only where that row is a TIER. */
    function tierAxisOn() {
        const f = composerForm();
        return !!(routeAxisOn() && f.sub && f.sub.kind === 'tier'
            && (f.sub.choices || []).some(c => c.id));
    }
    /**
     * ‼️ X-105 — ON AN ENGINE WHOSE SUB-AXIS IS THE MODEL, THE MODEL BOX IS
     * THAT AXIS — so the route narrows the box that is already there instead of
     * putting a second one beside it.
     *
     * OpenCode names a model `provider/model` (`opencode/big-pickle`), which
     * makes "which provider" and "which model" one question asked twice. Two
     * controls for one subject can disagree within a click, and ONE SUBJECT is
     * the rule this would break. With no route picked the adapter returns every
     * row, so this is exactly the list the box has always shown; it narrows only
     * once somebody has actually chosen.
     *
     * ‼️ AND IT IS THE COMPOSER'S ONLY. `modelsFor` still answers for a running
     * card, whose route was decided when it started and has nothing to do with
     * whatever the composer is currently pointing at.
     */
    function composerModels(engineId) {
        const base = modelsFor(engineId);
        const f = composerForm();
        if (!f || !f.applies || !f.sub || f.sub.kind !== 'model' || !routePick().providerId) {
            return base;
        }
        const allowed = {};
        (f.sub.choices || []).forEach(c => { if (c.id) { allowed[c.id] = true; } });
        const kept = base.filter(m => !m.id || allowed[m.id]);
        // A narrowing that empties the box is not a narrowing, it is a broken
        // catalog — the wider list is the honest fallback (same rule as
        // `withCurrent`: never show a control that cannot say what is set).
        return kept.some(m => m.id) ? kept : base;
    }
    /**
     * ‼️ X-149 — WHAT THIS ENGINE OFFERS, IN THE ONE SHAPE THE ONE NARROWING
     * RULE READS (`media/afLaunch.js`). The Console used to carry its own copy
     * of that rule and so did three other files; they answered the same
     * question differently, which is the mechanical form of "one thing gets
     * fixed and another breaks".
     *
     * ‼️ U-59 — AN ENGINE WITH NO EFFORT SETTING OFFERS NONE, WHATEVER ITS
     * CATALOG HAS ANSWERED — and that answer is given HERE rather than inside
     * the rule. Gemini has no such flag and OpenCode has none either (ACP
     * declares only model and mode); the empty list in their catalogs said so,
     * but only AFTER the catalog had landed — before that this fell through to
     * the flat list and drew Claude's five levels on an engine that would
     * reject every one of them. The engine ROW is true before anything has
     * connected, so the row is what is asked.
     */
    function composerCatalog(engineId) {
        return window.AFLaunch.catalog({
            known: true,
            em: (DATA.engineModels || {})[engineId || 'claude'] || null,
            models: modelsFor(engineId),
            efforts: DATA.efforts || [],
            takesEffort: window.AFLaunch.takesEffort(engineRow(engineId || 'claude'))
        });
    }
    /** …and the effort vocabulary of THAT model: Codex states its levels per
     *  model (five for luna, four for 5.5), so one shared list was wrong for
     *  both. Falls back to the engine's shared list, then the page's. */
    function effortsForModel(engineId, model) {
        return window.AFLaunch.effortsFor(composerCatalog(engineId), model);
    }
    /** S-34 — a value this agent actually ran on is on the list; the reason is
     *  in `media/afLaunch.js`, where the rule lives. */
    function withCurrent(list, current) {
        return window.AFLaunch.withCurrent(list, current);
    }
    /**
     * Keep all three launch boxes inside the vocabulary of the engine/model
     * currently in front of them — ‼️ X-149: BY ASKING THE ONE RULE
     * (`media/afLaunch.js`), which the host and the Tasks form ask too.
     *
     * The two things that are the Console's OWN answer, and are therefore named
     * options rather than a second copy of the rule:
     *
     * `preferModelDefault` — used after a model is picked by hand; an engine
     * change otherwise preserves an effort when the new model genuinely offers
     * the same value.
     *
     * `keep` — S-34: A REMEMBERED SETUP FOR **THIS** ENGINE WINS. This is where
     * "it forgets the model" and "it forgets the effort" came from, and it was
     * one line each: a seeded value absent from the engine's published catalog
     * was cleared, and clearing the model then cascaded into the effort (the
     * effort list is looked up BY model, so an emptied model lands on a
     * different list and the level goes with it). A value a real launch on this
     * same engine used is by definition runnable on it — the catalog simply does
     * not advertise every alias. An ENGINE CHANGE still drops both, which is the
     * case this function exists for: those values belong to a different program.
     */
    function reconcileComposer(engineId, preferModelDefault, keep) {
        const out = window.AFLaunch.narrow(composerCatalog(engineId),
            { model: st.model, effort: st.effort },
            { keep: keep || null, preferModelDefault: !!preferModelDefault });
        st.model = out.model;
        st.effort = out.effort;
    }

    // Host-side fresh-composer edge (K-15). It is intentionally local to this
    // webview lifetime: a newly created panel has never inherited an open
    // composer's state, while a reused one must observe every increasing seed.
    let appliedComposerSeed = 0;
    function applyComposerSeed() {
        const seed = Number(DATA.composerSeed || 0);
        if (!seed || seed === appliedComposerSeed) { return; }
        appliedComposerSeed = seed;
        // ‼️ K-34 — A SETUP HANDED OVER BY A LAUNCHER WINS OVER THE DEFAULTS.
        //
        // The launcher used to spawn the session itself the moment Start was
        // pressed, so every dimension was fixed before the person had a window
        // to change one in. It hands the setup here instead: the composer opens
        // ON it, still editable, and nothing runs until Send. `null` means no
        // setup was handed over at all — a DIFFERENT answer from a setup that
        // says nothing, and only the first falls through to the user's defaults.
        const seeded = DATA.composerLaunch || null;
        const d = seeded || DATA.defaults || {};
        st.model = d.model || '';
        st.effort = d.effort || '';
        st.permissionMode = d.permissionMode || '';
        // The first prompt travels with the setup, into the box the user is
        // about to type in — never sent on their behalf. A draft they have
        // already started is not overwritten by it.
        if (seeded && seeded.prompt && !st.draft) {
            st.draft = seeded.prompt;
            const box = document.getElementById('c-text');
            if (box) { box.value = seeded.prompt; }
        }
        // ‼️ S-34 (reopened) - AND THE SETUP ONLY SURVIVES ON THE ENGINE IT WAS
        // BUILT FOR.
        //
        // A handed-over setup is a real launch's answer, so it beats the
        // engine's published catalog - the catalog lists what an engine is
        // OFFERING, not everything it can run. But that is only true while the
        // setup and the composer are talking about the SAME engine. The check
        // here used to compare the seeded value against itself (st.model had
        // just been assigned out of the same object two lines up), so it could
        // not fail and the reconcile was silenced rather than narrowed: switch
        // the launcher from Antigravity to Claude and the Claude engine box came
        // up with the Antigravity model beside it. The engine the setup names is
        // the fact that decides. A setup from before it was carried names none,
        // and is trusted, exactly as it was yesterday.
        const forThisEngine = seeded && (!seeded.engine || seeded.engine === engineNow());
        reconcileComposer(engineNow(), false,
            forThisEngine ? { model: st.model, effort: st.effort } : null);
        save();
    }

    /**
     * ‼️ S-49 — A DOOR SEEDS THE COMPOSER. THE COMPOSER ITSELF NEVER RESEEDS
     * ITSELF.
     *
     * Where the launch boxes OPEN on is a question about arriving here, and it
     * is answered once, host-side, by whichever door opened the panel
     * (`ConsolePanel.show` → `composerLaunch`, applied by `applyComposerSeed`).
     * Once they are drawn they are the user's own controls, and the only thing
     * that writes them is a hand on them.
     *
     * The picker used to reseed model, effort and permission mode from the
     * newly chosen agent's record — the same rule as the doors, applied one
     * step too late. Set a model, set an effort, set a permission mode, then
     * change your mind about WHO runs it, and the three answers you had just
     * typed were replaced by a stranger's. A person standing at a control is
     * not asking to be helped; they are already deciding.
     *
     * The repaint stays, and is the whole of what an agent change does here:
     * the Superpowers chip resolves `''` (nobody has touched it) against the
     * agent the picker is showing, so it follows the new agent's own default
     * without anything being written — while a chip the user HAS pressed keeps
     * their answer, for exactly the same reason the boxes do (X-133).
     */
    /**
     * ‼️ X-145 — ONE AGENT'S RECORD, READ FOR ONE ENGINE.
     *
     * The host keeps `byEngine`: one row of model/effort/permission per engine,
     * because those three are the engine's own answer and a single shared row
     * meant OpenCode's `manual` turned up on Claude. The page is the mirror of
     * `rememberedOn` in `core/launch.ts` and follows the same three steps: the
     * engine's own row, else the flat record when it names this engine or names
     * none (it predates `byEngine` and cannot contradict anything), else
     * nothing — which is what lets the engine's own settings file decide.
     */
    function memoryOn(last, engineId) {
        if (!last) { return null; }
        const eng = (engineId || '').trim();
        const own = eng && last.byEngine ? last.byEngine[eng] : null;
        if (own) { return own; }
        const was = (last.engine || '').trim();
        if (!was || !eng || was === eng) { return last; }
        return null;
    }

    /**
     * ‼️ U-59 — THE FLAG IN THE PARENTHESIS IS THE ENGINE'S OWN, OR THERE IS NO
     * PARENTHESIS.
     *
     * `(--model)` `(--effort)` `(--permission-mode)` were Claude's flag names
     * printed over every engine. OpenCode carries the model on `-m`, has no
     * effort setting at all and no such permission flag — three parentheses a
     * reader could check and all three failing. `engineFlagFor` derives the
     * name from the engine's own argument builder host-side; an engine that
     * names none returns '' and gets no parenthesis, which is the honest shape
     * of "this engine does not have one".
     */
    function flagOf(engineId, field) {
        const e = engineRow(engineId);
        const f = e && e[field === 'model' ? 'modelFlag' : 'effortFlag'];
        return f ? ' (' + f + ')' : '';
    }

    /** The one line a picker's tooltip carries: where this list came from and
     *  how old it is — a list nobody can date is a list nobody can distrust. */
    function modelNote(engineId) {
        const em = (DATA.engineModels || {})[engineId || 'claude'];
        return (em && em.note) || '';
    }

    function buildShell(s) {
        const opts = (list, cur) => (list || []).map(o =>
            `<option value="${C.esc(o.id)}"${o.id === cur ? ' selected' : ''} title="${C.esc(o.detail || '')}">${C.esc(o.label || o.id)}</option>`).join('');
        /**
         * ‼️ K-16 — A BOX'S HOVER SAYS WHAT IS IN IT, THEN WHAT IT IS FOR.
         *
         * This row is eight pickers wide in a panel that is rarely wide, so a
         * `<select>` shows its chosen value cut ("Default → son…", "acceptEd…")
         * and the only way to read it was to OPEN the box — a gesture that
         * means "I am about to change this", performed by somebody who only
         * wanted to look. The hover was right there and spent all of itself on
         * a sentence that never changes.
         *
         * So: the current value, a blank line, then the same standing
         * explanation the box has always carried. The order is the point — the
         * changing half first, because that is the half being asked about.
         */
        const boxTip = (list, cur, standard) => {
            const row = (list || []).find(o => String(o.id ?? '') === String(cur ?? ''));
            const now = row ? String(row.label || row.id || '') : '';
            return (now ? now + '\n\n' : '') + standard;
        };
        /**
         * ‼️ X-105 — THE ROUTE, AS A CONTROL RATHER THAN A CARRIED VALUE.
         *
         * X-103 made the route pickable in the launcher and X-105 (2/n) made the
         * started card say it out loud. Between the two the composer carried the
         * pick BLIND: a route handed over by a launcher was applied and had no
         * box, so the person about to press Send could not see it, change it, or
         * clear it — and a composer opened without one had no way to choose.
         *
         * ‼️ THE WORDS ARE THE ENGINE'S. `Route` on Claude, `Provider` on
         * OpenCode, and the label under it (`Tier`) is the adapter's too. A noun
         * invented here would be a fourth place that can disagree with the
         * launcher, the card and the bridge.
         *
         * ‼️ AND THE SUB-AXIS IS ONLY DRAWN WHEN IT IS A TIER. Where the engine's
         * sub-axis is the MODEL it is already on this strip, and `composerModels`
         * narrows that box instead — see the note there.
         *
         * ‼️ NO VARIANT BOX, and that is the transport's answer rather than an
         * omission: a hosted card is spoken to over ACP, which declares only
         * model and mode (measured — `opencode run --variant` exists and the TUI
         * and ACP have no such thing). The form says WHY in `variantsWhy` and
         * that sentence rides in the route box's own hover, where the reader is
         * already asking about this axis.
         */
        const routeBoxesHtml = () => {
            if (!routeAxisOn()) { return ''; }
            const f = composerForm();
            const pick = routePick();
            const cur = pick.providerId || '';
            const routeTip = [
                'Which ' + f.noun.toLowerCase() + ' the new session is served by — the endpoint '
                + 'the process really talks to, which the engine badge does not say. '
                + 'Default leaves this window\'s own environment alone.',
                f.scopeNote || '',
                f.variantsWhy || '',
                f.empty || ''
            ].filter(Boolean).join(' · ');
            const rows = withCurrent(f.providers || [], cur);
            const route = `<label class="rtlbl" title="${C.esc(boxTip(rows, cur, routeTip))}"><span>${C.esc(f.noun.toLowerCase())}</span>
                    <select id="c-route">${opts(rows, cur)}</select>
                </label>`;
            if (!tierAxisOn()) { return route; }
            const tcur = pick.tier || '';
            const trows = withCurrent(f.sub.choices || [], tcur);
            return route + `<label class="rtlbl" title="${C.esc(boxTip(trows, tcur, f.sub.note))}"><span>${C.esc(f.sub.label.toLowerCase())}</span>
                    <select id="c-tier">${opts(trows, tcur)}</select>
                </label>`;
        };
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
        // ‼️ THE SAME THREE WORDS MEAN TWO THINGS, SO THEY ARE LABELLED TWICE.
        // On Claude these boxes are control requests the CLI takes mid-turn; on
        // a per-turn engine there is no channel to ask on and they are simply
        // the flags of the NEXT spawn. A tooltip that promised "applied live" on
        // an engine that cannot do it would be the panel lying about the one
        // thing the reader is deciding.
        const live = !s || s.steerable !== false;
        // ‼️ U-59 — AND THE THIRD SHAPE ANSWERS DIFFERENTLY AGAIN, SO IT IS
        // ASKED SEPARATELY. `steerable` answers ONE question — can this be
        // changed while a turn is RUNNING — and a shared-ACP engine says no to
        // it while saying yes to the question the reader is actually asking:
        // the change reaches a LIVE connection at the next turn boundary
        // (`session/set_config_option`), and the engine really can stop and ask
        // before it acts. Reading the permission sentence off `steerable` alone
        // printed "this engine cannot stop and ask, so the mode becomes a
        // SANDBOX" over OpenCode — the exact promise-that-is-not-kept this file
        // already refuses to make about Antigravity, made about the one engine
        // whose permission card is on screen while it says it.
        const shapeNow = s ? (s.turnShape || 'persistent')
            : ((engineRow(engineNow()) || {}).shape || 'persistent');
        const shared = shapeNow === 'sharedAcp';
        const modelTip = live
            ? 'Switches the model mid-conversation — the same thing /model does in a terminal. It applies from the next turn.'
            : shared
                ? 'Nothing switches inside a running turn — this protocol has no channel for it — but the change is not a flag on a future process either: it is sent to the live connection as session config at the next turn boundary.'
                : 'This engine runs one process per turn, so there is nothing to switch mid-conversation: this is the model the NEXT turn will be spawned with.';
        const effortTip = live
            ? 'How hard it thinks per turn — the same thing /effort does in a terminal. It applies from the next turn; on a model with no effort levels the CLI accepts it and it means nothing.'
            : 'How hard it thinks per turn — passed to the NEXT turn as model_reasoning_effort. There is no running process to ask.';
        // ‼️ K-22 — MIRROR: the box is too narrow to say what it is really in,
        // so the tooltip opens with the ENFORCED mode. A picker sitting on
        // "Default" while the process auto-approves everything is the exact
        // state that made "bypass" untrustworthy.
        const permNow = s && s.enforcedPermissionMode && s.enforcedPermissionMode !== s.permissionMode
            ? `In force: ${s.enforcedPermissionMode}${s.permissionWhy ? ` — ${s.permissionWhy}` : ''}. `
            : '';
        const permTip = permNow + (live
            ? 'What it may do without asking — applied live. Fewer rows than the start picker on purpose: a running session can only be moved to modes the CLI accepts mid-conversation, and it says so out loud when it refuses one.'
            : shared
                ? 'What it may do without asking. ‼️ This engine really can stop and ask, and here it does: the turn halts and the card that appears is the ENGINE\'S OWN question, answered once / always / reject. The mode is its agent — "Default" runs `build`, which asks; "plan" runs the plan agent, which is refused every edit tool. acceptEdits and bypassPermissions reach the same one blunt override and mean the same thing: those questions are answered for you. Unattended is where the difference bites — a headless run of this engine has nobody to answer, so without that override the request comes back refused rather than pausing.'
                : 'What the NEXT turn may do. ‼️ This engine cannot stop and ask, so the mode becomes a SANDBOX chosen up front: "Default" means read-only here — the only honest thing an engine with nobody to ask can do — and acceptEdits means it may write inside the folder without asking.');
        /**
         * ‼️ U-59 — AND THE SAME QUESTION ON THE FRESH COMPOSER, WHICH HAD ONE
         * ANSWER FOR EVERY ENGINE. `(--permission-mode)` is Claude's flag name:
         * Codex turns this into a sandbox, OpenCode into an agent plus one
         * `--auto` override, and neither of them has ever seen that flag. The
         * fresh row cannot use `permTip` — that one is written for a session
         * that is already running — so it asks the shape the same way.
         */
        const startPermTip = shared
            ? 'What the session may do without asking. ‼️ This engine can genuinely stop and ask: mid-turn the card becomes the engine\'s own request, answered once / always / reject. "Default" starts its `build` agent, which asks; "plan" starts the plan agent, which is refused every edit tool; acceptEdits and bypassPermissions both reach one blunt auto-approve override and are the same choice here.'
            : shapeNow === 'perTurn'
                ? 'What the session may do without asking. ‼️ This engine cannot stop and ask, so this is fixed up front for every turn — hover the ? beside the engine for what it becomes there.'
                : 'What it may do without asking (--permission-mode). It can be changed later without restarting the session.';
        /**
         * ‼️ U-59 — AN ENGINE WITH NO EFFORT SETTING IS NOT GIVEN THE BOX.
         *
         * Gemini has no such flag and OpenCode has none either (ACP declares
         * only model and mode, and no reachable model publishes a variant), so
         * both were handed an EMPTY dropdown to stare at — the control with no
         * referent `docs/CONVENTIONS.md` forbids and the tasks form already
         * drops. The Console drew it anyway, at a fixed 82px, on both rows.
         *
         * ‼️ The question is THE ENGINE'S, not the list's. A short list is not
         * the same fact as no setting: an engine that has one and whose catalog
         * has not answered yet still gets the box, filled from the fallback,
         * because the control does have a referent — it is the answer that has
         * not arrived.
         */
        const drawsEffort = engineId => {
            const row = engineRow(engineId || 'claude');
            return !row || row.takesEffort !== false;
        };
        const effortBox = (engineId, model, cur, id, tip) => {
            if (!drawsEffort(engineId)) { return ''; }
            const rows = effortsForModel(engineId, model);
            return `<label class="permlbl" title="${C.esc(boxTip(rows, cur, tip))}">effort
                    <select id="${id}">${opts(rows, cur)}</select>
                </label>`;
        };
        const controls = s
            ? `<span class="fixed" title="The folder this session opened in — decided when the process started, and the one thing that cannot change">
                    ${C.esc(s.agentName)}
                </span>
                ${engineBadge(s)}${routeBadge(s)}${engineHintHtml(s.engine)}
                <label class="permlbl" title="${C.esc(boxTip(modelsFor(s.engine), s.model, modelTip + ' · ' + modelNote(s.engine)))}">model
                    <select id="c-model-live">${opts(modelsFor(s.engine), s.model)}</select>
                </label>
                ${effortBox(s.engine, s.model, s.effort, 'c-effort-live', effortTip)}
                <label class="permlbl" title="${C.esc(boxTip(live ? (DATA.livePermissions || DATA.permissions) : DATA.permissions, s.permissionMode, permTip))}">permissions
                    <select id="c-perm">${opts(live ? (DATA.livePermissions || DATA.permissions) : DATA.permissions, s.permissionMode)}</select>
                </label>
                ${window.AFFilter.multi({
                    // allLabel is what follows "show: " — repeating the word
                    // here is how the button came to read "show: show: …"
                    id: 'c-kinds', label: 'show', allLabel: 'everything',
                    options: KINDS, selected: kindsNow(),
                    // ‼️ THE ONE SUBSET THIS LIST HAS A WORD FOR. Seven kinds of
                    // line exist, and the reading a person keeps coming back to
                    // is the conversation itself — what was asked and what was
                    // answered, with the machinery in between out of the way.
                    // Reaching it meant Clear plus two ticks, every time.
                    presets: [{
                        id: 'dialog', label: 'Dialog', values: ['agent', 'user'],
                        title: 'Just the conversation — you and the agent. Tool calls, results, system lines and questions are hidden.'
                    }],
                    title: 'Which kinds of line the conversation shows. '
                        + 'This belongs to THIS session card — the next card keeps its own.'
                })}
                <span class="grow"></span>
                <span id="c-live"></span>
                <button id="c-send"${dead ? ' disabled' : ''}>Send</button>`
            : `${pinnedAgentHtml() || `<select id="c-agent" title="${C.esc(boxTip((DATA.agents || []).map(a => ({ id: a.id, label: a.name })), st.agentId, 'Which agent — the session opens in its folder'))}">
                    <option value="">Choose an agent…</option>
                    ${(DATA.agents || []).map(a => `<option value="${C.esc(a.id)}"${a.id === st.agentId ? ' selected' : ''}>${C.esc(a.name)}</option>`).join('')}
                </select>`}
                <select id="c-engine" title="${C.esc(boxTip((DATA.engines || []), engineNow(), 'Which engine this session runs on. An engine that is not installed or not signed in here is offered but cannot be chosen — hover it for the one thing to do about that. Set the one you use most as the default in Farm Settings → launchDefaults.'))}">${engineOptionsHtml(engineNow())}</select>
                ${engineHintHtml(engineNow())}
                ${routeBoxesHtml()}
                <select id="c-model" title="${C.esc(boxTip(withCurrent(composerModels(engineNow()), st.model), st.model, 'Model for the new session' + flagOf(engineNow(), 'model') + '. ' + modelNote(engineNow())))}">${opts(withCurrent(composerModels(engineNow()), st.model), st.model)}</select>
                ${drawsEffort(engineNow())
                    ? `<select id="c-effort" title="${C.esc(boxTip(withCurrent(effortsForModel(engineNow(), st.model), st.effort), st.effort, 'Reasoning effort' + flagOf(engineNow(), 'effort')))}">${opts(withCurrent(effortsForModel(engineNow(), st.model), st.effort), st.effort)}</select>`
                    : ''}
                <select id="c-perm" title="${C.esc(boxTip(DATA.permissions, st.permissionMode, startPermTip))}">${opts(DATA.permissions, st.permissionMode)}</select>
                <select id="c-proj" title="${C.esc(boxTip([{ id: '', label: '◧ No project' }, ...(DATA.projects || []).map(p => ({ id: p.id, label: (p.icon || '◧') + ' ' + p.name }))], DATA.activeProjectId || '', 'Project for THIS session — it is told about it before you type, and is filed under it. It starts at No project every time: the status bar\'s active project is the window\'s answer, not this session\'s, and neither writes the other.'))}">
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
                            <div id="c-slashpop"></div>
                            <button class="tatool taslash" id="c-slash"
                                title="The commands this engine could actually be told — /model, /compact, a file you wrote under commands/, a skill installed on this machine. It types the slash for you; typing one yourself opens the same list. ↑↓ move, ↵ inserts, Esc closes — nothing is sent.">/</button>
                            ${window.AFTextTools.html('c')}
                        </div>
                        <div class="crow" id="c-controls">${controls}</div>
                        <div class="crow" id="c-status" style="font-size:10px;opacity:.6"></div>
                    </div>
                </div>
            </div>`;
        // ‼️ U-105 — the column exists now, so its gutter can be read off it.
        // Done on every shell rebuild rather than once at boot: a theme change
        // is a rebuild, and a theme is allowed to change the scrollbar.
        measureScrollbar();
        // A rebuild starts every slot over — including the conversation's own
        // "nothing changed" key, or the new empty #talkinner would keep the old
        // key and never be filled (see paint's talkKey).
        for (const k of Object.keys(written)) { delete written[k]; }
        lastTalkKey = '';

        const text = document.getElementById('c-text');
        if (text) {
            text.value = st.draft || '';
            // The keystroke is what decides whether Send after turn and Send can act, so
            // it repaints that row (see renderLive) — `slot()` makes every
            // keystroke but the one that flips "empty" a no-op.
            text.addEventListener('input', () => {
                st.draft = text.value; save(); renderLive();
                // ‼️ K-30 — THE BOX IS WHAT DECIDES whether the "/" list is
                // open. One rule (`slashQueryAt`, in the component), read off
                // the caret, so there is no second state machine to fall out of
                // step with what is actually written in the box.
                window.AFSlashPicker.sync();
            });
            // A caret moved by hand is the same question asked again: a click
            // into the middle of a paragraph is not a query, and a click back
            // into a `/mod` that is still there is.
            text.addEventListener('click', () => window.AFSlashPicker.sync());
            // Leaving the box closes it. The rows stop their own mousedown, so
            // this cannot fire between pressing a row and the click landing.
            text.addEventListener('blur', () => window.AFSlashPicker.close());
            text.addEventListener('keydown', ev => {
                // ‼️ THE PICKER SEES EVERY KEY FIRST and takes exactly four,
                // only while it is open: ↑ ↓ ↵ Esc. Ctrl+Enter is never its own
                // — with a list open or shut, that chord means SEND, and a
                // picker that ate it would be one you must close before you can
                // talk. Escape is the other way round: while the list is open
                // it closes the list rather than interrupting the turn.
                if (window.AFSlashPicker.keydown(ev)) { return; }
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
            // ‼️ K-9 — NOTHING IS RESTORED HERE, AND THAT IS THE FIX. The box is
            // already its dragged height: `--af-boxh` is on the document root
            // and the rebuild that just made this element could not reach it.
            // What is wired is the RECORD, and the ceiling — see keepHeight.
            // The previous box's observer is stopped first: one left alive
            // writes the height ITS box had into the same slot, and that is a
            // height coming back on its own long after the box it belonged to.
            if (stopBoxH) { stopBoxH(); }
            stopBoxH = window.AFTextTools.keepHeight({
                el: text, varName: '--af-boxh', min: 64,
                read: () => st.boxH,
                write: px => { st.boxH = px; save(); }
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

        // ---- K-30: the "/" command picker ---------------------------------
        // ‼️ THE CATALOG IS ABOUT A SESSION, NOT ABOUT A PAGE — which is why
        // the component is handed a function rather than a list. A live card
        // answers with its OWN engine and what its `system:init` reported; the
        // composer answers with the engine about to be started and the agent
        // whose folders will be read. Change the agent picker and the key
        // changes, so the next `/` asks again instead of offering the previous
        // agent's own commands.
        window.AFSlashPicker.init({
            post: vscode, boxId: 'c-text', hostId: 'c-slashpop',
            context: () => {
                const cur = sel();
                const agent = (DATA.agents || []).find(a => a.id === (st.agentId || ''));
                return {
                    engine: (cur && cur.engine) || engineNow(),
                    agent: (cur && cur.agentName) || (agent && agent.name) || '',
                    session: (cur && cur.id) || ''
                };
            }
        });
        // ‼️ mousedown is prevented for the reason the four text tools prevent
        // it: the press must not blur the box, because the caret IS where the
        // slash has to land.
        byId('c-slash', 'mousedown', ev => { if (ev.preventDefault) { ev.preventDefault(); } });
        byId('c-slash', 'click', () => window.AFSlashPicker.openFromButton());
        // The line filter is the same multi-select the Search and Notices pages
        // use: null = everything, [] = nothing, any subset in between.
        if (s) {
            window.AFFilter.wireMulti({
                id: 'c-kinds',
                onChange: picked => {
                    // K-21 — written under the card, never over the default.
                    if (DATA.selected) { st.kindsBy[DATA.selected] = picked; }
                    else { st.kinds = picked; }
                    save();
                    paint();
                    // a filter change is the reader's own move: land at the tail,
                    // and what the filter let through is not "new lines"
                    resetTail();
                }
            });
        } else {
            const pick = (id, key) => byId(id, 'change', e => { st[key] = e.target.value; save(); });
            // ‼️ X-133 — the agent picker REPAINTS, which the shared `pick` does
            // not. The Superpowers chip beside the project one shows this
            // agent's own default until the user presses it, so an agent chosen
            // after the strip was drawn left the strip describing the previous
            // one — a switch reading "on" for an agent that starts plain.
            // ‼️ S-49 — …AND THE REPAINT IS ALL OF IT. The picker does not touch
            // the model, the effort or the permission mode: those are on screen
            // and they are the user's (see the S-49 note above memoryOn).
            byId('c-agent', 'change', e => {
                st.agentId = e.target.value;
                save();
                paint();
            });
            pick('c-effort', 'effort');
            byId('c-model', 'change', e => {
                st.model = e.target.value;
                reconcileComposer(engineNow(), true);
                save();
                paint();
            });
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
        // The engine of the NEXT session. It goes back to the extension rather
        // than into `st` because the refusal lives there (a webview's disabled
        // attribute is a courtesy, not a guard) and because the choice has to
        // survive a repaint that rebuilds this whole row.
        byId('c-engine', 'change', e => {
            // ‼️ A MODEL BELONGS TO ONE ENGINE. Carrying `sonnet` over to Codex
            // would leave a value in the box that its CLI can only reject, so a
            // chosen model — and the effort that was chosen for it — is dropped
            // the moment the new engine stops offering it. Keeping it quietly is
            // how the box came to disagree with the engine in the first place.
            const next = e.target.value;
            /**
             * ‼️ X-145 — AND THE ENGINE YOU MOVED TO HAS ITS OWN SETUP.
             *
             * Dropping the previous engine's model was right and was only half
             * the answer: an agent used on two engines has two setups, and
             * emptying the boxes made the user retype the one they had chosen on
             * that engine an hour earlier. The record is per engine now, so the
             * switch RECALLS rather than clears — and the permission mode moves
             * with it, because it is the box that had been carrying one engine's
             * answer onto every other one.
             *
             * A engine with no row of its own still ends up empty, and empty is
             * what leaves that engine's own settings file in charge.
             */
            const rec = ((DATA.agents || []).find(x => x.id === (st.agentId || '')) || {}).lastLaunch;
            const mem = memoryOn(rec, next);
            st.model = (mem && mem.model) || '';
            st.effort = (mem && mem.effort) || '';
            st.permissionMode = (mem && mem.permissionMode) || '';
            reconcileComposer(next, false,
                mem ? { model: st.model, effort: st.effort } : null);
            save();
            vscode.postMessage({ type: 'setEngine', id: next });
            /**
             * ‼️ S-51 — AND THE BOXES ANSWER NOW, NOT WHEN THE HAND LETS GO.
             *
             * The model list, the effort list and the hint under them are all
             * drawn off `engineNow()`, so none of them moves without a shell
             * rebuild — and the only rebuild this handler had was the HOST's
             * echo of the message above. That echo arrives at the one moment
             * the reader's hand is still on the picker they just used, because
             * a native `<select>` keeps focus after a choice, so M-33 read the
             * page as hands-on and put the rebuild on the slate. The debt was
             * then paid by the `focusout` of the user reaching for the model
             * box — which is precisely why the list corrected itself the
             * instant they went to argue with it.
             *
             * ‼️ M-33 IS NOT THE THING TO LOOSEN: its rule is already "only a
             * rebuild NOBODY ASKED FOR waits", and this one was asked for by
             * the hand it was waiting on. So the answer is the same one the
             * model picker beside it has always used — repaint on the spot.
             *
             * The engine is echoed into DATA first because the redraw asks
             * `engineNow()` and the host has not spoken yet. Nothing is risked:
             * the next push replaces DATA whole, the host's answer for this box
             * is the value posted one line above, and the refusal that matters
             * lives at start, not here.
             */
            DATA.engine = next;
            paint();
            // …and the rebuild replaced the very control the hand is on, so it
            // is handed back. Without this an arrow-key walk through the engine
            // list would lose focus on its first step and never reach a second.
            const box = document.getElementById('c-engine');
            if (box && box.focus) { box.focus(); }
        });
        /**
         * ‼️ X-105 — WHICH ROUTE THE NEXT SESSION RUNS ON, and the tier under it.
         *
         * Both go back to the host rather than into `st` for the reason the
         * engine does: the NARROWING lives there. Only the engine's own adapter
         * knows that a tier stopped existing because the route moved, and it
         * says out loud what it dropped — a pick pruned silently on this side
         * would leave the box agreeing with a value the launch will not use.
         *
         * ‼️ AND THE ROUTE IS THE ONE ABOVE THE TIER, so changing it clears the
         * tier rather than carrying it: `standard` on one route is not
         * `standard` on another, and the adapter would drop it anyway — this
         * just stops the box showing a word that is about to go.
         *
         * ‼️ S-51 — AND BOTH REPAINT ON THE SPOT, for exactly the reason the
         * engine picker does: the boxes below them are drawn off this pick, the
         * only rebuild is the host's echo, and that echo lands while the hand is
         * still on the select. See the S-51 note above.
         */
        const sendRoute = (providerId, tier, focusId) => {
            DATA.composerPick = providerId ? { providerId, ...(tier ? { tier } : {}) } : null;
            // the tiers under a route can only come from the host, and they must
            // not have to wait for the hand to leave the box that asked
            askedHost = true;
            vscode.postMessage({ type: 'setRoute', providerId, tier });
            paint();
            const box = document.getElementById(focusId);
            if (box && box.focus) { box.focus(); }
        };
        byId('c-route', 'change', e => sendRoute(e.target.value, '', 'c-route'));
        byId('c-tier', 'change', e =>
            sendRoute((routePick().providerId || ''), e.target.value, 'c-tier'));
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
            wireColorDots('c-list');
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
            wireColorDots('c-rlist');
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
        // ‼️ THE CHIP IS ABOUT WHAT IS ON SCREEN, NOT ABOUT THE PICKER.
        // `chipProjectId` is the selected session's own project, and only falls
        // back to the composer's answer when there is no session yet. Reading
        // the picker's field here is what made "Start session" look like it
        // dropped the project: the picker is cleared for the NEXT session the
        // moment one starts, and the chip repeated that as "No project".
        const id = DATA.chipProjectId || '';
        const s = sel();
        // A session's project outlives the picker's list, which holds open
        // projects only — so a session running under a project that has since
        // been finished or archived is still named, from the session's own row.
        const p = (DATA.projects || []).find(x => x.id === id)
            || (s && s.projectId && s.projectId === id && s.projectName
                ? { id, name: s.projectName, icon: s.projectIcon || '' } : undefined);
        const T = window.AFTip;
        if (!p) {
            return T.wrap(
                '<span class="pchip none">◧ No project<span class="pchip-hint">hover to read what is sent</span></span>',
                'No project — nothing is added to the system prompt',
                s
                    ? 'This session was started under no project: it was told nothing extra, and it is filed nowhere.\n\n'
                    + 'Right-click its row to file it under one. The filing is what the Projects pages read — the brief itself rides in on the system prompt at spawn, so it is fixed for as long as this process lives.'
                    : 'Sessions you start here are told nothing extra and are filed nowhere.\n\n'
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

    /**
     * ‼️ X-133 — THE SUPERPOWERS SWITCH, AND WHY IT IS A CHIP ON THE SAME LINE.
     *
     * It travels on the SAME `--append-system-prompt-file` the project chip
     * exists to make readable — one flag, one file, both halves invisible to
     * the transcript. So it is drawn beside it and it obeys the same rule: the
     * hover carries the TEXT, verbatim, not a description of it.
     *
     * Three states, and they are genuinely different:
     *   · a SESSION is selected → a reading, not a control. Its system prompt
     *     was written at spawn and cannot be rewritten under a running process.
     *   · the folder cannot supply the hook → not "off": the switch cannot be
     *     honoured at all, and it says which file is missing rather than
     *     looking merely unticked.
     *   · otherwise → the choice for the session about to be started, opening
     *     on this AGENT's default and following it until it is pressed.
     */
    function superpowersState() {
        const h = DATA.superpowersHealth || { usable: false, why: '', skills: 0 };
        const s = sel();
        if (s) { return { fixed: true, usable: h.usable, why: h.why, skills: h.skills, on: !!DATA.superpowersOn }; }
        const agent = (DATA.agents || []).find(a => a.id === (st.agentId || ''));
        const def = !!(agent && agent.superpowers);
        const choice = DATA.superpowersChoice || '';
        return {
            fixed: false, usable: h.usable, why: h.why, skills: h.skills,
            def, choice, agentName: agent ? agent.name : '',
            on: choice ? choice === 'on' : def
        };
    }

    function superpowersChipHtml() {
        const T = window.AFTip;
        const sp = superpowersState();
        const label = `⚡ Superpowers${sp.on ? '' : ' off'}`;
        if (!sp.usable) {
            return T.wrap(
                `<span class="pchip sw broken">⚡ Superpowers unavailable</span>`,
                'The skills folder cannot supply the hook — nothing is added',
                (sp.why || 'The folder is not readable.')
                + '\n\nNothing is put in front of the model while this is true: half a hook — '
                + '"use the relevant skill", with no skills behind it — sends it looking for files that are not there.'
                + '\n\nagentFarm.superpowersPath is the folder; superpowers.status says what it found.');
        }
        // A running session wears what it was started with. Saying so is the
        // point: a control here would promise a change the process cannot make.
        if (sp.fixed) {
            return T.wrap(
                `<span class="pchip sw fixed${sp.on ? '' : ' off'}">${label}</span>`,
                T.lines([sp.on
                    ? `On for this session · ${sp.skills} skills within reach`
                    : 'Off for this session — nothing was added']),
                (sp.on
                    ? 'This session was started with the engineering discipline in its system prompt, and it is given it again on every resume — the appended prompt does not survive --resume.'
                    : 'This session was started plain. Nothing about Superpowers is in its system prompt.')
                + '\n\nIt cannot be changed under a running session: the system prompt is written once, at spawn. '
                + 'Start a new session to change it.'
                + (sp.on ? `\n\nWhat it was given:\n\n${DATA.superpowersText || ''}` : ''));
        }
        const text = DATA.superpowersText || '';
        const source = sp.choice
            ? 'you set it here'
            : `the default for ${sp.agentName || 'this agent'} (agentFarm.superpowersDefaults)`;
        return T.wrap(
            `<button type="button" class="pchip sw${sp.on ? '' : ' off'}" id="c-sp">${label}</button>`,
            // MIRROR — the current value first, then where it came from.
            T.lines([
                sp.on ? `ON · ${T.sizeNote(text)} · ${sp.skills} skills` : 'OFF · nothing is added',
                `Now: ${source} · click to turn it ${sp.on ? 'off' : 'on'}`
            ]),
            (sp.on
                ? 'The session is given the library\'s own root hook plus an index of where the skills are. The skills themselves stay on disk at zero tokens — the model reads the one it needs, when it needs it.\n\nThis is what goes in:\n\n' + text
                : 'Nothing is added: the session runs exactly as it did before any of this existed.\n\n'
                + `Turned on, it would be given the root hook plus an index of ${sp.skills} skills — TDD, systematic debugging, planning, verification — for the model to read one at a time, on demand.`));
    }

    /**
     * `fromHost` says the repaint is somebody ELSE's — a push, not a press. It
     * is the only thing that may be put off: a render the user's own action
     * asked for happens at once even with a field focused, because the field is
     * what asked. See media/afRepaint.js for the same distinction drawn once.
     */
    function paint(fromHost) {
        const s = sel();
        // ‼️ THE PIN IS PART OF THE KEY. It decides whether the composer draws a
        // picker or a name, which is markup — so a pin that arrived while the
        // composer was already on screen has to rebuild the shell, exactly as a
        // change of session does.
        // ‼️ X-105 — THE ROUTE IS PART OF THE SHAPE TOO. It decides whether the
        // tier box exists at all and, on an engine whose sub-axis is the model,
        // what the model box may offer — so a pick that did not reach this key
        // would be a control changing nothing under a control that changed.
        const composerShape = s ? '' : `|${engineNow()}|${st.model || ''}|${routeShape()}`;
        const key = `${DATA.selected || ''}|${s ? s.status === 'ended' || s.status === 'error' : 'none'}|${DATA.pinnedAgent || ''}${composerShape}`;
        if (shellKey !== key) {
            // ‼️ M-33 — ONLY A REBUILD NOBODY ASKED FOR WAITS.
            //
            // A CHANGE OF SESSION IS THE READER'S OWN ACT even though it arrives
            // as a host push: pressing a card in the list is answered by the
            // host echoing the whole state back. Holding that back because a
            // `<select>` still had focus would read as "I clicked it and nothing
            // happened" — the opposite complaint, and a worse one. So the wait
            // is for the SAME session changing shape under the hands: its status
            // flipping to ended, a pin arriving — none of which anybody here
            // pressed, and every one of which replaces the composer.
            //
            // IT DEFERS, IT DOES NOT DROP: the key is deliberately not taken
            // while the rebuild is owed, so the next pass sees the same
            // difference and tries again, and `focusout` below pays the debt.
            // Everything after this block still runs either way, so the output
            // the reader is watching keeps arriving.
            const sameSession = shellKey !== null
                && String(shellKey).split('|')[0] === String(DATA.selected || '');
            // ‼️ X-105 — AND AN ANSWER I ASKED FOR IS NOT "A REBUILD NOBODY
            // ASKED FOR" EITHER.
            //
            // The route box can only draw what the host resolved: pick a route
            // and the TIERS under it arrive with the echo, not before it. That
            // echo lands with the hand still on the select that asked for it —
            // the S-51 shape exactly — so M-33 would put the new box on the
            // slate and the reader would see it appear only after they reached
            // somewhere else. `askedHost` is the page saying "this push is my
            // own answer", and it is one-shot: the very next host push clears
            // it, so an unrelated one a second later still waits.
            if (fromHost && sameSession && !askedHost
                && window.AFRepaint.inAField(document)) {
                shellOwed = true;
            } else {
                shellOwed = false;
                shellKey = key;
                buildShell(s);
            }
        }
        // ‼️ ONE-SHOT, and consumed whether or not the shape actually moved: the
        // answer arrived either way, and a flag left standing would let the next
        // unrelated push through the guard as well.
        if (fromHost) { askedHost = false; }
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
        /*
         * ‼️ S-29 (reopened) — DO NOT REBUILD A CONVERSATION THAT DID NOT CHANGE.
         *
         * `talkHtml` renders EVERY line of the selected session — up to four
         * hundred of them, each through `messageHtml` — and it ran on every
         * single repaint. That is the right cost while a turn streams, because
         * the last line really is growing; it is pure waste for the repaints
         * that carry no new words at all, and those are exactly the ones a
         * person is waiting on. End session flips a status; Remove from list
         * takes a card off the shelf; both redrew the whole transcript before
         * the panel could answer, and on a slow machine that is the seconds the
         * user is counting.
         *
         * `slot` already skips the DOM write when the html is identical — but
         * only AFTER the html has been built, which is the part that costs. The
         * signature is everything the rendering depends on: which session, the
         * filter, how many lines got through, and the tail (a streaming line
         * grows in place, so its length is what moves). `permissionBox` rides
         * in `talkHtml` too, so the parked question is part of it.
         */
        const last = shown.length ? shown[shown.length - 1] : null;
        const talkKey = !s ? 'none' : [
            DATA.selected, kindsNow() === null || kindsNow() === undefined ? '*' : String(kindsNow()),
            shown.length, (s.messages || []).length,
            last ? last.role : '', last ? (last.text || '').length : 0,
            last && last.tool ? last.tool.name : '',
            s.pendingPermission ? JSON.stringify(s.pendingPermission) : '',
            s.pendingAsk ? JSON.stringify(s.pendingAsk) : ''
        ].join('|');
        // Taken while the OLD rows are still on screen, and only when there is
        // a reading position to lose — see readAnchor.
        const anchor = pinned ? null : readAnchor(talkEl);
        const changed = talkKey === lastTalkKey
            ? false
            : slot('talkinner', talkHtml(s, shown));
        lastTalkKey = talkKey;
        const nowTailKey = tailIdOf(last);
        const nowTailLines = lineUnits(last);
        if (changed) {
            if (pinned) {
                unseen = 0;
                if (talkEl) { talkEl.scrollTop = talkEl.scrollHeight; }
            } else {
                // Only what the filter LET THROUGH counts as a new line: lines
                // you have filtered out are not news you are missing.
                if (shownCount >= 0 && shown.length > shownCount) {
                    unseen += shown.length - shownCount;
                } else if (shownCount >= 0 && shown.length === shownCount
                    && nowTailKey && nowTailKey === tailKey && nowTailLines > tailLines) {
                    // ‼️ K-19 — the streamed answer: same row, more of it.
                    unseen += nowTailLines - tailLines;
                }
                restoreAnchor(talkEl, anchor);
            }
        }
        shownCount = shown.length;
        tailKey = nowTailKey;
        tailLines = nowTailLines;
        paintJump();

        const hidden = s ? (s.messages || []).length - shown.length : 0;
        slot('c-hidden', hidden ? `${hidden} line(s) hidden by <b>show</b>` : '');

        // What a session started here is being told, and how it is expected to
        // work — see projectChipHtml / superpowersChipHtml. One strip, because
        // both halves ride on the same appended system prompt.
        if (slot('c-project', projectChipHtml() + superpowersChipHtml())) {
            const sw = document.getElementById('c-sp');
            // ‼️ PRESSING IT BACK ONTO THE AGENT'S OWN ANSWER CLEARS THE CHOICE
            // rather than recording the same value as a decision. Otherwise
            // switching the agent picker afterwards would carry the last
            // agent's answer across as if the user had meant it for this one.
            if (sw) {
                sw.addEventListener('click', () => {
                    const sp = superpowersState();
                    const next = !sp.on;
                    vscode.postMessage({ type: 'setSuperpowers', on: next === sp.def ? null : next });
                });
            }
        }

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
            // ‼️ K-23 — and the head row's way further back. Wired HERE, with
            // the rest of the conversation's controls, because the row it sits
            // on is rewritten by the same write (see the note on ctxAttr).
            document.querySelectorAll('[data-older]').forEach(b =>
                b.addEventListener('click', () => {
                    b.disabled = true;
                    b.textContent = '↑ reading…';
                    vscode.postMessage({ type: 'loadOlder', id: DATA.selected });
                }));
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

        /**
         * ‼️ …AND NOW THAT EVERYTHING BELOW THE TRANSCRIPT HAS FINISHED CHANGING
         * HEIGHT, THE TAIL IS RE-PINNED (U-28).
         *
         * The live strip is a SIBLING of the scroller, not part of it. When a
         * turn starts it appears and takes two lines out of `.talk`'s height —
         * after `talkinner` was written and pinned. `scrollTop` is preserved, so
         * the same scrollTop against a shorter box is no longer the bottom, and
         * the last line sat one row below the fold until the reader dragged it
         * back. Measured as worse on the per-turn engines because their strip
         * carries more, but it was never Claude-only.
         *
         * `pinned` is the reading taken BEFORE anything was written, so a reader
         * who had scrolled up to read something is still left where they were —
         * that rule does not change, it is only applied later.
         */
        if (pinned && talkEl) { talkEl.scrollTop = talkEl.scrollHeight; }

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
                engine: engineNow(),
                model: st.model, effort: st.effort, permissionMode: st.permissionMode,
                // ‼️ X-133 — RESOLVED HERE, because this is where the agent is
                // known. The switch's untouched state means "this agent's own
                // default", and the panel cannot resolve that: the picker lives
                // on the page. It is sent as the answer, never as the choice.
                superpowers: superpowersState().on,
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
        // for. The picker owns the answer (media/afSnippets.js) — including
        // dropping a late one for a window the user already closed.
        if (window.AFSnippets.receive(ev.data)) { return; }
        // …and the wiki tagger the same way (K-26).
        if (window.AFWiki.receive(ev.data)) { return; }
        // …and the "/" catalog, gathered when the picker opened (K-30). It
        // drops an answer about an engine or agent the composer has moved on
        // from, so a slow disk cannot repopulate a list with the wrong one.
        if (window.AFSlashPicker.receive(ev.data)) { return; }
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
            if (DATA.selected !== wasOn) { shownCount = -1; unseen = 0; tailKey = ''; tailLines = 0; }
            // K-21 — a card taken off the shelf takes its `show` with it. The
            // host sends the WHOLE hosted list every time, so anything not in it
            // is a session that will never be looked at again.
            pruneKinds();
            // opened from an agent row: preselect that agent in the composer
            if (DATA.presetAgent) { st.agentId = DATA.presetAgent; save(); }
            applyComposerSeed();
            // ‼️ M-33 — this one is the HOST's: see paint(fromHost).
            paint(true);
        }
    });
    // ‼️ M-33 — the shell rebuild that paint() put off is a debt, and `focusout`
    // is the moment the hands come free. Asked a tick late on purpose: the event
    // fires while focus is still on the box being LEFT, so an immediate check
    // would find a field either way and the page would stay stale for ever.
    if (document.addEventListener) {
        document.addEventListener('focusout', () => {
            setTimeout(() => { if (shellOwed && !window.AFRepaint.inAField(document)) { paint(); } }, 0);
        });
    }
    if (DATA.presetAgent) { st.agentId = DATA.presetAgent; save(); }
    applyComposerSeed();
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
