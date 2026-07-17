// Missions page webview: run list + detail (rounds, budget, waits), control
// routing (pause/cancel/approve/answer), the New Mission form round-trip and
// host messages (formError / created / folder / openForm).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const code = fs.readFileSync(path.resolve(__dirname, '../media/pageHeader.js'), 'utf8')
    + '\n' + fs.readFileSync(path.resolve(__dirname, '../media/missions.js'), 'utf8');

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
            n: 1, thought: 'split the work', action: 'delegate', plannerCostUSD: 0.11, at: 1000,
            steps: [
                { id: 's1', round: 1, agentId: 'a1', agentName: 'coder', title: 'fix parser', prompt: 'p', status: 'done', costUSD: 0.3, outputFile: 'D:/out/s1.md' },
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
        AFCharts: { esc: (s) => String(s) },
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
vm.createContext(sandbox);
vm.runInContext(code, sandbox); // render()

const html = () => getEl('app')._html;

// ---------- list + detail rendering ----------
ok('run list renders the mission row', html().includes('Parser mission') && html().includes('data-run="run1"'));
ok('newest run auto-selected → detail shown', html().includes('id="mdetail"') && html().includes('Fix the parser and prove it'));
ok('budget line shows spent/limit', html().includes('$1.25 / $5.00') && html().includes('2/8 rounds'));
ok('round card lists steps with status + note', html().includes('fix parser') && html().includes('agent said no'));
ok('readonly step badged', html().includes('read-only'));
ok('ask_user round shows Q and A', html().includes('which branch?') && html().includes('main'));
ok('pending approval renders the wait box', html().includes('needs your approval') && html().includes('id="d-approve"'));
ok('team chips carry roles', html().includes('coder — implements'));

// ---------- click routing ----------
posted = [];
getEl('d-approve').listeners.click();
ok('Approve posts approve with the run id', posted[0] && posted[0].type === 'approve' && posted[0].runId === 'run1');
posted = [];
getEl('d-cancel').listeners.click();
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
ok('question wait box renders with an answer field', html().includes('deploy too?') && html().includes('id="d-answer"'));
getEl('d-answer').value = 'no, just build';
posted = [];
getEl('d-send').listeners.click();
ok('Send posts the typed answer', posted[0] && posted[0].type === 'answer' && posted[0].text === 'no, just build');

// ---------- paused → Resume ----------
msgHandler({ data: { type: 'data', data: { ...DATA, runs: [{ ...RUN, status: 'paused', note: 'interrupted by window reload' }], pending: { questions: [], approvals: [] } } } });
ok('paused run offers Resume + shows the note', html().includes('id="d-resume"') && html().includes('interrupted by window reload'));
posted = [];
getEl('d-resume').listeners.click();
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
ok('finished run has no Pause/Cancel controls', !html().includes('id="d-cancel"') && !html().includes('id="d-pause"'));

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
getEl('d-pause').listeners.click();
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
    html().includes('id="d-unpause"') && html().includes('Pausing…') && html().includes('pausing — the current activity finishes first'));
ok('no plain Pause button while a pause is pending', !html().includes('id="d-pause"'));
posted = [];
getEl('d-unpause').listeners.click();
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
getEl('lg-toggle').listeners.click();
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
getEl('lv-toggle').listeners.click();
ok('collapsing live keeps the header chips but hides the rows',
    html().includes('Live activity') && !html().includes('turn end'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
