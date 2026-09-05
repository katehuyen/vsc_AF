// Missions page webview: run list + detail (rounds, budget, waits), control
// routing (pause/cancel/approve/answer), the New Mission form round-trip and
// host messages (formError / created / folder / openForm).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const code = require(path.join(__dirname, 'lib_shared_media.js')).sharedMedia()
    + fs.readFileSync(path.resolve(__dirname, '../media/missions.js'), 'utf8');
const createAfmsDom = require(path.join(__dirname, 'lib_afms_dom.js'));
const { charts } = require('./lib_charts_stub.js');

let posted = [];
// ‼️ A LIST, not one handler. The page now listens twice: once for its own host
// messages and once, at module scope, for the right-click relay. Keeping only
// the last registration would silently drop whichever was wired first.
const msgHandlers = [];
const msgHandler = (ev) => msgHandlers.forEach(fn => fn(ev));
const els = {};
function getEl(id) {
    if (!els[id]) {
        els[id] = {
            id, listeners: {}, style: {}, value: '', checked: false, _html: '',
            addEventListener(ev, fn) { this.listeners[ev] = fn; },
            focus() { }, scrollIntoView() { },
            set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; }
        };
    }
    return els[id];
}
const wired = {};
const RUN = {
    id: 'run1', specId: 'spec1', status: 'waiting-approval',
    plannerSessionId: 'S1',
    // ‼️ M-29 — WHAT THE ORCHESTRATOR ACTUALLY LAUNCHED WITH, kept on the run.
    // The rung the old surface could never report: the model was named by the
    // lead folder's own Claude settings, which the CLI reads by itself — the
    // case the page used to draw as `cli`, "nobody set it". Effort really did
    // fall all the way through, so the two absences are told apart.
    plannerLaunch: {
        model: { value: 'opus', origin: 'settings', source: 'D:/agents/lead/.claude/settings.json' },
        effort: { origin: 'cli' },
        extraArgs: '', displaced: []
    },
    rounds: [
        {
            n: 1, thought: 'split the work', action: 'delegate', plannerCostUSD: 0.11, plannerTokens: 5000, at: 1000,
            steps: [
                {
                    id: 's1', round: 1, agentId: 'a1', agentName: 'coder', title: 'fix parser', prompt: 'p', status: 'done', costUSD: 0.3, tokens: 12000, outputFile: 'D:/out/s1.md', runSessionId: 'ses_a1', transcript: 'D:/s/step-a1.jsonl',
                    // ‼️ U-104 — asked for opus, served by haiku. The one case a
                    // reader must not have to hover to notice.
                    ran: {
                        engine: 'claude', model: 'opus', effort: 'high', permissionMode: 'plan',
                        origin: { engine: 'cli', model: 'member', effort: 'fleet', permissionMode: 'member', workDir: 'cli' }
                    },
                    // ‼️ X-124 — evidence BOUND to the turns this delegation's own
                    // task occupied. The ≠ verdict is only drawn on turn-bound
                    // evidence, so the scope is part of what makes this a
                    // mismatch rather than a coincidence in an unrelated round.
                    applied: {
                        models: ['claude-haiku-4-5'], permissionMode: 'plan',
                        permissionModes: ['plan'], effort: null, scope: 'turn', turns: 2
                    }
                },
                {
                    id: 's2', round: 1, agentId: 'a2', agentName: 'reviewer', title: 'review', prompt: 'p', readonly: true, status: 'failed', note: 'agent said no',
                    // …and the commonest case: nothing decided anywhere.
                    ran: { engine: 'claude', origin: { engine: 'cli', model: 'cli', effort: 'cli', permissionMode: 'cli', workDir: 'cli' } }
                }
            ]
        },
        { n: 2, thought: '', action: 'ask_user', question: 'which branch?', answer: 'main', steps: [], plannerCostUSD: 0.05, at: 2000 }
    ],
    ledger: [], totalCostUSD: 1.25, startedAt: 500
};
const DATA = {
    newForm: false,
    specs: [{
        id: 'spec1', title: 'Parser mission', goal: 'Fix the parser and prove it',
        leadAgentId: 'a0', leadAgentName: 'lead',
        team: [
            { agentId: 'a1', agentName: 'coder', role: 'implements', permissionMode: 'acceptEdits' },
            { agentId: 'a2', agentName: 'reviewer' }
        ],
        workdir: 'D:/repo', limits: { maxRounds: 8, maxTasks: 12, maxCostUSD: 5, maxMinutes: 120, maxParallel: 2 },
        approvalMode: 'each-round', createdAt: 1
    }],
    runs: [RUN],
    agents: [{ id: 'a0', name: 'lead' }, { id: 'a1', name: 'coder' }, { id: 'a2', name: 'reviewer' }],
    // ‼️ X-94 — the projects the form may file a run under, and the one this
    // window is sitting on. The window HAS one here on purpose: that is the
    // case the control exists for, because it is the one that used to happen
    // without anybody being shown a word about it.
    projects: [{ id: 'prj_af', name: 'Agent Farm' }, { id: 'prj_talk', name: 'TalkScribe' }],
    activeProject: { id: 'prj_af', name: 'Agent Farm' },
    // The host's own PERMISSION_CHOICES, verbatim — the form must never carry a
    // copy of this vocabulary, so the fixture is the real list.
    permissions: [
        { id: '', label: 'Default', detail: 'no --permission-mode flag — asks before acting, as configured' },
        { id: 'plan', label: 'plan', detail: 'plans only, changes nothing until you approve' },
        { id: 'acceptEdits', label: 'acceptEdits', detail: 'file edits auto-approved, everything else still asks' },
        { id: 'auto', label: 'auto', detail: 'the CLI decides what is safe to run unattended' },
        { id: 'manual', label: 'manual', detail: 'asks for every action' },
        { id: 'dontAsk', label: 'dontAsk', detail: 'stops instead of asking when it would need permission' },
        { id: 'bypassPermissions', label: '⚠ bypassPermissions', detail: 'EVERY action auto-approved — no prompts at all' }
    ],
    defaults: { maxRounds: 8, maxTasks: 12, maxCostUSD: 5, maxMinutes: 120, maxParallel: 2 },
    pending: { questions: [], approvals: ['run1'] },
    // ‼️ U-64 — THE ENGINE MATRIX AND WHAT EACH ENGINE OFFERS, in the shape
    // `afEngine.js` reads on every other launch surface. OpenCode is here
    // BECAUSE it takes no effort setting: the member row has to draw that box
    // dead rather than offer five words the launch would refuse.
    engines: [
        { id: 'claude', label: 'Claude Code', ready: true, next: null, reportsCost: true, takesEffort: true },
        { id: 'opencode', label: 'OpenCode', ready: true, next: null, reportsCost: true, takesEffort: false }
    ],
    efforts: [
        { id: '', label: 'Default', detail: 'no --effort flag — the CLI decides' },
        { id: 'low', label: 'low', detail: 'shortest reasoning' },
        { id: 'high', label: 'high', detail: 'more reasoning per turn' }
    ],
    engineModels: {
        claude: {
            models: [
                { id: '', label: 'Default', detail: 'no --model flag' },
                { id: 'opus', label: 'opus', detail: 'the deep one' },
                { id: 'haiku', label: 'haiku', detail: 'the cheap one' }
            ],
            efforts: {
                '': [
                    { id: '', label: 'Default', detail: 'no --effort flag — the CLI decides' },
                    { id: 'low', label: 'low', detail: 'shortest reasoning' },
                    { id: 'high', label: 'high', detail: 'more reasoning per turn' }
                ]
            },
            defaultEffort: {}, source: 'settings', note: 'Claude Code — your model aliases.'
        },
        opencode: {
            models: [
                { id: '', label: 'Default', detail: 'no -m flag' },
                { id: 'opencode/grok-code', label: 'Grok Code', detail: 'free tier' }
            ],
            efforts: {}, defaultEffort: {}, source: 'cli', note: 'OpenCode — from the CLI catalog.'
        }
    },
    modelAliases: ['haiku', 'sonnet', 'opus']
};
const sandbox = {
    acquireVsCodeApi: () => ({ postMessage: (m) => posted.push(m), getState() { }, setState() { } }),
    window: {
        AFCharts: charts({
            esc: (s) => String(s),
            fmtTok: (n) => (n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n)),
            fmtTokW(n, w) { return this.fmtTok(n || 0) + (w > 0 ? ' [w' + this.fmtTok(Math.round(w)) + ']' : ''); },
            fmtTokWText(n, w) { return this.fmtTok(n || 0) + (w > 0 ? ' (w' + this.fmtTok(Math.round(w)) + ')' : ''); },
            WEIGHTED_TIP: 'weighted',
            fmtUSD: (v) => '$' + v.toFixed(2)
        }),
        __DATA__: DATA,
        addEventListener: (ev, fn) => { if (ev === 'message') { msgHandlers.push(fn); } }
    },
    document: {
        getElementById: getEl,
        querySelectorAll: (sel) => {
            const app = getEl('app');
            const list = [];
            const spec = sel === '.mrow' ? { attr: 'data-run', key: 'run' }
                : sel === '[data-openfile]' ? { attr: 'data-openfile', key: 'openfile' }
                    : sel === '[data-guide]' ? { attr: 'data-guide', key: 'guide' }
                        : sel === '[data-step]' ? { attr: 'data-step', key: 'step' }
                            : sel === '[data-opensession]' ? { attr: 'data-opensession', key: 'opensession' }
                                : sel === '[data-round]' ? { attr: 'data-round', key: 'round' }
                                    : sel === '[data-cvthread]' ? { attr: 'data-cvthread', key: 'cvthread' }
                                        : sel === '[data-cvjump]' ? { attr: 'data-cvjump', key: 'cvjump' }
                                            : sel === '[data-cvall]' ? { attr: 'data-cvall', key: 'cvall' }
                                                : sel === '[data-cvend]' ? { attr: 'data-cvend', key: 'cvend' }
                                                    : null;
            if (!spec) { return []; }
            const re = new RegExp(`${spec.attr}="([^"]*)"`, 'g');
            let m;
            while ((m = re.exec(app._html))) {
                // ‼️ X-93 — the WHOLE tag's dataset, not the one attribute the
                // selector matched. A handler that needs to know which RUN a
                // row belongs to reads a second `data-` off the same element,
                // and a shim that hands it one attribute measures a fiction.
                const open = app._html.lastIndexOf('<', m.index);
                const close = app._html.indexOf('>', m.index);
                const tag = open >= 0 && close > open ? app._html.slice(open, close) : '';
                const dataset = {};
                const dre = /data-([a-z0-9-]+)="([^"]*)"/gi;
                let d;
                while ((d = dre.exec(tag))) {
                    dataset[d[1].replace(/-([a-z])/g, (_s, c) => c.toUpperCase())] = d[2];
                }
                dataset[spec.key] = m[1];
                const el = { dataset };
                el.addEventListener = (_e, fn) => { el._click = fn; };
                list.push(el);
            }
            wired[spec.key] = list;
            return list;
        }
    },
    // ‼️ U-103 — TIMERS ARE REMEMBERED, NOT RUN. The page debounces its
    // preview request, so a shim that swallows the callback makes that path
    // untestable and a shim that fires it immediately would turn every other
    // deferred thing on this page (the output tail poll) into a synchronous
    // one nobody wrote. They are queued; the test fires them when it means to.
    timers: [],
    setTimeout: (fn) => { sandbox.timers.push(fn); return sandbox.timers.length; },
    clearTimeout: (h) => { if (h) { sandbox.timers[h - 1] = null; } },
    console, Date
};
/** Run every timer the page has queued, newest wiring included. */
const flushTimers = () => {
    const due = sandbox.timers.slice();
    sandbox.timers.length = 0;
    due.forEach(fn => { if (fn) { fn(); } });
};
sandbox.globalThis = sandbox;
// the shared multi-pick filter control has its own shim (lib_afms_dom.js)
const ms = createAfmsDom(() => getEl('app')._html);
sandbox.document.querySelector = (s) => (s.indexOf('[data-afms') === 0 ? ms.querySelector(s) : null);
vm.createContext(sandbox);
vm.runInContext(code, sandbox); // render()

const html = () => getEl('app')._html;

// ---------- list + detail rendering ----------
ok('run list renders the mission row', html().includes('Parser mission') && html().includes('data-run="run1"'));
ok('list starts folded — no detail opens on its own', !html().includes('class="mdetail"'));
ok('accordion controls render (viewer chip row)',
    html().includes('id="r-expandall"') && html().includes('id="r-collapseall"') && html().includes('id="r-singleopen"'));
wired.run[0]._click(); // open run1 — the rest of the suite works inside its inline detail
ok('clicking a row opens the inline detail', html().includes('class="mdetail"') && html().includes('Fix the parser and prove it'));
ok('budget line shows spent/limit', html().includes('$1.25 / $5.00') && html().includes('2/8 rounds'));
ok('round card lists steps with status + note', html().includes('fix parser') && html().includes('agent said no'));
ok('readonly step badged', html().includes('read-only'));
ok('ask_user round shows Q and A', html().includes('which branch?') && html().includes('main'));
ok('pending approval renders the wait box', html().includes('needs your approval') && html().includes('id="d-approve-run1"'));
ok('team chips carry roles', html().includes('coder — implements'));
// ‼️ M-14 — and the permissions the member delegated WITH, on the same footing
// as its engine and model. A chip only where it was set: no chip is the engine
// default, and that is a different fact, not a missing one.
// ‼️ U-104 — the chip no longer repeats the declaration in its own words. The
// member's provenance panel says what was declared on its row, what the ladder
// resolved that into and what the engine applied — one subject, one surface.
ok('team chips carry the delegation permissions when one was set',
    /Declared on this member.{0,8}s row: acceptEdits/.test(html()));

// ---------- U-104: requested → resolved → applied, on one surface ----------
//
// Three different things were being confused. The composer showed what was
// CHOSEN and nothing after it; `runNote` showed what the ladder RESOLVED, in one
// lossy line that dropped every dimension the CLI decided — so the commonest
// delegation of all, the one that took every default, said nothing at all; and
// what the engine APPLIED was on no surface anywhere, so a model override that
// was refused looked exactly like one that was honoured.
{
    ok('U-104 — the run detail has two labelled summaries, not one identity line',
        html().includes('>Orchestrator<') && html().includes('>Workers<'));
    ok('…the orchestrator states its own profile, engine included',
        /manager|lead/.test(html()) && html().includes('Engine: claude'));
    ok('‼️ …and says the planner\'s engine is not a choice anybody made',
        html().includes('not a choice — this is how the planner runs'));
    ok('‼️ …its permission mode is not "the CLI chose" either — there is no such flag',
        html().includes('none — its write and spawn tools are cut off by name'));
    ok('‼️ …and its workdir is the LEAD agent\'s folder, never the mission workdir',
        /Workdir: the lead agent.{0,8}s own folder/.test(html()));

    ok('‼️ a step whose engine came back different wears the mismatch mark',
        html().includes('pmark bad'));
    ok('…and the panel puts the two side by side rather than hiding one',
        /Model: opus\s+\(set on this member.{0,8}s own row\)\s+·\s+applied: claude-haiku-4-5/.test(html()));
    ok('‼️ …while a value the engine HONOURED is not drawn as a disagreement',
        !/Permissions: plan[^<]*applied: plan/.test(html()));
    ok('‼️ a dimension nobody set says so instead of going blank',
        html().includes('— CLI chooses —'));
    ok('…and effort, which no engine reports, says "not reported" rather than echoing the request',
        html().includes('not reported'));
    ok('‼️ a delegation that took every default wears NO mark — a glyph on every row says nothing',
        /<span class="pname">reviewer<\/span>/.test(html()));
}

