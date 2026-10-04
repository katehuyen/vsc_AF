// X-445 — THE NUMBERED EVENT STREAM a phone resumes from.
//
// Seqs only grow (also across a lost file), the last `keep` events survive a
// window reload, and a phone's resumeAfter becomes exactly what it missed: a gap
// for what the log no longer holds, then the events after it.
// X-501 — the file is written off the host's thread, so a reload starts no lower
// than the clock: appends that never reached the disk cannot be numbered twice.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const { EventLog } = require(path.join(ROOT, 'out', 'remote', 'server', 'eventLog.js'));

let t = 1_000_000;
const clock = () => t;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-events-'));
const file = path.join(dir, 'remote', 'events.json');
(async () => {
    try {
        const log = new EventLog(file, 3, clock);
        ok('an empty log starts at the current time', log.lastSeq === 1_000_000);
        const a = log.append('turn.finished', { session: 's1' });
        ok('the first event is the next seq, stamped with the clock', a.seq === 1_000_001 && a.ts === 1_000_000 && a.kind === 'event');
        ok('an append returns before the disk is touched', !fs.existsSync(file));
        log.append('needs.changed', { count: 1 });
        log.append('needs.changed', { count: 0 });
        log.append('notice.posted', { id: 'n1' });
        ok('only the last keep events are held', log.replay(0).events.length === 3);

        const r = log.replay(1_000_000);
        ok('a phone behind the oldest held event gets the gap first', r.gap && r.gap.from === 1_000_001 && r.gap.to === 1_000_001);
        ok('then every held event after it, in order', r.events.map(e => e.seq).join() === '1000002,1000003,1000004');
        const r2 = log.replay(1_000_002);
        ok('a phone inside the window gets no gap, only what it missed', !r2.gap && r2.events.map(e => e.seq).join() === '1000003,1000004');
        ok('a phone up to date is owed nothing', log.replay(1_000_004).events.length === 0 && !log.replay(1_000_004).gap);
        ok('a phone ahead of the log is owed nothing', log.replay(9_999_999).events.length === 0);
        await log.settled();
        ok('once settled the file holds the seq and the last keep events',
            JSON.parse(fs.readFileSync(file, 'utf8')).seq === 1_000_004 && JSON.parse(fs.readFileSync(file, 'utf8')).events.length === 3);

        t = 900_000;
        const behind = new EventLog(file, 3, clock);
        ok('a reload with the clock behind the file keeps the seq and the held events', behind.lastSeq === 1_000_004 && behind.replay(1_000_002).events.length === 2);
        ok('and continues from there', behind.append('x', {}).seq === 1_000_005);
        await behind.settled();

        t = 2_000_000;
        const reloaded = new EventLog(file, 3, clock);
        ok('a reload starts no lower than the clock — an append that never reached the disk is not numbered again',
            reloaded.lastSeq === 2_000_000 && reloaded.append('y', {}).seq === 2_000_001);
        ok('…the held events are still replayed to a phone that missed them', reloaded.replay(1_000_003).events.map(e => e.seq).join() === '1000004,1000005,2000001');
        ok('…with no gap for the numbers nobody used', !reloaded.replay(1_000_003).gap);
        await reloaded.settled();

        // an append made just before a reload, its write not yet done: the next host still numbers past it
        const hurried = new EventLog(file, 3, clock);
        const lostSeq = hurried.append('z', {}).seq;
        t = 2_000_100;
        const next = new EventLog(file, 3, clock);
        ok('an append whose write had not landed is never re-used as a seq', next.append('w', {}).seq > lostSeq);
        await hurried.settled(); await next.settled();

        fs.rmSync(file, { force: true });
        t = 3_000_000;
        const lost = new EventLog(file, 3, clock);
        ok('a lost file starts past every seq the old log reached', lost.lastSeq === 3_000_000 && lost.lastSeq > 2_000_101);
        fs.writeFileSync(file, '{broken');
        ok('an unreadable file reads as a fresh log', new EventLog(file, 3, clock).lastSeq === 3_000_000);
        await lost.settled();
        ok('no temp file is left behind', !fs.existsSync(file + '.tmp'));
        ok('a log with no file writes nothing', new EventLog(null, 3, clock).append('x', {}).seq === 3_000_001);

        const blocker = path.join(dir, 'blocker');
        fs.writeFileSync(blocker, 'a file where a folder should be');
        const lines = [];
        const stuck = new EventLog(path.join(blocker, 'events.json'), 3, clock, l => lines.push(l));
        const e = stuck.append('x', {});
        await stuck.settled();
        ok('a disk that refuses does not stop an append', e.seq === 3_000_001 && stuck.replay(0).events.length === 1);
        ok('…the host is told it is held in memory only', lines.some(l => /events\.json not written/.test(l) && /held in memory only/.test(l)));
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
    console.log(`remote events: ${pass} passed, ${fail} failed`);
    if (fail) { process.exit(1); }
})();
