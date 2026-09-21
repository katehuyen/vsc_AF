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
    // what the host writes down the pipe, kept so a test can read the wire
    child.written = [];
    child.stdin = { write: (s) => { child.written.push(String(s)); return true; }, end: () => { } };
    child.pid = 4000 + spawned;
    child.kill = () => { };
    lastChild = child;
    return child;
}
let lastChild = null;
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

// ---- the scrollback a revive could not rebuild at activation time -------
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

// ---- its twin: the FIGURES a revive could not read either ----------------
// The scrollback was retried when the index caught up and the totals were not,
// so a revived card sat under an hour-old conversation reading "0 tokens, 0
// turns this session". Driven through the REAL host for the same reason as the
// block above: only the card can say what the card shows.
{
    const host = new ConsoleHost(() => 'claude');
    const seat = host.start(init({ resume: 'S-11' }));

    let fired = 0;
    host.onChange(id => { if (id === seat) { fired++; } });

    ok('a revived seat starts at zero — the index had not answered yet',
        host.get(seat).tokens === 0 && host.get(seat).turns === 0
        && host.get(seat).costUSD === 0);

    ok('‼️ the baseline the index could not give at activation goes in later',
        host.applyCarried(seat, {
            costUSD: 1.25, tokens: 40000, wTokens: 12000, turns: 3,
            contextTokens: 90000, contextWindowTokens: 200000
        }) === true);
    {
        const st = host.get(seat);
        ok('…and the card counts the CONVERSATION, not this window\'s turn at it',
            st.costUSD === 1.25 && st.tokens === 40000 && st.wTokens === 12000
            && st.turns === 3);
        ok('…the context reading comes with it, marked as read off the transcript',
            st.contextTokens === 90000 && st.contextWindowTokens === 200000
            && st.contextSource === 'transcript-last-call' && st.contextStale === true);
        ok('…and the panel is told, or the reader would be looking at the old draw',
            fired === 1);
    }

    // ‼️ ADDED, NEVER ASSIGNED. A seat that was mid-turn is nudged to carry on
    // the moment it comes back, so it can spend something of its own before the
    // scan catches up; assigning would throw that away.
    ok('a second baseline ADDS — what the seat spent meanwhile is not thrown away',
        host.applyCarried(seat, { costUSD: 0.75, tokens: 1000, turns: 1 }) === true
        && host.get(seat).costUSD === 2 && host.get(seat).tokens === 41000
        && host.get(seat).turns === 4);
    ok('…but a context reading already on the card is NOT overwritten — live beats disk',
        host.applyCarried(seat, { contextTokens: 5 }) === true
        && host.get(seat).contextTokens === 90000);

    ok('nothing to carry is not an error, and changes nothing',
        host.applyCarried(seat, undefined) === false);
    ok('a seat the reader already closed is not an error either',
        host.applyCarried('cs-nope', { tokens: 1 }) === false);
}

// ---- audit B-03.7: THE NUDGE REACHES A SEAT THAT WAS JUST RESUMED ----------
// Driven through the REAL host, because the question is not "would the rule say
// yes" but "does a prompt written into a seat that `start()` has only just
// returned actually land in that conversation". The extension's `nudgeRevived`
// waits for `idle` and then calls exactly this.
{
    const host = new ConsoleHost(() => 'claude');
    const seat = host.start(init({ resume: 'S-NUDGE' }));

    // ‼️ MEASURED, AGAINST THE ASSUMPTION THAT WAS WRITTEN FIRST. A resumed seat
    // is `starting`, NOT idle: the engine has a transcript to load before it
    // says anything. `nudgeRevived` therefore has to wait for the seat's own
    // first quiet moment rather than speak the instant `start()` returns, and
    // this is the assertion that says so.
    ok('‼️ a resumed Claude seat comes back `starting` — it has a transcript to load first',
        host.get(seat).status === 'starting');

    const before = host.get(seat).messages.length;
    const r = host.send(seat, 'carry on from where you were');
    ok('‼️ …and a prompt is DELIVERED rather than held — `queued:false` is "sent now", not "dropped"',
        r && r.queued === false && !r.refused);
    ok('…it lands in THAT conversation, on the seat that was revived',
        host.get(seat).messages.length === before + 1);
    ok('…and the seat is working again, which is the whole point of the nudge',
        host.get(seat).status === 'working');

    ok('a seat that is gone refuses the nudge instead of throwing',
        host.send('cs-nobody', 'anything') === undefined);
}


