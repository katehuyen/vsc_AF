/**
 * K-25 — ONE `opencode acp` PROCESS FOR THE WHOLE EXTENSION.
 *
 * ‼️ THE THIRD SHAPE, AND IT IS NOT A VARIANT OF THE OTHER TWO. Claude Code is
 * one process per SESSION; `codex exec` is one process per TURN. OpenCode over
 * ACP is one process for the whole EXTENSION, multiplexing every hosted card by
 * `sessionId` — and that is a measured decision, not a preference: an idle
 * `opencode acp` holds ~383 MB working set (596 MB private) on this machine, so
 * a process per card turns five open conversations into two gigabytes of nothing
 * happening. `EngineShape: 'sharedAcp'` is what that costs in the type system.
 *
 * What this class owns: the process, the JSON-RPC framing and correlation, the
 * requests the AGENT makes of US (permission, file read, file write), and coming
 * back from a crash. What it deliberately does NOT own: the vocabulary
 * (`core/opencode.ts` — frozen against the real binary in A-16), the translation
 * (`core/opencodeproto.ts`), or anything a card decides (`core/consolehost.ts`).
 *
 * ‼️ THREE THINGS HERE WILL HANG A TURN FOR EVER IF THEY ARE GOT WRONG, and none
 * of them fails loudly:
 *
 *  1. **AN AGENT REQUEST THAT IS NEVER ANSWERED.** `session/request_permission`,
 *     `fs/read_text_file` and `fs/write_text_file` arrive as JSON-RPC REQUESTS
 *     with an id, and the agent blocks on the reply. The probe that measured this
 *     engine had to answer them before a single turn would finish.
 *  2. **`String(chunk)` INSTEAD OF A `StringDecoder`.** A chunk boundary is not a
 *     character boundary, and a Turkish reply splits a two-byte `ü` often enough
 *     to see. `test_opencode.js` already proves the failure at every byte split;
 *     this is where it would happen for real.
 *  3. **A SECOND WRITER ON ONE CONVERSATION.** If the shared process dies, every
 *     live card is reloaded with `session/load` — and only after the old process
 *     is actually gone. Opening a conversation twice is what the engine's own
 *     `session list` treats as risky, and this codebase has already paid for the
 *     Codex version of that mistake (`thread-store conflict`).
 *
 * Pure over an injected spawner and injected file readers, so the whole lifecycle
 * — handshake, turn, cancel, crash, reload — is testable without a binary.
 */

import { StringDecoder } from 'string_decoder';
import {
    OPENCODE_ACP_PROTOCOL, OpencodeCapabilities, OpencodeConfigOption,
    opencodeAcpArgs, opencodeCapabilities, opencodeCapabilityRefusal, opencodeConfigOptions,
    opencodeInitializeParams, opencodeSetConfigParams
} from './opencode';

/** The process, as this runtime needs it — a handle, not a `ChildProcess`. */
export interface AcpChild {
    write(text: string): boolean;
    /** stop this process and everything under it */
    kill(): void;
    pid?: number;
    onStdout(fn: (chunk: Buffer | string) => void): void;
    onStderr(fn: (chunk: Buffer | string) => void): void;
    onExit(fn: (code: number | null) => void): void;
}

/** How one gets started. `cwd` is only the process's own working folder — every
 *  session declares its own, which is what lets one process serve two agents in
 *  two different folders (K-25's first acceptance line). */
export type AcpSpawner = (cwd: string) => AcpChild;

/**
 * The agent asking whether it may do something.
 *
 * ‼️ SPEC-DERIVED, NOT MEASURED — and said out loud rather than left to be
 * discovered. Across every probe turn in A-16 the agent ran `read`, `glob` and
 * `list` without asking once, so this frame has never crossed a wire this
 * codebase has recorded. The field names are ACP v1's; the acceptance run for
 * K-25 is what turns this comment into a measurement, and until it does, nothing
 * here may claim otherwise.
 */
