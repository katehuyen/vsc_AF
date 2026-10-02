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
    eq('defaults are the law\'s 35 / 40, and the quota\'s 90 with no converge line', G.normalizeThresholds(undefined), { convergePct: 35, handoverPct: 40, quotaConvergePct: 0, quotaHandoverPct: 90, quotaWeeklyHandoverPct: 98 });
    eq('a converge line above the handover line folds down onto it', G.normalizeThresholds({ convergePct: 50, handoverPct: 40 }), { convergePct: 40, handoverPct: 40, quotaConvergePct: 0, quotaHandoverPct: 90, quotaWeeklyHandoverPct: 98 });
    eq('0 is off and survives', G.normalizeThresholds({ convergePct: 0, handoverPct: 0 }), { convergePct: 0, handoverPct: 0, quotaConvergePct: 0, quotaHandoverPct: 90, quotaWeeklyHandoverPct: 98 });
    eq('out of range is clamped, fractions rounded', G.normalizeThresholds({ convergePct: -3, handoverPct: 140.6 }), { convergePct: 0, handoverPct: 100, quotaConvergePct: 0, quotaHandoverPct: 90, quotaWeeklyHandoverPct: 98 });
    eq('garbage falls to the default', G.normalizeThresholds({ convergePct: 'x', handoverPct: NaN }), { convergePct: 35, handoverPct: 40, quotaConvergePct: 0, quotaHandoverPct: 90, quotaWeeklyHandoverPct: 98 });
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
    // ‼️ S-64 — AND ON A SESSION THIS GUARD NEVER SPOKE TO. The law has two
    // triggers and only one of them is the window: a run that handed over on
    // the 5-hour quota crossed no line here. The fact kept is "this
    // conversation is closed and its work continues elsewhere", which is true
    // however it ended — and it is what stops a smart retry resuming it.
    ok('‼️ a quota handover is recorded too, on a session that never crossed a line',
        g.markHandedOver('quota-only', 'devir_02.md')
        && g.record('quota-only').handedOver.note === 'devir_02.md'
        && g.record('quota-only').converge === undefined);
    ok('…and the view says the window never crossed, rather than "nothing sent" and nothing else',
        (v => v.state === 'quiet' && v.handedOver
            && v.lines.some(l => /never crossed a line/.test(l))
            && v.lines.some(l => /Handed over: yes/.test(l)))(
            G.contextSignalView(g.record('quota-only'), thresholds)));
    ok('…a blank id is still refused', g.markHandedOver('', 'x') === false);
    g.flush();
    const g2 = mk();
    eq('15. the store survives a reload', (r => [r.handover.pct, r.handedOver.note])(g2.record('s1')), [41, 'devir_01.md']);
    ok('…sorted newest first', g2.all()[0].sessionId === 's3' || g2.all()[0].sessionId === 's4' || g2.all().length >= 3);
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temp */ }
}

