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
        && /setInterval\(\(\) => \{ batonRunner\.sweep\(\); updateBatonBar\(\); batonEnder\.check\(\); engineFaults\.check\(\); engineCuts\.check\(\); misplacedWatch\.sweep\(\); \}, 60_000\)/.test(ext));
    ok('the card is closed through the host, with the reason on it', /closeCard: \(id, why\) => \{ consoleHost\.close\(id, \{ reason: why \}\);/.test(ext));
    ok('the facts read the card by the ENGINE session id, with its queue, its question and its last turn',
        /consoleHost\.list\(\)\.find\(x => x\.sessionId === sid\)/.test(ext) && /queued: c\.queued\?\.length \?\? 0/.test(ext)
        && /asking: !!\(c\.pendingAsk \|\| c\.pendingPermission\)/.test(ext) && /turnEndedAt: c\.lastTurn\?\.endedAt/.test(ext));
    const host = fs.readFileSync(path.join(ROOT, 'src', 'core', 'consolehost.ts'), 'utf8');
    ok('close() writes the reason it is given, "closed by you" otherwise', /const reason = o\?\.reason \|\| 'closed by you';/.test(host));
    const B = require(path.join(ROOT, 'out', 'core', 'baton.js'));
    const s = B.batonPlanSentence(baton());
    ok('‼️ baton.pass tells the agent it is ended for it — never to close its own card', /Agent Farm ends this session itself/.test(s) && /never close it yourself/.test(s));

    console.log('\n== S-90 — a leg told to hand over that rests WITHOUT passing is ended too ==');
    {
        const U = E.BATON_UNPASSED_SETTLE_MS;
        const opener = baton({ id: 'btn_op', hop: 1, state: 'started', toSessionId: 'leg-9' });
        const H = { what: 'CONTEXT HANDOVER 40%', ts: NOW };
        const handoverOf = sid => (sid === 'leg-9' ? H : undefined);
        const legs = E.unpassedLegs([opener], handoverOf);
        ok('a running leg a handover order reached is found', legs.length === 1 && legs[0].sessionId === 'leg-9');
        ok('…but not once it passed (a baton FROM it exists)',
            E.unpassedLegs([opener, baton({ id: 'btn_p', hop: 2, from: { ...opener.from, sessionId: 'leg-9' } })], handoverOf).length === 0);
        ok('…and not a leg no order reached', E.unpassedLegs([opener], () => undefined).length === 0);
        const leg = legs[0];
        const rest = card({ turnEndedAt: NOW + 5000, userSaidAt: NOW - 60_000 });
        ok('at rest, but not long enough yet → wait, with the time it is due',
            (o => o.act === 'wait' && o.at === NOW + 5000 + U)(E.unpassedLegOrder(leg, { card: rest }, NOW + 6000)));
        const due = E.unpassedLegOrder(leg, { card: rest }, NOW + 5000 + U);
        ok('‼️ settled → its card is closed, and the reason names the order and the failsafe',
            due.act === 'close-card' && due.cardId === rest.id && /CONTEXT HANDOVER 40%/.test(due.why) && /failsafe/.test(due.why));
        ok('‼️ a turn the USER started after the order leaves the session to them',
            /theirs now/.test(E.unpassedLegOrder(leg, { card: card({ turnEndedAt: NOW + 90_000, userSaidAt: NOW + 80_000 }) }, NOW + 999_999).why));
        // X-462, measured on leg 3 of chn_mupm9r6q0023s7: the order reached it, then two
        // background commands finished and the CLI opened a turn for each (ms 0, no user row)
        const cliTurn = card({ turnEndedAt: NOW + 400_000, userSaidAt: NOW - 1000 });
        ok('‼️ X-462 — a turn the CLI opened itself (a background result, no user row) is NOT the user: the card is closed',
            E.unpassedLegOrder(leg, { card: cliTurn }, NOW + 400_000 + U).act === 'close-card'
            && E.unpassedLegOrder(leg, { card: cliTurn }, NOW + 400_000 + U - 1).act === 'wait');
        ok('lastUserSaidAt reads the latest user row, past the system rows after it; none = undefined',
            E.lastUserSaidAt([{ role: 'user', ts: 1 }, { role: 'agent', ts: 2 }, { role: 'user', ts: 3 }, { role: 'system', ts: 4 }, { role: 'result', ts: 5 }]) === 3
            && E.lastUserSaidAt([{ role: 'system', ts: 4 }]) === undefined && E.lastUserSaidAt(undefined) === undefined);
        ok('a running turn, an open question or a queued message → wait',
            E.unpassedLegOrder(leg, { card: card({ status: 'working' }) }, NOW + 999_999).act === 'wait'
            && E.unpassedLegOrder(leg, { card: card({ asking: true }) }, NOW + 999_999).act === 'wait'
            && E.unpassedLegOrder(leg, { card: card({ queued: 1 }) }, NOW + 999_999).act === 'wait');
        ok('‼️ no card (a terminal) is never killed on this evidence',
            E.unpassedLegOrder(leg, { pid: 5, live: { status: 'idle', lastEventTs: NOW } }, NOW + 999_999).act === 'wait');

        const closed = [];
        const ender = new E.PassedLegEnder({
            batons: () => [opener], facts: () => ({}), factsOf: () => ({ card: rest }), handoverOf,
            closeCard: (id, why) => closed.push([id, why]), kill: () => {}, sweep: () => {}, now: () => NOW + 5000 + U, sweepAfterMs: 1
        });
        ender.check();
        ender.check();
        ok('‼️ the ender closes it ONCE (not again inside the reorder window)', closed.length === 1 && closed[0][0] === rest.id);
        ender.dispose();
        const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
        ok('the host wires the facts by session id and the guard\'s handover order (quota first)',
            /factsOf: batonLegFacts/.test(ext) && /QUOTA HANDOVER \$\{q\.pct\}%/.test(ext) && /userSaidAt: lastUserSaidAt\(c\.messages\)/.test(ext));
    }

    console.log(`\ntest_baton_end: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();
