// MEASUREMENT, not a unit test — it spends turns of a real Antigravity account
// and needs `agy` on PATH and signed in through the Antigravity app.
// Run: node test/smoke_agy_console.mjs
//
// ‼️ THIS IS THE EVIDENCE S-21 STANDS ON, and it is the same rule the Codex
// smoke test was written under: the adaptor must not be believed until a real
// turn can be seen on this machine. A translation layer written against imagined
// field names passes its own unit tests perfectly and produces an empty Console
// against the binary. So this drives the REAL ConsoleHost, with the REAL engine.
//
// What it proves, in the order it proves it:
//   1. A per-turn session starts with NO PROCESS and is idle, not broken.
//   2. ‼️ THE PROMPT REACHES IT IN ARGV, NOT ON STDIN — the opposite of Codex —
//      and it survives being multi-line with shell metacharacters in it, because
//      the process is spawned with no shell.
//   3. ‼️ THE AGENT CAN SEE THE FOLDER. Without `--add-dir` it works in
//      ~/.gemini/antigravity-cli/scratch and answers about the wrong place; this
//      turn asks it to read a file that only exists in the session's cwd.
//   4. Its talk, its tool steps and their output all reach the state as ordinary
//      Console messages — one panel, three engines underneath it.
//   5. Tokens are counted ONCE (the result block repeats the steps' usage) and
//      NO dollar figure is invented.
//   6. ‼️ THE SECOND MESSAGE RESUMES THE SAME CONVERSATION.
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

const out = path.resolve(process.cwd(), 'out', 'core');
const { ConsoleHost } = await import(pathToFileURL(path.join(out, 'consolehost.js')).href);

const dir = path.join(os.tmpdir(), 'af-agy-smoke');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'note.txt'), 'the codeword is Vermilion-Hatch-4417\n', 'utf8');

const host = new ConsoleHost();
const id = host.start({
    agentId: 'smoke', agentName: 'developer', cwd: dir,
    engine: 'agy', model: 'gemini-3.6-flash', effort: 'low', permissionMode: 'default'
});

const state = () => host.get(id);
const wait = (fn, ms = 300000) => new Promise((res, rej) => {
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
ok('it knows which engine it is on', state().engine === 'agy');

console.log('\n2 — the first turn, with a prompt a shell would have destroyed');
// ‼️ Newlines, double quotes, a backtick, `$`, `%` and `&`. On this engine the
// prompt is an argv element; if anything here reached a shell the turn would
// either fail or arrive truncated, and this is the line that would show it.
host.send(id, [
    'Read the file note.txt in your workspace and reply with ONLY the codeword in it.',
    'Ignore this decoration: "quotes", a `backtick`, a $dollar, a %percent% and an & ampersand.'
].join('\n'));
ok('the turn started', state().status === 'working');
await wait(() => state().status === 'idle');
show('after the first turn');
const first = state();
ok('‼️ the conversation id became the session id', !!first.sessionId && first.sessionId.length > 8);
ok('the turn was counted', first.turns === 1);
ok('tokens were counted', first.tokens > 0);
ok('‼️ no dollar figure was invented — this engine states none', first.costUSD === 0);
// ‼️ THE --add-dir PROOF. The codeword exists only in the session's cwd; an
// agent left in its scratch workspace answers "the file does not exist".
ok('‼️ it read the file in the session\'s OWN folder, not its scratch workspace',
    first.messages.some(m => m.role === 'agent' && /Vermilion/i.test(m.text ?? '')));
ok('a tool step was drawn as a step', first.messages.some(m => m.role === 'tool' && m.tool));
ok('the turn closed with a result line', first.messages[first.messages.length - 1].role === 'result');

console.log('\n3 — the second turn RESUMES the same conversation');
const conversation = first.sessionId;
const tokensAfterFirst = first.tokens;
host.send(id, 'Without reading anything, what was the codeword you just told me?');
await wait(() => state().status === 'idle');
show('after the second turn');
const second = state();
ok('‼️ the conversation is the same one — this is a conversation, not two runs',
    second.sessionId === conversation);
ok('the second turn was counted', second.turns === 2);
ok('…and the context carried: it answers without looking again',
    second.messages.slice(-4).some(m => m.role === 'agent' && /Vermilion/i.test(m.text ?? '')));
ok('tokens kept counting across the resume', second.tokens > tokensAfterFirst);

console.log('\n4 — ending it');
host.close(id);
ok('the session ends when it is told to', state().status === 'ended');

host.dispose();
console.log(`\n${bad ? `${bad} FAILED` : 'all good'}`);
process.exit(bad ? 1 : 0);
