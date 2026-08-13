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
    // the search boxes are QUERIES now (media/afQuery.js), and the real grammar
    // runs here rather than a stub
    + '\n' + fs.readFileSync(path.join(__dirname, '..', 'media', 'afQuery.js'), 'utf8')
    // …and every clock on the page goes through the one clock (media/afTime.js)
    + '\n' + fs.readFileSync(path.join(__dirname, '..', 'media', 'afTime.js'), 'utf8')
    // …and which ENGINE ran a task is drawn with the shared badge (X-35), the
    // same component every other table uses — never a colour invented here
    + '\n' + fs.readFileSync(path.join(__dirname, '..', 'media', 'afEngine.js'), 'utf8')
    // …and the hover panel (media/afTip.js) — M-8 turned every column of both
    // tables into one, so a stub here would be testing a different page
    + '\n' + fs.readFileSync(path.join(__dirname, '..', 'media', 'afTip.js'), 'utf8')
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
function query(sel, scope) {
    // ‼️ A SELECTOR LIST IS A LIST, AND A DESCENDANT IS A DESCENDANT. The page
    // makes a read-only form dead in ONE place —
    // `querySelectorAll('#ntbox input, #ntbox select, #ntbox textarea')` — and
    // a shim that read only the first branch, or read `#ntbox input` as "the
    // element with that id", would report a form with live boxes in it as dead.
    if (sel.includes(',')) {
        const seen = new Set();
        return sel.split(',').reduce((all, part) => {
            for (const el of query(part.trim(), scope)) {
                if (!seen.has(el)) { seen.add(el); all.push(el); }
            }
            return all;
        }, []);
    }
    const desc = /^#([\w-]+)\s+(.+)$/.exec(sel);
    if (desc) {
        // The shim has no tree, so "inside #x" is the markup from that id up to
        // the next table — enough for a card that is drawn above one.
        const src = scope || html();
        const i = src.indexOf(`id="${desc[1]}"`);
        if (i < 0) { return []; }
        const rest = src.slice(i);
        const end = rest.indexOf('<table');
        return query(desc[2], end > 0 ? rest.slice(0, end) : rest);
    }
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
    const tags = (scope || html()).match(/<(?:input|button|select|textarea|div|span|th|td|tr|label|a)\b[^>]*>/g) || [];
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
        AFCharts: {
            esc: (s) => String(s == null ? '' : s),
            fmtUSD: (v) => '$' + Number(v).toFixed(2),
            // X-35: a plan-billed engine's run shows tokens instead of a dollar
            fmtTok: (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n))
        },
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
// ‼️ M-8 — a transcript is named `<sessionId>.jsonl`, and the id is what the
// Session column draws. A one-letter stand-in would have let the column pass
// while slicing an id to eight characters was still untested.
const SESSION_ID = '7379fd0f-4e00-4264-9537-1e9f50f8491b';
const SESSION_FILE = 'D:/t/' + SESSION_ID + '.jsonl';
const DATA = {
    generatedAt: NOW,
    tab: 'plan',
    gate: {
        paused: false, pausedUntil: undefined, pauseReason: '',
        quietFrom: '23:30', quietTo: '04:30', blocked: false, blockReason: '',
        // ‼️ M-7 — the gate in front of every other gate: only ONE window fires
        // schedules, and the page had no way to say "not this one".
        runsQueue: true
    },
    summary: {
        running: 1, runLimit: 2, queued: 2, needsYou: 1,
        plansOn: 3, plansSwitchable: 4, doneToday: 4, failedToday: 1,
        cost7d: 18.4, savedWakeups7d: 23, issues: 2
    },
    agents: ['manager', 'genel', 'basit'],
    perAgentLimit: 1,
    // ‼️ The page reads this to offer "run a workflow" on a trigger, and the
    // host never sent it — so the option was never drawn, and editing a
    // workflow trigger fell back to the first choice and turned it into a task.
    workflows: [{ id: 'w1', title: 'publish pipeline', steps: 2 }],
    scenes: [{ id: 'prod1/s01', label: 'Tanıtım · Açılış' }],
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
        // S-20 — what each ENGINE currently offers. The flat pair above is the
        // fallback; this is what the Model box must actually read once the form
        // knows which engine will run the task.
        engineModels: {
            claude: {
                models: [
                    { id: '', label: 'Default' }, { id: 'haiku', label: 'haiku' }, { id: 'opus', label: 'opus' }
                ],
                efforts: {}, defaultEffort: {}, source: 'settings', note: 'your agentFarm.modelAliases list.'
            },
            codex: {
                models: [
                    { id: '', label: 'Default' },
                    { id: 'gpt-5.6-sol', label: 'GPT-5.6-Sol' },
                    { id: 'gpt-5.6-terra', label: 'GPT-5.6-Terra' }
                ],
                efforts: {
                    '': [{ id: '', label: 'Default' }, { id: 'low', label: 'low' }],
                    'gpt-5.6-terra': [
                        { id: '', label: 'Default' }, { id: 'low', label: 'low' }, { id: 'ultra', label: 'ultra' }
                    ]
                },
                defaultEffort: { 'gpt-5.6-terra': 'medium' }, source: 'catalog',
                note: '2 models, read from Codex\'s own catalog.'
            }
        },
        engines: [
            { id: 'claude', label: 'Claude Code', ready: true, next: 'Ready, on a plan.' },
            { id: 'codex', label: 'Codex', ready: true, next: 'Ready, on a plan.' }
        ],
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
            // ‼️ M-7/M-8 — the row carries the whole SETUP (the triangle used to
            // say the word "schedule" and stop) and, when its minute has passed
            // with nothing having run, the reason why.
            overdue: '',
            detail: {
                prompt: 'apply the filing duty', target: 'runs on manager · headless',
                timing: 'every day 05:00 · missed → run', steps: [], missed: 'run',
                setup: [
                    { label: 'Fires', value: 'every day 05:00' },
                    { label: 'If it is missed', value: 'run it at the first opportunity' },
                    { label: 'Agent', value: 'manager · headless' },
                    { label: 'Guard', value: 'files in …/00_INPUT (skip _LOG_.md)' },
                    { label: 'Model', value: 'opus' }
                ]
            }
        },
        {
            id: 's2', kind: 'schedule', title: 'AI daily scan',
            when: 'every day 06:00', agentName: 'manager', model: '',
            guard: '', hasGuard: false, switchable: true, enabled: false,
            cost7d: 0, runs7d: 0, skipped7d: 0, skipRate: 0,
            lastNote: '', issues: [], overdue: '',
            detail: {
                prompt: 'scan AI news', target: 'runs on manager · headless',
                timing: 'every day 06:00 · missed → skip', steps: [], missed: 'skip',
                setup: [{ label: 'Fires', value: 'every day 06:00' }]
            }
        },
        {
            // ‼️ M-7 — the case the whole item was written about: 09:00 came and
            // went, and everything on the page went on looking healthy.
            id: 's3', kind: 'schedule', title: 'sabah13',
            when: 'every day 09:00', nextAt: NOW + 8e7, agentName: 'developer', model: '',
            guard: '', hasGuard: false, switchable: true, enabled: true,
            cost7d: 0, runs7d: 0, skipped7d: 0, skipRate: 0,
            lastNote: '', issues: ['no-guard', 'overdue'],
            overdue: 'its time has passed and automation is blocked — everything is paused.',
            detail: {
                prompt: 'sabah raporunu yaz', target: 'runs on developer · headless',
                timing: 'every day 09:00 · missed → skip', steps: [], missed: 'skip',
                setup: [{ label: 'Fires', value: 'every day 09:00' }]
            }
        },
        {
            id: 't1', kind: 'trigger', title: 'Media watch',
            when: 'on change · …/02_MEDIALASTIR', agentName: 'manager', model: 'opus',
            guard: '', hasGuard: false, switchable: true, enabled: true,
            cost7d: 70.9, runs7d: 23, skipped7d: 0, skipRate: 0,
            lastRunAt: NOW - 3600e3, lastNote: 'no files waiting',
            issues: ['no-guard', 'path-missing'], overdue: '',
            detail: {
                prompt: 'file the media', target: 'runs on manager',
                timing: 'debounce 60s · cooldown 300s · max 6/h', steps: [], missed: '',
                setup: [
                    { label: 'Fires', value: 'on change · …/02_MEDIALASTIR' },
                    { label: 'Armed', value: 'NO — the path is missing, so nothing can fire' }
                ]
            }
        },
        {
            id: 'w1', kind: 'workflow', title: 'publish pipeline',
            when: 'when you run it (or a trigger does)', agentName: '', model: '',
            guard: '', hasGuard: false, switchable: false, enabled: true,
            cost7d: 0, runs7d: 0, skipped7d: 0, skipRate: 0,
            lastNote: '2 step(s)', issues: [], overdue: '',
            detail: {
                prompt: '', target: '2 step chain', timing: '',
                steps: ['1. render ∥ — genel', '2. post — basit'], missed: '',
                setup: [{ label: 'Steps', value: '2' }]
            }
        },
        {
            id: 'tp1', kind: 'template', title: 'triage inbox',
            when: 'when you run it', agentName: 'genel', model: '',
            guard: '', hasGuard: false, switchable: false, enabled: true,
            cost7d: 0, runs7d: 0, skipped7d: 0, skipRate: 0,
            lastNote: '', issues: [], overdue: '',
            detail: {
                prompt: 'triage the inbox now', target: 'runs on genel · headless',
                timing: '', steps: [], missed: '',
                setup: [{ label: 'Agent', value: 'genel · headless' }]
            }
        }
    ],
    runs: [
        {
            id: 'r1', title: 'live run', agentName: 'manager', mode: 'headless', status: 'running',
            source: 'AGENT_AREA batch', sourceKind: 'schedule', when: NOW - 300e3, durMin: 5,
            detail: '', costUSD: 1.2, hasOutput: false, prompt: 'do the batch',
            sessionId: '', events: [{ ts: NOW - 400e3, kind: 'created', note: 'by a schedule' }],
            setup: [{ label: 'Agent', value: 'manager · headless' }],
            seed: { agent: 'manager', prompt: 'do the batch', mode: 'headless' }
        },
        {
            id: 'r2', title: 'parked run', agentName: 'genel', mode: 'headless', status: 'parked',
            source: 'you', sourceKind: 'manual', when: NOW - 600e3,
            detail: 'daily budget spent (genel: $4.10 of $4.00)', hasOutput: false, prompt: 'something',
            sessionId: '',
            // ‼️ M-7/M-8 — the run's own record: why it was held, and when.
            events: [
                { ts: NOW - 700e3, kind: 'created', note: 'by you' },
                { ts: NOW - 690e3, kind: 'parked', note: 'daily budget spent (genel: $4.10 of $4.00)' }
            ],
            setup: [{ label: 'Agent', value: 'genel · headless' }],
            seed: { agent: 'genel', prompt: 'something', mode: 'headless' }
        },
        {
            id: 'r3', title: 'finished run', agentName: 'basit', mode: 'headless', status: 'done',
            source: 'repo backup', sourceKind: 'schedule', when: NOW - 7200e3, durMin: 1,
            detail: '', costUSD: 0.22, hasOutput: true, outputFile: 'D:/out/r3.md',
            sessionFile: SESSION_FILE, sessionId: SESSION_ID, prompt: 'commit the repo',
            events: [
                { ts: NOW - 7400e3, kind: 'created', note: 'by a schedule' },
                { ts: NOW - 7300e3, kind: 'started', note: 'Claude Code · headless' },
                { ts: NOW - 7200e3, kind: 'finished', note: 'done after 1 min' }
            ],
            setup: [
                { label: 'Agent', value: 'basit · headless' },
                { label: 'Started by', value: 'schedule "repo backup"' }
            ],
            seed: { agent: 'basit', prompt: 'commit the repo', mode: 'headless', priority: 0 }
        },
        {
            id: 'r4', title: 'broken run', agentName: 'manager', mode: 'headless', status: 'failed',
            source: 'Media watch', sourceKind: 'trigger', when: NOW - 9200e3, durMin: 2,
            detail: '', hasOutput: false, prompt: 'file the media',
            sessionId: '', events: [], setup: [{ label: 'Agent', value: 'manager · headless' }],
            seed: { agent: 'manager', prompt: 'file the media', mode: 'headless' }
        }
    ],
    undoable: 0
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
// ‼️ THE GATE IS SET ON THE STRIP THAT REPORTS IT (U-9). 🌙 used to call
// `agentfarm.setQuietHours`, which asked a quickpick of two canned windows and
// then, for anything else, two more input boxes; the pause reason was a third.
posted = [];
clickData('gate', 'open');
ok('the quiet button opens the card instead of asking the host for a dialog',
    !posted.length && /id="gtbox"/.test(html()));
