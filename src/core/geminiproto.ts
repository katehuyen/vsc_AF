/**
 * Gemini → Console. A translation layer, not a fourth protocol.
 *
 * ‼️ FOUR ENGINES, FOUR VOCABULARIES, AND NOT ONE FIELD NAME IN COMMON. Claude
 * emits `system:init` / `assistant` / `user` / `result`; Codex emits
 * `thread.started` / `item.*` / `turn.completed`; `agy` puts everything on one
 * `step_update`; and `gemini --output-format stream-json` emits `init` /
 * `message` / `tool_use` / `tool_result` / `error` / `result`. So this is the
 * third small translator beside `codexproto.ts` and `agyproto.ts`, and the fact
 * that a fourth engine costs a file this size instead of a fork is the whole
 * point of the shape.
 *
 * ‼️ EVERY SHAPE BELOW WAS MEASURED, NOT READ ABOUT (2026-08-13, gemini-cli
 * 0.55.1, read out of the shipped bundle — `packages/core/src/output/
 * stream-json-formatter.js` for the envelope, `packages/cli/src/gemini.tsx` for
 * every emit site, and the CLI's own `docs/cli/headless.md` for the event list):
 *
 *   {"type":"init","timestamp":"…","session_id":"a1b2…","model":"gemini-3-pro-preview"}
 *   {"type":"message","timestamp":"…","role":"user","content":"…"}
 *   {"type":"message","timestamp":"…","role":"assistant","content":"OK","delta":true}
 *   {"type":"tool_use","timestamp":"…","tool_name":"run_shell_command",
 *     "tool_id":"…","parameters":{"command":"echo hi"}}
 *   {"type":"tool_result","timestamp":"…","tool_id":"…","status":"success","output":"hi"}
 *   {"type":"error","timestamp":"…","severity":"warning","message":"…"}
 *   {"type":"result","timestamp":"…","status":"success","stats":{"total_tokens":25595,
 *     "input_tokens":25594,"output_tokens":1,"cached":0,"input":0,"duration_ms":1780,
 *     "tool_calls":0,"models":{"gemini-3-pro-preview":{…}}}}
 *
 * Four of those measurements changed the design:
 *
 *  1. **THE STATS ARE THIS PROCESS'S, NOT THE CONVERSATION'S — the exact
 *     opposite of Codex.** `convertToStreamStats` reads `uiTelemetryService`,
 *     a per-process singleton, and `resumeChat` restores the HISTORY without
 *     restoring the metrics (checked: no metrics are written back anywhere on
 *     the resume path). So a resumed Gemini turn reports only its own usage and
 *     the running-total subtraction `codexTurnUsage` exists for would turn every
 *     turn after the first into zero. Writing the Codex correction here would
 *     have been the bug — which is precisely how Codex's own figures were wrong
 *     before X-35, in the other direction.
 *  2. **`input_tokens` INCLUDES THE CACHED PART.** It is the API's
 *     `promptTokenCount`, and `cached` is `cachedContentTokenCount`, the share
 *     of that prompt served from cache. Claude's `input_tokens` is the fresh
 *     part only, so the cached share is subtracted here — the same asymmetry
 *     Codex has, and for the same reason.
 *  3. **THE STREAM DOES NOT ITEMISE THINKING.** The envelope carries
 *     `total_tokens` beside `input_tokens` and `output_tokens`, and the
 *     difference is real usage — `thoughtsTokenCount` plus
 *     `toolUsePromptTokenCount` — that `convertToStreamStats` simply does not
 *     break out. Dropping it would understate a reasoning turn by most of its
 *     cost, which is the "unmeasured therefore zero" mistake this whole item
 *     exists to remove, so the buckets are made to SUM TO THE ENGINE'S OWN
 *     TOTAL and the unitemised remainder is reported as output, named.
 *  4. **ASSISTANT TEXT ARRIVES AS DELTAS.** `message` with `role:"assistant"`
 *     and `delta:true` is one chunk of the reply, emitted per text part. They
 *     are accumulated and flushed as ONE assistant message when the turn ends —
 *     one reply per turn, which is what every surface downstream already draws.
 *
 * ‼️ AND ONE THING IS NOT TRANSLATED, BECAUSE IT DOES NOT EXIST: this CLI states
 * no dollar figure for a turn. It counts tokens. `result` is emitted with no
 * `total_cost_usd` rather than a zero that would read as free.
 *
 * Pure: a reducer over lines. No io, no vscode, no spawning.
 */

