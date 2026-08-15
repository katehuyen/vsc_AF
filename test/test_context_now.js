// X-43 — "ctx now" IS ITS OWN MEASUREMENT, AND FOUR NUMBERS WERE WEARING ITS
// LABEL.
//
// ‼️ THE CASE THIS FILE IS BUILT ON, measured 2026-08-15 on a live `gpt-5.6-sol`
// Codex thread. At one instant:
//
//   console.sessions        tokens = 5 414 907   contextTokens = 5 414 907
//   the same thread's rollout, same counter:
//     total_token_usage.total_tokens   5 414 907   ← the conversation's SPEND
//     last_token_usage.total_tokens      220 471   ← the WINDOW. this is ctx
//     model_context_window               258 400   ← the capacity in force
//
// So the card said the window held 21× its own capacity. The bug was not
// formatting: the wrong field travelled through the host state and out of the
// Bridge, and the suite stayed green because `test_engine_parity.js` asserted
// `contextAfter(turn delta)` — an invariant that silently assumed one user turn
// is one model call. It is not: while the agent runs tools it makes many, and
// their sum is what the turn cost, not what the window holds.
//
// Every block below is one clause of the contract that replaced it.
const Module = require('module');
const path = require('path');
const fs = require('fs');
const os = require('os');

// The index pulls in `vscode` for its watchers; nothing under test touches it.
class Emitter {
    constructor() { this.handlers = []; }
    get event() { return (fn) => { this.handlers.push(fn); return { dispose() { } }; }; }
    fire(v) { for (const h of this.handlers) { h(v); } }
    dispose() { }
}
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') {
        return {
            EventEmitter: Emitter,
            workspace: {
                createFileSystemWatcher: () => ({
                    onDidChange: () => ({ dispose() { } }),
                    onDidCreate: () => ({ dispose() { } }),
                    onDidDelete: () => ({ dispose() { } }),
                    dispose() { }
                })
            },
            window: {}, commands: {}, RelativePattern: class { }
        };
    }
    return origLoad.apply(this, arguments);
};

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const out = f => require(path.resolve(__dirname, '..', 'out', 'core', f));
const {
    reduceEvent, newSessionState, carriedTotals, usageScopeOf,
    contextSample, contextPercent
} = out('consoleproto.js');
const { newCodexState, translateCodex, readCodexContext } = out('codexproto.js');
const { CodexContextProbe, isStale, STALE_AFTER_MS } = out('codexctx.js');

const state = (over) => ({ ...newSessionState({
    id: 's', agentId: 'a', agentName: 'agent', cwd: '/tmp', now: 1000
}), ...(over || {}) });

/** Feed a list of events through the reducer, as the host does. */
function run(s, events, now = 2000) {
    for (const e of events) { s = reduceEvent(s, e, now).state; }
    return s;
}

// ---------------------------------------------------------------------------
// THE REGRESSION ITSELF — the real figures, end to end through the reducer
// ---------------------------------------------------------------------------
{
    // The rollout line as the CLI writes it, cut to the fields that matter.
    const line = JSON.stringify({
        timestamp: '2026-08-15T12:00:00.000Z', type: 'event_msg', payload: {
            type: 'token_count',
            info: {
                total_token_usage: {
                    input_tokens: 5300000, cached_input_tokens: 5100000,
                    cache_write_input_tokens: 0, output_tokens: 114907,
                    reasoning_output_tokens: 40000, total_tokens: 5414907
                },
                last_token_usage: {
                    input_tokens: 220008, cached_input_tokens: 210000,
                    cache_write_input_tokens: 0, output_tokens: 463,
                    reasoning_output_tokens: 200, total_tokens: 220471
                },
                model_context_window: 258400
            },
            rate_limits: null
        }
    });
    const sample = readCodexContext(line);
    ok('‼️ the rollout states the window, and it is the LAST call not the total',
        sample.tokens === 220471 && sample.window === 258400 && sample.spent === 5414907);

    // Now the same session through the console reducer: the turn aggregate
    // spends, the rollout reading is the window. They must disagree.
    let s = state();
    let st = newCodexState();
    st = translateCodex(st, { type: 'thread.started', thread_id: 't-5.6' }).state;
    st = translateCodex(st, { type: 'turn.started' }).state;
    const t = translateCodex(st, {
        type: 'turn.completed',
        // ‼️ Codex's `input_tokens` INCLUDES the cached share, so this is the
        // thread total exactly as the CLI states it: 5 300 000 + 114 907.
        usage: {
            input_tokens: 5300000, cached_input_tokens: 5100000,
            cache_write_input_tokens: 0, output_tokens: 114907,
            reasoning_output_tokens: 40000
        }
    });
    s = run(s, t.events);
    s = run(s, [{
        type: 'context', tokens: sample.tokens, window: sample.window,
        source: 'rollout-last-token-usage'
    }]);

    ok('‼️ the session SPEND is the conversation total — it may exceed the window',
        s.tokens === 5414907);
    ok('‼️ …and ctx is 220 471, not the 5 414 907 the card used to print',
        s.contextTokens === 220471);
    ok('…against the window that session itself reported',
        s.contextWindowTokens === 258400);
    ok('the two are visibly different numbers', s.tokens !== s.contextTokens);
    const c = contextSample(s);
    ok('the canonical sample carries source and age',
        c.tokens === 220471 && c.window === 258400
        && c.source === 'rollout-last-token-usage' && c.measuredAt > 0);
    ok('…and the percentage is drawn from the reported window, not a catalogue',
        contextPercent(c) === Math.round((220471 / 258400) * 100));
}

