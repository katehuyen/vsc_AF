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
 *  - **A permission request is NOT a control request.** The tool simply comes
 *    back as an errored `tool_result` saying permission was never granted. So
 *    a panel cannot "answer a dialog" — there is no dialog. What it CAN do,
 *    honestly, is grant the mode and let the agent try again, which is what
 *    `PERMISSION_GRANTS` below describes and the Console offers by that name.
 *
 * Pure: builders, a parser and a reducer. No io, no vscode.
 */

import { addUsage, emptyUsage, Usage } from './pricing';

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
    /** said INTO a running turn (see acceptUserText) rather than starting one */
    steer?: boolean;
    tool?: ConsoleToolUse;
    /** tool result: did it fail? */
    isError?: boolean;
    /** the CLI refused the tool because permission was never granted */
    permission?: { detail: string; tool?: string };
    /** result rows carry the turn's own numbers */
    cost?: number;
    turns?: number;
    /** how long the turn took, and what it spent — the summary line that closes it */
    ms?: number;
    tokens?: number;
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
    /** messages you chose to HOLD back: they wait here, editable, and are handed
     *  over in order when the running turn ends (see acceptUserText) */
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
    /** token total when this turn began — the difference is what the turn spent */
    turnTokensAt?: number;
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
    lastTs: number;
    /** why it ended, when it did */
    exitReason?: string;
    /** last permission refusal still unanswered — the panel's call to action */
    pendingPermission?: { detail: string; tool?: string; ts: number };
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
            const one: Usage = {
                input: n('input_tokens'), output: n('output_tokens'),
                cacheWrite: n('cache_creation_input_tokens'), cacheRead: n('cache_read_input_tokens')
            };
            const spent = one.input + one.output + one.cacheRead + one.cacheWrite;
            if (spent) {
                // The turn keeps its own breakdown as well as the total: the
                // total is what it spent, the breakdown is what it can be
                // priced from while it is still running (see turnUsage).
                const turn = { ...(next.turnUsage ?? emptyUsage()) };
                addUsage(turn, one);
                // "ctx now" is the same figure the sessions tables show: what the
                // window held for the latest request. Taking it from the CLI's
                // occasional `thinking_tokens` event alone left the number frozen
                // at whatever the first one said, for the rest of the session.
                next = { ...next, tokens: next.tokens + spent, contextTokens: spent, turnUsage: turn };
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
        // What the turn actually cost you, closed off where it ended: the time
        // it took and the tokens it spent were both already known — they were
        // just never told. A turn is the unit you think in, so it gets a line.
        const ms = state.turnStartedAt ? Math.max(0, now - state.turnStartedAt) : undefined;
        const spent = state.turnTokensAt !== undefined
            ? Math.max(0, state.tokens - state.turnTokensAt)
            : undefined;
        const next = push({
            role: 'result',
            text: isError
                ? (sub === 'error_during_execution' ? 'turn interrupted' : `turn failed (${sub})`)
                : '',
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
                // the estimate is over: the number above is the CLI's own
                turnUsage: undefined,
                sessionId: typeof o.session_id === 'string' ? o.session_id : state.sessionId
            },
            changed: true
        };
    }

    if (type === 'control_response') {
        const r = (o.response as Record<string, unknown> | undefined) ?? {};
        const inner = (r.response as Record<string, unknown> | undefined) ?? {};
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
    /** what a RESUMED conversation already spent — see CarriedTotals */
    carried?: CarriedTotals;
}): ConsoleSessionState {
    const c = o.carried;
    return {
        id: o.id, agentId: o.agentId, agentName: o.agentName, cwd: o.cwd,
        sessionId: o.sessionId,
        model: o.model, effort: o.effort,
        permissionMode: o.permissionMode?.trim() || 'default',
        status: 'starting', messages: [], queued: [],
        costUSD: c?.costUSD ?? 0, turns: c?.turns ?? 0, tokens: c?.tokens ?? 0,
        contextTokens: c?.contextTokens || undefined,
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
    turns?: number;
    contextTokens?: number;
}

/** The carried totals of a transcript, off the index row the resume list uses. */
export function carriedTotals(s: {
    cost?: number; usage?: Usage; userTurns?: number; lastCtxTokens?: number;
}): CarriedTotals {
    const u = s.usage;
    return {
        costUSD: s.cost ?? 0,
        tokens: u ? u.input + u.output + u.cacheWrite + u.cacheRead : 0,
        turns: s.userTurns ?? 0,
        contextTokens: s.lastCtxTokens ?? 0
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
export function acceptUserText(
    state: ConsoleSessionState, text: string, now: number, hold = false
): { state: ConsoleSessionState; send: boolean } {
    const t = text.trim();
    if (!t) { return { state, send: false }; }
    if (state.status === 'working') {
        if (hold) {
            return { state: { ...state, lastTs: now, queued: [...state.queued, t] }, send: false };
        }
        // Into the running turn: the turn's own clock and totals are NOT reset,
        // because this does not start a turn — it joins one.
        return {
            state: {
                ...state, lastTs: now,
                messages: [...state.messages, { id: nextId(), ts: now, role: 'user', text: t, steer: true }]
            },
            send: true
        };
    }
    return {
        state: {
            ...state, lastTs: now, status: 'working', turnStartedAt: now, turnTokensAt: state.tokens,
            turnUsage: emptyUsage(),
            messages: [...state.messages, { id: nextId(), ts: now, role: 'user', text: t }]
        },
        send: true
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