// ---------- X-124: the evidence is a TURN's, and it says which ----------
//
// `applied` was read off the whole session: every model the lane ever used and
// the last permission mode it ever mentions. A lane that is RESUMED serves
// several delegations, so each step listed the others' models — and the
// mismatch check, which asks "is what I requested among them", found the
// request in an unrelated round and reported agreement, hiding the one case it
// exists for. The reading is now bound to the turns the work occupied, and the
// three possible answers are kept apart on the surface.
{
    ok('X-124 — a turn-bound reading says how much of the conversation it is',
        html().includes('read off the 2 turns this piece of work occupied'));

    const sessionScoped = {
        ...RUN,
        rounds: RUN.rounds.map(r => ({
            ...r,
            steps: r.steps.map(s => (s.id === 's1' ? {
                ...s,
                applied: {
                    models: ['claude-haiku-4-5'], permissionMode: 'plan',
                    permissionModes: ['plan'], effort: null, scope: 'session'
                }
            } : s))
        }))
    };
    msgHandler({ data: { type: 'data', data: { ...DATA, runs: [sessionScoped] } } });
    ok('‼️ …and the SAME disagreeing values draw no ≠ when the evidence is the whole lane',
        !html().includes('pmark bad'));
    ok('…the panel says so rather than letting the lane pass for the step',
        html().includes('this is the WHOLE session\'s reading, not this step\'s'));

    const unbound = {
        ...RUN,
        rounds: RUN.rounds.map(r => ({
            ...r,
            steps: r.steps.map(s => (s.id === 's1' ? {
                ...s,
                applied: {
                    models: [], permissionMode: null, permissionModes: [],
                    effort: null, scope: 'unattributed'
                }
            } : s))
        }))
    };
    msgHandler({ data: { type: 'data', data: { ...DATA, runs: [unbound] } } });
    ok('‼️ a window that bound no turn says the testimony is not about this step',
        html().includes('not attributable to this step'));
    ok('…and still draws no verdict, because nothing here is evidence about it',
        !html().includes('pmark bad'));

    const changed = {
        ...RUN,
        rounds: RUN.rounds.map(r => ({
            ...r,
            steps: r.steps.map(s => (s.id === 's1' ? {
                ...s,
                applied: {
                    models: ['claude-opus-5'], permissionMode: null,
                    permissionModes: ['plan', 'bypassPermissions'],
                    effort: null, scope: 'turn', turns: 3
                }
            } : s))
        }))
    };
    msgHandler({ data: { type: 'data', data: { ...DATA, runs: [changed] } } });
    ok('‼️ a permission mode that changed mid-work shows BOTH — one of them would be a coin toss',
        html().includes('plan → bypassPermissions (changed during this work)'));

    msgHandler({ data: { type: 'data', data: DATA } });
}

// ---------- M-29: the orchestrator's profile is the RUN's record ----------
//
// X-121 gave the preview a real ladder; this surface still built the planner's
// profile out of `sp.plannerModel`/`sp.plannerEffort` and wrote `origin: cli`
// whenever they were empty — the same "nobody set it" over a command line that
// had a flag on it. Re-climbing the ladder HERE would have been the second
// mistake: the run started in the past and the extra args and settings readable
// now are today's. So the launcher keeps its answer and this draws that record.
{
    ok('M-29 — the model comes from the run\'s record, with the rung that named it',
        /Model: opus\s+\(the lead agent folder.{0,8}s own Claude settings, which the CLI reads itself\)/.test(html()));
    ok('‼️ …and WHERE it was said, because "settings" without the file sends a reader hunting',
        html().includes('Model said by: D:/agents/lead/.claude/settings.json'));
    ok('‼️ …while a dimension that really did fall through still says the CLI decided',
        /Effort: — CLI chooses —/.test(html()));
    // ‼️ The spec is still the right source for what the mission DECLARED (the
    // summary line, the lead's context menu). What may never be built from it
    // again is the ORIGIN — "nobody set it" is a claim about three rungs, and
    // the spec only knows the first.
    const pageSrc = fs.readFileSync(path.join(__dirname, '..', 'media', 'missions.js'), 'utf8');
    ok('‼️ the page no longer invents the planner\'s origin out of the spec',
        !/plannerModel \? 'mission' : 'cli'/.test(pageSrc)
        && /const pl = run\.plannerLaunch/.test(pageSrc));
}

