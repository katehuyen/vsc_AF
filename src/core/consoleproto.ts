/**
 * Console protocol — what Agent Farm says to a hosted claude process, and what
 * it makes of what comes back.
 *
 * The transport is the CLI's own streaming mode:
 *   claude -p --input-format stream-json --output-format stream-json --verbose
 * stdin takes user messages and control requests as JSON lines; stdout streams
 * system/assistant/user/result/control_response lines back. The process stays
 * alive between turns, which is what makes it a *session* rather than a run.
 *
 * Everything here was measured against the real CLI before it was written
 * (2026-07-27, claude 2.1.x), because the interesting parts are exactly the
 * ones nobody should guess at:
 *
 *  - **Interrupt works**: `{subtype:'interrupt'}` ends the turn in flight and
 *    the run reports `result:error_during_execution`.
 *  - **Permission mode can be changed live**: `{subtype:'set_permission_mode'}`
 *    answers with the new mode, and the next tool call obeys it.
 *  - **So can the MODEL**: `{subtype:'set_model', model:'…'}` is a control
 *    request the CLI accepts mid-session — the same thing `/model` does in an
 *    interactive terminal. Verified against the installed binary (2026-07-29):
 *    `set_model` is in the CLI's own set of handled subtypes, it validates that
 *    `model` is a string, and it answers `success` or `error`. Unlike
 *    set_permission_mode the success carries NO payload, so the request id is
 *    what tells us which model was accepted — see `pendingModel`.
 *  - **So can the EFFORT**: `{subtype:'apply_flag_settings', settings:{effortLevel}}`
 *    is the very control request the CLI's own `/effort` command sends.
 *    Measured (2026-07-30, sonnet): `get_settings.applied.effort` really moves
 *    low → high → xhigh, and it answers with no payload — so, like set_model,
 *    the request id is the only link back (see `pendingEffort`). On a model
 *    with no effort levels (haiku) `applied.effort` stays null: the flag is
 *    accepted and means nothing, which is why the picker says so rather than
 *    pretending.
 *  - **‼️ AND THE CLI WILL SAY WHAT IS REALLY IN FORCE**: `{subtype:'get_settings'}`
 *    answers `{effective, sources, applied:{model, effort, advisor, ultracode}}`,
 *    where `applied` is the CLI's OWN resolution of the whole precedence chain
 *    — command-line flag over local over project over user settings, capped to
 *    what the model actually supports. It is therefore the only honest answer
 *    to "what is this turn running on?", and it costs nothing: a local question
 *    about local settings, no tokens, no API call. Measured (2026-07-31, CLI
 *    2.1.220): started with no flags at all it answers `effort:"xhigh"` off
 *    `~/.claude/settings.json`; with `--effort low` it answers `"low"`; on a
 *    model with no effort levels (haiku) it answers `null`. This is what the
 *    turn strip shows — see `pendingSettings` / `applied`.
 *  - **‼️ THE SESSION *CAN* ASK YOU SOMETHING MID-TURN — it just has to be
 *    invited to.** With `--permission-prompt-tool stdio` on the command line
 *    the CLI stops resolving permissions on its own and sends the host a
 *    `control_request` of subtype `can_use_tool` (`tool_name`, `input`,
 *    `tool_use_id`, and `requires_user_interaction:true` when the tool exists
 *    purely to ask — AskUserQuestion). The turn STAYS OPEN until the host
 *    answers `{behavior:'allow', updatedInput}` or `{behavior:'deny', message}`.
 *    Measured end to end (2026-07-30, haiku): AskUserQuestion answered with
 *    `updatedInput.answers[<question text>] = <option label>` came back as
 *    "Your questions have been answered … you can now continue", and the agent
 *    carried on in the SAME turn. No `initialize` handshake is needed — the
 *    flag alone is what turns the channel two-way.
 *
 *    Without the flag the CLI has nobody to ask, so the tool comes back as an
 *    errored `tool_result` and the turn ends — which is what the panel used to
 *    see, and mistook for "there is no dialog". `PERMISSION_GRANTS` is still
 *    the answer to a refusal that arrives that way (a permission RULE, a hook,
 *    an older CLI), so it stays.
 *
 * Pure: builders, a parser and a reducer. No io, no vscode.
 */

import { BYPASS, bypassVerdict, EffectivePermission, permissionFlags } from './permissionmode';
import { isWaitCall } from './turnWait';
import { addUsage, contextAfter, emptyUsage, RawUsage, toUsage, totalTokens, Usage, weightedTokens } from './pricing';
import { isQuotableContextPath, quoteContextPath } from './projectContext';
import { mergeReported } from './slashCommands';
import { StepKind, stepKindForTool } from './stepkind';
import { NO_STOP_ASKED, StopFrom, stopWords } from './stopSource';

export type ConsoleStatus = 'starting' | 'idle' | 'working' | 'ended' | 'error';

export interface ConsoleToolUse {
    /** U-148 — the call only waits on something already running (src/core/turnWait.ts) */
    wait?: boolean;
    id?: string;
    name: string;
    /** short human-readable argument (file path, command, query…) */
    detail: string;
    /** file the tool wrote, when it is a writing tool — powers the ✎ chips */
    file?: string;
}

/** One question of an AskUserQuestion call, normalised. */
export interface ConsoleAskQuestion {
    question: string;
    header?: string;
    multiSelect?: boolean;
    options: { label: string; description?: string }[];
}

/**
 * ‼️ THE TURN IS WAITING FOR YOU — the panel's half of `can_use_tool`.
 *
 * Two different things arrive on the same wire and the difference is the CLI's
 * own `requires_user_interaction` flag, not a guess of ours:
 *   · `interactive` — the tool IS the question (AskUserQuestion). It is answered
 *     by handing its own input back with `answers` filled in; there is nothing
 *     to "permit".
 *   · otherwise — an ordinary permission ask: this tool, with this input, may or
 *     may not run. Allow or deny.
 *
 * Either way the turn is parked until `requestId` is answered, so a pending ask
 * is never something the panel may drop on the floor (see ConsoleHost.close /
 * interrupt, which deny it rather than leave a process waiting forever).
 */
export interface ConsoleAsk {
    /** the control request id the answer must carry back */
    requestId: string;
    tool: string;
    displayName?: string;
    toolUseId?: string;
    /** the CLI said this tool exists to ask you something */
    interactive: boolean;
    /** the tool's own input — handed back verbatim (plus answers) on allow */
    input: Record<string, unknown>;
    /** AskUserQuestion's questions; empty for a plain permission ask */
    questions: ConsoleAskQuestion[];
    /** one line describing what is being asked, for the row and the card */
    detail: string;
    ts: number;
}

/**
 * A file hung on a user message.
 *
 * ‼️ TWO CARRIERS, AND THE FILE TYPE PICKS ONE — not a preference, a capability.
 * The model cannot open a file, so an image has to travel INSIDE the message as
 * a base64 block. Everything else travels as a PATH, because the agent already
 * has this disk and `Read` opens it: that is cheaper on context (a 10 MB log
 * embedded is 10 MB on every later turn), it pages through PDFs and notebooks,
 * and it re-reads a file that changed mid-conversation. Embedding a text file
 * would be the worse answer, not the more generous one.
 */
export interface Attachment {
    /** absolute path on this machine */
    path: string;
    /** what the chip shows */
    name: string;
    bytes: number;
    kind: 'image' | 'path';
    /** image only, e.g. 'image/png' */
    mediaType?: string;
    /** image only — base64, read at SEND time so a file swapped meanwhile is caught */
    data?: string;
}

/**
 * Attachment ceilings — ONE definition, used by the composer for the early
 * warning and by the host as the last line of defence.
 *
 * ‼️ Over the limit the send is REFUSED, never silently downscaled. A quietly
 * shrunk screenshot still gets an answer — a confidently wrong one.
 */
export const ATTACH_LIMITS = {
    /** per image, base64 payload rides in the message itself */
    perImageBytes: 5 * 1024 * 1024,
    /** everything embedded in one message */
    totalBytes: 20 * 1024 * 1024,
    /** files hung on one message, images and paths together */
    count: 20
};

/** Extensions the API can take as an image block. Anything else goes by path. */
export const IMAGE_MEDIA_TYPES: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp'
};

/** What the transcript remembers about an attachment (never the payload). */
export interface AttachmentNote {
    name: string;
    kind: 'image' | 'path';
    path: string;
    bytes: number;
}

export interface ConsoleMessage {
    id: string;
    role: 'user' | 'agent' | 'tool' | 'result' | 'system' | 'error' | 'ask';
    ts: number;
    text?: string;
    /** said INTO a running turn (see acceptUserText) rather than starting one */
    steer?: boolean;
    /** files that went with this message — shown in the talk, payload not kept */
    attach?: AttachmentNote[];
    tool?: ConsoleToolUse;
    /** tool result: did it fail? */
    isError?: boolean;
    /** the CLI refused the tool because permission was never granted */
    permission?: { detail: string; tool?: string };
    /** an 'ask' row: the question that was put to you, and what you said back */
    ask?: ConsoleAsk;
    answer?: string;
    /** result rows carry the turn's own numbers */
    cost?: number;
    turns?: number;
    /** how long the turn took, and what it spent — the summary line that closes it */
    ms?: number;
    tokens?: number;
    /**
     * WHAT KIND of step this row is — see stepkind.ts.
     *
     * ‼️ The conversation showed WHAT happened and never WHERE IT COST. A row
     * saying `Read D:/x.ts` and a row saying the model thought for nine seconds
     * looked like the same sort of event; one is free to run and one is billed
     * at the output rate. Set on every row that represents a step.
     */
    kind?: StepKind;
    /**
     * What this step's API call spent, attributed ONCE.
     *
     * A single call carries several blocks and repeats its whole usage on each
     * of them, so the figure is hung on the FIRST block of the call and the
     * rest carry nothing — the same rule the session viewer has always used.
     * A row with no figure did not cost nothing; it rode on the call above it.
     */
    stepTokens?: number;
    /** …and the same step against the plan limit (see QUOTA_WEIGHTS). */
    stepWTokens?: number;
    /**
     * ‼️ K-23 — THIS ROW IS THE TOP OF A PARTIAL SCROLLBACK, AND IT CAN BE
     * OPENED.
     *
     * The resume window stops at a few hundred rows so a forty-megabyte
     * transcript cannot stall the panel; everything older was readable only by
     * opening the file in an editor. It is already on this disk and costs no
     * token to show, so the head row carries what is still above it and the
     * panel draws an action beside the sentence.
     *
     * `stamp` is which reading of the file the count came from — every chunk
     * says it, so two pieces that do not belong together are visible as such
     * rather than silently interleaved.
     */
    more?: { older: number; stamp?: string; chunk?: number };
}

/**
 * ‼️ K-23 — WHERE IN THE TRANSCRIPT A SCROLLBACK ROW CAME FROM, or -1 when the
 * row is not one (a live line, a note, the head marker).
 *
 * Two readers write these ids and they count differently, which is history
 * rather than design: the parsed-CLI path names rows `xh<position>` from zero,
 * and the native reader has always numbered its pushes `h<n>` from one. Both
 * are the row's absolute place in the file, so both are usable — the offset is
 * decoded here, once, instead of in each caller.
 */
/**
 * What "load older" came back with (K-23): the chunk and the head row that
 * replaces the old marker, or a sentence saying why there is nothing.
 *
 * ‼️ An EMPTY reason means "you are already at the start" — a fact, not a
 * failure, and nothing to interrupt the reader with. Every other reason is
 * something they can act on ("Open transcript"), which is why this is a
 * sentence and not a boolean.
 */
export type OlderHistory =
    | { rows: ConsoleMessage[]; head: ConsoleMessage; reason?: undefined }
    | { reason: string; rows?: undefined; head?: undefined };

export function transcriptPos(id: string): number {
    const m = /^(x?)h(\d+)$/.exec(id ?? '');
    if (!m) { return -1; }
    return m[1] ? Number(m[2]) : Number(m[2]) - 1;
}

/**
 * ‼️ X-43 — WHAT A `usage` BLOCK ON AN ASSISTANT EVENT IS THE USAGE **OF**.
 *
 * Four numbers were being read out of one field and three of them were wrong.
 * Claude puts a single API call's usage on each assistant message, so
 * `contextAfter()` on it is the window that call carried — which is what ctx
 * means. Every other engine reports a SUM: Codex's `turn.completed` is the
 * whole thread's running total, Gemini's `result.stats` is the process's. The
 * adaptors already subtract to get honest SPEND out of those sums, and spend is
 * all they can honestly give: a turn that made eleven model calls spent the sum
 * of eleven windows and is sitting in exactly one of them.
 *
 * So the scope travels ON the event, and the reducer derives ctx from `perCall`
 * only. Absent means `perCall`, because Claude's real stream — the one engine
 * that never carried a sum — says nothing and must keep working unchanged.
 *
 * Every scope still feeds the spend counters. This governs ONE thing: whether
 * the block is allowed to say what the window is holding.
 */
export type UsageScope =
    /** one model/API call's own usage — the only kind ctx can be derived from */
    | 'perCall'
    /** every internal call of one user turn, summed */
    | 'turnAggregate'
    /** everything one CLI process did */
    | 'processAggregate'
    /** the conversation's running total since its first turn */
    | 'conversationCumulative';