export interface OpencodePermissionRequest {
    /**
     * ‼️ THE RUNTIME'S OWN HANDLE, NOT THE RAW JSON-RPC ID. A JSON-RPC id is a
     * number here and `ConsoleAsk.requestId` is a string that also has to survive
     * a round trip through a webview; `ocp-<n>` is both, and it keeps the wire id
     * inside this file where the reply is written.
     */
    requestId: string;
    sessionId: string;
    /** what is being asked about — the same shape a `tool_call` update carries */
    toolCall: Record<string, unknown>;
    options: { optionId: string; name: string; kind: string }[];
}

/** What a hosted card wants to hear about. Every one is optional-safe: a handler
 *  that throws must not take the shared process down with it. */
export interface OpencodeCardHandlers {
    /** one `session/update` notification's `update` object */
    update(update: Record<string, unknown>): void;
    /** the agent is waiting for a yes or a no (see OpencodePermissionRequest) */
    permission(request: OpencodePermissionRequest): void;
    /**
     * The shared process died and this card was picked up again — or could not
     * be. `ok: false` means the conversation is still on disk but this window has
     * lost its handle on it, which is a thing to SAY rather than a card that
     * quietly stops answering.
     */
    reloaded(ok: boolean, why?: string): void;
    /** a diagnostic worth putting in front of the reader (stderr, an unknown
     *  frame) — never used for anything the conversation depends on */
    note?(text: string): void;
}

/** Everything from outside this module. Injected so the runtime is testable, and
 *  because the client's own `fs` capability is a PROMISE to the agent: we told it
 *  at `initialize` that we would read and write files for it. */
export interface OpencodeRuntimeIo {
    spawn: AcpSpawner;
    readTextFile?(path: string): string;
    writeTextFile?(path: string, content: string): void;
    now?(): number;
}

/** How long a request waits before it is given up on. A handshake that never
 *  answers is a binary that is not going to, and a card waiting for ever is the
 *  one outcome worse than an error message. */
export const ACP_REQUEST_TIMEOUT_MS = 120_000;
/** …except a prompt, which is a turn and may legitimately run for a long time.
 *  Nothing times a turn out; it ends when the engine says so or when the user
 *  cancels it. */
export const ACP_PROMPT_TIMEOUT_MS = 0;

/** What the runtime is doing, for a surface that wants to say. */
export type AcpPhase = 'stopped' | 'starting' | 'ready' | 'refused' | 'failed';

interface Pending {
    resolve(v: unknown): void;
    reject(e: Error): void;
    timer?: ReturnType<typeof setTimeout>;
    method: string;
}

interface Card {
    handlers: OpencodeCardHandlers;
    /** the folder this conversation belongs to — needed to load it again after a
     *  crash, because `session/load` takes a cwd of its own */
    cwd: string;
}

/**
 * ‼️ WHY A CLASS AND NOT A FUNCTION. The state that has to survive between
 * frames is the correlation map, and the state that has to survive a CRASH is
 * the set of live cards. Both are the runtime's, both are singular per
 * extension, and every existing engine adaptor keeps its state in the host
 * instead — which is exactly what cannot be done here, because the process is
 * shared by cards the host holds separately.
 */
export class OpencodeRuntime {
    private child?: AcpChild;
    private decoder = new StringDecoder('utf8');
    private buffer = '';
    private seq = 0;
    private pending = new Map<number, Pending>();
    private cards = new Map<string, Card>();
    /** the permission requests the agent is blocked on, by their JSON-RPC id */
    private asks = new Map<string, { sessionId: string; id: string | number }>();
    private handshake?: Promise<OpencodeCapabilities>;
    private caps?: OpencodeCapabilities;
    private refusal = '';
    private phase: AcpPhase = 'stopped';
    private stderr = '';
    /** a restart already under way — a second crash notification must not start
     *  a second process */
    private restarting = false;
    private disposed = false;

    constructor(private io: OpencodeRuntimeIo) {}

    // -----------------------------------------------------------------------
    // What a surface can ask about the runtime itself
    // -----------------------------------------------------------------------

