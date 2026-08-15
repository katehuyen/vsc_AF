// K-25 — OpenCode's ACP frames, turned into the events the Console already
// understands, and tested against frames a real binary sent.
//
// ‼️ EVERY FIXTURE BELOW IS A CAPTURE. They were taken on 2026-08-15 from
// opencode 1.18.18 with `tools/opencode_acp_probe.js`; the raw wire logs are
// under `dist/measure/` and the sanitised evidence is
// `docs/OPENCODE-ENTEGRASYON.tr.md`. A translator written against imagined field
// names passes its own tests perfectly and produces an empty Console against the
// real program.
//
// What is asserted is the part a regex over the source cannot see:
//
//   * the tool's NAME comes from the first frame and the last frame renames it
//     (`read` → `package.json`), so a row named off the end loses the tool;
//   * `pending` carries an EMPTY `rawInput`, so a row drawn there says nothing;
//   * `thoughtTokens` is NOT inside `outputTokens` — it is arithmetic against
//     the engine's own `totalTokens`, and dropping it undercounts every turn
//     that thought;
//   * the turn usage is not cumulative, so no delta may be subtracted;
//   * spend and context arrive on DIFFERENT events;
//   * a `session/load` replay must draw NOTHING, or the card doubles itself.
const path = require('path');
const P = require(path.join(__dirname, '..', 'out', 'core', 'opencodeproto.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

/** Feed a list of `update` objects through the translator, in order. */
function run(state, updates) {
    let s = state, events = [];
    for (const u of updates) {
        const t = P.translateOpencodeUpdate(s, u);
        s = t.state;
        events = events.concat(t.events);
    }
    return { state: s, events };
}

const blocksOf = (events, type) => events
    .filter(e => e.type === 'assistant')
    .flatMap(e => (e.message && e.message.content) || [])
    .filter(b => b.type === type);

// --- captured: the two-turn NONCE conversation --------------------------------
const CHUNK = (id, text, thought) => ({
    sessionUpdate: thought ? 'agent_thought_chunk' : 'agent_message_chunk',
    messageId: id, content: { type: 'text', text }
});

// --- captured: the tool turn (glob, then read) --------------------------------
const GLOB_PENDING = {
    sessionUpdate: 'tool_call', toolCallId: 'call-cd503996', title: 'glob',
    kind: 'search', status: 'pending', locations: [], rawInput: {}
};
const GLOB_RUNNING = {
    sessionUpdate: 'tool_call_update', toolCallId: 'call-cd503996', status: 'in_progress',
    kind: 'search', title: 'glob',
    locations: [{ path: 'D:\\zone\\dev\\git\\miropharm\\vsc_AgentFarm' }],
    rawInput: { path: 'D:\\zone\\dev\\git\\miropharm\\vsc_AgentFarm', pattern: '**/package.json' }
};
const GLOB_DONE = {
    sessionUpdate: 'tool_call_update', toolCallId: 'call-cd503996', status: 'completed',
    content: [{ type: 'content', content: { type: 'text', text: 'D:\\…\\package.json' } }],
    rawOutput: { output: 'D:\\…\\package.json', metadata: { count: 1, truncated: false } }
};
const READ_PENDING = {
    sessionUpdate: 'tool_call', toolCallId: 'call-0815efb2', title: 'read',
    kind: 'read', status: 'pending', locations: [], rawInput: {}
};
const READ_RUNNING = {
    sessionUpdate: 'tool_call_update', toolCallId: 'call-0815efb2', status: 'in_progress',
    kind: 'read', title: 'read',
    rawInput: { filePath: 'D:\\zone\\dev\\git\\miropharm\\vsc_AgentFarm\\package.json' }
};
// ‼️ THE FRAME THAT RENAMES THE TOOL — measured. `title` comes back as the file.
const READ_DONE = {
    sessionUpdate: 'tool_call_update', toolCallId: 'call-0815efb2', status: 'completed',
    title: 'package.json',
    content: [{ type: 'content', content: { type: 'text', text: '{\n  "name": "agent-farm"' } }]
};

const USAGE_UPDATE = {
    sessionUpdate: 'usage_update', used: 29341, size: 262144,
    cost: { amount: 0, currency: 'USD' }
};

// --- captured: the prompt RESULTS of turn 1 and turn 2 ------------------------
const TURN1 = {
    stopReason: 'end_turn',
    usage: { inputTokens: 6196, outputTokens: 13, totalTokens: 8192, thoughtTokens: 63, cachedReadTokens: 1920 }
};
const TURN2 = {
    stopReason: 'end_turn',
    usage: { inputTokens: 36, outputTokens: 13, totalTokens: 8241, cachedReadTokens: 8192 }
};
const CANCELLED = {
    stopReason: 'cancelled',
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
};

// ---------- text arrives one token at a time and leaves as ONE row ----------
{
    const { events } = run(P.newOpencodeState(), [
        CHUNK('msg_1', 'N'), CHUNK('msg_1', 'ONCE'), CHUNK('msg_1', '=af-1')
    ]);
    ok('a reply that is still being written draws nothing yet', events.length === 0);

    const t = P.translateOpencodeResult(
        run(P.newOpencodeState(), [CHUNK('msg_1', 'N'), CHUNK('msg_1', 'ONCE')]).state, TURN1);
    const texts = blocksOf(t.events, 'text');
    ok('‼️ the whole reply is ONE assistant row, not one per token',
        texts.length === 1 && texts[0].text === 'NONCE');
}

// ---------- a new message id closes the one before it ----------
{
    const { events } = run(P.newOpencodeState(), [
        CHUNK('msg_1', 'first'), CHUNK('msg_2', 'second')
    ]);
    const texts = blocksOf(events, 'text');
    ok('a second message flushes the first', texts.length === 1 && texts[0].text === 'first');
}

// ---------- thinking is COUNTED and never drawn ----------
{
    const s = run(P.newOpencodeState(), [
        CHUNK('msg_1', 'The', true), CHUNK('msg_1', ' user', true), CHUNK('msg_1', ' wants', true)
    ]).state;
    const t = P.translateOpencodeResult(s, TURN1);
    const think = blocksOf(t.events, 'thinking');
    const said = blocksOf(t.events, 'text');
    ok('‼️ thought chunks become thinking BLOCKS — steps, never rows', think.length === 3);
    ok('…and a thought-only message says nothing out loud', said.length === 0);
}

// ---------- the tool row waits for its arguments, and keeps its name ----------
{
    const first = P.translateOpencodeUpdate(P.newOpencodeState(), GLOB_PENDING);
    ok('‼️ `pending` draws NOTHING — its rawInput is empty and the row would be blank',
        first.events.length === 0);

    const { state, events } = run(P.newOpencodeState(), [GLOB_PENDING, GLOB_RUNNING]);
    const uses = blocksOf(events, 'tool_use');
    ok('the row appears when the arguments do', uses.length === 1);
    ok('…drawn as a Claude tool name, so the step kinds line up', uses[0].name === 'Glob');
    ok('…carrying the pattern the panel prints',
        uses[0].input.pattern === '**/package.json');
    ok('…under the engine\'s own call id', uses[0].id === 'call-cd503996');

    const done = P.translateOpencodeUpdate(state, GLOB_DONE);
    const result = done.events.find(e => e.type === 'user');
    const block = result.message.content[0];
    ok('a completed call comes back as a tool_result on the user channel',
        block.type === 'tool_result' && block.tool_use_id === 'call-cd503996'
        && block.is_error === false);
    ok('…printing what the tool said, out of the content wrapper',
        /package\.json/.test(block.content));
    ok('…and the call is forgotten once it is closed',
        !Object.prototype.hasOwnProperty.call(done.state.tools, 'call-cd503996'));
}

// ---------- ‼️ THE RENAME TRAP ----------
{
    const { events } = run(P.newOpencodeState(), [READ_PENDING, READ_RUNNING, READ_DONE]);
    const uses = blocksOf(events, 'tool_use');
    ok('‼️ the tool is named off the FIRST frame — `read`, not `package.json`',
        uses.length === 1 && uses[0].name === 'Read');
    ok('…and the file it touched rides on the row for the ✎ chip',
        /package\.json$/.test(String(uses[0].input.file_path || '')));
}

// ---------- a call that never reports its arguments is still drawn ----------
{
    const { events } = run(P.newOpencodeState(), [
        { sessionUpdate: 'tool_call', toolCallId: 'c1', title: 'bash', kind: 'execute', status: 'pending', rawInput: {} },
        { sessionUpdate: 'tool_call_update', toolCallId: 'c1', status: 'failed', content: [] }
    ]);
    const uses = blocksOf(events, 'tool_use');
    const res = events.find(e => e.type === 'user').message.content[0];
    ok('‼️ a call that goes straight to its end still shows the call',
        uses.length === 1 && uses[0].name === 'Bash');
    ok('…and a failure says so rather than printing nothing',
        res.is_error === true && res.content === 'failed');
}

// ---------- the reply is flushed BEFORE the tool it asked for ----------
{
    const { events } = run(P.newOpencodeState(), [
        CHUNK('msg_1', 'Looking at that now.'), GLOB_PENDING, GLOB_RUNNING
    ]);
    const kinds = events.flatMap(e => (e.message && e.message.content) || []).map(b => b.type);
    ok('‼️ the sentence lands before the tool it introduced', kinds.join(',') === 'text,tool_use');
}

// ---------- context is its own event, and it states the WINDOW ----------
{
    const { events } = run(P.newOpencodeState(), [USAGE_UPDATE]);
    const ctx = events.find(e => e.type === 'context');
    ok('‼️ usage_update is CONTEXT, not spend', !!ctx && ctx.tokens === 29341);
    ok('…and OpenCode is the first engine here that states the window too',
        ctx.window === 262144 && ctx.source === 'engine-reported');
    ok('…and it draws no assistant row at all',
        events.filter(e => e.type === 'assistant').length === 0);
}

// ---------- spend: the arithmetic that proves reasoning is OUTSIDE output ----------
{
    const t = P.translateOpencodeResult(P.newOpencodeState(), TURN1);
    const carrier = t.events.find(e => e.type === 'assistant');
    const u = carrier.message.usage;
    ok('‼️ the usage rides on an assistant message with NO blocks — counted, not drawn',
        carrier.message.content.length === 0);
    ok('‼️ marked turnAggregate, so no window is read out of it',
        carrier.usage_scope === 'turnAggregate');
    ok('‼️ reasoning is ADDED to output — 13 + 63, because 6196+13+63+1920 is the engine\'s own 8192',
        u.output_tokens === 76);
    ok('…input excludes the cached share, exactly as Claude reports it',
        u.input_tokens === 6196 && u.cache_read_input_tokens === 1920);
    ok('…and the four fields add up to the total the engine stated',
        u.input_tokens + u.output_tokens + u.cache_read_input_tokens
        + u.cache_creation_input_tokens === 8192);
}

// ---------- ‼️ NOT CUMULATIVE: no delta is subtracted ----------
{
    let s = P.opencodeTurnStarted(P.newOpencodeState());
    const one = P.translateOpencodeResult(s, TURN1);
    s = P.opencodeTurnStarted(one.state);
    const two = P.translateOpencodeResult(s, TURN2);
    const u = two.events.find(e => e.type === 'assistant').message.usage;
    ok('‼️ turn 2 is charged its own 8241 — a Codex-style delta would make it free',
        u.input_tokens === 36 && u.cache_read_input_tokens === 8192
        && u.input_tokens + u.output_tokens + u.cache_read_input_tokens === 8241);
}

// ---------- the turn's dollars: the difference in a running total ----------
{
    let s = P.opencodeTurnStarted(P.newOpencodeState());
    s = P.translateOpencodeUpdate(s, {
        sessionUpdate: 'usage_update', used: 100, size: 200000, cost: { amount: 0.004 }
    }).state;
    const one = P.translateOpencodeResult(s, TURN1);
    ok('the first turn is charged what the running total became',
        one.events.find(e => e.type === 'result').total_cost_usd === 0.004);
    let s2 = P.opencodeTurnStarted(one.state);
    s2 = P.translateOpencodeUpdate(s2, {
        sessionUpdate: 'usage_update', used: 200, size: 200000, cost: { amount: 0.011 }
    }).state;
    const two = P.translateOpencodeResult(s2, TURN2);
    ok('‼️ …and the second is charged the DIFFERENCE, not the total again',
        Math.abs(two.events.find(e => e.type === 'result').total_cost_usd - 0.007) < 1e-9);
    // A restart resets the engine's own counter; a negative charge is worse than
    // a missing one.
    let s3 = P.opencodeTurnStarted(two.state);
    s3 = P.translateOpencodeUpdate(s3, {
        sessionUpdate: 'usage_update', used: 10, size: 200000, cost: { amount: 0 }
    }).state;
    ok('a counter that went backwards charges nothing rather than a negative',
        P.translateOpencodeResult(s3, TURN2).events.find(e => e.type === 'result').total_cost_usd === 0);
}

// ---------- a cooperative cancel is an ordinary ending ----------
{
    const t = P.translateOpencodeResult(P.newOpencodeState(), CANCELLED);
    const r = t.events.find(e => e.type === 'result');
    ok('‼️ cancel closes the turn and does NOT claim the engine broke',
        r.is_error === true && r.subtype === 'error_during_execution'
        && /conversation is intact/.test(r.error));
    ok('…and a zero usage carries no spend block at all',
        !t.events.some(e => e.type === 'assistant'));
}

// ---------- the limits the engine can stop on, in its own words ----------
{
    const r = P.translateOpencodeResult(P.newOpencodeState(), { stopReason: 'max_tokens', usage: {} })
        .events.find(e => e.type === 'result');
    ok('a turn that hit the output limit says which limit', /output limit/.test(r.error));
}

// ---------- ‼️ THE ECHO AND THE REPLAY, which are two different silences ----------
{
    const live = P.translateOpencodeUpdate(P.newOpencodeState(), {
        sessionUpdate: 'user_message_chunk', messageId: 'msg_u', content: { type: 'text', text: 'merhaba' }
    });
    ok('‼️ a live user_message_chunk is an ECHO of the composer and is dropped',
        live.events.length === 0);

    const replaying = P.opencodeReplay(P.newOpencodeState(), true);
    const back = run(replaying, [
        { sessionUpdate: 'user_message_chunk', messageId: 'm1', content: { type: 'text', text: 'eski soru' } },
        CHUNK('m2', 'eski cevap'), GLOB_PENDING, GLOB_RUNNING, GLOB_DONE, USAGE_UPDATE
    ]);
    ok('‼️ a session/load replay draws NOTHING — this card is already showing it',
        back.events.length === 0);
    ok('…and leaving the replay leaves the translator clean',
        !P.opencodeReplay(back.state, false).open);
}

// ---------- what IS kept through a replay: the commands the agent publishes ----------
{
    const t = P.translateOpencodeUpdate(P.opencodeReplay(P.newOpencodeState(), true), {
        sessionUpdate: 'available_commands_update',
        availableCommands: [
            { name: 'account-signup', description: 'Sign one Google account up…' },
            { name: 'customize-opencode', description: 'Use ONLY when…' },
            { name: '', description: 'nameless' }
        ]
    });
    ok('‼️ the agent\'s own command list survives a replay (X-39\'s starting data)',
        t.state.commands.length === 2 && t.state.commands[0].name === 'account-signup');
    ok('…and a nameless row is dropped rather than drawn as blank',
        !t.state.commands.some(c => !c.name));
}

// ---------- a shape nobody measured is skipped, never guessed ----------
{
    const t = P.translateOpencodeUpdate(P.newOpencodeState(), { sessionUpdate: 'plan', entries: [] });
    ok('an unmeasured update produces no events', t.events.length === 0);
    ok('…and a frame that is not an object does not throw',
        P.translateOpencodeUpdate(P.newOpencodeState(), null).events.length === 0
        && P.translateOpencodeUpdate(P.newOpencodeState(), 'x').events.length === 0);
    ok('…and a result with no usage and no stopReason still closes the turn',
        P.translateOpencodeResult(P.newOpencodeState(), {}).events
            .some(e => e.type === 'result' && e.is_error === false));
}

// ---------- the tool vocabulary, including the fallback nobody has measured ----------
{
    ok('OpenCode\'s own names map to the Claude ones the step kinds read',
        P.opencodeToolName('bash') === 'Bash'
        && P.opencodeToolName('webfetch') === 'WebFetch'
        && P.opencodeToolName('list') === 'LS');
    ok('‼️ an unknown tool is categorised by the ACP kind the protocol makes it declare',
        P.opencodeToolName('some_plugin_thing', 'fetch') === 'WebFetch'
        && P.opencodeToolName('another', 'execute') === 'Bash');
    ok('…and a name with neither keeps its own spelling',
        P.opencodeToolName('weird_thing', 'other') === 'weird_thing');
    ok('an MCP call keeps the prefix that marks it as leaving the machine',
        P.opencodeStepKind('mcp_obsidian_vault_read') === 'mcp');
    ok('web traffic is counted as web, local work as local',
        P.opencodeStepKind('webfetch') === 'web' && P.opencodeStepKind('glob') === 'local');
    ok('the detail leads with the engine\'s own word when the drawn name differs',
        /^some_plugin_thing · https:/.test(
            P.opencodeToolDetail('some_plugin_thing', 'fetch', { url: 'https://example.com' })));
}

// ---------- the output reader, on the two places a result can hide ----------
{
    ok('the human content is preferred', P.opencodeToolOutput(GLOB_DONE) === 'D:\\…\\package.json');
    ok('…and rawOutput is the fallback for a tool that publishes only that',
        P.opencodeToolOutput({ rawOutput: { output: 'only machine' } }) === 'only machine');
    ok('…a diff block is named rather than printed as empty',
        /^diff · /.test(P.opencodeToolOutput({ content: [{ type: 'diff', path: 'a.ts' }] })));
    ok('…and nothing at all is empty, not a crash', P.opencodeToolOutput({}) === '');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
