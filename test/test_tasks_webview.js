// Tasks control panel (media/tasksPage.js) rendered in a DOM shim.
//
// The page is built on one distinction: PLAN (every work DEFINITION, whatever
// its internal type) vs RUN (what those definitions actually did). These tests
// pin the management contract: everything manageable shows up in one table,
// every active filter is visible and removable, and nothing opens a mystery
// second page.
const path = require('path');
const fs = require('fs');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// afCtx.js is the right-click contract every row on this page publishes; the
// page calls into it while it renders, so it loads before the page does.
const code = fs.readFileSync(path.join(__dirname, '..', 'media', 'afFilters.js'), 'utf8')
    + '\n' + fs.readFileSync(path.join(__dirname, '..', 'media', 'afCtx.js'), 'utf8')
    + '\n' + fs.readFileSync(path.join(__dirname, '..', 'media', 'tasksPage.js'), 'utf8');
const createAfmsDom = require(path.join(__dirname, 'lib_afms_dom.js'));

// ---------------------------------------------------------------- DOM shim
let posted = [];
const onMessage = [];
let state = {};
const els = {};
const elCache = new Map();

function mkEl(tag, dataset, attrs) {
    const el = {
        tagName: tag.toUpperCase(), dataset, value: attrs.value, type: attrs.type || '',
        checked: 'checked' in attrs, indeterminate: false, hidden: 'hidden' in attrs,
        textContent: '', className: attrs.class || '',
        _listeners: {},
        addEventListener(ev, fn) { this._listeners[ev] = fn; },
        focus() { },
        setSelectionRange() { },
        click() { if (this._listeners.click) { this._listeners.click({ currentTarget: this, preventDefault() { } }); } },
        fire(ev, extra) { if (this._listeners[ev]) { this._listeners[ev](Object.assign({ currentTarget: this, preventDefault() { } }, extra)); } }
    };
    return el;
}
function getEl(id) {
    // NOTE: defined with defineProperty, not Object.assign — assign COPIES the
    // value a getter returns instead of the accessor itself, which would leave
    // innerHTML a dead plain property and the page silently unrendered.
    if (!els[id]) {
        const el = mkEl('div', {}, {});
        el.id = id;
        el._html = '';
        Object.defineProperty(el, 'innerHTML', {
            get() { return this._html; },
            set(v) { this._html = v; elCache.clear(); }
        });
        els[id] = el;
    }
    return els[id];
}
const html = () => getEl('app')._html;
const ms = createAfmsDom(html);

/** Parse the rendered HTML into shim elements matching a CSS-ish selector. */
function query(sel) {
    const idM = /^#([\w-]+)/.exec(sel);
    const cls = /\.([\w-]+)/.exec(sel);
    const attrEq = /\[data-([\w-]+)="([^"]*)"\]/.exec(sel);
    const attrAny = /\[data-([\w-]+)\]/.exec(sel);
    const tagM = /^([a-z]+)(?![\w-])/.exec(sel);
    const roleM = /\[role=([\w]+)\]/.exec(sel);
    const wantChecked = sel.includes(':checked');
    const out = [];
    // textarea is in the list because the New-task form's prompt box is one and
    // a shim that cannot see it makes the form untestable (U-9).
    const tags = html().match(/<(?:input|button|select|textarea|div|span|th|td|tr|label|a)\b[^>]*>/g) || [];
    for (const raw of tags) {
        const tag = /^<([a-z]+)/.exec(raw)[1];
        if (idM && !raw.includes(`id="${idM[1]}"`)) { continue; }
        if (tagM && tag !== tagM[1]) { continue; }
        if (cls && !new RegExp(`class="[^"]*\\b${cls[1]}\\b`).test(raw)) { continue; }
        if (attrEq && !raw.includes(`data-${attrEq[1]}="${attrEq[2]}"`)) { continue; }
        if (attrAny && !attrEq && !new RegExp(`data-${attrAny[1]}[="\\s>]`).test(raw)) { continue; }
        if (roleM && !raw.includes(`role="${roleM[1]}"`)) { continue; }
        let el = elCache.get(raw);
        if (!el) {
            const dataset = {};
            let d;
            const dre = /data-([\w-]+)(?:="([^"]*)")?/g;
            while ((d = dre.exec(raw))) { dataset[d[1]] = d[2] === undefined ? '' : d[2]; }
            const attrs = {};
            let a;
            const are = /\b(value|type|class|id)="([^"]*)"/g;
            while ((a = are.exec(raw))) { attrs[a[1]] = a[2]; }
            if (/\bchecked\b/.test(raw)) { attrs.checked = true; }
            if (/\bhidden\b/.test(raw)) { attrs.hidden = true; }
            el = mkEl(tag, dataset, attrs);
            if (attrs.id) { els[attrs.id] = el; }
            elCache.set(raw, el);
        }
        if (wantChecked && !el.checked) { continue; }
        out.push(el);
    }
    return out;
}

