// S-96 — THE USER'S SOFT BRAKE: "the leg running now is this chain's last".
//
// What must not go wrong quietly: with no flag every answer is exactly what it
// was; set, the leg's pass opens nothing (answered `braked`, told to write the
// note) and the failsafe does not rescue it; released before the pass, nothing
// is left behind; the flag never reaches the next leg; after the pass it is locked.
//
//   node test/test_baton_lastleg.js
'use strict';
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const OUT = path.join(__dirname, '..', 'out', 'core');
const B = require(path.join(OUT, 'baton.js'));
const { batonBrake } = require(path.join(OUT, 'batonBrake.js'));
const L = require(path.join(OUT, 'batonLastLeg.js'));
const { failsafeVerdict } = require(path.join(OUT, 'batonFailsafe.js'));
const { LegEndWatch } = require(path.join(OUT, 'batonLegEnd.js'));
const { BridgeRegistry } = require(path.join(OUT, 'bridge.js'));
const { registerBatonOps } = require(path.join(OUT, 'batonBridge.js'));
const { BatonStore } = require(path.join(OUT, 'batonStore.js'));

const NOW = 1790000000000;
const BY = 'the user (Console card)';
const from = (sessionId) => ({ sessionId, agentId: 'dev', engine: 'claude', cwd: 'D:\\repo', launchId: 'l' });
const mk = (id, hop, state, sid, to, extra) => ({
    id, chainId: 'chn_1', hop, state, prompt: 'p', why: 'w', from: from(sid),
    inherit: { surface: 'console' }, want: { surface: 'inherit', account: '@emptiest' },
    ...(to ? { toSessionId: to } : {}), createdAt: NOW - 5000, updatedAt: NOW - 5000, ...extra
});
const seal = mk('s0', 0, 'started', 'L1', 'L1');
const b1 = mk('b1', 1, 'started', 'L1', 'L2');
const base = [seal, b1];
const put = (list, b) => list.map(x => (x.id === b.id ? b : x));
const draftOf = (sid, hop) => mk('d' + hop, hop, 'waiting-end', sid);

// ---------- no flag: nothing changes ----------
ok('a running leg with no flag stands at off', L.brakeStateOf(base, 'L2') === 'off');
ok('a session no baton touched has no brake', L.brakeStateOf(base, 'nobody') === undefined && L.brakeStateOf(base, '') === undefined);
ok('‼️ with no flag the pass is not braked', batonBrake(draftOf('L2', 2), base, 6) === undefined);
{
    const r = B.batonRelayOf(base, 'L2');
    ok('‼️ with no flag the relay answer carries no braked key at all', r && r.hop === 2 && r.passed === false && !('braked' in r));
}

// ---------- set ----------
const on = L.setLastLeg(base, 'L2', true, BY, NOW);
ok('setting it changes the running leg\'s OPENER, nothing else', on.ok && on.changed && on.on && on.baton.id === 'b1'
    && on.baton.lastLeg.by === BY && on.baton.lastLeg.at === NOW);
ok('…and leaves updatedAt alone, so no surface re-sorts', on.baton.updatedAt === b1.updatedAt && on.baton.state === 'started');
const braked = put(base, on.baton);
ok('it now stands at on', L.brakeStateOf(braked, 'L2') === 'on');
ok('pressing on again changes nothing', (() => { const r = L.setLastLeg(braked, 'L2', true, BY, NOW + 9); return r.ok && !r.changed && r.baton === on.baton; })());
{
    const r = B.batonRelayOf(braked, 'L2');
    ok('the whisper learns it: braked, still not passed, same hop', r && r.braked === true && r.passed === false && r.hop === 2 && r.chainId === 'chn_1');
}
{
    const k = batonBrake(draftOf('L2', 2), braked, 6);
    ok('the pass is braked by the user, named with who and which leg',
        k && k.kind === 'user' && /^last leg — the user \(Console card\) made leg 2 the last of chain chn_1; leg 3 does not open\.$/.test(k.why));
    ok('the ceiling still speaks first', batonBrake(draftOf('L2', 2), braked, 2).kind === 'ceiling');
    ok('another chain\'s pass from the same session is not braked by it',
        batonBrake({ ...draftOf('L2', 2), chainId: 'chn_9' }, braked, 6) === undefined);
}

