// X-497 — NO CHAIN STAYS ON THE BOARD BECAUSE ITS LEG CANNOT BE FOUND THROUGH ITS SESSION.
//
// Measured 2026-10-04: chn_mugu62u2001piq could not be ended from any door. Its one leg was a
// session sealed TWICE (two attaches 822 ms apart, before the S-104 guard): the newer seal's chain
// went on, and End looked the leg up by its session — openerOf found the OTHER chain's seal and
// refused with that chain's id. The same lookup refused a started leg that never named its session.
// Now such a leg is braked and closed on its own chain alone, with no session named (so nothing
// keyed by that session — the other chain's brake, failsafe, whisper — moves), and End reaches it
// from the op, the Chains page and the stale cleanup alike.
//
//   node test/test_chain_end_twin.js
'use strict';
const path = require('path');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const OUT = path.join(__dirname, '..', 'out', 'core');
const K = require(path.join(OUT, 'chainControl.js'));
const C = require(path.join(OUT, 'chainBoard.js'));
const B = require(path.join(OUT, 'baton.js'));
const { brakeStateOf } = require(path.join(OUT, 'batonLastLeg.js'));
const { failsafeVerdict } = require(path.join(OUT, 'batonFailsafe.js'));
const { BatonStore } = require(path.join(OUT, 'batonStore.js'));
const O = require(path.join(OUT, 'chainBoardOps.js'));

const NOW = 1790400000000;
const MIN = 60000;
const from = sid => ({ sessionId: sid, agentId: 'D:/agents/dev', engine: 'claude', cwd: 'D:\\repo', projectId: 'prj_1', launchId: 'lch_' + sid });
const mk = (id, chainId, hop, state, sid, to, at, extra) => ({
    id, chainId, hop, state, prompt: 'words of ' + id, why: 'w-' + id, from: from(sid),
    inherit: { surface: 'console', model: 'opus' }, want: { surface: 'inherit', account: '@pool' },
    ...(to ? { toSessionId: to } : {}), createdAt: at, updatedAt: at, ...extra
});
const T0 = NOW - 9 * 86400e3;
const firstLeg = { prompt: '(first leg — attached by the user (Console card))', maxLegs: 5 };
const sealA = mk('sA', 'chn_A', 0, 'started', 'S', 'S', T0, firstLeg);
const sealB = mk('sB', 'chn_B', 0, 'started', 'S', 'S', T0 + 822, firstLeg);
const passB = mk('pB', 'chn_B', 1, 'started', 'S', 'S2', T0 + 3 * 3600e3);
const twin = [sealA, sealB, passB];
const board = list => C.chainBoard({ batons: list, links: [], facts: () => undefined, now: NOW, maxLegs: 6, thresholds: { hangMs: MIN, waitMs: MIN } });
const rowOf = (list, id) => board(list).find(r => r.chainId === id);
const view = (list, sid) => JSON.stringify([B.batonRelayOf(list, sid) ?? null, brakeStateOf(list, sid) ?? null,
    failsafeVerdict(list, { sessionId: sid, endedAt: NOW + MIN, exitCode: 1 }).act]);

// ---------- the measured twin: the older chain is the one left behind ----------
{
    const r = K.endChain(twin, { chainId: 'chn_A', by: 'the user', now: NOW });
    ok('‼️ the twin left behind can be ended', r.ok === true);
    ok('…its own seal is braked and the closing record is on its own chain', r.braked?.id === 'sA' && !!r.braked.lastLeg
        && r.closing?.chainId === 'chn_A' && r.closing.hop === 1 && r.closing.state === 'done');
    ok('‼️ …the closing record names no session, and End offers none to close', r.closing?.from.sessionId === '' && r.sessionId === undefined);
    ok('…and the sentence says whose leg the session is, by the other chain\'s id', /its session S is a leg of chain chn_B, which is left as it is\./.test(r.sentence));
    const after = [r.braked, r.closing, sealB, passB];
    ok('‼️ the board reads it done, and the other chain still running on its own leg',
        rowOf(after, 'chn_A').state === 'done' && rowOf(after, 'chn_B').state === 'running' && rowOf(after, 'chn_B').sessionId === 'S2');
    ok('‼️ nothing keyed by either session moved: whisper, brake and failsafe read the same before and after',
        view(after, 'S') === view(twin, 'S') && view(after, 'S2') === view(twin, 'S2'));
    ok('…a second End says it has already ended', /already ended/.test(K.endChain(after, { chainId: 'chn_A', by: 'u', now: NOW }).why));
    ok('…and continuing it is refused in words: there is no session of its own to wait for',
        /closed with no session of its own to follow/.test(K.continueChain(after, { chainId: 'chn_A', by: 'u', now: NOW, prompt: 'go' }).why));
}

