// S-81 — THE FIRST LEG'S SEAL, AND THE POOL A CHAIN NEVER LEAVES.
//
// What must not go wrong quietly: the run that opens a relay is leg 1 of it
// from its first turn (the whisper says "pass the baton", the card says ⑂ 1,
// the leg ceiling counts it once); a session is sealed once and a successor
// row never; the pool the first leg named is the pool of every later leg, and
// a leg naming another account is told it was not used.
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const OUT = path.join(__dirname, '..', 'out', 'core');
const B = require(path.join(OUT, 'baton.js'));
const S = require(path.join(OUT, 'batonSeal.js'));
const V = require(path.join(OUT, 'batonView.js'));
const G = require(path.join(OUT, 'contextGuard.js'));
const { BatonStore } = require(path.join(OUT, 'batonStore.js'));
const { BatonRunner } = require(path.join(OUT, 'batonRunner.js'));

const NOW = 1790000000000;
const manifest = (launchId, o) => Object.assign({
    launchId, at: NOW - 1000, engine: 'claude',
    identity: { engine: 'claude', providerId: 'anthropic', origin: 'builtin', scope: 'machine' },
    requested: { model: 'opus' }, agentId: 'dev', agentName: 'developer',
    mechanism: 'task', mechanismId: 'tsk_1', cwd: 'D:\\repo', account: 'claude-kate', surface: 'console'
}, o);
const leg = (o) => Object.assign({ taskId: 'tsk_1', sessionId: 'sess-one-0001', launchId: 'lch_1', account: '@devpool', title: 'S-81 work' }, o);
const seal = (o, prior = []) => S.sealFirstLeg({ leg: leg(o), manifest: manifest((o && o.launchId) || 'lch_1'), prior, now: NOW, rnd: () => 0.5 });

console.log('\n== the seal ==');
{
    const r = seal();
    ok('a first leg is sealed', r && r.ok);
    const b = r.baton;
    ok('‼️ the seal is HOP 0 and born started, its successor the session itself',
        b.hop === 0 && b.state === 'started' && b.toSessionId === 'sess-one-0001' && b.from.sessionId === 'sess-one-0001');
    ok('it names its task row and opens a new chain', b.taskId === 'tsk_1' && /^chn_/.test(b.chainId) && /^btn_/.test(b.id));
    ok('its setup is the manifest\'s, like any baton', b.from.launchId === 'lch_1' && b.inherit.model === 'opus' && b.inherit.account === 'claude-kate');
    ok('‼️ the POOL is the policy the row asked for, not the slot it resolved to', b.want.account === '@devpool' && b.want.surface === 'inherit');
    ok('a row that named a single slot leaves the pool at the default', seal({ account: 'claude-kate' }).baton.want.account === '@emptiest');
    ok('…and so does one that named nothing', seal({ account: undefined }).baton.want.account === '@emptiest');
    ok('…and the machine\'s own sign-in is not a pool', S.chainPool('@machine') === '@emptiest');
    ok('a named chain is used as named', seal({ chainId: 'chn_mine' }).baton.chainId === 'chn_mine');
    ok('S.isSeal knows it, and a pass is not one', S.isSeal(b) && !S.isSeal({ hop: 1 }));

    ok('no session yet: nothing to do', S.sealFirstLeg({ leg: leg({ sessionId: '' }), manifest: manifest('lch_1'), prior: [], now: NOW }) === undefined);
    ok('‼️ a session already sealed is not sealed twice', seal({}, [b]) === undefined);
    ok('‼️ a session a baton OPENED (a successor) is never sealed', seal({ sessionId: 's2' }, [{ ...b, id: 'x', hop: 1, toSessionId: 's2', taskId: 'tsk_9' }]) === undefined);
    ok('‼️ a row that is some baton\'s successor row is never sealed', seal({ sessionId: 's3' }, [{ ...b, id: 'x', hop: 1, toSessionId: 's9', taskId: 'tsk_1' }]) === undefined);
    const noMan = S.sealFirstLeg({ leg: leg(), manifest: undefined, prior: [], now: NOW });
    ok('no manifest: refused, and it says the setup would be a guess', noMan && !noMan.ok && /would be a guess/.test(noMan.why));
    const taken = seal({ chainId: 'chn_x' }, [{ ...b, chainId: 'chn_x', toSessionId: 'other', taskId: 'tsk_0' }]);
    ok('a chain name already in use is refused, pointing at baton.pass', taken && !taken.ok && /already has legs/.test(taken.why) && /baton\.pass/.test(taken.why));
}

