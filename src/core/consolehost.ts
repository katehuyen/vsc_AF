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
import * as fs from 'fs';
import * as path from 'path';
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

export interface HostedSessionInit {
    agentId: string;
    agentName: string;
    cwd: string;
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
    child: cp.ChildProcess;
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

    /** Start a hosted session. Returns our id; the CLI's own id arrives later. */
    start(init: HostedSessionInit): string {
        const id = `cs${++this.seq}-${Date.now().toString(36)}`;
        const projectId = init.projectId ?? this.activeProjectId();
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
            child, buffer: '', reqSeq: 0
        };
        this.sessions.set(id, hosted);

        child.stdout?.on('data', d => this.onData(id, String(d)));
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

    private write(id: string, line: string): boolean {
        const h = this.sessions.get(id);
        if (!h || h.closed) { return false; }
        if (!h.child.stdin || h.child.stdin.destroyed) { return false; }
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
        const r = acceptUserText(h.state, text, Date.now(), hold, notes);
        h.state = r.state;
        // A NEW turn (not a message said into a running one) asks what it is
        // about to run on, and asks it BEFORE the prompt goes down the pipe —
        // the CLI is idle at that moment, so the answer comes straight back
        // (see askSettings).
        if (h.state.turnStartedAt && h.state.turnStartedAt !== startedBefore) {
            this.askSettings(id, h.state.turnStartedAt);
        }
        if (r.send) { this.write(id, userMessageLine(text.trim(), ready)); }
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
        try { h.child.stdout?.removeAllListeners('data'); h.child.stdout?.destroy(); } catch { /* already gone */ }
        try { h.child.stderr?.removeAllListeners('data'); h.child.stderr?.destroy(); } catch { /* already gone */ }
        try { h.child.stdin?.end(); } catch { /* already gone */ }
        killTree(h.child);
        // …and the process the CLI itself registered for this session. A
        // `claude` that survives its window keeps that registry entry, which
        // tells everyone the session is open — and Claude Code cannot join a
        // session another process holds, so a survivor does not just leak, it
        // makes the conversation UNREACHABLE. Killing it by name closes that
        // gap even when the shell tree above has already fallen apart.
        const sid = h.state.sessionId;
        const pid = sid ? this.ownerPid(sid) : undefined;
        if (pid && pid !== h.child.pid) { killPid(pid); }
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
