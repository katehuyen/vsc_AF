// DOM-stub tests: session viewer turn accordion — the fully-folded single-open
// opening state, per-band fold/unfold, Expand all / Collapse all, single-open
// mode (+ its webview-state persistence), newly arrived turns folding
// themselves, focus auto-unfolding the target turn, and the role-chip binder
// not swallowing unrelated .chip buttons (turnbox All/None/Invert, accordion).
const fs = require('fs');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const code = fs.readFileSync(require('path').resolve(__dirname, '../media/pageHeader.js'), 'utf8') + '\n' + fs.readFileSync(require('path').resolve(__dirname, '../media/afFilters.js'), 'utf8') + '\n' + fs.readFileSync(require('path').resolve(__dirname, '../media/sessionViewer.js'), 'utf8');

const count = (html, needle) => html.split(needle).length - 1;

/** The real duration / api-steps formatters — see the note in the sandbox. */
const realCharts = (() => {
    const box = vm.createContext({ window: {} });
    vm.runInContext(fs.readFileSync(require('path').resolve(__dirname, '../media/charts.js'), 'utf8'), box);
    return box.window.AFCharts;
})();

function makeSandbox(opts) {
    const state = { saved: null, initial: (opts && opts.initialState) || undefined };
    const els = {};
    const seenSelectors = [];
    let focused = null;
    let msgHandler = null;

    function getEl(id) {
        if (!els[id]) {
            els[id] = {
                id, listeners: {}, style: {}, value: '', _html: '',
                addEventListener(ev, fn) { this.listeners[ev] = fn; },
                querySelectorAll: () => [],
                set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; },
                focus() { this.focused = true; }
            };
        }
        return els[id];
    }

    const sandbox = {
        acquireVsCodeApi: () => ({
            postMessage() { },
            getState: () => state.saved || state.initial,
            setState: (s) => { state.saved = s; }
        }),
        window: {
            AFCharts: {
                esc: (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
                fmtTok: (n) => String(n || 0),
                fmtUSD: (n) => '$' + (n || 0),
                // the REAL ones — the band's duration and api/steps strings are
                // the same strings every other surface writes (see charts.js)
                fmtDur: realCharts.fmtDur,
                fmtSteps: realCharts.fmtSteps,
                STEPS_TIP: realCharts.STEPS_TIP,
                aiLabel: (m, u) => { const n = /^claude/i.test(m || '') ? 'claude' : /^gemini/i.test(m || '') ? 'gemini' : /^gpt|codex/i.test(m || '') ? 'codex' : 'agent'; return u ? n.toUpperCase() : n; }
            },
            __DATA__: {
                title: 't', sessionId: 'sess', cwd: '', permissionMode: '',
                firstTs: 500, lastTs: 6000, models: [],
                usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                totalTokens: 0, cost: 0, errors: 0, toolCalls: 0,
                context: { tokens: 0, limit: 0 },
                turnCount: 3, turnTotals: {},
                turns: [
                    // ms / apiCalls / steps / endCtx are what the band reports
                    // about a turn besides its price — see turnHdrHtml.
                    { n: 1, label: 'one', ts: Date.UTC(2026, 4, 12, 11, 32), ms: 3723000, apiCalls: 14, steps: 26, endCtx: 202300 },
                    { n: 2, label: 'two' },
                    { n: 3, label: 'three' }
                ],
                messageCount: 7, truncatedCount: 0,
                messages: [
                    // turnless preamble (arrives before the first prompt); assistant
                    // so the default Dialog filter keeps it on screen
                    { role: 'assistant', ts: 500, text: 'preamble sys' },
                    { role: 'user', ts: 1000, text: 'ask one', turn: 1, turnStart: true },
                    { role: 'assistant', ts: 2000, text: 'ans one', turn: 1 },
                    { role: 'user', ts: 3000, text: 'ask two', turn: 2, turnStart: true },
                    { role: 'assistant', ts: 4000, text: 'ans two', turn: 2 },
                    { role: 'user', ts: 5000, text: 'ask three', turn: 3, turnStart: true },
                    { role: 'assistant', ts: 6000, text: 'ans three', turn: 3 }
                ]
            },
            addEventListener: (ev, fn) => { if (ev === 'message') { msgHandler = fn; } },
            scrollTo() { }, scrollX: 0, scrollY: 0
        },
        document: {
            getElementById: getEl,
            querySelectorAll: (sel) => { seenSelectors.push(sel); return []; },
            querySelector: (sel) => {
                const m = /data-idx="(\d+)"/.exec(sel);
                if (!m) { return null; }
                focused = {
                    idx: Number(m[1]), classes: [],
                    scrollIntoView(o) { this.scrollOpts = o; },
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
    vm.runInContext(code, sandbox);
    return {
        appHtml: () => getEl('app')._html,
        click: (id) => getEl(id).listeners.click(),
        bandClick: (turn) => {
            const hdr = { dataset: { turn: String(turn) } };
            getEl('msgs').listeners.click({
                target: { closest: (sel) => sel === '.turnhdr[data-turn]' ? hdr : null }
            });
        },
        focusMsg: (ts) => msgHandler({ data: { type: 'focus', ts } }),
        pushData: (d) => msgHandler({ data: { type: 'data', data: d } }),
        data: () => sandbox.window.__DATA__,
        lastFocused: () => focused,
        savedState: () => state.saved,
        seenSelectors
    };
}

// ---------- opening state: fully folded, single-open on ----------
{
    const t = makeSandbox();
    let html = t.appHtml();
    ok('controls row rendered', html.includes('id="t-expandall"') && html.includes('id="t-collapseall"') && html.includes('id="t-singleopen"'));
    ok('a transcript opens fully folded', count(html, 'class="turnhdr closed"') === 3 && count(html, ' tclosed"') === 6);
    ok('…and in single-open mode', html.includes('class="chip on" id="t-singleopen"'));
    ok('…but the turnless preamble is never folded', html.includes('class="msg assistant" data-idx="0"'));
    // Counted on the band's own caret span — the header toolbar has carets of
    // its own (the claimed Console button's menu), and they are not turns.
    ok('folded bands carry a ▸ caret',
        count(html, '<span class="tcaret">▸</span>') === 3
        && count(html, '<span class="tcaret">▾</span>') === 0);
    // ‼️ The band answers the four questions a turn raises, folded or not: how
    // long, how many round trips (and the steps they carried), what it cost,
    // and where it left the window. It used to show a single step count, only
    // while folded — the number that explains the least, hidden the rest of the
    // time. `14api/26` is the shape every surface uses (charts.js fmtSteps).
    ok('band says how long the turn ran, in the shared duration format',
        html.includes('1h-2m-3s'));
    ok('band says round trips AND steps, never one number for both',
        html.includes('14api/26') && !html.includes('26 msgs'));
    ok('band says where the turn left the window',
        html.includes('ctx 202300'));
    ok('a turn with none of it measured says nothing rather than zeros',
        !html.includes('0s') && !html.includes('ctx 0'));
    // The band's hover is the turn's start date — never "click to expand", which
    // the caret and the controls row already say. Labelled, dated, and carrying
    // how long ago it was; turn 2 has no ts of its own and falls back to the
    // timestamp of the message that opens it.
    ok('band tooltip is the turn start stamp, not a click hint',
        !html.includes('Click to expand')
        && html.includes('title="Turn started · ')
        && /title="Turn started · [^"]*2026[^"]*\(\d+ (day|month|year)s? ago\)"/.test(html)
        && count(html, 'title="Turn started · ') === 4);  // 3 bands + 1 breakdown row

    t.click('t-expandall');
    html = t.appHtml();
    ok('expand all opens everything', count(html, 'turnhdr closed') === 0 && count(html, ' tclosed"') === 0);
    ok('open bands carry a ▾ caret', count(html, '<span class="tcaret">▾</span>') === 3);

    t.click('t-collapseall');
    html = t.appHtml();
    ok('collapse all folds every band again', count(html, 'class="turnhdr closed"') === 3);
    ok('…hides every turn message', count(html, ' tclosed"') === 6);

    // multi-open behavior: switch the default single-open mode off first
    t.click('t-singleopen');
    t.bandClick(2);
    html = t.appHtml();
    ok('band click unfolds that turn only', count(html, 'class="turnhdr closed"') === 2
        && html.includes('class="msg assistant tclosed" data-idx="2"')   // turn 1 still folded
        && html.includes('class="msg assistant" data-idx="4"')           // turn 2 visible
        && count(html, ' tclosed"') === 4);

    t.bandClick(1);
    html = t.appHtml();
    ok('second unfold keeps the first open (multi-open)', count(html, 'class="turnhdr closed"') === 1);

    t.bandClick(1);
    html = t.appHtml();
    ok('band click folds an open turn back', count(html, 'class="turnhdr closed"') === 2);

    t.click('t-expandall');
    html = t.appHtml();
    ok('expand all reopens everything', count(html, 'turnhdr closed') === 0 && count(html, ' tclosed"') === 0);

    // role-chip binder must not grab unrelated .chip buttons (turnbox selact / accordion)
    ok('chip binder queries only data-chip/data-preset chips',
        t.seenSelectors.includes('.chip[data-chip],.chip[data-preset]') && !t.seenSelectors.includes('.chip'));
}

// ---------- single-open mode ----------
{
    const t = makeSandbox();
    t.click('t-singleopen');   // off — so two turns can be opened at once
    t.bandClick(1);
    t.bandClick(2); // multi mode: 1 and 2 both open now

    t.click('t-singleopen');   // back on
    let html = t.appHtml();
    ok('enabling single-open keeps only the first open turn', count(html, 'class="turnhdr closed"') === 2
        && html.includes('class="turnhdr closed" data-turn="2"') && html.includes('class="turnhdr closed" data-turn="3"'));
    ok('single-open chip lights up', /id="t-singleopen"[^>]*>/.test(html) && html.includes('class="chip on" id="t-singleopen"'));
    ok('mode persisted to webview state', t.savedState() && t.savedState().singleOpen === true);

    t.bandClick(3);
    html = t.appHtml();
    ok('opening another turn folds the previous one', count(html, 'class="turnhdr closed"') === 2 && html.includes('ans three'));
    const closedNums = (html.match(/class="turnhdr closed" data-turn="(\d)"/g) || []).join(' ');
    ok('…and the folded ones are turns 1 and 2', closedNums.includes('data-turn="1"') && closedNums.includes('data-turn="2"'));

    t.bandClick(3);
    html = t.appHtml();
    ok('single-open still allows folding the open turn', count(html, 'class="turnhdr closed"') === 3);

    t.click('t-expandall');
    html = t.appHtml();
    ok('expand all works in single-open mode too', count(html, 'turnhdr closed') === 0);
    ok('…without turning the mode off', html.includes('class="chip on" id="t-singleopen"'));

    t.click('t-singleopen');
    ok('toggling the mode off persists too', t.savedState().singleOpen === false);
}

// ---------- a live session's new turns arrive folded ----------
{
    const t = makeSandbox();
    t.bandClick(2); // the user opens turn 2 by hand
    const next = JSON.parse(JSON.stringify(t.data()));
    next.turnCount = 4;
    next.turns.push({ n: 4, label: 'four' });
    next.messages.push(
        { role: 'user', ts: 7000, text: 'ask four', turn: 4, turnStart: true },
        { role: 'assistant', ts: 8000, text: 'ans four', turn: 4 });
    t.pushData(next);
    const html = t.appHtml();
    ok('a turn that arrives while reading comes folded',
        html.includes('class="turnhdr closed" data-turn="4"'));
    ok('…and the turn the user opened stays open',
        !html.includes('class="turnhdr closed" data-turn="2"') && html.includes('ans two'));
}

// ---------- focus auto-unfolds the target turn ----------
{
    const t = makeSandbox();
    t.focusMsg(3900); // nearest message: 'ans two' (idx 4, turn 2)
    const html = t.appHtml();
    ok('focus unfolds the turn containing the target', count(html, 'class="turnhdr closed"') === 2 && !html.includes('class="msg assistant tclosed" data-idx="4"'));
    ok('…and still scrolls/flashes the message', t.lastFocused() && t.lastFocused().idx === 4 && t.lastFocused().classes.indexOf('flash') !== -1);
}

// ---------- single-open persists across a fresh page load ----------
{
    const t = makeSandbox({ initialState: { singleOpen: true } });
    ok('persisted single-open comes back on', t.appHtml().includes('class="chip on" id="t-singleopen"'));
    // an explicit "off" must beat the new default-on, or the choice never sticks
    const off = makeSandbox({ initialState: { singleOpen: false } });
    ok('persisted single-open OFF beats the default', !off.appHtml().includes('class="chip on" id="t-singleopen"'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
