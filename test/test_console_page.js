// DOM-stub test for the Console page (media/console.js): the tail-following
// contract and the line filter.
//
// Both exist because a streaming conversation has two readers in one: the one
// watching the newest line and the one who scrolled up to read something. The
// page used to serve only the first — every arriving line yanked the view back
// down — and showed every kind of line whether or not it was worth reading.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const createAfmsDom = require(path.join(__dirname, 'lib_afms_dom.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const code = fs.readFileSync(path.resolve(__dirname, '../media/afFilters.js'), 'utf8')
    + '\n' + fs.readFileSync(path.resolve(__dirname, '../media/console.js'), 'utf8');

// ---------- fake DOM ----------
const els = {};
function mkEl(id) {
    return {
        id, _html: '', listeners: {}, hidden: true, textContent: '',
        // _writes / _focus are how the test proves the page stopped rebuilding
        // itself (and re-focusing the textarea) on every streamed line.
        _writes: 0, _focus: 0,
        scrollTop: 0, scrollHeight: 1000, clientHeight: 300,
        set innerHTML(v) { this._html = v; this._writes++; }, get innerHTML() { return this._html; },
        addEventListener(ev, fn) { this.listeners[ev] = fn; },
        focus() { this._focus++; }, value: ''
    };
}
const app = () => els.app || (els.app = mkEl('app'));
const talk = () => els.talk;
const jump = () => els['c-jump'];

let posted = [];
let state = {};
let msgHandler = null;

const sandbox = {
    acquireVsCodeApi: () => ({
        postMessage: m => posted.push(m),
        getState: () => state,
        setState: s => { state = s; }
    }),
    window: {
        AFCharts: {
            esc: s => String(s === undefined || s === null ? '' : s).replace(/</g, '&lt;'),
            fmtUSD: v => '$' + (v || 0),
            fmtTok: v => v + 't'
        },
        AFHeader: { html: () => '<header>', wire: () => { } },
        addEventListener: (ev, fn) => { if (ev === 'message') { msgHandler = fn; } }
    },
    document: {
        getElementById: id => {
            // The page builds its shell once and then writes into named slots,
            // so an element exists as soon as the shell — or any slot already
            // written — mentions its id.
            if (id === 'app') { return app(); }
            if (!allHtml().includes(`id="${id}"`)) { return null; }
            return els[id] || (els[id] = mkEl(id));
        },
        querySelectorAll: sel => {
            if (sel.indexOf('[data-afms') === 0) { return []; }
            return [];
        },
        querySelector: sel => (sel.indexOf('[data-afms') === 0 ? afms.querySelector(sel) : null),
        addEventListener: () => { }
    },
    console
};
/** Everything currently on the page: the shell plus every slot written into it. */
const allHtml = () => app()._html + Object.keys(els).map(k => els[k]._html || '').join('');
const afms = createAfmsDom(() => allHtml());
sandbox.window.window = sandbox.window;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const msg = (role, extra) => Object.assign({ id: 'm' + Math.random(), ts: 1, role }, extra);
const session = (msgs) => ({
    id: 'cs1', agentName: 'developer', sessionId: '407c78cb-aaaa', title: 'Kalan eksikler',
    cwd: 'D:/a/dev', status: 'idle', cost: 0.12, turns: 3, queued: 0, tokens: 48200,
    model: 'claude-opus-5', permissionMode: 'default', contextTokens: 24100, lastTs: Date.now(),
    pendingPermission: null, exitReason: '', messages: msgs
});
const CONVO = [
    msg('user', { text: 'read the report' }),
    msg('agent', { text: 'on it' }),
    msg('tool', { tool: { name: 'Read', detail: 'D:/a/b.md' } }),
    msg('tool', { text: 'file body' }),
    msg('tool', { text: 'permission denied', isError: true }),
    msg('result', { text: '', cost: 0.01 })
];
const data = (msgs) => ({
    generatedAt: 1, selected: 'cs1', presetAgent: '', sessions: [session(msgs)],
    agents: [{ id: 'dev', name: 'developer', dir: 'D:/a/dev' }],
    models: [], efforts: [], permissions: [{ id: 'default', label: 'default' }],
    grants: [], defaults: {}, owned: [], resumable: []
});

// Same global htmlShell injects — the page reads its first payload from here.
sandbox.window.__DATA__ = data(CONVO.slice());
vm.runInContext(code, sandbox);
const push = d => msgHandler({ data: { type: 'data', data: d } });
const html = allHtml;

