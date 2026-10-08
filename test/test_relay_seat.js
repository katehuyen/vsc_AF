// S-129 — a relay successor is held by its own chain only.
//
// Measured on 2026-10-03: two relay chains ran in the developer agent (one
// opened from a Console session, which is no task row). Both legs passed within
// minutes; the older successor took the agent's one seat and the other waited
// "agent busy" behind a stay-open Console leg — silently, with no end in sight.
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const Module = require('module');
const origLoad = Module._load;
Module._load = function (request) {
    if (request === 'vscode') {
        const off = () => ({ dispose() { } });
        return {
            Uri: {}, window: { onDidCloseTerminal: off, onDidOpenTerminal: off, showWarningMessage: () => { } },
            ViewColumn: {}, ConfigurationTarget: { Global: 1 }, env: {},
            EventEmitter: class { constructor() { this.event = () => ({ dispose() { } }); } fire() { } dispose() { } },
            QuickPickItemKind: { Separator: -1 }, commands: { executeCommand: () => { } },
            workspace: { getConfiguration: () => ({ get: (_k, d) => d, update: async () => { } }) }
        };
    }
    return origLoad.apply(this, arguments);
};

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'out', 'core');
const T = require(path.join(OUT, 'tasks.js'));
const { seatHolders, agentBusyReason } = require(path.join(OUT, 'relaySeat.js'));
const { successorRow } = require(path.join(OUT, 'batonDoor.js'));
const C = require(path.join(OUT, 'chainBoard.js'));

console.log('\n== the rule (pure) ==');
{
    const a1 = { id: 'a1', title: 'Baton — leg 3 of chain A', relayOf: { chainId: 'A' } };
    const b1 = { id: 'b1', title: 'Baton — leg 2 of chain B', relayOf: { chainId: 'B' } };
    const plain = { id: 'p1', title: 'a task from the Tasks page' };
    const all = [a1, b1, plain];
    ok('a row outside any chain counts every running row of its agent (unchanged)', seatHolders({}, all).length === 3);
    ok('‼️ a successor of chain A counts its own chain only', seatHolders({ relayOf: { chainId: 'A' } }, all).map(t => t.id).join() === 'a1');
    ok('‼️ another chain\'s leg and a row outside any chain do not hold it', seatHolders({ relayOf: { chainId: 'C' } }, all).length === 0);
    ok('the predecessor\'s row it was opened after holds it, even with no chain mark (a first leg, an older row)',
        seatHolders({ relayOf: { chainId: 'C', after: 'p1' } }, all).map(t => t.id).join() === 'p1');
    ok('the reason names the holder', agentBusyReason('developer', [a1]) === 'agent busy (developer) — held by "Baton — leg 3 of chain A" (task a1)');
    ok('…and counts the rest', /and 1 more$/.test(agentBusyReason('developer', [a1, b1])));
    ok('no holder: the plain sentence', agentBusyReason('developer', []) === 'agent busy (developer)');
}

const setup = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-relay-seat-'));
    const agent = { id: 'a1', name: 'developer', dir };
    const cards = {};
    let seq = 0;
    const tm = new T.TaskManager(path.join(dir, 'tasks.json'), () => [agent], () => false, () => '', {
        // the seat under test: one per agent, stated — the default (0 = no per-agent limit) holds nobody
        maxConcurrentPerAgent: () => 1,
        startConsoleTask: () => { const id = `cs${++seq}-x`; cards[id] = { state: 'starting', answered: false }; return { sessionId: id }; },
        consoleTaskState: id => cards[id]
    });
    const add = (title, extra = {}) => tm.addTask(agent, title, 'p', 'interactive',
        { interactiveTarget: 'console', interactiveClose: 'stay-open', autoStart: false, ...extra });
    const done = () => { tm.dispose(); fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }); };
    return { tm, add, done };
};

console.log('\n== two chains, one seat: both run ==');
{
    const { tm, add, done } = setup();
    const legA = add('Baton — leg 2 of chain A', { relayOf: { chainId: 'A' } });
    tm.startTask(legA);
    ok('chain A\'s leg runs on the agent\'s one seat', legA.status === 'running');
    const legB = add('Baton — leg 17 of chain B', { relayOf: { chainId: 'B' } });
    tm.startTask(legB);
    ok('‼️ chain B\'s successor starts beside it — another chain\'s leg does not hold it', legB.status === 'running');
    done();
}

console.log('\n== the own chain still holds its successor ==');
{
    const { tm, add, done } = setup();
    const leg = add('Baton — leg 2 of chain A', { relayOf: { chainId: 'A' } });
    tm.startTask(leg);
    const next = add('Baton — leg 3 of chain A', { relayOf: { chainId: 'A', after: leg.id } });
    tm.startTask(next);
    ok('‼️ the successor waits for its own predecessor\'s row (the hand-off beat)', next.status === 'queued'
        && next.deferredCode === `concurrency:agent:a1`);
    ok('…and the hold names that row', (next.deferredReason || '').includes(`(task ${leg.id})`));
    done();
}

console.log('\n== a first leg carries no chain mark: `after` names it ==');
{
    const { tm, add, done } = setup();
    const first = add('opens a relay', { baton: true });
    tm.startTask(first);
    const next = add('Baton — leg 2 of chain N', { relayOf: { chainId: 'N', after: first.id } });
    tm.startTask(next);
    ok('the successor of a first-leg row waits for that row', next.status === 'queued');
    done();
}

