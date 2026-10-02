// X-479 (X-461) — THE WEEK HAS ITS OWN WALL. Every start judged the fuller of
// the five-hour window and the all-models week against the Account ceiling, so
// an account past the ceiling on its week alone sat unused for days. Now the
// five-hour figure meets the Account ceiling and the week meets the weekly
// Account ceiling (never above the weekly handover line); a bare number still
// walls both alike, and a week at its limit is never picked (X-309).
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const out = m => require(path.join(ROOT, 'out', 'core', m + '.js'));
const W = out('wall'), F = out('usageFloor'), U = out('accountUsage'), P = out('accountPolicy');
const S = out('startRoom'), Y = out('stayAccount'), B = out('quotaBrake'), M = out('misplaced');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const NOW = Date.UTC(2026, 9, 2, 12, 0, 0);
const HOUR = 3600 * 1000;
const slot = (id, five, week, o = {}) => Object.assign({
    slotId: id, engine: 'claude', state: 'ok', percent: Math.max(five, week), resetsAt: NOW + 2 * HOUR, fetchedAt: NOW - 60000, plan: 'max',
    bars: [{ id: 'five_hour', percent: five, resetsAt: NOW + 2 * HOUR }, { id: 'seven_day', percent: week, resetsAt: NOW + 72 * HOUR }]
}, o);
const SPLIT = { value: 70, week: 95 };

console.log('\n== the wall ==');
{
    ok('a bare number walls both windows alike', W.wallParts(70).five === 70 && W.wallParts(70).week === 70);
    ok('a wall object carries the week\'s own', W.wallParts(SPLIT).five === 70 && W.wallParts(SPLIT).week === 95 && W.wallParts({ value: 60 }).week === 60);
    ok('an own wall replaces the five-hour figure and keeps the week; a bare number stays a bare number',
        JSON.stringify(W.withFive(SPLIT, 80)) === JSON.stringify({ value: 80, week: 95 }) && W.withFive(70, 80) === 80);
    ok('said plainly: a number as before, a split wall names the week', W.wallText(70) === '70%' && W.wallText(SPLIT) === '70% (week 95%)');
    ok('wallOr takes a number or a wall, else its fallback', W.wallOr(SPLIT, 100) === SPLIT && W.wallOr(80, 100) === 80 && W.wallOr(undefined, 100) === 100 && W.wallOr('x', 100) === 100);
}

console.log('\n== the figures ==');
{
    const u = slot('a', 20, 85);
    const s = F.splitNow(u, NOW);
    ok('splitNow reads the five-hour window and the week apart', s.five === 20 && s.week === 85);
    ok('…and percentNow is still the fuller of the two', F.percentNow(u, NOW) === 85);
    ok('a turned-over week reads fresh', F.splitNow(slot('a', 20, 85, { bars: [{ id: 'five_hour', percent: 20, resetsAt: NOW + HOUR }, { id: 'seven_day', percent: 85, resetsAt: NOW - 1 }] }), NOW).week === 0);
    ok('a reading with no bars is the five-hour figure alone (an engine\'s own window)', F.splitNow(slot('a', 0, 0, { percent: 64, bars: [] }), NOW).five === 64 && F.splitNow(slot('a', 0, 0, { percent: 64, bars: [] }), NOW).week === -1);
    ok('Codex windows are never the week', F.splitNow(slot('c', 0, 0, { engine: 'codex', percent: 80, bars: [{ id: 'codex_primary', percent: 80, resetsAt: NOW + HOUR }] }), NOW).week === -1);
    ok('a wall in force is full on both windows', F.splitNow(slot('a', 10, 10, { state: 'error', floor: { percent: 100, resetsAt: NOW + HOUR, bars: [], fetchedAt: NOW, walled: true } }), NOW).week === 100);
    ok('a per-model week is left out, as before', F.splitNow(slot('a', 20, 30, { bars: [{ id: 'five_hour', percent: 20, resetsAt: NOW + HOUR }, { id: 'seven_day_opus', percent: 99, resetsAt: NOW + HOUR }] }), NOW).week === -1);
}