// ---------- the row says who, which session, and what it costs ----------
{
    ok('the card carries the agent AND the session id',
        /developer<span class="sid">\(#407c78cb\)<\/span>/.test(html().replace(/\s+</g, '<')));
    ok('…the cost with the tokens it bought', html().includes('$0.12 (48200t)'));
    ok('…and the context the window is holding now', html().includes('ctx 24100t'));
    ok('…with the session\'s own name under the agent', html().includes('Kalan eksikler'));
}

// ---------- the page is built once, then patched ----------
// Rebuilding it on every streamed line destroyed the textarea you were typing
// in, which then had to be re-focused — and focusing scrolls the element into
// view, which is what kept dragging the page down while you were reading.
{
    const text = () => els['c-text'];
    const builds = app()._writes;
    ok('the shell is built once', builds === 1);
    ok('…and the composer is focused once', text()._focus === 1);

    text().value = 'yarım cümle';
    push(data(CONVO.concat([msg('agent', { text: 'streamed' })])));
    push(data(CONVO.concat([msg('agent', { text: 'streamed' }), msg('agent', { text: 'more' })])));
    ok('a streamed line does NOT rebuild the page', app()._writes === builds);
    ok('…does not touch the composer', text()._focus === 1 && text().value === 'yarım cümle');
    ok('…and the conversation itself is what gets written', talk().innerHTML !== '' || els.talkinner._writes > 0);

    // the layout is an app layout: the conversation is the only scroller and a
    // short one sits ON the composer instead of leaving a gap in the middle
    ok('the conversation area has no max-height to leave a gap under',
        !/\.talk \{[^}]*max-height/.test(html()));
    ok('…and short conversations are pushed to the bottom',
        /\.talkinner \{[^}]*margin-top:auto/.test(html()));
}

// ---------- following the tail ----------
{
    talk().scrollTop = talk().scrollHeight;
    talk().listeners.scroll();
    push(data(CONVO.slice()));
    ok('a fresh render lands at the newest line', talk().scrollTop === talk().scrollHeight);
    ok('…with nothing to jump to', jump().hidden === true);

    // the reader scrolls up to read something
    talk().scrollTop = 100;
    push(data(CONVO.concat([msg('agent', { text: 'and another thing' })])));
    ok('a line arriving while you are scrolled up does NOT move the view', talk().scrollTop === 100);
    ok('…it is counted instead', jump().hidden === false && jump().textContent === '↓ 1 new line');

    push(data(CONVO.concat([
        msg('agent', { text: 'and another thing' }), msg('agent', { text: 'more' })
    ])));
    ok('…and the count keeps up', jump().textContent === '↓ 2 new lines');
    ok('…while the view still has not moved', talk().scrollTop === 100);

    // the pill takes you back
    jump().listeners.click();
    ok('the jump button lands at the tail', talk().scrollTop === talk().scrollHeight);
    ok('…and stops offering itself', jump().hidden === true);

    // once you are back at the bottom, following resumes by itself
    push(data(CONVO.concat([msg('agent', { text: 'x' }), msg('agent', { text: 'y' }), msg('agent', { text: 'z' })])));
    ok('back at the tail, new lines follow again', talk().scrollTop === talk().scrollHeight
        && jump().hidden === true);

    // scrolling back down by hand clears the badge without waiting for a line
    talk().scrollTop = 50;
    push(data(CONVO.concat([
        msg('agent', { text: 'x' }), msg('agent', { text: 'y' }),
        msg('agent', { text: 'z' }), msg('agent', { text: 'q' })
    ])));
    ok('scrolled up again, the badge is back', jump().hidden === false);
    talk().scrollTop = talk().scrollHeight;
    talk().listeners.scroll();
    ok('…and scrolling to the bottom clears it', jump().hidden === true);
}

// ---------- the line filter ----------
{
    talk().scrollTop = talk().scrollHeight;
    push(data(CONVO.slice()));
    ok('everything is shown by default',
        html().includes('read the report') && html().includes('on it')
        && html().includes('file body') && html().includes('permission denied'));
    ok('…and the filter says so', afms.label('c-kinds').indexOf('everything') >= 0);

    afms.open('c-kinds');
    afms.clear('c-kinds');
    afms.toggle('c-kinds', 'user', true);
    ok('ticking only "You" leaves just your own lines',
        html().includes('read the report')
        && !html().includes('on it') && !html().includes('file body'));
    ok('…and says how many lines it is hiding', /5 line\(s\) hidden by/.test(html()));
    ok('…the choice is remembered across a data push', (() => {
        push(data(CONVO.slice()));
        return !html().includes('file body');
    })());
    ok('…and it survives a reload (webview state)',
        state.afConsole && Array.isArray(state.afConsole.kinds)
        && state.afConsole.kinds.join(',') === 'user');

    afms.toggle('c-kinds', 'error', true);
    ok('a second kind adds its lines back',
        html().includes('read the report') && html().includes('permission denied')
        && !html().includes('file body'));

    afms.selectAll('c-kinds');
    ok('Select all means no filter at all — a kind added later is in',
        state.afConsole.kinds === null && html().includes('file body'));

    afms.clear('c-kinds');
    ok('Clear is an honest empty view, not a reset',
        /Every line is filtered out/.test(html()));
}

// ---------- a line you filtered out is not news you are missing ----------
{
    afms.open('c-kinds');
    afms.clear('c-kinds');
    afms.toggle('c-kinds', 'user', true);   // only your own lines
    jump().hidden = true;
    talk().scrollTop = 100;                 // scrolled up, reading
    push(data(CONVO.concat([
        msg('tool', { tool: { name: 'Bash', detail: 'npm test' } }),
        msg('tool', { text: 'lots of output' })
    ])));
    ok('tool lines arriving under a "You only" filter are not counted',
        jump().hidden === true && talk().scrollTop === 100);
    push(data(CONVO.concat([
        msg('tool', { tool: { name: 'Bash', detail: 'npm test' } }),
        msg('user', { text: 'stop' })
    ])));
    ok('…but a line the filter DOES let through still is',
        jump().hidden === false && jump().textContent === '↓ 1 new line');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
