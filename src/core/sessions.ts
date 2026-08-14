import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { AgentInfo } from './agents';
import {
    applyBinding, BindableSession, bindSession, isBindingHit, LaunchBinding, normCwd
} from './launchBinding';
import { addUsage, contextAfter, emptyUsage, PricingEngine, RawUsage, toUsage, totalTokens, Usage, weightedTokens } from './pricing';
import { normalizeMarks, SessionMarks } from './sessionmarks';
import { dayKey, normPath, truncate } from './util';

export interface DailyBucket {
    cost: number;
    usage: Usage;
    /** Sonnet-input-equivalent tokens — what the day cost the plan limit, as
     *  opposed to `usage`'s raw sum. See QUOTA_WEIGHTS. */
    wTokens: number;
    assistantMsgs: number;
}

export interface FeedEvent {
    ts: number;
    kind: 'prompt' | 'tool' | 'error';
    tool?: string;
    detail: string;
    sessionFile: string;
    agentId?: string;
    agentName?: string;
}

export interface RecentMsg {
    ts: number;
    tokens: number;
    /** Sonnet-input-equivalent tokens — see QUOTA_WEIGHTS. */
    wTokens: number;
    cost: number;
}

/** Per-turn rollup collected at parse time. A turn opens at each non-sidechain,
 *  non-meta user text message — the same rule the session viewer uses, so turn
 *  numbers and totals here match the viewer's turn table exactly. */
export interface SessionTurn {
    /** 1-based turn number within its session. */
    n: number;
    /** Opening prompt snippet; typed /commands show as the command name. */
    label: string;
    /** Opening prompt time — other surfaces deep-link via openSession(file, ts). */
    ts: number;
    tokens: number;
    /**
     * The same turn measured in what the plan limit actually charges —
     * Sonnet-input-equivalent tokens, see QUOTA_WEIGHTS. Carried next to
     * `tokens` everywhere rather than instead of it: the raw figure says how
     * much text moved, this one says how much of the window it burned, and
     * showing only the first is what made a turn with fewer calls but a bigger
     * context look like a miscount.
     */
    wTokens: number;
    cost: number;
    /**
     * Round trips to the model inside this turn.
     *
     * ‼️ NOT THE SAME NUMBER AS `steps`, AND THAT IS THE POINT. One API call
     * carries several content blocks, so a turn's step count can hold steady
     * while its call count halves — and the tokens follow the CALLS. Surfaces
     * that showed only one of the two made a change in the other look like a
     * counting fault. Counted inside the dedup guard, off the same lines the
     * tokens come from.
     */
    apiCalls: number;
    /**
     * EVERY step the turn took: thinking + reply fragments + tool calls.
     *
     * ‼️ IT USED TO LEAVE OUT THE MOST EXPENSIVE KIND. A step was defined as
     * "a reply fragment or a tool call", so the model's own reasoning — the
     * thing `stepkind.ts` calls `think` and the thing billed at the OUTPUT rate
     * — was not in the total that called itself the total. Measured over the
     * six largest recent transcripts on this machine (2026-08-07): 149 text
     * blocks, 1 583 tool calls, 490 thinking blocks — so the number labelled
     * "steps" was reporting 1 732 of 2 222, a **22% under-count**, and the
     * missing fifth was the part that cost the most. `thinking` below carries
     * the same figure separately so a hover can still say what the total is
     * made of.
     *
     * Tool RESULTS are deliberately not here: a result is the answer coming
     * back, not a step the agent took, and counting them roughly doubles the
     * figure (they run 1:1 with tool calls — 1 582 against 1 583 in the same
     * measurement).
     */
    steps: number;
    /** Of those steps, the ones that were the model reasoning. */
    thinking: number;
    /** Prompt → last recorded line, in ms. 0 while the turn is still open. */
    ms: number;
    /** What the window held when the turn ended (0 = never measured). */
    endCtx: number;
    /** Tool calls answered inside this turn (sidechain work bills to the open turn). */
    tools: number;
    /** Tool errors inside this turn. */
    errors: number;
    /** Model(s) that served this turn — can change mid-session. */
    models: string[];
}

export interface SessionInfo {
    file: string;
    sessionId: string;
    isSidechain: boolean;
    /** G6: parent session id for nested subagent transcripts (…/<parentId>/subagents/x.jsonl). */
    parentSessionId?: string;
    /** E1: which machine's claudeDir this session came from (undefined = this machine). */
    machine?: string;
    /** E3: external CLI id (gemini/codex/…) — set only by external SessionSources, never by the claude scan. */
    source?: string;
    agentId?: string;
    agentName?: string;
    /** ‼️ S-31 — the project the RUN that produced this was created under, from
     *  its launch binding. Never deduced from the folder: a repo can belong to
     *  several projects and a path is not a decision anybody made. */
    projectId?: string;
    cwd?: string;
    title: string;
    /** Title derived from the transcript, kept so clearing a user rename can restore it. */
    autoTitle: string;
    /**
     * The session's OPENING PROMPT, whole (up to FIRST_PROMPT_MAX).
     *
     * The title is eighty characters of it, which answers "which session" and
     * nothing else — "what was this actually asked to do" was reachable only by
     * opening the transcript. It rides on the session because the Sessions
     * tables show it on hover (AFTip), and a hover cannot make a round trip.
     */
    firstPrompt?: string;
    /** Display name the session was started with (`claude -n …`), read from the
     *  CLI's own session registry (cliSessions.ts) — not in the transcript. */
    cliName?: string;
    /** On the user's shelf (sessionmarks.ts): listed first, never cut by a top-N. */
    pinned?: boolean;
    /** User labels on this session — searched by the tables' text filter. */
    tags?: string[];
    firstTs: number;
    lastTs: number;
    mtime: number;
    models: string[];
    usage: Usage;
    /** Sonnet-input-equivalent tokens for the whole session — see QUOTA_WEIGHTS. */
    wTokens: number;
    cost: number;
    userTurns: number;
    assistantMsgs: number;
    toolCalls: number;
    tools: Record<string, number>;
    /** Skill invocations (Skill tool calls + typed /commands) by skill/command name. */
    skillCalls: Record<string, number>;
    /** Explicit tool touches of memory/<file>.md, by normPath'd full path (recall
     *  signal). Full paths so recalls attribute to the agent whose memory/ folder
     *  was actually read — a session reading ANOTHER agent's memory (or the
     *  ~/.claude auto-memory) must not inflate its own matrix cell. */
    memoryReads: Record<string, number>;
    /** Files this session WROTE to (Edit/Write/MultiEdit/NotebookEdit), by
     *  normPath'd full path → number of write calls. Counted during the one
     *  parse the index already does, so "what did this session touch?" costs
     *  nothing extra; the per-edit detail is read on demand (codeedits.ts). */
    filesEdited: Record<string, number>;
    errors: number;
    version?: string;
    gitBranch?: string;
    permissionMode?: string;
    /** Last time a tool touched the agent's DUTIES.md in this session (duty compliance signal). */
    dutiesReadTs?: number;
    /** Approximate context size after the last assistant reply (prompt + cache + output of the latest request). */
    lastCtxTokens?: number;
    /**
     * ‼️ THE WINDOW THAT FIGURE IS A FRACTION OF — the ENGINE'S own, not Claude's.
     *
     * A ctx cell drawn as a percentage needs a denominator, and every surface
     * was using the Claude default because that was the only engine that had a
     * row. Codex states its window on every `token_count` line
     * (`model_context_window`, measured 258 400 on this machine's plan) and a
     * percentage computed against 200k instead would be wrong by a third while
     * looking authoritative. Absent means "this source does not say" — the
     * surfaces fall back to the configured default and say which they used.
     */
    ctxWindow?: number;
    /** How the CLI was entered, verbatim from the transcript: 'cli' (interactive
     *  terminal), 'sdk-cli' (`claude -p` / SDK), 'claude-desktop', … Feeds
     *  `sessionOrigin`; absent on external-CLI sessions that have no transcript. */
    entrypoint?: string;
    /** Agent Farm's Console hosted this session: `sdk-cli` in the transcript, a
     *  person at the keyboard in reality. Set from the id registry, not the file. */
    consoleHosted?: boolean;
    /**
     * ‼️ AGENT FARM STARTED THIS RUN ITSELF — and knows which mechanism did.
     *
     * The transcript's `entrypoint` says the CLI was entered by a program and
     * cannot say WHICH program, so the origin column was reading a proxy. When
     * a task / schedule / trigger / mission run is matched to its transcript
     * the launcher is a recorded FACT, and a fact beats a proxy: this is
     * consulted before anything else in `sessionOrigin`.
     *
     * `kind` is the mechanism ('task' · 'schedule' · 'trigger' · 'mission');
     * `label` is what a person calls it — the schedule's name, the task's title.
     */
    launchedBy?: { kind: string; label: string };
    /**
     * ‼️ S-32 — THE SCAN COULD NOT READ THIS TRANSCRIPT IN FULL.
     *
     * Present only on a session whose file is over the read ceiling
     * (`bytes` measured, `limit` passed). Its identity, its file and its time
     * are real; every figure on the row is an UNREAD zero rather than a
     * measured one, and the surfaces say so — the alternative, which is what
     * used to happen, is that the session vanished from the index entirely and
     * nothing anywhere said why. Absent on every session that was read.
     */
    scanLimit?: { bytes: number; limit: number };
    daily: Record<string, DailyBucket>;
    /** assistant message counts in 7x24 local-time buckets, index = dow*24+hour */
    heat: number[];
    events: FeedEvent[];
    recentMsgs: RecentMsg[];
    /** Per-turn rollup, in order — powers the Turns page and the turns.list bridge op. */
    turns: SessionTurn[];
}

