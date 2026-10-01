// U-148 — on the Live Timeline a session waiting on its own background command
// has its own colour (purple, unused by any other status there), its own word,
// and a slow breath — never the yellow YOUR TURN it used to wear.
const path = require('path');
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));
const fixture = require(path.join(__dirname, 'fixtures', 'timeline.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const d = fixture.data();
const target = d.sessions.find(s => s.status === 'waiting-input');
ok('the fixture has a resting session to turn into a background wait', !!target);
target.status = 'waiting-task';

const html = runPage(fixture.script, d, fixture.window || {}).html();
const cards = html.slice(html.indexOf('<h2>Live sessions'));
const at = cards.indexOf('<div class="card st-bgwait"');

ok('‼️ the waiting card carries the slow-breath class', at >= 0);
ok('…and exactly one card does', cards.split('<div class="card st-bgwait"').length === 2);
const card = at >= 0 ? cards.slice(at, at + 6000) : '';
ok('its left bar is purple', /border-left:3px solid var\(--vscode-charts-purple, #b180d7\)/.test(card));
ok('its badge says BACKGROUND, in purple',
    /<span class="badge" style="color:var\(--vscode-charts-purple, #b180d7\);[^"]*">BACKGROUND/.test(card));
ok('‼️ and never YOUR TURN', !/>YOUR TURN</.test(card.slice(0, card.indexOf('</h3>') + 400)));
ok('the badge panel says why it is not your turn',
    card.indexOf('it is not waiting on you') >= 0);
ok('the breath is slow and honours reduced motion',
    /\.card\.st-bgwait \.badge \{ animation:afdeep 4\.2s/.test(html)
    && /prefers-reduced-motion: reduce\) \{ \.card\.st-bgwait \.badge \{ animation:none/.test(html));
ok('no other status uses purple', (html.match(/charts-purple/g) || []).length >= 2
    && !/'(working|tool|waiting-input|waiting-permission|stalled)':\s*\{[^}]*purple/.test(html));

// ---- ‼️ U-188 — the swim lane shows the same waits the card does, in the same purple ----
{
    const d2 = fixture.data();
    const t2 = d2.sessions.find(s => s.status === 'waiting-input');
    t2.status = 'waiting-task';
    const at = (m) => Date.now() - m * 60000;
    const ev = (kind, m, extra) => d2.events.push(Object.assign({ ts: at(m), sessionId: t2.sessionId, agentName: t2.agentName, kind }, extra || {}));
    ev('prompt', 31, { detail: 'run it and wait' });
    ev('toolStart', 30, { tool: 'Bash', detail: 'until grep -q passed log; do sleep 5; done', wait: true });
    ev('toolEnd', 25, { tool: 'Bash' });
    ev('stop', 20, { detail: 'started the build', wait: true });
    ev('prompt', 15, { detail: 'the build finished' });
    ev('toolStart', 14, { tool: 'Read', detail: 'out.log' });
    ev('toolEnd', 13.5, { tool: 'Read' });
    ev('stop', 0.05, { detail: 'waiting on the next one', wait: true });
    d2.events.sort((a, b) => a.ts - b.ts);
    const h2 = runPage(fixture.script, d2, fixture.window || {}).html();
    const PURPLE = /<rect [^>]*fill="var\(--vscode-charts-purple, #b180d7\)"[^>]*class="segwait"/g;
    const base = (html.match(PURPLE) || []).length;
    ok('the fixture draws its own wait call purple', base >= 1);
    ok('‼️ a wait call and two background waits are drawn purple on the lane', (h2.match(PURPLE) || []).length === base + 3);
    ok('…an ordinary tool call stays green', /<rect [^>]*fill="var\(--vscode-charts-green, #4caf50\)"/.test(h2));
    ok('a background wait is named as one on its bar', h2.indexOf('Waiting on background') >= 0);
    ok('…and says it was not your turn', h2.indexOf('It was not your turn') >= 0);
    ok('the open one still runs, while the card is purple', h2.indexOf('still waiting') >= 0);
    ok('a wait call says nothing is waiting on you', h2.indexOf('this call only waits for something already running') >= 0);
}
{
    // the events carry the mark, from the same readings the card uses
    const Module = require('module');
    class Em { constructor() { this.h = []; } get event() { return (f) => { this.h.push(f); return { dispose() { } }; }; } fire(v) { this.h.forEach(f => f(v)); } dispose() { } }
    const orig = Module._load;
    Module._load = function (r) { return r === 'vscode' ? { EventEmitter: Em, window: {}, commands: {} } : orig.apply(this, arguments); };
    const { LiveMonitor } = require(path.resolve(__dirname, '../out/core/live.js'));
    Module._load = orig;
    let tasks = 0;
    const cfg = { enabled: true, port: 0, stuckThresholdMs: 0, notifyPermission: false, notifyStuck: false, notifyTurnEnd: false,
        backgroundOf: () => ({ tasks, working: false }) };
    const lm = new LiveMonitor(() => cfg, () => ({ agentId: 'a1', agentName: 'dev' }));
    const h = (name, extra) => lm.handle(Object.assign({ session_id: 'W1', cwd: '/x', hook_event_name: name }, extra || {}));
    h('SessionStart', {});
    h('UserPromptSubmit', { prompt: 'x' });
    h('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'until test -f done; do sleep 2; done' } });
    h('PostToolUse', { tool_name: 'Bash', tool_response: {} });
    h('PreToolUse', { tool_name: 'Read', tool_input: { file_path: 'a' } });
    h('PostToolUse', { tool_name: 'Read', tool_response: {} });
    h('Stop', { message: 'done' });
    tasks = 1;
    h('UserPromptSubmit', { prompt: 'y' });
    h('Stop', { message: 'started it' });
    const evs = lm.events(3600000).filter(e => e.sessionId === 'W1');
    const starts = evs.filter(e => e.kind === 'toolStart');
    const stops = evs.filter(e => e.kind === 'stop');
    ok('‼️ a wait call\'s start carries the mark', starts[0] && starts[0].wait === true);
    ok('…an ordinary call carries none', starts[1] && !('wait' in starts[1]));
    ok('a stop with nothing behind it carries none', stops[0] && !('wait' in stops[0]));
    ok('‼️ a stop with a background command behind it carries the mark', stops[1] && stops[1].wait === true);
}

console.log(`test_timeline_bgwait.js: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