ok('…and the card is filled from what the gate currently says',
    /id="gt-from"[^>]*value="23:30"/.test(html()) && /id="gt-to"[^>]*value="04:30"/.test(html()));
{
    const fldg = (id) => sandbox.document.getElementById(id);
    fldg('gt-from').value = '';
    fldg('gt-from').fire('input');
    fldg('gt-quiet').click();
    ok('half a window is refused in the card', html().includes('needs both ends'));
    fldg('gt-from').value = '22:15';
    fldg('gt-from').fire('input');
    posted = [];
    fldg('gt-quiet').click();
    ok('a whole one is sent as two times', posted[0] && posted[0].act === 'quiet-set'
        && posted[0].quietFrom === '22:15' && posted[0].quietTo === '04:30');
    clickData('gate', 'open');
    posted = [];
    fldg('gt-quietoff').click();
    ok('and turning it off is its own act', posted[0] && posted[0].act === 'quiet-off');
    clickData('gate', 'open');
    fldg('gt-reason').value = 'reviewing cost';
    fldg('gt-reason').fire('input');
    fldg('gt-mins').value = '480';
    fldg('gt-mins').fire('change');
    posted = [];
    fldg('gt-pause').click();
    ok('‼️ a timed pause finally carries WHY, which is what makes it explainable later',
        posted[0] && posted[0].act === 'pause-for' && posted[0].text === '480'
        && posted[0].reason === 'reviewing cost');
    fldg('gt-close').click();
    ok('the card closes', !/id="gtbox"/.test(html()));
}

