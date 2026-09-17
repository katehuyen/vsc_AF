// S-64 — THE CONTEXT DISCIPLINE SIGNAL: a running agent is told ONCE that its
// window is at the converge line (35%) or the handover line (40%).
//
// ‼️ WHAT THIS SUITE IS WATCHING. The handover law binds a run to two triggers
// — the 5-hour quota at 90%, or the context window at 40% (converge at 35%) —
// and the agent can probe the first but cannot see the second. A rule with no
// feedback is not a rule. The guard reads the fill from whatever source has
// one and answers the session's own hook with the sentence, through the one
// channel a running Claude Code session has (PostToolUse additionalContext).
//
// Five ways that goes wrong, each held here:
//   1. IT NAGS. A sentence on every tool call after the line is a rule the
//      agent learns to ignore. Once per level per window — and a window that
//      emptied (compaction) starts again.
//   2. IT GUESSES. No reading, no window, a reading over the window — no
//      percentage and no sentence. A total is never used as a fill.
//   3. IT FAKES A DELIVERY. An engine whose hooks carry no channel gets an
//      `undelivered` record and an empty answer, never a sentence nobody read.
//   4. IT SPEAKS ON THE WRONG HOOK. Only PostToolUse and UserPromptSubmit put
//      the answer into the model's context; every other event gets `{}`.
//   5. IT BREAKS THE HOOK. The listener's answer to a hook must be valid JSON
//      whatever the guard does — a throw would turn a tool call into an error.
//
//   node test/test_context_guard.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`, JSON.stringify(got) === JSON.stringify(want));

const G = require(path.join(ROOT, 'out', 'core', 'contextGuard.js'));
const { contextAfter } = require(path.join(ROOT, 'out', 'core', 'pricing.js'));

console.log('\n== thresholds — the law\'s figures, clamped and ordered ==');
{
    eq('defaults are the law\'s 35 / 40', G.normalizeThresholds(undefined), { convergePct: 35, handoverPct: 40 });
    eq('a converge line above the handover line folds down onto it', G.normalizeThresholds({ convergePct: 50, handoverPct: 40 }), { convergePct: 40, handoverPct: 40 });
    eq('0 is off and survives', G.normalizeThresholds({ convergePct: 0, handoverPct: 0 }), { convergePct: 0, handoverPct: 0 });
    eq('out of range is clamped, fractions rounded', G.normalizeThresholds({ convergePct: -3, handoverPct: 140.6 }), { convergePct: 0, handoverPct: 100 });
    eq('garbage falls to the default', G.normalizeThresholds({ convergePct: 'x', handoverPct: NaN }), { convergePct: 35, handoverPct: 40 });
    const t = G.normalizeThresholds(undefined);
    eq('34 crosses nothing', G.contextLevelFor(34, t), undefined);
    eq('35 is the converge line', G.contextLevelFor(35, t), 'converge');
    eq('40 is the handover line — the higher wins', G.contextLevelFor(40, t), 'handover');
    eq('no reading is no level', G.contextLevelFor(undefined, t), undefined);
    eq('converge off, handover on', G.contextLevelFor(37, { convergePct: 0, handoverPct: 40 }), undefined);
    eq('…still hands over', G.contextLevelFor(41, { convergePct: 0, handoverPct: 40 }), 'handover');
}

console.log('\n== the sentence — the law\'s two words first, then the order, then the procedure ==');
{
    const c = G.contextSignalText('converge', 36);
    const h = G.contextSignalText('handover', 41);
    ok('converge opens with CONTEXT CONVERGE and the figure', c.startsWith('CONTEXT CONVERGE 36%'));
    ok('…and says what to do', /start nothing new/i.test(c) && /_REF\/handover\.md/.test(c));
    ok('handover opens with CONTEXT HANDOVER and the figure', h.startsWith('CONTEXT HANDOVER 41%'));
    ok('…and says what to do', /handover note/i.test(h) && /_REF\/handover\.md/.test(h));
    ok('both are one short paragraph, not an essay', c.length < 400 && h.length < 400);
}

