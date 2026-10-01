// S-106 — a handover that is not the quota's stays on its account while that account has room
// (src/core/stayAccount.ts): the verdict, the line on the flex chain, the relay's next leg (the door,
// the pool kept for later legs) and the sentry's next round (sentryDriver.ts), and the wiring.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'out', 'core');
const S = require(path.join(OUT, 'stayAccount.js'));
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
    const base = { campaign: newSentry({ project: 'prj_1', agent: 'developer' }, NOW), usage: [slot('a', 10), slot('b', 40)], next: { code: 'S-106', text: 'x', effort: 'S' }, opening: 'Take S-106.', now: NOW };
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
    const off = sentryStep(Object.assign({}, base, { stay: { stay: false, why: 'off' } }));
    ok('a verdict that says no leaves the pool in charge', off.round && off.round.slotId === 'a');
}

console.log('\n== the wiring ==');
{
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('the door asks the stay for the predecessor\'s account', /const stay = handoverStay\(b\.from\.sessionId, was, \{ walled: b\.fault === 'limit' \}\);/.test(ext));
    ok('…and opens the leg on it, the pool untouched', /account: stay\.stay \? stay\.slotId : b\.want\.account/.test(ext) && /\.\.\.\(stay\.stay \? \{ account: stay\.slotId \} : \{\}\)/.test(ext));
    ok('the quota reason is the guard\'s quota handover', /quotaHandover: !!\(sid && contextGuard\.record\(sid\)\?\.quota\?\.handover\), walled: !!o\.walled/.test(ext));
    ok('the sentry step gets the finished round\'s stay', /stay: handoverStay\(successorSessionOf\(finishedTask\), finishedTask\.account\)/.test(ext));
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).contributes.configuration;
    const props = Object.assign({}, ...(Array.isArray(pkg) ? pkg : [pkg]).map(c => c.properties || {}));
    ok('the setting is contributed, 0–100, default 70', props['agentFarm.contextHandoverStayAccountPct'] && props['agentFarm.contextHandoverStayAccountPct'].default === 70);
}

console.log(`\ntest_stay_account: ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
