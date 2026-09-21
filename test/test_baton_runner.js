// S-70 — the release: a baton leaves `waiting-end` on EVIDENCE that its session
// ended, and the door's answer becomes the baton's next state.
//
// What must not go wrong quietly: a session that is still registered is never
// released (two agents in one repo); the three end signals and the sweep all
// release exactly once; a refusing door leaves a `refused` record and one
// notice; a task row that names its session binds the successor, one that
// ends without a session refuses the baton.
'use strict';
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const OUT = path.join(__dirname, '..', 'out', 'core');
const { passBaton } = require(path.join(OUT, 'baton.js'));
const { BatonStore } = require(path.join(OUT, 'batonStore.js'));
const { BatonRunner, endedVerdict, bindSuccessor } = require(path.join(OUT, 'batonRunner.js'));

const NOW = 1790000000000;
const manifestFor = (engine, launchId) => ({
    launchId, at: NOW - 1000, engine,
    identity: { engine, providerId: engine === 'claude' ? 'anthropic' : engine, origin: 'builtin', scope: 'machine' },
    requested: { model: 'opus' }, agentId: 'dev', agentName: 'developer',
    mechanism: 'session', cwd: 'D:\\repo', surface: 'console'
});

function leave(store, sessionId, engine = 'claude', prompt = 'carry on') {
    const launchId = 'lch_' + sessionId;
    const r = passBaton({
        prompt, sessionId, launchId, manifest: manifestFor(engine, launchId),
        prior: store.all(), now: NOW
    });
    if (!r.ok) { throw new Error(r.why); }
    store.put(r.baton, ...r.superseded);
    return r.baton;
}

function setup(o = {}) {
    const store = new BatonStore();
    const doors = [], notes = [], logs = [];
    const runner = new BatonRunner(Object.assign({
        store,
        door: b => { doors.push(b.id); return { taskId: 'tsk_1', sessionId: 'succ-1' }; },
        evidence: () => ({ registered: false, live: 'ended', registers: true }),
        notify: (title, body, key) => notes.push({ title, body, key }),
        log: l => logs.push(l),
        now: () => NOW + 5000
    }, o));
    return { store, runner, doors, notes, logs };
}

// ---- the verdict, as a table ----
{
    const v = (registered, live, registers) => endedVerdict({ registered, live, registers });
    ok('‼️ a registered process is alive whatever the watcher says', !v(true, 'ended', true).ended && !v(true, 'unknown', false).ended);
    ok('the watcher\'s own end is an end', v(false, 'ended', true).ended && v(false, 'ended', false).ended);
    ok('an engine that registers, with no record, is gone', v(false, 'alive', true).ended && /no live CLI process/.test(v(false, 'alive', true).why));
    ok('an engine with no registry is dead only once the watcher forgot it', v(false, 'unknown', false).ended && !v(false, 'alive', false).ended);
    ok('a waiting verdict says why', /still holds/.test(v(false, 'alive', false).why));
}

// ---- the end signal ----
{
    const { store, runner, doors } = setup();
    const a = leave(store, 'sess-A');
    leave(store, 'sess-B');
    const rel = runner.sessionEnded('sess-A', 'session closed');
    ok('the ended session\'s baton is released and no other', rel.length === 1 && rel[0].id === a.id && doors.length === 1);
    ok('a door that names the session makes the baton `started` on that task',
        rel[0].state === 'started' && rel[0].taskId === 'tsk_1' && rel[0].toSessionId === 'succ-1' && /session ended \(session closed\)/.test(rel[0].why));
    ok('the store has it', store.get(a.id).state === 'started');
    ok('‼️ the same end a second time releases nothing — the baton is no longer waiting', runner.sessionEnded('sess-A', 'again').length === 0 && doors.length === 1);
    ok('sess-B still waits', store.liveFrom('sess-B').state === 'waiting-end');
    ok('an empty id releases nothing', runner.sessionEnded('', 'x').length === 0);
}

