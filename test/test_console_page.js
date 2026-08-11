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

const code = require(path.join(__dirname, 'lib_shared_media.js')).sharedMedia()
    + fs.readFileSync(path.resolve(__dirname, '../media/console.js'), 'utf8');

// ‼️ These are stubbed with the REAL ones, not lookalikes. The strip shortens
// model ids, writes durations and writes the api/steps pair the way every other
// surface does, and a hand-written stub here would let the two drift while the
// test kept passing.
const realCharts = (() => {
    const box = vm.createContext({ window: {} });
    vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../media/charts.js'), 'utf8'), box);
    return box.window.AFCharts;
})();
const realParseModel = realCharts.parseModel;

// ---------- fake DOM ----------
const els = {};
function mkEl(id) {
    return {
        // a freshly built element is NOT hidden — `hidden` is an attribute the
        // page has to put there, and paste is the tool that never gets one
        id, _html: '', listeners: {}, hidden: false, textContent: '',
        // _writes / _focus are how the test proves the page stopped rebuilding
        // itself (and re-focusing the textarea) on every streamed line.
        _writes: 0, _focus: 0,
        // ‼️ _classWrites counts how often the drop highlight is WRITTEN, not
        // whether it is on. A drag fires `dragover` many times a second and
        // `dragleave` bubbles from every child crossed, so a highlight rewritten
        // per event meant a style recalculation and a full-page repaint per
        // frame for the whole drag — which is what this counter pins down.
        _classes: {}, _classWrites: 0,
        get classList() {
            const self = this;
            return {
                add(c) { self._classWrites++; self._classes[c] = true; },
                remove(c) { self._classWrites++; delete self._classes[c]; },
                contains(c) { return !!self._classes[c]; }
            };
        },
        scrollTop: 0, scrollHeight: 1000, clientHeight: 300,
        set innerHTML(v) { this._html = v; this._writes++; }, get innerHTML() { return this._html; },
        addEventListener(ev, fn) { this.listeners[ev] = fn; },
        focus() { this._focus++; }, value: '',
        // where the caret is — the whole argument of the ⎘ tool
        selectionStart: 0, selectionEnd: 0,
        setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; }
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
            fmtTok: v => v + 't',
            STEP_KIND: {},

            stepChip: () => '',

            stepKindLegend: () => '',

            stepKindLegendText: () => 'legend',

            fmtTokW(n, w) { return this.fmtTok(n || 0) + (w > 0 ? ' [w' + this.fmtTok(Math.round(w)) + ']' : ''); },
            fmtTokWText(n, w) { return this.fmtTok(n || 0) + (w > 0 ? ' (w' + this.fmtTok(Math.round(w)) + ')' : ''); },
            WEIGHTED_TIP: 'weighted',
            fmtDur: realCharts.fmtDur,
            fmtSteps: realCharts.fmtSteps,
            STEPS_TIP: realCharts.STEPS_TIP,
            parseModel: realParseModel
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
            // The answer card's option buttons carry TWO data attributes —
            // which question, which option — and the page reads both off the
            // element it was handed, so they are matched as the pair they are.
            // Matched singly, every option of one question would collapse onto
            // the same cached object and the wiring test would pass on a page
            // that cannot tell option 1 from option 2.
            if (sel === '[data-askq]') {
                const out = [];
                const re = /data-askq="(\d+)"\s+data-asko="(\d+)"/g;
                const html = allHtml();
                let hit;
                while ((hit = re.exec(html))) {
                    const key = `askq=${hit[1]},asko=${hit[2]}`;
                    let el = qsCache[key];
                    if (!el) {
                        el = { dataset: { askq: hit[1], asko: hit[2] } };
                        el.addEventListener = (_t, fn) => { el._fn = fn; };
                        qsCache[key] = el;
                    }
                    out.push(el);
                }
                return out;
            }
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
    // a dropped/pasted file is read as a data URL before it is handed over;
    // here the read lands synchronously so the assertion sits under the drop
    FileReader: function () {
        this.readAsDataURL = function (f) {
            this.result = `data:application/octet-stream;base64,${Buffer.from(f.name || 'x').toString('base64')}`;
            if (this.onload) { this.onload(); }
        };
    },
    Buffer,
    // the working strip turns its glyph on a timer; the test drives it by hand
    setInterval: (fn) => { timers.push(fn); return timers.length; },
    clearInterval: (h) => { timers[h - 1] = null; },
    // typing into the filter is debounced; here it lands at once, so a test
    // reads the query the keystroke produced without waiting on a clock
    setTimeout: (fn) => { fn(); return 0; },
    clearTimeout: () => { },
    // the composer's ⧉/✂ tools write to the real clipboard in a webview; here
    // the write is recorded, and the thenable resolves synchronously so the
    // assertion sits right under the click that caused it
    navigator: {
        clipboard: {
            writeText: v => { copied.push(v); return { then: fn => { fn(); } }; },
            // ⎘ reads it back; `clipText` is what a test puts there first, and
            // the thenable resolves synchronously for the same reason
            readText: () => ({
                then: (fn, err) => {
                    if (clipText === null) { if (err) { err(new Error('denied')); } return; }
                    fn(clipText);
                }
            })
        }
    },
    console
};
/** Everything the page has copied to the clipboard, newest last. */
const copied = [];
/** What ⎘ will find on the clipboard; null = the host refuses the read. */
let clipText = '';
/** Timers a test wants to hold instead of firing (the ✓ receipt's lifetime). */
const heldTimers = [];
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
    model: 'claude-opus-5', effort: 'high', permissionMode: 'default',
    contextTokens: 24100, lastTs: Date.now(), turnTokens: 0, turnCost: 0,
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
    // ‼️ K-13 — THE ID IS BACK ON THE LINE. U-38 moved it into the hover
    // because a cut id (`(#019f…`) says nothing at all; the answer to that is
    // to stop the cut, not to hide the value — the name truncates and the id
    // does not (`.n .nm` / `.sid { flex:none }`). The hover keeps the WHOLE id,
    // which is the one you copy.
    ok('the card carries the agent AND the short id, with the whole id one hover away',
        /developer/.test(html())
        && /<span class="sid">\(#407c78cb\)<\/span>/.test(html())
        && /Session: 407c78cb-/.test(html()));
    // One figure fits a 250px card, and it is the RAW token count: "$0.03"
    // does not say whether that was haiku thinking briefly or opus barely
    // starting — and the weighted figure beside it was a second number nobody
    // could tell from the first at that size.
    ok('…the tokens it spent, not the dollars', html().includes('48200t tk')
        && !html().includes('$0.12 (48200t)'));
    ok('‼️ …the RAW one only: no ⚖ pair competing with the engine badge',
        !/⚖/.test(html()));
    // The hover spells out BOTH figures: the raw total and what it charged the
    // 5h limit. The card itself has room only for the pair; the sentence that
    // says which is which lives here (see charts.js WEIGHTED_TIP).
    ok('…with the money one hover away', /title="48200t raw tokens · \$0\.12 spent"/.test(html()));
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

    // ‼️ THE ONE SUBSET THIS LIST HAS A WORD FOR. Seven kinds of line exist and
    // the reading people keep coming back to is the conversation itself; it used
    // to cost Clear plus two ticks, every time.
    ok('the show box offers Dialog as a named subset',
        afms.presets('c-kinds').join(',') === 'dialog');
    afms.preset('c-kinds', 'dialog');
    ok('…and it leaves exactly you and the agent showing',
        state.afConsole.kinds.slice().sort().join(',') === 'agent,user');

    // …and the per-row version of the same idea: the NAME means "only this".
    afms.clickName('c-kinds', 'user');
    ok('clicking a kind\'s name shows only that kind',
        state.afConsole.kinds.join(',') === 'user'
        && html().includes('read the report') && !html().includes('file body'));
    afms.selectAll('c-kinds');
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

// ---------- a message you HELD back is still yours ----------
// Typing mid-turn now goes INTO the turn (measured: the CLI delivers it at the
// turn's next step). Hold is the deliberate other choice — and a message that
// has not been said yet has to be changeable, not just clearable.
{
    afms.open('c-kinds');
    afms.selectAll('c-kinds');
    talk().scrollTop = talk().scrollHeight;
    push(data(CONVO.slice(), { status: 'working', queued: ['do this next', 'and then this'] }));
    const q = () => (els['c-queue'] ? els['c-queue']._html : '');
    ok('what is held is shown, in order, above the composer',
        /2 messages held/.test(q())
        && q().indexOf('do this next') > 0 && q().indexOf('do this next') < q().indexOf('and then this'));
    const convo = () => (els.talkinner ? els.talkinner._html : '');
    ok('…and is NOT in the conversation yet', !convo().includes('do this next'));
    ok('…the row and the composer say how many are held', /2 held/.test(allHtml()));
    ok('…and each one can be rewritten, sent now, or dropped — one by one',
        /data-qedit="0"/.test(q()) && /data-qnow="1"/.test(q()) && /data-qdrop="1"/.test(q()));

    // ✎ — back into the box, out of the queue: the terminal's "press up to edit"
    posted.length = 0;
    sandbox.document.querySelectorAll('[data-qedit]')[1]._fn({});
    ok('✎ takes it out of the queue…',
        posted.some(m => m.type === 'queueTake' && m.index === 1));
    ok('…and puts its words back in the box, ready to be changed',
        (els['c-text'].value || '').includes('and then this'));
    els['c-text'].value = '';
    posted.length = 0;
    sandbox.document.querySelectorAll('[data-qnow]')[0]._fn({});
    ok('⏩ stops holding it and says it now', posted.some(m => m.type === 'queueSend' && m.index === 0));
    posted.length = 0;
    sandbox.document.querySelectorAll('[data-qdrop]')[0]._fn({});
    ok('⨯ drops it without saying it', posted.some(m => m.type === 'queueTake' && m.index === 0));

    // ↑ in an empty box does what ✎ does, on the last one held
    els['c-text'].value = '';
    posted.length = 0;
    els['c-text'].listeners.keydown({ key: 'ArrowUp', preventDefault() { } });
    ok('↑ in an empty box recalls the last held message',
        posted.some(m => m.type === 'queueTake' && m.index === 1)
        && (els['c-text'].value || '').includes('and then this'));

    // Hold itself: same box, other button
    els['c-text'].value = 'wait for the end';
    posted.length = 0;
    els['c-hold'].listeners.click();
    ok('Hold sends what you typed as held, not as speech',
        posted.some(m => m.type === 'send' && m.hold === true && m.text === 'wait for the end'));
    els['c-text'].value = 'say it into the turn';
    posted.length = 0;
    els['c-send'].listeners.click();
    ok('…while Send says it into the running turn',
        posted.some(m => m.type === 'send' && m.hold === false));
    ok('…and the button says which of the two it is', /Send into turn/.test(els['c-send'].textContent));
    els['c-text'].value = '';

    push(data(CONVO.slice(), { status: 'working', queued: [] }));
    ok('an emptied queue leaves no strip behind',
        (els['c-queue']._html || '') === '');
}

// ---------- what was said INTO a running turn says so ----------
{
    const steered = CONVO.slice();
    steered.push({ id: 'st1', role: 'user', ts: Date.now(), text: 'no, the other way', steer: true });
    push(data(steered, { status: 'working' }));
    const convo = () => (els.talkinner ? els.talkinner._html : '');
    ok('a steering message is marked, not shown as a plain new question',
        /class="msg user steer"/.test(convo()) && /Said into the running turn/.test(convo()));
}

// ---------- "Talk to Agent" lands on the composer, with that agent chosen ----------
{
    const withPreset = data(CONVO.slice());
    withPreset.selected = '';            // composer mode, as the command opens it
    withPreset.presetAgent = 'dev';
    withPreset.composerSeed = 1;
    withPreset.engine = 'codex';
    withPreset.defaults = {
        engine: 'codex', model: 'gpt-5.6-terra', effort: 'medium', permissionMode: 'acceptEdits'
    };
    withPreset.engines = [{ id: 'claude', label: 'Claude', ready: true }, { id: 'codex', label: 'Codex', ready: true }];
    withPreset.engineModels = {
        claude: {
            models: [{ id: '', label: 'Default' }, { id: 'sonnet', label: 'Sonnet' }],
            efforts: { '': [{ id: '', label: 'Default' }, { id: 'high', label: 'high' }] },
            defaultEffort: {}
        },
        codex: {
            models: [{ id: '', label: 'Default' }, { id: 'gpt-5.6-terra', label: 'GPT 5.6 Terra' }],
            efforts: {
                '': [{ id: '', label: 'Default' }],
                'gpt-5.6-terra': [{ id: '', label: 'Default' }, { id: 'medium', label: 'medium' }, { id: 'high', label: 'high' }]
            },
            defaultEffort: { 'gpt-5.6-terra': 'medium' }
        }
    };
    push(withPreset);
    ok('the agent picker asks as a sentence', allHtml().includes('Choose an agent…'));
    ok('…and the agent handed over is the one selected',
        state.afConsole.agentId === 'dev'
        && (els['c-agent'] ? els['c-agent'].value === 'dev' : /value="dev" selected/.test(allHtml())));
    ok('…while a session that agent already has running is offered, not hidden',
        /already has a session running here/.test(allHtml()));
    ok('a fresh agent composer takes the current engine launch settings, not the previous composer state',
        state.afConsole.model === 'gpt-5.6-terra'
        && state.afConsole.effort === 'medium'
        && state.afConsole.permissionMode === 'acceptEdits'
        && /value="codex" selected/.test(allHtml())
        && /value="gpt-5\.6-terra" selected/.test(allHtml()));

    // A model change must rebuild the dependent effort box immediately. Terra
    // defaults to medium here; carrying an unrelated stale value is K-15/S-27.
    els['c-model'].value = '';
    els['c-model'].listeners.change({ target: els['c-model'] });
    ok('changing model immediately reconciles its effort vocabulary',
        state.afConsole.model === '' && state.afConsole.effort === '');

    // Reusing the same open Console for another Talk to Agent invocation is a
    // new launch decision. The increasing seed is the host/webview handshake.
    const again = Object.assign({}, withPreset, {
        composerSeed: 2, engine: 'claude',
        defaults: { engine: 'claude', model: 'sonnet', effort: 'high', permissionMode: 'default' }
    });
    push(again);
    ok('a second Talk to Agent invocation reseeds the already-open composer',
        state.afConsole.model === 'sonnet' && state.afConsole.effort === 'high'
        && state.afConsole.permissionMode === 'default'
        && /value="claude" selected/.test(allHtml())
        && /value="sonnet" selected/.test(allHtml()));
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
    ok('a held message is still the agent\'s ball, and says so',
        /class="srow p-agent/.test(list()) && /a message is held/.test(list()));

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

// ---------- ‼️ the wait grows by itself ----------
// "The nudge is TIME, not animation" — and time was the one thing that did not
// move. Every figure here is written during a data push, and a push only
// arrives when the CLI says something; a session waiting for YOU says nothing
// by definition. So "your turn · 0s" and "longest 0s" stood there for hours,
// saying the opposite of what they exist to say.
{
    const list = () => (els['c-list'] ? els['c-list']._html : '');
    const fresh = data(CONVO.slice());
    fresh.sessions[0].lastTs = Date.now();
    push(fresh);
    ok('a turn that just ended starts the clock at zero',
        /your turn · 0s/.test(list()) && /longest 0s/.test(list()));

    // no push, no CLI, nothing said: only the clock moves
    fresh.sessions[0].lastTs = Date.now() - 2 * 3600 * 1000;
    tickTimers();
    ok('…and two hours later it says so, without anything being pushed',
        /your turn · 2h/.test(list()) && /longest 2h/.test(list()));

    const src = fs.readFileSync(path.resolve(__dirname, '../media/console.js'), 'utf8');
    ok('…because the clock is a reason to redraw the left panel on its own',
        /setInterval\(renderList/.test(src));
    ok('…and only the left panel, which is the only time-dependent part',
        /function renderList\(\)/.test(src));
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
    // ‼️ TWO ROWS, NOT ONE. On one line the sentence and the figures competed
    // for the same width, and whichever was longer ate the other — the tail of
    // the meta ran off the right edge and could not be read at all.
    ok('…on its own second row, so the sentence and the figures stop competing',
        /<div class="wrow">[\s\S]*<\/div><div class="wmeta">/.test(working()));
    ok('…with what it is DOING on the first row and nothing else',
        !/wmeta/.test(/<div class="wrow">([\s\S]*?)<\/div>/.exec(working())[1]));
    ok('…and the duration is where the second row begins',
        /<div class="wmeta">12s/.test(working()));
    // ‼️ The way to stop it is a BUTTON, and it is on screen while the turn runs
    // — the strip used to spend its last column spelling that out in words, two
    // centimetres above the button itself (see workingHtml).
    ok('…with the way to stop it on the composer, not spelled out on the strip',
        /id="c-int"/.test(els['c-live'] ? els['c-live']._html : '')
        && !/Interrupt/.test(working()));

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

// ---------- the turn's numbers up here, the session's numbers down there ----------
// Both strips used to show "ctx" — the same session-wide figure twice, three
// centimetres apart — while the question you actually have about a running turn
// (what is THIS one costing me?) had no answer anywhere on the page.
{
    const working = () => (els['c-working'] ? els['c-working']._html : '');
    const status = () => (els['c-status'] ? els['c-status']._html : '');

    push(data(CONVO.concat([msg('agent', { text: 'thinking out loud' })]), {
        status: 'working', turnStartedAt: Date.now() - 41000, turnTokens: 4200, turnCost: 0.031,
        // the reducer's own count, pushed with the state — see below
        turnSteps: 3, turnThinking: 1
    }));
    ok('the running turn says what IT has spent', /~\$0\.031 \(4200t tokens\)/.test(working()));
    // ‼️ …and says WHICH it is. Two numbers three centimetres apart, one
    // labelled "this session" and the other labelled nothing, read as one
    // figure disagreeing with itself.
    ok('…named as the turn\'s, next to a line that names itself the session\'s',
        /4200t tokens\) this turn/.test(working())
        && / this session/.test(status()));
    ok('…marked as the estimate it is until the turn closes', /estimate/.test(working()));
    // ‼️ A STEP IS A STEP EVERYWHERE, AND THE STRIP USED TO DISAGREE — TWICE
    // OVER. It worked the figure out HERE, in the view, by walking the rows
    // since your last message: that sweeps in every tool RESULT (one per call,
    // so the figure was roughly doubled) and the turn's own result line, and it
    // cannot see a thinking block at all, because thinking is deliberately
    // never drawn. Too big and short of the most expensive part at the same
    // time. The count now arrives WITH the state, off the transcript's own
    // blocks (core/consoleproto.ts turnSteps) — the strip only prints it.
    ok('…with the steps it has produced, counted where the blocks are, not where the rows are',
        />3steps</.test(working()) && !/>6</.test(working()) && !/· \d+ lines?/.test(working()));
    ok('…and the hover says how much of that was reasoning',
        /3 steps, 1 were the model reasoning/.test(working()));
    // ‼️ …AND HOW MANY ROUND TRIPS CARRIED THEM. The steps are what you watch
    // scroll past; the tokens are charged per API CALL, and one call carries
    // several steps. Showing only the steps let a turn whose call count halved
    // read as unchanged while its token figure moved — see charts.js fmtSteps.
    ok('…and neither number is written as a fraction of the other',
        !/\d+api\/\d+/.test(working()));
    // The strip counts in the shared format the moment a turn passes a minute —
    // it used to say "3847s" for a turn that ran an hour.
    ok('…and its age in the shared duration format, not raw seconds',
        working().includes('41s'));
    ok('…and the seconds it has been at it', /41s/.test(working()));
    ok('the session-wide context figure is NOT repeated up here', !/ctx/.test(working()));

    push(data(CONVO.slice()));
    ok('the session line carries the cost AND the tokens it bought',
        /\$0\.12 \(48200t tokens\)<\/span> this session/.test(status()));
    ok('…the context the window is holding', /~24100t ctx/.test(status()));
    ok('…and how many turns it took', /3 turns/.test(status()));

    // a turn nobody has spent anything on yet says nothing rather than "$0"
    push(data(CONVO.slice(), { status: 'working', turnStartedAt: Date.now(), turnTokens: 0, turnCost: 0 }));
    ok('a turn with nothing spent yet does not write "$0"', !/\$0/.test(working()));

    // ‼️ THE STRIP SURVIVES THE TURN. It used to go blank the instant the figures
    // became final — the one moment they were worth reading — so "what did that
    // turn cost?" had no answer once the ball came back to you.
    push(data(CONVO.slice(), {
        status: 'idle', turnStartedAt: 0, turnTokens: 0, turnCost: 0,
        lastTurn: { endedAt: Date.now(), ms: 41200, tokens: 4200, cost: 0.031, outcome: 'done' }
    }));
    ok('the finished turn stays on the strip', /last turn/.test(working()));
    ok('…with its duration, cost and tokens', /41s/.test(working()) && /\$0\.031 \(4200t tokens\)/.test(working()));
    ok('…as the CLI\'s own figure — no "~", and it says so',
        !/~\$/.test(working()) && /as the CLI reported it/.test(working()));
    ok('…and it hands the ball back out loud', /your turn now/.test(working()));
    ok('…without pretending to still be running',
        !/Interrupt stops it/.test(working()) && !/⠋|⠙|⠹/.test(working()));
    // an interrupted / failed turn is not reported as a clean finish
    push(data(CONVO.slice(), {
        status: 'idle', lastTurn: { endedAt: Date.now(), ms: 900, tokens: 0, cost: 0, outcome: 'interrupted' }
    }));
    ok('an interrupted turn says so on the strip', /last turn interrupted/.test(working()));
    // nothing has finished yet in this session → nothing to say
    push(data(CONVO.slice(), { status: 'idle', lastTurn: null }));
    ok('a session with no finished turn shows an empty strip', working() === '');
}

// ---------- …and WHAT is doing the thinking ----------
// ‼️ The strip priced the turn and timed it without ever saying what was doing
// it — so "why is this one slow/dear?" ("opus 5 on xhigh") could only be
// answered by looking at the pickers below, which describe the NEXT turn.
{
    const working = () => (els['c-working'] ? els['c-working']._html : '');

    push(data(CONVO.slice(), {
        status: 'working', turnStartedAt: Date.now() - 9000,
        turnModel: 'claude-opus-5-20260514', turnEffort: 'xhigh'
    }));
    ok('the running turn names the model it is thinking with', />opus 5 · xhigh</.test(working()));
    ok('…shortened the way every other surface shortens a model id',
        !/claude-opus-5-20260514</.test(working()));
    ok('…and the hover says it is the turn\'s, not the picker\'s',
        /applies from the NEXT turn/.test(working()));

    push(data(CONVO.slice(), {
        status: 'working', turnStartedAt: Date.now(),
        turnModel: 'gpt-5.6-luna', turnEffort: 'medium'
    }));
    ok('U-47: a Codex model keeps the suffix that distinguishes it from its siblings',
        />gpt 5\.6 luna · medium</.test(working()) && !/>gpt 5\.6 · medium</.test(working()));
    push(data(CONVO.slice(), {
        status: 'working', turnStartedAt: Date.now(),
        turnModel: 'gpt-5.6-future-name', turnEffort: 'high'
    }));
    ok('…and an unseen future Codex suffix is kept rather than special-cased away',
        />gpt 5\.6 future name · high</.test(working()));

    // an effort the session never asked for is the CLI's own default, and
    // naming it would be a guess
    push(data(CONVO.slice(), {
        status: 'working', turnStartedAt: Date.now(), turnModel: 'claude-haiku-4-5', turnEffort: ''
    }));
    ok('a session with no effort chosen shows the model alone, not "default"',
        /haiku 4\.5</.test(working()) && !/default/.test(working()));

    // a model id we do not recognise is still the answer — printed, not dropped
    push(data(CONVO.slice(), {
        status: 'working', turnStartedAt: Date.now(), turnModel: 'some-local-llm-7b', turnEffort: ''
    }));
    ok('an unfamiliar model id is printed as it came, never invented',
        /some-local-llm-7b</.test(working()));

    // before system:init there is nothing honest to say
    push(data(CONVO.slice(), {
        status: 'working', turnStartedAt: Date.now(), turnModel: '', turnEffort: ''
    }));
    ok('a turn whose model the CLI has not named yet says nothing about it',
        !/wbrain/.test(working()));

    // …and the finished turn keeps what IT ran on, which a later switch cannot rewrite
    push(data(CONVO.slice(), {
        status: 'idle', lastTurn: {
            endedAt: Date.now(), ms: 41200, tokens: 4200, cost: 0.031, outcome: 'done',
            model: 'claude-sonnet-4-5-20250929', effort: 'medium'
        }
    }));
    ok('the finished turn still says what it ran on', /sonnet 4\.5 · medium</.test(working()));
    ok('…in the past tense, because it is over', /ran on/.test(working()));

    // The agent's folder really is fixed once the process is up; the model, the
    // effort and the permission mode are not — all three are live pickers (see
    // the setModel / setEffort contracts).
    push(data(CONVO.slice()));
    ok('the composer states the one thing that cannot change — its agent',
        /developer/.test(allHtml()) && /class="fixed"/.test(allHtml()));
    ok('…and offers model, effort and permissions as things you can still change',
        /id="c-model-live"/.test(allHtml()) && /id="c-effort-live"/.test(allHtml())
        && /id="c-perm"/.test(allHtml()));

    // ---- K-16: a box's hover says WHAT IS IN IT, then what it is for ----
    //
    // This row is eight pickers wide in a panel that is rarely wide, so a
    // `<select>` shows its chosen value cut and the only way to READ it was to
    // OPEN the box — a gesture that means "I am about to change this",
    // performed by somebody who only wanted to look.
    const tipOf = re => (re.exec(allHtml()) || [, ''])[1];
    const permTip = () => tipOf(/title="([^"]*)"[^>]*>permissions/);
    ok('‼️ the permissions box names its current value before explaining itself',
        /^default\n\n/.test(permTip()));
    ok('…and the standing explanation is still there, underneath',
        /applied live|SANDBOX/.test(permTip()));
    // ‼️ …and a box whose list this build has nothing for names NOTHING rather
    // than printing an empty line above the explanation: the hover's first line
    // is a value, and a blank one would read as a value that is blank.
    ok('a box with no list to name from opens on the explanation, not on a gap',
        /^How hard it thinks/.test(tipOf(/title="([^"]*)"[^>]*>effort/)));
}

// ---------- the card hands its state to the right-click menu ----------
// `enablement` in package.json reads these as context keys: that is what makes
// "Remove from list" greyed-but-visible until the session has really ended.
{
    push(data(CONVO.slice(), { status: 'working' }));
    const live = els['c-list']._html;
    ok('a running card says it is live and working',
        /afConsoleLive&quot;:true/.test(live) && /afConsoleWorking&quot;:true/.test(live)
        && /afConsoleEnded&quot;:false/.test(live));
    ok('…and names the hosted process the menu will act on', /hostId&quot;:&quot;cs1&quot;/.test(live));

    push(data(CONVO.slice(), { status: 'ended' }));
    const dead = els['c-list']._html;
    ok('an ended card flips both, so the menu flips with it',
        /afConsoleEnded&quot;:true/.test(dead) && /afConsoleLive&quot;:false/.test(dead)
        && /afConsoleWorking&quot;:false/.test(dead));
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
        && /Session: 9c67e970-/.test(list));
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

// ---------- the resume list is a question now, not a fixed sentence ----------
// "Your shelf plus the fifteen newest" answers "carry on with what I was just
// doing" and nothing else: last Tuesday's session was indexed, on disk, and
// unreachable from the panel. The controls are the Sessions tables' own
// vocabulary, shrunk to a 250px column — and the ANSWER comes from the host,
// because the page can only filter what it was sent.
{
    const head = () => (els['c-rhead'] ? els['c-rhead']._html : '');
    const panel = () => (els['c-rpanel'] ? els['c-rpanel']._html : '');
    const rlist = () => (els['c-rlist'] ? els['c-rlist']._html : '');
    const lastQuery = () => posted.filter(m => m.type === 'resumeQuery').pop();
    const withResume = (extra) => {
        const d = data(CONVO.slice());
        d.resumable = [{
            sessionId: 'aaaa1111-0001', title: 'ZEN sürüm notları', agentName: 'developer',
            engine: 'claude',
            cwd: 'D:/a/dev', pinned: true, ts: Date.now() - 5 * 86400000,
            cost: 0.31, tokens: 812000, contextTokens: 132000
        }, {
            // K-17: the list is every engine's now, not Claude's alone.
            sessionId: 'bbbb2222-0002', title: 'codex ile refactor', agentName: 'developer',
            engine: 'codex',
            cwd: 'D:/a/dev', pinned: false, ts: Date.now() - 6 * 86400000,
            cost: 0, tokens: 0, contextTokens: 0
        }];
        d.resumeAgents = ['developer', 'manager'];
        d.resumeTotal = 1240; d.resumeMax = 200; d.resumeDefaultN = 15; d.resumeFiltered = false;
        return Object.assign(d, extra || {});
    };

    push(withResume());
    ok('the section is closed until you ask for it', panel() === '' && rlist() === '');
    ok('…and its header carries both openers', /id="c-toggle-resume"/.test(head())
        && /id="c-toggle-rfilter"/.test(head()));

    // asking for the filter opens the list too — a filter over something you
    // cannot see is a dead control
    posted.length = 0;
    els['c-toggle-rfilter'].listeners.click();
    ok('the filter button opens the list as well', state.afConsole.showResume === true
        && state.afConsole.showRFilter === true);
    ok('…and tells the host to start answering', lastQuery() && lastQuery().open === true);

    push(withResume());
    ok('the panel offers the same vocabulary the tables filter with',
        /id="c-rq-text"/.test(panel()) && /id="c-rq-agent"/.test(panel())
        && /id="c-rq-when"/.test(panel()) && /id="c-rq-pin"/.test(panel())
        && /id="c-rq-user"/.test(panel()) && /id="c-rq-n"/.test(panel()));
    ok('…every agent that HAS sessions, not just today\'s fleet',
        /value="manager"/.test(panel()));
    ok('…and how many to show, defaulting to what it always showed',
        /placeholder="15"/.test(panel()));
    // ‼️ The typed values are deliberately not in the markup: this section is
    // rewritten whenever it differs, and a value= would rebuild the box you are
    // typing in on every keystroke (the composer's own old bug).
    ok('a typed value is never written into the markup',
        !/<input[^>]*\svalue=/.test(panel()));

    // a date range is two more boxes, and only when you ask for one
    ok('no date boxes until the range is chosen', !/id="c-rq-from"/.test(panel()));
    els['c-rq-when'].value = 'custom';
    els['c-rq-when'].listeners.change();
    push(withResume());
    ok('"between…" brings its two dates with it',
        /id="c-rq-from"/.test(panel()) && /id="c-rq-to"/.test(panel()));

    // the count line, and the way out
    posted.length = 0;
    push(withResume({ resumeFiltered: true }));
    ok('the list says how much of the whole it is showing', /2 of 1240/.test(rlist()));
    // ‼️ Two buttons, two facts. One lit button had to mean both "the panel is
    // open" and "the list is narrowed", so with the panel shut a filtered list
    // looked exactly like the whole list — and the only way out was a link at
    // the bottom of a list you had to scroll to.
    ok('…the way out sits next to the thing that caused it',
        /id="c-rq-clear"/.test(head()) && /class="secondary rfilter rclear on"/.test(head()));
    ok('…and the header says, in a word, that you are seeing a narrowed list',
        /class="rfiltered"[^>]*>filtered</.test(head()));
    // ‼️ "How many" is not a filter — it chooses how much you can see, not
    // WHICH sessions — so clearing the filter has no business resetting it.
    push(withResume({ resumeFiltered: true }));
    els['c-rq-n'].value = '40';
    els['c-rq-n'].listeners.input();
    ok('the row count is pinned by default', state.afConsole.limitLocked === true);
    els['c-rq-clear'].listeners.click();
    ok('…so clearing the filter keeps it', lastQuery().query.limit === 40);
    ok('…while everything that IS a filter is gone', lastQuery().query.text === ''
        && lastQuery().query.when === '');

    // ‼️ Pinned or not has to be readable at a glance, not by tooltip: locked is
    // the accent colour, unlocked has no colour at all.
    ok('the lock is a coloured chip when it holds, and grey when it does not',
        /id="c-rq-nlock"[^>]*>🔒</.test(panel()) && /class="rchip lock on"/.test(panel())
        && /\.rchip\.lock\.on \{[^}]*charts-blue/.test(app()._html)
        && /\.rchip\.lock \{[^}]*grayscale\(1\)/.test(app()._html));

    push(withResume({ resumeFiltered: true }));
    els['c-rq-nlock'].listeners.click();          // unpin it
    els['c-rq-clear'].listeners.click();
    ok('unpinned, it goes back to being part of the question and clears with it',
        state.afConsole.limitLocked === false && lastQuery().query.limit === 0);
    push(withResume());
    ok('…and unpinned it draws itself open and colourless',
        /id="c-rq-nlock"[^>]*>🔓</.test(panel()) && /class="rchip lock"/.test(panel()));

    // ‼️ The words you typed need their own way out. The header's ⌦ clears the
    // WHOLE question; the box's ⨯ clears the part you retype.
    push(withResume());
    els['c-rq-text'].value = 'kalan';
    els['c-rq-text'].listeners.input();
    ok('the search box carries its own clear button', /id="c-rq-xtext"/.test(panel()));
    ok('…shown only while there is something to clear',
        els['c-rq-xtext'].hidden === false && state.afConsole.rq.text === 'kalan');
    posted.length = 0;
    els['c-rq-xtext'].listeners.click();
    ok('…and clicking it empties the box and asks again',
        state.afConsole.rq.text === '' && els['c-rq-text'].value === ''
        && lastQuery() && lastQuery().query.text === '');
    ok('…while the rest of the filter stays as it was',
        els['c-rq-xtext'].hidden === true && state.afConsole.limitLocked === false);

    push(withResume());
    ok('…and with nothing set, the button is there but plainly dead',
        / disabled/.test(head()) && !/rclear on/.test(head()));

    push(withResume({ resumeFiltered: true }));
    els['c-rq-clear'].listeners.click();
    ok('clearing asks the unfiltered question again', (() => {
        const q = lastQuery().query;
        return q.text === '' && q.when === '' && q.agent === ''
            && q.pinnedOnly === false && q.userOnly === false && q.limit === 0;
    })());

    // the rows themselves
    push(withResume());
    ok('a resumable row leads with what it spent, in tokens',
        />812000t tk</.test(rlist()));
    ok('…with the dollars moved into the tooltip, where the space is free',
        /title="812000t raw tokens · \$0\.31 spent"/.test(rlist()));
    ok('…says how long ago in days, not in hours',
        /5d ago/.test(rlist()) && !/120h ago/.test(rlist()));
    ok('…and keeps a figure and its label on one line',
        /class="pair"/.test(rlist()));
    posted.length = 0;
    sandbox.document.querySelectorAll('[data-resume]')[0]._fn({});
    ok('…and still resumes when clicked',
        posted.some(m => m.type === 'resume' && m.sessionId === 'aaaa1111-0001'));

    // ---- K-17: every row wears its engine, Claude included ----
    //
    // The list held Claude's transcripts only, so no row needed to say whose it
    // was. Now it holds every engine's, and an unbadged row would mean "Claude"
    // or "this list never learned about engines" with nothing to tell the two
    // apart (docs/CONVENTIONS.md → the badge).
    push(withResume());
    ok('‼️ a Codex conversation is offered for resuming at all',
        /codex ile refactor/.test(rlist()));
    ok('…wearing its own badge, from the shared component',
        /class="af-eng af-engc codex"/.test(rlist()));
    ok('‼️ …and Claude wears one too — an unbadged row is unreadable',
        /class="af-eng af-engc claude"/.test(rlist()));
    ok('the badge hover says what pressing the row would START',
        /Resumes as: Codex/.test(rlist()));
    ok('the query box says the engine is one of the things it searches',
        /engine/.test(panel()));
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

// ---------- the session line moves while the session is spending ----------
// `s.cost` is only what the CLI has REPORTED, and it reports a turn's cost when
// the turn ends. So for the whole length of a turn the one line under the box
// climbed on the left (tokens, counted per message) and stood still on the
// right — and on a session that had not finished a turn yet it stood at zero
// outright. Two halves of one figure disagreeing reads as a broken number.
{
    const status = () => els['c-status']._html;
    push(data(CONVO.slice(), { status: 'idle', cost: 0.12, tokens: 48200, turnCost: 0, turnTokens: 0 }));
    ok('between turns the line is the CLI\'s own figure, plainly',
        status().includes('$0.12 (48200t tokens)') && !status().includes('~$0.12'));

    push(data(CONVO.slice(), {
        status: 'working', cost: 0.12, tokens: 52400, turnCost: 0.005, turnTokens: 4200
    }));
    ok('while a turn runs the money moves with the tokens',
        status().includes('~$' + (0.12 + 0.005) + ' (52400t tokens)'));
    ok('…and says out loud that the money is the estimate the tokens are',
        /title="[^"]*priced off the tokens seen[^"]*">~\$/.test(status()));
    ok('…the turn strip above the box still shows the TURN, not the session',
        els['c-working']._html.includes('this turn'));

    // The estimate is cleared in the same step that adds the CLI's figure to
    // s.cost (consoleproto), so the two can never both be counted.
    push(data(CONVO.slice(), { status: 'idle', cost: 0.125, tokens: 52400, turnCost: 0, turnTokens: 0 }));
    ok('when the turn closes the estimate is replaced, not added to',
        status().includes('$0.125 (52400t tokens)') && !status().includes('~$'));

    // A resumed conversation carries its earlier turns (CarriedTotals): the
    // host puts them in s.cost/s.tokens, so the running estimate grows on top
    // of them instead of starting the sum over.
    push(data(CONVO.slice(), {
        status: 'working', cost: 5.5, tokens: 480000, turnCost: 0.25, turnTokens: 9000, turns: 212
    }));
    ok('a resumed session\'s estimate grows on top of what it already spent',
        status().includes('~$' + (5.5 + 0.25) + ' (480000t tokens)') && status().includes('212 turns'));
}

// ---------- ⏸ Hold parks what is in the box, and says so when there is none --
// The natural moment to reach for Hold is right AFTER something has gone into
// the running turn — and by then the box is empty, so the button did nothing,
// said nothing, and the queue below it never appeared. Everything downstream
// (the held line and its ✎ ⏩ ⨯) was therefore never seen either.
{
    const live = () => els['c-live']._html;
    const type = v => { els['c-text'].value = v; els['c-text'].listeners.input(); };

    type('');
    push(data(CONVO.slice(), { status: 'working', turnStartedAt: Date.now() - 3000 }));
    ok('a running turn offers Send after turn', /id="c-hold"/.test(live()) && />Send after turn</.test(live()));
    ok('…dead while there is nothing to park', /id="c-hold" disabled/.test(live()));
    ok('…and the tooltip says what would make it live',
        /Nothing to send yet — type the message first/.test(live()));
    ok('Send is dead on an empty box too, instead of eating the click',
        els['c-send'].disabled === true);

    type('dur, şöyle yap');
    ok('typing brings Hold back to life', !/id="c-hold" disabled/.test(live()));
    ok('…and Send with it', els['c-send'].disabled === false);
    ok('…which is what "Send into turn" now means', els['c-send'].textContent === 'Send into turn');

    posted.length = 0;
    els['c-hold'].listeners.click();
    ok('Hold parks it instead of saying it into the turn',
        posted.some(m => m.type === 'send' && m.hold === true && m.text === 'dur, şöyle yap'));
    ok('…and empties the box, so Hold goes dead again', els['c-text'].value === '');

    // the host answers with the message in `queued` — the strip above the box
    push(data(CONVO.slice(), { status: 'working', queued: ['dur, şöyle yap'] }));
    ok('the held message is shown above the box, not swallowed',
        els['c-queue']._html.includes('dur, şöyle yap') && /1 message held/.test(els['c-queue']._html));
    ok('…with its own three verbs: rewrite it, say it now, drop it',
        /data-qedit="0"/.test(els['c-queue']._html) && /data-qnow="0"/.test(els['c-queue']._html)
        && /data-qdrop="0"/.test(els['c-queue']._html));
    ok('…and the composer row says how many are waiting', /1 held/.test(live()));

    posted.length = 0;
    sandbox.document.querySelectorAll('[data-qedit]')[0]._fn({});
    ok('✎ takes it out of the queue and back into the box',
        posted.some(m => m.type === 'queueTake' && m.index === 0)
        && els['c-text'].value === 'dur, şöyle yap');
    posted.length = 0;
    push(data(CONVO.slice(), { status: 'working', queued: ['sonra şunu da yap'] }));
    sandbox.document.querySelectorAll('[data-qnow]')[0]._fn({});
    ok('⏩ says it now, into the running turn',
        posted.some(m => m.type === 'queueSend' && m.index === 0));
    sandbox.document.querySelectorAll('[data-qdrop]')[0]._fn({});
    ok('⨯ drops it and it is never said',
        posted.some(m => m.type === 'queueTake' && m.index === 0));
    type('');
}

// ---------- the box's own four tools: paste · copy · cut · clear -------------
// ‼️ They act on the TEXT and never on the agent. Starting a message over, or
// lifting it out to paste elsewhere, was a keyboard-only job (select all, then
// a chord) on a page whose every other control is a button.
{
    const type = v => { els['c-text'].value = v; els['c-text'].listeners.input(); };
    const drafty = () => ['c-copy', 'c-cut', 'c-clear'].map(id => els[id].hidden);
    const click = id => els[id].listeners.click({ preventDefault() { } });

    type('');
    ok('an empty box shows no draft tools — a Clear with nothing to clear is a lie',
        drafty().every(h => h === true));
    // ‼️ …but PASTE is exactly the tool you want on an empty box: its input is
    // the clipboard, so hiding it with the others would hide it when it matters.
    ok('…while ⎘ stays, because an empty box is its normal case',
        els['c-paste'].hidden === false);
    type('panoya alınacak metin');
    ok('typing brings the other three out', drafty().every(h => h === false));

    // ⧉ copy — the box keeps the text, the clipboard gets it
    posted.length = 0;
    copied.length = 0;
    els['c-text']._focus = 0;
    click('c-copy');
    ok('⧉ puts the draft on the clipboard', copied.length === 1 && copied[0] === 'panoya alınacak metin');
    ok('…and leaves the box exactly as it was', els['c-text'].value === 'panoya alınacak metin');
    ok('…having said nothing to the agent', posted.length === 0);
    ok('…and hands the keyboard back to the box', els['c-text']._focus === 1);

    // ‼️ the receipt: copy changes nothing you can see, so it must answer
    heldTimers.length = 0;
    sandbox.setTimeout = fn => { heldTimers.push(fn); return heldTimers.length; };
    click('c-copy');
    ok('⧉ answers the click with a ✓ you can see',
        els['c-copy'].textContent === '✓' && /\bdone\b/.test(els['c-copy'].className || ''));
    heldTimers.forEach(fn => fn());
    ok('…which goes away on its own, leaving the tool as it was',
        els['c-copy'].textContent === '⧉' && !/\bdone\b/.test(els['c-copy'].className || ''));
    sandbox.setTimeout = fn => { fn(); return 0; };

    // ✂ cut — copy AND empty
    copied.length = 0;
    click('c-cut');
    ok('✂ copies it and empties the box in one click',
        copied.length === 1 && copied[0] === 'panoya alınacak metin' && els['c-text'].value === '');
    ok('…so the draft tools go with the text', drafty().every(h => h === true));
    ok('…and Send goes dead again, without waiting for the host',
        els['c-send'].disabled === true);
    ok('…still without a word to the agent', posted.length === 0);

    // ✕ clear — no clipboard, no message, just gone
    type('yanlış yazdım, baştan alayım');
    copied.length = 0;
    click('c-clear');
    ok('✕ empties the box', els['c-text'].value === '' && drafty().every(h => h === true));
    ok('…without touching the clipboard', copied.length === 0);
    ok('…and without sending anything', posted.length === 0);

    // a tool on an empty box is a no-op, not a crash and not an empty copy
    click('c-clear');
    click('c-copy');
    ok('a click with nothing in the box does nothing at all',
        copied.length === 0 && posted.length === 0 && els['c-text'].value === '');
}

// ---------- ⎘ paste: the clipboard, at the caret, WITH the space ------------
// ‼️ THE ONE THING A PASTE BUTTON GETS WRONG IS THE SPACE. What lands in a
// prompt is almost always a name lifted from elsewhere, and it lands right after
// the word you were typing — a splice at the caret welds them together and the
// fix costs a click into the middle of what you just pasted.
{
    // put text in the box the way typing does (so the page's own draft follows),
    // then stand the caret where the test wants it
    const caret = (v, at, to) => {
        els['c-text'].value = v;
        els['c-text'].listeners.input();
        els['c-text'].selectionStart = at;
        els['c-text'].selectionEnd = to === undefined ? at : to;
    };
    const click = id => els[id].listeners.click({ preventDefault() { } });
    const paste = () => click('c-paste');

    clipText = 'src/core/live.ts';

    // welded: a word character immediately left of the caret
    caret('look at', 7);
    paste();
    ok('a paste onto the end of a word gets a space put in first',
        els['c-text'].value === 'look at src/core/live.ts');
    ok('…and the caret is left after what was pasted, not before it',
        els['c-text'].selectionStart === 'look at src/core/live.ts'.length);
    // ‼️ the DRAFT is state, not just characters: a paste that only wrote to the
    // box would leave Send dead and Send-after-turn disabled on a full box
    ok('…and the draft the Send buttons read went with it', els['c-send'].disabled === false);

    // already spaced: nothing added, because a double space is the same bug
    caret('look at ', 8);
    paste();
    ok('a space already there is not doubled', els['c-text'].value === 'look at src/core/live.ts');

    // the very start of the box has no left neighbour at all
    caret('', 0);
    paste();
    ok('a paste into an empty box is untouched', els['c-text'].value === 'src/core/live.ts');

    // a newline is whitespace too, and so is an opening bracket
    caret('read:\n', 6);
    paste();
    ok('a paste at the start of a new line is untouched', els['c-text'].value === 'read:\nsrc/core/live.ts');
    caret('read (', 6);
    paste();
    ok('…and so is one right after an opening bracket', els['c-text'].value === 'read (src/core/live.ts');

    // …and mid-text: what is to the RIGHT is left alone, because that is where
    // the caret stays and the next keystroke is the user's
    caret('open  now', 5);
    paste();
    ok('a paste in the middle leaves what follows it alone',
        els['c-text'].value === 'open src/core/live.ts now');

    // clipboard text that brings its own leading space is not given a second
    clipText = ' already-spaced';
    caret('word', 4);
    paste();
    ok('clipboard text that already starts with a space is not given another',
        els['c-text'].value === 'word already-spaced');

    // a SELECTION is replaced, exactly as Ctrl+V would
    clipText = 'NEW';
    caret('keep OLD end', 5, 8);
    paste();
    ok('a selection is replaced, not pushed aside', els['c-text'].value === 'keep NEW end');

    // ‼️ the receipt: a paste is visible in the box, but the ✓ is what says the
    // clipboard READ succeeded rather than silently returning nothing
    clipText = 'x';
    caret('', 0);
    heldTimers.length = 0;
    sandbox.setTimeout = fn => { heldTimers.push(fn); return heldTimers.length; };
    paste();
    ok('⎘ answers the click with a ✓ you can see',
        els['c-paste'].textContent === '✓' && /\bdone\b/.test(els['c-paste'].className || ''));
    heldTimers.forEach(fn => fn());
    ok('…which goes away, leaving the tool as it was', els['c-paste'].textContent === '⎘');
    sandbox.setTimeout = fn => { fn(); return 0; };

    // nothing to paste, and a host that refuses: the box is untouched and
    // nothing is said to the agent
    posted.length = 0;
    clipText = '';
    caret('unchanged', 9);
    paste();
    ok('an empty clipboard changes nothing', els['c-text'].value === 'unchanged');
    clipText = null;
    paste();
    ok('a refused clipboard read changes nothing and crashes nothing',
        els['c-text'].value === 'unchanged' && posted.length === 0);
    clipText = '';

    // ‼️ and it never talks to the agent — it is a text tool like its neighbours
    ok('…and no paste ever sent anything', !posted.some(m => m.type === 'send'));
    els['c-text'].value = '';
    els['c-text'].listeners.input();
}

// ---------- what is allowed to move a card ----------
// Two agents streaming in parallel is a race: each writes one line, each jumps
// over the other, and the column shuffles under the cursor several times a
// second. Nothing moves a card unless you say so.
{
    const list = () => els['c-list']._html;
    const first = () => (/alpha|beta/.exec(list()) || [''])[0];
    const two = (aTs, bTs, over) => Object.assign(data([]), {
        selected: 'A',
        sessions: [
            session([], Object.assign({ id: 'A', agentName: 'alpha', sessionId: 'aaaa1111', lastTs: aTs }, (over || {}).A)),
            session([], Object.assign({ id: 'B', agentName: 'beta', sessionId: 'bbbb2222', lastTs: bTs }, (over || {}).B))
        ].sort((x, y) => y.lastTs - x.lastTs)   // the host sends newest-activity first
    });
    const ord = () => state.afConsole.order;
    const setMode = v => { els['c-ord-mode'].value = v; els['c-ord-mode'].listeners.change({ target: els['c-ord-mode'] }); };
    const setNum = (id, v) => { els[id].value = String(v); els[id].listeners.input({ target: els[id] }); };

    push(two(1000, 900));
    ok('the header carries one small button next to ＋ New session',
        /id="c-new"/.test(els['c-lhead']._html) && /id="c-toggle-order"/.test(els['c-lhead']._html));
    ok('…and nothing else is shown until you open it',
        els['c-opanel']._html === '' && ord().mode === 'fixed');
    ok('the cards arrive newest first', first() === 'alpha');

    push(two(1000, 5000));
    ok('by DEFAULT a burst of activity does not move a card', first() === 'alpha');

    els['c-toggle-order'].listeners.click();
    ok('the ⇅ button opens a miniature panel, the way ⌕ does', /id="c-ord-mode"/.test(els['c-opanel']._html));

    // "busiest on top", undamped, IS the old behaviour — expressible on purpose
    setMode('active');
    setNum('c-ord-ticks', 1);
    setNum('c-ord-hold', 0);
    push(two(1000, 6000));
    ok('1 sign of life and no hold gives the instant version back', first() === 'beta');
    push(two(7000, 6000));
    ok('…both ways', first() === 'alpha');

    // damped: once the order HAS changed it is held still, so the ping-pong
    // two agents streaming in parallel produce happens once per hold, not
    // several times a second
    setNum('c-ord-hold', 30);
    push(two(7000, 9000));
    ok('the first climb after a change is allowed', first() === 'beta');
    push(two(10000, 9000));
    ok('…and then the list is held still for the hold you set', first() === 'beta');

    // damped the other way: a card must earn the move
    setNum('c-ord-hold', 0);
    setNum('c-ord-ticks', 3);
    push(two(11000, 9000));
    push(two(12000, 9000));
    ok('one line is not enough to climb when you asked for three', first() === 'beta');
    push(two(13000, 9000));
    ok('…the third one is', first() === 'alpha');

    // the smarter order: the only thing that earns the top is the ball being YOURS
    setMode('waiting');
    push(two(20000, 1000, { A: { status: 'working' }, B: { status: 'idle', turns: 4 } }));
    ok('"waiting for you first" lifts the one holding your ball', first() === 'beta');
    // …and puts it back once you have answered: the lift is the phase, not a
    // new home. Both working = nobody holds your ball = the arrival order,
    // which activity never touches in this mode.
    push(two(21000, 1000, { A: { status: 'working' }, B: { status: 'working' } }));
    ok('…and puts it back once neither of them needs you', first() === 'alpha');
    push(two(22000, 1000, { A: { status: 'idle', turns: 2, pendingPermission: { detail: 'x', ts: 1 } }, B: { status: 'idle', turns: 4 } }));
    ok('…needs-permission outranks a plain your-turn', first() === 'alpha');

    setMode('fixed');
    ok('the setting is remembered, whatever it is', ord().mode === 'fixed'
        && ord().minTicks === 3 && ord().holdSec === 0);
    ok('…and closed, the column is a button and nothing else',
        (els['c-toggle-order'].listeners.click(), els['c-opanel']._html === ''));
}

// ---------- the answer card: a question you can always finish ----------
//
// ‼️ THE CARD THAT HOLDS THE TURN MUST NEVER BE THE THING THAT MAKES THE TURN
// UNANSWERABLE. Four questions with described options are taller than a short
// panel, and the card had no ceiling and no scroller: everything past the fold
// — including the Answer button — was unreachable, and the session sat blocked
// on a question the user could see but not finish. The fix is a column: header
// and answer strip FIXED, questions scrolling between them.
{
    const askOf = (req, n) => ({
        requestId: req, tool: 'AskUserQuestion', displayName: 'AskUserQuestion',
        questions: Array.from({ length: n }, (_, i) => ({
            question: `Question ${i + 1}?`, header: `H${i + 1}`, multiSelect: true,
            options: [
                { label: `A${i + 1}`, description: 'first' },
                { label: `B${i + 1}`, description: 'second' }
            ]
        }))
    });
    const card = () => els['c-ask']._html;
    const body = () => els['c-ask-body'];
    const opt = (q, o) => qsCache[`askq=${q},asko=${o}`];
    /** What is inside the scrolling part — the stub keeps the card as one
     *  string, so the slice between the two markers IS the scroller. */
    const scroller = () => card().slice(card().indexOf('id="c-ask-body"'), card().indexOf('class="askfoot"'));

    push(data(CONVO.slice(), { pendingAsk: askOf('req-1', 4) }));
    ok('the questions sit in their own scroller', /class="askbody" id="c-ask-body"/.test(card()));
    ok('…and every question is in it', /Question 1\?/.test(scroller()) && /Question 4\?/.test(scroller()));
    // The way OUT is never below the fold — it is not in the scrolling part at
    // all. Free text included: "neither — do it this way" is an answer, and it
    // is worthless if you have to scroll past four questions to reach it.
    ok('the answer strip is outside the scroller', card().indexOf('class="askfoot"') > card().indexOf('id="c-ask-body"'));
    ok('…and holds the buttons and the free-text line',
        /askfoot[\s\S]*id="c-ask-free"[\s\S]*id="c-ask-send"/.test(card())
        && !/id="c-ask-free"/.test(scroller()));

    // A scroller answers "is there more?" only if you already suspect there is,
    // so the card says it: a line under the questions, measured not assumed.
    ok('a card taller than its ceiling is marked as cut', els['c-ask'].className === 'askbox more');
    ok('…and how much of it is still unanswered is in the header', /0\/4 answered/.test(card()));

    // Answering question 3 of 4 must not throw the list back to question 1 —
    // that is the same bug wearing a different hat.
    body().scrollTop = 140;
    opt(2, 0)._fn();
    ok('ticking an option keeps your place in the list', body().scrollTop === 140);
    ok('…and the header counts it', /1\/4 answered/.test(card()));
    ok('…without sending anything yet — a multi-select collects', !posted.some(m => m.type === 'askAnswer'));
    opt(2, 1)._fn();
    ok('a second tick in the same question is still one question answered', /1\/4 answered/.test(card()));

    // A NEW question is one you have not read: it starts at the top.
    push(data(CONVO.slice(), { pendingAsk: askOf('req-2', 2) }));
    ok('a fresh question starts at the top', body().scrollTop === 0);
    ok('…with its own count', /0\/2 answered/.test(card()));

    // The ceiling is a share of the WINDOW, so the same card is short on a tall
    // panel — and then there is nothing to warn about.
    body().scrollHeight = 120; body().clientHeight = 300;
    opt(0, 0)._fn();
    ok('a card that fits is not marked as cut', els['c-ask'].className === 'askbox');
    ok('…and one question of two is counted', /1\/2 answered/.test(card()));

    // A permission ask has no questions: no count, but the same fixed strip —
    // a tool call with a huge input is exactly as unanswerable when it overflows.
    push(data(CONVO.slice(), {
        pendingAsk: { requestId: 'p1', tool: 'Bash', displayName: 'Bash', detail: 'rm -rf /tmp/x' }
    }));
    ok('a permission ask gets the same scroller and strip',
        /class="askbody" id="c-ask-body"/.test(card()) && /askfoot[\s\S]*id="c-ask-allow"/.test(card()));
    ok('…and no answered-count, because there is nothing to count', !/answered<\/span>/.test(card()));

    // …and when the turn is no longer parked on anything, the card leaves.
    push(data(CONVO.slice(), { pendingAsk: null }));
    ok('no question, no card', card() === '');
}

// ---------- attaching files: the gesture has to reach the extension ----------
//
// ‼️ A BUTTON THAT DRAWS, HOVERS AND PRESSES BUT IS WIRED TO NOTHING IS THE
// MOST EXPENSIVE KIND OF BROKEN — 📎 opened no dialog and reported no error, so
// there was nothing to tell "the picker is broken" from "the panel ignored my
// files". It was wired in `buildShell`, where the button does not exist yet:
// it is drawn by statusHtml into the `c-status` SLOT, which is empty at that
// moment and rewritten on every data update. A control is wired where it is
// DRAWN, and this suite is what says so.
{
    const clicks = () => posted.filter(m => m.type === 'attachPick').length;
    const before = clicks();
    ok('📎 is on the page', /id="c-attach"/.test(els['c-status']._html));
    ok('…and it is wired — the bug was that it was not', !!els['c-attach'].listeners.click);
    els['c-attach'].listeners.click();
    ok('…so pressing it asks the extension for the file dialog', clicks() === before + 1);

    // The row it lives in is rewritten on every data update, and a listener
    // does not survive a rewrite: it has to be re-attached with the row.
    push(data(CONVO.slice(), { turns: 9 }));
    ok('the status row was rewritten', /9 turns/.test(els['c-status']._html));
    els['c-attach'].listeners.click();
    ok('…and 📎 still works after it', clicks() === before + 2);

    // ---- dropping ----
    // The drop target is the whole PAGE, not the box: a file let go two
    // centimetres from a target nobody knew about looks exactly like a feature
    // that does not work.
    const drop = dt => els.app.listeners.drop({
        preventDefault() { }, stopPropagation() { }, dataTransfer: dt
    });
    const last = t => [...posted].reverse().find(m => m.type === t);
    ok('the page itself takes the drop', !!els.app.listeners.drop && !!els.app.listeners.dragover);

    posted = [];
    drop({ getData: k => (k === 'text/uri-list' ? 'file:///d:/a/b.png\n#comment' : ''), files: [] });
    ok('a drag from the Explorer hands over its uris',
        last('attachUris') && last('attachUris').uris.join() === 'file:///d:/a/b.png');

    posted = [];
    drop({ getData: () => '', files: [{ name: 'shot.png' }] });
    ok('a drag from the file manager hands over the bytes — the path is the host\'s job',
        last('attachDrop') && last('attachDrop').files[0].name === 'shot.png');

    // Some drags carry the path as plain text and nothing else.
    posted = [];
    drop({ getData: k => (k === 'text/plain' ? 'D:\\zone\\a.png' : ''), files: [] });
    ok('a path arriving as plain text is still a file',
        last('attachUris') && last('attachUris').uris.join() === 'D:\\zone\\a.png');

    // ‼️ AND A DROP THAT CARRIED NOTHING SAYS SO. Silence is the bug seen from
    // the other side: the panel does not move, and "nothing was attached" is
    // indistinguishable from "attached, but never shown".
    posted = [];
    drop({ getData: () => '', files: [] });
    ok('a drop with nothing in it is answered, not ignored', !!last('attachNothing'));
    posted = [];
    drop({ getData: k => (k === 'text/plain' ? 'just some words' : ''), files: [] });
    ok('…and so is a drop of plain words that name no file', !!last('attachNothing'));

    // ---- and what arrives is VISIBLE ----
    msgHandler({
        data: {
            type: 'attached',
            files: [{ path: 'D:/a/shot.png', name: 'shot.png', bytes: 2048, kind: 'image' }]
        }
    });
    ok('an attached file shows up as a chip', /shot\.png/.test(els['c-chips']._html));
    ok('…saying how it will travel, and how big it is',
        /embedded/.test(els['c-chips']._html) && /2 KB/.test(els['c-chips']._html));
    ok('…and the button carries the count', els['c-attach'].textContent === '📎 1');
    ok('…with a way to take it off again', /data-drop="D:\/a\/shot\.png"/.test(els['c-chips']._html));

    // ---- ‼️ AND THE MOMENT IT IS SENT, IT IS GONE FROM THE COMPOSER ----
    //
    // This is the bug reported from the other side: attach files, send, and the
    // chips were still sitting there while you typed the next message. The
    // composer had emptied `st.attach` — nothing redrew the list, because it was
    // written by hand from three places and never from the render path — so the
    // panel showed files hanging on a message that would go out WITHOUT them.
    // A surface that lies about what it is about to send is worse than one that
    // never had the feature.
    posted = [];
    els['c-text'].value = 'here you go';
    els['c-text'].listeners.input();
    els['c-send'].listeners.click();
    const sent = [...posted].reverse().find(m => m.type === 'send' || m.type === 'start');
    ok('the files really do go with the message',
        sent && sent.attach && sent.attach.length === 1 && sent.attach[0].path === 'D:/a/shot.png');
    ok('‼️ …and the chips are gone the moment it is sent', els['c-chips']._html === '');
    ok('…the count goes with them', els['c-attach'].textContent === '📎');
    ok('…and a second send carries nothing it was not given', (() => {
        posted = [];
        els['c-text'].value = 'and again';
        els['c-text'].listeners.input();
        els['c-send'].listeners.click();
        const two = [...posted].reverse().find(m => m.type === 'send' || m.type === 'start');
        return two && (!two.attach || two.attach.length === 0);
    })());

    // A refused send hands the message back whole — text AND files — so the
    // refusal costs you nothing you had already done.
    msgHandler({
        data: {
            type: 'restore', text: 'here you go',
            files: [{ path: 'D:/a/shot.png', name: 'shot.png', bytes: 2048, kind: 'image' }]
        }
    });
    ok('a refused send puts the files back on screen', /shot\.png/.test(els['c-chips']._html));
    // …and take it off again, so the rest of the suite starts clean. One
    // listener on the container, not one per chip — the list is rebuilt on
    // every change, so per-chip listeners would pile up.
    els['c-chips'].listeners.click({
        target: { getAttribute: k => (k === 'data-drop' ? 'D:/a/shot.png' : null) }
    });
    ok('✕ takes a chip off, and the list follows', els['c-chips']._html === '');
}

// ---------- the drag itself: a highlight is a STATE, not a per-frame command ----
//
// ‼️ A DRAG THAT REPAINTS THE PAGE SIXTY TIMES A SECOND IS A REAL COST, NOT A
// STYLE DETAIL. `dragover` fires continuously while the hand is over the page
// and `dragleave` bubbles up from every child the pointer crosses, so turning
// the outline on in one and off in the other wrote the class dozens of times a
// second for the whole drag — a style recalculation and a full-page repaint per
// frame, on a machine whose display driver reset during exactly this gesture.
{
    const app = els.app;
    const dt = (types, files) => ({
        types: types || [], files: files || [],
        getData: () => '', dropEffect: ''
    });
    const ev = (over, target) => ({
        preventDefault() { this._prevented = true; },
        stopPropagation() { },
        dataTransfer: over, target: target || { id: 'talk' }, _prevented: false
    });

    const composer = sandbox.document.getElementById('c-composer');
    composer._classWrites = 0;
    const e1 = ev(dt(['Files']));
    app.listeners.dragenter(e1);
    ok('a file drag lights the composer', composer.classList.contains('drop'));
    ok('…and the page claims the drag, or the browser refuses the drop', e1._prevented);
    const writes = composer._classWrites;
    for (let i = 0; i < 40; i++) { app.listeners.dragover(ev(dt(['Files']))); }
    ok('‼️ forty dragover frames write the highlight ZERO more times',
        composer._classWrites === writes);
    const over = ev(dt(['Files']));
    app.listeners.dragover(over);
    ok('…and the cursor is told this is a copy', over.dataTransfer.dropEffect === 'copy');

    // Crossing a child element fires dragleave without the hand ever leaving.
    app.listeners.dragenter(ev(dt(['Files'])));
    app.listeners.dragleave(ev(dt(['Files'])));
    ok('crossing a child is not a departure — the highlight stays',
        composer.classList.contains('drop'));
    app.listeners.dragleave(ev(dt(['Files'])));
    ok('…and leaving for real puts it out', !composer.classList.contains('drop'));

    // ---- a text drag is NOT ours ----
    // Claiming every drag killed dropping selected text into the message box,
    // an ordinary thing to do that used to work.
    posted = [];
    const textIntoBox = ev(dt(['text/plain']), { id: 'c-text' });
    app.listeners.dragover(textIntoBox);
    ok('‼️ text dragged into the box is left to the box', !textIntoBox._prevented);
    app.listeners.drop({
        preventDefault() { this._prevented = true; }, stopPropagation() { },
        dataTransfer: { types: ['text/plain'], files: [], getData: () => 'some notes' },
        target: { id: 'c-text' }, _prevented: false
    });
    ok('…and dropping it there attaches nothing and warns about nothing',
        !posted.some(m => String(m.type).indexOf('attach') === 0));

    // ---- what counts as a path, when text is all there is ----
    const dropText = (s, target) => {
        posted = [];
        app.listeners.drop({
            preventDefault() { }, stopPropagation() { },
            dataTransfer: { types: ['text/plain'], files: [], getData: k => (k === 'text/plain' ? s : '') },
            target: target || { id: 'talk' }
        });
        return [...posted].reverse();
    };
    ok('an absolute Windows path dropped as text is a file',
        dropText('D:\\zone\\a.png').some(m => m.type === 'attachUris'));
    ok('…a UNC share too', dropText('\\\\server\\share\\a.png').some(m => m.type === 'attachUris'));
    ok('…and a posix path', dropText('/home/me/a.png').some(m => m.type === 'attachUris'));
    // ‼️ "contains a slash" read every dragged sentence and every URL as a
    // filename, and each one became a warning about a file that never existed.
    ok('‼️ a relative fragment is NOT a file — it has no meaning without a cwd',
        !dropText('src/core/a.ts').some(m => m.type === 'attachUris'));
    ok('…nor is a dragged sentence with a slash in it',
        !dropText('this and/or that').some(m => m.type === 'attachUris'));

    // ---- bytes: the ceiling, the media type, and the ending that speaks ----
    const dropFiles = files => {
        posted = [];
        app.listeners.drop({
            preventDefault() { }, stopPropagation() { },
            dataTransfer: { types: ['Files'], files, getData: () => '' },
            target: { id: 'talk' }
        });
        return [...posted].reverse();
    };
    const found = (out, t) => out.find(m => m.type === t);

    // ‼️ The clipboard's media type travels with the bytes: a pasted screenshot
    // frequently has no name, and the SUFFIX is what decides whether the model
    // sees the picture (see safeAttachmentName).
    const typed = dropFiles([{ name: '', type: 'image/png' }]);
    ok('a pasted screenshot hands over its media type, not just its bytes',
        found(typed, 'attachDrop') && found(typed, 'attachDrop').files[0].type === 'image/png');

    // The ceiling is applied HERE, against what is already on the message, so
    // twenty-one dropped files do not each get written into the temp folder
    // before the twenty-first is refused.
    const many = [];
    for (let i = 0; i < 25; i++) { many.push({ name: `f${i}.txt`, type: 'text/plain' }); }
    const capped = dropFiles(many);
    ok('more files than the limit are refused out loud', !!found(capped, 'attachTooMany'));
    ok('…and only what fits is ever staged',
        found(capped, 'attachDrop') && found(capped, 'attachDrop').files.length === 20);

    // ‼️ AND A READ THAT PRODUCED NOTHING SAYS SO. This path used to return in
    // silence, which is the exact complaint this feature keeps drawing: the
    // page does not move, and "nothing was attached" cannot be told from
    // "attached, but never shown".
    const realReader = sandbox.FileReader;
    sandbox.FileReader = function () {
        this.readAsDataURL = function () { if (this.onerror) { this.onerror(); } };
    };
    const broke = dropFiles([{ name: 'a.png' }, { name: 'b.png' }]);
    ok('‼️ a drop whose bytes could not be read is answered, not swallowed',
        !!found(broke, 'attachNothing') && !found(broke, 'attachDrop'));
    sandbox.FileReader = realReader;
}

// ---------- K-9: the height you drag is a SETTING, not a side effect --------
//
// ‼️ TWO THINGS THREW IT AWAY, WHICH IS WHY IT LOOKED RANDOM. The ceiling was
// 30vh, so a drag past a third of the window did nothing and the handle stopped
// under the cursor. And the height a drag sets is an INLINE style, which
// `buildShell` replaces — so any rebuild (another session picked, a turn
// ending, an agent pinned) put the box back to 64px, and whether it survived
// depended on whether a rebuild happened to land between the drag and the next
// look. Both are gone: the box is saved and restored with the draft it holds.
{
    const src = fs.readFileSync(path.resolve(__dirname, '../media/console.js'), 'utf8');
    ok('‼️ the writing box has room to be dragged into',
        /max-height:70vh; resize:vertical/.test(src)
        && !/max-height:30vh/.test(src));
    ok('the dragged height is part of the page\'s own state, next to the draft',
        /boxH: '',/.test(src));
    ok('‼️ …restored after the rebuild that just destroyed the element it was on',
        /if \(st\.boxH\) \{ text\.style\.height = st\.boxH; \}/.test(src));
    ok('…and restored BEFORE focus, so the box is its real size when the caret lands',
        src.indexOf('text.style.height = st.boxH') < src.indexOf('text.focus({ preventScroll: true })'));
    // A window resize changes the RENDERED height and leaves the inline one
    // alone — so reading the inline value tells a user drag from a re-layout.
    ok('‼️ a drag is recorded, a re-layout is not',
        /new ResizeObserver\(\(\) => \{\s*\n\s*const h = text\.style\.height;\s*\n\s*if \(h && h !== st\.boxH\) \{ st\.boxH = h; save\(\); \}/.test(src));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
