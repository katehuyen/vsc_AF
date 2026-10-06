// U-210 — the transcript's replay read aloud. With the replay bar's 🔊 on, an agent answer the
// replay plays onto is read through the one reading channel (the step's own readAloud), and the
// replay goes on only when that reading is over, refused, or never started. ⏸ pauses the reading,
// ▶ resumes it, every other move ends it; ■ on the answer skips on; somebody else's reading pauses
// the replay. On a phone the switch is there only where the phone can speak, and the PC's reading
// in a data push never ends the phone's.
'use strict';
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));
const NOW = Date.now();
const SID = 'S1-full-id';

/** Timers that run only when the test says so; 0 ms ones (a page's after-render) run first. */
function clock() {
    let seq = 0;
    const q = new Map();
    const c = {
        setTimeout: (fn, ms) => { q.set(++seq, { fn, ms: Number(ms) || 0 }); return seq; },
        clearTimeout: id => { q.delete(id); },
        flush() { for (const [id, x] of [...q]) { if (x.ms === 0 && q.has(id)) { q.delete(id); x.fn(); } } },
        waiting: () => { c.flush(); return [...q.values()].map(x => x.ms); },
        /** The oldest timer runs; false when none waits. */
        step() {
            c.flush();
            const first = [...q.entries()][0];
            if (!first) { return false; }
            q.delete(first[0]);
            first[1].fn();
            c.flush();
            return true;
        }
    };
    return c;
}

const msg = (turn, role, extra) => Object.assign({ turn, role, ts: NOW - 60000 + turn * 1000, text: role + ' words of turn ' + turn }, extra || {});
const data = over => Object.assign({
    title: 'replay', sessionId: SID, cwd: 'D:/repo', permissionMode: '',
    firstTs: NOW - 60000, lastTs: NOW, models: [], usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    totalTokens: 0, cost: 0, errors: 0, toolCalls: 0, context: { tokens: 0, limit: 0 },
    turnCount: 3, messageCount: 7, truncatedCount: 0, turnTotals: {},
    messages: [
        msg(1, 'user', { turnStart: true, uuid: 'u-1' }),
        msg(1, 'assistant', { uuid: 'a-1' }),
        msg(2, 'user', { turnStart: true, uuid: 'u-2' }),
        msg(2, 'assistant', { uuid: 'a-2s', sidechain: true }), // a subagent's aside is not the answer
        msg(2, 'assistant', { uuid: 'a-2' }),
        msg(3, 'user', { turnStart: true, uuid: 'u-3' }),
        msg(3, 'assistant', { uuid: 'a-3' })
    ],
    turns: [{ n: 1, label: 'one', ts: NOW - 59000 }, { n: 2, label: 'two', ts: NOW - 58000 }, { n: 3, label: 'three', ts: NOW - 57000 }],
    files: [], reading: null
}, over || {});

const el = (p, id) => p.query('#' + id)[0];
const click = (p, id) => { const b = el(p, id); if (b) { b.click(); } return !!b; };
const reads = p => p.posted.filter(m => m.type === 'readAloud').map(m => m.pick && m.pick.msg);
const controls = p => p.posted.filter(m => m.type === 'readControl').map(m => m.action);
const reading = (key, paused) => ({ type: 'reading', reading: key ? { sessionId: SID, key, paused: !!paused, head: '' } : null });
const pos = p => el(p, 'rp-pos') ? (el(p, 'rp-pos').textContent || '') : '';
const playing = p => /Pause/.test(el(p, 'rp-play').textContent || '');
/** A page in replay, at its first step; `read` turns the switch on. */
function replayPage(read, extraWindow) {
    const c = clock();
    const p = runPage('sessionViewer.js', data(), Object.assign({ setTimeout: c.setTimeout, clearTimeout: c.clearTimeout }, extraWindow || {}));
    p.clock = c;
    click(p, 'replaytoggle');
    if (read) { click(p, 'rp-read'); }
    p.posted.length = 0;
    return p;
}
/** Play on until the replay asks for a reading or stops waiting on timers. */
function playToRead(p) {
    for (let i = 0; i < 20; i++) {
        const before = reads(p).length;
        if (!p.clock.step()) { return; }
        if (reads(p).length > before) { return; }
    }
}

// ---------------------------------------------------------------- the switch
{
    const p = replayPage(false);
    const b = el(p, 'rp-read');
    ok('the replay bar carries the 🔊 switch, off at first', !!b && b.getAttribute('aria-pressed') === 'false' && /🔇/.test(p.html()));
    ok('…and its hover says what it does', /Read each agent answer aloud as the replay reaches it/.test(p.html()));
    click(p, 'rp-play');
    for (let i = 0; i < 20 && p.clock.step(); i++) { /* to the end */ }
    ok('switched off, the replay plays to the end and reads nothing', reads(p).length === 0 && !playing(p) && pos(p) === '7/7');
}
{
    const p = replayPage(true);
    const b = el(p, 'rp-read');
    ok('pressed, it is on and says so', b.getAttribute('aria-pressed') === 'true' && /🔊/.test(b.textContent) && /waits for each/.test(b.title));
}