const sandbox = {
    acquireVsCodeApi: () => ({
        postMessage: (m) => posted.push(m),
        getState: () => state,
        setState: (s) => { state = s; }
    }),
    window: {
        AFCharts: { esc: (s) => String(s == null ? '' : s), fmtUSD: (v) => '$' + Number(v).toFixed(2) },
        AFHeader: { html: (o) => `<header data-page="${o.page}">${o.title}</header>`, wire: () => { } },
        __DATA__: null,
        // The right-click relay arrives as a window message; the page listens
        // for it once, at module scope, so the test has to hold that listener
        // to be able to fire a menu pick at all.
        addEventListener: (ev, fn) => { if (ev === 'message') { onMessage.push(fn); } }
    },
    document: {
        getElementById: (id) => els[id] || (id === 'app' ? getEl('app') : (query(`#${id}`)[0] || null)),
        querySelectorAll: query,
        // the shared multi-pick control has its own shim (lib_afms_dom.js)
        querySelector: (s) => (s.indexOf('[data-afms') === 0 ? ms.querySelector(s) : query(s)[0] || null),
        get hidden() { return false; },
        get activeElement() { return null; }
    },
    setTimeout: () => 0, clearTimeout: () => { }, setInterval: () => 0, clearInterval: () => { },
    console, Date, Math, JSON, String, Number, Object, Array, RegExp, Set, Map, isNaN, parseInt, parseFloat
};
sandbox.globalThis = sandbox;

const NOW = Date.now();
const DATA = {
    generatedAt: NOW,
    tab: 'plan',
    gate: {
        paused: false, pausedUntil: undefined, pauseReason: '',
        quietFrom: '23:30', quietTo: '04:30', blocked: false, blockReason: ''
    },
    summary: {
        running: 1, runLimit: 2, queued: 2, needsYou: 1,
        plansOn: 3, plansSwitchable: 4, doneToday: 4, failedToday: 1,
        cost7d: 18.4, savedWakeups7d: 23, issues: 2
    },
    agents: ['manager', 'genel', 'basit'],
    perAgentLimit: 1,
    // U-9: everything the page's own New-task form offers. Same vocabulary as
    // the session launcher (core/launch.ts) — the point of the item is that a
    // task can be stated as precisely as a session can.
    launch: {
        models: [
            { id: '', label: 'Default', detail: 'the agent\'s own model setting' },
            { id: 'haiku', label: 'haiku', detail: 'passed as --model' },
            { id: 'opus', label: 'opus', detail: 'passed as --model' }
        ],
        efforts: [
            { id: '', label: 'Default', detail: 'no --effort flag' },
            { id: 'low', label: 'low', detail: 'shortest reasoning' },
            { id: 'xhigh', label: 'xhigh', detail: 'deep reasoning' }
        ],
        permissions: [
            { id: '', label: 'Default', detail: 'asks before acting' },
            { id: 'acceptEdits', label: 'acceptEdits', detail: 'file edits auto-approved' }
        ],
        defaults: { model: '', effort: '', permissionMode: '' },
        clis: [{ name: 'codex', detail: 'codex exec' }],
        projects: [{ id: 'prj_1', name: 'AgentFarm', icon: '◧' }, { id: 'prj_2', name: 'TalkScribe', icon: '' }],
        activeProjectId: 'prj_1'
    },
    plan: [
        {
            id: 's1', kind: 'schedule', title: 'AGENT_AREA batch',
            when: 'every day 05:00', nextAt: NOW + 3600e3, agentName: 'manager', model: 'opus',
            guard: 'files in …/00_INPUT (skip _LOG_.md)', hasGuard: true,
            switchable: true, enabled: true,
            cost7d: 12.3, runs7d: 3, skipped7d: 4, skipRate: 57,
            lastRunAt: NOW - 7200e3, lastNote: '2 files waiting', issues: [],
            detail: { prompt: 'apply the filing duty', target: 'runs on manager · headless', timing: 'every day 05:00 · missed → run', steps: [], missed: 'run' }
        },
        {
            id: 's2', kind: 'schedule', title: 'AI daily scan',
            when: 'every day 06:00', agentName: 'manager', model: '',
            guard: '', hasGuard: false, switchable: true, enabled: false,
            cost7d: 0, runs7d: 0, skipped7d: 0, skipRate: 0,
            lastNote: '', issues: [],
            detail: { prompt: 'scan AI news', target: 'runs on manager · headless', timing: 'every day 06:00 · missed → skip', steps: [], missed: 'skip' }
        },
        {
            id: 't1', kind: 'trigger', title: 'Media watch',
            when: 'on change · …/02_MEDIALASTIR', agentName: 'manager', model: 'opus',
            guard: '', hasGuard: false, switchable: true, enabled: true,
            cost7d: 70.9, runs7d: 23, skipped7d: 0, skipRate: 0,
            lastRunAt: NOW - 3600e3, lastNote: 'no files waiting',
            issues: ['no-guard', 'path-missing'],
            detail: { prompt: 'file the media', target: 'runs on manager', timing: 'debounce 60s · cooldown 300s · max 6/h', steps: [], missed: '' }
        },
        {
            id: 'w1', kind: 'workflow', title: 'publish pipeline',
            when: 'when you run it (or a trigger does)', agentName: '', model: '',
            guard: '', hasGuard: false, switchable: false, enabled: true,
            cost7d: 0, runs7d: 0, skipped7d: 0, skipRate: 0,
            lastNote: '2 step(s)', issues: [],
            detail: { prompt: '', target: '2 step chain', timing: '', steps: ['1. render ∥ — genel', '2. post — basit'], missed: '' }
        },
        {
            id: 'tp1', kind: 'template', title: 'triage inbox',
            when: 'when you run it', agentName: 'genel', model: '',
            guard: '', hasGuard: false, switchable: false, enabled: true,
            cost7d: 0, runs7d: 0, skipped7d: 0, skipRate: 0,
            lastNote: '', issues: [],
            detail: { prompt: 'triage the inbox now', target: 'runs on genel · headless', timing: '', steps: [], missed: '' }
        }
    ],
    runs: [
        {
            id: 'r1', title: 'live run', agentName: 'manager', mode: 'headless', status: 'running',
            source: 'AGENT_AREA batch', sourceKind: 'schedule', when: NOW - 300e3, durMin: 5,
            detail: '', costUSD: 1.2, hasOutput: false, prompt: 'do the batch'
        },
        {
            id: 'r2', title: 'parked run', agentName: 'genel', mode: 'headless', status: 'parked',
            source: 'you', sourceKind: 'manual', when: NOW - 600e3,
            detail: 'agent busy (genel)', hasOutput: false, prompt: 'something'
        },
        {
            id: 'r3', title: 'finished run', agentName: 'basit', mode: 'headless', status: 'done',
            source: 'repo backup', sourceKind: 'schedule', when: NOW - 7200e3, durMin: 1,
            detail: '', costUSD: 0.22, hasOutput: true, outputFile: 'D:/out/r3.md',
            sessionFile: 'D:/t/s.jsonl', prompt: 'commit the repo'
        },
        {
            id: 'r4', title: 'broken run', agentName: 'manager', mode: 'headless', status: 'failed',
            source: 'Media watch', sourceKind: 'trigger', when: NOW - 9200e3, durMin: 2,
            detail: '', hasOutput: false, prompt: 'file the media'
        }
    ]
};
sandbox.window.__DATA__ = DATA;

vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const clickData = (attr, value) => {
    const el = query(`[data-${attr}="${value}"]`)[0];
    ok(`control [data-${attr}="${value}"] exists`, !!el);
    if (el) { el.click(); }
    return el;
};
/** `data-resetview` is a valueless attribute, so it needs its own lookup. */
const resetView = () => {
    const el = query('[data-resetview]')[0];
    ok('a reset control is present while filters are active', !!el);
    if (el) { el.click(); }
};

// ---------------------------------------------------- control header (gate)
ok('page announces the automation gate', html().includes('Automation'));
ok('an open gate reads as running', html().includes('>running<'));
ok('quiet hours are shown on the control', html().includes('Quiet 23:30–04:30'));
ok('running vs limit is in the header', html().includes('<b>1</b>/2 running'));
ok('queued count shows', html().includes('<b>2</b> queued'));
ok('needs-you is flagged hot', /class="stat hot"[^>]*>🛡️ <b>1<\/b> need you/.test(html()));
ok('switched-on count shows plans, not runs', html().includes('<b>3</b>/4 switched on'));
ok('7-day automation cost is in the header', html().includes('$18</b>/7d') || html().includes('$18.40'));
ok('saved wake-ups are reported', html().includes('<b>23</b> saved'));
ok('rows needing attention are counted', html().includes('<b>2</b> need attention'));

posted = [];
clickData('gate', 'pause');
ok('Pause all posts gate/pause', posted[0] && posted[0].type === 'gate' && posted[0].act === 'pause');
posted = [];
clickData('gate', 'pause-for:480');
ok('a timed pause carries its minutes', posted[0] && posted[0].act === 'pause-for' && posted[0].text === '480');
posted = [];
clickData('gate', 'quiet');
ok('quiet hours button posts gate/quiet', posted[0] && posted[0].act === 'quiet');

// ------------------------------------------------------------------- tabs
ok('there are exactly two tabs', query('[data-tab]').length === 2);
ok('PLAN is the default tab', /class="tab on" data-tab="plan"/.test(html()));
ok('tab counts come from the data', html().includes('📅 Plan <span class="tab-n">5</span>')
    && html().includes('▶ Runs <span class="tab-n">4</span>'));
ok('analytics is a link OUT, not a tab', html().includes('data-open="open-analytics"')
    && !/data-tab="analytics"/.test(html()));

// ------------------------------------------------------- PLAN: one table
ok('a schedule appears', html().includes('AGENT_AREA batch'));
ok('a trigger appears in the SAME table', html().includes('Media watch'));
ok('a workflow appears too', html().includes('publish pipeline'));
ok('and a template', html().includes('triage inbox'));
ok('each kind carries its icon', html().includes('⏰') && html().includes('⚡')
    && html().includes('🔗') && html().includes('📋'));
ok('rows are grouped by kind by default', html().includes('class="grouphead"')
    && html().includes('Schedules') && html().includes('Triggers'));
ok('a schedule shows when it next runs', /next (tomorrow |\w{3} )?\d\d:\d\d/.test(html()));
ok('the model override is badged', /class="badge">opus</.test(html()));
ok('no model reads as default', html().includes('>default<'));
ok('a guard is shown with what it saved', html().includes('🛡 files in …/00_INPUT')
    && html().includes('saved 4 wake-up(s)'));
ok('problems are badged on the row', html().includes('>no guard<') && html().includes('>path missing<'));
ok('per-row 7d cost is shown', html().includes('$70.90') || html().includes('$71'));
ok('switchable rows get a real switch', /class="sw on"/.test(html()) && /class="sw off"/.test(html()));
ok('non-switchable rows say so instead of faking a switch',
    (html().match(/>manual</g) || []).length >= 2);
ok('only switchable rows get a checkbox', query('.rowsel').length === 3);

// ------------------------------------------------------ PLAN: row actions
posted = [];
query('[data-plan="toggle"]')[0].click();
ok('the switch posts plan/toggle with kind AND id',
    posted[0] && posted[0].type === 'plan' && posted[0].act === 'toggle'
    && posted[0].kind === 'schedule' && posted[0].id === 's1');