// ---------- release ----------
{
    const off = L.setLastLeg(braked, 'L2', false, BY, NOW + 1000);
    ok('releasing it removes the flag', off.ok && off.changed && !off.on && !('lastLeg' in off.baton));
    ok('‼️ …and the record is byte for byte what it was before the brake', JSON.stringify(off.baton) === JSON.stringify(b1));
    const back = put(braked, off.baton);
    ok('…so the pass opens as before, and the whisper asks for the pass again',
        batonBrake(draftOf('L2', 2), back, 6) === undefined && !('braked' in B.batonRelayOf(back, 'L2')) && L.brakeStateOf(back, 'L2') === 'off');
    ok('releasing an unbraked leg changes nothing', (() => { const r = L.setLastLeg(base, 'L2', false, BY, NOW); return r.ok && !r.changed; })());
}

// ---------- leg 1 carries it on its seal ----------
{
    const one = [seal];
    const r = L.setLastLeg(one, 'L1', true, BY, NOW);
    ok('leg 1\'s brake lives on its seal', r.ok && r.baton.id === 's0' && r.baton.hop === 0);
    const k = batonBrake(draftOf('L1', 1), put(one, r.baton), 6);
    ok('…and brakes leg 1\'s pass', k && k.kind === 'user' && /made leg 1 the last/.test(k.why));
}

// ---------- the flag never leaks to the next leg ----------
{
    const b2 = mk('b2', 2, 'started', 'L2', 'L3');
    const chain = [seal, on.baton, b2];
    ok('the next leg has its own opener: off, and its pass opens', L.brakeStateOf(chain, 'L3') === 'off'
        && batonBrake(draftOf('L3', 3), chain, 6) === undefined && !('braked' in B.batonRelayOf(chain, 'L3')));
    ok('a leg whose successor is running has no brake left to show', L.brakeStateOf(chain, 'L2') === undefined);
    ok('runningLegOf names the newest leg', L.runningLegOf(chain, 'chn_1') === 'L3' && L.runningLegOf(base, 'chn_1') === 'L2');
}

// ---------- after the pass ----------
{
    const passed = [...base, mk('p2', 2, 'waiting-end', 'L2')];
    ok('a leg that already passed stands at passed — ✕⑂ Stop chain\'s turn', L.brakeStateOf(passed, 'L2') === 'passed');
    const r = L.setLastLeg(passed, 'L2', true, BY, NOW);
    ok('…and refuses the brake, naming the stop that still works',
        !r.ok && /already passed the baton/.test(r.why) && /baton\.stop chain=chn_1/.test(r.why));
    ok('runningLegOf has no running leg while a successor waits', L.runningLegOf(passed, 'chn_1') === undefined);
    const ended = [seal, on.baton, mk('p2', 2, 'stopped', 'L2', undefined, { why: 'braked — last leg' })];
    ok('a braked leg whose pass is recorded is locked', L.brakeStateOf(ended, 'L2') === 'locked');
    const rel = L.setLastLeg(ended, 'L2', false, BY, NOW);
    ok('…and a locked brake cannot be released', !rel.ok && /already reached its end/.test(rel.why));
    ok('a leg stopped by another brake has no brake to show', L.brakeStateOf([...base, mk('p2', 2, 'stopped', 'L2')], 'L2') === undefined);
    ok('not a relay leg: refused by name', !L.setLastLeg(base, 'zzzzzzzz-1', true, BY, NOW).ok
        && /is not a leg of a baton relay/.test(L.setLastLeg(base, 'zzzzzzzz-1', true, BY, NOW).why));
}

// ---------- S-99 — the views ----------
{
    const V = require(path.join(OUT, 'batonView.js'));
    const offV = V.batonCardView(base, 'L2');
    ok('the card of a running leg carries brake=off and its plain chip', offV.brake === 'off' && offV.chip === '⑂ 2'
        && offV.head === 'Baton relay — leg 2' && !offV.lines.some(l => /^Last leg/.test(l)));
    const onV = V.batonCardView(braked, 'L2');
    ok('braked: ⑂ 2⊣ wherever the chip is drawn, "last leg" in the head, a line saying what happens',
        onV.brake === 'on' && onV.chip === '⑂ 2⊣' && onV.head === 'Baton relay — leg 2 · last leg'
        && onV.lines.some(l => /^Last leg: braked by the user — at its handover line it writes the note/.test(l)));
    const lockV = V.batonCardView([seal, on.baton, mk('p2', 2, 'stopped', 'L2')], 'L2');
    ok('locked keeps the mark and says the chain ended here', lockV.brake === 'locked' && lockV.chip === '⑂ 2⊣'
        && lockV.lines.some(l => /the chain ended at this leg/.test(l)));
    const passedV = V.batonCardView([...base, mk('p2', 2, 'waiting-end', 'L2')], 'L2');
    ok('passed: no mark, the brake is ✕⑂\'s (stoppable)', passedV.brake === 'passed' && passedV.chip === '⑂ 2' && passedV.stoppable);
    const bar = V.batonBarView(braked, 6, () => true, () => '12:00');
    ok('the status bar marks a braked running leg: ⑂ 2⊣/6, and says so in its line',
        bar && bar.text === '⑂ 2⊣/6' && /running \(session L2\) — its last leg: braked by the user\./.test(bar.tooltip)
        && /⑂⊣ Last leg on the running card \(baton\.lastLeg\)/.test(bar.tooltip));
    ok('…and an unbraked one exactly as before', V.batonBarView(base, 6, () => true, () => '12:00').text === '⑂ 2/6');
}

