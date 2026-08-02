// MEASUREMENT, not a unit test — it spends money and needs the real CLI.
// Run: node test/smoke_project_context.mjs   (haiku, lowest effort)
//
// This is the evidence Faz 2's channel choice rests on. What was measured, and
// what it settled:
//
//   * `--append-system-prompt-file` EXISTS, despite being absent from the flag
//     list in `--help` (the CLI answers "file not found", not "unknown option").
//     The design had recorded it as missing, which is what pushed it towards
//     inline text.
//   * INLINE multi-line text does not survive `shell: true` on ANY spawn path —
//     not as an argv entry (the args are concatenated unquoted: `unknown option
//     '---'`) and not inside a command string. All three of Agent Farm's spawn
//     paths use `shell: true`.
//   * A FILE PATH survives all of them, and carries the newlines the text needs.
//     It must be QUOTED BY US: an unquoted path containing a space is cut at the
//     space ("…/John Doe/…" → "…/John").
//
// Two traps this file exists to keep out of, both of which caught earlier
// versions of this measurement:
//   1. Do not put the question in argv. The Console never does — it speaks
//      stream-json and the user's message goes on STDIN, which is why its
//      command line only ever carries fixed-vocabulary values. Testing with a
//      free-text question in argv measures a shape that does not exist.
//   2. The seeding turn of the resume case must NOT ask for the codeword. If it
//      does, the word lands in the conversation history and the resumed session
//      "knows" it whether or not the system prompt survived.
import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const SECRET = 'Zephyr-Quatrain-8841';
const CONTEXT = `=== AGENT FARM PROJECT CONTEXT ===
This session belongs to the project "Smoke Test" (id: prj_smoke01).
Docs folder: D:\\zone\\nowhere\\Smoke Test

--- PROJECT BRIEF ---
- Status: active
- The project's secret codeword is ${SECRET}.
- Multi-line structure must arrive intact:
  * bullet one
  * bullet two
--- END PROJECT BRIEF ---
=== END AGENT FARM PROJECT CONTEXT ===`;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-ctx-'));
const plain = path.join(dir, 'context.txt');
fs.writeFileSync(plain, CONTEXT, 'utf8');
const spacedDir = path.join(dir, 'John Doe', 'Agent Farm');
fs.mkdirSync(spacedDir, { recursive: true });
const spaced = path.join(spacedDir, 'context.txt');
fs.writeFileSync(spaced, CONTEXT, 'utf8');

const ASK = 'Reply with ONLY the project codeword from your context, nothing else.';
// consoleproto.hostArgs(), verbatim
const HOST = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
    '--permission-prompt-tool', 'stdio', '--model', 'claude-haiku-4-5-20251001', '--effort', 'low'];

/** Drive one hosted session the way ConsoleHost does: flags in argv, the
 *  message on stdin, events back as stream-json. */
function hosted(args, ask = ASK) {
    return new Promise(resolve => {
        const child = cp.spawn('claude', args, { shell: true, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
        let buf = '', text = '', sid = '', err = '';
        child.stdout.on('data', d => {
            buf += d;
            const lines = buf.split('\n');
            buf = lines.pop() ?? '';
            for (const line of lines) {
                if (!line.trim()) { continue; }
                let o; try { o = JSON.parse(line); } catch { continue; }
                if (typeof o.session_id === 'string' && !sid) { sid = o.session_id; }
                if (o.type === 'assistant') {
                    for (const c of o.message?.content ?? []) {
                        if (c.type === 'text') { text += c.text; }
                    }
                }
                if (o.type === 'result') { child.stdin.end(); }
            }
        });
        child.stderr.on('data', d => { err += d; });
        child.on('error', e => resolve({ ok: false, text: 'spawn error: ' + e.message, sid: '' }));
        child.on('close', () => resolve({
            ok: text.includes(SECRET), sid,
            text: text.trim().slice(0, 140).replace(/\s+/g, ' '),
            err: err.trim().slice(0, 160).replace(/\s+/g, ' ')
        }));
        child.stdin.write(JSON.stringify({
            type: 'user', message: { role: 'user', content: [{ type: 'text', text: ask }] }
        }) + '\n');
    });
}

const results = [];
const check = async (label, args, ask) => {
    const r = await hosted(args, ask);
    results.push([label, r.ok]);
    console.log(`${r.ok ? '✅ knows it' : '⬜ does not'} — ${label}`);
    console.log(`   said: ${r.text}`);
    if (r.err) { console.log(`   stderr: ${r.err}`); }
    console.log('');
    return r;
};

console.log('measuring the FILE channel through the Console\'s REAL protocol\n');

await check('1 · plain path, argv + shell:true', [...HOST, '--append-system-prompt-file', plain]);
await check('2 · path WITH A SPACE, unquoted', [...HOST, '--append-system-prompt-file', spaced]);
await check('3 · path WITH A SPACE, quoted by us', [...HOST, '--append-system-prompt-file', `"${spaced}"`]);
const none = await check('4 · no flag → must NOT know it (control)', [...HOST]);

// The design's binding claim: the context does NOT survive --resume, so the
// flag has to be passed again on every spawn. The seeding turn asks something
// unrelated, so the codeword cannot reach the resumed session through the
// conversation history — see trap 2 at the top.
const seed = await hosted([...HOST, '--append-system-prompt-file', plain], 'Reply with exactly: ready');
console.log(`resume probe — seeded session ${seed.sid || '(none)'}`);
console.log(`   seed leaked the word into history: ${seed.ok ? 'YES — the two cases below are void' : 'no'}\n`);
if (seed.sid) {
    await check('5 · --resume WITHOUT the flag → must NOT know it', [...HOST, '--resume', seed.sid]);
    await check('6 · --resume WITH the flag re-passed → must know it',
        [...HOST, '--resume', seed.sid, '--append-system-prompt-file', plain]);
}

try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
console.log('summary — 2, 4 and 5 are EXPECTED to come back blank');
for (const [label, ok] of results) { console.log(`  ${ok ? 'knows' : 'blank'}  ${label}`); }
console.log(`\ncontrol sanity: case 4 ${none.ok ? 'KNEW IT — the measurement is worthless' : 'was blank, as it must be'}`);
console.log(seed.ok ? 'resume cases: VOID (seed leaked the word)' : 'resume cases: valid (seed stayed neutral)');
