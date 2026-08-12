// The Gemini adaptor and its command line — the engine that had a row, a model
// list and a place in every picker, and no transport at all.
//
// ‼️ WHY THIS FILE EXISTS. Before X-35 the dispatch in `consoleEngine.ts` read
// "if agy … else Codex", so a Gemini turn was handed
// `codex exec --json --skip-git-repo-check` — a vocabulary this CLI has never
// had — and whatever came back was parsed as Codex JSONL. Nothing failed
// loudly. `test_console_engine.js` tested Codex in detail and there was no
// Gemini argv or protocol test at all, which is exactly how a green suite came
// to sit on top of an engine wired to the wrong program.
//
// ‼️ THE VOCABULARY IS MEASURED, NOT IMAGINED (2026-08-13, gemini-cli 0.55.1,
// read from the shipped binary's own `--help`, its bundled docs and its bundled
// source: `packages/cli/src/gemini.tsx` for every emit site,
// `packages/core/src/output/stream-json-formatter.js` for the envelope,
// `packages/core/src/output/json-formatter.js` for the headless one). An
// adaptor written against imagined field names passes its own tests perfectly
// and produces an empty Console against the real binary.
//
// What is asserted here is the part a regex over the source cannot see:
//
//   * the stats are THIS PROCESS's, not the conversation's — the opposite of
//     Codex — so applying Codex's running-total subtraction would zero every
//     turn after the first;
//   * `input_tokens` DOES include the cached share (the same as Codex, the
//     opposite of Antigravity), so it has to be subtracted;
//   * the buckets are made to sum to the engine's own `total_tokens`, because
//     the stream does not itemise thinking and dropping it would understate a
//     reasoning turn by most of its cost;
//   * assistant text arrives as DELTAS and is flushed once;
//   * a warning on the `error` event is NOT the end of the turn;
//   * there is no effort flag, and passing one is exit 42;
//   * a first turn can CHOOSE its own session id, which no other engine here
//     offers.
'use strict';
const path = require('path');
const {
    geminiApprovalFor, geminiArgs, geminiModeNote, geminiRunArgs, geminiTuiArgs,
    geminiModelArgs, GEMINI_HAS_NO_EFFORT_FLAG, GEMINI_CAN_PRESET_SESSION_ID, GEMINI_EXIT
} = require(path.join(__dirname, '..', 'out/core/gemini.js'));
const {
    translateGemini, newGeminiState, geminiUsage, geminiUnitemisedTokens,
    geminiToolName, geminiStepKind, geminiToolDetail
} = require(path.join(__dirname, '..', 'out/core/geminiproto.js'));
const {
    turnArgs, runArgs, tuiArgs, engineModeNote, engineTakesEffort,
    engineFirstPromptFlag, enginePermissionSetting, ENGINES
} = require(path.join(__dirname, '..', 'out/core/consoleEngine.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

// ---------------------------------------------------------------------------
// the command line
// ---------------------------------------------------------------------------
{
    const first = geminiArgs({ newThread: 'aaaa-bbbb', model: 'gemini-3-pro-preview', permissionMode: 'plan' });
    ok('a hosted turn asks for the event stream',
        first.join(' ').includes('--output-format stream-json'));
    ok('‼️ the prompt is NOT on the command line — it travels on stdin',
        !first.some(a => /prompt/i.test(a)) && !first.includes('-p'));
    ok('the model is -m', first.includes('-m') && first.includes('gemini-3-pro-preview'));
    ok('a permission mode becomes --approval-mode, in this engine\'s own words',
        first.includes('--approval-mode') && first.includes('plan'));
    ok('‼️ a FIRST turn can be told its own id — no other engine here can',
        GEMINI_CAN_PRESET_SESSION_ID
        && first.includes('--session-id') && first.includes('aaaa-bbbb')
        && !first.includes('--resume'));

    const next = geminiArgs({ thread: 'aaaa-bbbb', model: 'x' });
    ok('…and a later turn resumes it by that same id, as an ordinary flag',
        next.includes('--resume') && next.includes('aaaa-bbbb')
        && !next.includes('--session-id'));

    ok('‼️ NO EFFORT FLAG EXISTS ON THIS ENGINE, so none is ever emitted',
        GEMINI_HAS_NO_EFFORT_FLAG
        && !geminiArgs({ model: 'x' }).includes('--effort')
        && !geminiRunArgs({ model: 'x' }).includes('--effort')
        && !geminiTuiArgs({ model: 'x' }).includes('--effort')
        && geminiModelArgs('x').join(' ') === '-m x');
    ok('…and no model means no flag at all, so the account default stands',
        geminiModelArgs('').length === 0 && geminiModelArgs(undefined).length === 0);

    const run = geminiRunArgs({ permissionMode: 'acceptEdits' });
    ok('an unattended run asks for the single-object envelope, not the stream',
        run.join(' ').includes('--output-format json')
        && !run.join(' ').includes('stream-json'));
    ok('…and maps acceptEdits to this CLI\'s own auto_edit',
        run.includes('auto_edit') && geminiApprovalFor('acceptEdits') === 'auto_edit');
    ok('…and bypassPermissions to yolo, default to default',
        geminiApprovalFor('bypassPermissions') === 'yolo'
        && geminiApprovalFor('') === 'default'
        && geminiApprovalFor('nonsense') === 'default');

    const tui = geminiTuiArgs({ conversation: 'c1' });
    ok('the interactive line carries no output format — that is what makes it a TUI',
        !tui.join(' ').includes('--output-format'));
    ok('…and resumes by id, or by "latest" for --continue',
        tui.includes('--resume') && tui.includes('c1')
        && geminiTuiArgs({ continueLast: true }).join(' ').includes('--resume latest'));
    ok('extra folders are one comma-joined --include-directories, or absent',
        geminiRunArgs({ includeDirs: ['a', 'b'] }).join(' ').includes('--include-directories a,b')
        && !geminiRunArgs({}).includes('--include-directories'));
    ok('the documented exit codes are named, so "you asked wrong" is not read as "it broke"',
        GEMINI_EXIT.badInput === 42 && GEMINI_EXIT.turnLimit === 53);
}

// ---------------------------------------------------------------------------
// ‼️ THE DISPATCH — the actual bug F-01 named
// ---------------------------------------------------------------------------
{
    const t = turnArgs('gemini', { model: 'm', effort: 'high', permissionMode: 'plan' });
    ok('‼️ turnArgs("gemini") produces GEMINI argv, not codex exec',
        t.join(' ').includes('--output-format stream-json')
        && !t.includes('exec') && !t.join(' ').includes('--skip-git-repo-check'));
    ok('‼️ …and the effort carried in from another engine\'s picker is DROPPED here, '
        + 'in one place, rather than sent to a CLI that exits 42 on it',
        !t.includes('--effort') && !t.includes('high'));

    const r = runArgs('gemini', { model: 'm' });
    ok('runArgs("gemini") too', r.join(' ').includes('--output-format json') && !r.includes('exec'));
    const u = tuiArgs('gemini', { model: 'm' });
    ok('tuiArgs("gemini") too', !u.includes('exec') && !u.includes('-s'));

    ok('…while Codex still gets Codex\'s own vocabulary',
        turnArgs('codex', {}).includes('exec') && runArgs('codex', {}).includes('exec'));
    ok('…and Antigravity still gets its own',
        turnArgs('agy', {}).join(' ').includes('--print-timeout'));

    ok('‼️ the permission NOTE is the engine\'s own, not Codex\'s sandbox sentence',
        /approval|deny|plan/i.test(engineModeNote('gemini', 'default'))
        && engineModeNote('gemini', 'default') !== engineModeNote('codex', 'default'));
    ok('‼️ …and plan mode says the thing that would otherwise be found out by a diff: '
        + 'unattended, LEAVING plan mode switches this engine to yolo',
        /yolo/i.test(geminiModeNote('plan')));

    ok('effort is a per-engine capability, asked rather than assumed',
        engineTakesEffort('claude') && engineTakesEffort('codex') && engineTakesEffort('agy')
        && !engineTakesEffort('gemini'));
    ok('‼️ a first prompt is a FLAG here, not a positional — the help says otherwise '
        + 'and the code decides headless on a positional query',
        engineFirstPromptFlag('gemini').join('') === '-i'
        && engineFirstPromptFlag('agy').join('') === '-i'
        && engineFirstPromptFlag('codex').length === 0);
    ok('‼️ the up-front permission setting is NAMED by the engine that has one',
        enginePermissionSetting('codex', 'plan').label === 'Sandbox'
        && enginePermissionSetting('gemini', 'plan').label === 'Approval mode'
        && enginePermissionSetting('agy', 'plan') === undefined);
    ok('the engine row records what was measured about resuming and about cost',
        ENGINES.gemini.resumeInTerminal === true
        && ENGINES.gemini.promptOn === 'stdin'
        && ENGINES.gemini.reportsCost === false
        && ENGINES.gemini.costSource === 'tokens');
}

// ---------------------------------------------------------------------------
// the protocol — a real turn's events, in the order the CLI emits them
// ---------------------------------------------------------------------------
const TURN = [
    { type: 'init', timestamp: 't0', session_id: 'sess-1', model: 'gemini-3-pro-preview' },
    { type: 'message', timestamp: 't1', role: 'user', content: 'say ok and read a file' },
    { type: 'message', timestamp: 't2', role: 'assistant', content: 'O', delta: true },
    { type: 'message', timestamp: 't3', role: 'assistant', content: 'K', delta: true },
    {
        type: 'tool_use', timestamp: 't4', tool_name: 'run_shell_command',
        tool_id: 'call-1', parameters: { command: 'echo hi' }
    },
    { type: 'tool_result', timestamp: 't5', tool_id: 'call-1', status: 'success', output: 'hi' },
    { type: 'error', timestamp: 't6', severity: 'warning', message: 'a model was swapped' },
    {
        type: 'result', timestamp: 't7', status: 'success',
        stats: {
            total_tokens: 26000, input_tokens: 25000, output_tokens: 400,
            cached: 20000, input: 0, duration_ms: 1780, tool_calls: 1, models: {}
        }
    }
];

const drive = (lines, state = newGeminiState()) => {
    const out = [];
    for (const l of lines) {
        const t = translateGemini(state, l, { model: 'asked-for' });
        state = t.state;
        out.push(...t.events);
    }
    return { state, events: out };
};

{
    const { state, events } = drive(TURN);
    const kinds = events.map(e => e.type);
    ok('init becomes the reducer\'s system:init, carrying the engine\'s OWN id',
        events[0].type === 'system' && events[0].subtype === 'init'
        && events[0].session_id === 'sess-1');
    ok('…and the engine\'s own model beats the one the caller asked for',
        events[0].model === 'gemini-3-pro-preview');
    ok('the state remembers the conversation, which is what resumes it',
        state.sessionId === 'sess-1');

    ok('‼️ the user message is NOT re-emitted — the Console already drew it',
        !events.some(e => e.type === 'assistant'
            && (e.message.content[0] || {}).text === 'say ok and read a file'));

    const texts = events.filter(e => e.type === 'assistant'
        && (e.message.content[0] || {}).type === 'text').map(e => e.message.content[0].text);
    ok('‼️ deltas are accumulated and flushed ONCE, as one reply',
        texts.length === 1 && texts[0] === 'OK');

    const toolUse = events.find(e => e.type === 'assistant'
        && (e.message.content[0] || {}).type === 'tool_use');
    ok('a tool call is drawn in the vocabulary the panel already has',
        toolUse && toolUse.message.content[0].name === 'Bash'
        && toolUse.message.content[0].input.command === 'echo hi');
    const toolRes = events.find(e => e.type === 'user');
    ok('…and its result is matched to it by a TURN-NAMESPACED id',
        toolRes && toolRes.message.content[0].tool_use_id === toolUse.message.content[0].id
        && /^t1-/.test(toolUse.message.content[0].id));

    ok('‼️ a WARNING is not the end of the turn — only severity:error is',
        kinds.filter(k => k === 'result').length === 1
        && events[events.length - 1].subtype === 'success');

    const usage = events.filter(e => e.type === 'assistant' && e.message.usage)[0].message.usage;
    ok('‼️ the cached share is SUBTRACTED from the input (it is included on the wire)',
        usage.input_tokens === 5000 && usage.cache_read_input_tokens === 20000);
    ok('‼️ …and the buckets sum to the engine\'s OWN total, so the thinking the stream '
        + 'does not itemise is reported rather than dropped',
        usage.input_tokens + usage.cache_read_input_tokens + usage.output_tokens === 26000
        && usage.output_tokens === 400 + 600);
    ok('…and that unitemised remainder is also readable on its own',
        geminiUnitemisedTokens(TURN[7].stats) === 600);
    ok('there is no cache-creation bucket on this engine, and it says zero rather than guessing',
        usage.cache_creation_input_tokens === 0);
    ok('‼️ a turn carries NO price — a zero would read as "free"',
        events[events.length - 1].total_cost_usd === undefined);
}

// ‼️ THE MEASUREMENT THAT WOULD HAVE BEEN COPIED WRONG FROM CODEX.
{
    // Two turns of ONE conversation. Each `result` reports that PROCESS's own
    // usage, because a resume restores the history and not the telemetry — so a
    // running-total subtraction (which is right for Codex) would report the
    // second turn as zero.
    const first = drive(TURN);
    const second = drive([
        { type: 'init', timestamp: 'u0', session_id: 'sess-1', model: 'm' },
        { type: 'message', timestamp: 'u1', role: 'assistant', content: 'again' },
        {
            type: 'result', timestamp: 'u2', status: 'success',
            stats: { total_tokens: 900, input_tokens: 800, output_tokens: 100, cached: 0 }
        }
    ], first.state);
    const u = second.events.filter(e => e.type === 'assistant' && e.message.usage)[0].message.usage;
    ok('‼️ a SECOND turn reports its own usage, NOT a delta against the first',
        u.input_tokens === 800 && u.output_tokens === 100);
    ok('…and the state carries no running total to subtract from',
        second.state.spent === undefined);
    ok('…while the turn counter still advances, so tool ids stay unique across turns',
        second.state.turn === 2);
}

// a failed turn, and an error that really is one
{
    const { events } = drive([
        { type: 'init', session_id: 's', model: 'm' },
        { type: 'error', severity: 'error', message: 'quota exhausted for this project' }
    ]);
    const res = events[events.length - 1];
    ok('a severity:error ends the turn with the ENGINE\'S OWN WORDS',
        res.type === 'result' && res.is_error === true
        && res.error === 'quota exhausted for this project');

    const failed = drive([
        { type: 'init', session_id: 's', model: 'm' },
        { type: 'result', status: 'error', error: { message: 'model refused' }, stats: {} }
    ]).events;
    ok('…and a result that says it failed is a failure, not a success with a note',
        failed[failed.length - 1].is_error === true);
}

// tool naming, so the step icons and the "where did this turn go" figures mean
// the same thing on this engine as on the other three
{
    ok('the built-in tools map onto the names stepKindForTool already reads',
        geminiToolName('read_file') === 'Read'
        && geminiToolName('write_file') === 'Write'
        && geminiToolName('replace') === 'Edit'
        && geminiToolName('run_shell_command') === 'Bash'
        && geminiToolName('google_web_search') === 'WebSearch'
        && geminiToolName('web_fetch') === 'WebFetch'
        && geminiToolName('search_file_content') === 'Grep');
    ok('…an MCP call keeps its prefix, because that is what marks it as leaving the machine',
        geminiToolName('mcp__srv__do') === 'mcp__srv__do'
        && geminiStepKind('mcp__srv__do') === 'mcp');
    ok('…web traffic is counted as web, everything unknown as local',
        geminiStepKind('google_web_search') === 'web'
        && geminiStepKind('web_fetch') === 'web'
        && geminiStepKind('something_new') === 'local');
    ok('…and a row says what the call is DOING',
        geminiToolDetail('run_shell_command', { command: 'ls -la' }) === 'ls -la'
        && geminiToolDetail('read_file', { absolute_path: '/tmp/x' }) === '/tmp/x');
    ok('a line that is not an object, or a type nobody measured, produces nothing',
        drive([null, 'x', { type: 'who_knows' }]).events.length === 0);
    ok('usage of an absent stats block is zeros, not NaN',
        geminiUsage(undefined).input_tokens === 0 && geminiUsage({}).output_tokens === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
