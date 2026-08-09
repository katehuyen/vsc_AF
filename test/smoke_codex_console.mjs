// MEASUREMENT, not a unit test — it spends turns of a real ChatGPT plan and
// needs `codex` on PATH and signed in.
// Run: node test/smoke_codex_console.mjs
//
// ‼️ THIS IS THE EVIDENCE X-15 STANDS ON. The design doc's own rule was that the
// adaptor must not be written until a real turn can be seen on this machine —
// a translation layer written against imagined field names passes its own unit
// tests perfectly and produces an empty Console against the binary. So this
// drives the REAL ConsoleHost, with the REAL engine, and prints what the session
// state ended up holding.
//
// What it proves, in the order it proves it:
//   1. A per-turn session starts with NO PROCESS and is idle, not broken.
//   2. The first message spawns `codex exec`, and the thread id the CLI reports
//      becomes the session's own id.
//   3. The turn's talk, its shell steps and their output all reach the state as
//      ordinary Console messages — one panel, two engines underneath it.
//   4. Tokens are counted; NO dollar figure is invented (Codex states none).
//   5. ‼️ THE SECOND MESSAGE RESUMES THE SAME THREAD. That is the whole
//      difference from a one-shot runner, and the flags for it are not the same
//      as the first turn's (`resume` refuses `-s` and `-C` — measured).
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

const out = path.resolve(process.cwd(), 'out', 'core');
const { ConsoleHost } = await import(pathToFileURL(path.join(out, 'consolehost.js')).href);

const dir = path.join(os.tmpdir(), 'af-codex-smoke');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'note.txt'), 'the codeword is Vermilion-Hatch-4417\n', 'utf8');

const host = new ConsoleHost();
const id = host.start({
    agentId: 'smoke', agentName: 'developer', cwd: dir,
    engine: 'codex', permissionMode: 'default'
});

const state = () => host.get(id);
const wait = (fn, ms = 240000) => new Promise((res, rej) => {
    const t0 = Date.now();
    const tick = () => {
        if (fn()) { return res(state()); }
        if (Date.now() - t0 > ms) { return rej(new Error('timed out')); }
        setTimeout(tick, 400);
    };
    tick();
});

const show = (label) => {
    const s = state();
    console.log(`\n──── ${label}`);
    console.log(`status      ${s.status}`);
    console.log(`engine      ${s.engine}`);
    console.log(`sessionId   ${s.sessionId ?? '(none yet)'}`);
    console.log(`turns       ${s.turns}   tokens ${s.tokens}   cost $${s.costUSD}`);
    for (const m of s.messages.slice(-8)) {
        const what = m.role === 'tool'
            ? (m.tool ? `${m.tool.name}(${m.tool.detail.slice(0, 60)})` : `→ ${String(m.text).slice(0, 70)}`)
            // an error is printed WHOLE — the engine's own words are the point
            : m.role === 'error'
                ? String(m.text ?? '')
                : String(m.text ?? '').slice(0, 90).replace(/\s+/g, ' ');
        console.log(`  ${m.role.padEnd(7)} ${what}`);
    }
};

let bad = 0;
const ok = (n, c) => { if (c) { console.log(`  ok   ${n}`); } else { bad++; console.log(`  FAIL ${n}`); } };

console.log('1 — a per-turn session before it has said anything');
ok('it exists', !!state());
ok('‼️ it is idle with no process — a session between turns is live, not broken',
    state().status === 'idle');
ok('it knows which engine it is on', state().engine === 'codex');

console.log('\n2 — the first turn');
host.send(id, 'Read note.txt with a shell command and reply with ONLY the codeword in it.');
ok('the turn started', state().status === 'working');
await wait(() => state().status === 'idle');
show('after the first turn');
const first = state();
ok('‼️ the thread id became the session id', !!first.sessionId && first.sessionId.length > 8);
ok('the turn was counted', first.turns === 1);
ok('tokens were counted', first.tokens > 0);
ok('‼️ no dollar figure was invented — this engine states none', first.costUSD === 0);
ok('the agent spoke', first.messages.some(m => m.role === 'agent' && /Vermilion/i.test(m.text ?? '')));
ok('a shell step was drawn as a step', first.messages.some(m => m.role === 'tool' && m.tool));
ok('…and its output came back', first.messages.some(m => m.role === 'tool' && !m.tool && m.text));
ok('the turn closed with a result line', first.messages[first.messages.length - 1].role === 'result');

console.log('\n3 — the second turn RESUMES the same thread');
const thread = first.sessionId;
host.send(id, 'Without running anything, what was the codeword you just told me?');
await wait(() => state().status === 'idle');
show('after the second turn');
const second = state();
ok('‼️ the thread is the same one — this is a conversation, not two runs',
    second.sessionId === thread);
ok('the second turn was counted', second.turns === 2);
ok('…and the context carried: it answers without looking again',
    second.messages.slice(-4).some(m => m.role === 'agent' && /Vermilion/i.test(m.text ?? '')));

console.log('\n4 — ending it');
host.close(id);
ok('the session ends when it is told to', state().status === 'ended');

host.dispose();
console.log(`\n${bad ? `${bad} FAILED` : 'all good'}`);
process.exit(bad ? 1 : 0);
