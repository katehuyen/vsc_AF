/**
 * OpenCode → Console. The fourth translation, and the first one over ACP.
 *
 * ‼️ THE OTHER THREE TRANSLATORS READ A LINE THE ENGINE PRINTED. This one reads
 * a JSON-RPC *notification* (`session/update`) and a JSON-RPC *result*
 * (`session/prompt`), which arrive on the same pipe as requests the agent is
 * WAITING for an answer to. The correlation, the pending map and the answering
 * belong to the runtime (`opencodeacp.ts`); this file is pure and does what
 * `codexproto.ts` and `agyproto.ts` do — turns one foreign frame into the
 * Claude-shaped events `reduceEvent` already understands, so a fourth engine
 * costs a file rather than a fork of the Console.
 *
 * ‼️ EVERY SHAPE BELOW IS A CAPTURE (2026-08-15, opencode 1.18.18, this machine,
 * raw wire under `dist/measure/`, evidence in `docs/OPENCODE-ENTEGRASYON.tr.md`):
 *
 *   {"sessionUpdate":"agent_thought_chunk","messageId":"msg_00516c29…","content":{"type":"text","text":"The"}}
 *   {"sessionUpdate":"agent_message_chunk","messageId":"msg_00516c29…","content":{"type":"text","text":"N"}}
 *   {"sessionUpdate":"tool_call","toolCallId":"call-cd50…","title":"glob","kind":"search","status":"pending","locations":[],"rawInput":{}}
 *   {"sessionUpdate":"tool_call_update","toolCallId":"call-cd50…","status":"in_progress","title":"glob","kind":"search",
 *     "locations":[{"path":"D:\\…"}],"rawInput":{"path":"D:\\…","pattern":"**\/package.json"}}
 *   {"sessionUpdate":"tool_call_update","toolCallId":"call-cd50…","status":"completed",
 *     "content":[{"type":"content","content":{"type":"text","text":"D:\\…\\package.json"}}],"rawOutput":{…}}
 *   {"sessionUpdate":"usage_update","used":29341,"size":262144,"cost":{"amount":0,"currency":"USD"}}
 *   {"sessionUpdate":"user_message_chunk","messageId":"msg_…","content":{"type":"text","text":"…"}}   ← load replay only
 *   result: {"stopReason":"end_turn","usage":{"inputTokens":6196,"outputTokens":13,"totalTokens":8192,
 *            "thoughtTokens":63,"cachedReadTokens":1920}}
 *
 * Four of those measurements changed the design:
 *
 *  1. **THE FIRST `title` IS THE TOOL'S NAME AND THE LAST ONE IS NOT.** `pending`
 *     and `in_progress` both said `"glob"` / `"read"`; `completed` came back with
 *     `"package.json"` — a human label for the same call. A row named off the
 *     last frame would call a file read "package.json" and lose the tool.
 *  2. **`pending` CARRIES AN EMPTY `rawInput`.** The arguments arrive on
 *     `in_progress`. Drawing the row at `pending` produces `glob` with nothing
 *     beside it, so the row is held one frame — not longer: a call that goes
 *     straight to `completed` is drawn there instead, the same allowance
 *     `agyproto.ts` makes for a command that returns instantly.
 *  3. **`thoughtTokens` IS *NOT* INSIDE `outputTokens`** — the opposite of
 *     Antigravity, and it is arithmetic, not a claim: 6196 + 13 + 63 + 1920 =
 *     8192, the engine's own `totalTokens`. Leaving reasoning out would undercount
 *     every thinking turn; `agyproto.ts` adds nothing for the same measured
 *     reason in the other direction.
 *  4. **THE TURN'S USAGE IS NOT CUMULATIVE** (turn 2's input 36 < turn 1's 6196),
 *     so NO delta is subtracted. Codex's correct subtraction, applied here, would
 *     report every second turn as free. The block is marked `turnAggregate` so
 *     the reducer knows not to read a window out of it — the window is a
 *     different event (`usage_update`), and the two figures on one measured turn
 *     were 29381 and 29341, close enough to invite exactly that mistake.
 *
 * Pure: a reducer over frames. No io, no vscode, no spawning.
 */

import { OpencodeSpend, opencodeContextFrom, opencodeSpendFromAcp } from './opencode';
import { StepKind, stepKindForTool } from './stepkind';

type Row = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' && isFinite(v) ? v : 0);
const obj = (v: unknown): Row => (v && typeof v === 'object' && !Array.isArray(v) ? v as Row : {});