// ------------------------------------------------------------------- tabs
ok('there are exactly two tabs', query('[data-tab]').length === 2);
ok('PLAN is the default tab', /class="tab on" data-tab="plan"/.test(html()));
ok('tab counts come from the data', html().includes('📅 Plan <span class="tab-n">6</span>')
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
ok('only switchable rows get a checkbox', query('.rowsel').length === 4);

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
// ‼️ M-8 — the triangle carries the whole SETUP now, not the word "schedule".
// The old two lines (Target / Timing) were a summary of a summary; these are
// the fields as they were typed in, and only the ones actually stated.
ok('detail shows the setup, field by field',
    html().includes('<b>Fires</b>') && html().includes('every day 05:00')
    && html().includes('<b>Agent</b>') && html().includes('manager · headless'));
ok('detail shows the guard as one of them',
    html().includes('<b>Guard</b>') && html().includes('files in …/00_INPUT'));
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
ok('the chip reports how much is hidden', html().includes('showing 1 of 6'));
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
        && posted[0].rows.length === 4
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
ok('a parked run explains why it is parked', html().includes('daily budget spent (genel: $4.10 of $4.00)'));
ok('statuses render as pills', html().includes('>running<') && html().includes('>failed<'));
ok('the run says where it came from', html().includes('>schedule<') && html().includes('AGENT_AREA batch'));
ok('a manual run says "you"', html().includes('>you<'));
ok('cost per run is shown', html().includes('$0.22'));
ok('the natural-language command bar is here, not on the plan tab', html().includes('id="cmd"'));

// ---- X-35: which engine ran it, and what its cost figure is worth ----------
// ‼️ A table of executions across four engines never named one — the same fault
// the Turns page had — and the Cost column beside it was worse than silent: only
// Claude Code states a price, so every other engine priced at exactly $0.00,
// which `fmtUSD` draws as the same "—" the column uses for "not measured yet".
{
    const runsData = Object.assign({}, DATA, {
        runs: [
            Object.assign({}, DATA.runs[2], {
                id: 'e1', title: 'claude run', engine: 'claude', reportsCost: true,
                costUSD: 0.22, tokens: 500000
            }),
            Object.assign({}, DATA.runs[2], {
                id: 'e2', title: 'codex run', engine: 'codex', reportsCost: false,
                costUSD: 0, tokens: 93625
            }),
            Object.assign({}, DATA.runs[1], {
                id: 'e3', title: 'queued run', engine: 'claude', reportsCost: true,
                costUSD: undefined, tokens: undefined
            })
        ]
    });
    onMessage.forEach(fn => fn({ data: { type: 'data', data: runsData } }));
    /** Just the runs table, so an assertion cannot be satisfied by the summary
     *  strip or the composer above it. */
    const table = () => (html().match(/<table class="grid">[\s\S]*?<\/table>/) || [''])[0];
    ok('‼️ every run row carries the shared engine badge',
        (table().match(/class="af-eng /g) || []).length === 3);
    ok('…and the Engine column exists at all', table().includes('>Engine</th>'));
    // …in the CELL. The column's own heading explains why $0.00 is not written
    // there, so the string legitimately appears once, in a `title`.
    ok('‼️ a plan-billed run shows TOKENS where a dollar would be a lie',
        table().includes('93.6k tok') && !/<td class="num">[^<]*\$0\.00/.test(table()));
    ok('…and a priced run still shows its dollar', table().includes('$0.22'));
    // A run that has not been measured yet keeps the plain dash — the two must
    // stay distinguishable, which is the whole point of the tokens above.
    ok('…and an unmeasured run is still a bare dash',
        (table().match(/<td class="num">—<\/td>/g) || []).length >= 1);
    ok('…and the Engines filter is offered', table !== null && html().includes('Engines'));
    // …and it actually narrows the table, the same way every other pick does.
    setFilter('engine', 'Codex');
    ok('‼️ picking one engine narrows the runs to it',
        table().includes('codex run') && !table().includes('claude run'));
    ok('…and it becomes a removable chip like the others',
        html().includes('engine: Codex'));
    clickData('clear', 'engine');
    ok('…and clearing it brings the rest back', table().includes('claude run'));
    // Put the page back on the runs the rest of this file is written against.
    onMessage.forEach(fn => fn({ data: { type: 'data', data: DATA } }));
}

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
ok('and offers its transcript', html().includes(`data-tr="${SESSION_FILE}"`));
ok('‼️ M-8 — …and the triangle carries the whole SETUP, not the word "schedule"',
    html().includes('<b>Started by</b>') && html().includes('schedule &quot;repo backup&quot;'));
ok('‼️ M-8 — …and what happened to the run, in order',
    html().includes('What happened, in order') && html().includes('started — Claude Code · headless'));
query('[data-expand="run:r3"]')[0].click();

/* ======================================================================
   M-7 / M-8 — WHAT THE ROW SAYS WITHOUT BEING OPENED.

   The two items these tests are written from are one complaint in two
   places: a scheduled run whose time came and went while every surface
   went on looking healthy (M-7), and a run table that knew thirty facts
   about a run and drew eight of them (M-8). So each assertion below asks
   the page for a fact that WAS already in the data and was not drawn.
   ====================================================================== */
{
    /** Just the runs table, so nothing here can be satisfied by the summary
     *  strip, the toolbar or a composer above it. */
    const table = () => (html().match(/<table class="grid">[\s\S]*?<\/table>/) || [''])[0];
    /** The text of every hover panel currently rendered. */
    const tips = () => (html().match(/<span class="af-tipb">[\s\S]*?<\/span>/g) || []);
    const tipWith = (needle) => tips().find(t => t.includes(needle));

    // ---------------------------------------------------- the session column
    ok('‼️ M-8 — the run table finally has a Session column', table().includes('>Session</th>'));
    ok('…and the id is DRAWN, not hidden behind an unlabelled button',
        table().includes(`>${SESSION_ID.slice(0, 8)}<`));
    posted = [];
    query('.slink')[0].click();
    ok('…and clicking it opens that conversation',
        posted[0] && posted[0].type === 'open-transcript' && posted[0].file === SESSION_FILE);
    ok('a run with no matched transcript says WHY rather than drawing a bare dash',
        /matched a few minutes after the run ends/.test(table()));
    ok('…and the hover carries what the row cannot fit',
        !!tipWith('Session: ' + SESSION_ID) && !!tipWith('Transcript: ' + SESSION_FILE));

    // ------------------------------------------------ the run's own history
    ok('‼️ M-8 — the Status badge carries everything that happened to the run, in time order',
        !!tipWith('held back — daily budget spent (genel: $4.10 of $4.00)'));
    ok('…stamped, because comparing one against a provider\'s log is why anybody opens it',
        /\d{2}:\d{2}[^<]*· held back/.test(tips().join('')));
    ok('…and a run older than the record says so instead of drawing an empty panel',
        !!tipWith('predates the run log'));

    // --------------------------------------------- the prompt, and the form
    ok('‼️ M-8 — the whole prompt is on the row\'s own hover', !!tipWith('do the batch'));
    ok('…and the title says it is a door', table().includes('data-taskform="r1"'));
    ok('‼️ M-8 — "Started by" carries the automation\'s whole setup',
        !!tipWith('Started by: schedule &quot;repo backup&quot;'));

    // ------------------------------------------------------- undo (M-8)
    ok('the ✕ on a row is answered by an Undo button', /id="task-undo"/.test(html()));
    ok('…which is dead while there is nothing to undo', /id="task-undo"[^>]*disabled/.test(html()));
    onMessage.forEach(fn => fn({ data: { type: 'data', data: Object.assign({}, DATA, { undoable: 2 }) } }));
    ok('…and offers itself, by count, once a row has been taken off',
        /id="task-undo"(?![^>]*disabled)/.test(html()) && html().includes('the 2 run(s) you just deleted'));
    posted = [];
    sandbox.document.getElementById('task-undo').click();
    ok('…and pressing it asks the host to put them back',
        posted[0] && posted[0].type === 'task-undo');
    onMessage.forEach(fn => fn({ data: { type: 'data', data: DATA } }));

    // ------------------------------- the form that MADE the run, read-only
    query('[data-taskform="r3"]')[0].click();
    ok('‼️ M-8 — clicking a run\'s title opens the form it was made with',
        /id="ntbox"/.test(html()) && html().includes('How this run was made'));
    ok('…filled in from the row, so it costs no round trip', /value="basit" selected/.test(html())
        && html().includes('commit the repo'));
    ok('…and it says out loud that it is a readout', html().includes('read-only')
        && /class="ntbox ro"/.test(html()));
    ok('…with nothing to press that would change anything',
        !/id="nt-add"/.test(html()) && !/id="nt-start"/.test(html()));
    ok('‼️ …and EVERY control dead — one place disables them, not forty template holes',
        ['nt-prompt', 'nt-agent', 'nt-model', 'nt-effort', 'nt-priority']
            .every(id => sandbox.document.getElementById(id).disabled === true));
    sandbox.document.getElementById('nt-cancel').click();

    // ---------------------------------------- "run it whatever the budget says"
    sandbox.document.getElementById('nt-open').click();
    ok('‼️ M-7 — the form can waive the DAILY BUDGET for one run',
        /id="nt-ignorebudget"/.test(html()));
    ok('…and says what it does NOT waive, where the box is',
        /does NOT lift the 5-hour quota guard/.test(html()));
    sandbox.document.getElementById('nt-prompt').value = 'mutlaka çalışsın';
    sandbox.document.getElementById('nt-prompt').fire('input');
    sandbox.document.getElementById('nt-ignorebudget').checked = true;
    sandbox.document.getElementById('nt-ignorebudget').fire('change');
    posted = [];
    sandbox.document.getElementById('nt-add').click();
    ok('…and it travels with the task the form sends',
        posted.some(p => p.type === 'task-new' && p.task.ignoreBudget === true));

    // ------------------------------------- a task and a schedule are one form
    sandbox.document.getElementById('nt-open').click();
    ok('‼️ M-7 — the kind is a FIELD, not a door you had to pick before typing',
        /id="nt-kind"/.test(html()) && html().includes('schedule — a clock starts it'));
    sandbox.document.getElementById('nt-prompt').value = 'sabah raporunu yaz';
    sandbox.document.getElementById('nt-prompt').fire('input');
    sandbox.document.getElementById('nt-kind').value = 'schedule';
    sandbox.document.getElementById('nt-kind').fire('change');
    ok('…changing it redraws the kind-specific block', /id="nt-time"/.test(html()));
    ok('‼️ …and the draft survives the change — that is the whole point',
        html().includes('sabah raporunu yaz'));
    sandbox.document.getElementById('nt-cancel').click();
    onMessage.forEach(fn => fn({
        type: 'x', data: { type: 'plan-compose', kind: 'schedule', seed: { mode2: 'edit', id: 's1', title: 'x' } }
    }));
    ok('‼️ …but a STORED object\'s kind is not offered: that would be deleting one thing and making another',
        /id="ntbox"/.test(html()) && !/id="nt-kind"/.test(html()));
    sandbox.document.getElementById('nt-cancel').click();
}

// ------------------------------------------ M-7: the row that went past its time
clickData('tab', 'plan');
{
    const table = () => (html().match(/<table class="grid">[\s\S]*?<\/table>/) || [''])[0];
    ok('‼️ M-7 — a schedule whose minute has passed with nothing run wears a badge for it',
        /<span class="badge warn"[^>]*>overdue<\/span>/.test(table()));
    ok('‼️ …and says WHY on the row itself — a fact you must hover for is the same failure one layer in',
        /class="overdue small">⚠ its time has passed and automation is blocked/.test(table()));
    ok('…and a healthy row says nothing of the sort',
        (table().match(/class="overdue small"/g) || []).length === 1);
    ok('‼️ M-8 — the plan triangle carries the setup of the thing, field by field',
        html().includes('data-expand="schedule:s1"'));

    // …and the gate in front of every other gate
    ok('a window that runs the queue says nothing about it', !/class="notrunner"/.test(html()));
    onMessage.forEach(fn => fn({
        data: {
            type: 'data',
            data: Object.assign({}, DATA, { gate: Object.assign({}, DATA.gate, { runsQueue: false }) })
        }
    }));
    ok('‼️ M-7 — a window that CANNOT fire schedules says so before anything else is read',
        /class="notrunner"/.test(html())
        && html().includes('Schedules do not fire from this window'));
    onMessage.forEach(fn => fn({ data: { type: 'data', data: DATA } }));
    clickData('tab', 'run');
}
clickData('tab', 'plan');

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
        lastMsg().type === 'open-transcript' && lastMsg().file === SESSION_FILE);

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
    // ‼️ S-20 — THE MODEL BOX FOLLOWS THE ENGINE BOX. Queuing a Codex task from
    // a Claude alias list produces a `--model` its CLI rejects, and unattended
    // is where that is worst: nothing fails visibly, the shell error lands in an
    // archive file read hours later. So the list must change when the engine does.
    ok('the engine picker is on the form', /id="nt-engine"/.test(html()));
    ok('…and on Claude the box is the alias list', html().includes('>opus<'));
    fld('nt-engine').value = 'codex';
    fld('nt-engine').fire('change');
    ok('‼️ choosing Codex swaps the model list to the ENGINE\'s own models',
        html().includes('>GPT-5.6-Sol<') && !html().includes('>opus<'));
    ok('…and the effort box narrows to what that engine states',
        html().includes('>low<') && !html().includes('>xhigh<'));
    fld('nt-model').value = 'gpt-5.6-terra';
    fld('nt-model').fire('change');
    ok('…and choosing a model narrows effort again to ITS own levels',
        html().includes('>ultra<'));
    // a model belongs to one engine: carrying it back would leave a value the
    // other CLI cannot take
    fld('nt-engine').value = '';
    fld('nt-engine').fire('change');
    ok('‼️ going back to Claude drops the model that engine never had',
        html().includes('>opus<') && !html().includes('>GPT-5.6-Terra<'));

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

// ------------------- U-9 Faz 2: the workflow CHAIN is a form -------------
// `newWorkflow` was 294 lines of quickpicks that asked for step 4 without ever
// showing steps 1-3, offered no way back to step 2, and answered Esc by
// discarding the lot; `addWorkflowStep` appended the poorest kind of step the
// model has; `editWorkflowStep` was a quickpick of FIELD NAMES.
{
    const send = (data) => onMessage.forEach(fn => fn({ data }));
    const fld = (id) => sandbox.document.getElementById(id);
    clickData('tab', 'plan');
    posted = [];

    clickData('add', 'workflow');
    ok('+ Workflow asks the host for the form, not for a wizard',
        posted[0] && posted[0].type === 'plan-add' && posted[0].kind === 'workflow');

    send({ type: 'plan-compose', kind: 'workflow', seed: { mode2: 'new', steps: [], stepIdx: null } });
    ok('a workflow is composed on the page', /id="ntbox"/.test(html()));
    ok('…it asks for a name and NOT for one prompt of its own',
        /id="nt-title"/.test(html()) && !/id="nt-prompt"/.test(html()));
    ok('…and it shows the chain, empty, saying what that means',
        html().includes('Steps') && html().includes('running it does nothing'));
    ok('an empty chain offers the one button that starts it', /id="nt-stadd"/.test(html()));

    // ---- one step is one card, and its KIND decides the card
    fld('nt-stadd').click();
    ok('+ Add a step opens the step card', /id="stbox"/.test(html()));
    ok('…which asks what the step IS, all six kinds',
        /id="nt-st-stype"/.test(html())
        && html().includes('webhook — an HTTP call, no agent')
        && html().includes('media — fal.ai / Replicate render')
        && html().includes('browser — an agent drives a site')
        && html().includes('approval — the chain waits for you')
        && html().includes('select — you keep some of the assets'));
    ok('an agent step asks for the agent, the prompt and the mode',
        /id="nt-st-agent"/.test(html()) && /id="nt-st-prompt"/.test(html()) && /id="nt-st-smode"/.test(html()));
    ok('…and the three things that are about the CHAIN, not the step',
        /id="nt-st-onFail"/.test(html()) && /id="nt-st-contract"/.test(html())
        && /id="nt-st-verifyCriteria"/.test(html()));
    ok('the first step is offered no run-if and no parallel — there is nothing beside it',
        !/id="nt-st-runIf"/.test(html()) && !/id="nt-st-parallel"/.test(html()));

    // it refuses IN the card
    posted = [];
    fld('nt-st-title').value = '';
    fld('nt-st-title').fire('input');
    fld('nt-stsave').click();
    ok('a nameless step is refused inside the card', html().includes('A step needs a title')
        && /id="stbox"/.test(html()));
    fld('nt-st-title').value = 'Collect';
    fld('nt-st-title').fire('input');
    fld('nt-st-prompt').value = '';
    fld('nt-st-prompt').fire('input');
    fld('nt-stsave').click();
    ok('…and so is one with no prompt', html().includes('An agent step needs a prompt'));
    fld('nt-st-prompt').value = 'collect the numbers';
    fld('nt-st-prompt').fire('input');
    fld('nt-st-agent').value = 'genel';
    fld('nt-st-agent').fire('change');
    fld('nt-stsave').click();
    ok('a complete step joins the chain and the card closes',
        !/id="stbox"/.test(html()) && html().includes('Collect') && html().includes('genel'));
    ok('the host has not been asked for anything yet — the draft is the page\'s',
        !posted.some(p => p.type === 'plan-save'));

    // ---- a second step, of a different kind
    fld('nt-stadd').click();
    fld('nt-st-stype').value = 'webhook';
    fld('nt-st-stype').fire('change');
    ok('a webhook step swaps the prompt for a URL',
        /id="nt-st-whUrl"/.test(html()) && !/id="nt-st-prompt"/.test(html()));
    ok('…and asks for the method, a body and one auth header',
        /id="nt-st-whMethod"/.test(html()) && /id="nt-st-whBody"/.test(html())
        && /id="nt-st-whHeader"/.test(html()));
    ok('polling is off until asked for', /id="nt-st-whPoll"/.test(html())
        && !/id="nt-st-whPollUrl"/.test(html()));
    fld('nt-st-whPoll').checked = true;
    fld('nt-st-whPoll').fire('change');
    ok('…and asking turns a one-shot call into a submit-then-poll client',
        /id="nt-st-whPollUrl"/.test(html()) && /id="nt-st-whStatusField"/.test(html())
        && /id="nt-st-whDone"/.test(html()) && /id="nt-st-whInterval"/.test(html()));
    ok('a second step CAN run beside the first', /id="nt-st-parallel"/.test(html())
        && /id="nt-st-runIf"/.test(html()));
    fld('nt-st-title').value = 'Notify';
    fld('nt-st-title').fire('input');
    fld('nt-st-whUrl').value = '';
    fld('nt-st-whUrl').fire('input');
    fld('nt-stsave').click();
    ok('a webhook with no URL is refused', html().includes('needs the URL it calls'));
    fld('nt-st-whUrl').value = 'https://n8n.example/hook';
    fld('nt-st-whUrl').fire('input');
    fld('nt-st-whPollUrl').value = 'urls.get';
    fld('nt-st-whPollUrl').fire('input');
    fld('nt-stsave').click();
    ok('…and one with a URL joins the chain', html().includes('Notify')
        && html().includes('https://n8n.example/hook'));

    // ---- the list is a list: it reorders, copies and deletes on the draft
    posted = [];
    query('[data-st="down"]').find(e => e.dataset.i === '0').click();
    ok('a step moves down the chain without asking the host',
        !posted.length && html().indexOf('Notify') < html().indexOf('Collect'));
    query('[data-st="up"]').find(e => e.dataset.i === '1').click();
    ok('…and back up', html().indexOf('Collect') < html().indexOf('Notify'));
    query('[data-st="dup"]').find(e => e.dataset.i === '0').click();
    ok('a step can be copied rather than retyped',
        (html().match(/Collect/g) || []).length >= 2);
    query('[data-st="del"]').find(e => e.dataset.i === '1').click();
    ok('…and deleted', (html().match(/Collect/g) || []).length === 1);

    // ---- saving sends the name and the chain in ONE message
    fld('nt-title').value = 'report chain';
    fld('nt-title').fire('input');
    posted = [];
    fld('nt-add').click();
    const wfSave = posted.find(p => p.type === 'plan-save');
    ok('‼️ the whole workflow is one save, not one dialog per step',
        wfSave && wfSave.item.kind === 'workflow' && wfSave.item.title === 'report chain'
        && wfSave.item.steps.length === 2);
    ok('…and each step carries its own shape',
        wfSave && wfSave.item.steps[0].stype === 'agent' && wfSave.item.steps[0].agent === 'genel'
        && wfSave.item.steps[1].stype === 'webhook'
        && wfSave.item.steps[1].whUrl === 'https://n8n.example/hook'
        && wfSave.item.steps[1].whPoll === true);

    // ---- the palette's addWorkflowStep / editWorkflowStep land on the same card
    send({
        type: 'plan-compose', kind: 'workflow',
        seed: {
            mode2: 'edit', id: 'w1', title: 'publish pipeline', stepIdx: 'new'.length && -1,
            steps: [{ stype: 'agent', title: 'render', agent: 'genel', prompt: 'render it', smode: 'headless' }]
        }
    });
    ok('“add a step” from outside the page opens the chain WITH the card up',
        /id="stbox"/.test(html()) && html().includes('publish pipeline') && html().includes('render'));
    send({
        type: 'plan-compose', kind: 'workflow',
        seed: {
            mode2: 'edit', id: 'w1', title: 'publish pipeline', stepIdx: 0,
            steps: [{ stype: 'media', title: 'render', mModel: 'fal-ai/flux/schnell', mInput: '{}' }]
        }
    });
    ok('“edit this step” opens that step, not the first field of a quickpick tree',
        /id="stbox"/.test(html()) && /id="nt-st-mModel"/.test(html()) && html().includes('Step 1'));
    ok('a media step offers the production scene, because the farm has one',
        /id="nt-st-mScene"/.test(html()) && html().includes('Tanıtım · Açılış'));
    ok('…and a vision-QA criteria, which is a verify by another name',
        html().includes('Vision QA criteria'));

    // ---- a trigger can finally point at a workflow
    send({ type: 'plan-compose', kind: 'trigger', seed: { mode2: 'new' } });
    ok('‼️ the trigger form offers "run a workflow" now that the host sends the list',
        html().includes('run a workflow') && html().includes('publish pipeline'));
    fld('nt-act').value = 'workflow';
    fld('nt-act').fire('change');
    ok('…and picking it asks WHICH workflow, and stops asking for a prompt',
        /id="nt-workflowId"/.test(html()) && !/id="nt-prompt"/.test(html()));
    fld('nt-close').click();
}

// ------------------- U-9 Faz 3: retry, template, and the in-page picker ----
{
    const send = (data) => onMessage.forEach(fn => fn({ data }));
    const fld = (id) => sandbox.document.getElementById(id);

    // ---- a retry is the whole task, editable
    send({
        type: 'task-compose',
        seed: {
            agent: 'genel', title: 'the failed one', prompt: 'do the thing', mode: 'headless',
            model: 'haiku', mode2: 'retry', retryOf: 'r4'
        }
    });
    ok('a retry says it is a retry rather than pretending to be new',
        html().includes('Retry task') && !html().includes('New task</span>'));
    ok('…and it is the whole form, not one box holding the old prompt',
        /id="nt-model"/.test(html()) && /id="nt-effort"/.test(html())
        && /id="nt-permissionMode"/.test(html()) && /id="nt-agent"/.test(html()));
    ok('…with the button saying what pressing it does', html().includes('Retry it now'));
    fld('nt-model').value = 'opus';
    fld('nt-model').fire('change');
    posted = [];
    fld('nt-add').click();
    const retried = posted.find(p => p.type === 'task-new');
    ok('‼️ the retry names the run it is a retry OF, so the host keeps the lineage',
        retried && retried.task.retryOf === 'r4' && retried.task.model === 'opus');
    send({ type: 'task-made', id: 'n9', title: 'the failed one (retry 1)', started: true });

    // ---- a template may be unbound, and that is a field now, not a first question
    send({
        type: 'plan-compose', kind: 'template',
        seed: { mode2: 'new', title: 'triage', prompt: 'triage it', mode: 'headless', agent: 'genel' }
    });
    ok('saving a run as a template opens the template form, prefilled',
        /id="ntbox"/.test(html()) && html().includes('New template')
        && /id="nt-title"[^>]*value="triage"/.test(html()));
    ok('‼️ …and "any agent" is one entry in the picker, not a modal asked first',
        html().includes('any agent: you pick when you launch it'));
    // ‼️ REVERSED IN X-35, ON PURPOSE. This used to assert that a template gets
    // no model and no project — "it is a saved prompt". Once a task could
    // choose its ENGINE that stopped being a simplification and became a hole:
    // a run set up on Codex and saved as a template came back as Claude every
    // time, silently, and the object whose entire purpose is "that launch
    // again" was the only one that could not state a launch. A template is a
    // task you have not run yet, so it takes a task's dimensions.
    ok('‼️ a template carries the LAUNCH it was saved with — engine, model, project',
        /id="nt-model"/.test(html()) && /id="nt-project"/.test(html()));
    fld('nt-cancel').click();

    // ---- "which month of history?" is a list on the page
    send({
        type: 'chooser',
        chooser: {
            tab: 'run', title: 'Task history', lede: 'One file per month.', verb: 'open', act: 'history',
            items: [{ id: '2026-08.jsonl', label: '2026-08', detail: '12 KB · last written 07.08.2026' }]
        }
    });
    ok('the picker is drawn ON the page, with what a quickpick could not say',
        /id="chbox"/.test(html()) && html().includes('Task history')
        && html().includes('2026-08') && html().includes('12 KB'));
    posted = [];
    query('[data-ch]')[0].click();
    ok('picking a row tells the host which one, by the act the list was for',
        posted[0] && posted[0].type === 'chooser-pick' && posted[0].act === 'history'
        && posted[0].id === '2026-08.jsonl');
    ok('…and the picker closes behind it', !/id="chbox"/.test(html()));

    // ---- "which template?" is the Plan tab, filtered
    send({
        type: 'plan-focus', view: { kind: ['template'] },
        note: 'Every template you have saved — press run on the one you want.'
    });
    ok('the answer to "which template" is this page\'s own list',
        /class="tab on" data-tab="plan"/.test(html())
        && html().includes('press run on the one you want'));
    ok('…already filtered to templates, and saying so where filters are always visible',
        html().includes('kind: template'));
    resetView();
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

// ---------- X-18: an unattended run states its ENGINE too ----------
//
// ‼️ AND THIS IS THE SURFACE WHERE GETTING IT WRONG IS QUIETEST. Nobody is
// sitting in front of a task: an engine that is not installed does not fail
// visibly, it writes "command not found" into an archived file somebody opens
// hours later. So the form refuses it up front, the runner refuses it again
// before the spawn, and the archive says which engine produced what it holds.
{
    const page = fs.readFileSync(path.join(__dirname, '..', 'media', 'tasksPage.js'), 'utf8');
    const panel = fs.readFileSync(path.join(__dirname, '..', 'src', 'panels', 'tasksPanel.ts'), 'utf8');
    const tasks = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'tasks.js').replace('.js', '.ts'), 'utf8');

    ok('the form has an engine row', /<select id="nt-engine">/.test(page));
    ok('…drawn only when there is more than one engine to choose between',
        /if \(list\.length < 2\) \{ return ''; \}/.test(page));
    ok('‼️ …offering one that cannot run as disabled, with the reason on the row',
        /\$\{e\.ready \? '' : ' disabled'\}/.test(page) && /cannot run here/.test(page));
    // ‼️ …AND IT NAMES EACH ENGINE'S OWN MECHANISM (X-35). "a SANDBOX" was said
    // for all of them, which told the user that Gemini and Antigravity have a
    // Codex sandbox. And "because it goes against a plan" asserted a billing
    // arrangement off a capability flag — on an API key those turns are billed.
    ok('…and it says what differs on a per-turn engine, per engine',
        /Codex sandbox/.test(page) && /Gemini approval mode/.test(page)
        && /Antigravity a request its own app can overrule/.test(page)
        && /counting tokens instead/.test(page)
        && !/goes against a plan/.test(page));
    ok('‼️ …and that gemini has no effort setting, so the box is not drawn for it',
        /Gemini has no reasoning-effort setting/.test(page)
        && /if \(String\(engine \|\| ''\) === 'gemini'\) \{ return \[\]; \}/.test(page)
        && /if \(!\(list \|\| \[\]\)\.length\) \{ return ''; \}/.test(page));
    ok('the value is read, carried and re-seeded like every other dimension',
        /v\('engine', 'engine'\)/.test(page)
        && /engine: t\.engine \?\? '',/.test(panel)
        && /\.\.\.\(str\('engine'\) \? \{ engine: str\('engine'\) \} : \{\}\)/.test(panel));

    ok('‼️ the runner refuses an engine this machine cannot run, before the spawn',
        /engineRefusal\?: \(engine: string \| undefined\) => string \| undefined;/.test(tasks)
        && /const refused = this\.opts\.engineRefusal\?\.\(task\.engine\);/.test(tasks));
    ok('…and only when the task names one — a CLI profile is a different mechanism',
        /if \(task\.engine && !task\.cli\)/.test(tasks));
    // ‼️ ASKED BY ENGINE, NOT BY NAME. When Codex was the only per-turn engine
    // these were `codexRunArgs` / `codexTuiArgs` called directly; a second one
    // would have meant an `if` here and another in the Console and another in
    // the launcher. The dispatch is `consoleEngine.ts`'s job now.
    ok('a per-turn engine gets its own command, not claude\'s flags',
        /runArgs\(engine\.id, \{/.test(tasks) && /tuiArgs\(engine\.id, \{/.test(tasks));
    ok('‼️ …with the prompt on stdin, which is what lets it carry the project brief',
        /stdio: \[pipePrompt \? 'pipe' : 'ignore', 'pipe', 'pipe'\]/.test(tasks)
        && /engineContextPrefix\(this\.readContext\(ctxFile\)\)/.test(tasks));
    // ‼️ …EXCEPT ON THE ENGINE WITH NO PIPE FOR IT. `agy --print` takes the
    // prompt as its value and reads nothing from stdin (measured), so that run
    // is an argv array spawned with NO shell — the only way a multi-line prompt
    // survives on Windows.
    ok('‼️ …and the engine that takes its prompt in argv is spawned without a shell',
        /engine\.promptOn === 'argv'/.test(tasks)
        && /\['--print', perTurnPrompt, \.\.\.runArgs\(/.test(tasks)
        && /cp\.spawn\(engine\.exe, argv, \{[\s\S]{0,200}shell: false,/.test(tasks));
    ok('‼️ …and it is told which folder it may see, or it answers about its own scratch one',
        /cwd: task\.workDir \?\? agent\.dir/.test(tasks));
    ok('…and agentFarm.taskExtraArgs, the model policy and --output-format json '
        + 'are NOT passed to a binary that has never heard of them',
        /if \(!profile && !perTurn\)/.test(tasks)
        && /task\.outputContract === 'json' && !perTurn/.test(tasks));
    // ‼️ THE UP-FRONT SETTING IS NAMED BY THE ENGINE THAT HAS IT (X-35). This
    // used to be `- Sandbox: ${codexSandboxFor(...)}` for every per-turn engine
    // that was not Antigravity — which, once Gemini had a transport, wrote
    // "Sandbox: read-only" into the archive of a run that had no sandbox at all,
    // only an approval mode. One resolver names it: Codex → Sandbox, Gemini →
    // Approval mode, Antigravity → none, print the note instead.
    ok('the archive says which engine produced it, and names that engine\'s own permission setting',
        /- Engine: \$\{engine\.label\}/.test(tasks)
        && /enginePermissionSetting\(engine\.id, task\.permissionMode\)/.test(tasks)
        && /- \$\{set\.label\}: \$\{set\.value\}/.test(tasks));
    // ‼️ …and NOT the same sentence for an engine where it means something else:
    // on Antigravity the mode is a request the app's own setting can overrule
    // (measured — plan mode still wrote a file), so that archive says permissions,
    // not sandbox.
    ok('‼️ …and an engine whose mode is not a sandbox does not claim one',
        /- Permissions: \$\{note\}/.test(tasks));
    ok('‼️ …and that the json contract was not applied, where a reader will find it',
        /json was NOT applied/.test(tasks));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
