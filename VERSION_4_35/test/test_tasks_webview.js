// Tasks page webview (media/tasks.js) — runs the real page script in a vm sandbox
// (like test_settingsops / test_airtable_toolbox) and checks all four tabs render
// and their buttons post the right messages. Catches a typo in the HTML, a wrong
// message name, or a broken tab without needing a live VS Code.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const code = fs.readFileSync(path.resolve(__dirname, '../media/pageHeader.js'), 'utf8') + '\n'
    + fs.readFileSync(path.resolve(__dirname, '../media/tasks.js'), 'utf8');

const DATA = {
    generatedAt: Date.now(),
    board: {
        inbox: [{ id: 't1', title: 'Do X', agentName: 'dev', mode: 'headless', status: 'queued', when: 0, hasOutput: false }],
        parked: [{ id: 't2', title: 'Parked Y', agentName: 'dev', mode: 'headless', status: 'queued', when: 0, deferredReason: 'quota', hasOutput: false }],
        running: [{ id: 't3', title: 'Running Z', agentName: 'psi', mode: 'headless', status: 'running', when: 0, durMin: 5, hasOutput: true, outputFile: '/o.txt' }],
        waiting: [{ urgency: 0, kind: 'browser-approval', agentName: 'dev', title: 'Approve nav', detail: 'to example.com', ts: 0, ref: { approvalId: 'ap1' }, actions: [] }],
        done: [{ id: 't4', title: 'Done W', agentName: 'dev', mode: 'headless', status: 'done', when: 0, verified: 'pass', hasOutput: true, outputFile: '/d.txt' }]
    },
    automations: {
        triggers: [{ id: 'tr1', title: 'Inbox factory', type: 'watch', target: 'watch W:/in', enabled: true, reliability: '12 fires', fireCount: 12, lastFiredAt: 0 }],
        schedules: [{ id: 'sc1', title: 'Morning brief', agent: 'dev', when: 'daily 08:00', next: Date.now() + 3600000, enabled: true, missed: 'run' }]
    },
    reusables: {
        templates: [{ id: 'tp1', title: 'Test run', agent: 'dev', mode: 'headless' }],
        workflows: [{ id: 'wf1', title: 'Pipeline', steps: 3 }]
    },
    analytics: {
        agents: [{ agentName: 'dev', total: 20, done: 18, failed: 2, successRate: 0.9, medianMs: 120000, queued: 1, running: 1, mediaCost: 0.5 }],
        totals: { queued: 2, running: 1, done30d: 18, failed30d: 2 }
    }
};

const posted = [];
const wired = {};
const els = {};
function getEl(id) {
    if (!els[id]) {
        els[id] = {
            id, listeners: {}, value: '', _html: '',
            addEventListener(e, f) { this.listeners[e] = f; },
            set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; },
            focus() { }, setSelectionRange() { }
        };
    }
    return els[id];
}
function parseEls(html, key) {
    const out = [];
    const tagRe = new RegExp(`<[a-z]+[^>]*\\bdata-${key}="[^"]*"[^>]*>`, 'g');
    let t;
    while ((t = tagRe.exec(html))) {
        const ds = {}; let a; const aRe = /data-([a-z]+)="([^"]*)"/g;
        while ((a = aRe.exec(t[0]))) { ds[a[1]] = a[2]; }
        out.push({ dataset: ds, addEventListener(_e, f) { this._fn = f; } });
    }
    return out;
}
const sandbox = {
    acquireVsCodeApi: () => ({ postMessage: m => posted.push(m), getState() { }, setState() { } }),
    window: { AFCharts: { esc: s => String(s === undefined || s === null ? '' : s) }, __DATA__: DATA, addEventListener() { } },
    document: {
        getElementById: getEl,
        querySelector: () => null,
        querySelectorAll: (sel) => {
            const m = /^\[data-(tab|do|approve|reject)\]$/.exec(sel);
            if (!m) { return []; }
            const list = parseEls(getEl('app')._html, m[1]);
            wired[m[1]] = list;
            return list;
        }
    },
    setTimeout: () => 0, clearTimeout: () => { }, console, Date
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox); // render() + wire()

