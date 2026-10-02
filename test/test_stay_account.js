// S-106 — a handover that is not the quota's stays on its account while that account has room
// (src/core/stayAccount.ts): the verdict, the line on the flex chain, the relay's next leg (the door,
// the pool kept for later legs) and the sentry's next round (sentryDriver.ts), and the wiring.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'out', 'core');
const S = require(path.join(OUT, 'stayAccount.js'));
const W = require(path.join(OUT, 'startRoom.js'));
const D = require(path.join(OUT, 'batonDoor.js'));
const B = require(path.join(OUT, 'baton.js'));
const { sentryStep } = require(path.join(OUT, 'sentryDriver.js'));
const { newSentry } = require(path.join(OUT, 'sentryCampaign.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const NOW = Date.UTC(2026, 8, 28, 1, 0, 0);
const MIN = 60 * 1000;

console.log('\n== the verdict ==');
{
    const v = o => S.stayOnAccount(Object.assign({ stayPct: 60, slotId: 'claude-kate', percent: 40, resetsAt: NOW + 90 * MIN, quotaHandover: false, now: NOW }, o));
    const a = v();
    ok('‼️ a context handover on an account at 40% under a 60% line: the successor STAYS on it', a.stay === true && a.slotId === 'claude-kate' && /40%.*under the 60% line/.test(a.why));
    ok('at 59% it still stays', v({ percent: 59 }).stay === true);
    ok('‼️ at the line (60%) or above, the pool picks', v({ percent: 60 }).stay === false && v({ percent: 61 }).stay === false && /not under/.test(v({ percent: 61 }).why));
    ok('‼️ the handover was the QUOTA\'s: the pool picks, however low the reading', v({ quotaHandover: true, percent: 5 }).stay === false && /quota/.test(v({ quotaHandover: true }).why));
    ok('‼️ X-462 — the plan limit WALLED the run on that slot: the pool picks, however low its stale figure reads', v({ walled: true, percent: 5 }).stay === false && /plan limit walled/.test(v({ walled: true }).why));
    ok('‼️ 0 = off (the spec\'s single switch)', v({ stayPct: 0, percent: 1 }).stay === false && /off/.test(v({ stayPct: 0 }).why));
    ok('the main sign-in: nothing to stay on', v({ slotId: '' }).stay === false);
    ok('an unmeasured window never stays', v({ percent: -1 }).stay === false && v({ percent: undefined }).stay === false);
    ok('a window that has already reset counts as fresh (0%)', v({ percent: 97, resetsAt: NOW - MIN }).stay === true && /reset/.test(v({ percent: 97, resetsAt: NOW - MIN }).why));
}

console.log('\n== X-470 — a stay is a START: it obeys the wall every start obeys ==');
{
    // the user's own settings on 2026-10-02: Account ceiling 70, quota handover 90, stay line 90
    const wall = W.startWall({ setting: 70, handoverPct: 90 });
    const v = o => S.stayOnAccount(Object.assign({ stayPct: 90, slotId: 'claude-wmmuratvural', percent: 40, resetsAt: NOW + 90 * MIN, quotaHandover: false, wall, now: NOW }, o));
    // chn_muqifjzc001n2b hop 2: c5124b6e passed on its own probe at 90 while Agent Farm read 89 and no quota order had gone out
    const hop2 = v({ percent: 89 });
    ok('‼️ chn_muqifjzc001n2b hop 2 replayed: Agent Farm at 89%, no quota order, stay line 90, wall 70 — the pool picks', hop2.stay === false && /89%/.test(hop2.why) && /70% wall every start obeys/.test(hop2.why) && /stay line 90% stands above it/.test(hop2.why));
    // chn_muptzpk5002246 leg 1: passed at 86% on murvietnam; the deleted c43a8493 replay, restored on the real wall
    const leg1 = v({ slotId: 'claude-murvietnam', percent: 86 });
    ok('‼️ chn_muptzpk5002246 leg 1 replayed: murvietnam at 86% under a 90% stay line, wall 70 — it no longer keeps the leg there', leg1.stay === false && /claude-murvietnam is at 86%/.test(leg1.why));
    ok('…at the wall itself the pool picks too', v({ percent: 70 }).stay === false);
    ok('…under the wall it still stays, and says the wall it stood under', v({ percent: 69 }).stay === true && /under the 70% wall/.test(v({ percent: 69 }).why));
    ok('a stricter stay line (60) under the wall (70) is the line in force', v({ stayPct: 60, percent: 59 }).stay === true && v({ stayPct: 60, percent: 60 }).stay === false && /under the 60% line/.test(v({ stayPct: 60, percent: 59 }).why));
    ok('the wall itself never stands above the quota handover line', W.startWall({ setting: 95, handoverPct: 90 }).value === 90
        && v({ stayPct: 95, percent: 90, wall: W.startWall({ setting: 95, handoverPct: 90 }) }).stay === false);
    ok('stayLineOf names the box that acts', S.stayLineOf(90, wall).atWall === true && S.stayLineOf(60, wall).atWall === false && S.stayLineOf(90, wall).value === 70);
}

console.log('\n== the line, on the flex chain ==');
{
    ok('‼️ nothing written: 70, from the built-in default — the rule is ON out of the box', S.stayPctOf(() => undefined).value === 70 && /built-in/.test(S.stayPctOf(() => undefined).sentence));
    ok('the user\'s value wins, 0 included (their way to turn it off)', S.stayPctOf(k => (k === 'contextHandoverStayAccountPct' ? 60 : undefined)).value === 60
        && S.stayPctOf(k => (k === 'contextHandoverStayAccountPct' ? 0 : undefined)).value === 0);
    ok('a value past 100 is refused by the resolver and the built-in 70 stands', S.stayPctOf(() => 250).value === 70);
}

console.log('\n== the relay\'s next leg ==');
{
    const from = sid => ({ sessionId: sid, agentId: 'dev', engine: 'claude', cwd: 'D:\\repo', projectId: 'prj_1', launchId: 'lch_' + sid });
    const b = {
        id: 'btn_2', chainId: 'chn_a', hop: 2, prompt: 'go on', from: from('s-leg2'),
        inherit: { model: 'opus', surface: 'console', account: 'claude-kate' },
        want: { surface: 'inherit', account: '@emptiest' }, state: 'waiting-end', why: 'w', createdAt: NOW, updatedAt: NOW
    };
    ok('without a stay the row opens on the chain\'s pool', D.successorRow(b, {}).extra.account === '@emptiest');
    const row = D.successorRow(b, { account: 'claude-kate' });
    ok('‼️ with a stay this ONE leg opens on the same slot', row.extra.account === 'claude-kate');
    ok('…and the baton itself still carries the pool', b.want.account === '@emptiest');
    const opener = Object.assign({}, b, { state: 'started', toSessionId: 's-leg3' });
    const manifest = { launchId: 'lch_s-leg3', sealedAt: NOW, requested: { model: 'opus' }, agentId: 'dev', agentName: 'developer', mechanism: 'session', cwd: 'D:\\repo', surface: 'console', account: 'claude-kate' };
    const next = B.passBaton({ prompt: 'leg 3 done', sessionId: 's-leg3', launchId: 'lch_s-leg3', manifest, prior: [opener], now: NOW });
    ok('‼️ the leg after it is placed from the POOL again, not from the slot the stay used', next.ok && next.baton.want.account === '@emptiest');
}

console.log('\n== the sentry\'s next round ==');
{
    const slot = (id, pct) => ({ slotId: id, engine: 'claude', state: 'ok', percent: pct, resetsAt: NOW + 60 * MIN, plan: 'pro', fetchedAt: NOW - MIN });
    const base = { campaign: newSentry({ project: 'prj_1', agent: 'developer' }, NOW), usage: [slot('a', 10), slot('b', 40)], next: { code: 'S-106', text: 'x', effort: 'S' }, opening: 'Take S-106.', wall: { value: 95, why: 'the campaign\'s wall' }, now: NOW };
    const plain = sentryStep(base);
    const picked = plain.round && plain.round.slotId;
    ok('without a stay the pool picks (the emptiest here)', picked === 'a');
    const stay = S.stayOnAccount({ stayPct: 60, slotId: 'b', percent: 40, quotaHandover: false, now: NOW });
    const kept = sentryStep(Object.assign({}, base, { stay }));
    ok('‼️ with a stay the round opens on the finished round\'s account', kept.round && kept.round.slotId === 'b');
    ok('…and the plan\'s reason says why', /under the 60% line/.test(kept.plan.why));
    const led = sentryStep(Object.assign({}, base, { stay, leader: { account: 'a' } }));
    ok('the leader\'s own choice still wins', led.round && led.round.slotId === 'a');
    const walled = sentryStep(Object.assign({}, base, { usage: [slot('a', 10), slot('b', 99)], stay: { stay: true, slotId: 'b', why: 'w' } }));
    ok('a stay slot past the campaign\'s ceiling is not used', walled.round && walled.round.slotId === 'a');
    const pastWall = sentryStep(Object.assign({}, base, { usage: [slot('a', 10), slot('b', 99)], leader: { account: 'b' } }));
    ok('‼️ X-471 — nor is a slot the LEADER names past the wall: the pool picks, and the reason says so',
        pastWall.round && pastWall.round.slotId === 'a' && /leader named b/.test(pastWall.plan.why) && /campaign's wall/.test(pastWall.plan.why));
    const off = sentryStep(Object.assign({}, base, { stay: { stay: false, why: 'off' } }));
    ok('a verdict that says no leaves the pool in charge', off.round && off.round.slotId === 'a');
}

console.log('\n== the wiring ==');
{
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    // X-475 — the door's account, the stay and the wall live in the placement surface
    const place = fs.readFileSync(path.join(ROOT, 'src', 'launch', 'accountPlacement.ts'), 'utf8').replace(/\r\n/g, '\n');
    ok('the door asks the stay for the predecessor\'s account, with the measured cause (X-472)', /const cause = passCauseOf\(\{ sessionId: b\.from\.sessionId, slot: was, fault: b\.fault, recorded: b\.cause \}\);\n\s*const stay = handoverStay\(was, cause\);/.test(place)
        && /const \{ stay, park \} = successorPlacement\(b, agent\.id\);/.test(ext));
    ok('…and opens the leg on it, the pool untouched', /account: stay\.stay \? stay\.slotId : b\.want\.account/.test(place) && /\.\.\.\(stay\.stay \? \{ account: stay\.slotId \} : \{\}\)/.test(ext));
    ok('‼️ X-472 — the quota reason is the measured cause, never whether an order reached the run', /quotaHandover: cause\.kind === 'quota', walled: cause\.kind === 'limit'/.test(place) && !/(contextGuard\.record\(sid\)|d\.guard\(sid\))\?\.quota\?\.handover/.test(ext + place));
    ok('the sentry step gets the finished round\'s stay, on the same verdict', /stay: handoverStay\(finishedTask\.account, passCauseOf\(\{ sessionId: successorSessionOf\(finishedTask\), slot: finishedTask\.account \}\)\)/.test(ext));
    const src = ext.replace(/\r\n/g, '\n');
    const from = place.indexOf('const handoverStay = ('), to = place.indexOf('\n    };', from);
    ok('‼️ the stay is judged under the start wall (accountCeiling → startWall)', from > 0 && to > from && place.slice(from, to).includes('wall: accountCeiling()'));
    ok('…and accountCeiling answers startWall, from a surface the host builds before the queue, so the door can ask it at any time',
        /\n    function accountCeiling\(own\?: \{ value: unknown; why: string \}\): StartWall \{/.test(place) && /return startWall\(\{ setting: set, handoverPct: handoverLine\(\)/.test(place)
        && src.indexOf('} = accountPlacement({') > 0 && src.indexOf('} = accountPlacement({') < src.indexOf('const taskManager = new TaskManager('));
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).contributes.configuration;
    const props = Object.assign({}, ...(Array.isArray(pkg) ? pkg : [pkg]).map(c => c.properties || {}));
    ok('the setting is contributed, 0–100, default 70', props['agentFarm.contextHandoverStayAccountPct'] && props['agentFarm.contextHandoverStayAccountPct'].default === 70);
}

console.log(`\ntest_stay_account: ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