console.log('\n== leg 1 is in the relay: the whisper, the card, the bar ==');
{
    const b = seal().baton;
    const relay = B.batonRelayOf([b], 'sess-one-0001');
    ok('‼️ the sealed session runs the relay: it would pass hop 1', relay && relay.chainId === b.chainId && relay.hop === 1 && relay.passed === false);
    const h = G.contextSignalText('handover', 41, relay);
    ok('‼️ its handover whisper says pass the baton, never write the note',
        /baton\.pass/.test(h) && !/write the handover note/.test(h) && new RegExp(`chain ${b.chainId}, hop 1`).test(h));
    const q = G.quotaSignalText('handover', 90, 'claude-kate', relay);
    ok('…on the quota line as well', /baton\.pass/.test(q));
    const card = V.batonCardView([b], 'sess-one-0001');
    ok('the card draws ⑂ 1', card && card.chip === '⑂ 1' && card.leg === 1);
    ok('…with no predecessor and no successor yet',
        card.lines.some(l => /Predecessor: none — this run started the chain/.test(l))
        && card.lines.some(l => /Successor: none yet/.test(l)));
    const bar = V.batonBarView([b], 6, sid => sid === 'sess-one-0001', t => 'hh:mm');
    ok('the status bar draws ⑂ 1/6', bar && bar.text === '⑂ 1/6' && bar.sessionId === 'sess-one-0001');
    ok('…and nothing once that leg has ended with nobody passing', V.batonBarView([b], 6, () => false) === undefined);
}

console.log('\n== the first pass continues the sealed chain, on its pool ==');
{
    const s0 = seal().baton;
    const pass1 = B.passBaton({ prompt: 'carry on', sessionId: 'sess-one-0001', launchId: 'lch_1', manifest: manifest('lch_1'), prior: [s0], now: NOW + 1, rnd: () => 0.5 });
    ok('‼️ leg 1 passes hop 1 of THE SEALED chain', pass1.ok && pass1.baton.hop === 1 && pass1.baton.chainId === s0.chainId);
    ok('‼️ …placed from the chain\'s pool', pass1.baton.want.account === '@devpool' && !pass1.poolKept);
    ok('…and the plan sentence names the hop of that chain', new RegExp(`hop 1 of chain ${s0.chainId}`).test(B.batonPlanSentence(pass1.baton)));
    const other = B.passBaton({ prompt: 'carry on', sessionId: 'sess-one-0001', launchId: 'lch_1', manifest: manifest('lch_1'), prior: [s0], now: NOW + 1, account: '@emptiest' });
    ok('‼️ a leg naming another account does not leave the pool — and is told so',
        other.ok && other.baton.want.account === '@devpool' && /@emptiest was not used/.test(other.poolKept) && /@devpool/.test(other.poolKept));
    ok('…naming the pool itself says nothing', !B.passBaton({ prompt: 'x', sessionId: 'sess-one-0001', launchId: 'lch_1', manifest: manifest('lch_1'), prior: [s0], now: NOW, account: '@devpool' }).poolKept);
    const started1 = { ...pass1.baton, state: 'started', toSessionId: 'sess-two-0002' };
    const pass2 = B.passBaton({ prompt: 'on', sessionId: 'sess-two-0002', launchId: 'lch_2', manifest: manifest('lch_2', { account: 'claude-bob' }), prior: [s0, started1], now: NOW + 2, account: 'claude-bob' });
    ok('‼️ the pool travels leg to leg, whatever slot a leg ran on', pass2.ok && pass2.baton.hop === 2 && pass2.baton.want.account === '@devpool');
    const loose = B.passBaton({ prompt: 'x', sessionId: 'free-0003', launchId: 'lch_3', manifest: manifest('lch_3'), prior: [], now: NOW, account: '@mine' });
    ok('a chain with no seal and no pool yet takes the account it is given', loose.ok && loose.baton.want.account === '@mine' && !loose.poolKept);

    ok('‼️ the leg ceiling counts the sealed leg once: with 2 legs, leg 1 may pass',
        B.batonBrake(pass1.baton, [s0], 2) === undefined);
    const b2 = B.batonBrake(pass2.baton, [s0, started1], 2);
    ok('…and leg 2 may not', b2 && b2.kind === 'ceiling' && /run 2 of its 2 legs/.test(b2.why));
    const barren = B.batonBrake({ ...pass2.baton, head: 'abc1234' }, [{ ...s0, head: 'abc1234' }, { ...started1, head: 'abc1234' }], 6);
    ok('‼️ the seal\'s HEAD lets the barren brake see legs 1 and 2 committed nothing', barren && barren.kind === 'barren');
}

