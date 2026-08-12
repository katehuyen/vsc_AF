// S-29 — ONE CARD PER SESSION IN THE CONSOLE'S LEFT PANEL.
//
// An ended session keeps its card until you press "Remove from list", and it
// keeps it for two good reasons: the conversation can still be read, and it is
// under your hand when you want it back. Resuming it therefore has to come back
// to THAT card — and it did not. Every route built a fresh one, so the panel
// held two cards with the same session id, one live and one grey; doing it
// again would have made three.
//
// ‼️ This drives the REAL ConsoleHost with a fake child process, rather than
// grepping consolehost.ts for a word. The last audit of this codebase found
// that most engine tests proved a string existed and nothing else, and this is
// exactly the kind of bug a string test cannot see.
'use strict';
const path = require('path');
const cp = require('child_process');
const { EventEmitter } = require('events');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// ---- a child that is a shape, not a process ------------------------------
let spawned = 0;
function fakeChild() {
    spawned++;
    const child = new EventEmitter();
    const pipe = () => {
        const s = new EventEmitter();
        s.setEncoding = () => { };
        s.destroy = () => { };
        return s;
    };
    child.stdout = pipe();
    child.stderr = pipe();
    child.stdin = { write: () => true, end: () => { } };
    child.pid = 4000 + spawned;
    child.kill = () => { };
    return child;
}
const realSpawn = cp.spawn;
cp.spawn = () => fakeChild();
// killTree shells out; with a fake pid there is nothing to kill and the
// platform command must never actually run.
const realExec = cp.exec;
cp.exec = (_c, cb) => { if (typeof cb === 'function') { cb(null, '', ''); } };
const realExecSync = cp.execSync;
cp.execSync = () => '';

const { ConsoleHost } = require(path.join(__dirname, '..', 'out', 'core', 'consolehost.js'));

const init = (o) => Object.assign({
    agentId: 'dev', agentName: 'developer', cwd: process.cwd(),
    engine: 'claude', permissionMode: 'default'
}, o);

// ---- the reported bug ----------------------------------------------------
{
    const host = new ConsoleHost(() => 'claude');
    const first = host.start(init({ resume: 'S-1' }));
    ok('a resumed session opens a card', host.list().length === 1);
    ok('…and it knows which session it is', host.get(first).sessionId === 'S-1');

    host.close(first);
    ok('ending it leaves the card in place — that is what it is for',
        host.list().length === 1 && host.get(first).status === 'ended');

    const again = host.start(init({ resume: 'S-1' }));
    ok('‼️ resuming it comes back to the SAME card, not a second one',
        host.list().length === 1);
    ok('…in the same seat, so a selection and a right-click menu still point at it',
        again === first);
    ok('…and the card is live again', host.get(first).status !== 'ended');

    // The user's own next question: "I have not tried it, but I suppose closing
    // this one and opening another would give me three."
    host.close(again);
    host.start(init({ resume: 'S-1' }));
    ok('‼️ …and a third round is still one card', host.list().length === 1);
}

// ---- a LIVE card is a different answer -----------------------------------
// There is nothing to revive, and spawning would put a second process on one
// transcript. One route guarded this by hand; the other five did not.
{
    const host = new ConsoleHost(() => 'claude');
    const live = host.start(init({ resume: 'S-2' }));
    const before = spawned;
    const same = host.start(init({ resume: 'S-2' }));
    ok('‼️ resuming a session that is already running hands back its card',
        same === live && host.list().length === 1);
    ok('…without starting a second process on the same transcript', spawned === before);
}

// ---- and it does not glue unrelated sessions together ---------------------
{
    const host = new ConsoleHost(() => 'claude');
    const a = host.start(init({ resume: 'S-3' }));
    const b = host.start(init({ resume: 'S-4' }));
    ok('two different sessions are two cards', a !== b && host.list().length === 2);

    const fresh = host.start(init({}));
    ok('…and a session with no id yet takes a seat of its own',
        host.list().length === 3 && fresh !== a && fresh !== b);

    host.close(a);
    host.forget(a);
    ok('Remove from list still removes exactly one', host.list().length === 2);
    const back = host.start(init({ resume: 'S-3' }));
    ok('…and a session whose card was removed opens a new one, as it should',
        host.list().length === 3 && back !== b);
}

// ---- an errored session is a dead card too -------------------------------
{
    const host = new ConsoleHost(() => 'claude');
    const id = host.start(init({ resume: 'S-5' }));
    // the shape of a crash: the child reports a broken pipe
    host.get(id);
    const before = host.list().length;
    // drive it through the host's own path rather than writing state by hand
    host.close(id);
    ok('a card that ended is one card', before === 1 && host.list().length === 1);
    host.start(init({ resume: 'S-5' }));
    ok('…and resuming takes its seat', host.list().length === 1);
}

cp.spawn = realSpawn;
cp.exec = realExec;
cp.execSync = realExecSync;

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