import { StepKind } from './stepkind';

/** What the translator has to remember between lines of one conversation. */
export interface GeminiState {
    /** The CLI's own id for the conversation — Claude's `session_id`. */
    sessionId?: string;
    /** Which turn of this conversation is running, 1-based. Part of a tool
     *  call's id, because `tool_id` is only unique within a run. */
    turn: number;
    /** Assistant text accumulated from deltas and not yet flushed. */
    reply: string;
    /** Tool calls started and not yet finished, by their namespaced id. */
    open: Record<string, { name: string; detail: string }>;
    /** True once an `init` has been seen and no `result` has closed it. */
    running: boolean;
}

export const newGeminiState = (): GeminiState =>
    ({ turn: 0, reply: '', open: {}, running: false });

/** The event names this CLI actually emits. Anything else is ignored rather
 *  than guessed at — a new event type must not become a fabricated row. */
export const GEMINI_EVENTS = [
    'init', 'message', 'tool_use', 'tool_result', 'error', 'result'
] as const;

/**
 * ‼️ A GEMINI TOOL, IN THE VOCABULARY THE PANEL ALREADY DRAWS.
 *
 * The names on the right are Claude tool names, chosen for what
 * `stepKindForTool` makes of them (stepkind.ts) — the same judgement
 * `codexproto.ts` and `agyproto.ts` make. A `run_shell_command` has to read as a
 * local shell step and a `google_web_search` as web traffic, or the step icons
 * and the "where did this turn go" figures quietly mean something else on one
 * engine than on another.
 *
 * The list is the CLI's own built-in tools (its `docs/reference/tools.md`). A
 * name that is not here keeps its own spelling and is read as a local tool,
 * which is the reading that costs nothing if it is wrong; an MCP call is
 * recognised by its own prefix below.
 */
const TOOL_NAME: Record<string, string> = {
    read_file: 'Read',
    read_many_files: 'Read',
    write_file: 'Write',
    replace: 'Edit',
    edit: 'Edit',
    run_shell_command: 'Bash',
    list_directory: 'LS',
    glob: 'Glob',
    search_file_content: 'Grep',
    google_web_search: 'WebSearch',
    web_fetch: 'WebFetch',
    save_memory: 'Write',
    todo_write: 'TodoWrite',
    enter_plan_mode: 'ExitPlanMode',
    exit_plan_mode: 'ExitPlanMode'
};

type Row = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' && isFinite(v) ? v : 0);
const obj = (v: unknown): Row =>
    (v && typeof v === 'object' && !Array.isArray(v) ? v as Row : {});

/** One line of something, as a row shows it. */
function firstLine(s: string, max = 160): string {
    const one = String(s ?? '').replace(/\s+/g, ' ').trim();
    return one.length > max ? one.slice(0, max - 1) + '…' : one;
}

/** The tool name a call is DRAWN as. An MCP call keeps the `mcp__` prefix,
 *  because that prefix — not a list — is what marks a call as leaving the
 *  machine (stepkind.ts). */
export function geminiToolName(raw: string): string {
    const name = String(raw ?? '').trim();
    if (!name) { return ''; }
    if (name.startsWith('mcp__')) { return name; }
    return TOOL_NAME[name] ?? name;
}

/** What the row says this call is DOING — the same job `shortArg` does for
 *  Claude's tools, from the parameters this CLI actually sends. */
export function geminiToolDetail(name: string, params: Row): string {
    const p = (...keys: string[]): string => {
        for (const k of keys) {
            const v = params[k];
            if (typeof v === 'string' && v.trim()) { return v; }
        }
        return '';
    };
    const drawn = geminiToolName(name);
    if (drawn === 'Bash') { return firstLine(p('command', 'shell_command')); }
    if (drawn === 'WebSearch') { return firstLine(p('query')); }
    if (drawn === 'WebFetch') { return firstLine(p('url', 'prompt')); }
    if (drawn === 'Grep') { return firstLine(p('pattern', 'query')); }
    if (drawn === 'Glob') { return firstLine(p('pattern')); }
    const file = p('file_path', 'absolute_path', 'path', 'dir_path');
    return file ? firstLine(file) : '';
}