// ---------- the failsafe stays out ----------
{
    const facts = { sessionId: 'L2', endedAt: NOW, handover: 'CONTEXT HANDOVER', note: { ts: NOW - 1000, path: 'devir.md' }, toolCalls: 4 };
    ok('without the flag, a leg that wrote its note after the order is rescued (as before)', failsafeVerdict(base, facts).act === 'rescue');
    const v = failsafeVerdict(braked, facts);
    ok('‼️ with the flag the same end closes the chain — done, never a rescue',
        v.act === 'done' && /leg 2 was the chain's last — the user \(Console card\) braked it/.test(v.why));
    ok('…even a crash on the braked leg is not rescued against the user\'s word',
        failsafeVerdict(braked, { ...facts, exitCode: 1, dirty: true }).act === 'done');
}

(async () => {
    // ---------- through the failsafe's watch ----------
    {
        const store = new BatonStore();
        store.put(...braked);
        let released = 0;
        const w = new LegEndWatch({
            store, now: () => NOW, log: () => { },
            legFacts: async () => ({ handover: 'CONTEXT HANDOVER', note: { ts: NOW, path: 'devir.md' } }),
            isEnded: () => true
        }, (b) => { released++; return b; });
        const rec = await w.legEnded('L2', 'test');
        ok('the watch records a done, opens nothing', rec && rec.state === 'done' && rec.hop === 2 && released === 0
            && !store.all().some(b => B.isLive(b)));
    }

    // ---------- through baton.pass ----------
    const manifest = {
        launchId: 'lch_abc123def', at: NOW - 1000, engine: 'claude',
        identity: { engine: 'claude', providerId: 'anthropic', origin: 'builtin', scope: 'machine' },
        requested: { model: 'opus', effort: 'high' }, agentId: 'dev', agentName: 'developer',
        mechanism: 'session', cwd: 'D:\\repo', surface: 'console'
    };
    const run = async (flag) => {
        const store = new BatonStore();
        store.put(mk('s0', 0, 'started', 'sess-A', 'sess-A', flag ? { lastLeg: { at: NOW, by: BY } } : {}));
        const reg = new BridgeRegistry();
        const notes = [];
        registerBatonOps(reg, {
            store,
            caller: async () => ({ ok: true, sessionId: 'sess-A', source: 'env' }),
            launchIdOf: () => 'lch_abc123def',
            manifests: () => [manifest],
            notify: (title, body, key) => notes.push({ title, body, key }),
            now: () => NOW
        });
        const r = await reg.dispatch('baton.pass', { prompt: 'carry on' });
        return { r, store, notes };
    };
    {
        const { r, store, notes } = await run(true);
        const b = r.result && r.result.baton;
        ok('a braked leg\'s pass is answered braked=user — kept as stopped, nothing waits',
            r.ok && r.result.braked === 'user' && b.state === 'stopped' && /^braked — last leg/.test(b.why)
            && !store.all().some(x => B.isLive(x)));
        ok('…the runner is told to write the note instead',
            /write a handover note instead \(_REF\/handover\.md, section 4\)/.test(r.result.sentence));
        ok('…the person is told once, the brake named', notes.length === 1
            && /^Baton chain stopped — last leg, braked by the user \(chn_1\)/.test(notes[0].title));
        ok('…and the leg is locked from then on', L.brakeStateOf(store.all(), 'sess-A') === 'locked');
        ok('baton.status shows the flag on the seal', (await (async () => {
            const reg = new BridgeRegistry();
            registerBatonOps(reg, { store, caller: async () => ({ ok: false }), launchIdOf: () => undefined, manifests: () => [] });
            const s = await reg.dispatch('baton.status', { chain: 'chn_1' });
            return JSON.stringify(s).includes('"lastLeg":{"at":' + NOW);
        })()));
    }
    {
        const { r, notes } = await run(false);
        ok('‼️ the same pass with no flag waits for the session to end, nobody told',
            r.ok && !r.result.braked && r.result.baton.state === 'waiting-end' && notes.length === 0);
    }

    // ---------- S-98 — the op ----------
    {
        const { registerLastLegOp, applyLastLeg } = require(path.join(OUT, 'batonLastLegOp.js'));
        const store = new BatonStore();
        store.put(...base);
        const reg = new BridgeRegistry();
        registerLastLegOp(reg, { store, now: () => NOW });
        const d = (args) => reg.dispatch('baton.lastLeg', args);
        const a = await d({ session: 'L2' });
        ok('baton.lastLeg session= brakes by default, stored, the leg named',
            a.ok && a.result.on && a.result.changed && a.result.brake === 'on' && a.result.leg === 2
            && /^Braked: leg 2 is the last of chain chn_1\./.test(a.result.sentence) && store.get('b1').lastLeg.by === 'the user (bridge)');
        const b = await d({ chain: 'chn_1', on: 'false' });
        ok('chain= finds the running leg; on=false (the typed word) releases it',
            b.ok && !b.result.on && b.result.changed && b.result.brake === 'off' && /^Released: chain chn_1 goes on/.test(b.result.sentence)
            && !('lastLeg' in store.get('b1')));
        const c = await d({ session: 'L2', on: false });
        ok('releasing a released leg answers, changes nothing', c.ok && !c.result.changed);
        ok('by= is recorded', (await d({ session: 'L2', by: 'kate' })).ok && store.get('b1').lastLeg.by === 'kate');
        const none = await d({});
        ok('no session and no chain: refused, naming both', !none.ok && /say which: session/.test(none.error));
        const lost = await d({ chain: 'chn_404' });
        ok('a chain with no running leg: refused, pointing at baton.status', !lost.ok && /chn_404 has no running leg/.test(lost.error));
        store.put(mk('p2', 2, 'waiting-end', 'L2'));
        const late = await d({ session: 'L2', on: false });
        ok('a leg that already passed: refused through the op too', !late.ok && /already passed the baton/.test(late.error));
        ok('the Console card calls the same body', typeof applyLastLeg === 'function'
            && applyLastLeg({ store }, 'L2', true, 'x').ok === false);
        const ops = await reg.dispatch('farm.ops', {});
        const entry = (reg.catalog() || []).find(o => o.op === 'baton.lastLeg');
        ok('the op is in farm.ops with its args', ops.ok && JSON.stringify(ops.result).includes('baton.lastLeg')
            && entry && /args: session\? .*chain\? .*on\? \(default true\)/.test(entry.describe));
    }

    console.log('\n== S-100 live: a brake pressed while the seal is still reading git ==');
    {
        const { BatonRunner } = require(path.join(OUT, 'batonRunner.js'));
        const { applyLastLeg } = require(path.join(OUT, 'batonLastLegOp.js'));
        const store = new BatonStore();
        let answer;
        const git = new Promise(res => { answer = res; });
        const manifest = {
            launchId: 'lch_1', at: NOW - 1000, engine: 'claude', requested: { model: 'haiku' }, agentId: 'dev', agentName: 'basit',
            identity: { engine: 'claude', providerId: 'anthropic', origin: 'builtin', scope: 'machine' },
            mechanism: 'task', mechanismId: 'tsk_1', cwd: 'D:\\repo', account: 'claude-kate', surface: 'console'
        };
        const runner = new BatonRunner({
            store, door: () => { throw new Error('no door here'); }, evidence: () => ({ registered: true, live: 'alive', registers: true }),
            log: () => undefined, now: () => NOW,
            firstLegs: () => [{ taskId: 'tsk_1', sessionId: 'sess-one-0001', launchId: 'lch_1', account: '@emptiest', title: 'S-100' }],
            manifestOf: () => manifest,
            headOf: () => git
        });
        ok('the first leg is sealed before git has answered', runner.follow().length === 1 && !store.all()[0].head);
        const braked = applyLastLeg({ store, now: () => NOW + 2500 }, 'sess-one-0001', true, 'S-100 live test');
        ok('…and the brake is pressed in that gap', braked.ok && braked.brake === 'on');
        answer('cb22a3ba');
        await git; await new Promise(r => setImmediate(r));
        const s0 = store.all().find(b => b.hop === 0);
        ok('‼️ git\'s late answer adds the HEAD and keeps the brake (measured live: the flag was wiped 2.5 s after the seal)',
            s0.head === 'cb22a3ba' && s0.lastLeg && s0.lastLeg.by === 'S-100 live test' && L.brakeStateOf(store.all(), 'sess-one-0001') === 'on');
    }

    console.log(`test_baton_lastleg.js: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
