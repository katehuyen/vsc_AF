// S-101 — WHAT IS STUCK, AND CLEANING IT.
//
// What must not go wrong quietly: a pause shorter than a day is never called
// stuck (the user's own "wait here" of 3 hours); 24h or more is; a working card
// or row never is; a running row and its card count once; the notice comes at
// most once a day however many different things are open; cleaning acts on the
// right record and deletes nothing.
//
//   node test/test_stale_cleanup.js
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const S = require(path.join(__dirname, '..', 'out', 'core', 'staleScan.js'));
const H = 3600 * 1000, NOW = 1790000000000;

console.log('\n== what counts ==');
const tasks = [
    { id: 'q17', title: 'Revive test', status: 'queued', createdAt: NOW - 17 * 24 * H },
    { id: 'q2h', title: 'fresh', status: 'queued', createdAt: NOW - 2 * H },
    { id: 'pause', title: 'leg 3 (the user said wait)', status: 'running', createdAt: NOW - 5 * H, startedAt: NOW - 5 * H, runSession: 'sPause' },
    { id: 'r30', title: 'old leg', status: 'running', createdAt: NOW - 40 * H, startedAt: NOW - 40 * H, runSession: 'sOld', events: [{ ts: NOW - 35 * H }] },
    { id: 'rWork', title: 'busy', status: 'running', createdAt: NOW - 50 * H, runSession: 'sWork' },
    { id: 'done', title: 'finished', status: 'done', createdAt: NOW - 90 * H }
];
const cards = [
    { id: 'cPause', sessionId: 'sPause', status: 'idle', startedAt: NOW - 5 * H, messages: [{ ts: NOW - 3 * H }] },
    { id: 'cOld', sessionId: 'sOld', status: 'idle', startedAt: NOW - 40 * H, messages: [{ ts: NOW - 30 * H }] },
    { id: 'cWork', sessionId: 'sWork', status: 'working', startedAt: NOW - 50 * H },
    { id: 'cIdle', agentName: 'developer', sessionId: 'sIdle1234', status: 'idle', startedAt: NOW - 80 * H, messages: [{ ts: NOW - 25 * H }] },
    { id: 'cFresh', sessionId: 'sFresh', status: 'idle', startedAt: NOW - 1 * H }
];
const batons = [
    { id: 'bWait', chainId: 'chn_a', hop: 1, state: 'waiting-end', updatedAt: NOW - 26 * H },
    { id: 'bStarted', chainId: 'chn_a', hop: 2, state: 'started', updatedAt: NOW - 90 * H },
    { id: 'bParked', chainId: 'chn_b', hop: 1, state: 'parked', updatedAt: NOW - 3 * H }
];
const items = S.scanStale({ now: NOW, tasks, cards, batons });
const ids = items.map(x => x.id);
ok('‼️ a pause shorter than a day is not stuck — neither its row nor its card', !ids.includes('pause') && !ids.includes('cPause'));
ok('a row queued 17 days is stuck; one queued 2 hours is not', ids.includes('q17') && !ids.includes('q2h'));
ok('a running row whose card is idle 30h is stuck, carrying its card', items.some(x => x.id === 'r30' && x.kind === 'running' && x.cardId === 'cOld'));
ok('…and that card is not counted a second time', !ids.includes('cOld'));
ok('a working card or row is never stuck, however old', !ids.includes('rWork') && !ids.includes('cWork'));
ok('a finished row is not a candidate', !ids.includes('done'));
ok('an idle card 25h since its last message is stuck; an idle card of 1h is not', ids.includes('cIdle') && !ids.includes('cFresh'));
ok('a baton waiting 26h is stuck; a started one or a parked 3h one is not', ids.includes('bWait') && !ids.includes('bStarted') && !ids.includes('bParked'));
ok('oldest first', items[0].id === 'q17');
ok('ages are said in days and hours', S.fmtAge(17 * 24 * H) === '17d' && S.fmtAge(30 * H) === '1d 6h' && S.fmtAge(3 * H) === '3h');

console.log('\n== the words ==');
const lines = S.staleLines(items);
ok('one line per kind with its count and oldest', lines.some(l => /^1 task rows queued and never started — oldest 17d$/.test(l)) && lines.some(l => /^1 relay batons still waiting — oldest 1d 2h$/.test(l)));
const n = S.staleNotice(items);
ok('the notice title says how many and that they are 24h+', /^4 things waiting 24h\+ — possibly stuck$/.test(n.title));
ok('the body carries each item with its age and reason, and where to clean', /\| Revive test \| 17d \| queued, never started \|/.test(n.body) && /status bar/.test(n.body) && /Clean Up Stuck Items/.test(n.body) && /Nothing is deleted/.test(n.body));

