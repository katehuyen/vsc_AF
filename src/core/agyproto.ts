/**
 * Antigravity → Console. A translation layer, not a third protocol.
 *
 * ‼️ NOT ONE FIELD NAME IS SHARED WITH CLAUDE CODE'S `stream-json`, AND NONE
 * WITH CODEX'S EITHER. Three engines, three vocabularies: Claude emits
 * `system:init` / `assistant` / `user` / `result`, Codex emits `thread.started`
 * / `item.*` / `turn.completed`, and `agy` emits `init` / `step_update` /
 * `result` with everything — text, thinking, tool calls, tool output and the
 * token count — riding on ONE event type. So the choice was three reducers,
 * three panels and three sets of analytics, or a second small translator beside
 * `codexproto.ts`. This is that translator, and the fact that adding an engine
 * costs a file this size is the whole point of the shape.
 *
 * ‼️ EVERY SHAPE BELOW WAS MEASURED, NOT READ ABOUT (2026-08-10, agy 1.1.11,
 * real turns on this machine, `--output-format stream-json`):
 *
 *   {"event":"init","conversation_id":"a890b076-…","init":{"model":"gemini-3.6-flash-low",
 *     "cwd":"D:\\…","tools":[…56 names…],"permission_mode":"always-proceed"}}
 *   {"event":"step_update","step_update":{"conversation_id":"…","step_index":0,
 *     "state":"DONE","step_type":"user_input"}}
 *   {"event":"step_update","step_update":{…,"step_index":2,"state":"ACTIVE",
 *     "step_type":"agent_response","text_delta":"OK"}}
 *   {"event":"step_update","step_update":{…,"step_index":2,"state":"DONE",
 *     "step_type":"agent_response","text_delta":"\n","duration_seconds":1.78,
 *     "usage":{"input_tokens":25594,"output_tokens":1,"thinking_tokens":0,
 *              "cache_read_tokens":0,"total_tokens":25595}}}
 *   {"event":"step_update","step_update":{…,"step_index":3,"state":"ACTIVE",
 *     "step_type":"tool","tool_name":"run_command",
 *     "tool_info":{"name":"run_command","parameters":{"CommandLine":"echo merhaba"}}}}
 *   {"event":"step_update","step_update":{…,"step_index":3,"state":"DONE",
 *     "step_type":"tool","tool_name":"run_command","duration_seconds":1.03,
 *     "tool_info":{…,"output":"merhaba\r\n"}}}
 *   {"event":"result","result":{"conversation_id":"…","status":"SUCCESS",
 *     "response":"…","duration_seconds":21.85,"num_turns":1,"usage":{…}}}
 *
 * Four of those measurements changed the design:
 *
 *  1. **THE `result` USAGE IS THE SUM OF THE STEPS' USAGE, NOT AN EXTRA.**
 *     Counted: step inputs 17456+117+5385+5627+5760+2413 = 36758, and the
 *     result reported exactly 36758. Counting both would double every Antigravity
 *     turn. The steps are counted, because they are also what makes a running
 *     turn's figure move; the result carries none.
 *  2. **`input_tokens` DOES *NOT* INCLUDE THE CACHED PART** — the opposite of
 *     Codex, and the same as Claude: `total_tokens` is input+output with
 *     `cache_read_tokens` beside it, not inside it. So this usage maps straight
 *     across with no subtraction, and writing the Codex correction here would
 *     have been the bug.
 *  3. **`thinking_tokens` IS INSIDE `output_tokens`** (measured: output 151,
 *     thinking 146). Adding them would bill the reasoning twice — the same trap
 *     Codex's `reasoning_output_tokens` sets.
 *  4. **TEXT ARRIVES AS DELTAS ON ONE STEP.** `text_delta` accumulates while the
 *     step is ACTIVE and the last chunk rides on DONE; a step can also complete
 *     with the whole text in one go. So text is accumulated per step and emitted
 *     when the step finishes — one assistant message per reply, which is what
 *     every surface downstream already draws.
 *
 * ‼️ AND ONE THING IS NOT TRANSLATED, BECAUSE IT DOES NOT EXIST: `agy` states no
 * dollar figure. It runs on an Antigravity account and counts tokens, so
 * `result` is emitted with no `total_cost_usd` — a zero there would read as
 * "that turn was free".
 *
 * Pure: a reducer over lines. No io, no vscode, no spawning.
 */