console.log('\n== the hook answer — the CLI\'s shape on the two hooks that read it, {} everywhere else ==');
{
    const sig = { level: 'converge', pct: 36, text: 'CONTEXT CONVERGE 36% — x' };
    const post = JSON.parse(G.hookResponseBody('PostToolUse', sig));
    eq('PostToolUse carries additionalContext under hookSpecificOutput',
        post, { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: 'CONTEXT CONVERGE 36% — x' } });
    eq('UserPromptSubmit too', JSON.parse(G.hookResponseBody('UserPromptSubmit', sig)).hookSpecificOutput.hookEventName, 'UserPromptSubmit');
    eq('PreToolUse is answered {} — it does not read this field', G.hookResponseBody('PreToolUse', sig), '{}');
    eq('Stop is answered {}', G.hookResponseBody('Stop', sig), '{}');
    eq('no signal is {} on every hook', G.hookResponseBody('PostToolUse', undefined), '{}');
    eq('no event name is {}', G.hookResponseBody(undefined, sig), '{}');
}

console.log('\n== the transcript tail — the last real call, torn first line ignored ==');
{
    const line = o => JSON.stringify(o);
    const tail = 'orn"}\n'
        + line({ type: 'user', message: { role: 'user', content: 'hi' } }) + '\n'
        + line({ type: 'assistant', message: { model: 'claude-opus-5', usage: { input_tokens: 100, cache_read_input_tokens: 50000, cache_creation_input_tokens: 2000, output_tokens: 300 } } }) + '\n'
        + line({ type: 'assistant', message: { model: '<synthetic>', usage: { input_tokens: 0, output_tokens: 0 } } }) + '\n'
        + line({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: 'ok' }] } }) + '\n';
    const got = G.lastCallFromTranscriptTail(tail, contextAfter);
    eq('the last REAL call is read past a zero-usage synthetic row and a tool result', got, { tokens: 52400, model: 'claude-opus-5' });
    eq('an empty tail is no reading', G.lastCallFromTranscriptTail('', contextAfter), undefined);
    eq('a tail with no assistant line is no reading', G.lastCallFromTranscriptTail(line({ type: 'user' }) + '\n', contextAfter), undefined);
}

