// S-140 — Pause / Continue for a relay chain: one mark, two modes.
//
// What must not go wrong quietly: a paused chain's successor is opened by no
// road but the user's Continue (session end, the sweep and its boot pass, a
// restart, a rescue, chains.continue); a `here` mark never holds an ordinary
// pass; an unmarked chain runs exactly as before; a held successor and a leg
// paused in place raise no stuck / hanging signal, and a stale mark brings the
// hanging rule back; a pass-and-pause is not barren.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const OUT = path.join(__dirname, '..', 'out', 'core');
const { passBaton } = require(path.join(OUT, 'baton.js'));
const { BatonStore } = require(path.join(OUT, 'batonStore.js'));
const { BatonRunner } = require(path.join(OUT, 'batonRunner.js'));
const { batonBrake } = require(path.join(OUT, 'batonBrake.js'));
const { chainBoard } = require(path.join(OUT, 'chainBoard.js'));
const { closingRecord } = require(path.join(OUT, 'batonFailsafe.js'));
const { continueChain } = require(path.join(OUT, 'chainControl.js'));
const { BridgeRegistry } = require(path.join(OUT, 'bridge.js'));
const P = require(path.join(OUT, 'chainPause.js'));
const O = require(path.join(OUT, 'chainPauseOps.js'));

const NOW = 1790000000000;
const manifestFor = (launchId) => ({
    launchId, at: NOW - 1000, engine: 'claude',
    identity: { engine: 'claude', providerId: 'anthropic', origin: 'builtin', scope: 'machine' },
    requested: { model: 'opus' }, agentId: 'dev', agentName: 'developer',
    mechanism: 'session', cwd: 'D:\\repo', surface: 'console'
});
const mark = (mode, extra = {}) => Object.assign({ mode, at: NOW, by: 'the user' }, extra);

function draftFrom(store, sessionId) {
    const launchId = 'lch_' + sessionId;
    const r = passBaton({ prompt: 'carry on from ' + sessionId, sessionId, launchId, manifest: manifestFor(launchId), prior: store.all(), now: NOW });
    if (!r.ok) { throw new Error(r.why); }
    return r;
}
function leave(store, sessionId) {
    const r = draftFrom(store, sessionId);
    store.put(r.baton, ...r.superseded);
    return r.baton;
}
/** A chain whose leg 2 runs in `sid`: leg 1 (sess-0) passed, and its baton started `sid`. */
function chainWithLeg(store, sid = 'sess-A') {
    const first = leave(store, 'sess-0');
    const opener = Object.assign({}, first, { state: 'started', toSessionId: sid, why: 'successor running' });
    store.put(opener);
    return opener;
}
const find = (store, id) => store.all().find(b => b.id === id);

function runnerOn(store) {
    const doors = [], notes = [];
    const runner = new BatonRunner({
        store,
        door: b => { doors.push(b.id); return { taskId: 'tsk_1', sessionId: 'succ-1' }; },
        evidence: () => ({ registered: false, live: 'ended', registers: true }),
        notify: (title, body, key) => notes.push({ title, body, key }),
        now: () => NOW + 5000
    });
    return { runner, doors, notes };
}

// ---- the door's one question ----
{
    const store = new BatonStore();
    const opener = chainWithLeg(store);
    const b = leave(store, 'sess-A');
    ok('an unmarked chain: nothing is held', P.pauseHeld(store.all(), b) === undefined);
    store.put(Object.assign({}, opener, { pause: mark('here') }));
    ok('‼️ a here mark never holds an ordinary pass', P.pauseHeld(store.all(), b) === undefined);
    ok('a here mark holds the failsafe\'s rescue', P.pauseHeld(store.all(), Object.assign({}, b, { rescue: 'died dirty' }))?.mode === 'here');
    ok('…but not a pass the engine made for the leg', P.pauseHeld(store.all(), Object.assign({}, b, { rescue: 'limit', fault: 'limit' })) === undefined);
    store.put(Object.assign({}, opener, { pause: mark('pass') }));
    ok('a pass mark holds the pass', P.pauseHeld(store.all(), b)?.mode === 'pass');
    ok('only a waiting baton is held', P.pauseHeld(store.all(), Object.assign({}, b, { state: 'parked' })) === undefined);
    ok('another chain\'s opener holds nothing', P.pauseHeld(store.all(), Object.assign({}, b, { chainId: 'chn_other' })) === undefined);
    ok('a hold on the baton itself holds it', P.pauseHeld([], Object.assign({}, b, { hold: mark('pass') }))?.mode === 'pass');
    ok('modes are here and pass only', P.pauseModeOf(' PASS ') === 'pass' && P.pauseModeOf('here') === 'here' && P.pauseModeOf('stop') === undefined);
}

