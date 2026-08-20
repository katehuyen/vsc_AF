// The Antigravity adaptor and its command line, fed the lines a real `agy` run
// actually produced.
//
// ‼️ THE FIXTURE IS A TRANSCRIPT, NOT A SKETCH. Every line below was captured
// from `agy --output-format stream-json` on this machine on 2026-08-10 (agy
// 1.1.11, signed in through the Antigravity app, no API key anywhere). That
// matters more here than anywhere else in the suite: an adaptor written against
// imagined field names passes its own tests perfectly and produces an empty
// Console against the real binary.
//
// What is asserted is the part a regex over the source cannot see:
//
//   * the `result` usage is the SUM of the steps' usage, so counting both would
//     double every turn — the steps are counted and the result is not;
//   * `input_tokens` does NOT include the cached share here (the opposite of
//     Codex), so applying Codex's subtraction would undercount instead of fix;
//   * reply text arrives as DELTAS on one step and has to be accumulated;
//   * a turn has no price, so `result` carries no cost rather than a zero;
//   * `--effort` and an effort-bearing model name are refused TOGETHER by the
//     CLI, so the builder must never emit both.
const path = require('path');
const A = require(path.join(__dirname, '..', 'out', 'core', 'agyproto.js'));
const G = require(path.join(__dirname, '..', 'out', 'core', 'agy.js'));
const E = require(path.join(__dirname, '..', 'out', 'core', 'consoleEngine.js'));
const M = require(path.join(__dirname, '..', 'out', 'core', 'models.js'));
const P = require(path.join(__dirname, '..', 'out', 'core', 'consoleproto.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const step = (o) => ({ event: 'step_update', step_update: { conversation_id: 'a890b076', ...o } });

/** Captured verbatim — a turn that talked, ran a command, and answered. */
const REAL = [
    {
        event: 'init', conversation_id: 'f2bf1327-2303-431e-aac4-f3b03f4950e7',
        init: {
            model: 'gemini-3.6-flash-low', cwd: 'D:\\zone\\dev\\git\\miropharm\\vsc_AgentFarm',
            tools: ['run_command', 'view_file'], permission_mode: 'always-proceed'
        }
    },
    step({ step_index: 0, state: 'DONE', step_type: 'user_input' }),
    step({ step_index: 1, state: 'DONE', step_type: 'unknown', duration_seconds: 0.0015 }),
    step({
        step_index: 2, state: 'DONE', step_type: 'agent_response', duration_seconds: 3.4,
        usage: {
            input_tokens: 17456, output_tokens: 69, thinking_tokens: 0,
            cache_read_tokens: 8158, total_tokens: 17525
        }
    }),
    step({
        step_index: 3, state: 'ACTIVE', step_type: 'tool', tool_name: 'run_command',
        tool_info: { name: 'run_command', parameters: { CommandLine: 'echo merhaba' } }
    }),
    step({
        step_index: 3, state: 'DONE', step_type: 'tool', tool_name: 'run_command',
        duration_seconds: 1.03,
        tool_info: { name: 'run_command', parameters: { CommandLine: 'echo merhaba' }, output: 'merhaba\r\n' }
    }),
    step({
        step_index: 4, state: 'DONE', step_type: 'checkpoint', duration_seconds: 0.92,
        usage: {
            input_tokens: 117, output_tokens: 5, thinking_tokens: 0,
            cache_read_tokens: 0, total_tokens: 122
        }
    }),
    step({ step_index: 5, state: 'ACTIVE', step_type: 'agent_response', text_delta: 'OK' }),
    step({
        step_index: 5, state: 'DONE', step_type: 'agent_response', text_delta: '\n',
        duration_seconds: 1.78,
        usage: {
            input_tokens: 2413, output_tokens: 59, thinking_tokens: 12,
            cache_read_tokens: 24444, total_tokens: 2472
        }
    }),
    {
        event: 'result',
        result: {
            conversation_id: 'f2bf1327-2303-431e-aac4-f3b03f4950e7', status: 'SUCCESS',
            response: 'OK\n', duration_seconds: 21.85, num_turns: 1,
            // The SUM of the three usages above — this is the trap.
            usage: {
                input_tokens: 19986, output_tokens: 133, thinking_tokens: 12,
                cache_read_tokens: 32602, total_tokens: 20119
            }
        }
    }
];

function runAll(lines) {
    let state = A.newAgyState();
    const events = [];
    for (const line of lines) {
        const t = A.translateAgy(state, line, { model: 'asked-for' });
        state = t.state;
        events.push(...t.events);
    }
    return { state, events };
}

// ---------- the whole turn, end to end ----------
{
    const { state, events } = runAll(REAL);
    const init = events.find(e => e.type === 'system');
    ok('the conversation id becomes the session id', init && init.session_id === 'f2bf1327-2303-431e-aac4-f3b03f4950e7');
    // ‼️ The engine NAMES the model it used; Codex never does. So its answer
    // wins over what the caller asked for.
    ok('‼️ …and the model is the engine\'s own answer, not what we asked for',
        init && init.model === 'gemini-3.6-flash-low');
    ok('the state remembers the conversation, for the next turn to resume',
        state.conversationId === 'f2bf1327-2303-431e-aac4-f3b03f4950e7' && state.turn === 1);
    ok('the turn is over and nothing is left open',
        !state.running && Object.keys(state.open).length === 0 && Object.keys(state.text).length === 0);

    const text = events.filter(e => e.type === 'assistant'
        && (e.message.content || []).some(c => c.type === 'text'));
    // ‼️ THE DELTAS ARE ONE REPLY. "OK" arrived on the ACTIVE step and "\n" on
    // the DONE one; two rows in the panel for one sentence would be the bug.
    ok('‼️ text deltas are accumulated into ONE assistant message',
        text.length === 1 && text[0].message.content[0].text === 'OK\n');

    const tool = events.find(e => e.type === 'assistant'
        && (e.message.content || []).some(c => c.type === 'tool_use'));
    ok('a tool step becomes a tool_use in Claude\'s own vocabulary',
        tool && tool.message.content[0].name === 'Bash'
        && tool.message.content[0].input.command === 'echo merhaba');
    const result = events.find(e => e.type === 'user'
        && (e.message.content || []).some(c => c.type === 'tool_result'));
    ok('…and its output comes back as the tool result',
        result && result.message.content[0].content === 'merhaba\r\n'
        && result.message.content[0].is_error === false);
    // The turn is namespaced into the id, or the next turn's `step_index: 3`
    // would overwrite this one.
    ok('‼️ the tool id carries the turn, because step_index starts again',
        tool.message.content[0].id === 't1-s3');

    const end = events.filter(e => e.type === 'result');
    ok('the turn ends exactly once', end.length === 1 && end[0].subtype === 'success');
    // ‼️ Zero would read as "that turn was free". This engine states no price.
    ok('‼️ no dollar figure is invented for an engine that states none',
        !('total_cost_usd' in end[0]));
}

// ---------- the counting, which is where the two engines differ most ----------
{
    const { events } = runAll(REAL);
    const usages = events.filter(e => e.type === 'assistant' && e.message.usage).map(e => e.message.usage);
    ok('every step that reported tokens carries them, including the checkpoint',
        usages.length === 3);
    const sum = usages.reduce((a, u) => ({
        input: a.input + u.input_tokens,
        cached: a.cached + u.cache_read_input_tokens,
        out: a.out + u.output_tokens
    }), { input: 0, cached: 0, out: 0 });
    // ‼️ THE MEASURED SUM. 17456 + 117 + 2413, and the `result` block repeats it —
    // which is why the result carries none.
    ok('‼️ the steps add up to what the run reported, counted ONCE',
        sum.input === 19986 && sum.cached === 32602 && sum.out === 133);
    ok('‼️ …so the result event contributes no usage at all',
        !events.filter(e => e.type === 'result').some(e => e.usage));
}

// ---------- the usage mapping itself ----------
{
    // ‼️ NOTHING IS SUBTRACTED. Codex's `input_tokens` includes the cached share
    // and has to be split; this engine reports them side by side, exactly as
    // Claude does. Applying the Codex correction here would UNDERCOUNT.
    const u = A.agyUsage({
        input_tokens: 17456, output_tokens: 69, thinking_tokens: 40,
        cache_read_tokens: 8158, total_tokens: 17525
    });
    ok('‼️ the fresh input passes through unchanged — no cache subtraction',
        u.input_tokens === 17456 && u.cache_read_input_tokens === 8158);
    // Thinking is INSIDE output (measured: output 151, thinking 146).
    ok('‼️ thinking is not added to output — it is already in it', u.output_tokens === 69);
    ok('…and it is still reported on its own, for "what did the thinking cost"',
        A.agyThinkingTokens({ thinking_tokens: 40 }) === 40);
}

// ---------- failures keep the engine's own words ----------
{
    const t = A.translateAgy(A.newAgyState(), {
        event: 'result',
        result: {
            conversation_id: '', status: 'ERROR', response: '',
            error: 'invalid model selection (--model "gemini-3.6-flash-low" --effort "medium"): '
                + '--model gemini-3.6-flash-low conflicts with --effort=medium'
        }
    });
    const ev = t.events[0];
    ok('a failed turn is an error result, not a success with no text',
        ev.type === 'result' && ev.is_error === true);
    // ‼️ "conflicts with --effort=medium" names the flag. A tidied "the turn
    // failed" throws away the only sentence that fixes it.
    ok('‼️ …carrying the engine\'s own sentence, whole', /conflicts with --effort=medium/.test(ev.error));
    // ‼️ K-27 — …and it is a FAILURE, not something a person did. The adaptor
    // used to reach for Claude Code's `error_during_execution`, whose one
    // meaning in that contract is "the user stopped it".
    ok('‼️ K-27 — a turn the engine failed is not reported as interrupted',
        ev.interrupted === false && ev.subtype !== 'error_during_execution');
}

// ---------- K-27: a tool that failed inside a turn the agent finished ----------
{
    // Measured over this machine's own Antigravity conversations: 25 of 67 turns
    // came back not-SUCCESS and every one of them carried a TOOL's complaint —
    // 14× `exec: "grep": executable file not found in %PATH%` — with the agent's
    // reply already written. Nobody had pressed anything, and the strip above
    // the composer said `⎋ last turn interrupted` on all 25.
    const GREP = 'exec: "grep": executable file not found in %PATH%';
    let s = A.translateAgy(A.newAgyState(), { event: 'init', conversation_id: 'c1', init: {} }).state;
    ok('a fresh turn has said nothing yet', s.said === false);
    s = A.translateAgy(s, step({
        step_index: 2, state: 'DONE', step_type: 'agent_response',
        text_delta: 'grep yoktu, Select-String ile baktım — dosya duruyor.'
    })).state;
    ok('…and the reply is remembered as an answer having been given', s.said === true);
    const t = A.translateAgy(s, {
        event: 'result',
        result: { conversation_id: 'c1', status: 'ERROR', error: GREP }
    });
    const ev = t.events.find(e => e.type === 'result');
    ok('‼️ K-27 — a turn that ANSWERED closes as a success, whatever a tool did',
        ev.is_error === false && ev.subtype === 'success' && ev.interrupted === false);
    ok('…and the tool\'s complaint is still carried, as a warning', ev.warning === GREP);
    ok('…and the next turn starts having said nothing again', t.state.said === false);

    // The same failure with nothing to show for it really did fail.
    const silent = A.translateAgy(
        { ...A.newAgyState(), turn: 1, said: false },
        { event: 'result', result: { conversation_id: 'c1', status: 'ERROR', error: GREP } }
    ).events.find(e => e.type === 'result');
    ok('…while a turn that produced nothing is a failure, in the engine\'s words',
        silent.is_error === true && silent.interrupted === false && silent.error === GREP);
}

// ---------- K-27: and what the Console makes of both ----------
{
    const GREP = 'exec: "grep": executable file not found in %PATH%';
    const run = (evts) => {
        let s = P.newSessionState({ id: 'c', agentId: 'a', agentName: 'dev', cwd: '.', now: 1000 });
        s = { ...s, status: 'working', turnStartedAt: 1000 };
        for (const e of evts) { s = P.reduceEvent(s, e, 2000).state; }
        return s;
    };
    const answered = run([{
        type: 'result', subtype: 'success', is_error: false, interrupted: false, warning: GREP
    }]);
    ok('‼️ K-27 — the strip no longer says a turn nobody touched was interrupted',
        answered.lastTurn.outcome === 'done');
    ok('…and the closing line still carries the tool\'s complaint',
        answered.messages[answered.messages.length - 1].text === GREP);
    const failed = run([{
        type: 'result', subtype: 'error', is_error: true, interrupted: false,
        error: GREP, result: GREP
    }]);
    ok('…a turn with nothing to show for it is failed, not interrupted',
        failed.lastTurn.outcome === 'failed');
    const stopped = run([{
        type: 'result', subtype: 'error_during_execution', is_error: true, result: 'stopped'
    }]);
    ok('‼️ …and Claude\'s own word for a Stop still means a Stop',
        stopped.lastTurn.outcome === 'interrupted');
    const saidStop = run([{
        type: 'result', subtype: 'anything', is_error: true, interrupted: true, result: 'cancelled'
    }]);
    ok('…as does an engine that says so outright, whatever it calls the subtype',
        saidStop.lastTurn.outcome === 'interrupted');
}

// ---------- the shapes nobody measured are skipped, never guessed ----------
{
    ok('a line that is not an object produces nothing', A.translateAgy(A.newAgyState(), 'hello').events.length === 0);
    ok('an event this adaptor does not know produces nothing',
        A.translateAgy(A.newAgyState(), { event: 'something.new' }).events.length === 0);
    // Measured: `error_message` has arrived carrying no message at all. A row
    // reading "the step failed" with nothing behind it is noise in a transcript.
    ok('‼️ an empty error_message step draws no row',
        A.translateAgy(A.newAgyState(), step({ step_index: 6, state: 'DONE', step_type: 'error_message' })).events.length === 0);
}

// ---------- a step that completes without ever having started ----------
{
    const t = A.translateAgy({ ...A.newAgyState(), turn: 1 }, step({
        step_index: 9, state: 'DONE', step_type: 'tool', tool_name: 'view_file',
        tool_info: { name: 'view_file', parameters: { AbsolutePath: 'D:\\a\\package.json' }, output: '{}' }
    }));
    const kinds = t.events.map(e => e.type);
    ok('‼️ the call is drawn even when only its completion was seen',
        kinds[0] === 'assistant' && kinds[1] === 'user');
    ok('…and a reading tool names the file it touched',
        t.events[0].message.content[0].input.file_path === 'D:\\a\\package.json');
}

// ---------- the tool names, chosen for what the step kinds make of them ----------
{
    const name = (o) => A.agyToolName(o);
    ok('a shell step reads as local work', name({ tool_name: 'run_command' }) === 'Bash');
    ok('a web search reads as web traffic', A.agyStepKind({ tool_name: 'search_web' }) === 'web');
    // ‼️ Driving a page is traffic leaving this machine and is counted as such.
    ok('‼️ …and so does driving a browser, which is what it actually is',
        A.agyStepKind({ tool_name: 'browser_click_element' }) === 'web');
    // ‼️ The `mcp__` PREFIX is what marks a call as leaving the machine.
    ok('‼️ an MCP call is rebuilt with the prefix the step kinds read',
        name({ tool_name: 'call_mcp_tool', tool_info: { parameters: { ServerName: 'obsidian', ToolName: 'vault_read' } } })
        === 'mcp__obsidian__vault_read'
        && A.agyStepKind({ tool_name: 'call_mcp_tool', tool_info: { parameters: { ServerName: 'obsidian', ToolName: 'vault_read' } } }) === 'mcp');
    // The mapping is a CATEGORY decision, not a rename the user agreed to.
    ok('‼️ the engine\'s own tool name survives in the row\'s detail',
        /browser_click_element/.test(A.agyToolDetail({ tool_name: 'browser_click_element', tool_info: { parameters: { Url: 'https://x' } } })));
    ok('a tool nobody has mapped keeps its own name and is read as local',
        name({ tool_name: 'delete_knowledge' }) === 'delete_knowledge'
        && A.agyStepKind({ tool_name: 'delete_knowledge' }) === 'local');
}

// ---------- the events survive the real reducer ----------
{
    const { events } = runAll(REAL);
    let s = P.newSessionState({ id: 'x', agentId: 'a', agentName: 'A', cwd: '.', now: 1 });
    for (const ev of events) { s = P.reduceEvent(s, ev, 2).state; }
    ok('‼️ the translated stream drives the SAME reducer Claude\'s does',
        s.sessionId === 'f2bf1327-2303-431e-aac4-f3b03f4950e7' && s.tokens > 0);
    ok('…and the reply is in the conversation',
        s.messages.some(m => m.role === 'agent' && /OK/.test(m.text || '')));
}

// ---------- the command line ----------
{
    const args = G.agyArgs({ model: 'gemini-3.6-flash', effort: 'medium', cwd: 'D:\\repo' });
    ok('a hosted turn asks for the event stream', args.join(' ').includes('--output-format stream-json'));
    // ‼️ Without this the agent works in ~/.gemini/antigravity-cli/scratch and
    // answers about the wrong folder — measured, and the single most important
    // flag on this engine.
    ok('‼️ …and is told which folder it may actually see',
        args.includes('--add-dir') && args[args.indexOf('--add-dir') + 1] === 'D:\\repo');
    // ‼️ The default is five minutes; a turn that thinks for six would simply stop.
    ok('‼️ …and states its own print timeout rather than inheriting a 5-minute one',
        args.includes('--print-timeout'));
    ok('the model and effort are separate axes when the model has no effort in it',
        args.includes('--model') && args.includes('--effort'));

    // ‼️ THE CONFLICT THE CLI REFUSES: `--model gemini-3.6-flash-low --effort medium`
    // exits 1. A setting stored before the catalog existed can still hold that name.
    const stale = G.agyArgs({ model: 'gemini-3.6-flash-low', effort: 'medium' });
    ok('‼️ …and NEVER both when the model name already carries one',
        stale.includes('--model') && !stale.includes('--effort'));
    ok('an effort with no model at all is not sent — the default model may not have it',
        !G.agyArgs({ effort: 'medium' }).includes('--effort'));

    const resumed = G.agyArgs({ conversation: 'abc', cwd: 'D:\\repo' });
    ok('a later turn resumes the conversation by id',
        resumed.includes('--conversation') && resumed[resumed.indexOf('--conversation') + 1] === 'abc');

    ok('bypassPermissions becomes the flag that means it',
        G.agyModeArgs('bypassPermissions').join(' ') === '--dangerously-skip-permissions');
    ok('plan and acceptEdits become this engine\'s own words',
        G.agyModeArgs('plan').join(' ') === '--mode plan'
        && G.agyModeArgs('acceptEdits').join(' ') === '--mode accept-edits');
    ok('a mode with no equivalent adds no flag rather than a guessed one',
        G.agyModeArgs('dontAsk').length === 0 && G.agyModeArgs('').length === 0);
    // ‼️ MEASURED: `--mode plan` did NOT stop a write. Every picker says so.
    ok('‼️ the mode note refuses to promise a restraint the engine does not keep',
        /Antigravity app/.test(G.agyModeNote('plan')) && /still wrote a file/.test(G.agyModeNote('plan')));

    // A headless task wants one envelope a person can read, not an event log.
    ok('an unattended run asks for the json envelope instead',
        G.agyRunArgs({}).join(' ').includes('--output-format json'));
}

// ---------- the dispatch: one call site, whichever engine it is ----------
{
    ok('the transport knows where this engine\'s prompt travels',
        E.ENGINES.agy.promptOn === 'argv' && E.ENGINES.codex.promptOn === 'stdin');
    // ‼️ A multi-line prompt in argv does not survive cmd.exe.
    ok('‼️ …and therefore that it is spawned without a shell',
        E.ENGINES.agy.spawnShell === false && E.ENGINES.codex.spawnShell === true);
    // ‼️ Codex resume is a subcommand with its own vocabulary; this one is a flag.
    ok('‼️ …and that a terminal CAN resume it, unlike Codex',
        E.ENGINES.agy.resumeInTerminal === true && E.ENGINES.codex.resumeInTerminal === false);
    ok('turnArgs asks the right vocabulary for the right engine',
        E.turnArgs('agy', { thread: 'abc' }).includes('--conversation')
        && E.turnArgs('codex', { thread: 'abc' }).includes('resume'));
    ok('an unknown engine still means claude, as it always has',
        E.engineOf('nonsense').id === 'claude');
    // The label is the product's, and it is not "Gemini" — that row is a
    // different program that is not installed here.
    ok('‼️ the engine is called Antigravity, not Gemini',
        E.ENGINES.agy.label === 'Antigravity' && E.ENGINES.gemini.label === 'Gemini');
}

// ---------- the catalog: a list of combinations, split back into axes ----------
{
    // Captured verbatim from `agy models` (stdout only — the banner is stderr).
    const REAL_CATALOG = [
        'gemini-3.6-flash-high\tGemini 3.6 Flash (High)',
        'gemini-3.6-flash-medium\tGemini 3.6 Flash (Medium)',
        'gemini-3.6-flash-low\tGemini 3.6 Flash (Low)',
        'gemini-3.1-pro-high\tGemini 3.1 Pro (High)',
        'gemini-3.1-pro-low\tGemini 3.1 Pro (Low)',
        'claude-sonnet-4-6\tClaude Sonnet 4.6 (Thinking)',
        'claude-opus-4-6-thinking\tClaude Opus 4.6 (Thinking)',
        'gpt-oss-120b-medium\tGPT-OSS 120B (Medium)'
    ].join('\n');
    const cat = M.readAgyCatalog(REAL_CATALOG);
    const ids = cat.models.map(m => m.id);
    ok('the eight rows collapse into the models they actually are',
        ids.join(',') === ',gemini-3.6-flash,gemini-3.1-pro,claude-sonnet-4-6,claude-opus-4-6-thinking,gpt-oss-120b');
    // ‼️ THE CROSS-CHECK. The CLI's own refusal says "gemini-3.1-pro has no
    // 'medium' effort (available: low, high)" — and this parser derives exactly
    // that from the list alone, which is what makes the split a measurement
    // rather than a guess.
    // The efforts a model really offers are everything after the leading
    // default row, which is a resolved value rather than a choice of its own.
    const offered = m => cat.efforts[m].slice(1).map(e => e.id).join(',');
    ok('‼️ …each with the effort vocabulary the CLI itself reports',
        offered('gemini-3.1-pro') === 'high,low'
        && offered('gemini-3.6-flash') === 'high,medium,low');
    // ‼️ X-26 — AND THE FIRST ROW IS NOT AN EMPTY ONE. A base this parser
    // derived is not selectable on its own: measured, `--model gemini-3.6-flash`
    // with no effort comes back *requires --effort (available: low, medium,
    // high)* and the turn dies before it starts. So "Default" here has to NAME
    // the effort it sends, or the box is offering a command line the CLI
    // refuses — which is exactly how the bug reached a user.
    ok('‼️ a model that requires an effort has no empty default',
        cat.efforts['gemini-3.6-flash'][0].id === 'medium'
        && /Default → medium/.test(cat.efforts['gemini-3.6-flash'][0].label)
        // no middle setting on pro: low, high — so Default is the cheaper end
        && cat.efforts['gemini-3.1-pro'][0].id === 'low'
        && cat.efforts['gemini-3.6-flash'].every(e => e.id !== ''));
    // ‼️ `-thinking` is not an effort and `(Thinking)` is not one either;
    // requiring BOTH halves to agree is what keeps a model from being lost.
    ok('‼️ a suffix that is not an effort is left alone',
        ids.includes('claude-opus-4-6-thinking') && cat.efforts['claude-opus-4-6-thinking'].length === 1);
    // …and the mirror still holds: a model with NO efforts takes no flag, so
    // its single row is genuinely empty and must stay that way.
    ok('…and a model with no effort offers an empty box, not the generic list',
        cat.efforts['claude-sonnet-4-6'].map(e => e.id).join(',') === '');
    ok('a model with exactly one effort still states it',
        offered('gpt-oss-120b') === 'medium' && cat.efforts['gpt-oss-120b'][0].id === 'medium');
    ok('an unreadable catalog is undefined rather than an empty picker',
        M.readAgyCatalog('') === undefined && M.readAgyCatalog('no tabs here') === undefined);
}

// ---------- and the matrix says where each list came from ----------
{
    const probe = {
        readHome: () => undefined, existsHome: () => false,
        which: () => undefined, hasSecret: () => false, hasEnv: () => false
    };
    const withCat = M.readEngineModels(probe, ['sonnet'], {
        text: 'gemini-3.6-flash-low\tGemini 3.6 Flash (Low)', fetchedAt: Date.now()
    });
    ok('a fetched catalog is reported as the engine\'s own answer',
        withCat.agy.source === 'catalog' && /agy models/.test(withCat.agy.note));
    const without = M.readEngineModels(probe, ['sonnet']);
    // ‼️ A Claude alias silently offered for Antigravity is the bug this whole
    // module exists to end, so the fallback SAYS it is a fallback.
    ok('‼️ …and a list that is not the engine\'s says so loudly',
        without.agy.source === 'settings' && /almost certainly wrong/.test(without.agy.note));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
