// DOM-stub tests: timeline click-through carries ts, session viewer focuses the
// nearest message, and the filter box clear (✕) button works (real page handlers).
const fs = require('fs');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// ---------- part 1: timeline.js — marks/segments carry data-ts + click posts ts ----------
{
    const code = require(require('path').join(__dirname, 'lib_shared_media.js')).sharedMedia()
        + fs.readFileSync(require('path').resolve(__dirname, '../media/timeline.js'), 'utf8');
    let posted = [];
    let lastHtml = '';
    let markEls = [];

    function elemsForSelector(sel) {
        if (sel !== '.mark') { return []; }
        const els = [];
        const re = /class="mark" data-file="([^"]*)" data-ts="([^"]*)"/g;
        let m;
        while ((m = re.exec(lastHtml))) {
            const el = { dataset: { file: m[1], ts: m[2] } };
            el.addEventListener = (_e, fn) => { el._click = fn; };
            els.push(el);
        }
        markEls = els;
        return els;
    }

    const appEl = { set innerHTML(v) { lastHtml = v; }, get innerHTML() { return lastHtml; } };
    const stubEl = { addEventListener() { }, set innerHTML(v) { } };

    const T = Date.now() - 120000;
    const sandbox = {
        acquireVsCodeApi: () => ({ postMessage: (m) => posted.push(m), getState() { }, setState() { } }),
        window: {
            AFCharts: { esc: (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') },
            __DATA__: {
                listener: { state: 'listening', port: 1 },
                sessions: [{ agentName: 'dev', status: 'working', prompts: 1, toolCalls: 1, compactions: 0, subagentStops: 0, lastEventTs: T }],
                events: [
                    { sessionId: 's1', agentName: 'dev', ts: T, kind: 'prompt', detail: 'hi', transcriptPath: 'C:/t/x.jsonl' },
                    { sessionId: 's1', agentName: 'dev', ts: T + 1000, kind: 'toolStart', tool: 'Bash', transcriptPath: 'C:/t/x.jsonl' },
                    { sessionId: 's1', agentName: 'dev', ts: T + 5000, kind: 'toolEnd', tool: 'Bash', transcriptPath: 'C:/t/x.jsonl' }
                ],
                workflowRuns: [], sessionAlerts: {}, alertActions: ['sound', 'focus', 'modal', 'toast']
            },
            addEventListener() { }
        },
        document: {
            getElementById: (id) => id === 'app' ? appEl : (id === 'install' ? null : stubEl),
            querySelectorAll: elemsForSelector
        },
        setInterval: () => 0, console
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox); // runs render() once

    ok('prompt mark carries data-ts', new RegExp('<circle[^>]*class="mark" data-file="C:/t/x.jsonl" data-ts="' + T + '"').test(lastHtml));
    ok('tool segment is clickable with file+ts', new RegExp('<rect[^>]*class="mark" data-file="C:/t/x.jsonl" data-ts="' + (T + 1000) + '"').test(lastHtml));

    posted = [];
    const seg = markEls.find(e => e.dataset.ts === String(T + 1000));
    seg._click();
    ok('segment click posts openSession', posted.length === 1 && posted[0].type === 'openSession');
    ok('…with the transcript file', posted[0].file === 'C:/t/x.jsonl');
    ok('…with the clicked timestamp as a number', posted[0].ts === T + 1000);

    posted = [];
    markEls.find(e => e.dataset.ts === String(T))._click();
    ok('prompt mark click posts its own ts', posted[0] && posted[0].ts === T);
}

// ---------- part 2: sessionViewer.js — focusTs scroll/flash + filter clear ----------
{
    const code = require(require('path').join(__dirname, 'lib_shared_media.js')).sharedMedia()
        + fs.readFileSync(require('path').resolve(__dirname, '../media/sessionViewer.js'), 'utf8');
    let posted = [];
    let focused = null;
    // ‼️ A LIST, not one handler. The viewer listens twice now: once for its own
    // host messages and once, at module scope, for the right-click relay.
    // Keeping only the last registration silently drops the other.
    const msgHandlers = [];
    const msgHandler = (ev) => msgHandlers.forEach(fn => fn(ev));
    const els = {};
    function getEl(id) {
        if (id === 'turnbox') { return null; }
        if (!els[id]) {
            els[id] = {
                id, listeners: {}, style: {}, value: '', _html: '',
                addEventListener(ev, fn) { this.listeners[ev] = fn; },
                set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; },
                focus() { this.focused = true; }
            };
        }
        return els[id];
    }

    const sandbox = {
        acquireVsCodeApi: () => ({ postMessage: (m) => posted.push(m), getState() { }, setState() { } }),
        window: {
            AFCharts: {
                esc: (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
                fmtTok: (n) => String(n || 0),
            STEP_KIND: {},

            stepChip: () => '',

            stepKindLegend: () => '',

            stepKindLegendText: () => 'legend',

            fmtTokW(n, w) { return this.fmtTok(n || 0) + (w > 0 ? ' [w' + this.fmtTok(Math.round(w)) + ']' : ''); },
            fmtTokWText(n, w) { return this.fmtTok(n || 0) + (w > 0 ? ' (w' + this.fmtTok(Math.round(w)) + ')' : ''); },
            WEIGHTED_TIP: 'weighted',
                fmtUSD: (n) => '$' + (n || 0),
                aiLabel: (m, u) => { const n = /^claude/i.test(m || '') ? 'claude' : /^gemini/i.test(m || '') ? 'gemini' : /^gpt|codex/i.test(m || '') ? 'codex' : 'agent'; return u ? n.toUpperCase() : n; }
            },
            __DATA__: {
                title: 't', sessionId: 'sess', cwd: '', permissionMode: '',
                firstTs: 1000, lastTs: 9000, models: [],
                usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                totalTokens: 0, cost: 0, errors: 0, toolCalls: 0,
                context: { tokens: 0, limit: 0 },
                turnCount: 2, turnTotals: {}, turns: [],
                messageCount: 3, truncatedCount: 0,
                messages: [
                    { role: 'user', ts: 1000, text: 'hello one', turn: 1, turnStart: true },
                    { role: 'assistant', ts: 5000, text: 'answer mid', turn: 1 },
                    { role: 'user', ts: 9000, text: 'hello two', turn: 2, turnStart: true }
                ],
                focusTs: 5200
            },
            addEventListener: (ev, fn) => { if (ev === 'message') { msgHandlers.push(fn); } },
            scrollTo() { }, scrollX: 0, scrollY: 0
        },
        document: {
            getElementById: getEl,
            querySelectorAll: () => [],
            querySelector: (sel) => {
                const m = /data-idx="(\d+)"/.exec(sel);
                if (!m) { return null; }
                focused = {
                    idx: Number(m[1]), classes: [],
                    scrollIntoView(opts) { this.scrollOpts = opts; },
                    classList: {
                        add: (c) => focused.classes.push(c),
                        remove: (c) => { focused.classes = focused.classes.filter(x => x !== c); }
                    }
                };
                return focused;
            }
        },
        setTimeout: () => 0, clearTimeout: () => { }, console
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox); // render() + initial focusAt(DATA.focusTs)

    ok('initial focus lands on nearest message (ts 5000 for 5200)', focused && focused.idx === 1);
    ok('focused message is flashed', focused && focused.classes.indexOf('flash') !== -1);
    ok('focused message is centered', focused && focused.scrollOpts && focused.scrollOpts.block === 'center');

    // host "focus" message (panel already open) → jumps to the new nearest message
    msgHandler({ data: { type: 'focus', ts: 8800 } });
    ok('focus message jumps to nearest (idx 2)', focused && focused.idx === 2);

    // filter clear button: hidden while empty, shown on typing, click resets everything
    ok('clear button rendered hidden initially', /id="filterclear"[^>]*display:none/.test(getEl('app')._html));
    const input = getEl('filter'), clear = getEl('filterclear');
    input.value = 'hello two';
    input.listeners.input();
    ok('typing filters the list', getEl('msgs')._html.indexOf('hello two') !== -1 && getEl('msgs')._html.indexOf('answer mid') === -1);
    ok('clear button becomes visible', clear.style.display === '');
    clear.listeners.click();
    ok('clear empties the input', input.value === '');
    ok('clear restores all messages', getEl('msgs')._html.indexOf('answer mid') !== -1);
    ok('clear hides itself again', clear.style.display === 'none');
    ok('clear refocuses the input', input.focused === true);

    // ⌂ agent button: absent while the session has no owner agent; a data push
    // with an owner renders it; clicking posts openAgent with the session cwd.
    ok('no agent button without an owner agent', getEl('app')._html.indexOf('id="agentpage"') === -1);
    msgHandler({
        data: {
            type: 'data',
            data: Object.assign({}, sandbox.window.__DATA__, {
                agentId: 'd:/a/developer', agentName: 'developer', cwd: 'D:/a/developer'
            })
        }
    });
    ok('agent button names the owner agent', getEl('app')._html.indexOf('⌂ developer') !== -1);
    posted = [];
    getEl('agentpage').listeners.click();
    ok('agent button posts openAgent with the session cwd',
        posted[0] && posted[0].type === 'openAgent' && posted[0].cwd === 'D:/a/developer');
}

// ---------- part 3: S-4 — the page opens in the scope the opener asked in ----
//
// ‼️ THE WIDENING WAS A TIE BROKEN THE WRONG WAY, not the deep link's doing.
// A prompt and the tool call it sets off share a timestamp, so "nearest overall"
// picked whichever came first in the file — and when that was a tool call, the
// page threw the whole filter away to reach it. A search made in Dialog
// therefore landed on a transcript showing everything, every time.
{
    const code = require(require('path').join(__dirname, 'lib_shared_media.js')).sharedMedia()
        + fs.readFileSync(require('path').resolve(__dirname, '../media/sessionViewer.js'), 'utf8');
    const msgHandlers = [];
    const msgHandler = (ev) => msgHandlers.forEach(fn => fn(ev));
    let focused = null;
    const els = {};
    const getEl = (id) => {
        if (id === 'turnbox') { return null; }
        if (!els[id]) {
            els[id] = {
                id, listeners: {}, style: {}, value: '', _html: '',
                addEventListener(ev, fn) { this.listeners[ev] = fn; },
                set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; },
                focus() { this.focused = true; }
            };
        }
        return els[id];
    };
    const C = {
        esc: (s) => String(s), fmtTok: (n) => String(n || 0), STEP_KIND: {},
        stepChip: () => '', stepKindLegend: () => '', stepKindLegendText: () => 'legend',
        fmtTokW(n) { return this.fmtTok(n || 0); }, fmtTokWText(n) { return this.fmtTok(n || 0); },
        WEIGHTED_TIP: 'weighted', fmtUSD: (n) => '$' + (n || 0), aiLabel: () => 'agent'
    };
    // A user prompt and the tool call it triggered, at the SAME instant — the
    // shape the old tie-break got wrong. The tool call is listed first.
    const DATA = {
        title: 't', sessionId: 'sess', cwd: '', permissionMode: '',
        firstTs: 1000, lastTs: 9000, models: [],
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        totalTokens: 0, cost: 0, errors: 0, toolCalls: 1,
        context: { tokens: 0, limit: 0 },
        turnCount: 1, turnTotals: {}, turns: [],
        messageCount: 3, truncatedCount: 0,
        messages: [
            { role: 'tool', ts: 5000, text: 'ran a thing', tool: 'Bash', turn: 1 },
            { role: 'user', ts: 5000, text: 'the parser question', turn: 1, turnStart: true },
            { role: 'assistant', ts: 9000, text: 'the answer', turn: 1 }
        ],
        focusTs: 5000,
        // what the Search page was searching IN
        focusRoles: ['user', 'assistant']
    };
    const sandbox = {
        acquireVsCodeApi: () => ({ postMessage: () => { }, getState() { }, setState() { } }),
        window: {
            AFCharts: C, __DATA__: DATA,
            addEventListener: (ev, fn) => { if (ev === 'message') { msgHandlers.push(fn); } },
            scrollTo() { }, scrollX: 0, scrollY: 0
        },
        document: {
            getElementById: getEl, querySelectorAll: () => [],
            querySelector: (sel) => {
                const m = /data-idx="(\d+)"/.exec(sel);
                if (!m) { return null; }
                focused = {
                    idx: Number(m[1]), classes: [], scrollIntoView() { },
                    classList: { add: (c) => focused.classes.push(c), remove: () => { } }
                };
                return focused;
            }
        },
        setTimeout: () => 0, clearTimeout: () => { }, console
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);

    const html = () => getEl('app')._html;
    ok('‼️ the opener\'s scope wins over the page default',
        /class="chip on"[^>]*data-chip="user"/.test(html())
        && /class="chip on"[^>]*data-chip="assistant"/.test(html()));
    ok('…so tool traffic is NOT switched on by the jump',
        !/class="chip on"[^>]*data-chip="tool"/.test(html()));
    // ‼️ The tool call is listed FIRST and shares the prompt's timestamp, so
    // "nearest overall" used to land on it — and reaching a hidden target meant
    // wiping the filter. Now a shown message at the same instant wins, and the
    // page the reader asked for is the page they get.
    ok('‼️ …and the filter survives the jump: a shown message at the same instant wins',
        html().indexOf('the parser question') !== -1);
    ok('…the tool line it used to widen for stays hidden',
        html().indexOf('ran a thing') === -1);

    // A scope handed over to an ALREADY-OPEN page is taken too — otherwise the
    // second click from the results answers differently from the first.
    msgHandler({ data: { type: 'focus', ts: 5000, roles: ['tool'] } });
    ok('a scope handed over later is taken too',
        /class="chip on"[^>]*data-chip="tool"/.test(html()));
    ok('…and it reaches the tool line it was pointed at',
        /<div id="msgs"><div class="msg tool"/.test(html())
        && html().indexOf('the parser question') === -1);
    ok('…without the filter having to be thrown away to get there',
        !/class="chip on"[^>]*data-chip="user"/.test(html()));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