console.log('\n== may a session start ==');
{
    const u = slot('a', 20, 85);
    ok('‼️ the bug: a bare 70 wall refused an account at 20% of its five hours for its week at 85', !U.slotIsUsable(u, 70, NOW));
    ok('‼️ the split wall starts it: five 20 < 70, week 85 < 95', U.slotIsUsable(u, SPLIT, NOW));
    ok('‼️ X-309 holds: a week at its limit is never usable, whatever the five hours say', !U.slotIsUsable(slot('a', 0, 100), SPLIT, NOW) && !U.slotIsUsable(slot('a', 5, 95), SPLIT, NOW));
    ok('the five-hour window still meets the Account ceiling', !U.slotIsUsable(slot('a', 70, 10), SPLIT, NOW));
    const order = U.roomOrder([slot('A', 10, 90), slot('B', 50, 20), slot('C', 5, 100)], SPLIT, NOW).map(x => x.slotId);
    ok('the emptiest still leads (by the fuller window), and a spent week is out of the line', JSON.stringify(order) === '["B","A"]');
    ok('accountOrder and pickAccount take the same wall', U.pickAccount([slot('A', 10, 90), slot('C', 5, 100)], { ceiling: SPLIT, now: NOW }).slotId === 'A');
    const held = slot('a', 20, 96);
    ok('back at the week\'s turnover when the week holds it', F.backAt(held, SPLIT, NOW) === NOW + 72 * HOUR && F.backAt(slot('a', 20, 85), SPLIT, NOW) === 0);
    ok('nextResetAt reads the same', U.nextResetAt([held], SPLIT, NOW) === NOW + 72 * HOUR);
}

console.log('\n== the wall in force ==');
{
    const w = S.startWall({ setting: 70, handoverPct: 90, weekSetting: 95, weekHandoverPct: 98 });
    ok('the weekly Account ceiling is the week\'s wall, and is named', w.value === 70 && w.week === 95 && /defaultAccountWeeklyCeiling/.test(w.weekWhy));
    const capped = S.startWall({ setting: 70, handoverPct: 90, weekSetting: 99, weekHandoverPct: 98 });
    ok('‼️ never above the weekly handover line (99 -> 98)', capped.week === 98 && /weekly handover line/.test(capped.weekWhy));
    ok('the weekly handover line off leaves the box alone', S.startWall({ setting: 70, handoverPct: 90, weekSetting: 99, weekHandoverPct: 0 }).week === 99);
    ok('an own wall replaces the five-hour figure, the week keeps its own', S.startWall({ setting: 70, handoverPct: 90, own: 80, ownWhy: 'the campaign\'s wall', weekSetting: 95, weekHandoverPct: 98 }).week === 95);
    ok('no weekly box handed in: the old shape (no week)', S.startWall({ setting: 70, handoverPct: 90 }).week === undefined);
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).contributes.configuration;
    const props = Object.assign({}, ...(Array.isArray(pkg) ? pkg : [pkg]).map(c => c.properties || {}));
    ok('the default is the box\'s, read from its flex point (95)', S.ACCOUNT_WEEKLY_DEFAULT === props['agentFarm.defaultAccountWeeklyCeiling'].default && S.ACCOUNT_WEEKLY_DEFAULT === 95
        && S.weeklyCeiling(undefined, 98).value === 95);
    const yes = S.startRoom(slot('a', 20, 85), w, NOW);
    ok('a start under both walls says both figures', yes.ok && /20% of its window, under the 70% wall/.test(yes.why) && /its week 85%, under the 95% weekly wall/.test(yes.why));
    const no = S.startRoom(slot('a', 20, 96), w, NOW);
    ok('a start refused by its week says the week', !no.ok && /96% of its weekly window, at or past the 95% weekly wall \(95% — defaultAccountWeeklyCeiling\)/.test(no.why));
    ok('a start refused by its five hours says the five hours', /75% of its window, at or past the 70% wall/.test(S.startRoom(slot('a', 75, 20), w, NOW).why));
}