/** The scope an event declares, defaulting to `perCall` — see UsageScope. */
export function usageScopeOf(o: Record<string, unknown> | undefined): UsageScope {
    const s = o?.usage_scope;
    return s === 'turnAggregate' || s === 'processAggregate' || s === 'conversationCumulative'
        ? s : 'perCall';
}

/**
 * ONE reading of how full the window is, from a named source.
 *
 * The canonical shape the SOP requires ("Context now ayrı bir ölçüm
 * sözleşmesidir"): what is in the window, what the window holds, when it was
 * measured, and where it was read. A surface that has this cannot accidentally
 * print a lifetime total as a fullness — there is nowhere to put one.
 */
export interface ContextSample {
    tokens: number;
    window?: number;
    measuredAt?: number;
    source?: string;
    /** the reading is the last good one, not a fresh one */
    stale?: boolean;
}

/** The state's own context reading, or undefined when nothing has been
 *  measured. `—` on the surfaces, never a total in disguise. */
export function contextSample(s: {
    contextTokens?: number; contextWindowTokens?: number;
    contextMeasuredAt?: number; contextSource?: string; contextStale?: boolean;
}): ContextSample | undefined {
    if (!(s.contextTokens && s.contextTokens > 0)) { return undefined; }
    return {
        tokens: s.contextTokens,
        ...(s.contextWindowTokens ? { window: s.contextWindowTokens } : {}),
        ...(s.contextMeasuredAt ? { measuredAt: s.contextMeasuredAt } : {}),
        ...(s.contextSource ? { source: s.contextSource } : {}),
        ...(s.contextStale ? { stale: true } : {})
    };
}

/**
 * How full the window is, as a percentage — or undefined when it cannot be
 * stated honestly.
 *
 * ‼️ `tokens > window` DOES NOT GROW THE WINDOW AND DOES NOT DRAW A BAR. It
 * means the two figures came from different moments (a model switch, a stale
 * sample) and the right answer is to say so, not to pick whichever of them
 * makes a percentage possible.
 */
export function contextPercent(c: ContextSample | undefined): number | undefined {
    if (!c || !c.window || c.window <= 0 || c.tokens <= 0) { return undefined; }
    if (c.tokens > c.window) { return undefined; }
    return Math.round((c.tokens / c.window) * 100);
}

/** One process the CLI runs behind the turn (see ConsoleSessionState.backgroundTasks). */
export interface BackgroundTask {
    /** the CLI's own task id — what `stop_task` takes */
    id: string;
    /** `local_bash` for a backgrounded Bash call; the CLI's word, shown as it came */
    kind: string;
    /** the tool call's description, or the command itself when it gave none */
    description: string;
    /** when this host first saw it */
    startedAt: number;
    /** the tool_use block that started it, once `task_started` names it */
    toolUseId?: string;
}

