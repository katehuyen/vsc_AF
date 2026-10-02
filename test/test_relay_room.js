// X-462 (round 2) — A RELAY SURVIVES THE QUOTA: what an account was known to be
// survives a failed read and a window reload, and a leg that ran out of room is
// not a barren one (quota delays a chain, it never ends it). Where a leg opens
// is the account policies' answer (defaultAccountCeiling). Replays the
// 2026-10-02 break of chain chn_muptzpk5002246.
//
//   node test/test_relay_room.js
'use strict';
const path = require('path');
const fs = require('fs');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'out', 'core');
const F = require(path.join(OUT, 'usageFloor.js'));
const U = require(path.join(OUT, 'accountUsage.js'));
const P = require(path.join(OUT, 'accountPolicy.js'));
const R = require(path.join(OUT, 'batonRoom.js'));
const { batonBrake } = require(path.join(OUT, 'batonBrake.js'));
const { BridgeRegistry } = require(path.join(OUT, 'bridge.js'));
const { registerBatonOps } = require(path.join(OUT, 'batonBridge.js'));
const { BatonStore } = require(path.join(OUT, 'batonStore.js'));
const { BatonRunner } = require(path.join(OUT, 'batonRunner.js'));

const MIN = 60e3, HOUR = 60 * MIN;
// 18:38Z on 2026-10-01: the moment the door placed leg 3
const NOW = Date.UTC(2026, 9, 1, 18, 38, 42);
const bar = (id, percent, resetsAt) => ({ id, window: id, short: id, percent, resetsAt });
const okRead = (slotId, five, fiveReset, week = 30, weekReset = NOW + 72 * HOUR, fetchedAt = NOW - MIN) => ({
    slotId, engine: 'claude', state: 'ok', percent: Math.max(five, week),
    resetsAt: week > five ? weekReset : fiveReset,
    bars: [bar('five_hour', five, fiveReset), bar('seven_day', week, weekReset)], plan: 'pro', fetchedAt
});

console.log('\n== the floor: what is known survives ==');
{
    const u = okRead('a', 95, NOW + 50 * MIN);
    ok('a live reading in force is its own figure', F.percentNow(u, NOW) === 95);
    ok('‼️ once its five-hour window turned over, the week still in force decides (here 30)', F.percentNow(u, NOW + 51 * MIN) === 30);
    ok('…and with every window turned over the account is fresh', F.percentNow(okRead('a', 95, NOW + MIN, 40, NOW + 2 * MIN), NOW + 3 * MIN) === 0);
    const failed = { slotId: 'a', engine: 'claude', state: 'error', percent: -1, resetsAt: 0, plan: 'pro', fetchedAt: NOW, note: '429' };
    ok('an unread or failed reading with nothing behind it is unknown (-1) — still room by the doctrine', F.percentNow(failed, NOW) === -1 && U.slotIsUsable(failed, 90, NOW));
    const kept = F.withFloor(failed, F.floorOf(u));
    ok('‼️ a FAILED read keeps the floor of the good one before it: 95%, not "unmeasured"', F.percentNow(kept, NOW) === 95 && !U.slotIsUsable(kept, 90, NOW));
    ok('…until that window turns over', U.slotIsUsable(kept, 90, NOW + 51 * MIN));
    ok('a newer good reading replaces the floor', F.withFloor(okRead('a', 20, NOW + HOUR, 30, NOW + 72 * HOUR, NOW + MIN), F.floorOf(u)).floor === undefined);
    const wall = F.wallFloor(okRead('a', 70, NOW + 40 * MIN, 92, NOW + 72 * HOUR), NOW);
    const walled = F.withFloor(okRead('a', 70, NOW + 40 * MIN, 92, NOW + 72 * HOUR, NOW - MIN), wall);
    ok('‼️ the plan limit: full (100) until the five-hour turnover, whatever the older figure said', F.percentNow(walled, NOW) === 100 && wall.resetsAt === NOW + 40 * MIN);
    ok('…and after it the week it carried still holds (92)', F.percentNow(walled, NOW + 41 * MIN) === 92);
    ok('a wall with no turnover known lasts the longest a window can', F.wallFloor(undefined, NOW).resetsAt === NOW + F.LONGEST_WINDOW_MS);
    ok('fiveHourNow reads the five-hour window alone (the handover law\'s figure)', F.fiveHourNow(okRead('a', 49, NOW + HOUR, 99), NOW) === 49 && F.fiveHourNow(walled, NOW) === 100);
    const two = okRead('b', 95, NOW + 50 * MIN, 92, NOW + 72 * HOUR);
    ok('‼️ an account is back only when EVERY window holding it at the wall has turned over', F.backAt(two, 90, NOW) === NOW + 72 * HOUR);
    ok('nextResetAt is the first account back', U.nextResetAt([two, okRead('c', 96, NOW + 20 * MIN)], 90, NOW) === NOW + 20 * MIN);
}