    get state(): AcpPhase { return this.phase; }
    get pid(): number | undefined { return this.child?.pid; }
    get capabilities(): OpencodeCapabilities | undefined { return this.caps; }
    /** '' when this build can be driven; otherwise the sentence to refuse with
     *  (`opencodeCapabilityRefusal`, which names the missing capability). */
    get capabilityRefusal(): string { return this.refusal; }
    /** how many cards this one process is carrying — the figure that justifies
     *  the whole shape */
    get cardCount(): number { return this.cards.size; }

    // -----------------------------------------------------------------------
    // The lifecycle
    // -----------------------------------------------------------------------

    /**
     * Start the process and shake hands, once. Every entry point awaits this;
     * concurrent callers share the one promise, because two cards opened in the
     * same tick must not spawn two processes.
     */
    async ready(cwd: string): Promise<OpencodeCapabilities> {
        if (this.disposed) { throw new Error('The OpenCode runtime has been shut down.'); }
        if (this.handshake) { return this.handshake; }
        this.handshake = this.start(cwd);
        try { return await this.handshake; } catch (e) { this.handshake = undefined; throw e; }
    }

    private async start(cwd: string): Promise<OpencodeCapabilities> {
        this.phase = 'starting';
        this.stderr = '';
        const child = this.io.spawn(cwd);
        this.child = child;
        this.decoder = new StringDecoder('utf8');
        this.buffer = '';
        child.onStdout(chunk => this.onData(
            typeof chunk === 'string' ? chunk : this.decoder.write(chunk)));
        child.onStderr(chunk => {
            // ‼️ STDERR IS DIAGNOSIS AND NOTHING ELSE ON THIS TRANSPORT. The one
            // measured trap in A-16 — `id` instead of `configId` — put its whole
            // explanation here and nowhere else, so it is kept and shown rather
            // than dropped; but nothing the conversation depends on is read out
            // of it.
            this.stderr = (this.stderr + String(chunk)).slice(-4000);
        });
        child.onExit(code => this.onExit(code));

        const result = await this.request('initialize', opencodeInitializeParams());
        const caps = opencodeCapabilities(result);
        this.caps = caps;
        this.refusal = opencodeCapabilityRefusal(caps);
        if (this.refusal) {
            // ‼️ REFUSED BY NAME, AND THE PROCESS GOES. A build that cannot be
            // driven is not left running at 383 MB in case somebody tries again.
            this.phase = 'refused';
            this.stop();
            throw new Error(this.refusal);
        }
        this.phase = 'ready';
        return caps;
    }

    /**
     * ‼️ THE CRASH PATH, AND THE REASON IT IS NOT A `restart()` CALL FROM THE
     * HOST.
     *
     * Everything waiting is rejected first — a promise left pending across a
     * restart is a card stuck on `working` for ever — and only THEN is a new
     * process started, because the old one has to be gone before any card is
     * loaded again. Loading a conversation whose previous writer is still alive
     * is the second-writer failure this file's header names.
     */
    private onExit(code: number | null): void {
        const said = this.stderr.split(/\r?\n/).filter(l => l.trim()).slice(-1)[0] ?? '';
        const why = `the shared OpenCode process stopped${code === null ? '' : ` (exit ${code})`}`
            + (said ? ` — ${said.trim().slice(0, 300)}` : '');
        this.child = undefined;
        this.handshake = undefined;
        for (const [, p] of this.pending) {
            if (p.timer) { clearTimeout(p.timer); }
            p.reject(new Error(why));
        }
        this.pending.clear();
        this.asks.clear();
        // ‼️ "REFUSED" IS STICKY AND "STOPPED" IS NOT A REPLACEMENT FOR IT. A
        // build this integration cannot drive is a state a surface has to be able
        // to report; overwriting it with the ordinary "the process is not running"
        // would leave the user reading a shrug where there was a named reason.
        if (this.phase === 'refused') { return; }
        if (this.disposed) { this.phase = 'stopped'; return; }
        this.phase = 'failed';
        if (!this.cards.size || this.restarting) { return; }
        this.restarting = true;
        // A tick, so the caller that is unwinding a rejected promise finishes
        // before the reload begins — and so a process that dies during its own
        // start does not recurse.
        setTimeout(() => { void this.recover(why); }, 0);
    }

