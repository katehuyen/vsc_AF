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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