// ---------------------------------------------------------------------------
// ONE USER TURN, THREE MODEL CALLS — the arithmetic the old invariant denied
// ---------------------------------------------------------------------------
{
    // Claude's stream, which is the one engine that really does report per call.
    const call = (id, input, out_) => ({
        type: 'assistant', request_id: id,
        message: {
            id, content: [], usage: {
                input_tokens: input, output_tokens: out_,
                cache_read_input_tokens: 0, cache_creation_input_tokens: 0
            }
        }
    });
    let s = state();
    s = run(s, [call('r1', 10000, 100), call('r2', 12000, 120), call('r3', 14000, 140)]);
    ok('the turn/session total is the SUM of every call',
        s.tokens === (10000 + 100) + (12000 + 120) + (14000 + 140));
    ok('‼️ …and ctx is the LAST call alone', s.contextTokens === 14000 + 140);
    ok('the source names the stream', s.contextSource === 'stream-last-call');
}

// ---------------------------------------------------------------------------
// SCOPE — what a usage block is the usage OF, per engine
// ---------------------------------------------------------------------------
{
    ok('an event that says nothing is per-call (Claude)', usageScopeOf({}) === 'perCall');
    ok('turnAggregate is honoured', usageScopeOf({ usage_scope: 'turnAggregate' }) === 'turnAggregate');
    ok('a nonsense scope falls back to per-call rather than throwing',
        usageScopeOf({ usage_scope: 'whatever' }) === 'perCall');

    const agg = (scope, n) => ({
        type: 'assistant', usage_scope: scope, request_id: 'x' + n,
        message: {
            id: 'm' + n, content: [], usage: {
                input_tokens: n, output_tokens: 0,
                cache_read_input_tokens: 0, cache_creation_input_tokens: 0
            }
        }
    });
    let s = state();
    s = run(s, [agg('turnAggregate', 5000000)]);
    ok('‼️ an aggregate block SPENDS', s.tokens === 5000000);
    ok('‼️ …and does not touch ctx', !s.contextTokens);
    s = run(s, [agg('processAggregate', 900000)]);
    ok('a process aggregate (Gemini) spends and states no window',
        s.tokens === 5900000 && !s.contextTokens);

    // Antigravity is the one non-Claude engine whose stream IS per-step, and
    // that reading must not be thrown away with the others.
    const { newAgyState, translateAgy } = out('agyproto.js');
    let a = newAgyState();
    a = translateAgy(a, { event: 'init', conversation_id: 'c1', init: {} }, {}).state;
    const step = translateAgy(a, {
        event: 'step_update', step_update: {
            step_type: 'agent_response', step_index: 0, state: 'DONE',
            text_delta: 'hello',
            usage: { input_tokens: 25594, output_tokens: 7, thinking_tokens: 0 }
        }
    }, {});
    const carried = step.events.find(e => e.type === 'assistant' && e.message.usage);
    ok('‼️ an Antigravity STEP is a call, so it keeps per-call scope',
        carried && usageScopeOf(carried) === 'perCall');

    // Gemini's result block is the process's sum and says so.
    const { newGeminiState, translateGemini } = out('geminiproto.js');
    let g = newGeminiState();
    const res = translateGemini(g, {
        type: 'result', status: 'success',
        stats: { total_tokens: 25595, input_tokens: 25000, output_tokens: 595, cached: 0 }
    }, {});
    const gu = res.events.find(e => e.type === 'assistant' && e.message.usage);
    ok('‼️ Gemini\'s result usage declares itself a process aggregate',
        gu && usageScopeOf(gu) === 'processAggregate');
}