console.log('\n== the runner seals on follow(), once ==');
{
    const store = new BatonStore();
    const logs = [];
    let legs = [leg()];
    let heads = 0;
    const runner = new BatonRunner({
        store, door: () => { throw new Error('no door here'); }, evidence: () => ({ registered: true, live: 'alive', registers: true }),
        log: l => logs.push(l), now: () => NOW,
        firstLegs: () => legs,
        manifestOf: lid => lid === 'lch_1' ? manifest('lch_1') : undefined,
        headOf: async () => { heads++; return 'feedbee1'; }
    });
    const sealed = runner.follow();
    ok('follow() seals the running first leg', sealed.length === 1 && store.all().length === 1 && store.all()[0].hop === 0);
    ok('…and a second follow() does not seal it again', runner.follow().length === 0 && store.all().length === 1);
    legs = [leg({ taskId: 'tsk_2', sessionId: 'sess-two', launchId: 'lch_missing' })];
    runner.follow(); runner.follow();
    ok('a row with no manifest is logged ONCE and left alone', logs.filter(l => /tsk_2 not sealed/.test(l)).length === 1 && store.all().length === 1);
    legs = [leg({ taskId: 'tsk_3', sessionId: 'sess-three', launchId: undefined })];
    ok('a row whose launch id is not written yet waits quietly', runner.follow().length === 0 && !logs.some(l => /tsk_3/.test(l)));
    setImmediate(() => {
        ok('‼️ the folder\'s HEAD is recorded on the seal once git answers', heads === 1 && store.all()[0].head === 'feedbee1');

        console.log('\n== the wiring ==');
        const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
        ok('the host hands the runner RUNNING rows that asked for a relay',
            /firstLegs: \(\) => \[\s*\.\.\.taskManager\.tasks\s*\.filter\(t => t\.baton && t\.status === 'running' && successorSessionOf\(t\)\)/.test(ext));
        ok('…with the account they ASKED for (the pool), not the manifest\'s slot', /chainId: t\.batonChainId, account: t\.account/.test(ext));
        const addAt = ext.indexOf("op: 'tasks.add'");
        const add = ext.slice(addAt, ext.indexOf("op: '", addAt + 20));
        ok('tasks.add names baton and chainId to the agents who read it', /baton\? \(‼️ S-81/.test(add) && /chainId\? \(/.test(add));
        ok('…and a named chain means a relay', /args\.baton === true \|\| optStr\(args, 'chainId'\) \? \{ baton: true \}/.test(add));
        const bridge = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'batonBridge.ts'), 'utf8');
        ok('baton.pass says a chain keeps its pool, and answers poolKept', /which no leg leaves|keeps that pool on every leg/.test(bridge) && /poolKept: res\.poolKept/.test(bridge));
        const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'batonSeal.ts'), 'utf8');
        ok('batonSeal.ts reads and writes nothing', !/from 'fs'|from 'path'|from 'vscode'|Date\.now\(/.test(src));

        console.log(`test_baton_seal.js: ${pass} passed, ${fail} failed`);
        process.exit(fail ? 1 : 0);
    });
}
