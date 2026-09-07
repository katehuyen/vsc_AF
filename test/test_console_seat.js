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
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { EventEmitter } = require('events');
const ROOT = path.resolve(__dirname, '..');

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
// killTree/killPid go through execFile — counted, never run: this is where the
// seconds came from (see S-29 below), so the test has to see WHEN it happens.
let reaps = 0;
const realExecFile = cp.execFile;
cp.execFile = (_c, _a, _o, cb) => {
    reaps++;
    const done = typeof _o === 'function' ? _o : cb;
    if (typeof done === 'function') { done(null, '', ''); }
    return new EventEmitter();
};

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

// ---------------------------------------------------------------------------
// ‼️ S-29 (reopened) — END SESSION AND REMOVE FROM LIST ANSWER IMMEDIATELY.
//
// "5 saniye 10 saniye veya daha fazla bekleyerek oturum kapanıyor" — and the
// reason was the order: everything ran BEFORE the state changed, and the last
// two steps spawn `taskkill`. Spawning is asynchronous in its result and
// synchronous in its cost, so the panel heard nothing until Windows had
// created two processes. The card must turn on the press; the processes die a
// tick later. `dispose` is the exception and it is the important one — a kill
// deferred while the window is closing never happens at all.
// ---------------------------------------------------------------------------
const tick = () => new Promise(r => setImmediate(r));

async function s29() {
    {
        const host = new ConsoleHost(() => 'claude');
        const id = host.start(init({ resume: 'S-6' }));
        let toldAt = -1;
        host.onChange(() => { toldAt = reaps; });

        const before = reaps;
        toldAt = -1;
        host.close(id);
        ok('‼️ S-29: the card is told it ended straight away', toldAt >= 0
            && host.get(id).status === 'ended');
        ok('‼️ …BEFORE anything spawns a process — that wait was the whole bug',
            toldAt === before && reaps === before);
        await tick();
        ok('…and the process is reaped on the very next tick, so nothing leaks',
            reaps > before);
    }

    // Remove from list: one gesture, one repaint. Ending a live card first used
    // to fire its own change, so the panel rebuilt the whole conversation twice.
    {
        const host = new ConsoleHost(() => 'claude');
        const id = host.start(init({ resume: 'S-7' }));
        let fired = 0;
        host.onChange(() => { fired++; });
        host.forget(id);
        ok('‼️ S-29: removing a live card repaints the panel once, not twice',
            fired === 1 && host.list().length === 0);
        await tick();
        ok('…and its process still dies', reaps > 0);
    }

    // The window is going away: a deferred kill would never run, and an
    // orphaned `claude` holds its session registry entry — which is what makes
    // a conversation unreachable rather than merely leaked.
    {
        const host = new ConsoleHost(() => 'claude');
        host.start(init({ resume: 'S-8' }));
        const before = reaps;
        host.dispose();
        ok('‼️ S-29: dispose still kills SYNCHRONOUSLY — the tick never comes there',
            reaps > before);
    }

    // ‼️ S-29 (V3) — THE OTHER HALF OF "ONE GESTURE, ONE REPAINT".
    //
    // The host was made the single authority above and then the right-click
    // COMMANDS went on calling `ConsolePanel.refreshIfOpen()` after it, so the
    // menu route still rebuilt the whole conversation twice for one click while
    // the webview's own button rebuilt it once. The host test above cannot see
    // that — it is a fact about the command wiring — so it is asserted on the
    // source, which is the only place it exists.
    {
        const src = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
        const cmd = name => {
            const at = src.indexOf(`registerCommand('agentfarm.${name}'`);
            return at < 0 ? '' : src.slice(at, at + 1400);
        };
        for (const name of ['consoleEndSession', 'consoleEndAndRemove', 'consoleForgetSession']) {
            const body = cmd(name).split('}),')[0];
            ok(`‼️ S-29: ${name} leaves the repaint to the host — no second refresh`,
                !!body && !/ConsolePanel\.refreshIfOpen/.test(body));
        }
    }

    // ‼️ S-29 (V3) — AND "ended" IS VERIFIED RATHER THAN ASSERTED. The card goes
    // grey before the kill on purpose; a kill that then failed left the row
    // claiming a process that is still holding the session id, which is exactly
    // the state where a later resume is refused with nothing on screen to say
    // why.
    {
        // the CLI's own registry still names a live pid for this session
        const host = new ConsoleHost(() => 'claude', () => 4242);
        const id = host.start(init({ resume: 'S-9' }));
        host.close(id);
        await tick();
        await new Promise(r => setTimeout(r, 4200));
        ok('‼️ S-29: a process that did NOT die is written on the row, not hidden',
            /did not stop/.test(host.get(id).exitReason || ''));
    }
}

// ---- X-266: the scrollback a revive could not rebuild at activation time ----
// Driven through the REAL host for the reason at the top of this file: the bug
// was that a card came back EMPTY, and only the card can say whether it did.
{
    const host = new ConsoleHost(() => 'claude');
    const ph = { id: 'xh-note', ts: 1, role: 'system', text: 'not in the index yet' };
    const notice = { id: 'xr-revived', ts: 2, role: 'system', text: 'taken up where it left off' };
    const seat = host.start(init({ resume: 'S-9', history: [ph, notice] }));

    let fired = 0;
    host.onChange(id => { if (id === seat) { fired++; } });

    const rows = [
        { id: 'xh0', ts: 0, role: 'user', text: 'the first thing said' },
        { id: 'xh1', ts: 0, role: 'assistant', text: 'the answer' }
    ];
    ok('‼️ the scrollback the index could not give at activation goes in later',
        host.rebuildHistory(seat, rows) === true);
    const msgs = host.get(seat).messages;
    ok('…in the placeholder\'s place, so the conversation reads in order',
        msgs.map(m => m.id).join(',') === 'xh0,xh1,xr-revived');
    ok('…and the panel is told, or the reader would be looking at the old draw',
        fired === 1);

    ok('a second attempt changes nothing — the placeholder is gone',
        host.rebuildHistory(seat, rows) === false);
    ok('a seat the reader already closed is not an error, just nothing to do',
        host.rebuildHistory('cs-nope', rows) === false);
}

s29().then(() => {
    cp.spawn = realSpawn;
    cp.exec = realExec;
    cp.execSync = realExecSync;
    cp.execFile = realExecFile;

    console.log(`${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
});