posted = [];
query('[data-plan="run"]').find(e => e.dataset.kind === 'trigger').click();
ok('run works on a trigger row too',
    posted[0] && posted[0].act === 'run' && posted[0].kind === 'trigger' && posted[0].id === 't1');
posted = [];
query('[data-plan="edit"]').find(e => e.dataset.kind === 'workflow').click();
ok('edit works on a workflow row', posted[0] && posted[0].kind === 'workflow');
posted = [];
clickData('add', 'trigger');
ok('+ Trigger posts plan-add with its kind',
    posted[0] && posted[0].type === 'plan-add' && posted[0].kind === 'trigger');

// -------------------------------------------------- PLAN: inline detail
ok('detail is closed by default', !html().includes('class="detailbox"'));
query('[data-expand="schedule:s1"]')[0].click();
ok('expanding opens detail INLINE (no second page)', html().includes('class="detailbox"'));
ok('detail shows the full prompt', html().includes('apply the filing duty'));
ok('detail shows the target', html().includes('runs on manager · headless'));
ok('detail shows the guard', html().includes('Fires only if'));
ok('detail shows the 7-day record', html().includes('3 run(s) · 4 skipped (57%)'));
query('[data-expand="schedule:s1"]')[0].click();
ok('collapsing closes it again', !html().includes('class="detailbox"'));
query('[data-expand="workflow:w1"]')[0].click();
ok('a workflow expands to its steps', html().includes('render ∥') && html().includes('post — basit'));
query('[data-expand="workflow:w1"]')[0].click();

// ------------------------------------------------------ PLAN: filtering
ok('no filter chips when nothing is filtered', !html().includes('class="chips"'));
// The pick filters are multi-select dropdowns (media/afFilters.js): setting one
// means "clear, then tick exactly these". The checkbox and the grouping select
// are still single-valued controls.
// only the open tab's pickers are on the page, so the name pins one id
const pickId = (name) => ms.ids().filter(i => i.slice(-name.length - 1) === '-' + name)[0] || '';
const setFilter = (name, ...values) => {
    if (pickId(name)) { ms.only(pickId(name), values.map(String)); return; }
    const el = query(`[data-f="${name}"]`)[0];
    el.value = values[0];
    if (el.type === 'checkbox') { el.checked = values[0]; }
    el.fire('change');
};
setFilter('kind', 'trigger');
ok('filtering by kind narrows the table', html().includes('Media watch') && !html().includes('AGENT_AREA batch'));
ok('an active filter becomes a visible chip', html().includes('class="chips"') && html().includes('kind: trigger'));
ok('the chip reports how much is hidden', html().includes('showing 1 of 5'));
ok('a reset control appears with it', html().includes('data-resetview'));
clickData('clear', 'kind');
ok('clicking the chip removes that filter', html().includes('AGENT_AREA batch') && !html().includes('class="chips"'));

setFilter('agent', 'manager');
setFilter('state', 'on');
ok('two filters produce two chips',
    html().includes('agent: manager') && html().includes('state: on'));
ok('combined filters intersect', html().includes('AGENT_AREA batch')
    && html().includes('Media watch') && !html().includes('AI daily scan'));
resetView();
ok('reset clears every filter at once', !html().includes('class="chips"'));
ok('and brings the rows back', html().includes('AI daily scan') && html().includes('triage inbox'));

setFilter('guard', 'no');
ok('the guard filter finds unguarded rows', html().includes('Media watch') && !html().includes('AGENT_AREA batch'));
resetView();

const issuesBox = query('[data-f="issues"]')[0];
issuesBox.checked = true;
issuesBox.fire('change');
ok('"needs attention" shows only rows with problems',
    html().includes('Media watch') && !html().includes('AGENT_AREA batch'));
ok('a boolean filter also gets a chip', html().includes('needs attention'));
resetView();

// the header shortcut sets the same filter
posted = [];
query('[data-fixissues]')[0].click();
ok('the header "need attention" chip applies the filter',
    html().includes('Media watch') && !html().includes('AI daily scan'));
resetView();

// search covers prompt text, not just the title
const q = sandbox.document.getElementById('planq');
q.value = 'scan AI news';
q.fire('input');
ok('search matches the PROMPT, not only the name',
    html().includes('AI daily scan') && !html().includes('Media watch'));
ok('the search term shows as a chip', html().includes('“scan AI news”'));
resetView();

// grouping
setFilter('group', 'agent');
ok('grouping by agent regroups the table', html().includes('>manager <') || html().includes('manager <span'));
setFilter('group', '');
ok('flat grouping drops the group headers', !html().includes('class="grouphead"'));
setFilter('group', 'kind');

// sorting (grouping is applied AFTER the sort, so compare with a flat list)
setFilter('group', '');
clickData('sort', 'cost');
ok('sorting by cost puts the cheapest first (ascending)',
    html().indexOf('AI daily scan') < html().indexOf('Media watch'));
clickData('sort', 'cost');
ok('clicking the same column flips the direction',
    html().indexOf('Media watch') < html().indexOf('AI daily scan'));
ok('grouping stays off while sorting flat', !html().includes('class="grouphead"'));
setFilter('group', 'kind');

