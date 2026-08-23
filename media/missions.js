// Agent Farm — Missions page: dynamic multi-agent orchestration.
// A mission = goal + lead agent + team + hard limits. The page lists runs,
// shows each run's round-by-round timeline (planner thought + delegations),
// hosts the approval / question waits, and carries the New Mission form.
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    let DATA = window.__DATA__;

    let formOpen = !!DATA.newForm;
    let formErr = '';
    // background refreshes must not wipe an in-progress edit (2.47 lesson)
    let editing = false;
    let pendingData = null;
    // ---- run-list accordion (same language as the session viewer's turns) ----
    const openRuns = new Set();       // run ids with their detail expanded inline
    let runSingle = true;             // single-open mode (viewer's Single-open chip)
    let openNewest = false;           // after Start: open the freshly created run
    const closedRounds = new Set();   // "runId:n" keys of folded round bands
    let roundSingle = false;          // single-open mode for round bands
    // ---- run-list sorting (the sessions table's Sort-by pattern) ----
    let runSort = 'recent';
    let runSortAsc = false;           // numeric sorts default newest/biggest first
    // ---- run-list filters: selections + ranges over the sort criteria ----
    const FILTER_DEFAULTS = () => ({
        status: [],                   // picked statuses (empty = all)
        verdict: [],                  // picked verdicts (empty = all)
        // multi-pick: null = all (no filter), array = that subset, [] = none
        leads: null,                  // lead agent names
        agents: null,                 // team member names
        from: '', to: '',             // started-date range (yyyy-mm-dd)
        ranges: {}                    // key → {min?, max?} for tokens/cost/rounds/tasks/duration
    });
    let filters = FILTER_DEFAULTS();
    let filtersOpen = false;
    // sort + direction + filters survive reloads, like the sessions table's state
    {
        const saved = (typeof vscode.getState === 'function' && vscode.getState()) || {};
        if (saved.mSort) { runSort = saved.mSort; }
        if (typeof saved.mSortAsc === 'boolean') { runSortAsc = saved.mSortAsc; }
        if (saved.mFilters) { filters = { ...FILTER_DEFAULTS(), ...saved.mFilters }; }
        if (typeof saved.mFiltersOpen === 'boolean') { filtersOpen = saved.mFiltersOpen; }
    }
    const saveUiState = () => {
        if (typeof vscode.setState !== 'function') { return; }
        const st = (typeof vscode.getState === 'function' && vscode.getState()) || {};
        vscode.setState({ ...st, mSort: runSort, mSortAsc: runSortAsc, mFilters: filters, mFiltersOpen: filtersOpen });
    };
    // ---- mission-control observation state ----
    let liveOpen = true;              // "Live activity" section (hook events)
    let ledgerOpen = false;           // planner ledger section
    // ---- U-64: the adaptive sections. Open by default are the two that answer
    // "what is it doing and why" the moment the run is opened; the rest are
    // history and cost a click, which is the DENSITY trade this page already
    // makes for the ledger.
    let objOpen = true;               // Objective — criteria and their verdicts
    let stratOpen = true;             // Strategy in force + its revisions
    let evalOpen = false;             // every verdict recorded
    let castOpen = false;             // runtime roles the lead bound
    let graphOpen = false;            // the runtime graph
    let guideOpen = false;            // steer the next decision
    let convOpen = false;             // the conversation room
    /**
     * ‼️ U-65 / X-93 — WHICH EXCHANGE IS OPEN, AND IN WHICH RUN.
     *
     * One at a time: a transcript is a reading surface and two of them stacked
     * is neither. But a conversation id is only unique WITHIN its run — every
     * run starts at `c1` — so holding the bare id meant that with two run rows
     * open, one click on `c1` opened both of them, drew two elements carrying
     * the same DOM id, and `getElementById` then managed the scroll and unseen
     * count of whichever came first. The key is the pair, everywhere.
     */
    let convThread = null;            // `${runId} ${conversationId}` or null
    const cvKey = (runId, convId) => runId + ' ' + convId;
    /** A DOM id that cannot collide, built from the same key that decided the
     *  element exists at all. */
    const cvDomId = (prefix, key) => prefix + '-' + String(key).replace(/[^A-Za-z0-9_-]/g, '_');
    /** ‼️ U-65 — a long exchange is drawn compact until the reader asks for it
     *  whole. The number is the point where a transcript stops being readable
     *  in one screen, not a memory limit. */
    const CONV_COMPACT = 25;
    /**
     * ‼️ U-65 / X-93 — THE READING POSITION IS STATE, and this page repaints
     * ONCE A SECOND while a mission runs. A transcript that jumped back to its
     * first line every second would not be a redraw, it would be an
     * interruption — the same one AFTip had to solve for its panel.
     *
     * `atEnd` is the difference between the two readers this surface has: one
     * FOLLOWING a live exchange, who wants each new turn as it lands, and one
     * READING an earlier part of it, whose place must not be taken away. A new
     * turn moves the first one down and shows the second one a count.
     *
     * ‼️ AND IT IS PER EXCHANGE. All of it was global, so opening a second
     * conversation handed it the first one's scroll offset, its unseen count,
     * its "show all" and the message it had jumped to — a reader's place in one
     * transcript silently applied to another. Keyed by run+conversation, so
     * coming back to an exchange comes back to where you were in it.
     */
    const convRead = {};              // cvKey → { scroll, atEnd, seen, all, mark }
    const cvRead = (key) => (convRead[key] ??= { scroll: 0, atEnd: true, seen: 0, all: false, mark: null });
    /**
     * ‼️ U-65 / X-93 — the reader's filter, kept across repaints. A page that
     * redraws once a second and reset it every time would be unusable while
     * live. Per RUN, because that is the scope of the checkbox that sets it —
     * one global flag meant ticking it on one run hid rows on another.
     */
    const convFilter = {};            // runId → only threads still awaiting an answer
    const cvOnlyOpen = (runId) => !!convFilter[runId];
    const guideNote = {};             // runId → what the host said about the last steer
    let expandedStep = null;          // step id opened in the accordion (one at a time)
    let tail = { file: '', text: '', size: 0, missing: false };
    let tailTimer = null;
    // form model survives re-renders
    const form = {
        title: '', goal: '', leadAgentId: '', workdir: '', plannerModel: '',
        // ‼️ `engine` AND `engines` — the mission-wide default and each member's
        // override (X-35). The core has taken both since X-18 and this form
        // offered neither, so every mission delegated on Claude no matter what
        // the fleet was set up to use, and there was no way to say otherwise
        // short of the bridge.
        engine: '',
        // ‼️ …and `perms`, the member's permission mode (M-14). A delegation is
        // a headless run with nobody in it, so a mode the engine wants to ASK
        // about has no one to ask; every other unattended surface spends this up
        // front and a mission delegation was the one that did not — a read-only
        // reviewer could not be asked for even in principle.
        // ‼️ …and `efforts` (M-18), the fourth. Model, engine and permissions
        // were per member and effort was not, so a reviewer that wanted `low`
        // and a planner that wanted `xhigh` had to be the same run.
        team: {}, roles: {}, models: {}, engines: {}, perms: {}, efforts: {},
        maxRounds: '', maxTasks: '', maxCostUSD: '', maxMinutes: '', maxParallel: '',
        // ‼️ …and the token ceiling, which was INVISIBLE. On a subscription
        // engine no delegation ever states a dollar, so `maxCostUSD` — the limit
        // the form presented as "the" budget — can never be reached: the run is
        // fenced by this one alone, and a user who could not see it believed the
        // dollar box was protecting them.
        maxTokens: '',
        approvalMode: 'each-round',
        /**
         * ‼️ U-64 (X-32) — WHICH KIND OF WORK THIS FORM IS STARTING.
         *
         * Anything that is not the exact string 'adaptive' is a classic
         * mission — the same rule `createMission` applies on the host, written
         * once on each side rather than negotiated. Classic is the default and
         * its fields, its DOM and the payload it posts are untouched by this:
         * the adaptive keys below are added to the message ONLY in adaptive
         * mode, so a classic Start is byte-for-byte the message it always was.
         */
        mode: 'classic',
        // Adaptive-only. Held even while classic is showing, because switching
        // mode must not throw away what was typed in the other one.
        constraints: [''],
        criteria: [{ text: '', required: true }],
        autonomy: 'ask-when-unsure'
    };
    // Adaptive basic view = outcome + constraints + criteria. Everything the
    // user is NOT being asked to decide (lead, pool, workdir, limits, engines,
    // approval) lives under this fold — open once and it stays open.
    let advOpen = false;
    // The vocabulary for an engine that publishes no catalog of its own — the
    // user's agentFarm.modelAliases knowledge base (add a name once, every
    // picker knows it).
    const modelSuggestions = () =>
        (DATA.modelAliases && DATA.modelAliases.length) ? DATA.modelAliases : ['haiku', 'sonnet', 'opus', 'fable'];

    /**
     * ‼️ U-64 — THE LAUNCH SHAPE, so this form asks `afEngine.js` what an
     * engine offers instead of guessing. Every other launch surface (Console,
     * Task launcher, Settings) narrows model and effort to the engine the row
     * is set to; this form did not, and offered four Claude aliases and six
     * efforts to a member delegating on OpenCode. Same three fields the shared
     * helper takes, built from the payload this page already receives.
     */
    const launchView = () => ({
        engines: DATA.engines || [], engineModels: DATA.engineModels || {}, efforts: DATA.efforts || []
    });
    /** Which engine a member row really lands on: its own, else the mission's. */
    const effEngine = (agentId) => form.engines[agentId] || form.engine || 'claude';
    /**
     * ‼️ U-97 — MODEL IS A SELECT HERE, NOT FREE TEXT OVER A DATALIST.
     *
     * The row used to carry `<input list="…">` against a `<datalist>`. Chromium
     * anchors that popup on the flex PARENT rather than the box, so the second
     * press drew the list at the far left of the row, and a repaint while it
     * was open collapsed it to a single line. Every other launch surface in
     * this extension — Tasks, Console, Queue — reads the same `AFEngine`
     * catalog through a plain `<select>`; this form now does too.
     *
     * An engine that publishes no catalog falls back to the alias vocabulary
     * rather than to nothing, and a value the catalog does not carry is KEPT as
     * its own option: narrowing drops such a value deliberately when the engine
     * changes, but a repaint must never lose it silently.
     */
    const modelListOf = (engine) => {
        const rows = (window.AFEngine.models(launchView(), engine) || []).filter(m => m.id);
        return rows.length
            ? rows.map(m => ({ id: m.id, label: (m.label && m.label !== m.id) ? m.label : m.id }))
            : modelSuggestions().map(m => ({ id: m, label: m }));
    };
    /** Whether a value this row holds is one that engine really publishes. */
    const modelKnown = (engine, sel) => !sel || modelListOf(engine).some(m => m.id === sel);
    const modelOptsFor = (engine, sel, emptyLabel) => {
        const list = modelListOf(engine);
        // SHORTHAND: the box is ~150px, so the off-catalog value gets a mark it
        // can carry and the sentence goes in the tooltip above it.
        if (sel && !list.some(m => m.id === sel)) { list.unshift({ id: sel, label: '⚠ ' + sel }); }
        return [`<option value="">${C.esc(emptyLabel || '— agent default —')}</option>`]
            .concat(list.map(m =>
                `<option value="${C.esc(m.id)}"${sel === m.id ? ' selected' : ''}>${C.esc(m.label)}</option>`))
            .join('');
    };
    /**
     * ‼️ U-97 — THE ROW IS MADE COHERENT BEFORE IT IS DRAWN AGAIN. Same rule
     * the host applies at launch (`core/models.ts` narrowLaunch): a model the
     * new engine does not publish is dropped, and an effort the resulting model
     * does not offer falls back to that model's default or to nothing. Without
     * it a row switched onto an engine with `takesEffort:false` kept its old
     * word and the launch carried a hidden `--effort` that engine refuses.
     *
     * An engine that publishes NO catalog is not allowed to call a model wrong
     * — it has no opinion to hold — so only the effort is checked there.
     */
    const narrowRow = (agentId) => {
        const eng = effEngine(agentId);
        const cat = (window.AFEngine.models(launchView(), eng) || []).filter(m => m.id);
        if (cat.length) {
            const fixed = window.AFEngine.narrow(launchView(), eng, form.models[agentId] || '', form.efforts[agentId] || '');
            form.models[agentId] = fixed.model;
            form.efforts[agentId] = fixed.effort;
            return;
        }
        const rows = window.AFEngine.efforts(launchView(), eng, form.models[agentId] || '') || [];
        if (!rows.some(e => e.id === (form.efforts[agentId] || ''))) { form.efforts[agentId] = ''; }
    };

    const spec = (run) => DATA.specs.find(s => s.id === run.specId) || {
        title: run.specId, goal: '', team: [], limits: DATA.defaults, approvalMode: 'each-round', leadAgentName: '?'
    };
    const fmtTime = (ts) => (ts ? window.AFTime.full(ts) : '—');
    const usd = (n) => '$' + (n || 0).toFixed(2);
    // ‼️ A LIMIT OF 0 IS NO LIMIT, AND IT IS DRAWN THAT WAY. Every ceiling on
    // a mission is the user's to set and any of them may be left off; a bare
    // "0 rounds" on the row would read as a run with nothing left.
    const capN = (v, unit) => (v > 0 ? `${v}${unit ? ' ' + unit : ''}` : `∞${unit ? ' ' + unit : ''}`);
    const capUsd = (v) => (v > 0 ? usd(v) : '$∞');
    // The spec summary prints the ceiling as the user typed it, not padded to
    // cents — `$5`, not `$5.00`; only the spent-vs-budget bar pads both sides.
    const capUsdRaw = (v) => (v > 0 ? '$' + v : '$∞');
    const elapsed = (since) => {
        const s = Math.max(0, Math.floor((Date.now() - since) / 1000));
        return s < 60 ? s + 's' : Math.floor(s / 60) + 'm ' + (s % 60) + 's';
    };
    // 1s ticker for the live "now" strip — pure DOM text update, no re-render
    let tickTimer = null;
    function tick() {
        document.querySelectorAll('[data-since]').forEach(el => {
            el.textContent = elapsed(Number(el.dataset.since));
        });
    }
    function armTicker(on) {
        if (typeof setInterval !== 'function') { return; }
        if (on && !tickTimer) { tickTimer = setInterval(tick, 1000); }
        if (!on && tickTimer) { clearInterval(tickTimer); tickTimer = null; }
    }

    // Tail of the expanded step's output file. One request on expand; a 3s poll
    // only while that step is RUNNING — the host reads just the last KBs.
    function armTail(file, poll) {
        if (tailTimer) { clearInterval(tailTimer); tailTimer = null; }
        if (!file) { return; }
        if (tail.file !== file) { tail = { file, text: '', size: 0, missing: false }; }
        vscode.postMessage({ type: 'tail', file });
        if (poll && typeof setInterval === 'function') {
            tailTimer = setInterval(() => vscode.postMessage({ type: 'tail', file }), 3000);
        }
    }

    const relT = (ts) => {
        const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
        return s < 60 ? s + 's' : s < 3600 ? Math.round(s / 60) + 'm' : Math.round(s / 3600) + 'h';
    };

    // live-session status labels (mirrors the Agents view wording)
    const LIVE_LABEL = {
        working: 'working', tool: 'tool', 'waiting-permission': '⚠ permission',
        'waiting-input': 'your turn', stalled: '⚠ stalled', idle: 'idle', ended: 'ended'
    };
    // hook-event labels (mirrors the Live Feed view)
    const EV_LABEL = {
        prompt: 'prompt', toolStart: 'tool', toolEnd: 'done', permission: '⚠ PERMISSION',
        notify: 'notify', stop: 'turn end', subagent: 'subagent done', compact: 'compaction',
        start: 'session start', end: 'session end'
    };

    const STATUS_LABEL = {
        'running': 'running', 'waiting-approval': 'waiting for approval',
        'waiting-user': 'waiting for your answer', 'paused': 'paused',
        'done': 'done', 'failed': 'failed', 'cancelled': 'cancelled'
    };
    function chip(status) {
        const cls = status === 'done' ? 'ok' : (status === 'failed' ? 'bad'
            : (status === 'running' ? 'live' : 'wait'));
        return `<span class="mchip ${cls}">${C.esc(STATUS_LABEL[status] || status)}</span>`;
    }

    /**
     * ‼️ M-18 — SHORTHAND: WHICH KIND OF FAILURE, next to the status that only
     * ever said "failed".
     *
     * "failed" is the same word for an agent that is not in the fleet, a run
     * this machine refused before it started, a person pressing cancel and a
     * delegate that worked for four minutes and came back wrong — and the
     * reader's next move is different for every one of them. The class rides on
     * the row in its short form; the panel opens with the long form, what was
     * attempted, the original sentence, the evidence and what to do about it.
     */
    function failChip(f) {
        if (!f) { return ''; }
        // ‼️ What the class MEANS comes from the host's one registry
        // (core/missionFailure.ts) — the same rule the permissions and the
        // efforts follow. A copy here is how the page and the lead start being
        // told two different things about the same failure.
        const kind = (DATA.failureKinds || {})[f.class] || {};
        const retry = kind.retry || '';
        const lines = [
            f.class + (retry ? ' — retry: ' + retry : ''),
            kind.says || '',
            '',
            'Attempted: ' + (f.attempted || '—'),
            f.detail ? 'Reported: ' + f.detail : '',
            f.refs && f.refs.outputFile ? 'Output file: ' + f.refs.outputFile : '',
            f.refs && f.refs.taskId ? 'Task: ' + f.refs.taskId : '',
            f.refs && f.refs.workflowRunId ? 'Workflow run: ' + f.refs.workflowRunId : '',
            f.refs && f.refs.missionRunId ? 'Child run: ' + f.refs.missionRunId : ''
        ].filter(x => x !== '');
        return ` <span class="mchip bad" title="${C.esc(lines.join('\n'))}">${C.esc(f.class)}</span>`;
    }

    // ---------------- new-mission form ----------------

    function formHtml() {
        const agentOpts = ['<option value="">— pick the lead —</option>']
            .concat(DATA.agents.map(a =>
                `<option value="${C.esc(a.id)}"${form.leadAgentId === a.id ? ' selected' : ''}>${C.esc(a.name)}</option>`))
            .join('');
        // The engines this machine can actually run, from the same matrix every
        // other picker reads — an engine that is not installed is offered with
        // the reason it cannot be picked rather than silently missing.
        const engines = DATA.engines || [];
        const engineOpts = (sel, blank) => ['<option value="">' + blank + '</option>']
            .concat(engines.map(e =>
                `<option value="${C.esc(e.id)}"${sel === e.id ? ' selected' : ''}${e.ready ? '' : ' disabled'}>`
                + `${C.esc(e.label)}${e.ready ? '' : ' — not ready on this machine'}</option>`))
            .join('');
        /**
         * ‼️ U-59 — WHICH ENGINES A DOLLAR CEILING CAN ACTUALLY BIND, ASKED OF
         * THE MATRIX INSTEAD OF TYPED INTO THE LABEL.
         *
         * Both budget fields named engines by hand — "Only Claude Code states a
         * per-turn price", "the ONLY hard budget for a team delegating on Codex,
         * Gemini or Antigravity" — and OpenCode arrived stating its own price on
         * every turn, which made the first sentence false and the second short
         * by one. Getting that wrong on a BUDGET control is not cosmetic: the
         * user reads it to decide which of the two ceilings is the real fence.
         */
        const engNames = list => list.length < 2 ? list.join('')
            : list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1];
        const priced = engNames(engines.filter(e => e.reportsCost).map(e => e.label));
        const unpriced = engNames(engines.filter(e => !e.reportsCost).map(e => e.label));
        // ‼️ The permission vocabulary comes from the host's one list, the same
        // constant the Tasks and Console launchers read — never a copy here.
        const perms = DATA.permissions || [];
        const permOpts = (sel) => ['<option value="">— engine default —</option>']
            .concat(perms.filter(p => p.id).map(p =>
                `<option value="${C.esc(p.id)}"${sel === p.id ? ' selected' : ''}>${C.esc(p.label)}</option>`))
            .join('');
        // MIRROR: the control is too narrow to say what it means, so its tooltip
        // opens with what it is set to RIGHT NOW, then explains the field.
        const permTitle = (sel) => {
            const cur = perms.find(p => p.id === (sel || ''));
            return (sel || 'engine default') + (cur && cur.detail ? ' — ' + cur.detail : '')
                + '\n\nPermissions: what this member\'s delegations may do without stopping to ask.'
                + ' A delegation is headless — there is nobody in it to answer a prompt — so this is spent'
                + ' up front or never. Empty leaves the engine\'s own default; a run refused by it still'
                + ' ends "successfully", so a delegate that did nothing looks like one that worked.'
                + ' Set plan for a reviewer that must not write.';
        };
        // ‼️ M-18 — the effort vocabulary, from the host's one list too. Same
        // rule as the permissions above: never a copy typed in here, or the two
        // surfaces start offering different words for the same setting.
        const efforts = DATA.efforts || [];
        // ‼️ U-64 — THE EFFORTS THAT ENGINE REALLY HAS, not the fleet-wide six.
        // `AFEngine.efforts` answers per engine AND per model, so a member put
        // on an engine with no effort flag is offered nothing rather than five
        // words its launch will refuse. The full list is still the fallback for
        // an engine whose catalog has not been fetched yet.
        const effortRowsFor = (engine, model) => window.AFEngine.efforts(launchView(), engine, model) || [];
        const effortOpts = (sel, rows) => ['<option value="">— resolved —</option>']
            .concat((rows || efforts).filter(e => e.id).map(e =>
                `<option value="${C.esc(e.id)}"${sel === e.id ? ' selected' : ''}>${C.esc(e.label)}</option>`))
            .join('');
        // MIRROR: too narrow to say what it is, so the tooltip opens with the
        // value it holds RIGHT NOW and then explains the field.
        const effortTitle = (sel, rows) => {
            const cur = (rows && rows.length ? rows : efforts).find(e => e.id === (sel || ''));
            return (sel || 'resolved') + (cur && cur.detail ? ' — ' + cur.detail : '')
                + '\n\nEffort: how hard this member thinks per turn. Leave it empty and it is RESOLVED'
                + ' the way a launch resolves it — this agent\'s own default for the engine it lands on,'
                + ' then agentFarm.launchDefaults, then the CLI\'s own choice. Not every engine has such'
                + ' a setting; one that does not refuses the run up front rather than passing a flag it'
                + ' does not know.';
        };
        const teamRows = DATA.agents.map((a, i) => {
            // ‼️ U-64 — the row's OWN engine decides what its model box suggests
            // and whether its effort box has anything to offer. Resolved here,
            // not read off the select, so a member that says nothing inherits
            // the mission's engine the same way the launch will.
            const eng = effEngine(a.id);
            const eRows = effortRowsFor(eng, form.models[a.id] || '');
            const noEffort = !eRows.length;
            const engLabel = (engines.find(e => e.id === eng) || {}).label || eng;
            // ‼️ U-97 — THE ROW READS IN THE ORDER IT RESOLVES:
            // Agent/role → Engine → Model → Effort → Permissions. Model depends
            // on the engine and effort depends on the model, so a control never
            // stands to the LEFT of the thing that decides what it may offer.
            return `
            <div class="tmrow">
                <label><input type="checkbox" id="tm-${i}" data-team="${C.esc(a.id)}"${form.team[a.id] ? ' checked' : ''}> ${C.esc(a.name)}</label>
                <input type="text" id="rl-${i}" data-role="${C.esc(a.id)}" placeholder="role (optional — e.g. coder, reviewer)"
                    value="${C.esc(form.roles[a.id] || '')}" ${form.team[a.id] ? '' : 'disabled'}>
                <select id="en-${i}" class="mdl" data-engine="${C.esc(a.id)}"
                    title="Engine: which CLI this member's delegations run on — empty = the mission's engine below (now ${C.esc(engLabel)}). Changing it re-reads that engine's models and efforts into the two boxes on this row."
                    ${form.team[a.id] ? '' : 'disabled'}>${engineOpts(form.engines[a.id] || '', '— mission engine —')}</select>
                <select id="md-${i}" class="mdl" data-model="${C.esc(a.id)}"
                    title="${C.esc((form.models[a.id] || 'agent default')
                        + (modelKnown(eng, form.models[a.id] || '') ? ''
                            : ' — ⚠ ' + engLabel + ' does not publish this model. It was kept because it was already'
                              + ' set; picking anything else here loses it, and the launch may be refused.')
                        + '\n\nModel for this member\'s delegations. Empty = the agent\'s own default / model policy.'
                        + ' The list is ' + engLabel + '\'s own catalog as this window last read it; change the engine'
                        + ' beside it and a model that catalog does not carry is dropped rather than launched.')}"
                    ${form.team[a.id] ? '' : 'disabled'}>${modelOptsFor(eng, form.models[a.id] || '')}</select>
                <select id="ef-${i}" class="mdl" data-effort="${C.esc(a.id)}"
                    title="${C.esc(noEffort
                        ? engLabel + ' has no effort setting — this member runs at whatever that CLI thinks is normal, and a launch given an effort here would be refused.'
                        : effortTitle(form.efforts[a.id] || '', eRows))}"
                    ${form.team[a.id] && !noEffort ? '' : 'disabled'}>${noEffort
                        // SHORTHAND: the box is narrow and the engine's name does
                        // not fit in it. The short form goes on the control, the
                        // long one is already in the tooltip above.
                        ? '<option value="">— no effort —</option>'
                        : effortOpts(form.efforts[a.id] || '', eRows)}</select>
                <select id="pm-${i}" class="mdl" data-perm="${C.esc(a.id)}"
                    title="${C.esc(permTitle(form.perms[a.id] || ''))}"
                    ${form.team[a.id] ? '' : 'disabled'}>${permOpts(form.perms[a.id] || '')}</select>
            </div>`;
        }).join('');
        // ‼️ NO FIELD HERE HAS A MAXIMUM, AND EVERY ONE OF THEM TAKES 0.
        // The ceilings belong to whoever pays for the run; the form's job is to
        // say so on every field rather than to argue with the figure typed.
        const lim = (key, label, hint) => `
            <label class="limfield" title="${C.esc(hint + ' — 0 = UNLIMITED on this axis; no upper cap is imposed.')}">${label}
                <input type="number" id="lim-${key}" min="0" value="${C.esc(String(form[key] !== '' ? form[key] : DATA.defaults[key]))}">
            </label>`;
        const adaptive = form.mode === 'adaptive';
        /**
         * ‼️ U-64 — THE ONE CHOICE THE FORM OPENS WITH, and the only one that
         * changes what the rest of it asks. Segmented rather than a select
         * because it is not a setting among settings: it decides whether the
         * user is writing a RECIPE (classic — lead, team, rounds) or an OUTCOME
         * (adaptive — result, constraints, criteria). Classic is first and
         * pre-selected, so a hand that opens this form and types the way it
         * always has starts exactly the mission it always started.
         */
        const modeSeg = `<div class="modeseg" role="radiogroup" aria-label="Kind of mission">
            <button type="button" class="segbtn${adaptive ? '' : ' on'}" id="f-mode-classic" role="radio"
                aria-checked="${adaptive ? 'false' : 'true'}"
                title="Classic Mission — you give the RECIPE. You name the lead and the team, the lead plans round by round and delegates, and every delegation is a normal headless task. This is what a mission has always been and it stays the default; a run with no mode recorded is one of these.">Classic Mission</button>
            <button type="button" class="segbtn${adaptive ? ' on' : ''}" id="f-mode-adaptive" role="radio"
                aria-checked="${adaptive ? 'true' : 'false'}"
                title="Adaptive Objective — you give the OUTCOME. You say what has to be true when this is done, what the run may not do, and how it will be judged; the lead builds the strategy at runtime, picks who works on what, and cannot close as success until an evaluation ties the criteria to real work. Everything else — who leads, who is in the pool, the limits, the engines — has a default and lives under Advanced.">Adaptive Objective</button>
        </div>`;
        // ‼️ Adaptive-only inputs. They are drawn from `form`, which HOLDS them
        // while classic is showing: switching mode hides a field, it never
        // clears one, and the same is true the other way round.
        const conRows = form.constraints.map((c, i) => `
            <div class="listrow">
                <input type="text" id="cn-${i}" class="grow" placeholder="what this run may NOT do — e.g. do not touch files outside media/"
                    value="${C.esc(c)}">
                <button type="button" class="chip" id="cn-del-${i}" title="Drop this constraint">✕</button>
            </div>`).join('');
        const critRows = form.criteria.map((c, i) => `
            <div class="listrow">
                <span class="critid" title="The criterion's id — evaluations refer to it by this name for the life of the run">c${i + 1}</span>
                <input type="text" id="cr-${i}" class="grow" placeholder="what has to be TRUE for this to be done — judged against real work, not against effort"
                    value="${C.esc(c.text)}">
                <label class="reqbox" title="${C.esc('Required: the run cannot close as success until this one is met — a required criterion left unmet is a partial or a failure, said out loud.\n\nOptional: judged and reported, but it does not hold the verdict.')}">
                    <input type="checkbox" id="cq-${i}"${c.required ? ' checked' : ''}> required</label>
                <button type="button" class="chip" id="cr-del-${i}" title="Drop this criterion">✕</button>
            </div>`).join('');
        const objectiveBlock = !adaptive ? '' : `
            <div class="frow"><span class="flabel">Constraints
                <span class="muted small">— what this run may NOT do (optional)</span></span>
                ${conRows}
                <button type="button" class="chip" id="cn-add" title="Add another constraint line">+ constraint</button></div>
            <div class="frow"><span class="flabel">Success criteria <span class="req">at least one</span>
                <span class="muted small">— how the result is judged</span></span>
                ${critRows}
                <button type="button" class="chip" id="cr-add" title="Add another criterion line">+ criterion</button></div>
            <div class="frow"><label>Autonomy
                <select id="f-autonomy">
                    <option value="ask-when-unsure"${form.autonomy !== 'decide-alone' ? ' selected' : ''}>ask when unsure — the lead stops and asks you rather than guessing</option>
                    <option value="decide-alone"${form.autonomy === 'decide-alone' ? ' selected' : ''}>decide alone — the lead never asks; it decides and records why</option>
                </select></label>
                <span class="muted small">Only about JUDGEMENT calls. The hard limits and the approval gate below still apply either way.</span></div>`;
        // Everything the adaptive user is not being asked to decide. Classic
        // draws this block plainly, exactly as it always has.
        const commonBlock = `
            <div class="frow"><label>${adaptive ? 'Lead agent' : 'Lead agent <span class="req">required</span>'} <select id="f-lead">${agentOpts}</select></label>
                <span class="muted small">${adaptive
                    ? 'Optional here — leave it and the first of the pool leads, which is what the run records. Its CLAUDE.md is the orchestration identity.'
                    : 'Its CLAUDE.md is the orchestration identity — a planning-minded agent leads best.'}</span></div>
            <div class="frow"><span class="flabel">${adaptive
                ? 'Pool <span class="muted small">— whom the lead may draw on; empty = the whole fleet</span>'
                : 'Team <span class="req">at least one</span>'}</span>${teamRows}</div>
            <div class="frow"><label>Workdir <input type="text" id="f-workdir" placeholder="(optional) target repo/folder — delegations run inside it" value="${C.esc(form.workdir)}"></label>
                <button class="secondary small" id="f-browse">Browse…</button>
                <span class="muted small">With a workdir set, two writers never run in parallel.</span></div>
            <div class="frow limrow">
                ${lim('maxCostUSD', 'Max cost $', 'Hard budget: the planner is forced to finish when spent. Only an engine that states a per-turn price can move this figure — ' + priced + ' do; on ' + unpriced + ' it can never be reached, and the token ceiling beside it is what fences that run')}
                ${lim('maxTokens', 'Max tokens', 'The ceiling that binds when the engine states no price: total tokens across the whole mission. This is the ONLY hard budget for a team delegating on ' + unpriced)}
                ${lim('maxRounds', 'Max rounds', 'Planner decisions')}
                ${lim('maxTasks', 'Max tasks', 'Total delegations')}
                ${lim('maxMinutes', 'Max minutes', 'Wall clock; waiting on you does not count')}
                ${lim('maxParallel', 'Max parallel', 'Delegations per wave; 0 runs a whole round in one wave')}
                <span class="muted small">These are your ceilings, not ours — nothing is capped from above.
                <b>0 on any field = unlimited</b>, and a mission with no ceilings stops only when the lead
                finishes it, you cancel it, or the fleet budget bites.</span>
            </div>
            <div class="frow"><label>Delegation engine
                <select id="f-engine">${engineOpts(form.engine, 'Claude Code (default)')}</select></label>
                <span class="muted small">Which CLI the team's delegations run on; a member can override it on its own row.
                ‼️ The PLANNER always runs on Claude Code — its control flow parses that CLI's JSON envelope and spends
                <code>--disallowedTools</code> and <code>--max-turns</code>, which the others do not have. Delegation engine
                and planner engine are separate axes on purpose.</span></div>
            <div class="frow"><label>Planner model
                <select id="f-planner" title="${C.esc((form.plannerModel || 'the lead\'s own default')
                    + '\n\nModel for the LEAD\'s planning calls only; delegates keep their own.'
                    + ' The planner always runs on Claude Code, so this list is Claude\'s catalog.')}"
                    >${modelOptsFor('claude', form.plannerModel, '— the lead\'s own default —')}</select></label>
                <span class="muted small" title="A delegation is a launch, so it resolves the same way one does (M-18). Per field, highest first: what the member's row says · the mission's engine and workdir · that agent's own default for the engine it lands on (Settings › per-agent, per-engine) · agentFarm.launchDefaults · the CLI's own choice. Claude's model and effort skip the per-agent layer on purpose: Claude Code reads that agent's .claude/settings.local.json itself, so passing it back would be a second source of truth over a file you may have edited by hand. Each step's Agent cell says what it ended up with and who decided it.">Who runs on what: planner = Claude Code with this model (else the lead's own default) · each delegation = the member's row, then the mission engine above, then that agent's own default for that engine, then your fleet defaults.</span></div>
            <div class="frow"><label>Approval
                <select id="f-approval">
                    <option value="each-round"${form.approvalMode !== 'auto' ? ' selected' : ''}>each round — approve every delegation round (recommended)</option>
                    <option value="auto"${form.approvalMode === 'auto' ? ' selected' : ''}>auto — run without gates (hard limits still apply)</option>
                </select></label></div>`;
        return `<div class="card" id="mform">
            <h2 style="margin-top:0">New Mission</h2>
            ${modeSeg}
            <p class="muted small">${adaptive
                ? 'You give the outcome; the lead builds the strategy at runtime, chooses who works on what and combines the primitives it needs. It cannot close as <b>success</b> until a structured evaluation ties every required criterion to real work — partial and failed are honest endings and it will use them.'
                : 'The lead agent plans round by round and delegates to the team; every delegation runs as a normal headless task. Hard limits below fence the cost — the mission ends honestly when one is hit.'}</p>
            <div class="frow"><label>Title <input type="text" id="f-title" placeholder="(optional — the goal's first words otherwise)" value="${C.esc(form.title)}"></label></div>
            <div class="frow"><label>${adaptive ? 'Outcome' : 'Goal'} <span class="req">required</span>
                <textarea id="f-goal" rows="4" placeholder="${adaptive
                    ? 'What do you want to end up with? Describe the RESULT, not the steps — what has to be true when this is done.'
                    : 'What should this mission achieve? Be concrete: repo, deliverable, what counts as done.'}">${C.esc(form.goal)}</textarea></label></div>
            ${objectiveBlock}
            ${adaptive ? `<div class="colsec advsec">
                <div class="colhead" id="f-adv" title="Everything an objective already has a default for: who leads, who is in the pool, where it runs, the hard limits, which engine the delegations use and whether each round is gated. Open it only when you want to overrule one.">
                    <span class="carets">${advOpen ? '▾' : '▸'}</span> <b>Advanced</b>
                    <span class="muted small">lead · pool · workdir · limits · engines · approval</span>
                </div>
                ${advOpen ? `<div class="advbody">${commonBlock}</div>` : ''}
            </div>` : commonBlock}
            ${formErr ? `<div class="ferr">⚠ ${C.esc(formErr)}</div>` : ''}
            <div class="frow">
                <button id="f-start">${adaptive ? 'Start objective' : 'Start mission'}</button>
                <button class="secondary" id="f-cancel">Cancel</button>
            </div>
        </div>`;
    }

    function readForm() {
        // ‼️ U-64 — READ WHAT IS ON SCREEN, KEEP WHAT IS NOT. An adaptive form
        // with Advanced folded has no lead select and no limit boxes in the
        // DOM at all; reading them blind threw, and reading them as '' would
        // have silently wiped a value the user typed before folding it away.
        // So every read is guarded and a missing control leaves `form` alone.
        const val = (id, keep) => {
            const el = document.getElementById(id);
            return el ? el.value : keep;
        };
        form.title = val('f-title', form.title);
        form.goal = val('f-goal', form.goal);
        form.leadAgentId = val('f-lead', form.leadAgentId);
        form.workdir = val('f-workdir', form.workdir);
        form.plannerModel = val('f-planner', form.plannerModel);
        form.engine = val('f-engine', form.engine);
        DATA.agents.forEach((a, i) => {
            const cb = document.getElementById('tm-' + i);
            if (!cb) { return; }
            form.team[a.id] = !!cb.checked;
            form.roles[a.id] = val('rl-' + i, form.roles[a.id]);
            form.models[a.id] = val('md-' + i, form.models[a.id]);
            form.engines[a.id] = val('en-' + i, form.engines[a.id]);
            form.perms[a.id] = val('pm-' + i, form.perms[a.id]);
            form.efforts[a.id] = val('ef-' + i, form.efforts[a.id]);
        });
        ['maxRounds', 'maxTasks', 'maxCostUSD', 'maxTokens', 'maxMinutes', 'maxParallel'].forEach(k => {
            form[k] = val('lim-' + k, form[k]);
        });
        form.approvalMode = val('f-approval', form.approvalMode);
        // The objective rows exist only while Adaptive is showing. Gated on the
        // mode rather than on finding the elements, because that is the fact
        // that decides it: in classic they are not drawn, and a read there
        // could only ever return the empty string over what was typed.
        if (form.mode === 'adaptive') {
            form.autonomy = val('f-autonomy', form.autonomy);
            form.constraints = form.constraints.map((c, i) => val('cn-' + i, c));
            form.criteria = form.criteria.map((c, i) => {
                const box = document.getElementById('cq-' + i);
                return { text: val('cr-' + i, c.text), required: box ? !!box.checked : c.required };
            });
        }
    }

    function submitForm() {
        readForm();
        formErr = '';
        /**
         * ‼️ U-64 — A CLASSIC START POSTS THE MESSAGE IT ALWAYS POSTED. The
         * adaptive keys are ADDED, never a `mode: 'classic'` written into every
         * message: the host reads anything that is not the exact string
         * 'adaptive' as classic, and a payload that grows keys nobody reads is
         * how a "backwards compatible" change stops being one.
         */
        const input = {
            title: form.title, goal: form.goal, leadAgentId: form.leadAgentId,
            workdir: form.workdir, plannerModel: form.plannerModel,
            engine: form.engine,
            team: DATA.agents.filter(a => form.team[a.id])
                .map(a => ({
                    agentId: a.id, role: form.roles[a.id] || '',
                    model: form.models[a.id] || '', engine: form.engines[a.id] || '',
                    effort: form.efforts[a.id] || '',
                    permissionMode: form.perms[a.id] || ''
                })),
            maxRounds: form.maxRounds, maxTasks: form.maxTasks, maxCostUSD: form.maxCostUSD,
            maxTokens: form.maxTokens,
            maxMinutes: form.maxMinutes, maxParallel: form.maxParallel,
            approvalMode: form.approvalMode
        };
        if (form.mode === 'adaptive') {
            input.mode = 'adaptive';
            input.autonomy = form.autonomy;
            input.constraints = form.constraints.map(c => String(c || '').trim()).filter(Boolean);
            input.successCriteria = form.criteria
                .map((c, i) => ({ id: 'c' + (i + 1), text: String(c.text || '').trim(), required: !!c.required }))
                .filter(c => c.text);
            // The pool IS the team rows — one cast list, ticked once. Empty is a
            // real answer here (the whole fleet), which is why `team` still
            // rides along untouched and the host picks the one its mode means.
            input.pool = input.team;
        }
        vscode.postMessage({ type: 'create', input });
    }

    // ---------------- run detail ----------------

    /** Live status chip for a running step's agent (from the hook listener). */
    function stepLive(s) {
        if (s.status !== 'running' || !DATA.live || !DATA.live.agents) { return ''; }
        const st = DATA.live.agents[s.agentId];
        if (!st) { return ''; }
        const label = (LIVE_LABEL[st.status] || st.status) + (st.tool ? ` (${st.tool})` : '');
        const cls = st.status === 'waiting-permission' || st.status === 'stalled' ? 'alert' : 'busy';
        return ` <span class="lchip ${cls}" title="Live session status from Claude Code hooks">${C.esc(label)}</span>`;
    }

    function stepDetail(s) {
        const running = s.status === 'running';
        const body = tail.file === s.outputFile
            ? (tail.missing ? '(output file not readable yet)' : (tail.text || '(empty so far)'))
            : '(loading…)';
        return `<tr class="sdetail"><td colspan="7">
            <div class="sdlabel">Prompt sent to <b>${C.esc(s.agentName)}</b>${s.expect ? ` · success criteria: <i>${C.esc(s.expect)}</i>` : ''}</div>
            <pre class="sdpre">${C.esc(s.prompt)}</pre>
            ${s.outputFile ? `
            <div class="sdlabel">${running ? '<span class="nowdot small"></span> Output — live tail, updates every 3s' : 'Output — last part'}
                · <a data-openfile="${C.esc(s.outputFile)}" title="Open the full archived output">open full file</a></div>
            <pre class="sdpre tailpre" id="tailbox">${C.esc(body)}</pre>`
            : `<p class="muted small">No output file yet${s.status === 'queued' ? ' — the task has not started' : ''}.</p>`}
        </td></tr>`;
    }

    function stepRow(s, run) {
        const open = expandedStep === s.id;
        const ctx = window.AFCtx.row('afMissionStep', {
            run: run ? run.id : '', step: s.id, agentId: s.agentId, afOutput: !!s.outputFile
        });
        return `<tr class="srow" data-step="${C.esc(s.id)}" ${ctx}
            title="Click to open this delegation: full prompt + live output — ${window.AFCtx.HINT}">
            <td class="stoggle">${open ? '▾' : '▸'}</td>
            <td${s.runNote ? ` title="${C.esc(s.agentName + ' ran with — ' + s.runNote
                + '\nUnmarked values were stated on the member; (agent) is this agent\'s own default for that'
                + ' engine, (fleet) is agentFarm.launchDefaults, (mission) is the mission-wide engine.')}"` : ''}>${C.esc(s.agentName)}${stepLive(s)}</td>
            <td>${C.esc(s.title)}${s.readonly ? ' <span class="mchip ro">read-only</span>' : ''}${s.note ? ` <span class="muted small">(${C.esc(s.note)})</span>` : ''}</td>
            <td>${chip(s.status)}${failChip(s.failure)}</td>
            <td class="num">${s.tokens ? C.fmtTok(s.tokens) : '—'}</td>
            <td class="num">${s.costUSD !== undefined ? usd(s.costUSD) : '—'}</td>
            <td>${s.outputFile ? `<a data-openfile="${C.esc(s.outputFile)}" title="Open the archived output">output</a>` : ''}</td>
        </tr>` + (open ? stepDetail(s) : '');
    }

    /** Planner + delegate totals of one round — always "N tok · $x" together,
     *  exactly like the session viewer's turn bands. */
    function roundStats(r) {
        const tok = (r.plannerTokens || 0) + r.steps.reduce((a, s) => a + (s.tokens || 0), 0);
        const cost = (r.plannerCostUSD || 0) + r.steps.reduce((a, s) => a + (s.costUSD || 0), 0);
        return (tok || cost) ? `${C.fmtTok(tok)} tok · ${usd(cost)}` : '';
    }

    /** Display-only run totals. Pre-2.68 runs carry no per-round planner
     *  tokens — the host backfills the whole planner session's total as
     *  plannerSessionTokens, use it when the rounds have nothing. */
    function runTokens(r) {
        let planner = 0, steps = 0;
        r.rounds.forEach(rd => {
            planner += rd.plannerTokens || 0;
            rd.steps.forEach(s => { steps += s.tokens || 0; });
        });
        if (!planner && r.plannerSessionTokens) { planner = r.plannerSessionTokens; }
        return planner + steps;
    }

    /** Who ate the tokens: per-agent totals as shares of the run's whole.
     *  Planner tokens belong to the lead; steps to their delegate agents. */
    function tokenShares(r, sp) {
        const by = {};
        let planner = 0;
        r.rounds.forEach(rd => {
            planner += rd.plannerTokens || 0;
            rd.steps.forEach(s => { if (s.tokens) { by[s.agentName] = (by[s.agentName] || 0) + s.tokens; } });
        });
        if (!planner && r.plannerSessionTokens) { planner = r.plannerSessionTokens; }
        if (planner) {
            const lead = sp.leadAgentName + ' (lead)';
            by[lead] = (by[lead] || 0) + planner;
        }
        const total = Object.keys(by).reduce((a, k) => a + by[k], 0);
        if (!total) { return []; }
        return Object.keys(by).map(name => ({ name, tok: by[name], pct: Math.round(100 * by[name] / total) }))
            .sort((a, b) => b.tok - a.tok);
    }

    /** Delegation totals of a run: steps overall + how many failed. */
    function runSteps(r) {
        let total = 0, failed = 0;
        r.rounds.forEach(rd => rd.steps.forEach(s => {
            total++;
            if (s.status === 'failed') { failed++; }
        }));
        return { total, failed };
    }

    // ---- sorting: every column and then some, sessions-table style ----
    const RUN_STATUS_RANK = {
        running: 6, 'waiting-approval': 5, 'waiting-user': 4,
        paused: 3, done: 2, failed: 1, cancelled: 0
    };
    const VERDICT_RANK = { success: 3, partial: 2, failed: 1 };
    const RUN_SORTS = [
        { id: 'recent', label: 'Recent', key: r => r.startedAt || 0 },
        { id: 'status', label: 'Status (active first)', key: r => RUN_STATUS_RANK[r.status] || 0 },
        { id: 'verdict', label: 'Verdict', key: r => (r.result && VERDICT_RANK[r.result.verdict]) || 0 },
        { id: 'title', label: 'Mission A–Z', key: r => spec(r).title, str: true },
        { id: 'lead', label: 'Lead A–Z', key: r => spec(r).leadAgentName, str: true },
        { id: 'team', label: 'Team size', key: r => spec(r).team.length },
        { id: 'rounds', label: 'Rounds', key: r => r.rounds.length },
        { id: 'tasks', label: 'Tasks', key: r => runSteps(r).total },
        { id: 'failed', label: 'Failed tasks', key: r => runSteps(r).failed },
        { id: 'tokens', label: 'Tokens', key: r => runTokens(r) },
        { id: 'cost', label: 'Cost', key: r => r.totalCostUSD || 0 },
        { id: 'duration', label: 'Duration', key: r => (r.endedAt || Date.now()) - r.startedAt - (r.waitedMs || 0) }
    ];

    function sortedRuns(rows) {
        const def = RUN_SORTS.find(s => s.id === runSort) || RUN_SORTS[0];
        return rows.slice().sort((a, b) => {
            const d = def.str
                ? String(def.key(a)).localeCompare(String(def.key(b)))
                : def.key(a) - def.key(b);
            return runSortAsc ? d : -d;
        });
    }

    // ---- filtering: same criteria as the sorts — selections + min/max ranges ----
    const RUN_STATUSES = ['running', 'waiting-approval', 'waiting-user', 'paused', 'done', 'failed', 'cancelled'];
    const VERDICTS = ['success', 'partial', 'failed'];
    /**
     * ‼️ U-52 — THE NAMED SUBSETS OF THE STATUS AXIS, on the one control in the
     * extension where they were still spelt out a chip at a time.
     *
     * Seven statuses, and nobody reads them as seven: they are three questions.
     * "Which of these need me?" is the one this page exists to answer, and
     * asking it meant pressing two chips out of seven and knowing which two —
     * a run waiting for an approval and a run waiting for an answer are the
     * same fact to the person who has to do something about it.
     *
     * These sit beside the chips rather than inside a picker because the chips
     * ARE the control here; the bar is the same as everywhere else (see
     * test/test_presets.js): a subset gets a name only if somebody would say it
     * out loud and it is worth more than one press.
     */
    const STATUS_GROUPS = [
        {
            id: 'needsyou', label: 'Waiting on you',
            values: ['waiting-approval', 'waiting-user'],
            title: 'The runs that have stopped and cannot go on until you answer or approve.'
        },
        {
            id: 'live', label: 'Still going',
            values: ['running', 'waiting-approval', 'waiting-user', 'paused'],
            title: 'Everything that has not finished — working, waiting on you, or held.'
        },
        {
            id: 'over', label: 'Finished',
            values: ['done', 'failed', 'cancelled'],
            title: 'Everything that is over, however it ended.'
        }
    ];
    /** value getters the range filters run over (duration in minutes). */
    const RANGE_KEYS = [
        { id: 'tokens', label: 'Tokens', get: r => runTokens(r) },
        { id: 'cost', label: 'Cost $', get: r => r.totalCostUSD || 0 },
        { id: 'rounds', label: 'Rounds', get: r => r.rounds.length },
        { id: 'tasks', label: 'Tasks', get: r => runSteps(r).total },
        { id: 'duration', label: 'Minutes', get: r => Math.round(((r.endedAt || Date.now()) - r.startedAt - (r.waitedMs || 0)) / 60000) }
    ];

    function activeFilterCount() {
        let n = filters.status.length + filters.verdict.length
            + (filters.leads ? 1 : 0) + (filters.agents ? 1 : 0)
            + (filters.from ? 1 : 0) + (filters.to ? 1 : 0);
        RANGE_KEYS.forEach(k => {
            const rg = filters.ranges[k.id];
            if (rg) { n += (rg.min !== undefined ? 1 : 0) + (rg.max !== undefined ? 1 : 0); }
        });
        return n;
    }

    function filteredRuns(rows) {
        return rows.filter(r => {
            const sp = spec(r);
            if (filters.status.length && filters.status.indexOf(r.status) < 0) { return false; }
            if (filters.verdict.length && !(r.result && filters.verdict.indexOf(r.result.verdict) >= 0)) { return false; }
            if (filters.leads && filters.leads.indexOf(sp.leadAgentName) < 0) { return false; }
            if (filters.agents && !sp.team.some(m => filters.agents.indexOf(m.agentName) >= 0)) { return false; }
            if (filters.from) {
                const t = Date.parse(filters.from);
                if (!isNaN(t) && r.startedAt < t) { return false; }
            }
            if (filters.to) {
                const t = Date.parse(filters.to);
                if (!isNaN(t) && r.startedAt >= t + 24 * 3600 * 1000) { return false; } // inclusive end day
            }
            for (const k of RANGE_KEYS) {
                const rg = filters.ranges[k.id];
                if (!rg) { continue; }
                const v = k.get(r);
                if (rg.min !== undefined && v < rg.min) { return false; }
                if (rg.max !== undefined && v > rg.max) { return false; }
            }
            return true;
        });
    }

    /** The lead / team names present in the run list — the pickers' options. */
    function filterFacets() {
        const leads = [];
        const agents = [];
        DATA.runs.forEach(r => {
            const sp = spec(r);
            if (leads.indexOf(sp.leadAgentName) < 0) { leads.push(sp.leadAgentName); }
            sp.team.forEach(m => { if (agents.indexOf(m.agentName) < 0) { agents.push(m.agentName); } });
        });
        return { leads: leads.sort(), agents: agents.sort() };
    }

    /** Filter panel: selection chips + pickers + range inputs, viewer/settings idiom. */
    function filterPanelHtml() {
        if (!filtersOpen) { return ''; }
        const facets = filterFacets();
        const selChip = (id, label, on) =>
            `<button class="chip${on ? ' on' : ''}" id="${id}">${C.esc(label)}</button>`;
        const rangeInputs = RANGE_KEYS.map(k => {
            const rg = filters.ranges[k.id] || {};
            return `<label class="fltrange">${k.label}
                <input type="number" id="fr-${k.id}-min" placeholder="min" value="${rg.min !== undefined ? rg.min : ''}">–<input type="number" id="fr-${k.id}-max" placeholder="max" value="${rg.max !== undefined ? rg.max : ''}">
            </label>`;
        }).join('');
        return `<div class="fltpanel">
            <div class="fltrow"><span class="muted small">Status:</span>
                ${RUN_STATUSES.map(s => selChip('fs-' + s, STATUS_LABEL[s] || s, filters.status.indexOf(s) >= 0)).join(' ')}
                <span class="fltgroups">${STATUS_GROUPS.map(g =>
                    `<a id="fg-${g.id}" role="button" tabindex="0" title="${C.esc(g.title)}">${C.esc(g.label)}</a>`).join(' · ')}
                    · <a id="fg-none" role="button" tabindex="0" title="Clear the status filter — every status is listed again.">Clear</a></span></div>
            <div class="fltrow"><span class="muted small">Verdict:</span>
                ${VERDICTS.map(v => selChip('fv-' + v, v, filters.verdict.indexOf(v) >= 0)).join(' ')}
                ${window.AFFilter.multi({
                    id: 'flt-leads', label: 'Lead', options: facets.leads, selected: filters.leads,
                    title: 'Which lead agents to list — tick any combination'
                })}
                ${window.AFFilter.multi({
                    id: 'flt-agents', label: 'Team has', options: facets.agents, selected: filters.agents,
                    allLabel: 'any', title: 'Keep runs whose team includes any of the ticked agents'
                })}</div>
            <div class="fltrow">${rangeInputs}
                <label class="fltrange">Started <input type="date" id="f-from" value="${C.esc(filters.from)}">–<input type="date" id="f-to" value="${C.esc(filters.to)}"></label>
                <button class="chip" id="f-clear" title="Reset every filter">Clear</button></div>
        </div>`;
    }

    /** Rich row tooltip: everything characterizing the run at a glance. */
    function runTooltip(r, sp) {
        const st = runSteps(r);
        const mins = Math.max(0, Math.round(((r.endedAt || Date.now()) - r.startedAt - (r.waitedMs || 0)) / 60000));
        const shares = tokenShares(r, sp);
        const lines = [
            // ‼️ U-64 — WHICH KIND OF RUN THIS IS, first, because it changes what
            // every line under it means: a classic run's "team" is the cast the
            // user named, an adaptive one's is whoever the lead bound at
            // runtime. A spec with no mode recorded IS classic — the same rule
            // the host applies, never a guess from the fields present.
            sp.mode === 'adaptive'
                ? `mode: Adaptive Objective — outcome given, strategy built at runtime`
                : `mode: Classic Mission — lead + team + rounds, as given`,
            `goal: ${sp.goal}`,
            `lead: ${sp.leadAgentName}${sp.plannerModel ? ` (planner: ${sp.plannerModel})` : ''}`,
            `team: ${sp.team.map(m => m.agentName + (m.role ? ` — ${m.role}` : '')
                + ((m.engine || sp.engine) ? ` <${m.engine || sp.engine}>` : '')
                + (m.model ? ` [${m.model}]` : '')
                // What this member was allowed to do unattended. Absent = the
                // engine default, and the reader has to be able to tell the two
                // apart to explain a delegate that called no tool.
                + (m.permissionMode ? ` {${m.permissionMode}}` : '')
                // ‼️ M-18 — and how hard it was told to think. Blank does NOT
                // mean "normal": it means resolved from this agent's own default
                // and then the fleet's, which is a different fact and the one a
                // reader comparing two members needs.
                + (m.effort ? ` ~${m.effort}` : '')).join(', ')}`,
            // ‼️ THE ENGINE AND THE TOKEN CEILING BELONG IN THE SUMMARY (X-35).
            // A run whose delegations went to Codex and whose only real fence
            // was the token cap used to read as a $-budgeted Claude run.
            `engines: delegations ${sp.engine || 'claude'} · planner claude (always)`,
            `limits: ${capUsdRaw(sp.limits.maxCostUSD)}${sp.limits.maxTokens ? ` · ${C.fmtTok(sp.limits.maxTokens)} tok` : ' · no token ceiling'} · ${capN(sp.limits.maxRounds, 'rounds')} · ${capN(sp.limits.maxTasks, 'tasks')} · ${capN(sp.limits.maxMinutes, 'min')} · ${capN(sp.limits.maxParallel, 'parallel')}`,
            `delegations: ${st.total}${st.failed ? ` (${st.failed} failed)` : ''} · ${mins} min${sp.workdir ? ` · workdir: ${sp.workdir}` : ''} · approval: ${sp.approvalMode}`
        ];
        if (shares.length) { lines.push(`tokens: ${shares.map(x => `${x.name} ${x.pct}%`).join(' · ')}`); }
        if (r.result) { lines.push(`${r.result.verdict}: ${r.result.summary.slice(0, 200)}`); }
        if (r.note) { lines.push(`note: ${r.note.slice(0, 160)}`); }
        return lines.join('\n');
    }

    /** Mission-scoped live activity: this run's agents only — status chips in
     *  the header (always visible), hook events newest-first when open. */
    function liveSection(run, sp) {
        const L = DATA.live;
        const active = run.status === 'running' || run.status === 'waiting-approval' || run.status === 'waiting-user';
        if (!L || !active) { return ''; }
        const ids = [sp.leadAgentId].concat(sp.team.map(m => m.agentId));
        const names = {};
        names[sp.leadAgentId] = sp.leadAgentName + ' (lead)';
        sp.team.forEach(m => { if (!names[m.agentId]) { names[m.agentId] = m.agentName; } });
        const chips = ids.map(id => {
            const st = (L.agents || {})[id];
            const cls = !st ? 'quiet'
                : st.status === 'working' || st.status === 'tool' ? 'busy'
                    : st.status === 'waiting-permission' || st.status === 'stalled' ? 'alert' : 'quiet';
            const label = st ? (LIVE_LABEL[st.status] || st.status) + (st.tool ? ` (${st.tool})` : '') : 'quiet';
            return `<span class="lchip ${cls}">${C.esc(names[id] || id)}: ${C.esc(label)}</span>`;
        }).join(' ');
        const evs = (L.events || []).filter(e => ids.indexOf(e.agentId) >= 0).slice(-40).reverse();
        const rows = evs.map(e => {
            const label = (EV_LABEL[e.kind] || e.kind) + (e.tool ? ` (${C.esc(e.tool)})` : '');
            const link = e.transcriptPath ? ` data-opensession="${C.esc(e.transcriptPath)}" data-ts="${e.ts}"` : '';
            // A feed row that has a transcript IS a session row — right-click
            // gets that participant's session actions (afSessionCtx.js).
            const ctx = e.transcriptPath
                ? ' ' + window.AFSessionCtx.row({ file: e.transcriptPath, agentName: e.agentName })
                : '';
            return `<div class="lerow${e.kind === 'permission' ? ' alert' : ''}"${link}${ctx}${e.transcriptPath ? ` title="Open this moment in the session viewer — ${window.AFSessionCtx.HINT}"` : ''}>
                <span class="muted small">${relT(e.ts)}</span> <b>${C.esc(e.agentName || '?')}</b> ${label}${e.detail ? ` <span class="muted">${C.esc(String(e.detail).slice(0, 110))}</span>` : ''}</div>`;
        }).join('');
        return `<div class="colsec">
            <div class="colhead" id="lv-toggle-${C.esc(run.id)}" title="What every participant is doing right now — live session status + hook events (prompts, tools, permission waits), newest first">
                <span class="carets">${liveOpen ? '▾' : '▸'}</span> <b>Live activity</b>
                <span class="lvchips">${chips}</span>
            </div>
            ${liveOpen ? `<div class="lvbody">${rows || '<p class="muted small">No hook events yet — they appear the moment a participant starts working.</p>'}</div>` : ''}
        </div>`;
    }

    /** The planner's compressed round-by-round history (also its resume seed). */
    function ledgerSection(run) {
        if (!run.ledger || !run.ledger.length) { return ''; }
        return `<div class="colsec">
            <div class="colhead" id="lg-toggle-${C.esc(run.id)}" title="One compressed line per round — this is also what a resumed planner is re-briefed with">
                <span class="carets">${ledgerOpen ? '▾' : '▸'}</span> <b>Ledger</b>
                <span class="muted small">${run.ledger.length} line(s)</span>
            </div>
            ${ledgerOpen ? `<pre class="ledgerpre">${C.esc(run.ledger.join('\n'))}</pre>` : ''}
        </div>`;
    }

    /** Round = the mission's "turn": same band language as the session viewer
     *  (caret + tinted band + right-aligned token/cost stats, click to fold). */
    function roundCard(r, run) {
        const key = run.id + ':' + r.n;
        const closed = closedRounds.has(key);
        let body = '';
        // ‼️ U-64 — THE WORK IS DRAWN FOR EVERY ROUND THAT HAS ANY, not only
        // for `delegate`. An adaptive lead orders `parallel`, `review`,
        // `compare`, `revise`, `message` and `council` rounds, and each one puts
        // real delegations on the record — this branch tested the round's NAME
        // instead of its contents, so all of them rendered as a bare thought
        // with their steps invisible. The classic path is unchanged: a classic
        // round that delegates has steps and draws the same table it always did.
        if (r.steps && r.steps.length) {
            body = `<table class="mtable"><thead><tr><th></th><th>Agent</th><th>Task</th><th>Status</th><th class="num">Tokens</th><th class="num">Cost</th><th></th></tr></thead>
                <tbody>${r.steps.map(s => stepRow(s, run)).join('')}</tbody></table>
                ${r.rejectedReason ? `<div class="muted small">✕ ${C.esc(r.rejectedReason)} — the planner re-planned</div>` : ''}`;
        } else if (r.action === 'ask_user') {
            body = `<div class="qa"><b>Q:</b> ${C.esc(r.question || '')}<br><b>A:</b> ${C.esc(r.answer || '(pending)')}</div>`;
        } else if (r.rejectedReason) {
            // A round the user rejected never got its steps — the reason is
            // the whole record of it and must not fall out with the table.
            body = `<div class="muted small">✕ ${C.esc(r.rejectedReason)} — the planner re-planned</div>`;
        }
        const closedSummary = closed && r.steps.length ? `${r.steps.length} delegation(s) · ` : '';
        const stats = roundStats(r);
        return `<div class="turnhdr${closed ? ' closed' : ''}" data-round="${C.esc(key)}"
            ${window.AFCtx.row('afMissionRound', { run: run.id, round: r.n, afClosed: closed })}
            title="Click to ${closed ? 'expand' : 'collapse'} this round — ${window.AFCtx.HINT}">
            <span class="tcaret">${closed ? '▸' : '▾'}</span>
            <span class="turnnum">R${r.n}</span>
            <span class="tag">${C.esc(r.action)}</span>
            ${r.strategyVersion ? `<span class="mchip ver" title="The revision of the strategy in force when this round was decided — a version is cut when the approach MOVED, so a run of eight rounds under one v1 changed its mind never">v${r.strategyVersion}</span>` : ''}
            ${r.phase ? `<span class="mchip phase" title="The lead's own label for where the run is. An observation, not a stage the engine enforces — nothing branches on its value.">${C.esc(r.phase)}</span>` : ''}
            <span class="turnlabel">${C.esc(r.thought || r.question || '')}</span>
            <span class="turnstats">${closedSummary}${stats ? stats + ' · ' : ''}${fmtTime(r.at)}</span>
        </div>` + (closed ? '' : `<div class="roundbody">
            ${r.thought ? `<div class="thought">${C.esc(r.thought)}</div>` : ''}
            ${body}
        </div>`);
    }

    /** A participant chip. The lead and every team member carry the SAME menu:
     *  "who is this, and let me talk to it" is the same question either way. */
    function teamCtx(agentId, agentName, role, model) {
        return window.AFCtx.row('afMissionTeam', {
            agentId: agentId || '', agentName: agentName || '',
            role: role || '', model: model || ''
        });
    }

    // ================= U-64: the ADAPTIVE half of a run's detail =============
    //
    // ONE SUBJECT per section: the objective says what is being judged, the
    // strategy says what the lead is doing and why, the evaluations say what
    // was found, the cast says who is on it, the graph says what actually
    // happened. No fact is drawn in two of them.
    //
    // ‼️ What is NOT drawn: the lead's hidden reasoning. A round's `thought`
    // and a strategy's own words are statements the lead MADE for the record;
    // there is no place here for chain-of-thought, and the absence is
    // deliberate rather than a gap somebody will helpfully fill in later.

    const isAdaptive = (sp) => sp.mode === 'adaptive';
    const traceOf = (run) => (DATA.traces || {})[run.id] || null;

    /** ‼️ M-17's staleness rule, applied on the page exactly as the core states
     *  it: a verdict expires when work for a criterion it judged SETTLED after
     *  it — never by age. Derived here for the same reason it is derived there
     *  (a stored flag would be a second copy of what the timeline says). */
    function settledWork(run) {
        const out = [];
        run.rounds.forEach(r => r.steps.forEach(s => {
            if (s.evaluates) { return; }
            if (s.status !== 'done' && s.status !== 'failed') { return; }
            if (s.criteria && s.criteria.length) { out.push({ at: r.at, criteria: s.criteria }); }
        }));
        return out;
    }
    function evalStale(ev, settled) {
        const judged = {};
        (ev.findings || []).forEach(f => { judged[f.criterionId] = true; });
        return settled.some(s => s.at > ev.at && (s.criteria || []).some(c => judged[c]));
    }
    /** The latest CURRENT verdict per criterion — the same reading the success
     *  gate does, so the page can never show a pass the gate would refuse. */
    function criterionState(run) {
        const settled = settledWork(run);
        const state = {};
        (run.evaluations || []).forEach(ev => {
            if (evalStale(ev, settled)) { return; }
            (ev.findings || []).forEach(f => {
                state[f.criterionId] = { verdict: f.verdict, evidence: f.evidence, gap: f.gap, at: ev.at };
            });
        });
        return state;
    }
    const VERDICT_CHIP = { pass: 'ok', fail: 'bad', unknown: 'wait' };

    /** WHAT IS BEING JUDGED — criteria with their current verdict, the
     *  constraints the run may not break, and how much rope the lead has. */
    function objectiveSection(run, sp) {
        const crit = sp.successCriteria || [];
        const state = criterionState(run);
        const met = crit.filter(c => (state[c.id] || {}).verdict === 'pass').length;
        const reqUnmet = crit.filter(c => c.required && (state[c.id] || {}).verdict !== 'pass').length;
        const rows = crit.map(c => {
            const st = state[c.id] || {};
            const v = st.verdict || 'unjudged';
            const tip = [
                c.required ? 'required — success is refused while this has no current pass'
                    : 'optional — judged and reported, but it does not hold the verdict',
                st.evidence ? 'evidence: ' + st.evidence : '',
                st.gap ? 'gap: ' + st.gap : '',
                st.at ? 'last judged ' + fmtTime(st.at) : 'no current verdict — nothing has judged it yet'
            ].filter(Boolean).join('\n');
            return `<tr title="${C.esc(tip)}">
                <td class="critid">${C.esc(c.id)}</td>
                <td>${C.esc(c.text)}</td>
                <td>${c.required ? '<span class="mchip req">required</span>' : '<span class="muted small">optional</span>'}</td>
                <td>${v === 'unjudged'
                    ? '<span class="muted small">unjudged</span>'
                    : `<span class="mchip ${VERDICT_CHIP[v] || 'wait'}">${C.esc(v)}</span>`}</td>
                <td class="muted small">${C.esc(st.gap || st.evidence || '')}</td>
            </tr>`;
        }).join('');
        const cons = (sp.constraints || []).map(c =>
            `<li>${C.esc(c)}</li>`).join('');
        return `<div class="colsec">
            <div class="colhead" id="ob-toggle-${C.esc(run.id)}"
                title="What this run is judged on. A required criterion opens the door only with a CURRENT pass — not a stale one, not an unknown, and not the absence of a complaint.">
                <span class="carets">${objOpen ? '▾' : '▸'}</span> <b>Objective</b>
                <span class="muted small">${met}/${crit.length} met${reqUnmet ? ` · ${reqUnmet} required still open` : ''}${
                    sp.autonomy ? ` · ${C.esc(sp.autonomy)}` : ''}</span>
            </div>
            ${objOpen ? `<div class="objbody">
                ${crit.length ? `<table class="mtable crit"><thead><tr>
                    <th title="The criterion's id — every evaluation refers to it by this name for the life of the run">id</th>
                    <th>Criterion</th><th title="Required criteria hold the success verdict; optional ones are reported and do not">Weight</th>
                    <th title="The LATEST verdict that still speaks for the work as it stands — a verdict goes stale when work for the criterion it judged settled after it">Verdict</th>
                    <th title="What is missing (gap), or what was seen (evidence)">Evidence / gap</th>
                </tr></thead><tbody>${rows}</tbody></table>`
                    : '<p class="muted small">This objective states no criteria — it cannot be judged and cannot close as success.</p>'}
                ${cons ? `<div class="conslist"><span class="muted small">Constraints — what this run may not do:</span><ul>${cons}</ul></div>` : ''}
            </div>` : ''}
        </div>`;
    }

    /** WHAT IT IS DOING AND WHY — the strategy in force, and every revision
     *  with the reason it was cut. The reason lives only in the journal, so a
     *  run whose trace this window cannot read says so instead of guessing. */
    function strategySection(run) {
        const cur = run.strategy;
        const tr = traceOf(run);
        const revs = (tr && tr.strategies) || [];
        if (!cur && !revs.length) { return ''; }
        const head = cur
            ? `<span class="mchip ver">v${cur.version}</span>${cur.phase ? ` <span class="mchip phase">${C.esc(cur.phase)}</span>` : ''}
               <span class="muted small">since ${fmtTime(cur.at)}</span>`
            : '<span class="muted small">no strategy recorded yet</span>';
        // Newest first: the current approach is the one being read, and its
        // predecessors are the history under it.
        const hist = revs.slice().reverse().map(s => `
            <div class="strow">
                <span class="mchip ver">v${s.n}</span>
                ${s.phase ? `<span class="mchip phase">${C.esc(s.phase)}</span>` : ''}
                <span class="stext">${C.esc(s.summary)}</span>
                ${s.reason ? `<span class="sreason" title="Why the approach MOVED — a version is cut when it did, never once per round">↺&nbsp;${C.esc(s.reason)}</span>` : ''}
                <span class="muted small">${fmtTime(s.at)}</span>
            </div>`).join('');
        return `<div class="colsec">
            <div class="colhead" id="st-toggle-${C.esc(run.id)}"
                title="The approach the lead is working to right now, and every earlier revision with what made it change. A version is cut when the approach MOVED — a lead that restates the same plan five times has one strategy, not five.">
                <span class="carets">${stratOpen ? '▾' : '▸'}</span> <b>Strategy</b> ${head}
                ${revs.length > 1 ? `<span class="muted small">${revs.length} revisions</span>` : ''}
            </div>
            ${stratOpen ? `<div class="stratbody">
                ${cur ? `<div class="curstrat">${C.esc(cur.text)}</div>` : ''}
                ${hist || (tr ? '' : '<p class="muted small">The revision history is in this run\'s journal, which this window has not read.</p>')}
            </div>` : ''}
        </div>`;
    }

    /** WHAT WAS FOUND — every verdict this run recorded, stale ones kept,
     *  because "we checked, then changed the thing" IS the history. */
    function evaluationSection(run) {
        const evs = run.evaluations || [];
        if (!evs.length) { return ''; }
        const settled = settledWork(run);
        const rows = evs.slice().reverse().map(ev => {
            const stale = evalStale(ev, settled);
            const who = ev.evaluator && ev.evaluator.kind === 'agent'
                ? (ev.evaluator.agentName || ev.evaluator.agentId || 'agent') : 'lead';
            const finds = (ev.findings || []).map(f =>
                `<span class="mchip ${VERDICT_CHIP[f.verdict] || 'wait'}"
                    title="${C.esc(f.criterionId + ' — ' + f.verdict + (f.evidence ? '\nevidence: ' + f.evidence : '') + (f.gap ? '\ngap: ' + f.gap : ''))}">${C.esc(f.criterionId)} ${C.esc(f.verdict)}</span>`).join(' ');
            return `<div class="evrow${stale ? ' stale' : ''}">
                <span class="mchip adv">${C.esc(ev.advice)}</span>
                <b>${C.esc(who)}</b>
                ${finds}
                ${stale ? '<span class="mchip wait" title="Work for a criterion this verdict judged settled AFTER it — the artefact it looked at is not the one that now exists. Kept, never deleted: the check happened.">stale</span>' : ''}
                ${ev.note ? `<span class="muted small">${C.esc(ev.note)}</span>` : ''}
                <span class="muted small">${fmtTime(ev.at)}</span>
            </div>`;
        }).join('');
        const live = evs.filter(e => !evalStale(e, settled)).length;
        return `<div class="colsec">
            <div class="colhead" id="ev-toggle-${C.esc(run.id)}"
                title="Every verdict this run recorded, newest first. A stale one is kept rather than deleted — throwing it away would leave a run that looks as though it was never reviewed. The advice (finish / revise / replan / explore / ask_user / partial / failed) is ADVICE: the lead still decides and the hard limits outrank both.">
                <span class="carets">${evalOpen ? '▾' : '▸'}</span> <b>Evaluations</b>
                <span class="muted small">${evs.length} recorded${evs.length !== live ? ` · ${live} still current` : ''}</span>
            </div>
            ${evalOpen ? `<div class="evbody">${rows}</div>` : ''}
        </div>`;
    }

    /** WHO IS ON IT — the roles the lead BOUND at runtime, which is the only
     *  place "the team" of an adaptive run is a fact, plus the pool it drew
     *  from and who is busy right now. */
    function castSection(run, sp) {
        const roles = run.roles || [];
        const pool = sp.pool || [];
        if (!roles.length && !pool.length) { return ''; }
        const busy = {};
        run.rounds.forEach(r => r.steps.forEach(s => {
            if (s.status === 'running') { busy[s.agentId] = (busy[s.agentId] || 0) + 1; }
        }));
        const rows = roles.map(r => `
            <div class="castrow" ${teamCtx(r.agentId, r.agentName, r.brief, r.model)}
                title="${C.esc([
                    r.agentName + ' — ' + r.brief,
                    'bound ' + fmtTime(r.boundAt) + ' — the first time the lead put this agent to work on this run',
                    'engine ' + (r.engine || sp.engine || 'claude') + (r.model ? ' · model ' + r.model : '')
                        + (r.effort ? ' · effort ' + r.effort : '') + (r.permissionMode ? ' · permissions ' + r.permissionMode : ''),
                    window.AFCtx.HINT
                ].join('\n'))}">
                <b>${C.esc(r.agentName)}</b>
                ${busy[r.agentId] ? '<span class="mchip live">working</span>' : ''}
                <span class="brief">${C.esc(r.brief)}</span>
                ${(r.engine || sp.engine) ? `<i class="mdl">${C.esc(r.engine || sp.engine)}</i>` : ''}
                ${r.model ? `<i class="mdl">${C.esc(r.model)}</i>` : ''}
                ${r.effort ? `<i class="mdl">~${C.esc(r.effort)}</i>` : ''}
                ${r.permissionMode ? `<i class="mdl">${C.esc(r.permissionMode)}</i>` : ''}
            </div>`).join('');
        const unused = pool.filter(m => !roles.some(r => r.agentId === m.agentId));
        return `<div class="colsec">
            <div class="colhead" id="ca-toggle-${C.esc(run.id)}"
                title="An adaptive lead is handed a POOL, not a cast: a role is bound the first time it puts an agent to work, and it lives on this run only — the same agent may hold a different role tomorrow without either statement being wrong.">
                <span class="carets">${castOpen ? '▾' : '▸'}</span> <b>Cast</b>
                <span class="muted small">${roles.length} bound of ${pool.length || 'the whole fleet'}${
                    Object.keys(busy).length ? ` · ${Object.keys(busy).length} working now` : ''}</span>
            </div>
            ${castOpen ? `<div class="castbody">
                ${rows || '<p class="muted small">Nobody bound yet — the lead has not delegated.</p>'}
                ${unused.length ? `<div class="muted small">Still unused in the pool: ${unused.map(m =>
                    C.esc(m.agentName) + (m.role ? ` <i class="mdl">${C.esc(m.role)}</i>` : '')).join(' · ')}</div>` : ''}
            </div>` : ''}
        </div>`;
    }

    /** WHAT ACTUALLY HAPPENED — the runtime graph. Never a workflow drawn in
     *  advance: these nodes exist because the run made them, and the fan-in on
     *  a decision is a recorded fact (`inputRefs`), not an inference from
     *  timestamps. Drawn as an indented timeline, which is what a graph whose
     *  edges are "what this was built from" reads as in a column this narrow. */
    function graphSection(run) {
        const tr = traceOf(run);
        const nodes = (tr && tr.graph) || [];
        if (!nodes.length) { return ''; }
        const byId = {};
        nodes.forEach(n => { byId[n.id] = n; });
        const NODE_CHIP = { done: 'ok', failed: 'bad', running: 'live', cancelled: 'wait', open: 'wait' };
        const rows = nodes.map(n => {
            const ins = (n.inputRefs || []).filter(r => byId[r]);
            const tip = [
                n.kind + ' — ' + n.label,
                'actor: ' + n.actor + ' · status: ' + n.status,
                n.strategyVersion ? 'under strategy v' + n.strategyVersion + (n.phase ? ' · ' + n.phase : '') : '',
                (n.parentRefs || []).length ? 'follows: ' + n.parentRefs.join(', ') : '',
                ins.length ? 'built from: ' + ins.map(r => byId[r].label || r).join(' · ') : '',
                (n.outputRefs || []).length ? 'produced: ' + n.outputRefs.join(', ') : '',
                'created ' + fmtTime(n.createdAt) + (n.settledAt ? ' · settled ' + fmtTime(n.settledAt) : '')
            ].filter(Boolean).join('\n');
            return `<div class="gnode ${C.esc(n.kind)}" title="${C.esc(tip)}">
                <span class="gid">${C.esc(n.id)}</span>
                <span class="mchip ${NODE_CHIP[n.status] || 'wait'}">${C.esc(n.kind)}</span>
                <span class="glabel">${C.esc(n.label)}</span>
                ${ins.length ? `<span class="gin" title="fan-in — the results this was built from">⤶${ins.length}</span>` : ''}
                ${n.strategyVersion ? `<span class="mchip ver">v${n.strategyVersion}</span>` : ''}
                <span class="muted small">${C.esc(n.actor)}</span>
            </div>`;
        }).join('');
        const kinds = {};
        nodes.forEach(n => { kinds[n.kind] = (kinds[n.kind] || 0) + 1; });
        return `<div class="colsec">
            <div class="colhead" id="gr-toggle-${C.esc(run.id)}"
                title="What the run really did, in the order it did it: a node per decision and per primitive it set in motion, with what each was built from. Nothing here was drawn in advance — a workflow's shape is decided before it starts and this one is not.">
                <span class="carets">${graphOpen ? '▾' : '▸'}</span> <b>Runtime graph</b>
                <span class="muted small">${nodes.length} nodes · ${Object.keys(kinds).map(k => `${kinds[k]} ${k}`).join(' · ')}</span>
            </div>
            ${graphOpen ? `<div class="graphbody">${rows}</div>` : ''}
        </div>`;
    }

    /** THE HUMAN'S HAND ON A RUNNING OBJECTIVE — and, said plainly, WHERE it
     *  lands. A steer is not delivered to work already in flight: a Task that
     *  is running has its prompt and cannot be renegotiated. */
    function guideSection(run, sp, active) {
        const pend = (run.guidance || []).filter(g => !g.appliedAt);
        const done = (run.guidance || []).filter(g => g.appliedAt);
        if (!active && !pend.length && !done.length) { return ''; }
        const note = guideNote[run.id];
        return `<div class="colsec guidesec">
            <div class="colhead" id="gd-toggle-${C.esc(run.id)}"
                title="A one-off steer for the LEAD, injected exactly once at its next decision. It does not reach a delegation that is already running — that task has its prompt and cannot be renegotiated — and saying otherwise is the lie you would notice last.">
                <span class="carets">${guideOpen ? '▾' : '▸'}</span> <b>Guide next decision</b>
                <span class="muted small">${pend.length ? `${pend.length} waiting` : done.length ? `${done.length} applied` : 'nothing queued'}</span>
            </div>
            ${guideOpen ? `<div class="guidebody">
                ${pend.map(g => `<div class="grow pend" title="Queued ${C.esc(fmtTime(g.at))} — it lands at the next planner boundary, not now">⏳ ${C.esc(g.text)}</div>`).join('')}
                ${done.map(g => `<div class="grow" title="Put in front of the lead ${C.esc(fmtTime(g.appliedAt))} — exactly once">✓ ${C.esc(g.text)}</div>`).join('')}
                ${active ? `<div class="guideform">
                    <textarea id="gd-text-${C.esc(run.id)}" rows="2"
                        placeholder="What should the lead take into account at its next decision?"></textarea>
                    <button class="secondary small" id="gd-send-${C.esc(run.id)}">Queue steer</button>
                    <span class="muted small">${run.status === 'running'
                        ? 'It reaches the lead at its NEXT planner decision — never the delegation running now.'
                        : `This run is ${C.esc(run.status)}; the lead sees it when it is resumed.`}</span>
                </div>` : ''}
                ${note ? `<div class="${note.error ? 'ferr' : 'muted small'}">${C.esc(note.error || note.note)}</div>` : ''}
            </div>` : ''}
        </div>`;
    }

    /** WHO SPOKE TO WHOM — a SUMMARY only. The transcript is U-65's subject and
     *  drawing a hollow one here would be a feature that does not exist. */
    /**
     * ‼️ U-65 — A SPEAKER IS A NAME. The record keeps agent ids because ids are
     * what survive a rename; a transcript drawn out of them is a wall of
     * folder names nobody reads. `lead` is the objective's own lead.
     */
    /**
     * ‼️ X-85 — AND THE RECORD ANSWERS BEFORE THE FLEET DOES, here exactly as it
     * does on the host (`missionCastName`). This asked `message.fromName` and
     * then the CURRENT fleet, so a speaker with no stamped name who had since
     * left the fleet — or whose id was written with a different case or slash —
     * fell back to a raw folder path on the very surface the name fields were
     * added for. The run already carries who its cast were AT THE TIME: the
     * roles the lead bound, the spec's lead, team and pool. Two resolvers that
     * answer differently are two products, so this one asks in the same order.
     */
    const castKey = id => String(id == null ? '' : id).trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
    function speakerName(run, id) {
        if (!id) { return '—'; }
        const sp = spec(run) || {};
        if (id === 'lead') { return sp.leadAgentName || 'lead'; }
        const key = castKey(id);
        if (!key) { return id; }
        const named = [
            ...(run.messages || []).filter(x => castKey(x.from) === key).map(x => x.fromName),
            ...(run.roles || []).filter(x => castKey(x.agentId) === key).map(x => x.agentName),
            ...(castKey(sp.leadAgentId) === key ? [sp.leadAgentName] : []),
            ...(sp.team || []).filter(x => castKey(x.agentId) === key).map(x => x.agentName),
            ...(sp.pool || []).filter(x => castKey(x.agentId) === key).map(x => x.agentName)
        ].find(n => String(n || '').trim());
        if (named) { return named; }
        const a = (DATA.agents || []).find(x => castKey(x.id) === key);
        return a ? a.name : id;
    }

    /** ‼️ U-65 — SHORTHAND: the shortest unambiguous form on the row. */
    const INTENT_SHORT = {
        proposal: 'prop', question: 'ask', challenge: 'chall', response: 'resp',
        evidence: 'evid', concede: 'conc', synthesis: 'synth', vote: 'vote'
    };
    /** What each intent IS — the long form the AFTip opens with. */
    const INTENT_LONG = {
        proposal: 'Proposal — a position put for the others to work on',
        question: 'Question — something the speaker needs answered',
        challenge: 'Challenge — what is wrong with a named message, and why',
        response: 'Response — an answer to a named question or challenge',
        evidence: 'Evidence — something checkable, brought in to stand on its own',
        concede: 'Concede — a named point the speaker had been arguing against, accepted',
        synthesis: 'Synthesis — named messages drawn together into where the discussion has got to',
        vote: 'Vote — a choice between the council\'s named options, with a reason'
    };
    /** How the speaker's lane was carried — never assumed, always the record's. */
    const CARRY_LONG = {
        new: 'new session — this speaker had not spoken here before',
        resumed: 'resumed — the same session, still holding everything it said and read',
        handoff: 'handoff — its engine cannot resume, so the exchange was handed over AS TEXT'
    };

    /**
     * ‼️ U-65 — an exchange awaits an answer while a question or a challenge
     * has nothing pointing back at it. Derived, never stored.
     *
     * ‼️ X-77 — AND WHICH INTENTS THOSE ARE COMES FROM THE CORE REGISTRY. This
     * listed `response | concede` by hand, and the registry has said `synthesis`
     * and `vote` settle what they name since M-20 — so a council that reached a
     * synthesis read as closed in the core and the bridge and as unanswered
     * here, off one record. The fallback is the old pair, for a payload written
     * by a host older than this.
     */
    const INTENT_FLAGS = () => (DATA.intentFlags || {
        question: { awaits: true, settles: false },
        challenge: { awaits: true, settles: false },
        response: { awaits: false, settles: true },
        concede: { awaits: false, settles: true }
    });
    function openRefs(msgs) {
        const flags = INTENT_FLAGS();
        const answered = new Set();
        msgs.forEach(m => {
            if (m.state !== 'delivered') { return; }
            if (flags[m.intent] && flags[m.intent].settles) {
                (m.refs || []).forEach(r => answered.add(r));
            }
        });
        return msgs.filter(m => m.state === 'delivered'
            && !!(flags[m.intent] && flags[m.intent].awaits)
            && !answered.has(m.id));
    }

    function messageRow(run, m, byId) {
        const who = m.fromName || speakerName(run, m.from);
        const toNames = (m.to || []).map(t => speakerName(run, t));
        const short = INTENT_SHORT[m.intent] || m.intent || '?';
        const failed = m.state === 'failed' || m.state === 'cancelled';
        /**
         * ‼️ NO FAKE SPEAKER. A turn that never came back has no words, so it
         * draws no speech — it draws the ORDER and the reason it produced none.
         *
         * ‼️ X-81 — AND A TURN THAT HAS NOT COME BACK YET IS A THIRD THING. This
         * asked only whether the turn had FAILED, so a `pending` one was drawn
         * as an ordinary message with a real speaker, a real intent and an empty
         * body: the summary above it said the turn had not been spoken while
         * the transcript below acted as though it had. Three states, three
         * different sentences, and only `delivered` ever draws speech.
         */
        const spoken = m.state === 'delivered';
        const waiting = !spoken && !failed;
        // ‼️ X-80 — the words the host read for us: the FULL archived text when
        // there is one, the stored excerpt when the archive is gone. The room
        // used to draw `m.excerpt` and call it full text in its own release note.
        const body = spoken ? (m.text || m.excerpt || '') : '';
        // ‼️ X-93 — a ref carries WHERE it lands, not just what it names. The
        // handler has to be able to open the right thread and expand whatever
        // is hiding the target, and it cannot work that out from an id alone.
        const refChips = (m.refs || []).map(r => {
            const src = byId[r];
            return `<a class="cvref" data-cvjump="${C.esc(r)}"
                data-cvrun="${C.esc(run.id)}" data-cvconv="${C.esc(m.conversationId || '')}"
                title="${C.esc(src ? r + ' — ' + (src.fromName || speakerName(run, src.from)) + ' · ' + (src.intent || '') : r + ' — not in this conversation')}">${C.esc(r)}</a>`;
        }).join(' ');
        const links = [
            m.transcript ? `<a data-opensession="${C.esc(m.transcript)}" title="Open the speaker's own session — everything it read and wrote for this turn">session</a>` : '',
            m.outputFile ? `<a data-openfile="${C.esc(m.outputFile)}" title="Open the archived output this turn produced">output</a>` : ''
        ].filter(Boolean).join(' · ');
        const head = `${m.id} — ${who}${toNames.length ? ' → ' + toNames.join(', ') : ' → everyone'}`;
        const tipBody = window.AFTip.lines([
            INTENT_LONG[m.intent] || m.intent,
            m.carried ? CARRY_LONG[m.carried] || m.carried : '',
            m.ask ? 'the lead asked for: ' + m.ask : '',
            '',
            failed ? 'This turn produced NO message: ' + (m.note || 'it did not come back.')
                : waiting ? 'This turn is ORDERED and has not come back — nothing has been said yet.'
                    : body
        ]);
        const marked = cvRead(cvKey(run.id, m.conversationId || '')).mark === m.id ? ' marked' : '';
        return `<div class="cvmsg${failed ? ' bad' : ''}${waiting ? ' pend' : ''}${marked}" id="cvm-${C.esc(run.id)}-${C.esc(m.id)}">
            <div class="cvmhead">
                ${window.AFTip.wrap(
                    `<span class="mchip cvi ${C.esc(m.intent || '')}">${C.esc(short)}</span>`, head, tipBody)}
                <b class="cvwho">${C.esc(who)}</b>
                <span class="muted small">→ ${toNames.length ? C.esc(toNames.join(', ')) : 'everyone'}</span>
                ${refChips ? `<span class="cvrefs" title="The messages this one is about — click to jump">↩ ${refChips}</span>` : ''}
                ${m.carried ? `<span class="mchip lane ${C.esc(m.carried)}" title="${C.esc(CARRY_LONG[m.carried] || m.carried)}">${C.esc(m.carried)}</span>` : ''}
                ${failed ? `<span class="mchip bad" title="${C.esc(m.note || 'the turn did not come back')}">${C.esc(m.state)}</span>` : ''}
                ${waiting ? `<span class="mchip wait" title="${C.esc('ordered ' + fmtTime(m.orderedAt) + ' — this turn has not come back, so nothing has been said')}">${C.esc(m.state || 'pending')}</span>` : ''}
                <span class="cvts muted small">${C.esc(fmtTime(m.settledAt || m.orderedAt))}</span>
                ${links ? `<span class="cvlinks">${links}</span>` : ''}
            </div>
            ${failed
                ? `<div class="cvtext muted">No message: ${C.esc(m.note || 'the turn did not come back.')}</div>`
                : waiting
                    ? `<div class="cvtext muted">Waiting: ordered ${C.esc(fmtTime(m.orderedAt))}${
                        m.ask ? ' — ' + C.esc(m.ask) : ''}</div>`
                    : `<div class="cvtext">${C.esc(body)}</div>`}
        </div>`;
    }

    function conversationSection(run) {
        const convs = run.conversations || [];
        const councils = run.councils || [];
        if (!convs.length && !councils.length) { return ''; }
        // ‼️ U-65 — the council points at its conversation through
        // `conversationId`. This read `conversation`, a field the record has
        // never had, so on a real run the chair, the cap, the votes and the way
        // out were all silently missing from the row.
        const byConv = {};
        councils.forEach(k => { byConv[k.conversationId] = k; });
        const all = run.messages || [];
        const rows = convs.map(c => {
            const k = byConv[c.id];
            const msgs = all.filter(m => m.conversationId === c.id)
                .slice().sort((a, b) => (a.orderedAt || 0) - (b.orderedAt || 0));
            const said = msgs.filter(m => m.state === 'delivered').length;
            const lost = msgs.filter(m => m.state === 'failed' || m.state === 'cancelled').length;
            // ‼️ X-81 — ordered · spoken · silent are THREE facts, and the row
            // used to hold two. A turn still in flight is neither said nor lost,
            // and counting it as either is how the summary and the transcript
            // below it started telling a reader two different things.
            const inflight = msgs.length - said - lost;
            const open = openRefs(msgs);
            const key = cvKey(run.id, c.id);
            const rd = cvRead(key);
            const isOpen = convThread === key;
            // ‼️ U-65 — what arrived while the reader was somewhere else. Only
            // ever shown to a reader who is NOT following the bottom: telling
            // someone who can already see the new turn that it is new is noise.
            const unseen = isOpen && !rd.atEnd ? Math.max(0, msgs.length - rd.seen) : 0;
            if (isOpen && rd.atEnd) { rd.seen = msgs.length; }
            const byId = {};
            msgs.forEach(m => { byId[m.id] = m; });
            const shown = cvOnlyOpen(run.id) ? msgs.filter(m => open.some(o => o.id === m.id)) : msgs;
            // ‼️ DENSITY — a big exchange opens COMPACT. 200 messages drawn in
            // full is a page nobody can find anything in; the newest are what a
            // reader coming back wants, and the rest are one click away.
            const big = shown.length > CONV_COMPACT;
            const drawn = big && !rd.all ? shown.slice(-CONV_COMPACT) : shown;
            const cast = (c.participants || []).map(p => speakerName(run, p));
            const headTip = window.AFTip.lines([
                (k ? 'Council ' + k.id : 'Conversation ' + c.id) + ' — ' + ((k && k.question) || c.objective || ''),
                '',
                'participants: ' + (cast.join(', ') || '—'),
                k ? 'chair: ' + speakerName(run, k.chair) : '',
                k && k.options && k.options.length ? 'options: ' + k.options.join(' | ') : '',
                k ? 'turns: ' + msgs.filter(m => m.state !== 'cancelled').length + '/' + k.maxTurns : '',
                said + ' spoken' + (lost ? ' · ' + lost + ' turn(s) produced nothing' : '')
                    + (inflight ? ' · ' + inflight + ' ordered and still out' : ''),
                open.length ? open.length + ' still awaiting an answer' : 'nothing left unanswered',
                k && k.votes && k.votes.length
                    ? 'votes: ' + k.votes.map(v => speakerName(run, v.member)
                        + ' → ' + (v.unclear ? 'named no option' : v.choice)).join(' · ')
                    : '',
                k && k.exit ? 'ended: ' + k.exit : c.closedAt ? 'closed: ' + (c.closeReason || 'closed') : 'open',
                '',
                'opened ' + fmtTime(c.openedAt)
            ]);
            const votes = k && k.votes && k.votes.length
                ? `<span class="cvvotes">${k.votes.map(v => `<span class="mchip ${v.unclear ? 'wait' : 'ok'}"
                    title="${C.esc(speakerName(run, v.member) + ' — ' + (v.unclear ? 'voted but named no option; the record does not pick one for them' : v.choice))}"
                    >${C.esc(speakerName(run, v.member))}: ${C.esc(v.unclear ? '?' : v.choice)}</span>`).join(' ')}</span>`
                : '';
            return `<div class="cvthread${isOpen ? ' open' : ''}">
                ${window.AFTip.wrap(`<div class="cvrow" data-cvthread="${C.esc(c.id)}" data-cvrun="${C.esc(run.id)}">
                    <span class="carets">${isOpen ? '▾' : '▸'}</span>
                    <span class="mchip ${k ? 'council' : 'conv'}">${k ? C.esc(k.id) : C.esc(c.id)}</span>
                    <span class="cvq">${C.esc((k && k.question) || c.objective || '')}</span>
                    <span class="muted small">${cast.join(', ')}${k ? ' · chair ' + C.esc(speakerName(run, k.chair)) : ''}</span>
                    <span class="muted small">${said} spoken${lost ? ` · ${lost} silent` : ''}${
                        inflight ? ` · ${inflight} waiting` : ''}${
                        k ? ` · ${msgs.filter(m => m.state !== 'cancelled').length}/${k.maxTurns}` : ''}</span>
                    ${open.length ? `<span class="mchip wait" title="${C.esc(open.length + ' question(s) or challenge(s) that nothing in this exchange has answered')}">${open.length} unanswered</span>` : ''}
                    ${votes}
                    <span class="mchip ${k && k.exit ? 'ok' : c.closedAt ? 'ok' : 'live'}">${
                        k && k.exit ? C.esc(k.exit) : c.closedAt ? C.esc(c.closeReason || 'closed') : 'open'}</span>
                </div>`, (k ? 'Council ' + k.id : 'Conversation ' + c.id), headTip, 'cvroww')}
                ${isOpen ? `<div class="cvmsgs" id="${cvDomId('cv-scroll', key)}">
                    ${unseen ? `<div class="cvnew" data-cvend="1"
                        title="${C.esc(unseen + ' turn(s) arrived while you were reading further up — your place was kept')}"
                        >${unseen} new below ↓</div>` : ''}
                    ${drawn.length ? '' : '<div class="muted small">Nothing matches this filter.</div>'}
                    ${big && !rd.all ? `<div class="cvmore" data-cvall="1"
                        title="${C.esc(shown.length + ' messages — the newest ' + CONV_COMPACT + ' are drawn; the rest are one click away')}"
                        >show all ${shown.length} messages</div>` : ''}
                    ${drawn.map(m => messageRow(run, m, byId)).join('')}
                </div>` : ''}
            </div>`;
        }).join('');
        const openTotal = convs.reduce((a, c) =>
            a + openRefs(all.filter(m => m.conversationId === c.id)).length, 0);
        return `<div class="colsec">
            <div class="colhead" id="cv-toggle-${C.esc(run.id)}"
                title="The exchanges this run really held, in full. A message is drawn only when a speaking turn came back with words — a turn that failed shows the ORDER and why it produced none, never a sentence nobody said. Chronological, with what each message is about and where it ran.">
                <span class="carets">${convOpen ? '▾' : '▸'}</span> <b>Conversations</b>
                <span class="muted small">${convs.length} conversation(s)${councils.length ? ` · ${councils.length} council(s)` : ''}${
                    openTotal ? ` · ${openTotal} unanswered` : ''}</span>
            </div>
            ${convOpen ? `<div class="cvbody">
                ${openTotal ? `<div class="cvfilter">
                    <label title="Show only the questions and challenges nothing in this exchange has answered"><input type="checkbox" id="cv-open-${C.esc(run.id)}"${cvOnlyOpen(run.id) ? ' checked' : ''}> unanswered only</label>
                </div>` : ''}
                ${rows}
            </div>` : ''}
        </div>`;
    }

    function detailHtml(run) {
        const sp = spec(run);
        const pctRaw = sp.limits.maxCostUSD > 0 ? (run.totalCostUSD / sp.limits.maxCostUSD) * 100 : 0;
        const pct = Math.min(100, Math.round(pctRaw));
        const pendingQ = (DATA.pending.questions || []).find(q => q.runId === run.id);
        const pendingAp = (DATA.pending.approvals || []).includes(run.id);
        const active = run.status !== 'done' && run.status !== 'failed' && run.status !== 'cancelled';
        const canPause = active && run.status !== 'paused';
        const canResume = run.status === 'paused';
        // the Pause request is visible and withdrawable: the button stays
        // pressed ("Pausing…") until the engine actually parks the run
        const pauseBtn = !canPause ? ''
            : run.pausePending
                ? `<button class="secondary pressed" id="d-unpause-${C.esc(run.id)}" aria-pressed="true"
                       title="Pause was requested — it takes effect before the next planner round. Click to withdraw and keep running.">⏸ Pausing… (undo)</button>`
                : `<button class="secondary" id="d-pause-${C.esc(run.id)}" aria-pressed="false"
                       title="Finish the current activity, then hold before the next planner round">Pause</button>`;
        const nowStrip = active && run.now && !run.pausePending
            ? `<div class="nowstrip"><span class="nowdot"></span> ${C.esc(run.now.what)}
                <span class="muted small">— <span data-since="${run.now.since}">${elapsed(run.now.since)}</span></span></div>`
            : '';
        const pt = (DATA.plannerTranscripts || {})[run.id];
        const tasksUsed = run.rounds.reduce((a, r) => a + r.steps.length, 0);
        const wallMin = Math.max(0, Math.round(((run.endedAt || Date.now()) - run.startedAt - (run.waitedMs || 0)) / 60000));
        return `<div class="mdetail">
            <div class="dethead">
                <h2 style="margin:0">${C.esc(sp.title)}</h2>
                ${chip(run.status)}
                <span style="flex:1"></span>
                ${pauseBtn}
                ${canResume ? `<button id="d-resume-${C.esc(run.id)}">Resume</button>` : ''}
                ${active ? `<button class="secondary" id="d-cancel-${C.esc(run.id)}" title="Cancel the mission and its running delegations">Cancel</button>` : ''}
            </div>
            <div class="muted small">lead <b ${teamCtx(sp.leadAgentId, sp.leadAgentName, 'lead', sp.plannerModel)}
                title="${C.esc(window.AFCtx.hint('The lead — it plans the rounds'))}">${C.esc(sp.leadAgentName)}</b>${sp.plannerModel ? ` <span class="mchip mdl" title="planner model">${C.esc(sp.plannerModel)}</span>` : ''}${
                /* ‼️ U-64 — an ADAPTIVE run has no team here and drew an empty
                   "team ·" that read as a missing fact. Its cast is bound at
                   runtime and has its own section; the header says where. */
                !sp.team.length
                    ? (isAdaptive(sp)
                        ? ` · <span class="muted small" title="An adaptive lead is handed a pool and binds a cast as it goes — the Cast section below is where that record is.">cast bound at runtime</span>`
                        : '')
                    : ` · team ` + sp.team.map(m =>
                `<span class="mchip team" ${teamCtx(m.agentId, m.agentName, m.role, m.model)}
                    title="${C.esc(window.AFCtx.hint(m.agentName + (m.role ? ' — ' + m.role : '')))}">${C.esc(m.agentName)}${m.role ? ` — ${C.esc(m.role)}` : ''}${(m.engine || sp.engine) && (m.engine || sp.engine) !== 'claude' ? ` <i class="mdl" title="delegation engine">${C.esc(m.engine || sp.engine)}</i>` : ''}${m.model ? ` <i class="mdl" title="delegation model">${C.esc(m.model)}</i>` : ''}${m.permissionMode ? ` <i class="mdl" title="delegation permissions — what this member may do without stopping to ask">${C.esc(m.permissionMode)}</i>` : ''}${m.effort ? ` <i class="mdl" title="delegation effort — how hard this member thinks per turn; empty is not &quot;normal&quot;, it is resolved from this agent's own default then the fleet's">${C.esc(m.effort)}</i>` : ''}</span>`).join(' ')}
                ${sp.workdir ? ` · workdir <code>${C.esc(sp.workdir)}</code>` : ''} · approval: ${C.esc(sp.approvalMode)}${pt ? ` · <a data-opensession="${C.esc(pt)}" title="Open the lead's full planner conversation (briefings, thoughts, decisions) in the session viewer">planner transcript</a>` : ''}</div>
            <div class="goal">${C.esc(sp.goal)}</div>
            ${nowStrip}
            ${isAdaptive(sp) && run.traceDegraded ? `<div class="nowstrip paused" title="What the last reload could not account for. The run is still shown in full — a journal with a gap is a reason to say so, never a reason to hide the work.">
                <span class="nowdot hold"></span> journal: ${C.esc(run.traceDegraded)}</div>` : ''}
            ${isAdaptive(sp) ? objectiveSection(run, sp) : ''}
            ${isAdaptive(sp) ? strategySection(run) : ''}
            ${isAdaptive(sp) ? guideSection(run, sp, active) : ''}
            ${run.pausePending ? `<div class="nowstrip paused"><span class="nowdot hold"></span> pausing — the current activity finishes first, then the run holds</div>` : ''}
            ${liveSection(run, sp)}
            <div class="budget" title="Spent ${usd(run.totalCostUSD)} of ${sp.limits.maxCostUSD > 0 ? 'the ' + usd(sp.limits.maxCostUSD) + ' budget' : 'an unlimited budget'}">
                <div class="budgetbar"><div class="budgetfill${pctRaw >= 90 ? ' hot' : ''}" style="width:${pct}%"></div></div>
                <span class="muted small">${usd(run.totalCostUSD)} / ${capUsd(sp.limits.maxCostUSD)}${runTokens(run)
                    ? ` · ${C.fmtTok(runTokens(run))}${sp.limits.maxTokens ? ` / ${C.fmtTok(sp.limits.maxTokens)}` : ''} tok`
                    : ''} · ${run.rounds.length}/${capN(sp.limits.maxRounds)} rounds · ${tasksUsed}/${capN(sp.limits.maxTasks)} tasks · ${wallMin}/${capN(sp.limits.maxMinutes)} min · started ${fmtTime(run.startedAt)}</span>
            </div>
            ${(() => {
                const shares = tokenShares(run, sp);
                return shares.length ? `<div class="muted small tokshare"
                    title="${C.esc(shares.map(x => `${x.name} ${C.fmtTok(x.tok)}`).join(' · '))}">tokens by agent:
                    ${shares.map(x => `${C.esc(x.name)} <b>${x.pct}%</b>`).join(' · ')}</div>` : '';
            })()}
            ${pendingAp ? `<div class="waitbox">This round needs your approval.
                <button id="d-approve-${C.esc(run.id)}">Approve</button>
                <button class="secondary" id="d-reject-${C.esc(run.id)}">Reject</button></div>` : ''}
            ${pendingQ ? `<div class="waitbox">Question: ${C.esc(pendingQ.question)}<br>
                <input type="text" id="d-answer-${C.esc(run.id)}" placeholder="your answer…" style="width:60%">
                <button id="d-send-${C.esc(run.id)}">Send</button></div>` : ''}
            ${run.rounds.length > 1 ? `<div class="chiprow">
                <span class="muted small">Rounds:</span>
                <button class="chip" id="rd-expandall-${C.esc(run.id)}" title="Expand every round of this run">Expand all</button>
                <button class="chip" id="rd-collapseall-${C.esc(run.id)}" title="Fold every round down to its band">Collapse all</button>
                <button class="chip${roundSingle ? ' on' : ''}" id="rd-singleopen-${C.esc(run.id)}" title="Only one round open at a time: expanding a round folds the others">Single-open</button>
            </div>` : ''}
            ${run.rounds.map(r => roundCard(r, run)).join('') || (active ? '' : '<p class="muted">No rounds ran.</p>')}
            ${isAdaptive(sp) ? castSection(run, sp) : ''}
            ${isAdaptive(sp) ? conversationSection(run) : ''}
            ${isAdaptive(sp) ? evaluationSection(run) : ''}
            ${isAdaptive(sp) ? graphSection(run) : ''}
            ${ledgerSection(run)}
            ${run.result ? `<div class="resultbox ${run.result.verdict}">
                <b>${C.esc(run.result.verdict.toUpperCase())}</b> — ${C.esc(run.result.summary)}
                ${/* ‼️ U-64 — AN HONEST ENDING SAYS WHAT IT DID NOT REACH. A
                      partial or a failure whose unmet criteria were only in a
                      log is a verdict the reader has to take on trust; these
                      are the exact ids the success gate refused on. */''}
                ${(run.result.unmet || []).length ? `<div class="unmet">
                    <span class="muted small">Not reached:</span>
                    ${run.result.unmet.map(u => `<span class="mchip bad"
                        title="${C.esc(u.id + ' — ' + u.text + '\nverdict: ' + u.verdict)}">${C.esc(u.id)} ${C.esc(u.verdict)}</span>`).join(' ')}
                </div>` : ''}
                <div class="muted small">total ${usd(run.totalCostUSD)} · ended ${fmtTime(run.endedAt)}${
                    run.result.stopReason ? ` · stopped: ${C.esc(run.result.stopReason)}` : ''}</div></div>` : ''}
            ${run.status === 'failed' && !run.result && run.note ? `<div class="resultbox failed">
                <b>FAILED</b> — ${C.esc(run.note)}
                <div class="muted small">ended ${fmtTime(run.endedAt)} · tracked cost ${usd(run.totalCostUSD)} (a killed planner call's spend is not in this number)</div></div>` : ''}
            ${run.note && !(run.status === 'failed' && !run.result) ? `<p class="muted small">note: ${C.esc(run.note)}</p>` : ''}
        </div>`;
    }

    /** Same accordion controls as the session viewer's turns: expand/collapse
     *  all + a Single-open mode chip. */
    function runCtlHtml(shownCount) {
        if (!DATA.runs.length) { return ''; }
        const nf = activeFilterCount();
        return `<div class="chiprow">
            <span class="muted small">Sort by:</span>
            <select id="m-sort">${RUN_SORTS.map(s =>
                `<option value="${s.id}"${s.id === runSort ? ' selected' : ''}>${s.label}</option>`).join('')}</select>
            <button class="chip" id="m-sortdir" title="Flip the sort direction">${runSortAsc ? '▲ asc' : '▼ desc'}</button>
            <button class="chip${nf ? ' on' : ''}" id="m-filters" title="Filter the list by status, verdict, agents, ranges and dates${nf ? ` — ${nf} active` : ''}">Filters</button>
            <span class="muted small">Runs:</span>
            <button class="chip" id="r-expandall" title="Open every run's detail">Expand all</button>
            <button class="chip" id="r-collapseall" title="Fold the list back to plain rows">Collapse all</button>
            <button class="chip${runSingle ? ' on' : ''}" id="r-singleopen" title="Only one run open at a time: opening a run folds the previously open one">Single-open</button>
            <span class="muted small">${nf ? `${shownCount}/${DATA.runs.length} runs` : '— click a row to open/fold that run'}</span>
        </div>` + filterPanelHtml();
    }

    /**
     * What a run IS, for the right-click menu.
     *
     * ‼️ EVERY CONTROL THIS PAGE HAS LIVES INSIDE THE EXPANDED DETAIL — pause,
     * resume, cancel, approve, answer. Reading the list means reading rows, and
     * a row you have to open before you can steer it is a row you steer late.
     * The flags below are exactly what the menu needs to decide which of those
     * controls apply, so the menu offers "Resume" only on something paused.
     */
    function runCtx(r, open) {
        const active = r.status !== 'done' && r.status !== 'failed' && r.status !== 'cancelled';
        return window.AFCtx.row('afMissionRow', {
            run: r.id, afOpen: !!open, afStatus: r.status, afActive: active,
            afPausing: !!r.pausePending,
            afPlanner: !!(DATA.plannerTranscripts || {})[r.id],
            afQuestion: (DATA.pending.questions || []).some(q => q.runId === r.id),
            afApproval: (DATA.pending.approvals || []).indexOf(r.id) >= 0
        });
    }

    /** Runs as an accordion list: plain rows until clicked, the full detail
     *  expands inline under the row (nothing opens on its own). */
    function listHtml() {
        if (!DATA.runs.length) {
            return '<p class="muted">No missions yet — <a id="firstmission">start the first one</a>.</p>';
        }
        const pool = filteredRuns(DATA.runs);
        const rows = sortedRuns(pool).map(r => {
            const sp = spec(r);
            const open = openRuns.has(r.id);
            const tok = runTokens(r);
            const st = runSteps(r);
            // a non-success verdict deserves its own glanceable chip next to "done"
            const verdict = r.result && r.result.verdict !== 'success'
                ? ` <span class="mchip ${r.result.verdict === 'failed' ? 'bad' : 'wait'}">${C.esc(r.result.verdict)}</span>` : '';
            return `<tr class="mrow${open ? ' sel' : ''}" data-run="${C.esc(r.id)}" ${runCtx(r, open)}
                title="${C.esc(runTooltip(r, sp) + '\n— ' + window.AFCtx.HINT)}">
                <td class="stoggle">${open ? '▾' : '▸'}</td>
                <td>${C.esc(sp.title)}${sp.mode === 'adaptive'
                    ? ' <span class="mchip adpt">ADPT</span>' : ''}</td>
                <td>${C.esc(sp.leadAgentName)} <span class="muted small">+${sp.team.length}</span></td>
                <td>${chip(r.status)}${verdict}</td>
                <td>R${r.rounds.length}/${capN(sp.limits.maxRounds)}</td>
                <td>${st.total ? `${st.total}${st.failed ? ` <span class="mchip bad">${st.failed}✕</span>` : ''}` : '—'}</td>
                <td class="num">${tok ? C.fmtTok(tok) : '—'}</td>
                <td class="num">${usd(r.totalCostUSD)}</td>
                <td class="muted small">${fmtTime(r.startedAt)}</td>
            </tr>` + (open ? `<tr class="rundetail"><td colspan="9">${detailHtml(r)}</td></tr>` : '');
        }).join('');
        return runCtlHtml(pool.length) + `<table class="mtable" id="mlist"><thead>
            <tr><th></th><th>Mission</th><th>Lead + team</th><th>Status</th><th>Rounds</th><th>Tasks</th><th class="num">Tokens</th><th class="num">Cost</th><th>Started</th></tr>
        </thead><tbody>${rows || `<tr><td colspan="9" class="muted">No runs match the filters.</td></tr>`}</tbody></table>`;
    }

    function render() {
        // ‼️ U-65 — read the transcript's place BEFORE the markup that holds it
        // is thrown away. Nothing else on this page can be scrolled away from
        // and still be the thing you were doing.
        // ‼️ X-93 — read it out of the box that belongs to the OPEN exchange.
        // The id used to be the same on every one of them, so with two run rows
        // open on their own `c1` this managed whichever happened to be first.
        const cvWas = convThread && document.getElementById(cvDomId('cv-scroll', convThread));
        if (cvWas && typeof cvWas.scrollTop === 'number') {
            const rd = cvRead(convThread);
            rd.scroll = cvWas.scrollTop;
            rd.atEnd = cvWas.scrollTop + (cvWas.clientHeight || 0) >= (cvWas.scrollHeight || 0) - 8;
        }
        // after Start: the freshly created run (newest row) opens itself once
        if (openNewest && DATA.runs.length) {
            openNewest = false;
            if (runSingle) { openRuns.clear(); }
            openRuns.add(DATA.runs[0].id);
        }
        document.getElementById('app').innerHTML = `
            <style>
                .mchip { font-size:10px; padding:1px 8px; border-radius:8px; white-space:nowrap;
                    background:var(--vscode-badge-background); color:var(--vscode-badge-foreground); }
                /* Status chips are OUTLINE style: colored border + colored text on the
                   page background — readable in light and dark themes alike (a solid
                   theme-color background with hardcoded white text is not). */
                .mchip.ok, .mchip.bad, .mchip.live, .mchip.wait {
                    background:transparent; border:1px solid currentColor; }
                .mchip.ok { color:var(--vscode-testing-iconPassed, #2d7d46); }
                .mchip.bad { color:var(--vscode-errorForeground, #d13438); }
                .mchip.live { color:var(--vscode-textLink-foreground); }
                .mchip.wait { color:var(--vscode-editorWarning-foreground, #b58900); }
                .mchip.team, .mchip.ro { opacity:.85; }
                /* U-64: the mode badge. Outline like the status chips and drawn
                   ONLY on an adaptive run — classic is the default and a badge
                   on every row would spend width saying so. The row's own
                   tooltip names the mode either way. */
                .mchip.adpt { background:transparent; border:1px solid currentColor;
                    color:var(--vscode-textLink-foreground); letter-spacing:.4px; padding:0 5px; }
                .mchip.mdl, .mchip.team i.mdl { font-style:normal; opacity:.75; font-size:9px;
                    border:1px solid var(--vscode-widget-border, #5555); border-radius:6px; padding:0 4px; margin-left:3px; }
                .nowstrip { display:flex; align-items:center; gap:7px; margin:8px 0; padding:7px 10px;
                    border-radius:5px; font-size:12px;
                    border:1px solid color-mix(in srgb, var(--vscode-textLink-foreground) 40%, transparent);
                    background:color-mix(in srgb, var(--vscode-textLink-foreground) 7%, transparent); }
                .nowstrip.paused { border-color:var(--vscode-inputValidation-warningBorder, #b89500);
                    background:var(--vscode-inputValidation-warningBackground, #664d0033); }
                .nowdot { width:8px; height:8px; border-radius:50%; background:var(--vscode-textLink-foreground);
                    animation:afpulse 1.2s ease-in-out infinite; flex:none; }
                .nowdot.hold { background:var(--vscode-inputValidation-warningBorder, #b89500); animation:none; }
                @keyframes afpulse { 0%,100% { opacity:.35 } 50% { opacity:1 } }
                button.pressed { outline:2px solid var(--vscode-inputValidation-warningBorder, #b89500);
                    background:var(--vscode-inputValidation-warningBackground, #664d0033); }
                .mtable { width:100%; border-collapse:collapse; margin-top:8px; }
                .mtable th { text-align:left; font-size:11px; opacity:.7; padding:4px 8px; }
                .mtable td { padding:4px 8px; border-top:1px solid var(--vscode-widget-border, #3333); font-size:12px; }
                .mrow { cursor:pointer; }
                .mrow:hover td { background:var(--vscode-list-hoverBackground); }
                .mrow.sel td { background:color-mix(in srgb, var(--vscode-textLink-foreground) 12%, transparent); }
                .dethead { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
                .goal { margin:8px 0; padding:8px 10px; border-left:3px solid var(--vscode-textLink-foreground);
                    background:color-mix(in srgb, var(--vscode-textLink-foreground) 6%, transparent); white-space:pre-wrap; }
                .budget { margin:6px 0 4px; }
                .tokshare { margin:0 0 12px; }
                .tokshare b { font-weight:600; color:var(--vscode-textLink-foreground); }
                .budgetbar { height:6px; border-radius:3px; background:var(--vscode-widget-border, #4444); overflow:hidden; margin-bottom:3px; }
                .budgetfill { height:100%; background:var(--vscode-textLink-foreground); }
                .budgetfill.hot { background:var(--vscode-errorForeground, #f66); }
                /* Round band — the session viewer's turn band, verbatim language:
                   caret + tinted band + colored round number + right-aligned stats. */
                .turnhdr { display:flex; align-items:center; gap:10px; margin:12px 0 6px; cursor:pointer;
                    padding:6px 10px; border-radius:4px; font-size:12px;
                    background:var(--vscode-editor-inactiveSelectionBackground, #3a3d41);
                    background:color-mix(in srgb, var(--vscode-textLink-foreground) 14%, var(--vscode-editor-background));
                    border-left:4px solid var(--vscode-textLink-foreground); }
                .turnhdr .tcaret { flex:none; width:12px; text-align:center; font-size:10px; opacity:.75; }
                .turnhdr .turnnum { font-weight:700; white-space:nowrap; color:var(--vscode-textLink-foreground); }
                .turnhdr .turnlabel { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; opacity:.9; }
                .turnhdr .turnstats { white-space:nowrap; font-size:11px; color:var(--vscode-descriptionForeground); }
                .turnhdr.closed { margin:6px 0; }
                .tag { font-size:10px; padding:1px 6px; border-radius:8px; white-space:nowrap;
                    background:var(--vscode-badge-background); color:var(--vscode-badge-foreground); opacity:.85; }
                .roundbody { margin:0 0 10px 16px; }
                /* .mtable th's text-align:left must not beat .num — headers and
                   values right-align TOGETHER or the columns look shifted */
                .mtable .num { text-align:right; }
                /* Accordion controls — the viewer's chip row, verbatim. */
                .chiprow { display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin:10px 0 4px; }
                .chip { font-size:11px; padding:2px 10px; cursor:pointer; border-radius:10px;
                    background:transparent; color:var(--vscode-foreground);
                    border:1px solid var(--vscode-widget-border, #4444); opacity:.85; }
                .chip:hover { opacity:1; }
                .chip.on { border-color:var(--vscode-textLink-foreground); color:var(--vscode-textLink-foreground); opacity:1; }
                .rundetail > td { padding:8px 12px 14px; }
                .fltpanel { display:flex; flex-direction:column; gap:6px; margin:2px 0 8px;
                    padding:8px 10px; border:1px solid var(--vscode-widget-border, #3333); border-radius:5px; }
                .fltrow { display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
                /* U-52 — the named subsets of the row they sit at the end of.
                   Links, not chips: a chip is a value that can be on, and these
                   are gestures that SET the values — drawing them the same
                   would be a fourth kind of thing pretending to be a status. */
                .fltgroups { font-size:11px; opacity:.75; margin-left:4px; }
                .fltgroups a { color:var(--vscode-textLink-foreground); cursor:pointer; }
                .fltgroups a:hover { text-decoration:underline; }
                .fltrange { font-size:11px; display:flex; gap:3px; align-items:center; white-space:nowrap; }
                .fltrange input[type=number] { width:64px; padding:1px 4px; }
                .fltrange input[type=date] { padding:1px 4px; }
                .mdetail { border-left:3px solid var(--vscode-widget-border, #3333); padding-left:12px; }
                .thought { font-size:12px; font-style:italic; opacity:.85; margin:4px 0; }
                .qa { font-size:12px; margin-top:4px; }
                .waitbox { margin:10px 0; padding:10px 12px; border-radius:5px; font-size:12px;
                    border:1px solid var(--vscode-inputValidation-warningBorder, #b89500);
                    background:var(--vscode-inputValidation-warningBackground, #664d0033); }
                .waitbox button { margin-left:6px; }
                .resultbox { margin:12px 0 4px; padding:10px 12px; border-radius:5px; font-size:13px;
                    border-left:4px solid var(--vscode-textLink-foreground);
                    background:color-mix(in srgb, var(--vscode-textLink-foreground) 8%, transparent); }
                .resultbox.failed { border-left-color:var(--vscode-errorForeground, #f66); }
                .frow { margin:10px 0; }
                .frow label { display:block; font-size:12px; }
                .frow input[type=text], .frow textarea, .frow select { width:100%; max-width:640px; margin-top:3px; padding:5px 8px; }
                .flabel { font-size:12px; display:block; margin-bottom:4px; }
                .req { font-size:10px; color:var(--vscode-descriptionForeground); }
                /* ‼️ U-97 — FOUR PICKERS ON THE ROW NOW (engine · model · effort
                   · permissions) and a fixed 152px each overflowed the panel the
                   moment it was docked narrow: the boxes were cut, not wrapped.
                   They shrink together down to a floor that still shows a word,
                   and the row wraps rather than clipping. */
                .tmrow { display:flex; gap:8px; align-items:center; margin:0; padding:3px 0; flex-wrap:wrap; }
                /* Wrapping is what keeps the controls whole in a docked panel,
                   but a row that has wrapped ends up sitting directly above the
                   NEXT member's checkbox and reads as if it belonged to it. One
                   hairline says where a member starts, at no width cost. */
                .tmrow + .tmrow { border-top:1px solid color-mix(in srgb, var(--vscode-foreground) 16%, transparent); }
                .tmrow label { flex:0 1 180px; min-width:130px; }
                .tmrow input[type=text] { flex:2 1 170px; min-width:110px; max-width:340px; }
                .tmrow select { flex:1 1 132px; min-width:96px; max-width:168px; margin-top:0; }
                .limrow { display:flex; gap:14px; flex-wrap:wrap; }
                .limfield { font-size:11px; }
                .limfield input { width:90px; display:block; margin-top:3px; }
                .ferr { color:var(--vscode-errorForeground); font-size:12px; margin:8px 0; }
                #f-browse { margin-top:4px; }
                /* ---- U-64: which kind of mission, and the objective fields ---- */
                .modeseg { display:inline-flex; margin:2px 0 10px; border-radius:6px; overflow:hidden;
                    border:1px solid var(--vscode-panel-border, rgba(128,128,128,.35)); }
                .segbtn { font-size:12px; padding:4px 14px; border:0; cursor:pointer; white-space:nowrap;
                    background:transparent; color:var(--vscode-foreground); }
                .segbtn + .segbtn { border-left:1px solid var(--vscode-panel-border, rgba(128,128,128,.35)); }
                .segbtn.on { background:var(--vscode-button-background); color:var(--vscode-button-foreground); }
                .listrow { display:flex; gap:8px; align-items:center; margin:3px 0; }
                .listrow .grow { flex:1; max-width:560px; margin-top:0; }
                .critid { font-size:10px; flex:0 0 22px; opacity:.7; font-family:var(--vscode-editor-font-family, monospace); }
                .reqbox { flex:0 0 auto; font-size:11px; display:flex; gap:4px; align-items:center;
                    color:var(--vscode-descriptionForeground); }
                .reqbox input { margin:0; }
                .advsec { margin:12px 0 4px; border-top:1px solid var(--vscode-panel-border, rgba(128,128,128,.25)); padding-top:4px; }
                .advbody { padding-left:14px; border-left:2px solid var(--vscode-panel-border, rgba(128,128,128,.25)); }
                /* ---- U-64: the adaptive run detail ---- */
                .mchip.req { background:transparent; border:1px solid currentColor;
                    color:var(--vscode-editorWarning-foreground, #b58900); }
                .mchip.ver, .mchip.phase, .mchip.adv, .mchip.conv, .mchip.council {
                    background:transparent; border:1px solid var(--vscode-widget-border, #5555);
                    color:var(--vscode-descriptionForeground); padding:0 5px; }
                .mchip.ver { color:var(--vscode-textLink-foreground); }
                .mchip.council { color:var(--vscode-textLink-foreground); }
                .objbody, .stratbody, .evbody, .castbody, .graphbody, .cvbody, .guidebody {
                    padding-left:14px; border-left:2px solid var(--vscode-panel-border, rgba(128,128,128,.25)); }
                table.crit td, table.crit th { padding:3px 8px; }
                table.crit td.critid { font-family:var(--vscode-editor-font-family, monospace); opacity:.7; }
                .conslist ul { margin:2px 0 0 18px; padding:0; font-size:12px; }
                .curstrat { font-size:12px; margin:4px 0 8px; }
                .strow, .evrow, .castrow, .gnode, .cvrow, .grow {
                    display:flex; gap:8px; align-items:baseline; flex-wrap:wrap;
                    font-size:12px; padding:2px 0; }
                .strow .stext, .cvrow .cvq, .castrow .brief, .gnode .glabel { flex:1 1 220px; min-width:0; }
                .sreason { font-size:11px; color:var(--vscode-descriptionForeground); font-style:italic; }
                .evrow.stale { opacity:.6; }
                .gnode .gid { font-family:var(--vscode-editor-font-family, monospace); font-size:10px;
                    opacity:.6; flex:0 0 34px; }
                .gnode.decision { border-left:2px solid var(--vscode-textLink-foreground); padding-left:6px; }
                .gnode.delegation { padding-left:22px; }
                .gnode.question, .gnode.approval, .gnode.guidance { padding-left:22px; opacity:.9; }
                /* ‼️ X-88 — a verdict sits at the depth of the work it judged,
                   not at the lead's own margin: it is a reading of that work. */
                .gnode.evaluation { padding-left:22px;
                    border-left:2px solid var(--vscode-charts-purple, #b180d7); }
                .gnode.finish { border-left:2px solid var(--vscode-testing-iconPassed, #2d7d46); padding-left:6px; }
                .gin { font-size:10px; opacity:.75; }
                .guideform { display:flex; gap:8px; align-items:flex-start; flex-wrap:wrap; margin-top:6px; }
                .guideform textarea { flex:1 1 320px; max-width:520px; padding:5px 8px; }
                .grow.pend { color:var(--vscode-editorWarning-foreground, #b58900); }
                .unmet { margin:4px 0; display:flex; gap:6px; align-items:baseline; flex-wrap:wrap; }
                /* ---- U-65: the conversation room ---- */
                .cvfilter { font-size:11px; margin:2px 0 6px; opacity:.85; }
                .cvfilter label { display:inline-flex; gap:5px; align-items:center; cursor:pointer; }
                .cvthread { border-bottom:1px dotted var(--vscode-widget-border, #2a2a2a); }
                .cvthread:last-child { border-bottom:none; }
                .cvroww { display:block; }
                .cvrow { display:flex; gap:8px; align-items:baseline; flex-wrap:wrap;
                    font-size:11px; padding:4px 0; cursor:pointer; }
                .cvrow:hover { background:var(--vscode-list-hoverBackground); }
                .cvrow .carets { width:12px; opacity:.7; flex:none; }
                .cvq { font-weight:600; }
                .cvvotes { display:inline-flex; gap:4px; flex-wrap:wrap; }
                /* the transcript: a reading surface, so it scrolls on its own
                   and the row above it stays put while the reader moves */
                .cvmsgs { max-height:420px; overflow:auto; padding:2px 0 6px 20px; }
                .cvmore, .cvnew { font-size:11px; padding:3px 0; cursor:pointer; opacity:.8;
                    color:var(--vscode-textLink-foreground); }
                .cvnew { position:sticky; top:0; z-index:2; opacity:1; font-weight:600;
                    background:var(--vscode-editor-background); padding:3px 6px; border-radius:4px; }
                .cvnew:hover { text-decoration:underline; }
                .cvmore:hover { text-decoration:underline; }
                .cvmsg { padding:4px 0 5px; border-bottom:1px dotted var(--vscode-widget-border, #242424); }
                .cvmsg:last-child { border-bottom:none; }
                .cvmsg.bad .cvwho { opacity:.7; }
                /* ‼️ X-81 — an ORDERED turn is not a quiet one: it has not happened yet. */
                .cvmsg.pend .cvwho { opacity:.7; font-style:italic; }
                .cvmsg.marked { background:var(--vscode-editor-findMatchHighlightBackground, #3a3a1a);
                    outline:1px solid var(--vscode-focusBorder, #007fd4); border-radius:3px; }
                .cvmhead { display:flex; gap:7px; align-items:baseline; flex-wrap:wrap; font-size:11px; }
                .cvwho { font-size:11px; }
                .cvts { margin-left:auto; }
                .cvlinks { display:inline-flex; gap:6px; }
                .cvlinks a, .cvref { cursor:pointer; color:var(--vscode-textLink-foreground); }
                .cvlinks a:hover, .cvref:hover { text-decoration:underline; }
                .cvrefs { font-size:10px; opacity:.85; }
                .cvtext { font-size:11px; margin:2px 0 0 20px; white-space:pre-wrap;
                    color:var(--vscode-descriptionForeground, #999); }
                .mchip.cvi { background:transparent; border:1px solid currentColor; opacity:.9; }
                .mchip.cvi.challenge, .mchip.cvi.question { color:var(--vscode-editorWarning-foreground, #b58900); }
                .mchip.cvi.concede, .mchip.cvi.response { color:var(--vscode-testing-iconPassed, #2d7d46); }
                .mchip.cvi.vote, .mchip.cvi.synthesis { color:var(--vscode-textLink-foreground); }
                .mchip.lane { background:transparent; border:1px dotted var(--vscode-widget-border, #5555);
                    opacity:.7; font-size:9px; }
                .mchip.council { color:var(--vscode-textLink-foreground); }
                /* ---- mission-control observation ---- */
                .colsec { margin:8px 0; }
                .colhead { display:flex; gap:8px; align-items:center; cursor:pointer; user-select:none;
                    font-size:12px; margin:6px 0 4px; flex-wrap:wrap; }
                .colhead .carets { width:12px; opacity:.7; flex:none; }
                .lvchips { display:flex; gap:6px; flex-wrap:wrap; margin-left:4px; }
                .lchip { font-size:10px; padding:1px 7px; border-radius:8px;
                    border:1px solid var(--vscode-widget-border, #5555); white-space:nowrap; }
                .lchip.busy { border-color:var(--vscode-textLink-foreground); color:var(--vscode-textLink-foreground); }
                .lchip.alert { border-color:var(--vscode-inputValidation-warningBorder, #b89500);
                    color:var(--vscode-inputValidation-warningBorder, #d0a500); }
                .lchip.quiet { opacity:.6; }
                .lvbody { max-height:220px; overflow:auto; border:1px solid var(--vscode-widget-border, #3333);
                    border-radius:5px; padding:4px 8px; }
                .lerow { font-size:11px; padding:2px 0; border-bottom:1px dotted var(--vscode-widget-border, #2a2a2a); cursor:pointer; }
                .lerow:hover { background:var(--vscode-list-hoverBackground); }
                .lerow.alert { color:var(--vscode-inputValidation-warningBorder, #d0a500); }
                .srow { cursor:pointer; }
                .stoggle { width:14px; opacity:.7; }
                .sdetail td { background:color-mix(in srgb, var(--vscode-textLink-foreground) 4%, transparent); }
                .sdlabel { font-size:11px; opacity:.85; margin:6px 0 3px; display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
                .sdpre { font-family:var(--vscode-editor-font-family, monospace); font-size:11px; white-space:pre-wrap;
                    max-height:200px; overflow:auto; margin:0 0 6px; padding:6px 8px;
                    border:1px solid var(--vscode-widget-border, #3333); border-radius:4px; }
                .tailpre { max-height:260px; }
                .nowdot.small { width:6px; height:6px; }
                .ledgerpre { font-size:11px; white-space:pre-wrap; padding:6px 8px; margin:4px 0;
                    border:1px solid var(--vscode-widget-border, #3333); border-radius:4px; max-height:200px; overflow:auto; }
            </style>
            ${window.AFHeader.html({
                page: 'missions',
                title: 'Missions',
                sub: 'Dynamic orchestration: a lead agent plans round by round, delegates to the team, and finishes with an honest verdict. <a data-guide="missions">?</a>',
                actions: `<button id="newmission">+ New Mission</button>`,
                guide: 'missions'
            })}
            ${formOpen ? formHtml() : ''}
            ${listHtml()}
        `;

        // ‼️ U-65 — and put it back. A reader who was following the exchange
        // rides down with the new turn; a reader who had gone back up keeps
        // exactly the line they were on and is told, in a count, what arrived.
        const cvNow = convThread && document.getElementById(cvDomId('cv-scroll', convThread));
        if (cvNow && typeof cvNow.scrollTop === 'number') {
            const rd = cvRead(convThread);
            cvNow.scrollTop = rd.atEnd ? (cvNow.scrollHeight || 0) : rd.scroll;
        }
        window.AFHeader.wire(vscode);
        const wire = (id, fn) => {
            const el = document.getElementById(id);
            if (el) { el.addEventListener('click', fn); }
        };
        document.querySelectorAll('[data-guide]').forEach(el =>
            el.addEventListener('click', () => vscode.postMessage({ type: 'openGuide', anchor: el.dataset.guide })));
        const nm = document.getElementById('newmission');
        if (nm) { nm.addEventListener('click', () => { formOpen = true; render(); }); }
        const fm = document.getElementById('firstmission');
        if (fm) { fm.addEventListener('click', () => { formOpen = true; render(); }); }

        if (formOpen) {
            document.getElementById('f-start').addEventListener('click', submitForm);
            document.getElementById('f-cancel').addEventListener('click', () => { formOpen = false; formErr = ''; render(); });
            // Advanced can be folded, so Browse… is not always on screen.
            wire('f-browse', () => { readForm(); vscode.postMessage({ type: 'pickFolder' }); });
            // ‼️ U-64 — switching mode READS FIRST. Everything typed stays in
            // `form`; the other mode's fields are hidden, never cleared.
            const setMode = (m) => { readForm(); form.mode = m; formErr = ''; render(); };
            wire('f-mode-classic', () => setMode('classic'));
            wire('f-mode-adaptive', () => setMode('adaptive'));
            wire('f-adv', () => { readForm(); advOpen = !advOpen; render(); });
            wire('cn-add', () => { readForm(); form.constraints.push(''); render(); });
            wire('cr-add', () => { readForm(); form.criteria.push({ text: '', required: true }); render(); });
            form.constraints.forEach((_, i) => wire('cn-del-' + i, () => {
                readForm();
                form.constraints.splice(i, 1);
                if (!form.constraints.length) { form.constraints.push(''); }
                render();
            }));
            form.criteria.forEach((_, i) => wire('cr-del-' + i, () => {
                readForm();
                form.criteria.splice(i, 1);
                if (!form.criteria.length) { form.criteria.push({ text: '', required: true }); }
                render();
            }));
            // ticking a team agent enables its role field
            DATA.agents.forEach((a, i) => {
                const cb = document.getElementById('tm-' + i);
                if (cb) { cb.addEventListener('change', () => { readForm(); render(); }); }
                // ‼️ U-64 — a member's engine decides what its model box suggests
                // and whether its effort box has anything in it, so changing it
                // redraws the row. Same for the mission-wide engine below: every
                // member that states none inherits it.
                // ‼️ U-97 — and the row is NARROWED before it is drawn again,
                // so an incompatible model/effort left over from the previous
                // engine is dropped here rather than passed to a CLI that
                // refuses it.
                const en = document.getElementById('en-' + i);
                if (en) { en.addEventListener('change', () => { readForm(); narrowRow(a.id); render(); }); }
                // The model decides which efforts exist (`AFEngine.efforts`
                // answers per engine AND per model), so it redraws the row too.
                const md = document.getElementById('md-' + i);
                if (md) { md.addEventListener('change', () => { readForm(); narrowRow(a.id); render(); }); }
            });
            const missionEng = document.getElementById('f-engine');
            // ‼️ U-97 — the mission engine is the fallback for every member that
            // states none, so changing it narrows exactly those rows. A member
            // with its own engine is not touched.
            if (missionEng) {
                missionEng.addEventListener('change', () => {
                    readForm();
                    DATA.agents.forEach(a => { if (!form.engines[a.id]) { narrowRow(a.id); } });
                    render();
                });
            }
        }

        document.querySelectorAll('.mrow').forEach(row =>
            row.addEventListener('click', () => {
                if (formOpen) { readForm(); } // keep typed values across the re-render
                const id = row.dataset.run;
                if (openRuns.has(id)) { openRuns.delete(id); }
                else {
                    if (runSingle) { openRuns.clear(); }
                    openRuns.add(id);
                }
                render();
            }));
        // sort select + direction: string sorts start A–Z, numeric biggest-first
        const sortSel = document.getElementById('m-sort');
        if (sortSel && sortSel.addEventListener) {
            sortSel.addEventListener('change', e => {
                runSort = e.target.value;
                const def = RUN_SORTS.find(s => s.id === runSort);
                runSortAsc = !!(def && def.str);
                saveUiState();
                render();
            });
        }
        wire('m-sortdir', () => { runSortAsc = !runSortAsc; saveUiState(); render(); });
        wire('m-filters', () => { filtersOpen = !filtersOpen; saveUiState(); render(); });
        if (filtersOpen) {
            const applyFlt = () => { saveUiState(); render(); };
            RUN_STATUSES.forEach(s => wire('fs-' + s, () => {
                const i = filters.status.indexOf(s);
                if (i >= 0) { filters.status.splice(i, 1); } else { filters.status.push(s); }
                applyFlt();
            }));
            // U-52 — the same axis, said in one press. A group REPLACES the
            // selection rather than adding to it: "waiting on you" is a
            // question, not another chip, and leaving the last pick underneath
            // it would answer a different one.
            STATUS_GROUPS.forEach(g => wire('fg-' + g.id, () => {
                filters.status = g.values.slice();
                applyFlt();
            }));
            wire('fg-none', () => { filters.status = []; applyFlt(); });
            VERDICTS.forEach(v => wire('fv-' + v, () => {
                const i = filters.verdict.indexOf(v);
                if (i >= 0) { filters.verdict.splice(i, 1); } else { filters.verdict.push(v); }
                applyFlt();
            }));
            // filter boxes apply as you type — no blur, no Enter (afFilters.js
            // keeps the caret across the re-render each keystroke triggers)
            const wireInput = (id, fn, delay) =>
                window.AFFilter.live(document.getElementById(id), fn, delay);
            const facets = filterFacets();
            window.AFFilter.wireMulti({
                id: 'flt-leads',
                onChange: sel => { filters.leads = sel; applyFlt(); }
            });
            window.AFFilter.wireMulti({
                id: 'flt-agents',
                onChange: sel => { filters.agents = sel; applyFlt(); }
            });
            wireInput('f-from', el => { filters.from = el.value; applyFlt(); }, 300);
            wireInput('f-to', el => { filters.to = el.value; applyFlt(); }, 300);
            RANGE_KEYS.forEach(k => {
                const setBound = (bound) => (el) => {
                    const n = el.value === '' ? undefined : Number(el.value);
                    const rg = filters.ranges[k.id] || (filters.ranges[k.id] = {});
                    rg[bound] = (n === undefined || isNaN(n)) ? undefined : n;
                    if (rg.min === undefined && rg.max === undefined) { delete filters.ranges[k.id]; }
                    applyFlt();
                };
                wireInput(`fr-${k.id}-min`, setBound('min'));
                wireInput(`fr-${k.id}-max`, setBound('max'));
            });
            wire('f-clear', () => { filters = FILTER_DEFAULTS(); applyFlt(); });
        }
        wire('r-expandall', () => { DATA.runs.forEach(r => openRuns.add(r.id)); runSingle = false; render(); });
        wire('r-collapseall', () => { openRuns.clear(); render(); });
        wire('r-singleopen', () => {
            runSingle = !runSingle;
            if (runSingle && openRuns.size > 1) {
                const keep = DATA.runs.find(r => openRuns.has(r.id));
                openRuns.clear();
                if (keep) { openRuns.add(keep.id); }
            }
            render();
        });
        // round bands fold/unfold like the viewer's turn bands; single-open
        // mode folds the siblings of the round being expanded
        document.querySelectorAll('[data-round]').forEach(band =>
            band.addEventListener('click', () => {
                const key = band.dataset.round;
                if (closedRounds.has(key)) {
                    closedRounds.delete(key);
                    if (roundSingle) {
                        const runId = key.slice(0, key.lastIndexOf(':'));
                        const run = DATA.runs.find(x => x.id === runId);
                        if (run) {
                            run.rounds.forEach(rd => {
                                const k2 = runId + ':' + rd.n;
                                if (k2 !== key) { closedRounds.add(k2); }
                            });
                        }
                    }
                } else { closedRounds.add(key); }
                render();
            }));
        document.querySelectorAll('[data-openfile]').forEach(a =>
            a.addEventListener('click', ev => {
                if (ev && ev.stopPropagation) { ev.stopPropagation(); }
                vscode.postMessage({ type: 'openFile', file: a.dataset.openfile });
            }));
        // ‼️ U-65 — one exchange open at a time: a transcript is a reading
        // surface and two of them stacked is neither.
        document.querySelectorAll('[data-cvthread]').forEach(row =>
            row.addEventListener('click', ev => {
                if (ev && ev.stopPropagation) { ev.stopPropagation(); }
                const key = cvKey(row.dataset.cvrun, row.dataset.cvthread);
                // ‼️ X-93 — folding an exchange keeps its place; only the
                // one-shot marks are cleared, and only for the one clicked.
                const rd = cvRead(key);
                rd.all = false;
                rd.mark = null;
                convThread = convThread === key ? null : key;
                render();
            }));
        document.querySelectorAll('[data-cvend]').forEach(el =>
            el.addEventListener('click', ev => {
                if (ev && ev.stopPropagation) { ev.stopPropagation(); }
                if (!convThread) { return; }
                // Pressing the count is the reader CHOOSING to go there, so the
                // box is moved for real: the next capture then agrees with the
                // intent instead of reading the place they just left.
                const box = document.getElementById(cvDomId('cv-scroll', convThread));
                if (box && typeof box.scrollTop === "number") { box.scrollTop = box.scrollHeight || 0; }
                cvRead(convThread).atEnd = true;
                render();
            }));
        document.querySelectorAll('[data-cvall]').forEach(el =>
            el.addEventListener('click', ev => {
                if (ev && ev.stopPropagation) { ev.stopPropagation(); }
                if (!convThread) { return; }
                cvRead(convThread).all = true;
                render();
            }));
        // ‼️ U-65 — a ref is a LINK. "m3 answers m2" is the only thing that
        // makes a transcript followable, and a reader scrolling for an id is a
        // reader who stops following it.
        // ‼️ X-93 — AND IT LANDS ON A TARGET THAT WAS NOT ON SCREEN. The mark
        // was set and the page redrawn, and that was all: a target older than
        // the compact window, or hidden behind "unanswered only", or in another
        // exchange, was still not drawn — so the link visibly went nowhere and
        // the reader was left to work out why. Whatever is hiding it is opened
        // first, deterministically, and only then is the jump made.
        document.querySelectorAll('[data-cvjump]').forEach(a =>
            a.addEventListener('click', ev => {
                if (ev && ev.stopPropagation) { ev.stopPropagation(); }
                const target = a.dataset.cvjump;
                const runId = a.dataset.cvrun;
                const run = (DATA.runs || []).find(r => r.id === runId);
                const msgs = (run && run.messages) || [];
                const dest = msgs.find(m => m.id === target);
                // A ref that names nothing in this run cannot be followed; say
                // so by doing nothing rather than by redrawing to no effect.
                if (!dest) { return; }
                const key = cvKey(runId, dest.conversationId || a.dataset.cvconv || '');
                const rd = cvRead(key);
                convThread = key;                       // the target's OWN thread
                rd.mark = target;
                rd.all = true;                          // past the compact window
                rd.atEnd = false;                       // do not ride back to the bottom
                // …and out from under a filter that would hide it. Only when it
                // really would: a reader who set the filter keeps it otherwise.
                const open = openRefs(msgs.filter(m => m.conversationId === dest.conversationId));
                if (cvOnlyOpen(runId) && !open.some(o => o.id === target)) { convFilter[runId] = false; }
                render();
                const el = document.getElementById('cvm-' + runId + '-' + target);
                if (el && el.scrollIntoView) { el.scrollIntoView({ block: 'center' }); }
            }));
        // deep links into the session viewer (planner transcript, live-feed rows)
        document.querySelectorAll('[data-opensession]').forEach(a =>
            a.addEventListener('click', ev => {
                if (ev && ev.stopPropagation) { ev.stopPropagation(); }
                vscode.postMessage({
                    type: 'openSession', file: a.dataset.opensession,
                    ts: a.dataset.ts ? Number(a.dataset.ts) : undefined
                });
            }));
        // step accordion: one delegation open at a time (bounds the tail polling)
        document.querySelectorAll('[data-step]').forEach(row =>
            row.addEventListener('click', () => {
                expandedStep = expandedStep === row.dataset.step ? null : row.dataset.step;
                render();
            }));

        // controls live INSIDE each open run's inline detail — ids are suffixed
        // with the run id so several open runs never fight over an element
        DATA.runs.filter(r => openRuns.has(r.id)).forEach(r => {
            const id = r.id;
            wire('d-pause-' + id, () => vscode.postMessage({ type: 'control', action: 'pause', runId: id }));
            wire('d-unpause-' + id, () => vscode.postMessage({ type: 'control', action: 'unpause', runId: id }));
            wire('d-resume-' + id, () => vscode.postMessage({ type: 'control', action: 'resume', runId: id }));
            wire('d-cancel-' + id, () => vscode.postMessage({ type: 'control', action: 'cancel', runId: id }));
            wire('d-approve-' + id, () => vscode.postMessage({ type: 'approve', runId: id }));
            wire('d-reject-' + id, () => vscode.postMessage({ type: 'reject', runId: id }));
            wire('d-send-' + id, () => {
                const inp = document.getElementById('d-answer-' + id);
                vscode.postMessage({ type: 'answer', runId: id, text: inp ? inp.value : '' });
            });
            wire('lv-toggle-' + id, () => { liveOpen = !liveOpen; render(); });
            wire('lg-toggle-' + id, () => { ledgerOpen = !ledgerOpen; render(); });
            // ---- U-64: the adaptive sections fold like every other one here
            wire('ob-toggle-' + id, () => { objOpen = !objOpen; render(); });
            wire('st-toggle-' + id, () => { stratOpen = !stratOpen; render(); });
            wire('ev-toggle-' + id, () => { evalOpen = !evalOpen; render(); });
            wire('ca-toggle-' + id, () => { castOpen = !castOpen; render(); });
            wire('gr-toggle-' + id, () => { graphOpen = !graphOpen; render(); });
            wire('cv-toggle-' + id, () => { convOpen = !convOpen; render(); });
            // ‼️ U-65 — the filter is a control, so it keeps its own state
            // across the once-a-second repaint a live run causes.
            wire('cv-open-' + id, () => { convFilter[id] = !convFilter[id]; render(); });
            wire('gd-toggle-' + id, () => { guideOpen = !guideOpen; render(); });
            wire('gd-send-' + id, () => {
                const box = document.getElementById('gd-text-' + id);
                const text = box ? box.value : '';
                if (!String(text).trim()) { return; }
                delete guideNote[id];
                vscode.postMessage({ type: 'guide', runId: id, text });
            });
            // round-level accordion controls (mirror of the run-level chips)
            wire('rd-expandall-' + id, () => {
                r.rounds.forEach(rd => closedRounds.delete(id + ':' + rd.n));
                roundSingle = false;
                render();
            });
            wire('rd-collapseall-' + id, () => {
                r.rounds.forEach(rd => closedRounds.add(id + ':' + rd.n));
                render();
            });
            wire('rd-singleopen-' + id, () => {
                roundSingle = !roundSingle;
                if (roundSingle) {
                    // keep only the newest open round of this run
                    const open = r.rounds.filter(rd => !closedRounds.has(id + ':' + rd.n));
                    open.slice(0, -1).forEach(rd => closedRounds.add(id + ':' + rd.n));
                }
                render();
            });
        });

        // (re)arm the output tail for the expanded step; clears when none is open
        let tailFile = '', tailPoll = false;
        if (expandedStep) {
            for (const r of DATA.runs) {
                if (!openRuns.has(r.id)) { continue; }
                for (const rd of r.rounds) {
                    for (const s of rd.steps) {
                        if (s.id === expandedStep && s.outputFile) {
                            tailFile = s.outputFile;
                            tailPoll = s.status === 'running';
                        }
                    }
                }
            }
        }
        armTail(tailFile, tailPoll);

        // hold refreshes while typing in the form / answer box
        const app = document.getElementById('app');
        if (app.addEventListener) {
            app.addEventListener('focusin', ev => {
                const t = ev.target;
                if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) { editing = true; }
            });
            app.addEventListener('focusout', () => {
                editing = false;
                if (pendingData) { DATA = pendingData; pendingData = null; render(); }
            });
        }

        armTicker(document.querySelectorAll('[data-since]').length > 0);
    }

    // ------------------------------------------------------- right-click menu

    /** One run, one round, one delegation, one participant — found by the ids
     *  the row published, not by "whatever is under the pointer now". The list
     *  re-sorts and repaints on every mission event; the pick has to survive
     *  that, and only the identity in the context object does. */
    function findRun(id) { return DATA.runs.find(r => r.id === id); }
    function findStep(runId, stepId) {
        const run = findRun(runId);
        if (!run) { return null; }
        for (const rd of run.rounds) {
            const s = rd.steps.find(x => x.id === stepId);
            if (s) { return s; }
        }
        return null;
    }

    /**
     * Everything a right-click on this page can ask for.
     *
     * The steering acts post exactly what the detail's own buttons post
     * (`control`, `approve`, `reject`) — one message shape, one handler in the
     * panel. What the menu adds is REACH: those controls without opening the
     * run first, plus the two the page never had a button for at all (run the
     * mission again, delete a finished run from the history), which existed
     * only as sidebar-tree commands.
     */
    function ctxDo(act, ctx) {
        const verb = act.split(':')[0];
        const arg = act.slice(verb.length + 1);
        const runId = String(ctx.run || '');
        const copy = (v) => window.AFCtx.copy(v);
        const open = () => {
            if (runSingle) { openRuns.clear(); }
            openRuns.add(runId);
        };

        switch (verb) {
            // ---- a mission run ----
            case 'msOpen': open(); render(); return;
            case 'msFold': openRuns.delete(runId); render(); return;
            case 'msCtl': vscode.postMessage({ type: 'control', action: arg, runId: runId }); return;
            case 'msApprove': vscode.postMessage({ type: 'approve', runId: runId }); return;
            case 'msReject': vscode.postMessage({ type: 'reject', runId: runId }); return;
            case 'msRerun': vscode.postMessage({ type: 'rerun', runId: runId }); return;
            case 'msDelete': vscode.postMessage({ type: 'delete', runId: runId }); return;
            // The answer box lives in the run's detail, so the menu opens the
            // run and puts the caret in it rather than inventing a second way
            // of asking the same question.
            case 'msAnswer': {
                open();
                render();
                const box = document.getElementById('d-answer-' + runId);
                if (box) { box.scrollIntoView({ block: 'center' }); box.focus(); }
                return;
            }
            case 'msPlanner': {
                const file = (DATA.plannerTranscripts || {})[runId];
                if (file) { vscode.postMessage({ type: 'openSession', file: file }); }
                return;
            }
            case 'msCopy': {
                const r = findRun(runId);
                if (!r) { copy(''); return; }
                const sp = spec(r);
                copy(arg === 'goal' ? sp.goal
                    : arg === 'verdict' ? (r.result
                        ? r.result.verdict.toUpperCase() + ' — ' + r.result.summary
                        : (r.note || ''))
                        : arg === 'ledger' ? (r.ledger || []).join('\n')
                            : r.id);
                return;
            }

            // ---- one delegation ----
            case 'mstOpen':
                expandedStep = expandedStep === ctx.step ? null : String(ctx.step || '');
                render();
                return;
            case 'mstOut': {
                const s = findStep(runId, ctx.step);
                if (s && s.outputFile) { vscode.postMessage({ type: 'openFile', file: s.outputFile }); }
                return;
            }
            case 'mstAgent':
                if (ctx.agentId) { vscode.postMessage({ type: 'openAgent', agentId: String(ctx.agentId) }); }
                return;
            case 'mstCopy': {
                const s = findStep(runId, ctx.step);
                if (!s) { copy(''); return; }
                copy(arg === 'prompt' ? s.prompt : arg === 'output' ? s.outputFile : s.title);
                return;
            }

            // ---- one planner round ----
            case 'msrFold': {
                const key = runId + ':' + ctx.round;
                if (arg === '1') { closedRounds.add(key); } else { closedRounds.delete(key); }
                render();
                return;
            }
            case 'msrOnly': {
                const r = findRun(runId);
                if (!r) { return; }
                r.rounds.forEach(rd => closedRounds.add(runId + ':' + rd.n));
                closedRounds.delete(runId + ':' + ctx.round);
                render();
                return;
            }
            case 'msrCopy': {
                const r = findRun(runId);
                const rd = r && r.rounds.find(x => String(x.n) === String(ctx.round));
                if (!rd) { copy(''); return; }
                const lines = [`R${rd.n} · ${rd.action} · ${fmtTime(rd.at)}`];
                if (rd.thought) { lines.push(rd.thought); }
                if (rd.question) { lines.push('Q: ' + rd.question); }
                if (rd.answer) { lines.push('A: ' + rd.answer); }
                rd.steps.forEach(s => lines.push(`  · ${s.agentName}: ${s.title} — ${s.status}`));
                copy(lines.join('\n'));
                return;
            }

            // ---- a participant ----
            case 'mtOpen':
                if (ctx.agentId) { vscode.postMessage({ type: 'openAgent', agentId: String(ctx.agentId) }); }
                return;
            case 'mtTalk':
                if (ctx.agentId) { vscode.postMessage({ type: 'consoleAgent', agentId: String(ctx.agentId) }); }
                return;
            case 'mtCopy':
                copy([ctx.agentName, ctx.role, ctx.model].filter(Boolean).join(' — '));
                return;
        }
    }

    // ‼️ ONCE, at module scope: render() runs on every mission event and the
    // page refreshes live — a listener wired inside it would multiply.
    window.AFCtx.listen(ctxDo);

    window.addEventListener('message', ev => {
        const m = ev.data;
        if (m.type === 'data') {
            if (formOpen) { readForm(); }
            if (editing) { pendingData = { ...DATA, ...m.data }; return; }
            DATA = { ...DATA, ...m.data };
            render();
        } else if (m.type === 'focus-run' && m.id) {
            // ‼️ "OPEN THIS MISSION" HAS TO LAND ON THE MISSION. A project's
            // Work tab and a timeline row both say Open about one run; opening
            // the page at the top of a list and leaving the reader to find it
            // is the same as not having the button.
            openRuns.add(m.id);
            render();
            const el = document.querySelector('[data-run="' + m.id + '"]');
            if (el && el.scrollIntoView) { el.scrollIntoView({ block: 'center' }); }
        } else if (m.type === 'formError') {
            readForm();
            formErr = m.error;
            render();
        } else if (m.type === 'created') {
            formOpen = false;
            formErr = '';
            form.title = ''; form.goal = '';
            openNewest = true; // the fresh run's row opens itself on the next data render
            render();
        } else if (m.type === 'folder') {
            form.workdir = m.path;
            if (formOpen) { render(); }
        } else if (m.type === 'openForm') {
            formOpen = true;
            render();
        } else if (m.type === 'guided') {
            // ‼️ U-64 — the host's own sentence, shown verbatim. It is the one
            // that says WHEN the steer lands (next planner boundary, or on
            // resume) or why it was refused; a message the page composed itself
            // would be a second rule about what may be steered.
            guideNote[m.runId] = { note: m.note || '', error: m.error || '' };
            guideOpen = true;
            render();
        } else if (m.type === 'tail') {
            // direct DOM update — no re-render, so reading the tail never
            // fights the 1s live refresh or a scroll position
            if (tail.file && m.file === tail.file) {
                tail = { file: m.file, text: m.text || '', size: m.size || 0, missing: !!m.missing };
                const box = document.getElementById('tailbox');
                if (box) {
                    box.textContent = tail.missing
                        ? '(output file not readable yet)'
                        : (tail.text || '(empty so far)');
                    if (typeof box.scrollHeight === 'number') { box.scrollTop = box.scrollHeight; }
                }
            }
        }
    });

    render();
})();