// ---------------------------------------------------------------------------
// CLAUDE MUST NOT MOVE — the engine the item says not to touch
// ---------------------------------------------------------------------------
{
    const u = (over) => ({
        input_tokens: 10, output_tokens: 3,
        cache_read_input_tokens: 15642, cache_creation_input_tokens: 6961, ...(over || {})
    });
    let s = state();
    s = run(s, [{ type: 'assistant', request_id: 'r1', message: { id: 'm1', content: [], usage: u() } }]);
    const ctx = s.contextTokens;
    ok('a real Claude call sets ctx', ctx === 10 + 3 + 15642 + 6961);

    // …the repeated line for the same call changes nothing
    s = run(s, [{ type: 'assistant', request_id: 'r1', message: { id: 'm1', content: [], usage: u() } }]);
    ok('a repeated content block neither spends twice nor moves ctx',
        s.tokens === ctx && s.contextTokens === ctx);

    // …a SUB-AGENT spends but does not own this window
    s = run(s, [{
        type: 'assistant', request_id: 'r2', parent_tool_use_id: 'tool-1',
        message: { id: 'm2', content: [], usage: u({ cache_read_input_tokens: 100, cache_creation_input_tokens: 0, input_tokens: 5, output_tokens: 1 }) }
    }]);
    ok('‼️ a sub-agent spends this session\'s tokens and not its window',
        s.tokens > ctx && s.contextTokens === ctx);

    // …`thinking_tokens` is still not context
    s = run(s, [{ type: 'system', subtype: 'thinking_tokens', estimated_tokens: 120 }]);
    ok('‼️ thinking_tokens still cannot knock the window down', s.contextTokens === ctx);

    // …a zero-usage assistant message does not wipe the last good reading
    s = run(s, [{
        type: 'assistant', request_id: 'r3',
        message: { id: 'm3', content: [], usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }
    }]);
    ok('a zero usage leaves the last real figure standing', s.contextTokens === ctx);
}

// ---------------------------------------------------------------------------
// THE `context` EVENT — an explicit measurement, and what it refuses to do
// ---------------------------------------------------------------------------
{
    let s = state();
    s = run(s, [{ type: 'context', tokens: 220471, window: 258400, source: 'rollout-last-token-usage', measuredAt: 1750 }]);
    ok('an explicit sample is applied whole',
        s.contextTokens === 220471 && s.contextWindowTokens === 258400
        && s.contextMeasuredAt === 1750 && s.contextSource === 'rollout-last-token-usage');

    const again = reduceEvent(s, { type: 'context', tokens: 220471, window: 258400 }, 3000);
    ok('‼️ an unchanged reading repaints nothing', again.changed === false);

    const zero = reduceEvent(s, { type: 'context', tokens: 0 }, 3000);
    ok('‼️ a zero never wipes the last good reading', zero.state.contextTokens === 220471);

    const stale = reduceEvent(s, { type: 'context', tokens: 0, stale: true }, 3000);
    ok('…but it may mark it stale',
        stale.changed === true && stale.state.contextStale === true
        && stale.state.contextTokens === 220471);

    // COMPACTION: a real drop, and it is not monotonised back up.
    const dropped = run(s, [{ type: 'context', tokens: 43000, window: 258400 }]);
    ok('‼️ compaction 220k → 43k is a real fall, not a figure to be maxed',
        dropped.contextTokens === 43000);

    // A MODEL SWITCH can shrink the window under a standing reading. The honest
    // answer is "these two came from different moments", not a bigger window.
    const over = run(s, [{ type: 'context', tokens: 220471, window: 128000 }]);
    ok('‼️ tokens > window draws no percentage and does not grow the window',
        contextPercent(contextSample(over)) === undefined && over.contextWindowTokens === 128000);
}