    /** Bring the process back and put every live card back on it. */
    private async recover(why: string): Promise<void> {
        const cards = [...this.cards.entries()];
        try {
            await this.ready(cards[0]?.[1].cwd ?? process.cwd());
        } catch (e) {
            this.restarting = false;
            for (const [, card] of cards) {
                safely(() => card.handlers.reloaded(false, `${why}, and it could not be started again: ${String((e as Error).message ?? e)}`));
            }
            return;
        }
        this.restarting = false;
        for (const [sessionId, card] of cards) {
            // Still here? A card ended while the process was down is not reloaded.
            if (!this.cards.has(sessionId)) { continue; }
            try {
                await this.request('session/load', { sessionId, cwd: card.cwd, mcpServers: [] });
                safely(() => card.handlers.reloaded(true, why));
            } catch (e) {
                safely(() => card.handlers.reloaded(
                    false, `${why}, and this conversation could not be re-opened: ${String((e as Error).message ?? e)}`));
            }
        }
    }

    /**
     * ‼️ THE FORCED FALLBACK, AND IT IS THE LAST RESORT BY CONSTRUCTION.
     *
     * `session/cancel` is cooperative and measured to work (`stopReason:
     * "cancelled"`, usage zero, the conversation intact). Killing the process
     * instead ends every OTHER card's turn as well, which is why nothing here
     * calls it on a whim — `ConsoleHost.interrupt` reaches it only after the
     * cooperative cancel has been given its measured chance and did not settle.
     * The cards that were carried come back through `recover`.
     */
    restart(): void {
        const child = this.child;
        this.child = undefined;
        this.handshake = undefined;
        if (!child) { return; }
        try { child.kill(); } catch { /* already gone */ }
    }

    /** Stop the process. Used when the last card goes and on dispose: 383 MB
     *  serving nobody is not a cache, it is a leak with a good excuse. */
    private stop(): void {
        const child = this.child;
        this.child = undefined;
        this.handshake = undefined;
        for (const [, p] of this.pending) {
            if (p.timer) { clearTimeout(p.timer); }
            p.reject(new Error('the OpenCode runtime was stopped'));
        }
        this.pending.clear();
        this.asks.clear();
        if (!child) { return; }
        try { child.kill(); } catch { /* already gone */ }
    }

    dispose(): void {
        this.disposed = true;
        this.cards.clear();
        this.phase = 'stopped';
        this.stop();
    }

    // -----------------------------------------------------------------------
    // Cards
    // -----------------------------------------------------------------------

    attach(sessionId: string, cwd: string, handlers: OpencodeCardHandlers): void {
        if (!sessionId) { return; }
        this.cards.set(sessionId, { handlers, cwd });
    }

    /**
     * A card is finished with this conversation.
     *
     * ‼️ THE PROCESS SURVIVES UNLESS IT IS THE LAST ONE. That asymmetry is the
     * whole point of a shared runtime: ending one card must not interrupt the
     * turn another card is in the middle of. When the last card goes the process
     * does too — see `stop`.
     */
    detach(sessionId: string): void {
        if (!this.cards.delete(sessionId)) { return; }
        // Tell the agent as well, when it offers a way to say so. `close` was
        // measured as a declared capability; a build without it simply keeps the
        // conversation open on its side, which costs nothing.
        if (this.child && this.caps?.sessionClose) {
            this.notify('session/close', { sessionId });
        }
        if (!this.cards.size) { this.stop(); }
    }

    // -----------------------------------------------------------------------
    // The five things a card does
    // -----------------------------------------------------------------------

