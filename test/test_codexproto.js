// The Codex adaptor, fed the lines a real Codex run actually produced.
//
// ‼️ THE FIXTURE IS A TRANSCRIPT, NOT A SKETCH. Every line below was captured
// from `codex exec --json` on this machine on 2026-08-10 (codex-cli 0.147.0,
// signed in with a ChatGPT plan, no API key). That matters more here than
// anywhere else in the suite: an adaptor written against imagined field names
// passes its own tests perfectly and produces an empty Console against the real
// binary, which is exactly the failure this file exists to make impossible.
//
// What is asserted is the part a regex over the source cannot see: that the
// events come out in the vocabulary `reduceEvent` already understands, that the
// numbers survive the trip, and that the two places Codex genuinely differs from
// Claude are handled rather than papered over —
//
//   * usage arrives ONCE, at the end of a turn, and `input_tokens` INCLUDES the
//     cached share, so it has to be split or every turn counts its context twice;
//   * a turn has no price, so `result` carries no cost rather than a zero that
//     would read as "free".
const path = require('path');
const C = require(path.join(__dirname, '..', 'out', 'core', 'codexproto.js'));
const P = require(path.join(__dirname, '..', 'out', 'core', 'consoleproto.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

/** Captured verbatim — a turn that talked, ran a command, and answered. */
const REAL = [
    { type: 'thread.started', thread_id: '019fe7bc-545c-70d2-b96f-d82d41da54bb' },
    { type: 'turn.started' },
    {
        type: 'item.completed',
        item: { id: 'item_0', type: 'agent_message', text: 'I’ll inspect the directory with PowerShell and read `note.txt`.' }
    },
    {
        type: 'item.started',
        item: {
            id: 'item_1', type: 'command_execution',
            command: '"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "Get-ChildItem -Force"',
            aggregated_output: '', exit_code: null, status: 'in_progress'
        }
    },
    {
        type: 'item.completed',
        item: {
            id: 'item_1', type: 'command_execution',
            command: '"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "Get-ChildItem -Force"',
            aggregated_output: 'Mode Length LastWriteTime Name\r\n-a---- 26 note.txt\r\nhello from agent farm\r\n',
            exit_code: 0, status: 'completed'
        }
    },
    {
        type: 'item.completed',
        item: { id: 'item_2', type: 'agent_message', text: '`note.txt` contains: “hello from agent farm”.' }
    },
    {
        type: 'turn.completed',
        usage: {
            input_tokens: 28874, cached_input_tokens: 25088,
            cache_write_input_tokens: 0, output_tokens: 135, reasoning_output_tokens: 0
        }
    }
];

/** Run a whole stream through the adaptor and collect what came out. */
function translateAll(lines, opts) {
    let st = C.newCodexState();
    const out = [];
    for (const line of lines) {
        const r = C.translateCodex(st, line, opts || {});
        st = r.state;
        out.push(...r.events);
    }
    return { state: st, events: out };
}

// ---------- the vocabulary ----------
{
    const { state, events } = translateAll(REAL, { model: 'gpt-5-codex' });

    const init = events.find(e => e.type === 'system' && e.subtype === 'init');
    ok('the thread id becomes the session id', init && init.session_id === '019fe7bc-545c-70d2-b96f-d82d41da54bb');
    ok('…and the model asked for is passed through, because the stream never names it',
        init && init.model === 'gpt-5-codex');
    ok('the adaptor remembers the thread', state.threadId === '019fe7bc-545c-70d2-b96f-d82d41da54bb');
    ok('and which turn it is on', state.turn === 1);

    const texts = events.filter(e => e.type === 'assistant')
        .flatMap(e => (e.message.content || []).filter(b => b.type === 'text'));
    ok('what the agent said comes through as assistant text', texts.length === 2
        && /inspect the directory/.test(texts[0].text));

    const calls = events.filter(e => e.type === 'assistant')
        .flatMap(e => (e.message.content || []).filter(b => b.type === 'tool_use'));
    ok('a command is a tool call', calls.length === 1 && calls[0].name === 'Bash');
    ok('…carrying the command itself, which is what the row shows',
        /powershell\.exe/.test(calls[0].input.command));

    const results = events.filter(e => e.type === 'user')
        .flatMap(e => (e.message.content || []).filter(b => b.type === 'tool_result'));
    ok('…and its output comes back as a tool result', results.length === 1
        && /hello from agent farm/.test(results[0].content));
    ok('the result is tied to the call that made it', results[0].tool_use_id === calls[0].id);
    ok('exit code 0 is not an error', results[0].is_error === false);

    const result = events.find(e => e.type === 'result');
    ok('the turn is closed', !!result && result.is_error === false);
    ok('‼️ and it carries NO price — Codex runs on a plan and states none, and a '
        + 'zero here would read as "this turn was free"',
        result && result.total_cost_usd === undefined);
}

// ---------- ‼️ the usage split ----------
{
    const u = C.codexUsage({
        input_tokens: 28874, cached_input_tokens: 25088,
        cache_write_input_tokens: 0, output_tokens: 135, reasoning_output_tokens: 40
    });
    ok('‼️ the cached share is taken OUT of the input — Codex counts it in, '
        + 'Claude counts it beside, and passing it through would count the context twice',
        u.input_tokens === 28874 - 25088 && u.cache_read_input_tokens === 25088);
    ok('the total is still the total', u.input_tokens + u.cache_read_input_tokens === 28874);
    ok('reasoning is part of output, not a fifth bucket beside it', u.output_tokens === 135);
    ok('…but it is available on its own, which is the one figure Claude never states',
        C.codexReasoningTokens({ reasoning_output_tokens: 40 }) === 40);

    const odd = C.codexUsage({ input_tokens: 10, cached_input_tokens: 999 });
    ok('a cached figure larger than the input cannot make the fresh part negative',
        odd.input_tokens === 0 && odd.cache_read_input_tokens === 10);
    ok('a missing usage block is zeros, not NaN',
        Object.values(C.codexUsage(undefined)).every(v => v === 0));
}

// ---------- ‼️ the whole point: the Console reducer understands it ----------
{
    const { events } = translateAll(REAL, { model: 'gpt-5-codex' });
    let st = P.newSessionState({
        id: 'cs1', agentId: 'a', agentName: 'developer', cwd: 'D:\\x', now: 1
    });
    st = P.acceptUserText(st, 'list the files', 2).state;
    for (const e of events) { st = P.reduceEvent(st, e, 3).state; }

    ok('‼️ the session takes the thread id as its own', st.sessionId === '019fe7bc-545c-70d2-b96f-d82d41da54bb');
    ok('the turn ends idle', st.status === 'idle');
    ok('the turn is counted', st.turns === 1);
    ok('the tokens of the turn reached the session',
        st.tokens === (28874 - 25088) + 25088 + 0 + 135);
    ok('nothing invented a dollar', st.costUSD === 0);

    const roles = st.messages.map(m => m.role);
    ok('the conversation reads as a conversation: what was said, what ran, what it returned',
        roles.filter(r => r === 'agent').length === 2
        && roles.filter(r => r === 'tool').length === 2
        && roles[roles.length - 1] === 'result');
    const call = st.messages.find(m => m.role === 'tool' && m.tool);
    ok('a shell step is drawn as a local step, the same as it is on the other engine',
        call && call.kind === 'local');
}

// ---------- ‼️ item ids restart every turn ----------
{
    const second = REAL.concat([
        { type: 'turn.started' },
        {
            type: 'item.completed',
            item: { id: 'item_0', type: 'command_execution', command: 'ls', aggregated_output: 'a', exit_code: 0, status: 'completed' }
        },
        { type: 'turn.completed', usage: { input_tokens: 5, output_tokens: 1 } }
    ]);
    const { state, events } = translateAll(second);
    ok('a second turn is a second turn', state.turn === 2);
    const ids = events.filter(e => e.type === 'assistant')
        .flatMap(e => (e.message.content || []).filter(b => b.type === 'tool_use'))
        .map(b => b.id);
    ok('‼️ two turns that both name their first item `item_0` do not collide — '
        + 'the id carries the turn, or the second call overwrites the first',
        ids.length === 2 && ids[0] !== ids[1]);
}

// ---------- an item that completes without ever starting ----------
{
    const quick = [
        { type: 'thread.started', thread_id: 't1' },
        { type: 'turn.started' },
        {
            type: 'item.completed',
            item: { id: 'item_0', type: 'command_execution', command: 'echo hi', aggregated_output: 'hi', exit_code: 0, status: 'completed' }
        }
    ];
    const { events } = translateAll(quick);
    const calls = events.filter(e => e.type === 'assistant')
        .flatMap(e => (e.message.content || []).filter(b => b.type === 'tool_use'));
    ok('‼️ a command that returns instantly emits only `item.completed`, and the '
        + 'call is still drawn — otherwise the output appears with nothing that made it',
        calls.length === 1 && calls[0].name === 'Bash');
}

// ---------- failure keeps the engine's own words ----------
{
    const dead = [
        { type: 'thread.started', thread_id: 't1' },
        { type: 'turn.started' },
        { type: 'turn.failed', error: { message: 'stream error: os error 10013' } }
    ];
    const { events } = translateAll(dead);
    const result = events.find(e => e.type === 'result');
    ok('‼️ a failure carries the ENGINE\'S own words — "os error 10013" is the '
        + 'difference between a broken engine and a firewall, and a tidied message throws that away',
        result && result.is_error === true && /10013/.test(result.error));
    // ‼️ K-27 — and it is a FAILURE. This used to be reported with Claude
    // Code's `error_during_execution`, whose one meaning there is "a person
    // stopped it", so a turn Codex gave up on read as `⎋ last turn interrupted`.
    ok('‼️ K-27 — a turn the engine failed is not reported as interrupted',
        result.interrupted === false && result.subtype !== 'error_during_execution');
}

// ---------- the item kinds ----------
{
    ok('a file change is a writing step', C.codexToolName({ type: 'file_change' }) === 'Edit');
    ok('…and it names the file it touched when it touched exactly one',
        C.codexItemFile({ type: 'file_change', changes: [{ path: 'D:/a/b.ts' }] }) === 'D:/a/b.ts');
    ok('…and names none when it touched several — a chip pointing at "three files" points at nothing',
        C.codexItemFile({ type: 'file_change', changes: [{ path: 'a' }, { path: 'b' }] }) === undefined);
    ok('‼️ an MCP call keeps the `mcp__` prefix, because that prefix — not a list — '
        + 'is what marks a call as leaving this machine',
        C.codexToolName({ type: 'mcp_tool_call', server: 'obsidian', tool: 'vault_read' }) === 'mcp__obsidian__vault_read');
    ok('…so it is read as network traffic', C.codexStepKind({ type: 'mcp_tool_call', server: 'x', tool: 'y' }) === 'mcp');
    ok('a search is web traffic', C.codexStepKind({ type: 'web_search', query: 'x' }) === 'web');
    ok('a shell command is local', C.codexStepKind({ type: 'command_execution', command: 'ls' }) === 'local');
    ok('reasoning is counted as thinking and drawn as nothing',
        (() => {
            const { events } = translateAll([
                { type: 'turn.started' },
                { type: 'item.completed', item: { id: 'i', type: 'reasoning', text: 'thinking about it' } }
            ]);
            const blocks = events.flatMap(e => (e.message && e.message.content) || []);
            return blocks.length === 1 && blocks[0].type === 'thinking';
        })());
}

// ---------- a line nobody measured is skipped, never guessed ----------
{
    ok('an unknown event produces nothing', translateAll([{ type: 'turn.paused' }]).events.length === 0);
    ok('a line that is not an object produces nothing', translateAll(['nonsense', 42, null]).events.length === 0);
    ok('an item with no type produces nothing',
        translateAll([{ type: 'item.completed', item: {} }]).events.length === 0);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
