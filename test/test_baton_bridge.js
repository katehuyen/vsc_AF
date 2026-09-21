// S-69 — baton.pass / baton.status, DISPATCHED through a real BridgeRegistry.
//
// What must not go wrong quietly: the pass starts nothing and says what will
// happen; its owner comes from the caller resolution, its setup from the sealed
// manifest; every refusal is data naming the step that refused; a second pass
// replaces the first on disk as well as in the answer.
'use strict';
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const OUT = path.join(__dirname, '..', 'out', 'core');
const { BridgeRegistry } = require(path.join(OUT, 'bridge.js'));
const { registerBatonOps } = require(path.join(OUT, 'batonBridge.js'));
const { BatonStore } = require(path.join(OUT, 'batonStore.js'));

const NOW = 1790000000000;
const manifest = {
    launchId: 'lch_abc123def', at: NOW - 1000, engine: 'claude',
    identity: { engine: 'claude', providerId: 'anthropic', origin: 'builtin', scope: 'machine' },
    requested: { model: 'opus', effort: 'high' }, agentId: 'dev', agentName: 'developer',
    mechanism: 'session', cwd: 'D:\\repo', surface: 'console'
};

function setup(o = {}) {
    const store = new BatonStore();
    const reg = new BridgeRegistry();
    const rooms = [];
    registerBatonOps(reg, Object.assign({
        store,
        caller: async (arg, from) => (arg || (from && from.sessionId)
            ? { ok: true, sessionId: arg || from.sessionId, source: arg ? 'arg' : 'env' }
            : { ok: false, why: 'no caller evidence' }),
        launchIdOf: sid => (sid === 'sess-A' ? 'lch_abc123def' : undefined),
        manifests: () => [manifest],
        room: b => { rooms.push(b); return { account: 'kate' }; },
        now: () => NOW
    }, o));
    return { store, reg, rooms };
}