    /** Start a NEW conversation in this folder. Returns the engine's own id and
     *  the config options it volunteers (model list included — see
     *  `opencodeModelsFrom`, which is why nothing shells out for a catalogue). */
    async newSession(cwd: string): Promise<{ sessionId: string; options: OpencodeConfigOption[] }> {
        await this.ready(cwd);
        const result = await this.request('session/new', { cwd, mcpServers: [] });
        const sessionId = String((result as Record<string, unknown>)?.sessionId ?? '');
        if (!sessionId) { throw new Error('OpenCode started a session without naming it — there is nothing to hold on to.'); }
        return { sessionId, options: opencodeConfigOptions(result) };
    }

    /** Re-open an EXISTING conversation. Measured: the history is replayed as
     *  ordinary `session/update` frames before the result arrives, which is why
     *  the translator has a `replaying` flag (see `opencodeproto.ts`). */
    async loadSession(sessionId: string, cwd: string): Promise<OpencodeConfigOption[]> {
        await this.ready(cwd);
        const result = await this.request('session/load', { sessionId, cwd, mcpServers: [] });
        return opencodeConfigOptions(result);
    }

    /** ‼️ `configId`, NOT `id` — the params are built by the one function that
     *  knows (A-16, trap 2), so this call site cannot get it wrong. */
    async setConfig(sessionId: string, configId: string, value: string): Promise<OpencodeConfigOption[]> {
        const result = await this.request(
            'session/set_config_option', opencodeSetConfigParams(sessionId, configId, value));
        return opencodeConfigOptions(result);
    }

    /** One turn. Resolves with the prompt result (`stopReason` + `usage`) — the
     *  events come out of `session/update` on the way. */
    async prompt(sessionId: string, blocks: unknown[]): Promise<Record<string, unknown>> {
        const result = await this.request(
            'session/prompt', { sessionId, prompt: blocks }, ACP_PROMPT_TIMEOUT_MS);
        return (result as Record<string, unknown>) ?? {};
    }

    /** Stop the running turn, the engine's own way. A NOTIFICATION: there is no
     *  reply, and the answer is the prompt promise settling as `cancelled`. */
    cancel(sessionId: string): boolean {
        return this.notify('session/cancel', { sessionId });
    }

    /**
     * Answer a permission request the agent is blocked on.
     *
     * `optionId` empty = the user said no in a way the protocol has no option
     * for (the session was closed, the turn was interrupted): `cancelled` is the
     * outcome ACP defines for exactly that, and it un-parks the agent without
     * pretending a choice was made.
     */
    answerPermission(requestId: string, optionId?: string): boolean {
        const ask = this.asks.get(requestId);
        if (!ask) { return false; }
        this.asks.delete(requestId);
        return this.reply(ask.id, optionId
            ? { outcome: { outcome: 'selected', optionId } }
            : { outcome: { outcome: 'cancelled' } });
    }

    /** Is this permission request still open? A panel that repainted must not
     *  answer a request the agent has already taken back. */
    hasAsk(requestId: string): boolean { return this.asks.has(requestId); }

    // -----------------------------------------------------------------------
    // JSON-RPC
    // -----------------------------------------------------------------------

    private request(
        method: string, params: unknown, timeoutMs = ACP_REQUEST_TIMEOUT_MS
    ): Promise<unknown> {
        const id = ++this.seq;
        return new Promise<unknown>((resolve, reject) => {
            if (!this.child) { reject(new Error('the OpenCode runtime is not running')); return; }
            const entry: Pending = { resolve, reject, method };
            if (timeoutMs > 0) {
                entry.timer = setTimeout(() => {
                    this.pending.delete(id);
                    reject(new Error(`OpenCode did not answer ${method} within ${Math.round(timeoutMs / 1000)}s`));
                }, timeoutMs);
            }
            this.pending.set(id, entry);
            if (!this.send({ jsonrpc: '2.0', id, method, params })) {
                this.pending.delete(id);
                if (entry.timer) { clearTimeout(entry.timer); }
                reject(new Error(`${method} could not be written to the OpenCode runtime`));
            }
        });
    }

    private notify(method: string, params: unknown): boolean {
        return this.send({ jsonrpc: '2.0', method, params });
    }

    private reply(id: string | number, result: unknown): boolean {
        return this.send({ jsonrpc: '2.0', id, result });
    }