console.log('\n== rows outside any chain ==');
{
    const { tm, add, done } = setup();
    const work = add('a Console task kept open');
    tm.startTask(work);
    const next = add('Baton — leg 5 of chain C', { relayOf: { chainId: 'C' } });
    tm.startTask(next);
    ok('‼️ a Console task outside the chain does not hold a successor', next.status === 'running');
    done();
}
{
    const { tm, add, done } = setup();
    const leg = add('Baton — leg 2 of chain A', { relayOf: { chainId: 'A' } });
    tm.startTask(leg);
    const plain = add('a task from the Tasks page');
    tm.startTask(plain);
    ok('a row outside any chain still waits for a running chain leg (unchanged)', plain.status === 'queued'
        && /agent busy \(developer\)/.test(plain.deferredReason || ''));
    const old = add('Baton — leg 6 of an older chain');
    tm.startTask(old);
    ok('a successor written before the mark existed behaves as before', old.status === 'queued');
    done();
}

console.log('\n== a revive keeps the mark; a retry does not ==');
{
    const { tm, add, done } = setup();
    const leg = add('Baton — leg 4 of chain A', { relayOf: { chainId: 'A', after: 'x' } });
    const revived = tm.retryTask(leg, undefined, { as: 'revive', autoStart: false });
    ok('the same leg picked up again still continues its chain', revived && revived.relayOf && revived.relayOf.chainId === 'A');
    const retried = tm.retryTask(leg, undefined, { autoStart: false });
    ok('a retry is a new run, not the chain\'s continuation', retried && retried.relayOf === undefined);
    done();
}

console.log('\n== the door stamps the row ==');
{
    const b = {
        id: 'btn_1', chainId: 'chn_x', hop: 2, state: 'waiting-end', prompt: 'p', why: 'w',
        from: { sessionId: 'S2', agentId: 'D:/agents/dev', engine: 'claude', cwd: 'D:\\agents\\dev', projectId: 'prj_1', launchId: 'l' },
        inherit: { surface: 'console', model: 'opus' }, want: { surface: 'inherit', account: '@emptiest' },
        createdAt: 1, updatedAt: 1
    };
    const row = successorRow(b, { agentDir: 'D:\\agents\\dev', after: 'task_prev' });
    const mark = row.extra.relayOf || {};
    ok('‼️ the successor row carries its chain and the row it follows', mark.chainId === 'chn_x' && mark.after === 'task_prev');
    const bare = successorRow(b, {}).extra.relayOf || {};
    ok('…without a predecessor row, the chain alone', bare.chainId === 'chn_x' && bare.after === undefined);
    ok('‼️ never the first-leg fields: the seal reads `baton` and would seal a successor as a new chain',
        !('baton' in row.extra) && !('batonChainId' in row.extra));
}

console.log('\n== a successor parked on the board too long rings the chain bell ==');
{
    const NOW = 1790000000000, MIN = 60000, TH = { hangMs: 30 * MIN, waitMs: 20 * MIN };
    const from = sid => ({ sessionId: sid, agentId: 'D:/agents/dev', engine: 'claude', cwd: 'D:\\repo', projectId: 'prj_1', launchId: 'l' });
    const mk = (id, hop, state, sid, to, extra) => ({
        id, chainId: 'chn_1', hop, state, prompt: 'p', why: 'w-' + id, from: from(sid),
        inherit: { surface: 'console' }, want: { surface: 'inherit', account: '@emptiest' },
        ...(to ? { toSessionId: to } : {}), createdAt: NOW - 50 * MIN, updatedAt: NOW - 50 * MIN, ...extra
    });
    const seal = mk('s0', 0, 'started', 'L1', 'L1', { createdAt: NOW - 90 * MIN, updatedAt: NOW - 90 * MIN });
    const b1 = mk('b1', 1, 'started', 'L1', 'L2');
    const one = top => C.chainBoard({ batons: [seal, b1, top], links: [], facts: () => undefined, now: NOW, maxLegs: 6, thresholds: TH })[0];
    const why = 'swept: no live CLI process is registered for the session; task t2 is on the board — agent busy (developer)';
    const held = age => mk('b2', 2, 'parked', 'L2', undefined, { why, updatedAt: NOW - age, taskId: 't2' });
    const s = one(held(TH.waitMs + 1));
    ok('‼️ held past the wait threshold: stuck-wait, carrying the hold\'s own reason',
        s.signals.map(x => x.kind).join() === 'stuck-wait' && /has not started/.test(s.signals[0].why) && /agent busy/.test(s.signals[0].why));
    ok('…not before the threshold', one(held(MIN)).signals.length === 0);
    ok('a reset park waiting for its reset is not stuck', one(mk('b2', 2, 'parked', 'L2', undefined, { wakeAt: NOW + 30 * MIN })).signals.length === 0);
    ok('…but one still parked long past its reset is', one(mk('b2', 2, 'parked', 'L2', undefined, { wakeAt: NOW - TH.waitMs - 1 })).signals.length === 1);
}

console.log(`\nrelay seat: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