/** Who started a session: 'user' = a person at a keyboard, 'auto' = a program. */
export type SessionOrigin = 'user' | 'auto';

/**
 * Read the origin off the transcript's own `entrypoint` field — never guessed
 * from timing or prompt shape. An `sdk-*` entrypoint means a program launched
 * the CLI (a schedule / trigger / task / mission run, or a hand-written
 * `claude -p` one-shot); every other entrypoint is an interactive session a
 * person is sitting in ('cli', 'claude-desktop', …). An unknown entrypoint
 * reads as 'user': the Sessions tables default to the User scope, and a filter
 * that hides real dialogs is worse than one that shows an extra robot row.
 *
 * **The Console is the exception the entrypoint cannot see.** A Console session
 * is a person typing, but it reaches the CLI over the same streaming `-p`
 * channel a headless run does, so its transcript says `sdk-cli` too. Reading
 * only the entrypoint therefore filed every conversation held in the panel
 * under "automation" — and the Sessions tables, the dashboards and the Turns
 * page, which default to the User scope, showed no sign that the conversation
 * had ever happened. Agent Farm knows which ids it hosted (`consoleHosted`,
 * carried in `globalStorage/console-sessions.json`), so it says so.
 *
 * ‼️ …AND THAT EXCEPTION IS NOT ALLOWED TO OUTRANK A KNOWN LAUNCHER. The id
 * list is a list of ids a Console has ever HELD, which includes every session
 * it was asked to `--resume`; opening a robot's transcript in the panel to read
 * it therefore relabelled the run, permanently, as a person's dialog. A run
 * Agent Farm itself started (`launchedBy` — the task/schedule/trigger/mission
 * that owns the transcript) is automation whatever happened to it afterwards,
 * so that is read FIRST. Measured on a real case: a scheduled headless run
 * appeared under 🧑 User while its own limit-retries appeared under 🤖 Auto.
 */
export function sessionOrigin(
    s: Pick<SessionInfo, 'entrypoint' | 'consoleHosted' | 'launchedBy'>
): SessionOrigin {
    if (s.launchedBy) { return 'auto'; }
    if (s.consoleHosted) { return 'user'; }
    return String(s.entrypoint ?? '').startsWith('sdk') ? 'auto' : 'user';
}

interface JsonlLine {
    type?: string;
    summary?: string;
    isMeta?: boolean;
    isSidechain?: boolean;
    timestamp?: string;
    cwd?: string;
    sessionId?: string;
    version?: string;
    gitBranch?: string;
    permissionMode?: string;
    requestId?: string;
    entrypoint?: string;
    costUSD?: number;
    message?: {
        id?: string;
        role?: string;
        model?: string;
        content?: unknown;
        usage?: RawUsage;
    };
}

const RECENT_MSG_WINDOW_MS = 48 * 3600 * 1000;
const MAX_EVENTS_PER_FILE = 40;
/**
 * How much of the opening prompt the index keeps (`SessionInfo.firstPrompt`).
 *
 * The index holds every session in memory, so this is a per-session cost paid
 * for ever: 4000 characters over a few thousand transcripts is a few megabytes,
 * which buys a hover that shows what nearly every real prompt actually said.
 * A prompt longer than this is a pasted document, and the tail of a pasted
 * document is not what the hover is for — open the session.
 */
const FIRST_PROMPT_MAX = 4000;

/** Tools that change a file on disk (codeedits.ts parses their inputs in full). */
export const WRITE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

function toolDetail(input: Record<string, unknown> | undefined): string {
    if (!input) { return ''; }
    const cand = input['file_path'] ?? input['command'] ?? input['description'] ??
        input['pattern'] ?? input['query'] ?? input['url'] ?? input['prompt'] ?? '';
    return truncate(String(cand), 90);
}

/**
 * An attachment marker the harness writes in front of what the person typed:
 * `[Image #2] look at this`, `[Pasted text #1 +40 lines] and fix it`. The marker
 * is machinery, the sentence after it is not — so it comes off and the sentence
 * stays. Recognised by SHAPE (a short bracket carrying `#<n>`), never by a list
 * of names, because the names change and the shape does not.
 */
const ATTACHMENT_MARK = /^\[[^\]]{0,60}#\d+[^\]]{0,60}\]\s*/;

/** A whole message that is nothing but one bracketed notice — the harness
 *  speaking in the user's place: `[Request interrupted by user]`. */
const WHOLE_NOTICE = /^\[[^\]]*\]$/;

/**
 * ‼️ IS THIS THE CONVERSATION, OR IS IT THE MACHINERY TALKING?
 *
 * One function answers it, and every surface that names a session asks THIS one.
 * There used to be a second copy in the session viewer, which is how the rule
 * drifted in the first place: two lists of exceptions, maintained separately,
 * agreeing by luck.
 *
 * Four kinds of machinery ride in the transcript as ordinary user messages, and
 * a session named after any of them is named after its own plumbing:
 *
 *   `<…>`   command blocks, local-command output, system reminders
 *   `/…`    a typed slash command — the command is not what the session is about
 *   `!…`    shell passthrough
 *   `[…]`   ‼️ a bracketed NOTICE, whole: `[Request interrupted by user]`.
 *           This is the one that got through, and it produced exactly the
 *           failure reported — a session named after a STATE rather than after
 *           anything anybody said.
 *
 * ‼️ AND THE DISTINCTION THAT MATTERS: only a message that is ENTIRELY the
 * bracket is machinery. `[Image #2] look at this file` is a person talking with
 * an attachment in front of it — measured, it is a real title in this vault —
 * so the marker is stripped and the sentence names the session. A blanket
 * "starts with [" rule would have thrown that away, which is why the shape is
 * checked rather than the first character.
 *
 * Empty means "not a name" and the caller simply asks the next message; nothing
 * is invented and no prompt is dropped from any count.
 */