// ---------------------------------------------------------------------------
// A RESUME CARRIES THE READING, AND THE AGGREGATE CANNOT OVERWRITE IT
// ---------------------------------------------------------------------------
{
    const carried = carriedTotals({
        cost: 1.5,
        usage: { input: 100000, output: 5000, cacheWrite: 0, cacheRead: 5300000 },
        wTokens: 42, userTurns: 9,
        lastCtxTokens: 220471, ctxWindow: 258400
    });
    ok('the carried totals split spend from window',
        carried.tokens === 5405000 && carried.contextTokens === 220471
        && carried.contextWindowTokens === 258400);

    let s = newSessionState({
        id: 's', agentId: 'a', agentName: 'agent', cwd: '/tmp', now: 1000,
        resumed: true, sessionId: 't-5.6', carried
    });
    ok('a resumed session starts from the true window',
        s.contextTokens === 220471 && s.contextWindowTokens === 258400);
    ok('…and says the reading is from the transcript and not live',
        s.contextSource === 'transcript-last-call' && s.contextStale === true);

    // ‼️ THE FIRST TURN BACK reports the thread's whole running total. It is a
    // spend baseline and nothing else — it must not land on the window.
    s = run(s, [{
        type: 'assistant', usage_scope: 'turnAggregate', request_id: 'x1',
        message: { id: 'm1', content: [], usage: { input_tokens: 6000000, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }
    }]);
    ok('‼️ the resume baseline never overwrites the carried window',
        s.contextTokens === 220471);
}

// ---------------------------------------------------------------------------
// THE PROBE — the reading discipline around a file being appended to
// ---------------------------------------------------------------------------
{
    const tokenLine = (last, total, win) => JSON.stringify({
        type: 'event_msg', payload: {
            type: 'token_count',
            info: {
                total_token_usage: { total_tokens: total },
                last_token_usage: { total_tokens: last },
                model_context_window: win
            }
        }
    });

    // A hand-built io, so none of this needs a home directory.
    const io = {
        files: {},          // path → text
        stats: {},          // path → { mtimeMs, size }
        found: 'roll.jsonl',
        finds: 0, tails: 0,
        find(id) { this.finds++; return this.found ? this.found + '#' + id : undefined; },
        stat(p) { return this.stats[p]; },
        readTail(p) { this.tails++; return this.files[p]; }
    };
    let clock = 10000;
    const probe = new CodexContextProbe(io, () => clock);

    // 1. The file is not there yet — and that is not a zero.
    io.found = '';
    ok('‼️ a thread with no rollout yet reports nothing, never a total',
        probe.read('t1') === undefined);

    // 2. It appears. The reading is taken.
    io.found = 'roll';
    io.files['roll#t1'] = tokenLine(220471, 5414907, 258400) + '\n';
    io.stats['roll#t1'] = { mtimeMs: 11000, size: 400 };
    clock = 12000;
    let r = probe.read('t1', { force: true });
    ok('once the rollout exists the window is read',
        r && r.tokens === 220471 && r.window === 258400
        && r.source === 'rollout-last-token-usage' && r.measuredAt === 11000);

    // 3. Polled again within the throttle: no disk work at all.
    const tailsBefore = io.tails;
    clock = 12200;
    r = probe.read('t1');
    ok('‼️ a poll inside the throttle answers from cache and reads nothing',
        io.tails === tailsBefore && r.tokens === 220471);

    // 4. Past the throttle but the file has not moved: still no parse.
    clock = 13500;
    r = probe.read('t1');
    ok('‼️ an unchanged mtime+size is not re-parsed', io.tails === tailsBefore);

    // 5. The turn appends — including a HALF-WRITTEN final line, which is the
    //    normal state of a file being written to.
    io.files['roll#t1'] = tokenLine(220471, 5414907, 258400) + '\n'
        + tokenLine(232900, 5427336, 258400) + '\n'
        + '{"type":"event_msg","payload":{"type":"token_c';
    io.stats['roll#t1'] = { mtimeMs: 14000, size: 900 };
    clock = 15000;
    r = probe.read('t1');
    ok('‼️ the newest COMPLETE line wins and the half line is skipped',
        r.tokens === 232900 && r.measuredAt === 14000);

    // 6. Compaction lands in the file. The probe reports the fall.
    io.files['roll#t1'] += '\n' + tokenLine(43000, 5470336, 258400) + '\n';
    io.stats['roll#t1'] = { mtimeMs: 16000, size: 1400 };
    clock = 17000;
    r = probe.read('t1');
    ok('a compacted window is reported as it fell', r.tokens === 43000);

    // 7. The file goes away. The last good reading stands; the path is dropped
    //    so the next poll looks for it again rather than holding a dead one.
    delete io.stats['roll#t1'];
    clock = 18000;
    r = probe.read('t1');
    ok('‼️ a vanished file never zeroes the window', r.tokens === 43000);

    // 8. An unparsable tail is not an answer either.
    io.files['roll#t1'] = 'not json at all\n{"type":"event_msg"}\n';
    io.stats['roll#t1'] = { mtimeMs: 19000, size: 60 };
    clock = 20000;
    r = probe.read('t1', { force: true });
    ok('a tail with no token_count leaves the last reading alone', r.tokens === 43000);

    // 9. A `token_count` with no `last_token_usage` is a line about something
    //    else and must not be read as an empty window.
    io.files['roll#t1'] = JSON.stringify({
        type: 'event_msg',
        payload: { type: 'token_count', info: { total_token_usage: { total_tokens: 9 }, rate_limits: {} } }
    }) + '\n';
    io.stats['roll#t1'] = { mtimeMs: 21000, size: 80 };
    clock = 22000;
    r = probe.read('t1', { force: true });
    ok('‼️ a total-only line is not a window reading', r.tokens === 43000);

    // 10. `total_tokens` absent → input + output, and the cached share is NOT
    //     added again (it is already inside input on this engine).
    const noTotal = readCodexContext(JSON.stringify({
        type: 'event_msg', payload: {
            type: 'token_count',
            info: {
                last_token_usage: { input_tokens: 1000, cached_input_tokens: 800, output_tokens: 25 },
                model_context_window: 258400
            }
        }
    }));
    ok('input+output is the fallback and the cached share is not double-counted',
        noTotal.tokens === 1025);

    ok('an empty tail is undefined, not zero', readCodexContext('') === undefined);
    ok('forgetting a thread is safe', (probe.forget('t1'), probe.read('t9') === undefined) || true);

    // 11. Staleness is a shared judgement, not a per-surface one.
    ok('a reading with no timestamp is stale', isStale(undefined, 1) === true);
    ok('a fresh reading is not', isStale(1000, 1000 + STALE_AFTER_MS - 1) === false);
    ok('an old one is', isStale(1000, 1000 + STALE_AFTER_MS + 1) === true);
}

// ---------------------------------------------------------------------------
// ONE SAMPLE, FOUR SURFACES — raw parser, Console, Sessions row, Viewer
// ---------------------------------------------------------------------------
{
    const { codexSessionsSource } = out('cliTranscripts.js');
    const { PricingEngine } = out('pricing.js');
    const { parseCliViewer } = out('cliViewer.js');

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'af-x43-'));
    const dir = path.join(root, 'sessions', '2026', '08', '15');
    fs.mkdirSync(dir, { recursive: true });
    const lines = [
        { timestamp: '2026-08-15T12:00:00.000Z', type: 'session_meta', payload: { session_id: 'x43', cwd: root, cli_version: '0.147.0' } },
        { timestamp: '2026-08-15T12:00:01.000Z', type: 'turn_context', payload: { model: 'gpt-5.6-sol' } },
        { timestamp: '2026-08-15T12:00:02.000Z', type: 'event_msg', payload: { type: 'user_message', message: 'go' } },
        {
            timestamp: '2026-08-15T12:00:03.000Z', type: 'event_msg', payload: {
                type: 'token_count',
                info: {
                    total_token_usage: { input_tokens: 5300000, cached_input_tokens: 5100000, cache_write_input_tokens: 0, output_tokens: 114907, reasoning_output_tokens: 40000, total_tokens: 5414907 },
                    last_token_usage: { input_tokens: 220008, cached_input_tokens: 210000, cache_write_input_tokens: 0, output_tokens: 463, reasoning_output_tokens: 200, total_tokens: 220471 },
                    model_context_window: 258400
                }
            }
        }
    ];
    const file = path.join(dir, 'rollout-2026-08-15T12-00-00-x43.jsonl');
    fs.writeFileSync(file, lines.map(l => JSON.stringify(l)).join('\n') + '\n', 'utf8');

    const rows = codexSessionsSource(() => root, () => ({}), () => new PricingEngine([]), 0).scan();
    const row = rows[0];
    ok('‼️ the Sessions row states the same window, not the thread total',
        row.lastCtxTokens === 220008 + 463 && row.ctxWindow === 258400);

    const view = parseCliViewer(fs.readFileSync(file, 'utf8'), file, new PricingEngine([]));
    ok('the Viewer reads the same capacity and the same window',
        view.context.limit === 258400 && view.context.tokens === 220008 + 463);

    const probeSample = readCodexContext(fs.readFileSync(file, 'utf8'));
    ok('‼️ the raw parser and the live probe agree to the token',
        probeSample.tokens === 220471 && probeSample.window === row.ctxWindow);
    // ‼️ 220 008 + 463 = 220 471 — the index adds the two buckets, the probe
    // takes the CLI's own total. That they land on the same number is the whole
    // point of sharing one reading of one field.
    ok('…and the index\'s own arithmetic lands on the same figure',
        row.lastCtxTokens === probeSample.tokens);

    // The Console, resumed off that very row, starts where the row says.
    const s = newSessionState({
        id: 's', agentId: 'a', agentName: 'a', cwd: root, now: 1,
        resumed: true, carried: carriedTotals(row)
    });
    ok('‼️ Console, Sessions, Viewer and the probe are one sample',
        s.contextTokens === row.lastCtxTokens && s.contextWindowTokens === 258400);

    try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* temp */ }
}

console.log(`test_context_now: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
