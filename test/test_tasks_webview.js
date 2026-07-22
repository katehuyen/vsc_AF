// Tasks page webview: section shell (Board / Automations / Reusables /
// Analytics), the load strip, row-action routing to host messages, the
// focus message from the openBoard alias, and the global-nav contract
// (Tasks hides its own button, the other four global pages show).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const code = fs.readFileSync(path.resolve(__dirname, '../media/pageHeader.js'), 'utf8')
    + '\n' + fs.readFileSync(path.resolve(__dirname, '../media/tasksPage.js'), 'utf8');

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

const NOW = Date.now();
const task = (over) => ({
    id: 't1', title: 'weekly digest', agentName: 'psikolog', mode: 'headless',
    status: 'queued', detail: '', when: NOW - 60000, hasOutput: false, ...over
});
const DATA = {
    generatedAt: NOW,
    section: undefined,
    board: {
        inbox: [task({ id: 't1' })],
        parked: [task({ id: 't2', title: 'parked job', detail: 'concurrency' })],
        running: [task({ id: 't3', title: 'live run', status: 'running', durMin: 4 })],
        waiting: [{
            kind: 'permission', title: 'needs a permission', detail: 'Bash wants to run x',
            ref: { transcriptPath: 'D:/tr/s1.jsonl', sessionId: 'S1' }
        }],
        done: [
            task({ id: 't4', title: 'done job', status: 'done', durMin: 7, hasOutput: true, outputFile: 'D:/out/t4.md' }),
            task({ id: 't5', title: 'broken job', status: 'failed' })
        ]
    },
    load: {
        global: { running: 2, limit: 2 },
        perAgentLimit: 1,
        agents: [
            { id: 'a1', name: 'psikolog', queued: 1, running: 1 },
            { id: 'a2', name: 'developer', queued: 0, running: 0 }
        ]
    },
    automations: {
        triggers: [
            {
                id: 'tr1', title: 'Inbox factory', type: 'watch', src: 'watch: …/inbox', target: 'task → psikolog',
                enabled: true, armed: false, debounceSec: 5, cooldownSec: 60, maxPerHour: 4,
                fireCount: 12, lastFiredAt: NOW - 3600e3, stat: 'fired 12× • 7d: 3✓/1✗', alwaysFails: false
            },
            {
                id: 'tr2', title: 'Deploy hook', type: 'webhook', src: 'webhook: /trigger/…abc123', target: 'workflow',
                enabled: false, armed: true, debounceSec: 0, cooldownSec: 0, maxPerHour: 0,
                fireCount: 0, alwaysFails: false
            }
        ],
        schedules: [
            {
                id: 's1', title: 'daily digest', agentName: 'psikolog', mode: 'headless',
                when: 'daily 09:00', kind: 'daily', missed: 'run', enabled: true, nextAt: NOW + 3600e3
            },
            {
                id: 's2', title: 'weekly report', agentName: 'developer', mode: 'headless',
                when: 'Mon 08:30', kind: 'weekly', missed: 'skip', enabled: false, nextAt: undefined
            }
        ]
    },
    reusables: {
        templates: [{ id: 'tp1', title: 'triage inbox', agentName: 'psikolog', mode: 'headless', prompt: 'triage the inbox now' }],
        workflows: [{
            id: 'w1', title: 'publish pipeline',
            steps: [
                { title: 'draft', agentName: 'psikolog', parallel: false, kind: 'headless' },
                { title: 'render', agentName: 'developer', parallel: true, kind: 'media' }
            ]
        }]
    },
    analytics: {
        kpis: { runs30d: 40, done: 30, failed: 8, retries: 3, successRate: 30 / 38, medianMs: 5 * 60000 },
        agents: [{
            agentId: 'a1', agentName: 'psikolog', total: 25, done: 20, failed: 4, cancelled: 1,
            successRate: 20 / 24, medianDurationMs: 4 * 60000, retries: 2, verifyPass: 1, verifyFail: 0
        }],
        families: [{ title: 'weekly digest', source: 'schedule', runs: 9, failed: 9, alwaysFails: true, agents: 'psikolog' }],
        alerts: [{ severity: 'warning', who: 'psikolog', message: 'Tasks are failing more than succeeding' }],
        daily: Array.from({ length: 30 }, (_, i) => ({ day: `2026-07-${String(i + 1).padStart(2, '0')}`, done: i % 3, failed: i % 2 })),
        forecast: {
            days: 7, totalScheduledRuns: 5, estBusyMs: 42 * 60000,
            upcoming: [{ ts: NOW + 7200e3, title: 'daily digest', agentName: 'psikolog', kind: 'daily', medianMs: 4 * 60000, successRate: 0.8 }]
        },
        queue: { count: 2, etaMs: 11 * 60000, known: 1 }
    }
};