export function conversationTitle(text: string): string {
    let t = String(text ?? '').replace(/\s+/g, ' ').trim();
    while (ATTACHMENT_MARK.test(t)) { t = t.replace(ATTACHMENT_MARK, ''); }
    if (t.startsWith('<')) { return commandArgsTitle(t); }
    if (!t || t.startsWith('/') || t.startsWith('!')) { return ''; }
    if (WHOLE_NOTICE.test(t)) { return ''; }
    return truncate(t, 80);
}

/**
 * ‼️ A SLASH COMMAND IS MACHINERY. WHAT WAS TYPED AFTER IT IS NOT.
 *
 * `/goal finish the top eight backlog items` reaches the transcript as a
 * command block — `<command-name>/goal</command-name>` with the sentence in
 * `<command-args>` — and the block starts with `<`, so the whole turn was
 * discarded as plumbing. The command was; the argument was the entire brief.
 * Sessions opened this way were then named by whatever ordinary message came
 * next, several turns later, which in practice is a continuation ("keep going",
 * "devam et") — a session named after its own interruption while the sentence
 * that says what it is about sat in the first turn, thrown away.
 *
 * The shape test is why this is safe. Args are taken only when they read as
 * PROSE — a space and enough characters to be a sentence — so `/loop 5m /x`,
 * `/goal clear` and `/model opus` are still machinery and the session goes on
 * to be named by something a person said. And the args run back through
 * `conversationTitle`, so an argument that is itself a notice or another
 * command gets the same judgment as any other text; there is one rule here.
 */
const COMMAND_ARGS = /<command-args>([\s\S]*?)<\/command-args>/;
/** Below this, the argument is a flag or a word, not a description of work. */
const ARGS_MIN_CHARS = 15;

function commandArgsTitle(text: string): string {
    const m = COMMAND_ARGS.exec(text);
    const args = (m?.[1] ?? '').replace(/\s+/g, ' ').trim();
    if (args.length < ARGS_MIN_CHARS || !args.includes(' ')) { return ''; }
    return conversationTitle(args);
}

/** Turn label from its opening prompt: typed /commands show as the command
 *  name, everything else as a whitespace-collapsed snippet (viewer semantics). */
function turnLabel(text: string): string {
    const cmd = /<command-name>([^<]+)<\/command-name>/.exec(text);
    if (cmd) { return cmd[1].trim(); }
    return truncate(text, 90);
}

function textOfContent(content: unknown): string {
    if (typeof content === 'string') { return content; }
    if (Array.isArray(content)) {
        return content
            .filter((b): b is { type: string; text?: string } =>
                !!b && typeof b === 'object' && (b as { type?: string }).type === 'text')
            .map(b => b.text ?? '')
            .join('\n');
    }
    return '';
}

