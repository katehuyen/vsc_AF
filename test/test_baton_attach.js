// S-82 — baton.attach: a RUNNING session becomes leg 1 of a new relay, and a
// chain can carry its own leg ceiling.
//
// What must not go wrong quietly: attaching seals at once (the whisper, the
// card and the bar follow with no restart); a session already in a chain is
// refused by name, never sealed twice; a chain's own ceiling beats the setting
// at the brake and on the bar.
'use strict';
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const OUT = path.join(__dirname, '..', 'out', 'core');
const { BridgeRegistry } = require(path.join(OUT, 'bridge.js'));
const { registerBatonOps } = require(path.join(OUT, 'batonBridge.js'));
const { BatonStore } = require(path.join(OUT, 'batonStore.js'));
const B = require(path.join(OUT, 'baton.js'));
const S = require(path.join(OUT, 'batonSeal.js'));
const V = require(path.join(OUT, 'batonView.js'));

const NOW = 1790000000000;
const manifest = (launchId) => ({
    launchId, at: NOW - 1000, engine: 'claude',
    identity: { engine: 'claude', providerId: 'anthropic', origin: 'builtin', scope: 'machine' },
    requested: { model: 'opus' }, agentId: 'dev', agentName: 'developer',
    mechanism: 'session', cwd: 'D:\\repo', account: 'claude-kate', surface: 'console'
});

function setup(o = {}) {
    const store = new BatonStore();
    const reg = new BridgeRegistry();
    registerBatonOps(reg, Object.assign({
        store,
        caller: async (arg, from) => (arg || (from && from.sessionId)
            ? { ok: true, sessionId: arg || from.sessionId, source: arg ? 'arg' : 'env' }
            : { ok: false, why: 'no caller evidence' }),
        launchIdOf: sid => ({ 'sess-A': 'lch_a', 'sess-B': 'lch_b' })[sid],
        manifests: () => [manifest('lch_a'), manifest('lch_b')],
        headOf: async () => 'c0ffee12',
        maxLegs: () => 6,
        now: () => NOW
    }, o));
    return { store, reg };
}

