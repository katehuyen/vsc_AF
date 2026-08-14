// S-30 — END SESSION → RESUME BRINGS THE LAST COMPLETED TURN BACK, WHOLE.
//
// Reported once: "End Session, then Resume the same session straight after, and
// the conversation I had just had was not there" — and it read as data loss.
// The transcript was measured and it was complete (1 127 parsed messages on the
// reported Codex rollout, the closing user+agent pair among them), so the fault
// was never the writing. It was the READING BACK, in three places:
//
//   1. the resumed card threw away the messages it was already showing and took
//      whatever the transcript read gave back — including nothing;
//   2. every failure on that read path returned `[]`, which draws exactly like
//      an empty conversation and says nothing;
//   3. the backfill was `slice(-150)` over a list where tool traffic is most of
//      the rows — measured, the last 150 of that session span 2 turns of 13.
//
// These checks drive the REAL ConsoleHost with a fake child, and the real
// window rule, rather than grepping the sources for a word.
'use strict';
const path = require('path');
const cp = require('child_process');
const { EventEmitter } = require('events');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const {
    historyWindow, transcriptHistory, HISTORY_MAX, HISTORY_CEILING
} = require(path.join(__dirname, '..', 'out', 'core', 'consolehistory.js'));

// ---------------------------------------------------------------------------
// the window rule
// ---------------------------------------------------------------------------
{
    const turnStart = m => m.role === 'user';
    const say = (role, i) => ({ role, i });

    // ordinary case: nothing changes at all
    const short = [];
    for (let i = 0; i < 40; i++) { short.push(say(i === 0 ? 'user' : 'tool', i)); }
    ok('a conversation under the budget is returned as it is',
        historyWindow(short, turnStart).length === short.length);

    // the reported shape: one turn's tool traffic longer than the budget
    const heavy = [];
    for (let i = 0; i < 500; i++) { heavy.push(say('tool', i)); }
    heavy.push(say('user', 500));                       // what the reader typed
    for (let i = 0; i < 300; i++) { heavy.push(say('tool', 501 + i)); }
    heavy.push(say('agent', 801));                      // and the answer
    const win = historyWindow(heavy, turnStart);
    ok('‼️ S-30: the prompt that opened the last turn survives a 150-row budget',
        win.some(m => m.role === 'user' && m.i === 500));
    ok('…and so does the answer it was waiting for',
        win[win.length - 1].role === 'agent');
    ok('…without dragging the whole file in', win.length <= HISTORY_CEILING + 1);
    ok('…and without repeating a single row',
        new Set(win.map(m => m.i)).size === win.length);
    ok('…the rows stay in the order they happened',
        win.every((m, i) => i === 0 || m.i > win[i - 1].i));

    // a turn longer than the ceiling: the prompt rides at the front alone
    const huge = [];
    for (let i = 0; i < 200; i++) { huge.push(say('tool', i)); }
    huge.push(say('user', 200));
    for (let i = 0; i < HISTORY_CEILING + 50; i++) { huge.push(say('tool', 201 + i)); }
    const big = historyWindow(huge, turnStart);
    ok('‼️ S-30: a turn past the ceiling still shows what was asked',
        big[0].role === 'user' && big[0].i === 200);
    ok('…and is still capped, so the panel is not asked to draw the file',
        big.length <= HISTORY_CEILING + 1);
    ok('…and still has no duplicate', new Set(big.map(m => m.i)).size === big.length);

    // a session with no user row at all (an agent-only lane) is simply cut
    const noUser = [];
    for (let i = 0; i < 400; i++) { noUser.push(say('tool', i)); }
    ok('nothing to protect means the plain budget, exactly as before',
        historyWindow(noUser, turnStart).length === HISTORY_MAX);
}

// ---------------------------------------------------------------------------
// …applied to a Claude transcript, through the real parser
// ---------------------------------------------------------------------------
{
    const lines = [];
    const at = n => new Date(Date.parse('2026-08-13T17:00:00Z') + n * 1000).toISOString();
    lines.push(JSON.stringify({
        type: 'user', timestamp: at(0), message: { content: 'the first thing I asked' }
    }));
    for (let i = 0; i < 200; i++) {
        lines.push(JSON.stringify({
            type: 'assistant', timestamp: at(1 + i),
            message: { content: [{ type: 'tool_use', id: `t${i}`, name: 'Bash', input: { command: 'ls' } }] }
        }));
        lines.push(JSON.stringify({
            type: 'user', timestamp: at(1 + i),
            message: { content: [{ type: 'tool_result', content: 'ok' }] }
        }));
    }
    lines.push(JSON.stringify({
        type: 'user', timestamp: at(500), message: { content: 'S-30 nedir, bir bak' }
    }));
    for (let i = 0; i < 120; i++) {
        lines.push(JSON.stringify({
            type: 'assistant', timestamp: at(501 + i),
            message: { content: [{ type: 'tool_use', id: `x${i}`, name: 'Read', input: { file_path: 'a.ts' } }] }
        }));
    }
    lines.push(JSON.stringify({
        type: 'assistant', timestamp: at(700),
        message: { content: [{ type: 'text', text: 'kök neden şu…' }] }
    }));

    const out = transcriptHistory(lines);
    const texts = out.filter(m => m.role === 'user').map(m => m.text);
    ok('‼️ S-30: the last thing the user typed is in the rebuilt scrollback',
        texts.includes('S-30 nedir, bir bak'));
    ok('…and the agent\'s closing answer with it',
        out.some(m => m.role === 'agent' && /kök neden/.test(m.text || '')));
    ok('…the head row still says how much older material is in the file',
        /older message/.test(out[0].text || ''));
    ok('…and the tail row still marks where the resume begins',
        /resumed here/.test(out[out.length - 1].text || ''));
}