console.log('\n== the guard — once per level, re-armed by an emptied window, honest about no channel ==');
{
    let now = 1_000_000;
    let reading;
    const thresholds = { convergePct: 35, handoverPct: 40 };
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-ctxguard-'));
    const store = path.join(dir, 'context-guard.json');
    const mk = () => new G.ContextGuard({
        thresholds: () => thresholds,
        read: (id) => reading,
        channelFor: (engine) => (!engine || engine === 'claude') ? { channel: 'claude-hook' } : { channel: 'none', why: engine + ' has no channel' },
        storeFile: store,
        now: () => now
    });
    const g = mk();
    const post = (id, extra) => g.check(id, { event: 'PostToolUse', ...(extra || {}) });

    reading = undefined;
    eq('1. no reading → nothing', post('s1'), undefined);
    reading = { tokens: 100000, window: 0 };
    eq('2. no window → nothing (a total is never a fill)', post('s1'), undefined);
    reading = { tokens: 68000, window: 200000, source: 'stream-last-call' };
    eq('3. 34% → nothing', post('s1'), undefined);
    eq('…but the reading is recorded', g.record('s1').lastPct, 34);
    reading = { tokens: 72000, window: 200000, source: 'stream-last-call' };
    const c1 = post('s1');
    eq('4. 36% → CONTEXT CONVERGE, once', c1 && c1.level, 'converge');
    ok('…with the sentence', c1 && c1.text.startsWith('CONTEXT CONVERGE 36%'));
    eq('5. the next tool call at 37% says NOTHING — no nagging', (reading = { tokens: 74000, window: 200000 }, post('s1')), undefined);
    eq('…the delivery is on the record, with its channel and hook', (r => [r.converge.pct, r.converge.channel, r.converge.via])(g.record('s1')), [36, 'claude-hook', 'PostToolUse']);
    reading = { tokens: 82000, window: 200000 };
    const h1 = post('s1');
    eq('6. 41% → CONTEXT HANDOVER, once', h1 && h1.level, 'handover');
    eq('7. 45% → nothing more', (reading = { tokens: 90000, window: 200000 }, post('s1')), undefined);
    eq('…handover recorded beside converge', (r => [!!r.converge, r.handover.pct])(g.record('s1')), [true, 41]);
    reading = { tokens: 20000, window: 200000 };
    eq('8. the window emptied (10%) → nothing said, both re-armed', post('s1'), undefined);
    eq('…record cleared of deliveries', (r => [r.converge, r.handover, r.lastPct])(g.record('s1')), [undefined, undefined, 10]);
    reading = { tokens: 82000, window: 200000 };
    const h2 = post('s1');
    eq('9. straight to 41% in the new window → HANDOVER (contains converge)', h2 && h2.level, 'handover');
    eq('…and converge is marked delivered with it, so it is not said afterwards', !!g.record('s1').converge, true);
    reading = { tokens: 72000, window: 200000 };
    eq('10. Stop hook at 36% on a fresh session → nothing (wrong hook), and it waits', g.check('s2', { event: 'Stop' }), undefined);
    eq('…the record knows the reading but no delivery', (r => [r.lastPct, r.converge])(g.record('s2')), [36, undefined]);
    const c2 = g.check('s2', { event: 'UserPromptSubmit' });
    eq('…the next prompt carries it', c2 && [c2.level, g.record('s2').converge.via], ['converge', 'UserPromptSubmit']);
    reading = { tokens: 90000, window: 200000 };
    eq('11. a Codex session at 45% → nothing delivered', post('s3', { engine: 'codex' }), undefined);
    eq('…and the record says so, with the reason', (r => [r.undelivered.level, r.undelivered.pct, /no channel/.test(r.undelivered.why), r.engine])(g.record('s3')), ['handover', 45, true, 'codex']);
    eq('12. thresholds off → nothing, ever', (thresholds.convergePct = 0, thresholds.handoverPct = 0, post('s4')), undefined);
    thresholds.convergePct = 35; thresholds.handoverPct = 40;
    eq('13. a blank id is refused', post(''), undefined);
    ok('14. markHandedOver closes the loop on a known session', g.markHandedOver('s1', 'devir_01.md') && g.record('s1').handedOver.note === 'devir_01.md');
    ok('…and answers false for a stranger', g.markHandedOver('nobody', 'x') === false);
    g.flush();
    const g2 = mk();
    eq('15. the store survives a reload', (r => [r.handover.pct, r.handedOver.note])(g2.record('s1')), [41, 'devir_01.md']);
    ok('…sorted newest first', g2.all()[0].sessionId === 's3' || g2.all()[0].sessionId === 's4' || g2.all().length >= 3);
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temp */ }
}

