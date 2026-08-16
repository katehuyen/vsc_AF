// M-14 — an unattended OpenCode run BINDS ITSELF and PRICES ITSELF.
//
// `test_opencoderun.js` proves the reader understands the stream. This proves
// the TaskManager actually uses it, which is the half that decides whether a
// row is resumable and whether the cost column is a blank.
//
// ‼️ Two facts this engine gives that the others cannot, and both were being
// thrown away into the archive file:
//
//   * `sessionID` is on the FIRST line, so the binding can be made WHILE the
//     run is going. Every other engine is bound afterwards, by matching a
//     transcript the index found on disk — which means a run that is killed, or
//     that the window outlives, was never bound at all. Here it can be.
//   * each `step_finish` carries real dollars and real tokens, so the row does
//     not have to wait for something else to discover them. A free model's $0 is
//     a REAL zero and is told apart from "nothing was parsed" by there being
//     steps at all.
//
// The spawn itself is not exercised here — that needs a binary. What is pinned
// down is that the manager reads the stream through `core/opencoderun.ts` (the
// ONE reader M-14 names) and writes what it finds onto the task.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const tasksTs = read('src', 'core', 'tasks.ts');
const panelTs = read('src', 'panels', 'tasksPanel.ts');

// ---------- the manager reads the stream, and only through the one reader ----------
{
    ok('the headless path knows when it is on this engine',
        /const opencodeRun = perTurn && engine\.id === 'opencode';/.test(tasksTs));
    ok('‼️ the conversation is bound from the FIRST line, while the run is going',
        /const id = opencodeRunSessionId\(text\);/.test(tasksTs)
        && /if \(id\) \{ bound = id; this\.setRunProgress\(task\.id, \{ sessionId: id \}\); \}/.test(tasksTs));
    ok('…and never re-bound — one run is one conversation',
        /if \(!bound\) \{/.test(tasksTs));
    ok('the close reads the whole stream with the shared reader',
        /const run = readOpencodeRun\(seen\);/.test(tasksTs));
    ok('‼️ the price and the tokens reach the row',
        /this\.setTaskCost\(task\.id, run\.cost, task\.outputFile \?\? '', run\.spend\.total\);/.test(tasksTs));
    ok('…and so does what the run managed to do',
        /assistantSteps: run\.steps\.length, toolCalls: run\.tools\.length/.test(tasksTs));
    ok('‼️ a run with no steps is not priced at $0 — that would invent a figure',
        /if \(run\.steps\.length\) \{/.test(tasksTs));
    ok('…but a run that got as far as an id is still bound',
        /\} else if \(bound\) \{\s*\n\s*this\.setRunProgress\(task\.id, \{ sessionId: bound \}\);/.test(tasksTs));
    ok('nothing here parses a line itself — the reader is imported, not reimplemented',
        /opencodeRunSessionId, readOpencodeRun\s*\n\} from '\.\/opencoderun';/.test(tasksTs)
        && !/JSON\.parse\(line\)/.test(tasksTs));
}

// ---------- the reader, on the two facts the manager depends on ----------
{
    const R = require(path.join(ROOT, 'out', 'core', 'opencoderun.js'));
    const SID = 'ses_ffae7344fffeoXeFqarl3jq8eB';
    const first = `{"type":"step_start","timestamp":1786791910959,"sessionID":"${SID}","part":{"id":"p","messageID":"m","sessionID":"${SID}","type":"step-start"}}`;

    ok('‼️ the id is knowable from the first chunk alone, before the run ends',
        R.opencodeRunSessionId(first) === SID);
    ok('…and a chunk that is half a line yields nothing rather than a guess',
        R.opencodeRunSessionId('{"type":"step_start","timestamp":17867') === '');

    // A process somebody killed: the last line is truncated. Figures, not an
    // exception, and the steps that DID land are counted.
    const killed = [
        first,
        `{"type":"step_finish","timestamp":1786791912244,"sessionID":"${SID}","part":{"id":"c","reason":"tool-calls","messageID":"m","sessionID":"${SID}","type":"step-finish","tokens":{"total":8440,"input":1839,"output":4,"reasoning":69,"cache":{"write":0,"read":6528}},"cost":0.0031}}`,
        '{"type":"text","timestamp":178679191'
    ].join('\n');
    const r = R.readOpencodeRun(killed);
    ok('a killed run still reports its id, its step and its cost',
        r.sessionId === SID && r.steps.length === 1 && r.cost === 0.0031);
    ok('…and says how much of it could not be read',
        r.unparsed === 1);
    ok('‼️ an empty stream has no steps, which is how a real $0 is told from "unread"',
        (() => { const e = R.readOpencodeRun(''); return e.steps.length === 0 && e.cost === 0 && e.sessionId === ''; })());
}

// ---------- one executor, and both doors say so ----------
{
    const extTs = read('src', 'extension.ts');
    ok('the bridge refuses an engine and a CLI profile together',
        /need\(!\(cli && engine && engine !== 'claude'\),/.test(extTs));
    ok('‼️ …and so does the form, which used to accept the pair silently',
        /if \(str\('cli'\) && str\('engine'\) && str\('engine'\) !== 'claude'\) \{/.test(panelTs)
        && /A task runs on ONE executor: pick an engine, or a CLI profile — not both\./.test(panelTs));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
