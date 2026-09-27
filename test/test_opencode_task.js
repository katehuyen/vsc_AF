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

// ---------- the brief goes in ONCE ----------
//
// A per-turn engine has no system-prompt channel (OPENCODE_HAS_NO_SYSTEM_PROMPT_FLAG,
// and the same fact on Codex), so the project brief rides inside the prompt. On a
// CONTINUATION it is already in the conversation — a resume only happens on an
// engine `headlessResumeRefusal` measured to carry its own context — so sending it
// again pays for the same tokens twice and re-introduces a project the model has
// been working in since turn one.
{
    ok('‼️ a continuation does not repeat the project brief',
        /\? \(safeResume \? '' : engineContextPrefix\(this\.readContext\(ctxFile\)\)\) \+ task\.prompt/
            .test(tasksTs));
    ok('…and a FIRST turn still carries it, exactly as before',
        /const perTurnPrompt = perTurn/.test(tasksTs)
        && /engineContextPrefix\(this\.readContext\(ctxFile\)\)/.test(tasksTs));
    ok('…and the archive says why this run\'s prompt is shorter',
        /the project brief is not repeated; it is already in this conversation/.test(tasksTs));
}

// ---------- a schedule's next firing is a NEW conversation ----------
//
// "schedule'ın normal sonraki firing'i açık resume yoksa eski ses_ oturumunu miras
// almasın" — a nightly job that silently resumed last night's conversation would
// grow one thread for ever and bill its whole history on every run.
{
    const fired = tasksTs.slice(tasksTs.indexOf('private fireSchedule('));
    const body = fired.slice(0, fired.indexOf('\n    private ', 1));
    ok('‼️ a timed firing never inherits a session id',
        /fromSchedule: s\.id, projectId: s\.projectId \|\| undefined, \.\.\.runExtras\(s\)/.test(body)
        && !/resumeSessionId/.test(body));
    // U-151 — 'Run with…' may lay a retry over this one run, and nothing else.
    ok('…and the manual "run now" is the same call, so it cannot differ',
        (tasksTs.match(/\{ fromSchedule: s\.id, projectId: s\.projectId \|\| undefined, \.\.\.runExtras\(s\)( \}|, \.\.\.\(over\?\.retry \? \{ retry: over\.retry \} : \{\}\) \})/g) || [])
            .length === 2
        && !/resumeSessionId/.test(tasksTs.slice(tasksTs.indexOf('runScheduleNow(s: FarmSchedule'), tasksTs.indexOf('const started = this.startTask(task);', tasksTs.indexOf('runScheduleNow(s: FarmSchedule')))));
    // Resume only ever comes from a place that MEANT it: Smart Continue after an
    // interrupted run, which is where the id is copied on purpose.
    ok('the only place a task inherits a conversation is Smart Continue',
        /if \(prev\.failurePhase === 'interrupted' && p\.behavior === 'smart' && resumeId\) \{/.test(tasksTs)
        && /held\.resumeSessionId = resumeId;/.test(tasksTs));
}

