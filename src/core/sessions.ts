import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { AgentInfo } from './agents';
import { isGeneratedPrompt, wrapperGoal } from './authorship';
import { SessionProvenance } from './externalImports';
import {
    applyBinding, BindableSession, bindSession, isBindingHit, LaunchBinding, normCwd
} from './launchBinding';
import { addUsage, contextAfter, emptyUsage, PricingEngine, RawUsage, toUsage, totalTokens, Usage, weightedTokens } from './pricing';
import { normalizeMarks, SessionMarks } from './sessionmarks';
import { SessionStore, StoredSession } from './sessionStore';
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
    /**
     * ‼️ X-124 — THE PERMISSION MODE IN FORCE DURING THIS TURN.
     *
     * The session-level field is the LAST mode the whole transcript mentions,
     * which is the right answer for "what is this session on now" and the wrong
     * one for "what did that delegation run under" — a lane resumed with a
     * different mode reported today's for a step taken last week. The transcript
     * states the mode as an event in its own order, so the mode a turn ran under
     * is the last such event at or before the turn opened; carrying it onto the
     * turn is reading that order rather than re-deciding it.
     *
     * Absent when nothing had stated a mode yet, and on every engine that never
     * writes the event at all — an absence, never a default.
     */
    permissionMode?: string;
}

/**
 * ‼️ X-95 — WHICH OF AGENT FARM'S OWN MECHANISMS STARTED A SESSION, and — when
 * that mechanism was a mission — WHICH MISSION.
 *
 * `kind`/`label`/`mode` are the launcher itself. The two mission fields are the
 * STAMP: a mission opens and closes many sessions (its planner's own headless
 * lane and one per delegation), and until they carried the run's id there was no
 * way to gather them, to keep them out of the log of a person's own dialogs, or
 * to tell one mission's sessions from another's. They are set together and only
 * on `kind === 'mission'` — see `sessionMission`, which is the only reader.
 */
