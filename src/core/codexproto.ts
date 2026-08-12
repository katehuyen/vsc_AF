/**
 * Codex → Console. A translation layer, not a second protocol.
 *
 * ‼️ NOT ONE FIELD NAME IS SHARED WITH CLAUDE CODE'S `stream-json`. Codex emits
 * `thread.started` / `turn.started` / `item.*` / `turn.completed`; Claude emits
 * `system:init` / `assistant` / `user` / `result`. So the choice was between two
 * reducers, two panels and two sets of analytics — or one function that turns
 * the first vocabulary into the second. This is that function. Everything
 * downstream (`reduceEvent`, the Console panel, the cost strip, the step icons,
 * the transcript) stays a single code path, and an engine that arrives next year
 * needs a file this size rather than a fork of the extension.
 *
 * ‼️ EVERY SHAPE BELOW WAS MEASURED, NOT READ ABOUT (2026-08-10, codex-cli
 * 0.147.0, real turns on this machine — the sign-in is a ChatGPT plan and there
 * is no API key anywhere):
 *
 *   {"type":"thread.started","thread_id":"019fe7bc-…"}
 *   {"type":"turn.started"}
 *   {"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"…"}}
 *   {"type":"item.started","item":{"id":"item_1","type":"command_execution",
 *     "command":"…","aggregated_output":"","exit_code":null,"status":"in_progress"}}
 *   {"type":"item.completed","item":{"id":"item_1","type":"command_execution",
 *     "command":"…","aggregated_output":"…","exit_code":0,"status":"completed"}}
 *   {"type":"turn.completed","usage":{"input_tokens":28874,"cached_input_tokens":25088,
 *     "cache_write_input_tokens":0,"output_tokens":135,"reasoning_output_tokens":0}}
 *
 * Three of those measurements changed the design:
 *
 *  1. **`item` ids restart at `item_0` on every turn.** They are unique within a
 *     turn and nowhere else, so a tool call's id is namespaced with the turn or
 *     the second turn's first tool overwrites the first turn's.
 *  2. **Usage arrives ONCE, at the end of the turn.** Claude reports it on every
 *     assistant message and the reducer counts it there on purpose (the result
 *     line's usage is the turn's and would double-count). Codex gives one block
 *     at `turn.completed`, so the adaptor emits it as a usage-only assistant
 *     message immediately before the result — the reducer's own counting path,
 *     fed the only way this engine can feed it.
 *  3. **`input_tokens` INCLUDES the cached part** (measured: 14310 in, 11008 of
 *     it cached, for a four-word prompt against a ~14k system preamble). Claude's
 *     `input_tokens` is the fresh part only, so the cached share is subtracted
 *     here — without that, every Codex turn would report its context twice.
 *
 * ‼️ AND ONE THING IS NOT TRANSLATED, BECAUSE IT DOES NOT EXIST: Codex states no
 * dollar figure for a turn. It counts tokens. `result` is emitted with no
 * `total_cost_usd` rather than a zero that would read as free or an estimate
 * that would be invented — and NOT because "it runs on a plan", which this file
 * cannot know: the same CLI signs in with a ChatGPT plan or an API key, and on a
 * key every turn is invoiced (see EngineTransport.reportsCost).
 *
 * Pure: a reducer over lines. No io, no vscode, no spawning.
 */

import { StepKind } from './stepkind';

/** What the adaptor has to remember between lines of one thread. */
export interface CodexState {
    /** The CLI's own id for the conversation — Claude's `session_id`. */
    threadId?: string;
    /**
     * Which turn of this thread is running, 1-based.
     *
     * ‼️ Not decoration: `item` ids restart at `item_0` every turn, so this is
     * what keeps a tool call's id unique across a conversation.
     */
    turn: number;
    /** Tool calls started and not yet finished, by their namespaced id. */
    open: Record<string, { name: string; detail: string }>;
    /** True once `turn.started` has been seen and not yet closed. */
    running: boolean;
    /**
     * ‼️ THE THREAD'S RUNNING TOTAL AS OF THE LAST `turn.completed` — kept
     * because the figure on the wire is cumulative and everything downstream
     * expects a turn's own usage. See `codexTurnUsage`.
     */
    spent?: CodexTotals;
}