const html = () => getEl('app')._html;
const clickTab = (id) => { const b = wired.tab.find(e => e.dataset.tab === id); b._fn(); };
const clickDo = (pred) => { const b = wired.do.find(pred); b._fn(); return b; };

// ---- board tab (default) ----
ok('board renders all five columns', ['Inbox', 'Parked', 'Running', 'Needs You', 'Done'].every(c => html().includes(c)));
ok('board shows task cards', html().includes('Do X') && html().includes('Running Z') && html().includes('Done W'));
ok('NL command bar present', html().includes('id="nl"') && html().includes('id="nlgo"'));
ok('queued task has Start (move→running)', wired.do.some(e => e.dataset.do === 'move' && e.dataset.to === 'running' && e.dataset.id === 't1'));
ok('approval renders Run/Reject', html().includes('data-approve="ap1"') && html().includes('data-reject="ap1"'));

posted.length = 0;
clickDo(e => e.dataset.do === 'move' && e.dataset.to === 'running');
ok('Start posts move→running with id', posted[0] && posted[0].type === 'move' && posted[0].to === 'running' && posted[0].id === 't1');

posted.length = 0;
wired.approve[0]._fn();
ok('Approve posts approve ok:true', posted[0] && posted[0].type === 'approve' && posted[0].approvalId === 'ap1' && posted[0].ok === true);
posted.length = 0;
wired.reject[0]._fn();
ok('Reject posts approve ok:false', posted[0] && posted[0].type === 'approve' && posted[0].approvalId === 'ap1' && posted[0].ok === false);

// NL bar
posted.length = 0;
getEl('nl').value = 'ask dev to run tests';
getEl('nlgo').listeners.click();
ok('NL bar posts nlcommand', posted[0] && posted[0].type === 'nlcommand' && posted[0].text === 'ask dev to run tests');

posted.length = 0;
clickDo(e => e.dataset.do === 'add-task');
ok('+ Task posts add-task', posted[0] && posted[0].type === 'add-task');

// ---- automations tab ----
clickTab('automations');
ok('automations renders triggers + schedules', html().includes('Inbox factory') && html().includes('Morning brief') && html().includes('Triggers') && html().includes('Schedules'));
posted.length = 0;
clickDo(e => e.dataset.do === 'trigger-fire' && e.dataset.id === 'tr1');
ok('Fire posts trigger-fire', posted[0] && posted[0].type === 'trigger-fire' && posted[0].id === 'tr1');
posted.length = 0;
clickDo(e => e.dataset.do === 'schedule-run' && e.dataset.id === 'sc1');
ok('Run now posts schedule-run', posted[0] && posted[0].type === 'schedule-run' && posted[0].id === 'sc1');
posted.length = 0;
clickDo(e => e.dataset.do === 'add-trigger');
ok('+ Trigger posts add-trigger', posted[0] && posted[0].type === 'add-trigger');

// ---- reusables tab ----
clickTab('reusables');
ok('reusables renders templates + workflows', html().includes('Test run') && html().includes('Pipeline') && html().includes('Templates') && html().includes('Workflows'));
posted.length = 0;
clickDo(e => e.dataset.do === 'template-run' && e.dataset.id === 'tp1');
ok('Template Run posts template-run', posted[0] && posted[0].type === 'template-run' && posted[0].id === 'tp1');
posted.length = 0;
clickDo(e => e.dataset.do === 'workflow-run' && e.dataset.id === 'wf1');
ok('Workflow Run posts workflow-run', posted[0] && posted[0].type === 'workflow-run' && posted[0].id === 'wf1');

// ---- analytics tab ----
clickTab('analytics');
ok('analytics renders totals tiles', html().includes('Queued') && html().includes('Running') && html().includes('Success (30d)'));
ok('analytics renders per-agent row with success %', html().includes('>dev<') && html().includes('90%'));
posted.length = 0;
clickDo(e => e.dataset.do === 'open-forecast');
ok('Forecast posts open-forecast', posted[0] && posted[0].type === 'open-forecast');

// ---- back to board keeps working (re-render) ----
clickTab('board');
ok('tab switch back to board re-renders', html().includes('Needs You') && html().includes('id="nl"'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