// ---------- M-29: a run with no record says so, and guesses nothing ----------
{
    const bare = { ...RUN };
    delete bare.plannerLaunch;
    msgHandler({ data: { type: 'data', data: { ...DATA, runs: [bare] } } });
    ok('‼️ M-29 — a run launched before the record reads "not recorded", never "CLI chooses"',
        html().includes('not recorded')
        && !/mchip prov">CLI chooses/.test(html()));
    ok('…and the panel says why it will not be worked out now',
        html().includes('Either this run predates the record, or its planner has not been called yet'));
    ok('‼️ …the planner\'s two fixed facts survive the missing record — they were never a resolution',
        html().includes('The planner ALWAYS runs on Claude Code'));
    // put the recorded run back for everything below
    msgHandler({ data: { type: 'data', data: DATA } });
}

// ---------- click routing ----------
posted = [];
getEl('d-approve-run1').listeners.click();
ok('Approve posts approve with the run id', posted[0] && posted[0].type === 'approve' && posted[0].runId === 'run1');
posted = [];
getEl('d-cancel-run1').listeners.click();
ok('Cancel posts control/cancel', posted[0] && posted[0].type === 'control' && posted[0].action === 'cancel' && posted[0].runId === 'run1');
posted = [];
wired.openfile[0]._click();
ok('step output link opens the archived file', posted[0] && posted[0].type === 'openFile' && posted[0].file === 'D:/out/s1.md');

// ---------- right-click menus ----------
// Every control this page has lived inside the expanded detail. The menu puts
// them on the plain row — and has to send the SAME message the detail's button
// sends, or the two would drift and only one of them would keep working.
{
    const send = (data) => msgHandler({ data });
    const lastMsg = () => posted[posted.length - 1];
    const contexts = () => (html().match(/data-vscode-context="([^"]*)"/g) || []).map(m =>
        JSON.parse(m.slice(21, -1).replace(/&quot;/g, '"').replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>').replace(/&amp;/g, '&')));

    const runCtx = contexts().find(c => c.webviewSection === 'afMissionRow');
    ok('a mission row publishes itself to the menu', !!runCtx && runCtx.run === 'run1');
    ok('…and says which of its controls apply right now',
        !!runCtx && runCtx.afActive === true && runCtx.afApproval === true
        && runCtx.afStatus === 'waiting-approval' && runCtx.afOpen === true);
    ok('the page keeps the normal Copy/Paste items', !!runCtx && runCtx.preventDefaultContextMenuItems === false);

    posted = [];
    getEl('d-approve-run1').listeners.click();
    const approveByButton = lastMsg();
    send({ type: 'afctx', act: 'msApprove', ctx: runCtx });
    ok('‼️ Approve from the menu is the wait box\'s own message, to the character',
        JSON.stringify(lastMsg()) === JSON.stringify(approveByButton));

    getEl('d-cancel-run1').listeners.click();
    const cancelByButton = lastMsg();
    send({ type: 'afctx', act: 'msCtl:cancel', ctx: runCtx });
    ok('…and so is cancelling it', JSON.stringify(lastMsg()) === JSON.stringify(cancelByButton));

    send({ type: 'afctx', act: 'msCtl:pause', ctx: runCtx });
    ok('pausing reaches the host as a control act',
        lastMsg().type === 'control' && lastMsg().action === 'pause' && lastMsg().runId === 'run1');
    send({ type: 'afctx', act: 'msRerun', ctx: runCtx });
    ok('running the mission again is an act the page had no button for at all',
        lastMsg().type === 'rerun' && lastMsg().runId === 'run1');
    send({ type: 'afctx', act: 'msDelete', ctx: runCtx });
    ok('…and so is dropping a run from the history',
        lastMsg().type === 'delete' && lastMsg().runId === 'run1');

    const stepCtx = contexts().find(c => c.webviewSection === 'afMissionStep' && c.step === 's1');
    ok('a delegation publishes its run, its id and the agent that ran it',
        !!stepCtx && stepCtx.run === 'run1' && stepCtx.agentId === 'a1' && stepCtx.afOutput === true);
    posted = [];
    send({ type: 'afctx', act: 'mstOut', ctx: stepCtx });
    ok('opening its output is the link\'s own message',
        lastMsg().type === 'openFile' && lastMsg().file === 'D:/out/s1.md');
    send({ type: 'afctx', act: 'mstAgent', ctx: stepCtx });
    ok('and the agent behind it opens by id', lastMsg().type === 'openAgent' && lastMsg().agentId === 'a1');
    const failed = contexts().find(c => c.webviewSection === 'afMissionStep' && c.step === 's2');
    ok('‼️ a delegation with no output says so, so the menu never offers to open one',
        !!failed && failed.afOutput === false);

    const roundCtx = contexts().find(c => c.webviewSection === 'afMissionRound' && String(c.round) === '1');
    ok('a planner round publishes its number and whether it is folded',
        !!roundCtx && roundCtx.run === 'run1' && roundCtx.afClosed === false);
    send({ type: 'afctx', act: 'msrFold:1', ctx: roundCtx });
    ok('folding a round from the menu folds it', !html().includes('fix parser'));
    send({ type: 'afctx', act: 'msrFold:0', ctx: roundCtx });
    ok('…and unfolding brings its delegations back', html().includes('fix parser'));

    const member = contexts().find(c => c.webviewSection === 'afMissionTeam' && c.agentId === 'a1');
    ok('a team member publishes its agent, role and model',
        !!member && member.agentName === 'coder' && member.role === 'implements');
    posted = [];
    send({ type: 'afctx', act: 'mtTalk', ctx: member });
    ok('talking to a participant opens the Console for that agent',
        lastMsg().type === 'consoleAgent' && lastMsg().agentId === 'a1');
    const lead = contexts().find(c => c.webviewSection === 'afMissionTeam' && c.agentId === 'a0');
    ok('‼️ the lead carries the same menu as the team — it is a participant too',
        !!lead && lead.role === 'lead');
}

// ---------- question wait ----------
msgHandler({
    data: {
        type: 'data', data: {
            ...DATA,
            runs: [{ ...RUN, status: 'waiting-user' }],
            pending: { questions: [{ runId: 'run1', question: 'deploy too?' }], approvals: [] }
        }
    }
});
ok('question wait box renders with an answer field', html().includes('deploy too?') && html().includes('id="d-answer-run1"'));
getEl('d-answer-run1').value = 'no, just build';
posted = [];
getEl('d-send-run1').listeners.click();
ok('Send posts the typed answer', posted[0] && posted[0].type === 'answer' && posted[0].text === 'no, just build');

// ---------- paused → Resume ----------
msgHandler({ data: { type: 'data', data: { ...DATA, runs: [{ ...RUN, status: 'paused', note: 'interrupted by window reload' }], pending: { questions: [], approvals: [] } } } });
ok('paused run offers Resume + shows the note', html().includes('id="d-resume-run1"') && html().includes('interrupted by window reload'));
posted = [];
getEl('d-resume-run1').listeners.click();
ok('Resume posts control/resume', posted[0] && posted[0].type === 'control' && posted[0].action === 'resume');

// ---------- result box ----------
msgHandler({
    data: {
        type: 'data', data: {
            ...DATA, pending: { questions: [], approvals: [] },
            runs: [{ ...RUN, status: 'done', endedAt: 9000, result: { verdict: 'success', summary: 'parser fixed, 12 tests green' } }]
        }
    }
});
ok('finished run shows verdict + summary', html().includes('SUCCESS') && html().includes('parser fixed, 12 tests green'));
ok('finished run has no Pause/Cancel controls', !html().includes('id="d-cancel-run1"') && !html().includes('id="d-pause-run1"'));

// ---------- new-mission form ----------
posted = [];
getEl('newmission').listeners.click();
ok('+ New Mission opens the form with defaults', html().includes('id="mform"') && html().includes('each round — approve every delegation round'));
getEl('f-goal').value = 'Ship the docs site';
getEl('f-lead').value = 'a0';
getEl('tm-1').checked = true;           // coder
getEl('rl-1').value = 'builder';
getEl('lim-maxCostUSD').value = '3';
getEl('f-planner').value = 'opus';
// ‼️ U-100 — the OTHER half of the planner's profile. The mission could say
// which model plans and had no way to say how hard it thinks.
getEl('f-planner-effort').value = 'high';
getEl('f-approval').value = 'each-round';
getEl('f-start').listeners.click();
const created = posted.find(p => p.type === 'create');
ok('Start posts the assembled form', created && created.input.goal === 'Ship the docs site'
    && created.input.leadAgentId === 'a0' && created.input.maxCostUSD === '3'
    && created.input.team.length === 1 && created.input.team[0].agentId === 'a1' && created.input.team[0].role === 'builder');
ok('planner-model override rides along', created && created.input.plannerModel === 'opus');
ok('‼️ U-100 — and so does the planner EFFORT, on the same payload',
    created && created.input.plannerEffort === 'high');
/**
 * ‼️ X-94 — THE PROJECT IS A THREE-WAY ANSWER AND IT IS POSTED AS THREE.
 *
 * The host reads an ABSENT `project` key as "the window's active project", a
 * present empty string as "deliberately none", and an id as that one. Before
 * this the page could only ever say the first, so a mission started while the
 * window sat on a project was filed under it, briefed with it and had every
 * delegation filed under it — and nobody was ever shown the word "project".
 *
 * The untouched case is the one that must not move: a draft where nobody
 * touched the box posts the exact message it posted before the control existed.
 */
{
    ok('‼️ an untouched project box posts NO `project` key at all',
        created && !('project' in created.input));

    posted = [];
    getEl('f-project').value = '--none--';
    getEl('f-start').listeners.click();
    const none = posted.find(p => p.type === 'create');
    ok('‼️ "None" posts an EMPTY STRING — the host\'s word for deliberately nowhere',
        none && none.input.project === '');

    posted = [];
    getEl('f-project').value = 'prj_talk';
    getEl('f-start').listeners.click();
    const named = posted.find(p => p.type === 'create');
    ok('‼️ …and a named project posts its id', named && named.input.project === 'prj_talk');

    /**
     * ‼️ AND THE SENTENCE UNDER THE BOX IS NOT A STALE ANSWER.
     *
     * This is the bug the first draft of the control shipped and a rendered
     * picture caught: the caption read the PREVIEW alone, so until the host
     * answered — which is never, on a repaint that asked nothing — the box said
     * "this window's project: Agent Farm" while the line beneath it said "filed
     * under no project". The page knows all three answers from the form, so it
     * states them, and the host's reply overrides only when it exists.
     */
    getEl('f-project').value = 'prj_talk';
    getEl('f-project').listeners.change();
    ok('‼️ picking a project redraws the caption to name THAT project',
        html().includes('Filed under <b>TalkScribe</b>'));
    ok('‼️ …and it does not contradict the box by claiming no project',
        !html().includes('Filed under no project. Its delegations'));

    getEl('f-project').value = '';
    getEl('f-project').listeners.change();
    ok('‼️ left alone the caption names the WINDOW\'s project and says nobody chose it',
        html().includes('Filed under <b>Agent Farm</b>')
        && html().includes('inherited from this window, not chosen here'));

    getEl('f-project').value = '--none--';
    getEl('f-project').listeners.change();
    ok('‼️ …and "None" says so plainly rather than naming a project it will not use',
        html().includes('Filed under no project.'));

    getEl('f-project').value = '';   // leave the form as it was found
    getEl('f-project').listeners.change();
}
// ‼️ U-100 — LEAD AND PLANNER ARE ONE SUBJECT, SO THEY ARE ONE BLOCK. They used
// to sit eight rows apart with the team, the workdir, six ceilings and the
// delegation engine between them — two halves of one answer, separated by
// everything that is not it.
{
    const h = html();
    const at = (s) => h.indexOf(s);
    ok('the orchestrator block gathers lead, planner engine, model and effort on one line',
        at('Orchestrator') >= 0 && at('id="f-lead"') > at('Orchestrator')
        && at('id="f-planner"') > at('id="f-lead"')
        && at('id="f-planner-effort"') > at('id="f-planner"')
        && at('id="f-planner-effort"') < at('id="tm-0"'));
    ok('‼️ …and the planner ENGINE is drawn as a fixed value, not offered as a picker that cannot work',
        h.includes('Planner engine') && h.includes('class="fixedval"')
        && !h.includes('id="f-planner-engine"'));
    ok('…with the fence stated instead of a permission picker copied off a worker row',
        h.includes('No permission picker') && h.includes('disallowedTools'));
}

msgHandler({ data: { type: 'formError', error: 'Goal is required.' } });
ok('host validation error renders inline and keeps the form open',
    html().includes('Goal is required.') && html().includes('id="mform"'));
ok('typed goal survives the error re-render', html().includes('Ship the docs site'));

msgHandler({ data: { type: 'folder', path: 'D:/repo2' } });
ok('Browse result lands in the workdir field', html().includes('D:/repo2'));

msgHandler({ data: { type: 'created' } });
ok('created closes the form', !html().includes('id="mform"'));

msgHandler({ data: { type: 'openForm' } });
ok('openForm message reopens the form (New Mission command)', html().includes('id="mform"'));

// ---------- per-member model override in the form ----------
// ‼️ U-64 — the suggestions are now the ENGINE'S OWN catalog, not the four
// Claude aliases whatever the row is set to. A row with no engine of its own
// lands on the mission's, which is Claude here, so `mo-claude` is the honest
// list; `modelopts` (the alias knowledge base) is still drawn as the fallback
// for an engine that has published no catalog to this window yet.
ok('team rows carry a model field with the landing engine\'s suggestions',
    html().includes('<select id="md-1"') && html().includes('>opus<') && html().includes('>haiku<'));
// ‼️ U-97 — AND NOT ONE <datalist> IS LEFT ON THE PAGE. The free-text box over
// a datalist is what put the popup on the far left of the row on the second
// press and collapsed it to one line on a repaint; a leftover tag would mean
// some picker still uses it.
ok('‼️ …and the form ships no <datalist> at all any more', !html().includes('<datalist'));
ok('the planner model is a select on Claude\'s catalog, not a free-text box',
    html().includes('<select id="f-planner"') && !html().includes('id="f-planner" list='));
getEl('f-goal').value = 'Ship the docs site';
getEl('f-lead').value = 'a0';
getEl('tm-1').checked = true;
getEl('md-1').value = 'haiku';
posted = [];
getEl('f-start').listeners.click();
const created2 = posted.find(p => p.type === 'create');
ok('member model rides along in the create payload',
    created2 && created2.input.team.length === 1 && created2.input.team[0].model === 'haiku');
msgHandler({ data: { type: 'created' } });

// ---------- M-14: per-member PERMISSION mode in the form ----------
// A delegation is a headless run and there is nobody in it to answer a
// permission prompt, so the mode is spent up front or never. Before this the
// form offered no way to say it and the core carried no field, so every
// delegation took the engine default — on OpenCode, `build` without `--auto`,
// which answers every "ask" tool call with `error=user rejected`.
msgHandler({ data: { type: 'openForm' } });
ok('team rows carry a permission picker, offered from the host list',
    html().includes('id="pm-1"') && html().includes('— engine default —')
    && html().includes('>acceptEdits<') && html().includes('bypassPermissions<'));
ok('‼️ MIRROR: the picker tooltip opens with what it is set to right now',
    html().includes('engine default — no --permission-mode flag'));
ok('…and explains what an empty one costs on the engine that cannot ask',
    html().includes('there is nobody in it to answer a prompt'));
getEl('f-goal').value = 'Ship the docs site';
getEl('f-lead').value = 'a0';
getEl('tm-1').checked = true;
getEl('pm-1').value = 'acceptEdits';
posted = [];
getEl('f-start').listeners.click();
const created3 = posted.find(p => p.type === 'create');
ok('member permission mode rides along in the create payload',
    created3 && created3.input.team.length === 1
    && created3.input.team[0].permissionMode === 'acceptEdits');
msgHandler({ data: { type: 'created' } });

// ---------- U-64 (X-32): Classic / Adaptive Objective in ONE form ----------
// The page keeps being the only Missions room there is: no second page, no
// second store, no second create message. What changes is which questions the
// form asks — a RECIPE (classic) or an OUTCOME (adaptive) — and the rule that
// decides is the host's own: anything that is not the exact string 'adaptive'
// is classic, so every caller written before this keeps working untouched.
msgHandler({ data: { type: 'openForm' } });
ok('the form opens on a mode choice, with Classic already picked',
    html().includes('id="f-mode-classic"') && html().includes('id="f-mode-adaptive"')
    && html().includes('class="segbtn on" id="f-mode-classic"'));
ok('…and Classic still asks for a goal, a lead and a team',
    html().includes('>Goal <') && html().includes('id="f-lead"') && html().includes('>Team <'));

// Type into classic, then switch: nothing typed may be lost.
getEl('f-goal').value = 'Ship the docs site';
getEl('f-lead').value = 'a0';
getEl('tm-1').checked = true;
getEl('rl-1').value = 'builder';
getEl('f-mode-adaptive').listeners.click();
ok('switching to Adaptive asks for the OUTCOME instead of the goal',
    html().includes('>Outcome <') && !html().includes('>Goal <'));
ok('…and adds constraints, success criteria and autonomy',
    html().includes('id="cn-0"') && html().includes('id="cr-0"') && html().includes('id="cq-0"')
    && html().includes('id="f-autonomy"'));
ok('‼️ nothing typed in the other mode is lost — it is hidden, never cleared',
    html().includes('Ship the docs site'));
ok('the decisions an objective already has a default for are folded under Advanced',
    html().includes('id="f-adv"') && !html().includes('id="f-lead"'));
ok('a criterion is REQUIRED by default — an objective nobody can fail is not one',
    html().includes('id="cq-0" checked'));

getEl('f-goal').value = 'The OpenCode engine is production-ready on this machine.';
getEl('cn-0').value = 'Do not touch anything outside src/engines.';
getEl('cr-0').value = 'A real session starts, answers and resumes with the same id.';
// the shim's elements do not mirror rendered attributes, so the ticked box the
// markup draws is stated here the way a hand would leave it
getEl('cq-0').checked = true;
getEl('cr-add').listeners.click();
ok('+ criterion adds a second row with its own stable id', html().includes('id="cr-1"') && html().includes('>c2<'));
getEl('cr-1').value = 'The cost shown matches what the CLI stated.';
getEl('cq-1').checked = false;
getEl('cn-add').listeners.click();
getEl('cn-1').value = 'No new dependency without saying why.';
getEl('f-adv').listeners.click();
ok('Advanced opens and gives the orchestrator, the pool and the limits back',
    html().includes('id="f-lead"') && html().includes('id="lim-maxCostUSD"')
    && html().includes('id="f-profile"'));
ok('…and the team block is a POOL here, because naming a cast is the decision not being asked',
    html().includes('>Pool <'));
getEl('f-autonomy').value = 'decide-alone';
posted = [];
getEl('f-start').listeners.click();
const adaptiveCreate = posted.find(p => p.type === 'create');
ok('Start posts an ADAPTIVE create', adaptiveCreate && adaptiveCreate.input.mode === 'adaptive');
ok('…carrying the criteria with stable ids and their required flags',
    adaptiveCreate && adaptiveCreate.input.successCriteria.length === 2
    && adaptiveCreate.input.successCriteria[0].id === 'c1'
    && adaptiveCreate.input.successCriteria[0].required === true
    && adaptiveCreate.input.successCriteria[1].id === 'c2'
    && adaptiveCreate.input.successCriteria[1].required === false);
ok('…the constraints, blank lines dropped',
    adaptiveCreate && adaptiveCreate.input.constraints.length === 2
    && adaptiveCreate.input.constraints[0] === 'Do not touch anything outside src/engines.');
ok('…the autonomy the user chose', adaptiveCreate && adaptiveCreate.input.autonomy === 'decide-alone');
// ‼️ U-102 — AND THE POOL SAYS WHICH ANSWER IT IS. The default is the whole
// fleet, said out loud with `poolScope`, so the host never has to read an empty
// list as "everybody" and hope that is what the screen meant.
ok('…and a POOL that is the whole fleet, named as such rather than left empty',
    adaptiveCreate && adaptiveCreate.input.poolScope === 'fleet'
    && Array.isArray(adaptiveCreate.input.pool)
    && adaptiveCreate.input.pool.length === DATA.agents.length
    && adaptiveCreate.input.pool.length === adaptiveCreate.input.team.length
    && adaptiveCreate.input.pool[0].agentId === 'a0');

// ---------- U-102: which of the two empty-pool answers this is ----------
// Every box empty posted `pool: []` and the host read it as the whole fleet —
// while the identical picture could as truthfully be read as "nobody is picked".
// The scope is the answer now, and the auto-lead is named before the run.
ok('the pool heading offers the scope as a choice rather than implying it',
    html().includes('id="f-scope-fleet"') && html().includes('id="f-scope-sel"'));
ok('‼️ …and in whole-fleet scope every tick is IN, not a choice being offered',
    (html().match(/id="tm-\d" data-team="[^"]*" checked disabled/g) || []).length === DATA.agents.length);
ok('…the lead box NAMES the agent an automatic lead would land on',
    html().includes('Automatic → lead'));
getEl('f-scope-sel').listeners.click();
ok('switching to Selected agents shows an honest zero instead of a silent fleet',
    html().includes('0 of 3 ticked'));
// The boxes the classic half ticked are still ticked in the shim's DOM (a
// checkbox's markup does not change when `form` stops counting it), so the
// selection is cleared through them the way a user would.
DATA.agents.forEach((a, i) => { getEl('tm-' + i).checked = false; });
posted = [];
getEl('f-start').listeners.click();
ok('‼️ …and Start REFUSES an empty selection rather than expanding it to everybody',
    !posted.some(p => p.type === 'create') && html().includes('Nobody is in the pool'));
getEl('tm-2').checked = true;
getEl('tm-2').listeners.change();
ok('ticking one agent makes the pool that one — and the auto-lead follows it',
    html().includes('1 of 3 ticked') && html().includes('Automatic → reviewer'));
posted = [];
getEl('f-start').listeners.click();
{
    const sel = posted.find(p => p.type === 'create');
    ok('…and the payload says selected, carrying exactly that agent',
        sel && sel.input.poolScope === 'selected' && sel.input.pool.length === 1
        && sel.input.pool[0].agentId === 'a2'
        && sel.input.team.length === 1);
}
// ‼️ …AND THE TWO LISTS DO NOT SHARE ONE ANSWER. Count Classic's ticks, go and
// change the pool, come back: Classic's cast list is where it was left. Before
// this both wrote `form.team`, so choosing a pool silently re-cast the mission.
getEl('f-mode-classic').listeners.click();
const classicTicks = (html().match(/id="tm-\d" data-team="[^"]*" checked/g) || []).length;
getEl('f-mode-adaptive').listeners.click();
getEl('f-mode-classic').listeners.click();
ok('‼️ an objective\'s pool ticks never rewrite the classic team',
    classicTicks > 0
    && (html().match(/id="tm-\d" data-team="[^"]*" checked/g) || []).length === classicTicks);
getEl('f-mode-adaptive').listeners.click();
// An explicit lead that is NOT in the pool is a valid objective, and the form
// says what that means rather than looking like a mistake.
getEl('f-lead').value = 'a0';
getEl('f-scope-sel').listeners.click();
ok('an explicit lead outside the pool is drawn as planner only',
    html().includes('Planner only'));
getEl('f-lead').value = 'a2';
getEl('f-scope-sel').listeners.click();
ok('…and one inside it says the row is about its WORKER delegations',
    html().includes('worker delegations only'));
getEl('f-lead').value = '';
getEl('f-scope-fleet').listeners.click();

// ---------- U-103: one resolver, and it belongs to the host ----------
// The page used to answer "which engine does this row really land on?" itself:
// the row's own, else the mission's, else claude. That is three of the five
// rungs the launch climbs — the agent's own per-engine default and
// `agentFarm.launchDefaults` were not in the page's world at all. So a fleet
// default sent a delegation to OpenCode while the row went on offering Claude
// aliases and five efforts OpenCode has no flag for.
posted = [];
flushTimers();
const askedPreview = posted.find(p => p.type === 'preview');
ok('‼️ the form asks the HOST what this draft would launch with',
    !!askedPreview && askedPreview.seq > 0 && !!askedPreview.input);
ok('…about the same draft Start would post, not a second shape of it',
    askedPreview && askedPreview.input.poolScope === 'fleet'
    && Array.isArray(askedPreview.input.pool)
    && askedPreview.input.pool.length === DATA.agents.length
    && askedPreview.input.team.length === askedPreview.input.pool.length);
const answerPreview = (seq, workers, problems) => msgHandler({
    data: {
        type: 'preview', seq,
        preview: {
            ok: !(problems || []).length, mode: 'adaptive', title: '', goal: 'g',
            lead: { agentId: 'a0', agentName: 'lead', origin: 'auto' },
            planner: {
                agentId: 'a0', agentName: 'lead', kind: 'planner',
                requested: { engine: 'claude' }, effective: { engine: 'claude', workDir: 'D:/agents/lead' },
                origin: { engine: 'cli', model: 'cli', effort: 'cli', permissionMode: 'cli' },
                note: '', problems: []
            },
            workers, problems: problems || []
        }
    }
});
const fleetWorker = {
    agentId: 'a1', agentName: 'coder', kind: 'worker',
    requested: {}, effective: { engine: 'opencode' },
    origin: { engine: 'fleet', model: 'cli', effort: 'cli', permissionMode: 'cli' },
    note: 'engine opencode (fleet)', problems: []
};
answerPreview(askedPreview.seq, [fleetWorker], []);
ok('‼️ …and a FLEET default the page could never see now decides that row\'s catalogue',
    html().includes('opencode/grok-code'));
ok('…including its effort box, which goes dead because that engine has no such flag',
    html().includes('— no effort —'));
// MIRROR: the box is ~150px and can say none of this, so the value it holds and
// the chain that produced it are the first thing the tooltip says.
ok('‼️ …and the control MIRRORS where the value came from, chain and all',
    html().includes('from agentFarm.launchDefaults (fleet-wide)')
    && html().includes('this row → the mission → this agent'));
ok('…while a field NOBODY resolved says so instead of showing a plausible default',
    html().includes('CLI chooses'));
// A debounced form fires faster than the answers come back. An older answer
// painted over a newer one would be the same lie in a new costume.
answerPreview(askedPreview.seq - 1, [{
    ...fleetWorker, effective: { engine: 'claude' },
    origin: { engine: 'cli', model: 'cli', effort: 'cli', permissionMode: 'cli' }
}], []);
ok('‼️ …and an answer about an OLDER draft is dropped rather than painted over the newer one',
    html().includes('opencode/grok-code'));
answerPreview(askedPreview.seq, [fleetWorker], [
    'coder: OpenCode cannot run on this machine — npm i -g opencode-ai',
    'reviewer: this run asks for effort "high" and OpenCode has no reasoning-effort flag at all'
]);
ok('…and every refusal this draft would meet is shown TOGETHER, before Start is pressed',
    html().includes('This draft would be refused')
    && html().includes('cannot run on this machine')
    && html().includes('no reasoning-effort flag'));
// ‼️ U-100 — AND THE EMPTY BOX DOES NOT SAY "DEFAULT". An orchestrator field
// nobody set is not a value; the host says what the run would really use and who
// decided, and `CLI chooses` when nobody did. Guessing a plausible-looking model
// into that box is the same defect one control over.
answerPreview(askedPreview.seq, [fleetWorker], []);
ok('‼️ the planner\'s empty model box says CLI chooses rather than implying a default',
    html().includes('— CLI chooses —'));
msgHandler({
    data: {
        type: 'preview', seq: askedPreview.seq,
        preview: {
            ok: true, mode: 'adaptive', title: '', goal: 'g', workers: [], problems: [],
            lead: { agentId: 'a0', agentName: 'lead', origin: 'auto' },
            planner: {
                agentId: 'a0', agentName: 'lead', kind: 'planner',
                requested: { engine: 'claude', model: 'opus', effort: 'xhigh' },
                effective: { engine: 'claude', model: 'opus', effort: 'xhigh', workDir: 'D:/agents/lead' },
                origin: { engine: 'cli', model: 'mission', effort: 'mission', permissionMode: 'cli' },
                note: 'model opus (mission) · effort xhigh (mission)', problems: []
            }
        }
    }
});
ok('…and once the host resolves one, the box carries it with WHO decided',
    html().includes('— opus —') && html().includes('from the mission'));

// Back to the state every test below this was written against: no answer yet,
// which is a real state — it is what the form shows for the first 220ms.
msgHandler({ data: { type: 'preview', seq: askedPreview.seq, preview: null } });
ok('…and with no answer in hand the row falls back to its own words, not to a stale one',
    !html().includes('opencode/grok-code') && !html().includes('This draft would be refused'));

// ---------- X-118: an answer is only ever about the draft it was ASKED for ----------
// The generation used to be bumped inside the debounce timer, so for the 220ms
// between an edit and its own request the answer still in flight about the
// PREVIOUS draft counted as current: it painted the new draft's model boxes and
// refusal list with the old resolution, and the repaint it caused restarted the
// clock on the request the new draft was still waiting for.
posted = [];
flushTimers();
const reqA = posted.filter(p => p.type === 'preview').pop();
ok('a settled draft has exactly one request in flight', !!reqA);
// The user edits while A is still out. Nothing is flushed: B is the draft now
// and B's own request is still sitting in the debounce.
const goalWas = getEl('f-goal').value;
getEl('f-goal').value = 'A completely different objective, typed while A was in flight.';
// ‼️ THE CLOCK IS WATCHED, NOT GUESSED. A fake clock cannot show 220ms passing,
// so what is measured is the handle: B's timer must still be the SAME one after
// the stale answer and after a data refresh. Clearing and re-arming it is the
// defect — in real time it pushes B's request another debounce away, every time.
const clearedHandles = [];
const realSetTimeout = sandbox.setTimeout, realClearTimeout = sandbox.clearTimeout;
let lastHandle = 0;
sandbox.setTimeout = (fn, ms) => (lastHandle = realSetTimeout(fn, ms));
sandbox.clearTimeout = (h) => { if (h) { clearedHandles.push(h); } return realClearTimeout(h); };
getEl('tm-0').listeners.change();
const bHandle = lastHandle;
ok('…and an edit schedules the NEW draft\'s own request',
    typeof sandbox.timers[bHandle - 1] === 'function');
// A comes back now, about a draft that no longer exists.
answerPreview(reqA.seq, [fleetWorker], ['coder: OpenCode cannot run on this machine']);
ok('‼️ X-118 — an answer about the draft the user has already edited paints NOTHING',
    !html().includes('opencode/grok-code') && !html().includes('This draft would be refused'));
ok('…and it does not restart the clock on the newer draft\'s own request',
    !clearedHandles.includes(bHandle) && typeof sandbox.timers[bHandle - 1] === 'function');
msgHandler({ data: { type: 'data', data: DATA } });
ok('…nor does a panel data refresh, which repaints a draft that did not change',
    !clearedHandles.includes(bHandle) && typeof sandbox.timers[bHandle - 1] === 'function');
sandbox.setTimeout = realSetTimeout; sandbox.clearTimeout = realClearTimeout;
// B's own request goes out: one generation ahead, carrying B's words.
posted = [];
flushTimers();
const reqB = posted.filter(p => p.type === 'preview').pop();
ok('‼️ …then B\'s request goes out, a generation ahead of A and about B\'s draft',
    reqB && reqB.seq > reqA.seq
    && String(reqB.input.goal).startsWith('A completely different objective'));
answerPreview(reqB.seq, [fleetWorker], []);
ok('…and B\'s own answer is the one that paints', html().includes('opencode/grok-code'));
// Reverse order: A finally lands, long after B was accepted.
answerPreview(reqA.seq, [{
    ...fleetWorker, effective: { engine: 'claude' },
    origin: { engine: 'cli', model: 'cli', effort: 'cli', permissionMode: 'cli' }
}], []);
ok('…and A landing LAST still cannot overwrite it', html().includes('opencode/grok-code'));
// Back to the draft every test below this was written against, with no answer
// in hand — which is a real state: it is what the form shows for the first 220ms.
getEl('f-goal').value = goalWas;
getEl('tm-0').listeners.change();
posted = [];
flushTimers();
const reqRestore = posted.filter(p => p.type === 'preview').pop();
msgHandler({ data: { type: 'preview', seq: reqRestore.seq, preview: null } });
ok('…and with no answer in hand the row falls back to its own words again',
    !html().includes('opencode/grok-code') && !html().includes('This draft would be refused'));

// ‼️ BACKWARDS COMPATIBILITY IS THE POINT: a classic Start posts the message it
// always posted. Not `mode: 'classic'` on every payload — the absent key IS the
// classic answer, and a payload that grows keys nobody reads is how a
// "compatible" change stops being one.
getEl('f-mode-classic').listeners.click();
posted = [];
getEl('f-start').listeners.click();
const classicCreate = posted.find(p => p.type === 'create');
ok('‼️ a classic Start posts NO mode and NO objective keys — the payload is unchanged',
    classicCreate && classicCreate.input.mode === undefined
    && classicCreate.input.successCriteria === undefined
    && classicCreate.input.constraints === undefined
    && classicCreate.input.autonomy === undefined
    && classicCreate.input.pool === undefined
    && classicCreate.input.poolScope === undefined);
ok('…and everything typed in the objective survived the trip back too',
    html().includes('The OpenCode engine is production-ready on this machine.'));
msgHandler({ data: { type: 'created' } });

// ---------- U-64: the model/effort matrix follows the engine, live ----------
// Every other launch surface narrows the model and the effort to the engine the
// row is set to. This form did not: it offered four Claude aliases and six
// efforts to a member delegating on OpenCode, and the launch then refused the
// pair. `afEngine.js` answers both questions and is asked here per row.
msgHandler({ data: { type: 'openForm' } });
getEl('tm-1').checked = true;
getEl('en-1').value = 'opencode';
getEl('en-1').listeners.change();
// ‼️ U-97 — the model box is a real <select> now, so "which catalog is it on"
// is read off that one element rather than off a shared <datalist> id.
const rowBox = (which, i) => {
    const h = html();
    const at = h.indexOf('<select id="' + which + '-' + i + '"');
    return at < 0 ? '' : h.slice(at, h.indexOf('</select>', at));
};
const mdBox = (i) => rowBox('md', i);
const efBox = (i) => rowBox('ef', i);
const pmBox = (i) => rowBox('pm', i);
const enBox = (i) => rowBox('en', i);
ok('a member moved to another engine gets THAT engine\'s catalog in its model box',
    mdBox(1).includes('opencode/grok-code') && !mdBox(1).includes('>opus<'));
ok('‼️ …and an engine with no effort setting draws the box DEAD rather than offering five refusals',
    html().includes('— no effort —'));
ok('…saying which engine decided that, in the tooltip the box is too narrow to carry',
    html().includes('OpenCode has no effort setting'));
// ‼️ U-97 — THE ROW READS IN THE ORDER IT RESOLVES. Model depends on the engine
// and effort depends on the model, so neither may stand to the LEFT of what
// decides it. Permissions close the row: they depend on nothing above them.
{
    const h = html();
    const at = (id) => h.indexOf('id="' + id + '-1"');
    ok('‼️ the row is laid out Agent/role → Engine → Model → Effort → Permissions',
        at('tm') < at('rl') && at('rl') < at('en') && at('en') < at('md')
        && at('md') < at('ef') && at('ef') < at('pm'));
}
// ‼️ U-97 — AND A STALE PAIR IS DROPPED, NOT CARRIED. A row set to opus/high on
// Claude and then moved to OpenCode used to keep both words and hand them to a
// CLI that has neither — the effort silently, because the dead box still read
// back whatever `form` remembered. `AFEngine.narrow` runs on the change now.
msgHandler({ data: { type: 'openForm' } });
getEl('tm-1').checked = true;
getEl('en-1').value = '';
getEl('md-1').value = 'opus';
getEl('ef-1').value = 'high';
getEl('en-1').listeners.change();
ok('a pair the engine really has survives the redraw untouched',
    mdBox(1).includes('value="opus" selected') && efBox(1).includes('value="high" selected'));
getEl('en-1').value = 'opencode';
getEl('en-1').listeners.change();
// ‼️ U-101 — AND IT IS ASKED ABOUT RATHER THAN TAKEN AWAY. U-97 narrowed on the
// spot, so a model somebody had typed vanished while their eyes were on a
// different control and the row afterwards gave no sign it had ever held one.
ok('‼️ moving that row to an engine with neither NAMES what no longer fits instead of dropping it',
    html().includes('no longer fit') && html().includes('>opus<')
    && html().includes('id="f-narrow-clear"'));
ok('…and the values are still on the row until somebody says so',
    mdBox(1).includes('value="opus"'));
getEl('f-narrow-clear').listeners.click();
ok('‼️ …then Clear them drops both AND leaves the reason where the row is',
    !mdBox(1).includes('>opus<') && efBox(1).includes('— no effort —')
    && html().includes('cleared —') && html().includes('OpenCode does not offer it'));
// ‼️ U-101 — THE BULK PROFILE IS AN ACTION ON THE ROWS, NOT A SECOND DEFAULT.
// The old mission-wide `Delegation engine` box read as a bulk switch and was
// not one: it wrote an invisible fallback, never touched a row, and had no
// model / effort / permission counterpart.
ok('the composer no longer carries an ownerless mission-wide engine field',
    !html().includes('id="f-engine"'));
getEl('en-1').value = '';
getEl('en-1').listeners.change();
getEl('md-1').value = 'opus';
getEl('md-1').listeners.change();
getEl('f-profile').listeners.click();
ok('the profile tool opens with all four dimensions and a "don\'t change" answer on each',
    html().includes('id="pf-engine"') && html().includes('id="pf-model"')
    && html().includes('id="pf-effort"') && html().includes('id="pf-permissionMode"')
    && (html().match(/>don't change</g) || []).length === 4);
getEl('pf-permissionMode').value = 'plan';
getEl('pf-permissionMode').listeners.change();
getEl('f-profile-apply').listeners.click();
ok('‼️ applying ONE dimension leaves the others alone — an engine apply cannot wipe the models beside it',
    pmBox(1).includes('value="plan" selected') && mdBox(1).includes('value="opus" selected'));
getEl('f-profile').listeners.click();
getEl('pf-engine').value = 'clear';
getEl('pf-engine').listeners.change();
getEl('f-profile-apply').listeners.click();
ok('…and "inherit — clear the override" really removes one rather than writing another value',
    enBox(1).includes('value="" selected') || !enBox(1).includes(' selected'));

// ---------- X-123: "don't change" is not "profile everything against Claude" ----------
// `Engine: don't change` used to mean `claude` in this tool, unconditionally. So
// leaving the engine alone and setting only a Model offered CLAUDE's catalogue
// and wrote the chosen value onto every included row — the OpenCode row too.
{
    const profBox = (key) => {
        const h = html();
        const at = h.indexOf('<select id="pf-' + key + '"');
        return at < 0 ? '' : h.slice(at, h.indexOf('</select>', at));
    };
    // the block above left the profile's engine on "clear"
    getEl('pf-engine').value = 'keep'; getEl('pf-engine').listeners.change();
    getEl('tm-0').checked = false; getEl('tm-0').listeners.change();
    getEl('tm-1').checked = true; getEl('tm-1').listeners.change();
    getEl('tm-2').checked = true; getEl('tm-2').listeners.change();
    getEl('en-1').value = 'opencode'; getEl('en-1').listeners.change();
    getEl('en-2').value = ''; getEl('en-2').listeners.change();
    getEl('f-profile').listeners.click();
    ok('‼️ X-123 — a pool on two engines offers NO model under "don\'t change", instead of Claude\'s',
        profBox('model').includes('don\'t change') && profBox('model').includes('inherit')
        && !profBox('model').includes('>opus<') && !profBox('model').includes('Grok'));
    ok('…and says why, naming the engines those rows are actually on',
        html().includes('not on one engine') && html().includes('opencode'));
    ok('…while the permission box, which no engine has an opinion about, stays open',
        profBox('permissionMode').includes('>plan<'));
    getEl('en-2').value = 'opencode'; getEl('en-2').listeners.change();
    ok('‼️ …and a pool that IS on one engine gets THAT engine\'s catalogue rather than Claude\'s',
        profBox('model').includes('Grok') && !profBox('model').includes('>opus<'));
    getEl('pf-engine').value = 'claude'; getEl('pf-engine').listeners.change();
    ok('…and an explicit engine on the profile is the catalogue, whatever the rows are on now',
        profBox('model').includes('>opus<'));
    // The real sequence that used to write a Claude model onto an OpenCode row:
    // pick the pair, then send the engine back to "inherit". Nothing can resolve
    // what those rows will land on any more, so the values may not be written.
    getEl('pf-model').value = 'opus'; getEl('pf-model').listeners.change();
    getEl('pf-engine').value = 'clear'; getEl('pf-engine').listeners.change();
    const before = { md1: mdBox(1), md2: mdBox(2), en1: enBox(1) };
    getEl('f-profile-apply').listeners.click();
    ok('‼️ X-123 — a press that cannot be honoured on every row applies to NONE of them',
        html().includes('Nothing was applied')
        && mdBox(1) === before.md1 && mdBox(2) === before.md2 && enBox(1) === before.en1);
    ok('…and it names the row and the reason rather than failing quietly',
        html().includes('coder') && html().includes('cannot resolve'));
    // …and the same tool, asked something it CAN do, still does it.
    getEl('pf-engine').value = 'keep'; getEl('pf-engine').listeners.change();
    getEl('pf-model').value = 'opencode/grok-code'; getEl('pf-model').listeners.change();
    const row0 = mdBox(0) + enBox(0) + efBox(0) + pmBox(0);
    getEl('f-profile-apply').listeners.click();
    // ‼️ AND THE PAIR ACROSS ROWS, WHICH IS THE OTHER HALF OF ALL-OR-NOTHING:
    // this row still carries `high` from the engine it used to be on, and the
    // model this press would write takes no effort at all. The old tool wrote
    // the model anyway and raised a warning afterwards.
    ok('‼️ …and an effort a row KEPT, that the new model cannot take, refuses the press too',
        html().includes('Nothing was applied')
        && html().includes('does not take effort high'));
    // (the dead effort box on an OpenCode row has no listener of its own, so the
    // clearing is read back the way any other repaint reads the form)
    getEl('ef-1').value = ''; getEl('tm-1').listeners.change();
    getEl('f-profile-apply').listeners.click();
    ok('‼️ …and a press that CAN be honoured writes every INCLUDED row',
        mdBox(1).includes('value="opencode/grok-code" selected')
        && mdBox(2).includes('value="opencode/grok-code" selected'));
    ok('…and leaves an unticked row byte-identical',
        (mdBox(0) + enBox(0) + efBox(0) + pmBox(0)) === row0);
    // Back to the state the tests below were written against.
    getEl('en-1').value = ''; getEl('en-1').listeners.change();
    getEl('en-2').value = ''; getEl('en-2').listeners.change();
    getEl('md-1').value = ''; getEl('md-1').listeners.change();
    getEl('md-2').value = ''; getEl('md-2').listeners.change();
}
msgHandler({ data: { type: 'created' } });

// ---------- U-64: the list says which kind of run each row is ----------
{
    const adaptiveSpec = {
        ...DATA.specs[0], id: 'spec2', title: 'Objective run', mode: 'adaptive',
        successCriteria: [{ id: 'c1', text: 'proved', required: true }],
        constraints: ['no writes'], autonomy: 'decide-alone'
    };
    msgHandler({
        data: {
            type: 'data', data: {
                ...DATA,
                specs: [DATA.specs[0], adaptiveSpec],
                runs: [RUN, { ...RUN, id: 'run2', specId: 'spec2', status: 'running' }],
                pending: { questions: [], approvals: [] }
            }
        }
    });
    ok('an adaptive run carries a compact mode badge on its row',
        html().includes('Objective run<span class="mchip adpt">ADPT</span>')
        || html().includes('Objective run <span class="mchip adpt">ADPT</span>'));
    ok('a classic run carries none — the default costs no width',
        (html().match(/mchip adpt/g) || []).length === 1);
    ok('…and BOTH rows name their mode in the row tooltip, where the long form belongs',
        html().includes('mode: Adaptive Objective') && html().includes('mode: Classic Mission'));
}

// ---------- U-64: the adaptive run's detail answers "what and why" ----------
// Seven sections the classic detail never had, each with ONE subject: the
// objective is what is judged, the strategy is what the lead is doing and why,
// the evaluations are what was found, the cast is who is on it, the graph is
// what actually happened. A classic run must not grow any of them.
{
    const A_SPEC = {
        id: 'spec3', mode: 'adaptive', title: 'Objective run',
        goal: 'The engine is production-ready and each path is proved by a real run.',
        leadAgentId: 'a0', leadAgentName: 'lead', team: [],
        pool: [{ agentId: 'a1', agentName: 'coder', role: 'runs the paths' },
            { agentId: 'a2', agentName: 'reviewer' }],
        constraints: ['Do not touch anything outside src/engines.'],
        successCriteria: [
            { id: 'c1', text: 'A real session starts and resumes with the same id.', required: true },
            { id: 'c2', text: 'The cost shown matches what the CLI stated.', required: true },
            { id: 'c3', text: 'A test covers the resume path.', required: false }
        ],
        autonomy: 'ask-when-unsure',
        workdir: 'D:/repo', limits: DATA.defaults, approvalMode: 'auto', createdAt: 1
    };
    const A_RUN = {
        id: 'run3', specId: 'spec3', status: 'running', startedAt: 500,
        totalCostUSD: 2.1, ledger: [],
        strategy: { version: 3, phase: 'verifying', text: 'Prove each path, then have a second agent read it back.', at: 9000 },
        roles: [
            { agentId: 'a1', agentName: 'coder', brief: 'runs each path against the real CLI', engine: 'opencode', boundAt: 1000 },
            { agentId: 'a2', agentName: 'reviewer', brief: 'says what the transcript does NOT show', permissionMode: 'plan', boundAt: 4000 }
        ],
        evaluations: [
            {
                id: 'e1', targets: ['d1'], evaluator: { kind: 'lead' }, advice: 'revise', at: 3000,
                findings: [{ criterionId: 'c1', verdict: 'pass', evidence: 'resumed twice with the same id' }]
            },
            {
                id: 'e2', targets: ['d2'], evaluator: { kind: 'agent', agentId: 'a2', agentName: 'reviewer' },
                advice: 'replan', at: 9500,
                findings: [{ criterionId: 'c2', verdict: 'fail', gap: 'the page reads $0.00 where the CLI printed $0.014' }]
            }
        ],
        guidance: [
            { id: 'g1', text: 'stop spending rounds on the catalog', at: 2000, appliedAt: 2500 },
            { id: 'g2', text: 'call an unreadable price a failure, not an unknown', at: 9800 }
        ],
        // ‼️ U-65 — THE RECORD'S OWN SHAPE. What was here pointed a council at
        // its conversation through `conversation` (the field is
        // `conversationId`), gave a message the state `'said'` (the states are
        // pending / delivered / failed / cancelled) and put counts on a
        // conversation that never carries any. Every string test passed — and
        // on a real run the council matched no conversation at all.
        conversations: [
            { id: 'cv1', objective: 'Is $0.00 a missing price or a free turn?', participants: ['a1', 'a2'], openedAt: 1000 },
            { id: 'cv2', objective: 'Which transcript would a user open first?', participants: ['a1'], openedAt: 9000, closedAt: 9500, closeReason: 'answered in one turn' }
        ],
        councils: [{
            id: 'k1', conversationId: 'cv1', question: 'Is $0.00 a missing price or a free turn?',
            chair: 'a2', members: ['a1', 'a2'], options: ['missing price', 'free turn'],
            maxTurns: 8, openedAt: 1000,
            votes: [{ member: 'a1', choice: 'missing price' }, { member: 'a2', unclear: true }]
        }],
        messages: [
            {
                id: 'm1', conversationId: 'cv1', from: 'a1', fromName: 'coder', to: [], intent: 'proposal',
                refs: [], excerpt: 'A zero on an engine that states no price is a MISSING price.',
                carried: 'new', transcript: 'D:/s/coder.jsonl', outputFile: 'D:/out/m1.md',
                orderedAt: 1000, settledAt: 1200, state: 'delivered'
            },
            {
                id: 'm2', conversationId: 'cv1', from: 'a2', fromName: 'basit', to: ['a1'], intent: 'challenge',
                refs: ['m1'], excerpt: 'Only for engines with no price field.',
                carried: 'handoff', orderedAt: 1300, settledAt: 1500, state: 'delivered'
            },
            {
                id: 'm3', conversationId: 'cv1', from: 'a1', fromName: 'coder', to: ['a2'], intent: 'response',
                refs: ['m2'], excerpt: 'Agreed for those; a reporting engine is a different case.',
                carried: 'resumed', orderedAt: 1600, settledAt: 1800, state: 'delivered'
            },
            {
                id: 'm4', conversationId: 'cv1', from: 'a2', fromName: 'basit', to: [], intent: 'question',
                refs: [], ask: 'Ask what would change the answer.',
                orderedAt: 1900, settledAt: 2000, state: 'failed',
                note: 'the delegate exited 1 without writing an output file'
            },
            {
                id: 'm5', conversationId: 'cv1', from: 'a1', fromName: 'coder', to: ['a2'], intent: 'challenge',
                refs: ['m3'], excerpt: 'That still leaves the row unable to say which case it is in.',
                carried: 'resumed', orderedAt: 2100, settledAt: 2200, state: 'delivered'
            },
            {
                id: 'm6', conversationId: 'cv2', from: 'a1', fromName: 'coder', to: [], intent: 'evidence',
                refs: [], excerpt: 'The index opens the newest first.',
                orderedAt: 9000, settledAt: 9400, state: 'delivered'
            }
        ],
        rounds: [
            {
                n: 1, thought: 'open a session', action: 'delegate', plannerCostUSD: 0.02, at: 1000,
                phase: 'exploring', strategyVersion: 1,
                steps: [{ id: 'x1', round: 1, agentId: 'a1', agentName: 'coder', title: 'open a session', prompt: 'p', status: 'done', criteria: ['c1'] }]
            },
            {
                // ‼️ a `parallel` round — the branch that used to draw NOTHING,
                // because it tested the round's NAME instead of its contents
                n: 2, thought: 'price and a second pair of eyes', action: 'parallel', plannerCostUSD: 0.03, at: 9000,
                phase: 'verifying', strategyVersion: 3,
                steps: [
                    { id: 'x2', round: 2, agentId: 'a1', agentName: 'coder', title: 'read the price back', prompt: 'p', status: 'running', criteria: ['c2'] },
                    { id: 'x3', round: 2, agentId: 'a2', agentName: 'reviewer', title: 'say what it does not show', prompt: 'p', status: 'done', evaluates: true, criteria: ['c2'] }
                ]
            }
        ],
        trace: { file: 'D:/store/run3.jsonl', v: 1, lastSeq: 20 },
        traceDegraded: 'one delegation of round 2 has an unknown fate'
    };
    const A_TRACE = {
        phase: 'verifying', degraded: null,
        strategies: [
            { n: 1, summary: 'walk the paths in order', phase: 'exploring', at: 1000 },
            { n: 3, summary: 'prove each path, then read it back', phase: 'verifying', at: 9000, reason: 'the runner kept reporting its own work as evidence' }
        ],
        graph: [
            { id: 'd1', kind: 'decision', status: 'done', actor: 'lead', label: 'open a session', parentRefs: [], inputRefs: [], outputRefs: ['n1'], createdAt: 1000, strategyVersion: 1 },
            { id: 'n1', kind: 'delegation', status: 'done', actor: 'a1', label: 'coder — open a session', parentRefs: ['d1'], inputRefs: [], outputRefs: [], createdAt: 1100, settledAt: 2000, strategyVersion: 1 },
            { id: 'd2', kind: 'decision', status: 'done', actor: 'lead', label: 'price and a second reader', parentRefs: ['d1'], inputRefs: ['n1'], outputRefs: [], createdAt: 9000, strategyVersion: 3 }
        ]
    };
    const send = () => msgHandler({
        data: {
            type: 'data', data: {
                ...DATA, specs: [A_SPEC, DATA.specs[0]], runs: [A_RUN, RUN],
                traces: { run3: A_TRACE }, pending: { questions: [], approvals: [] }
            }
        }
    });
    send();
    wired.run.find(r => r.dataset.run === 'run3')._click();
    ok('the objective section states what is judged and how much is met',
        html().includes('<b>Objective</b>') && html().includes('1/3 met')
        && html().includes('1 required still open') && html().includes('ask-when-unsure'));
    ok('‼️ a criterion shows the LATEST CURRENT verdict, never a stale one',
        html().includes('>pass<') && html().includes('>fail<')
        && html().includes('the page reads $0.00 where the CLI printed $0.014'));
    ok('…and the constraints, in the user\'s own words',
        html().includes('Do not touch anything outside src/engines.'));
    ok('the strategy in force is named with its version and phase',
        html().includes('<b>Strategy</b>') && html().includes('>v3<')
        && html().includes('Prove each path, then have a second agent read it back.'));
    ok('‼️ …and every revision says WHY it was cut — the half that is only in the journal',
        html().includes('the runner kept reporting its own work as evidence'));
    // The history sections open on a click, which is the DENSITY trade this
    // page already makes for the ledger — the two that answer "what is it doing
    // and why" are the ones that open themselves.
    ['ca-toggle-run3', 'ev-toggle-run3', 'gr-toggle-run3', 'cv-toggle-run3', 'gd-toggle-run3']
        .forEach(id => getEl(id).listeners.click());
    ok('the cast is the roles the lead BOUND, not a team the user named',
        html().includes('<b>Cast</b>') && html().includes('2 bound of 2')
        && html().includes('runs each path against the real CLI'));
    ok('…and says who is working right now', html().includes('>working<'));
    ok('every verdict is kept, with who gave it and what it advised',
        html().includes('<b>Evaluations</b>') && html().includes('>replan<') && html().includes('>revise<'));
    ok('the runtime graph draws what actually happened, with its fan-in',
        html().includes('<b>Runtime graph</b>') && html().includes('3 nodes')
        && html().includes('coder — open a session') && html().includes('⤶1'));
    // ‼️ U-65 — THE ROOM. A summary of an exchange answers "did they talk";
    // the question a reader actually has is what was SAID, by whom, about
    // which message, and where it ran.
    ok('the room counts only turns that really SPOKE',
        html().includes('<b>Conversations</b>') && html().includes('4 spoken') && html().includes('1 silent'));
    ok('‼️ …and the council is matched to its conversation — the field is conversationId',
        html().includes('chair basit') && html().includes('/8'));
    ok('…the cast and the chair are NAMES, never folder ids',
        html().includes('coder, basit') && !html().includes('chair a2'));
    ok('…a vote says who chose what, and never picks for somebody who did not',
        html().includes('coder: missing price') && html().includes('basit: ?'));
    ok('…an unanswered challenge is counted', html().includes('1 unanswered'));
    ok('a closed conversation says WHY it closed', html().includes('answered in one turn'));

    // the transcript opens on the row, one at a time
    wired.cvthread[0]._click();
    ok('‼️ the exchange opens into real chronological messages',
        html().includes('A zero on an engine that states no price is a MISSING price.')
        && html().includes('Only for engines with no price field.'));
    ok('…each with its speaker, its intent in SHORTHAND and what it is about',
        html().includes('>coder<') && html().includes('>chall<') && html().includes('data-cvjump="m1"'));
    ok('…and the lane it was carried on, never assumed',
        html().includes('>handoff<') && html().includes('>resumed<'));
    ok('‼️ …a turn that produced NO message draws no speech — it draws the order and why',
        html().includes('No message: the delegate exited 1 without writing an output file')
        && !html().includes('>m4</span> <b class="cvwho">'));
    ok('…the two deep links are on the message that has them',
        html().includes('data-opensession="D:/s/coder.jsonl"')
        && html().includes('data-openfile="D:/out/m1.md"'));
    ok('…and one-to-many is ordinary here, not a mode',
        html().includes('everyone'));

    // ‼️ the filter is a control and survives the repaint a live run causes
    getEl('cv-open-run3').listeners.click();
    ok('‼️ "unanswered only" leaves the challenge nothing answered',
        html().includes('That still leaves the row unable to say which case it is in.')
        && !html().includes('Agreed for those; a reporting engine is a different case.'));
    getEl('cv-open-run3').listeners.click();
    ok('…and turning it off brings the whole exchange back',
        html().includes('Agreed for those; a reporting engine is a different case.'));

    // a ref is a link: "m3 answers m2" is what makes a transcript followable
    wired.cvjump[0]._click();
    ok('a ref marks the message it points at, so a reader can follow the thread',
        html().includes('cvmsg marked'));

    // ‼️ X-93 — THE READER'S STATE BELONGS TO ONE EXCHANGE OF ONE RUN.
    //
    // `convThread` held a bare conversation id, and every run starts at `c1`.
    // With two run rows open, one click opened BOTH, drew two elements carrying
    // the id `cv-scroll`, and `getElementById` managed whichever came first.
    // The scroll offset, the unseen count, "show all" and the jump mark were
    // global as well, so opening a second exchange handed it the first one's
    // reading position.
    {
        ok('‼️ the transcript box is named for the run AND the exchange',
            html().includes('id="cv-scroll-run3_cv1"') && !html().includes('id="cv-scroll"'));
        ok('…exactly one of them is drawn, whatever else is open',
            (html().match(/class="cvmsgs"/g) || []).length === 1);
        ok('…and the row that opens it says which run it is in',
            /data-cvthread="cv1" data-cvrun="run3"/.test(html()));

        // the mark stays with ITS exchange when the reader moves to another
        const cv2 = wired.cvthread.find(e => e.dataset.cvthread === 'cv2');
        cv2._click();
        ok('opening a second exchange does not inherit the first one\'s mark',
            !html().includes('cvmsg marked'));
        wired.cvthread.find(e => e.dataset.cvthread === 'cv1')._click();
        ok('…and coming back to the first is coming back to it, not to a reset',
            html().includes('id="cv-scroll-run3_cv1"')
            && !html().includes('id="cv-scroll-run3_cv2"'));

        // ‼️ a ref whose target is HIDDEN still gets there. Under the filter,
        // the link used to redraw to no visible effect at all.
        getEl('cv-open-run3').listeners.click();
        ok('the filter is on and the ordinary turn is hidden',
            !html().includes('Agreed for those; a reporting engine is a different case.'));
        const link = wired.cvjump[0];
        const target = link && link.dataset.cvjump;
        ok('there is a ref to follow while the filter is on', !!target);
        link._click();
        ok('‼️ a jump to a target the filter was hiding OPENS it and lands',
            new RegExp(`cvmsg marked" id="cvm-run3-${target}"`).test(html()));
        ok('…and the filter really came off rather than the link going nowhere',
            html().includes('Agreed for those; a reporting engine is a different case.'));
        // and the jump reaches past the compact window too, which is the other
        // way a target is on the record and not on the screen
        const page = fs.readFileSync(path.join(__dirname, '..', 'media', 'missions.js'), 'utf8');
        ok('‼️ a jump opens the whole exchange rather than hoping the target is drawn',
            /rd\.all = true;\s*\/\/ past the compact window/.test(page));
        ok('…and does not ride the reader back to the bottom afterwards',
            /rd\.atEnd = false;/.test(page));
        ok('a ref naming nothing in this run is refused, not redrawn to no effect',
            /if \(!dest\) \{ return; \}/.test(page));
    }

    // ‼️ U-65 — A LIVE REPAINT MUST NOT TAKE THE READER'S PLACE AWAY.
    //
    // This page redraws once a second while a mission runs, and the transcript
    // is a READING surface: a box that jumped back to its first line every
    // second would not be a redraw, it would be an interruption. There are two
    // readers here and they want opposite things — one FOLLOWING the exchange,
    // who wants each new turn as it lands, and one reading further up, whose
    // place must be kept and who is told what arrived in a count.
    {
        // ‼ X-93 - the box is named for the exchange it belongs to: two runs
        // both open on their own c1 used to draw two elements with one id.
        const CVBOX = 'cv-scroll-run3_cv1';
        const box = getEl(CVBOX);
        // the reader has gone back up: 120px into a 900px transcript
        box.scrollTop = 120; box.clientHeight = 400; box.scrollHeight = 900;
        send();
        ok('‼️ a reader who scrolled up keeps the exact line they were on',
            getEl(CVBOX).scrollTop === 120);
        ok('…and the accordion it lives in is still open',
            html().includes('A zero on an engine that states no price is a MISSING price.'));

        // a new turn lands while they are still up there
        const live = JSON.parse(JSON.stringify(A_RUN));
        const sendLive = () => msgHandler({
            data: {
                type: 'data', data: {
                    ...DATA, specs: [A_SPEC, DATA.specs[0]], runs: [live, RUN],
                    traces: { run3: A_TRACE }, pending: { questions: [], approvals: [] }
                }
            }
        });
        live.messages.push({
            id: 'm7', conversationId: 'cv1', from: 'a2', fromName: 'basit', to: [],
            intent: 'evidence', refs: [], excerpt: 'Measured on run2: the same line meant both things.',
            orderedAt: 2300, settledAt: 2400, state: 'delivered'
        });
        getEl(CVBOX).scrollTop = 120;
        getEl(CVBOX).clientHeight = 400;
        getEl(CVBOX).scrollHeight = 900;
        sendLive();
        ok('‼️ …and is TOLD what arrived rather than being moved to it',
            html().includes('new below'));
        ok('…their place is still theirs', getEl(CVBOX).scrollTop === 120);

        // pressing the count is how they choose to go there
        wired.cvend[0]._click();
        ok('…and pressing it follows the exchange down',
            getEl(CVBOX).scrollTop === getEl(CVBOX).scrollHeight);
        ok('…so the count is spent', !html().includes('new below'));

        // the other reader: at the bottom, following it live
        getEl(CVBOX).scrollTop = 500;
        getEl(CVBOX).clientHeight = 400;
        getEl(CVBOX).scrollHeight = 900;
        sendLive();
        ok('‼️ a reader who was following it rides down with the new turn',
            getEl(CVBOX).scrollTop === 900);
        ok('…and is never shown a count for something already on their screen',
            !html().includes('new below'));
    }

    // ‼️ X-85 — WHO SPOKE IS A FACT ABOUT THE PAST, so the RECORD answers it
    // before the live fleet does. This page kept its own resolver that asked
    // `message.fromName` and then `DATA.agents`, so a speaker with no stamped
    // name who had since LEFT the fleet — or whose id was written with a
    // different case or slash than the folder scan produces — fell back to a
    // raw folder path on the very surface the name fields were added for.
    {
        const gone = JSON.parse(JSON.stringify(A_RUN));
        // an agent that is no longer in the fleet, speaking with no stamped name
        gone.roles.push({ agentId: 'D:\\zone\\agent\\ajanlar\\Asistan', agentName: 'asistan', brief: 'files it', boundAt: 2000 });
        gone.messages.push({
            id: 'm8', conversationId: 'cv1', from: 'd:/zone/agent/ajanlar/asistan', to: [],
            intent: 'evidence', refs: [], excerpt: 'The archive already had both.',
            orderedAt: 2500, settledAt: 2600, state: 'delivered'
        });
        // …and one the SPEC knew and nothing else does
        const goneSpec = JSON.parse(JSON.stringify(A_SPEC));
        goneSpec.pool.push({ agentId: 'a9', agentName: 'psikolog' });
        gone.messages.push({
            id: 'm9', conversationId: 'cv1', from: 'a9', to: [], intent: 'evidence', refs: [],
            excerpt: 'Nobody asked the third one.', orderedAt: 2700, settledAt: 2800, state: 'delivered'
        });
        msgHandler({
            data: {
                type: 'data', data: {
                    ...DATA, specs: [goneSpec, DATA.specs[0]], runs: [gone, RUN],
                    traces: { run3: A_TRACE }, pending: { questions: [], approvals: [] }
                }
            }
        });
        ok('‼️ a speaker who has left the fleet is still named from the run\'s own cast',
            html().includes('>asistan<') && !html().includes('ajanlar/asistan<'));
        ok('…and the id is matched as a PATH, so case and slashes are not two agents',
            !html().includes('>D:\\zone\\agent\\ajanlar\\Asistan<'));
        ok('…the spec\'s pool answers for a member nothing else remembers',
            html().includes('>psikolog<') && !html().includes('>a9<'));
    }

    // ‼️ X-81 — ORDERED, SPOKEN AND SILENT ARE THREE FACTS. The row asked only
    // whether a turn had FAILED, so a `pending` one was drawn as an ordinary
    // message — real speaker, real intent, empty body — while the summary above
    // it correctly said the turn had not been spoken. One record, two answers.
    {
        const live = JSON.parse(JSON.stringify(A_RUN));
        live.messages.push({
            id: 'm10', conversationId: 'cv1', from: 'a2', fromName: 'basit', to: ['a1'],
            intent: 'question', refs: [], ask: 'Say what the price column would show for Codex.',
            excerpt: '', orderedAt: 3000, state: 'pending'
        });
        msgHandler({
            data: {
                type: 'data', data: {
                    ...DATA, specs: [A_SPEC, DATA.specs[0]], runs: [live, RUN],
                    traces: { run3: A_TRACE }, pending: { questions: [], approvals: [] }
                }
            }
        });
        ok('‼️ a turn still in flight draws no speech — it says it is waiting',
            html().includes('Waiting: ordered')
            && html().includes('Say what the price column would show for Codex.'));
        ok('…and wears its state, so the row is not read as a silent speaker',
            html().includes('>pending<') && html().includes('cvmsg pend'));
        ok('…the summary counts it as neither spoken nor silent',
            html().includes('4 spoken') && html().includes('1 silent') && html().includes('1 waiting'));
        ok('…and a delivered turn is still the only one that draws words',
            html().includes('A zero on an engine that states no price is a MISSING price.'));
    }

    wired.cvthread[0]._click();
    ok('…and the exchange folds again on the same row',
        !html().includes('A zero on an engine that states no price is a MISSING price.'));
    ok('‼️ a steer says WHERE it lands, and never claims to reach work in flight',
        html().includes('Guide next decision') && html().includes('1 waiting')
        && html().includes('never the delegation running now'));
    ok('a journal gap is said out loud rather than hiding the run',
        html().includes('one delegation of round 2 has an unknown fate'));
    ok('‼️ a `parallel` round draws its delegations — the branch that tested the round\'s NAME',
        html().includes('read the price back') && html().includes('say what it does not show'));

    posted = [];
    getEl('gd-text-run3').value = 'prefer a failed criterion over an unknown';
    getEl('gd-send-run3').listeners.click();
    ok('Queue steer posts the guide message with the run and the text',
        posted[0] && posted[0].type === 'guide' && posted[0].runId === 'run3'
        && posted[0].text === 'prefer a failed criterion over an unknown');
    msgHandler({ data: { type: 'guided', runId: 'run3', note: 'Recorded. The lead sees it at its next decision.', error: '' } });
    ok('…and the HOST\'s sentence about when it lands is what the reader is shown',
        html().includes('Recorded. The lead sees it at its next decision.'));
    msgHandler({ data: { type: 'guided', runId: 'run3', note: '', error: 'That is a classic mission: it has no strategy to steer.' } });
    ok('…as is its refusal, verbatim — the page keeps no second rule about what may be steered',
        html().includes('That is a classic mission: it has no strategy to steer.'));

    // and the obligation the rest of it inherits: a classic run notices none of it
    wired.run.find(r => r.dataset.run === 'run3')._click();
    wired.run.find(r => r.dataset.run === 'run1')._click();
    ok('‼️ a CLASSIC run grows none of these sections',
        !html().includes('<b>Objective</b>') && !html().includes('<b>Strategy</b>')
        && !html().includes('<b>Cast</b>') && !html().includes('<b>Runtime graph</b>')
        && !html().includes('Guide next decision'));
}

// ---------- live "now" strip ----------
msgHandler({
    data: {
        type: 'data', data: {
            ...DATA, pending: { questions: [], approvals: [] },
            runs: [{ ...RUN, status: 'running', now: { what: 'lead is planning round 3', since: 100 } }]
        }
    }
});
ok('running run shows the live now strip with elapsed ticker hook',
    html().includes('lead is planning round 3') && html().includes('data-since="100"'));
posted = [];
getEl('d-pause-run1').listeners.click();
ok('Pause posts control/pause', posted[0] && posted[0].type === 'control' && posted[0].action === 'pause' && posted[0].runId === 'run1');

// ---------- pause feedback: pressed button + withdraw ----------
msgHandler({
    data: {
        type: 'data', data: {
            ...DATA, pending: { questions: [], approvals: [] },
            runs: [{ ...RUN, status: 'running', pausePending: true }]
        }
    }
});
ok('pending pause renders the pressed Pausing… button and the hold strip',
    html().includes('id="d-unpause-run1"') && html().includes('Pausing…') && html().includes('pausing — the current activity finishes first'));
ok('no plain Pause button while a pause is pending', !html().includes('id="d-pause-run1"'));
posted = [];
getEl('d-unpause-run1').listeners.click();
ok('clicking the pressed button withdraws the pause (control/unpause)',
    posted[0] && posted[0].type === 'control' && posted[0].action === 'unpause' && posted[0].runId === 'run1');

// ---------- failed run without a verdict: the reason is front and center ----------
msgHandler({
    data: {
        type: 'data', data: {
            ...DATA, pending: { questions: [], approvals: [] },
            runs: [{ ...RUN, status: 'failed', endedAt: 9500, note: 'planner call timed out (10 min) — the call was killed.' }]
        }
    }
});
ok('failed run without result shows a FAILED banner with the reason',
    html().includes('FAILED') && html().includes('planner call timed out'));

// ---------- mission-control observation layer ----------
// live activity + planner transcript + richer budget line
msgHandler({
    data: {
        type: 'data', data: {
            ...DATA, pending: { questions: [], approvals: [] },
            runs: [{ ...RUN, status: 'running', now: { what: 'round 1: running coder', since: 100 } }],
            plannerTranscripts: { run1: 'D:/cc/S1.jsonl' },
            live: {
                agents: { a1: { status: 'tool', tool: 'Edit', sessions: 1 }, a0: { status: 'working', sessions: 1 } },
                events: [
                    { ts: 600, agentId: 'a0', agentName: 'lead', kind: 'prompt', detail: 'brief-payload-600', transcriptPath: 'D:/cc/S1.jsonl' },
                    { ts: 700, agentId: 'a1', agentName: 'coder', kind: 'toolStart', tool: 'Edit', detail: 'parser.ts', transcriptPath: 'D:/cc/C1.jsonl' },
                    { ts: 800, agentId: 'zz', agentName: 'outsider', kind: 'prompt' }
                ]
            }
        }
    }
});
ok('live activity renders per-agent status chips (lead + team)',
    html().includes('Live activity') && html().includes('lead (lead): working')
    && html().includes('coder: tool (Edit)') && html().includes('reviewer: quiet'));
ok('live feed lists mission agents only, newest first',
    html().includes('parser.ts') && html().includes('brief-payload-600') && !html().includes('outsider')
    && html().indexOf('parser.ts') < html().indexOf('brief-payload-600'));
// U-104 — the link sits in the Orchestrator row now and is worded "transcript":
// the row already says whose it is, so repeating "planner" on it was the label
// being written twice.
ok('planner transcript link renders when the session is indexed',
    /Orchestrator/.test(html()) && /data-opensession="[^"]*"[^>]*>transcript</.test(html()));
ok('budget line carries tasks and minutes', html().includes('2/12 tasks') && html().includes('/120 min'));
posted = [];
wired.opensession[0]._click();
ok('transcript / feed row click posts openSession',
    posted[0] && posted[0].type === 'openSession' && String(posted[0].file).includes('.jsonl'));

// running step row carries its agent's live chip
msgHandler({
    data: {
        type: 'data', data: {
            ...DATA, pending: { questions: [], approvals: [] },
            runs: [{
                ...RUN, status: 'running',
                rounds: [{ ...RUN.rounds[0], steps: [{ ...RUN.rounds[0].steps[0], status: 'running' }] }]
            }],
            live: { agents: { a1: { status: 'tool', tool: 'Bash', sessions: 1 } }, events: [] }
        }
    }
});
ok('running step row shows its agent\'s live tool chip', html().includes('tool (Bash)'));

// ---------- step accordion: full prompt + output tail ----------
msgHandler({ data: { type: 'data', data: { ...DATA, pending: { questions: [], approvals: [] }, runs: [RUN] } } });
posted = [];
wired.step[0]._click();          // expand s1 (done, has an output file)
ok('step expands to the full prompt + output box',
    html().includes('Prompt sent to') && html().includes('id="tailbox"'));
const tailReq = posted.find(p => p.type === 'tail');
ok('expanding a step requests the output tail', tailReq && tailReq.file === 'D:/out/s1.md');

// ---------- X-96: a delegation's evidence is one click from its row ----------
// The row carried the archived OUTPUT and nothing else, so "which session was
// this, and what did it really do?" meant leaving the mission detail, opening
// Sessions and matching by agent and clock.
ok('a step that ran in a session offers it beside the output',
    html().includes('data-opensession="D:/s/step-a1.jsonl"')
    && html().includes('data-openfile="D:/out/s1.md"'));
ok('…and names the session in the tooltip the link is too short to carry',
    html().includes('Session: ses_a1'));
ok('‼️ …while a step with neither says so rather than drawing a dead link',
    html().includes('No session was recorded for this step'));
ok('the right-click entry is gated on the same fact the link is',
    html().includes('&quot;afSession&quot;:true'));
ok('…and the column says what it holds, once, on its heading',
    html().includes('>Evidence<'));
msgHandler({ data: { type: 'tail', file: 'D:/out/s1.md', text: 'ran 12 tests — all green', size: 24 } });
ok('tail reply lands in the output box',
    getEl('tailbox').textContent === 'ran 12 tests — all green');
wired.step[0]._click();          // collapse
ok('second click collapses the step', !html().includes('id="tailbox"'));

// ---------- ledger toggle ----------
msgHandler({
    data: {
        type: 'data', data: {
            ...DATA, pending: { questions: [], approvals: [] },
            runs: [{ ...RUN, ledger: ['R1 delegate 2 task(s) — done', 'R2 ask_user'] }]
        }
    }
});
ok('ledger header renders with the line count', html().includes('Ledger') && html().includes('2 line(s)'));
getEl('lg-toggle-run1').listeners.click();
ok('ledger opens to the compressed history', html().includes('R1 delegate 2 task(s)'));

// ---------- live section toggle ----------
msgHandler({
    data: {
        type: 'data', data: {
            ...DATA, pending: { questions: [], approvals: [] },
            runs: [{ ...RUN, status: 'running' }],
            live: { agents: {}, events: [{ ts: 900, agentId: 'a1', agentName: 'coder', kind: 'stop' }] }
        }
    }
});
ok('live body lists the event while open', html().includes('turn end'));
getEl('lv-toggle-run1').listeners.click();
ok('collapsing live keeps the header chips but hides the rows',
    html().includes('Live activity') && !html().includes('turn end'));

// ---------- tokens everywhere + round bands (viewer style) ----------
msgHandler({ data: { type: 'data', data: { ...DATA, pending: { questions: [], approvals: [] }, runs: [RUN] } } });
ok('run row carries the token total (planner + steps)', html().includes('17.0k'));
ok('step row carries its session tokens', html().includes('12.0k'));
ok('round renders as a viewer-style turn band with stats',
    html().includes('turnhdr') && html().includes('data-round="run1:1"') && html().includes('tok · $'));
ok('budget line includes the run token total', html().includes('17.0k tok'));
wired.round[0]._click();      // fold round 1
ok('clicking the round band folds its body (steps hidden, summary shown)',
    !html().includes('fix parser') && html().includes('2 delegation(s)'));
wired.round[0]._click();      // unfold
ok('clicking again unfolds the round', html().includes('fix parser'));

// ---------- round-level accordion controls ----------
ok('round chip row renders when a run has several rounds',
    html().includes('id="rd-expandall-run1"') && html().includes('id="rd-collapseall-run1"') && html().includes('id="rd-singleopen-run1"'));
ok('viewer-style both-figures stats even when a round has no tokens',
    html().includes('0 tok · $0.05')); // round 2 (ask_user): only planner cost, tokens 0
getEl('rd-collapseall-run1').listeners.click();
// folded bands keep their label; the BODIES (steps table / Q-A block) disappear
ok('Collapse all folds every round of the run',
    !html().includes('fix parser') && !html().includes('<b>Q:</b>'));
getEl('rd-expandall-run1').listeners.click();
ok('Expand all reopens every round', html().includes('fix parser') && html().includes('<b>Q:</b>'));
getEl('rd-singleopen-run1').listeners.click(); // ON — keeps only the newest round open
ok('Single-open keeps one round open', !html().includes('fix parser') && html().includes('<b>Q:</b>'));
wired.round[0]._click(); // expand R1 → single-open folds R2
ok('expanding a round in single-open folds its sibling',
    html().includes('fix parser') && !html().includes('<b>Q:</b>'));
getEl('rd-singleopen-run1').listeners.click(); // OFF again for the tests below
getEl('rd-expandall-run1').listeners.click();

// ---------- planner-session token fallback (pre-2.68 runs) ----------
{
    const OLD = {
        ...RUN, id: 'run1',
        rounds: [{ n: 1, thought: 't', action: 'delegate', plannerCostUSD: 0.2, at: 1000,
            steps: [{ id: 'sx', round: 1, agentId: 'a1', agentName: 'coder', title: 'old work', prompt: 'p', status: 'done', costUSD: 0.1 }] }],
        plannerSessionTokens: 44000
    };
    msgHandler({ data: { type: 'data', data: { ...DATA, pending: { questions: [], approvals: [] }, runs: [OLD] } } });
    ok('run totals fall back to the planner session tokens', html().includes('44.0k'));
    msgHandler({ data: { type: 'data', data: { ...DATA, pending: { questions: [], approvals: [] }, runs: [RUN] } } });
}

// ---------- rich run row + token shares ----------
ok('run row carries the team size next to the lead', html().includes('lead <span class="muted small">+2</span>'));
ok('run row shows rounds as used/max', html().includes('R2/8'));
ok('run row shows delegation count with the failed badge',
    html().includes('Tasks') && html().includes('1✕'));
ok('run row tooltip characterizes the mission (goal, team, limits, tokens)',
    html().includes('goal: Fix the parser and prove it')
    // ‼️ M-14 — and what each member was allowed to do unattended. `{...}` only
    // when it was SET: absent means the engine default, and telling the two
    // apart is how a delegate that called no tool gets explained.
    && html().includes('team: coder — implements {acceptEdits}, reviewer')
    // ‼️ …and the token ceiling is stated beside the dollar one (X-35). A
    // mission delegating on a subscription engine can never reach `maxCostUSD`,
    // so a summary that named only the dollars described a fence that is not
    // there. "no token ceiling" is said out loud rather than left blank.
    && /limits: \$5 · (no token ceiling|[\d.]+k? tok) · 8 rounds/.test(html())
    && html().includes('delegations: 2 (1 failed)'));
// ‼️ AND WHICH ENGINE THE DELEGATIONS RAN ON, beside the planner's — two axes,
// and the planner's is Claude by design, not by omission.
ok('run row tooltip names the delegation engine and the planner engine separately',
    html().includes('engines: delegations claude · planner claude (always)'));
ok('detail shows the per-agent token share line',
    html().includes('tokens by agent:') && html().includes('coder <b>71%</b>') && html().includes('lead (lead) <b>29%</b>'));
ok('token share tooltip carries the raw amounts',
    html().includes('coder 12.0k') && html().includes('lead (lead) 5.0k'));

// ---------- run accordion controls ----------
const RUN2 = { ...RUN, id: 'run2', rounds: [], totalCostUSD: 0.5, plannerSessionId: undefined };
msgHandler({ data: { type: 'data', data: { ...DATA, pending: { questions: [], approvals: [] }, runs: [RUN, RUN2] } } });
const detailCount = () => html().split('class="mdetail"').length - 1;
getEl('r-expandall').listeners.click();
ok('Expand all opens every run', detailCount() === 2);
getEl('r-singleopen').listeners.click();  // back ON — folds down to one
ok('Single-open folds back to a single detail', detailCount() === 1);
getEl('r-collapseall').listeners.click();
ok('Collapse all folds the whole list', detailCount() === 0);

// ---------- run-list sorting (sessions-table pattern) ----------
{
    // RUN: cost 1.25 / started 500 · RUN3: cost 9 / started 100 / title 'Alpha'
    const RUN3 = {
        ...RUN, id: 'run3', specId: 'spec3',
        rounds: [], totalCostUSD: 9, startedAt: 100, plannerSessionId: undefined
    };
    const SPEC3 = { ...DATA.specs[0], id: 'spec3', title: 'Alpha build', leadAgentName: 'zeta' };
    msgHandler({
        data: {
            type: 'data', data: {
                ...DATA, pending: { questions: [], approvals: [] },
                specs: [DATA.specs[0], SPEC3], runs: [RUN, RUN3]
            }
        }
    });
    const rowPos = (id) => html().indexOf(`data-run="${id}"`);
    ok('sort control renders with the criteria list',
        html().includes('id="m-sort"') && html().includes('Failed tasks') && html().includes('Team size'));
    ok('default sort = recent (newest first)', rowPos('run1') < rowPos('run3'));
    getEl('m-sort').listeners.change({ target: { value: 'cost' } });
    ok('cost sort puts the expensive run first', rowPos('run3') < rowPos('run1'));
    getEl('m-sortdir').listeners.click(); // asc
    ok('direction flip reverses the order', rowPos('run1') < rowPos('run3'));
    getEl('m-sort').listeners.change({ target: { value: 'title' } });
    ok('string sort defaults A–Z', rowPos('run3') < rowPos('run1')); // Alpha before Parser
    getEl('m-sort').listeners.change({ target: { value: 'recent' } }); // numeric pick resets to desc
    msgHandler({ data: { type: 'data', data: { ...DATA, pending: { questions: [], approvals: [] }, specs: DATA.specs, runs: [RUN] } } });
}

// ---------- advanced filters: selections + ranges ----------
{
    // RUN: waiting-approval · 17k tok · $1.25  —  RUNF: done/success · 0 tok · $0.4
    const RUNF = {
        ...RUN, id: 'runF', status: 'done', endedAt: 2000,
        result: { verdict: 'success', summary: 'ok' },
        rounds: [], totalCostUSD: 0.4, plannerSessionId: undefined
    };
    msgHandler({ data: { type: 'data', data: { ...DATA, pending: { questions: [], approvals: [] }, runs: [RUN, RUNF] } } });
    getEl('m-filters').listeners.click();
    ok('filter panel opens with selection chips + pickers + range inputs + dates',
        html().includes('id="fs-done"') && html().includes('id="fv-success"')
        && ms.has('flt-leads') && ms.has('flt-agents')
        && html().includes('id="fr-tokens-min"') && html().includes('id="f-from"') && html().includes('id="f-clear"'));
    ok('the lead / team pickers open unfiltered',
        ms.label('flt-leads') === 'Lead: all' && ms.label('flt-agents') === 'Team has: any');
    ms.clear('flt-leads');
    ok('an empty lead pick honestly matches nothing',
        html().includes('No runs match the filters.') && ms.label('flt-leads') === 'Lead: none');
    // one option, ticked = every option ticked = no filter at all
    ms.only('flt-leads', ['lead']);
    ok('picking the lead brings its runs back',
        html().includes('data-run="run1"') && ms.label('flt-leads') === 'Lead: all');
    ms.only('flt-agents', ['coder']);
    ok('the team picker keeps runs whose team includes the pick', html().includes('data-run="run1"'));
    getEl('f-clear').listeners.click();
    getEl('fs-done').listeners.click();
    ok('status selection narrows the list and shows the N/M count',
        html().includes('data-run="runF"') && !html().includes('data-run="run1"') && html().includes('1/2 runs'));
    getEl('fs-done').listeners.click(); // off again
    ok('unpicking the status restores both rows',
        html().includes('data-run="run1"') && html().includes('data-run="runF"'));
    getEl('fv-success').listeners.click();
    ok('verdict selection keeps only runs with that verdict',
        html().includes('data-run="runF"') && !html().includes('data-run="run1"'));
    getEl('fv-success').listeners.click();
    const minEl = getEl('fr-tokens-min');
    minEl.value = '10000';
    minEl.listeners.change();
    ok('token min-range hides runs under the bound',
        html().includes('data-run="run1"') && !html().includes('data-run="runF"'));
    getEl('f-clear').listeners.click();
    ok('Clear resets every filter', html().includes('data-run="run1"') && html().includes('data-run="runF"'));

    // ---------- U-52: the status axis's own words ----------
    // Seven chips, and nobody reads them as seven. "Which of these need me?" is
    // the question this page exists to answer and it used to cost two presses
    // out of seven, with knowing which two.
    ok('the status row offers its named subsets',
        html().includes('id="fg-needsyou"') && html().includes('id="fg-live"')
        && html().includes('id="fg-over"') && html().includes('id="fg-none"'));
    getEl('fg-needsyou').listeners.click();
    ok('‼️ U-52 — Waiting on you is every run stopped on your answer, in one press',
        html().includes('data-run="run1"') && !html().includes('data-run="runF"'));
    getEl('fg-over').listeners.click();
    ok('‼️ U-52 — …and Finished is everything that is over, however it ended',
        html().includes('data-run="runF"') && !html().includes('data-run="run1"'));
    ok('…a group REPLACES the selection rather than adding to it',
        html().includes('1/2 runs'));
    getEl('fg-live').listeners.click();
    ok('Still going is the complement of it', html().includes('data-run="run1"')
        && !html().includes('data-run="runF"'));
    getEl('fg-none').listeners.click();
    ok('…and Clear puts every status back',
        html().includes('data-run="run1"') && html().includes('data-run="runF"'));
    const fromEl = getEl('f-from');
    fromEl.value = '2100-01-01';
    fromEl.listeners.change();
    ok('start-date range can empty the list honestly', html().includes('No runs match the filters.'));
    getEl('f-clear').listeners.click();
    getEl('m-filters').listeners.click(); // close the panel
    msgHandler({ data: { type: 'data', data: { ...DATA, pending: { questions: [], approvals: [] }, runs: [RUN] } } });
}

// ---------- A-17: the recorded-history strip ----------
//
// ‼️ WHAT IS BEING TESTED IS THE PAGE'S RESTRAINT, not its arithmetic. The
// figures are the core's (test_mission_outcomes) and are handed over ready; the
// ways this surface can lie are its own, and each one below is a specific lie:
// a rate quoted off two runs, a comparison drawn where the core declined to
// draw one, a confident zero over a store that could not be read, and cost
// presented as though something acted on it.
{
    const GROUP = (over) => Object.assign({
        signature: 's1|delegate>evaluate>finish|review', signatureV: 1, mode: 'adaptive',
        features: ['review'], runs: 24, enough: true,
        success: 18, partial: 4, failed: 2, cancelled: 0,
        requiredSatisfaction: 0.82, avgRounds: 4.2, avgTasks: 6.7,
        avgStrategyChanges: 0.9, avgUserInterventions: 0.4,
        featureUse: { review: 24 }, avgDurationMs: 1920000,
        avgCostUSD: 1.83, avgTokens: 412000, lastAt: 1000
    }, over || {});
    const OUT = (over) => Object.assign({
        total: 44, minSample: 3, signatureVersions: [1], more: 0,
        health: 'ok', degraded: null,
        compare: {
            classic: { runs: 20, success: 14, enough: true },
            adaptive: { runs: 24, success: 18, enough: true },
            successRate: { classic: 0.7, adaptive: 0.75 },
            note: '20 classic and 24 adaptive runs in this scope.'
        },
        groups: [GROUP()]
    }, over || {});
    const draw = (outcomes, runs) => msgHandler({
        data: {
            type: 'data', data: {
                ...DATA, pending: { questions: [], approvals: [] },
                runs: runs === undefined ? [RUN] : runs, outcomes
            }
        }
    });

    draw(undefined);
    ok('a host that sends no outcomes draws no strip and does not break the page',
        !html().includes('chiprow histrow') && html().includes('data-run="run1"'));

    draw(OUT({ total: 0, groups: [], compare: { classic: { runs: 0, success: 0, enough: false },
        adaptive: { runs: 0, success: 0, enough: false }, successRate: null, note: 'Insufficient sample' } }));
    ok('a farm with nothing recorded says nothing rather than drawing an empty strip',
        !html().includes('chiprow histrow'));

    draw(OUT({}));
    ok('‼️ A-17 — the strip states the count, the top shape and its rate',
        html().includes('chiprow histrow') && html().includes('44 recorded')
        && html().includes('delegate&gt;evaluate&gt;finish') && html().includes('×24')
        && html().includes('75% success'));
    ok('…and the comparison, because the core drew one',
        html().includes('classic 70%') && html().includes('adaptive 75%'));
    ok('…with the whole table in an AFTip rather than on the row',
        html().includes('tip-hist') && html().includes('af-tip')
        && html().includes('verdicts: 18 success · 4 partial · 2 failed · 0 cancelled')
        && html().includes('82% of required criteria met'));
    ok('‼️ cost is in the panel as an OBSERVATION and says so in the same line',
        html().includes('observed cost: $1.83')
        && html().includes('no decision anywhere looks at it'));
    ok('‼️ the panel says why it may count more than the list shows',
        html().includes('not the rows below it') && html().includes('kept to 2000'));

    draw(OUT({
        compare: {
            classic: { runs: 1, success: 1, enough: false },
            adaptive: { runs: 24, success: 18, enough: true },
            successRate: null,
            note: 'Insufficient sample — 1 classic and 24 adaptive run(s) in this scope; '
                + '3 of each are needed before the two are compared.'
        }
    }));
    ok('‼️ a comparison the core declined is NOT drawn — the row carries no rate pair',
        !html().includes('classic 100%') && !html().includes('· adaptive 75%'));
    ok('…and the panel says which side is short instead of implying a tie',
        html().includes('Insufficient sample') && html().includes('3 of each are needed'));

    draw(OUT({
        total: 2,
        compare: { classic: { runs: 0, success: 0, enough: false },
            adaptive: { runs: 2, success: 1, enough: false }, successRate: null, note: 'Insufficient sample' },
        groups: [GROUP({ runs: 2, enough: false, success: 1, partial: 1, failed: 0 })]
    }));
    ok('‼️ a group under minSample is drawn as a COUNT, never as a rate',
        html().includes('×2') && html().includes('too few to read')
        && !html().includes('50% success'));
    ok('…and the panel says the arithmetic is real but the sample is not',
        html().includes('under 3, too few to read')
        && html().includes('nothing may be concluded from them'));

    draw(OUT({ more: 3 }));
    ok('the panel never implies the shapes it shows are all of them',
        html().includes('+3 more shape(s)') && html().includes('missions.outcomes'));

    draw(OUT({ signatureVersions: [1, 2] }));
    ok('two signature versions warn that the groups are not comparable across them',
        html().includes('not comparable across them'));

    draw(OUT({ health: 'unreadable', total: 0, groups: [], degraded: 'the outcome history could not be read (EBUSY)' }));
    ok('‼️ an unreadable store says so instead of drawing a confident zero',
        html().includes('unavailable') && html().includes('EBUSY')
        && !html().includes('0 recorded'));

    draw(OUT({}), []);
    ok('‼️ the history outlives the rows: no runs left, the strip stays',
        html().includes('44 recorded') && html().includes('No missions yet'));

    msgHandler({ data: { type: 'data', data: { ...DATA, pending: { questions: [], approvals: [] }, runs: [RUN] } } });
}

// ---------- ‼️ X-177 — the sentry campaign's block ----------
// Missions is the page the campaign lives on and no third panel was opened, so
// what is checked here is the split the item asks for: this surface carries the
// SETUP and the HISTORY, and never what is true this second (that is the
// Console strip). The state has to be readable in one word and the reason
// nothing is happening has to be the campaign's OWN sentence.
{
    const sentry = (over) => Object.assign({
        defaults: { ceiling: 95, safetyBufferMin: 3, failLimit: 3 },
        idlePollMin: 10,
        permissionModes: [{ id: 'bypassPermissions', label: '⚠ bypassPermissions', detail: 'everything' }],
        campaign: null, running: false, rounds: []
    }, over || {});
    const paint = (s) => msgHandler({ data: { type: 'data', data: { ...DATA, sentry: s } } });

    paint(sentry());
    ok('with no campaign the block says what one WOULD do before anything is pressed',
        html().includes('>Sentry<') && html().includes('takes the next item off a project backlog'));
    ok('...and offers to start one', html().includes('id="s-new"'));
    ok('...and offers no Pause or Stop for a campaign that does not exist',
        !html().includes('id="s-pause"') && !html().includes('id="s-stop"'));

    const CAMP = {
        id: 'sc-1', project: 'prj_9ujsbtzr', agent: 'a1', status: 'running', rounds: 7,
        engine: 'claude', lastAction: 'start', lastRule: 'has-room', lastAt: 1,
        lastWhy: 'slot-2 has the most room left, so X-178 starts there'
    };
    paint(sentry({
        campaign: CAMP, running: true, rotatesAccounts: true, failLimit: 3, failStreak: 1,
        projectName: 'AgentFarm', agentName: 'developer',
        rounds: [{ id: 't9', title: 'Sentry R7 · X-178', status: 'running', createdAt: 1, endedAt: null, account: 'slot-2' }]
    }));
    ok('a running campaign is RUNNING in one word', html().includes('>RUNNING<'));
    ok('‼️ ...and the reason it is doing what it is doing is the campaign OWN sentence',
        html().includes('slot-2 has the most room left'));
    ok('...it names what it works through and as whom, rather than an id to look up',
        html().includes('AgentFarm') && html().includes('developer'));
    ok('...the barren streak is shown against the brake that would stop it',
        html().includes('1/3 barren'));
    ok('...every round it opened is listed with the account that round spent',
        html().includes('Sentry R7 · X-178') && html().includes('slot-2'));
    ok('...and it offers Pause and Stop, but not Resume',
        html().includes('id="s-pause"') && html().includes('id="s-stop"') && !html().includes('id="s-resume"'));

    paint(sentry({
        campaign: { ...CAMP, status: 'paused', lastAction: 'sleep', lastRule: 'wait-for-reset',
            lastWhy: 'every account is at or above 95%', wakeAt: 2 },
        running: false, projectName: 'AgentFarm', agentName: 'developer',
        nextWords: { code: 'X-178', at: 1, prompt: 'Take X-178 and work through it.' },
        rounds: []
    }));
    ok('a paused campaign is PAUSED — not stopped, and not running',
        html().includes('>PAUSED<'));
    ok('...it offers Resume rather than Pause', html().includes('id="s-resume"') && !html().includes('id="s-pause"'));
    ok('‼️ ...and it says it is holding the sentence its next round will open on',
        html().includes('next words · X-178'));

    posted = [];
    getEl('s-resume').listeners.click();
    ok('Resume asks the host for exactly that, and decides nothing itself',
        posted.some(m => m.type === 'sentryControl' && m.action === 'resume'));

    // ‼️ THE REFUSALS ARE THE PAGE'S OWN, so an empty box is named rather than
    // round-tripped to be told the same thing.
    paint(sentry());
    getEl('s-new').listeners.click();
    posted = [];
    getEl('s-start').listeners.click();
    ok('starting with nothing filled in refuses on the page and asks the host nothing',
        !posted.length && html().includes('pick the project'));
}

// ---------- ‼️ X-195 — WHY EACH ROUND OPENED ON THE WORDS IT DID ----------
//
// The campaign's `lastWhy` is ONE sentence, rewritten every round: eight rounds
// share it and seven of them are unexplained by it. So the account is kept per
// round, and this surface has to tell the three states apart — in particular
// the only one that is an alarm, `M!`: the leader WAS asked and gave nothing
// usable, which spends money without buying words.
{
    const paint = (s) => msgHandler({ data: { type: 'data', data: { ...DATA, sentry: s } } });
    const base = {
        defaults: { ceiling: 95, safetyBufferMin: 3, failLimit: 3 },
        idlePollMin: 10, permissionModes: [],
        running: true, projectName: 'AgentFarm', agentName: 'developer'
    };
    const LEADER = {
        day: '2026-09-06', spentUsd: 0.42, turns: 3,
        log: [
            { model: 'claude-sonnet-5', ms: 9100, costUsd: 0.06, at: 1, ok: false, note: 'answered prose' },
            { model: 'claude-sonnet-5', ms: 26800, costUsd: 0.18, at: 2, ok: true }
        ]
    };
    const camp = (over) => Object.assign({
        id: 'sc-2', project: 'p', agent: 'a1', status: 'running', rounds: 4, engine: 'claude',
        lastAction: 'start', lastRule: 'has-room', lastAt: 1, lastWhy: 'the routine continuation',
        leader: LEADER
    }, over || {});
    const ROUNDS = [
        // a round from BEFORE the record existed — it has no `why` at all
        { id: 't1', title: 'Sentry R1', status: 'done', createdAt: 1, endedAt: 2, account: '' },
        {
            id: 't2', title: 'Sentry R2', status: 'done', createdAt: 3, endedAt: 4, account: '',
            whyMark: 'M',
            why: { path: 'mechanical', fired: [], problems: [], outcome: 'finished', opening: 'Take X-2.', why: 'nothing fired' }
        },
        {
            id: 't3', title: 'Sentry R3', status: 'failed', createdAt: 5, endedAt: 6, account: '',
            whyMark: 'M!',
            why: {
                path: 'mechanical', fired: ['round.failed is true'],
                problems: ['quota.percent — nothing measured it'], outcome: 'failed', opening: 'The last round failed.',
                handover: { found: false, source: '' },
                assist: { model: 'claude-sonnet-5', ms: 9100, costUsd: 0.06, at: 5, ok: false, note: 'answered prose' },
                why: 'the leader answered prose'
            }
        },
        {
            id: 't4', title: 'Sentry R4', status: 'running', createdAt: 7, endedAt: null, account: 'slot-2',
            whyMark: 'L',
            why: {
                path: 'leader', fired: ['round.barren is true'], problems: [], outcome: 'barren',
                handover: { found: true, source: 'vault', path: '01_CEVAPLAR/devir_07.md', score: 92 },
                opening: 'Find out why nothing changed.',
                assist: { model: 'claude-sonnet-5', ms: 26800, costUsd: 0.18, at: 7, ok: true },
                why: 'two barren rounds in a row'
            }
        }
    ];
    paint(Object.assign({}, base, { campaign: camp(), rounds: ROUNDS }));
    const h = html();

    ok('‼️ X-195: the rounds table has a column for WHY the round opened on its words',
        h.includes('>Why<'));
    ok('a leader round is marked L, and the panel opens with the long form',
        h.includes('>L<') && h.includes('leader round: a model read the situation and chose these words'));
    ok('a mechanical round is marked M and says no model was asked',
        h.includes('>M<') && h.includes('a template filled itself in, and no model was asked'));
    ok('‼️ …and the third state is NOT read as the second: asked, and gave nothing usable',
        h.includes('>M!<') && h.includes('the leader WAS asked and gave nothing usable'));
    ok('‼️ M! is the only mark drawn as an alarm — a routine night is not one',
        h.includes('class="mchip bad">M!<') && !h.includes('class="mchip bad">M<'));
    ok('a round opened before the record existed says so rather than being drawn as free',
        h.includes('before the farm kept the account of why'));
    ok('the conditions that fired are in the panel, in the words the policy uses',
        h.includes('fired: round.barren is true') && h.includes('fired: nothing — the routine path'));
    ok('‼️ X-190\'s law survives to the row: a condition nobody could judge is not one that did not fire',
        h.includes('could not be judged: quota.percent'));
    ok('‼️ …and WHICH note the continuation was built on — the one claim a reader cannot check alone',
        h.includes('handover: 01_CEVAPLAR/devir_07.md · from vault · score 92'));
    ok('…while a search that found nothing says so, rather than going quiet',
        h.includes('looked, and there was none'));
    ok('what the leader turn cost is on the round that took it, failed or not',
        h.includes('gave nothing usable · claude-sonnet-5 · $0.06'));

    ok('‼️ the night\'s total leader spend is on the campaign line, not only in the record',
        h.includes('leader $0.42 · 3 turn(s)'));
    ok('…quietly, because one turn that gave nothing usable is an ordinary night',
        h.includes('class="mchip prov">leader $0.42'));
    ok('…and the turn-by-turn ledger is the hover, not a second row',
        h.includes('the turns, newest first'));

    paint(Object.assign({}, base, {
        campaign: camp({ leader: Object.assign({}, LEADER, { failStreak: 2 }) }), rounds: ROUNDS
    }));
    ok('‼️ …and it turns red for the one thing that IS an alarm: a leader that stopped waking',
        html().includes('class="mchip bad">leader $0.42'));

    paint(Object.assign({}, base, { campaign: camp({ leader: undefined }), rounds: ROUNDS }));
    ok('a campaign whose leader has never woken claims no spend at all',
        !html().includes('leader $0.42'));
}

// ---------- ‼️ X-196 — THE SWEEP: FIVE PRINCIPLES ON THIS FAMILY'S SURFACES ----------
//
// The user's own instruction behind the item: read the finished backlog, see
// what we have complained about, and take the interface out of it. What is
// pinned here is the three complaints that were true of the sentry block —
// a SHORTHAND word with nothing behind it, prose stuffed into a native
// `title`, and a control that draws less than it means with no MIRROR.
{
    const paint = (s) => msgHandler({ data: { type: 'data', data: { ...DATA, sentry: s } } });
    const base = {
        defaults: { ceiling: 95, safetyBufferMin: 3, failLimit: 3 },
        idlePollMin: 10,
        permissionModes: [{ id: 'bypassPermissions', label: '⚠ bypassPermissions', detail: 'everything' }],
        projectName: 'AgentFarm', agentName: 'developer', rounds: []
    };
    const CAMP = {
        id: 'sc-3', project: 'p', agent: 'a1', status: 'running', rounds: 9, engine: 'claude',
        lastAction: 'start', lastRule: 'has-room', lastAt: 1, lastWhy: 'slot-2 has the most room'
    };

    // ‼️ SHORTHAND WITHOUT A PANEL IS JUST A WORD NOBODY CAN LOOK UP. WAITING and
    // SLEEPING were the same picture to a reader who did not already know that
    // one is between rounds and the other is sitting out a quota wall.
    paint(Object.assign({}, base, { campaign: CAMP, running: false }));
    const waiting = html();
    ok('‼️ X-196: WAITING says what it means, rather than being a word on its own',
        waiting.includes('>WAITING<')
        && waiting.includes('Between rounds: nothing is on the board and nothing is in the way'));

    paint(Object.assign({}, base, {
        campaign: { ...CAMP, lastAction: 'sleep', wakeAt: 4102444800000 }, running: false
    }));
    const sleeping = html();
    ok('…and SLEEPING is told apart from it by the one fact that separates them: the clock',
        sleeping.includes('>SLEEPING<')
        && sleeping.includes('sitting the wall out')
        && sleeping.includes('wakes '));
    ok('…and says it needs no pressing, which is what a reader at midnight is asking',
        sleeping.includes('standing, not stopped'));

    paint(Object.assign({}, base, { campaign: null }));
    ok('even OFF answers, instead of leaving the reader to press something to find out',
        html().includes('>OFF<') && html().includes('takes the next item off a project backlog'));

    // ‼️ THE FORM'S EXPLANATIONS ARE AFTips, NOT `title` ATTRIBUTES, and every
    // box that can be left empty says what is in force while it is.
    paint(Object.assign({}, base, { campaign: null }));
    getEl('s-new').listeners.click();
    const form = html();
    ok('‼️ X-196: the form carries no multi-sentence native tooltip any more',
        !form.includes('title="Barren rounds IN A ROW')
        && !form.includes('title="Five-hour percentage at or above which'));
    ok('…the same words are an AFTip instead, where they can be read and scrolled',
        form.includes('Barren rounds IN A ROW that switch the campaign off'));
    ok('‼️ MIRROR — an empty box says WHICH figure is in force and where it comes from',
        form.includes("Now: 95% — the setting's default, because this box is empty")
        && form.includes("Now: 3 min — the setting's default, because this box is empty"));
    ok('…and the engine box says whether accounts rotate at all, which is what it decides',
        form.includes('Now: no engine named, so every round runs on the main sign-in'));

    // Every column defined once, on its own `th`; every cell a figure.
    paint(Object.assign({}, base, {
        campaign: CAMP, running: true,
        rounds: [
            { id: 'r1', title: 'Sentry R1', status: 'done', createdAt: 1000, endedAt: 1000 + 95 * 60000, account: '' },
            { id: 'r2', title: 'Sentry R2', status: 'running', createdAt: Date.now() - 60000, endedAt: null, account: '' }
        ]
    }));
    const tbl = html();
    ok('‼️ X-196: Status, Opened and Took are DEFINED, once, on their own th',
        tbl.includes('<th title="Where the round&#039;s own task row got to')
        || tbl.includes('<th title="Where the round\'s own task row got to'));
    ok('…Opened and Took too, so no column has to be inferred from its examples',
        tbl.includes('which is the moment the campaign decided on it')
        && tbl.includes('Wall-clock minutes from the row being opened'));
    ok('‼️ a thin cell is a bug: Took carries the figures the row already implies',
        tbl.includes('took: 1h 35m') && tbl.includes('ended: '));
    ok('…and a round still on the board says so rather than drawing a stale figure',
        tbl.includes('Not finished') && tbl.includes('running for: '));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