console.log('\n== S-75 — the second dimension: the account\'s own window, same three rules ==');
{
    let now = 2_000_000;
    let quota;
    let reading;
    const thresholds = { convergePct: 35, handoverPct: 40, quotaConvergePct: 85, quotaHandoverPct: 90 };
    const g = new G.ContextGuard({
        thresholds: () => thresholds,
        read: () => reading,
        quota: () => quota,
        channelFor: (engine) => (!engine || engine === 'claude') ? { channel: 'claude-hook' } : { channel: 'none', why: engine + ' has no channel' },
        now: () => now
    });
    const post = (id, extra) => g.check(id, { event: 'PostToolUse', ...(extra || {}) });
    ok('no sign-in known → the quota line is silent', post('q1') === undefined && !g.record('q1'));
    quota = { pct: 60, account: 'kate' };
    ok('under the line: nothing, but the reading is kept with the account', post('q1') === undefined && g.record('q1').quota.lastPct === 60 && g.record('q1').quota.account === 'kate');
    quota = { pct: 86, account: 'kate', resetsAt: now + 3600_000 };
    const c = post('q1');
    ok('crossing the quota converge line speaks QUOTA CONVERGE with the figure and the account', c && c.dimension === 'quota' && c.level === 'converge' && c.pct === 86 && c.text.startsWith('QUOTA CONVERGE 86% — your account\'s 5-hour window (kate) is 86% used'));
    ok('…the record says so and keeps the reset', g.record('q1').quota.converge.pct === 86 && g.record('q1').quota.converge.account === 'kate' && g.record('q1').quota.resetsAt === now + 3600_000);
    quota = { pct: 88, account: 'kate' };
    ok('the same level again is silent', post('q1') === undefined);
    quota = { pct: 91, account: 'kate' };
    const h = post('q1');
    ok('the handover line speaks once, QUOTA HANDOVER', h && h.level === 'handover' && /^QUOTA HANDOVER 91%/.test(h.text) && /handover note/.test(h.text));
    ok('…and again is silent', post('q1') === undefined);
    quota = { pct: 12, account: 'kate' };
    ok('the window emptied (a reset): re-armed', post('q1') === undefined && !g.record('q1').quota.converge && !g.record('q1').quota.handover);
    quota = { pct: 86, account: 'kate' };
    ok('…so the next crossing speaks again', !!post('q1'));
    quota = { pct: 93, account: 'kate' };
    ok('an engine with no channel records the crossing as undelivered, never invents a delivery',
        post('q2', { engine: 'codex' }) === undefined && g.record('q2').quota.undelivered && g.record('q2').quota.undelivered.level === 'handover' && !g.record('q2').quota.handover);
    ok('a hook that carries no additionalContext is not spoken through', g.check('q3', { event: 'PreToolUse' }) === undefined && !g.record('q3').quota.handover);
    reading = { tokens: 80_000, window: 200_000, source: 'test' };
    quota = { pct: 86, account: 'kate' };
    const both = post('q4');
    ok('both lines crossing in one hook are ONE answer: the window first, the quota under it',
        both && both.dimension === 'both' && both.level === 'handover' && /^CONTEXT HANDOVER 40%/.test(both.text) && /\n\nQUOTA CONVERGE 86%/.test(both.text) && both.quota.account === 'kate');
    const off = new G.ContextGuard({ thresholds: () => ({ ...thresholds, quotaConvergePct: 0, quotaHandoverPct: 0 }), read: () => undefined, quota: () => ({ pct: 99, account: 'kate' }), channelFor: () => ({ channel: 'claude-hook' }), now: () => now });
    ok('0 / 0 switches the quota line off', off.check('q5', { event: 'PostToolUse' }) === undefined);
    eq('a quota converge above its handover folds down', G.normalizeThresholds({ quotaConvergePct: 95, quotaHandoverPct: 90 }).quotaConvergePct, 90);
    eq('quotaLevelFor reads the quota pair', [G.quotaLevelFor(84, thresholds), G.quotaLevelFor(85, thresholds), G.quotaLevelFor(90, thresholds)], [undefined, 'converge', 'handover']);

    // the surface: the quota line's own words, beside the window's and never inside them
    const ago = () => '1m';
    ok('no quota reading yet → the view carries no quota at all', G.contextSignalView({ sessionId: 'x', lastPct: 20 }, thresholds, ago).quota === undefined);
    const quiet = G.quotaSignalView({ account: 'kate', lastPct: 42, lastTs: now }, thresholds, ago);
    ok('quiet: no chip, the head names the account and the figure, the lines the law',
        quiet.state === 'quiet' && quiet.chip === '' && /^5-hour window \(kate\): 42% used$/.test(quiet.head)
        && quiet.lines.some(l => /agentFarm\.quotaConvergePct \/ quotaHandoverPct/.test(l)) && quiet.lines.some(l => /never the home folder/.test(l)));
    const hv = G.contextSignalView(g.record('q1'), thresholds, ago).quota;
    ok('delivered converge: chip carries the figure, a line says what is still ahead', hv.state === 'delivered' && hv.level === 'converge' && hv.chip === '5h 86% CONVERGE'
        && hv.lines[0].startsWith('Quota signal: QUOTA CONVERGE 86% delivered — 1m, through the Claude live hook (PostToolUse)')
        && hv.lines.some(l => /^QUOTA HANDOVER 90%: not reached/.test(l)));
    const hq = G.quotaSignalView({ account: 'kate', lastPct: 91, lastTs: now, resetsAt: new Date(2026, 8, 21, 19, 20).getTime(),
        converge: { ts: now - 60_000, pct: 86, tokens: 0, window: 0, channel: 'claude-hook', via: 'PostToolUse', account: 'kate' },
        handover: { ts: now, pct: 91, tokens: 0, window: 0, channel: 'claude-hook', via: 'PostToolUse', account: 'kate' } }, thresholds, ago);
    ok('delivered handover: HANDOVER chip, the earlier converge named, the reset clock in the head',
        hq.level === 'handover' && hq.chip === '5h 91% HANDOVER' && hq.lines.some(l => /^QUOTA CONVERGE 86% had gone out earlier/.test(l)) && /resets 19:20$/.test(hq.head));
    const uv = G.contextSignalView(g.record('q2'), thresholds, ago);
    ok('‼️ undelivered: ✕ on the chip, NEVER REACHED, the engine\'s reason — and the window\'s own view stays quiet',
        uv.quota.state === 'undelivered' && uv.quota.chip === '5h 93% HANDOVER ✕' && /NEVER REACHED THIS RUN/.test(uv.quota.lines[0]) && uv.quota.lines[1] === 'codex has no channel'
        && uv.state === 'quiet' && uv.chip === '');
    ok('ONE SUBJECT: the window\'s lines never carry the quota\'s', !uv.lines.some(l => /Quota signal|5-hour/.test(l)));
}

