// S-127 — THE STUCK-ITEMS CLEANUP SEES A HANGING CHAIN AND ENDS IT.
//
// A started leg that ended (or sits idle) with no pass and no closing record leaves no live baton, so
// the cleanup's baton scan never saw it while the Chains board showed it "running" and hanging. The
// cleanup now reads the board's hanging signal (24h+) and ends the chain the way chains.end writes
// its records — without closing any session. A chain whose batons the store's cap already dropped
// (only links left) is ended by one more link, so neither the cleanup nor the page's ■ is refused.
//
//   node test/test_stale_chains.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const OUT = path.join(__dirname, '..', 'out', 'core');
const S = require(path.join(OUT, 'staleScan.js'));
const K = require(path.join(OUT, 'chainControl.js'));
const O = require(path.join(OUT, 'chainBoardOps.js'));
const { BatonStore } = require(path.join(OUT, 'batonStore.js'));

const H = 3600 * 1000, NOW = 1790000000000;
const from = sessionId => ({ sessionId, agentId: 'D:/agents/dev', engine: 'claude', cwd: 'D:\\repo', projectId: 'prj_1', launchId: 'lch_' + sessionId });
const mk = (id, chainId, hop, state, sid, to, at) => ({
    id, chainId, hop, state, prompt: 'words of ' + id, why: 'w-' + id, from: from(sid),
    inherit: { surface: 'console', model: 'opus' }, want: { surface: 'inherit', account: '@pool' },
    ...(to ? { toSessionId: to } : {}), createdAt: at, updatedAt: at
});

// ---------- the scan ----------
const hang = (since, why = 'leg 2 (session L2) ended with no pass and no closing record') => ({ kind: 'hanging', since, why });
const rows = [
    { chainId: 'chn_old', leg: 2, agentName: 'developer', signals: [hang(NOW - 30 * H)] },
    { chainId: 'chn_fresh', leg: 4, signals: [hang(NOW - 5 * H)] },
    { chainId: 'chn_wait', leg: 3, signals: [{ kind: 'stuck-wait', since: NOW - 40 * H, why: 'waits' }] },
    { chainId: 'chn_nosince', leg: 1, signals: [{ kind: 'hanging', why: 'no time' }] },
    { chainId: 'chn_ok', leg: 1, signals: [] }
];
const items = S.scanStale({ now: NOW, tasks: [], cards: [], batons: [], chains: rows });
ok('‼️ a chain hanging 24h+ is stuck, by its chain id', items.length === 1 && items[0].kind === 'chain' && items[0].id === 'chn_old'
    && items[0].title === 'chain chn_old leg 2 (developer)' && /no pass and no closing record/.test(items[0].why) && items[0].ageMs === 30 * H);
ok('a fresher hang, another signal and a signal without a time are not', !items.some(x => x.id !== 'chn_old'));
ok('without chains nothing changes for the other kinds', S.scanStale({ now: NOW, tasks: [], cards: [], batons: [] }).length === 0);
ok('its line in the chip and the notice', S.staleLines(items)[0] === '1 relay chains hanging with no pass and no closing record — oldest 1d 6h');
ok('the notice says what cleaning does to it', /a hanging chain gets its closing record/.test(S.staleNotice(items).body));

// ---------- the clean ----------
const ended = [];
const deps = {
    tasks: () => [], cards: () => [], batons: () => [], chains: () => rows, now: () => NOW,
    cancelTask: () => undefined, closeCard: () => undefined, stopBaton: () => undefined,
    endChain: (chain, by, why) => ended.push([chain, by, why])
};
const r = S.cleanStale(deps, undefined, 'kate');
ok('‼️ cleaning ends it with who and why', r.cleaned.length === 1 && ended.length === 1 && ended[0][0] === 'chn_old'
    && ended[0][1] === 'the stuck-items cleanup (kate)' && ended[0][2] === 'hanging 1d 6h');
const refused = S.cleanStale({ ...deps, endChain: () => { throw new Error('chain chn_old has already ended'); } });
ok('a refusal is a failure with its reason, not a crash', refused.cleaned.length === 0 && /already ended/.test((refused.failed[0] || {}).why));
ok('a host that cannot end chains fails the item, it never pretends', /cannot end a chain/.test((S.cleanStale({ ...deps, endChain: undefined }).failed[0] || {}).why));

