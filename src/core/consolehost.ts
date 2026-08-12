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
import * as path from 'path';
import { StringDecoder } from 'string_decoder';
import { AgyState, newAgyState, translateAgy } from './agyproto';
import { CodexState, codexTotalsFromUsage, newCodexState, translateCodex } from './codexproto';
import { GeminiState, newGeminiState, translateGemini } from './geminiproto';
import {
    EngineId, EngineTransport, engineContextPrefix, engineOf, enginePromptText, turnArgs
} from './consoleEngine';
import {
    acceptUserText, answerAsk, AskDecision, Attachment, AttachmentNote, ATTACH_LIMITS,
    CarriedTotals, ConsoleMessage, ConsoleSessionState, controlLine, editQueued, hostArgs,
    IMAGE_MEDIA_TYPES, newSessionState, reduceEvent, shiftQueued, takeQueued, userMessageLine
} from './consoleproto';

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
            () => undefined
    ) {}

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

    /** Start a hosted session. Returns our id; the CLI's own id arrives later. */
    start(init: HostedSessionInit): string {
        const seat = init.resume ? this.seatFor(init.resume) : undefined;
        if (seat?.live) { return seat.id; }
        const id = seat ? seat.id : `cs${++this.seq}-${Date.now().toString(36)}`;
        // The grey card's process is long gone; what is dropped here is the
        // record of it, a line before the new one takes the same seat.
        if (seat) { this.sessions.delete(seat.id); }
        const projectId = init.projectId ?? this.activeProjectId();
        const engine = engineOf(init.engine);
        if (engine.shape === 'perTurn') { return this.startPerTurn(id, engine, init, projectId); }
        const args = hostArgs({ ...init, projectContextFile: this.projectContextFile(projectId) });
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
        const hosted: Hosted = {
            // The earlier conversation goes in as messages, nothing more: it is
            // never written to stdin, so it costs nothing and the model's own
            // context comes from --resume, not from here.
            state: init.history?.length ? { ...base, messages: init.history } : base,
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
        id: string, engine: EngineTransport, init: HostedSessionInit, projectId: string | undefined
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
        const hosted: Hosted = {
            state: {
                ...(init.history?.length ? { ...base, messages: init.history } : base),
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
    private endTurn(id: string, why: string): void {
        this.mutate(id, s => ({
            ...s, status: 'idle', lastTs: Date.now(),
            turnStartedAt: undefined, turnTokensAt: undefined,
            messages: [...s.messages, {
                id: `err-${Date.now().toString(36)}`, ts: Date.now(),
                role: 'error', text: why
            }]
        }));
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
        if (h.engine.shape === 'perTurn') { return; }
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
                    // The engine SAID the turn is finished. Remembered because
                    // the process's own exit can no longer be read as the end
                    // (see the note below) and something has to tell an ordinary
                    // ending apart from a death.
                    if ((ev as { type?: string }).type === 'result' && h.turn) {
                        h.turn.reported = true;
                    }
                }
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
        // ‼️ AND A TURN IS NOT OVER UNTIL ITS PROCESS IS GONE. Measured, and it
        // cost the first end-to-end run: `turn.completed` arrives while the
        // process is still shutting down and still holding the thread, so a
        // second turn spawned on the strength of that line is refused by the CLI
        //   `thread/resume failed: thread <id> already …`
        // and the conversation loses the message. On a persistent engine the
        // result line genuinely ends the turn, because the process stays; here
        // the process IS the turn, and `h.child` is what says it is still there.
        const holdNow = hold || (perTurn && (h.state.status === 'working' || !!h.child));
        const r = acceptUserText(h.state, text, Date.now(), holdNow, notes);
        h.state = r.state;
        // A NEW turn (not a message said into a running one) asks what it is
        // about to run on, and asks it BEFORE the prompt goes down the pipe —
        // the CLI is idle at that moment, so the answer comes straight back
        // (see askSettings). A per-turn engine has nobody to ask: the flags of
        // the turn about to start ARE the answer.
        if (!perTurn && h.state.turnStartedAt && h.state.turnStartedAt !== startedBefore) {
            this.askSettings(id, h.state.turnStartedAt);
        }
        if (r.send) {
            if (perTurn) {
                this.runTurn(id, enginePromptText(h.engine.id, text.trim(), ready), ready);
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
        const wrote = this.write(id, r.line);
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
            this.endTurn(id, 'turn interrupted');
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
     */
    close(id: string): void {
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
        if (h.child) { killTree(h.child); }
        // …and the process the CLI itself registered for this session. A
        // `claude` that survives its window keeps that registry entry, which
        // tells everyone the session is open — and Claude Code cannot join a
        // session another process holds, so a survivor does not just leak, it
        // makes the conversation UNREACHABLE. Killing it by name closes that
        // gap even when the shell tree above has already fallen apart.
        // …and only for the engine that keeps such a registry. A per-turn engine
        // registers nothing between turns, so there is nobody to look up.
        const sid = h.engine.shape === 'persistent' ? h.state.sessionId : undefined;
        const pid = sid ? this.ownerPid(sid) : undefined;
        if (pid && pid !== h.child?.pid) { killPid(pid); }
        this.mutate(id, s => ({ ...s, status: 'ended', exitReason: s.exitReason ?? 'closed by you' }));
    }

    /** Forget an ended session (its transcript stays on disk). */
    forget(id: string): void {
        const h = this.sessions.get(id);
        if (!h) { return; }
        if (h.state.status !== 'ended' && h.state.status !== 'error') { this.close(id); }
        this.sessions.delete(id);
        this.fire(id);
    }

    dispose(): void {
        for (const id of [...this.sessions.keys()]) { this.close(id); }
        this.sessions.clear();
        this.listeners = [];
    }
}
