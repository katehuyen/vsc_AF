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
let msgHandler = null;
const els = {};
function getEl(id) {
    if (!els[id]) {
        els[id] = {
            id, listeners: {}, style: {}, value: '', checked: false, _html: '',
            addEventListener(ev, fn) { this.listeners[ev] = fn; },
            focus() { },
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
        team: [{ agentId: 'a1', agentName: 'coder', role: 'implements' }, { agentId: 'a2', agentName: 'reviewer' }],
        workdir: 'D:/repo', limits: { maxRounds: 8, maxTasks: 12, maxCostUSD: 5, maxMinutes: 120, maxParallel: 2 },
        approvalMode: 'each-round', createdAt: 1
    }],
    runs: [RUN],
    agents: [{ id: 'a0', name: 'lead' }, { id: 'a1', name: 'coder' }, { id: 'a2', name: 'reviewer' }],
    defaults: { maxRounds: 8, maxTasks: 12, maxCostUSD: 5, maxMinutes: 120, maxParallel: 2 },
    pending: { questions: [], approvals: ['run1'] }
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
        addEventListener: (ev, fn) => { if (ev === 'message') { msgHandler = fn; } }
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
                                    : null;
            if (!spec) { return []; }
            const re = new RegExp(`${spec.attr}="([^"]*)"`, 'g');
            let m;
            while ((m = re.exec(app._html))) {
                const el = { dataset: { [spec.key]: m[1] } };
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
ok('team rows carry a model field with suggestions',
    html().includes('id="md-1"') && html().includes('list="modelopts"') && html().includes('id="modelopts"'));
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
    && html().includes('team: coder — implements, reviewer')
    && html().includes('limits: $5 · 8 rounds')
    && html().includes('delegations: 2 (1 failed)'));
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
