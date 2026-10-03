// S-124 — THE CHAIN BOARD'S ATTENTION SIGNALS ON THE LIVING PAGE AND THE BELL.
//
// What must not go wrong quietly: the Living row is built from the board's own
// rows (the ones chains.list answers), never re-derived; it warns while any
// chain carries a signal and points at the Chains page; it says nothing when
// no chain is live; and the host hands it to the Living report through the
// one extension point, so living.ts does not grow a second chain reader.
// The bell gets hanging and stuck-wait only, once each, withdrawn when they
// clear, never during boot, and the old ones arrive as a single notice.
//
//   node test/test_chain_signals.js
'use strict';
const path = require('path');
const fs = require('fs');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'out', 'core');
const { chainLivingSignals } = require(path.join(OUT, 'chainSignals.js'));
const { buildLivingReport } = require(path.join(OUT, 'living.js'));

const NOW = 1790000000000, MIN = 60000;
const row = (chainId, bucket, signals, since) => ({ chainId, state: bucket, bucket, why: 'w', since: since ?? NOW - 5 * MIN, leg: 2, maxLegs: 0, lastAt: NOW, signals });

{
    ok('no live chain: no row at all', chainLivingSignals([row('c1', 'done', [])], NOW).length === 0 && chainLivingSignals([], NOW).length === 0);
    const calm = chainLivingSignals([row('c1', 'running', []), row('c2', 'waiting', []), row('c3', 'done', [])], NOW);
    ok('chains moving and none flagged: one ok row counting the live ones, to the Chains page', calm.length === 1 && calm[0].state === 'ok'
        && /^2 chain/.test(calm[0].detail) && calm[0].goto === 'chains');
    const hot = chainLivingSignals([
        row('c1', 'running', [{ kind: 'hanging', why: 'idle', since: NOW - 40 * MIN }]),
        row('c2', 'waiting', [{ kind: 'stuck-wait', why: 'waits' }, { kind: 'stuck-wait', why: 'again' }], NOW - 20 * MIN),
        row('c3', 'running', [])
    ], NOW);
    ok('a flagged chain warns, names each chain with its signals once, and goes to the Chains page', hot.length === 1 && hot[0].state === 'warn'
        && hot[0].detail === 'c1: hanging · c2: stuck waiting' && hot[0].goto === 'chains' && !!hot[0].hint);
    ok('…its age is the oldest signal\'s, the row\'s own since when the signal has none', hot[0].ageMs === 40 * MIN);
    const many = chainLivingSignals(['a', 'b', 'c', 'd', 'e', 'f'].map(id => row(id, 'running', [{ kind: 'cut', why: 'x' }])), NOW);
    ok('more than four are counted, not listed', /· \+2 more$/.test(many[0].detail) && many[0].detail.split(' · ').length === 5);
}

// the Living report takes them through its one extension point
{
    const base = { now: NOW, notices: [], queue: [], automations: [], duties: [], automationLog: [], checks: [] };
    const extra = chainLivingSignals([row('c1', 'running', [{ kind: 'fault', why: 'down' }])], NOW);
    const r = buildLivingReport({ ...base, extra });
    ok('buildLivingReport draws an extra row and scores it', r.signals.some(s => s.id === 'chains' && s.state === 'warn') && r.counts.warn >= 1);
    ok('…and without one it is the report it was', !buildLivingReport(base).signals.some(s => s.id === 'chains'));
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('the host hands Living the rows chains.list answers (boardNow), not a reading of its own',
        /extra: chainLivingSignals\(boardNow\(chainBoardDeps\), Date\.now\(\)\)/.test(ext));
    const living = fs.readFileSync(path.join(ROOT, 'src', 'core', 'living.ts'), 'utf8');
    ok('living.ts stays under the hard size line and holds no chain reader', living.split('\n').length < 500 && !/chainBoard|baton/i.test(living));
}