// ---- a held row parks the baton; a refusing door refuses it, once, with a notice ----
{
    const { store, runner, notes } = setup({ door: () => ({ taskId: 'tsk_2', held: 'fleet concurrency (3 of 3 running)' }) });
    const a = leave(store, 'sess-A');
    const [p] = runner.sessionEnded('sess-A', 'end');
    ok('a row the pump holds parks the baton ON that row', p.state === 'parked' && p.taskId === 'tsk_2' && !p.toSessionId && /fleet concurrency/.test(p.why));
    ok('a park is not news', notes.length === 0);
    ok('the record on the store is the parked one', store.get(a.id).state === 'parked');
}
{
    const { store, runner, notes } = setup({ door: () => { throw new Error('agent "ghost" not found'); } });
    const a = leave(store, 'sess-A');
    const [r] = runner.sessionEnded('sess-A', 'end');
    ok('a door that throws refuses the baton with its reason', r.state === 'refused' && /the door refused: agent "ghost" not found/.test(r.why));
    ok('‼️ a refusal is told, once, keyed by the baton', notes.length === 1 && notes[0].key === 'baton:' + a.id && /Baton refused/.test(notes[0].title) && /nothing was started/i.test(notes[0].body));
}

// ---- the sweep ----
{
    const evidence = new Map();
    const { store, runner, doors } = setup({ evidence: b => evidence.get(b.from.sessionId) });
    const a = leave(store, 'sess-A');            // claude, still registered — the agent kept working
    const b = leave(store, 'sess-B');            // claude, no record — died without a hook
    const c = leave(store, 'sess-C', 'codex');   // no registry, the watcher holds it
    const d = leave(store, 'sess-D', 'codex');   // no registry, forgotten
    evidence.set('sess-A', { registered: true, live: 'alive', registers: true });
    evidence.set('sess-B', { registered: false, live: 'alive', registers: true });
    evidence.set('sess-C', { registered: false, live: 'alive', registers: false });
    evidence.set('sess-D', { registered: false, live: 'unknown', registers: false });
    const s = runner.sweep();
    const ids = s.released.map(x => x.id).sort();
    ok('‼️ the registered session keeps its repo: not released', !ids.includes(a.id) && s.waiting.some(w => w.id === a.id && /registered/.test(w.why)));
    ok('the claude session with no process is released', ids.includes(b.id) && /swept: no live CLI process/.test(store.get(b.id).why));
    ok('the codex session the watcher holds waits', !ids.includes(c.id) && s.waiting.some(w => w.id === c.id));
    ok('the codex session nobody knows is released', ids.includes(d.id));
    ok('each release went through the door once', doors.length === 2);
    const again = runner.sweep();
    ok('a second sweep releases nothing new', again.released.length === 0 && again.waiting.length === 2);
}
{
    const { store, runner } = setup({ evidence: () => { throw new Error('registry unreadable'); } });
    leave(store, 'sess-A');
    const s = runner.sweep();
    ok('evidence that cannot be read is a WAIT that says so, never a release', s.released.length === 0 && /evidence unavailable: registry unreadable/.test(s.waiting[0].why));
}

// ---- following the row ----
{
    const rows = new Map();
    const { store, runner, notes } = setup({
        door: () => ({ taskId: 'tsk_p' }),
        task: id => rows.get(id)
    });
    const a = leave(store, 'sess-A');
    runner.sessionEnded('sess-A', 'end');
    ok('parked on the row', store.get(a.id).state === 'parked');
    rows.set('tsk_p', { status: 'queued' });
    ok('a queued row without a session changes nothing', runner.follow().length === 0 && store.get(a.id).state === 'parked');
    rows.set('tsk_p', { status: 'running', sessionId: 'succ-9' });
    const [st] = runner.follow();
    ok('the row naming its session STARTS the baton on it', st && st.state === 'started' && st.toSessionId === 'succ-9' && store.get(a.id).toSessionId === 'succ-9');
    ok('a started baton with its successor is left alone', runner.follow().length === 0);

    const b = leave(store, 'sess-B');
    runner.sessionEnded('sess-B', 'end');
    rows.set('tsk_p', { status: 'failed', why: 'engine not installed' });
    const [rf] = runner.follow();
    ok('a row that ended without a session refuses the baton with the row\'s word',
        rf && rf.id === b.id && rf.state === 'refused' && /failed before a session started: engine not installed/.test(rf.why));
    ok('…and it is told once', notes.length === 1 && notes[0].key === 'baton:' + b.id);
}
{
    const { store } = setup();
    const a = leave(store, 'sess-A');
    const bound = bindSuccessor(a, 'succ-2', NOW + 1);
    ok('bindSuccessor names the session and keeps the state', bound.toSessionId === 'succ-2' && bound.state === a.state && bound.updatedAt === NOW + 1);
}
{
    const { runner } = setup({ task: undefined });
    ok('no task reader, nothing to follow', runner.follow().length === 0);
}

