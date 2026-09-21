// S-77 — THE RELAY AS A SURFACE SAYS IT: one view per session, derived once.
//
//   node test/test_baton_view.js
'use strict';
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const V = require(path.join(__dirname, '..', 'out', 'core', 'batonView.js'));
const NOW = 1790000000000;
const b = (id, state, hop, from, o = {}) => ({
    id, chainId: 'chn_1', hop, state, prompt: 'p', why: o.why || 'w',
    from: { sessionId: from, agentId: 'd:/zone/agent/ajanlar/developer', engine: 'claude', cwd: 'D:\\x', launchId: 'l' },
    inherit: { surface: 'console' }, want: { surface: 'inherit', account: '@emptiest' },
    createdAt: NOW, updatedAt: o.at || NOW, ...o.extra
});

ok('a session no baton touched has no view', V.batonCardView([b('b1', 'started', 1, 's1', { extra: { toSessionId: 's2' } })], 's9') === undefined);
ok('an empty id has no view', V.batonCardView([], '') === undefined);

const first = V.batonCardView([b('b1', 'waiting-end', 1, 's1')], 's1');
ok('the run that started the chain and passed: leg 1, successor waiting, stoppable',
    first.leg === 1 && first.chip === '⑂ 1' && /successor waiting/.test(first.head) && first.stoppable
    && first.lines.some(l => /^Predecessor: none/.test(l)) && first.lines.some(l => /waits for this session to end/.test(l))
    && first.lines.some(l => /baton\.stop chain=chn_1/.test(l)));

const mid = V.batonCardView([
    b('b1', 'started', 1, 's1', { extra: { toSessionId: 's2' } }),
    b('b2', 'started', 2, 's2', { extra: { toSessionId: 's3' } })
], 's2');
ok('a middle leg: opened by leg 1, its successor running as a named session, nothing live to stop',
    mid.leg === 2 && mid.lines[0] === 'Chain: chn_1 — leg 2 of 3 so far.' && /Predecessor: session s1 \(developer · claude\)/.test(mid.lines[1])
    && /Successor: running — session s3/.test(mid.lines[2]) && !mid.stoppable && /nobody passes/.test(mid.lines[3]));

const runner = V.batonCardView([b('b1', 'started', 1, 's1', { extra: { toSessionId: 's2' } })], 's2');
ok('a runner that has not passed yet says so', runner.leg === 2 && runner.chip === '⑂ 2' && /Successor: none yet/.test(runner.lines[2]) && runner.head === 'Baton relay — leg 2');

const parked = V.batonCardView([b('b1', 'parked', 1, 's1', { extra: { wakeAt: new Date(2026, 8, 21, 20, 5).getTime() } })], 's1');
ok('a parked successor names its wake time', parked.lines.some(l => /parked — every account is full; wakes at 20:05/.test(l)));

const stopped = V.batonCardView([b('b1', 'stopped', 1, 's1', { why: 'user said no' })], 's1');
ok('a stopped successor carries the reason and is not stoppable again', stopped.lines.some(l => l === 'Successor: stopped — user said no') && !stopped.stoppable);

const twice = V.batonCardView([b('old', 'refused', 1, 's1', { at: NOW - 5000, why: 'x' }), b('new', 'waiting-end', 1, 's1', { at: NOW })], 's1');
ok('two passes from one run: the newest speaks', twice.lines.some(l => /waits for this session to end/.test(l)));

console.log(`test_baton_view.js: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