/** What the translator remembers between frames of one conversation. */
export interface OpencodeState {
    /** the engine's own `ses_…`, learnt from `session/new` or handed in on load */
    sessionId?: string;
    /** which turn is running, 1-based — part of a fallback id, see `openText` */
    turn: number;
    /**
     * The assistant message being written RIGHT NOW: its id, the text so far and
     * how many thought chunks rode with it.
     *
     * ‼️ ONE OPEN MESSAGE, NOT A MAP. Chunks arrive per token, and a Console row
     * per token would be unreadable; a map keyed by `messageId` would keep every
     * message of the turn open and flush them all at the end, which puts the
     * reply AFTER the tool calls it asked for. So the open message is flushed the
     * moment anything else happens — a new message id, a tool call, the end of
     * the turn — and the conversation keeps the order the engine produced.
     */
    open?: { messageId: string; text: string; thoughts: number };
    /** tool calls seen, by `toolCallId`: the name from the FIRST frame (see the
     *  header) and whether the row has been drawn yet */
    tools: Record<string, { name: string; detail: string; drawn: boolean }>;
    /**
     * The conversation's running cost, as the last `usage_update` stated it.
     *
     * ‼️ THE ONE INFERENCE IN THIS FILE, AND IT IS MARKED AS ONE. Every measured
     * `cost.amount` was 0 (the free models this was probed against), so whether
     * the figure is the TURN's or the CONVERSATION's is not something the capture
     * can settle. It rides in the same event as `used`, which is unambiguously
     * the conversation's window occupancy and unambiguously grows — and the
     * export states one `info.cost` for the whole session beside a per-message
     * cost, which is the shape of a running total. So it is read as cumulative
     * and the turn is charged the DIFFERENCE, which is the reading that cannot
     * double-count. `X-40` re-checks it against a model that charges.
     */
    cost: number;
    /** what `cost` was when this turn started — the subtraction above */
    costAtTurn: number;
    /**
     * ‼️ `session/load` REPLAYS THE WHOLE CONVERSATION as ordinary update frames,
     * and this card is ALREADY SHOWING IT.
     *
     * That is what the replay is for here: the runtime reloads a live card after
     * a crash so the engine's side of the conversation is whole again, and the
     * panel's side never went anywhere. Reducing the replay would print every
     * message of the session a second time — the duplication S-30 states the
     * rule against — so while this is set the translator draws NOTHING and only
     * keeps what is state (the commands the agent publishes). Building a history
     * surface out of a load is S-33's, on its own terms.
     */
    replaying: boolean;
    /** the slash commands the agent published — `available_commands_update`.
     *  Kept because it is the engine's own answer to "what can I run"; X-39 owns
     *  what is done with it. */
    commands: { name: string; description: string }[];
}

export const newOpencodeState = (): OpencodeState => ({
    turn: 0, tools: {}, cost: 0, costAtTurn: 0, replaying: false, commands: []
});

/** The `session/update` kinds measured on 1.18.18. Listed so a kind nobody has
 *  seen is visibly absent rather than silently handled. */
export const OPENCODE_UPDATES = [
    'agent_message_chunk', 'agent_thought_chunk', 'user_message_chunk',
    'tool_call', 'tool_call_update', 'usage_update', 'available_commands_update'
] as const;

/**
 * ‼️ AN OPENCODE TOOL, IN THE VOCABULARY THE PANEL ALREADY DRAWS.
 *
 * The names on the right are Claude tool names, chosen for what
 * `stepKindForTool` makes of them (stepkind.ts) — the same judgement
 * `agyproto.ts` makes. `webfetch` has to read as traffic leaving this machine
 * and `bash` as a local shell, or "where did this turn go" quietly means
 * something different on one engine than on another. The engine's OWN name is
 * never lost: it leads the row's detail (see `opencodeToolDetail`).
 */
const TOOL_NAME: Record<string, string> = {
    bash: 'Bash',
    read: 'Read',
    write: 'Write',
    edit: 'Edit',
    patch: 'Edit',
    multiedit: 'Edit',
    glob: 'Glob',
    grep: 'Grep',
    list: 'LS',
    ls: 'LS',
    webfetch: 'WebFetch',
    websearch: 'WebSearch',
    todowrite: 'TodoWrite',
    todoread: 'TodoWrite',
    task: 'Task',
    skill: 'Skill',
    question: 'AskUserQuestion'
};

