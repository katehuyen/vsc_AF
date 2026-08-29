// Agent Farm — live swim-lane timeline page script.
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    let DATA = window.__DATA__;
    // ≤1440 renders event dots from live memory (the monitor keeps 24h);
    // longer ranges render density buckets fetched from the host's persistent
    // store (survives reloads, keeps 31d).
    let windowMin = 60;
    const DETAIL_MAX_MIN = 1440;
    let HISTORY = null;        // { hours, density, workflowRuns }
    let historyFetchedAt = 0;
    let historyRequested = 0;

    // ‼️ "YOUR TURN" ALERTS BELONG TO THE SESSION, NOT THE AGENT (U-66).
    // The row IS a session, so its four gutter controls read and patch that
    // session's own record. The host is the authority: a click sends
    // {sessionId, action, enabled} and the next `data` message brings back what
    // was actually stored, so a panel left open behind another tab can never
    // write a stale world back over a change made somewhere else.
    const TURN_ACTIONS = [
        { id: 'sound', glyph: '♪', label: 'Sound (chime)' },
        { id: 'focus', glyph: '◎', label: 'Focus / bring forward' },
        { id: 'modal', glyph: '▣', label: 'Modal alert box' },
        { id: 'toast', glyph: '▭', label: 'Toast (corner notification)' }
    ];
    const ACTION_BY_ID = {};
    TURN_ACTIONS.forEach(a => { ACTION_BY_ID[a.id] = a; });
    function actionsFor(sessionId) {
        return (DATA.sessionAlerts && DATA.sessionAlerts[sessionId]) || [];
    }
    /** A-23 — the resolved tone for one session and one event, or null when the
     *  host has not resolved that lane (a row with no live session). */
    function voiceFor(sessionId, event) {
        const row = DATA.sessionVoices && DATA.sessionVoices[sessionId];
        return (row && row[event]) || null;
    }
    /** The short name of an event. The host owns the spelling (core/alertVoices)
     *  so the picker, the row and Settings cannot call the same edge three
     *  different things; the id is the fallback, never a second name. */
    function eventName(e) {
        return (DATA.alertEvents || []).reduce((a, x) => x.event === e ? x.label : a, e);
    }
    /**
     * ‼️ A-23 — MIRROR: WHAT THIS ROW WILL ACTUALLY PLAY, on the first line.
     *
     * The ♪ box is a checkbox, and a checkbox can only ever say "armed". That
     * was never the question somebody hovers it with: five tones exist so the
     * turn ending and the agent asking can be told apart from another room, and
     * "armed" does not say which of them this row is about to make. So the
     * panel opens with the tone and the step of the chain that chose it, then
     * the second event, then whatever was passed over on the way — and only
     * then what the control does.
     */
    function soundTip(sid, on) {
        const events = DATA.sessionAlertEvents || ['turn-ready', 'question'];
        const name = eventName;
        const said = [];
        const skipped = [];
        events.forEach(e => {
            const v = voiceFor(sid, e);
            if (!v) { return; }
            said.push(`${name(e)}: ${v.label} — ${v.originLabel}`
                + (v.playable ? '' : '   ⚠ nothing here plays that file, so this one would be SILENT'));
            (v.skipped || []).forEach(s =>
                skipped.push(`${name(e)}: ${s.voice} (${s.origin}) — ${s.why}`));
        });
        if (!said.length) { return ''; }
        // ‼️ A-22 — WHETHER ANY OF IT IS HEARD, BEFORE WHICH TONE IT WOULD BE.
        // The lines above are true on a muted farm and at 03:00, and a panel
        // that named a tone without saying the gate is shut is the one surface
        // actively misleading the reader who opened it asking why they heard
        // nothing. Every authority is named, because unmuting while quiet hours
        // are still on leaves the row just as silent.
        const g = DATA.alertGate || {};
        const shut = [];
        if (g.muted) { shut.push('the farm is muted (the 🔇 in the status bar)'); }
        if ((g.mutedSessions || []).indexOf(sid) >= 0) {
            shut.push('this session is muted on its own (right-click → Sound for this session…)');
        }
        if (g.quiet && g.quiet.inside) {
            shut.push('quiet hours ' + g.quiet.from + '–' + g.quiet.to + ', silent until ' + g.quiet.to);
        }
        return window.AFTip.lines([
            shut.length ? '⚠ NOTHING PLAYS RIGHT NOW — ' + shut.join(' · ') + '\n' : '',
            said.join('\n'),
            on
                ? '\nThis row is armed: the tone above plays when this session reaches that edge.'
                : '\nThe box is OFF, so nothing plays from here — the tone above is what it WOULD '
                    + 'play. A fleet-wide switch (Settings ▸ Alert sounds) can still ring it.',
            '\nRight-click this row → Sound for this session… to give this conversation a tone of '
                + 'its own. Clearing that is not silence: it hands the answer back to your setting '
                + 'for everybody, and then to the built-in default.',
            skipped.length ? '\nPassed over on the way:\n' + skipped.join('\n') : ''
        ]);
    }
    /** The last "test in 3 seconds" run, per session — countdown then result. */
    const ALERT_TESTS = new Map();   // sessionId -> {state,'counting'|'done', until, result}
    let alertTick = null;
    /**
     * ‼️ A-23 — WHICH EDGE THE ⏱ REHEARSES. `turn-ready` by default, because
     * that is the edge every install already had and a test that changed its
     * own subject on upgrade would be a different test. The point of making it
     * choosable is the one thing the sound feature exists for: the turn ending
     * and the agent asking are DIFFERENT tones on purpose, and until this the
     * only way to hear the second one was to wait for an agent to ask.
     */
    let testEvent = 'turn-ready';

    const STYLE = `<style>
        .sid { font-weight:400; opacity:.6; font-size:11px; }
        .slink { cursor:pointer; text-decoration:underline; text-decoration-style:dotted; text-underline-offset:2px; }
        .slink:hover { color:var(--vscode-textLink-activeForeground, var(--vscode-textLink-foreground)); }
        .pathlink { cursor:pointer; }
        .pathlink:hover { text-decoration:underline; }
        .lanelabel:hover text { opacity:1; text-decoration:underline; }
        /* U-53 — session ids are read against each other (is this the same run
           as that one?), so they are set in the editor's own monospace and stay
           quieter than the name above them even under the row's hover. */
        .lane-sid { font-family:var(--vscode-editor-font-family, monospace); letter-spacing:-0.2px; }
        .lanelabel:hover .lane-sid { opacity:.8; }
        /* ‼️ U-67 — the hover/click boxes laid over the drawing: the gutter
           label, every tool bar and every dot. They are HTML over an SVG
           because an AFTip is HTML; the wrapper carries the box (afTip measures
           the panel against it) and the trigger fills it. The highlight is the
           affordance the SVG's own :hover used to give and can no longer, since
           these sit on top of it. A dot's box is deliberately wider than the
           dot, so it lights up as a soft circle rather than as a rectangle
           around something round. */
        .lanes-wrap { position:relative; }
        .lanes-wrap .af-tipw.lane-hotw { position:absolute; display:block; }
        .lane-hot { display:block; width:100%; height:100%; border-radius:4px;
            transition:background-color .08s linear; }
        .lane-hot:hover { background:var(--vscode-list-hoverBackground, rgba(128,128,128,0.18)); }
        .lane-hotw.lane-dot .lane-hot { border-radius:50%; }
        /* A-23 — the ⏱'s subject sits INSIDE the sentence that explains the ⏱,
           so it is sized by that sentence and not by the form controls on other
           pages: a 13px box with 5px of padding in an 11px line is a button
           pretending to be a word. */
        #testevent { font-size:11px; padding:1px 4px; border-radius:3px;
            vertical-align:baseline; max-width:190px; }
        /* ‼️ U-81 — THE CARD'S TWO TEXT LINES ARE TWO DIFFERENT FACTS AND WERE
           DRAWN IDENTICALLY: the conversation's name above, the last thing asked
           below, same size, same grey, one under the other — so they read as one
           paragraph broken in half. The name takes the card's own foreground and
           a little weight; the prompt stays quiet and italic behind a ↳ that says
           it is the LATEST thing said, not the rest of the line above it.
           The selector carries three classes on purpose: .card .tip-host sets
           the dimmed colour these lines need everywhere else (see common.css). */
        .card .tip-host.card-open { color:var(--vscode-foreground); font-weight:600; overflow-wrap:anywhere; word-break:break-word; }
        .card .tip-host.card-said { font-style:italic; overflow-wrap:anywhere; word-break:break-word; }
        .card .card-said .said-mark { font-style:normal; font-weight:600;
            margin-right:3px; letter-spacing:.02em;
            color:var(--vscode-textLink-foreground, #3794ff); }
    </style>`;

    /**
     * The right-click contract for a session card — the same one the Console's
     * rows and the Sessions tables use, from `media/afSessionCtx.js`.
     */
    const ctxAttr = o => window.AFSessionCtx.attr(o);

    /**
     * The same contract for a SWIM-LANE row. A row is a session too — the one
     * the card below is about — so right-clicking it must offer that session's
     * actions (rename · open · terminal · interrupt · end · clear) instead of
     * making you scroll down to find its card. The identity is read from the
     * live session when it is still tracked; a row that outlived its card still
     * knows its id and the agent it belongs to, which is what Clear needs.
     */
    /**
     * ‼️ U-76 — `item` IS WHAT MAKES A POINT MORE THAN ITS SESSION.
     *
     * Right-clicking a lane gives that session's actions, and that is right for
     * the ROW. On a dot or a bar the reader is pointing at one MOMENT, and the
     * thing they wanted was the moment's own words: left-click already opens
     * the transcript there and the viewer's copy button is two clicks further
     * on, which is two clicks and a lost place for a line of text. So a point
     * carries the file and the instant it stands for, and the menu grows one
     * entry that copies exactly what that step's copy button would.
     *
     * The text itself is NOT put in here. A context attribute is HTML on every
     * dot on the page, and a four-thousand-character prompt on each of them is
     * a page nobody can afford; the host reads the step back out of the
     * transcript, which is also the only way the copy can be the WHOLE thing
     * rather than the shortened line the chart keeps.
     */
    function laneCtx(sid, agentName, section, item) {
        const s = LIVE_BY_ID.get(sid);
        return ctxAttr({
            webviewSection: section || 'afTimelineSession', preventDefaultContextMenuItems: false,
            sessionId: sid,
            ...(item && item.file ? { afCorpus: true, afCorpusFile: item.file, afCorpusTs: item.ts || 0 } : {}),
            title: (s && s.title) || '',
            // The agent's NAME is all a lane knows — the host resolves the rest
            // (see resolveAgent), which is what lets the label carry the agent
            // menu without the page having to know an id.
            agentName: (s && s.agentName) || agentName || '',
            cwd: (s && s.cwd) || ''
        });
    }

    const BRANCH_GLYPH = { ok: '✓', failed: '✕', skipped: '·' };

    /**
     * ‼️ A-23 — THE ⏱'s SUBJECT, PICKED ONCE FOR THE PAGE RATHER THAN PER ROW.
     *
     * A per-row picker would be a fifth control in a gutter that is already four
     * boxes and a button wide, for a setting nobody changes twice in a sitting.
     * It sits in the line that EXPLAINS the ⏱ instead — the one place a reader
     * is already being told what that button does. MIRROR: the box is narrow,
     * so its tooltip opens with what it is set to.
     */
    function testEventSelect() {
        const evs = DATA.alertEvents || [{ event: 'turn-ready', label: 'Turn finished' }];
        const armed = DATA.sessionAlertEvents || [];
        const cur = evs.reduce((a, x) => x.event === testEvent ? x.label : a, testEvent);
        const tip = `Testing as: ${cur}\n\nWhich edge the ⏱ rehearses. The four branches are the `
            + `same on every edge; the SOUND is not — turn-ready and question are deliberately `
            + `different tones, and this is the only way to hear the second one without waiting `
            + `for an agent to ask something.\n\nThe three that no session can arm itself on `
            + `(stalled · ended · error) still ring here, so their tone can be judged before the `
            + `fleet-wide switch is turned on for them.`;
        return `<select id="testevent" title="${C.esc(tip)}">${evs.map(e =>
            `<option value="${C.esc(e.event)}"${e.event === testEvent ? ' selected' : ''}>`
            + `${C.esc(e.label)}${armed.indexOf(e.event) >= 0 ? '' : ' (fleet switch only)'}</option>`
        ).join('')}</select>`;
    }

    /**
     * ‼️ WHAT THE TEST ACTUALLY DID — the strip under the lanes.
     *
     * The ⏱ control lives in the row (the row is the session), but its RESULT is
     * text: four branches, each with its own verdict, plus the sound backend's
     * exit code and timing. That is an AFTip's job, not a native `title`'s, and
     * an AFTip is HTML — so the row starts the test and this reads it back. The
     * one line says the verdict; the panel says why.
     */
    function alertTestStrip() {
        if (!ALERT_TESTS.size) { return ''; }
        const rows = [...ALERT_TESTS.entries()].map(([sid, t]) => {
            const s = LIVE_BY_ID.get(sid);
            const who = (s && (s.label || s.agentName)) || sid.slice(0, 8);
            const id = `<span class="lane-sid">#${C.esc(sid.slice(0, 8))}</span>`;
            if (t.state === 'counting') {
                const left = Math.max(0, Math.ceil((t.until - Date.now()) / 1000));
                return `<div class="sub" style="margin-top:2px">⏱ <b>${C.esc(who)}</b> ${id}` +
                    ` — testing <b>${C.esc(eventName(t.event || 'turn-ready'))}</b> in ${left}s…` +
                    ` <span class="muted">switch to another window now if you want to see focus work</span></div>`;
            }
            const r = t.result || {};
            if (!r.ok) {
                return `<div class="sub" style="margin-top:2px">⏱ <b>${C.esc(who)}</b> ${id} — ` +
                    `<span style="color:var(--vscode-charts-red,#f14c4c)">not run</span>` +
                    ` <span class="muted">${C.esc(r.error || 'unknown reason')}</span></div>`;
            }
            const branches = r.branches || [];
            const short = branches.map(b =>
                `<span title="${C.esc((ACTION_BY_ID[b.action] || {}).label || b.action)}"` +
                ` style="opacity:${b.status === 'skipped' ? '.45' : '1'};color:${b.status === 'failed'
                    ? 'var(--vscode-charts-red,#f14c4c)' : 'inherit'}">` +
                `${(ACTION_BY_ID[b.action] || {}).glyph || '?'}${BRANCH_GLYPH[b.status]}</span>`).join(' ');
            const body = window.AFTip.lines(branches.map(b => {
                const a = ACTION_BY_ID[b.action] || { label: b.action };
                const head = `${a.label}: ${b.status}${b.ms ? ' (' + b.ms + ' ms)' : ''}`;
                const snd = b.sound
                    ? `\n    backend: ${b.sound.backend}` +
                      `\n    exit: ${b.sound.exitCode === null ? '—' : b.sound.exitCode}` +
                      (b.sound.timedOut ? '\n    TIMED OUT' : '') +
                      (b.sound.stderr ? `\n    stderr: ${b.sound.stderr}` : '') +
                      `\n    ‼️ exit 0 means the player accepted the file — that it was AUDIBLE is yours to confirm`
                    : '';
                return head + (b.detail ? `\n    ${b.detail}` : '') + snd;
            }));
            const trigger = `<span class="slink">${short}</span>`;
            // ‼️ A-23 — WHICH EDGE WAS REHEARSED AND WHICH TONE CAME OUT. A
            // strip that says only "✓✓✓" cannot answer the question the test is
            // run to answer, now that the same four branches can play five
            // different sounds: the host resolves the voice as part of the test
            // and it is reported here, with the step of the chain that chose it.
            const v = r.voice || null;
            const said = `${eventName(r.event || 'turn-ready')}${v ? ' · ' + v.voice : ''}`;
            return `<div class="sub" style="margin-top:2px">⏱ <b>${C.esc(who)}</b> ${id} — ` +
                window.AFTip.wrap(trigger,
                    `Alert test · ${who} · ${new Date(r.at || Date.now()).toLocaleTimeString()}`,
                    body) +
                ` <span class="muted">${C.esc(said)}</span>` +
                ` <span class="muted">${C.esc((r.actions || []).join(' · ') || 'nothing selected')}</span></div>`;
        }).join('');
        return `<div class="card" style="margin-top:6px"><div class="muted small">Alert test</div>${rows}</div>`;
    }

    function isDensity() { return windowMin > DETAIL_MAX_MIN; }

    function requestHistory(force) {
        const hours = windowMin / 60;
        const fresh = HISTORY && HISTORY.hours === hours && Date.now() - historyFetchedAt < 30000;
        if (!force && (fresh || Date.now() - historyRequested < 3000)) { return; }
        historyRequested = Date.now();
        vscode.postMessage({ type: 'history', hours });
    }

    window.addEventListener('message', ev => {
        if (ev.data.type === 'data') {
            DATA = ev.data.data;
            if (isDensity()) { requestHistory(false); }
            render();
        } else if (ev.data.type === 'history') {
            HISTORY = ev.data;
            historyFetchedAt = Date.now();
            render();
        } else if (ev.data.type === 'alertTest') {
            const r = ev.data.result || {};
            if (r.sessionId) { ALERT_TESTS.set(r.sessionId, { state: 'done', result: r }); }
            render();
        }
    });
    setInterval(() => {
        if (isDensity()) { requestHistory(false); }
        render();
    }, 5000); // advance the "now" line even without events

    const STATUS_META = {
        'working':            { label: 'WORKING',     color: 'var(--vscode-charts-blue, #3794ff)' },
        'tool':               { label: 'TOOL',        color: 'var(--vscode-charts-green, #4caf50)' },
        'waiting-permission': { label: 'PERMISSION?', color: 'var(--vscode-charts-red, #f14c4c)' },
        'waiting-input':      { label: 'YOUR TURN',   color: 'var(--vscode-charts-yellow, #cca700)' },
        'stalled':            { label: 'STALLED',     color: 'var(--vscode-charts-orange, #d18616)' },
        'idle':               { label: 'IDLE',        color: 'var(--vscode-descriptionForeground, #999)' },
        'ended':              { label: 'ENDED',       color: 'var(--vscode-descriptionForeground, #999)' }
    };
    /**
     * ‼️ U-81 — SHORTHAND: THE BADGE IS THE SHORT FORM, THIS IS THE LONG ONE.
     *
     * `PERMISSION?` and `YOUR TURN` are seven-letter words for a state a reader
     * has to act on, and the card said them and nothing else. The rule is that
     * a shorthand is always one hover away from its meaning
     * (docs/CONVENTIONS.md → SHORTHAND), so every status the badge can draw is
     * written out here, once.
     */
    const STATUS_WORDS = {
        'working': 'thinking — a turn is in flight and no tool is running',
        'tool': 'running a tool right now',
        'waiting-permission': 'stopped at a permission prompt — it cannot go on until somebody answers',
        'waiting-input': 'the turn is finished and it is waiting on you',
        'stalled': 'nothing has arrived for longer than the stuck threshold',
        'idle': 'open, with nothing in flight',
        'ended': 'the session is over'
    };
    // Statuses where there is something to interrupt: a turn is in flight, a
    // permission dialog is up, or the session stopped mid-work. An idle or
    // finished session has nothing to stop — the button stays off those cards.
    const RUNNING = ['working', 'tool', 'waiting-permission', 'stalled'];

    function fmtClock(ts) {
        const d = new Date(ts);
        return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }

    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    function fmtTick(ts, winMs) {
        const d = new Date(ts);
        if (winMs <= 26 * 3600 * 1000) { return fmtClock(ts); }
        const day = d.getDate() + ' ' + MONTHS[d.getMonth()];
        return winMs <= 4 * 24 * 3600 * 1000 ? day + ' ' + fmtClock(ts) : day;
    }

    function relTime(ts) {
        const s = Math.round((Date.now() - ts) / 1000);
        if (s < 60) return s + 's ago';
        const m = Math.round(s / 60);
        if (m < 60) return m + 'm ago';
        return Math.round(m / 60) + 'h ago';
    }

    function fmtDur(ms) {
        const m = Math.max(0, Math.round(ms / 60000));
        if (m < 60) { return m + 'm'; }
        const h = Math.floor(m / 60);
        return h + 'h' + (m % 60 ? ' ' + (m % 60) + 'm' : '');
    }

    // Live sessions by id, refreshed at the top of every render: the lanes need
    // to know whether the session behind a row is still there, and the tooltips
    // read their figures from here.
    let LIVE_BY_ID = new Map();

    /** `#407c78cb` — a session id is how a row is matched against a terminal, a
     *  tab or a log line, so it is shown, not hidden. */
    const shortId = id => '#' + String(id || '').slice(0, 8);

    // ---- X-35: the engine axis on this page --------------------------------
    // ‼️ A PAGE THAT SHOWS FOUR ENGINES NEEDS TO BE ABLE TO SHOW ONE. The
    // sessions tables learned to filter by engine in X-27; this one, where a
    // person actually watches the farm work, could not — so "what is Codex
    // doing right now" meant reading every card. Only engines that are actually
    // on the page are offered: a segment for something with nothing behind it is
    // a control that does nothing.
    let engineSel = 'all';

    const engineOf = s => window.AFEngine.id(s && s.source);

    /**
     * Which engine an EVENT belongs to.
     *
     * Three answers in order, because a lane outlives its card by design: the
     * engine the event recorded (every event this build writes carries one), the
     * `cli:<engine>:` namespace when Agent Farm minted the id, and finally the
     * still-tracked session. `undefined` means nobody said — never a guess.
     */
    function engineOfEvent(e) {
        if (e.engine) { return window.AFEngine.id(e.engine); }
        const id = String(e.sessionId || '');
        if (id.indexOf('cli:') === 0) { return window.AFEngine.id(id.split(':')[1]); }
        const live = LIVE_BY_ID.get(e.sessionId);
        return live ? engineOf(live) : undefined;
    }

    /** The engines with something on this page right now, in palette order. */
    function enginesPresent() {
        const seen = [];
        for (const s of (DATA.sessions || [])) {
            const e = engineOf(s);
            if (seen.indexOf(e) < 0) { seen.push(e); }
        }
        const order = window.AFEngine.known;
        return seen.sort((a, b) => {
            const ia = order.indexOf(a), ib = order.indexOf(b);
            return (ia < 0 ? order.length : ia) - (ib < 0 ? order.length : ib);
        });
    }

    /**
     * Is this session over without having said so?
     *
     * The CLI keeps a registry of its running sessions; a claude session with no
     * record in it, whose process the OS no longer knows, is finished — whatever
     * the last hook event claimed. We only make that claim when the registry is
     * actually readable (`ownersKnown`), never for an external CLI (no registry
     * of its own), and never in the first minute of a session's life (the record
     * is written at startup, and a card may render before it lands).
     */
    function isGone(s) {
        return !!DATA.ownersKnown && !s.source && !s.owner &&
            Date.now() - (s.startedAt || 0) > 60000;
    }

    /**
     * ‼️ WHICH ENGINE, DRAWN THE WAY EVERY OTHER SURFACE DRAWS IT (X-35).
     *
     * This page printed the raw `source` string in the generic grey badge, and
     * only for a non-Claude session — so a Claude card wore nothing, which is
     * indistinguishable from a page that never learned about engines, and the
     * three that did wear something all wore the same colour. The shared
     * component gives every engine a badge and every engine one fixed colour
     * (media/afEngine.js); the hover is figures, per CONVENTIONS.
     */
    function engineBadge(s) {
        const eng = window.AFEngine.id(s.source);
        // ‼️ U-81 — THE SAME FIGURES THE SESSIONS TABLE'S ENGINE CELL CARRIES
        // (media/sessionsTable.js → TIP.engine), because it is the same fact
        // about the same session. The session id is NOT among them any more:
        // it is the id chip's subject two elements to the left, and a fact in
        // two panels is the ONE SUBJECT rule broken.
        return window.AFEngine.badge(eng, [
            tline('Engine', window.AFEngine.label(eng)),
            tline('Events', hasHooks(s)
                ? 'full — prompts, tools and turn ends' : 'lifecycle only — open and close'),
            tline('Model of the last reply', s.model),
            tline('Cost reported', s.cost ? C.fmtUSD(s.cost) : 'no — plan or account billing'),
            tline('Tokens', s.tokens ? C.fmtTok(s.tokens) : 'not published by this CLI'),
            tline('Transcript', s.transcriptPath ? 'on disk' : 'none this build can open')
        ].filter(Boolean).join('\n'));
    }

    /**
     * Does this session report the whole hook stream, or only its lifecycle?
     *
     * ‼️ NOT THE SAME QUESTION AS "IS IT CLAUDE" ANY MORE. A conversation Agent
     * Farm HOSTS is mirrored into the monitor by the extension itself — prompts,
     * tool spans, end of turn — whatever engine it runs on, so a hosted Codex
     * card carries the same detail a Claude one does. What is lifecycle-only is
     * a foreign CLI running in a plain terminal, where all we see is the window
     * opening and closing. The card said "external CLI — lifecycle only" for
     * both, which is now wrong for half of them.
     */
    function hasHooks(s) {
        return !s.source || s.prompts > 0 || s.toolCalls > 0;
    }

    /**
     * The figures a session card and a lane panel both want, in one place.
     *
     * ‼️ U-67 — AND ONE OF THEM CANNOT TAKE MARKUP. `fmtTokW` builds a `<span>`
     * carrying the weighted-token explanation as a hover of its own, which is
     * right on a card and is a wall of escaped HTML inside an `AFTip`, whose
     * body is TEXT printed whole. `plain` asks for the twin that says the same
     * figures in words (`fmtTokWText`) rather than for a stripped copy — a
     * second formatter would be a second answer to "how many tokens".
     */
    function statLines(s, plain) {
        const money = [
            s.cost ? C.fmtUSD(s.cost) : '',
            s.tokens ? (plain ? C.fmtTokWText(s.tokens, s.wTokens) : C.fmtTokW(s.tokens, s.wTokens)) + ' tok' : '',
            s.ctxTokens ? 'ctx ' + C.fmtTok(s.ctxTokens) : '',
            s.turns ? s.turns + ' turns' : '',
            s.model ? String(s.model).replace(/^claude-/, '') : ''
        ].filter(Boolean).join(' · ');
        const work = [
            s.prompts + ' prompts',
            s.toolCalls + ' tools',
            s.compactions ? s.compactions + ' compactions' : '',
            s.subagentStops ? s.subagentStops + ' subagents' : '',
            s.filesEdited ? s.filesEdited + ' files' : '',
            s.errors ? s.errors + ' errors' : ''
        ].filter(Boolean).join(' · ');
        const time = `started ${fmtClock(s.startedAt)} · ${fmtDur(Date.now() - s.startedAt)} · last event ${relTime(s.lastEventTs)}`;
        return { money, work, time };
    }

    /* ============ U-81 — WHAT A SESSION CARD SAYS WHEN YOU POINT AT IT ======
     *
     * ‼️ A CARD IS A ROW OF THE SESSIONS TABLE, STOOD UP. Every figure on it is
     * a column over there, and that table answers for each one
     * (media/sessionsTable.js → TIP). This page answered for a single line out
     * of nine: four carried nothing at all, and three carried a native `title`
     * holding either an explanation (which belongs to a heading, never to a
     * cell) or the words the card had just drawn beside it. So the same
     * questions are answered here, in the same shape and the same order as the
     * table a reader already knows.
     *
     * ONE SUBJECT, one panel. The NAME is the conversation · the id chip is the
     * id · the badge is what it is doing right now · the prompt is what was
     * said · and the three figure lines are money, work and time. No fact
     * stands in two of them, which is why the id is not repeated under the name
     * and the model is not repeated under the badge.
     *
     * ‼️ AND EVERY ONE OF THEM IS AN `AFTip`, NOT A `title`. A card is 260px
     * wide: every figure list here is longer than a native tooltip reads well,
     * and a path or a prompt is text outright (docs/CONVENTIONS.md → Hover).
     * The DEFAULT layout, deliberately — `tip-block` measures the panel against
     * the block it sits in, which is right for a wide table row and wrong for a
     * narrow card: it produced a 260px-wide panel, narrower than any other
     * panel in the extension. Anchored to its trigger the panel is its own
     * width again, and afTip's edge flip keeps it on the page.
     * ==================================================================== */

    /** `Label: value`, dropped when there is no value — the table's own line. */
    const tline = (label, v) =>
        (v === '' || v === undefined || v === null ? '' : `${label}: ${v}`);
    /** The body of a figures panel: the lines that have something to say. */
    const figures = parts => (parts || []).filter(Boolean).join('\n');
    const round1 = n => Math.round(n * 10) / 10;
    /** A rate only exists when there is a denominator worth dividing by. */
    const per = (n, d, f) => (n && d ? f(n / d) : '');

    /** WHICH CONVERSATION THIS IS — the panel under its name. */
    function nameTip(s) {
        const ran = Math.max(0, Date.now() - (s.startedAt || 0));
        return {
            head: `${s.label || s.agentName} · ${window.AFEngine.label(engineOf(s))}`
                + (s.turns ? ` · ${s.turns} turns` : ''),
            body: figures([
                tline('Agent', s.resolved ? s.agentName : 'not resolved — the card is named after the session'),
                tline('Named', s.label && s.label !== s.agentName
                    ? `${s.label} — this agent has more than one session open` : ''),
                tline('Folder', s.cwd),
                tline('Running for', fmtDur(ran)),
                tline('Transcript', s.transcriptPath || 'none this build can open'),
                tline('Events', hasHooks(s)
                    ? 'full — prompts, tools and turn ends'
                    : 'lifecycle only — a CLI in its own terminal, open and close is all this page sees')
            ]) + (s.transcriptPath
                ? '\n\nClick opens the transcript at the latest activity.' : '')
        };
    }

    /** THE ID ITSELF — where else this exact string turns up. */
    function idTip(s) {
        return {
            head: `Session ${shortId(s.sessionId)}`,
            body: figures([
                tline('Full id', s.sessionId),
                tline('Also on', 'the Console rows, the terminal tab, the log lines and this page\'s swim lane'),
                tline('Owned by', s.owner
                    ? `pid ${s.owner.pid}${s.owner.entrypoint ? ' · ' + s.owner.entrypoint : ''}`
                    : (s.hosted ? 'Agent Farm\'s own Console' : '')),
                tline('Alerts set', (actionsFor(s.sessionId) || [])
                    .map(a => (ACTION_BY_ID[a] || {}).label || a).join(' · '))
            ])
        };
    }

    /**
     * THE CONVERSATION'S NAME — and the prompt it was cut from, WHOLE.
     *
     * ‼️ The name IS the opening prompt in nearly every session: until somebody
     * renames a conversation the transcript has no other name to give it, and it
     * is cut to a line at the source. A panel that repeated that same cut line
     * answered nothing — the reader hovers a clipped line to get the REST of it.
     * It carries the opening prompt to its full stored length and scrolls, which
     * is the entire reason this is an AFTip and not a native `title`.
     */
    function titleTip(s) {
        const first = String(s.firstPrompt || '');
        return {
            head: first
                ? `Opening prompt · ${window.AFTip.sizeNote(first)}`
                : 'What this conversation is called',
            body: (first || String(s.title || ''))
                + '\n\nThe card draws the conversation\'s NAME, which the transcript takes from'
                + ' the launch name, a rename, or this opening prompt — cut to one line.'
                + (s.transcriptPath ? '\nClick opens the transcript at the latest activity.' : '')
        };
    }

    /**
     * THE LAST THING ASKED — WHOLE, and only that.
     *
     * ‼️ Two things were wrong here and both were content, not paint.
     *
     * It carried the same 90-character cut the card had just drawn, because that
     * is all `lastPrompt` has ever been — a row's worth. Hovering a clipped line
     * therefore returned the clipped line. The whole prompt now travels beside
     * it (`lastPromptFull`, LiveSession) and the panel scrolls it.
     *
     * And it repeated the OPENING prompt under a `How it opened` head — a fact
     * the line directly ABOVE it on the same card already carries, and whose own
     * panel now carries it whole. That is ONE SUBJECT broken in the plainest way
     * there is: the same text, twice, on one card.
     */
    function promptTip(s) {
        const last = String(s.lastPromptFull || s.lastPrompt || '');
        return {
            head: `The last thing asked · ${window.AFTip.sizeNote(last)}`,
            body: last
        };
    }

    /** WHAT IT IS DOING RIGHT NOW, and why the page is entitled to say so. */
    function statusTip(s, meta, gone) {
        const silent = Date.now() - (s.lastEventTs || 0);
        const stuck = DATA.stuckMs || 0;
        return {
            head: `${meta.label}${s.currentTool ? ' · ' + s.currentTool : ''}`,
            body: figures([
                tline('State', STATUS_WORDS[s.status] || s.status),
                tline('Tool in flight', s.currentTool),
                tline('Silent for', fmtDur(silent)
                    + (stuck ? ` · marked stalled after ${fmtDur(stuck)}` : '')),
                tline('Process', gone
                    ? 'gone — the OS no longer knows it, the session just never said so'
                    : (s.owner ? `alive, pid ${s.owner.pid}` : (s.hosted ? 'hosted by the Console' : ''))),
                tline('Can be interrupted', !gone && RUNNING.indexOf(s.status) >= 0
                    ? 'yes — ⎋ Interrupt below' : 'nothing is in flight to stop')
            ])
        };
    }

    /**
     * THE MONEY LINE — cost, tokens and context, as the Sessions table answers
     * them. Three blocks, because the line is three facts joined by dots and a
     * flat list of twelve figures is the wall `panelBody` exists to prevent.
     */
    function moneyTip(s) {
        const hours = Math.max(0, Date.now() - (s.startedAt || 0)) / 3600000;
        return {
            head: 'What this conversation has cost so far',
            body: panelBody([
                [
                    tline('API-equivalent', s.cost ? C.fmtUSD(s.cost)
                        : 'not published — this engine bills a plan'),
                    tline('Cost per turn', per(s.cost, s.turns, C.fmtUSD)),
                    tline('Cost per hour', hours >= 1 ? C.fmtUSD((s.cost || 0) / hours) : ''),
                    tline('Per 1M tokens', s.cost && s.tokens
                        ? C.fmtUSD(s.cost / (s.tokens / 1000000)) : '')
                ],
                [
                    tline('Tokens (raw)', s.tokens ? C.fmtTok(s.tokens) : ''),
                    tline('Weighted against the plan', s.wTokens ? C.fmtTok(s.wTokens) : ''),
                    tline('Weight ratio', s.tokens && s.wTokens ? round1(s.wTokens / s.tokens) + '×' : ''),
                    tline('Tokens per turn', per(s.tokens, s.turns, n => C.fmtTok(Math.round(n))))
                ],
                [
                    tline('Context now', s.ctxTokens ? C.fmtTok(s.ctxTokens) + ' tokens' : ''),
                    tline('Share of the session', s.ctxTokens && s.tokens
                        ? Math.round(s.ctxTokens * 100 / s.tokens) + '%' : ''),
                    tline('Model of the last reply', s.model),
                    tline('Read from', s.transcriptPath
                        ? 'the transcript on disk' : 'nothing — no transcript this build can read')
                ]
            ])
        };
    }

    /** THE WORK LINE — what it has actually done. */
    function workTip(s) {
        return {
            head: 'What it has done in this session',
            body: figures([
                tline('Prompts', s.prompts),
                tline('Tool calls', s.toolCalls),
                tline('Tools per prompt', per(s.toolCalls, s.prompts, round1)),
                tline('Files written', s.filesEdited || ''),
                tline('Errors', s.errors
                    ? `${s.errors}${s.toolCalls ? ` (${Math.round(s.errors * 100 / s.toolCalls)}% of tool calls)` : ''}` : ''),
                tline('Compactions', s.compactions || ''),
                tline('Sub-agents finished', s.subagentStops || ''),
                tline('Turns on the transcript', s.turns || ''),
                tline('Counted from', hasHooks(s)
                    ? 'the live hook stream' : 'nothing — this CLI reports only open and close')
            ])
        };
    }

    /** THE TIME LINE — every clock in the extension carries UTC in its hover. */
    function timeTip(s) {
        const T = window.AFTime;
        return {
            head: 'When this session ran',
            body: panelBody([
                T.tip(s.startedAt, 'Started'),
                T.tip(s.lastEventTs, 'Last event'),
                [
                    tline('Running for', fmtDur(Date.now() - (s.startedAt || 0))),
                    tline('Silent for', fmtDur(Date.now() - (s.lastEventTs || 0))),
                    tline('Minutes per turn', per((Date.now() - (s.startedAt || 0)) / 60000, s.turns, round1))
                ]
            ])
        };
    }

    /* ================= U-67 — WHAT THIS PAGE SAYS WHEN YOU POINT AT IT =======
     *
     * ‼️ EVERY POINT ON A LANE IS A MOMENT IN A CONVERSATION, so every point
     * answers the same four questions in the same order and in the same words:
     *
     *      WHICH conversation — its own name, not the agent's folder
     *      WHAT was said      — the prompt, the command, the answer, whole
     *      WHERE in the talk  — turn, clock, the gap back to the point before
     *      WHAT pressing does — click and right-click, spelled out
     *
     * One shape for all of them, so the eye learns it once and then only reads
     * the part it came for. `SAID` in src/core/live.ts is why there is anything
     * to read: an event used to keep ninety characters, which is a row's worth
     * and not a panel's.
     *
     * A native `title` could carry none of this — it is TEXT, so it is AFTip's
     * (docs/CONVENTIONS.md → Hover) — and an `<svg>` cannot hold HTML, so each
     * trigger is a transparent HTML box laid over the drawing. `.chartbox svg`
     * is `width:100%; height:auto` on a viewBox, so the drawing scales with no
     * letterboxing and a percentage of the wrapper IS the SVG's own coordinate.
     * ==================================================================== */

    /** A conversation's own name, and the words for not having one yet. */
    function convName(sid) {
        const s = LIVE_BY_ID.get(sid);
        if (!s) { return `#${shortId(sid)} — no longer tracked (its events are history)`; }
        return s.title || s.label || '(not named yet — nothing said in it so far)';
    }

    /**
     * ‼️ A PANEL IS BLOCKS, NOT A LIST OF LINES. `AFTip.lines` drops empties,
     * which is right for a list of figures and wrong here: a panel that answers
     * four different questions and runs them together as one paragraph is the
     * wall this item was reopened for. Each block is its own subject and they
     * are separated by a blank line, so the eye can jump to the one it came
     * for. An empty block is dropped whole — a heading with nothing under it is
     * worse than silence.
     */
    function panelBody(blocks) {
        return (blocks || [])
            .map(b => (Array.isArray(b) ? b.filter(Boolean).join('\n') : String(b || '')).trim())
            .filter(Boolean).join('\n\n');
    }

    /** A block of quoted text under its own heading, or clean quoted text without heading. */
    function saidBlock(label, text) {
        const t = String(text || '').trim();
        return t ? (label ? `${label}\n“${t}”` : `“${t}”`) : '';
    }

    /** Where in the talk. `since` is the gap back to the previous event of the SAME session. */
    function whenLine(ts, turn, since) {
        return 'At ' + fmtClock(ts)
            + (turn ? ' · turn ' + turn : '')
            + (since ? ' · ' + fmtDur(since) + ' after previous event' : '');
    }

    const MARK_WORDS = {
        prompt: 'You wrote',
        say: 'The agent replied',
        permission: 'Waiting for permission',
        stop: 'The agent finished its turn',
        notify: 'Notification',
        compact: 'Context compacted',
        subagent: 'A subagent finished',
        start: 'Session started',
        end: 'Session ended'
    };

    /** One point on a lane: clean, direct dialog/event text without duplicate identity boilerplate. */
    function markTip(m, lane, laneEng) {
        const title = MARK_WORDS[m.kind] || m.kind;
        const head = title + ' · ' + fmtClock(m.ts);
        const bodyParts = [];
        if (m.detail) {
            bodyParts.push((m.kind === 'prompt' || m.kind === 'say' || m.kind === 'stop') ? `“${m.detail}”` : m.detail);
        }
        if (m.kind === 'stop' && m.turnMs) {
            bodyParts.push(`That turn ran ${fmtDur(m.turnMs)} and made ${m.turnTools} tool call${m.turnTools === 1 ? '' : 's'}.`);
        }
        if (m.turn || m.since) {
            bodyParts.push(whenLine(m.ts, m.turn, m.since));
        }
        if (m.tool) {
            bodyParts.push('Tool: ' + m.tool);
        }
        return {
            head: head,
            body: panelBody(bodyParts)
        };
    }

    /** One tool bar: concise execution time and target, without huge payload dumps or boilerplate. */
    function segTip(seg, lane, laneEng) {
        const timeRange = seg.unfinished
            ? `${fmtClock(seg.start)} → unfinished (no end event ever arrived)`
            : `${fmtClock(seg.start)} → ${seg.live
                ? (seg.stale ? 'stalled? last ' + fmtClock(seg.end) : 'running')
                : fmtClock(seg.end)}`;
        const head = `${seg.tool} · ${fmtDur(Math.max(1000, seg.end - seg.start))} (${timeRange})`;

        const bodyParts = [];
        if (seg.said) {
            bodyParts.push(seg.said);
        } else if (!seg.unfinished && !seg.result) {
            bodyParts.push(seg.tool);
        }
        if (seg.unfinished) {
            bodyParts.push('Status: Unfinished / in-progress (no end event ever arrived).');
        } else if (seg.result && /error|failed|stderr|exit code [1-9]/i.test(seg.result)) {
            bodyParts.push('Error: ' + seg.result);
        }

        return {
            head: head,
            body: panelBody(bodyParts)
        };
    }

    /**
     * The row's own panel — the label in the gutter. It is the SESSION's identity card.
     * Full initial prompt (session purpose), session identity, economics, live status.
     */
    function laneTip(lane, primary, laneEng) {
        const sid = primary && primary.id;
        const s = sid ? LIVE_BY_ID.get(sid) : null;
        const meta = s ? (STATUS_META[s.status] || STATUS_META.idle) : null;
        const more = lane.sessions.length - 1;

        const identBlock = [
            'Conversation: ' + convName(sid),
            'Agent: ' + (lane.anon ? lane.who : lane.agent)
                + ' · ' + window.AFEngine.label(laneEng)
                + (s && s.model ? ' · ' + String(s.model).replace(/^claude-/, '') : ''),
            'Session: ' + shortId(sid) + (meta ? ' · ' + meta.label : '')
                + (s && s.projectId ? ' · Project: ' + s.projectId : ''),
            s && s.cwd ? 'Folder: ' + s.cwd : ''
        ];

        let purposeBlock = '';
        if (s && s.firstPrompt) {
            purposeBlock = saidBlock('Opening prompt (purpose):', s.firstPrompt);
        } else if (s && s.lastPrompt && s.lastPrompt !== s.title) {
            purposeBlock = saidBlock('On right now:', s.lastPrompt);
        }

        const st = s ? statLines(s, true) : null;
        const statsBlock = st ? [
            st.money,
            st.work,
            st.time,
            s.currentTool ? 'Inside a tool: ' + s.currentTool : '',
            isGone(s)
                ? 'No live process — this session is over (Clear it below).'
                : (s.owner ? `pid ${s.owner.pid}${s.owner.entrypoint === 'sdk-cli' ? ' (Console/headless)' : ' (terminal)'}` : '')
        ] : [];

        const packingBlock = more > 0
            ? `This row is ${lane.sessions.length} sessions packed in sequence — they never overlap, so they share a track. The head above is the newest of them; every bar and dot answers for its own.`
            : (lane.anon ? 'The row is labelled by its session id because the folder it runs in is not one of your agent folders.' : '');

        return {
            head: convName(sid)
                + (more > 0 ? ` · +${more} earlier session${more > 1 ? 's' : ''} on this row` : ''),
            body: panelBody([
                identBlock,
                purposeBlock,
                statsBlock,
                packingBlock
            ])
        };
    }

    /**
     * A transparent trigger laid over the drawing, carrying a panel — and, for
     * the ones that name a session, that session's click and right-click too.
     * `box` is in PERCENT of the chart, which is the SVG's own coordinate.
     *
     * ‼️ THE BOX IS THE WRAPPER'S, not the trigger's: `tip-free` measures the
     * panel against the WRAPPER (afTip.js `place`), so a wrapper collapsed to
     * nothing would open the panel in the corner of the page.
     */
    function hotHtml(box, tip, o) {
        const attrs = `style="left:${box.left.toFixed(3)}%;width:${box.width.toFixed(3)}%;`
            + `top:${box.top.toFixed(3)}%;height:${box.height.toFixed(3)}%;`
            + `cursor:${o.cursor || (o.file ? 'pointer' : 'default')}"`;
        // ‼️ A-23 — A HOT BOX CAN CARRY A CONTROL, not only a hover. The gutter's
        // ♪ is drawn in SVG and answered in HTML like everything else here
        // (U-67), and the box that answers for it has to BE the control too:
        // two elements, one over the other, would sooner or later disagree
        // about which session was clicked. `trigCls`/`trigAttrs` put the shared
        // `.af-toggle` handler's own class and data on the box.
        const trigger = `<span class="lane-hot mark${o.trigCls ? ' ' + o.trigCls : ''}"`
            + ` data-file="${C.esc(o.file || '')}"`
            + ` data-ts="${o.ts || 0}" ${o.ctx || ''}${o.trigAttrs ? ' ' + o.trigAttrs : ''}`
            + ` role="${o.role || 'button'}" aria-label="${C.esc(o.label)}"></span>`;
        return window.AFTip.wrap(trigger, tip.head, tip.body,
            'tip-free lane-hotw' + (o.cls ? ' ' + o.cls : ''), attrs);
    }

    // One row per CONCURRENT session: each agent's sessions are packed into
    // tracks — sessions that overlap in time get separate rows ("dev #1",
    // "dev #2"), sequential ones share a row, so two open sessions of the same
    // agent no longer draw on top of each other.
    function buildLanes(events, now, winMs) {
        const from = now - winMs;
        const bySession = new Map(); // sessionId -> {id, agent, first, last, live, segments, marks}
        const open = new Map();      // sessionId -> {start, tool, file}
        // Lane keys that are a session id rather than an agent name — the
        // session's folder is not one of the agent folders, so the hook stream
        // never learned a name for it. Shown as "#3f8a1c2b", not as an agent.
        const unresolved = new Set();

        const sessOf = (id, agent, ts) => {
            let s = bySession.get(id);
            if (!s) {
                s = {
                    id, agent, first: ts, last: ts, live: false, segments: [], marks: [], file: '',
                    // ‼️ U-67 — WHERE IN THE CONVERSATION THIS POINT FELL. A dot
                    // on a chart is a moment, and a moment nobody can place in
                    // the talk around it is trivia. Counted here because the
                    // stream is already being walked in order: `turn` steps on
                    // every prompt, `turnStart`/`turnTools` are what the turn
                    // has cost so far, and `lastAny` gives every point the gap
                    // back to the one before it.
                    turn: 0, turnStart: 0, turnTools: 0, lastAny: 0
                };
                bySession.set(id, s);
            }
            s.first = Math.min(s.first, ts);
            s.last = Math.max(s.last, ts);
            return s;
        };

        // Live sessions always get a row, stretched to "now" so concurrent ones
        // can never share a track even while quiet. Follows the engine
        // selection: a filtered page must not keep drawing the rows it hid.
        for (const ls of (engineSel === 'all'
            ? DATA.sessions : DATA.sessions.filter(x => engineOf(x) === engineSel))) {
            const s = sessOf(ls.sessionId, ls.agentName, ls.startedAt || now);
            s.last = now;
            s.live = true;
            if (ls.transcriptPath) { s.file = ls.transcriptPath; }
            if (ls.resolved === false) { unresolved.add(ls.agentName); }
        }

        for (const e of events) {
            if (!e.agentName) { unresolved.add(e.sessionId.slice(0, 8)); }
            const s = sessOf(e.sessionId, e.agentName || e.sessionId.slice(0, 8), e.ts);
            if (e.transcriptPath) { s.file = e.transcriptPath; }
            const since = s.lastAny ? e.ts - s.lastAny : 0;
            s.lastAny = e.ts;
            if (e.kind === 'prompt') { s.turn++; s.turnStart = e.ts; s.turnTools = 0; }
            if (e.kind === 'toolStart') {
                s.turnTools++;
                open.set(e.sessionId, {
                    start: e.ts, tool: e.tool || '?', file: e.transcriptPath || '',
                    detail: e.detail || '', turn: s.turn
                });
            } else if (e.kind === 'toolEnd') {
                const o = open.get(e.sessionId);
                if (o) {
                    open.delete(e.sessionId);
                    if (e.ts >= from) {
                        s.segments.push({
                            start: Math.max(o.start, from), end: e.ts, tool: o.tool, file: o.file,
                            // What it was asked for and what it answered. The
                            // answer only exists on the closing event, which is
                            // the one event a bar is built out of two of.
                            sid: s.id, turn: o.turn, said: o.detail, result: e.detail || ''
                        });
                    }
                }
            } else if (e.ts >= from) {
                s.marks.push({
                    ts: e.ts, kind: e.kind, detail: e.detail || '', tool: e.tool || '',
                    file: e.transcriptPath || '', sid: s.id, turn: s.turn, since,
                    // A turn's own arithmetic, and only on the event that closes
                    // one: how long it ran and how much work it took.
                    turnMs: e.kind === 'stop' && s.turnStart ? e.ts - s.turnStart : 0,
                    turnTools: e.kind === 'stop' ? s.turnTools : 0
                });
            }
        }
        // A tool call with no end event. It only keeps GROWING while its session
        // is still on it: before, any unmatched toolStart was drawn to "now"
        // forever, so a single lost PostToolUse — a closed terminal, a crash, a
        // killed process — left a green bar running across the page on a session
        // that had been over for hours. Now the bar stops where the session's
        // last event actually landed and is drawn as the open question it is.
        for (const [sid, o] of open) {
            const s = bySession.get(sid);
            if (!s) { continue; }
            const ls = LIVE_BY_ID.get(sid);
            // "Still on it" is the session's own claim: currentTool is set by
            // PreToolUse and cleared by PostToolUse / Stop / SessionEnd, so it
            // is exactly "this session believes it is inside a tool right now".
            const busy = !!ls && !!ls.currentTool && (ls.status === 'tool' || ls.status === 'stalled');
            const end = busy ? now : Math.max(o.start, ls ? ls.lastEventTs : s.last);
            s.segments.push({
                start: Math.max(o.start, from), end, tool: o.tool, file: o.file,
                sid: s.id, turn: o.turn, said: o.detail, result: '',
                live: busy,
                stale: busy && ls.status === 'stalled',
                unfinished: !busy
            });
            if (busy) { s.last = now; }
        }

        // Group visible sessions per agent (keep first-seen agent order), then
        // pack each agent's sessions into tracks: reuse a track only when the
        // previous session on it ended before this one starts.
        const byAgent = new Map();
        for (const s of bySession.values()) {
            if (!s.live && s.last < from) { continue; } // nothing to show in range
            if (!byAgent.has(s.agent)) { byAgent.set(s.agent, []); }
            byAgent.get(s.agent).push(s);
        }
        const lanes = [];
        for (const [agent, list] of byAgent) {
            list.sort((a, b) => a.first - b.first);
            const tracks = [];
            for (const s of list) {
                let t = tracks.find(tr => tr.end <= s.first);
                if (!t) { t = { end: 0, segments: [], marks: [], sessions: [], file: '' }; tracks.push(t); }
                t.end = Math.max(t.end, s.last);
                t.segments.push(...s.segments);
                t.marks.push(...s.marks);
                // Each session keeps its own span on the row: a packed track
                // holds several, and a right-click must land on the one under
                // the pointer, not on whichever happens to be first.
                t.sessions.push({ id: s.id, first: s.first, last: s.last, live: s.live });
                if (s.file) { t.file = s.file; }
            }
            const anon = unresolved.has(agent);
            // A row nobody can name is labelled by what it IS: a session id.
            const who = anon ? '#' + agent : agent;
            tracks.forEach((t, i) => lanes.push({
                agent,
                who,
                name: who + (tracks.length > 1 ? ` #${i + 1}` : ''),
                anon,
                // How many rows this agent has here — the label's `#k` comes
                // from it. The YOUR TURN controls do NOT: those belong to the
                // session each row draws (U-66).
                rowsOfAgent: tracks.length,
                segments: t.segments,
                marks: t.marks,
                // Which session(s) this row is drawing — the row's tooltip, its
                // click and its right-click menu all need to know.
                sessions: t.sessions,
                file: t.file
            }));
        }
        return lanes;
    }

    const MARK_STYLE = {
        prompt:     { color: 'var(--vscode-charts-blue, #3794ff)',   shape: 'circle',  label: 'prompt' },
        // ‼️ U-78 — A REPLY IS THE PROMPT'S OWN COLOUR, HOLLOW. It was green,
        // which is what a TOOL is on this page (the bars above the axis, the
        // tool badge, the running segment) — two different subjects in one
        // colour, and a legend with two entries nobody could tell apart. A
        // tenth hue was not the answer either: the theme publishes eight chart
        // colours and all eight are spoken for, so a literal would have been a
        // colour that reads on one theme and not the other. A reply is the
        // other side of a PROMPT, so it is the SAME blue and the opposite
        // fill: one conversation, two directions, legible on any theme.
        say:        { color: 'var(--vscode-charts-blue, #3794ff)',   shape: 'ring',    label: 'agent reply' },
        permission: { color: 'var(--vscode-charts-red, #f14c4c)',    shape: 'diamond', label: 'permission wait' },
        stop:       { color: 'var(--vscode-charts-foreground, #ccc)',shape: 'tick',    label: 'turn end' },
        notify:     { color: 'var(--vscode-charts-yellow, #cca700)', shape: 'circle',  label: 'notification' },
        compact:    { color: 'var(--vscode-charts-purple, #b180d7)', shape: 'diamond', label: 'compaction' },
        subagent:   { color: 'var(--vscode-charts-orange, #d18616)', shape: 'circle',  label: 'subagent done' },
        start:      { color: '#0000FF',                              shape: 'tick',    label: 'session start' },
        end:        { color: 'var(--vscode-descriptionForeground, #999)', shape: 'tick', label: 'session end' }
    };

    function lanesSvg(lanes, now, winMs) {
        if (!lanes.length) { return '<p class="muted">No lanes yet.</p>'; }
        // ‼️ U-53 — THE GUTTER IS THREE LINES NOW: the agent's name, the SESSION
        // the row is drawing, and the YOUR-TURN toggles. The middle one is new
        // and it is the one that was missing: "developer #2" says which of an
        // agent's rows you are on but not which conversation, so the id had to
        // be fished out of a hover on every glance — on the one page whose whole
        // job is watching several sessions at once. Four more pixels of row for
        // the fact the page is about.
        const W = 900, labelW = 100, rowH = 50, padT = 22;
        const H = padT + lanes.length * rowH + 10;
        const from = now - winMs;
        const x = ts => labelW + ((ts - from) / winMs) * (W - labelW - 8);
        let out = '';
        /** U-67 — the HTML hover/click boxes laid over the SVG gutter. */
        const hots = [];

        // time grid: 6 ticks
        for (let i = 0; i <= 6; i++) {
            const ts = from + (winMs / 6) * i;
            const xx = x(ts);
            out += `<line x1="${xx}" y1="${padT - 6}" x2="${xx}" y2="${H - 6}" stroke="currentColor" opacity="0.07"/>` +
                `<text x="${xx}" y="${padT - 10}" font-size="9" text-anchor="middle" fill="currentColor" opacity="0.55">${fmtClock(ts)}</text>`;
        }

        lanes.forEach((lane, i) => {
            const y = padT + i * rowH;
            const name = lane.name;
            // Gutter: row label on top, the agent-default YOUR-TURN toggles
            // (♪ ◎ ▣ ▭) under it — on EVERY row. They used to be drawn only on the
            // agent's first row, on the reasoning that one setting should not appear
            // twice; what that actually produced was a second row that looked broken,
            // and the row you were watching was as often as not the one without any
            // controls. One setting shown in both of its places is the lesser evil,
            // and the tooltip on a repeated row says which it is.
            // The label is not decoration: hovering it tells you everything about
            // the session behind the row (id, status, cost, tokens, turns, where
            // it runs), and clicking opens that session's transcript.
            // The row's "current" session: the live one, else the last it drew.
            const primary = lane.sessions.filter(s => LIVE_BY_ID.has(s.id)).pop() ||
                lane.sessions[lane.sessions.length - 1];
            // ‼️ THE LABEL IS BOTH. It is the row's session (the card below is
            // about it) and it is the AGENT — its name is literally what is
            // written there. `afTimelineAgent` is in both families in
            // src/core/ctxmenu.ts, so one right-click on the name offers the
            // session's actions AND everything the agent can be asked to do.
            // Nothing was taken away: the session half is exactly what it was.
            // ‼️ …AND WHICH ENGINE THE ROW RAN ON (X-35). A gutter that says only
            // "developer #1 / developer #2" is at its least readable in exactly
            // the case the split exists for: one agent running two engines at
            // once. There is no room for a badge here, so the row wears the
            // engine's own colour as a dot — the same hue the card's badge
            // carries, out of the same palette (`--af-engc`, common.css), so the
            // two cannot disagree. Drawn for every engine including Claude: a row
            // with no mark is indistinguishable from a page that never learned.
            const laneEng = window.AFEngine.id(LIVE_BY_ID.get(primary.id)
                && LIVE_BY_ID.get(primary.id).source);
            // ‼️ U-53 — WHICH SESSION, WRITTEN DOWN, UNDER THE NAME. An anon row
            // is already labelled by its own id (`#3f8a1c2b`), so it gets no
            // second line saying the same thing — a repeated fact is not
            // information. A packed track holds several sessions in sequence and
            // says so (`+2`) rather than naming one of them and implying it is
            // the row: the id shown is the row's CURRENT session, the same one
            // its click and its right-click act on.
            // ‼️ A LIVE SESSION MAY NOT HAVE AN ID YET. On a per-turn engine the
            // id is the CLI's own conversation id and does not exist until a
            // turn has run, so a row can be drawn before its session is named.
            // Say that rather than print `(undefined)` — those need different
            // reactions, and one of them is "wait".
            const more = lane.sessions.length - 1;
            const sid = String((primary && primary.id) || '');
            const sidLine = lane.anon ? ''
                : sid ? `(${sid.slice(0, 8)})${more > 0 ? ` +${more}` : ''}`
                    : '(not named yet)';
            // ‼️ U-67 — THE GUTTER IS DRAWN IN SVG AND ANSWERED IN HTML.
            //
            // The label carried a native `<title>`, which is the wrong surface
            // twice over: what a row has to say is TEXT (a session's name, the
            // prompt it is on, where it runs) and a platform tooltip repeats
            // what is already on the row and then stops wherever it likes — the
            // rule docs/CONVENTIONS.md → Hover exists for. `AFTip` is HTML and
            // an `<svg>` cannot hold HTML, so the trigger is a transparent HTML
            // box laid over the gutter: the `.chartbox svg` rule is
            // `width:100%; height:auto` on a viewBox, so the drawing scales with
            // no letterboxing and a percentage of the wrapper IS the SVG's own
            // coordinate. The box carries the row's click and its right-click
            // too — one element answering for the label rather than two that
            // can disagree about which session they mean.
            out += `<g class="lanelabel">` +
                `<circle class="${C.esc(window.AFEngine.cls(laneEng))}" cx="7.5" cy="${y + 10}" r="3.5"` +
                ` fill="var(--af-engc, currentColor)" opacity="0.95"/>` +
                `<text x="16" y="${y + 13}" font-size="11" font-weight="600" text-anchor="start" fill="currentColor" opacity="0.85">${C.esc(name.length > 13 ? name.slice(0, 12) + '…' : name)}</text>` +
                (sidLine
                    ? `<text class="lane-sid" x="16" y="${y + 24}" font-size="9.5" text-anchor="start" fill="currentColor" opacity="0.55">${C.esc(sidLine)}</text>`
                    : '') + '</g>';
            hots.push(hotHtml(
                { left: 0, top: ((y - 2) / H) * 100, height: (30 / H) * 100, width: (labelW / W) * 100 },
                laneTip(lane, primary, laneEng),
                {
                    file: lane.file, ts: 0,
                    ctx: laneCtx(primary && primary.id, lane.agent, 'afTimelineAgent'),
                    label: lane.name + ' — what this row is'
                }));
            // ‼️ THE CONTROLS BELONG TO THIS ROW'S SESSION AND TO NOTHING ELSE
            // (U-66). They used to carry `data-agent`, so an agent with three
            // concurrent rows showed one setting three times and a click on any
            // of them changed all three — on the page whose entire subject is
            // watching several sessions at once. Each row now patches
            // `sessionAlerts[<its own id>]`, and there is no agent-wide layer
            // left underneath: a row with nothing selected alerts on nothing.
            //
            // A row that no longer carries a LIVE session (a packed historical
            // track, or a lane whose per-turn engine has not named its
            // conversation yet) shows the controls disabled rather than letting
            // an alert be armed on a conversation that is over.
            const ty = y + 28;
            const armable = !!(sid && LIVE_BY_ID.has(sid));
            const selected = armable ? actionsFor(sid) : [];
            const why = !sid
                ? 'This row\'s engine has not named its conversation yet — alerts are set per session, so there is nothing to set them on until it does.'
                : 'This row is history: no live session is tracked under this id any more, so an alert here could never fire.';
            TURN_ACTIONS.forEach((a, ai) => {
                const gx = 4 + ai * 18;
                const on = selected.indexOf(a.id) !== -1;
                const tip = armable
                    ? `${a.label} — fires when THIS session (${sid.slice(0, 8)}) hits YOUR TURN.`
                        + `\nCurrently: ${on ? 'ON' : 'off'}.`
                        + `\n\nEvery row on this page is one session and carries its own four choices; nothing here is shared with the agent's other sessions.`
                    : `${a.label} — unavailable.\n\n${why}`;
                // ‼️ A-23 — THE ♪ IS THE ONE THAT GREW TEXT, so it is the one
                // that moves to an AFTip (docs/CONVENTIONS.md → the two hover
                // surfaces). The other three are booleans and a native `title`
                // is the right size for a boolean; ♪ has to say WHICH TONE and
                // WHY that one, which is prose and grows. Drawn in SVG,
                // answered in HTML, exactly as the gutter's label already is —
                // and the box IS the control, so the two cannot disagree about
                // which session was clicked.
                const body = a.id === 'sound' && armable ? soundTip(sid, on) : '';
                if (body) {
                    hots.push(hotHtml(
                        {
                            left: ((gx - 1) / W) * 100, width: (17 / W) * 100,
                            top: ((ty - 1) / H) * 100, height: (17 / H) * 100
                        },
                        {
                            head: `${a.label} — ${lane.who || lane.agent} (#${sid.slice(0, 8)}) · ${on ? 'ON' : 'off'}`,
                            body
                        },
                        {
                            file: '', ts: 0, cursor: 'pointer',
                            trigCls: 'af-toggle',
                            // `data-aftipact` marks it PRESSABLE, so the panel
                            // yields to the hand on the click (U-74) instead of
                            // sitting over the box that was just toggled.
                            trigAttrs: `data-session="${C.esc(sid)}" data-action="${a.id}"`
                                + ' data-aftipact="1" aria-hidden="true"',
                            // ‼️ THE BOX IS FOR THE POINTER, AND SAYS SO. The
                            // checkbox a screen reader finds is the `<g>` under
                            // it, which keeps its role, its state and its click
                            // handler — announcing one control twice is worse
                            // than announcing the drawing.
                            role: 'presentation',
                            label: ''
                        }));
                }
                out += `<g class="af-toggle" role="checkbox" aria-checked="${on ? 'true' : 'false'}"`
                    + ` aria-label="${C.esc(a.label + ' — ' + (lane.who || lane.agent))}"`
                    + ` data-session="${C.esc(sid)}" data-action="${a.id}"`
                    + `${armable ? '' : ' data-disabled="1"'}`
                    + ` style="cursor:${armable ? 'pointer' : 'not-allowed'};opacity:${armable ? '1' : '0.32'}">` +
                    `<rect x="${gx}" y="${ty}" width="15" height="15" rx="3" fill="${on ? 'var(--vscode-charts-blue, #3794ff)' : 'transparent'}" stroke="${on ? 'var(--vscode-charts-blue, #3794ff)' : 'currentColor'}" stroke-opacity="${on ? '1' : '0.45'}" opacity="${on ? '0.95' : '1'}"/>` +
                    `<text x="${gx + 7.5}" y="${ty + 11.5}" font-size="10.5" text-anchor="middle" fill="${on ? 'var(--vscode-editor-background, #fff)' : 'currentColor'}" opacity="${on ? '1' : '0.55'}" style="pointer-events:none">${a.glyph}</text>` +
                    // ‼️ SELECTED IS NOT ONLY A FILL. A hover leaves a fill
                    // behind on some themes and the row then lies about what is
                    // armed, so a checked control also wears a tick of its own.
                    (on ? `<path d="M${gx + 11.2} ${ty + 1.6} l1.5 1.6 l2.6 -2.9" fill="none" stroke="var(--vscode-charts-green, #4caf50)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none"/>` : '') +
                    // The AFTip box above answers for ♪; a native title left
                    // underneath it would be a second, shorter, staler answer to
                    // the same hover.
                    (body ? '' : `<title>${C.esc(tip)}</title>`) + '</g>';
            });
            // ‼️ AND A WAY TO PROVE IT WORKS. Four alerts that only ever fire
            // when an agent happens to finish are four alerts nobody can debug:
            // the reported bug was "the sound does nothing", and there was no
            // way to ask. This runs THIS row's selection on purpose, after a
            // countdown long enough to leave the window — and the strip under
            // the chart says what each branch actually did.
            {
                const gx = 4 + TURN_ACTIONS.length * 18;
                const can = armable && selected.length > 0;
                const tip = !armable ? `Test the alerts — unavailable.\n\n${why}`
                    : !selected.length
                        ? 'Test the alerts — nothing is selected on this row yet, so there is nothing to test.'
                        : `Test the alerts of THIS session (${sid.slice(0, 8)}) in 3 seconds: ${selected.join(' · ')}.`
                            + `\nAs: ${eventName(testEvent)}${(voiceFor(sid, testEvent) || {}).label
                                ? ' — ' + voiceFor(sid, testEvent).label : ''} (the picker is above the chart).`
                            + '\n\nThe countdown is long enough to switch to another window, which is the only way to see whether focus really came back. The result appears under the chart, branch by branch.';
                out += `<g class="af-alerttest" data-session="${C.esc(sid)}"`
                    + `${can ? '' : ' data-disabled="1"'}`
                    + ` role="button" aria-label="Test this session's alerts in 3 seconds"`
                    + ` style="cursor:${can ? 'pointer' : 'not-allowed'};opacity:${can ? '1' : '0.32'}">` +
                    `<rect x="${gx}" y="${ty}" width="15" height="15" rx="3" fill="transparent" stroke="currentColor" stroke-opacity="0.45"/>` +
                    `<text x="${gx + 7.5}" y="${ty + 11.5}" font-size="10" text-anchor="middle" fill="currentColor" opacity="0.6" style="pointer-events:none">⏱</text>` +
                    `<title>${C.esc(tip)}</title></g>`;
            }
            out += `<line x1="${labelW}" y1="${y + rowH / 2}" x2="${W - 8}" y2="${y + rowH / 2}" stroke="currentColor" opacity="0.1"/>`;
            // Right-click targets, laid down BEFORE the bars and dots so those
            // keep their own left-click. The whole row answers (with the row's
            // current session), and each session's own span answers for itself.
            out += `<rect x="${labelW}" y="${y + 2}" width="${W - labelW - 8}" height="${rowH - 4}" fill="transparent" ${laneCtx(primary.id, lane.agent)}/>`;
            for (const s of lane.sessions) {
                if (s.id === primary.id || s.last < from) { continue; }
                const sx1 = x(Math.max(s.first, from)), sx2 = Math.max(x(Math.min(s.last, now)), sx1 + 4);
                out += `<rect x="${sx1.toFixed(1)}" y="${y + 2}" width="${(sx2 - sx1).toFixed(1)}" height="${rowH - 4}" fill="transparent" ${laneCtx(s.id, lane.agent)}/>`;
            }
            // ‼️ X-41 — A MARK BELONGS TO ITS LANE'S SESSION, so that is where
            // its file comes from when the EVENT could not carry one. Only
            // Claude's hooks put a transcript path on every event; a Console
            // conversation on any other engine is mirrored into the monitor from
            // a thread id and a cwd, so its bars and marks arrived here with an
            // empty path while the lane label — fed from the session, which the
            // host now resolves against the record — had the right one. Clicking
            // the line did nothing, which is exactly what was reported. The
            // path does not change inside a session, so the lane's own is not a
            // guess: it is the same file, said once instead of on every event.
            const fileOf = f => f || lane.file || '';
            for (const seg of lane.segments) {
                const x1 = x(seg.start), x2 = Math.max(x(seg.end), x1 + 2);
                // A tool whose end never arrived is drawn hollow and dashed —
                // it must not look like work still being done.
                const style = seg.unfinished
                    ? 'fill="none" stroke="var(--vscode-charts-green, #4caf50)" stroke-width="1.2" stroke-dasharray="3 2" opacity="0.7"'
                    : `fill="var(--vscode-charts-green, #4caf50)" opacity="${seg.stale ? 0.6 : seg.live ? 0.95 : 0.55}"`;
                out += `<rect x="${x1.toFixed(1)}" y="${y + rowH / 2 - 7}" width="${(x2 - x1).toFixed(1)}" height="14" rx="3" ${style}/>`;
                // ‼️ U-67 — THE BAR IS DRAWN IN SVG AND ANSWERED IN HTML. The
                // hover box is also the click and the right-click, so a bar
                // cannot disagree with its own panel about which session it is.
                hots.push(hotHtml(
                    {
                        left: (x1 / W) * 100, width: (Math.max(x2 - x1, 5) / W) * 100,
                        top: ((y + rowH / 2 - 8) / H) * 100, height: (16 / H) * 100
                    },
                    segTip(seg, lane, laneEng),
                    {
                        file: fileOf(seg.file), ts: seg.start,
                        ctx: laneCtx(seg.sid, lane.agent, '',
                            { file: fileOf(seg.file), ts: seg.start }),
                        label: `${seg.tool} at ${fmtClock(seg.start)}`
                    }));
            }
            for (const m of lane.marks) {
                const st = MARK_STYLE[m.kind] || MARK_STYLE.notify;
                const mx = x(m.ts), my = y + rowH / 2;
                if (st.shape === 'diamond') {
                    out += `<path d="M ${mx} ${my - 6} L ${mx + 5} ${my} L ${mx} ${my + 6} L ${mx - 5} ${my} Z" fill="${st.color}"/>`;
                } else if (st.shape === 'tick') {
                    out += `<line x1="${mx}" y1="${my - 8}" x2="${mx}" y2="${my + 8}" stroke="${st.color}" stroke-width="2"/>`;
                } else if (st.shape === 'ring') {
                    // The same dot, unfilled — a reply against its prompt.
                    out += `<circle cx="${mx}" cy="${my}" r="3.6" fill="none" stroke="${st.color}" stroke-width="2"/>`;
                } else {
                    out += `<circle cx="${mx}" cy="${my}" r="4.2" fill="${st.color}"/>`;
                }
                // A dot is 8px across and a moment is worth reading, so the box
                // that answers for it is wider than the dot is drawn.
                hots.push(hotHtml(
                    {
                        left: ((mx - 6) / W) * 100, width: (12 / W) * 100,
                        top: ((my - 9) / H) * 100, height: (18 / H) * 100
                    },
                    markTip(m, lane, laneEng),
                    {
                        file: fileOf(m.file), ts: m.ts,
                        ctx: laneCtx(m.sid, lane.agent, '', { file: fileOf(m.file), ts: m.ts }),
                        label: `${st.label} at ${fmtClock(m.ts)}`, cls: 'lane-dot'
                    }));
            }
        });

        // now line
        out += `<line x1="${x(now)}" y1="${padT - 4}" x2="${x(now)}" y2="${H - 6}" stroke="var(--vscode-charts-red, #f14c4c)" stroke-width="1.5" opacity="0.8"/>`;
        // ‼️ U-67 — the gutter's hover/click boxes ride OVER the drawing, in a
        // relatively positioned wrapper, so their percentages resolve against
        // exactly the box the SVG was scaled into.
        return `<div class="lanes-wrap"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${out}</svg>`
            + hots.join('') + '</div>';
    }

    // Density view: per-lane bucket bars (tools green + prompts blue stacked,
    // sqrt scale) with red alert ticks — patterns over dots at day+ zoom.
    function densitySvg(density, winMs) {
        const lanes = (density && density.lanes) || [];
        if (!lanes.length || !density.totalEvents) {
            return '<p class="muted">No recorded events in this range. History accumulates while hooks are installed (from v2.13.0 on, it survives reloads).</p>';
        }
        const W = 900, labelW = 110, rowH = 44, padT = 22, barMax = rowH - 14;
        const names = lanes.map(l => l.name);
        const H = padT + names.length * rowH + 12;
        const from = density.from;
        const x = i => labelW + (i / lanes[0].buckets.length) * (W - labelW - 8);
        const bw = Math.max(1.5, (W - labelW - 8) / lanes[0].buckets.length - 0.6);
        let maxTotal = 1;
        for (const l of lanes) {
            for (const b of l.buckets) { maxTotal = Math.max(maxTotal, b[0] + b[1] + b[3]); }
        }
        let out = '';
        for (let i = 0; i <= 6; i++) {
            const ts = from + (winMs / 6) * i;
            const xx = labelW + ((W - labelW - 8) / 6) * i;
            out += `<line x1="${xx}" y1="${padT - 6}" x2="${xx}" y2="${H - 6}" stroke="currentColor" opacity="0.07"/>` +
                `<text x="${xx}" y="${padT - 10}" font-size="9" text-anchor="middle" fill="currentColor" opacity="0.55">${fmtTick(ts, winMs)}</text>`;
        }
        lanes.forEach((lane, li) => {
            const y0 = padT + li * rowH + rowH - 6; // baseline
            out += `<text x="${labelW - 10}" y="${padT + li * rowH + rowH / 2 + 3}" font-size="11" font-weight="600" text-anchor="end" fill="currentColor" opacity="0.85">${C.esc(lane.name.length > 14 ? lane.name.slice(0, 13) + '…' : lane.name)}</text>`;
            out += `<line x1="${labelW}" y1="${y0}" x2="${W - 8}" y2="${y0}" stroke="currentColor" opacity="0.12"/>`;
            lane.buckets.forEach((b, bi) => {
                const total = b[0] + b[1] + b[3];
                if (!total && !b[2]) { return; }
                const bx = x(bi);
                const h = Math.max(2, Math.sqrt(total / maxTotal) * barMax);
                const hTools = total ? h * ((b[0] + b[3]) / total) : 0;
                const hPrompts = h - hTools;
                const t0 = from + bi * density.bucketMs;
                const tip = `<title>${fmtTick(t0, winMs)} – ${fmtTick(t0 + density.bucketMs, winMs)}\n${b[0]} tool · ${b[1]} prompt · ${b[2]} permission · ${b[3]} other</title>`;
                if (hTools > 0) {
                    out += `<rect x="${bx.toFixed(1)}" y="${(y0 - hTools).toFixed(1)}" width="${bw.toFixed(1)}" height="${hTools.toFixed(1)}" fill="var(--vscode-charts-green, #4caf50)" opacity="0.75">${tip}</rect>`;
                }
                if (hPrompts > 0) {
                    out += `<rect x="${bx.toFixed(1)}" y="${(y0 - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${hPrompts.toFixed(1)}" fill="var(--vscode-charts-blue, #3794ff)" opacity="0.85">${tip}</rect>`;
                }
                if (b[2] > 0) {
                    out += `<rect x="${bx.toFixed(1)}" y="${(padT + li * rowH + 2).toFixed(1)}" width="${bw.toFixed(1)}" height="4" fill="var(--vscode-charts-red, #f14c4c)">${tip}</rect>`;
                }
            });
        });
        return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${out}</svg>`;
    }

    const RUN_COLORS = {
        done: 'var(--vscode-charts-green, #4caf50)',
        running: 'var(--vscode-charts-blue, #3794ff)',
        failed: 'var(--vscode-charts-red, #f14c4c)',
        queued: 'var(--vscode-descriptionForeground, #999)',
        cancelled: 'var(--vscode-descriptionForeground, #999)'
    };

    function workflowRunsSvg(runs, now, winMs) {
        const visible = runs.filter(r => r.steps.some(s =>
            (s.endedAt || now) >= now - winMs));
        if (!visible.length) { return ''; }
        const W = 900, labelW = 150, rowH = 34, padT = 8;
        const H = padT + visible.length * rowH + 6;
        const from = now - winMs;
        const x = ts => labelW + ((Math.max(ts, from) - from) / winMs) * (W - labelW - 8);
        let out = '';
        visible.forEach((run, i) => {
            const y = padT + i * rowH;
            out += `<text x="${labelW - 10}" y="${y + rowH / 2 + 3}" font-size="11" font-weight="600" text-anchor="end" fill="currentColor" opacity="0.85">${C.esc(run.title.length > 18 ? run.title.slice(0, 17) + '…' : run.title)}</text>`;
            out += `<line x1="${labelW}" y1="${y + rowH / 2}" x2="${W - 8}" y2="${y + rowH / 2}" stroke="currentColor" opacity="0.1"/>`;
            run.steps.forEach((s, si) => {
                if (!s.startedAt) return;
                const end = s.endedAt || now;
                if (end < from) return;
                const x1 = x(s.startedAt), x2 = Math.max(x(end), x1 + 3);
                const color = RUN_COLORS[s.status] || RUN_COLORS.queued;
                out += `<rect x="${x1.toFixed(1)}" y="${y + rowH / 2 - 8}" width="${(x2 - x1).toFixed(1)}" height="16" rx="3" fill="${color}" opacity="${s.status === 'running' ? 0.95 : 0.65}">` +
                    `<title>${C.esc(s.title)} — ${C.esc(s.agentName)} (${s.status})\n${fmtClock(s.startedAt)} → ${s.endedAt ? fmtClock(s.endedAt) : 'running'}</title></rect>`;
                out += `<text x="${(x1 + 3).toFixed(1)}" y="${y + rowH / 2 + 4}" font-size="9" fill="var(--vscode-editor-background, #000)" opacity="0.9">${si + 1}</text>`;
            });
        });
        out += `<line x1="${x(now)}" y1="${padT}" x2="${x(now)}" y2="${H - 4}" stroke="var(--vscode-charts-red, #f14c4c)" stroke-width="1.5" opacity="0.8"/>`;
        return `<h2>Workflow runs</h2><div class="card chartbox"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${out}</svg>` +
            `<div class="legend"><span><i style="background:${RUN_COLORS.done}"></i>done</span><span><i style="background:${RUN_COLORS.running}"></i>running</span><span><i style="background:${RUN_COLORS.failed}"></i>failed</span></div></div>`;
    }

    function render() {
        const now = Date.now();
        const winMs = windowMin * 60000;
        const listener = DATA.listener;
        LIVE_BY_ID = new Map((DATA.sessions || []).map(s => [s.sessionId, s]));

        let listenerHtml;
        if (listener.state === 'listening') {
            listenerHtml = `<span class="badge" style="color:var(--vscode-charts-green,#4caf50);border-color:var(--vscode-charts-green,#4caf50)">● listening on 127.0.0.1:${listener.port}</span>`;
        } else if (listener.state === 'port-in-use') {
            listenerHtml = `<span class="badge err">port in use — another window may own the listener</span>`;
        } else if (listener.state === 'disabled') {
            listenerHtml = `<span class="badge warn">listener disabled (agentFarm.liveMonitor)</span>`;
        } else {
            listenerHtml = `<span class="badge err">listener error</span>`;
        }

        // ‼️ An engine that has left the page must not keep everything hidden —
        // the selection falls back rather than emptying the page silently.
        const present = enginesPresent();
        if (engineSel !== 'all' && present.indexOf(engineSel) < 0) { engineSel = 'all'; }
        const shownSessions = engineSel === 'all'
            ? DATA.sessions
            : DATA.sessions.filter(s => engineOf(s) === engineSel);

        const goneCount = DATA.sessions.filter(isGone).length;
        const sessionCards = shownSessions.map(s => {
            const meta = STATUS_META[s.status] || STATUS_META.idle;
            const gone = isGone(s);
            const st = statLines(s);
            // ‼️ `data-aftipact` — the name and the path are things you PRESS,
            // and afTip only knows that about real buttons and links unless the
            // page says so. Without it a panel stands under the hand that is
            // reaching for the link (U-74).
            const open = s.transcriptPath
                ? ` class="slink" data-aftipact data-open="${C.esc(s.transcriptPath)}" data-ts="${s.lastEventTs || 0}"`
                : '';
            const tip = (trigger, t) => window.AFTip.wrap(trigger, t.head, t.body);
            const pid = gone ? '' : (s.owner
                ? `pid ${s.owner.pid}${s.owner.entrypoint === 'sdk-cli' ? ' · Console/headless' : ' · terminal'}`
                : '');
            const where = [
                pid ? tip(`<span>${C.esc(pid)}</span>`, {
                    head: 'The process behind this card',
                    body: figures([
                        tline('Pid', s.owner.pid),
                        tline('Entrypoint', s.owner.entrypoint || '—'),
                        tline('Ran', s.owner.entrypoint === 'sdk-cli'
                            ? 'headless — no terminal, nobody at the keyboard'
                            : 'in a terminal a person can type in'),
                        tline('Reported state', s.owner.status || ''),
                        tline('Confirmed by', 'the CLI\'s own registry of running sessions — not by a hook event')
                    ])
                }) : '',
                s.cwd ? tip(
                    `<span class="pathlink" data-aftipact data-cwd="${C.esc(s.cwd)}">${C.esc(s.cwd)}</span>`,
                    {
                        head: 'Working folder',
                        body: s.cwd + '\n\nClick reveals it in the OS file manager.'
                    }) : ''
            ].filter(Boolean).join(' · ');
            return `<div class="card" style="border-left:3px solid ${gone ? 'var(--vscode-descriptionForeground,#999)' : meta.color}"
                 ${ctxAttr({
                     webviewSection: 'afTimelineSession', preventDefaultContextMenuItems: false,
                     sessionId: s.sessionId, title: s.title || '', agentName: s.agentName || '', cwd: s.cwd || ''
                 })}>
                <div class="spread">
                    <h3 style="margin:0">${tip(`<span${open}>${C.esc(s.label || s.agentName)}</span>`, nameTip(s))} ${tip(`<span class="sid">(${C.esc(shortId(s.sessionId))})</span>`, idTip(s))} ${engineBadge(s)}</h3>
                    ${tip(`<span class="badge" style="color:${meta.color};border-color:${meta.color}">${meta.label}${s.currentTool ? ' · ' + C.esc(s.currentTool) : ''}</span>`, statusTip(s, meta, gone))}
                </div>
                ${s.title ? `<div class="sub tip-host card-open" style="margin-top:3px">${tip(`<span${open}>${C.esc(s.title)}</span>`, titleTip(s))}</div>` : ''}
                <div class="sub tip-host card-said" style="margin-top:4px">${s.lastPrompt ? tip(`<span class="said-mark">↳ last</span>“${C.esc(s.lastPrompt)}”`, promptTip(s)) : `<span class="muted">${hasHooks(s) ? 'no prompt yet' : 'a CLI in its own terminal — open and close is all this page can see'}</span>`}</div>
                ${st.money ? `<div class="sub tip-host" style="margin-top:6px">${tip(st.money, moneyTip(s))}</div>` : ''}
                <div class="sub tip-host" style="margin-top:${st.money ? '2' : '6'}px">${tip(st.work, workTip(s))}</div>
                <div class="sub tip-host" style="margin-top:2px">${tip(st.time, timeTip(s))}</div>
                ${where ? `<div class="sub tip-host" style="margin-top:2px">${where}</div>` : ''}
                ${gone ? `<div class="sub" style="margin-top:4px;color:var(--vscode-editorWarning-foreground,#cca700)">⚠ No live process owns this session — it is over, its hooks just never said so. <b>Clear</b> takes it off this page, card and swim lane together.</div>` : ''}
                <div class="btnrow">
                    ${tip(`<button class="secondary" data-focusterm="${C.esc(s.agentName)}" data-sid="${C.esc(s.sessionId)}">⌨ Terminal</button>`, {
                        head: 'Jump to this session\'s terminal window',
                        body: figures([
                            tline('Finds it by', 'this session\'s id, falling back to the agent name'),
                            tline('Agent', s.agentName),
                            tline('Nothing is sent', 'the window is only brought forward')
                        ])
                    })}
                    ${!gone && RUNNING.indexOf(s.status) >= 0 ? tip(`<button class="secondary" data-stopsess="${C.esc(s.sessionId)}" data-stopagent="${C.esc(s.agentName)}">⎋ Interrupt</button>`, {
                        head: 'Stop the running turn, keep the session',
                        body: figures([
                            tline('Stops', 'the turn in flight — the conversation stays open and can be asked again'),
                            tline('How', s.hosted
                                ? 'through the Console, which hosts this conversation'
                                : 'Esc is typed into the terminal running it'),
                            tline('Currently', STATUS_WORDS[s.status] || s.status)
                        ])
                    }) : ''}
                    ${s.transcriptPath ? tip(`<button class="secondary" data-open="${C.esc(s.transcriptPath)}" data-ts="${s.lastEventTs || 0}">Open transcript</button>`, {
                        head: 'Open the transcript at the latest activity',
                        body: figures([
                            tline('File', s.transcriptPath),
                            tline('Opens at', window.AFTime.stamp(s.lastEventTs) || 'the top'),
                            tline('Turns', s.turns || '')
                        ])
                    }) : ''}
                    ${s.owner || s.hosted ? tip(`<button class="secondary" data-endsess="${C.esc(s.sessionId)}" data-endagent="${C.esc(s.label || s.agentName)}">⏻ End session</button>`, {
                        head: 'End this conversation for real — asks first',
                        body: figures([
                            tline('Ends', s.hosted
                                ? 'the Console closes the conversation and it leaves this page'
                                : `its claude process (pid ${s.owner.pid}) is stopped and it leaves this page`),
                            tline('The transcript', 'stays on disk — nothing about the session\'s record is touched'),
                            tline('Asks first', 'yes')
                        ])
                    }) : ''}
                    ${s.owner && !s.hosted ? tip(`<button class="secondary" data-killsess="${C.esc(s.sessionId)}" data-killagent="${C.esc(s.label || s.agentName)}">☠ Force kill</button>`, {
                        head: '‼️ Stop the whole claude tree above it — asks first, naming every process',
                        body: figures([
                            tline('Use it when', 'End session kills it and it comes straight back under a new id — that is the CLI\'s daemon breeding a replacement worker'),
                            tline('Ends', `the tree above pid ${s.owner.pid}, up to the topmost claude process — never VS Code's own`),
                            tline('vs End session', 'End stops this conversation; this stops the machinery that keeps re-making it'),
                            tline('Asks first', 'yes — the confirmation lists each process that will go')
                        ])
                    }) : ''}
                    ${tip(`<button class="secondary" data-dropsess="${C.esc(s.sessionId)}" data-dropagent="${C.esc(s.label || s.agentName)}">✕ Clear</button>`, {
                        head: 'Take it off this page — card and swim lane, in every range',
                        body: figures([
                            tline('Removes', 'this card AND its swim-lane row, at every window length'),
                            tline('The session', 'is not touched — its transcript stays on disk'),
                            tline('It comes back', 'if the session reports another event')
                        ])
                    })}
                </div>
            </div>`;
        }).join('');

        const density = isDensity();
        const allEvents = DATA.events || [];
        // ‼️ The lanes follow the engine selection too, or "show me Codex" would
        // filter the cards and leave every other engine's swim lane above them.
        // An event nobody attributed is kept only in the unfiltered view — it is
        // honestly unknown, and filing it under Claude is the very assumption
        // this whole item is about.
        const events = engineSel === 'all'
            ? allEvents
            : allEvents.filter(e => engineOfEvent(e) === engineSel);
        const hasAny = density ? !!(HISTORY && HISTORY.density && HISTORY.density.totalEvents) : allEvents.length > 0;

        let lanesHtml;
        if (density) {
            if (HISTORY && HISTORY.hours === windowMin / 60) {
                lanesHtml = densitySvg(HISTORY.density, winMs);
            } else {
                requestHistory(true);
                lanesHtml = '<p class="muted">Loading history…</p>';
            }
        } else {
            lanesHtml = lanesSvg(buildLanes(events, now, winMs), now, winMs);
        }
        const runsData = density && HISTORY && HISTORY.hours === windowMin / 60
            ? (HISTORY.workflowRuns || [])
            : (DATA.workflowRuns || []);

        const emptyHint = hasAny ? '' : `
            <div class="card" style="margin-top:12px">
                <h3>No live events yet</h3>
                <p class="muted">Claude Code sessions reach this page through its hooks — install them once, then <strong>restart</strong> any running claude sessions (hooks are snapshotted at startup). Conversations held in Agent Farm's own Console appear here on any engine without them.</p>
                <div class="btnrow">
                    <button id="install">Install Live Hooks</button>
                    <button class="secondary" data-guide="canli-gozlem">? How this works</button>
                </div>
            </div>`;

        const legend = density
            ? `<span><i style="background:var(--vscode-charts-green,#4caf50);width:16px;border-radius:3px"></i>tools</span>` +
              `<span><i style="background:var(--vscode-charts-blue,#3794ff);width:16px;border-radius:3px"></i>prompts</span>` +
              `<span><i style="background:var(--vscode-charts-red,#f14c4c);width:16px;border-radius:3px"></i>permission waits (top strip)</span>` +
              `<span class="muted">bar height = activity (√ scale) per ${Math.round((winMs / 168) / 60000)}min bucket</span>`
            : Object.entries(MARK_STYLE).map(([k, v]) =>
                `<span><i style="${v.shape === 'ring'
                    ? `background:transparent;border:2px solid ${v.color};box-sizing:border-box;`
                    : `background:${v.color};`}${v.shape === 'diamond' ? 'transform:rotate(45deg);' : ''}"></i>${v.label}</span>`).join('') +
              `<span><i style="background:var(--vscode-charts-green,#4caf50);width:16px;border-radius:3px"></i>tool run</span>`;

        document.getElementById('app').innerHTML = `${STYLE}
            ${window.AFHeader.html({
                page: 'timeline',
                title: 'Live Timeline',
                // ‼️ NOT "fed by Claude Code hooks" any more (X-35): a hosted
                // conversation on a per-turn engine has no hooks and never will,
                // and Agent Farm mirrors its lifecycle in itself. Saying only
                // "hooks" told the user their other three engines could not
                // appear here — which is exactly what they concluded.
                sub: `${listenerHtml} · fed by Claude Code hooks, plus every conversation the Console hosts, on any engine · detail ≤24h live, 3d+ from persisted history (kept 31 days)`,
                controls: `<span class="seg">${[15, 30, 60, 120, 180, 240, 480, 960, 1440, 4320, 10080, 43200].map(m => {
                    const label = m < 60 ? m + 'm' : m <= 1440 ? (m / 60) + 'h' : (m / 1440) + 'd';
                    return `<button data-win="${m}" class="${m === windowMin ? 'sel' : ''}">${label}</button>`;
                }).join('')}</span>`
                    // ‼️ Offered only when there is more than one engine on the
                    // page — a filter with a single option is furniture.
                    + (present.length > 1 ? ` <span class="seg">${
                        [['all', 'All engines']].concat(present.map(e => [e, window.AFEngine.label(e)]))
                            .map(([id, label]) => {
                                const n = id === 'all' ? DATA.sessions.length
                                    : DATA.sessions.filter(s => engineOf(s) === id).length;
                                return `<button data-eng="${C.esc(id)}" class="${id === engineSel ? 'sel' : ''}"`
                                    + ` title="${C.esc('Engine: ' + label + '\nSessions: ' + n)}">${C.esc(label)} ${n}</button>`;
                            }).join('')
                    }</span>` : ''),
                // Only offered when there is something to clean: a session whose
                // process the OS no longer knows about.
                actions: goneCount
                    ? `<button class="secondary" id="clear-gone" title="Clear every session here whose process is gone — cards and swim-lane rows both. They ended without a SessionEnd hook and would sit on this page until their tracking expires">✕ Clear ${goneCount} finished session${goneCount > 1 ? 's' : ''}</button>`
                    : '',
                guide: 'canli-gozlem'
            })}
            ${emptyHint}
            <h2>${density ? 'Activity density' : 'Swim lanes'}</h2>
            ${density ? '' : `<div class="muted small" style="margin:-4px 0 6px">Left toggles — when <b>this row's session</b> hits <b>YOUR TURN</b>: ${TURN_ACTIONS.map(a => a.glyph + ' ' + a.label.split(' ')[0].toLowerCase()).join(' · ')}, then <b>⏱</b> to try them in 3 seconds as ${testEventSelect()}. Every row is one session and carries its own choices — three concurrent runs of one agent are three rows and three independent settings, and they fire even while this panel is closed. A row drawing only history has them disabled. <b>Hover a row's name</b> for that session's figures — and <b>hover any dot or bar</b> for the moment itself: which conversation, what was sent or run, what came back, and where in the turn it fell. Click opens the transcript at that moment; <b>right-click a dot or a bar</b> for <b>Copy Corpus</b> — that step's own words, whole, without opening anything — and the session's actions under it (rename · terminal · interrupt · end · clear).</div>`}
            <div class="card chartbox">${lanesHtml}<div class="legend">${legend}</div></div>
            ${density ? '' : alertTestStrip()}
            ${workflowRunsSvg(runsData, now, winMs)}
            <h2>Live sessions (${shownSessions.length}${engineSel === 'all' ? '' : ' of ' + DATA.sessions.length})</h2>
            <div class="grid">${sessionCards || `<p class="muted">${engineSel === 'all' ? 'No sessions tracked yet.' : 'No ' + window.AFEngine.label(engineSel) + ' session is being tracked right now.'}</p>`}</div>
            <p class="footnote">Events arrive via local hooks (127.0.0.1 only, nothing leaves this machine). Right-click a session card <b>or its swim-lane row</b> for its actions (rename, open, terminal, interrupt, end, clear). Clear takes a session off this page whole — card and row — without touching the session. Stuck detection and permission alerts are configurable in settings.</p>
        `;

        const install = document.getElementById('install');
        if (install) { install.addEventListener('click', () => vscode.postMessage({ type: 'installHooks' })); }
        window.AFHeader.wire(vscode, {
            // density mode also re-requests the persisted history window
            onRefresh: () => {
                if (isDensity()) { requestHistory(true); }
                vscode.postMessage({ type: 'refresh' });
            }
        });
        document.querySelectorAll('[data-win]').forEach(b =>
            b.addEventListener('click', () => { windowMin = Number(b.dataset.win); render(); }));
        document.querySelectorAll('[data-eng]').forEach(b =>
            b.addEventListener('click', () => { engineSel = b.dataset.eng || 'all'; render(); }));
        document.querySelectorAll('[data-guide]').forEach(b =>
            b.addEventListener('click', () => vscode.postMessage({ type: 'openGuide', anchor: b.dataset.guide })));
        document.querySelectorAll('[data-stopsess]').forEach(b =>
            b.addEventListener('click', () => vscode.postMessage({
                type: 'interruptSession', sessionId: b.dataset.stopsess || '', agentName: b.dataset.stopagent || ''
            })));
        document.querySelectorAll('[data-endsess]').forEach(b =>
            b.addEventListener('click', () => vscode.postMessage({
                type: 'endSession', sessionId: b.dataset.endsess || '', agentName: b.dataset.endagent || ''
            })));
        document.querySelectorAll('[data-killsess]').forEach(b =>
            b.addEventListener('click', () => vscode.postMessage({
                type: 'forceKillSession', sessionId: b.dataset.killsess || '', agentName: b.dataset.killagent || ''
            })));
        document.querySelectorAll('[data-dropsess]').forEach(b =>
            b.addEventListener('click', () => vscode.postMessage({
                type: 'dismissSession', sessionId: b.dataset.dropsess || '', agentName: b.dataset.dropagent || ''
            })));
        document.querySelectorAll('[data-cwd]').forEach(el =>
            el.addEventListener('click', () => vscode.postMessage({ type: 'revealFolder', cwd: el.dataset.cwd })));
        const clearGone = document.getElementById('clear-gone');
        if (clearGone) { clearGone.addEventListener('click', () => vscode.postMessage({ type: 'clearGone' })); }
        document.querySelectorAll('[data-focusterm]').forEach(b =>
            b.addEventListener('click', () => vscode.postMessage({
                // sessionId picks the exact terminal of THIS card; agentName is the fallback
                type: 'focusTerminal', sessionId: b.dataset.sid || '', agentName: b.dataset.focusterm
            })));
        document.querySelectorAll('[data-open]').forEach(b =>
            b.addEventListener('click', () => vscode.postMessage({
                // live card: land on the latest activity, not the top of the file
                type: 'openSession', file: b.dataset.open, ts: Number(b.dataset.ts) || 0
            })));
        document.querySelectorAll('.mark').forEach(el =>
            el.addEventListener('click', () => {
                if (el.dataset.file) {
                    // ts rides along so the viewer opens scrolled to this exact event.
                    vscode.postMessage({ type: 'openSession', file: el.dataset.file, ts: Number(el.dataset.ts) || 0 });
                }
            }));
        // ‼️ ONE SESSION, ONE ACTION, ONE BOOLEAN — never the whole map. The
        // host holds the authority and answers with a fresh `data` message, so
        // the page draws what was really stored instead of what it assumed.
        document.querySelectorAll('.af-toggle').forEach(el =>
            el.addEventListener('click', () => {
                if (el.dataset.disabled) { return; }
                const sid = el.dataset.session;
                const act = el.dataset.action;
                if (!sid || !act) { return; }
                vscode.postMessage({
                    type: 'setTurnAlert', sessionId: sid, action: act,
                    enabled: actionsFor(sid).indexOf(act) === -1
                });
            }));
        {
            const sel = document.getElementById('testevent');
            // A redraw is the point: every ⏱ tooltip on the page names the tone
            // it would now play, and a picker that changed only itself would
            // leave five rows quietly claiming the old one.
            if (sel) {
                sel.addEventListener('change', () => { testEvent = sel.value; render(); });
            }
        }
        document.querySelectorAll('.af-alerttest').forEach(el =>
            el.addEventListener('click', () => {
                if (el.dataset.disabled) { return; }
                const sid = el.dataset.session;
                if (!sid) { return; }
                // The HOST runs the countdown, so leaving this window (which is
                // the only way to judge focus) does not cancel the test.
                ALERT_TESTS.set(sid, { state: 'counting', until: Date.now() + 3000, event: testEvent });
                vscode.postMessage({
                    type: 'testTurnAlert', sessionId: sid, delayMs: 3000, event: testEvent
                });
                startAlertTick();
                render();
            }));
    }

    /** Redraw once a second while a countdown is on screen, and stop after. */
    function startAlertTick() {
        if (alertTick) { return; }
        alertTick = setInterval(() => {
            let counting = false;
            ALERT_TESTS.forEach(t => { if (t.state === 'counting') { counting = true; } });
            if (!counting) { clearInterval(alertTick); alertTick = null; return; }
            render();
        }, 500);
    }

    render();
})();