// ---------------------------------------------------------- PLAN: bulk
{
    const boxes = query('.rowsel');
    boxes.forEach(b => { b.checked = true; b.fire('change'); });
    posted = [];
    clickData('bulk', 'off');
    ok('bulk switch-off posts every selected row with its kind',
        posted[0] && posted[0].type === 'bulk' && posted[0].act === 'off'
        && posted[0].rows.length === 3
        && posted[0].rows.some(r => r.kind === 'schedule' && r.id === 's1')
        && posted[0].rows.some(r => r.kind === 'trigger' && r.id === 't1'));
    posted = [];
    clickData('bulk', 'on');
    ok('a cleared selection posts nothing', posted.length === 0);
}

// ------------------------------------------------------------- RUN side
clickData('tab', 'run');
ok('the RUN tab renders its own toolbar', html().includes('Search run, prompt, agent'));
ok('a live run is listed', html().includes('live run'));
ok('a parked run explains why it is parked', html().includes('agent busy (genel)'));
ok('statuses render as pills', html().includes('>running<') && html().includes('>failed<'));
ok('the run says where it came from', html().includes('>schedule<') && html().includes('AGENT_AREA batch'));
ok('a manual run says "you"', html().includes('>you<'));
ok('cost per run is shown', html().includes('$0.22'));
ok('the natural-language command bar is here, not on the plan tab', html().includes('id="cmd"'));

posted = [];
query('[data-task="cancel"]')[0].click();
ok('cancel posts task/cancel', posted[0] && posted[0].type === 'task' && posted[0].act === 'cancel');
posted = [];
query('[data-task="rerun"]')[0].click();
ok('re-run is offered on a finished run', posted[0] && posted[0].act === 'rerun');
posted = [];
query('[data-task="unpark"]')[0].click();
ok('a parked run can be retried', posted[0] && posted[0].act === 'unpark' && posted[0].id === 'r2');
posted = [];
query('[data-out]')[0].click();
ok('output opens by path', posted[0] && posted[0].type === 'open-output' && posted[0].file === 'D:/out/r3.md');

setFilter('status', 'failed');
ok('the run status filter works', html().includes('broken run') && !html().includes('live run'));
ok('and reports itself as a chip', html().includes('status: failed'));
resetView();
setFilter('source', 'trigger');
ok('filtering by source works', html().includes('broken run') && !html().includes('finished run'));
resetView();

query('[data-expand="run:r3"]')[0].click();
ok('a run expands to its prompt inline', html().includes('commit the repo'));
ok('and offers its transcript', html().includes('data-tr="D:/t/s.jsonl"'));

// -------------------------------------------- filters are remembered per tab
clickData('tab', 'plan');
ok('plan filters survived the tab round-trip (kind still grouped)', html().includes('class="grouphead"'));
ok('the plan tab does NOT inherit the run tab filters', !html().includes('status: failed'));