    private replyError(id: string | number, code: number, message: string): boolean {
        return this.send({ jsonrpc: '2.0', id, error: { code, message } });
    }

    private send(frame: unknown): boolean {
        if (!this.child) { return false; }
        try { return this.child.write(JSON.stringify(frame) + '\n'); } catch { return false; }
    }

    /**
     * ‼️ LINE FRAMING OVER A STATEFUL DECODER — both halves matter and only one
     * of them is obvious. The decoder holds an incomplete multi-byte character
     * back until the next chunk completes it (`test_opencode.js` proves the
     * failure at every byte split of a Turkish line); the buffer holds an
     * incomplete LINE back for the same reason one level up.
     */
    private onData(chunk: string): void {
        this.buffer += chunk;
        const lines = this.buffer.split('\n');
        this.buffer = lines.pop() ?? '';
        for (const line of lines) {
            const text = line.trim();
            if (!text) { continue; }
            let frame: Record<string, unknown>;
            try { frame = JSON.parse(text) as Record<string, unknown>; } catch { continue; }
            this.onFrame(frame);
        }
    }

    private onFrame(frame: Record<string, unknown>): void {
        const id = frame.id;
        // A RESPONSE to something we asked.
        if (id !== undefined && (frame.result !== undefined || frame.error !== undefined)) {
            const entry = this.pending.get(Number(id));
            if (!entry) { return; }
            this.pending.delete(Number(id));
            if (entry.timer) { clearTimeout(entry.timer); }
            if (frame.error !== undefined) {
                const err = frame.error as Record<string, unknown> | undefined;
                // ‼️ THE ENGINE'S OWN WORDS, INCLUDING THE ZOD DETAIL. That detail
                // is what named `configId` when `id` was refused, and a tidied
                // "invalid params" would have thrown the one useful fact away.
                const detail = err?.data ? ` — ${JSON.stringify(err.data).slice(0, 300)}` : '';
                entry.reject(new Error(`${entry.method}: ${String(err?.message ?? 'refused')}${detail}`));
            } else {
                entry.resolve(frame.result);
            }
            return;
        }
        const method = String(frame.method ?? '');
        if (!method) { return; }
        // A NOTIFICATION from the agent.
        if (id === undefined) {
            if (method === 'session/update') { this.onUpdate(frame.params); }
            return;
        }
        // A REQUEST from the agent — it is BLOCKED until this is answered.
        this.onAgentRequest(id as string | number, method, frame.params);
    }

    private onUpdate(params: unknown): void {
        const p = (params ?? {}) as Record<string, unknown>;
        const sessionId = String(p.sessionId ?? '');
        const card = this.cards.get(sessionId);
        if (!card) { return; }
        const update = (p.update ?? {}) as Record<string, unknown>;
        safely(() => card.handlers.update(update));
    }

