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
 *  - **A permission request is NOT a control request.** The tool simply comes
 *    back as an errored `tool_result` saying permission was never granted. So
 *    a panel cannot "answer a dialog" — there is no dialog. What it CAN do,
 *    honestly, is grant the mode and let the agent try again, which is what
 *    `PERMISSION_GRANTS` below describes and the Console offers by that name.
 *
 * Pure: builders, a parser and a reducer. No io, no vscode.
 */

export type ConsoleStatus = 'starting' | 'idle' | 'working' | 'ended' | 'error';

export interface ConsoleToolUse {
    id?: string;
    name: string;
    /** short human-readable argument (file path, command, query…) */
    detail: string;
    /** file the tool wrote, when it is a writing tool — powers the ✎ chips */
    file?: string;
}

export interface ConsoleMessage {
    id: string;
    role: 'user' | 'agent' | 'tool' | 'result' | 'system' | 'error';
    ts: number;
    text?: string;
    tool?: ConsoleToolUse;
    /** tool result: did it fail? */
    isError?: boolean;
    /** the CLI refused the tool because permission was never granted */
    permission?: { detail: string; tool?: string };
    /** result rows carry the turn's own numbers */
    cost?: number;
    turns?: number;
}

export interface ConsoleSessionState {
    /** Agent Farm's own id for the hosted process */
    id: string;
    agentId: string;
    agentName: string;
    cwd: string;
    /** claude's session id — known up-front on a resume, otherwise once system:init arrives */
    sessionId?: string;
    model?: string;
    effort?: string;
    permissionMode: string;
    status: ConsoleStatus;
    messages: ConsoleMessage[];
    /** messages typed while a turn was running, sent in order afterwards */
    queued: string[];
    costUSD: number;
    turns: number;
    /** everything this session has spent tokens on, summed off the assistant
     *  messages' own usage — the same total the sessions tables show */
    tokens: number;
    /** what the model window held for the latest request — read off each
     *  assistant message's own usage, the same arithmetic the sessions tables
     *  do (the CLI's `system:thinking_tokens` event refines it when it comes) */
    contextTokens?: number;
    startedAt: number;
    /** when the turn that is running now started. A conversation surface has to
     *  say "still working" out loud — silence between your message and the
     *  reply is indistinguishable from a session that has died — and the honest
     *  way to say it is to count from the moment the turn really began. */
    turnStartedAt?: number;
    lastTs: number;
    /** why it ended, when it did */
    exitReason?: string;
    /** last permission refusal still unanswered — the panel's call to action */
    pendingPermission?: { detail: string; tool?: string; ts: number };
}