export const newCodexState = (): CodexState => ({ turn: 0, open: {}, running: false });

/** The event names Codex actually emits. Anything else is ignored rather than
 *  guessed at — a new event type must not become a fabricated row. */
export const CODEX_EVENTS = [
    'thread.started', 'turn.started', 'turn.completed', 'turn.failed',
    'item.started', 'item.updated', 'item.completed', 'error'
] as const;

/**
 * ‼️ WHAT A CODEX ITEM IS, IN THE VOCABULARY THE PANEL ALREADY DRAWS.
 *
 * The names on the right are Claude tool names, and they are chosen for what
 * `stepKindForTool` makes of them (stepkind.ts) — a `command_execution` has to
 * read as a local shell step and a `web_search` as web traffic, or the step
 * icons and the "where did this turn go" figures quietly mean something else on
 * one engine than on the other. `mcp_tool_call` keeps the `mcp__` prefix for the
 * same reason: that prefix, not a list, is what marks a call as leaving the
 * machine.
 */
const ITEM_TOOL: Record<string, string> = {
    command_execution: 'Bash',
    file_change: 'Edit',
    web_search: 'WebSearch',
    todo_list: 'TodoWrite'
};

type Item = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' && isFinite(v) ? v : 0);

/** One line of a command, as the row shows it. */
function firstLine(s: string, max = 160): string {
    const one = String(s ?? '').replace(/\s+/g, ' ').trim();
    return one.length > max ? one.slice(0, max - 1) + '…' : one;
}

/** What the row says this call is DOING — the same job `shortArg` does for
 *  Claude's tools, from the fields Codex actually puts on an item. */
export function codexItemDetail(item: Item): string {
    const type = str(item.type);
    if (type === 'command_execution') { return firstLine(str(item.command)); }
    if (type === 'file_change') {
        const changes = Array.isArray(item.changes) ? item.changes as Item[] : [];
        const paths = changes.map(c => str(c.path)).filter(Boolean);
        return paths.length ? firstLine(paths.join(', ')) : firstLine(str(item.path));
    }
    if (type === 'mcp_tool_call') {
        return firstLine(str(item.server) + (item.tool ? ' · ' + str(item.tool) : ''));
    }
    if (type === 'web_search') { return firstLine(str(item.query)); }
    if (type === 'todo_list') {
        const items = Array.isArray(item.items) ? item.items as Item[] : [];
        return `${items.length} item(s)`;
    }
    return '';
}

/** The tool name this item is drawn as. `mcp_tool_call` is built from the
 *  server so the `mcp__` prefix rule (stepkind.ts) applies to it. */
export function codexToolName(item: Item): string {
    const type = str(item.type);
    if (type === 'mcp_tool_call') {
        const server = str(item.server).replace(/[^\w-]/g, '') || 'server';
        const tool = str(item.tool).replace(/[^\w-]/g, '') || 'call';
        return `mcp__${server}__${tool}`;
    }
    return ITEM_TOOL[type] ?? type;
}

/** The file a writing item touched, for the ✎ chips. Only `file_change` has
 *  one, and only when it names exactly one path — a chip that points at "three
 *  files" points at nothing. */
export function codexItemFile(item: Item): string | undefined {
    if (str(item.type) !== 'file_change') { return undefined; }
    const changes = Array.isArray(item.changes) ? item.changes as Item[] : [];
    const paths = changes.map(c => str(c.path)).filter(Boolean);
    if (paths.length === 1) { return paths[0]; }
    return str(item.path) || undefined;
}

