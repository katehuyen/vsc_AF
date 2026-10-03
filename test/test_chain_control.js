// S-121 — CONTINUE AND END A CHAIN, and the chain board on the bridge.
//
// What must not go wrong quietly: a continuation is a waiting baton from the leg
// that ran last (so the runner's own door opens it — never a second launcher);
// it starts from the last handover words under a "reopened" header, or the
// user's prompt; a working leg is never taken over; the ceiling is lifted only
// as far as the reopened leg unless told; ending a RUNNING leg is the user's
// last-leg brake plus a closing record, so the whisper, the brakes and the
// failsafe all read it as the end; and the three ops apply exactly that.
//
//   node test/test_chain_control.js
'use strict';
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'out', 'core');
const K = require(path.join(OUT, 'chainControl.js'));
const C = require(path.join(OUT, 'chainBoard.js'));
const B = require(path.join(OUT, 'baton.js'));
const { brakeStateOf } = require(path.join(OUT, 'batonLastLeg.js'));
const { failsafeVerdict } = require(path.join(OUT, 'batonFailsafe.js'));
const { batonBrake } = require(path.join(OUT, 'batonBrake.js'));
const { BridgeRegistry } = require(path.join(OUT, 'bridge.js'));
const { BatonStore } = require(path.join(OUT, 'batonStore.js'));
const O = require(path.join(OUT, 'chainBoardOps.js'));

const NOW = 1790000000000;
const MIN = 60000;
const from = (sessionId) => ({ sessionId, agentId: 'D:/agents/dev', engine: 'claude', cwd: 'D:\\repo', projectId: 'prj_1', launchId: 'lch_' + sessionId });
const mk = (id, hop, state, sid, to, extra) => ({
    id, chainId: 'chn_1', hop, state, prompt: 'words of ' + id, why: 'w-' + id, from: from(sid),
    inherit: { surface: 'console', model: 'opus' }, want: { surface: 'inherit', account: '@pool' },
    ...(to ? { toSessionId: to } : {}), createdAt: NOW - 50 * MIN, updatedAt: NOW - 50 * MIN, ...extra
});
const seal = mk('s0', 0, 'started', 'L1', 'L1', { prompt: '(first leg — task t1)', maxLegs: 6, createdAt: NOW - 90 * MIN });
const b1 = mk('b1', 1, 'started', 'L1', 'L2', { createdAt: NOW - 60 * MIN });
const done2 = mk('c2', 2, 'done', 'L2', undefined, { prompt: '', from: { ...from('L2'), launchId: '' }, createdAt: NOW - 10 * MIN, updatedAt: NOW - 10 * MIN });
const cont = (list, o) => K.continueChain(list, { chainId: 'chn_1', by: 'the user', fallbackMax: 6, now: NOW, ...o });

