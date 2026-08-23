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
    rounds: [
        {
            n: 1, thought: 'split the work', action: 'delegate', plannerCostUSD: 0.11, plannerTokens: 5000, at: 1000,
            steps: [
                { id: 's1', round: 1, agentId: 'a1', agentName: 'coder', title: 'fix parser', prompt: 'p', status: 'done', costUSD: 0.3, tokens: 12000, outputFile: 'D:/out/s1.md' },
                { id: 's2', round: 1, agentId: 'a2', agentName: 'reviewer', title: 'review', prompt: 'p', readonly: true, status: 'failed', note: 'agent said no' }
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
        AFCharts: {
            esc: (s) => String(s),
            fmtTok: (n) => (n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n)),
            fmtTokW(n, w) { return this.fmtTok(n || 0) + (w > 0 ? ' [w' + this.fmtTok(Math.round(w)) + ']' : ''); },
            fmtTokWText(n, w) { return this.fmtTok(n || 0) + (w > 0 ? ' (w' + this.fmtTok(Math.round(w)) + ')' : ''); },
            WEIGHTED_TIP: 'weighted',
            fmtUSD: (v) => '$' + v.toFixed(2)
        },
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
    setTimeout: () => 0, clearTimeout: () => { }, console, Date
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
ok('team chips carry the delegation permissions when one was set',
    html().includes('title="delegation permissions — what this member may do without stopping to ask">acceptEdits'));

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
getEl('f-approval').value = 'each-round';
getEl('f-start').listeners.click();
const created = posted.find(p => p.type === 'create');
ok('Start posts the assembled form', created && created.input.goal === 'Ship the docs site'
    && created.input.leadAgentId === 'a0' && created.input.maxCostUSD === '3'
    && created.input.team.length === 1 && created.input.team[0].agentId === 'a1' && created.input.team[0].role === 'builder');
ok('planner-model override rides along', created && created.input.plannerModel === 'opus');

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
ok('Advanced opens and gives the pool, the limits and the engines back',
    html().includes('id="f-lead"') && html().includes('id="lim-maxCostUSD"') && html().includes('id="f-engine"'));
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
// The row is drawn FROM `form`, so an empty box here is the proof that
// narrowing wrote the drop back rather than only hiding it: a value still held
// would come back as a `selected` option or as the "not in this catalog" one.
ok('‼️ moving that row to an engine with neither drops both rather than launching them',
    !mdBox(1).includes('>opus<') && !mdBox(1).includes('not in this catalog')
    && efBox(1).includes('— no effort —') && !efBox(1).includes(' selected'));
getEl('en-1').value = 'opencode';
getEl('en-1').listeners.change();
getEl('en-1').value = '';
getEl('f-engine').value = 'opencode';
getEl('f-engine').listeners.change();
ok('‼️ the mission-wide engine reaches every member that states none of its own',
    mdBox(1).includes('opencode/grok-code'));
getEl('f-engine').value = '';
getEl('f-engine').listeners.change();
ok('…and back: a member on Claude is offered Claude\'s models and its efforts again',
    mdBox(1).includes('>opus<') && mdBox(1).includes('>haiku<') && html().includes('>high<'));
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
ok('planner transcript link renders when the session is indexed', html().includes('planner transcript'));
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
