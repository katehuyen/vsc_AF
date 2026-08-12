// X-35 — EVERY FUNCTION, ON EVERY ENGINE.
//
// ‼️ WHAT THIS FILE IS FOR, AND WHY IT IS NOT test_engine_mark.js. That one
// pins the BADGE — four colours and four labels. This one pins the BEHAVIOUR:
// a session that did not come out of Claude's transcript folder gets the same
// treatment from the index, the same figures on a card, and the same answer
// from a command as one that did.
//
// Each block below is a reported failure, not a hypothetical. The pattern that
// produced all of them is the same and is worth naming once: the index keeps
// foreign sessions in a deliberate SIDE LIST (`externalList`) so Claude-shaped
// analytics can never average them in — and every setter that walks
// `this.sessions` and forgets the side list turns that safety into a silent
// omission. Three of the four setters had learned; the one that had not is the
// rename, which is exactly the bug the user filed.
const Module = require('module');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

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

const out = f => require(path.resolve(__dirname, '..', 'out', 'core', f));
const { SessionIndex } = out('sessions.js');
const { emptyUsage } = out('pricing.js');

/** A foreign session as a source hands one over — the shape blankInfo builds. */
function external(sessionId, source, autoTitle) {
    return {
        file: '', sessionId, isSidechain: false, source,
        title: autoTitle, autoTitle,
        firstTs: 1, lastTs: 2, mtime: 2,
        models: [], usage: emptyUsage(), wTokens: 0, cost: 0,
        userTurns: 1, assistantMsgs: 1, toolCalls: 0, tools: {},
        skillCalls: {}, memoryReads: {}, filesEdited: {}, errors: 0,
        daily: {}, heat: new Array(168).fill(0), events: [], recentMsgs: [], turns: []
    };
}

// ‼️ `includeUnmatched` defaults to TRUE here, and that is itself part of the
// contract: the farm's scope switch now governs foreign sessions exactly as it
// governs Claude's (see the block at the end of this file), so a fixture with no
// agent would otherwise never reach the list the other blocks are about.
function newIndex(includeUnmatched = true) {
    const { PricingEngine } = out('pricing.js');
    return new SessionIndex(
        path.join(__dirname, 'fixtures', 'nowhere'), // claudeDir — never scanned here
        () => [],                                    // extra (synced) dirs
        new PricingEngine([]),
        () => [],                                    // agents
        () => includeUnmatched,
        () => 30 * 60_000                            // activeThresholdMs
    );
}

// ---------------------------------------------------------------------------
// A rename means the same thing on every engine
// ---------------------------------------------------------------------------
{
    const index = newIndex();
    index.setExternal([
        external('codex-1', 'codex', 'codex session'),
        external('agy-1', 'agy', 'Antigravity session')
    ]);

    index.setTitleOverrides({ 'codex-1': 'the parser bug' });
    const renamed = () => index.external().find(s => s.sessionId === 'codex-1');
    // ‼️ THE REPORTED BUG. The override was stored, survived a reload, and was
    // applied to the claude map only — so the name existed everywhere except on
    // screen, which reads as a broken menu item rather than a missing feature.
    ok('‼️ renaming a foreign session actually renames it',
        renamed().title === 'the parser bug');
    ok('…and leaves the other engine alone',
        index.external().find(s => s.sessionId === 'agy-1').title === 'Antigravity session');

    // ‼️ AND IT SURVIVES THE NEXT SCAN. A source re-parses its transcript the
    // moment the file changes and hands back a freshly derived title, so a
    // rename applied once and not on rescan is a rename that undoes itself as
    // soon as the user says anything else in that session.
    index.setExternal([
        external('codex-1', 'codex', 'codex session'),
        external('agy-1', 'agy', 'Antigravity session'),
        external('gemini-1', 'gemini', 'gemini session')
    ]);
    ok('‼️ …and survives the source re-reading the transcript',
        renamed().title === 'the parser bug');

    // Clearing restores what the conversation itself says, same as on Claude.
    index.setTitleOverrides({});
    ok('clearing a rename restores the derived title',
        renamed().title === 'codex session');
}

