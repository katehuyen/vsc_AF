// X-478 (X-461) — THE WEEKLY LINE. The account's week is a handover trigger on
// its own setting, kept apart from the five-hour line: one order per crossing,
// named as the weekly window, a quota pass for the relay (no stay), and the
// misplaced alarm reads the week's first reading too.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const W = require(path.join(ROOT, 'out', 'core', 'quotaWeek.js'));
const G = require(path.join(ROOT, 'out', 'core', 'contextGuard.js'));
const C = require(path.join(ROOT, 'out', 'core', 'passCause.js'));
const F = require(path.join(ROOT, 'out', 'core', 'usageFloor.js'));
const M = require(path.join(ROOT, 'out', 'core', 'misplaced.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

console.log('\n== the step ==');
{
    const w = {};
    ok('under the line: nothing to say, the reading kept', W.weekStep(w, { pct: 80 }, 98, 1).say === false && w.lastPct === 80);
    ok('at the line: the order is due', W.weekStep(w, { pct: 98 }, 98, 2).say === true);
    w.handover = { ts: 2, pct: 98, channel: 'claude-hook', account: 'kate' };
    ok('said once: the same week says nothing again', W.weekStep(w, { pct: 99 }, 98, 3).say === false);
    ok('the week turned over (a reading under the line) re-arms it', W.weekStep(w, { pct: 5 }, 98, 4).say === false && !w.handover && W.weekStep(w, { pct: 98 }, 98, 5).say === true);
    ok('0 turns the line off', W.weekStep({}, { pct: 100 }, 0, 1).say === false);
}

console.log('\n== the guard ==');
{
    let quota;
    const t = { convergePct: 35, handoverPct: 40, quotaConvergePct: 0, quotaHandoverPct: 90, quotaWeeklyHandoverPct: 98 };
    const mk = (tt, ch) => new G.ContextGuard({ thresholds: () => tt, read: () => undefined, quota: () => quota, channelFor: () => ch || { channel: 'claude-hook' }, now: () => 5000 });
    const g = mk(t);
    const post = id => g.check(id, { event: 'PostToolUse' });
    quota = { pct: 30, account: 'kate', week: { pct: 97 } };
    ok('a week under its line: silent, the first reading keeps the week', post('w1') === undefined && g.record('w1').quota.first.week === 97 && g.record('w1').quota.first.weekLine === 98);
    quota = { pct: 31, account: 'kate', week: { pct: 98, resetsAt: 9e12 } };
    const s = post('w1');
    ok('‼️ the week at its line: QUOTA HANDOVER, naming the WEEKLY window (never the five-hour one)',
        s && s.level === 'handover' && s.dimension === 'quota' && /^QUOTA HANDOVER 98% — your account's weekly window \(kate\) is 98% used/.test(s.text) && !/5-hour/.test(s.text));
    ok('…recorded on the week alone: the five-hour line is untouched', g.record('w1').quota.week.handover.pct === 98 && !g.record('w1').quota.handover && g.record('w1').quota.lastPct === 31);
    ok('…and said once', post('w1') === undefined);
    quota = { pct: 92, account: 'kate', week: { pct: 99 } };
    const both = post('w2');
    ok('both lines on one turn: one handover carrying both sentences', both && both.level === 'handover' && /5-hour window/.test(both.text) && /weekly window/.test(both.text));
    const off = mk(Object.assign({}, t, { quotaWeeklyHandoverPct: 0 }));
    quota = { pct: 10, account: 'kate', week: { pct: 100 } };
    ok('the weekly line off: silent however full the week', off.check('w3', { event: 'PostToolUse' }) === undefined);
    const none = mk(t, { channel: 'none', why: 'no hooks' });
    none.check('w4', { event: 'PostToolUse' });
    ok('an engine with no channel: the crossing is said to be undelivered, never lost', none.record('w4').quota.week.undelivered && none.record('w4').quota.week.undelivered.pct === 100);
    quota = { pct: 10, account: 'kate' };
    ok('no week published: nothing about it', post('w5') === undefined && !g.record('w5').quota.week);
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).contributes.configuration;
    const props = Object.assign({}, ...(Array.isArray(pkg) ? pkg : [pkg]).map(c => c.properties || {}));
    ok('the default is the box\'s, read from its flex point (the user asked for 98)', G.DEFAULT_CONTEXT_THRESHOLDS.quotaWeeklyHandoverPct === props['agentFarm.quotaWeeklyHandoverPct'].default && props['agentFarm.quotaWeeklyHandoverPct'].default === 98);
}

console.log('\n== the pass, the figure, the alarm ==');
{
    const base = { slot: 'kate', readings: { 'agent-farm': 20 }, quotaHandoverPct: 90, contextHandoverPct: 40 };
    const c = C.passCause(Object.assign({}, base, { week: { readings: { 'agent-farm': 98 }, line: 98 } }));
    ok('‼️ a pass on a spent week is the QUOTA\'s: the successor never stays there', c.kind === 'quota' && c.weekPct === 98 && /weekly window/.test(c.why) && C.starvedOf(c));
    ok('…the guard\'s week counts like Agent Farm\'s', C.passCause(Object.assign({}, base, { week: { readings: { guard: 99 }, line: 98 } })).kind === 'quota');
    ok('…under its line it is not', C.passCause(Object.assign({}, base, { week: { readings: { 'agent-farm': 97 }, line: 98 } })).kind === 'early');
    ok('…and a line that is off judges nothing', C.passCause(Object.assign({}, base, { week: { readings: { 'agent-farm': 100 }, line: 0 } })).kind === 'early');
    const now = Date.now();
    const u = (bars, extra) => Object.assign({ slotId: 'a', engine: 'claude', state: 'ok', percent: 50, resetsAt: now + 1e6, plan: 'max', fetchedAt: now, bars }, extra || {});
    ok('weekNow reads the all-models week', F.weekNow(u([{ id: 'five_hour', percent: 10, resetsAt: now + 1e6 }, { id: 'seven_day', percent: 64, resetsAt: now + 1e8 }])) === 64);
    ok('…a turned-over week reads fresh, a walled floor reads full', F.weekNow(u([{ id: 'seven_day', percent: 64, resetsAt: now - 1 }])) === 0
        && F.weekNow(u([], { state: 'error', floor: { percent: 100, resetsAt: now + 1e6, bars: [], fetchedAt: now, walled: true } })) === 100);
    ok('…and a per-model week is not the week', F.weekNow(u([{ id: 'seven_day_opus', percent: 99, resetsAt: now + 1e8 }])) === -1);
    const m = M.misplacedVerdict({ pct: 20, ts: 1, account: 'kate', line: 90, week: 99, weekLine: 98 }, { value: 70, why: 'the Account ceiling' });
    ok('a leg whose FIRST reading had a spent week was misplaced, and the record says it was the week', m && m.window === 'week' && m.pct === 99 && m.line === 98 && /weekly window/.test(m.why));
}

console.log('\n== the host wiring ==');
{
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    const place = fs.readFileSync(path.join(ROOT, 'src', 'launch', 'accountPlacement.ts'), 'utf8');
    ok('the guard\'s sample carries the all-models week, and its line is the setting',
        /const week = \(u\.bars \?\? \[\]\)\.find\(b => b\.id === SEVEN_DAY/.test(ext) && /quotaWeeklyHandoverPct: cfg\(\)\.get<number>\('quotaWeeklyHandoverPct', DEFAULT_CONTEXT_THRESHOLDS\.quotaWeeklyHandoverPct\)/.test(ext));
    ok('sessions.contextGuard.set sets the weekly line like the five-hour one',
        /quotaWeeklyHandoverPct: optNum\(args, 'quotaWeeklyHandoverPct', cur\.quotaWeeklyHandoverPct\)/.test(ext) && /\['quotaWeeklyHandoverPct', 'quotaWeeklyHandoverPct'\]/.test(ext));
    ok('the pass reads the week three ways against its own line',
        /'agent-farm': weekNow\(u\),/.test(place) && /guard: g\.quota\.week\.lastPct/.test(place) && /line: d\.setting<number>\('quotaWeeklyHandoverPct'/.test(place));
}

console.log(`test_quota_week: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