/**
 * …and the fallback, which is the ACP `kind` rather than a guess.
 *
 * ‼️ THIS IS WHY A TOOL NOBODY HAS MEASURED STILL LANDS IN THE RIGHT COLUMN. The
 * protocol makes the agent declare a category for every call it publishes, so an
 * MCP tool or a plugin's own tool that this build has never heard of is still
 * known to be a fetch or an execute. The name is kept as it was spelt; only the
 * category comes from here.
 */
const KIND_NAME: Record<string, string> = {
    read: 'Read',
    edit: 'Edit',
    move: 'Edit',
    delete: 'Edit',
    search: 'Grep',
    execute: 'Bash',
    fetch: 'WebFetch'
};

/** The tool name this call is DRAWN as. `''` when the frame names nothing. */
export function opencodeToolName(title: string, kind?: string): string {
    const raw = String(title ?? '').trim();
    const byName = TOOL_NAME[raw.toLowerCase()];
    if (byName) { return byName; }
    // ‼️ MCP NAMING ON THIS ENGINE IS UNMEASURED — no MCP server was configured
    // on the machine A-16 was probed on, so no such call has ever crossed a wire
    // this codebase recorded. What IS known is the categoriser's rule: the
    // `mcp__` prefix, not a list, is what marks a call as leaving the machine
    // (stepkind.ts). So a name that announces itself as MCP by any spelling is
    // normalised to the one spelling that rule reads, and a name that does not
    // falls through to the ACP `kind` below like any other unknown tool. This
    // normalisation is the cheap half of the answer; the other half — what
    // OpenCode actually calls them — is an open question for the acceptance run.
    const mcp = /^mcp[_-]+(.+)$/i.exec(raw);
    if (mcp) { return `mcp__${mcp[1]}`; }
    const byKind = KIND_NAME[String(kind ?? '').trim().toLowerCase()];
    return byKind ?? raw;
}

/** One line of something, as a row shows it. */
function firstLine(s: string, max = 160): string {
    const one = String(s ?? '').replace(/\s+/g, ' ').trim();
    return one.length > max ? one.slice(0, max - 1) + '…' : one;
}

/** Read a parameter by any of several spellings — OpenCode's own tools use
 *  `filePath` / `pattern` / `command`, and a plugin's may use anything. */
function param(input: Row, ...names: string[]): string {
    const want = new Set(names.map(n => n.toLowerCase()));
    for (const [k, v] of Object.entries(input)) {
        if (want.has(k.toLowerCase()) && typeof v === 'string' && v.trim()) { return v; }
    }
    return '';
}

/**
 * What the row says this call is DOING.
 *
 * It leads with the engine's OWN tool name whenever the drawn name differs,
 * because the mapping above is a category decision and not a rename the user
 * agreed to: a `webfetch` drawn as `WebFetch` is the same word, but a plugin
 * tool categorised by its ACP kind must still be readable as what it was called.
 */
export function opencodeToolDetail(title: string, kind: string | undefined, input: Row): string {
    const raw = String(title ?? '').trim();
    const drawn = opencodeToolName(raw, kind);
    const arg = param(input, 'filePath', 'file_path', 'path', 'command', 'pattern',
        'query', 'url', 'description', 'prompt', 'oldString');
    const own = raw && raw.toLowerCase() !== drawn.toLowerCase() ? raw : '';
    return firstLine([own, arg].filter(Boolean).join(' · '));
}

/** The file a writing call touched, for the ✎ chips — only when the call names
 *  exactly one path, because a chip pointing at "three files" points at none. */
export function opencodeToolFile(name: string, input: Row, locations: unknown): string | undefined {
    if (!['Read', 'Write', 'Edit', 'NotebookEdit'].includes(name)) { return undefined; }
    const direct = param(input, 'filePath', 'file_path', 'path');
    if (direct) { return direct; }
    const list = Array.isArray(locations) ? locations : [];
    if (list.length !== 1) { return undefined; }
    return str(obj(list[0]).path) || undefined;
}

/** The tool's input in the field names the panel's own `shortArg` reads — so an
 *  OpenCode step's row says the same kind of thing a Claude step's does. */
