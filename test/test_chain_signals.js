// S-124 — THE CHAIN BOARD'S ATTENTION SIGNALS ON THE LIVING PAGE.
//
// What must not go wrong quietly: the Living row is built from the board's own
// rows (the ones chains.list answers), never re-derived; it warns while any
// chain carries a signal and points at the Chains page; it says nothing when
// no chain is live; and the host hands it to the Living report through the
// one extension point, so living.ts does not grow a second chain reader.
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

console.log(`test_chain_signals: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