console.log('\n== at most once a day ==');
ok('the first notice comes once something is stuck', S.shouldNotify(3, undefined, NOW));
ok('‼️ not again within 24h, even for different things', !S.shouldNotify(9, NOW - 23 * H, NOW));
ok('again a full day after the last', S.shouldNotify(1, NOW - 24 * H, NOW));
ok('never when nothing is stuck', !S.shouldNotify(0, undefined, NOW));

console.log('\n== cleaning ==');
const calls = [];
const deps = {
    tasks: () => tasks, cards: () => cards, batons: () => batons, now: () => NOW,
    cancelTask: id => { calls.push('cancel:' + id); if (id === 'q17') { throw new Error('gone'); } },
    closeCard: id => calls.push('close:' + id),
    stopBaton: (id, why) => calls.push('stop:' + id + ':' + /stuck-items cleanup \(kate\) — waiting 1d 2h/.test(why))
};
const some = S.cleanStale(deps, ['r30', 'bWait'], 'kate');
ok('ids= cleans only those: the running row closes its card and is cancelled, the baton is stopped with the reason',
    JSON.stringify(calls) === JSON.stringify(['close:cOld', 'cancel:r30', 'stop:bWait:true']) && some.cleaned.length === 2);
calls.length = 0;
const all = S.cleanStale(deps);
ok('no ids = every stuck item; a failure is reported, not thrown', all.cleaned.length === 3 && all.failed.length === 1 && all.failed[0].why === 'gone' && calls.includes('close:cIdle'));

(async () => {
    console.log('\n== the op ==');
    const { BridgeRegistry } = require(path.join(__dirname, '..', 'out', 'core', 'bridge.js'));
    const { registerStaleOp } = require(path.join(__dirname, '..', 'out', 'core', 'staleOp.js'));
    const reg = new BridgeRegistry();
    let changed = 0;
    const done = [];
    registerStaleOp(reg, { ...deps, cancelTask: id => done.push(id), closeCard: id => done.push(id), stopBaton: id => done.push(id) }, () => changed++);
    const look = await reg.dispatch('farm.cleanup', {});
    ok('without apply it only lists: count, lines, items with their age', look.ok && look.result.count === 4 && look.result.lines.length === 4
        && look.result.items[0].age === '17d' && !done.length && !changed);
    const some = await reg.dispatch('farm.cleanup', { apply: true, ids: 'q17, bWait' });
    ok('apply with ids= (comma form) cleans only those and repaints the chip', some.ok && some.result.cleaned.length === 2 && done.join() === 'q17,bWait' && changed === 1);
    const ops = await reg.dispatch('farm.ops', {});
    ok('farm.cleanup is in farm.ops with its args', ops.ok && JSON.stringify(ops.result).includes('farm.cleanup') && /args: apply\? \(default false\), ids\?/.test(JSON.stringify(ops.result)));

    console.log('\n== the wiring ==');
    const ROOT = path.join(__dirname, '..');
    const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
    const ext = read('src/extension.ts');
    const wire = read('src/staleCleanup.ts');
    ok('the window wires the chip, the check and the op', /wireStale\(context, bridge,/.test(ext) && /registerStaleOp\(bridge, d, refresh\)/.test(wire));
    ok('the command opens the review', /registerCommand\('agentfarm\.cleanupStuck', \(\) => stale\.review\(\)\)/.test(ext));
    ok('the notification offers Clean now and Review…', /'Clean now', 'Review…'/.test(wire));
    ok('the first count waits for the window to be built (activation)', /setTimeout\(refresh, 10_000\)/.test(wire));
    ok('the command is contributed', JSON.parse(read('package.json')).contributes.commands.some(c => c.command === 'agentfarm.cleanupStuck'));
    ok('parity maps the command to farm.cleanup', /"cmd:agentfarm\.cleanupStuck"[\s\S]{0,80}"farm\.cleanup"/.test(read('parity.manifest.json')));
    ok('farm.health counts what is stuck', /stale: stale\.summary\(\)/.test(ext));

    console.log(`test_stale_cleanup.js: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