const sandbox = {
    acquireVsCodeApi: () => ({
        postMessage: (m) => posted.push(m),
        getState: () => undefined,
        setState: () => { }
    }),
    window: {
        AFCharts: {
            esc: (s) => String(s),
            fmtUSD: (v) => '$' + Number(v).toFixed(2),
            stackedBars: (days, series) => `<svg data-bars="${days.length}x${series.length}"></svg>`
        },
        __DATA__: DATA,
        addEventListener: (ev, fn) => { if (ev === 'message') { msgHandler = fn; } }
    },
    document: {
        getElementById: getEl,
        querySelectorAll: (sel) => {
            const m = /\[data-([a-z]+)\]/.exec(sel);
            if (!m || sel.startsWith('.kb-card')) { return []; } // dnd + dblclick wiring skipped in the shim
            const attr = m[1];
            const list = [];
            const re = new RegExp(`data-${attr}="([^"]*)"`, 'g');
            let match;
            while ((match = re.exec(getEl('app')._html))) {
                const el = { dataset: { [attr]: match[1] } };
                el.addEventListener = (_e, fn) => { el._click = fn; };
                list.push(el);
            }
            wired[attr] = list;
            return list;
        }
    },
    setTimeout: () => 0, clearTimeout: () => { }, console, Date
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox); // render()

const html = () => getEl('app')._html;
const clickWired = (attr, value) => {
    const el = (wired[attr] || []).find(e => e.dataset[attr] === value);
    ok(`wired [data-${attr}="${value}"] exists`, !!el);
    if (el) { el._click({ stopPropagation() { } }); }
};

// ---------- board section (default) ----------
ok('board renders all five columns', ['📥 Inbox', '🕓 Parked', '⚙️ Running', '🛡️ Needs Approval', '🏁 Done']
    .every(h => html().includes(h)));
ok('cards land in their columns', html().includes('weekly digest') && html().includes('parked job')
    && html().includes('live run') && html().includes('broken job'));
ok('load strip shows the fleet limit and marks it hot', html().includes('farm <b>2</b>/2')
    && /ld-chip global hot/.test(html()));
ok('busy agent chip with queue count, idle agents folded', html().includes('psikolog <b>1</b>/1')
    && html().includes('1 idle agent'));
ok('NL command bar renders', html().includes('id="cmd"') && html().includes('id="cmdgo"'));
ok('waiting card offers terminal + open session', html().includes('data-termsid="S1"')
    && html().includes('data-session="D:/tr/s1.jsonl"'));

// global-nav contract: the four other global pages show; no Tasks button (own page)
ok('global nav shows the other pages', ['data-afnav="dashboard"', 'data-afnav="timeline"',
    'data-afnav="missions"', 'data-afnav="toolbox"'].every(a => html().includes(a)));
ok('own page button hidden', !html().includes('data-afnav="tasks"'));