// --------------------------------------------------------- right-click menus
// The contract is the same one the backlog rows proved: do it with the row's
// own control, do it with the menu, and require the two messages to be
// identical. A menu that sent its own shape would look like it worked and
// would do nothing — silently, which is the failure this whole design exists
// to make impossible.
{
    const send = (data) => onMessage.forEach(fn => fn({ data }));
    const lastMsg = () => posted[posted.length - 1];
    /** Every row's published identity, decoded out of the rendered markup. */
    const contexts = () => (html().match(/data-vscode-context="([^"]*)"/g) || []).map(m =>
        JSON.parse(m.slice(21, -1).replace(/&quot;/g, '"').replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>').replace(/&amp;/g, '&')));

    clickData('tab', 'plan');
    const plan = contexts().find(c => c.webviewSection === 'afPlanRow' && c.planId === 's1');
    ok('a plan row publishes itself to the menu', !!plan && plan.planKind === 'schedule');
    ok('…and says what the menu is allowed to offer',
        !!plan && plan.afSwitchable === true && plan.afOn === true && plan.afKind === 'schedule');
    ok('the page keeps the normal Copy/Paste items', !!plan && plan.preventDefaultContextMenuItems === false);
    ok('…and it carries the address the pick has to come back to', !!plan && 'afPanel' in plan);
    ok('‼️ the prompt is NOT in the attribute — it is written on every row',
        !!plan && plan.prompt === undefined);

    const runBtn = query('[data-plan="run"]').find(e => e.dataset.id === 's1');
    posted = [];
    if (runBtn) { runBtn.click(); }
    const runByButton = lastMsg();
    ok('the row has a run button to compare against', !!runByButton);
    send({ type: 'afctx', act: 'plRun', ctx: plan });
    ok('‼️ Run from the menu is the message the row button sends, to the character',
        JSON.stringify(lastMsg()) === JSON.stringify(runByButton));

    const swBtn = query('[data-plan="toggle"]').find(e => e.dataset.id === 's1');
    if (swBtn) { swBtn.click(); }
    const toggleByButton = lastMsg();
    send({ type: 'afctx', act: 'plToggle', ctx: plan });
    ok('…and so is switching it off', JSON.stringify(lastMsg()) === JSON.stringify(toggleByButton));

    // Acts no button on this page ever offered.
    send({ type: 'afctx', act: 'plExport', ctx: plan });
    ok('exporting a schedule to Windows reaches the host as a plan act',
        lastMsg().type === 'plan' && lastMsg().act === 'export' && lastMsg().kind === 'schedule');
    send({ type: 'afctx', act: 'plHistory', ctx: plan });
    ok('the task history opens from any plan row', lastMsg().type === 'open-history');

    // A workflow's steps are objects; a schedule's "steps" line is prose.
    clickData('expand', 'workflow:w1');
    const step = contexts().find(c => c.webviewSection === 'afWorkflowStep');
    ok('a workflow step publishes its place in the list',
        !!step && step.planId === 'w1' && step.stepIndex === 0);
    send({ type: 'afctx', act: 'wfMove:down', ctx: step });
    ok('moving a step names the workflow and the index',
        lastMsg().type === 'wfstep' && lastMsg().act === 'down' && lastMsg().index === 0);
    clickData('expand', 'schedule:s1');
    ok('‼️ a schedule\'s detail carries no step menu — there is nothing to move',
        !contexts().some(c => c.webviewSection === 'afWorkflowStep' && c.planId === 's1'));
    clickData('expand', 'schedule:s1');
    clickData('expand', 'workflow:w1');

    clickData('tab', 'run');
    const done = contexts().find(c => c.webviewSection === 'afTaskRun' && c.taskId === 'r3');
    ok('a run row publishes its status and what it actually has',
        !!done && done.afStatus === 'done' && done.afOutput === true
        && done.afSession === true && done.afLive === false);
    const live = contexts().find(c => c.taskId === 'r1');
    ok('‼️ "live" is computed once on the row, not spelled out as three statuses',
        !!live && live.afLive === true && live.afStatus === 'running');

    const rerunBtn = query('[data-task="rerun"]').find(e => e.dataset.id === 'r3');
    if (rerunBtn) { rerunBtn.click(); }
    const rerunByButton = lastMsg();
    send({ type: 'afctx', act: 'tkRerun', ctx: done });
    ok('running it again from the menu is the button\'s own message',
        JSON.stringify(lastMsg()) === JSON.stringify(rerunByButton));
    send({ type: 'afctx', act: 'tkRetryEdit', ctx: done });
    ok('…and retrying with an edited prompt is an act only the menu offers',
        lastMsg().type === 'task' && lastMsg().act === 'retryEdit' && lastMsg().id === 'r3');
    send({ type: 'afctx', act: 'tkOutput', ctx: done });
    ok('the output opens by the path the ROW carries, not by a lookup at click time',
        lastMsg().type === 'open-output' && lastMsg().file === 'D:/out/r3.md');
    send({ type: 'afctx', act: 'tkTranscript', ctx: done });
    ok('and the transcript the same way',
        lastMsg().type === 'open-transcript' && lastMsg().file === 'D:/t/s.jsonl');

    send({ type: 'afctx', act: 'tkSource', ctx: done });
    ok('"show what started it" lands on the Plan tab searched for that definition',
        html().includes('repo backup'));
    clickData('clear', 'q');   // leave the page as the blocks below expect it
}

// ------------------------------------------------------ paused-farm state
{
    DATA.gate = { paused: true, pauseReason: 'reviewing cost', blocked: true, blockReason: 'all automations are paused', quietFrom: '', quietTo: '' };
    sandbox.window.__DATA__ = DATA;
    clickData('tab', 'run'); clickData('tab', 'plan');   // force a re-render
    ok('a paused farm is unmissable', html().includes('ALL PAUSED'));
    ok('and explains itself', html().includes('reviewing cost'));
    ok('quiet hours read as off when unset', html().includes('Quiet off'));
    posted = [];
    clickData('gate', 'resume');
    ok('Resume all is offered instead of Pause', posted[0] && posted[0].act === 'resume');
}

// ------------------------------------------- U-9: the page MAKES a task
// The control panel for task activity had no control for making one: the
// button opened a chain of VS Code input boxes that asked five questions and
// could not ask the five that decide what an unattended run does. The form is
// on the page now, it is the only implementation, and every route in opens it.
{
    const send = (data) => onMessage.forEach(fn => fn({ data }));
    // ‼️ The SAME accessor the page wires through. `query('#x')[0]` mints a fresh
    // shim element whenever the markup was repainted, so a click on it would go
    // to a copy the page never attached a listener to — the test would pass or
    // fail on the shim's bookkeeping rather than on the page.
    const fld = (id) => sandbox.document.getElementById(id);
    DATA.runs.push({
        id: 'r9', title: 'a run to copy', agentName: 'genel', mode: 'interactive',
        status: 'done', source: 'you', sourceKind: 'manual', when: NOW - 1000,
        detail: '', hasOutput: false, prompt: 'the original prompt'
    });
    clickData('tab', 'run');
    posted = [];

    ok('the Run tab offers a New task button, not a dialog', /id="nt-open"/.test(html()));
    fld('nt-open').click();
    ok('…and pressing it opens the form ON the page', /id="ntbox"/.test(html()));
    ok('the form asks nothing of the host to open', posted.length === 0);

    // ‼️ The five dimensions the dialog chain could not ask at all.
    ok('it offers the model list — the user\'s own aliases',
        /id="nt-model"/.test(html()) && html().includes('>opus<'));
    ok('it offers effort, with the launcher\'s own values',
        /id="nt-effort"/.test(html()) && html().includes('>xhigh<'));
    ok('it offers the permission mode',
        /id="nt-permissionMode"/.test(html()) && html().includes('>acceptEdits<'));
    ok('it offers the project, and opens on the window\'s own',
        /id="nt-project"/.test(html()) && /value="prj_1" selected/.test(html()));
    ok('…and "no project" is a real choice rather than an empty row',
        html().includes('— no project —'));
    ok('it offers a queue priority', /id="nt-priority"/.test(html()));
    ok('it offers a working folder', /id="nt-workdir"/.test(html()));
    ok('the CLI picker appears because a profile exists',
        /id="nt-cli"/.test(html()) && html().includes('>codex<'));
    ok('the agent is a field, not a first question', /id="nt-agent"/.test(html()));

    // Fill it in and queue it.
    fld('nt-prompt').value = 'read the report and summarise it';
    fld('nt-prompt').fire('input');
    fld('nt-agent').value = 'genel';
    fld('nt-agent').fire('change');
    fld('nt-model').value = 'haiku';
    fld('nt-model').fire('change');
    fld('nt-effort').value = 'low';
    fld('nt-effort').fire('change');
    fld('nt-permissionMode').value = 'acceptEdits';
    fld('nt-permissionMode').fire('change');
    fld('nt-priority').value = '3';
    fld('nt-priority').fire('input');
    posted = [];
    fld('nt-add').click();
    const made = posted.find(p => p.type === 'task-new');
    ok('Add sends ONE message carrying the whole task',
        made && made.task.prompt === 'read the report and summarise it'
        && made.task.agent === 'genel' && made.task.model === 'haiku'
        && made.task.effort === 'low' && made.task.permissionMode === 'acceptEdits'
        && made.task.project === 'prj_1' && made.task.priority === 3
        && made.task.start === true);
    ok('…and a title it was not given is left for the host to derive',
        made && made.task.title === '');

    // The host answers, and the form closes with the news on the page.
    send({ type: 'task-made', id: 'new1', title: 'read the report and summarise it', started: true });
    ok('a confirmed add closes the form', !/id="ntbox"/.test(html()));
    ok('…and says what happened, where the form was', html().includes('and started it'));

    // ‼️ The duplicate guard is asked IN the form now — a modal used to take the
    // focus off the fields it was complaining about.
    fld('nt-open').click();
    fld('nt-prompt').value = 'read the report and summarise it';
    fld('nt-prompt').fire('input');
    fld('nt-add').click();
    send({ type: 'task-dup', text: 'genel already has an identical task queued.' });
    ok('a duplicate is reported inside the form', /class="ntmsg warn"/.test(html())
        && html().includes('already has an identical task queued'));
    ok('…with the answer button next to the one just pressed', /id="nt-force"/.test(html()));
    posted = [];
    fld('nt-force').click();
    const forced = posted.find(p => p.type === 'task-new');
    ok('"add it anyway" re-sends the same task with force set',
        forced && forced.task.force === true && forced.task.prompt === 'read the report and summarise it');

    // A prompt is the one thing it cannot do without, and it says so itself.
    send({ type: 'task-made', id: 'n2', title: 'x', started: false });
    fld('nt-open').click();
    // The shim reuses one element per id across repaints, so the box has to be
    // emptied by hand — a real textarea is rebuilt with the draft's own value.
    fld('nt-prompt').value = '   ';
    fld('nt-prompt').fire('input');
    posted = [];
    fld('nt-add').click();
    ok('an empty prompt is refused by the form, not by the host',
        !posted.some(p => p.type === 'task-new') && html().includes('A task needs a prompt'));
    fld('nt-cancel').click();
    ok('Cancel closes it', !/id="ntbox"/.test(html()));

    // ---- one form, whatever route you came in through ----
    send({ type: 'task-compose' });
    ok('‼️ the host can open the same form — this is what the sidebar + does now',
        /id="ntbox"/.test(html()));
    fld('nt-cancel').click();
    send({
        type: 'task-compose',
        seed: { agent: 'basit', prompt: 'the original prompt', mode: 'interactive', model: 'opus' }
    });
    ok('…and it can arrive prefilled, which is "new task like this one"',
        html().includes('the original prompt')
        && /value="basit" selected/.test(html())
        && /value="opus" selected/.test(html())
        && /value="interactive" selected/.test(html()));
    posted = [];
    // The row menu's own entry posts the act the panel turns into that seed.
    send({ type: 'afctx', act: 'tkClone', ctx: { taskId: 'r9' } });
    ok('the row menu asks for it by task id',
        posted.some(p => p.type === 'task' && p.act === 'clone' && p.id === 'r9'));
}

// ------------------------- U-9: the page makes a PLAN object too ----------
// The run side got the form in 3.80.0 and the plan side did not, which left the
// worse half untouched: `addSchedule` asked six to eight boxes in a row and
// could not ask effort, permission mode, project, working folder or priority —
// so a SCHEDULE could say less about a run than the task it produces, and a
// task is exactly what a schedule is before it happens.
{
    const send = (data) => onMessage.forEach(fn => fn({ data }));
    const fld = (id) => sandbox.document.getElementById(id);
    clickData('tab', 'plan');
    posted = [];

    // ---- the + no longer hands the job back to a dialog
    clickData('add', 'schedule');
    ok('+ Schedule asks the host for the form', posted[0] && posted[0].type === 'plan-add'
        && posted[0].kind === 'schedule');
    // ‼️ THE ONE BUTTON THAT DID THE WRONG THING. There was no + Template at
    // all, and the kind it would have posted was mapped to `runTemplate` on the
    // host — an ADD button that RUNS.
    posted = [];
    clickData('add', 'template');
    ok('+ Template exists, and asks to CREATE one', posted[0] && posted[0].type === 'plan-add'
        && posted[0].kind === 'template');

    // ---- the host opens the form; it is the same form
    send({ type: 'plan-compose', kind: 'schedule', seed: { mode2: 'new' } });
    ok('a plan object is composed ON the page', /id="ntbox"/.test(html()));
    ok('…and it is the run form, with every dimension a task has',
        /id="nt-model"/.test(html()) && /id="nt-effort"/.test(html())
        && /id="nt-permissionMode"/.test(html()) && /id="nt-project"/.test(html())
        && /id="nt-priority"/.test(html()) && /id="nt-workdir"/.test(html()));
    // ‼️ …and the project does NOT open on the window's. A schedule fires at
    // 03:00 with nobody looking; the only honest project is one it declares.
    ok('an automation opens with no project rather than the window\'s',
        !/value="prj_1" selected/.test(html()));
    ok('it asks when it fires', /id="nt-every"/.test(html()) && /id="nt-time"/.test(html()));
    ok('…and what happens to a missed occurrence', /id="nt-missed"/.test(html()));
    ok('it offers the guard — the brake that costs nothing', /id="nt-guardKind"/.test(html()));

    // ---- fields that change the SHAPE of the form redraw it
    fld('nt-every').value = 'weekly';
    fld('nt-every').fire('change');
    ok('weekly brings the day picker with it', /id="nt-dow"/.test(html()));
    fld('nt-every').value = 'once';
    fld('nt-every').fire('change');
    ok('once swaps the time of day for a moment', /id="nt-onceAt"/.test(html())
        && !/id="nt-time"/.test(html()));
    ok('…and a one-off has nothing to say about a missed occurrence',
        !/id="nt-missed"/.test(html()));
    fld('nt-every').value = 'daily';
    fld('nt-every').fire('change');
    fld('nt-guardKind').value = 'folderHasFiles';
    fld('nt-guardKind').fire('change');
    ok('a guard that looks at a folder asks for the folder', /id="nt-guardPath"/.test(html()));
    ok('…and what does not count as work there', /id="nt-guardExcept"/.test(html()));

    // ---- it refuses in the form, never in a modal
    posted = [];
    fld('nt-add').click();
    ok('a nameless schedule is refused where the mistake is',
        !posted.some(p => p.type === 'plan-save') && html().includes('needs a name'));
    fld('nt-title').value = 'nightly filing';
    fld('nt-title').fire('input');
    posted = [];
    fld('nt-add').click();
    ok('…and so is one with no prompt',
        !posted.some(p => p.type === 'plan-save') && html().includes('needs a prompt'));
    fld('nt-prompt').value = 'file everything in the inbox';
    fld('nt-prompt').fire('input');
    posted = [];
    fld('nt-add').click();
    ok('…and a guard with no path, because it could never pass',
        !posted.some(p => p.type === 'plan-save') && html().includes('take the guard off'));
    fld('nt-guardPath').value = 'D:/zone/inbox';
    fld('nt-guardPath').fire('input');
    fld('nt-effort').value = 'low';
    fld('nt-effort').fire('change');
    posted = [];
    fld('nt-add').click();
    const saved = posted.find(p => p.type === 'plan-save');
    ok('a complete schedule is sent as ONE message, whole', !!saved);
    ok('…carrying the dimensions the dialog chain could never ask',
        saved && saved.item.effort === 'low' && saved.item.kind === 'schedule');
    ok('…and its guard', saved && saved.item.guardKind === 'folderHasFiles'
        && saved.item.guardPath === 'D:/zone/inbox');

    // ---- a trigger is the same form with its own second half
    send({ type: 'plan-compose', kind: 'trigger', seed: { mode2: 'new' } });
    ok('a trigger asks what fires it', /id="nt-ttype"/.test(html()) && /id="nt-watchPath"/.test(html()));
    ok('…and its frequency brakes', /id="nt-debounceSec"/.test(html())
        && /id="nt-cooldownSec"/.test(html()) && /id="nt-maxPerHour"/.test(html()));
    fld('nt-ttype').value = 'hook';
    fld('nt-ttype').fire('change');
    ok('a hook trigger asks which event instead of a path',
        /id="nt-hookEvent"/.test(html()) && !/id="nt-watchPath"/.test(html()));
    fld('nt-act').value = 'dispatch';
    fld('nt-act').fire('change');
    ok('a dispatch trigger stops asking for a fixed agent', !/id="nt-agent"/.test(html()));

    // ---- an edit is the same form, prefilled
    send({
        type: 'plan-compose', kind: 'schedule',
        seed: { mode2: 'edit', id: 's1', title: 'morning', prompt: 'p', every: 'daily', time: '07:30' }
    });
    ok('editing says so rather than pretending to be new', html().includes('Edit schedule'));
    ok('…and arrives filled in', /id="nt-title"[^>]*value="morning"/.test(html()));
    posted = [];
    fld('nt-add').click();
    const edited = posted.find(p => p.type === 'plan-save');
    ok('saving an edit names the object it edits',
        edited && edited.item.mode2 === 'edit' && edited.item.id === 's1');
    send({ type: 'plan-saved', text: 'Schedule saved.' });
    ok('the form closes on the host\'s receipt', !/id="ntbox"/.test(html()));
}

// --------------------------------------------------------- empty states
// The page captured DATA by reference at load, so a fresh object would be
// ignored — mutate the object it is actually holding.
{
    DATA.gate = { paused: false, quietFrom: '', quietTo: '' };
    DATA.plan.length = 0;
    DATA.runs.length = 0;
    DATA.summary.issues = 0;
    DATA.summary.savedWakeups7d = 0;
    DATA.summary.needsYou = 0;
    clickData('tab', 'run'); clickData('tab', 'plan');
    ok('an empty plan explains what to do', html().includes('Nothing is automated yet'));
    clickData('tab', 'run');
    ok('an empty run list says so', html().includes('Nothing has run yet'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