// ---------- the other way round: the newer seal is the one left behind ----------
{
    const sealOld = mk('sO', 'chn_O', 0, 'started', 'S', 'S', T0, firstLeg);
    const passOld = mk('pO', 'chn_O', 1, 'started', 'S', 'S3', T0 + 3600e3);
    const sealNew = mk('sN', 'chn_N', 0, 'started', 'S', 'S', T0 + 900, firstLeg);
    const r = K.endChain([sealOld, passOld, sealNew], { chainId: 'chn_N', by: 'the user', why: 'twin', now: NOW });
    ok('‼️ a newer twin whose session passed in the older chain ends too, naming that chain',
        r.ok && r.braked.id === 'sN' && r.closing.chainId === 'chn_N' && /\(ended by the user: twin\) — its session S is a leg of chain chn_O/.test(r.sentence));
}

// ---------- a started leg that never named its session ----------
{
    const seal = mk('s1', 'chn_U', 0, 'started', 'L1', 'L1', T0, firstLeg);
    const lost = mk('b1', 'chn_U', 1, 'started', 'L1', undefined, T0 + 3600e3);
    ok('it shows on the board as running', rowOf([seal, lost], 'chn_U').state === 'running');
    const r = K.endChain([seal, lost], { chainId: 'chn_U', by: 'the user', now: NOW });
    ok('‼️ it can be ended: the leg is braked and closed with no session', r.ok && r.braked.id === 'b1' && !!r.braked.lastLeg
        && r.closing.hop === 2 && r.closing.from.sessionId === '' && r.sessionId === undefined
        && /the leg never named its session, so only its record is closed\./.test(r.sentence));
    ok('…and the board reads it done', rowOf([seal, r.braked, r.closing], 'chn_U').state === 'done');
    const link = { chainId: 'chn_L', hop: 1, from: 'L1', state: 'started', createdAt: T0, updatedAt: T0 };
    const l = K.endChain([], { chainId: 'chn_L', by: 'the user', now: NOW, links: [link] });
    ok('only links left and the last one never named its session: a closing link, no session',
        l.ok && l.closingLink.state === 'done' && l.closingLink.from === '' && l.sessionId === undefined);
}

// ---------- the ordinary running leg is untouched by any of this ----------
{
    const seal = mk('s1', 'chn_R', 0, 'started', 'L1', 'L1', T0, firstLeg);
    const run = mk('b1', 'chn_R', 1, 'started', 'L1', 'L2', T0 + 3600e3);
    const r = K.endChain([seal, run], { chainId: 'chn_R', by: 'the user', now: NOW });
    ok('a leg its session speaks for is still braked through the session and closed from it',
        r.ok && r.closing.from.sessionId === 'L2' && r.sessionId === 'L2' && /handover line now asks for the note/.test(r.sentence));
}

// ---------- the doors: the op and the stale cleanup both reach it, and close no session ----------
(async () => {
    const store = new BatonStore();
    store.put(...twin);
    const closed = [];
    const deps = {
        store, factsNow: () => () => undefined, maxLegs: () => 6, now: () => NOW,
        thresholds: () => O.boardThresholds(() => undefined),
        sweep: () => { }, cancelRow: () => 'cancelled',
        closeLeg: async sid => { closed.push(sid); return 'closed'; }
    };
    const otherBefore = JSON.stringify(store.chain('chn_B'));
    const e = await O.endOnBoard(deps, { chain: 'chn_A', by: 'the user (Chains page)', endSession: true });
    ok('‼️ the Chains page\'s End with "close its session" ends it and closes no session (S runs chn_B)',
        e.ok && closed.length === 0 && store.chain('chn_A').some(b => b.state === 'done' && b.from.sessionId === ''));
    ok('…and the other chain\'s records are exactly as they were', JSON.stringify(store.chain('chn_B')) === otherBefore);
    const store2 = new BatonStore();
    store2.put(...twin);
    const r2 = O.endRecords({ ...deps, store: store2 }, { chain: 'chn_A', by: 'the stuck-items cleanup', why: 'hanging 9d' });
    ok('the stale cleanup\'s door (endRecords) ends it as well', r2.ok && store2.chain('chn_A').some(b => b.state === 'done'));

    console.log(`\ntest_chain_end_twin: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