export interface ConsoleSessionState {
    /** Agent Farm's own id for the hosted process */
    id: string;
    agentId: string;
    agentName: string;
    cwd: string;
    /** the engine's session id — known up-front on a resume, otherwise once the
     *  engine names it (Claude's `system:init`, Codex's `thread.started`) */
    sessionId?: string;
    /**
     * ‼️ WHICH ENGINE IS ANSWERING. Absent means `claude`, which is what every
     * session started before engines existed was, and what every surface that
     * does not ask still means.
     *
     * It is on the STATE rather than worked out from the host, because the
     * things that read it are the ones furthest from the process: a strip that
     * must not print a dollar figure for an engine that states none, a picker
     * whose permission modes mean something different here, and a record that
     * has to be able to say months later which engine a turn ran on.
     */
    engine?: string;
    /**
     * ‼️ K-29 — THE SLASH COMMANDS THIS SESSION SAID IT HAS, as names.
     *
     * On the state and not on the host because it is a fact about THIS process:
     * two sessions of the same agent can report different sets (one started
     * before a skill was added, one after), and a single per-window list would
     * offer each of them the other's commands. Names only — the descriptions
     * are worked out where the catalog is assembled (`core/slashCommands.ts`),
     * which is also where the disk's own files get to replace them.
     */
    slashCommands?: string[];
    /**
     * ‼️ K-36 — WHICH OF THEM ARE SKILLS (`system:init.skills`), and which only
     * work in a real terminal (`system:init.terminal_slash_commands`).
     *
     * Both are the CLI answering questions this build used to guess: the shipped
     * table filed `/dataviz` as the engine's own, and marked five commands
     * `tui` by hand where the process names two. Kept beside the names because
     * they are the same event's answer about the same install.
     */
    slashSkills?: string[];
    slashTerminalOnly?: string[];
    /** The active project this session was STARTED under, if there was one. Kept
     *  on the state because the stamp can only be written once `sessionId`
     *  arrives, and by then the status bar may already say something else — the
     *  project a session belongs to is the one it began in. */
    projectId?: string;
    /** ‼️ This window picked an EXISTING session up rather than starting one.
     *  The project stamp is only written for sessions that started here: a
     *  resume already belongs somewhere (or deliberately nowhere), and writing
     *  an explicit assignment for it would silently freeze a membership the
     *  rules were deriving — and, if the window's project had been used, move
     *  the session into a project it never ran in. */
    resumed?: boolean;
    /**
     * ‼️ X-349 — THIS CARD WAS REVIVED AND HAS NOT BEEN SPOKEN INTO YET.
     *
     * A revived seat is `idle` because the CLI's own registry says its process
     * is up, not because the engine announced itself — it only does that on its
     * first turn. The difference matters to a reader looking for a session to
     * talk to, so it is stated rather than smoothed over. Cleared by the init
     * the engine eventually sends (see `system:init`), which is the moment the
     * card's `idle` starts meaning what it means everywhere else.
     */
    revivedWaiting?: boolean;
    /** ‼️ X-133 — was this session given the Superpowers hook, and is it to be
     *  given it again? The appended system prompt does not survive `--resume`
     *  (measured), so the answer has to live on the session rather than on the
     *  composer that started it: the picker is cleared for the NEXT session the
     *  moment one starts, and a session re-spawned from the picker's answer
     *  would come back working to whatever discipline the box happens to be
     *  showing now. Also what the chip reads to say what is being sent. */
    superpowers?: boolean;
    /** S-82 — started asking to open a baton relay: sealed as leg 1 once its session id is known.
     *  `account` is the rule the start named (the chain's pool), `maxLegs` this chain's own ceiling. */
    relayWanted?: { account?: string; maxLegs?: number };
    model?: string;
    effort?: string;
    /**
     * ‼️ X-103 — WHICH ROUTE THIS CARD IS RUNNING ON, and it lives on the STATE
     * rather than on the per-window host record for one reason: the state is
     * what survives a reload. A route held only in memory would be lost when the
     * window came back and the next spawn would fall to the agent's standing
     * route — the same conversation continuing on a different endpoint, which is
     * exactly the route mixing X-101 exists to prevent, arriving through a
     * window reload instead of a resume.
     *
     * Absent means no route was chosen and the agent's record decides, which is
     * what every card started before this item did.
     */
    providerId?: string;
    /** Claude only — which tier of that route. Travels WITH `providerId`: a tier
     *  read against a different route maps the word through the wrong endpoint. */
    tier?: string;
    /** ‼️ X-109 — the route is the resume gate's answer and is taken as it is on
     *  every re-spawn, an ABSENT providerId included: the agent's record is not
     *  consulted for this card. Absent = the old rule (record decides). */
    routePinned?: boolean;
    /**
     * ‼️ X-169 — WHICH SIGN-IN THIS CARD IS RUNNING AS, on the state for exactly
     * the reason the route is: a persistent engine re-spawns, and a window
     * reload must not move a live conversation onto a different account. Held
     * only in memory it would fall back to whatever `agentFarm.activeAccounts`
     * says at re-spawn time — and since that map is the ONE thing the "use this
     * next" button writes, a card would silently follow the user's next choice
     * mid-conversation.
     *
     * Absent means the main sign-in, which is what every card started before
     * this item ran as and what a machine with no captured account still gets.
     */
    account?: string;
    /**
     * ‼️ X-213 — THE SIGN-IN THE **NEXT** TURN WILL RUN AS, when it differs.
     *
     * A running Claude process is sealed to the environment it was spawned
     * with: there is no control request that moves it to another account, and
     * pretending otherwise would be a picker that appears to work and changes
     * nothing (Principle 1). So the choice is recorded as a promise about the
     * next turn, said out loud on the card, and kept until that turn is sent —
     * at which point the process is ended and the SAME conversation is brought
     * back up on the new sign-in with `--resume`, which is what the user was
     * doing by hand in a second terminal.
     *
     * Absent means what is running is what was chosen. On a per-turn engine it
     * is never set at all: there is no process between turns to be sealed, so
     * `account` moves directly and the next spawn already carries it.
     */
    accountNext?: string;
    /**
     * ‼️ X-102 — WHICH SPAWN THIS CARD IS, and therefore which manifest.
     *
     * The card learns its `sessionId` from the engine minutes into the
     * conversation; the manifest was written before the process existed. This is
     * the only field present at both moments, so it is the whole join between
     * "what was this run set up to be" and "which conversation did it produce".
     *
     * On the STATE for the same reason `providerId` is: the state survives a
     * window reload, and a join held only in memory would be lost exactly when
     * somebody comes back to ask what the conversation had been started as.
     * Absent on every card started before this item — an honest gap.
     */
    launchId?: string;
    permissionMode: string;
    status: ConsoleStatus;
    messages: ConsoleMessage[];
    /** messages you chose to HOLD back: they wait here, editable, and are handed
     *  over in order when the running turn ends (see acceptUserText) */
    queued: string[];
    costUSD: number;
    turns: number;
    /** everything this session has spent tokens on, summed off the assistant
     *  messages' own usage — the same total the sessions tables show */
    tokens: number;
    /**
     * The same spend measured in what the plan limit charges —
     * Sonnet-input-equivalent tokens, see `weightedTokens` / QUOTA_WEIGHTS.
     *
     * ‼️ THIS IS THE NUMBER THAT MOVES WITH THE LIMIT; `tokens` is not. A turn
     * deep in a long conversation re-reads a 300k window on every call, so its
     * RAW count runs away while the window it burns barely moves — which is
     * exactly what makes a live counter look like it "stopped counting". Summed
     * off the same assistant lines, inside the same repeat guard, from the model
     * that served each one.
     */
    wTokens: number;
    /**
     * What the model window held for the latest request — `contextAfter` on
     * each assistant message's own usage, which is the SAME function the
     * sessions tables and the session viewer call, so the three surfaces cannot
     * drift apart.
     *
     * ‼️ IT ONLY EVER MOVES ON A REAL MEASUREMENT. Two things used to knock it
     * off a genuine 200k and start it climbing from ~100 again, and both are
     * handled where the usage is read (see the `assistant` branch of
     * reduceEvent): a `system:thinking_tokens` event, which is not context at
     * all, and a sub-agent's own messages, whose window is not this
     * conversation's. A zero means "no measurement", so the last real figure
     * stands.
     */
    contextTokens?: number;
    /**
     * X-43 — THE CAPACITY THAT WINDOW IS MEASURED AGAINST, as the SESSION
     * reports it and not as a model catalogue publishes it.
     *
     * Measured 2026-08-15 on a real `gpt-5.6-sol` thread: the published model
     * ceiling is 1.05M and the CLI's own `model_context_window` on every
     * `token_count` line of that same conversation said **258 400** — its
     * operational/autocompact window. A percentage drawn against the catalogue
     * would have called a full window a fifth full. Absent means the engine
     * states none; nothing is invented in its place.
     */
    contextWindowTokens?: number;
    /** when `contextTokens` was measured (epoch ms) — a live figure and a figure
     *  from four minutes ago are not the same claim, so the age travels with it */
    contextMeasuredAt?: number;
    /**
     * WHERE the figure came from, in a word a reader can check:
     * `stream-last-call` (the engine's own per-call usage on the wire),
     * `rollout-last-token-usage` (Codex's transcript, the only live source it
     * has), `transcript-last-call`, `engine-reported`. Absent means unknown,
     * and unknown is shown as `—` rather than filled in from a total.
     */
    contextSource?: string;
    /** the last good sample is being shown because a fresher one could not be
     *  read — never silently, see the ctx AFTip */
    contextStale?: boolean;
    /**
     * The usage block already counted — `<message id>|<request id>`.
     *
     * ‼️ THE SAME USAGE ARRIVES SEVERAL TIMES. The CLI emits one line per
     * CONTENT BLOCK, and every one of them repeats the whole message's usage:
     * a `thinking` line and a `tool_use` line for one reply both said
     * `in=10 out=3 cr=15642 cw=6961` (measured, haiku, 2026-08-01). Counting
     * each line therefore inflated the session total — on a real transcript
     * 55.1M against a true 27.99M, 1.97×, while the sessions table showed the
     * honest figure for the very same conversation.
     *
     * One key is enough rather than a growing set: the repeats are always
     * CONSECUTIVE (measured over 403 assistant lines / 194 messages — zero
     * exceptions), so nothing has to be remembered beyond the last one.
     */
    lastUsageKey?: string;
    startedAt: number;
    /** when the turn that is running now started. A conversation surface has to
     *  say "still working" out loud — silence between your message and the
     *  reply is indistinguishable from a session that has died — and the honest
     *  way to say it is to count from the moment the turn really began. */
    turnStartedAt?: number;
    /** token total when this turn began — the difference is what the turn spent */
    turnTokensAt?: number;
    /**
     * What the RUNNING turn is thinking with — as the CLI itself answers it.
     *
     * ‼️ THIS IS NOT WHAT THE PICKERS SAY. `model` and `effort` above are what
     * was *asked for*, and asking for nothing is the normal case: leave both on
     * "Default" and they are empty strings, while the turn still runs on a real
     * model at a real effort — the one the CLI resolved out of the settings
     * chain (`~/.claude/settings.json`, the project's own, a policy). A strip
     * fed from the pickers therefore went blank exactly when the user had made
     * no choice, i.e. most of the time, and said nothing about the turn it was
     * pricing. These two are filled from `get_settings.applied` instead — the
     * CLI's own resolution, asked at the start of every turn (see
     * `pendingSettings`), so the answer belongs to THIS turn.
     *
     * An empty `turnEffort` next to a known `turnModel` is meaningful and not a
     * gap: it is the CLI answering `effort: null`, i.e. this model has no effort
     * levels at all (haiku).
     *
     * ‼️ A MID-TURN SWITCH APPLIES FROM THE NEXT TURN. `/model` and `/effort`
     * are both accepted mid-conversation and both take effect one turn later,
     * so the pair is taken once, when the turn starts, and is never rewritten
     * by a switch made while it runs.
     *
     * `system:init` may still correct the model while the turn runs: on the
     * first turn it is the CLI naming the model we only had an alias (or
     * nothing) for, which is a correction and not a change.
     */
    turnModel?: string;
    turnEffort?: string;
    /**
     * What the RUNNING turn has spent so far, by kind of token.
     *
     * The CLI reports what a turn cost only when the turn **ends**
     * (`result.total_cost_usd`), so while it runs the only honest way to put a
     * figure on it is to price the tokens already seen — with the same rules
     * every other cost in the extension uses (`pricing.ts`). The live strip
     * shows that as an estimate (`~`); the line that closes the turn replaces
     * it with the CLI's own number, which is why this is cleared there.
     */
    turnUsage?: Usage;
    /** Weighted total for the RUNNING turn — the limit-side twin of the raw
     *  figure the strip shows beside it. Cleared with turnUsage. */
    turnWTokens?: number;
    /**
     * Round trips to the model in the RUNNING turn.
     *
     * ‼️ THE STRIP COUNTED STEPS AND CALLED IT THE TURN'S SIZE. A step is one
     * thing the agent did — it reasoned, it wrote, or it called a tool; several
     * of them ride on a single API call, and it is the CALLS the tokens follow.
     * So a turn doing the same
     * visible amount of work with half the round trips read as unchanged while
     * its token figure moved underneath it. Incremented where the usage is
     * counted — inside the repeat guard — so it can never drift from the
     * tokens beside it.
     */
    turnApiCalls?: number;
    /**
     * Thinking blocks in the RUNNING turn.
     *
     * ‼️ THE BIGGEST OUTPUT SPENDER WAS THE ONE THING NOTHING COUNTED. Measured
     * on this machine (60 transcripts, 21 705 lines): 1 737 thinking blocks
     * against 878 text blocks — the model reasons about twice as often as it
     * speaks, and every one of those tokens is billed at the output rate. The
     * rows are still not rendered (they are the model's private working), but
     * the strip says how many there were.
     */
    turnThinking?: number;
    /**
     * Steps in the RUNNING turn — every one of them.
     *
     * ‼️ THE STRIP USED TO COUNT WHAT IT HAD DRAWN, AND THAT IS NOT THE SAME
     * SET. The panel worked it out in the view by walking the rows since your
     * last message, which swept in every tool RESULT (one per call, so the
     * figure was roughly doubled) and every system row the panel writes for
     * itself — and it could not see a thinking block at all, because thinking
     * is deliberately not rendered. Counted here instead, on the transcript's
     * own blocks, in the same loop that pushes the rows: the Console, the
     * session tables and the Turns page now all count the same three things
     * (think + say + tool call) off the same shapes, so one surface can no
     * longer make another look broken. See SessionTurn.steps.
     */
    turnSteps?: number;
    /**
     * The turn that just FINISHED — kept until the next one starts.
     *
     * ‼️ A strip that answers "what is this turn costing me?" and then vanishes
     * the instant the answer is final is the one moment it was never readable.
     * The turn's own figures were pushed into the conversation as a result line
     * and then scrolled away with it, while the live strip went blank the
     * millisecond the ball came back to you — so the question you actually ask
     * (what did the turn that just ended cost, and how long did it take?) had no
     * answer anywhere. This is that answer, and it stays put until your next
     * prompt starts a new turn.
     *
     * `cost` here is the CLI's OWN figure (`result.total_cost_usd`), not the
     * running estimate: by the time this exists, the guessing is over.
     */
    lastTurn?: {
        endedAt: number;
        /** how long it ran, ms (undefined when the start was not observed) */
        ms?: number;
        /** tokens the turn spent */
        tokens?: number;
        /** the same turn against the plan limit — see ConsoleState.wTokens */
        wTokens?: number;
        /** the CLI's own cost for the turn, USD */
        cost: number;
        /** round trips the turn took — see turnApiCalls */
        apiCalls?: number;
        /** every step those calls carried — see turnSteps */
        steps?: number;
        /** of those steps, the ones that were reasoning — see turnThinking */
        thinking?: number;
        /** how it ended, in one word: 'done' | 'interrupted' | 'failed' */
        outcome: 'done' | 'interrupted' | 'failed';
        /** what it was thinking with — see turnModel; '' when never known */
        model?: string;
        effort?: string;
    };
    lastTs: number;
    /** why it ended, when it did */
    exitReason?: string;
    /** last permission refusal still unanswered — the panel's call to action */
    pendingPermission?: { detail: string; tool?: string; ts: number };
    /**
     * The question the CLI is holding the turn open for (see ConsoleAsk).
     *
     * ‼️ This is the difference between the Console and a terminal: a terminal
     * asks you mid-turn and carries on with your answer, and the panel used to
     * have no way to be asked at all — the tool failed, the agent wrapped up,
     * and you had to start a NEW turn to say the one word it wanted.
     */
    pendingAsk?: ConsoleAsk;
    /**
     * A model switch we have asked for and not heard back about.
     *
     * `set_model` answers `success` with nothing in it, so the reply alone
     * cannot say what was accepted — the request id is the only link back to
     * the model we asked for. Showing the new model before the CLI has agreed
     * to it would be a lie the panel tells about the next turn, so the switch
     * is applied on the response, not on the request.
     */
    pendingModel?: { requestId: string; model: string };
    /**
     * An effort switch we have asked for and not heard back about.
     *
     * `apply_flag_settings` answers `success` with nothing in it — exactly like
     * `set_model` — so the same rule applies: the picker is not moved until the
     * CLI has agreed. `'' `means "back to the CLI's own default".
     */
    pendingEffort?: { requestId: string; effort: string };
    /**
     * A `get_settings` we have asked and not heard back about.
     *
     * `turnStartedAt` is what the probe was asked FOR: a probe fired at the
     * start of a turn carries that turn's clock, so its answer can only be
     * written into `turnModel`/`turnEffort` while that same turn is still the
     * one running. Without it a late answer would relabel the wrong turn.
     */
    pendingSettings?: { requestId: string; turnStartedAt?: number };
    /**
     * ‼️ S-54 — WHAT THE CLI SAYS IT CAN DO, read off `system/init.capabilities`.
     *
     * An open set the CLI publishes so a client can feature-detect instead of
     * version-sniffing (its own words). The one this side uses is
     * `interrupt_cancel_queued_v1`: an interrupt that may also withdraw the
     * messages said into the turn. Absent on older CLIs, and absent means
     * "not advertised", never "no".
     */
    capabilities?: string[];
    /**
     * ‼️ S-54 — THE MESSAGES SAID INTO THE TURN THAT IS RUNNING, by the uuid
     * they were stamped with on the way down the pipe.
     *
     * Measured (claude-cli 2.1.269): a message written into a running turn is
     * QUEUED by the CLI and starts a new turn of its own the moment the current
     * one ends — including when a person ended it with Interrupt. "Stop" then
     * looked like it had worked for a second and the agent carried on, because
     * the queued message was the very instruction it carried on with. The
     * interrupt receipt names what it withdrew by uuid; this is the map back
     * to the words, so the card can say WHICH message did not reach the model.
     * Cleared when the turn ends.
     */
    steered?: { uuid: string; text: string }[];
    /** ‼️ S-54 — the interrupt we sent and have not heard back about. */
    pendingInterrupt?: { requestId: string };
    /** ‼️ X-480 — a stop asked of the running turn, and from which surface; its closing row names it (see stopSource). */
    stopAsked?: { from: StopFrom; ts: number };
    /**
     * ‼️ S-62 — THE COMMANDS THIS SESSION IS STILL RUNNING BEHIND THE TURN.
     *
     * Measured (claude-cli 2.1.269, tools/probe_background.js): a Bash call
     * with `run_in_background:true` returns at once, the CLI announces the
     * process on `system/background_tasks_changed` (its whole live list) and
     * `system/task_started`, and the turn ends while it runs. When it finishes
     * the CLI writes `system/task_notification` and — with nobody typing —
     * opens a NEW turn to hand the result to the model, which then carries on
     * with what it was doing. Stop had ended the turn and not the process, so
     * the user's "I stopped it and it went on" was true 7 s later.
     *
     * This is the CLI's list, replaced whole on every `background_tasks_changed`
     * — never derived by counting tool calls, which would have to guess which
     * of them the CLI backgrounded. It outlives the turn on purpose: that is
     * exactly when the reader needs to know a process is still out there. The
     * host's `interrupt` reads it and asks the CLI to `stop_task` each one
     * before it aborts the turn; a task stopped that way sends its
     * notification as `stopped`, which measured opens no turn.
     */
    backgroundTasks?: BackgroundTask[];
    /** ‼️ S-62 — the `stop_task` requests we sent and have not heard back about. */
    pendingStops?: { requestId: string; taskId: string }[];
    /**
     * ‼️ A permission-mode switch we have asked for and not heard back about —
     * and the reason this field had to exist at all.
     *
     * `set_permission_mode` was the one control request sent fire-and-forget:
     * written to stdin, reported as done, and never reconciled with the answer.
     * The reducer only ever acted on a SUCCESS (it looked for `mode` in the
     * payload), so a refusal changed nothing and said nothing — the picker
     * simply snapped back on the next repaint. Measured refusals from the
     * installed CLI (2.1.226):
     *
     *   bypassPermissions on a session without the launch flag →
     *     "Cannot set permission mode to bypassPermissions because the session
     *      was not launched with --dangerously-skip-permissions"
     *   auto → "auto mode unavailable for this model"
     *   ""   → "must be one of acceptEdits, auto, bypassPermissions, default,
     *           dontAsk, plan"
     *
     * That silence is the whole of the bug behind "I set it to bypass and it
     * kept asking". A refusal is now a line in the conversation, in the CLI's
     * own words.
     *
     * The id is the link back, exactly as for `pendingModel`: the success
     * payload does carry a mode, but it is not always the one we asked for —
     * `manual` comes back as `default`, and what the panel must show is what
     * the CLI accepted, never what we hoped for.
     */
    pendingPermissionMode?: { requestId: string; mode: string };
    /**
     * What the CLI says is REALLY in force — its own `get_settings.applied`.
     *
     * Kept because it is the seed for the next turn's pair: the probe's answer
     * arrives milliseconds after a turn begins, and until it does, the last
     * thing the CLI told us is a far better answer than an empty picker.
     * `effort: ''` means the CLI answered `null` — this model has no effort
     * levels.
     */
    applied?: { model: string; effort: string };
    /**
     * ‼️ K-22 — WHAT THE PROCESS IS ACTUALLY IN, as opposed to what was asked.
     *
     * `permissionMode` above is the REQUEST. This is what the launch enforced,
     * decided before the spawn from the flags plus Claude's own settings layers
     * (core/permissionmode.ts). They are separate state because they were being
     * confused, and confusing them is what let a card say bypass while the
     * process asked for permission on every tool call.
     */
    enforcedPermissionMode?: string;
    /** One line saying where that answer came from — the card's tooltip. */
    permissionWhy?: string;
    /**
     * How many permission requests this bypassed session answered ON ITS OWN.
     *
     * A process in enforced bypass is not supposed to send one at all, so a
     * number above zero is evidence of a CLI regression rather than ordinary
     * traffic — and it is kept for exactly that, because the user must never
     * see the window it would otherwise have opened.
     */
    bypassAutoApproved?: number;
    /**
     * A control response the HOST must write, produced by the reducer.
     *
     * The reducer is pure and cannot talk to the process; a bypassed session
     * answering its own permission request has to say something back or the
     * turn hangs for ever. So the answer is built here and drained by the host
     * on the next pass (see `drainAutoAnswer`).
     */
    autoAnswer?: { requestId: string; line: string };
}

/**
 * The honest set of things a panel button can actually grant, live.
 *
 * "Honest" is load-bearing and was not true: `auto` sat here as "Let it decide"
 * and the installed CLI answers `set_permission_mode: auto` with
 * `error "auto mode unavailable for this model"` — a button that could only
 * ever do nothing. It is gone rather than left to fail politely, because the
 * refusal is a property of the model, not of the moment. See
 * PERMISSION_MODES_LIVE for the whole measured vocabulary.
 */
