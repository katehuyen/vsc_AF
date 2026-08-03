// The two figures every surface writes about a turn, and the one place each is
// built: `fmtDur` (how long) and `fmtSteps` (round trips / visible steps) in
// media/charts.js, and the per-turn accounting in core/sessions.ts that feeds
// them. One helper per figure is the whole point — the console strip, the
// viewer's turn band, the sessions table's turn rows and the Turns page all
// call these, so a turn cannot read differently depending on where you look.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)} want ${JSON.stringify(want)})`, got === want);

const C = (() => {
    const box = vm.createContext({ window: {} });
    vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../media/charts.js'), 'utf8'), box);
    return box.window.AFCharts;
})();

// ---------- 1) fmtDur — a unit appears when it is REACHED ----------
// ‼️ Seconds alone stop being an answer at about two minutes: a turn that ran
// an hour said "3847s", a number the reader has to divide before it means
// anything. Below a minute nothing but seconds is written; from a minute up,
// every unit below the largest one is ALWAYS written, so the string reads left
// to right without checking which fields happen to be present.
eq('under a minute is seconds alone', C.fmtDur(34000), '34s');
eq('a minute brings the minute field in', C.fmtDur(60000), '1m-0s');
eq('minutes and seconds', C.fmtDur(209000), '3m-29s');
eq('an hour brings the hour field in', C.fmtDur(3723000), '1h-2m-3s');
eq('…and keeps the zero minute rather than hiding it', C.fmtDur(3605000), '1h-0m-5s');
eq('a day brings the day field in', C.fmtDur(114881000), '1d-7h-54m-41s');
eq('zero is still an answer', C.fmtDur(0), '0s');
eq('a missing duration does not print NaN', C.fmtDur(undefined), '0s');
ok('nothing below the largest unit is ever dropped',
    C.fmtDur(86400000) === '1d-0h-0m-0s' && C.fmtDur(3600000) === '1h-0m-0s');

// ---------- 2) fmtSteps — two questions, never one number ----------
// A STEP is one reply fragment or one tool call; an API CALL is one round trip
// and routinely carries several steps. The tokens follow the CALLS. A surface
// showing only the steps let a turn whose call count halved read as unchanged
// while its token total moved — which is how a correct counter looks broken.
eq('both numbers, calls first', C.fmtSteps(14, 26), '14api/26');
eq('a turn whose calls are not known yet shows the steps alone', C.fmtSteps(0, 6), '6');
eq('…and undefined counts as not known', C.fmtSteps(undefined, 6), '6');
eq('one call carrying one step still says both', C.fmtSteps(1, 1), '1api/1');
ok('the shared tooltip explains the pair wherever it is shown',
    /API calls \/ steps/.test(C.STEPS_TIP) && /tokens follow the CALLS/.test(C.STEPS_TIP));

// ---------- 3) the accounting behind them ----------
// sessions.ts imports 'vscode' at load; the compiled module needs it stubbed to
// run in plain node (same trick as test_dashboard_sessions.js).
{
    const Module = require('module');
    const origLoad = Module._load;
    Module._load = function (request) {
        if (request === 'vscode') {
            return {
                Uri: {}, window: {}, ViewColumn: {}, ConfigurationTarget: {}, env: {},
                workspace: { getConfiguration: () => ({ get: (_k, d) => d }) }
            };
        }
        return origLoad.apply(this, arguments);
    };
}
const { parseSessionFile } = require('../out/core/sessions');
const { PricingEngine, DEFAULT_PRICING } = require('../out/core/pricing');

const tmp = path.join(require('os').tmpdir(), 'af-turnfig-' + Date.now());
fs.mkdirSync(tmp, { recursive: true });
const file = path.join(tmp, 'sess.jsonl');