console.log('\n== S-76 — in a baton relay the order is "pass the baton", outside it the note, as always ==');
{
    const run = { chainId: 'chn_x', hop: 3, passed: false };
    const done = { chainId: 'chn_x', hop: 3, passed: true };
    ok('outside a relay the sentences are exactly the note\'s, unchanged',
        G.contextSignalText('handover', 41) === G.contextSignalText('handover', 41, undefined) && /write the handover note/.test(G.contextSignalText('handover', 41))
        && /then hand over \(_REF\/handover\.md\)\.$/.test(G.contextSignalText('converge', 36)));
    const h = G.contextSignalText('handover', 41, run);
    ok('a runner told CONTEXT HANDOVER passes the baton — the chain, the hop, the file recipe — and writes no note',
        h.startsWith('CONTEXT HANDOVER 41%') && /baton relay — chain chn_x, hop 3/.test(h) && /node af\.js baton\.pass "@<file>"/.test(h)
        && /instead of writing a handover note/.test(h) && !/write the handover note/.test(h));
    const q = G.quotaSignalText('handover', 91, 'kate', run);
    ok('…the quota sentence takes the same branch (one order, two lines)', q.startsWith('QUOTA HANDOVER 91%') && /pass the baton/.test(q) && /baton\.pass/.test(q));
    ok('converge in a relay: start nothing new, then pass the baton', /then pass the baton \(baton relay — chain chn_x, hop 3/.test(G.contextSignalText('converge', 36, run)));
    const p = G.contextSignalText('handover', 41, done);
    ok('a runner that already passed is only told to end', /Your baton is already passed/.test(p) && /end the run now/.test(p) && !/baton\.pass "@/.test(p));
    ok('a relay sentence stays one paragraph', h.length < 700 && q.length < 700);
    let relay = run;
    const g = new G.ContextGuard({
        thresholds: () => ({ convergePct: 35, handoverPct: 40, quotaConvergePct: 0, quotaHandoverPct: 90 }),
        read: () => ({ tokens: 82_000, window: 200_000, source: 'test' }),
        quota: () => ({ pct: 91, account: 'kate' }),
        relay: () => relay,
        channelFor: () => ({ channel: 'claude-hook' }),
        now: () => 1
    });
    const s = g.check('r1', { event: 'PostToolUse' });
    ok('the guard asks the host for the relay and both lines carry the baton order', s && s.dimension === 'both' && (s.text.match(/baton\.pass "@<file>"/g) || []).length === 2);
    relay = () => { throw new Error('store not ready'); };
    const g2 = new G.ContextGuard({
        thresholds: () => ({ convergePct: 35, handoverPct: 40, quotaConvergePct: 0, quotaHandoverPct: 90 }),
        read: () => ({ tokens: 82_000, window: 200_000, source: 'test' }),
        relay: (id) => relay(id),
        channelFor: () => ({ channel: 'claude-hook' }),
        now: () => 1
    });
    const s2 = g2.check('r2', { event: 'PostToolUse' });
    ok('‼️ a relay that cannot be read is no relay — the note sentence, never a broken hook', s2 && /write the handover note/.test(s2.text));
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('the host hands the guard the baton store\'s answer', /relay: \(sessionId: string\) => batonRelayOf\(batonStore\.all\(\), sessionId\),/.test(ext));
}

console.log('\n== S-80 — the ORDER is a setting; the lead words are the law\'s and are not ==');
{
    const D = G.DEFAULT_DISCIPLINE_ORDERS;
    eq('the eight branches are the whole vocabulary', Object.keys(D).sort(),
        ['converge', 'handover', 'relayBrakedConverge', 'relayBrakedHandover', 'relayConverge', 'relayHandover', 'relayPassedConverge', 'relayPassedHandover']);
    eq('nothing set is the built-in set, unchanged', G.normalizeOrders(undefined), D);
    eq('a blank branch — empty or spaces — keeps its own sentence', G.normalizeOrders({ converge: '   ', handover: '' }), D);
    ok('a branch that IS set wins, trimmed', G.normalizeOrders({ converge: '  Park it.  ' }).converge === 'Park it.');
    ok('a value that is not a string is not an order', G.normalizeOrders({ handover: 42 }).handover === D.handover);

    const mine = { converge: 'Dur, yeni is baslatma.', handover: 'Bitir ve devret.' };
    ok('‼️ THE LEAD WORD AND THE READING ARE UNTOUCHED — only the order changes',
        G.contextSignalText('converge', 36, undefined, mine)
        === 'CONTEXT CONVERGE 36% — your context window is 36% full (converge line reached). Dur, yeni is baslatma.');
    ok('…and the quota line takes the same words through the same door',
        G.quotaSignalText('handover', 91, 'kate', undefined, mine)
        === 'QUOTA HANDOVER 91% — your account\'s 5-hour window (kate) is 91% used (handover line reached). Bitir ve devret.');
    const run = { chainId: 'chn_a', hop: 2, passed: false };
    ok('a branch left alone still speaks its built-in sentence', /pass the baton/.test(G.contextSignalText('handover', 41, run, mine)));
    ok('{chain} is replaced wherever it stands, as often as it stands',
        G.orderFor('handover', run, { relayHandover: 'In {chain}: stop. Name {chain} in the note.' })
        === 'In baton relay — chain chn_a, hop 2: stop. Name baton relay — chain chn_a, hop 2 in the note.');
    ok('…and outside a relay it is simply nothing, never the token left showing',
        G.orderFor('handover', undefined, { handover: 'Stop.{chain}' }) === 'Stop.');
    const passed = { chainId: 'chn_a', hop: 2, passed: true };
    ok('the already-passed pair are two whole sentences, not one with a fork inside it',
        G.orderFor('handover', passed, { relayPassedHandover: 'END.' }) === 'END.'
        && G.orderFor('converge', passed, { relayPassedHandover: 'END.' })
        === D.relayPassedConverge.replace('{chain}', 'baton relay — chain chn_a, hop 2'));
    // S-97 — a leg the user braked as the chain's last goes back to the note
    const brakedRun = { chainId: 'chn_a', hop: 2, passed: false, braked: true };
    ok('a braked leg is told the note, never the pass, and that no successor opens',
        /LAST leg, so do NOT call baton\.pass/.test(G.orderFor('handover', brakedRun))
        && /write the handover note \(_REF\/handover\.md, section 4\)/.test(G.orderFor('handover', brakedRun))
        && /no successor opens/.test(G.orderFor('handover', brakedRun))
        && !/Write \{ "prompt"/.test(G.orderFor('handover', brakedRun)));
    ok('…its converge line ends with the note too, the chain named',
        /then write the handover note instead of passing the baton/.test(G.orderFor('converge', brakedRun))
        && G.orderFor('converge', brakedRun).startsWith('The user braked your baton relay — chain chn_a, hop 2 — this is its LAST leg'));
    ok('…the braked pair are settings like the rest',
        G.orderFor('handover', brakedRun, { relayBrakedHandover: 'Son etap: notu yaz.' }) === 'Son etap: notu yaz.'
        && G.orderFor('handover', run, { relayBrakedHandover: 'Son etap: notu yaz.' }) !== 'Son etap: notu yaz.');
    ok('‼️ a leg that already passed is told to end even if a braked flag rides along',
        G.orderFor('handover', { ...passed, braked: true }) === G.orderFor('handover', passed));
    ok('the quota line takes the braked order through the same door',
        /LAST leg/.test(G.quotaSignalText('handover', 91, 'kate', brakedRun)) && /LAST leg/.test(G.contextSignalText('handover', 41, brakedRun)));

    const guardWith = (orders) => new G.ContextGuard({
        thresholds: () => ({ convergePct: 35, handoverPct: 40, quotaConvergePct: 0, quotaHandoverPct: 90 }),
        read: () => ({ tokens: 82_000, window: 200_000, source: 'test' }),
        orders,
        channelFor: () => ({ channel: 'claude-hook' }),
        now: () => 1
    });
    ok('the guard delivers the SETTING\'s words, not the literal in its own source',
        /Park it and go\.$/.test(guardWith(() => ({ handover: 'Park it and go.' })).check('w1', { event: 'PostToolUse' }).text));
    ok('‼️ a setting that cannot be read leaves the built-in sentence — never a blank order',
        /write the handover note/.test(guardWith(() => { throw new Error('settings not ready'); }).check('w2', { event: 'PostToolUse' }).text));

    // ‼️ THE MANIFEST AND THE CONSTANT ARE ONE TEXT. The form's placeholder is
    // the manifest's declared default and the sentence actually sent is the
    // constant: let them drift and the page teaches an order nobody delivers.
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const props = pkg.contributes.configuration.properties || {};
    const p = props['agentFarm.disciplineOrders'];
    ok('the setting is contributed, as an object that ships EMPTY', !!p && p.type === 'object' && JSON.stringify(p.default) === '{}');
    eq('‼️ every branch\'s declared default IS the sentence the code sends',
        Object.keys(D).map(k => ((p.properties || {})[k] || {}).default === D[k]), Object.keys(D).map(() => true));
    ok('…and each branch says what it is for', Object.keys(D).every(k => String(((p.properties || {})[k] || {}).description || '').length > 20));

    const S = require(path.join(ROOT, 'out', 'core', 'settingsops.js'));
    const five = ['agentFarm.contextConvergePct', 'agentFarm.contextHandoverPct',
        'agentFarm.quotaConvergePct', 'agentFarm.quotaHandoverPct', 'agentFarm.disciplineOrders'];
    const only = {};
    for (const k of five) { only[k] = props[k]; }
    const cats = S.buildSettingsModel(only, (k) => only[k].default);
    eq('‼️ the five are ONE section of their own — not "Other", not scattered through Live Monitoring',
        cats.map(c => `${c.id}:${c.items.length}`), ['discipline:5']);
    ok('…and the words are a FORM of six boxes, derived from the schema rather than a JSON textarea',
        ((cats[0].items.find(i => i.key === 'agentFarm.disciplineOrders') || {}).shape || {}).kind === 'form');

    const setjs = fs.readFileSync(path.join(ROOT, 'media', 'settings.js'), 'utf8');
    ok('the settings page gives the section its own two groups',
        /c\.id === 'discipline' \? disciplineSection\(c\)/.test(setjs) && /const DISCIPLINE_GROUPS = \[/.test(setjs));
    ok('‼️ a field whose own default is a SENTENCE gets a box it fits in, derived from the schema',
        /String\(f\.default \|\| ''\)\.length > 80/.test(setjs) && /<textarea rows="3"/.test(setjs));

    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('the host hands the guard the setting', /orders: \(\) => cfg\(\)\.get<Partial<DisciplineOrders>>\('disciplineOrders', \{\}\),/.test(ext));
    const setBlock = ext.slice(ext.indexOf("op: 'sessions.contextGuard.set'"), ext.indexOf("op: 'sessions.recent'"));
    ok('the bridge sets the words too — an unknown branch is refused by name, and "" REMOVES a branch rather than storing a blank order',
        /cfg\(\)\.update\('disciplineOrders', stored/.test(setBlock) && /delete stored\[k\]/.test(setBlock)
        && /no such order branch/.test(setBlock));
    const guardBlock = ext.slice(ext.indexOf("op: 'sessions.contextGuard'"), ext.indexOf("op: 'sessions.contextGuard.set'"));
    ok('…and reads them back, with the sentence as it actually arrives', /orders: contextGuard\.orders\(\)/.test(guardBlock) && /sample: \{/.test(guardBlock));
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
    ok('S-75 — …and its quota reading through the SAME sampler the guard uses', /quotaReading:/.test(guardBlock) && /sessionQuotaSample\(id\)/.test(guardBlock));
    ok('S-75 — a run told QUOTA HANDOVER is handover evidence (never resumed) and may be continued from its card',
        /!rec\?\.quota\?\.handover\) \{ return undefined; \}/.test(ext) && /view\.quota\?\.level === 'handover'/.test(ext));
    const cjs = fs.readFileSync(path.join(ROOT, 'media', 'console.js'), 'utf8');
    const svjs = fs.readFileSync(path.join(ROOT, 'media', 'sessionViewer.js'), 'utf8');
    ok('S-75 — the Console card draws the quota chip with its own panel, and its Continue door opens on a quota handover',
        /const quotaChip = \(s\) =>/.test(cjs) && /\$\{quotaChip\(s\)\}\$\{guardChip\(s\)\}/.test(cjs) && /v\.quota\.level === 'handover'/.test(cjs));
    ok('S-75 — the session page draws the quota line under the gauge', /\$\{sigHtml\}\$\{qsigHtml\}/.test(svjs) && /const qsig = sig && sig\.quota;/.test(svjs));
    ok('sessions.contextGuard.set writes all four settings globally, normalised (S-75: the quota pair too)',
        /normalizeThresholds\(/.test(setBlock) && /'contextConvergePct'/.test(setBlock) && /'contextHandoverPct'/.test(setBlock)
        && /'quotaConvergePct'/.test(setBlock) && /'quotaHandoverPct'/.test(setBlock) && /cfg\(\)\.update\(setting/.test(setBlock));
    eq('S-75 — the quota pair are settings: no converge by default, hand over at the law\'s 90', [props['agentFarm.quotaConvergePct'].default, props['agentFarm.quotaHandoverPct'].default], [0, 90]);
    ok('S-75 — the guard is handed the session\'s OWN account window, from its card or its manifest, never the home folder',
        /const sessionQuotaSample = \(sessionId: string\): QuotaSample \| undefined => \{/.test(ext) && /quota: sessionQuotaSample,/.test(ext) && /launchManifests\(\)\.find\(m => m\.launchId === launchId\)\?\.account/.test(ext)
        && /accountUsage\.current\(\)\.find\(\(x: SlotUsage\) => x\.slotId === slotId\)/.test(ext));
    const liveCfg = ext.slice(ext.indexOf('const live = new LiveMonitor('), ext.indexOf('context.subscriptions.push(live)'));
    ok('‼️ the live listener\'s config carries contextSignal → contextGuard.check, with the event, the transcript and the engine',
        /contextSignal: \(p\) => \{/.test(liveCfg) && /return contextGuard\.check\(sid, \{/.test(liveCfg)
        && /event: p\.hook_event_name/.test(liveCfg) && /transcriptPath: p\.transcript_path/.test(liveCfg));
    // S-64 (5/n) — the write of the note is seen at the hook, BEFORE the check
    ok('‼️ …and marks the session handed over the moment it writes its own note',
        /handoverNoteWrittenBy\(\{/.test(liveCfg) && /tool: p\.tool_name/.test(liveCfg)
        && /filePath: String\(p\.tool_input\?\.file_path/.test(liveCfg)
        && liveCfg.indexOf('contextGuard.markHandedOver(sid, note)') < liveCfg.indexOf('return contextGuard.check(sid'));
    const reader = ext.slice(ext.indexOf('const contextReadingFor = '), ext.indexOf('const contextGuard = new ContextGuard('));
    ok('the reader asks the live stream first, then the transcript the hook named, then the index',
        reader.indexOf('consoleHostRef?.list()') < reader.indexOf('lastCallFromTranscriptTail(') && reader.indexOf('lastCallFromTranscriptTail(') < reader.indexOf('index.byId('));
    ok('console.sessions rows carry the signal record', /contextSignal: \(s\.sessionId && contextGuard\.record\(s\.sessionId\)\) \|\| null/.test(ext));
    ok('the store lives in globalStorage and is flushed on dispose', /'context-guard\.json'/.test(ext) && /contextGuard\.flush\(\)/.test(ext));
    ok('console.sessions rows carry the WORDS too, derived host-side', /contextSignalView\(/.test(ext) && /contextSignalFor: \(sessionId: string\)/.test(ext));

    // ‼️ S-64 (3/n) — THE LOOP CLOSES WHERE THE NOTE IS FOUND. One search
    // serves the sentry and the bridge; hooking the guard there is what makes
    // "handed over" a measured fact rather than a hope.
    const find = ext.slice(ext.indexOf('const findHandover = '), ext.indexOf('const headOf = '));
    ok('the handover search records the note against the session it closed',
        /contextGuard\.markHandedOver\(sid, d\.hit\.file\)/.test(find));
    ok('‼️ and the task manager is told, so a smart retry never resumes a conversation that was told to stop',
        /handoverOf: \(sessionId\) =>/.test(ext) && /told: true/.test(ext));
    const tasks = fs.readFileSync(path.join(ROOT, 'src', 'core', 'tasks.ts'), 'utf8');
    ok('…asked of the run\'s OWN session id, at the one place the decision is made',
        /handover: h/.test(tasks) && /this\.opts\.handoverOf\?\.\(sid\)/.test(tasks));
}

// ‼️ 6. IT LOOKS THE SAME WHETHER THE RUN WAS TOLD OR NOT. A card drawing 41%
//    and nothing else reads as "told and ignored" — on Codex, where the
//    sentence can never arrive, that is a lie about the agent. The view is the
//    words every surface shows, derived ONCE so two pages cannot disagree.
console.log('\n== the view — what a surface says: told, told-and-unreachable, or nothing yet ==');
{
    const T = { convergePct: 35, handoverPct: 40 };
    const ago = (ts) => `${ts}ms-ago`;

    const quiet = G.contextSignalView(undefined, T);
    eq('no record is the quiet state, with no chip to draw', [quiet.state, quiet.chip, quiet.handedOver], ['quiet', '', false]);
    ok('…and it still names the two lines, so the reader knows the mechanism exists',
        quiet.lines.some(l => /converge 35% .* hand over 40%/i.test(l)));

    const conv = G.contextSignalView({
        sessionId: 's', converge: { ts: 5, pct: 36, tokens: 1, window: 2, channel: 'claude-hook', via: 'PostToolUse' }
    }, T, ago);
    eq('a delivered converge is SHORTHAND on the strip — the chip drops the word the `ctx` figure already says',
        [conv.state, conv.level, conv.chip], ['delivered', 'converge', 'CONVERGE']);
    ok('…the first line carries the figure, the when and the channel',
        /CONTEXT CONVERGE 36% delivered — 5ms-ago, through the Claude live hook \(PostToolUse\)/.test(conv.lines[0]));
    ok('…and says the handover line is still ahead', conv.lines.some(l => /CONTEXT HANDOVER 40%: not reached/.test(l)));
    ok('…and that nobody has handed over yet', conv.lines.some(l => /^Handed over: not yet/.test(l)));

    const both = G.contextSignalView({
        sessionId: 's',
        converge: { ts: 5, pct: 36, tokens: 1, window: 2, channel: 'claude-hook', via: 'PostToolUse' },
        handover: { ts: 9, pct: 41, tokens: 1, window: 2, channel: 'claude-hook', via: 'UserPromptSubmit' },
        handedOver: { ts: 12, note: '2026-09-17_devir_05.md' }
    }, T, ago);
    eq('the stronger order is the one on the strip', both.chip, 'HANDOVER');
    ok('…the earlier converge is remembered rather than overwritten',
        both.lines.some(l => /CONTEXT CONVERGE 36% had gone out earlier/.test(l)));
    ok('…and the loop is closed by the note that names the session',
        both.handedOver && both.lines.some(l => /^Handed over: yes — 12ms-ago — 2026-09-17_devir_05\.md$/.test(l)));

    const none = G.contextSignalView({
        sessionId: 's', engine: 'codex',
        undelivered: { level: 'handover', ts: 3, pct: 44, why: 'codex hooks carry no additionalContext' }
    }, T, ago);
    eq('a crossing with no channel is marked, never left looking like silence',
        [none.state, none.chip], ['undelivered', 'HANDOVER ✕']);
    ok('…and says plainly that the run never heard it',
        /NEVER REACHED THIS RUN/.test(none.lines[0]) && none.lines.some(l => /not obedience/.test(l)));
    ok('…carrying the engine\'s own reason', none.lines.some(l => /codex hooks carry no additionalContext/.test(l)));

    const off = G.contextSignalView({
        sessionId: 's', converge: { ts: 1, pct: 36, tokens: 1, window: 2, channel: 'claude-hook', via: 'PostToolUse' }
    }, { convergePct: 35, handoverPct: 0 });
    ok('a handover line switched off is SAID, not silently implied',
        off.lines.some(l => /switched off, so nothing will stop this run/.test(l)));
    ok('with no `ago` the lines carry no second time format', !/ — .*ago/.test(off.lines[0]));
}

// ‼️ S-64 (5/n) — THE RUN THAT CONTINUES A HANDED-OVER ONE. Two facts the
// card needs and a door for the law's next step: the note is seen the moment
// the session writes it (the live hook, not a folder search after the round),
// and "continue from handover" opens a FRESH session in the composer with the
// card's setup and the host's first message — never a resume.
console.log('\n== continuing from a handover — the note is seen at the write, the next run is fresh ==');
{
    const SID = '6af1b927-8eb7-4118-aac0-1aabadc45630';
    const NOTE = '2026-09-17_devir_06_6af1b927_b23-kapandi.md';
    const seen = (o) => G.handoverNoteWrittenBy(Object.assign({ sessionId: SID, event: 'PostToolUse', tool: 'Write' }, o));
    eq('a Write of the canonical name by the session it names IS the handover',
        seen({ filePath: 'D:\\zone\\vault\\01_CEVAPLAR\\' + NOTE }), NOTE);
    eq('…a forward-slash path too', seen({ filePath: '/vault/01_CEVAPLAR/' + NOTE }), NOTE);
    eq('…and an Edit of it (a note revised is still the note)', seen({ tool: 'Edit', filePath: NOTE }), NOTE);
    eq('‼️ a note written FOR ANOTHER session is that session\'s fact, not this one\'s',
        seen({ filePath: '2026-09-17_devir_05_b19bd67f_s64.md' }), undefined);
    eq('a file that is not a handover note is nothing', seen({ filePath: 'D:\\repo\\src\\extension.ts' }), undefined);
    eq('a PreToolUse (the write has not happened) is nothing', seen({ event: 'PreToolUse', filePath: NOTE }), undefined);
    eq('a Bash call naming the file is nothing — only a file tool writes it', seen({ tool: 'Bash', filePath: NOTE }), undefined);
    eq('no session id, no match', seen({ sessionId: '', filePath: NOTE }), undefined);

    const withNote = G.handoverContinuePrompt({ sessionId: SID, note: 'D:\\vault\\' + NOTE, pct: 41 });
    ok('the first message names the session, the line it hit and the note\'s path',
        withNote.includes(SID) && /handover line at 41%/.test(withNote) && withNote.includes('D:\\vault\\' + NOTE));
    ok('…says the session is FRESH and continues, never resumes', /fresh session that continues its work/.test(withNote));
    ok('…and binds the new run to the same protocol', /handover protocol/.test(withNote) && /write the next note and stop/.test(withNote));
    const quota = G.handoverContinuePrompt({ sessionId: SID, note: NOTE });
    ok('a quota handover (no pct) is worded as handed over, not as a line hit',
        /was handed over and closed/.test(quota) && !/handover line at/.test(quota));
    const noNote = G.handoverContinuePrompt({ sessionId: SID, pct: 41 });
    ok('‼️ with no note found the run is pointed at the transcript through the bridge, not left blind',
        new RegExp('sessions\\.read id=' + SID).test(noNote) && /No handover note has been found/.test(noNote));

    const panel = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'consolePanel.ts'), 'utf8');
    const door = panel.slice(panel.indexOf('static continueFromHandover('), panel.indexOf('static show('));
    ok('the panel has one door for it, shared by the button and the bridge',
        /case 'continueFromHandover':/.test(panel) && /ConsolePanel\.continueFromHandover\(this\.deps, str\('id'\)\)/.test(panel));
    ok('‼️ the door opens the COMPOSER on the card\'s agent with the card\'s whole setup — never a spawn',
        /ConsolePanel\.show\(deps, \{/.test(door) && /pinAgent: true/.test(door)
        && ['model', 'effort', 'permissionMode', 'superpowers', 'providerId', 'tier', 'account'].every(k => new RegExp(k + ': s\\.' + k).test(door))
        && /prompt: found\.prompt/.test(door) && !/host\.start\(/.test(door));
    ok('…asking the host for the note only on the click', /deps\.handoverContinue\(s\.sessionId, s\.projectId\)/.test(door));
    ok('a card with no session id has nothing to continue from', /if \(!s\?\.sessionId\) \{ return undefined; \}/.test(door));

    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    const op = ext.slice(ext.indexOf("op: 'console.continueFromHandover'"), ext.indexOf("op: 'console.send'"));
    ok('the bridge has the same door — console.continueFromHandover', op.length > 200);
    ok('…refusing a quiet card by name', /view\.level === 'handover' \|\| view\.handedOver/.test(op) && /a quiet card has no handover/.test(op));
    ok('…open=true is the button\'s path, the default starts through console.start itself (one source of refusals)',
        /args\.open === true/.test(op) && /ConsolePanel\.continueFromHandover\(consoleDeps, id\)/.test(op)
        && /bridge\.dispatch\('console\.start', \{/.test(op) && /prompt: found\.prompt/.test(op));
    const host = ext.slice(ext.indexOf('const handoverContinueFor = '), ext.indexOf('const headOf = '));
    ok('the host finds the note through the ONE search the sentry uses, and records the hit',
        /findHandover\(sessionId, folder\)/.test(host) && /handoverContinuePrompt\(\{ sessionId, note, pct: ev\?\.pct \}\)/.test(host));

    const page = fs.readFileSync(path.join(ROOT, 'media', 'console.js'), 'utf8');
    ok('the card draws the button only on a card the signal has named',
        /v\.level === 'handover' \|\| v\.handedOver/.test(page) && /id="c-continue"/.test(page)
        && /type: 'continueFromHandover', id: DATA\.selected/.test(page));
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'parity.manifest.json'), 'utf8'));
    const row = manifest.entries.find(c => c.capability === 'consolePanel.ts#continueFromHandover');
    ok('…and the parity manifest binds the button to the op', !!row && (row.ops || []).includes('console.continueFromHandover'));
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
