// S-78 — THE RELAY'S TWO AUTOMATIC BRAKES: the leg ceiling and the barren chain.
//
// What must not go wrong quietly: a chain past its ceiling opens no leg; two
// legs in a row with no new commit stop it; the braked baton is KEPT (stopped,
// reason in `why`); the runner is told to write a note instead; the person is
// told once on Notices; and the whisper then stops asking that run for a pass.
//
//   node test/test_baton_brake.js
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const OUT = path.join(__dirname, '..', 'out', 'core');
const B = require(path.join(OUT, 'baton.js'));
const { batonBrake } = require(path.join(OUT, 'batonBrake.js'));
const { BridgeRegistry } = require(path.join(OUT, 'bridge.js'));
const { registerBatonOps } = require(path.join(OUT, 'batonBridge.js'));
const { BatonStore } = require(path.join(OUT, 'batonStore.js'));
const W = require(path.join(OUT, 'workdirChanges.js'));

const NOW = 1790000000000;
const H1 = 'aaaaaaaa11111111aaaaaaaa11111111aaaaaaaa';
const H2 = 'bbbbbbbb22222222bbbbbbbb22222222bbbbbbbb';
const mk = (id, hop, state, head, extra) => ({
    id, chainId: 'chn_1', hop, state, prompt: 'p', why: 'w',
    from: { sessionId: 'leg' + hop, agentId: 'dev', engine: 'claude', cwd: 'D:\\repo', launchId: 'l' },
    inherit: { surface: 'console' }, want: { surface: 'inherit', account: '@emptiest' },
    ...(head ? { head } : {}), createdAt: NOW, updatedAt: NOW, ...extra
});

// ---------- the pure decision ----------
ok('the default ceiling is 6 legs', B.BATON_DEFAULT_MAX_LEGS === 6);
ok('a setting is read as a whole number >= 0, the default for anything else',
    B.normalizeMaxLegs(3) === 3 && B.normalizeMaxLegs(0) === 0 && B.normalizeMaxLegs(2.9) === 2
    && B.normalizeMaxLegs(-1) === 6 && B.normalizeMaxLegs('4') === 6 && B.normalizeMaxLegs(undefined) === 6);
{
    const c = batonBrake(mk('x', 6, 'waiting-end'), [], 6);
    ok('leg 6 of 6 passing: leg 7 does not open — the ceiling, named with its setting',
        c && c.kind === 'ceiling' && /has run 6 of its 6 legs \(agentFarm\.batonMaxHops\); leg 7 does not open/.test(c.why));
    ok('leg 5 of 6 passing still opens leg 6', batonBrake(mk('x', 5, 'waiting-end'), [], 6) === undefined);
    ok('0 = no ceiling', batonBrake(mk('x', 60, 'waiting-end'), [], 0) === undefined);
    ok('a ceiling of 1 stops the very first pass', batonBrake(mk('x', 1, 'waiting-end'), [], 1).kind === 'ceiling');
}
{
    const prior = [mk('b1', 1, 'started', H1), mk('b2', 2, 'started', H1)];
    const barren = batonBrake(mk('b3', 3, 'waiting-end', H1), prior, 6);
    ok('two legs in a row ending on the HEAD they opened on stop the chain',
        barren && barren.kind === 'barren' && /legs 2 and 3 both ended with no new commit in D:\\repo \(HEAD still aaaaaaaa\); leg 4 does not open/.test(barren.why));
    ok('a commit in the last leg keeps it going', batonBrake(mk('b3', 3, 'waiting-end', H2), prior, 6) === undefined);
    ok('one barren leg is not two', batonBrake(mk('b3', 3, 'waiting-end', H2), [mk('b1', 1, 'started', H1), mk('b2', 2, 'started', H2)], 6) === undefined
        && batonBrake(mk('b3', 3, 'waiting-end', H2), [mk('b1', 1, 'started', H2), mk('b2', 2, 'started', H1)], 6) === undefined);
    ok('leg 2 cannot be judged barren — nobody read the HEAD leg 1 started on',
        batonBrake(mk('b2', 2, 'waiting-end', H1), [mk('b1', 1, 'started', H1)], 6) === undefined);
    ok('a folder with no HEAD (not a repo) never trips it', batonBrake(mk('b3', 3, 'waiting-end'), [mk('b1', 1, 'started'), mk('b2', 2, 'started')], 6) === undefined);
    ok('only the legs that really opened count — a stopped hop is not a leg',
        batonBrake(mk('b3', 3, 'waiting-end', H1), [mk('b1', 1, 'started', H1), mk('b2', 2, 'stopped', H1)], 6) === undefined);
    ok('another chain\'s heads are not this chain\'s',
        batonBrake(mk('b3', 3, 'waiting-end', H1), prior.map(p => ({ ...p, chainId: 'chn_2' })), 6) === undefined);
    ok('the ceiling speaks before the barren rule', batonBrake(mk('b3', 3, 'waiting-end', H1), prior, 3).kind === 'ceiling');
}