export interface SessionLauncher {
    kind: string;
    label: string;
    mode?: string;
    /** The mission RUN this session belongs to (`kind === 'mission'` only). */
    missionId?: string;
    /** That run's spec title, so a surface can name the mission without the store. */
    missionTitle?: string;
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
    /**
     * ‼️ X-44 — THE THREE FACTS `source` USED TO CARRY AT ONCE.
     *
     * `producerEngine` is the engine that DID the work, `storageEngine` is the
     * format the file on disk is in, and `provenance` says whether those are
     * the same run or a copy of somebody else's. On a native session all three
     * agree and nothing changes; on a Codex Desktop import of a Claude
     * transcript they are claude / codex / imported, and reading the folder as
     * the engine is what filed a $12.47 headless mission as a free user-typed
     * Codex chat. Full reasoning: `externalImports.ts`.
     *
     * ANALYTICS AND FILTERS read `canonicalSessionId` (the id of the run that
     * really happened); RESUME AND OPEN read `sessionId` (the thread the file
     * on disk actually is). Mixing those two up is the whole bug.
     */
    producerEngine?: string;
    storageEngine?: string;
    provenance?: SessionProvenance;
    /** The id of the run this record is a record OF — its own id when native. */
    canonicalSessionId?: string;
    sourceSessionId?: string;
    sourcePath?: string;
    importedThreadId?: string;
    /** ms — when the COPY was made. Never used as the time the work ran. */
    importedAt?: number;
    /**
     * Set on an import row once its canonical source is found in the index: the
     * row is kept and reachable (resume, "open the imported copy") but is no
     * longer counted, because the work it describes is already counted once
     * under `aliasOf`.
     */
    aliasOf?: string;
    /** The mirror of the above, on the canonical row: ids that are copies of it. */
    importAliases?: string[];
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
    /** K-35 — the user's own colour on this session (`#rrggbb`), drawn as a dot
     *  on every card that shows it. Absent until they pick one. */
    color?: string;
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
    /**
     * !! S-45 - THE MODEL THAT ANSWERED LAST, which is NOT `models[models.length - 1]`.
     *
     * `models` is a SET rendered in first-seen order, so a session that went
     * opus -> sonnet -> opus holds `[opus, sonnet]` and its last element names
     * the model that stopped being used. Every "what is it on now" reader wants
     * this field; `models` stays the honest answer to "what has served it".
     * Absent on a transcript whose every assistant line was synthetic.
     */
    lastModel?: string;
    /**
     * !! S-45 - THE REASONING EFFORT THE LAST ANSWER RAN AT.
     *
     * The transcript states it on the assistant line itself (a top-level
     * `effort`, beside `type`/`timestamp` - not inside `message`), so the last
     * line that names one is the session's current setting. Like
     * `permissionMode` its absence is an ABSENCE, never a default: an engine
     * that never writes the field, and every line written before the CLI began
     * to, say nothing rather than "low".
     */
    effort?: string;
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
    launchedBy?: SessionLauncher;
    /**
     * ‼️ X-102 — WHICH SPAWN PRODUCED THIS TRANSCRIPT, and therefore which
     * MANIFEST describes what it was set up to be.
     *
     * Never read off the transcript, because no engine writes it: measured on a
     * real Claude JSONL (2.1.251, 1373 records) the file carries `sessionId`,
     * `cwd`, `version`, `gitBranch`, `userType`, `entrypoint`, `permissionMode`
     * and `promptSource` — and nothing about the route, the profile revision or
     * the catalog the model came out of. This arrives from the BINDING, which is
     * the record that is allowed to learn, and it is the one field that lets a
     * session row reach its manifest at all.
     *
     * Absent on every session that predates the manifest and on every one a
     * person started by hand outside a bound mechanism — an absence, never a
     * default, and `manifestOf` returning `undefined` is what it means.
     */
    launchId?: string;
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
 * X-44 — the key every COUNT is taken on. A session that is a copy of another
 * run answers with the run's id, so source and alias fall on the same key and
 * the work is counted once; everything else answers with itself.
 */
export function canonicalSessionKey(
    s: Pick<SessionInfo, 'sessionId' | 'canonicalSessionId'>
): string {
    return s.canonicalSessionId || s.sessionId;
}

/** The engine that DID the work — not the folder the file happens to sit in. */
export function producerEngineOf(
    s: Pick<SessionInfo, 'producerEngine' | 'source' | 'provenance'>
): string {
    if (s.producerEngine) { return s.producerEngine; }
    // An import whose source cannot be named has NO known producer; saying the
    // storage engine here is exactly the false claim X-44 removed.
    if (s.provenance === 'imported-unknown-source') { return 'unknown'; }
    return s.source || 'claude';
}

/** The format the file on disk is in — what resume and the viewer must use. */
export function storageEngineOf(
    s: Pick<SessionInfo, 'storageEngine' | 'source'>
): string {
    return s.storageEngine || s.source || 'claude';
}

/** A row that is a copy of a run already present in the index. */
export function isImportAlias(s: Pick<SessionInfo, 'aliasOf'>): boolean {
    return !!s.aliasOf;
}

/**
 * One sentence for the badge/AFTip on any row: what ran it, and whether what we
 * are looking at is the run or a copy of it. Kept here so Sessions, Search, the
 * Viewer and the bridge cannot word the same fact three ways.
 */
export function provenanceNote(s: SessionInfo): string | undefined {
    if (!s.provenance || s.provenance === 'native') { return undefined; }
    if (s.provenance === 'imported-unknown-source') {
        return `Imported into ${storageEngineOf(s)} — the source is not named by any manifest, `
            + 'so the engine that actually ran it is unknown.';
    }
    const producer = producerEngineOf(s);
    const when = s.importedAt ? new Date(s.importedAt).toISOString().slice(0, 10) : '';
    return `Ran on ${producer}; this file is the copy ${storageEngineOf(s)} made`
        + `${when ? ` on ${when}` : ''}`
        + `${s.aliasOf ? '. The run itself is indexed under its own transcript.' : '.'}`;
}

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
 *
 * ‼️ …AND INSIDE THE FLEET, "sdk-cli" IS NO LONGER READ AS A CONFESSION (S-37).
 *
 * `sdk-cli` says a PROGRAM entered the CLI. It does not say WHICH program, and
 * in an agent's own folder there are only two candidates: one of Agent Farm's
 * own mechanisms — which always leaves a record, a live task, an archived one
 * or a launch binding, and is therefore already caught by `launchedBy` above —
 * or the Console, which is a person typing. Reading the entrypoint there was a
 * GUESS dressed as evidence, and it fell the moment the Console's own note went
 * missing: one window overwrote another's `console-sessions.json`, a whole day
 * of the user's dialogs lost their mark, and every surface promptly drew them
 * as 🤖 automation runs. The absence of our record is now read for what it is —
 * this was not one of ours — and only OUTSIDE the fleet, where Agent Farm keeps
 * no ledger and a stray `claude -p` genuinely could be anything, does the
 * entrypoint still get to answer.
 */
export function sessionOrigin(s: OriginFacts | SessionInfo): SessionOrigin {
    if (s.launchedBy) { return 'auto'; }
    if (s.consoleHosted) { return 'user'; }
    if (s.agentId) { return 'user'; }
    return String(s.entrypoint ?? '').startsWith('sdk') ? 'auto' : 'user';
}

/**
 * ‼️ X-95 — IS THIS SESSION A MISSION'S, AND WHOSE.
 *
 * The third fact about a run, beside "who started it" and "was there a screen".
 * A mission opens a session for its planner and one for every delegation it
 * hands out, so on a farm that runs missions they are the majority of the log —
 * and until they were stamped they sat in the same table as a person's own
 * dialogs with nothing to sort them by. Read off the launcher, which is the
 * recorded fact; never guessed from a title or a folder.
 *
 * Returns undefined for every session that is not a mission's, so `if` on it.
 */
export function sessionMission(
    s: Pick<SessionInfo, 'launchedBy'>
): { id: string; title: string } | undefined {
    const l = s.launchedBy;
    if (!l || l.kind !== 'mission' || !l.missionId) { return undefined; }
    return { id: l.missionId, title: l.missionTitle || l.label || l.missionId };
}

/**
 * ‼️ S-41 — THE FOUR FACTS THE TWO RULES ARE MADE OF, AND WHY THEY ARE REQUIRED.
 *
 * `Pick<SessionInfo, …>` made every one of them optional, so `sessionOrigin({
 * launchedBy })` compiled — and a caller that left `agentId` out got a
 * different answer from one that passed it, for the same session, with nothing
 * anywhere saying so. That is not a rule with an exception; it is two rules.
 * Every field is REQUIRED here and may be `undefined`: a caller has to write
 * what it does not know, and the next fact these rules learn to read breaks the
 * build at every surface instead of going quietly missing at one of them.
 *
 * A surface holding the whole `SessionInfo` passes THAT — it cannot leave out a
 * field it does not know exists. What the union refuses is the third shape, the
 * one that caused this: an object assembled by hand out of two of the four.
 */
export interface OriginFacts {
    entrypoint: string | undefined;
    consoleHosted: boolean | undefined;
    launchedBy: SessionLauncher | undefined;
    agentId: string | undefined;
}

/**
 * X-44 — the provenance block, worded ONCE for every bridge row that carries it.
 * Backwards compatible by construction: `engine` stays where it was on each op
 * and this is added beside it, so a reader that never looked is unaffected and
 * one that does can tell a run from a copy of a run.
 */
export function provenanceFields(s: SessionInfo): {
    producer: string; storage: string; provenance: SessionProvenance;
    canonicalId: string; importedFrom: string | null; importedAt: number | null;
    aliasOf: string | null; importAliases: string[];
} {
    return {
        producer: producerEngineOf(s),
        storage: storageEngineOf(s),
        provenance: s.provenance ?? 'native',
        canonicalId: canonicalSessionKey(s),
        importedFrom: s.sourcePath ?? null,
        importedAt: s.importedAt ?? null,
        aliasOf: s.aliasOf ?? null,
        importAliases: s.importAliases ?? []
    };
}

/**
 * ‼️ S-35 — WAS THERE A SCREEN, OR DID IT RUN WITH NOBODY THERE.
 *
 * `sessionOrigin` answers "who started it"; this answers the second half of the
 * same question, which the 🤖 glyph on its own could not: an automation run is
 * either a headless run (`claude -p`, `agy`, `opencode run`, Codex headless...)
 * with no terminal and no keyboard, or a task launched in `interactive` mode
 * that opened a real terminal a person can type into.
 *
 * ‼️ S-41 — AND IT IS DECIDED WITHOUT ASKING WHO STARTED THE RUN.
 *
 * This used to open with `if (sessionOrigin(s) !== 'auto') { return false; }`,
 * which does not narrow the answer — it DEFINES one axis in terms of the other,
 * and the two are independent by construction: a task launched in interactive
 * mode is automation with a terminal, and the whole reason the page carries two
 * filters rather than one is that such a run exists. Read off the execution
 * evidence alone, in this order:
 *
 * 1. The Console hosts a panel a person is watching — there is a screen.
 * 2. A run Agent Farm started states its own launch dimension (`mode`), which
 *    is a recorded fact and not a reading of the transcript.
 * 3. Otherwise the entrypoint is all there is: `cli` is a terminal somebody sat
 *    at, `sdk-*` is a program's entry — except inside the fleet, where `sdk-cli`
 *    is also the Console's own shape and its record can go missing (S-37).
 *
 * Every case answers as it did before; what is gone is the dependency, so a
 * session can now be 🤖 Auto and NOT headless without the two rules arguing.
 */
export function sessionHeadless(s: OriginFacts | SessionInfo): boolean {
    if (s.consoleHosted) { return false; }
    if (s.launchedBy) {
        return !(s.launchedBy.mode === 'interactive' || s.entrypoint === 'cli');
    }
    if (s.entrypoint === 'cli') { return false; }
    if (String(s.entrypoint ?? '').startsWith('sdk')) { return !s.agentId; }
    return false;
}

/**
 * !! S-45 - THE THREE DIMENSIONS A TRANSCRIPT CAN ANSWER FOR ITSELF.
 *
 * A resumed session used to come back on the fleet's current defaults, so a
 * conversation the user had put on a big model at high effort under bypass
 * restarted on whatever the settings page happened to say - and, because the
 * composer's boxes are SEEDED from those same defaults, the value travelling
 * with the click was the default too. There was no layer between them that
 * knew what the session had actually been run as.
 *
 * The transcript is that layer, and it is the RIGHT one: a user who types
 * `/model opus` inside the session changes the run without Agent Farm ever
 * hearing about it, so anything Agent Farm had written down at launch would be
 * stale exactly when it mattered. What the file says is what happened.
 *
 * A field that is absent stays absent - the caller falls through to its own
 * next layer (the composer box, then the fleet default) rather than being
 * handed an invention. And what comes back must still pass `narrowLaunch`:
 * these are facts about ONE engine, and the row may be resumed after the
 * catalogue that offered them has moved on.
 */
export interface LastRunDims {
    model?: string;
    effort?: string;
    permissionMode?: string;
}

export function lastRunDimensions(s: {
    lastModel?: string;
    models?: string[];
    effort?: string;
    permissionMode?: string;
} | undefined | null): LastRunDims {
    const out: LastRunDims = {};
    if (!s) { return out; }
    // `models` is the fallback for a parse remembered by an older build, and
    // only that: it is ordered by first sight, so it names the last model to
    // APPEAR rather than the last to answer (see SessionInfo.lastModel).
    const model = String(s.lastModel ?? s.models?.[s.models.length - 1] ?? '').trim();
    if (model) { out.model = model; }
    const effort = String(s.effort ?? '').trim();
    if (effort) { out.effort = effort; }
    const mode = String(s.permissionMode ?? '').trim();
    if (mode) { out.permissionMode = mode; }
    return out;
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
    /** S-45 - reasoning effort, written on the assistant line itself. */
    effort?: string;
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
export const FIRST_PROMPT_MAX = 4000;

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
    // ‼️ S-36 — a prompt THIS extension generated is named by its subject, not
    // by the template it was poured into. Before any whitespace flattening,
    // because the wrapper is recognized by its section headings.
    const generated = wrapperGoal(text);
    if (generated) { return truncate(generated.goal, 80); }
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

/**
 * ‼️ THE PARSER IS RESUMABLE, AND THAT IS THE WHOLE ARCHITECTURE.
 *
 * A transcript is append-only: it never rewrites what it has already said.
 * Reading one from byte zero every time it grows therefore does work
 * proportional to the WHOLE HISTORY in order to learn what changed in the last
 * few hundred bytes. Measured on this machine before this existed: a 37 MB
 * session cost 257 ms of blocked extension host on every write, and one full
 * scan of a 703 MB corpus cost 7.5 s at every window open — 68 s at 3 000
 * sessions, 228 s at 10 000. Both figures grow with how long the user has
 * owned the tool, which is the one kind of growth a daily driver may never
 * have: the cost of an hour's work must not depend on how many years came
 * before it.
 *
 * So the state a parse accumulates is named and kept, and new bytes are fed
 * into it. feedSessionParser may be called once with a whole file or a hundred
 * times with its tail; what finishSessionParse returns is the same either way
 * — parseSessionFile below IS the one-shot case, so every existing caller and
 * test keeps its exact meaning.
 */
export interface SessionParser {
    readonly file: string;
    /** The running total — NOT the answer; finishSessionParse derives that. */
    readonly info: SessionInfo;
    /** Usage lines already billed, so a resumed feed cannot bill them twice. */
    readonly seenUsageKeys: Set<string>;
    readonly models: Set<string>;
    readonly turnModelSets: Set<string>[];
    /** Bytes of the file consumed so far — where the next read starts. */
    offset: number;
    /** Bytes after the last newline: a line the writer has not finished yet. */
    tail: Buffer;
}

const NEWLINE = 0x0a;
/** Feeding trims down to this; finishing keeps MAX_EVENTS_PER_FILE of it. */
const EVENT_SLACK = MAX_EVENTS_PER_FILE * 4;
const RECENT_MSG_SLACK = 4096;

/**
 * ‼️ THE PARSER VERSION IS PART OF THE CACHE KEY. A remembered parse is only
 * as trustworthy as the code that produced it: change what a figure MEANS and
 * every stored figure becomes a confident lie. Bump this whenever the parse
 * changes and every index on every machine rebuilds itself once, quietly.
 */
export const SESSION_PARSER_VERSION = 3;

/** How long the walk may run before it lets the host answer something else. */
const SCAN_BREATH_MS = 12;
/** A transcript quiet for this long is history: it will not be fed again. */
const PARSER_RETAIN_MS = 60 * 60 * 1000;
/** Resumable states held for live sessions — coldest evicted past this. */
const MAX_LIVE_PARSERS = 64;
/** Largest stretch parsed without letting go — ~10 ms of work on this corpus. */
const FEED_CHUNK_BYTES = 2 << 20;

/** Hand the event loop back, so a long walk never reads as a frozen window. */
const breathe = (): Promise<void> => new Promise<void>(res => setImmediate(res));

/**
 * The bytes between two offsets of a file.
 *
 * ‼️ A SHORT READ IS NOT AN ERROR HERE. The size came from a stat taken a
 * moment ago and the writer never stopped; asking for more than is there now
 * is normal, and what did arrive is a valid prefix of the append. It is
 * returned as-is, and whatever is still missing arrives on the next change.
 */
async function readRange(file: string, from: number, to: number): Promise<Buffer | undefined> {
    if (to <= from) { return Buffer.alloc(0); }
    let fh: fs.promises.FileHandle | undefined;
    try {
        fh = await fs.promises.open(file, 'r');
        const buf = Buffer.allocUnsafe(to - from);
        const { bytesRead } = await fh.read(buf, 0, buf.length, from);
        return bytesRead === buf.length ? buf : buf.subarray(0, bytesRead);
    } catch {
        return undefined;
    } finally {
        try { await fh?.close(); } catch { /* already closed */ }
    }
}

export function createSessionParser(file: string, projectDirDepth: number): SessionParser {
    const info: SessionInfo = {
        file,
        sessionId: path.basename(file, '.jsonl'),
        isSidechain: projectDirDepth > 0,
        title: '',
        autoTitle: '',
        firstTs: 0,
        lastTs: 0,
        // Stamped when the parse is finished, from the stat that was actually
        // read — a parser outlives any single stat.
        mtime: 0,
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
    return {
        file,
        info,
        seenUsageKeys: new Set<string>(),
        models: new Set<string>(),
        turnModelSets: [],
        offset: 0,
        tail: Buffer.alloc(0)
    };
}

/**
 * Add the next stretch of the transcript.
 *
 * ‼️ BYTES, NOT A STRING, AND THE CUT IS ON THE BYTE. A resumed read starts at
 * an offset the writer chose, and decoding a range that begins or ends inside
 * a multi-byte character yields replacement characters — a Turkish prompt
 * would arrive corrupted and the JSON around it would not parse. A newline
 * cannot occur inside a UTF-8 sequence, so cutting on it is exact: whole lines
 * are decoded, and whatever follows the last newline is held as bytes until
 * the rest of that line arrives.
 */
export function feedSessionParser(
    p: SessionParser,
    bytes: Buffer,
    pricing: PricingEngine,
    now = Date.now()
): void {
    p.offset += bytes.length;
    if (!bytes.length && !p.tail.length) { return; }
    const all = p.tail.length ? Buffer.concat([p.tail, bytes]) : bytes;
    const cut = all.lastIndexOf(NEWLINE);
    if (cut < 0) {
        // Nothing complete yet — the writer is mid-line. Wait for the rest.
        p.tail = Buffer.from(all);
        return;
    }
    p.tail = Buffer.from(all.subarray(cut + 1));
    const text = all.subarray(0, cut + 1).toString('utf8');

    const info = p.info;
    const file = p.file;
    const seenUsageKeys = p.seenUsageKeys;
    const models = p.models;
    // Per-turn model sets, parallel to info.turns (materialized as arrays when
    // the parse is finished).
    const turnModelSets = p.turnModelSets;
    const openTurn = (text: string, tsIn: number) => {
        info.turns.push({
            n: info.turns.length + 1, label: turnLabel(text), ts: tsIn,
            tokens: 0, wTokens: 0, cost: 0, apiCalls: 0, steps: 0, thinking: 0, ms: 0, endCtx: 0,
            tools: 0, errors: 0, models: [],
            // ‼️ X-124 — whatever mode the transcript had last stated when this
            // turn opened. Read off the running value rather than the finished
            // session's, which is how a later change stops speaking for it.
            ...(info.permissionMode ? { permissionMode: info.permissionMode } : {})
        });
        turnModelSets.push(new Set());
    };
    const curTurn = () => info.turns.length ? info.turns[info.turns.length - 1] : undefined;

    for (const lineText of text.split('\n')) {
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
            // ‼️ X-124 — a mode changed MID-TURN governs the rest of that turn,
            // so the open turn takes it too. Without this the turn would keep
            // reporting the mode it opened under while the transcript below it
            // shows tools running under another.
            const open = curTurn();
            if (open) { open.permissionMode = line.permissionMode; }
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
                        ts, kind: 'prompt', detail: truncate(text, FIRST_PROMPT_MAX), sessionFile: file
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
                // !! S-45 - the SET cannot answer "which one is it on now": it is
                // ordered by first sight, so a model returned to after another
                // is not re-appended. Overwriting on every real line is.
                info.lastModel = msg.model;
                if (turnModelSets.length) { turnModelSets[turnModelSets.length - 1].add(msg.model); }
            }
            // S-45 - and the effort that answer ran at. Guarded on the value
            // rather than assigned blind: a line that says nothing must not
            // erase what the line before it said.
            if (typeof line.effort === 'string' && line.effort.trim()) {
                info.effort = line.effort.trim();
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

    // A live session is fed for hours; only the tail of either list survives
    // finishing, so the rest is dropped here rather than carried all day.
    if (info.events.length > EVENT_SLACK) {
        info.events = info.events.slice(-MAX_EVENTS_PER_FILE);
    }
    if (info.recentMsgs.length > RECENT_MSG_SLACK) {
        info.recentMsgs = info.recentMsgs.filter(m => now - m.ts < RECENT_MSG_WINDOW_MS);
    }
}

/**
 * The answer, derived from the running total and detached from it.
 *
 * ‼️ IT MUST NOT CONSUME THE PARSER. The same session is finished again every
 * time its transcript grows, so anything done to the accumulator would
 * compound: a default title written once would outrank the real summary line
 * that arrives a minute later, and a truncated event list would truncate
 * again. This reads, copies, and leaves the accumulator as it found it — which
 * is also why the caller may keep what it returns.
 */
export function finishSessionParse(
    p: SessionParser,
    mtimeMs: number,
    now = Date.now()
): SessionInfo {
    const acc = p.info;
    const title = acc.title || (acc.isSidechain ? 'Subagent task' : '(untitled session)');
    const daily: Record<string, DailyBucket> = {};
    for (const [day, b] of Object.entries(acc.daily)) {
        daily[day] = {
            cost: b.cost, usage: { ...b.usage }, wTokens: b.wTokens, assistantMsgs: b.assistantMsgs
        };
    }
    return {
        ...acc,
        mtime: mtimeMs,
        title,
        autoTitle: title,
        usage: { ...acc.usage },
        tools: { ...acc.tools },
        skillCalls: { ...acc.skillCalls },
        memoryReads: { ...acc.memoryReads },
        filesEdited: { ...acc.filesEdited },
        daily,
        heat: acc.heat.slice(),
        events: acc.events.length > MAX_EVENTS_PER_FILE
            ? acc.events.slice(-MAX_EVENTS_PER_FILE)
            : acc.events.slice(),
        // The window is 48 hours from NOW, not from whenever these lines
        // happened to be read: a session fed across three days would otherwise
        // keep the first day's messages in a list that promises the last two.
        recentMsgs: acc.recentMsgs.filter(m => now - m.ts < RECENT_MSG_WINDOW_MS),
        models: [...p.models],
        turns: acc.turns.map((t, i) => ({ ...t, models: [...(p.turnModelSets[i] ?? [])] }))
    };
}

/** One-shot parse of a whole transcript: the resumable parser, fed once. */
export function parseSessionFile(
    file: string,
    pricing: PricingEngine,
    projectDirDepth: number
): SessionInfo | undefined {
    let bytes: Buffer;
    let st: fs.Stats;
    try {
        bytes = fs.readFileSync(file);
        st = fs.statSync(file);
    } catch { return undefined; }
    const now = Date.now();
    const p = createSessionParser(file, projectDirDepth);
    feedSessionParser(p, bytes, pricing, now);
    return finishSessionParse(p, st.mtimeMs, now);
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
    private launchers = new Map<string, SessionLauncher>();
    /** ‼️ S-31 — the runs Agent Farm started, written at the spawn. */
    private bindings: LaunchBinding[] = [];
    /** ‼️ X-102 — sessionId → launchId for the runs no binding covers: the
     *  terminals and Console cards a person opens by hand. See `setSpawnIds`. */
    private spawnIds = new Map<string, string>();
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
    /** Resumable parses for sessions still being written — see refreshFile. */
    private parsers = new Map<string, SessionParser>();
    /** Counts scans so a superseded one can stand down — see scanAll. */
    private scanGen = 0;
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
        private activeThresholdMs: () => number,
        /**
         * Where finished parses are remembered. Optional on purpose: tests and
         * one-off tools construct an index without a home to write to, and an
         * index with no store is simply the old behaviour — correct, just slow.
         */
        private readonly store?: SessionStore,
        /**
         * Everything that would make a remembered parse WRONG rather than
         * merely old — prices, quota weights, the parser itself. When this
         * string changes the whole store is discarded and the transcripts are
         * read again, because a cached cost computed at last week's rates is
         * not a stale figure, it is a false one.
         */
        private readonly indexSignature: () => string = () => String(SESSION_PARSER_VERSION)
    ) {}

    get projectsDir(): string {
        return path.join(this.claudeDir, 'projects');
    }

    private allDirs(): ClaudeDirRef[] {
        return [{ dir: this.claudeDir }, ...this.extraDirs().filter(d => d?.dir)];
    }

    /**
     * Rebuild the index.
     *
     * ‼️ THREE RULES, AND THEY ARE WHY THIS IS NOT A LOOP OVER readFileSync.
     *
     * 1. NOTHING IS PARSED TWICE. A transcript whose size AND mtime match what
     *    the store remembers is not opened at all — that parse was already
     *    written down. Only what genuinely changed since the last window costs
     *    anything, which is the whole difference between a start that grows
     *    with the corpus and one that grows with the day's work.
     * 2. THE EVENT LOOP IS NEVER HELD. Every read is async and the walk stops
     *    to breathe on a clock, so even a first-ever scan of a huge corpus
     *    leaves this window — and every other extension sharing this host —
     *    answering clicks the whole way through.
     * 3. THE OLD INDEX STAYS UP UNTIL THE NEW ONE IS WHOLE. It is built into a
     *    separate map and swapped in at the end. The previous version cleared
     *    the map first and refilled it synchronously; done asynchronously that
     *    would show an EMPTY farm for the length of the scan, which is worse
     *    than showing a slightly old one.
     */
    async scanAll(): Promise<void> {
        const gen = ++this.scanGen;
        const next = new Map<string, SessionInfo>();
        const remembered: StoredSession[] = [];
        const missing: string[] = [];
        const signature = this.indexSignature();
        const cached = this.store
            ? await this.store.load(signature)
            : new Map<string, StoredSession>();
        const now = Date.now();
        let breath = Date.now();

        for (const ref of this.allDirs()) {
            const projectsDir = path.join(ref.dir, 'projects');
            if (!fs.existsSync(projectsDir)) {
                if (ref.name) { missing.push(ref.dir); }
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
                let st: fs.Stats;
                try { st = await fs.promises.stat(file); } catch { continue; }
                const hit = cached.get(file);
                const info = hit && hit.size === st.size && hit.mtimeMs === st.mtimeMs
                    ? hit.info
                    : await this.readWhole(file, depth, st, now);
                if (info) {
                    remembered.push({ file, size: st.size, mtimeMs: st.mtimeMs, info });
                    this.admit(info, file, depth, ref.name, next);
                }
                if (Date.now() - breath >= SCAN_BREATH_MS) {
                    await breathe();
                    breath = Date.now();
                    // A newer scan started while this one was breathing — the
                    // user re-priced, or added a directory. Its answer is the
                    // current one; finishing this would overwrite it with
                    // older facts.
                    if (this.scanGen !== gen) { return; }
                }
            }
        }
        if (this.scanGen !== gen) { return; }
        this.sessions = next;
        this.missingDirs = missing;
        this.onDidUpdateEmitter.fire();
        // Fire-and-forget: the index is already live, and a failed write costs
        // one slow start, never a wrong figure.
        if (this.store) { void this.store.save(remembered, signature); }
    }

    /**
     * Read a transcript from the beginning, and keep the parser if this is a
     * session likely to say more.
     *
     * ‼️ RETAINED ONLY FOR THE RECENTLY ACTIVE. Parser state is what makes the
     * next append cost a few hundred bytes instead of the whole file, and it
     * is small — but a first-ever scan touches every session that has ever
     * run, and holding state for all of them would trade a start-up problem
     * for a memory one. A transcript untouched for an hour is history: it is
     * finished, it is in the store, and it will not be fed again.
     */
    private async readWhole(
        file: string,
        depth: number,
        st: fs.Stats,
        now: number
    ): Promise<SessionInfo | undefined> {
        const p = createSessionParser(file, depth);
        if (st.size <= FEED_CHUNK_BYTES) {
            let bytes: Buffer;
            try { bytes = await fs.promises.readFile(file); } catch { return undefined; }
            feedSessionParser(p, bytes, this.pricing, now);
        } else {
            // ‼️ A BIG TRANSCRIPT IS FED IN PIECES, AND THAT IS NOT AN
            // OPTIMISATION. Parsing is synchronous once the bytes are in hand,
            // so handing 37 MB to it in one call holds the host for ~190 ms no
            // matter how asynchronously the bytes were fetched. Chunking bounds
            // the longest single freeze to one chunk's worth of work, which is
            // the only figure the user can actually feel.
            for (let at = 0; at < st.size; at += FEED_CHUNK_BYTES) {
                const chunk = await readRange(file, at, Math.min(at + FEED_CHUNK_BYTES, st.size));
                if (chunk === undefined) { return undefined; }
                feedSessionParser(p, chunk, this.pricing, now);
                if (!chunk.length) { break; }
                await breathe();
            }
        }
        if (now - st.mtimeMs < PARSER_RETAIN_MS) { this.rememberParser(file, p); }
        return finishSessionParse(p, st.mtimeMs, now);
    }

    /**
     * Take in one parsed session: name it, attribute it, and decide whether it
     * is ours to show.
     *
     * Everything indexing a session does EXCEPT reading it — which is the
     * point, because a session recovered from the store has to go through all
     * of this too. Titles, marks, agents and launch bindings are current
     * state, not transcript facts: they change while the file on disk does
     * not, so they are re-applied on every pass and never remembered.
     */
    private admit(
        info: SessionInfo,
        file: string,
        depth: number,
        machine: string | undefined,
        target: Map<string, SessionInfo>
    ): void {
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
        this.applySpawnId(info);
        if (!info.agentId && !this.includeUnmatched()) {
            // Keep it out of the index — but REMEMBER the little it takes to
            // test it again. A binding published after this scan (a task that
            // starts in a minute, the one-time backfill, a window that opened
            // before the store loaded) has to be able to rescue the file
            // without a full re-walk of every projects folder on the machine.
            this.rememberDropped(file, info, depth, machine);
            target.delete(file);
            return;
        }
        this.dropped.delete(file);
        for (const ev of info.events) {
            ev.agentId = info.agentId;
            ev.agentName = info.agentName;
        }
        target.set(file, info);
    }

    /**
     * Re-read one transcript that just changed — from where we left off.
     *
     * ‼️ THIS IS THE HOT PATH, AND IT IS WHY THE PARSER IS RESUMABLE. A live
     * session appends a few hundred bytes and this runs; the previous version
     * answered by reading the whole file again, which on a 37 MB transcript
     * cost 257 ms of frozen extension host, several times a second, once per
     * active agent. Feeding only the new bytes costs about a millisecond and
     * does not care how long the session has been running.
     */
    private async refreshFile(file: string, depth: number, machine?: string): Promise<void> {
        let st: fs.Stats;
        try {
            st = await fs.promises.stat(file);
        } catch {
            this.sessions.delete(file);
            this.parsers.delete(file);
            this.onDidUpdateEmitter.fire();
            return;
        }
        const now = Date.now();
        const p = this.parsers.get(file);
        // A file that got SMALLER is not the file we have an offset into — a
        // rewrite, a rotation, a truncated write. Resuming there would splice
        // new bytes onto a total that describes text no longer present, so the
        // only honest answer is to read it again from zero.
        if (!p || st.size < p.offset) {
            const fresh = await this.readWhole(file, depth, st, now);
            if (fresh) { this.admit(fresh, file, depth, machine, this.sessions); }
            this.onDidUpdateEmitter.fire();
            return;
        }
        if (st.size > p.offset) {
            const chunk = await readRange(file, p.offset, st.size);
            if (chunk === undefined) { return; }
            feedSessionParser(p, chunk, this.pricing, now);
        }
        this.rememberParser(file, p);
        this.admit(finishSessionParse(p, st.mtimeMs, now), file, depth, machine, this.sessions);
        this.onDidUpdateEmitter.fire();
    }

    /**
     * Index one transcript on the calling thread.
     *
     * ‼️ THE ONE PLACE THAT STILL READS SYNCHRONOUSLY, AND DELIBERATELY.
     * `setLaunchBindings` is synchronous and its callers read the index on the
     * very next line — made async, a run that has just started would report no
     * transcript until some later tick, which is the exact bug the rescue
     * exists to prevent. What it costs is bounded by how many dropped files a
     * NEW binding just claimed (normally one, and a run that has just started
     * has written almost nothing yet), never by the size of the corpus.
     */
    private indexFileSync(file: string, depth: number, machine?: string): void {
        const info = parseSessionFile(file, this.pricing, depth);
        if (!info) { this.sessions.delete(file); return; }
        this.admit(info, file, depth, machine, this.sessions);
    }

    /** Most-recently-fed wins: a Map keeps insertion order, so re-setting a key
     *  moves it to the end and the first key is always the coldest. */
    private rememberParser(file: string, p: SessionParser): void {
        this.parsers.delete(file);
        this.parsers.set(file, p);
        while (this.parsers.size > MAX_LIVE_PARSERS) {
            const coldest = this.parsers.keys().next();
            if (coldest.done) { break; }
            this.parsers.delete(coldest.value);
        }
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
        info.color = mark?.color || undefined;
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
        this.nameFromLauncher(info);
    }

    /**
     * ‼️ S-36 — THE LAST RESORT FOR A SESSION WHOSE PROMPT IS ALL TEMPLATE.
     *
     * `conversationTitle` already lifts the real goal out of a generated prompt
     * whose subject it can find. When it cannot — a wrapper whose section is
     * empty, or a template that changed shape — the row would fall back to the
     * boilerplate's own first line, which is identical across every run of that
     * template. The launcher Agent Farm recorded is a name a person chose, so
     * it beats the boilerplate; it is used ONLY in that case, and never over a
     * title derived from something somebody actually said.
     */
    private nameFromLauncher(info: SessionInfo): void {
        const label = info.launchedBy?.label?.trim();
        if (!label) { return; }
        if (!isGeneratedPrompt(info.firstPrompt ?? '') && !isGeneratedPrompt(info.autoTitle)) { return; }
        if (wrapperGoal(info.firstPrompt ?? '')) { return; }
        const named = truncate(label, 80);
        if (info.title === info.autoTitle) { info.title = named; }
        info.autoTitle = named;
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
                this.indexFileSync(memo.file, memo.depth, memo.machine);
                rescued++;
            }
        }
        // …and the sessions already indexed learn who started them, which is
        // what puts the schedule's name on the Origin column.
        for (const info of this.sessions.values()) { this.applyLaunchBinding(info); this.applySpawnId(info); }
        for (const info of this.externalList) { this.applyLaunchBinding(info); this.applySpawnId(info); }
        void rescued;
        this.onDidUpdateEmitter.fire();
    }

    /**
     * ‼️ X-102 — WHICH SPAWN PRODUCED WHICH SESSION, FOR THE RUNS NO BINDING
     * COVERS — which is most of them.
     *
     * A `LaunchBinding` is built from a TASK, so it exists for automation and
     * for nothing else. A person opening a terminal or a Console card writes a
     * manifest exactly the same way (v11.183 / v11.184), and until this channel
     * that manifest had nothing to be joined to: the setup was on file and
     * permanently unattachable to the conversation it produced.
     *
     * ‼️ AND IT IS A SECOND CHANNEL RATHER THAN A SIXTH `LaunchBinding.kind`,
     * deliberately. A binding does not only say which spawn — it supplies the
     * OWNER and the LAUNCHER, and `sessionOrigin` reads the launcher to decide
     * 🧑 you against 🤖 automation. Filing a terminal a person opened by hand as
     * a binding would stamp it with a launcher and move it into the automation
     * lane on every surface that filters by origin. This writes ONE field and
     * touches nothing else, which is the only reason it is safe to feed it from
     * the doors a human uses.
     *
     * Ids only, so the caller has already done the joining it is entitled to do:
     * a terminal learns its session id from the live monitor, a card is handed
     * one by the panel it owns. Nothing here deduces anything.
     */
    setSpawnIds(pairs: readonly { sessionId: string; launchId: string }[]): void {
        const next = new Map<string, string>();
        for (const p of pairs ?? []) {
            const sid = String(p?.sessionId ?? '').trim();
            const lid = String(p?.launchId ?? '').trim();
            // ‼️ FIRST WINS, and it is never overwritten. A session belongs to
            // the spawn that produced it; a later record naming the same session
            // is a bookkeeping slip, and taking the newer one would let one slip
            // rewrite history that was correct.
            if (sid && lid && !next.has(sid)) { next.set(sid, lid); }
        }
        const sig = (m: Map<string, string>): string =>
            [...m].map(([k, v]) => `${k}:${v}`).sort().join('|');
        if (sig(next) === sig(this.spawnIds)) { return; }
        this.spawnIds = next;
        for (const info of this.sessions.values()) { this.applySpawnId(info); }
        for (const info of this.externalList) { this.applySpawnId(info); }
        this.onDidUpdateEmitter.fire();
    }

    /** The one field, filled where the session carries none — the same rule
     *  `applyBinding` follows, so a binding and this channel cannot disagree
     *  about a session both of them know. */
    private applySpawnId(info: SessionInfo): void {
        if (info.launchId) { return; }
        const hit = this.spawnIds.get(info.sessionId);
        if (hit) { info.launchId = hit; }
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
    setLaunchers(map: Record<string, SessionLauncher>): void {
        const next = new Map(Object.entries(map ?? {}).filter(([id, v]) => !!id && !!v));
        const same = next.size === this.launchers.size
            && [...next].every(([id, v]) => {
                const had = this.launchers.get(id);
                // ‼️ X-95 — the mission stamp is part of "the same launcher".
                // Left out, a run that only learned its mission id (the planner
                // session is stamped a beat after the task's) compared equal and
                // the index never re-marked: the stamp arrived and no surface
                // was told.
                return had && had.kind === v.kind && had.label === v.label && had.mode === v.mode
                    && had.missionId === v.missionId && had.missionTitle === v.missionTitle;
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
        // ‼️ …AND THE EXTERNAL LIST, which this was the only setter to forget
        // (S-37). Every sibling — setMarks, setLaunchers, setExternal — re-marks
        // both halves. Missing it here meant a Codex or Antigravity session the
        // Console had just taken over kept `consoleHosted: undefined` until the
        // next external rescan happened to re-apply the marks, and until then it
        // was filed as automation on every surface that asks sessionOrigin.
        for (const s of this.externalList) { this.applyMark(s); }
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
            this.applySpawnId(info);
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
                        // Resumes from the last offset; readFile only if it
                        // cannot — see refreshFile. Fire-and-forget because a
                        // watcher callback must not wait on disk.
                        void this.refreshFile(full, Math.max(0, depth), ref.name);
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
    /** X-44 — import copies of runs already indexed: findable, never counted. */
    private externalAliases: SessionInfo[] = [];
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
        for (const s of sessions) { this.applyLaunchBinding(s); this.applySpawnId(s); }
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
        const { canonical, aliases } = this.linkImports(kept);
        this.externalList = canonical;
        this.externalAliases = aliases;
        // ‼️ The title BEFORE the marks, and both on every rescan (X-35). A
        // source re-parses its transcript whenever the file changes and hands
        // back a freshly derived title, so a rename applied once would be
        // silently undone the next time the user said anything in that session —
        // the same rename bug as `setTitleOverrides`, one scan later.
        for (const s of [...this.externalList, ...this.externalAliases]) {
            this.applyTitle(s); this.applyMark(s);
        }
        this.onDidUpdateEmitter.fire();
    }

    /**
     * ‼️ X-44 — ONE RUN, ONE ROW; THE COPY KEPT BUT NOT COUNTED.
     *
     * An imported rollout whose source transcript this index already holds is
     * the SAME work seen twice. Left in the list it doubled the Codex session
     * count, split one mission's cost between a real figure and a $0 one, and
     * put two groups with the same title in Search — which is precisely the
     * "duplicate" the user reported (U-63).
     *
     * So the alias is moved aside rather than deleted: `byId`/`byFile` still
     * find it, so resuming the Codex thread and opening the imported copy both
     * still work, and the canonical row learns that a copy exists. What it is
     * NOT allowed to do is appear in a pool anything counts.
     *
     * ‼️ AND THE DISPLAY FACTS ARE INHERITED, not recomputed from the copy. The
     * import carries the moment it was WRITTEN (13 ms, $0, "user"); the run
     * carries when it happened, what it cost and who launched it. A reader who
     * opens the alias must see the run's own facts or the row is a third lie.
     */
    private linkImports(list: SessionInfo[]): { canonical: SessionInfo[]; aliases: SessionInfo[] } {
        const canonical: SessionInfo[] = [];
        const aliases: SessionInfo[] = [];
        // ‼️ Resolved against THIS scan and the claude pool only — never against
        // the previous external list, or an alias could be re-linked to a row
        // that no longer exists and carry a dead session's figures for ever.
        const byId = new Map<string, SessionInfo>();
        for (const s of list) { if (!byId.has(s.sessionId)) { byId.set(s.sessionId, s); } }
        const findCanonical = (id: string): SessionInfo | undefined => {
            for (const s of this.sessions.values()) { if (s.sessionId === id) { return s; } }
            return byId.get(id);
        };
        for (const s of list) {
            const target = s.provenance === 'imported' && s.canonicalSessionId
                && s.canonicalSessionId !== s.sessionId
                ? findCanonical(s.canonicalSessionId) : undefined;
            if (!target || target === s) {
                delete s.aliasOf;
                canonical.push(s);
                continue;
            }
            s.aliasOf = target.sessionId;
            // The run's facts, onto the record of the copy.
            s.firstTs = target.firstTs;
            s.lastTs = target.lastTs;
            s.usage = target.usage;
            s.cost = target.cost;
            s.wTokens = target.wTokens;
            s.models = target.models;
            s.entrypoint = target.entrypoint;
            s.consoleHosted = target.consoleHosted;
            if (target.launchedBy) { s.launchedBy = target.launchedBy; }
            if (target.projectId) { s.projectId = target.projectId; }
            // ‼️ THE OWNER IS MIRRORED WHOLE, INCLUDING ITS ABSENCE (S-37). It
            // used to be copied only when the run had one, which left the copy
            // claiming an agent the run does not have — and now that "is this
            // inside the fleet" is one of the inputs `sessionOrigin` reads, that
            // half-copy made the alias and the run disagree about who started
            // the same work. The alias is held out of every counted pool, so it
            // owns no attribution of its own to protect.
            s.agentId = target.agentId;
            s.agentName = target.agentName;
            target.importAliases = [...new Set([...(target.importAliases ?? []), s.sessionId])];
            aliases.push(s);
        }
        return { canonical, aliases };
    }

    external(): SessionInfo[] {
        return this.externalList;
    }

    /** X-44 — the import copies held aside by `linkImports`: reachable, uncounted. */
    externalImportAliases(): SessionInfo[] {
        return this.externalAliases;
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
        // Aliases last, and deliberately still here (X-44): the import copy has
        // its own file on disk and opening it must keep working.
        return this.sessions.get(f)
            ?? this.externalList.find(s => s.file === f)
            ?? this.externalAliases.find(s => s.file === f);
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
        return this.externalList.find(s => s.sessionId === id)
            ?? this.externalAliases.find(s => s.sessionId === id);
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