// ---- freshness of a mark in place ----
{
    const m = mark('here', { at: NOW });
    ok('unknown facts disprove nothing', P.hereFresh(m, undefined));
    ok('the leg\'s own closing words are inside the settle', P.hereFresh(m, { idleSince: NOW + P.HERE_SETTLE_MS }));
    ok('a turn ended after the settle makes it stale', !P.hereFresh(m, { idleSince: NOW + P.HERE_SETTLE_MS + 1 }));
    ok('a gone session is read by its last line', P.hereFresh(m, { lastTs: NOW + 1000 }) && !P.hereFresh(m, { lastTs: NOW + P.HERE_SETTLE_MS + 1 }));
    ok('a pass mark is never "fresh in place"', !P.hereFresh(mark('pass'), undefined));
}

// ---- marking ----
{
    const store = new BatonStore();
    const opener = chainWithLeg(store);
    const r = P.markPause(store.all(), { sessionId: 'sess-A', mode: 'here', by: 'the user', now: NOW + 10 });
    ok('the mark goes on the running leg\'s opener', r.ok && r.on === 'leg' && r.baton.id === opener.id && r.baton.pause.mode === 'here' && r.baton.pause.at === NOW + 10);
    ok('‼️ nothing else on the opener moves (updatedAt included)', r.ok && r.baton.updatedAt === opener.updatedAt && r.baton.state === 'started');
    store.put(r.baton);
    const again = P.markPause(store.all(), { sessionId: 'sess-A', mode: 'here', by: 'session sess-A', words: 'stopped at step 3', now: NOW + 20 });
    ok('the same mode again keeps who paused it, refreshes when and where', again.ok && !again.changed && again.baton.pause.by === 'the user'
        && again.baton.pause.at === NOW + 20 && again.baton.pause.words === 'stopped at step 3');
    store.put(again.baton);
    const viaChain = P.markPause(store.all(), { chainId: opener.chainId, mode: 'pass', by: 'u2', now: NOW + 30 });
    ok('chain= names the running leg; another mode replaces the mark', viaChain.ok && viaChain.sessionId === 'sess-A' && viaChain.changed
        && viaChain.baton.pause.mode === 'pass' && viaChain.baton.pause.by === 'u2' && !viaChain.baton.pause.words);
    const ho = P.markPause(store.all(), { sessionId: 'sess-A', mode: 'here', by: 'u', handover: () => true, now: NOW });
    ok('here is refused once a HANDOVER order reached the leg', !ho.ok && /mode=pass/.test(ho.why));
    ok('…pass is not', P.markPause(store.all(), { sessionId: 'sess-A', mode: 'pass', by: 'u', handover: () => true, now: NOW }).ok);
    store.put(Object.assign({}, opener, { lastLeg: { at: NOW, by: 'u' } }));
    ok('a leg braked as the chain\'s last is refused', !P.markPause(store.all(), { sessionId: 'sess-A', mode: 'pass', by: 'u', now: NOW }).ok);
    store.put(opener);
    const passed = leave(store, 'sess-A');
    const h = P.markPause(store.all(), { sessionId: 'sess-A', mode: 'here', by: 'u', now: NOW + 40 });
    ok('a leg that already passed: its waiting successor is held (as a pass)', h.ok && h.on === 'successor' && h.baton.id === passed.id
        && h.baton.hold.mode === 'pass' && h.baton.updatedAt === passed.updatedAt);
    store.put(Object.assign({}, passed, { state: 'parked' }));
    ok('a successor already at the door (parked) is refused', !P.markPause(store.all(), { sessionId: 'sess-A', mode: 'pass', by: 'u', now: NOW }).ok);
    ok('no leg named is refused', !P.markPause([], { mode: 'pass', by: 'u', now: NOW }).ok);
    ok('a session in no chain is refused', !P.markPause(store.all(), { sessionId: 'nobody', mode: 'pass', by: 'u', now: NOW }).ok);
}

