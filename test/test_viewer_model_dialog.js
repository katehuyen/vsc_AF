// Session viewer: per-turn model / run-attribute capture (verbatim, no name
// tables) and the Dialog-by-default view — including the rule that a deep link
// (focusTs) must never be hidden by the default filter.
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// ---------- part 1: buildData collects models/attrs per turn, verbatim ----------
{
    const Module = require('module');
    const origLoad = Module._load;
    Module._load = function (request) {
        if (request === 'vscode') {
            return { Uri: {}, window: {}, workspace: { getConfiguration: () => ({ get: (_k, d) => d }) }, ViewColumn: {}, ConfigurationTarget: {}, env: {} };
        }
        return origLoad.apply(this, arguments);
    };
    const viewer = require(path.join(__dirname, '..', 'out', 'panels', 'sessionViewer.js'));
    Module._load = origLoad;

    const T = (s) => `2026-07-15T10:0${s}:00.000Z`;
    const write = (lines) => {
        const p = path.join(os.tmpdir(), `af-model-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
        fs.writeFileSync(p, lines.map(l => JSON.stringify(l)).join('\n'));
        return p;
    };
    const build = (p) => viewer.buildData(p, {
        extensionUri: {}, getPricing: () => ({ costFor: () => 0.1 }),
        maxMessages: () => 50, contextLimitFor: () => 0
    });

    // turn 1 on a made-up future model; turn 2 switches model mid-session (real:
    // happens in ~1 of 4 sessions) and carries an effort attribute that does not
    // exist in Claude transcripts today
    const f1 = write([
        { type: 'user', timestamp: T(1), message: { content: 'ask one' } },
        { type: 'assistant', timestamp: T(1), message: { id: 'a1', model: 'claude-nova-9', content: [{ type: 'text', text: 'x' }], usage: { input_tokens: 1, output_tokens: 1 } } },
        { type: 'user', timestamp: T(2), message: { content: 'ask two' } },
        { type: 'assistant', timestamp: T(2), message: { id: 'a2', model: 'claude-opus-4-8', effort: 'ultra', content: [{ type: 'text', text: 'y' }], usage: { input_tokens: 1, output_tokens: 1 } } },
        { type: 'assistant', timestamp: T(2), message: { id: 'a3', model: 'gpt-mini-77', content: [{ type: 'text', text: 'z' }], usage: { input_tokens: 1, output_tokens: 1 } } },
        { type: 'assistant', timestamp: T(2), message: { id: 'a4', model: '<synthetic>', content: [{ type: 'text', text: 'ignored' }], usage: { input_tokens: 1, output_tokens: 1 } } }
    ]);
    const d1 = build(f1);
    fs.unlinkSync(f1);

    ok('turn 1 carries its model verbatim (unknown future name works)',
        JSON.stringify(d1.turns[0].models) === JSON.stringify(['claude-nova-9']));
    ok('a turn that used two models lists both, in order',
        JSON.stringify(d1.turns[1].models) === JSON.stringify(['claude-opus-4-8', 'gpt-mini-77']));
    ok('<synthetic> is not reported as a model', !d1.turns[1].models.includes('<synthetic>'));
    ok('an unknown effort value is passed through verbatim', d1.turns[1].attrs.effort === 'ultra');
    ok('turns without attributes get an empty map', JSON.stringify(d1.turns[0].attrs) === '{}');
    ok('per-session model list still built', d1.models.includes('claude-nova-9') && d1.models.includes('gpt-mini-77'));

    // attributes may also sit on the line rather than the message; objects are
    // config (not a label) and must be ignored
    const f2 = write([
        { type: 'user', timestamp: T(3), message: { content: 'ask' } },
        { type: 'assistant', timestamp: T(3), reasoning_effort: 'high', message: { id: 'b1', model: 'm', thinking_effort: { budget: 5 }, content: [{ type: 'text', text: 'q' }], usage: { input_tokens: 1, output_tokens: 1 } } }
    ]);
    const d2 = build(f2);
    fs.unlinkSync(f2);
    ok('line-level attribute picked up', d2.turns[0].attrs.reasoning_effort === 'high');
    ok('object-valued attribute ignored (config, not a label)', d2.turns[0].attrs.thinking_effort === undefined);

    // today's reality: real Claude transcripts carry no effort at all
    const f3 = write([
        { type: 'user', timestamp: T(4), message: { content: 'ask' } },
        { type: 'assistant', timestamp: T(4), message: { id: 'c1', model: 'claude-fable-5', stop_reason: 'end_turn', content: [{ type: 'text', text: 'r' }], usage: { input_tokens: 1, output_tokens: 1 } } }
    ]);
    const d3 = build(f3);
    fs.unlinkSync(f3);
    ok('a real-shaped line yields model but no invented attributes',
        d3.turns[0].models[0] === 'claude-fable-5' && Object.keys(d3.turns[0].attrs).length === 0);
}

// ---------- part 2: page — Dialog default, model tags, deep-link beats the filter ----------
{
    const code = require(path.join(__dirname, 'lib_shared_media.js')).sharedMedia()
        + fs.readFileSync(path.resolve(__dirname, '../media/sessionViewer.js'), 'utf8');
    let focused = null;
    // ‼️ A LIST: the viewer listens twice (host messages + the right-click relay).
    const msgHandlers = [];
    const msgHandler = (ev) => msgHandlers.forEach(fn => fn(ev));
    const els = {};
    function getEl(id) {
        if (id === 'turnbox') { return els.turnbox || null; }
        if (!els[id]) {
            els[id] = {
                id, listeners: {}, style: {}, value: '', _html: '',
                addEventListener(ev, fn) { this.listeners[ev] = fn; },
                // the ctx popover open/close path touches these
                hasAttribute() { return true; }, removeAttribute() { }, setAttribute() { },
                classList: { add() { }, remove() { } },
                querySelectorAll: () => [],
                set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; },
                focus() { this.focused = true; }
            };
        }
        return els[id];
    }
    const sandbox = {
        acquireVsCodeApi: () => ({ postMessage() { }, getState() { }, setState() { } }),
        window: {
            AFCharts: {
                esc: (s) => String(s), fmtTok: (n) => String(n || 0),
            STEP_KIND: {},

            stepChip: () => '',

            stepKindLegend: () => '',

            stepKindLegendText: () => 'legend',

            fmtTokW(n, w) { return this.fmtTok(n || 0) + (w > 0 ? ' [w' + this.fmtTok(Math.round(w)) + ']' : ''); },
            fmtTokWText(n, w) { return this.fmtTok(n || 0) + (w > 0 ? ' (w' + this.fmtTok(Math.round(w)) + ')' : ''); },
            WEIGHTED_TIP: 'weighted', fmtUSD: (n) => '$' + (n || 0),
                aiLabel: (m, u) => { const n = /^claude/i.test(m || '') ? 'claude' : /^gemini/i.test(m || '') ? 'gemini' : /^gpt|codex/i.test(m || '') ? 'codex' : 'agent'; return u ? n.toUpperCase() : n; }
            },
            __DATA__: {
                title: 't', sessionId: 's', cwd: '', permissionMode: '',
                firstTs: 1000, lastTs: 4000, models: [],
                usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                totalTokens: 0, cost: 0, errors: 0, toolCalls: 1,
                context: { tokens: 0, limit: 0 },
                turnCount: 1, turnTotals: { 1: { tokens: 9, cost: 1 } },
                turns: [{ n: 1, label: 'the ask', ts: 1000, tokens: 9, cost: 1, models: ['claude-nova-9'], attrs: { effort: 'ultra' } }],
                messageCount: 4, truncatedCount: 0,
                messages: [
                    { role: 'user', ts: 1000, text: 'the ask', turn: 1, turnStart: true },
                    { role: 'assistant', ts: 2000, text: 'the answer', turn: 1 },
                    { role: 'tool', ts: 3000, tool: 'Bash', input: 'ls -la', turn: 1 },
                    { role: 'toolResult', ts: 4000, text: 'file listing', turn: 1 }
                ]
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
                    scrollIntoView(o) { this.scrollOpts = o; },
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
    ok('Dialog is the default view', /class="chip on" data-preset="dialog"/.test(html()));
    ok('All is not the default', !/class="chip on" data-preset="all"/.test(html()));
    ok('dialog messages shown', html().includes('the ask') && html().includes('the answer'));
    ok('tool traffic hidden by default', !html().includes('ls -la') && !html().includes('file listing'));
    ok('turn band shows the model verbatim (claude- prefix trimmed)', html().includes('<span class="tag">nova-9</span>'));
    ok('turn band shows the effort value verbatim', html().includes('<span class="tag">ultra</span>'));

    // a deep link into hidden tool traffic must clear the filter, not miss
    msgHandler({ data: { type: 'focus', ts: 3000 } });
    ok('deep link to a tool message clears the Dialog filter', html().includes('ls -la'));
    ok('…and lands on that message', focused && focused.idx === 2 && focused.classes.indexOf('flash') !== -1);
    ok('…leaving the view on All', /class="chip on" data-preset="all"/.test(html()));

    // ---- Context-now card: the /context breakdown popover, both states ----
    // No snapshot (this DATA has no contextReport): the card is still the click
    // target with the ⛁ affordance, and the popover explains how to get one —
    // the feature must be discoverable, never silently absent.
    ok('ctx card is always the popover target', html().includes('id="ctxcard"') && html().includes('id="ctxglyph"'));
    ok('no snapshot → popover carries the how-to hint',
        html().includes('id="ctxpop"') && html().includes('No <code>/context</code> snapshot'));

    // With a snapshot (a later live push): the popover lists the categories.
    msgHandler({
        data: {
            type: 'data', data: Object.assign({}, sandbox.window.__DATA__, {
                contextReport: {
                    ts: 5000, tokens: 84700, limit: 967000, pct: 9,
                    categories: [
                        { label: 'System prompt', tokens: 9400, pct: 1 },
                        { label: 'Free space', tokens: 849300, pct: 87.8 }
                    ]
                }
            })
        }
    });
    ok('snapshot → popover lists categories with tokens and bars',
        html().includes('System prompt') && html().includes('849300') && html().includes('width:87.8%'));
    ok('popover starts hidden either way', /id="ctxpop" hidden/.test(html()));

    // Capture now: the button is in both popover states, and the host's 'ok'
    // answer re-renders with the fresh report (this is the on-demand path —
    // the host runs `claude --resume <sid> -p "/context"`, a local no-cost command).
    ok('capture button present with a snapshot (⟳ Refresh)', html().includes('id="ctxcap"') && html().includes('⟳ Refresh'));
    msgHandler({
        data: {
            type: 'ctxCapture', status: 'ok', report: {
                ts: 6000, tokens: 21400, limit: 200000, pct: 11,
                categories: [
                    { label: 'System tools', tokens: 12400, pct: 6.2 },
                    { label: 'Free space', tokens: 178600, pct: 89.3 }
                ]
            }
        }
    });
    ok('capture ok → fresh report rendered', html().includes('System tools') && html().includes('178600'));
    ok('capture ok → totals updated', html().includes('21400') && html().includes('200000'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