console.log('\n== the floor through the service: a 429 and a reload ==');
(async () => {
    const slot = { id: 'claude-aicozums', engine: 'claude', dir: 'C:/s/aicozums' };
    const disk = {};
    const memory = { load: () => JSON.parse(JSON.stringify(disk.floors || {})), save: f => { disk.floors = JSON.parse(JSON.stringify(f)); } };
    let reply = { status: 200, body: JSON.stringify({ five_hour: { utilization: 95, resets_at: new Date(NOW + 50 * MIN).toISOString() }, seven_day: { utilization: 38, resets_at: new Date(NOW + 72 * HOUR).toISOString() } }) };
    let clock = NOW - 10 * MIN;
    const mkService = () => new U.AccountUsageService({
        slots: () => [slot], ttlMs: () => 0, now: () => clock, memory,
        readCreds: () => ({ token: 't', expiresAt: 9e15, refreshToken: 'r', plan: 'pro' }),
        fetchImpl: async () => reply
    });
    const one = mkService();
    await one.refresh('user');
    const first = one.current()[0];
    ok('a good read lands as itself (95% of five hours)', first.state === 'ok' && F.percentNow(first, NOW) === 95);
    ok('…and its floor is written to the memory', disk.floors && disk.floors['claude-aicozums'] && disk.floors['claude-aicozums'].percent === 95);
    reply = { status: 429, body: '{}', headers: {} };
    clock += MIN;
    await one.refresh('user');
    const after429 = one.current()[0];
    ok('‼️ a 429 next: the reading says error, and the account is STILL 95% — not usable under 90', after429.state === 'error' && F.percentNow(after429, NOW) === 95 && !U.slotIsUsable(after429, 90, NOW));
    const reloaded = mkService();
    const cold = reloaded.current()[0];
    ok('‼️ a window reload: nothing has been read yet, and the account is still known to be at 95%', cold.fetchedAt === 0 && F.percentNow(cold, NOW) === 95 && !U.slotIsUsable(cold, 90, NOW));
    reloaded.markWalled('claude-aicozums');
    ok('markWalled: the plan limit makes it 100 until its turnover, and the wall is remembered', F.percentNow(reloaded.current()[0], NOW) === 100 && disk.floors['claude-aicozums'].walled === true);

    console.log('\n== the incident, replayed: where leg 3 was placed ==');
    {
        // 18:38:42Z, 2 min 43 s after a reload: aicozums not read yet but known at 95%; the rest as measured
        const usage = [
            { ...cold, slotId: 'claude-aicozums' },
            okRead('claude-murvietnam', 90, NOW + 4 * HOUR),
            okRead('claude-wmmuratvural', 100, NOW + 100 * MIN),
            okRead('claude-kateanhkim', 49, NOW + 30 * MIN, 99, NOW + 55 * HOUR)
        ];
        const world = { engine: 'claude', usage, standing: '', ceiling: 90, now: NOW };
        const r = P.resolvePolicy('@emptiest', world);
        ok('‼️ @emptiest no longer falls back to the "unmeasured" account at 95%: it refuses', !r.id && /every claude sign-in is at or past 90%/.test(r.refusal || ''));
        ok('…naming the first one back: aicozums at its turnover (02:30 Bangkok)', r.resetsAt === NOW + 50 * MIN);
        ok('…and its sentence says what is known and how old it is', /at least 95% \(last read/.test(r.refusal));
        const unread = usage.map(u => (u.slotId === 'claude-aicozums' ? { ...u, floor: undefined } : u));
        ok('(before X-462 — the same moment without the floor picked aicozums)', P.resolvePolicy('@emptiest', { ...world, usage: unread }).id === 'claude-aicozums');
    }

    console.log('\n== a leg out of room is not barren ==');
    {
        ok('starved: the plan limit', /hit its plan limit/.test(R.starvedWhy({ fault: 'limit', slot: 'aicozums', percent: -1, handoverPct: 90 })));
        ok('starved: at the quota handover line (90 of 90)', /at or past the quota handover line 90%/.test(R.starvedWhy({ slot: 'murvietnam', percent: 90, handoverPct: 90 })));
        ok('not starved: under the line, unknown, or the line off',
            !R.starvedWhy({ percent: 89, handoverPct: 90 }) && !R.starvedWhy({ percent: -1, handoverPct: 90 }) && !R.starvedWhy({ percent: 99, handoverPct: 0 }));
        const H1 = 'aaaaaaaa11111111aaaaaaaa11111111aaaaaaaa';
        const mk = (id, hop, state, extra) => ({
            id, chainId: 'chn_1', hop, state, prompt: 'p', why: 'w', head: H1,
            from: { sessionId: 'leg' + hop, agentId: 'dev', engine: 'claude', cwd: 'D:\\repo', launchId: 'l' },
            inherit: { surface: 'console' }, want: { surface: 'inherit', account: '@emptiest' }, createdAt: NOW, updatedAt: NOW, ...extra
        });
        const prior = [mk('b1', 1, 'started'), mk('b2', 2, 'started')];
        ok('two legs in a row with no commit, both with room: still the barren brake', (batonBrake(mk('b3', 3, 'waiting-end'), prior, 30) || {}).kind === 'barren');
        ok('‼️ the passing leg was out of room: no brake — the door places or parks', batonBrake(mk('b3', 3, 'waiting-end', { starved: 'x at 95%' }), prior, 30) === undefined);
        ok('‼️ the leg before it was: no brake either', batonBrake(mk('b3', 3, 'waiting-end'), [prior[0], mk('b2', 2, 'started', { starved: 'y at 90%' })], 30) === undefined);
        ok('the leg ceiling still holds a starved chain', (batonBrake(mk('b3', 3, 'waiting-end', { starved: 'x' }), prior, 3) || {}).kind === 'ceiling');

        // through the op: the pass of leg 3 (c4908ad1), on aicozums at 95%
        const store = new BatonStore();
        store.put(mk('b1', 1, 'started', { toSessionId: 'leg2' }), mk('b2', 2, 'started', { from: { ...mk('b2', 2).from, sessionId: 'leg2' }, toSessionId: 'sess-A' }));
        const reg = new BridgeRegistry();
        const notes = [];
        const manifest = {
            launchId: 'lch_abc123def', at: NOW - 1000, engine: 'claude', identity: { engine: 'claude', providerId: 'anthropic', origin: 'builtin', scope: 'machine' },
            requested: { model: 'opus' }, agentId: 'dev', agentName: 'developer', mechanism: 'session', cwd: 'D:\\repo', surface: 'console', account: 'claude-aicozums'
        };
        registerBatonOps(reg, {
            store, caller: async () => ({ ok: true, sessionId: 'sess-A', source: 'env' }), launchIdOf: () => 'lch_abc123def',
            manifests: () => [manifest], headOf: async () => H1, notify: (t, b, k) => notes.push({ t, b, k }), now: () => NOW,
            starvedOf: b => R.starvedWhy({ slot: b.inherit.account, percent: 95, handoverPct: 90 })
        });
        const r = await reg.dispatch('baton.pass', { prompt: 'carry on' });
        ok('‼️ the replayed pass of leg 3 is NOT braked: it waits for its session, marked starved', r.ok && !r.result.braked && r.result.baton.state === 'waiting-end'
            && /claude-aicozums was at 95%/.test(r.result.baton.starved) && notes.length === 0);

        // the plan limit, passed by Agent Farm for the walled leg, through a real runner
        const store2 = new BatonStore(null);
        store2.put(mk('b1', 1, 'started', { toSessionId: 'leg2' }), mk('b2', 2, 'started', { from: { ...mk('b2', 2).from, sessionId: 'leg2' }, toSessionId: 'sess-W' }));
        const runner = new BatonRunner({
            store: store2, now: () => NOW, door: () => ({ taskId: 't', sessionId: 's-next' }),
            evidence: () => ({ registered: true, live: 'alive', registers: true }),
            legFacts: async (sid, at) => ({ sessionId: sid, endedAt: at, dirty: '', commits: '' }),
            launchIdOf: () => undefined, maxLegs: () => 30, headOf: async () => H1
        });
        const b = await runner.enginePass('sess-W', 'the plan limit stopped leg 3', { fault: 'limit' });
        ok('‼️ a walled leg whose chain had two commitless legs is passed for, not braked', !!b && b.state === 'waiting-end' && b.fault === 'limit' && /plan limit/.test(b.starved));
    }

    console.log('\n== the wiring ==');
    {
        const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
        ok('the door marks the account the plan limit walled', /if \(b\.fault === 'limit' && was\) \{ try \{ accountUsage\.markWalled\(was\); \}/.test(ext));
        ok('…and places the leg by the policies, as before: S-106, then the chain\'s pool', /const pick = launchAccountPick\(\{ engine: b\.from\.engine, account: stay\.stay \? stay\.slotId : b\.want\.account, agentId: agent\.id, model: b\.inherit\.model \}\);/.test(ext));
        ok('the stay reads the figure in force (a floor counts)', /stayPct: pct, slotId, percent: u \? percentNow\(u\) : undefined, resetsAt: u\?\.resetsAt,/.test(ext));
        const wake = (ext.match(/function relayWakeHold\(task: FarmTask\)[\s\S]*?\n    \}\n/) || [''])[0];
        ok('a parked row keeps waiting at its wake, before the quota line', /quotaCheck: \(task\) => relayWakeHold\(task\) \?\? quotaBrake\(/.test(ext) && /if \(r\.refusal && r\.resetsAt\) \{ return \{ code: 'quota:5h'/.test(wake));
        ok('‼️ …and never pins an account on the row: the launch picks as every launch does', !!wake && !/task\.account =/.test(wake) && !/noteTaskEvent/.test(wake));
        ok('the starved evidence reaches the pass and the runner', (ext.match(/starvedOf: b => legStarvedOf\(b\)/g) || []).length === 2);
        ok('the floors outlive a reload', /memory: fileUsageMemory\(path\.join\(context\.globalStorageUri\.fsPath, 'account-usage-floors\.json'\)\)/.test(ext));
        ok('‼️ no second wall: no leg start line, no cap on the policies', !/batonMinRoomPct|legStartLine|relayPlace|legLine|cap\?: number/.test(ext)
            && !/\bcap\b|capOf|capped/.test(fs.readFileSync(path.join(ROOT, 'src', 'core', 'accountPolicy.ts'), 'utf8')));
        const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).contributes.configuration;
        const props = Object.assign({}, ...(Array.isArray(pkg) ? pkg : [pkg]).map(c => c.properties || {}));
        ok('‼️ the duplicate setting is gone; the user\'s own box is the wall, 70 out of the box', !props['agentFarm.batonMinRoomPct'] && props['agentFarm.defaultAccountCeiling'].default === 70);
    }

    console.log(`\ntest_relay_room: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