// S-124 (2/2) — the same signals behind the bell
{
    const { chainSignalNotices, chainNoticeKey, CHAIN_NOTICE_PREFIX, CHAIN_NOTICE_CARRIED } = require(path.join(OUT, 'chainSignals.js'));
    const sig = (kind, since, sid = 'aaaaaaaa1111') => ({ kind, why: `leg 3 (session ${sid.slice(0, 8)}) is idle — it neither passed`, since, sessionId: sid });
    const run = (id, signals, extra) => ({ ...row(id, 'running', signals), state: 'running', sessionId: 'aaaaaaaa1111', live: 'idle', trimmed: false, agentName: 'developer', ...extra });
    const BASE = NOW - 60 * MIN;
    const q = (o) => ({ now: NOW, baseline: BASE, posted: [], batons: [], ...o });

    const first = chainSignalNotices([run('c1', [sig('hanging', NOW - 90 * MIN)]), run('c2', [sig('stuck-wait', NOW - 70 * MIN)])], q({ baseline: undefined }));
    ok('first look: what already stood is ONE notice naming every chain, not one each, and the baseline is now',
        first.post.length === 1 && first.post[0].key === CHAIN_NOTICE_CARRIED && /c1/.test(first.post[0].body) && /c2/.test(first.post[0].body)
        && /^2 relay chain/.test(first.post[0].title) && first.baseline === NOW);
    ok('…and a first look with nothing flagged posts nothing', chainSignalNotices([run('c1', [])], q({ baseline: undefined })).post.length === 0);

    const later = chainSignalNotices([run('c1', [sig('hanging', NOW - 90 * MIN)]), run('c3', [sig('hanging', NOW - 30 * MIN)], { projectId: 'prj_1' })], q());
    ok('after the baseline: a new signal is its own notice; one older than the baseline is not announced again',
        later.post.length === 1 && later.post[0].key === chainNoticeKey('c3', 'hanging', 'aaaaaaaa1111') && later.baseline === BASE);
    const n = later.post[0];
    ok('…a warning to the chains tag, filed under the chain\'s project, titled with agent and leg',
        n.type === 'warning' && n.level === 2 && n.tags.includes('chains') && n.projectId === 'prj_1' && n.title === 'Relay chain hanging — developer, leg 2');
    ok('…its body names the setting, never a number of minutes', /agentFarm\.chainHangMinutes/.test(n.body) && !/\d+ min/.test(n.body));
    ok('…and offers what the Chains page offers on that row (an idle running leg: Continue and End chain)',
        /↻ Continue/.test(n.body) && /■ End chain/.test(n.body) && !/Start now/.test(n.body));
    const nowhere = chainSignalNotices([run('c4', [sig('hanging', NOW - 30 * MIN)], { live: undefined })], q()).post[0];
    ok('…a leg known nowhere is not offered Continue — the page does not offer it either', !/Continue/.test(nowhere.body) && /End chain/.test(nowhere.body));
    const waitB = { id: 'b1', chainId: 'c5', hop: 2, state: 'waiting-end', updatedAt: NOW - 40 * MIN };
    const stuck = chainSignalNotices([{ ...run('c5', [sig('stuck-wait', NOW - 40 * MIN)]), state: 'waiting', bucket: 'waiting' }], q({ batons: [waitB] })).post[0];
    ok('a stuck wait names its own setting and the page\'s Start now and Stop chain',
        stuck.title.startsWith('Relay chain stuck waiting') && /agentFarm\.chainWaitMinutes/.test(stuck.body) && /⏭ Start now/.test(stuck.body) && /✕ Stop chain/.test(stuck.body));

    const told = chainSignalNotices(['cut', 'fault', 'brake'].map((k, i) => run('d' + i, [sig(k, NOW - 5 * MIN)])), q());
    ok('‼️ cut, fault and brake are not posted — each already has its own notice at the moment it happens', told.post.length === 0);
    const twice = chainSignalNotices([run('c6', [sig('hanging', NOW - 5 * MIN), sig('hanging', NOW - 4 * MIN)])], q());
    ok('the same chain, signal and session is one notice', twice.post.length === 1);

    const k3 = chainNoticeKey('c3', 'hanging', 'aaaaaaaa1111'), kGone = chainNoticeKey('c9', 'hanging', 'bbbbbbbb');
    const r = chainSignalNotices([run('c3', [sig('hanging', NOW - 30 * MIN)])], q({ posted: [k3, kGone, CHAIN_NOTICE_CARRIED, 'idle:x'] }));
    ok('a posted signal that no longer shows is withdrawn; a standing one, the first-look notice and other kinds are not',
        r.retract.length === 1 && r.retract[0] === kGone && kGone.startsWith(CHAIN_NOTICE_PREFIX) && !CHAIN_NOTICE_CARRIED.startsWith(CHAIN_NOTICE_PREFIX));

    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    const bell = ext.slice(ext.indexOf('const chainBell = (): void => {'), ext.indexOf('const batonSweep = setInterval('));
    ok('‼️ the host posts nothing before the index\'s first full scan and while a reclaim runs (a revived leg would read as hanging)',
        /if \(!index\.scannedAt \|\| consoleHost\.reclaiming\) \{ return; \}/.test(bell));
    ok('…reads the rows chains.list answers, keeps the baseline once, withdraws and posts through the once-guard',
        /chainSignalNotices\(boardNow\(chainBoardDeps\)/.test(bell) && /baseline === undefined/.test(bell)
        && /retractNews\(k\)/.test(bell) && /postNewsOnce\(key, n\)/.test(bell));
    ok('…and runs on its own minute clock, not only when a transcript moves, released with the extension',
        /const chainBellSweep = setInterval\(chainBell, 60_000\);/.test(ext) && /clearInterval\(chainBellSweep\)/.test(ext));
    const host = fs.readFileSync(path.join(ROOT, 'src', 'core', 'consolehost.ts'), 'utf8');
    ok('reclaiming counts from the kill to the release, and is let go even when the wait throws',
        /killPid\(pid\);\s*this\.reclaims\+\+;\s*try \{[^\n]*awaitRelease[^\n]*\} finally \{ this\.reclaims--; \}/.test(host));
    const idx = fs.readFileSync(path.join(ROOT, 'src', 'core', 'sessions.ts'), 'utf8');
    ok('the index stamps a completed full scan where it swaps its map in', /this\.sessions = next;\s*this\.scannedAt = Date\.now\(\);/.test(idx));
}

console.log(`test_chain_signals: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
