/**
 * What KIND of thing a step is — and therefore where its cost comes from.
 *
 * ‼️ A TURN IS NOT A LIST OF EQUIVALENT ACTIONS, AND THE SURFACES SHOWED IT AS
 * ONE. "14api·26steps" said how many steps there were; nothing said whether a step
 * was the model thinking (billed output, the most expensive token there is), a
 * file being read off this disk (costs nothing to run, and its result is paid
 * on the NEXT call), an MCP server being asked something over the network, or
 * a slash command that never reached a model at all. Without that, "where did
 * my limit go?" has no answer on any page.
 *
 * The categories below are not invented: every one was counted in this
 * machine's own transcripts before it was written (60 newest files, 21 705
 * lines, 2026-08-04). What was found, verbatim:
 *   asst:tool_use 4097 · user:tool_result 4096 · asst:thinking 1737 ·
 *   asst:text 878 · user:text 118 · user:image 3
 *   tools: Bash 1349, Edit 1086, Read 636, PowerShell 425, Grep 230, Write 168,
 *   TaskUpdate 58, TaskCreate 34, ToolSearch 20, mcp__obsidian__* 45,
 *   AskUserQuestion 11, mcp__playwright__* 13, Glob 6, WebFetch 5, WebSearch 5
 *   attachments: hook_success 3113, task_reminder 174, deferred_tools_delta 23,
 *   queued_command 13, agent_listing_delta 10, skill_listing 10,
 *   edited_text_file 8, date_change 1, read_truncation_notice 1
 *
 * ‼️ THINKING WAS THE INVISIBLE ONE. 1 737 thinking blocks against 878 text
 * blocks — the model reasons about twice as often as it speaks, every one of
 * those tokens is billed as OUTPUT (the dearest kind), and no surface counted
 * them as their own thing.
 */

export type StepKind =
    /** The model reasoning. Billed as output — the most expensive token there is. */
    | 'think'
    /** The model writing to you. Also output. */
    | 'say'
    /** A tool that runs on THIS machine: no network, no model, zero tokens to
     *  run. Its result enters the context and is paid on the next call. */
    | 'local'
    /** A tool that reaches an MCP server. Network, no model tokens. */
    | 'mcp'
    /** Out to the open web (WebFetch / WebSearch / a browser driver). */
    | 'web'
    /** A sub-agent: its own conversation, its own context, spending this
     *  session's budget. */
    | 'subagent'
    /** Machinery inside the CLI — task bookkeeping, tool search, a skill being
     *  loaded, a question being put to you. No model, no network. */
    | 'harness'
    /** The answer to a tool coming back. Free to produce; it is what makes the
     *  NEXT call bigger. */
    | 'result'
    /** Nothing reached a model at all: a slash command, a hook, a mode change,
     *  an attachment the harness inserted. */
    | 'none';

/** One row of the legend every surface shares. */
export interface StepKindSpec {
    kind: StepKind;
    /** One glyph — this rides in a table cell and beside a spinner. */
    glyph: string;
    label: string;
    /** What it costs, in one clause. This is the whole point of the category. */
    cost: string;
}

export const STEP_KINDS: StepKindSpec[] = [
    { kind: 'think', glyph: '◈', label: 'thinking', cost: 'model reasoning — billed as output tokens, the dearest kind' },
    { kind: 'say', glyph: '▸', label: 'reply', cost: 'model writing — billed as output tokens' },
    { kind: 'local', glyph: '⌘', label: 'local tool', cost: 'runs on this machine — no tokens to run; its result is paid on the next call' },
    { kind: 'mcp', glyph: '⇄', label: 'MCP tool', cost: 'a request to an MCP server — no model tokens; its result is paid on the next call' },
    { kind: 'web', glyph: '⌗', label: 'web', cost: 'out to the internet — no model tokens; the page comes back into context' },
    { kind: 'subagent', glyph: '⑂', label: 'sub-agent', cost: 'its own conversation with its own context, spending this session\'s budget' },
    { kind: 'harness', glyph: '⚙', label: 'harness', cost: 'inside the CLI — no model, no network' },
    { kind: 'result', glyph: '↩', label: 'tool result', cost: 'free to produce; this is what makes the next call bigger' },
    { kind: 'none', glyph: '·', label: 'local only', cost: 'never reached a model' }
];

