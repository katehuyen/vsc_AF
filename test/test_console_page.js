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
            // enough of a query engine for the rows the page wires by hand
            const m = /^\[data-([a-z]+)\]$/.exec(sel);
            if (!m) { return []; }
            const attr = 'data-' + m[1];
            const camel = m[1];
            const out = [];
            const re = new RegExp(attr + '="([^"]*)"', 'g');
            let hit;
            const html = allHtml();
            while ((hit = re.exec(html))) {
                // cached per attribute+value: the page wires the object it was
                // handed, and the test must get that same object back
                const key = attr + '=' + hit[1];
                let el = qsCache[key];
                if (!el) {
                    el = { dataset: { [camel]: hit[1] } };
                    el.addEventListener = (_t, fn) => { el._fn = fn; };
                    qsCache[key] = el;
                }
                out.push(el);
            }
            return out;
        },
        querySelector: sel => (sel.indexOf('[data-afms') === 0 ? afms.querySelector(sel) : null),
        addEventListener: () => { }
    },
    // the working strip turns its glyph on a timer; the test drives it by hand
    setInterval: (fn) => { timers.push(fn); return timers.length; },
    clearInterval: (h) => { timers[h - 1] = null; },
    console
};
const timers = [];
const tickTimers = () => timers.forEach(fn => { if (fn) { fn(); } });
const qsCache = {};
/** Everything currently on the page: the shell plus every slot written into it. */
const allHtml = () => app()._html + Object.keys(els).map(k => els[k]._html || '').join('');
const afms = createAfmsDom(() => allHtml());
sandbox.window.window = sandbox.window;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const msg = (role, extra) => Object.assign({ id: 'm' + Math.random(), ts: 1, role }, extra);
const session = (msgs, extra) => Object.assign({
    id: 'cs1', agentId: 'dev', agentName: 'developer', sessionId: '407c78cb-aaaa', title: 'Kalan eksikler',
    cwd: 'D:/a/dev', status: 'idle', cost: 0.12, turns: 3, queued: [], tokens: 48200,
    model: 'claude-opus-5', permissionMode: 'default', contextTokens: 24100, lastTs: Date.now(),
    pendingPermission: null, exitReason: '', messages: msgs
}, extra || {});
const CONVO = [
    msg('user', { text: 'read the report' }),
    msg('agent', { text: 'on it' }),
    msg('tool', { tool: { name: 'Read', detail: 'D:/a/b.md' } }),
    msg('tool', { text: 'file body' }),
    msg('tool', { text: 'permission denied', isError: true }),
    msg('result', { text: '', cost: 0.01 })
];
const data = (msgs, extra) => ({
    generatedAt: 1, selected: 'cs1', presetAgent: '', sessions: [session(msgs, extra)],
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

// ---------- a message typed mid-turn WAITS ----------
// It used to be written into the conversation the moment it was typed, which
// put it above the reply it was asked after and pushed the running turn up the
// page. A terminal keeps it on the line until it is sent; so does this.
{
    afms.open('c-kinds');
    afms.selectAll('c-kinds');
    talk().scrollTop = talk().scrollHeight;
    push(data(CONVO.slice(), { status: 'working', queued: ['do this next', 'and then this'] }));
    const q = els['c-queue'] ? els['c-queue']._html : '';
    ok('what is waiting is shown, in order, above the composer',
        /2 messages waiting/.test(q)
        && q.indexOf('do this next') > 0 && q.indexOf('do this next') < q.indexOf('and then this'));
    const convo = () => (els.talkinner ? els.talkinner._html : '');
    ok('…and is NOT in the conversation yet', !convo().includes('do this next'));
    ok('…the row and the composer say how many are waiting',
        /2 waiting/.test(allHtml()));

    push(data(CONVO.slice(), { status: 'working', queued: [] }));
    ok('an emptied queue leaves no strip behind',
        (els['c-queue']._html || '') === '');
}

// ---------- "Talk to Agent" lands on the composer, with that agent chosen ----------
{
    const withPreset = data(CONVO.slice());
    withPreset.selected = '';            // composer mode, as the command opens it
    withPreset.presetAgent = 'dev';
    push(withPreset);
    ok('the agent picker asks as a sentence', allHtml().includes('Choose an agent…'));
    ok('…and the agent handed over is the one selected',
        state.afConsole.agentId === 'dev'
        && (els['c-agent'] ? els['c-agent'].value === 'dev' : /value="dev" selected/.test(allHtml())));
    ok('…while a session that agent already has running is offered, not hidden',
        /already has a session running here/.test(allHtml()));
}

// ---------- whose turn is it ----------
// The left panel's whole job, across many cards: who holds the ball, and for
// how long. Colour is never alone (every state says its word); only the state
// that resolves itself moves; and the list never reorders itself under you.
{
    const list = () => (els['c-list'] ? els['c-list']._html : '');
    const style = () => app()._html;

    push(data(CONVO.slice()));   // replied and stopped
    ok('a session that replied and stopped says it is your turn',
        /class="srow p-you/.test(list()) && />your turn/.test(list()));
    ok('…and how long it has been waiting', /your turn · \d+[smh]/.test(list()));
    ok('…with the panel calling it out once, clickably',
        /id="c-next"/.test(list()) && /1 waiting for you/.test(list()));

    push(data(CONVO.slice(), { status: 'working', turnStartedAt: Date.now() }));
    ok('a running turn is the agent\'s ball', /class="srow p-agent/.test(list()) && />working/.test(list()));
    ok('…and nothing is calling for you', !/waiting for you/.test(list()));

    push(data(CONVO.slice(), { status: 'working', queued: ['later'] }));
    ok('a queued message is still the agent\'s ball, and says so',
        /class="srow p-agent/.test(list()) && /your message is queued/.test(list()));

    push(data(CONVO.slice(), { pendingPermission: { detail: 'needs Write' } }));
    ok('a refused tool is a heavier kind of your turn',
        /class="srow p-blocked/.test(list()) && />needs permission/.test(list()));
    ok('…and it counts as waiting for you', /1 waiting for you/.test(list()));

    push(data([], { status: 'idle', turns: 0, messages: [] }));
    ok('a session with nothing said yet is not a nudge',
        !/p-you/.test(list()) && !/waiting for you/.test(list()));

    push(data(CONVO.slice(), { status: 'ended' }));
    ok('an ended session recedes instead of shouting', /class="srow p-over/.test(list()));

    // the grammar itself
    ok('only the transient state animates', /\.srow\.p-agent \.dot[^}]*animation:afbreath/.test(style())
        && !/\.srow\.p-you[^}]*animation/.test(style()));
    ok('…and it respects "reduce motion"', /prefers-reduced-motion/.test(style()));
    ok('your turn is carried by contrast: edge, dot AND word',
        /\.srow\.p-you \{[^}]*border-left-color/.test(style())
        && /\.srow\.p-you \.dot/.test(style())
        && /\.srow\.p-you \.phase/.test(style()));

    // the nudge answers: click takes you to the longest wait, list never reorders
    const older = data(CONVO.slice());
    older.sessions = [
        session(CONVO.slice(), { id: 'csA', sessionId: 'aaaa1111', lastTs: Date.now() - 600000 }),
        session(CONVO.slice(), { id: 'csB', sessionId: 'bbbb2222', lastTs: Date.now() - 60000 })
    ];
    older.selected = 'csB';
    push(older);
    ok('two waiting are counted together', /2 waiting for you/.test(list()));
    const order = list().indexOf('aaaa1111') < list().indexOf('bbbb2222');
    ok('…the cards keep their own order (a list that jumps is the irritation)', order);
    posted.length = 0;
    els['c-next'].listeners.click();
    ok('…and the call-out jumps to the one waiting longest',
        posted.some(m => m.type === 'select' && m.id === 'csA'));
}

// ---------- "it is still working" ----------
// Between your message and the first line of the reply the page showed nothing
// at all — and nothing is exactly what a dead session shows. A terminal says so
// out loud; so does this, with what it is doing right now rather than a word.
{
    const working = () => (els['c-working'] ? els['c-working']._html : '');
    push(data(CONVO.slice()));
    ok('an idle session says nothing', working() === '');

    const t0 = Date.now() - 12000;
    push(data(CONVO.concat([msg('tool', { tool: { name: 'Read', detail: 'D:/a/b.md' } })]),
        { status: 'working', turnStartedAt: t0 }));
    ok('a running turn shows a live strip', /class="spin"/.test(working()));
    ok('…saying what it is doing right now, not just "thinking"',
        /Read D:\/a\/b\.md/.test(working()));
    ok('…and how long it has been at it', /12s/.test(working()));
    ok('…with the way to stop it', /Interrupt/.test(working()));

    const first = /<span class="spin">(.)<\/span>/.exec(working())[1];
    let spun = false;
    for (let i = 0; i < 40 && !spun; i++) {
        tickTimers();
        spun = /<span class="spin">(.)<\/span>/.exec(working())[1] !== first;
    }
    ok('…and the glyph really turns, on its own timer', spun);

    // a tool call from an EARLIER turn must not be reported as what it is doing
    push(data(CONVO.concat([
        msg('tool', { tool: { name: 'Read', detail: 'old.md' } }),
        msg('user', { text: 'now do something else' })
    ]), { status: 'working', turnStartedAt: Date.now() }));
    ok('…a tool from a previous turn is not passed off as the current one',
        !/old\.md/.test(working()) && /working/.test(working()));

    // Esc is the terminal's own key for this, and the strip promises it
    posted.length = 0;
    push(data(CONVO.slice(), { status: 'working', turnStartedAt: Date.now() }));
    els['c-text'].listeners.keydown({ key: 'Escape', preventDefault() { } });
    ok('Esc stops the running turn', posted.some(m => m.type === 'interrupt'));

    push(data(CONVO.slice()));
    ok('the strip goes when the turn does', working() === '');
    posted.length = 0;
    els['c-text'].listeners.keydown({ key: 'Escape', preventDefault() { } });
    ok('…and Esc does nothing when nothing is running', !posted.some(m => m.type === 'interrupt'));
}

// ---------- where you left off ----------
// A hosted session ends with its window (leaving it orphaned is a leak), and
// `--resume` was measured to pick the SAME session back up. So the only thing
// that has to survive a close or a crash is knowing where you were.
{
    const withShelf = data(CONVO.slice());
    withShelf.lastWindow = [{
        sessionId: '9c67e970-aaaa', agentName: 'developer',
        title: 'Kalan eksikler', cwd: 'D:/a/dev', endedAt: Date.now() - 3600000
    }];
    push(withShelf);
    const list = els['c-list'] ? els['c-list']._html : '';
    ok('the shelf is on top of the left panel', /Where you left off/.test(list));
    ok('…with the session named and handled', /developer/.test(list) && /Kalan eksikler/.test(list)
        && /\(#9c67e970\)/.test(list));
    ok('…and says it is one click from continuing', /click to continue/.test(list));

    posted.length = 0;
    const rows = sandbox.document.querySelectorAll('[data-back]');
    rows[0]._fn({ target: {} });
    ok('clicking it resumes that very session',
        posted.some(m => m.type === 'resume' && m.sessionId === '9c67e970-aaaa'));

    posted.length = 0;
    sandbox.document.querySelectorAll('[data-backforget]')[0]._fn({ stopPropagation() { }, target: { dataset: { backforget: '9c67e970-aaaa' } } });
    ok('…and it can be taken off the shelf instead',
        posted.some(m => m.type === 'forgetLastWindow' && m.sessionId === '9c67e970-aaaa'));
}

// ---------- the composer stays on the window's bottom edge ----------
// Measured in a real browser (Chromium, 1200x700 and 820x420, 40 sessions +
// 320 conversation lines): the page never scrolls, the composer's bottom stays
// 12px above the window edge — identical before and after 200 streamed lines
// and after 100 sessions in the left panel — and the two things that CAN be
// long scroll inside themselves. These four rules are what make that true; the
// bug they replace was "min-height" twice, which is a floor, not a ceiling.
{
    const consoleSrc = fs.readFileSync(path.resolve(__dirname, '../media/console.js'), 'utf8');
    const style = /const STYLE = `([\s\S]*?)`;/.exec(consoleSrc)[1];
    const rule = (sel) => {
        const m = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}').exec(style);
        return m ? m[1].replace(/\s+/g, ' ') : '';
    };
    ok('the page itself never scrolls', /body \{[^}]*overflow:hidden/.test(style));
    ok('the app is exactly the window\'s height, not "at least"',
        /height:100%/.test(rule('#app')) && !/min-height:100%/.test(rule('#app')));
    ok('the row between header and composer may shrink', /min-height:0/.test(rule('.cwrap')));
    ok('a long session list scrolls itself instead of stretching the page',
        /min-height:0/.test(rule('.clist')) && /overflow-y:auto/.test(rule('.clist')));
    ok('…and so does the conversation',
        /min-height:0/.test(rule('.talk ')) && /overflow-y:auto/.test(rule('.talk ')));
    ok('the composer never grows or shrinks with them', /flex:none/.test(rule('.composer')));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
