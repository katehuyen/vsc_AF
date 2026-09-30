// X-445 — THE NUMBERED EVENT STREAM a phone resumes from.
//
// Seqs only grow (also across a lost file), the last `keep` events survive a
// window reload, and a phone's resumeAfter becomes exactly what it missed: a gap
// for what the log no longer holds, then the events after it.
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
try {
    const log = new EventLog(file, 3, clock);
    ok('an empty log starts at the current time', log.lastSeq === 1_000_000);
    const a = log.append('turn.finished', { session: 's1' });
    ok('the first event is the next seq, stamped with the clock', a.seq === 1_000_001 && a.ts === 1_000_000 && a.kind === 'event');
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

    t = 2_000_000;
    const reloaded = new EventLog(file, 3, clock);
    ok('a reload keeps the seq and the held events', reloaded.lastSeq === 1_000_004 && reloaded.replay(1_000_002).events.length === 2);
    ok('and continues from there', reloaded.append('x', {}).seq === 1_000_005);

    fs.rmSync(file);
    const lost = new EventLog(file, 3, clock);
    ok('a lost file starts past every seq the old log reached', lost.lastSeq === 2_000_000 && lost.lastSeq > 1_000_005);
    fs.writeFileSync(file, '{broken');
    ok('an unreadable file reads as a fresh log', new EventLog(file, 3, clock).lastSeq === 2_000_000);
    ok('no temp file is left behind', !fs.existsSync(file + '.tmp'));
    ok('a log with no file writes nothing', new EventLog(null, 3, clock).append('x', {}).seq === 2_000_001);
} finally {
    fs.rmSync(dir, { recursive: true, force: true });
}

console.log(`remote events: ${pass} passed, ${fail} failed`);
if (fail) { process.exit(1); }