import { StepKind } from './stepkind';

/** What the translator has to remember between lines of one conversation. */
export interface AgyState {
    /** The CLI's own id for the conversation — Claude's `session_id`. */
    conversationId?: string;
    /**
     * Which turn of this conversation is running, 1-based.
     *
     * ‼️ Not decoration: `step_index` is unique within a run, and a resumed run
     * starts counting again — so the turn is part of a tool call's id or the
     * second turn's first tool overwrites the first turn's.
     */
    turn: number;
    /** Text accumulated for a step that has not finished, by its namespaced id. */
    text: Record<string, string>;
    /** Tool steps started and not yet finished, by their namespaced id. */
    open: Record<string, { name: string; detail: string }>;
    /** True once an `init` has been seen and no `result` has closed it. */
    running: boolean;
}

export const newAgyState = (): AgyState => ({ turn: 0, text: {}, open: {}, running: false });

/** The event names `agy` actually emits. Anything else is ignored rather than
 *  guessed at — a new event type must not become a fabricated row. */
export const AGY_EVENTS = ['init', 'step_update', 'result'] as const;

/** …and the `step_type` values seen on this machine. Listed so that a type
 *  nobody has measured is visibly absent rather than silently handled. */
export const AGY_STEP_TYPES = [
    'user_input', 'agent_response', 'tool', 'checkpoint', 'error_message', 'unknown'
] as const;

/**
 * ‼️ AN ANTIGRAVITY TOOL, IN THE VOCABULARY THE PANEL ALREADY DRAWS.
 *
 * The names on the right are Claude tool names and they are chosen for what
 * `stepKindForTool` makes of them (stepkind.ts) — the same judgement
 * `codexproto.ts` makes. A `run_command` has to read as a local shell step and
 * a `search_web` as web traffic, or the step icons and the "where did this turn
 * go" figures quietly mean something else on one engine than on another.
 *
 * ‼️ The browser family maps to `WebFetch` for exactly that reason: driving a
 * page is traffic leaving this machine, and it is counted as such. The tool's
 * OWN name is never lost — it goes in the row's detail (see `agyToolDetail`).
 *
 * A name that is not here keeps its own spelling and is read as a local tool,
 * which is the documented safe assumption: it is the reading that costs nothing
 * if it is wrong.
 */
const TOOL_NAME: Record<string, string> = {
    run_command: 'Bash',
    command_status: 'Bash',
    send_command_input: 'Bash',
    view_file: 'Read',
    read_resource: 'Read',
    notebook_execution: 'Read',
    list_dir: 'LS',
    find_by_name: 'Glob',
    grep_search: 'Grep',
    write_to_file: 'Write',
    generate_image: 'Write',
    replace_file_content: 'Edit',
    multi_replace_file_content: 'Edit',
    sed_file: 'Edit',
    notebook_edit: 'NotebookEdit',
    search_web: 'WebSearch',
    read_url_content: 'WebFetch',
    open_browser_url: 'WebFetch',
    read_browser_page: 'WebFetch',
    list_browser_pages: 'WebFetch',
    browser_click_element: 'WebFetch',
    browser_get_dom: 'WebFetch',
    browser_input: 'WebFetch',
    browser_press_key: 'WebFetch',
    browser_scroll: 'WebFetch',
    browser_scroll_dom: 'WebFetch',
    browser_select_option: 'WebFetch',
    browser_refresh_page: 'WebFetch',
    browser_resize_window: 'WebFetch',
    browser_get_network_request: 'WebFetch',
    browser_list_network_requests: 'WebFetch',
    capture_browser_console_logs: 'WebFetch',
    capture_browser_screenshot: 'WebFetch',
    execute_browser_javascript: 'WebFetch',
    click_browser_pixel: 'WebFetch',
    manage_task: 'TodoWrite',
    invoke_subagent: 'Task',
    browser_subagent: 'Task',
    define_subagent: 'Task',
    manage_subagents: 'Task',
    ask_question: 'AskUserQuestion',
    ask_permission: 'AskUserQuestion',
    send_message: 'SendMessage',
    schedule: 'ScheduleWakeup'
};

