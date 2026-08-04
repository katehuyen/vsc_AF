// The ⚖ figure: tokens weighted the way the plan limit charges them.
//
// ‼️ WHY THIS SUITE EXISTS. Four investigations went looking for a counting bug
// because two packages reported different token totals for what felt like the
// same work. There was no counting bug — proven by replaying the SAME frozen
// transcripts through both builds, which agreed to the cent. What differed was
// the SHAPE of the work, and the raw token total is 94-99% cache reads, which
// the limit charges at a tenth. So the raw figure moves up to 3x against the
// wall it is supposed to describe. This is the figure that does not.
const path = require('path');
const Module = require('module');

const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') {
        return {
            Uri: {}, window: {}, workspace: { getConfiguration: () => ({ get: (_k, d) => d }) },
            ViewColumn: {}, ConfigurationTarget: {}, env: {},
            EventEmitter: function () { this.event = () => { }; this.fire = () => { }; this.dispose = () => { }; }
        };
    }
    return origLoad.apply(this, arguments);
};
const { weightedTokens, QUOTA_WEIGHTS, totalTokens } = require(path.join(__dirname, '..', 'out', 'core', 'pricing.js'));
const { parseSessionFile } = require(path.join(__dirname, '..', 'out', 'core', 'sessions.js'));
const { PricingEngine, DEFAULT_PRICING } = require(path.join(__dirname, '..', 'out', 'core', 'pricing.js'));
const { reduceEvent, newSessionState } = require(path.join(__dirname, '..', 'out', 'core', 'consoleproto.js'));
Module._load = origLoad;

const fs = require('fs');
const os = require('os');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const near = (a, b, eps) => Math.abs(a - b) <= (eps === undefined ? 1e-6 : eps);

const U = (input, output, cacheWrite, cacheRead) => ({ input, output, cacheWrite, cacheRead });

// ---------- the weights themselves ----------
{
    // Sonnet is the unit: one fresh input token = 1.
    ok('sonnet input token is the unit', weightedTokens('claude-sonnet-5', U(1, 0, 0, 0)) === 1);
    ok('an output token is five', weightedTokens('claude-sonnet-5', U(0, 1, 0, 0)) === 5);
    ok('a cache-write token is 1.25', near(weightedTokens('claude-sonnet-5', U(0, 0, 1, 0)), 1.25));
    ok('a cache-read token is a tenth', near(weightedTokens('claude-sonnet-5', U(0, 0, 0, 1)), 0.1));

    // ‼️ The model matters: an hour of haiku is not an hour of opus against the
    // limit, and a figure that said it was would send the user optimizing the
    // wrong sessions.
    ok('opus costs five sonnets', weightedTokens('claude-opus-5', U(1, 0, 0, 0)) === 5);
    ok('haiku costs a third of a sonnet', near(weightedTokens('claude-haiku-4-5-20251001', U(3, 0, 0, 0)), 1));
    ok('fable prices as opus', weightedTokens('claude-fable-5', U(1, 0, 0, 0)) === 5);

    // An id nobody has seen yet must not read as free — a new model shipping is
    // not a reason for the limit gauge to go to zero.
    ok('an unknown model falls back to sonnet, never to zero',
        weightedTokens('claude-nova-9', U(1, 0, 0, 0)) === 1);
    ok('an empty model likewise', weightedTokens('', U(0, 0, 0, 10)) === 1);

    ok('every rule set is complete', QUOTA_WEIGHTS.every(w =>
        w.match && w.input > 0 && w.output > 0 && w.cacheWrite > 0 && w.cacheRead > 0));
}

// ---------- the gap this whole feature exists to show ----------
{
    // A real turn deep in a long conversation: a 300k window re-read on every
    // call, a few thousand tokens of new work. This is the shape that made the
    // raw counter look broken.
    const deep = U(50, 3000, 4000, 300000);
    const raw = totalTokens(deep);
    const w = weightedTokens('claude-opus-5', deep);
    ok('a cache-heavy opus turn weighs less than it measures', w < raw);

    // ‼️ THE POINT IS NOT A FIXED RATIO — IT IS THAT THERE IS NO FIXED RATIO.
    // The same RAW total, spent as fresh context instead of re-reads, costs the
    // limit several times more. Identical number on screen, different wall:
    // that is exactly why both figures have to be shown.
    const fresh = U(50, 3000, 300000, 4000);
    ok('…while the raw figure cannot tell them apart',
        totalTokens(fresh) === totalTokens(deep));
    ok('the same raw total can be many times more expensive',
        weightedTokens('claude-opus-5', fresh) > w * 5);
    ok('…so raw/weighted is not a constant', Math.abs(
        (raw / w) - (totalTokens(fresh) / weightedTokens('claude-opus-5', fresh))) > 0.5);

    // Sonnet sees the cache discount at full strength (no 5x model factor on
    // top), which is where the ~6x gap the user watched actually comes from.
    ok('on sonnet the cache-heavy shape is ~6x cheaper than it looks',
        raw / weightedTokens('claude-sonnet-5', deep) > 5);
}

