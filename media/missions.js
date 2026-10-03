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
        title: '', goal: '', leadAgentId: '', workdir: '', plannerModel: '', plannerEffort: '',
        /**
         * ‼️ X-225 — WHOSE PLAN THE ORCHESTRATOR ITSELF SPENDS.
         *
         * Its own field beside `plannerModel`/`plannerEffort`, because the
         * planner is not a delegation: it is one headless claude in the lead's
         * folder, called once a round, carrying the run from round to round. A
         * long mission whose planner and whose workers share one sign-in is
         * exactly the run that stops in the middle — and before this the planner
         * spawned with no environment at all, so it ran as whatever the VS Code
         * window happened to be holding.
         */
        plannerAccount: '',
        /**
         * ‼️ X-107 — AND WHICH ENDPOINT SERVES THE ORCHESTRATOR'S OWN CALLS,
         * with the tier of that route. Its own pair beside `plannerAccount` for
         * the same reason: the planner is one long-lived headless claude, not a
         * delegation, and the mission's route for its workers says nothing
         * about it. The tier travels WITH the route and is dropped without one
         * (X-101: `opus` is a different model on every route).
         */
        plannerProviderId: '', plannerTier: '',
        /**
         * ‼️ X-94 — WHICH PROJECT THIS RUN IS FILED UNDER, as a CHOICE.
         *
         * There was no control here at all, and the host's contract has three
         * answers, not two: the key ABSENT means "the window's active project",
         * the empty string means "deliberately none", and an id means that one.
         * With no control the form could only ever say the first, so a mission
         * started while the window sat on a project was filed under it, briefed
         * with it and had every delegation filed under it — without the person
         * starting it ever being shown the word.
         *
         * Three values, mapping exactly onto that contract:
         *   ''         → send no `project` key   (inherit the window's)
         *   '--none--' → send `project: ''`      (deliberately none)
         *   '<id>'     → send `project: '<id>'`  (that one)
         * The sentinel carries dashes a generated project id never does, and an
         * id the host cannot match is REFUSED rather than dropped, so even a
         * collision could not pass silently.
         */
        projectId: '',
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
        // ‼️ X-225 — …and `accounts`, the sixth: whose plan pays for THIS
        // member's delegations. Per member for the same reason the model and the
        // permission mode are — on a machine rotating three plans, "the reviewer
        // runs on the account that still has window left" is the decision a
        // person actually makes. It used to be refused for the whole surface on
        // the mission's behalf (see `missionDoor`).
        // ‼️ X-107 — …and `routes` + `tiers`, the seventh and eighth: which
        // endpoint serves THIS member's delegations and which tier of it. Per
        // member for the reason the account is — "the reviewer on the plan-billed
        // endpoint, the drafter on the cheap one" is the decision a person makes.
        // The core has carried both since 3.534.0 and this form offered neither.
        team: {}, roles: {}, models: {}, engines: {}, perms: {}, efforts: {}, accounts: {},
        routes: {}, tiers: {},
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
        autonomy: 'ask-when-unsure',
        /**
         * ‼️ U-102 — WHOM THE LEAD MAY DRAW ON, ANSWERED RATHER THAN INFERRED.
         *
         * Every box empty used to post `pool: []`, which the host read as the
         * whole fleet — while the very same screen could just as truthfully be
         * read as "nobody is picked". Two opposite answers, one picture. The
         * scope is now the answer: `fleet` (the default, and what the old
         * behaviour meant) or `selected`, where zero ticks is a refusal and
         * never a silent expansion to every agent on the machine.
         */
        poolScope: 'fleet',
        /**
         * …and the ticks themselves are kept APART from the classic team.
         * They looked like one control but they are two questions — a classic
         * mission's cast list and an objective's pool — and sharing one map
         * meant switching mode silently rewrote the other one's answer.
         */
        poolSel: {}
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
    /**
     * ‼️ U-103 — THE HOST'S ANSWER ABOUT THIS DRAFT, AND THE PAGE HOLDS NO
     * SECOND ONE.
     *
     * This box used to work the effective engine out itself — `the row's own,
     * else the mission's, else claude` — and that is three of the five rungs
     * the launch actually climbs (`resolveDelegateRun`): the agent's own
     * per-engine default and `agentFarm.launchDefaults` were simply not in the
     * page's world. So a fleet default of Gemini drew a Claude model catalogue
     * on a row that was going to launch on Gemini, and the effort box offered
     * words that engine has no flag for.
     *
     * `PREVIEW` is what the host resolves for the draft as it stands. `seq`
     * exists because the form is debounced and fires faster than the answers
     * come back: an older answer painted over a newer one would be the same
     * lie in a new costume, so anything but the latest is dropped.
     */
    let PREVIEW = null;
    /**
     * ‼️ X-118 — THE GENERATION BELONGS TO THE DRAFT, NOT TO THE REQUEST.
     *
     * It used to be bumped inside the debounce timer, so for the 220ms between
     * an edit and its own request the answer already in flight about the
     * PREVIOUS draft still counted as current: it was accepted, it painted the
     * new draft's model boxes and refusal list with the old resolution, and the
     * repaint it caused restarted the clock and pushed the new draft's request
     * another 220ms away. `seq` now moves the moment the draft does — it is the
     * fingerprint's generation — so an answer is only ever accepted about the
     * draft it was actually asked for.
     */
    let previewSeq = 0;
    let previewFp = '';
    let previewTimer = 0;
    /** The resolved row for one agent, or null until the first answer lands. */
    const previewOf = (agentId) =>
        ((PREVIEW && PREVIEW.workers) || []).find(w => w.agentId === agentId) || null;
    /**
     * Which engine a member row really lands on. The host's answer when there
     * is one; until then the row's OWN words — rungs 1 and 2, which are these
     * very boxes and therefore the page's to read — and `claude`, which is the
     * ladder's documented floor rather than a guess about the middle of it.
     */
    const effEngine = (agentId) => {
        // ‼️ RUNG 1 IS THIS BOX, AND IT WINS WITHOUT A ROUND TRIP. An engine
        // typed onto the row outranks every layer below it, so waiting 220ms
        // for the host to confirm what the user just picked would leave the
        // model list a fifth of a second behind the hand that changed it — and
        // the host cannot disagree, because that box IS the top of its ladder.
        if (form.engines[agentId]) { return form.engines[agentId]; }
        const p = previewOf(agentId);
        return (p && p.effective && p.effective.engine) || 'claude';
    };
    /** Where a resolved field came from, in words a reader owes nothing to. */
    const ORIGIN_WORDS = {
        member: 'this row',
        mission: 'the mission',
        agent: 'this agent\'s own default for that engine',
        fleet: 'agentFarm.launchDefaults (fleet-wide)',
        cli: 'nobody — the CLI chooses',
        // ‼️ X-121 — the orchestrator's own two rungs. Its command line is the
        // one a worker never has: the extra args are pasted onto it, and it
        // runs in a folder whose Claude settings the CLI reads by itself.
        'extra-args': 'agentFarm.taskExtraArgs',
        settings: 'the lead folder\'s own Claude settings'
    };
    /** Which displaced flags belong to which field — a conflict is reported on
     *  the control it is about, not on every control. */
    const DISPLACED_OF = {
        model: /^(--model\b|--model=|-m\b)/,
        effort: /^(--effort\b|--effort=)/
    };
    /**
     * MIRROR — the value this control HOLDS RIGHT NOW on the first line, then
     * the precedence chain and which rung won, then what the field is. The
     * control itself is ~150px and can say none of it.
     *
     * A field nothing resolved says `CLI chooses` and is not filled in with
     * something plausible; that guess is the defect this whole item removes.
     */
    const mirror = (p, field, body) => {
        if (!p) { return body; }
        const eff = (p.effective || {})[field];
        const req = (p.requested || {})[field];
        const from = (p.origin || {})[field] || 'cli';
        const head = (eff || 'CLI chooses') + (from === 'member' ? '' : ' — from ' + (ORIGIN_WORDS[from] || from));
        // ‼️ X-121 — THE ORCHESTRATOR CLIMBS A DIFFERENT LADDER, and printing
        // the worker's under it was part of the lie this item is about: there
        // is no member row, no per-agent engine default and no fleet default on
        // a planner's command line. What there is: the mission, the extra args
        // pasted onto that line, and the Claude settings of the folder it runs
        // in — which is why an empty box here is not "the default".
        const chain = (p.kind === 'planner'
            ? 'the mission → agentFarm.taskExtraArgs → the lead folder\'s own Claude settings → the CLI'
            : 'this row → the mission → this agent\'s default → fleet defaults → the CLI')
            + (from === 'cli' ? '\nNothing on that chain set it, so the CLI decides.' : '\nWon by: ' + (ORIGIN_WORDS[from] || from));
        // Where it was actually said — a path or the flag verbatim. "settings"
        // without the file sends a reader hunting through four of them.
        const src = (p.originSource || {})[field];
        // ‼️ AND THE CONFLICT, on the control it is about. An override that
        // took a flag off the command line changed what the user's own
        // agentFarm.taskExtraArgs was doing; dropping that silently is the bug
        // report nobody can reconstruct later.
        const gone = (p.displaced || []).filter(d => (DISPLACED_OF[field] || /^$/).test(d));
        return head + '\n\nRequested here: ' + (req || '— nothing —') + '\n' + chain
            + (src ? '\nSaid by: ' + src : '')
            + (gone.length ? '\n‼️ This override took off the command line: ' + gone.join(' · ') : '')
            + '\n\n' + body;
    };
    /**
     * Ask the host what this draft would launch with. Debounced, because it is
     * called from `render` — every keystroke repaints, and one resolution per
     * keystroke would be a message storm for an answer nobody has read yet.
     */
    const schedulePreview = () => {
        if (!formOpen) { return; }
        // The draft's own fingerprint, taken SYNCHRONOUSLY: this is the instant
        // the change happened, not the instant a request goes out about it.
        let fp;
        try { fp = JSON.stringify(draftInput()); } catch (e) { fp = 'draft-' + Date.now(); }
        if (fp === previewFp) {
            // ‼️ A REPAINT THAT CHANGED NOTHING MUST NOT RESTART THE CLOCK. A
            // render caused by an arriving answer or by a panel data refresh
            // would otherwise push the pending request 220ms further away every
            // single time, and a form that is being typed into never asks.
            if (previewTimer) { return; }
        } else {
            previewSeq += 1;
            previewFp = fp;
        }
        clearTimeout(previewTimer);
        const gen = previewSeq;
        previewTimer = setTimeout(() => {
            previewTimer = 0;
            vscode.postMessage({ type: 'preview', seq: gen, input: draftInput() });
        }, 220);
    };
    /**
     * ‼️ U-102 — WHO IS IN, per mode and per scope. Whole-fleet scope means
     * every agent is in whatever the ticks remember, so the ticks are not
     * consulted there — they are kept for the moment the user switches back.
     */
    const included = (agentId) => form.mode === 'adaptive'
        ? (form.poolScope === 'fleet' ? true : !!form.poolSel[agentId])
        : !!form.team[agentId];
    const includedAgents = () => (DATA.agents || []).filter(a => included(a.id));
    /**
     * ‼️ U-101 — THE BULK PROFILE IS AN ACTION, NOT A SECOND DEFAULT.
     *
     * The composer used to carry a `Delegation engine` box that read as a bulk
     * switch over the member rows and was not one: it wrote a mission-level
     * FALLBACK, left every existing row override alone, and had no model,
     * effort or permission counterpart. So a user who set it and then looked at
     * the rows saw the rows disagreeing with it, and the same preference could
     * be recorded in two places at once.
     *
     * This tool changes the ROWS. What it writes is what the payload carries and
     * what the reader can see; there is no invisible layer left behind.
     *
     * ‼️ THREE ANSWERS PER DIMENSION, and the third is why this is not a set of
     * four selects. `keep` leaves the dimension alone — so applying an ENGINE to
     * six rows cannot wipe the models on them, which is the accident a naive
     * bulk apply makes every time. `clear` removes the override and lets the row
     * inherit again. Anything else is an explicit value.
     */
    let profileOpen = false;
    const profile = { engine: 'keep', model: 'keep', effort: 'keep', permissionMode: 'keep', providerId: 'keep', tier: 'keep' };
    /** The dimensions the profile tool carries, in the order it draws them —
     *  one list, read by the DOM read and the wiring alike, so a dimension
     *  added here cannot be drawn and then never read back. */
    const PROFILE_KEYS = ['engine', 'model', 'effort', 'permissionMode', 'providerId', 'tier'];
    /**
     * Rows whose explicit model/effort no longer fits the engine they are on,
     * held for the user to decide about. ‼️ NOT dropped silently: U-97 narrowed
     * on the spot, which meant a value somebody typed disappeared while they
     * were looking at something else. It is announced once, cleared on request,
     * and the row says afterwards what went and why.
     */
    let narrowAsk = [];
    const narrowNote = {};
    /** The page-side mirror of core `resolveLead` — the first of the pool, else
     *  the first of the fleet. Same input, same lead, every time, so what the
     *  form shows before Start is what the run will record. */
    const autoLead = () => includedAgents()[0] || (DATA.agents || [])[0] || null;
    /** One member row as the host reads it — the same shape for team and pool,
     *  because the two lists differ in WHO is on them, never in what a row says. */
    const memberPayload = (list) => list.map(a => ({
        agentId: a.id, role: form.roles[a.id] || '',
        model: form.models[a.id] || '', engine: form.engines[a.id] || '',
        effort: form.efforts[a.id] || '',
        permissionMode: form.perms[a.id] || '',
        // ‼️ X-225 — and whose plan pays for it. Empty travels as empty and the
        // host stores nothing, which is what leaves the standing sign-in to
        // answer at the spawn — the behaviour of every mission before this.
        account: form.accounts[a.id] || '',
        // ‼️ X-107 — and which endpoint serves it. The tier travels only WITH
        // a route: sent alone it would be one word meaning a different model
        // on whatever route the mission or the agent's standing record names.
        providerId: form.routes[a.id] || '',
        tier: form.routes[a.id] ? (form.tiers[a.id] || '') : ''
    }));
    /**
     * ‼️ X-107 — THE ROUTES THIS ENGINE MAY BE POINTED AT, or null. From the
     * host's one matrix (`engineRouteMatrix`), the same the Tasks form reads.
     * Null for the engines with no provider axis and for one with nothing set
     * up — both complete answers, and neither draws a box (the rule the
     * sign-ins follow). A tier belongs to ONE route: `tiersOf` answers for the
     * route named, and nothing else.
     */
    const routesFor = (engine) => {
        const f = (DATA.routes || {})[engine || 'claude'];
        return (f && (f.providers || []).length) ? f : null;
    };
    const routeRowsFor = (engine) => ((routesFor(engine) || {}).providers || []);
    const routeNoun = (engine) => String((routesFor(engine) || {}).noun || 'Route');
    const tiersOf = (engine, providerId) =>
        ((routeRowsFor(engine).find(p => p.id === (providerId || '')) || {}).tiers || []);
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
        // U-130 — the ~150px box cuts every one of these, and the option's own
        // native title is the only surface the OS popup lets us reach.
        return [C.option('', emptyLabel || '— agent default —',
            { detail: 'Nothing is named here, so the model is resolved at launch.' })]
            .concat(list.map(m => C.option(m.id, m.label, {
                selected: sel === m.id,
                detail: m.label.startsWith('⚠ ')
                    ? 'This engine does not publish that model — the launch will refuse it.'
                    : (m.detail || (m.label === m.id ? '' : m.id))
            })))
            .join('');
    };
    /**
     * ‼️ U-97 — WHAT WOULD NO LONGER FIT, WORKED OUT BUT NOT YET DONE. Same rule
     * the host applies at launch (`core/models.ts` narrowLaunch): a model the
     * new engine does not publish does not fit, and an effort the resulting
     * model does not offer falls back to that model's default or to nothing.
     * Without it a row switched onto an engine with `takesEffort:false` keeps
     * its old word and the launch carries a hidden `--effort` that engine
     * refuses.
     *
     * An engine that publishes NO catalog is not allowed to call a model wrong
     * — it has no opinion to hold — so only the effort is checked there.
     *
     * ‼️ U-101 — AND THE ANSWER IS RETURNED RATHER THAN APPLIED. This used to
     * write straight into `form`, which meant a value somebody had typed
     * vanished while they were looking at a different control. The caller now
     * decides: `narrowAsk` collects the rows, the user is told once, and the
     * clearing happens on a press.
     */
    const narrowPlan = (agentId) => {
        const eng = effEngine(agentId);
        const model = form.models[agentId] || '';
        const effort = form.efforts[agentId] || '';
        /**
         * ‼️ X-225 — AND AN ACCOUNT BELONGS TO ONE ENGINE, so it is one of the
         * words a row can lose when its engine moves. A Claude slot carried onto
         * Codex names a directory Codex never reads: the host refuses it at
         * creation rather than billing somebody nobody chose, so leaving it in
         * the box would be a row that cannot start and does not say why.
         *
         * ‼️ AND THE MACHINE'S OWN SIGN-IN BELONGS TO NO ENGINE (X-223), so it
         * survives every engine change — clearing it would silently turn "run as
         * the machine itself" into "run as whatever is standing".
         */
        const account = form.accounts[agentId] || '';
        const acctKept = !account || account === '@machine'
            || ((DATA.accounts || {})[eng || 'claude'] || []).some(a => a && a.id === account);
        /**
         * ‼️ X-107 — AND A ROUTE BELONGS TO ONE ENGINE, AND A TIER TO ONE ROUTE.
         * A Kimi route carried onto Codex names an endpoint its CLI was never
         * going to be pointed at (the host refuses it at creation, X-106), and
         * a tier kept across a route change is a word that meant
         * `kimi-k2-thinking` on the route being left (X-101). Both are words
         * the row can lose when its engine moves, and both go through this
         * one plan — announced, then cleared on a press, never behind a back.
         */
        const route = form.routes[agentId] || '';
        const tier = route ? (form.tiers[agentId] || '') : '';
        const routeKept = !route || routeRowsFor(eng).some(p => p.id === route);
        const tierKept = !tier || (routeKept && tiersOf(eng, route).some(t => t.id === tier));
        const routePart = {
            providerId: routeKept ? route : '',
            tier: tierKept ? tier : '',
            lostRoute: routeKept ? '' : route,
            lostTier: tierKept ? '' : tier
        };
        const cat = (window.AFEngine.models(launchView(), eng) || []).filter(m => m.id);
        if (cat.length) {
            const fixed = window.AFEngine.narrow(launchView(), eng, model, effort);
            return {
                agentId, engine: eng,
                model: fixed.model, effort: fixed.effort,
                account: acctKept ? account : '',
                lostModel: model && fixed.model !== model ? model : '',
                lostEffort: effort && fixed.effort !== effort ? effort : '',
                lostAccount: acctKept ? '' : account,
                ...routePart
            };
        }
        const rows = window.AFEngine.efforts(launchView(), eng, model) || [];
        const keeps = rows.some(e => e.id === effort);
        return {
            agentId, engine: eng, model, effort: keeps ? effort : '',
            account: acctKept ? account : '',
            lostModel: '', lostEffort: keeps ? '' : effort,
            lostAccount: acctKept ? '' : account,
            ...routePart
        };
    };
    /** Write one plan onto the row, and leave the reason where the row is. */
    const applyNarrow = (plan) => {
        const engLabel = ((DATA.engines || []).find(e => e.id === plan.engine) || {}).label || plan.engine;
        const lost = [
            plan.lostModel ? `model ${plan.lostModel}` : '',
            plan.lostEffort ? `effort ${plan.lostEffort}` : '',
            plan.lostAccount ? `account ${plan.lostAccount}` : '',
            plan.lostRoute ? `${routeNoun(plan.engine).toLowerCase()} ${plan.lostRoute}` : '',
            plan.lostTier ? `tier ${plan.lostTier}` : ''
        ].filter(Boolean);
        form.models[plan.agentId] = plan.model;
        form.efforts[plan.agentId] = plan.effort;
        form.accounts[plan.agentId] = plan.account;
        form.routes[plan.agentId] = plan.providerId;
        form.tiers[plan.agentId] = plan.tier;
        if (lost.length) { narrowNote[plan.agentId] = `${lost.join(' and ')} cleared — ${engLabel} does not offer it`; }
    };
    /** What a narrowing plan would take off a row, in the words the strip
     *  prints — one list, so the strip and the row's note cannot name
     *  different losses (the account was missing from the strip once). */
    const lostWords = (p) => [
        p.lostModel ? `model <b>${C.esc(p.lostModel)}</b>` : '',
        p.lostEffort ? `effort <b>${C.esc(p.lostEffort)}</b>` : '',
        p.lostAccount ? `account <b>${C.esc(p.lostAccount)}</b>` : '',
        p.lostRoute ? `${C.esc(routeNoun(p.engine).toLowerCase())} <b>${C.esc(p.lostRoute)}</b>` : '',
        p.lostTier ? `tier <b>${C.esc(p.lostTier)}</b>` : ''
    ].filter(Boolean);
    /** Every row whose explicit words no longer fit its engine — collected for
     *  the user to decide about, never applied behind their back. */
    const askNarrow = () => {
        narrowAsk = (DATA.agents || [])
            .filter(a => included(a.id))
            .map(a => narrowPlan(a.id))
            .filter(p => p.lostModel || p.lostEffort || p.lostAccount || p.lostRoute || p.lostTier);
    };
    /**
     * ‼️ X-107 — THE TIER IS THE ROUTE'S OWN, so moving the route drops the
     * tier under it ON THE SPOT rather than asking (U-101 asks about a value
     * the ENGINE no longer offers; this one has no meaning at all once its
     * route is gone — `opus` on the new route is a different model, and
     * carrying the word over would be the exact defect X-101 named). The row
     * says what went and why, as every other clearing does.
     */
    const narrowTier = (agentId) => {
        const route = form.routes[agentId] || '';
        const tier = form.tiers[agentId] || '';
        if (!tier) { return; }
        if (route && tiersOf(effEngine(agentId), route).some(t => t.id === tier)) { return; }
        form.tiers[agentId] = '';
        narrowNote[agentId] = `tier ${tier} cleared — it belonged to the ${routeNoun(effEngine(agentId)).toLowerCase()} this row was on`;
    };
    /**
     * Read the bulk profile's four boxes back out of the DOM.
     *
     * ‼️ AN EMPTY READ IS NOT AN ANSWER. Every real choice in these boxes is a
     * non-empty word — `keep`, `clear`, or a value — so nothing legitimate reads
     * back as ''. Taking '' at face value would write an empty string onto the
     * rows, which is what `clear` means and already has its own option: a box
     * that is not on screen, or one a repaint has not filled yet, would silently
     * wipe a dimension the user had left alone.
     */
    const readProfile = () => {
        PROFILE_KEYS.forEach(key => {
            const el = document.getElementById('pf-' + key);
            if (el && el.value) { profile[key] = el.value; }
        });
    };
    /** The effort rows one engine+model publishes — the same answer the member
     *  rows draw their box from, asked where the profile tool can reach it. */
    const effortRowsOf = (engine, model) =>
        (window.AFEngine.efforts(launchView(), engine, model) || []);
    /**
     * ‼️ X-123 — WHOSE CATALOGUE THE PROFILE'S VALUE LISTS BELONG TO.
     *
     * `Engine: don't change` used to mean `claude` here, unconditionally. So a
     * user who deliberately left the engine alone and wanted to set only a
     * model was offered CLAUDE's models and wrote the chosen one onto every
     * included row — the Codex row, the OpenCode row, and the rows that inherit
     * a different engine from the agent or the fleet. "Don't touch the engine"
     * came out as "profile everything against Claude".
     *
     * The answer is the engine the included rows RESOLVE to (`effEngine` — the
     * host's ladder, the row's own words until it answers):
     *   · an explicit engine on the profile — that one, it is what is being set;
     *   · `don't change` and every included row lands on the same engine — that
     *     engine, which is the common case and the one that was wrong before;
     *   · `don't change` over a mixed pool, or `clear` (which hands each row
     *     back to a default only the host knows) — NO honest single answer, so
     *     the value lists close and say why. `don't change` and `clear` stay
     *     offered on every dimension: they are safe on any engine, and taking
     *     them away would be a second bug in the shape of a fix.
     */
    const profileEngines = () => [...new Set(includedAgents().map(a => effEngine(a.id)))];
    const profileEngine = () => {
        if (profile.engine !== 'keep' && profile.engine !== 'clear') { return profile.engine; }
        if (profile.engine === 'clear') { return ''; }
        const set = profileEngines();
        return set.length === 1 ? set[0] : '';
    };
    /**
     * ‼️ X-123 — ALL OF THE ROWS OR NONE OF THEM. The tool used to mutate every
     * included row and only then raise the narrow warning, so a heterogeneous
     * pool was left half-profiled and the user had to undo it row by row. What
     * this apply WOULD produce is checked first, per row, and one fault refuses
     * the whole press.
     *
     * Only what the apply itself decides is judged, and only where the engine is
     * knowable: a row that already carried an odd pair keeps its own narrow
     * warning, and an engine nobody can resolve here refuses only the values
     * this press would WRITE.
     */
    const profileFaults = () => {
        const faults = [];
        includedAgents().forEach(a => {
            const pick = (key, was) => (profile[key] === 'keep' ? was : (profile[key] === 'clear' ? '' : profile[key]));
            const engine = profile.engine === 'keep' ? effEngine(a.id)
                : (profile.engine === 'clear' ? '' : profile.engine);
            const model = pick('model', form.models[a.id] || '');
            const effort = pick('effort', form.efforts[a.id] || '');
            const writes = (key) => profile[key] !== 'keep' && profile[key] !== 'clear';
            if (!engine) {
                if (writes('model') || writes('effort')) {
                    faults.push(`${a.name} — clearing the engine hands this row back to a default this form cannot resolve, so a model or effort cannot be written onto it`);
                }
                return;
            }
            if (model && !modelKnown(engine, model)) {
                faults.push(`${a.name} — ${engine} does not offer model ${model}`);
            }
            if (effort) {
                const rows = effortRowsOf(engine, modelKnown(engine, model) ? model : '');
                if (!rows.some(e => e.id === effort)) {
                    faults.push(`${a.name} — ${model || engine} does not take effort ${effort}`);
                }
            }
            // ‼️ X-107 — a route this engine cannot be pointed at, or a tier
            // the resulting route does not serve, refuses the press the same
            // way: the host would refuse the mission by name at creation, and
            // a half-profiled pool is the thing this preflight exists to stop.
            const route = pick('providerId', form.routes[a.id] || '');
            const tier = route ? pick('tier', form.tiers[a.id] || '') : '';
            if (route && !routeRowsFor(engine).some(p => p.id === route)) {
                faults.push(`${a.name} — ${engine} has no ${routeNoun(engine).toLowerCase()} ${route}`);
            } else if (tier && !tiersOf(engine, route).some(t => t.id === tier)) {
                faults.push(`${a.name} — ${route} does not serve tier ${tier}`);
            }
        });
        return faults;
    };
    /** What the last Apply refused to do, shown inside the fold that asked. */
    let profileErr = '';

    const spec = (run) => DATA.specs.find(s => s.id === run.specId) || {
        title: run.specId, goal: '', team: [], limits: DATA.defaults, approvalMode: 'each-round', leadAgentName: '?'
    };
    const fmtTime = (ts) => (ts ? window.AFTime.full(ts) : '—');
    const usd = (n) => '$' + (n || 0).toFixed(2);
    // X-112 — a run's total over steps on different engines or routes is not
    // one kind of dollar; the host sends the parts only when it is mixed.
    const runUsd = (r) => r.costParts ? C.fmtUSDSum(r.totalCostUSD, r.costParts) : usd(r.totalCostUSD);
    // ‼️ A LIMIT OF 0 IS NO LIMIT, AND IT IS DRAWN THAT WAY. Every ceiling on
    // a mission is the user's to set and any of them may be left off; a bare
    // "0 rounds" on the row would read as a run with nothing left.
    const capN = (v, unit) => (v > 0 ? `${v}${unit ? ' ' + unit : ''}` : `∞${unit ? ' ' + unit : ''}`);
    const capUsd = (v) => (v > 0 ? usd(v) : '$∞');
    // The spec summary prints the ceiling as the user typed it, not padded to
    // cents — `$5`, not `$5.00`; only the spent-vs-budget bar pads both sides.
    const capUsdRaw = (v) => (v > 0 ? '$' + v : '$∞');
    /**
     * ‼️ X-195 — A SPEND, AND NEVER A CAP. `capUsd` answers `$∞` for zero, which
     * is the right word for "no ceiling" and exactly the wrong one for "nothing
     * was spent". And a leader turn costs cents, so a real spend rounded to
     * `$0.00` would read as free — the one thing this record exists to deny.
     */
    const spendUsd = (n) => {
        const v = Number(n) || 0;
        return v > 0 && v < 0.01 ? '<$0.01' : usd(v);
    };
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
        'waiting-input': 'your turn', 'waiting-task': '⏳ background', stalled: '⚠ stalled', idle: 'idle', ended: 'ended'
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
            window.AFTip.GAP,
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
        // ‼️ U-102 — AN AUTOMATIC LEAD IS NAMED BEFORE THE RUN, NOT AFTER IT.
        // "— pick the lead —" on an adaptive form was the one field that told
        // the user nothing: leaving it is legal there, and the agent it lands on
        // is decided by a rule (`resolveLead`) the page can run itself. So it
        // says which agent that is, and it re-says it when the pool changes.
        const auto = form.mode === 'adaptive' ? autoLead() : null;
        const agentOpts = [C.option('', form.mode === 'adaptive'
            ? (auto ? 'Automatic → ' + auto.name : 'Automatic — no agent in the fleet')
            : '— pick the lead —', {
            selected: !form.leadAgentId,
            detail: form.mode === 'adaptive'
                ? 'Left empty, resolveLead picks the lead — and it re-picks when the pool changes.'
                : 'A mechanical run needs a lead named by hand.'
        })]
            .concat(DATA.agents.map(a => C.option(a.id, a.name, {
                selected: form.leadAgentId === a.id,
                detail: a.dir || a.role || ''
            })))
            .join('');
        // The engines this machine can actually run, from the same matrix every
        // other picker reads — an engine that is not installed is offered with
        // the reason it cannot be picked rather than silently missing.
        const engines = DATA.engines || [];
        const engineOpts = (sel, blank) => [C.option('', blank,
            { selected: !sel, detail: 'No engine named here — the run uses whatever the agent resolves to.' })]
            .concat(engines.map(e => C.option(e.id,
                e.label + (e.ready ? '' : ' — not ready on this machine'), {
                selected: sel === e.id,
                disabled: !e.ready,
                detail: [
                    e.ready ? '' : (e.reason || 'Not installed or not signed in here, so it cannot be picked.'),
                    e.reportsCost ? 'States a price on every turn, so a dollar ceiling binds it.'
                        : 'Reports no price, so only the turn ceiling binds it.'
                ].filter(Boolean).join('\n\n')
            })))
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
        // S-60 — and the rows THAT member's engine can keep, where the host says
        // they differ (Antigravity cannot ask). '' = inherit = the one list.
        const permsFor = (engine) => (DATA.permissionsByEngine || {})[String(engine || '').toLowerCase()] || perms;
        const permOpts = (sel, engine) => [C.option('', '— engine default —', {
            selected: !sel,
            detail: 'Nothing is spent up front; the engine\'s own default decides what a headless delegation may do.'
        })]
            .concat(permsFor(engine).filter(p => p.id).map(p =>
                C.option(p.id, p.label, { selected: sel === p.id, detail: p.detail || '' })))
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
        /**
         * ‼️ X-225 — THE SIGN-INS THIS MACHINE HOLDS FOR THAT ENGINE.
         *
         * From the host's one matrix (`engineAccountMatrix`), the same one the
         * Tasks form and the Console read, so the rows, the health marks and the
         * standing-choice dot cannot say three different things on three pages.
         * EMPTY IS THE ORDINARY ANSWER — four of the five engines cannot isolate
         * a sign-in and a machine that has captured none has nothing to choose
         * between — and an empty list draws no box, which is the rule a control
         * with no referent falls under.
         */
        const accountRowsFor = (engine) =>
            ((DATA.accounts || {})[engine || 'claude'] || []).filter(a => a && a.id);
        /** ‼️ X-305 — the RULES this engine offers, from the twin matrix. */
        const policyRowsFor = (engine) =>
            ((DATA.policies || {})[engine || 'claude'] || []).filter(p => p && p.id);
        // ‼️ X-263 — the sentinel and the row's name from the component; they
        // were typed out in three page files.
        const MACHINE_ACCOUNT = window.AFAccount.MACHINE;
        const accountOpts = (engine, sel) => {
            const rows = accountRowsFor(engine);
            if (!rows.length) { return ''; }
            return [C.option('', '— the standing choice —', {
                selected: !sel,
                detail: 'The ACTIVE account of this engine answers when the delegation spawns — the one the'
                    + ' Engines page points at — and failing that the main sign-in. That is what every mission'
                    + ' written before this took, and it is not a decision recorded on the run.'
            }), C.option(MACHINE_ACCOUNT, window.AFAccount.MACHINE_ROW, {
                selected: sel === MACHINE_ACCOUNT,
                detail: 'The identity this machine itself is signed in as — nothing is injected. Unlike the'
                    + ' empty row above this is PINNED: it stays here whatever the Engines page is pointing at'
                    + ' when the round fires, hours after anybody looked at this window.'
            })].join('')
                // ‼️ X-263 — the ACCOUNT rows are drawn by the component, so
                // this picker cannot fall behind the Console's on the one figure
                // the choice turns on. The two rows above stay here because they
                // are this SITE's sentence, not the account's (ONE SUBJECT).
                // ‼️ X-305 — and the rules come with them, in their own group.
                + window.AFAccount.grouped(policyRowsFor(engine), rows, sel, C);
        };
        // MIRROR: the box is narrow, so its tooltip opens with what it is set to
        // right now and then says what the field is.
        const accountTitle = (engine, sel) => {
            const row = accountRowsFor(engine).find(a => a.id === sel);
            return (sel === MACHINE_ACCOUNT ? 'Machine Global'
                : (row ? row.label : 'the standing choice'))
                + '\n\nWhose plan pays for this member\u2019s delegations. A mission runs for HOURS and its'
                + ' rounds fire with nobody in front of them, so "three members on one sign-in" is how a run'
                + ' hits the plan wall in the middle of round nine. Empty is not "no account": the standing'
                + ' choice of that engine answers at the spawn, exactly as it always has. A dot marks the'
                + ' standing choice; a warning sign marks a slot that needs signing in again.';
        };
        /**
         * ‼️ X-107 — WHICH ENDPOINT THIS MEMBER'S DELEGATIONS ARE SERVED BY,
         * and which tier of it. The same two boxes the Tasks form draws
         * (`ntRouteRows`), in the same words: the label is the bare value, the
         * axis is the tooltip's first line, the meaning lives in the hover
         * (audit B-07.2). Drawn only where the engine has routes at all, and
         * the tier box only under a route that serves tiers — a box with no
         * referent is what docs/CONVENTIONS.md forbids.
         */
        const routeOpts = (engine, sel) => {
            const noun = routeNoun(engine).toLowerCase();
            return [C.option('', '— inherit —', {
                selected: !sel,
                detail: 'The mission’s own ' + noun + ' if it names one, else whichever ' + noun
                    + ' this agent happens to be set to when the delegation fires — and nobody is watching when it does.'
            })].concat(routeRowsFor(engine).map(p =>
                C.option(p.id, p.label, { selected: p.id === sel, detail: p.detail || '' }))).join('');
        };
        const tierOpts = (engine, route, sel) => [C.option('', '— the route’s own choice —', {
            selected: !sel,
            detail: 'No tier named, so the route serves whatever it serves by default.'
        })].concat(tiersOf(engine, route).map(t =>
            C.option(t.id, t.label, {
                selected: t.id === sel,
                detail: (t.detail ? 'Served by: ' + t.detail + '\n\n' : '')
                    + 'A tier is not a model: this name is served by a different model on every route, which is why it is asked here and not in the model box.'
            }))).join('');
        // MIRROR: too narrow to say what it is, so the tooltip opens with the
        // value it holds RIGHT NOW and then explains the field.
        const routeTitle = (engine, sel) => {
            const row = routeRowsFor(engine).find(p => p.id === sel);
            return (row ? row.label : 'inherit')
                + '\n\n' + routeNoun(engine) + ': the endpoint this member’s delegations really talk to, which the'
                + ' engine itself never says. A mission runs for hours with nobody in front of it, so a member that'
                + ' names none takes the mission’s ' + routeNoun(engine).toLowerCase() + ', and failing that whichever'
                + ' one this agent happens to be set to when the round fires. Changing it drops the tier under it:'
                + ' a tier is one word meaning a different model on every ' + routeNoun(engine).toLowerCase() + '.';
        };
        const tierTitle = (engine, route, sel) => {
            const row = tiersOf(engine, route).find(t => t.id === sel);
            return (sel ? sel + (row && row.detail ? ' — ' + row.detail : '') : 'the route’s own choice')
                + '\n\nWhich model ' + (route || 'the route') + ' serves for that name. A tier is not a model:'
                + ' "opus" is one model on one route and another on the next, which is why it is asked here and'
                + ' not in the model box.';
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
        // ‼️ U-100 — THE EMPTY OPTION IS NOT ONE WORD EVERYWHERE. On a member row
        // an empty effort really IS resolved — agent default, then fleet, then
        // the CLI. On the PLANNER nothing resolves it: no `--effort` reaches that
        // command line, so the box has to say the CLI chooses rather than borrow
        // a promise that belongs to a different ladder.
        const effortOpts = (sel, rows, emptyLabel) => [C.option('', emptyLabel || '— resolved —', {
            selected: !sel,
            detail: 'Left empty, effort is resolved the way a launch resolves it: this agent\'s own default for the engine it lands on, then agentFarm.launchDefaults, then the CLI.'
        })]
            .concat((rows || efforts).filter(e => e.id).map(e =>
                C.option(e.id, e.label, { selected: sel === e.id, detail: e.detail || '' })))
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
        /**
         * ‼️ U-101 — EVERY CELL SAYS WHETHER IT IS AN OVERRIDE OR AN INHERIT.
         *
         * With the mission-wide engine box gone, the rows ARE the answer — so a
         * reader has to be able to tell, without opening four tooltips, which of
         * these values somebody chose here and which are falling through. A word
         * would not fit in a 150px select; a left edge does, and the AFTip
         * already carries the sentence.
         */
        const ovr = (v) => (v ? ' ovr' : '');
        const teamRows = DATA.agents.map((a, i) => {
            // ‼️ U-103 — the row's boxes are drawn against the engine the HOST
            // resolved for it, not one the page worked out. The model catalogue
            // comes from that engine and the effort list from that engine and
            // the model on it, so a row can no longer offer four Claude aliases
            // to a delegation the fleet default is sending to Gemini.
            const pv = previewOf(a.id);
            const eng = effEngine(a.id);
            const eRows = effortRowsFor(eng, (pv && pv.effective && pv.effective.model) || form.models[a.id] || '');
            const noEffort = !eRows.length;
            const engLabel = (engines.find(e => e.id === eng) || {}).label || eng;
            // ‼️ U-97 — THE ROW READS IN THE ORDER IT RESOLVES:
            // Agent/role → Engine → Model → Effort → Permissions. Model depends
            // on the engine and effort depends on the model, so a control never
            // stands to the LEFT of the thing that decides what it may offer.
            // ‼️ U-102 — in whole-fleet scope the tick is not a question: every
            // agent is in, so the box says so and is not offering a choice that
            // would be ignored. Its overrides stay live — a whole-fleet pool is
            // still a pool whose rows you may profile.
            const inRow = included(a.id);
            const fleetScope = form.mode === 'adaptive' && form.poolScope === 'fleet';
            const isLead = form.mode === 'adaptive' && form.leadAgentId === a.id;
            return `
            <div class="tmrow">
                <label title="${C.esc(fleetScope
                    ? 'In, because the pool is the WHOLE FLEET. Switch the pool to "Selected agents" to choose.'
                    : (form.mode === 'adaptive'
                        ? 'Tick to put this agent in the pool the lead may draw on.'
                        : 'Tick to put this agent on the team.'))}"><input type="checkbox" id="tm-${i}" data-team="${C.esc(a.id)}"${inRow ? ' checked' : ''}${fleetScope ? ' disabled' : ''}> ${C.esc(a.name)}${isLead
                        ? ` <span class="muted small" title="This agent also LEADS. The planner runs it as an orchestrator with the profile in the Orchestrator block; the settings on this row are for its WORKER delegations only.">· lead</span>`
                        : ''}</label>
                <input type="text" id="rl-${i}" data-role="${C.esc(a.id)}" placeholder="role (optional — e.g. coder, reviewer)"
                    value="${C.esc(form.roles[a.id] || '')}" ${inRow ? '' : 'disabled'}>
                <select id="en-${i}" class="mdl${ovr(form.engines[a.id])}" data-engine="${C.esc(a.id)}"
                    title="${C.esc(mirror(pv, 'engine',
                        'Engine: which CLI this member\'s delegations run on. Empty is not "claude" — it falls'
                        + ' through this agent\'s own default for the engine it lands on and then the fleet\'s.'
                        + ' Changing it re-reads that engine\'s models and efforts into the two boxes on this row.'))}"
                    ${inRow ? '' : 'disabled'}>${engineOpts(form.engines[a.id] || '', '— inherit —')}</select>
                <select id="md-${i}" class="mdl${ovr(form.models[a.id])}" data-model="${C.esc(a.id)}"
                    title="${C.esc(mirror(pv, 'model',
                        (modelKnown(eng, form.models[a.id] || '') ? ''
                            : '⚠ ' + engLabel + ' does not publish this model. It was kept because it was already'
                              + ' set; picking anything else here loses it, and the launch may be refused.\n\n')
                        + 'Model for this member\'s delegations. The list is ' + engLabel + '\'s own catalog as this'
                        + ' window last read it; change the engine beside it and a model that catalog does not carry'
                        + ' is dropped rather than launched.'))}"
                    ${inRow ? '' : 'disabled'}>${modelOptsFor(eng, form.models[a.id] || '')}</select>
                <select id="ef-${i}" class="mdl${ovr(form.efforts[a.id])}" data-effort="${C.esc(a.id)}"
                    title="${C.esc(noEffort
                        ? engLabel + ' has no effort setting — this member runs at whatever that CLI thinks is normal, and a launch given an effort here would be refused.'
                        : mirror(pv, 'effort', effortTitle(form.efforts[a.id] || '', eRows)))}"
                    ${inRow && !noEffort ? '' : 'disabled'}>${noEffort
                        // SHORTHAND: the box is narrow and the engine's name does
                        // not fit in it. The short form goes on the control, the
                        // long one is already in the tooltip above.
                        ? C.option('', '— no effort —', { selected: true, detail: engLabel + ' has no effort setting, so this member runs at whatever that CLI thinks is normal.' })
                        : effortOpts(form.efforts[a.id] || '', eRows)}</select>
                <select id="pm-${i}" class="mdl${ovr(form.perms[a.id])}" data-perm="${C.esc(a.id)}"
                    title="${C.esc(mirror(pv, 'permissionMode', permTitle(form.perms[a.id] || '')))}"
                    ${inRow ? '' : 'disabled'}>${permOpts(form.perms[a.id] || '', form.engines[a.id] || '')}</select>
                ${/* ‼️ X-225 — and whose plan pays for it. Drawn only where this
                     machine holds a sign-in for that engine: a box with no
                     referent is what docs/CONVENTIONS.md forbids, and four of
                     the five engines cannot isolate one at all. */''}
                ${accountRowsFor(eng).length ? `<select id="ac-${i}" class="mdl${ovr(form.accounts[a.id])}" data-account="${C.esc(a.id)}"
                    title="${C.esc(mirror(pv, 'account', accountTitle(eng, form.accounts[a.id] || '')))}"
                    ${inRow ? '' : 'disabled'}>${accountOpts(eng, form.accounts[a.id] || '')}</select>`
                    // ‼️ B-02.2 — …BUT THE COLUMN KEEPS ITS PLACE. Measured: on a
                    // row whose engine has no sign-ins, dropping the sixth child
                    // let the other five grow, so that row's Engine box sat under
                    // the row above's Model and its Permissions under that row's
                    // Account — three rows of the same five axes and not one of
                    // them in the same column. The box is still not drawn (X-225
                    // stands: nothing here offers a choice that has no referent);
                    // what stands in its place says WHY the axis is missing,
                    // which is more than the hole was saying.
                    : `<span class="tmnone" data-axis="account" title="${C.esc(engLabel + ' keeps no separate sign-ins on this machine, so there is nothing to choose on this axis — every delegation of this member runs on whatever account that CLI is already signed in as.')}">—</span>`}
                ${/* ‼️ X-107 — and which endpoint serves it, with the tier of
                     that route. Two more axes on the same rule as the sign-in:
                     the box where the engine has routes, the placeholder where
                     it has none, so every row keeps every column (B-02.2). The
                     tier stands in its slot as a placeholder until a route that
                     serves tiers is named above it. */''}
                ${routesFor(eng) ? `<select id="pr-${i}" class="mdl${ovr(form.routes[a.id])}" data-route="${C.esc(a.id)}"
                    title="${C.esc(mirror(pv, 'providerId', routeTitle(eng, form.routes[a.id] || '')))}"
                    ${inRow ? '' : 'disabled'}>${routeOpts(eng, form.routes[a.id] || '')}</select>`
                    : `<span class="tmnone" data-axis="route" title="${C.esc(engLabel + ' has no separate routes on this machine — nothing to choose on this axis. Every delegation of this member talks to whatever endpoint that CLI is already pointed at.')}">—</span>`}
                ${routesFor(eng) && tiersOf(eng, form.routes[a.id] || '').length ? `<select id="tr-${i}" class="mdl${ovr(form.tiers[a.id])}" data-tier="${C.esc(a.id)}"
                    title="${C.esc(mirror(pv, 'tier', tierTitle(eng, form.routes[a.id] || '', form.tiers[a.id] || '')))}"
                    ${inRow ? '' : 'disabled'}>${tierOpts(eng, form.routes[a.id] || '', form.tiers[a.id] || '')}</select>`
                    : `<span class="tmnone" data-axis="tier" title="${C.esc(routesFor(eng)
                        ? (form.routes[a.id]
                            ? (routeRowsFor(eng).find(p => p.id === form.routes[a.id]) || {}).label + ' serves no named tiers — the route’s own choice answers.'
                            : 'A tier belongs to one ' + routeNoun(eng).toLowerCase() + '. Name one beside this and its tiers are offered here.')
                        : engLabel + ' has no routes, so it has no tiers either.')}">—</span>`}
                ${narrowNote[a.id] ? `<span class="narrownote" title="This row's own words were cleared because the engine it is on does not offer them — said here rather than left as a value that quietly vanished.">${C.esc(narrowNote[a.id])}</span>` : ''}
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
                    ${C.option('ask-when-unsure', 'ask when unsure — the lead stops and asks you rather than guessing', { selected: form.autonomy !== 'decide-alone', detail: 'Only about JUDGEMENT calls. A run waiting on you spends no budget — and makes no progress — until you answer.' })}
                    ${C.option('decide-alone', 'decide alone — the lead never asks; it decides and records why', { selected: form.autonomy === 'decide-alone', detail: 'Only about JUDGEMENT calls. The hard limits and the approval gate below still apply, so this does not make the run unattended.' })}
                </select></label>
                <span class="muted small">Only about JUDGEMENT calls. The hard limits and the approval gate below still apply either way.</span></div>`;
        // Everything the adaptive user is not being asked to decide. Classic
        // draws this block plainly, exactly as it always has.
        /**
         * ‼️ U-100 — THE ORCHESTRATOR IS ONE SUBJECT, SO IT IS ONE BLOCK.
         *
         * `Lead agent` sat at the top of the form and `Planner model` eight rows
         * below it, with the team, the workdir, six ceilings and the delegation
         * engine in between — two halves of one answer, separated by everything
         * that is not it. A reader picking a lead had no way to see that the
         * model beneath the fold was the model THAT agent would plan on.
         *
         * ‼️ AND THE ENGINE IS SHOWN AS FIXED RATHER THAN OFFERED. The planner
         * is `claude -p --output-format json` and the mission's control flow
         * parses that envelope — the decision JSON, the cost, the session id
         * that carries the lead from round to round. A picker here would be a
         * control that cannot do what it appears to do, which is worse than no
         * control: it is a promise the run breaks silently.
         */
        const plannerPv = (PREVIEW && PREVIEW.planner) || null;
        // MIRROR on an empty box: it does not say "default", it says what the
        // run would REALLY use and who decided — and `CLI chooses` when nobody
        // did, which is the honest end of the chain rather than a guess.
        const plannerValue = (field, empty) => {
            const eff = plannerPv && plannerPv.effective && plannerPv.effective[field];
            if (eff) { return eff; }
            return empty;
        };
        const plannerMirror = (field, body) => plannerPv
            ? mirror(plannerPv, field, body)
            : body;
        const orchestratorBlock = `
            <div class="frow orcrow"><span class="flabel">Orchestrator
                <span class="muted small">— who plans, and what it plans with</span></span></div>
            <div class="frow orcbody">
                <label>Lead agent${adaptive ? '' : ' <span class="req">required</span>'}
                    <select id="f-lead" title="${C.esc(
                        (plannerPv ? plannerPv.agentName + '\n\n' : '')
                        + 'The agent whose CLAUDE.md, folder and instructions the PLANNER runs as. It is an'
                        + ' identity, not a session: at every decision boundary the mission opens a separate'
                        + ' headless Claude Code call in that agent\'s folder, and every later round resumes'
                        + ' the SAME planner session so the lead keeps its own context.'
                        + '\n\nIt does not do the delegated work. Each delegation is a normal Task session of'
                        + ' its own, with its own agent, engine and transcript.')}">${agentOpts}</select></label>
                <label class="fixedfield" title="${C.esc(
                    'Claude Code — fixed, not a choice.\n\nThe mission\'s control flow parses this CLI\'s JSON'
                    + ' envelope: the decision object, the cost of the call and the session id that carries the'
                    + ' lead from round to round. No other engine emits it, so a picker here would be a control'
                    + ' that cannot do what it looks like it does.\n\nA DELEGATION is a separate axis and can'
                    + ' be on any engine — each member row says which.')}">Planner engine
                    <span class="fixedval">Claude Code <span class="muted small">· fixed</span></span></label>
                <label>Model override
                    <select id="f-planner" title="${C.esc(plannerMirror('model',
                        'Model for the LEAD\'s planning calls only; a delegate keeps its own. The planner always'
                        + ' runs on Claude Code, so this list is Claude\'s catalog.'
                        + '\n\nLeft empty this is not "the default" — it is whatever that agent\'s own Claude'
                        + ' settings resolve to, and if nothing does, the CLI\'s own choice.'))}"
                        >${modelOptsFor('claude', form.plannerModel, '— ' + plannerValue('model', 'CLI chooses') + ' —')}</select></label>
                <label>Effort override
                    <select id="f-planner-effort" title="${C.esc(plannerMirror('effort',
                        'How hard the orchestrator thinks per planning turn. Mission-wide and planner-only: a'
                        + ' delegate\'s effort is its own row\'s.'
                        + '\n\nLeft empty, no --effort reaches that command line at all and the CLI decides —'
                        + ' which is what every mission written before this does.'))}"
                        >${effortOpts(form.plannerEffort, effortRowsFor('claude', form.plannerModel || ''),
                            '— ' + plannerValue('effort', 'CLI chooses') + ' —')}</select></label>
                ${/* ‼️ X-225 — AND WHOSE PLAN THE ORCHESTRATOR SPENDS. Beside the
                     model and the effort because it is the same kind of answer
                     about the same call, and it is the one that decides whether
                     a long mission reaches its last round at all: the planner is
                     called once per ROUND for the life of the run. Claude Code,
                     always — see the fixed Planner engine field above. */''}
                ${accountRowsFor('claude').length ? `<label>Account override
                    <select id="f-planner-account" title="${C.esc(
                        'Whose plan the LEAD\u2019s planning calls are billed to; a delegate keeps its own row\u2019s.'
                        + ' The planner is always Claude Code, so these are Claude sign-ins.'
                        + '\n\nIt is called once per ROUND for the life of the mission and it is what carries the'
                        + ' lead\u2019s context from one round to the next, so a mission that runs for hours on the'
                        + ' same plan as its workers is the one that stops in the middle.'
                        + '\n\nLeft empty the standing choice of this engine answers when each round fires — which'
                        + ' is what every mission written before this did.')}"
                        >${accountOpts('claude', form.plannerAccount)}</select></label>` : ''}
                ${/* ‼️ X-107 — AND WHICH ENDPOINT SERVES THE ORCHESTRATOR'S OWN
                     CALLS, with the tier of that route. Beside the sign-in
                     because it is the same kind of answer about the same call:
                     the planner is one long-lived headless claude, and the
                     workers' route says nothing about it — before this its
                     command line ran on whatever route the lead's standing
                     record held. Drawn only where Claude has routes set up. */''}
                ${routesFor('claude') ? `<label>${C.esc(routeNoun('claude'))} override
                    <select id="f-planner-route" title="${C.esc(plannerMirror('providerId',
                        routeNoun('claude') + ' for the LEAD’s planning calls only; a delegate keeps its own row’s.'
                        + ' The planner is always Claude Code, so these are Claude routes.'
                        + '\n\nLeft empty, no route is injected and the lead’s own standing record answers'
                        + ' when each round fires — which is what every mission written before this did.'
                        + ' Changing it drops the tier under it: a tier is one word meaning a different model on every route.'))}"
                        >${routeOpts('claude', form.plannerProviderId)}</select></label>
                ${form.plannerProviderId && tiersOf('claude', form.plannerProviderId).length ? `<label>Tier override
                    <select id="f-planner-tier" title="${C.esc(plannerMirror('tier',
                        tierTitle('claude', form.plannerProviderId, form.plannerTier)))}"
                        >${tierOpts('claude', form.plannerProviderId, form.plannerTier)}</select></label>` : ''}` : ''}
            </div>
            <div class="frow"><span class="muted small">${!adaptive
                ? 'Its CLAUDE.md is the orchestration identity — a planning-minded agent leads best.'
                : (!form.leadAgentId
                    ? 'Optional here — left alone it is the first of the pool, named in the box above, and that is what the run records. Its CLAUDE.md is the orchestration identity.'
                    : (included(form.leadAgentId)
                        ? 'Also in the pool — so it plans AND may be delegated to. This block runs its planning calls; the settings on its pool row are for its worker delegations only.'
                        : '<b>Planner only</b> — it is not in the pool, so it decides and delegates but does no delegated work itself. That is a valid objective; tick it below to let it work too.'))}</span></div>
            <div class="frow"><span class="muted small" title="${C.esc(
                'The planner is a DECISION call, not a work session, and it is fenced mechanically rather than'
                + ' by asking:\n\nCUT OFF BY NAME — Bash, PowerShell, Edit, MultiEdit, Write, NotebookEdit, Task,'
                + ' Agent. It cannot write a file, run a command or spawn a sub-agent even if it decides to.'
                + '\n\nWHAT IT KEEPS — the read tools: Read, Grep, Glob, WebSearch/WebFetch and the MCP servers'
                + ' that agent has. It looks, and then it delegates.'
                + '\n\nHARD CAP — 15 turns per call and a 10-minute timeout, so a lead that wanders into doing'
                + ' the work itself is stopped rather than billed.'
                + '\n\nThat is why there is no permission picker here: a permission mode would be a second,'
                + ' softer answer to a question already settled in the command line.')}"
                >‼️ No permission picker: the planner\'s write and spawn tools are cut off by name
                (<code>--disallowedTools</code>), and it is capped at 15 turns per decision — hover for the whole fence.</span></div>`;
        /**
         * ‼️ U-101 — THE BULK PROFILE, AND WHY IT IS A FOLD RATHER THAN A ROW.
         *
         * Four more permanent selects above a table of rows carrying the same
         * four is how the old `Delegation engine` box came to read as a bulk
         * switch: a control that lives beside the rows looks like it governs
         * them. This one is a BUTTON that opens a tool, is applied, and folds
         * away — the rows keep the answer, and there is nothing left on screen
         * pretending to hold a value.
         */
        const profDim = (key, label, opts, hint) => `
            <label title="${C.esc(hint)}">${label}
                <select id="pf-${key}">
                    ${C.option('keep', "don't change", { selected: profile[key] === 'keep', detail: `Every row keeps what it holds now — Apply does not touch ${label.toLowerCase()}.` })}
                    ${C.option('clear', 'inherit — clear the override', { selected: profile[key] === 'clear', detail: `Drops the override on every row, so ${label.toLowerCase()} is resolved at launch instead of being written here.` })}
                    ${opts}
                </select></label>`;
        const profOpts = (key, rows) => rows.filter(r => r.id).map(r =>
            C.option(r.id, r.label || r.id, {
                selected: profile[key] === r.id,
                detail: r.detail || (r.label && r.label !== r.id ? r.id : '')
            })).join('');
        // The profile's own model/effort lists follow the engine the profile is
        // SETTING, not any one row's — otherwise the tool would offer a value it
        // is about to make invalid on every row it touches.
        // ‼️ X-123 — the engine these value lists BELONG to, or '' when the pool
        // gives no single honest answer. `claude` used to be written in here.
        const profEngine = profileEngine();
        const profMixed = profileEngines();
        const profWhy = profEngine ? '' : (profile.engine === 'clear'
            ? 'Clearing the engine hands every row back to its own default, which only the launch can resolve — so there is no catalogue to pick a model or an effort from. Set an explicit engine here, or clear those two as well.'
            : `These rows are not on one engine (${profMixed.join(', ') || 'none included'}), so no model or effort is right for all of them. Pick an engine above to profile them together, or set those two on the rows themselves.`);
        const profileTool = `
            <button type="button" class="secondary small profbtn" id="f-profile"
                title="${C.esc('Apply one profile to every INCLUDED row at once — engine, model, effort and permissions together.'
                    + '\n\nIt changes the rows in front of you. It does not record a second, invisible preference'
                    + ' underneath them, which is what the old mission-wide Delegation engine box did.'
                    + '\n\nEach dimension has three answers: leave it alone, clear the override so the row inherits'
                    + ' again, or set a value. That is why applying an ENGINE cannot wipe the models beside it.')}"
                >${profileOpen ? '▾' : '▸'} Apply profile to included workers</button>
            ${profileOpen ? `<div class="profbody">
                ${profDim('engine', 'Engine', profOpts('engine', DATA.engines || []),
                    'Which CLI these delegations run on. Cleared, the row falls through to that agent\'s own default and then your fleet default.')}
                ${profDim('model', 'Model', profEngine ? profOpts('model', modelListOf(profEngine)) : '',
                    profEngine
                        ? 'The model for these delegations — from ' + C.esc(profEngine) + '\'s catalog, because that is the engine every included row lands on.'
                        : profWhy)}
                ${profDim('effort', 'Effort', profEngine
                    ? profOpts('effort', effortRowsFor(profEngine, profile.model !== 'keep' && profile.model !== 'clear' ? profile.model : ''))
                    : '',
                    profEngine
                        ? 'How hard these members think per turn. An engine with no effort flag offers nothing here.'
                        : profWhy)}
                ${profDim('permissionMode', 'Permissions',
                    profOpts('permissionMode', profEngine
                        ? ((DATA.permissionsByEngine || {})[String(profEngine).toLowerCase()] || DATA.permissions || [])
                        : (DATA.permissions || [])),
                    'What these members may do unattended. A delegation is headless — there is nobody to ask. '
                    + 'The rows follow the engine the profile is setting: Antigravity cannot ask, so its "ask me" rows are not offered there.')}
                ${/* ‼️ X-107 — the route and its tier, drawn only where the
                     profile's engine has routes at all: three of the five
                     engines have no provider axis, and a box with no referent
                     is what docs/CONVENTIONS.md forbids. The tier list is the
                     PROFILE's route's own — with the route left on "don't
                     change" the rows may be on different routes, so no tier
                     is right for all of them and only keep/clear are offered. */''}
                ${profEngine && routesFor(profEngine) ? profDim('providerId', routeNoun(profEngine),
                    profOpts('providerId', routeRowsFor(profEngine).map(p => ({ id: p.id, label: p.label, detail: p.detail || '' }))),
                    routeNoun(profEngine) + ' for these delegations — the endpoint they really talk to, which the engine itself never says. '
                    + 'Cleared, each row falls through to the mission\'s route and then to that agent\'s standing record at the spawn.')
                    + profDim('tier', 'Tier',
                        profile.providerId !== 'keep' && profile.providerId !== 'clear'
                            ? profOpts('tier', tiersOf(profEngine, profile.providerId).map(t => ({ id: t.id, label: t.label, detail: t.detail ? 'Served by: ' + t.detail : '' })))
                            : '',
                        profile.providerId !== 'keep' && profile.providerId !== 'clear'
                            ? 'Which model ' + profile.providerId + ' serves for that name. A tier is not a model: the same word is a different model on every route, which is why it is asked under the route and not in the model box.'
                            : 'A tier belongs to ONE route. Set a ' + routeNoun(profEngine).toLowerCase() + ' above to offer its tiers here; with the route left alone the rows may be on different routes, so only keep or clear is honest.')
                    : ''}
                ${profWhy ? `<div class="profnote">⚠ ${C.esc(profWhy)}</div>` : ''}
                ${profileErr ? `<div class="fperr"><b>Nothing was applied.</b><ul class="fplist">${
                    profileErr.split('\n').map(l => `<li>${C.esc(l)}</li>`).join('')}</ul></div>` : ''}
                <button type="button" class="small" id="f-profile-apply"
                    title="Writes the chosen dimensions onto every included row. Dimensions left on &quot;don't change&quot; are not touched, and a value that would not fit one of the rows refuses the whole press rather than half-profiling the pool.">Apply to ${includedAgents().length} included</button>
            </div>` : ''}`;
        /**
         * ‼️ U-101 — A VALUE IS NOT TAKEN AWAY WITHOUT SAYING SO. Changing an
         * engine used to narrow the row on the spot: a model somebody had typed
         * disappeared while they were looking at a different control, and the
         * row afterwards gave no hint that it ever held one. The rows are named,
         * the reason is named, and the clearing waits for a press.
         */
        const narrowStrip = narrowAsk.length ? `<div class="narrowask"
            title="These rows carry an explicit model, effort, sign-in, route or tier the engine they are now on does not offer. Left as they are, the launch refuses them by name — the draft's own refusal list above Start says so too.">
            <b>⚠ ${narrowAsk.length} row${narrowAsk.length > 1 ? 's' : ''} no longer fit${narrowAsk.length > 1 ? '' : 's'} their engine:</b>
            <ul class="fplist">${narrowAsk.map(p => {
                const who = ((DATA.agents || []).find(a => a.id === p.agentId) || {}).name || p.agentId;
                return `<li>${C.esc(who)} — ${lostWords(p).join(' and ')} on ${C.esc(p.engine)}</li>`;
            }).join('')}</ul>
            <button type="button" class="small" id="f-narrow-clear">Clear them</button>
            <button type="button" class="secondary small" id="f-narrow-keep">Keep as they are</button>
        </div>` : '';
        /**
         * ‼️ X-94 — THE PROJECT, AS A CONTROL RATHER THAN AS SOMETHING THAT
         * HAPPENED TO YOU.
         *
         * A mission started from this page inherited whatever project the
         * window was sitting on. That is not a small filing detail: the run,
         * every delegation it makes and the planner's own session are filed
         * under it, and the LEAD is briefed with that project. A person who
         * never chose it reads the transcript and asks what their objective has
         * to do with that project — which is exactly how this item was opened.
         *
         * MIRROR: the box is narrow, so its first tooltip line is what the run
         * would REALLY be filed under and who decided that (`window` = nobody
         * did), then the description. The muted line beside it carries the same
         * fact where it costs no hover, because it is the one people are
         * surprised by.
         */
        const projects = DATA.projects || [];
        const winProject = DATA.activeProject || null;
        const projInherit = winProject
            ? `— this window's project: ${winProject.name} —`
            : '— none: this window is not on a project —';
        /**
         * ‼️ WHAT THIS DRAFT WOULD BE FILED UNDER — answered from the FORM, and
         * only then confirmed by the host.
         *
         * The first version of this line read the preview alone, so before the
         * first resolution came back (and on any repaint that had none) the box
         * said "this window's project: X" while the sentence under it said
         * "filed under no project". A control that contradicts its own caption
         * is worse than one with no caption: the page knows all three answers
         * from `form.projectId`, `DATA.projects` and `DATA.activeProject`, so it
         * states them, and the host's reply — which ran the REAL resolver, and
         * is the thing that can refuse an id — overrides when it exists.
         */
        const projPv = (PREVIEW && PREVIEW.project) || null;
        const projPicked = form.projectId === '--none--'
            ? null
            : (form.projectId
                ? (projects.filter(p => p.id === form.projectId)[0] || null)
                : winProject);
        const projName = projPv ? projPv.name : (projPicked ? projPicked.name : '');
        const projOrigin = projPv
            ? projPv.origin
            : (projPicked && !form.projectId ? 'window' : 'requested');
        const projNow = projName
            ? `${projName}${projOrigin === 'window' ? ' — inherited from this window, nobody chose it' : ' — chosen on this draft'}`
            : 'No project — this run is filed nowhere';
        const projectRow = `
            <div class="frow"><label>Project
                <select id="f-project" title="${C.esc(projNow + '\n\n'
                    + 'Which project this run is FILED UNDER. It is not a label: the run, the planner\'s own'
                    + ' session and every delegation it makes land on that project\'s Work tab, and the lead is'
                    + ' told what the project is and where its documents live.'
                    + '\n\n‼️ It is NOT told what is open on that project. A mission arrives with its own'
                    + ' objective, so the project\'s plan, backlog, worklog and decisions are left out of the'
                    + ' brief deliberately — they are a different subject and they were being paid for on'
                    + ' every planning call and every delegation.'
                    + '\n\nLeft on the first option this follows the window, which is what every mission'
                    + ' started before this control existed did.')}">
                    ${C.option('', projInherit, { selected: form.projectId === '', detail: 'Follows this window — which is what every mission started before this control existed did.' })}
                    ${C.option('--none--', 'None — deliberately file this run nowhere', { selected: form.projectId === '--none--', detail: 'The run, the planner\'s own session and every delegation it makes land on no project Work tab, and the lead is told about no project at all.' })}
                    ${projects.map(p => C.option(p.id, p.name, { selected: form.projectId === p.id, detail: p.summary || p.folder || '' })).join('')}
                </select></label>
                <span class="muted small">${projName
                    ? (projOrigin === 'window'
                        ? `Filed under <b>${C.esc(projName)}</b> — inherited from this window, not chosen here. The lead is told what that project is and where its documents are; it is <b>not</b> given its backlog, plan or worklog.`
                        : `Filed under <b>${C.esc(projName)}</b>. The lead is told what it is and where its documents are — not what is open on it.`)
                    : 'Filed under no project. Its delegations appear on no project\'s Work tab.'}</span></div>`;
        const commonBlock = `
            ${orchestratorBlock}
            <div class="frow"><span class="flabel">${adaptive
                ? `Pool <span class="muted small">— whom the lead may draw on</span>
                    <span class="scopeseg" title="${C.esc('Whole fleet: every agent this window knows, written into the run as a fact when it starts.\n\nSelected agents: exactly the ones ticked. Ticking nobody is refused — it is not a quiet way of saying everybody.')}">
                        <button type="button" class="segbtn${form.poolScope !== 'selected' ? ' on' : ''}" id="f-scope-fleet">Whole fleet</button
                        ><button type="button" class="segbtn${form.poolScope === 'selected' ? ' on' : ''}" id="f-scope-sel">Selected agents</button>
                    </span>
                    <span class="muted small">${form.poolScope === 'selected'
                        ? `${includedAgents().length} of ${DATA.agents.length} ticked`
                        : `all ${DATA.agents.length} in`}</span>`
                : 'Team <span class="req">at least one</span>'}${profileTool}</span>${narrowStrip}${teamRows}</div>
            <div class="frow"><label>Workdir <input type="text" id="f-workdir" placeholder="(optional) target repo/folder — delegations run inside it" value="${C.esc(form.workdir)}"></label>
                <button class="secondary small" id="f-browse">Browse…</button>
                <span class="muted small">With a workdir set, two writers never run in parallel.</span></div>
            ${projectRow}
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
            <div class="frow"><span class="muted small" title="A delegation is a launch, so it resolves the same way one does. Per field, highest first: what the member's row says · that agent's own default for the engine it lands on (Settings › per-agent, per-engine) · agentFarm.launchDefaults · the CLI's own choice. Claude's model and effort skip the per-agent layer on purpose: Claude Code reads that agent's .claude/settings.local.json itself, so passing it back would be a second source of truth over a file you may have edited by hand. Each step's Agent cell says what it ended up with and who decided it.">Who runs on what: planner = the Orchestrator block above · each delegation = the member's own row, then that agent's own default for the engine it lands on, then your fleet defaults, then the CLI.</span></div>
            <div class="frow"><label>Approval
                <select id="f-approval">
                    ${C.option('each-round', 'each round — approve every delegation round (recommended)', { selected: form.approvalMode !== 'auto', detail: 'The run stops before every delegation round and waits for you. Nothing is spent while it waits.' })}
                    ${C.option('auto', 'auto — run without gates (hard limits still apply)', { selected: form.approvalMode === 'auto', detail: 'No round waits for you. The round ceiling and the dollar ceiling are the only fences left, so set them before you pick this.' })}
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
            ${draftProblems()}
            <div class="frow">
                <button id="f-start">${adaptive ? 'Start objective' : 'Start mission'}</button>
                <button class="secondary" id="f-cancel">Cancel</button>
            </div>
        </div>`;
    }

    /**
     * ‼️ U-103 — EVERY REFUSAL THIS DRAFT WOULD MEET, TOGETHER, BEFORE START.
     *
     * An engine this machine cannot run and an effort the engine has no flag
     * for used to surface one at a time, on press, after the mission had
     * already been rejected once — so a form with three faults cost three
     * presses and three readings of a sentence about the first of them.
     *
     * ‼️ A DRAFT NOBODY HAS FINISHED IS NOT AN ERROR. An empty goal, no team
     * yet, an untouched form: those are refusals the host will state, and
     * shouting them at somebody who has typed two characters would train the
     * reader to ignore the box. Only the resolved faults — the ones a person
     * cannot see by looking at their own form — are shown here; everything
     * else waits for the press it belongs to.
     */
    function draftProblems() {
        // A draft that did not even resolve carries the host's validation
        // sentence instead of row faults — that is the half this box does not
        // own, and it is stated on the press it belongs to.
        if (!PREVIEW || PREVIEW.error) { return ''; }
        const list = PREVIEW.problems || [];
        if (!list.length) { return ''; }
        return `<div class="ferr" title="Resolved from the draft as it stands: this is what the launch would refuse, not a guess. Every fault at once, so they are fixed in one pass.">`
            + `<b>⚠ This draft would be refused:</b><ul class="fplist">`
            + list.map(p => `<li>${C.esc(p)}</li>`).join('')
            + `</ul></div>`;
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
        // ‼️ X-94 — guarded like every other read: on an adaptive draft the row
        // lives inside the Advanced fold, and an unguarded read would wipe a
        // chosen project the moment the fold closed.
        form.projectId = val('f-project', form.projectId);
        form.plannerModel = val('f-planner', form.plannerModel);
        form.plannerEffort = val('f-planner-effort', form.plannerEffort);
        // ‼️ X-225 — guarded like every other read: the box is not drawn on a
        // machine with no Claude sign-in captured, and an unguarded read would
        // wipe a choice the moment a slot was forgotten.
        form.plannerAccount = val('f-planner-account', form.plannerAccount);
        // ‼️ X-107 — the planner's route and tier, guarded the same way: the
        // tier box exists only under a route that serves tiers, so an
        // unguarded read would wipe it the moment the route box redrew.
        form.plannerProviderId = val('f-planner-route', form.plannerProviderId);
        form.plannerTier = form.plannerProviderId ? val('f-planner-tier', form.plannerTier) : '';
        DATA.agents.forEach((a, i) => {
            const cb = document.getElementById('tm-' + i);
            if (!cb) { return; }
            // ‼️ U-102 — the tick belongs to the mode that is showing. Classic's
            // cast list and an objective's pool are two answers, and one map for
            // both meant switching mode rewrote the other one silently. In
            // whole-fleet scope the box is not a question, so it is not read.
            if (form.mode === 'adaptive') {
                if (form.poolScope !== 'fleet') { form.poolSel[a.id] = !!cb.checked; }
            } else {
                form.team[a.id] = !!cb.checked;
            }
            form.roles[a.id] = val('rl-' + i, form.roles[a.id]);
            form.models[a.id] = val('md-' + i, form.models[a.id]);
            form.accounts[a.id] = val('ac-' + i, form.accounts[a.id]);
            form.routes[a.id] = val('pr-' + i, form.routes[a.id]);
            form.tiers[a.id] = val('tr-' + i, form.tiers[a.id]);
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

    /**
     * ‼️ U-103 — THE DRAFT, IN ONE SHAPE, FOR BOTH THINGS DONE WITH IT.
     *
     * Start posts this and the preview asks about this. If the two were built
     * separately the form would eventually be showing a resolution of a
     * mission slightly different from the one the button starts — which is the
     * whole class of bug the host-side resolver exists to close, reintroduced
     * one layer up. It reads `form` and nothing else, so it never renders and
     * never refuses; the refusals belong to the host.
     *
     * ‼️ U-64 — A CLASSIC START POSTS THE MESSAGE IT ALWAYS POSTED. The
     * adaptive keys are ADDED, never a `mode: 'classic'` written into every
     * message: the host reads anything that is not the exact string 'adaptive'
     * as classic, and a payload that grows keys nobody reads is how a
     * "backwards compatible" change stops being one.
     */
    function draftInput() {
        const input = {
            title: form.title, goal: form.goal, leadAgentId: form.leadAgentId,
            workdir: form.workdir, plannerModel: form.plannerModel,
            plannerEffort: form.plannerEffort,
            // ‼️ X-225 — the orchestrator's own sign-in. Its own key beside the
            // planner's model and effort, and NOT a mission-wide fallback: U-101
            // took that shape out of this form because a level the rows cannot
            // see is a form disagreeing with itself. `MissionSpec.account` stays
            // for the bridge and for child inheritance, exactly as `engine` does.
            plannerAccount: form.plannerAccount,
            // ‼️ X-107 — and the orchestrator's own route, with its tier. Sent
            // like the sign-in beside it: empty travels as empty and the host
            // stores nothing, so the lead's standing record answers at the
            // spawn — the behaviour of every mission before this.
            plannerProviderId: form.plannerProviderId,
            plannerTier: form.plannerProviderId ? form.plannerTier : '',
            /**
             * ‼️ U-101 — NO `engine` HERE. The composer used to carry a
             * `Delegation engine` box that looked like a bulk switch over the
             * rows and was not one: it wrote a mission-level FALLBACK, never
             * touched an existing row override, and had no model, effort or
             * permission counterpart — so the form disagreed with itself, and
             * the same preference could be stated in two places at once.
             *
             * The rows are the single source of truth now. `Apply profile`
             * writes what the user chose ONTO them, in plain sight, instead of
             * recording a second precedence layer nobody can see.
             *
             * `MissionSpec.engine` stays for the bridge, for every spec already
             * on disk and for child-mission inheritance, and the resolver goes
             * on reading it — this is the UI declining to WRITE a second copy,
             * not the contract losing a field.
             */
            team: memberPayload(DATA.agents.filter(a => form.team[a.id])),
            maxRounds: form.maxRounds, maxTasks: form.maxTasks, maxCostUSD: form.maxCostUSD,
            maxTokens: form.maxTokens,
            maxMinutes: form.maxMinutes, maxParallel: form.maxParallel,
            approvalMode: form.approvalMode
        };
        /**
         * ‼️ X-94 — THE THREE-WAY ANSWER, SENT AS THREE ANSWERS. The host reads
         * an ABSENT `project` key as "use the window's" and a present empty
         * string as "deliberately none"; collapsing them would make "none"
         * impossible to say from this page and would turn every draft into an
         * explicit claim about a project the user never typed. The key is added
         * only when the user actually moved the box, so a draft left alone
         * posts the exact message it posted before this control existed.
         */
        if (form.projectId === '--none--') { input.project = ''; }
        else if (form.projectId) { input.project = form.projectId; }
        if (form.mode === 'adaptive') {
            input.mode = 'adaptive';
            input.autonomy = form.autonomy;
            input.constraints = form.constraints.map(c => String(c || '').trim()).filter(Boolean);
            input.successCriteria = form.criteria
                .map((c, i) => ({ id: 'c' + (i + 1), text: String(c.text || '').trim(), required: !!c.required }))
                .filter(c => c.text);
            /**
             * ‼️ U-102 — THE POOL IS SENT WITH THE ANSWER IT MEANT. `poolScope`
             * says which of the two readings of an empty list this is, so the
             * host never has to guess: `fleet` carries every agent (the rows are
             * overrides on a whole-fleet pool, not a cast list) and `selected`
             * carries exactly the ticked ones, where none is refused on both
             * sides rather than expanded to the fleet. `team` is kept identical
             * to `pool` — one list, as it has always been recorded.
             */
            input.poolScope = form.poolScope === 'selected' ? 'selected' : 'fleet';
            input.pool = memberPayload(includedAgents());
            input.team = input.pool;
        }
        return input;
    }

    function submitForm() {
        readForm();
        formErr = '';
        if (form.mode === 'adaptive' && form.poolScope === 'selected' && !includedAgents().length) {
            formErr = 'Nobody is in the pool. Tick at least one agent, or switch the pool back to Whole fleet.';
            render();
            return;
        }
        vscode.postMessage({ type: 'create', input: draftInput() });
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

    /**
     * ‼️ X-96 — WHERE THIS DELEGATION ACTUALLY RAN, one click from the row.
     *
     * The step row carried the archived OUTPUT and nothing else, so the
     * question every mission detail eventually asks — "which session was this,
     * and what did it really do?" — meant leaving the mission, opening
     * Sessions, and matching by agent and clock. The session the delegate ran
     * in is recorded on the step (`runSessionId`, M-19) and the host resolves
     * it to the transcript file; both links live in the same cell because they
     * are the same subject: the evidence this step left behind.
     *
     * A step with no session yet (queued, or a delegation that never launched)
     * says so rather than drawing a link that would do nothing.
     */
    /**
     * ‼️ U-104 — PROVENANCE, WORDED ONCE FOR EVERY PARTICIPANT ON THIS PAGE.
     *
     * Three different things were being confused with each other, and the run
     * detail could only ever show one of them at a time:
     *
     *   REQUESTED — what somebody chose (a member row, the mission, an agent's
     *     own default, the fleet's). Visible in the composer and nowhere after.
     *   EFFECTIVE — what the ladder resolved that into, and WHICH LAYER decided
     *     each part. `runNote` said this in one lossy line: it dropped every
     *     dimension the CLI chose and the default engine, so the commonest
     *     delegation of all — one that took every default — showed nothing.
     *   APPLIED — what the engine says it actually served. A model override can
     *     be refused or substituted mid-session, and nothing on this page could
     *     have shown the difference.
     *
     * So: one renderer, one vocabulary, five dimensions in a fixed order. The
     * ROW gets a short mark (SHORTHAND) and the panel gets the table (AFTip).
     * ‼️ An unset dimension says `— CLI chooses —` rather than going blank: a
     * blank is read as "not applicable", and "nobody decided this" is a fact.
     * ‼️ An applied value the transcript does not state says `not reported`,
     * never the request echoed back — that echo is how a mismatch hides.
     */
    const ORIGIN_LONG = {
        member: 'set on this member\'s own row',
        mission: 'set mission-wide',
        agent: 'this agent\'s own default for that engine (agentFarm.agentEngineDefaults)',
        fleet: 'the fleet default (agentFarm.launchDefaults)',
        cli: 'nobody set it — the CLI decided',
        // ‼️ X-121 — TWO RUNGS ONLY THE ORCHESTRATOR HAS. It is a headless
        // `claude` in the LEAD AGENT'S folder, so two things a worker never
        // meets can write its command line: the extra args pasted onto it, and
        // the `.claude/settings*.json` chain the CLI reads in that folder. Both
        // used to be reported as `cli` — "nobody set it" — over a command line
        // that had the flag on it, which is the whole of U-100's complaint.
        'extra-args': 'a flag in agentFarm.taskExtraArgs, which is pasted onto the planner\'s command line',
        settings: 'the lead agent folder\'s own Claude settings, which the CLI reads itself',
        // ‼️ The last word, and the only one that is not a LAYER. Some of the
        // orchestrator's dimensions are not decisions at all — its engine is
        // Claude Code always, and it has no permission mode to set — and
        // printing "nobody set it, the CLI decided" for those would be a lie
        // about a control that does not exist.
        fixed: 'not a choice — this is how the planner runs'
    };
    /** The dimensions, in the order every provenance surface prints them. */
    const DIMS = [
        { k: 'engine', label: 'Engine' },
        { k: 'model', label: 'Model' },
        { k: 'effort', label: 'Effort' },
        { k: 'permissionMode', label: 'Permissions' },
        // X-107 - WHICH ENDPOINT SERVED IT, and it is the one dimension on this
        // list nothing downstream can recover: a Claude transcript does not
        // preserve the route it ran through (X-98), so the resolver's own answer
        // is the only witness there will ever be. The tier is printed UNDER the
        // route it belongs to, never as a line of its own - the word means a
        // different model on every endpoint (X-101), so alone it says nothing.
        {
            k: 'providerId', label: 'Route',
            value: d => String(d.providerId || '') + (d.tier ? '/' + String(d.tier) : '')
        },
        // X-225 - and whose plan paid. It was on the resolver's record from the
        // day that item landed and this list never printed it, so the panel that
        // exists to answer "why did it run like that" was silent about the one
        // dimension a reader chases when a bill looks wrong.
        { k: 'account', label: 'Sign-in' },
        { k: 'workDir', label: 'Workdir' }
    ];
    const NOT_SET = '— CLI chooses —';
    const NOT_REPORTED = 'not reported';
    /** ‼️ X-124 — a window was known and NO turn of that lane fell inside it.
     *  Different from "the engine did not say": the engine said plenty, none of
     *  it about this piece of work. */
    const NOT_BOUND = 'not attributable to this step';
    /** ‼️ X-124 — which evidence the `applied` column is, in one line. `turn` is
     *  the only scope a verdict may be drawn on; the others say what they are
     *  instead of passing for it. */
    const SCOPE_LINE = {
        turn: n => 'applied: read off the ' + n + (n === 1 ? ' turn' : ' turns')
            + ' this piece of work occupied — not the whole conversation.',
        session: () => '‼️ applied: this is the WHOLE session\'s reading, not this step\'s. '
            + 'Its task row is gone (retention), so there is no window to bind it to — '
            + 'a lane that was resumed served other work too, and some of what is above may be theirs.',
        unattributed: () => '‼️ applied: nothing in that session falls inside the stretch this '
            + 'ran in, so none of its testimony is about this piece of work. Showing the lane\'s '
            + 'own totals here would be testimony about some other work.'
    };
    /** Which evidence a reading is. Defaults to the lane, which is what an
     *  unlabelled reading always was. */
    function scopeOf(applied) { return (applied && applied.scope) || 'session'; }

    /** What the engine says it served, for one dimension — or the honest
     *  silence. `applied` absent altogether means the session is not indexed. */
    function appliedValue(applied, key) {
        if (!applied) { return ''; }
        // ‼️ X-124 — said on the two dimensions that would otherwise have
        // carried a value. Effort reports nothing whatever the scope, and the
        // engine and workdir never had an applied reading at all — putting the
        // sentence on those too would be one fact printed five times.
        const unbound = scopeOf(applied) === 'unattributed';
        if (key === 'model') {
            return unbound ? NOT_BOUND : ((applied.models || []).join(', ') || NOT_REPORTED);
        }
        if (key === 'permissionMode') {
            if (unbound) { return NOT_BOUND; }
            // ‼️ X-124 — a mode that CHANGED inside the window has no single
            // value, and printing one of the two would be a coin toss on the
            // fact somebody is reading this row to check.
            const many = applied.permissionModes || [];
            if (many.length > 1) { return many.join(' → ') + ' (changed during this work)'; }
            return applied.permissionMode || NOT_REPORTED;
        }
        if (key === 'effort') { return applied.effort || NOT_REPORTED; }
        return '';
    }

    /**
     * ‼️ THE ONE COMPARISON THIS WHOLE ITEM EXISTS FOR. A dimension is a
     * MISMATCH only when both sides said something and they differ — a silent
     * transcript is not a disagreement, and treating it as one would put a
     * warning on every step of every engine that reports nothing.
     */
    function dimMismatch(dims, applied, key) {
        // ‼️ X-124 — A VERDICT IS ONLY DRAWN ON TURN-BOUND EVIDENCE. The lane's
        // aggregate contains every model it ever used, so "was my model among
        // them?" found the request in some unrelated round and reported
        // agreement — hiding the one case this comparison exists for. Evidence
        // that is not about this work answers nothing about it, either way.
        if (scopeOf(applied) !== 'turn') { return false; }
        const want = String((dims && dims[key]) || '').trim();
        const got = appliedValue(applied, key);
        if (!want || !got || got === NOT_REPORTED) { return false; }
        // A session can be served by several models; the request is honoured if
        // it is among them, not only if it was the only one.
        //
        // ‼️ AND AN ALIAS IS NOT A SUBSTITUTION. Every CLI here takes a SHORT
        // name and writes the full id into its transcript — `opus` is served by
        // `claude-opus-5`, `grok-code` by `grok-code-fast-1`. Compared as
        // strings, that is a disagreement on almost every row, and a warning
        // that fires on almost every row is one nobody reads. Either side
        // containing the other is the honest reading of "this is what I asked
        // for"; what stays a mismatch is a genuinely different model.
        if (key === 'model') { return !(applied.models || []).some(m => sameModel(m, want)); }
        return got !== want;
    }
    function sameModel(a, b) {
        const x = String(a || '').toLowerCase();
        const y = String(b || '').toLowerCase();
        return !!x && !!y && (x === y || x.indexOf(y) >= 0 || y.indexOf(x) >= 0);
    }

    /** The rows of the provenance panel: requested/effective, who decided, and
     *  what came back — one line per dimension, always all five. */
    function provLines(dims, applied) {
        if (!dims) { return []; }
        return DIMS.map(d => {
            const value = (d.value ? String(d.value(dims) || '') : String(dims[d.k] || '')).trim();
            const from = originOfDim(dims, d.k);
            const got = appliedValue(applied, d.k);
            // ‼️ "applied" is printed when it ADDS something: a value that came
            // back, or a silence about a value somebody asked for. Pairing
            // "nobody set this" with "the engine did not say" is two absences
            // on one line and reads as a fault where there is none.
            const said = got && got !== value && (value || got !== NOT_REPORTED)
                ? `  ·  applied: ${got}` : '';
            return `${d.label}: ${value || NOT_SET}`
                + (value || from === 'fixed' ? `  (${ORIGIN_LONG[from] || from})` : '')
                + said;
        });
    }

    /**
     * The mark the ROW carries. Nothing when the run took every default (there
     * is no decision to point at); ⚙ when some layer decided something; ≠ when
     * the engine came back with something other than what was asked for, which
     * is the one case a reader must not have to hover to notice.
     */
    function provMark(dims, applied) {
        if (!dims) { return ''; }
        const off = DIMS.some(d => dimMismatch(dims, applied, d.k));
        if (off) { return '<span class="pmark bad">≠</span>'; }
        // `fixed` is not a decision anybody made — see ORIGIN_LONG — so it does
        // not earn the ⚙ either; otherwise the orchestrator would wear one on
        // every run in existence and the glyph would stop meaning anything.
        const chosen = DIMS.some(d => dims[d.k] && !['cli', 'fixed'].includes(originOfDim(dims, d.k)));
        return chosen ? '<span class="pmark">⚙</span>' : '';
    }

    /**
     * The whole surface: the trigger with its mark, and the panel behind it.
     * MIRROR — the panel opens with the CURRENT effective line, because the row
     * shows a glyph and a glyph cannot say `codex · gpt-5 · high`.
     */
    function provWrap(trigger, who, dims, applied, tail, cls) {
        if (!dims) {
            return window.AFTip.wrap(trigger, who,
                window.AFTip.lines([
                    // ‼️ M-29 — subject-neutral: this branch now serves the
                    // ORCHESTRATOR as well as a delegation, and the difference
                    // between the two is carried by the caller's `tail`.
                    'Nothing was recorded here about what this actually ran with.',
                    'It ran before Agent Farm kept the resolver\'s answer, so what it used is only in its own transcript.',
                    tail || ''
                ]), cls);
        }
        const short = describeEffective(dims) || 'every dimension left to the CLI';
        return window.AFTip.wrap(trigger, `${who} — ${short}`,
            window.AFTip.lines([
                'Requested → resolved, and who decided each part:',
                ...provLines(dims, applied),
                window.AFTip.GAP,
                applied === null || applied === undefined
                    ? 'The engine reported nothing back: its session is not in the index (yet, or at all).'
                    : (SCOPE_LINE[scopeOf(applied)] || SCOPE_LINE.session)(applied.turns || 0),
                applied ? 'Effort is reported by no engine today, so it is always "not reported".' : '',
                tail || ''
            ]), cls);
    }

    /** The effective set as one short line — the panel's first line and the
     *  Orchestrator/Workers summaries' own text. */
    function describeEffective(dims) {
        if (!dims) { return ''; }
        // The workdir is a path and never fits a chip; a `fixed` dimension is
        // not a choice and its sentence belongs in the panel, not on the row.
        // The engine is the exception — it is one word and it is the first
        // thing a reader wants off this chip.
        //
        // X-225/X-107 - THE SIGN-IN STAYS OFF THE CHIP AND THE ROUTE GOES ON IT,
        // and that is a judgement about the reader rather than about width. This
        // chip answers "what did this piece of work run as": the endpoint that
        // served it is part of that answer and is the one part no transcript
        // preserves. Which plan was billed is a question about the invoice, not
        // about the work, and it has its own line in the panel one hover away.
        const OFF_CHIP = ['workDir', 'account'];
        return DIMS.filter(d => dims[d.k] && !OFF_CHIP.includes(d.k)
            && (d.k === 'engine' || originOfDim(dims, d.k) !== 'fixed'))
            .map(d => d.value ? String(d.value(dims)) : String(dims[d.k])).join(' · ');
    }
    /** Which layer decided one dimension. The workdir has no per-dimension
     *  origin on a delegate's record — it comes from the mission or nowhere. */
    function originOfDim(dims, key) {
        return (dims && dims.origin && dims.origin[key]) || (key === 'workDir' ? 'mission' : 'cli');
    }

    function stepLinks(s) {
        const links = [];
        if (s.transcript) {
            links.push(`<a data-opensession="${C.esc(s.transcript)}"
                title="${C.esc('Open this delegation\'s own session in the viewer — the raw transcript, its tool calls and its turns.'
                    + (s.runSessionId ? '\n\nSession: ' + s.runSessionId : ''))}">session</a>`);
        }
        if (s.outputFile) {
            links.push(`<a data-openfile="${C.esc(s.outputFile)}" title="Open the archived output this delegation wrote">output</a>`);
        }
        if (links.length) { return links.join(' <span class="muted">·</span> '); }
        return `<span class="muted small" title="${C.esc(s.status === 'queued' || s.status === 'blocked'
            ? 'Nothing to open yet — this delegation has not launched.'
            : 'No session was recorded for this step and no output file was kept.')}">—</span>`;
    }

    /**
     * ‼️ U-104 — the agent cell of a delegation row IS the provenance surface.
     *
     * It used to carry a thin native `title` built from `runNote`, which meant
     * the answer to "which engine, which model, whose decision, and did the CLI
     * honour it?" was a lossy sentence on a tooltip that a repaint takes away
     * mid-read. The name still reads as the name; the mark beside it says
     * whether anything was decided (⚙) or came back different (≠), and the
     * panel behind it carries the table. Steps recorded before `ran` existed
     * fall back to the old line rather than showing an empty panel.
     */
    function stepProv(s) {
        const name = C.esc(s.agentName);
        const mark = provMark(s.ran, s.applied);
        return provWrap(`<span class="pname">${name}${mark}</span>`, s.agentName, s.ran, s.applied,
            !s.ran && s.runNote ? '\nRecorded at the time as: ' + s.runNote : '');
    }

    /**
     * X-110 — WHICH PROVIDER SERVED THIS DELEGATION, in the shared mark beside
     * the name. The provenance panel keeps the route the step was ASKED for
     * (a dimension of the request); this is the one that ANSWERED, read off
     * the session the step ran in by the same reader the resume gate asks.
     * Two facts, two marks — the chip has its own panel, so the two are never
     * worded in one place. Nothing until a session is bound, nothing on a run
     * that took the engine's own default.
     */
    function stepProvider(s) {
        const I = s.identity;
        if (!I || !window.AFProvider) { return ''; }
        const chip = window.AFProvider.chip(I);
        if (!chip) { return ''; }
        return ' ' + window.AFTip.wrap(chip, window.AFProvider.title(I),
            window.AFTip.lines(window.AFProvider.tipLines(I)));
    }

    function stepRow(s, run) {
        const open = expandedStep === s.id;
        const ctx = window.AFCtx.row('afMissionStep', {
            run: run ? run.id : '', step: s.id, agentId: s.agentId, afOutput: !!s.outputFile,
            // X-96 — gates "Open the session it ran in" the way afOutput gates
            // the output entry: an action that cannot act is not offered.
            afSession: !!s.transcript
        });
        return `<tr class="steprow" data-step="${C.esc(s.id)}" ${ctx}
            title="Click to open this delegation: full prompt + live output — ${window.AFCtx.HINT}">
            <td class="stoggle">${open ? '▾' : '▸'}</td>
            <td>${stepProv(s)}${stepProvider(s)}${stepLive(s)}</td>
            <td>${C.esc(s.title)}${s.readonly ? ' <span class="mchip ro">read-only</span>' : ''}${s.note ? ` <span class="muted small">(${C.esc(s.note)})</span>` : ''}</td>
            <td>${chip(s.status)}${failChip(s.failure)}</td>
            <td class="num">${s.tokens ? C.fmtTok(s.tokens) : '—'}</td>
            <td class="num">${s.costUSD !== undefined ? usd(s.costUSD) : '—'}</td>
            <td class="slinks">${stepLinks(s)}</td>
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
            `lead: ${sp.leadAgentName}${sp.plannerModel || sp.plannerEffort ? ` (planner:${sp.plannerModel ? ` ${sp.plannerModel}` : ''}${sp.plannerEffort ? ` ~${sp.plannerEffort}` : ''})` : ''}`,
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
            body = `<table class="mtable"><thead><tr><th></th><th>Agent</th><th>Task</th><th>Status</th><th class="num">Tokens</th><th class="num">Cost</th><th title="What this delegation left behind: its own CLI session (the raw transcript and tool calls) and the output file it wrote. Either can be missing — a step that never launched has neither.">Evidence</th></tr></thead>
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
            window.AFTip.GAP,
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
                window.AFTip.GAP,
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
                window.AFTip.GAP,
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

    /**
     * ‼️ U-104 — WHAT EACH WORKER HAS ACTUALLY RUN WITH IN THIS RUN.
     *
     * The Workers summary must not re-resolve the ladder live: the settings it
     * would read are today's, and a run from last week did not use today's. The
     * honest source is the run's own record — the LAST delegation each
     * participant took, which is what "the final spec" means for a run that is
     * still going and for one that has finished.
     *
     * A member that has not been given anything yet has no answer here, and the
     * summary says "not yet delegated" rather than inventing one.
     */
    function workerRuns(run) {
        const by = {};
        (run.rounds || []).forEach(rd => (rd.steps || []).forEach(s => {
            if (!s.agentName || !s.ran) { return; }
            // ‼️ ONE SUBJECT — the ROUND, not the step's title. The title belongs
            // to the row below and repeating it here would put one fact on two
            // surfaces; the round number is what a reader needs to find the
            // delegation this reading was taken from.
            by[s.agentName] = { dims: s.ran, applied: s.applied, round: rd.n };
        }));
        return by;
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
        /**
         * ‼️ U-104 — the ORCHESTRATOR read as one of the five-dimension shapes
         * every other participant on this page is read as, so one renderer
         * serves both. Two of the five are not choices at all and say so with
         * an origin rather than by going missing: the engine is FIXED (the
         * planner always runs on Claude Code) and the permission mode does not
         * exist on that command line — its tools are cut off by name instead.
         * The workdir is the LEAD AGENT'S folder, deliberately not the mission
         * workdir, which is where the delegations run.
         */
        /**
         * ‼️ M-29 — AND IT IS READ OFF THE RUN'S OWN RECORD, NOT RE-RESOLVED.
         *
         * This used to derive from `sp.plannerModel`/`sp.plannerEffort` alone
         * and write `origin: 'cli'` — "nobody set it" — whenever they were
         * empty. That is the same lie X-121 deleted from the preview, and the
         * fix is NOT to climb the ladder again here: the run started in the
         * past, and `agentFarm.taskExtraArgs` and the lead folder's Claude
         * settings are read as they are TODAY. Answering with them would be an
         * assertion about last week made out of this morning's files.
         *
         * So the launcher keeps its answer on the run (`run.plannerLaunch`) and
         * this draws that record. A run that has none gets `null` — the
         * provenance panel's own "nothing was recorded here" — because a run
         * whose ladder was never written down has no honest value to show.
         */
        const pl = run.plannerLaunch;
        const plannerDims = !pl ? null : {
            engine: 'claude',
            model: pl.model.value || '',
            effort: pl.effort.value || '',
            permissionMode: 'none — its write and spawn tools are cut off by name',
            workDir: 'the lead agent\'s own folder',
            origin: {
                engine: 'fixed',
                model: pl.model.origin,
                effort: pl.effort.origin,
                permissionMode: 'fixed',
                workDir: 'fixed'
            }
        };
        /** Where each dimension was SAID — a settings file's path or the flag
         *  verbatim. `mission` and `cli` are their own explanation and carry
         *  none, exactly as the preview's `originSource` does. */
        const plannerSaid = !pl ? [] : [
            pl.model.source ? 'Model said by: ' + pl.model.source : '',
            pl.effort.source ? 'Effort said by: ' + pl.effort.source : ''
        ].filter(Boolean);
        /** ‼️ The flags the mission's own override took OFF the command line.
         *  A conflict a reader can see is a conflict; one dropped in silence is
         *  a bug report nobody can reconstruct six months later. */
        const plannerGone = (pl && pl.displaced && pl.displaced.length)
            ? 'The mission\'s own choice displaced from agentFarm.taskExtraArgs: ' + pl.displaced.join(' · ')
            : '';
        /** What each worker has actually run with in THIS run — see workerRuns. */
        const ran = workerRuns(run);
        const tasksUsed = run.rounds.reduce((a, r) => a + r.steps.length, 0);
        const wallMin = Math.max(0, Math.round(((run.endedAt || Date.now()) - run.startedAt - (run.waitedMs || 0)) / 60000));
        return `<div class="mdetail">
            <div class="dethead">
                <h2 style="margin:0">${C.esc(sp.title)}</h2>
                ${chip(run.status)}
                <span style="flex:1"></span>
                <!-- ‼️ X-95 — THIS MISSION'S CONVERSATIONS, AS A LIST. A mission
                     opens a session for its planner and one for every delegation
                     it hands out; the run detail below shows them one step at a
                     time, and nothing anywhere put them side by side. The
                     Sessions page already IS that surface — sortable, foldable,
                     with the whole right-click action set — so this opens it
                     scoped to this run rather than growing a second table here.
                     Mission sessions are hidden from that page by default, which
                     is exactly why the button exists: it is the route to rows
                     nobody would otherwise find. -->
                <button class="secondary" id="d-sessions-${C.esc(run.id)}"
                    title="Open the Sessions page showing ONLY this mission's sessions — its planner's own lane and every delegation it opened. They are kept out of the general log by default.">🎯 Sessions</button>
                ${pauseBtn}
                ${canResume ? `<button id="d-resume-${C.esc(run.id)}">Resume</button>` : ''}
                ${active ? `<button class="secondary" id="d-cancel-${C.esc(run.id)}" title="Cancel the mission and its running delegations">Cancel</button>` : ''}
            </div>
            <!-- ‼️ U-104 — TWO SUBJECTS, TWO SUMMARIES. One muted line used to
                 hold the lead, the planner's model, the whole team, the workdir
                 and the approval mode. It answered "who is in this" and could
                 not answer "what did each of them actually run with", which is
                 the question a finished run is read for — and the member chips
                 repeated the DECLARED values while the rows below showed the
                 RESOLVED ones, so the same subject was drawn twice, differently.
                 ONE SUBJECT: the orchestrator is one, the workers are another,
                 and each carries its own provenance panel. -->
            <div class="provrow">
                <span class="plabel" title="Who plans the rounds, and what it plans with. The planner is not a worker: it always runs on Claude Code, in the LEAD AGENT'S own folder, with no permission mode at all.">Orchestrator</span>
                <b ${teamCtx(sp.leadAgentId, sp.leadAgentName, 'lead', sp.plannerModel)}
                    title="${C.esc(window.AFCtx.hint('The lead — it plans the rounds'))}">${C.esc(sp.leadAgentName)}</b>
                ${provWrap(`<span class="mchip prov">${C.esc(pl ? (describeEffective(plannerDims) || 'CLI chooses') : 'not recorded')}${provMark(plannerDims, run.plannerApplied)}</span>`,
                    sp.leadAgentName + ' — planner', plannerDims, run.plannerApplied,
                    [
                        window.AFTip.GAP,
                        ...plannerSaid,
                        plannerGone,
                        pl ? '' : 'Either this run predates the record, or its planner has not been called yet. Working it out now would read TODAY\'S agentFarm.taskExtraArgs and today\'s lead-folder Claude settings — an answer about this run built out of this morning\'s files, which is the guess this record exists to refuse.',
                        'The planner ALWAYS runs on Claude Code and in the LEAD AGENT\'S own folder — not the mission workdir, which is where the delegations run. It takes no permission mode at all: its write and spawn tools are cut off by name instead.'
                    ].filter(Boolean).join('\n'), 'tip-planner')}
                ${pt ? `<a data-opensession="${C.esc(pt)}" title="Open the lead's full planner conversation (briefings, thoughts, decisions) in the session viewer">transcript</a>`
                    : `<span class="muted small" title="The planner's own session has not been indexed — there is nothing to open yet.">no transcript yet</span>`}
            </div>
            <div class="provrow">
                <span class="plabel" title="Who the work is handed to, and what each of them ended up running with. A member's panel shows what was declared on its row, what the ladder resolved that into, and what the engine says it actually served.">Workers</span>
                ${!sp.team.length
                    ? (isAdaptive(sp)
                        ? `<span class="muted small" title="An adaptive lead is handed a pool and binds a cast as it goes — the Cast section below is where that record is.">cast bound at runtime</span>`
                        : `<span class="muted small">nobody on the team</span>`)
                    : sp.team.map(m => {
                        const w = ran[m.agentName];
                        const declared = [m.engine || sp.engine || '', m.model || '', m.effort || '', m.permissionMode || '']
                            .filter(Boolean).join(' · ');
                        return provWrap(
                            `<span class="mchip team" ${teamCtx(m.agentId, m.agentName, m.role, m.model)}>${C.esc(m.agentName)}${m.role ? ` — ${C.esc(m.role)}` : ''}${w ? provMark(w.dims, w.applied) : ''}</span>`,
                            m.agentName + (m.role ? ' — ' + m.role : ''),
                            w ? w.dims : null, w ? w.applied : undefined,
                            (declared ? '\nDeclared on this member\'s row: ' + declared
                                : '\nNothing is declared on this member\'s row — every dimension falls through the ladder.')
                            + (w ? '\nRead off its last delegation, in round ' + w.round + '.'
                                : '\nIt has not been delegated to yet, so nothing has been resolved for it.'));
                    }).join(' ')}
                <span class="muted small">${sp.workdir ? ` · workdir <code>${C.esc(sp.workdir)}</code>` : ''} · approval: ${C.esc(sp.approvalMode)}</span>
            </div>
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
                <span class="muted small">${runUsd(run)} / ${capUsd(sp.limits.maxCostUSD)}${runTokens(run)
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
                <div class="muted small">total ${runUsd(run)} · ended ${fmtTime(run.endedAt)}${
                    run.result.stopReason ? ` · stopped: ${C.esc(run.result.stopReason)}` : ''}</div></div>` : ''}
            ${run.status === 'failed' && !run.result && run.note ? `<div class="resultbox failed">
                <b>FAILED</b> — ${C.esc(run.note)}
                <div class="muted small">ended ${fmtTime(run.endedAt)} · tracked cost ${runUsd(run)} (a killed planner call's spend is not in this number)</div></div>` : ''}
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
                C.option(s.id, s.label, { selected: s.id === runSort, detail: s.detail || '' })).join('')}</select>
            <button class="chip" id="m-sortdir" title="Flip the sort direction">${runSortAsc ? '▲ asc' : '▼ desc'}</button>
            <button class="chip${nf ? ' on' : ''}" id="m-filters" title="Filter the list by status, verdict, agents, ranges and dates${nf ? ` — ${nf} active` : ''}">Filters</button>
            <span class="muted small">Runs:</span>
            <button class="chip" id="r-expandall" title="Open every run's detail">Expand all</button>
            <button class="chip" id="r-collapseall" title="Fold the list back to plain rows">Collapse all</button>
            <button class="chip${runSingle ? ' on' : ''}" id="r-singleopen" title="Only one run open at a time: opening a run folds the previously open one">Single-open</button>
            <span class="muted small">${nf ? `${shownCount}/${DATA.runs.length} runs` : '— click a row to open/fold that run'}</span>
        </div>` + filterPanelHtml();
    }

    /** The action shape a signature carries — `s1|delegate>evaluate>finish|review`
     *  is a version, a shape and a feature set, and only the middle is readable
     *  on a row. */
    const shapeOf = (sig) => String(sig || '').split('|')[1] || '(no decisions recorded)';
    const flagsOf = (sig) => String(sig || '').split('|')[2] || '';
    const ratePct = (n, d) => (d ? Math.round((n / d) * 100) : 0);

    /**
     * ‼️ A-17 — WHAT THIS FARM HAS LEARNED, ON ONE LINE ABOVE THE LIST.
     *
     * A-17 refuses this a dashboard on purpose, and the reason is not tidiness:
     * a measurement is worth keeping only if it is in front of the person about
     * to choose an approach. So SHORTHAND — the top shape and one rate on the
     * strip, the whole table in its AFTip.
     *
     * Four things this surface must never do, each of which the core already
     * refuses and a page could quietly reintroduce on its own:
     *
     *  · NEVER CONCLUDE FROM TOO FEW RUNS. A group under `minSample` is still
     *    drawn — hiding it would be its own kind of lie — but it is drawn as a
     *    count with "too few to read" where the rate would be, and never as a
     *    percentage the eye can quote.
     *  · NEVER DRAW THE COMPARISON THE CORE DECLINED. `compare.successRate` is
     *    null when one side is short, and null is not "they are equal": the
     *    note says which side has no denominator, and that sentence is what is
     *    shown in place of the figures.
     *  · NEVER PRESENT COST AS A REASON. It is in the panel, as an observation,
     *    in the same line that says nothing routes on it.
     *  · NEVER LET "MORE RECORDED THAN LISTED" READ AS A BUG. Run rows are
     *    evicted long before outcomes are, so the panel states the two limits
     *    rather than leaving a reader to reconcile them.
     */
    function outcomeStripHtml() {
        const o = DATA.outcomes;
        if (!o) { return ''; }
        // A store that could not be read says so. A zero drawn over unreadable
        // bytes is worse than no strip at all: it is a confident wrong answer.
        if (o.health === 'unreadable' || o.health === 'future' || o.degraded) {
            return `<div class="chiprow histrow">
                <span class="muted small">History:</span>
                <span class="mchip wait">unavailable</span>
                <span class="muted small">${C.esc(o.degraded
                    || 'the outcome history could not be read')}</span>
            </div>`;
        }
        // A young farm has nothing to say and says nothing — an empty strip
        // would be a permanent piece of furniture reporting no news.
        if (!o.total) { return ''; }

        const cmp = o.compare || {};
        const top = (o.groups || [])[0];
        const groupLine = (g) => {
            const flags = flagsOf(g.signature);
            const crit = g.requiredSatisfaction === null || g.requiredSatisfaction === undefined
                ? ''
                : ` · ${Math.round(g.requiredSatisfaction * 100)}% of required criteria met`;
            const head = g.enough
                ? `${g.runs} ${g.mode} run(s) · ${ratePct(g.success, g.runs)}% success${crit}`
                : `${g.runs} ${g.mode} run(s) — under ${o.minSample}, too few to read; `
                    + 'the figures below are real arithmetic over too small a sample '
                    + 'and nothing may be concluded from them';
            return [
                shapeOf(g.signature),
                '  ' + head,
                `  verdicts: ${g.success} success · ${g.partial} partial · ${g.failed} failed`
                    + ` · ${g.cancelled} cancelled`,
                `  averages: ${g.avgRounds} rounds · ${g.avgTasks} tasks`
                    + ` · ${g.avgStrategyChanges} strategy change(s)`
                    + ` · ${g.avgUserInterventions} user intervention(s)`,
                flags ? `  did: ${flags.split(',').join(', ')}` : '  did: nothing beyond delegating',
                `  observed cost: ${usd(g.avgCostUSD)} · ${C.fmtTok(g.avgTokens)} per run`
                    + ' (recorded so a person can read it; no decision anywhere looks at it)',
                `  last: ${fmtTime(g.lastAt)}`,
                window.AFTip.GAP
            ].join('\n');
        };

        // ‼️ A-12.9 — THIS PAGE FOUND IT FIRST AND KEPT THE ANSWER TO ITSELF.
        // `AFTip.lines` drops an empty string (that is how a caller passes a
        // conditional line), so '' cannot also mean "blank line here" — and the
        // local `GAP = ' '` that used to live here fixed exactly one panel
        // while every MIRROR tooltip in the product went on running its value
        // into its paragraph. The marker belongs to the component now.
        const GAP = window.AFTip.GAP;
        const body = window.AFTip.lines([
            `${o.total} finished run(s) recorded, in ${(o.groups || []).length}`
                + `${o.more > 0 ? '+' : ''} shape(s).`,
            '‼️ This is the recorded history, not the rows below it. Run rows are dropped'
                + ' at 40 and outcomes are kept to 2000, so counting more here than the list'
                + ' shows is the point of keeping it — not a miscount. Filters on the list'
                + ' do not narrow this either.',
            GAP,
            cmp.successRate
                ? `classic vs adaptive: ${Math.round(cmp.successRate.classic * 100)}% of`
                    + ` ${cmp.classic.runs} classic run(s) succeeded, `
                    + `${Math.round(cmp.successRate.adaptive * 100)}% of ${cmp.adaptive.runs}`
                    + ' adaptive. Same farm, not the same work — this is a description of'
                    + ' what has happened, not a verdict on which is better.'
                : 'classic vs adaptive: ' + (cmp.note || 'not enough of one of them to say.'),
            GAP,
            'A SHAPE is the ordered decisions the lead actually took with consecutive'
                + ' repeats collapsed, ending in how it stopped; the flags after it are what'
                + " the run's own record shows it did, never what a planner claimed.",
            GAP,
            ...(o.groups || []).map(groupLine),
            o.more > 0
                ? `+${o.more} more shape(s) — the whole table is the missions.outcomes bridge op.`
                : '',
            (o.signatureVersions || []).length > 1
                ? '‼️ Two signature versions are present (' + o.signatureVersions.join(', ')
                    + '): a grouping rule changed, so the groups are not comparable across them.'
                : ''
        ]);

        const topBit = top
            ? `<span class="hshape">${C.esc(shapeOf(top.signature))}</span>`
                + `<span class="muted small">×${top.runs}${top.enough
                    ? ` · ${ratePct(top.success, top.runs)}% success`
                    : ' · too few to read'}</span>`
            : '';
        const cmpBit = cmp.successRate
            ? `<span class="mchip">classic ${Math.round(cmp.successRate.classic * 100)}%`
                + ` · adaptive ${Math.round(cmp.successRate.adaptive * 100)}%</span>`
            : '';

        return `<div class="chiprow histrow">
            <span class="muted small">History:</span>
            ${window.AFTip.wrap(
                `<span class="histtrig"><span class="mchip">${o.total} recorded</span>${topBit}${cmpBit}</span>`,
                `Recorded history — ${o.total} finished run(s), most common shape first`,
                body,
                // the class is what makes the panel photographable
                // (`render_page --tip tip-hist`), and it is also the flex child
                // this row sizes — the trigger inside it is not.
                'tip-hist')}
        </div>`;
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
            // ‼️ The strip stays. A farm whose rows have all been evicted still
            // has its history, and that is exactly the moment it is worth the
            // most — "no missions yet" over 60 recorded runs would be false.
            return outcomeStripHtml()
                + '<p class="muted">No missions yet — <a id="firstmission">start the first one</a>.</p>';
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
                <td class="num">${runUsd(r)}</td>
                <td class="muted small">${fmtTime(r.startedAt)}</td>
            </tr>` + (open ? `<tr class="rundetail"><td colspan="9">${detailHtml(r)}</td></tr>` : '');
        }).join('');
        return outcomeStripHtml() + runCtlHtml(pool.length) + `<table class="mtable" id="mlist"><thead>
            <tr><th></th><th>Mission</th><th>Lead + team</th><th>Status</th><th>Rounds</th><th>Tasks</th><th class="num">Tokens</th><th class="num">Cost</th><th>Started</th></tr>
        </thead><tbody>${rows || `<tr><td colspan="9" class="muted">No runs match the filters.</td></tr>`}</tbody></table>`;
    }

    // ---------- ‼️ X-177 — THE SENTRY CAMPAIGN, ON THE PAGE IT BELONGS TO ----
    // Missions is already the page for work that runs while nobody is watching,
    // and the item forbids a third panel by name. So the campaign's SETUP and
    // its HISTORY live here — what it was told to do, and what it has done —
    // while what is true this second lives on the Console strip. Neither
    // surface repeats the other (ONE SUBJECT).
    let sentryFormOpen = false;
    let sentryErr = '';
    let sentryOpen = true;
    const sentryForm = {
        project: '', agent: '', engine: '', model: '',
        // ‼️ THE DEFAULT IS THE UNATTENDED ONE, on purpose. A headless round
        // that stops to ask permission has nobody to answer it and never ends,
        // which is a spent account and no work. The picker is right there to
        // say otherwise.
        permissionMode: 'bypassPermissions',
        superpowers: false, prompt: '', ceiling: '', safetyBufferMin: '', failLimit: '',
        /**
         * ‼️ X-194 — A MODE IS A PRESET, NOT A CODE PATH.
         *
         * Mechanical, intelligent and hybrid are three FILLED-IN STATES of one
         * condition set (X-184), so the form keeps a preset name and a list of
         * conditions rather than a switch. Picking a preset REPLACES the
         * conditions; touching a condition makes the mode `custom` and the page
         * goes on saying which preset it came from — the alternative, silently
         * keeping the preset's name over edited conditions, is a label that
         * lies about what will run tonight.
         *
         * `null` is not "mechanical": it is NOTHING ASKED FOR, and the host
         * writes no policy at all for it (v11.244). The round's own default
         * then decides, which is what every campaign started before this form
         * existed did.
         */
        preset: null,
        conditions: [],
        /**
         * ‼️ X-207 — THE ACCOUNTS THIS CAMPAIGN MAY SPEND, IN TICK ORDER, and
         * how to walk them. Both empty by default and both stay empty on the
         * wire: an empty pool is not a pool of nobody, and `free` is what a
         * record with no field does — sending either would freeze today's
         * default onto a campaign, the same mistake the mode chips avoid.
         */
        pool: [],
        rotation: '',
        /**
         * ‼️ X-194 — THE LEADER'S OWN LEASH, and empty is not zero. An empty
         * box means "the setting decides", so nothing is sent for it; sending
         * today's setting back would FREEZE it onto the campaign, and changing
         * the setting tomorrow would leave this campaign spending yesterday's
         * figure with nothing on any surface saying so.
         */
        // ‼️ X-249 — and whose plan pays for that turn. Empty is not the
        // machine's sign-in: it is the campaign's own pool answering.
        // ‼️ X-249 (2/n) — and which ENGINE it spawns. Empty means the setting
        // decides, exactly like the model beside it.
        leaderEngine: '',
        leaderModel: '', leaderAccount: '', leaderDailyUsd: '', leaderMaxUsd: ''
    };
    /** The three the dictionary declares, plus what an EDITED one is called. */
    const CUSTOM = 'custom';
    /**
     * ‼️ X-194 — WHETHER THIS DRAFT WOULD FIRE TONIGHT, ANSWERED BY THE REAL
     * EVALUATOR. Operator semantics live in `core/sentryPolicy.ts`; a second
     * copy on this page would be the copy that goes out of date, and a row
     * marked "holds" by a page the host disagrees with is worse than no mark at
     * all. So the page ASKS, debounced, exactly the way the mission draft asks
     * what it would launch with (U-103).
     */
    let PROBE = null;
    let probeSeq = 0;
    let probeFp = '';
    let probeTimer = 0;
    /**
     * Debounced from `render`, on the same rule the mission draft's preview
     * follows (U-103): a repaint that changed NOTHING must not restart the
     * clock, or a form being typed into never gets round to asking. Hooked to
     * the repaint rather than to each of the controls that edit a condition,
     * because a control added later would silently not have it.
     */
    const scheduleSentryProbe = () => {
        if (!sentryFormOpen) { return; }
        const list = sentryForm.conditions;
        // The same normalisation the mode strip compares by: a read-back that
        // only changed `0` into `"0"` is not a new question, and asking again
        // for it would throw the answer away on every repaint.
        let fp;
        try { fp = condNorm(list); } catch (e) { fp = 'draft-' + Date.now(); }
        if (fp === probeFp) {
            if (probeTimer) { return; }
        } else {
            probeSeq += 1;
            probeFp = fp;
            // ‼️ The answer on the board is about a draft that no longer exists.
            // Keeping it would leave a mark on a row that has since moved or
            // changed field; dropping it costs one unmarked repaint, which is
            // the honest state — nobody has judged this set yet.
            PROBE = null;
        }
        clearTimeout(probeTimer);
        const gen = probeSeq;
        probeTimer = setTimeout(() => {
            probeTimer = 0;
            vscode.postMessage({ type: 'sentryProbe', seq: gen, conditions: list });
        }, 220);
    };

    /** SHORTHAND: one word for the whole state, and the panel carries the rest. */
    /**
     * ‼️ X-196 — THE STATE, IN ONE WORD, WITH THE WORD'S MEANING BEHIND IT.
     *
     * Six words came out of here and not one of them had a panel: WAITING and
     * SLEEPING are the same picture to a reader who does not already know the
     * difference (one is between rounds, the other is sitting out a quota wall
     * and knows when it wakes), and BLOCKED said nothing at all about what is
     * blocking it. SHORTHAND is the word on the chip; the panel is the rest of
     * it, opening with the long form and then the campaign's OWN figures —
     * which is the DENSITY test, because none of them costs a click now.
     */
    function sentryChip(s) {
        const c = s.campaign;
        const mark = (cls, word, long, extra) => {
            const body = window.AFTip.lines([long, ''].concat(extra || []).concat(
                c ? [
                    `${s.projectName || c.project || ''} · as ${s.agentName || c.agent || ''}`
                        + ` · ${c.rounds || 0} round(s)`,
                    c.lastRule ? `last decision: ${c.lastAction || 'plan'} — ${c.lastRule}` : '',
                    c.lastAt ? `decided ${sentryWhen(c.lastAt)}` : ''
                ] : []));
            // ‼️ A-12.8 — THE WRAPPER IS NAMED SO THE PANEL CAN BE PHOTOGRAPHED.
            // `render_page.js --tip <class>` opens a panel by the class on its
            // wrapper; an unnamed one can only be reached by counting every
            // `af-tipw` on the page, which changes the moment anything else
            // grows a hover. This chip's panel is the whole of X-196, so it is
            // the last thing that should be hard to look at.
            return window.AFTip.wrap(
                `<span class="mchip ${cls}">${word}</span>`, `Sentry — ${word.toLowerCase()}`,
                body, 'sentry-chip');
        };
        if (!c) {
            return mark('', 'OFF', 'No campaign has ever been set up on this machine.', [
                'A campaign takes the next item off a project backlog, opens a clean unattended '
                + 'session on it as an ordinary task row, and when that row ends it reads what the '
                + 'session left behind and opens the next one — until you stop it.'
            ]);
        }
        if (c.status === 'paused') {
            return mark('wait', 'PAUSED', 'You paused it. Nothing will be opened until you resume.', [
                'A round already running was left to finish — pausing stops the NEXT one.',
                c.pausedAt ? `paused ${sentryWhen(c.pausedAt)}` : ''
            ]);
        }
        if (c.status !== 'running') {
            return mark('', 'STOPPED', 'It is over — by your own hand or by the failure brake.', [
                c.stoppedWhy || '',
                c.stoppedAt ? `stopped ${sentryWhen(c.stoppedAt)}` : ''
            ]);
        }
        if (s.running) {
            return mark('live', 'RUNNING', 'A round is on the board right now.', [
                s.live ? `${s.live.title || ''}${s.live.account ? ' on ' + s.live.account : ' on the main sign-in'}` : '',
                // audit B-04.3 — the window is the reading's, not this line's.
                s.live && typeof s.live.accountPercent === 'number'
                    ? `${Math.max(0, 100 - s.live.accountPercent)}% of that account's `
                    + `${window.AFAccount.windowPhrase({ window: s.live.accountWindow }) || 'window'} is left` : ''
            ]);
        }
        if (c.lastAction === 'sleep') {
            return mark('wait', 'SLEEPING',
                'Every account it may use is at or above its ceiling, so it is sitting the wall out.', [
                // ‼️ THE DIFFERENCE BETWEEN THIS AND *WAITING* IS THE CLOCK, so
                // the clock is the first figure — a reader at midnight cannot
                // tell a sleeping campaign from a broken one without it.
                c.wakeAt ? `wakes ${sentryWhen(c.wakeAt)}` : 'no wake time was measured',
                'It is standing, not stopped: nothing needs pressing.'
            ]);
        }
        if (c.lastAction === 'blocked') {
            return mark('bad', 'BLOCKED',
                'It wanted to open a round and could not, so it is waiting rather than guessing.', [
                c.lastWhy || '',
                'A block is not a stop — it tries again on the next beat.'
            ]);
        }
        return mark('live', 'WAITING',
            'Between rounds: nothing is on the board and nothing is in the way.', [
            s.nextWords && s.nextWords.code
                ? `the next round already has its words, for ${s.nextWords.code}` : '',
            'The next beat opens it — see the idle poll setting.'
        ]);
    }

    function sentryWhen(t) {
        return t ? new Date(t).toLocaleString() : '';
    }

    /** The campaign's own account of itself: the last plan, in its own words. */
    function sentryWhy(c) {
        if (!c || !c.lastWhy) { return ''; }
        const short = C.esc(c.lastWhy.length > 150 ? c.lastWhy.slice(0, 150) + '…' : c.lastWhy);
        // ‼️ B-02 — NAMED, so `render_page.js --tip sentry-why` can open it. Once
        // the line is over 150 characters this panel is the ONLY place the whole
        // reason exists, and an unnamed panel can be reached only by counting
        // every `af-tipw` on the page — which moves the moment anything else
        // grows a hover. The longest reason the product really writes
        // (`pool-empty`) is past the cap, so this is not a hypothetical.
        return window.AFTip.wrap(
            `<span class="swhy">${short}</span>`,
            `${c.lastAction || 'plan'} — ${c.lastRule || ''}`,
            window.AFTip.lines([c.lastWhy, window.AFTip.GAP, 'decided ' + sentryWhen(c.lastAt)]),
            'sentry-why');
    }

    /**
     * ‼️ X-195 — WHY THIS ROUND OPENED ON THESE WORDS, in the width of a letter.
     *
     * SHORTHAND: the table has room for one mark and the panel carries the rest,
     * opening with the long form. The mark itself is the HOST's (`whyShorthand`
     * in `core/sentryWhy.ts`) — the rule that separates "never asked" from
     * "asked and got nothing usable" is the whole point of the record, and a
     * second copy of it here is the copy that would go wrong.
     *
     * A round opened before this record existed has no `why` at all, and says so
     * with a dash rather than being drawn as a mechanical round nobody paid for.
     */
    function sentryWhyCell(r) {
        const w = r.why;
        if (!w || !r.whyMark) {
            return window.AFTip.cell('swhym', '', '<span class="dim">—</span>',
                'No account of this round',
                window.AFTip.lines([
                    'This round was opened before the farm kept the account of why,',
                    'so nothing is claimed about it.'
                ]));
        }
        const long = r.whyMark === 'L'
            ? 'L — leader round: a model read the situation and chose these words'
            : (r.whyMark === 'M!'
                ? 'M! — mechanical round: the leader WAS asked and gave nothing usable'
                : 'M — mechanical round: a template filled itself in, and no model was asked');
        const body = [];
        if (w.outcome) { body.push('diagnosis: ' + w.outcome); }
        body.push((w.fired && w.fired.length)
            ? 'fired: ' + w.fired.join(' · ')
            : 'fired: nothing — the routine path');
        // ‼️ X-190's law, on the row a person reads: a condition nobody could
        // evaluate is NOT a condition that did not fire.
        if (w.problems && w.problems.length) {
            body.push('could not be judged: ' + w.problems.join(' · '));
        }
        // ‼️ The one claim in a continuation prompt a reader cannot otherwise
        // check: WHICH note it was built on, and which source offered it.
        if (w.handover) {
            body.push(w.handover.found
                ? 'handover: ' + (w.handover.path || '(unnamed)')
                    + (w.handover.source ? ' · from ' + w.handover.source : '')
                    + (typeof w.handover.score === 'number' ? ' · score ' + w.handover.score : '')
                : 'handover: looked, and there was none — the words are the template\'s alone');
        }
        if (w.assist) {
            body.push('leader turn: ' + (w.assist.ok === false ? 'gave nothing usable' : 'answered')
                + (w.assist.model ? ' · ' + w.assist.model : '')
                + (typeof w.assist.costUsd === 'number' ? ' · ' + spendUsd(w.assist.costUsd) : '')
                + (typeof w.assist.ms === 'number' ? ' · ' + Math.round(w.assist.ms / 1000) + 's' : '')
                + (w.assist.note ? ' · ' + w.assist.note : ''));
        }
        if (w.why) { body.push('', w.why); }
        if (w.opening) { body.push('', 'opened with: ' + w.opening); }
        // ‼️ THE WEIGHT ON THE PAGE FOLLOWS WHAT THE MARK COSTS. `M!` is the only
        // alarm (money spent, no words bought) and is red; `L` is the round a
        // model really decided, so it carries the solid chip; `M` is the routine
        // night and gets the quietest outline there is. Drawn the other way
        // round — which is what the plain chip did on a light theme — the page
        // shouts loudest about the rounds that cost nothing.
        const cls = r.whyMark === 'M!' ? 'bad' : (r.whyMark === 'L' ? '' : 'prov');
        return window.AFTip.cell('swhym', '',
            `<span class="mchip ${cls}">${C.esc(r.whyMark)}</span>`,
            long, window.AFTip.lines(body));
    }

    function sentryRoundsHtml(s) {
        if (!s.rounds || !s.rounds.length) { return ''; }
        const rows = s.rounds.slice().reverse().slice(0, 12).map(r => {
            const cls = r.status === 'done' ? 'ok' : (r.status === 'failed' ? 'bad'
                : (r.status === 'cancelled' ? 'wait' : 'live'));
            // ‼️ B-02 — NEVER NEGATIVE. A row whose `endedAt` is before its
            // `createdAt` drew `Took -24m` on the screen: a round that finished
            // before it began, printed without a word. The run table one screen
            // up already clamps the same figure (`Math.max(0, …)`); this is that
            // rule, not a new one. The stamps themselves stay in the panel, so
            // an inconsistent record is still readable rather than hidden.
            const mins = r.endedAt && r.createdAt
                ? Math.max(0, Math.round((r.endedAt - r.createdAt) / 60000)) : null;
            /**
             * ‼️ X-196 — A THIN CELL IS A BUG. `20m` and a full date each imply
             * three or four figures the row already knows, and every one of
             * them was a click away on the task row. A CELL HOVER IS FIGURES,
             * never an explanation — the column is defined once, on its `<th>`.
             */
            const took = mins === null
                ? window.AFTip.cell('', '', '<span class="dim">—</span>', 'Not finished',
                    window.AFTip.lines([
                        'status: ' + r.status,
                        'opened: ' + sentryWhen(r.createdAt),
                        'running for: ' + Math.max(0, Math.round((Date.now() - r.createdAt) / 60000)) + 'm'
                    ]))
                : window.AFTip.cell('', '', mins + 'm', 'How long this round ran',
                    window.AFTip.lines([
                        'opened: ' + sentryWhen(r.createdAt),
                        'ended: ' + sentryWhen(r.endedAt),
                        'took: ' + (mins >= 60 ? Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm' : mins + 'm'),
                        'status: ' + r.status
                    ]));
            return `<tr class="mrow" data-sround="${C.esc(r.id)}">
                <td>${C.esc(r.title)}</td>
                ${sentryWhyCell(r)}
                <td><span class="mchip ${cls}">${C.esc(r.status)}</span></td>
                <td>${r.account ? C.esc(r.account) : '<span class="dim">main sign-in</span>'}</td>
                <td>${C.esc(sentryWhen(r.createdAt))}</td>
                ${took}
            </tr>`;
        }).join('');
        // ‼️ X-196 — EVERY COLUMN IS DEFINED ONCE, HERE. A `<th>` with no title
        // is a column the reader has to infer from four rows of examples.
        return `<table class="mtable"><thead><tr>
            <th title="The row this round ran as. A sentry round is an ORDINARY task: the same runner opens it, the same terminal watches it, the same cancel button ends it.">Round</th>
            <th title="Why this round opened on the words it did. L = a leader turn chose them. M = a template filled itself in and no model was asked. M! = the leader WAS asked and gave nothing usable, which is the only case that spends money without buying words. Hover the cell for the conditions that fired, the diagnosis and what the turn cost.">Why</th>
            <th title="Where the round's own task row got to. A sentry round is an ordinary task, so these are the ordinary task words: queued, running, done, failed, cancelled. FAILED is not the same as barren — a round can finish cleanly and still change nothing, and it is the barren ones that feed the failure brake.">Status</th>
            <th title="The captured sign-in the round spent. Empty means the main sign-in — the absence of a slot IS the main account.">Account</th>
            <th title="When the round's task row was created, which is the moment the campaign decided on it. The session itself starts a beat later.">Opened</th>
            <th title="Wall-clock minutes from the row being opened to it ending — not model time, and not time spent working. A round still on the board says so instead of showing a running figure that would be stale the moment it was drawn.">Took</th></tr></thead><tbody>${rows}</tbody></table>`;
    }

    /**
     * ‼️ X-194 — THE CONDITION EDITOR, FED BY THE DICTIONARY.
     *
     * Every list in here comes from `core/sentryPolicy.ts` over `DATA.sentry`
     * (`policyFields`, `policyOperators`, `policyPresets`). Nothing about a
     * field is written on this page, so a fact the round learns to measure
     * turns up in the editor the day it is added and this function does not
     * change — which is what "the conditions must not be a narrow mould" means
     * in code rather than in a promise.
     */
    function policyFields(s) { return (s.policyFields || []); }
    function policyOps(s) { return (s.policyOperators || []); }
    function fieldSpec(s, name) { return policyFields(s).find(f => f.field === name) || null; }
    /** The operators this field's TYPE admits — never the whole list. Offering
     *  "is more than" on a boolean is offering a condition that cannot hold. */
    function opsFor(s, name) {
        const f = fieldSpec(s, name);
        return policyOps(s).filter(o => !f || (o.types || []).indexOf(f.type) >= 0);
    }

    /** Are two condition sets the same question? Compared by VALUE, because the
     *  page must be able to say "hybrid" again when an edit is undone. */
    // ‼️ THE VALUE IS COMPARED AS A WORD, not as its type. A box hands back a
    // string, so the `0` a preset declares and the `"0"` the same untouched box
    // reads back are ONE question — and comparing them by type made the strip
    // say "custom · from hybrid" the first time anything on the form was typed
    // into, which is the label lying about a set nobody had edited.
    // ‼️ AND A GROUP IS COMPARED BY ITS PARTS. Reading only field/operator/value
    // would make every group normalise to the same empty triple, so two
    // different groups would be "the same question" and the strip would go on
    // saying Hybrid over a set nobody could recognise.
    const condOne = (x) => Array.isArray(x.all)
        ? ['&'].concat(x.all.map(condOne))
        : [x.field || '', x.operator || '',
            (x.value === undefined || x.value === null) ? '' : String(x.value)];
    const condNorm = (list) => JSON.stringify((list || []).map(condOne));
    function sameConditions(a, b) { return condNorm(a) === condNorm(b); }

    /** ‼️ WHICH MODE THIS REALLY IS — worked out, never remembered. The preset
     *  the user pressed is only a label; what runs tonight is the condition
     *  set, so the label is derived from it on every paint. */
    function sentryMode(s) {
        if (sentryForm.preset === null) { return { id: null, from: null }; }
        const sets = s.policyPresetConditions || {};
        for (const p of (s.policyPresets || [])) {
            if (sameConditions(sentryForm.conditions, sets[p.id])) { return { id: p.id, from: null }; }
        }
        return { id: CUSTOM, from: sentryForm.preset };
    }

    /** A condition's own words, for the row's hover and for the summary. */
    function conditionLine(s, c) {
        const f = fieldSpec(s, c.field);
        const o = policyOps(s).find(x => x.id === c.operator);
        return [c.field || '(no field)', o ? o.label : (c.operator || '?'),
            (o && o.takesValue) ? String(c.value === undefined ? '' : c.value) : '']
            .filter(x => String(x).length).join(' ')
            + (f ? '\n\n' + f.describe : '');
    }

    /**
     * ‼️ X-194 — WHAT THIS FIELD READS RIGHT NOW.
     *
     * The host sends one flat map, derived by running the evaluator's own
     * reader over the dictionary (`factsSnapshot`), so the figure on the row is
     * the figure the verdict is compared against — the two cannot drift because
     * there is only one reader. `null` here is not "zero": it is a form opened
     * before any round has ever been measured, and the row says so, because a
     * blank next to `repo.dirty` reads as a clean repository.
     */
    function policyFacts(s) {
        const f = s.policyFacts;
        return (f && typeof f === 'object') ? f : null;
    }
    /**
     * ‼️ A NAME NOBODY ELSE IS USING. The verdict NAMES the conditions that
     * fired and the row's mark is looked up by that name, so two rows sharing a
     * handle answer for each other. A count is not a name: drop the third of
     * five and the next one added would be `c5` all over again.
     */
    function freeConditionId() {
        const used = {};
        eachCondition(c => { used[String(c.id || '')] = 1; });
        let n = sentryForm.conditions.length + 1;
        while (used['c' + n]) { n += 1; }
        return 'c' + n;
    }
    /** Every condition on the form, parts included — one walk, one meaning. */
    function eachCondition(fn) {
        sentryForm.conditions.forEach(c => {
            if (Array.isArray(c.all)) { c.all.forEach(fn); } else { fn(c); }
        });
    }
    /**
     * ‼️ A PATH, NOT AN INDEX. `"2"` is the third line; `"2.1"` is the second
     * part of its AND group. Every control on a row carries this string, so
     * reading the form back, repairing a row and marking one are the same code
     * whether the row is a plain condition or a part.
     */
    function condAt(path) {
        const p = String(path === undefined ? '' : path).split('.');
        const top = sentryForm.conditions[Number(p[0])];
        if (!top) { return null; }
        if (p.length < 2) { return Array.isArray(top.all) ? null : top; }
        return (top.all || [])[Number(p[1])] || null;
    }
    /** SHORTHAND: the shortest unambiguous form on the row; the panel has the rest. */
    function readingShort(v) {
        if (v === true || v === false) { return String(v); }
        if (typeof v === 'number') { return String(v); }
        const t = String(v ?? '');
        if (!t.length) { return '(empty)'; }
        return t.length > 24 ? t.slice(0, 23) + '…' : t;
    }
    /**
     * ‼️ X-194 — ONE ROW, WHEREVER IT SITS.
     *
     * `i` is a PATH, not an index: `"2"` is the third condition and `"2.1"` is
     * the second part of its AND group. One string addresses both, so the field
     * box, the reading, the read-back and the repair are the same code for a
     * plain condition and for a part — and a group cannot quietly grow a second
     * kind of row that behaves differently.
     *
     * `o.own` is the group's own controls (↑ ↓ ✕) — a part does not get them,
     * because moving a part above the row it is ANDed with means nothing.
     */
    function conditionRowHtml(s, c, i, o0) {
        const o = o0 || {};
        const ops = opsFor(s, c.field);
        const opSpec = policyOps(s).find(x => x.id === c.operator);
        const f = fieldSpec(s, c.field);
        // ‼️ A FIELD THE DICTIONARY NO LONGER NAMES IS KEPT AND SAID. Dropping
        // it would leave the box showing whatever sits first in the list and
        // report a condition nobody wrote — the same rule the settings page
        // applies to a stored value its enum has forgotten.
        const gone = c.field && !f;
        const fieldOpts = (gone ? [C.option(c.field, '⚠ ' + c.field, {
            selected: true,
            detail: 'Nothing measures this any more, so the condition can never hold. Pick another field or drop the row.'
        })] : []).concat(policyFields(s).map(x =>
            C.option(x.field, x.field, { selected: x.field === c.field, detail: x.describe }))).join('');
        const opOpts = ops.map(x => C.option(x.id, x.label, {
            selected: x.id === c.operator,
            detail: x.takesValue ? '' : 'Takes no value — the field itself is the whole question.'
        })).join('');
        // The value box follows the FIELD's type: a closed set gets a picker,
        // a number gets a number box, and an operator that takes no value gets
        // no box at all rather than one that is ignored.
        const takes = !opSpec || opSpec.takesValue;
        const valBox = !takes
            ? '<span class="scond-nov muted small">no value</span>'
            : (f && f.type === 'enum' && (f.values || []).length
                ? `<select class="scond-v" data-si="${i}">${(f.values || []).map(v =>
                    C.option(v, v === '' ? '(empty)' : v, { selected: String(c.value ?? '') === v })).join('')}</select>`
                : `<input class="scond-v" data-si="${i}" type="${f && f.type === 'number' ? 'number' : 'text'}"
                        value="${C.esc(c.value === undefined ? '' : c.value)}" placeholder="value">`);
        // ‼️ WHAT THIS FIELD HOLDS TODAY, ON THE ROW. Without it the user is
        // writing a rule against a number they cannot see, and the click that
        // would show it is the click DENSITY forbids. The mark beside it is the
        // HOST's answer — this page never works out whether a condition holds.
        const facts = policyFacts(s);
        const known = !!facts && f && Object.prototype.hasOwnProperty.call(facts, c.field);
        const now = known ? facts[c.field] : undefined;
        // ‼️ THE MARK BELONGS TO THE WHOLE LINE, so a part never carries one:
        // the host judges top-level conditions, and a group holds only when
        // EVERY part does. A tick on part two of a group that does not hold
        // would be a true fact read as the wrong answer.
        const holds = o.markable !== false && PROBE && Array.isArray(PROBE.hits)
            ? PROBE.hits[Number(String(i).split('.')[0])] === true : false;
        const asOf = s.policyFactsAt ? elapsed(Number(s.policyFactsAt)) + ' ago' : 'the last round';
        const reading = !known
            ? `<span class="scond-now muted" data-snow="${i}">not measured yet</span>`
            : `<span class="scond-now${holds ? ' scond-hit' : ''}" data-snow="${i}"`
                + ` data-snowv="${C.esc(String(now))}"${holds ? ' data-sholds="1"' : ''}>`
                // ‼️ "now" IS PART OF THE SHORTEST UNAMBIGUOUS FORM. A bare `3`
                // beside a value box holding `0` reads as a second field, and a
                // second field on that row looks editable.
                + `now ${C.esc(readingShort(now))}</span>`;
        const readTip = !known
            ? window.AFTip.wrap(reading, 'Nothing measured yet',
                'No round has ended since this campaign was set up, so there is no reading to '
                + 'compare against. The condition is still valid — it is judged the first time a '
                + 'round finishes.')
            : window.AFTip.wrap(reading,
                `${c.field} = ${readingShort(now)}`,
                `Measured ${asOf}, on the round that ended last.\n\n`
                + (String(now ?? '').length > 24 ? `Full reading:\n${String(now)}\n\n` : '')
                + (holds
                    ? '‼️ This condition HOLDS against that reading — a round ending like the last one wakes the leader on this line.'
                    : 'This condition does not hold against that reading.')
                + (f ? '\n\n' + f.describe : ''));
        // The line's own controls. A part is offered only its own ✕; the empty
        // spans keep the grid's columns lined up, because every row is its own
        // grid and a missing cell moves every button after it.
        const top = o.top === undefined ? Number(i) : o.top;
        const tools = o.markable === false
            ? `<span></span><span></span><span></span>
               <button type="button" class="chip" data-sdelp="${i}" title="${C.esc('Drop this AND part. '
                + 'Take the last one away and the line goes back to being a plain condition.')}">✕</button>`
            : `<button type="button" class="chip" data-sand="${top}" title="${C.esc('Add an AND part to this line. '
                + 'Conditions are ORed; the parts of ONE line are ANDed, so a line with parts holds only when every '
                + 'one of them does — "the repo is dirty AND the item did not close" is a real night, either half '
                + 'alone is an ordinary one.')}">+ and</button>
               <button type="button" class="chip" data-sup="${top}"${top === 0 ? ' disabled' : ''} title="Move this line up. Conditions are ORed, so the order is what the verdict NAMES first.">↑</button>
               <button type="button" class="chip" data-sdn="${top}"${top === sentryForm.conditions.length - 1 ? ' disabled' : ''} title="Move this line down.">↓</button>
               <button type="button" class="chip" data-sdel="${top}" title="${o.group ? 'Drop this line and every part of it.' : 'Drop this condition.'}">✕</button>`;
        return `<div class="scond${o.markable === false ? ' scond-part' : ''}" data-scond="${i}" data-scondid="${C.esc(c.id || '')}">
            ${o.markable === false
                ? `<span class="scond-amp" title="${C.esc('Every part of this line must hold. The lines '
                    + 'themselves are ORed — any ONE of them wakes the leader.')}">and</span>`
                // ‼️ The cell is drawn EMPTY rather than left out: every row is
                // its own grid, so a missing first cell shifts every control on
                // that line and the columns stop being columns.
                : '<span class="scond-amp"></span>'}
            <select class="scond-f" data-si="${i}" title="${C.esc('Which measured fact this asks about.')}">${fieldOpts}</select>
            <select class="scond-o" data-si="${i}" title="${C.esc('How it is compared. Only the operators this field\'s type admits are offered.')}">${opOpts}</select>
            ${valBox}
            ${readTip}
            ${tools}
        </div>`;
    }

    /**
     * ‼️ X-207 — WHICH ACCOUNTS THIS CAMPAIGN IS ALLOWED TO SPEND.
     *
     * The user's complaint in their own words: a campaign rotated across EVERY
     * account of its engine, and there was nowhere to say "not that one". The
     * control is therefore a permission list, not a preference: with anything
     * ticked, no other account is touched for as long as the campaign runs.
     *
     * ‼️ EVERY ENGINE'S ACCOUNTS ARE OFFERED TOGETHER, because a pool may cross
     * engines by design — three Claude sign-ins and two Codex ones are ONE pool
     * of five, and the round opens on whichever engine the chosen account
     * belongs to. Filtering this list by the campaign's engine would hide the
     * choice the item exists to offer.
     *
     * ‼️ AND THE ORDER IS PART OF THE ANSWER. `tiered` walks engines in the
     * order they first appear in the pool, so the tick order is drawn (1. 2. 3.)
     * rather than left invisible: an input the user cannot see is not an input.
     */
    function sentryPoolHtml(s) {
        const all = s.accountPool || [];
        if (!all.length) { return ''; }
        const picked = sentryForm.pool || [];
        // ‼️ AN ACCOUNT NOBODY HAS READ IS USABLE, so it must not be drawn as a
        // zero — `slotIsUsable` lets it run and the ceiling never rules it out.
        // "not read" and "0%" are opposite facts and would read as the same one.
        const room = (a) => (a.percent === null || a.percent === undefined
            ? 'not read' : a.percent + '%');
        const engines = [];
        for (const a of all) { if (!engines.includes(a.engine)) { engines.push(a.engine); } }
        /** The window's name at the head of a line — the reading's own word, with
         *  the capital a heading takes. `windowPhrase` is the same name for the
         *  middle of a sentence; neither of them decides what it is called. */
        const windowHead = (a) => {
            const n = window.AFAccount.windowPhrase(a) || 'window';
            return n.charAt(0).toUpperCase() + n.slice(1);
        };
        const chip = (a) => {
            const at = picked.indexOf(a.id);
            const on = at >= 0;
            return window.AFTip.wrap(
                `<button type="button" class="chip spool-chip${on ? ' on' : ''}" data-spool="${C.esc(a.id)}">`
                + (on ? `<b class="spool-n">${at + 1}.</b> ` : '')
                + `${C.esc(a.label || a.id)} <span class="spool-pct">${C.esc(room(a))}</span></button>`,
                `${a.label || a.id} — ${engineName(a.engine) || a.engine}`,
                (on
                    ? `Picked ${at + 1}${at === 0 ? 'st' : at === 1 ? 'nd' : at === 2 ? 'rd' : 'th'} in the pool. `
                        + 'Under the tiered strategy the pool order decides which engine is tried first.'
                    : 'Not in the pool. While the pool has anything in it, this account is never touched.')
                // ‼️ audit B-04.3 — THE SEVENTH COPY, and the one the first sweep
                // missed because it had a capital F. It sat over a pool of BOTH
                // engines: the Codex chip beside it read 41% under the words
                // "Five-hour window", and that account's window is a week.
                + '\n\n' + windowHead(a) + ': ' + (a.percent === null || a.percent === undefined
                    ? 'nobody has read it. That does NOT block it — an allowance this engine does not '
                        + 'publish is not an allowance that is spent, so the account stays usable.'
                    : a.percent + '% used, ' + (100 - a.percent) + '% left.')
            );
        };
        const groups = engines.map(e => `<div class="spool-eng">`
            + `<span class="spool-engname">${C.esc(engineName(e) || e)}</span>`
            + all.filter(a => a.engine === e).map(chip).join('')
            + '</div>').join('');

        // ‼️ MIRROR — the control is empty by design and empty means something
        // specific. A reader who cannot tell "no pool" from "a pool I chose"
        // cannot tell whether tonight will touch the account they were keeping.
        const crossing = new Set(picked
            .map(id => (all.find(a => a.id === id) || {}).engine).filter(Boolean));
        const head = window.AFTip.wrap(
            '<span class="flabel">Account pool</span>',
            picked.length
                ? `Now: ${picked.length} account${picked.length === 1 ? '' : 's'} allowed`
                    + (crossing.size > 1 ? ` across ${crossing.size} engines` : '')
                : 'Now: no account ticked',
            (picked.length
                ? 'ONLY these accounts are spent, in this order. Nothing else on this machine is '
                    + 'touched by the campaign, whatever room it has.\n\n'
                    + picked.map((id, i) => {
                        const a = all.find(x => x.id === id);
                        return `${i + 1}. ${a ? (a.label || a.id) + ' — ' + (engineName(a.engine) || a.engine)
                            + ', ' + room(a) : id + ' — not captured any more'}`;
                    }).join('\n')
                : 'Now: no account ticked, so every account of the campaign\'s engine is in play — '
                    + 'which is exactly what campaigns did before this control existed.\n\n'
                    + 'Tick accounts to turn the pool into a WHITELIST: the campaign then spends those '
                    + 'and nothing else. They may belong to different engines; each round opens on the '
                    + 'engine of the account it picked.'));

        const rot = sentryForm.rotation || '';
        const rotChip = (id, label, why) => window.AFTip.wrap(
            `<button type="button" class="chip${rot === id || (!rot && id === 'free') ? ' on' : ''}" `
            + `data-srot="${C.esc(id)}">${C.esc(label)}</button>`,
            label + ((rot === id || (!rot && id === 'free')) ? ' — this is what will run' : ''), why);
        const oneEngine = crossing.size < 2;
        const rotHead = window.AFTip.wrap(
            '<span class="flabel">Rotation</span>',
            'Now: ' + (rot === 'tiered' ? 'tiered' : 'free pool')
                + (rot ? '' : ' — the default, because nothing was asked for'),
            oneEngine
                ? 'The pool holds one engine, so the two strategies do the same thing: the account with '
                    + 'the most room goes next either way. Tick accounts of a second engine and the '
                    + 'choice starts to matter.'
                : 'With two engines in the pool this is the difference between spending whatever is '
                    + 'cheapest and keeping to your main engine until it is actually walled.');

        return `<div class="spool">
            <div class="srow spool-head">${head}${groups}</div>
            <div class="srow spool-rot">
                ${rotHead}
                ${rotChip('free', 'Free pool',
            'Whichever account has the most room goes next, whatever engine it belongs to. A measured '
            + 'account always beats one nobody has read.')}
                ${rotChip('tiered', 'Tiered',
            'One engine at a time, in the pool\'s own order with the campaign\'s engine first. The '
            + 'campaign crosses to the next engine only when EVERY account of the current one is at or '
            + 'above the ceiling — instead of sleeping until a reset while a signed-in account sits '
            + 'idle. Every engine walled still sleeps, and it wakes at the earliest reset in the whole '
            + 'pool, which is sooner than one engine\'s.')}
            </div>
        </div>`;
    }

    /**
     * ‼️ THE MODE SELECTOR AND WHAT IT ACTUALLY DOES.
     *
     * Three buttons, not three code paths: pressing one FILLS the condition set
     * from the dictionary. Touching a condition afterwards makes the mode
     * `custom` and the strip goes on saying which preset it came from, because
     * "hybrid" over five edited conditions is a label that lies about what will
     * run tonight.
     */
    function sentryPolicyHtml(s) {
        const presets = s.policyPresets || [];
        if (!presets.length) { return ''; }
        const mode = sentryMode(s);
        const chip = (p) => window.AFTip.wrap(
            `<button type="button" class="chip${mode.id === p.id ? ' on' : ''}" data-spreset="${C.esc(p.id)}">${C.esc(p.label)}</button>`,
            `${p.label}${mode.id === p.id ? ' — this is what will run' : ''}`,
            p.describe + '\n\nPressing this REPLACES the conditions below with its own set. '
            + 'Edit any of them afterwards and the mode becomes "custom", still saying which preset it grew out of.');
        const none = window.AFTip.wrap(
            `<button type="button" class="chip${mode.id === null ? ' on' : ''}" data-spreset="">Not set</button>`,
            mode.id === null ? 'Nothing asked for — this is what will run' : 'Ask for no mode at all',
            'No policy is written for the campaign at all, so the round\'s own default decides — which is what '
            + 'every campaign started before this control existed did. It is NOT the same as Mechanical: '
            + 'mechanical is a decision, this is the absence of one.');
        const custom = mode.id === CUSTOM
            ? `<span class="schip-custom" title="${C.esc('Edited by hand, from the ' + (mode.from || '?')
                + ' set. The label is derived from the conditions on every paint, so undoing an edit says '
                + (mode.from || '?') + ' again by itself.')}">custom · from ${C.esc(mode.from || '?')}</span>`
            : '';
        // ‼️ A LINE IS EITHER ONE CONDITION OR AN AND GROUP, and both draw the
        // same row. The group's own controls live on its FIRST part, because
        // that row IS the line; the parts after it carry nothing but their own
        // ✕, since moving a part above the row it is ANDed with means nothing.
        const rows = sentryForm.conditions.length
            ? sentryForm.conditions.map((c, i) => Array.isArray(c.all)
                ? `<div class="scondg" data-scondg="${i}">` + c.all.map((p, k) =>
                    conditionRowHtml(s, p, i + '.' + k, { top: i, group: true, markable: k === 0 })).join('')
                    + '</div>'
                : conditionRowHtml(s, c, String(i), { top: i })).join('')
            : `<div class="muted small scond-empty">${mode.id === 'mechanical'
                ? 'No condition — every round\'s prompt is built from a template. Zero tokens, zero thinking.'
                : 'No condition yet: with none of them holding, every round stays mechanical.'}</div>`;
        // ‼️ WHAT THIS SET MEANS, IN ONE SENTENCE, WHERE THE DECISION IS MADE.
        // Conditions are ORed and each row's own `all` group is ANDed — a rule
        // nobody can infer from a stack of rows, and the one thing that decides
        // whether a night is a thinking night or a template night.
        const grouped = sentryForm.conditions.filter(c => Array.isArray(c.all)).length;
        const summary = sentryForm.conditions.length
            ? `Any ONE of these ${sentryForm.conditions.length} wakes the leader for that round; `
                + 'none of them and the round is built from a template.'
                + (grouped ? ' A line with AND parts holds only when every part of it does.' : '')
            : '';
        // ‼️ AND WHAT THAT MEANS TONIGHT, in the one sentence the whole editor
        // is for. The verdict is the HOST's — the same `evaluateSentryPolicy`
        // the round will run — read against the readings on the rows above, so
        // the user can see the answer before spending a night finding it out.
        const facts = policyFacts(s);
        const asOf = facts && s.policyFactsAt
            ? `<span class="spolicy-asof muted small" title="${C.esc('Every reading on the rows above comes from the round that ended last, '
                + 'measured by the same reader the verdict uses. A campaign that has never run a round has nothing to read.')}"
                >readings from the round that ended ${C.esc(elapsed(Number(s.policyFactsAt)))} ago</span>`
            : (facts ? '<span class="spolicy-asof muted small">readings from the round that ended last</span>' : '');
        const tonight = (PROBE && sentryForm.conditions.length)
            ? `<span class="spolicy-verdict${PROBE.verdict === 'leader' ? ' on' : ''}" title="${C.esc(
                (PROBE.why || '') + (PROBE.problems && PROBE.problems.length
                    ? '\n\nCould not be judged: ' + PROBE.problems.join(' · ') : ''))}">${
                PROBE.verdict === 'leader'
                    ? 'A round ending like the last one would wake the leader'
                        + (PROBE.fired && PROBE.fired.length ? ' — ' + C.esc(PROBE.fired.join(', ')) : '')
                    : 'A round ending like the last one would stay mechanical'}</span>`
            : '';
        return `<div class="spolicy">
            <div class="srow spolicy-head">
                <span class="flabel">Mode</span>
                ${none}${presets.map(chip).join('')}${custom}
            </div>
            <div class="scond-list">${rows}</div>
            <div class="srow scond-tools">
                <button type="button" class="chip" id="s-condadd"${policyFields(s).length ? '' : ' disabled'}
                    title="Add one more condition. They are ORed: any one of them holding wakes the leader.">+ condition</button>
                <span class="muted small">${C.esc(summary)}</span>
                ${tonight}${asOf}
            </div>
        </div>`;
    }

    /**
     * ‼️ X-194 — WHAT THE LEADER MAY SPEND, FOR THIS CAMPAIGN.
     *
     * Three boxes, all optional, all empty by default — and empty is the honest
     * state, because it means "whatever the settings say". So MIRROR is not a
     * nicety here but the only way the row is readable at all: a box showing
     * nothing has to say, on the first line of its own panel, the figure that is
     * IN FORCE right now. Without it the reader cannot tell an unset purse from
     * a purse of zero, and one of those two switches the leader off.
     *
     * Drawn only when the host says what the settings hold; a MIRROR with
     * nothing to mirror would be three boxes that mean nothing.
     */
    /**
     * ‼️ X-249 — THE SIGN-INS THE LEADER TURN MAY BE PINNED TO.
     *
     * Read from `s.accountPool`, the SAME list the pool chips above are drawn
     * from, so the two controls on one card cannot name different accounts.
     * Narrowed to the engine the leader runner actually spawns (`d.engine`),
     * because an account belongs to one engine and a slot of another names a
     * directory that engine never reads.
     *
     * ‼️ THE MACHINE'S OWN SIGN-IN IS DELIBERATELY NOT OFFERED. It is what the
     * turn used to reach by accident, and it is by definition outside the pool
     * the campaign was given — putting it back under a nicer name would reopen
     * the hole this item closed. Empty means the pool decides, which is an
     * answer inside the pool.
     *
     * No accounts for that engine draws no box: a control with no referent is
     * not drawn.
     */
    /**
     * ‼️ X-249 (2/n) — THE ENGINE IN FORCE FOR THE LEADER, in one place.
     *
     * It was `d.engine` read straight — right while the engine was a constant,
     * and wrong the moment it became a choice: the model catalogue and the
     * account list are both cut by it, and a form that offered one engine's
     * models beside another engine's sign-ins would be drawing a setup that
     * cannot launch. `d.engine` is now what the SETTING says, so the box in
     * front of the reader wins over it.
     */
    function leaderEngineOf(d) {
        return String(sentryForm.leaderEngine || (d && d.engine) || '').trim();
    }
    function leaderEngineOpts(d) {
        // A choice of ONE is not a choice: the box is not drawn until a second
        // adapter has really been measured, at which point it appears by itself.
        const list = ((d && d.engines) || []).filter(Boolean);
        if (list.length < 2) { return ''; }
        const sel = sentryForm.leaderEngine;
        return [C.option('', '— setting: ' + (d.engine || 'unset') + ' —', {
            selected: !sel,
            detail: 'Nothing named here, so the agentFarm.sentryLeaderEngine setting decides — '
                + 'including when you change it tomorrow.'
        })].concat(list.map(e => C.option(e, e, {
            selected: e === sel,
            detail: 'This engine publishes a one-shot turn Agent Farm can both spawn AND read. '
                + 'An engine missing from this list is refused by name rather than run.'
        }))).join('');
    }
    function leaderAccountRows(s, d) {
        const eng = String(leaderEngineOf(d) || '').trim().toLowerCase();
        return (s.accountPool || []).filter(a => a && a.id
            && (!eng || String(a.engine || '').trim().toLowerCase() === eng));
    }
    function leaderAccountOpts(s, d) {
        const rows = leaderAccountRows(s, d);
        if (!rows.length) { return ''; }
        const sel = sentryForm.leaderAccount;
        return [C.option('', '— the pool decides —', {
            selected: !sel,
            detail: 'The account the campaign\'s next round would open on answers. That keeps the '
                + 'deciding turn inside the accounts you allowed, where the ceiling applies and the '
                + 'rotation can see what it spent.'
        })].concat(rows.map(a => C.option(a.id,
            (a.health && a.health !== 'ready' ? '⚠ ' : '') + (a.label || a.id), {
            selected: a.id === sel,
            detail: (a.percent === null || a.percent === undefined
                ? 'Nobody has read this account\'s window yet.'
                // audit B-04.3 — named by the reading, the same as everywhere else.
                : a.percent + '% of its ' + (window.AFAccount.windowPhrase(a) || 'window') + ' is used.')
                + (a.health && a.health !== 'ready'
                    ? '\n\nThis slot needs signing in again before it can pay for a turn.' : '')
        }))).join('');
    }
    /** MIRROR: what the box holds now, in the first line of its own panel. */
    function leaderAccountMirror(s, d) {
        const sel = sentryForm.leaderAccount;
        if (!sel) { return 'the pool decides — the account the next round would open on'; }
        const row = leaderAccountRows(s, d).find(a => a.id === sel);
        return row ? (row.label || row.id) : sel + ' — not captured any more';
    }

    function sentryLeaderHtml(s) {
        const d = (s.defaults || {}).leader;
        if (!d) { return ''; }
        const usd = (v) => '$' + String(v);
        /**
         * ‼️ X-250 — `opts` MAKES IT A SELECT. A model is chosen from a list an
         * engine publishes, not typed; the box that let it be typed sat over a
         * `<datalist>`, and U-97 measured what that costs (Chromium anchors the
         * popup on the flex PARENT, so the second press draws the list at the
         * far left of the row). The money boxes stay inputs — a purse is a
         * number nobody publishes a catalog for.
         */
        const box = (id, key, head, body, extra, opts) => window.AFTip.wrap(
            opts !== undefined
                ? `<label class="lcap">${C.esc(head.label)}<select id="${id}">${opts}</select></label>`
                : `<label class="lcap">${C.esc(head.label)}<input id="${id}"${extra || ''}
                placeholder="${C.esc(String(head.now))}"
                value="${C.esc(sentryForm[key])}"></label>`,
            // MIRROR: the value in force, first, before any explanation.
            `Now: ${head.mirror}`,
            (String(sentryForm[key]).trim()
                ? 'This campaign will use what you have typed, whatever the setting says later.\n\n'
                : 'Empty, so the setting decides — including when you change it tomorrow.\n\n')
            + body);
        return `<div class="srow sleader">
            <span class="flabel" title="${C.esc('What the LEADER turn may spend on this campaign. '
                + 'It is not the round\'s own model or budget: the leader is the short, cheap turn that '
                + 'decides what the next round should say, and it only runs at all when a condition above holds.')}">Leader</span>
            ${leaderEngineOpts(d) ? box('s-lengine', 'leaderEngine',
                { label: 'Engine', now: d.engine,
                    mirror: (sentryForm.leaderEngine || d.engine)
                        + (sentryForm.leaderEngine ? '' : ' — what the setting says') },
                'Which engine the leader turn spawns. It used to be a constant, and honestly '
                + 'so: the runner could build one command line and read one reply envelope, so a '
                + 'box over it would have been a box that lies. Both halves are the engine’s own '
                + 'adapter now.\n\nIt also decides which catalogue the Model box below offers and '
                + 'which sign-ins the Account box can name — an engine reads only its own.',
                '', leaderEngineOpts(d)) : ''}
            ${box('s-lmodel', 'leaderModel',
                { label: 'Model', now: d.model || 'engine default', mirror: d.model || 'the engine default' },
                'The leader turn is short and mechanical work — the constitution\'s own cost rule is that '
                + 'an unattended loop does not run on an expensive model. Raise it deliberately, having read the figure beside it.',
                /* extra input attrs: none, this box is a select */ '',
                // ‼️ THE ENGINE IS THE HOST'S ANSWER, NOT A WORD TYPED HERE. `d.engine`
                // is the engine the leader runner can actually spawn; a page that spelt
                // it would be a second copy of that fact, and X-249 is about to make it
                // a choice — at which point this line needs no edit.
                // SHORTHAND: the empty option carries the figure in force, because a
                // select has no placeholder and the reader must not have to open it.
                modelOptsFor(leaderEngineOf(d), sentryForm.leaderModel,
                    '— setting: ' + (d.model || 'engine default') + ' —'))}
            ${leaderAccountOpts(s, d) ? box('s-laccount', 'leaderAccount',
                { label: 'Account', now: 'the pool decides', mirror: leaderAccountMirror(s, d) },
                'The leader is the turn that decides WHERE the next round runs, and it once ran '
                + 'nowhere in particular: the process was spawned with no environment, so it went to '
                + 'whatever sign-in this machine happened to be holding — outside the pool you allowed, '
                + 'invisible to the rotation, and able to wall the very account it was about to choose.\n\n'
                + 'Empty means the CAMPAIGN\'S POOL answers: the same account the next round would open '
                + 'on. Name one only when you want the deciding turn kept off the account doing the work.',
                '', leaderAccountOpts(s, d)) : ''}
            ${box('s-lday', 'leaderDailyUsd',
                { label: 'Daily $', now: d.dailyUsd, mirror: usd(d.dailyUsd) + ' a day' },
                'Dollars per calendar day, for THIS campaign. When it is gone the leader stops waking and '
                + 'the campaign carries on mechanically — it is never a reason to stop the night.',
                ' type="number" min="0" step="0.5"')}
            ${box('s-lmax', 'leaderMaxUsd',
                { label: 'Per turn $', now: d.maxUsd, mirror: usd(d.maxUsd) + ' a turn' },
                'What one leader turn may cost before the NEXT one is refused. A turn already running is '
                + 'never cut off half way: the ceiling is read before the money is spent, not during.',
                ' type="number" min="0" step="0.05"')}
        </div>`;
    }

    /**
     * ‼️ X-196 — A FORM LABEL WHOSE EXPLANATION IS AN AFTip, NOT A `title`.
     *
     * Every one of these carried two or three sentences inside a native
     * `title`: a tooltip that arrives after a second, cannot be scrolled, is
     * cut by the platform at a length nobody controls, and vanishes if the
     * pointer travels into it. The rule has a name for exactly this — anything
     * that IS text, or could grow into text, is an AFTip; a native `title`
     * carries a handful of figures and nothing else.
     */
    const tipLabel = (inner, head, body, cls) => window.AFTip.label(
        cls || '', '', inner, head, Array.isArray(body) ? window.AFTip.lines(body) : body);

    /**
     * ‼️ X-196 — MIRROR, ON A BOX WHOSE EMPTINESS MEANS SOMETHING.
     *
     * These boxes are empty BY DESIGN and empty means "the setting decides", so
     * the reader cannot tell an unset ceiling from a ceiling they typed at the
     * same number — and only one of those two is a choice they made. The
     * panel's first line is therefore the figure in force AND where it comes
     * from, which is what MIRROR asks of any control that draws less than it
     * means.
     */
    const mirrorNum = (val, dflt, unit, long) => {
        const own = String(val === undefined || val === null ? '' : val).trim();
        const d = String(dflt === undefined || dflt === null ? '' : dflt).trim();
        return window.AFTip.lines([
            own
                ? `Now: ${own}${unit} — this campaign's own`
                : (d
                    ? `Now: ${d}${unit} — the setting's default, because this box is empty`
                    : 'Now: nothing — neither this box nor the setting names a figure'),
            window.AFTip.GAP,
            long
        ]);
    };

    const engineName = (id) =>
        ((DATA.engines || []).find(e => e.id === id) || {}).label || id || '';
    /** A-12.8 — the NAME behind an id, for a MIRROR line on a box that cuts it. */
    const listName = (list, id) =>
        !id ? '' : (((list || []).find(x => x.id === id) || {}).name || id);
    const permName = (s, id) => {
        const m = (s.permissionModes || []).find(x => x.id === id);
        return m ? m.label : '';
    };

    function sentryFormHtml(s) {
        // U-130 — four of these boxes share one row and every one of them cuts
        // the name inside it, so the name goes on the option itself.
        const opt = (list, sel, idKey, nameKey) => (list || []).map(x =>
            C.option(x[idKey], x[nameKey], {
                selected: x[idKey] === sel,
                detail: x.detail || x.dir || (x[nameKey] === x[idKey] ? '' : x[idKey])
            })).join('');
        return `<div class="sform">
            ${sentryErr ? `<div class="formerr">${C.esc(sentryErr)}</div>` : ''}
            <div class="srow">
                ${tipLabel(
                    `Project<select id="s-project">${C.option('', '— pick one —', { selected: !sentryForm.project, detail: 'A sentry campaign is filed under a project; nothing runs until one is named.' })}
                    ${opt(DATA.projects, sentryForm.project, 'id', 'name')}</select>`,
                    'Whose backlog the rounds are taken from',
                    [
                        // ‼️ A-12.8 — MIRROR, ON THE THREE BOXES THE SWEEP MISSED.
                        // Four boxes share this row and every one of them cuts the
                        // name inside it, so none can be read for its own value.
                        // X-196 gave Engine, Permissions and the three numbers a
                        // panel; Project, Runs as and Model stayed plain labels.
                        'Now: ' + (listName(DATA.projects, sentryForm.project)
                            || 'nothing named, so nothing can start'),
                        window.AFTip.GAP,
                        'Each round takes the next item off THIS project\'s backlog and is filed '
                        + 'against it. The campaign cannot start without one.'
                    ])}
                ${tipLabel(
                    `Runs as<select id="s-agent">${C.option('', '— pick one —', { selected: !sentryForm.agent, detail: 'Every round of this campaign opens in that agent\'s own folder, under its own rules.' })}
                    ${opt(DATA.agents, sentryForm.agent, 'id', 'name')}</select>`,
                    'Whose folder and whose rules each round opens in',
                    [
                        'Now: ' + (listName(DATA.agents, sentryForm.agent)
                            || 'nobody named, so nothing can start'),
                        window.AFTip.GAP,
                        'Every round is an ordinary unattended session in that agent\'s own folder, '
                        + 'under its own rules — the campaign adds no identity of its own.'
                    ])}
                ${tipLabel(
                    `Engine<select id="s-engine">${C.option('', 'main sign-in only', { selected: !sentryForm.engine, detail: 'No engine named, so no account rotation: every round runs on the main sign-in, because choosing an account would mean assuming an engine.' })}
                    ${opt((DATA.engines || []).map(e => ({ id: e.id, name: e.label })), sentryForm.engine, 'id', 'name')}</select>`,
                    'Engine — and therefore whether accounts rotate at all',
                    [
                        sentryForm.engine
                            ? `Now: ${engineName(sentryForm.engine)} — rounds rotate across its captured sign-ins`
                            : 'Now: no engine named, so every round runs on the main sign-in',
                        window.AFTip.GAP,
                        'Naming an engine is what turns account rotation ON: without one, choosing an '
                        + 'account would mean assuming an engine, so nothing is chosen and every round '
                        + 'opens as the identity this machine is signed in as.'
                    ])}
                ${tipLabel(
                    `Model<select id="s-model">${
                        modelOptsFor(sentryForm.engine, sentryForm.model, '— engine default —')}</select>`,
                    'The model every round of this campaign runs on',
                    [
                        // ‼️ A-12.8 — the emptiest of the three, and the one whose
                        // emptiness means the most: "— engine default —" names no
                        // model at all, so the reader cannot tell it from a model
                        // they chose that happens to be the default.
                        'Now: ' + (sentryForm.model
                            || 'no model named — the engine\'s own default decides, round by round'),
                        window.AFTip.GAP,
                        'A campaign runs unattended for hours, so this is the box that decides what '
                        + 'the night costs. Left empty, the agent\'s own setting and the fleet\'s '
                        + 'model-policy rules stay in charge, exactly as they do for a hand-started '
                        + 'session.'
                    ])}
            </div>
            <div class="srow">
                ${tipLabel(
                    `Permissions<select id="s-perm">${(s.permissionModes || []).map(m =>
                        C.option(m.id, m.label, { selected: m.id === sentryForm.permissionMode, detail: m.detail || '' })).join('')}</select>`,
                    'What a round may do without asking',
                    [
                        'Now: ' + (permName(s, sentryForm.permissionMode) || 'the CLI\'s own default'),
                        window.AFTip.GAP,
                        '‼️ An unattended round that stops to ask has nobody to answer it and never ends, '
                        + 'so this is the one setting a campaign cannot afford to leave narrow.',
                        window.AFTip.GAP,
                        '‼️ And the quieter half, measured on a live campaign: acceptEdits approves writes '
                        + 'INSIDE the round\'s working folder and nothing outside it. A campaign whose '
                        + 'target is elsewhere — an agent folder as cwd, the project\'s documents in the '
                        + 'vault — opens rounds that end SUCCESSFULLY having written nothing. Rounds that '
                        + 'write outside their own cwd need bypassPermissions.'
                    ])}
                ${tipLabel(
                    `<input type="checkbox" id="s-sp"${sentryForm.superpowers ? ' checked' : ''}> Superpowers`,
                    'Superpowers, on every round of this campaign',
                    [
                        'Now: ' + (sentryForm.superpowers ? 'on' : 'off'),
                        window.AFTip.GAP,
                        'The skills discipline is loaded into every session the campaign opens, exactly '
                        + 'as if the box on a hand-started session were ticked.'
                    ], 'scheck')}
                ${tipLabel(
                    `Ceiling %<input id="s-ceiling" type="number" min="1" max="100" placeholder="${C.esc(String((s.defaults || {}).ceiling || ''))}" value="${C.esc(sentryForm.ceiling)}">`,
                    'The five-hour percentage that counts as a wall',
                    mirrorNum(sentryForm.ceiling, (s.defaults || {}).ceiling, '%',
                        'At or above it an account is not worth starting a round on: the round would open, '
                        + 'run into the limit and end barren. Every account walled is what makes the '
                        + 'campaign sleep instead of spending the night on nothing. Empty means the Account '
                        + 'ceiling, and no figure here acts above the quota handover line.'
                        + (s.wall && s.wall.why ? ` In force: ${s.wall.why}.`
                            : ((s.defaults || {}).ceilingWhy ? ` Empty acts at ${s.defaults.ceilingWhy}.` : ''))))}
                ${tipLabel(
                    `Safety min<input id="s-buffer" type="number" min="0" placeholder="${C.esc(String((s.defaults || {}).safetyBufferMin || ''))}" value="${C.esc(sentryForm.safetyBufferMin)}">`,
                    'Minutes to wait PAST a measured reset',
                    mirrorNum(sentryForm.safetyBufferMin, (s.defaults || {}).safetyBufferMin, ' min',
                        'The reset time is the endpoint\'s own and the clocks are not the same clock. '
                        + 'Waking on the dot means waking into the wall again; this is the margin.'))}
                ${tipLabel(
                    `Failure brake<input id="s-fail" type="number" min="0" placeholder="${C.esc(String((s.defaults || {}).failLimit || ''))}" value="${C.esc(sentryForm.failLimit)}">`,
                    'Barren rounds IN A ROW that switch the campaign off',
                    mirrorNum(sentryForm.failLimit, (s.defaults || {}).failLimit, '',
                        'Not a round budget — a working campaign runs until you stop it. This is the one '
                        + 'alarm no quota can raise: a broken setup opening empty sessions all night '
                        + 'spends nothing and would never stop itself. 0 switches the brake off.'))}
            </div>
            ${sentryPoolHtml(s)}
            ${sentryPolicyHtml(s)}
            ${sentryLeaderHtml(s)}
            <label class="sprompt">First round opens with
                <textarea id="s-prompt" rows="3" placeholder="Every continuation sentence is built on &quot;the previous session&quot; — the first round has none, so these words are yours.">${C.esc(sentryForm.prompt)}</textarea></label>
            <div class="srow">
                <button id="s-start">Start campaign</button>
                <button id="s-cancel" class="ghost">Cancel</button>
            </div>
        </div>`;
    }

    function sentryHtml() {
        const s = DATA.sentry || {};
        const c = s.campaign;
        const on = c && (c.status === 'running' || c.status === 'paused');
        const words = s.nextWords && s.nextWords.prompt
            ? window.AFTip.wrap(
                `<span class="mchip">next words${s.nextWords.code ? ' · ' + C.esc(s.nextWords.code) : ''}</span>`,
                'What the next round will open on',
                window.AFTip.lines([s.nextWords.prompt, '',
                    'Built when the last round ended and kept through the wait, so a campaign coming '
                    + 'back from a quota wall does not fall back to the sentence the FIRST round was given.']))
            : '';
        /**
         * ‼️ X-195 — WHAT THE THINKING COST, ON THE CAMPAIGN'S OWN LINE.
         *
         * The rounds table accounts for each round one at a time; this is the
         * figure a person actually checks before letting it run another night,
         * and until now it existed only inside the budget record. DENSITY: the
         * total is on the strip, the turn-by-turn ledger is the hover.
         *
         * The budget is a DAY's, so the day is named — a campaign that has not
         * woken its leader since yesterday would otherwise show yesterday's
         * spend as though it were tonight's.
         */
        const leaderSpend = (() => {
            const L = (c && c.leader) || null;
            if (!L || (!L.turns && !L.spentUsd)) { return ''; }
            const turns = Number(L.turns) || 0;
            const log = (L.log || []);
            const failed = log.filter(a => a && a.ok === false).length;
            const rows = log.slice().reverse().map(a => {
                const when = a && a.at ? new Date(a.at).toLocaleTimeString() : '';
                return (a && a.ok === false ? '✗ ' : '✓ ')
                    + [when, a && a.model, spendUsd(a && a.costUsd),
                        (a && typeof a.ms === 'number') ? Math.round(a.ms / 1000) + 's' : '',
                        a && a.note].filter(Boolean).join(' · ');
            });
            // ‼️ RED IS FOR A LEADER THAT HAS STOPPED WAKING, and nothing else.
            // One turn that gave nothing usable is an ordinary night — the
            // campaign filled a template and carried on. Colouring the total
            // red for it would raise an alarm about a cost the user asked for.
            return window.AFTip.wrap(
                `<span class="mchip ${L.failStreak ? 'bad' : 'prov'}">leader ${spendUsd(L.spentUsd)} · ${turns} turn(s)</span>`,
                `What the leader has spent${L.day ? ' on ' + L.day : ''}`,
                window.AFTip.lines([
                    `${turns} turn(s) · ${spendUsd(L.spentUsd)}`
                        + (failed ? ` · ${failed} gave nothing usable` : ''),
                    L.failStreak ? `${L.failStreak} failed turn(s) in a row` : '',
                    'The daily purse is agentFarm.sentryLeaderBudgetUsd; a campaign whose leader has '
                        + 'stopped waking still runs, mechanically.',
                    ...(rows.length ? ['', 'the turns, newest first:', ...rows] : [])
                ]));
        })();
        // ‼️ NO LIVE STRIP HERE, AND NO LIVE CLOCK EITHER. What is true THIS
        // SECOND — who is running on which account, how much of that account is
        // left, and the moment a sleeping campaign wakes — is the Console
        // strip's subject, and the item says so by name. This page carries the
        // setup and the history; the round on the board is in the table below
        // with every other round, which is where history keeps it. What stays
        // here is the campaign's own SENTENCE (`Why`), which is the decision
        // rather than the clock.
        /**
         * ‼️ X-207 — WHOSE ACCOUNTS THIS NIGHT IS SPENDING, on the strip.
         *
         * "rotates claude accounts" stopped being the whole truth the moment a
         * pool could name a SUBSET, and could cross engines. SHORTHAND: the
         * chip carries the count, the engines and the strategy; the panel
         * carries the list, each account's room, and the tier order that
         * decides which of them is tried first.
         */
        const poolChip = (() => {
            // The strip only draws with a campaign; with none there is no pool
            // to name, and this is computed above the branch that knows that.
            if (!c) { return ''; }
            const ids = (c.pool || []);
            const known = s.accountPool || [];
            const gone = s.poolMissing || [];
            // ‼️ A-12.8 — THE TWO POOL-LESS BRANCHES ARE PANELS TOO. X-196 swept
            // the strip and stopped at the branch that HAS a pool: the "main
            // sign-in" chip kept two sentences inside a native `title` (which
            // the rule reserves for a handful of figures), and the "rotates …
            // accounts" chip carried nothing at all — the widest state of the
            // three, and the only one that could not be asked what it meant.
            if (!ids.length) {
                return s.rotatesAccounts
                    ? window.AFTip.wrap(
                        `<span class="mchip prov">rotates ${C.esc(c.engine)} accounts</span>`,
                        `Every captured ${engineName(c.engine) || c.engine} sign-in is in play`,
                        window.AFTip.lines([
                            'No pool was named, so the campaign is not held to a subset: every account '
                            + 'captured for this engine on this machine may be spent.',
                            window.AFTip.GAP,
                            `captured for this engine: ${known.filter(a => a.engine === c.engine).length}`,
                            'Naming a pool is how a campaign is fenced to particular sign-ins — the '
                            + 'setup form does it, and the chip then carries the count instead of this.'
                        ]), 'sentry-pool')
                    : window.AFTip.wrap(
                        '<span class="mchip prov">main sign-in</span>',
                        'No account rotation at all',
                        window.AFTip.lines([
                            'No engine and no pool were named, so every round runs on the identity this '
                            + 'machine is signed in as.',
                            window.AFTip.GAP,
                            'Choosing an account would mean assuming an engine, so nothing is chosen: '
                            + 'the absence of a slot IS the main account. Name an engine on the setup '
                            + 'form and rotation turns on.'
                        ]), 'sentry-pool');
            }
            const of = (id) => known.find(a => a.id === id);
            const engines = [];
            for (const id of ids) {
                const e = (of(id) || {}).engine;
                if (e && !engines.includes(e)) { engines.push(e); }
            }
            const tiered = c.rotation === 'tiered';
            const line = (id, i) => {
                const a = of(id);
                if (!a) { return `${i + 1}. ${id} — NOT CAPTURED ANY MORE`; }
                return `${i + 1}. ${a.label || a.id} · ${engineName(a.engine) || a.engine} · `
                    + (a.percent === null || a.percent === undefined
                        ? 'nobody has read its window' : a.percent + '% used');
            };
            return window.AFTip.wrap(
                `<span class="mchip ${gone.length ? 'bad' : 'prov'}">${ids.length} account(s)`
                + (engines.length > 1 ? ' · ' + C.esc(engines.join('+')) : '')
                + (tiered ? ' · tiered' : '') + '</span>',
                `${ids.length} account${ids.length === 1 ? '' : 's'} allowed`
                + (engines.length > 1 ? ` across ${engines.length} engines` : ''),
                'ONLY these accounts are spent — nothing else on this machine is touched, whatever '
                + 'room it has.\n\n' + ids.map(line).join('\n')
                + (tiered
                    ? '\n\nTiered: one engine at a time, in this order, crossing to the next only when '
                        + 'every account of the current one is walled.'
                    : '\n\nFree pool: whichever of these has the most room goes next, whatever engine '
                        + 'it belongs to.')
                // ‼️ A FORGOTTEN ACCOUNT IS WHY A POOL OF FIVE RUNS ON THREE,
                // and it is the one fact nothing else on this page can explain.
                + (gone.length
                    ? '\n\n‼️ ' + gone.join(', ') + ' — allowed, but no longer captured on this '
                        + 'machine. The pool is NOT widened to cover it: capture it again on the '
                        + 'Engines page, or stop the campaign and start it on a pool that exists.'
                    : ''));
        })();
        const body = !sentryOpen ? '' : (on
            ? `<div class="sbody">
                <div class="provrow"><span class="plabel">Working</span>
                    <b>${C.esc(s.projectName || '')}</b> as <b>${C.esc(s.agentName || '')}</b>
                    <span class="mchip prov">${c.rounds || 0} round(s)</span>
                    ${poolChip}
                    ${s.failLimit ? window.AFTip.wrap(
                        `<span class="mchip ${s.failStreak ? 'bad' : 'prov'}">${s.failStreak}/${s.failLimit} barren</span>`,
                        'The failure brake, and how close it is',
                        window.AFTip.lines([
                            // ‼️ A-12.8 — the definition used to be the whole of a native
                            // `title`; a cell hover is figures, and the figures are what
                            // say whether the next barren round is the last one.
                            `in a row now: ${s.failStreak || 0}`,
                            `brake at: ${s.failLimit}`,
                            `one more barren round leaves: ${Math.max(0, s.failLimit - (s.failStreak || 0) - 1)}`,
                            window.AFTip.GAP,
                            'A barren round is one that ended having changed nothing. This many in a '
                            + 'ROW stops the campaign outright — a round that does work resets it to 0, '
                            + 'so the count is a streak and not a total.'
                        ]), 'sentry-barren') : ''}
                    ${leaderSpend}
                    ${words}
                </div>
                <div class="provrow"><span class="plabel">Why</span>${sentryWhy(c)}</div>
                ${sentryRoundsHtml(s)}
            </div>`
            : (sentryFormOpen ? sentryFormHtml(s) : `<div class="sbody"><div class="dim">
                No campaign is running. A campaign takes the next item off a project backlog, opens a
                clean unattended session on it as an ordinary task row, and when that row ends it reads
                what the session left behind and opens the next one — until you stop it.
                ${c ? `<br>The last one ${C.esc(c.status)} ${C.esc(sentryWhen(c.stoppedAt))}${c.stoppedWhy ? ' — ' + C.esc(c.stoppedWhy) : ''}` : ''}
                </div></div>`));
        return `<div class="ssec">
            <div class="shead">
                <span class="tcaret" id="s-caret">${sentryOpen ? '▾' : '▸'}</span>
                <b>Sentry</b> ${sentryChip(s)}
                <span class="grow1"></span>
                ${on && c.status === 'running' ? '<button id="s-pause" class="ghost">Pause</button>' : ''}
                ${on && c.status === 'paused' ? '<button id="s-resume">Resume</button>' : ''}
                ${on ? '<button id="s-stop" class="ghost">Stop</button>' : ''}
                ${!on && !sentryFormOpen ? '<button id="s-new">+ Start a campaign</button>' : ''}
            </div>
            ${body}
        </div>`;
    }

    function readSentryForm() {
        const v = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
        sentryForm.project = v('s-project');
        sentryForm.agent = v('s-agent');
        sentryForm.engine = v('s-engine');
        sentryForm.model = v('s-model');
        sentryForm.permissionMode = v('s-perm');
        sentryForm.prompt = v('s-prompt');
        sentryForm.ceiling = v('s-ceiling');
        sentryForm.safetyBufferMin = v('s-buffer');
        sentryForm.failLimit = v('s-fail');
        sentryForm.leaderEngine = v('s-lengine');
        sentryForm.leaderModel = v('s-lmodel');
        sentryForm.leaderAccount = v('s-laccount');
        sentryForm.leaderDailyUsd = v('s-lday');
        sentryForm.leaderMaxUsd = v('s-lmax');
        const sp = document.getElementById('s-sp');
        sentryForm.superpowers = !!(sp && sp.checked);
        // ‼️ X-194 — the conditions are read back the same way every other box
        // is, so a repaint (and this page repaints on every tick) cannot lose
        // a half-typed value. The row index is on each control.
        const s2 = DATA.sentry || {};
        // ‼️ READ FLAT, BY THE ROW'S OWN NUMBER. Every control already carries
        // `data-si`, so nothing here has to walk inside a row — and a read that
        // walked inside one was a read no page test could measure: the harness
        // has a single document and an element's query is the page's query, so
        // every row came back holding the FIRST row's boxes and the test that
        // was meant to prove the editor round-trips proved nothing.
        const at = (el) => condAt(el.dataset.si);
        document.querySelectorAll('.scond-f').forEach(el => {
            const c = at(el); if (c) { c.field = el.value; }
        });
        document.querySelectorAll('.scond-o').forEach(el => {
            const c = at(el); if (c) { c.operator = el.value; }
        });
        document.querySelectorAll('.scond-v').forEach(el => {
            const c = at(el); if (c) { c.value = el.value; }
        });
        // An operator that takes no value carries none — a stored one would be
        // reported to the host for a condition that cannot use it. Applied to
        // the PARTS as well, because a part is a condition like any other.
        eachCondition(c => {
            const spec = policyOps(s2).find(x => x.id === c.operator);
            if (spec && !spec.takesValue) { delete c.value; }
        });
    }

    /**
     * ‼️ X-194 — A ROW THE FIELD CANNOT ANSWER IS REPAIRED, NOT LEFT BROKEN.
     *
     * Changing the field can strand the operator ("is more than" on a boolean)
     * and the value (a number typed against a closed set). Silently keeping
     * either would hand the host a condition that can never hold, and the host
     * refuses it by name — so the page fixes it here, at the moment the reader
     * can still see what happened, instead of at the moment they press Start.
     */
    function repairCondition(s, c) {
        const ops = opsFor(s, c.field);
        if (!ops.some(o => o.id === c.operator)) { c.operator = ops.length ? ops[0].id : ''; }
        const o = policyOps(s).find(x => x.id === c.operator);
        const f = fieldSpec(s, c.field);
        if (o && !o.takesValue) { delete c.value; return; }
        if (f && f.type === 'enum' && (f.values || []).length
            && (f.values || []).indexOf(String(c.value ?? '')) < 0) { c.value = f.values[0]; }
        if (c.value === undefined) { c.value = ''; }
    }

    function wireSentry() {
        const w = (id, fn) => { const el = document.getElementById(id); if (el) { el.addEventListener('click', fn); } };
        /**
         * ‼️ X-250 — THE ENGINE REDRAWS THE FORM, because the model box below it
         * is that engine's catalogue. Without this the box kept the list of
         * whichever engine was named when the form was opened, which is how a
         * Codex campaign came to be offered Claude's aliases.
         *
         * ‼️ AND NOTHING IS TAKEN AWAY (U-101). A word the new engine does not
         * publish is KEPT as its own marked option rather than deleted while
         * the reader is looking at a different control; the mark and its
         * tooltip say the launch will refuse it. Telling is not the same as
         * clearing, and the delegate rows settled that question already.
         */
        const sEng = document.getElementById('s-engine');
        if (sEng) { sEng.addEventListener('change', () => { readSentryForm(); render(); }); }
        // ‼️ X-249 (2/n) — SAME REASON, ONE ROW DOWN. The leader's engine cuts its
        // own model catalogue and its own account list, so the row has to be redrawn
        // when it moves or the reader is choosing from the previous engine's words.
        const sLEng = document.getElementById('s-lengine');
        if (sLEng) { sLEng.addEventListener('change', () => { readSentryForm(); render(); }); }
        w('s-caret', () => { sentryOpen = !sentryOpen; render(); });
        w('s-new', () => { sentryFormOpen = true; sentryErr = ''; sentryOpen = true; render(); });
        w('s-cancel', () => { readSentryForm(); sentryFormOpen = false; sentryErr = ''; render(); });
        w('s-pause', () => vscode.postMessage({ type: 'sentryControl', action: 'pause' }));
        w('s-resume', () => vscode.postMessage({ type: 'sentryControl', action: 'resume' }));
        w('s-stop', () => vscode.postMessage({ type: 'sentryControl', action: 'stop' }));
        w('s-start', () => {
            readSentryForm();
            // ‼️ REFUSED HERE FIRST, so the page can say which box is empty
            // rather than round-tripping to be told the same thing.
            if (!sentryForm.project) { sentryErr = 'pick the project whose backlog the campaign works through'; render(); return; }
            if (!sentryForm.agent) { sentryErr = 'pick the agent the campaign runs its sessions as'; render(); return; }
            if (!sentryForm.prompt.trim()) {
                sentryErr = 'the first round needs words to open on — every continuation sentence is '
                    + 'built on "the previous session", and the first round has none';
                render(); return;
            }
            const num = (x) => (String(x).trim() === '' ? undefined : Number(x));
            vscode.postMessage({
                type: 'sentryStart',
                input: {
                    project: sentryForm.project, agent: sentryForm.agent, prompt: sentryForm.prompt,
                    engine: sentryForm.engine || undefined, model: sentryForm.model || undefined,
                    permissionMode: sentryForm.permissionMode || undefined,
                    superpowers: sentryForm.superpowers,
                    ceiling: num(sentryForm.ceiling), safetyBufferMin: num(sentryForm.safetyBufferMin),
                    failLimit: num(sentryForm.failLimit),
                    // ‼️ X-194 — the mode and the conditions, as the host has
                    // taken them since v11.244. Both are left out when no mode
                    // was asked for, because `sentry.start` writes NO policy
                    // for that and inventing one here would be this form
                    // deciding something nobody asked it to.
                    preset: sentryForm.preset || undefined,
                    conditions: sentryForm.preset ? sentryForm.conditions : undefined,
                    // ‼️ AN UNTOUCHED BOX SENDS NOTHING, and that is the whole
                    // meaning of empty here: the setting goes on deciding, so
                    // changing it tomorrow changes this campaign too. Sending
                    // today's placeholder back would freeze it on and nothing
                    // on any surface would say the campaign had been pinned.
                    leaderEngine: sentryForm.leaderEngine.trim() || undefined,
                    leaderModel: sentryForm.leaderModel.trim() || undefined,
                    leaderAccount: sentryForm.leaderAccount.trim() || undefined,
                    leaderDailyUsd: String(sentryForm.leaderDailyUsd).trim() || undefined,
                    leaderMaxUsd: String(sentryForm.leaderMaxUsd).trim() || undefined,
                    // ‼️ X-207 — the pool travels IN TICK ORDER, because that
                    // order is the tier priority. Nothing ticked sends nothing:
                    // an empty pool is not a pool of nobody, and `free` is what
                    // a record with no rotation already does.
                    pool: sentryForm.pool.length ? sentryForm.pool.slice() : undefined,
                    rotation: sentryForm.rotation || undefined
                }
            });
        });
        // ------------------------------------------------ X-207: the pool
        /*
         * ‼️ A TICK APPENDS AND A SECOND TICK REMOVES, which makes the ORDER the
         * user's rather than the list's — and the order is a real input, because
         * `tiered` walks engines in it. Re-sorting to the display order here
         * would silently rewrite the priority they just expressed.
         */
        document.querySelectorAll('[data-spool]').forEach(el => el.addEventListener('click', () => {
            readSentryForm();
            const id = el.dataset.spool;
            const at = sentryForm.pool.indexOf(id);
            if (at >= 0) { sentryForm.pool.splice(at, 1); } else { sentryForm.pool.push(id); }
            render();
        }));
        document.querySelectorAll('[data-srot]').forEach(el => el.addEventListener('click', () => {
            readSentryForm();
            // ‼️ PRESSING `free` CLEARS THE FIELD rather than storing 'free'.
            // Absent IS free on the record, and a stored default is a campaign
            // that cannot follow the default when it changes.
            sentryForm.rotation = el.dataset.srot === 'tiered' ? 'tiered' : '';
            render();
        }));
        // ------------------------------------------------ X-194: the policy
        const sd = DATA.sentry || {};
        document.querySelectorAll('[data-spreset]').forEach(el => el.addEventListener('click', () => {
            readSentryForm();
            const id = el.dataset.spreset;
            // ‼️ EMPTY MEANS "NOTHING ASKED FOR", which is not mechanical: the
            // host writes no policy at all for it and the round's own default
            // decides. Mechanical is a decision; this is the absence of one.
            sentryForm.preset = id || null;
            sentryForm.conditions = id
                ? JSON.parse(JSON.stringify((sd.policyPresetConditions || {})[id] || []))
                : [];
            render();
        }));
        document.querySelectorAll('[data-sdel]').forEach(el => el.addEventListener('click', () => {
            readSentryForm();
            sentryForm.conditions.splice(Number(el.dataset.sdel), 1);
            render();
        }));
        // ‼️ THE ORDER IS NOT COSMETIC. Conditions are ORed, and the verdict
        // names the ones that fired IN THE ORDER THEY WERE WRITTEN — so the row
        // a reader wants to see first belongs first.
        const move = (attr, by) => document.querySelectorAll('[data-' + attr.toLowerCase() + ']').forEach(el =>
            el.addEventListener('click', () => {
                readSentryForm();
                const i = Number(el.dataset[attr]), j = i + by;
                const list = sentryForm.conditions;
                if (j < 0 || j >= list.length) { return; }
                const t = list[i]; list[i] = list[j]; list[j] = t;
                render();
            }));
        move('sup', -1);
        move('sdn', 1);
        const condAdd = document.getElementById('s-condadd');
        if (condAdd) {
            condAdd.addEventListener('click', () => {
                readSentryForm();
                const f = policyFields(sd)[0];
                if (!f) { return; }
                const c = { id: freeConditionId(), field: f.field };
                repairCondition(sd, c);
                sentryForm.conditions.push(c);
                render();
            });
        }
        // A field or an operator changing can strand the row's other two boxes,
        // so the repaint is what redraws them — see repairCondition.
        document.querySelectorAll('.scond-f, .scond-o').forEach(el =>
            el.addEventListener('change', () => {
                readSentryForm();
                const c = condAt(el.dataset.si);
                if (c) { repairCondition(sd, c); }
                render();
            }));
        // ‼️ X-194 — AND PARTS. Giving a plain condition its first part turns
        // the line INTO a group and keeps the condition as part one: a "+ and"
        // that threw away what the row already said would be a button nobody
        // dares press. The parts are ANDed; the lines themselves stay ORed.
        document.querySelectorAll('[data-sand]').forEach(el => el.addEventListener('click', () => {
            readSentryForm();
            const i = Number(el.dataset.sand);
            const line = sentryForm.conditions[i];
            const f = policyFields(sd)[0];
            if (!line || !f) { return; }
            const part = { id: freeConditionId(), field: f.field };
            repairCondition(sd, part);
            if (Array.isArray(line.all)) { line.all.push(part); }
            else { sentryForm.conditions[i] = { id: line.id, all: [line, part] }; }
            render();
        }));
        document.querySelectorAll('[data-sdelp]').forEach(el => el.addEventListener('click', () => {
            readSentryForm();
            const p = String(el.dataset.sdelp).split('.');
            const line = sentryForm.conditions[Number(p[0])];
            if (!line || !Array.isArray(line.all)) { return; }
            line.all.splice(Number(p[1]), 1);
            // ‼️ A GROUP OF ONE IS NOT A GROUP. The core calls an empty one a
            // problem by name, and a one-part group is a plain condition
            // wearing a box — so the line goes back to being what it is.
            if (line.all.length === 1) {
                sentryForm.conditions[Number(p[0])] = Object.assign({}, line.all[0], { id: line.id });
            }
            render();
        }));
        document.querySelectorAll('[data-sround]').forEach(el => el.addEventListener('click', () =>
            vscode.postMessage({ type: 'consoleAgent', agentId: (DATA.sentry.campaign || {}).agent })));
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
        // ‼️ U-103 — every repaint re-asks what this draft would launch with,
        // debounced. Hooked HERE rather than onto each of the twenty controls
        // that change the draft: a handler added later would silently not have
        // it, and a resolution the form has stopped asking for is a form back
        // to guessing.
        schedulePreview();
        // ‼️ X-194 — and the same question for the sentry draft: would this
        // condition set fire against what the last round measured? Same hook,
        // same reason — a control added to the editor later inherits it.
        scheduleSentryProbe();
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
                /* ‼️ U-104 — the provenance strip. Two labelled rows in place of
                   the one muted identity line: the label is the SUBJECT and sits
                   at a fixed width so the eye reads down it rather than hunting
                   along a sentence. */
                .provrow { display:flex; align-items:center; flex-wrap:wrap; gap:6px;
                    font-size:12px; margin:3px 0; color:var(--vscode-descriptionForeground); }
                .provrow .plabel { min-width:86px; font-size:10px; letter-spacing:.4px;
                    text-transform:uppercase; opacity:.7; cursor:default; }
                .provrow b { color:var(--vscode-foreground); }
                .mchip.prov { background:transparent; border:1px solid var(--vscode-widget-border, #5555);
                    opacity:.9; }
                /* The row's own SHORTHAND: ⚙ some layer decided something, ≠ the
                   engine came back with something other than what was asked for.
                   Nothing at all when every dimension fell through to the CLI —
                   a mark on every row is a mark that says nothing. */
                .pmark { margin-left:4px; font-size:9px; opacity:.75; cursor:default; }
                .pmark.bad { color:var(--vscode-errorForeground, #d13438); opacity:1; font-weight:600; }
                .pname { white-space:nowrap; }
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
                /* ---- ‼️ X-177 — the sentry campaign's own block ---- */
                .ssec { margin:10px 0 16px; border:1px solid var(--vscode-panel-border, rgba(128,128,128,.35));
                    border-radius:6px; }
                .shead { display:flex; align-items:center; gap:8px; padding:6px 10px; font-size:13px;
                    background:color-mix(in srgb, var(--vscode-textLink-foreground) 8%, transparent);
                    border-radius:5px 5px 0 0; }
                .shead .tcaret { cursor:pointer; width:12px; text-align:center; opacity:.75; }
                .grow1 { flex:1; }
                .sbody, .sform { padding:8px 12px 12px; }
                .srow { display:flex; gap:12px; align-items:flex-end; flex-wrap:wrap; margin:6px 0; }
                .srow label, .sprompt { display:flex; flex-direction:column; gap:2px; font-size:11px;
                    color:var(--vscode-descriptionForeground); }
                .srow label.scheck { flex-direction:row; align-items:center; gap:5px; font-size:12px;
                    color:var(--vscode-foreground); }
                .srow input[type=number] { width:90px; }
                /* ‼️ X-207 — the account pool. Grouped by engine because a pool
                   may cross them, and the group is the unit a reader scans: a
                   flat run of five addresses is five addresses, while claude(3)
                   codex(2) is the shape of the decision. The engine name is a
                   quiet label rather than a chip, so nothing competes with the
                   accounts themselves for the eye. */
                .spool { margin:10px 0 4px; padding:8px 10px; border-radius:4px;
                    border:1px solid var(--vscode-panel-border, rgba(128,128,128,.35)); }
                .spool-head, .spool-rot { align-items:center; gap:6px; flex-wrap:wrap; }
                .spool-rot { margin:8px 0 0; }
                .spool .flabel { font-size:11px; text-transform:uppercase; letter-spacing:.5px;
                    opacity:.65; margin-right:4px; }
                .spool-eng { display:inline-flex; align-items:center; gap:4px; flex-wrap:wrap;
                    padding:2px 6px 2px 4px; border-radius:4px;
                    background:var(--vscode-editor-inactiveSelectionBackground, rgba(128,128,128,.10)); }
                .spool-engname { font-size:10px; text-transform:uppercase; letter-spacing:.6px;
                    opacity:.6; margin-right:2px; }
                /* The percentage is the figure that decides which account goes
                   next, so it travels ON the chip - but it is a second-order
                   fact next to whose account it is, and it is dimmed to say so. */
                .spool-pct { opacity:.6; font-variant-numeric:tabular-nums; margin-left:3px; }
                .spool-chip.on .spool-pct { opacity:.85; }
                /* ‼️ The tick ORDER is a real input (tiered walks engines in it),
                   so it is drawn. An input the reader cannot see is not an input. */
                .spool-n { color:var(--vscode-textLink-foreground); margin-right:1px; }
                /* X-194 — the mode strip and the condition editor. The rows are
                   a grid rather than a flex wrap on purpose: three boxes that
                   line up down the column are read as one question asked five
                   times, and three that shuffle per row are read as five
                   different forms. */
                .spolicy { margin:10px 0 4px; padding:8px 10px; border-radius:4px;
                    border:1px solid var(--vscode-panel-border, rgba(128,128,128,.35)); }
                .spolicy-head { margin:0 0 6px; align-items:center; gap:6px; }
                .spolicy-head .flabel { font-size:11px; text-transform:uppercase; letter-spacing:.5px;
                    opacity:.65; margin-right:4px; }
                .schip-custom { font-size:11px; opacity:.75; padding:2px 6px; border-radius:9px;
                    border:1px dashed var(--vscode-panel-border, rgba(128,128,128,.45)); }
                .scond-list { display:flex; flex-direction:column; gap:4px; }
                /* ‼️ The trailing 1fr is the point: without it the three row
                   buttons absorb the slack and stretch to a third of the page
                   each, which reads as three more fields rather than as ↑ ↓ ✕.
                   The slack belongs to nothing, so it is given to nothing. */
                .scond { display:grid; gap:6px; align-items:center;
                    grid-template-columns:28px 200px 130px minmax(120px,220px)
                        108px 50px 26px 26px 26px 1fr; }
                /* ‼️ X-194 — the AND gutter is drawn on EVERY line, empty where
                   there is no group: every row is its own grid, so a first cell
                   that is sometimes there and sometimes not moves every control
                   after it and the columns stop being columns. */
                .scond-amp { font-size:10px; text-transform:uppercase; letter-spacing:.5px;
                    opacity:.65; text-align:right; }
                .scondg { border-left:2px solid var(--vscode-panel-border, rgba(128,128,128,.45));
                    padding-left:4px; margin-left:-6px;
                    display:flex; flex-direction:column; gap:4px; }
                .scond select, .scond input { font-size:11px; padding:2px 4px; min-width:0; }
                .scond .chip { padding:1px 7px; }
                .scond-nov { font-style:italic; }
                /* ‼️ X-194 — THE READING SITS AGAINST THE VALUE IT IS COMPARED
                   WITH. "is more than 0 · now 3" is read as one sentence; the
                   same two numbers a hand's width apart are read as two fields,
                   and the second one looks editable. ‼️ ITS COLUMN IS A FIXED
                   WIDTH, not max-content: every row is its OWN grid, so a
                   content-sized column makes ↑ ↓ ✕ land somewhere different on
                   each line — the exact shuffle the trailing 1fr above exists
                   to stop. A long reading ellipses; the panel has it in full. */
                .scond > .af-tipw { min-width:0; }
                .scond-now { display:inline-block; max-width:100%; font-size:11px; opacity:.75;
                    padding:1px 6px; border-radius:9px; white-space:nowrap;
                    overflow:hidden; text-overflow:ellipsis; vertical-align:middle;
                    border:1px solid var(--vscode-panel-border, rgba(128,128,128,.35)); }
                /* …and one that HOLDS right now is the whole point of the row:
                   this is the line that would wake the leader tonight. */
                .scond-now.scond-hit { opacity:1;
                    border-color:var(--vscode-textLink-foreground);
                    color:var(--vscode-textLink-foreground); }
                .spolicy-verdict { font-size:11px; padding:1px 7px; border-radius:9px;
                    border:1px solid var(--vscode-panel-border, rgba(128,128,128,.35)); opacity:.8; }
                .spolicy-verdict.on { opacity:1;
                    border-color:var(--vscode-textLink-foreground);
                    color:var(--vscode-textLink-foreground); }
                .spolicy-asof { margin-left:auto; }
                .scond-empty { padding:2px 0 4px; }
                .scond-tools { margin:6px 0 0; align-items:center; }
                .sprompt { margin:6px 0; }
                .sprompt textarea { width:100%; max-width:760px; padding:5px 8px; }
                .swhy { font-size:12px; }
                .dim { color:var(--vscode-descriptionForeground); font-size:12px; }
                .formerr { color:var(--vscode-errorForeground, #f66); font-size:12px; margin-bottom:6px; }
                button.ghost { background:transparent; color:var(--vscode-foreground);
                    border:1px solid var(--vscode-panel-border, rgba(128,128,128,.45)); }
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
                /* ‼️ A-17 — the history strip. It is a READING, not a control:
                   no button, no border of its own, sitting at the same muted
                   weight as the labels beside it so it is never mistaken for
                   something the page wants pressed. Only the shape carries the
                   page's own foreground, because the shape is the fact. */
                .histrow { margin:8px 0 0; }
                .histtrig { display:inline-flex; align-items:center; gap:6px; cursor:help; }
                .hshape { font-family:var(--vscode-editor-font-family, monospace); font-size:11px;
                    color:var(--vscode-foreground); }
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
                /* ‼️ U-100 — the orchestrator's four fields on ONE line, because
                   they are one answer. They wrap together on a docked panel
                   rather than clipping, the same rule the member row follows. */
                .orcrow { margin-bottom:2px; }
                .orcbody { display:flex; gap:8px; align-items:flex-end; flex-wrap:wrap; margin-top:0; }
                .orcbody > label { flex:1 1 150px; min-width:120px; margin:0; }
                .orcbody > label select { min-width:0; }
                /* A value that cannot be chosen is drawn as a value, not as a
                   select nobody may use — the shape says "read this", and the
                   AFTip says why it is fixed. */
                /* ‼️ U-101 — an explicit override wears a left edge; an inherited
                   cell does not. The word would not fit in the box, and the
                   AFTip already carries the sentence. */
                .tmrow select.ovr { border-left:3px solid var(--vscode-textLink-foreground); }
                .profbtn { margin-left:8px; }
                .profbody { display:flex; gap:8px; align-items:flex-end; flex-wrap:wrap;
                    margin:6px 0 8px; padding:8px; border-radius:4px;
                    background:color-mix(in srgb, var(--vscode-foreground) 6%, transparent); }
                .profbody > label { flex:1 1 130px; min-width:110px; font-size:12px; }
                /* ‼️ X-123 — why a value list is closed, and what a press
                   refused to do. Both are sentences, so both take the whole
                   width of the fold rather than squeezing in beside a select. */
                .profnote, .fperr { flex-basis:100%; font-size:11px; margin:0; }
                .profnote { color:var(--vscode-editorWarning-foreground, #b58900); }
                .fperr { color:var(--vscode-errorForeground); }
                .narrowask { margin:6px 0 8px; padding:8px; border-radius:4px;
                    font-size:12px; color:var(--vscode-editorWarning-foreground, #b58900);
                    border:1px solid currentColor; }
                .narrownote { font-size:11px; opacity:.8; flex-basis:100%;
                    color:var(--vscode-editorWarning-foreground, #b58900); }
                .fixedval { display:block; margin-top:3px; padding:5px 8px;
                    border:1px dashed color-mix(in srgb, var(--vscode-foreground) 30%, transparent);
                    border-radius:3px; opacity:.85; white-space:nowrap; }
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
                /* The account column when the engine has none — the SAME flex
                   slot as the select it stands in for, or the row above and the
                   row below stop being columns (B-02.2). */
                .tmnone { flex:1 1 132px; min-width:96px; max-width:168px;
                    text-align:center; opacity:.45; font-size:12px; cursor:default; }
                .limrow { display:flex; gap:14px; flex-wrap:wrap; }
                .limfield { font-size:11px; }
                .limfield input { width:90px; display:block; margin-top:3px; }
                .ferr { color:var(--vscode-errorForeground); font-size:12px; margin:8px 0; }
                /* U-103 — every refusal at once, so the list is a list. */
                .fplist { margin:4px 0 0; padding-left:18px; }
                .fplist li { margin:2px 0; }
                #f-browse { margin-top:4px; }
                /* ---- U-64: which kind of mission, and the objective fields ---- */
                .modeseg { display:inline-flex; margin:2px 0 10px; border-radius:6px; overflow:hidden;
                    border:1px solid var(--vscode-panel-border, rgba(128,128,128,.35)); }
                .segbtn { font-size:12px; padding:4px 14px; border:0; cursor:pointer; white-space:nowrap;
                    background:transparent; color:var(--vscode-foreground); }
                .segbtn + .segbtn { border-left:1px solid var(--vscode-panel-border, rgba(128,128,128,.35)); }
                .segbtn.on { background:var(--vscode-button-background); color:var(--vscode-button-foreground); }
                /* U-102 — the pool scope sits on the Pool heading line rather
                   than on a row of its own: it is a property of that list, and a
                   heading is where a list says what it contains. */
                .scopeseg { display:inline-flex; margin:0 8px 0 4px; border-radius:6px; overflow:hidden;
                    vertical-align:middle;
                    border:1px solid var(--vscode-panel-border, rgba(128,128,128,.35)); }
                .scopeseg .segbtn { font-size:11px; padding:2px 10px; }
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
                /* B-02.3 — this row is a TABLE row and its name may not be one
                   the composer already owns. It was .srow, which the mission
                   form above declares display:flex; a table row turned into a
                   flex container leaves the <thead> laying itself out alone, so
                   the delegation headers drifted into the right third of the
                   page while their own data stayed on the left. Nothing here
                   may set display on a <tr>/<td>/<th> class — test/test_table_row_display.js
                   reads every page script and fails on the collision. */
                .steprow { cursor:pointer; }
                .stoggle { width:14px; opacity:.7; }
                /* X-96 — the evidence cell holds two links on one line; the row
                   is already narrow, so it never wraps mid-word. */
                .slinks { white-space:nowrap; }
                .slinks a { cursor:pointer; }
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
                guide: 'missions',
                // S-123 — the other kind of orchestrated work, one press away
                related: [{ nav: 'chains', label: '⑂ Chains', name: 'Chains' }], relatedRow: true
            })}
            ${sentryHtml()}
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
        wireSentry();
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
            // ‼️ U-102 — switching scope reads first too, and the ticks are kept:
            // going to the whole fleet does not throw away the selection the
            // user may come back to.
            const setScope = (s) => { readForm(); form.poolScope = s; formErr = ''; render(); };
            wire('f-scope-fleet', () => setScope('fleet'));
            wire('f-scope-sel', () => setScope('selected'));
            wire('f-adv', () => { readForm(); advOpen = !advOpen; render(); });
            // ‼️ X-94 — the project box REDRAWS on change. Its MIRROR line and
            // the sentence beside it state what the run would be filed under
            // and who decided that, and both come from the preview: without
            // this the user picks a project and the page goes on telling them
            // the old answer until something else happens to repaint.
            const projSel = document.getElementById('f-project');
            if (projSel) { projSel.addEventListener('change', () => { readForm(); render(); }); }
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
                // ‼️ U-101 — untick a row and the strip must stop naming it. The
                // list is about INCLUDED rows, so the thing that decides who is
                // included has to refresh it or the warning outlives its subject.
                if (cb) { cb.addEventListener('change', () => { readForm(); askNarrow(); render(); }); }
                // ‼️ U-64 — a member's engine decides what its model box suggests
                // and whether its effort box has anything in it, so changing it
                // redraws the row. Same for the mission-wide engine below: every
                // member that states none inherits it.
                // ‼️ U-101 — and what no longer fits is ASKED ABOUT rather than
                // taken away. U-97 narrowed on the spot, which meant a model
                // somebody had typed disappeared while their eyes were on a
                // different control and the row afterwards gave no sign it had
                // ever held one.
                const en = document.getElementById('en-' + i);
                if (en) { en.addEventListener('change', () => { readForm(); askNarrow(); render(); }); }
                // The model decides which efforts exist (`AFEngine.efforts`
                // answers per engine AND per model), so it redraws the row too.
                const md = document.getElementById('md-' + i);
                if (md) { md.addEventListener('change', () => { readForm(); askNarrow(); render(); }); }
                // ‼️ X-107 — the tier list is the ROUTE's own, so moving the
                // route redraws the box under it and drops a tier the new route
                // does not serve (narrowTier says so on the row). The tier
                // itself only needs the preview to catch up, which a repaint
                // asks for.
                const pr = document.getElementById('pr-' + i);
                if (pr) { pr.addEventListener('change', () => { readForm(); narrowTier(a.id); render(); }); }
                const tr = document.getElementById('tr-' + i);
                if (tr) { tr.addEventListener('change', () => { readForm(); render(); }); }
            });
            // ‼️ X-107 — the planner's route decides whether its tier box exists
            // at all, so it redraws; the guarded read in readForm already drops
            // a tier whose route went.
            const plannerRoute = document.getElementById('f-planner-route');
            if (plannerRoute) {
                plannerRoute.addEventListener('change', () => {
                    readForm();
                    if (!tiersOf('claude', form.plannerProviderId).some(t => t.id === form.plannerTier)) { form.plannerTier = ''; }
                    render();
                });
            }
            const plannerTier = document.getElementById('f-planner-tier');
            if (plannerTier) { plannerTier.addEventListener('change', () => { readForm(); render(); }); }
            // ‼️ U-101 — THE BULK PROFILE. It writes onto the rows and leaves
            // nothing behind it; the dimensions left on "don't change" are not
            // touched, which is what stops an engine apply from wiping models.
            wire('f-profile', () => { readForm(); profileOpen = !profileOpen; profileErr = ''; render(); });
            wire('f-profile-apply', () => {
                readForm();
                readProfile();
                // ‼️ X-123 — PREFLIGHT, THEN ALL OF THEM OR NONE. The tool used
                // to write onto every included row and raise the warning
                // afterwards, which left a mixed pool half-profiled and the user
                // undoing it row by row.
                const faults = profileFaults();
                if (faults.length) {
                    profileErr = faults.join('\n');
                    render();
                    return;
                }
                profileErr = '';
                includedAgents().forEach(a => {
                    const set = (key, map) => {
                        if (profile[key] === 'keep') { return; }
                        map[a.id] = profile[key] === 'clear' ? '' : profile[key];
                    };
                    set('engine', form.engines);
                    set('model', form.models);
                    set('effort', form.efforts);
                    set('permissionMode', form.perms);
                    // ‼️ X-107 — the route, and the tier under it. Clearing
                    // the route takes its tier with it: a tier with no route
                    // is one word meaning a different model on every route.
                    set('providerId', form.routes);
                    set('tier', form.tiers);
                    if (!form.routes[a.id]) { form.tiers[a.id] = ''; }
                    delete narrowNote[a.id];
                });
                profileOpen = false;
                askNarrow();
                render();
            });
            PROFILE_KEYS.forEach(key => {
                const el = document.getElementById('pf-' + key);
                // The engine and the model change what the boxes below them may
                // offer (and the route what the tier box may), so choosing one
                // redraws the tool — the same rule a member row follows.
                if (el) { el.addEventListener('change', () => { readForm(); readProfile(); render(); }); }
            });
            wire('f-narrow-clear', () => {
                readForm();
                narrowAsk.forEach(applyNarrow);
                narrowAsk = [];
                render();
            });
            wire('f-narrow-keep', () => {
                readForm();
                // Kept deliberately: the row already marks an off-catalogue value
                // with ⚠, and the draft's refusal list says what the launch will
                // do about it. Nothing here is hidden by saying yes to it.
                narrowAsk = [];
                render();
            });
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
            wire('d-sessions-' + id, () => vscode.postMessage({ type: 'missionSessions', runId: id }));
            wire('d-approve-' + id, () => vscode.postMessage({ type: 'approve', runId: id }));
            wire('d-reject-' + id, () => vscode.postMessage({ type: 'reject', runId: id }));
            wire('d-send-' + id, () => {
                const inp = document.getElementById('d-answer-' + id);
                vscode.postMessage({ type: 'answer', runId: id, text: inp ? inp.value : '' });
                // an answer is never refused (the host only records it): sent is done, the box empties
                if (inp) { inp.value = ''; }
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
            case 'mstSession': {
                const s = findStep(runId, ctx.step);
                if (s && s.transcript) { vscode.postMessage({ type: 'openSession', file: s.transcript }); }
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

    // ‼️ M-33 — A HOST PUSH WAITS FOR THE READER'S HANDS; THE PAGE'S OWN
    // RENDERS DO NOT. render() replaces the whole of #app, so a repaint that
    // arrives while somebody is typing detaches the box they are typing in and
    // the caret falls to <body> — where space IS Page Down. Full text, and
    // what a page-specific busy() is for: media/afRepaint.js.
    // ‼️ U-219 — a steer or an answer typed into a live run's bare box survives the
    // once-a-second push; each box is emptied by the page once its text is sent.
    const draw = window.AFRepaint.keeping(render);
    const repaint = window.AFRepaint.guard(draw);
    window.addEventListener('message', ev => {
        const m = ev.data;
        if (m.type === 'data') {
            if (formOpen) { readForm(); }
            if (editing) { pendingData = { ...DATA, ...m.data }; return; }
            DATA = { ...DATA, ...m.data };
            repaint();
        } else if (m.type === 'focus-run' && m.id) {
            // ‼️ "OPEN THIS MISSION" HAS TO LAND ON THE MISSION. A project's
            // Work tab and a timeline row both say Open about one run; opening
            // the page at the top of a list and leaving the reader to find it
            // is the same as not having the button.
            openRuns.add(m.id);
            render();
            const el = document.querySelector('[data-run="' + m.id + '"]');
            if (el && el.scrollIntoView) { el.scrollIntoView({ block: 'center' }); }
        } else if (m.type === 'preview') {
            // ‼️ U-103 / X-118 — THE LATEST DRAFT ONLY, AND ONLY WHEN IT SAYS
            // SOMETHING NEW. `previewSeq` is the generation of the draft as it
            // stands right now, so an answer whose token is behind it was asked
            // about a draft the user has since edited — it is dropped before it
            // can paint anything, and before it can restart the clock on the
            // request the new draft is still waiting for. Repainting only on a
            // CHANGE stops the loop, because `render` is what asked for this in
            // the first place.
            if (m.seq !== previewSeq) { return; }
            const next = JSON.stringify(m.preview || null);
            if (next === JSON.stringify(PREVIEW)) { return; }
            PREVIEW = m.preview || null;
            if (formOpen) { readForm(); render(); }
        } else if (m.type === 'sentryProbe') {
            // ‼️ X-194 — THE LATEST DRAFT ONLY, on `preview`'s own rule: an
            // answer whose token is behind the draft was judged against rows
            // that have since moved, and painting it would mark the wrong line.
            if (m.seq !== probeSeq) { return; }
            const shape = (p) => p && JSON.stringify([p.verdict, p.hits, p.fired, p.problems]);
            const next = shape(m);
            if (next === shape(PROBE)) { return; }
            PROBE = {
                verdict: m.verdict, hits: m.hits || [], fired: m.fired || [],
                problems: m.problems || [], why: m.why || ''
            };
            if (sentryFormOpen) { readSentryForm(); render(); }
        } else if (m.type === 'formError') {
            readForm();
            formErr = m.error;
            render();
        } else if (m.type === 'sentryError') {
            // ‼️ X-177 — the campaign's refusal, or its acceptance. An empty
            // error IS the answer "it started": the form closes on it rather
            // than waiting for the payload to come round, so the switch answers
            // "did it take?" at once.
            if (sentryFormOpen) { readSentryForm(); }
            sentryErr = m.error || '';
            if (!sentryErr) { sentryFormOpen = false; sentryForm.prompt = ''; }
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
            // a refused steer keeps its words to fix; a queued one leaves the box empty
            if (!m.error) { const box = document.getElementById('gd-text-' + m.runId); if (box) { box.value = ''; } }
            draw();
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