/**
 * ‼️ CODEX'S USAGE, IN CLAUDE'S FIELDS — and the subtraction is the whole point.
 *
 * `input_tokens` is the WHOLE input including whatever came from cache;
 * Claude's `input_tokens` is the fresh part only and `cache_read_input_tokens`
 * is the rest. Passing Codex's number through unchanged would count the cached
 * share twice — measured, that is 11 008 of a 14 310-token turn, so the figure
 * would be wrong by about 3× on an ordinary conversation and worse as it grows.
 *
 * `reasoning_output_tokens` is NOT added: it is part of `output_tokens`, not a
 * fifth bucket beside it (a turn that reasoned reports both, and adding them
 * would bill the thinking twice).
 */
export function codexUsage(u: Item | undefined): Record<string, number> {
    const input = num(u?.input_tokens);
    const cached = Math.min(num(u?.cached_input_tokens), input);
    return {
        input_tokens: Math.max(0, input - cached),
        cache_read_input_tokens: cached,
        cache_creation_input_tokens: num(u?.cache_write_input_tokens),
        output_tokens: num(u?.output_tokens)
    };
}

/** The four numbers `turn.completed` carries, before anything is done to them. */
export interface CodexTotals {
    input: number;
    cached: number;
    cacheWrite: number;
    output: number;
    reasoning: number;
}

const totalsOf = (u: Item | undefined): CodexTotals => ({
    input: num(u?.input_tokens),
    cached: num(u?.cached_input_tokens),
    cacheWrite: num(u?.cache_write_input_tokens),
    output: num(u?.output_tokens),
    reasoning: num(u?.reasoning_output_tokens)
});

/**
 * ‼️ THE BASELINE A RESUMED THREAD NEEDS, out of what its transcript already
 * spent.
 *
 * Between two turns of a Codex conversation there is no process and, after a
 * window reload, no adaptor state either — so the running total the next
 * `turn.completed` states has nothing to be subtracted from, and the first turn
 * back would be charged with the whole conversation. The index has read that
 * conversation's rollout and knows the four figures; this puts them back in the
 * shape the engine reports them in (`input_tokens` INCLUDES the cached share,
 * which is the one asymmetry between the two vocabularies).
 *
 * `reasoning` cannot be recovered from a billing split and is left at zero: it
 * is a display figure carried alongside the buckets, never one of them, so the
 * first turn back reports its own thinking rather than an invented delta.
 */
export function codexTotalsFromUsage(u: {
    input: number; output: number; cacheWrite: number; cacheRead: number;
} | undefined): CodexTotals | undefined {
    if (!u) { return undefined; }
    const total = u.input + u.output + u.cacheWrite + u.cacheRead;
    if (total <= 0) { return undefined; }
    return {
        input: u.input + u.cacheRead,
        cached: u.cacheRead,
        cacheWrite: u.cacheWrite,
        output: u.output,
        reasoning: 0
    };
}

/**
 * ‼️ `turn.completed.usage` IS THE THREAD'S RUNNING TOTAL, NOT THE TURN'S.
 *
 * MEASURED 2026-08-12, codex-cli 0.147.0, two real turns of one thread on this
 * machine:
 *
 *   turn 1 → input 12 378  cached  4 480  output 17
 *   turn 2 → input 24 774  cached 16 640  output 23
 *
 * The second line is not a second turn that happened to cost twice as much. It
 * is turn 1 + turn 2, and the rollout on disk says so in as many words: its
 * `token_count` event carries `total_token_usage` beside `last_token_usage`,
 * and after a long session the total reads 32.8M against a window of 258k.
 *
 * Handed to the reducer unchanged that one field breaks three things at once,
 * because the reducer's contract — Claude's contract — is that a usage block
 * describes ONE request:
 *
 *   · the session's token count compounds (every turn re-adds the whole
 *     history), so it grows with the square of the conversation;
 *   · the cost compounds with it, on an engine that states no price and is
 *     therefore priced from token counts alone;
 *   · and `contextAfter` reports a LIFETIME TOTAL as the size of the context
 *     window — which is how a session that never exceeded 258k came to show
 *     38M of context at the end of it.
 *
 * So the delta is taken here, once, against the previous total. The turn's own
 * request input IS the window occupancy at that turn, which is exactly what
 * `contextAfter` means on Claude — the two engines end up saying the same
 * thing with the same arithmetic instead of one of them lying quietly.
 *
 * A total that goes DOWN (a compaction, a CLI that revised its bookkeeping) is
 * clamped at zero rather than reported as negative usage: unsigned is the
 * honest direction, and a negative would subtract from a session's spend.
 */