(async () => {
    // ---------- the HEAD reader ----------
    ok('headCommit reads rev-parse HEAD', await W.headCommit('D:\\r', async (a) => (a.join(' ') === 'rev-parse HEAD' ? H1 + '\n' : '')) === H1);
    ok('…and says nothing for a folder with no answer', await W.headCommit('D:\\r', async () => { throw new Error('fatal'); }) === undefined
        && await W.headCommit('', async () => H1) === undefined
        && await W.headCommit('D:\\r', async () => 'HEAD\n') === undefined);
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'af-brake-'));
    try {
        ok('…and a real folder that is no repository has no HEAD', await W.headCommit(bare) === undefined);
    } finally { try { fs.rmSync(bare, { recursive: true, force: true }); } catch { /* the sweeper takes it */ } }

    // ---------- through the op ----------
    const manifest = {
        launchId: 'lch_abc123def', at: NOW - 1000, engine: 'claude',
        identity: { engine: 'claude', providerId: 'anthropic', origin: 'builtin', scope: 'machine' },
        requested: { model: 'opus', effort: 'high' }, agentId: 'dev', agentName: 'developer',
        mechanism: 'session', cwd: 'D:\\repo', surface: 'console'
    };
    const run = async (o) => {
        const store = new BatonStore();
        store.put(mk('b1', 1, 'started', H1, { toSessionId: 'leg2' }), mk('b2', 2, 'started', H1, { from: { ...mk('b2', 2).from, sessionId: 'leg2' }, toSessionId: 'sess-A' }));
        const reg = new BridgeRegistry();
        const notes = [];
        registerBatonOps(reg, Object.assign({
            store,
            caller: async () => ({ ok: true, sessionId: 'sess-A', source: 'env' }),
            launchIdOf: () => 'lch_abc123def',
            manifests: () => [manifest],
            headOf: async () => H1,
            notify: (title, body, key) => notes.push({ title, body, key }),
            now: () => NOW
        }, o));
        const r = await reg.dispatch('baton.pass', { prompt: 'carry on' });
        return { r, store, notes };
    };
    {
        const { r, store, notes } = await run({});
        const b = r.result && r.result.baton;
        ok('a barren third leg: the pass is answered, not refused — the baton is kept as stopped',
            r.ok && r.result.braked === 'barren' && b.state === 'stopped' && b.hop === 3 && /^braked — barren chain/.test(b.why));
        ok('…and it is on disk with its HEAD', store.get(b.id).state === 'stopped' && store.get(b.id).head === H1);
        ok('…the runner is told to write a handover note instead',
            /^The chain stops here: barren chain/.test(r.result.sentence) && /write a handover note instead \(_REF\/handover\.md, section 4\)/.test(r.result.sentence));
        ok('…the person is told ONCE, with a key that cannot repeat for this baton',
            notes.length === 1 && /^Baton chain stopped — barren chain \(chn_1\)/.test(notes[0].title)
            && /baton\.status chain=chn_1/.test(notes[0].body) && notes[0].key === `baton:${b.id}:braked`);
        ok('‼️ …and the whisper stops asking that run for a pass — it falls back to the note',
            B.batonRelayOf(store.all(), 'sess-A') === undefined);
    }
    {
        const { r, notes } = await run({ maxLegs: () => 3 });
        ok('the ceiling through the op: kept as stopped, named, told',
            r.ok && r.result.braked === 'ceiling' && r.result.baton.state === 'stopped'
            && /agentFarm\.batonMaxHops sets the ceiling \(0 = none\)/.test(notes[0].body));
    }
    {
        const { r, store, notes } = await run({ headOf: async () => H2 });
        ok('a leg that committed passes as before — waiting for the session to end, nobody told',
            r.ok && !r.result.braked && r.result.baton.state === 'waiting-end' && notes.length === 0
            && store.get(r.result.baton.id).head === H2 && /When it ends/.test(r.result.sentence));
    }
    {
        const { r } = await run({ headOf: async () => { throw new Error('git hung'); } });
        ok('a HEAD that cannot be read never blocks a pass', r.ok && r.result.baton.state === 'waiting-end' && !r.result.baton.head);
    }
    {
        const { r } = await run({ headOf: undefined, notify: undefined });
        ok('without the new deps the op behaves as it did', r.ok && r.result.baton.state === 'waiting-end');
    }

    console.log(`test_baton_brake.js: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