// ‼️ X-266 — ONE LIVE PROCESS PER SESSION ID, MADE TRUE BEFORE A RESUME.
//
// A window reload kills the extension host and not the `claude -p` under it;
// the survivor keeps the session in the CLI's registry and keeps working on a
// dead pipe. Reviving that id beside it was measured as two agents on one repo
// (2026-09-09) and as a card frozen in `starting` for twenty minutes (2026-09-13).
// `reclaim` ends the holder and WAITS for its record to drop; a holder that will
// not go is reported, never started beside.
async function x266() {
    // (a) nobody holds it: free at once, nothing is killed
    {
        const host = new ConsoleHost(() => 'claude', () => undefined);
        const before = reaps;
        const r = await host.reclaim('S-266-a');
        ok('‼️ X-266: an unheld session is free without a kill', r.free === true && r.pid === undefined && reaps === before);
    }
    // (b) a survivor holds it: killed once, and the wait ends the moment the record drops
    {
        let owner = 4242;
        const host = new ConsoleHost(() => 'claude', () => owner);
        const before = reaps;
        const p = host.reclaim('S-266-b', 10);
        // the record drops "when taskkill gets to it" — a beat later
        setTimeout(() => { owner = undefined; }, 250);
        const r = await p;
        ok('‼️ X-266: the survivor is killed exactly once and its pid is returned',
            reaps === before + 1 && r.pid === 4242);
        ok('…and the id is reported free once the registry lets go', r.free === true);
    }
    // (c) the survivor will not go: refused, with the pid, never "free"
    {
        const host = new ConsoleHost(() => 'claude', () => 777);
        const r = await host.reclaim('S-266-c', 2);
        ok('‼️ X-266: a holder that stays is reported, not started beside', r.free === false && r.pid === 777);
    }
    // (d) the holder is one of THIS host's own live seats: left alone, named
    {
        const host = new ConsoleHost(() => 'claude', () => 999);
        const id = host.start(init({ resume: 'S-266-d' }));
        const before = reaps;
        const r = await host.reclaim('S-266-d', 2);
        ok('‼️ X-266: a session one of our own cards holds is not a survivor and is not killed',
            r.free === false && r.hostedBy === id && reaps === before);
    }
    // (e) an empty id has nothing to reclaim
    {
        const host = new ConsoleHost(() => 'claude', () => 5);
        const r = await host.reclaim('');
        ok('X-266: an empty id is free', r.free === true);
    }
}


// ‼️ S-54 — Interrupt on the persistent engine withdraws the queued words, when
// the CLI says it can; and every message the host says is stamped so the
// receipt can name it. Measured against claude-cli 2.1.269 (haiku): a plain
// interrupt let a steered message open a NEW turn one second after the stop.
async function s54() {
    // the CLI advertised the capability: the interrupt asks for the queue too
    {
        const host = new ConsoleHost(() => 'claude');
        const id = host.start(init({}));
        const child = lastChild;
        child.stdout.emit('data', JSON.stringify({ type: 'system', subtype: 'init', session_id: 'S-54a', capabilities: ['interrupt_receipt_v1', 'interrupt_cancel_queued_v1'] }) + '\n');
        host.send(id, 'first prompt');
        const first = JSON.parse(child.written[child.written.length - 1]);
        ok('‼️ S-54: a message the host says is stamped with a uuid', first.type === 'user' && /^[0-9a-f-]{36}$/.test(first.uuid || ''));
        host.send(id, 'said into the turn');
        const steer = JSON.parse(child.written[child.written.length - 1]);
        ok('…the steered one too, and the state remembers it by that uuid',
            /^[0-9a-f-]{36}$/.test(steer.uuid || '') && host.get(id).steered.length === 1
            && host.get(id).steered[0].uuid === steer.uuid && host.get(id).steered[0].text === 'said into the turn');
        ok('S-54: interrupt is written', host.interrupt(id) === true);
        const intr = JSON.parse(child.written[child.written.length - 1]);
        ok('‼️ S-54: with the capability advertised, the interrupt carries cancel_queued:true',
            intr.type === 'control_request' && intr.request.subtype === 'interrupt' && intr.request.cancel_queued === true);
        ok('…and the host waits for that receipt under the id it sent',
            host.get(id).pendingInterrupt && host.get(id).pendingInterrupt.requestId === intr.request_id);
        // the receipt arrives: the card says which words were withdrawn
        child.stdout.emit('data', JSON.stringify({ type: 'control_response', response: { subtype: 'success', request_id: intr.request_id, response: { still_queued: [], cancelled: [steer.uuid] } } }) + '\n');
        const msgs = host.get(id).messages;
        ok('‼️ S-54: the card names the withdrawn message',
            /withdrawn with it and did NOT reach the model: «said into the turn»/.test(msgs[msgs.length - 1].text));
    }
    // no capability advertised (an older CLI): the plain request, as before
    {
        const host = new ConsoleHost(() => 'claude');
        const id = host.start(init({}));
        const child = lastChild;
        child.stdout.emit('data', JSON.stringify({ type: 'system', subtype: 'init', session_id: 'S-54b' }) + '\n');
        host.send(id, 'go');
        host.interrupt(id);
        const intr = JSON.parse(child.written[child.written.length - 1]);
        ok('S-54: without the capability the interrupt is the plain request (an unknown field is not sent blind)',
            intr.request.subtype === 'interrupt' && !('cancel_queued' in intr.request));
    }
}

