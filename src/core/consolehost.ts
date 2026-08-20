/**
 * Session host — Agent Farm keeps the conversation, not just the terminal.
 *
 * One long-lived `claude` process per Console session, spoken to over the
 * streaming JSON channel (consoleproto.ts). The user's own CLI and their own
 * subscription: no API key of ours, no separate cost model, and the transcript
 * still lands in `~/.claude/projects`, so every analytic, health and timeline
 * engine keeps working exactly as before.
 *
 * What this class owns: spawning, the stdout line reader, the message queue,
 * interrupts, live permission-mode changes, and a clean death. What it
 * deliberately does NOT own: rendering (the panel), the flag vocabulary
 * (launch.ts) or the protocol (consoleproto.ts).
 */

import * as cp from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { StringDecoder } from 'string_decoder';
import { AgyState, newAgyState, translateAgy } from './agyproto';
import { CodexState, codexTotalsFromUsage, newCodexState, translateCodex } from './codexproto';
import { GeminiState, newGeminiState, translateGemini } from './geminiproto';
import {
    EngineId, EngineTransport, engineContextPrefix, engineOf, enginePromptText, turnArgs
} from './consoleEngine';
import { OpencodeConfigOption, opencodeModelsFrom, opencodePermissionFor } from './opencode';
import {
    AcpChild, OpencodePermissionRequest, OpencodeRuntime, OpencodeRuntimeIo,
    opencodePromptBlocks, opencodeRuntimeArgs
} from './opencodeacp';
import {
    OpencodeState, newOpencodeState, opencodeReplay, opencodeTurnStarted,
    translateOpencodeResult, translateOpencodeUpdate
} from './opencodeproto';
import {
    acceptUserText, answerAsk, AskDecision, Attachment, AttachmentNote, ATTACH_LIMITS,
    CarriedTotals, ConsoleMessage, ConsoleSessionState, controlLine, drainAutoAnswer, editQueued,
    hostArgs, IMAGE_MEDIA_TYPES, newSessionState, reduceEvent, shiftQueued, takeQueued,
    userMessageLine
} from './consoleproto';
import {
    BYPASS, EffectivePermission, permissionLayerPaths, resolveEffectivePermission
} from './permissionmode';

/**
 * What a path IS, as far as attaching goes.
 *
 * ‼️ THE CARRIER IS DECIDED HERE AND NOWHERE ELSE — not in the composer, not
 * by the caller. Panel, bridge and any future entry point all come through
 * this function, so a `.png` behaves identically however it was attached.
 * An image can ride inside the message; anything else — including a folder —
 * travels as a path for the agent's own `Read` (see Attachment).
 */
/**
 * Is this dropped string a URI, or a plain path?
 *
 * ‼️ THE TEST NEEDS TWO CHARACTERS BEFORE THE COLON. A drag can carry
 * `file:///d:/a/b.png` or bare `D:\a\b.png`, and the naive scheme test reads
 * the second as a URI in the scheme "d" — `Uri.parse` does not refuse it, it
 * quietly hands back a path that never existed, and the attachment vanishes
 * with no error anywhere. Kept here rather than in the panel so the rule is
 * testable without vscode.
 */
export function looksLikeUri(s: string): boolean {
    return /^[a-z][a-z0-9+.-]+:/i.test(String(s ?? '').trim());
}

/**
 * The conversation a per-turn engine would resume — whatever that engine calls
 * it.
 *
 * ‼️ ONE QUESTION, ONE ANSWER. Codex calls it a `thread_id` and Antigravity a
 * `conversation_id`, and they arrive on different events; every caller that
 * needs "which conversation is this" asks here instead of reaching into the
 * translator's own state and getting it right for one engine only.
 */
function threadOf(h: { codex?: CodexState; agy?: AgyState; gemini?: GeminiState }): string | undefined {
    return h.agy?.conversationId ?? h.gemini?.sessionId ?? h.codex?.threadId;
}

/** A real UUID, because `--session-id` on Gemini is validated as one — a short
 *  base-36 id like the rest of this file's would be refused. */
const newUuid = (): string => crypto.randomUUID();

/**
 * The staged copy of a dropped/pasted file keeps the name the user knows.
 *
 * ‼️ `\w` IS ASCII. The rule that produced these names replaced every letter
 * outside it, so "deneme dosyası.txt" was staged as "deneme dosyas_.txt" — the
 * one string the user has to recognise their own file by, quietly mangled.
 * Only what a Windows filename genuinely cannot hold is replaced.
 */