function toolInput(name: string, input: Row, file?: string): Row {
    if (name === 'Bash') { return { command: param(input, 'command') }; }
    if (name === 'WebSearch') { return { query: param(input, 'query', 'pattern') }; }
    if (name === 'WebFetch') { return { url: param(input, 'url') }; }
    if (name === 'Grep') {
        return { pattern: param(input, 'pattern', 'query'), path: param(input, 'path', 'include') };
    }
    if (name === 'Glob') {
        return { pattern: param(input, 'pattern'), path: param(input, 'path') };
    }
    if (name === 'LS') { return { path: param(input, 'path') }; }
    if (name === 'TodoWrite') { return { todos: input.todos ?? [] }; }
    if (file) { return { file_path: file }; }
    return input;
}

/** Which step kind a call is, without going through a drawn name — for tests
 *  and for anything that wants the answer directly. */
export function opencodeStepKind(title: string, kind?: string): StepKind {
    return stepKindForTool(opencodeToolName(title, kind));
}

/**
 * ‼️ WHAT ONE TOOL CALL SAID BACK, out of a shape with two places to look.
 *
 * `content[]` is the human-readable side (`{type:'content',content:{type:'text',
 * text}}`) and `rawOutput` is the machine one. The row prints the first, because
 * that is what the panel shows for every other engine; `rawOutput.output` is the
 * fallback for a tool that publishes only the machine form. Neither present is
 * not an error — a write tool answers with nothing to say.
 */
export function opencodeToolOutput(update: Row): string {
    const parts = Array.isArray(update.content) ? update.content : [];
    const texts: string[] = [];
    for (const p of parts) {
        const block = obj(p);
        // `{type:'content', content:{…}}` — the measured wrapper — and the bare
        // block, because ACP allows both and a diff arrives as neither.
        const inner = obj(block.content);
        const text = str(inner.text) || str(block.text);
        if (text.trim()) { texts.push(text); continue; }
        if (str(block.type) === 'diff') {
            const path = str(block.path);
            texts.push(path ? `diff · ${path}` : 'diff');
        }
    }
    if (texts.length) { return texts.join('\n'); }
    const raw = obj(update.rawOutput);
    return str(raw.output) || str(raw.result) || '';
}

export interface OpencodeTranslation {
    state: OpencodeState;
    /** Claude-shaped events, in order, for `reduceEvent`. */
    events: unknown[];
}

/**
 * Flush the assistant message that is still being written.
 *
 * ‼️ THE THOUGHTS GO OUT AS `thinking` BLOCKS AND DRAW NO ROW — the rule
 * consoleproto states for Claude ("the model's private working is not
 * conversation") and the reason the figures beside the composer can say a turn
 * thought at all. One block per thought MESSAGE, not per chunk: a chunk is a
 * token, and counting tokens as steps would make every OpenCode turn look like
 * a thousand-step turn.
 */
function flush(state: OpencodeState, events: unknown[]): OpencodeState {
    const open = state.open;
    if (!open) { return state; }
    if (open.thoughts > 0) {
        events.push({
            type: 'assistant',
            message: { content: Array.from({ length: open.thoughts }, () => ({ type: 'thinking' })) }
        });
    }
    if (open.text.trim()) {
        events.push({ type: 'assistant', message: { content: [{ type: 'text', text: open.text }] } });
    }
    return { ...state, open: undefined };
}

/**
 * Translate one `session/update` notification's `update` object.
 *
 * A frame whose `sessionUpdate` this translator does not know produces no events
 * — the shipped rule everywhere in this codebase: a shape nobody measured is
 * skipped, never guessed. The runtime records it as a diagnostic so an upstream
 * addition is visible rather than silent (fail-soft, not fail-quiet).
 */