// ---------------------------------------------------------------- an answer read, the replay waiting for it
{
    const p = replayPage(true);
    click(p, 'rp-play');
    playToRead(p);
    ok('playing onto the first answer asks for it to be read, by its step key, in this conversation',
        JSON.stringify(reads(p)) === '["a-1"]' && p.posted.find(m => m.type === 'readAloud').sessionId === SID);
    ok('…and the replay waits: only the no-start guard is pending', JSON.stringify(p.clock.waiting()) === '[10000]' && pos(p) === '2/7');
    p.send(reading('a-1'));
    ok('the reading started: nothing pending, the replay stays on the answer', p.clock.waiting().length === 0 && pos(p) === '2/7' && playing(p));
    click(p, 'rp-play');
    ok('⏸ pauses the reading with the replay', JSON.stringify(controls(p)) === '["pause"]' && !playing(p));
    p.send(reading('a-1', true));
    click(p, 'rp-play');
    ok('▶ resumes the reading and the replay keeps waiting for it',
        JSON.stringify(controls(p)) === '["pause","resume"]' && p.clock.waiting().length === 0 && playing(p));
    p.send(reading('a-1'));
    p.send(reading(null));
    ok('the reading over, the replay goes on', p.clock.waiting().length === 1 && pos(p) === '2/7');
    playToRead(p);
    ok('a prompt and a subagent\'s aside are passed over; the next answer is read', JSON.stringify(reads(p)) === '["a-1","a-2"]' && pos(p) === '5/7');
    p.send(reading('a-2'));
    p.send(reading(null));
    playToRead(p);
    p.send(reading('a-3'));
    ok('the last answer is read too', JSON.stringify(reads(p)) === '["a-1","a-2","a-3"]' && playing(p));
    p.send(reading(null));
    p.clock.flush();
    ok('…and only when it is over does the replay end', !playing(p) && pos(p) === '7/7');
}

// ---------------------------------------------------------------- the ways it stops
{
    const p = replayPage(true);
    click(p, 'rp-play');
    playToRead(p);
    p.send(reading('a-1'));
    p.send(reading('u-1'));
    ok('a reading started elsewhere pauses the replay and is left alone', !playing(p) && controls(p).length === 0 && p.clock.waiting().length === 0);
}
{
    const p = replayPage(true);
    click(p, 'rp-play');
    playToRead(p);
    p.send(reading('a-1'));
    click(p, 'rp-fwd');
    ok('a move (+1) ends the answer being read', JSON.stringify(controls(p)) === '["stop"]' && !playing(p));
}
{
    const p = replayPage(true);
    click(p, 'rp-play');
    playToRead(p);
    click(p, 'rp-exit');
    p.send(reading('a-1'));
    ok('✕ before the answer started: when it starts after all, it is stopped', JSON.stringify(controls(p)) === '["stop"]');
}
{
    const p = replayPage(true);
    click(p, 'rp-play');
    playToRead(p);
    p.send(reading('a-1'));
    click(p, 'rp-read');
    ok('the switch turned off mid-answer stops it and the replay goes on',
        JSON.stringify(controls(p)) === '["stop"]' && p.clock.waiting().length === 1 && playing(p));
    playToRead(p);
    ok('…in silence', JSON.stringify(reads(p)) === '["a-1"]');
}
{
    const p = replayPage(true);
    click(p, 'rp-play');
    playToRead(p);
    p.send({ type: 'readRefused', error: 'no voice can say it' });
    ok('a refusal turns the switch off', el(p, 'rp-read').getAttribute('aria-pressed') === 'false' && playing(p));
    for (let i = 0; i < 20 && p.clock.step(); i++) { /* the toast's timer and the replay's */ }
    ok('…and the replay goes on to the end in silence', JSON.stringify(reads(p)) === '["a-1"]' && pos(p) === '7/7');
}
{
    const p = replayPage(true);
    click(p, 'rp-play');
    playToRead(p);
    p.clock.step();
    ok('an answer that never starts: after the guard the replay goes on', p.clock.waiting().length === 1 && playing(p));
}
{
    const p = replayPage(true);
    click(p, 'rp-play');
    playToRead(p);
    click(p, 'rp-play');
    ok('⏸ before the answer started takes the ask back', controls(p).length === 0 && p.clock.waiting().length === 0);
    click(p, 'rp-play');
    ok('…and ▶ asks for that answer again', JSON.stringify(reads(p)) === '["a-1","a-1"]' && pos(p) === '2/7');
}

// ---------------------------------------------------------------- on a phone
{
    const p = replayPage(false, { __AFUI__: { remote: true } });
    ok('a phone that cannot speak shows no switch', !el(p, 'rp-read'));
}
{
    const shell = [];
    const p = replayPage(true, { __AFUI__: { remote: true }, afShell: { speaks: () => true, post: s => shell.push(s) } });
    ok('a phone that speaks shows it', !!el(p, 'rp-read'));
    click(p, 'rp-play');
    playToRead(p);
    p.send(Object.assign(reading('a-1'), { phone: true }));
    p.send({ type: 'data', auto: true, data: data({ reading: null }) });
    ok('the PC\'s reading in a data push does not end the phone\'s', p.clock.waiting().length === 0 && playing(p));
    p.send(Object.assign(reading(null), { phone: true }));
    ok('the phone\'s reading over, the replay goes on', p.clock.waiting().length === 1);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