export function safeAttachmentName(name: string, mediaType = ''): string {
    const clean = (s: string) => String(s ?? '')
        // eslint-disable-next-line no-control-regex
        .replace(/[\\/:*?"<>|\x00-\x1f]+/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        // Windows silently drops a trailing dot or space, and a name that
        // cannot be opened by what it is called is worse than a renamed one.
        .replace(/[. ]+$/, '');

    const raw = clean(name);
    // ‼️ THE EXTENSION IS NOT DECORATION — IT DECIDES HOW THE FILE TRAVELS.
    // `describeAttachment` reads the suffix to tell an image (which is embedded,
    // so the model can SEE it) from everything else (handed over as a path). So
    // the two ways a suffix can go missing are both handled here rather than
    // left to produce a screenshot the model is merely TOLD about:
    //   · a pasted screenshot often arrives with no name at all, and the
    //     clipboard's media type is the only thing that knows what it is;
    //   · a very long name must be shortened from the MIDDLE, because a plain
    //     slice() cuts the suffix off the end.
    const dot = raw.lastIndexOf('.');
    let stem = dot > 0 ? raw.slice(0, dot) : raw;
    let ext = dot > 0 ? raw.slice(dot) : '';
    if (!ext) {
        const known = Object.entries(IMAGE_MEDIA_TYPES)
            .find(([, m]) => m === String(mediaType ?? '').toLowerCase());
        if (known) { ext = known[0]; }
    }
    if (!stem) { stem = 'attachment'; }
    const room = 120 - ext.length;
    if (room > 0 && stem.length > room) { stem = stem.slice(0, room); }
    return `${stem}${ext}`.replace(/[. ]+$/, '') || 'attachment';
}

export function describeAttachment(fsPath: string): Attachment | null {
    let stat: fs.Stats;
    try { stat = fs.statSync(fsPath); } catch { return null; }
    const name = path.basename(fsPath);
    if (stat.isDirectory()) { return { path: fsPath, name, bytes: 0, kind: 'path' }; }
    const mediaType = IMAGE_MEDIA_TYPES[path.extname(fsPath).toLowerCase()];
    return mediaType
        ? { path: fsPath, name, bytes: stat.size, kind: 'image', mediaType }
        : { path: fsPath, name, bytes: stat.size, kind: 'path' };
}

/** Bytes as the refusal message should say them — "4.7 MB", not "4928307". */
function mb(bytes: number): string {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Kill a spawned process AND everything under it.
 *
 * On Windows a `shell: true` spawn gives us `cmd.exe`; `child.kill()` ends the
 * shell and leaves `claude.exe` running forever. `taskkill /T` is what the
 * task and mission runners already use for the same reason.
 *
 * ‼️ ON WINDOWS THE PLAIN KILL IS A FALLBACK, NEVER A COMPANION — the order is
 * the whole thing. `child.kill()` returns having already terminated the shell,
 * while `taskkill` is a process that has not been spawned yet; and
 * `taskkill /PID p /T` RESOLVES p FIRST, so a p that died a millisecond ago is
 * "process not found" and its descendants are never touched. Killing the
 * wrapper first therefore ORPHANS the real `claude`, which keeps writing into
 * the pipe this window still holds: an End session that ends nothing and an
 * agent that goes on talking. So the tree kill goes first and alone, and the
 * direct kill only runs if taskkill could not be started or came back angry.
 */
export function killTree(child: cp.ChildProcess): void {
    const pid = child.pid;
    if (!pid) { return; }
    const plain = () => { try { child.kill(); } catch { /* already gone */ } };
    if (process.platform !== 'win32') { plain(); return; }
    try {
        cp.execFile('taskkill', ['/PID', String(pid), '/T', '/F'],
            { windowsHide: true }, err => { if (err) { plain(); } });
    } catch { plain(); }
}

/** Stop one process and everything under it, by pid. Best effort, never throws:
 *  a process that is already gone is the outcome we wanted. */
export function killPid(pid: number): void {
    if (!pid || pid < 1) { return; }
    try {
        if (process.platform === 'win32') {
            cp.execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => { });
        } else {
            process.kill(pid, 'SIGTERM');
        }
    } catch { /* already gone is fine */ }
}

/**
 * How many times one turn is re-attempted when the engine says the previous
 * turn's writer is still holding the thread — and only then. Three is measured
 * generosity: the hold has always cleared on the first retry here, and a fourth
 * attempt would be a loop rather than a wait.
 */
export const RESUME_RETRIES = 3;
/** The first backoff; it lengthens with each attempt. */
export const RESUME_RETRY_MS = 300;

/**
 * ‼️ K-25 — HOW LONG A COOPERATIVE CANCEL IS GIVEN BEFORE THE BLUNT ONE.
 *
 * `session/cancel` was MEASURED to work: the running prompt settled with
 * `stopReason: "cancelled"`, a zero usage, the conversation intact and the next
 * turn accepted on the same `ses_…`. That is the outcome Stop should have, and
 * it is the only one that leaves the session usable — so it is asked for first
 * and given a real chance.
 *
 * The fallback is deliberately violent and deliberately last: restarting the
 * SHARED process ends every other card's turn as well. Eight seconds is the
 * measured cancel (well under a second here) with an order of magnitude of
 * room, so the blunt path is reached only when the engine has genuinely stopped
 * listening — never because a slow machine was slow.
 */
export const OPENCODE_CANCEL_GRACE_MS = 8000;

/**
 * The real `opencode acp` process, wrapped in the handle the runtime wants.
 *
 * ‼️ IT LIVES HERE AND NOT IN `opencodeacp.ts` ON PURPOSE. That file is pure over
 * an injected spawner so the whole lifecycle — handshake, turn, cancel, crash,
 * reload — is testable without a binary; the moment it imports `child_process`
 * that stops being true. This is the one adaptor, and it is three lines of
 * plumbing plus the two facts that are genuinely this engine's:
 *
 *   · `shell: true`, because `opencode` is an npm `.cmd` shim on Windows — and
 *     it is SAFE here for a reason worth stating: nothing user-typed reaches the
 *     command line, the prompt travels inside a JSON-RPC frame on stdin.
 *   · `killTree`, because with a shell the child we hold is `cmd.exe` and a plain
 *     kill would orphan the real process — 383 MB of it, holding every card's
 *     conversation open.
 */
export function nodeOpencodeIo(
    exe: () => string = () => 'opencode',
    args: () => string[] = opencodeRuntimeArgs
): OpencodeRuntimeIo {
    return {
        spawn(cwd: string): AcpChild {
            const child = cp.spawn(exe(), args(), {
                cwd: cwd || undefined, shell: true, windowsHide: true,
                stdio: ['pipe', 'pipe', 'pipe']
            });
            return {
                pid: child.pid,
                write: (text: string) => {
                    try { return child.stdin?.write(text) ?? false; } catch { return false; }
                },
                kill: () => killTree(child),
                onStdout: fn => { child.stdout?.on('data', fn); },
                onStderr: fn => { child.stderr?.on('data', fn); },
                onExit: fn => {
                    // ‼️ `close`, NOT `exit` — and both spellings of failure land
                    // on it. A binary that is not installed never starts at all
                    // and only emits `error`; read as anything other than "the
                    // runtime is gone", that leaves every card waiting on a
                    // handshake that will never come.
                    child.on('close', code => fn(code));
                    child.on('error', () => fn(null));
                }
            };
        },
        readTextFile: (p: string) => fs.readFileSync(p, 'utf8'),
        writeTextFile: (p: string, content: string) => {
            fs.mkdirSync(path.dirname(p), { recursive: true });
            fs.writeFileSync(p, content, 'utf8');
        }
    };
}

export interface HostedSessionInit {
    agentId: string;
    agentName: string;
    cwd: string;
    /**
     * Which engine this session talks to. Absent means `claude`, which is what
     * every caller written before engines existed means — and what the whole
     * persistent-process path below is built around (see `Hosted.engine`).
     */
    engine?: EngineId;
    model?: string;
    effort?: string;
    permissionMode?: string;
    /** resume an existing claude session instead of starting a new one */
    resume?: string;
    /** the window's active project — recorded on the session so the stamp can be
     *  written once the CLI reports its id (see ConsoleSessionState.projectId) */
    projectId?: string;
    /** the conversation this session already had, read off its transcript —
     *  display only (consolehistory.ts), never sent anywhere */
    history?: ConsoleMessage[];
    /** and what it already SPENT, so "this session" is the session and not this
     *  window's turn at it (see CarriedTotals) — resume only */
    carried?: CarriedTotals;
    /** first message, sent as soon as the process is up */
    firstPrompt?: string;
    /** files hung on that first message — a new session can start with a screenshot */
    firstAttachments?: Attachment[];
}

/**
 * One hosted card's half of the shared ACP connection.
 *
 * ‼️ THERE IS NO `child` HERE AND THAT IS NOT AN OMISSION. A Codex session has a
 * process while it answers; an OpenCode session never has one of its own at all.
 * Everything that would have been "is the process still up" is answered by
 * `running` — whether THIS conversation has a `session/prompt` outstanding —
 * because the process being up says nothing about this card.
 */
interface OpencodeCard {
    /** the translator's own state (opencodeproto.ts) */
    proto: OpencodeState;
    /** what the engine said this session's config options are — model list
     *  included, which is why nothing spawns `opencode models` */
    options: OpencodeConfigOption[];
    /** a `session/prompt` is outstanding for THIS conversation */
    running?: boolean;
    /**
     * ‼️ A PICKER CHANGE WAITING FOR THE TURN TO END. The protocol offers no way
     * to change the model of a turn that is already running, and applying one
     * mid-turn is the kind of thing that either fails silently or changes the
     * answer half way through. So it is held, said out loud, and applied at the
     * boundary — which is a genuinely different promise from Codex's "the next
     * turn's flags", because here it really does reach a live connection.
     */
    pending?: { model?: string; mode?: string };
    /** the permission request the agent is blocked on, as the runtime named it */
    ask?: { requestId: string; options: { optionId: string; name: string; kind: string }[] };
    /** a cooperative cancel is in flight — see OPENCODE_CANCEL_GRACE_MS */
    cancelTimer?: ReturnType<typeof setTimeout>;
}

interface Hosted {
    state: ConsoleSessionState;
    /**
     * The process this session is talking to.
     *
     * ‼️ OPTIONAL, AND THAT IS THE WHOLE SHAPE OF THE SECOND ENGINE. A Claude
     * session has one process for its lifetime. A Codex session has one per
     * TURN — between turns there is no process at all, and the conversation
     * lives in the CLI's own thread, resumed by id (see consoleEngine.ts). A
     * host that assumed a process was always there would read "no child" as
     * "dead session" and end a perfectly live conversation after its first turn.
     */
    child?: cp.ChildProcess;
    /** What kind of machine this is — persistent or one process per turn. */
    engine: EngineTransport;
    /** The per-turn engine's translation state: its thread id, which turn it is
     *  on, and the tool calls still open (see codexproto.ts). */
    codex?: CodexState;
    /**
     * …and Antigravity's, which is a DIFFERENT state because it is a different
     * protocol (agyproto.ts): its own conversation id, its own step counter, and
     * the reply text it is still accumulating from deltas.
     *
     * ‼️ Two fields rather than one union on purpose. A session talks to exactly
     * one engine for its whole life, so only one of them is ever set, and the
     * translator that reads it is chosen by the same `engine` that created it —
     * `threadOf` is the one place that asks "whichever of these exists".
     */
    agy?: AgyState;
    /**
     * …and Gemini's, which is a THIRD state for a third protocol
     * (geminiproto.ts): its own session id, its turn counter and the reply it is
     * still accumulating from `message` deltas.
     *
     * ‼️ IT DOES NOT CARRY A RUNNING TOTAL, AND THAT IS THE MEASUREMENT.
     * `CodexState.spent` exists because Codex reports the THREAD's cumulative
     * usage on every turn. Gemini's stats come from a per-process telemetry
     * singleton that a resume does not restore, so they are already this turn's
     * own — subtracting a baseline here would report zero for every turn after
     * the first.
     */
    gemini?: GeminiState;
    /**
     * …and OpenCode's, which is a FOURTH state for a fourth protocol
     * (opencodeproto.ts) — and the first one that is not a reader over lines
     * this session's own process printed. There is no process of this session's:
     * the frames arrive on a connection shared with every other OpenCode card
     * and are routed here by `sessionId` (opencodeacp.ts).
     *
     * ‼️ IT CARRIES WHAT ONLY A LIVE CONNECTION CAN HOLD — the config options the
     * engine volunteered (its own model list included), a picker change waiting
     * for the turn boundary, and the permission request the agent is BLOCKED on.
     * None of those has anywhere to live on a per-turn engine, which is why this
     * is a third arm and not a third spelling of the second one.
     */
    opencode?: OpencodeCard;
    /** The turn a per-turn engine is running: what was said, what rode with it,
     *  what the engine has complained about, and how many times this exact turn
     *  has been attempted (see the thread-store conflict in `runTurn`). */
    turn?: {
        prompt: string; attachments: Attachment[]; tries: number; stderr: string;
        /** the engine printed its own end-of-turn event; the process exiting
         *  afterwards is an ordinary ending rather than a death */
        reported?: boolean;
    };
    /**
     * ‼️ THE PROJECT BRIEF, WAITING FOR THE FIRST PROMPT — per-turn engines only.
     *
     * Claude Code takes the brief on the command line as an extra system prompt
     * (`--append-system-prompt-file`) and it is invisible to the conversation.
     * `codex` has NO such channel — measured against its own `--help`: prompt,
     * `AGENTS.md`, config, nothing else. Left as it was, a Codex session started
     * under a project simply never heard about it, which is worse than not
     * offering the project box at all: the badge on the card said it was filed
     * under something the agent had never been told.
     *
     * So on this engine the brief rides INSIDE the first prompt, fenced
     * (`codexContextPrefix`), and is consumed exactly once — the thread carries
     * it from then on, the same way the system prompt does not repeat.
     */
    context?: string;
    buffer: string;
    reqSeq: number;
    /**
     * "Now try that again" — held back until the CLI has actually AGREED to the
     * wider permission (see setPermissionMode). It used to be said the moment
     * the request was written, which meant the agent was told "Permission
     * granted, please retry" for a switch the CLI had refused: it retried, was
     * refused again, and the panel had reported success twice over.
     */
    retryOnGrant?: string;
    /**
     * The session was ENDED from a panel (see `close`). A killed process is not
     * a silent one — whatever it already wrote is still in the pipe — and every
     * line read after the end used to be reduced as if the session were alive.
     * Nothing is read, written or reduced once this is set.
     */
    closed?: boolean;
}

export class ConsoleHost {
    private sessions = new Map<string, Hosted>();
    private seq = 0;
    private listeners: ((id: string) => void)[] = [];

    constructor(
        /** how to run the CLI — 'claude' unless the user overrode it */
        private exe: () => string = () => 'claude',
        /**
         * The pid the CLI itself registered for a session, if the caller can
         * look it up (`~/.claude/sessions/<pid>.json`).
         *
         * The child we hold is the `shell: true` wrapper, and a tree kill
         * through it is one assumption deep: it works only as long as the real
         * `claude` is still a descendant of that shell. The CLI's own registry
         * names the process directly, so ending a session can stop the thing
         * it is actually about instead of the thing that started it.
         */
        private ownerPid: (sessionId: string) => number | undefined = () => undefined,
        /**
         * The window's active project, read at spawn time.
         *
         * It is asked for HERE rather than passed by each caller on purpose:
         * there are six places that start a session, and a stamp that depends
         * on all six remembering to attach it is a stamp that will silently
         * stop being applied the first time a seventh appears.
         */
        private activeProjectId: () => string | undefined = () => undefined,
        /**
         * Write the project's context file and return its path.
         *
         * Called on EVERY spawn, first start and resume alike — the appended
         * system prompt does not survive `--resume` (measured), and the brief
         * it carries has to be current anyway.
         */
        private projectContextFile: (projectId: string | undefined) => string | undefined =
            () => undefined,
        /**
         * ‼️ X-43 — WHAT THE WINDOW IS HOLDING, ON AN ENGINE THAT DOES NOT SAY.
         *
         * Codex puts one usage block on the wire per turn and it is the thread's
         * running total: there is nothing there a window can be read out of, and
         * reading one out of it anyway is how a card came to show `ctx 5.4M`
         * against a capacity of 258 400. The figure exists — the CLI writes it to
         * its own rollout at every turn boundary — so it is READ rather than
         * derived (core/codexctx.ts). Injected because the host has no `fs`, and
         * absent in a test, which is the same thing as an engine that publishes
         * nothing: ctx stays unknown and no total takes its place.
         */
        private codexContext: (threadId: string, force?: boolean) => {
            tokens: number; window?: number; source: string; measuredAt: number;
        } | undefined = () => undefined,
        /**
         * ‼️ K-25 — HOW THE ONE SHARED `opencode acp` PROCESS IS STARTED.
         *
         * Injected rather than built here for the reason every other io on this
         * class is: the host must stay testable without a binary, and the whole
         * point of this engine's shape is a lifecycle (handshake, turn, cancel,
         * crash, reload) that only a test can exercise cheaply. Absent means this
         * build cannot run OpenCode, and a card that asks for it is told so in
         * one sentence rather than sitting at `starting` for ever.
         *
         * There is exactly ONE runtime per host, created on the first OpenCode
         * card and stopped when the last one goes — the 383 MB measurement is the
         * whole argument, and a factory called twice would quietly undo it.
         */
        private opencodeIo?: OpencodeRuntimeIo
    ) {}

    /** The shared OpenCode runtime, made on demand. `undefined` when this build
     *  was given no way to spawn one (see the constructor). */
    private opencodeRt?: OpencodeRuntime;

    private runtime(): OpencodeRuntime | undefined {
        if (!this.opencodeIo) { return undefined; }
        if (!this.opencodeRt) { this.opencodeRt = new OpencodeRuntime(this.opencodeIo); }
        return this.opencodeRt;
    }

    /** What the one shared process is doing, for a surface that wants to say —
     *  and for the acceptance run, which has to prove two cards share one pid. */
    opencodeRuntimeState(): { phase: string; pid?: number; cards: number } | undefined {
        const rt = this.opencodeRt;
        return rt ? { phase: rt.state, pid: rt.pid, cards: rt.cardCount } : undefined;
    }

    /**
     * Apply Codex's on-disk context reading to a hosted session, as a canonical
     * `context` event (consoleproto.ts).
     *
     * Returns whether anything changed — the reducer answers that, by comparing
     * the reading with the one already on the state, so an unchanged file costs
     * a Map lookup and repaints nothing.
     */
    private pollCodexContext(h: Hosted, force = false): boolean {
        if (h.engine.id !== 'codex' || h.closed) { return false; }
        const thread = threadOf(h) ?? h.state.sessionId;
        if (!thread) { return false; }
        const r = this.codexContext(thread, force);
        if (!r) { return false; }
        const rr = reduceEvent(h.state, {
            type: 'context', tokens: r.tokens, window: r.window,
            source: r.source, measuredAt: r.measuredAt
        }, Date.now());
        h.state = rr.state;
        return rr.changed;
    }

    onChange(fn: (id: string) => void): { dispose(): void } {
        this.listeners.push(fn);
        return { dispose: () => { this.listeners = this.listeners.filter(f => f !== fn); } };
    }

    private fire(id: string): void {
        for (const fn of this.listeners) { fn(id); }
    }

    list(): ConsoleSessionState[] {
        return [...this.sessions.values()].map(h => h.state).sort((a, b) => b.lastTs - a.lastTs);
    }

    get(id: string): ConsoleSessionState | undefined {
        return this.sessions.get(id)?.state;
    }

    /**
     * ‼️ S-29 — ONE CARD PER SESSION, ON EVERY ENGINE.
     *
     * An ended session keeps its card in the left panel until you say "Remove
     * from list", and it keeps it for two reasons: so the conversation can still
     * be read, and so it is under your hand when you want it back. Resuming it
     * therefore has to come back to THAT card. It did not: every route built a
     * fresh one, so the panel held two cards with the same session id — one live
     * and one grey — and doing it again would have made three.
     *
     * The seat is the hosted id, and it is reused rather than replaced: the
     * panel's selection, the right-click menu's `hostId` and anything else
     * holding that id keep pointing at the session they were pointing at.
     *
     * A LIVE card for the same id is a different answer: there is nothing to
     * revive, and spawning would put a second process on one transcript. The
     * caller is handed the card that already exists. (One route guarded that by
     * hand; six did not, which is the shape of bug this class exists to stop.)
     */
    private seatFor(sessionId: string): { id: string; live: boolean } | undefined {
        for (const [id, h] of this.sessions) {
            if (h.state.sessionId !== sessionId) { continue; }
            const dead = h.state.status === 'ended' || h.state.status === 'error';
            return { id, live: !dead };
        }
        return undefined;
    }

    /**
     * ‼️ S-30 — WHAT IS ALREADY ON THE CARD IS NEVER TRADED FOR WHAT DISK SAYS.
     *
     * A resume rebuilds the scrollback from the transcript, and that read has
     * several honest ways to come back short: the index may not know the id yet,
     * the file may be unreadable, the parse may hold a fraction of what the card
     * watched happen live. The seat's own messages were the ground truth for
     * everything the reader had just seen — dropping them and taking whatever
     * the file gave back is how "End session, then Resume" printed an empty
     * conversation for a session whose transcript was complete.
     *
     * So the richer of the two wins. They are never merged: the same turn read
     * twice from two sources is a duplicated conversation, which is the failure
     * this rule exists to avoid on the other side.
     */
    private resumeMessages(
        prior: ConsoleMessage[], history: ConsoleMessage[] | undefined
    ): ConsoleMessage[] | undefined {
        const read = history ?? [];
        if (read.length >= prior.length) { return read.length ? read : undefined; }
        return prior.length ? prior : undefined;
    }

    /**
     * ‼️ K-22 — what this session's permission control ACTUALLY means, read off
     * Claude's own settings layers rather than assumed from the picker.
     *
     * The layers and their precedence belong to `permissionmode.ts`; this only
     * hands it the files. A layer that is absent, unreadable or not valid JSON
     * is simply an absent layer — a broken project settings file must not stop
     * somebody starting a session.
     */
    private resolvePermission(requested: string, cwd: string): EffectivePermission {
        const home = os.homedir();
        const layers = permissionLayerPaths(cwd || '', home).map(l => {
            try { return { ...l, text: fs.readFileSync(l.file, 'utf8') }; } catch { return l; }
        });
        return resolveEffectivePermission(requested, layers);
    }

    /**
     * ‼️ K-22 — BYPASS WAS ASKED FOR AND CANNOT BE ENFORCED, SO NOTHING STARTS.
     *
     * The tempting alternative is to start the session in the ordinary asking
     * mode and let the user find out when a window opens. That is precisely the
     * state the user's decision forbids: a card that says bypass and a process
     * that asks. The session appears, in error, saying which policy refused it
     * and where that policy lives — a thing they can act on.
     */
    private refusePermissionMismatch(
        id: string, init: HostedSessionInit, projectId: string | undefined,
        prior: ConsoleMessage[], permission: EffectivePermission
    ): string {
        const now = Date.now();
        const base = newSessionState({
            id, agentId: init.agentId, agentName: init.agentName, cwd: init.cwd,
            model: init.model, effort: init.effort, permissionMode: init.permissionMode,
            now, sessionId: init.resume, projectId, resumed: !!init.resume,
            carried: init.resume ? init.carried : undefined
        });
        const blocked = permission.blocked;
        const text = `This session was not started. It asked for ${BYPASS}`
            + `${permission.requested ? '' : ' (Default resolves to it through ' + permission.settingsFile + ')'}`
            + `, and that cannot be enforced here: ${blocked?.why} — ${blocked?.file}.`
            + ' Agent Farm will not run a session labelled bypass that would then stop and ask you for'
            + ' permission. Change that policy, or start this session in a mode you actually want.';
        this.sessions.set(id, {
            state: {
                ...base,
                messages: [...prior, { id: `perm-${now.toString(36)}`, ts: now, role: 'error', text }],
                status: 'error',
                exitReason: 'bypass was requested and could not be enforced',
                enforcedPermissionMode: '',
                permissionWhy: permission.why
            },
            engine: engineOf(init.engine), buffer: '', reqSeq: 0
        });
        this.fire(id);
        return id;
    }

    /** Start a hosted session. Returns our id; the CLI's own id arrives later. */
    start(init: HostedSessionInit): string {
        const seat = init.resume ? this.seatFor(init.resume) : undefined;
        if (seat?.live) { return seat.id; }
        const id = seat ? seat.id : `cs${++this.seq}-${Date.now().toString(36)}`;
        // …and what that card was SHOWING outlives the record of its process.
        const prior = seat ? this.sessions.get(seat.id)?.state.messages ?? [] : [];
        // The grey card's process is long gone; what is dropped here is the
        // record of it, a line before the new one takes the same seat.
        if (seat) { this.sessions.delete(seat.id); }
        const projectId = init.projectId ?? this.activeProjectId();
        const engine = engineOf(init.engine);
        if (engine.shape === 'perTurn') { return this.startPerTurn(id, engine, init, projectId, prior); }
        if (engine.shape === 'sharedAcp') { return this.startShared(id, engine, init, projectId, prior); }
        /**
         * ‼️ K-22 — WHAT THIS SESSION WILL REALLY BE IN, decided before it runs.
         *
         * The launcher's choice is a request; Claude's own settings can turn
         * `Default` into bypass; a managed policy can forbid bypass outright.
         * Resolving all three here means the flags, the card and the reducer's
         * auto-answer all follow ONE answer instead of three guesses.
         */
        const permission = this.resolvePermission(init.permissionMode ?? '', init.cwd);
        if (permission.blocked) {
            // A session that would wear a label it cannot honour is not started.
            // Downgrading it to "asks" silently is the exact state the user
            // rejected: bypass on the card, a permission window on the screen.
            return this.refusePermissionMismatch(id, init, projectId, prior, permission);
        }
        const args = hostArgs({
            ...init, permission, projectContextFile: this.projectContextFile(projectId)
        });
        // shell:true — `claude` is a .cmd shim on Windows. Nothing user-typed
        // reaches the command line: prompts travel on stdin as JSON, and the
        // flag values come from fixed vocabularies (launch.ts).
        const child = cp.spawn(this.exe(), args, {
            cwd: init.cwd, shell: true, windowsHide: true,
            stdio: ['pipe', 'pipe', 'pipe']
        });
        const base = newSessionState({
            id, agentId: init.agentId, agentName: init.agentName, cwd: init.cwd,
            model: init.model, effort: init.effort, permissionMode: init.permissionMode,
            now: Date.now(),
            // a resumed session already HAS an id — see newSessionState
            sessionId: init.resume,
            projectId,
            resumed: !!init.resume,
            // …and a past: what it spent before this window picked it up
            carried: init.resume ? init.carried : undefined
        });
        // K-22 — the enforced mode is a FACT about the flags just built, kept
        // beside the request rather than instead of it.
        base.enforcedPermissionMode = permission.effective;
        base.permissionWhy = permission.why;
        // The earlier conversation goes in as messages, nothing more: it is
        // never written to stdin, so it costs nothing and the model's own
        // context comes from --resume, not from here.
        const carriedMessages = this.resumeMessages(prior, init.history);
        const hosted: Hosted = {
            state: carriedMessages ? { ...base, messages: carriedMessages } : base,
            child, engine, buffer: '', reqSeq: 0
        };
        this.sessions.set(id, hosted);

        this.readStdout(id, child);
        child.stderr?.on('data', d => {
            const text = String(d).trim();
            // The CLI writes progress noise to stderr too; only keep what looks
            // like a real failure, so the conversation is not a log dump.
            if (!text || !/error|fatal|not found|denied/i.test(text)) { return; }
            // …and a session you ended says nothing more, not even a complaint
            // about being killed (see close).
            if (this.sessions.get(id)?.closed) { return; }
            this.mutate(id, s => ({
                ...s, lastTs: Date.now(),
                messages: [...s.messages, {
                    id: `err-${Date.now().toString(36)}`, ts: Date.now(),
                    role: 'error', text: text.slice(0, 400)
                }]
            }));
        });
        child.on('error', e => {
            // A pipe that breaks because WE killed the process is not a session
            // that failed — it ended, and it already says so.
            if (this.sessions.get(id)?.closed) { return; }
            this.mutate(id, s => ({
                ...s, status: 'error', exitReason: String((e as Error).message ?? e),
                lastTs: Date.now()
            }));
        });
        child.on('close', code => {
            this.mutate(id, s => ({
                ...s,
                status: s.status === 'error' ? 'error' : 'ended',
                exitReason: s.exitReason ?? (code === 0 ? 'session closed' : `claude exited with code ${code}`),
                lastTs: Date.now()
            }));
        });

        // Ask the CLI what it is actually going to think with, before a word is
        // said. Nothing else can answer it: the flags above are only what was
        // ASKED for, and the usual case is that nothing was (see askSettings).
        this.askSettings(id);
        const firstFiles = init.firstAttachments ?? [];
        if (init.firstPrompt?.trim() || firstFiles.length) {
            this.send(id, init.firstPrompt ?? '', false, firstFiles);
        }
        return id;
    }

    /**
     * ‼️ A SESSION THAT HAS NO PROCESS YET, AND IS NOT BROKEN.
     *
     * On a per-turn engine there is nothing to spawn until there is something
     * to say: `codex exec` takes a prompt, runs it and exits. So the session is
     * created **idle** with no child, and the first turn is started by the first
     * message — which is also how every later turn starts. There is no "starting"
     * state to sit in, because nothing is starting.
     *
     * Everything else about the session is identical to a persistent one: the
     * same state object, the same queue, the same panel, the same transcript
     * shape. That is the point of the adaptor (codexproto.ts) — one Console, two
     * machines underneath it.
     */
    private startPerTurn(
        id: string, engine: EngineTransport, init: HostedSessionInit, projectId: string | undefined,
        prior: ConsoleMessage[] = []
    ): string {
        const base = newSessionState({
            id, agentId: init.agentId, agentName: init.agentName, cwd: init.cwd,
            model: init.model, effort: init.effort, permissionMode: init.permissionMode,
            now: Date.now(),
            sessionId: init.resume,
            projectId,
            resumed: !!init.resume,
            carried: init.resume ? init.carried : undefined
        });
        // ‼️ S-30 — and the same rule here, which is the side the report came
        // from: the per-turn engines are the ones with no process between turns,
        // so this is the path "End session → Resume" takes on Codex.
        const carriedMessages = this.resumeMessages(prior, init.history);
        const hosted: Hosted = {
            state: {
                ...(carriedMessages ? { ...base, messages: carriedMessages } : base),
                // Nothing is starting and nothing is running: it is ready.
                status: 'idle',
                engine: engine.id
            },
            engine,
            // A resume already knows the thread; a fresh session learns it from
            // the first `thread.started` (Codex) / `init` (Antigravity, Gemini)
            // — except on Gemini, where the id is CHOSEN before the first turn
            // (see `newThread` in runTurn) and `init` only confirms it.
            ...(engine.id === 'agy'
                ? { agy: { ...newAgyState(), ...(init.resume ? { conversationId: init.resume } : {}) } }
                : engine.id === 'gemini'
                    ? {
                        gemini: {
                            ...newGeminiState(),
                            ...(init.resume ? { sessionId: init.resume } : {})
                        }
                    }
                    : {
                        codex: {
                            ...newCodexState(),
                            ...(init.resume ? { threadId: init.resume } : {}),
                            // ‼️ …AND WHAT THE THREAD HAS ALREADY SPENT, or the
                            // first turn after a resume is charged with the whole
                            // conversation — see codexTurnUsage /
                            // codexTotalsFromUsage. This baseline is CODEX-ONLY:
                            // it exists because that engine reports the thread's
                            // running total, and applying it to an engine that
                            // reports per-turn figures would zero every turn.
                            ...(init.resume
                                ? (() => {
                                    const spent = codexTotalsFromUsage(init.carried?.usage);
                                    return spent ? { spent } : {};
                                })()
                                : {})
                        }
                    }),
            // ‼️ Read HERE, at spawn, exactly like the Claude path writes the
            // file here — and only for a session that is starting. A resume is
            // continuing a thread that was already told, and telling it again
            // would put the brief in the middle of a conversation as if the user
            // had typed it.
            context: init.resume ? undefined : this.readProjectContext(projectId),
            buffer: '', reqSeq: 0
        };
        this.sessions.set(id, hosted);
        const firstFiles = init.firstAttachments ?? [];
        if (init.firstPrompt?.trim() || firstFiles.length) {
            this.send(id, init.firstPrompt ?? '', false, firstFiles);
        }
        return id;
    }

    // -----------------------------------------------------------------------
    // K-25 — the shared-ACP arm
    // -----------------------------------------------------------------------

    /**
     * ‼️ A SESSION THAT HAS NO PROCESS *AT ALL*, EVER — and is not broken either.
     *
     * The per-turn arm above has no process BETWEEN turns. This one never has one
     * of its own: the conversation lives on a connection shared with every other
     * OpenCode card, and what this card owns is a `ses_…` inside it. So the work
     * of starting is not a spawn, it is a handshake plus `session/new` (or
     * `session/load` on a resume) — genuinely asynchronous, genuinely able to
     * fail with something worth reading, and therefore the one engine here whose
     * `starting` status means something.
     *
     * Everything downstream is identical to the other two: the same state object,
     * the same queue, the same panel, the same transcript shape.
     */
    private startShared(
        id: string, engine: EngineTransport, init: HostedSessionInit,
        projectId: string | undefined, prior: ConsoleMessage[] = []
    ): string {
        const base = newSessionState({
            id, agentId: init.agentId, agentName: init.agentName, cwd: init.cwd,
            model: init.model, effort: init.effort, permissionMode: init.permissionMode,
            now: Date.now(),
            sessionId: init.resume,
            projectId,
            resumed: !!init.resume,
            carried: init.resume ? init.carried : undefined
        });
        // ‼️ THE MODE IS RECORDED AS *ENFORCED* HERE, and that is what makes
        // K-22's bypass rule work on this engine. Over ACP there is no `--auto`
        // flag to hand the process — the engine asks, every time, on a channel
        // that is genuinely open. So "bypass" means Agent Farm answers those
        // questions itself, which is exactly what the reducer already does when
        // it sees this field, catastrophic-shape refusal included.
        base.enforcedPermissionMode = init.permissionMode ?? '';
        base.permissionWhy = this.opencodePermissionWhy(init.permissionMode);
        const carriedMessages = this.resumeMessages(prior, init.history);
        const hosted: Hosted = {
            state: {
                ...(carriedMessages ? { ...base, messages: carriedMessages } : base),
                status: 'starting',
                engine: engine.id
            },
            engine,
            opencode: {
                proto: {
                    ...newOpencodeState(),
                    ...(init.resume ? { sessionId: init.resume } : {})
                },
                options: []
            },
            // The brief has nowhere else to go: this engine has no system-prompt
            // flag either (`OPENCODE_HAS_NO_SYSTEM_PROMPT_FLAG`), so it rides
            // inside the first prompt exactly as it does on Codex — and only for
            // a session that is starting, because a resume is continuing a
            // conversation that was already told.
            context: init.resume ? undefined : this.readProjectContext(projectId),
            buffer: '', reqSeq: 0
        };
        this.sessions.set(id, hosted);
        this.fire(id);
        void this.openShared(id, init);
        return id;
    }

    /** One sentence for the card: what the chosen mode means on THIS engine, on
     *  THIS transport. Kept apart from `opencodeModeNote`, which has to describe
     *  the headless and terminal forms too — where `--auto` is a real flag and
     *  here it is not. */
    private opencodePermissionWhy(mode: string | undefined): string {
        const p = opencodePermissionFor(mode);
        if (p.mode === 'plan') {
            return 'OpenCode is running its own `plan` agent: every edit tool is disallowed, so it can read and reason and not write.';
        }
        if (!p.auto) {
            return 'OpenCode\'s `build` agent asks before it acts, and here it really can — the permission card is the engine\'s own '
                + 'request, answered back down the same connection.';
        }
        return 'The engine still asks — a hosted card has no `--auto` flag to hand it — and Agent Farm answers yes for you, '
            + 'without opening a window. The one shape it refuses instead is the catastrophic one, out loud, because '
            + '"never ask me" is not consent to that.';
    }

    /** The handshake, the session and the first prompt — everything that has to
     *  happen before this card can be talked to. */
    private async openShared(id: string, init: HostedSessionInit): Promise<void> {
        const h = this.sessions.get(id);
        if (!h?.opencode) { return; }
        const rt = this.runtime();
        if (!rt) {
            this.failShared(id, 'This build of Agent Farm was not given a way to start `opencode acp`, '
                + 'so an OpenCode session cannot be hosted here. The engine still works in a terminal and in a task.');
            return;
        }
        const cwd = h.state.cwd;
        try {
            let sessionId = String(init.resume ?? '').trim();
            let options: OpencodeConfigOption[];
            if (sessionId) {
                // ‼️ ATTACHED BEFORE THE LOAD, because `session/load` REPLAYS the
                // whole conversation as ordinary update frames and they would
                // otherwise arrive at a card the runtime does not know yet. The
                // translator is put in `replaying` for exactly that window: this
                // card is already showing all of it (see OpencodeState.replaying).
                rt.attach(sessionId, cwd, this.opencodeHandlers(id));
                this.withOpencode(id, c => ({ ...c, proto: opencodeReplay(c.proto, true) }));
                options = await rt.loadSession(sessionId, cwd);
                this.withOpencode(id, c => ({ ...c, proto: opencodeReplay(c.proto, false) }));
            } else {
                const made = await rt.newSession(cwd);
                sessionId = made.sessionId;
                options = made.options;
                rt.attach(sessionId, cwd, this.opencodeHandlers(id));
            }
            const now = this.sessions.get(id);
            if (!now || now.closed) { rt.detach(sessionId); return; }
            this.withOpencode(id, c => ({ ...c, options, proto: { ...c.proto, sessionId } }));
            this.mutate(id, s => ({ ...s, sessionId, status: 'idle', lastTs: Date.now() }));
            // The pickers, now that there is a connection to apply them to. A
            // refusal is said out loud rather than leaving a card claiming a
            // model it is not using.
            await this.applyOpencodeConfig(id, {
                model: h.state.model, mode: opencodePermissionFor(h.state.permissionMode).mode
            }, true);
            const firstFiles = init.firstAttachments ?? [];
            if (init.firstPrompt?.trim() || firstFiles.length) {
                this.send(id, init.firstPrompt ?? '', false, firstFiles);
            }
        } catch (e) {
            this.failShared(id, String((e as Error).message ?? e));
        }
    }

    /** A card that could not be started says why, once, and stays readable. */
    private failShared(id: string, why: string): void {
        this.mutate(id, s => ({
            ...s, status: 'error', exitReason: why, lastTs: Date.now(),
            messages: [...s.messages, {
                id: `err-${Date.now().toString(36)}`, ts: Date.now(), role: 'error', text: why
            }]
        }));
    }

    /** Change one card's ACP state without rebuilding the session record. */
    private withOpencode(id: string, fn: (c: OpencodeCard) => OpencodeCard): void {
        const h = this.sessions.get(id);
        if (!h?.opencode) { return; }
        h.opencode = fn(h.opencode);
    }

    /** What the runtime tells this card about. Every one of these is called from
     *  the shared process's reader, so none of them may throw. */
    private opencodeHandlers(id: string): {
        update(u: Record<string, unknown>): void;
        permission(r: OpencodePermissionRequest): void;
        reloaded(ok: boolean, why?: string): void;
        note(text: string): void;
    } {
        return {
            update: u => this.onOpencodeUpdate(id, u),
            permission: r => this.onOpencodePermission(id, r),
            reloaded: (ok, why) => this.onOpencodeReloaded(id, ok, why),
            note: text => this.mutate(id, s => ({
                ...s, lastTs: Date.now(),
                messages: [...s.messages, {
                    id: `sys-${Date.now().toString(36)}`, ts: Date.now(), role: 'system', text
                }]
            }))
        };
    }

    /**
     * One `session/update` for this card.
     *
     * ‼️ THE SAME REDUCER AS EVERY OTHER ENGINE, WHICH IS THE POINT. The frames
     * are foreign; what comes out of the translator is not, so state, panel, cost
     * strip and transcript stay one code path (see opencodeproto.ts).
     */
    private onOpencodeUpdate(id: string, update: Record<string, unknown>): void {
        const h = this.sessions.get(id);
        if (!h?.opencode || h.closed) { return; }
        const t = translateOpencodeUpdate(h.opencode.proto, update);
        h.opencode = { ...h.opencode, proto: t.state };
        if (!t.events.length) { return; }
        this.applyOpencodeEvents(id, t.events);
    }

    /** Reduce a batch of translated events and repaint once. */
    private applyOpencodeEvents(id: string, events: unknown[]): void {
        const h = this.sessions.get(id);
        if (!h || h.closed) { return; }
        const now = Date.now();
        let changed = false;
        for (const ev of events) {
            const r = reduceEvent(h.state, ev, now);
            h.state = r.state;
            changed = changed || r.changed;
            // ‼️ K-22 on a connection instead of a pipe. The reducer built the
            // answer to a permission request a bypassed session must not open a
            // window for; only the host can put it on the wire, and here that
            // means an ACP option id rather than a control_response line.
            const auto = drainAutoAnswer(h.state);
            if (auto.line) {
                h.state = auto.state;
                this.answerOpencodeAuto(id, auto.line);
            }
        }
        // ‼️ A CARD IS `working` FOR AS LONG AS ITS OWN PROMPT IS OUTSTANDING —
        // not for as long as the shared process is up, which says nothing about
        // this conversation. The reducer moves to `idle` on a `result`; a stray
        // frame arriving after that must not put the card back to work.
        if (h.opencode?.running && h.state.status === 'idle') {
            h.state = { ...h.state, status: 'working' };
        }
        if (changed) { this.fire(id); }
    }

    /**
     * The agent is asking whether it may do something.
     *
     * ‼️ TRANSLATED INTO THE CLAUDE-SHAPED `control_request` THE REDUCER ALREADY
     * KNOWS, rather than given its own state. That is not tidiness: the reducer's
     * `can_use_tool` branch is where K-22 lives — a bypassed session answering
     * itself, and the one catastrophic shape it refuses anyway — and a second
     * permission path would be a second place for that policy to be forgotten.
     * What is kept apart is only what ACP adds: the option ids, which are what an
     * answer has to travel back as.
     */
    private onOpencodePermission(id: string, req: OpencodePermissionRequest): void {
        const h = this.sessions.get(id);
        if (!h?.opencode) { return; }
        if (h.closed || h.state.status === 'ended' || h.state.status === 'error') {
            // Nobody is going to answer. `cancelled` un-parks the agent honestly.
            this.runtime()?.answerPermission(req.requestId);
            return;
        }
        h.opencode = { ...h.opencode, ask: { requestId: req.requestId, options: req.options } };
        const call = req.toolCall ?? {};
        const title = String(call.title ?? 'a tool');
        this.applyOpencodeEvents(id, [{
            type: 'control_request',
            request_id: req.requestId,
            request: {
                subtype: 'can_use_tool',
                tool_name: title,
                display_name: title,
                tool_use_id: typeof call.toolCallId === 'string' ? call.toolCallId : undefined,
                input: (call.rawInput as Record<string, unknown> | undefined) ?? {}
            }
        }]);
    }

    /**
     * ‼️ WHICH OPTION A YES OR A NO ACTUALLY IS — the one thing ACP adds that the
     * Claude vocabulary has no word for.
     *
     * The agent publishes its own options with its own ids and a `kind`
     * (`allow_once` · `allow_always` · `reject_once` · `reject_always`); the
     * answer has to be one of THOSE ids, not a behaviour. So "allow" picks the
     * once option, "allow, and stop asking" picks the always one when the agent
     * offered it, and a no picks a reject. An engine that offered neither leaves
     * this returning nothing, and the caller cancels the request instead — which
     * un-parks the agent without inventing a choice it never gave.
     */
    private opencodeOptionFor(
        options: { optionId: string; kind: string }[], want: 'allow' | 'always' | 'reject'
    ): string | undefined {
        const byKind = (k: string) => options.find(o => o.kind === k)?.optionId;
        if (want === 'reject') { return byKind('reject_once') ?? byKind('reject_always'); }
        if (want === 'always') { return byKind('allow_always') ?? byKind('allow_once'); }
        return byKind('allow_once') ?? byKind('allow_always');
    }

    /** Put the answer the panel (or K-22) produced on the wire. */
    private answerOpencodeAsk(
        id: string, want: 'allow' | 'always' | 'reject'
    ): boolean {
        const h = this.sessions.get(id);
        const ask = h?.opencode?.ask;
        if (!h?.opencode || !ask) { return false; }
        h.opencode = { ...h.opencode, ask: undefined };
        const optionId = this.opencodeOptionFor(ask.options, want);
        return this.runtime()?.answerPermission(ask.requestId, optionId) ?? false;
    }

    /**
     * K-22's own answer, which the reducer wrote as a Claude control line because
     * that is the only shape it can write. Read back for the single fact this
     * transport needs — allow or deny — rather than reimplementing the policy
     * that produced it.
     */
    private answerOpencodeAuto(id: string, line: string): void {
        let allow = false;
        try {
            const frame = JSON.parse(line) as Record<string, unknown>;
            const response = (frame.response as Record<string, unknown> | undefined) ?? {};
            const verdict = (response.response as Record<string, unknown> | undefined) ?? {};
            allow = verdict.behavior === 'allow';
        } catch { allow = false; }
        this.answerOpencodeAsk(id, allow ? 'allow' : 'reject');
    }

    /**
     * The shared process died and this card was picked up again — or was not.
     *
     * ‼️ A RUNNING TURN DOES NOT SURVIVE, AND SAYING SO IS THE WHOLE POINT. The
     * conversation does: it is in the engine's own store and `session/load` put
     * this card back on it. What is gone is the turn that was in flight, and a
     * card left at `working` after that is a card that will never move again.
     */
    private onOpencodeReloaded(id: string, ok: boolean, why?: string): void {
        const h = this.sessions.get(id);
        if (!h?.opencode || h.closed) { return; }
        h.opencode = {
            ...h.opencode, running: false, ask: undefined,
            proto: opencodeReplay(h.opencode.proto, false)
        };
        if (h.opencode.cancelTimer) { clearTimeout(h.opencode.cancelTimer); h.opencode.cancelTimer = undefined; }
        const text = ok
            ? `${why ?? 'the shared OpenCode process restarted'} — this conversation was re-opened on the new one`
            + ' and is ready. Anything that was mid-turn did not finish; say it again.'
            : `${why ?? 'the shared OpenCode process stopped'}. The conversation itself is safe in OpenCode's own store —`
            + ' resume this session to pick it up again.';
        this.mutate(id, s => ({
            ...s,
            status: ok ? 'idle' : 'error',
            ...(ok ? {} : { exitReason: why ?? 'the shared OpenCode process stopped' }),
            turnStartedAt: undefined, turnTokensAt: undefined,
            lastTs: Date.now(),
            messages: [...s.messages, {
                id: `sys-${Date.now().toString(36)}`, ts: Date.now(),
                role: ok ? 'system' : 'error', text
            }]
        }));
        if (ok) { this.releaseShared(id); }
    }

    /**
     * Run ONE turn over the shared connection.
     *
     * ‼️ THE PROMPT IS A FRAME, NOT A COMMAND LINE, AND NOTHING IS SPAWNED. The
     * turn ends when the engine answers the `session/prompt` request — there is
     * no process exit to wait for, which is why (unlike the per-turn arm) the
     * queue is released the moment the promise settles.
     */
    private promptShared(id: string, prompt: string, attachments: Attachment[] = []): boolean {
        const h = this.sessions.get(id);
        const rt = this.runtime();
        const sessionId = h?.state.sessionId;
        if (!h?.opencode || h.closed || !rt || !sessionId) { return false; }
        // The brief, once, on the way into the first turn — consumed before the
        // frame goes out so a retried turn cannot send it twice.
        if (h.context) {
            prompt = engineContextPrefix(h.context) + prompt;
            h.context = undefined;
        }
        h.opencode = {
            ...h.opencode, running: true, proto: opencodeTurnStarted(h.opencode.proto)
        };
        const blocks = opencodePromptBlocks(
            prompt, attachments.filter(a => a.kind === 'image' && a.data));
        rt.prompt(sessionId, blocks).then(
            result => this.finishShared(id, result),
            (e: Error) => this.failShared2(id, String(e?.message ?? e)));
        return true;
    }

    /** The turn answered: translate the result, apply anything the pickers were
     *  holding, then let the queue move. */
    private finishShared(id: string, result: Record<string, unknown>): void {
        const h = this.sessions.get(id);
        if (!h?.opencode) { return; }
        if (h.opencode.cancelTimer) { clearTimeout(h.opencode.cancelTimer); }
        h.opencode = { ...h.opencode, running: false, cancelTimer: undefined, ask: undefined };
        const t = translateOpencodeResult(h.opencode.proto, result, { model: h.state.model });
        h.opencode = { ...h.opencode, proto: t.state };
        if (h.closed) { return; }
        this.applyOpencodeEvents(id, t.events);
        const held = h.opencode.pending;
        if (held) {
            h.opencode = { ...h.opencode, pending: undefined };
            void this.applyOpencodeConfig(id, held, false);
        }
        this.releaseShared(id);
    }

    /** The turn could not be run, or the connection went while it was running.
     *  The SESSION survives — the conversation is in the engine's store. */
    private failShared2(id: string, why: string): void {
        const h = this.sessions.get(id);
        if (!h?.opencode) { return; }
        if (h.opencode.cancelTimer) { clearTimeout(h.opencode.cancelTimer); }
        h.opencode = { ...h.opencode, running: false, cancelTimer: undefined, ask: undefined };
        if (h.closed) { return; }
        this.endTurn(id, why);
        this.releaseShared(id);
    }

    /** The next held message, once the turn really is over — which here is the
     *  moment the prompt promise settles, because there is no process exiting
     *  behind it (compare `releasePerTurn`). */
    private releaseShared(id: string): void {
        const h = this.sessions.get(id);
        if (!h?.opencode || h.closed || h.opencode.running || !h.state.queued.length) { return; }
        const next = shiftQueued(h.state);
        h.state = next.state;
        if (!next.text) { this.fire(id); return; }
        h.state = {
            ...h.state, status: 'working',
            turnStartedAt: Date.now(), turnTokensAt: h.state.tokens
        };
        this.fire(id);
        this.promptShared(id, enginePromptText(h.engine.id, next.text));
    }

    /**
     * Apply the pickers to the live connection.
     *
     * ‼️ ONLY AT A TURN BOUNDARY, AND THE CALLER HAS ALREADY CHECKED. The
     * protocol has no way to change the model of a turn that is running, and
     * doing it anyway is the shape of change that either fails on stderr nobody
     * reads (the `configId` trap) or moves the answer half way through.
     */
    private async applyOpencodeConfig(
        id: string, want: { model?: string; mode?: string }, quiet: boolean
    ): Promise<void> {
        const rt = this.runtime();
        const h = this.sessions.get(id);
        const sessionId = h?.state.sessionId;
        if (!rt || !h?.opencode || !sessionId) { return; }
        for (const [configId, value] of [['model', want.model], ['mode', want.mode]] as const) {
            const v = String(value ?? '').trim();
            if (!v) { continue; }
            // Already what the engine says it is: a call that changes nothing is
            // a round trip and a chance to fail for no gain.
            const current = h.opencode.options.find(o => o.id === configId)?.currentValue;
            if (current === v) { continue; }
            try {
                const options = await rt.setConfig(sessionId, configId, v);
                this.withOpencode(id, c => ({ ...c, options }));
                if (configId === 'model') {
                    this.mutate(id, s => ({
                        ...s, model: v, pendingModel: undefined,
                        ...(quiet ? {} : {
                            messages: [...s.messages, {
                                id: `sys-${Date.now().toString(36)}`, ts: Date.now(),
                                role: 'system', text: `model is now "${v}"`
                            }]
                        })
                    }));
                }
            } catch (e) {
                // ‼️ THE ENGINE'S OWN WORDS. `configId: expected string, received
                // undefined` is the difference between "the picker is broken" and
                // one key name, and A-16 measured that this failure otherwise
                // lands on a stderr nobody is reading.
                this.mutate(id, s => ({
                    ...s, pendingModel: undefined, lastTs: Date.now(),
                    messages: [...s.messages, {
                        id: `err-${Date.now().toString(36)}`, ts: Date.now(), role: 'error',
                        text: `OpenCode refused the ${configId} change — ${String((e as Error).message ?? e)}`
                    }]
                }));
            }
        }
    }

    /** The model list this engine handed over when the session opened — the one
     *  catalogue in this codebase that costs no spawn (see `opencodeModelsFrom`). */
    opencodeModels(id: string): { id: string; label: string }[] {
        const c = this.sessions.get(id)?.opencode;
        return c ? opencodeModelsFrom(c.options) : [];
    }

    /**
     * Run ONE turn of a per-turn engine: spawn, feed the prompt, read the JSONL.
     *
     * ‼️ THE PROMPT GOES ON STDIN AND STDIN IS THEN CLOSED. Measured: given the
     * prompt as an argument the CLI still drains stdin when stdin is a pipe
     * ("Reading additional input from stdin…") and waits for a second copy that
     * never arrives. `-` says explicitly that the instruction is coming that way.
     *
     * ‼️ AND THE PROCESS EXITING IS THE END OF A TURN, NOT OF THE SESSION. The
     * thread lives in the CLI's own store and the next turn resumes it by id —
     * so `close` here must not do what it does on a persistent engine, or a
     * Codex conversation would end itself the moment it finished answering.
     */
    private runTurn(id: string, prompt: string, attachments: Attachment[] = []): boolean {
        const h = this.sessions.get(id);
        if (!h || h.closed || h.engine.shape !== 'perTurn') { return false; }
        // The brief, once, on the way into the first turn — this engine has no
        // other channel for it (see Hosted.context). Consumed before the spawn
        // so a retried turn does not send it twice.
        if (h.context) {
            prompt = engineContextPrefix(h.context) + prompt;
            h.context = undefined;
        }
        // ‼️ AN ENGINE THAT CAN BE TOLD ITS OWN NAME IS TOLD IT (X-35). Gemini
        // takes `--session-id <uuid>` on a first turn, so the conversation's
        // identity is a FACT before a byte is sent instead of something learned
        // from a parser afterwards — which is what everything downstream (the
        // live row, the project stamp, the terminal binding) was waiting for.
        // Generated here rather than in the pure argv builder, and remembered on
        // the state so a retried turn does not invent a second conversation.
        const preset = h.engine.id === 'gemini' && !threadOf(h) && !h.state.sessionId
            ? (h.gemini = { ...(h.gemini ?? newGeminiState()), sessionId: newUuid() }).sessionId
            : undefined;
        const args = turnArgs(h.engine.id, {
            thread: preset ? undefined : (threadOf(h) ?? h.state.sessionId),
            newThread: preset,
            model: h.state.model,
            effort: h.state.effort,
            permissionMode: h.state.permissionMode,
            cwd: h.state.cwd,
            // ‼️ An image cannot be described, it has to be SEEN, and Codex takes
            // one the only way it offers: as a file it opens itself. Every other
            // kind of attachment travels as a path inside the prompt, the same
            // judgement the Claude side makes (see Attachment). Antigravity has
            // no image flag at all, and `enginePromptText` has already put the
            // picture's path in the prompt for it.
            images: attachments.filter(a => a.kind === 'image').map(a => a.path)
        });
        // ‼️ WHERE THE PROMPT GOES IS THE ENGINE'S ANSWER, NOT A HABIT (measured
        // per engine — see EngineTransport.promptOn). Codex reads it from stdin
        // and would otherwise wait for a second copy; `agy` takes it as the value
        // of `--print` and refuses an empty one.
        const inArgv = h.engine.promptOn === 'argv';
        const spawnArgs = inArgv ? ['--print', prompt, ...args] : args;
        let child: cp.ChildProcess;
        try {
            // ‼️ AND WHETHER A SHELL SEES THAT COMMAND LINE FOLLOWS FROM IT.
            // `claude` and `codex` are shims on Windows and need one; nothing
            // user-typed reaches their command line. `agy` is a real .exe AND
            // carries the message in argv, so a shell here would destroy any
            // multi-line prompt — it is spawned without one and the argument
            // arrives byte-for-byte.
            child = cp.spawn(h.engine.exe, spawnArgs, {
                cwd: h.state.cwd, shell: h.engine.spawnShell, windowsHide: true,
                stdio: ['pipe', 'pipe', 'pipe']
            });
        } catch (e) {
            this.mutate(id, s => ({
                ...s, status: 'idle', lastTs: Date.now(),
                messages: [...s.messages, {
                    id: `err-${Date.now().toString(36)}`, ts: Date.now(),
                    role: 'error', text: `${h.engine.exe} could not be started: ${String(e)}`
                }]
            }));
            return false;
        }
        h.child = child;
        h.buffer = '';
        h.turn = { prompt, attachments, tries: (h.turn?.tries ?? 0), stderr: '' };

        this.readStdout(id, child);
        // ‼️ STDERR IS COLLECTED, NOT PRINTED AS IT ARRIVES. A per-turn engine
        // writes its whole diagnosis to stderr and then exits, and the LAST
        // thing it says is the one that matters — printing each chunk as its own
        // row gave three lines of stack for one fault, and made it impossible to
        // decide (at `close`) whether the fault was a retryable one.
        child.stderr?.on('data', d => {
            const cur = this.sessions.get(id);
            if (!cur || cur.closed || !cur.turn) { return; }
            cur.turn.stderr = (cur.turn.stderr + String(d)).slice(-4000);
        });
        child.on('error', e => {
            if (this.sessions.get(id)?.closed) { return; }
            this.endTurn(id, `the turn could not be run: ${String((e as Error).message ?? e)}`);
        });
        child.on('close', code => {
            const cur = this.sessions.get(id);
            if (!cur || cur.closed) { return; }
            // ‼️ A LATE CLOSE FROM A PROCESS THAT IS NO LONGER THIS SESSION'S IS
            // NOT THIS TURN'S DEATH. A per-turn engine lingers after it has
            // answered, so the previous turn's process can outlive the start of
            // the next one — and its `close`, read as the current turn's, wrote
            // "the engine stopped without finishing the turn" across a turn that
            // was running perfectly well.
            if (cur.child && cur.child !== child) { return; }
            cur.child = undefined;
            const said = (cur.turn?.stderr ?? '').trim();

            // ‼️ THE ONE FAILURE THAT IS NOT A FAILURE — AND THE ENGINE NAMES IT
            // ITSELF, WHICH IS THE ONLY REASON THIS IS A RETRY AND NOT A GUESS:
            //   thread-store conflict: thread <id> already has an active writer
            // The previous turn's process has exited, its `close` has fired, and
            // its hold on the thread store is STILL being released — measured
            // end to end on this machine, on the first real two-turn run. There
            // is no signal to wait on other than trying again, so it is tried
            // again, a bounded number of times, on the same prompt, and nothing
            // about it reaches the conversation unless it keeps failing.
            const conflict = /thread-store conflict|already has an active writer/i.test(said);
            const tries = cur.turn?.tries ?? 0;
            if (code !== 0 && conflict && tries < RESUME_RETRIES && cur.turn) {
                const again = { ...cur.turn, tries: tries + 1 };
                cur.turn = again;
                setTimeout(() => {
                    const now = this.sessions.get(id);
                    if (!now || now.closed || now.child) { return; }
                    now.turn = again;
                    this.runTurn(id, again.prompt, again.attachments);
                }, RESUME_RETRY_MS * (tries + 1));
                return;
            }

            if (code !== 0 && said) {
                // The ENGINE'S OWN WORDS. `os error 10013` is the difference
                // between "Codex is broken" and "your security software is
                // refusing the socket", and a tidied message throws that away.
                const last = said.split(/\r?\n/).filter(l => l.trim()).slice(-1)[0] ?? said;
                this.mutate(id, s => ({
                    ...s, lastTs: Date.now(),
                    messages: [...s.messages, {
                        id: `err-${Date.now().toString(36)}`, ts: Date.now(),
                        role: 'error', text: last.trim().slice(0, 400)
                    }]
                }));
            }
            // ‼️ AND HERE — NOT AT `turn.completed` — IS WHERE THE TURN ENDS.
            // The state was held at `working` for as long as this process lived
            // (see onData), because that is exactly how long the session could
            // not run another turn. Now it can.
            if (cur.turn?.reported) {
                this.mutate(id, s => ({ ...s, status: 'idle', lastTs: Date.now() }));
            } else {
                this.endTurn(id, code === 0
                    ? 'the engine stopped without finishing the turn'
                    : `the turn did not run (exit ${code})`);
            }
            cur.turn = undefined;
            // ‼️ X-43 — THE LAST MANDATORY READING. The rollout's final
            // `token_count` line can be written after the answer has streamed,
            // so the figure the card settles on has to be taken once the writer
            // is actually gone. Forced past the throttle for that reason.
            if (this.pollCodexContext(cur, true)) { this.fire(id); }
            // …and only NOW is the thread free for the next one (see releasePerTurn).
            this.releasePerTurn(id);
        });

        try {
            // The prompt is already in argv on an engine that takes it there;
            // stdin is still closed, because a pipe left open is a process that
            // may sit waiting for input nobody is going to send.
            if (!inArgv) { child.stdin?.write(prompt); }
            child.stdin?.end();
        } catch {
            this.endTurn(id, 'the prompt could not be delivered');
            return false;
        }
        return true;
    }

    /**
     * The project brief as TEXT, for an engine with no system-prompt flag.
     *
     * The same file the Claude path hands over on the command line — written by
     * the same call, so the two engines are told the same thing and a brief that
     * changed is current on both. Unreadable is not an error worth stopping a
     * session for: the session simply starts unbriefed, which is the state it
     * would have been in with no project at all.
     */
    private readProjectContext(projectId: string | undefined): string | undefined {
        const file = this.projectContextFile(projectId);
        if (!file) { return undefined; }
        try { return fs.readFileSync(file, 'utf8').trim() || undefined; } catch { return undefined; }
    }

    /** Close a per-turn engine's turn that ended without saying so. The SESSION
     *  survives — the thread is in the CLI's store and the next message resumes
     *  it, which is exactly the state a reader should be left in. */
    /**
     * ‼️ K-27 — AND IT SAYS HOW THE TURN ENDED, which it used to leave to the
     * turn BEFORE it.
     *
     * A turn that dies here never reaches the `result` reducer — on a per-turn
     * engine there is no result line to read, because Stop kills the process —
     * so `lastTurn` kept whatever the previous turn had put there and the strip
     * above the composer described a turn that was two turns old. The word is
     * passed in rather than guessed: only the caller knows whether a person
     * pressed Stop or the engine fell over.
     */
    private endTurn(id: string, why: string, outcome: 'interrupted' | 'failed' = 'failed'): void {
        this.mutate(id, s => {
            const now = Date.now();
            const spent = s.turnTokensAt !== undefined
                ? Math.max(0, s.tokens - s.turnTokensAt)
                : undefined;
            return {
                ...s, status: 'idle', lastTs: now,
                turnStartedAt: undefined, turnTokensAt: undefined,
                lastTurn: {
                    endedAt: now,
                    ms: s.turnStartedAt ? Math.max(0, now - s.turnStartedAt) : undefined,
                    tokens: spent || undefined,
                    wTokens: Math.round(s.turnWTokens ?? 0) || undefined,
                    cost: 0,
                    apiCalls: s.turnApiCalls || undefined,
                    steps: s.turnSteps || undefined,
                    thinking: s.turnThinking || undefined,
                    outcome,
                    model: s.turnModel, effort: s.turnEffort
                },
                messages: [...s.messages, {
                    id: `err-${now.toString(36)}`, ts: now,
                    role: 'error', text: why
                }]
            };
        });
    }

    /**
     * "What are you really running on?" — `get_settings`, the CLI's own answer.
     *
     * ‼️ THE PANEL USED TO ANSWER THIS FROM ITS OWN PICKERS, WHICH IS TO SAY IT
     * COULD NOT ANSWER IT AT ALL. A picker left on "Default" — the normal case
     * — means "pass no flag", so the strip above the composer had nothing to
     * print and printed nothing, while the turn it was pricing ran on a real
     * model at a real effort resolved from the settings chain. The CLI resolves
     * that chain itself and will state the result; asking is free (a local
     * question about local settings: no tokens, no API call).
     *
     * Asked at the start of the session and again at the start of every turn,
     * tagged with that turn's clock so a late answer cannot relabel the next
     * turn (see pendingSettings). A CLI too old to know the subtype answers
     * `error`, which changes nothing and is never shown.
     */
    private askSettings(id: string, turnStartedAt?: number): void {
        const h = this.sessions.get(id);
        if (!h) { return; }
        // A per-turn engine has no live control channel to ask on, and nothing
        // to resolve: the flags of the turn about to start ARE what it runs on.
        // OpenCode HAS a channel and it is not this one — `get_settings` is
        // Claude's control vocabulary, and the same question is answered there by
        // the `configOptions` every `session/new` and `session/set_config_option`
        // volunteers (see applyOpencodeConfig).
        if (h.engine.shape !== 'persistent') { return; }
        const requestId = `settings-${++h.reqSeq}`;
        if (!this.write(id, controlLine(requestId, 'get_settings'))) { return; }
        h.state = { ...h.state, pendingSettings: { requestId, turnStartedAt } };
    }

    private mutate(id: string, fn: (s: ConsoleSessionState) => ConsoleSessionState): void {
        const h = this.sessions.get(id);
        if (!h) { return; }
        h.state = fn(h.state);
        this.fire(id);
    }

    /**
     * ‼️ U-36 — A CHUNK BOUNDARY IS NOT A CHARACTER BOUNDARY.
     *
     * `String(buffer)` decodes each chunk on its own, and a chunk ends
     * wherever the pipe happened to flush — which on a Turkish reply lands
     * in the middle of a two-byte `ü` / `ı` / `ş` often enough to see. The
     * two halves each decode to U+FFFD and the user reads `hazır\uFFFD\uFFFDm`.
     * Nothing upstream is wrong: the engine sent correct UTF-8 and this
     * reader cut it.
     *
     * `StringDecoder` is the fix and the whole of it: it holds an incomplete
     * trailing sequence back until the next chunk completes it. One decoder
     * per child, because the held bytes belong to that stream — sharing one
     * across sessions would splice two conversations together at a boundary.
     *
     * It is not engine-specific and never was: Claude simply got lucky more
     * often, because its stream-json lines are shorter and flush on their own
     * newlines. The same cut was always possible there.
     */
    private readStdout(id: string, child: cp.ChildProcess): void {
        const decoder = new StringDecoder('utf8');
        child.stdout?.on('data', (d: Buffer | string) => this.onData(
            id, typeof d === 'string' ? d : decoder.write(d)));
        // Whatever the last chunk left dangling is not a character and never
        // will be; flushing it keeps a truncated stream from swallowing its
        // final line rather than merely mangling one glyph.
        child.stdout?.on('end', () => {
            const tail = decoder.end();
            if (tail) { this.onData(id, tail); }
        });
    }

    private onData(id: string, chunk: string): void {
        const h = this.sessions.get(id);
        if (!h || h.closed) { return; }
        h.buffer += chunk;
        const lines = h.buffer.split('\n');
        h.buffer = lines.pop() ?? '';
        let changed = false;
        const now = Date.now();
        for (const line of lines) {
            if (!line.trim()) { continue; }
            let parsed: unknown;
            try { parsed = JSON.parse(line); } catch { continue; }
            // ‼️ ANOTHER ENGINE IS A TRANSLATION, NOT ANOTHER REDUCER. Neither
            // Codex (codexproto.ts) nor Antigravity (agyproto.ts) shares a single
            // field name with Claude's stream, so their lines are turned into the
            // events this reducer already understands and everything downstream —
            // state, panel, cost strip, transcript — stays one code path. That is
            // what makes a third engine a file rather than a fork.
            if (h.engine.shape === 'perTurn') {
                const events = h.engine.id === 'agy'
                    ? (() => {
                        const t = translateAgy(h.agy ?? newAgyState(), parsed, { model: h.state.model });
                        h.agy = t.state;
                        return t.events;
                    })()
                    : h.engine.id === 'gemini'
                        ? (() => {
                            const t = translateGemini(
                                h.gemini ?? newGeminiState(), parsed, { model: h.state.model });
                            h.gemini = t.state;
                            return t.events;
                        })()
                        : (() => {
                            const t = translateCodex(h.codex ?? newCodexState(), parsed, { model: h.state.model });
                            h.codex = t.state;
                            return t.events;
                        })();
                for (const ev of events) {
                    const rr = reduceEvent(h.state, ev, now);
                    h.state = rr.state;
                    changed = changed || rr.changed;
                    // ‼️ K-22 — a bypassed session answers its own permission
                    // request. The reducer built the answer; only the host can
                    // put it on the wire, and it must go out on the same pass
                    // or the turn waits on a window nobody will ever see.
                    const auto = drainAutoAnswer(h.state);
                    if (auto.line) {
                        h.state = auto.state;
                        this.write(id, auto.line);
                    }
                    // The engine SAID the turn is finished. Remembered because
                    // the process's own exit can no longer be read as the end
                    // (see the note below) and something has to tell an ordinary
                    // ending apart from a death.
                    if ((ev as { type?: string }).type === 'result' && h.turn) {
                        h.turn.reported = true;
                    }
                }
                // ‼️ X-43 — and the window is asked for on the way past. The
                // rollout is being appended to WHILE the turn runs, so this is a
                // live reading and not an end-of-turn one; the probe's own
                // throttle (700 ms) and mtime cache mean a chatty turn does not
                // turn into a disk read per line. Forced when the turn is over,
                // because that is the moment the file has just been given its
                // last word and the card is about to be looked at.
                changed = this.pollCodexContext(
                    h, h.state.status === 'idle' || !h.child) || changed;
                // ‼️ THE TURN IS NOT OVER UNTIL THE PROCESS IS GONE, AND THE
                // ENGINE SAYS OTHERWISE FIVE SECONDS EARLY.
                //
                // Measured end to end on this machine: `turn.completed` is
                // printed, the answer is complete — and `codex exec` then lives
                // on for another ~5.4 SECONDS, holding the thread's writer lock
                // the whole time. A turn started in that window is refused
                // outright (`thread-store conflict: … already has an active
                // writer`), so a session that called itself idle was a session
                // that accepted a message it could not run.
                //
                // Holding the state at `working` is not cosmetic: `acceptUserText`
                // only HONOURS a hold while the status is working (an idle
                // session starts a turn whatever the caller asked for), so this
                // one line is what makes the queue, the release and the whole
                // per-turn transport correct rather than racing.
                if (h.child && h.state.status === 'idle') {
                    h.state = { ...h.state, status: 'working' };
                }
                continue;
            }
            const wanted = h.state.pendingPermissionMode?.mode;
            const r = reduceEvent(h.state, parsed, now);
            h.state = r.state;
            changed = changed || r.changed;
            // The nudge waits for the CLI's yes (see retryOnGrant). "Agreed"
            // means the pending switch resolved AND the mode really moved —
            // a refusal clears the pending field too, and must say nothing.
            if (wanted && !h.state.pendingPermissionMode && h.retryOnGrant) {
                const nudge = h.retryOnGrant;
                h.retryOnGrant = undefined;
                if (h.state.permissionMode === wanted) { this.send(id, nudge); }
            }
        }
        if (!changed) { return; }
        // a finished turn releases the next queued message
        if (h.state.status === 'idle' && h.state.queued.length) {
            const next = shiftQueued(h.state);
            h.state = next.state;
            if (next.text) {
                // …and a released message is a turn of its own, so it asks the
                // same question about itself (see askSettings)
                this.askSettings(id, h.state.turnStartedAt);
                this.write(id, userMessageLine(next.text));
            }
        }
        this.fire(id);
    }

    /**
     * ‼️ THE NEXT HELD MESSAGE, ON A PER-TURN ENGINE, RELEASED WHERE IT IS SAFE.
     *
     * Not where the persistent engine releases it. There the queue moves when
     * the reducer says the turn ended, because the process is still there to
     * take the next line. Here the process is the turn and it is still exiting
     * when it says it has finished — a spawn on that signal is refused by the
     * CLI for holding the thread twice. So the queue moves on the process's
     * DEATH, which is the only moment the thread is really free.
     */
    private releasePerTurn(id: string): void {
        const h = this.sessions.get(id);
        if (!h || h.closed || h.child || !h.state.queued.length) { return; }
        const next = shiftQueued(h.state);
        h.state = next.state;
        if (!next.text) { this.fire(id); return; }
        h.state = {
            ...h.state, status: 'working',
            turnStartedAt: Date.now(), turnTokensAt: h.state.tokens
        };
        this.fire(id);
        this.runTurn(id, enginePromptText(h.engine.id, next.text));
    }

    private write(id: string, line: string): boolean {
        const h = this.sessions.get(id);
        if (!h || h.closed) { return false; }
        if (!h.child?.stdin || h.child.stdin.destroyed) { return false; }
        try { h.child.stdin.write(line); return true; } catch { return false; }
    }

    /**
     * Say something. While a turn runs this goes INTO that turn (the CLI
     * delivers it at the turn's next step — measured, see acceptUserText);
     * `hold` instead parks it in the queue until the turn ends.
     */
    send(
        id: string, text: string, hold = false, attachments: Attachment[] = []
    ): { queued: boolean; refused?: string } | undefined {
        const h = this.sessions.get(id);
        if (!h || h.state.status === 'ended' || h.state.status === 'error') { return undefined; }
        let ready: Attachment[] = [];
        if (attachments.length) {
            // The queue carries strings (shiftQueued/takeQueued), so a held
            // message cannot hold a file. Refusing beats dropping it silently.
            if (hold) {
                return { queued: false, refused: 'A message with attachments cannot be held — send it, or remove the files first.' };
            }
            const loaded = this.loadAttachments(attachments);
            if (loaded.refused) { return { queued: false, refused: loaded.refused }; }
            ready = loaded.ready;
        }
        const notes: AttachmentNote[] = ready.map(a => ({ name: a.name, kind: a.kind, path: a.path, bytes: a.bytes }));
        const startedBefore = h.state.turnStartedAt;
        // ‼️ YOU CANNOT SPEAK INTO A TURN THAT IS A PROCESS. Claude's session is
        // a live pipe, so a message said mid-turn is delivered at the turn's next
        // step ("steering"). A Codex turn is `codex exec` with its stdin already
        // closed — there is nowhere to put the words. Rather than accept them and
        // lose them, they are HELD, which is a state the composer already draws
        // and the reader can already act on.
        const perTurn = h.engine.shape === 'perTurn';
        // ‼️ AND THE THIRD SHAPE HOLDS FOR A DIFFERENT REASON, WHICH THE READER
        // IS TOLD RATHER THAN LEFT TO INFER. Codex holds because its stdin is
        // already closed. OpenCode's connection is wide open — it simply does not
        // declare a way to speak into a turn that is running, so a message sent
        // into one would be accepted by the pipe and dropped by the agent. Saying
        // "I steered it" there would be a lie with no error attached, which is
        // the worst kind; the message is HELD instead, which the composer already
        // draws and the reader can act on.
        const shared = h.engine.shape === 'sharedAcp';
        const busyShared = shared && !!h.opencode?.running;
        // ‼️ AND A TURN IS NOT OVER UNTIL ITS PROCESS IS GONE. Measured, and it
        // cost the first end-to-end run: `turn.completed` arrives while the
        // process is still shutting down and still holding the thread, so a
        // second turn spawned on the strength of that line is refused by the CLI
        //   `thread/resume failed: thread <id> already …`
        // and the conversation loses the message. On a persistent engine the
        // result line genuinely ends the turn, because the process stays; here
        // the process IS the turn, and `h.child` is what says it is still there.
        const holdNow = hold
            || (perTurn && (h.state.status === 'working' || !!h.child))
            // ‼️ …and a card whose session is still being opened holds too. There
            // is no `ses_…` to prompt yet, and a message sent into that gap would
            // be accepted and lost.
            || (shared && (busyShared || h.state.status === 'working' || h.state.status === 'starting'));
        const r = acceptUserText(h.state, text, Date.now(), holdNow, notes);
        h.state = r.state;
        // A NEW turn (not a message said into a running one) asks what it is
        // about to run on, and asks it BEFORE the prompt goes down the pipe —
        // the CLI is idle at that moment, so the answer comes straight back
        // (see askSettings). A per-turn engine has nobody to ask: the flags of
        // the turn about to start ARE the answer.
        if (!perTurn && !shared && h.state.turnStartedAt && h.state.turnStartedAt !== startedBefore) {
            this.askSettings(id, h.state.turnStartedAt);
        }
        if (r.send) {
            if (perTurn) {
                this.runTurn(id, enginePromptText(h.engine.id, text.trim(), ready), ready);
            } else if (shared) {
                this.promptShared(id, enginePromptText(h.engine.id, text.trim(), ready), ready);
            } else {
                this.write(id, userMessageLine(text.trim(), ready));
            }
        }
        this.fire(id);
        return { queued: !r.send };
    }

    /**
     * Turn the composer's list into something the stream can carry.
     *
     * ‼️ THE BYTES ARE READ HERE, AT SEND TIME — not when the file was hung on
     * the message. A file deleted or swapped in between is caught now, which is
     * the only moment where saying so is still useful.
     */
    private loadAttachments(list: Attachment[]): { ready: Attachment[]; refused?: string } {
        if (list.length > ATTACH_LIMITS.count) {
            return { ready: [], refused: `Too many files: ${list.length}, the limit is ${ATTACH_LIMITS.count}.` };
        }
        const ready: Attachment[] = [];
        let total = 0;
        for (const a of list) {
            let stat: fs.Stats;
            try { stat = fs.statSync(a.path); }
            catch { return { ready: [], refused: `This file is no longer there: ${a.name}` }; }
            // A folder is a perfectly good thing to point an agent at; it just
            // cannot be read as bytes, so it always travels as a path.
            if (stat.isDirectory()) {
                ready.push({ ...a, kind: 'path', bytes: 0, data: undefined, mediaType: undefined });
                continue;
            }
            if (a.kind !== 'image') { ready.push({ ...a, bytes: stat.size, data: undefined }); continue; }
            if (stat.size > ATTACH_LIMITS.perImageBytes) {
                return { ready: [], refused: `${a.name} is ${mb(stat.size)} — the limit per image is ${mb(ATTACH_LIMITS.perImageBytes)}.` };
            }
            total += stat.size;
            if (total > ATTACH_LIMITS.totalBytes) {
                return { ready: [], refused: `These files add up to more than ${mb(ATTACH_LIMITS.totalBytes)} — send them in two messages.` };
            }
            try { ready.push({ ...a, bytes: stat.size, data: fs.readFileSync(a.path).toString('base64') }); }
            catch { return { ready: [], refused: `This file could not be read: ${a.name}` }; }
        }
        return { ready };
    }

    /** Change a held message before it is said. Empty text drops it. */
    editQueued(id: string, index: number, text: string): boolean {
        const h = this.sessions.get(id);
        if (!h) { return false; }
        const r = editQueued(h.state, index, text);
        if (r.changed) { h.state = r.state; this.fire(id); }
        return r.changed;
    }

    /**
     * Take a held message out of the queue and return its text — the caller
     * decides what happens to it (the panel puts it back in the composer to be
     * edited; `releaseQueued` says it straight away).
     */
    takeQueued(id: string, index: number): string | undefined {
        const h = this.sessions.get(id);
        if (!h) { return undefined; }
        const r = takeQueued(h.state, index);
        if (r.text === undefined) { return undefined; }
        h.state = r.state;
        this.fire(id);
        return r.text;
    }

    /** Stop holding it: say it now, into the running turn. */
    releaseQueued(id: string, index: number): boolean {
        const text = this.takeQueued(id, index);
        if (text === undefined) { return false; }
        return !!this.send(id, text);
    }

    /**
     * Answer the question the turn is parked on (see ConsoleAsk).
     *
     * The line is written from the state the reducer produced, not from the
     * caller's own idea of what was pending, so two clicks on a repainted panel
     * can only answer once.
     */
    answer(id: string, decision: AskDecision): boolean {
        const h = this.sessions.get(id);
        if (!h?.state.pendingAsk) { return false; }
        const r = answerAsk(h.state, decision, Date.now());
        if (!r.line) { return false; }
        h.state = r.state;
        // ‼️ THE STATE CHANGE IS SHARED, THE WIRE IS NOT. `answerAsk` is pure and
        // can only produce Claude's control line; on the shared connection the
        // agent is waiting for one of the OPTION IDS it published, so the verdict
        // is carried across rather than the line (see opencodeOptionFor).
        const wrote = h.engine.shape === 'sharedAcp'
            ? this.answerOpencodeAsk(id,
                decision.kind === 'deny' ? 'reject'
                    : decision.kind === 'allow' && decision.always ? 'always' : 'allow')
            : this.write(id, r.line);
        this.fire(id);
        return wrote;
    }

    /**
     * Stop the running turn. The session survives — that is the whole point.
     *
     * ‼️ A parked question is answered FIRST. `interrupt` ends the turn, but a
     * `can_use_tool` the CLI is still waiting on belongs to the tool, not the
     * turn: leaving it unanswered parks the process on a request nobody will
     * ever send a response for, and Esc would look like it hung the session.
     */
    interrupt(id: string): boolean {
        const h = this.sessions.get(id);
        if (!h) { return false; }
        if (h.state.pendingAsk) {
            this.answer(id, { kind: 'deny', message: 'The user interrupted the turn.' });
        }
        // ‼️ ON A PER-TURN ENGINE, STOPPING THE TURN IS STOPPING THE PROCESS —
        // and the SESSION survives it, which is the whole reason this is safe:
        // the conversation lives in the CLI's own thread store and the next
        // message resumes it by id. There is no control channel to interrupt on
        // because there is no long-lived process to hold one.
        if (h.engine.shape === 'perTurn') {
            if (!h.child) { return false; }
            killTree(h.child);
            h.child = undefined;
            this.endTurn(id, 'turn interrupted', 'interrupted');
            return true;
        }
        /**
         * ‼️ K-25 — STOP ASKS THE ENGINE TO STOP, AND ONLY THE ENGINE.
         *
         * `session/cancel` was measured to end a real turn with `stopReason:
         * "cancelled"`, a zero usage and a conversation that took the next turn
         * on the same `ses_…`. Killing anything here would be wrong twice over:
         * the process is SHARED, so it would end every other card's turn as
         * well, and this card would lose a conversation that did not need to be
         * lost. The blunt path exists — it is the timer below — and it is what
         * happens only if the engine stops listening (OPENCODE_CANCEL_GRACE_MS).
         */
        if (h.engine.shape === 'sharedAcp') {
            const card = h.opencode;
            if (!card?.running || !h.state.sessionId) { return false; }
            const rt = this.runtime();
            if (!rt) { return false; }
            rt.cancel(h.state.sessionId);
            if (card.cancelTimer) { clearTimeout(card.cancelTimer); }
            h.opencode = {
                ...card,
                cancelTimer: setTimeout(() => {
                    const now = this.sessions.get(id);
                    if (!now?.opencode?.running || now.closed) { return; }
                    now.opencode = { ...now.opencode, cancelTimer: undefined };
                    this.mutate(id, s => ({
                        ...s, lastTs: Date.now(),
                        messages: [...s.messages, {
                            id: `err-${Date.now().toString(36)}`, ts: Date.now(), role: 'error',
                            text: 'OpenCode did not answer the stop request, so Agent Farm restarted the shared '
                                + 'runtime it owns. Every OpenCode card is being re-opened on the new one; '
                                + 'the conversations themselves are in OpenCode\'s own store and are safe.'
                        }]
                    }));
                    this.runtime()?.restart();
                }, OPENCODE_CANCEL_GRACE_MS)
            };
            this.mutate(id, s => ({ ...s, lastTs: Date.now() }));
            return true;
        }
        return this.write(id, controlLine(`int-${++h.reqSeq}`, 'interrupt'));
    }

    /**
     * Change the model this session answers with, mid-conversation — the same
     * thing `/model` does in a terminal (see consoleproto's header note).
     *
     * The switch is recorded as *pending* and only becomes the session's model
     * when the CLI answers, because a `set_model` the CLI rejects must not
     * leave the panel claiming a model that is not being used.
     */
    setModel(id: string, model: string): boolean {
        const h = this.sessions.get(id);
        if (!h || !model.trim()) { return false; }
        /**
         * ‼️ K-25 — A LIVE CONTROL THAT IS STILL NOT A MID-TURN ONE.
         *
         * This engine really does take the change on the open connection
         * (`session/set_config_option`), so it is neither Claude's "ask the CLI
         * now" nor Codex's "the next process's flags". What it is not is a
         * change to a turn that is already running: the protocol offers no such
         * thing, and applying one anyway is how an answer changes model half way
         * through. So a change asked for mid-turn is HELD to the boundary and
         * said out loud — a picker that appeared to work and did nothing is the
         * exact failure the `configId` trap already set once.
         */
        if (h.engine.shape === 'sharedAcp') {
            const want = model.trim();
            if (h.opencode?.running) {
                h.opencode = { ...h.opencode, pending: { ...h.opencode.pending, model: want } };
                this.mutate(id, s => ({
                    ...s, lastTs: Date.now(),
                    messages: [...s.messages, {
                        id: `sys-${Date.now().toString(36)}`, ts: Date.now(), role: 'system',
                        text: `model will become "${want}" when this turn ends — OpenCode cannot change the model of a turn that is running`
                    }]
                }));
                return true;
            }
            void this.applyOpencodeConfig(id, { model: want }, false);
            return true;
        }
        // ‼️ NOTHING IS PENDING ON AN ENGINE WITH NO LIVE CONTROLS. There is no
        // CLI to accept or refuse the switch: the next turn is a new process and
        // it will be started with this flag, so the change is already true. A
        // `pendingModel` here would be a panel waiting for an answer that can
        // never come.
        if (!h.engine.liveControls) {
            this.mutate(id, s => ({ ...s, model: model.trim() }));
            return true;
        }
        const requestId = `model-${++h.reqSeq}`;
        if (!this.write(id, controlLine(requestId, 'set_model', { model: model.trim() }))) { return false; }
        this.mutate(id, s => ({ ...s, pendingModel: { requestId, model: model.trim() } }));
        return true;
    }

    /**
     * Change how hard this session thinks, mid-conversation — the same thing
     * `/effort` does in a terminal, and by the same means: `/effort` is itself
     * an `apply_flag_settings` control request (see consoleproto's header).
     *
     * An empty value means "back to the CLI's own default" and travels as an
     * explicit null, because leaving the key out would change nothing at all.
     * Like `setModel`, the switch is recorded as *pending* and only becomes the
     * session's effort when the CLI answers.
     */
    setEffort(id: string, effort: string): boolean {
        const h = this.sessions.get(id);
        if (!h) { return false; }
        const want = effort.trim();
        // see setModel — the next turn's flags are the control
        if (!h.engine.liveControls) {
            this.mutate(id, s => ({ ...s, effort: want }));
            return true;
        }
        const requestId = `effort-${++h.reqSeq}`;
        if (!this.write(id, controlLine(requestId, 'apply_flag_settings', {
            settings: { effortLevel: want || null }
        }))) { return false; }
        this.mutate(id, s => ({ ...s, pendingEffort: { requestId, effort: want } }));
        return true;
    }

    /**
     * Grant (or narrow) what this session may do, live — the standing RULE, as
     * opposed to `answer`, which settles one specific request.
     *
     * ‼️ THE CLI CAN SAY NO, AND USED TO SAY IT INTO A VOID. Like `setModel`
     * and `setEffort`, the switch is now recorded as PENDING and only becomes
     * the session's mode when the CLI answers — and a refusal becomes a line in
     * the conversation instead of a picker that quietly snaps back (see
     * `pendingPermissionMode` in consoleproto). `true` here means the request
     * went out, which is all a write can honestly claim; whether the mode
     * changed is answered later, on the wire.
     */
    setPermissionMode(id: string, mode: string, retryMessage?: string): boolean {
        const h = this.sessions.get(id);
        if (!h) { return false; }
        // ‼️ ON THIS ENGINE THE MODE IS THE AGENT — `build` executes tools under
        // its configured permissions, `plan` disallows every edit tool — and it
        // is session config, so it moves on the live connection at the turn
        // boundary exactly as the model does. What is recorded on the card as
        // well is what "bypass" means HERE: not a flag handed to a process, but
        // Agent Farm answering the engine's own questions (see startShared).
        if (h.engine.shape === 'sharedAcp') {
            const want = opencodePermissionFor(mode).mode;
            this.mutate(id, s => ({
                ...s, permissionMode: mode,
                enforcedPermissionMode: mode,
                permissionWhy: this.opencodePermissionWhy(mode)
            }));
            if (h.opencode?.running) {
                h.opencode = { ...h.opencode, pending: { ...h.opencode.pending, mode: want } };
                return true;
            }
            void this.applyOpencodeConfig(id, { mode: want }, true);
            return true;
        }
        // ‼️ On a per-turn engine the mode is a SANDBOX chosen when the next
        // process starts (see codexSandboxFor), so it takes effect on the next
        // turn and not on the one already running — and a retry nudge would be
        // sent into a turn that is still running under the OLD sandbox, which
        // would simply fail again. The change is recorded; nothing is said.
        if (!h.engine.liveControls) {
            this.mutate(id, s => ({ ...s, permissionMode: mode }));
            return true;
        }
        const requestId = `mode-${++h.reqSeq}`;
        if (!this.write(id, controlLine(requestId, 'set_permission_mode', { mode }))) { return false; }
        h.state = { ...h.state, pendingPermissionMode: { requestId, mode } };
        h.retryOnGrant = retryMessage?.trim() || undefined;
        this.fire(id);
        return true;
    }

    /** Drop the queue without touching the running turn. */
    clearQueue(id: string): void {
        this.mutate(id, s => ({ ...s, queued: [] }));
    }

    /**
     * ‼️ K-23 — AN OLDER PIECE OF THE TRANSCRIPT, IN FRONT OF WHAT IS ALREADY
     * THERE.
     *
     * The one rule that matters is the one S-30 states for resumeMessages: the
     * same turn read twice is a duplicated conversation. Here it is enforced by
     * IDENTITY rather than by choosing a winner — every scrollback row is named
     * by its position in the file, so a row this card already holds is simply
     * not added. The head row (`xh-start` / `h0`) is not content; it is the
     * marker that says how much is still above, and the caller's new one
     * replaces it.
     *
     * Returns how many rows were really added, so a caller can tell "there was
     * nothing left" from "it worked".
     */
    prependHistory(id: string, head: ConsoleMessage, rows: ConsoleMessage[]): number {
        const h = this.sessions.get(id);
        if (!h) { return 0; }
        const seen = new Set(h.state.messages.map(m => m.id));
        const add = rows.filter(m => !seen.has(m.id));
        if (!add.length) { return 0; }
        const body = h.state.messages.filter(m => m.id !== head.id);
        h.state = { ...h.state, messages: [head, ...add, ...body] };
        this.fire(id);
        return add.length;
    }

    /**
     * End one session's process — the whole tree.
     *
     * `shell: true` means the child we hold is the shell wrapper, not `claude`
     * itself: killing it leaves the real process running, orphaned, holding its
     * entry in the CLI's session registry. That entry is what tells everyone
     * "this session is open", so a leak here shows up as sessions that stay
     * un-resumable for hours after they were closed. Kill the tree.
     *
     * Calling it twice is allowed and re-issues the kill — a second press is
     * somebody telling us the first one did not take, and refusing it would
     * turn the safety net into a dead button. Only the parts that must happen
     * once (denying the parked question) are skipped on the repeat.
     *
     * ‼️ S-29 (reopened) — THE CARD TURNS THE MOMENT YOU PRESS IT.
     *
     * Everything here used to run before the state changed, and the last two
     * steps SPAWN PROCESSES: `taskkill` for the tree, and another for the pid
     * the CLI registry names. `child_process` spawning is asynchronous in its
     * result and synchronous in its cost — `uv_spawn` blocks the extension
     * host while Windows creates the process, and on a machine where a virus
     * scanner inspects every launch that is not milliseconds. So the click sat
     * there, twice, and only then did the panel hear that anything had
     * happened: End session took seconds to do something the user had already
     * decided.
     *
     * The order is now: shut the pipe (which MUST stay before the kill — see
     * below), say the session ended, and reap the processes on the next tick.
     * Nothing about the outcome changes; what changes is that the repaint no
     * longer waits behind two process launches.
     *
     * `sync` is the one caller that cannot wait a tick: `dispose()` runs while
     * the window is closing, and a deferred kill there would never run at all —
     * which is precisely the orphaned-`claude` leak this method exists for.
     * `silent` belongs to `forget`, which fires its own change straight after
     * and would otherwise repaint the whole panel twice for one gesture.
     */
    close(id: string, o?: { sync?: boolean; silent?: boolean }): void {
        const h = this.sessions.get(id);
        if (!h) { return; }
        const again = h.closed === true;
        // A question still on the table is answered before the pipe goes: the
        // process is about to be killed either way, but a session ending on an
        // unanswered request writes that half-finished tool call into the
        // transcript, and a resume then reads back a turn that never resolved.
        if (!again && h.state.pendingAsk) {
            this.answer(id, { kind: 'deny', message: 'The session was closed.' });
        }
        /**
         * ‼️ K-25 — ENDING A CARD MUST NOT END ANYBODY ELSE'S TURN.
         *
         * There is no process of this session's to kill, and killing the shared
         * one would take every other OpenCode conversation with it. So the card
         * detaches: the runtime tells the agent the session is closed if the
         * build offers a way to, and stops the process only when the LAST card
         * has gone — which is the asymmetry the shared shape is for.
         */
        if (h.engine.shape === 'sharedAcp') {
            if (h.opencode?.cancelTimer) { clearTimeout(h.opencode.cancelTimer); }
            if (h.opencode) { h.opencode = { ...h.opencode, cancelTimer: undefined, running: false }; }
            if (h.state.sessionId) { this.opencodeRt?.detach(h.state.sessionId); }
        }
        // ‼️ END MEANS END, AND THE PIPE IS SHUT BEFORE THE KILL — NOT AFTER.
        // `taskkill` is asynchronous and a process that is dying still has
        // everything it already wrote sitting in the pipe. Those lines kept
        // arriving at `onData`, where reduceEvent read them as an ordinary
        // running turn and moved `status` off 'ended': the button flipped to
        // "Remove from list", the agent went on talking for another few
        // seconds, and the button came back as "End session". It looked like
        // the button had not worked — it had, and then the drain undid it.
        // Nothing is read from a session that has been ended.
        h.closed = true;
        // ‼️ A per-turn engine BETWEEN turns has no process at all, and that is
        // a live session rather than a broken one — so every step here tolerates
        // its absence instead of assuming a child that a Codex session only has
        // while it is actually answering.
        try { h.child?.stdout?.removeAllListeners('data'); h.child?.stdout?.destroy(); } catch { /* already gone */ }
        try { h.child?.stderr?.removeAllListeners('data'); h.child?.stderr?.destroy(); } catch { /* already gone */ }
        try { h.child?.stdin?.end(); } catch { /* already gone */ }
        // …and the process the CLI itself registered for this session. A
        // `claude` that survives its window keeps that registry entry, which
        // tells everyone the session is open — and Claude Code cannot join a
        // session another process holds, so a survivor does not just leak, it
        // makes the conversation UNREACHABLE. Killing it by name closes that
        // gap even when the shell tree above has already fallen apart.
        // …and only for the engine that keeps such a registry. A per-turn engine
        // registers nothing between turns, so there is nobody to look up.
        const child = h.child;
        const sid = h.engine.shape === 'persistent' ? h.state.sessionId : undefined;
        const reap = (): void => {
            if (child) { killTree(child); }
            const pid = sid ? this.ownerPid(sid) : undefined;
            if (pid && pid !== child?.pid) { killPid(pid); }
            /**
             * ‼️ S-29 (V3) — "ended" IS A CLAIM ABOUT A PROCESS, SO IT IS CHECKED.
             *
             * The card turns grey BEFORE the kill on purpose: the button has to
             * answer the moment it is pressed, and `taskkill` on this machine
             * takes seconds. But that leaves the one thing the card must never
             * do — say "ended" while the CLI is still running and still holding
             * the session id, which is the state where a resume then fails with
             * nothing on screen to explain it. So the kill is verified once, a
             * beat later, and a survivor is written on the row instead of being
             * left to the user to discover.
             */
            setTimeout(() => {
                const still = sid ? this.ownerPid(sid) : undefined;
                const alive = (child ? child.exitCode === null && child.signalCode === null : false)
                    || (still !== undefined && still !== 0);
                if (!alive) { return; }
                const h2 = this.sessions.get(id);
                if (!h2 || h2.state.status !== 'ended') { return; }
                this.mutate(id, s => ({
                    ...s,
                    exitReason: `${s.exitReason ?? 'closed by you'}`
                        + ' — ‼️ the process did not stop: it is still holding this session,'
                        + ' so resuming it will be refused until it goes. Close it from Task Manager.'
                }));
            }, 4000);
        };
        // Say it first (unless the caller is about to say something louder),
        // then reap. See the note above: the reap spawns processes.
        if (o?.silent) {
            h.state = { ...h.state, status: 'ended', exitReason: h.state.exitReason ?? 'closed by you' };
        } else {
            this.mutate(id, s => ({ ...s, status: 'ended', exitReason: s.exitReason ?? 'closed by you' }));
        }
        if (o?.sync) { reap(); } else { setImmediate(reap); }
    }

    /**
     * Forget an ended session (its transcript stays on disk).
     *
     * ‼️ S-29 (reopened) — ONE GESTURE, ONE REPAINT. Removing a card that was
     * still live ended it first and let `close` fire its own change, so the
     * panel rebuilt itself twice for one right-click: once for a card that had
     * turned grey and once for a card that was gone. The Console's repaint
     * redraws the whole conversation, which is the expensive thing on the page.
     */
    forget(id: string): void {
        const h = this.sessions.get(id);
        if (!h) { return; }
        if (h.state.status !== 'ended' && h.state.status !== 'error') {
            this.close(id, { silent: true });
        }
        this.sessions.delete(id);
        this.fire(id);
    }

    dispose(): void {
        // ‼️ Synchronously: the window is going away, and a kill deferred to a
        // tick that never comes is the orphaned-process leak, not a fast panel.
        for (const id of [...this.sessions.keys()]) { this.close(id, { sync: true, silent: true }); }
        this.sessions.clear();
        // …and the one process no session owns. `close` above detaches each card
        // and stops it when the last goes, but a window closing with no OpenCode
        // card open must still not leave 383 MB behind.
        this.opencodeRt?.dispose();
        this.opencodeRt = undefined;
        this.listeners = [];
    }
}
