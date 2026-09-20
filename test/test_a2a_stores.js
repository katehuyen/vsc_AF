// N-3 — THE A2A DATA BACKBONE: two stores, one disk, several agents.
//
// What is pinned here:
//   * ‼️ A CLAIM IS COMPARE-AND-SET. Two store objects on ONE file are two
//     agents in two extension hosts; exactly one of them gets the task, and
//     the loser is told why rather than silently overwriting the winner;
//   * ‼️ A CLAIM IS A LEASE, NOT A DEED — an agent that is killed mid-task
//     does not hold it for ever: the lease runs out and the task goes back to
//     queued, and a heartbeat is what pushes the lease forward;
//   * ‼️ THE LOOP GUARD — A→B→A→… stops at MAX_HANDOFF_DEPTH as `blocked`,
//     never `cancelled`: the work may be real and the routing wrong, which is
//     a person's call;
//   * the coordinates are a MATCH, not an address: '*' on either side is
//     anything, and `hard` / `preferred` / `any` really behave differently;
//   * a write from another host is never erased by this one's stale copy;
//   * a stale lock is broken rather than deadlocking the farm for ever;
//   * a row written by an older build still loads as a row.
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const S = require(path.join(__dirname, '..', 'out', 'core', 'a2aStore.js'));
const N = require(path.join(__dirname, '..', 'out', 'core', 'a2aNotes.js'));
const T = require(path.join(__dirname, '..', 'out', 'core', 'a2aTasks.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// a test that THROWS never reaches its cleanup, so the fixture lives in tmp
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-a2a-'));
const notesFile = path.join(dir, 'notes.json');
const tasksFile = path.join(dir, 'tasks.json');

try {
    // ---------- the disk under both ----------
    const f = path.join(dir, 'env.json');
    ok('an envelope round-trips', S.writeEnvelope(f, { rev: 3, items: [{ id: 'a' }] })
        && S.readEnvelope(f, r => r).rev === 3);
    fs.writeFileSync(f, JSON.stringify([{ id: 'x' }]), 'utf8');
    const bare = S.readEnvelope(f, r => r);
    ok('a bare array — the shape before rev existed — still loads',
        bare.rev === 0 && bare.items.length === 1);
    fs.writeFileSync(f, '{ not json', 'utf8');
    ok('a corrupt file reads as empty rather than throwing', S.readEnvelope(f, r => r).items.length === 0);
    fs.writeFileSync(f, JSON.stringify({ rev: 1, items: [{ id: 'a' }, 'junk', { nope: 1 }] }), 'utf8');
    ok('rows without an id are dropped, not carried', S.readEnvelope(f, r => r).items.length === 1);

    const lockFile = path.join(dir, 'lk.json');
    ok('the lock is taken and released', S.withLock(lockFile, () => 'in') === 'in'
        && !fs.existsSync(lockFile + '.lock'));
    fs.writeFileSync(lockFile + '.lock', '', 'utf8');
    const t0 = Date.now();
    ok('somebody else\'s fresh lock refuses rather than corrupting',
        S.withLock(lockFile, () => 'in') === undefined);
    ok('…and it gave up inside the wait, not for ever', Date.now() - t0 < S.LOCK_WAIT_MS + 1500);
    // ‼️ a host killed mid-write (the window reload this extension does to
    // itself) must not leave the A2A layer dead until somebody deletes a file
    const old = Date.now() - S.STALE_LOCK_MS - 5000;
    fs.utimesSync(lockFile + '.lock', old / 1000, old / 1000);
    ok('‼️ a STALE lock is broken and taken', S.withLock(lockFile, () => 'in') === 'in');
    try { fs.unlinkSync(lockFile + '.lock'); } catch { /* already gone */ }
    ok('ids sort by time and do not collide',
        S.a2aId('n', 1) !== S.a2aId('n', 1) && S.a2aId('n', 1) < S.a2aId('n', 2));

    // ---------- notes: the coordinates are a match, not an address ----------
    const note = (over = {}) => N.makeNote({ fromAgent: 'developer', title: 'x', ...over }, 1000);
    ok('an unstated coordinate is a wildcard', note().project === '*' && note().targetRole === '*');
    ok('the default strictness is preferred, not hard', note().strictness === 'preferred');
    ok('an unknown category falls back to info', note({ category: 'nonsense' }).category === 'info');
    ok('a ttl becomes a deadline', note({ ttlMs: 500 }).expiresAt === 1500);
    ok('no ttl means it does not expire', note().expiresAt === 0);

    const hard = note({ project: 'AF', topic: 'bridge', strictness: 'hard' });
    ok('hard: every stated coordinate must line up',
        N.noteScore(hard, { project: 'AF', topic: 'bridge' }) === 2);
    ok('hard: one miss and it is not yours',
        N.noteScore(hard, { project: 'AF', topic: 'ui' }) === undefined);
    ok('hard: a coordinate the reader did not state is not a miss',
        N.noteScore(hard, { project: 'AF' }) === 1);
    const pref = note({ project: 'AF', topic: 'bridge', strictness: 'preferred' });
    ok('preferred: a partial fit is still yours, and scores lower',
        N.noteScore(pref, { project: 'AF', topic: 'ui' }) === 1);
    ok('preferred: no hit at all and a miss is not yours',
        N.noteScore(pref, { project: 'OTHER', topic: 'ui' }) === undefined);
    const any = note({ project: 'AF', topic: 'bridge', strictness: 'any' });
    // ‼️ N-5 — THE PROJECT CONTAINS IN EVERY MODE. `any` opens a note to
    // anyone IN THE PROJECT; a fleet-wide note says project '*'. Without this
    // the wildcard would add nothing to `any`, and a note about one project
    // would land on every other project's board.
    ok('any: anyone in the project may read it, whatever the other coordinates say',
        N.noteScore(any, { project: 'AF', topic: 'ui', role: 'psikolog' }) === 1);
    ok('any: but another project is another project',
        N.noteScore(any, { project: 'OTHER' }) === undefined);
    ok("a '*' on the note matches anything asked of it",
        N.noteScore(note({ project: '*', strictness: 'hard' }), { project: 'WHATEVER' }) === 0);
    ok("…and a '*' asked for matches anything on the note",
        N.noteScore(note({ project: 'AF', strictness: 'hard' }), { project: '*' }) === 0);

    const pool = [
        note({ project: 'AF', topic: 'bridge', title: 'exact' }),
        note({ project: 'AF', title: 'partial' }),
        note({ project: 'AF', topic: 'bridge', title: 'resolved' })
    ];
    pool[2].resolved = true;
    const matched = N.matchNotes(pool, { project: 'AF', topic: 'bridge' }, 2000);
    ok('the closest fit is ranked first', matched[0].title === 'exact');
    ok('…and a resolved note is out of the way', matched.every(n => n.title !== 'resolved'));
    ok('…until it is asked for', N.matchNotes(pool, { project: 'AF', includeResolved: true }, 2000).length === 3);
    const expired = note({ project: 'AF', ttlMs: 100 });
    ok('an expired note is history', N.matchNotes([expired], { project: 'AF' }, 5000).length === 0);
    ok('…and can still be read on purpose',
        N.matchNotes([expired], { project: 'AF', includeExpired: true }, 5000).length === 1);
    const read = note({ project: 'AF' });
    read.readBy = ['psikolog'];
    ok('unread-only skips what this reader has seen',
        N.matchNotes([read], { project: 'AF', reader: 'psikolog', unreadOnly: true }).length === 0);
    ok('…and not what somebody else has',
        N.matchNotes([read], { project: 'AF', reader: 'wiki', unreadOnly: true }).length === 1);

    // ---------- the notes store on disk ----------
    const notes = new N.A2ANotesStore(notesFile);
    notes.load();
    const n1 = notes.add({ fromAgent: 'developer', title: 'the bridge needs an op', project: 'AF', topic: 'bridge' });
    ok('a note is written and handed back', !!n1 && n1.title === 'the bridge needs an op');
    const other = new N.A2ANotesStore(notesFile);
    other.load();
    ok('‼️ another host reads it off the same file', other.get(n1.id)?.id === n1.id);
    other.add({ fromAgent: 'psikolog', title: 'from the other host', project: 'AF' });
    notes.add({ fromAgent: 'developer', title: 'written against a stale copy', project: 'AF' });
    const fresh = new N.A2ANotesStore(notesFile);
    fresh.load();
    ok('‼️ and this host\'s stale copy does NOT erase the other host\'s note',
        fresh.notes.length === 3);
    notes.markRead(n1.id, 'psikolog');
    notes.markRead(n1.id, 'psikolog');
    ok('reading twice is not news', notes.get(n1.id).readBy.length === 1);
    notes.resolve(n1.id);
    ok('a resolved note says so', notes.get(n1.id).resolved === true);
    notes.direct(n1.id, { kind: 'veto', text: 'not this way', ts: 1 });
    ok('the user\'s word is kept on the note', notes.get(n1.id).humanDirective.kind === 'veto');
    notes.direct(n1.id, undefined);
    ok('…and taken off again — the key is gone', !('humanDirective' in notes.get(n1.id)));
    // ‼️ TTL archiving (N-9): only what is BOTH resolved and past its ttl goes
    const soon = notes.add({ fromAgent: 'developer', title: 'short-lived', project: 'AF', ttlMs: 1000 }, 1000);
    const openButOld = notes.add({ fromAgent: 'developer', title: 'old but open', project: 'AF', ttlMs: 1000 }, 1000);
    notes.resolve(soon.id);
    const before = notes.notes.length;
    ok('sweep at a time before the ttl drops nothing', notes.sweep(1500) === 0 && notes.notes.length === before);
    ok('‼️ sweep past the ttl drops the resolved one and keeps the open one',
        notes.sweep(3000) === 1 && !notes.get(soon.id) && !!notes.get(openButOld.id));

    // ---------- tasks: the claim is the whole point ----------
    const task = (over = {}) => T.makeTask({ fromAgent: 'developer', title: 't', ...over }, 1000);
    ok('a new task is queued and unclaimed',
        task().state === 'queued' && task().claimedBy === undefined);
    ok('a handoff depth starts at zero', task().handoffDepth === 0);
    const dev = { agent: 'developer', role: 'developer', project: 'AF', capabilities: ['ts', 'git'] };
    ok('capabilities are required in full',
        T.claimable(task({ requires: ['ts', 'docker'] }), dev) === 'missing a required capability');
    ok('…and case does not decide it',
        T.claimable(task({ requires: ['TS'] }), dev) === undefined);
    ok('hard coordinates refuse the wrong agent',
        T.claimable(task({ targetRole: 'psikolog', strictness: 'hard' }), dev) === 'the coordinates are not yours');
    ok('…and accept the right one',
        T.claimable(task({ targetRole: 'developer', strictness: 'hard' }), dev) === undefined);
    ok('any takes whoever asks',
        T.claimable(task({ targetRole: 'psikolog', strictness: 'any' }), dev) === undefined);

    const tasks = new T.A2ATasksStore(tasksFile);
    tasks.load();
    const t1 = tasks.add({ fromAgent: 'developer', title: 'run the suite', project: 'AF', targetRole: '*' });
    ok('a task is written and handed back', !!t1 && t1.state === 'queued');

    // ‼️ two store objects on one file ARE two agents in two hosts
    const hostA = new T.A2ATasksStore(tasksFile); hostA.load();
    const hostB = new T.A2ATasksStore(tasksFile); hostB.load();
    const a = hostA.claim(t1.id, { agent: 'developer' });
    const b = hostB.claim(t1.id, { agent: 'psikolog' });
    ok('‼️ exactly one claimant wins', !!a.task && !!b.refused);
    ok('…and the loser is TOLD, not silently overwritten', b.refused === 'already claimed');
    ok('the winner holds a lease with a deadline', a.task.claimedBy.leaseExpiresAt > Date.now());
    ok('the winner is named on the row', a.task.claimedBy.agent === 'developer');
    ok('a task nobody wrote cannot be claimed',
        tasks.claim('nope', { agent: 'x' }).refused === 'no such task');

    // ‼️ a lease, not a deed
    const far = Date.now() + T.LEASE_MS + 60_000;
    hostA.load(far);
    ok('‼️ a lease that ran out puts the task back in the queue',
        hostA.get(t1.id).state === 'queued' && hostA.get(t1.id).claimedBy === undefined);
    ok('…and the handoff count remembers that somebody dropped it',
        hostA.get(t1.id).handoffDepth === 1);
    const retake = hostA.claim(t1.id, { agent: 'psikolog' }, far);
    ok('…so the next agent can take it', !!retake.task);
    const beat = hostA.heartbeat(t1.id, 'psikolog', 'half way', far);
    ok('a heartbeat moves it to running and says where it got to',
        beat.state === 'running' && beat.claimedBy.progress === 'half way');
    ok('…and pushes the lease forward', beat.claimedBy.leaseExpiresAt > far);
    ok('a heartbeat from somebody who does not hold it changes nothing',
        hostA.heartbeat(t1.id, 'wiki', 'mine now', far).claimedBy.agent === 'psikolog');
    const done = hostA.finish(t1.id, 'psikolog', 'done', 'suite green', far);
    ok('the holder finishes it', done.state === 'done' && done.resultSummary === 'suite green');
    ok('a finished task is not handed back out',
        T.isOpen(hostA.get(t1.id), far + 10 * T.LEASE_MS) === false);

    // ‼️ the loop guard
    const looped = tasks.add({ fromAgent: 'developer', title: 'round and round', handoffDepth: 0, sourceNoteId: 'n-origin', sourceQueueItemId: 'wq-9' });
    const h1 = tasks.handoff(looped.id, { targetRole: 'psikolog' }, 'developer');
    ok('a handoff makes a NEW task carrying the trail',
        !!h1.task && h1.task.parentTaskId === looped.id && h1.task.handoffDepth === 1);
    ok('…and the lineage: the note and the queue item it grew out of travel with it (N-9)',
        h1.task.sourceNoteId === 'n-origin' && h1.task.sourceQueueItemId === 'wq-9');
    ok('…and closes the one it came from, so the history survives',
        tasks.get(looped.id).state === 'done' && /Handed on to psikolog/.test(tasks.get(looped.id).resultSummary));
    const h2 = tasks.handoff(h1.task.id, { targetRole: 'wiki' }, 'psikolog');
    ok('a second hop is still allowed', !!h2.task && h2.task.handoffDepth === 2);
    const h3 = tasks.handoff(h2.task.id, { targetRole: 'developer' }, 'wiki');
    ok('‼️ the third is the loop guard', !!h3.refused && /loop guard/.test(h3.refused));
    ok('…and it BLOCKS rather than cancelling — the work may be real',
        tasks.get(h2.task.id).state === 'blocked');
    ok('…saying so in words a person can act on',
        /a person decides/.test(tasks.get(h2.task.id).resultSummary));
    const shallow = tasks.add({ fromAgent: 'd', title: 'shallow zombie', handoffDepth: 0 });
    tasks.claim(shallow.id, { agent: 'developer' });
    tasks.load(Date.now() + T.LEASE_MS + 1000);
    ok('a zombie with hops left goes back to the queue',
        tasks.get(shallow.id).state === 'queued' && tasks.get(shallow.id).handoffDepth === 1);
    const zombie = tasks.add({ fromAgent: 'd', title: 'deep zombie', handoffDepth: T.MAX_HANDOFF_DEPTH - 1 });
    tasks.claim(zombie.id, { agent: 'developer' });
    tasks.load(Date.now() + T.LEASE_MS + 1000);
    ok('‼️ a zombie at the ceiling is blocked, not re-queued for ever',
        tasks.get(zombie.id).state === 'blocked');

    const cancelled = tasks.add({ fromAgent: 'd', title: 'stop this' });
    tasks.cancel(cancelled.id, 'the user said so');
    ok('the user can stop a task whoever holds it', tasks.get(cancelled.id).state === 'cancelled');
    tasks.cancel(cancelled.id, 'again');
    ok('…and a terminal task is not re-cancelled into a new reason',
        tasks.get(cancelled.id).resultSummary === 'the user said so');
    const directed = tasks.add({ fromAgent: 'd', title: 'steer me' });
    tasks.direct(directed.id, { kind: 'constraint', text: 'read-only', ts: 2 });
    ok('the user\'s word is kept on the task', tasks.get(directed.id).humanDirective.kind === 'constraint');

    // ---------- a row from an older build is still a row ----------
    const legacy = T.normaliseTask({ id: 'tlegacy', title: 'from before' });
    ok('a legacy task fills in its missing fields',
        legacy.state === 'queued' && legacy.handoffDepth === 0 && Array.isArray(legacy.requires));
    ok('…and an unknown state does not become one',
        T.normaliseTask({ id: 'x', state: 'weird' }).state === 'queued');
    ok('a legacy note fills in its coordinates',
        N.normaliseNote({ id: 'nlegacy' }).project === '*' && N.normaliseNote({ id: 'n2' }).readBy.length === 0);

    console.log(`test_a2a_stores: ${pass} passed, ${fail} failed`);
} finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
}
process.exit(fail ? 1 : 0);