// ---------------------------------------------------------------------------
// Codex reports its usage CUMULATIVELY — measured, and the reason ctx read 38M
// ---------------------------------------------------------------------------
{
    const { newCodexState, translateCodex } = out('codexproto.js');
    const { contextAfter } = out('pricing.js');

    // ‼️ MEASURED 2026-08-12, codex-cli 0.147.0, two real turns of one thread:
    //   turn 1  input 12378  cached 4480   output 17
    //   turn 2  input 24774  cached 16640  output 23
    // The second is not the second turn's usage, it is the THREAD's running
    // total. Passed through as a per-turn figure it does three things at once:
    // the token count compounds, the cost compounds with it, and
    // `contextAfter` reports the whole session's spend as the size of the
    // context window — which is where a session that never exceeded 258k came
    // to claim 38M of context.
    const usageOf = (events) => {
        const a = events.find(e => e && e.type === 'assistant' && e.message && e.message.usage);
        return a ? a.message.usage : undefined;
    };
    let st = newCodexState();
    let r = translateCodex(st, { type: 'thread.started', thread_id: 't1' });
    st = r.state;
    r = translateCodex(st, { type: 'turn.started' });
    st = r.state;
    r = translateCodex(st, {
        type: 'turn.completed',
        usage: { input_tokens: 12378, cached_input_tokens: 4480, cache_write_input_tokens: 0, output_tokens: 17, reasoning_output_tokens: 10 }
    });
    st = r.state;
    const u1 = usageOf(r.events);
    ok('the first turn is reported as itself',
        u1.input_tokens === 12378 - 4480 && u1.cache_read_input_tokens === 4480 && u1.output_tokens === 17);

    r = translateCodex(st, { type: 'turn.started' });
    st = r.state;
    r = translateCodex(st, {
        type: 'turn.completed',
        usage: { input_tokens: 24774, cached_input_tokens: 16640, cache_write_input_tokens: 0, output_tokens: 23, reasoning_output_tokens: 10 }
    });
    st = r.state;
    const u2 = usageOf(r.events);
    // 24774 - 12378 = 12396 whole input, 16640 - 4480 = 12160 of it cached.
    ok('‼️ the second turn is the DELTA, not the thread total',
        u2.input_tokens === (24774 - 12378) - (16640 - 4480)
        && u2.cache_read_input_tokens === 16640 - 4480
        && u2.output_tokens === 23 - 17);
    // ‼️ THE FIGURE THE USER SAW. The window after turn 2 is what turn 2's own
    // request carried — about 12.4k — and not the 24.8k the thread has spent.
    ok('‼️ …so the context figure is a window, not a lifetime total',
        contextAfter(u2) === (24774 - 12378) + (23 - 17));
    ok('…and both turns together still add up to what the thread spent',
        u1.input_tokens + u1.cache_read_input_tokens + u2.input_tokens + u2.cache_read_input_tokens === 24774);

    // A total that goes DOWN is a thread that was compacted or a CLI that
    // changed its mind; the delta is the new figure rather than a negative one.
    r = translateCodex(st, { type: 'turn.started' });
    st = r.state;
    r = translateCodex(st, {
        type: 'turn.completed',
        usage: { input_tokens: 5000, cached_input_tokens: 1000, cache_write_input_tokens: 0, output_tokens: 5, reasoning_output_tokens: 0 }
    });
    const u3 = usageOf(r.events);
    ok('a total that shrank is never reported as negative usage',
        u3.input_tokens >= 0 && u3.cache_read_input_tokens >= 0 && u3.output_tokens >= 0);
}

