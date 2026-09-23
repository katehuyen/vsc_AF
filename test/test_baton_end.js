// S-86 — a leg that passed is ended by Agent Farm, never by its own hand.
//
// Measured on 2026-09-23: session 7bcfd941 passed the baton from a Console
// card, finished its turn, and the chain stopped — the card sat `idle`, its
// claude process stayed registered, and the baton waited (`waiting-end`) for an
// end that nothing was going to bring. The leg before it had only got through
// by closing its own card. What must hold: the passing turn is never cut; once
// it is at rest (nothing queued, no question open, a quiet settle) the card is
// closed / the registered process ended, exactly once, and the release is asked
// for straight after.
'use strict';
const path = require('path');
const fs = require('fs');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const ROOT = path.join(__dirname, '..');
const E = require(path.join(ROOT, 'out', 'core', 'batonEnd.js'));

const NOW = 1790000000000;
const SETTLE = E.BATON_END_SETTLE_MS;
const baton = (o = {}) => ({
    id: 'btn_1', chainId: 'chn_1', hop: 1, prompt: 'p', state: 'waiting-end', why: 'waiting for this session to end',
    from: { sessionId: 'sess-A', agentId: 'dev', engine: 'claude', cwd: 'D:\\repo' },
    inherit: {}, want: { surface: 'inherit', account: '@emptiest' },
    createdAt: NOW, updatedAt: NOW, ...o
});
const card = (o = {}) => ({ id: 'cs13-mudes5rc', status: 'idle', queued: 0, asking: false, turnEndedAt: NOW + 2000, ...o });

console.log('\n== the decision, on a Console card ==');
{
    const order = (f, now) => E.passedLegOrder(baton(), f, now);
    ok('‼️ the turn that passed is never cut: a working card waits', order({ card: card({ status: 'working' }) }, NOW + 99999).act === 'wait');
    ok('a card still starting waits', order({ card: card({ status: 'starting' }) }, NOW + 99999).act === 'wait');
    ok('a question open on it waits', /question/.test(order({ card: card({ asking: true }) }, NOW + 99999).why));
    ok('a queued message waits — the user is talking to it', /queued/.test(order({ card: card({ queued: 1 }) }, NOW + 99999).why));
    const early = order({ card: card() }, NOW + 2000 + SETTLE - 1);
    ok('at rest but inside the settle: wait, and say when to look again', early.act === 'wait' && early.at === NOW + 2000 + SETTLE);
    const due = order({ card: card() }, NOW + 2000 + SETTLE);
    ok('‼️ at rest for the settle: the card is closed', due.act === 'close-card' && due.cardId === 'cs13-mudes5rc' && /Agent Farm ended the session/.test(due.why));
    const idleBefore = order({ card: card({ turnEndedAt: NOW - 60000 }) }, NOW + SETTLE);
    ok('a card already idle when somebody passed for it rests from the PASS, not from its old turn', idleBefore.act === 'close-card'
        && order({ card: card({ turnEndedAt: NOW - 60000 }) }, NOW + SETTLE - 1).act === 'wait');
    ok('an ended card is left to the release', order({ card: card({ status: 'ended' }), pid: 5 }, NOW + 99999).act === 'wait');
    ok('a baton that is no longer waiting orders nothing', E.passedLegOrder(baton({ state: 'started' }), { card: card() }, NOW + 99999).act === 'wait');
}

console.log('\n== the decision, in a terminal (no card) ==');
{
    const order = (f, now) => E.passedLegOrder(baton(), f, now);
    ok('no process of its own: nothing to end', /no live process/.test(order({ live: { status: 'waiting-input', lastEventTs: NOW } }, NOW + 99999).why));
    ok('a process no watcher can read waits and says to end it by hand', /by hand/.test(order({ pid: 42 }, NOW + 99999).why));
    ok('a turn still running waits', order({ pid: 42, live: { status: 'tool', lastEventTs: NOW } }, NOW + 99999).act === 'wait');
    ok('at rest inside the settle waits', order({ pid: 42, live: { status: 'waiting-input', lastEventTs: NOW + 1000 } }, NOW + 1000 + SETTLE - 1).act === 'wait');
    const k = order({ pid: 42, live: { status: 'waiting-input', lastEventTs: NOW + 1000 } }, NOW + 1000 + SETTLE);
    ok('‼️ at rest past the settle: its registered process is ended', k.act === 'kill' && k.pid === 42);
}

