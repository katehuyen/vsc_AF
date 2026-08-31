// Agent Farm — Tasks: the agent-activity CONTROL PANEL.
//
// Two sides, because they are two different jobs:
//   PLAN — manage every work DEFINITION (schedule / trigger / workflow /
//          template) in one table. Search, filter, group, bulk-switch, add,
//          remove, edit. This is the primary surface.
//   RUN  — what those definitions actually did.
//
// Design rules this page follows:
//   * Active filters are ALWAYS visible as removable chips, with one reset.
//     A filter you forgot you set is worse than no filter at all.
//   * Nothing opens a mystery second page: detail expands inline in the row.
//   * Every object you can manage is reachable from one table, whatever its
//     internal type — the user manages "the thing that runs at 05:00", not
//     "a FarmSchedule".
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const C = window.AFCharts;
    let DATA = window.__DATA__;

    const post = (m) => vscode.postMessage(m);
    const saved = (typeof vscode.getState === 'function' && vscode.getState()) || {};

    // ‼️ M-24 — THE PROMPTS YOU SAVED, IN THE FORM THAT WRITES PROMPTS.
    // Four boxes here take one (the task's own prompt, the retry prompt, the
    // continuation prompt, a workflow step's prompt) and they are the prompts
    // nobody is sitting in front of when they run — so a phrase worded once and
    // retyped from memory afterwards is worse here than it is on the Console.
    // The picker is the same window the Console's send buttons open
    // (media/afSnippets.js); here the box IS the trigger, because there is no
    // send button to hang it off. SNIP_BOXES is the list, and it is the only
    // place a fifth prompt box has to be added.
    window.AFSnippets.init(vscode);
    const SNIP_HINT = window.AFSnippets.HINT;
    const SNIP_BOXES = ['nt-prompt', 'nt-retryprompt', 'nt-continuationprompt', 'nt-st-prompt'];
    // ‼️ M-27 — the same ceiling core/taskRounds.ts clamps to (seven days). The
    // box refuses it here so the user sees the limit rather than typing a number
    // that is silently cut down on the way in.
    const ROUND_DELAY_MAX_MIN = 7 * 24 * 60;

    let tab = DATA.tab || saved.tab || 'plan';
    let cmdText = '';
    let pendingCommand = false;

    // ---- view state, per tab; every field has a default so "reset" is exact --
    // The pick fields (kind/agent/model/state/guard · agent/status/source) are
    // multi-pick: null = all (no filter), array = that subset, [] = none.
    // See media/afFilters.js.
    const PLAN_DEF = { q: '', kind: null, agent: null, model: null, state: null, guard: null, issues: false, group: 'kind', sort: 'when', asc: true };
    const RUN_DEF = { q: '', agent: null, status: null, source: null, engine: null, sort: 'when', asc: false };
    const PICKS = { plan: ['kind', 'agent', 'model', 'state', 'guard'], run: ['agent', 'status', 'source', 'engine'] };
    let planView = Object.assign({}, PLAN_DEF, saved.planView || {});
    let runView = Object.assign({}, RUN_DEF, saved.runView || {});
    // a pre-3.21 saved view holds strings — carry the choice over as a one-item set
    [['plan', planView], ['run', runView]].forEach(([t, v]) => PICKS[t].forEach(k => {
        if (v[k] !== null && !Array.isArray(v[k])) { v[k] = v[k] ? [String(v[k])] : null; }
    }));
    const expanded = new Set();          // row keys with detail open
    const selected = new Set();          // "kind:id" of ticked plan rows
    let refocus = null;                  // element id to refocus after render
    let taskGuideOpen = false;           // floating architecture guide popup

    const KIND = {
        schedule: { icon: '⏰', label: 'Schedule', hint: 'runs at a set time' },
        trigger: { icon: '⚡', label: 'Trigger', hint: 'runs when something happens' },
        workflow: { icon: '🔗', label: 'Workflow', hint: 'a chain of steps' },
        template: { icon: '📋', label: 'Template', hint: 'a saved prompt you launch by hand' }
    };
    const ISSUE = {
        'no-guard': ['no guard', 'Fires whether or not there is work — every wake-up is paid before anyone can tell.'],
        'path-missing': ['path missing', 'The watched path does not exist, so this can never fire.'],
        'always-fails': ['always fails', 'Its last runs all failed.'],
        'never-ran': ['never ran', 'Enabled, but it has not fired once.'],
        'deferred': ['deferred', 'Held back by quiet hours; fires when the window ends.'],
        'empty': ['no steps', 'A workflow with no steps does nothing.'],
        // ‼️ M-7 — the badge for the thing that had no name: its minute has
        // passed and it has not run. The row says WHY in words underneath.
        'overdue': ['overdue', 'Its time has passed and it has not run. The row says what stopped it.']
    };

    function persist() {
        vscode.setState({ tab, planView, runView });
    }

    function fmtUSD(n) {
        if (!n) { return '—'; }
        return n >= 10 ? '$' + n.toFixed(0) : '$' + n.toFixed(2);
    }
    /**
     * ‼️ M-25 — THE SAME MONEY, FOR A FIGURE THAT WAS DIVIDED.
     *
     * `fmtUSD` is for a column two decimals wide, and it is right there. A
     * DERIVED rate is routinely smaller than a cent — cost per minute, cost per
     * run of a cheap schedule — and rounding those to `$0.00` prints the one
     * reading this page keeps having to argue against: that the work was free.
     * A real figure is shown to as many places as it takes to be one.
     */
    function fmtRate(n) {
        if (!n) { return '—'; }
        if (n >= 10) { return '$' + n.toFixed(0); }
        if (n >= 0.01) { return '$' + n.toFixed(2); }
        return '$' + n.toFixed(4);
    }
    function rel(ts) {
        if (!ts) { return '—'; }
        const s = Math.round((Date.now() - ts) / 1000);
        if (s < 0) { return 'now'; }
        if (s < 90) { return s + 's ago'; }
        if (s < 5400) { return Math.round(s / 60) + 'm ago'; }
        if (s < 129600) { return Math.round(s / 3600) + 'h ago'; }
        return Math.round(s / 86400) + 'd ago';
    }
    function until(ts) {
        if (!ts) { return '—'; }
        const d = new Date(ts);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const day = new Date(d); day.setHours(0, 0, 0, 0);
        const diff = Math.round((day - today) / 86400000);
        const hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
        if (diff === 0) { return hm; }
        if (diff === 1) { return 'tomorrow ' + hm; }
        return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()] + ' ' + hm;
    }

    // ---------------------------------------------------------------- header

    /* ======================================================================
       ‼️ M-21 — THE STRIP THAT SUMMARISES THE PAGE COULD NOT BE ASKED ANYTHING.

       M-25 took the five design principles through the Plan and Runs TABLES and
       stopped where the tables stop. The control strip above them is the first
       thing read on this page and it answered almost nothing: five of its eight
       figures had no hover AT ALL, three had a one-line `title` — which
       docs/CONVENTIONS.md names as a bug in its own right, not as a small tip —
       the shorthand durations `1h` / `8h` / `24h` had their long form written
       nowhere, and the two tabs did not say what was behind them.

       ONE SUBJECT is what splits them, and no figure explains another's:
         ⚙️ the CEILING and what is under it   · ⏳ what is waiting, and why
         🛡️ what a person has to decide        · 📅 the SHAPE of the plan
         🏁 today's outcome                    · 💵 the money
         🛡 what was never spent               · ⚠️ what is wrong
       ====================================================================== */

    /** A header AFTip. Anchored to the strip, so a long panel is measured
     *  against the block it belongs to rather than to a 4-character chip. */
    const htip = (trigger, head, body) =>
        window.AFTip.wrap(trigger, head, body, 'tip-free', 'data-aftip-anchor=".ctl"');

    /** `n thing` / `n things` — the tips below count seven different things. */
    const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));

    /** ‼️ A LIST IN A PANEL IS CAPPED AND SAYS SO. An unbounded one turns the
     *  panel into the table it was supposed to save you from opening. */
    function someOf(list, n, draw) {
        const head = list.slice(0, n).map(draw);
        if (list.length > n) { head.push('…and ' + (list.length - n) + ' more'); }
        return head;
    }

    /** The figures every header tip derives from, computed once per render. */
    function headerFacts(d) {
        const runs = d.runs || [];
        const plan = d.plan || [];
        const now = Date.now();
        const due = plan.filter(p => p.nextAt && p.nextAt > now).sort((a, b) => a.nextAt - b.nextAt);
        return {
            now, plan, due,
            running: runs.filter(r => r.status === 'running'),
            queued: runs.filter(r => r.status === 'queued'),
            parked: runs.filter(r => r.status === 'parked'),
            failedToday: runs.filter(r => r.status === 'failed'
                && r.when >= new Date(now).setHours(0, 0, 0, 0)),
            /** How many wake-ups fall inside the next `mins` minutes — the only
             *  honest answer to "what does pausing for an hour actually skip". */
            wakeIn: mins => plan.filter(p => p.nextAt && p.nextAt > now
                && p.nextAt <= now + mins * 60_000).length
        };
    }

    /** MIRROR — what the gate says RIGHT NOW, as the first line of the panel of
     *  every control that changes it. */
    function gateNowLine(g) {
        if (g.paused) { return 'Now: everything is paused' + (g.pauseReason ? ' — ' + g.pauseReason : ''); }
        if (g.pausedUntil && g.pausedUntil > Date.now()) {
            return 'Now: paused until ' + until(g.pausedUntil);
        }
        if (g.blocked) { return 'Now: held — ' + (g.blockReason || 'a gate is closed'); }
        return 'Now: automation is running';
    }

    /** The three named durations. SHORTHAND: the button is the short form and
     *  the panel opens with the long one. */
    const PAUSE_FOR = [[60, '1h', 'one hour'], [480, '8h', 'eight hours'], [1440, '24h', 'twenty-four hours']];

    function headerHtml(d) {
        const g = d.gate || {};
        const s = d.summary;
        const f = headerFacts(d);
        const paused = g.paused || (g.pausedUntil && g.pausedUntil > Date.now());
        const state = g.paused
            ? '<span class="pill stop">ALL PAUSED</span>' + (g.pauseReason ? ` <span class="muted small">${C.esc(g.pauseReason)}</span>` : '')
            : g.pausedUntil && g.pausedUntil > Date.now()
                ? `<span class="pill warn" title="${C.esc(window.AFTime.tip(g.pausedUntil, 'Paused until'))}">paused until ${C.esc(window.AFTime.clock(g.pausedUntil))}</span>`
                : g.blocked
                    ? `<span class="pill warn">${C.esc(g.blockReason)}</span>`
                    : '<span class="pill go">running</span>';
        const quiet = g.quietFrom ? `${C.esc(g.quietFrom)}–${C.esc(g.quietTo)}` : 'off';
        return `<div class="ctl">
            <div class="ctl-row">
                <span class="ctl-title">Automation</span> ${state}
                <span class="spacer"></span>
                ${paused
                ? htip('<button data-gate="resume">▶ Resume all</button>',
                    'Resume all — let the farm start work on its own again',
                    window.AFTip.lines([
                        gateNowLine(g), '',
                        'Lets the ' + plural(s.plansOn, 'switched-on definition')
                        + ' wake up again, and lets anything sitting in the queue launch.',
                        f.due.length
                            ? 'Next after this: ' + f.due[0].title + ' at ' + until(f.due[0].nextAt)
                            : 'Nothing is scheduled to wake up next — the pause was holding triggers and queued work only.',
                        '',
                        'A pause never dropped an occurrence: a schedule whose time passed while it was'
                        + ' held is deferred, not cancelled, so resuming can produce a run immediately.'
                    ]))
                : `${htip('<button class="secondary" data-gate="pause">⏸ Pause all</button>',
                    'Pause all — until you press resume',
                    window.AFTip.lines([
                        gateNowLine(g), '',
                        'Holds ' + plural(s.plansOn, 'switched-on definition') + ' of '
                        + s.plansSwitchable + ', every trigger, and every launch out of the queue.',
                        f.running.length
                            ? plural(f.running.length, 'run') + ' already going '
                            + (f.running.length === 1 ? 'is' : 'are') + ' NOT stopped — a pause is about starting, not killing.'
                            : 'Nothing is running, so nothing is interrupted.',
                        f.due.length
                            ? 'First wake-up it would hold: ' + f.due[0].title + ' at ' + until(f.due[0].nextAt)
                            : 'No schedule is due, so this holds triggers and queued work only.',
                        '',
                        'Nothing is lost. A due occurrence is deferred to the moment you resume.'
                    ]))}
                       <span class="btngroup">
                         ${PAUSE_FOR.map(([mins, short, long]) => htip(
                        `<button class="secondary mini" data-gate="pause-for:${mins}">${short}</button>`,
                        'Pause for ' + long,
                        window.AFTip.lines([
                            gateNowLine(g), '',
                            'Automation starts itself again at ' + until(Date.now() + mins * 60_000)
                            + ' — you do not have to come back and resume it.',
                            (w => w
                                ? plural(w, 'wake-up') + ' fall' + (w === 1 ? 's' : '')
                                + ' inside that window and would be deferred to the end of it.'
                                : 'No schedule is due inside that window, so this holds triggers'
                                + ' and queued work only.')(f.wakeIn(mins)),
                            '',
                            'Same hold as ⏸ Pause all, with an end on it.'
                        ]))).join('\n                         ')}
                       </span>`}
                ${/* ‼️ M-21 — MIRROR: this control cuts its own value down to two
                      clock times, so the panel opens with what it is set to. */''
            }${htip('<button class="secondary" data-gate="open">🌙 Quiet ' + quiet + '</button>',
                g.quietFrom ? 'Quiet hours: ' + g.quietFrom + ' – ' + g.quietTo : 'Quiet hours: off',
                window.AFTip.lines([
                    g.quietFrom
                        ? 'Between those two times nothing wakes on its own.'
                        : 'No nightly window is set — the farm wakes at any hour.',
                    '',
                    'A schedule due inside the window is DEFERRED to the moment the window ends,'
                    + ' never dropped: the occurrence still happens, later.',
                    'Work you start by hand is not affected, and a run already going is not stopped.',
                    g.quietFrom && f.due.length
                        ? ''
                        : undefined,
                    g.quietFrom && f.due.length
                        ? 'Next wake-up as it stands: ' + f.due[0].title + ' at ' + until(f.due[0].nextAt)
                        : undefined,
                    '', 'Press to change the window.'
                ]))}
            </div>
            ${/**
                * ‼️ M-7 — THE GATE IN FRONT OF EVERY OTHER GATE, AND IT WAS
                * INVISIBLE. Only ONE VS Code window fires schedules and launches
                * queued work (the ownership lease, B11); in every other window
                * the scheduler tick returns immediately and writes nothing. So a
                * schedule's time passed, nothing happened, nothing was logged,
                * and this page — the page whose entire subject is automation —
                * drew a healthy row with tomorrow's date on it. The window that
                * cannot fire says so, at the top, before anything else is read.
                */ ''}
            ${g.runsQueue === false ? `<div class="notrunner">
                ⚠ <b>Schedules do not fire from this window.</b> Another VS Code window holds the
                queue lease and runs everything: schedules, triggers, and anything waiting to launch.
                What you see here is a live mirror of that window's store, so the rows are real — but
                pressing <b>run</b> here does nothing on its own, and a schedule whose time passes will
                fire over there. Close the other window (or use it) to take the lease.
            </div>` : ''}
            ${gateEdit ? gateHtml(g) : ''}
            <div class="ctl-row stats">
                ${htip(`<span class="stat">⚙️ <b>${s.running}</b>/${s.runLimit} running</span>`,
                `${s.running} of ${s.runLimit} launch slots in use`,
                window.AFTip.lines([
                    'The farm runs at most ' + plural(s.runLimit, 'task') + ' at once, and at most '
                    + plural(d.perAgentLimit || 1, 'task') + ' per agent. Everything else waits.',
                    f.running.length ? '' : undefined,
                    ...someOf(f.running, 6, r => '· ' + r.agentName + ' — ' + r.title
                        + (r.durMin !== undefined ? '  (' + r.durMin + 'm)' : '')),
                    '',
                    s.running >= s.runLimit
                        ? 'The ceiling is full, so nothing new starts until one of these ends.'
                        : plural(s.runLimit - s.running, 'slot') + ' free — a queued task can launch now.',
                    'agentFarm.maxConcurrentTasks and .maxConcurrentPerAgent are the two numbers.'
                ]))}
                ${s.queued ? htip(`<span class="stat">⏳ <b>${s.queued}</b> queued</span>`,
                    plural(s.queued, 'task') + ' waiting to launch',
                    window.AFTip.lines([
                        'Sorted by priority, and a task gains a point every 30 minutes it waits,'
                        + ' so nothing starves behind a busy agent.',
                        (o => o ? 'The one that has waited longest was made ' + rel(o.when) + '.' : undefined)(
                            f.queued.slice().sort((a, b) => a.when - b.when)[0]),
                        f.queued.length ? '' : undefined,
                        ...someOf(f.queued, 6, r => '· ' + r.agentName + ' — ' + r.title
                            + (r.source ? '  (' + r.source + ')' : '')),
                        f.parked.length ? '' : undefined,
                        f.parked.length
                            ? plural(f.parked.length, 'other') + ' held at a ceiling rather than'
                            + ' waiting in line — those say “parked”, and the row says which ceiling.'
                            : undefined
                    ])) : ''}
                ${s.needsYou ? htip(
                    `<span class="stat hot" data-open="open-needs" role="button" tabindex="0">🛡️ <b>${s.needsYou}</b> need you</span>`,
                    plural(s.needsYou, 'thing') + ' the farm will not decide by itself',
                    window.AFTip.lines([
                        'A permission the agent stopped to ask for, a browser action waiting for a yes,'
                        + ' or a run that has gone quiet. Work stops at each of these until you answer.',
                        (d.needs || []).length ? '' : undefined,
                        ...someOf(d.needs || [], 8, i => '· ' + i.agentName + ' — ' + i.title
                            + '  (' + i.kind.replace('-', ' ') + ')'),
                        '', 'Press to open the Needs page and answer them.'
                    ])) : ''}
                ${htip(`<span class="stat">📅 <b>${s.plansOn}</b>/${s.plansSwitchable} switched on</span>`,
                    s.plansOn + ' of ' + s.plansSwitchable + ' switchable definitions are on',
                    window.AFTip.lines([
                        // ‼️ A KIND WITH NOTHING IN IT IS NOT A FIGURE. "0 workflows"
                        // in a sentence listing what the plan holds is a word the
                        // reader has to read to discover it says nothing.
                        'Counted over ' + plural(f.plan.length, 'definition') + ' on the Plan tab: '
                        + ['schedule', 'trigger', 'workflow', 'template']
                            .map(k => f.plan.filter(p => p.kind === k).length)
                            .map((n, i) => n ? plural(n, ['schedule', 'trigger', 'workflow', 'template'][i]) : '')
                            .filter(Boolean).join(' · ') + '.',
                        'Workflows and templates have no on/off state — they are launched, not woken —'
                        + ' so they are not in this fraction.',
                        s.plansSwitchable - s.plansOn
                            ? plural(s.plansSwitchable - s.plansOn, 'definition')
                            + ' ' + (s.plansSwitchable - s.plansOn === 1 ? 'is' : 'are')
                            + ' saved and switched off: it stays on the list and never fires.'
                            : 'Every switchable definition is on.',
                        f.due.length ? '' : undefined,
                        ...someOf(f.due, 4, p => '· ' + until(p.nextAt) + ' — ' + p.title)
                    ]))}
                ${htip(`<span class="stat">🏁 today <b>${s.doneToday}</b>✓${s.failedToday ? ` <b class="bad">${s.failedToday}</b>✗` : ''}</span>`,
                    'Since midnight: ' + s.doneToday + ' finished, ' + s.failedToday + ' failed',
                    window.AFTip.lines([
                        (t => t
                            ? Math.round(s.doneToday / t * 100) + '% of the ' + t
                            + ' runs that ended today ended well.'
                            : 'Nothing has ended today yet.')(s.doneToday + s.failedToday),
                        'Counted off the run records, so a run cleared from the list still counts —'
                        + ' this figure and the length of the Runs tab are different questions.',
                        f.failedToday.length ? '' : undefined,
                        ...someOf(f.failedToday, 5, r => '· failed — ' + r.agentName + ' — ' + r.title)
                    ]))}
                ${htip(`<span class="stat">💵 <b>${fmtUSD(s.cost7d)}</b>/7d</span>`,
                    fmtUSD(s.cost7d) + ' over seven days, across every definition',
                    window.AFTip.lines([
                        (n => n
                            ? plural(n, 'run') + ' came out of the plan in that week — '
                            + fmtRate(s.cost7d / n) + ' a run on average.'
                            : 'No definition has produced a run in the last seven days.')(
                                f.plan.reduce((a, p) => a + (p.runs7d || 0), 0)),
                        'Work you started by hand is not in this figure: it is what the farm spent'
                        + ' on its OWN, which is the number a ceiling is set against.',
                        '',
                        ...someOf(f.plan.filter(p => p.cost7d > 0).sort((a, b) => b.cost7d - a.cost7d),
                            5, p => '· ' + fmtUSD(p.cost7d) + ' — ' + p.title
                                + (p.runs7d ? '  (' + p.runs7d + ' run(s))' : '')),
                        f.plan.some(p => p.cost7d > 0) ? undefined
                            : 'Nothing has been priced yet in this window.'
                    ]))}
                ${s.savedWakeups7d ? htip(
                    `<span class="stat">🛡 <b>${s.savedWakeups7d}</b> saved</span>`,
                    plural(s.savedWakeups7d, 'wake-up') + ' a guard suppressed in seven days',
                    window.AFTip.lines([
                        'A guard is a precondition checked BEFORE the agent is started, so each of'
                        + ' these is a run that was never spawned and never paid for — the whole'
                        + ' reason a schedule has one.',
                        (w => w
                            ? s.savedWakeups7d + ' of ' + w + ' wake-ups came to nothing — '
                            + Math.round(s.savedWakeups7d / w * 100) + '% of what the guarded rows'
                            + ' would have cost was never spent.'
                            : undefined)(s.savedWakeups7d
                                + f.plan.filter(p => p.skipped7d > 0).reduce((a, p) => a + (p.runs7d || 0), 0)),
                        '',
                        ...someOf(f.plan.filter(p => p.skipped7d > 0).sort((a, b) => b.skipped7d - a.skipped7d),
                            5, p => '· ' + p.skipped7d + ' skipped of '
                                + (p.skipped7d + (p.runs7d || 0)) + ' — ' + p.title
                                + (p.guard ? '  (' + p.guard + ')' : ''))
                    ])) : ''}
                ${s.issues ? htip(
                    `<span class="stat hot" data-fixissues role="button" tabindex="0">⚠️ <b>${s.issues}</b> need attention</span>`,
                    plural(s.issues, 'definition') + ' with something wrong',
                    window.AFTip.lines([
                        'Only rows that are switched ON (or cannot be switched off) are counted —'
                        + ' a problem in something deliberately disabled is not a problem.',
                        '',
                        ...someOf(f.plan.filter(p => p.issues.length && (p.enabled || !p.switchable)), 6,
                            p => '· ' + p.title + ' — '
                                + p.issues.map(i => (ISSUE[i] || [i])[0]).join(', ')),
                        '', 'Press to filter the Plan tab down to exactly these rows.'
                    ])) : ''}
            </div>
        </div>`;
    }

    /**
     * ‼️ THE GATE'S OWN TWO DIALOGS — the last ones on this page.
     *
     * The header's 🌙 button called `agentfarm.setQuietHours`, which asked a
     * quickpick of two canned windows and then, for anything else, two more
     * input boxes; `pauseAutomations` asked a duration and then typed the
     * reason into a third. Both are two numbers and a sentence, on the strip
     * that already shows what they set.
     *
     * `gateEdit` is `'quiet' | 'pause' | null` — which half opened it. Both
     * halves are drawn either way, because they are one thing: what the farm is
     * allowed to do on its own.
     */
    let gateEdit = null;
    let gateFrom = '', gateTo = '', gateReason = '', gateMins = '0', gateMsg = '';

    /** Open the gate card, filled from what the gate currently says. */
    function openGate(which) {
        const g = (DATA && DATA.gate) || {};
        gateEdit = which || 'quiet';
        gateFrom = g.quietFrom || '23:00';
        gateTo = g.quietTo || '07:00';
        gateReason = g.pauseReason || '';
        gateMins = '0';
        gateMsg = '';
        render();
    }

    function gateHtml(g) {
        return `<div class="ntbox" id="gtbox">
            <div class="ctl-row">
                <span class="ctl-title">What the farm may do on its own</span>
                <span class="spacer"></span>
                <button class="secondary mini" id="gt-close">✕</button>
            </div>
            <div class="ntsec"><b>Quiet hours</b>
                <span class="muted small">Nothing wakes inside the window. A schedule that comes due in it is
                    <b>deferred to the end of the window</b>, never dropped.</span></div>
            <div class="ntgrid">
                <label class="ntf" title="When the window starts, local 24h."><span>From</span>
                    <input type="time" id="gt-from" value="${C.esc(gateFrom)}"></label>
                <label class="ntf" title="When it ends. An end earlier than the start means the window crosses midnight."><span>To</span>
                    <input type="time" id="gt-to" value="${C.esc(gateTo)}"></label>
                <span class="ntf"><span>&nbsp;</span><span class="btngroup">
                    <button class="mini" id="gt-quiet">Set the window</button>
                    <button class="mini secondary" id="gt-quietoff"${g.quietFrom ? '' : ' disabled'}>Turn it off</button>
                </span></span>
            </div>
            <div class="ntsec"><b>Pause everything</b>
                <span class="muted small">The master switch. ‼️ Say WHY — a pause with no reason is the one that
                    is still on three days later with nobody able to explain it.</span></div>
            <div class="ntgrid">
                <label class="ntf" title="How long the pause lasts."><span>For</span>
                    <select id="gt-mins">
                        <option value="0"${gateMins === '0' ? ' selected' : ''}>until I resume it</option>
                        <option value="60"${gateMins === '60' ? ' selected' : ''}>1 hour</option>
                        <option value="480"${gateMins === '480' ? ' selected' : ''}>8 hours</option>
                        <option value="1440"${gateMins === '1440' ? ' selected' : ''}>24 hours</option>
                    </select></label>
                <label class="ntf wide" title="Shown on this strip and on the Living page for as long as the pause lasts."><span>Reason</span>
                    <input type="text" id="gt-reason" value="${C.esc(gateReason)}" placeholder="e.g. reviewing what last night cost"></label>
                <span class="ntf"><span>&nbsp;</span>
                    <button class="mini" id="gt-pause">⏸ Pause it</button></span>
            </div>
            ${gateMsg ? `<div class="ntmsg warn">${C.esc(gateMsg)}</div>` : ''}
        </div>`;
    }

    function tabsHtml(d) {
        const f = headerFacts(d);
        // ‼️ M-21 — A TAB IS A DOOR AND IT SAID NOTHING ABOUT THE ROOM. Two
        // words and a count, no hover at all: whether the thing you are looking
        // for is a DEFINITION or an EXECUTION is the one distinction this whole
        // page is built on, and the control that switches between them was the
        // one place it was not written down.
        const T = [
            ['plan', '📅 Plan', d.plan.length,
                plural(d.plan.length, 'definition') + ' — work that has not happened yet',
                window.AFTip.lines([
                    'A schedule, a trigger, a workflow or a template: the thing that DECIDES a run,'
                    + ' not the run. Editing one here changes every future execution and no past one.',
                    '',
                    ['schedule', 'trigger', 'workflow', 'template'].map(k => {
                        const n = f.plan.filter(p => p.kind === k).length;
                        return n ? KIND[k].icon + ' ' + n + ' ' + KIND[k].label.toLowerCase()
                            + (n === 1 ? '' : 's') + ' — ' + KIND[k].hint : undefined;
                    }).filter(Boolean).join('\n'),
                    '',
                    f.due.length
                        ? 'Next to wake: ' + f.due[0].title + ' at ' + until(f.due[0].nextAt)
                        : 'Nothing here is due to wake up on its own.',
                    d.summary.issues
                        ? d.summary.issues + ' of them have something wrong with them.'
                        : undefined
                ])],
            ['run', '▶ Runs', d.runs.length, plural(d.runs.length, 'execution') + ' on the list',
                window.AFTip.lines([
                    'One row is one execution — what a definition on the Plan tab actually did, or'
                    + ' what you started by hand. Nothing here can be edited; it has already happened.',
                    '',
                    f.running.length + ' running · ' + f.queued.length + ' queued · '
                    + f.parked.length + ' parked',
                    'Today: ' + d.summary.doneToday + ' finished, ' + d.summary.failedToday + ' failed.',
                    '',
                    'The list is capped and the oldest rows are filed month by month — ⌛ Archive'
                    + ' in the toolbar reads them back.'
                ])]
        ];
        return `<div class="tabs">${T.map(([id, label, n, head, body]) => window.AFTip.wrap(
            `<button class="tab ${id === tab ? 'on' : ''}" data-tab="${id}">${label} <span class="tab-n">${n}</span></button>`,
            head, body, 'tip-free', 'data-aftip-anchor=".tabs"')).join('')}
            <span class="spacer"></span>
            ${/* ‼️ M-21 — MAKING A TASK IS NOT A THING YOU DO ON THE RUNS TAB.
                  The button lived in the Runs filter bar, beside "Cancel queued"
                  and "Clear finished", which are things you do TO a list of runs
                  — while the form it opens is a Plan-shaped act. Worse, it was
                  invisible from the Plan tab, so the one page you would be on
                  while thinking about what to set up was the page that could not
                  start it. Up here it belongs to the PAGE, like Analytics, and
                  is reachable from either tab; `openComposer` already moves the
                  tab under it, so pressing it from Plan lands on the form. */''}
            <button id="nt-open"${composer ? ' disabled' : ''} title="Make a task, with every dimension a session start offers — agent, model, effort, permissions, project, priority, folder. It can be turned into a schedule or a trigger while you are still writing it.">+ New task</button>
            <button class="secondary" data-open="open-analytics" title="30-day throughput, agent scorecards, task families and the forecast — reading, not managing">📊 Analytics</button>
        </div>`;
    }

    // ------------------------------------------------------- filter plumbing

    // Every pick filter on the page, so the markup and the wiring are built from
    // one list (options are recomputed per render — the data moves).
    let pickDefs = [];
    /** A multi-pick dropdown: tick any combination, not "all or exactly one".
     *  `presets` are this list's own named subsets (U-52) — the component knows
     *  the mechanism and only the caller knows what "Automation" means. */
    function sel(name, label, value, options, presets) {
        const id = 'tf-' + tab + '-' + name;
        pickDefs.push({ id, name, options });
        return window.AFFilter.multi({
            id, label, options, selected: value, presets: presets || [],
            title: 'Filter by ' + label.toLowerCase() + ' — tick any combination'
        });
    }

    /**
     * ‼️ U-52 — "EVERYTHING THAT IS NOT THE DEFAULT ENGINE", the question a
     * four-engine list is read with, wherever such a list is drawn. Same subset,
     * same words and the same guard as the sessions table: Claude alone is a
     * single option, which a click on its own name already gives you, so the
     * preset only appears once there is more than one other engine — otherwise
     * it would be a slower way to click one row.
     */
    function otherEnginePresets(labels) {
        const rest = (labels || []).filter(e => e !== window.AFEngine.label('claude'));
        return rest.length > 1 ? [{
            id: 'notclaude', label: 'Other engines', values: rest,
            title: 'Everything that did not run on the default engine.'
        }] : [];
    }

    /** A pick filter's chip text: one value by name, several as a count. */
    function pickText(v) {
        if (!v.length) { return 'none'; }
        return v.length === 1 ? String(v[0]) : v.length + ' picked';
    }

    /** The always-visible record of what is currently hiding rows from you. */
    function activeChips(view, def, labels, shown, total) {
        const chips = [];
        for (const k of Object.keys(def)) {
            if (k === 'sort' || k === 'asc' || k === 'group') { continue; }
            const v = view[k];
            if (v === def[k] || v === '' || v === false || v === null) { continue; }
            const shownVal = Array.isArray(v) ? pickText(v) : v;
            const text = k === 'q' ? `“${v}”` : (labels[k] ? `${labels[k]}: ${shownVal}` : String(shownVal));
            chips.push(`<span class="chip" data-clear="${k}" role="button" tabindex="0" title="remove this filter">${C.esc(text)} ✕</span>`);
        }
        if (!chips.length) { return ''; }
        return `<div class="chips">
            <span class="muted small">showing ${shown} of ${total} —</span>
            ${chips.join('')}
            <button class="mini" data-resetview>Reset filters</button>
        </div>`;
    }

    // `tip` is the COLUMN's definition, and it belongs here rather than on every
    // cell (docs/CONVENTIONS.md — defined once, on the heading). Without one the
    // header keeps its old bare "sort".
    function sortCell(view, key, label, num, tip) {
        const on = view.sort === key;
        const title = tip ? tip + ' · click to sort' : 'sort';
        return `<th class="sortable${num ? ' num' : ''}" data-sort="${key}" title="${C.esc(title)}">${C.esc(label)}${on ? (view.asc ? ' ▲' : ' ▼') : ''}</th>`;
    }

    function applySort(rows, view, getters) {
        const get = getters[view.sort] || (() => 0);
        return rows.slice().sort((a, b) => {
            const x = get(a), y = get(b);
            const c = typeof x === 'string' ? String(x).localeCompare(String(y)) : (x || 0) - (y || 0);
            return view.asc ? c : -c;
        });
    }

    // ------------------------------------------------------------- PLAN side

    function planRows(d) {
        const v = planView;
        // the box is a QUERY, not a substring — media/afQuery.js
        const q = window.AFQuery.compile(v.q);
        return d.plan.filter(p => {
            if (v.kind && v.kind.indexOf(p.kind) < 0) { return false; }
            if (v.agent && v.agent.indexOf(p.agentName) < 0) { return false; }
            if (v.model && v.model.indexOf(p.model || 'default') < 0) { return false; }
            // a row that can't be switched at all is neither on nor off
            if (v.state && !(p.switchable && v.state.indexOf(p.enabled ? 'on' : 'off') >= 0)) { return false; }
            if (v.guard && v.guard.indexOf(p.hasGuard ? 'yes' : 'no') < 0) { return false; }
            if (v.issues && !p.issues.length) { return false; }
            if (!q.empty && !q.test(p.title + ' ' + p.detail.prompt + ' ' + p.when + ' ' + p.agentName)) { return false; }
            return true;
        });
    }

    /**
     * What a plan row IS, for the right-click menu.
     *
     * The flags are what the menu's `when` clauses read — `afSwitchable`/`afOn`
     * decide whether "switch on" or "switch off" is drawn, `afKind` whether the
     * row gets "Add a step…" or "Edit it…". The words are NOT carried: the
     * handler looks the row up in the data the page already holds, so a prompt
     * that runs to paragraphs is not written into the markup a second time.
     */
    function planCtx(p) {
        return window.AFCtx.row('afPlanRow', {
            planKind: p.kind, planId: p.id,
            afKind: p.kind, afOn: !!p.enabled, afSwitchable: !!p.switchable
        });
    }

    /**
     * ‼️ M-21 — THE LAUNCH, NOT HALF OF IT.
     *
     * This cell used to be the model alone. A schedule moved to Antigravity but
     * still carrying the model name `haiku` therefore read exactly like an
     * ordinary Claude one — which is how a user reverted an engine, saw the old
     * model on the row, and concluded the revert had taken when it had not. The
     * engine is shown whenever one is stated; "default" still means the
     * launcher's own choice, both parts of it.
     */
    function launchCell(p) {
        if (!p.engine && !p.model) {
            return p.switchable || p.kind === 'template'
                ? '<td><span class="muted">default</span></td>'
                : '<td><span class="muted">—</span></td>';
        }
        const bits = [];
        if (p.engine) { bits.push(`<span class="badge">${C.esc(p.engine)}</span>`); }
        if (p.model) { bits.push(`<span class="badge">${C.esc(p.model)}</span>`); }
        // ‼️ M-25 — FIGURES, NOT A PARAGRAPH. What the column MEANS is on its
        // <th>; repeating it under every row was two lines of hover spent on a
        // sentence the reader had already read once per row above.
        return `<td title="${C.esc([
            'Engine: ' + (p.engine || 'the launcher\'s default'),
            'Model: ' + (p.model || 'the launcher\'s default'),
            'Effort: ' + (setupValue(p, 'Effort') || 'the launcher\'s default'),
            'Permissions: ' + (setupValue(p, 'Permissions') || 'the launcher\'s default')
        ].join('\n'))}">${bits.join(' ')}</td>`;
    }

    /** One labelled value out of a row's own setup list — the ▸ already holds
     *  these, and a fact the reader can have on hover must not cost a click. */
    function setupValue(p, label) {
        const hit = ((p.detail && p.detail.setup) || [])
            .find(x => String(x.label).toLowerCase() === String(label).toLowerCase());
        return hit ? String(hit.value) : '';
    }

    /**
     * ‼️ M-25 — WHAT THE WHOLE PAGE ALREADY KNOWS ABOUT ONE AGENT.
     *
     * Every figure in an agent's hover is derived from the rows already in
     * front of the reader — no second query, which is what makes a dense table
     * cheap (docs/CONVENTIONS.md → fill the space with figures instead).
     */
    function agentTally(list) {
        const by = {};
        for (const p of list || []) {
            const name = p.agentName || '';
            if (!name) { continue; }
            const t = by[name] || (by[name] = { defs: 0, on: 0, runs7d: 0, cost7d: 0 });
            t.defs++;
            if (p.switchable && p.enabled) { t.on++; }
            t.runs7d += p.runs7d || 0;
            t.cost7d += p.cost7d || 0;
        }
        return by;
    }

    function planRowHtml(p, tally) {
        const key = p.kind + ':' + p.id;
        const k = KIND[p.kind];
        const open = expanded.has(key);
        const badges = p.issues.map(i =>
            `<span class="badge warn" title="${C.esc((ISSUE[i] || ['', ''])[1])}">${C.esc((ISSUE[i] || [i])[0])}</span>`).join(' ');
        // ‼️ M-25 — THE GUARD'S OWN PANEL. It used to be a native `title`
        // holding the SAME words the cell had just drawn, which is the purest
        // form of a wasted hover: a guard is text and can grow to a path and a
        // window, so it is an AFTip, and what it has actually saved goes with
        // it because that is the only question a guard raises.
        const guard = p.hasGuard
            ? tipw(`<span>🛡 ${C.esc(p.guard)}</span>${p.skipped7d ? `<div class="muted small">saved ${p.skipped7d} wake-up(s)</div>` : ''}`,
                `Guard — ${p.skipped7d || 0} wake-up(s) saved in 7 days`,
                window.AFTip.lines([
                    // ‼️ the blank belongs to the STRING — AFTip.lines drops an
                    // empty entry, so a separator written as one vanishes.
                    p.guard + '\n',
                    'Skipped: ' + (p.skipped7d || 0) + ' of ' + ((p.skipped7d || 0) + (p.runs7d || 0))
                    + ' wake-up(s) in 7 days' + (p.skipRate ? ' (' + p.skipRate + '%)' : ''),
                    'Ran: ' + (p.runs7d || 0) + ' time(s), costing ' + fmtUSD(p.cost7d),
                    p.skipped7d
                        ? 'Every skip is an agent run that was never started and never paid for.'
                        : 'Nothing has been skipped yet — the condition has held every time.'
                ]))
            : (p.switchable
                ? `<span class="muted" title="${C.esc('No precondition: every wake-up launches. '
                    + 'A guard is what stops one from paying for a run that had nothing to do.')}">—</span>`
                : '');
        // ‼️ M-25 · MIRROR — a control says what is IN it before what it is for.
        // The switch is a bare square: its own state is readable only from a
        // colour, so its hover opens on the state and then says what the press
        // would do.
        const stateCell = p.switchable
            ? `<button class="sw ${p.enabled ? 'on' : 'off'}" data-plan="toggle" data-kind="${p.kind}" data-id="${p.id}"
                    title="${C.esc((p.enabled ? 'On — it fires on its own.' : 'Off — it is saved and complete, but nothing will start it.')
                + '\n' + (p.nextAt && p.enabled ? 'Next: ' + until(p.nextAt) : '')
                + '\n\nPress to switch it ' + (p.enabled ? 'off' : 'on') + '.')}" aria-pressed="${p.enabled}"><span></span></button>`
            : `<span class="muted small" title="${C.esc('It has no switch: a ' + (KIND[p.kind] || { label: p.kind }).label
                + ' runs when it is launched, never on its own.')}">manual</span>`;
        return `<tr class="prow ${open ? 'open' : ''}" data-key="${key}"
            ${planCtx(p)} title="${C.esc(window.AFCtx.hint(k.label + ' — ' + k.hint))}">
            ${/* ‼️ M-33 — EVERY ROW TICKS, NOT ONLY THE SWITCHABLE ONES. The
                  box used to exist only where the bulk bar had something to do
                  with it, so the two kinds that cannot be switched — a workflow
                  and a template — could not be picked at all, and the one act
                  that DOES apply to all four (delete) had no way to reach them.
                  What a press does with a selection is the bar's problem; being
                  selectable is the row's. */''}
            <td class="tick"><input type="checkbox" class="rowsel" data-kind="${p.kind}" data-id="${p.id}"
                data-sw="${p.switchable ? '1' : ''}"${selected.has(key) ? ' checked' : ''}
                title="${C.esc('Pick this ' + k.label + ' for the bar above'
                + (p.switchable ? '.' : ' — it has no switch, so only Delete acts on it.'))}"></td>
            ${/* ‼️ M-25 · MIRROR — the triangle says which way it is pointing and
                  what is behind it. "details" was one word about neither. */''}
            <td class="expand" data-expand="${key}" role="button" tabindex="0"
                title="${C.esc((open ? 'Open — press to close it.' : 'Closed — press to open it.')
            + '\n\nBehind it: the whole setup ' + (p.detail && p.detail.setup ? '(' + p.detail.setup.length + ' field(s))' : '')
            + (p.detail && p.detail.steps && p.detail.steps.length ? ', its ' + p.detail.steps.length + ' step(s)' : '')
            + (p.detail && p.detail.prompt ? ', and the prompt it sends' : '') + '.')}">${open ? '▾' : '▸'}</td>
            <td class="main">
                ${window.AFTip.wrap(`<div class="rowtitle"><span title="${C.esc(k.hint)}">${k.icon}</span> <b>${C.esc(p.title)}</b> ${badges}</div>
                <div class="muted small">${C.esc(p.when)}${p.nextAt ? ` · next ${C.esc(until(p.nextAt))}` : ''}</div>
                ${/* ‼️ M-7 — SAID ON THE ROW, NOT ONLY IN A HOVER. "Its time came
                      and went and the page went on looking healthy" is the whole
                      complaint; a fact you have to hover to find would be the
                      same failure one layer in. */''}
                ${p.overdue ? `<div class="overdue small">⚠ ${C.esc(p.overdue)}</div>` : ''}`,
            `${k.label} · ${p.when}${p.nextAt ? ' · next ' + until(p.nextAt) : ''}`,
            window.AFTip.lines([
                p.overdue ? '⚠ ' + p.overdue + '\n' : '',
                setupLines(p.detail && p.detail.setup).join('\n'),
                p.detail && p.detail.prompt ? '\n' + p.detail.prompt : ''
            ]), 'tip-free mainw', 'data-aftip-anchor=".prow"')}
            </td>
            ${/* ‼️ M-25 — the AGENT, with what this page already knows about it.
                  A name on its own is the one thing the cell had already drawn;
                  the question a reader has here is "what else is this agent
                  carrying, and what has it been costing me". */''}
            <td class="agent">${p.agentName
            ? tipw(C.esc(p.agentName), p.agentName + ' — on this page',
                (t => window.AFTip.lines([
                    'Definitions: ' + t.defs + (t.defs > 1 ? ' on this page run as this agent' : ' — this is the only one'),
                    p.switchable ? 'Switched on: ' + t.on + ' of ' + t.defs : '',
                    'Runs, 7 days: ' + t.runs7d + ' (this row: ' + (p.runs7d || 0) + ')',
                    'Cost, 7 days: ' + fmtUSD(t.cost7d) + ' (this row: ' + fmtUSD(p.cost7d) + ')',
                    setupValue(p, 'Working folder') ? '\nWorking folder: ' + setupValue(p, 'Working folder') : ''
                ]))(((tally || {})[p.agentName]) || { defs: 1, on: 0, runs7d: p.runs7d || 0, cost7d: p.cost7d || 0 }))
            : `<span class="muted" title="${C.esc('This definition names no agent — the launcher asks for one, '
                + 'or picks its default, at the moment it runs.')}">—</span>`}</td>
            ${launchCell(p)}
            <td class="guardcell">${guard}</td>
            ${/* ‼️ M-25 — WHAT IT COST, AND WHAT THAT DIVIDES INTO. A money
                  figure with a run count under it implies a rate the reader was
                  being left to work out; and a $0.00 with runs behind it is the
                  one reading that must not be left as "free". */''}
            <td class="num">${tipw(`${fmtUSD(p.cost7d)}${p.runs7d ? `<div class="muted small">${p.runs7d} run(s)</div>` : ''}`,
            `${fmtUSD(p.cost7d)} over 7 days`,
            window.AFTip.lines([
                'Total, 7 days: ' + fmtUSD(p.cost7d),
                'Runs: ' + (p.runs7d || 0),
                p.runs7d ? 'Per run: ' + fmtRate((p.cost7d || 0) / p.runs7d) : '',
                p.skipped7d ? 'Skipped: ' + p.skipped7d + ' wake-up(s)'
                    + (p.skipRate ? ' (' + p.skipRate + '% of them)' : '') + ' — never started, never paid for' : '',
                p.runs7d && !p.cost7d
                    ? '\nRuns with no cost behind them: this engine bills a plan and publishes no price per run, '
                    + 'so nothing here is a claim that the work was free.'
                    : (!p.runs7d ? '\nIt has not run in the last 7 days.' : '')
            ]))}</td>
            ${/* ‼️ M-25 — the LAST RUN, whole: the exact moment (in both clocks,
                  media/afTime.js) and what happened that time. "3d ago" is the
                  shorthand; the panel carries the long form. */''}
            <td class="lastrun">${p.lastRunAt
            ? tipw(`${C.esc(rel(p.lastRunAt))}${p.lastNote ? `<div class="muted small">${C.esc(p.lastNote)}</div>` : ''}`,
                'Last run — ' + rel(p.lastRunAt),
                window.AFTip.lines([
                    window.AFTime.tip(p.lastRunAt, 'Ran'),
                    p.lastNote ? '\nWhat happened: ' + p.lastNote : '',
                    p.runs7d ? '\n' + p.runs7d + ' run(s) in the last 7 days.' : ''
                ]))
            : `<span class="muted" title="${C.esc('It has never fired. '
                + (p.overdue ? 'And its time has already come — see the ⚠ on the row.'
                    : p.nextAt ? 'First time due ' + until(p.nextAt) + '.'
                        : 'It runs when it is launched, so “never” only means nobody has launched it yet.'))}">never</span>`}</td>
            <td class="state">${stateCell}</td>
            <td class="acts">
                <button class="mini secondary" data-plan="run" data-kind="${p.kind}" data-id="${p.id}" title="run it now">run</button>
                <button class="mini secondary" data-plan="edit" data-kind="${p.kind}" data-id="${p.id}" title="edit">edit</button>
                <button class="mini secondary" data-plan="delete" data-kind="${p.kind}" data-id="${p.id}" title="delete">✕</button>
            </td>
        </tr>${open ? planDetailHtml(p) : ''}`;
    }

    function planDetailHtml(p) {
        const d = p.detail;
        return `<tr class="detail"><td colspan="10"><div class="detailbox">
            ${p.overdue ? `<div class="overdue">⚠ ${C.esc(p.overdue)}</div>` : ''}
            ${/* ‼️ M-8 — THE WHOLE ANATOMY, not the word "schedule". At what time,
                  on which day, what happens to a missed occurrence, which engine
                  and model and permissions, which project, which folder — all of
                  it was stored and none of it was drawn. */''}
            <div class="dgrid">
                ${(d.setup || []).map(x => `<div><b>${C.esc(x.label)}</b><div>${C.esc(x.value)}</div></div>`).join('')}
                ${p.skipped7d || p.runs7d ? `<div><b>Last 7 days</b><div>${p.runs7d} run(s) · ${p.skipped7d} skipped (${p.skipRate}%) · ${fmtUSD(p.cost7d)}</div></div>` : ''}
            </div>
            ${d.steps.length ? `<div class="dsteps"><b>Steps</b><ol>${d.steps.map((s, n) =>
            // Only a WORKFLOW's steps are editable objects; a schedule's
            // "steps" line is a description, and a menu on it would offer
            // moves and deletes that have nothing to act on.
            p.kind === 'workflow'
                ? `<li ${window.AFCtx.row('afWorkflowStep', { planId: p.id, stepIndex: n, stepText: s })}
                        title="${C.esc(window.AFCtx.hint('Step ' + (n + 1)))}">${C.esc(s)}</li>`
                : `<li>${C.esc(s)}</li>`).join('')}</ol></div>` : ''}
            ${d.prompt ? `<div class="dprompt"><b>Prompt</b><pre>${C.esc(d.prompt)}</pre></div>` : ''}
        </div></td></tr>`;
    }

    function planHtml(d) {
        const v = planView;
        const rows = planRows(d);
        const models = Array.from(new Set(d.plan.map(p => p.model || 'default')));
        const sorted = applySort(rows, v, {
            title: p => p.title.toLowerCase(),
            when: p => p.nextAt || (p.kind === 'schedule' ? 1 : 2) * 1e13,
            agent: p => p.agentName.toLowerCase(),
            cost: p => p.cost7d,
            last: p => p.lastRunAt || 0
        });

        // ‼️ M-33 — A TICK CANNOT OUTLIVE ITS ROW. The selection is now a
        // DELETE list, so a key left behind by a filter change, or by a
        // definition somebody else removed, would be a row acted on that the
        // reader cannot see. Pruning to what is on screen makes "N selected"
        // mean N ticked boxes in front of you, which is the only reading that
        // makes the count on the confirm box worth anything.
        const onScreen = new Set(sorted.map(p => p.kind + ':' + p.id));
        for (const key of [...selected]) {
            if (!onScreen.has(key)) { selected.delete(key); }
        }

        // ‼️ M-25 — computed ONCE for the whole table, never per row: every
        // figure in an agent's hover comes off rows already on this page.
        const tally = agentTally(d.plan);

        // Grouping: the user asked for "well grouped"; kind is the default
        // because it answers "what kinds of automation do I even have".
        const groups = new Map();
        for (const p of sorted) {
            const g = v.group === 'agent' ? (p.agentName || 'no agent')
                : v.group === 'kind' ? KIND[p.kind].label + 's'
                    : '';
            if (!groups.has(g)) { groups.set(g, []); }
            groups.get(g).push(p);
        }

        const lede = `<p class="lede">A <b>plan</b> is anything that defines work: ⏰ a <b>schedule</b> runs at a set
            time, ⚡ a <b>trigger</b> runs when something happens, 🔗 a <b>workflow</b> chains several agents and
            📋 a <b>template</b> is a saved prompt. The first two run on their own; the last two run when launched.
            Every one of them produces <b>tasks</b> — see the Runs tab.</p>`;
        const head = `<tr>
            <th class="tick"><input type="checkbox" class="allsel" title="select every row shown"></th>
            <th class="expand"></th>
            ${/* ‼️ M-25 — EVERY COLUMN IS DEFINED, AND DEFINED HERE. A column's
                  meaning is said once, on its heading; a sentence repeated
                  under every figure of every row is the thing that made these
                  hovers worthless (docs/CONVENTIONS.md → a cell hover is a
                  READOUT). What the cells carry below is figures. */''}
            ${sortCell(v, 'title', 'What runs', false,
        'The definition itself — its name, when it goes and what it will ask for. '
        + 'A warning badge beside the name is something about THIS row that needs you.')}
            ${sortCell(v, 'agent', 'Agent', false,
        'Whose folder it runs in, and whose CLAUDE.md it wakes up with. '
        + 'Empty means the definition names no agent and the launcher picks.')}
            <th title="${C.esc('What this definition launches with — its engine and its model. '
        + 'Either half may be blank: that half is the launcher\'s own default, resolved when it runs. '
        + 'A stated engine is shown here because a model name alone cannot say which CLI it goes to.')}">Launch</th>
            <th title="${C.esc('A precondition checked before the wake-up: if it is not met, nothing is '
        + 'launched and no agent run is paid for. A guarded row also says how many wake-ups it has '
        + 'saved in the last 7 days.')}">Guard</th>
            ${sortCell(v, 'cost', 'Cost 7d', true,
        'What this ONE definition cost over the last 7 days, and the runs behind it. '
        + 'A plan-billed engine states no price, so a row can have runs and no cost.')}
            ${sortCell(v, 'last', 'Last run', false,
        'When it last actually fired, and what happened that time. '
        + '“never” means it has been defined but has not yet run — which for a schedule whose '
        + 'time has passed is what the ⚠ on the row is about.')}
            <th class="state" title="${C.esc('Whether it fires on its own. Off means it is saved and '
        + 'complete but nothing will start it. A workflow and a template have no switch: they run '
        + 'when they are launched, so the column says “manual”.')}">On</th><th class="acts"></th></tr>`;

        const body = !sorted.length
            ? `<tr><td colspan="10" class="empty">${d.plan.length
                ? 'Nothing matches these filters.'
                : 'Nothing is automated yet. Add a schedule to run an agent at a set time, or a trigger to run one when something happens.'}</td></tr>`
            : [...groups.entries()].map(([g, list]) =>
                (g ? `<tr class="grouphead"><td colspan="10">${C.esc(g)} <span class="muted small">${list.length}</span></td></tr>` : '')
                + list.map(x => planRowHtml(x, tally)).join('')).join('');

        return `
            ${lede}
            <div class="toolbar">
                <input type="search" id="planq" placeholder="Search name, prompt, agent…" value="${C.esc(v.q)}" class="${v.q ? 'set' : ''}"
                    title="${C.esc(window.AFQuery.tip('Searched against the name, the prompt, the schedule and the agent.'))}">
                ${/* ‼️ U-52 — the one subset this list has a word for. Three of
                      the four kinds start on their own — a clock, an event, a
                      chain — and the fourth is a prompt you launch by hand; on
                      the tab whose whole subject is automation that is the
                      reading, and it cost a Clear plus three ticks. */''}
                ${sel('kind', 'Kind', v.kind, Object.keys(KIND).map(k => ({ v: k, t: KIND[k].label })), [{
            id: 'auto', label: 'Automatic', values: ['schedule', 'trigger', 'workflow'],
            title: 'Everything that starts on its own — a template is launched by hand.'
        }])}
                ${sel('agent', 'Agent', v.agent, d.agents)}
                ${sel('model', 'Model', v.model, models)}
                ${/* No preset on State or Guard: each is two options, and a
                      click on an option's own name already means "only this". */''}
                ${sel('state', 'State', v.state, [{ v: 'on', t: 'on' }, { v: 'off', t: 'off' }])}
                ${sel('guard', 'Guard', v.guard, [{ v: 'yes', t: 'guarded' }, { v: 'no', t: 'unguarded' }])}
                <label class="cbx"><input type="checkbox" data-f="issues"${v.issues ? ' checked' : ''}> needs attention</label>
                <span class="spacer"></span>
                <label class="grp">group
                    <select data-f="group">
                        <option value="kind"${v.group === 'kind' ? ' selected' : ''}>by kind</option>
                        <option value="agent"${v.group === 'agent' ? ' selected' : ''}>by agent</option>
                        <option value=""${v.group === '' ? ' selected' : ''}>flat</option>
                    </select>
                </label>
                <span class="btngroup">
                    <button data-add="schedule" title="run an agent at a set time">+ Schedule</button>
                    <button class="secondary" data-add="trigger" title="run an agent when something happens">+ Trigger</button>
                    <button class="secondary" data-add="workflow" title="chain several agents">+ Workflow</button>
                    <!-- ‼️ This button did not exist, and the one thing worse
                         than a missing button was what "+ Template" would have
                         done: the plan-add message mapped the template kind to
                         agentfarm.runTemplate, so the ADD button RAN one. There
                         was no way to make a template on this page at all. -->
                    <button class="secondary" data-add="template" title="save a prompt you launch by hand">+ Template</button>
                </span>
            </div>
            ${composer && (COMPOSE[composer.kind] || COMPOSE.task).tab === 'plan' ? composerHtml() : ''}
            ${chooser && chooser.tab === 'plan' ? chooserHtml() : ''}
            ${!composer && composerMsg && tab === 'plan' ? `<div class="ntmsg">${C.esc(composerMsg)}</div>` : ''}
            ${activeChips(v, PLAN_DEF, { kind: 'kind', agent: 'agent', model: 'model', state: 'state', guard: 'guard', issues: 'needs attention' }, rows.length, d.plan.length)}
            ${/* ‼️ M-33 · MIRROR — the two switch buttons say how much of THIS
                  selection they can act on, because a selection may now hold
                  rows that have no switch; syncBulk keeps both figures true
                  between renders, since ticking a box does not repaint. */''}
            <div class="bulk" ${selected.size ? '' : 'hidden'}>
                <b><span id="bulkn">${selected.size}</span> selected</b>
                <button class="mini" data-bulk="on">switch on</button>
                <button class="mini secondary" data-bulk="off">switch off</button>
                <button class="mini secondary danger" data-bulk="delete">delete</button>
                <button class="mini secondary" data-bulk="clear">clear</button>
            </div>
            <div class="tablewrap"><table class="grid">${head}${body}</table></div>`;
    }

    // ------------------------------------------------- NEW TASK: the composer
    /**
     * ‼️ THE PAGE MAKES A TASK. IT DOES NOT OPEN A DIALOG THAT DOES.
     *
     * This page was a control panel with no controls for the one thing it is
     * about. "+ Run a task" opened a chain of VS Code input boxes — title,
     * prompt, mode, CLI, "start now?" — and the questions it could NOT ask are
     * the ones that decide what an unattended run actually does: which model,
     * what effort, what permission mode, which project, how urgent, in which
     * folder. Meanwhile the sidebar's + ran the same chain, so a task made from
     * the tree and one made from the page were different objects, and editing a
     * run asked a third, different set of questions again.
     *
     * So there is ONE form, it lives on the page, and every route in opens it:
     * this button, the sidebar's +, the walkthrough, and a row's "like this
     * one" (prefilled). Its fields are the launcher's own vocabulary — the same
     * model list, the same efforts, the same permission modes a session is
     * started with (core/launch.ts) — plus the four dimensions only a task has.
     *
     * Every field is optional except the agent and the prompt: an empty field
     * means the same thing it means in the launcher — no flag, and whatever the
     * agent and the CLI already decide stays in charge.
     */
    /**
     * ‼️ AND IT MAKES EVERY OTHER KIND TOO — U-9.
     *
     * The run side got this form in 3.80.0; the PLAN side did not, and a plan
     * object is not a lesser thing than a task. Measured in `extension.ts`:
     * `addSchedule` asked six to eight boxes in a row and could not ask effort,
     * permission mode, project, working folder or priority — the dimensions
     * that decide what an unattended run DOES. A schedule is a task that has
     * not happened yet, so it could say strictly less about itself than the
     * thing it produces.
     *
     * One composer, five kinds. The shared block (agent · prompt · title · mode
     * · model · effort · permissions · project · CLI · folder · priority) is
     * written once and every kind that runs something gets it; the kind-specific
     * block sits under it. `agentfarm.addSchedule` and friends no longer open a
     * dialog — they open THIS, so the palette, the sidebar + and the page all
     * produce the same object.
     */
    let composer = null;      // null = closed; an object = the draft
    let composerMsg = '';     // a refusal or a confirmation, shown in the card
    let composerDup = false;  // the host says an identical task is already queued
    /**
     * ‼️ M-22 — DID THE SUBMIT HAPPEN OR NOT? One strip carries both answers —
     * "Queued “…”" and "this run has two executors" — and it drew them
     * identically: grey, borderless, the same weight as the form's own help
     * text three rows above. The duplicate guard was the only message that
     * looked like one, because its flag happened to also carry the loud style.
     *
     * Loud means REFUSED, not "important": the reader's question at that moment
     * is whether anything was created, and a confirmation answering it in the
     * voice of a warning is the same failure the other way round.
     */
    let composerLoud = false;
    let stepMsg = '';         // a step's own refusal, shown inside the step card
    /**
     * ‼️ A PICKER THAT IS A LIST ON THE PAGE.
     *
     * "Which month of task history?" was a quickpick over the editor — a
     * floating list with no context, drawn on top of the very page that is
     * about task history. The same rows, on the page, keep their surroundings.
     * `{ tab, title, lede, act, items:[{id,label,detail}], empty }`.
     */
    let chooser = null;

    /** Which kinds carry the shared run block, and which tab they belong to. */
    const COMPOSE = {
        task: { tab: 'run', label: 'task', runs: true },
        schedule: { tab: 'plan', label: 'schedule', runs: true },
        trigger: { tab: 'plan', label: 'trigger', runs: true },
        template: { tab: 'plan', label: 'template', runs: true },
        workflow: { tab: 'plan', label: 'workflow', runs: false }
    };

    /** The guard (`fireIf`) kinds, in the automation module's own vocabulary. */
    const GUARDS = [
        { id: '', label: '— none: it fires every time —' },
        { id: 'folderHasFiles', label: 'a folder holds files' },
        { id: 'fileMissing', label: 'a file is missing' },
        { id: 'pathChangedWithin', label: 'a path changed recently' },
        { id: 'queueHasWork', label: 'the work queue has items' }
    ];
    const HOOK_EVENTS = [
        { id: 'stop', label: 'stop — an agent finished its turn' },
        { id: 'end', label: 'end — a session ended' },
        { id: 'permission', label: 'permission — an agent is waiting' },
        { id: 'compact', label: 'compact — a session compacted' },
        { id: 'subagent', label: 'subagent — a subagent finished' }
    ];

    /**
     * ‼️ THE SIX SHAPES A STEP CAN TAKE — and the reason a workflow could not be
     * a form until now.
     *
     * A step is not always "an agent runs a prompt". It can call an HTTP
     * endpoint, render an asset on fal.ai, drive a browser, or stop the chain
     * and wait for a person. The builder knew all six; it asked them as a
     * 294-line quickpick tree in which the shape was decided by the FIRST
     * question and every later one depended on it — the exact case a form with
     * a kind picker answers better than a wizard, because you can change your
     * mind on step three without starting over.
     */
    const STEP_KINDS = [
        { id: 'agent', icon: '🤖', label: 'agent — it runs a prompt' },
        { id: 'webhook', icon: '🌐', label: 'webhook — an HTTP call, no agent' },
        { id: 'media', icon: '🎬', label: 'media — fal.ai / Replicate render' },
        { id: 'browser', icon: '🧭', label: 'browser — an agent drives a site' },
        { id: 'approval', icon: '✋', label: 'approval — the chain waits for you' },
        { id: 'select', icon: '🖼', label: 'select — you keep some of the assets' }
    ];
    const PREV = '{prev_output}';

    /** A step draft, in the FORM's flat vocabulary. The translation into a real
     *  WorkflowStep lives next to the manager that owns the shape (tasksPanel). */
    function newStep(seed) {
        const d = Object.assign({
            stype: 'agent', title: '', agent: '', prompt: '', smode: 'headless',
            onFail: 'stop', onFailStep: 1, runIf: '', contract: 'text',
            verifyCriteria: '', verifyRetries: 1, parallel: false,
            whUrl: '', whMethod: 'POST', whBody: '', whHeader: '',
            whPoll: false, whPollUrl: '', whStatusField: 'status',
            whDone: 'succeeded|completed|complete|done|success', whInterval: 3,
            mModel: 'fal-ai/flux/schnell', mInput: '{"prompt": "{prev_text}"}', mScene: '',
            bUrl: '', bGoal: '', bHosts: '',
            apMsg: '', selMsg: '', selMin: 1, selMax: 0
        }, seed || {});
        // A webhook or media step carries no real agent, so switching one to
        // "agent" would land on an empty picker that LOOKS filled — the select
        // draws the first name whatever the draft says.
        if (!d.agent) { d.agent = (DATA.agents || [])[0] || ''; }
        return d;
    }

    function newDraft(kind, seed) {
        const L = DATA.launch || {};
        const d = L.defaults || {};
        const base = {
            kind: kind || 'task', mode2: 'new', id: '',
            agent: (DATA.agents || [])[0] || '',
            title: '', prompt: '', mode: 'headless',
            // ‼️ M-27 — the prompts AFTER the first one. Empty is not a missing
            // answer, it is the ordinary one-turn task every other field here
            // was written for.
            rounds: [],
            // The launcher's own defaults are the starting point, exactly as
            // they would be for a session started by hand.
            engine: d.engine || '',
            model: d.model || '', effort: d.effort || '', permissionMode: d.permissionMode || '',
            // ‼️ M-26 — the two axes of an interactive run open on what every
            // interactive task has always done: this window's terminal, left
            // open. A default that changed behaviour for the tasks people
            // already have would be a surprise, not a feature.
            interactiveTarget: 'vscode', interactiveClose: 'stay-open',
            // ‼️ A-24 — and what it sounds like when it ends. Empty is the
            // ordinary answer, not a missing one: the fleet's own chain decides,
            // exactly as it did before this row existed.
            finishSound: '',
            // ‼️ M-30 — and whether it works to the discipline. Empty is the
            // ordinary answer and NOT "off": the agent's own default decides,
            // exactly as it did before this row existed.
            superpowers: '',
            cli: '', workDir: '', priority: 0,
            // ‼️ A TASK OPENS ON THE WINDOW'S PROJECT; AN AUTOMATION DOES NOT.
            // A task made here is made by a person who is looking at a project.
            // A schedule fires at 03:00 with nobody looking, so its project is
            // only ever the one it DECLARES (core/tasks.ts RunDimensions).
            project: kind && kind !== 'task' ? '' : (L.activeProjectId || ''),
            start: true,
            // Set when the form was opened as "run that one again, but…": the
            // host turns it into a retry of THAT task (its lineage, its attempt
            // number) rather than an unrelated new one.
            retryOf: '',
            // ‼️ M-3 — WHAT HAPPENS IF IT FAILS. Three states and they are three
            // different statements: 'default' = whatever agentFarm.taskRetry
            // says (and it can change after this run is saved), 'off' = never,
            // whatever the default becomes, 'custom' = these numbers. A form
            // with only a checkbox could not say the first one at all.
            retryMode: 'default',
            retryMax: 3, retryDelayMin: 30, retryBackoff: 'same',
            retryWhen: 'limit', retryPrompt: '',
            // ‼️ M-10 — the second and third waits, the strategy for 4+ and the
            // reset-aware first retry. Empty strings, not numbers: "" is "say
            // nothing about it", which is a different statement from a value,
            // and it is what keeps a policy that never touched these fields
            // computing exactly what it computed before they existed.
            retryDelay2Min: '', retryDelay3Min: '', retryFormula: '', retryCapMin: '',
            retryResetAware: false, retrySafetyMin: 3,
            // ‼️ S-19 — a new session, or the next turn of one that exists.
            // 'new' is the default and always will be: a task that silently
            // joined somebody else's conversation would be the worst kind of
            // surprise, and "resume" is a thing you say out loud.
            conversation: 'new', resumeSessionId: '', resumeFind: '',
            // schedule
            every: 'daily', time: '09:00', dow: 1, onceAt: '', missed: 'skip', enabled: true,
            // trigger
            ttype: 'watch', watchPath: '', hookEvent: 'stop', hookAgent: '', token: '',
            act: 'task', workflowId: '',
            debounceSec: 5, cooldownSec: 60, maxPerHour: 12,
            // guard — shared by schedule and trigger
            guardKind: '', guardPath: '', guardExcept: '', guardMin: 1, guardHours: 24, guardRecursive: true,
            // workflow: the chain itself lives in the draft, so Cancel really
            // cancels — a step added here is not written to the stored workflow
            // until the whole form is saved.
            steps: [], stepIdx: null, step: null
        };
        const draft = Object.assign(base, seed || {});
        if (!Array.isArray(draft.steps)) { draft.steps = []; }
        // A seed from "run that one again" or from a stored task can carry
        // anything; a rounds list that is not a list is no rounds.
        if (!Array.isArray(draft.rounds)) { draft.rounds = []; }
        // `agentfarm.addWorkflowStep` / `editWorkflowStep` arrive with the card
        // already asked for; a card with nothing in it has nothing to read.
        if (draft.stepIdx === undefined) { draft.stepIdx = null; }
        if (draft.step) { draft.step = newStep(draft.step); }
        else if (draft.stepIdx !== null) {
            // An index on its own is enough: "edit step 3" means the step that
            // is already in the chain, not a blank one over the top of it.
            draft.step = newStep(draft.stepIdx >= 0 ? draft.steps[draft.stepIdx] : null);
        }
        return draft;
    }

    /**
     * ‼️ THE FORM CHANGED TABS AND SAID SO.
     *
     * Changing the kind mid-draft works — the draft survives and the
     * kind-specific block is rebuilt — but a task lives on Run and a schedule
     * on Plan, so the form MOVES, and the page repainting under you with your
     * form somewhere else reads as "nothing happened" (which is exactly how it
     * was reported). The move is right; being silent about it was not.
     */
    let kindMoved = '';

    function openComposer(seed, kind) {
        const k = kind || (seed && seed.kind) || 'task';
        const from = tab;
        composer = newDraft(k, seed);
        composerMsg = '';
        composerDup = false;
        composerLoud = false;
        stepMsg = '';
        tab = (COMPOSE[k] || COMPOSE.task).tab;
        kindMoved = (kind && from && from !== tab) ? from : '';
        persist();
        render();
        const box = document.getElementById('nt-prompt') || document.getElementById('nt-title');
        if (box) { box.focus(); }
    }

    function closeComposer(msg) {
        composer = null;
        composerDup = false;
        // Everything that CLOSES the form did what was asked of it, so the strip
        // that outlives it is a confirmation and never wears the refusal style.
        composerLoud = false;
        stepMsg = '';
        kindMoved = '';
        composerMsg = msg || '';
        render();
        // M-33 — this paint made the screen current, so a repaint the guard was
        // holding back while the form was open is settled rather than owed. It
        // would otherwise fire on the next focus change and cost a whole repaint
        // to draw what is already on the screen.
        repaint.clear();
    }

    /**
     * ‼️ S-19 — NEW SESSION, OR CARRY ON WITH AN EXISTING CONVERSATION.
     *
     * A task could only ever open a new one. "Carry on with what that session
     * was doing" therefore meant pasting the last output into a fresh prompt —
     * a COPY of the context, not the context. Here the engine really resumes
     * the conversation, so the transcript continues in place while the run
     * stays its own task row, its own output and its own cost.
     *
     * A two-state picker rather than a checkbox, because "Resume existing"
     * changes what the rest of the form MEANS: the engine and the working
     * folder come from the conversation, and the boxes above say so instead of
     * looking editable and being overruled at launch. On a task only — a
     * schedule sharing one conversation for ever is a lifecycle decision
     * nobody has made yet, and it must not arrive as a side effect of this.
     */
    function conversationHtml(c) {
        if (c.kind !== 'task') { return ''; }
        const rows = (DATA.launch || {}).resumable || [];
        const sel = (id, value, list) => `<select id="nt-${id}">${list.map(o =>
            `<option value="${C.esc(o[0])}"${o[0] === value ? ' selected' : ''}>${C.esc(o[1])}</option>`
        ).join('')}</select>`;
        // Interactive: the same rule the host enforces, said where the box is.
        if (c.mode === 'interactive') {
            return `<label class="ntf wide" title="${C.esc(
                'Continuing a conversation is a HEADLESS argument: the engine is asked to resume a session id '
                + 'and answer once. An interactive task opens a terminal, and the session\'s own Resume (on the '
                + 'Sessions page, or ⏵ in the Console) is the right door for that — it also warns you when '
                + 'something else already has the conversation open. Set Mode to headless and this becomes '
                + 'editable.')}"><span>Conversation</span>
                <select disabled><option>a new session — interactive runs cannot resume here</option></select></label>`;
        }
        const head = `<label class="ntf wide" title="${C.esc(
            'A new session starts with nothing but this prompt. "Continue an existing conversation" resumes a '
            + 'real session/thread/conversation on its own engine: the context, the files it had read and the '
            + 'transcript carry on in place, and this run is the next turn of it. It is still a task — its own '
            + 'row, its own events, its own archived output — and its cost is what THIS turn added, not the '
            + 'conversation\'s total. ‼️ If something else is holding the conversation (the Console, a CLI '
            + 'process, another window) the task parks with that as its reason and starts by itself when the '
            + 'holder lets go: two writers on one transcript is never opened.')}"><span>Conversation</span>
            ${sel('conversation', c.conversation, [
            ['new', 'a new session'],
            ['resume', 'continue an existing conversation…']
        ])}</label>`;
        if (c.conversation !== 'resume') { return head; }
        if (!rows.length) {
            return head + `<div class="ntmsg warn">✖ There are no resumable conversations on this machine
                yet — a session has to have been had, and indexed, before a task can continue it.</div>`;
        }
        // ‼️ THE SEARCH IS A FILTER OVER THE ROWS, NOT A SECOND LIST. Two
        // hundred conversations is a scroll; the box narrows by anything the row
        // says — its name, its agent, its project, its engine, and its ID, so
        // somebody who has the id in front of them pastes it and lands on it.
        //
        // ‼️ AND IT IS THE FARM'S OWN QUERY GRAMMAR, not a lowercased substring:
        // every box on every page understands `codex -done`, and one that did
        // not would be the single place where what you know about searching here
        // stops being true.
        const q = window.AFQuery.compile(c.resumeFind || '');
        const hits = rows.filter(r => q.empty
            || q.test(r.title + ' ' + r.agent + ' ' + r.project + ' ' + r.engine + ' ' + r.sessionId));
        const chosen = rows.find(r => r.sessionId === c.resumeSessionId);
        const ago = (ts) => {
            const m = Math.max(0, Math.round((Date.now() - (ts || 0)) / 60000));
            return m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago';
        };
        const opts = hits.slice(0, 60).map(r =>
            `<option value="${C.esc(r.sessionId)}"${r.sessionId === c.resumeSessionId ? ' selected' : ''}>`
            + C.esc(`${r.busy ? '● ' : ''}${r.title} · ${r.agent || '—'} · ${r.engine}`
                + `${r.project ? ' · ' + r.project : ''} · ${ago(r.ts)} · #${r.sessionId.slice(0, 8)}`)
            + '</option>').join('');
        // ‼️ MIRROR — the picker is narrow and cuts its own text, so the whole
        // truth about the chosen row (its full id, its owner, what this task
        // will be) goes on the tip, current value first.
        const tip = chosen
            ? `${chosen.title} — ${chosen.engine}\n\n`
            + `Full id: ${chosen.sessionId}\n`
            + `Agent: ${chosen.agent || '—'}${chosen.project ? ' · Project: ' + chosen.project : ''}\n`
            + `Last activity: ${ago(chosen.ts)}\n`
            + `Working folder: ${chosen.cwd || '(the agent\'s own)'}\n\n`
            + (chosen.busy
                ? `‼️ HELD RIGHT NOW — ${chosen.busy}. The task will be created and will PARK with that as its `
                + 'visible reason rather than opening a second writer on the transcript; it starts by itself '
                + 'when the holder lets go.\n\n'
                : '')
            + 'This task will be the NEXT TURN of that conversation: same context, same transcript. It runs on '
            + `${chosen.engine} and in that session's own folder, whatever the boxes above say — the `
            + 'conversation already has both.'
            : 'Pick the conversation this run continues. Type in the box above to narrow the list by name, '
            + 'agent, project, engine or ID.';
        return head + `
            <label class="ntf wide" title="Narrows the list below by anything the row says — its name, its agent, its project, its engine, or its ID. Paste an ID here to find exactly one."><span>Find</span>
                <input type="text" id="nt-resumefind" value="${C.esc(c.resumeFind || '')}"
                    placeholder="name, agent, project, engine or a session id"></label>
            ${window.AFTip.wrap(`<label class="ntf wide"><span>Continue</span>
                <select id="nt-resumeid">
                    <option value="">— pick a conversation —</option>
                    ${opts}
                </select></label>`,
            chosen ? `${chosen.title} — ${chosen.engine}` : 'Which conversation this run continues',
            tip, 'tip-block')}
            <div class="ntf wide muted small">${C.esc(
                `${hits.length} of ${rows.length} conversation${rows.length === 1 ? '' : 's'}`
                + (hits.length > 60 ? ' — showing the 60 most recent matches; narrow it further to see the rest' : '')
                + '. ● marks one something is holding right now.')}</div>
            ${chosen && chosen.busy ? `<div class="ntmsg warn">● ${C.esc(chosen.busy)} — the task will
                park with that reason instead of opening a second writer, and start when it is free.</div>` : ''}`;
    }

    /**
     * ‼️ M-3 — WHAT HAPPENS WHEN THIS RUN FAILS.
     *
     * The extension has always retried some failures; the numbers were written
     * into the code (six attempts, forty minutes) and only one kind of failure
     * qualified, so the answer to "will this try again, and when?" was not
     * visible anywhere and not changeable at all.
     *
     * The control is a three-state picker and not a checkbox, because there are
     * three statements and a checkbox can only make two: **my default** (which
     * may change after this run is saved), **never** (whatever the default
     * becomes), and **these numbers**. The four fields only appear for the
     * third, so the common case is one line.
     */
    function retryHtml(c) {
        const modes = [
            ['default', 'use my default'],
            ['off', 'never retry it'],
            ['custom', 'set it here…']
        ];
        const sel = (id, value, list) => `<select id="nt-${id}">${list.map(o =>
            `<option value="${C.esc(o[0])}"${o[0] === value ? ' selected' : ''}>${C.esc(o[1])}</option>`
        ).join('')}</select>`;
        /**
         * ‼️ M-3 (V3) — A POLICY THE RUN WILL NOT USE IS NOT OFFERED AS IF IT WILL.
         *
         * Automatic retry is a headless mechanism, and deliberately so: an
         * interactive run has a person in front of it, and the process exiting
         * says nothing reliable about whether the work failed — closing the
         * window is the ordinary way to end one. `maybeScheduleRetry` therefore
         * skips interactive runs entirely. The form still drew the picker for
         * them, so the box collected a decision nothing would ever read.
         *
         * Shown rather than hidden, because the referent is the MODE box three
         * rows up in the same form: a control that silently vanished would look
         * like a bug, while a disabled one that says which field switched it off
         * answers the question in place.
         */
        if (c.mode === 'interactive') {
            return `<label class="ntf wide" title="${C.esc(
                'Automatic retry applies to HEADLESS runs only. An interactive run opens a session with you in '
                + 'front of it: the process exiting is how you normally end one, so "it failed" is not a fact the '
                + 'extension can read from it, and a policy acting on that would relaunch sessions you closed on '
                + 'purpose. Set Mode to headless above and this becomes editable.')}"><span>If it fails</span>
                <select disabled><option>not used for an interactive run</option></select></label>`;
        }
        const head = `<label class="ntf wide" title="${C.esc(
            'What happens when this run FAILS. "use my default" follows agentFarm.taskRetry, which is six '
            + 'attempts forty minutes apart and only when the Claude session limit was hit — i.e. when the '
            + 'work was never actually attempted. That default can change later and this run follows it; '
            + '"never retry it" and "set it here" are decisions about THIS run and do not. '
            + 'Headless runs only — an interactive session has you in front of it.')}"><span>If it fails</span>
            ${sel('retrymode', c.retryMode, modes)}</label>`;
        if (c.retryMode !== 'custom') { return head; }
        /**
         * ‼️ M-10 — THE FIRST THREE WAITS ARE THREE BOXES, NOT A CURVE.
         *
         * "Try again in five minutes; if that fails give it twenty; if that
         * fails leave it an hour" is what people actually want out of the first
         * handful of attempts and it is not any curve at all. The second and
         * third are EMPTY by default and say so in their placeholder: an empty
         * box means "whatever the strategy below says", which is exactly how
         * every policy written before these boxes existed still behaves.
         */
        const num = (id, key, min, max, ph) =>
            `<input type="number" id="nt-${id}" min="${min}" max="${max}" step="1"
                value="${C.esc(String(c[key] === undefined || c[key] === null ? '' : c[key]))}"
                placeholder="${C.esc(ph || '')}">`;
        const formulaErr = c.retryBackoff === 'formula' ? retryFormulaError(c.retryFormula || '') : '';
        return head + `
            <label class="ntf" title="How many times to try AGAIN after a failure. 0 means never."><span>Tries</span>
                <input type="number" id="nt-retrymax" min="0" max="20" step="1" value="${C.esc(String(c.retryMax))}"></label>
            <label class="ntf" title="Minutes to wait before the FIRST retry. It is also 'base' in the formula, so changing it moves the whole curve."><span>1st wait</span>
                ${num('retrydelay', 'retryDelayMin', 1, 1440)}</label>
            <label class="ntf" title="Minutes before the SECOND retry. Leave it empty and the strategy below decides this one too — which is what every policy did before this box existed."><span>2nd wait</span>
                ${num('retrydelay2', 'retryDelay2Min', 1, 1440, 'as the strategy says')}</label>
            <label class="ntf" title="Minutes before the THIRD retry. Leave it empty and the strategy below decides this one too."><span>3rd wait</span>
                ${num('retrydelay3', 'retryDelay3Min', 1, 1440, 'as the strategy says')}</label>
            <label class="ntf" title="What retry 4 and after wait. Doubling is the right shape against something that is busy rather than broken — a fixed interval against a rate limit is how a retry policy becomes the problem. 'your own formula' is for the case none of the three fits."><span>Retry 4+</span>
                ${sel('retrybackoff', c.retryBackoff, [
            ['same', 'the same wait'],
            ['linear', 'base × n — a gentle ramp'],
            ['double', 'double it each time'],
            ['formula', 'your own formula…']
        ])}</label>
            ${c.retryBackoff === 'formula' ? `
            <label class="ntf wide" title="${C.esc(
            'The wait for retry 4 and after, in MINUTES. Variables: n (which retry this is), prev (the wait '
            + 'before it) and base (the 1st wait above). Operators + - * / ^, brackets, min(a,b) and max(a,b). '
            + '‼️ It is PARSED, never run as code: anything outside that grammar is refused here with the '
            + 'reason, so a typo cannot become a run that waits until Thursday.')}"><span>Formula</span>
                <input type="text" id="nt-retryformula" value="${C.esc(c.retryFormula || '')}"
                    placeholder="min(prev * 1.5, 120)"></label>
            ${formulaErr ? `<div class="ntmsg warn">✖ ${C.esc(formulaErr)}</div>` : ''}` : ''}
            <label class="ntf" title="The longest any computed wait may become. The built-in 12-hour ceiling still applies on top of it; empty means the built-in one alone."><span>Never longer than</span>
                ${num('retrycap', 'retryCapMin', 1, 720, '12 h')}</label>
            <label class="ntf" title="Which failures are worth trying again. A session limit means the work was never attempted and the limit clears by itself within hours; any other failure may well repeat."><span>On</span>
                ${sel('retrywhen', c.retryWhen, [['limit', 'a session limit only'], ['any', 'any failure']])}</label>
            <label class="ntf wide cbxf" title="${C.esc(
            'When the failure really WAS a usage/session limit, the engine has already said when the window '
            + 'reopens — the Claude usage endpoint and Codex\'s own rate-limit block both publish the hour, and '
            + 'the CLI prints it ("resets 5am"). With this on, the first retry goes at that moment plus the '
            + 'buffer beside it instead of guessing a duration; retries 2 and 3 use their own minutes and 4+ '
            + 'the strategy. If no reset time can be found the ordinary first wait is used and the run\'s record '
            + 'says so — it is never a silent guess.')}"><span>Limit reset</span>
                <label class="cbx"><input type="checkbox" id="nt-retryresetaware"${c.retryResetAware ? ' checked' : ''}>
                    wait for the window to reopen instead of guessing (1st retry)</label></label>
            ${c.retryResetAware ? `
            <label class="ntf thin" title="Minutes added to the stated reset time before the first retry actually goes. The window reopening and the CLI agreeing that it has are not the same instant."><span>Safety buffer</span>
                <input type="number" id="nt-retrysafety" min="0" max="240" step="1" value="${C.esc(String(c.retrySafetyMin))}"></label>` : ''}
            <label class="ntf wide" title="Sent INSTEAD of the prompt above, on every retry. Leave it empty to send the same work again. ‼️ A retry is a fresh headless run with no memory of the last one, so this has to stand on its own — “and this time do it properly” would arrive with nothing to refer to.&#10;${C.esc(SNIP_HINT)}"><span>Retry prompt</span>
                <input type="text" id="nt-retryprompt" value="${C.esc(c.retryPrompt || '')}" placeholder="(optional) — empty sends the same prompt again"></label>
            ${/**
              * ‼️ M-10 — WHAT A RETRY *IS*, WHICH IS THE OTHER HALF OF THE POLICY.
              *
              * Everything above answers WHEN. This answers what gets sent, and
              * the two are independent: a run can wait perfectly for the window
              * and still throw away forty-five minutes by resending the original
              * prompt into a conversation that cannot remember them.
              */''}
            <label class="ntf wide" title="${C.esc(
            'Simple: a retry is a FRESH run — the original prompt (or the one above) into a new '
            + 'conversation. That is right when the failure was outside the work: the CLI refused to '
            + 'start, a lock was held, the window was spent before anything began.\n\n'
            + 'Smart: a retry after a run that had ALREADY DONE WORK is a CONTINUATION. It waits for the '
            + 'window, resumes THAT RUN\'S OWN conversation and sends the continuation prompt as the next '
            + 'turn. ‼️ Which of the two happens is decided by what the failed run\'s transcript proves, '
            + 'never guessed — and a run whose transcript is not bound yet is HELD rather than repeated.')
        }"><span>What a retry is</span>
                ${sel('retrybehavior', c.retryBehavior || 'simple', [
            ['simple', 'a fresh run — send the work again'],
            ['smart', 'continue it — pick up where it was cut off']
        ])}</label>
            ${(c.retryBehavior === 'smart') ? `
            <label class="ntf wide" title="${C.esc(
            'Sent as the NEXT TURN of the run\'s own conversation, so it can be short — everything that '
            + 'run knew is still in front of it. Empty uses the built-in default: "carry on from where '
            + 'you stopped, read the transcript and the working folder first, and finish the ORIGINAL '
            + 'task without redoing work that is already done." Placeholders: {taskTitle}, {attempt}, '
            + '{failureReason}, {resetAt}, {progressSummary} — an unknown one is left in the text rather '
            + 'than silently blanked.\n' + SNIP_HINT)}"><span>Continuation prompt</span>
                <input type="text" id="nt-continuationprompt" value="${C.esc(c.retryContinuation || '')}"
                    placeholder="(optional) — empty uses the built-in “carry on, don’t redo” wording"></label>
            <label class="ntf wide" title="${C.esc(
            'What happens when nobody can yet say whether the failed run had done any work — its '
            + 'transcript has not been bound to it (ask sessions.bindings). The one outcome that must '
            + 'not happen is the original prompt going out as if the run had been idle, which is why '
            + 'the default HOLDS the retry until the evidence lands and then remakes it into the right '
            + 'shape.')}"><span>If it cannot tell</span>
                ${sel('unknownfallback', c.retryUnknown || 'park', [
            ['park', 'hold it until we know — then continue or retry'],
            ['simple', 'treat it as an ordinary retry'],
            ['ask', 'hold it and ask me'],
            ['stop', 'do not retry at all']
        ])}</label>` : ''}`;
    }

    /**
     * ‼️ M-10 — THE SAME GRAMMAR THE HOST PARSES, SO THE FORM AND THE RUN AGREE.
     *
     * This is a validator only: it says whether the expression is one, never
     * what it computes (the host owns that, in core/retry.ts, where the run
     * actually happens). Keeping the two in step is the point of the shared
     * vocabulary — a page that accepted `prev * rand()` and a host that refused
     * it would put the refusal hours away from the person who typed it.
     */
    function retryFormulaError(src) {
        const text = String(src || '').trim();
        if (!text) { return 'the formula is empty — say what retry 4 and after should wait'; }
        if (text.length > 120) { return 'the formula is longer than 120 characters — it is an expression, not a program'; }
        const bad = text.replace(/\s|min|max|prev|base|[n0-9.+\-*/^(),]/g, '');
        if (bad) {
            return `"${bad[0]}" is not allowed here — use n, prev, base, numbers, + - * / ^, min(), max() and brackets`;
        }
        // Names that are not one of the four allowed words, e.g. `nn` or `foo`.
        const word = /[a-z_][a-z_0-9]*/gi;
        for (const m of text.match(word) || []) {
            if (!['n', 'prev', 'base', 'min', 'max'].includes(m.toLowerCase())) {
                return `"${m}" is not something a retry formula can use — the names are n, prev, base and the functions are min(), max()`;
            }
        }
        let depth = 0;
        for (const ch of text) {
            if (ch === '(') { depth++; }
            if (ch === ')') { depth--; }
            if (depth < 0) { return 'a bracket is closed before it is opened'; }
        }
        if (depth) { return 'a bracket is never closed'; }
        if (/[+\-*/^]\s*$/.test(text)) { return 'the formula stops in the middle — something is missing at the end'; }
        return '';
    }

    /** One <select>, from a launch.ts choice list. `id:''` is always "leave it
     *  alone", and it is spelled out rather than shown as an empty row. */
    function choiceSel(id, label, list, value, title) {
        // ‼️ NO CHOICES = NO BOX (X-35). An engine that has no such setting —
        // Gemini has no reasoning effort at all — must not be given an empty
        // dropdown to stare at; the control is simply not part of that engine's
        // form. (`docs/CONVENTIONS.md`: a control with no referent is a bug.)
        if (!(list || []).length) { return ''; }
        // ‼️ A-24 — `off` DRAWS THE ROW AND REFUSES THE CLICK. A choice that
        // cannot be made here but IS what the object currently says has to stay
        // visible: dropping it would leave the box showing the first option and
        // reporting a decision nobody made. `selected` still wins on a disabled
        // option, which is exactly the pair of behaviours this needs.
        const opts = (list || []).map(c =>
            `<option value="${C.esc(c.id)}"${c.id === value ? ' selected' : ''}${c.off ? ' disabled' : ''}>${C.esc(c.label)}</option>`).join('');
        return `<label class="ntf" title="${C.esc(title || '')}"><span>${C.esc(label)}</span>
            <select id="nt-${id}">${opts}</select></label>`;
    }

    /**
     * ‼️ S-20 — THE MODEL LIST BELONGS TO THE ENGINE THE RUN WILL USE.
     *
     * The form offered `agentFarm.modelAliases` whatever the Engine box said,
     * so a Codex task could be queued with `--model sonnet` — and unattended is
     * where that is worst: nothing fails visibly, a shell error lands in an
     * archive file read hours later. `L.engineModels` carries what each engine
     * currently offers, read from the engine's own catalog rather than from a
     * constant that goes stale the day a model ships.
     */
    function ntEngineModels(engine) {
        const map = (DATA.launch || {}).engineModels || {};
        return map[engine || 'claude'] || null;
    }
    function ntModels(engine) {
        const em = ntEngineModels(engine);
        return (em && em.models) || (DATA.launch || {}).models || [];
    }
    /**
     * ‼️ X-106 — THE ROUTES THIS ENGINE MAY BE POINTED AT, or nothing.
     *
     * Twin of `ntEngineModels` and read the same way: the whole matrix arrives
     * with the page, so switching the engine box redraws locally instead of
     * waiting on a round trip under the pointer. `null` for the three engines
     * with no provider axis and for one with nothing set up yet — both are
     * complete answers, and neither draws a box.
     */
    function ntRoutes(engine) {
        const all = (DATA.launch || {}).routes || {};
        const f = all[engine || 'claude'];
        return (f && (f.providers || []).length) ? f : null;
    }
    /**
     * ‼️ X-106 — A ROUTE BELONGS TO ONE ENGINE, AND A TIER TO ONE ROUTE.
     *
     * The same narrowing the model box already does when the engine changes: a
     * Kimi route carried onto Codex is an endpoint its CLI was never going to be
     * pointed at, and a tier kept across a route change is a word that meant
     * `kimi-k2-thinking` on the route being left. Dropped rather than left
     * sitting in a box that now disagrees with the row above it.
     */
    function ntNarrowRoute(c) {
        if (!c) { return; }
        const f = ntRoutes(c.engine);
        const row = f && (f.providers || []).find(p => p.id === (c.providerId || ''));
        if (!row) { c.providerId = ''; c.tier = ''; return; }
        if (c.tier && !(row.tiers || []).some(t => t.id === c.tier)) { c.tier = ''; }
    }
    /**
     * ‼️ X-149 — WHAT THIS ENGINE OFFERS, IN THE ONE SHAPE THE ONE NARROWING
     * RULE READS (`media/afLaunch.js`). The Tasks form used to carry its own
     * half of that rule; the host, the Console and `media/afEngine.js` carried
     * three more, and they did not agree.
     *
     * ‼️ AN ENGINE WITH NO EFFORT FLAG OFFERS NO EFFORTS (X-35), and THIS is
     * where that gets answered — the rule takes the answer, it does not guess
     * it. `gemini` has `-m` and nothing beside it (measured against its own
     * option list) and passing an effort exits 42. A box with no referent is
     * what docs/CONVENTIONS.md forbids, so the list is empty and the picker
     * hides it rather than collecting a value the run cannot use.
     *
     * ‼️ U-59 — AND THE ENGINE IS ASKED, NOT NAMED. This was the word `gemini`,
     * so the second engine with no effort setting (OpenCode: ACP declares only
     * model and mode, and no reachable model publishes a variant) was covered
     * only by its catalog's empty list — which is not there until a session has
     * opened. `takesEffort` is the same answer the bridge refuses on, and it is
     * true before anything has connected. The bare `gemini` fallback survives
     * for the one case the row cannot cover: before ANY engine row has landed.
     */
    function ntCatalog(engine) {
        const row = ((DATA.launch || {}).engines || []).find(e => e.id === (engine || 'claude'));
        return window.AFLaunch.catalog({
            known: true,
            em: ntEngineModels(engine),
            models: ntModels(engine),
            efforts: (DATA.launch || {}).efforts || [],
            takesEffort: row ? window.AFLaunch.takesEffort(row) : String(engine || '') !== 'gemini'
        });
    }
    /** The levels THAT model supports — Codex states them per model. */
    function ntEfforts(engine, model) {
        return window.AFLaunch.effortsFor(ntCatalog(engine), model);
    }
    /** Where the list came from and how old it is, for the box's tooltip. */
    function ntModelNote(engine) {
        const em = ntEngineModels(engine);
        return (em && em.note) || 'from your own agentFarm.modelAliases list.';
    }
    /**
     * ‼️ X-30 — CHANGING THE MODEL CHANGES WHAT AN EFFORT MEANS.
     *
     * Reading the effort list per model was only half of it: the Effort box is
     * REDRAWN with the new model's levels, but the composer still held the old
     * word, so the box showed `low` and the task was queued with `medium`. The
     * CLI answers that with `invalid model selection (--model "gemini-3.1-pro"
     * --effort "medium"): gemini-3.1-pro has no "medium" effort` — a prompt that
     * dies before it starts, in a run nobody is sitting in front of.
     *
     * ‼️ X-149 — IT NO LONGER *MIRRORS* `narrowLaunch`, IT IS THE SAME CODE.
     * Mirroring is what this was, and a mirror is a copy: `media/afLaunch.js` is
     * loaded by this page and by `src/core/models.ts` alike, so the host and the
     * form cannot answer one pair two ways.
     *
     * ‼️ AND IT NARROWS THE EFFORT AGAINST THE MODEL IT IS ASKED ABOUT, not
     * against a narrowed one — the model box here is settled by its own handler
     * a line earlier, and re-deciding it inside this call would measure the
     * level against a different list.
     */
    function ntNarrowEffort(engine, model, effort) {
        return window.AFLaunch.narrowEffort(ntCatalog(engine), model, effort);
    }

    /** A plain <select> over `{id,label}` rows — the kind-specific fields. */
    function pickSel(id, label, list, value, title) {
        const opts = list.map(o =>
            `<option value="${C.esc(o.id)}"${o.id === value ? ' selected' : ''}>${C.esc(o.label)}</option>`).join('');
        return `<label class="ntf" title="${C.esc(title || '')}"><span>${C.esc(label)}</span>
            <select id="nt-${id}">${opts}</select></label>`;
    }
    function textF(id, label, value, ph, title, wide) {
        return `<label class="ntf${wide ? ' wide' : ''}" title="${C.esc(title || '')}"><span>${C.esc(label)}</span>
            <input type="text" id="nt-${id}" value="${C.esc(value == null ? '' : String(value))}" placeholder="${C.esc(ph || '')}"></label>`;
    }
    function numF(id, label, value, title) {
        return `<label class="ntf" title="${C.esc(title || '')}"><span>${C.esc(label)}</span>
            <input type="number" id="nt-${id}" step="1" value="${C.esc(String(value == null ? '' : value))}"></label>`;
    }

    /** The guard — the one brake that is evaluated for FREE, before anything
     *  wakes a model. It is the same object on a schedule and on a trigger, so
     *  it is drawn once. */
    function guardHtml(c) {
        const needsPath = c.guardKind && c.guardKind !== 'queueHasWork';
        return `<div class="ntsec"><b>Fires only if…</b>
            <span class="muted small">A guard is checked before any agent is woken, and costs nothing.
                Without one, every wake-up is paid whether or not there was work.</span></div>
            <div class="ntgrid">
                ${pickSel('guardKind', 'Guard', GUARDS, c.guardKind, 'What has to be true for this to fire at all.')}
                ${needsPath ? textF('guardPath', 'Path', c.guardPath, 'D:/…  — {today} and {yesterday} are expanded',
            'The folder or file the guard looks at. {today} / {yesterday} become YYYY-MM-DD.', true) : ''}
                ${c.guardKind === 'folderHasFiles'
                ? textF('guardExcept', 'Ignore these names', c.guardExcept, '_LOG_.md, .gitkeep',
                    'File names that do not count as work — comma separated.', true)
                + `<label class="cbx" title="Look into sub-folders too."><input type="checkbox" id="nt-guardRecursive"${c.guardRecursive ? ' checked' : ''}> include sub-folders</label>`
                : ''}
                ${c.guardKind === 'pathChangedWithin' ? numF('guardHours', 'Within (hours)', c.guardHours, 'How recently the path must have changed.') : ''}
                ${c.guardKind && c.guardKind !== 'fileMissing' && c.guardKind !== 'pathChangedWithin'
                ? numF('guardMin', 'At least', c.guardMin, 'How many hits are needed before it counts as work.') : ''}
            </div>`;
    }

    function scheduleHtml(c) {
        return `<div class="ntsec"><b>When</b></div>
            <div class="ntgrid">
                ${pickSel('every', 'How often', [
            { id: 'daily', label: 'daily' }, { id: 'weekly', label: 'weekly' }, { id: 'once', label: 'once' }
        ], c.every, 'A schedule fires while VS Code is open; what happens to a missed time is the next field.')}
                ${c.every === 'once'
                ? `<label class="ntf" title="The single moment it fires."><span>At</span>
                        <input type="datetime-local" id="nt-onceAt" value="${C.esc(c.onceAt)}"></label>`
                : `<label class="ntf" title="Local time, 24h."><span>Time of day</span>
                        <input type="time" id="nt-time" value="${C.esc(c.time)}"></label>`}
                ${c.every === 'weekly' ? pickSel('dow', 'Day', [
            { id: '0', label: 'Sunday' }, { id: '1', label: 'Monday' }, { id: '2', label: 'Tuesday' },
            { id: '3', label: 'Wednesday' }, { id: '4', label: 'Thursday' }, { id: '5', label: 'Friday' },
            { id: '6', label: 'Saturday' }
        ], String(c.dow), 'Which day of the week.') : ''}
                ${c.every !== 'once' ? pickSel('missed', 'If the time is missed', [
            { id: 'skip', label: 'skip it — that occurrence is lost' },
            { id: 'run', label: 'run it at the first opportunity' },
            { id: 'ask', label: 'ask me, with Run / Skip' }
        ], c.missed, 'What happens when the time passes with no VS Code window open.') : ''}
            </div>
            ${guardHtml(c)}`;
    }

    function triggerHtml(c) {
        const wfOpts = (DATA.workflows || []).map(w => ({ id: w.id, label: `${w.title} — ${w.steps} step(s)` }));
        return `<div class="ntsec"><b>What fires it</b></div>
            <div class="ntgrid">
                ${pickSel('ttype', 'Source', [
            { id: 'watch', label: 'watch — a file or folder changes' },
            { id: 'hook', label: 'hook — a live event (needs Live Hooks)' },
            { id: 'webhook', label: 'webhook — something POSTs to a local URL' }
        ], c.ttype, 'Where the firing comes from.')}
                ${c.ttype === 'watch' ? textF('watchPath', 'Watched path', c.watchPath, 'D:/…  a file or a folder',
            'Any change inside fires it — which is why the guard below matters.', true) : ''}
                ${c.ttype === 'hook' ? pickSel('hookEvent', 'Event', HOOK_EVENTS, c.hookEvent, 'Which live event fires it.') : ''}
                ${c.ttype === 'hook' ? pickSel('hookAgent', 'Only for', [{ id: '', label: 'any agent' }]
            .concat((DATA.agents || []).map(a => ({ id: a, label: a }))), c.hookAgent, 'Limit it to one agent, or leave it open.') : ''}
                ${c.ttype === 'webhook' ? textF('token', 'URL token', c.token, '(generated when you save)',
                'POST to http://127.0.0.1:&lt;port&gt;/trigger/&lt;token&gt;. Leave empty and one is made for you.', true) : ''}
            </div>
            <div class="ntsec"><b>What it does</b></div>
            <div class="ntgrid">
                ${pickSel('act', 'Action', [
                    { id: 'task', label: 'run a task on an agent you pick' },
                    { id: 'dispatch', label: 'dispatch — route to the best agent per firing' }
                ].concat(wfOpts.length ? [{ id: 'workflow', label: 'run a workflow' }] : []),
                    c.act, 'What happens when it fires.')}
                ${c.act === 'workflow' ? pickSel('workflowId', 'Workflow', wfOpts, c.workflowId, 'Which chain runs.') : ''}
            </div>
            <div class="ntsec"><b>Brakes</b>
                <span class="muted small">Frequency brakes. They cap how often it can fire; the guard above caps
                    WHETHER it should.</span></div>
            <div class="ntgrid">
                ${numF('debounceSec', 'Debounce (s)', c.debounceSec, 'Wait this long after the last change before firing — a save storm is one firing.')}
                ${numF('cooldownSec', 'Cooldown (s)', c.cooldownSec, 'Minimum gap between two firings.')}
                ${numF('maxPerHour', 'Max per hour', c.maxPerHour, 'Hard ceiling on firings in a rolling hour.')}
            </div>
            ${guardHtml(c)}`;
    }

    // ------------------------------------------------ WORKFLOW: the chain (Faz 2)
    /**
     * ‼️ A WORKFLOW WAS THE LAST OBJECT YOU COULD NOT SEE WHILE YOU BUILT IT.
     *
     * `newWorkflow` was a 294-line chain of boxes that asked for one step, then
     * offered to ask for another — with no list of what you had already said,
     * no way back to step 2, and Esc discarding the lot. `addWorkflowStep`
     * appended a step of the poorest kind it knew (agent · title · prompt ·
     * mode, and nothing else the model carries), and `editWorkflowStep` was a
     * quickpick of FIELD NAMES: pick "On fail", answer one question, start over
     * for the next field.
     *
     * Here the chain is a list you can read, reorder and edit in place, and one
     * step is one card with everything that step actually is.
     */
    function trunc(s, n) {
        const t = String(s == null ? '' : s);
        return t.length > n ? t.slice(0, n - 1) + '…' : t;
    }

    /** The one line a step reads as in the list — what it is, then what is odd
     *  about it. The flags are the fields a reader would otherwise have to open
     *  the card to find out about. */
    function stepSummary(s) {
        const k = STEP_KINDS.find(x => x.id === s.stype) || STEP_KINDS[0];
        const who = s.stype === 'webhook' ? (s.whMethod || 'POST') + ' ' + trunc(s.whUrl || '(no url)', 44)
            : s.stype === 'media' ? (s.mModel || '(no model)')
                : s.stype === 'browser' ? (s.agent || '?') + ' → ' + trunc(s.bUrl || '(no url)', 34)
                    : s.stype === 'approval' ? 'the chain waits for you'
                        : s.stype === 'select' ? 'keep ' + (s.selMin || 1) + (s.selMax ? '–' + s.selMax : ' or more')
                            : (s.agent || '(no agent)') + ' · ' + (s.smode || 'headless');
        const flags = [];
        if (s.parallel) { flags.push('∥ runs in parallel'); }
        if (s.runIf) { flags.push('only if ' + trunc(s.runIf, 24)); }
        if (s.onFail === 'continue') { flags.push('on fail: carry on'); }
        if (s.onFail === 'goto') { flags.push('on fail → step ' + (s.onFailStep || 1)); }
        if (s.contract === 'json') { flags.push('json handoff'); }
        if (String(s.verifyCriteria || '').trim()) { flags.push('checked by a judge'); }
        return { icon: k.icon, hint: k.label, who: who, flags: flags };
    }

    /**
     * ‼️ M-27 — THE PROMPTS AFTER THE FIRST ONE.
     *
     * The box above is round 1. Each row here is one more turn of the SAME
     * conversation, sent once the round before it has been answered — which is
     * the thing an unattended session usually needs and could not be asked for
     * at all: three prompts meant three tasks, and the second of them woke up
     * knowing nothing about the first.
     *
     * ‼️ DRAWN FOR EVERY KIND THAT RUNS, AND THAT IS THE POINT. A schedule is
     * not a task that reaches this through a form somebody filled in — it
     * carries its own prompt and makes the run itself, at 09:00, with nobody
     * here. So "every morning, and when it answers ask it the next thing" is
     * said HERE or it is not said at all. (It was drawn here and thrown away on
     * the way to the store, which is worse than never offering it.)
     *
     * Drawn EMPTY as a single line of prose with one button. A form that opens
     * with a stack of empty round boxes would charge every ordinary one-prompt
     * run for a feature it is not using — and a control with no referent is a
     * bug (docs/CONVENTIONS.md).
     */
    function roundsHtml(c) {
        /**
         * ‼️ INTERACTIVE CANNOT HAVE ROUNDS, and it says so where the boxes
         * would be — the same treatment the Conversation and the retry pickers
         * already get, for the same reason. A round RESUMES the conversation the
         * round before it was answered in, resuming is a headless argument, and
         * an interactive run opens a terminal instead. Left as a live editor,
         * what the user typed was accepted, stored, and turned into a row that
         * failed at the spawn with a message nobody would connect to it.
         */
        if (c.mode === 'interactive') {
            return `<div class="ntf wide ntrounds"><span title="${C.esc(
                'A round is one more prompt sent into the SAME conversation once the round before it has '
                + 'been answered, which means RESUMING that conversation — and resuming is a headless '
                + 'argument. An interactive run opens a real session in a terminal instead, where the next '
                + 'thing to say is said by typing it, and the session\'s own Resume (Sessions page, or the '
                + 'Console) picks it up later. Set Mode to headless and this becomes editable.'
            )}">More rounds <em>headless only</em></span>
                <div class="muted small">Not for an interactive run — it opens a session you type into.
                    Rounds are for a run with nobody in front of it.</div></div>`;
        }
        const rounds = Array.isArray(c.rounds) ? c.rounds : [];
        const rows = rounds.map((r, i) => {
            const n = i + 2;   // round 1 is the prompt box above
            const wait = Number(r.delayMin) || 0;
            return `<div class="ntround" data-ri="${i}">
                <span class="ntrn" title="${C.esc(
                'Round ' + n + ' — sent into the same conversation once round ' + (n - 1)
                + ' has been ANSWERED. A retry is not a round: a failed run re-attempts the same '
                + 'round with the same words and consumes nothing.')}">R${n}</span>
                <textarea id="nt-round-${i}" rows="2"
                    placeholder="What to say once round ${n - 1} has answered">${C.esc(r.prompt || '')}</textarea>
                <label class="ntrw" title="${C.esc(
                (wait > 0
                    ? 'Waits ' + wait + ' min after round ' + (n - 1) + ' answers before this one is sent.'
                    : 'Sent as soon as round ' + (n - 1) + ' answers.')
                + '\n\nMinutes to wait AFTER the previous answer lands. 0 sends it at once. '
                + 'The wait is a real queued row that says when it starts, so it survives a '
                + 'restart and can be cancelled.')}"><span>wait</span>
                    <input type="number" id="nt-roundw-${i}" min="0" max="${ROUND_DELAY_MAX_MIN}"
                        step="1" value="${C.esc(String(wait))}"><span class="muted small">min</span></label>
                <button class="mini secondary" data-rnd="del" data-i="${i}" title="remove round ${n}">✕</button>
            </div>`;
        }).join('');
        // ‼️ THE EMPTY LINE NAMES THE KIND IT IS SITTING IN. On a schedule the
        // sentence that matters is "every firing is one prompt and then it
        // stops" — which is the complaint the item was written about, and a
        // reader who is told it in the abstract ("one prompt, one turn") does
        // not connect it to the 09:00 job in front of them.
        const each = c.kind === 'schedule' ? 'Every firing sends this one prompt and stops.'
            : c.kind === 'trigger' ? 'Every time this fires it sends this one prompt and stops.'
                : c.kind === 'template' ? 'Running this template sends one prompt and stops.'
                    : 'One prompt, one turn.';
        return `<div class="ntf wide ntrounds"><span title="${C.esc(
            'A round is one prompt sent into the SAME conversation, once the round before it has '
            + 'been answered — so round 2 wakes up knowing everything round 1 did. Add as many as '
            + 'the work needs; each becomes its own queued row when its turn comes, and each can '
            + 'wait a stated number of minutes after the previous answer lands.'
            + '\n\nThis is stated on the SCHEDULE (or trigger, or template) and not only on a '
            + 'one-off task, because that is the case it exists for: a run that fires with nobody '
            + 'here has no one to type the next thing.'
            + '\n\nA RETRY IS NOT A ROUND. A run that fails and is retried re-attempts the same '
            + 'round with the same words and consumes none of these; the retry that finally '
            + 'succeeds is what opens the next one.')}">More rounds <em>${rounds.length
                ? C.esc(String(rounds.length + 1) + ' rounds in all') : 'optional'}</em></span>
            ${rounds.length ? `<div class="ntroundlist">${rows}</div>`
                : `<div class="muted small">${C.esc(each)} Add a round to keep the same conversation
                    going — the next prompt is sent once this one has been answered.</div>`}
            <div class="ctl-row"><button class="secondary mini" id="nt-roundadd"
                title="Add one more prompt to this conversation.">+ another prompt</button></div></div>`;
    }

    function workflowHtml(c) {
        const last = c.steps.length - 1;
        const list = c.steps.map((s, i) => {
            const d = stepSummary(s);
            return `<li class="wfstep${c.stepIdx === i ? ' on' : ''}">
                <span class="wfsi" title="${C.esc(d.hint)}">${d.icon}</span>
                <span class="wfst"><b>${C.esc(s.title || '(untitled step)')}</b>
                    <span class="muted small">${C.esc(d.who)}${d.flags.length ? ' · ' + C.esc(d.flags.join(' · ')) : ''}</span></span>
                <span class="wfsa">
                    <button class="mini secondary" data-st="up" data-i="${i}"${i === 0 ? ' disabled' : ''} title="move it up">↑</button>
                    <button class="mini secondary" data-st="down" data-i="${i}"${i === last ? ' disabled' : ''} title="move it down">↓</button>
                    <button class="mini secondary" data-st="edit" data-i="${i}" title="edit this step">edit</button>
                    <button class="mini secondary" data-st="dup" data-i="${i}" title="add a copy of it below">copy</button>
                    <button class="mini secondary" data-st="del" data-i="${i}" title="remove this step">✕</button>
                </span></li>`;
        }).join('');
        return `<div class="ntsec"><b>Steps</b>
            <span class="muted small">Each step runs after the one above and is handed its output —
                <code>${PREV}</code> in a prompt inserts the previous step's output file,
                <code>{prev_text}</code> its text and <code>{prev_json.x}</code> a field of it.</span></div>
            ${c.steps.length
                ? `<ol class="wfsteps">${list}</ol>`
                : '<div class="ntmsg">No steps yet. A workflow with none is saved, but running it does nothing.</div>'}
            ${c.stepIdx === null
                ? '<div class="ctl-row"><button class="secondary" id="nt-stadd">+ Add a step</button></div>'
                : stepCardHtml(c)}`;
    }

    function stepCardHtml(c) {
        const s = c.step || newStep();
        const isNew = c.stepIdx === -1;
        const n = isNew ? c.steps.length + 1 : c.stepIdx + 1;
        const agentOpts = (DATA.agents || []).map(a =>
            `<option value="${C.esc(a)}"${a === s.agent ? ' selected' : ''}>${C.esc(a)}</option>`).join('');
        const wantsAgent = s.stype === 'agent' || s.stype === 'browser';
        const wantsVerify = s.stype === 'agent' || s.stype === 'media';
        const scenes = DATA.scenes || [];
        const stepOpts = c.steps.map((x, i) => ({ id: String(i + 1), label: (i + 1) + '. ' + trunc(x.title || 'step', 30) }));
        if (isNew) { stepOpts.push({ id: String(n), label: n + '. (this one)' }); }
        return `<div class="stbox" id="stbox">
            <div class="ctl-row">
                <span class="ctl-title">${isNew ? 'New step' : 'Step ' + n}</span>
                <span class="muted small">A step is one link of the chain. What it IS decides the rest of this card.</span>
            </div>
            <div class="ntgrid">
                ${pickSel('st-stype', 'This step is…', STEP_KINDS.map(k => ({ id: k.id, label: k.label })), s.stype,
            'A chain is not only agents: it can call an API, render an asset, drive a site, or stop and ask you.')}
                ${textF('st-title', 'Step title', s.title, 'What is this link called?',
                'The name the run is given when this step fires — it is what you will look for on the Runs tab.', true)}
                ${wantsAgent ? `<label class="ntf" title="Whose folder it runs in, and whose CLAUDE.md it wakes up with."><span>Agent <em>required</em></span>
                    <select id="nt-st-agent">${agentOpts}</select></label>` : ''}
                ${s.stype === 'agent' ? `<label class="ntf" title="Headless is the mode a chain normally runs in: the output is archived and handed to the next step."><span>Mode</span>
                    <select id="nt-st-smode">
                        <option value="headless"${s.smode === 'headless' ? ' selected' : ''}>headless — runs and exits</option>
                        <option value="interactive"${s.smode === 'interactive' ? ' selected' : ''}>interactive — opens a session</option>
                    </select></label>` : ''}
            </div>
            ${s.stype === 'agent' ? `<div class="ntgrid">
                <label class="ntf wide" title="${C.esc(
            'What this one step asks its agent to do. Each step is its own headless run with no '
            + 'memory of the ones before it — what it needs from them arrives as the file '
            + PREV + ' names.\n' + SNIP_HINT)}"><span>Prompt <em>required</em></span>
                    <textarea id="nt-st-prompt" rows="3"
                        placeholder="What should this step do? ${PREV} inserts the previous step's output file.">${C.esc(s.prompt)}</textarea></label>
            </div>` : ''}
            ${s.stype === 'webhook' ? `<div class="ntgrid">
                ${textF('st-whUrl', 'URL', s.whUrl, 'https://n8n.example.com/webhook/…',
                '{secret:NAME} and the {prev_*} variables are substituted before the call.', true)}
                ${pickSel('st-whMethod', 'Method', [{ id: 'POST', label: 'POST' }, { id: 'GET', label: 'GET' }], s.whMethod, 'How it is called.')}
                ${s.whMethod !== 'GET'
                ? textF('st-whBody', 'JSON body', s.whBody, '{"text": "{prev_text}"}', 'Empty = no body.', true) : ''}
                ${textF('st-whHeader', 'Auth header', s.whHeader, 'Authorization: Bearer {secret:MY_TOKEN}',
                    'One "Name: Value" header — this is where a queued API\'s key goes.', true)}
                <label class="cbx" title="Submit, then poll a status URL until it says done — how every queued API works."><input type="checkbox" id="nt-st-whPoll"${s.whPoll ? ' checked' : ''}> poll until it is done</label>
            </div>
            ${s.whPoll ? `<div class="ntgrid">
                ${textF('st-whPollUrl', 'Poll URL field', s.whPollUrl, 'urls.get · status_url · name',
                        'The JSON path IN THE SUBMIT RESPONSE that holds the URL to poll.')}
                ${textF('st-whStatusField', 'Status field', s.whStatusField, 'status', 'The JSON path to the status in each poll response.')}
                ${textF('st-whDone', 'Done when status matches', s.whDone, '', 'A regex. Anything matching it means the job finished.', true)}
                ${numF('st-whInterval', 'Poll every (s)', s.whInterval, 'Seconds between polls.')}
            </div>` : ''}` : ''}
            ${s.stype === 'media' ? `<div class="ntgrid">
                ${textF('st-mModel', 'Model', s.mModel, 'fal-ai/flux/schnell · replicate:owner/name',
                    'fal.ai by default; prefix with "replicate:" for Replicate.', true)}
                ${textF('st-mInput', 'JSON input', s.mInput, '{"prompt": "{prev_text}"}',
                        'The provider\'s own input object. {prev_text} / {prev_json.x} / {secret:NAME} are substituted.', true)}
                ${scenes.length ? pickSel('st-mScene', 'Production scene',
                            [{ id: '', label: '— no scene —' }].concat(scenes.map(x => ({ id: x.id, label: x.label }))), s.mScene,
                            'Ties the produced assets to a scene so the gallery groups them.') : ''}
            </div>` : ''}
            ${s.stype === 'browser' ? `<div class="ntgrid">
                ${textF('st-bUrl', 'Start URL', s.bUrl, 'https://example.com/reports',
                                '{prev_text} / {prev_json.x} are substituted.', true)}
                ${textF('st-bGoal', 'Goal', s.bGoal, 'find the latest report and extract the numbers',
                                    'What the agent is trying to achieve on the site.', true)}
                ${textF('st-bHosts', 'Allowed hosts', s.bHosts, 'example.com, cdn.example.com',
                                        '‼️ The agent may not leave these domains. Empty = the global agentFarm.browserAllowHosts list.', true)}
            </div>` : ''}
            ${s.stype === 'approval' ? `<div class="ntgrid">
                ${textF('st-apMsg', 'Message', s.apMsg, 'Review the output before it goes live',
                                            'Shown when the chain stops to ask you. {prev_text} is substituted.', true)}
            </div>` : ''}
            ${s.stype === 'select' ? `<div class="ntgrid">
                ${textF('st-selMsg', 'Message', s.selMsg, 'Pick the frames that go on to video',
                                                'Shown above the gallery picker. {prev_text} is substituted.', true)}
                ${numF('st-selMin', 'Keep at least', s.selMin, 'The fewest assets you may pick.')}
                ${numF('st-selMax', 'Keep at most', s.selMax, '0 = no ceiling.')}
            </div>` : ''}
            <div class="ntsec"><b>How it behaves in the chain</b>
                <span class="muted small">These are the same on every kind of step — they are about the CHAIN,
                    not about what this step does.</span></div>
            <div class="ntgrid">
                ${pickSel('st-onFail', 'If it fails', [
                                                    { id: 'stop', label: 'stop the workflow (default)' },
                                                    { id: 'continue', label: 'carry on to the next step' },
                                                    { id: 'goto', label: 'jump to a step…' }
                                                ], s.onFail, 'A failing step stops the chain unless you say otherwise.')}
                ${s.onFail === 'goto' ? pickSel('st-onFailStep', 'Jump to', stepOpts.length ? stepOpts : [{ id: '1', label: '1' }],
                                                    String(s.onFailStep || 1), 'Which step it jumps to — 1-based.') : ''}
                ${n > 1 ? textF('st-runIf', 'Run only if', s.runIf, 'regex  ·  json:field.path~regex',
                                                        'Checked against the previous step\'s output. Empty = it always runs.', true) : ''}
                ${s.stype === 'agent' && s.smode === 'headless'
                ? pickSel('st-contract', 'Output', [
                    { id: 'text', label: 'text (default)' },
                    { id: 'json', label: 'json — the next step can use {prev_json.field}' }
                ], s.contract, 'A json contract runs it with --output-format json and parses the result.') : ''}
                ${n > 1 ? `<label class="cbx" title="Adjacent parallel steps form one group; the step after the group receives all their outputs merged."><input type="checkbox" id="nt-st-parallel"${s.parallel ? ' checked' : ''}> runs in parallel with the steps next to it</label>` : ''}
            </div>
            ${wantsVerify ? `<div class="ntgrid">
                ${textF('st-verifyCriteria', s.stype === 'media' ? 'Vision QA criteria' : 'Verify the output',
                    s.verifyCriteria,
                    s.stype === 'media' ? 'a single person, clear face, no six fingers' : 'the output holds a plan with at least 3 items',
                    s.stype === 'media'
                        ? 'A vision model looks at the asset; FAIL regenerates it with the feedback. Empty = no check.'
                        : 'A cheap model judges the output; FAIL retries the step with the feedback. Empty = no check.', true)}
                ${String(s.verifyCriteria || '').trim() ? numF('st-verifyRetries', 'Attempts on FAIL', s.verifyRetries, 'How many times it is redone before the step gives up.') : ''}
            </div>` : ''}
            ${stepMsg ? `<div class="ntmsg warn">${C.esc(stepMsg)}</div>` : ''}
            <div class="ctl-row">
                <span class="spacer"></span>
                <button id="nt-stsave">${isNew ? 'Add this step' : 'Keep the changes'}</button>
                <button class="secondary" id="nt-stcancel">Discard</button>
            </div>
        </div>`;
    }

    function readStep() {
        if (!composer || !composer.step) { return; }
        const s = composer.step;
        const g = (id) => document.getElementById('nt-st-' + id);
        const v = (id) => { const el = g(id); if (el && el.value != null) { s[id] = String(el.value); } };
        const n = (id) => { const el = g(id); if (el) { s[id] = Number(el.value) || 0; } };
        const b = (id) => { const el = g(id); if (el) { s[id] = !!el.checked; } };
        ['stype', 'title', 'agent', 'prompt', 'smode', 'onFail', 'runIf', 'contract', 'verifyCriteria',
            'whUrl', 'whMethod', 'whBody', 'whHeader', 'whPollUrl', 'whStatusField', 'whDone',
            'mModel', 'mInput', 'mScene', 'bUrl', 'bGoal', 'bHosts', 'apMsg', 'selMsg'].forEach(v);
        ['onFailStep', 'verifyRetries', 'whInterval', 'selMin', 'selMax'].forEach(n);
        ['parallel', 'whPoll'].forEach(b);
    }

    /** What a step cannot be saved without — said inside the step card. */
    function stepError(s) {
        if (!String(s.title || '').trim()) {
            return 'A step needs a title — it is what its run is called on the Runs tab.';
        }
        if (s.stype === 'agent') {
            if (!s.agent) { return 'Pick the agent this step runs on.'; }
            if (!String(s.prompt || '').trim()) { return 'An agent step needs a prompt — it is the thing being asked.'; }
        }
        if (s.stype === 'webhook') {
            if (!String(s.whUrl || '').trim()) { return 'A webhook step needs the URL it calls.'; }
            if (s.whPoll && !String(s.whPollUrl || '').trim()) {
                return 'Polling needs the field in the submit response that holds the poll URL.';
            }
        }
        if (s.stype === 'media') {
            if (!String(s.mModel || '').trim()) { return 'A media step needs a model id.'; }
            if (!String(s.mInput || '').trim()) { return 'A media step needs its JSON input.'; }
        }
        if (s.stype === 'browser') {
            if (!s.agent) { return 'Pick the agent that drives the browser.'; }
            if (!String(s.bUrl || '').trim()) { return 'A browser step needs a start URL.'; }
            if (!String(s.bGoal || '').trim()) { return 'A browser step needs a goal — what it is trying to do there.'; }
        }
        if (s.stype === 'select' && s.selMax && s.selMax < (s.selMin || 1)) {
            return 'The most you may keep cannot be fewer than the least.';
        }
        return '';
    }

    /** Fold the open step card back into the chain. Returns false when it
     *  refused, so the caller can stop rather than save half a thought. */
    function commitStep() {
        if (!composer || composer.stepIdx === null) { return true; }
        readStep();
        const err = stepError(composer.step);
        if (err) { stepMsg = err; render(); return false; }
        const s = Object.assign({}, composer.step);
        if (composer.stepIdx === -1) { composer.steps.push(s); }
        else { composer.steps[composer.stepIdx] = s; }
        composer.stepIdx = null;
        composer.step = null;
        stepMsg = '';
        return true;
    }

    function chooserHtml() {
        const ch = chooser;
        return `<div class="ntbox" id="chbox">
            <div class="ctl-row">
                <span class="ctl-title">${C.esc(ch.title || 'Pick one')}</span>
                <span class="muted small">${C.esc(ch.lede || '')}</span>
                <span class="spacer"></span>
                <button class="secondary mini" id="ch-close">✕</button>
            </div>
            ${(ch.items || []).length
                ? `<ul class="chlist">${ch.items.map(i => `<li>
                    <button class="mini" data-ch="${C.esc(i.id)}">${C.esc(ch.verb || 'open')}</button>
                    <b>${C.esc(i.label)}</b>${i.detail ? ` <span class="muted small">${C.esc(i.detail)}</span>` : ''}
                </li>`).join('')}</ul>`
                : `<div class="ntmsg">${C.esc(ch.empty || 'Nothing here yet.')}</div>`}
        </div>`;
    }

    function taskGuideHtml() {

        return `<div class="af-snipwrap" id="af-taskguidewrap">
            <div class="af-snipbox" style="width: min(780px, 92vw); max-height: 82vh;">
                <div class="af-sniphead">
                    <span style="font-weight:600; font-size:13px;">📖 Tasks, Sessions & Retry Architecture Guide</span>
                    <span class="spacer"></span>
                    <button class="secondary mini" id="af-taskguide-close" title="Close (Esc)">✕</button>
                </div>
                <div style="overflow-y: auto; padding: 14px 18px; font-size: 11.5px; line-height: 1.55; color: var(--vscode-foreground);">
                    <div style="margin-bottom: 14px;">
                        <b style="color: var(--vscode-textLink-foreground, #3b82f6); font-size: 12.5px;">1. Three Core Pillars</b>
                        <div style="margin-top: 4px;">
                            Every unattended task or automation answers three essential questions:
                            <ul>
                                <li><b>Conversation:</b> Starts fresh (<code>a new session</code>) or resumes an existing thread (<code>continue an existing conversation</code>).</li>
                                <li><b>When to Retry:</b> Waits for the 5-hour quota window reset (<code>Limit reset</code>), waits fixed intervals (1st/2nd/3rd wait), or scales via backoff/formula.</li>
                                <li><b>What to Say:</b> Re-runs cleanly from scratch (<code>Simple</code>) or picks up an interrupted task right where it stopped (<code>Smart</code>).</li>
                            </ul>
                        </div>
                    </div>

                    <div style="margin-bottom: 14px; border-top: 1px solid var(--vscode-widget-border, #4443); padding-top: 10px;">
                        <b style="color: var(--vscode-textLink-foreground, #3b82f6); font-size: 12.5px;">2. Conversation & Session Continuity (S-19)</b>
                        <table style="width:100%; border-collapse:collapse; margin-top:6px; font-size:11px;">
                            <tr style="background:var(--vscode-editor-inactiveSelectionBackground, #3333);">
                                <th style="padding:5px 8px; text-align:left; border:1px solid var(--vscode-widget-border, #4443);">Option</th>
                                <th style="padding:5px 8px; text-align:left; border:1px solid var(--vscode-widget-border, #4443);">Behavior & Context</th>
                                <th style="padding:5px 8px; text-align:left; border:1px solid var(--vscode-widget-border, #4443);">When to Use</th>
                            </tr>
                            <tr>
                                <td style="padding:5px 8px; border:1px solid var(--vscode-widget-border, #4443);"><b>a new session</b></td>
                                <td style="padding:5px 8px; border:1px solid var(--vscode-widget-border, #4443);">Starts with zero memory and a fresh Session UUID. Fully billed for all tokens.</td>
                                <td style="padding:5px 8px; border:1px solid var(--vscode-widget-border, #4443);">Independent, routine, or clean tasks.</td>
                            </tr>
                            <tr>
                                <td style="padding:5px 8px; border:1px solid var(--vscode-widget-border, #4443);"><b>continue existing...</b></td>
                                <td style="padding:5px 8px; border:1px solid var(--vscode-widget-border, #4443);">Resumes an existing Session ID (<code>--resume</code>). Inherits full context and files read. Only bills the delta cost of this turn (<code>resumeCostBefore</code>).</td>
                                <td style="padding:5px 8px; border:1px solid var(--vscode-widget-border, #4443);">Continuing work previously planned or discussed in Console.</td>
                            </tr>
                        </table>
                        <div style="font-size:10.5px; opacity:0.8; margin-top:4px;">
                            <i>Note on Retry:</i> If a resumed turn hits a 5-hour quota limit, Retry ensures it sleeps until quota reset and delivers the turn to the same thread without failing.
                        </div>
                    </div>

                    <div style="margin-bottom: 14px; border-top: 1px solid var(--vscode-widget-border, #4443); padding-top: 10px;">
                        <b style="color: var(--vscode-textLink-foreground, #3b82f6); font-size: 12.5px;">3. Rate Limits, Timing & Formulas (M-3, M-10)</b>
                        <div style="margin-top: 4px;">
                            <ul>
                                <li><b>Limit Reset (<code>resetAware</code>):</b> When a 5-hour usage limit is hit, the engine reads the exact reset timestamp (e.g. <i>"resets 5am"</i>) and sleeps until <code>resetAt + safetyBufferMin</code> (e.g. 05:03). <b>Applies ONLY to attempt 1</b>; subsequent attempts use interval minutes in case of transient network/API issues.</li>
                                <li><b>1st / 2nd / 3rd Wait:</b> Set explicit wait minutes for initial attempts (e.g. 5m &rarr; 20m &rarr; 60m). Empty boxes inherit the backoff curve below.</li>
                                <li><b>Backoff Strategy:</b> For attempt 4+ (<code>same</code>: fixed, <code>double</code>: 2x exponential, <code>linear</code>: base &times; n, <code>formula</code>: custom expression).</li>
                                <li><b>Formula Syntax:</b> Variables <code>n</code> (attempt number), <code>prev</code> (previous wait in mins), <code>base</code> (1st wait). Functions <code>min(a,b)</code>, <code>max(a,b)</code>. Examples: <code>min(prev * 1.5, 120)</code> or <code>min(prev + 15, 60)</code>.</li>
                            </ul>
                        </div>
                    </div>

                    <div style="margin-bottom: 14px; border-top: 1px solid var(--vscode-widget-border, #4443); padding-top: 10px;">
                        <b style="color: var(--vscode-textLink-foreground, #3b82f6); font-size: 12.5px;">4. Failure Phases & Three Prompt Types (M-10, M-12)</b>
                        <table style="width:100%; border-collapse:collapse; margin-top:6px; font-size:11px;">
                            <tr style="background:var(--vscode-editor-inactiveSelectionBackground, #3333);">
                                <th style="padding:5px 8px; text-align:left; border:1px solid var(--vscode-widget-border, #4443);">Prompt Field</th>
                                <th style="padding:5px 8px; text-align:left; border:1px solid var(--vscode-widget-border, #4443);">When It Executes</th>
                                <th style="padding:5px 8px; text-align:left; border:1px solid var(--vscode-widget-border, #4443);">Empty Box Behavior</th>
                            </tr>
                            <tr>
                                <td style="padding:5px 8px; border:1px solid var(--vscode-widget-border, #4443);"><b>1. Prompt (Initial)</b></td>
                                <td style="padding:5px 8px; border:1px solid var(--vscode-widget-border, #4443);">Sent on the very first run of the task.</td>
                                <td style="padding:5px 8px; border:1px solid var(--vscode-widget-border, #4443);">Required (cannot be empty).</td>
                            </tr>
                            <tr>
                                <td style="padding:5px 8px; border:1px solid var(--vscode-widget-border, #4443);"><b>2. Retry Prompt</b></td>
                                <td style="padding:5px 8px; border:1px solid var(--vscode-widget-border, #4443);">Sent when retrying in <code>Simple</code> mode or when a task failed before doing any work (<code>not-started</code>).</td>
                                <td style="padding:5px 8px; border:1px solid var(--vscode-widget-border, #4443);">Re-sends the <b>Initial Prompt</b> from scratch.</td>
                            </tr>
                            <tr>
                                <td style="padding:5px 8px; border:1px solid var(--vscode-widget-border, #4443);"><b>3. Continuation Prompt</b></td>
                                <td style="padding:5px 8px; border:1px solid var(--vscode-widget-border, #4443);">Sent in <code>Smart</code> mode when a task did real work (edited files) but was cut off by a limit (<code>interrupted</code>). Injected into the SAME conversation.</td>
                                <td style="padding:5px 8px; border:1px solid var(--vscode-widget-border, #4443);">Sends default instruction: <i>"Carry on from where you stopped. Read the transcript above and the working folder first, then finish the ORIGINAL task without redoing work already done."</i></td>
                            </tr>
                        </table>
                    </div>

                    <div style="margin-bottom: 14px; border-top: 1px solid var(--vscode-widget-border, #4443); padding-top: 10px;">
                        <b style="color: var(--vscode-textLink-foreground, #3b82f6); font-size: 12.5px;">5. Safety Brakes: "If it cannot tell"</b>
                        <div style="margin-top: 4px;">
                            Applies when a failed task's transcript has not yet been indexed (<code>unknown</code> phase):
                            <ul>
                                <li><b><code>park</code> (Recommended):</b> Holds the task in yellow <code>parked</code> state until the transcript binds, then intelligently continues or retries. Zero lost or repeated work.</li>
                                <li><b><code>simple</code>:</b> Assumes no work was done and retries immediately from scratch.</li>
                                <li><b><code>ask</code>:</b> Posts a Notice asking you to choose whether to resume or start fresh.</li>
                                <li><b><code>stop</code>:</b> Aborts retry entirely to prevent potential duplicate work.</li>
                            </ul>
                        </div>
                    </div>

                    <div style="border-top: 1px solid var(--vscode-widget-border, #4443); padding-top: 10px;">
                        <b style="color: var(--vscode-textLink-foreground, #3b82f6); font-size: 12.5px;">6. Quick Decision Matrix</b>
                        <ul style="margin-top:4px;">
                            <li><b>Overnight Heavy Task:</b> <code>Limit reset: ON</code>, <code>What a retry is: smart</code>, leave prompt boxes <b>empty</b>.</li>
                            <li><b>Fresh Start with Alternative Prompt:</b> <code>What a retry is: simple</code>, enter instructions in <code>Retry prompt</code>.</li>
                            <li><b>Continue Prior Conversation:</b> <code>Conversation: continue existing...</code>, enter the next step in <code>Prompt</code>.</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>`;
    }

    function composerHtml() {

        if (!composer) { return ''; }
        const L = DATA.launch || {};
        const c = composer;
        const spec = COMPOSE[c.kind] || COMPOSE.task;
        const editing = c.mode2 === 'edit';
        const retry = c.mode2 === 'retry';
        // ‼️ M-8 — THE FORM AS A READOUT. "Let me see what I typed into each box"
        // is answered by the box, not by a second rendering of it: the same
        // card, the same fields, the same order, every control disabled. A
        // paraphrase in a detail grid would be a second thing to keep in step.
        // ‼️ The disabling is done in ONE place after the card is drawn (see
        // `wire`), not by threading a `disabled` through forty template holes:
        // the kind-specific blocks are built by three other functions, and a
        // flag any of them forgot would produce a "read-only" form with three
        // live controls in it.
        const ro = c.mode2 === 'view';
        // A trigger that runs a workflow has no agent, no prompt and no run
        // dimensions of its own — the workflow's steps carry all of that.
        const wantsRun = spec.runs && !(c.kind === 'trigger' && c.act === 'workflow');
        const wantsAgent = wantsRun && !(c.kind === 'trigger' && c.act === 'dispatch');
        // ‼️ A TEMPLATE MAY BE UNBOUND. The quickpick this replaced asked
        // "bind to X / any agent (choose at run time)" as its FIRST question;
        // here it is one more entry in the same picker every other kind uses.
        const anyAgent = c.kind === 'template';
        const agentOpts = (anyAgent
            ? ['<option value=""' + (c.agent ? '' : ' selected') + '>— any agent: you pick when you launch it —</option>']
            : [])
            .concat((DATA.agents || []).map(a =>
                `<option value="${C.esc(a)}"${a === c.agent ? ' selected' : ''}>${C.esc(a)}</option>`))
            .join('');
        const projOpts = ['<option value=""' + (c.project ? '' : ' selected') + '>— no project —</option>']
            .concat((L.projects || []).map(p =>
                `<option value="${C.esc(p.id)}"${p.id === c.project ? ' selected' : ''}>${p.icon ? C.esc(p.icon) + ' ' : ''}${C.esc(p.name)}</option>`))
            .join('');
        const cliOpts = ['<option value=""' + (c.cli ? '' : ' selected') + '>claude — the default executor</option>']
            .concat((L.clis || []).map(p =>
                `<option value="${C.esc(p.name)}"${p.name === c.cli ? ' selected' : ''}>${C.esc(p.name)}</option>`))
            .join('');
        /**
         * ‼️ X-106 — WHICH ROUTE THE RUN IS SERVED BY, and it matters MORE here
         * than anywhere else in this extension.
         *
         * An automation fires with nobody at a window. Every other dimension on
         * this form already understood that — the engine, the effort, the tone,
         * the discipline are all here because "it can only be said when the
         * automation is WRITTEN" — and the endpoint the process actually talks
         * to was the one that could not be said at all: a nightly job took
         * whichever standing route the agent happened to have at 3 a.m.
         *
         * ‼️ DRAWN ONLY WHERE THERE IS SOMETHING TO PICK, exactly as the CLI row
         * beside it is. Three of the five engines have no provider axis and a
         * Claude with no profiles set up has nothing to offer — a box with no
         * referent is what docs/CONVENTIONS.md forbids, and this form is not
         * where a person learns that routes exist (the Providers page is).
         *
         * ‼️ AND THE TIER BOX BELONGS TO THE ROUTE ABOVE IT. `opus` is
         * `kimi-k2-thinking` on one route and `MiniMax-M2` on another, so the
         * word has no meaning until a route answers it — which is why the tiers
         * ride ON each route rather than in a list of their own.
         */
        const routeForm = ntRoutes(c.engine);
        const routeRow = (() => {
            if (!routeForm) { return ''; }
            const noun = String(routeForm.noun || 'Route');
            const opts = ['<option value=""' + (c.providerId ? '' : ' selected')
                + '>— none: nothing injected, nothing cleared —</option>']
                .concat(routeForm.providers.map(p =>
                    `<option value="${C.esc(p.id)}"${p.id === c.providerId ? ' selected' : ''}>${C.esc(p.label)}</option>`))
                .join('');
            const row = `<label class="ntf" title="${C.esc(noun
                + ': the endpoint this run really talks to, which the engine itself never says. '
                + 'An automation fires with nobody watching, so a run that names none takes '
                + 'whichever route the agent happens to be set to when it fires. '
                + 'None = nothing injected and nothing cleared, which is what every run written '
                + 'before this did.')}"><span>${C.esc(noun)}</span>
                    <select id="nt-route">${opts}</select></label>`;
            const tiers = (routeForm.providers.find(p => p.id === c.providerId) || {}).tiers || [];
            if (!tiers.length) { return row; }
            const topts = ['<option value=""' + (c.tier ? '' : ' selected') + '>— the route\'s own choice —</option>']
                .concat(tiers.map(t =>
                    `<option value="${C.esc(t.id)}"${t.id === c.tier ? ' selected' : ''}>${C.esc(t.label)}${t.detail ? ' — ' + C.esc(t.detail) : ''}</option>`))
                .join('');
            return row + `<label class="ntf" title="Which model this route serves for that name. A tier is not a model: &quot;opus&quot; is one model on one route and another on the next, which is why it is asked here and not in the model box."><span>Tier</span>
                    <select id="nt-tier">${topts}</select></label>`;
        })();
        /**
         * ‼️ WHICH ENGINE (X-18) — and it matters MORE here than in the Console.
         *
         * Nobody is sitting in front of an unattended run. An engine that is not
         * installed does not fail visibly: it writes a shell error into an
         * archived file that is read hours later, if at all. So a row that
         * cannot run is offered `disabled` with the one thing to do about it,
         * exactly as the composer offers it, and the extension refuses it again
         * before the spawn (TaskManagerOptions.engineRefusal).
         *
         * It is NOT the CLI row below. A CLI profile is a command template for a
         * binary Agent Farm knows nothing about; an engine is a machine it
         * understands — readiness, flags, sandbox and billing all included.
         * Drawn only when there is more than one engine to choose between.
         */
        const engineSel = cur => {
            const list = L.engines || [];
            if (list.length < 2) { return ''; }
            const chosen = cur || L.defaults?.engine || 'claude';
            const opts = list.map(e => `<option value="${e.id === 'claude' ? '' : C.esc(e.id)}"${
                e.id === chosen ? ' selected' : ''}${e.ready ? '' : ' disabled'} title="${C.esc(e.next)}"
                >${C.esc(e.label)}${e.ready ? '' : ' — cannot run here'}</option>`).join('');
            return `<label class="ntf" title="Which engine runs it. ‼️ On a per-turn engine the permission mode below is spent UP FRONT because the engine cannot stop and ask — a Codex sandbox, a Gemini approval mode, or on Antigravity a request its own app can overrule — and the run states no dollar figure, counting tokens instead (whether that is billed against a plan or a key is what its sign-in says, on the Engines page). ‼️ OpenCode breaks that sentence at both ends: it CAN stop and ask, which is exactly why an unattended run of it needs the auto-approve mode — with nobody to answer, the request comes back REFUSED rather than waiting — and it states the price of every turn itself. An engine with no reasoning-effort setting of its own (Gemini has none, OpenCode has none) is not given that box at all. An engine that is not installed or not signed in here cannot be chosen; hover it for the one thing to do about that."><span>Engine</span>
                <select id="nt-engine">${opts}</select></label>`;
        };
        /**
         * ‼️ U-59 — WHAT "PERMISSIONS" MEANS ON THE ENGINE THIS RUN WILL USE.
         *
         * One sentence served every engine and it was written for the two that
         * behave alike: "one that stops to ask waits until you notice it." A
         * shared-ACP engine does not wait — with nobody on the other end of its
         * own question the tool call comes back refused — and a per-turn engine
         * never asks in the first place. Three shapes, three outcomes, and the
         * one the reader is choosing is the one printed.
         */
        const permTipFor = engineId => {
            const row = (L.engines || []).find(e => e.id === (engineId || 'claude'));
            const shape = (row && row.shape) || 'persistent';
            if (shape === 'sharedAcp') {
                return 'What it may do without asking. ‼️ This engine really does stop and ask — and unattended there is nobody to answer, '
                    + 'so a request it would have asked about comes back REFUSED and the run carries on without that tool. '
                    + 'Choose acceptEdits or bypassPermissions to hand it the auto-approve override instead; both reach the same one flag here. '
                    + 'plan runs its own plan agent, which is refused every edit tool.';
            }
            if (shape === 'perTurn') {
                return 'What it may do without asking. ‼️ This engine cannot stop and ask at all, so this is not a question it will ever put to you: '
                    + 'it is fixed for every turn when the run starts — hover the Engine box above for what it becomes there.';
            }
            return 'What it may do without asking. ‼️ Nobody is sitting in front of an unattended run: one that stops to ask waits until you notice it, and one on bypassPermissions does not stop at all.';
        };
        const LEDE = {
            task: 'A task is one claude run. Everything except the agent and the prompt is optional — an empty field means no flag, and the agent\'s own settings stay in charge.',
            schedule: 'A schedule is a task that has not happened yet: it runs on its own at a set time, so it takes every dimension a task takes — and a guard, so it does not wake an agent for nothing.',
            trigger: 'A trigger runs when something happens. The brakes cap how OFTEN it fires; the guard caps WHETHER it should fire at all.',
            template: 'A template is a saved LAUNCH you repeat by hand: the prompt, the agent, the mode — and the engine, model, effort and permissions it should run with. Launching it is one click, not a form.',
            workflow: 'A workflow is a chain: each step is handed the previous one\'s output. A step is not always an agent — it can call an API, render an asset, drive a browser, or stop and ask you.'
        };
        /**
         * ‼️ M-7 — THE KIND IS A FIELD, NOT A DOOR YOU HAD TO PICK BEFORE YOU
         * STARTED TYPING.
         *
         * A task and a schedule differ by ONE thing — whether a clock starts it
         * — and everything else about them is the same nine fields. But the kind
         * was decided by which button you pressed, so realising halfway through
         * "actually this should run every morning" meant closing the form,
         * losing the prompt and starting again on the other tab. It is one
         * picker now and the draft survives the change: the shared block is
         * kept, only the kind-specific block is redrawn.
         *
         * Offered when CREATING only. Changing the kind of a STORED object is a
         * different act — it would have to delete one thing and make another,
         * with its own history and its own id — and inventing that quietly
         * behind a dropdown is exactly the decision nobody asked for. When you
         * are editing, the kind is a word.
         */
        const KIND_PICK = [
            { id: 'task', label: 'task — runs once, now or when you start it' },
            { id: 'schedule', label: 'schedule — a clock starts it, again and again' },
            { id: 'trigger', label: 'trigger — something happening starts it' },
            { id: 'template', label: 'template — a saved launch you repeat by hand' },
            { id: 'workflow', label: 'workflow — a chain of steps' }
        ];
        const kindField = (editing || retry || ro)
            ? ''
            : `<label class="ntf wide" title="A task and a schedule are the same object with one difference: whether a clock starts it. Change this and everything you have already typed stays — only the part below that depends on the kind is redrawn. (Changing the kind of something already saved is not offered: that would be deleting one thing and making another, which is a decision to make on purpose.)"><span>This is a…</span>
                <select id="nt-kind">${KIND_PICK.map(k =>
                `<option value="${k.id}"${k.id === c.kind ? ' selected' : ''}>${C.esc(k.label)}</option>`).join('')}</select></label>`;
        return `<div class="ntbox${ro ? ' ro' : ''}" id="ntbox">
            <div class="ctl-row">
                <span class="ctl-title">${ro ? 'How this run was made' : retry ? 'Retry' : editing ? 'Edit' : 'New'} ${ro ? '' : C.esc(spec.label)}</span>
                <span class="muted small">${C.esc(ro
                ? 'The form this run was created with, exactly as it was filled in. Nothing here can be changed — to make another one like it, use “Make another like this one” on the row.'
                : retry
                    ? 'A retry is the original run again, and every field below is yours to change first — that is what “run it again on opus” means. It keeps the original\'s lineage and is queued as “… (retry N)”.'
                    : (LEDE[c.kind] || ''))}</span>
                ${ro ? '<span class="roflag">read-only</span>' : ''}
                <span class="spacer"></span>
                <button class="secondary mini" id="nt-close">✕</button>
            </div>
            ${kindField ? `<div class="ntgrid">${kindField}</div>` : ''}
            ${kindMoved ? `<div class="ntmoved">Now a ${C.esc(spec.label)} — so this form moved from the
                ${kindMoved === 'run' ? 'Runs' : 'Plan'} tab to ${tab === 'run' ? 'Runs' : 'Plan'}, where that kind
                lives. Everything you had typed came with it.</div>` : ''}
            <div class="ntgrid">
                ${wantsRun ? `<label class="ntf wide" title="${C.esc(
            'What the agent is asked to do. It runs with nobody watching, so it has to stand on '
            + 'its own: name the files, say what "done" looks like, and say where the answer goes.'
            + '\n' + SNIP_HINT)}"><span>Prompt <em>required</em></span>
                    <textarea id="nt-prompt" rows="4"
                        placeholder="What should the agent do? Ctrl+Enter saves it.">${C.esc(c.prompt)}</textarea></label>
                ${roundsHtml(c)}` : ''}
                <label class="ntf wide"><span>${c.kind === 'task' ? 'Title' : 'Name'}${c.kind === 'task' ? '' : ' <em>required</em>'}</span>
                    <input type="text" id="nt-title" value="${C.esc(c.title)}"
                        placeholder="${c.kind === 'task' ? '(optional — the prompt\'s first line otherwise)' : 'What is this called?'}"></label>
                ${wantsAgent ? `<label class="ntf" title="Whose folder it runs in, and whose CLAUDE.md it wakes up with."><span>Agent${anyAgent ? '' : ' <em>required</em>'}</span>
                    <select id="nt-agent">${agentOpts}</select></label>` : ''}
                ${wantsRun ? `<label class="ntf" title="Headless is claude -p: it runs the prompt, writes its output to an archived file and exits — the mode an unattended run is normally in. Interactive opens a real session in a terminal with the prompt already sent."><span>Mode</span>
                    <select id="nt-mode">
                        <option value="headless"${c.mode === 'headless' ? ' selected' : ''}>headless — runs and exits</option>
                        <option value="interactive"${c.mode === 'interactive' ? ' selected' : ''}>interactive — opens a session</option>
                    </select></label>` : ''}
                ${/**
                    * ‼️ M-26 — AND, FOR AN INTERACTIVE RUN, THE TWO THINGS THAT
                    * WERE NEVER ASKED: where it opens, and whether it stays.
                    *
                    * Drawn ONLY on `interactive`, because a headless run has no
                    * surface and nothing to keep open — a box with no referent
                    * is a bug (docs/CONVENTIONS.md), and here it would be a box
                    * whose answer is discarded. Switching the mode back to
                    * headless repaints the form and they go with it; the values
                    * stay on the draft, so switching back does not lose them.
                    */ ''}
                ${wantsRun && c.mode === 'interactive' ? `
                ${choiceSel('interactiveTarget', 'Opens in', L.targets, c.interactiveTarget,
            'Where this run appears. VS Code\'s own terminal is where every interactive task has always '
            + 'opened. An OS terminal window is the answer to xterm.js glitching on a long TUI session — '
            + 'its exit code is read back through a file, so the task still finishes on its own. The '
            + 'Console hosts the conversation inside Agent Farm, which is the one surface where the '
            + 'extension can follow what the run is doing instead of only when it stopped.')}
                ${choiceSel('interactiveClose', 'When it answers', L.closes, c.interactiveClose,
                'What happens once the agent has replied. Stay-open is the conversational CLI: the answer '
                + 'arrives and the session waits for you — the task finishes when you close it. Auto-close '
                + 'asks the engine in its print-and-exit form, so the answer is written where you can watch '
                + 'it and then the run ENDS: one-turn work you wanted to see, rather than a window to '
                + 'remember to close. (A TUI has no other way to say "the answer is over".)')}` : ''}
                ${/**
                    * ‼️ A TEMPLATE GETS THESE TOO (X-35). It was excluded here —
                    * `c.kind !== 'template'` — which made the one object whose
                    * whole purpose is "that launch again" the only one that
                    * could not state a launch. A task set up on Codex and saved
                    * as a template came back as Claude every time it was run.
                    */ ''}
                ${wantsRun ? `
                ${engineSel(c.engine)}
                ${choiceSel('model', 'Model', ntModels(c.engine), c.model,
            'Which model runs it. ‼️ The list belongs to the ENGINE above: '
            + ntModelNote(c.engine) + ' Beats the model-policy rules in Farm Settings.')}
                ${choiceSel('effort', 'Effort', ntEfforts(c.engine, c.model), c.effort,
                'How much reasoning per turn — the levels the chosen model actually supports. Mechanical work does not need the expensive end, and a run nobody is watching is exactly where that choice is worth making.')}
                ${choiceSel('permissionMode', 'Permissions', L.permissions, c.permissionMode,
                    permTipFor(c.engine))}
                ${/**
                    * ‼️ A-24 — AND WHAT YOU HEAR WHEN IT IS OVER.
                    *
                    * It is not a fifth step in the alert chain: the moment the
                    * run's session id is known, the pick is written into THAT
                    * session's own step, which is the one A-23 built and the one
                    * the Live Timeline already draws — so the row says "this
                    * session's own choice" and is telling the truth.
                    */ ''}
                ${choiceSel('finishSound', 'Sound on finish', L.finishSounds, c.finishSound,
                'What this run sounds like when it ends. Left on Default, the alert settings decide as '
            + 'they always have. A tone is written onto the run\'s OWN session the moment it has one, so it '
            + 'beats the fleet setting for this run and nothing else — and picking one also arms that '
            + 'session\'s ♪, otherwise the choice would do nothing while the fleet switch is off. '
            + '‼️ Silent mutes the WHOLE run, not only its ending: silence is not a tone, it is the '
            + 'session mute, and it is the only thing that can take a sound away.')}
                ${/**
                    * ‼️ M-30 — AND WHETHER THIS JOB WORKS TO THE DISCIPLINE.
                    *
                    * Beside Model / Effort / Permissions because it is the same
                    * kind of answer: HOW this run works, decided when the run is
                    * written. X-133's switch is one per agent, which cannot say
                    * "…except for this job" — and a nightly lint sweep and a
                    * feature build are the same agent doing different work.
                    *
                    * ‼️ NOT A CHECKBOX. A checkbox has two states and this has
                    * three: the empty one is "the agent's own default decides",
                    * which is what every task written before this said, and a
                    * checkbox would have had to invent an answer for all of them.
                    */ ''}
                ${choiceSel('superpowers', '\u26a1 Superpowers', L.superpowersChoices, c.superpowers,
                'Whether THIS job works to the Superpowers discipline: brainstorm before building, a '
            + 'plan before code, systematic debugging before a fix. Normally one switch per agent '
            + '(Farm Settings), which answers "how does this agent work" and cannot answer "…except '
            + 'for this one" \u2014 a nightly lint sweep and a feature build are the same agent and are '
            + 'not the same kind of work. '
            + '\u203c Agent default is a THIRD answer, not Off: it hands the decision back to the '
            + 'agent\'s own setting, which is what every run made before this row existed did. '
            + 'Choose Off to switch the discipline off for this job alone.')}
                <label class="ntf" title="${c.kind === 'task'
                        ? 'The project this task belongs to. Recorded when it is CREATED, not when it runs — a queued task can sit for hours, and by the time it starts the window may be showing something else entirely.'
                        : 'The project its runs belong to. An automation fires with nobody looking at a window, so it has no project unless you declare one here.'}"><span>Project</span>
                    <select id="nt-project">${projOpts}</select></label>
                ${(L.clis || []).length ? `<label class="ntf" title="A named CLI profile from agentFarm.cliProfiles. A non-claude executor is not monitored the way claude is — its output is archived and that is all."><span>CLI</span>
                    <select id="nt-cli">${cliOpts}</select></label>` : ''}
                ${routeRow}
                <label class="ntf" title="Higher runs sooner when the queue is full. It also ages up while waiting, so nothing starves."><span>Priority</span>
                    <input type="number" id="nt-priority" step="1" value="${C.esc(String(c.priority || 0))}"></label>
                <label class="ntf wide" title="Run it somewhere other than the agent's own folder — a worktree, a repo it is working on. Empty = the agent folder."><span>Working folder</span>
                    <input type="text" id="nt-workdir" value="${C.esc(c.workDir)}" placeholder="(optional) — defaults to the agent's folder"></label>
                ${/**
                    * ‼️ M-7 — "RUN IT WHATEVER THE BUDGET SAYS."
                    *
                    * The daily budget in Farm Settings is a brake with no
                    * release: over the ceiling nothing new launches, and an
                    * unattended run whose time came at 09:00 simply sat there.
                    * That is right for what the ceiling protects against and
                    * wrong for the one piece of work that has to happen anyway
                    * — and it is the USER'S ceiling, so the user may lift it for
                    * a named run.
                    *
                    * Deliberately narrow, and the label says so: it waives the
                    * BUDGET and nothing else. The 5-hour quota guard protects
                    * the plan window and the concurrency limits protect this
                    * machine; neither is a policy about money, and a run held by
                    * those is waiting rather than refused.
                    */ ''}
                <label class="ntf wide cbxf" title="The daily budget (Farm Settings → budgets) stops a run before it starts and keeps it queued until the ceiling clears — which for an unattended run can mean the whole day. Tick this and the budget is not consulted for this one. ‼️ It does NOT lift the 5-hour quota guard or the concurrency limits: those protect the plan window and this machine, they are not a number you set about money, and a run held by them is waiting rather than refused."><span>Budget</span>
                    <label class="cbx"><input type="checkbox" id="nt-ignorebudget"${c.ignoreBudget ? ' checked' : ''}>
                        run it even when the daily budget is spent</label></label>
                ${conversationHtml(c)}
                ${retryHtml(c)}` : ''}
            </div>
            ${c.kind === 'schedule' ? scheduleHtml(c) : ''}
            ${c.kind === 'trigger' ? triggerHtml(c) : ''}
            ${c.kind === 'workflow' ? workflowHtml(c) : ''}
            ${composerMsg ? `<div class="ntmsg${composerLoud ? ' warn' : ''}">${C.esc(composerMsg)}</div>` : ''}
            <div class="ctl-row">
                ${ro ? '' : `${c.kind === 'task' ? `<label class="cbx" title="Off = it waits in the queue until you press start (or capacity frees up for something with a higher priority).">
                    <input type="checkbox" id="nt-start"${c.start ? ' checked' : ''}> start it now</label>` : ''}
                ${c.kind === 'schedule' || c.kind === 'trigger' ? `<label class="cbx" title="Off = it is saved but does not fire until you switch it on.">
                    <input type="checkbox" id="nt-enabled"${c.enabled ? ' checked' : ''}> switched on</label>` : ''}`}
                <span class="spacer"></span>
                <button class="secondary mini" id="nt-guide-btn" title="Guide: Tasks, Sessions & Retry Architecture">?</button>
                ${ro ? '' : composerDup ? '<button class="secondary" id="nt-force">Add it anyway</button>' : ''}
                ${''/* ‼️ M-26 — THE ACTION IS THE LAST THING IN THE ROW, and Cancel
                    sits to its left. The corner is where a hand ends up and where
                    a form's own verb belongs; Cancel had it, so the press that
                    finishes the work was one button in from the edge and the
                    press that throws it away was the easy one. */}
                <button class="secondary" id="nt-cancel">${ro ? 'Close' : 'Cancel'}</button>
                ${ro ? '' : `<button id="nt-add">${c.kind === 'task'
                ? (retry
                    ? (c.start ? 'Retry it now' : 'Queue the retry')
                    : (c.start ? 'Add and start' : 'Add to the queue'))
                : (editing ? 'Save changes' : 'Create the ' + spec.label)}</button>`}
            </div>
        </div>`;
    }

    function readComposer() {
        if (!composer) { return; }
        const v = (id, key) => {
            const el = document.getElementById('nt-' + id);
            if (el && el.value != null) { composer[key] = String(el.value); }
        };
        const n = (id, key) => {
            const el = document.getElementById('nt-' + id);
            if (el) { composer[key] = Number(el.value) || 0; }
        };
        const b = (id, key) => {
            const el = document.getElementById('nt-' + id);
            if (el) { composer[key] = !!el.checked; }
        };
        v('prompt', 'prompt'); v('title', 'title'); v('agent', 'agent'); v('mode', 'mode');
        // ‼️ M-27 — the rounds are read BY INDEX off the draft's own list rather
        // than by scraping the DOM for them: the row is the truth about how many
        // there are (adding and removing act on the draft, so Cancel really
        // cancels), and a box that is not on the page — the form is on another
        // kind, or read-only — leaves what was typed alone.
        if (Array.isArray(composer.rounds)) {
            composer.rounds = composer.rounds.map((r, i) => {
                const box = document.getElementById('nt-round-' + i);
                const wait = document.getElementById('nt-roundw-' + i);
                return {
                    prompt: box ? String(box.value) : String(r.prompt || ''),
                    delayMin: wait ? Math.max(0, Number(wait.value) || 0) : (Number(r.delayMin) || 0)
                };
            });
        }
        v('engine', 'engine');
        v('model', 'model'); v('effort', 'effort'); v('permissionMode', 'permissionMode');
        // ‼️ M-26 — drawn only on an interactive run, and `v()` skips what is not
        // on the page: switching to headless and back keeps both answers on the
        // draft instead of resetting them to the defaults.
        v('interactiveTarget', 'interactiveTarget'); v('interactiveClose', 'interactiveClose');
        // A-24 - what it sounds like when it ends. Always on the page for a
        // run, so no mode-dependent skip applies to it.
        v('finishSound', 'finishSound');
        // M-30 - and how it works. Always on the page for a run, like the tone
        // above it, so no mode-dependent skip applies.
        v('superpowers', 'superpowers');
        v('project', 'project'); v('cli', 'cli'); v('workdir', 'workDir');
        // ‼️ X-106 — the route and the tier under it. Drawn only where the
        // engine has a provider axis with something set up, and `v()` skips what
        // is not on the page — so moving to an engine with no routes and back
        // keeps the answer on the draft instead of erasing a choice the user
        // made (same rule as the interactive pair above).
        v('route', 'providerId'); v('tier', 'tier');
        n('priority', 'priority');
        b('start', 'start'); b('enabled', 'enabled'); b('ignorebudget', 'ignoreBudget');
        // M-3 — the fields only exist while the picker says "set it here", and
        // `v`/`n` skip what is not on the page, so switching back to `default`
        // keeps the numbers in the draft for when it is switched on again.
        v('retrymode', 'retryMode'); v('retrybackoff', 'retryBackoff');
        v('retrywhen', 'retryWhen'); v('retryprompt', 'retryPrompt');
        n('retrymax', 'retryMax'); n('retrydelay', 'retryDelayMin');
        // ‼️ M-10 — READ AS TEXT, NOT AS NUMBERS. `n()` turns an empty box into
        // 0, and 0 minutes is a policy ("wait no time at all") rather than the
        // silence an empty box means. These stay strings until `retryFromDraft`
        // decides whether the user said anything.
        v('retrydelay2', 'retryDelay2Min'); v('retrydelay3', 'retryDelay3Min');
        v('retryformula', 'retryFormula'); v('retrycap', 'retryCapMin');
        // ‼️ M-10 — what a retry IS, and what to do when that cannot be told.
        v('retrybehavior', 'retryBehavior'); v('continuationprompt', 'retryContinuation');
        v('unknownfallback', 'retryUnknown');
        b('retryresetaware', 'retryResetAware'); n('retrysafety', 'retrySafetyMin');
        // ‼️ S-19 — which conversation, and the box that narrows the list.
        v('conversation', 'conversation'); v('resumeid', 'resumeSessionId');
        v('resumefind', 'resumeFind');
        // schedule
        v('every', 'every'); v('time', 'time'); v('onceAt', 'onceAt'); v('missed', 'missed');
        n('dow', 'dow');
        // trigger
        v('ttype', 'ttype'); v('watchPath', 'watchPath'); v('hookEvent', 'hookEvent');
        v('hookAgent', 'hookAgent'); v('token', 'token'); v('act', 'act'); v('workflowId', 'workflowId');
        n('debounceSec', 'debounceSec'); n('cooldownSec', 'cooldownSec'); n('maxPerHour', 'maxPerHour');
        // guard
        v('guardKind', 'guardKind'); v('guardPath', 'guardPath'); v('guardExcept', 'guardExcept');
        n('guardMin', 'guardMin'); n('guardHours', 'guardHours'); b('guardRecursive', 'guardRecursive');
    }

    /**
     * What the form refuses to send, and why it says so IN the form.
     *
     * A modal that steals focus from a half-filled form to tell you the form is
     * half-filled is the worst of both worlds — the message belongs where the
     * mistake is.
     */
    function composerError(c) {
        const spec = COMPOSE[c.kind] || COMPOSE.task;
        const wantsRun = spec.runs && !(c.kind === 'trigger' && c.act === 'workflow');
        if (c.kind !== 'task' && !String(c.title || '').trim()) {
            return 'A ' + spec.label + ' needs a name — it is how you find it on this page.';
        }
        if (wantsRun && !String(c.prompt || '').trim()) {
            return 'A ' + spec.label + ' needs a prompt — it is the thing the agent is asked to do.';
        }
        if (c.kind === 'schedule' && c.every === 'once' && !c.onceAt) {
            return 'A one-off schedule needs the moment it fires.';
        }
        if (c.kind === 'schedule' && c.every !== 'once' && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(String(c.time || ''))) {
            return 'The time of day has to read HH:MM, 24-hour.';
        }
        if (c.kind === 'trigger' && c.ttype === 'watch' && !String(c.watchPath || '').trim()) {
            return 'A watch trigger needs the path it watches.';
        }
        if (c.kind === 'trigger' && c.act === 'workflow' && !c.workflowId) {
            return 'Pick the workflow this trigger runs.';
        }
        if (c.guardKind && c.guardKind !== 'queueHasWork' && !String(c.guardPath || '').trim()) {
            return 'That guard looks at a path — say which one, or take the guard off.';
        }
        // ‼️ M-10 — A FORMULA IS REFUSED WHERE IT WAS TYPED. The host validates
        // it again (it has to — the bridge can post one too), but a policy that
        // only fails at 03:00, on the retry that was the whole point, is exactly
        // the kind of silence this feature exists to remove.
        if (c.retryMode === 'custom' && c.mode !== 'interactive' && c.retryBackoff === 'formula') {
            const err = retryFormulaError(c.retryFormula || '');
            if (err) { return 'The retry formula was refused — ' + err; }
        }
        return '';
    }

    /** The draft's three-state retry picker, as the one field the host stores.
     *  undefined = say nothing, so the user's default stays in charge. */
    function retryFromDraft(c) {
        // M-3 (V3) — the picker is disabled for an interactive run, so a policy
        // left in the draft from before the mode was switched is not stored on
        // it either: a run carrying a rule nothing applies is the same lie in
        // the read-only form and in `describeRetry`.
        if (!c || c.retryMode === 'default' || c.mode === 'interactive') { return undefined; }
        if (c.retryMode === 'off') { return { max: 0 }; }
        const out = {
            max: Number(c.retryMax) || 0,
            delayMin: Number(c.retryDelayMin) || 1,
            backoff: ['same', 'double', 'linear', 'formula'].indexOf(c.retryBackoff) >= 0
                ? c.retryBackoff : 'same',
            when: c.retryWhen === 'any' ? 'any' : 'limit'
        };
        // ‼️ M-10 — AN EMPTY BOX IS NOT A ZERO. Sending `delay2Min: 0` for a box
        // nobody typed in would state a policy ("wait no time before the second
        // one") the user never made; the field simply does not travel.
        const opt = (v) => {
            const s = String(v === undefined || v === null ? '' : v).trim();
            if (!s) { return undefined; }
            const num = Number(s);
            return Number.isFinite(num) && num > 0 ? Math.round(num) : undefined;
        };
        const d2 = opt(c.retryDelay2Min); if (d2) { out.delay2Min = d2; }
        const d3 = opt(c.retryDelay3Min); if (d3) { out.delay3Min = d3; }
        const cap = opt(c.retryCapMin); if (cap) { out.capMin = cap; }
        if (out.backoff === 'formula') {
            const f = String(c.retryFormula || '').trim();
            if (f) { out.formula = f; }
        }
        if (c.retryResetAware) {
            out.resetAware = true;
            const buf = Number(c.retrySafetyMin);
            out.safetyBufferMin = Number.isFinite(buf) && buf >= 0 ? Math.round(buf) : 3;
        }
        const p = String(c.retryPrompt || '').trim();
        if (p) { out.prompt = p; }
        // ‼️ M-10 — SMART IS OPT-IN AND ONLY THE WORD TURNS IT ON. The host's
        // normalizer applies exactly the same rule, so a policy cannot mean one
        // thing in the form and another in the run.
        if (c.retryBehavior === 'smart') {
            out.behavior = 'smart';
            const cp = String(c.retryContinuation || '').trim();
            if (cp) { out.continuationPrompt = cp; }
            const fb = String(c.retryUnknown || '').trim();
            if (fb && fb !== 'park') { out.unknownProgressFallback = fb; }
        }
        return out;
    }

    function submitComposer(force) {
        readComposer();
        // A step card left open is a thought half-typed, not a thought
        // abandoned: saving the workflow folds it in rather than dropping it.
        if (composer.kind === 'workflow' && !commitStep()) { return; }
        const err = composerError(composer);
        if (err) { composerMsg = err; composerLoud = true; render(); return; }
        // ‼️ M-3 — the three states become ONE field on the wire, built here so
        // the page and the host cannot disagree about what "use my default"
        // means. Absent = the default; `{max: 0}` = never; anything else = these
        // numbers. The host clamps it again (core/retry.ts) — a page is not a
        // place to trust a number from.
        const retryOut = retryFromDraft(composer);
        const withRetry = (o) => (retryOut ? Object.assign(o, { retry: retryOut }) : o);
        if (composer.kind === 'task') {
            post({
                type: 'task-new',
                task: withRetry(Object.assign({}, composer, { force: force === true }))
            });
            return;
        }
        // One message for every other kind: the host knows which manager method
        // a kind belongs to, and the page does not have to.
        post({ type: 'plan-save', item: withRetry(Object.assign({}, composer)) });
    }

    // -------------------------------------------------------------- RUN side

    const STATUS = {
        running: ['running', 'go'], queued: ['queued', ''], parked: ['parked', 'warn'],
        done: ['done', 'ok'], failed: ['failed', 'stop'], cancelled: ['cancelled', '']
    };

    /**
     * ‼️ M-7 (V3) — WHY A RUN IS HELD IS A FACT ON THE ROW, NOT A HOVER.
     *
     * "Why does the task page only say parked?" — because it did. The badge was
     * the whole visible answer and the reason lived in the status AFTip and in
     * the timeline, so a user who did not hover read a yellow word and nothing
     * else. The Plan tab had already been taught not to hide an overdue reason;
     * the Runs tab kept the same mistake.
     *
     * Short here and whole in the tip, which is the standing rule for a narrow
     * cell: the parenthetical figures ("$388.91 of $300.00") and the trailing
     * clause are what the tip is for, the subject is what the cell is for.
     */
    function blockShort(s) {
        let t = String(s || '').trim();
        if (!t) { return ''; }
        const paren = t.indexOf('(');
        if (paren > 8) { t = t.slice(0, paren).trim(); }
        if (t.length > 30) {
            const dash = t.indexOf('—');
            if (dash > 8) { t = t.slice(0, dash).trim(); }
        }
        return t.length > 34 ? t.slice(0, 33).trim() + '…' : t;
    }

    /**
     * ‼️ M-27 — HOW DEEP THIS RUN IS, in the shortest unambiguous form
     * (SHORTHAND, docs/CONVENTIONS.md): `R2/4` on the row, the whole sentence in
     * the hover. Nothing at all for a one-prompt task, which is nearly every
     * task there has ever been — a badge that says "1 of 1" on nine rows to
     * explain the tenth is exactly the noise the rule exists to prevent.
     */
    function roundBadge(r) {
        const total = Number(r.roundsTotal) || 0;
        if (total < 2) { return ''; }
        const at = Number(r.round) || 1;
        const left = Number(r.roundsLeft) || 0;
        const wait = Number(r.roundNextWaitMin) || 0;
        const after = left
            ? (wait > 0
                ? ` The next one is sent ${wait} min after this answer lands.`
                : ' The next one is sent as soon as this answer lands.')
            : ' This is the last one.';
        return ` · <span class="rnd" title="${C.esc(
            `Round ${at} of ${total} — one prompt sent into the SAME conversation, once the round `
            + 'before it has been answered.'
            + '\nA RETRY IS NOT A ROUND: a run that fails and is retried re-attempts this same '
            + 'round with the same words and does not move the count.'
            + after)}">R${at}/${total}</span>`;
    }

    function runRows(d) {
        const v = runView;
        // …and so is this one
        const q = window.AFQuery.compile(v.q);
        return d.runs.filter(r => {
            if (v.agent && v.agent.indexOf(r.agentName) < 0) { return false; }
            if (v.status && v.status.indexOf(r.status) < 0) { return false; }
            if (v.source && v.source.indexOf(r.sourceKind) < 0) { return false; }
            if (v.engine && v.engine.indexOf(engineLabel(r)) < 0) { return false; }
            if (!q.empty && !q.test(r.title + ' ' + r.prompt + ' ' + r.agentName + ' ' + r.source
                + ' ' + engineLabel(r))) { return false; }
            return true;
        });
    }

    // Which engine ran the run, said the way the badge says it. Same shape as
    // the Turns page (media/turns.js): an absent `engine` is Claude, because on
    // a Claude transcript the field is an ABSENCE, not a value.
    function engineLabel(r) { return window.AFEngine.label(r.engine || 'claude'); }

    /** The engines actually present in the runs, Claude first — built off the
     *  ROWS, so an engine this build has never heard of is still filterable. */
    function runEngines(d) {
        const claude = window.AFEngine.label('claude');
        const set = [];
        (d.runs || []).forEach(r => {
            const l = engineLabel(r);
            if (set.indexOf(l) < 0) { set.push(l); }
        });
        return set.sort((a, b) => a === claude ? -1 : b === claude ? 1 : a.localeCompare(b));
    }

    /**
     * ‼️ WHAT THE RUN SPENT, IN THE CURRENCY ITS ENGINE ACTUALLY REPORTS (X-19).
     * Only Claude states a price. On every other engine the matched transcript
     * prices at exactly $0.00, which `fmtUSD` then draws as "—" — the same glyph
     * this column uses for "nothing measured yet", so a fully measured Codex run
     * was indistinguishable from an unmeasured one. Those rows show tokens.
     */
    function runSpend(r) {
        if (r.reportsCost === false) {
            // ‼️ M-21 — AND IT NO LONGER BORROWS THE TOKEN FIGURE. Tokens have
            // their own column now, so this said the same thing twice on three
            // engines out of four and nothing at all on the fourth. What is left
            // is the honest answer to "what was it worth": this engine does not
            // say, and the row says so rather than printing a zero.
            return `<span class="muted" title="${C.esc(engineLabel(r)
                + ' bills a plan and publishes no price per run. Its tokens are in the column beside this one; $0.00 here would read as "free", which is a different claim.')}">—</span>`;
        }
        // ‼️ M-25 — A MONEY FIGURE WITH NO HOVER WAS THE LAST BARE CELL IN THIS
        // TABLE. Everything below is derived from what the row already carries,
        // which is what makes a dense table cheap; where a denominator is not
        // worth dividing by (a run of under a minute has no hourly rate) the
        // line is simply not written.
        const usd = r.costUSD || 0;
        return tipw(fmtUSD(r.costUSD), fmtUSD(r.costUSD) + ' — ' + engineLabel(r),
            window.AFTip.lines([
                'Cost: ' + fmtUSD(usd),
                r.tokens ? 'Tokens: ' + r.tokens.toLocaleString() : '',
                r.tokens && usd ? 'Rate: ' + fmtRate(usd / (r.tokens / 1e6)) + ' per million tokens' : '',
                r.durMin >= 1 && usd ? 'Per minute: ' + fmtRate(usd / r.durMin) : '',
                '\nThe API-equivalent of what this run counted, at your agentFarm.pricing rates '
                + '— good for comparing runs, never a bill.'
            ]));
    }

    /* ======================================================================
       ‼️ M-8 — THE ROW IS READ WITHOUT LEAVING IT.

       This table showed eight facts about a run that has thirty, and the rest
       was behind a triangle, behind an unlabelled button, or nowhere at all.
       Every column is a hover opportunity and every one of them was spent on
       nothing — the model to copy is the sessions table, where each column and
       each figure carries what you would otherwise open the object for
       (docs/CONVENTIONS.md → maximum information, minimum clicks).

       One subject per trigger, no fact in two of them: the TASK carries the
       whole prompt, the STATUS carries the run's own history in time order,
       FROM carries the automation's whole setup, SESSION carries the
       conversation, and the figures carry their own derivations.
       ====================================================================== */
    const tipw = (trigger, head, body, cls) =>
        window.AFTip.wrap(trigger, head, body, 'tip-free' + (cls ? ' ' + cls : ''),
            'data-aftip-anchor=".prow"');

    /** `Label: value` lines out of a setup list — one shape for every kind. */
    const setupLines = list => (list || []).map(x => x.label + ': ' + x.value);

    /** The full stamp of a run's first (or `last`) event of these kinds, or ''
     *  when it has none — the caller decides what an absence prints. */
    function eventStamp(r, kinds, last) {
        const hits = (r.events || []).filter(e => kinds.indexOf(e.kind) >= 0);
        const e = last ? hits[hits.length - 1] : hits[0];
        return e ? window.AFTime.full(e.ts) : '';
    }

    /**
     * ‼️ THE PART OF A SESSION ID A PERSON CAN ACTUALLY MATCH.
     *
     * A Claude transcript is named after a UUID, so its first block is the
     * handle everything else in the extension prints. A Codex one is
     * `rollout-019ff43f`, and taking eight characters off THAT drew the column
     * as "rollout-" on every Codex row — the same string four times, with the
     * only distinguishing part cut off. Seen in one glance in a render; passes
     * every string assertion in the repo.
     */
    function shortSid(id) {
        const s = String(id || '');
        if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(s)) { return s.slice(0, 8); }
        const tail = s.split('-').pop();
        return tail.length > 12 ? tail.slice(-12) : tail;
    }

    const EVENT_WORD = {
        created: 'made', parked: 'held back', started: 'started',
        finished: 'ended', cancelled: 'cancelled', retried: 'retried',
        // ‼️ M-21 — "picked back up", never "started": nothing was spawned. A
        // window reload re-attaches a run whose surface outlived the extension
        // host, and the word has to say that it is the SAME run continuing.
        resumed: 'picked back up'
    };

    /**
     * ‼️ M-8 — THE RUN'S OWN HISTORY, IN TIME ORDER. "Its time came and went and
     * I cannot see what happened" is the question this answers, and it could not
     * be answered from three timestamps and a status: a run held back at a
     * ceiling, released, held again and finally started leaves exactly the same
     * three fields as one that simply sat there. Each line is stamped to the
     * minute with its UTC, because these are machine events and comparing one
     * against a provider's own log is the reason anybody opens this.
     */
    function runTimeline(r) {
        const ev = r.events || [];
        if (!ev.length) {
            return 'Nothing was recorded for this run — it predates the run log,'
                + ' which starts with tasks made from this version on.';
        }
        // ‼️ M-8 — A REBUILT LINE SAYS SO. Runs that existed before the log was
        // written get one built out of their own fields (migrateTaskEvents), so
        // the tab answers for them too — but a reconstruction knows the times
        // those fields kept and NOTHING between them, and passing that off as a
        // witnessed record is how a page becomes untrustworthy in the one place
        // it is read for evidence.
        const some = ev.some(e => e.migrated);
        const all = some && ev.every(e => e.migrated);
        const lines = ev.map(e => window.AFTime.full(e.ts) + ' · ' + (EVENT_WORD[e.kind] || e.kind)
            + (e.note ? ' — ' + e.note : '')
            + (e.migrated && !all ? '  ·  rebuilt from the run\'s own fields' : ''));
        if (all) {
            lines.push('', 'Rebuilt from what this run itself kept: it was made before the'
                + ' log existed, so these are the times its fields carry and nothing'
                + ' that happened between them was recorded. Runs made from here on'
                + ' write each line as it happens.');
        }
        return lines.join('\n');
    }

    function runRowHtml(r) {
        const key = 'run:' + r.id;
        const open = expanded.has(key);
        const st = STATUS[r.status] || [r.status, ''];
        const live = r.status === 'running' || r.status === 'queued' || r.status === 'parked';
        // ‼️ `afLive` is computed here rather than derived from the status in a
        // `when` clause: "live" is three statuses, and a menu that spelled that
        // out three times would drift the day a fourth is added.
        // ‼️ M-9 — an archived row publishes no actions, because the task it
        // describes is not there to act on. Everything it SAYS still works: the
        // prompt, the setup, the timeline and the transcript link are the whole
        // reason the row was kept.
        const ctx = r.archived ? '' : window.AFCtx.row('afTaskRun', {
            taskId: r.id, afStatus: r.status, afLive: live,
            afOutput: !!r.hasOutput, afSession: !!r.sessionFile,
            afFrom: r.sourceKind || 'manual'
        });
        const tokPerMin = r.durMin && r.tokens ? Math.round(r.tokens / r.durMin) : 0;
        return `<tr class="prow ${open ? 'open' : ''}${r.archived ? ' arch' : ''}" ${ctx}>
            <td class="expand" data-expand="${key}" role="button" tabindex="0"
                title="${open ? 'Fold this run away' : 'The whole anatomy of this run — how it was set up and what it produced'}">${open ? '▾' : '▸'}</td>
            ${/* ‼️ THE PROMPT, WHOLE. It was cut at 600 characters into a <pre>
                  behind the triangle; "what did I actually ask it to do" is the
                  first question anybody has about a run, and the panel scrolls.
                  Clicking the title opens the form that MADE it, read-only. */''}
            ${/* The hold reason used to be appended here as well. One subject per
                  panel (docs/CONVENTIONS.md): the run's identity belongs to this
                  cell, the reason it is not moving belongs to its status. */''}
            <td class="main">${tipw(`<div class="rowtitle" data-taskform="${r.id}" role="button" tabindex="0"><b>${C.esc(r.title)}</b></div>
                <div class="muted small">${C.esc(r.agentName)} · ${C.esc(r.mode)}${roundBadge(r)}</div>`,
            `${C.esc(r.agentName)} · ${window.AFTip.sizeNote(r.prompt)} of prompt`,
            window.AFTip.lines([
                r.prompt || '(no prompt)',
                '\nClick the title to see the form this run was made with, filled in and read-only.'
            ]), 'mainw')}</td>
            ${/* THE STATUS IS THE DOOR TO THE RUN'S HISTORY — M-8. */''}
            ${/**
               * ‼️ M-12 — A `failed` BADGE IS NOT ONE ANSWER. A run that never
               * started and a run that worked for 45 minutes and was cut off
               * are opposite facts with opposite consequences, and the page said
               * `failed` to both — while the row's own stderr line ("the session
               * limit was hit, so nothing was attempted") actively denied the
               * 3.2 MB transcript sitting beside it. The phase goes UNDER the
               * badge, in the cell, because a fact nobody hovers over is a fact
               * the board does not carry.
               */''}
            <td class="state">${tipw(`<span class="pill ${st[1]}">${C.esc(st[0])}</span>${r.detail
                ? `<div class="muted small held">${C.esc(blockShort(r.detail))}</div>` : ''}${r.didWork
                    ? `<div class="muted small held">${C.esc(blockShort(r.didWork))}</div>` : ''}${r.archived
                    ? '<div class="muted small">archived</div>' : ''}`,
                `${C.esc(st[0])}${r.archived ? ' · archived' : ''}${r.detail ? ' · ' + C.esc(r.detail) : ''}`,
                window.AFTip.lines([
                    r.detail ? 'Held by: ' + r.detail + '\n' : '',
                    r.didWork ? 'What it managed: ' + r.didWork
                        + '\n‼️ This run was CUT OFF, not untouched — read its transcript before sending '
                        + 'the same work again.\n' : '',
                    r.archived
                        ? 'This run is no longer on the list — it was deleted, cleared, or aged '
                        + 'out past the cap, and this is its filed copy. Nothing here can be '
                        + 'acted on; its output file was deleted with it.\n'
                        : '',
                    runTimeline(r)
                ]))}</td>
            <td class="from">${tipw(r.sourceKind === 'manual' ? '<span class="muted">you</span>'
                : `${C.esc(r.sourceKind)}<div class="muted small">${C.esc(r.source)}</div>`,
                r.sourceKind === 'manual' ? 'started by you' : `${r.sourceKind} · ${r.source}`,
                window.AFTip.lines(setupLines(r.setup)))}</td>
            <td class="eng">${window.AFEngine.badge(r.engine || 'claude',
                'Engine: ' + engineLabel(r) + '\nPrice per run: '
                + (r.reportsCost === false ? 'not reported — plan or account billing' : 'reported'))}</td>
            ${/* ‼️ M-8 — WHICH CONVERSATION. A run that ran opened a session and
                  the page KNEW which one (that is where the price comes from) —
                  it just never said. Click it and the transcript opens. */''}
            <td class="sess">${r.sessionId
                ? tipw(`<span class="slink" data-tr="${C.esc(r.sessionFile)}" role="button" tabindex="0">${C.esc(shortSid(r.sessionId))}</span>`,
                    `session ${C.esc(shortSid(r.sessionId))}`,
                    window.AFTip.lines([
                        'Session: ' + r.sessionId,
                        r.tokens ? 'Tokens: ' + C.fmtTok(r.tokens) : '',
                        r.costUSD !== undefined && r.reportsCost !== false ? 'Cost: ' + fmtUSD(r.costUSD) : '',
                        'Transcript: ' + r.sessionFile,
                        '\nClick to open the whole conversation this run had.'
                    ]))
                : `<span class="muted" title="${C.esc(live
                    ? 'The transcript is matched a few minutes after the run ends — a run still going has not been matched yet.'
                    : 'No transcript was matched to this run. An interactive run in a terminal, a non-claude CLI profile, or a run that died before it said anything all end up here.')}">—</span>`}</td>
            <td class="num">${r.durMin !== undefined ? tipw(r.durMin + 'm',
                `${r.durMin} minutes`,
                window.AFTip.lines([
                    // ‼️ M-25 — `'Started: ' + x || '—'` reads as
                    // `('Started: ' + x) || '—'`, which is never falsy: a run
                    // with no matching event drew the literal words "Started:
                    // undefined". The fallback has to be chosen BEFORE the
                    // label is glued on.
                    'Started: ' + (eventStamp(r, ['started']) || '—'),
                    'Ended: ' + (eventStamp(r, ['finished', 'cancelled'], true) || '—'),
                    r.durMin ? '\nWall clock, not time the agent spent working.' : ''
                ])) : '—'}</td>
            ${/* ‼️ M-21 — WHAT IT BURNED, in its own column. The rate came with
                  it out of the "Took" panel: how fast it spent is a fact about
                  the spending, and one fact belongs to one panel. */''}
            <td class="num">${r.tokens
            ? tipw(C.fmtTok(r.tokens), `${r.tokens.toLocaleString()} tokens`,
                window.AFTip.lines([
                    `${r.tokens.toLocaleString()} tokens in total — input, output, cache reads and cache writes together.`,
                    tokPerMin ? `Rate: ${C.fmtTok(tokPerMin)} tokens a minute, over ${r.durMin} minute(s).` : '',
                    r.reportsCost === false
                        ? `${engineLabel(r)} bills a plan and publishes no price per run, so this is the only spend figure it states — the Cost column beside it is empty for that reason, not because the run was free.`
                        : 'The Cost column beside this is what these tokens were worth in money.'
                ]))
            : `<span class="muted" title="${C.esc(live
                ? 'The transcript is matched a few minutes after a run ends, and the tokens come off it — a run still going has nothing to count yet.'
                : 'No transcript was matched to this run, so nothing was counted. It does not mean the run spent nothing.')}">—</span>`}</td>
            <td class="num">${runSpend(r)}</td>
            <td class="when"><span title="${C.esc(window.AFTime.tip(r.when, 'This row\'s clock — when it ended, or when it started, or when it was made'))}">${C.esc(rel(r.when))}</span></td>
            <td class="acts">
                ${r.archived ? '' : `${r.status === 'queued' ? `<button class="mini secondary" data-task="start" data-id="${r.id}">start</button>
                    <button class="mini secondary" data-task="next" data-id="${r.id}" title="move to the front">↑</button>` : ''}
                ${r.status === 'parked' ? `<button class="mini secondary" data-task="unpark" data-id="${r.id}" title="try to start it again">retry start</button>` : ''}
                ${r.status === 'running' ? `<button class="mini secondary" data-task="terminal" data-id="${r.id}">terminal</button>` : ''}
                ${live ? `<button class="mini secondary" data-task="cancel" data-id="${r.id}">cancel</button>` : ''}
                ${!live ? `<button class="mini secondary" data-task="rerun" data-id="${r.id}">re-run</button>` : ''}
                ${r.hasOutput ? `<button class="mini secondary" data-out="${C.esc(r.outputFile)}">output</button>` : ''}
                ${!live ? `<button class="mini secondary" data-task="delete" data-id="${r.id}" title="Take it off this list. It is filed in the task archive either way, and ↶ Undo puts it straight back.">✕</button>` : ''}`}
            </td>
        </tr>${open ? `<tr class="detail"><td colspan="11"><div class="detailbox">
            ${/* ‼️ M-8 — THE TRIANGLE SAYS THE WHOLE SETUP. It used to say the
                  word "schedule" and stop, which is the one thing the row above
                  it already said. */''}
            <div class="dgrid">
                ${(r.setup || []).map(x => `<div><b>${C.esc(x.label)}</b><div>${C.esc(x.value)}</div></div>`).join('')}
                ${r.verified ? `<div><b>Verify</b><div>${C.esc(r.verified)}</div></div>` : ''}
                ${r.sessionId ? `<div><b>Session</b><div><button class="mini secondary" data-tr="${C.esc(r.sessionFile)}">${C.esc(shortSid(r.sessionId))} — open it</button></div></div>` : ''}
            </div>
            <div class="dprompt"><b>What happened, in order</b><pre>${C.esc(runTimeline(r))}</pre></div>
            <div class="dprompt"><b>Prompt</b><pre>${C.esc(r.prompt)}</pre></div>
        </div></td></tr>` : ''}`;
    }

    /**
     * ‼️ M-9 — THE RUNS THAT HAVE LEFT THE BOARD, IN THE TABLE THEY LEFT.
     *
     * Deleting a run files it in a monthly archive, and the only way to look at
     * that archive was to open the .jsonl in the editor — the raw store, for a
     * question ("I deleted it, now I need it") that the page above it already
     * answers for every run still on the list. A second page would have meant a
     * second table, a second set of filters and a second definition of every
     * column; this is a SWITCH on the one table, so the search, the agent
     * filter and the sort all keep working across both.
     *
     * The month picker only appears once the archive is on: it is the second
     * question and nobody asks it before the first. `All months` is the default
     * because the run being looked for is remembered by what it was, not by
     * when it was deleted.
     */
    function archiveCtl(d) {
        const a = d.archive || { on: false, month: '', months: [] };
        const months = a.months || [];
        if (!a.on) {
            return `<button class="secondary" data-arch="" ${months.length ? '' : 'disabled'}
                title="${C.esc(months.length
                ? 'Also show the runs that have left this list — deleted, cleared, or aged out past the cap. '
                + 'They are read from the monthly archive, they are read-only, and they answer '
                + '"I deleted it and now I need to look at it" without opening a file. '
                + months.length + ' month(s) filed: ' + months.join(', ')
                : 'Nothing has been archived yet. A run reaches the archive when you delete it, '
                + 'clear the finished ones, or the list grows past its cap.')}">⌛ Archive</button>`;
        }
        return `<select id="arch-month" title="Which month of the archive to read. Every month is the default: a run is remembered by what it was, not by when it left the list.">
                <option value=""${a.month ? '' : ' selected'}>archive · all months</option>
                ${months.slice().reverse().map(mo =>
            `<option value="${C.esc(mo)}"${mo === a.month ? ' selected' : ''}>archive · ${C.esc(mo)}</option>`).join('')}
            </select>
            <button class="secondary" data-archoff="1" title="Back to the live list only.">✕ archive</button>`;
    }

    function runHtml(d) {
        const v = runView;
        const rows = runRows(d);
        const sorted = applySort(rows, v, {
            when: r => r.when, title: r => r.title.toLowerCase(),
            cost: r => r.costUSD || 0, dur: r => r.durMin || 0,
            // ‼️ M-21 — and by what it BURNED, which is the question the Cost
            // column cannot answer on three of the four engines.
            tokens: r => r.tokens || 0
        });
        // ‼️ A COLUMN IS DEFINED ONCE, ON ITS <th> (docs/CONVENTIONS.md). The
        // rows carry the figures; the heading carries what the figures mean.
        const head = `<tr><th class="expand"></th>${sortCell(v, 'title', 'Task',
            false, 'What the run was called, the agent it ran on and the mode. Hover a row for the whole prompt; click the title to see the form it was made with.')
            }<th class="state" title="Where the run is now. Hover it for everything that has happened to it, in time order.">Status</th>
            <th title="What put this run in the queue — a schedule, a trigger, a workflow step, or you. Hover it for that thing's whole setup.">Started by</th>
            <th class="eng" title="Which CLI actually ran this task — the engine the run was queued on (empty = Claude Code)">Engine</th>
            <th class="sess" title="The conversation this run had. A headless run opens a session like any other; its transcript is matched a few minutes after the run ends, which is also where the Cost column comes from. Click one to read it.">Session</th>
            ${sortCell(v, 'dur', 'Took', true, 'Wall clock from the moment the process was spawned to the moment it exited — not time spent working.')
            }${/* ‼️ M-21 — HOW MUCH IT BURNED, WHICH THE TABLE DID NOT SAY AT ALL.
                  The page could tell you a run took four minutes and not what
                  those four minutes cost in tokens — the figure that decides
                  whether a schedule is affordable, and the ONLY spend figure
                  three of the four engines publish. It was reachable nowhere on
                  this page: Cost borrowed it for those engines and hid it for
                  Claude. Each column answers one question now (ONE SUBJECT) —
                  this one what was spent, Cost what it was worth. */''
            }${sortCell(v, 'tokens', 'Tokens', true,
                'Every token the matched transcript counted for this run — input, output, cache reads and cache writes together. It is the figure EVERY engine publishes, so it is the one that compares runs across all four of them, and it is what a plan-billed engine charges you in. Empty means no transcript has been matched to the run yet, not that it spent nothing.')
            }${sortCell(v, 'cost', 'Cost', true,
                'What that spend was worth in money. An engine that publishes a price per turn states its own figure; where none is published this is the API-equivalent of the tokens at your agentFarm.pricing rates — good for comparing runs, never a bill. An engine that states no price AT ALL leaves this empty rather than printing $0.00, which would read as "free": the tokens it did report are in the column beside this one.')}${sortCell(v, 'when', 'When',
                    false, 'When it ended — or, for a run that has not, when it started or was made.')}<th class="acts"></th></tr>`;
        const body = !sorted.length
            ? `<tr><td colspan="11" class="empty">${d.runs.length
                ? 'Nothing matches these filters.'
                : (d.archive && d.archive.on)
                    ? 'Nothing here — neither the live list nor the archive month you are reading holds a run.'
                    : 'Nothing has run yet.'}</td></tr>`
            : sorted.map(runRowHtml).join('');
        return `
            <p class="lede">A <b>task</b> is one execution. It is started by a schedule, a trigger or a
                workflow step — or by you, with <b>+ Run a task</b>. Everything on the Plan tab produces tasks here.</p>
            <div class="toolbar">
                <input type="search" id="runq" placeholder="Search run, prompt, agent…" value="${C.esc(v.q)}" class="${v.q ? 'set' : ''}"
                    title="${C.esc(window.AFQuery.tip('Searched against the run title, its prompt, the agent and what started it.'))}">
                ${sel('agent', 'Agent', v.agent, d.agents)}
                ${/* ‼️ U-52 — the six statuses are really two questions, and the
                      page already has both words: "Clear finished" is a button
                      three inches to the right. Either reading cost a Clear plus
                      three ticks on the axis this table is filtered by most. */''}
                ${sel('status', 'Status', v.status, Object.keys(STATUS), [
            {
                id: 'live', label: 'Still going', values: ['running', 'queued', 'parked'],
                title: 'Everything that has not finished — working, waiting its turn, or held.'
            },
            {
                id: 'finished', label: 'Finished', values: ['done', 'failed', 'cancelled'],
                title: 'Everything that is over, however it ended.'
            }
        ])}
                ${/* ‼️ U-52 — "was this me or the farm?" is the question this
                      column exists for, and three of its four values are one
                      side of it. */''}
                ${sel('source', 'From', v.source, [{ v: 'schedule', t: 'schedule' }, { v: 'trigger', t: 'trigger' }, { v: 'workflow', t: 'workflow' }, { v: 'manual', t: 'you' }], [{
            id: 'auto', label: 'Automation', values: ['schedule', 'trigger', 'workflow'],
            title: 'Everything the farm started by itself — not the runs you pressed.'
        }])}
                ${sel('engine', 'Engines', v.engine, runEngines(d), otherEnginePresets(runEngines(d)))}
                <span class="spacer"></span>
                ${/* ‼️ M-21 — "+ New task" is no longer here: it is on the page's
                      own bar beside Analytics (see tabsHtml). What is left on
                      this row is what it always should have been — the things
                      you do TO this list of runs. */''}
                ${/* ‼️ M-8 — the ✕ on a row is the one deletion a HAND makes, and
                      it was the only one with no way back. It files the row in
                      the task archive now, and this puts it straight back. */''}
                <button class="secondary" id="task-undo"${d.undoable ? '' : ' disabled'}
                    title="${d.undoable ? 'Put the ' + d.undoable + ' run(s) you just deleted back on the list. Their output files are gone; everything else comes back.' : 'Nothing to undo'}">↶ Undo</button>
                <button class="secondary" data-open="cancel-queued">Cancel queued</button>
                <button class="secondary" data-open="clear-finished">Clear finished</button>
                ${archiveCtl(d)}
            </div>
            ${composer && (COMPOSE[composer.kind] || COMPOSE.task).tab === 'run' ? composerHtml() : ''}
            ${chooser && chooser.tab === 'run' ? chooserHtml() : ''}
            ${!composer && composerMsg && tab === 'run' ? `<div class="ntmsg">${C.esc(composerMsg)}</div>` : ''}
            ${activeChips(v, RUN_DEF, { agent: 'agent', status: 'status', source: 'from', engine: 'engine' }, rows.length, d.runs.length)}
            <div class="cmdbar">
                <input id="cmd" placeholder="Tell the farm what to do, in words — e.g. “run the filing batch on manager now”" value="${C.esc(cmdText)}">
                <button id="cmdgo"${pendingCommand ? ' disabled' : ''}>${pendingCommand ? 'working…' : 'Go'}</button>
            </div>
            <div class="tablewrap"><table class="grid">${head}${body}</table></div>`;
    }

    // ---------------------------------------------------------------- render

    function render() {
        const d = DATA;
        pickDefs = [];   // refilled by sel() while the toolbar below is built
        document.getElementById('app').innerHTML = `
            <style>
                .ctl { border:1px solid var(--vscode-widget-border,#4443); border-radius:9px; padding:9px 12px;
                    margin:0 0 12px; background:var(--vscode-editorWidget-background, rgba(128,128,128,.05)); }
                .ctl-row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
                .ctl-row + .ctl-row { margin-top:7px; }
                .ctl-title { font-weight:700; font-size:13px; }
                .spacer { flex:1 1 auto; }
                .btngroup { display:inline-flex; gap:3px; }
                .pill { font-size:11px; border-radius:10px; padding:1px 9px; border:1px solid var(--vscode-widget-border,#4444); }
                .pill.go { color:var(--vscode-charts-green,#3fb950); border-color:currentColor; }
                .pill.warn { color:var(--vscode-editorWarning-foreground,#cca700); border-color:currentColor; }
                .pill.stop { color:var(--vscode-errorForeground,#f85149); border-color:currentColor; font-weight:700; }
                .pill.ok { color:var(--vscode-charts-green,#3fb950); border-color:currentColor; }
                .stats { font-size:12px; }
                .stat { display:inline-flex; gap:5px; align-items:center; padding:1px 9px; border-radius:5px; }
                .stat[role=button] { cursor:pointer; }
                .stat[role=button]:hover { background:var(--vscode-list-hoverBackground); }
                .stat.hot { color:var(--vscode-editorWarning-foreground,#cca700); }
                .bad { color:var(--vscode-errorForeground,#f85149); }
                .tabs { display:flex; gap:4px; align-items:center; margin:0 0 10px;
                    border-bottom:1px solid var(--vscode-panel-border); }
                .tab { padding:7px 18px; border:none; border-bottom:2px solid transparent; border-radius:6px 6px 0 0;
                    background:transparent; color:var(--vscode-foreground); opacity:.6; font-size:13px; cursor:pointer; }
                .tab:hover { opacity:.9; background:var(--vscode-list-hoverBackground); }
                .tab.on { opacity:1; font-weight:600; border-bottom-color:var(--vscode-textLink-foreground);
                    background:var(--vscode-editorWidget-background); }
                .tab-n { opacity:.55; font-weight:400; font-size:11px; }
                .toolbar { display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin:0 0 8px; }
                .toolbar input[type=search], .cmdbar input { padding:4px 9px; }
                .toolbar input[type=search] { min-width:210px; }
                .toolbar select { padding:3px 6px; }
                .toolbar select.set, .toolbar input.set { border-color:var(--vscode-focusBorder); }
                .cbx, .grp { font-size:12px; display:inline-flex; gap:5px; align-items:center; opacity:.85; }
                .chips { display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin:0 0 8px; }
                .chip { font-size:11px; padding:1px 9px; border-radius:10px; cursor:pointer;
                    border:1px solid var(--vscode-focusBorder); background:var(--vscode-editorWidget-background); }
                .chip:hover { background:var(--vscode-list-hoverBackground); }
                .bulk { display:flex; gap:6px; align-items:center; margin:0 0 8px; padding:5px 10px;
                    border:1px solid var(--vscode-focusBorder); border-radius:6px; }
                .bulk[hidden] { display:none; }
                .mini.danger:hover { border-color: var(--vscode-charts-red,#f14c4c); color: var(--vscode-charts-red,#f14c4c); }
                .cmdbar { display:flex; gap:6px; margin:0 0 10px; }
                .cmdbar input { flex:1; }
                /* NEW TASK. A card on the page, in the page's own language — the
                   same box the Automation strip is drawn in — rather than a
                   stack of modal dialogs in front of it. The fields WRAP: on a
                   narrow panel a single row of eleven controls would push the
                   prompt box down to a slit, which is an invitation to write
                   less than you mean. */
                .ntbox { border:1px solid var(--vscode-focusBorder); border-radius:9px; padding:9px 12px;
                    margin:0 0 12px; background:var(--vscode-editorWidget-background, rgba(128,128,128,.05)); }
                .ntgrid { display:flex; flex-wrap:wrap; gap:8px 10px; margin:8px 0; }
                .ntf { display:flex; flex-direction:column; gap:3px; flex:1 1 150px; min-width:140px; font-size:11px; }
                .ntf.wide { flex:1 1 100%; }
                /* ‼️ A BOX THE SIZE OF WHAT GOES IN IT. An ordinary field grows
                   to fill its row, which is right for a prompt and absurd for a
                   two-digit number alone on a line — a 1400px input holding 3. */
                .ntf.thin { flex:0 0 170px; }
                .ntf > span { opacity:.75; }
                .ntf em { font-style:normal; opacity:.75; color:var(--vscode-editorWarning-foreground,#cca700); }
                .ntf select, .ntf input { padding:3px 6px; }
                .ntf textarea { font-family:inherit; font-size:13px; padding:6px 8px; resize:vertical; min-height:70px; }
                /* ‼️ M-27 — THE ROUNDS. One row per prompt, and the row is read
                   left to right: which round it is, what it says, how long it
                   waits first. The prompt box takes every pixel the other three
                   do not need — flex:1 1 auto WITH min-width:0, because a
                   textarea inside a flex row otherwise keeps its 20-column
                   default and squeezes the row into a slit, which is exactly
                   what the first picture of this showed. */
                /* The chain badge on a run row. Same weight as the agent and
                   the mode beside it — it is one more fact about the row, not
                   a warning. */
                .rnd { cursor:help; opacity:.9; font-variant-numeric:tabular-nums; }
                .ntrounds { gap:5px; }
                .ntroundlist { display:flex; flex-direction:column; gap:6px; }
                .ntround { display:flex; align-items:flex-start; gap:7px; }
                .ntrn { flex:0 0 auto; margin-top:5px; font-size:11px; font-weight:600;
                    opacity:.8; cursor:help; min-width:2.1em; }
                .ntround textarea { flex:1 1 auto; min-width:0; font-family:inherit;
                    font-size:13px; padding:5px 7px; resize:vertical; min-height:44px; }
                .ntrw { flex:0 0 auto; display:flex; align-items:center; gap:4px;
                    margin-top:4px; font-size:11px; opacity:.85; cursor:help; }
                .ntrw input { width:4.4em; padding:3px 5px; }
                .ntround > button { flex:0 0 auto; margin-top:3px; }
                .ntmsg { font-size:12px; margin:6px 0; padding:5px 10px; border-radius:5px;
                    background:var(--vscode-editorWidget-background, rgba(128,128,128,.08)); }
                .ntmsg.warn { color:var(--vscode-editorWarning-foreground,#cca700);
                    border:1px solid currentColor; }
                /* A section heading inside the form. The form is long enough
                   that "When", "Brakes" and "Steps" have to be findable at a
                   glance rather than read for. */
                .ntsec { margin:10px 0 0; padding-top:7px; font-size:12px;
                    border-top:1px solid var(--vscode-panel-border); }
                .ntsec b { margin-right:8px; }
                .ntsec .small { line-height:1.5; }
                /* THE CHAIN. A workflow is the one plan object whose content is
                   a LIST, so the form has to show the list — the wizard it
                   replaces asked for step 4 without ever showing steps 1–3. */
                .wfsteps { list-style:none; margin:8px 0; padding:0;
                    border:1px solid var(--vscode-panel-border); border-radius:7px; overflow:hidden; }
                .wfstep { display:flex; gap:9px; align-items:flex-start; padding:6px 9px; font-size:12px;
                    counter-increment:wfs; }
                .wfstep + .wfstep { border-top:1px solid var(--vscode-panel-border); }
                .wfstep:hover { background:var(--vscode-list-hoverBackground); }
                .wfstep.on { background:var(--vscode-list-activeSelectionBackground, rgba(128,128,255,.12)); }
                .wfstep::before { content:counter(wfs) "."; opacity:.55; min-width:1.4em; text-align:right; }
                .wfsteps { counter-reset:wfs; }
                .wfsi { font-size:14px; line-height:1.2; }
                .wfst { flex:1 1 auto; display:flex; flex-direction:column; gap:1px; min-width:0; }
                .wfst .small { word-break:break-word; }
                .wfsa { white-space:nowrap; }
                .wfsa .mini { margin-left:3px; }
                .wfsa .mini[disabled] { opacity:.35; cursor:default; }
                /* One step, opened. Nested inside the form's own card, so it is
                   visibly a part of the workflow rather than a second dialog. */
                .stbox { border:1px solid var(--vscode-focusBorder); border-left-width:3px; border-radius:7px;
                    padding:7px 11px; margin:8px 0 4px;
                    background:var(--vscode-editorWidget-background, rgba(128,128,128,.09)); }
                .stbox .ntsec:first-of-type { margin-top:6px; }
                .stbox code { font-size:11px; }
                /* The in-page picker. Same card as the form, because it is the
                   same kind of thing: a question answered on the page. */
                .chlist { list-style:none; margin:8px 0 2px; padding:0; }
                .chlist li { display:flex; gap:8px; align-items:baseline; padding:4px 2px; font-size:12px; }
                .chlist li + li { border-top:1px solid var(--vscode-panel-border); }
                /* Columns size themselves to their content and use whatever
                   width the window gives them. Only the fixed-size furniture
                   (checkbox, caret) and the numeric/action columns are pinned;
                   the text columns are free to grow on a wide screen and to
                   shrink on a narrow one — nothing is capped by hand. */
                .tablewrap { overflow-x:auto; }
                table.grid { width:100%; border-collapse:collapse; table-layout:auto; }
                table.grid th { text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:.4px;
                    opacity:.65; font-weight:600; padding:4px 10px; border-bottom:1px solid var(--vscode-panel-border); }
                table.grid td { padding:7px 10px; border-bottom:1px solid var(--vscode-panel-border); vertical-align:top; }
                th.sortable { cursor:pointer; user-select:none; white-space:nowrap; }
                th.sortable:hover { color:var(--vscode-textLink-foreground); }
                th.tick, td.tick { width:1%; white-space:nowrap; padding-right:0; }
                th.expand, td.expand { width:1%; white-space:nowrap; padding-left:4px; padding-right:4px;
                    cursor:pointer; opacity:.6; }
                td.expand:hover { opacity:1; }
                td.num, th.num { text-align:right; white-space:nowrap; width:1%; }
                td.acts, th.acts { white-space:nowrap; text-align:right; width:1%; }
                td.state, th.state { width:1%; white-space:nowrap; }
                td.eng, th.eng { width:1%; white-space:nowrap; }
                /* the free-growing text columns */
                td.main { min-width:15rem; }
                td.when, td.guardcell, td.lastrun, td.from { min-width:9rem; }
                td.agent { min-width:6rem; }
                td.acts .mini { margin-left:3px; }
                td.state { text-align:center; }
                /* ‼️ M-7 (V3) — the ceiling holding a run, written under its
                   badge. Same warning colour as the badge so the two read as one
                   statement, and allowed a second line: a reason that is cut to
                   an ellipsis nobody can complete is the hiding this replaced. */
                td.state .held { color:var(--vscode-editorWarning-foreground,#cca700);
                    max-width:11rem; margin:2px auto 0; line-height:1.3;
                    white-space:normal; overflow-wrap:anywhere; }
                .rowtitle { display:flex; gap:6px; align-items:baseline; flex-wrap:wrap; }
                /* ‼️ M-8 — wrapping a cell's contents in an AFTip makes the
                   WRAPPER the block child, so the column's own sizing has to
                   move out to it or the free-growing text column stops growing
                   (docs/CONVENTIONS.md). Same trap, same fix, every time. */
                td.main > .af-tipw.mainw { display:block; min-width:0; }
                td.sess, th.sess { width:1%; white-space:nowrap; }
                /* The session id is a LINK and reads like every other one in the
                   extension: monospace, so two ids can be compared at a glance. */
                td.sess .slink { font-family:var(--vscode-editor-font-family, monospace);
                    cursor:pointer; text-decoration:underline; text-decoration-style:dotted;
                    text-underline-offset:2px; }
                td.sess .slink:hover { color:var(--vscode-textLink-activeForeground,
                    var(--vscode-textLink-foreground)); }
                /* The title is a door now (it opens the form that made the run),
                   so it has to look like one under the pointer. */
                .rowtitle[data-taskform] { cursor:pointer; }
                .rowtitle[data-taskform]:hover b { text-decoration:underline; }
                /* ‼️ M-7 — a schedule whose time has passed and which has not run.
                   Loud, because the whole complaint was that nothing said so. */
                .overdue { color:var(--vscode-editorWarning-foreground,#cca700);
                    font-weight:600; }
                .notrunner { border:1px solid var(--vscode-editorWarning-foreground,#cca700);
                    border-radius:7px; padding:7px 11px; margin:0 0 10px; font-size:12px;
                    background:color-mix(in srgb, var(--vscode-editorWarning-foreground,#cca700) 10%, transparent); }
                /* A read-only form is a READOUT of a form, and must not look like
                   one you can type into — every control is dead and says so. */
                .ntbox.ro input, .ntbox.ro select, .ntbox.ro textarea { opacity:.75; }
                .roflag { font-size:11px; color:var(--vscode-editorWarning-foreground,#cca700); }
                /* The form said nothing when a kind change moved it to the other
                   tab, and a page repainting with your form elsewhere reads as
                   "it did not work". */
                .ntmoved { font-size:11.5px; margin:0 0 8px; padding:5px 9px; border-radius:5px; line-height:1.5;
                    border-left:2px solid var(--vscode-focusBorder);
                    background:color-mix(in srgb, var(--vscode-focusBorder) 9%, transparent); }
                tr.grouphead td { background:var(--vscode-editorWidget-background, rgba(128,128,128,.06));
                    font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:.5px; opacity:.8; padding:5px 8px; }
                tr.prow.open td { border-bottom:none; }
                /* ‼️ M-9 — an ARCHIVED run, read out of the monthly file. It is a
                   real row and everything it says is true, so it is not dimmed
                   into decoration; the left rule is what separates it from the
                   live list, and the word "archived" under its status is what
                   NAMES it (colour alone is not a signal — see CONVENTIONS). */
                tr.prow.arch td:first-child { border-left:2px solid
                    color-mix(in srgb, var(--vscode-descriptionForeground,#9d9d9d) 60%, transparent); }
                tr.prow.arch td { background:color-mix(in srgb,
                    var(--vscode-descriptionForeground,#9d9d9d) 6%, transparent); }
                tr.detail td { padding:0 8px 10px 28px; }
                .detailbox { border-left:2px solid var(--vscode-focusBorder); padding:6px 0 2px 12px; font-size:12px; }
                .dgrid { display:flex; gap:22px; flex-wrap:wrap; margin-bottom:6px; }
                .dgrid b, .dsteps b, .dprompt b { display:block; font-size:10px; text-transform:uppercase;
                    letter-spacing:.4px; opacity:.6; }
                .dsteps ol { margin:2px 0 6px; padding-left:20px; }
                .dprompt pre { white-space:pre-wrap; word-break:break-word; margin:3px 0 0; padding:7px 9px;
                    background:var(--vscode-textCodeBlock-background, rgba(128,128,128,.09)); border-radius:5px;
                    max-height:190px; overflow:auto; font-size:11.5px; }
                .empty { text-align:center; opacity:.6; padding:22px 8px; }
                .lede { font-size:12px; opacity:.8; margin:0 0 9px; max-width:78ch; line-height:1.5; }
                .badge { font-size:10px; border:1px solid var(--vscode-panel-border); border-radius:3px; padding:0 5px; }
                .badge.warn { color:var(--vscode-editorWarning-foreground,#cca700); border-color:currentColor; }
                button.mini { font-size:10px; padding:1px 6px; }
                /* the switch: a real on/off control, not a word that changes */
                .sw { width:34px; height:18px; border-radius:9px; border:1px solid var(--vscode-widget-border,#666);
                    background:var(--vscode-input-background); position:relative; cursor:pointer; padding:0; }
                .sw span { position:absolute; top:2px; left:2px; width:12px; height:12px; border-radius:50%;
                    background:var(--vscode-descriptionForeground,#888); transition:left .12s, background .12s; }
                .sw.on { border-color:var(--vscode-charts-green,#3fb950); }
                .sw.on span { left:18px; background:var(--vscode-charts-green,#3fb950); }
                .guardcell { font-size:11.5px; }
            </style>
            ${window.AFHeader.html({
                page: 'tasks',
                title: 'Tasks',
                sub: `plan what runs · see what ran — updated ${window.AFTime.clockUtc(d.generatedAt)}`,
                guide: 'tasks-sayfasi'
            })}
            ${headerHtml(d)}
            ${tabsHtml(d)}
            ${tab === 'plan' ? planHtml(d) : runHtml(d)}
            ${taskGuideOpen ? taskGuideHtml() : ''}`;

        window.AFHeader.wire(vscode);
        wire();
        if (refocus) {
            const el = document.getElementById(refocus);
            if (el) { el.focus(); if (el.setSelectionRange) { const n = el.value.length; el.setSelectionRange(n, n); } }
            refocus = null;
        }
    }

    function view() { return tab === 'plan' ? planView : runView; }
    function setView(patch) {
        Object.assign(view(), patch);
        persist();
        render();
    }

    function wire() {
        const on = (sel2, ev, fn) => document.querySelectorAll(sel2).forEach(el => el.addEventListener(ev, fn));
        const click = (sel2, fn) => on(sel2, 'click', fn);
        const key = (el, fn) => el.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
        });

        click('[data-tab]', e => { tab = e.currentTarget.dataset.tab; expanded.clear(); persist(); render(); });
        click('[data-gate]', e => {
            const [a, arg] = e.currentTarget.dataset.gate.split(':');
            // 🌙 used to call a command that asked a quickpick and then two
            // input boxes. It opens the card on the strip instead.
            if (a === 'open') { openGate('quiet'); return; }
            post({ type: 'gate', act: a, text: arg });
        });
        click('[data-open]', e => post({ type: e.currentTarget.dataset.open }));
        document.querySelectorAll('[data-open][role=button]').forEach(el => key(el, () => post({ type: el.dataset.open })));
        // ‼️ M-9 — the archive switch, its month, and the way back. The host
        // holds which month is open, because the rows come from files it reads.
        click('[data-arch]', e => post({ type: 'runs-archive', month: e.currentTarget.dataset.arch }));
        click('[data-archoff]', () => post({ type: 'runs-archive' }));
        on('#arch-month', 'change', e => post({ type: 'runs-archive', month: e.currentTarget.value }));
        click('[data-fixissues]', () => setView({ issues: true }));
        document.querySelectorAll('[data-fixissues]').forEach(el => key(el, () => setView({ issues: true })));

        // filters: the pick dropdowns are multi-select (afFilters.js); the
        // checkbox and the grouping select stay single-valued
        pickDefs.forEach(p => window.AFFilter.wireMulti({
            id: p.id,
            onChange: valsel => setView({ [p.name]: valsel })
        }));
        on('[data-f]', 'change', e => {
            const el = e.currentTarget;
            setView({ [el.dataset.f]: el.type === 'checkbox' ? el.checked : el.value });
        });
        const q = document.getElementById(tab === 'plan' ? 'planq' : 'runq');
        if (q) {
            q.addEventListener('input', () => { refocus = q.id; setView({ q: q.value }); });
        }
        click('[data-clear]', e => setView({ [e.currentTarget.dataset.clear]: (tab === 'plan' ? PLAN_DEF : RUN_DEF)[e.currentTarget.dataset.clear] }));
        document.querySelectorAll('[data-clear]').forEach(el =>
            key(el, () => setView({ [el.dataset.clear]: (tab === 'plan' ? PLAN_DEF : RUN_DEF)[el.dataset.clear] })));
        click('[data-resetview]', () => {
            if (tab === 'plan') { planView = Object.assign({}, PLAN_DEF); }
            else { runView = Object.assign({}, RUN_DEF); }
            persist(); render();
        });
        click('[data-sort]', e => {
            const k = e.currentTarget.dataset.sort;
            const v = view();
            setView(v.sort === k ? { asc: !v.asc } : { sort: k, asc: true });
        });

        // expand / collapse
        const toggleExpand = (k) => { expanded.has(k) ? expanded.delete(k) : expanded.add(k); render(); };
        click('[data-expand]', e => toggleExpand(e.currentTarget.dataset.expand));
        document.querySelectorAll('[data-expand]').forEach(el => key(el, () => toggleExpand(el.dataset.expand)));

        // ‼️ M-8 — the run's title opens the FORM IT WAS MADE WITH, read-only.
        // Everything is already on the row (`seed`), so it costs no round trip.
        const openRunForm = (id) => {
            const r = (DATA.runs || []).find(x => x.id === id);
            if (!r) { return; }
            openComposer(Object.assign({}, r.seed, { mode2: 'view', id: r.id }), 'task');
        };
        click('[data-taskform]', e => openRunForm(e.currentTarget.dataset.taskform));
        document.querySelectorAll('[data-taskform]').forEach(el =>
            key(el, () => openRunForm(el.dataset.taskform)));

        // plan actions
        click('[data-plan]', e => {
            const el = e.currentTarget;
            post({ type: 'plan', act: el.dataset.plan, kind: el.dataset.kind, id: el.dataset.id });
        });
        click('[data-add]', e => post({ type: 'plan-add', kind: e.currentTarget.dataset.add }));

        // selection + bulk
        const syncBulk = () => {
            const boxes = document.querySelectorAll('.rowsel');
            // ‼️ M-33 · MIRROR — how many of the selection each button can act
            // on, read off the boxes themselves rather than off a kind list
            // kept in two places. Ticking a box does not repaint the page, so
            // the figures have to be written here or they go stale on the
            // second tick.
            let sw = 0;
            boxes.forEach(b => { if (b.checked && b.dataset.sw) { sw++; } });
            const bar = document.querySelector('.bulk');
            if (bar) {
                bar.hidden = selected.size === 0;
                const n = document.getElementById('bulkn');
                if (n) { n.textContent = String(selected.size); }
                const rest = selected.size - sw;
                document.querySelectorAll('[data-bulk]').forEach(b => {
                    const act = b.dataset.bulk;
                    if (act === 'on' || act === 'off') {
                        b.title = (sw
                            ? 'Switches ' + act + ' the ' + sw + ' of ' + selected.size + ' selected that have a switch.'
                            : 'Nothing selected has a switch.')
                            + (rest ? '\n' + rest + ' workflow(s)/template(s) run when launched — they are untouched.' : '');
                        b.disabled = sw === 0;
                    } else if (act === 'delete') {
                        b.title = 'Deletes all ' + selected.size + ' selected definition(s). '
                            + 'It asks first, and says what it counted.\n\n'
                            + 'The runs they already produced stay on the Runs tab.';
                    }
                });
            }
            const all = document.querySelector('.allsel');
            if (all) {
                all.checked = selected.size > 0 && selected.size === boxes.length;
                all.indeterminate = selected.size > 0 && selected.size < boxes.length;
            }
        };
        on('.rowsel', 'change', e => {
            const el = e.currentTarget;
            const k = el.dataset.kind + ':' + el.dataset.id;
            el.checked ? selected.add(k) : selected.delete(k);
            syncBulk();
        });
        on('.allsel', 'change', e => {
            const chk = e.currentTarget.checked;
            document.querySelectorAll('.rowsel').forEach(b => {
                b.checked = chk;
                const k = b.dataset.kind + ':' + b.dataset.id;
                chk ? selected.add(k) : selected.delete(k);
            });
            syncBulk();
        });
        click('[data-bulk]', e => {
            const a = e.currentTarget.dataset.bulk;
            if (a === 'clear') {
                selected.clear();
                document.querySelectorAll('.rowsel').forEach(b => { b.checked = false; });
                syncBulk();
                return;
            }
            const rows = [...selected].map(k => {
                const i = k.indexOf(':');
                return { kind: k.slice(0, i), id: k.slice(i + 1) };
            });
            if (!rows.length) { return; }
            post({ type: 'bulk', act: a, rows });
            // ‼️ M-33 — DELETE KEEPS THE TICKS. It is the one bulk act that
            // asks a question, and dropping the selection here would mean
            // saying No costs the reader every tick they just made. The host
            // repaints either way, and the prune in planHtml takes the keys of
            // whatever really went.
            if (a !== 'delete') { selected.clear(); }
        });
        syncBulk();

        // ---- the New-task form. Every control writes into the draft as it is
        // touched, because the page repaints itself on every host push and a
        // form that lived only in the DOM would lose a half-written prompt to a
        // task somewhere else finishing.
        const byId = (id, ev, fn) => {
            const el = document.getElementById(id);
            if (el) { el.addEventListener(ev, fn); }
        };
        byId('nt-open', 'click', () => openComposer());
        byId('task-undo', 'click', () => post({ type: 'task-undo' }));
        byId('nt-close', 'click', () => closeComposer());
        byId('nt-cancel', 'click', () => closeComposer());
        byId('nt-add', 'click', () => submitComposer(false));
        byId('nt-force', 'click', () => submitComposer(true));
        byId('nt-guide-btn', 'click', () => { taskGuideOpen = true; render(); });
        byId('af-taskguide-close', 'click', () => { taskGuideOpen = false; render(); });
        const guideWrap = document.getElementById('af-taskguidewrap');
        if (guideWrap) {
            guideWrap.addEventListener('click', e => {
                if (e.target === guideWrap) { taskGuideOpen = false; render(); }
            });
        }
        if (!window.__guideEscBound) {
            window.__guideEscBound = true;
            window.addEventListener('keydown', e => {
                if (e.key === 'Escape' && taskGuideOpen) {
                    taskGuideOpen = false;
                    render();
                }
            });
        }
        if (composer) {
            // M-24 — a right-click in any prompt box opens the saved prompts.
            // Re-bound on every render because the form's fields come and go
            // with the kind being made; bindAll skips whatever is not drawn.
            window.AFSnippets.bindAll(SNIP_BOXES);
            ['prompt', 'title', 'workdir', 'priority', 'watchPath', 'token', 'time', 'onceAt',
                'debounceSec', 'cooldownSec', 'maxPerHour',
                'guardPath', 'guardExcept', 'guardMin', 'guardHours'].forEach(id =>
                    byId('nt-' + id, 'input', () => readComposer()));
            // ‼️ M-26's two boxes are in this list, and they were in NO list when
            // they shipped: `readComposer()` reads them, but nothing called it when
            // one was changed. Pick "its own OS terminal window", let any task
            // anywhere finish, and the repaint drew the box back at the default —
            // silently, because the draft had never been told. Exactly the defect
            // M-21 named on the continuation prompt, on a field two days old.
            ['agent', 'effort', 'permissionMode', 'project', 'cli',
                'interactiveTarget', 'interactiveClose', 'finishSound', 'superpowers',
                'dow', 'missed', 'hookEvent', 'hookAgent', 'workflowId'].forEach(id =>
                    byId('nt-' + id, 'change', () => readComposer()));
            // ‼️ These REDRAW, because they change which fields — or which
            // OPTIONS — exist: "weekly" adds a day picker, "watch" a path, a
            // guard its own row; and (S-20) the engine decides which models the
            // Model box may offer while the model decides the Effort box's
            // levels. A field that only appears after a reload is a field
            // nobody finds.
            // …and (M-3 V3) the MODE decides whether the retry picker has a
            // referent at all: automatic retry is headless-only, so switching to
            // interactive must disable it in place rather than leave a live box
            // collecting a policy nothing will read.
            ['every', 'ttype', 'act', 'guardKind', 'mode'].forEach(id =>
                byId('nt-' + id, 'change', () => { readComposer(); render(); }));
            // ‼️ X-30 — the model redraws the Effort box AND settles what is in
            // it. Redrawing alone left the old word in the composer while the
            // box showed the new model's first level, and the run went out with
            // the word (see ntNarrowEffort).
            // ‼️ M-26 — the mode decides whether two other boxes exist at all
            // (where it opens, what it does when it answers), so it has to
            // repaint. Without this the form kept whichever half it happened to
            // be drawn with: switch to interactive and the two questions never
            // appeared, switch away and they stayed offering an answer nothing
            // would read.
            byId('nt-mode', 'change', () => { readComposer(); render(); });
            byId('nt-model', 'change', () => {
                readComposer();
                if (composer) {
                    composer.effort = ntNarrowEffort(composer.engine, composer.model, composer.effort);
                }
                render();
            });
            // ‼️ X-106 — the tier list is the ROUTE's own, so moving the route
            // has to redraw the box under it (and drop a tier the new route does
            // not map). The same shape the engine handler below has.
            byId('nt-route', 'change', () => { readComposer(); ntNarrowRoute(composer); render(); });
            byId('nt-tier', 'change', () => { readComposer(); });
            byId('nt-engine', 'change', () => {
                readComposer();
                // A model belongs to one engine: `sonnet` carried over to Codex
                // is a --model its CLI can only reject, so it is dropped rather
                // than left sitting in a box that now disagrees with the engine.
                // ‼️ X-149 — asked of the one rule (media/afLaunch.js) rather
                // than written out here, which is what made it the fifth copy.
                if (composer) {
                    const kept = window.AFLaunch.narrowModel(ntCatalog(composer.engine), composer.model);
                    if (kept !== (composer.model || '')) { composer.model = kept; composer.effort = ''; }
                }
                // ‼️ X-106 — and so does a route (see ntNarrowRoute).
                ntNarrowRoute(composer);
                // …and even when the model survives the change, its effort
                // vocabulary may not: the same engine can state different
                // levels for the same name.
                if (composer) {
                    composer.effort = ntNarrowEffort(composer.engine, composer.model, composer.effort);
                }
                render();
            });
            byId('nt-guardRecursive', 'change', () => readComposer());
            byId('nt-enabled', 'change', () => readComposer());
            byId('nt-ignorebudget', 'change', () => readComposer());
            // ‼️ M-3 — the four numbers only exist while the picker says "set it
            // here", so this one repaints; everything under it just reads.
            byId('nt-retrymode', 'change', () => { readComposer(); render(); });
            // ‼️ M-10 — the Formula box and the safety buffer only exist for
            // one value of the control above them, so these two repaint; the
            // rest read. Same rule, one level down.
            byId('nt-retrybackoff', 'change', () => { readComposer(); render(); });
            byId('nt-retryresetaware', 'change', () => { readComposer(); render(); });
            byId('nt-retrybehavior', 'change', () => { readComposer(); render(); });
            byId('nt-unknownfallback', 'change', () => readComposer());
            byId('nt-retrywhen', 'change', () => readComposer());
            byId('nt-retrymax', 'input', () => readComposer());
            byId('nt-retrydelay', 'input', () => readComposer());
            byId('nt-retrydelay2', 'input', () => readComposer());
            byId('nt-retrydelay3', 'input', () => readComposer());
            byId('nt-retrycap', 'input', () => readComposer());
            byId('nt-retrysafety', 'input', () => readComposer());
            /**
             * ‼️ A BOX THAT REDRAWS THE PAGE AS YOU TYPE HAS TO GIVE THE CARET
             * BACK. `render()` replaces the whole of `#app`, so the element under
             * the cursor is a different element afterwards and the second
             * keystroke lands nowhere. These two boxes need the repaint — one
             * shows a refusal that has to clear as the expression is corrected,
             * the other filters a list — so they restore focus themselves. The
             * caret goes to the END because the value is redrawn from the draft,
             * which is exactly where typing continues.
             */
            const typeAhead = (id) => byId(id, 'input', () => {
                readComposer();
                render();
                const box = document.getElementById(id);
                if (!box) { return; }
                box.focus();
                try { box.setSelectionRange(box.value.length, box.value.length); } catch (e) { /* not a text box */ }
            });
            typeAhead('nt-retryformula');
            byId('nt-retryprompt', 'input', () => readComposer());
            // ‼️ M-21 — THE ONE BOX THAT WAS NOT WRITING INTO THE DRAFT. Every
            // other field on this form records itself as it is touched, for the
            // reason stated where the wiring starts: a host push repaints the
            // page and a form that lived only in the DOM loses what was typed.
            // The continuation prompt was read at submit time and nowhere else,
            // so a task finishing somewhere else while you were writing one
            // silently emptied the box — the longest text on the card, and the
            // one that only matters when nobody is watching.
            byId('nt-continuationprompt', 'input', () => readComposer());
            // ‼️ S-19 — the picker, the filter and the chosen row all change
            // what is drawn below them, so all three repaint.
            byId('nt-conversation', 'change', () => { readComposer(); render(); });
            byId('nt-resumeid', 'change', () => { readComposer(); render(); });
            typeAhead('nt-resumefind');
            // ‼️ M-7 — THE KIND CHANGES AND THE DRAFT SURVIVES. Everything typed
            // so far is read out of the boxes first, then the same object is
            // reopened under the new kind: `newDraft` merges the seed over the
            // base, so the shared block is kept and only the kind-specific
            // block below it is rebuilt. It also moves tabs, because a task
            // lives on Run and a schedule on Plan.
            byId('nt-kind', 'change', e => {
                readComposer();
                const seed = Object.assign({}, composer);
                delete seed.kind;
                openComposer(seed, e.currentTarget.value);
            });
            // ‼️ M-8 — ONE PLACE DISABLES THE READ-ONLY FORM. Every control
            // inside the card, whichever function drew it — threading a flag
            // through four builders is how a "read-only" form ends up with three
            // live boxes in it. The buttons in the footer are not controls of
            // the object and are drawn or not by the template.
            if (composer.mode2 === 'view') {
                document.querySelectorAll('#ntbox input, #ntbox select, #ntbox textarea')
                    .forEach(el => { el.disabled = true; });
            }
            // The Add button's own words follow the "start it now" box, so what
            // the press will do is readable before pressing it.
            byId('nt-start', 'change', () => { readComposer(); render(); });
            // Ctrl+Enter queues it — the same bargain the Console composer and
            // the backlog capture box make. Plain Enter stays a newline: these
            // prompts run to a paragraph.
            byId('nt-prompt', 'keydown', ev => {
                if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
                    ev.preventDefault();
                    submitComposer(false);
                }
            });
            // ‼️ M-27 — adding and removing a round act on the DRAFT, for the
            // same reason the workflow's steps do: Cancel has to really cancel,
            // and there is no stored object to act on until the form is saved.
            byId('nt-roundadd', 'click', () => {
                readComposer();
                composer.rounds.push({ prompt: '', delayMin: 0 });
                render();
                // The new box is the thing the user just asked for, so it is
                // where the cursor goes.
                const box = document.getElementById('nt-round-' + (composer.rounds.length - 1));
                if (box) { box.focus(); }
            });
            click('[data-rnd]', e => {
                readComposer();
                const i = Number(e.currentTarget.dataset.i);
                if (i >= 0 && i < composer.rounds.length) { composer.rounds.splice(i, 1); }
                render();
            });
        }

        // ---- the chain, and the one step being written (Faz 2). Reordering
        // and deleting act on the DRAFT: Cancel has to really cancel, and a new
        // workflow has no stored object to act on in the first place.
        if (composer && composer.kind === 'workflow') {
            byId('nt-stadd', 'click', () => {
                if (!commitStep()) { return; }
                composer.stepIdx = -1;
                composer.step = newStep();
                stepMsg = '';
                render();
            });
            click('[data-st]', e => {
                const el = e.currentTarget;
                const i = Number(el.dataset.i);
                const act = el.dataset.st;
                const steps = composer.steps;
                if (!(i >= 0 && i < steps.length)) { return; }
                if (act === 'edit') {
                    if (composer.stepIdx !== null && composer.stepIdx !== i && !commitStep()) { return; }
                    composer.stepIdx = i;
                    composer.step = newStep(steps[i]);
                    stepMsg = '';
                } else if (act === 'del') {
                    steps.splice(i, 1);
                    if (composer.stepIdx === i) { composer.stepIdx = null; composer.step = null; }
                    else if (composer.stepIdx > i) { composer.stepIdx--; }
                } else if (act === 'dup') {
                    steps.splice(i + 1, 0, Object.assign({}, steps[i]));
                    if (composer.stepIdx > i) { composer.stepIdx++; }
                } else if (act === 'up' || act === 'down') {
                    const j = act === 'up' ? i - 1 : i + 1;
                    if (j < 0 || j >= steps.length) { return; }
                    const tmp = steps[i]; steps[i] = steps[j]; steps[j] = tmp;
                    if (composer.stepIdx === i) { composer.stepIdx = j; }
                    else if (composer.stepIdx === j) { composer.stepIdx = i; }
                }
                render();
            });
            byId('nt-stsave', 'click', () => { if (commitStep()) { render(); } });
            byId('nt-stcancel', 'click', () => {
                composer.stepIdx = null;
                composer.step = null;
                stepMsg = '';
                render();
            });
            if (composer.stepIdx !== null) {
                ['title', 'prompt', 'runIf', 'verifyCriteria', 'verifyRetries',
                    'whUrl', 'whBody', 'whHeader', 'whPollUrl', 'whStatusField', 'whDone', 'whInterval',
                    'mModel', 'mInput', 'bUrl', 'bGoal', 'bHosts',
                    'apMsg', 'selMsg', 'selMin', 'selMax'].forEach(id =>
                        byId('nt-st-' + id, 'input', () => readStep()));
                ['agent', 'smode', 'contract', 'onFailStep', 'mScene'].forEach(id =>
                    byId('nt-st-' + id, 'change', () => readStep()));
                byId('nt-st-parallel', 'change', () => readStep());
                // ‼️ These five REDRAW: the kind decides which half of the card
                // exists at all, the method whether there is a body, polling
                // whether there are poll fields, "jump to" which step, and a
                // criteria box whether retries are worth asking about.
                ['stype', 'whMethod', 'whPoll', 'onFail'].forEach(id =>
                    byId('nt-st-' + id, 'change', () => { readStep(); render(); }));
                byId('nt-st-verifyCriteria', 'change', () => { readStep(); render(); });
            }
        }

        // the farm-wide gate, set on the strip that reports it
        if (gateEdit) {
            byId('gt-close', 'click', () => { gateEdit = null; render(); });
            const readGate = () => {
                const v = (id) => { const el = document.getElementById('gt-' + id); return el ? String(el.value || '') : ''; };
                gateFrom = v('from'); gateTo = v('to'); gateReason = v('reason'); gateMins = v('mins') || '0';
            };
            ['from', 'to', 'reason'].forEach(id => byId('gt-' + id, 'input', readGate));
            byId('gt-mins', 'change', readGate);
            byId('gt-quiet', 'click', () => {
                readGate();
                if (!gateFrom || !gateTo) {
                    gateMsg = 'A quiet window needs both ends — a start and an end.';
                    render();
                    return;
                }
                post({ type: 'gate', act: 'quiet-set', quietFrom: gateFrom, quietTo: gateTo });
                gateEdit = null;
            });
            byId('gt-quietoff', 'click', () => { post({ type: 'gate', act: 'quiet-off' }); gateEdit = null; });
            byId('gt-pause', 'click', () => {
                readGate();
                post({
                    type: 'gate',
                    act: gateMins === '0' ? 'pause' : 'pause-for',
                    text: gateMins === '0' ? gateReason : gateMins,
                    reason: gateReason
                });
                gateEdit = null;
            });
        }

        // the in-page picker
        if (chooser) {
            byId('ch-close', 'click', () => { chooser = null; render(); });
            click('[data-ch]', e => {
                post({ type: 'chooser-pick', act: chooser.act, id: e.currentTarget.dataset.ch });
                chooser = null;
                render();
            });
        }

        // run actions
        click('[data-task]', e => post({ type: 'task', act: e.currentTarget.dataset.task, id: e.currentTarget.dataset.id }));
        click('[data-out]', e => post({ type: 'open-output', file: e.currentTarget.dataset.out }));
        click('[data-tr]', e => post({ type: 'open-transcript', file: e.currentTarget.dataset.tr }));

        const cmd = document.getElementById('cmd');
        if (cmd) {
            cmd.addEventListener('input', () => { cmdText = cmd.value; });
            const go = () => {
                if (!cmd.value.trim() || pendingCommand) { return; }
                pendingCommand = true;
                post({ type: 'command', text: cmd.value.trim() });
                cmdText = '';
                render();
            };
            cmd.addEventListener('keydown', e => { if (e.key === 'Enter') { go(); } });
            const btn = document.getElementById('cmdgo');
            if (btn) { btn.addEventListener('click', go); }
        }
    }

    // ------------------------------------------------------- right-click menu

    /**
     * Everything a right-click on this page can ask for.
     *
     * ‼️ EVERY BRANCH POSTS WHAT A BUTTON POSTS. `plRun` sends the same
     * `{type:'plan', act:'run'}` the row's own run button sends, `tkCancel` the
     * same `{type:'task', act:'cancel'}` — so the panel keeps one switch and a
     * change to how a task is cancelled cannot leave the menu cancelling the
     * old way. What the menu adds is REACH: the acts no button ever offered
     * (move a queued run, retry with an edited prompt, save the prompt as a
     * template, edit a workflow step) and the ones that were only reachable
     * after expanding the row.
     *
     * The row's identity travels in the context object: by the time the pick
     * arrives the table may have been re-sorted, re-filtered, or repainted by
     * the 30-second ticker, and acting on "whatever is under the pointer now"
     * would act on a different task.
     */
    function ctxDo(act, ctx) {
        const verb = act.split(':')[0];
        const arg = act.slice(verb.length + 1);
        const planOf = () => DATA.plan.find(p => p.kind === ctx.planKind && p.id === ctx.planId);
        const runOf = () => DATA.runs.find(r => r.id === ctx.taskId);
        const plan = (a) => post({ type: 'plan', act: a, kind: ctx.planKind, id: ctx.planId });
        const task = (a) => post({ type: 'task', act: a, id: ctx.taskId });
        const copy = (v) => window.AFCtx.copy(v);
        const toggle = (k) => { expanded.has(k) ? expanded.delete(k) : expanded.add(k); render(); };

        switch (verb) {
            // ---- a plan row ----
            case 'plRun': plan('run'); return;
            case 'plEdit': plan('edit'); return;
            case 'plToggle': plan('toggle'); return;
            case 'plDelete': plan('delete'); return;
            case 'plExport': plan('export'); return;
            case 'plHistory': post({ type: 'open-history' }); return;
            case 'plDetail': toggle(ctx.planKind + ':' + ctx.planId); return;
            // "What has it run" is the Runs tab searched for this definition —
            // the runs carry their source's title, which is what the search box
            // already matches on.
            case 'plRuns': {
                const p = planOf();
                tab = 'run';
                runView = Object.assign({}, RUN_DEF, { q: p ? p.title : '' });
                persist();
                render();
                return;
            }
            case 'plCopy': {
                const p = planOf();
                if (!p) { copy(''); return; }
                copy(arg === 'prompt' ? (p.detail && p.detail.prompt)
                    : arg === 'when' ? p.when
                        : arg === 'id' ? p.id : p.title);
                return;
            }

            // ---- one step of a workflow ----
            case 'wfEdit': post({ type: 'wfstep', act: 'edit', id: ctx.planId, index: Number(ctx.stepIndex) }); return;
            case 'wfMove': post({ type: 'wfstep', act: arg, id: ctx.planId, index: Number(ctx.stepIndex) }); return;
            case 'wfDelete': post({ type: 'wfstep', act: 'delete', id: ctx.planId, index: Number(ctx.stepIndex) }); return;
            case 'wfCopy': copy(ctx.stepText); return;

            // ---- one execution ----
            case 'tkStart': task('start'); return;
            case 'tkNext': task('next'); return;
            case 'tkMove': task(arg === 'up' ? 'up' : 'down'); return;
            case 'tkUnpark': task('unpark'); return;
            case 'tkRerun': task('rerun'); return;
            case 'tkRetryEdit': task('retryEdit'); return;
            // ‼️ "Like this one, but…" — the same form, prefilled from the row.
            // `retryEdit` above is the old one-question box (a new prompt and
            // nothing else); this is the whole task, editable, which is what a
            // person means when they say "run that again with opus".
            case 'tkClone': task('clone'); return;
            case 'tkResume': task('resumeWorkflow'); return;
            case 'tkTemplate': task('saveTemplate'); return;
            case 'tkTerminal': task('terminal'); return;
            case 'tkCancel': task('cancel'); return;
            case 'tkDelete': task('delete'); return;
            case 'tkDetail': toggle('run:' + ctx.taskId); return;
            case 'tkOutput': {
                const r = runOf();
                if (r && r.outputFile) { post({ type: 'open-output', file: r.outputFile }); }
                return;
            }
            case 'tkTranscript': {
                const r = runOf();
                if (r && r.sessionFile) { post({ type: 'open-transcript', file: r.sessionFile }); }
                return;
            }
            case 'tkSource': {
                const r = runOf();
                tab = 'plan';
                planView = Object.assign({}, PLAN_DEF, { q: r ? r.source : '' });
                persist();
                render();
                return;
            }
            case 'tkCopy': {
                const r = runOf();
                if (!r) { copy(''); return; }
                copy(arg === 'prompt' ? r.prompt
                    : arg === 'id' ? r.id
                        : arg === 'output' ? r.outputFile : r.title);
                return;
            }
        }
    }

    // ‼️ Listened for ONCE, at module scope. render() runs on every repaint and
    // every 30-second tick; a listener added there would accumulate a copy per
    // paint, and one right-click would eventually run the action a hundred
    // times.
    window.AFCtx.listen(ctxDo);

    /**
     * ‼️ M-33 — THE HOST'S OWN REPAINTS, AND NOTHING ELSE, GO THROUGH HERE.
     *
     * A render the USER asked for — a tab pressed, a filter typed, a row
     * expanded — must happen at once even though a field is focused, because
     * the field is the thing that asked. Routing every `render()` through the
     * guard would feel broken in the opposite direction. So this wraps the one
     * road the user is not standing on: the push that arrives because something
     * changed elsewhere in the farm, which is exactly the one that used to
     * arrive while they were typing.
     *
     * The two page-specific answers are the same two the 30-second timer at the
     * bottom of this file already knew about: a half-written composer and an
     * open guide are hands-on even when the caret is nowhere.
     */
    const repaint = window.AFRepaint.guard(render, {
        busy: () => !!composer || taskGuideOpen
    });

    window.addEventListener('message', ev => {
        // The saved-prompt picker owns its own answer, and must be offered it
        // BEFORE the page acts — a `data` push repaints the form under an open
        // window (media/afSnippets.js).
        if (window.AFSnippets.receive(ev.data)) { return; }
        // ‼️ M-33 — THE DATA IS TAKEN AT ONCE; ONLY THE PAINT WAITS.
        //
        // `DATA` and `pendingCommand` are the page's state and must be current
        // the instant the host says so — the very next thing the user does will
        // draw from them. What is deferred is the REPAINT, and only while their
        // hands are on the page: `render()` replaces the whole of `#app`, which
        // detaches whatever the caret is in, and a detached node cannot hold it.
        // That is what threw people out of the new-task box mid-sentence, and
        // why the next space read as Page Down — on the body, space IS Page
        // Down. The rule was already written for the 30-second timer at the
        // bottom of this file ("never re-render under the user's fingers") and
        // the host push simply did not go through it.
        if (ev.data.type === 'data') { DATA = ev.data.data; pendingCommand = false; repaint(); }
        if (ev.data.type === 'focus' && ev.data.tab) { tab = ev.data.tab; persist(); render(); }
        // ‼️ "OPEN THIS TASK" HAS TO LAND ON THE TASK. A project's Work tab and
        // a timeline row both say Open about one run; opening the page at the
        // top of a list of two hundred and leaving the reader to find it is the
        // same as not having the button. The row is expanded (that is what
        // "open" means here) and scrolled to.
        if (ev.data.type === 'focus-task' && ev.data.id) {
            tab = 'run';
            expanded.add('run:' + ev.data.id);
            persist();
            render();
            const el = document.querySelector('[data-expand="run:' + ev.data.id + '"]');
            if (el && el.scrollIntoView) { el.scrollIntoView({ block: 'center' }); }
        }
        // ---- the New-task form, driven from the host ----
        // `task-compose` is the ONE door: the sidebar's +, the walkthrough and a
        // row's "like this one" all arrive here, so there is a single form with
        // a single set of fields whichever way you came in.
        if (ev.data.type === 'task-compose') { openComposer(ev.data.seed); }
        // …and the same door for every plan kind (U-9). `agentfarm.addSchedule`,
        // `editTrigger`, the toolbar's + and a row's edit button all arrive
        // here, so the palette and the page cannot make two different objects.
        if (ev.data.type === 'plan-compose') { chooser = null; openComposer(ev.data.seed, ev.data.kind); }
        // ‼️ "WHICH TEMPLATE?" IS THE PLAN TAB, FILTERED. It used to be a
        // quickpick of bare titles; the rows on this page carry the agent, the
        // mode, what it last cost and a run button, which is strictly more of
        // the same question answered.
        if (ev.data.type === 'plan-focus') {
            tab = 'plan';
            planView = Object.assign({}, PLAN_DEF, ev.data.view || {});
            composer = null;
            chooser = null;
            composerMsg = ev.data.note || '';
            composerLoud = false;
            persist();
            render();
        }
        // `agentfarm.setQuietHours` / `pauseAutomations` from the palette open
        // the card too, so the strip and the palette set the same thing.
        if (ev.data.type === 'gate-open') { openGate(ev.data.which); }
        // A picker the host filled, drawn as a list on the page.
        if (ev.data.type === 'chooser') {
            chooser = ev.data.chooser || null;
            if (chooser && chooser.tab) { tab = chooser.tab; }
            composer = null;
            persist();
            render();
        }
        if (ev.data.type === 'task-error') {
            composerMsg = ev.data.text || '';
            composerDup = false;
            composerLoud = true;
            render();
        }
        if (ev.data.type === 'plan-saved') {
            closeComposer(ev.data.text || 'Saved.');
        }
        // ‼️ The duplicate guard, asked IN the form. It used to be a modal that
        // took the focus off the fields it was complaining about; here the
        // answer button sits next to the one you just pressed.
        if (ev.data.type === 'task-dup') {
            composerMsg = (ev.data.text || 'An identical task is already queued.')
                + ' Add it anyway, or change the prompt.';
            composerDup = true;
            // Refused as well — the difference is that this one may be overridden,
            // which is the button `composerDup` still draws on its own.
            composerLoud = true;
            render();
        }
        if (ev.data.type === 'task-made') {
            closeComposer(`Queued “${ev.data.title}”${ev.data.started ? ' and started it.' : ' — press start when you want it.'}`);
        }
    });

    render();
    // Ages and durations go stale; never re-render under the user's fingers.
    setInterval(() => {
        if (document.hidden) { return; }
        // ‼️ The composer is a half-written thought, and a repaint would move the
        // caret out from under it — a textarea is exactly where the longest ones
        // are typed, and it was not in this list.
        if (composer) { return; }
        const a = document.activeElement;
        if (a && (a.tagName === 'INPUT' || a.tagName === 'SELECT' || a.tagName === 'TEXTAREA')) { return; }
        render();
    }, 30000);
})();