// ---------- parseSessionFile: same lines, same dedup, both figures ----------
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-wtok-'));
    const file = path.join(dir, 'sess.jsonl');
    const ts = (n) => new Date(Date.parse('2026-08-04T10:00:00Z') + n * 1000).toISOString();
    const usage = { input_tokens: 10, output_tokens: 100, cache_creation_input_tokens: 1000, cache_read_input_tokens: 100000 };
    const lines = [
        { type: 'user', timestamp: ts(0), message: { role: 'user', content: 'do the thing' } },
        // ‼️ ONE API CALL, THREE LINES — the CLI writes one per content block and
        // repeats the whole usage on each. Both figures must count it once.
        { type: 'assistant', timestamp: ts(1), requestId: 'req_1', message: { id: 'msg_1', model: 'claude-opus-5', usage, content: [{ type: 'text', text: 'thinking' }] } },
        { type: 'assistant', timestamp: ts(2), requestId: 'req_1', message: { id: 'msg_1', model: 'claude-opus-5', usage, content: [{ type: 'tool_use', name: 'Read', input: {} }] } },
        { type: 'assistant', timestamp: ts(3), requestId: 'req_1', message: { id: 'msg_1', model: 'claude-opus-5', usage, content: [{ type: 'tool_use', name: 'Grep', input: {} }] } },
        // a second, genuinely separate call
        { type: 'assistant', timestamp: ts(4), requestId: 'req_2', message: { id: 'msg_2', model: 'claude-opus-5', usage, content: [{ type: 'text', text: 'done' }] } }
    ];
    fs.writeFileSync(file, lines.map(l => JSON.stringify(l)).join('\n') + '\n');

    const s = parseSessionFile(file, new PricingEngine(DEFAULT_PRICING), 0);
    const oneCall = weightedTokens('claude-opus-5', U(10, 100, 1000, 100000));

    ok('the session weighs exactly two calls, not five lines', near(s.wTokens, 2 * oneCall, 0.5));
    ok('…and the raw total agrees on the same two calls', s.usage.cacheRead === 200000);
    ok('the turn carries the weighted figure too', near(s.turns[0].wTokens, s.wTokens, 0.5));
    ok('…beside its raw one', s.turns[0].tokens === totalTokens(s.usage));
    ok('the day bucket carries it as well', near(Object.values(s.daily)[0].wTokens, s.wTokens, 0.5));
    ok('recentMsgs carry it per message', s.recentMsgs.every(m => m.wTokens > 0));

    // The two figures are independent numbers, not one scaled: a surface can
    // never derive one from the other, which is why both are carried.
    ok('the two totals are genuinely different numbers',
        Math.abs(s.wTokens - totalTokens(s.usage)) > 1000);

    fs.rmSync(dir, { recursive: true, force: true });
}

// ---------- the live Console counter tells the same story as the file ----------
{
    let st = newSessionState({ id: 'c1', cwd: 'D:/x', now: 1000 });
    const usage = { input_tokens: 10, output_tokens: 100, cache_creation_input_tokens: 1000, cache_read_input_tokens: 100000 };
    const feed = (o) => { st = reduceEvent(st, o, 2000).state; };

    // one call, two blocks — the repeat guard must hold for the weighted figure
    feed({ type: 'assistant', request_id: 'r1', message: { id: 'm1', model: 'claude-opus-5', usage, content: [{ type: 'text', text: 'hi' }] } });
    feed({ type: 'assistant', request_id: 'r1', message: { id: 'm1', model: 'claude-opus-5', usage, content: [{ type: 'tool_use', name: 'Read', input: {} }] } });
    const oneCall = weightedTokens('claude-opus-5', U(10, 100, 1000, 100000));
    ok('the live counter weighs one call once', near(st.wTokens, oneCall, 0.5));
    ok('…and the running turn holds the same figure', near(st.turnWTokens, oneCall, 0.5));

    feed({ type: 'assistant', request_id: 'r2', message: { id: 'm2', model: 'claude-opus-5', usage, content: [{ type: 'text', text: 'more' }] } });
    ok('a second call adds a second call', near(st.wTokens, 2 * oneCall, 0.5));

    // ‼️ A SUB-AGENT ON A CHEAPER MODEL MUST NOT BE CHARGED AT THE PARENT'S RATE.
    feed({ type: 'assistant', request_id: 'r3', parent_tool_use_id: 'tu_1', message: { id: 'm3', model: 'claude-haiku-4-5-20251001', usage, content: [{ type: 'text', text: 'sub' }] } });
    const haiku = weightedTokens('claude-haiku-4-5-20251001', U(10, 100, 1000, 100000));
    ok('a haiku sub-agent is weighed as haiku', near(st.wTokens, 2 * oneCall + haiku, 0.5));
    ok('…which is a fifteenth of the same work on opus', haiku * 10 < oneCall);

    // the turn closes: the figure survives into lastTurn, the running one clears
    st = reduceEvent(st, { type: 'result', subtype: 'success', total_cost_usd: 0.5, num_turns: 1 }, 3000).state;
    ok('the finished turn keeps its weighted figure', st.lastTurn.wTokens > 0);
    ok('…and the running-turn accumulator is cleared', st.turnWTokens === undefined);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