    private onAgentRequest(id: string | number, method: string, params: unknown): void {
        const p = (params ?? {}) as Record<string, unknown>;
        if (method === 'session/request_permission') {
            const sessionId = String(p.sessionId ?? '');
            const card = this.cards.get(sessionId);
            if (!card) {
                // Nobody to ask. `cancelled` un-parks the agent honestly; a
                // silent "allow" would run a tool on behalf of a window that is
                // not there any more.
                this.reply(id, { outcome: { outcome: 'cancelled' } });
                return;
            }
            const requestId = `ocp-${String(id)}`;
            this.asks.set(requestId, { sessionId, id });
            const options = (Array.isArray(p.options) ? p.options : []).map(o => {
                const row = (o ?? {}) as Record<string, unknown>;
                return {
                    optionId: String(row.optionId ?? ''),
                    name: String(row.name ?? ''),
                    kind: String(row.kind ?? '')
                };
            }).filter(o => o.optionId);
            safely(() => card.handlers.permission({
                requestId, sessionId,
                toolCall: (p.toolCall ?? {}) as Record<string, unknown>,
                options
            }));
            return;
        }
        // ‼️ WE PROMISED THESE AT `initialize` (`clientCapabilities.fs`), so they
        // are answered here or the agent waits for ever. An unreadable file is
        // answered as an ERROR rather than as empty content: an agent told a file
        // is empty rewrites it, and an agent told it could not be read does not.
        if (method === 'fs/read_text_file') {
            const path = String(p.path ?? '');
            try {
                const whole = this.io.readTextFile
                    ? this.io.readTextFile(path)
                    : (() => { throw new Error('this host cannot read files for the agent'); })();
                this.reply(id, { content: sliceLines(whole, p.line, p.limit) });
            } catch (e) {
                this.replyError(id, -32000, `${path}: ${String((e as Error).message ?? e)}`);
            }
            return;
        }
        if (method === 'fs/write_text_file') {
            const path = String(p.path ?? '');
            try {
                if (!this.io.writeTextFile) { throw new Error('this host cannot write files for the agent'); }
                this.io.writeTextFile(path, String(p.content ?? ''));
                this.reply(id, null);
            } catch (e) {
                this.replyError(id, -32000, `${path}: ${String((e as Error).message ?? e)}`);
            }
            return;
        }
        // ‼️ AN UNKNOWN REQUEST IS REFUSED, NOT IGNORED AND NOT ACCEPTED. Ignored
        // hangs the turn; `null` would tell the agent a thing it asked for was
        // done. -32601 is the protocol's own word for "this client does not have
        // that", which is both true and actionable.
        this.replyError(id, -32601, `Agent Farm does not implement ${method}`);
        const first = [...this.cards.values()][0];
        if (first?.handlers.note) {
            safely(() => first.handlers.note?.(`OpenCode asked for ${method}, which this build does not answer.`));
        }
    }
}

/**
 * ACP's `fs/read_text_file` takes an optional 1-based `line` and a `limit`.
 * Honoured rather than ignored: an agent that asked for 50 lines of a 200 000
 * line file and was handed the whole thing has just spent its window on a
 * request it deliberately made small.
 */
export function sliceLines(text: string, line: unknown, limit: unknown): string {
    const from = typeof line === 'number' && line > 0 ? Math.floor(line) : 1;
    const count = typeof limit === 'number' && limit > 0 ? Math.floor(limit) : 0;
    if (from === 1 && !count) { return text; }
    const lines = text.split(/\r?\n/);
    return lines.slice(from - 1, count ? from - 1 + count : undefined).join('\n');
}

/** A handler belongs to a card and a card belongs to a panel; neither may take
 *  the process every OTHER card is using down with it. */
function safely(fn: () => void): void {
    try { fn(); } catch { /* one card's failure is not the runtime's */ }
}

/**
 * The blocks one turn's prompt is made of.
 *
 * ‼️ THE IMAGE BLOCK IS SPEC-DERIVED AND THE CAPABILITY IS MEASURED — two
 * different confidences, kept apart. `promptCapabilities.image: true` came off
 * the real handshake; the block's own field names (`mimeType`, `data`) are ACP
 * v1's and have not been exercised against this binary. If it is refused, the
 * refusal carries the engine's own words (see `onFrame`) rather than a silent
 * drop, which is what makes the acceptance run able to settle it.
 */
export function opencodePromptBlocks(
    text: string, images: { mediaType?: string; data?: string }[] = []
): unknown[] {
    const blocks: unknown[] = [];
    for (const img of images) {
        if (!img.data) { continue; }
        blocks.push({ type: 'image', mimeType: img.mediaType || 'image/png', data: img.data });
    }
    const body = String(text ?? '');
    if (body.trim() || !blocks.length) { blocks.push({ type: 'text', text: body }); }
    return blocks;
}

/** The protocol revision this runtime speaks, re-exported so a surface can state
 *  it without importing the contract file for one number. */
export const OPENCODE_RUNTIME_PROTOCOL = OPENCODE_ACP_PROTOCOL;

/** The argv the process is started with — one place, so a caller cannot invent
 *  a second spelling of `opencode acp`. */
export const opencodeRuntimeArgs = opencodeAcpArgs;
