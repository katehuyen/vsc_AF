// S-37 — the two session sources that were quietly costing or quietly missing.
//
// 1. ANTIGRAVITY WENT INVISIBLE A SECOND TIME. The adaptor read the CLI's own
//    index, `cache/conversation_metadata.json`. Measured 2026-08-16: that file
//    had not been written since 2026-08-10 14:17, because Antigravity stopped
//    updating it for the headless `--print` runs Agent Farm's tasks and
//    schedules use. Every automated `agy` run since was absent from the
//    Sessions page under every filter. The conversation itself was on disk the
//    whole time, one JSON step per line, at
//    `brain/<id>/.system_generated/logs/transcript.jsonl`.
//
// 2. THE LIVE-EVENT LOG WAS RE-READ FROM THE TOP EVERY MINUTE. 26.6 MB, 81,104
//    lines, 325 ms on the extension host's thread, producing zero rows on that
//    machine. It is append-only, so the parse now carries on from where it
//    stopped.
const fs = require('fs');
const path = require('path');
const os = require('os');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, a, b) => ok(n + (JSON.stringify(a) === JSON.stringify(b) ? '' :
    `: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`), JSON.stringify(a) === JSON.stringify(b));

const load = rel => {
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
    try { return require(path.join(__dirname, '..', 'out', 'core', rel)); }
    finally { Module._load = orig; }
};
const T = load('cliTranscripts.js');
const SS = load('sessionSource.js');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'af-src-'));
const iso = ts => new Date(ts).toISOString().replace(/\.\d+Z$/, 'Z');

// --------------------------------------------------- Antigravity: brain/<id>
{
    const home = path.join(root, 'agy');
    const brain = path.join(home, 'brain');
    const logDir = id => path.join(brain, id, '.system_generated', 'logs');
    const write = (id, steps) => {
        fs.mkdirSync(logDir(id), { recursive: true });
        fs.writeFileSync(path.join(logDir(id), 'transcript.jsonl'),
            steps.map(s => JSON.stringify(s)).join('\n') + '\n', 'utf8');
    };
    // whole seconds: the CLI writes `created_at` to the second, so a base with
    // milliseconds would compare a timestamp against its own rounding
    const t0 = Math.floor((Date.now() - 3600_000) / 1000) * 1000;
    // A headless task run, in the shape the CLI really writes it — measured:
    // the CALL is announced on a `PLANNER_RESPONSE` carrying `tool_calls` and no
    // prose, and the step NAMED after the tool carries only the output. Every
    // arg value is a JSON string inside a JSON string.
    write('conv-headless', [
        { step_index: 0, source: 'USER_EXPLICIT', type: 'USER_INPUT', status: 'DONE', created_at: iso(t0), content: '<USER_REQUEST>\nRun the daily backup commit.\n</USER_REQUEST>' },
        { step_index: 1, source: 'SYSTEM', type: 'CONVERSATION_HISTORY', status: 'DONE', created_at: iso(t0 + 1000) },
        { step_index: 2, source: 'MODEL', type: 'PLANNER_RESPONSE', status: 'DONE', created_at: iso(t0 + 2000), content: 'Looking.' },
        {
            step_index: 3, source: 'MODEL', type: 'PLANNER_RESPONSE', status: 'DONE', created_at: iso(t0 + 2500),
            tool_calls: [{ name: 'run_command', args: { CommandLine: '"git status --short"', Cwd: '"D:\\\\work\\\\basit"', toolAction: '"Checking git status"' } }]
        },
        { step_index: 4, source: 'MODEL', type: 'RUN_COMMAND', status: 'DONE', exit_code: 0, created_at: iso(t0 + 3000), content: 'M one.txt' },
        {
            step_index: 5, source: 'MODEL', type: 'PLANNER_RESPONSE', status: 'DONE', created_at: iso(t0 + 3500),
            tool_calls: [{ name: 'write_to_file', args: { TargetFile: '"D:\\\\work\\\\basit\\\\note.md"', CodeContent: '"hello"' } }]
        },
        { step_index: 6, source: 'MODEL', type: 'CODE_ACTION', status: 'DONE', created_at: iso(t0 + 4000), content: 'written' },
        { step_index: 7, source: 'SYSTEM', type: 'ERROR_MESSAGE', status: 'DONE', created_at: iso(t0 + 5000), content: 'nope' },
        { step_index: 8, source: 'MODEL', type: 'PLANNER_RESPONSE', status: 'DONE', created_at: iso(t0 + 6000), content: 'Done.' }
    ]);
    // a conversation the Console hosted — Agent Farm keeps the fuller record
    write('conv-mirrored', [
        { step_index: 0, source: 'USER_EXPLICIT', type: 'USER_INPUT', status: 'DONE', created_at: iso(t0), content: 'hello there' }
    ]);
    fs.mkdirSync(path.join(home, 'cache'), { recursive: true });
    fs.writeFileSync(path.join(home, 'cache', 'last_conversations.json'),
        JSON.stringify({ 'D:\\work\\basit': 'conv-headless' }), 'utf8');

    const resolveAgent = cwd => (String(cwd ?? '').toLowerCase().includes('basit')
        ? { agentId: 'basit', agentName: 'basit' } : {});

    const bare = T.agySessionsSource(() => home, resolveAgent, undefined, 0).scan();
    eq('every conversation on disk is a row', bare.map(r => r.sessionId).sort(),
        ['conv-headless', 'conv-mirrored']);

    const run = bare.find(r => r.sessionId === 'conv-headless');
    eq('‼️ the headless run the stale index never mentioned is listed',
        [run.userTurns, run.assistantMsgs, run.toolCalls, run.errors], [1, 2, 2, 1]);
    eq('…named by what it was actually asked to do, without the CLI\'s wrapper',
        run.title, 'Run the daily backup commit.');
    // ‼️ The ENGINE's own names, read off the announcement — eleven tools exist
    // and inventing two of our own for them made the hover a fiction.
    eq('…with the tools it used, named the way the engine names them',
        run.tools, { run_command: 1, write_to_file: 1 });
    eq('…and what it wrote, unwrapped from the double-encoded arg',
        run.filesEdited, { 'D:\\work\\basit\\note.md': 1 });
    eq('…and the real span, first step to last', [run.firstTs, run.lastTs], [t0, t0 + 6000]);
    // ‼️ NOT from the call's `Cwd`: that is where the COMMAND ran, not where the
    // session lives, and reading it files the run under the wrong agent.
    eq('…attributed through the CLI\'s workspace cache, never through a call\'s Cwd',
        [run.cwd, run.agentId], ['D:\\work\\basit', 'basit']);
    eq('the engine is named on the row', run.source, 'agy');
    eq('tokens and cost stay an honest zero — the db that holds them is protobuf',
        [run.wTokens, run.cost, run.usage.input], [0, 0, 0]);

    // ‼️ one conversation, one row
    const mirrorDir = path.join(root, 'mirrors');
    fs.mkdirSync(mirrorDir, { recursive: true });
    fs.writeFileSync(path.join(mirrorDir, 'conv-mirrored.json'), '{}', 'utf8');
    const deduped = T.agySessionsSource(() => home, resolveAgent, () => mirrorDir, 0).scan();
    eq('‼️ a conversation the Console mirrored is left to the mirror',
        deduped.map(r => r.sessionId), ['conv-headless']);

    eq('a missing store is no rows, not an error',
        T.agySessionsSource(() => path.join(root, 'nowhere'), resolveAgent, undefined, 0).scan(), []);
}

