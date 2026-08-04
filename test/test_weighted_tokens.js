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
    ok('a cache-read token is a tenth', near(weightedTokens('claude-sonnet-5', U(0, 0, 0, 1)), 0.1));

    // ‼️ CACHE WRITES ARE PRICED BY TTL AND THE DEFAULT MUST BE THE EXPENSIVE
    // ONE. A 5-minute write is 1.25x input, a 1-hour write is 2x. The first
    // shipped weighting assumed 5-minute — measured on this machine, 17.92M of
    // 17.92M cache-creation tokens were `ephemeral_1h` and ZERO were 5-minute,
    // i.e. the assumption was wrong on 100% of the data. A usage block that
    // does not report the split is therefore charged at the 1-hour rate:
    // under-stating what a turn cost the limit is the failure being fixed.
    const cw = (total, oneHour) => ({ input: 0, output: 0, cacheWrite: total, cacheRead: 0, cacheWrite1h: oneHour });
    ok('a 5-minute cache write is 1.25', near(weightedTokens('claude-sonnet-5', cw(1, 0)), 1.25));
    ok('a 1-hour cache write is 2', near(weightedTokens('claude-sonnet-5', cw(1, 1)), 2));
    ok('an unreported split is charged as 1-hour, never as the cheap one',
        near(weightedTokens('claude-sonnet-5', U(0, 0, 1, 0)), 2));
    ok('a mixed write is split, not rounded to one side',
        near(weightedTokens('claude-sonnet-5', cw(10, 4)), 4 * 2 + 6 * 1.25));
    ok('a nonsense split (1h > total) cannot exceed the total',
        near(weightedTokens('claude-sonnet-5', cw(2, 99)), 2 * 2));
    ok('opus scales the TTL rates too', near(weightedTokens('claude-opus-5', cw(1, 1)), 10));

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

// ---------- the table is the USER'S, not the build's ----------
// ‼️ These numbers are the provider's rate card, not ours. A rate moves and
// nobody should need a release — so the table and the mode are settings, and
// this section is what keeps them honest. Every case restores the default
// afterwards; a leaked override would silently re-price every later suite.
{
    const P = require(path.join(__dirname, '..', 'out', 'core', 'pricing.js'));
    const opusCall = U(10, 100, 1000, 100000);
    const base = weightedTokens('claude-opus-5', opusCall);

    // mode: raw — the feature off without ripping it out
    P.setQuotaConfig({ mode: 'raw' });
    ok('mode "raw" makes the weighted figure the raw total',
        weightedTokens('claude-opus-5', opusCall) === totalTokens(opusCall));
    ok('…for every model alike',
        weightedTokens('claude-haiku-4-5-20251001', opusCall) === totalTokens(opusCall));

    // mode: model-flat — weigh the KINDS of token, ignore which model ran
    P.setQuotaConfig({ mode: 'model-flat' });
    const flatOpus = weightedTokens('claude-opus-5', opusCall);
    const flatHaiku = weightedTokens('claude-haiku-4-5-20251001', opusCall);
    ok('mode "model-flat" charges every model the same', flatOpus === flatHaiku);
    ok('…and that is five times cheaper than opus was', near(flatOpus * 5, base, 1));
    ok('…while still discounting cache reads', flatOpus < totalTokens(opusCall));

    // back to the default, and prove it really came back
    P.setQuotaConfig({ mode: 'model-aware' });
    ok('the default mode is restorable', near(weightedTokens('claude-opus-5', opusCall), base, 0.001));

    // a user table replaces the built-in one
    P.setQuotaConfig({
        weights: [{ match: 'opus', input: 1, output: 1, cacheWrite: 1, cacheWrite1h: 1, cacheRead: 1 }]
    });
    ok('a user table is what gets used',
        weightedTokens('claude-opus-5', opusCall) === totalTokens(opusCall));
    ok('…and a model it does not name still costs something, never zero',
        weightedTokens('claude-sonnet-5', opusCall) > 0);

    // ‼️ AN UNUSABLE TABLE MUST NOT MAKE EVERY TURN READ AS FREE. A typo in a
    // regex, or an emptied array, falls back to the shipped table rather than
    // quietly zeroing the one gauge the user is watching.
    P.setQuotaConfig({ weights: [{ match: '[[[bad regex', input: 9, output: 9, cacheWrite: 9, cacheWrite1h: 9, cacheRead: 9 }] });
    ok('a table of only-invalid regexes falls back to the shipped one',
        near(weightedTokens('claude-opus-5', opusCall), base, 1));
    P.setQuotaConfig({ weights: [] });
    ok('an empty table falls back too', near(weightedTokens('claude-opus-5', opusCall), base, 0.001));

    ok('quotaConfig() reports what is in force', P.quotaConfig().mode === 'model-aware');

    // leave the module exactly as it was found
    P.setQuotaConfig({ weights: undefined, mode: 'model-aware' });
    ok('the suite leaves no override behind', near(weightedTokens('claude-opus-5', opusCall), base, 0.001));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