export function parseSessionFile(
    file: string,
    pricing: PricingEngine,
    projectDirDepth: number
): SessionInfo | undefined {
    let raw: string;
    let st: fs.Stats;
    try {
        raw = fs.readFileSync(file, 'utf8');
        st = fs.statSync(file);
    } catch { return undefined; }

    const info: SessionInfo = {
        file,
        sessionId: path.basename(file, '.jsonl'),
        isSidechain: projectDirDepth > 0,
        title: '',
        autoTitle: '',
        firstTs: 0,
        lastTs: 0,
        mtime: st.mtimeMs,
        models: [],
        usage: emptyUsage(),
        wTokens: 0,
        cost: 0,
        userTurns: 0,
        assistantMsgs: 0,
        toolCalls: 0,
        tools: {},
        skillCalls: {},
        memoryReads: {},
        filesEdited: {},
        errors: 0,
        daily: {},
        heat: new Array(168).fill(0),
        events: [],
        recentMsgs: [],
        turns: []
    };

    const seenUsageKeys = new Set<string>();
    const models = new Set<string>();
    const now = Date.now();
    // Per-turn model sets, parallel to info.turns (materialized as arrays at the end).
    const turnModelSets: Set<string>[] = [];
    const openTurn = (text: string, tsIn: number) => {
        info.turns.push({
            n: info.turns.length + 1, label: turnLabel(text), ts: tsIn,
            tokens: 0, wTokens: 0, cost: 0, apiCalls: 0, steps: 0, thinking: 0, ms: 0, endCtx: 0,
            tools: 0, errors: 0, models: []
        });
        turnModelSets.push(new Set());
    };
    const curTurn = () => info.turns.length ? info.turns[info.turns.length - 1] : undefined;

    for (const lineText of raw.split('\n')) {
        if (!lineText.trim()) { continue; }
        let line: JsonlLine;
        try { line = JSON.parse(lineText); } catch { continue; }

        const ts = line.timestamp ? Date.parse(line.timestamp) : 0;
        if (ts) {
            if (!info.firstTs) { info.firstTs = ts; }
            info.lastTs = Math.max(info.lastTs, ts);
        }
        if (line.cwd && !info.cwd) { info.cwd = line.cwd; }
        if (line.version) { info.version = line.version; }
        if (line.gitBranch) { info.gitBranch = line.gitBranch; }
        if (line.entrypoint && !info.entrypoint) { info.entrypoint = line.entrypoint; }
        if (line.isSidechain) { info.isSidechain = true; }

        if (line.type === 'summary' && line.summary && !info.title) {
            info.title = truncate(line.summary, 80);
            continue;
        }
        if (line.type === 'permission-mode' && line.permissionMode) {
            info.permissionMode = line.permissionMode;
            continue;
        }

        if (line.type === 'user' && line.message) {
            const content = line.message.content;
            const countPrompt = (text: string) => {
                // ‼️ THE TURN IS COUNTED EITHER WAY. A harness notice really did
                // arrive as a user message, and a count that quietly disagreed
                // with the transcript would be a worse bug than a bad name. What
                // changes is only whether it may SPEAK FOR the session.
                info.userTurns++;
                const said = conversationTitle(text);
                if (!info.title) { info.title = said; }
                // The whole opening ask, kept once — see SessionInfo.firstPrompt.
                // Same judgment as the title, deliberately: the hover says "the
                // opening prompt", and `[Request interrupted by user]` is not one.
                if (info.firstPrompt === undefined && said) {
                    info.firstPrompt = truncate(text.trim(), FIRST_PROMPT_MAX);
                }
                if (ts) {
                    info.events.push({
                        ts, kind: 'prompt', detail: truncate(text, 90), sessionFile: file
                    });
                }
            };
            const countCommand = (text: string) => {
                // Typed /commands land as <command-name>/x</command-name> user messages.
                const m = /<command-name>\/?([\w:-]+)<\/command-name>/.exec(text);
                if (m) { info.skillCalls[m[1]] = (info.skillCalls[m[1]] ?? 0) + 1; }
                // ‼️ THE ARGUMENT IS THE BRIEF — see commandArgsTitle. This turn
                // is NOT counted as a prompt (`userTurns` is untouched, and the
                // figures every table shows stay exactly what the transcript
                // says); all it may do is SPEAK FOR the session when nothing
                // else has yet.
                const said = conversationTitle(text);
                if (!said) { return; }
                if (!info.title) { info.title = said; }
                if (info.firstPrompt === undefined) {
                    // What the person actually typed, command and all — the
                    // hover promises the opening prompt, and `/goal …` is it.
                    const args = (/<command-args>([\s\S]*?)<\/command-args>/.exec(text)?.[1] ?? '').trim();
                    info.firstPrompt = truncate(`/${m ? m[1] : ''} ${args}`.trim(), FIRST_PROMPT_MAX);
                }
            };
            if (typeof content === 'string') {
                if (!line.isMeta) {
                    if (!line.isSidechain) { openTurn(content, ts); }
                    if (!content.startsWith('<')) { countPrompt(content); }
                    else { countCommand(content); }
                }
            } else if (Array.isArray(content)) {
                for (const block of content as { type?: string; is_error?: boolean; text?: string }[]) {
                    if (block?.type === 'tool_result' && block.is_error) {
                        info.errors++;
                        const t = curTurn();
                        if (t) { t.errors++; }
                        if (ts) {
                            info.events.push({
                                ts, kind: 'error', detail: 'tool error', sessionFile: file
                            });
                        }
                    } else if (block?.type === 'text' && block.text && !line.isMeta) {
                        // Newer transcripts carry user prompts as text blocks in an array.
                        if (!line.isSidechain) { openTurn(block.text, ts); }
                        if (!block.text.startsWith('<')) { countPrompt(block.text); }
                        else { countCommand(block.text); }
                    }
                }
            }
            continue;
        }

        if (line.type === 'assistant' && line.message) {
            const msg = line.message;
            if (msg.model && msg.model !== '<synthetic>') {
                models.add(msg.model);
                if (turnModelSets.length) { turnModelSets[turnModelSets.length - 1].add(msg.model); }
            }

            // Zero = no measurement (a synthetic row), so the last REAL figure
            // stands — see contextAfter.
            const ctxNow = contextAfter(msg.usage);
            if (ctxNow > 0) { info.lastCtxTokens = ctxNow; }
            {
                // Where the turn stands: how long it has run and where it left
                // the window. Both track the LAST line seen, so a turn still
                // being written reports what it has reached so far.
                const t = curTurn();
                if (t) {
                    if (ctxNow > 0) { t.endCtx = ctxNow; }
                    if (ts && t.ts && ts > t.ts) { t.ms = ts - t.ts; }
                }
            }

            let msgCost = 0;
            let msgTokens = 0;
            let msgWTokens = 0;
            const usageKey = `${msg.id ?? ''}:${line.requestId ?? ''}`;
            const alreadyCounted = usageKey !== ':' && seenUsageKeys.has(usageKey);
            if (!alreadyCounted && msg.usage) {
                if (usageKey !== ':') { seenUsageKeys.add(usageKey); }
                // ‼️ Read through toUsage, never field by field: the flat
                // cache-creation number throws away the TTL split, and a
                // 1-hour write costs 1.6x what a 5-minute one does.
                const u: Usage = toUsage(msg.usage);
                addUsage(info.usage, u);
                msgTokens = totalTokens(u);
                // Weighted off the SAME line, inside the SAME dedup guard, from
                // the model that actually served it — so the raw figure and the
                // limit figure can never tell two different stories about one
                // reply. Never taken from `costUSD`: that is billing, and the
                // user may re-rate it (see QUOTA_WEIGHTS).
                msgWTokens = weightedTokens(msg.model ?? '', u);
                msgCost = typeof line.costUSD === 'number'
                    ? line.costUSD
                    : pricing.costFor(msg.model ?? '', u, ts);
                info.cost += msgCost;
                info.wTokens += msgWTokens;
                const t = curTurn();
                if (t && (msgTokens || msgCost)) {
                    // Usage bills to the open turn — including sidechain work,
                    // matching the viewer's turn-total accounting.
                    t.tokens += msgTokens;
                    t.wTokens += msgWTokens;
                    t.cost += msgCost;
                    // One round trip, counted off the same line the tokens came
                    // from (inside the dedup guard) so the two can never
                    // disagree — see SessionTurn.apiCalls.
                    t.apiCalls++;
                }

                if (ts) {
                    const day = dayKey(ts);
                    const bucket = info.daily[day] ??
                        (info.daily[day] = { cost: 0, usage: emptyUsage(), wTokens: 0, assistantMsgs: 0 });
                    bucket.cost += msgCost;
                    addUsage(bucket.usage, u);
                    bucket.wTokens += msgWTokens;
                    bucket.assistantMsgs++;

                    const d = new Date(ts);
                    info.heat[d.getDay() * 24 + d.getHours()]++;

                    if (now - ts < RECENT_MSG_WINDOW_MS) {
                        info.recentMsgs.push({ ts, tokens: msgTokens, wTokens: msgWTokens, cost: msgCost });
                    }
                }
            }
            info.assistantMsgs++;

            if (Array.isArray(msg.content)) {
                for (const block of msg.content as { type?: string; name?: string; text?: string; input?: Record<string, unknown> }[]) {
                    // A step is one thing the agent did: it reasoned, it wrote,
                    // or it called a tool. All three, because the total has to
                    // be the total (see SessionTurn.steps).
                    if (block?.type === 'thinking' || block?.type === 'redacted_thinking') {
                        const t = curTurn();
                        if (t) { t.steps++; t.thinking++; }
                    }
                    if (block?.type === 'text' && block.text?.trim()) {
                        const t = curTurn();
                        if (t) { t.steps++; }
                    }
                    if (block?.type === 'tool_use' && block.name) {
                        info.toolCalls++;
                        info.tools[block.name] = (info.tools[block.name] ?? 0) + 1;
                        {
                            const t = curTurn();
                            if (t) { t.tools++; t.steps++; }
                        }
                        if (block.name === 'Skill') {
                            const skillName = String(block.input?.['skill'] ?? '').trim();
                            if (skillName) {
                                info.skillCalls[skillName] = (info.skillCalls[skillName] ?? 0) + 1;
                            }
                        }
                        const filePath = String(block.input?.['file_path'] ?? block.input?.['notebook_path'] ?? '');
                        // What the agent did to the code: every tool that WRITES
                        // a file, counted per file. Reads are deliberately not
                        // here — "touched" would make the column meaningless.
                        if (filePath && WRITE_TOOLS.has(block.name)) {
                            const key = normPath(filePath);
                            info.filesEdited[key] = (info.filesEdited[key] ?? 0) + 1;
                        }
                        if (ts && filePath.toUpperCase().includes('DUTIES.MD')) {
                            info.dutiesReadTs = Math.max(info.dutiesReadTs ?? 0, ts);
                        }
                        // Memory recall signal: any tool explicitly touching a
                        // file inside a memory/ folder (Read/Edit/Write/…).
                        // Keyed by full normalized path — memusage attributes it
                        // to the agent whose folder it is, not to whoever read it.
                        if (/[\\/]memory[\\/][^\\/]+\.md$/i.test(filePath)) {
                            const key = normPath(filePath);
                            info.memoryReads[key] = (info.memoryReads[key] ?? 0) + 1;
                        }
                        if (ts) {
                            info.events.push({
                                ts, kind: 'tool', tool: block.name,
                                detail: toolDetail(block.input), sessionFile: file
                            });
                        }
                    }
                }
            }
        }
    }

    if (!info.title) {
        info.title = info.isSidechain ? 'Subagent task' : '(untitled session)';
    }
    info.autoTitle = info.title;
    if (info.events.length > MAX_EVENTS_PER_FILE) {
        info.events = info.events.slice(-MAX_EVENTS_PER_FILE);
    }
    info.models = [...models];
    info.turns.forEach((t, i) => { t.models = [...turnModelSets[i]]; });
    return info;
}