export function codexTurnUsage(
    prev: CodexTotals | undefined, u: Item | undefined
): { usage: Record<string, number>; total: CodexTotals } {
    const total = totalsOf(u);
    const base = prev ?? { input: 0, cached: 0, cacheWrite: 0, output: 0, reasoning: 0 };
    const step = (now: number, was: number) => Math.max(0, now - was);
    const turn: CodexTotals = {
        input: step(total.input, base.input),
        cached: step(total.cached, base.cached),
        cacheWrite: step(total.cacheWrite, base.cacheWrite),
        output: step(total.output, base.output),
        reasoning: step(total.reasoning, base.reasoning)
    };
    return {
        usage: codexUsage({
            input_tokens: turn.input,
            cached_input_tokens: turn.cached,
            cache_write_input_tokens: turn.cacheWrite,
            output_tokens: turn.output,
            reasoning_output_tokens: turn.reasoning
        }),
        total
    };
}

/** How many of the turn's output tokens went on private reasoning. Reported
 *  separately because it is the one figure Claude's stream does not carry and
 *  the only honest answer to "what did the thinking cost" on this engine. */
export const codexReasoningTokens = (u: Item | undefined): number =>
    num(u?.reasoning_output_tokens);

export interface CodexTranslation {
    state: CodexState;
    /** Claude-shaped events, in order, for `reduceEvent`. */
    events: unknown[];
}

/**
 * Translate one Codex event.
 *
 * `model` is what the caller ASKED for; Codex does not name the model it used
 * in the stream, so it is passed through on `init` rather than invented. A line
 * that is not an object, or carries a type this adaptor does not know, produces
 * no events at all — the shipped rule everywhere in this codebase: a shape
 * nobody measured is skipped, never guessed.
 */
export function translateCodex(
    state: CodexState, raw: unknown, opts: { model?: string } = {}
): CodexTranslation {
    const o = raw as Item | undefined;
    if (!o || typeof o !== 'object') { return { state, events: [] }; }
    const type = str(o.type);
    const events: unknown[] = [];

    if (type === 'thread.started') {
        const threadId = str(o.thread_id) || state.threadId;
        events.push({
            type: 'system', subtype: 'init',
            session_id: threadId,
            ...(opts.model ? { model: opts.model } : {})
        });
        return { state: { ...state, threadId }, events };
    }

    if (type === 'turn.started') {
        return { state: { ...state, turn: state.turn + 1, running: true, open: {} }, events };
    }

    if (type === 'item.started' || type === 'item.completed' || type === 'item.updated') {
        return translateItem(state, type, (o.item ?? {}) as Item, events);
    }

    if (type === 'turn.completed') {
        // ‼️ THE DELTA, NOT THE FIGURE ON THE WIRE — see codexTurnUsage. The
        // running total is carried on the state so the next turn can subtract.
        const { usage, total } = codexTurnUsage(state.spent, o.usage as Item | undefined);
        // ‼️ The usage rides on an assistant message with no blocks, because
        // that is where the reducer counts (see the header). It draws no row —
        // an empty content array produces none — it only carries the numbers.
        events.push({ type: 'assistant', message: { content: [], usage } });
        events.push({
            type: 'result', subtype: 'success', is_error: false
            // ‼️ NO `total_cost_usd`. Codex runs on a plan and states no price;
            // a zero here would read as "this turn was free".
        });
        return { state: { ...state, running: false, open: {}, spent: total }, events };
    }

    if (type === 'turn.failed' || type === 'error') {
        const error = (o.error ?? {}) as Item;
        const message = str(error.message) || str(o.message) || 'the turn failed';
        // ‼️ THE ENGINE'S OWN WORDS. `os error 10013` is the difference between
        // "Codex is broken" and "your security software is refusing the socket",
        // and a tidied-up message throws exactly that away.
        events.push({
            type: 'result', subtype: 'error_during_execution',
            is_error: true, error: message, result: message
        });
        return { state: { ...state, running: false, open: {} }, events };
    }

    return { state, events };
}