/** The honest set of things a panel button can actually grant, live. */
export const PERMISSION_GRANTS: { mode: string; label: string; detail: string }[] = [
    {
        mode: 'acceptEdits', label: 'Allow file edits',
        detail: 'file writes are auto-approved from now on; everything else still asks'
    },
    {
        mode: 'auto', label: 'Let it decide',
        detail: 'the CLI approves what it considers safe to run unattended'
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

/** CLI args for a hosted session (the flags are launch.ts's vocabulary). */
export function hostArgs(o: {
    model?: string; effort?: string; permissionMode?: string; resume?: string;
}): string[] {
    const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose'];
    if (o.resume) { args.push('--resume', o.resume); }
    if (o.model?.trim()) { args.push('--model', o.model.trim()); }
    if (o.effort?.trim()) { args.push('--effort', o.effort.trim()); }
    if (o.permissionMode?.trim()) { args.push('--permission-mode', o.permissionMode.trim()); }
    return args;
}

/** A user turn, as the stream expects it. */
export function userMessageLine(text: string): string {
    return JSON.stringify({
        type: 'user',
        message: { role: 'user', content: [{ type: 'text', text }] }
    }) + '\n';
}

/** A control request (interrupt / set_permission_mode). */
export function controlLine(requestId: string, subtype: string, extra: Record<string, unknown> = {}): string {
    return JSON.stringify({
        type: 'control_request',
        request_id: requestId,
        request: { subtype, ...extra }
    }) + '\n';
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

    if (type === 'system') {
        const sub = String(o.subtype ?? '');
        if (sub === 'init') {
            return {
                state: {
                    ...state,
                    sessionId: typeof o.session_id === 'string' ? o.session_id : state.sessionId,
                    model: typeof o.model === 'string' ? o.model : state.model,
                    permissionMode: typeof o.permissionMode === 'string' ? o.permissionMode : state.permissionMode,
                    status: state.status === 'starting' ? 'idle' : state.status,
                    lastTs: now
                },
                changed: true
            };
        }
        if (sub === 'thinking_tokens' && typeof o.estimated_tokens === 'number') {
            return { state: { ...state, contextTokens: o.estimated_tokens, lastTs: now }, changed: true };
        }
        return { state, changed: false };   // hook lifecycle & friends
    }

    if (type === 'assistant') {
        const msg = o.message as { content?: unknown; usage?: Record<string, unknown> } | undefined;
        const blocks = Array.isArray(msg?.content) ? msg!.content as Record<string, unknown>[] : [];
        let next = state;
        let changed = false;
        // Tokens are counted off each assistant message's own usage — the same
        // arithmetic the index does on a transcript, so the number on a Console
        // row and the number in the sessions table mean the same thing. (The
        // result line's usage is the TURN's, and would double-count.)
        const u = msg?.usage;
        if (u) {
            const n = (k: string) => (typeof u[k] === 'number' ? u[k] as number : 0);
            const spent = n('input_tokens') + n('output_tokens')
                + n('cache_read_input_tokens') + n('cache_creation_input_tokens');
            if (spent) {
                // "ctx now" is the same figure the sessions tables show: what the
                // window held for the latest request. Taking it from the CLI's
                // occasional `thinking_tokens` event alone left the number frozen
                // at whatever the first one said, for the rest of the session.
                next = { ...next, tokens: next.tokens + spent, contextTokens: spent };
                changed = true;
            }
        }
        for (const b of blocks) {
            const bt = String(b.type ?? '');
            if (bt === 'text' && String(b.text ?? '').trim()) {
                next = { ...next, messages: [...next.messages, { id: nextId(), ts: now, role: 'agent', text: String(b.text) }], lastTs: now };
                changed = true;
            } else if (bt === 'tool_use' && b.name) {
                const name = String(b.name);
                const input = b.input as Record<string, unknown> | undefined;
                const file = WRITE_TOOLS.has(name)
                    ? String(input?.['file_path'] ?? input?.['notebook_path'] ?? '') || undefined
                    : undefined;
                next = {
                    ...next, lastTs: now,
                    messages: [...next.messages, {
                        id: nextId(), ts: now, role: 'tool',
                        tool: { id: typeof b.id === 'string' ? b.id : undefined, name, detail: shortArg(name, input), file }
                    }]
                };
                changed = true;
            }
            // 'thinking' blocks are deliberately not rendered
        }
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
        const next = push({
            role: 'result',
            text: isError
                ? (sub === 'error_during_execution' ? 'turn interrupted' : `turn failed (${sub})`)
                : '',
            isError,
            cost,
            turns: typeof o.num_turns === 'number' ? o.num_turns : undefined
        });
        return {
            state: {
                ...next,
                status: 'idle',
                costUSD: Math.round((state.costUSD + cost) * 10000) / 10000,
                turns: state.turns + 1,
                sessionId: typeof o.session_id === 'string' ? o.session_id : state.sessionId
            },
            changed: true
        };
    }

    if (type === 'control_response') {
        const r = (o.response as Record<string, unknown> | undefined) ?? {};
        const inner = (r.response as Record<string, unknown> | undefined) ?? {};
        if (typeof inner.mode === 'string') {
            // the live permission-mode change was accepted
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
    sessionId?: string;
}): ConsoleSessionState {
    return {
        id: o.id, agentId: o.agentId, agentName: o.agentName, cwd: o.cwd,
        sessionId: o.sessionId,
        model: o.model, effort: o.effort,
        permissionMode: o.permissionMode?.trim() || 'default',
        status: 'starting', messages: [], queued: [],
        costUSD: 0, turns: 0, tokens: 0, startedAt: o.now, lastTs: o.now
    };
}

/**
 * Add a user turn: sent now, or queued when a turn is already in flight.
 *
 * `starting` counts as sendable, and that is not a detail — **the CLI emits
 * nothing at all until its first stdin line arrives** (measured: no
 * `system:init`, no hook events, silence). Queueing the first message until
 * the session "looks ready" therefore deadlocks: the panel waits for an init
 * that only the message can trigger. The pipe is open the moment the process
 * exists, so the first message goes straight out.
 *
 * **A queued message does not join the conversation yet.** It is waiting, not
 * said: writing it into the transcript the moment it was typed put it *above*
 * the reply it was actually asked after, and pushed the running turn up the
 * page as if the agent had already heard it. A terminal does not do that —
 * what you type while something runs sits on the line until it is sent. So the
 * text lives in `queued` (the composer shows it, and it can still be cleared)
 * and becomes a message when `shiftQueued` really hands it over.
 */
export function acceptUserText(
    state: ConsoleSessionState, text: string, now: number
): { state: ConsoleSessionState; send: boolean } {
    const t = text.trim();
    if (!t) { return { state, send: false }; }
    if (state.status === 'working') {
        return { state: { ...state, lastTs: now, queued: [...state.queued, t] }, send: false };
    }
    return {
        state: {
            ...state, lastTs: now, status: 'working', turnStartedAt: now,
            messages: [...state.messages, { id: nextId(), ts: now, role: 'user', text: t }]
        },
        send: true
    };
}

/**
 * Pull the next queued message once a turn finishes — and only NOW does it
 * become part of the conversation (see acceptUserText).
 */
export function shiftQueued(
    state: ConsoleSessionState, now = Date.now()
): { state: ConsoleSessionState; text?: string } {
    if (state.status !== 'idle' || !state.queued.length) { return { state }; }
    const [next, ...rest] = state.queued;
    return {
        state: {
            ...state, queued: rest, status: 'working', lastTs: now, turnStartedAt: now,
            messages: [...state.messages, { id: nextId(), ts: now, role: 'user', text: next }]
        },
        text: next
    };
}