export function translateOpencodeUpdate(
    state: OpencodeState, raw: unknown
): OpencodeTranslation {
    const u = obj(raw);
    const kind = str(u.sessionUpdate);
    const events: unknown[] = [];
    if (!kind) { return { state, events }; }

    // ‼️ A REPLAY IS NOT A CONVERSATION — see `OpencodeState.replaying`. Only the
    // frames that are pure state survive it; nothing is drawn, because the card
    // being reloaded is the card already showing all of this.
    if (state.replaying && kind !== 'available_commands_update') {
        return { state, events };
    }

    // ‼️ Outside a replay a `user_message_chunk` is the engine echoing back what
    // this window has ALREADY drawn from the composer. Reducing it would put
    // every message of the conversation on the screen twice.
    if (kind === 'user_message_chunk') { return { state, events }; }

    if (kind === 'agent_message_chunk' || kind === 'agent_thought_chunk') {
        const messageId = str(u.messageId) || `t${state.turn}`;
        const text = str(obj(u.content).text);
        let next = state;
        // A different message means the previous one is finished — see `open`.
        if (next.open && next.open.messageId !== messageId) { next = flush(next, events); }
        const open = next.open ?? { messageId, text: '', thoughts: 0 };
        return {
            state: {
                ...next,
                open: kind === 'agent_thought_chunk'
                    // ‼️ A thought's TEXT is deliberately dropped and only its
                    // existence kept. The panel draws no thinking rows on any
                    // engine, and holding the reasoning of a long turn in memory
                    // for a row nobody renders is a leak with no reader.
                    ? { ...open, thoughts: open.thoughts + 1 }
                    : { ...open, text: open.text + text }
            },
            events
        };
    }

    if (kind === 'tool_call' || kind === 'tool_call_update') {
        return translateToolCall(state, u, events);
    }

    if (kind === 'usage_update') {
        // ‼️ CONTEXT, FROM ITS OWN EVENT — and this engine states the window as
        // well as the occupancy, which no other one here does. Read through
        // `opencodeContextFrom` so the spend/context separation lives in exactly
        // one place (see `core/opencode.ts`).
        const ctx = opencodeContextFrom(u);
        let next = state;
        const cost = obj(u.cost);
        if (typeof cost.amount === 'number' && isFinite(cost.amount)) {
            next = { ...next, cost: cost.amount };
        }
        if (ctx) {
            events.push({
                type: 'context', tokens: ctx.tokens,
                ...(ctx.window ? { window: ctx.window } : {}),
                source: 'engine-reported'
            });
        }
        return { state: next, events };
    }

    if (kind === 'available_commands_update') {
        const list = Array.isArray(u.availableCommands) ? u.availableCommands : [];
        return {
            state: {
                ...state,
                commands: list.map(c => {
                    const o = obj(c);
                    return { name: str(o.name), description: str(o.description) };
                }).filter(c => c.name)
            },
            events
        };
    }

    // `current_mode_update`, `plan`, and whatever 1.19 adds: not measured, so
    // not invented. The runtime logs it; nothing is drawn.
    return { state, events };
}

function translateToolCall(state: OpencodeState, u: Row, events: unknown[]): OpencodeTranslation {
    const id = str(u.toolCallId);
    if (!id) { return { state, events }; }
    const status = str(u.status);
    const seen = state.tools[id];
    // ‼️ THE NAME COMES FROM THE FIRST FRAME AND IS NEVER OVERWRITTEN (header,
    // measurement 1): `completed` renamed `read` to `package.json`.
    const title = seen?.name ? '' : str(u.title);
    const name = seen?.name || opencodeToolName(title, str(u.kind));
    const input = obj(u.rawInput);
    const hasInput = Object.keys(input).length > 0;
    const detail = hasInput
        ? opencodeToolDetail(seen?.name ? seen.name : title, str(u.kind), input)
        : (seen?.detail ?? '');

    // A call the panel has not drawn yet, and the arguments have arrived (or
    // never will, because the call is already over) — header, measurement 2.
    const closing = status === 'completed' || status === 'failed';
    const draw = !seen?.drawn && (hasInput || closing);
    let next = state;
    if (draw) {
        // The reply that asked for this tool is finished the moment the tool
        // starts, or the row lands after the call it introduced.
        next = flush(next, events);
        const file = opencodeToolFile(name, input, u.locations);
        events.push({
            type: 'assistant',
            message: {
                content: [{
                    type: 'tool_use', id, name: name || 'tool',
                    input: toolInput(name, input, file)
                }]
            }
        });
    }
    next = {
        ...next,
        tools: {
            ...next.tools,
            [id]: { name, detail, drawn: (seen?.drawn ?? false) || draw }
        }
    };
    if (!closing) { return { state: next, events }; }

    const output = opencodeToolOutput(u);
    const isError = status === 'failed';
    events.push({
        type: 'user',
        message: {
            content: [{
                type: 'tool_result', tool_use_id: id,
                content: output || (isError ? 'failed' : 'ok'),
                is_error: isError
            }]
        }
    });
    const tools = { ...next.tools };
    delete tools[id];
    return { state: { ...next, tools }, events };
}

/**
 * Translate the RESULT of `session/prompt` — the end of one turn.
 *
 * ‼️ TWO EVENTS, NOT ONE, AND THAT IS THE WHOLE ACCOUNTING. The usage rides on
 * an assistant message with no content blocks (it draws no row; the reducer
 * counts it) marked `usage_scope: 'turnAggregate'`, and the `result` closes the
 * turn. Putting the usage on the result instead would count it where the reducer
 * reads a TURN's total against the window — the mistake X-43 exists because of.
 */
