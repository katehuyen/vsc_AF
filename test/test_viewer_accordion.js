// DOM-stub tests: session viewer turn accordion — the fully-folded single-open
// opening state, per-band fold/unfold, Expand all / Collapse all, single-open
// mode (+ its webview-state persistence), newly arrived turns folding
// themselves, focus auto-unfolding the target turn, and the role-chip binder
// not swallowing unrelated .chip buttons (turnbox All/None/Invert, accordion).
//
// …plus the per-step COPY button, which shares this harness because it shares the
// one delegated #msgs click handler the accordion uses.
const fs = require('fs');
const vm = require('vm');
const { charts } = require('./lib_charts_stub.js');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// The shared scripts htmlShell ships to every page, from ONE list
// (lib_shared_media.js) — a copy per test file goes stale one file at a time.
const code = require(require('path').join(__dirname, 'lib_shared_media.js')).sharedMedia()
    + fs.readFileSync(require('path').resolve(__dirname, '../media/sessionViewer.js'), 'utf8');

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
    const copyBtns = {};
    const scrolls = [];
    let focused = null;
    // ‼️ A LIST: the viewer listens twice — its own host messages, and the
    // right-click relay wired at module scope. Last-one-wins drops one of them.
    const msgHandlers = [];
    const msgHandler = (ev) => msgHandlers.forEach(fn => fn(ev));

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

    const posted = [];
    const sandbox = {
        acquireVsCodeApi: () => ({
            postMessage: (m) => posted.push(m),
            getState: () => state.saved || state.initial,
            setState: (s) => { state.saved = s; }
        }),
        window: {
            AFCharts: charts({
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
                // the REAL ones — the band's duration and api/steps strings are
                // the same strings every other surface writes (see charts.js)
                fmtDur: realCharts.fmtDur,
                fmtSteps: realCharts.fmtSteps,
                STEPS_TIP: realCharts.STEPS_TIP,
                aiLabel: (m, u) => { const n = /^claude/i.test(m || '') ? 'claude' : /^gemini/i.test(m || '') ? 'gemini' : /^gpt|codex/i.test(m || '') ? 'codex' : 'agent'; return u ? n.toUpperCase() : n; }
            }),
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
            addEventListener: (ev, fn) => { if (ev === 'message') { msgHandlers.push(fn); } },
            scrollTo(...args) { scrolls.push(args); }, scrollX: 0, scrollY: 0
        },
        document: {
            getElementById: getEl,
            querySelectorAll: (sel) => { seenSelectors.push(sel); return []; },
            querySelector: (sel) => {
                // The copy receipt goes back to the button that was pressed.
                const c = /data-copy="(\d+)"/.exec(sel);
                if (c) {
                    copyBtns[c[1]] = copyBtns[c[1]] || {
                        textContent: '⧉', classes: [],
                        classList: {
                            add: (x) => copyBtns[c[1]].classes.push(x),
                            remove: (x) => { copyBtns[c[1]].classes = copyBtns[c[1]].classes.filter(y => y !== x); }
                        }
                    };
                    return copyBtns[c[1]];
                }
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
        send: (m) => msgHandler({ data: m }),
        /** Press one step's copy button, through the delegated #msgs handler the
         *  band clicks also go through — which is the point: the two must not
         *  trigger each other. */
        copyClick: (idx) => {
            const btn = { dataset: { copy: String(idx) }, textContent: '⧉', classes: [] };
            btn.classList = {
                add: (c) => btn.classes.push(c),
                remove: (c) => { btn.classes = btn.classes.filter(x => x !== c); }
            };
            let bandToggled = false;
            getEl('msgs').listeners.click({
                stopPropagation() { },
                target: {
                    closest: (sel) => {
                        if (sel === 'button[data-copy]') { return btn; }
                        if (sel === '.turnhdr[data-turn]') { bandToggled = true; return null; }
                        return null;
                    }
                }
            });
            return { btn, bandToggled };
        },
        copyBtn: (idx) => copyBtns[String(idx)],
        posted: () => posted,
        data: () => sandbox.window.__DATA__,
        lastFocused: () => focused,
        savedState: () => state.saved,
        scrolls: () => scrolls,
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
    // time. `14api·26steps` is the shape every surface uses (charts.js fmtSteps).
    ok('band says how long the turn ran, in the shared duration format',
        html.includes('1h-2m-3s'));
    ok('band says round trips AND steps, never one number for both',
        html.includes('14api·26steps') && !html.includes('26 msgs'));
    ok('band says where the turn left the window',
        html.includes('ctx 202300'));
    ok('a turn with none of it measured says nothing rather than zeros',
        !html.includes('0s') && !html.includes('ctx 0'));
    // The band's hover is the turn's start date — never "click to expand", which
    // the caret and the controls row already say. Labelled, dated, and carrying
    // how long ago it was; turn 2 has no ts of its own and falls back to the
    // timestamp of the message that opens it.
    // The tail "— right-click for more" is the ONE thing allowed after it: a
    // menu nobody knows about is not a feature (docs/SAG-TIK-MENULERI.tr.md).
    ok('band tooltip is the turn start stamp, not a click hint',
        !html.includes('Click to expand')
        && html.includes('title="Turn started · ')
        && /title="Turn started · [^"]*2026[^"]*\(\d+ (day|month|year)s? ago\)( — right-click for more)?"/.test(html)
        && count(html, 'title="Turn started · ') === 4);  // 3 bands + 1 breakdown row
    ok('…and every band says a right-click has more',
        count(html, 'title="Turn started · ') ===
        (html.match(/title="Turn started · [^"]*right-click for more"/g) || []).length);

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

// ---------- X-23: Track reopens even an existing page as a clean reading view ----------
{
    const t = makeSandbox({ initialState: { singleOpen: false } });
    t.click('t-expandall');
    const filter = t.appHtml().includes('id="filter"');
    ok('the Track reset test begins from a changed viewer state',
        filter && count(t.appHtml(), 'turnhdr closed') === 0);
    t.send({ type: 'resetView' });
    const html = t.appHtml();
    ok('Track reset folds every turn and restores one-turn-at-a-time reading',
        count(html, 'class="turnhdr closed"') === 3
        && html.includes('class="chip on" id="t-singleopen"'));
    ok('…restores exactly Dialog',
        /class="chip on"[^>]*data-chip="user"/.test(html)
        && /class="chip on"[^>]*data-chip="assistant"/.test(html)
        && !/class="chip on"[^>]*data-chip="tool"/.test(html));
    ok('…and returns to the top without selecting or expanding a turn',
        t.scrolls().some(args => args[0] === 0 && args[1] === 0));
    ok('the restored single-open mode is persisted',
        t.savedState() && t.savedState().singleOpen === true);
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

// ---------- one step's copy button ----------
//
// The thing it replaces is selecting a long reply by hand with the mouse. So what
// matters is that it reaches EVERY step, sends that step's own words and nothing
// else, and reports only when the clipboard actually took them.
{
    const t = makeSandbox();
    t.click('t-expandall');
    const html = t.appHtml();
    ok('every step carries a copy button', count(html, 'class="copyb" data-copy=') === 7);
    ok('…and it says what it copies', html.includes('Copy this step\'s text to the clipboard'));
    ok('…on the meta line, not inside the words — anything in the body would be'
        + ' selected along by the hand-copying this replaces',
        count(html, '⧉</button></div>') === 7);

    const first = t.copyClick(1);
    ok('pressing it does not also fold the turn it sits in', !first.bandToggled);
    const msg = t.posted().filter(m => m.type === 'copyStep').pop();
    ok('‼️ the HOST is asked to write the clipboard, so a denied permission cannot fail silently',
        !!msg && msg.idx === 1);
    ok('and it sends that step\'s words, with none of the meta line',
        msg.text === 'ask one' && !/USER|claude/.test(msg.text));

    // The receipt is drawn only when the host answers, and it says which way.
    t.pushData(t.data());   // repaint in between: the receipt must still find its button
    t.send({ type: 'copied', idx: 1, ok: true });
    ok('a confirmed copy marks the button', t.copyBtn(1) && t.copyBtn(1).textContent === '✓'
        && t.copyBtn(1).classes.indexOf('done') >= 0);
    t.send({ type: 'copied', idx: 1, ok: false });
    ok('‼️ a refused copy says so rather than pretending', t.copyBtn(1).textContent === '⚠');

    // A tool call's payload is its input, not its (empty) text. Reached through a
    // deep link, which is what clears the default Dialog filter that hides them.
    const withTool = makeSandbox();
    const d = JSON.parse(JSON.stringify(withTool.data()));
    d.messages.push({ role: 'tool', ts: 9000, tool: 'Read', input: '{"file":"x.ts"}', turn: 3 });
    withTool.pushData(d);
    withTool.focusMsg(9000);
    withTool.copyClick(7);
    const tmsg = withTool.posted().filter(m => m.type === 'copyStep').pop();
    ok('a tool call copies its INPUT, which is the only text it has',
        !!tmsg && tmsg.text === '{"file":"x.ts"}');

    // An empty step must not post at all — an empty clipboard write is a lie.
    const empty = makeSandbox();
    const e = JSON.parse(JSON.stringify(empty.data()));
    e.messages.push({ role: 'assistant', ts: 9500, text: '', turn: 3 });
    empty.pushData(e);
    empty.click('t-expandall');
    const before = empty.posted().filter(m => m.type === 'copyStep').length;
    const res = empty.copyClick(7);
    ok('an empty step copies nothing and says nothing happened',
        empty.posted().filter(m => m.type === 'copyStep').length === before
        && res.btn.textContent === '—');
}

// ---------- X-25: a delegating agent is not a user ----------
//
// ‼️ THE REPORTED CONFUSION. A subagent conversation is an agent handing work
// to another agent, and both sides wore the words a PERSON's conversation
// wears: the handover said USER and the answer said the model's name. The only
// mark distinguishing them was a quiet "subagent" further along the meta line —
// which is not what anybody scans, and which searching could not use at all.
{
    const t = makeSandbox();
    const d = JSON.parse(JSON.stringify(t.data()));
    d.agentName = 'developer';
    d.messages.push(
        { role: 'user', ts: 7000, text: 'devret bunu', turn: 3, sidechain: true },
        { role: 'assistant', ts: 7100, text: 'bitirdim', turn: 3, sidechain: true, model: 'claude-opus-5' }
    );
    t.pushData(d);
    t.click('t-expandall');
    const html = t.appHtml();
    ok('‼️ a handover is a DELEGATOR, by the name of the agent that wrote it',
        html.includes('📤 DELEGATOR (developer)'));
    ok('‼️ …and the side that answers is a HANDLER, not "the agent"',
        html.includes('📥 HANDLER'));
    ok('a person\'s own prompt is untouched', html.includes('🧑 USER'));
    ok('…and so is the agent it is talking to',
        html.includes('🤖 CLAUDE') || html.includes('🤖 AGENT'));

    // The whole transcript can BE the lane (a subagent's own file); there the
    // per-line flag is absent and the host says so instead (`laneFor`).
    const lane = makeSandbox();
    const l = JSON.parse(JSON.stringify(lane.data()));
    l.agentName = 'manager';
    l.lane = true;
    lane.pushData(l);
    lane.click('t-expandall');
    ok('a subagent\'s OWN transcript is a lane from end to end',
        lane.appHtml().includes('DELEGATOR (manager)')
        && lane.appHtml().includes('HANDLER')
        && !lane.appHtml().includes('🧑 USER'));

    // An export handed to somebody else must not name its speakers differently
    // from the screen — that would be a second vocabulary for the same fact.
    // B-21 — the page no longer writes the document: it sends its view with the
    // click and the host builds, by the function sessions.export uses.
    t.click('exportmd');
    const choose = t.posted().filter(m => m.type === 'exportChoose').pop();
    ok('pressing Export MD sends the view, never a document',
        !!choose && choose.view && Array.isArray(choose.view.roles) && choose.md === undefined);
    const { buildSessionMarkdown } = require(require('path').join(__dirname, '..', 'out', 'core', 'sessionExport.js'));
    const md = buildSessionMarkdown(d, { ...choose.view, view: false, foldedTitles: false });
    ok('the exported markdown uses the same words',
        /\*\*DELEGATOR \(developer\)\*\*/.test(md) && /\*\*HANDLER\*\*/.test(md));
}

// ---------- the page's own heading is a session row too ----------
// A session listed in a table carries the whole right-click action set; on that
// session's OWN page the heading offered Copy/Paste and nothing else. And the
// id under it — the one string on the page that is constantly wanted elsewhere
// — was plain text you had to select by hand between two separators.
{
    const t = makeSandbox();
    const html = t.appHtml();
    ok('the heading block carries the session right-click contract',
        html.includes('data-vscode-context') && html.includes('afSessionRow'));
    ok('…naming THIS session', html.includes('sess'));
    ok('the session id in the subtitle is a copy button',
        html.includes('class="idcopy"') && html.includes('data-copy="sess"'));

    // …and an automation run says WHICH mechanism started it, when the farm's
    // own record knows: "🤖 automation run" and "🤖 schedule · backlog" are
    // different facts about the same run.
    const auto = makeSandbox();
    const d = JSON.parse(JSON.stringify(auto.data()));
    d.origin = 'auto';
    d.launchedBy = { kind: 'schedule', label: 'backlog ilerleme' };
    auto.pushData(d);
    ok('an automation run names its launcher instead of saying "automation"',
        auto.appHtml().includes('🤖 schedule · backlog ilerleme'));
    const plain = makeSandbox();
    const p = JSON.parse(JSON.stringify(plain.data()));
    p.origin = 'auto';
    plain.pushData(p);
    ok('…and falls back honestly when nothing is on record',
        plain.appHtml().includes('🤖 automation run'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