// ---------- continue an ended chain ----------
{
    const r = cont([seal, b1, done2]);
    ok('an ended chain reopens as a WAITING baton from the leg that ran last, on that leg\'s hop', r.ok && r.baton.state === 'waiting-end'
        && r.baton.hop === 2 && r.baton.from.sessionId === 'L2' && r.baton.chainId === 'chn_1');
    ok('…on the chain\'s own setup: the pool and the inherited model are kept', r.baton.want.account === '@pool' && r.baton.inherit.model === 'opus');
    ok('…starting from the last handover words under the reopened header', r.baton.prompt.startsWith(K.REOPEN_HEADER)
        && /words of b1$/.test(r.baton.prompt) && /reopened by the user\. It had stopped at leg 2 \(done: w-c2\)/.test(r.baton.prompt));
    ok('…a seal\'s placeholder is never taken for handover words', K.lastWords([seal], 'chn_1') === '');
    ok('…the record and the sentence say who and what opens next', /^reopened by the user — leg 3 opens once session L2/.test(r.baton.why)
        && r.baton.note === 'reopened by the user' && /leg 3 opens on its own setup/.test(r.sentence) && !r.seal);
    const own = cont([seal, b1, done2], { prompt: 'do X next', why: 'one more pass' });
    ok('the user\'s own prompt replaces the words, and the why is recorded', /do X next$/.test(own.baton.prompt) && !/words of b1/.test(own.baton.prompt)
        && /replaced by the user's own/.test(own.baton.prompt) && /reopened by the user: one more pass/.test(own.baton.why));
    ok('a braked pass reopens on its own hop and keeps its launch id', cont([seal, b1, mk('b2', 2, 'stopped', 'L2', undefined, { brake: 'ceiling' })]).baton.from.launchId === 'lch_L2');
    ok('no handover words on record: refused, asking for a prompt', /no handover words on record/.test(cont([seal, { ...done2, hop: 1, from: from('L1') }]).why));
    ok('an unknown chain is refused by name', /no chain chn_9/.test(K.continueChain([seal], { chainId: 'chn_9', by: 'u', fallbackMax: 6, now: NOW }).why));
}

// ---------- a live or running chain ----------
{
    ok('a successor already waiting: refused, pointing at baton.now', /baton\.now starts it/.test(cont([seal, b1, mk('b2', 2, 'waiting-end', 'L2')]).why));
    ok('‼️ a WORKING leg is never taken over', /is working/.test(cont([seal, b1], { running: 'working' }).why));
    ok('…nor one whose state is not known (unknown is never evidence)', /not known/.test(cont([seal, b1]).why));
    const idle = cont([seal, b1], { running: 'idle' });
    ok('an idle running leg: a waiting baton from its session, on the hop its pass would carry', idle.ok && idle.baton.hop === 2
        && idle.baton.from.sessionId === 'L2' && idle.baton.from.launchId === '');
    ok('a gone one too', cont([seal, b1], { running: 'gone' }).ok);
}

// ---------- the ceiling ----------
{
    const tight = [{ ...seal, maxLegs: 2 }, b1, done2];
    const r = cont(tight);
    ok('past the ceiling: lifted exactly to the reopened leg, which becomes the last', r.ok && r.seal.maxLegs === 3 && /Leg 3 is the chain's last under its ceiling of 3/.test(r.sentence));
    ok('maxLegs given: that ceiling', cont(tight, { maxLegs: 5 }).seal.maxLegs === 5 && cont(tight, { maxLegs: 0 }).seal.maxLegs === 0);
    ok('a ceiling below the reopened leg, or not a number: refused', /give 3 or more/.test(cont(tight, { maxLegs: 2 }).why) && /whole number/.test(cont(tight, { maxLegs: 'x' }).why));
    ok('room under the ceiling: the seal is not touched', !cont([seal, b1, done2]).seal);
    const noSeal = cont([b1, done2], { fallbackMax: 2 });
    ok('no seal of its own: nothing to lift, and the sentence names the setting', noSeal.ok && !noSeal.seal && /agentFarm\.batonMaxHops/.test(noSeal.sentence));
}

// ---------- end ----------
{
    const w = mk('b2', 2, 'waiting-end', 'L2');
    const e = K.endChain([seal, b1, w], { chainId: 'chn_1', by: 'the user', why: 'enough', now: NOW });
    ok('a waiting successor: it is the one to stop, and the session it waited on is named', e.ok && e.stop.length === 1 && e.stop[0].id === 'b2'
        && e.sessionId === 'L2' && e.why === 'ended by the user: enough' && !e.closing);
    const r = K.endChain([seal, b1], { chainId: 'chn_1', by: 'the user', now: NOW });
    ok('a running leg: braked as the last and closed with a done record from its session', r.ok && r.braked.lastLeg?.by === 'the user'
        && r.closing.state === 'done' && r.closing.hop === 2 && r.closing.from.sessionId === 'L2' && r.sessionId === 'L2');
    const after = [seal, r.braked, r.closing];
    ok('‼️ …its handover line asks for the note, not a pass', B.batonRelayOf(after, 'L2')?.braked === true);
    ok('‼️ …a pass it makes anyway is braked', batonBrake(mk('p2', 2, 'waiting-end', 'L2'), after, 6)?.kind === 'user');
    ok('‼️ …the failsafe opens nothing when it ends', failsafeVerdict(after, { sessionId: 'L2', endedAt: NOW + MIN, exitCode: 1 }).act === 'none');
    ok('…the card reads the chain as ended at this leg', brakeStateOf(after, 'L2') === 'locked');
    ok('…and the board reads done', C.chainBoard({ batons: after, links: [], facts: () => undefined, now: NOW, maxLegs: 6, thresholds: { hangMs: MIN, waitMs: MIN } })[0].state === 'done');
    ok('an ended chain: refused as data', /already ended/.test(K.endChain(after, { chainId: 'chn_1', by: 'u', now: NOW }).why));
    const reopened = cont(after);
    ok('and an ended chain can be reopened afterwards', reopened.ok && reopened.baton.hop === 2 && reopened.baton.from.sessionId === 'L2');
}

// ---------- what the board knows about a leg ----------
{
    const { legFactsSnapshot } = require(path.join(OUT, 'chainLegFacts.js'));
    const usage = { input: 10, output: 5, cacheRead: 0, cacheWrite: 0 };
    const info = (sessionId, source) => ({ sessionId, title: 'T ' + sessionId, agentName: 'dev', firstTs: 1, lastTs: 9, cost: 0.5, usage, ...(source ? { source } : {}) });
    const f = legFactsSnapshot({
        cards: [
            { sessionId: 'A', status: 'ended', queued: 0, asking: false },
            { sessionId: 'A', status: 'idle', queued: 0, asking: false, turnEndedAt: 500 },
            { sessionId: 'Q', status: 'idle', queued: 0, asking: true, turnEndedAt: 500 },
            { sessionId: 'W', status: 'working', queued: 0, asking: false }
        ],
        live: [{ sessionId: 'T', status: 'waiting-input', lastEventTs: 700 }],
        registered: new Set(['R']),
        sessions: [info('A'), info('G'), info('X', 'codex'), info('T', 'codex'), info('C')]
    });
    const claudeWatched = legFactsSnapshot({ cards: [], live: [{ sessionId: 'C', status: 'waiting-input', lastEventTs: 700 }], registered: new Set(), sessions: [info('C')] });
    ok('‼️ a claude session the watcher still lists but no process is registered for: gone — the registry wins, as in the runner', claudeWatched('C').alive === false);
    ok('a live card at rest: alive and idle since its turn ended (an ended card left in the list does not hide it)', f('A').alive && f('A').idleSince === 500
        && f('A').title === 'T A' && f('A').agentName === 'dev' && f('A').cost === 0.5 && f('A').tokens > 0);
    ok('a card with a question open or a turn running is alive, not idle', f('Q').alive && f('Q').idleSince === undefined && f('W').alive && f('W').idleSince === undefined);
    ok('a watched session of an engine with no registry, waiting for input: alive and idle since its last event', f('T').alive && f('T').idleSince === 700);
    ok('a registered process with nothing else known is alive', f('R').alive === true);
    ok('a claude session with no process, card or watcher: gone (the runner\'s own verdict)', f('G').alive === false);
    ok('another engine nobody watches: gone too, as the runner reads it', f('X').alive === false);
    ok('‼️ a session nothing knows: no facts at all', f('Z') === undefined);
}

// ---------- the ops ----------
(async () => {
    const store = new BatonStore();
    store.put(seal, b1, mk('b2', 2, 'waiting-end', 'L2', undefined, { taskId: 'row1', updatedAt: NOW - 40 * MIN }));
    const swept = [], closed = [], cancelled = [];
    const reg = new BridgeRegistry();
    const deps = {
        store, factsNow: () => () => undefined, maxLegs: () => 6, now: () => NOW,
        thresholds: () => O.boardThresholds(() => undefined),
        sweep: () => swept.push(1), cancelRow: (id) => { cancelled.push(id); return 'cancelled'; },
        closeLeg: async (sid) => { closed.push(sid); return 'closed'; }
    };
    O.registerChainBoardOps(reg, deps);
    const t = O.boardThresholds(() => undefined);
    ok('the thresholds come from the flex chain, minutes as ms, each with where it came from', t.hangMs > 0 && t.hangMs % MIN === 0
        && t.waitMs > 0 && t.waitMs % MIN === 0 && !!t.sentences.hangMinutes && !!t.sentences.waitMinutes);
    ok('a user value wins', O.boardThresholds(k => (k === 'chainHangMinutes' ? 5 : undefined)).hangMs === 5 * MIN);
    const list = await reg.dispatch('chains.list', {});
    ok('chains.list: counts, rows and the thresholds in force', list.ok && list.result.counts.waiting === 1 && list.result.chains[0].chainId === 'chn_1'
        && list.result.total === 1 && list.result.thresholds.hangMs === t.hangMs);
    const att = await reg.dispatch('chains.list', { attention: true });
    const short = new BridgeRegistry();
    O.registerChainBoardOps(short, { ...deps, thresholds: () => O.boardThresholds(k => (k === 'chainWaitMinutes' ? 30 : undefined)) });
    const att30 = await short.dispatch('chains.list', { attention: true });
    ok('…attention=true: a successor waiting 40 minutes past a 30-minute line is flagged stuck-wait', att30.result.chains.length === 1
        && att30.result.chains[0].signals[0].kind === 'stuck-wait' && att.ok);
    const busy = await reg.dispatch('chains.continue', { chain: 'chn_1' });
    ok('chains.continue on a waiting chain: refused as data', !busy.ok && /baton\.now/.test(busy.error));
    const end = await reg.dispatch('chains.end', { chain: 'chn_1', why: 'done for tonight', endSession: true });
    ok('chains.end: the waiting baton stopped through stopBatons (its unstarted row cancelled), the session closed', end.ok
        && end.result.stopped.length === 1 && cancelled[0] === 'row1' && closed[0] === 'L2' && end.result.session === 'closed'
        && store.get('b2').state === 'stopped' && /ended by the user: done for tonight/.test(store.get('b2').why));
    const again = await reg.dispatch('chains.continue', { chain: 'chn_1', why: 'one more' });
    ok('chains.continue after it: a new waiting baton on the store, the runner asked to look', again.ok && again.result.baton.state === 'waiting-end'
        && store.all().filter(b => b.state === 'waiting-end').length === 1 && swept.length === 1);
    const ops = reg.catalog().map(o => o.op);
    ok('the three ops are in the catalog', ['chains.list', 'chains.continue', 'chains.end'].every(op => ops.includes(op)));

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