export function translateOpencodeResult(
    state: OpencodeState, raw: unknown, opts: { model?: string } = {}
): OpencodeTranslation {
    const r = obj(raw);
    const events: unknown[] = [];
    let next = flush(state, events);
    const stop = str(r.stopReason);
    const spend: OpencodeSpend = opencodeSpendFromAcp(r.usage);
    if (spend.total > 0) {
        events.push({
            type: 'assistant',
            // ‼️ NOT CUMULATIVE, SO NOTHING IS SUBTRACTED (header, measurement 4).
            usage_scope: 'turnAggregate',
            message: { content: [], usage: opencodeUsage(spend), ...(opts.model ? { model: opts.model } : {}) }
        });
    }
    // The turn's own dollars: the difference in a running total (see
    // OpencodeState.cost). Never negative — a restart resets the engine's
    // counter, and a negative charge is worse than a missing one.
    const charged = Math.max(0, next.cost - next.costAtTurn);
    if (stop === 'cancelled') {
        // ‼️ COOPERATIVE CANCEL IS AN ORDINARY ENDING, NOT A FAILURE — measured:
        // `stopReason: "cancelled"` with a zero usage, the conversation intact
        // and the next turn accepted on the same `ses_…`. It is reported as an
        // interruption because that is what the user did, and `is_error` is what
        // makes the row say so without claiming the engine broke.
        events.push({
            type: 'result', subtype: 'error_during_execution', is_error: true,
            error: 'turn cancelled — the engine stopped where it was and the conversation is intact',
            total_cost_usd: charged
        });
    } else if (stop === 'refusal') {
        events.push({
            type: 'result', subtype: 'error_during_execution', is_error: true,
            error: 'the model refused this turn', total_cost_usd: charged
        });
    } else if (stop === 'max_tokens' || stop === 'max_turn_requests') {
        events.push({
            type: 'result', subtype: 'error_during_execution', is_error: true,
            error: stop === 'max_tokens'
                ? 'the turn hit the model\'s output limit and stopped part-way'
                : 'the turn hit OpenCode\'s own limit on requests per turn and stopped part-way',
            total_cost_usd: charged
        });
    } else {
        events.push({ type: 'result', subtype: 'success', is_error: false, total_cost_usd: charged });
    }
    next = { ...next, costAtTurn: next.cost, tools: {} };
    return { state: next, events };
}

/**
 * ‼️ OPENCODE'S USAGE, IN CLAUDE'S FIELDS — AND REASONING IS ADDED TO OUTPUT.
 *
 * The opposite of `agyUsage`, and it is arithmetic rather than preference:
 * measured, `input + output + reasoning + cache.read + cache.write` is the
 * engine's own `totalTokens` (6196 + 13 + 63 + 1920 = 8192). So `thoughtTokens`
 * sits BESIDE `outputTokens`, not inside it, and a translation that dropped it
 * would undercount every turn that thought — the same trap Antigravity sets in
 * the other direction, where adding it would bill the reasoning twice.
 *
 * `input_tokens` excludes the cached share (same arithmetic), exactly as Claude
 * and Antigravity report it, so Codex's subtraction is not applied here either.
 */
export function opencodeUsage(spend: OpencodeSpend): Record<string, number> {
    return {
        input_tokens: spend.input,
        cache_read_input_tokens: spend.cacheRead,
        cache_creation_input_tokens: spend.cacheWrite,
        output_tokens: spend.output + spend.reasoning
    };
}

/** How many of the turn's output tokens went on private reasoning — the one
 *  figure Claude's stream does not carry. */
export const opencodeThinkingTokens = (spend: OpencodeSpend): number => num(spend.reasoning);

/**
 * Begin a turn: remember what the running cost was, so the turn can be charged
 * the difference (see `OpencodeState.cost`).
 */
export function opencodeTurnStarted(state: OpencodeState): OpencodeState {
    return { ...state, turn: state.turn + 1, costAtTurn: state.cost, open: undefined };
}

/** Enter / leave a `session/load` replay — the one window in which a
 *  `user_message_chunk` is scrollback rather than an echo. */
export function opencodeReplay(state: OpencodeState, on: boolean): OpencodeState {
    return { ...state, replaying: on, open: undefined };
}