export const PERMISSION_GRANTS: { mode: string; label: string; detail: string }[] = [
    {
        mode: 'acceptEdits', label: 'Allow file edits',
        detail: 'file writes are auto-approved from now on; everything else still asks'
    },
    {
        mode: 'bypassPermissions', label: '⚠ Allow everything',
        detail: 'every action is auto-approved for the rest of this session'
    },
    {
        mode: 'plan', label: 'Plan only',
        detail: 'it plans and changes nothing until you switch back'
    }
];

/**
 * CLI args for a hosted session (the flags are launch.ts's vocabulary).
 *
 * ‼️ `--permission-prompt-tool stdio` is not optional and not a tuning knob: it
 * is the flag that makes the channel TWO-WAY. Without it the CLI resolves every
 * permission and every AskUserQuestion by itself — which, with no human on its
 * end, means "nobody answered" — and the panel only ever learns about it from
 * the errored tool_result that closes the turn.
 */
export function hostArgs(o: {
    model?: string; effort?: string; permissionMode?: string; resume?: string;
    /**
     * ‼️ K-22 — the RESOLVED permission decision, when the caller has one.
     *
     * `permissionMode` alone is only what was ASKED for, and asking is what the
     * bug was: a session requested as bypass used to be launched with a flag
     * that merely permits bypass to be chosen later, so the process ran in the
     * ordinary asking mode behind a card that said bypass. The decision object
     * knows whether bypass is actually being enforced, and the flags follow it
     * (core/permissionmode.ts). Absent = the pre-decision behaviour, which is
     * what a caller that never touches bypass wants.
     */
    permission?: EffectivePermission;
    /** the project context file — see projectContext.ts */
    projectContextFile?: string;
}): string[] {
    // The permission flags are ONE decision, made in one place — see
    // permissionFlags for why `--allow-…` is never allowed to stand in for
    // `--dangerously-skip-permissions`. `launch` rides with the transport
    // flags, `mode` keeps its old place at the end of the line.
    const asked = (o.permissionMode ?? '').trim();
    const perm = permissionFlags(o.permission ?? {
        requested: asked, fromSettings: '', settingsFile: '',
        effective: asked, bypass: false, why: ''
    });
    const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
        '--permission-prompt-tool', 'stdio', ...perm.launch];
    if (o.resume) { args.push('--resume', o.resume); }
    if (o.model?.trim()) { args.push('--model', o.model.trim()); }
    if (o.effort?.trim()) { args.push('--effort', o.effort.trim()); }
    args.push(...perm.mode);
    // ‼️ THE PROJECT CONTEXT GOES ON EVERY SPAWN, INCLUDING RESUMES.
    // Measured (test/smoke_project_context.mjs): an appended system prompt does
    // NOT survive `--resume` — a session seeded with it, resumed without it,
    // cannot answer a question only the context could answer. This is the one
    // place a hosted session's command line is built, which is what makes
    // "every spawn" true by construction instead of by everyone remembering.
    //
    // ‼️ X-267 — AND ON A RESUME IT IS THE SAME BYTES, not the same subject.
    // What arrives here for a resumed session is the conversation's PINNED copy
    // (`core/projectContext.ts`); this line does not know the difference and
    // must not, but a caller that regenerates the file instead throws away the
    // prefix cache holding the whole thread — measured at 303,987 tokens
    // re-billed for a 29-second extension restart.
    //
    // Quoted because the spawn runs under `shell: true`: an unquoted path
    // through a folder with a space in it arrives cut at the space.
    if (isQuotableContextPath(o.projectContextFile ?? '')) {
        args.push('--append-system-prompt-file', quoteContextPath(o.projectContextFile as string));
    }
    return args;
}

/**
 * A user turn, as the stream expects it.
 *
 * `content` was always an array — the console speaks Anthropic message format
 * to `claude -p --input-format stream-json` — so an image block sits next to
 * the text block natively. Images go FIRST: a question that follows its picture
 * reads the way it was meant to.
 *
 * Path attachments are not a second channel; they become part of the sentence
 * the model reads, in backticks so a path with spaces stays one token to it.
 */
export function userMessageLine(text: string, attachments: Attachment[] = [], uuid?: string): string {
    const images = attachments.filter(a => a.kind === 'image' && a.data && a.mediaType);
    const paths = attachments.filter(a => a.kind !== 'image');
    const body = paths.length
        ? `${text}${text ? '\n\n' : ''}Attached file${paths.length === 1 ? '' : 's'} on this machine — open with Read:\n`
            + paths.map(a => `- \`${a.path}\``).join('\n')
        : text;
    const content: unknown[] = images.map(a => ({
        type: 'image',
        source: { type: 'base64', media_type: a.mediaType, data: a.data }
    }));
    // An images-only message is legal; an EMPTY text block is not worth sending.
    if (body) { content.push({ type: 'text', text: body }); }
    // ‼️ S-54 — STAMPED, SO THE CLI CAN NAME IT BACK. A top-level `uuid` is the
    // id the CLI's own receipts speak in (`command_lifecycle`, an interrupt's
    // `cancelled` list); a message without one is queued and run all the same,
    // only anonymously — the receipt then cannot say which words were withdrawn.
    return JSON.stringify({ type: 'user', message: { role: 'user', content }, ...(uuid ? { uuid } : {}) }) + '\n';
}

/** A control request (interrupt / set_permission_mode). */
export function controlLine(requestId: string, subtype: string, extra: Record<string, unknown> = {}): string {
    return JSON.stringify({
        type: 'control_request',
        request_id: requestId,
        request: { subtype, ...extra }
    }) + '\n';
}

/**
 * The answer to a `can_use_tool` — a control RESPONSE, not a request: the CLI
 * asked, and this carries the verdict back under the id it asked under.
 *
 * `allow` hands the input back because that is the contract: the CLI runs
 * whatever `updatedInput` says, which is how an AskUserQuestion is answered
 * (the same input with `answers` filled in) rather than merely permitted.
 */
/**
 * Take the reducer's own answer off the state, for the host to write.
 *
 * ‼️ K-22 — the reducer is pure and cannot talk to the process, but a bypassed
 * session that answers its own permission request MUST say something back or
 * the turn waits for ever on a window nobody is ever going to see.
 */
export function drainAutoAnswer(
    state: ConsoleSessionState
): { state: ConsoleSessionState; line?: string } {
    if (!state.autoAnswer) { return { state }; }
    return { state: { ...state, autoAnswer: undefined }, line: state.autoAnswer.line };
}

export function askAnswerLine(
    requestId: string, verdict: {
        behavior: 'allow'; updatedInput: Record<string, unknown>;
        /** see PermissionRule — a standing allow that rides on this one answer */
        updatedPermissions?: unknown[];
    }
        | { behavior: 'deny'; message: string }
): string {
    return JSON.stringify({
        type: 'control_response',
        response: { subtype: 'success', request_id: requestId, response: verdict }
    }) + '\n';
}

/**
 * ‼️ THE THIRD ANSWER — "…and stop asking me this".
 *
 * A terminal offers three ways out of a permission prompt, not two: yes, yes
 * *and don't ask again for this kind of command in this session*, and no. The
 * panel only ever had the outer two, so a run that needed the same command
 * twenty times asked twenty times, and the only way to stop it was a standing
 * rule that changes far more than the one command you were happy with.
 *
 * The middle one is a REAL capability of the channel, not a trick: the allow
 * answer may carry `updatedPermissions`, and the CLI installs them before it
 * runs the tool. Measured against the installed CLI (2.1.226) on a session in
 * `default` mode asked to run three `touch` commands: allowing the first one
 * with this rule attached took the asks from three to ONE.
 *
 * `destination: 'session'` is the whole point — it lives as long as the process
 * and is never written to anybody's settings file.
 *
 * Bash is scoped by COMMAND PREFIX (`npm:*`), the way the CLI writes its own
 * bash rules, because "allow every Bash" is not what a person means when they
 * approve `npm test`. Every other tool is scoped by name, which is all a tool
 * rule has.
 */
export function sessionAllowRule(ask: ConsoleAsk): { rule: Record<string, unknown>; label: string } {
    const first = String((ask.input?.['command'] as string) ?? '').trim().split(/\s+/)[0];
    const content = ask.tool === 'Bash' && first ? `${first}:*` : undefined;
    return {
        rule: {
            type: 'addRules',
            rules: [{ toolName: ask.tool, ...(content ? { ruleContent: content } : {}) }],
            behavior: 'allow',
            destination: 'session'
        },
        label: content ? `${content} commands` : `every ${ask.tool}`
    };
}

/**
 * The permission modes a LIVE session can really be moved to — which is not the
 * launcher's list (`PERMISSION_CHOICES`), and the difference is not cosmetic.
 * Every entry here was put to the installed CLI (2.1.226) and answered:
 *
 *   bypassPermissions → success            (only with the launch flag — see hostArgs)
 *   default           → success
 *   acceptEdits       → success
 *   plan              → success
 *   dontAsk           → success
 *   auto              → ERROR "auto mode unavailable for this model"
 *   manual            → success, but the CLI answers back `mode: "default"`
 *   "" (the launcher's "Default" row)
 *                     → ERROR "must be one of acceptEdits, auto,
 *                       bypassPermissions, default, dontAsk, plan"
 *
 * So the live picker offered seven rows of which two could not work at all and
 * one quietly meant something else. `auto` stays out because the refusal is a
 * model-wide circuit breaker rather than a typo, and a row that is dead on the
 * models this panel runs is worse than no row; a refusal is still surfaced if
 * one arrives from anywhere else (see the pendingPermissionMode branch).
 */
export const PERMISSION_MODES_LIVE: { id: string; label: string; detail: string }[] = [
    { id: 'default', label: 'default', detail: 'asks before anything that is not read-only' },
    { id: 'acceptEdits', label: 'acceptEdits', detail: 'file edits auto-approved, everything else still asks' },
    { id: 'plan', label: 'plan', detail: 'plans only — changes nothing until you switch back' },
    { id: 'dontAsk', label: 'dontAsk', detail: 'stops instead of asking when it would need permission' },
    { id: 'bypassPermissions', label: '⚠ bypassPermissions', detail: 'EVERY action auto-approved for the rest of this session' }
];

/**
 * What an AskUserQuestion call is really asking, pulled out of its input.
 *
 * Deliberately forgiving: a question the panel cannot parse must still be
 * ANSWERABLE (allow / deny is always offered), because a card that renders
 * nothing would leave the turn parked forever with no way out.
 */
export function askQuestions(input: Record<string, unknown> | undefined): ConsoleAskQuestion[] {
    const raw = input?.['questions'];
    if (!Array.isArray(raw)) { return []; }
    const out: ConsoleAskQuestion[] = [];
    for (const q of raw) {
        const o = q as Record<string, unknown> | undefined;
        const text = String(o?.['question'] ?? '').trim();
        if (!text) { continue; }
        const opts = Array.isArray(o?.['options']) ? o!['options'] as Record<string, unknown>[] : [];
        out.push({
            question: text,
            header: String(o?.['header'] ?? '').trim() || undefined,
            multiSelect: o?.['multiSelect'] === true,
            options: opts.map(x => ({
                label: String(x?.['label'] ?? '').trim(),
                description: String(x?.['description'] ?? '').trim() || undefined
            })).filter(x => x.label)
        });
    }
    return out;
}

/** Tools whose call means a file changed (the ✎ chips and the diff surface). */
export const WRITE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

/** Exported so the transcript backfill (consolehistory.ts) summarises a tool
 *  call exactly the way the live stream does — one vocabulary, not two. */
export function shortArg(name: string, input: Record<string, unknown> | undefined): string {
    if (!input) { return ''; }
    const pick = input['file_path'] ?? input['notebook_path'] ?? input['command'] ??
        input['pattern'] ?? input['query'] ?? input['url'] ?? input['description'] ??
        input['prompt'] ?? input['skill'] ?? '';
    const s = String(pick ?? '').replace(/\s+/g, ' ').trim();
    return s.length > 120 ? s.slice(0, 120) + '…' : s;
}

/**
 * A permission refusal, as the CLI actually reports it: an errored tool_result
 * whose text says permission was requested and never granted. Detected on the
 * wording rather than a code, so it is deliberately narrow — a false positive
 * here would offer to widen permissions for an unrelated failure.
 */