type Row = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' && isFinite(v) ? v : 0);
const obj = (v: unknown): Row => (v && typeof v === 'object' && !Array.isArray(v) ? v as Row : {});

/** One line of something, as a row shows it. */
function firstLine(s: string, max = 160): string {
    const one = String(s ?? '').replace(/\s+/g, ' ').trim();
    return one.length > max ? one.slice(0, max - 1) + '…' : one;
}

/**
 * Read a parameter by any of several spellings.
 *
 * ‼️ Antigravity's parameters are PascalCase (`CommandLine`, `AbsolutePath`,
 * `DirectoryPath`, `Query`) and only four of its fifty-six tools have been
 * measured. A tolerant, case-insensitive lookup is therefore not sloppiness —
 * it is the difference between a row that says what a tool is doing and one
 * that says nothing for every tool nobody has run yet.
 */
function param(params: Row, ...names: string[]): string {
    const want = new Set(names.map(n => n.toLowerCase()));
    for (const [k, v] of Object.entries(params)) {
        if (want.has(k.toLowerCase()) && typeof v === 'string' && v.trim()) { return v; }
    }
    return '';
}

/** The tool's parameters, wherever this step put them. */
export function agyToolParams(step: Row): Row {
    return obj(obj(step.tool_info).parameters);
}

/** The tool name this step is DRAWN as — a Claude name so the step kinds line
 *  up, or an MCP name built from the call's own fields. */
export function agyToolName(step: Row): string {
    const raw = str(step.tool_name) || str(obj(step.tool_info).name);
    if (!raw) { return ''; }
    if (raw === 'call_mcp_tool') {
        // ‼️ The `mcp__` PREFIX, not a list, is what marks a call as leaving the
        // machine (stepkind.ts). Rebuilding it is what keeps an MCP call on this
        // engine counted the same way as one on the other two.
        const p = agyToolParams(step);
        const server = (param(p, 'ServerName', 'server', 'Server') || 'server').replace(/[^\w-]/g, '');
        const tool = (param(p, 'ToolName', 'tool', 'Tool') || 'call').replace(/[^\w-]/g, '');
        return `mcp__${server}__${tool}`;
    }
    return TOOL_NAME[raw] ?? raw;
}

/**
 * What the row says this call is DOING.
 *
 * ‼️ It leads with the engine's OWN tool name whenever the drawn name differs,
 * because the mapping above is a category decision and not a rename the user
 * agreed to: a browser click drawn as `WebFetch` must still be readable as
 * `browser_click_element` by whoever is trying to understand the turn.
 */
export function agyToolDetail(step: Row): string {
    const raw = str(step.tool_name) || str(obj(step.tool_info).name);
    const p = agyToolParams(step);
    const arg = param(p, 'CommandLine', 'Command', 'AbsolutePath', 'TargetFile', 'FilePath',
        'DirectoryPath', 'Query', 'SearchQuery', 'Url', 'URL', 'Pattern', 'SearchPath');
    const drawn = agyToolName(step);
    const own = raw && raw !== drawn && !drawn.startsWith('mcp__') ? raw : '';
    return firstLine([own, arg].filter(Boolean).join(' · '));
}

/** The file a writing step touched, for the ✎ chips — only when the call names
 *  exactly one path, because a chip pointing at "three files" points at none. */
export function agyToolFile(step: Row): string | undefined {
    const drawn = agyToolName(step);
    if (!['Read', 'Write', 'Edit', 'NotebookEdit'].includes(drawn)) { return undefined; }
    return param(agyToolParams(step), 'AbsolutePath', 'TargetFile', 'FilePath', 'Path') || undefined;
}