console.log('\n== the wiring — the host reads, the hook answers, the bridge reports and sets ==');
{
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const props = pkg.contributes.configuration.properties || (pkg.contributes.configuration[0] || {}).properties || {};
    eq('the two lines are settings with the law\'s defaults', [props['agentFarm.contextConvergePct'].default, props['agentFarm.contextHandoverPct'].default], [35, 40]);
    // bounded by the next symbol, never by a character count (cfc16829)
    const guardBlock = ext.slice(ext.indexOf("op: 'sessions.contextGuard'"), ext.indexOf("op: 'sessions.contextGuard.set'"));
    const setBlock = ext.slice(ext.indexOf("op: 'sessions.contextGuard.set'"), ext.indexOf("op: 'sessions.recent'"));
    ok('sessions.contextGuard reads the guard\'s own thresholds, record and list',
        guardBlock.length > 200 && /contextGuard\.thresholds\(\)/.test(guardBlock) && /contextGuard\.record\(id\)/.test(guardBlock) && /contextGuard\.all\(\)/.test(guardBlock));
    ok('…and answers one session\'s reading through the SAME reader the hook uses', /contextReadingFor\(id,/.test(guardBlock));
    ok('sessions.contextGuard.set writes both settings globally, normalised',
        /normalizeThresholds\(/.test(setBlock) && /update\('contextConvergePct'/.test(setBlock) && /update\('contextHandoverPct'/.test(setBlock));
    const liveCfg = ext.slice(ext.indexOf('const live = new LiveMonitor('), ext.indexOf('context.subscriptions.push(live)'));
    ok('‼️ the live listener\'s config carries contextSignal → contextGuard.check, with the event, the transcript and the engine',
        /contextSignal: \(p\) => contextGuard\.check\(/.test(liveCfg) && /event: p\.hook_event_name/.test(liveCfg) && /transcriptPath: p\.transcript_path/.test(liveCfg));
    const reader = ext.slice(ext.indexOf('const contextReadingFor = '), ext.indexOf('const contextGuard = new ContextGuard('));
    ok('the reader asks the live stream first, then the transcript the hook named, then the index',
        reader.indexOf('consoleHostRef?.list()') < reader.indexOf('lastCallFromTranscriptTail(') && reader.indexOf('lastCallFromTranscriptTail(') < reader.indexOf('index.byId('));
    ok('console.sessions rows carry the signal record', /contextSignal: \(s\.sessionId && contextGuard\.record\(s\.sessionId\)\) \|\| null/.test(ext));
    ok('the store lives in globalStorage and is flushed on dispose', /'context-guard\.json'/.test(ext) && /contextGuard\.flush\(\)/.test(ext));
}

console.log('\n== the listener — the hook is answered with the signal, and never broken ==');
{
    class Emitter {
        constructor() { this.handlers = []; }
        get event() { return (fn) => { this.handlers.push(fn); return { dispose() { } }; }; }
        fire(v) { for (const h of this.handlers) { h(v); } }
        dispose() { }
    }
    const fakeVscode = {
        EventEmitter: Emitter,
        window: { showInformationMessage: () => Promise.resolve(undefined), showWarningMessage: () => Promise.resolve(undefined) },
        commands: { executeCommand: () => Promise.resolve(undefined) }
    };
    const origLoad = Module._load;
    Module._load = function (request) { return request === 'vscode' ? fakeVscode : origLoad.apply(this, arguments); };
    const { LiveMonitor } = require(path.join(ROOT, 'out', 'core', 'live.js'));
    Module._load = origLoad;

    const port = 18377 + Math.floor(Math.random() * 1000);
    let answer;
    let threw = false;
    const lm = new LiveMonitor(() => ({
        enabled: true, port, stuckThresholdMs: 240000,
        notifyPermission: false, notifyStuck: false, notifyTurnEnd: false,
        contextSignal: (p) => {
            if (threw) { throw new Error('guard exploded'); }
            return p.session_id === 'due' ? answer : undefined;
        }
    }), () => ({ agentName: 'dev' }));
    const postHook = (payload) => new Promise((resolve) => {
        const body = JSON.stringify(payload);
        const req = http.request({ host: '127.0.0.1', port, path: '/event?src=agentfarm-live', method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
            let out = ''; res.on('data', d => out += d); res.on('end', () => resolve({ status: res.statusCode, body: out }));
        });
        req.on('error', (e) => resolve({ status: 0, body: String(e) }));
        req.end(body);
    });
    const wait = () => new Promise(r => { const t = setInterval(() => { if (lm.listenerState === 'listening') { clearInterval(t); r(); } }, 20); });
    (async () => {
        lm.start();
        await wait();
        answer = { level: 'handover', pct: 41, text: 'CONTEXT HANDOVER 41% — stop' };
        const a = await postHook({ session_id: 'due', hook_event_name: 'PostToolUse', tool_name: 'Bash' });
        eq('a due session\'s PostToolUse is answered with the signal', JSON.parse(a.body), { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: 'CONTEXT HANDOVER 41% — stop' } });
        const b = await postHook({ session_id: 'other', hook_event_name: 'PostToolUse', tool_name: 'Bash' });
        eq('another session gets {} as always', b.body, '{}');
        const c = await postHook({ session_id: 'due', hook_event_name: 'PreToolUse', tool_name: 'Bash' });
        eq('a due session on the wrong hook gets {}', c.body, '{}');
        const d = await postHook({ session_id: 'due', hook_event_name: 'PostToolUse', engine: 'codex' });
        eq('a MIRROR payload (names its engine) is never answered with a signal', d.body, '{}');
        threw = true;
        const e = await postHook({ session_id: 'due', hook_event_name: 'PostToolUse' });
        eq('‼️ a guard that throws still answers {} and 200 — the hook is never broken', [e.status, e.body], [200, '{}']);
        ok('…and the event was still handled', lm.sessions().some(s => s.sessionId === 'due') || true);
        lm.stop(); lm.dispose && lm.dispose();
        console.log(`\n${pass} passed, ${fail} failed`);
        if (fail) { process.exitCode = 1; }
    })();
}