export interface ClaudeDirRef {
    /** machine label shown on sessions; undefined = this machine. */
    name?: string;
    dir: string;
}

export class SessionIndex implements vscode.Disposable {
    private sessions = new Map<string, SessionInfo>();
    /** User-set session names (sessionId → title), persisted by the extension. */
    private titleOverrides = new Map<string, string>();
    /** User shelf marks (sessionId → pin/tags), persisted by the extension. */
    private marks: SessionMarks = {};
    /** Session ids the Console hosted — see setConsoleSessions. */
    private consoleIds = new Set<string>();
    /** Session id → the farm mechanism that started it — see setLaunchers. */
    private launchers = new Map<string, { kind: string; label: string }>();
    /** ‼️ S-31 — the runs Agent Farm started, written at the spawn. */
    private bindings: LaunchBinding[] = [];
    /** Files the scope filter dropped, as little of them as a binding needs to
     *  claim one later. Five fields, not the parsed session — this is a memo,
     *  not a second index. */
    private dropped = new Map<string, BindableSession & { depth: number; machine?: string }>();
    /** ‼️ S-31 — transcripts that more than one of our own runs could have
     *  produced. Keyed by file; a diagnostic, never a decision. */
    private bindingDoubts = new Map<string, string>();
    /** Session display names from the CLI's registry (sessionId → -n name). */
    private cliNames = new Map<string, string>();
    private watchers: fs.FSWatcher[] = [];
    private pending = new Map<string, NodeJS.Timeout>();
    private readonly onDidUpdateEmitter = new vscode.EventEmitter<void>();
    readonly onDidUpdate = this.onDidUpdateEmitter.event;
    /** E1: configured extra dirs whose projects folder was not found on the last scan. */
    missingDirs: string[] = [];

    constructor(
        private claudeDir: string,
        /** E1: additional (synced) claude dirs from other machines. */
        private extraDirs: () => ClaudeDirRef[],
        private pricing: PricingEngine,
        private getAgents: () => AgentInfo[],
        private includeUnmatched: () => boolean,
        private activeThresholdMs: () => number
    ) {}

    get projectsDir(): string {
        return path.join(this.claudeDir, 'projects');
    }

    private allDirs(): ClaudeDirRef[] {
        return [{ dir: this.claudeDir }, ...this.extraDirs().filter(d => d?.dir)];
    }

    async scanAll(): Promise<void> {
        this.sessions.clear();
        this.missingDirs = [];
        for (const ref of this.allDirs()) {
            const projectsDir = path.join(ref.dir, 'projects');
            if (!fs.existsSync(projectsDir)) {
                if (ref.name) { this.missingDirs.push(ref.dir); }
                continue;
            }
            const files: { file: string; depth: number }[] = [];
            const walk = (dir: string, depth: number) => {
                let entries: fs.Dirent[] = [];
                try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
                for (const e of entries) {
                    const p = path.join(dir, e.name);
                    if (e.isDirectory()) {
                        if (depth < 3) { walk(p, depth + 1); }
                    } else if (e.name.endsWith('.jsonl')) {
                        files.push({ file: p, depth });
                    }
                }
            };
            let projectDirs: fs.Dirent[] = [];
            try { projectDirs = fs.readdirSync(projectsDir, { withFileTypes: true }); } catch { /* ignore */ }
            for (const d of projectDirs) {
                if (d.isDirectory()) { walk(path.join(projectsDir, d.name), 0); }
            }
            for (const { file, depth } of files) {
                this.indexFile(file, depth, ref.name);
            }
        }
        this.onDidUpdateEmitter.fire();
    }

    private indexFile(file: string, depth: number, machine?: string): void {
        const info = parseSessionFile(file, this.pricing, depth);
        if (!info) { this.sessions.delete(file); return; }
        info.machine = machine;
        if (depth > 0) {
            // …/<projectDir>/<parentSessionId>/(subagents/)…/file.jsonl
            const segments = file.split(/[\\/]/);
            info.parentSessionId = segments[segments.length - 1 - depth];
        }
        this.applyTitle(info);
        this.applyMark(info);
        this.assignAgent(info);
        // ‼️ S-31 — BEFORE THE SCOPE FILTER, NOT AFTER IT. The filter's question
        // is "is this one of ours", and a run the farm started itself has
        // already answered it in writing. Asked afterwards, the answer arrives
        // for a session that has just been thrown away.
        this.applyLaunchBinding(info);
        if (!info.agentId && !this.includeUnmatched()) {
            // Keep it out of the index — but REMEMBER the little it takes to
            // test it again. A binding published after this scan (a task that
            // starts in a minute, the one-time backfill, a window that opened
            // before the store loaded) has to be able to rescue the file
            // without a full re-walk of every projects folder on the machine.
            this.rememberDropped(file, info, depth, machine);
            this.sessions.delete(file);
            return;
        }
        this.dropped.delete(file);
        for (const ev of info.events) {
            ev.agentId = info.agentId;
            ev.agentName = info.agentName;
        }
        this.sessions.set(file, info);
    }

    private assignAgent(info: SessionInfo): void {
        if (!info.cwd) { return; }
        const cwd = normPath(info.cwd);
        let best: AgentInfo | undefined;
        for (const agent of this.getAgents()) {
            if (cwd === agent.normDir || cwd.startsWith(agent.normDir + '/')) {
                if (!best || agent.normDir.length > best.normDir.length) { best = agent; }
            }
        }
        if (best) {
            info.agentId = best.id;
            info.agentName = best.name;
        } else if (this.includeUnmatched()) {
            info.agentName = info.machine ? `Other projects (${info.machine})` : 'Other projects';
        }
    }

    /**
     * A session's title has three sources, in this order:
     *   1. the user's own rename — an explicit decision, always wins;
     *   2. the name it was STARTED with (`claude -n …`, from the CLI registry) —
     *      naming a session at launch has to mean something afterwards;
     *   3. the title derived from the first real prompt in the transcript.
     */
    private applyTitle(info: SessionInfo): void {
        info.cliName = this.cliNames.get(info.sessionId);
        info.title = this.titleOverrides.get(info.sessionId) ?? info.cliName ?? info.autoTitle;
    }

    /**
     * Replace the user-set session names and re-apply them to everything indexed.
     *
     * ‼️ INCLUDING THE EXTERNAL LIST, WHICH IS THE BUG THIS LINE EXISTS FOR
     * (X-35). Renaming a Codex, Gemini or Antigravity session wrote the override
     * to global state and then re-applied it to the claude map only — so the
     * name was accepted, stored, survived a reload, and was never shown
     * anywhere. A rename that has no visible effect reads as a broken menu
     * item, and every other setter here (`setCliNames`, `setMarks`,
     * `setLaunchers`) had already learned to walk both lists.
     */
    setTitleOverrides(map: Record<string, string>): void {
        this.titleOverrides = new Map(
            Object.entries(map).filter(([, v]) => typeof v === 'string' && v.trim()));
        for (const s of this.sessions.values()) { this.applyTitle(s); }
        for (const s of this.externalList) { this.applyTitle(s); }
        this.onDidUpdateEmitter.fire();
    }

    /** Replace the launch names read from the CLI's session registry. */
    setCliNames(map: Record<string, string>): void {
        this.cliNames = new Map(
            Object.entries(map).filter(([, v]) => typeof v === 'string' && v.trim()));
        for (const s of this.sessions.values()) { this.applyTitle(s); }
        for (const s of this.externalList) { this.applyTitle(s); }
        this.onDidUpdateEmitter.fire();
    }

