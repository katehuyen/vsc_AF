// DOM-stub tests: timeline click-through carries ts, session viewer focuses the
// nearest message, and the filter box clear (✕) button works (real page handlers).
const fs = require('fs');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// ---------- part 1: timeline.js — marks/segments carry data-ts + click posts ts ----------
{
    const code = fs.readFileSync(require('path').resolve(__dirname, '../media/pageHeader.js'), 'utf8') + '\n' + fs.readFileSync(require('path').resolve(__dirname, '../media/timeline.js'), 'utf8');
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
                workflowRuns: [], turnActions: {}
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
    const code = fs.readFileSync(require('path').resolve(__dirname, '../media/pageHeader.js'), 'utf8') + '\n' + fs.readFileSync(require('path').resolve(__dirname, '../media/sessionViewer.js'), 'utf8');
    let posted = [];
    let focused = null;
    let msgHandler = null;
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
                fmtUSD: (n) => '$' + (n || 0)
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
            addEventListener: (ev, fn) => { if (ev === 'message') { msgHandler = fn; } },
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