posted = [];
clickWired('cancel', 't3');
ok('cancel posts cancel with the task id', posted[0] && posted[0].type === 'cancel' && posted[0].taskId === 't3');
posted = [];
clickWired('del', 't5');
ok('✕ posts delete with the task id', posted[0] && posted[0].type === 'delete' && posted[0].taskId === 't5');
posted = [];
getEl('cmd').value = 'run the digest tomorrow at 9';
getEl('cmdgo').listeners.click();
ok('command bar posts the typed command', posted[0] && posted[0].type === 'command'
    && posted[0].text === 'run the digest tomorrow at 9');

// ---------- automations ----------
clickWired('sec', 'automations');
ok('triggers table renders with source → target', html().includes('Inbox factory')
    && html().includes('watch: …/inbox') && html().includes('task → psikolog'));
ok('armed=false shows the path-missing badge', html().includes('path missing'));
ok('reliability scorecard shows', html().includes('fired 12× • 7d: 3✓/1✗'));
ok('schedules show next run + missed policy', html().includes('daily digest')
    && html().includes('missed: run') && html().includes('daily 09:00'));
ok('disabled schedule has no next run', /weekly report[\s\S]*?—/.test(html()));
posted = [];
clickWired('sched', 'toggle:s1');
ok('schedule toggle posts sched/toggle', posted[0] && posted[0].type === 'sched'
    && posted[0].act === 'toggle' && posted[0].id === 's1');
posted = [];
clickWired('sched', 'run:s1');
ok('run now posts sched/run', posted[0] && posted[0].type === 'sched' && posted[0].act === 'run');
posted = [];
clickWired('trig', 'fire:tr1');
ok('fire posts trig/fire', posted[0] && posted[0].type === 'trig' && posted[0].act === 'fire' && posted[0].id === 'tr1');
posted = [];
clickWired('add', 'sched-add');
ok('+ Schedule posts sched-add', posted[0] && posted[0].type === 'sched-add');

// ---------- reusables ----------
clickWired('sec', 'reusables');
ok('template row renders with prompt preview', html().includes('triage inbox')
    && html().includes('triage the inbox now'));
ok('workflow card lists steps and marks parallel', html().includes('publish pipeline')
    && html().includes('∥ render'));
posted = [];
clickWired('tpl', 'run:tp1');
ok('template run posts tpl/run', posted[0] && posted[0].type === 'tpl' && posted[0].act === 'run' && posted[0].id === 'tp1');
posted = [];
clickWired('wf', 'run:w1');
ok('workflow run posts wf/run', posted[0] && posted[0].type === 'wf' && posted[0].act === 'run' && posted[0].id === 'w1');

// ---------- analytics ----------
clickWired('sec', 'analytics');
ok('KPI tiles render', html().includes('Runs · 30d') && html().includes('40')
    && html().includes('Success rate') && html().includes('79%'));
ok('alert renders', html().includes('Tasks are failing more than succeeding'));
ok('throughput chart got 30 daily buckets', html().includes('data-bars="30x2"'));
ok('agent scorecard row renders', html().includes('psikolog') && html().includes('20✓ / 4✗ / 1⊘'));
ok('always-failing family badged', html().includes('always fails'));
ok('forecast digest lists the upcoming run', html().includes('5 scheduled run(s)')
    && html().includes('daily digest'));
posted = [];
clickWired('open', 'open-forecast');
ok('Open full forecast posts open-forecast', posted[0] && posted[0].type === 'open-forecast');
posted = [];
clickWired('open', 'open-history');
ok('Task history posts open-history', posted[0] && posted[0].type === 'open-history');

// ---------- host messages ----------
msgHandler({ data: { type: 'focus', section: 'board' } });
ok('focus message switches back to the board', html().includes('id="cmd"'));
msgHandler({ data: { type: 'data', data: { ...DATA, board: { ...DATA.board, running: [] } } } });
ok('data message re-renders in place', html().includes('⚙️ Running') && !html().includes('live run'));

console.log(`${pass} passed, ${fail} failed`);
if (fail) { process.exit(1); }