// ---- the runner: every road but Continue keeps a paused successor at the door ----
{
    const store = new BatonStore();
    const opener = chainWithLeg(store);
    store.put(Object.assign({}, opener, { pause: mark('pass') }));
    const b = leave(store, 'sess-A');
    const { runner, doors, notes } = runnerOn(store);
    runner.sessionEnded('sess-A', 'end');
    const held = find(store, b.id);
    ok('‼️ the session end does not open a paused chain\'s successor', doors.length === 0 && held.state === 'waiting-end' && held.hold && held.hold.mode === 'pass');
    ok('the hold is said once, as information', notes.length === 1 && /paused/.test(notes[0].title) && notes[0].key === `baton:${b.id}:paused`);
    runner.sweep(); runner.sweep(); runner.sessionEnded('sess-A', 'end');
    ok('‼️ the sweep (the boot pass too) does not open it, and says nothing again', doors.length === 0 && notes.length === 1 && find(store, b.id).state === 'waiting-end');
    const r = runner.startNow(find(store, b.id), 'the user');
    ok('‼️ the user\'s start opens it through the door', r.ok && doors.length === 1 && find(store, b.id).state === 'started');
    ok('…and lifts both marks', !find(store, b.id).hold && !find(store, opener.id).pause);
}
{
    const store = new BatonStore();
    chainWithLeg(store);
    leave(store, 'sess-A');
    const { runner, doors, notes } = runnerOn(store);
    runner.sessionEnded('sess-A', 'end');
    ok('an unmarked chain opens on the session end as before', doors.length === 1 && notes.length === 0);
}
{
    const store = new BatonStore();
    const opener = chainWithLeg(store);
    store.put(Object.assign({}, opener, { pause: mark('here') }));
    leave(store, 'sess-A');
    const { runner, doors } = runnerOn(store);
    runner.sessionEnded('sess-A', 'end');
    ok('‼️ a here mark does not hold the leg\'s own pass', doors.length === 1);
}
{
    const store = new BatonStore();
    const opener = chainWithLeg(store);
    store.put(Object.assign({}, opener, { pause: mark('here') }));
    const b = leave(store, 'sess-A');
    store.put(Object.assign({}, b, { rescue: 'the leg died with uncommitted work' }));
    const { runner, doors } = runnerOn(store);
    runner.sweep();
    ok('the failsafe\'s rescue of a leg paused in place waits for Continue', doors.length === 0 && find(store, b.id).hold.mode === 'here');
}
{
    const store = new BatonStore();
    const opener = chainWithLeg(store);
    store.put(Object.assign({}, opener, { pause: mark('pass') }));
    const c = continueChain(store.all(), { chainId: opener.chainId, by: 'u', running: 'idle', fallbackMax: 0, now: NOW });
    store.put(c.baton);
    const { runner, doors } = runnerOn(store);
    runner.sweep();
    ok('chains.continue\'s waiting baton is held too', c.ok && doors.length === 0 && find(store, c.baton.id).hold);
}

