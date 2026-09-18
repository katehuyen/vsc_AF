// Agent Farm — dashboard page script.
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    let DATA = window.__DATA__;
    // 1–7 individually, then the longer spans, then 'custom' = two dates
    let range = 14;
    let rangeFrom = '', rangeTo = '';
    // Shared advanced Sessions table (sort box, turn accordion, single-open,
    // ⌨ jump-to-terminal) — the same component the agent detail page uses.
    // fallbackSort/-Single carry over the state persisted by pre-2.57 versions.
    const persisted = (typeof vscode.getState === 'function' && vscode.getState()) || {};
    const sessTable = window.AFSessionsTable.create({
        vscode, C,
        containerId: 'sessblock',
        columns: ['origin', 'agent', 'engine', 'project', 'title', 'when', 'duration', 'turns', 'tools', 'files', 'errors', 'tokens', 'ctx', 'cost'],
        tableN: 20, // dashboard default; the All chip toggles back to this
        stateKey: 'dash',
        fallbackSort: persisted.sessSort,
        fallbackSingle: persisted.sessSingle
    });

    // ---- Agent comparison window state ----
    const H = 3600e3, D = 24 * H;
    const CMP_WINDOWS = [
        { id: '1h', label: '1 hour', ms: H }, { id: '2h', label: '2 hours', ms: 2 * H },
        { id: '6h', label: '6 hours', ms: 6 * H }, { id: '12h', label: '12 hours', ms: 12 * H },
        { id: '16h', label: '16 hours', ms: 16 * H },
        { id: '1d', label: '1 day', ms: D }, { id: '2d', label: '2 days', ms: 2 * D },
        { id: '3d', label: '3 days', ms: 3 * D }, { id: '4d', label: '4 days', ms: 4 * D },
        { id: '5d', label: '5 days', ms: 5 * D },
        { id: '1w', label: '1 week', ms: 7 * D }, { id: '2w', label: '2 weeks', ms: 14 * D },
        { id: '3w', label: '3 weeks', ms: 21 * D }, { id: '4w', label: '4 weeks', ms: 28 * D },
        { id: '1mo', label: '1 month', ms: 30 * D }, { id: '2mo', label: '2 months', ms: 60 * D },
        { id: '3mo', label: '3 months', ms: 90 * D }, { id: '6mo', label: '6 months', ms: 180 * D },
        { id: '9mo', label: '9 months', ms: 270 * D },
        { id: '1y', label: '1 year', ms: 365 * D }, { id: '2y', label: '2 years', ms: 730 * D },
        { id: '3y', label: '3 years', ms: 1095 * D },
        { id: 'all', label: 'All time' },
        { id: 'custom', label: 'Custom range…' }
    ];
    let cmpWin = 'all';                  // selected window id (default: all time)
    let cmpFrom = '', cmpTo = '';        // custom-range dates (yyyy-mm-dd)
    let cmpRows = null;                  // host reply for a window; null = all-time mode
    let cmpSort = 'cost', cmpAsc = false;
    const CMP_SHOW_DEFAULT = 12;
    let cmpShow = CMP_SHOW_DEFAULT;      // rows listed after sorting (0 = all)

    function requestCmp() {
        const w = CMP_WINDOWS.find(x => x.id === cmpWin);
        if (!w || cmpWin === 'all') { cmpRows = null; return; }
        if (cmpWin === 'custom') {
            const f = Date.parse(cmpFrom), t = Date.parse(cmpTo);
            if (isNaN(f) || isNaN(t) || t < f) { return; } // wait until both dates are sane
            vscode.postMessage({ type: 'compareWindow', from: f, to: t + D - 1 }); // inclusive end day
            return;
        }
        vscode.postMessage({ type: 'compareWindow', from: Date.now() - w.ms, to: Date.now() });
    }

    // ---- Plan usage card state ----
    // The card lives on its own beat: the host answers {type:'planUsage'} out
    // of band, so a slow endpoint never holds up a dashboard render.
    let puBusy = false;      // a request is in flight — the ⟳ shows it
    let puTimer = null;      // auto-refresh interval, re-armed when the beat changes
    let puBeat = -1;         // ms currently armed

    function askPlanUsage(force) {
        puBusy = true;
        vscode.postMessage({ type: 'planUsage', force: !!force });
    }

    /**
     * Arm (or disarm) the self-refresh beat. The HOST decides the interval —
     * the same beat the status-bar indicator runs on, which switches between
     * the fast window (an agent is mid-turn, so the figures are moving) and the
     * slow one (everything is waiting for a prompt). Every answer carries the
     * current beat, so the card follows a window change instead of sitting on a
     * five-minute timer through the turn it is meant to be reporting.
     * 0 = manual only.
     */
    function armPlanUsage() {
        const ms = Number((DATA.planUsageBeat || {}).ms) || 0;
        if (ms === puBeat) { return; }
        puBeat = ms;
        if (puTimer) { clearInterval(puTimer); puTimer = null; }
        if (ms > 0) { puTimer = setInterval(() => askPlanUsage(false), ms); }
    }

    /**
     * ‼️ A RETAINED PAGE COMES BACK WHERE YOU LEFT IT, NOT WHERE YOU WERE SENT.
     *
     * The host asks for this when the click that opened the page was on a
     * status-bar indicator — cost today, the plan percentages — every one of
     * which is drawn at the TOP of this page. Reveal alone restored the last
     * scroll position, so the answer to the question you just asked was often
     * three screens up and the click looked like it had done nothing.
     *
     * No smooth behaviour: this is not the reader scrolling, it is the page
     * being opened, and an animation on arrival reads as a glitch.
     */
    function scrollToTop() {
        if (window.scrollTo) { window.scrollTo(0, 0); }
        if (document.documentElement) { document.documentElement.scrollTop = 0; }
        if (document.body) { document.body.scrollTop = 0; }
    }

    /** Bring the sessions table into view — a filter applied off-screen looks
     *  like nothing happened. */
    function scrollToSessions() {
        const el = document.getElementById('sessblock');
        if (el && el.scrollIntoView) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    }

    // ‼️ M-33 — A HOST PUSH WAITS FOR THE READER'S HANDS; THE PAGE'S OWN
    // RENDERS DO NOT. render() replaces the whole of #app, so a repaint that
    // arrives while somebody is typing detaches the box they are typing in and
    // the caret falls to <body> — where space IS Page Down. Full text, and
    // what a page-specific busy() is for: media/afRepaint.js.
    const repaint = window.AFRepaint.guard(render);
    window.addEventListener('message', ev => {
        if (ev.data.type === 'scrollTo') { if (ev.data.target === 'top') { scrollToTop(); } return; }
        if (ev.data.type === 'projectFilter') { sessTable.setProjectFilter(ev.data.name); scrollToSessions(); return; }
        if (sessTable.onMessage(ev)) { return; }
        if (ev.data.type === 'compareWindow') { cmpRows = ev.data.rows || []; render(); return; }
        if (ev.data.type === 'planUsage') {
            // an unsolicited push (the indicator's beat) must not clear the ⟳
            // spinner — that belongs to the request the button actually sent
            if (!ev.data.push) { puBusy = false; }
            if (ev.data.usage) { DATA.planUsage = ev.data.usage; }
            if (ev.data.beat) { DATA.planUsageBeat = ev.data.beat; }
            // U-27 — the same message carries every engine and the chosen one,
            // so a tab can never be a beat behind the tab beside it.
            if (ev.data.engines) { DATA.planUsageEngines = ev.data.engines; }
            if (ev.data.engine) { DATA.planUsageEngine = ev.data.engine; }
            // ‼️ X-212 — and whose sign-in they are. Assigned on `!== undefined`
            // rather than truthiness, because '' is a real answer here (the
            // engine cannot hold a second account) and dropping it would leave
            // the previous engine's owner sitting over the new engine's figures.
            if (ev.data.account !== undefined) { DATA.planUsageAccount = ev.data.account; }
            render();
            armPlanUsage();
            return;
        }
        if (ev.data.type === 'data') {
            DATA = ev.data.data;
            repaint();
            armPlanUsage();
            if (cmpWin !== 'all') { requestCmp(); } // refresh the windowed figures too
        }
    });

    const dayKey = d =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    function dayKeysBack(n) {
        const out = [];
        const now = new Date();
        for (let i = n - 1; i >= 0; i--) {
            out.push(dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)));
        }
        return out;
    }

    /**
     * The days the page is about — the last N, or a range you picked.
     *
     * The jumps used to be 7 → 14 → 30: "yesterday and today" was not a
     * question this page could be asked, and neither was "that week in July".
     * The first week is now day by day, and `between` takes two dates. Both
     * end up as the same thing — a list of day keys — so everything
     * downstream (the KPI cards, the chart, the per-agent columns) is
     * unchanged and stays exactly as accurate as the daily buckets it sums.
     */
    function rangeDays() {
        if (range !== 'custom') { return dayKeysBack(Number(range)); }
        const from = new Date(rangeFrom + 'T00:00:00');
        const to = new Date(rangeTo + 'T00:00:00');
        if (isNaN(from) || isNaN(to) || to < from) { return dayKeysBack(14); }
        const out = [];
        for (const d = new Date(from); d <= to && out.length < 800; d.setDate(d.getDate() + 1)) {
            out.push(dayKey(d));
        }
        return out;
    }

    /** What the range is called on a card label. */
    const rangeLabel = () => (range === 'custom'
        ? `${rangeFrom} → ${rangeTo}`
        : `${range}d`);

    function relTime(ts) {
        if (!ts) return 'never';
        const s = Math.round((Date.now() - ts) / 1000);
        if (s < 60) return s + 's ago';
        const m = Math.round(s / 60);
        if (m < 60) return m + 'm ago';
        const h = Math.round(m / 60);
        if (h < 24) return h + 'h ago';
        return Math.round(h / 24) + 'd ago';
    }

    function sum(agent, days, field) {
        let total = 0;
        for (const d of days) {
            const bucket = agent.daily[d];
            if (bucket) total += bucket[field];
        }
        return total;
    }

    // ---- Agent comparison: sortable, over any window ----
    const CMP_SORTS_ALL = [
        { id: 'name', label: 'Agent A–Z', str: true, key: a => a.name },
        { id: 'sessions', label: 'Sessions', key: a => a.sessions },
        { id: 'cost', label: 'Cost', key: a => a.totalCost },
        { id: 'tokens', label: 'Tokens', key: a => a.totalTokens },
        { id: 'tools', label: 'Tools', key: a => a.toolCalls },
        { id: 'errpct', label: 'Err %', key: a => a.toolCalls ? a.errors / a.toolCalls : 0 },
        { id: 'quality', label: 'Quality', key: a => a.quality || 0 },
        { id: 'cache', label: 'Cache eff.', key: a => { const p = a.usage.input + a.usage.cacheRead + a.usage.cacheWrite; return p ? a.usage.cacheRead / p : 0; } },
        { id: 'ctxload', label: 'Ctx load', key: a => a.contextLoad }
    ];
    const CMP_SORTS_WIN = [
        { id: 'name', label: 'Agent A–Z', str: true, key: r => r.name },
        { id: 'sessions', label: 'Sessions', key: r => r.sessions },
        { id: 'cost', label: 'Cost', key: r => r.cost },
        { id: 'tokens', label: 'Tokens', key: r => r.tokens },
        { id: 'msgs', label: 'Msgs', key: r => r.msgs }
    ];

    function cmpSorted(list, defs) {
        const def = defs.find(s => s.id === cmpSort) || defs.find(s => s.id === 'cost') || defs[0];
        return list.slice().sort((a, b) => {
            const d = def.str
                ? String(def.key(a)).localeCompare(String(def.key(b)))
                : def.key(a) - def.key(b);
            return cmpAsc ? d : -d;
        });
    }

    function cmpControls(defs) {
        return `<span class="cmpctl">
            <select id="cmp-window" title="The period the comparison covers">${CMP_WINDOWS.map(x =>
                C.option(x.id, x.label, {
                    selected: x.id === cmpWin,
                    detail: x.ms ? 'Everything since ' + new Date(Date.now() - x.ms).toLocaleString() + '.' : ''
                })).join('')}</select>
            ${cmpWin === 'custom' ? `<input type="date" id="cmp-from" value="${C.esc(cmpFrom)}"> – <input type="date" id="cmp-to" value="${C.esc(cmpTo)}">` : ''}
            <select id="cmp-sort" title="Sort the comparison rows">${defs.map(s =>
                C.option(s.id, s.label, { selected: s.id === cmpSort, detail: s.detail || s.full || '' })).join('')}</select>
            <button class="chip" id="cmp-dir" title="Flip the sort direction">${cmpAsc ? '▲' : '▼'}</button>
            <span class="muted small">Show:</span>
            <input type="number" id="cmp-count" min="1" step="1" value="${cmpShow > 0 ? cmpShow : ''}" placeholder="all" title="How many agents to list after sorting — empty means all">
            <button class="chip${cmpShow === 0 ? ' on' : ''}" id="cmp-all" title="List every agent (click again to go back to ${CMP_SHOW_DEFAULT})">All</button>
        </span>`;
    }

    /** Top-N slice for the comparison table (cmpShow = 0 → everything). */
    function cmpShown(list) {
        return cmpShow > 0 ? list.slice(0, cmpShow) : list;
    }
    const cmpMoreNote = (shownLen, total) =>
        shownLen < total ? ` Showing ${shownLen} of ${total} agents.` : '';

    function cmpSection() {
        const style = `<style>
            .cmph { display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
            .cmpctl { display:inline-flex; gap:6px; align-items:center; font-size:12px; font-weight:400; }
            .cmpctl input[type=date] { padding:1px 4px; }
            .cmpctl input[type=number] { width:52px; padding:1px 4px; }
            /* U-27 — the engine strip on the plan card. Deliberately quieter than
           the page's own tabs: this is a filter on one card, not navigation.

           ‼️ U-40 — AND IT IS ONE ROW, WHICH IS A RULE AND NOT A HOPE. It used
           to wrap, so the fourth engine dropped to a line of its own the
           moment a handle carried anything besides a name — one tab above, one
           below, which reads as a layout fault rather than as a strip that ran
           out of room. Handles are now names only, and a strip genuinely out
           of room ellipsises a name instead of pushing its neighbours off the
           line. The engine's own colour comes from the shared palette
           (--af-engc, AFEngine.cls).

           ‼️ B-06.2 — AND A NAME IS NEVER CUT WHILE THE STRIP HAS ROOM. The
           basis was 0, so five handles split the card into five EQUAL fifths
           whatever their names measured: Antigravity needed 60px and got 59,
           OpenCode the same, both drawn as "Antigra…" / "OpenCo…" with the
           strip 50px short of full and 1,028px of page unused to the right.
           The basis is the name now: each handle starts at its own width and
           the SPARE is what they share equally, so an ellipsis appears only
           when the sum of the names really exceeds the card - the case U-40
           was written for - and never before. */
        .pu-tabs { display:flex; gap:4px; margin:8px 0 2px; flex-wrap:nowrap; }
        .pu-tab { flex:1 1 auto; min-width:0; font-size:10px; padding:2px 6px; cursor:pointer;
            background:transparent; color:var(--vscode-foreground); opacity:.65;
            border:1px solid transparent; border-bottom:2px solid var(--vscode-widget-border,#4444);
            border-radius:4px 4px 0 0; text-align:center;
            overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .pu-tab:hover { opacity:.95; border-bottom-color:var(--af-engc); }
        /* the open one is the engine's colour, said twice — the underline it is
           standing on and the text itself, so it survives a theme that flattens
           one of the two */
        .pu-tab.on { opacity:1; font-weight:600; color:var(--af-engc);
            border-bottom-color:var(--af-engc);
            background:color-mix(in srgb, var(--af-engc) 12%, transparent); }
        /* the engines you are NOT looking at, in one line under the bars */
        .pu-others { display:flex; gap:10px; flex-wrap:wrap; margin-top:8px; }
        .pu-o { white-space:nowrap; }
        .pu-o b { color:var(--af-engc); font-weight:600; }
    </style>`;
        if (cmpRows) {
            // windowed mode: figures the host computed for [from, to]
            const all = cmpSorted(cmpRows, CMP_SORTS_WIN);
            const rows = cmpShown(all);
            const exact = rows.length && rows[0].exact;
            return style + `<h2 class="cmph">Agent comparison ${cmpControls(CMP_SORTS_WIN)}</h2>
            <div class="tablewrap"><table>
                <tr><th>Agent</th><th class="num">Sessions</th><th class="num">Cost</th><th class="num">Tokens</th><th class="num">Msgs</th></tr>
                ${rows.map(r => `<tr class="click" data-agent-row="${C.esc(r.id)}"
                    ${window.AFCtx.agent(r)} title="${C.esc(window.AFCtx.AGENT_HINT)}">
                    <td><strong>${C.esc(r.name)}</strong></td>
                    <td class="num">${r.sessions}</td>
                    <td class="num">${C.fmtUSD(r.cost)}</td>
                    <td class="num">${C.fmtTokW(r.tokens, r.wTokens)}</td>
                    <td class="num">${r.msgs}</td>
                </tr>`).join('')}
            </table></div>
            <p class="muted small">${exact
                ? 'Hour-exact — summed from the per-message log (retained 48h).'
                : 'Day granularity — summed from daily buckets; hours inside a day are not sliced.'} Sessions = sessions overlapping the window.${cmpMoreNote(rows.length, all.length)}</p>`;
        }
        const all = cmpSorted(DATA.agents, CMP_SORTS_ALL);
        const rows = cmpShown(all);
        return style + `<h2 class="cmph">Agent comparison ${cmpControls(CMP_SORTS_ALL)}</h2>
        <div class="tablewrap"><table>
            <tr><th>Agent</th><th class="num" title="Sessions this row's figures are measured from — Claude Code transcripts. A second number is the agent's total across every engine; the gap is what carries no price.">Sessions</th><th class="num">Cost</th><th class="num">Tokens</th><th class="num">Tools</th><th class="num">Err %</th><th class="num">Quality</th><th class="num">Cache eff.</th><th class="num">Ctx load</th></tr>
            ${rows.map(a => {
                const promptTok = a.usage.input + a.usage.cacheRead + a.usage.cacheWrite;
                const cacheEff = promptTok ? Math.round(100 * a.usage.cacheRead / promptTok) + '%' : '—';
                const errPct = a.toolCalls ? Math.round(100 * a.errors / a.toolCalls) + '%' : '—';
                const quality = a.quality !== undefined && a.quality !== null
                    ? `<span title="${a.qualityCount} sampled session(s), last 14 days · Claude Code transcripts only">${a.quality.toFixed(1)}/5</span>` : '—';
                // ‼️ The measured count AND the real one (X-35). This cell used to
                // print the Claude-only figure alone, so an agent mostly driven
                // through Codex read as barely used here while its own page
                // showed a full table — the same number, two answers.
                const others = Math.max(0, (a.sessionsAll || 0) - a.sessions);
                const sessCell = others
                    ? `${a.sessions} <span class="muted" title="${a.sessions} measured (Claude Code) of ${a.sessionsAll} total — ${others} on other engines, which state no price and are not in this row's figures">of ${a.sessionsAll}</span>`
                    : String(a.sessions);
                return `<tr class="click" data-agent-row="${C.esc(a.id)}"
                    ${window.AFCtx.agent(a)} title="${C.esc(window.AFCtx.AGENT_HINT)}">
                    <td><strong>${C.esc(a.name)}</strong></td>
                    <td class="num">${sessCell}</td>
                    <td class="num">${C.fmtUSDSum(a.totalCost, a.costParts)}</td>
                    <td class="num">${C.fmtTokW(a.totalTokens, a.totalWTokens)}</td>
                    <td class="num">${a.toolCalls}</td>
                    <td class="num">${errPct}</td>
                    <td class="num">${quality}</td>
                    <td class="num">${cacheEff}</td>
                    <td class="num">~${C.fmtTok(a.contextLoad)}</td>
                </tr>`;
            }).join('')}
        </table></div>
        <p class="muted small">Cache eff. = cache-read share of prompt tokens (higher is cheaper). Err % = tool errors / tool calls. Quality = judge average of sampled sessions (14d) <a data-guide="kalite-karnesi">?</a> · <a data-guide="filo-raporu">Export a Markdown report ?</a>${cmpMoreNote(rows.length, all.length)}</p>`;
    }

    // ---- Plan usage card ----
    // The real subscription limits as Anthropic reports them — the same figures
    // Claude Code's /usage prints. Deliberately next to Farm status: that box
    // says what the farm can do, this one says how much room is left to do it.
    const PU_STYLE = `<style>
        .pucard { flex:0 1 340px; min-width:250px; }
        .pucard .pu-head { display:flex; justify-content:space-between; align-items:baseline; gap:8px; }
        /* X-212 — the owner takes the room between the label and the button and
           gives it back when there is none: an address is longer than the card
           and truncating it beats pushing ⟳ off the edge. */
        .pu-acct { flex:1 1 auto; min-width:0; text-align:right; font-size:11px;
            opacity:.75; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .pu-ref { font-size:12px; line-height:1; padding:2px 7px; border-radius:4px; cursor:pointer;
            background:transparent; color:var(--vscode-foreground); opacity:.6;
            border:1px solid var(--vscode-widget-border, #4444); }
        .pu-ref:hover { opacity:1; background:var(--vscode-list-hoverBackground); }
        .pu-bar { margin-top:9px; }
        .pu-bar .pu-t { display:flex; justify-content:space-between; align-items:baseline; gap:8px; font-size:12px; }
        .pu-bar .pu-t strong { font-size:13px; }
        .pu-bar .progress { margin-top:3px; }
    </style>`;

    /** "Resets 21:40 · in 2h 20m" — the absolute time answers "when", the
     *  relative one answers "should I start this now". */
    function puReset(ts) {
        if (!ts) { return ''; }
        const d = new Date(ts);
        const time = window.AFTime.clockUtc(d);
        const sameDay = d.toDateString() === new Date().toDateString();
        const when = sameDay ? time : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
        const left = ts - Date.now();
        if (left <= 0) { return `Resets ${when}`; }
        const h = Math.floor(left / 3600e3), m = Math.round((left % 3600e3) / 60000);
        return `Resets ${when} · in ${h > 0 ? h + 'h ' : ''}${m}m`;
    }

    /** An engine's headline figure, or the honest word for why there is none —
     *  never a 0% for an engine nobody can measure (core/engineUsage.ts). */
    function puFigure(e) {
        if (e.state === 'ok' && (e.bars || []).length) {
            return Math.max.apply(null, e.bars.map(b => b.percent)) + '%';
        }
        // ‼️ U-59 — `no-plan` is one state reached for two reasons, and the word
        // was Gemini's. OpenCode has no plan window because each model runs
        // against its own provider — and it states a real price per turn, so
        // "per-token" read as "your tokens are being billed" on the one engine
        // whose free models cost nothing. A row that knows its own word says it.
        if (e.headline) { return e.headline; }
        return e.state === 'no-plan' ? 'per-token'
            : e.state === 'not-published' ? 'not published' : 'not read yet';
    }

    /**
     * ‼️ U-27 — THE CARD HAS AN ENGINE AXIS, AND IT IS THE STATUS BAR'S AXIS.
     *
     * One tab per engine, the chosen one open, and choosing here writes the
     * same setting the indicator's hover writes — so the two cannot end up
     * showing different engines, which is the whole failure mode of putting
     * the same choice in two places.
     *
     * ‼️ …AND U-40 — A TAB HANDLE IS A NAME. Nothing else. These handles were
     * carrying the engine's percentage AND, for an engine that has no
     * percentage, a two-word explanation of why (`Gemini per-token`,
     * `Antigravity n/a`) — inside the one element on the card with the least
     * room, which is a card 340px wide. So four handles could not fit on a line
     * and the fourth dropped underneath the other three, which is what made the
     * strip read as broken rather than as full. A figure belongs where the card
     * has a column for it and an explanation belongs in the body, which has the
     * whole width; both are still here, one hover and one line away.
     *
     * The colour is the engine's OWN, out of the one palette every surface
     * reads (`AFEngine.cls` → `--af-engc`), so a tab and the badge on a session
     * row of the same engine cannot disagree — and the strip answers "which
     * engine am I looking at" before anything is read.
     */
    function planTabs() {
        const list = DATA.planUsageEngines || [];
        if (list.length < 2) { return ''; }
        const cur = puEngineId();
        return `<div class="pu-tabs" role="tablist">` + list.map(e => {
            const on = e.id === cur;
            // The figure leaves the handle and lands here — `Label: value`,
            // which is what a native tooltip is for (docs/CONVENTIONS.md).
            const tip = [
                e.label + ': ' + puFigure(e),
                (e.bars || []).map(b => b.title + ': ' + b.percent + '%').join('\n'),
                e.plan ? 'Plan: ' + e.plan : ''
            ].filter(Boolean).join('\n');
            return `<button class="pu-tab ${window.AFEngine.cls(e.id)}${on ? ' on' : ''}"
                role="tab" aria-selected="${on}" data-puengine="${C.esc(e.id)}"
                title="${C.esc(tip)}">${C.esc(e.label.split(' ')[0])}</button>`;
        }).join('') + `</div>`;
    }

    /**
     * The other engines, in one line under the card (U-40).
     *
     * The status-bar hover got this right and the card did not: seeing every
     * engine's figure at once, without switching, is the reason to look at all —
     * "which one should I be worried about" is a question about the set. It sits
     * BELOW the bars rather than in the tab handles, because down here there is
     * a card's width to say it in.
     */
    function planOthers() {
        const list = DATA.planUsageEngines || [];
        if (list.length < 2) { return ''; }
        const cur = puEngineId();
        const rest = list.filter(e => e.id !== cur);
        if (!rest.length) { return ''; }
        return `<div class="sub muted pu-others">` + rest.map(e =>
            `<span class="pu-o ${window.AFEngine.cls(e.id)}" title="${C.esc(e.label + ': ' + puFigure(e))}"
                >${C.esc(e.label.split(' ')[0])} <b>${C.esc(puFigure(e))}</b></span>`).join('') + `</div>`;
    }

    const puEngineId = () => (DATA.planUsageEngine || 'claude');
    const puEngineRow = () => (DATA.planUsageEngines || []).find(e => e.id === puEngineId());

    /**
     * ‼️ X-212 — WHOSE PLAN THIS CARD IS SHOWING, on the card.
     *
     * The tabs say which ENGINE and nothing said which SIGN-IN of it, so on a
     * machine with two Claude accounts the card was a percentage with no owner —
     * and the reader attributes an owner-less percentage to whatever they are
     * running. It sits in the head beside "Plan usage" rather than in the
     * footer, because it qualifies the whole card and not the last reading.
     *
     * '' is a real answer: the engine cannot hold a second sign-in, and then
     * naming one would invent a choice that is not there.
     */
    function puOwner() {
        const who = String(DATA.planUsageAccount || '');
        if (!who) { return ''; }
        const tip = 'Account: ' + who + '\n'
            + 'The sign-in these figures belong to. Set it on the Engines page — '
            + 'the status bar, this card and every new session follow it.';
        return `<span class="pu-acct" title="${C.esc(tip)}">${C.esc(who)}</span>`;
    }

    function planCard() {
        const eng = puEngineRow();
        // Claude keeps the endpoint-shaped snapshot (state, backoff, beat);
        // every other engine answers from its own record, which is a different
        // set of facts and is drawn from the matrix instead.
        const pu = eng && eng.id !== 'claude'
            ? { state: eng.state === 'ok' ? 'ok' : 'other', bars: eng.bars || [],
                plan: eng.plan || '', fetchedAt: eng.fetchedAt || 0, note: eng.note || '' }
            : DATA.planUsage;
        const beat = DATA.planUsageBeat || { ms: 0, active: false };
        // the beat is a fact about the page, so it is stated on the page: how
        // often these figures are re-read, and which of the two windows we are in
        const beatText = !(beat.ms > 0) ? 'manual refresh only'
            : beat.active ? 'live · every ' + Math.max(1, Math.round(beat.ms / 1000)) + ' s while an agent works'
                : 'auto every ' + Math.max(1, Math.round(beat.ms / 60000)) + ' min';
        const btn = `<button class="pu-ref" id="pu-refresh" title="Read your subscription limits from Anthropic now">${puBusy ? '…' : '⟳'}</button>`;
        let body, foot;
        if (!pu) {
            body = '<div class="sub" style="margin-top:8px">Reading your subscription limits…</div>';
            foot = '';
        } else if (pu.state !== 'ok') {
            body = `<div class="sub" style="margin-top:8px">${C.esc(pu.note || 'Usage data is unavailable.')}</div>`;
            foot = `<div class="sub muted" style="margin-top:8px">Checked ${window.AFTime.clockUtc(pu.fetchedAt)}</div>`;
        } else {
            body = pu.bars.map(b => {
                const cls = b.percent >= 90 ? ' hot' : b.percent >= 75 ? ' warn' : '';
                return `<div class="pu-bar">
                    <div class="pu-t"><span>${C.esc(b.title)}</span><strong>${b.percent}%</strong></div>
                    <div class="progress"><div class="${cls.trim()}" style="width:${b.percent}%"></div></div>
                    <div class="sub">${C.esc(puReset(b.resetsAt))}</div>
                </div>`;
            }).join('');
            // ‼️ THE BEAT BELONGS TO THE ENDPOINT, SO IT IS ONLY CLAIMED FOR IT.
            // Codex's figure is read off a file it wrote at its last turn; saying
            // "auto every 5 min" under it would promise a refresh nothing performs.
            const isClaude = !eng || eng.id === 'claude';
            foot = `<div class="sub muted" style="margin-top:10px">${pu.plan ? C.esc(pu.plan) + ' plan · ' : ''}`
                + `${pu.fetchedAt ? (isClaude ? 'updated ' : 'as of ') + window.AFTime.clockUtc(pu.fetchedAt) : 'no reading yet'}`
                + `${isClaude ? ' · ' + beatText : ''}</div>`
                + (isClaude ? '' : `<div class="sub muted">${C.esc(eng.note)}</div>`);
        }
        // The card's own controls are one ⟳; everything else about the plan
        // window (check it now, reset the token lap, clear it) lived only in the
        // command palette.
        const bars = ((DATA.planUsage || {}).bars || [])
            .map(b => `${b.title}: ${b.percent}%`).join(' · ');
        return `<div class="card pucard"
            ${window.AFCtx.row('afPlanUsage', { puText: bars })}
            title="${C.esc(window.AFCtx.hint('What the subscription window has left'))}">
            <div class="pu-head"><div class="label">Plan usage</div>${puOwner()}${btn}</div>
            ${planTabs()}
            ${body}${foot}${planOthers()}
        </div>`;
    }

    function render() {
        const days = rangeDays();
        const today = DATA.today;
        const agents = DATA.agents;

        const rangeCost = agents.reduce((a, ag) => a + sum(ag, days, 'cost'), 0);
        const rangeTokens = agents.reduce((a, ag) => a + sum(ag, days, 'tokens'), 0);
        const rangeWTokens = agents.reduce((a, ag) => a + sum(ag, days, 'wTokens'), 0);
        const rangeMsgs = agents.reduce((a, ag) => a + sum(ag, days, 'msgs'), 0);
        const todayCost = agents.reduce((a, ag) => a + (ag.daily[today] ? ag.daily[today].cost : 0), 0);
        const activeCount = agents.filter(a => a.active).length;
        // ‼️ "farm scope" HAS TO MEAN THE FARM (X-35). This tile summed the
        // Claude-only per-agent counts and captioned itself "all time, farm
        // scope" — on a farm where a third of the conversations happen on
        // another engine, that is a fleet claim over one engine's data, and it
        // disagreed with the Sessions table two cards below on the same page.
        // The KPI is now every engine; the caption says what the money-shaped
        // figures beside it still cover.
        const sessionsMeasured = agents.reduce((a, ag) => a + ag.sessions, 0);
        const sessionsTotal = agents.reduce((a, ag) => a + (ag.sessionsAll || ag.sessions), 0);
        const sessionsOther = Math.max(0, sessionsTotal - sessionsMeasured);

        // ‼️ THE 5h CARD IS WHERE THE WRONG UNIT HURT MOST. This window is the
        // plan's own reset span, and a bar drawn off the RAW total says the
        // wall moved whenever the shape of the work did — measured, the raw
        // totals of the eight heaviest windows span 111M-175M while their
        // WEIGHTED totals sit within ±13%. So the weighted ceiling,
        // when the user has set one, is what the bar is drawn from; the raw
        // figure stays on the line below, because it is still the honest answer
        // to "how much text moved". See charts.js WEIGHTED_TIP.
        const win = DATA.window;
        const wLimit = win.wLimit || 0;
        let windowHtml;
        if (wLimit > 0) {
            const pct = Math.min(100, Math.round(100 * win.wTokens / wLimit));
            windowHtml = `<div class="kpi" title="${C.esc(C.WEIGHTED_TIP)}">${pct}%<span class="wtok">⚖</span></div>
                <div class="progress"><div class="${pct > 85 ? 'hot' : ''}" style="width:${pct}%"></div></div>
                <div class="sub">${C.fmtTok(win.wTokens)} / ${C.fmtTok(wLimit)} weighted · ${C.fmtTok(win.tokens)} raw · ${win.msgs} msgs</div>`;
        } else if (win.limit > 0) {
            const pct = Math.min(100, Math.round(100 * win.tokens / win.limit));
            windowHtml = `<div class="kpi">${pct}%</div>
                <div class="progress"><div class="${pct > 85 ? 'hot' : ''}" style="width:${pct}%"></div></div>
                <div class="sub">${C.fmtTokW(win.tokens, win.wTokens)} / ${C.fmtTok(win.limit)} tokens · ${win.msgs} msgs
                <br><span class="muted">the bar is on the RAW total — set <code>windowWeightedTokenLimit</code> to brake on ⚖ instead</span></div>`;
        } else {
            windowHtml = `<div class="kpi">${C.fmtTokW(win.tokens, win.wTokens)}</div>
                <div class="sub">${win.msgs} msgs · ${C.fmtUSD(win.cost)} — set <code>windowTokenLimit</code> or <code>windowWeightedTokenLimit</code> for a quota bar</div>`;
        }

        const ins = DATA.insightTotals;

        /**
         * ‼️ X-231 — WHAT THE FLEET IS WAITING FOR, AND WHAT WOULD END IT.
         *
         * The count alone would be the poster this row exists not to be: five
         * things held up is not a decision until you know whether any of them is
         * waiting for YOU. So the sub line is the split — a clock ends by itself,
         * an event ends when something else finishes, a human means nobody is
         * coming — and the hover names them.
         *
         * ‼️ NOTHING HERE IS DECIDED. Every kind, sentence and verdict was worked
         * out in core/waits.ts and handed over; this counts and draws. A second
         * opinion about one wait is the whole failure the item was opened about.
         *
         * ‼️ AND ZERO IS DRAWN. A tile that vanishes when nothing is held up cannot
         * be told apart from a page that never learned to ask.
         */
        const waits = DATA.waits || [];
        const wBy = k => waits.filter(w => w.clearedBy === k).length;
        const waitTip = waits.length
            ? waits.map(w => (w.subject && w.subject.name ? w.subject.name : '') + ' — ' + w.reason
                + (typeof w.until === 'number'
                    ? ' (until ' + new Date(w.until).toLocaleTimeString() + ')' : '')).join('\n')
            : 'Nothing is held up: no run is parked behind a ceiling or a clock, no mission is '
                + 'waiting on you, no campaign is sleeping and no restart is armed.';

        // ‼️ A NUMBER YOU CANNOT ACT ON IS A POSTER. Each tile says what it is,
        // what it currently reads, and — where there is one — which page answers
        // the question it raises, so the menu can offer to go there.
        const tile = (label, nav, value) =>
            window.AFCtx.row('afStatTile', { tileLabel: label, tileNav: nav || '', tileValue: String(value) })
            + ` title="${C.esc(window.AFCtx.hint(label))}"`;

        const kpis = `
        <div class="row">
            <div class="card" ${tile('Active now', 'timeline', activeCount + '/' + agents.length + ' agents')}><div class="label">Active now</div><div class="kpi">${activeCount}<span class="muted" style="font-size:13px">/${agents.length} agents</span></div><div class="sub">threshold-based on transcript activity</div></div>
            <div class="card" ${tile('Cost today', 'analytics', C.fmtUSD(todayCost))}><div class="label">Cost today</div><div class="kpi">${C.fmtUSD(todayCost)}</div>
                ${DATA.fleetBudget > 0
                    ? `<div class="progress"><div class="${todayCost >= DATA.fleetBudget ? 'hot' : ''}" style="width:${Math.min(100, Math.round(100 * todayCost / DATA.fleetBudget))}%"></div></div><div class="sub">${Math.round(100 * todayCost / DATA.fleetBudget)}% of ${C.fmtUSD(DATA.fleetBudget)} fleet budget</div>`
                    : '<div class="sub">API-equivalent value</div>'}</div>
            <div class="card" ${tile('Cost · ' + rangeLabel(), 'portfolio', C.fmtUSD(rangeCost))}><div class="label">Cost · ${rangeLabel()}</div><div class="kpi">${C.fmtUSD(rangeCost)}</div><div class="sub">${C.fmtTokW(rangeTokens, rangeWTokens)} tokens · ${rangeMsgs} msgs</div></div>
            <div class="card" ${tile('Sessions', 'turns', sessionsTotal)}><div class="label">Sessions</div><div class="kpi">${sessionsTotal}</div><div class="sub">all time, every engine${sessionsOther
                ? ` · <span title="The cost, token and model figures on this page are measured from Claude Code transcripts and cover ${sessionsMeasured} of them; the other ${sessionsOther} ran on engines that state no price.">${sessionsMeasured} priced</span>`
                : ''}</div></div>
            <div class="card" ${tile('5h window', '', '')}><div class="label">5h window</div>${windowHtml}</div>
            <div class="card" ${tile('Waiting', 'tasks', waits.length + ' held up')}><div class="label">Waiting</div>
                <div class="kpi" title="${C.esc(waitTip)}">${waits.length}</div>
                <div class="sub">${waits.length
                    ? `${wBy('clock')} clock · ${wBy('event')} event · ${wBy('human')} human`
                    : 'nothing is held up'}</div></div>
            <div class="card" ${tile('Insights', 'portfolio', ins.error + ' errors · ' + ins.warning + ' warnings · ' + ins.info + ' info')}><div class="label">Insights</div><div class="kpi">${ins.error + ins.warning + ins.info}</div>
                <div class="sub">${ins.error} errors · ${ins.warning} warnings · ${ins.info} info <a data-guide="saglik-ve-optimizasyon">?</a></div></div>
            ${DATA.mediaCost && DATA.mediaCost.month > 0 ? `
            <div class="card" ${tile('Media cost', 'studio', C.fmtUSD(DATA.mediaCost.today) + ' today · ' + C.fmtUSD(DATA.mediaCost.month) + ' last 30d')}><div class="label">Media cost</div><div class="kpi">${C.fmtUSD(DATA.mediaCost.today)}</div>
                <div class="sub">today · ${C.fmtUSD(DATA.mediaCost.month)} last 30d (est.) <a data-guide="medya-uretim-hatti">?</a></div></div>` : ''}
        </div>`;

        const series = agents.map(a => ({
            name: a.name,
            values: days.map(d => a.daily[d] ? a.daily[d].cost : 0)
        })).filter(s => s.values.some(v => v > 0));

        // 180d/365d: weekly buckets keep the bars readable (daily would be ~1px).
        let chartDays = days, chartSeries = series, bucketNote = '';
        if (days.length > 120) {
            chartDays = [];
            chartSeries = series.map(s => ({ name: s.name, values: [] }));
            for (let i = 0; i < days.length; i += 7) {
                chartDays.push(days[i]);
                series.forEach((s, si) => {
                    let v = 0;
                    for (let j = i; j < Math.min(i + 7, days.length); j++) v += s.values[j] || 0;
                    chartSeries[si].values.push(v);
                });
            }
            bucketNote = ' <span class="muted" style="font-size:11px">(weekly buckets)</span>';
        }

        const modelItems = Object.entries(DATA.modelTotals)
            .map(([name, v]) => ({ name: name.replace(/^claude-/, ''), value: v.cost }))
            .sort((a, b) => b.value - a.value);

        const tt = DATA.tokenTypes;
        const tokenItems = [
            { name: 'cache read', value: tt.cacheRead },
            { name: 'cache write', value: tt.cacheWrite },
            { name: 'input', value: tt.input },
            { name: 'output', value: tt.output }
        ];

        const charts = `
        <div class="row">
            <div class="card chartbox"><h3>Daily cost by agent${bucketNote} <a data-guide="dashboard">?</a></h3>${C.stackedBars(chartDays, chartSeries, {})}</div>
            <div class="card chartbox"><h3>Cost by model</h3>${C.donut(modelItems, {})}</div>
        </div>
        <div class="row">
            <div class="card chartbox"><h3>Token types (all time)</h3>${C.hbars(tokenItems, { fmt: C.fmtTok })}</div>
            <div class="card chartbox"><h3>Activity heatmap (assistant msgs, local time)</h3>${C.heatmap(DATA.heat)}</div>
        </div>`;

        const cards = agents.map(a => {
            const spark = days.map(d => a.daily[d] ? a.daily[d].cost : 0);
            const badges =
                (a.insightCounts.error ? `<span class="badge err">${a.insightCounts.error} err</span>` : '') +
                (a.insightCounts.warning ? `<span class="badge warn">${a.insightCounts.warning} warn</span>` : '');
            const todayAgentCost = a.daily[today] ? a.daily[today].cost : 0;
            const budgetBar = a.budget > 0
                ? `<div class="progress" title="${C.fmtUSD(todayAgentCost)} / ${C.fmtUSD(a.budget)} daily budget"><div class="${todayAgentCost >= a.budget ? 'hot' : ''}" style="width:${Math.min(100, Math.round(100 * todayAgentCost / a.budget))}%"></div></div>`
                : '';
            return `<div class="card agent-card" data-agent="${C.esc(a.id)}"
                ${window.AFCtx.agent(a)} title="${C.esc(window.AFCtx.AGENT_HINT)}">
                <h3><span class="dot ${a.active ? 'on' : 'off'}"></span>${C.esc(a.name)}${badges}</h3>
                <div class="sub">${a.active ? 'ACTIVE' : relTime(a.lastActivity)} · <span title="${C.esc(
                    (a.sessionsAll || a.sessions) > a.sessions
                        ? `${a.sessionsAll} sessions in all — ${a.sessions} of them on Claude Code, which is where the money below is measured; the rest ran on engines that state no price.`
                        : 'Every session this agent has, all engines counted.')
                }">${a.sessionsAll || a.sessions} sessions</span> · ctx ~${C.fmtTok(a.contextLoad)} tok${a.duties ? ` · 👁 ${a.duties}${a.pendingDuties ? ` <span class="badge warn">${a.pendingDuties} pending</span>` : ''}` : ''}</div>
                ${budgetBar}
                <div class="spread" style="margin-top:8px">
                    <div><div class="label">today</div><strong>${C.fmtUSD(a.daily[today] ? a.daily[today].cost : 0)}</strong></div>
                    <div><div class="label">${range === 'custom' ? days.length + 'd' : rangeLabel()}</div><strong>${C.fmtUSD(sum(a, days, 'cost'))}</strong></div>
                    <div>${C.sparkline(spark)}</div>
                </div>
                <div class="btnrow">
                    <button class="secondary" data-detail="${C.esc(a.id)}">Detail</button>
                    <button data-start="${C.esc(a.id)}">Start session</button>
                </div>
            </div>`;
        }).join('');

        // Z1: Farm Status — which subsystems are live/idle/never-used, one
        // wake-up action each. Opens expanded only while something is dormant.
        const st = DATA.farmStatus || [];
        const stDot = {
            active: 'var(--vscode-charts-green,#4caf50)',
            ready: 'var(--vscode-charts-blue,#3794ff)',
            dormant: 'var(--vscode-descriptionForeground,#999)'
        };
        const stCounts = { active: 0, ready: 0, dormant: 0 };
        st.forEach(r => { stCounts[r.state]++; });
        const statusCard = st.length ? `
            <details class="card" style="flex:3 1 420px;padding:10px 14px" ${stCounts.dormant ? 'open' : ''}>
                <summary><strong>Farm status</strong> — ${stCounts.active} live · ${stCounts.ready} ready · ${stCounts.dormant} dormant${stCounts.dormant ? ' <span class="muted small">(unused capability — one click each)</span>' : ''}</summary>
                <div style="margin-top:8px">
                ${st.map(r => `
                    <div style="display:flex;align-items:center;gap:10px;padding:3px 0">
                        <i style="width:9px;height:9px;border-radius:50%;flex:none;background:${stDot[r.state]}" title="${r.state}"></i>
                        <strong style="width:140px;flex:none;font-size:12px">${C.esc(r.label)}</strong>
                        <span class="muted small" style="flex:1">${C.esc(r.detail)}</span>
                        ${r.action ? `<button class="secondary" style="flex:none" data-status-kind="${r.action.kind}" data-status-value="${C.esc(r.action.value)}">${C.esc(r.action.label)}</button>` : ''}
                    </div>`).join('')}
                </div>
            </details>` : '';
        // Plan usage sits to the RIGHT of Farm status, on the same line: the two
        // boxes answer the paired questions "what can the farm do" and "how much
        // subscription room is left". Farm status stays full width if it is the
        // only one there (an empty status list leaves the usage card alone).
        const statusRow = `${PU_STYLE}<div class="row" style="margin:12px 0">${statusCard}${planCard()}</div>`;

        // B1: Projects — "what did I spend on this customer". Every session lands
        // in exactly one bucket (a named project or Unassigned), so the rows add
        // up to the fleet total. The card only exists once projects are declared.
        const projects = DATA.projects || [];
        const named = projects.filter(p => p.name !== 'Unassigned' || p.sessions);
        const projectsCard = named.length ? `
            <h2>Projects</h2>
            <div class="tablewrap"><table>
                <tr><th>Project</th><th>Agents</th><th class="num">Sessions</th><th class="num">Today</th><th class="num">Total</th><th class="num">Tokens</th><th class="num">Last activity</th></tr>
                ${named.map(p => {
                    const over = p.budgetUSD && p.todayCost > p.budgetUSD;
                    const budget = p.budgetUSD
                        ? ` <span class="badge${over ? ' err' : ''}" title="daily budget ${C.fmtUSD(p.budgetUSD)}">${Math.round((p.todayCost / p.budgetUSD) * 100)}%</span>`
                        : '';
                    return `<tr class="click" data-project="${C.esc(p.name)}" title="${C.esc(p.note || 'Filter the Sessions table by this project')}">
                        <td><strong>${C.esc(p.name)}</strong>${p.note ? ` <span class="muted small">${C.esc(p.note)}</span>` : ''}</td>
                        <td class="muted small">${C.esc((p.agents || []).join(', ')) || '—'}</td>
                        <td class="num">${p.sessions}</td>
                        <td class="num">${C.fmtUSD(p.todayCost)}${budget}</td>
                        <td class="num"><strong>${C.fmtUSDSum(p.cost, p.costParts)}</strong></td>
                        <td class="num">${C.fmtTok(p.tokens)}</td>
                        <td class="num">${p.lastTs ? new Date(p.lastTs).toLocaleDateString() : '—'}</td>
                    </tr>`;
                }).join('')}
            </table></div>
            <p class="footnote">Every SESSION lands in exactly one bucket, so these rows add up to the fleet total — an agent itself may feed several projects. <a data-manage-projects style="cursor:pointer">Manage projects →</a></p>`
            : `<p class="footnote">No projects yet — a project is a folder plus a name, and once one exists every figure here can be read per project. <a data-manage-projects style="cursor:pointer">Set them up →</a></p>`;

        const unknown = DATA.unknownModels.length
            ? `<p class="footnote">⚠ No pricing rule matched: ${DATA.unknownModels.map(C.esc).join(', ')} — their cost is counted as $0. <a data-status-kind="settings" data-status-value="agentFarm.pricing" style="cursor:pointer">Add a rule in agentFarm.pricing →</a></p>`
            : '';
        const extEntries = Object.entries(DATA.externalSessions || {});
        // ‼️ THE BADGE, NOT THE RAW ID (X-35). This line printed `codex ×3 · agy
        // ×1` — the internal ids, in the generic footnote grey, on the one page
        // that is supposed to be the farm at a glance. `agy` is not a word
        // anybody outside this codebase knows, and the same engine wore a proper
        // coloured badge two inches above in the sessions table.
        const externalNote = extEntries.length
            ? `<p class="footnote">⌁ Sessions on other engines: ${extEntries
                .map(([src, n]) => `${window.AFEngine.badge(src)} ×${n}`).join(' · ')}`
              + ` — listed in the Sessions table above and kept OUT of the cost, token and model`
              + ` figures on this page: those are defined against Claude's transcript format and`
              + ` would read zero or read wrong on a foreign one. Where a model matches an`
              + ` <code>agentFarm.pricing</code> rule its own cost is shown on its row; otherwise it is honestly $0.</p>`
            : '';

        document.getElementById('app').innerHTML = `
            ${window.AFHeader.html({
                page: 'dashboard',
                title: 'Agent Farm',
                // ‼️ "data: local Claude Code transcripts" was true when there was
                // one engine and is a claim this page can no longer make (X-35):
                // the Sessions table below holds four. What IS Claude-only is the
                // analytics, and that distinction is worth stating rather than
                // implying — see the footnote.
                sub: `Generated ${window.AFTime.full(DATA.generatedAt)} · every engine's sessions; cost, token and model figures are Claude transcripts only`,
                // Every day of the first week, then the longer spans, then two
                // dates. "Yesterday and today" and "that week in July" were
                // both unaskable when the smallest step was 7 days.
                // ‼️ Every one of these buttons says what its number MEANS. The
                // first week was drawn as bare digits next to a "14d 30d 90d"
                // segment, so one row of the same control had a unit and the
                // other did not — and a lone "5" beside "14d" reads as anything
                // but five days.
                controls: `<span class="seg">${[1, 2, 3, 4, 5, 6, 7].map(r =>
                        `<button data-range="${r}" class="${r === range ? 'sel' : ''}" title="${r === 1 ? 'Today' : 'The last ' + r + ' days, today included'}">${r}d</button>`).join('')}</span>
                    <span class="seg">${[14, 30, 90, 180, 365].map(r =>
                        `<button data-range="${r}" class="${r === range ? 'sel' : ''}">${r}d</button>`).join('')}</span>
                    <span class="seg"><button data-range="custom" class="${range === 'custom' ? 'sel' : ''}" title="Between two dates">⇤⇥</button></span>
                    ${range === 'custom' ? `<span class="seg" style="gap:4px">
                        <input type="date" id="dash-from" value="${C.esc(rangeFrom)}" title="From this day">
                        <input type="date" id="dash-to" value="${C.esc(rangeTo)}" title="To this day, included">
                    </span>` : ''}`,
                // ⚖ Sync Constitution lives on the Toolbox now (U-83): what it
                // mirrors is the shared CLAUDE.md into the AGENTS.md files the
                // other engines read, which is a piece of the extension model
                // that page is about — and there it has the room to carry its
                // whole name instead of "Sync Cons.".
                guide: 'dashboard'
            })}
            ${kpis}
            ${statusRow}
            ${charts}
            <h2>Agents</h2>
            <div class="grid">${cards}</div>
            ${cmpSection()}
            ${projectsCard}
            <!-- ‼️ THE WAY OUT OF THE CORNER. This table is the last block of a
                 board about the whole farm, capped at twenty rows because
                 everything above it also wants the screen. "Show me my sessions"
                 is a different question, and the only way to ask it here was to
                 press All and make the board ship every session it has. The
                 button is beside the heading rather than in the table's chip row
                 because it does not change this table — it leaves it. -->
            <style>
                /* A section heading with one action beside it — the heading keeps
                   its own size and the button sits on its baseline rather than
                   above or below it. */
                .secthead { display:flex; gap:10px; align-items:baseline; flex-wrap:wrap; }
                .secthead h2 { margin-right:2px; }
            </style>
            <div class="secthead">
                <h2>Sessions</h2>
                <button class="secondary" id="opensessions"
                    title="Open Sessions — the same table on a page of its own: 200 rows by default instead of this corner's ${DATA.sessionTableN || 20}, every column, and the same filters, sorting and right-click menu.">⤢ Open Sessions page</button>
                ${/* ‼️ U-69 — TURNS BELONGS BESIDE SESSIONS, NOT IN THE GLOBAL ROW.
                      It is the same subject one level down — a session unrolled
                      into the turns it is made of — so it is reached from where
                      somebody is already looking at sessions, and the toolbar
                      above keeps a place for a destination that is not about
                      any one section of this page. */''}
                <button class="secondary" id="openturns"
                    title="Open Turns — the same sessions unrolled one level down: one row per user turn, with what each one consumed in tokens, cost, tools and errors.">⤢ Open Turns page</button>
            </div>
            <div id="sessblock"></div>
            ${unknown}
            ${externalNote}
            <p class="footnote">A cost is what the run's own route makes it: on the Claude plan an API-equivalent (not your bill — the value you extracted), on an API key the bill, through a third-party route such as Kimi Anthropic-tariff arithmetic that is not that route's bill. A total marked (mixed) adds more than one of these — hover it for the breakdown. Sessions are matched to agents by their working directory under your agent roots.</p>
        `;

        window.AFHeader.wire(vscode);
        {
            const os = document.getElementById('opensessions');
            if (os) { os.addEventListener('click', () => vscode.postMessage({ type: 'afnav', to: 'sessions' })); }
            const ot = document.getElementById('openturns');
            if (ot) { ot.addEventListener('click', () => vscode.postMessage({ type: 'afnav', to: 'turns' })); }
        }
        document.querySelectorAll('[data-range]').forEach(b =>
            b.addEventListener('click', () => {
                const r = b.dataset.range;
                if (r === 'custom') {
                    range = 'custom';
                    // open on the span you were already looking at, so the
                    // dates start somewhere meaningful instead of empty
                    if (!rangeFrom || !rangeTo) {
                        const d = rangeDays();
                        rangeFrom = d[0];
                        rangeTo = d[d.length - 1];
                    }
                } else {
                    range = Number(r);
                }
                render();
            }));
        const dateBox = (id, set) => {
            const el = document.getElementById(id);
            if (el) { el.addEventListener('change', () => { set(el.value); render(); }); }
        };
        dateBox('dash-from', v => { rangeFrom = v; });
        dateBox('dash-to', v => { rangeTo = v; });
        document.querySelectorAll('[data-detail]').forEach(b =>
            b.addEventListener('click', ev => { ev.stopPropagation(); vscode.postMessage({ type: 'openAgent', agentId: b.dataset.detail }); }));
        document.querySelectorAll('[data-start]').forEach(b =>
            b.addEventListener('click', ev => { ev.stopPropagation(); vscode.postMessage({ type: 'startSession', agentId: b.dataset.start }); }));
        document.querySelectorAll('.agent-card').forEach(card =>
            card.addEventListener('click', () => vscode.postMessage({ type: 'openAgent', agentId: card.dataset.agent })));
        document.querySelectorAll('[data-agent-row]').forEach(row =>
            row.addEventListener('click', () => vscode.postMessage({ type: 'openAgent', agentId: row.dataset.agentRow })));
        document.querySelectorAll('[data-guide]').forEach(a =>
            a.addEventListener('click', ev => { ev.stopPropagation(); vscode.postMessage({ type: 'openGuide', anchor: a.dataset.guide }); }));
        document.querySelectorAll('[data-manage-projects]').forEach(a =>
            a.addEventListener('click', ev => { ev.stopPropagation(); vscode.postMessage({ type: 'manageProjects' }); }));
        document.querySelectorAll('[data-project]').forEach(row =>
            row.addEventListener('click', () => {
                // the project row is a lens on the sessions below it
                sessTable.setProjectFilter(row.dataset.project);
                const el = document.getElementById('sessblock');
                if (el && el.scrollIntoView) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
            }));
        document.querySelectorAll('[data-status-kind]').forEach(b =>
            b.addEventListener('click', () => vscode.postMessage({
                type: 'statusAction', kind: b.dataset.statusKind, value: b.dataset.statusValue
            })));
        const puBtn = document.getElementById('pu-refresh');
        if (puBtn) {
            // force: the ⟳ means "now", not "if the cache happens to be stale"
            puBtn.addEventListener('click', () => { if (!puBusy) { askPlanUsage(true); render(); } });
        }
        // ‼️ The engine tabs post the choice to the HOST rather than setting it
        // here: the host writes the setting the status bar reads, and pushes the
        // answer back — which is what keeps the two surfaces on one choice
        // instead of two that drift (U-27).
        //
        // ‼️ …BUT THE TAB MOVES NOW, NOT WHEN THE DISK ANSWERS (U-40). The
        // reported symptom was "you press it and nothing happens, sometimes it
        // changes, sometimes the tabs stop responding", and the round trip is
        // the whole of it: the host writes a GLOBAL setting (a disk write) and
        // only then pushes the new engine back — while this page repaints on
        // every index update, which on a working fleet is constant. So a click
        // could be followed by a repaint carrying the OLD engine, putting the
        // tab back before the answer arrived. Flipping locally first is the same
        // contract the pin star already uses on this page: the page shows the
        // state it asked for, the host's answer confirms it, and a refusal
        // (an id this build does not know) corrects it on the next push.
        document.querySelectorAll('[data-puengine]').forEach(b =>
            b.addEventListener('click', () => {
                const want = b.dataset.puengine;
                if (!want || want === puEngineId()) { return; }
                DATA.planUsageEngine = want;
                render();
                vscode.postMessage({ type: 'setUsageEngine', id: want });
            }));

        // ---- Agent comparison controls ----
        const wireCmp = (id, ev, fn) => {
            const el = document.getElementById(id);
            if (el && el.addEventListener) { el.addEventListener(ev, () => fn(el)); }
        };
        wireCmp('cmp-window', 'change', el => {
            cmpWin = el.value;
            if (cmpWin === 'all') { cmpRows = null; render(); }
            else { render(); requestCmp(); } // custom shows its date inputs first
        });
        // Dates and the Show box apply as you type, on a longer beat than the
        // client-side filters: each commit is a round trip to the host.
        const liveCmp = (id, fn, delay) => window.AFFilter.live(document.getElementById(id), fn, delay);
        liveCmp('cmp-from', el => { cmpFrom = el.value; requestCmp(); }, 400);
        liveCmp('cmp-to', el => { cmpTo = el.value; requestCmp(); }, 400);
        wireCmp('cmp-sort', 'change', el => {
            cmpSort = el.value;
            const defs = cmpRows ? CMP_SORTS_WIN : CMP_SORTS_ALL;
            const def = defs.find(s => s.id === cmpSort);
            cmpAsc = !!(def && def.str);
            render();
        });
        wireCmp('cmp-dir', 'click', () => { cmpAsc = !cmpAsc; render(); });
        liveCmp('cmp-count', el => {
            const v = parseInt(el.value, 10);
            cmpShow = isFinite(v) && v >= 1 ? v : 0;
            render();
        }, 300);
        wireCmp('cmp-all', 'click', () => { cmpShow = cmpShow === 0 ? CMP_SHOW_DEFAULT : 0; render(); });

        // The shared component fills its container and wires its own controls
        // (sort box, Show box, turn accordion, single-open, ⌨) — after every
        // full render. sessionTableN echoes the Show box (0 = all).
        sessTable.setRows(DATA.sessionRows || [], DATA.sessionTableN);
    }

    // ------------------------------------------------------- right-click menu

    /** The two page-side acts. Everything an AGENT row offers is host commands
     *  (src/core/ctxmenu.ts), so nothing about them appears here. */
    function ctxDo(act, ctx) {
        if (act === 'tileOpen') {
            if (ctx.tileNav) { vscode.postMessage({ type: 'afnav', to: String(ctx.tileNav) }); }
            return;
        }
        if (act === 'tileCopy') {
            window.AFCtx.copy([ctx.tileLabel, ctx.tileValue].filter(Boolean).join(': '));
            return;
        }
        if (act === 'puCopy') { window.AFCtx.copy(ctx.puText); }
    }

    // ‼️ ONCE, at module scope — this page re-renders on every range change and
    // every plan-usage beat.
    window.AFCtx.listen(ctxDo);

    render();
    // Somebody sent us here to look at one project (the Projects page's
    // "Sessions" button). Scope the table now that it exists — before the first
    // render there is nothing to scope.
    if (DATA.projectFilter !== undefined) { sessTable.setProjectFilter(DATA.projectFilter); }
    armPlanUsage();
    askPlanUsage(false);   // first fill — the host serves its cache if it is fresh
})();