console.log('\n== the ender: once, then the release is asked for ==');
(async () => {
    let now = NOW + 2000 + SETTLE;
    const closed = [], killed = [], sweeps = [];
    let batons = [baton(), baton({ id: 'btn_2', from: { sessionId: 'sess-B', agentId: 'dev', engine: 'claude', cwd: 'D:\\r' } })];
    const facts = { 'sess-A': { card: card() }, 'sess-B': { card: card({ status: 'working' }) } };
    const ender = new E.PassedLegEnder({
        batons: () => batons, facts: b => facts[b.from.sessionId],
        closeCard: (id, why) => closed.push({ id, why }), kill: pid => killed.push(pid),
        sweep: () => sweeps.push(now), now: () => now, sweepAfterMs: 0
    });
    const orders = ender.check();
    ok('one card at rest is closed, the one still working is not', closed.length === 1 && closed[0].id === 'cs13-mudes5rc' && orders.length === 2);
    ok('‼️ the card is told WHY it was closed', /baton was passed \(btn_1\)/.test(closed[0].why));
    ender.check();
    ok('‼️ an order is given once, not on every look', closed.length === 1);
    await new Promise(r => setTimeout(r, 20));
    ok('the release is asked for straight after the order', sweeps.length === 1);
    now += 61_000;
    ender.check();
    ok('an order that did not take is given again after a minute', closed.length === 2);
    batons = [];
    ender.poke();
    ok('with no baton waiting, a poke schedules nothing', ender['timer'] === undefined);
    batons = [baton({ id: 'btn_3', from: { sessionId: 'sess-C', agentId: 'dev', engine: 'claude', cwd: 'D:\\r' } })];
    facts['sess-C'] = { pid: 77, live: { status: 'waiting-input', lastEventTs: now - SETTLE } };
    ender.check();
    ok('a terminal leg at rest is ended by its pid', killed.length === 1 && killed[0] === 77);
    ender.dispose();

    console.log('\n== the host wires it where a card or the watcher moves, and tells the agent ==');
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('‼️ a Console card change pokes the ender', /\/\/ S-86 — a card that passed the baton may have come to rest\s*batonEnder\.poke\(\);/.test(ext));
    ok('…and so do the watcher and the store, and the sweep checks as the backstop',
        /live\.onEvent\(e => \{[\s\S]{0,300}batonEnder\.poke\(\);/.test(ext)
        && /batonStore\.onDidChange\(\(\) => \{ updateBatonBar\(\); ConsolePanel\.refreshIfOpen\(\); batonEnder\.poke\(\); \}\)/.test(ext)
        && /setInterval\(\(\) => \{ batonRunner\.sweep\(\); updateBatonBar\(\); batonEnder\.check\(\); \}, 60_000\)/.test(ext));
    ok('the card is closed through the host, with the reason on it', /closeCard: \(id, why\) => \{ consoleHost\.close\(id, \{ reason: why \}\);/.test(ext));
    ok('the facts read the card by the ENGINE session id, with its queue, its question and its last turn',
        /consoleHost\.list\(\)\.find\(x => x\.sessionId === sid\)/.test(ext) && /queued: c\.queued\?\.length \?\? 0/.test(ext)
        && /asking: !!\(c\.pendingAsk \|\| c\.pendingPermission\)/.test(ext) && /turnEndedAt: c\.lastTurn\?\.endedAt/.test(ext));
    const host = fs.readFileSync(path.join(ROOT, 'src', 'core', 'consolehost.ts'), 'utf8');
    ok('close() writes the reason it is given, "closed by you" otherwise', /const reason = o\?\.reason \|\| 'closed by you';/.test(host));
    const B = require(path.join(ROOT, 'out', 'core', 'baton.js'));
    const s = B.batonPlanSentence(baton());
    ok('‼️ baton.pass tells the agent it is ended for it — never to close its own card', /Agent Farm ends this session itself/.test(s) && /never close it yourself/.test(s));

    console.log(`\ntest_baton_end: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