function translateItem(
    state: CodexState, event: string, item: Item, events: unknown[]
): CodexTranslation {
    const itemType = str(item.type);
    // The turn is part of the id: `item_0` comes round again next turn.
    const id = `t${state.turn}-${str(item.id) || 'item'}`;

    if (itemType === 'agent_message') {
        if (event !== 'item.completed') { return { state, events }; }
        const text = str(item.text);
        if (!text.trim()) { return { state, events }; }
        events.push({ type: 'assistant', message: { content: [{ type: 'text', text }] } });
        return { state, events };
    }

    if (itemType === 'reasoning') {
        // Counted as a thinking step and deliberately not drawn, exactly as the
        // Claude side treats it: the model's private working is not conversation.
        if (event !== 'item.completed') { return { state, events }; }
        events.push({
            type: 'assistant',
            message: { content: [{ type: 'thinking', thinking: str(item.text) }] }
        });
        return { state, events };
    }

    if (itemType === 'error') {
        if (event !== 'item.completed') { return { state, events }; }
        events.push({
            type: 'user',
            message: {
                content: [{
                    type: 'tool_result', tool_use_id: id,
                    content: str(item.message) || 'the step failed', is_error: true
                }]
            }
        });
        return { state, events };
    }

    const name = codexToolName(item);
    if (!name) { return { state, events }; }
    const detail = codexItemDetail(item);
    const file = codexItemFile(item);

    if (event === 'item.started') {
        events.push({
            type: 'assistant',
            message: {
                content: [{
                    type: 'tool_use', id, name,
                    input: toolInput(item, name, file)
                }]
            }
        });
        return { state: { ...state, open: { ...state.open, [id]: { name, detail } } }, events };
    }

    if (event === 'item.completed') {
        // ‼️ AN ITEM CAN COMPLETE WITHOUT EVER HAVING STARTED — measured: a
        // command that returns instantly emits `item.completed` alone. Without
        // this the panel would show its output and never show the call.
        if (!state.open[id]) {
            events.push({
                type: 'assistant',
                message: { content: [{ type: 'tool_use', id, name, input: toolInput(item, name, file) }] }
            });
        }
        const exit = item.exit_code;
        const isError = typeof exit === 'number' ? exit !== 0 : str(item.status) === 'failed';
        const out = str(item.aggregated_output) || str(item.output) || str(item.result);
        events.push({
            type: 'user',
            message: {
                content: [{
                    type: 'tool_result', tool_use_id: id,
                    content: out || (isError ? 'failed' : 'ok'),
                    is_error: isError
                }]
            }
        });
        const open = { ...state.open };
        delete open[id];
        return { state: { ...state, open }, events };
    }

    // item.updated — progress on something already drawn. Nothing to say: a row
    // per keystroke of output would be a log, not a conversation.
    return { state, events };
}

/** The tool's input, in the field names the panel's own `shortArg` reads — so a
 *  Codex step's row says the same kind of thing a Claude step's does. */
function toolInput(item: Item, name: string, file?: string): Record<string, unknown> {
    if (name === 'Bash') { return { command: str(item.command) }; }
    if (name === 'WebSearch') { return { query: str(item.query) }; }
    if (name === 'TodoWrite') { return { todos: item.items ?? [] }; }
    if (file) { return { file_path: file }; }
    return { detail: codexItemDetail(item) };
}

/** Which step kind a Codex item is, without going through a fake tool name —
 *  used by tests and by anything that wants the answer directly. */
export function codexStepKind(item: Item): StepKind {
    const name = codexToolName(item);
    return name.startsWith('mcp__') ? 'mcp'
        : name === 'WebSearch' ? 'web' : 'local';
}