// ---------------------------------------------------------------------------
// the card itself: what it was showing is not traded for what disk says
// ---------------------------------------------------------------------------
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
    child.pid = 5000 + spawned;
    child.kill = () => { };
    return child;
}
const realSpawn = cp.spawn;
cp.spawn = () => fakeChild();
const realExec = cp.exec;
cp.exec = (_c, cb) => { if (typeof cb === 'function') { cb(null, '', ''); } };
const realExecSync = cp.execSync;
cp.execSync = () => '';
const realExecFile = cp.execFile;
cp.execFile = (_c, _a, _o, cb) => {
    const done = typeof _o === 'function' ? _o : cb;
    if (typeof done === 'function') { done(null, '', ''); }
    return new EventEmitter();
};

const { ConsoleHost } = require(path.join(__dirname, '..', 'out', 'core', 'consolehost.js'));

const init = (o) => Object.assign({
    agentId: 'dev', agentName: 'developer', cwd: process.cwd(),
    engine: 'claude', permissionMode: 'default'
}, o);
const said = (n) => {
    const out = [];
    for (let i = 0; i < n; i++) {
        out.push({ id: `m${i}`, ts: 1000 + i, role: i % 2 ? 'agent' : 'user', text: `line ${i}` });
    }
    return out;
};
// The host does not read transcripts; the panel hands it what it read. So a
// card is put in the state the live stream leaves it in — the only state the
// reported bug is about.
const withConversation = (host, id, messages) => {
    const s = host.get(id);
    s.messages = messages;
};

for (const engine of ['claude', 'codex']) {
    // 1. the transcript read comes back EMPTY — the reported failure
    {
        const host = new ConsoleHost(() => 'claude');
        const id = host.start(init({ engine, resume: `S30-${engine}-a` }));
        withConversation(host, id, said(12));
        host.close(id);
        const back = host.start(init({ engine, resume: `S30-${engine}-a`, history: [] }));
        ok(`‼️ S-30 (${engine}): a resume that reads nothing back keeps the conversation on the card`,
            back === id && host.get(id).messages.length === 12);
        ok(`…and the card is usable again (${engine})`, host.get(id).status !== 'ended');
    }

    // 2. the read comes back SHORTER than the card (a clipped or partial parse)
    {
        const host = new ConsoleHost(() => 'claude');
        const id = host.start(init({ engine, resume: `S30-${engine}-b` }));
        withConversation(host, id, said(40));
        host.close(id);
        host.start(init({ engine, resume: `S30-${engine}-b`, history: said(3) }));
        ok(`‼️ S-30 (${engine}): the richer of the two wins — a short read does not overwrite the card`,
            host.get(id).messages.length === 40);
    }

    // 3. the read is RICHER — the ordinary resume from a session page, where the
    //    card has nothing and the transcript has the whole conversation
    {
        const host = new ConsoleHost(() => 'claude');
        const id = host.start(init({ engine, resume: `S30-${engine}-c`, history: said(30) }));
        ok(`a fresh card takes the transcript's scrollback (${engine})`,
            host.get(id).messages.length === 30);
        host.close(id);
        host.start(init({ engine, resume: `S30-${engine}-c`, history: said(55) }));
        ok(`…and a fuller read replaces a thinner card, without stacking the two (${engine})`,
            host.get(id).messages.length === 55);
    }

    // 4. an honest one-line note is NOT richer than a conversation
    {
        const host = new ConsoleHost(() => 'claude');
        const id = host.start(init({ engine, resume: `S30-${engine}-d` }));
        withConversation(host, id, said(9));
        host.close(id);
        host.start(init({
            engine, resume: `S30-${engine}-d`,
            history: [{ id: 'xh-note', ts: 1, role: 'system', text: 'transcript could not be read' }]
        }));
        ok(`‼️ S-30 (${engine}): a "could not read it" note never costs the reader their conversation`,
            host.get(id).messages.length === 9);
    }
}

cp.spawn = realSpawn;
cp.exec = realExec;
cp.execSync = realExecSync;
cp.execFile = realExecFile;

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