// ---------- cancel stops what this task owns, and nothing else ----------
{
    // ‼️ X-47 — the kill is an `execFile` with `windowsHide`, not an `exec`: the
    // shell form is a cmd.exe with a console, which flashes a black rectangle
    // over whatever the user was looking at. Same tree, same /T /F, no window.
    ok('cancel kills the task\'s OWN process tree',
        /private killProcess\(taskId: string, child: cp\.ChildProcess\): void \{/.test(tasksTs)
        && /cp\.execFile\('taskkill', \['\/pid', String\(child\.pid\), '\/T', '\/F'\]/.test(tasksTs)
        && /windowsHide: true/.test(tasksTs));
    ok('…and it is looked up by task id, never by engine or by name',
        /const child = this\.processes\.get\(task\.id\);\s*\n\s*if \(child\) \{ this\.killProcess\(task\.id, child\); \}/
            .test(tasksTs));
}

// ---------- one executor, and both doors say so ----------
//
// ‼️ M-22 — THE CONDITION AND THE SENTENCE EXIST ONCE EACH. Both doors used to
// carry their own copy of `cli && engine && engine !== 'claude'` and their own
// wording of the refusal, which held only as long as nobody edited one of them:
// the bridge named the args, the page named the controls, and a third surface
// would have invented a third. `twoExecutors` / `ONE_EXECUTOR` in core/launch.ts
// are now the only copy, and this checks that no inline re-spelling comes back.
{
    const extTs = read('src', 'extension.ts');
    const launchTs = read('src', 'core', 'launch.ts');
    ok('the conflict is one exported predicate, not a condition each caller retypes',
        /export function twoExecutors\(cli: unknown, engine: unknown\): boolean \{/.test(launchTs)
        && /export const ONE_EXECUTOR =/.test(launchTs));
    ok('…and `claude` is not a conflict, because an absent engine already means claude',
        /e !== 'claude'/.test(launchTs));
    ok('the bridge refuses an engine and a CLI profile together, through that gate',
        /needOneExecutor\(engine, cli\);/.test(extTs));
    ok('‼️ …and so does the form, which used to accept the pair silently',
        /if \(twoExecutors\(str\('cli'\), str\('engine'\)\)\) \{\s*\n\s*this\.say\(ONE_EXECUTOR\);/.test(panelTs));
    // The hand-written condition is what drifts; the message is what disagrees.
    // Neither may reappear inline in a surface file.
    //
    // ‼️ THE PAIR, not `engine !== 'claude'` on its own — that comparison is
    // legitimate and common (engine refusal, lanes, the per-turn split) and
    // banning it would make this gate cry wolf until somebody deleted it. What
    // may not come back is the two operands weighed against each other outside
    // `twoExecutors`. Comments are stripped first: the rule is explained in
    // prose in several places and prose is not a second implementation.
    const code = src => src.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const [name, src] of [['extension.ts', extTs], ['tasksPanel.ts', panelTs]]) {
        const body = code(src);
        ok(`${name} re-spells neither the condition nor the sentence`,
            !/\bcli\b[^\n]{0,60}&&[^\n]{0,60}\bengine\b/i.test(body)
            && !/\bengine\b[^\n]{0,60}&&[^\n]{0,60}\bcli\b/i.test(body)
            && !/runs on ONE executor/.test(body));
    }
}

// ------------------------------------------------------------------------
// M-14 — AN EFFORT THE ENGINE HAS NO FLAG FOR IS REFUSED BEFORE IT SPAWNS.
//
// The item asks for "a clear refusal, before starting, for a wrong model /
// variant / permission". Three layers already existed and each has a hole the
// next one does not cover: the bridge refuses it on `tasks.add`, `narrowLaunch`
// clears it on an edit, and the picker does not offer it — all three only while
// the model matrix is in hand. What none of them covers is a row that was
// SAVED for another engine: change a task from Claude to OpenCode and the
// effort it was written with is still on it, and still goes to the command
// line. Gemini exits 42 on one (measured) and OpenCode takes a `--variant` that
// no reachable model publishes, so the failure is either silence or a death
// with nothing a reader can act on.
{
    const CE = (() => {
        const Module = require('module');
        const orig = Module._load;
        Module._load = function (r) {
            if (r === 'vscode') {
                return {
                    Uri: {}, window: {},
                    EventEmitter: class { get event() { return () => ({ dispose() { } }); } fire() { } },
                    workspace: { getConfiguration: () => ({ get: (_k, d) => d }) },
                    ViewColumn: {}, ConfigurationTarget: {}, env: {}
                };
            }
            return orig.apply(this, arguments);
        };
        try { return require(path.join(__dirname, '..', 'out', 'core', 'consoleEngine.js')); }
        finally { Module._load = orig; }
    })();

    // X-330 — the answer is the transport's and the model's.
    const pub = (m) => ({ 'opencode/ling': ['low', 'medium', 'high'], 'opencode/big-pickle': [] })[m];
    ok('‼️ an effort on an interactive OpenCode run is refused, and the sentence says what to clear',
        /clear the effort/.test(CE.headlessEffortRefusal('opencode', 'high', undefined, { transport: 'tui' }))
        && /variant/.test(CE.headlessEffortRefusal('opencode', 'high', undefined, { transport: 'hosted' })));
    ok('‼️ a headless run carries a variant the model publishes, and nothing else',
        CE.headlessEffortRefusal('opencode', 'high', undefined, { model: 'opencode/ling', variantsOf: pub }) === ''
        && /publishes: low, medium, high/.test(CE.headlessEffortRefusal('opencode', 'xhigh', undefined, { model: 'opencode/ling', variantsOf: pub }))
        && /publishes no reasoning variants/.test(CE.headlessEffortRefusal('opencode', 'low', undefined, { model: 'opencode/big-pickle', variantsOf: pub })));
    ok('…and on Gemini, which exits 42 rather than explaining itself',
        CE.headlessEffortRefusal('gemini', 'medium') !== '');
    for (const id of ['claude', 'codex', 'agy']) {
        ok(`${id} takes an effort, so nothing is refused`,
            CE.headlessEffortRefusal(id, 'high') === '');
    }
    ok('no effort, nothing to refuse — on any engine',
        CE.headlessEffortRefusal('opencode', '') === ''
        && CE.headlessEffortRefusal('opencode', undefined) === '');
    ok('a CLI profile runs a binary this matrix knows nothing about, so it is left alone',
        CE.headlessEffortRefusal('opencode', 'high', 'my-profile') === '');

    ok('the launch gate applies it, and fails the run BEFORE it starts',
        /headlessEffortRefusal\(task\.engine, task\.effort, task\.cli, \{/.test(tasksTs)
        && /failed before it started — \$\{refused\}/.test(tasksTs));
}

// ---------- an archive is read as what the AGENT said, not what the CLI printed ----------
//
// ‼️ Found on a real M-19 run, not in a unit test: a speaking turn's message
// text is the delegate's archived body, and on this engine that body is the
// event stream. The next speaker was going to be shown `step_start` /
// `tool_use` / `step_finish` objects as "what the other agent said" — a record
// that reads like a discussion and contains a transport document. The same body
// is the material a `review`, `compare` or `revise` delegate is handed, so the
// unwrapping had to stop being a branch beside one caller.
{
    const Module = require('module');
    const origLoad = Module._load;
    Module._load = function (request) {
        if (request === 'vscode') {
            return { Uri: {}, window: {}, workspace: { getConfiguration: () => ({ get: (_k, d) => d }) } };
        }
        return origLoad.apply(this, arguments);
    };
    const T = require(path.join(ROOT, 'out', 'core', 'tasks.js'));
    Module._load = origLoad;

    const stream = [
        '{"type":"step_start","sessionID":"ses_1","part":{"type":"step-start"}}',
        '{"type":"text","sessionID":"ses_1","part":{"type":"text","text":"Keep it in one file."}}',
        '{"type":"tool_use","sessionID":"ses_1","part":{"tool":"read","state":{"status":"completed","output":"x"}}}',
        '{"type":"step_finish","sessionID":"ses_1","part":{"type":"step-finish","reason":"stop","tokens":{"total":10},"cost":0}}'
    ].join('\n');

    ok('‼️ an OpenCode body is read down to the prose the agent wrote',
        T.engineReplyText(stream, 'opencode') === 'Keep it in one file.');
    ok('…and its tool calls are not part of what it said',
        !String(T.engineReplyText(stream, 'opencode')).includes('tool_use'));
    ok('‼️ the SAME body on another engine is left exactly as it is — the engine decides, not the content',
        T.engineReplyText(stream, 'claude') === stream);
    ok('a stream that carried no prose is "nothing was said", not an envelope',
        T.engineReplyText(
            '{"type":"step_finish","sessionID":"s","part":{"type":"step-finish","reason":"stop"}}',
            'opencode') === undefined);
    ok('‼️ …but a body this engine\'s reader recognises NOTHING in is shown as itself — a spawn error is not silence',
        T.engineReplyText('[spawn error] ENOENT', 'opencode') === '[spawn error] ENOENT');
    ok('an Antigravity envelope is read down to its answer',
        T.engineReplyText('{"conversation_id":"c","status":"ok","response":"Fragments."}', 'agy') === 'Fragments.');
    ok('…and one without that field is shown as itself',
        T.engineReplyText('plain trouble', 'agy') === 'plain trouble');

    const archive = `Task: x\nAgent: y\n\n---\n${stream}\n\n---\nFinished: now · exit 0 · 1 min\n`;
    ok('‼️ and the whole archive — our header, the stream, our footer — comes back as the sentence',
        T.archivedReplyText(archive, 'opencode') === 'Keep it in one file.');
    ok('a Claude archive is unchanged by any of this',
        T.archivedReplyText(`h\n\n---\nThe answer.\n\n---\nFinished: now\n`, 'claude').trim() === 'The answer.');

    ok('the workflow handoff uses the same one reader rather than its own branches',
        /const said = engineReplyText\(body, task\.engine\);/.test(tasksTs)
        && !/if \(engineOf\(task\.engine\)\.id === 'opencode'\) \{/.test(tasksTs));

    const extTs = read('src', 'extension.ts');
    ok('‼️ and a mission reads a delegate\'s archive through it, with the task\'s own engine',
        /archivedReplyText\(fs\.readFileSync\(file, 'utf8'\), engine\)/.test(extTs)
        && /taskManager\.tasks\.find\(t => t\.id === taskId\)\?\.engine/.test(extTs));
    const misTs = read('src', 'core', 'missions.ts');
    ok('…and every mission call site names the step\'s task, so the engine is knowable',
        !/readOutputBody\((step|reviewStep)\.outputFile\)/.test(misTs)
        && /readOutputBody\(step\.outputFile, step\.taskId\)/.test(misTs));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