(async () => {
    {
        const { store, reg } = setup();
        const ops = (await reg.dispatch('farm.ops', {})).result;
        const spec = ops.find(c => c.op === 'baton.attach');
        ok('baton.attach is in the catalog and names its args', spec && /session\?/.test(spec.describe) && /account\?/.test(spec.describe) && /maxHops\?/.test(spec.describe));

        const r = await reg.dispatch('baton.attach', { account: '@devpool', maxHops: 3, by: 'Murat' }, { sessionId: 'sess-A' });
        ok('the caller is attached', r.ok);
        const b = store.all()[0];
        ok('‼️ it is sealed at once: hop 0, started, its own successor', b && b.hop === 0 && b.state === 'started' && b.toSessionId === 'sess-A');
        ok('…with the pool, its own ceiling, who did it, and the folder HEAD',
            b.want.account === '@devpool' && b.maxLegs === 3 && /attached by Murat/.test(b.prompt) && b.head === 'c0ffee12' && !('taskId' in b));
        ok('the answer says what changed', /leg 1 of chain/.test(r.result.sentence) && /@devpool/.test(r.result.sentence) && /at most 3 legs/.test(r.result.sentence) && r.result.baton.maxLegs === 3);
        const relay = B.batonRelayOf(store.all(), 'sess-A');
        ok('‼️ the attached run is in the relay now: it would pass hop 1', relay && relay.hop === 1 && !relay.passed);

        const again = await reg.dispatch('baton.attach', {}, { sessionId: 'sess-A' });
        ok('‼️ a session already in a chain is refused, and the chain is named', !again.ok && /already in chain/.test(again.error) && again.error.includes(b.chainId));
        const noMan = await reg.dispatch('baton.attach', { session: 'sess-Z' });
        ok('a session with no launch id is refused as data', !noMan.ok && /not sealed/.test(noMan.error));
        const bad = await reg.dispatch('baton.attach', { maxHops: 'lots' }, { sessionId: 'sess-B' });
        ok('a ceiling that is not a number ≥ 0 is refused', !bad.ok && /maxHops must be/.test(bad.error));
        const named = await reg.dispatch('baton.attach', { session: 'sess-B', chain: b.chainId });
        ok('a chain name already in use is refused', !named.ok && /already has legs/.test(named.error));
        const plain = await reg.dispatch('baton.attach', { session: 'sess-B', account: 'claude-kate' });
        ok('a single slot as the pool means @emptiest; no ceiling given = the setting',
            plain.ok && plain.result.baton.account === '@emptiest' && !('maxLegs' in plain.result.baton) && /at most 6 legs/.test(plain.result.sentence));
        const zero = setup();
        const z = await zero.reg.dispatch('baton.attach', { maxHops: 0 }, { sessionId: 'sess-A' });
        ok('maxHops 0 is a chain with no ceiling', z.ok && z.result.baton.maxLegs === 0 && /no leg ceiling/.test(z.result.sentence));
    }

    console.log('\n== the chain\'s own ceiling, at the brake and on the bar ==');
    {
        const { store, reg } = setup();
        await reg.dispatch('baton.attach', { maxHops: 2 }, { sessionId: 'sess-A' });
        const seal = store.all()[0];
        ok('chainMaxLegs reads the seal, else the setting', S.chainMaxLegs(store.all(), seal.chainId, 6) === 2 && S.chainMaxLegs(store.all(), 'chn_other', 6) === 6);
        const bar = V.batonBarView(store.all(), 6, sid => sid === 'sess-A');
        ok('‼️ the bar draws the chain\'s own ceiling, not the setting\'s', bar && bar.text === '⑂ 1/2' && /leg 1 of 2 running/.test(bar.tooltip));
        const p1 = await reg.dispatch('baton.pass', { prompt: 'carry on' }, { sessionId: 'sess-A' });
        ok('leg 1 of 2 may pass', p1.ok && !p1.result.braked && p1.result.baton.hop === 1 && p1.result.baton.account === '@emptiest');
        store.put(Object.assign(store.get(p1.result.baton.id), { state: 'started', toSessionId: 'sess-B' }));
        const p2 = await reg.dispatch('baton.pass', { prompt: 'and on' }, { sessionId: 'sess-B' });
        ok('‼️ leg 2 of a 2-leg chain is braked by the CHAIN\'s ceiling while the setting says 6',
            p2.ok && p2.result.braked === 'ceiling' && /2 of its 2 legs/.test(p2.result.sentence));
    }

    // S-103 — measured live: the card's ⑂ Attach (5) and the session's own
    // baton.attach (20) landed 0.8 s apart while git was still being read, and
    // both sealed — two chains on one run, the bar drawing both.
    {
        let release;
        const gate = new Promise(r => { release = r; });
        const { store, reg } = setup({ headOf: () => gate.then(() => 'c0ffee12') });
        const first = reg.dispatch('baton.attach', { maxHops: 5 }, { sessionId: 'sess-A' });
        const second = reg.dispatch('baton.attach', { maxHops: 20 }, { sessionId: 'sess-A' });
        await new Promise(r => setTimeout(r, 20));
        release();
        const [a, b] = await Promise.all([first, second]);
        ok('‼️ two attaches racing the git read: the first seals, the second is refused by name',
            a.ok && !b.ok && /already in chain/.test(b.error) && store.all().length === 1 && store.all()[0].maxLegs === 5);
        ok('…and the HEAD read later is laid onto the stored seal', store.all()[0].head === 'c0ffee12');
    }
    {
        const store = new BatonStore();
        const seal = (id, at, max) => ({
            id, chainId: 'chn_' + id, hop: 0, state: 'started', prompt: 'p', why: 'w',
            from: { sessionId: 'sess-A', agentId: 'dev', engine: 'claude', cwd: 'D:\\repo' },
            inherit: { surface: 'console' }, want: { surface: 'inherit', account: '@emptiest' },
            toSessionId: 'sess-A', maxLegs: max, createdAt: at, updatedAt: at
        });
        store.put(seal('old', NOW - 900, 5), seal('new', NOW - 100, 20));
        const bar = V.batonBarView(store.all(), 6, sid => sid === 'sess-A');
        ok('‼️ a run sealed twice before the fix: the bar draws the ONE chain its passes use (openerOf), no +1',
            bar && bar.chainId === 'chn_new' && bar.text === '⑂ 1/20' && !/chn_old/.test(bar.tooltip));
        ok('…and the legs menu lists the same one', V.runningChains(store.all(), () => true).map(b => b.chainId).join() === 'chn_new');
    }

    console.log(`test_baton_attach.js: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