// ---------------------------------------------------------------------------
// A Codex row carries the ctx figure its own rollout already states
// ---------------------------------------------------------------------------
{
    const fs = require('fs');
    const os = require('os');
    const { codexSessionsSource } = out('cliTranscripts.js');
    const { PricingEngine } = out('pricing.js');

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'af-x35-'));
    const dir = path.join(root, 'sessions', '2026', '08', '12');
    fs.mkdirSync(dir, { recursive: true });
    const lines = [
        { timestamp: '2026-08-12T10:00:00.000Z', type: 'session_meta', payload: { session_id: 'rollout-1', cwd: root, cli_version: '0.147.0' } },
        { timestamp: '2026-08-12T10:00:01.000Z', type: 'turn_context', payload: { model: 'gpt-5.4-mini' } },
        { timestamp: '2026-08-12T10:00:02.000Z', type: 'event_msg', payload: { type: 'user_message', message: 'reply with just: OK' } },
        {
            timestamp: '2026-08-12T10:00:03.000Z', type: 'event_msg', payload: {
                type: 'token_count',
                info: {
                    total_token_usage: { input_tokens: 20766, cached_input_tokens: 11008, cache_write_input_tokens: 0, output_tokens: 822, reasoning_output_tokens: 211, total_tokens: 21588 },
                    last_token_usage: { input_tokens: 20766, cached_input_tokens: 11008, cache_write_input_tokens: 0, output_tokens: 822, reasoning_output_tokens: 211, total_tokens: 21588 },
                    model_context_window: 258400
                }
            }
        },
        {
            timestamp: '2026-08-12T11:00:00.000Z', type: 'event_msg', payload: {
                type: 'token_count',
                info: {
                    // the thread has now spent 32.8M — and holds 93k
                    total_token_usage: { input_tokens: 32705304, cached_input_tokens: 31860096, cache_write_input_tokens: 0, output_tokens: 95054, reasoning_output_tokens: 31839, total_tokens: 32800358 },
                    last_token_usage: { input_tokens: 92550, cached_input_tokens: 91520, cache_write_input_tokens: 0, output_tokens: 1075, reasoning_output_tokens: 701, total_tokens: 93625 },
                    model_context_window: 258400
                }
            }
        }
    ];
    fs.writeFileSync(path.join(dir, 'rollout-x35.jsonl'),
        lines.map(l => JSON.stringify(l)).join('\n') + '\n', 'utf8');

    const src = codexSessionsSource(() => root, () => ({}), () => new PricingEngine([]), 0);
    const rows = src.scan();
    ok('the rollout is read at all', rows.length === 1 && rows[0].source === 'codex');
    const row = rows[0];
    // ‼️ The ctx cell was empty on every Codex row in every table, while the
    // rollout stated the answer twice per turn. An empty cell in a column that
    // is filled for one engine reads as "this session used no context".
    ok('‼️ a Codex row states the context it actually held',
        row.lastCtxTokens === 92550 + 1075);
    ok('…and NOT what the thread spent over its life',
        row.lastCtxTokens < 200_000);
    // The window is the engine's own, not Claude's 200k — a percentage drawn
    // against the wrong denominator is worse than no percentage.
    ok('…against the window that engine reported', row.ctxWindow === 258400);
    // The session TOTAL is still the cumulative figure: that is what it spent.
    ok('the spend column still shows the whole thread',
        row.usage.cacheRead === 31860096 && row.usage.input === 32705304 - 31860096);

    fs.rmSync(root, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// The host names engines the same way the webviews do
// ---------------------------------------------------------------------------
{
    const fs = require('fs');
    const vm = require('vm');
    const { ENGINE_LABELS } = out('engines.js');

    // ‼️ TWO MAPS, ONE SPELLING — and this is the assertion that keeps them one.
    // `media/afEngine.js` owns every webview; the host has no access to it, so
    // the sidebar trees, notifications and report text were printing raw ids
    // (`agy`, a word nobody outside this codebase knows). Now both exist, which
    // is exactly the duplication this codebase warns about — so the drift is
    // pinned here rather than left to be noticed on a screenshot.
    const sandbox = { window: {} };
    vm.createContext(sandbox);
    vm.runInContext(
        fs.readFileSync(path.resolve(__dirname, '..', 'media', 'afEngine.js'), 'utf8'), sandbox);
    const web = sandbox.window.AFEngine;

    // ‼️ THE SAME ENGINES, AND THE SAME NAME FOR EACH — not byte-identical
    // strings, because the two labels do different jobs and both are right: a
    // 9px badge in a table cell says "Claude", the Engines settings row says
    // "Claude Code". What must never drift is the SET of ids and which engine a
    // name refers to, so the host label has to start with the badge's.
    ok('‼️ the host and the webviews know exactly the same engines',
        web.known.length === Object.keys(ENGINE_LABELS).filter(k => k).length
        && web.known.every(id => typeof ENGINE_LABELS[id] === 'string'));
    ok('…and each engine\'s two names are the same name',
        web.known.every(id => ENGINE_LABELS[id].startsWith(web.label(id))));
    // A Claude transcript states no engine, so BOTH sides must read the absence
    // as Claude rather than as "unknown" — the omission the badge exists for.
    ok('…and an absent engine is Claude on both sides',
        web.id('') === 'claude' && !!ENGINE_LABELS['']);
}

// ---------------------------------------------------------------------------
// A turn row says which engine ran it
// ---------------------------------------------------------------------------
{
    const { turnRowsFor } = out('turns.js');

    // ‼️ The Turns page maps over `SessionInfo.turns`, which only the Claude
    // parse ever filled — so the page that calls itself "the whole farm unrolled
    // one row per turn" held exactly one engine's turns, and widening it to the
    // external list alone would have added nothing.
    const codex = external('codex-turns-1', 'codex', 'codex session');
    codex.turns = [{
        n: 1, label: 'run the suite', ts: 10,
        tokens: 2300, wTokens: 0, cost: 0,
        apiCalls: 1, steps: 4, thinking: 1, ms: 900, endCtx: 2300,
        tools: 2, errors: 0, models: ['gpt-5.4-mini']
    }];
    const rows = turnRowsFor(codex, false);
    ok('‼️ a Codex turn becomes a row at all', rows.length === 1);
    ok('…and the row names the engine that ran it', rows[0].engine === 'codex');

    // A Claude transcript states no engine; the row must still say "claude"
    // rather than leaving the column empty (the absence IS the answer).
    const claude = external('claude-turns-1', undefined, 'a claude session');
    claude.turns = [codex.turns[0]];
    ok('…and a session with no stated engine is reported as claude',
        turnRowsFor(claude, false)[0].engine === 'claude');
}

// ---------------------------------------------------------------------------
// The farm's SCOPE switch governs every engine, not only Claude's
// ---------------------------------------------------------------------------
{
    // ‼️ `includeUnmatchedProjects` was applied in the claude parse only, so one
    // folder gave two answers: the Claude session in it was dropped from the
    // index and the Codex session beside it was listed with no agent at all. A
    // scope switch that governs one engine of four is not a scope switch.
    const narrow = newIndex(false);
    narrow.setExternal([
        external('stray-1', 'codex', 'a conversation in a stray folder'),
        Object.assign(external('mine-1', 'codex', 'a conversation in an agent folder'),
            { agentId: 'a1', agentName: 'developer' })
    ]);
    ok('‼️ an unattributed foreign session obeys the scope switch',
        narrow.external().length === 1 && narrow.external()[0].sessionId === 'mine-1');

    const wide = newIndex(true);
    wide.setExternal([external('stray-1', 'codex', 'a conversation in a stray folder')]);
    ok('…and is listed when the switch is on',
        wide.external().length === 1);
    // …under the same name the claude path gives an unattributed session, so the
    // two are one list rather than two shapes.
    ok('…named the way the claude path names one',
        wide.external()[0].agentName === 'Other projects');
}

// ---------------------------------------------------------------------------
// A task is priced against ITS OWN engine's sessions
// ---------------------------------------------------------------------------
{
    const { matchTaskSession } = out('taskcost.js');
    const T0 = 1_000_000;
    const ses = (id, source) => ({
        file: `${id}.jsonl`, firstTs: T0 + 5_000, lastTs: T0 + 200_000, cost: 0.42, source
    });
    const task = { startedAt: T0, endedAt: T0 + 300_000 };

    // ‼️ THE BUG. The matcher refused every session with a `source`, so a task
    // queued on Codex could never match anything: no cost, no token count, no
    // transcript link, for ever — and the tasks page showed the blank exactly
    // the way it shows "not measured yet".
    ok('‼️ a Codex task matches its Codex session',
        matchTaskSession({ ...task, engine: 'codex' }, [ses('c1', 'codex')])?.file === 'c1.jsonl');
    ok('…a Claude task still matches its Claude session',
        matchTaskSession(task, [ses('k1', undefined)])?.file === 'k1.jsonl');
    // …and the engine filter is what stops the two being confused, which is the
    // job the old `!s.source` test was accidentally doing.
    ok('‼️ a Claude task never picks up an overlapping Codex session',
        matchTaskSession(task, [ses('c1', 'codex')]) === undefined);
    ok('…nor a Codex task a Claude one',
        matchTaskSession({ ...task, engine: 'codex' }, [ses('k1', undefined)]) === undefined);
    ok('…and two candidates on the same engine are still an honest no-match',
        matchTaskSession({ ...task, engine: 'codex' },
            [ses('c1', 'codex'), ses('c2', 'codex')]) === undefined);
}

// ---------------------------------------------------------------------------
// Every engine leaves the building in the OTLP export
// ---------------------------------------------------------------------------
{
    const { buildOtlpTraces } = out('otel.js');
    const { emptyUsage: eu } = out('pricing.js');
    const ref = (id, source) => ({
        sessionId: id, title: id, firstTs: 1, lastTs: 2, cost: 0,
        usage: eu(), models: [], toolCalls: 0, errors: 0, source
    });
    // ‼️ The export read `index.all()`, so a Codex trace did not reach Langfuse
    // as "priced at zero" — it did not reach it at all.
    const doc = buildOtlpTraces([ref('k1', undefined), ref('c1', 'codex'), ref('g1', 'agy')]);
    const spans = doc.resourceSpans[0].scopeSpans[0].spans;
    const systemOf = (n) => spans.find(s => s.name === n)
        .attributes.find(a => a.key === 'gen_ai.system').value.stringValue;
    ok('‼️ every engine gets a span', spans.length === 3);
    ok('…and each span says which system served it',
        systemOf('c1') === 'codex' && systemOf('g1') === 'agy');
    ok('…and an absent source is Claude here too', systemOf('k1') === 'claude');
}

// ---------------------------------------------------------------------------
// A row with no transcript says WHY, and "yet" is not always true
// ---------------------------------------------------------------------------
{
    const { noTranscriptNote, engineOf: eng } = out('consoleEngine.js');
    // ‼️ Antigravity's conversations are protobuf inside SQLite; there will never
    // be a transcript. Telling that reader to wait is the quiet kind of wrong.
    ok('an engine that writes one is only "not yet"',
        /yet/.test(noTranscriptNote('codex')) && eng('codex').readableTranscript === true);
    ok('‼️ the engine that never will does not say "yet"',
        !/yet/.test(noTranscriptNote('agy')) && eng('agy').readableTranscript === false);
    ok('…and the note names the engine', /Antigravity/.test(noTranscriptNote('agy')));
}

// ---------------------------------------------------------------------------
// A Claude-only analytic states its scope in one wording, everywhere
// ---------------------------------------------------------------------------
{
    const { claudeOnlyScopeNote, engineSpread } = out('engines.js');
    const ext = [{ source: 'codex' }, { source: 'codex' }, { source: 'agy' }];
    ok('the spread is spelt with labels, busiest first',
        engineSpread(ext) === 'Codex ×2 · Antigravity ×1');
    const note = claudeOnlyScopeNote(ext, 'This figure');
    ok('‼️ a fleet figure says how many sessions it leaves out',
        /3 sessions/.test(note) && /Codex ×2/.test(note));
    ok('…and nothing is said when there is nothing to exclude',
        claudeOnlyScopeNote([], 'This figure') === '');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
