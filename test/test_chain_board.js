// S-120 — THE CHAIN BOARD: every relay chain in one row, derived from the record.
//
// What must not go wrong quietly: a chain's state is its NEWEST record's (a live
// pass before a superseded one, a reopened leg after the closing record); the
// five attention signals fire from the record and the leg's own facts, never
// from a guess (no facts = no live word, and a hanging signal only once the record
// itself is past the threshold); the thresholds come in as arguments; a
// chain whose batons the store dropped is still a row; and the brake a pass hit
// is a FIELD on the record, written by both doors.
//
//   node test/test_chain_board.js
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'out', 'core');
const C = require(path.join(OUT, 'chainBoard.js'));

const NOW = 1790000000000;
const MIN = 60000;
const T = { hangMs: 30 * MIN, waitMs: 20 * MIN };
const from = (sessionId) => ({ sessionId, agentId: 'D:/agents/dev', engine: 'claude', cwd: 'D:\\repo', projectId: 'prj_1', launchId: 'l' });
const mk = (id, hop, state, sid, to, extra) => ({
    id, chainId: 'chn_1', hop, state, prompt: 'p', why: 'w-' + id, from: from(sid),
    inherit: { surface: 'console', model: 'opus', effort: 'high' }, want: { surface: 'inherit', account: '@emptiest' },
    ...(to ? { toSessionId: to } : {}), createdAt: NOW - 50 * MIN, updatedAt: NOW - 50 * MIN, ...extra
});
const seal = mk('s0', 0, 'started', 'L1', 'L1', { maxLegs: 12, createdAt: NOW - 90 * MIN, updatedAt: NOW - 90 * MIN });
const b1 = mk('b1', 1, 'started', 'L1', 'L2');
const board = (batons, facts = {}, extra = {}) => C.chainBoard({
    batons, links: [], facts: sid => facts[sid], now: NOW, maxLegs: 6, thresholds: T, ...extra
});
const one = (...a) => board(...a)[0];
const kinds = (r) => r.signals.map(s => s.kind).join(',');

// ---------- a running chain ----------
{
    const facts = { L1: { alive: false, title: 'night shift', agentName: 'developer', firstTs: NOW - 90 * MIN, lastTs: NOW - 50 * MIN, cost: 2, tokens: 100 },
        L2: { alive: true, firstTs: NOW - 50 * MIN, lastTs: NOW - MIN, cost: 1.5, tokens: 50 } };
    const r = one([seal, b1], facts);
    ok('running: state and chip, leg 2 of the seal\'s own 12, its session working', r.state === 'running' && r.bucket === 'running'
        && r.leg === 2 && r.maxLegs === 12 && r.sessionId === 'L2' && r.live === 'working' && !r.lastLeg);
    ok('…the first leg\'s title, the agent, the project, the engine', r.title === 'night shift' && r.agentName === 'developer'
        && r.agentId === 'D:/agents/dev' && r.projectId === 'prj_1' && r.engine === 'claude');
    ok('…the setup the next leg opens on (the pool, the inherited surface, model and effort)', r.next.account === '@emptiest'
        && r.next.surface === 'console' && r.next.model === 'opus' && r.next.effort === 'high');
    ok('…totals over every leg', r.totals.legs === 2 && r.totals.cost === 3.5 && r.totals.tokens === 150 && r.totals.ms === 89 * MIN);
    ok('…first and last stamps, and no signal while it works', r.startedAt === NOW - 90 * MIN && r.lastAt === NOW - 50 * MIN
        && r.signals.length === 0 && !r.trimmed);
    ok('a chain with no ceiling of its own takes the setting\'s', one([{ ...seal, maxLegs: undefined }, b1]).maxLegs === 6);
    ok('the user\'s last-leg brake on the running leg shows', one([seal, { ...b1, lastLeg: { at: NOW, by: 'the user' } }]).lastLeg === true);
    ok('the agent name falls back to the folder when no session names it', one([seal, b1]).agentName === 'dev');
}

// ---------- 1. hanging ----------
{
    const idle = (since) => one([seal, b1], { L2: { alive: true, idleSince: since } });
    const r = idle(NOW - T.hangMs - 1);
    ok('idle past the threshold: hanging, from when it went idle', kinds(r) === 'hanging' && r.live === 'idle'
        && r.signals[0].since === NOW - T.hangMs - 1 && r.signals[0].sessionId === 'L2' && /neither passed the baton nor closed the chain/.test(r.signals[0].why));
    ok('idle under the threshold: nothing yet', idle(NOW - T.hangMs + 1000).signals.length === 0);
    const gone = one([seal, b1], { L2: { alive: false, lastTs: NOW - T.hangMs - 1 } });
    ok('its session gone with no pass and no closing record: hanging', kinds(gone) === 'hanging' && gone.live === 'gone'
        && /no pass and no closing record/.test(gone.signals[0].why));
    ok('…but only once the threshold passed', one([seal, b1], { L2: { alive: false, lastTs: NOW - MIN } }).signals.length === 0);
    const unknown = one([seal, b1], {});
    ok('‼️ no facts about the session: no live word (unknown is never evidence of gone)…', unknown.live === undefined);
    ok('‼️ …but a record nothing has moved past the threshold is hanging, said as known nowhere — never a silent running row',
        kinds(unknown) === 'hanging' && unknown.signals[0].since === b1.updatedAt && /known nowhere/.test(unknown.signals[0].why));
    ok('…and a fresh record with an unknown session waits for the threshold', one([seal, { ...b1, updatedAt: NOW - MIN }], {}).signals.length === 0);
    ok('the thresholds are the caller\'s: the same idle leg is hanging under a shorter one',
        board([seal, b1], { L2: { alive: true, idleSince: NOW - 5 * MIN } }, { thresholds: { hangMs: MIN, waitMs: MIN } })[0].signals.length === 1);
}