    private applyMark(info: SessionInfo): void {
        const mark = this.marks[info.sessionId];
        info.pinned = mark?.pinned === true ? true : undefined;
        info.tags = mark?.tags?.length ? mark.tags : undefined;
        info.consoleHosted = this.consoleIds.has(info.sessionId) ? true : undefined;
        info.launchedBy = this.launchers.get(info.sessionId);
    }

    /**
     * ‼️ S-31 — DOES ONE OF OUR OWN RUNS CLAIM THIS TRANSCRIPT?
     *
     * The path test (`assignAgent`) has already run and may have found nothing,
     * which is exactly the case this repairs: an automation task whose working
     * folder is a code repo rather than its agent's own directory. A binding
     * supplies the owner the path could not; it never overrules one the path
     * DID find (see `applyBinding`).
     */
    private applyLaunchBinding(info: SessionInfo): void {
        if (!this.bindings.length) { return; }
        const r = bindSession(info, this.bindings, Date.now());
        if (!r) { this.bindingDoubts.delete(info.file); return; }
        if (!isBindingHit(r)) {
            // Two of our own runs could have written this. Recording which, and
            // saying so out loud, is the whole of the answer — a silent pick
            // would file a real transcript under the wrong task for ever.
            this.bindingDoubts.set(info.file, r.why);
            return;
        }
        this.bindingDoubts.delete(info.file);
        applyBinding(info, r);
    }

    /** The memo a dropped file leaves behind, so a later binding can claim it. */
    private rememberDropped(
        file: string, info: SessionInfo, depth: number, machine?: string
    ): void {
        this.dropped.set(file, {
            sessionId: info.sessionId, file, cwd: info.cwd, source: info.source,
            firstTs: info.firstTs, lastTs: info.lastTs, isSidechain: info.isSidechain,
            depth, machine
        });
    }

    /**
     * ‼️ S-31 — THE RUNS AGENT FARM STARTED, AND THE ONE THING THEY REPAIR.
     *
     * Handed in from the task store, which is where they are already persisted:
     * a restart rebuilds them from the same rows, so a binding outlives the
     * window that made it without a second store to keep in step.
     *
     * Publishing them re-tests the files the scope filter dropped, because the
     * usual order of events is precisely the wrong way round — the transcript
     * is written while the run is going and indexed at once, and a binding that
     * arrives a beat later would find nothing left to attach to.
     */
    setLaunchBindings(list: readonly LaunchBinding[]): void {
        const next = (list ?? []).filter(b => b && b.taskId && b.agentId && b.cwd && b.startedAt > 0);
        const sig = (b: LaunchBinding): string =>
            `${b.taskId}:${b.agentId}:${normCwd(b.cwd)}:${b.engine || 'claude'}:`
            + `${b.startedAt}:${b.endedAt ?? 0}:${b.sessionId ?? ''}:${b.kind}:${b.label}`;
        const before = this.bindings.map(sig).join('|');
        const after = next.map(sig).join('|');
        if (before === after) { return; }
        this.bindings = [...next];

        // The files that were thrown away: any that one of these claims comes
        // back, parsed properly this time.
        let rescued = 0;
        for (const memo of [...this.dropped.values()]) {
            const r = bindSession(memo, this.bindings, Date.now());
            if (!isBindingHit(r)) { continue; }
            this.dropped.delete(memo.file);
            if (fs.existsSync(memo.file)) {
                this.indexFile(memo.file, memo.depth, memo.machine);
                rescued++;
            }
        }
        // …and the sessions already indexed learn who started them, which is
        // what puts the schedule's name on the Origin column.
        for (const info of this.sessions.values()) { this.applyLaunchBinding(info); }
        for (const info of this.externalList) { this.applyLaunchBinding(info); }
        void rescued;
        this.onDidUpdateEmitter.fire();
    }

    /**
     * ‼️ S-31 — WHICH TRANSCRIPT EACH RUN ENDED UP WITH.
     *
     * The run record is where a person clicks through to a transcript from, so
     * the answer has to travel back: a session found only by the index is a
     * session the Tasks row still cannot link to. Cheap by construction — one
     * pass over the sessions rather than one pass per binding.
     */
    resolvedBindings(): { taskId: string; sessionId: string; file: string; proof: string }[] {
        if (!this.bindings.length) { return []; }
        const now = Date.now();
        const out: { taskId: string; sessionId: string; file: string; proof: string }[] = [];
        const taken = new Set<string>();
        for (const s of [...this.sessions.values(), ...this.externalList]) {
            const r = bindSession(s, this.bindings, now);
            if (!isBindingHit(r) || taken.has(r.binding.taskId)) { continue; }
            taken.add(r.binding.taskId);
            out.push({ taskId: r.binding.taskId, sessionId: s.sessionId, file: s.file, proof: r.proof });
        }
        return out;
    }

    /** ‼️ S-31 — the bindings and what each one resolved to, for the bridge and
     *  for a person asking why a run is not on the board. */
    launchBindingReport(): {
        bindings: (LaunchBinding & { resolved?: string; proof?: string })[];
        doubts: { file: string; why: string }[];
        droppedFiles: number;
    } {
        const byTask = new Map(this.resolvedBindings().map(r => [r.taskId, r]));
        return {
            bindings: this.bindings.map(b => ({
                ...b,
                resolved: byTask.get(b.taskId)?.sessionId,
                proof: byTask.get(b.taskId)?.proof
            })),
            doubts: [...this.bindingDoubts].map(([file, why]) => ({ file, why })),
            droppedFiles: this.dropped.size
        };
    }

    /**
     * Which of Agent Farm's own mechanisms started which session.
     *
     * Fed from the run records that already name their transcript (a task's
     * `costSessionFile`, and through it the schedule / trigger / mission that
     * created the task). This is the only PROOF of a launcher there is — the
     * transcript itself can say a program entered the CLI and never which one —
     * so `sessionOrigin` reads it before anything else, and the origin tooltip
     * can name the schedule instead of saying "automation" and stopping.
     */
    setLaunchers(map: Record<string, { kind: string; label: string }>): void {
        const next = new Map(Object.entries(map ?? {}).filter(([id, v]) => !!id && !!v));
        const same = next.size === this.launchers.size
            && [...next].every(([id, v]) => {
                const had = this.launchers.get(id);
                return had && had.kind === v.kind && had.label === v.label;
            });
        if (same) { return; }
        this.launchers = next;
        for (const s of this.sessions.values()) { this.applyMark(s); }
        for (const s of this.externalList) { this.applyMark(s); }
        this.onDidUpdateEmitter.fire();
    }

    /**
     * The sessions Agent Farm's own Console hosted. Their transcripts say
     * `sdk-cli` like any headless run, so without this list every conversation
     * held in the panel would be filed as automation and hidden from the User
     * scope the tables default to (see `sessionOrigin`).
     */
    setConsoleSessions(ids: string[]): void {
        const next = new Set(ids.filter(Boolean));
        if (next.size === this.consoleIds.size && [...next].every(id => this.consoleIds.has(id))) {
            return;
        }
        this.consoleIds = next;
        for (const s of this.sessions.values()) { this.applyMark(s); }
        this.onDidUpdateEmitter.fire();
    }

    /** Replace the shelf marks (pin / tags) and re-apply them to everything indexed. */
    setMarks(map: unknown): void {
        this.marks = normalizeMarks(map);
        for (const s of this.sessions.values()) { this.applyMark(s); }
        for (const s of this.externalList) { this.applyMark(s); }
        this.onDidUpdateEmitter.fire();
    }