// ---------- the whole path: a real store, the board, the records ----------
const opsDeps = (store, facts) => ({
    store, factsNow: () => sid => facts[sid], maxLegs: () => 0, now: () => NOW,
    thresholds: () => ({ hangMs: 30 * 60000, waitMs: 30 * 60000, sentences: {} }),
    closeLeg: async () => { throw new Error('the cleanup never closes a session'); }
});
{
    const store = new BatonStore();
    store.put(mk('s0', 'chn_a', 0, 'started', 'L1', 'L1', NOW - 60 * H), mk('b1', 'chn_a', 1, 'started', 'L1', 'L2', NOW - 50 * H));
    const od = opsDeps(store, { L1: { alive: false, lastTs: NOW - 55 * H }, L2: { alive: false, lastTs: NOW - 40 * H } });
    const before = O.boardNow(od)[0];
    ok('the board shows it running and hanging', before.state === 'running' && before.signals.some(s => s.kind === 'hanging'));
    const sd = { ...deps, chains: () => O.boardNow(od), endChain: (chain, by, why) => { const e = O.endRecords(od, { chain, by, why }); if (!e.ok) { throw new Error(e.why); } } };
    ok('the cleanup lists it', S.staleNow(sd).some(x => x.kind === 'chain' && x.id === 'chn_a'));
    const c = S.cleanStale(sd, ['chn_a'], 'the user (notification)');
    const after = O.boardNow(od)[0];
    ok('‼️ cleaned: the closing record is written and the board reads done, nothing hanging', c.cleaned.length === 1 && after.state === 'done'
        && !after.signals.some(s => s.kind === 'hanging') && store.all().some(b => b.state === 'done' && b.hop === 2 && /stuck-items cleanup/.test(b.why)));
    ok('…and the cleanup has nothing left', S.staleNow(sd).length === 0);
}
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-s127-'));
    const file = path.join(dir, 'batons.json');
    const link = { chainId: 'chn_t', hop: 3, from: 'L3', to: 'L4', state: 'started', createdAt: NOW - 80 * H, updatedAt: NOW - 80 * H };
    fs.writeFileSync(file, JSON.stringify({ batons: [], links: [link] }), 'utf8');
    const store = new BatonStore(file);
    const od = opsDeps(store, { L4: { alive: false, lastTs: NOW - 70 * H } });
    const row = O.boardNow(od)[0];
    ok('a chain only its links remember reads running and hanging', row.trimmed === true && row.state === 'running' && row.signals.some(s => s.kind === 'hanging'));
    const pure = K.endChain([], { chainId: 'chn_t', by: 'x', now: NOW, links: store.links() });
    ok('‼️ endChain ends it with the closing record\'s link (hop+1, from the leg, done)', pure.ok && pure.closingLink
        && pure.closingLink.hop === 4 && pure.closingLink.from === 'L4' && pure.closingLink.state === 'done' && pure.sessionId === 'L4'
        && /only its links were left on record/.test(pure.sentence));
    ok('without links it is refused as before', K.endChain([], { chainId: 'chn_t', by: 'x', now: NOW }).ok === false);
    const e = O.endRecords(od, { chain: 'chn_t', by: 'the stuck-items cleanup (kate)', why: 'hanging 2d 22h' });
    const now = O.boardNow(od)[0];
    ok('‼️ the store writes it and the board reads done', e.ok && now.state === 'done' && !now.signals.length);
    store.flush();
    const disk = JSON.parse(fs.readFileSync(file, 'utf8'));
    ok('the closing link is on disk, newest first', disk.links.length === 2 && disk.links[0].state === 'done' && disk.links[0].hop === 4);
    ok('a second end is refused (nothing is started any more)', O.endRecords(od, { chain: 'chn_t', by: 'x' }).ok === false);
    const done = K.endChain([], { chainId: 'chn_t', by: 'x', now: NOW, links: [{ ...link, state: 'done' }] });
    ok('a link-only chain that already ended is refused', done.ok === false);
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temp */ }
}
(async () => {
    const store = new BatonStore();
    store.put(mk('t1', 'chn_p', 1, 'started', 'P1', 'P2', NOW - 30 * H));
    const closed = [];
    const od = { ...opsDeps(store, { P2: { alive: true, idleSince: NOW - 26 * H } }), closeLeg: async (sid, why) => { closed.push([sid, why]); return 'closed'; } };
    const r2 = await O.endOnBoard(od, { chain: 'chn_p', by: 'the user (Chains page)', endSession: true });
    ok('chains.end still closes the session when asked, with the recorded line', r2.ok && r2.session === 'closed'
        && closed[0][0] === 'P2' && /^ended by the user \(Chains page\)/.test(closed[0][1]) && !('why' in r2));
    console.log(`\ntest_stale_chains: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