/** The file a call touched, for the ✎ chips — only when it names exactly one. */
export function geminiToolFile(params: Row): string | undefined {
    for (const k of ['file_path', 'absolute_path', 'path']) {
        const v = params[k];
        if (typeof v === 'string' && v.trim()) { return v; }
    }
    return undefined;
}

/**
 * ‼️ GEMINI'S USAGE, IN CLAUDE'S FIELDS — and two corrections are the point.
 *
 * `input_tokens` is the WHOLE prompt including whatever came from cache
 * (measurement 2), so the cached share is subtracted. And the buckets are made
 * to sum to the engine's own `total_tokens` (measurement 3): the part the stream
 * does not itemise is thinking and tool-use prompt tokens, and reporting it as
 * nothing would understate a reasoning turn by most of what it cost.
 *
 * There is no cache-WRITE figure on this engine — its caching is implicit and it
 * states no creation bucket — so that field is zero because it is genuinely
 * absent, not because nobody looked.
 */
export function geminiUsage(stats: Row | undefined): Record<string, number> {
    const prompt = num(stats?.input_tokens);
    const cached = Math.min(num(stats?.cached), prompt);
    const output = num(stats?.output_tokens);
    return {
        input_tokens: Math.max(0, prompt - cached),
        cache_read_input_tokens: cached,
        cache_creation_input_tokens: 0,
        output_tokens: output + geminiUnitemisedTokens(stats)
    };
}

/**
 * The part of the turn the stream states but does not break out: the engine's
 * `total_tokens` less the prompt and the candidates. On this CLI that is
 * `thoughtsTokenCount` plus `toolUsePromptTokenCount` — thinking dominates it.
 *
 * Reported separately as well as folded in, because "what did the thinking
 * cost" is a question a surface can now answer instead of showing a hole.
 */
export function geminiUnitemisedTokens(stats: Row | undefined): number {
    const total = num(stats?.total_tokens);
    const prompt = num(stats?.input_tokens);
    const output = num(stats?.output_tokens);
    return Math.max(0, total - prompt - output);
}

export interface GeminiTranslation {
    state: GeminiState;
    /** Claude-shaped events, in order, for `reduceEvent`. */
    events: unknown[];
}

/**
 * Translate one Gemini event.
 *
 * `model` is what the caller ASKED for and is used only when the engine's own
 * `init` does not name one — this CLI does name it, which is one thing more
 * than Codex offers. A line that is not an object, or carries a type this
 * translator does not know, produces no events at all: the shipped rule
 * everywhere in this codebase is that a shape nobody measured is skipped, never
 * guessed.
 */