export const STEP_KIND_OF: Record<StepKind, StepKindSpec> =
    Object.fromEntries(STEP_KINDS.map(s => [s.kind, s])) as Record<StepKind, StepKindSpec>;

/** Tools that run entirely on this machine. Anything not listed and not
 *  prefixed `mcp__` is still assumed local rather than remote — a new local
 *  tool appearing must not be reported as network traffic. */
const LOCAL_TOOLS = new Set([
    'Read', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'NotebookRead',
    'Bash', 'BashOutput', 'KillShell', 'PowerShell', 'Glob', 'Grep', 'LS',
    'TodoWrite', 'ExitPlanMode', 'EnterPlanMode', 'EnterWorktree', 'ExitWorktree'
]);

const WEB_TOOLS = new Set(['WebFetch', 'WebSearch']);

/** CLI machinery: bookkeeping, discovery, asking you something. */
const HARNESS_TOOLS = new Set([
    'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet', 'TaskOutput', 'TaskStop',
    'ToolSearch', 'AskUserQuestion', 'Skill', 'ReportFindings', 'SendMessage',
    'ScheduleWakeup', 'CronCreate', 'CronDelete', 'CronList', 'Monitor',
    'PushNotification', 'RemoteTrigger', 'DesignSync', 'Artifact'
]);

const SUBAGENT_TOOLS = new Set(['Agent', 'Task']);

/**
 * Which category a tool call falls in.
 *
 * The prefix rules come first because they are the ones that keep working when
 * something new appears: `mcp__<server>__<tool>` is the CLI's own naming for an
 * MCP call, and a browser driver reached over MCP (`mcp__playwright__*`,
 * `mcp__chrome-devtools__*`) is web traffic whatever the server is called. A
 * tool nobody has listed is `local`, which is the safe reading: it is the
 * assumption that costs nothing if wrong.
 */
export function stepKindForTool(name: string): StepKind {
    const t = String(name || '').trim();
    if (!t) { return 'local'; }
    if (/^mcp__(playwright|chrome-devtools|browser)/i.test(t)) { return 'web'; }
    if (t.startsWith('mcp__')) { return 'mcp'; }
    if (SUBAGENT_TOOLS.has(t)) { return 'subagent'; }
    if (WEB_TOOLS.has(t)) { return 'web'; }
    if (HARNESS_TOOLS.has(t)) { return 'harness'; }
    if (LOCAL_TOOLS.has(t)) { return 'local'; }
    return 'local';
}

/** The category of an assistant content block. */
export function stepKindForBlock(blockType: string, toolName?: string): StepKind {
    switch (String(blockType || '')) {
        case 'thinking':
        case 'redacted_thinking':
            return 'think';
        case 'text':
            return 'say';
        case 'tool_use':
        case 'server_tool_use':
            return stepKindForTool(toolName ?? '');
        case 'tool_result':
            return 'result';
        default:
            return 'none';
    }
}

/** `◈ thinking` — the one label every surface writes, so a chip in the Console
 *  and a cell on the Turns page cannot describe the same step differently. */
export function stepKindLabel(kind: StepKind): string {
    const s = STEP_KIND_OF[kind] ?? STEP_KIND_OF.none;
    return `${s.glyph} ${s.label}`;
}

/** The shared tooltip: what this kind of step is, and what it costs. */
export function stepKindTip(kind: StepKind): string {
    const s = STEP_KIND_OF[kind] ?? STEP_KIND_OF.none;
    return `${s.label} — ${s.cost}`;
}

/** An empty tally, in a fixed order so a breakdown always reads the same way. */
export function emptyStepTally(): Record<StepKind, number> {
    return Object.fromEntries(STEP_KINDS.map(s => [s.kind, 0])) as Record<StepKind, number>;
}