export function detectPermissionDenial(text: string): { detail: string } | undefined {
    const t = String(text ?? '');
    if (!/requested permission/i.test(t)) { return undefined; }
    if (!/(haven't|have not|not) granted/i.test(t)) { return undefined; }
    return { detail: t.replace(/\s+/g, ' ').trim().slice(0, 300) };
}

let seq = 0;
const nextId = (): string => `cm${++seq}-${Date.now().toString(36)}`;

/** Reset the message-id counter (tests only — ids are otherwise opaque). */
export function resetIds(): void { seq = 0; }

export interface ReduceResult {
    state: ConsoleSessionState;
    /** true when something worth re-rendering changed */
    changed: boolean;
}

/**
 * Fold one stream line into the session state.
 *
 * Unknown line types are ignored rather than shown: this stream carries
 * internal chatter (hook lifecycle, rate-limit notes, thinking blocks) that a
 * conversation surface has no business rendering as if the agent said it.
 */
export function reduceEvent(
    state: ConsoleSessionState, raw: unknown, now: number
): ReduceResult {
    const o = raw as Record<string, unknown> | undefined;
    if (!o || typeof o !== 'object') { return { state, changed: false }; }
    const push = (m: Omit<ConsoleMessage, 'id' | 'ts'>): ConsoleSessionState => ({
        ...state,
        lastTs: now,
        messages: [...state.messages, { id: nextId(), ts: now, ...m }]
    });
    const type = String(o.type ?? '');

    /**
     * ‼️ X-43 — AN ENGINE THAT CANNOT PUT ITS WINDOW ON THE WIRE SAYS IT HERE.
     *
     * Codex publishes a per-call figure nowhere in its stdout stream and writes
     * one to disk on every turn boundary (`token_count.info.last_token_usage`
     * beside `model_context_window`). The host reads that file and hands the
     * reading in as a canonical sample, so the reducer never has to know which
     * engine it is serving — it applies a measurement it was given, exactly as
     * it applies one it derived from a per-call usage block.
     *
     * `tokens: 0` is not a measurement and never wipes the last good one; it is
     * how a probe says "nothing new", and it can still mark the standing figure
     * STALE so the surfaces stop presenting it as live.
     */
    if (type === 'context') {
        const tokens = typeof o.tokens === 'number' && isFinite(o.tokens) ? Math.max(0, o.tokens) : 0;
        const win = typeof o.window === 'number' && isFinite(o.window) && o.window > 0
            ? o.window : undefined;
        const stale = o.stale === true;
        if (!tokens) {
            // Only a freshness claim. Nothing to draw unless it changes one.
            if (!state.contextTokens || !!state.contextStale === stale) { return { state, changed: false }; }
            return { state: { ...state, contextStale: stale }, changed: true };
        }
        const same = state.contextTokens === tokens
            && (win === undefined || state.contextWindowTokens === win)
            && !!state.contextStale === stale;
        if (same) { return { state, changed: false }; }
        return {
            state: {
                ...state,
                contextTokens: tokens,
                ...(win ? { contextWindowTokens: win } : {}),
                contextMeasuredAt: typeof o.measuredAt === 'number' && o.measuredAt > 0 ? o.measuredAt : now,
                contextSource: typeof o.source === 'string' && o.source ? o.source : 'engine-reported',
                contextStale: stale
            },
            changed: true
        };
    }

    if (type === 'system') {
        const sub = String(o.subtype ?? '');
        if (sub === 'init') {
            const model = typeof o.model === 'string' ? o.model : state.model;
            return {
                state: {
                    ...state,
                    sessionId: typeof o.session_id === 'string' ? o.session_id : state.sessionId,
                    model,
                    // …and the turn that is running learns it too: init is the CLI
                    // naming the model we only had an alias (or nothing) for, so
                    // it is a correction to this turn, not a switch away from it
                    // (see turnModel).
                    ...(state.turnStartedAt ? { turnModel: model } : {}),
                    permissionMode: typeof o.permissionMode === 'string' ? o.permissionMode : state.permissionMode,
                    // S-54 — what this CLI says it can do; only written when it
                    // said anything, so an older build is "not advertised", not "no"
                    ...(Array.isArray(o.capabilities)
                        ? { capabilities: (o.capabilities as unknown[]).filter((c): c is string => typeof c === 'string') }
                        : {}),
                    // ‼️ K-29 — THE COMMANDS THIS INSTALL ACTUALLY HAS, from the
                    // only source that knows: the process. Measured here, the
                    // list came back with 47 entries mixing the CLI's own with
                    // the skills on THIS machine — which is precisely why no
                    // shipped table can be the answer, only the fallback.
                    // Merged rather than replaced: a resume or a /reload-skills
                    // sends a second init, and a picker that lost commands
                    // because the second report was shorter would be worse than
                    // one that never had them (see mergeReported).
                    slashCommands: mergeReported(state.slashCommands, o.slash_commands),
                    // ‼️ K-36 — AND THE TWO FACTS THAT MAKE THE NAMES USABLE,
                    // out of the same event. Written ONLY when the CLI actually
                    // sent the field: an older one that says nothing must not be
                    // read as "none of them are skills" / "none of them need a
                    // terminal", which would re-label the whole list off silence.
                    ...(Array.isArray(o.skills)
                        ? { slashSkills: mergeReported(state.slashSkills, o.skills) }
                        : {}),
                    ...(Array.isArray(o.terminal_slash_commands)
                        ? {
                            slashTerminalOnly: mergeReported(
                                state.slashTerminalOnly, o.terminal_slash_commands)
                        }
                        : {}),
                    status: state.status === 'starting' ? 'idle' : state.status,
                    // X-349 — the engine has now announced itself, so the card's
                    // `idle` no longer rests on the registry alone.
                    ...(state.revivedWaiting ? { revivedWaiting: undefined } : {}),
                    lastTs: now
                },
                changed: true
            };
        }
        /**
         * ‼️ S-62 — THE CLI'S OWN LIST OF WHAT IT IS RUNNING BEHIND THE TURN,
         * replaced whole. `tasks` is every live background task at this moment
         * (measured: `[]` the instant one finishes, before its notification);
         * an entry we already knew keeps the moment we first saw it.
         */
        if (sub === 'background_tasks_changed') {
            if (!Array.isArray(o.tasks)) { return { state, changed: false }; }
            const known = new Map((state.backgroundTasks ?? []).map(t => [t.id, t]));
            const tasks: BackgroundTask[] = [];
            for (const raw of o.tasks as unknown[]) {
                const t = raw as Record<string, unknown> | undefined;
                if (!t || typeof t.task_id !== 'string' || !t.task_id) { continue; }
                const was = known.get(t.task_id);
                tasks.push({
                    id: t.task_id,
                    kind: typeof t.task_type === 'string' ? t.task_type : (was?.kind ?? ''),
                    description: typeof t.description === 'string' ? t.description : (was?.description ?? ''),
                    startedAt: was?.startedAt ?? now,
                    ...(was?.toolUseId ? { toolUseId: was.toolUseId } : {})
                });
            }
            const same = tasks.length === (state.backgroundTasks ?? []).length
                && tasks.every((t, i) => t.id === state.backgroundTasks![i].id);
            if (same) { return { state, changed: false }; }
            return { state: { ...state, lastTs: now, backgroundTasks: tasks.length ? tasks : undefined }, changed: true };
        }
        // …and the tool call each one came from. `background_tasks_changed`
        // precedes this and already lists it; an order the other way round
        // (or a CLI that sends only this) still lands the task in the list.
        if (sub === 'task_started') {
            if (o.is_backgrounded !== true || typeof o.task_id !== 'string' || !o.task_id) { return { state, changed: false }; }
            const list = state.backgroundTasks ?? [];
            const toolUseId = typeof o.tool_use_id === 'string' ? o.tool_use_id : undefined;
            const at = list.findIndex(t => t.id === o.task_id);
            if (at >= 0) {
                if (!toolUseId || list[at].toolUseId === toolUseId) { return { state, changed: false }; }
                const next = list.slice();
                next[at] = { ...next[at], toolUseId };
                return { state: { ...state, backgroundTasks: next }, changed: true };
            }
            return {
                state: {
                    ...state, lastTs: now,
                    backgroundTasks: [...list, {
                        id: o.task_id,
                        kind: typeof o.task_type === 'string' ? o.task_type : '',
                        description: typeof o.description === 'string' ? o.description : '',
                        startedAt: now, ...(toolUseId ? { toolUseId } : {})
                    }]
                },
                changed: true
            };
        }
        /**
         * ‼️ THE PROCESS IS OVER, AND WHAT THE CLI DOES NEXT DEPENDS ON HOW.
         * Measured: `completed` (and `failed`) are handed to the model — as a
         * new turn when none is running, which is the S-62 surprise, and this
         * row is the only thing on the card that says why that turn opened.
         * `stopped` (a `stop_task`, ours or the CLI's own on an interrupt it
         * caught in flight) opens nothing. `summary` is the CLI's own sentence
         * when it wrote one; on a stop it measured as the bare description.
         */
        if (sub === 'task_notification') {
            const taskId = typeof o.task_id === 'string' ? o.task_id : '';
            const status = typeof o.status === 'string' ? o.status : '';
            const was = (state.backgroundTasks ?? []).find(t => t.id === taskId);
            const rest = (state.backgroundTasks ?? []).filter(t => t.id !== taskId);
            const summary = typeof o.summary === 'string' ? o.summary.trim() : '';
            const desc = was?.description || summary;
            const text = status === 'stopped'
                ? `background command stopped: ${desc}`
                : (summary && /\bcommand\b/i.test(summary) ? summary : `background command ${status || 'ended'}: ${desc}`)
                    + (state.status === 'working'
                        ? ' — its result goes to the model in this turn'
                        : ' — the CLI opens a new turn to hand its result to the model');
            return {
                state: {
                    ...state, lastTs: now,
                    backgroundTasks: rest.length ? rest : undefined,
                    messages: [...state.messages, { id: nextId(), ts: now, role: 'system', text }]
                },
                changed: true
            };
        }
        // ‼️ `thinking_tokens` IS NOT CONTEXT, AND WRITING IT INTO THE CTX
        // FIGURE IS WHY THAT FIGURE COLLAPSED MID-TURN. The CLI's own
        // description of the event: "Live thinking-token estimate, digested
        // from thinking_delta.estimated_tokens … estimated_tokens is the
        // running total for the CURRENT THINKING BLOCK" (read out of the 2.1.220
        // binary). It starts near zero on every block and climbs, and it is
        // emitted constantly — TWELVE of them in one short measured turn — so a
        // session sitting at a true 225k was repeatedly knocked down to ~100
        // and shown climbing 100 → 200 → 500 until the next assistant message
        // restored it. It says nothing about the window; the window is measured
        // where the usage is (see the assistant branch).
        return { state, changed: false };   // hook lifecycle & friends
    }

    if (type === 'assistant') {
        const msg = o.message as {
            id?: unknown; model?: unknown; content?: unknown; usage?: Record<string, unknown>;
        } | undefined;
        const blocks = Array.isArray(msg?.content) ? msg!.content as Record<string, unknown>[] : [];
        /**
         * ‼️ S-57 — A TURN NOBODY IN THIS WINDOW STARTED IS STILL A TURN, AND
         * IT IS OPENED HERE.
         *
         * Three places open a turn — `acceptUserText`, `shiftQueued` and
         * `releaseShared` — and all three are the WINDOW speaking. A resumed
         * conversation has a fourth case none of them cover: the CLI answers on
         * its own, because the prompt was given to it before this window
         * existed (a reload, a revive, an `--resume` of a session that was
         * mid-turn). This branch used to handle that by setting `status` to
         * `working` and nothing else, so the turn ran with no clock, no token
         * baseline, no round-trip counter and no model/effort — and the
         * `result` line then closed it with `undefined` for every one of them.
         *
         * Measured through the reducer alone, on the exact shape S-57 reported:
         *   lastTurn = { cost: 20.94, steps: 1, outcome: 'done' }
         * which the strip prints as `$20.94 · 1step · your turn now` — the
         * whole of the complaint. Nothing was being LOST; it was never
         * collected, because the turn was never opened.
         *
         * ‼️ AND IT IS OPENED BEFORE THE BLOCKS ARE READ, not after. The loop
         * below adds this very line's tokens to `tokens`, its round trip to
         * `turnApiCalls` and its usage to `turnUsage`; a turn opened afterwards
         * would take its baseline from figures this line had already moved and
         * charge the turn nothing for the call that started it.
         *
         * `turnStartedAt` is `now` — the first line this window SAW. The real
         * start is a few seconds earlier, in a process that was running before
         * we were listening, and there is nowhere honest to read it from; a
         * duration that is slightly short is worth incomparably more than the
         * blank this replaces.
         */
        const opening = state.turnStartedAt === undefined && blocks.length > 0
            ? {
                turnStartedAt: now, turnTokensAt: state.tokens,
                turnUsage: emptyUsage(), turnApiCalls: 0,
                turnWTokens: 0, turnSteps: 0, turnThinking: 0,
                // the ball has left your court again: the previous turn's
                // summary is what a new turn clears (see lastTurn)
                lastTurn: undefined,
                ...turnBrain(state)
            }
            : {};
        let next = { ...state, ...opening };
        let changed = false;
        // What THIS call spent, to hang on its first visible block (see the
        // `charge` below). Stays 0 on a repeated line, which is the point.
        let stepSpent = 0, stepWSpent = 0;
        // Tokens are counted off each assistant message's own usage — the same
        // arithmetic the index does on a transcript, so the number on a Console
        // row and the number in the sessions table mean the same thing. (The
        // result line's usage is the TURN's, and would double-count.)
        //
        // ‼️ AND EACH MESSAGE IS COUNTED ONCE. One line per content block, each
        // repeating the same usage — see lastUsageKey for the measurement. The
        // key is the CLI's own pair, in the spelling the STREAM uses:
        // `request_id` here, `requestId` in the written transcript.
        const u = msg?.usage;
        const usageKey = `${typeof msg?.id === 'string' ? msg.id : ''}|${typeof o.request_id === 'string' ? o.request_id : ''}`;
        const repeat = usageKey !== '|' && usageKey === state.lastUsageKey;
        if (u && !repeat) {
            // ‼️ Through toUsage, so the live strip charges a 1-hour cache write
            // at the 1-hour rate — the same reading the transcript side does.
            const one: Usage = toUsage(u as RawUsage);
            const spent = totalTokens(one);
            stepSpent = spent;
            if (spent) {
                // The turn keeps its own breakdown as well as the total: the
                // total is what it spent, the breakdown is what it can be
                // priced from while it is still running (see turnUsage).
                const turn = { ...(next.turnUsage ?? emptyUsage()) };
                addUsage(turn, one);
                // ‼️ A SUB-AGENT SPENDS THIS SESSION'S TOKENS BUT DOES NOT SIT IN
                // THIS SESSION'S WINDOW. A Task/Agent call streams its own
                // assistant messages down the same pipe, marked with
                // `parent_tool_use_id`, and they start a context of their own at
                // a few hundred tokens. Their cost is real and is counted; their
                // window is not this conversation's and must not overwrite it —
                // otherwise ctx drops to ~200 for the length of the sub-agent
                // and snaps back afterwards, the same false reading
                // `thinking_tokens` used to produce.
                const ofSubAgent = typeof o.parent_tool_use_id === 'string' && !!o.parent_tool_use_id;
                // ‼️ X-43 — AND A SUM IS NOT A WINDOW. `contextAfter` on a block
                // that carries a turn's or a thread's total reports the whole
                // conversation's spend as the size of the window: measured, a
                // real Codex thread showed `ctx 5.4M` against a window of
                // 258 400, and the honest figure — the last call's own 220 471 —
                // was sitting in that session's rollout the whole time. Those
                // engines' ctx arrives as an explicit `context` event instead
                // (see the branch below); their usage keeps feeding spend.
                const ctxNow = ofSubAgent || usageScopeOf(o) !== 'perCall' ? 0 : contextAfter(u);
                // The limit-side twin of `spent`, off the model that served this
                // very line — a sub-agent on a cheaper model must not be charged
                // at the parent's rate. See ConsoleState.wTokens.
                const wSpent = weightedTokens(
                    (typeof msg?.model === 'string' && msg.model) || state.turnModel || state.model || '', one);
                stepWSpent = wSpent;
                next = {
                    ...next, tokens: next.tokens + spent, turnUsage: turn,
                    wTokens: next.wTokens + wSpent,
                    turnWTokens: (next.turnWTokens ?? 0) + wSpent,
                    // One round trip — see turnApiCalls. A sub-agent's calls are
                    // spent by this turn and are counted here for the same
                    // reason their tokens are: they are what the turn cost.
                    turnApiCalls: (next.turnApiCalls ?? 0) + 1,
                    // zero is "not measured here", so the last real figure stands
                    ...(ctxNow > 0 ? {
                        contextTokens: ctxNow,
                        contextMeasuredAt: now,
                        contextSource: 'stream-last-call',
                        contextStale: false
                    } : {})
                };
                changed = true;
            }
        }
        if (usageKey !== '|' && usageKey !== next.lastUsageKey) {
            next = { ...next, lastUsageKey: usageKey };
        }
        // ‼️ THE CALL'S COST IS HUNG ON ITS FIRST VISIBLE BLOCK AND NOWHERE
        // ELSE. One call carries several blocks and repeats its whole usage on
        // each; writing the figure on every block would say a turn cost four
        // times what it did. `charge` is spent once and then empties itself.
        let charge: { stepTokens: number; stepWTokens: number } | undefined =
            stepSpent > 0 ? { stepTokens: stepSpent, stepWTokens: Math.round(stepWSpent) } : undefined;
        const takeCharge = () => { const c = charge; charge = undefined; return c ?? {}; };
        for (const b of blocks) {
            const bt = String(b.type ?? '');
            if (bt === 'text' && String(b.text ?? '').trim()) {
                next = {
                    ...next, lastTs: now, turnSteps: (next.turnSteps ?? 0) + 1,
                    messages: [...next.messages, {
                        id: nextId(), ts: now, role: 'agent', text: String(b.text),
                        kind: 'say', ...takeCharge()
                    }]
                };
                changed = true;
            } else if (bt === 'tool_use' && b.name) {
                const name = String(b.name);
                const input = b.input as Record<string, unknown> | undefined;
                const file = WRITE_TOOLS.has(name)
                    ? String(input?.['file_path'] ?? input?.['notebook_path'] ?? '') || undefined
                    : undefined;
                next = {
                    ...next, lastTs: now, turnSteps: (next.turnSteps ?? 0) + 1,
                    messages: [...next.messages, {
                        id: nextId(), ts: now, role: 'tool',
                        tool: { id: typeof b.id === 'string' ? b.id : undefined, name, detail: shortArg(name, input), file, ...(isWaitCall(name, input) ? { wait: true } : {}) },
                        kind: stepKindForTool(name), ...takeCharge()
                    }]
                };
                changed = true;
            }
            // 'thinking' blocks are deliberately not rendered as rows — the
            // model's private working is not conversation — but they ARE steps,
            // and the most expensive kind, so they are counted twice over: into
            // the turn's total and into their own figure beside it.
            else if (bt === 'thinking' || bt === 'redacted_thinking') {
                next = {
                    ...next, turnThinking: (next.turnThinking ?? 0) + 1,
                    turnSteps: (next.turnSteps ?? 0) + 1
                };
                changed = true;
            }
        }
        // ‼️ THE UNCHANGED BRANCH STILL RETURNS `next`, NOT `state`: a repeated
        // usage line renders nothing and is still the only place `lastUsageKey`
        // is recorded, and dropping it would let the next copy of the same line
        // be counted a second time.
        return { state: changed ? { ...next, status: 'working' } : next, changed };
    }

    if (type === 'user') {
        // tool results come back on the user channel
        const msg = o.message as { content?: unknown } | undefined;
        const blocks = Array.isArray(msg?.content) ? msg!.content as Record<string, unknown>[] : [];
        let next = state;
        let changed = false;
        for (const b of blocks) {
            if (String(b.type ?? '') !== 'tool_result') { continue; }
            const text = typeof b.content === 'string' ? b.content : JSON.stringify(b.content ?? '');
            const isError = b.is_error === true;
            const denial = isError ? detectPermissionDenial(text) : undefined;
            next = {
                ...next, lastTs: now,
                ...(denial ? { pendingPermission: { ...denial, ts: now } } : {}),
                messages: [...next.messages, {
                    id: nextId(), ts: now, role: 'tool', isError,
                    text: text.replace(/\s+/g, ' ').trim().slice(0, 400),
                    // Free to produce, and the reason the NEXT call is bigger —
                    // which is exactly what a reader cannot otherwise see.
                    kind: 'result',
                    ...(denial ? { permission: denial } : {})
                }]
            };
            changed = true;
        }
        return { state: next, changed };
    }

    if (type === 'result') {
        const cost = typeof o.total_cost_usd === 'number' ? o.total_cost_usd : 0;
        const isError = o.is_error === true;
        const sub = String(o.subtype ?? '');
        /**
         * ‼️ K-27 — "INTERRUPTED" MEANS A PERSON STOPPED IT, AND NOTHING ELSE.
         *
         * `error_during_execution` is CLAUDE CODE's word for that, and reading
         * the subtype was the whole test — so any translator that reached for
         * the nearest-looking Claude subtype for its own failures inherited a
         * verdict it never meant. `agyproto.ts` did exactly that and the strip
         * above the composer said `⎋ last turn interrupted` after turns nobody
         * had touched, because one tool inside them had failed.
         *
         * A translator now SAYS which it is and is believed. Only an event that
         * does not answer falls back to Claude's subtype, which is the engine
         * that owns the word.
         */
        const interrupted = typeof o.interrupted === 'boolean'
            ? o.interrupted
            : sub === 'error_during_execution';
        /** …and the engine's complaint about a turn that still ANSWERED: kept on
         *  the closing line, where it always was, without failing the turn. */
        const warning = typeof o.warning === 'string' ? o.warning.trim() : '';
        // What the turn actually cost you, closed off where it ended: the time
        // it took and the tokens it spent were both already known — they were
        // just never told. A turn is the unit you think in, so it gets a line.
        const ms = state.turnStartedAt ? Math.max(0, now - state.turnStartedAt) : undefined;
        const spent = state.turnTokensAt !== undefined
            ? Math.max(0, state.tokens - state.turnTokensAt)
            : undefined;
        // ‼️ THE ENGINE'S OWN WORDS, WHEN IT SAID ANY (X-26). This line used to
        // print a fixed "turn interrupted" and drop `error` on the floor — so a
        // turn that died on *invalid model selection (--model
        // "gemini-3.5-flash" --effort ""): requires --effort (available: low,
        // medium, high)* reached the reader as three words that name a cause
        // that did not happen. "Interrupted" says a person or a signal stopped
        // it; this was a refusal, with the fix written out in full inside the
        // message being discarded. `agyproto.ts` was already careful to carry it
        // ("a tidied message throws exactly that away") and this is where it was
        // being tidied. The fixed words stay as the FALLBACK, for the engines
        // and the cases that genuinely say nothing.
        const said = [o.error, o.result]
            .map(v => (typeof v === 'string' ? v.trim() : ''))
            .find(v => v.length > 0) ?? '';
        // ‼️ X-480 — WHO STOPPED IT, or that nobody here did. Only a turn the
        // engine closed in silence is said to have no stop behind it: Claude's
        // `error_during_execution` with words in it is a failure (X-26), and
        // those words are never re-labelled by guesswork.
        const stop = !isError ? ''
            : state.stopAsked ? stopWords(state.stopAsked.from)
            : interrupted && !said ? NO_STOP_ASKED : '';
        const next = push({
            role: 'result',
            text: isError
                ? [said || (interrupted ? 'turn interrupted' : `turn failed (${sub})`), stop].filter(Boolean).join(' · ')
                : warning,
            isError,
            cost,
            ms,
            tokens: spent || undefined,
            turns: typeof o.num_turns === 'number' ? o.num_turns : undefined
        });
        return {
            state: {
                ...next,
                status: 'idle',
                costUSD: Math.round((state.costUSD + cost) * 10000) / 10000,
                turns: state.turns + 1,
                turnStartedAt: undefined,
                turnTokensAt: undefined,
                turnModel: undefined,
                turnEffort: undefined,
                // the estimate is over: the number above is the CLI's own
                turnUsage: undefined,
                turnWTokens: undefined,
                turnThinking: undefined,
                turnApiCalls: undefined,
                turnSteps: undefined,
                // S-54 — the turn is over, so nothing is "said into it" any more
                steered: undefined,
                pendingInterrupt: undefined,
                stopAsked: undefined,
                // …and it is kept, so the strip above the composer still says
                // what the turn that just ended cost — and what it thought with,
                // which a switch made in the meantime must not rewrite
                // (see lastTurn)
                lastTurn: {
                    endedAt: now, ms, tokens: spent || undefined,
                    wTokens: Math.round(state.turnWTokens ?? 0) || undefined, cost,
                    apiCalls: state.turnApiCalls || undefined,
                    // …and the steps those calls carried, kept for the same
                    // reason: the strip that closes a turn has to be able to
                    // say the same pair the running strip said a second ago.
                    steps: state.turnSteps || undefined,
                    thinking: state.turnThinking || undefined,
                    outcome: !isError ? 'done' : interrupted ? 'interrupted' : 'failed',
                    model: state.turnModel, effort: state.turnEffort
                },
                sessionId: typeof o.session_id === 'string' ? o.session_id : state.sessionId
            },
            changed: true
        };
    }

    // ---- the CLI asking US something (see ConsoleAsk) ----------------------
    if (type === 'control_request') {
        const req = (o.request as Record<string, unknown> | undefined) ?? {};
        if (String(req.subtype ?? '') !== 'can_use_tool') { return { state, changed: false }; }
        const tool = String(req.tool_name ?? 'a tool');
        const input = (req.input as Record<string, unknown> | undefined) ?? {};
        const questions = askQuestions(input);
        const ask: ConsoleAsk = {
            requestId: String(o.request_id ?? ''),
            tool,
            displayName: typeof req.display_name === 'string' ? req.display_name : undefined,
            toolUseId: typeof req.tool_use_id === 'string' ? req.tool_use_id : undefined,
            interactive: req.requires_user_interaction === true,
            input,
            questions,
            detail: questions.length
                ? questions.map(q => q.question).join(' · ').slice(0, 300)
                : (shortArg(tool, input) || tool),
            ts: now
        };
        if (!ask.requestId) { return { state, changed: false }; }
        /**
         * ‼️ K-22 — A SESSION IN ENFORCED BYPASS DOES NOT OPEN A WINDOW.
         *
         * A bypassed process is not supposed to send `can_use_tool` at all, so
         * arriving here is a CLI regression — and the user's decision covers
         * the regression too: "whatever happens, do not ask me". The request is
         * settled here, silently, and counted as the evidence it is.
         *
         * The one shape that is settled the OTHER way is the catastrophic one
         * (see bypassVerdict): "never ask me" is not "delete my home directory
         * while I am not looking". It is denied, said out loud, and handed back
         * to the agent as an ordinary tool error.
         */
        if (state.enforcedPermissionMode === BYPASS) {
            const verdict = bypassVerdict(tool, input, questions.length > 0);
            if (verdict.kind !== 'ask') {
                const allow = verdict.kind === 'allow';
                const line = allow
                    ? askAnswerLine(ask.requestId, { behavior: 'allow', updatedInput: input })
                    : askAnswerLine(ask.requestId, {
                        behavior: 'deny',
                        message: `Refused by Agent Farm: ${verdict.why}. This session runs in bypass, which`
                            + ' approves everything else without asking — this one shape it refuses instead,'
                            + ' because "never ask me" is not consent to it.'
                    });
                return {
                    state: {
                        ...state, lastTs: now,
                        autoAnswer: { requestId: ask.requestId, line },
                        bypassAutoApproved: (state.bypassAutoApproved ?? 0) + (allow ? 1 : 0),
                        messages: allow ? state.messages : [...state.messages, {
                            id: nextId(), ts: now, role: 'error',
                            text: `⛔ ${tool} was refused automatically — ${verdict.why}.`
                                + ' Bypass approves everything else without asking; the agent was told'
                                + ' this one was denied and can carry on.'
                        }]
                    },
                    changed: true
                };
            }
        }
        return {
            state: {
                ...state, lastTs: now, pendingAsk: ask,
                messages: [...state.messages, { id: nextId(), ts: now, role: 'ask', ask }]
            },
            changed: true
        };
    }

    // The CLI took the question back (the turn was interrupted, a hook settled
    // it, another client answered). Nothing to answer any more.
    if (type === 'control_cancel_request') {
        const id = String(o.request_id ?? '');
        if (!state.pendingAsk || (id && state.pendingAsk.requestId !== id)) {
            return { state, changed: false };
        }
        return {
            state: {
                ...state, lastTs: now, pendingAsk: undefined,
                messages: [...state.messages, {
                    id: nextId(), ts: now, role: 'ask',
                    answer: 'withdrawn — the session stopped waiting for an answer'
                }]
            },
            changed: true
        };
    }

    if (type === 'control_response') {
        const r = (o.response as Record<string, unknown> | undefined) ?? {};
        const inner = (r.response as Record<string, unknown> | undefined) ?? {};
        /**
         * ‼️ S-54 — THE INTERRUPT'S RECEIPT, AND WHAT IT SAYS ABOUT THE WORDS
         * THAT WERE ON THEIR WAY.
         *
         * Measured (claude-cli 2.1.269): `cancelled` names, by uuid, the
         * messages said into the turn that the interrupt withdrew with it — they
         * never reached the model. `still_queued` names the ones that survived
         * and WILL start a new turn the moment this one ends (an older CLI, or
         * one asked without `cancel_queued`). Either list is the reader's to
         * know: a withdrawn message has to be said again if it is still meant,
         * and a surviving one is the exact thing "the agent carried on" with.
         * An empty receipt says nothing — a silent stop is the right stop.
         */
        const pi = state.pendingInterrupt;
        if (pi && r.request_id === pi.requestId) {
            const ids = (k: string): string[] => Array.isArray(inner[k])
                ? (inner[k] as unknown[]).filter((v): v is string => typeof v === 'string') : [];
            const words = (uuids: string[]): string => uuids
                .map(u => (state.steered ?? []).find(s => s.uuid === u)?.text)
                .filter((t): t is string => !!t)
                .map(t => `«${t.length > 80 ? t.slice(0, 77) + '…' : t}»`)
                .join(' · ');
            const cancelled = ids('cancelled');
            const surviving = ids('still_queued');
            const lines: string[] = [];
            if (cancelled.length) {
                const w = words(cancelled);
                lines.push(`${cancelled.length} message${cancelled.length === 1 ? '' : 's'} you said into this turn `
                    + `${cancelled.length === 1 ? 'was' : 'were'} withdrawn with it and did NOT reach the model`
                    + (w ? `: ${w}` : '') + ' — say it again if you still mean it.');
            }
            if (surviving.length) {
                const w = words(surviving);
                lines.push(`‼️ ${surviving.length} message${surviving.length === 1 ? '' : 's'} you said into this turn `
                    + `${surviving.length === 1 ? 'is' : 'are'} still queued and WILL start a new turn as soon as this one ends`
                    + (w ? `: ${w}` : '') + ' — this CLI cannot withdraw them on interrupt.');
            }
            return {
                state: {
                    ...state, lastTs: now, pendingInterrupt: undefined,
                    messages: lines.length
                        ? [...state.messages, { id: nextId(), ts: now, role: 'system', text: lines.join(' ') }]
                        : state.messages
                },
                changed: lines.length > 0
            };
        }
        // S-62 — a `stop_task`, answered. Success is silent (the task's own
        // `stopped` notification is the row); a refusal is the one thing the
        // reader must hear, because the process it names is still running.
        const stop = (state.pendingStops ?? []).find(p => p.requestId === r.request_id);
        if (stop) {
            const left = (state.pendingStops ?? []).filter(p => p !== stop);
            const failed = r.subtype === 'error';
            const task = (state.backgroundTasks ?? []).find(t => t.id === stop.taskId);
            return {
                state: {
                    ...state, lastTs: now, pendingStops: left.length ? left : undefined,
                    messages: failed
                        ? [...state.messages, {
                            id: nextId(), ts: now, role: 'error',
                            text: `background command is still running — the CLI refused to stop it`
                                + (task?.description ? ` (${task.description})` : '')
                                + `: ${String(r.error ?? 'no reason given')}`
                        }]
                        : state.messages
                },
                changed: failed
            };
        }
        // A model switch, answered. `success` carries no payload, so the id we
        // sent it under is what says which model this is about.
        const pend = state.pendingModel;
        if (pend && r.request_id === pend.requestId) {
            const failed = r.subtype === 'error';
            return {
                state: {
                    ...state, lastTs: now, pendingModel: undefined,
                    ...(failed ? {} : { model: pend.model }),
                    messages: [...state.messages, {
                        id: nextId(), ts: now, role: failed ? 'error' : 'system',
                        text: failed
                            ? `model stayed ${state.model ?? 'as it was'} — ${String(r.error ?? 'the CLI refused the switch')}`
                            : `model is now "${pend.model}" — from the next turn on`
                    }]
                },
                changed: true
            };
        }
        // …and an effort switch, answered the same empty way (see pendingEffort)
        const pe = state.pendingEffort;
        if (pe && r.request_id === pe.requestId) {
            const failed = r.subtype === 'error';
            const name = pe.effort || 'the CLI default';
            return {
                state: {
                    ...state, lastTs: now, pendingEffort: undefined,
                    ...(failed ? {} : { effort: pe.effort }),
                    messages: [...state.messages, {
                        id: nextId(), ts: now, role: failed ? 'error' : 'system',
                        text: failed
                            ? `effort stayed ${state.effort || 'as it was'} — ${String(r.error ?? 'the CLI refused the change')}`
                            : `effort is now ${name} — from the next turn on`
                    }]
                },
                changed: true
            };
        }
        // …and the answer to "what is really in force?" (see pendingSettings).
        // Silent bookkeeping: nothing about it belongs in the conversation, and
        // an older CLI that does not know `get_settings` simply answers `error`
        // — which must leave the session exactly as it was, not print a failure
        // at the user about a question they never asked.
        const ps = state.pendingSettings;
        if (ps && r.request_id === ps.requestId) {
            const cleared = { ...state, pendingSettings: undefined };
            const ap = inner.applied as Record<string, unknown> | undefined;
            if (r.subtype === 'error' || !ap) { return { state: cleared, changed: false }; }
            const applied = {
                model: typeof ap.model === 'string' ? ap.model : '',
                // null = this model has no effort levels; '' says the same here
                effort: typeof ap.effort === 'string' ? ap.effort : ''
            };
            // Only the turn the probe was fired for may be relabelled by it.
            const forThisTurn = ps.turnStartedAt !== undefined
                && state.turnStartedAt === ps.turnStartedAt;
            return {
                state: {
                    ...cleared, applied,
                    ...(forThisTurn ? { turnModel: applied.model, turnEffort: applied.effort } : {})
                },
                changed: true
            };
        }
        // …and the live permission-mode switch (see pendingPermissionMode). The
        // refusal branch is the point: it used to fall through and change
        // nothing, which is how a dead control looks from the outside.
        const pm = state.pendingPermissionMode;
        if (pm && r.request_id === pm.requestId) {
            if (r.subtype === 'error') {
                return {
                    state: {
                        ...state, lastTs: now, pendingPermissionMode: undefined,
                        messages: [...state.messages, {
                            id: nextId(), ts: now, role: 'error',
                            text: `permission mode stayed "${state.permissionMode}" — `
                                + String(r.error ?? 'the CLI refused the switch')
                        }]
                    },
                    changed: true
                };
            }
            // What the CLI ACCEPTED, not what we asked for: `manual` comes back
            // as `default`, and the picker must show the mode really in force.
            const got = typeof inner.mode === 'string' ? inner.mode : pm.mode;
            return {
                state: {
                    ...state, permissionMode: got, pendingPermissionMode: undefined,
                    pendingPermission: undefined, lastTs: now,
                    messages: [...state.messages, {
                        id: nextId(), ts: now, role: 'system',
                        text: got === pm.mode
                            ? `permission mode is now "${got}"`
                            : `permission mode is now "${got}" — the CLI does not have a "${pm.mode}" mode`
                    }]
                },
                changed: true
            };
        }
        if (typeof inner.mode === 'string') {
            // a mode change nobody here asked for — another client, a hook, the
            // CLI's own doing. Still ours to show: it decides what runs next.
            return {
                state: {
                    ...state, permissionMode: inner.mode, pendingPermission: undefined, lastTs: now,
                    messages: [...state.messages, {
                        id: nextId(), ts: now, role: 'system',
                        text: `permission mode is now "${inner.mode}"`
                    }]
                },
                changed: true
            };
        }
        return { state, changed: false };
    }

    return { state, changed: false };
}

/**
 * A fresh session record.
 *
 * `sessionId` is optional but is set from the start on a **resume**: that id is
 * ours before the process even spawns, and everything that identifies a session
 * hangs off it — the row's name, the rename, the transcript. Waiting for the
 * CLI's own `system:init` to report it back left a resumed session nameless and
 * unrenameable ("this session has not reported its id yet") for as long as the
 * first turn took.
 */
export function newSessionState(o: {
    id: string; agentId: string; agentName: string; cwd: string;
    model?: string; effort?: string; permissionMode?: string; now: number;
    /** X-103 — the route this card runs on; kept on the state so a window reload
     *  cannot quietly move a live conversation to a different endpoint. */
    providerId?: string; tier?: string;
    /** X-109 — see ConsoleSessionState.routePinned */
    routePinned?: boolean;
    /** X-169 — the sign-in this card runs as; kept on the state so a re-spawn
     *  cannot follow the "use this next" button into another account. */
    account?: string;
    /** X-102 — the spawn this card is, so its manifest can be found again once
     *  the engine finally names the conversation (see ConsoleSessionState). */
    launchId?: string;
    sessionId?: string;
    /** the window's active project at the moment this session was started */
    projectId?: string;
    /** X-133 — the engineering discipline this session runs to, re-applied on
     *  every spawn (see ConsoleSessionState.superpowers) */
    superpowers?: boolean;
    /** an existing session picked up, not a new one — see ConsoleSessionState.resumed */
    resumed?: boolean;
    /** what a RESUMED conversation already spent — see CarriedTotals */
    carried?: CarriedTotals;
}): ConsoleSessionState {
    const c = o.carried;
    return {
        id: o.id, agentId: o.agentId, agentName: o.agentName, cwd: o.cwd,
        sessionId: o.sessionId,
        projectId: o.projectId,
        ...(o.superpowers ? { superpowers: true } : {}),
        // a resume is the one case that arrives with an id already — see `resumed`
        ...(o.resumed ? { resumed: true } : {}),
        model: o.model, effort: o.effort,
        // Absent rather than '' — an unset route is what makes the agent's own
        // record apply, and a stored empty string would pin the answer to
        // "nothing" for a card that outlives the setting.
        ...(o.providerId?.trim() ? { providerId: o.providerId.trim() } : {}),
        ...(o.tier?.trim() ? { tier: o.tier.trim() } : {}),
        ...(o.routePinned ? { routePinned: true } : {}),
        // Absent rather than '' for the same reason: an unset account is the
        // main sign-in, and a stored empty string would look like an answer.
        ...(o.account?.trim() ? { account: o.account.trim() } : {}),
        // Absent rather than '' for the same reason the route is: a card with no
        // manifest is a card whose setup is genuinely unknown, and an empty
        // string would be a handle that looks like one and finds nothing.
        ...(o.launchId?.trim() ? { launchId: o.launchId.trim() } : {}),
        permissionMode: o.permissionMode?.trim() || 'default',
        status: 'starting', messages: [], queued: [],
        costUSD: c?.costUSD ?? 0, turns: c?.turns ?? 0, tokens: c?.tokens ?? 0,
        wTokens: c?.wTokens ?? 0,
        contextTokens: c?.contextTokens || undefined,
        // ‼️ X-43 — the carried window comes back with the carried figure or the
        // resumed card draws a percentage of nothing. It is also the ONLY thing
        // the resume baseline may touch about context: `usage` beside it is a
        // SPEND baseline (see CarriedTotals.usage), and the aggregate blocks it
        // exists for can no longer overwrite this reading.
        contextWindowTokens: c?.contextWindowTokens || undefined,
        ...(c?.contextTokens
            ? { contextSource: 'transcript-last-call', contextStale: true }
            : {}),
        startedAt: o.now, lastTs: o.now
    };
}

/**
 * ‼️ WHAT A RESUMED CONVERSATION ALREADY SPENT.
 *
 * A hosted process is not the session — it is this window's turn at it. Started
 * empty, a resume made the composer's own line ("$0.0000 · 0 tokens · 0 turns
 * this session") describe the process instead of the conversation, and on the
 * first turn back it printed the running turn's tokens twice: once above the
 * box as the TURN and once below it as the SESSION, the same number growing in
 * two places. The totals therefore come back with the transcript, from the same
 * index row the resume list reads — so "this session" means the session, and
 * the turn is the difference it always was (`turnTokensAt`).
 */
export interface CarriedTotals {
    costUSD?: number;
    tokens?: number;
    /** what the resumed conversation already burned of the plan limit */
    wTokens?: number;
    turns?: number;
    contextTokens?: number;
    /** …and the capacity that reading was against, when the transcript stated
     *  one (Codex writes it on every turn boundary — see contextWindowTokens) */
    contextWindowTokens?: number;
    /**
     * ‼️ THE TOTAL, SPLIT — needed by an engine that reports CUMULATIVELY.
     *
     * `tokens` is one number and is enough for the composer's line. Codex's
     * `turn.completed` states the thread's running total rather than the turn's,
     * so the adaptor subtracts the previous total to get a turn (codexproto.ts →
     * `codexTurnUsage`) — and on a RESUME there is no previous total in memory.
     * Without a baseline the first turn back reports the whole conversation's
     * spend as one turn: the exact reading this split exists to prevent, one
     * window reload later.
     */
    usage?: Usage;
}

/** The carried totals of a transcript, off the index row the resume list uses. */
export function carriedTotals(s: {
    cost?: number; usage?: Usage; wTokens?: number; userTurns?: number;
    lastCtxTokens?: number; ctxWindow?: number;
}): CarriedTotals {
    const u = s.usage;
    return {
        costUSD: s.cost ?? 0,
        tokens: u ? u.input + u.output + u.cacheWrite + u.cacheRead : 0,
        wTokens: s.wTokens ?? 0,
        turns: s.userTurns ?? 0,
        contextTokens: s.lastCtxTokens ?? 0,
        contextWindowTokens: s.ctxWindow ?? 0,
        ...(u ? { usage: { ...u } } : {})
    };
}

/**
 * ‼️ X-213 — WHAT A CARD HANDS TO ITS OWN NEXT PROCESS.
 *
 * Re-sealing a session onto another account ends one process and resumes the
 * same conversation in another, in the same card. `carriedTotals` cannot answer
 * for that: it reads the INDEX row, and the index has not seen the turns this
 * window just watched happen — so the card's cost, tokens and turn count would
 * snap back to whatever was last written to disk, and the reader would see the
 * conversation get cheaper because they changed account.
 *
 * The state's own totals already include whatever it was resumed with (see
 * `newSessionState`), so they ARE the baseline: this is one line of arithmetic
 * written down once so nothing has to remember it.
 */
export function carryOn(s: ConsoleSessionState): CarriedTotals {
    return {
        costUSD: s.costUSD, tokens: s.tokens, wTokens: s.wTokens, turns: s.turns,
        ...(s.contextTokens ? { contextTokens: s.contextTokens } : {}),
        ...(s.contextWindowTokens ? { contextWindowTokens: s.contextWindowTokens } : {})
    };
}

/**
 * Add a user turn — and, when one is already running, STEER it.
 *
 * `starting` counts as sendable, and that is not a detail — **the CLI emits
 * nothing at all until its first stdin line arrives** (measured: no
 * `system:init`, no hook events, silence). Queueing the first message until
 * the session "looks ready" therefore deadlocks: the panel waits for an init
 * that only the message can trigger. The pipe is open the moment the process
 * exists, so the first message goes straight out.
 *
 * **‼️ A message typed mid-turn goes INTO that turn, not after it.** Measured
 * against the real CLI (2026-07-29, haiku, tool-calling turn): a user line
 * written to stdin six seconds into a running turn was delivered to the model
 * at the turn's next step — the CLI carries it as its own `queued_command`
 * attachment, exactly the mechanism the interactive TUI uses for what you type
 * while it works. Holding it back until the turn ended was therefore a choice
 * this side was making, not a limit of the channel, and it made the whole point
 * of typing early ("stop, do it this way instead") impossible: by the time the
 * message arrived the work it was meant to redirect was done.
 *
 * So the default is to send it straight through, and it joins the conversation
 * marked `steer` — it really was said, into a turn that is still running.
 *
 * `hold` is the other half, and it is a CHOICE the composer offers rather than
 * a rule: the text waits in `queued`, where it can still be edited, dropped or
 * released by hand, and `shiftQueued` hands it over when the turn ends. That is
 * for "I want to say this next", not for "stop what you are doing".
 */
/**
 * What a turn STARTS believing it is thinking with.
 *
 * The CLI's own last word first (`applied`), the pickers only as a fallback:
 * a picker is a request and is empty whenever the user made no choice, whereas
 * `applied` is an answer. Either way the probe fired with the turn overwrites
 * this a few milliseconds later (see pendingSettings) — this is what the strip
 * says in the meantime, so it must be the best thing known, not the emptiest.
 */
function turnBrain(state: ConsoleSessionState): { turnModel?: string; turnEffort?: string } {
    return {
        turnModel: state.applied?.model || state.model,
        turnEffort: state.applied ? state.applied.effort : state.effort
    };
}

export function acceptUserText(
    state: ConsoleSessionState, text: string, now: number, hold = false, attach: AttachmentNote[] = [],
    /** S-54 — the uuid the host stamps the line with, so the CLI's receipts can name it back */
    uuid?: string
): { state: ConsoleSessionState; send: boolean } {
    const t = text.trim();
    // A message carrying files is a message, even with nothing typed — a
    // screenshot on its own is a legitimate thing to say.
    if (!t && !attach.length) { return { state, send: false }; }
    if (state.status === 'working') {
        if (hold) {
            // Callers must not get here with attachments: the queue carries
            // strings, so the files would vanish silently. consolehost.send
            // refuses that combination before it reaches this point.
            return { state: { ...state, lastTs: now, queued: [...state.queued, t] }, send: false };
        }
        // Into the running turn: the turn's own clock and totals are NOT reset,
        // because this does not start a turn — it joins one.
        return {
            state: {
                ...state, lastTs: now,
                // S-54 — remembered by uuid, so an interrupt receipt can say
                // which of these never reached the model (see `steered`).
                ...(uuid ? { steered: [...(state.steered ?? []), { uuid, text: t }] } : {}),
                messages: [...state.messages, {
                    id: nextId(), ts: now, role: 'user', text: t, steer: true,
                    ...(attach.length ? { attach } : {})
                }]
            },
            send: true
        };
    }
    return {
        state: {
            ...state, lastTs: now, status: 'working', turnStartedAt: now, turnTokensAt: state.tokens,
            ...turnBrain(state),
            turnUsage: emptyUsage(),
            turnApiCalls: 0,
            // Your new prompt is what clears the finished turn's summary — the
            // invariant the strip relies on: lastTurn exists exactly while the
            // ball is yours and a turn has already run (see lastTurn).
            lastTurn: undefined,
            // X-480 — a new turn starts with no stop asked of it
            stopAsked: undefined,
            messages: [...state.messages, {
                id: nextId(), ts: now, role: 'user', text: t,
                ...(attach.length ? { attach } : {})
            }]
        },
        send: true
    };
}

/**
 * What you said back to a `can_use_tool` — the three honest shapes.
 *
 * `answer` is the AskUserQuestion one and is NOT a permission verdict: the
 * chosen labels ride back inside the tool's own input, keyed by the question
 * text, because that is the map the tool itself reads (measured against the
 * CLI: `answers["<question>"] = "<label>"` produces "Your questions have been
 * answered …", anything else produces "The user did not answer the questions").
 * `response` is the free-text way out — "neither, do this instead".
 */
export type AskDecision =
    | { kind: 'answer'; answers?: Record<string, string | string[]>; response?: string }
    /** `always` is the terminal's middle option — see sessionAllowRule */
    | { kind: 'allow'; always?: boolean }
    | { kind: 'deny'; message?: string };

/** One line saying what you chose, for the transcript row and the log. */
export function describeAnswer(ask: ConsoleAsk, d: AskDecision): string {
    if (d.kind === 'deny') {
        return d.message?.trim() ? `declined — ${d.message.trim()}` : 'declined';
    }
    if (d.kind === 'allow') {
        return d.always
            ? `allowed ${ask.tool} — and ${sessionAllowRule(ask).label} for the rest of this session`
            : `allowed ${ask.tool}`;
    }
    const picked = Object.entries(d.answers ?? {})
        .map(([q, a]) => `${q} → ${Array.isArray(a) ? a.join(', ') : a}`)
        .filter(s => !s.endsWith('→ '));
    if (d.response?.trim()) { picked.push(d.response.trim()); }
    return picked.length ? picked.join(' · ') : 'answered';
}

/**
 * The tool input the answer rides back in.
 *
 * ‼ MEASURED, and it is the whole reason this is a function rather than a spread:
 * when `response` is present the CLI renders ONLY "The user responded: <text>" and
 * DROPS `answers` entirely. Eight calls across eight months of transcripts did exactly
 * that — one of them threw away all four of the choices the user had just ticked, and
 * the agent carried on having seen none of them (X-166). Selecting and then typing is
 * not an exotic combination; it is what somebody does when the list is nearly right.
 *
 * So when the user did BOTH, the picks are folded into the response text, which is the
 * only channel that survives. `answers` is still sent: it costs nothing, it is what the
 * transcript's own `toolUseResult.answers` records, and a CLI that one day honours both
 * would merely repeat itself — the failure to avoid is the silent one.
 */
const NL = String.fromCharCode(10);

export function askInput(
    input: Record<string, unknown>, d: { answers?: Record<string, string | string[]>; response?: string }
): Record<string, unknown> {
    const answers = d.answers && Object.keys(d.answers).length ? d.answers : undefined;
    const free = d.response?.trim() ?? '';
    const response = answers && free ? [foldAnswers(answers), '', free].join(NL) : free;
    return {
        ...input,
        ...(answers ? { answers } : {}),
        ...(response ? { response } : {})
    };
}

/** The picks as text, in the same `question → answer` shape the transcript row uses. */
export function foldAnswers(answers: Record<string, string | string[]>): string {
    return Object.entries(answers)
        .map(([q, a]) => `${q} → ${Array.isArray(a) ? a.join(', ') : a}`)
        .filter(line => !line.endsWith('→ '))
        .join(NL);
}

/**
 * Answer the pending ask: the state that comes back has nothing pending, and
 * `line` is what must go on the wire to un-park the turn.
 *
 * Answering when nothing is pending returns no line at all — a stale click from
 * a panel that repainted must never write a control_response for a request the
 * CLI has already taken back (that would be an id it does not recognise).
 */
export function answerAsk(
    state: ConsoleSessionState, decision: AskDecision, now = Date.now()
): { state: ConsoleSessionState; line?: string } {
    const ask = state.pendingAsk;
    if (!ask) { return { state }; }
    const verdict = decision.kind === 'deny'
        ? { behavior: 'deny' as const, message: decision.message?.trim() || 'Declined by the user.' }
        : {
            behavior: 'allow' as const,
            updatedInput: decision.kind === 'answer'
                ? askInput(ask.input, decision)
                : ask.input,
            // ‼️ Only ever on a plain allow. An AskUserQuestion is not a
            // permission at all (see ConsoleAsk), so "don't ask again" has
            // nothing to attach itself to there.
            ...(decision.kind === 'allow' && decision.always
                ? { updatedPermissions: [sessionAllowRule(ask).rule] } : {})
        };
    return {
        state: {
            ...state, lastTs: now, pendingAsk: undefined,
            messages: [...state.messages, {
                id: nextId(), ts: now, role: 'ask', answer: describeAnswer(ask, decision)
            }]
        },
        line: askAnswerLine(ask.requestId, verdict)
    };
}

/**
 * Pull the next held message once a turn finishes — and only NOW does it
 * become part of the conversation (see acceptUserText).
 */
export function shiftQueued(
    state: ConsoleSessionState, now = Date.now()
): { state: ConsoleSessionState; text?: string } {
    if (state.status !== 'idle' || !state.queued.length) { return { state }; }
    const [next, ...rest] = state.queued;
    return {
        state: {
            ...state, queued: rest, status: 'working', lastTs: now,
            turnStartedAt: now, turnTokensAt: state.tokens, turnUsage: emptyUsage(),
            turnApiCalls: 0,
            ...turnBrain(state),
            messages: [...state.messages, { id: nextId(), ts: now, role: 'user', text: next }]
        },
        text: next
    };
}

/**
 * Change a held message before it is ever said — the terminal's own affordance
 * ("Press up to edit queued messages"), which a list you can only *clear* does
 * not have. An empty text drops the line; an out-of-range index changes
 * nothing, so a stale click from a repainted panel is a no-op rather than an
 * edit of the wrong message.
 */
export function editQueued(
    state: ConsoleSessionState, index: number, text: string, now = Date.now()
): { state: ConsoleSessionState; changed: boolean } {
    if (!Number.isInteger(index) || index < 0 || index >= state.queued.length) {
        return { state, changed: false };
    }
    const t = String(text ?? '').trim();
    const queued = t
        ? state.queued.map((q, i) => (i === index ? t : q))
        : state.queued.filter((_, i) => i !== index);
    if (t === state.queued[index]) { return { state, changed: false }; }
    return { state: { ...state, queued, lastTs: now }, changed: true };
}

/** Take one held message out of the queue — to send it now, or to pull it back
 *  into the composer for editing. Returns the text so the caller can do either. */
export function takeQueued(
    state: ConsoleSessionState, index: number, now = Date.now()
): { state: ConsoleSessionState; text?: string } {
    if (!Number.isInteger(index) || index < 0 || index >= state.queued.length) { return { state }; }
    return {
        state: { ...state, queued: state.queued.filter((_, i) => i !== index), lastTs: now },
        text: state.queued[index]
    };
}