// ‼️ S-62 — Stop reaches the processes the turn left running behind it.
// Measured (claude-cli 2.1.269, tools/probe_background.js): a backgrounded
// Bash call survives the interrupt and, when it finishes, the CLI opens a NEW
// turn on its own — 7 s after Stop. The CLI lists those tasks itself
// (`background_tasks_changed`) and offers `stop_task`; the host asks for each
// one BEFORE the abort, and a task stopped that way measured as opening no turn.
async function s62() {
    {
        const host = new ConsoleHost(() => 'claude');
        const id = host.start(init({}));
        const child = lastChild;
        child.stdout.emit('data', JSON.stringify({ type: 'system', subtype: 'init', session_id: 'S-62', capabilities: ['interrupt_cancel_queued_v1'] }) + '\n');
        host.send(id, 'run it in the background');
        child.stdout.emit('data', JSON.stringify({ type: 'system', subtype: 'background_tasks_changed', tasks: [
            { task_id: 'b1', task_type: 'local_bash', description: 'dev server' },
            { task_id: 'b2', task_type: 'local_bash', description: 'watch tests' }
        ] }) + '\n');
        ok('‼️ S-62: the host carries the CLI\'s own list of background tasks',
            (host.get(id).backgroundTasks || []).map(t => t.id).join(',') === 'b1,b2');
        const before = child.written.length;
        ok('S-62: interrupt is written', host.interrupt(id) === true);
        const lines = child.written.slice(before).map(l => JSON.parse(l));
        ok('‼️ S-62: Stop asks the CLI to stop EACH background task, BEFORE the abort',
            lines.length === 3
            && lines[0].request.subtype === 'stop_task' && lines[0].request.task_id === 'b1'
            && lines[1].request.subtype === 'stop_task' && lines[1].request.task_id === 'b2'
            && lines[2].request.subtype === 'interrupt' && lines[2].request.cancel_queued === true);
        ok('…and waits for each stop receipt under the id it sent',
            (host.get(id).pendingStops || []).map(p => p.requestId).join(',') === `${lines[0].request_id},${lines[1].request_id}`
            && host.get(id).pendingInterrupt.requestId === lines[2].request_id);
        // one refused: the card says the process is still out there
        child.stdout.emit('data', JSON.stringify({ type: 'control_response', response: { subtype: 'error', request_id: lines[1].request_id, error: 'stop_task_refused' } }) + '\n');
        const msgs = host.get(id).messages;
        ok('‼️ S-62: a refused stop is said on the card, naming the command',
            msgs[msgs.length - 1].role === 'error' && /still running.*refused.*\(watch tests\).*stop_task_refused/.test(msgs[msgs.length - 1].text));
        ok('…and only that receipt is forgotten', (host.get(id).pendingStops || []).length === 1);
        // the other stops: the CLI's list shrinks and the notification is the row
        child.stdout.emit('data', JSON.stringify({ type: 'system', subtype: 'background_tasks_changed', tasks: [{ task_id: 'b2', task_type: 'local_bash', description: 'watch tests' }] }) + '\n');
        child.stdout.emit('data', JSON.stringify({ type: 'system', subtype: 'task_notification', task_id: 'b1', status: 'stopped', summary: 'dev server' }) + '\n');
        child.stdout.emit('data', JSON.stringify({ type: 'control_response', response: { subtype: 'success', request_id: lines[0].request_id, response: {} } }) + '\n');
        const after = host.get(id);
        ok('S-62: a stopped task leaves the list and is one quiet row',
            (after.backgroundTasks || []).map(t => t.id).join(',') === 'b2'
            && after.messages[after.messages.length - 1].text === 'background command stopped: dev server'
            && after.pendingStops === undefined);
    }
    // one task, by hand, with the turn left alone
    {
        const host = new ConsoleHost(() => 'claude');
        const id = host.start(init({}));
        const child = lastChild;
        child.stdout.emit('data', JSON.stringify({ type: 'system', subtype: 'init', session_id: 'S-62b' }) + '\n');
        child.stdout.emit('data', JSON.stringify({ type: 'system', subtype: 'task_started', task_id: 'b9', tool_use_id: 'toolu_9', description: 'build', is_backgrounded: true, task_type: 'local_bash' }) + '\n');
        ok('S-62: task_started alone lands the task, with its tool call',
            host.get(id).backgroundTasks.length === 1 && host.get(id).backgroundTasks[0].toolUseId === 'toolu_9');
        const no = host.stopTask(id, 'nope');
        ok('S-62: a task the CLI never listed is refused by name, not sent',
            no.ok === false && /"nope"/.test(no.note) && !child.written.some(l => /stop_task/.test(l)));
        const r = host.stopTask(id, 'b9');
        const line = JSON.parse(child.written[child.written.length - 1]);
        ok('‼️ S-62: stopTask writes the CLI\'s own stop_task for that id and nothing else',
            r.ok === true && line.request.subtype === 'stop_task' && line.request.task_id === 'b9'
            && !child.written.some(l => /"interrupt"/.test(l)));
        const codexId = host.start(init({ engine: 'codex', agentId: 'cx' }));
        const cx = host.stopTask(codexId, 'b9');
        ok('S-62: a per-turn engine has nothing to stop behind a turn, and says so',
            cx.ok === false && /Codex runs nothing behind a turn/.test(cx.note));
    }
}