// ---- a restart: the record on disk still holds it ----
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-pause-'));
    const file = path.join(dir, 'batons.json');
    try {
        const s1 = new BatonStore(file);
        const opener = chainWithLeg(s1);
        s1.put(Object.assign({}, opener, { pause: mark('pass') }));
        const b = leave(s1, 'sess-A');
        runnerOn(s1).runner.sessionEnded('sess-A', 'end');
        s1.flush();
        const s2 = new BatonStore(file);
        const { runner, doors } = runnerOn(s2);
        runner.sweep();
        const kept = find(s2, b.id);
        ok('‼️ after a restart the boot sweep still holds it', doors.length === 0 && kept.state === 'waiting-end' && kept.hold && kept.hold.mode === 'pass');
        runner.startNow(kept, 'the user');
        ok('…and the user\'s start still opens it', doors.length === 1);
        s2.flush();
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// ---- the barren brake ----
{
    const store = new BatonStore();
    const b1 = leave(store, 'sess-0');
    store.put(Object.assign({}, b1, { state: 'started', toSessionId: 'sess-A', head: 'H' }));
    const b2 = leave(store, 'sess-A');
    store.put(Object.assign({}, b2, { state: 'started', toSessionId: 'sess-B', head: 'H' }));
    const draft = Object.assign({}, draftFrom(store, 'sess-B').baton, { head: 'H' });
    ok('two legs on the same HEAD: barren, as before', batonBrake(draft, store.all(), 0)?.kind === 'barren');
    store.put(Object.assign({}, find(store, b2.id), { pause: mark('pass') }));
    ok('‼️ a pass-and-pause is not barren', batonBrake(draft, store.all(), 0) === undefined);
    store.put(Object.assign({}, find(store, b2.id), { pause: mark('here') }));
    ok('a here mark does not lift the barren brake', batonBrake(draft, store.all(), 0)?.kind === 'barren');
}

// ---- the board ----
const T = { hangMs: 60000, waitMs: 60000 };
const board = (batons, facts = () => undefined) => chainBoard({ batons, links: [], facts, now: NOW + 3600000, maxLegs: 0, thresholds: T });
{
    const store = new BatonStore();
    chainWithLeg(store);
    const b = leave(store, 'sess-A');
    const plain = board(store.all())[0];
    ok('an unmarked waiting successor is stuck past the threshold (as before)', plain.signals.some(s => s.kind === 'stuck-wait') && !plain.paused);
    store.put(Object.assign({}, b, { hold: mark('pass') }));
    const r = board(store.all())[0];
    ok('‼️ a held successor is paused and not stuck', r.paused && r.paused.held && !r.signals.some(s => s.kind === 'stuck-wait'));
}
{
    const store = new BatonStore();
    const opener = chainWithLeg(store);
    const at = NOW + 1000;
    store.put(Object.assign({}, opener, { pause: mark('here', { at }) }));
    const of = (f) => (sid => sid === 'sess-A' ? f : undefined);
    const idle = { alive: true, idleSince: at + 30000 };
    const r = board(store.all(), of(idle))[0];
    ok('‼️ a fresh mark in place: paused, no hanging', r.paused && r.paused.mode === 'here' && !r.paused.held && !r.signals.some(s => s.kind === 'hanging'));
    const s = board(store.all(), of({ alive: true, idleSince: at + P.HERE_SETTLE_MS + 60000 }))[0];
    ok('‼️ once the session ran after the mark, the ordinary hanging rule is back', !s.paused && s.signals.some(x => x.kind === 'hanging'));
    const g = board(store.all(), of({ alive: false, lastTs: at + 5000 }))[0];
    ok('a leg paused in place whose session is gone (a restart) stays paused, not hanging', g.paused && g.live === 'gone' && !g.signals.some(x => x.kind === 'hanging'));
    ok('the same idle leg unmarked is hanging (as before)', board([opener], of(idle))[0].signals.some(x => x.kind === 'hanging'));
    store.put(Object.assign({}, opener, { pause: mark('pass', { at }) }));
    const p = board(store.all(), of(idle))[0];
    ok('a pass mark not yet reached: paused, and an idle leg still reads hanging', p.paused && p.paused.mode === 'pass' && p.signals.some(x => x.kind === 'hanging'));
    store.put(Object.assign({}, opener, { pause: mark('here', { at, words: 'stopped at step 3' }) }));
    const closing = closingRecord(opener, 'sess-A', 'done', 'the leg ended clean', 'bt_close', at + 9000);
    store.put(closing);
    const gone = of({ alive: false, lastTs: at + 2000 });
    const c = board(store.all(), gone)[0];
    ok('a chain closed under a leg paused in place reads paused (closed)', c.state === 'done' && c.paused && c.paused.closed);
    store.put(Object.assign({}, closing, { byUser: true }));
    ok('…not when the user ended that leg', !board(store.all(), gone)[0].paused);
    ok('the cleanup\'s set names the paused legs', P.pausedSessions([c, { sessionId: 'x' }]).has('sess-A') && P.pausedSessions([c, { sessionId: 'x' }]).size === 1);
}

// ---- the ops: chains.pause / chains.resume ----
function opsOn(store, o = {}) {
    const told = [];
    const { runner, doors } = runnerOn(store);
    const boardDeps = {
        store, factsNow: () => (o.facts || (() => undefined)), maxLegs: () => 0,
        thresholds: () => ({ hangMs: 60000, waitMs: 60000, sentences: {} }), now: () => NOW + 7000, sweep: () => runner.sweep()
    };
    const deps = {
        store, board: boardDeps, orders: () => ({}), handoverOf: o.handoverOf, now: () => NOW + 7000,
        tell: (sid, text) => { told.push({ sid, text }); return o.noCard ? { said: false, why: 'no card' } : { said: true }; }
    };
    const bridge = new BridgeRegistry();
    O.registerChainPauseOps(bridge, deps);
    return { bridge, told, doors, runner };
}
(async () => {
    {
        const store = new BatonStore();
        const opener = chainWithLeg(store);
        const { bridge, told, doors, runner } = opsOn(store);
        const ops = await bridge.dispatch('farm.ops', {});
        const names = JSON.stringify(ops.result);
        ok('farm.ops lists chains.pause and chains.resume', /chains\.pause/.test(names) && /chains\.resume/.test(names));
        const bad = await bridge.dispatch('chains.pause', { session: 'sess-A', mode: 'stop' });
        ok('an unknown mode is refused', !bad.ok && /here|pass/.test(bad.error));
        const r = await bridge.dispatch('chains.pause', { chain: opener.chainId, mode: 'pass' });
        ok('‼️ the user\'s pause says the order into the leg\'s card', r.ok && r.result.told === 'said' && told.length === 1 && told[0].sid === 'sess-A'
            && /^PAUSE — /.test(told[0].text) && r.result.order === null);
        ok('the mark is stored on the opener', find(store, opener.id).pause.mode === 'pass');
        leave(store, 'sess-A');
        runner.sessionEnded('sess-A', 'end');
        ok('the leg passes; its successor waits', doors.length === 0);
        const res = await bridge.dispatch('chains.resume', { chain: opener.chainId });
        ok('‼️ Continue releases the held successor through the door', res.ok && res.result.act === 'release' && doors.length === 1 && res.result.baton.state === 'started');
        const twice = await bridge.dispatch('chains.resume', { chain: opener.chainId });
        ok('a chain not paused is refused', !twice.ok);
    }
    {
        const store = new BatonStore();
        const opener = chainWithLeg(store);
        const { bridge, told } = opsOn(store);
        const r = await bridge.dispatch('chains.pause', { session: 'sess-A', mode: 'here', words: 'stopped at step 3' }, { sessionId: 'sess-A' });
        ok('‼️ a leg pausing itself is told nothing — its order is the answer', r.ok && told.length === 0 && /END YOUR TURN/.test(r.result.order));
        ok('…and its words are on the mark', find(store, opener.id).pause.words === 'stopped at step 3');
        const quiet = await bridge.dispatch('chains.pause', { session: 'sess-A', mode: 'pass', tell: false });
        ok('tell=false says nothing', quiet.ok && told.length === 0 && quiet.result.told === null);
    }
    {
        const store = new BatonStore();
        const opener = chainWithLeg(store);
        store.put(Object.assign({}, opener, { pause: mark('here', { at: NOW + 6000, words: 'stopped at step 3' }) }));
        const { bridge, told } = opsOn(store, { facts: sid => (sid === 'sess-A' ? { alive: true, idleSince: NOW + 6500 } : undefined) });
        const r = await bridge.dispatch('chains.resume', { session: 'sess-A' });
        ok('‼️ Continue on a leg paused in place speaks RESUME into the same session', r.ok && r.result.act === 'speak' && told.length === 1
            && /^RESUME — /.test(told[0].text) && /step 3/.test(told[0].text) && !find(store, opener.id).pause);
    }
    {
        const store = new BatonStore();
        const opener = chainWithLeg(store);
        store.put(Object.assign({}, opener, { pause: mark('here', { at: NOW + 6000, words: 'stopped at step 3' }) }));
        const { bridge, doors } = opsOn(store, { facts: sid => (sid === 'sess-A' ? { alive: false, lastTs: NOW + 6100 } : undefined) });
        const r = await bridge.dispatch('chains.resume', { chain: opener.chainId });
        ok('‼️ a leg paused in place whose session is gone is reopened from its words', r.ok && r.result.act === 'reopen' && doors.length === 1
            && /step 3/.test(store.all().find(b => b.state === 'started' && b.hop === opener.hop + 1 && b.from.sessionId === 'sess-A').prompt));
    }
    {
        const store = new BatonStore();
        const opener = chainWithLeg(store);
        store.put(Object.assign({}, opener, { pause: mark('pass') }));
        const { bridge, told } = opsOn(store);
        const r = await bridge.dispatch('chains.resume', { chain: opener.chainId });
        ok('Continue before the leg passed cancels the pause, saying nothing', r.ok && r.result.act === 'cancel' && told.length === 0 && !find(store, opener.id).pause);
    }
    {
        const store = new BatonStore();
        chainWithLeg(store);
        const { bridge } = opsOn(store, { handoverOf: () => ({ what: 'CONTEXT HANDOVER 41%', ts: NOW }) });
        const r = await bridge.dispatch('chains.pause', { session: 'sess-A', mode: 'here' });
        ok('the op refuses here after a HANDOVER order', !r.ok && /mode=pass/.test(r.error));
    }
    console.log(`test_chain_pause: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