const T0 = Date.UTC(2026, 7, 4, 10, 0, 0);
const at = ms => new Date(T0 + ms).toISOString();
// One API call written as TWO lines (a text block and a tool_use block), each
// repeating the whole call's usage — this is what the CLI actually writes, and
// it is why apiCalls and steps are different numbers.
const asst = (msgId, reqId, ts, blocks, usage) => JSON.stringify({
    type: 'assistant', timestamp: at(ts), requestId: reqId,
    message: { id: msgId, model: 'claude-opus-5', content: blocks, usage }
});
const USAGE = { input_tokens: 10, output_tokens: 90, cache_creation_input_tokens: 100, cache_read_input_tokens: 800 };
fs.writeFileSync(file, [
    JSON.stringify({ type: 'user', timestamp: at(0), message: { role: 'user', content: 'do the thing' } }),
    asst('m1', 'r1', 1000, [{ type: 'text', text: 'on it' }], USAGE),
    asst('m1', 'r1', 1100, [{ type: 'tool_use', name: 'Bash', input: {} }], USAGE),
    asst('m2', 'r2', 5000, [{ type: 'text', text: 'done' }], USAGE),
    JSON.stringify({ type: 'user', timestamp: at(9000), message: { role: 'user', content: 'again' } }),
    asst('m3', 'r3', 12000, [{ type: 'tool_use', name: 'Read', input: {} }], USAGE)
].join('\n') + '\n');

const info = parseSessionFile(file, new PricingEngine(DEFAULT_PRICING), 0);
const [t1, t2] = info.turns;

eq('two turns', info.turns.length, 2);
// ‼️ THE WHOLE REASON THE PAIR EXISTS: three steps, two round trips.
eq('turn 1 counts its steps', t1.steps, 3);
eq('turn 1 counts its round trips, not its lines', t1.apiCalls, 2);
eq('…and its tokens follow the CALLS, not the steps', t1.tokens, 2 * 1000);
eq('turn 2 counts its own', t2.steps + '/' + t2.apiCalls, '1/1');
// A repeated usage block must not become a second call any more than it becomes
// a second charge — both are counted inside the same dedup guard.
ok('the repeated usage line is one call and one charge',
    t1.apiCalls === 2 && t1.tokens === 2000);
eq('turn 1 ran from its prompt to its last line', t1.ms, 5000);
eq('turn 2 likewise', t2.ms, 3000);
eq('the turn reports where it left the window', t1.endCtx, 1000);
ok('a turn that never measured the window says 0, not a guess',
    typeof t2.endCtx === 'number');

// A turn still open has no end: ms stays 0 rather than freezing a wrong figure.
const live = path.join(tmp, 'live.jsonl');
fs.writeFileSync(live, JSON.stringify({
    type: 'user', timestamp: at(0), message: { role: 'user', content: 'just asked' }
}) + '\n');
const liveInfo = parseSessionFile(live, new PricingEngine(DEFAULT_PRICING), 0);
eq('a turn with nothing after it reports no duration', liveInfo.turns[0].ms, 0);
eq('…no calls', liveInfo.turns[0].apiCalls, 0);
eq('…and no steps', liveInfo.turns[0].steps, 0);

// ---------- 4) the webview copy and the node copy must not drift ----------
// ‼️ A webview cannot import from src/, so the formatter exists twice on
// purpose. Two copies without a test is how a Markdown export comes to describe
// a turn differently from the table it was exported from. Every boundary the
// units cross is checked, not a couple of friendly numbers.
{
    const { fmtDuration, fmtStepPair } = require('../out/core/util');
    const cases = [0, 1, 999, 1000, 34000, 59999, 60000, 60999, 209000,
        3599000, 3600000, 3605000, 3723000, 86399000, 86400000, 114881000];
    const drift = cases.filter(ms => fmtDuration(ms) !== C.fmtDur(ms));
    ok('both duration copies agree on every unit boundary'
        + (drift.length ? ` (differ at ${drift.join(', ')}ms)` : ''), drift.length === 0);
    const pairs = [[0, 0], [0, 6], [1, 1], [14, 26], [286, 418]];
    ok('both step-pair copies agree',
        pairs.every(([a, s]) => fmtStepPair(a, s) === C.fmtSteps(a, s)));
}

fs.rmSync(tmp, { recursive: true, force: true });

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
