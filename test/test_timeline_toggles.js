// DOM-stub test for the Live Timeline's YOUR TURN controls (the real page
// handlers, not a copy of them).
//
// ‼️ THE BUG THIS FILE IS THE MEASUREMENT OF (U-66). The gutter controls used
// to carry `data-agent`, so three concurrent sessions of `developer` drew three
// rows that all showed one setting and a click on any of them changed all
// three. The row is a SESSION; every assertion below is about that.
const fs = require('fs');
const vm = require('vm');

const shared = require(require('path').join(__dirname, 'lib_shared_media.js'));
const code = shared.sharedMedia() + fs.readFileSync(require('path').resolve(__dirname, '../media/timeline.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

/** Pull the `<g class="…">` groups the page drew, with their data attributes. */
function groups(html, cls) {
    const out = [];
    const re = new RegExp('<g class="' + cls + '"([^>]*)>', 'g');
    let m;
    while ((m = re.exec(html))) {
        const attrs = m[1];
        const pick = (k) => { const g = new RegExp(k + '="([^"]*)"').exec(attrs); return g ? g[1] : undefined; };
        out.push({
            raw: m[0],
            dataset: {
                session: pick('data-session'), action: pick('data-action'),
                disabled: pick('data-disabled'), agent: pick('data-agent')
            },
            aria: pick('aria-checked')
        });
    }
    return out;
}

/** Boot the page script against a data payload and return what it drew. */
function boot(data) {
    let html = '';
    const posted = [];
    const live = { '.af-toggle': [], '.af-alerttest': [] };
    const app = { set innerHTML(v) { html = v; }, get innerHTML() { return html; } };
    const stub = { addEventListener() { }, set innerHTML(v) { } };
    const box = {
        acquireVsCodeApi: () => ({ postMessage: (m) => posted.push(m), getState() { }, setState() { } }),
        window: {
            AFCharts: { esc: (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') },
            __DATA__: data,
            addEventListener(_t, fn) { box.window._onMessage = fn; }
        },
        document: {
            getElementById: (id) => id === 'app' ? app : (id === 'install' ? null : stub),
            querySelectorAll: (sel) => {
                if (sel !== '.af-toggle' && sel !== '.af-alerttest') { return []; }
                const cls = sel.slice(1);
                const els = groups(html, cls).map(g => {
                    const el = { dataset: g.dataset, aria: g.aria };
                    el.addEventListener = (_e, fn) => { el._click = fn; };
                    return el;
                });
                live[sel] = els;
                return els;
            }
        },
        setInterval: () => 1, clearInterval: () => { }, console
    };
    box.globalThis = box;
    vm.createContext(box);
    vm.runInContext(code, box);
    return {
        get html() { return html; },
        posted,
        toggles: () => live['.af-toggle'],
        tests: () => live['.af-alerttest'],
        message: (m) => { box.window._onMessage({ data: m }); },
        data
    };
}

const t0 = Date.now() - 120000;
const sess = (sessionId, label, extra) => Object.assign({
    sessionId, agentName: 'dev', label, resolved: true, status: 'waiting-input',
    prompts: 1, toolCalls: 0, compactions: 0, subagentStops: 0,
    startedAt: t0, lastEventTs: Date.now()
}, extra || {});

const base = (sessions, sessionAlerts, events) => ({
    listener: { state: 'listening', port: 1 },
    sessions, events: events || [], workflowRuns: [],
    sessionAlerts: sessionAlerts || {},
    alertActions: ['sound', 'focus', 'modal', 'toast']
});

// ---------------------------------------------------------------------------
// ‼️ THREE CONCURRENT SESSIONS OF ONE AGENT — three rows, three selections.
// ---------------------------------------------------------------------------
const three = boot(base(
    [
        sess('S1aaaaaa-1111', 'dev #1'),
        sess('S2bbbbbb-2222', 'dev #2', { startedAt: t0 + 1000 }),
        sess('S3cccccc-3333', 'dev #3', { startedAt: t0 + 2000 })
    ],
    { 'S1aaaaaa-1111': ['sound'], 'S2bbbbbb-2222': ['focus', 'modal'] },
    [
        { ts: t0, sessionId: 'S1aaaaaa-1111', agentName: 'dev', kind: 'prompt' },
        { ts: t0 + 1000, sessionId: 'S2bbbbbb-2222', agentName: 'dev', kind: 'prompt' },
        { ts: t0 + 2000, sessionId: 'S3cccccc-3333', agentName: 'dev', kind: 'prompt' }
    ]
));

ok('three concurrent sessions make three rows',
    /dev #1/.test(three.html) && /dev #2/.test(three.html) && /dev #3/.test(three.html));
const gs = groups(three.html, 'af-toggle');
ok('twelve controls — four per row', gs.length === 12);
ok('‼️ every control names its own SESSION',
    gs.every(g => ['S1aaaaaa-1111', 'S2bbbbbb-2222', 'S3cccccc-3333'].indexOf(g.dataset.session) >= 0));
ok('‼️ and none of them keys off the agent any more',
    gs.every(g => g.dataset.agent === undefined) && !/data-agent="dev"/.test(three.html));

const on = (sid, action) => {
    const g = gs.find(x => x.dataset.session === sid && x.dataset.action === action);
    return !!g && g.aria === 'true';
};
ok('session 1 shows sound ON and the rest off',
    on('S1aaaaaa-1111', 'sound') && !on('S1aaaaaa-1111', 'focus') && !on('S1aaaaaa-1111', 'modal'));
ok('session 2 shows focus+modal ON', on('S2bbbbbb-2222', 'focus') && on('S2bbbbbb-2222', 'modal'));
ok('session 2 does NOT inherit session 1\'s sound', !on('S2bbbbbb-2222', 'sound'));
ok('session 3 shows nothing on — there is no agent default behind it',
    ['sound', 'focus', 'modal', 'toast'].every(a => !on('S3cccccc-3333', a)));

// A selected control is not a fill alone: it carries a tick and an aria state,
// because a hover fill left behind on some themes made the row lie.
const soundOn = gs.find(g => g.dataset.session === 'S1aaaaaa-1111' && g.dataset.action === 'sound');
ok('a checked control announces itself to a screen reader', soundOn.aria === 'true');
ok('a checked control also wears a tick', /stroke="var\(--vscode-charts-green/.test(three.html));
ok('every control is a checkbox with a label',
    (three.html.match(/role="checkbox"/g) || []).length === 12
    && (three.html.match(/aria-label="/g) || []).length >= 12);

// ---- clicking row 3 touches row 3 and nothing else ----
three.posted.length = 0;
three.toggles().find(e => e.dataset.session === 'S3cccccc-3333' && e.dataset.action === 'toast')._click();
ok('one click sends exactly one message', three.posted.length === 1);
ok('‼️ it is {sessionId, action, enabled} — never the whole map',
    three.posted[0].type === 'setTurnAlert'
    && three.posted[0].sessionId === 'S3cccccc-3333'
    && three.posted[0].action === 'toast'
    && three.posted[0].enabled === true
    && three.posted[0].map === undefined);

// Turning an ON control off asks for `enabled:false` on that session only.
three.posted.length = 0;
three.toggles().find(e => e.dataset.session === 'S2bbbbbb-2222' && e.dataset.action === 'focus')._click();
ok('turning one off names the same session and asks for false',
    three.posted[0].sessionId === 'S2bbbbbb-2222' && three.posted[0].enabled === false);

// ---- the host is the authority: the page redraws from what came BACK ----
three.message({
    type: 'data',
    data: base(
        [sess('S1aaaaaa-1111', 'dev #1'), sess('S2bbbbbb-2222', 'dev #2', { startedAt: t0 + 1000 }),
         sess('S3cccccc-3333', 'dev #3', { startedAt: t0 + 2000 })],
        { 'S1aaaaaa-1111': ['sound'], 'S2bbbbbb-2222': ['modal'], 'S3cccccc-3333': ['toast'] },
        three.data.events)
});
const after = groups(three.html, 'af-toggle');
const isOn = (sid, a) => {
    const g = after.find(x => x.dataset.session === sid && x.dataset.action === a);
    return !!g && g.aria === 'true';
};
ok('the redraw follows the host, not the click', isOn('S3cccccc-3333', 'toast')
    && isOn('S2bbbbbb-2222', 'modal') && !isOn('S2bbbbbb-2222', 'focus'));
ok('and session 1 is still untouched by any of it', isOn('S1aaaaaa-1111', 'sound'));

// ---------------------------------------------------------------------------
// The second control surface is GONE (ONE SUBJECT): the setting lives in the
// lane, and only there. The card used to carry a second copy of the chips plus
// an "(agent default)" line, which is what hid the per-session setting.
// ---------------------------------------------------------------------------
ok('no second copy of the controls on the cards', !/alert on your turn:/.test(three.html));
ok('no "agent default" wording anywhere', !/agent default/.test(three.html));
ok('no session-override reset link', !/af-reset/.test(three.html));

// ---------------------------------------------------------------------------
// A row that is only history cannot arm an alert that could never fire.
// ---------------------------------------------------------------------------
const hist = boot(base(
    [sess('LIVEaaaa-1111', 'dev #2', { startedAt: t0 + 5000 })],
    { 'LIVEaaaa-1111': ['sound'] },
    [
        { ts: t0, sessionId: 'DEADbbbb-2222', agentName: 'old', kind: 'prompt' },
        { ts: t0 + 100, sessionId: 'DEADbbbb-2222', agentName: 'old', kind: 'stop' },
        { ts: t0 + 5000, sessionId: 'LIVEaaaa-1111', agentName: 'dev', kind: 'prompt' }
    ]
));
const hg = groups(hist.html, 'af-toggle');
ok('the historical row draws its controls disabled',
    hg.filter(g => g.dataset.session === 'DEADbbbb-2222').every(g => g.dataset.disabled === '1'));
ok('the live row does not', hg.filter(g => g.dataset.session === 'LIVEaaaa-1111')
    .every(g => g.dataset.disabled === undefined));
hist.posted.length = 0;
hist.toggles().find(e => e.dataset.session === 'DEADbbbb-2222')._click();
ok('clicking a disabled control sends nothing', hist.posted.length === 0);

// ---------------------------------------------------------------------------
// "Test in 3 seconds" — one per row, disabled when there is nothing to test.
// ---------------------------------------------------------------------------
const tg = groups(three.html, 'af-alerttest');
ok('every row gets a test control', tg.length === 3);
ok('a row with a selection can be tested',
    tg.find(g => g.dataset.session === 'S1aaaaaa-1111').dataset.disabled === undefined);

const none = boot(base([sess('N1aaaaaa-1111', 'solo')], {},
    [{ ts: t0, sessionId: 'N1aaaaaa-1111', agentName: 'dev', kind: 'prompt' }]));
ok('a row with nothing selected cannot be tested',
    groups(none.html, 'af-alerttest')[0].dataset.disabled === '1');
none.posted.length = 0;
none.tests()[0]._click();
ok('and clicking it sends nothing', none.posted.length === 0);

three.posted.length = 0;
three.tests().find(e => e.dataset.session === 'S1aaaaaa-1111')._click();
ok('testing asks the HOST to run the countdown',
    three.posted.length === 1 && three.posted[0].type === 'testTurnAlert'
    && three.posted[0].sessionId === 'S1aaaaaa-1111' && three.posted[0].delayMs === 3000);
ok('the countdown is on screen while it runs',
    /testing in \ds/.test(three.html) && /switch to another window/.test(three.html));

// ---- and the result names every branch, sound backend included ----
three.message({
    type: 'alertTest',
    result: {
        ok: true, sessionId: 'S1aaaaaa-1111', label: 'dev #1', at: Date.now(),
        actions: ['sound', 'focus'],
        branches: [
            { action: 'sound', status: 'failed', ms: 812, detail: 'powershell:SoundPlayer exited 1',
              sound: { backend: 'powershell:SoundPlayer', ok: false, exitCode: 1, stderr: 'no audio device', durationMs: 812 } },
            { action: 'focus', status: 'ok', ms: 12 },
            { action: 'modal', status: 'skipped', ms: 0 },
            { action: 'toast', status: 'skipped', ms: 0 }
        ]
    }
});
ok('the result strip is drawn', /Alert test/.test(three.html));
ok('the failing branch is named with its backend and exit code',
    /powershell:SoundPlayer/.test(three.html) && /exit: 1/.test(three.html));
ok('stderr is carried, not swallowed', /no audio device/.test(three.html));
ok('‼️ and the page refuses to claim the sound was HEARD',
    /AUDIBLE is yours to confirm/.test(three.html));
ok('every branch appears, skipped ones included',
    /Focus \/ bring forward: ok/.test(three.html)
    && /Modal alert box: skipped/.test(three.html)
    && /Toast \(corner notification\): skipped/.test(three.html));
ok('the long result is an AFTip, not a native title', /af-tip/.test(three.html));
ok('the strip names the session by its short id', /#S1aaaaaa/.test(three.html));

// A refused test says why instead of reading as a silent success.
three.message({
    type: 'alertTest',
    result: { ok: false, sessionId: 'S3cccccc-3333', error: 'nothing selected' }
});
ok('a refused test says so', /not run/.test(three.html) && /nothing selected/.test(three.html));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