export function translateGemini(
    state: GeminiState, raw: unknown, opts: { model?: string } = {}
): GeminiTranslation {
    const o = raw as Row | undefined;
    if (!o || typeof o !== 'object') { return { state, events: [] }; }
    const type = str(o.type);
    const events: unknown[] = [];

    if (type === 'init') {
        const sessionId = str(o.session_id) || state.sessionId;
        const model = str(o.model) || opts.model;
        events.push({
            type: 'system', subtype: 'init',
            session_id: sessionId,
            ...(model ? { model } : {})
        });
        return {
            state: {
                ...state, sessionId, running: true,
                turn: state.turn + 1, reply: '', open: {}
            },
            events
        };
    }

    if (type === 'message') {
        // ‼️ The user's own message is echoed back by the CLI. It is NOT
        // re-emitted: the Console put it in the conversation when the person
        // pressed enter, and drawing it again would double every prompt.
        if (str(o.role) !== 'assistant') { return { state, events }; }
        const text = str(o.content);
        if (!text) { return { state, events }; }
        // Deltas accumulate; a non-delta message is a whole reply on its own.
        if (o.delta === true) {
            return { state: { ...state, reply: state.reply + text }, events };
        }
        events.push({ type: 'assistant', message: { content: [{ type: 'text', text }] } });
        return { state, events };
    }

    if (type === 'tool_use') {
        const rawName = str(o.tool_name);
        const name = geminiToolName(rawName);
        if (!name) { return { state, events }; }
        const id = `t${state.turn}-${str(o.tool_id) || 'tool'}`;
        const params = obj(o.parameters);
        const detail = geminiToolDetail(rawName, params);
        events.push({
            type: 'assistant',
            message: {
                content: [{ type: 'tool_use', id, name, input: toolInput(name, params, detail) }]
            }
        });
        return { state: { ...state, open: { ...state.open, [id]: { name, detail } } }, events };
    }

    if (type === 'tool_result') {
        const id = `t${state.turn}-${str(o.tool_id) || 'tool'}`;
        const isError = str(o.status) === 'error';
        const err = obj(o.error);
        const out = str(o.output) || str(err.message);
        // ‼️ A RESULT CAN ARRIVE FOR A CALL THAT WAS NEVER DRAWN — the same
        // measured case as Codex's instant command. Without this the panel would
        // show output for a step it never showed.
        if (!state.open[id]) {
            events.push({
                type: 'assistant',
                message: { content: [{ type: 'tool_use', id, name: 'Bash', input: { detail: 'tool call' } }] }
            });
        }
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

    if (type === 'error') {
        // ‼️ A WARNING IS NOT A FAILED TURN. This CLI puts both on `error` and
        // says which with `severity`; treating a warning as the end of the turn
        // would close a conversation that is still running.
        const message = str(o.message) || 'the engine reported a problem';
        if (str(o.severity) !== 'error') {
            events.push({
                type: 'user',
                message: {
                    content: [{
                        type: 'tool_result', tool_use_id: `t${state.turn}-warn`,
                        content: message, is_error: false
                    }]
                }
            });
            return { state, events };
        }
        events.push({
            type: 'result', subtype: 'error_during_execution',
            is_error: true, error: message, result: message
        });
        return { state: { ...state, running: false, open: {}, reply: '' }, events };
    }

    if (type === 'result') {
        // Whatever the deltas built is the reply, emitted once (measurement 4).
        if (state.reply.trim()) {
            events.push({
                type: 'assistant',
                message: { content: [{ type: 'text', text: state.reply }] }
            });
        }
        const stats = obj(o.stats);
        // ‼️ The usage rides on an assistant message with no blocks, because
        // that is where the reducer counts. It draws no row — an empty content
        // array produces none — it only carries the numbers. And it is NOT a
        // delta against a running total: on this engine there is no running
        // total to subtract (measurement 1).
        //
        // ‼️ X-43 — IT IS STILL A SUM, AND SUMS DO NOT STATE A WINDOW. `stats`
        // is what this PROCESS did: one turn in which the agent called tools
        // made several model calls, and the window it ended in is the last of
        // them, not their total. Marked `processAggregate` so the reducer spends
        // it and derives no ctx from it (consoleproto.ts → UsageScope). This
        // engine publishes no per-call figure and no `model_context_window` on
        // any surface measured here, so its ctx stays honestly unknown — a `—`
        // rather than a total wearing the wrong label.
        events.push({
            type: 'assistant', usage_scope: 'processAggregate',
            message: { content: [], usage: geminiUsage(stats) }
        });
        const failed = str(o.status) === 'error';
        events.push(failed
            ? {
                type: 'result', subtype: 'error_during_execution', is_error: true,
                error: str(obj(o.error).message) || 'the turn failed',
                result: str(obj(o.error).message) || 'the turn failed'
            }
            : {
                type: 'result', subtype: 'success', is_error: false
                // ‼️ NO `total_cost_usd`. This CLI states no price for a turn;
                // a zero here would read as "that turn was free".
            });
        return { state: { ...state, running: false, open: {}, reply: '' }, events };
    }

    return { state, events };
}

/** The tool's input, in the field names the panel's own `shortArg` reads — so a
 *  Gemini step's row says the same kind of thing a Claude step's does. */
function toolInput(name: string, params: Row, detail: string): Record<string, unknown> {
    if (name === 'Bash') { return { command: detail }; }
    if (name === 'WebSearch') { return { query: detail }; }
    if (name === 'WebFetch') { return { url: detail }; }
    if (name === 'Grep' || name === 'Glob') { return { pattern: detail }; }
    const file = geminiToolFile(params);
    if (file) { return { file_path: file }; }
    return { detail };
}

/** Which step kind a Gemini tool call is, without going through a fake tool
 *  name — used by tests and by anything that wants the answer directly. */
export function geminiStepKind(rawName: string): StepKind {
    const name = geminiToolName(rawName);
    return name.startsWith('mcp__') ? 'mcp'
        : name === 'WebSearch' || name === 'WebFetch' ? 'web' : 'local';
}
