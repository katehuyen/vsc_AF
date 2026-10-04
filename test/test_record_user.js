// X-489 — WHOSE A RECORD IS: the phone's event frames and Notices carry a user
// field beside the devices and the audit log, so a team licence needs no
// migration; a record from before the field reads as the owner's.
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const ROOT = path.join(__dirname, '..');
const U = require(path.join(ROOT, 'out', 'core', 'farmUser.js'));
const D = require(path.join(ROOT, 'out', 'remote', 'server', 'devices.js'));
const { EventLog } = require(path.join(ROOT, 'out', 'remote', 'server', 'eventLog.js'));
const N = require(path.join(ROOT, 'out', 'core', 'notices.js'));
const K = require(path.join(ROOT, 'out', 'remote', 'contract', 'index.js'));
const C = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'remote', 'contract', 'remote-contract.v1.json'), 'utf8'));
const src = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-record-user-'));
try {
    // ---------- the one user ----------
    ok('a farm has one user today: the owner', U.OWNER === 'owner');
    ok('a missing or empty user reads as the owner, a named one stays — on both sides of the remote border',
        [U, D].every(m => m.userOf(undefined) === 'owner' && m.userOf('') === 'owner' && m.userOf(5) === 'owner' && m.userOf('team-a') === 'team-a'));
    ok('‼️ the remote module\'s owner IS the core\'s (spelled twice only because src/remote imports nothing outside itself)', D.OWNER === U.OWNER);

    // ---------- the event stream ----------
    const log = new EventLog(null, 10, () => 1000);
    const ev = log.append('notice.posted', { id: 'n1', title: 'Report ready', level: 2, agent: 'dev' });
    ok('every event frame says whose it is', ev.user === 'owner');
    ok('a named user is kept', log.append('x', {}, 'team-a').user === 'team-a');
    ok('‼️ the frame the host sends passes the contract checker', K.checkFrame(ev).ok);
    const old = path.join(tmp, 'events.json');
    fs.writeFileSync(old, JSON.stringify({ seq: 5, events: [
        { kind: 'event', seq: 4, type: 'a', ts: 1, data: {} },
        { kind: 'event', seq: 5, type: 'b', ts: 2, user: 'team-a', data: {} }] }), 'utf8');
    const replay = new EventLog(old).replay(3).events;
    ok('an event logged before the field is replayed as the owner\'s, a named one as its own',
        replay.length === 2 && replay[0].user === 'owner' && replay[1].user === 'team-a');

    // ---------- the contract ----------
    ok('the event frame declares user, optional (a host from before it sends none)', C.frames.event.fields.user === 'string?');
    ok('its example names the owner and passes', C.frames.event.example.user === 'owner' && K.checkFrame(C.frames.event.example).ok);
    const bare = Object.assign({}, C.frames.event.example); delete bare.user;
    ok('a frame without it still passes', K.checkFrame(bare).ok);

    // ---------- Notices ----------
    ok('a new notice is the owner\'s', N.makeNotice({ title: 'Report ready', agentName: 'dev' }).user === 'owner');
    const nf = path.join(tmp, 'notices.json');
    fs.writeFileSync(nf, JSON.stringify({ notices: [
        { id: 'n_old', ts: 1, agentName: 'dev', type: 'info', level: 1, title: 'Old' },
        { id: 'n_team', ts: 2, user: 'team-a', agentName: 'dev', type: 'info', level: 1, title: 'Team' }] }), 'utf8');
    const store = new N.NoticesStore(nf);
    store.load();
    const all = store.list ? store.list() : store.notices;
    const byId = id => all.find(n => n.id === id);
    ok('a notice stored before the field loads as the owner\'s, a named one as its own',
        byId('n_old') && byId('n_old').user === 'owner' && byId('n_team').user === 'team-a');
    ok('and a notice added to that board is the owner\'s', store.add({ title: 'New', agentName: 'dev' }).user === 'owner');

    // ---------- one source ----------
    ok('the event log takes the owner from the device book, Notices from farmUser',
        /import \{ OWNER, userOf \} from '\.\/devices';/.test(src('src/remote/server/eventLog.ts'))
        && /import \{ OWNER, userOf \} from '\.\/farmUser';/.test(src('src/core/notices.ts')));
    ok('nobody else spells the owner', !/export const OWNER/.test(src('src/remote/server/eventLog.ts')) && !/'owner'/.test(src('src/core/notices.ts')));
} finally {
    fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
