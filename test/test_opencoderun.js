// M-14 — the unattended `opencode run --format json` contract.
//
// ‼️ THE TWO FIXTURES BELOW ARE VERBATIM CAPTURES, byte for byte, from
// `dist/measure/opencode-run.json` (one plain turn) and
// `dist/measure/opencode-run-tools.json` (a turn that read a file), opencode
// 1.18.18 on this machine, 2026-08-15. A reader written against imagined field
// names passes its own tests perfectly and reports every real run as empty.
//
// The four traps this locks down, each of which fails WITHOUT an error:
//   * the line says `step_finish`, the part inside it says `step-finish`;
//   * `tool_use` arrives ONCE, already completed — no pending/in_progress
//     lifecycle like the ACP transport has;
//   * the steps are SUMMED, never differenced — step 2's input was 17 248
//     against step 1's 40, so a running total is impossible;
//   * `reason: 'tool-calls'` is a hand-off, not an ending.
const fs = require('fs');
const path = require('path');
const R = require(path.join(__dirname, '..', 'out', 'core', 'opencoderun.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const SID1 = 'ses_ffae7344fffeoXeFqarl3jq8eB';
const SID2 = 'ses_ff9ab2531ffepBEqtV7Q46vd47';

// ---------- capture 1: one plain turn ----------
const PLAIN = [
    `{"type":"step_start","timestamp":1786791910959,"sessionID":"${SID1}","part":{"id":"prt_a","messageID":"msg_a","sessionID":"${SID1}","snapshot":"4b825dc","type":"step-start"}}`,
    `{"type":"text","timestamp":1786791911813,"sessionID":"${SID1}","part":{"id":"prt_b","messageID":"msg_a","sessionID":"${SID1}","type":"text","text":"NONCE=af-run-1","time":{"start":1786791911791,"end":1786791911800}}}`,
    `{"type":"step_finish","timestamp":1786791912244,"sessionID":"${SID1}","part":{"id":"prt_c","reason":"stop","snapshot":"4b825dc","messageID":"msg_a","sessionID":"${SID1}","type":"step-finish","tokens":{"total":8440,"input":1839,"output":4,"reasoning":69,"cache":{"write":0,"read":6528}},"cost":0}}`
].join('\n');

{
    const r = R.readOpencodeRun(PLAIN);
    ok('‼️ the real conversation id is read off the FIRST line', r.sessionId === SID1);
    ok('the answer is what the model wrote', r.text === 'NONCE=af-run-1');
    ok('one model call, and it is the ending', r.steps.length === 1 && r.finish === 'stop');
    ok('the turn\'s spend is the engine\'s own five numbers',
        r.spend.input === 1839 && r.spend.output === 4 && r.spend.reasoning === 69
        && r.spend.cacheRead === 6528 && r.spend.cacheWrite === 0);
    ok('…and its total is the engine\'s own: 1839+4+69+6528 = 8440', r.spend.total === 8440);
    ok('‼️ 0 on a free model is a REAL zero — this engine publishes the figure', r.cost === 0);
    ok('the run\'s clock is the lines\' own timestamps',
        r.firstTs === 1786791910959 && r.lastTs === 1786791912244);
    ok('nothing was unreadable', r.unparsed === 0 && r.tools.length === 0);
}

// ---------- capture 2: a turn that used a tool ----------
const READ_OUT = '<path>D:\\\\…\\\\package.json</path>\\n<type>file</type>\\n<content>\\n5:   \\"version\\": \\"3.144.0\\",\\n</content>';
const TOOLS = [
    `{"type":"step_start","timestamp":1786812624075,"sessionID":"${SID2}","part":{"id":"p1","type":"step-start"}}`,
    `{"type":"tool_use","timestamp":1786812625003,"sessionID":"${SID2}","part":{"type":"tool","tool":"read","callID":"call_00_ET","state":{"status":"completed","input":{"filePath":"D:\\\\zone\\\\package.json"},"output":"${READ_OUT}"}}}`,
    `{"type":"step_finish","timestamp":1786812625407,"sessionID":"${SID2}","part":{"id":"p2","reason":"tool-calls","type":"step-finish","tokens":{"total":8167,"input":40,"output":63,"reasoning":0,"cache":{"write":0,"read":8064}},"cost":0}}`,
    `{"type":"step_start","timestamp":1786812627538,"sessionID":"${SID2}","part":{"id":"p3","type":"step-start"}}`,
    `{"type":"text","timestamp":1786812628668,"sessionID":"${SID2}","part":{"id":"p4","type":"text","text":"3.144.0"}}`,
    `{"type":"step_finish","timestamp":1786812629110,"sessionID":"${SID2}","part":{"id":"p5","reason":"stop","type":"step-finish","tokens":{"total":25318,"input":17248,"output":6,"reasoning":0,"cache":{"write":0,"read":8064}},"cost":0}}`
].join('\n');

{
    const r = R.readOpencodeRun(TOOLS);
    ok('the id is the same on every line and taken once', r.sessionId === SID2);
    ok('two model calls', r.steps.length === 2);
    ok('‼️ `tool-calls` is a HAND-OFF, not an ending — the turn ends on the last step',
        r.steps[0].reason === 'tool-calls' && r.finish === 'stop');
    ok('‼️ the tool arrives ONCE, already completed — input and output together',
        r.tools.length === 1 && r.tools[0].name === 'read'
        && r.tools[0].status === 'completed' && /3\.144\.0/.test(r.tools[0].output));
    ok('…with the call id, so the archive can tie a result to its call',
        r.tools[0].callId === 'call_00_ET' && !r.tools[0].isError);
    // 40 + 17248 = 17288 · 63 + 6 = 69 · 8064 + 8064 = 16128 · 8167 + 25318 = 33485
    ok('‼️ THE STEPS ARE SUMMED: step 2\'s input (17 248) is LARGER than step 1\'s (40)',
        r.spend.input === 17288 && r.spend.output === 69);
    ok('…and the cached read is counted for BOTH calls, because both really made it',
        r.spend.cacheRead === 16128);
    ok('…so the turn total is the sum of the steps, not a delta', r.spend.total === 33485);
    ok('the answer is the text, not the tool output', r.text === '3.144.0');
}

// ---------- a failed tool ----------
{
    const r = R.readOpencodeRun(
        `{"type":"tool_use","timestamp":1,"sessionID":"${SID2}","part":{"type":"tool","tool":"write","callID":"c1","state":{"status":"error","input":{},"error":"user rejected"}}}`);
    ok('‼️ a refused tool is named by its STATUS and keeps the engine\'s own words',
        r.tools[0].isError === true && r.tools[0].output === 'user rejected');
    const fine = R.readOpencodeRun(
        `{"type":"tool_use","timestamp":1,"sessionID":"${SID2}","part":{"type":"tool","tool":"bash","state":{"status":"completed","output":"error: not found"}}}`);
    ok('…and a tool whose OUTPUT merely says "error" is not marked failed',
        fine.tools[0].isError === false);
}

// ---------- a file written by a process somebody killed ----------
{
    const cut = PLAIN.slice(0, PLAIN.length - 40);
    const r = R.readOpencodeRun(cut);
    ok('a truncated last line is counted, not thrown', r.unparsed === 1 && r.sessionId === SID1);
    ok('…and what DID arrive is still real', r.text === 'NONCE=af-run-1');
    const noisy = R.readOpencodeRun('warn: plugin skipped\n' + PLAIN);
    ok('a plugin\'s banner above the stream does not hide the run',
        noisy.sessionId === SID1 && noisy.unparsed === 1 && noisy.steps.length === 1);
    const nothing = R.readOpencodeRun('');
    ok('‼️ an unread run is distinguishable from a real zero: no id AND no steps',
        nothing.sessionId === '' && nothing.steps.length === 0 && nothing.spend.total === 0);
    ok('and it does not throw on rubbish', R.readOpencodeRun('not json at all').unparsed === 1);
}

// ---------- the binding, as early as it can be made ----------
{
    ok('‼️ the id is on the FIRST line, so a run can be bound while it is still going',
        R.opencodeRunSessionId(PLAIN.split('\n')[0]) === SID1);
    ok('…and a chunk that has not reached a whole line yet says nothing rather than guessing',
        R.opencodeRunSessionId('{"type":"step_start","sess') === '');
    ok('an empty chunk is empty', R.opencodeRunSessionId('') === '');
}

// ---------- what the archive says the output IS ----------
{
    const note = R.OPENCODE_RUN_OUTPUT_NOTE;
    ok('‼️ the note refuses the word "envelope" — Antigravity and Gemini print one object, this prints a STREAM',
        /not one envelope/.test(note));
    ok('…and names the three things a reader of the archived file needs',
        /sessionID/.test(note) && /tool_use/.test(note) && /step_finish/.test(note));
    ok('…including the rule that cost this codebase a bug on another engine',
        /summed, never differenced/.test(note));
    // ‼️ THE PERMISSION SENTENCE IS DELIBERATELY NOT HERE. `opencodeModeNote()`
    // is the one place that says what a mode means on this engine — including
    // the unattended case — and the task prompt already reaches it through
    // `engineModeNote()`. Two sources for one sentence is how they drift apart.
    const tasks = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'tasks.ts'), 'utf8');
    ok('the task prompt uses this note rather than writing its own sentence',
        /OPENCODE_RUN_OUTPUT_NOTE/.test(tasks));
    ok('…and it is only claimed for the headless transport', /engine\.id === 'opencode'/.test(tasks));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