/**
 * ‼️ ANTIGRAVITY'S USAGE, IN CLAUDE'S FIELDS — AND NOTHING IS SUBTRACTED.
 *
 * Measured (header, note 2): `input_tokens` is the fresh input and
 * `cache_read_tokens` sits beside it, exactly as Claude reports it. Applying
 * Codex's correction here — subtracting the cached share — would UNDERCOUNT
 * every turn instead of fixing anything, which is why this function exists
 * separately rather than being shared with `codexUsage`.
 *
 * `thinking_tokens` is not added: it is part of `output_tokens` (note 3).
 */
export function agyUsage(u: Row | undefined): Record<string, number> {
    return {
        input_tokens: num(u?.input_tokens),
        cache_read_input_tokens: num(u?.cache_read_tokens),
        cache_creation_input_tokens: 0,
        output_tokens: num(u?.output_tokens)
    };
}

/** How many of the turn's output tokens went on private reasoning — the one
 *  figure Claude's stream does not carry. */
export const agyThinkingTokens = (u: Row | undefined): number => num(u?.thinking_tokens);

export interface AgyTranslation {
    state: AgyState;
    /** Claude-shaped events, in order, for `reduceEvent`. */
    events: unknown[];
}

/**
 * Translate one Antigravity event.
 *
 * A line that is not an object, or carries an event this translator does not
 * know, produces no events at all — the shipped rule everywhere in this
 * codebase: a shape nobody measured is skipped, never guessed.
 */
export function translateAgy(
    state: AgyState, raw: unknown, opts: { model?: string } = {}
): AgyTranslation {
    const o = raw as Row | undefined;
    if (!o || typeof o !== 'object') { return { state, events: [] }; }
    const event = str(o.event);
    const events: unknown[] = [];

    if (event === 'init') {
        const init = obj(o.init);
        const conversationId = str(o.conversation_id) || state.conversationId;
        events.push({
            type: 'system', subtype: 'init',
            session_id: conversationId,
            // ‼️ The engine NAMES the model it is actually using, which Codex
            // never does — so this is its answer, not what we asked for, and the
            // asked-for value is only the fallback.
            ...(str(init.model) || opts.model ? { model: str(init.model) || opts.model } : {})
        });
        return {
            state: { ...state, conversationId, turn: state.turn + 1, running: true, text: {}, open: {} },
            events
        };
    }

    if (event === 'step_update') {
        return translateStep(state, obj(o.step_update), events);
    }

    if (event === 'result') {
        const result = obj(o.result);
        const status = str(result.status).toUpperCase();
        if (status && status !== 'SUCCESS') {
            // ‼️ THE ENGINE'S OWN WORDS. "invalid model selection … conflicts
            // with --effort=medium" is the difference between "Antigravity is
            // broken" and one flag too many, and a tidied message throws exactly
            // that away.
            const message = str(result.error) || 'the turn failed';
            events.push({
                type: 'result', subtype: 'error_during_execution',
                is_error: true, error: message, result: message
            });
        } else {
            events.push({
                type: 'result', subtype: 'success', is_error: false
                // ‼️ NO `total_cost_usd` and NO `usage`. The usage was already
                // counted step by step, and this block is their SUM (header,
                // note 1) — reporting it again would double the turn.
            });
        }
        return { state: { ...state, running: false, text: {}, open: {} }, events };
    }

    return { state, events };
}

