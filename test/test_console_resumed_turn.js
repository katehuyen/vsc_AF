// S-57 — THE STRIP AFTER A RESTART SAID `$20.94 · 1step` AND NOTHING ELSE.
//
// A typical strip reads
//   1m-6s · $0.485 (760.2k ⚖ 424.6k tokens) · 2api·4steps · opus 5 · xhigh · your turn now
// and after the extension was reinstalled — window reload, session revived —
// the very next turn drew
//   $20.94 · 1step · your turn now
// with the duration, the tokens, the round trips and the model/effort pair all
// gone. The question the item asks is the right one: is the information lost,
// or merely not shown?
//
// ‼️ NEITHER. IT WAS NEVER COLLECTED, BECAUSE THE TURN WAS NEVER OPENED.
//
// Three functions open a turn — `acceptUserText`, `shiftQueued`,
// `releaseShared` — and all three are the WINDOW speaking. A revived card has a
// fourth case none of them cover: the CLI answers on its own, because it was
// given the prompt before this window existed. The `assistant` branch handled
// that by setting `status` to `working` and nothing else, so the turn ran with
// no clock, no token baseline, no round-trip counter and no model/effort — and
// the `result` line then closed it with `undefined` for every one of them.
//
// What is measured here is `lastTurn`, built by the reducer alone from the two
// lines a resumed session really produces. No panel, no process, no transcript.
'use strict';
const path = require('path');
const P = require(path.resolve(__dirname, '../out/core/consoleproto.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

/** A card as `planRevive` → `ConsoleHost.start` leaves it: resumed, with the
 *  dimensions it was started on, and no turn of its own yet. */
const revived = (o = {}) => P.newSessionState({
    id: 'c1', agentId: 'a-dev', agentName: 'developer', cwd: 'D:/ajan/developer',
    model: 'opus', effort: 'xhigh', now: 1000, resumed: true, sessionId: 'sid-1', ...o
});

/** One assistant line with real usage on it, exactly as the CLI streams one. */
const assistantLine = (over = {}) => ({
    type: 'assistant',
    request_id: 'req-1',
    message: {
        id: 'msg-1', model: 'claude-opus-5',
        usage: { input_tokens: 1200, output_tokens: 800, cache_read_input_tokens: 4000 },
        content: [{ type: 'tool_use', id: 't1', name: 'Read', input: { file_path: 'D:/x/a.ts' } }]
    },
    ...over
});

const resultLine = (over = {}) => ({
    type: 'result', subtype: 'success', total_cost_usd: 0.485,
    num_turns: 1, session_id: 'sid-1', ...over
});

// ---------------------------------------------- 1. the turn opens on its own
{
    let s = revived();
    ok('a revived card starts with no turn of its own', s.turnStartedAt === undefined);

    s = P.reduceEvent(s, assistantLine(), 2000).state;
    ok('‼️ AN ASSISTANT LINE THIS WINDOW DID NOT ASK FOR OPENS A TURN'
        + ' (turnStartedAt=' + s.turnStartedAt + ')', s.turnStartedAt === 2000);
    ok('…with a token baseline, or the turn can never say what it spent',
        s.turnTokensAt === 0);
    ok('…and the pair the strip prints for what it is thinking with'
        + ' (' + s.turnModel + ' / ' + s.turnEffort + ')',
        s.turnModel === 'opus' && s.turnEffort === 'xhigh');
    ok('…and the card is working', s.status === 'working');

    // ‼️ AND THE LINE THAT OPENED IT IS CHARGED TO IT. A turn opened after the
    // blocks were read would take its baseline from figures this same line had
    // already moved, and the call that started the turn would cost it nothing.
    ok('the opening line\'s own round trip belongs to this turn'
        + ' (apiCalls=' + s.turnApiCalls + ')', s.turnApiCalls === 1);
    ok('…and its step (steps=' + s.turnSteps + ')', s.turnSteps === 1);
    ok('…and its tokens (tokens=' + s.tokens + ')', s.tokens > 0);

    s = P.reduceEvent(s, resultLine(), 8000).state;
    const t = s.lastTurn || {};
    ok('‼️ THE CLOSED TURN CARRIES ITS DURATION (' + t.ms + 'ms)', t.ms === 6000);
    ok('‼️ …its tokens (' + t.tokens + ')', typeof t.tokens === 'number' && t.tokens > 0);
    ok('‼️ …its round trips (' + t.apiCalls + ')', t.apiCalls === 1);
    ok('‼️ …its steps (' + t.steps + ')', t.steps === 1);
    ok('‼️ …and the model and effort it ran on (' + t.model + ' / ' + t.effort + ')',
        t.model === 'opus' && t.effort === 'xhigh');
    ok('…and the cost the CLI stated', t.cost === 0.485);

    // The whole of S-57, said as one sentence: the strip no longer has only
    // two facts to print.
    const drawn = ['ms', 'tokens', 'apiCalls', 'steps', 'model', 'effort']
        .filter(k => t[k] === undefined);
    ok('‼️ NOT ONE OF THE SIX FIELDS THE STRIP DRAWS IS MISSING'
        + (drawn.length ? ' — still empty: ' + drawn.join(', ') : ''), drawn.length === 0);
}

// ------------------------------------- 2. a turn the window DID start is not
//                                          re-opened underneath itself
{
    let s = revived();
    const a = P.acceptUserText(s, 'go', 1500);
    s = a.state;
    ok('the window opening a turn still works', s.turnStartedAt === 1500 && a.send === true);
    s = P.reduceEvent(s, assistantLine(), 2000).state;
    ok('‼️ …and an assistant line inside it does NOT restart its clock',
        s.turnStartedAt === 1500);
    s = P.reduceEvent(s, assistantLine({ request_id: 'req-2', message: { ...assistantLine().message, id: 'msg-2' } }), 3000).state;
    ok('…nor does the next one', s.turnStartedAt === 1500);
}

// ------------------------------------- 3. a usage-only repeat is still not a
//                                          turn, and is still not counted twice
{
    let s = revived();
    const line = assistantLine();
    s = P.reduceEvent(s, line, 2000).state;
    const after = { tokens: s.tokens, calls: s.turnApiCalls, key: s.lastUsageKey };
    // the CLI repeats the same usage on every content block of one message
    s = P.reduceEvent(s, line, 2100).state;
    ok('a repeated usage line is not charged a second time'
        + ' (' + after.tokens + ' → ' + s.tokens + ')', s.tokens === after.tokens);
    ok('…and the key that makes that possible survives', s.lastUsageKey === after.key);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