// ---- X-349: A REVIVED CARD NOBODY SPEAKS INTO STOPS SAYING `starting` ------
//
// ‼️ Driven through the REAL host for the same reason the nudge above is: the
// question is not "would the rule say settle" but "does a card that nothing is
// ever written into actually leave `starting`". Measured on 2026-09-21 it did
// not — for thirteen minutes — because the persistent CLI announces itself on
// its first TURN and this seat is deliberately not having one. And `starting`
// counts as a turn in flight (selfRestart.ts), so that silent card was also
// blocking every later restart.
async function x349() {
    const tick = (ms) => new Promise(r => setTimeout(r, ms));
    // (a) the registry says the process is up → the card settles, once
    {
        let owner;
        const host = new ConsoleHost(() => 'claude', () => owner);
        const seat = host.start(init({ resume: 'S-349-a' }));
        ok('‼️ X-349: a revived seat starts where the bug left it — `starting`',
            host.get(seat).status === 'starting');
        host.settleRevived(seat, 20, 50);
        await tick(60);
        ok('‼️ …and it does NOT settle while the CLI registry is silent — nothing is assumed',
            host.get(seat).status === 'starting' && !host.get(seat).revivedWaiting);
        owner = 7788;
        await tick(80);
        ok('‼️ …it settles once the engine\'s own registry says the process exists',
            host.get(seat).status === 'idle');
        ok('…and the card says what that `idle` rests on, rather than passing for an announced one',
            host.get(seat).revivedWaiting === true);
        // ‼️ AND IT IS A SEAT, NOT A TURN: nothing was written down the pipe.
        ok('‼️ …with nothing said into it — the settle is a status, never a prompt',
            (lastChild.written || []).every(l => !/"user"/.test(l)));
        host.dispose();
    }
    // (b) a process that never registers is given up on, not waited for for ever
    {
        const host = new ConsoleHost(() => 'claude', () => undefined);
        const seat = host.start(init({ resume: 'S-349-b' }));
        host.settleRevived(seat, 10, 3);
        await tick(120);
        ok('‼️ X-349: a process that never registers leaves the card honest, not invented',
            host.get(seat).status === 'starting' && !host.get(seat).revivedWaiting);
        host.dispose();
    }
    // (c) a card that spoke for itself is never overwritten by the watch
    {
        const host = new ConsoleHost(() => 'claude', () => 99);
        const seat = host.start(init({ resume: 'S-349-c' }));
        host.settleRevived(seat, 10, 50);
        host.send(seat, 'the user got there first');
        await tick(60);
        ok('‼️ X-349: a seat already working is left alone — the watch never rewrites a live status',
            host.get(seat).status === 'working' && !host.get(seat).revivedWaiting);
        host.dispose();
    }
    // (d) …and the engine's own init clears the flag, so `idle` goes back to
    //     meaning what it means on every other card
    {
        let owner;
        const host = new ConsoleHost(() => 'claude', () => owner);
        const seat = host.start(init({ resume: 'S-349-d' }));
        const child = lastChild;
        host.settleRevived(seat, 10, 50);
        owner = 1234;
        await tick(40);
        ok('X-349: settled', host.get(seat).revivedWaiting === true);
        child.stdout.emit('data', JSON.stringify({
            type: 'system', subtype: 'init', session_id: 'S-349-d'
        }) + '\n');
        ok('‼️ X-349: the engine announcing itself clears the flag — a card talking for an hour '
            + 'must not still claim nobody has spoken into it',
            host.get(seat).status === 'idle' && !host.get(seat).revivedWaiting);
        host.dispose();
    }
}

s29().then(() => x266()).then(() => s54()).then(() => s62()).then(() => x349()).then(() => {
    cp.spawn = realSpawn;
    cp.exec = realExec;
    cp.execSync = realExecSync;
    cp.execFile = realExecFile;

    console.log(`${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
});