function translateStep(state: AgyState, step: Row, events: unknown[]): AgyTranslation {
    const type = str(step.step_type);
    const done = str(step.state).toUpperCase() === 'DONE';
    // The turn is part of the id: `step_index` starts again on the next run.
    const id = `t${state.turn}-s${num(step.step_index)}`;
    let next = state;

    // ‼️ THE TOKENS RIDE ON AN ASSISTANT MESSAGE WITH NO BLOCKS, because that is
    // where the reducer counts them. It draws no row — an empty content array
    // produces none — it only carries the numbers, and it is emitted for EVERY
    // step that reports usage, including the `checkpoint` steps that carry
    // nothing else. A checkpoint's tokens are tokens.
    const usage = step.usage ? agyUsage(obj(step.usage)) : undefined;

    if (type === 'agent_response') {
        const delta = str(step.text_delta);
        const carried = (next.text[id] ?? '') + delta;
        if (!done) {
            return { state: { ...next, text: { ...next.text, [id]: carried } }, events };
        }
        if (usage) { events.push({ type: 'assistant', message: { content: [], usage } }); }
        if (carried.trim()) {
            events.push({ type: 'assistant', message: { content: [{ type: 'text', text: carried }] } });
        }
        const text = { ...next.text };
        delete text[id];
        return { state: { ...next, text }, events };
    }

    if (type === 'checkpoint' || type === 'user_input' || type === 'unknown') {
        // Bookkeeping the CLI does between steps. Nothing to draw; the tokens
        // are still real and are counted.
        if (done && usage) { events.push({ type: 'assistant', message: { content: [], usage } }); }
        return { state: next, events };
    }

    if (type === 'error_message') {
        if (!done) { return { state: next, events }; }
        const message = str(step.text_delta) || str(step.message) || str(step.error);
        // ‼️ Measured: this step type has arrived carrying NO message at all. A
        // row saying "the step failed" with nothing behind it is noise in a
        // transcript, so an empty one is dropped and a real one is kept whole.
        if (message.trim()) {
            events.push({
                type: 'user',
                message: {
                    content: [{
                        type: 'tool_result', tool_use_id: id,
                        content: message, is_error: true
                    }]
                }
            });
        }
        if (usage) { events.push({ type: 'assistant', message: { content: [], usage } }); }
        return { state: next, events };
    }

    if (type !== 'tool') { return { state: next, events }; }

    const name = agyToolName(step);
    if (!name) { return { state: next, events }; }
    const detail = agyToolDetail(step);
    const file = agyToolFile(step);

    if (!done) {
        events.push({
            type: 'assistant',
            message: { content: [{ type: 'tool_use', id, name, input: toolInput(step, name, file) }] }
        });
        return { state: { ...next, open: { ...next.open, [id]: { name, detail } } }, events };
    }

    // ‼️ A STEP CAN COMPLETE WITHOUT EVER HAVING STARTED — the same thing Codex
    // does when a command returns instantly. Without this the panel would show
    // the output and never show the call.
    if (!next.open[id]) {
        events.push({
            type: 'assistant',
            message: { content: [{ type: 'tool_use', id, name, input: toolInput(step, name, file) }] }
        });
    }
    const info = obj(step.tool_info);
    const out = str(info.output) || str(info.result) || str(step.output);
    const isError = info.error !== undefined && info.error !== null && str(info.error).trim() !== ''
        ? true : str(step.state).toUpperCase() === 'FAILED';
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
    if (usage) { events.push({ type: 'assistant', message: { content: [], usage } }); }
    const open = { ...next.open };
    delete open[id];
    next = { ...next, open };
    return { state: next, events };
}

/** The tool's input in the field names the panel's own `shortArg` reads — so an
 *  Antigravity step's row says the same kind of thing a Claude step's does. */
function toolInput(step: Row, name: string, file?: string): Record<string, unknown> {
    const p = agyToolParams(step);
    if (name === 'Bash') { return { command: param(p, 'CommandLine', 'Command') }; }
    if (name === 'WebSearch') { return { query: param(p, 'Query', 'SearchQuery') }; }
    if (name === 'WebFetch') { return { url: param(p, 'Url', 'URL'), detail: agyToolDetail(step) }; }
    if (name === 'Grep') { return { pattern: param(p, 'Query', 'Pattern'), path: param(p, 'SearchPath', 'DirectoryPath') }; }
    if (name === 'LS' || name === 'Glob') { return { path: param(p, 'DirectoryPath', 'SearchDirectory', 'AbsolutePath') }; }
    if (name === 'TodoWrite') { return { todos: p.Tasks ?? p.tasks ?? [] }; }
    if (file) { return { file_path: file }; }
    return { detail: agyToolDetail(step) };
}

/** Which step kind an Antigravity step is, without going through a drawn tool
 *  name — used by tests and by anything that wants the answer directly. */
export function agyStepKind(step: Row): StepKind {
    const name = agyToolName(step);
    return name.startsWith('mcp__') ? 'mcp'
        : name === 'WebSearch' || name === 'WebFetch' ? 'web' : 'local';
}