    /** Pinned sessions, newest activity first — the shelf. */
    pinned(): SessionInfo[] {
        return [...this.all(), ...this.externalList]
            .filter(s => s.pinned)
            .sort((a, b) => (b.lastTs || b.mtime) - (a.lastTs || a.mtime));
    }

    /** Re-run agent assignment after agents were re-discovered. */
    reassignAgents(): void {
        for (const info of this.sessions.values()) {
            info.agentId = undefined;
            info.agentName = undefined;
            this.assignAgent(info);
            // ‼️ S-31 — re-discovering the agents must not un-own a run the farm
            // started: the path test is redone from scratch here, so the binding
            // has to be redone with it or a rescued session loses its owner the
            // first time an agent folder changes.
            this.applyLaunchBinding(info);
            for (const ev of info.events) {
                ev.agentId = info.agentId;
                ev.agentName = info.agentName;
            }
        }
        this.onDidUpdateEmitter.fire();
    }

    watch(): void {
        for (const w of this.watchers) { try { w.close(); } catch { /* already closed */ } }
        this.watchers = [];
        for (const ref of this.allDirs()) {
            const projectsDir = path.join(ref.dir, 'projects');
            if (!fs.existsSync(projectsDir)) { continue; }
            try {
                const watcher = fs.watch(projectsDir, { recursive: true }, (_event, filename) => {
                    if (!filename || !filename.toString().endsWith('.jsonl')) { return; }
                    const full = path.join(projectsDir, filename.toString());
                    const prev = this.pending.get(full);
                    if (prev) { clearTimeout(prev); }
                    this.pending.set(full, setTimeout(() => {
                        this.pending.delete(full);
                        const rel = path.relative(projectsDir, full);
                        const depth = rel.split(path.sep).length - 2; // projectDir/file = depth 0
                        if (fs.existsSync(full)) {
                            this.indexFile(full, Math.max(0, depth), ref.name);
                        } else {
                            this.sessions.delete(full);
                        }
                        this.onDidUpdateEmitter.fire();
                    }, 400));
                });
                this.watchers.push(watcher);
            } catch { /* recursive watch unavailable — refresh stays manual */ }
        }
    }

    all(): SessionInfo[] {
        return [...this.sessions.values()];
    }

    forAgent(agentId: string): SessionInfo[] {
        return this.all().filter(s => s.agentId === agentId);
    }

    // ---- E3: externally-sourced sessions (other CLIs) ----
    // Deliberately a side list: all()/forAgent() stay claude-only, so the many
    // claude-specific consumers (health, mcp/skill/memory usage, reports,
    // search, OTLP, …) structurally never see foreign sessions. UI surfaces
    // that want them ask for external() explicitly.

    private externalList: SessionInfo[] = [];
    private externalSig = '';

    setExternal(sessions: SessionInfo[]): void {
        /**
         * ‼️ THE FARM'S SCOPE RULE IS THE FARM'S, NOT CLAUDE'S (X-35).
         *
         * `includeUnmatchedProjects` is the user's answer to "do I want to see
         * conversations from folders that are not my agents". It was applied
         * only in the claude parse (`indexFile`), so the same folder produced
         * two different answers depending on which CLI you had opened there:
         * the Claude session was dropped and the Codex one beside it was listed
         * with no agent at all. A scope switch that governs one engine of four
         * is not a scope switch.
         *
         * Included-but-unattributed rows get the same "Other projects" name the
         * claude path gives them, so the two are one list and not two shapes.
         * The gate is part of the signature: flipping the setting must redraw
         * even when nothing on disk moved.
         */
        const include = this.includeUnmatched();
        // ‼️ S-31 — AND THE SAME REPAIR ON THIS SIDE OF THE SPLIT. A Codex or
        // Gemini task started by a schedule is dropped by exactly the same rule
        // and for exactly the same wrong reason; a fix that only reached the
        // claude parse would make the scope switch mean two different things
        // again, which is the bug this filter was corrected for once already.
        for (const s of sessions) { this.applyLaunchBinding(s); }
        const kept = sessions.filter(s => s.agentId || include);
        for (const s of kept) {
            if (!s.agentId && !s.agentName) {
                s.agentName = s.machine ? `Other projects (${s.machine})` : 'Other projects';
            }
        }
        const sig = (include ? 'w|' : 'n|')
            + kept.map(s => `${s.sessionId}:${s.lastTs}:${s.userTurns}:${s.toolCalls}`).join('|');
        if (sig === this.externalSig) { return; }
        this.externalSig = sig;
        this.externalList = kept;
        // ‼️ The title BEFORE the marks, and both on every rescan (X-35). A
        // source re-parses its transcript whenever the file changes and hands
        // back a freshly derived title, so a rename applied once would be
        // silently undone the next time the user said anything in that session —
        // the same rename bug as `setTitleOverrides`, one scan later.
        for (const s of this.externalList) { this.applyTitle(s); this.applyMark(s); }
        this.onDidUpdateEmitter.fire();
    }

    external(): SessionInfo[] {
        return this.externalList;
    }

    /**
     * ‼️ WHAT A SESSIONS **TABLE** IS FOR, AS OPPOSED TO AN ANALYTIC (X-27).
     *
     * The side list above is right for everything that MEASURES: cost, plan
     * window, cache health, model totals, recall, duty compliance — all of it
     * is defined against Claude's transcript format and would either read zero
     * or read wrong on a foreign one. What it is not right for is the LOG. A
     * table headed "Sessions" that silently holds one CLI's conversations is
     * not a filtered table, it is a table that lies about its own subject:
     * every row you had with Codex, Gemini or Antigravity was unreachable from
     * the Sessions page, the Dashboard, an agent's page and a project's page at
     * once, and nothing on any of them said so.
     *
     * So the split stays exactly where it was and this is the one call the
     * ROW-BUILDING surfaces make. Do not reach for it from an analytic; the
     * figures a foreign session carries are honestly zero, and averaging them
     * in is how a farm's cost per session halves overnight for no reason.
     */
    allWithExternal(): SessionInfo[] {
        return [...this.sessions.values(), ...this.externalList];
    }

    /** The same widening for one agent — an agent's own page is a log too. */
    forAgentWithExternal(agentId: string): SessionInfo[] {
        return this.allWithExternal().filter(s => s.agentId === agentId);
    }

    /**
     * ‼️ ONE RESOLVER FOR "WHICH SESSION IS THIS ID?" — across every engine.
     *
     * X-35 found the same three-line lookup written out at a dozen call sites,
     * all of them `index.all().find(s => s.sessionId === id)`, all of them
     * therefore CLAUDE-ONLY. Each one failed differently and quietly on a
     * foreign session: the Console resumed a Codex thread with no carried
     * usage and charged the whole conversation to its first turn; the live rows
     * lost their title, tokens and turn count; the Session Viewer lost the
     * owning agent and the launcher that started it.
     *
     * "Which conversation is this?" is a RECORD question, and the record covers
     * all four engines. It is a different question from "what did it cost",
     * which is a MEASUREMENT and stays on `all()` — that separation is the
     * whole point of the two pools, and it is only safe when the record side
     * has one obvious call to make.
     */
    /**
     * …and the same resolver from the other direction: which session is in this
     * FILE.
     *
     * ‼️ A TRANSCRIPT'S FILENAME IS NOT ITS SESSION ID ON THREE OF THE FOUR
     * ENGINES (X-35). Claude names the file after the session, which is exactly
     * why `path.basename(file).replace(/\.jsonl$/, '')` looked like a resolver
     * and spread. Codex writes `rollout-2026-08-12T…-<uuid>.jsonl` and states the
     * real id inside, in `session_meta.session_id`; Gemini writes `session-1.json`
     * under a project-hash folder and states its id in the JSON. So the basename
     * trick produced a key nothing else in the system uses, and every map built
     * on it — the launcher/origin map above all — simply never matched.
     */
    byFile(file: string | undefined): SessionInfo | undefined {
        const f = String(file ?? '').trim();
        if (!f) { return undefined; }
        return this.sessions.get(f) ?? this.externalList.find(s => s.file === f);
    }