// ---------- 2. waiting, stuck ----------
{
    const w = (age) => mk('b2', 2, 'waiting-end', 'L2', undefined, { why: 'waiting for this session to end', updatedAt: NOW - age, createdAt: NOW - age });
    const r = one([seal, b1, w(MIN)]);
    ok('waiting: the leg it opens next, the session it waits on', r.state === 'waiting' && r.bucket === 'waiting' && r.leg === 3 && r.sessionId === 'L2' && r.signals.length === 0);
    const s = one([seal, b1, w(T.waitMs + 1)]);
    ok('waiting past the threshold: stuck-wait, carrying the record\'s own reason', kinds(s) === 'stuck-wait' && /waiting for this session to end/.test(s.signals[0].why));
    ok('armed counts as waiting', one([seal, b1, { ...w(MIN), state: 'armed' }]).state === 'waiting');
    const rescued = one([seal, b1, { ...w(MIN), rescue: 'leg 2 ended without passing the baton: it exited with code 1' }]);
    ok('a hop the failsafe opened says why', /exited with code 1/.test(rescued.rescue));
    const parked = one([seal, b1, mk('b2', 2, 'parked', 'L2', undefined, { wakeAt: NOW + 30 * MIN })]);
    ok('parked: its own chip and the wake time', parked.state === 'parked' && parked.bucket === 'parked' && parked.wakeAt === NOW + 30 * MIN);
}

// ---------- 3. ended: done, failed, refused ----------
{
    const done = one([seal, b1, mk('c2', 2, 'done', 'L2', undefined, { why: 'leg 2 finished cleanly without passing — the chain\'s natural end' })]);
    ok('done: the last leg that ran, the done chip, no signal', done.state === 'done' && done.bucket === 'done' && done.leg === 2 && done.sessionId === 'L2' && done.signals.length === 0);
    const failed = one([seal, b1, mk('c2', 2, 'failed', 'L2', undefined, { why: 'crash-loop guard' })]);
    ok('failed: the stopped chip and a cut signal with the record\'s reason', failed.bucket === 'stopped' && kinds(failed) === 'cut' && failed.signals[0].why === 'crash-loop guard');
    const refused = one([seal, b1, mk('b2', 2, 'refused', 'L2', undefined, { why: 'the door refused' })]);
    ok('refused: also cut', refused.state === 'refused' && refused.bucket === 'stopped' && kinds(refused) === 'cut');
}

// ---------- 5. brakes (a field, not a sentence) ----------
{
    const br = (brake) => one([seal, b1, mk('b2', 2, 'stopped', 'L2', undefined, { why: 'braked — x', ...(brake ? { brake } : {}) })]);
    ok('the leg ceiling: stopped, named, a brake signal', br('ceiling').brake === 'ceiling' && kinds(br('ceiling')) === 'brake');
    ok('the barren brake: a brake signal', kinds(br('barren')) === 'brake');
    ok('the user\'s own last-leg brake is the user\'s choice: no signal', br('user').brake === 'user' && br('user').signals.length === 0);
    ok('‼️ a stop with no brake field raises nothing — the sentence is never parsed', br(undefined).signals.length === 0 && br(undefined).brake === undefined);
}

// ---------- 4. engine faults ----------
{
    const ep = (o) => ({ sessionId: 'L2', cardId: 'c', chainId: 'chn_1', leg: 2, kind: 'outage', said: 'x', since: NOW - MIN, nudges: 1, state: 'waiting', why: 'nudging', ...o });
    const f = (e) => board([seal, b1], { L2: { alive: true } }, { faults: [e] })[0];
    ok('a fault the watch is still on: a fault signal', kinds(f(ep({}))) === 'fault' && /outage — waiting: nudging/.test(f(ep({})).signals[0].why));
    ok('held and gave-up are faults too', kinds(f(ep({ state: 'held' }))) === 'fault' && kinds(f(ep({ state: 'gave-up' }))) === 'fault');
    ok('one the watch already passed for: none', f(ep({ state: 'passed' })).signals.length === 0);
    ok('a fault of another session or chain: none', f(ep({ sessionId: 'L1' })).signals.length === 0 && f(ep({ chainId: 'chn_9' })).signals.length === 0);
}