(async () => {
    const { store, reg, rooms } = setup();
    const ops = (await reg.dispatch('farm.ops', {})).result;
    const passSpec = ops.find(c => c.op === 'baton.pass');
    ok('both ops are in the catalog', !!passSpec && ops.some(c => c.op === 'baton.status'));
    ok('‼️ the catalog teaches the file recipe, never an inline prompt', /@baton\.json/.test(passSpec.describe));

    const r = await reg.dispatch('baton.pass', { prompt: 'Continue S-70.', note: 'for Murat' }, { sessionId: 'sess-A' });
    ok('a pass from a known session is accepted', r.ok);
    ok('‼️ …and starts nothing: the baton waits for the session to end',
        r.ok && r.result.baton.state === 'waiting-end' && /Nothing starts while session sess-A/.test(r.result.sentence));
    ok('the owner and how it was found are reported', r.ok && r.result.owner.sessionId === 'sess-A' && r.result.owner.source === 'env');
    ok('the setup came off the manifest', r.ok && r.result.baton.inherit.model === 'opus' && r.result.baton.surface === 'console');
    ok('the room was asked for THIS baton, and named in the sentence',
        rooms.length === 1 && rooms[0].want.account === '@emptiest' && /on @emptiest \(kate\)/.test(r.result.sentence));
    ok('the note is kept for people and is not the prompt', r.ok && r.result.baton.note === 'for Murat' && r.result.baton.prompt === 'Continue S-70.');
    ok('it is on the store', store.all().length === 1 && store.all()[0].id === r.result.baton.id);

    const again = await reg.dispatch('baton.pass', { prompt: 'Actually, S-71.' }, { sessionId: 'sess-A' });
    ok('‼️ a second pass replaces the first — in the answer and on the store',
        again.ok && again.result.superseded[0] === r.result.baton.id
        && store.get(r.result.baton.id).state === 'stopped' && store.all().filter(b => b.state === 'waiting-end').length === 1);

    const noCaller = await reg.dispatch('baton.pass', { prompt: 'x' });
    ok('no caller evidence is a refusal from the caller step',
        !noCaller.ok && /no caller evidence/.test(noCaller.error) && noCaller.detail.step === 'caller');
    const noLaunch = await reg.dispatch('baton.pass', { prompt: 'x', from: 'sess-B' });
    ok('‼️ a session with no launch id is refused with the reason and the ids',
        !noLaunch.ok && /no launch id/.test(noLaunch.error) && noLaunch.detail.step === 'pass'
        && noLaunch.detail.sessionId === 'sess-B' && noLaunch.detail.source === 'arg');
    ok('an empty prompt is refused', !(await reg.dispatch('baton.pass', { prompt: ' ' }, { sessionId: 'sess-A' })).ok);
    ok('an unknown surface is refused', !(await reg.dispatch('baton.pass', { prompt: 'x', surface: 'tmux' }, { sessionId: 'sess-A' })).ok);
    ok('refusals wrote nothing', store.all().length === 2);

    const parked = setup({ room: () => ({ resetsAt: Date.UTC(2026, 8, 21, 14, 37) }), fmtTime: () => '14:37' });
    const p = await parked.reg.dispatch('baton.pass', { prompt: 'x' }, { sessionId: 'sess-A' });
    ok('every account full → the sentence says parked until the reset', p.ok && /parked until 14:37/.test(p.result.sentence));
    const long = await parked.reg.dispatch('baton.pass', { prompt: 'y'.repeat(900) }, { sessionId: 'sess-A' });
    ok('a long prompt is previewed, and its length said', long.ok && long.result.baton.prompt.length === 301 && long.result.baton.promptChars === 900);

    // status
    const st = await reg.dispatch('baton.status', {});
    ok('status lists the live baton and its chain',
        st.ok && st.result.live.length === 1 && st.result.live[0].id === again.result.baton.id
        && st.result.chains.length === 2 && st.result.total === 2);
    const one = await reg.dispatch('baton.status', { chain: again.result.baton.chainId });
    ok('one chain by id', one.ok && one.result.chains.length === 1 && one.result.chains[0].live === true);
    const bySession = await reg.dispatch('baton.status', { session: 'sess-A' });
    ok('by the session that passed', bySession.ok && bySession.result.chains.length === 2);
    ok('a session that passed nothing has nothing', (await reg.dispatch('baton.status', { session: 'nobody' })).result.chains.length === 0);

    // ---- S-74: the brake and the go ----
    {
        const ops2 = (await reg.dispatch('farm.ops', {})).result;
        ok('S-74 — both user buttons are in the catalog', ops2.some(c => c.op === 'baton.stop') && ops2.some(c => c.op === 'baton.now'));
        const none = await reg.dispatch('baton.stop', {});
        ok('stop with no handle is refused as data', !none.ok && /say which/.test(none.error));
        const miss = await reg.dispatch('baton.stop', { baton: 'btn_nope' });
        ok('stop of nothing live is refused, naming what was asked', !miss.ok && /nothing live matches baton btn_nope/.test(miss.error));
        const live = again.result.baton;
        const stopped = await reg.dispatch('baton.stop', { session: 'sess-A', why: 'I opened the successor by hand' });
        ok('stop by the passing session stops its live baton with the reason',
            stopped.ok && stopped.result.stopped.length === 1 && stopped.result.stopped[0].id === live.id
            && stopped.result.stopped[0].state === 'stopped' && stopped.result.stopped[0].why === 'I opened the successor by hand');
        ok('‼️ nothing is deleted: the record stays, stopped, and status still shows it',
            store.get(live.id).state === 'stopped' && (await reg.dispatch('baton.status', {})).result.total === 2
            && (await reg.dispatch('baton.status', {})).result.live.length === 0);
        ok('stopping it again finds nothing live', !(await reg.dispatch('baton.stop', { baton: live.id })).ok);

        const p3 = await reg.dispatch('baton.pass', { prompt: 'third' }, { sessionId: 'sess-A' });
        const p3b = p3.result.baton;
        const byChain = await reg.dispatch('baton.stop', { chain: p3b.chainId });
        ok('stop by chain stops every live baton of it, with the default reason',
            byChain.ok && byChain.result.stopped.length === 1 && byChain.result.stopped[0].why === 'stopped by the user');

        const noRunner = await reg.dispatch('baton.now', { baton: 'x' });
        ok('now without a runner wired is refused by name', !noRunner.ok && /no runner/.test(noRunner.error));
        const calls = [];
        const w = setup({
            startNow: (b, by) => { calls.push([b.id, by]); return { ok: true, baton: Object.assign({}, b, { state: 'started', toSessionId: 'succ', why: 'started now by ' + by }) }; }
        });
        ok('now needs a handle', !(await w.reg.dispatch('baton.now', {})).ok);
        ok('now of nothing live is refused', !(await w.reg.dispatch('baton.now', { session: 'sess-A' })).ok);
        const passedOnW = await w.reg.dispatch('baton.pass', { prompt: 'go now' }, { sessionId: 'sess-A' });
        const went = await w.reg.dispatch('baton.now', { session: 'sess-A', by: 'Murat' });
        ok('now hands the live baton to the runner with who pressed it, and answers its new state',
            went.ok && calls.length === 1 && calls[0][0] === passedOnW.result.baton.id && calls[0][1] === 'Murat'
            && went.result.baton.state === 'started' && went.result.baton.toSessionId === 'succ');
        ok('a chain handle is not a `now` handle (one baton at a time)', !(await w.reg.dispatch('baton.now', { chain: passedOnW.result.baton.chainId })).ok);
        const refusing = setup({ startNow: () => ({ ok: false, why: 'a baton that is started cannot be started now.' }) });
        await refusing.reg.dispatch('baton.pass', { prompt: 'x' }, { sessionId: 'sess-A' });
        const r2 = await refusing.reg.dispatch('baton.now', { session: 'sess-A' });
        ok('the runner\'s refusal is the op\'s refusal, with the baton named', !r2.ok && /cannot be started now/.test(r2.error) && r2.detail && r2.detail.step === 'now');
    }

    console.log(`test_baton_bridge.js: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