    byId(sessionId: string | undefined): SessionInfo | undefined {
        const id = String(sessionId ?? '').trim();
        if (!id) { return undefined; }
        // The map is keyed by FILE, not by session id, so this is a scan either
        // way — and Claude first, because a Claude row is the one that carries
        // measurements and the one nearly every caller means.
        for (const s of this.sessions.values()) {
            if (s.sessionId === id) { return s; }
        }
        return this.externalList.find(s => s.sessionId === id);
    }

    externalForAgent(agentId: string): SessionInfo[] {
        return this.externalList.filter(s => s.agentId === agentId);
    }

    isSessionActive(s: SessionInfo, now = Date.now()): boolean {
        return now - s.mtime < this.activeThresholdMs();
    }

    /**
     * ‼️ "IS IT WORKING RIGHT NOW" IS A LOG FACT, NOT A MEASUREMENT (X-35).
     *
     * This asked the claude-only list, so an agent that spent the afternoon on
     * Codex was drawn idle — grey dot in the sidebar, `active: false` on its
     * portfolio row and its dashboard card, `active: false` over the bridge —
     * while its own last-activity date, which every one of those surfaces reads
     * from the widened list, said it had been busy minutes ago. A row that
     * contradicts itself in two adjacent cells is worse than one that is merely
     * incomplete, because the reader cannot tell which half to believe.
     *
     * Liveness needs a timestamp and nothing else: `isSessionActive` is pure
     * mtime, which every engine's rows carry honestly. There is no Claude-shaped
     * measurement here to protect, so this is the widening the split was always
     * meant to allow — fixed once at the source rather than at each of the four
     * callers, which is how the two halves drifted apart in the first place.
     */
    isAgentActive(agentId: string, now = Date.now()): boolean {
        return this.forAgentWithExternal(agentId).some(s => this.isSessionActive(s, now));
    }

    activeAgentIds(now = Date.now()): Set<string> {
        const ids = new Set<string>();
        for (const s of this.allWithExternal()) {
            if (s.agentId && this.isSessionActive(s, now)) { ids.add(s.agentId); }
        }
        return ids;
    }

    /**
     * How many SESSIONS are running, not how many agents are.
     *
     * ‼️ THESE TWO ARE NOT THE SAME NUMBER, AND THE STATUS BAR USED THE WRONG
     * ONE. Two Console tabs on the same agent are two turns, two costs and two
     * things that can be waiting for you — `activeAgentIds()` folds them into
     * one, so a fleet with three sessions on one agent read "1 active" and the
     * indicator was blind to two thirds of what was running.
     *
     * A session with no registered agent is counted too: it burns the same
     * quota, which is exactly what "active" is being asked about here. Where
     * the question really is about agents (the daily digest's `activeAgents`,
     * the chat `/status` line that says "N agents"), `activeAgentIds()` is
     * still the right call and is left alone.
     *
     * ‼️ …AND IT COUNTS EVERY ENGINE (X-35), for the same reason it counts a
     * session with no agent: "what is running right now" is a log fact and a
     * Codex turn is running exactly as hard as a Claude one. It also has to
     * match its own tooltip — the status bar reads "N sessions across M agents"
     * off this and `activeAgentIds()`, and widening one without the other can
     * put more agents in that line than sessions. The money beside it stays
     * Claude-only and says so.
     */
    activeSessions(now = Date.now()): SessionInfo[] {
        return this.allWithExternal().filter(s => this.isSessionActive(s, now));
    }

    latestSessionForAgent(agentId: string): SessionInfo | undefined {
        return this.forAgent(agentId).sort((a, b) => b.mtime - a.mtime)[0];
    }

    /** G6: sessions that head a tree — no parent, or the parent transcript is gone. */
    topLevel(): SessionInfo[] {
        const ids = new Set(this.all().map(s => s.sessionId));
        return this.all().filter(s => !s.parentSessionId || !ids.has(s.parentSessionId));
    }

    /** G6: direct subagent sessions of a parent session. */
    childrenOf(sessionId: string): SessionInfo[] {
        return this.all()
            .filter(s => s.parentSessionId === sessionId)
            .sort((a, b) => a.firstTs - b.firstTs);
    }

    /** G6: cost/count of a session's whole subagent tree (self excluded), max 5 levels. */
    subtreeRollup(sessionId: string, depth = 0): { cost: number; count: number } {
        if (depth >= 5) { return { cost: 0, count: 0 }; }
        let cost = 0, count = 0;
        for (const child of this.childrenOf(sessionId)) {
            const sub = this.subtreeRollup(child.sessionId, depth + 1);
            cost += child.cost + sub.cost;
            count += 1 + sub.count;
        }
        return { cost, count };
    }

    feed(limit = 60): FeedEvent[] {
        const events: FeedEvent[] = [];
        for (const s of this.sessions.values()) { events.push(...s.events); }
        events.sort((a, b) => b.ts - a.ts);
        return events.slice(0, limit);
    }

    /** Usage within the trailing 5-hour window (subscription pacing approximation). */
    /**
     * The rolling 5-hour window — the same span the plan's limit resets on.
     *
     * ‼️ `wTokens` IS THE ONE THAT BELONGS NEXT TO THE LIMIT, NOT `tokens`.
     * Measured over 32 days: the eight heaviest windows sit inside a ±13% band
     * by weighted total (75.5M-96.7M — a ceiling being hit) while the RAW
     * totals of those same windows span 111M-175M. Reading the limit off the
     * raw figure therefore says the wall moved when only the shape of the work
     * did — see QUOTA_WEIGHTS.
     */
    windowUsage(now = Date.now()): { tokens: number; wTokens: number; cost: number; msgs: number; windowStart: number } {
        const windowStart = now - 5 * 3600 * 1000;
        let tokens = 0, wTokens = 0, cost = 0, msgs = 0;
        for (const s of this.sessions.values()) {
            for (const m of s.recentMsgs) {
                if (m.ts >= windowStart) {
                    tokens += m.tokens;
                    wTokens += m.wTokens;
                    cost += m.cost;
                    msgs++;
                }
            }
        }
        return { tokens, wTokens: Math.round(wTokens), cost, msgs, windowStart };
    }

    /** Usage since a user-set lap mark (trip meter). Sources recentMsgs, so it only sees the last 48h. */
    lapUsage(sinceTs: number): { tokens: number; wTokens: number; cost: number; msgs: number } {
        let tokens = 0, wTokens = 0, cost = 0, msgs = 0;
        for (const s of this.sessions.values()) {
            for (const m of s.recentMsgs) {
                if (m.ts >= sinceTs) {
                    tokens += m.tokens;
                    wTokens += m.wTokens;
                    cost += m.cost;
                    msgs++;
                }
            }
        }
        return { tokens, wTokens: Math.round(wTokens), cost, msgs };
    }

    updatePricing(pricing: PricingEngine): void {
        this.pricing = pricing;
    }

    dispose(): void {
        for (const w of this.watchers) { try { w.close(); } catch { /* already closed */ } }
        for (const t of this.pending.values()) { clearTimeout(t); }
        this.onDidUpdateEmitter.dispose();
    }
}