console.log('\n== the policies, the stay, the carry ==');
{
    const world = o => Object.assign({ engine: 'claude', usage: [slot('a', 20, 85)], ceiling: 70, handoverPct: 90, now: NOW }, o);
    ok('‼️ @emptiest picks the account whose week alone is past the Account ceiling', P.resolvePolicy('@emptiest', world({ weekCeiling: 95 })).id === 'a');
    ok('…and without a weekly wall handed in it refuses as before', !!P.resolvePolicy('@emptiest', world({})).refusal);
    ok('…a refusal names both walls', /at or past 70% \(week 95%\)/.test(P.resolvePolicy('@emptiest', world({ weekCeiling: 95, usage: [slot('a', 20, 97)] })).refusal || ''));
    const rule = { name: 'night', chain: [{ account: 'a' }], ceiling: 80 };
    ok('a rule\'s own wall is the five-hour one; the week keeps the weekly wall', P.resolvePolicy('@night', world({ weekCeiling: 95, policies: [rule], stored: ['a'], usage: [slot('a', 75, 90)] })).id === 'a'
        && P.resolvePolicy('@night', world({ weekCeiling: 95, policies: [rule], stored: ['a'], usage: [slot('a', 75, 96)] })).id !== 'a');
    const sw = { value: 70, why: '70% — defaultAccountCeiling', week: 95, weekWhy: '95% — defaultAccountWeeklyCeiling' };
    const stay = (week) => Y.stayOnAccount({ stayPct: 90, slotId: 'a', percent: 20, quotaHandover: false, wall: sw, week, now: NOW });
    ok('the stay stays on a week under its wall', stay(85).stay === true);
    ok('‼️ …and leaves a week at or past it, saying so', stay(96).stay === false && /week is at 96%, at or past the 95% weekly wall/.test(stay(96).why));
    ok('a wall with no week of its own: the stay judges as before', Y.stayOnAccount({ stayPct: 90, slotId: 'a', percent: 20, quotaHandover: false, wall: { value: 70, why: 'w' }, week: 99, now: NOW }).stay === true);
    const carry = c => U.carryOnAccount({ from: 'x', engine: 'claude', usage: [slot('x', 100, 50), slot('b', 20, 85)], ceiling: c, waitUntil: NOW + 2 * HOUR, now: NOW, want: 'b' });
    ok('a run carried to a named account obeys the split wall', carry(SPLIT).slotId === 'b' && !carry(70).slotId);
}

console.log('\n== the brake, the alarm ==');
{
    const brake = (u, o) => B.quotaBrake(Object.assign({ guard: 0, handover: 90, weekLine: 98, stated: 'a', resolve: () => ({ id: 'a' }), usageOf: () => u, machinePct: () => undefined }, o || {}));
    const wk = brake({ percent: 20, week: 98, known: true });
    ok('‼️ a row on a slot at its weekly handover line is held, naming the WEEKLY window', wk && wk.basis === 'account' && /98% of a's weekly window, at or past 98%/.test(wk.reason) && !/5h/.test(wk.reason));
    ok('a week under its line holds nothing, and a full week is never called a full five-hour window', brake({ percent: 20, week: 97, known: true }) === undefined);
    ok('the weekly line holds even with the guard and the handover line off', !!brake({ percent: 20, week: 99, known: true }, { handover: 0 }));
    ok('the five-hour line still holds on its own figure', /5h window, at or past 90%/.test((brake({ percent: 91, week: 10, known: true }) || {}).reason || ''));
    const m = M.misplacedVerdict({ pct: 20, ts: 1, account: 'kate', line: 90, week: 99, weekLine: 98 }, { value: 70, why: 'a', week: 95, weekWhy: '95% — defaultAccountWeeklyCeiling' });
    ok('the misplaced alarm names the weekly wall for a spent week', m && m.wall === 95 && /weekly wall in force was 95%/.test(m.why));
}

console.log('\n== the host wiring ==');
{
    const src = f => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8').replace(/\r\n/g, '\n');
    const place = src('launch/accountPlacement.ts'), ext = src('extension.ts');
    ok('the Account ceiling carries the weekly box and the weekly handover line',
        /weekSetting: boxOf\('defaultAccountWeeklyCeiling', 'accounts\.defaultWeeklyCeiling'\),/.test(place)
        && /weekHandoverPct: d\.setting<number>\('quotaWeeklyHandoverPct', DEFAULT_CONTEXT_THRESHOLDS\.quotaWeeklyHandoverPct\)/.test(place));
    ok('the policy world carries the week\'s wall', /weekCeiling: accountCeiling\(\)\.week,/.test(place));
    ok('the brake reads the five hours and the week apart, the week against its own line',
        /return u && s \? \{ percent: s\.five, week: s\.week,/.test(ext) && /weekLine: cfg\(\)\.get<number>\('quotaWeeklyHandoverPct', DEFAULT_CONTEXT_THRESHOLDS\.quotaWeeklyHandoverPct\),/.test(ext));
    ok('accounts.status and accounts.policies say the weekly wall', /weekCeiling: wall\.week \?\? ceiling, weekCeilingWhy: wall\.weekWhy \?\? wall\.why,/.test(ext) && /weekCeiling: accountCeiling\(\)\.week,\n\s*weekCeilingWhy: accountCeiling\(\)\.weekWhy/.test(ext));
    ok('the carry hands the whole wall, never its five-hour figure alone', /: undefined\),\n/.test(src('core/tasks.ts')) && !/the campaign\\'s wall' \} : undefined\)\.value/.test(src('core/tasks.ts')));
}

console.log(`test_weekly_ceiling: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