// ---- S-73: park on a reset, wake by the row ----
{
    const rows = new Map();
    const wake = NOW + 5000 + 43 * 60_000;
    const { store, runner, notes } = setup({
        door: () => ({ taskId: 'tsk_r', held: 'waiting until 14:37', wakeAt: wake }),
        task: id => rows.get(id),
        fmtTime: t => 'T' + Math.round((t - NOW - 5000) / 60_000)
    });
    const a = leave(store, 'sess-A');
    const [p] = runner.sessionEnded('sess-A', 'end');
    ok('every account full → parked ON the row with its wake time', p.state === 'parked' && p.taskId === 'tsk_r' && p.wakeAt === wake && /every account is full — task tsk_r wakes at T43/.test(p.why));
    ok('‼️ told ONCE, naming the moment, and how to go sooner or drop it',
        notes.length === 1 && notes[0].key === 'baton:' + a.id + ':parked' && /starts at T43/.test(notes[0].title) && /baton\.now/.test(notes[0].body) && /baton\.stop/.test(notes[0].body));
    rows.set('tsk_r', { status: 'queued' });
    ok('the row still queued changes nothing', runner.follow().length === 0 && store.get(a.id).state === 'parked' && store.get(a.id).wakeAt === wake);
    rows.set('tsk_r', { status: 'running', sessionId: 'succ-r' });
    const [st] = runner.follow();
    ok('the pump woke the row → the baton starts on it, the wake time is cleared', st.state === 'started' && st.toSessionId === 'succ-r' && st.wakeAt === undefined);
    ok('no second notice for the start', notes.length === 1);
}
{
    const { store, runner, notes } = setup({ door: () => ({ taskId: 'tsk_old', wakeAt: NOW - 1 }) });
    leave(store, 'sess-A');
    const [p] = runner.sessionEnded('sess-A', 'end');
    ok('a wake moment already past is an ordinary board park, not a reset park', p.state === 'parked' && p.wakeAt === undefined && notes.length === 0);
}

// ---- S-74: the user's go ----
{
    const { store, runner, doors } = setup();
    const a = leave(store, 'sess-A');
    const r = runner.startNow(a, 'Murat');
    ok('a waiting baton goes through the door at once, saying who pressed', r.ok && r.baton.state === 'started' && /started now by Murat, before the session ended/.test(r.baton.why) && doors.length === 1);
    ok('a started baton cannot be started now', !runner.startNow(store.get(a.id), 'Murat').ok);
}
{
    const nudges = [];
    let answer = { taskId: 'tsk_h', held: 'still held: quota:5h' };
    const { store, runner } = setup({
        door: () => ({ taskId: 'tsk_h', held: 'fleet concurrency' }),
        nudge: id => { nudges.push(id); return answer; }
    });
    const a = leave(store, 'sess-A');
    runner.sessionEnded('sess-A', 'end');
    const r1 = runner.startNow(store.get(a.id), 'the user');
    ok('a parked baton asks the pump again for ITS row', r1.ok && nudges.length === 1 && nudges[0] === 'tsk_h');
    ok('…and stays parked with the new hold when the pump still says no', r1.baton.state === 'parked' && /asked again by the user; task tsk_h is still held — still held: quota:5h/.test(r1.baton.why));
    answer = { taskId: 'tsk_h', sessionId: 'succ-7' };
    const r2 = runner.startNow(store.get(a.id), 'the user');
    ok('…and starts on it once the pump launches', r2.ok && r2.baton.state === 'started' && r2.baton.toSessionId === 'succ-7' && store.get(a.id).state === 'started');
    answer = undefined;
    const b = leave(store, 'sess-B');
    runner.sessionEnded('sess-B', 'end');
    const r3 = runner.startNow(store.get(b.id), 'the user');
    ok('a parked baton whose row is no longer queued is refused, naming the row', !r3.ok && /task tsk_h is not a queued row/.test(r3.why));
}
{
    const { store, runner, doors } = setup({ nudge: undefined });
    const a = leave(store, 'sess-A');
    const parked = Object.assign({}, a, { state: 'parked', why: 'parked without a row' });
    store.put(parked);
    const r = runner.startNow(parked, 'the user');
    ok('a parked baton with no row goes through the door', r.ok && r.baton.state === 'started' && doors.length === 1);
}

console.log(`test_baton_runner: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