// ---------- the newest record decides ----------
{
    const superseded = mk('b2a', 2, 'stopped', 'L2', undefined, { why: 'replaced by b2b', updatedAt: NOW - 10 * MIN });
    const live = mk('b2b', 2, 'waiting-end', 'L2', undefined, { updatedAt: NOW - 10 * MIN });
    ok('a pass made twice: the live one speaks, not the one it replaced', one([seal, b1, superseded, live]).state === 'waiting');
    const closed = mk('c2', 2, 'done', 'L2', undefined, { updatedAt: NOW - 20 * MIN });
    const reopened = mk('b2', 2, 'started', 'L2', 'L3', { updatedAt: NOW - 5 * MIN });
    ok('a chain closed and reopened on the same hop: the newer record speaks', one([seal, b1, closed, reopened]).state === 'running');
}

// ---------- a chain only its links remember ----------
{
    const links = [
        { chainId: 'chn_old', hop: 0, from: 'O1', to: 'O1', state: 'started', createdAt: NOW - 900 * MIN, updatedAt: NOW - 900 * MIN },
        { chainId: 'chn_old', hop: 1, from: 'O1', state: 'done', createdAt: NOW - 800 * MIN, updatedAt: NOW - 800 * MIN }
    ];
    const rows = board([seal, b1], { O1: { alive: false, agentName: 'manager', title: 'old work' } }, { links });
    const old = rows.find(r => r.chainId === 'chn_old');
    ok('a chain whose batons were dropped is still a row, marked trimmed', rows.length === 2 && old && old.trimmed && old.state === 'done' && old.leg === 1);
    ok('…named from its sessions, with no setup to offer', old.agentName === 'manager' && old.title === 'old work' && old.next === undefined);
    ok('newest activity first', rows[0].chainId === 'chn_1');
    ok('passing the full store links (kept batons included) changes nothing', board([seal, b1], {}, { links: [] }).length === 1
        && board([seal, b1], {}, { links: [seal, b1].map(b => ({ chainId: b.chainId, hop: b.hop, from: b.from.sessionId, to: b.toSessionId, state: b.state, createdAt: b.createdAt, updatedAt: b.updatedAt })) })[0].totals.legs === 2);
}

// ---------- chips and filters ----------
{
    const c2 = (id, state, extra) => ({ ...mk(id, 1, state, 'X' + id, state === 'started' ? 'Y' + id : undefined, extra), chainId: 'chn_' + id });
    // a reset park (S-129: a park with no reset to wait for, held that long, is stuck — test_relay_seat)
    const rows = board([seal, b1, c2('a', 'parked', { wakeAt: NOW + 30 * MIN }), c2('b', 'failed'), c2('c', 'done', { from: { ...from('Xc'), agentId: 'D:/agents/ops', projectId: 'prj_2' } })], { L2: { alive: true } });
    const n = C.boardCounts(rows);
    ok('the chips count each bucket and attention across them', n.total === 4 && n.running === 1 && n.parked === 1 && n.stopped === 1 && n.done === 1 && n.attention === 1);
    ok('filter by bucket (failed is in stopped) or by exact state', C.filterBoard(rows, { state: 'stopped' }).length === 1 && C.filterBoard(rows, { state: 'failed' }).length === 1);
    ok('filter by agent name or id, by project, by attention', C.filterBoard(rows, { agent: 'ops' }).length === 1
        && C.filterBoard(rows, { agent: 'D:/agents/ops' }).length === 1 && C.filterBoard(rows, { project: 'prj_2' }).length === 1
        && C.filterBoard(rows, { attention: true }).map(r => r.chainId).join() === 'chn_b');
    ok('the chips are named once', C.CHAIN_BUCKETS.join() === 'running,waiting,parked,done,stopped');
}

// ---------- shape ----------
{
    const src = fs.readFileSync(path.join(ROOT, 'src', 'core', 'chainBoard.ts'), 'utf8');
    ok('‼️ pure: no file, no clock, no window, no setting read in the board', !/from 'fs'|from 'vscode'|Date\.now|getConfiguration/.test(src));
    ok('it stays under the anti-monolith ceiling', src.split('\n').length < 300);
    const bridge = fs.readFileSync(path.join(ROOT, 'src', 'core', 'batonBridge.ts'), 'utf8');
    const legEnd = fs.readFileSync(path.join(ROOT, 'src', 'core', 'batonLegEnd.ts'), 'utf8');
    ok('‼️ both doors that brake a pass write the brake\'s kind on the record', /brake: brake\.kind/.test(bridge) && /brake: brake\.kind/.test(legEnd));
    ok('…and baton.status shows it', /\.\.\.\(b\.brake \? \{ brake: b\.brake \} : \{\}\)/.test(bridge));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