// ------------------------------------------- live events: append-only reading
{
    const file = path.join(root, 'live-events.jsonl');
    const ev = (id, kind, ts, extra = {}) =>
        JSON.stringify({ sessionId: id, kind, ts, ...extra }) + '\n';
    const now = Date.now();
    fs.writeFileSync(file, ev('cli:codex:one', 'start', now) + ev('cli:codex:one', 'prompt', now + 10, { detail: 'first ask' }), 'utf8');

    const src = SS.liveEventsSource(() => file, 0);
    const a = src.scan();
    eq('an external lane becomes a row', a.map(r => r.sessionId), ['cli:codex:one']);
    eq('…titled by its first prompt', a[0].title, 'first ask');
    eq('…and a claude id is not this source\'s business', a[0].source, 'codex');

    fs.appendFileSync(file, ev('cli:codex:one', 'toolStart', now + 20, { tool: 'shell' })
        + ev('cli:codex:two', 'start', now + 30), 'utf8');
    const b = src.scan();
    eq('‼️ appended lines are picked up without re-reading the file',
        b.map(r => r.sessionId).sort(), ['cli:codex:one', 'cli:codex:two']);
    eq('…and what was already counted is not counted twice',
        [b.find(r => r.sessionId === 'cli:codex:one').userTurns,
        b.find(r => r.sessionId === 'cli:codex:one').toolCalls], [1, 1]);

    // a half-written last line must not be parsed, and must not be lost either
    fs.appendFileSync(file, '{"sessionId":"cli:codex:three","kind":"start","ts":' + (now + 40), 'utf8');
    eq('a torn last line is held back, not dropped',
        src.scan().map(r => r.sessionId).sort(), ['cli:codex:one', 'cli:codex:two']);
    fs.appendFileSync(file, '}\n', 'utf8');
    eq('…and read once the writer finishes it',
        src.scan().map(r => r.sessionId).sort(), ['cli:codex:one', 'cli:codex:three', 'cli:codex:two']);

    // pruning the log is the one case that starts again from the top
    fs.writeFileSync(file, ev('cli:codex:four', 'start', now + 50), 'utf8');
    eq('a pruned log is re-read rather than believed',
        src.scan().map(r => r.sessionId), ['cli:codex:four']);
}

try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* temp */ }

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
